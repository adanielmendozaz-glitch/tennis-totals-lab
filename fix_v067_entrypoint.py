#!/usr/bin/env python3
from pathlib import Path
import json
import shutil
import sys
from datetime import datetime

ROOT = Path.cwd()
MAIN = ROOT / "src/main.js"
PKG = ROOT / "package.json"

if not MAIN.exists() or not PKG.exists():
    print("[ERROR] Ejecuta desde ~/tennis-totals-lab")
    sys.exit(1)

pkg = json.loads(PKG.read_text(encoding="utf-8"))
if str(pkg.get("version")) != "0.6.7":
    print(f"[ERROR] package.json no está en 0.6.7: {pkg.get('version')}")
    sys.exit(1)

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup = ROOT / f".v067-entrypoint-backup-{stamp}"
backup.mkdir(parents=True, exist_ok=True)
shutil.copy2(MAIN, backup / "main.js")

s = MAIN.read_text(encoding="utf-8")

def replace_once(old, new, label):
    global s
    if new in s:
        print(f"[OK] {label}: ya aplicado")
        return
    if old not in s:
        print(f"[ERROR] No encontré patrón: {label}")
        sys.exit(1)
    s = s.replace(old, new, 1)
    print(f"[OK] {label}")

# Import LAB/BANK UI
replace_once(
    """import {
  buildRanking
} from './engine/ranking.js';""",
    """import {
  buildRanking
} from './engine/ranking.js';

import {
  initLabBankUI,
  renderLabBank
} from './ui/labBank.js';""",
    "import Lab/Bank UI"
)

# Visible version
if "ATP + WTA · v0.6.6" in s:
    s = s.replace("ATP + WTA · v0.6.6", "ATP + WTA · v0.6.7", 1)
    print("[OK] versión visible -> v0.6.7")

# Initialize after app.innerHTML exists
replace_once(
    """const matchesEl = document.querySelector('#matches');""",
    """initLabBankUI();

const matchesEl = document.querySelector('#matches');""",
    "init Lab/Bank UI"
)

# Refresh with Censo
replace_once(
    """function renderMatches() {
  renderRanking();
  renderCenso();""",
    """function renderMatches() {
  renderRanking();
  renderCenso();
  renderLabBank();""",
    "refresh Lab/Bank"
)

# Stake selector
replace_once(
    """              <button
                type="button"
                class="censo-capture-btn"
                data-censo-capture="${match.id}"
                ${
                  hasCenso(match.id)
                    ? 'disabled'
                    : ''
                }>
                ${
                  hasCenso(match.id)
                    ? '✓ EN CENSO'
                    : 'REGISTRAR CENSO'
                }
              </button>""",
    """              <div class="censo-unit-control">
                <label>
                  <span>STAKE</span>
                  <select
                    data-censo-units
                    ${
                      hasCenso(match.id)
                        ? 'disabled'
                        : ''
                    }>
                    <option value="0.25">0.25 U</option>
                    <option value="0.5">0.50 U</option>
                    <option value="0.75">0.75 U</option>
                    <option value="1" selected>1.00 U</option>
                  </select>
                </label>

                <button
                  type="button"
                  class="censo-capture-btn"
                  data-censo-capture="${match.id}"
                  ${
                    hasCenso(match.id)
                      ? 'disabled'
                      : ''
                  }>
                  ${
                    hasCenso(match.id)
                      ? '✓ EN CENSO'
                      : 'REGISTRAR CENSO'
                  }
                </button>
              </div>""",
    "selector Units"
)

# Capture selected stake
replace_once(
    """    const result =
      captureCenso(
        match
      );""",
    """    const marketBox =
      button.closest(
        '.market-box'
      );

    const units =
      Number(
        marketBox
          ?.querySelector(
            '[data-censo-units]'
          )
          ?.value ||
        1
      );

    const result =
      captureCenso(
        match,
        {
          stakeUnits:
            units
        }
      );""",
    "capture stakeUnits"
)

# Censo stake display
replace_once(
    """      <div class="censo-details">

        <span>
          ${entry.recommendation}
        </span>""",
    """      <div class="censo-details">

        <span>
          ${entry.recommendation}
        </span>

        <span>
          STAKE
          <strong>
            ${
              Number.isFinite(
                Number(entry.stakeUnits)
              )
                ? `${Number(entry.stakeUnits).toFixed(2)} U`
                : 'LEGACY'
            }
          </strong>
        </span>""",
    "Censo stake display"
)

# Censo P/L display
replace_once(
    """              ${
                entry.result?.note
                  ? `<span>${entry.result.note}</span>`
                  : ''
              }""",
    """              ${
                Number.isFinite(
                  Number(
                    entry.result?.profitUnits
                  )
                )
                  ? `<span class="censo-profit ${Number(entry.result.profitUnits) >= 0 ? 'positive' : 'negative'}">P/L ${Number(entry.result.profitUnits) >= 0 ? '+' : ''}${Number(entry.result.profitUnits).toFixed(2)} U</span>`
                  : ''
              }

              ${
                entry.result?.note
                  ? `<span>${entry.result.note}</span>`
                  : ''
              }""",
    "Censo P/L display"
)

# Render on tab click
replace_once(
    """      button.classList.add('selected');
    });
  });""",
    """      button.classList.add('selected');

      if (
        activeTab === 'lab' ||
        activeTab === 'bank'
      ) {
        renderLabBank();
      }
    });
  });""",
    "render Lab/Bank on tab"
)

MAIN.write_text(s, encoding="utf-8")

checks = {
    "visible v0.6.7": "ATP + WTA · v0.6.7" in s,
    "labBank import": "from './ui/labBank.js'" in s,
    "Lab/Bank init": "initLabBankUI();" in s,
    "unit selector": "data-censo-units" in s,
    "stake capture": "stakeUnits:" in s,
}

failed = [name for name, ok in checks.items() if not ok]
if failed:
    print("[ERROR] Falló sanity check:", ", ".join(failed))
    sys.exit(1)

print("")
print("==============================================")
print("v0.6.7 ENTRYPOINT HOTFIX APLICADO")
print("==============================================")
for name, ok in checks.items():
    print("✓" if ok else "✗", name)

print("")
print("Ahora ejecuta:")
print("  node --check src/main.js")
print("  npm test")
print("  npm run build")
print("  npx cap sync android")
print("")
print("Esperado: tests 43 / pass 43 / fail 0")
print("")
print("Si todo sale verde:")
print("  git add src/main.js")
print('  git commit -m "Fix v0.6.7 entrypoint and activate Lab Bank"')
print("  git push origin main")
print("  gh run watch")
print("")
print(f"Backup: {backup.name}")
