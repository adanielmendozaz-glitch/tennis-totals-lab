import {
  initLabBankUI as initBaseLabBankUI,
  renderLabBank as renderBaseLabBank
} from './labBank.js';

import {
  getCensoEntries
} from '../engine/censo.js';

import {
  analyzeLab
} from '../engine/lab.js';

import {
  filterLabEntries,
  calibrationStrength,
  integritySummary
} from '../engine/labHardening.js';

import {
  bankEquitySeries,
  bankHistory
} from '../engine/bankTimeline.js';

const BANK_SETTINGS_KEY =
  'tennis_totals_lab_bank_settings_v1';

const filters = {
  window: 'ALL',
  tour: 'ALL',
  surface: 'ALL',
  trust: 'ALL'
};

function readBankSettings() {
  try {
    const saved =
      JSON.parse(
        localStorage.getItem(
          BANK_SETTINGS_KEY
        ) || '{}'
      );

    return {
      initialBankUnits:
        Number.isFinite(
          Number(saved.initialBankUnits)
        )
          ? Number(saved.initialBankUnits)
          : 100,
      unitValue:
        Number.isFinite(
          Number(saved.unitValue)
        )
          ? Number(saved.unitValue)
          : 0
    };
  } catch {
    return {
      initialBankUnits: 100,
      unitValue: 0
    };
  }
}

function tone(value) {
  const n = Number(value);

  if (
    !Number.isFinite(n) ||
    Math.abs(n) < 0.0001
  ) {
    return 'neutral';
  }

  return n > 0
    ? 'positive'
    : 'negative';
}

function signed(
  value,
  suffix = ''
) {
  if (
    value === null ||
    value === undefined
  ) {
    return '—';
  }

  const n = Number(value);

  return (
    `${n > 0 ? '+' : ''}` +
    `${n.toFixed(2)}${suffix}`
  );
}

function pct(value) {
  return value === null ||
    value === undefined
      ? '—'
      : `${Number(value).toFixed(1)}%`;
}

function score(value) {
  return value === null ||
    value === undefined
      ? '—'
      : Number(value).toFixed(4);
}

function uniqueValues(
  entries,
  getter
) {
  return [
    ...new Set(
      entries
        .map(getter)
        .filter(Boolean)
        .map(value =>
          String(value)
            .trim()
            .toUpperCase()
        )
    )
  ].sort();
}

function optionsHtml(values) {
  return [
    '<option value="ALL">ALL</option>',
    ...values.map(
      value =>
        `<option value="${value}">${value}</option>`
    )
  ].join('');
}

function installLabFilters() {
  const hero =
    document.querySelector(
      '#labView .lab-hero'
    );

  if (
    !hero ||
    document.querySelector(
      '#labFiltersV068'
    )
  ) {
    return;
  }

  const entries =
    getCensoEntries();

  const tours =
    uniqueValues(
      entries,
      entry => entry.tour
    );

  const surfaces =
    uniqueValues(
      entries,
      entry => entry.surface
    );

  const trusts =
    uniqueValues(
      entries,
      entry =>
        entry.dataTrustAudit?.level ||
        'LEGACY'
    );

  hero.insertAdjacentHTML(
    'beforebegin',
    `
      <section
        id="labFiltersV068"
        class="lab-filter-card">
        <div class="lab-window-switch">
          <button type="button" data-window="7D">7D</button>
          <button type="button" data-window="30D">30D</button>
          <button type="button" data-window="ALL" class="active">ALL</button>
        </div>

        <div class="lab-filter-selects">
          <label>
            <span>TOUR</span>
            <select data-filter="tour">
              ${optionsHtml(tours)}
            </select>
          </label>

          <label>
            <span>SURFACE</span>
            <select data-filter="surface">
              ${optionsHtml(surfaces)}
            </select>
          </label>

          <label>
            <span>TRUST</span>
            <select data-filter="trust">
              ${optionsHtml(trusts)}
            </select>
          </label>
        </div>

        <small id="labFilterSummaryV068">
          ALL · todos los grupos
        </small>
      </section>
    `
  );

  const panel =
    document.querySelector(
      '#labFiltersV068'
    );

  panel?.addEventListener(
    'click',
    event => {
      const button =
        event.target.closest(
          '[data-window]'
        );

      if (!button) {
        return;
      }

      filters.window =
        button.dataset.window;

      panel
        .querySelectorAll(
          '[data-window]'
        )
        .forEach(item => {
          item.classList.toggle(
            'active',
            item === button
          );
        });

      renderLabBank();
    }
  );

  panel?.addEventListener(
    'change',
    event => {
      const key =
        event.target
          ?.dataset
          ?.filter;

      if (!key) {
        return;
      }

      filters[key] =
        String(
          event.target.value ||
          'ALL'
        ).toUpperCase();

      renderLabBank();
    }
  );
}

