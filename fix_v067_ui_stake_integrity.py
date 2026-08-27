#!/usr/bin/env python3
from __future__ import annotations

import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path.cwd()

FILES = {
    "censo": ROOT / "src/engine/censo.js",
    "labbank": ROOT / "src/ui/labBank.js",
    "main": ROOT / "src/main.js",
    "style": ROOT / "src/style.css",
    "tests": ROOT / "tests/wagerBank.test.js",
}

for name, path in FILES.items():
    if not path.exists():
        print(f"[ERROR] Falta {path}")
        print("Ejecuta desde ~/tennis-totals-lab")
        sys.exit(1)

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = ROOT / f".v067-ui-integrity-backup-{stamp}"

for path in FILES.values():
    rel = path.relative_to(ROOT)
    dst = backup / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, dst)

print(f"[OK] Backup local: {backup.name}")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f"[OK] {label}: ya aplicado")
        return text
    if old not in text:
        print(f"[ERROR] No encontré patrón: {label}")
        sys.exit(1)
    print(f"[OK] {label}")
    return text.replace(old, new, 1)


# =========================================================
# 1. CENSO: STAKE INTEGRITY
# =========================================================
censo_path = FILES["censo"]
s = censo_path.read_text(encoding="utf-8")

s = replace_once(
    s,
    '''  const stakeUnits =
    normalizeStakeUnits(
      options.stakeUnits ?? 1,
      null
    );''',
    '''  const stakeUnits =
    normalizeStakeUnits(
      options.stakeUnits,
      null
    );''',
    "Censo deja de asumir 1U"
)

if "export function repairStakeIntegrity()" not in s:
    anchor = '''export function hasCenso(matchId) {
  const store =
    readStore();

  return Boolean(
    store[
      String(matchId)
    ]
  );
}
'''
    if anchor not in s:
        print("[ERROR] No encontré hasCenso para insertar stake integrity")
        sys.exit(1)

    addition = r'''

/*
 * v0.6.7 Stake Integrity Hotfix
 *
 * Los primeros builds de v0.6.7 podían crear 1U por defecto
 * aunque el usuario no hubiera confirmado el stake en pantalla.
 * Nunca borramos esa huella: la movemos a REVIEW y conservamos
 * priorStakeUnits dentro del audit.
 */
export function repairStakeIntegrity() {
  const store =
    readStore();

  let changed = 0;

  for (
    const entry
    of Object.values(store)
  ) {
    if (
      entry?.appVersion === '0.6.7' &&
      Number(entry.stakeUnits) > 0 &&
      !entry.stakeSource
    ) {
      const priorStakeUnits =
        Number(entry.stakeUnits);

      entry.stakeIntegrity = {
        status: 'REVIEW',
        reason:
          'UNCONFIRMED_PRE_HOTFIX',
        priorStakeUnits,
        repairedAt:
          new Date().toISOString()
      };

      entry.stakeUnits =
        null;

      if (
        entry.result &&
        entry.result.profitUnits !==
        undefined
      ) {
        entry.result.profitUnits =
          null;
      }

      changed++;
    }
  }

  if (changed > 0) {
    writeStore(store);
  }

  return {
    changed
  };
}

export function resolveStakeReview(
  matchId,
  stakeValue
) {
  const stakeUnits =
    normalizeStakeUnits(
      stakeValue,
      null
    );

  if (!stakeUnits) {
    return {
      ok: false,
      reason: 'INVALID_STAKE'
    };
  }

  const store =
    readStore();

  const id =
    String(matchId);

  const entry =
    store[id];

  if (!entry) {
    return {
      ok: false,
      reason: 'ENTRY_MISSING'
    };
  }

  if (
    entry.stakeIntegrity?.status !==
    'REVIEW'
  ) {
    return {
      ok: false,
      reason: 'NOT_IN_REVIEW'
    };
  }

  const prior =
    entry.stakeIntegrity;

  entry.stakeUnits =
    stakeUnits;

  entry.stakeSource =
    'USER_CONFIRMED_REVIEW';

  entry.stakeSelectedAt =
    new Date().toISOString();

  entry.stakeIntegrity = {
    ...prior,
    status: 'VERIFIED',
    confirmedStakeUnits:
      stakeUnits,
    confirmedAt:
      new Date().toISOString()
  };

  if (
    ['WIN', 'LOSS', 'PUSH'].includes(
      entry.result?.status
    )
  ) {
    entry.result.profitUnits =
      profitUnitsFor({
        status:
          entry.result.status,
        stakeUnits,
        odds:
          entry.odds,
        oddsFormat:
          entry.oddsFormat
      });
  }

  store[id] =
    entry;

  writeStore(store);

  return {
    ok: true,
    entry
  };
}
'''
    s = s.replace(anchor, anchor + addition, 1)
    print("[OK] Repair + Resolve Stake Review agregado")

