function clamp(
  value,
  min = 0.0001,
  max = 0.9999
) {
  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );
}

function pct(value) {
  return Math.round(
    value * 1000
  ) / 10;
}

function hashString(value) {
  let hash = 2166136261;

  const text =
    String(value);

  for (
    let i = 0;
    i < text.length;
    i++
  ) {
    hash ^=
      text.charCodeAt(i);

    hash =
      Math.imul(
        hash,
        16777619
      );
  }

  return hash >>> 0;
}

function mulberry32(seed) {
  let a =
    seed >>> 0;

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

export function inferBestOf(
  match
) {
  const explicit =
    Number(
      match.bestOf
    );

  if (
    explicit === 3 ||
    explicit === 5
  ) {
    return explicit;
  }

  if (
    match.tour !== 'ATP'
  ) {
    return 3;
  }

  const text =
    [
      match.tournament,
      match.round,
      match.type
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

  const grandSlam =
    text.includes(
      'australian open'
    ) ||
    text.includes(
      'french open'
    ) ||
    text.includes(
      'roland garros'
    ) ||
    text.includes(
      'wimbledon'
    ) ||
    text.includes(
      'us open'
    );

  const qualifying =
    text.includes('qual');

  /*
   * ATP Grand Slam main draw:
   * best-of-five.
   *
   * Qualifying remains best-of-three.
   */
  return (
    grandSlam &&
    !qualifying
  )
    ? 5
    : 3;
}

function tiebreakServer(
  firstServer,
  pointIndex
) {
  if (
    pointIndex === 0
  ) {
    return firstServer;
  }

  const block =
    Math.floor(
      (
        pointIndex - 1
      ) / 2
    );

  return (
    block % 2 === 0
  )
    ? 1 - firstServer
    : firstServer;
}

function simulateTiebreak(
  rng,
  serveA,
  serveB,
  firstServer
) {
  let pointsA = 0;
  let pointsB = 0;
  let point = 0;

  while (true) {

    const server =
      tiebreakServer(
        firstServer,
        point
      );

    /*
     * Si A sirve:
     * P(A gana punto) = serveA.
     *
     * Si B sirve:
     * P(A gana punto) = 1 - serveB.
     */
    const pA =
      server === 0
        ? serveA
        : 1 - serveB;

    if (
      rng() < pA
    ) {
      pointsA++;
    } else {
      pointsB++;
    }

    point++;

    if (
      (
        pointsA >= 7 ||
        pointsB >= 7
      ) &&
      Math.abs(
        pointsA -
        pointsB
      ) >= 2
    ) {
      return {
        winner:
          pointsA >
          pointsB
            ? 0
            : 1,

        nextServer:
          1 -
          firstServer
      };
    }

    /*
     * Protección ante un tiebreak
     * patológicamente largo.
     */
    if (
      point >= 200
    ) {
      return {
        winner:
          pointsA >= pointsB
            ? 0
            : 1,

        nextServer:
          1 -
          firstServer
      };
    }
  }
}

function simulateSet(
  rng,
  holdA,
  holdB,
  serveA,
  serveB,
  firstServer
) {
  let gamesA = 0;
  let gamesB = 0;

  let server =
    firstServer;

  while (true) {

    /*
     * 6-6:
     * tiebreak.
     *
     * El tiebreak cuenta como
     * un game para total games.
     */
    if (
      gamesA === 6 &&
      gamesB === 6
    ) {
      const tb =
        simulateTiebreak(
          rng,
          serveA,
          serveB,
          server
        );

      if (
        tb.winner === 0
      ) {
        gamesA++;
      } else {
        gamesB++;
      }

      return {
        winner:
          tb.winner,

        games:
          gamesA +
          gamesB,

        tiebreaks: 1,

        nextServer:
          tb.nextServer
      };
    }

    const serverHold =
      server === 0
        ? holdA
        : holdB;

    const held =
      rng() <
      serverHold;

    let gameWinner;

    if (
      server === 0
    ) {
      gameWinner =
        held ? 0 : 1;
    } else {
      gameWinner =
        held ? 1 : 0;
    }

    if (
      gameWinner === 0
    ) {
      gamesA++;
    } else {
      gamesB++;
    }

    /*
     * El orden de servicio continúa
     * naturalmente al siguiente game.
     */
    server =
      1 -
      server;

    if (
      (
        gamesA >= 6 ||
        gamesB >= 6
      ) &&
      Math.abs(
        gamesA -
        gamesB
      ) >= 2
    ) {
      return {
        winner:
          gamesA >
          gamesB
            ? 0
            : 1,

        games:
          gamesA +
          gamesB,

        tiebreaks: 0,

        nextServer:
          server
      };
    }
  }
}

function simulateMatch(
  rng,
  {
    serveA,
    serveB,
    holdA,
    holdB,
    bestOf
  }
) {
  const setsNeeded =
    Math.floor(
      bestOf / 2
    ) + 1;

  let setsA = 0;
  let setsB = 0;

  let totalGames = 0;
  let tiebreaks = 0;
  let setsPlayed = 0;

  /*
   * Pre-match no conocemos
   * quién servirá primero.
   */
  let firstServer =
    rng() < 0.5
      ? 0
      : 1;

  while (
    setsA < setsNeeded &&
    setsB < setsNeeded
  ) {
    const set =
      simulateSet(
        rng,
        holdA,
        holdB,
        serveA,
        serveB,
        firstServer
      );

    totalGames +=
      set.games;

    tiebreaks +=
      set.tiebreaks;

    setsPlayed++;

    if (
      set.winner === 0
    ) {
      setsA++;
    } else {
      setsB++;
    }

    firstServer =
      set.nextServer;
  }

  return {
    totalGames,
    tiebreaks,
    setsPlayed
  };
}

function medianFromDistribution(
  distribution,
  simulations
) {
  const target =
    Math.ceil(
      simulations / 2
    );

  let running = 0;

  for (
    let games = 0;
    games <
    distribution.length;
    games++
  ) {
    running +=
      distribution[games];

    if (
      running >= target
    ) {
      return games;
    }
  }

  return 0;
}

function overProbability(
  distribution,
  line,
  simulations
) {
  let count = 0;

  for (
    let games = 0;
    games <
    distribution.length;
    games++
  ) {
    if (
      games > line
    ) {
      count +=
        distribution[games];
    }
  }

  return (
    count /
    simulations
  );
}

function buildCurve(
  distribution,
  median,
  simulations
) {
  /*
   * 17 medias líneas alrededor
   * del centro de la distribución.
   */
  const firstLine =
    Math.max(
      11.5,
      Math.floor(
        median
      ) - 8.5
    );

  const curve = [];

  for (
    let i = 0;
    i < 17;
    i++
  ) {
    const line =
      firstLine + i;

    const over =
      overProbability(
        distribution,
        line,
        simulations
      );

    curve.push({
      line,

      overPct:
        pct(over),

      underPct:
        pct(
          1 - over
        )
    });
  }

  return curve;
}

export function simulateMatchTotals(
  match,
  requestedSimulations = 50000
) {
  const matchup =
    match.matchup;

  if (
    !matchup?.markovReady
  ) {
    throw new Error(
      'MATCH_NOT_MARKOV_READY'
    );
  }

  const simulations =
    Math.max(
      1000,
      Math.min(
        1000000,
        Math.floor(
          requestedSimulations
        )
      )
    );

  const serveA =
    clamp(
      Number(
        matchup
          .playerA
          .servePointPct
      ) / 100
    );

  const serveB =
    clamp(
      Number(
        matchup
          .playerB
          .servePointPct
      ) / 100
    );

  const holdA =
    clamp(
      Number(
        matchup
          .playerA
          .holdPct
      ) / 100
    );

  const holdB =
    clamp(
      Number(
        matchup
          .playerB
          .holdPct
      ) / 100
    );

  const bestOf =
    inferBestOf(
      match
    );

  const fingerprint =
    [
      match.id,
      serveA.toFixed(5),
      serveB.toFixed(5),
      holdA.toFixed(5),
      holdB.toFixed(5),
      bestOf,
      simulations
    ].join('|');

  const rng =
    mulberry32(
      hashString(
        fingerprint
      )
    );

  const distribution =
    new Uint32Array(
      bestOf === 5
        ? 80
        : 50
    );

  let sumGames = 0;
  let sumGamesSquared = 0;

  let sumSets = 0;
  let matchesWithTiebreak = 0;
  let totalTiebreaks = 0;

  let decidingSets = 0;
  let straightSets = 0;

  const setsNeeded =
    Math.floor(
      bestOf / 2
    ) + 1;

  for (
    let i = 0;
    i < simulations;
    i++
  ) {
    const result =
      simulateMatch(
        rng,
        {
          serveA,
          serveB,
          holdA,
          holdB,
          bestOf
        }
      );

    distribution[
      result.totalGames
    ]++;

    sumGames +=
      result.totalGames;

    sumGamesSquared +=
      result.totalGames *
      result.totalGames;

    sumSets +=
      result.setsPlayed;

    totalTiebreaks +=
      result.tiebreaks;

    if (
      result.tiebreaks > 0
    ) {
      matchesWithTiebreak++;
    }

    if (
      result.setsPlayed ===
      bestOf
    ) {
      decidingSets++;
    }

    if (
      result.setsPlayed ===
      setsNeeded
    ) {
      straightSets++;
    }
  }

  const expectedGames =
    sumGames /
    simulations;

  const variance =
    Math.max(
      0,
      (
        sumGamesSquared /
        simulations
      ) -
      expectedGames *
      expectedGames
    );

  const median =
    medianFromDistribution(
      distribution,
      simulations
    );

  const curve =
    buildCurve(
      distribution,
      median,
      simulations
    );

  return {
    version: 'MC-0.3.0',

    mode: 'PREMATCH',

    simulations,

    bestOf,

    expectedGames:
      Math.round(
        expectedGames *
        100
      ) / 100,

    medianGames:
      median,

    sdGames:
      Math.round(
        Math.sqrt(
          variance
        ) *
        100
      ) / 100,

    expectedSets:
      Math.round(
        (
          sumSets /
          simulations
        ) *
        100
      ) / 100,

    decidingSetPct:
      pct(
        decidingSets /
        simulations
      ),

    straightSetsPct:
      pct(
        straightSets /
        simulations
      ),

    tiebreakPct:
      pct(
        matchesWithTiebreak /
        simulations
      ),

    expectedTiebreaks:
      Math.round(
        (
          totalTiebreaks /
          simulations
        ) *
        100
      ) / 100,

    /*
     * Error estándar máximo aproximado
     * de una probabilidad MC alrededor
     * de 50%.
     */
    maxProbabilitySePct:
      Math.round(
        (
          0.5 /
          Math.sqrt(
            simulations
          ) *
          100
        ) *
        100
      ) / 100,

    curve
  };
}
