#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

ROOT = Path.home() / "tennis-totals-lab"
if not ROOT.exists():
    raise SystemExit("[ERROR] No existe ~/tennis-totals-lab")

files_to_backup = [
    ROOT / "src/engine/historicalReplay.js",
    ROOT / "src/v0610-ui.js",
    ROOT / "src/v0610.css",
    ROOT / "src/main.js",
    ROOT / "src/ui/labBankV068.js",
]

missing = [str(p) for p in files_to_backup if not p.exists()]
if missing:
    raise SystemExit("[ERROR] Faltan archivos:\n" + "\n".join(missing))

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = ROOT / f".v0612-benchmark-backup-{stamp}"
backup.mkdir(parents=True, exist_ok=True)

for src in files_to_backup:
    rel = src.relative_to(ROOT)
    dst = backup / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)

def replace_once(path: Path, old: str, new: str, label: str):
    text = path.read_text()
    if new in text:
        print(f"[SKIP] {label} ya aplicado")
        return
    if old not in text:
        raise SystemExit(f"[ERROR] No encontré ancla para: {label}\nBackup: {backup}")
    path.write_text(text.replace(old, new, 1))
    print(f"[PATCH] {label}")

benchmark_js = r"""const MODEL_DEFS = [
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
"""

(ROOT / "src/engine/modelBenchmark.js").write_text(benchmark_js)
print("[WRITE] src/engine/modelBenchmark.js")

hist = ROOT / "src/engine/historicalReplay.js"

replace_once(
    hist,
    "const AUDIT_VERSION = '0.6.10';",
    "const AUDIT_VERSION = '0.6.12';",
    "Historical audit version"
)

old_record_tail = """    simulations:
      Number(totals?.simulations || 0),
    replayedAt:
      new Date().toISOString()
"""

new_record_tail = """    simulations:
      Number(totals?.simulations || 0),

    /*
     * v0.6.12 MODEL BENCHMARK
     * Congela las salidas que YA produjo
     * el mismo ensemble de producción.
     */
    modelBenchmarks: {
      structural:
        Number(
          totals?.models
            ?.structural
            ?.expectedGames
        ),

      bayesian:
        Number(
          totals?.models
            ?.bayesian
            ?.expectedGames
        ),

      elo:
        Number(
          totals?.models
            ?.elo
            ?.expectedGames
        ),

      ensemble:
        expectedGames
    },

    replayedAt:
      new Date().toISOString()
"""

replace_once(
    hist,
    old_record_tail,
    new_record_tail,
    "Historical replay component snapshots"
)

ui = ROOT / "src/v0610-ui.js"

old_import = """import {
  summarizeFairLineValidation
} from './engine/fairLineValidation.js';

let running = false;
"""

new_import = """import {
  summarizeFairLineValidation
} from './engine/fairLineValidation.js';

import {
  summarizeModelBenchmark
} from './engine/modelBenchmark.js';

let running = false;
"""

replace_once(
    ui,
    old_import,
    new_import,
    "Model Benchmark import"
)

