#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path.cwd()

REQUIRED = [
    ROOT / "package.json",
    ROOT / "src/main.js",
    ROOT / "src/engine/playerStats.js",
    ROOT / "src/engine/surfaceBaselines.js",
    ROOT / "src/engine/matchup.js",
    ROOT / "src/engine/censo.js",
    ROOT / "tests/core.test.js",
]

def fail(message: str) -> None:
    print(f"\n[ERROR] {message}\n")
    sys.exit(1)

def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")

for path in REQUIRED:
    if not path.exists():
        fail(
            "Ejecuta este script desde la raíz de tennis-totals-lab.\n"
            f"Falta: {path}"
        )

pkg_path = ROOT / "package.json"
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))

if str(pkg.get("version")) not in {"0.6.3", "0.6.4"}:
    fail(
        f"Versión encontrada: {pkg.get('version')}. "
        "Este parche es para v0.6.3 -> v0.6.4."
    )

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = ROOT / f".v064-backup-{stamp}"

backup_files = [
    "package.json",
    "package-lock.json",
    "src/main.js",
    "src/engine/playerStats.js",
    "src/engine/surfaceBaselines.js",
    "src/engine/matchup.js",
    "src/engine/censo.js",
    "tests/core.test.js",
]

for rel in backup_files:
    src = ROOT / rel
    if src.exists():
        dst = backup / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

print(f"[OK] Backup local: {backup.name}")

# ---------------------------------------------------------
# 1) VERSION
# ---------------------------------------------------------
pkg["version"] = "0.6.4"
pkg_path.write_text(
    json.dumps(pkg, indent=2, ensure_ascii=False) + "\n",
    encoding="utf-8"
)

