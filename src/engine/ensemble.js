import {
  simulateMatchTotals
} from './montecarlo.js';

import {
  simulateBayesianTotals
} from './bayesian.js';

import {
  simulateEloTotals
} from './eloLength.js';

const WEIGHTS = {
  structural: 0.40,
  bayesian: 0.40,
  elo: 0.20
};

function clamp(
  value,
  min = 0,
  max = 1
) {
  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );
}

function probabilityAt(
  result,
  line
) {
  const row =
    result.curve.find(
      item =>
        Math.abs(
          item.line -
          line
        ) <
        0.001
    );

  if (!row) {
    return 0.5;
  }

  return (
    Number(
      row.overPct
    ) / 100
  );
}

function qualityScore(match) {
  const sampleA =
    Number(
      match.playerA
        ?.profile
        ?.sample || 0
    );

  const sampleB =
    Number(
      match.playerB
        ?.profile
        ?.sample || 0
    );

  const minimumSample =
    Math.min(
      sampleA,
      sampleB
    );

  const sampleQuality =
    clamp(
      0.65 +
      0.35 *
      (
        (
          minimumSample -
          8
        ) /
        16
      ),
      0.65,
      1
    );

  const relA =
    Number(
      match.matchup
        ?.playerA
        ?.reliabilityPct || 0
    ) / 100;

  const relB =
    Number(
      match.matchup
        ?.playerB
        ?.reliabilityPct || 0
    ) / 100;

  const reliability =
    (
      relA +
      relB
    ) / 2;

  const relQuality =
    clamp(
      0.70 +
      0.30 *
      (
        (
          reliability -
          0.30
        ) /
        0.45
      ),
      0.70,
      1
    );

  return (
    0.60 *
    sampleQuality +
    0.40 *
    relQuality
  );
}

function weightedMetric(
  structural,
  bayesian,
  elo,
  key
) {
  return (
    WEIGHTS.structural *
    Number(
      structural[key] || 0
    ) +
    WEIGHTS.bayesian *
    Number(
      bayesian[key] || 0
    ) +
    WEIGHTS.elo *
    Number(
      elo[key] || 0
    )
  );
}

export function simulateEnsembleTotals(
  match,
  structuralSimulations = 30000
) {
  const structural =
    simulateMatchTotals(
      match,
      structuralSimulations
    );

  const targetLines =
    structural.curve.map(
      row =>
        row.line
    );

  const bayesian =
    simulateBayesianTotals(
      match,
      targetLines,
      30000
    );

  const elo =
    simulateEloTotals(
      match,
      20000
    );

  const quality =
    qualityScore(
      match
    );

  let disagreementTotal = 0;

  const curve =
    targetLines.map(
      line => {

        const pMarkov =
          probabilityAt(
            structural,
            line
          );

        const pBayes =
          probabilityAt(
            bayesian,
            line
          );

        const pElo =
          probabilityAt(
            elo,
            line
          );

        const raw =
          WEIGHTS.structural *
          pMarkov +
          WEIGHTS.bayesian *
          pBayes +
          WEIGHTS.elo *
          pElo;

        const highest =
          Math.max(
            pMarkov,
            pBayes,
            pElo
          );

        const lowest =
          Math.min(
            pMarkov,
            pBayes,
            pElo
          );

        const disagreement =
          highest -
          lowest;

        disagreementTotal +=
          disagreement;

        /*
         * Si los modelos discrepan,
         * acercamos la probabilidad a 50%.
         * Nada de inflar edges dudosos.
         */
        const disagreementPenalty =
          Math.min(
            0.30,
            disagreement *
            0.85
          );

        const confidenceMultiplier =
          quality *
          (
            1 -
            disagreementPenalty
          );

        const finalOver =
          clamp(
            0.5 +
            (
              raw -
              0.5
            ) *
            confidenceMultiplier
          );

        return {
          line,

          overPct:
            Math.round(
              finalOver *
              1000
            ) / 10,

          underPct:
            Math.round(
              (
                1 -
                finalOver
              ) *
              1000
            ) / 10,

          models: {
            markovPct:
              Math.round(
                pMarkov *
                1000
              ) / 10,

            bayesianPct:
              Math.round(
                pBayes *
                1000
              ) / 10,

            eloPct:
              Math.round(
                pElo *
                1000
              ) / 10
          },

          disagreementPct:
            Math.round(
              disagreement *
              1000
            ) / 10
        };
      }
    );

  const expectedGames =
    weightedMetric(
      structural,
      bayesian,
      elo,
      'expectedGames'
    );

  const variance =
    WEIGHTS.structural *
    (
      structural.sdGames ** 2 +
      structural.expectedGames ** 2
    ) +
    WEIGHTS.bayesian *
    (
      bayesian.sdGames ** 2 +
      bayesian.expectedGames ** 2
    ) +
    WEIGHTS.elo *
    (
      elo.sdGames ** 2 +
      elo.expectedGames ** 2
    ) -
    expectedGames ** 2;

  const meanDisagreement =
    curve.length
      ? (
          disagreementTotal /
          curve.length
        )
      : 0;

  return {
    version:
      'ENSEMBLE-0.4.0',

    mode:
      'ENSEMBLE',

    simulations:
      structural.simulations +
      bayesian.simulations +
      elo.simulations,

    bestOf:
      structural.bestOf,

    expectedGames:
      Math.round(
        expectedGames *
        100
      ) / 100,

    medianGames:
      Math.round(
        weightedMetric(
          structural,
          bayesian,
          elo,
          'medianGames'
        )
      ),

    sdGames:
      Math.round(
        Math.sqrt(
          Math.max(
            0,
            variance
          )
        ) *
        100
      ) / 100,

    expectedSets:
      Math.round(
        weightedMetric(
          structural,
          bayesian,
          elo,
          'expectedSets'
        ) *
        100
      ) / 100,

    decidingSetPct:
      Math.round(
        weightedMetric(
          structural,
          bayesian,
          elo,
          'decidingSetPct'
        ) *
        10
      ) / 10,

    straightSetsPct:
      Math.round(
        weightedMetric(
          structural,
          bayesian,
          elo,
          'straightSetsPct'
        ) *
        10
      ) / 10,

    tiebreakPct:
      Math.round(
        weightedMetric(
          structural,
          bayesian,
          elo,
          'tiebreakPct'
        ) *
        10
      ) / 10,

    expectedTiebreaks:
      structural.expectedTiebreaks,

    maxProbabilitySePct:
      Math.max(
        structural.maxProbabilitySePct || 0,
        0.30
      ),

    curve,

    weights:
      WEIGHTS,

    diagnostics: {
      qualityPct:
        Math.round(
          quality *
          1000
        ) / 10,

      disagreementPct:
        Math.round(
          meanDisagreement *
          1000
        ) / 10
    },

    models: {
      structural: {
        expectedGames:
          structural.expectedGames,

        tiebreakPct:
          structural.tiebreakPct
      },

      bayesian: {
        expectedGames:
          bayesian.expectedGames,

        tiebreakPct:
          bayesian.tiebreakPct,

        posterior:
          bayesian.posterior
      },

      elo: {
        expectedGames:
          elo.expectedGames,

        tiebreakPct:
          elo.tiebreakPct,

        ratings:
          elo.elo
      }
    }
  };
}
