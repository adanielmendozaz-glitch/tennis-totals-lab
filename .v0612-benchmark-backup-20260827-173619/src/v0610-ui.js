import {
  getHistoricalValidationRecords,
  runHistoricalValidationBatch,
  historicalValidationStoreMeta
} from './engine/historicalReplay.js';

import {
  summarizeFairLineValidation
} from './engine/fairLineValidation.js';

let running = false;
let progressText = '';

function fmt(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n)
    ? n.toFixed(digits)
    : '—';
}

function signed(value, suffix = '') {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return '—';
  }

  return `${n > 0 ? '+' : ''}${n.toFixed(2)}${suffix}`;
}

function sampleClass(code) {
  if (['USEFUL', 'STRONGER'].includes(code)) return 'good';
  if (code === 'DEVELOPING') return 'medium';
  return 'caution';
}

function statusClass(status) {
  if (status === 'OK') return 'good';
  if (['WATCH', 'EARLY', 'NO_SAMPLE'].includes(status)) return 'caution';
  return 'bad';
}

function pct(value) {
  const n = Number(value);
  return Number.isFinite(n)
    ? `${n.toFixed(1)}%`
    : '—';
}

function lineDistributionHtml(rows) {
  if (!rows.length) {
    return `
      <div class="flv-empty">
        Aún no hay líneas históricas auditadas.
      </div>
    `;
  }

  const maxCount =
    Math.max(...rows.map(row => Number(row.count || 0)), 1);

  return rows
    .map(row => {
      const width =
        Math.max(
          4,
          Number(row.count || 0) / maxCount * 100
        );

      return `
        <div class="flv-line-row">
          <strong>${Number(row.line).toFixed(1)}</strong>
          <div class="flv-line-track">
            <i style="width:${width}%"></i>
          </div>
          <span>${row.count} · ${pct(row.pct)}</span>
        </div>
      `;
    })
    .join('');
}

function groupsHtml(title, rows) {
  if (!rows.length) return '';

  return `
    <div class="flv-group">
      <span>${title}</span>
      ${rows.slice(0, 6).map(row => `
        <div class="flv-group-row">
          <strong>${row.key}</strong>
          <small>N=${row.n}</small>
          <b>BIAS ${signed(row.biasGames, ' g')}</b>
          <b>MAE ${fmt(row.maeGames, 2)}</b>
        </div>
      `).join('')}
    </div>
  `;
}

function latestHtml(rows) {
  if (!rows.length) {
    return `
      <div class="flv-empty">
        Pulsa ANALIZAR +4 para iniciar el replay.
      </div>
    `;
  }

  return rows.map(row => `
    <div class="flv-replay-row">
      <div>
        <strong>
          ${row.playerA}
          <span>vs</span>
          ${row.playerB}
        </strong>
        <small>
          ${row.tour} · ${row.surface}
          · ${String(row.date || '').slice(0, 10)}
          · ${row.rawScore || '—'}
        </small>
      </div>

      <span>
        EXP
        <b>${fmt(row.expectedGames, 2)}</b>
      </span>

      <span>
        FAIR
        <b>${fmt(row.fairLine, 1)}</b>
      </span>

      <span>
        REAL
        <b>${fmt(row.actualGames, 0)}</b>
      </span>

      <span class="${
        Number(row.errorGames) > 0
          ? 'positive-bias'
          : Number(row.errorGames) < 0
            ? 'negative-bias'
            : ''
      }">
        ERR
        <b>${signed(row.errorGames)}</b>
      </span>
    </div>
  `).join('');
}