s = replace_once(
    s,
    '''    stakeUnits,

    modelPct:''',
    '''    stakeUnits,

    stakeSource:
      'USER_SELECTED',

    stakeSelectedAt:
      new Date().toISOString(),

    stakeIntegrity: {
      status: 'VERIFIED',
      reason: null
    },

    modelPct:''',
    "Censo congela fuente explícita del stake"
)

censo_path.write_text(s, encoding="utf-8")


# =========================================================
# 2. LAB/BANK UI: REWRITE VISUAL + REVIEW WORKFLOW
# =========================================================
labbank_path = FILES["labbank"]

labbank_js = r'''import {
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
'''

labbank_path.write_text(
    labbank_js + "\n",
    encoding="utf-8"
)
print("[OK] LAB/BANK UI rediseñada")


# =========================================================
# 3. MAIN: STAKE REVIEW LABEL
# =========================================================
main_path = FILES["main"]
m = main_path.read_text(encoding="utf-8")

old = '''              Number.isFinite(
                Number(entry.stakeUnits)
              )
                ? `${Number(entry.stakeUnits).toFixed(2)} U`
                : 'LEGACY' '''

new = '''              entry.stakeIntegrity?.status === 'REVIEW'
                ? 'STAKE REVIEW'
                : Number.isFinite(
                    Number(entry.stakeUnits)
                  )
                  ? `${Number(entry.stakeUnits).toFixed(2)} U`
                  : 'LEGACY' '''

if old in m:
    m = m.replace(old, new, 1)
    print("[OK] Censo muestra STAKE REVIEW")
elif "STAKE REVIEW" in m:
    print("[OK] Censo STAKE REVIEW ya aplicado")
else:
    print("[WARN] No encontré bloque STAKE/LEGACY en main.js")

main_path.write_text(m, encoding="utf-8")


# =========================================================
# 4. CSS: PROFESSIONAL LAB/BANK UI
# =========================================================
style_path = FILES["style"]
css = style_path.read_text(encoding="utf-8")

marker = "/* v0.6.7 LAB/BANK PROFESSIONAL UI + STAKE INTEGRITY */"

