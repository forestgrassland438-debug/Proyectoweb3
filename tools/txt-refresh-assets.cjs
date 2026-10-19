'use strict';
// Actualiza únicamente referencias de scripts modificados durante esta auditoría.
// No empaqueta ni publica el juego.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const audit = JSON.parse(fs.readFileSync(path.join(root, 'audits/txt-changes.json'), 'utf8'));
const revised = new Set(audit.changes.map(change => change.file).filter(file => file.endsWith('.js') && !file.startsWith('external-Desktop/')));
for (const file of fs.readdirSync(root).filter(file => file.endsWith('.html') && !file.startsWith('_prueba'))) {
  const filename = path.join(root, file), original = fs.readFileSync(filename, 'utf8');
  const updated = original.replace(/(<script\b[^>]*\bsrc=["'])([^"']+)(["'])/gi, (all, prefix, source, end) => {
    const url = new URL(source, 'https://audit.invalid/');
    if (url.origin !== 'https://audit.invalid') return all;
    const asset = decodeURIComponent(url.pathname.slice(1));
    if (!revised.has(asset)) return all;
    const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, asset))).digest('hex').slice(0, 12);
    url.searchParams.set('v', 'audit20261016.' + digest);
    return prefix + source.split(/[?#]/)[0] + url.search + url.hash + end;
  });
  if (updated !== original) { fs.writeFileSync(filename, updated); console.log(file); }
}
