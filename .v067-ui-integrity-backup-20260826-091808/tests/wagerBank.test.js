import test from 'node:test';
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

