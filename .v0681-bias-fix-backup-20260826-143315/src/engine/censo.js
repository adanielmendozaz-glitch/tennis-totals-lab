import {
  getMarketReadiness
} from './readiness.js';

import {
  normalizeStakeUnits,
  profitUnitsFor
} from './wager.js';

const STORAGE_KEY =
  'tennis_totals_lab_censo_v1';

function readStore() {
  try {
    return JSON.parse(
      localStorage.getItem(
        STORAGE_KEY
      ) || '{}'
    );
  } catch {
    return {};
  }
}

function writeStore(store) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(store)
  );
}

export function getCensoEntries() {
  return Object
    .values(readStore())
    .sort(
      (a, b) =>
        new Date(b.capturedAt) -
        new Date(a.capturedAt)
    );
}

export function hasCenso(matchId) {
  const store =
    readStore();

  return Boolean(
    store[
      String(matchId)
    ]
  );
}


/*
 * v0.6.7 Stake Integrity Hotfix
 *
 * Los primeros builds de v0.6.7 podían crear 1U por defecto
 * aunque el usuario no hubiera confirmado el stake en pantalla.
 * Nunca borramos esa huella: la movemos a REVIEW y conservamos
 * priorStakeUnits dentro del audit.
 */
export function repairStakeIntegrity() {
  const store =
    readStore();

  let changed = 0;

  for (
    const entry
    of Object.values(store)
  ) {
    if (
      entry?.appVersion === '0.6.7' &&
      Number(entry.stakeUnits) > 0 &&
      !entry.stakeSource
    ) {
      const priorStakeUnits =
        Number(entry.stakeUnits);

      entry.stakeIntegrity = {
        status: 'REVIEW',
        reason:
          'UNCONFIRMED_PRE_HOTFIX',
        priorStakeUnits,
        repairedAt:
          new Date().toISOString()
      };

      entry.stakeUnits =
        null;

      if (
        entry.result &&
        entry.result.profitUnits !==
        undefined
      ) {
        entry.result.profitUnits =
          null;
      }

      changed++;
    }
  }

  if (changed > 0) {
    writeStore(store);
  }

  return {
    changed
  };
}

export function resolveStakeReview(
  matchId,
  stakeValue
) {
  const stakeUnits =
    normalizeStakeUnits(
      stakeValue,
      null
    );

  if (!stakeUnits) {
    return {
      ok: false,
      reason: 'INVALID_STAKE'
    };
  }

  const store =
    readStore();

  const id =
    String(matchId);

  const entry =
    store[id];

  if (!entry) {
    return {
      ok: false,
      reason: 'ENTRY_MISSING'
    };
  }

  if (
    entry.stakeIntegrity?.status !==
    'REVIEW'
  ) {
    return {
      ok: false,
      reason: 'NOT_IN_REVIEW'
    };
  }

  const prior =
    entry.stakeIntegrity;

  entry.stakeUnits =
    stakeUnits;

  entry.stakeSource =
    'USER_CONFIRMED_REVIEW';

  entry.stakeSelectedAt =
    new Date().toISOString();

  entry.stakeIntegrity = {
    ...prior,
    status: 'VERIFIED',
    confirmedStakeUnits:
      stakeUnits,
    confirmedAt:
      new Date().toISOString()
  };

  if (
    ['WIN', 'LOSS', 'PUSH'].includes(
      entry.result?.status
    )
  ) {
    entry.result.profitUnits =
      profitUnitsFor({
        status:
          entry.result.status,
        stakeUnits,
        odds:
          entry.odds,
        oddsFormat:
          entry.oddsFormat
      });
  }

  store[id] =
    entry;

  writeStore(store);

  return {
    ok: true,
    entry
  };
}

function selectedOdds(
  decision
) {
  if (
    decision.bestSide === 'OVER'
  ) {
    return {
      odds:
        decision.market?.overOdds ??
        null,

      format:
        decision.market?.overFormat ??
        null
    };
  }

  if (
    decision.bestSide === 'UNDER'
  ) {
    return {
      odds:
        decision.market?.underOdds ??
        null,

      format:
        decision.market?.underFormat ??
        null
    };
  }

  return {
    odds: null,
    format: null
  };
}

