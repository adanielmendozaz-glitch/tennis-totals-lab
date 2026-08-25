import {
  simulateEnsembleTotals
} from '../engine/ensemble.js';

self.onmessage = event => {
  const {
    type,
    generation,
    matches,
    simulations
  } =
    event.data || {};

  if (
    type !== 'RUN'
  ) {
    return;
  }

  const total =
    matches.length;

  let completed = 0;

  for (
    const match
    of matches
  ) {
    try {
      const result =
        simulateEnsembleTotals(
          match,
          simulations
        );

      completed++;

      self.postMessage({
        type: 'RESULT',
        generation,
        matchId:
          match.id,
        completed,
        total,
        result
      });

    } catch (error) {

      completed++;

      self.postMessage({
        type: 'MATCH_ERROR',
        generation,
        matchId:
          match.id,
        completed,
        total,
        error:
          error?.message ||
          'ENSEMBLE_ERROR'
      });
    }
  }

  self.postMessage({
    type: 'COMPLETE',
    generation,
    completed,
    total
  });
};
