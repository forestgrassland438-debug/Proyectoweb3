'use strict';
// Reproducible browser assets. Run `npm ci --ignore-scripts && npm run build:vendor` in bin.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'vendor');
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const copies = [
    ['phaser', 'dist/phaser.min.js', 'phaser.min.js'],
    ['ethers', 'dist/ethers.umd.min.js', 'ethers.umd.min.js'],
    ['phaser3-rex-plugins', 'dist/rexvirtualjoystickplugin.min.js', 'rexvirtualjoystickplugin.min.js']
  ];
  const packages = new Set(copies.map(([name]) => name));
  const bundle = await esbuild.build({
    absWorkingDir: root,
    stdin: { contents: 'export { io, connect, Manager, Socket, protocol } from "socket.io-client";', resolveDir: root, sourcefile: 'socket-client-entry.js' },
    bundle: true, minify: true, platform: 'browser', format: 'iife', globalName: 'GFSocketIO', target: ['es2020'],
    footer: { js: 'globalThis.io = Object.assign(GFSocketIO.io, GFSocketIO);' },
    outfile: path.join(output, 'socket.io.min.js'), legalComments: 'linked', metafile: true
  });
  for (const file of Object.keys(bundle.metafile.inputs)) {
    const match = file.replaceAll('\\', '/').match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
    if (match) packages.add(match[1]);
  }
  const versions = {};
  const notices = ['Grassland Forest — third-party browser libraries', 'Rebuild using the exact bin/package-lock.json dependency graph.', ''];
  for (const name of [...packages].sort()) {
    const directory = path.join(root, 'node_modules', name);
    const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
    versions[name] = pkg.version;
    notices.push(`\n--- ${name}@${pkg.version} (${pkg.license || 'see package license'}) ---\n`);
    const license = fs.readdirSync(directory).find(file => /^licen[sc]e(?:\.|$)/i.test(file));
    if (license) notices.push(fs.readFileSync(path.join(directory, license), 'utf8'));
  }
  for (const [name, source, destination] of copies) fs.copyFileSync(path.join(root, 'node_modules', name, source), path.join(output, destination));
  const files = Object.fromEntries([...copies.map(row => row[2]), 'socket.io.min.js'].map(file => {
    const data = fs.readFileSync(path.join(output, file));
    return [file, { bytes: data.length, cacheKey: crypto.createHash('sha256').update(data).digest('hex').slice(0, 12), integrity: 'sha384-' + crypto.createHash('sha384').update(data).digest('base64') }];
  }));
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ versions, files }, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'LICENSES.txt'), notices.join('\n'));
  for (const pageName of ['index.html', 'reporter.html']) {
    let html = fs.readFileSync(path.join(root, pageName), 'utf8');
    for (const [file, info] of Object.entries(files)) {
      const escaped = file.replaceAll('.', '\\.');
      const tag = new RegExp('<script\\b[^>]*src="[^"\\n]*' + escaped + '(?:\\?[^"\\n]*)?"[^>]*>\\s*</script>', 'g');
      let count = 0;
      html = html.replace(tag, () => { count++; return `<script src="./vendor/${file}?v=${info.cacheKey}" defer integrity="${info.integrity}"></script>`; });
      const expected = pageName === 'index.html' || file === 'ethers.umd.min.js' ? 1 : 0;
      if (count !== expected) throw new Error(`Expected ${expected} script tag for ${file} in ${pageName}; found ${count}`);
    }
    fs.writeFileSync(path.join(root, pageName), html);
  }
  console.log(JSON.stringify({ versions, files }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
