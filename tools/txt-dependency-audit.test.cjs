'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const desktop = path.resolve(__dirname, '../GrasslandBuild');

test('electron-builder downloader keeps HTTP proxy support after removing vulnerable logging dependency', () => {
  const result = spawnSync(process.execPath, ['-e', `
    const http = require('node:http');
    const assert = require('node:assert/strict');
    const { createRequire } = require('node:module');
    const downloaderRequire = createRequire(require.resolve('app-builder-lib/node_modules/@electron/get'));
    assert.equal(downloaderRequire('global-agent/package.json').version, '4.1.3');
    let stage = 'listening';
    const timer = setTimeout(() => { console.error('proxy fixture timeout at ' + stage); process.exit(2); }, 10000);
    let hits = 0;
    const proxy = http.createServer((req, res) => {
      stage = 'proxy request'; hits++; assert.equal(req.url, 'http://fixture.invalid/electron.zip');
      res.end('local-proxy-fixture');
    });
    proxy.listen(0, '127.0.0.1', () => {
      process.env.GLOBAL_AGENT_HTTP_PROXY = 'http://127.0.0.1:' + proxy.address().port;
      process.env.GLOBAL_AGENT_HTTPS_PROXY = process.env.GLOBAL_AGENT_HTTP_PROXY;
      process.env.GLOBAL_AGENT_NO_PROXY = '';
      downloaderRequire('./proxy').initializeProxy(); stage = 'initialized';
      assert.equal(global.GLOBAL_AGENT.HTTP_PROXY, process.env.GLOBAL_AGENT_HTTP_PROXY);
      http.get('http://fixture.invalid/electron.zip', res => {
        stage = 'response';
        let body = ''; res.on('data', data => { body += data; });
        res.on('end', () => { assert.equal(body, 'local-proxy-fixture'); assert.equal(hits, 1);
          clearTimeout(timer); proxy.close(); });
      }).on('error', err => { console.error(err); process.exit(1); });
    });
  `], { cwd: desktop, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
});

test('backend dependency replacements retain bigint, websocket, temporary-file and offline compiler APIs', () => {
  const backend = path.join(desktop, 'repositories/backend');
  const result = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict'), fs = require('node:fs');
    const { createRequire } = require('node:module');
    const providerRequire = createRequire(require.resolve('@ethersproject/providers'));
    assert.equal(providerRequire('ws/package.json').version, '8.21.0');
    assert.equal(typeof providerRequire('ws').WebSocketServer, 'function');
    const unitRequire = createRequire(require.resolve('ethjs-unit'));
    assert.equal(unitRequire('bn.js/package.json').version, '4.12.3');
    const BN = unitRequire('bn.js'); assert.equal(new BN('12345678901234567890').add(new BN('10')).toString(), '12345678901234567900');
    const compilerRequire = createRequire(require.resolve('solc'));
    assert.equal(compilerRequire('tmp/package.json').version, '0.2.7');
    const temporary = compilerRequire('tmp').fileSync({ postfix: '.smt2' });
    try { fs.writeFileSync(temporary.name, '(check-sat)'); assert.equal(fs.readFileSync(temporary.name, 'utf8'), '(check-sat)'); }
    finally { temporary.removeCallback(); }
    assert.equal(fs.existsSync(temporary.name), false);
    const output = JSON.parse(require('solc').compile(JSON.stringify({ language: 'Solidity',
      sources: { 'Audit.sol': { content: '// SPDX-License-Identifier: MIT\\npragma solidity ^0.8.0; contract Audit { function value() external pure returns (uint) { return 7; } }' } },
      settings: { outputSelection: { '*': { '*': ['abi'] } } } })));
    assert.ok(!(output.errors || []).some(error => error.severity === 'error'));
    assert.equal(output.contracts['Audit.sol'].Audit.abi[0].name, 'value');
  `], { cwd: backend, encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
});
