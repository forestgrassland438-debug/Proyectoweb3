'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'), backupRoot = path.join(root, 'audits/pre-txt-audit-2026-10-16');
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const changes = [], preservedUserChanges = [];
function scan(dir, prefix = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix + entry.name, original = path.join(dir, entry.name);
    if (entry.isDirectory()) { scan(original, relative + '/'); continue; }
    if (relative === 'manifest.json') continue;
    const target = relative.startsWith('external-Desktop/')
      ? path.join(process.env.USERPROFILE, 'Desktop', relative.slice('external-Desktop/'.length)) : path.join(root, relative);
    const before = fs.readFileSync(original), after = fs.existsSync(target) ? fs.readFileSync(target) : null;
    if (relative === '_prueba_3d.html' && !after) {
      preservedUserChanges.push({ file: relative, change: 'deleted_by_user', backup: original });
      continue;
    }
    if (!after || digest(before) !== digest(after)) changes.push({ file: relative, target,
      backup: original, beforeBytes: before.length, afterBytes: after?.length ?? null,
      beforeSha256: digest(before), afterSha256: after ? digest(after) : null });
  }
}
scan(backupRoot);
fs.writeFileSync(path.join(root, 'audits/txt-changes.json'), JSON.stringify({ generatedAt: new Date().toISOString(), files: changes.length, changes, preservedUserChanges }, null, 2) + '\n');
for (const change of changes) console.log(`${change.file}: ${change.beforeBytes} -> ${change.afterBytes} bytes`);
console.log(`Archivos existentes modificados: ${changes.length}`);
