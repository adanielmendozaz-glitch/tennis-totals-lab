#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path.cwd()

REQUIRED = [
    ROOT / "package.json",
    ROOT / "src/main.js",
    ROOT / "src/engine/censo.js",
    ROOT / "src/style.css",
    ROOT / "tests/core.test.js",
]


def fail(message: str) -> None:
    print(f"\n[ERROR] {message}\n")
    sys.exit(1)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f"[OK] {label}: ya aplicado")
        return text
    if old not in text:
        fail(f"No encontré el patrón esperado: {label}")
    print(f"[OK] {label}")
    return text.replace(old, new, 1)


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


for path in REQUIRED:
    if not path.exists():
        fail(
            "Ejecuta este parche desde ~/tennis-totals-lab.\n"
            f"Falta: {path}"
        )

pkg_path = ROOT / "package.json"
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
version = str(pkg.get("version", ""))

if version not in {"0.6.6", "0.6.7"}:
    fail(
        f"Versión detectada: {version}. "
        "Este parche es para v0.6.6 -> v0.6.7."
    )

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = ROOT / f".v067-backup-{stamp}"

backup_files = [
    "package.json",
    "package-lock.json",
    "src/main.js",
    "src/style.css",
    "src/engine/censo.js",
]

for rel in backup_files:
    src = ROOT / rel
    if src.exists():
        dst = backup / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

print(f"[OK] Backup local: {backup.name}")

# =========================================================
# 1. VERSION
# =========================================================
pkg["version"] = "0.6.7"
pkg_path.write_text(
    json.dumps(pkg, indent=2, ensure_ascii=False) + "\n",
    encoding="utf-8"
)

