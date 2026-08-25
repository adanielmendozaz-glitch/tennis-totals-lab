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

function americanToProbability(
  odds
) {
  const n =
    Number(odds);

  if (!Number.isFinite(n)) {
    return null;
  }

  if (n < 0) {
    return (
      Math.abs(n) /
      (
        Math.abs(n) +
        100
      )
    );
  }

  if (n > 0) {
    return (
      100 /
      (
        n +
        100
      )
    );
  }

  return null;
}

function fairAmerican(
  probability
) {
  const p =
    clamp(
      probability,
      0.001,
      0.999
    );

  if (p >= 0.5) {
    return Math.round(
      -100 *
      p /
      (
        1 -
        p
      )
    );
  }

  return Math.round(
    100 *
    (
      1 -
      p
    ) /
    p
  );
}

function probabilityAtLine(
  totals,
  line
) {
  if (
    !totals?.curve?.length
  ) {
    return null;
  }

  const ordered =
    [...totals.curve]
      .sort(
        (a, b) =>
          a.line -
          b.line
      );

  const exact =
    ordered.find(
      row =>
        Math.abs(
          row.line -
          line
        ) < 0.001
    );

  if (exact) {
    return {
      over:
        Number(
          exact.overPct
        ) / 100,

      under:
        Number(
          exact.underPct
        ) / 100
    };
  }

  /*
   * Interpolación entre dos
   * medias líneas conocidas.
   */
  for (
    let i = 0;
    i < ordered.length - 1;
    i++
  ) {
    const left =
      ordered[i];

    const right =
      ordered[i + 1];

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

      const overPct =
        left.overPct +
        ratio *
        (
          right.overPct -
          left.overPct
        );

      return {
        over:
          overPct / 100,

        under:
          1 -
          overPct / 100
      };
    }
  }

  return null;
}

function classification({
  eligible,
  probability,
  edge
}) {
  if (!eligible) {
    return 'PASS';
  }

  if (
    probability >= 0.62 &&
    edge >= 0.065
  ) {
    return 'PLAY';
  }

  if (
    probability >= 0.57 &&
    edge >= 0.035
  ) {
    return 'LEAN';
  }

  return 'PASS';
}

export function evaluateMarket(
  match,
  market
) {
  if (
    !match?.totals ||
    !market
  ) {
    return null;
  }

  const probabilities =
    probabilityAtLine(
      match.totals,
      market.line
    );

  if (!probabilities) {
    return null;
  }

  const consensus =
    match.totals
      ?.diagnostics
      ?.consensusStatus;

  const quality =
    Number(
      match.totals
        ?.diagnostics
        ?.qualityPct || 0
    );

  /*
   * Solo STABLE puede ser apuesta.
   */
  const eligible =
    match.state === 'pre' &&
    match.matchup?.markovReady &&
    consensus === 'STABLE' &&
    quality >= 72;

  const overMarketProbability =
    americanToProbability(
      market.overOdds
    );

  const underMarketProbability =
    americanToProbability(
      market.underOdds
    );

  /*
   * Sin precio real no inventamos
   * un -110 ni calculamos edge.
   */
  const overBreakEven =
    overMarketProbability;

  const underBreakEven =
    underMarketProbability;

  const overEdge =
    overBreakEven !== null
      ? probabilities.over -
        overBreakEven
      : null;

  const underEdge =
    underBreakEven !== null
      ? probabilities.under -
        underBreakEven
      : null;

  const overClass =
    overEdge !== null
      ? classification({
          eligible,
          probability:
            probabilities.over,
          edge:
            overEdge
        })
      : 'PASS';

  const underClass =
    underEdge !== null
      ? classification({
          eligible,
          probability:
            probabilities.under,
          edge:
            underEdge
        })
      : 'PASS';

  let bestSide = null;

  if (
    overEdge !== null ||
    underEdge !== null
  ) {
    bestSide =
      underEdge === null ||
      (
        overEdge !== null &&
        overEdge >= underEdge
      )
        ? 'OVER'
        : 'UNDER';
  }

  const bestProbability =
    bestSide === 'OVER'
      ? probabilities.over
      : bestSide === 'UNDER'
        ? probabilities.under
        : null;

  const bestEdge =
    bestSide === 'OVER'
      ? overEdge
      : bestSide === 'UNDER'
        ? underEdge
        : null;

  const recommendation =
    bestSide === 'OVER'
      ? overClass
      : bestSide === 'UNDER'
        ? underClass
        : 'PASS';

  return {
    provider:
      market.provider,

    source:
      market.source,

    line:
      market.line,

    model: {
      overPct:
        probabilities.over *
        100,

      underPct:
        probabilities.under *
        100
    },

    market: {
      overOdds:
        market.overOdds,

      underOdds:
        market.underOdds,

      overBreakEvenPct:
        overBreakEven *
        100,

      underBreakEvenPct:
        underBreakEven *
        100
    },

    edge: {
      overPct:
        overEdge *
        100,

      underPct:
        underEdge *
        100
    },

    bestSide,

    bestProbabilityPct:
      bestProbability *
      100,

    bestEdgePct:
      bestEdge *
      100,

    fairOdds:
      bestProbability !== null
        ? fairAmerican(
            bestProbability
          )
        : null,

    recommendation,

    eligible,

    reason:
      !eligible
        ? (
            match.state !== 'pre'
              ? 'LIVE_OR_FINAL'
              : consensus !== 'STABLE'
                ? 'CONSENSUS_NOT_STABLE'
                : quality < 72
                  ? 'LOW_QUALITY'
                  : 'DATA_GATE'
          )
        : bestSide === null
          ? 'NO_PRICE'
          : recommendation === 'PASS'
            ? 'NO_EDGE'
            : 'VALUE'
  };
}