if marker not in css:
    css += r'''

/* v0.6.7 LAB/BANK PROFESSIONAL UI + STAKE INTEGRITY */

.lab-view,
.bank-view {
  padding-bottom: 110px;
}

.lab-header,
.bank-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin: 6px 0 18px;
}

.lab-header > div > span,
.bank-header > div > span,
.lab-panel-head span,
.bank-settings-title span,
.bank-integrity-head span {
  display: block;
  color: #63eca0;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: .13em;
}

.lab-header h2,
.bank-header h2 {
  margin: 4px 0 4px;
  font-size: 26px;
  line-height: 1.05;
}

.lab-header p,
.bank-header p {
  max-width: 370px;
  margin: 0;
  color: #73877c;
  font-size: 10px;
  line-height: 1.45;
}

.lab-header > strong,
.bank-header > strong {
  flex: none;
  padding: 7px 9px;
  border: 1px solid #244536;
  border-radius: 9px;
  background: #10271b;
  color: #67eaa0;
  font-size: 8px;
  font-weight: 900;
}

.lab-header > strong.caution {
  border-color: #594b21;
  background: #29220f;
  color: #e6cd72;
}

.lab-header > strong.medium {
  border-color: #5d552b;
  background: #26210f;
  color: #e3ce7a;
}

.lab-header > strong.good {
  border-color: #2c6e4a;
  background: #10331f;
  color: #6cefaa;
}

.lab-hero {
  display: grid;
  grid-template-columns: 1.25fr 1fr;
  gap: 1px;
  overflow: hidden;
  margin-bottom: 10px;
  border: 1px solid #244536;
  border-radius: 16px;
  background: #1a3327;
}

.lab-record-block,
.lab-hit-block {
  padding: 17px 15px;
  background:
    linear-gradient(
      145deg,
      rgba(16, 39, 27, .98),
      rgba(7, 20, 13, .98)
    );
}

.lab-record-block span,
.lab-hit-block span,
.lab-score-card span,
.lab-status-grid span,
.bank-balance-card span,
.bank-kpi-grid span,
.bank-detail > span {
  display: block;
  color: #657a6e;
  font-size: 7px;
  font-weight: 900;
  letter-spacing: .08em;
}

.lab-record-block strong,
.lab-hit-block strong {
  display: block;
  margin: 4px 0 2px;
  color: #f0f7f3;
  font-size: 27px;
}

.lab-record-block small,
.lab-hit-block small {
  color: #74877d;
  font-size: 8px;
}

.lab-score-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 9px;
  margin-bottom: 9px;
}

.lab-score-card {
  padding: 13px;
  border: 1px solid #203b2e;
  border-radius: 13px;
  background: #09170f;
}

.lab-score-card > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.lab-score-card strong {
  color: #eef6f1;
  font-size: 18px;
}

.lab-score-card small {
  display: block;
  margin-top: 8px;
  color: #71857a;
  font-size: 8px;
  line-height: 1.45;
}

.lab-status-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 7px;
  margin-bottom: 10px;
}

.lab-status-grid > div {
  padding: 10px 11px;
  border: 1px solid #1d352a;
  border-radius: 11px;
  background: #0a1610;
}

.lab-status-grid strong {
  display: block;
  margin-top: 4px;
  font-size: 16px;
}

.lab-sample-note {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 13px;
  margin-bottom: 13px;
  border: 1px solid #5a4c22;
  border-radius: 12px;
  background: rgba(92, 70, 20, .18);
}

.lab-sample-note > div {
  flex: none;
}

.lab-sample-note strong,
.lab-sample-note span {
  display: block;
}

.lab-sample-note strong {
  color: #e6cd72;
  font-size: 9px;
}

.lab-sample-note span {
  margin-top: 3px;
  color: #9d8e52;
  font-size: 8px;
}

.lab-sample-note p {
  margin: 0;
  color: #b1a46e;
  font-size: 8px;
  line-height: 1.45;
  text-align: right;
}

.lab-panel {
  overflow: hidden;
  margin-bottom: 11px;
  border: 1px solid #203a2d;
  border-radius: 14px;
  background: #08150e;
}

.lab-panel-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  padding: 11px 12px;
  border-bottom: 1px solid #172a20;
  background: #0b1a12;
}

.lab-panel-head small,
.bank-settings-title small {
  display: block;
  margin-top: 3px;
  color: #667a6f;
  font-size: 7px;
}

.lab-panel-head > strong {
  color: #71857a;
  font-size: 7px;
}

.calibration-card {
  padding: 12px;
  border-bottom: 1px solid #17281f;
}

.calibration-card:last-child {
  border-bottom: 0;
}

.calibration-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.calibration-top > div strong {
  display: block;
  font-size: 11px;
}

.calibration-top small {
  color: #65786d;
  font-size: 7px;
}

.calibration-top > span {
  color: #62766b;
  font-size: 7px;
}

.calibration-top > span b {
  margin-left: 5px;
  color: #dfe9e3;
}

.calibration-line {
  display: grid;
  grid-template-columns: 42px 1fr 45px;
  gap: 8px;
  align-items: center;
  margin-top: 7px;
}

.calibration-line > span {
  color: #697e72;
  font-size: 7px;
  font-weight: 900;
}

.calibration-line > strong {
  text-align: right;
  font-size: 8px;
}

.calibration-track {
  height: 7px;
  overflow: hidden;
  border-radius: 99px;
  background: #15261d;
}

.calibration-track i {
  display: block;
  height: 100%;
  border-radius: 99px;
}

.calibration-track i.model {
  background: #63e9a0;
}

.calibration-track i.actual {
  background: #d9c267;
}

.lab-breakdown-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 10px;
  align-items: center;
  padding: 11px 12px;
  border-bottom: 1px solid #17281f;
}

.lab-breakdown-row:last-child {
  border-bottom: 0;
}

.lab-breakdown-row > div strong {
  display: block;
  font-size: 10px;
}

.lab-breakdown-row > div small {
  color: #65786e;
  font-size: 7px;
}

.lab-breakdown-row > span {
  color: #64786d;
  font-size: 6px;
  font-weight: 900;
  text-align: right;
}

.lab-breakdown-row > span b {
  display: block;
  margin-top: 3px;
  color: #dce7e1;
  font-size: 9px;
}

.lab-empty-row {
  padding: 20px 13px;
  color: #708279;
  font-size: 9px;
  text-align: center;
}

.bank-balance-card {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  align-items: end;
  padding: 17px 15px;
  margin-bottom: 10px;
  border: 1px solid #28513e;
  border-radius: 16px;
  background:
    radial-gradient(
      circle at top right,
      rgba(58, 139, 94, .22),
      transparent 45%
    ),
    linear-gradient(
      145deg,
      #0e281b,
      #07150e
    );
}

.bank-balance-card > div:first-child > strong {
  display: block;
  margin: 4px 0 3px;
  font-size: 30px;
}

.bank-balance-card small {
  color: #74877d;
  font-size: 8px;
}

.bank-pl {
  min-width: 95px;
  text-align: right;
}

.bank-pl strong {
  display: block;
  margin-top: 4px;
  color: #6aeca5;
  font-size: 18px;
}

.bank-kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}

.bank-kpi-grid article {
  padding: 12px;
  border: 1px solid #20382c;
  border-radius: 12px;
  background: #09160f;
}

.bank-kpi-grid strong {
  display: block;
  margin: 4px 0 3px;
  font-size: 17px;
}

.bank-kpi-grid small {
  color: #687c71;
  font-size: 7px;
  line-height: 1.35;
}

.bank-settings-card,
.bank-activity-card,
.bank-integrity-card {
  overflow: hidden;
  margin-bottom: 11px;
  border: 1px solid #203a2d;
  border-radius: 14px;
  background: #08150e;
}

.bank-settings-title,
.bank-integrity-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 12px;
  border-bottom: 1px solid #172a20;
  background: #0b1a12;
}

.bank-settings-title strong,
.bank-integrity-head strong {
  display: block;
  margin-top: 2px;
  font-size: 10px;
}

.bank-settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
  padding: 12px;
}

.bank-settings-grid label > span {
  display: block;
  margin-bottom: 5px;
  color: #64786d;
  font-size: 7px;
  font-weight: 900;
}

.bank-input-wrap {
  display: flex;
  align-items: center;
  overflow: hidden;
  border: 1px solid #294638;
  border-radius: 9px;
  background: #07120c;
}

.bank-input-wrap:focus-within {
  border-color: #58df98;
}

.bank-input-wrap input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  padding: 10px;
  color: #edf6f0;
  background: transparent;
  font-size: 12px;
}

.bank-input-wrap b {
  padding-right: 10px;
  color: #6f8278;
  font-size: 9px;
}

.bank-settings-grid button {
  grid-column: 1 / -1;
  border: 0;
  border-radius: 9px;
  padding: 10px 12px;
  background: #59e79b;
  color: #07110c;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: .05em;
}

.bank-detail {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1px;
  background: #183025;
}

.bank-detail > span {
  padding: 11px 12px;
  background: #09160f;
}

.bank-detail > span strong {
  display: block;
  margin-top: 4px;
  color: #e8f1ec;
  font-size: 11px;
}

.bank-note {
  padding: 10px 12px;
  border: 1px dashed #284236;
  border-radius: 11px;
  color: #71847a;
  font-size: 8px;
  line-height: 1.45;
}

.bank-integrity-card {
  border-color: #684d2c;
  background: #160f09;
}

.bank-integrity-head {
  background: #21160c;
  border-bottom-color: #44301c;
}

.bank-integrity-head span {
  color: #efb171;
}

.bank-integrity-head b {
  padding: 5px 7px;
  border-radius: 7px;
  color: #ffc184;
  background: #4b2a15;
  font-size: 7px;
}

.bank-integrity-card > p {
  margin: 0;
  padding: 11px 12px;
  color: #c9a57d;
  font-size: 8px;
  line-height: 1.45;
}

.stake-review-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border-top: 1px solid #3a2818;
}

.stake-review-row > div strong {
  display: block;
  font-size: 9px;
}

.stake-review-row > div strong span {
  color: #7c6754;
  font-size: 7px;
}

.stake-review-row > div small {
  display: block;
  margin-top: 3px;
  color: #a78365;
  font-size: 7px;
}

.stake-review-row select {
  border: 1px solid #5c4026;
  border-radius: 8px;
  padding: 7px;
  color: #f0d5bb;
  background: #1b120b;
  font-size: 8px;
}

.stake-review-row button {
  border: 0;
  border-radius: 8px;
  padding: 8px;
  color: #211006;
  background: #e8a866;
  font-size: 7px;
  font-weight: 900;
}

.censo-unit-control {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.censo-unit-control label {
  flex: 1;
}

.censo-unit-control label > span {
  display: block;
  margin-bottom: 4px;
  color: #63776c;
  font-size: 6px;
  font-weight: 900;
}

.censo-unit-control select {
  width: 100%;
  border: 1px solid #294638;
  border-radius: 8px;
  padding: 7px 8px;
  color: #e8f2ec;
  background: #07120c;
  font-size: 8px;
}

.censo-profit.positive {
  color: #67e9a1;
}

.censo-profit.negative {
  color: #eb9878;
}

@media (max-width: 420px) {
  .lab-header,
  .bank-header {
    align-items: flex-start;
  }

  .lab-hero {
    grid-template-columns: 1fr 1fr;
  }

  .lab-score-grid,
  .bank-kpi-grid {
    grid-template-columns: 1fr 1fr;
  }

  .lab-sample-note {
    align-items: flex-start;
    flex-direction: column;
  }

  .lab-sample-note p {
    text-align: left;
  }

  .stake-review-row {
    grid-template-columns: 1fr auto;
  }

  .stake-review-row button {
    grid-column: 1 / -1;
  }
}
'''
    style_path.write_text(
        css,
        encoding="utf-8"
    )
    print("[OK] CSS profesional LAB/BANK agregado")
