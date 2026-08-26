import test from 'node:test';
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

test(
  'OutcomeMass: si Bayes no publica matchWin, los pesos disponibles se renormalizan a 100%',
  () => {
    const structural = {
      matchWinPctA: 20,
      matchWinPctB: 80
    };

    const bayesian = {};

    const elo = {
      matchWinPctA: 50,
      matchWinPctB: 50
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

    assert.ok(
      Math.abs(a + b - 100) < 1e-9
    );

    assert.ok(
      Math.abs(a - 27.5) < 1e-9
    );
  }
);

test(
  'OutcomeMass: cero es un valor válido y no se confunde con dato ausente',
  () => {
    const structural = {
      metric: 0
    };

    const bayesian = {};

    const elo = {
      metric: 100
    };

    const value =
      weightedMetric(
        structural,
        bayesian,
        elo,
        weights,
        'metric'
      );

    assert.ok(
      Math.abs(value - 25) < 1e-9
    );
  }
);

test(
  'OutcomeMass: scorelines conservan 100% cuando Bayes no publica scoreProbabilities',
  () => {
    const structural = {
      scoreProbabilities: {
        a20: 20,
        a21: 30,
        b20: 25,
        b21: 25
      }
    };

    const bayesian = {};

    const elo = {
      scoreProbabilities: {
        a20: 10,
        a21: 40,
        b20: 20,
        b21: 30
      }
    };

    const keys = [
      'a20',
      'a21',
      'b20',
      'b21'
    ];

    const total =
      keys.reduce(
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

    assert.ok(
      Math.abs(total - 100) < 1e-9
    );
  }
);
