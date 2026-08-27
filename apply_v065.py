#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path.cwd()

REQUIRED = [
    ROOT / "package.json",
    ROOT / "src/main.js",
    ROOT / "src/data/history.js",
    ROOT / "src/engine/playerStats.js",
    ROOT / "src/engine/matchup.js",
    ROOT / "src/engine/censo.js",
    ROOT / "src/style.css",
    ROOT / "tests/core.test.js",
    ROOT / "tests/pit.test.js",
]

def fail(message: str) -> None:
    print(f"\n[ERROR] {message}\n")
    sys.exit(1)

def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")

def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f"[OK] {label}: ya aplicado")
        return text
    if old not in text:
        fail(f"No encontré el patrón esperado: {label}")
    print(f"[OK] {label}")
    return text.replace(old, new, 1)

def replace_between(
    text: str,
    start: str,
    end: str,
    replacement: str,
    label: str
) -> str:
    a = text.find(start)
    if a < 0:
        fail(f"No encontré inicio: {label}")
    b = text.find(end, a + len(start))
    if b < 0:
        fail(f"No encontré final: {label}")
    print(f"[OK] {label}")
    return text[:a] + replacement + "\n\n" + text[b:]

for path in REQUIRED:
    if not path.exists():
        fail(
            "Ejecuta este parche desde ~/tennis-totals-lab.\n"
            f"Falta: {path}"
        )

pkg_path = ROOT / "package.json"
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
version = str(pkg.get("version", ""))

if version not in {"0.6.4", "0.6.5"}:
    fail(
        f"Versión detectada: {version}. "
        "Este parche es para v0.6.4 -> v0.6.5."
    )

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = ROOT / f".v065-backup-{stamp}"

backup_files = [
    "package.json",
    "package-lock.json",
    "src/main.js",
    "src/style.css",
    "src/data/history.js",
    "src/engine/playerStats.js",
    "src/engine/matchup.js",
    "src/engine/censo.js",
]

for rel in backup_files:
    src = ROOT / rel
    if src.exists():
        dst = backup / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

print(f"[OK] Backup local: {backup.name}")

# =========================================================
# 1. VERSION
# =========================================================
pkg["version"] = "0.6.5"
pkg_path.write_text(
    json.dumps(pkg, indent=2, ensure_ascii=False) + "\n",
    encoding="utf-8"
)