function installBankHardening() {
  const bankView =
    document.querySelector(
      '#bankView'
    );

  if (!bankView) {
    return;
  }

  const headerVersion =
    bankView.querySelector(
      '.bank-header > strong'
    );

  if (headerVersion) {
    headerVersion.textContent =
      'v0.6.8';
  }

  if (
    !document.querySelector(
      '#bankEquityV068'
    )
  ) {
    const integrity =
      document.querySelector(
        '#bankIntegrity'
      );

    integrity?.insertAdjacentHTML(
      'beforebegin',
      `
        <section
          id="bankEquityV068"
          class="bank-equity-card">
          <div class="bank-settings-title">
            <div>
              <span>EQUITY CURVE</span>
              <strong>Evolución del bankroll</strong>
            </div>
            <small id="bankCurveMetaV068">
              Esperando liquidaciones
            </small>
          </div>

          <div
            id="bankEquityChartV068"
            class="bank-equity-chart">
          </div>
        </section>
      `
    );
  }

  if (
    !document.querySelector(
      '#bankIntegritySummaryV068'
    )
  ) {
    const settings =
      document.querySelector(
        '.bank-settings-card'
      );

    settings?.insertAdjacentHTML(
      'beforebegin',
      `
        <section
          id="bankIntegritySummaryV068"
          class="bank-integrity-summary">
          <div>
            <span>VERIFIED</span>
            <strong id="integrityVerifiedV068">0</strong>
          </div>
          <div>
            <span>LEGACY</span>
            <strong id="integrityLegacyV068">0</strong>
          </div>
          <div>
            <span>REVIEW</span>
            <strong id="integrityReviewV068">0</strong>
          </div>
          <div>
            <span>SETTLED</span>
            <strong id="integritySettledV068">0</strong>
          </div>
        </section>
      `
    );
  }

  if (
    !document.querySelector(
      '#bankHistoryV068'
    )
  ) {
    const note =
      bankView.querySelector(
        '.bank-note'
      );

    note?.insertAdjacentHTML(
      'beforebegin',
      `
        <section
          id="bankHistoryV068"
          class="bank-history-card">
          <div class="bank-settings-title">
            <div>
              <span>BET HISTORY</span>
              <strong>Últimos stakes</strong>
            </div>
            <small>máx. 20</small>
          </div>

          <div id="bankHistoryListV068"></div>
        </section>
      `
    );
  }

  if (!bankView.dataset.v068Bound) {
    bankView.dataset.v068Bound =
      'true';

    bankView.addEventListener(
      'click',
      event => {
        if (
          event.target.closest(
            '#bankSaveSettings'
          ) ||
          event.target.closest(
            '.stake-review-row button'
          )
        ) {
          setTimeout(
            () => renderLabBank(),
            0
          );
        }
      }
    );
  }
}

function groupHtml(
  title,
  subtitle,
  rows
) {
  return `
    <section class="lab-panel">
      <div class="lab-panel-head">
        <div>
          <span>${title}</span>
          <small>${subtitle}</small>
        </div>
        <strong>${rows.length} GRUPOS</strong>
      </div>

      <div class="lab-breakdown-list">
        ${
          rows.length
            ? rows.map(
                row => `
                  <div class="lab-breakdown-row">
                    <div>
                      <strong>${row.key}</strong>
                      <small>N=${row.n}</small>
                    </div>

                    <span>
                      RECORD
                      <b>${row.wins}-${row.losses}</b>
                    </span>

                    <span>
                      HIT RATE
                      <b>${row.hitRatePct.toFixed(1)}%</b>
                    </span>
                  </div>
                `
              ).join('')
            : `
                <div class="lab-empty-row">
                  Sin muestra liquidada
                  con estos filtros.
                </div>
              `
        }
      </div>
    </section>
  `;
}

