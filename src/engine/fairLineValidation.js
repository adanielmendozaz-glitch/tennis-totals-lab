const ROUND = (value, digits = 2) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

const mean = values => {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
};

export function historicalAuditSampleStatus(n) {
  const count = Number(n || 0);
  if (count < 30) return { code: 'VERY_LOW', label: 'VERY LOW SAMPLE' };
  if (count < 100) return { code: 'EARLY', label: 'EARLY SIGNAL' };
  if (count < 200) return { code: 'DEVELOPING', label: 'DEVELOPING' };
  if (count < 500) return { code: 'USEFUL', label: 'USEFUL SAMPLE' };
  return { code: 'STRONGER', label: 'STRONGER EVIDENCE' };
}

export function parseHistoricalScore(score, bestOf = 3) {
  const raw = String(score || '').trim();
  if (!raw) return null;

  if (/\b(RET|W\/O|WO|WALKOVER|DEF|ABD|ABN|CANCEL|UNP|DEFAULT)\b/i.test(raw)) {
    return null;
  }

  const sets = [];
  const re = /(\d+)\s*-\s*(\d+)/g;
  let match;

  while ((match = re.exec(raw)) !== null) {
    const a = Number(match[1]);
    const b = Number(match[2]);

    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (a < 0 || b < 0) continue;

    sets.push({ a, b });
  }

  const bo = Number(bestOf) === 5 ? 5 : 3;
  const minimumSets = bo === 5 ? 3 : 2;
  const maximumSets = bo === 5 ? 5 : 3;

  if (sets.length < minimumSets || sets.length > maximumSets) {
    return null;
  }

  let setsA = 0;
  let setsB = 0;

  for (const set of sets) {
    if (set.a > set.b) setsA++;
    else if (set.b > set.a) setsB++;
    else return null;
  }

  const target = bo === 5 ? 3 : 2;

  if (Math.max(setsA, setsB) !== target) {
    return null;
  }

  const totalGames = sets.reduce(
    (sum, set) => sum + set.a + set.b,
    0
  );

  return {
    bestOf: bo,
    sets,
    setCount: sets.length,
    setsA,
    setsB,
    totalGames,
    decidingSet: bo === 5 ? sets.length === 5 : sets.length === 3,
    straightSets: bo === 5 ? sets.length === 3 : sets.length === 2
  };
}

function groupRows(rows, keyFn) {
  const groups = new Map();

  for (const row of rows) {
    const key = String(keyFn(row) || 'UNKNOWN').toUpperCase();

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(row);
  }

  return [...groups.entries()]
    .map(([key, values]) => {
      const errors = values.map(
        row => Number(row.expectedGames) - Number(row.actualGames)
      );
      const absErrors = errors.map(Math.abs);
      const fairOvers = values.filter(
        row => Number(row.actualGames) > Number(row.fairLine)
      ).length;
      const fairUnders = values.filter(
        row => Number(row.actualGames) < Number(row.fairLine)
      ).length;

      return {
        key,
        n: values.length,
        biasGames: ROUND(mean(errors), 2),
        maeGames: ROUND(mean(absErrors), 2),
        fairOverPct: ROUND(fairOvers / values.length * 100, 1),
        fairUnderPct: ROUND(fairUnders / values.length * 100, 1)
      };
    })
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
}