lock_path = ROOT / "package-lock.json"
if lock_path.exists():
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    lock["version"] = "0.6.5"

    packages = lock.get("packages")
    if isinstance(packages, dict) and isinstance(packages.get(""), dict):
        packages[""]["version"] = "0.6.5"

    lock_path.write_text(
        json.dumps(lock, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8"
    )

print("[OK] package version -> 0.6.5")

# =========================================================
# 2. HISTORY COVERAGE LAYER
#    Core sigue siendo la base oficial de baselines.
#    Extended se usa SOLO para perfiles/identidad.
# =========================================================
history_js = r"""import { CapacitorHttp } from '@capacitor/core';

const SOURCES = {
  ATP:
    'https://raw.githubusercontent.com/Aneeshers/tennis-sackmann-archive/main/atp',

  WTA:
    'https://raw.githubusercontent.com/Aneeshers/tennis-sackmann-archive/main/wta'
};

const coreCache =
  new Map();

const coverageCache =
  new Map();

export function normalizeName(
  value = ''
) {
  return String(value)
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      ' '
    )
    .trim()
    .replace(
      /\s+/g,
      ' '
    );
}

async function requestText(url) {
  try {
    const response =
      await CapacitorHttp.get({
        url,
        headers: {
          Accept:
            'text/plain,text/csv,*/*'
        }
      });

    if (
      response.status < 200 ||
      response.status >= 300
    ) {
      throw new Error(
        `Historical HTTP ${response.status}`
      );
    }

    if (
      typeof response.data ===
      'string'
    ) {
      return response.data;
    }

    throw new Error(
      'Respuesta histórica inválida'
    );

  } catch (nativeError) {
    const response =
      await fetch(url);

    if (!response.ok) {
      throw nativeError;
    }

    return response.text();
  }
}

function parseCsvLine(line) {
  const result = [];
  let value = '';
  let quoted = false;

  for (
    let i = 0;
    i < line.length;
    i++
  ) {
    const char =
      line[i];

    if (char === '"') {
      if (
        quoted &&
        line[i + 1] === '"'
      ) {
        value += '"';
        i++;
      } else {
        quoted =
          !quoted;
      }

      continue;
    }

    if (
      char === ',' &&
      !quoted
    ) {
      result.push(value);
      value = '';
      continue;
    }

    value += char;
  }

  result.push(value);

  return result;
}

function parseCSV(text) {
  const lines =
    text
      .replace(/\r/g, '')
      .split('\n')
      .filter(
        line =>
          line.trim()
      );

  if (!lines.length) {
    return [];
  }

  const headers =
    parseCsvLine(
      lines[0]
    );

  const rows = [];

  for (
    let i = 1;
    i < lines.length;
    i++
  ) {
    const values =
      parseCsvLine(
        lines[i]
      );

    const row = {};

    for (
      let j = 0;
      j < headers.length;
      j++
    ) {
      row[headers[j]] =
        values[j] ?? '';
    }

    rows.push(row);
  }

  return rows;
}

function prefixFor(tour) {
  return tour === 'ATP'
    ? 'atp'
    : 'wta';
}

function coreFileName(
  tour,
  year
) {
  const prefix =
    prefixFor(tour);

  return (
    `${prefix}_matches_${year}.csv`
  );
}

function extendedFileName(
  tour,
  year
) {
  const prefix =
    prefixFor(tour);

  return tour === 'ATP'
    ? `${prefix}_matches_qual_chall_${year}.csv`
    : `${prefix}_matches_qual_itf_${year}.csv`;
}

function annotateRows(
  rows,
  source
) {
  return rows.map(
    row => ({
      ...row,

      __historySource:
        source
    })
  );
}

async function loadFile(
  tour,
  year,
  kind
) {
  const source =
    SOURCES[tour];

  if (!source) {
    throw new Error(
      `Tour no soportado: ${tour}`
    );
  }

  const file =
    kind === 'EXTENDED'
      ? extendedFileName(
          tour,
          year
        )
      : coreFileName(
          tour,
          year
        );

  const url =
    `${source}/${file}`;

  const text =
    await requestText(url);

  return annotateRows(
    parseCSV(text),
    kind
  );
}

function rowKey(row) {
  return [
    row.tourney_id || '',
    row.tourney_date || '',
    row.match_num || '',
    row.round || '',
    normalizeName(
      row.winner_name
    ),
    normalizeName(
      row.loser_name
    )
  ].join('|');
}

function dedupeRows(rows) {
  const seen =
    new Set();

  const out = [];

  for (const row of rows) {
    const key =
      rowKey(row);

    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    out.push(row);
  }

  return out;
}

/*
 * CORE:
 * sigue siendo la fuente de baselines
 * ATP/WTA y evita que Challenger/ITF
 * altere la referencia del tour principal.
 */
export async function loadTourHistory(
  tour,
  years = [2025, 2026]
) {
  const upper =
    String(tour)
      .toUpperCase();

  const key =
    `${upper}:${years.join('-')}`;

  if (
    coreCache.has(key)
  ) {
    return coreCache.get(
      key
    );
  }

  const promise =
    Promise.all(
      years.map(
        year =>
          loadFile(
            upper,
            year,
            'MAIN'
          )
      )
    )
      .then(
        groups =>
          dedupeRows(
            groups.flat()
          )
      );

  coreCache.set(
    key,
    promise
  );

  return promise;
}

/*
 * COVERAGE:
 * añade qual/challenger/125/ITF
 * únicamente como evidencia histórica
 * de jugador. Si la capa extendida falla,
 * nunca tumba la app: continúa con CORE.
 */
export async function loadTourCoverageHistory(
  tour,
  years = [2025, 2026]
) {
  const upper =
    String(tour)
      .toUpperCase();

  const key =
    `${upper}:${years.join('-')}`;

  if (
    coverageCache.has(key)
  ) {
    return coverageCache.get(
      key
    );
  }

  const promise =
    Promise.all([
      loadTourHistory(
        upper,
        years
      ),

      Promise.all(
        years.map(
          async year => {
            try {
              return await loadFile(
                upper,
                year,
                'EXTENDED'
              );

            } catch (error) {
              console.warn(
                'Historical coverage fallback',
                upper,
                year,
                error
              );

              return [];
            }
          }
        )
      )
        .then(
          groups =>
            groups.flat()
        )
    ])
      .then(
        ([
          core,
          extended
        ]) =>
          dedupeRows([
            /*
             * CORE primero:
             * si una fila está repetida,
             * conservamos la versión MAIN.
             */
            ...core,
            ...extended
          ])
      );

  coverageCache.set(
    key,
    promise
  );

  return promise;
}
"""

write(
    ROOT / "src/data/history.js",
    history_js + "\n"
)
print("[OK] History Coverage Layer: MAIN + EXTENDED seguro")

# =========================================================
# 3. IDENTITY ENGINE
# =========================================================
identity_js = r"""import {
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
    best.score >= 0.88 &&
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
"""

write(
    ROOT / "src/engine/identity.js",
    identity_js + "\n"
)
print("[OK] Identity Engine conservador creado")

# =========================================================
# 4. COVERAGE / EFFECTIVE SAMPLE
# =========================================================
coverage_js = r"""export const COVERAGE_LIMITS = {
  surfaceFull:
    8,

  surfaceBlend:
    3,

  effectiveReady:
    6.5,

  minServePoints:
    300,

  minReturnPoints:
    300
};

export function historyRowWeight(
  row
) {
  if (
    row?.__historySource !==
    'EXTENDED'
  ) {
    return 1;
  }

  const level =
    String(
      row?.tourney_level ||
      ''
    )
      .trim()
      .toUpperCase();

  /*
   * Qualifying de torneos grandes/main:
   * casi equivalente a ATP/WTA.
   */
  if (
    [
      'G',
      'M',
      'A',
      'F'
    ].includes(level)
  ) {
    return 0.92;
  }

  /*
   * Challenger / WTA125.
   */
  if (
    level === 'C'
  ) {
    return 0.80;
  }

  /*
   * ITF / otros niveles.
   * Aporta evidencia, pero con
   * shrinkage mucho más fuerte.
   */
  return 0.68;
}

export function sourceMix(
  records
) {
  let main = 0;
  let extended = 0;

  let weightedMain = 0;
  let weightedExtended = 0;

  for (
    const record
    of records || []
  ) {
    const weight =
      Number(
        record?.historyWeight ??
        1
      );

    if (
      record?.historySource ===
      'EXTENDED'
    ) {
      extended++;
      weightedExtended +=
        weight;
    } else {
      main++;
      weightedMain +=
        weight;
    }
  }

  return {
    main,
    extended,

    weightedMain:
      Math.round(
        weightedMain * 100
      ) / 100,

    weightedExtended:
      Math.round(
        weightedExtended * 100
      ) / 100
  };
}

export function effectiveSampleForMode(
  mode,
  surfaceEffective,
  allEffective
) {
  const surface =
    Math.max(
      0,
      Number(
        surfaceEffective || 0
      )
    );

  const all =
    Math.max(
      0,
      Number(
        allEffective || 0
      )
    );

  if (
    mode === 'SURFACE'
  ) {
    return surface;
  }

  if (
    mode === 'BLEND'
  ) {
    /*
     * La superficie pesa completa;
     * lo ocurrido fuera de ella
     * solo aporta 45% de soporte.
     */
    return Math.min(
      all,
      surface +
      Math.max(
        0,
        all - surface
      ) *
      0.45
    );
  }

  /*
   * ALL:
   * sin muestra de superficie suficiente,
   * aplicamos penalización explícita.
   */
  return all * 0.82;
}

export function coverageReadiness({
  effectiveSample,
  servePoints,
  returnPoints,
  servePointsWonPct,
  returnPointsWonPct
}) {
  if (
    !Number.isFinite(
      Number(
        servePointsWonPct
      )
    ) ||
    !Number.isFinite(
      Number(
        returnPointsWonPct
      )
    )
  ) {
    return {
      ready: false,
      reason:
        'STAT_GAP'
    };
  }

  if (
    Number(
      effectiveSample || 0
    ) <
    COVERAGE_LIMITS
      .effectiveReady
  ) {
    return {
      ready: false,
      reason:
        'LOW_EFFECTIVE_SAMPLE'
    };
  }

  if (
    Number(
      servePoints || 0
    ) <
    COVERAGE_LIMITS
      .minServePoints
  ) {
    return {
      ready: false,
      reason:
        'SERVE_SUPPORT_LOW'
    };
  }

  if (
    Number(
      returnPoints || 0
    ) <
    COVERAGE_LIMITS
      .minReturnPoints
  ) {
    return {
      ready: false,
      reason:
        'RETURN_SUPPORT_LOW'
    };
  }

  return {
    ready: true,
    reason:
      'READY'
  };
}
"""

write(
    ROOT / "src/engine/coverage.js",
    coverage_js + "\n"
)
print("[OK] Effective Sample + tier weights creados")

# =========================================================
# 5. PLAYER STATS
# =========================================================
player_path = ROOT / "src/engine/playerStats.js"
s = player_path.read_text(encoding="utf-8")

old_import = """import {
  loadTourHistory,
  normalizeName
} from '../data/history.js';"""

new_import = """import {
  loadTourHistory,
  loadTourCoverageHistory,
  normalizeName
} from '../data/history.js';"""

s = replace_once(
    s,
    old_import,
    new_import,
    "playerStats importa coverage history"
)

pit_import = """import {
  asOfDateKey,
  isDateKeyBeforeAsOf,
  filterRowsBeforeAsOf
} from './pointInTime.js';"""

extra_imports = """import {
  asOfDateKey,
  isDateKeyBeforeAsOf,
  filterRowsBeforeAsOf
} from './pointInTime.js';

import {
  buildIdentityCatalog,
  resolvePlayerIdentity
} from './identity.js';

import {
  COVERAGE_LIMITS,
  coverageReadiness,
  effectiveSampleForMode,
  historyRowWeight,
  sourceMix
} from './coverage.js';"""

s = replace_once(
    s,
    pit_import,
    extra_imports,
    "playerStats importa Identity/Coverage"
)

old_record_tail = """    oppSecondWon:
      num(
        row[`${opp}_2ndWon`]
      )
  };
}"""

new_record_tail = """    oppSecondWon:
      num(
        row[`${opp}_2ndWon`]
      ),

    historySource:
      row.__historySource ||
      'MAIN',

    historyWeight:
      historyRowWeight(
        row
      ),

    tourneyLevel:
      String(
        row.tourney_level ||
        ''
      )
  };
}"""

s = replace_once(
    s,
    old_record_tail,
    new_record_tail,
    "registros guardan tier histórico"
)

s = replace_once(
    s,
    "function buildIndex(rows) {",
    "function buildIndex(rows, eloRows = rows) {",
    "buildIndex separa profile rows / Elo rows"
)

old_elo_block = """  const elo =
    buildElo(rows);

  return {
    players,
    tournaments,
    elo,

    /*
     * Se conserva la base cruda para
     * reconstruir Elo a cualquier cutoff.
     */
    historyRows:
      rows
  };
}"""

new_elo_block = """  const identityCatalog =
    buildIdentityCatalog(
      rows
    );

  /*
   * Elo se mantiene MAIN TOUR.
   * Coverage Extended NO altera el
   * tercer modelo hasta que LAB lo valide.
   */
  const elo =
    buildElo(
      eloRows
    );

  return {
    players,
    tournaments,

    identityCatalog,

    elo,

    /*
     * historyRows:
     * perfiles + identidad.
     *
     * eloRows:
     * exclusivamente CORE.
     */
    historyRows:
      rows,

    eloRows
  };
}"""

s = replace_once(
    s,
    old_elo_block,
    new_elo_block,
    "Identity catalog + Elo MAIN-only"
)

new_get_index = r"""async function getIndex(tour) {
  const upper =
    String(tour)
      .toUpperCase();

  if (
    indexCache.has(upper)
  ) {
    return indexCache.get(
      upper
    );
  }

  const promise =
    Promise.all([
      /*
       * CORE:
       * Elo y referencia del tour.
       */
      loadTourHistory(
        upper
      ),

      /*
       * COVERAGE:
       * CORE + qual/chall/125/ITF.
       */
      loadTourCoverageHistory(
        upper
      )
    ])
      .then(
        ([
          coreRows,
          coverageRows
        ]) => {
          const index =
            buildIndex(
              coverageRows,
              coreRows
            );

          const extendedRows =
            coverageRows.filter(
              row =>
                row.__historySource ===
                'EXTENDED'
            ).length;

          return {
            rows:
              coverageRows.length,

            coreRows:
              coreRows.length,

            extendedRows,

            ...index
          };
        }
      );

  indexCache.set(
    upper,
    promise
  );

  return promise;
}"""

s = replace_between(
    s,
    "async function getIndex(tour) {",
    "function inferSurface(",
    new_get_index,
    "getIndex usa coverage sin contaminar Elo"
)

new_aggregate_and_profile = r"""function aggregate(records) {
  let serviceGames = 0;
  let heldGames = 0;

  let returnGames = 0;
  let breaks = 0;

  let servePoints = 0;
  let servePointsWon = 0;

  let returnPoints = 0;
  let returnPointsWon = 0;

  let usableMatches = 0;

  for (const r of records) {
    let used = false;

    const weight =
      Math.max(
        0,
        Math.min(
          1,
          Number(
            r.historyWeight ??
            1
          )
        )
      );

    if (
      r.svGms !== null &&
      r.svGms > 0 &&
      r.bpFaced !== null &&
      r.bpSaved !== null
    ) {
      const broken =
        Math.max(
          0,
          r.bpFaced -
          r.bpSaved
        );

      serviceGames +=
        r.svGms *
        weight;

      heldGames +=
        Math.max(
          0,
          r.svGms -
          broken
        ) *
        weight;

      used = true;
    }

    if (
      r.oppSvGms !== null &&
      r.oppSvGms > 0 &&
      r.oppBpFaced !== null &&
      r.oppBpSaved !== null
    ) {
      returnGames +=
        r.oppSvGms *
        weight;

      breaks +=
        Math.max(
          0,
          r.oppBpFaced -
          r.oppBpSaved
        ) *
        weight;

      used = true;
    }

    if (
      r.svpt !== null &&
      r.svpt > 0 &&
      r.firstWon !== null &&
      r.secondWon !== null
    ) {
      servePoints +=
        r.svpt *
        weight;

      servePointsWon +=
        (
          r.firstWon +
          r.secondWon
        ) *
        weight;

      used = true;
    }

    if (
      r.oppSvpt !== null &&
      r.oppSvpt > 0 &&
      r.oppFirstWon !== null &&
      r.oppSecondWon !== null
    ) {
      const opponentWon =
        r.oppFirstWon +
        r.oppSecondWon;

      returnPoints +=
        r.oppSvpt *
        weight;

      returnPointsWon +=
        Math.max(
          0,
          r.oppSvpt -
          opponentWon
        ) *
        weight;

      used = true;
    }

    if (used) {
      usableMatches +=
        weight;
    }
  }

  return {
    usableMatches,

    serviceGames,
    heldGames,

    returnGames,
    breaks,

    servePoints,
    servePointsWon,

    returnPoints,
    returnPointsWon,

    hold:
      serviceGames
        ? clamp(
            heldGames /
            serviceGames
          )
        : null,

    break:
      returnGames
        ? clamp(
            breaks /
            returnGames
          )
        : null,

    servePointsWon:
      servePoints
        ? clamp(
            servePointsWon /
            servePoints
          )
        : null,

    returnPointsWon:
      returnPoints
        ? clamp(
            returnPointsWon /
            returnPoints
          )
        : null
  };
}

function blendRate(
  surfaceValue,
  allValue,
  weight
) {
  if (
    surfaceValue === null ||
    surfaceValue === undefined
  ) {
    return allValue;
  }

  if (
    allValue === null ||
    allValue === undefined
  ) {
    return surfaceValue;
  }

  return (
    surfaceValue *
    weight +
    allValue *
    (
      1 - weight
    )
  );
}

function profile(
  identity,
  surface,
  index,
  asOf,
  eloOverride = null
) {
  if (
    !identity?.resolved ||
    !identity.canonicalKey
  ) {
    return null;
  }

  const source =
    index.players.get(
      identity.canonicalKey
    ) ||
    [];

  /*
   * Point-In-Time:
   * nada del mismo día ni del futuro.
   */
  const all =
    source.filter(
      record =>
        isDateKeyBeforeAsOf(
          record.date,
          asOf
        )
    );

  if (!all.length) {
    return null;
  }

  const allRecent =
    all.slice(
      0,
      24
    );

  const surfaceMatches =
    surface !== 'UNKNOWN'
      ? all.filter(
          record =>
            record.surface ===
            surface
        )
      : [];

  const surfaceRecent =
    surfaceMatches.slice(
      0,
      24
    );

  const allAgg =
    aggregate(
      allRecent
    );

  const surfaceAgg =
    aggregate(
      surfaceRecent
    );

  let sampleType =
    'ALL';

  if (
    surface !== 'UNKNOWN' &&
    surfaceAgg.usableMatches >=
      COVERAGE_LIMITS
        .surfaceFull
  ) {
    sampleType =
      'SURFACE';

  } else if (
    surface !== 'UNKNOWN' &&
    surfaceAgg.usableMatches >=
      COVERAGE_LIMITS
        .surfaceBlend &&
    allAgg.usableMatches >=
      COVERAGE_LIMITS
        .effectiveReady
  ) {
    sampleType =
      'BLEND';
  }

  let surfaceWeight =
    0;

  if (
    sampleType ===
    'SURFACE'
  ) {
    surfaceWeight = 1;

  } else if (
    sampleType ===
    'BLEND'
  ) {
    surfaceWeight =
      Math.max(
        0.35,
        Math.min(
          0.76,
          surfaceAgg.usableMatches /
          (
            surfaceAgg.usableMatches +
            5
          )
        )
      );
  }

  const choose = key => {
    if (
      sampleType ===
      'SURFACE'
    ) {
      return surfaceAgg[key];
    }

    if (
      sampleType ===
      'BLEND'
    ) {
      return blendRate(
        surfaceAgg[key],
        allAgg[key],
        surfaceWeight
      );
    }

    return allAgg[key];
  };

  const recent =
    sampleType ===
    'SURFACE'
      ? surfaceRecent
      : allRecent;

  const support =
    sampleType ===
    'SURFACE'
      ? surfaceAgg
      : allAgg;

  const effectiveSample =
    effectiveSampleForMode(
      sampleType,
      surfaceAgg.usableMatches,
      allAgg.usableMatches
    );

  const hold =
    choose('hold');

  const breakRate =
    choose('break');

  const spw =
    choose(
      'servePointsWon'
    );

  const rpw =
    choose(
      'returnPointsWon'
    );

  const holdPct =
    percent(hold);

  const breakPct =
    percent(
      breakRate
    );

  const servePointsWonPct =
    percent(spw);

  const returnPointsWonPct =
    percent(rpw);

  const gate =
    coverageReadiness({
      effectiveSample,

      servePoints:
        support.servePoints,

      returnPoints:
        support.returnPoints,

      servePointsWonPct,

      returnPointsWonPct
    });

  const last10 =
    all.slice(
      0,
      10
    );

  const wins =
    last10.filter(
      record =>
        record.won
    ).length;

  const rank =
    all.find(
      record =>
        record.rank !== null
    )?.rank ??
    null;

  const rating =
    eloProfile(
      identity.canonicalName,
      surface,
      eloOverride ||
      index.elo
    );

  const mix =
    sourceMix(
      recent
    );

  return {
    name:
      identity.queryName,

    canonicalName:
      identity.canonicalName,

    identity: {
      method:
        identity.method,

      confidencePct:
        identity.confidencePct
    },

    rank,

    surface,

    sample:
      recent.length,

    effectiveSample:
      Math.round(
        effectiveSample *
        100
      ) / 100,

    surfaceSample:
      surfaceRecent.length,

    surfaceEffectiveSample:
      Math.round(
        surfaceAgg
          .usableMatches *
        100
      ) / 100,

    sampleType,

    surfaceWeightPct:
      Math.round(
        surfaceWeight *
        1000
      ) / 10,

    historyMix:
      mix,

    modelReady:
      gate.ready,

    coverageReason:
      gate.reason,

    holdPct,
    breakPct,
    servePointsWonPct,
    returnPointsWonPct,

    last10Wins:
      wins,

    last10Losses:
      last10.length -
      wins,

    eloRating:
      rating.overall,

    surfaceEloRating:
      rating.surface,

    ratingBlend:
      rating.blended,

    eloMatches:
      rating.matches,

    surfaceEloMatches:
      rating.surfaceMatches,

    raw: {
      serviceGames:
        support.serviceGames,

      heldGames:
        support.heldGames,

      returnGames:
        support.returnGames,

      breaks:
        support.breaks,

      servePoints:
        support.servePoints,

      servePointsWon:
        support.servePointsWon,

      returnPoints:
        support.returnPoints,

      returnPointsWon:
        support.returnPointsWon
    },

    confidence:
      effectiveSample >= 15
        ? 'HIGH'
        : effectiveSample >= 8
          ? 'MEDIUM'
          : 'LOW'
  };
}"""

s = replace_between(
    s,
    "function aggregate(records) {",
    "export async function enrichMatchesWithStats(",
    new_aggregate_and_profile,
    "aggregate ponderado + profile BLEND/effective sample"
)

counter_anchor = """  let surfaceFuzzyMatches = 0;
  let surfaceUnknownMatches = 0;"""

counter_new = """  let surfaceFuzzyMatches = 0;
  let surfaceUnknownMatches = 0;

  let identityExact = 0;
  let identityAlias = 0;
  let identityFuzzy = 0;
  let identityUnresolved = 0;
  let identityAmbiguous = 0;
  let identityPlaceholder = 0;

  let modelReadyPlayers = 0;
  let extendedSupportedProfiles = 0;

  function countIdentity(identity) {
    switch (
      identity?.status
    ) {
      case 'EXACT':
        identityExact++;
        break;

      case 'ALIAS':
        identityAlias++;
        break;

      case 'FUZZY':
        identityFuzzy++;
        break;

      case 'AMBIGUOUS':
        identityAmbiguous++;
        break;

      case 'PLACEHOLDER':
        identityPlaceholder++;
        break;

      default:
        identityUnresolved++;
        break;
    }
  }"""

s = replace_once(
    s,
    counter_anchor,
    counter_new,
    "coverage counters Identity"
)

# v0.6.4 reconstruía Elo con historyRows (ahora coverage).
# Desde v0.6.5 Elo debe continuar MAIN-only.
s = s.replace(
    "index.historyRows",
    "index.eloRows"
)
print("[OK] PIT Elo usa solo CORE")

old_profiles = """      const profileA =
        profile(
          match.playerA.name,
          surface,
          index,
          cutoffKey,
          pitElo
        );

      const profileB =
        profile(
          match.playerB.name,
          surface,
          index,
          cutoffKey,
          pitElo
        );

      totalPlayers += 2;"""

new_profiles = """      const identityA =
        resolvePlayerIdentity(
          match.playerA.name,
          index.identityCatalog
        );

      const identityB =
        resolvePlayerIdentity(
          match.playerB.name,
          index.identityCatalog
        );

      countIdentity(
        identityA
      );

      countIdentity(
        identityB
      );

      const profileA =
        profile(
          identityA,
          surface,
          index,
          cutoffKey,
          pitElo
        );

      const profileB =
        profile(
          identityB,
          surface,
          index,
          cutoffKey,
          pitElo
        );

      totalPlayers += 2;

      if (
        profileA?.modelReady
      ) {
        modelReadyPlayers++;
      }

      if (
        profileB?.modelReady
      ) {
        modelReadyPlayers++;
      }

      if (
        profileA
          ?.historyMix
          ?.extended > 0
      ) {
        extendedSupportedProfiles++;
      }

      if (
        profileB
          ?.historyMix
          ?.extended > 0
      ) {
        extendedSupportedProfiles++;
      }"""

s = replace_once(
    s,
    old_profiles,
    new_profiles,
    "identity resolver conectado a perfiles"
)

old_player_return = """        playerA: {
          ...match.playerA,
          profile: profileA
        },

        playerB: {
          ...match.playerB,
          profile: profileB
        }"""

new_player_return = """        playerA: {
          ...match.playerA,

          identity:
            identityA,

          profile:
            profileA
        },

        playerB: {
          ...match.playerB,

          identity:
            identityB,

          profile:
            profileB
        }"""

s = replace_once(
    s,
    old_player_return,
    new_player_return,
    "match conserva identidad auditada"
)

coverage_anchor = """      surfaceFuzzyMatches,
      surfaceUnknownMatches,

      atpRows:
        atp.rows,"""

coverage_new = """      surfaceFuzzyMatches,
      surfaceUnknownMatches,

      identityExact,
      identityAlias,
      identityFuzzy,
      identityUnresolved,
      identityAmbiguous,
      identityPlaceholder,

      modelReadyPlayers,
      extendedSupportedProfiles,

      atpRows:
        atp.rows,"""

s = replace_once(
    s,
    coverage_anchor,
    coverage_new,
    "coverage summary Identity"
)

old_rows_tail = """      wtaRows:
        wta.rows,

      atpPlayers:"""

new_rows_tail = """      wtaRows:
        wta.rows,

      atpCoreRows:
        atp.coreRows,

      wtaCoreRows:
        wta.coreRows,

      atpExtendedRows:
        atp.extendedRows,

      wtaExtendedRows:
        wta.extendedRows,

      atpPlayers:"""

s = replace_once(
    s,
    old_rows_tail,
    new_rows_tail,
    "coverage summary CORE/EXTENDED"
)

player_path.write_text(
    s,
    encoding="utf-8"
)
print("[OK] Player Data Engine v0.6.5")

# =========================================================
# 6. MATCHUP ENGINE
# =========================================================
matchup_path = ROOT / "src/engine/matchup.js"
s = matchup_path.read_text(encoding="utf-8")

new_reliability = r"""function reliability(profile) {
  if (!profile) {
    return 0;
  }

  const n =
    Math.max(
      0,
      Number(
        profile.effectiveSample ??
        profile.sample ??
        0
      )
    );

  let value =
    n /
    (
      n + 12
    );

  if (
    profile.sampleType ===
    'BLEND'
  ) {
    value *= 0.90;

  } else if (
    profile.sampleType !==
    'SURFACE'
  ) {
    value *= 0.82;
  }

  if (
    profile.confidence ===
    'MEDIUM'
  ) {
    value *= 0.90;
  }

  if (
    profile.confidence ===
    'LOW'
  ) {
    value *= 0.72;
  }

  /*
   * Alias/Fuzzy permitidos,
   * pero nunca reciben la misma
   * confianza que EXACT.
   */
  if (
    profile.identity?.method ===
    'ALIAS'
  ) {
    value *= 0.98;
  }

  if (
    profile.identity?.method ===
    'FUZZY'
  ) {
    value *= 0.94;
  }

  const extended =
    Number(
      profile.historyMix
        ?.extended ||
      0
    );

  const total =
    extended +
    Number(
      profile.historyMix
        ?.main ||
      0
    );

  if (
    total > 0 &&
    extended / total > 0.60
  ) {
    value *= 0.93;
  }

  return Math.max(
    0.15,
    Math.min(
      0.92,
      value
    )
  );
}"""

s = replace_between(
    s,
    "function reliability(profile) {",
    "function shrink(",
    new_reliability,
    "Matchup reliability usa effective sample"
)

new_classification = r"""function profileComplete(profile) {
  if (!profile) {
    return false;
  }

  const statsReady =
    profile.servePointsWonPct !==
      null &&
    profile.servePointsWonPct !==
      undefined &&
    profile.returnPointsWonPct !==
      null &&
    profile.returnPointsWonPct !==
      undefined;

  if (
    typeof profile.modelReady ===
    'boolean'
  ) {
    return (
      profile.modelReady &&
      statsReady
    );
  }

  return Boolean(
    Number(
      profile.sample || 0
    ) >= 8 &&
    statsReady
  );
}

function enoughSample(profile) {
  return profileComplete(
    profile
  );
}

function playerCoverageReason(
  player
) {
  const profile =
    player?.profile;

  const identity =
    player?.identity;

  if (!profile) {
    if (
      identity?.status ===
      'PLACEHOLDER'
    ) {
      return 'PLACEHOLDER';
    }

    if (
      identity &&
      !identity.resolved
    ) {
      return 'IDENTITY_MISS';
    }

    return 'NO_PROFILE';
  }

  if (
    !profileComplete(
      profile
    )
  ) {
    return (
      profile.coverageReason ||
      'LOW_SAMPLE'
    );
  }

  return 'READY';
}

function coverageAudit(
  match,
  baseline
) {
  return {
    playerA:
      playerCoverageReason(
        match.playerA
      ),

    playerB:
      playerCoverageReason(
        match.playerB
      ),

    surface:
      match.surface ===
      'UNKNOWN'
        ? 'SURFACE_UNKNOWN'
        : 'READY',

    baseline:
      baseline &&
      baseline.spw !== null &&
      baseline.hold !== null
        ? 'READY'
        : 'BASELINE_MISSING'
  };
}

function classify(
  match,
  baseline
) {
  const a =
    match.playerA.profile;

  const b =
    match.playerB.profile;

  if (
    !a &&
    !b
  ) {
    return 'NO_DATA';
  }

  const full =
    match.surface !== 'UNKNOWN' &&
    enoughSample(a) &&
    enoughSample(b) &&
    baseline?.spw !== null &&
    baseline?.hold !== null;

  return full
    ? 'FULL'
    : 'PARTIAL';
}"""

s = replace_between(
    s,
    "function profileComplete(profile) {",
    "function buildMatchup(",
    new_classification,
    "Matchup classify con razones de coverage"
)

old_baseline_return = """    return {
      status: 'NO_DATA',
      markovReady: false,
      reason: 'BASELINE_MISSING'
    };"""

new_baseline_return = """    return {
      status:
        'NO_DATA',

      markovReady:
        false,

      reason:
        'BASELINE_MISSING',

      coverageAudit:
        coverageAudit(
          match,
          baseline
        )
    };"""

s = replace_once(
    s,
    old_baseline_return,
    new_baseline_return,
    "baseline missing auditado"
)

status_anchor = """  const status =
    classify(
      match,
      baseline
    );

  const playerA ="""

status_new = """  const status =
    classify(
      match,
      baseline
    );

  const audit =
    coverageAudit(
      match,
      baseline
    );

  const playerA ="""

s = replace_once(
    s,
    status_anchor,
    status_new,
    "coverage audit calculado"
)

return_anchor = """  return {
    status,

    markovReady:
      status === 'FULL',"""

return_new = """  return {
    status,

    reason:
      status === 'FULL'
        ? 'READY'
        : (
            audit.playerA !==
              'READY'
              ? audit.playerA
              : audit.playerB !==
                  'READY'
                ? audit.playerB
                : audit.surface !==
                    'READY'
                  ? audit.surface
                  : audit.baseline
          ),

    coverageAudit:
      audit,

    markovReady:
      status === 'FULL',"""

s = replace_once(
    s,
    return_anchor,
    return_new,
    "Matchup retorna reason + coverageAudit"
)

matchup_path.write_text(
    s,
    encoding="utf-8"
)
print("[OK] Matchup diagnostics v0.6.5")

# =========================================================
# 7. MAIN UI
# =========================================================
main_path = ROOT / "src/main.js"
s = main_path.read_text(encoding="utf-8")

s = s.replace(
    "ATP + WTA · v0.6.4",
    "ATP + WTA · v0.6.5"
)

new_profile_line = r"""function profileLine(player) {
  const p =
    player.profile;

  if (!p) {
    const identity =
      player.identity;

    let message =
      'SIN PERFIL HISTÓRICO';

    if (
      identity?.status ===
      'PLACEHOLDER'
    ) {
      message =
        'SIN IDENTIDAD · PLACEHOLDER';

    } else if (
      identity &&
      !identity.resolved
    ) {
      message =
        identity.status ===
        'AMBIGUOUS'
          ? 'IDENTIDAD AMBIGUA · NO FORZADA'
          : 'IDENTITY MISS · NO FORZADO';
    }

    return `
      <div class="profile-line missing">
        <div class="profile-id">
          <strong>${player.shortName || player.name}</strong>
          <span>${message}</span>
        </div>
      </div>
    `;
  }

  const identityTag =
    p.identity?.method &&
    p.identity.method !==
      'EXACT'
      ? ` · ID ${p.identity.method} ${p.identity.confidencePct}%`
      : '';

  const extTag =
    Number(
      p.historyMix
        ?.extended ||
      0
    ) > 0
      ? ` · EXT ${p.historyMix.extended}`
      : '';

  return `
    <div class="profile-line">

      <div class="profile-id">
        <strong>${player.shortName || player.name}</strong>
        <span>
          ${p.rank ? `#${p.rank} · ` : ''}
          ${p.sampleType}
          · n=${p.sample}
          · eff=${Number(p.effectiveSample ?? p.sample).toFixed(1)}
          · L10 ${p.last10Wins}-${p.last10Losses}
          ${identityTag}
          ${extTag}
        </span>
      </div>

      <div>
        <span>HLD</span>
        <b>${statValue(p.holdPct)}</b>
      </div>

      <div>
        <span>BRK</span>
        <b>${statValue(p.breakPct)}</b>
      </div>

      <div>
        <span>SPW</span>
        <b>${statValue(p.servePointsWonPct)}</b>
      </div>

      <div>
        <span>RPW</span>
        <b>${statValue(p.returnPointsWonPct)}</b>
      </div>

    </div>
  `;
}"""

s = replace_between(
    s,
    "function profileLine(player) {",
    "function statsPanel(match) {",
    new_profile_line,
    "UI profile muestra identity/effective sample"
)

reason_helper = r"""function coverageReasonLabel(
  value
) {
  const labels = {
    READY:
      'READY',

    IDENTITY_MISS:
      'IDENTITY MISS',

    PLACEHOLDER:
      'SIN IDENTIDAD',

    NO_PROFILE:
      'SIN PERFIL',

    LOW_EFFECTIVE_SAMPLE:
      'MUESTRA EFECTIVA BAJA',

    LOW_SAMPLE:
      'MUESTRA BAJA',

    SERVE_SUPPORT_LOW:
      'POCOS PUNTOS DE SAQUE',

    RETURN_SUPPORT_LOW:
      'POCOS PUNTOS DE RESTO',

    STAT_GAP:
      'STATS INCOMPLETOS',

    SURFACE_UNKNOWN:
      'SUPERFICIE DESCONOCIDA',

    BASELINE_MISSING:
      'BASELINE FALTANTE'
  };

  return (
    labels[value] ||
    value ||
    '—'
  );
}"""

if "function coverageReasonLabel(" not in s:
    marker = "function matchupPlayerLine("
    pos = s.find(marker)
    if pos < 0:
        fail("main.js: matchupPlayerLine no encontrado")
    s = (
        s[:pos] +
        reason_helper +
        "\n\n" +
        s[pos:]
    )
    print("[OK] UI helper coverage reasons")

audit_anchor = """      ${matchupPlayerLine(
        match.playerB,
        m.playerB
      )}

      <div class="matchup-baseline">"""

audit_new = """      ${matchupPlayerLine(
        match.playerB,
        m.playerB
      )}

      ${
        m.status !== 'FULL' &&
        m.coverageAudit
          ? `
            <div class="coverage-audit">
              <strong>
                COVERAGE DIAGNOSTIC
              </strong>

              <span>
                ${match.playerA.shortName || match.playerA.name}:
                ${coverageReasonLabel(m.coverageAudit.playerA)}
              </span>

              <span>
                ${match.playerB.shortName || match.playerB.name}:
                ${coverageReasonLabel(m.coverageAudit.playerB)}
              </span>

              ${
                m.coverageAudit.surface !== 'READY'
                  ? `
                    <span>
                      ${coverageReasonLabel(m.coverageAudit.surface)}
                    </span>
                  `
                  : ''
              }
            </div>
          `
          : ''
      }

      <div class="matchup-baseline">"""

s = replace_once(
    s,
    audit_anchor,
    audit_new,
    "Detalle muestra causa PARTIAL"
)

new_render_player = r"""function renderPlayerData(coverage) {
  const badge =
    document.querySelector(
      '#playerDataBadge'
    );

  const pct =
    Number(
      coverage.percentage ||
      0
    );

  const quality =
    pct >= 88
      ? 'good'
      : pct >= 70
        ? 'partial'
        : 'low';

  badge.className =
    `player-data-badge ${quality}`;

  badge.textContent =
    `${pct.toFixed(1)}%`;

  document.querySelector(
    '#playerDataTitle'
  ).textContent =
    coverage.pointInTime
      ? 'Coverage + Identity point-in-time'
      : 'Coverage + Identity';

  document.querySelector(
    '#playerCoverage'
  ).textContent =
    `${pct.toFixed(1)}%`;

  document.querySelector(
    '#playerProfiles'
  ).textContent =
    `${coverage.foundPlayers}/${coverage.totalPlayers}`;

  document.querySelector(
    '#surfaceCoverage'
  ).textContent =
    `${coverage.surfaceResolvedMatches}/${coverage.totalMatches}`;

  document.querySelector(
    '#historyRows'
  ).textContent =
    (
      Number(
        coverage.atpRows ||
        0
      ) +
      Number(
        coverage.wtaRows ||
        0
      )
    ).toLocaleString();

  const resolvedByAlias =
    Number(
      coverage.identityAlias ||
      0
    ) +
    Number(
      coverage.identityFuzzy ||
      0
    );

  const unresolved =
    Number(
      coverage.identityUnresolved ||
      0
    ) +
    Number(
      coverage.identityAmbiguous ||
      0
    );

  const extendedRows =
    Number(
      coverage.atpExtendedRows ||
      0
    ) +
    Number(
      coverage.wtaExtendedRows ||
      0
    );

  const coreRows =
    Number(
      coverage.atpCoreRows ||
      0
    ) +
    Number(
      coverage.wtaCoreRows ||
      0
    );

  document.querySelector(
    '#playerDataDetail'
  ).innerHTML = `
    <span>
      Ambos perfiles:
      <strong>${coverage.bothProfiles}</strong>
    </span>

    <span>
      Uno:
      <strong>${coverage.oneProfile}</strong>
    </span>

    <span>
      Sin perfil:
      <strong>${coverage.noProfiles}</strong>
    </span>

    <span>
      ID:
      exact <strong>${coverage.identityExact || 0}</strong>
      · alias/fuzzy <strong>${resolvedByAlias}</strong>
      · miss <strong>${unresolved}</strong>
    </span>

    <span>
      Model-ready players:
      <strong>${coverage.modelReadyPlayers || 0}/${coverage.totalPlayers}</strong>
    </span>

    <span>
      Perfiles con soporte EXT:
      <strong>${coverage.extendedSupportedProfiles || 0}</strong>
    </span>

    <span>
      Históricos:
      CORE <strong>${coreRows.toLocaleString()}</strong>
      · EXT <strong>${extendedRows.toLocaleString()}</strong>
    </span>

    <span>
      Base IDs:
      ATP ${coverage.atpPlayers}
      · WTA ${coverage.wtaPlayers}
    </span>

    ${
      coverage.pointInTime
        ? `
          <span>
            PIT:
            <strong>ACTIVO</strong>
            · cutoff ${coverage.cutoffs?.join(', ') || '—'}
            · mismo día excluido
          </span>
        `
        : ''
    }
  `;
}"""

s = replace_between(
    s,
    "function renderPlayerData(coverage) {",
    "function renderPlayerDataError(error) {",
    new_render_player,
    "Player Data dashboard Coverage & Identity"
)

main_path.write_text(
    s,
    encoding="utf-8"
)
print("[OK] main.js -> v0.6.5 Coverage UX")

# =========================================================
# 8. CSS mínimo
# =========================================================
style_path = ROOT / "src/style.css"
css = style_path.read_text(encoding="utf-8")

css_block = r"""
/* ========================================================
   v0.6.5 Coverage & Identity Engine
   ======================================================== */

.coverage-audit {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  padding: 12px 20px;
  border-top: 1px solid rgba(255,255,255,.06);
  background: rgba(85, 58, 14, .12);
  font-size: 11px;
  line-height: 1.35;
}

.coverage-audit > strong {
  width: 100%;
  color: rgba(117, 238, 174, .88);
  font-size: 10px;
  letter-spacing: .08em;
}

.coverage-audit > span {
  color: rgba(235, 240, 237, .68);
}

.profile-line.missing .profile-id span {
  max-width: 280px;
}
"""

if "v0.6.5 Coverage & Identity Engine" not in css:
    css += "\n" + css_block + "\n"
    style_path.write_text(
        css,
        encoding="utf-8"
    )
    print("[OK] CSS Coverage Diagnostic")

# =========================================================
# 9. CENSO AUDIT SNAPSHOT
# =========================================================
censo_path = ROOT / "src/engine/censo.js"
s = censo_path.read_text(encoding="utf-8")

s = s.replace(
    "'0.6.4'",
    "'0.6.5'",
    1
)

snapshot_anchor = """    pointInTimeAudit: {
      status:
        match.pointInTime
          ?.status ??
        null,

      cutoffKey:
        match.pointInTime
          ?.cutoffKey ??
        null,

      strictBefore:
        match.pointInTime
          ?.strictBefore ??
        null,

      sameDayExcluded:
        match.pointInTime
          ?.sameDayExcluded ??
        null,

      baselineRows:
        match.matchup
          ?.pointInTime
          ?.baselineRows ??
        null
    },

    id,"""

snapshot_new = """    pointInTimeAudit: {
      status:
        match.pointInTime
          ?.status ??
        null,

      cutoffKey:
        match.pointInTime
          ?.cutoffKey ??
        null,

      strictBefore:
        match.pointInTime
          ?.strictBefore ??
        null,

      sameDayExcluded:
        match.pointInTime
          ?.sameDayExcluded ??
        null,

      baselineRows:
        match.matchup
          ?.pointInTime
          ?.baselineRows ??
        null
    },

    identityAudit: {
      playerA: {
        method:
          match.playerA
            ?.identity
            ?.method ??
          null,

        confidencePct:
          match.playerA
            ?.identity
            ?.confidencePct ??
          null,

        canonicalName:
          match.playerA
            ?.identity
            ?.canonicalName ??
          null,

        sampleType:
          match.playerA
            ?.profile
            ?.sampleType ??
          null,

        effectiveSample:
          match.playerA
            ?.profile
            ?.effectiveSample ??
          null,

        modelReady:
          match.playerA
            ?.profile
            ?.modelReady ??
          null,

        historyMix:
          match.playerA
            ?.profile
            ?.historyMix ??
          null
      },

      playerB: {
        method:
          match.playerB
            ?.identity
            ?.method ??
          null,

        confidencePct:
          match.playerB
            ?.identity
            ?.confidencePct ??
          null,

        canonicalName:
          match.playerB
            ?.identity
            ?.canonicalName ??
          null,

        sampleType:
          match.playerB
            ?.profile
            ?.sampleType ??
          null,

        effectiveSample:
          match.playerB
            ?.profile
            ?.effectiveSample ??
          null,

        modelReady:
          match.playerB
            ?.profile
            ?.modelReady ??
          null,

        historyMix:
          match.playerB
            ?.profile
            ?.historyMix ??
          null
      }
    },

    id,"""

s = replace_once(
    s,
    snapshot_anchor,
    snapshot_new,
    "Censo congela Identity/Coverage"
)

censo_path.write_text(
    s,
    encoding="utf-8"
)
print("[OK] Censo v0.6.5 auditable")

# =========================================================
# 10. TESTS
# =========================================================
identity_test = r"""import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildIdentityCatalog,
  nameSimilarity,
  resolvePlayerIdentity
} from '../src/engine/identity.js';

function catalog(names) {
  const rows = [];

  for (
    let i = 0;
    i < names.length;
    i += 2
  ) {
    rows.push({
      winner_name:
        names[i],

      loser_name:
        names[i + 1] ||
        'Control Player'
    });
  }

  return buildIdentityCatalog(
    rows
  );
}

test(
  'Identity: acentos normalizan a EXACT',
  () => {
    const c =
      catalog([
        'Nicolas Mejia',
        'Liam Draxl'
      ]);

    const id =
      resolvePlayerIdentity(
        'Nicolás Mejía',
        c
      );

    assert.equal(
      id.status,
      'EXACT'
    );

    assert.equal(
      id.confidencePct,
      100
    );
  }
);

test(
  'Identity: nombre intermedio puede ser ALIAS único',
  () => {
    const c =
      catalog([
        'Juan Manuel Cerundolo',
        'Fabian Marozsan'
      ]);

    const id =
      resolvePlayerIdentity(
        'Juan Cerundolo',
        c
      );

    assert.equal(
      id.status,
      'ALIAS'
    );

    assert.equal(
      id.canonicalName,
      'Juan Manuel Cerundolo'
    );
  }
);

test(
  'Identity: inicial + apellido solo si es único',
  () => {
    const c =
      catalog([
        'Maria Sakkari',
        'Aryna Sabalenka'
      ]);

    const id =
      resolvePlayerIdentity(
        'M Sakkari',
        c
      );

    assert.equal(
      id.status,
      'ALIAS'
    );
  }
);

test(
  'Identity: apellido/initial ambiguo falla cerrado',
  () => {
    const c =
      catalog([
        'Anna Smith',
        'Player One',
        'Alice Smith',
        'Player Two'
      ]);

    const id =
      resolvePlayerIdentity(
        'A Smith',
        c
      );

    assert.equal(
      id.resolved,
      false
    );

    assert.equal(
      id.status,
      'AMBIGUOUS'
    );
  }
);

test(
  'Identity: TBD nunca se inventa',
  () => {
    const c =
      catalog([
        'Elise Mertens',
        'Clara Tauson'
      ]);

    const id =
      resolvePlayerIdentity(
        'TBD',
        c
      );

    assert.equal(
      id.resolved,
      false
    );

    assert.equal(
      id.status,
      'PLACEHOLDER'
    );
  }
);

test(
  'Identity: typo leve con mismo apellido puede resolver FUZZY',
  () => {
    const c =
      catalog([
        'Maria Timofeeva',
        'Ann Li'
      ]);

    const id =
      resolvePlayerIdentity(
        'Mariya Timofeeva',
        c
      );

    assert.equal(
      id.status,
      'FUZZY'
    );

    assert.ok(
      id.confidencePct >= 88
    );
  }
);

test(
  'Identity similarity permanece acotada',
  () => {
    const score =
      nameSimilarity(
        'Maria',
        'Mariya'
      );

    assert.ok(
      score >= 0 &&
      score <= 1
    );
  }
);
"""

coverage_test = r"""import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COVERAGE_LIMITS,
  coverageReadiness,
  effectiveSampleForMode,
  historyRowWeight,
  sourceMix
} from '../src/engine/coverage.js';

test(
  'Coverage: MAIN pesa más que Challenger/ITF',
  () => {
    const main =
      historyRowWeight({
        __historySource:
          'MAIN'
      });

    const qualifier =
      historyRowWeight({
        __historySource:
          'EXTENDED',
        tourney_level:
          'A'
      });

    const challenger =
      historyRowWeight({
        __historySource:
          'EXTENDED',
        tourney_level:
          'C'
      });

    const itf =
      historyRowWeight({
        __historySource:
          'EXTENDED',
        tourney_level:
          'S'
      });

    assert.equal(
      main,
      1
    );

    assert.ok(
      main >
      qualifier
    );

    assert.ok(
      qualifier >
      challenger
    );

    assert.ok(
      challenger >
      itf
    );
  }
);

test(
  'Coverage: BLEND penaliza evidencia fuera de superficie',
  () => {
    const surface =
      effectiveSampleForMode(
        'SURFACE',
        8,
        12
      );

    const blend =
      effectiveSampleForMode(
        'BLEND',
        4,
        12
      );

    const all =
      effectiveSampleForMode(
        'ALL',
        0,
        8
      );

    assert.equal(
      surface,
      8
    );

    assert.ok(
      blend < 12
    );

    assert.ok(
      all < 8
    );
  }
);

test(
  'Coverage: 7 eff + soporte de puntos puede ser READY',
  () => {
    const gate =
      coverageReadiness({
        effectiveSample:
          7,

        servePoints:
          420,

        returnPoints:
          405,

        servePointsWonPct:
          63.2,

        returnPointsWonPct:
          37.1
      });

    assert.equal(
      gate.ready,
      true
    );

    assert.equal(
      gate.reason,
      'READY'
    );
  }
);

test(
  'Coverage: muestra insuficiente no se fuerza',
  () => {
    const gate =
      coverageReadiness({
        effectiveSample:
          4.8,

        servePoints:
          500,

        returnPoints:
          500,

        servePointsWonPct:
          63,

        returnPointsWonPct:
          37
      });

    assert.equal(
      gate.ready,
      false
    );

    assert.equal(
      gate.reason,
      'LOW_EFFECTIVE_SAMPLE'
    );
  }
);

test(
  'Coverage: sin soporte de puntos no entra al modelo',
  () => {
    const gate =
      coverageReadiness({
        effectiveSample:
          COVERAGE_LIMITS
            .effectiveReady +
          1,

        servePoints:
          150,

        returnPoints:
          500,

        servePointsWonPct:
          63,

        returnPointsWonPct:
          37
      });

    assert.equal(
      gate.ready,
      false
    );

    assert.equal(
      gate.reason,
      'SERVE_SUPPORT_LOW'
    );
  }
);

test(
  'Coverage: sourceMix separa MAIN y EXTENDED',
  () => {
    const mix =
      sourceMix([
        {
          historySource:
            'MAIN',
          historyWeight:
            1
        },
        {
          historySource:
            'EXTENDED',
          historyWeight:
            0.8
        }
      ]);

    assert.equal(
      mix.main,
      1
    );

    assert.equal(
      mix.extended,
      1
    );

    assert.equal(
      mix.weightedExtended,
      0.8
    );
  }
);
"""

write(
    ROOT / "tests/identity.test.js",
    identity_test + "\n"
)

write(
    ROOT / "tests/coverage.test.js",
    coverage_test + "\n"
)

print("[OK] 13 tests nuevos Identity/Coverage")

# =========================================================
# FINAL
# =========================================================
print(
    "\n"
    "============================================================\n"
    "Tennis Totals Lab v0.6.5 Coverage & Identity aplicado.\n"
    "============================================================\n"
    "\n"
    "Cambios clave:\n"
    "  - CORE + historial EXTENDED para perfiles.\n"
    "  - Elo sigue MAIN-only.\n"
    "  - Baselines siguen MAIN-only.\n"
    "  - Identity EXACT / ALIAS / FUZZY conservador.\n"
    "  - Ambiguos y TBD fallan cerrado.\n"
    "  - Effective Sample + BLEND por superficie.\n"
    "  - PARTIAL ahora explica por qué.\n"
    "  - Censo congela auditoría de identidad/cobertura.\n"
    "\n"
    "Ahora ejecuta:\n"
    "  node --check src/data/history.js\n"
    "  node --check src/engine/identity.js\n"
    "  node --check src/engine/coverage.js\n"
    "  node --check src/engine/playerStats.js\n"
    "  node --check src/engine/matchup.js\n"
    "  node --check src/engine/censo.js\n"
    "  node --check src/main.js\n"
    "  npm test\n"
    "  npm run build\n"
    "  npx cap sync android\n"
    "\n"
    "Esperado si todo está bien:\n"
    "  tests 24\n"
    "  pass 24\n"
    "  fail 0\n"
    "\n"
    "Después:\n"
    "  git status\n"
    "  git add .\n"
    '  git commit -m "v0.6.5 Coverage and Identity Engine"\n'
    "  git push origin main\n"
    "  gh run watch\n"
    "\n"
    f"Backup local: {backup.name}\n"
)

