import {
  simulateEnsembleTotals
} from '../engine/ensemble.js';

import {
  simulateMatchTotals
} from '../engine/montecarlo.js';

import {
  shadowDriftStatus
} from '../engine/dataTrust.js';

import {
  prepareMatchLength
} from '../engine/matchLength.js';

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function curveDelta(coverage, core) {
  const map = new Map((core || []).map(row => [Number(row.line), Number(row.overPct)]));
  const values = [];
  for (const row of coverage || []) {
    const line = Number(row.line);
    if (map.has(line)) values.push(Math.abs(Number(row.overPct) - map.get(line)));
  }
  return {
    meanPct: values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : 0,
    maxPct: values.length ? round1(Math.max(...values)) : 0,
    comparedLines: values.length
  };
}

self.onmessage = event => {
  const { type, generation, matches, simulations } = event.data || {};
  if (type !== 'RUN') return;

  const total = matches.length;
  let completed = 0;

  for (const match of matches) {
    try {
      const result = simulateEnsembleTotals(match, simulations);
      const shadowCore = match.matchup?.shadowCore;

      if (shadowCore?.markovReady) {
        try {
          const coveragePrepared =
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
          const expectedDelta = round2(coverageMarkov.expectedGames - coreMarkov.expectedGames);
          const delta = curveDelta(coverageMarkov.curve, coreMarkov.curve);

          result.shadowAudit = {
            available: true,
            mode: 'CORE_ONLY',
            simulations: 5000,
            coverageExpectedGames: round2(coverageMarkov.expectedGames),
            coreExpectedGames: round2(coreMarkov.expectedGames),
            expectedDelta,
            meanProbabilityDeltaPct: delta.meanPct,
            maxProbabilityDeltaPct: delta.maxPct,
            comparedLines: delta.comparedLines,
            status: shadowDriftStatus(expectedDelta, delta.maxPct)
          };
        } catch (error) {
          result.shadowAudit = { available: false, reason: error?.message || 'SHADOW_ERROR' };
        }
      } else {
        result.shadowAudit = { available: false, reason: 'CORE_SAMPLE_NOT_READY' };
      }

      completed++;
      self.postMessage({ type: 'RESULT', generation, matchId: match.id, completed, total, result });
    } catch (error) {
      completed++;
      self.postMessage({
        type: 'MATCH_ERROR', generation, matchId: match.id, completed, total,
        error: error?.message || 'ENSEMBLE_ERROR'
      });
    }
  }

  self.postMessage({ type: 'COMPLETE', generation, completed, total });
};

