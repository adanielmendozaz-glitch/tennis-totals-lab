import test from 'node:test';
import assert from 'node:assert/strict';

import {
  summarizeModelBenchmark
} from '../src/engine/modelBenchmark.js';

function makeRecords(n = 32) {
  return Array.from(
    { length: n },
    (_, index) => {
      const actual = 18 + (index % 12);
      const structuralError = [1, 2, 3, 2][index % 4];
      const eloError = structuralError * 1.08;
      const bayesError = index % 2 === 0 ? 0.4 : -0.4;
      const ensembleError = index % 2 === 0 ? 0.7 : -0.7;

      return {
        actualGames: actual,
        modelBenchmarks: {
          structural: actual + structuralError,
          bayesian: actual + bayesError,
          elo: actual + eloError,
          ensemble: actual + ensembleError
        }
      };
    }
  );
}

test(
  'Benchmark: replays legacy sin componentes no entran en muestra comparable',
  () => {
    const rows = [
      { actualGames: 22, expectedGames: 23.1 },
      ...makeRecords(4)
    ];

    const summary = summarizeModelBenchmark(rows);

    assert.equal(summary.n, 4);
    assert.equal(summary.legacyWithoutBenchmark, 1);
  }
);

test(
  'Benchmark: no declara ganador antes de N=30',
  () => {
    const summary = summarizeModelBenchmark(makeRecords(12));
    assert.equal(summary.bestModel, null);
    assert.equal(summary.sample.code, 'EARLY');
  }
);

test(
  'Benchmark: Bayes gana MAE en muestra >=30',
  () => {
    const summary = summarizeModelBenchmark(makeRecords(32));

    assert.equal(summary.sample.code, 'DEVELOPING');
    assert.equal(summary.bestModel.key, 'bayesian');

    const bayes = summary.models.find(
      row => row.key === 'bayesian'
    );

    assert.equal(bayes.maeGames, 0.4);
  }
);

test(
  'Benchmark: detecta familia Markov/Elo altamente correlacionada',
  () => {
    const summary = summarizeModelBenchmark(makeRecords(32));

    assert.ok(summary.correlations.structuralElo > 0.99);
    assert.equal(summary.familyStatus, 'CORRELATED FAMILY');
  }
);

test(
  'Benchmark: bias positivo significa sobreestimación de juegos',
  () => {
    const summary = summarizeModelBenchmark(makeRecords(32));

    const structural = summary.models.find(
      row => row.key === 'structural'
    );

    assert.ok(structural.biasGames > 0);
    assert.equal(structural.overEstimatePct, 100);
  }
);