benchmark_ui = r"""
function benchmarkStatusClass(code) {
  if (code === 'STRONG' || code === 'USEFUL') return 'good';
  if (code === 'DEVELOPING') return 'medium';
  return 'caution';
}

function benchmarkCorrelation(value) {
  const n = Number(value);
  return Number.isFinite(n)
    ? n.toFixed(2)
    : '—';
}

function benchmarkRowsHtml(rows) {
  if (!rows.length) {
    return `
      <div class="flv-empty">
        Aún no hay replays v0.6.12 comparables.
      </div>
    `;
  }

  return rows
    .map(row => `
      <div class="model-benchmark-row">
        <div class="model-benchmark-name">
          <b>#${row.rank || '—'}</b>
          <div>
            <strong>${row.label}</strong>
            <small>N=${row.n}</small>
          </div>
        </div>

        <span>
          MAE
          <b>${fmt(row.maeGames, 2)}</b>
        </span>

        <span class="${
          Number(row.biasGames) > 0
            ? 'positive-bias'
            : Number(row.biasGames) < 0
              ? 'negative-bias'
              : ''
        }">
          BIAS
          <b>${signed(row.biasGames, ' g')}</b>
        </span>

        <span>
          RMSE
          <b>${fmt(row.rmseGames, 2)}</b>
        </span>

        <span>
          OVER-EST
          <b>${pct(row.overEstimatePct)}</b>
        </span>

        <span>
          ±2 G
          <b>${pct(row.withinTwoPct)}</b>
        </span>
      </div>
    `)
    .join('');
}

function benchmarkHtml(benchmark) {
  const winner =
    benchmark.bestModel
      ? benchmark.bestModel.label
      : 'NO CONCLUSION';

  return `
    <section class="model-benchmark-card">
      <div class="flv-section-head model-benchmark-head">
        <div>
          <span>MODEL BENCHMARK · ABLATION</span>
          <strong>¿Qué modelo realmente predice mejor?</strong>
        </div>

        <b class="${
          benchmarkStatusClass(
            benchmark.sample.code
          )
        }">
          ${benchmark.sample.label}
        </b>
      </div>

      <div class="model-benchmark-kpis">
        <article>
          <span>COMPARABLE</span>
          <strong>${benchmark.n}</strong>
          <small>replays con los 4 outputs</small>
        </article>

        <article>
          <span>LEADER</span>
          <strong>${winner}</strong>
          <small>solo se declara desde N=30</small>
        </article>

        <article>
          <span>MARKOV ↔ ELO</span>
          <strong>
            ${benchmarkCorrelation(
              benchmark.correlations.structuralElo
            )}
          </strong>
          <small>
            ${benchmark.correlations.structuralEloLabel}
            error correlation
          </small>
        </article>

        <article>
          <span>FAMILY AUDIT</span>
          <strong>${benchmark.familyStatus}</strong>
          <small>¿son votos realmente independientes?</small>
        </article>
      </div>

      <div class="model-benchmark-list">
        ${benchmarkRowsHtml(benchmark.models)}
      </div>

      <div class="model-correlation-grid">
        <div>
          <span>MARKOV ↔ BAYES</span>
          <b>
            ${benchmarkCorrelation(
              benchmark.correlations.structuralBayes
            )}
          </b>
          <small>
            ${benchmark.correlations.structuralBayesLabel}
          </small>
        </div>

        <div>
          <span>BAYES ↔ ELO</span>
          <b>
            ${benchmarkCorrelation(
              benchmark.correlations.bayesElo
            )}
          </b>
          <small>
            ${benchmark.correlations.bayesEloLabel}
          </small>
        </div>
      </div>

      <div class="flv-note model-benchmark-note">
        OVER-EST no significa “pick OVER”.
        Significa que el modelo proyectó más juegos
        que el total que realmente ocurrió.
        ${
          benchmark.legacyWithoutBenchmark
            ? `${benchmark.legacyWithoutBenchmark} replays anteriores a v0.6.12 se conservan, pero no entran en esta comparación.`
            : ''
        }
        Esta versión mide; NO cambia todavía el predictor de producción.
      </div>
    </section>
  `;
}

"""

text = ui.read_text()
if "function benchmarkHtml(benchmark)" not in text:
    anchor = "function cardHtml(summary, meta) {"
    if anchor not in text:
        raise SystemExit(f"[ERROR] No encontré cardHtml en v0610-ui.js\nBackup: {backup}")
    text = text.replace(anchor, benchmark_ui + "\n" + anchor, 1)
    ui.write_text(text)
    print("[PATCH] Benchmark UI functions")
else:
    print("[SKIP] Benchmark UI functions ya existen")

old_card_start = """function cardHtml(summary, meta) {
  const biasText =
"""

new_card_start = """function cardHtml(summary, meta) {
  const benchmark =
    summarizeModelBenchmark(
      getHistoricalValidationRecords()
    );

  const biasText =
"""

replace_once(
    ui,
    old_card_start,
    new_card_start,
    "Benchmark summary inside card"
)

old_note = """    <div class="flv-note">
      No ajusta pesos ni thresholds automáticamente. Primero mide.
      Cada lote usa el mismo ensemble de producción
      (40K Markov + 40K Bayes + 20K Elo).
    </div>

    <div class="flv-section-head">
"""

new_note = """    <div class="flv-note">
      No ajusta pesos ni thresholds automáticamente. Primero mide.
      Cada lote usa el mismo ensemble de producción
      (40K Markov + 40K Bayes + 20K Elo).
    </div>

    ${benchmarkHtml(benchmark)}

    <div class="flv-section-head">
"""

