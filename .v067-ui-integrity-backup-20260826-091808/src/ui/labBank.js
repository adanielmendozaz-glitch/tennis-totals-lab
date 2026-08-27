import {
  getCensoEntries
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

function saveBankSettings(settings) {
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

function signed(value, suffix = '') {
  if (
    value === null ||
    value === undefined
  ) {
    return '—';
  }

  const n =
    Number(value);

  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}${suffix}`;
}

function groupHtml(title, rows) {
  return `
    <section class="lab-section">
      <div class="lab-section-head">
        <span>${title}</span>
      </div>

      <div class="lab-breakdown-list">
        ${
          rows.length
            ? rows.map(row => `
                <div class="lab-breakdown-row">
                  <strong>${row.key}</strong>
                  <span>N ${row.n}</span>
                  <span>${row.wins}-${row.losses}</span>
                  <b>${row.hitRatePct.toFixed(1)}%</b>
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

export function initLabBankUI() {
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
      <div class="lab-header">
        <div>
          <span>CALIBRATION LAB</span>
          <h2>Lab</h2>
        </div>
        <strong id="labSampleBadge">NO SAMPLE</strong>
      </div>

      <div class="lab-metrics">
        <div><span>SETTLED</span><strong id="labSettled">0</strong></div>
        <div><span>RECORD</span><strong id="labRecord">0-0</strong></div>
        <div><span>HIT RATE</span><strong id="labHitRate">—</strong></div>
        <div><span>BRIER</span><strong id="labBrier">—</strong></div>
      </div>

      <div class="lab-metrics secondary">
        <div><span>LOG LOSS</span><strong id="labLogLoss">—</strong></div>
        <div><span>PUSH</span><strong id="labPush">0</strong></div>
        <div><span>PENDING</span><strong id="labPending">0</strong></div>
        <div><span>REVIEW</span><strong id="labReview">0</strong></div>
      </div>

      <div id="labSampleNote" class="lab-sample-note"></div>

      <section class="lab-section">
        <div class="lab-section-head">
          <span>CALIBRATION BUCKETS</span>
          <strong>MODEL vs ACTUAL</strong>
        </div>
        <div id="labCalibration" class="lab-calibration"></div>
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
      <div class="bank-header">
        <div>
          <span>BANK FOUNDATION</span>
          <h2>Bank</h2>
        </div>
        <strong>UNITS</strong>
      </div>

      <section class="bank-settings">
        <label>
          <span>BANK INICIAL (U)</span>
          <input
            id="bankInitialUnits"
            type="number"
            step="1"
            min="0"
            inputmode="decimal"
          />
        </label>

        <label>
          <span>VALOR DE 1U (opcional)</span>
          <input
            id="bankUnitValue"
            type="number"
            step="0.01"
            min="0"
            inputmode="decimal"
          />
        </label>

        <button
          id="bankSaveSettings"
          type="button">
          GUARDAR
        </button>
      </section>

      <div class="bank-metrics">
        <div><span>BANK ACTUAL</span><strong id="bankCurrent">—</strong></div>
        <div><span>P/L</span><strong id="bankProfit">—</strong></div>
        <div><span>ROI</span><strong id="bankRoi">—</strong></div>
        <div><span>MAX DD</span><strong id="bankDrawdown">—</strong></div>
      </div>

      <div class="bank-detail" id="bankDetail"></div>

      <div class="bank-note">
        Los picks anteriores a v0.6.7 sin stake se conservan en LAB,
        pero no se inventan unidades retroactivamente.
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

  renderLabBank();
}

export function renderLabBank() {
  const entries =
    getCensoEntries();

  const lab =
    analyzeLab(entries);

  const sampleBadge =
    document.querySelector(
      '#labSampleBadge'
    );

  if (sampleBadge) {
    sampleBadge.textContent =
      lab.sample.label;
    sampleBadge.className =
      lab.sample.code.toLowerCase();
  }

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

  set(
    '#labSettled',
    lab.settledBinary
  );
  set(
    '#labRecord',
    `${lab.wins}-${lab.losses}`
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
      <strong>${lab.sample.label}</strong>
      <span>
        N=${lab.settledBinary}. Brier/Log Loss ya se calculan,
        pero no deben usarse para ajustar pesos con una muestra pequeña.
      </span>
    `;
  }

  const calibration =
    document.querySelector(
      '#labCalibration'
    );

  if (calibration) {
    calibration.innerHTML =
      lab.calibration.length
        ? lab.calibration
            .map(row => `
              <div class="lab-calibration-row">
                <strong>${row.label}</strong>
                <span>N ${row.n}</span>
                <span>MODEL ${row.modelAvgPct.toFixed(1)}%</span>
                <b>ACTUAL ${row.actualPct.toFixed(1)}%</b>
              </div>
            `)
            .join('')
        : `
            <div class="lab-empty-row">
              Esperando picks WIN/LOSS.
            </div>
          `;
  }

  const breakdowns =
    document.querySelector(
      '#labBreakdowns'
    );

  if (breakdowns) {
    breakdowns.innerHTML =
      groupHtml(
        'DATA TRUST',
        lab.byTrust
      ) +
      groupHtml(
        'ATP / WTA',
        lab.byTour
      ) +
      groupHtml(
        'SURFACE',
        lab.bySurface
      ) +
      groupHtml(
        'OVER / UNDER',
        lab.bySide
      );
  }

  const bank =
    analyzeBank(
      entries,
      loadBankSettings()
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
        SETTLED STAKE
        <strong>${bank.totalStakedUnits.toFixed(2)} U</strong>
      </span>

      <span>
        PENDING EXPOSURE
        <strong>${bank.pendingExposureUnits.toFixed(2)} U</strong>
      </span>

      <span>
        VALUE 1U
        <strong>
          ${
            bank.unitValue > 0
              ? bank.unitValue.toFixed(2)
              : '—'
          }
        </strong>
      </span>

      ${
        bank.profitMoney !== null
          ? `
            <span>
              P/L MONEY
              <strong>${signed(bank.profitMoney)}</strong>
            </span>
          `
          : ''
      }
    `;
  }
}

