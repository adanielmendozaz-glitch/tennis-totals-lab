import { profitUnitsFor } from './wager.js';

const STORAGE_KEY = 'tennis_totals_lab_recommendation_ledger_v1';

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function keyFor(matchId, kind = 'MODEL_RECOMMENDATION', side = '') {
  return `${kind}:${String(matchId)}:${String(side || '')}`;
}

function priceFor(decision, side) {
  if (side === 'OVER') {
    return {
      odds: decision.market?.overOdds ?? null,
      format: decision.market?.overFormat ?? null,
      breakEvenPct: finite(decision.market?.overBreakEvenPct),
      modelPct: finite(decision.model?.overPct)
    };
  }

  if (side === 'UNDER') {
    return {
      odds: decision.market?.underOdds ?? null,
      format: decision.market?.underFormat ?? null,
      breakEvenPct: finite(decision.market?.underBreakEvenPct),
      modelPct: finite(decision.model?.underPct)
    };
  }

  return { odds: null, format: null, breakEvenPct: null, modelPct: null };
}

function snapshot(match, kind, side, source) {
  const decision = match.marketDecision;
  const price = priceFor(decision, side);

  return {
    appVersion: '0.6.11',
    modelVersion: match.totals?.version ?? null,
    kind,
    source,
    matchId: String(match.id),
    capturedAt: new Date().toISOString(),
    scheduledAt: match.date || null,
    tour: match.tour || '—',
    tournament: match.tournament || '—',
    round: match.round || '',
    surface: match.surface || 'UNKNOWN',
    playerA: match.playerA?.name || '—',
    playerB: match.playerB?.name || '—',
    recommendation: decision?.recommendation || 'PASS',
    modelSide: decision?.bestSide || null,
    side,
    line: finite(decision?.line),
    odds: price.odds,
    oddsFormat: price.format,
    provider: decision?.provider || 'UNKNOWN',
    modelPct: price.modelPct,
    breakEvenPct: price.breakEvenPct,
    edgePct:
      price.modelPct !== null && price.breakEvenPct !== null
        ? price.modelPct - price.breakEvenPct
        : null,
    decisionEdgePct: finite(decision?.bestEdgePct),
    reason: decision?.reason || null,
    expectedGames: finite(match.totals?.expectedGames),
    fairLine: finite(match.totals?.lengthAudit?.fairLine),
    quality: finite(match.totals?.diagnostics?.qualityPct),
    disagreement: finite(match.totals?.diagnostics?.disagreementPct),
    consensus: match.totals?.diagnostics?.consensusStatus || null,
    dataTrust: match.matchup?.dataTrust?.level || null,
    dataTrustScore: finite(match.matchup?.dataTrust?.score),
    paperStakeUnits: 1,
    result: {
      status: 'PENDING',
      totalGames: null,
      settledAt: null,
      paperProfitUnits: null,
      note: null
    }
  };
}

export function getRecommendationEntries() {
  return Object.values(readStore()).sort(
    (a, b) => new Date(b.capturedAt) - new Date(a.capturedAt)
  );
}

export function hasModelRecommendation(matchId) {
  return Boolean(readStore()[keyFor(matchId)]);
}

export function hasUserObservation(matchId, side) {
  return Boolean(readStore()[keyFor(matchId, 'USER_OBSERVATION', side)]);
}

export function captureModelRecommendation(match) {
  if (!match || match.state !== 'pre') {
    return { ok: false, reason: 'NOT_PREMATCH' };
  }

  const decision = match.marketDecision;

  if (!decision || !['PLAY', 'LEAN', 'PASS'].includes(decision.recommendation)) {
    return { ok: false, reason: 'NO_DECISION' };
  }

  if (!Number.isFinite(Number(decision.line))) {
    return { ok: false, reason: 'NO_LINE' };
  }

  if (!['OVER', 'UNDER'].includes(decision.bestSide)) {
    return { ok: false, reason: 'NO_SIDE' };
  }

  const store = readStore();
  const key = keyFor(match.id);

  if (store[key]) {
    return { ok: false, reason: 'ALREADY_CAPTURED', entry: store[key] };
  }

  const entry = snapshot(
    match,
    'MODEL_RECOMMENDATION',
    decision.bestSide,
    'MODEL_FIRST_OBSERVATION'
  );

  entry.id = key;
  entry.isOverride = false;
  store[key] = entry;
  writeStore(store);

  return { ok: true, entry };
}

