import test from 'node:test';
import assert from 'node:assert/strict';

import {
  blendHoldEvidence
} from '../src/engine/matchup.js';

import {
  decorrelatedWeights
} from '../src/engine/ensemble.js';

import {
  marketBiasGuard
} from '../src/engine/market.js';

import {
  summarizeDirectionBias
} from '../src/engine/directionBias.js';

test('BiasFix: Hold Fusion queda entre Point y Game evidence', () => {
  const result =
    blendHoldEvidence(
      0.80,
      0.70,
      0.70
    );

  assert.ok(result.hold < 0.80);
  assert.ok(result.hold > 0.70);
});

test('BiasFix: reliability aumenta peso de Game evidence', () => {
  const low =
    blendHoldEvidence(
      0.80,
      0.70,
      0.20
    );

  const high =
    blendHoldEvidence(
      0.80,
      0.70,
      0.90
    );

  assert.ok(
    high.gameWeight >
    low.gameWeight
  );
});

test('BiasFix: Ensemble de-correlacionado suma 100%', () => {
  const weights =
    decorrelatedWeights(
      { expectedGames: 25 },
      { expectedGames: 21 },
      { expectedGames: 25 }
    );

  const total =
    weights.structural +
    weights.bayesian +
    weights.elo;

  assert.ok(
    Math.abs(total - 1) <
    1e-9
  );
});

test('BiasFix: pesos efectivos Markov45 Bayes40 Elo15', () => {
  const weights =
    decorrelatedWeights(
      { expectedGames: 25 },
      { expectedGames: 20 },
      { expectedGames: 25 }
    );

  assert.ok(
    Math.abs(
      weights.structural - 0.45
    ) < 1e-12
  );

  assert.ok(
    Math.abs(
      weights.bayesian - 0.40
    ) < 1e-12
  );

  assert.ok(
    Math.abs(
      weights.elo - 0.15
    ) < 1e-12
  );
});

test('BiasFix: gap extremo bloquea OVER y UNDER simétricamente', () => {
  assert.equal(
    marketBiasGuard(
      24.5,
      20.0
    ).blocked,
    true
  );

  assert.equal(
    marketBiasGuard(
      19.0,
      23.0
    ).blocked,
    true
  );
});

test('BiasFix: gap moderado queda WATCH y no bloquea', () => {
  const guard =
    marketBiasGuard(
      24.5,
      22.0
    );

  assert.equal(guard.blocked, false);
  assert.equal(guard.status, 'WATCH');
});

test('BiasFix: auditor detecta 5/5 OVER + Expected comprimido', () => {
  const matches =
    [20, 21.5, 22, 22.5, 21.5]
      .map(
        (line, index) => ({
          totals: {
            expectedGames:
              24.30 +
              index * 0.03
          },

          marketDecision: {
            line,
            bestSide: 'OVER',
            recommendation:
              index === 0
                ? 'PLAY'
                : 'LEAN',

            audit: {
              biasGuardBlocked:
                false
            }
          }
        })
      );

  const audit =
    summarizeDirectionBias(
      matches
    );

  assert.equal(audit.overPct, 100);
  assert.equal(audit.directionSkew, true);
  assert.equal(audit.compression, true);
  assert.equal(audit.status, 'AUDIT');
});

