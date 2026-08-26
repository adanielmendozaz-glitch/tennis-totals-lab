import {
  getMarketReadiness
} from './readiness.js';

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function americanProbability(odds) {
  const n = Number(odds);

  if (!Number.isFinite(n)) return null;

  if (n <= -100) {
    return Math.abs(n) / (Math.abs(n) + 100);
  }

  if (n >= 100) {
    return 100 / (n + 100);
  }

  return null;
}

function decimalToAmerican(decimal) {
  const d = Number(decimal);

  if (!Number.isFinite(d) || d <= 1) {
    return null;
  }

  if (d >= 2) {
    return Math.round(
      (d - 1) * 100
    );
  }

  return Math.round(
    -100 / (d - 1)
  );
}

function americanToDecimal(american) {
  const a = Number(american);

  if (!Number.isFinite(a)) {
    return null;
  }

  if (a <= -100) {
    return (
      1 +
      100 / Math.abs(a)
    );
  }

  if (a >= 100) {
    return (
      1 +
      a / 100
    );
  }

  return null;
}

export function parseOdds(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const n = Number(value);

  if (!Number.isFinite(n)) {
    return null;
  }

  /*
   * 1.01–19.99 = decimal.
   *
   * Ej:
   * 1.80
   * 1.91
   * 2.05
   */
  if (
    n > 1 &&
    n < 20
  ) {
    return {
      original: n,
      format: 'DECIMAL',
      probability: 1 / n,
      decimal: n,
      american:
        decimalToAmerican(n)
    };
  }

  /*
   * American válido:
   * -110, -125, +105, +150...
   */
  if (
    n <= -100 ||
    n >= 100
  ) {
    return {
      original: n,
      format: 'AMERICAN',
      probability:
        americanProbability(n),
      decimal:
        americanToDecimal(n),
      american: n
    };
  }

  return null;
}

function fairAmerican(probability) {
  const p =
    clamp(
      probability,
      0.001,
      0.999
    );

  if (p >= 0.5) {
    return Math.round(
      -100 * p / (1 - p)
    );
  }

  return Math.round(
    100 * (1 - p) / p
  );
}

function fairDecimal(probability) {
  const p =
    clamp(
      probability,
      0.001,
      0.999
    );

  return (
    Math.round(
      (1 / p) * 100
    ) / 100
  );
}

function probabilityAtLine(
  totals,
  line
) {
  if (!totals?.curve?.length) {
    return null;
  }

  const ordered =
    [...totals.curve]
      .sort(
        (a, b) =>
          a.line - b.line
      );

  const exact =
    ordered.find(
      row =>
        Math.abs(
          row.line - line
        ) < 0.001
    );

  if (exact) {
    return {
      over:
        Number(exact.overPct) /
        100,

      under:
        Number(exact.underPct) /
        100
    };
  }

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
      line > left.line &&
      line < right.line
    ) {
      const ratio =
        (
          line - left.line
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
          1 - overPct / 100
      };
    }
  }

  return null;
}

/*
 * Protección simétrica mientras LAB acumula
 * suficiente backtest/calibración.
 *
 * Una diferencia extrema Expected vs línea
 * se audita y se bloquea; no se convierte
 * automáticamente en PLAY.
 */
export function marketBiasGuard(
  expectedGames,
  marketLine,
  threshold = 3.25
) {
  const expected =
    Number(expectedGames);

  const line =
    Number(marketLine);

  if (
    !Number.isFinite(expected) ||
    !Number.isFinite(line)
  ) {
    return {
      blocked: true,
      status: 'INVALID',
      deltaGames: null,
      absDeltaGames: null,
      threshold
    };
  }

  const deltaGames =
    expected - line;

  const absDeltaGames =
    Math.abs(deltaGames);

  return {
    blocked:
      absDeltaGames >
      threshold,

    status:
      absDeltaGames >
      threshold
        ? 'BLOCK'
        : absDeltaGames >= 2.25
          ? 'WATCH'
          : 'OK',

    deltaGames:
      Math.round(
        deltaGames * 100
      ) / 100,

    absDeltaGames:
      Math.round(
        absDeltaGames * 100
      ) / 100,

    threshold
  };
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

  const readiness =
    getMarketReadiness(
      match
    );

  const shadow =
    match.totals
      ?.shadowAudit;

  const shadowBlocked =
    Boolean(
      shadow?.available &&
      shadow.status ===
        'CAUTION'
    );

  const biasGuard =
    marketBiasGuard(
      match.totals
        ?.expectedGames,
      market.line
    );

  const lengthStatus =
    match.totals
      ?.lengthAudit
      ?.status ||
    'UNKNOWN';

  const lengthBlocked =
    lengthStatus ===
    'COMPRESSION';

  const eligible =
    readiness.eligible &&
    !shadowBlocked &&
    !biasGuard.blocked &&
    !lengthBlocked;

  const overPrice =
    parseOdds(
      market.overOdds
    );

  const underPrice =
    parseOdds(
      market.underOdds
    );

  const overBreakEven =
    overPrice?.probability ??
    null;

  const underBreakEven =
    underPrice?.probability ??
    null;

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
        probabilities.over * 100,

      underPct:
        probabilities.under * 100
    },

    market: {
      overOdds:
        market.overOdds,

      underOdds:
        market.underOdds,

      overFormat:
        overPrice?.format || null,

      underFormat:
        underPrice?.format || null,

      overBreakEvenPct:
        overBreakEven !== null
          ? overBreakEven * 100
          : null,

      underBreakEvenPct:
        underBreakEven !== null
          ? underBreakEven * 100
          : null
    },

    edge: {
      overPct:
        overEdge !== null
          ? overEdge * 100
          : null,

      underPct:
        underEdge !== null
          ? underEdge * 100
          : null
    },

    bestSide,

    bestProbabilityPct:
      bestProbability !== null
        ? bestProbability * 100
        : null,

    bestEdgePct:
      bestEdge !== null
        ? bestEdge * 100
        : null,

    fairOdds:
      bestProbability !== null
        ? fairAmerican(
            bestProbability
          )
        : null,

    fairDecimal:
      bestProbability !== null
        ? fairDecimal(
            bestProbability
          )
        : null,

    recommendation,
    eligible,

    audit: {
      readinessScore:
        readiness.score,

      readinessStatus:
        readiness.status,

      shadowStatus:
        shadow?.available
          ? shadow.status
          : 'UNAVAILABLE',

      expectedMarketDeltaGames:
        biasGuard.deltaGames,

      absExpectedMarketDeltaGames:
        biasGuard.absDeltaGames,

      biasGuardStatus:
        biasGuard.status,

      biasGuardBlocked:
        biasGuard.blocked,

      lengthStatus,

      lengthBlocked
    },

    reason:
      !eligible
        ? (
            !readiness.eligible
              ? `READINESS_${readiness.reason}`
              : shadowBlocked
                ? 'SHADOW_CAUTION'
                : biasGuard.blocked
                  ? 'MODEL_MARKET_GAP'
                  : lengthBlocked
                    ? 'LENGTH_COMPRESSION'
                    : 'DATA_GATE'
          )
        : bestSide === null
          ? 'NO_PRICE'
          : recommendation === 'PASS'
            ? 'NO_EDGE'
            : 'VALUE'
  };
}
