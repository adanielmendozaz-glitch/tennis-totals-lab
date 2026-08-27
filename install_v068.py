#!/usr/bin/env python3
from pathlib import Path
import json
import shutil
import sys
from datetime import datetime

ROOT = Path.cwd()

required = [
    ROOT / 'package.json',
    ROOT / 'package-lock.json',
    ROOT / 'src/main.js',
    ROOT / 'src/ui/labBank.js',
    ROOT / 'src/engine/censo.js',
    ROOT / 'src/engine/labHardening.js',
    ROOT / 'src/engine/bankTimeline.js',
    ROOT / 'src/ui/labBankV068.js',
    ROOT / 'src/v068.css',
    ROOT / 'tests/labHardening.test.js',
    ROOT / 'tests/bankTimeline.test.js',
]

for path in required:
    if not path.exists():
        print(f'[ERROR] Falta {path}')
        print('Asegúrate de descomprimir el ZIP dentro de ~/tennis-totals-lab')
        sys.exit(1)

pkg_path = ROOT / 'package.json'
pkg = json.loads(
    pkg_path.read_text(
        encoding='utf-8'
    )
)

if str(pkg.get('version')) != '0.6.7':
    print(
        '[ERROR] Base esperada v0.6.7; '
        f'encontré {pkg.get("version")}'
    )
    sys.exit(1)

stamp = datetime.now().strftime(
    '%Y%m%d-%H%M%S'
)
backup = ROOT / f'.v068-backup-{stamp}'
backup.mkdir(parents=True)

for rel in [
    'package.json',
    'package-lock.json',
    'src/main.js',
]:
    src = ROOT / rel
    dst = backup / rel
    dst.parent.mkdir(
        parents=True,
        exist_ok=True
    )
    shutil.copy2(src, dst)

pkg['version'] = '0.6.8'
pkg_path.write_text(
    json.dumps(
        pkg,
        indent=2,
        ensure_ascii=False
    ) + '\n',
    encoding='utf-8'
)

lock_path = ROOT / 'package-lock.json'
lock = json.loads(
    lock_path.read_text(
        encoding='utf-8'
    )
)

lock['version'] = '0.6.8'

if (
    isinstance(
        lock.get('packages'),
        dict
    ) and
    '' in lock['packages']
):
    lock['packages']['']['version'] = \
        '0.6.8'

lock_path.write_text(
    json.dumps(
        lock,
        indent=2,
        ensure_ascii=False
    ) + '\n',
    encoding='utf-8'
)

main_path = ROOT / 'src/main.js'
main = main_path.read_text(
    encoding='utf-8'
)

if "import './v068.css';" not in main:
    if "import './style.css';" not in main:
        print('[ERROR] No encontré import de style.css')
        sys.exit(1)

    main = main.replace(
        "import './style.css';",
        "import './style.css';\n"
        "import './v068.css';",
        1
    )

old_import = """import {
  initLabBankUI,
  renderLabBank
} from './ui/labBank.js';"""

new_import = """import {
  initLabBankUI,
  renderLabBank
} from './ui/labBankV068.js';"""

if old_import not in main:
    print(
        '[ERROR] No encontré import actual de labBank.js'
    )
    sys.exit(1)

main = main.replace(
    old_import,
    new_import,
    1
)

if 'ATP + WTA · v0.6.7' not in main:
    print(
        '[ERROR] No encontré versión visible v0.6.7'
    )
    sys.exit(1)

main = main.replace(
    'ATP + WTA · v0.6.7',
    'ATP + WTA · v0.6.8',
    1
)

old_stake = """              Number.isFinite(
                Number(entry.stakeUnits)
              )
                ? `${Number(entry.stakeUnits).toFixed(2)} U`
                : 'LEGACY'"""

new_stake = """              entry.stakeIntegrity?.status === 'REVIEW'
                ? 'STAKE REVIEW'
                : Number.isFinite(
                    Number(entry.stakeUnits)
                  )
                  ? `${Number(entry.stakeUnits).toFixed(2)} U`
                  : 'LEGACY'"""

if old_stake in main:
    main = main.replace(
        old_stake,
        new_stake,
        1
    )

main_path.write_text(
    main,
    encoding='utf-8'
)

print('')
print('==========================================')
print('Tennis Totals Lab v0.6.8 aplicado')
print('==========================================')
print('✓ Lab filters 7D / 30D / ALL')
print('✓ ATP/WTA + surface + trust filters')
print('✓ calibration sample gating')
print('✓ semantic P/L + ROI colors')
print('✓ Bank equity curve')
print('✓ Bank bet history')
print('✓ integrity counters')
print('✓ visible version v0.6.8')
print('')
print('SQLite NO se migra en esta versión.')
print('Queda aislada para v0.6.9.')
print('')
print(f'Backup local: {backup.name}')
print('')
print('Ahora ejecuta:')
print('  node --check src/engine/labHardening.js')
print('  node --check src/engine/bankTimeline.js')
print('  node --check src/ui/labBankV068.js')
print('  node --check src/main.js')
print('  npm test')
print('  npm run build')
print('  npx cap sync android')
print('')
print('Esperado: tests 53 / pass 53 / fail 0')
