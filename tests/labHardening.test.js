import test from 'node:test';
import assert from 'node:assert/strict';

import {
  filterLabEntries,
  calibrationStrength,
  integritySummary
} from '../src/engine/labHardening.js';

const NOW =
  new Date(
    '2026-08-26T12:00:00Z'
  );

function row({
  capturedAt =
    '2026-08-25T12:00:00Z',
  tour = 'ATP',
  surface = 'HARD',
  trust = 'HIGH',
  status = 'WIN',
  stakeIntegrity = null
} = {}) {
  return {
    capturedAt,
    tour,
    surface,
    dataTrustAudit: {
      level: trust
    },
    stakeIntegrity,
    result: {
      status,
      settledAt:
        status === 'PENDING'
          ? null
          : capturedAt
    }
  };
}

test('v0.6.8 LAB 7D excluye registros viejos', () => {
  const filtered =
    filterLabEntries(
      [
        row(),
        row({
          capturedAt:
            '2026-08-01T12:00:00Z'
        })
      ],
      { window: '7D' },
      NOW
    );

  assert.equal(
    filtered.length,
    1
  );
});

test('v0.6.8 LAB filtra TOUR + SURFACE + TRUST', () => {
  const filtered =
    filterLabEntries(
      [
        row(),
        row({ tour: 'WTA' }),
        row({ surface: 'CLAY' }),
        row({ trust: 'CAUTION' })
      ],
      {
        window: 'ALL',
        tour: 'ATP',
        surface: 'HARD',
        trust: 'HIGH'
      },
      NOW
    );

  assert.equal(
    filtered.length,
    1
  );
});

test('v0.6.8 bucket N<5 se marca NO CONCLUSION', () => {
  assert.equal(
    calibrationStrength(4).code,
    'TOO_SMALL'
  );
});

test('v0.6.8 bucket N>=50 es USEFUL', () => {
  assert.equal(
    calibrationStrength(50).code,
    'USEFUL'
  );
});

test('v0.6.8 integrity separa VERIFIED REVIEW LEGACY', () => {
  const summary =
    integritySummary([
      row({
        stakeIntegrity: {
          status: 'VERIFIED'
        }
      }),
      row({
        stakeIntegrity: {
          status: 'REVIEW'
        }
      }),
      row({
        stakeIntegrity: null
      })
    ]);

  assert.equal(summary.verified, 1);
  assert.equal(summary.review, 1);
  assert.equal(summary.legacy, 1);
});