function calibrationHtml(rows) {
  if (!rows.length) {
    return `
      <div class="lab-empty-row">
        Esperando picks WIN/LOSS.
      </div>
    `;
  }

  return rows
    .map(row => {
      const model =
        Math.max(
          0,
          Math.min(
            100,
            Number(row.modelAvgPct)
          )
        );

      const actual =
        Math.max(
          0,
          Math.min(
            100,
            Number(row.actualPct)
          )
        );

      const strength =
        calibrationStrength(row.n);

      return `
        <div class="calibration-card ${
          strength.code.toLowerCase()
        }">
          <div class="calibration-top">
            <div>
              <strong>${row.label}</strong>
              <small>
                N=${row.n}
                · ${strength.label}
              </small>
            </div>

            <span>
              Δ
              <b>
                ${
                  actual - model >= 0
                    ? '+'
                    : ''
                }${(
                  actual -
                  model
                ).toFixed(1)} pp
              </b>
            </span>
          </div>

          <div class="calibration-line">
            <span>MODEL</span>
            <div class="calibration-track">
              <i
                class="model"
                style="width:${model}%">
              </i>
            </div>
            <strong>${model.toFixed(1)}%</strong>
          </div>

          <div class="calibration-line">
            <span>ACTUAL</span>
            <div class="calibration-track">
              <i
                class="actual"
                style="width:${actual}%">
              </i>
            </div>
            <strong>${actual.toFixed(1)}%</strong>
          </div>

          ${
            row.n < 5
              ? `
                <div class="calibration-warning">
                  Muestra demasiado pequeña.
                  No usar este bucket
                  para ajustar el modelo.
                </div>
              `
              : ''
          }
        </div>
      `;
    })
    .join('');
}

function equitySvg(points) {
  if (
    !Array.isArray(points) ||
    points.length < 2
  ) {
    return `
      <div class="bank-chart-empty">
        La curva aparecerá con
        la primera liquidación.
      </div>
    `;
  }

  const width = 560;
  const height = 150;
  const pad = 12;

  const values =
    points.map(
      point =>
        Number(point.bankUnits)
    );

  const min =
    Math.min(...values);

  const max =
    Math.max(...values);

  const range =
    Math.max(
      0.5,
      max - min
    );

  const coords =
    points.map(
      (point, index) => {
        const x =
          pad +
          (
            index /
            Math.max(
              1,
              points.length - 1
            )
          ) *
          (
            width -
            pad * 2
          );

        const y =
          height -
          pad -
          (
            (
              Number(point.bankUnits) -
              min
            ) /
            range
          ) *
          (
            height -
            pad * 2
          );

        return { x, y };
      }
    );

  const line =
    coords
      .map(
        point =>
          `${point.x.toFixed(1)},${point.y.toFixed(1)}`
      )
      .join(' ');

  const last = coords.at(-1);

  return `
    <svg
      class="bank-equity-svg"
      viewBox="0 0 ${width} ${height}"
      role="img"
      aria-label="Evolución del bankroll">
      <line
        x1="${pad}"
        y1="${height - pad}"
        x2="${width - pad}"
        y2="${height - pad}"
        class="bank-chart-axis"
      />
      <polyline
        points="${line}"
        class="bank-chart-line"
      />
      <circle
        cx="${last.x.toFixed(1)}"
        cy="${last.y.toFixed(1)}"
        r="4"
        class="bank-chart-dot"
      />
    </svg>
  `;
}

function oddsText(odds, format) {
  const n = Number(odds);

  if (!Number.isFinite(n)) {
    return '—';
  }

  if (
    String(format || '')
      .toUpperCase() ===
      'DECIMAL' ||
    (
      n > 1 &&
      n < 20
    )
  ) {
    return n.toFixed(2);
  }

  return n > 0
    ? `+${Math.round(n)}`
    : `${Math.round(n)}`;
}

function historyHtml(rows) {
  if (!rows.length) {
    return `
      <div class="lab-empty-row">
        Aún no hay stakes verificados.
      </div>
    `;
  }

  return rows
    .slice(0, 20)
    .map(row => {
      const rowTone =
        tone(row.profitUnits);

      return `
        <div class="bank-history-row">
          <div class="bank-history-match">
            <strong>
              ${row.playerA}
              <span>vs</span>
              ${row.playerB}
            </strong>
            <small>
              ${row.side}
              ${Number(row.line).toFixed(1)}
              · ${oddsText(
                row.odds,
                row.oddsFormat
              )}
            </small>
          </div>

          <span>
            STAKE
            <b>${row.stakeUnits.toFixed(2)} U</b>
          </span>

          <span>
            RESULT
            <b class="status-${String(
              row.status
            ).toLowerCase()}">
              ${row.status}
            </b>
          </span>

          <span>
            P/L
            <b class="${rowTone}">
              ${
                row.profitUnits === null ||
                row.profitUnits === undefined
                  ? '—'
                  : signed(
                      row.profitUnits,
                      ' U'
                    )
              }
            </b>
          </span>
        </div>
      `;
    })
    .join('');
}