replace_once(
    ui,
    old_note,
    new_note,
    "Benchmark card placement"
)

text = ui.read_text()
text = text.replace(
    "Pulsa ANALIZAR +4 para iniciar el replay.",
    "Pulsa ANALIZAR +8 para iniciar el replay."
)
text = text.replace(
    "${running ? 'ANALIZANDO…' : 'ANALIZAR +4'}",
    "${running ? 'ANALIZANDO…' : 'ANALIZAR +8'}"
)
text = text.replace("batchSize: 4,", "batchSize: 8,")
text = text.replace("status?.target || 4", "status?.target || 8")
ui.write_text(text)
print("[PATCH] Replay batch +8")

css = ROOT / "src/v0610.css"
css_marker = "/* v0.6.12 MODEL BENCHMARK */"

css_add = r"""

/* v0.6.12 MODEL BENCHMARK */
.model-benchmark-card {
  margin-top: 22px;
  border-top: 1px solid rgba(89, 225, 154, 0.18);
  border-bottom: 1px solid rgba(89, 225, 154, 0.18);
  background: rgba(7, 28, 20, 0.28);
}

.model-benchmark-head {
  padding-top: 22px;
}

.model-benchmark-head > b {
  border: 1px solid rgba(255, 218, 107, 0.25);
  border-radius: 12px;
  padding: 8px 10px;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
}

.model-benchmark-head > b.good {
  color: #59e19a;
  background: rgba(29, 111, 73, 0.20);
}

.model-benchmark-head > b.medium {
  color: #d8cb73;
  background: rgba(123, 100, 25, 0.22);
}

.model-benchmark-head > b.caution {
  color: #ddb96d;
  background: rgba(117, 80, 22, 0.22);
}

.model-benchmark-kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: 1px solid rgba(255,255,255,0.06);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.model-benchmark-kpis article {
  min-height: 112px;
  padding: 16px;
  border-right: 1px solid rgba(255,255,255,0.06);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.model-benchmark-kpis span,
.model-benchmark-row > span,
.model-correlation-grid span {
  color: rgba(211, 226, 218, 0.48);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.model-benchmark-kpis strong {
  color: #f3f8f5;
  font-size: 1.12rem;
}

.model-benchmark-kpis small,
.model-benchmark-row small,
.model-correlation-grid small {
  color: rgba(211, 226, 218, 0.42);
  font-size: 0.68rem;
}

.model-benchmark-list {
  display: flex;
  flex-direction: column;
}

.model-benchmark-row {
  display: grid;
  grid-template-columns: minmax(145px, 1.7fr) repeat(5, minmax(62px, 0.7fr));
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  overflow-x: auto;
}

.model-benchmark-name {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 145px;
}

.model-benchmark-name > b {
  color: #59e19a;
  font-size: 0.75rem;
}

.model-benchmark-name div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.model-benchmark-name strong {
  color: #f4f8f5;
  font-size: 0.78rem;
}

.model-benchmark-row > span {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.model-benchmark-row > span b {
  color: #eef6f1;
  font-size: 0.80rem;
}

.model-benchmark-row .positive-bias b {
  color: #e1b86c;
}

.model-benchmark-row .negative-bias b {
  color: #77d7b0;
}

.model-correlation-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.model-correlation-grid > div {
  padding: 15px 16px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  border-right: 1px solid rgba(255,255,255,0.06);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.model-correlation-grid b {
  color: #f4f8f5;
  font-size: 1rem;
}

.model-benchmark-note {
  margin: 14px 16px 20px;
}

@media (max-width: 620px) {
  .model-benchmark-row {
    grid-template-columns: minmax(140px, 1.45fr) repeat(5, minmax(58px, 0.62fr));
    gap: 7px;
    padding-left: 12px;
    padding-right: 12px;
  }

  .model-benchmark-row > span {
    font-size: 0.60rem;
  }

  .model-benchmark-row > span b {
    font-size: 0.72rem;
  }
}
"""

css_text = css.read_text()
if css_marker not in css_text:
    css.write_text(css_text + css_add)
    print("[PATCH] v0.6.12 CSS")
else:
    print("[SKIP] v0.6.12 CSS ya existe")

