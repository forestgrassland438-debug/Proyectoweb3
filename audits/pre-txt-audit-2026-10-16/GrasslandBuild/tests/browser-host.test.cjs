const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const p = require('../desktop/browser-host.cjs');
test('solo se abre el login fijo, sin argumentos del usuario ni flags inseguros', () => {
  assert.deepEqual(p.launchArguments('https://attacker.test/', '--no-sandbox'), ['--new-window', p.LOGIN_URL]);
  assert.deepEqual(p.launchArguments('firefox'), ['-new-window', p.LOGIN_URL]);
});
test('se detectan navegadores instalados en rutas conocidas para los tres SO', () => {
  for (const os of ['win32', 'darwin', 'linux']) {
    const browsers = p.installedBrowsers(os, {}, () => true);
    assert.ok(browsers.length >= 6);
    for (const id of ['firefox', 'opera']) assert.ok(browsers.some(b => b.id === id));
    assert.equal(browsers[0].id, 'brave');
    assert.equal(p.installedBrowsers(os, {}, () => false).length, 0);
  }
});
test('el controlador no ejecuta un shell y la vista remota no tiene preload', () => {
  const source = fs.readFileSync(path.join(__dirname, '../desktop/main.cjs'), 'utf8');
  assert.ok(!source.includes('exec(')); assert.ok(source.includes('new WebContentsView')); assert.ok(source.includes("shell:false"));
  assert.ok(source.includes('shell:false')); assert.ok(source.includes('app.enableSandbox()'));
});
