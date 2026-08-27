const MODEL_DEFS = [
  { key: 'structural', label: 'MARKOV' },
  { key: 'bayesian', label: 'BAYES → MARKOV' },
  { key: 'elo', label: 'ELO → MARKOV' },
  { key: 'ensemble', label: 'CURRENT ENSEMBLE' }
];

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round1(value) {
  return Number.isFinite(value)
    ? Math.round(value * 10) / 10
    : null;
}

function round2(value) {
  return Number.isFinite(value)
    ? Math.round(value * 100) / 100
    : null;
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pearson(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length < 3) {
    return null;
  }

  const meanA = mean(a);
  const meanB = mean(b);

  let numerator = 0;
  let sumSqA = 0;
  let sumSqB = 0;

  for (let i = 0; i < a.length; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    numerator += da * db;
    sumSqA += da * da;
    sumSqB += db * db;
  }

  const denominator = Math.sqrt(sumSqA * sumSqB);

  if (!Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }

  return numerator / denominator;
}

function sampleGate(n) {
  if (n >= 300) return { code: 'STRONG', label: 'STRONG SAMPLE' };
  if (n >= 100) return { code: 'USEFUL', label: 'USEFUL SAMPLE' };
  if (n >= 30) return { code: 'DEVELOPING', label: 'DEVELOPING' };
  return { code: 'EARLY', label: 'EARLY · NO CONCLUSION' };
}

function comparableRecords(records) {
  return (records || []).filter(row => {
    const actual = finite(row?.actualGames);
    if (actual === null) return false;

    return MODEL_DEFS.every(model =>
      finite(row?.modelBenchmarks?.[model.key]) !== null
    );
  });
}

function modelMetrics(records, model) {
  const errors = records.map(row =>
    Number(row.modelBenchmarks[model.key]) - Number(row.actualGames)
  );

  const absErrors = errors.map(Math.abs);
  const squared = errors.map(value => value * value);
  const n = errors.length;

  const bias = mean(errors);
  const mae = mean(absErrors);
  const rmse = n ? Math.sqrt(mean(squared)) : null;

  const overEstimate = n
    ? errors.filter(value => value > 0).length / n * 100
    : null;

  const underEstimate = n
    ? errors.filter(value => value < 0).length / n * 100
    : null;

  const withinOne = n
    ? absErrors.filter(value => value <= 1).length / n * 100
    : null;

  const withinTwo = n
    ? absErrors.filter(value => value <= 2).length / n * 100
    : null;

  return {
    key: model.key,
    label: model.label,
    n,
    maeGames: round2(mae),
    biasGames: round2(bias),
    rmseGames: round2(rmse),
    overEstimatePct: round1(overEstimate),
    underEstimatePct: round1(underEstimate),
    withinOnePct: round1(withinOne),
    withinTwoPct: round1(withinTwo),
    errors
  };
}

function correlationLabel(value) {
  if (!Number.isFinite(value)) return 'NO SAMPLE';
  const abs = Math.abs(value);
  if (abs >= 0.90) return 'VERY HIGH';
  if (abs >= 0.80) return 'HIGH';
  if (abs >= 0.60) return 'MODERATE';
  return 'LOW';
}

export function summarizeModelBenchmark(records = []) {
  const comparable = comparableRecords(records);
  const n = comparable.length;
  const sample = sampleGate(n);

  const models = MODEL_DEFS.map(model =>
    modelMetrics(comparable, model)
  );

  const ordered = [...models].sort((a, b) => {
    const aMae = a.maeGames ?? Infinity;
    const bMae = b.maeGames ?? Infinity;

    if (aMae !== bMae) return aMae - bMae;

    return (
      Math.abs(a.biasGames ?? Infinity) -
      Math.abs(b.biasGames ?? Infinity)
    );
  });

  const rankMap = new Map(
    ordered.map((row, index) => [row.key, index + 1])
  );

  const ranked = models.map(row => ({
    ...row,
    rank: rankMap.get(row.key) ?? null
  }));

  const byKey = Object.fromEntries(
    ranked.map(row => [row.key, row])
  );

  const structuralElo = pearson(
    byKey.structural?.errors || [],
    byKey.elo?.errors || []
  );

  const structuralBayes = pearson(
    byKey.structural?.errors || [],
    byKey.bayesian?.errors || []
  );

  const bayesElo = pearson(
    byKey.bayesian?.errors || [],
    byKey.elo?.errors || []
  );

  let familyStatus = 'EARLY';

  if (n >= 12) {
    familyStatus =
      Number.isFinite(structuralElo) && structuralElo >= 0.80
        ? 'CORRELATED FAMILY'
        : 'SEPARATION OK';
  }

  const best = n >= 30
    ? ordered[0] || null
    : null;

  return {
    n,
    totalHistorical: Array.isArray(records) ? records.length : 0,
    legacyWithoutBenchmark: Math.max(
      0,
      (Array.isArray(records) ? records.length : 0) - n
    ),
    sample,
    models: ranked.map(({ errors, ...row }) => row),
    bestModel: best
      ? {
          key: best.key,
          label: best.label,
          maeGames: best.maeGames,
          biasGames: best.biasGames
        }
      : null,
    correlations: {
      structuralElo: round2(structuralElo),
      structuralBayes: round2(structuralBayes),
      bayesElo: round2(bayesElo),
      structuralEloLabel: correlationLabel(structuralElo),
      structuralBayesLabel: correlationLabel(structuralBayes),
      bayesEloLabel: correlationLabel(bayesElo)
    },
    familyStatus
  };
}
