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
backup = ROOT / f".v067-entrypoint2-backup-{stamp}"
backup.mkdir(parents=True, exist_ok=True)
shutil.copy2(MAIN, backup / "main.js")

s = MAIN.read_text(encoding="utf-8")

def add_after_any(candidates, addition, label):
    global s
    if addition.strip() in s:
        print(f"[OK] {label}: ya aplicado")
        return
    for old in candidates:
        if old in s:
            s = s.replace(old, old + addition, 1)
            print(f"[OK] {label}")
            return
    print(f"[ERROR] No encontré patrón: {label}")
    sys.exit(1)

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

# 1) Import Lab/Bank UI: soporta formato de una o varias líneas.
add_after_any(
    [
        "import { buildRanking } from './engine/ranking.js';",
        """import {
  buildRanking
} from './engine/ranking.js';"""
    ],
    """

import {
  initLabBankUI,
  renderLabBank
} from './ui/labBank.js';""",
    "import Lab/Bank UI"
)

# 2) Visible version.
if "ATP + WTA · v0.6.6" in s:
    s = s.replace("ATP + WTA · v0.6.6", "ATP + WTA · v0.6.7", 1)
    print("[OK] versión visible -> v0.6.7")
elif "ATP + WTA · v0.6.7" in s:
    print("[OK] versión visible ya v0.6.7")
else:
    print("[ERROR] No encontré texto visible de versión")
    sys.exit(1)

# 3) Init después de que app.innerHTML ya existe.
if "initLabBankUI();" not in s:
    replace_once(
        "const matchesEl = document.querySelector('#matches');",
        """initLabBankUI();

const matchesEl = document.querySelector('#matches');""",
        "init Lab/Bank UI"
    )
else:
    print("[OK] init Lab/Bank UI: ya aplicado")

# 4) Refrescar Lab/Bank con Censo.
if "renderCenso();\n  renderLabBank();" not in s:
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
else:
    print("[OK] refresh Lab/Bank: ya aplicado")

# 5) Selector de unidades.
if "data-censo-units" not in s:
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
else:
    print("[OK] selector Units: ya aplicado")

# 6) Capturar stake seleccionado.
handler_old = """    const result =
      captureCenso(
        match
      );"""

handler_new = """    const marketBox =
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
      );"""

if handler_new not in s:
    replace_once(handler_old, handler_new, "capture stakeUnits")
else:
    print("[OK] capture stakeUnits: ya aplicado")

# 7) Mostrar stake/legacy en Censo.
stake_old = """      <div class="censo-details">

        <span>
          ${entry.recommendation}
        </span>"""

stake_new = """      <div class="censo-details">

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
        </span>"""

if "LEGACY" not in s:
    replace_once(stake_old, stake_new, "Censo stake display")
else:
    print("[OK] Censo stake display: ya aplicado")

# 8) Mostrar P/L en Censo.
pl_old = """              ${
                entry.result?.note
                  ? `<span>${entry.result.note}</span>`
                  : ''
              }"""

pl_new = """              ${
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
              }"""

if "censo-profit" not in s:
    replace_once(pl_old, pl_new, "Censo P/L display")
else:
    print("[OK] Censo P/L display: ya aplicado")

# 9) Render al abrir tabs.
tab_old = """      button.classList.add('selected');
    });
  });"""

tab_new = """      button.classList.add('selected');

      if (
        activeTab === 'lab' ||
        activeTab === 'bank'
      ) {
        renderLabBank();
      }
    });
  });"""

if "activeTab === 'lab'" not in s:
    replace_once(tab_old, tab_new, "render Lab/Bank on tab")
else:
    print("[OK] render Lab/Bank on tab: ya aplicado")

MAIN.write_text(s, encoding="utf-8")

checks = {
    "visible v0.6.7": "ATP + WTA · v0.6.7" in s,
    "labBank import": "from './ui/labBank.js'" in s,
    "Lab/Bank init": "initLabBankUI();" in s,
    "renderLabBank": "renderLabBank();" in s,
    "unit selector": "data-censo-units" in s,
    "stake capture": "stakeUnits:" in s,
}

failed = [name for name, ok in checks.items() if not ok]
if failed:
    print("[ERROR] Falló sanity check:", ", ".join(failed))
    sys.exit(1)

print("")
print("==============================================")
print("v0.6.7 ENTRYPOINT HOTFIX 2 APLICADO")
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
print("Esperado:")
print("  tests 43")
print("  pass 43")
print("  fail 0")
print("")
print("Si todo sale verde:")
print("  git status")
print("  git add src/main.js")
print('  git commit -m "Fix v0.6.7 entrypoint and activate Lab Bank"')
print("  git push origin main")
print("  gh run watch")
print("")
print(f"Backup: {backup.name}")
