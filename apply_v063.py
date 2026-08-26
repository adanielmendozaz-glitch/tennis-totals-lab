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
    ROOT / "src/data/espnOdds.js",
    ROOT / "src/engine/market.js",
    ROOT / "src/engine/censo.js",
    ROOT / "src/engine/ranking.js",
    ROOT / ".github/workflows/android-debug.yml",
]

def fail(message: str) -> None:
    print(f"\n[ERROR] {message}\n")
    sys.exit(1)

def replace_once(path: Path, old: str, new: str, label: str) -> bool:
    text = path.read_text(encoding="utf-8")
    if new in text:
        print(f"[OK] {label}: ya aplicado")
        return False
    if old not in text:
        fail(f"No encontré el patrón esperado para: {label}\nArchivo: {path}")
    text = text.replace(old, new, 1)
    path.write_text(text, encoding="utf-8")
    print(f"[OK] {label}")
    return True

def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)

for path in REQUIRED:
    if not path.exists():
        fail(
            "Ejecuta este script desde la raíz de tennis-totals-lab.\n"
            f"Falta: {path.relative_to(ROOT) if path.is_absolute() else path}"
        )

pkg_path = ROOT / "package.json"
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
current_version = str(pkg.get("version", ""))

if current_version not in {"0.6.2", "0.6.3"}:
    fail(
        f"Versión inesperada: {current_version}. "
        "Este parche fue preparado para v0.6.2 -> v0.6.3."
    )

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = ROOT / f".v063-backup-{stamp}"
ensure_dir(backup)

backup_files = [
    "package.json",
    "package-lock.json",
    "src/main.js",
    "src/data/espnOdds.js",
    "src/engine/market.js",
    "src/engine/censo.js",
    "src/engine/ranking.js",
    ".github/workflows/android-debug.yml",
]

for rel in backup_files:
    src = ROOT / rel
    if src.exists():
        dst = backup / rel
        ensure_dir(dst.parent)
        shutil.copy2(src, dst)

print(f"[OK] Backup: {backup.name}")

