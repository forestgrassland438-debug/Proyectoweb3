'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createNativePairing } = require('./native-pairing-server.cjs');
const address = '0x' + 'a'.repeat(40);
function fixture(options = {}) {
  let clock = 1, sessions = 0;
  const service = createNativePairing({ crypto, now: () => clock, checkAccess: async () => ({ allowed: true }),
    issueSession: async () => { sessions++; return { playerName: 'Player' }; }, ...options });
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const pair = service.start({ challenge, platform: 'win32' });
  return { service, pair, verifier, challenge, advance: ms => { clock += ms; }, sessions: () => sessions };
}
test('sesión nueva solo tras aprobar y presentar PKCE; un uso incluso con polls simultáneos', async () => {
  const f = fixture();
  assert.equal((await f.service.poll({ id: f.pair.id, verifier: f.verifier })).status, 202);
  assert.equal(f.sessions(), 0);
  assert.equal(f.service.approve({ id: f.pair.id, address, walletKind: 'metamask' }).status, 200);
  const result = await Promise.all([f.service.poll({ id: f.pair.id, verifier: f.verifier }), f.service.poll({ id: f.pair.id, verifier: f.verifier })]);
  assert.deepEqual(result.map(r => r.status).sort(), [200,410]); assert.equal(f.sessions(), 1);
  assert.equal(result.find(r=>r.status===200).address, address); assert.equal(f.service.size(), 0);
});
test('un tercero con el id público no recibe sesión, y no sustituye una aprobación', async () => {
  const f = fixture(); f.service.approve({ id:f.pair.id,address,walletKind:'social' });
  assert.equal((await f.service.poll({ id:f.pair.id,verifier:'b'.repeat(43) })).status,403);
  assert.equal(f.service.approve({ id:f.pair.id,address:'0x'+'b'.repeat(40),walletKind:'social' }).status,409);
  assert.equal(f.sessions(),0); assert.equal((await f.service.poll({id:f.pair.id,verifier:f.verifier})).status,200);
});
test('caducidad, capacidad y datos inválidos mantienen memoria acotada', () => {
  const f = fixture({ limit:1 });
  assert.equal(f.service.start({challenge:f.challenge,platform:'linux'}).status,503);
  assert.equal(f.service.start({challenge:'x',platform:'win32'}).status,400);
  f.advance(600001); assert.equal(f.service.info(f.pair.id).status,410); assert.equal(f.service.size(),0);
  assert.equal(f.service.start({challenge:f.challenge,platform:'linux'}).status,200);
});
test('una cuenta baneada después de aprobar no obtiene cookies', async () => {
  const f = fixture({checkAccess:async()=>({allowed:false,error:'banned'})});
  f.service.approve({id:f.pair.id,address,walletKind:'social'});
  assert.equal((await f.service.poll({id:f.pair.id,verifier:f.verifier})).error,'banned');
  assert.equal(f.sessions(),0); assert.equal(f.service.size(),0);
});