export function captureCenso(
  match,
  options = {}
) {
  if (!match) {
    return {
      ok: false,
      reason: 'MATCH_MISSING'
    };
  }

  const stakeUnits =
    normalizeStakeUnits(
      options.stakeUnits,
      null
    );

  if (!stakeUnits) {
    return {
      ok: false,
      reason: 'INVALID_STAKE'
    };
  }

  const decision =
    match.marketDecision;

  if (
    !decision ||
    !['PLAY', 'LEAN'].includes(
      decision.recommendation
    )
  ) {
    return {
      ok: false,
      reason: 'NOT_QUALIFIED'
    };
  }

  if (match.state !== 'pre') {
    return {
      ok: false,
      reason: 'NOT_PREMATCH'
    };
  }

  const store =
    readStore();

  const id =
    String(match.id);

  /*
   * El primer snapshot queda congelado.
   * Nunca modificamos retrospectivamente
   * una predicción ya censada.
   */
  if (store[id]) {
    return {
      ok: false,
      reason: 'ALREADY_CAPTURED',
      entry: store[id]
    };
  }

  const readiness =
    getMarketReadiness(
      match
    );

  const price =
    selectedOdds(
      decision
    );

  const entry = {
    appVersion:
      '0.6.7',

    modelVersion:
      match.totals?.version ??
      null,

    modelWeights: {
      structural:
        match.totals?.weights?.structural ??
        null,

      bayesian:
        match.totals?.weights?.bayesian ??
        null,

      elo:
        match.totals?.weights?.elo ??
        null
    },

    surfaceAudit: {
      source:
        match.surfaceMeta?.source ??
        null,

      confidencePct:
        match.surfaceMeta?.confidencePct ??
        null,

      sampleA:
        match.playerA?.profile?.sample ??
        null,

      sampleB:
        match.playerB?.profile?.sample ??
        null
    },

    marketObservedAt:
      match.marketObservedAt ??
      null,

    pointInTimeAudit: {
      status:
        match.pointInTime
          ?.status ??
        null,

      cutoffKey:
        match.pointInTime
          ?.cutoffKey ??
        null,

      strictBefore:
        match.pointInTime
          ?.strictBefore ??
        null,

      sameDayExcluded:
        match.pointInTime
          ?.sameDayExcluded ??
        null,

      baselineRows:
        match.matchup
          ?.pointInTime
          ?.baselineRows ??
        null
    },

    identityAudit: {
      playerA: {
        method:
          match.playerA
            ?.identity
            ?.method ??
          null,

        confidencePct:
          match.playerA
            ?.identity
            ?.confidencePct ??
          null,

        canonicalName:
          match.playerA
            ?.identity
            ?.canonicalName ??
          null,

        sampleType:
          match.playerA
            ?.profile
            ?.sampleType ??
          null,

        effectiveSample:
          match.playerA
            ?.profile
            ?.effectiveSample ??
          null,

        modelReady:
          match.playerA
            ?.profile
            ?.modelReady ??
          null,

        historyMix:
          match.playerA
            ?.profile
            ?.historyMix ??
          null
      },

      playerB: {
        method:
          match.playerB
            ?.identity
            ?.method ??
          null,

        confidencePct:
          match.playerB
            ?.identity
            ?.confidencePct ??
          null,

        canonicalName:
          match.playerB
            ?.identity
            ?.canonicalName ??
          null,

        sampleType:
          match.playerB
            ?.profile
            ?.sampleType ??
          null,

        effectiveSample:
          match.playerB
            ?.profile
            ?.effectiveSample ??
          null,

        modelReady:
          match.playerB
            ?.profile
            ?.modelReady ??
          null,

        historyMix:
          match.playerB
            ?.profile
            ?.historyMix ??
          null
      }
    },

    dataTrustAudit: {
      level: match.matchup?.dataTrust?.level ?? null,
      score: match.matchup?.dataTrust?.score ?? null,
      playerA: match.matchup?.dataTrust?.playerA ?? null,
      playerB: match.matchup?.dataTrust?.playerB ?? null,
      shadow: match.totals?.shadowAudit ?? null
    },

    id,
    matchId: id,

    capturedAt:
      new Date().toISOString(),

    scheduledAt:
      match.date || null,

    tour:
      match.tour,

    tournament:
      match.tournament,

    round:
      match.round || '',

    surface:
      match.surface || 'UNKNOWN',

    playerA:
      match.playerA?.name || '—',

    playerB:
      match.playerB?.name || '—',

    recommendation:
      decision.recommendation,

    side:
      decision.bestSide,

    line:
      Number(decision.line),

    odds:
      price.odds,

    oddsFormat:
      price.format,

    provider:
      decision.provider ||
      'UNKNOWN',

    stakeUnits,

    stakeSource:
      'USER_SELECTED',

    stakeSelectedAt:
      new Date().toISOString(),

    stakeIntegrity: {
      status: 'VERIFIED',
      reason: null
    },

    modelPct:
      Number(
        decision.bestProbabilityPct || 0
      ),

    edgePct:
      Number(
        decision.bestEdgePct || 0
      ),

    fairAmerican:
      decision.fairOdds ??
      null,

    fairDecimal:
      decision.fairDecimal ??
      null,

    readiness:
      readiness.score,

    quality:
      Number(
        match.totals
          ?.diagnostics
          ?.qualityPct || 0
      ),

    disagreement:
      Number(
        match.totals
          ?.diagnostics
          ?.disagreementPct || 0
      ),

    consensus:
      match.totals
        ?.diagnostics
        ?.consensusStatus ||
      null,

    expectedGames:
      match.totals
        ?.expectedGames ??
      null,

    models: {
      markov:
        match.totals
          ?.models
          ?.structural
          ?.expectedGames ??
        null,

      bayes:
        match.totals
          ?.models
          ?.bayesian
          ?.expectedGames ??
        null,

      elo:
        match.totals
          ?.models
          ?.elo
          ?.expectedGames ??
        null
    },

    result: {
      status: 'PENDING',

      totalGames: null,

      settledAt: null,

      profitUnits: null,

      note: null
    }
  };

  store[id] =
    entry;

  writeStore(store);

  return {
    ok: true,
    entry
  };
}

