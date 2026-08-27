#!/usr/bin/env python3
from pathlib import Path
import re
import shutil
import datetime
import sys

ROOT = Path.home() / "tennis-totals-lab"
ENSEMBLE = ROOT / "src/engine/ensemble.js"
TEST = ROOT / "tests/outcomeMass.test.js"

if not ENSEMBLE.exists():
    print(f"[ERROR] No existe {ENSEMBLE}")
    sys.exit(1)

stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
backup = ROOT / f".v0682-outcome-mass-v2-backup-{stamp}"
backup.mkdir(parents=True, exist_ok=True)
shutil.copy2(ENSEMBLE, backup / "ensemble.js")
if TEST.exists():
    shutil.copy2(TEST, backup / "outcomeMass.test.js")

src = ENSEMBLE.read_text(encoding="utf-8")

weighted_metric_pattern = re.compile(
    r"function\s+weightedMetric\s*\(\s*"
    r"structural\s*,\s*bayesian\s*,\s*elo\s*,\s*weights\s*,\s*key\s*"
    r"\)\s*\{.*?\n\}",
    re.S,
)

weighted_metric_replacement = '''export function weightedMetric(
  structural,
  bayesian,
  elo,
  weights,
  key
) {
  const sources = [
    [structural, weights.structural],
    [bayesian, weights.bayesian],
    [elo, weights.elo]
  ];

  let weighted = 0;
  let availableWeight = 0;

  for (const [model, weight] of sources) {
    const raw =
      model?.[key];

    if (
      raw === null ||
      raw === undefined ||
      raw === ''
    ) {
      continue;
    }

    const value =
      Number(raw);

    if (!Number.isFinite(value)) {
      continue;
    }

    weighted +=
      weight * value;

    availableWeight +=
      weight;
  }

  if (availableWeight <= 0) {
    return 0;
  }

  return (
    weighted /
    availableWeight
  );
}'''

src2, n1 = weighted_metric_pattern.subn(
    weighted_metric_replacement,
    src,
    count=1
)

if n1 != 1:
    print("[ERROR] No pude localizar weightedMetric con la estructura real.")
    print(f"Backup: {backup}")
    sys.exit(2)

weighted_score_pattern = re.compile(
    r"function\s+weightedScoreProbability\s*\(\s*"
    r"structural\s*,\s*bayesian\s*,\s*elo\s*,\s*weights\s*,\s*key\s*"
    r"\)\s*\{.*?\n\}",
    re.S,
)

weighted_score_replacement = '''export function weightedScoreProbability(
  structural,
  bayesian,
  elo,
  weights,
  key
) {
  const sources = [
    [
      structural?.scoreProbabilities,
      weights.structural
    ],
    [
      bayesian?.scoreProbabilities,
      weights.bayesian
    ],
    [
      elo?.scoreProbabilities,
      weights.elo
    ]
  ];

  let weighted = 0;
  let availableWeight = 0;

  for (const [scores, weight] of sources) {
    const raw =
      scores?.[key];

    if (
      raw === null ||
      raw === undefined ||
      raw === ''
    ) {
      continue;
    }

    const value =
      Number(raw);

    if (!Number.isFinite(value)) {
      continue;
    }

    weighted +=
      weight * value;

    availableWeight +=
      weight;
  }

  if (availableWeight <= 0) {
    return 0;
  }

  return (
    weighted /
    availableWeight
  );
}'''

src3, n2 = weighted_score_pattern.subn(
    weighted_score_replacement,
    src2,
    count=1
)

if n2 != 1:
    print("[ERROR] Encontré weightedMetric, pero no weightedScoreProbability.")
    shutil.copy2(backup / "ensemble.js", ENSEMBLE)
    print(f"Backup: {backup}")
    sys.exit(3)

ENSEMBLE.write_text(src3, encoding="utf-8")

test_source = '''import test from 'node:test';
import assert from 'node:assert/strict';

import {
  weightedMetric,
  weightedScoreProbability
} from '../src/engine/ensemble.js';

const weights = {
  structural: 0.45,
  bayesian: 0.40,
  elo: 0.15
};

test(
  'OutcomeMass: si Bayes no publica matchWin, los pesos disponibles se renormalizan a 100%',
  () => {
    const structural = {
      matchWinPctA: 20,
      matchWinPctB: 80
    };

    const bayesian = {};

    const elo = {
      matchWinPctA: 50,
      matchWinPctB: 50
    };

    const a =
      weightedMetric(
        structural,
        bayesian,
        elo,
        weights,
        'matchWinPctA'
      );

    const b =
      weightedMetric(
        structural,
        bayesian,
        elo,
        weights,
        'matchWinPctB'
      );

    assert.ok(
      Math.abs(a + b - 100) < 1e-9
    );

    assert.ok(
      Math.abs(a - 27.5) < 1e-9
    );
  }
);

test(
  'OutcomeMass: cero es un valor válido y no se confunde con dato ausente',
  () => {
    const structural = {
      metric: 0
    };

    const bayesian = {};

    const elo = {
      metric: 100
    };

    const value =
      weightedMetric(
        structural,
        bayesian,
        elo,
        weights,
        'metric'
      );

    assert.ok(
      Math.abs(value - 25) < 1e-9
    );
  }
);

test(
  'OutcomeMass: scorelines conservan 100% cuando Bayes no publica scoreProbabilities',
  () => {
    const structural = {
      scoreProbabilities: {
        a20: 20,
        a21: 30,
        b20: 25,
        b21: 25
      }
    };

    const bayesian = {};

    const elo = {
      scoreProbabilities: {
        a20: 10,
        a21: 40,
        b20: 20,
        b21: 30
      }
    };

    const keys = [
      'a20',
      'a21',
      'b20',
      'b21'
    ];

    const total =
      keys.reduce(
        (sum, key) =>
          sum +
          weightedScoreProbability(
            structural,
            bayesian,
            elo,
            weights,
            key
          ),
        0
      );

    assert.ok(
      Math.abs(total - 100) < 1e-9
    );
  }
);
'''

TEST.parent.mkdir(parents=True, exist_ok=True)
TEST.write_text(test_source, encoding="utf-8")

print("[OK] Hotfix Outcome Mass v2 aplicado.")
print("[OK] weightedMetric ahora renormaliza solo modelos con dato real.")
print("[OK] weightedScoreProbability hace lo mismo.")
print("[OK] tests/outcomeMass.test.js creado con 3 pruebas.")
print(f"Backup: {backup}")