export function summarizeFairLineValidation(records) {
  const rows = (Array.isArray(records) ? records : [])
    .filter(row =>
      Number.isFinite(Number(row.expectedGames)) &&
      Number.isFinite(Number(row.actualGames)) &&
      Number.isFinite(Number(row.fairLine))
    );

  const n = rows.length;

  if (!n) {
    return {
      n: 0,
      sample: historicalAuditSampleStatus(0),
      maeGames: null,
      biasGames: null,
      rmseGames: null,
      meanExpectedGames: null,
      meanActualGames: null,
      fairOverPct: null,
      fairUnderPct: null,
      fairPushPct: null,
      decidingPredictedPct: null,
      decidingActualPct: null,
      straightPredictedPct: null,
      straightActualPct: null,
      lineSpread: null,
      centralBandPct: null,
      compressionStatus: 'NO_SAMPLE',
      biasStatus: 'NO_SAMPLE',
      lineDistribution: [],
      byTour: [],
      bySurface: [],
      byTrust: [],
      latest: []
    };
  }

  const errors = rows.map(
    row => Number(row.expectedGames) - Number(row.actualGames)
  );
  const absErrors = errors.map(Math.abs);
  const squaredErrors = errors.map(value => value ** 2);

  const fairOvers = rows.filter(
    row => Number(row.actualGames) > Number(row.fairLine)
  ).length;
  const fairUnders = rows.filter(
    row => Number(row.actualGames) < Number(row.fairLine)
  ).length;
  const fairPushes = n - fairOvers - fairUnders;

  const decidingPred = rows
    .map(row => Number(row.decidingSetPct))
    .filter(Number.isFinite);

  const decidingActual = rows
    .map(row => row.actualDecidingSet ? 100 : 0);

  const straightPred = rows
    .map(row => Number(row.straightSetsPct))
    .filter(Number.isFinite);

  const straightActual = rows
    .map(row => row.actualStraightSets ? 100 : 0);

  const fairLines = rows.map(row => Number(row.fairLine));
  const minLine = Math.min(...fairLines);
  const maxLine = Math.max(...fairLines);
  const lineSpread = maxLine - minLine;

  const centralCount = rows.filter(row => {
    const line = Number(row.fairLine);
    return line >= 22.5 && line <= 24.5;
  }).length;

  const centralBandPct = centralCount / n * 100;

  let compressionStatus = 'EARLY';
  if (n >= 20) {
    if (centralBandPct >= 70 && lineSpread <= 3.0) {
      compressionStatus = 'COMPRESSION';
    } else if (centralBandPct >= 55 && lineSpread <= 4.0) {
      compressionStatus = 'WATCH';
    } else {
      compressionStatus = 'OK';
    }
  }

  const bias = mean(errors);
  let biasStatus = 'EARLY';
  if (n >= 20) {
    const absBias = Math.abs(bias);
    biasStatus =
      absBias <= 0.35
        ? 'OK'
        : absBias <= 0.75
          ? 'WATCH'
          : 'BIAS';
  }

  const lineMap = new Map();
  for (const row of rows) {
    const key = Number(row.fairLine).toFixed(1);
    lineMap.set(key, (lineMap.get(key) || 0) + 1);
  }

  const lineDistribution = [...lineMap.entries()]
    .map(([line, count]) => ({
      line: Number(line),
      count,
      pct: ROUND(count / n * 100, 1)
    }))
    .sort((a, b) => a.line - b.line);

  return {
    n,
    sample: historicalAuditSampleStatus(n),
    maeGames: ROUND(mean(absErrors), 2),
    biasGames: ROUND(bias, 2),
    rmseGames: ROUND(Math.sqrt(mean(squaredErrors)), 2),
    meanExpectedGames: ROUND(mean(rows.map(row => Number(row.expectedGames))), 2),
    meanActualGames: ROUND(mean(rows.map(row => Number(row.actualGames))), 2),
    fairOverPct: ROUND(fairOvers / n * 100, 1),
    fairUnderPct: ROUND(fairUnders / n * 100, 1),
    fairPushPct: ROUND(fairPushes / n * 100, 1),
    decidingPredictedPct: ROUND(mean(decidingPred), 1),
    decidingActualPct: ROUND(mean(decidingActual), 1),
    straightPredictedPct: ROUND(mean(straightPred), 1),
    straightActualPct: ROUND(mean(straightActual), 1),
    lineSpread: ROUND(lineSpread, 1),
    centralBandPct: ROUND(centralBandPct, 1),
    compressionStatus,
    biasStatus,
    lineDistribution,
    byTour: groupRows(rows, row => row.tour),
    bySurface: groupRows(rows, row => row.surface),
    byTrust: groupRows(
      rows,
      row => row.dataTrust || row.dataTrustLevel || 'UNKNOWN'
    ),
    latest: [...rows]
      .sort((a, b) =>
        String(b.date || '').localeCompare(String(a.date || ''))
      )
      .slice(0, 6)
  };
}