lock_path = ROOT / "package-lock.json"
if lock_path.exists():
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    lock["version"] = "0.6.7"
    packages = lock.get("packages")
    if isinstance(packages, dict) and isinstance(packages.get(""), dict):
        packages[""]["version"] = "0.6.7"
    lock_path.write_text(
        json.dumps(lock, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8"
    )

print("[OK] package version -> 0.6.7")

# =========================================================
# 2. WAGER / UNITS ENGINE
# =========================================================
wager_js = r"""export const ALLOWED_STAKES = [
  0.25,
  0.50,
  0.75,
  1.00
];

export function normalizeStakeUnits(
  value,
  fallback = null
) {
  const n =
    Number(value);

  if (!Number.isFinite(n)) {
    return fallback;
  }

  const matched =
    ALLOWED_STAKES.find(
      stake =>
        Math.abs(
          stake - n
        ) < 0.0001
    );

  return matched ??
    fallback;
}

export function decimalOdds(
  odds,
  format = null
) {
  const n =
    Number(odds);

  if (!Number.isFinite(n)) {
    return null;
  }

  const upper =
    String(format || '')
      .toUpperCase();

  if (
    upper === 'DECIMAL' ||
    (
      !upper &&
      n > 1 &&
      n < 20
    )
  ) {
    return n > 1
      ? n
      : null;
  }

  if (
    upper === 'AMERICAN' ||
    n <= -100 ||
    n >= 100
  ) {
    if (n <= -100) {
      return (
        1 +
        100 /
        Math.abs(n)
      );
    }

    if (n >= 100) {
      return (
        1 +
        n / 100
      );
    }
  }

  return null;
}

export function profitUnitsFor({
  status,
  stakeUnits,
  odds,
  oddsFormat
}) {
  const stake =
    Number(stakeUnits);

  if (
    !Number.isFinite(stake) ||
    stake <= 0
  ) {
    return null;
  }

  if (status === 'LOSS') {
    return -stake;
  }

  if (status === 'PUSH') {
    return 0;
  }

  if (status !== 'WIN') {
    return null;
  }

  const decimal =
    decimalOdds(
      odds,
      oddsFormat
    );

  if (!decimal) {
    return null;
  }

  return (
    stake *
    (
      decimal - 1
    )
  );
}
"""
write(ROOT / "src/engine/wager.js", wager_js + "\n")
print("[OK] Wager/Units Engine creado")

# =========================================================
# 3. LAB FOUNDATION
# =========================================================
lab_js = r"""function clampProbability(value) {
  return Math.max(
    0.001,
    Math.min(
      0.999,
      Number(value || 0)
    )
  );
}

function round(value, digits = 3) {
  const factor =
    10 ** digits;

  return Math.round(
    Number(value || 0) *
    factor
  ) / factor;
}

export function labSampleStatus(n) {
  const count =
    Number(n || 0);

  if (count < 30) {
    return {
      code: 'VERY_LOW',
      label: 'VERY LOW SAMPLE'
    };
  }

  if (count < 100) {
    return {
      code: 'EARLY',
      label: 'EARLY SIGNAL'
    };
  }

  if (count < 200) {
    return {
      code: 'DEVELOPING',
      label: 'DEVELOPING'
    };
  }

  if (count < 500) {
    return {
      code: 'USEFUL',
      label: 'USEFUL SAMPLE'
    };
  }

  return {
    code: 'STRONGER',
    label: 'STRONGER EVIDENCE'
  };
}

export function brierScore(rows) {
  if (!rows.length) {
    return null;
  }

  const total =
    rows.reduce(
      (sum, row) => {
        const p =
          clampProbability(
            Number(row.modelPct) /
            100
          );

        const y =
          row.result?.status ===
          'WIN'
            ? 1
            : 0;

        return (
          sum +
          (
            p - y
          ) ** 2
        );
      },
      0
    );

  return round(
    total / rows.length,
    4
  );
}

export function logLoss(rows) {
  if (!rows.length) {
    return null;
  }

  const total =
    rows.reduce(
      (sum, row) => {
        const p =
          clampProbability(
            Number(row.modelPct) /
            100
          );

        const win =
          row.result?.status ===
          'WIN';

        return (
          sum -
          Math.log(
            win
              ? p
              : 1 - p
          )
        );
      },
      0
    );

  return round(
    total / rows.length,
    4
  );
}

function calibrationBucket(probabilityPct) {
  const p =
    Number(probabilityPct || 0);

  if (p < 55) return '50–54.9%';
  if (p < 60) return '55–59.9%';
  if (p < 65) return '60–64.9%';
  if (p < 70) return '65–69.9%';
  if (p < 75) return '70–74.9%';
  return '75%+';
}

export function calibrationBuckets(rows) {
  const map =
    new Map();

  for (const row of rows) {
    const key =
      calibrationBucket(
        row.modelPct
      );

    if (!map.has(key)) {
      map.set(
        key,
        {
          label: key,
          n: 0,
          probabilitySum: 0,
          wins: 0
        }
      );
    }

    const bucket =
      map.get(key);

    bucket.n++;
    bucket.probabilitySum +=
      Number(row.modelPct || 0);

    if (
      row.result?.status ===
      'WIN'
    ) {
      bucket.wins++;
    }
  }

  return [...map.values()]
    .map(bucket => ({
      label:
        bucket.label,
      n:
        bucket.n,
      modelAvgPct:
        round(
          bucket.probabilitySum /
          bucket.n,
          1
        ),
      actualPct:
        round(
          bucket.wins /
          bucket.n *
          100,
          1
        )
    }));
}

function groupRows(
  rows,
  keyFn
) {
  const map =
    new Map();

  for (const row of rows) {
    const key =
      keyFn(row) ||
      'UNKNOWN';

    if (!map.has(key)) {
      map.set(
        key,
        {
          key,
          wins: 0,
          losses: 0,
          n: 0
        }
      );
    }

    const group =
      map.get(key);

    group.n++;

    if (
      row.result?.status ===
      'WIN'
    ) {
      group.wins++;
    } else {
      group.losses++;
    }
  }

  return [...map.values()]
    .sort(
      (a, b) =>
        b.n - a.n ||
        String(a.key)
          .localeCompare(
            String(b.key)
          )
    )
    .map(group => ({
      ...group,
      hitRatePct:
        round(
          group.wins /
          group.n *
          100,
          1
        )
    }));
}

export function analyzeLab(entries) {
  const all =
    Array.isArray(entries)
      ? entries
      : [];

  const binary =
    all.filter(
      row =>
        ['WIN', 'LOSS'].includes(
          row.result?.status
        )
    );

  const wins =
    binary.filter(
      row =>
        row.result?.status ===
        'WIN'
    ).length;

  const losses =
    binary.length -
    wins;

  const pushes =
    all.filter(
      row =>
        row.result?.status ===
        'PUSH'
    ).length;

  const pending =
    all.filter(
      row =>
        row.result?.status ===
        'PENDING'
    ).length;

  const review =
    all.filter(
      row =>
        row.result?.status ===
        'REVIEW'
    ).length;

  return {
    total:
      all.length,
    settledBinary:
      binary.length,
    wins,
    losses,
    pushes,
    pending,
    review,
    hitRatePct:
      binary.length
        ? round(
            wins /
            binary.length *
            100,
            1
          )
        : null,
    brier:
      brierScore(binary),
    logLoss:
      logLoss(binary),
    sample:
      labSampleStatus(
        binary.length
      ),
    calibration:
      calibrationBuckets(
        binary
      ),
    byTour:
      groupRows(
        binary,
        row => row.tour
      ),
    bySurface:
      groupRows(
        binary,
        row => row.surface
      ),
    bySide:
      groupRows(
        binary,
        row => row.side
      ),
    byTrust:
      groupRows(
        binary,
        row =>
          row.dataTrustAudit
            ?.level ||
          'LEGACY'
      )
  };
}
"""
write(ROOT / "src/engine/lab.js", lab_js + "\n")
print("[OK] Lab Foundation creado")

# =========================================================
# 4. BANK FOUNDATION
# =========================================================
bank_js = r"""import {
  profitUnitsFor
} from './wager.js';

function round(value, digits = 2) {
  const factor =
    10 ** digits;

  return Math.round(
    Number(value || 0) *
    factor
  ) / factor;
}

function entryProfit(entry) {
  const storedRaw =
    entry.result?.profitUnits;

  if (
    storedRaw !== null &&
    storedRaw !== undefined &&
    Number.isFinite(
      Number(storedRaw)
    )
  ) {
    return Number(storedRaw);
  }

  return profitUnitsFor({
    status:
      entry.result?.status,
    stakeUnits:
      entry.stakeUnits,
    odds:
      entry.odds,
    oddsFormat:
      entry.oddsFormat
  });
}

export function analyzeBank(
  entries,
  settings = {}
) {
  const initialBankUnits =
    Number.isFinite(
      Number(
        settings.initialBankUnits
      )
    )
      ? Number(
          settings.initialBankUnits
        )
      : 100;

  const unitValue =
    Number.isFinite(
      Number(
        settings.unitValue
      )
    )
      ? Math.max(
          0,
          Number(
            settings.unitValue
          )
        )
      : 0;

  const validStake =
    (entries || [])
      .filter(
        entry =>
          Number.isFinite(
            Number(
              entry.stakeUnits
            )
          ) &&
          Number(
            entry.stakeUnits
          ) > 0
      );

  const settled =
    validStake.filter(
      entry =>
        ['WIN', 'LOSS', 'PUSH']
          .includes(
            entry.result?.status
          )
    );

  const pending =
    validStake.filter(
      entry =>
        entry.result?.status ===
        'PENDING'
    );

  const profitRows =
    settled
      .map(entry => ({
        entry,
        profit:
          entryProfit(entry)
      }))
      .filter(
        row =>
          Number.isFinite(
            Number(row.profit)
          )
      );

  const totalStaked =
    profitRows.reduce(
      (sum, row) =>
        sum +
        Number(
          row.entry.stakeUnits
        ),
      0
    );

  const profitUnits =
    profitRows.reduce(
      (sum, row) =>
        sum +
        Number(row.profit),
      0
    );

  const pendingExposure =
    pending.reduce(
      (sum, entry) =>
        sum +
        Number(
          entry.stakeUnits
        ),
      0
    );

  const chronological =
    [...profitRows]
      .sort(
        (a, b) =>
          new Date(
            a.entry.result?.settledAt ||
            a.entry.capturedAt ||
            0
          ) -
          new Date(
            b.entry.result?.settledAt ||
            b.entry.capturedAt ||
            0
          )
      );

  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;

  for (const row of chronological) {
    cumulative +=
      Number(row.profit);

    peak =
      Math.max(
        peak,
        cumulative
      );

    maxDrawdown =
      Math.max(
        maxDrawdown,
        peak - cumulative
      );
  }

  return {
    initialBankUnits:
      round(initialBankUnits),
    currentBankUnits:
      round(
        initialBankUnits +
        profitUnits
      ),
    unitValue:
      round(unitValue),
    stakedPicks:
      validStake.length,
    settledStakedPicks:
      profitRows.length,
    pendingStakedPicks:
      pending.length,
    totalStakedUnits:
      round(totalStaked),
    pendingExposureUnits:
      round(pendingExposure),
    profitUnits:
      round(profitUnits),
    roiPct:
      totalStaked > 0
        ? round(
            profitUnits /
            totalStaked *
            100,
            1
          )
        : null,
    maxDrawdownUnits:
      round(maxDrawdown),
    profitMoney:
      unitValue > 0
        ? round(
            profitUnits *
            unitValue
          )
        : null,
    currentBankMoney:
      unitValue > 0
        ? round(
            (
              initialBankUnits +
              profitUnits
            ) *
            unitValue
          )
        : null
  };
}
"""
write(ROOT / "src/engine/bank.js", bank_js + "\n")
print("[OK] Bank Foundation creado")

# =========================================================
# 5. LAB + BANK UI MODULE
# =========================================================
lab_bank_ui = r"""import {
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
"""
write(ROOT / "src/ui/labBank.js", lab_bank_ui + "\n")
print("[OK] LAB/BANK UI module creado")

# =========================================================
# 6. CENSO 2.0: STAKE + PROFIT
# =========================================================
censo_path = ROOT / "src/engine/censo.js"
s = censo_path.read_text(encoding="utf-8")

s = replace_once(
    s,
    """import {\n  getMarketReadiness\n} from './readiness.js';""",
    """import {\n  getMarketReadiness\n} from './readiness.js';\n\nimport {\n  normalizeStakeUnits,\n  profitUnitsFor\n} from './wager.js';""",
    "Censo importa Units Engine"
)

s = replace_once(
    s,
    """export function captureCenso(\n  match\n) {""",
    """export function captureCenso(\n  match,\n  options = {}\n) {""",
    "captureCenso acepta options"
)

s = replace_once(
    s,
    """  const decision =\n    match.marketDecision;""",
    """  const stakeUnits =\n    normalizeStakeUnits(\n      options.stakeUnits ?? 1,\n      null\n    );\n\n  if (!stakeUnits) {\n    return {\n      ok: false,\n      reason: 'INVALID_STAKE'\n    };\n  }\n\n  const decision =\n    match.marketDecision;""",
    "Censo valida stake units"
)

s = s.replace(
    "'0.6.6'",
    "'0.6.7'",
    1
)

s = replace_once(
    s,
    """    provider:\n      decision.provider ||\n      'UNKNOWN',\n\n    modelPct:""",
    """    provider:\n      decision.provider ||\n      'UNKNOWN',\n\n    stakeUnits,\n\n    modelPct:""",
    "Censo congela stakeUnits"
)

s = replace_once(
    s,
    """      settledAt: null,\n\n      note: null""",
    """      settledAt: null,\n\n      profitUnits: null,\n\n      note: null""",
    "Resultado pending incluye profitUnits"
)

s = replace_once(
    s,
    """        settledAt:\n          new Date().toISOString(),\n\n        note:\n          match.status ||""",
    """        settledAt:\n          new Date().toISOString(),\n\n        profitUnits: null,\n\n        note:\n          match.status ||""",
    "REVIEW no inventa profit"
)

s = replace_once(
    s,
    """        settledAt:\n          new Date().toISOString(),\n\n        note:\n          'Marcador final incompleto'""",
    """        settledAt:\n          new Date().toISOString(),\n\n        profitUnits: null,\n\n        note:\n          'Marcador final incompleto'""",
    "Marcador incompleto no inventa profit"
)

old_settle = """    entry.result = {\n      status:\n        settleResult(\n          entry.side,\n          entry.line,\n          games\n        ),\n\n      totalGames:\n        games,\n\n      settledAt:\n        new Date().toISOString(),\n\n      note: null\n    };"""

new_settle = """    const status =\n      settleResult(\n        entry.side,\n        entry.line,\n        games\n      );\n\n    entry.result = {\n      status,\n\n      totalGames:\n        games,\n\n      settledAt:\n        new Date().toISOString(),\n\n      profitUnits:\n        profitUnitsFor({\n          status,\n          stakeUnits:\n            entry.stakeUnits,\n          odds:\n            entry.odds,\n          oddsFormat:\n            entry.oddsFormat\n        }),\n\n      note: null\n    };"""

s = replace_once(
    s,
    old_settle,
    new_settle,
    "Settlement calcula P/L en unidades"
)

censo_path.write_text(s, encoding="utf-8")
print("[OK] Censo 2.0 Units + P/L")

# =========================================================
# 7. MAIN UI PATCH
# =========================================================
main_path = ROOT / "src/main.js"
s = main_path.read_text(encoding="utf-8")

s = replace_once(
    s,
    """import {\n  buildRanking\n} from './engine/ranking.js';""",
    """import {\n  buildRanking\n} from './engine/ranking.js';\n\nimport {\n  initLabBankUI,\n  renderLabBank\n} from './ui/labBank.js';""",
    "main importa Lab/Bank UI"
)

s = s.replace(
    "ATP + WTA · v0.6.6",
    "ATP + WTA · v0.6.7",
    1
)

s = replace_once(
    s,
    """const matchesEl = document.querySelector('#matches');""",
    """initLabBankUI();\n\nconst matchesEl = document.querySelector('#matches');""",
    "Lab/Bank UI se inicializa"
)

old_capture_button = """              <button\n                type=\"button\"\n                class=\"censo-capture-btn\"\n                data-censo-capture=\"${match.id}\"\n                ${\n                  hasCenso(match.id)\n                    ? 'disabled'\n                    : ''\n                }>\n                ${\n                  hasCenso(match.id)\n                    ? '✓ EN CENSO'\n                    : 'REGISTRAR CENSO'\n                }\n              </button>"""

new_capture_button = """              <div class=\"censo-unit-control\">\n                <label>\n                  <span>STAKE</span>\n                  <select\n                    data-censo-units\n                    ${\n                      hasCenso(match.id)\n                        ? 'disabled'\n                        : ''\n                    }>\n                    <option value=\"0.25\">0.25 U</option>\n                    <option value=\"0.5\">0.50 U</option>\n                    <option value=\"0.75\">0.75 U</option>\n                    <option value=\"1\" selected>1.00 U</option>\n                  </select>\n                </label>\n\n                <button\n                  type=\"button\"\n                  class=\"censo-capture-btn\"\n                  data-censo-capture=\"${match.id}\"\n                  ${\n                    hasCenso(match.id)\n                      ? 'disabled'\n                      : ''\n                  }>\n                  ${\n                    hasCenso(match.id)\n                      ? '✓ EN CENSO'\n                      : 'REGISTRAR CENSO'\n                  }\n                </button>\n              </div>"""

s = replace_once(
    s,
    old_capture_button,
    new_capture_button,
    "Market permite elegir 0.25–1.00U"
)

s = replace_once(
    s,
    """      <div class=\"censo-details\">\n\n        <span>\n          ${entry.recommendation}\n        </span>""",
    """      <div class=\"censo-details\">\n\n        <span>\n          ${entry.recommendation}\n        </span>\n\n        <span>\n          STAKE\n          <strong>\n            ${\n              Number.isFinite(\n                Number(entry.stakeUnits)\n              )\n                ? `${Number(entry.stakeUnits).toFixed(2)} U`\n                : 'LEGACY'\n            }\n          </strong>\n        </span>""",
    "Censo card muestra stake"
)

s = replace_once(
    s,
    """              ${\n                entry.result?.note\n                  ? `<span>${entry.result.note}</span>`\n                  : ''\n              }""",
    """              ${\n                entry.result?.profitUnits !== null &&\n                entry.result?.profitUnits !== undefined &&\n                Number.isFinite(\n                  Number(\n                    entry.result.profitUnits\n                  )\n                )\n                  ? `<span class=\"censo-profit ${Number(entry.result.profitUnits) >= 0 ? 'positive' : 'negative'}\">P/L ${Number(entry.result.profitUnits) >= 0 ? '+' : ''}${Number(entry.result.profitUnits).toFixed(2)} U</span>`\n                  : ''\n              }\n\n              ${\n                entry.result?.note\n                  ? `<span>${entry.result.note}</span>`\n                  : ''\n              }""",
    "Censo settlement muestra P/L Units"
)

s = replace_once(
    s,
    """function renderMatches() {\n  renderRanking();\n  renderCenso();""",
    """function renderMatches() {\n  renderRanking();\n  renderCenso();\n  renderLabBank();""",
    "Lab/Bank se refrescan con Censo"
)

old_capture_handler = """    const result =\n      captureCenso(\n        match\n      );"""

new_capture_handler = """    const marketBox =\n      button.closest(\n        '.market-box'\n      );\n\n    const units =\n      Number(\n        marketBox\n          ?.querySelector(\n            '[data-censo-units]'\n          )\n          ?.value ||\n        1\n      );\n\n    const result =\n      captureCenso(\n        match,\n        {\n          stakeUnits:\n            units\n        }\n      );"""

s = replace_once(
    s,
    old_capture_handler,
    new_capture_handler,
    "Capture handler envía stakeUnits"
)

s = replace_once(
    s,
    """      document.querySelector(viewMap[activeTab])\n        .classList.add('active');\n\n      document.querySelectorAll('[data-tab]')\n        .forEach(b => b.classList.remove('selected'));\n\n      button.classList.add('selected');\n    });""",
    """      document.querySelector(viewMap[activeTab])\n        .classList.add('active');\n\n      document.querySelectorAll('[data-tab]')\n        .forEach(b => b.classList.remove('selected'));\n\n      button.classList.add('selected');\n\n      if (\n        activeTab === 'lab' ||\n        activeTab === 'bank'\n      ) {\n        renderLabBank();\n      }\n    });""",
    "Tabs Lab/Bank render on demand"
)

main_path.write_text(s, encoding="utf-8")
print("[OK] main.js -> v0.6.7 Censo2/Lab/Bank")

# =========================================================
# 8. CSS
# =========================================================
style_path = ROOT / "src/style.css"
css = style_path.read_text(encoding="utf-8")

css_block = r"""
/* ========================================================
   v0.6.7 Censo 2.0 + Lab Foundation + Units
   ======================================================== */

.censo-unit-control {
  display: flex;
  align-items: end;
  gap: 10px;
  width: 100%;
}

.censo-unit-control label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 92px;
}

.censo-unit-control label span {
  font-size: 9px;
  letter-spacing: .06em;
  opacity: .55;
}

.censo-unit-control select {
  border: 1px solid rgba(117,238,176,.22);
  background: rgba(8,29,19,.92);
  color: #e9f4ee;
  border-radius: 9px;
  padding: 9px 8px;
  font-weight: 800;
}

.censo-profit {
  margin-left: 8px;
  font-weight: 900;
}

.censo-profit.positive {
  color: #75eeb0;
}

.censo-profit.negative {
  color: #e99b82;
}

.lab-view,
.bank-view {
  padding: 24px 26px 110px;
}

.lab-header,
.bank-header {
  display: flex;
  justify-content: space-between;
  align-items: end;
  margin-bottom: 22px;
}

.lab-header span,
.bank-header span,
.lab-section-head span {
  font-size: 11px;
  letter-spacing: .12em;
  color: #75eeb0;
  font-weight: 900;
}

.lab-header h2,
.bank-header h2 {
  margin: 5px 0 0;
  font-size: 34px;
}

.lab-header > strong,
.bank-header > strong {
  padding: 9px 11px;
  border-radius: 10px;
  background: rgba(22,85,55,.45);
  color: #75eeb0;
  font-size: 10px;
  letter-spacing: .05em;
}

.lab-header > strong.very_low,
.lab-header > strong.early {
  color: #dec86f;
  background: rgba(105,83,18,.30);
}

.lab-metrics,
.bank-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0,1fr));
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 16px;
  overflow: hidden;
  background: rgba(3,18,11,.78);
  margin-bottom: 12px;
}

.lab-metrics > div,
.bank-metrics > div {
  padding: 16px 12px;
  border-right: 1px solid rgba(255,255,255,.07);
}

.lab-metrics > div:last-child,
.bank-metrics > div:last-child {
  border-right: 0;
}

.lab-metrics span,
.bank-metrics span,
.bank-detail span {
  display: block;
  font-size: 9px;
  opacity: .55;
  margin-bottom: 6px;
}

.lab-metrics strong,
.bank-metrics strong {
  font-size: 19px;
}

.lab-metrics.secondary strong {
  font-size: 15px;
}

.lab-sample-note,
.bank-note {
  padding: 13px 14px;
  border: 1px solid rgba(222,200,111,.16);
  background: rgba(83,68,18,.14);
  border-radius: 12px;
  margin: 14px 0 18px;
}

.lab-sample-note strong,
.lab-sample-note span {
  display: block;
}

.lab-sample-note strong {
  color: #dec86f;
  font-size: 11px;
}

.lab-sample-note span,
.bank-note {
  margin-top: 5px;
  font-size: 11px;
  line-height: 1.45;
  opacity: .72;
}

.lab-section {
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 15px;
  overflow: hidden;
  margin-bottom: 14px;
  background: rgba(3,18,11,.72);
}

.lab-section-head {
  display: flex;
  justify-content: space-between;
  padding: 13px 14px;
  border-bottom: 1px solid rgba(255,255,255,.07);
}

.lab-section-head strong {
  font-size: 9px;
  opacity: .5;
}

.lab-calibration-row,
.lab-breakdown-row {
  display: grid;
  grid-template-columns: 1.2fr .6fr 1fr 1fr;
  gap: 8px;
  align-items: center;
  padding: 11px 14px;
  border-bottom: 1px solid rgba(255,255,255,.05);
  font-size: 10px;
}

.lab-calibration-row:last-child,
.lab-breakdown-row:last-child {
  border-bottom: 0;
}

.lab-calibration-row b,
.lab-breakdown-row b {
  color: #75eeb0;
  text-align: right;
}

.lab-empty-row {
  padding: 18px 14px;
  font-size: 11px;
  opacity: .55;
}

.bank-settings {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 10px;
  align-items: end;
  padding: 14px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 15px;
  background: rgba(3,18,11,.75);
  margin-bottom: 14px;
}

.bank-settings label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bank-settings label span {
  font-size: 9px;
  opacity: .55;
}

.bank-settings input {
  width: 100%;
  box-sizing: border-box;
  background: rgba(8,29,19,.95);
  color: #eef6f1;
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 9px;
  padding: 10px;
}

.bank-settings button {
  border: 1px solid rgba(117,238,176,.25);
  border-radius: 9px;
  padding: 11px 13px;
  background: rgba(22,85,55,.45);
  color: #75eeb0;
  font-weight: 900;
}

.bank-detail {
  display: grid;
  grid-template-columns: repeat(2, minmax(0,1fr));
  gap: 10px;
  margin-top: 14px;
}

.bank-detail > span {
  padding: 13px;
  border: 1px solid rgba(255,255,255,.07);
  border-radius: 12px;
  background: rgba(3,18,11,.70);
}

.bank-detail strong {
  display: block;
  margin-top: 4px;
  color: #eaf4ee;
  font-size: 14px;
}

@media (max-width: 560px) {
  .lab-view,
  .bank-view {
    padding-left: 20px;
    padding-right: 20px;
  }

  .lab-metrics,
  .bank-metrics {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

  .lab-metrics > div:nth-child(2),
  .bank-metrics > div:nth-child(2) {
    border-right: 0;
  }

  .bank-settings {
    grid-template-columns: 1fr 1fr;
  }

  .bank-settings button {
    grid-column: 1 / -1;
  }
}
"""

if "v0.6.7 Censo 2.0 + Lab Foundation + Units" not in css:
    css += "\n" + css_block + "\n"
    style_path.write_text(css, encoding="utf-8")
    print("[OK] CSS v0.6.7")

# =========================================================
# 9. TESTS
# =========================================================
lab_test = r"""import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeLab,
  brierScore,
  calibrationBuckets,
  labSampleStatus,
  logLoss
} from '../src/engine/lab.js';

function entry({
  status = 'WIN',
  modelPct = 62,
  tour = 'ATP',
  surface = 'HARD',
  side = 'OVER',
  trust = 'HIGH'
} = {}) {
  return {
    modelPct,
    tour,
    surface,
    side,
    dataTrustAudit: {
      level: trust
    },
    result: {
      status
    }
  };
}

test(
  'Lab: N<30 es VERY LOW SAMPLE',
  () => {
    assert.equal(
      labSampleStatus(12).code,
      'VERY_LOW'
    );
  }
);

test(
  'Lab: Brier de 62% WIN es correcto',
  () => {
    assert.equal(
      brierScore([
        entry({
          modelPct: 62,
          status: 'WIN'
        })
      ]),
      0.1444
    );
  }
);

test(
  'Lab: Log Loss de WIN es finito y positivo',
  () => {
    const value =
      logLoss([
        entry({
          modelPct: 62,
          status: 'WIN'
        })
      ]);

    assert.ok(
      value > 0 &&
      value < 1
    );
  }
);

test(
  'Lab: PUSH no entra a calibración binaria',
  () => {
    const lab =
      analyzeLab([
        entry({
          status: 'PUSH'
        })
      ]);

    assert.equal(
      lab.settledBinary,
      0
    );
    assert.equal(
      lab.pushes,
      1
    );
  }
);

test(
  'Lab: bucket 60-64.9 calcula model vs actual',
  () => {
    const rows = [
      entry({
        modelPct: 62,
        status: 'WIN'
      }),
      entry({
        modelPct: 64,
        status: 'LOSS'
      })
    ];

    const bucket =
      calibrationBuckets(rows)[0];

    assert.equal(
      bucket.label,
      '60–64.9%'
    );
    assert.equal(
      bucket.n,
      2
    );
    assert.equal(
      bucket.modelAvgPct,
      63
    );
    assert.equal(
      bucket.actualPct,
      50
    );
  }
);

test(
  'Lab: Data Trust se separa en grupos',
  () => {
    const lab =
      analyzeLab([
        entry({ trust: 'HIGH' }),
        entry({
          trust: 'CAUTION',
          status: 'LOSS'
        })
      ]);

    assert.equal(
      lab.byTrust.length,
      2
    );
  }
);
"""
write(ROOT / "tests/lab.test.js", lab_test + "\n")

wager_bank_test = r"""import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decimalOdds,
  normalizeStakeUnits,
  profitUnitsFor
} from '../src/engine/wager.js';

import {
  analyzeBank
} from '../src/engine/bank.js';

test(
  'Units: stake permitido 0.75',
  () => {
    assert.equal(
      normalizeStakeUnits(0.75),
      0.75
    );
  }
);

test(
  'Odds: decimal 1.80 permanece 1.80',
  () => {
    assert.equal(
      decimalOdds(1.8, 'DECIMAL'),
      1.8
    );
  }
);

test(
  'Odds: -110 convierte a decimal',
  () => {
    const value =
      decimalOdds(-110, 'AMERICAN');

    assert.ok(
      Math.abs(
        value -
        (1 + 100 / 110)
      ) < 1e-12
    );
  }
);

test(
  'Units: WIN 1U @1.80 = +0.80U',
  () => {
    assert.equal(
      profitUnitsFor({
        status: 'WIN',
        stakeUnits: 1,
        odds: 1.8,
        oddsFormat: 'DECIMAL'
      }),
      0.8
    );
  }
);

test(
  'Bank: ROI y drawdown se calculan con stakes reales',
  () => {
    const entries = [
      {
        stakeUnits: 1,
        odds: 2,
        oddsFormat: 'DECIMAL',
        capturedAt: '2026-08-01T10:00:00Z',
        result: {
          status: 'WIN',
          settledAt: '2026-08-01T12:00:00Z'
        }
      },
      {
        stakeUnits: 1,
        odds: 2,
        oddsFormat: 'DECIMAL',
        capturedAt: '2026-08-02T10:00:00Z',
        result: {
          status: 'LOSS',
          settledAt: '2026-08-02T12:00:00Z'
        }
      }
    ];

    const bank =
      analyzeBank(
        entries,
        {
          initialBankUnits: 100
        }
      );

    assert.equal(
      bank.profitUnits,
      0
    );
    assert.equal(
      bank.roiPct,
      0
    );
    assert.equal(
      bank.maxDrawdownUnits,
      1
    );
    assert.equal(
      bank.currentBankUnits,
      100
    );
  }
);
"""
write(ROOT / "tests/wagerBank.test.js", wager_bank_test + "\n")
print("[OK] 11 tests nuevos Lab/Units/Bank")

# =========================================================
# FINAL
# =========================================================
print(
    "\n"
    "============================================================\n"
    "Tennis Totals Lab v0.6.7 aplicado.\n"
    "Censo 2.0 + Lab Foundation + Units + Bank Foundation\n"
    "============================================================\n"
    "\n"
    "Novedades:\n"
    "  - Stake manual 0.25 / 0.50 / 0.75 / 1.00 U al censar.\n"
    "  - Censo congela stake y calcula P/L al liquidar.\n"
    "  - Picks legacy sin stake NO reciben unidades inventadas.\n"
    "  - LAB activo: W-L, Hit Rate, Brier, Log Loss.\n"
    "  - Calibration buckets MODEL vs ACTUAL.\n"
    "  - Splits por Trust, ATP/WTA, superficie y Over/Under.\n"
    "  - BANK Foundation: bank en U, ROI, P/L, DD, exposure.\n"
    "  - Valor monetario de 1U es opcional.\n"
    "\n"
    "Ahora ejecuta:\n"
    "  node --check src/engine/wager.js\n"
    "  node --check src/engine/lab.js\n"
    "  node --check src/engine/bank.js\n"
    "  node --check src/ui/labBank.js\n"
    "  node --check src/engine/censo.js\n"
    "  node --check src/main.js\n"
    "  npm test\n"
    "  npm run build\n"
    "  npx cap sync android\n"
    "\n"
    "Esperado si todo sale bien:\n"
    "  tests 43\n"
    "  pass 43\n"
    "  fail 0\n"
    "\n"
    "SI Y SOLO SI sale verde:\n"
    "  git status\n"
    "  git add package.json package-lock.json src tests\n"
    '  git commit -m "v0.6.7 Censo 2 Lab Foundation and Units"\n'
    "  git push origin main\n"
    "  gh run watch\n"
    "\n"
    f"Backup local: {backup.name}\n"
)
