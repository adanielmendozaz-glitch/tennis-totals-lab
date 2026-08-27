#!/usr/bin/env python3
from pathlib import Path
import re
import shutil
import sys
from datetime import datetime

ROOT = Path.home() / "tennis-totals-lab"
ensemble = ROOT / "src/engine/ensemble.js"
tests = ROOT / "tests/outcomeMass.test.js"

if not ensemble.exists():
    print("[ERROR] No encontré src/engine/ensemble.js")
    sys.exit(1)

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup_dir = ROOT / f".v0682-outcome-mass-backup-{stamp}"
backup_dir.mkdir(parents=True, exist_ok=True)
shutil.copy2(ensemble, backup_dir / "ensemble.js")

text = ensemble.read_text(encoding="utf-8")

old_metric_pattern = re.compile(
    r'''function weightedMetric\(\s*
  structural,\s*
  bayesian,\s*
  elo,\s*
  weights,\s*
  key\s*
\) \{\s*
  return \(\s*
    weights\.structural \*\s*
    Number\(\s*
      structural\[key\] \|\| 0\s*
    \) \+\s*
    weights\.bayesian \*\s*
    Number\(\s*
      bayesian\[key\] \|\| 0\s*
    \) \+\s*
    weights\.elo \*\s*
    Number\(\s*
      elo\[key\] \|\| 0\s*
    \)\s*
  \);\s*
\}''',
    re.VERBOSE
)

new_metric = r'''export function weightedMetric(
  structural,
  bayesian,
  elo,
  weights,
  key
) {
  const inputs = [
    [structural, Number(weights.structural || 0)],
    [bayesian, Number(weights.bayesian || 0)],
    [elo, Number(weights.elo || 0)]
  ];

  let weighted = 0;
  let availableWeight = 0;

  for (const [model, weight] of inputs) {
    const raw =
      model?.[key];

    if (
      raw === null ||
      raw === undefined ||
      raw === '' ||
      !Number.isFinite(Number(raw)) ||
      !Number.isFinite(weight) ||
      weight <= 0
    ) {
      continue;
    }

    weighted +=
      weight *
      Number(raw);

    availableWeight +=
      weight;
  }

  return availableWeight > 0
    ? weighted / availableWeight
    : 0;
}'''

text2, n1 = old_metric_pattern.subn(new_metric, text, count=1)

if n1 != 1:
    if "availableWeight" not in text:
        print("[ERROR] No pude localizar weightedMetric para aplicar el hotfix.")
        print("Backup:", backup_dir)
        sys.exit(1)
    text2 = text
    print("✓ weightedMetric ya parecía corregido")
else:
    print("✓ weightedMetric ahora renormaliza solo modelos disponibles")

old_score_pattern = re.compile(
    r'''function weightedScoreProbability\(\s*
  structural,\s*
  bayesian,\s*
  elo,\s*
  weights,\s*
  key\s*
\) \{\s*
  return \(\s*
    weights\.structural \*\s*
    Number\(\s*
      structural\s*
        \.scoreProbabilities\s*
        \?\.\[key\] \|\| 0\s*
    \) \+\s*
    weights\.bayesian \*\s*
    Number\(\s*
      bayesian\s*
        \.scoreProbabilities\s*
        \?\.\[key\] \|\| 0\s*
    \) \+\s*
    weights\.elo \*\s*
    Number\(\s*
      elo\s*
        \.scoreProbabilities\s*
        \?\.\[key\] \|\| 0\s*
    \)\s*
  \);\s*
\}''',
    re.VERBOSE
)

new_score = r'''export function weightedScoreProbability(
  structural,
  bayesian,
  elo,
  weights,
  key
) {
  const inputs = [
    [structural, Number(weights.structural || 0)],
    [bayesian, Number(weights.bayesian || 0)],
    [elo, Number(weights.elo || 0)]
  ];

  let weighted = 0;
  let availableWeight = 0;

  for (const [model, weight] of inputs) {
    const raw =
      model
        ?.scoreProbabilities
        ?.[key];

    if (
      raw === null ||
      raw === undefined ||
      raw === '' ||
      !Number.isFinite(Number(raw)) ||
      !Number.isFinite(weight) ||
      weight <= 0
    ) {
      continue;
    }

    weighted +=
      weight *
      Number(raw);

    availableWeight +=
      weight;
  }

  return availableWeight > 0
    ? weighted / availableWeight
    : 0;
}'''

text3, n2 = old_score_pattern.subn(new_score, text2, count=1)

if n2 != 1:
    if "export function weightedScoreProbability" not in text3 and "availableWeight" not in text3:
        print("[ERROR] No pude localizar weightedScoreProbability para aplicar el hotfix.")
        print("Backup:", backup_dir)
        sys.exit(1)
    print("✓ weightedScoreProbability ya parecía corregido")
else:
    print("✓ scorelines ya no pierden masa cuando un modelo no expone outcomes")

ensemble.write_text(text3, encoding="utf-8")

test_text = r'''import test from 'node:test';
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

test('OutcomeMass: un modelo sin matchWin no roba 40% de probabilidad', () => {
  const structural = {
    matchWinPctA: 28.8,
    matchWinPctB: 71.2
  };

  const bayesian = {};

  const elo = {
    matchWinPctA: 28.8,
    matchWinPctB: 71.2
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

  assert.ok(Math.abs(a - 28.8) < 1e-9);
  assert.ok(Math.abs(b - 71.2) < 1e-9);
  assert.ok(Math.abs(a + b - 100) < 1e-9);
});

test('OutcomeMass: scorelines conservan ~100% aunque Bayes no exponga scoreProbabilities', () => {
  const scores = {
    '2-0': 12.7,
    '2-1': 16.1,
    '0-2': 41.5,
    '1-2': 29.7
  };

  const structural = {
    scoreProbabilities: scores
  };

  const bayesian = {};

  const elo = {
    scoreProbabilities: scores
  };

  const total =
    Object.keys(scores)
      .reduce(
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

  assert.ok(Math.abs(total - 100) < 1e-9);
});

test('OutcomeMass: métricas existentes en los 3 modelos mantienen pesos normales', () => {
  const structural = { expectedGames: 25 };
  const bayesian = { expectedGames: 23 };
  const elo = { expectedGames: 25 };

  const value =
    weightedMetric(
      structural,
      bayesian,
      elo,
      weights,
      'expectedGames'
    );

  const expected =
    0.45 * 25 +
    0.40 * 23 +
    0.15 * 25;

  assert.ok(Math.abs(value - expected) < 1e-9);
});
'''

tests.write_text(test_text, encoding="utf-8")

print("✓ tests/outcomeMass.test.js creado")
print("")
print("HOTFIX v0.6.8.2 OUTCOME MASS aplicado.")
print("Backup:", backup_dir)
print("")
print("Ahora ejecuta:")
print("  node --check src/engine/ensemble.js")
print("  npm test")
print("  npm run build")
