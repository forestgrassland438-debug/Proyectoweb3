'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const acorn = require('acorn');
const { createRequire } = require('node:module');
const source = fs.readFileSync(process.env.GF_BACKEND_SOURCE || 'C:/Users/pc/Desktop/server2.js', 'utf8');
const node = acorn.parse(source, { ecmaVersion: 'latest' }).body.find(item => item.type === 'FunctionDeclaration' && item.id.name === 'crearProveedorLecturaImpacto');
assert.ok(node, 'Dedicated read provider factory is missing from deployment');
let ethers;
try {
  const loader = createRequire(path.resolve(__dirname, '..', '..', '..', 'backendnuevo (backen.js) Developer', 'package.json'));
  ethers = loader('ethers');
} catch (_) { /* Optional installed-runtime integration; pure audit tests always run. */ }

test('actual ethers read transport sends one non-batched request on HTTP429 without hidden retry or network-bootstrap loops', { skip: !ethers }, async () => {
  let requests = 0, payload;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      requests++; payload = JSON.parse(body);
      res.writeHead(429, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: payload.id, error: { code: -31002, message: 'Bandwidth limit exceeded' } }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const factory = vm.runInNewContext(source.slice(node.start, node.end) + '\ncrearProveedorLecturaImpacto', { ethers });
  const provider = factory(`http://127.0.0.1:${server.address().port}`, 4441);
  try {
    await assert.rejects(provider.send('eth_blockNumber', []), /429|server response/i);
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.equal(requests, 1);
    assert.equal(Array.isArray(payload), false);
    assert.equal(payload.method, 'eth_blockNumber');
  } finally {
    provider.destroy();
    await new Promise(resolve => server.close(resolve));
  }
});
