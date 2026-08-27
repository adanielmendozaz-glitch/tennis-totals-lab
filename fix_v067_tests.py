#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path.cwd()

required = [
    ROOT / 'src/engine/lab.js',
    ROOT / 'src/engine/wager.js',
    ROOT / 'src/engine/bank.js',
    ROOT / 'src/ui/labBank.js',
]

missing = [str(p) for p in required if not p.exists()]
if missing:
    print('[ERROR] Faltan archivos fuente v0.6.7:')
    for p in missing:
        print(' -', p)
    sys.exit(1)

(ROOT / 'tests').mkdir(exist_ok=True)

lab_test = r'''import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeLab,
  brierScore,
  calibrationBuckets,
  labSampleStatus,
  logLoss
} from '../src/engine/lab.js';

function entry({
  status = 'WIN',
  modelPct = 62,
  tour = 'ATP',
  surface = 'HARD',
  side = 'OVER',
  trust = 'HIGH'
} = {}) {
  return {
    modelPct,
    tour,
    surface,
    side,
    dataTrustAudit: { level: trust },
    result: { status }
  };
}

test('Lab: N<30 es VERY LOW SAMPLE', () => {
  assert.equal(labSampleStatus(12).code, 'VERY_LOW');
});

test('Lab: Brier de 62% WIN es correcto', () => {
  assert.equal(
    brierScore([entry({ modelPct: 62, status: 'WIN' })]),
    0.1444
  );
});

test('Lab: Log Loss de WIN es finito y positivo', () => {
  const value = logLoss([entry({ modelPct: 62, status: 'WIN' })]);
  assert.ok(value > 0 && value < 1);
});

test('Lab: PUSH no entra a calibración binaria', () => {
  const lab = analyzeLab([entry({ status: 'PUSH' })]);
  assert.equal(lab.settledBinary, 0);
  assert.equal(lab.pushes, 1);
});

test('Lab: bucket 60-64.9 calcula model vs actual', () => {
  const rows = [
    entry({ modelPct: 62, status: 'WIN' }),
    entry({ modelPct: 64, status: 'LOSS' })
  ];
  const bucket = calibrationBuckets(rows)[0];
  assert.equal(bucket.label, '60–64.9%');
  assert.equal(bucket.n, 2);
  assert.equal(bucket.modelAvgPct, 63);
  assert.equal(bucket.actualPct, 50);
});

test('Lab: Data Trust se separa en grupos', () => {
  const lab = analyzeLab([
    entry({ trust: 'HIGH' }),
    entry({ trust: 'CAUTION', status: 'LOSS' })
  ]);
  assert.equal(lab.byTrust.length, 2);
});
'''

wager_bank_test = r'''import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decimalOdds,
  normalizeStakeUnits,
  profitUnitsFor
} from '../src/engine/wager.js';

import {
  analyzeBank
} from '../src/engine/bank.js';

test('Units: stake permitido 0.75', () => {
  assert.equal(normalizeStakeUnits(0.75), 0.75);
});

test('Odds: decimal 1.80 permanece 1.80', () => {
  assert.equal(decimalOdds(1.8, 'DECIMAL'), 1.8);
});

test('Odds: -110 convierte a decimal', () => {
  const value = decimalOdds(-110, 'AMERICAN');
  assert.ok(Math.abs(value - (1 + 100 / 110)) < 1e-12);
});

test('Units: WIN 1U @1.80 = +0.80U', () => {
  assert.equal(
    profitUnitsFor({
      status: 'WIN',
      stakeUnits: 1,
      odds: 1.8,
      oddsFormat: 'DECIMAL'
    }),
    0.8
  );
});

test('Bank: ROI y drawdown se calculan con stakes reales', () => {
  const entries = [
    {
      stakeUnits: 1,
      odds: 2,
      oddsFormat: 'DECIMAL',
      capturedAt: '2026-08-01T10:00:00Z',
      result: {
        status: 'WIN',
        settledAt: '2026-08-01T12:00:00Z'
      }
    },
    {
      stakeUnits: 1,
      odds: 2,
      oddsFormat: 'DECIMAL',
      capturedAt: '2026-08-02T10:00:00Z',
      result: {
        status: 'LOSS',
        settledAt: '2026-08-02T12:00:00Z'
      }
    }
  ];

  const bank = analyzeBank(entries, { initialBankUnits: 100 });
  assert.equal(bank.profitUnits, 0);
  assert.equal(bank.roiPct, 0);
  assert.equal(bank.maxDrawdownUnits, 1);
  assert.equal(bank.currentBankUnits, 100);
});
'''

(ROOT / 'tests/lab.test.js').write_text(lab_test + '\n', encoding='utf-8')
(ROOT / 'tests/wagerBank.test.js').write_text(wager_bank_test + '\n', encoding='utf-8')

print('[OK] tests/lab.test.js creado')
print('[OK] tests/wagerBank.test.js creado')
print('[OK] 11 tests v0.6.7 restaurados')
