import {
  getTourBaselines,
  selectBaseline
} from './surfaceBaselines.js';

const EPS =
  0.0001;

function clamp(
  value,
  min = EPS,
  max = 1 - EPS
) {
  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );
}

function logit(value) {
  const p =
    clamp(value);

  return Math.log(
    p /
    (1 - p)
  );
}

function logistic(value) {
  return 1 /
    (
      1 +
      Math.exp(-value)
    );
}

function toProbability(pct) {
  if (
    pct === null ||
    pct === undefined
  ) {
    return null;
  }

  const n =
    Number(pct);

  if (!Number.isFinite(n)) {
    return null;
  }

  return clamp(
    n / 100
  );
}

function toPct(value) {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  return Math.round(
    value *
    1000
  ) / 10;
}

function reliability(profile) {
  if (!profile) {
    return 0;
  }

  const n =
    Math.max(
      0,
      Number(
        profile.sample || 0
      )
    );

  let value =
    n /
    (n + 12);

  if (
    profile.sampleType !==
    'SURFACE'
  ) {
    value *= 0.82;
  }

  if (
    profile.confidence ===
    'MEDIUM'
  ) {
    value *= 0.90;
  }

  if (
    profile.confidence ===
    'LOW'
  ) {
    value *= 0.72;
  }

  return Math.max(
    0.15,
    Math.min(
      0.92,
      value
    )
  );
}

function shrink(
  raw,
  baseline,
  weight
) {
  if (
    raw === null ||
    raw === undefined
  ) {
    return baseline;
  }

  return logistic(
    logit(baseline) +
    weight *
    (
      logit(raw) -
      logit(baseline)
    )
  );
}

function weightedLogit(
  a,
  b,
  weightA,
  weightB
) {
  return logistic(
    (
      logit(a) *
      weightA
    ) +
    (
      logit(b) *
      weightB
    )
  );
}

/*
 * Markov exacto de un game de tenis.
 *
 * Incluye:
 * 4-0, 4-1, 4-2
 * +
 * probabilidad de llegar a deuce
 * y ganar desde deuce.
 */
export function holdFromPointProbability(
  probability
) {
  const p =
    clamp(probability);

  const q =
    1 - p;

  const beforeDeuce =
    Math.pow(p, 4) *
    (
      1 +
      4 * q +
      10 * q * q
    );

  const reachDeuce =
    20 *
    Math.pow(p, 3) *
    Math.pow(q, 3);

  const winFromDeuce =
    (
      p * p
    ) /
    (
      p * p +
      q * q
    );

  return clamp(
    beforeDeuce +
    reachDeuce *
    winFromDeuce
  );
}

function matchupPlayer(
  serverProfile,
  returnProfile,
  baseline
) {
  const baseSPW =
    baseline.spw;

  const baseHold =
    baseline.hold;

  const serverRel =
    reliability(
      serverProfile
    );

  const returnRel =
    reliability(
      returnProfile
    );

  const rawServe =
    toProbability(
      serverProfile
        ?.servePointsWonPct
    );

  const rawReturn =
    toProbability(
      returnProfile
        ?.returnPointsWonPct
    );

  const serverEstimate =
    shrink(
      rawServe,
      baseSPW,
      serverRel
    );

  /*
   * Si el rival gana RPW,
   * el servidor concede esos puntos.
   */
  const opponentConcede =
    shrink(
      rawReturn !== null
        ? 1 - rawReturn
        : null,
      baseSPW,
      returnRel
    );

  const projectedServe =
    weightedLogit(
      serverEstimate,
      opponentConcede,
      0.56,
      0.44
    );

  const projectedHold =
    holdFromPointProbability(
      projectedServe
    );

  /*
   * Cross-check a nivel game.
   * No modifica todavía el Markov;
   * solo sirve para auditoría.
   */
  const rawHold =
    toProbability(
      serverProfile
        ?.holdPct
    );

  const rawOppBreak =
    toProbability(
      returnProfile
        ?.breakPct
    );

  const holdEvidence =
    shrink(
      rawHold,
      baseHold,
      serverRel
    );

  const breakConcession =
    shrink(
      rawOppBreak !== null
        ? 1 - rawOppBreak
        : null,
      baseHold,
      returnRel
    );

  const gameCrossCheck =
    weightedLogit(
      holdEvidence,
      breakConcession,
      0.56,
      0.44
    );

  return {
    servePointPct:
      toPct(
        projectedServe
      ),

    holdPct:
      toPct(
        projectedHold
      ),

    baselineServePct:
      toPct(
        baseSPW
      ),

    baselineHoldPct:
      toPct(
        baseHold
      ),

    serveDeltaPct:
      toPct(
        projectedServe -
        baseSPW
      ),

    gameCrossCheckPct:
      toPct(
        gameCrossCheck
      ),

    holdGapPct:
      toPct(
        projectedHold -
        gameCrossCheck
      ),

    reliabilityPct:
      toPct(
        (
          serverRel +
          returnRel
        ) / 2
      )
  };
}

