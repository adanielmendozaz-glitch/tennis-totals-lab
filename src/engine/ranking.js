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
    Math.min(
      max,
      value
    )
  );
}

function round1(value) {
  return (
    Math.round(
      value *
      10
    ) / 10
  );
}

function recommendationPriority(
  value
) {
  if (value === 'PLAY') {
    return 3;
  }

  if (value === 'LEAN') {
    return 2;
  }

  if (value === 'READY') {
    return 1;
  }

  return 0;
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
        decision?.bestEdgePct || 0
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

  /*
   * Un DISAG de 0 pp conserva
   * todo el edge.
   *
   * Conforme aumenta,
   * reducimos la fortaleza.
   */
  const agreementFactor =
    clamp(
      1 -
      disagreement /
      50,
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

function rankingItem(
  match
) {
  if (
    match.state !== 'pre' ||
    !match.matchup?.markovReady ||
    !match.totals
  ) {
    return null;
  }

  const readiness =
    getMarketReadiness(
      match
    );

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

  const decision =
    match.marketDecision;

  /*
   * Mercado existente:
   * únicamente PLAY o LEAN
   * entran al ranking principal.
   */
  if (
    decision &&
    decision.eligible &&
    (
      decision.recommendation ===
      'PLAY' ||
      decision.recommendation ===
      'LEAN'
    )
  ) {
    const adjEdge =
      adjustedEdge(
        match,
        decision,
        readiness
      );

    return {
      id:
        match.id,

      category:
        decision.recommendation,

      priority:
        recommendationPriority(
          decision.recommendation
        ),

      tournament:
        match.tournament,

      tour:
        match.tour,

      surface:
        match.surface,

      startDate:
        match.startDate,

      playerA:
        match.playerA?.name ||
        '—',

      playerB:
        match.playerB?.name ||
        '—',

      line:
        decision.line,

      side:
        decision.bestSide,

      probabilityPct:
        Number(
          decision
            .bestProbabilityPct || 0
        ),

      edgePct:
        Number(
          decision
            .bestEdgePct || 0
        ),

      adjustedEdgePct:
        round1(
          adjEdge
        ),

      fairOdds:
        decision.fairOdds,

      provider:
        decision.provider,

      readiness:
        readiness.score,

      quality,

      disagreement,

      consensus:
        match.totals
          ?.diagnostics
          ?.consensusStatus,

      score:
        (
          recommendationPriority(
            decision.recommendation
          ) *
          1000
        ) +
        adjEdge * 10 +
        readiness.score / 10
    };
  }

  /*
   * Modelo excelente pero todavía
   * no existe línea de mercado.
   */
  if (
    readiness.status === 'READY' &&
    !decision
  ) {
    return {
      id:
        match.id,

      category:
        'READY',

      priority: 1,

      tournament:
        match.tournament,

      tour:
        match.tour,

      surface:
        match.surface,

      startDate:
        match.startDate,

      playerA:
        match.playerA?.name ||
        '—',

      playerB:
        match.playerB?.name ||
        '—',

      line: null,
      side: null,
      probabilityPct: null,
      edgePct: null,
      adjustedEdgePct: null,
      fairOdds: null,

      provider:
        'WAITING',

      readiness:
        readiness.score,

      quality,

      disagreement,

      consensus:
        match.totals
          ?.diagnostics
          ?.consensusStatus,

      score:
        1000 +
        readiness.score
    };
  }

  return null;
}

export function buildRanking(
  matches
) {
  const items =
    matches
      .map(
        rankingItem
      )
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
            a.category === 'READY'
          ) {
            return (
              b.readiness -
              a.readiness
            );
          }

          if (
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
