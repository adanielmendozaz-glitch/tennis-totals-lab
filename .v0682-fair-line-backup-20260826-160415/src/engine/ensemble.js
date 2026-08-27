import {
  simulateMatchTotals
} from './montecarlo.js';

import {
  simulateBayesianTotals
} from './bayesian.js';

import {
  simulateEloTotals
} from './eloLength.js';

/*
 * v0.6.8.1 ENSEMBLE DE-CORRELATION
 *
 * Markov y Elo pertenecen a una misma familia.
 * Ya no forman una mayoría artificial 2-vs-1
 * contra Bayes.
 *
 * Pesos efectivos:
 * Markov 45%
 * Bayes  40%
 * Elo    15%
 */
const FAMILY_WEIGHTS = {
  structuralFamily: 0.60,
  bayesian: 0.40
};

const STRUCTURAL_MIX = {
  markov: 0.75,
  elo: 0.25
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

function round1(value) {
  return (
    Math.round(
      value *
      10
    ) / 10
  );
}

function round2(value) {
  return (
    Math.round(
      value *
      100
    ) / 100
  );
}

function probabilityAt(
  result,
  line
) {
  const rows =
    [...result.curve]
      .sort(
        (a, b) =>
          a.line -
          b.line
      );

  if (!rows.length) {
    return 0.5;
  }

  const exact =
    rows.find(
      row =>
        Math.abs(
          row.line -
          line
        ) < 0.001
    );

  if (exact) {
    return (
      Number(
        exact.overPct
      ) / 100
    );
  }

  if (
    line <=
    rows[0].line
  ) {
    return (
      Number(
        rows[0].overPct
      ) / 100
    );
  }

  if (
    line >=
    rows[
      rows.length - 1
    ].line
  ) {
    return (
      Number(
        rows[
          rows.length - 1
        ].overPct
      ) / 100
    );
  }

  for (
    let i = 0;
    i < rows.length - 1;
    i++
  ) {
    const left =
      rows[i];

    const right =
      rows[i + 1];

    if (
      line >
      left.line &&
      line <
      right.line
    ) {
      const ratio =
        (
          line -
          left.line
        ) /
        (
          right.line -
          left.line
        );

      return (
        (
          left.overPct +
          ratio *
          (
            right.overPct -
            left.overPct
          )
        ) /
        100
      );
    }
  }

  return 0.5;
}

function qualityScore(match) {
  const sampleA =
    Number(
      match.playerA
        ?.profile
        ?.effectiveSample ??
      match.playerA
        ?.profile
        ?.sample ??
      0
    );

  const sampleB =
    Number(
      match.playerB
        ?.profile
        ?.effectiveSample ??
      match.playerB
        ?.profile
        ?.sample ??
      0
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

export function decorrelatedWeights(
  structural,
  bayesian,
  elo
) {
  const structuralFamilyExpected =
    STRUCTURAL_MIX.markov *
    Number(
      structural.expectedGames
    ) +
    STRUCTURAL_MIX.elo *
    Number(
      elo.expectedGames
    );

  const familyGap =
    Math.abs(
      structuralFamilyExpected -
      Number(
        bayesian.expectedGames
      )
    );

  return {
    structural:
      FAMILY_WEIGHTS
        .structuralFamily *
      STRUCTURAL_MIX.markov,

    bayesian:
      FAMILY_WEIGHTS
        .bayesian,

    elo:
      FAMILY_WEIGHTS
        .structuralFamily *
      STRUCTURAL_MIX.elo,

    structuralFamilyExpected,
    familyGap,
    correlationGuard: true
  };
}

function weightedMetric(
  structural,
  bayesian,
  elo,
  weights,
  key
) {
  return (
    weights.structural *
    Number(
      structural[key] || 0
    ) +
    weights.bayesian *
    Number(
      bayesian[key] || 0
    ) +
    weights.elo *
    Number(
      elo[key] || 0
    )
  );
}

function consensusStatus(
  expectedRange,
  probabilityDisagreement
) {
  if (
    expectedRange <= 3.0 &&
    probabilityDisagreement <= 0.12
  ) {
    return 'STABLE';
  }

  if (
    expectedRange <= 5.0 &&
    probabilityDisagreement <= 0.20
  ) {
    return 'WATCH';
  }

  return 'UNSTABLE';
}

export function simulateEnsembleTotals(
  match,
  structuralSimulations = 40000
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
      40000
    );

  const elo =
    simulateEloTotals(
      match,
      20000
    );

  const weights =
    decorrelatedWeights(
      structural,
      bayesian,
      elo
    );

  const quality =
    qualityScore(
      match
    );

  const expectedValues = [
    structural.expectedGames,
    bayesian.expectedGames,
    elo.expectedGames
  ];

  const expectedRange =
    Math.max(
      ...expectedValues
    ) -
    Math.min(
      ...expectedValues
    );

  const rawRows =
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

        const weighted =
          weights.structural *
          pMarkov +
          weights.bayesian *
          pBayes +
          weights.elo *
          pElo;

        return {
          line,
          pMarkov,
          pBayes,
          pElo,
          disagreement,
          weighted
        };
      }
    );

  const meanDisagreement =
    rawRows.length
      ? (
          rawRows.reduce(
            (sum, row) =>
              sum +
              row.disagreement,
            0
          ) /
          rawRows.length
        )
      : 0;

  const consensus =
    consensusStatus(
      expectedRange,
      meanDisagreement
    );

  const consensusMultiplier =
    consensus === 'STABLE'
      ? 1.00
      : consensus === 'WATCH'
        ? 0.85
        : 0.55;

  const curve =
    rawRows.map(
      row => {

        const disagreementPenalty =
          Math.min(
            0.35,
            row.disagreement *
            0.90
          );

        /*
         * El consenso final se acerca
         * deliberadamente a 50%
         * cuando hay poca calidad o
         * demasiada discrepancia.
         */
        const confidenceMultiplier =
          quality *
          (
            1 -
            disagreementPenalty
          ) *
          consensusMultiplier;

        const finalOver =
          clamp(
            0.5 +
            (
              row.weighted -
              0.5
            ) *
            confidenceMultiplier
          );

        return {
          line:
            row.line,

          overPct:
            round1(
              finalOver *
              100
            ),

          underPct:
            round1(
              (
                1 -
                finalOver
              ) *
              100
            ),

          models: {
            markovPct:
              round1(
                row.pMarkov *
                100
              ),

            bayesianPct:
              round1(
                row.pBayes *
                100
              ),

            eloPct:
              round1(
                row.pElo *
                100
              )
          },

          disagreementPct:
            round1(
              row.disagreement *
              100
            )
        };
      }
    );

  const expectedGames =
    weightedMetric(
      structural,
      bayesian,
      elo,
      weights,
      'expectedGames'
    );

  const variance =
    weights.structural *
    (
      structural.sdGames ** 2 +
      structural.expectedGames ** 2
    ) +
    weights.bayesian *
    (
      bayesian.sdGames ** 2 +
      bayesian.expectedGames ** 2
    ) +
    weights.elo *
    (
      elo.sdGames ** 2 +
      elo.expectedGames ** 2
    ) -
    expectedGames ** 2;

  const marketEligible =
    consensus !== 'UNSTABLE' &&
    quality >= 0.72;

  return {
    version:
      'ENSEMBLE-0.5.0-BIASGUARD',

    mode:
      'ENSEMBLE',

    simulations:
      structural.simulations +
      bayesian.simulations +
      elo.simulations,

    bestOf:
      structural.bestOf,

    expectedGames:
      round2(
        expectedGames
      ),

    medianGames:
      Math.round(
        weightedMetric(
          structural,
          bayesian,
          elo,
          weights,
          'medianGames'
        )
      ),

    sdGames:
      round2(
        Math.sqrt(
          Math.max(
            0,
            variance
          )
        )
      ),

    expectedSets:
      round2(
        weightedMetric(
          structural,
          bayesian,
          elo,
          weights,
          'expectedSets'
        )
      ),

    decidingSetPct:
      round1(
        weightedMetric(
          structural,
          bayesian,
          elo,
          weights,
          'decidingSetPct'
        )
      ),

    straightSetsPct:
      round1(
        weightedMetric(
          structural,
          bayesian,
          elo,
          weights,
          'straightSetsPct'
        )
      ),

    tiebreakPct:
      round1(
        weightedMetric(
          structural,
          bayesian,
          elo,
          weights,
          'tiebreakPct'
        )
      ),

    expectedTiebreaks:
      round2(
        weightedMetric(
          structural,
          bayesian,
          elo,
          weights,
          'expectedTiebreaks'
        )
      ),

    maxProbabilitySePct:
      0.25,

    curve,

    weights: {
      structural:
        round1(
          weights.structural *
          100
        ),

      bayesian:
        round1(
          weights.bayesian *
          100
        ),

      elo:
        round1(
          weights.elo *
          100
        )
    },

    diagnostics: {
      qualityPct:
        round1(
          quality *
          100
        ),

      disagreementPct:
        round1(
          meanDisagreement *
          100
        ),

      expectedRange:
        round2(
          expectedRange
        ),

      familyGap:
        round2(
          weights.familyGap
        ),

      structuralFamilyExpected:
        round2(
          weights.structuralFamilyExpected
        ),

      correlationGuard:
        true,

      consensusStatus:
        consensus,

      marketEligible
    },

    models: {
      structural: {
        expectedGames:
          structural.expectedGames,

        tiebreakPct:
          structural.tiebreakPct,

        weightPct:
          round1(
            weights.structural *
            100
          )
      },

      bayesian: {
        expectedGames:
          bayesian.expectedGames,

        tiebreakPct:
          bayesian.tiebreakPct,

        weightPct:
          round1(
            weights.bayesian *
            100
          ),

        posterior:
          bayesian.posterior
      },

      elo: {
        expectedGames:
          elo.expectedGames,

        tiebreakPct:
          elo.tiebreakPct,

        weightPct:
          round1(
            weights.elo *
            100
          ),

        ratings:
          elo.elo
      }
    }
  };
}