lock_path = ROOT / "package-lock.json"
if lock_path.exists():
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    lock["version"] = "0.6.4"

    packages = lock.get("packages")
    if isinstance(packages, dict) and isinstance(packages.get(""), dict):
        packages[""]["version"] = "0.6.4"

    lock_path.write_text(
        json.dumps(lock, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8"
    )

print("[OK] package version -> 0.6.4")

# ---------------------------------------------------------
# 2) POINT-IN-TIME CORE
# ---------------------------------------------------------
pit_js = r"""/*
 * Tennis Totals Lab
 * Point-In-Time Engine v0.6.4
 *
 * Regla:
 * una predicción con cutoff YYYYMMDD
 * solo puede utilizar filas con:
 *
 * historical_date < cutoff
 *
 * Por diseño se excluye TODO el mismo día
 * del partido. El histórico Sackmann no tiene
 * hora por encuentro, así evitamos conocer
 * accidentalmente resultados posteriores.
 */

function pad2(value) {
  return String(value)
    .padStart(2, '0');
}

export function localDateKey(
  date
) {
  if (
    !(date instanceof Date) ||
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return (
    `${date.getFullYear()}` +
    `${pad2(date.getMonth() + 1)}` +
    `${pad2(date.getDate())}`
  );
}

export function normalizeHistoricalDateKey(
  value
) {
  const text =
    String(value ?? '')
      .replace(/[^0-9]/g, '');

  if (text.length !== 8) {
    return null;
  }

  const year =
    Number(text.slice(0, 4));

  const month =
    Number(text.slice(4, 6));

  const day =
    Number(text.slice(6, 8));

  if (
    year < 1900 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  return text;
}

export function asOfDateKey(
  asOf
) {
  /*
   * ESPN ya normaliza el scoreboard
   * con la fecha LOCAL del dispositivo.
   * Conservamos exactamente esa convención.
   */
  if (
    typeof asOf === 'string' &&
    /^\d{8}$/.test(asOf)
  ) {
    return normalizeHistoricalDateKey(
      asOf
    );
  }

  const date =
    asOf instanceof Date
      ? asOf
      : new Date(asOf);

  return localDateKey(date);
}

export function isDateKeyBeforeAsOf(
  historicalDate,
  asOf
) {
  const rowKey =
    normalizeHistoricalDateKey(
      historicalDate
    );

  const cutoffKey =
    asOfDateKey(
      asOf
    );

  if (
    !rowKey ||
    !cutoffKey
  ) {
    /*
     * Fail closed:
     * si no podemos demostrar
     * que la fila es anterior,
     * no se utiliza.
     */
    return false;
  }

  return rowKey < cutoffKey;
}

export function filterRowsBeforeAsOf(
  rows,
  asOf
) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.filter(
    row =>
      isDateKeyBeforeAsOf(
        row?.tourney_date,
        asOf
      )
  );
}

export function pointInTimeAudit(
  rows,
  asOf
) {
  const total =
    Array.isArray(rows)
      ? rows.length
      : 0;

  const cutoffKey =
    asOfDateKey(asOf);

  const eligible =
    filterRowsBeforeAsOf(
      rows,
      asOf
    );

  return {
    status:
      cutoffKey
        ? 'ACTIVE'
        : 'INVALID_CUTOFF',

    cutoffKey,

    strictBefore:
      true,

    sameDayExcluded:
      true,

    totalRows:
      total,

    eligibleRows:
      eligible.length,

    excludedRows:
      Math.max(
        0,
        total - eligible.length
      )
  };
}
"""
write(
    ROOT / "src/engine/pointInTime.js",
    pit_js + "\n"
)
print("[OK] Point-In-Time core creado")

# ---------------------------------------------------------
# 3) PLAYER STATS: perfiles + Elo solo antes del cutoff
# ---------------------------------------------------------
player_path = ROOT / "src/engine/playerStats.js"
s = player_path.read_text(encoding="utf-8")

import_anchor = """import {
  resolveSurface
} from './surfaceResolver.js';
"""

pit_import = """import {
  asOfDateKey,
  isDateKeyBeforeAsOf,
  filterRowsBeforeAsOf
} from './pointInTime.js';

"""

if "from './pointInTime.js'" not in s:
    if import_anchor not in s:
        fail("playerStats.js: no encontré import de surfaceResolver")
    s = s.replace(
        import_anchor,
        import_anchor + "\n" + pit_import,
        1
    )

old = """  return {
    players,
    tournaments,
    elo
  };
}"""

new = """  return {
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

if "historyRows:" not in s:
    if old not in s:
        fail("playerStats.js: no encontré retorno de buildIndex")
    s = s.replace(old, new, 1)

old = """function profile(
  name,
  surface,
  index
) {
  const key =
    normalizeName(name);

  const all =
    index.players.get(key) ||
    [];

  if (!all.length) {
    return null;
  }"""

new = """function profile(
  name,
  surface,
  index,
  asOf,
  eloOverride = null
) {
  const key =
    normalizeName(name);

  const source =
    index.players.get(key) ||
    [];

  /*
   * Point-In-Time:
   * ni forma, ni ranking, ni saque/resto
   * pueden mirar el día actual o el futuro.
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
  }"""

if "eloOverride = null" not in s:
    if old not in s:
        fail("playerStats.js: firma profile() no encontrada")
    s = s.replace(old, new, 1)

old = """  const rating =
    eloProfile(
      name,
      surface,
      index.elo
    );"""

new = """  const rating =
    eloProfile(
      name,
      surface,
      eloOverride ||
      index.elo
    );"""

if new not in s:
    if old not in s:
        fail("playerStats.js: bloque eloProfile no encontrado")
    s = s.replace(old, new, 1)

# Inserta caches PIT dentro de enrichMatchesWithStats
needle = """  let surfaceUnknownMatches = 0;

  const enriched =
    matches.map(match => {"""

replacement = """  let surfaceUnknownMatches = 0;

  /*
   * Elo es reconstruido por tour + cutoff.
   * En la cartelera diaria normalmente son
   * solo dos reconstrucciones: ATP y WTA.
   */
  const eloByCutoff =
    new Map();

  const pitCutoffs =
    new Set();

  const pitAudits =
    new Map();

  const enriched =
    matches.map(match => {"""

if "const eloByCutoff" not in s:
    if needle not in s:
        fail("playerStats.js: punto para caches PIT no encontrado")
    s = s.replace(needle, replacement, 1)

needle = """      if (!index) {
        return match;
      }

      const surfaceMeta ="""

replacement = """      if (!index) {
        return match;
      }

      const asOf =
        match.date;

      const cutoffKey =
        asOfDateKey(
          asOf
        );

      if (!cutoffKey) {
        return {
          ...match,

          pointInTime: {
            status:
              'INVALID_CUTOFF',

            cutoffKey:
              null,

            strictBefore:
              true,

            sameDayExcluded:
              true
          }
        };
      }

      pitCutoffs.add(
        cutoffKey
      );

      const eloKey =
        `${match.tour}:${cutoffKey}`;

      let pitElo =
        eloByCutoff.get(
          eloKey
        );

      if (!pitElo) {
        const eligibleRows =
          filterRowsBeforeAsOf(
            index.historyRows,
            cutoffKey
          );

        pitElo =
          buildElo(
            eligibleRows
          );

        eloByCutoff.set(
          eloKey,
          pitElo
        );

        pitAudits.set(
          eloKey,
          {
            tour:
              match.tour,

            cutoffKey,

            totalRows:
              index.historyRows.length,

            eligibleRows:
              eligibleRows.length,

            excludedRows:
              Math.max(
                0,
                index.historyRows.length -
                eligibleRows.length
              )
          }
        );
      }

      const surfaceMeta ="""

if "const cutoffKey =\n        asOfDateKey" not in s:
    if needle not in s:
        fail("playerStats.js: punto de cálculo cutoff no encontrado")
    s = s.replace(needle, replacement, 1)

old = """      const profileA =
        profile(
          match.playerA.name,
          surface,
          index
        );

      const profileB =
        profile(
          match.playerB.name,
          surface,
          index
        );"""

new = """      const profileA =
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
        );"""

if "cutoffKey,\n          pitElo" not in s:
    if old not in s:
        fail("playerStats.js: llamadas profile() no encontradas")
    s = s.replace(old, new, 1)

old = """      return {
        ...match,

        surface,
        surfaceMeta,

        playerA: {"""

new = """      return {
        ...match,

        pointInTime: {
          status:
            'ACTIVE',

          cutoffKey,

          strictBefore:
            true,

          sameDayExcluded:
            true
        },

        surface,
        surfaceMeta,

        playerA: {"""

if "pointInTime: {\n          status:\n            'ACTIVE'" not in s:
    if old not in s:
        fail("playerStats.js: retorno enriched no encontrado")
    s = s.replace(old, new, 1)

# Añadir auditoría a coverage
old = """      wtaPlayers:
        wta.players.size
    }
  };
}"""

new = """      wtaPlayers:
        wta.players.size,

      pointInTime:
        true,

      strictBefore:
        true,

      sameDayExcluded:
        true,

      cutoffCount:
        pitCutoffs.size,

      cutoffs:
        [
          ...pitCutoffs
        ].sort(),

      pitAudit:
        [
          ...pitAudits.values()
        ]
    }
  };
}"""

if "cutoffCount:" not in s:
    if old not in s:
        fail("playerStats.js: final coverage no encontrado")
    s = s.replace(old, new, 1)

player_path.write_text(s, encoding="utf-8")
print("[OK] Player Stats + Elo ahora son Point-In-Time")

# ---------------------------------------------------------
# 4) BASELINES: también cutoff estricto
# ---------------------------------------------------------
baseline_path = ROOT / "src/engine/surfaceBaselines.js"
s = baseline_path.read_text(encoding="utf-8")

anchor = """import {
  loadTourHistory
} from '../data/history.js';
"""

addition = """import {
  asOfDateKey,
  filterRowsBeforeAsOf
} from './pointInTime.js';

"""

if "from './pointInTime.js'" not in s:
    if anchor not in s:
        fail("surfaceBaselines.js: import history no encontrado")
    s = s.replace(
        anchor,
        anchor + "\n" + addition,
        1
    )

old = """export async function getTourBaselines(
  tour
) {
  const upper =
    String(tour)
      .toUpperCase();

  if (
    cache.has(upper)
  ) {
    return cache.get(
      upper
    );
  }

  const promise =
    loadTourHistory(
      upper
    )
      .then(rows => ({
        tour: upper,
        rows: rows.length,
        surfaces:
          buildBaselines(rows)
      }));

  cache.set(
    upper,
    promise
  );

  return promise;
}"""

new = """export async function getTourBaselines(
  tour,
  asOf
) {
  const upper =
    String(tour)
      .toUpperCase();

  const cutoffKey =
    asOfDateKey(
      asOf
    );

  const key =
    `${upper}:${cutoffKey || 'INVALID'}`;

  if (
    cache.has(key)
  ) {
    return cache.get(
      key
    );
  }

  const promise =
    loadTourHistory(
      upper
    )
      .then(rows => {
        const eligibleRows =
          cutoffKey
            ? filterRowsBeforeAsOf(
                rows,
                cutoffKey
              )
            : [];

        return {
          tour:
            upper,

          rows:
            eligibleRows.length,

          sourceRows:
            rows.length,

          asOfKey:
            cutoffKey,

          pointInTime:
            true,

          strictBefore:
            true,

          sameDayExcluded:
            true,

          surfaces:
            buildBaselines(
              eligibleRows
            )
        };
      });

  cache.set(
    key,
    promise
  );

  return promise;
}"""

if "sourceRows:" not in s:
    if old not in s:
        fail("surfaceBaselines.js: getTourBaselines original no encontrado")
    s = s.replace(old, new, 1)

baseline_path.write_text(s, encoding="utf-8")
print("[OK] Surface baselines ahora son Point-In-Time")

# ---------------------------------------------------------
# 5) MATCHUP: baseline específico por fecha del partido
# ---------------------------------------------------------
matchup_path = ROOT / "src/engine/matchup.js"
s = matchup_path.read_text(encoding="utf-8")

marker = "export async function enrichMatchesWithMatchup("
pos = s.find(marker)

if pos == -1:
    fail("matchup.js: enrichMatchesWithMatchup no encontrado")

head = s[:pos]

tail = r"""export async function enrichMatchesWithMatchup(
  matches
) {
  const baselineCache =
    new Map();

  const representative = {
    ATP: null,
    WTA: null
  };

  let full = 0;
  let partial = 0;
  let noData = 0;
  let markovReady = 0;

  const enriched = [];

  for (const match of matches) {
    const cutoffKey =
      match.pointInTime
        ?.cutoffKey ||
      null;

    const cacheKey =
      `${match.tour}:${cutoffKey || 'INVALID'}`;

    let baselineSet =
      baselineCache.get(
        cacheKey
      );

    if (!baselineSet) {
      baselineSet =
        await getTourBaselines(
          match.tour,
          cutoffKey
        );

      baselineCache.set(
        cacheKey,
        baselineSet
      );
    }

    if (
      !representative[
        match.tour
      ]
    ) {
      representative[
        match.tour
      ] = baselineSet;
    }

    const baseline =
      selectBaseline(
        baselineSet,
        match.surface
      );

    const matchup =
      buildMatchup(
        match,
        baseline
      );

    matchup.pointInTime = {
      status:
        cutoffKey
          ? 'ACTIVE'
          : 'INVALID_CUTOFF',

      cutoffKey,

      baselineRows:
        baselineSet?.rows ?? 0,

      strictBefore:
        true,

      sameDayExcluded:
        true
    };

    if (
      matchup.status === 'FULL'
    ) {
      full++;
    } else if (
      matchup.status === 'PARTIAL'
    ) {
      partial++;
    } else {
      noData++;
    }

    if (
      matchup.markovReady
    ) {
      markovReady++;
    }

    enriched.push({
      ...match,
      matchup
    });
  }

  function summaryTour(
    baselineSet
  ) {
    return {
      all:
        baselineSet
          ?.surfaces
          ?.ALL ||
        null,

      hard:
        baselineSet
          ?.surfaces
          ?.HARD ||
        null,

      clay:
        baselineSet
          ?.surfaces
          ?.CLAY ||
        null,

      grass:
        baselineSet
          ?.surfaces
          ?.GRASS ||
        null,

      cutoffKey:
        baselineSet
          ?.asOfKey ||
        null,

      rows:
        baselineSet
          ?.rows ||
        0
    };
  }

  return {
    matches:
      enriched,

    summary: {
      total:
        matches.length,

      full,
      partial,
      noData,
      markovReady,

      pointInTime:
        true,

      atp:
        summaryTour(
          representative.ATP
        ),

      wta:
        summaryTour(
          representative.WTA
        )
    }
  };
}
"""

matchup_path.write_text(head + tail + "\n", encoding="utf-8")
print("[OK] Matchup usa baseline del cutoff de cada partido")

# ---------------------------------------------------------
# 6) MAIN UI + cache fingerprint
# ---------------------------------------------------------
main_path = ROOT / "src/main.js"
s = main_path.read_text(encoding="utf-8")

s = s.replace(
    "ATP + WTA · v0.6.3",
    "ATP + WTA · v0.6.4"
)

old = """    match.round,
    match.surface,
    match.matchup?.playerA?.servePointPct,"""

new = """    match.round,
    match.surface,

    /*
     * Evita reutilizar una simulación
     * calculada con otro corte histórico.
     */
    match.pointInTime?.cutoffKey,

    match.matchup?.playerA?.servePointPct,"""

if "match.pointInTime?.cutoffKey" not in s:
    if old not in s:
        fail("main.js: totalsFingerprint no encontrado")
    s = s.replace(old, new, 1)

old = """  document.querySelector(
    '#playerDataTitle'
  ).textContent =
    'Perfiles estadísticos cargados';"""

new = """  document.querySelector(
    '#playerDataTitle'
  ).textContent =
    coverage.pointInTime
      ? 'Perfiles point-in-time cargados'
      : 'Perfiles estadísticos cargados';"""

if "Perfiles point-in-time cargados" not in s:
    if old not in s:
        fail("main.js: playerDataTitle no encontrado")
    s = s.replace(old, new, 1)

old = """    <span>
      Base:
      ATP ${coverage.atpPlayers}
      · WTA ${coverage.wtaPlayers}
    </span>
  `;"""

new = """    <span>
      Base:
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
  `;"""

if "mismo día excluido" not in s:
    if old not in s:
        fail("main.js: playerDataDetail final no encontrado")
    s = s.replace(old, new, 1)

# Matchup panel también deja evidencia visible
old = """    <span>
      WTA HARD:
      SPW <strong>${pctText(wtaHard?.spw)}</strong>
      · HOLD <strong>${pctText(wtaHard?.hold)}</strong>
    </span>
  `;"""

new = """    <span>
      WTA HARD:
      SPW <strong>${pctText(wtaHard?.spw)}</strong>
      · HOLD <strong>${pctText(wtaHard?.hold)}</strong>
    </span>

    ${
      summary.pointInTime
        ? `
          <span>
            POINT-IN-TIME
            <strong>STRICT</strong>
            · ATP ${summary.atp?.cutoffKey || '—'}
            · WTA ${summary.wta?.cutoffKey || '—'}
          </span>
        `
        : ''
    }
  `;"""

if "POINT-IN-TIME" not in s:
    if old not in s:
        fail("main.js: matchup detail final no encontrado")
    s = s.replace(old, new, 1)

main_path.write_text(s, encoding="utf-8")
print("[OK] UI v0.6.4 + PIT visible + cache fingerprint")

# ---------------------------------------------------------
# 7) CENSO: snapshot PIT reproducible
# ---------------------------------------------------------
censo_path = ROOT / "src/engine/censo.js"
s = censo_path.read_text(encoding="utf-8")

s = s.replace(
    "'0.6.3'",
    "'0.6.4'",
    1
)

needle = """    marketObservedAt:
      match.marketObservedAt ??
      null,

    id,"""

replacement = """    marketObservedAt:
      match.marketObservedAt ??
      null,

    pointInTimeAudit: {
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

if "pointInTimeAudit:" not in s:
    if needle not in s:
        fail("censo.js: punto para PIT audit no encontrado")
    s = s.replace(needle, replacement, 1)

censo_path.write_text(s, encoding="utf-8")
print("[OK] Censo congela cutoff Point-In-Time")

# ---------------------------------------------------------
# 8) TESTS PIT
# ---------------------------------------------------------
pit_test = r"""import test from 'node:test';
import assert from 'node:assert/strict';

import {
  asOfDateKey,
  isDateKeyBeforeAsOf,
  filterRowsBeforeAsOf,
  pointInTimeAudit
} from '../src/engine/pointInTime.js';

test(
  'PIT: normaliza fecha local del partido',
  () => {
    const date =
      new Date(
        2026,
        7,
        25,
        18,
        30,
        0
      );

    assert.equal(
      asOfDateKey(date),
      '20260825'
    );
  }
);

test(
  'PIT: mismo día queda excluido',
  () => {
    assert.equal(
      isDateKeyBeforeAsOf(
        '20260824',
        '20260825'
      ),
      true
    );

    assert.equal(
      isDateKeyBeforeAsOf(
        '20260825',
        '20260825'
      ),
      false
    );

    assert.equal(
      isDateKeyBeforeAsOf(
        '20260826',
        '20260825'
      ),
      false
    );
  }
);

test(
  'PIT: filtra pasado y bloquea futuro',
  () => {
    const rows = [
      {
        tourney_date:
          '20260823',
        id: 1
      },
      {
        tourney_date:
          '20260824',
        id: 2
      },
      {
        tourney_date:
          '20260825',
        id: 3
      },
      {
        tourney_date:
          '20260826',
        id: 4
      }
    ];

    const filtered =
      filterRowsBeforeAsOf(
        rows,
        '20260825'
      );

    assert.deepEqual(
      filtered.map(
        row => row.id
      ),
      [1, 2]
    );
  }
);

test(
  'PIT: cutoff inválido falla cerrado',
  () => {
    const rows = [
      {
        tourney_date:
          '20260820'
      }
    ];

    assert.deepEqual(
      filterRowsBeforeAsOf(
        rows,
        'invalid'
      ),
      []
    );
  }
);

test(
  'PIT audit reporta elegibles/excluidos',
  () => {
    const audit =
      pointInTimeAudit(
        [
          {
            tourney_date:
              '20260820'
          },
          {
            tourney_date:
              '20260825'
          },
          {
            tourney_date:
              '20260826'
          }
        ],
        '20260825'
      );

    assert.equal(
      audit.status,
      'ACTIVE'
    );

    assert.equal(
      audit.eligibleRows,
      1
    );

    assert.equal(
      audit.excludedRows,
      2
    );

    assert.equal(
      audit.sameDayExcluded,
      true
    );
  }
);
"""
write(
    ROOT / "tests/pit.test.js",
    pit_test + "\n"
)
print("[OK] 5 tests Point-In-Time agregados")

print(
    "\n"
    "============================================================\n"
    "Tennis Totals Lab v0.6.4 Point-In-Time aplicado.\n"
    "============================================================\n"
    "\n"
    "IMPORTANTE:\n"
    "- Markov/Bayes/Elo NO fueron reemplazados.\n"
    "- Cambiaron las ENTRADAS históricas para impedir leakage.\n"
    "- El mismo día del partido queda fuera del histórico.\n"
    "- Baselines y Elo respetan el mismo cutoff.\n"
    "\n"
    "Ahora ejecuta:\n"
    "  node --check src/engine/pointInTime.js\n"
    "  node --check src/engine/playerStats.js\n"
    "  node --check src/engine/surfaceBaselines.js\n"
    "  node --check src/engine/matchup.js\n"
    "  node --check src/main.js\n"
    "  npm test\n"
    "  npm run build\n"
    "  npx cap sync android\n"
    "\n"
    "Si todo sale OK:\n"
    "  git status\n"
    "  git add .\n"
    '  git commit -m "v0.6.4 Point-in-Time Engine"\n'
    "  git push origin main\n"
    "  gh run watch\n"
    "\n"
    f"Backup local: {backup.name}\n"
)

