import {
  getCensoEntries,
  repairStakeIntegrity,
  resolveStakeReview
} from '../engine/censo.js';

import {
  analyzeLab
} from '../engine/lab.js';

import {
  analyzeBank
} from '../engine/bank.js';

const BANK_SETTINGS_KEY =
  'tennis_totals_lab_bank_settings_v1';

function loadBankSettings() {
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
          Number(
            saved.initialBankUnits
          )
        )
          ? Number(
              saved.initialBankUnits
            )
          : 100,

      unitValue:
        Number.isFinite(
          Number(
            saved.unitValue
          )
        )
          ? Number(
              saved.unitValue
            )
          : 0
    };

  } catch {
    return {
      initialBankUnits: 100,
      unitValue: 0
    };
  }
}

function saveBankSettings(
  settings
) {
  localStorage.setItem(
    BANK_SETTINGS_KEY,
    JSON.stringify(settings)
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

  const n =
    Number(value);

  return (
    `${n >= 0 ? '+' : ''}` +
    `${n.toFixed(2)}${suffix}`
  );
}

function sampleTone(code) {
  if (
    code === 'USEFUL' ||
    code === 'STRONGER'
  ) {
    return 'good';
  }

  if (
    code === 'DEVELOPING'
  ) {
    return 'medium';
  }

  return 'caution';
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
            ? rows.map(row => `
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
              `).join('')
            : `
                <div class="lab-empty-row">
                  Sin muestra liquidada todavía.
                </div>
              `
        }
      </div>
    </section>
  `;
}

function calibrationHtml(
  rows
) {
  if (!rows.length) {
    return `
      <div class="lab-empty-row">
        Esperando picks WIN/LOSS para
        construir calibración.
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

      return `
        <div class="calibration-card">
          <div class="calibration-top">
            <div>
              <strong>${row.label}</strong>
              <small>N=${row.n}</small>
            </div>

            <span>
              Δ
              <b>
                ${
                  (
                    actual -
                    model
                  ) >= 0
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
        </div>
      `;
    })
    .join('');
}