function cardHtml(summary, meta) {
  const biasText =
    summary.biasGames === null
      ? '—'
      : summary.biasGames > 0
        ? `+${summary.biasGames.toFixed(2)}`
        : summary.biasGames.toFixed(2);

  const biasLabel =
    summary.biasGames === null
      ? 'Sin muestra'
      : summary.biasGames > 0.35
        ? 'sobreestima juegos'
        : summary.biasGames < -0.35
          ? 'subestima juegos'
          : 'centrado';

  return `
    <div class="flv-head">
      <div>
        <span>HISTORICAL FAIR LINE VALIDATION</span>
        <h3>Replay point-in-time</h3>
        <p>
          Predicción pre-match reconstruida con datos estrictamente anteriores
          al partido y comparada contra el total real.
        </p>
      </div>

      <strong class="${sampleClass(summary.sample.code)}">
        ${summary.n ? summary.sample.label : 'NO SAMPLE'}
      </strong>
    </div>

    <div class="flv-kpi-grid">
      <article>
        <span>REPLAYS</span>
        <strong>${summary.n}</strong>
        <small>modelo actual · 100K por match</small>
      </article>

      <article>
        <span>MAE GAMES</span>
        <strong>${fmt(summary.maeGames, 2)}</strong>
        <small>error absoluto promedio</small>
      </article>

      <article class="${statusClass(summary.biasStatus)}">
        <span>MEAN BIAS</span>
        <strong>${biasText}</strong>
        <small>${biasLabel}</small>
      </article>

      <article>
        <span>RMSE</span>
        <strong>${fmt(summary.rmseGames, 2)}</strong>
        <small>penaliza errores grandes</small>
      </article>
    </div>

    <div class="flv-centering-grid">
      <article>
        <span>EXPECTED AVG</span>
        <strong>${fmt(summary.meanExpectedGames, 2)}</strong>
      </article>

      <article>
        <span>REAL AVG</span>
        <strong>${fmt(summary.meanActualGames, 2)}</strong>
      </article>

      <article>
        <span>FAIR → OVER</span>
        <strong>${pct(summary.fairOverPct)}</strong>
      </article>

      <article>
        <span>FAIR → UNDER</span>
        <strong>${pct(summary.fairUnderPct)}</strong>
      </article>
    </div>

    <div class="flv-audit-grid">
      <div>
        <span>DECIDING SET</span>
        <strong>
          MODEL ${pct(summary.decidingPredictedPct)}
          ↔ REAL ${pct(summary.decidingActualPct)}
        </strong>
      </div>

      <div>
        <span>STRAIGHT SETS</span>
        <strong>
          MODEL ${pct(summary.straightPredictedPct)}
          ↔ REAL ${pct(summary.straightActualPct)}
        </strong>
      </div>

      <div class="${statusClass(summary.compressionStatus)}">
        <span>COMPRESSION AUDIT</span>
        <strong>${summary.compressionStatus}</strong>
        <small>
          22.5–24.5 = ${pct(summary.centralBandPct)}
          · spread ${fmt(summary.lineSpread, 1)}
        </small>
      </div>

      <div class="${statusClass(summary.biasStatus)}">
        <span>BIAS AUDIT</span>
        <strong>${summary.biasStatus}</strong>
        <small>
          positivo = modelo da demasiados juegos
        </small>
      </div>
    </div>

    <div class="flv-action-row">
      <div>
        <strong>REPLAY ENGINE</strong>
        <span id="flvProgressV0610">
          ${
            running
              ? progressText || 'Procesando…'
              : meta.lastRunAt
                ? `Último lote ${new Date(meta.lastRunAt).toLocaleString('es-MX')}`
                : 'Sin replays todavía'
          }
        </span>
      </div>

      <button
        id="flvRunV0610"
        type="button"
        ${running ? 'disabled' : ''}>
        ${running ? 'ANALIZANDO…' : 'ANALIZAR +4'}
      </button>
    </div>

    <div class="flv-note">
      No ajusta pesos ni thresholds automáticamente. Primero mide.
      Cada lote usa el mismo ensemble de producción
      (40K Markov + 40K Bayes + 20K Elo).
    </div>

    <div class="flv-section-head">
      <div>
        <span>FAIR LINE DISTRIBUTION</span>
        <strong>¿Seguimos comprimidos?</strong>
      </div>
      <small>
        ${summary.n ? `${summary.n} observaciones` : 'esperando muestra'}
      </small>
    </div>

    <div class="flv-lines">
      ${lineDistributionHtml(summary.lineDistribution)}
    </div>

    ${
      summary.n
        ? `
          <div class="flv-groups-grid">
            ${groupsHtml('TOUR', summary.byTour)}
            ${groupsHtml('SURFACE', summary.bySurface)}
            ${groupsHtml('DATA TRUST', summary.byTrust)}
          </div>
        `
        : ''
    }

    <div class="flv-section-head">
      <div>
        <span>LATEST REPLAYS</span>
        <strong>Predicción vs resultado</strong>
      </div>
      <small>últimos 6</small>
    </div>

    <div class="flv-replays">
      ${latestHtml(summary.latest)}
    </div>
  `;
}

function ensureRoot() {
  const labView =
    document.querySelector('#labView');

  if (!labView) return null;

  let root =
    document.querySelector('#fairLineValidationV0610');

  if (root) return root;

  root = document.createElement('section');
  root.id = 'fairLineValidationV0610';
  root.className = 'fairline-validation-card';

  const calibrationPanel =
    labView.querySelector('.lab-panel');

  if (calibrationPanel) {
    labView.insertBefore(root, calibrationPanel);
  } else {
    labView.appendChild(root);
  }

  return root;
}

async function runBatch() {
  if (running) return;

  running = true;
  progressText = 'Preparando replay…';
  renderHistoricalFairLineValidation();

  try {
    const result =
      await runHistoricalValidationBatch({
        batchSize: 4,
        onProgress: status => {
          progressText =
            status?.message ||
            `Replay ${status?.completed || 0}/${status?.target || 4}`;

          const label =
            document.querySelector('#flvProgressV0610');

          if (label) {
            label.textContent = progressText;
          }
        }
      });

    progressText =
      result.message ||
      `${result.added || 0} replays añadidos.`;

  } catch (error) {
    console.error(
      '[v0.6.10 Historical Validation]',
      error
    );

    progressText =
      `ERROR · ${error?.message || 'no se pudo ejecutar el replay'}`;

  } finally {
    running = false;
    renderHistoricalFairLineValidation();
  }
}

export function initHistoricalFairLineValidationUI() {
  const root = ensureRoot();

  if (!root) return;

  renderHistoricalFairLineValidation();
}

export function renderHistoricalFairLineValidation() {
  const root = ensureRoot();

  if (!root) return;

  const records =
    getHistoricalValidationRecords();

  const summary =
    summarizeFairLineValidation(records);

  const meta =
    historicalValidationStoreMeta();

  root.innerHTML =
    cardHtml(summary, meta);

  root
    .querySelector('#flvRunV0610')
    ?.addEventListener(
      'click',
      runBatch
    );
}
