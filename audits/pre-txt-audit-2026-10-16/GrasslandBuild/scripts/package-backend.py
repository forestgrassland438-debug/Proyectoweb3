"""Actualización explícita del backend: jamás incluye secretos, backups ni .git."""
from pathlib import Path
import json
import zipfile

root = Path(__file__).resolve().parent.parent
source = root / 'repositories/backend'
live_server = Path('C:/Users/pc/Desktop/server2.js')
names = ['server2.js', 'package.json', 'package-lock.json', '.gitignore', '.env.example']
example = (source / '.env.example').read_text(encoding='utf-8-sig')
assert all(not line.partition('=')[2].strip() for line in example.splitlines() if '=' in line and not line.lstrip().startswith('#'))
audit = json.loads((root / 'backend-audit-production.json').read_text(encoding='utf-8-sig'))
assert audit['metadata']['vulnerabilities']['total'] == 0
readme = '''Backend update — 11 October 2026

Copy these five files into leaguexd241-sys/backend and deploy on Railway.
server2.js includes the same battle engine as the public game patch, native
session pairing (Android and desktop), connection recovery and tactical bots.
The source is the current Desktop/server2.js, preserving the owner's manual changes.
Character allocations use eight server-only player_* tables created automatically
by the existing admin relayer. New routes cover sword guard, healing with full
food/water, player potions and fishing on Lands. Deploy together with the web patch.
Use the existing Railway Variables. .env.example contains names only.
Remove .env and relayer.key.enc from Git tracking while keeping private copies:
  git rm --cached -- .env relayer.key.enc
Rotate credentials previously exposed in Git history. This archive contains
neither those values nor the repository history. Never commit private backups.
Dependencies of production: npm audit --omit=dev reported zero known findings.
Developer/contract tooling still has findings; see VERIFICACION.md.
Tests used fixtures; no production database or relayer was started.
'''
with zipfile.ZipFile(root / 'dist/Grassland-Backend-Update.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in names:
        archive.write(live_server if name == 'server2.js' else source / name, 'backend/' + name)
    archive.writestr('README.txt', readme)
    archive.write(root / 'backend-audit-production.json', 'verification/backend-audit-production.json')
print('Backend preparado: cinco archivos, sin claves, .env privado, backups ni historial.')
