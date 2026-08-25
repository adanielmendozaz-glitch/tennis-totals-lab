function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(
      /[^a-z0-9]+/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
}

const GENERIC = new Set([
  'atp',
  'wta',
  'tennis',
  'open',
  'championship',
  'championships',
  'presented',
  'by'
]);

function tokens(value) {
  return normalize(value)
    .split(' ')
    .filter(
      token =>
        token &&
        !GENERIC.has(token)
    );
}

function similarity(a, b) {
  const A =
    new Set(tokens(a));

  const B =
    new Set(tokens(b));

  if (
    !A.size ||
    !B.size
  ) {
    return {
      score: 0,
      common: 0
    };
  }

  let common = 0;

  for (const item of A) {
    if (B.has(item)) {
      common++;
    }
  }

  const union =
    new Set([
      ...A,
      ...B
    ]).size;

  return {
    score:
      union
        ? common / union
        : 0,

    common
  };
}

/*
 * Alias confiables.
 *
 * Primero intentamos relacionarlos
 * con el histórico.
 *
 * Si el histórico no puede,
 * usamos la superficie conocida
 * como fallback.
 */
const TRUSTED = [
  {
    id: 'MONTERREY',
    match:
      /abierto gnp seguros|monterrey/,
    aliases: [
      'monterrey',
      'monterrey open'
    ],
    surface: 'HARD'
  },

  {
    id: 'WINSTON_SALEM',
    match:
      /winston salem/,
    aliases: [
      'winston salem'
    ],
    surface: 'HARD'
  },

  {
    id: 'US_OPEN',
    match:
      /\bus open\b/,
    aliases: [
      'us open'
    ],
    surface: 'HARD'
  },

  {
    id: 'CINCINNATI',
    match:
      /cincinnati|western southern/,
    aliases: [
      'cincinnati'
    ],
    surface: 'HARD'
  },

  {
    id: 'CANADA',
    match:
      /national bank open|rogers cup|canadian open|montreal|toronto/,
    aliases: [
      'canada masters',
      'canadian open',
      'montreal',
      'toronto'
    ],
    surface: 'HARD'
  },

  {
    id: 'WASHINGTON',
    match:
      /washington|mubadala citi/,
    aliases: [
      'washington'
    ],
    surface: 'HARD'
  },

  {
    id: 'AUSTRALIAN_OPEN',
    match:
      /australian open/,
    aliases: [
      'australian open'
    ],
    surface: 'HARD'
  },

  {
    id: 'INDIAN_WELLS',
    match:
      /indian wells/,
    aliases: [
      'indian wells'
    ],
    surface: 'HARD'
  },

  {
    id: 'MIAMI',
    match:
      /miami open|\bmiami\b/,
    aliases: [
      'miami'
    ],
    surface: 'HARD'
  },

  {
    id: 'ROLAND_GARROS',
    match:
      /roland garros|french open/,
    aliases: [
      'roland garros'
    ],
    surface: 'CLAY'
  },

  {
    id: 'MADRID',
    match:
      /madrid open|\bmadrid\b/,
    aliases: [
      'madrid'
    ],
    surface: 'CLAY'
  },

  {
    id: 'ROME',
    match:
      /internazionali bnl|italian open|\brome\b/,
    aliases: [
      'rome'
    ],
    surface: 'CLAY'
  },

  {
    id: 'MONTE_CARLO',
    match:
      /monte carlo/,
    aliases: [
      'monte carlo'
    ],
    surface: 'CLAY'
  },

  {
    id: 'WIMBLEDON',
    match:
      /\bwimbledon\b/,
    aliases: [
      'wimbledon'
    ],
    surface: 'GRASS'
  }
];

function historyEntries(
  tournaments
) {
  return [
    ...(tournaments || new Map())
      .entries()
  ].map(
    ([key, surface]) => ({
      rawKey: key,
      key:
        normalize(key),
      surface
    })
  );
}

function findExact(
  target,
  entries
) {
  const normalized =
    normalize(target);

  return entries.find(
    entry =>
      entry.key === normalized
  ) || null;
}

function findContains(
  target,
  entries
) {
  const normalized =
    normalize(target);

  if (
    normalized.length < 7
  ) {
    return null;
  }

  return entries.find(
    entry =>
      entry.key.length >= 7 &&
      (
        entry.key.includes(
          normalized
        ) ||
        normalized.includes(
          entry.key
        )
      )
  ) || null;
}

function findFuzzy(
  target,
  entries
) {
  let best = null;

  for (const entry of entries) {
    const comparison =
      similarity(
        target,
        entry.key
      );

    /*
     * Exigimos dos tokens comunes
     * para evitar falsos positivos.
     */
    if (
      comparison.common < 2
    ) {
      continue;
    }

    if (
      !best ||
      comparison.score >
      best.score
    ) {
      best = {
        ...entry,
        ...comparison
      };
    }
  }

  if (
    !best ||
    best.score < 0.55
  ) {
    return null;
  }

  return best;
}

function result(
  surface,
  source,
  confidencePct,
  matched = null
) {
  return {
    surface,
    source,
    confidencePct,
    matched
  };
}

export function resolveSurface({
  tournament,
  venue,
  court,
  tournaments
}) {
  const text =
    normalize(
      [
        tournament,
        venue,
        court
      ]
        .filter(Boolean)
        .join(' ')
    );

  const entries =
    historyEntries(
      tournaments
    );

  /*
   * 1. Histórico exacto.
   */
  const exact =
    findExact(
      tournament,
      entries
    );

  if (exact) {
    return result(
      exact.surface,
      'HISTORY_EXACT',
      99,
      exact.rawKey
    );
  }

  /*
   * 2. Alias confiable.
   */
  const trusted =
    TRUSTED.find(
      rule =>
        rule.match.test(text)
    );

  if (trusted) {

    for (
      const alias
      of trusted.aliases
    ) {
      const historical =
        findExact(
          alias,
          entries
        ) ||
        findContains(
          alias,
          entries
        );

      if (historical) {
        return result(
          historical.surface,
          'ALIAS_HISTORY',
          99,
          historical.rawKey
        );
      }
    }

    return result(
      trusted.surface,
      'TRUSTED_ALIAS',
      98,
      trusted.id
    );
  }

  /*
   * 3. Coincidencia parcial histórica.
   */
  const contains =
    findContains(
      tournament,
      entries
    );

  if (contains) {
    return result(
      contains.surface,
      'HISTORY_MATCH',
      92,
      contains.rawKey
    );
  }

  /*
   * 4. Fuzzy conservador.
   */
  const fuzzy =
    findFuzzy(
      tournament,
      entries
    );

  if (fuzzy) {
    const confidence =
      Math.min(
        90,
        72 +
        fuzzy.score * 20
      );

    return result(
      fuzzy.surface,
      'HISTORY_FUZZY',
      Math.round(
        confidence
      ),
      fuzzy.rawKey
    );
  }

  return result(
    'UNKNOWN',
    'UNRESOLVED',
    0,
    null
  );
}
