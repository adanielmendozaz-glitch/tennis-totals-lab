import {
  normalizeName
} from '../data/history.js';

const PLACEHOLDERS =
  new Set([
    '',
    'tbd',
    'unknown',
    'qualifier',
    'bye',
    'to be determined'
  ]);

function tokens(value) {
  const normalized =
    normalizeName(value);

  return normalized
    ? normalized.split(' ')
    : [];
}

function surnameOf(list) {
  return list.length
    ? list[list.length - 1]
    : '';
}

function firstOf(list) {
  return list.length
    ? list[0]
    : '';
}

function isSubset(
  smaller,
  larger
) {
  const large =
    new Set(larger);

  return smaller.every(
    token =>
      large.has(token)
  );
}

function levenshtein(
  a,
  b
) {
  const left =
    String(a || '');

  const right =
    String(b || '');

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const prev =
    Array.from(
      {
        length:
          right.length + 1
      },
      (_, i) => i
    );

  const next =
    new Array(
      right.length + 1
    );

  for (
    let i = 1;
    i <= left.length;
    i++
  ) {
    next[0] = i;

    for (
      let j = 1;
      j <= right.length;
      j++
    ) {
      const cost =
        left[i - 1] ===
        right[j - 1]
          ? 0
          : 1;

      next[j] =
        Math.min(
          next[j - 1] + 1,
          prev[j] + 1,
          prev[j - 1] + cost
        );
    }

    for (
      let j = 0;
      j < next.length;
      j++
    ) {
      prev[j] =
        next[j];
    }
  }

  return prev[
    right.length
  ];
}

export function nameSimilarity(
  a,
  b
) {
  const left =
    normalizeName(a);

  const right =
    normalizeName(b);

  if (
    !left ||
    !right
  ) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  const maxLen =
    Math.max(
      left.length,
      right.length
    );

  return Math.max(
    0,
    1 -
    levenshtein(
      left,
      right
    ) /
    maxLen
  );
}

function makeEntry(name) {
  const key =
    normalizeName(name);

  const list =
    tokens(name);

  return {
    key,
    name:
      String(name || '')
        .trim(),

    tokens:
      list,

    first:
      firstOf(list),

    surname:
      surnameOf(list)
  };
}

export function buildIdentityCatalog(
  rows
) {
  const byKey =
    new Map();

  const bySurname =
    new Map();

  function add(name) {
    const entry =
      makeEntry(name);

    if (
      !entry.key ||
      PLACEHOLDERS.has(
        entry.key
      )
    ) {
      return;
    }

    if (
      byKey.has(
        entry.key
      )
    ) {
      return;
    }

    byKey.set(
      entry.key,
      entry
    );

    if (
      !bySurname.has(
        entry.surname
      )
    ) {
      bySurname.set(
        entry.surname,
        []
      );
    }

    bySurname
      .get(
        entry.surname
      )
      .push(entry);
  }

  for (
    const row
    of rows || []
  ) {
    add(
      row?.winner_name
    );

    add(
      row?.loser_name
    );
  }

  return {
    byKey,
    bySurname,
    size:
      byKey.size
  };
}

function unresolved(
  queryName,
  status,
  candidates = []
) {
  return {
    resolved:
      false,

    status,

    method:
      status,

    queryName,

    canonicalName:
      null,

    canonicalKey:
      null,

    confidencePct:
      0,

    candidates:
      candidates.slice(
        0,
        3
      )
  };
}

function resolved(
  queryName,
  entry,
  method,
  confidencePct
) {
  return {
    resolved:
      true,

    status:
      method,

    method,

    queryName,

    canonicalName:
      entry.name,

    canonicalKey:
      entry.key,

    confidencePct,

    candidates:
      []
  };
}

export function resolvePlayerIdentity(
  queryName,
  catalog
) {
  const key =
    normalizeName(
      queryName
    );

  if (
    PLACEHOLDERS.has(key)
  ) {
    return unresolved(
      queryName,
      'PLACEHOLDER'
    );
  }

  if (
    !catalog?.byKey ||
    !catalog?.bySurname
  ) {
    return unresolved(
      queryName,
      'UNRESOLVED'
    );
  }

  const exact =
    catalog.byKey.get(
      key
    );

  if (exact) {
    return resolved(
      queryName,
      exact,
      'EXACT',
      100
    );
  }

  const queryTokens =
    tokens(queryName);

  const surname =
    surnameOf(
      queryTokens
    );

  const first =
    firstOf(
      queryTokens
    );

  const candidates =
    (
      catalog.bySurname.get(
        surname
      ) ||
      []
    );

  if (
    !candidates.length
  ) {
    return unresolved(
      queryName,
      'UNRESOLVED'
    );
  }

  /*
   * Alias conservador:
   * mismo primer nombre + apellido
   * y un nombre es subconjunto del otro.
   *
   * Ej.
   * Juan Cerundolo
   * Juan Manuel Cerundolo
   */
  const subsetAliases =
    candidates.filter(
      candidate =>
        candidate.first === first &&
        (
          isSubset(
            queryTokens,
            candidate.tokens
          ) ||
          isSubset(
            candidate.tokens,
            queryTokens
          )
        )
    );

  if (
    subsetAliases.length === 1
  ) {
    return resolved(
      queryName,
      subsetAliases[0],
      'ALIAS',
      99
    );
  }

  /*
   * Inicial + apellido:
   * solo resolvemos si existe
   * UN ÚNICO candidato posible.
   */
  if (
    first.length === 1
  ) {
    const initial =
      candidates.filter(
        candidate =>
          candidate.first
            ?.startsWith(first)
      );

    if (
      initial.length === 1
    ) {
      return resolved(
        queryName,
        initial[0],
        'ALIAS',
        96
      );
    }

    if (
      initial.length > 1
    ) {
      return unresolved(
        queryName,
        'AMBIGUOUS',
        initial.map(
          item =>
            item.name
        )
      );
    }
  }

  /*
   * Fuzzy final:
   * NUNCA cruza apellidos.
   * Exige primera palabra bastante parecida
   * y una coincidencia global alta.
   */
  const scored =
    candidates
      .map(
        candidate => {
          const firstScore =
            nameSimilarity(
              first,
              candidate.first
            );

          const fullScore =
            nameSimilarity(
              key,
              candidate.key
            );

          const score =
            0.58 *
            firstScore +
            0.42 *
            fullScore;

          return {
            candidate,
            firstScore,
            fullScore,
            score
          };
        }
      )
      .filter(
        item =>
          item.firstScore >= 0.82 &&
          item.fullScore >= 0.84
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  const best =
    scored[0];

  const second =
    scored[1];

  if (
    best &&
    best.score >= 0.87 &&
    (
      !second ||
      best.score -
      second.score >= 0.045
    )
  ) {
    return resolved(
      queryName,
      best.candidate,
      'FUZZY',
      Math.round(
        best.score * 100
      )
    );
  }

  return unresolved(
    queryName,
    scored.length > 1
      ? 'AMBIGUOUS'
      : 'UNRESOLVED',
    scored.map(
      item =>
        item.candidate.name
    )
  );
}

