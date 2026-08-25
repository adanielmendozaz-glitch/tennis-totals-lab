import {
  simulateMatchTotals
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

function gammaRandom(
  shape,
  rng
) {
  if (shape < 1) {
    return (
      gammaRandom(
        shape + 1,
        rng
      ) *
      Math.pow(
        rng(),
        1 / shape
      )
    );
  }

  const d =
    shape -
    1 / 3;

  const c =
    1 /
    Math.sqrt(
      9 * d
    );

  while (true) {
    const x =
      normalRandom(rng);

    let v =
      1 +
      c * x;

    if (v <= 0) {
      continue;
    }

    v =
      v * v * v;

    const u =
      rng();

    if (
      u <
      1 -
      0.0331 *
      x * x *
      x * x
    ) {
      return d * v;
    }

    if (
      Math.log(u) <
      0.5 * x * x +
      d *
      (
        1 -
        v +
        Math.log(v)
      )
    ) {
      return d * v;
    }
  }
}

function betaRandom(
  alpha,
  beta,
  rng
) {
  const x =
    gammaRandom(
      alpha,
      rng
    );

  const y =
    gammaRandom(
      beta,
      rng
    );

  return (
    x /
    (x + y)
  );
}

function addEvidence(
  posterior,
  wins,
  total,
  nominalWeight,
  maxEffective = 400
) {
  const n =
    Number(total || 0);

  const w =
    Number(wins || 0);

  if (
    n <= 0 ||
    w < 0
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
    Math.max(
      0,
      n - w
    ) * scale;
}

function posteriorForServer(
  profile,
  opponentProfile,
  baseline
) {
  const base =
    clamp(baseline);

  /*
   * Prior suficientemente fuerte para
   * evitar que muestras pequeñas dominen.
   */
  const priorStrength =
    180;

  const posterior = {
    alpha:
      base *
      priorStrength,

    beta:
      (
        1 - base
      ) *
      priorStrength
  };

  const own =
    profile?.raw;

  const opp =
    opponentProfile?.raw;

  if (own) {
    addEvidence(
      posterior,
      own.servePointsWon,
      own.servePoints,
      0.22,
      400
    );
  }

  /*
   * Si el rival gana X puntos
   * al resto, el servidor gana
   * el complemento.
   */
  if (opp) {
    const serverWins =
      Number(
        opp.returnPoints || 0
      ) -
      Number(
        opp.returnPointsWon || 0
      );

    addEvidence(
      posterior,
      serverWins,
      opp.returnPoints,
      0.18,
      350
    );
  }

  return posterior;
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
    (a + b);

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

function cloneWithServe(
  match,
  serveA,
  serveB
) {
  const holdA =
    holdFromPointProbability(
      serveA
    );

  const holdB =
    holdFromPointProbability(
      serveB
    );

  return {
    ...match,

    matchup: {
      ...match.matchup,

      playerA: {
        ...match.matchup.playerA,

        servePointPct:
          serveA * 100,

        holdPct:
          holdA * 100
      },

      playerB: {
        ...match.matchup.playerB,

        servePointPct:
          serveB * 100,

        holdPct:
          holdB * 100
      }
    }
  };
}

function overAtLine(
  result,
  line
) {
  const exact =
    result.curve.find(
      row =>
        Math.abs(
          row.line -
          line
        ) <
        0.001
    );

  if (exact) {
    return (
      exact.overPct /
      100
    );
  }

  const ordered =
    [...result.curve]
      .sort(
        (a, b) =>
          a.line -
          b.line
      );

  if (
    line <
    ordered[0].line
  ) {
    return 1;
  }

  if (
    line >
    ordered[
      ordered.length - 1
    ].line
  ) {
    return 0;
  }

  const nearest =
    ordered.reduce(
      (best, row) =>
        Math.abs(
          row.line -
          line
        ) <
        Math.abs(
          best.line -
          line
        )
          ? row
          : best
    );

  return (
    nearest.overPct /
    100
  );
}

export function simulateBayesianTotals(
  match,
  targetLines,
  requestedSimulations = 30000
) {
  const baseline =
    Number(
      match.matchup
        ?.baseline
        ?.servePointPct
    ) / 100;

  const posteriorA =
    posteriorForServer(
      match.playerA.profile,
      match.playerB.profile,
      baseline
    );

  const posteriorB =
    posteriorForServer(
      match.playerB.profile,
      match.playerA.profile,
      baseline
    );

  const summaryA =
    posteriorSummary(
      posteriorA
    );

  const summaryB =
    posteriorSummary(
      posteriorB
    );

  const batches = 15;

  const simsPerBatch =
    Math.max(
      1000,
      Math.floor(
        requestedSimulations /
        batches
      )
    );

  const actualSimulations =
    simsPerBatch *
    batches;

  const rng =
    mulberry32(
      hashString(
        [
          match.id,
          'BAYES',
          posteriorA.alpha,
          posteriorA.beta,
          posteriorB.alpha,
          posteriorB.beta
        ].join('|')
      )
    );

  let expectedGames = 0;
  let expectedSets = 0;
  let decidingSet = 0;
  let straightSets = 0;
  let tiebreak = 0;

  let secondMoment = 0;

  const curveAccumulator =
    new Map(
      targetLines.map(
        line => [
          line,
          0
        ]
      )
    );

  for (
    let batch = 0;
    batch < batches;
    batch++
  ) {
    const serveA =
      clamp(
        betaRandom(
          posteriorA.alpha,
          posteriorA.beta,
          rng
        ),
        0.45,
        0.82
      );

    const serveB =
      clamp(
        betaRandom(
          posteriorB.alpha,
          posteriorB.beta,
          rng
        ),
        0.45,
        0.82
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
        simsPerBatch
      );

    expectedGames +=
      result.expectedGames;

    expectedSets +=
      result.expectedSets;

    decidingSet +=
      result.decidingSetPct;

    straightSets +=
      result.straightSetsPct;

    tiebreak +=
      result.tiebreakPct;

    secondMoment +=
      (
        result.sdGames *
        result.sdGames
      ) +
      (
        result.expectedGames *
        result.expectedGames
      );

    for (
      const line
      of targetLines
    ) {
      curveAccumulator.set(
        line,
        curveAccumulator.get(line) +
        overAtLine(
          result,
          line
        )
      );
    }
  }

  expectedGames /=
    batches;

  expectedSets /=
    batches;

  decidingSet /=
    batches;

  straightSets /=
    batches;

  tiebreak /=
    batches;

  secondMoment /=
    batches;

  const variance =
    Math.max(
      0,
      secondMoment -
      expectedGames *
      expectedGames
    );

  const curve =
    targetLines.map(
      line => {

        const over =
          curveAccumulator.get(line) /
          batches;

        return {
          line,

          overPct:
            Math.round(
              over *
              1000
            ) / 10,

          underPct:
            Math.round(
              (
                1 -
                over
              ) *
              1000
            ) / 10
        };
      }
    );

  return {
    version:
      'BAYES-0.4.0',

    mode:
      'BAYESIAN',

    simulations:
      actualSimulations,

    bestOf:
      match.matchup
        ?.bestOf,

    expectedGames:
      Math.round(
        expectedGames *
        100
      ) / 100,

    medianGames:
      Math.round(
        expectedGames
      ),

    sdGames:
      Math.round(
        Math.sqrt(
          variance
        ) *
        100
      ) / 100,

    expectedSets:
      Math.round(
        expectedSets *
        100
      ) / 100,

    decidingSetPct:
      Math.round(
        decidingSet *
        10
      ) / 10,

    straightSetsPct:
      Math.round(
        straightSets *
        10
      ) / 10,

    tiebreakPct:
      Math.round(
        tiebreak *
        10
      ) / 10,

    curve,

    posterior: {
      playerA: {
        meanPct:
          summaryA.mean *
          100,

        low90Pct:
          summaryA.low90 *
          100,

        high90Pct:
          summaryA.high90 *
          100
      },

      playerB: {
        meanPct:
          summaryB.mean *
          100,

        low90Pct:
          summaryB.low90 *
          100,

        high90Pct:
          summaryB.high90 *
          100
      }
    }
  };
}
