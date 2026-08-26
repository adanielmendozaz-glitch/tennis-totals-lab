function clamp(
  value,
  min,
  max
) {
  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );
}

function finite(
  value,
  fallback = null
) {
  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function round1(value) {
  return Math.round(
    Number(value || 0) *
    10
  ) / 10;
}

function round2(value) {
  return Math.round(
    Number(value || 0) *
    100
  ) / 100;
}

function mean(values) {
  if (!values.length) {
    return null;
  }

  return (
    values.reduce(
      (sum, value) =>
        sum + value,
      0
    ) /
    values.length
  );
}

function profileVector(
  profile,
  baseline
) {
  const hold =
    finite(
      profile?.holdPct,
      baseline.hold
    );

  const breakPct =
    finite(
      profile?.breakPct,
      baseline.break
    );

  const spw =
    finite(
      profile?.servePointsWonPct,
      baseline.spw
    );

  const rpw =
    finite(
      profile?.returnPointsWonPct,
      baseline.rpw
    );

  return {
    hold,
    breakPct,
    spw,
    rpw,

    gameStrength:
      (
        hold +
        breakPct
      ) / 2,

    pointStrength:
      (
        spw +
        rpw
      ) / 2
  };
}

function trustFactor(level) {
  if (level === 'HIGH') {
    return 1.00;
  }

  if (level === 'MEDIUM') {
    return 0.90;
  }

  if (level === 'CAUTION') {
    return 0.72;
  }

  return 0.82;
}

/*
 * v0.6.8.2 — FAIR LINE / MATCH LENGTH
 *
 * No fuerza OVER ni UNDER.
 *
 * Conserva aproximadamente el HOLD medio
 * y expande solamente el GAP A-vs-B
 * cuando la evidencia histórica indica
 * una diferencia real de fuerza.
 */
export function buildMatchLengthCalibration(
  match
) {
  const matchup =
    match?.matchup;

  if (
    !matchup?.markovReady ||
    !matchup.playerA ||
    !matchup.playerB
  ) {
    return {
      available: false,
      status: 'UNAVAILABLE',
      reason: 'MATCHUP_NOT_READY',
      holdShiftAPp: 0,
      holdShiftBPp: 0
    };
  }

  const baseline = {
    hold:
      finite(
        matchup.baseline?.holdPct,
        matchup.averageHoldPct || 70
      ),

    break:
      finite(
        matchup.baseline?.breakPct,
        30
      ),

    spw:
      finite(
        matchup.baseline?.servePointPct,
        60
      ),

    rpw:
      finite(
        matchup.baseline?.returnPointPct,
        40
      )
  };

  const vectorA =
    profileVector(
      match.playerA?.profile,
      baseline
    );

  const vectorB =
    profileVector(
      match.playerB?.profile,
      baseline
    );

  const gameGapPp =
    vectorA.gameStrength -
    vectorB.gameStrength;

  const pointGapPp =
    vectorA.pointStrength -
    vectorB.pointStrength;

  const ratingA =
    finite(
      match.playerA
        ?.profile
        ?.ratingBlend,
      1500
    );

  const ratingB =
    finite(
      match.playerB
        ?.profile
        ?.ratingBlend,
      1500
    );

  const eloMatchesA =
    Math.max(
      0,
      finite(
        match.playerA
          ?.profile
          ?.eloMatches,
        0
      )
    );

  const eloMatchesB =
    Math.max(
      0,
      finite(
        match.playerB
          ?.profile
          ?.eloMatches,
        0
      )
    );

  const ratingEvidence =
    clamp(
      Math.min(
        eloMatchesA,
        eloMatchesB
      ) / 30,
      0,
      1
    );

  const ratingGapPp =
    clamp(
      (
        ratingA -
        ratingB
      ) / 50,
      -8,
      8
    ) *
    ratingEvidence;

  const strengthGapPp =
    0.65 *
    gameGapPp +
    0.25 *
    pointGapPp +
    0.10 *
    ratingGapPp;

  const relA =
    clamp(
      finite(
        matchup.playerA
          ?.reliabilityPct,
        0
      ) / 100,
      0,
      1
    );

  const relB =
    clamp(
      finite(
        matchup.playerB
          ?.reliabilityPct,
        0
      ) / 100,
      0,
      1
    );

  const minimumReliability =
    Math.min(
      relA,
      relB
    );

  const trust =
    matchup.dataTrust
      ?.level ||
    'UNKNOWN';

  const evidenceFactor =
    clamp(
      (
        0.60 +
        0.40 *
        minimumReliability
      ) *
      trustFactor(trust),
      0.45,
      0.98
    );

  const baseHoldA =
    finite(
      matchup.playerA
        ?.holdPct,
      baseline.hold
    );

  const baseHoldB =
    finite(
      matchup.playerB
        ?.holdPct,
      baseline.hold
    );

  const baseHoldGapPp =
    baseHoldA -
    baseHoldB;

  const targetHoldGapPp =
    clamp(
      strengthGapPp *
      3.20,
      -20,
      20
    );

  const correctionGapPp =
    clamp(
      (
        targetHoldGapPp -
        baseHoldGapPp
      ) *
      evidenceFactor,
      -14,
      14
    );

  const holdShiftAPp =
    correctionGapPp / 2;

  const holdShiftBPp =
    -holdShiftAPp;

  const calibratedHoldA =
    clamp(
      baseHoldA +
      holdShiftAPp,
      45,
      96
    );

  const calibratedHoldB =
    clamp(
      baseHoldB +
      holdShiftBPp,
      45,
      96
    );

  const calibratedHoldGapPp =
    calibratedHoldA -
    calibratedHoldB;

  const gapExpansionPp =
    Math.abs(
      calibratedHoldGapPp
    ) -
    Math.abs(
      baseHoldGapPp
    );

  const compressionBefore =
    Math.abs(
      strengthGapPp
    ) >= 3 &&
    Math.abs(
      baseHoldGapPp
    ) <= 4;

  const dominantSide =
    Math.abs(
      strengthGapPp
    ) < 0.75
      ? 'BALANCED'
      : strengthGapPp > 0
        ? 'A'
        : 'B';

  return {
    available: true,
    version: 'ML-0.1.0',

    status:
      Math.abs(
        correctionGapPp
      ) >= 0.75
        ? 'ACTIVE'
        : 'MINOR',

    dominantSide,

    trust,

    minimumReliabilityPct:
      round1(
        minimumReliability *
        100
      ),

    evidencePct:
      round1(
        evidenceFactor *
        100
      ),

    components: {
      gameGapPp:
        round2(
          gameGapPp
        ),

      pointGapPp:
        round2(
          pointGapPp
        ),

      ratingGapPp:
        round2(
          ratingGapPp
        )
    },

    strengthGapPp:
      round2(
        strengthGapPp
      ),

    baseHoldA:
      round2(
        baseHoldA
      ),

    baseHoldB:
      round2(
        baseHoldB
      ),

    baseHoldGapPp:
      round2(
        baseHoldGapPp
      ),

    targetHoldGapPp:
      round2(
        targetHoldGapPp
      ),

    correctionGapPp:
      round2(
        correctionGapPp
      ),

    holdShiftAPp:
      round2(
        holdShiftAPp
      ),

    holdShiftBPp:
      round2(
        holdShiftBPp
      ),

    calibratedHoldA:
      round2(
        calibratedHoldA
      ),

    calibratedHoldB:
      round2(
        calibratedHoldB
      ),

    calibratedHoldGapPp:
      round2(
        calibratedHoldGapPp
      ),

    gapExpansionPp:
      round2(
        gapExpansionPp
      ),

    compressionBefore
  };
}

export function prepareMatchLength(
  match
) {
  return {
    ...match,

    lengthCalibration:
      buildMatchLengthCalibration(
        match
      )
  };
}

export function fairLineFromCurve(
  curve
) {
  const rows =
    (curve || [])
      .filter(
        row =>
          Number.isFinite(
            Number(row.line)
          ) &&
          Number.isFinite(
            Number(row.overPct)
          )
      );

  if (!rows.length) {
    return null;
  }

  const best =
    [...rows].sort(
      (a, b) => {
        const da =
          Math.abs(
            Number(a.overPct) -
            50
          );

        const db =
          Math.abs(
            Number(b.overPct) -
            50
          );

        if (da !== db) {
          return da - db;
        }

        return (
          Number(a.line) -
          Number(b.line)
        );
      }
    )[0];

  return {
    line:
      Number(best.line),

    overPct:
      Number(best.overPct),

    underPct:
      Number(best.underPct)
  };
}

export function summarizeMatchLength(
  matches
) {
  const rows =
    (matches || [])
      .filter(
        match =>
          match?.totals &&
          Number.isFinite(
            Number(
              match.totals
                .expectedGames
            )
          )
      )
      .map(
        match => ({
          expected:
            Number(
              match.totals
                .expectedGames
            ),

          deciding:
            Number(
              match.totals
                .decidingSetPct || 0
            ),

          fairLine:
            Number(
              match.totals
                ?.lengthAudit
                ?.fairLine
            ),

          status:
            match.totals
              ?.lengthAudit
              ?.status ||
            'UNKNOWN'
        })
      );

  const n =
    rows.length;

  if (!n) {
    return {
      n: 0,
      status: 'WAIT',
      expectedMin: null,
      expectedMax: null,
      expectedRange: null,
      decidingMin: null,
      decidingMax: null,
      avgDeciding: null,
      flatDecidingPct: 0,
      compressionCount: 0,
      fairMin: null,
      fairMax: null
    };
  }

  const expected =
    rows.map(
      row =>
        row.expected
    );

  const deciding =
    rows.map(
      row =>
        row.deciding
    );

  const fair =
    rows
      .map(
        row =>
          row.fairLine
      )
      .filter(
        Number.isFinite
      );

  const expectedMin =
    Math.min(
      ...expected
    );

  const expectedMax =
    Math.max(
      ...expected
    );

  const expectedRange =
    expectedMax -
    expectedMin;

  const decidingMin =
    Math.min(
      ...deciding
    );

  const decidingMax =
    Math.max(
      ...deciding
    );

  const flatDecidingCount =
    deciding.filter(
      value =>
        value >= 47.5
    ).length;

  const flatDecidingPct =
    flatDecidingCount /
    n *
    100;

  const compressionCount =
    rows.filter(
      row =>
        row.status ===
        'COMPRESSION'
    ).length;

  let status =
    n < 5
      ? 'EARLY'
      : 'OK';

  if (
    n >= 10 &&
    (
      expectedRange <= 1.75 ||
      flatDecidingPct >= 75 ||
      compressionCount > 0
    )
  ) {
    status = 'AUDIT';

  } else if (
    n >= 10 &&
    (
      expectedRange <= 2.50 ||
      flatDecidingPct >= 55
    )
  ) {
    status = 'WATCH';
  }

  return {
    n,
    status,

    expectedMin:
      round2(
        expectedMin
      ),

    expectedMax:
      round2(
        expectedMax
      ),

    expectedRange:
      round2(
        expectedRange
      ),

    decidingMin:
      round1(
        decidingMin
      ),

    decidingMax:
      round1(
        decidingMax
      ),

    avgDeciding:
      round1(
        mean(deciding)
      ),

    flatDecidingPct:
      round1(
        flatDecidingPct
      ),

    compressionCount,

    fairMin:
      fair.length
        ? Math.min(
            ...fair
          )
        : null,

    fairMax:
      fair.length
        ? Math.max(
            ...fair
          )
        : null
  };
}

