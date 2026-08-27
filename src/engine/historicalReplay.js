import {
  loadTourCoverageHistory,
  normalizeName
} from '../data/history.js';

import {
  enrichMatchesWithStats
} from './playerStats.js';

import {
  enrichMatchesWithMatchup
} from './matchup.js';

import {
  simulateEnsembleTotals
} from './ensemble.js';

import {
  parseHistoricalScore
} from './fairLineValidation.js';

const STORAGE_KEY =
  'tennis_totals_lab_historical_fairline_v0610';

const AUDIT_VERSION = '0.6.10';

function readStore() {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || '{}'
    );

    return {
      version: parsed.version || AUDIT_VERSION,
      records: Array.isArray(parsed.records)
        ? parsed.records
        : [],
      lastRunAt: parsed.lastRunAt || null
    };
  } catch {
    return {
      version: AUDIT_VERSION,
      records: [],
      lastRunAt: null
    };
  }
}

function writeStore(store) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(store)
  );
}

export function getHistoricalValidationRecords() {
  return readStore().records;
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return Number(`${y}${m}${d}`);
}

function dateIsoFromKey(value) {
  const text = String(value || '').replace(/\D/g, '');
  if (text.length !== 8) return null;

  const y = text.slice(0, 4);
  const m = text.slice(4, 6);
  const d = text.slice(6, 8);

  return `${y}-${m}-${d}T12:00:00Z`;
}

function stableHistoricalId(tour, row) {
  return [
    'hist',
    String(tour).toUpperCase(),
    row.tourney_id || '',
    row.tourney_date || '',
    row.match_num || '',
    row.round || '',
    normalizeName(row.winner_name),
    normalizeName(row.loser_name)
  ].join('|');
}

function cleanSurface(value) {
  const surface = String(value || '').trim().toUpperCase();

  if (['HARD', 'CLAY', 'GRASS', 'CARPET'].includes(surface)) {
    return surface;
  }

  return 'UNKNOWN';
}

function validBestOf(value) {
  const n = Number(value);
  return n === 3 || n === 5 ? n : null;
}

function candidateFromRow(tour, row) {
  const bestOf = validBestOf(row.best_of);
  if (!bestOf) return null;

  const score = parseHistoricalScore(
    row.score,
    bestOf
  );

  if (!score) return null;

  const date = dateIsoFromKey(row.tourney_date);
  if (!date) return null;

  const winner = String(row.winner_name || '').trim();
  const loser = String(row.loser_name || '').trim();

  if (!winner || !loser) return null;

  /*
   * Nunca usamos "winner" como A de forma sistemática.
   * La orientación A/B se fija alfabéticamente para que
   * el resultado futuro no entre como señal oculta.
   */
  const winnerFirst =
    normalizeName(winner)
      .localeCompare(normalizeName(loser)) <= 0;

  const playerAName = winnerFirst ? winner : loser;
  const playerBName = winnerFirst ? loser : winner;

  return {
    id: stableHistoricalId(tour, row),
    tour: String(tour).toUpperCase(),
    tournament: row.tourney_name || 'Historical',
    round: row.round || '',
    type: row.round || '',
    date,
    scheduledAt: date,
    state: 'pre',
    completed: false,
    bestOf,
    surface: cleanSurface(row.surface),
    venue: '',
    court: '',
    playerA: {
      name: playerAName,
      shortName: playerAName,
      sets: []
    },
    playerB: {
      name: playerBName,
      shortName: playerBName,
      sets: []
    },
    historicalActual: {
      winnerName: winner,
      loserName: loser,
      totalGames: score.totalGames,
      setCount: score.setCount,
      decidingSet: score.decidingSet,
      straightSets: score.straightSets,
      source: row.__historySource || 'MAIN',
      rawScore: row.score || ''
    }
  };
}

async function loadCandidates() {
  const [atp, wta] = await Promise.all([
    loadTourCoverageHistory('ATP'),
    loadTourCoverageHistory('WTA')
  ]);

  const today = localDateKey();

  const rows = [
    ...atp.map(row => ['ATP', row]),
    ...wta.map(row => ['WTA', row])
  ];

  return rows
    .filter(([, row]) => {
      const key = Number(String(row.tourney_date || '').replace(/\D/g, ''));
      return Number.isFinite(key) && key > 0 && key < today;
    })
    .map(([tour, row]) => candidateFromRow(tour, row))
    .filter(Boolean)
    .sort((a, b) => {
      const dateOrder = String(b.date).localeCompare(String(a.date));
      if (dateOrder !== 0) return dateOrder;
      return String(a.id).localeCompare(String(b.id));
    });
}

