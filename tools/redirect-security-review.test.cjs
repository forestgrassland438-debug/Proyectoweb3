'use strict';
// Only loopback HTTP fixtures. Assert the installed upstream patch, including
// Axios compatibility; no third-party endpoint receives headers or data.
const { test } = require('node:test'), assert = require('node:assert/strict');
const http = require('node:http'), path = require('node:path'), { createRequire } = require('node:module');
const backendRequire = createRequire(path.resolve(__dirname, '../GrasslandBuild/repositories/backend/package.json'));
const follow = backendRequire('follow-redirects');
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const close = server => new Promise(resolve => server.close(resolve));
async function redirected(headers, sensitiveHeaders = []) {
  let incoming, original;
  const target = http.createServer((req, res) => { incoming = req.headers; res.end('local fixture'); });
  const start = http.createServer((req, res) => { original = req.headers; res.writeHead(302, { Location: 'http://127.0.0.1:' + target.address().port + '/target' }); res.end(); });
  await listen(target); await listen(start);
  try {
    await new Promise((resolve, reject) => {
      const req = follow.http.get({ hostname: '127.0.0.1', port: start.address().port, path: '/', headers, sensitiveHeaders, maxRedirects: 2, timeout: 3000 }, res => {
        res.resume(); res.on('end', resolve); res.on('error', reject);
      }); req.on('error', reject); req.on('timeout', () => req.destroy(Error('fixture timeout')));
    });
    return { incoming, original };
  } finally { await close(start); await close(target); }
}
test('patched redirects strip array-form Authorization and Cookie across origins', async () => {
  assert.equal(backendRequire('follow-redirects/package.json').version, '1.16.1');
  const { original, incoming } = await redirected(['Authorization', 'Bearer fixture', 'Cookie', 'session=fixture', 'X-Trace', 'retain']);
  assert.equal(original.authorization, 'Bearer fixture'); assert.equal(original.cookie, 'session=fixture');
  assert.equal(incoming.authorization, undefined); assert.equal(incoming.cookie, undefined); assert.equal(incoming['x-trace'], 'retain');
});
test('custom sensitive header names containing caret and pipe are treated literally', async () => {
  const { incoming } = await redirected({ 'X-Api^Key': 'fixture', 'X-Token|Secret': 'fixture', 'X-Token': 'ordinary' }, ['X-Api^Key', 'X-Token|Secret']);
  assert.equal(incoming['x-api^key'], undefined); assert.equal(incoming['x-token|secret'], undefined); assert.equal(incoming['x-token'], 'ordinary');
});
test('Axios retains POST JSON and credentials through a legitimate same-origin 307', async () => {
  const axios = backendRequire('axios'); let received;
  const server = http.createServer((req, res) => {
    if (req.url === '/start') { res.writeHead(307, { Location: '/target' }); req.resume(); res.end(); return; }
    let body = ''; req.on('data', chunk => { body += chunk; }); req.on('end', () => { received = { method: req.method, body, authorization: req.headers.authorization }; res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}'); });
  });
  await listen(server);
  try {
    const r = await axios.post('http://127.0.0.1:' + server.address().port + '/start', { fixture: 7 }, { headers: { Authorization: 'Bearer fixture' }, proxy: false, timeout: 3000 });
    assert.equal(r.data.ok, true); assert.deepEqual(received, { method: 'POST', body: '{"fixture":7}', authorization: 'Bearer fixture' });
  } finally { await close(server); }
});
