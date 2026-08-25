import {
  simulateMatchTotals,
  inferBestOf
} from './montecarlo.js';

import {
  holdFromPointProbability
} from './matchup.js';

function clamp(
  value,
  min = 0.0001,
  max = 0.9999
) {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

function hashString(value) {
  let hash = 2166136261;

  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);

    hash =
      Math.imul(
        hash,
        16777619
      );
  }

  return hash >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;

  return function () {
    a |= 0;

    a =
      a +
      0x6D2B79F5 |
      0;

    let t = a;

    t =
      Math.imul(
        t ^ t >>> 15,
        t | 1
      );

    t ^=
      t +
      Math.imul(
        t ^ t >>> 7,
        t | 61
      );

    return (
      (
        t ^ t >>> 14
      ) >>> 0
    ) / 4294967296;
  };
}

function normalRandom(rng) {
  const u1 =
    Math.max(
      1e-12,
      rng()
    );

  const u2 =
    rng();

  return (
    Math.sqrt(
      -2 *
      Math.log(u1)
    ) *
    Math.cos(
      2 *
      Math.PI *
      u2
    )
  );
}

function addEvidence(
  posterior,
  wins,
  total,
  nominalWeight,
  maxEffective
) {
  const n =
    Number(total || 0);

  const w =
    Number(wins || 0);

  if (
    n <= 0 ||
    w < 0 ||
    w > n
  ) {
    return;
  }

  const scale =
    Math.min(
      nominalWeight,
      maxEffective / n
    );

  posterior.alpha +=
    w * scale;

  posterior.beta +=
    (
      n -
      w
    ) * scale;
}

function posteriorForServer(
  profile,
  opponentProfile,
  baselineServe,
  matchupServe
) {
  const baseline =
    clamp(
      baselineServe
    );

  const anchor =
    clamp(
      matchupServe
    );

  /*
   * El Matchup Engine ya hizo
   * shrink contra superficie.
   *
   * Bayesian parte de ese estimador
   * y añade incertidumbre; no intenta
   * destruirlo y empezar de cero.
   */
  const priorMean =
    clamp(
      0.72 * anchor +
      0.28 * baseline
    );

  const priorStrength =
    260;

  const posterior = {
    alpha:
      priorMean *
      priorStrength,

    beta:
      (
        1 -
        priorMean
      ) *
      priorStrength
  };

  const own =
    profile?.raw;

  const opponent =
    opponentProfile?.raw;

  /*
   * Evidencia individual deliberadamente
   * limitada para evitar overfit.
   */
  if (own) {
    addEvidence(
      posterior,
      own.servePointsWon,
      own.servePoints,
      0.10,
      250
    );
  }

  /*
   * Return del rival:
   *
   * P(server gana punto)
   * =
   * 1 - RPW rival
   */
  if (opponent) {
    const returnPoints =
      Number(
        opponent.returnPoints || 0
      );

    const returnWon =
      Number(
        opponent.returnPointsWon || 0
      );

    addEvidence(
      posterior,
      returnPoints -
      returnWon,
      returnPoints,
      0.08,
      220
    );
  }

  return {
    ...posterior,
    anchor,
    baseline
  };
}

function posteriorSummary(
  posterior
) {
  const a =
    posterior.alpha;

  const b =
    posterior.beta;

  const mean =
    a /
    (
      a +
      b
    );

  const variance =
    (
      a * b
    ) /
    (
      Math.pow(
        a + b,
        2
      ) *
      (
        a +
        b +
        1
      )
    );

  const sd =
    Math.sqrt(
      variance
    );

  return {
    mean,
    sd,

    low90:
      clamp(
        mean -
        1.645 * sd
      ),

    high90:
      clamp(
        mean +
        1.645 * sd
      )
  };
}

function robustMean(
  values,
  trim = 0.10
) {
  const clean =
    values
      .filter(Number.isFinite)
      .sort(
        (a, b) =>
          a - b
      );

  if (!clean.length) {
    return 0;
  }

  const cut =
    Math.floor(
      clean.length *
      trim
    );

  const trimmed =
    clean.slice(
      cut,
      clean.length - cut
    );

  const target =
    trimmed.length
      ? trimmed
      : clean;

  return (
    target.reduce(
      (sum, value) =>
        sum + value,
      0
    ) /
    target.length
  );
}

