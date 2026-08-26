function clamp(
  value,
  min = 0,
  max = 100
) {
  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );
}

function sampleQuality(match) {
  const a =
    Number(
      match.playerA
        ?.profile
        ?.effectiveSample ??
        match.playerA?.profile?.sample ?? 0
    );

  const b =
    Number(
      match.playerB
        ?.profile
        ?.effectiveSample ??
        match.playerB?.profile?.sample ?? 0
    );

  const minimum =
    Math.min(
      a,
      b
    );

  if (minimum < 8) {
    return 0;
  }

  return clamp(
    65 +
    (
      minimum -
      8
    ) /
    16 *
    35
  );
}

function consensusQuality(
  status
) {
  if (
    status === 'STABLE'
  ) {
    return 100;
  }

  if (
    status === 'WATCH'
  ) {
    return 60;
  }

  if (
    status === 'UNSTABLE'
  ) {
    return 15;
  }

  return 0;
}

export function getMarketReadiness(
  match
) {
  if (
    !match.matchup
      ?.markovReady
  ) {
    return {
      score: 0,
      status: 'BLOCKED',
      eligible: false,
      reason: 'PARTIAL_DATA'
    };
  }

  if (!match.totals) {
    return {
      score: 0,
      status: 'WAIT_MODEL',
      eligible: false,
      reason: 'TOTALS_PENDING'
    };
  }

  const quality =
    Number(
      match.totals
        ?.diagnostics
        ?.qualityPct || 0
    );

  const consensus =
    match.totals
      ?.diagnostics
      ?.consensusStatus;

  const disagreement =
    Number(
      match.totals
        ?.diagnostics
        ?.disagreementPct || 0
    );

  const surfaceQuality =
    match.surface === 'UNKNOWN'
      ? 0
      : Number(
          match.surfaceMeta
            ?.confidencePct || 75
        );

  const sample =
    sampleQuality(
      match
    );

  const consensusScore =
    consensusQuality(
      consensus
    );

  /*
   * Componentes:
   *
   * 45% calidad estadística
   * 20% superficie
   * 20% consenso
   * 15% muestra
   *
   * Después castigamos
   * disagreement.
   */
  let score =
    quality * 0.45 +
    surfaceQuality * 0.20 +
    consensusScore * 0.20 +
    sample * 0.15;

  const disagreementPenalty =
    Math.min(
      22,
      disagreement * 0.75
    );

  score -=
    disagreementPenalty;

  const trustLevel =
    match.matchup?.dataTrust?.level ||
    'UNKNOWN';

  const trustPenalty =
    trustLevel === 'CAUTION'
      ? 8
      : trustLevel === 'MEDIUM'
        ? 3
        : 0;

  score -= trustPenalty;
  score = clamp(score);

  const eligible =
    match.state === 'pre' &&
    match.surface !== 'UNKNOWN' &&
    match.matchup?.markovReady &&
    consensus === 'STABLE' &&
    quality >= 72 &&
    score >= 80;

  let status =
    'BLOCKED';

  if (
    eligible
  ) {
    status =
      'READY';

  } else if (
    match.state !== 'pre'
  ) {
    status =
      'LIVE';

  } else if (
    consensus === 'WATCH' &&
    score >= 65
  ) {
    status =
      'WATCH';
  } else if (
    consensus === 'STABLE' &&
    score >= 65
  ) {
    status =
      'WATCH';
  }

  let reason =
    'MODEL_GATE';

  if (
    match.state !== 'pre'
  ) {
    reason =
      'NOT_PREMATCH';
  } else if (
    match.surface === 'UNKNOWN'
  ) {
    reason =
      'SURFACE_UNKNOWN';
  } else if (
    consensus !== 'STABLE'
  ) {
    reason =
      'CONSENSUS';
  } else if (
    quality < 72
  ) {
    reason =
      'LOW_QUALITY';
  } else if (
    score < 80
  ) {
    reason =
      'READINESS_LOW';
  } else {
    reason =
      'MODEL_READY';
  }

  return {
    score:
      Math.round(
        score * 10
      ) / 10,

    status,
    eligible,
    reason,

    components: {
      quality:
        Math.round(
          quality * 10
        ) / 10,

      surface:
        Math.round(
          surfaceQuality * 10
        ) / 10,

      sample:
        Math.round(
          sample * 10
        ) / 10,

      consensus:
        consensusScore,

      disagreement:
        Math.round(
          disagreement * 10
        ) / 10,

      dataTrust:
        match.matchup?.dataTrust?.score ?? null,

      dataTrustLevel:
        match.matchup?.dataTrust?.level ?? 'UNKNOWN',

      dataTrustPenalty:
        trustPenalty
    }
  };
}
