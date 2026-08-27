import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

globalThis.localStorage = new MemoryStorage();

const ledger = await import('../src/engine/recommendationLedger.js');

function fixture({
  recommendation = 'PASS',
  bestSide = 'OVER',
  line = 22.5
} = {}) {
  return {
    id: 'm-1',
    state: 'pre',
    date: '2026-08-26T19:00:00',
    tour: 'ATP',
    tournament: 'Test Open',
    round: 'R1',
    surface: 'HARD',
    playerA: { name: 'Player A', sets: [] },
    playerB: { name: 'Player B', sets: [] },
    matchup: { dataTrust: { level: 'HIGH', score: 95 } },
    totals: {
      version: 'test',
      expectedGames: 22.8,
      lengthAudit: { fairLine: 22.5 },
      diagnostics: {
        qualityPct: 94,
        disagreementPct: 2.1,
        consensusStatus: 'STABLE'
      }
    },
    marketDecision: {
      recommendation,
      bestSide,
      line,
      bestEdgePct: 1.6,
      reason: 'NO_EDGE',
      provider: 'MANUAL',
      model: {
        overPct: 54,
        underPct: 46
      },
      market: {
        overOdds: 1.90,
        underOdds: 1.90,
        overFormat: 'DECIMAL',
        underFormat: 'DECIMAL',
        overBreakEvenPct: 52.63,
        underBreakEvenPct: 52.63
      }
    }
  };
}

test('Ledger captura PASS', () => {
  localStorage.clear();
  const r = ledger.captureModelRecommendation(fixture());
  assert.equal(r.ok, true);
  assert.equal(r.entry.recommendation, 'PASS');
});

test('Primer snapshot queda congelado', () => {
  localStorage.clear();
  const m = fixture();
  assert.equal(ledger.captureModelRecommendation(m).ok, true);
  m.marketDecision.line = 24.5;
  const second = ledger.captureModelRecommendation(m);
  assert.equal(second.reason, 'ALREADY_CAPTURED');
  assert.equal(ledger.getRecommendationEntries()[0].line, 22.5);
});

test('Usuario puede observar UNDER aunque modelo prefiera OVER', () => {
  localStorage.clear();
  const r = ledger.captureUserObservation(fixture(), 'UNDER');
  assert.equal(r.ok, true);
  assert.equal(r.entry.side, 'UNDER');
  assert.equal(r.entry.isOverride, true);
});

test('OVER settlement WIN', () => {
  assert.equal(ledger.settleRecommendationResult('OVER', 22.5, 24), 'WIN');
});

test('UNDER settlement WIN', () => {
  assert.equal(ledger.settleRecommendationResult('UNDER', 22.5, 21), 'WIN');
});

test('PUSH settlement', () => {
  assert.equal(ledger.settleRecommendationResult('OVER', 22, 22), 'PUSH');
});