main = ROOT / "src/main.js"
main_text = main.read_text()
if "ATP + WTA · v0.6.11" in main_text:
    main_text = main_text.replace(
        "ATP + WTA · v0.6.11",
        "ATP + WTA · v0.6.12",
        1
    )
elif "ATP + WTA · v0.6.12" not in main_text:
    raise SystemExit(f"[ERROR] No encontré versión visible v0.6.11 en main.js\nBackup: {backup}")
main.write_text(main_text)
print("[PATCH] main.js visible version")

bank = ROOT / "src/ui/labBankV068.js"
bank_text = bank.read_text()
if "'v0.6.10'" in bank_text:
    bank_text = bank_text.replace("'v0.6.10'", "'v0.6.12'", 1)
elif "'v0.6.12'" not in bank_text:
    print("[WARN] No encontré header v0.6.10 en Bank; no lo toqué.")
bank.write_text(bank_text)
print("[PATCH] Bank visible version")

test_js = r"""import test from 'node:test';
import assert from 'node:assert/strict';

import {
  summarizeModelBenchmark
} from '../src/engine/modelBenchmark.js';

function makeRecords(n = 32) {
  return Array.from(
    { length: n },
    (_, index) => {
      const actual = 18 + (index % 12);
      const structuralError = [1, 2, 3, 2][index % 4];
      const eloError = structuralError * 1.08;
      const bayesError = index % 2 === 0 ? 0.4 : -0.4;
      const ensembleError = index % 2 === 0 ? 0.7 : -0.7;

      return {
        actualGames: actual,
        modelBenchmarks: {
          structural: actual + structuralError,
          bayesian: actual + bayesError,
          elo: actual + eloError,
          ensemble: actual + ensembleError
        }
      };
    }
  );
}

test(
  'Benchmark: replays legacy sin componentes no entran en muestra comparable',
  () => {
    const rows = [
      { actualGames: 22, expectedGames: 23.1 },
      ...makeRecords(4)
    ];

    const summary = summarizeModelBenchmark(rows);

    assert.equal(summary.n, 4);
    assert.equal(summary.legacyWithoutBenchmark, 1);
  }
);

test(
  'Benchmark: no declara ganador antes de N=30',
  () => {
    const summary = summarizeModelBenchmark(makeRecords(12));
    assert.equal(summary.bestModel, null);
    assert.equal(summary.sample.code, 'EARLY');
  }
);

test(
  'Benchmark: Bayes gana MAE en muestra >=30',
  () => {
    const summary = summarizeModelBenchmark(makeRecords(32));

    assert.equal(summary.sample.code, 'DEVELOPING');
    assert.equal(summary.bestModel.key, 'bayesian');

    const bayes = summary.models.find(
      row => row.key === 'bayesian'
    );

    assert.equal(bayes.maeGames, 0.4);
  }
);

test(
  'Benchmark: detecta familia Markov/Elo altamente correlacionada',
  () => {
    const summary = summarizeModelBenchmark(makeRecords(32));

    assert.ok(summary.correlations.structuralElo > 0.99);
    assert.equal(summary.familyStatus, 'CORRELATED FAMILY');
  }
);

test(
  'Benchmark: bias positivo significa sobreestimación de juegos',
  () => {
    const summary = summarizeModelBenchmark(makeRecords(32));

    const structural = summary.models.find(
      row => row.key === 'structural'
    );

    assert.ok(structural.biasGames > 0);
    assert.equal(structural.overEstimatePct, 100);
  }
);
"""

(ROOT / "tests/modelBenchmark.test.js").write_text(test_js)
print("[WRITE] tests/modelBenchmark.test.js")

print()
print("=" * 60)
print(" Tennis Totals Lab v0.6.12 · MODEL BENCHMARK instalado")
print("=" * 60)
print("✓ Producción NO cambia todavía")
print("✓ Replay congela Markov/Bayes/Elo/Ensemble")
print("✓ LAB compara MAE / Bias / RMSE / Over-estimate")
print("✓ Correlación de errores entre familias")
print("✓ No declara ganador antes de N>=30")
print("✓ Replay batch: +8")
print(f"✓ Backup: {backup}")
print()
print("SIGUIENTE:")
print("  npm test")
print("  npm version 0.6.12 --no-git-tag-version")
print("  npm run build")
print("  npx cap sync android")
