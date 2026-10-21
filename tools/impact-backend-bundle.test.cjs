'use strict';
// Reproduce the incomplete deployment without starting the game, DB or relayer.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');
const generator = require('./build-impact-backend.cjs');
const backendPath = process.env.GF_BACKEND_SOURCE || path.join(require('node:os').homedir(), 'Desktop', 'server2.js');
const source = fs.readFileSync(backendPath, 'utf8');
const bundle = source.slice(source.indexOf(generator.BEGIN), source.indexOf(generator.END) + generator.END.length);
const mountStart = source.indexOf('// --- AUDITORIA LITVM: ledger aditivo');
// Other self-contained modules now follow analytics. Do not execute their
// bootstrap using the deliberately minimal analytics-only fixture.
const mountEnd = Math.min(...['// <COLLECTIONS_BACKEND_BUNDLE>', '// --- MANEJO DE ERRORES ---']
  .map(marker => source.indexOf(marker, mountStart)).filter(index => index >= 0));
assert.ok(mountStart >= 0 && Number.isFinite(mountEnd) && mountEnd > mountStart);
const mount = source.slice(mountStart, mountEnd);

test('deployed server loads both analytics factories with sidecar and npm access denied', () => {
  const imports = [];
  const context = vm.createContext({ require(name) {
    assert.ok(name.startsWith('node:'), 'Deployment tried loading an external analytics file: ' + name);
    imports.push(name); return require(name);
  } });
  const exports = vm.runInContext(bundle + '\n({chain:cargarLitvmChainAuditIntegrado(),analytics:cargarLitvmImpactAnalyticsIntegrado()})', context);
  assert.equal(typeof exports.chain.createChainAudit, 'function');
  assert.equal(typeof exports.analytics.mountImpactAnalytics, 'function');
  assert.ok(imports.includes('node:async_hooks'));
  assert.doesNotMatch(source, /require\(['"]\.\/litvm-(?:chain-audit|impact-analytics)\.cjs['"]\)/);
});

test('embedded module source is current, reproducible and valid ES2022 for Node 18', () => {
  assert.equal(generator.integrate(source, generator.renderBundle()), source);
  assert.doesNotThrow(() => acorn.parse(bundle, { ecmaVersion: 2022 }));
});

function bootstrap(extra = {}) {
  const mounted = [], messages = [], events = [];
  const apiLimiter = function limiter(req, res, next) { next(); };
  const adminAuth = function auth(req, res, next) { if (!req.admin) return res.status(401).json({error:'authentication_required'}); next(); };
  const audit = { startMaintenance() { events.push('maintenance'); }, async dispose() { events.push('disposed'); } };
  const analytics = {};
  const context = vm.createContext({
    chainAudit: null, impactAnalytics: null, impactReadProvider: null, createChainAudit() { return audit; },
    crearProveedorLecturaImpacto() { return { destroy() {} }; }, process: { env: {} }, RPC_URL: 'https://fixture.invalid',
    mountImpactAnalytics() { events.push('mounted'); return analytics; },
    app: { use(...args) { mounted.push(args); } },
    mongoose: {}, ethers: {}, provider: {}, GamePlayer: {}, UserActivity: {}, PlayerPlaytime: {}, RelayedTransaction: {},
    CONTRACTS: { ITEMS_CONTRACT: { address: '0x' + '1'.repeat(40), abi: [] } }, CHAIN_ID: 4441,
    relayerWallet: null, EXPLORER_URL: 'https://liteforge.explorer.caldera.xyz',
    adminAuth, apiLimiter, strictLimiter() {}, csrfProtection() {},
    console: { error(...args) { messages.push(args.join(' ')); } }, ...extra
  });
  vm.runInContext(mount + '\nthis.coreStartupContinued = true;', context);
  return { context, mounted, messages, events, analytics, audit, adminAuth, apiLimiter };
}

test('analytics initializes normally and maintenance starts once', () => {
  const f = bootstrap();
  assert.equal(f.context.chainAudit, f.audit);
  assert.equal(f.context.impactAnalytics, f.analytics);
  assert.deepEqual(f.events, ['mounted', 'maintenance']);
  assert.equal(f.context.coreStartupContinued, true);
  assert.equal(f.mounted.length, 0);
});

test('analytics constructor failure cannot prevent core startup or bypass admin authorization', () => {
  const f = bootstrap({ createChainAudit() { throw new Error('invalid_chain_audit_configuration'); } });
  assert.equal(f.context.coreStartupContinued, true);
  assert.equal(f.context.impactAnalytics, null);
  assert.equal(f.context.chainAudit, null);
  assert.equal(f.mounted[0][0], '/api/admin/impact');
  assert.equal(f.mounted[0][1], f.adminAuth);
  assert.equal(f.mounted[0][2], f.apiLimiter);
  const invoke = admin => {
    const result = {};
    const res = { set(k,v) { result[k]=v;return this; }, status(code) {result.status=code;return this;}, json(body) {result.body=body;return this;} };
    const handlers=f.mounted[0].slice(1);let position=0;
    const next=()=>handlers[position++]?.({admin},res,next);next();return result;
  };
  assert.equal(invoke(null).status, 401);
  const adminReply=invoke({address:'admin'});
  assert.equal(adminReply.status, 503);
  assert.equal(adminReply.body.error, 'impact_initialization_failed');
  assert.equal(adminReply['Cache-Control'], 'no-store');
});

test('failed analytics mount disposes the partial worker and keeps connection secrets out of diagnostics', () => {
  const f = bootstrap({ mountImpactAnalytics() { throw new Error('failure https://user:secret@private.test/rpc'); } });
  assert.equal(f.context.coreStartupContinued, true);
  assert.equal(f.context.chainAudit, null);
  assert.deepEqual(f.events, ['disposed']);
  assert.match(f.messages.join(' '), /\[endpoint\]/);
  assert.doesNotMatch(f.messages.join(' '), /user:secret|private\.test/);
});