function stakeReviewHtml(
  entries
) {
  if (!entries.length) {
    return '';
  }

  return `
    <section class="bank-integrity-card">
      <div class="bank-integrity-head">
        <div>
          <span>STAKE INTEGRITY</span>
          <strong>
            ${entries.length}
            ${
              entries.length === 1
                ? 'PICK REQUIERE'
                : 'PICKS REQUIEREN'
            }
            CONFIRMACIÓN
          </strong>
        </div>
        <b>REVIEW</b>
      </div>

      <p>
        Estos picks fueron creados durante
        el primer build de v0.6.7, cuando
        1U podía asignarse sin confirmación.
        BANK no los contará hasta que tú
        confirmes el stake real.
      </p>

      <div class="stake-review-list">
        ${entries.map(entry => `
          <div
            class="stake-review-row"
            data-stake-review="${entry.matchId}">
            <div>
              <strong>
                ${entry.playerA}
                <span>vs</span>
                ${entry.playerB}
              </strong>

              <small>
                ${entry.side}
                ${Number(entry.line).toFixed(1)}
                · ${
                  entry.stakeIntegrity
                    ?.priorStakeUnits ?? '—'
                }U previo
              </small>
            </div>

            <select>
              <option value="0.25">0.25 U</option>
              <option value="0.5">0.50 U</option>
              <option value="0.75">0.75 U</option>
              <option value="1" selected>1.00 U</option>
            </select>

            <button type="button">
              CONFIRMAR
            </button>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

export function initLabBankUI() {
  const repair =
    repairStakeIntegrity();

  if (repair.changed > 0) {
    console.warn(
      '[Stake Integrity] movidos a REVIEW:',
      repair.changed
    );
  }

  const labView =
    document.querySelector(
      '#labView'
    );

  const bankView =
    document.querySelector(
      '#bankView'
    );

  if (labView) {
    labView.classList.remove(
      'empty-view'
    );

    labView.classList.add(
      'lab-view'
    );

    labView.innerHTML = `
      <header class="lab-header">
        <div>
          <span>CALIBRATION LAB</span>
          <h2>Model Audit</h2>
          <p>
            ¿Las probabilidades del modelo
            se cumplen en resultados reales?
          </p>
        </div>

        <strong id="labSampleBadge">
          NO SAMPLE
        </strong>
      </header>

      <section class="lab-hero">
        <div class="lab-record-block">
          <span>RECORD LIQUIDADO</span>
          <strong id="labRecord">0-0</strong>
          <small id="labSettled">
            0 picks settled
          </small>
        </div>

        <div class="lab-hit-block">
          <span>HIT RATE</span>
          <strong id="labHitRate">—</strong>
          <small>
            Aciertos / WIN+LOSS
          </small>
        </div>
      </section>

      <section class="lab-score-grid">
        <article class="lab-score-card">
          <div>
            <span>BRIER SCORE</span>
            <strong id="labBrier">—</strong>
          </div>
          <small>
            Menor es mejor · 0.0000 sería perfecto.
            Mide qué tan calibradas están las probabilidades.
          </small>
        </article>

        <article class="lab-score-card">
          <div>
            <span>LOG LOSS</span>
            <strong id="labLogLoss">—</strong>
          </div>
          <small>
            Menor es mejor. Castiga especialmente
            predicciones muy confiadas que terminan fallando.
          </small>
        </article>
      </section>

      <section class="lab-status-grid">
        <div>
          <span>PUSH</span>
          <strong id="labPush">0</strong>
        </div>
        <div>
          <span>PENDING</span>
          <strong id="labPending">0</strong>
        </div>
        <div>
          <span>REVIEW</span>
          <strong id="labReview">0</strong>
        </div>
      </section>

      <div
        id="labSampleNote"
        class="lab-sample-note">
      </div>

      <section class="lab-panel">
        <div class="lab-panel-head">
          <div>
            <span>CALIBRATION BUCKETS</span>
            <small>
              Probabilidad declarada vs frecuencia real
            </small>
          </div>
          <strong>MODEL ↔ ACTUAL</strong>
        </div>

        <div
          id="labCalibration"
          class="lab-calibration">
        </div>
      </section>

      <div id="labBreakdowns"></div>
    `;
  }

  if (bankView) {
    bankView.classList.remove(
      'empty-view'
    );

    bankView.classList.add(
      'bank-view'
    );

    bankView.innerHTML = `
      <header class="bank-header">
        <div>
          <span>BANKROLL ENGINE</span>
          <h2>Bank</h2>
          <p>
            Capital, exposición, ROI
            y riesgo en unidades reales.
          </p>
        </div>

        <strong>v0.6.7</strong>
      </header>

      <section class="bank-balance-card">
        <div>
          <span>BANK ACTUAL</span>
          <strong id="bankCurrent">
            — U
          </strong>
          <small id="bankMoney">
            Valor monetario opcional
          </small>
        </div>

        <div class="bank-pl">
          <span>P/L</span>
          <strong id="bankProfit">—</strong>
        </div>
      </section>

      <section class="bank-kpi-grid">
        <article>
          <span>ROI</span>
          <strong id="bankRoi">—</strong>
          <small>
            Beneficio / unidades apostadas
          </small>
        </article>

        <article>
          <span>MAX DRAWDOWN</span>
          <strong id="bankDrawdown">—</strong>
          <small>
            Mayor caída desde un máximo
          </small>
        </article>

        <article>
          <span>EXPOSURE</span>
          <strong id="bankExposure">—</strong>
          <small>
            Unidades aún pendientes
          </small>
        </article>

        <article>
          <span>SETTLED STAKE</span>
          <strong id="bankStaked">—</strong>
          <small>
            Riesgo ya liquidado
          </small>
        </article>
      </section>

      <section
        id="bankIntegrity"
        class="bank-integrity-slot">
      </section>

      <section class="bank-settings-card">
        <div class="bank-settings-title">
          <div>
            <span>CONFIGURACIÓN</span>
            <strong>Bankroll base</strong>
          </div>
          <small>
            Los cambios no alteran los picks.
          </small>
        </div>

        <div class="bank-settings-grid">
          <label>
            <span>BANK INICIAL</span>
            <div class="bank-input-wrap">
              <input
                id="bankInitialUnits"
                type="number"
                step="1"
                min="0"
                inputmode="decimal"
              />
              <b>U</b>
            </div>
          </label>

          <label>
            <span>VALOR DE 1U</span>
            <div class="bank-input-wrap">
              <input
                id="bankUnitValue"
                type="number"
                step="0.01"
                min="0"
                inputmode="decimal"
                placeholder="Opcional"
              />
            </div>
          </label>

          <button
            id="bankSaveSettings"
            type="button">
            GUARDAR CONFIGURACIÓN
          </button>
        </div>
      </section>

      <section class="bank-activity-card">
        <div class="bank-settings-title">
          <div>
            <span>ACTIVIDAD</span>
            <strong>Control de unidades</strong>
          </div>
        </div>

        <div
          class="bank-detail"
          id="bankDetail">
        </div>
      </section>

      <div class="bank-note">
        LAB puede analizar picks históricos.
        BANK solo usa stakes explícitos y verificables.
      </div>
    `;
  }

  const settings =
    loadBankSettings();

  const initialInput =
    document.querySelector(
      '#bankInitialUnits'
    );

  const unitInput =
    document.querySelector(
      '#bankUnitValue'
    );

  if (initialInput) {
    initialInput.value =
      String(
        settings.initialBankUnits
      );
  }

  if (unitInput) {
    unitInput.value =
      settings.unitValue > 0
        ? String(
            settings.unitValue
          )
        : '';
  }

  document
    .querySelector(
      '#bankSaveSettings'
    )
    ?.addEventListener(
      'click',
      () => {
        const next = {
          initialBankUnits:
            Math.max(
              0,
              Number(
                initialInput?.value ||
                0
              )
            ),

          unitValue:
            Math.max(
              0,
              Number(
                unitInput?.value ||
                0
              )
            )
        };

        saveBankSettings(next);
        renderLabBank();
      }
    );

  document
    .querySelector(
      '#bankIntegrity'
    )
    ?.addEventListener(
      'click',
      event => {
        const button =
          event.target.closest(
            '.stake-review-row button'
          );

        if (!button) {
          return;
        }

        const row =
          button.closest(
            '[data-stake-review]'
          );

        const matchId =
          row?.dataset
            ?.stakeReview;

        const stake =
          Number(
            row
              ?.querySelector('select')
              ?.value
          );

        const result =
          resolveStakeReview(
            matchId,
            stake
          );

        if (!result.ok) {
          alert(
            `No se pudo confirmar: ${result.reason}`
          );
          return;
        }

        renderLabBank();
      }
    );

  renderLabBank();
}

export function renderLabBank() {
  const entries =
    getCensoEntries();

  const lab =
    analyzeLab(entries);

  const set = (
    selector,
    value
  ) => {
    const element =
      document.querySelector(
        selector
      );

    if (element) {
      element.textContent =
        String(value);
    }
  };

  const sampleBadge =
    document.querySelector(
      '#labSampleBadge'
    );

  if (sampleBadge) {
    sampleBadge.textContent =
      lab.sample.label;

    sampleBadge.className =
      sampleTone(
        lab.sample.code
      );
  }

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

  const sampleNote =
    document.querySelector(
      '#labSampleNote'
    );

  if (sampleNote) {
    sampleNote.innerHTML = `
      <div>
        <strong>${lab.sample.label}</strong>
        <span>
          N=${lab.settledBinary}
        </span>
      </div>

      <p>
        ${
          lab.settledBinary < 30
            ? 'Todavía estamos recolectando evidencia. No ajustaremos pesos ni thresholds usando esta muestra.'
            : 'La muestra empieza a ser útil para buscar señales, pero seguiremos vigilando estabilidad y segmentación.'
        }
      </p>
    `;
  }

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
        'HIGH / MEDIUM / CAUTION',
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
        'Sesgo por lado de mercado',
        lab.bySide
      );
  }

  const settings =
    loadBankSettings();

  const bank =
    analyzeBank(
      entries,
      settings
    );

  set(
    '#bankCurrent',
    `${bank.currentBankUnits.toFixed(2)} U`
  );

  set(
    '#bankProfit',
    signed(
      bank.profitUnits,
      ' U'
    )
  );

  set(
    '#bankRoi',
    bank.roiPct === null
      ? '—'
      : `${bank.roiPct.toFixed(1)}%`
  );

  set(
    '#bankDrawdown',
    `${bank.maxDrawdownUnits.toFixed(2)} U`
  );

  set(
    '#bankExposure',
    `${bank.pendingExposureUnits.toFixed(2)} U`
  );

  set(
    '#bankStaked',
    `${bank.totalStakedUnits.toFixed(2)} U`
  );

  const money =
    document.querySelector(
      '#bankMoney'
    );

  if (money) {
    money.textContent =
      bank.currentBankMoney !== null
        ? `≈ ${bank.currentBankMoney.toFixed(2)}`
        : 'Configura el valor de 1U si quieres equivalencia monetaria';
  }

  const bankDetail =
    document.querySelector(
      '#bankDetail'
    );

  if (bankDetail) {
    bankDetail.innerHTML = `
      <span>
        STAKED PICKS
        <strong>${bank.stakedPicks}</strong>
      </span>

      <span>
        SETTLED PICKS
        <strong>${bank.settledStakedPicks}</strong>
      </span>

      <span>
        PENDING PICKS
        <strong>${bank.pendingStakedPicks}</strong>
      </span>

      <span>
        INITIAL BANK
        <strong>${bank.initialBankUnits.toFixed(2)} U</strong>
      </span>

      ${
        bank.profitMoney !== null
          ? `
            <span>
              P/L MONEY
              <strong>
                ${signed(bank.profitMoney)}
              </strong>
            </span>
          `
          : ''
      }
    `;
  }

  const reviewEntries =
    entries.filter(
      entry =>
        entry.stakeIntegrity
          ?.status ===
        'REVIEW'
    );

  const integrity =
    document.querySelector(
      '#bankIntegrity'
    );

  if (integrity) {
    integrity.innerHTML =
      stakeReviewHtml(
        reviewEntries
      );
  }
}