function profileComplete(profile) {
  return Boolean(
    profile &&
    profile.servePointsWonPct !== null &&
    profile.servePointsWonPct !== undefined &&
    profile.returnPointsWonPct !== null &&
    profile.returnPointsWonPct !== undefined
  );
}

function classify(
  match,
  baseline
) {
  const a =
    match.playerA.profile;

  const b =
    match.playerB.profile;

  if (
    !a &&
    !b
  ) {
    return 'NO_DATA';
  }

  const full =
    match.surface !== 'UNKNOWN' &&
    profileComplete(a) &&
    profileComplete(b) &&
    baseline?.spw !== null &&
    baseline?.hold !== null;

  if (full) {
    return 'FULL';
  }

  return 'PARTIAL';
}

function buildMatchup(
  match,
  baseline
) {
  if (
    !baseline ||
    baseline.spw === null ||
    baseline.hold === null
  ) {
    return {
      status: 'NO_DATA',
      markovReady: false,
      reason: 'BASELINE_MISSING'
    };
  }

  const status =
    classify(
      match,
      baseline
    );

  const playerA =
    matchupPlayer(
      match.playerA.profile,
      match.playerB.profile,
      baseline
    );

  const playerB =
    matchupPlayer(
      match.playerB.profile,
      match.playerA.profile,
      baseline
    );

  const averageHold =
    (
      Number(
        playerA.holdPct || 0
      ) +
      Number(
        playerB.holdPct || 0
      )
    ) / 2;

  return {
    status,

    markovReady:
      status === 'FULL',

    baselineSurface:
      baseline.surface,

    baseline: {
      servePointPct:
        toPct(
          baseline.spw
        ),

      returnPointPct:
        toPct(
          baseline.rpw
        ),

      holdPct:
        toPct(
          baseline.hold
        ),

      breakPct:
        toPct(
          baseline.break
        ),

      samples:
        baseline.samples
    },

    playerA,
    playerB,

    averageHoldPct:
      Math.round(
        averageHold *
        10
      ) / 10
  };
}

export async function enrichMatchesWithMatchup(
  matches
) {
  const [
    atp,
    wta
  ] =
    await Promise.all([
      getTourBaselines('ATP'),
      getTourBaselines('WTA')
    ]);

  const baselineSets = {
    ATP: atp,
    WTA: wta
  };

  let full = 0;
  let partial = 0;
  let noData = 0;
  let markovReady = 0;

  const enriched =
    matches.map(match => {

      const baselineSet =
        baselineSets[
          match.tour
        ];

      const baseline =
        selectBaseline(
          baselineSet,
          match.surface
        );

      const matchup =
        buildMatchup(
          match,
          baseline
        );

      if (
        matchup.status === 'FULL'
      ) {
        full++;
      } else if (
        matchup.status === 'PARTIAL'
      ) {
        partial++;
      } else {
        noData++;
      }

      if (
        matchup.markovReady
      ) {
        markovReady++;
      }

      return {
        ...match,
        matchup
      };
    });

  return {
    matches: enriched,

    summary: {
      total:
        matches.length,

      full,
      partial,
      noData,
      markovReady,

      atp: {
        all:
          atp.surfaces.ALL,

        hard:
          atp.surfaces.HARD,

        clay:
          atp.surfaces.CLAY,

        grass:
          atp.surfaces.GRASS
      },

      wta: {
        all:
          wta.surfaces.ALL,

        hard:
          wta.surfaces.HARD,

        clay:
          wta.surfaces.CLAY,

        grass:
          wta.surfaces.GRASS
      }
    }
  };
}