function renderLabHardening(entries) {
  const filtered =
    filterLabEntries(
      entries,
      filters
    );

  const lab =
    analyzeLab(filtered);

  const set = (
    selector,
    value
  ) => {
    const element =
      document.querySelector(selector);

    if (element) {
      element.textContent =
        String(value);
    }
  };

  set(
    '#labRecord',
    `${lab.wins}-${lab.losses}`
  );

  set(
    '#labSettled',
    `${lab.settledBinary} ${
      lab.settledBinary === 1
        ? 'pick settled'
        : 'picks settled'
    }`
  );

  set(
    '#labHitRate',
    pct(lab.hitRatePct)
  );

  set(
    '#labBrier',
    score(lab.brier)
  );

  set(
    '#labLogLoss',
    score(lab.logLoss)
  );

  set('#labPush', lab.pushes);
  set('#labPending', lab.pending);
  set('#labReview', lab.review);

  set(
    '#labFilterSummaryV068',
    `${filters.window} · ${
      filtered.length
    }/${entries.length} PICKS · ${
      filters.tour
    } · ${
      filters.surface
    } · ${
      filters.trust
    }`
  );

  const calibration =
    document.querySelector(
      '#labCalibration'
    );

  if (calibration) {
    calibration.innerHTML =
      calibrationHtml(
        lab.calibration
      );
  }

  const breakdowns =
    document.querySelector(
      '#labBreakdowns'
    );

  if (breakdowns) {
    breakdowns.innerHTML =
      groupHtml(
        'DATA TRUST',
        'HIGH / MEDIUM / CAUTION / LEGACY',
        lab.byTrust
      ) +
      groupHtml(
        'ATP / WTA',
        'Rendimiento por circuito',
        lab.byTour
      ) +
      groupHtml(
        'SUPERFICIE',
        'Hard / Clay / Grass / Unknown',
        lab.bySurface
      ) +
      groupHtml(
        'OVER / UNDER',
        'Sesgo por lado',
        lab.bySide
      );
  }
}

function renderBankHardening(entries) {
  const settings =
    readBankSettings();

  const profit =
    document.querySelector(
      '#bankProfit'
    );

  const roi =
    document.querySelector(
      '#bankRoi'
    );

  if (profit) {
    const raw =
      Number(
        String(profit.textContent)
          .replace(/[^\d.-]/g, '')
      );

    profit.classList.remove(
      'positive',
      'negative',
      'neutral'
    );

    profit.classList.add(
      tone(raw)
    );
  }

  if (roi) {
    const raw =
      Number(
        String(roi.textContent)
          .replace(/[^\d.-]/g, '')
      );

    roi.classList.remove(
      'positive',
      'negative',
      'neutral'
    );

    roi.classList.add(
      roi.textContent.trim() === '—'
        ? 'neutral'
        : tone(raw)
    );
  }

  const series =
    bankEquitySeries(
      entries,
      settings.initialBankUnits
    );

  const chart =
    document.querySelector(
      '#bankEquityChartV068'
    );

  if (chart) {
    chart.innerHTML =
      equitySvg(series);
  }

  const meta =
    document.querySelector(
      '#bankCurveMetaV068'
    );

  if (meta) {
    meta.textContent =
      `${Math.max(
        0,
        series.length - 1
      )} liquidaciones`;
  }

  const integrity =
    integritySummary(entries);

  const values = {
    '#integrityVerifiedV068':
      integrity.verified,
    '#integrityLegacyV068':
      integrity.legacy,
    '#integrityReviewV068':
      integrity.review,
    '#integritySettledV068':
      integrity.settled
  };

  for (
    const [selector, value]
    of Object.entries(values)
  ) {
    const element =
      document.querySelector(selector);

    if (element) {
      element.textContent =
        String(value);
    }
  }

  const history =
    document.querySelector(
      '#bankHistoryListV068'
    );

  if (history) {
    history.innerHTML =
      historyHtml(
        bankHistory(entries)
      );
  }
}

export function initLabBankUI() {
  initBaseLabBankUI();

  installLabFilters();
  installBankHardening();

  renderLabBank();
}

export function renderLabBank() {
  renderBaseLabBank();

  installLabFilters();
  installBankHardening();

  const entries =
    getCensoEntries();

  renderLabHardening(entries);
  renderBankHardening(entries);
}