# ---------------------------------------------------------------------
# package.json + package-lock
# ---------------------------------------------------------------------
pkg["version"] = "0.6.3"
scripts = pkg.setdefault("scripts", {})
scripts["test"] = "node --test tests/*.test.js"
pkg_path.write_text(json.dumps(pkg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print("[OK] package.json -> 0.6.3 + npm test")

lock_path = ROOT / "package-lock.json"
if lock_path.exists():
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    lock["version"] = "0.6.3"
    packages = lock.get("packages")
    if isinstance(packages, dict) and isinstance(packages.get(""), dict):
        packages[""]["version"] = "0.6.3"
    lock_path.write_text(json.dumps(lock, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("[OK] package-lock.json -> 0.6.3")

# ---------------------------------------------------------------------
# main.js: cambios seguros y localizados
# ---------------------------------------------------------------------
main_path = ROOT / "src/main.js"
main = main_path.read_text(encoding="utf-8")

if "import './v063-ui.js';" not in main:
    anchor = "import './style.css';\n"
    if anchor not in main:
        fail("No encontré el import de style.css en src/main.js")
    main = main.replace(anchor, anchor + "import './v063-ui.js';\n", 1)

main = main.replace("ATP + WTA · v0.6.2", "ATP + WTA · v0.6.3")
main = main.replace("<strong>80K ENS</strong>", "<strong>100K ENS</strong>")
main = main.replace(
    "30K Markov + 30K Bayes + 20K Elo",
    "40K Markov + 40K Bayes + 20K Elo"
)
main_path.write_text(main, encoding="utf-8")
print("[OK] main.js: v0.6.3 + 100K real + addon audit UI")

# ---------------------------------------------------------------------
# ranking bug: ESPN entrega match.date, no match.startDate
# ---------------------------------------------------------------------
replace_once(
    ROOT / "src/engine/ranking.js",
    "startDate:\n      match.startDate,",
    "startDate:\n      match.date,",
    "Ranking usa match.date"
)

# ---------------------------------------------------------------------
# Exponer funciones puras para tests
# ---------------------------------------------------------------------
market_path = ROOT / "src/engine/market.js"
market_text = market_path.read_text(encoding="utf-8")
if "export function parseOdds(" not in market_text:
    if "function parseOdds(" not in market_text:
        fail("No encontré parseOdds en market.js")
    market_text = market_text.replace(
        "function parseOdds(",
        "export function parseOdds(",
        1
    )
    market_path.write_text(market_text, encoding="utf-8")
print("[OK] market.js: parseOdds testeable")

censo_path = ROOT / "src/engine/censo.js"
censo_text = censo_path.read_text(encoding="utf-8")
if "export function settleResult(" not in censo_text:
    if "function settleResult(" not in censo_text:
        fail("No encontré settleResult en censo.js")
    censo_text = censo_text.replace(
        "function settleResult(",
        "export function settleResult(",
        1
    )

# Auditoría congelada: guardar versión/modelo/pesos/muestras.
if "appVersion:" not in censo_text:
    anchor = "  const entry = {\n"
    if anchor not in censo_text:
        fail("No encontré 'const entry' en censo.js")
    audit_fields = """  const entry = {
    appVersion:
      '0.6.3',

    modelVersion:
      match.totals?.version ??
      null,

    modelWeights: {
      structural:
        match.totals?.weights?.structural ??
        null,

      bayesian:
        match.totals?.weights?.bayesian ??
        null,

      elo:
        match.totals?.weights?.elo ??
        null
    },

    surfaceAudit: {
      source:
        match.surfaceMeta?.source ??
        null,

      confidencePct:
        match.surfaceMeta?.confidencePct ??
        null,

      sampleA:
        match.playerA?.profile?.sample ??
        null,

      sampleB:
        match.playerB?.profile?.sample ??
        null
    },

    marketObservedAt:
      match.marketObservedAt ??
      null,

"""
    censo_text = censo_text.replace(anchor, audit_fields, 1)

censo_path.write_text(censo_text, encoding="utf-8")
print("[OK] censo.js: settlement testeable + snapshot de versión/modelo")

# ---------------------------------------------------------------------
# ESPN Odds v0.6.3: distingue NO MARKET / PARSE ERROR / ODDS ERROR
# Mantiene la misma API: getMatchMarkets(match) -> array.
# ---------------------------------------------------------------------
espn_odds = r"""import {
  CapacitorHttp
} from '@capacitor/core';

const CORE =
  'https://sports.core.api.espn.com/v2/sports/tennis/leagues';

const diagnostics =
  new Map();

function diagnosticId(matchOrId) {
  if (
    matchOrId &&
    typeof matchOrId === 'object'
  ) {
    return String(
      matchOrId.id || ''
    );
  }

  return String(
    matchOrId || ''
  );
}

function setDiagnostic(
  match,
  status,
  message,
  extra = {}
) {
  const observedAt =
    new Date().toISOString();

  const diagnostic = {
    status,
    message,
    observedAt,
    ...extra
  };

  const id =
    diagnosticId(match);

  if (id) {
    diagnostics.set(
      id,
      diagnostic
    );
  }

  if (
    match &&
    typeof match === 'object'
  ) {
    match.marketDiagnostic =
      diagnostic;

    match.marketObservedAt =
      observedAt;
  }

  return diagnostic;
}

export function getMarketDiagnostic(
  matchOrId
) {
  return (
    diagnostics.get(
      diagnosticId(
        matchOrId
      )
    ) ||
    null
  );
}

async function requestJson(url) {
  try {
    const response =
      await CapacitorHttp.get({
        url,
        headers: {
          Accept: 'application/json'
        }
      });

    if (
      response.status < 200 ||
      response.status >= 300
    ) {
      throw new Error(
        `ESPN ODDS HTTP ${response.status}`
      );
    }

    if (
      typeof response.data === 'string'
    ) {
      return JSON.parse(
        response.data
      );
    }

    return response.data;

  } catch (nativeError) {
    const response =
      await fetch(url);

    if (!response.ok) {
      throw nativeError;
    }

    return response.json();
  }
}

function leagueSlug(tour) {
  return tour === 'WTA'
    ? 'wta'
    : 'atp';
}

async function dereference(item) {
  if (
    item?.provider ||
    !item?.$ref
  ) {
    return item;
  }

  try {
    const url =
      String(item.$ref)
        .replace(
          /^http:/,
          'https:'
        )
        .replace(
          'sports.core.api.espn.pvt',
          'sports.core.api.espn.com'
        );

    return await requestJson(url);

  } catch {
    return item;
  }
}

function validTotal(value) {
  const n =
    Number(value);

  return (
    Number.isFinite(n) &&
    n >= 10.5 &&
    n <= 60.5
  );
}

function normalizeOdds(item) {
  const total =
    Number(
      item?.overUnder
    );

  if (!validTotal(total)) {
    return null;
  }

  return {
    provider:
      item?.provider?.name ||
      item?.provider?.displayName ||
      'ESPN',

    line:
      total,

    overOdds:
      Number(
        item?.overOdds ||
        item?.over?.odds ||
        item?.over?.moneyLine
      ) || null,

    underOdds:
      Number(
        item?.underOdds ||
        item?.under?.odds ||
        item?.under?.moneyLine
      ) || null,

    source:
      'ESPN_CORE'
  };
}

function hasRawTotal(item) {
  return (
    item?.overUnder !== null &&
    item?.overUnder !== undefined &&
    String(
      item.overUnder
    ).trim() !== ''
  );
}

export async function getMatchMarkets(
  match
) {
  if (
    !match?.id ||
    !['ATP', 'WTA'].includes(
      match?.tour
    )
  ) {
    setDiagnostic(
      match,
      'INVALID_REQUEST',
      'Partido sin identificador ATP/WTA válido.'
    );

    return [];
  }

  const league =
    leagueSlug(
      match.tour
    );

  const eventId =
    String(
      match.tournamentId || ''
    );

  const competitionId =
    String(
      match.id || ''
    );

  if (
    !eventId ||
    !competitionId
  ) {
    setDiagnostic(
      match,
      'INVALID_REQUEST',
      'ESPN no entregó eventId/competitionId.'
    );

    return [];
  }

  const url =
    `${CORE}/${league}/events/${eventId}/competitions/${competitionId}/odds`;

  try {
    const payload =
      await requestJson(url);

    const items =
      Array.isArray(
        payload?.items
      )
        ? payload.items
        : [];

    if (!items.length) {
      setDiagnostic(
        match,
        'NO_MARKET',
        'ESPN respondió correctamente, pero no publicó mercado O/U.',
        {
          received: 0,
          parsed: 0
        }
      );

      return [];
    }

    const resolved =
      await Promise.all(
        items.map(
          dereference
        )
      );

    const markets =
      resolved
        .map(
          normalizeOdds
        )
        .filter(Boolean);

    if (markets.length) {
      setDiagnostic(
        match,
        'OK',
        'Mercado O/U utilizable.',
        {
          received:
            items.length,

          parsed:
            markets.length
        }
      );

      return markets;
    }

    const rawTotals =
      resolved.filter(
        hasRawTotal
      ).length;

    if (rawTotals > 0) {
      setDiagnostic(
        match,
        'PARSE_ERROR',
        'ESPN publicó un total, pero el formato no pasó la validación.',
        {
          received:
            items.length,

          rawTotals,

          parsed: 0
        }
      );
    } else {
      setDiagnostic(
        match,
        'NO_MARKET',
        'ESPN respondió, pero no publicó un total O/U para este partido.',
        {
          received:
            items.length,

          rawTotals: 0,

          parsed: 0
        }
      );
    }

    return [];

  } catch (error) {
    setDiagnostic(
      match,
      'ODDS_ERROR',
      error?.message ||
      'No fue posible consultar ESPN Odds.',
      {
        received: 0,
        parsed: 0
      }
    );

    return [];
  }
}
"""
(ROOT / "src/data/espnOdds.js").write_text(espn_odds + "\n", encoding="utf-8")
print("[OK] espnOdds.js: diagnósticos de mercado")

# ---------------------------------------------------------------------
# Addon UI: diagnóstico de odds + editar/borrar mercado manual
# ---------------------------------------------------------------------
v063_ui = r"""import {
  getMarketDiagnostic
} from './data/espnOdds.js';

const MANUAL_KEY =
  'tennis_totals_lab_manual_markets_v1';

let selectedMatchId =
  null;

let scheduled =
  false;

function readManualMarkets() {
  try {
    return JSON.parse(
      localStorage.getItem(
        MANUAL_KEY
      ) || '{}'
    );
  } catch {
    return {};
  }
}

function writeManualMarkets(store) {
  localStorage.setItem(
    MANUAL_KEY,
    JSON.stringify(store)
  );
}

function finiteOrNull(value) {
  const text =
    String(
      value ?? ''
    ).trim();

  if (!text) {
    return null;
  }

  const n =
    Number(text);

  return Number.isFinite(n)
    ? n
    : null;
}

function validOdds(value) {
  if (value === null) {
    return true;
  }

  return (
    (
      value > 1 &&
      value < 20
    ) ||
    value <= -100 ||
    value >= 100
  );
}

function escapeAttr(value) {
  return String(
    value ?? ''
  )
    .replace(
      /&/g,
      '&amp;'
    )
    .replace(
      /"/g,
      '&quot;'
    )
    .replace(
      /</g,
      '&lt;'
    )
    .replace(
      />/g,
      '&gt;'
    );
}

function ensureStyles() {
  if (
    document.querySelector(
      '#v063AuditStyles'
    )
  ) {
    return;
  }

  const style =
    document.createElement(
      'style'
    );

  style.id =
    'v063AuditStyles';

  style.textContent = `
    .v063-market-diagnostic {
      padding: 12px 20px 0;
      font-size: 12px;
      opacity: .78;
      line-height: 1.45;
    }

    .v063-manual-actions {
      display: flex;
      gap: 10px;
      padding: 14px 20px 18px;
      border-top: 1px solid rgba(255,255,255,.07);
    }

    .v063-manual-actions button,
    .v063-manual-editor button {
      appearance: none;
      border: 1px solid rgba(103, 232, 168, .25);
      background: rgba(19, 74, 48, .45);
      color: #8df0b8;
      border-radius: 10px;
      padding: 10px 12px;
      font-weight: 800;
      font-size: 11px;
    }

    .v063-manual-actions button[data-v063-delete] {
      color: #efaa94;
      border-color: rgba(239, 170, 148, .22);
      background: rgba(95, 35, 25, .28);
    }

    .v063-manual-editor {
      margin: 0 20px 18px;
      padding: 14px;
      border: 1px solid rgba(103, 232, 168, .18);
      border-radius: 12px;
      background: rgba(4, 19, 12, .72);
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .v063-manual-editor label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 10px;
      opacity: .9;
    }

    .v063-manual-editor input {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid rgba(255,255,255,.12);
      background: #0b1b13;
      color: #f2f7f4;
      border-radius: 9px;
      padding: 10px;
      font-size: 14px;
    }

    .v063-manual-editor button {
      grid-column: 1 / -1;
    }
  `;

  document.head.appendChild(
    style
  );
}

function patchDiagnostic() {
  if (!selectedMatchId) {
    return;
  }

  const overlay =
    document.querySelector(
      '#matchDetailOverlay'
    );

  if (
    !overlay ||
    overlay.classList.contains(
      'hidden'
    )
  ) {
    return;
  }

  const status =
    overlay.querySelector(
      '.market-status.no-market'
    );

  if (!status) {
    return;
  }

  const diagnostic =
    getMarketDiagnostic(
      selectedMatchId
    );

  if (!diagnostic) {
    return;
  }

  if (
    diagnostic.status ===
    'ODDS_ERROR'
  ) {
    status.textContent =
      'ODDS ERROR';
  } else if (
    diagnostic.status ===
    'PARSE_ERROR'
  ) {
    status.textContent =
      'PARSE ERROR';
  } else if (
    diagnostic.status ===
    'NO_MARKET'
  ) {
    status.textContent =
      'NO MARKET';
  }

  const box =
    status.closest(
      '.market-box'
    );

  if (!box) {
    return;
  }

  let note =
    box.querySelector(
      '.v063-market-diagnostic'
    );

  if (!note) {
    note =
      document.createElement(
        'div'
      );

    note.className =
      'v063-market-diagnostic';

    box.appendChild(
      note
    );
  }

  note.textContent =
    `AUDIT · ${diagnostic.message}`;
}

function patchManualActions() {
  if (!selectedMatchId) {
    return;
  }

  const overlay =
    document.querySelector(
      '#matchDetailOverlay'
    );

  if (
    !overlay ||
    overlay.classList.contains(
      'hidden'
    )
  ) {
    return;
  }

  const manual =
    readManualMarkets()[
      String(
        selectedMatchId
      )
    ];

  if (!manual) {
    return;
  }

  const boxes =
    [
      ...overlay.querySelectorAll(
        '.market-box'
      )
    ];

  const box =
    boxes.find(item =>
      item.querySelector(
        '.market-box-head span'
      )?.textContent
        ?.toUpperCase()
        .includes(
          'MANUAL'
        )
    );

  if (
    !box ||
    box.querySelector(
      '.v063-manual-actions'
    )
  ) {
    return;
  }

  const actions =
    document.createElement(
      'div'
    );

  actions.className =
    'v063-manual-actions';

  actions.innerHTML = `
    <button
      type="button"
      data-v063-edit>
      EDITAR MERCADO
    </button>

    <button
      type="button"
      data-v063-delete>
      BORRAR MANUAL
    </button>
  `;

  box.appendChild(
    actions
  );
}

function patch() {
  scheduled =
    false;

  ensureStyles();
  patchDiagnostic();
  patchManualActions();
}

function schedulePatch() {
  if (scheduled) {
    return;
  }

  scheduled =
    true;

  requestAnimationFrame(
    patch
  );
}

document.addEventListener(
  'click',
  event => {
    const opener =
      event.target.closest(
        '[data-open-match]'
      );

    if (opener) {
      selectedMatchId =
        opener.getAttribute(
          'data-open-match'
        );

      schedulePatch();
      return;
    }

    if (
      event.target.closest(
        '[data-close-detail]'
      )
    ) {
      selectedMatchId =
        null;

      return;
    }

    const edit =
      event.target.closest(
        '[data-v063-edit]'
      );

    if (edit) {
      const store =
        readManualMarkets();

      const market =
        store[
          String(
            selectedMatchId
          )
        ];

      if (!market) {
        return;
      }

      const box =
        edit.closest(
          '.market-box'
        );

      if (
        !box ||
        box.querySelector(
          '.v063-manual-editor'
        )
      ) {
        return;
      }

      const editor =
        document.createElement(
          'div'
        );

      editor.className =
        'v063-manual-editor';

      editor.innerHTML = `
        <label>
          LINE
          <input
            data-v063-line
            inputmode="decimal"
            type="number"
            step="0.5"
            value="${escapeAttr(market.line)}"
          />
        </label>

        <label>
          OVER
          <input
            data-v063-over
            inputmode="decimal"
            type="number"
            step="0.01"
            value="${escapeAttr(market.overOdds ?? '')}"
          />
        </label>

        <label>
          UNDER
          <input
            data-v063-under
            inputmode="decimal"
            type="number"
            step="0.01"
            value="${escapeAttr(market.underOdds ?? '')}"
          />
        </label>

        <button
          type="button"
          data-v063-save>
          GUARDAR Y RECALCULAR
        </button>
      `;

      box.appendChild(
        editor
      );

      return;
    }

    const remove =
      event.target.closest(
        '[data-v063-delete]'
      );

    if (remove) {
      if (!selectedMatchId) {
        return;
      }

      const store =
        readManualMarkets();

      delete store[
        String(
          selectedMatchId
        )
      ];

      writeManualMarkets(
        store
      );

      location.reload();
      return;
    }

    const save =
      event.target.closest(
        '[data-v063-save]'
      );

    if (save) {
      if (!selectedMatchId) {
        return;
      }

      const editor =
        save.closest(
          '.v063-manual-editor'
        );

      const line =
        finiteOrNull(
          editor?.querySelector(
            '[data-v063-line]'
          )?.value
        );

      const overOdds =
        finiteOrNull(
          editor?.querySelector(
            '[data-v063-over]'
          )?.value
        );

      const underOdds =
        finiteOrNull(
          editor?.querySelector(
            '[data-v063-under]'
          )?.value
        );

      if (
        line === null ||
        line < 10.5 ||
        line > 60.5
      ) {
        alert(
          'Línea O/U inválida.'
        );

        return;
      }

      if (
        !validOdds(overOdds) ||
        !validOdds(underOdds)
      ) {
        alert(
          'Momio inválido. Usa decimal (ej. 1.80) o americano (ej. -110 / +105).'
        );

        return;
      }

      if (
        overOdds === null &&
        underOdds === null
      ) {
        alert(
          'Captura al menos un precio.'
        );

        return;
      }

      const store =
        readManualMarkets();

      store[
        String(
          selectedMatchId
        )
      ] = {
        provider:
          'MANUAL',

        source:
          'MANUAL',

        line,
        overOdds,
        underOdds
      };

      writeManualMarkets(
        store
      );

      location.reload();
    }
  },
  true
);

new MutationObserver(
  schedulePatch
).observe(
  document.documentElement,
  {
    childList: true,
    subtree: true
  }
);

if (
  document.readyState ===
  'loading'
) {
  document.addEventListener(
    'DOMContentLoaded',
    schedulePatch,
    {
      once: true
    }
  );
} else {
  schedulePatch();
}
"""
(ROOT / "src/v063-ui.js").write_text(v063_ui + "\n", encoding="utf-8")
print("[OK] src/v063-ui.js: manual edit/delete + odds diagnostic UI")

# ---------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------
tests_dir = ROOT / "tests"
ensure_dir(tests_dir)

tests = r"""import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseOdds
} from '../src/engine/market.js';

import {
  inferBestOf
} from '../src/engine/montecarlo.js';

import {
  settleResult
} from '../src/engine/censo.js';

test(
  'decimal 1.80 -> break-even y americano correctos',
  () => {
    const price =
      parseOdds(1.80);

    assert.equal(
      price.format,
      'DECIMAL'
    );

    assert.ok(
      Math.abs(
        price.probability -
        1 / 1.8
      ) < 1e-12
    );

    assert.equal(
      price.american,
      -125
    );
  }
);

test(
  'americano -110 -> decimal y break-even correctos',
  () => {
    const price =
      parseOdds(-110);

    assert.equal(
      price.format,
      'AMERICAN'
    );

    assert.ok(
      Math.abs(
        price.probability -
        110 / 210
      ) < 1e-12
    );

    assert.ok(
      Math.abs(
        price.decimal -
        (1 + 100 / 110)
      ) < 1e-12
    );
  }
);

test(
  'settlement OVER/UNDER/PUSH',
  () => {
    assert.equal(
      settleResult(
        'OVER',
        20.5,
        21
      ),
      'WIN'
    );

    assert.equal(
      settleResult(
        'UNDER',
        20.5,
        21
      ),
      'LOSS'
    );

    assert.equal(
      settleResult(
        'OVER',
        20,
        20
      ),
      'PUSH'
    );
  }
);

test(
  'ATP US Open main draw es BO5',
  () => {
    assert.equal(
      inferBestOf({
        tour: 'ATP',
        tournament: 'US Open',
        round: 'Round 1',
        type: 'Singles'
      }),
      5
    );
  }
);

test(
  'US Open qualifying sigue BO3',
  () => {
    assert.equal(
      inferBestOf({
        tour: 'ATP',
        tournament: 'US Open',
        round: 'Qualifying 1st Round',
        type: 'Singles'
      }),
      3
    );
  }
);

test(
  'WTA permanece BO3',
  () => {
    assert.equal(
      inferBestOf({
        tour: 'WTA',
        tournament: 'US Open',
        round: 'Round 1',
        type: 'Singles'
      }),
      3
    );
  }
);
"""
(tests_dir / "core.test.js").write_text(tests + "\n", encoding="utf-8")
print("[OK] tests/core.test.js: smoke/regression tests")

# ---------------------------------------------------------------------
# GitHub Actions: test antes de compilar APK
# ---------------------------------------------------------------------
workflow_path = ROOT / ".github/workflows/android-debug.yml"
workflow = workflow_path.read_text(encoding="utf-8")

if "name: Run audit tests" not in workflow:
    anchor = """      - name: Install dependencies
        run: npm ci

"""
    insertion = """      - name: Install dependencies
        run: npm ci

      - name: Run audit tests
        run: npm test

"""
    if anchor not in workflow:
        fail("No encontré el paso npm ci en android-debug.yml")
    workflow = workflow.replace(anchor, insertion, 1)
    workflow_path.write_text(workflow, encoding="utf-8")

print("[OK] GitHub Actions ejecutará npm test")

print(
    "\n"
    "============================================================\n"
    "Tennis Totals Lab v0.6.3 Audit & Anti-Glitch aplicado.\n"
    "============================================================\n"
    "\n"
    "Ahora ejecuta:\n"
    "  npm test\n"
    "  npm run build\n"
    "  npx cap sync android\n"
    "\n"
    "Si todo sale OK:\n"
    "  git status\n"
    "  git add .\n"
    '  git commit -m "v0.6.3 Audit and Anti-Glitch"\n'
    "  git push\n"
    "\n"
    f"Backup local: {backup.name}\n"
)

