import {
  loadTourHistory
} from '../data/history.js';

const cache = new Map();

function num(value) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ''
  ) {
    return null;
  }

  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : null;
}

function surfaceOf(value) {
  const s =
    String(value || '')
      .trim()
      .toUpperCase();

  if (s === 'HARD') return 'HARD';
  if (s === 'CLAY') return 'CLAY';
  if (s === 'GRASS') return 'GRASS';
  if (s === 'CARPET') return 'CARPET';

  return 'UNKNOWN';
}

function bucket() {
  return {
    servicePoints: 0,
    servicePointsWon: 0,

    serviceGames: 0,
    heldGames: 0,

    samples: 0
  };
}

function addSide(
  target,
  row,
  prefix
) {
  const svpt =
    num(row[`${prefix}_svpt`]);

  const firstWon =
    num(row[`${prefix}_1stWon`]);

  const secondWon =
    num(row[`${prefix}_2ndWon`]);

  const svGms =
    num(row[`${prefix}_SvGms`]);

  const bpSaved =
    num(row[`${prefix}_bpSaved`]);

  const bpFaced =
    num(row[`${prefix}_bpFaced`]);

  let used = false;

  if (
    svpt !== null &&
    svpt > 0 &&
    firstWon !== null &&
    secondWon !== null
  ) {
    target.servicePoints +=
      svpt;

    target.servicePointsWon +=
      firstWon +
      secondWon;

    used = true;
  }

  if (
    svGms !== null &&
    svGms > 0 &&
    bpSaved !== null &&
    bpFaced !== null
  ) {
    const broken =
      Math.max(
        0,
        bpFaced -
        bpSaved
      );

    target.serviceGames +=
      svGms;

    target.heldGames +=
      Math.max(
        0,
        svGms -
        broken
      );

    used = true;
  }

  if (used) {
    target.samples++;
  }
}

function addMatch(
  target,
  row
) {
  addSide(
    target,
    row,
    'w'
  );

  addSide(
    target,
    row,
    'l'
  );
}

function finalize(
  raw,
  name
) {
  const spw =
    raw.servicePoints > 0
      ? raw.servicePointsWon /
        raw.servicePoints
      : null;

  const hold =
    raw.serviceGames > 0
      ? raw.heldGames /
        raw.serviceGames
      : null;

  return {
    surface: name,

    spw,

    rpw:
      spw !== null
        ? 1 - spw
        : null,

    hold,

    break:
      hold !== null
        ? 1 - hold
        : null,

    servicePoints:
      raw.servicePoints,

    serviceGames:
      raw.serviceGames,

    samples:
      raw.samples
  };
}

function buildBaselines(rows) {
  const raw = {
    ALL: bucket(),
    HARD: bucket(),
    CLAY: bucket(),
    GRASS: bucket(),
    CARPET: bucket()
  };

  for (const row of rows) {
    addMatch(
      raw.ALL,
      row
    );

    const surface =
      surfaceOf(
        row.surface
      );

    if (
      surface !== 'UNKNOWN'
    ) {
      addMatch(
        raw[surface],
        row
      );
    }
  }

  return {
    ALL:
      finalize(
        raw.ALL,
        'ALL'
      ),

    HARD:
      finalize(
        raw.HARD,
        'HARD'
      ),

    CLAY:
      finalize(
        raw.CLAY,
        'CLAY'
      ),

    GRASS:
      finalize(
        raw.GRASS,
        'GRASS'
      ),

    CARPET:
      finalize(
        raw.CARPET,
        'CARPET'
      )
  };
}

export async function getTourBaselines(
  tour
) {
  const upper =
    String(tour)
      .toUpperCase();

  if (
    cache.has(upper)
  ) {
    return cache.get(
      upper
    );
  }

  const promise =
    loadTourHistory(
      upper
    )
      .then(rows => ({
        tour: upper,
        rows: rows.length,
        surfaces:
          buildBaselines(rows)
      }));

  cache.set(
    upper,
    promise
  );

  return promise;
}

export function selectBaseline(
  baselineSet,
  surface
) {
  const requested =
    String(surface || '')
      .toUpperCase();

  const specific =
    baselineSet
      ?.surfaces
      ?.[requested];

  /*
   * Evitamos superficies con
   * muestra demasiado pequeña.
   */
  if (
    specific &&
    specific.servicePoints >= 1000 &&
    specific.serviceGames >= 150
  ) {
    return specific;
  }

  return (
    baselineSet
      ?.surfaces
      ?.ALL ||
    null
  );
}