else:
    print("[OK] CSS profesional ya estaba aplicado")


# =========================================================
# 5. TEST: NO DEFAULT STAKE
# =========================================================
test_path = FILES["tests"]
t = test_path.read_text(encoding="utf-8")

test_block = r'''

test('Units: stake ausente no se convierte en 1U', () => {
  assert.equal(
    normalizeStakeUnits(undefined, null),
    null
  );
});
'''

if "stake ausente no se convierte en 1U" not in t:
    t += test_block
    test_path.write_text(
        t,
        encoding="utf-8"
    )
    print("[OK] Test anti-default stake agregado")


# =========================================================
# FINAL
# =========================================================
print("")
print("============================================================")
print("v0.6.7 UI + STAKE INTEGRITY HOTFIX APLICADO")
print("============================================================")
print("")
print("Cambios:")
print("  ✓ LAB rediseñado con cards, Brier/Log Loss explicados")
print("  ✓ Calibration MODEL vs ACTUAL visual")
print("  ✓ Splits legibles por Trust/Tour/Surface/Side")
print("  ✓ BANK rediseñado con balance, ROI, DD y exposure")
print("  ✓ El Censo ya NO inventa 1U")
print("  ✓ Picks sospechosos v0.6.7 pasan a STAKE REVIEW")
print("  ✓ Puedes confirmar manualmente su stake desde BANK")
print("  ✓ La auditoría previa queda conservada")
print("")
print("Ahora ejecuta:")
print("  node --check src/engine/censo.js")
print("  node --check src/ui/labBank.js")
print("  node --check src/main.js")
print("  npm test")
print("  npm run build")
print("  npx cap sync android")
print("")
print("Esperado:")
print("  tests 44")
print("  pass 44")
print("  fail 0")
print("")
print("SI todo sale verde:")
print("  git status")
print("  git add src/engine/censo.js src/ui/labBank.js src/main.js src/style.css tests/wagerBank.test.js")
print('  git commit -m "v0.6.7 UI and Stake Integrity Hotfix"')
print("  git push origin main")
print("  gh run watch")
print("")
print(f"Backup local: {backup.name}")
