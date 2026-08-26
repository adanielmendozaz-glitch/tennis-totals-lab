import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bankEntryProfit,
  bankEquitySeries,
  bankHistory
} from '../src/engine/bankTimeline.js';

function entry({
  at,
  status,
  stakeUnits = 1,
  odds = 2
}) {
  return {
    matchId:
      `${status}-${at}`,
    playerA: 'A',
    playerB: 'B',
    side: 'OVER',
    line: 22.5,
    odds,
    oddsFormat: 'DECIMAL',
    stakeUnits,
    capturedAt: at,
    result: {
      status,
      settledAt:
        status === 'PENDING'
          ? null
          : at,
      profitUnits: null
    }
  };
}

test('v0.6.8 Bank calcula profit por stake', () => {
  assert.equal(
    bankEntryProfit(
      entry({
        at:
          '2026-08-01T10:00:00Z',
        status: 'WIN',
        stakeUnits: 0.5,
        odds: 1.8
      })
    ),
    0.4
  );
});

test('v0.6.8 Equity ignora pendientes', () => {
  const series =
    bankEquitySeries(
      [
        entry({
          at:
            '2026-08-01T10:00:00Z',
          status: 'WIN'
        }),
        entry({
          at:
            '2026-08-02T10:00:00Z',
          status: 'PENDING'
        })
      ],
      100
    );

  assert.equal(series.length, 2);
  assert.equal(
    series.at(-1).bankUnits,
    101
  );
});

test('v0.6.8 Equity respeta orden cronológico', () => {
  const series =
    bankEquitySeries(
      [
        entry({
          at:
            '2026-08-02T10:00:00Z',
          status: 'LOSS'
        }),
        entry({
          at:
            '2026-08-01T10:00:00Z',
          status: 'WIN'
        })
      ],
      100
    );

  assert.equal(
    series[1].bankUnits,
    101
  );

  assert.equal(
    series[2].bankUnits,
    100
  );
});

test('v0.6.8 Bet History conserva pendientes', () => {
  const history =
    bankHistory([
      entry({
        at:
          '2026-08-01T10:00:00Z',
        status: 'PENDING'
      })
    ]);

  assert.equal(history.length, 1);
  assert.equal(
    history[0].status,
    'PENDING'
  );
  assert.equal(
    history[0].profitUnits,
    null
  );
});
