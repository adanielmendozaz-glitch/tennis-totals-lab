#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path.cwd()

def fail(message):
    print(f"[ERROR] {message}")
    sys.exit(1)

def patch_once(path: Path, old: str, new: str, label: str):
    text = path.read_text(encoding="utf-8")
    if new in text:
        print(f"✓ {label}: ya aplicado")
        return
    if old not in text:
        fail(f"No encontré patrón para: {label}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"✓ {label}")

required = [
    "package.json",
    "package-lock.json",
    "src/main.js",
    "src/style.css",
    "src/engine/ensemble.js",
    "src/engine/montecarlo.js",
    "src/engine/market.js",
    "src/engine/censo.js",
    "src/workers/totals.worker.js",
]

for rel in required:
    if not (ROOT / rel).exists():
        fail(f"Falta {rel}. Ejecuta desde ~/tennis-totals-lab")

pkg_path = ROOT / "package.json"
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
if str(pkg.get("version")) != "0.6.8.1":
    fail(f"Esperaba v0.6.8.1 y encontré {pkg.get('version')}")

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = ROOT / f".v0682-fair-line-backup-{stamp}"

for rel in required:
    src = ROOT / rel
    dst = backup / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)

for rel in [
    "src/engine/matchLength.js",
    "src/v0682-ui.js",
    "tests/matchLength.test.js",
]:
    src = ROOT / rel
    if src.exists():
        dst = backup / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

print(f"✓ Backup local: {backup.name}")

