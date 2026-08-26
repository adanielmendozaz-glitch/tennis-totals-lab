import test from 'node:test';
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

