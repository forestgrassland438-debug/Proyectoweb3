const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../gf-redirect.js'), 'utf8');
test('el enlace antiguo conserva la selección MetaMask y la cuenta', () => {
  let target;
  const location = { search: '?address=0x123&wallet=metamask&redirect=https://evil.test/', hash: '#arena', replace: url => { target = url; } };
  vm.runInNewContext(source, { window: { location } });
  const resolved = new URL(target, 'https://game.grasslandforest.com/game.html');
  assert.equal(resolved.origin, 'https://game.grasslandforest.com');
  assert.equal(resolved.pathname, '/index.html');
  assert.equal(resolved.searchParams.get('wallet'), 'metamask');
  assert.equal(resolved.searchParams.get('address'), '0x123');
  assert.equal(resolved.hash, '#arena');
});
test('la alternativa a replace conserva los mismos parámetros', () => {
  const location = { search: '?wallet=metamask', hash: '', replace: () => { throw Error('no replace'); } };
  vm.runInNewContext(source, { window: { location } });
  assert.equal(location.href, './index.html?wallet=metamask');
});
