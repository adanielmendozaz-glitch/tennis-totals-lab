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

export function summarizeDirectionBias(
  matches
) {
  const rows =
    (matches || [])
      .filter(match => {
        const decision =
          match.marketDecision;

        return (
          decision &&
          ['OVER', 'UNDER'].includes(
            decision.bestSide
          ) &&
          Number.isFinite(
            Number(decision.line)
          ) &&
          Number.isFinite(
            Number(
              match.totals
                ?.expectedGames
            )
          )
        );
      })
      .map(match => {
        const decision =
          match.marketDecision;

        const expected =
          Number(
            match.totals
              .expectedGames
          );

        const line =
          Number(
            decision.line
          );

        return {
          side:
            decision.bestSide,

          recommendation:
            decision.recommendation,

          expected,
          line,

          delta:
            expected - line,

          blocked:
            Boolean(
              decision.audit
                ?.biasGuardBlocked
            )
        };
      });

  const n = rows.length;

  const over =
    rows.filter(
      row =>
        row.side === 'OVER'
    ).length;

  const under =
    rows.filter(
      row =>
        row.side === 'UNDER'
    ).length;

  const overPct =
    n
      ? over / n * 100
      : 0;

  const underPct =
    n
      ? under / n * 100
      : 0;

  const expectedValues =
    rows.map(
      row => row.expected
    );

  const deltas =
    rows.map(
      row => row.delta
    );

  const expectedRange =
    expectedValues.length
      ? Math.max(
          ...expectedValues
        ) -
        Math.min(
          ...expectedValues
        )
      : null;

  const directionSkew =
    n >= 5 &&
    Math.max(
      overPct,
      underPct
    ) >= 80;

  const compression =
    n >= 5 &&
    expectedRange !== null &&
    expectedRange <= 0.75;

  const playRows =
    rows.filter(
      row =>
        row.recommendation ===
        'PLAY'
    );

  const leanRows =
    rows.filter(
      row =>
        row.recommendation ===
        'LEAN'
    );

  const blocked =
    rows.filter(
      row => row.blocked
    ).length;

  let status =
    'WAIT_MARKETS';

  if (n > 0 && n < 5) {
    status =
      'EARLY_SAMPLE';

  } else if (
    directionSkew ||
    compression
  ) {
    status =
      'AUDIT';

  } else if (n >= 5) {
    status =
      'NORMAL';
  }

  return {
    n,
    over,
    under,

    overPct:
      round1(overPct),

    underPct:
      round1(underPct),

    play: {
      total:
        playRows.length,

      over:
        playRows.filter(
          row =>
            row.side === 'OVER'
        ).length,

      under:
        playRows.filter(
          row =>
            row.side === 'UNDER'
        ).length
    },

    lean: {
      total:
        leanRows.length,

      over:
        leanRows.filter(
          row =>
            row.side === 'OVER'
        ).length,

      under:
        leanRows.filter(
          row =>
            row.side === 'UNDER'
        ).length
    },

    avgExpectedMinusLine:
      deltas.length
        ? round2(
            mean(deltas)
          )
        : null,

    avgAbsExpectedMinusLine:
      deltas.length
        ? round2(
            mean(
              deltas.map(
                value =>
                  Math.abs(value)
              )
            )
          )
        : null,

    expectedRange:
      expectedRange === null
        ? null
        : round2(
            expectedRange
          ),

    directionSkew,
    compression,
    blocked,
    status
  };
}

