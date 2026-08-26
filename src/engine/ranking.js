import {
  getMarketReadiness
} from './readiness.js';

function clamp(
  value,
  min = 0,
  max = 1
) {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

function round1(value) {
  return (
    Math.round(
      value * 10
    ) / 10
  );
}

function adjustedEdge(
  match,
  decision,
  readiness
) {
  const edge =
    Math.max(
      0,
      Number(
        decision
          ?.bestEdgePct || 0
      )
    );

  const quality =
    Number(
      match.totals
        ?.diagnostics
        ?.qualityPct || 0
    ) / 100;

  const disagreement =
    Number(
      match.totals
        ?.diagnostics
        ?.disagreementPct || 0
    );

  const readinessFactor =
    clamp(
      readiness.score /
      100
    );

  const agreementFactor =
    clamp(
      1 -
      disagreement / 50,
      0.45,
      1
    );

  return (
    edge *
    readinessFactor *
    quality *
    agreementFactor
  );
}

function rankingItem(match) {
  if (
    match.state !== 'pre' ||
    !match.matchup?.markovReady ||
    !match.totals
  ) {
    return null;
  }

  const readiness =
    getMarketReadiness(match);

  if (
    readiness.status !== 'READY'
  ) {
    return null;
  }

  const decision =
    match.marketDecision;

  const quality =
    Number(
      match.totals
        ?.diagnostics
        ?.qualityPct || 0
    );

  const disagreement =
    Number(
      match.totals
        ?.diagnostics
        ?.disagreementPct || 0
    );

  let category = 'READY';

  if (
    decision?.eligible &&
    decision.recommendation ===
      'PLAY'
  ) {
    category = 'PLAY';
  } else if (
    decision?.eligible &&
    decision.recommendation ===
      'LEAN'
  ) {
    category = 'LEAN';
  }

  const adjEdge =
    decision
      ? adjustedEdge(
          match,
          decision,
          readiness
        )
      : null;

  const priority =
    category === 'PLAY'
      ? 3
      : category === 'LEAN'
        ? 2
        : 1;

  return {
    id:
      match.id,

    category,
    priority,

    tournament:
      match.tournament,

    tour:
      match.tour,

    surface:
      match.surface,

    startDate:
      match.date,

    playerA:
      match.playerA?.name ||
      '—',

    playerB:
      match.playerB?.name ||
      '—',

    hasMarket:
      Boolean(decision),

    line:
      decision?.line ?? null,

    side:
      decision?.bestSide ??
      null,

    probabilityPct:
      decision
        ?.bestProbabilityPct ??
      null,

    edgePct:
      decision
        ?.bestEdgePct ??
      null,

    adjustedEdgePct:
      adjEdge !== null
        ? round1(adjEdge)
        : null,

    fairOdds:
      decision?.fairOdds ??
      null,

    fairDecimal:
      decision?.fairDecimal ??
      null,

    recommendation:
      decision
        ?.recommendation ??
      null,

    marketReason:
      decision?.reason ??
      'WAITING_MARKET',

    provider:
      decision?.provider ??
      'WAITING',

    readiness:
      readiness.score,

    quality,
    disagreement,

    dataTrust:
      match.matchup?.dataTrust?.level ?? 'CAUTION',

    dataTrustScore:
      match.matchup?.dataTrust?.score ?? 0,

    provenanceA:
      match.matchup?.dataTrust?.playerA?.provenance?.label ?? 'NO_DATA',

    provenanceB:
      match.matchup?.dataTrust?.playerB?.provenance?.label ?? 'NO_DATA',

    shadowStatus:
      match.totals?.shadowAudit?.status ?? 'N/A',

    shadowExpectedDelta:
      match.totals?.shadowAudit?.expectedDelta ?? null,

    consensus:
      match.totals
        ?.diagnostics
        ?.consensusStatus,

    score:
      priority * 1000 +
      (
        adjEdge !== null
          ? adjEdge * 10
          : 0
      ) +
      readiness.score
  };
}

export function buildRanking(matches) {
  const items =
    matches
      .map(rankingItem)
      .filter(Boolean)
      .sort(
        (a, b) => {

          if (
            b.priority !==
            a.priority
          ) {
            return (
              b.priority -
              a.priority
            );
          }

          if (
            a.adjustedEdgePct !== null &&
            b.adjustedEdgePct !== null &&
            b.adjustedEdgePct !==
              a.adjustedEdgePct
          ) {
            return (
              b.adjustedEdgePct -
              a.adjustedEdgePct
            );
          }

          return (
            b.readiness -
            a.readiness
          );
        }
      );

  return {
    items,

    counts: {
      play:
        items.filter(
          item =>
            item.category ===
            'PLAY'
        ).length,

      lean:
        items.filter(
          item =>
            item.category ===
            'LEAN'
        ).length,

      ready:
        items.filter(
          item =>
            item.category ===
            'READY'
        ).length
    }
  };
}