function cloneWithServe(
  match,
  serveA,
  serveB
) {
  return {
    ...match,

    matchup: {
      ...match.matchup,

      playerA: {
        ...match.matchup.playerA,

        servePointPct:
          serveA * 100,

        holdPct:
          holdFromPointProbability(
            serveA
          ) * 100
      },

      playerB: {
        ...match.matchup.playerB,

        servePointPct:
          serveB * 100,

        holdPct:
          holdFromPointProbability(
            serveB
          ) * 100
      }
    }
  };
}

function overAtLine(
  result,
  line
) {
  const rows =
    [...result.curve]
      .sort(
        (a, b) =>
          a.line - b.line
      );

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
      exact.overPct /
      100
    );
  }

  if (
    line <=
    rows[0].line
  ) {
    return (
      rows[0].overPct /
      100
    );
  }

  if (
    line >=
    rows[
      rows.length - 1
    ].line
  ) {
    return (
      rows[
        rows.length - 1
      ].overPct /
      100
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
        left.overPct +
        ratio *
        (
          right.overPct -
          left.overPct
        )
      ) / 100;
    }
  }

  return 0.5;
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

export function simulateBayesianTotals(
  match,
  targetLines,
  requestedSimulations = 40000
) {
  const baseline =
    Number(
      match.matchup
        ?.baseline
        ?.servePointPct
    ) / 100;

  const anchorA =
    Number(
      match.matchup
        ?.playerA
        ?.servePointPct
    ) / 100;

  const anchorB =
    Number(
      match.matchup
        ?.playerB
        ?.servePointPct
    ) / 100;

  const posteriorA =
    posteriorForServer(
      match.playerA.profile,
      match.playerB.profile,
      baseline,
      anchorA
    );

  const posteriorB =
    posteriorForServer(
      match.playerB.profile,
      match.playerA.profile,
      baseline,
      anchorB
    );

  const summaryA =
    posteriorSummary(
      posteriorA
    );

  const summaryB =
    posteriorSummary(
      posteriorB
    );

  /*
   * Antes eran 15 escenarios.
   * Ahora usamos 80.
   */
  const scenarios =
    80;

  const simsPerScenario =
    Math.max(
      250,
      Math.floor(
        requestedSimulations /
        scenarios
      )
    );

  const actualSimulations =
    scenarios *
    simsPerScenario;

  const rng =
    mulberry32(
      hashString(
        [
          match.id,
          'BAYES-STABLE-041',
          posteriorA.alpha.toFixed(5),
          posteriorA.beta.toFixed(5),
          posteriorB.alpha.toFixed(5),
          posteriorB.beta.toFixed(5)
        ].join('|')
      )
    );

  /*
   * Correlación positiva:
   * parte de la incertidumbre es
   * compartida por superficie/cancha.
   */
  const rho =
    0.60;

  const independentScale =
    Math.sqrt(
      1 -
      rho * rho
    );

  /*
   * No usamos el 100% de la desviación
   * posterior como volatilidad diaria.
   */
  const uncertaintyScale =
    0.70;

  const courtSd =
    0.0035;

  const expectedGamesValues = [];
  const expectedSetsValues = [];
  const decidingValues = [];
  const straightValues = [];
  const tiebreakValues = [];
  const expectedTbValues = [];
  const secondMoments = [];
  const medians = [];

  const lineSamples =
    new Map(
      targetLines.map(
        line => [
          line,
          []
        ]
      )
    );

  const sampledServeA = [];
  const sampledServeB = [];

  for (
    let scenario = 0;
    scenario < scenarios;
    scenario++
  ) {
    const common =
      normalRandom(
        rng
      );

    const individualA =
      normalRandom(
        rng
      );

    const individualB =
      normalRandom(
        rng
      );

    const courtShift =
      normalRandom(
        rng
      ) *
      courtSd;

    const zA =
      rho *
      common +
      independentScale *
      individualA;

    const zB =
      rho *
      common +
      independentScale *
      individualB;

    /*
     * Límites de seguridad.
     * Evitamos que una muestra pequeña
     * genere un servidor ficticio extremo.
     */
    const lowA =
      Math.max(
        0.50,
        Math.min(
          summaryA.low90,
          summaryA.mean -
          0.025
        )
      );

    const highA =
      Math.min(
        0.78,
        Math.max(
          summaryA.high90,
          summaryA.mean +
          0.025
        )
      );

    const lowB =
      Math.max(
        0.50,
        Math.min(
          summaryB.low90,
          summaryB.mean -
          0.025
        )
      );

    const highB =
      Math.min(
        0.78,
        Math.max(
          summaryB.high90,
          summaryB.mean +
          0.025
        )
      );

    const serveA =
      clamp(
        summaryA.mean +
        summaryA.sd *
        uncertaintyScale *
        zA +
        courtShift,
        lowA,
        highA
      );

    const serveB =
      clamp(
        summaryB.mean +
        summaryB.sd *
        uncertaintyScale *
        zB +
        courtShift,
        lowB,
        highB
      );

    sampledServeA.push(
      serveA
    );

    sampledServeB.push(
      serveB
    );

    const sampledMatch =
      cloneWithServe(
        match,
        serveA,
        serveB
      );

    const result =
      simulateMatchTotals(
        sampledMatch,
        simsPerScenario
      );

    expectedGamesValues.push(
      result.expectedGames
    );

    expectedSetsValues.push(
      result.expectedSets
    );

    decidingValues.push(
      result.decidingSetPct
    );

    straightValues.push(
      result.straightSetsPct
    );

    tiebreakValues.push(
      result.tiebreakPct
    );

    expectedTbValues.push(
      result.expectedTiebreaks
    );

    medians.push(
      result.medianGames
    );

    secondMoments.push(
      result.sdGames ** 2 +
      result.expectedGames ** 2
    );

    for (
      const line
      of targetLines
    ) {
      lineSamples
        .get(line)
        .push(
          overAtLine(
            result,
            line
          )
        );
    }
  }

  /*
   * Trimmed mean:
   * escenarios paramétricos extremos
   * no dominan todo el modelo.
   */
  const expectedGames =
    robustMean(
      expectedGamesValues
    );

  const expectedSets =
    robustMean(
      expectedSetsValues
    );

  const decidingSetPct =
    robustMean(
      decidingValues
    );

  const straightSetsPct =
    robustMean(
      straightValues
    );

  const tiebreakPct =
    robustMean(
      tiebreakValues
    );

  const expectedTiebreaks =
    robustMean(
      expectedTbValues
    );

  const secondMoment =
    robustMean(
      secondMoments
    );

  const variance =
    Math.max(
      0,
      secondMoment -
      expectedGames ** 2
    );

  const curve =
    targetLines.map(
      line => {

        const over =
          robustMean(
            lineSamples.get(
              line
            )
          );

        return {
          line,

          overPct:
            round1(
              over * 100
            ),

          underPct:
            round1(
              (
                1 -
                over
              ) * 100
            )
        };
      }
    );

  const serveScenarioA =
    robustMean(
      sampledServeA
    );

  const serveScenarioB =
    robustMean(
      sampledServeB
    );

  return {
    version:
      'BAYES-0.4.1',

    mode:
      'BAYESIAN_STABLE',

    simulations:
      actualSimulations,

    scenarios,

    bestOf:
      inferBestOf(
        match
      ),

    expectedGames:
      round2(
        expectedGames
      ),

    medianGames:
      Math.round(
        robustMean(
          medians
        )
      ),

    sdGames:
      round2(
        Math.sqrt(
          variance
        )
      ),

    expectedSets:
      round2(
        expectedSets
      ),

    decidingSetPct:
      round1(
        decidingSetPct
      ),

    straightSetsPct:
      round1(
        straightSetsPct
      ),

    tiebreakPct:
      round1(
        tiebreakPct
      ),

    expectedTiebreaks:
      round2(
        expectedTiebreaks
      ),

    maxProbabilitySePct:
      round2(
        0.5 /
        Math.sqrt(
          actualSimulations
        ) *
        100
      ),

    curve,

    posterior: {
      playerA: {
        anchorPct:
          round1(
            anchorA * 100
          ),

        meanPct:
          round1(
            summaryA.mean *
            100
          ),

        scenarioMeanPct:
          round1(
            serveScenarioA *
            100
          ),

        low90Pct:
          round1(
            summaryA.low90 *
            100
          ),

        high90Pct:
          round1(
            summaryA.high90 *
            100
          )
      },

      playerB: {
        anchorPct:
          round1(
            anchorB * 100
          ),

        meanPct:
          round1(
            summaryB.mean *
            100
          ),

        scenarioMeanPct:
          round1(
            serveScenarioB *
            100
          ),

        low90Pct:
          round1(
            summaryB.low90 *
            100
          ),

        high90Pct:
          round1(
            summaryB.high90 *
            100
          )
      }
    }
  };
}