function recordFromMatch(match, totals) {
  const actual = match.historicalActual;

  const fairLine =
    Number(totals?.lengthAudit?.fairLine);

  const expectedGames =
    Number(totals?.expectedGames);

  if (
    !Number.isFinite(fairLine) ||
    !Number.isFinite(expectedGames)
  ) {
    return null;
  }

  const actualGames =
    Number(actual?.totalGames);

  if (!Number.isFinite(actualGames)) {
    return null;
  }

  return {
    auditVersion: AUDIT_VERSION,
    modelVersion: totals.version || null,
    id: String(match.id),
    date: match.date,
    tour: match.tour,
    tournament: match.tournament,
    round: match.round || '',
    surface: match.surface || 'UNKNOWN',
    bestOf: totals.bestOf || match.bestOf || 3,
    playerA: match.playerA?.name || '—',
    playerB: match.playerB?.name || '—',
    source: actual?.source || 'UNKNOWN',
    dataTrust:
      match.matchup?.dataTrust?.level ||
      'UNKNOWN',
    expectedGames,
    fairLine,
    actualGames,
    errorGames:
      Math.round((expectedGames - actualGames) * 100) / 100,
    absErrorGames:
      Math.round(Math.abs(expectedGames - actualGames) * 100) / 100,
    decidingSetPct:
      Number(
        totals?.lengthAudit?.decidingSetPct ??
        totals?.decidingSetPct ??
        0
      ),
    straightSetsPct:
      Number(
        totals?.lengthAudit?.straightSetsPct ??
        totals?.straightSetsPct ??
        0
      ),
    actualDecidingSet:
      Boolean(actual?.decidingSet),
    actualStraightSets:
      Boolean(actual?.straightSets),
    qualityPct:
      Number(totals?.diagnostics?.qualityPct || 0),
    disagreementPct:
      Number(totals?.diagnostics?.disagreementPct || 0),
    consensus:
      totals?.diagnostics?.consensusStatus || null,
    rawScore:
      actual?.rawScore || '',
    simulations:
      Number(totals?.simulations || 0),
    replayedAt:
      new Date().toISOString()
  };
}

function nextFrame() {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export async function runHistoricalValidationBatch({
  batchSize = 4,
  onProgress = null
} = {}) {
  const store = readStore();
  const seen = new Set(
    store.records.map(row => String(row.id))
  );

  onProgress?.({
    phase: 'LOAD',
    completed: 0,
    target: batchSize,
    message: 'Cargando históricos point-in-time…'
  });

  const candidates = await loadCandidates();

  /*
   * Tomamos una piscina pequeña. Si algunos partidos
   * no pasan Coverage/Identity/Matchup, buscamos más
   * sin intentar recorrer decenas de miles en un toque.
   */
  const pool = candidates
    .filter(match => !seen.has(String(match.id)))
    .slice(0, Math.max(24, batchSize * 6));

  if (!pool.length) {
    return {
      ok: true,
      added: 0,
      skipped: 0,
      remaining: 0,
      message: 'No quedan candidatos históricos nuevos.'
    };
  }

  onProgress?.({
    phase: 'PIT',
    completed: 0,
    target: batchSize,
    message: 'Reconstruyendo perfiles sin mirar el futuro…'
  });

  const stats = await enrichMatchesWithStats(pool);
  const matchup = await enrichMatchesWithMatchup(stats.matches);

  let added = 0;
  let skipped = 0;

  for (const match of matchup.matches) {
    if (added >= batchSize) break;

    if (!match.matchup?.markovReady) {
      skipped++;
      continue;
    }

    onProgress?.({
      phase: 'SIM',
      completed: added,
      target: batchSize,
      message:
        `${match.tour} · ${match.playerA?.name} vs ${match.playerB?.name}`
    });

    await nextFrame();

    /*
     * IMPORTANTE:
     * usamos el mismo ensemble de producción:
     * 40K Markov + 40K Bayes + 20K Elo = 100K.
     * El backtest no usa una versión "ligera".
     */
    const totals =
      simulateEnsembleTotals(match, 40000);

    const record =
      recordFromMatch(match, totals);

    if (!record) {
      skipped++;
      continue;
    }

    store.records.push(record);
    seen.add(record.id);
    added++;

    store.lastRunAt =
      new Date().toISOString();

    writeStore(store);

    onProgress?.({
      phase: 'SIM',
      completed: added,
      target: batchSize,
      message:
        `Replay ${added}/${batchSize} · error ${record.errorGames >= 0 ? '+' : ''}${record.errorGames.toFixed(2)} juegos`
    });

    await nextFrame();
  }

  const remaining = Math.max(
    0,
    candidates.length - seen.size
  );

  return {
    ok: true,
    added,
    skipped,
    remaining,
    totalStored: store.records.length,
    message:
      added > 0
        ? `${added} replays históricos añadidos.`
        : 'La piscina revisada no produjo partidos FULL DATA.'
  };
}

export function historicalValidationStoreMeta() {
  const store = readStore();

  return {
    version: store.version,
    lastRunAt: store.lastRunAt,
    total: store.records.length
  };
}