function totalGames(match) {
  const values = [
    ...(match.playerA?.sets || []),
    ...(match.playerB?.sets || [])
  ]
    .filter(
      value =>
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ''
    )
    .map(Number)
    .filter(
      value =>
        Number.isFinite(value) &&
        value >= 0
    );

  if (!values.length) {
    return null;
  }

  return values.reduce(
    (sum, value) =>
      sum + value,
    0
  );
}

function requiresReview(match) {
  const text =
    String(
      match.status || ''
    )
      .toLowerCase();

  return (
    text.includes('retir') ||
    text.includes('walkover') ||
    text.includes('w/o') ||
    text.includes('cancel') ||
    text.includes('suspend') ||
    text.includes('abandon') ||
    text.includes('default')
  );
}

export function settleResult(
  side,
  line,
  games
) {
  if (games === line) {
    return 'PUSH';
  }

  if (side === 'OVER') {
    return games > line
      ? 'WIN'
      : 'LOSS';
  }

  if (side === 'UNDER') {
    return games < line
      ? 'WIN'
      : 'LOSS';
  }

  return 'REVIEW';
}

export function settleCensoFromMatches(
  matches
) {
  const store =
    readStore();

  let changed = 0;

  for (
    const entry
    of Object.values(store)
  ) {
    if (
      entry.result?.status !==
      'PENDING'
    ) {
      continue;
    }

    const match =
      matches.find(
        item =>
          String(item.id) ===
          String(entry.matchId)
      );

    if (!match) {
      continue;
    }

    if (
      match.state !== 'post' &&
      !match.completed
    ) {
      continue;
    }

    if (
      requiresReview(match)
    ) {
      entry.result = {
        status: 'REVIEW',

        totalGames:
          totalGames(match),

        settledAt:
          new Date().toISOString(),

        profitUnits: null,

        note:
          match.status ||
          'Resultado requiere revisión'
      };

      changed++;
      continue;
    }

    const games =
      totalGames(match);

    if (
      games === null ||
      !Number.isFinite(games)
    ) {
      entry.result = {
        status: 'REVIEW',

        totalGames: null,

        settledAt:
          new Date().toISOString(),

        profitUnits: null,

        note:
          'Marcador final incompleto'
      };

      changed++;
      continue;
    }

    const status =
      settleResult(
        entry.side,
        entry.line,
        games
      );

    entry.result = {
      status,

      totalGames:
        games,

      settledAt:
        new Date().toISOString(),

      profitUnits:
        profitUnitsFor({
          status,
          stakeUnits:
            entry.stakeUnits,
          odds:
            entry.odds,
          oddsFormat:
            entry.oddsFormat
        }),

      note: null
    };

    changed++;
  }

  if (changed > 0) {
    writeStore(store);
  }

  return changed;
}