export function captureDailyRecommendations(matches = []) {
  let captured = 0;

  for (const match of matches) {
    if (captureModelRecommendation(match).ok) captured++;
  }

  return { captured };
}

export function captureUserObservation(match, side) {
  const normalized = String(side || '').toUpperCase();

  if (!match || match.state !== 'pre') {
    return { ok: false, reason: 'NOT_PREMATCH' };
  }

  if (!['OVER', 'UNDER'].includes(normalized)) {
    return { ok: false, reason: 'INVALID_SIDE' };
  }

  const decision = match.marketDecision;

  if (!decision) {
    return { ok: false, reason: 'NO_DECISION' };
  }

  const store = readStore();
  const key = keyFor(match.id, 'USER_OBSERVATION', normalized);

  if (store[key]) {
    return { ok: false, reason: 'ALREADY_CAPTURED', entry: store[key] };
  }

  const entry = snapshot(
    match,
    'USER_OBSERVATION',
    normalized,
    'USER_SELECTED_SIDE'
  );

  entry.id = key;
  entry.isOverride = normalized !== decision.bestSide;

  store[key] = entry;
  writeStore(store);

  return { ok: true, entry };
}

function totalGames(match) {
  const values = [
    ...(match.playerA?.sets || []),
    ...(match.playerB?.sets || [])
  ]
    .filter(v => v !== null && v !== undefined && String(v).trim() !== '')
    .map(Number)
    .filter(v => Number.isFinite(v) && v >= 0);

  return values.length ? values.reduce((sum, v) => sum + v, 0) : null;
}

function requiresReview(match) {
  const text = String(match.status || '').toLowerCase();

  return ['retir', 'walkover', 'w/o', 'cancel', 'suspend', 'abandon', 'default']
    .some(term => text.includes(term));
}

export function settleRecommendationResult(side, line, games) {
  const l = Number(line);
  const g = Number(games);

  if (!Number.isFinite(l) || !Number.isFinite(g)) return 'REVIEW';
  if (g === l) return 'PUSH';
  if (side === 'OVER') return g > l ? 'WIN' : 'LOSS';
  if (side === 'UNDER') return g < l ? 'WIN' : 'LOSS';
  return 'REVIEW';
}

export function settleRecommendationLedgerFromMatches(matches = []) {
  const store = readStore();
  let changed = 0;

  for (const entry of Object.values(store)) {
    if (entry.result?.status !== 'PENDING') continue;

    const match = matches.find(
      item => String(item.id) === String(entry.matchId)
    );

    if (!match || (match.state !== 'post' && !match.completed)) continue;

    if (requiresReview(match)) {
      entry.result = {
        status: 'REVIEW',
        totalGames: totalGames(match),
        settledAt: new Date().toISOString(),
        paperProfitUnits: null,
        note: match.status || 'Resultado requiere revisión'
      };
      changed++;
      continue;
    }

    const games = totalGames(match);

    if (games === null) {
      entry.result = {
        status: 'REVIEW',
        totalGames: null,
        settledAt: new Date().toISOString(),
        paperProfitUnits: null,
        note: 'Marcador final incompleto'
      };
      changed++;
      continue;
    }

    const status = settleRecommendationResult(entry.side, entry.line, games);

    entry.result = {
      status,
      totalGames: games,
      settledAt: new Date().toISOString(),
      paperProfitUnits: profitUnitsFor({
        status,
        stakeUnits: 1,
        odds: entry.odds,
        oddsFormat: entry.oddsFormat
      }),
      note: null
    };

    changed++;
  }

  if (changed) writeStore(store);
  return changed;
}

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('');
}

export function recommendationLedgerSummary(
  entries = getRecommendationEntries(),
  { todayOnly = false } = {}
) {
  const today = localDateKey(new Date());

  const selected = todayOnly
    ? entries.filter(entry => localDateKey(entry.capturedAt) === today)
    : entries;

  const model = selected.filter(
    entry => entry.kind === 'MODEL_RECOMMENDATION'
  );

  const settled = model.filter(
    entry => ['WIN', 'LOSS', 'PUSH'].includes(entry.result?.status)
  );

  return {
    total: model.length,
    play: model.filter(e => e.recommendation === 'PLAY').length,
    lean: model.filter(e => e.recommendation === 'LEAN').length,
    pass: model.filter(e => e.recommendation === 'PASS').length,
    settled: settled.length,
    pending: model.filter(e => e.result?.status === 'PENDING').length,
    userObservations: selected.filter(e => e.kind === 'USER_OBSERVATION').length
  };
}