# Version
pkg["version"] = "0.6.8.2"
pkg_path.write_text(
    json.dumps(pkg, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8"
)

lock_path = ROOT / "package-lock.json"
lock = json.loads(lock_path.read_text(encoding="utf-8"))
lock["version"] = "0.6.8.2"
if isinstance(lock.get("packages"), dict) and "" in lock["packages"]:
    lock["packages"][""]["version"] = "0.6.8.2"
lock_path.write_text(
    json.dumps(lock, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8"
)
print("✓ package version → 0.6.8.2")

match_length = r'''function clamp(
  value,
  min,
  max
) {
  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );
}

function finite(
  value,
  fallback = null
) {
  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function round1(value) {
  return Math.round(
    Number(value || 0) *
    10
  ) / 10;
}

function round2(value) {
  return Math.round(
    Number(value || 0) *
    100
  ) / 100;
}

function mean(values) {
  if (!values.length) {
    return null;
  }

  return (
    values.reduce(
      (sum, value) =>
        sum + value,
      0
    ) /
    values.length
  );
}

function profileVector(
  profile,
  baseline
) {
  const hold =
    finite(
      profile?.holdPct,
      baseline.hold
    );

  const breakPct =
    finite(
      profile?.breakPct,
      baseline.break
    );

  const spw =
    finite(
      profile?.servePointsWonPct,
      baseline.spw
    );

  const rpw =
    finite(
      profile?.returnPointsWonPct,
      baseline.rpw
    );

  return {
    hold,
    breakPct,
    spw,
    rpw,

    gameStrength:
      (
        hold +
        breakPct
      ) / 2,

    pointStrength:
      (
        spw +
        rpw
      ) / 2
  };
}

function trustFactor(level) {
  if (level === 'HIGH') {
    return 1.00;
  }

  if (level === 'MEDIUM') {
    return 0.90;
  }

  if (level === 'CAUTION') {
    return 0.72;
  }

  return 0.82;
}

/*
 * v0.6.8.2 — FAIR LINE / MATCH LENGTH
 *
 * No fuerza OVER ni UNDER.
 *
 * Conserva aproximadamente el HOLD medio
 * y expande solamente el GAP A-vs-B
 * cuando la evidencia histórica indica
 * una diferencia real de fuerza.
 */
export function buildMatchLengthCalibration(
  match
) {
  const matchup =
    match?.matchup;

  if (
    !matchup?.markovReady ||
    !matchup.playerA ||
    !matchup.playerB
  ) {
    return {
      available: false,
      status: 'UNAVAILABLE',
      reason: 'MATCHUP_NOT_READY',
      holdShiftAPp: 0,
      holdShiftBPp: 0
    };
  }

  const baseline = {
    hold:
      finite(
        matchup.baseline?.holdPct,
        matchup.averageHoldPct || 70
      ),

    break:
      finite(
        matchup.baseline?.breakPct,
        30
      ),

    spw:
      finite(
        matchup.baseline?.servePointPct,
        60
      ),

    rpw:
      finite(
        matchup.baseline?.returnPointPct,
        40
      )
  };

  const vectorA =
    profileVector(
      match.playerA?.profile,
      baseline
    );

  const vectorB =
    profileVector(
      match.playerB?.profile,
      baseline
    );

  const gameGapPp =
    vectorA.gameStrength -
    vectorB.gameStrength;

  const pointGapPp =
    vectorA.pointStrength -
    vectorB.pointStrength;

  const ratingA =
    finite(
      match.playerA
        ?.profile
        ?.ratingBlend,
      1500
    );

  const ratingB =
    finite(
      match.playerB
        ?.profile
        ?.ratingBlend,
      1500
    );

  const eloMatchesA =
    Math.max(
      0,
      finite(
        match.playerA
          ?.profile
          ?.eloMatches,
        0
      )
    );

  const eloMatchesB =
    Math.max(
      0,
      finite(
        match.playerB
          ?.profile
          ?.eloMatches,
        0
      )
    );

  const ratingEvidence =
    clamp(
      Math.min(
        eloMatchesA,
        eloMatchesB
      ) / 30,
      0,
      1
    );

  const ratingGapPp =
    clamp(
      (
        ratingA -
        ratingB
      ) / 50,
      -8,
      8
    ) *
    ratingEvidence;

  const strengthGapPp =
    0.65 *
    gameGapPp +
    0.25 *
    pointGapPp +
    0.10 *
    ratingGapPp;

  const relA =
    clamp(
      finite(
        matchup.playerA
          ?.reliabilityPct,
        0
      ) / 100,
      0,
      1
    );

  const relB =
    clamp(
      finite(
        matchup.playerB
          ?.reliabilityPct,
        0
      ) / 100,
      0,
      1
    );

  const minimumReliability =
    Math.min(
      relA,
      relB
    );

  const trust =
    matchup.dataTrust
      ?.level ||
    'UNKNOWN';

  const evidenceFactor =
    clamp(
      (
        0.60 +
        0.40 *
        minimumReliability
      ) *
      trustFactor(trust),
      0.45,
      0.98
    );

  const baseHoldA =
    finite(
      matchup.playerA
        ?.holdPct,
      baseline.hold
    );

  const baseHoldB =
    finite(
      matchup.playerB
        ?.holdPct,
      baseline.hold
    );

  const baseHoldGapPp =
    baseHoldA -
    baseHoldB;

  const targetHoldGapPp =
    clamp(
      strengthGapPp *
      3.20,
      -20,
      20
    );

  const correctionGapPp =
    clamp(
      (
        targetHoldGapPp -
        baseHoldGapPp
      ) *
      evidenceFactor,
      -14,
      14
    );

  const holdShiftAPp =
    correctionGapPp / 2;

  const holdShiftBPp =
    -holdShiftAPp;

  const calibratedHoldA =
    clamp(
      baseHoldA +
      holdShiftAPp,
      45,
      96
    );

  const calibratedHoldB =
    clamp(
      baseHoldB +
      holdShiftBPp,
      45,
      96
    );

  const calibratedHoldGapPp =
    calibratedHoldA -
    calibratedHoldB;

  const gapExpansionPp =
    Math.abs(
      calibratedHoldGapPp
    ) -
    Math.abs(
      baseHoldGapPp
    );

  const compressionBefore =
    Math.abs(
      strengthGapPp
    ) >= 3 &&
    Math.abs(
      baseHoldGapPp
    ) <= 4;

  const dominantSide =
    Math.abs(
      strengthGapPp
    ) < 0.75
      ? 'BALANCED'
      : strengthGapPp > 0
        ? 'A'
        : 'B';

  return {
    available: true,
    version: 'ML-0.1.0',

    status:
      Math.abs(
        correctionGapPp
      ) >= 0.75
        ? 'ACTIVE'
        : 'MINOR',

    dominantSide,

    trust,

    minimumReliabilityPct:
      round1(
        minimumReliability *
        100
      ),

    evidencePct:
      round1(
        evidenceFactor *
        100
      ),

    components: {
      gameGapPp:
        round2(
          gameGapPp
        ),

      pointGapPp:
        round2(
          pointGapPp
        ),

      ratingGapPp:
        round2(
          ratingGapPp
        )
    },

    strengthGapPp:
      round2(
        strengthGapPp
      ),

    baseHoldA:
      round2(
        baseHoldA
      ),

    baseHoldB:
      round2(
        baseHoldB
      ),

    baseHoldGapPp:
      round2(
        baseHoldGapPp
      ),

    targetHoldGapPp:
      round2(
        targetHoldGapPp
      ),

    correctionGapPp:
      round2(
        correctionGapPp
      ),

    holdShiftAPp:
      round2(
        holdShiftAPp
      ),

    holdShiftBPp:
      round2(
        holdShiftBPp
      ),

    calibratedHoldA:
      round2(
        calibratedHoldA
      ),

    calibratedHoldB:
      round2(
        calibratedHoldB
      ),

    calibratedHoldGapPp:
      round2(
        calibratedHoldGapPp
      ),

    gapExpansionPp:
      round2(
        gapExpansionPp
      ),

    compressionBefore
  };
}

export function prepareMatchLength(
  match
) {
  return {
    ...match,

    lengthCalibration:
      buildMatchLengthCalibration(
        match
      )
  };
}

export function fairLineFromCurve(
  curve
) {
  const rows =
    (curve || [])
      .filter(
        row =>
          Number.isFinite(
            Number(row.line)
          ) &&
          Number.isFinite(
            Number(row.overPct)
          )
      );

  if (!rows.length) {
    return null;
  }

  const best =
    [...rows].sort(
      (a, b) => {
        const da =
          Math.abs(
            Number(a.overPct) -
            50
          );

        const db =
          Math.abs(
            Number(b.overPct) -
            50
          );

        if (da !== db) {
          return da - db;
        }

        return (
          Number(a.line) -
          Number(b.line)
        );
      }
    )[0];

  return {
    line:
      Number(best.line),

    overPct:
      Number(best.overPct),

    underPct:
      Number(best.underPct)
  };
}

export function summarizeMatchLength(
  matches
) {
  const rows =
    (matches || [])
      .filter(
        match =>
          match?.totals &&
          Number.isFinite(
            Number(
              match.totals
                .expectedGames
            )
          )
      )
      .map(
        match => ({
          expected:
            Number(
              match.totals
                .expectedGames
            ),

          deciding:
            Number(
              match.totals
                .decidingSetPct || 0
            ),

          fairLine:
            Number(
              match.totals
                ?.lengthAudit
                ?.fairLine
            ),

          status:
            match.totals
              ?.lengthAudit
              ?.status ||
            'UNKNOWN'
        })
      );

  const n =
    rows.length;

  if (!n) {
    return {
      n: 0,
      status: 'WAIT',
      expectedMin: null,
      expectedMax: null,
      expectedRange: null,
      decidingMin: null,
      decidingMax: null,
      avgDeciding: null,
      flatDecidingPct: 0,
      compressionCount: 0,
      fairMin: null,
      fairMax: null
    };
  }

  const expected =
    rows.map(
      row =>
        row.expected
    );

  const deciding =
    rows.map(
      row =>
        row.deciding
    );

  const fair =
    rows
      .map(
        row =>
          row.fairLine
      )
      .filter(
        Number.isFinite
      );

  const expectedMin =
    Math.min(
      ...expected
    );

  const expectedMax =
    Math.max(
      ...expected
    );

  const expectedRange =
    expectedMax -
    expectedMin;

  const decidingMin =
    Math.min(
      ...deciding
    );

  const decidingMax =
    Math.max(
      ...deciding
    );

  const flatDecidingCount =
    deciding.filter(
      value =>
        value >= 47.5
    ).length;

  const flatDecidingPct =
    flatDecidingCount /
    n *
    100;

  const compressionCount =
    rows.filter(
      row =>
        row.status ===
        'COMPRESSION'
    ).length;

  let status =
    n < 5
      ? 'EARLY'
      : 'OK';

  if (
    n >= 10 &&
    (
      expectedRange <= 1.75 ||
      flatDecidingPct >= 75 ||
      compressionCount > 0
    )
  ) {
    status = 'AUDIT';

  } else if (
    n >= 10 &&
    (
      expectedRange <= 2.50 ||
      flatDecidingPct >= 55
    )
  ) {
    status = 'WATCH';
  }

  return {
    n,
    status,

    expectedMin:
      round2(
        expectedMin
      ),

    expectedMax:
      round2(
        expectedMax
      ),

    expectedRange:
      round2(
        expectedRange
      ),

    decidingMin:
      round1(
        decidingMin
      ),

    decidingMax:
      round1(
        decidingMax
      ),

    avgDeciding:
      round1(
        mean(deciding)
      ),

    flatDecidingPct:
      round1(
        flatDecidingPct
      ),

    compressionCount,

    fairMin:
      fair.length
        ? Math.min(
            ...fair
          )
        : null,

    fairMax:
      fair.length
        ? Math.max(
            ...fair
          )
        : null
  };
}
'''

(ROOT / "src/engine/matchLength.js").write_text(
    match_length + "\n",
    encoding="utf-8"
)
print("✓ creado src/engine/matchLength.js")

monte = ROOT / "src/engine/montecarlo.js"

patch_once(
    monte,
    r'''  return {
    totalGames,
    tiebreaks,
    setsPlayed
  };
}
''',
    r'''  return {
    totalGames,
    tiebreaks,
    setsPlayed,

    setsA,
    setsB,

    winner:
      setsA >
      setsB
        ? 0
        : 1
  };
}
''',
    "Monte Carlo expone marcador de sets"
)

patch_once(
    monte,
    r'''  const holdA =
    clamp(
      Number(
        matchup
          .playerA
          .holdPct
      ) / 100
    );

  const holdB =
    clamp(
      Number(
        matchup
          .playerB
          .holdPct
      ) / 100
    );
''',
    r'''  const baseHoldA =
    clamp(
      Number(
        matchup
          .playerA
          .holdPct
      ) / 100
    );

  const baseHoldB =
    clamp(
      Number(
        matchup
          .playerB
          .holdPct
      ) / 100
    );

  const holdShiftA =
    Number(
      match.lengthCalibration
        ?.holdShiftAPp || 0
    ) / 100;

  const holdShiftB =
    Number(
      match.lengthCalibration
        ?.holdShiftBPp || 0
    ) / 100;

  const holdA =
    clamp(
      baseHoldA +
      holdShiftA
    );

  const holdB =
    clamp(
      baseHoldB +
      holdShiftB
    );
''',
    "Monte Carlo aplica Match Length Calibration"
)

patch_once(
    monte,
    r'''      holdA.toFixed(5),
      holdB.toFixed(5),
      bestOf,
''',
    r'''      holdA.toFixed(5),
      holdB.toFixed(5),
      holdShiftA.toFixed(5),
      holdShiftB.toFixed(5),
      bestOf,
''',
    "Fingerprint incluye length shift"
)

patch_once(
    monte,
    r'''  let decidingSets = 0;
  let straightSets = 0;

  const setsNeeded =
''',
    r'''  let decidingSets = 0;
  let straightSets = 0;

  let matchWinsA = 0;
  let matchWinsB = 0;

  let setsWonA = 0;
  let setsWonB = 0;

  const scoreCounts = {};

  const setsNeeded =
''',
    "Monte Carlo inicia outcome audit"
)

patch_once(
    monte,
    r'''    sumSets +=
      result.setsPlayed;

    totalTiebreaks +=
''',
    r'''    sumSets +=
      result.setsPlayed;

    setsWonA +=
      result.setsA;

    setsWonB +=
      result.setsB;

    if (
      result.winner === 0
    ) {
      matchWinsA++;
    } else {
      matchWinsB++;
    }

    const scoreKey =
      `${result.setsA}-${result.setsB}`;

    scoreCounts[
      scoreKey
    ] =
      (
        scoreCounts[
          scoreKey
        ] || 0
      ) + 1;

    totalTiebreaks +=
''',
    "Monte Carlo acumula winners y scorelines"
)

patch_once(
    monte,
    r'''  const curve =
    buildCurve(
      distribution,
      median,
      simulations
    );

  return {
    version: 'MC-0.3.0',
''',
    r'''  const curve =
    buildCurve(
      distribution,
      median,
      simulations
    );

  const totalSetsWon =
    setsWonA +
    setsWonB;

  const scoreProbabilities =
    Object.fromEntries(
      Object.entries(
        scoreCounts
      ).map(
        ([key, count]) => [
          key,
          pct(
            count /
            simulations
          )
        ]
      )
    );

  return {
    version: 'MC-0.4.0-LENGTH',
''',
    "Monte Carlo prepara outcome summary"
)

patch_once(
    monte,
    r'''    straightSetsPct:
      pct(
        straightSets /
        simulations
      ),

    tiebreakPct:
''',
    r'''    straightSetsPct:
      pct(
        straightSets /
        simulations
      ),

    matchWinPctA:
      pct(
        matchWinsA /
        simulations
      ),

    matchWinPctB:
      pct(
        matchWinsB /
        simulations
      ),

    setWinPctA:
      totalSetsWon
        ? pct(
            setsWonA /
            totalSetsWon
          )
        : 50,

    setWinPctB:
      totalSetsWon
        ? pct(
            setsWonB /
            totalSetsWon
          )
        : 50,

    scoreProbabilities,

    lengthCalibration: {
      version:
        match.lengthCalibration
          ?.version ||
        null,

      status:
        match.lengthCalibration
          ?.status ||
        'OFF',

      baseHoldAPct:
        Math.round(
          baseHoldA *
          10000
        ) / 100,

      baseHoldBPct:
        Math.round(
          baseHoldB *
          10000
        ) / 100,

      finalHoldAPct:
        Math.round(
          holdA *
          10000
        ) / 100,

      finalHoldBPct:
        Math.round(
          holdB *
          10000
        ) / 100,

      holdShiftAPp:
        Math.round(
          holdShiftA *
          10000
        ) / 100,

      holdShiftBPp:
        Math.round(
          holdShiftB *
          10000
        ) / 100
    },

    tiebreakPct:
''',
    "Monte Carlo devuelve Match Length Audit"
)

ensemble = ROOT / "src/engine/ensemble.js"

patch_once(
    ensemble,
    r'''import {
  simulateEloTotals
} from './eloLength.js';

/*
''',
    r'''import {
  simulateEloTotals
} from './eloLength.js';

import {
  prepareMatchLength,
  fairLineFromCurve
} from './matchLength.js';

/*
''',
    "Ensemble importa Match Length"
)

patch_once(
    ensemble,
    r'''function weightedMetric(
  structural,
  bayesian,
  elo,
  weights,
  key
) {
  return (
    weights.structural *
    Number(
      structural[key] || 0
    ) +
    weights.bayesian *
    Number(
      bayesian[key] || 0
    ) +
    weights.elo *
    Number(
      elo[key] || 0
    )
  );
}

function consensusStatus(
''',
    r'''function weightedMetric(
  structural,
  bayesian,
  elo,
  weights,
  key
) {
  return (
    weights.structural *
    Number(
      structural[key] || 0
    ) +
    weights.bayesian *
    Number(
      bayesian[key] || 0
    ) +
    weights.elo *
    Number(
      elo[key] || 0
    )
  );
}

function weightedScoreProbability(
  structural,
  bayesian,
  elo,
  weights,
  key
) {
  return (
    weights.structural *
    Number(
      structural
        .scoreProbabilities
        ?.[key] || 0
    ) +
    weights.bayesian *
    Number(
      bayesian
        .scoreProbabilities
        ?.[key] || 0
    ) +
    weights.elo *
    Number(
      elo
        .scoreProbabilities
        ?.[key] || 0
    )
  );
}

function buildLengthAudit(
  structural,
  bayesian,
  elo,
  weights,
  curve,
  calibration
) {
  const decidingSetPct =
    weightedMetric(
      structural,
      bayesian,
      elo,
      weights,
      'decidingSetPct'
    );

  const straightSetsPct =
    weightedMetric(
      structural,
      bayesian,
      elo,
      weights,
      'straightSetsPct'
    );

  const matchWinPctA =
    weightedMetric(
      structural,
      bayesian,
      elo,
      weights,
      'matchWinPctA'
    );

  const matchWinPctB =
    weightedMetric(
      structural,
      bayesian,
      elo,
      weights,
      'matchWinPctB'
    );

  const setWinPctA =
    weightedMetric(
      structural,
      bayesian,
      elo,
      weights,
      'setWinPctA'
    );

  const setWinPctB =
    weightedMetric(
      structural,
      bayesian,
      elo,
      weights,
      'setWinPctB'
    );

  const keys =
    new Set([
      ...Object.keys(
        structural
          .scoreProbabilities ||
        {}
      ),
      ...Object.keys(
        bayesian
          .scoreProbabilities ||
        {}
      ),
      ...Object.keys(
        elo
          .scoreProbabilities ||
        {}
      )
    ]);

  const scoreProbabilities =
    Object.fromEntries(
      [...keys].map(
        key => [
          key,
          round1(
            weightedScoreProbability(
              structural,
              bayesian,
              elo,
              weights,
              key
            )
          )
        ]
      )
    );

  const fair =
    fairLineFromCurve(
      curve
    );

  const strengthAbs =
    Math.abs(
      Number(
        calibration
          ?.strengthGapPp ||
        0
      )
    );

  let status =
    'OK';

  if (
    strengthAbs >= 3.5 &&
    decidingSetPct >= 47.5
  ) {
    status =
      'COMPRESSION';

  } else if (
    strengthAbs >= 2.5 &&
    decidingSetPct >= 45.5
  ) {
    status =
      'WATCH';
  }

  return {
    version:
      'MATCH-LENGTH-0.1.0',

    status,

    fairLine:
      fair?.line ??
      null,

    fairOverPct:
      fair?.overPct ??
      null,

    fairUnderPct:
      fair?.underPct ??
      null,

    matchWinPctA:
      round1(
        matchWinPctA
      ),

    matchWinPctB:
      round1(
        matchWinPctB
      ),

    setWinPctA:
      round1(
        setWinPctA
      ),

    setWinPctB:
      round1(
        setWinPctB
      ),

    straightSetsPct:
      round1(
        straightSetsPct
      ),

    decidingSetPct:
      round1(
        decidingSetPct
      ),

    scoreProbabilities,

    calibration:
      calibration ||
      null
  };
}

function consensusStatus(
''',
    "Ensemble agrega Length Audit"
)

patch_once(
    ensemble,
    r'''export function simulateEnsembleTotals(
  match,
  structuralSimulations = 40000
) {
  const structural =
    simulateMatchTotals(
      match,
      structuralSimulations
    );
''',
    r'''export function simulateEnsembleTotals(
  match,
  structuralSimulations = 40000
) {
  const preparedMatch =
    prepareMatchLength(
      match
    );

  const structural =
    simulateMatchTotals(
      preparedMatch,
      structuralSimulations
    );
''',
    "Ensemble prepara Match Length"
)

patch_once(
    ensemble,
    r'''  const bayesian =
    simulateBayesianTotals(
      match,
      targetLines,
      40000
    );

  const elo =
    simulateEloTotals(
      match,
      20000
    );
''',
    r'''  const bayesian =
    simulateBayesianTotals(
      preparedMatch,
      targetLines,
      40000
    );

  const elo =
    simulateEloTotals(
      preparedMatch,
      20000
    );
''',
    "Bayes/Elo reciben la misma calibración"
)

patch_once(
    ensemble,
    r'''  const expectedGames =
    weightedMetric(
      structural,
      bayesian,
      elo,
      weights,
      'expectedGames'
    );

  const variance =
''',
    r'''  const expectedGames =
    weightedMetric(
      structural,
      bayesian,
      elo,
      weights,
      'expectedGames'
    );

  const lengthAudit =
    buildLengthAudit(
      structural,
      bayesian,
      elo,
      weights,
      curve,
      preparedMatch
        .lengthCalibration
    );

  const variance =
''',
    "Ensemble calcula Fair Line"
)

patch_once(
    ensemble,
    r'''    version:
      'ENSEMBLE-0.5.0-BIASGUARD',
''',
    r'''    version:
      'ENSEMBLE-0.6.0-FAIRLINE',
''',
    "Ensemble version Fair Line"
)

patch_once(
    ensemble,
    r'''    curve,

    weights: {
''',
    r'''    curve,

    lengthAudit,

    weights: {
''',
    "Ensemble expone lengthAudit"
)

patch_once(
    ensemble,
    r'''      correlationGuard:
        true,

      consensusStatus:
''',
    r'''      correlationGuard:
        true,

      lengthStatus:
        lengthAudit.status,

      fairLine:
        lengthAudit.fairLine,

      consensusStatus:
''',
    "Diagnostics expone Length status"
)

market = ROOT / "src/engine/market.js"

patch_once(
    market,
    r'''  const biasGuard =
    marketBiasGuard(
      match.totals
        ?.expectedGames,
      market.line
    );

  const eligible =
    readiness.eligible &&
    !shadowBlocked &&
    !biasGuard.blocked;
''',
    r'''  const biasGuard =
    marketBiasGuard(
      match.totals
        ?.expectedGames,
      market.line
    );

  const lengthStatus =
    match.totals
      ?.lengthAudit
      ?.status ||
    'UNKNOWN';

  const lengthBlocked =
    lengthStatus ===
    'COMPRESSION';

  const eligible =
    readiness.eligible &&
    !shadowBlocked &&
    !biasGuard.blocked &&
    !lengthBlocked;
''',
    "Market bloquea LENGTH COMPRESSION"
)

patch_once(
    market,
    r'''      biasGuardStatus:
        biasGuard.status,

      biasGuardBlocked:
        biasGuard.blocked
    },

    reason:
''',
    r'''      biasGuardStatus:
        biasGuard.status,

      biasGuardBlocked:
        biasGuard.blocked,

      lengthStatus,

      lengthBlocked
    },

    reason:
''',
    "Market audita Length status"
)

patch_once(
    market,
    r'''              : shadowBlocked
                ? 'SHADOW_CAUTION'
                : biasGuard.blocked
                  ? 'MODEL_MARKET_GAP'
                  : 'DATA_GATE'
''',
    r'''              : shadowBlocked
                ? 'SHADOW_CAUTION'
                : biasGuard.blocked
                  ? 'MODEL_MARKET_GAP'
                  : lengthBlocked
                    ? 'LENGTH_COMPRESSION'
                    : 'DATA_GATE'
''',
    "Market reason LENGTH_COMPRESSION"
)

censo = ROOT / "src/engine/censo.js"

patch_once(
    censo,
    r'''    appVersion:
      '0.6.8.1',
''',
    r'''    appVersion:
      '0.6.8.2',
''',
    "Censo appVersion 0.6.8.2"
)

patch_once(
    censo,
    r'''    holdAudit: {
''',
    r'''    matchLengthAudit: {
      status:
        match.totals
          ?.lengthAudit
          ?.status ??
        null,

      fairLine:
        match.totals
          ?.lengthAudit
          ?.fairLine ??
        null,

      matchWinPctA:
        match.totals
          ?.lengthAudit
          ?.matchWinPctA ??
        null,

      matchWinPctB:
        match.totals
          ?.lengthAudit
          ?.matchWinPctB ??
        null,

      straightSetsPct:
        match.totals
          ?.lengthAudit
          ?.straightSetsPct ??
        null,

      decidingSetPct:
        match.totals
          ?.lengthAudit
          ?.decidingSetPct ??
        null,

      calibration:
        match.totals
          ?.lengthAudit
          ?.calibration ??
        null
    },

    holdAudit: {
''',
    "Censo congela Match Length Audit"
)

worker = ROOT / "src/workers/totals.worker.js"

patch_once(
    worker,
    r'''import {
  shadowDriftStatus
} from '../engine/dataTrust.js';

function round1(value) {
''',
    r'''import {
  shadowDriftStatus
} from '../engine/dataTrust.js';

import {
  prepareMatchLength
} from '../engine/matchLength.js';

function round1(value) {
''',
    "Worker importa Match Length"
)

patch_once(
    worker,
    r'''          const coverageMarkov = simulateMatchTotals(match, 5000);
          const coreMarkov = simulateMatchTotals({ ...match, matchup: shadowCore }, 5000);
''',
    r'''          const coveragePrepared =
            prepareMatchLength(
              match
            );

          const coreMatch = {
            ...match,

            playerA: {
              ...match.playerA,
              profile:
                match.playerA
                  ?.coreProfile ||
                match.playerA
                  ?.profile
            },

            playerB: {
              ...match.playerB,
              profile:
                match.playerB
                  ?.coreProfile ||
                match.playerB
                  ?.profile
            },

            matchup: {
              ...shadowCore,

              baseline:
                match.matchup
                  ?.baseline,

              dataTrust:
                match.matchup
                  ?.dataTrust
            }
          };

          const corePrepared =
            prepareMatchLength(
              coreMatch
            );

          const coverageMarkov =
            simulateMatchTotals(
              coveragePrepared,
              5000
            );

          const coreMarkov =
            simulateMatchTotals(
              corePrepared,
              5000
            );
''',
    "Shadow usa Fair Line Calibration"
)

v0682_ui = r'''import {
  summarizeMatchLength
} from './engine/matchLength.js';

function ensurePanel() {
  let panel =
    document.querySelector(
      '#matchLengthAuditPanel'
    );

  if (panel) {
    return panel;
  }

  const direction =
    document.querySelector(
      '#directionBiasPanel'
    );

  const totals =
    document.querySelector(
      '#totalsEnginePanel'
    );

  const anchor =
    direction ||
    totals;

  if (!anchor) {
    return null;
  }

  anchor.insertAdjacentHTML(
    'afterend',
    `
      <section
        id="matchLengthAuditPanel"
        class="match-length-global wait">

        <div class="match-length-global-head">
          <div>
            <span>MATCH LENGTH AUDIT</span>
            <strong>Esperando distribuciones...</strong>
          </div>

          <b id="matchLengthGlobalBadge">
            WAIT
          </b>
        </div>

        <div class="match-length-global-grid">
          <div>
            <span>MODELED</span>
            <strong id="mlModeled">0</strong>
          </div>

          <div>
            <span>EXPECTED RANGE</span>
            <strong id="mlExpectedRange">—</strong>
          </div>

          <div>
            <span>DECIDING RANGE</span>
            <strong id="mlDecidingRange">—</strong>
          </div>

          <div>
            <span>FAIR RANGE</span>
            <strong id="mlFairRange">—</strong>
          </div>
        </div>

        <div class="match-length-global-foot">
          <span>
            47.5–50% DECIDING
            <strong id="mlFlatPct">—</strong>
          </span>

          <span>
            COMPRESSION
            <strong id="mlCompression">0</strong>
          </span>

          <span>
            AVG DECIDING
            <strong id="mlAvgDeciding">—</strong>
          </span>
        </div>
      </section>
    `
  );

  return document.querySelector(
    '#matchLengthAuditPanel'
  );
}

export function renderMatchLengthAudit(
  matches
) {
  const panel =
    ensurePanel();

  if (!panel) {
    return;
  }

  const audit =
    summarizeMatchLength(
      matches
    );

  const set = (
    selector,
    value
  ) => {
    const el =
      panel.querySelector(
        selector
      );

    if (el) {
      el.textContent =
        String(value);
    }
  };

  set(
    '#mlModeled',
    audit.n
  );

  set(
    '#mlExpectedRange',
    audit.expectedRange === null
      ? '—'
      : `${audit.expectedMin.toFixed(2)}–${audit.expectedMax.toFixed(2)} · Δ${audit.expectedRange.toFixed(2)}`
  );

  set(
    '#mlDecidingRange',
    audit.decidingMin === null
      ? '—'
      : `${audit.decidingMin.toFixed(1)}–${audit.decidingMax.toFixed(1)}%`
  );

  set(
    '#mlFairRange',
    audit.fairMin === null
      ? '—'
      : `${audit.fairMin.toFixed(1)}–${audit.fairMax.toFixed(1)}`
  );

  set(
    '#mlFlatPct',
    audit.n
      ? `${audit.flatDecidingPct.toFixed(1)}%`
      : '—'
  );

  set(
    '#mlCompression',
    audit.compressionCount
  );

  set(
    '#mlAvgDeciding',
    audit.avgDeciding === null
      ? '—'
      : `${audit.avgDeciding.toFixed(1)}%`
  );

  panel.className =
    `match-length-global ${audit.status.toLowerCase()}`;

  const badge =
    panel.querySelector(
      '#matchLengthGlobalBadge'
    );

  if (badge) {
    badge.textContent =
      audit.status;
  }

  const title =
    panel.querySelector(
      '.match-length-global-head strong'
    );

  if (title) {
    title.textContent =
      audit.status === 'AUDIT'
        ? 'Compresión de longitud detectada'
        : audit.status === 'WATCH'
          ? 'Dispersión todavía estrecha'
          : audit.status === 'OK'
            ? 'Longitud diferenciada por partido'
            : audit.status === 'EARLY'
              ? 'Muestra temprana'
              : 'Esperando distribuciones...';
  }
}
'''

(ROOT / "src/v0682-ui.js").write_text(
    v0682_ui + "\n",
    encoding="utf-8"
)
print("✓ creado src/v0682-ui.js")

main = ROOT / "src/main.js"

patch_once(
    main,
    r'''import {
  renderDirectionAudit
} from './v0681-ui.js';
import { getTodayMatches } from './data/espn.js';
''',
    r'''import {
  renderDirectionAudit
} from './v0681-ui.js';

import {
  renderMatchLengthAudit
} from './v0682-ui.js';

import { getTodayMatches } from './data/espn.js';
''',
    "Main importa Match Length UI"
)

patch_once(
    main,
    r'''        <div class="version">ATP + WTA · v0.6.8.1</div>
''',
    r'''        <div class="version">ATP + WTA · v0.6.8.2</div>
''',
    "Versión visible 0.6.8.2"
)

patch_once(
    main,
    r'''    match.matchup?.playerA?.holdPct,
    match.matchup?.playerB?.holdPct,
    TOTALS_SIMULATIONS
''',
    r'''    match.matchup?.playerA?.holdPct,
    match.matchup?.playerB?.holdPct,

    match.playerA
      ?.profile
      ?.holdPct,

    match.playerA
      ?.profile
      ?.breakPct,

    match.playerA
      ?.profile
      ?.ratingBlend,

    match.playerB
      ?.profile
      ?.holdPct,

    match.playerB
      ?.profile
      ?.breakPct,

    match.playerB
      ?.profile
      ?.ratingBlend,

    'ML-0.1.0',
    TOTALS_SIMULATIONS
''',
    "Totals cache incluye fuerza histórica"
)

patch_once(
    main,
    r'''}

function totalsPanel(match) {
''',
    r'''}

function matchLengthPanel(
  match,
  totals
) {
  const audit =
    totals?.lengthAudit;

  if (!audit) {
    return '';
  }

  const calibration =
    audit.calibration || {};

  const status =
    audit.status ||
    'UNKNOWN';

  const score =
    audit.scoreProbabilities ||
    {};

  const scoreRows =
    totals.bestOf === 3
      ? [
          ['2-0 A', score['2-0']],
          ['2-1 A', score['2-1']],
          ['0-2 B', score['0-2']],
          ['1-2 B', score['1-2']]
        ]
      : [];

  const holdBefore =
    Number.isFinite(
      Number(
        calibration
          .baseHoldGapPp
      )
    )
      ? Number(
          calibration
            .baseHoldGapPp
        ).toFixed(1)
      : '—';

  const holdAfter =
    Number.isFinite(
      Number(
        calibration
          .calibratedHoldGapPp
      )
    )
      ? Number(
          calibration
            .calibratedHoldGapPp
        ).toFixed(1)
      : '—';

  const strength =
    Number.isFinite(
      Number(
        calibration
          .strengthGapPp
      )
    )
      ? `${
          Number(
            calibration
              .strengthGapPp
          ) >= 0
            ? '+'
            : ''
        }${Number(
          calibration
            .strengthGapPp
        ).toFixed(2)}`
      : '—';

  return `
    <div class="match-length-card ${status.toLowerCase()}">

      <div class="match-length-card-head">
        <div>
          <span>MATCH LENGTH · FAIR LINE</span>
          <strong>
            ${calibration.dominantSide === 'A'
              ? `${match.playerA.shortName || match.playerA.name} EDGE`
              : calibration.dominantSide === 'B'
                ? `${match.playerB.shortName || match.playerB.name} EDGE`
                : 'BALANCED'}
          </strong>
        </div>

        <b>${status}</b>
      </div>

      <div class="match-length-card-grid">

        <div>
          <span>FAIR TOTAL</span>
          <strong>
            ${audit.fairLine !== null
              ? audit.fairLine.toFixed(1)
              : '—'}
          </strong>
        </div>

        <div>
          <span>A MATCH WIN</span>
          <strong>
            ${audit.matchWinPctA.toFixed(1)}%
          </strong>
        </div>

        <div>
          <span>B MATCH WIN</span>
          <strong>
            ${audit.matchWinPctB.toFixed(1)}%
          </strong>
        </div>

        <div>
          <span>STRAIGHT SETS</span>
          <strong>
            ${audit.straightSetsPct.toFixed(1)}%
          </strong>
        </div>

        <div>
          <span>DECIDING SET</span>
          <strong>
            ${audit.decidingSetPct.toFixed(1)}%
          </strong>
        </div>

        <div>
          <span>STRENGTH GAP</span>
          <strong>
            ${strength} pp
          </strong>
        </div>

        <div>
          <span>HOLD GAP</span>
          <strong>
            ${holdBefore} → ${holdAfter} pp
          </strong>
        </div>

        <div>
          <span>EVIDENCE</span>
          <strong>
            ${Number(
              calibration
                .evidencePct || 0
            ).toFixed(1)}%
          </strong>
        </div>

      </div>

      ${
        scoreRows.length
          ? `
            <div class="match-length-scorelines">
              ${scoreRows.map(
                ([label, value]) => `
                  <span>
                    ${label}
                    <strong>
                      ${Number(value || 0).toFixed(1)}%
                    </strong>
                  </span>
                `
              ).join('')}
            </div>
          `
          : ''
      }

      ${
        status === 'COMPRESSION'
          ? `
            <div class="match-length-warning">
              LENGTH COMPRESSION · MARKET BLOQUEADO
            </div>
          `
          : status === 'WATCH'
            ? `
              <div class="match-length-watch">
                LENGTH WATCH · revisar diferencia de fuerza
              </div>
            `
            : ''
      }

    </div>
  `;
}

function totalsPanel(match) {
''',
    "Main agrega Match Length panel por partido"
)

patch_once(
    main,
    r'''      ${
        totals.shadowAudit?.available
''',
    r'''      ${matchLengthPanel(
        match,
        totals
      )}

      ${
        totals.shadowAudit?.available
''',
    "Totals detail muestra Fair Line audit"
)

patch_once(
    main,
    r'''  renderLabBank();
  renderDirectionAudit(matches);

  const list = filteredMatches();
''',
    r'''  renderLabBank();
  renderDirectionAudit(matches);
  renderMatchLengthAudit(matches);

  const list = filteredMatches();
''',
    "Render global Match Length Audit"
)

css = r'''
/* v0.6.8.2 — FAIR LINE & MATCH LENGTH ENGINE */

.match-length-global,
.match-length-card {
  overflow: hidden;
  border: 1px solid #284437;
  border-radius: 16px;
  background: #07160f;
}

.match-length-global {
  margin: 14px 0 20px;
}

.match-length-global-head,
.match-length-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 15px;
  border-bottom: 1px solid #1c3428;
}

.match-length-global-head span,
.match-length-card-head span {
  display: block;
  color: #5ee89c;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: .12em;
}

.match-length-global-head strong,
.match-length-card-head strong {
  display: block;
  margin-top: 4px;
  color: #eef6f1;
  font-size: 13px;
}

.match-length-global-head b,
.match-length-card-head b {
  padding: 7px 9px;
  border-radius: 9px;
  background: #103420;
  color: #68e8a1;
  font-size: 8px;
}

.match-length-global-grid,
.match-length-card-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: #193128;
}

.match-length-global-grid > div,
.match-length-card-grid > div {
  padding: 12px 10px;
  background: #081810;
}

.match-length-global-grid span,
.match-length-card-grid span {
  display: block;
  color: #667b70;
  font-size: 7px;
  font-weight: 900;
}

.match-length-global-grid strong,
.match-length-card-grid strong {
  display: block;
  margin-top: 5px;
  color: #edf5f0;
  font-size: 13px;
}

.match-length-global-foot {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: #183027;
}

.match-length-global-foot > span {
  padding: 11px;
  background: #091810;
  color: #61766a;
  font-size: 7px;
  font-weight: 900;
}

.match-length-global-foot strong {
  display: block;
  margin-top: 4px;
  color: #e8f1ec;
  font-size: 11px;
}

.match-length-global.audit {
  border-color: #77491f;
}

.match-length-global.audit .match-length-global-head {
  background: rgba(94, 50, 12, .20);
}

.match-length-global.audit .match-length-global-head b {
  color: #ffd18a;
  background: #4a2b11;
}

.match-length-global.watch .match-length-global-head b,
.match-length-global.early .match-length-global-head b {
  color: #e6ce76;
  background: #352c12;
}

.match-length-card {
  margin-top: 1px;
  border-left: 0;
  border-right: 0;
  border-radius: 0;
}

.match-length-card.watch {
  border-color: #5e4d22;
}

.match-length-card.compression {
  border-color: #75402e;
}

.match-length-card.compression .match-length-card-head {
  background: rgba(98, 43, 27, .16);
}

.match-length-scorelines {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: #183027;
}

.match-length-scorelines span {
  padding: 10px;
  background: #091810;
  color: #667a70;
  font-size: 7px;
  font-weight: 800;
}

.match-length-scorelines strong {
  display: block;
  margin-top: 4px;
  color: #edf5ef;
  font-size: 10px;
}

.match-length-warning,
.match-length-watch {
  padding: 10px 14px;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: .04em;
}

.match-length-warning {
  color: #ffb49a;
  background: #28130d;
}

.match-length-watch {
  color: #e6cb78;
  background: #211b0b;
}

@media (max-width: 430px) {
  .match-length-global-grid,
  .match-length-card-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .match-length-scorelines {
    grid-template-columns: repeat(2, 1fr);
  }
}
'''

style_path = ROOT / "src/style.css"
style = style_path.read_text(encoding="utf-8")
if "v0.6.8.2 — FAIR LINE & MATCH LENGTH ENGINE" not in style:
    style_path.write_text(
        style + "\n" + css,
        encoding="utf-8"
    )
    print("✓ CSS Fair Line agregado")
else:
    print("✓ CSS Fair Line ya existe")

tests = r'''import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMatchLengthCalibration,
  prepareMatchLength,
  fairLineFromCurve,
  summarizeMatchLength
} from '../src/engine/matchLength.js';

import {
  simulateMatchTotals
} from '../src/engine/montecarlo.js';

function profile({
  hold = 75,
  breakPct = 25,
  spw = 62,
  rpw = 38,
  rating = 1500,
  eloMatches = 30
} = {}) {
  return {
    holdPct: hold,
    breakPct,
    servePointsWonPct: spw,
    returnPointsWonPct: rpw,
    ratingBlend: rating,
    eloMatches
  };
}

function makeMatch({
  profileA = profile(),
  profileB = profile(),
  holdA = 80,
  holdB = 80,
  rel = 80,
  trust = 'HIGH',
  id = 'test-match'
} = {}) {
  return {
    id,
    tour: 'ATP',
    bestOf: 3,

    playerA: {
      name: 'Player A',
      profile: profileA
    },

    playerB: {
      name: 'Player B',
      profile: profileB
    },

    matchup: {
      markovReady: true,

      dataTrust: {
        level: trust
      },

      baseline: {
        servePointPct: 65,
        returnPointPct: 35,
        holdPct: 81.6,
        breakPct: 18.4
      },

      averageHoldPct:
        (holdA + holdB) / 2,

      playerA: {
        servePointPct: 64,
        holdPct: holdA,
        reliabilityPct: rel
      },

      playerB: {
        servePointPct: 64,
        holdPct: holdB,
        reliabilityPct: rel
      }
    }
  };
}

test('MatchLength: perfiles iguales no inventan gap', () => {
  const c =
    buildMatchLengthCalibration(
      makeMatch()
    );

  assert.equal(c.available, true);

  assert.ok(
    Math.abs(
      c.strengthGapPp
    ) < 0.001
  );
});

test('MatchLength: jugador A fuerte expande HOLD a favor de A', () => {
  const c =
    buildMatchLengthCalibration(
      makeMatch({
        profileA:
          profile({
            hold: 86,
            breakPct: 34,
            spw: 67,
            rpw: 43,
            rating: 1650
          }),

        profileB:
          profile({
            hold: 70,
            breakPct: 18,
            spw: 59,
            rpw: 34,
            rating: 1450
          })
      })
    );

  assert.ok(c.strengthGapPp > 0);
  assert.ok(c.holdShiftAPp > 0);
  assert.ok(c.holdShiftBPp < 0);
  assert.ok(c.calibratedHoldGapPp > c.baseHoldGapPp);
});

test('MatchLength: mirror produce dirección opuesta', () => {
  const strong =
    profile({
      hold: 86,
      breakPct: 34,
      spw: 67,
      rpw: 43,
      rating: 1650
    });

  const weak =
    profile({
      hold: 70,
      breakPct: 18,
      spw: 59,
      rpw: 34,
      rating: 1450
    });

  const a =
    buildMatchLengthCalibration(
      makeMatch({
        profileA: strong,
        profileB: weak
      })
    );

  const b =
    buildMatchLengthCalibration(
      makeMatch({
        profileA: weak,
        profileB: strong
      })
    );

  assert.ok(a.strengthGapPp > 0);
  assert.ok(b.strengthGapPp < 0);

  assert.ok(
    Math.abs(
      a.strengthGapPp +
      b.strengthGapPp
    ) < 0.05
  );
});

test('MatchLength: conserva el HOLD medio salvo clamps', () => {
  const c =
    buildMatchLengthCalibration(
      makeMatch({
        holdA: 79,
        holdB: 81,

        profileA:
          profile({
            hold: 82,
            breakPct: 31,
            spw: 65,
            rpw: 41
          }),

        profileB:
          profile({
            hold: 75,
            breakPct: 20,
            spw: 61,
            rpw: 36
          })
      })
    );

  const before =
    (
      c.baseHoldA +
      c.baseHoldB
    ) / 2;

  const after =
    (
      c.calibratedHoldA +
      c.calibratedHoldB
    ) / 2;

  assert.ok(
    Math.abs(
      before -
      after
    ) < 0.05
  );
});

test('MatchLength: CAUTION aplica menos corrección que HIGH', () => {
  const args = {
    profileA:
      profile({
        hold: 84,
        breakPct: 32,
        spw: 66,
        rpw: 42
      }),

    profileB:
      profile({
        hold: 72,
        breakPct: 20,
        spw: 60,
        rpw: 35
      })
  };

  const high =
    buildMatchLengthCalibration(
      makeMatch({
        ...args,
        trust: 'HIGH'
      })
    );

  const caution =
    buildMatchLengthCalibration(
      makeMatch({
        ...args,
        trust: 'CAUTION'
      })
    );

  assert.ok(
    Math.abs(
      caution.correctionGapPp
    ) <
    Math.abs(
      high.correctionGapPp
    )
  );
});

test('MatchLength: Fair Line elige la media línea más cercana a 50%', () => {
  const fair =
    fairLineFromCurve([
      {
        line: 21.5,
        overPct: 62,
        underPct: 38
      },
      {
        line: 22.5,
        overPct: 56,
        underPct: 44
      },
      {
        line: 23.5,
        overPct: 50.8,
        underPct: 49.2
      },
      {
        line: 24.5,
        overPct: 46,
        underPct: 54
      }
    ]);

  assert.equal(
    fair.line,
    23.5
  );
});

test('MatchLength: auditor global detecta compresión', () => {
  const matches =
    Array.from(
      { length: 12 },
      (_, index) => ({
        totals: {
          expectedGames:
            24.20 +
            index * 0.02,

          decidingSetPct:
            49.0,

          lengthAudit: {
            fairLine: 23.5,
            status:
              index === 0
                ? 'COMPRESSION'
                : 'WATCH'
          }
        }
      })
    );

  const audit =
    summarizeMatchLength(
      matches
    );

  assert.equal(
    audit.status,
    'AUDIT'
  );

  assert.ok(
    audit.expectedRange <
    1
  );
});

test('MatchLength: auditor global acepta dispersión real', () => {
  const expected = [
    19.8,
    20.7,
    21.6,
    22.4,
    23.1,
    23.8,
    24.5,
    25.1,
    25.7,
    26.2
  ];

  const matches =
    expected.map(
      (value, index) => ({
        totals: {
          expectedGames:
            value,

          decidingSetPct:
            25 +
            index * 2.2,

          lengthAudit: {
            fairLine:
              19.5 +
              index * 0.5,

            status: 'OK'
          }
        }
      })
    );

  const audit =
    summarizeMatchLength(
      matches
    );

  assert.equal(
    audit.status,
    'OK'
  );

  assert.ok(
    audit.expectedRange >
    5
  );
});

test('MatchLength: Monte Carlo devuelve scorelines que suman ~100%', () => {
  const result =
    simulateMatchTotals(
      makeMatch(),
      12000
    );

  const total =
    Object.values(
      result.scoreProbabilities
    ).reduce(
      (sum, value) =>
        sum + value,
      0
    );

  assert.ok(
    Math.abs(
      total -
      100
    ) <= 0.3
  );
});

test('MatchLength: gap fuerte reduce set decisivo vs modelo comprimido', () => {
  const match =
    makeMatch({
      id:
        'strong-gap',

      profileA:
        profile({
          hold: 88,
          breakPct: 36,
          spw: 68,
          rpw: 44,
          rating: 1700
        }),

      profileB:
        profile({
          hold: 68,
          breakPct: 16,
          spw: 58,
          rpw: 33,
          rating: 1400
        }),

      holdA: 80,
      holdB: 80,
      rel: 85,
      trust: 'HIGH'
    });

  const compressed =
    simulateMatchTotals(
      match,
      15000
    );

  const prepared =
    prepareMatchLength(
      match
    );

  const calibrated =
    simulateMatchTotals(
      prepared,
      15000
    );

  assert.ok(
    calibrated.decidingSetPct <
    compressed.decidingSetPct -
    3
  );

  assert.ok(
    calibrated.matchWinPctA >
    compressed.matchWinPctA +
    5
  );
});
'''

(ROOT / "tests/matchLength.test.js").write_text(
    tests + "\n",
    encoding="utf-8"
)
print("✓ creado tests/matchLength.test.js")

checks = {
    "package 0.6.8.2":
        '"version": "0.6.8.2"' in
        pkg_path.read_text(encoding="utf-8"),

    "main visible 0.6.8.2":
        "ATP + WTA · v0.6.8.2" in
        main.read_text(encoding="utf-8"),

    "Match Length engine":
        (ROOT / "src/engine/matchLength.js").exists(),

    "MC length calibration":
        "MC-0.4.0-LENGTH" in
        monte.read_text(encoding="utf-8"),

    "Ensemble fair line":
        "ENSEMBLE-0.6.0-FAIRLINE" in
        ensemble.read_text(encoding="utf-8"),

    "Market length gate":
        "LENGTH_COMPRESSION" in
        market.read_text(encoding="utf-8"),

    "Global UI":
        (ROOT / "src/v0682-ui.js").exists(),

    "Per-match UI":
        "MATCH LENGTH · FAIR LINE" in
        main.read_text(encoding="utf-8"),

    "Censo 0.6.8.2":
        "'0.6.8.2'" in
        censo.read_text(encoding="utf-8"),

    "Tests":
        (ROOT / "tests/matchLength.test.js").exists(),
}

bad = [
    name
    for name, ok
    in checks.items()
    if not ok
]

if bad:
    fail(
      "Sanity falló: " +
      ", ".join(bad)
    )

print("")
print("============================================================")
print("v0.6.8.2 — FAIR LINE & MATCH LENGTH ENGINE APLICADO")
print("============================================================")
for name in checks:
    print("✓", name)

print("")
print("QUÉ CAMBIÓ:")
print("  ✓ Strength Gap separado del HOLD promedio")
print("  ✓ Gap de HOLD se expande de forma acotada y simétrica")
print("  ✓ Markov/Bayes/Elo usan la misma señal de fortaleza")
print("  ✓ Monte Carlo devuelve match win + scorelines")
print("  ✓ Fair Total se calcula desde la distribución")
print("  ✓ Match Length Audit global funciona SIN mercado manual")
print("  ✓ COMPRESSION bloquea Market Engine")
print("  ✓ Censo congela el diagnóstico de longitud")
print("  ✓ Shadow CORE usa la misma calibración")
print("")
print("IMPORTANTE:")
print("  Esta versión NO intenta producir más UNDER.")
print("  Intenta producir líneas justas diferentes por partido.")
print("")
print("Ahora ejecuta:")
print("  node --check src/engine/matchLength.js")
print("  node --check src/engine/montecarlo.js")
print("  node --check src/engine/ensemble.js")
print("  node --check src/engine/market.js")
print("  node --check src/v0682-ui.js")
print("  node --check src/main.js")
print("  node --check src/workers/totals.worker.js")
print("  npm test")
print("")
print("Esperado: tests 70 · pass 70 · fail 0")
print("")
print("Si pasa 70/70:")
print("  npm run build")
print("  npx cap sync android")
print("")
print("NO HAGAS PUSH TODAVÍA.")
print("Primero revisamos 8–10 partidos y el MATCH LENGTH AUDIT.")
print("")
print(f"Backup local: {backup.name}")
