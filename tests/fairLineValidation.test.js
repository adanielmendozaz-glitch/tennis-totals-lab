import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseHistoricalScore,
  summarizeFairLineValidation,
  historicalAuditSampleStatus
} from '../src/engine/fairLineValidation.js';

test('Historical replay: score BO3 suma juegos y detecta straight sets', () => {
  const parsed = parseHistoricalScore('6-4 7-6(5)', 3);

  assert.equal(parsed.totalGames, 23);
  assert.equal(parsed.setCount, 2);
  assert.equal(parsed.straightSets, true);
  assert.equal(parsed.decidingSet, false);
});

test('Historical replay: BO3 a tres sets detecta deciding set', () => {
  const parsed = parseHistoricalScore('6-4 3-6 6-2', 3);

  assert.equal(parsed.totalGames, 27);
  assert.equal(parsed.decidingSet, true);
  assert.equal(parsed.straightSets, false);
});

test('Historical replay: retirados no entran a validación', () => {
  assert.equal(
    parseHistoricalScore('6-4 2-1 RET', 3),
    null
  );
});

test('Historical replay: BO5 straight sets', () => {
  const parsed = parseHistoricalScore('6-4 6-4 6-3', 5);

  assert.equal(parsed.totalGames, 29);
  assert.equal(parsed.straightSets, true);
  assert.equal(parsed.decidingSet, false);
});

test('Historical replay: MAE, bias y RMSE correctos', () => {
  const result = summarizeFairLineValidation([
    {
      expectedGames: 24,
      actualGames: 22,
      fairLine: 23.5,
      decidingSetPct: 40,
      straightSetsPct: 60,
      actualDecidingSet: false,
      actualStraightSets: true,
      tour: 'ATP',
      surface: 'HARD',
      dataTrust: 'HIGH'
    },
    {
      expectedGames: 24,
      actualGames: 26,
      fairLine: 24.5,
      decidingSetPct: 40,
      straightSetsPct: 60,
      actualDecidingSet: true,
      actualStraightSets: false,
      tour: 'ATP',
      surface: 'HARD',
      dataTrust: 'HIGH'
    }
  ]);

  assert.equal(result.maeGames, 2);
  assert.equal(result.biasGames, 0);
  assert.equal(result.rmseGames, 2);
  assert.equal(result.fairOverPct, 50);
  assert.equal(result.fairUnderPct, 50);
});

test('Historical replay: bias positivo significa sobreestimación', () => {
  const result = summarizeFairLineValidation([
    {
      expectedGames: 25,
      actualGames: 21,
      fairLine: 24.5,
      tour: 'WTA',
      surface: 'HARD',
      dataTrust: 'MEDIUM'
    },
    {
      expectedGames: 24,
      actualGames: 22,
      fairLine: 23.5,
      tour: 'WTA',
      surface: 'HARD',
      dataTrust: 'MEDIUM'
    }
  ]);

  assert.equal(result.biasGames, 3);
});

test('Historical replay: compresión se detecta con muestra suficiente', () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    expectedGames: 24,
    actualGames: index % 2 ? 25 : 23,
    fairLine: index % 2 ? 24.5 : 23.5,
    tour: 'ATP',
    surface: 'HARD',
    dataTrust: 'HIGH'
  }));

  const result = summarizeFairLineValidation(rows);

  assert.equal(result.compressionStatus, 'COMPRESSION');
  assert.equal(result.centralBandPct, 100);
});

test('Historical replay: sample gate evita conclusiones prematuras', () => {
  assert.equal(
    historicalAuditSampleStatus(29).code,
    'VERY_LOW'
  );

  assert.equal(
    historicalAuditSampleStatus(30).code,
    'EARLY'
  );

  assert.equal(
    historicalAuditSampleStatus(200).code,
    'USEFUL'
  );
});
