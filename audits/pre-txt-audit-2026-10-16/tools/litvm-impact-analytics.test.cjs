'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const packaged = path.join(__dirname, '..', 'backend-impact', 'litvm-impact-analytics.cjs');
const analytics = require(fs.existsSync(packaged) ? packaged : 'C:/Users/pc/Desktop/litvm-impact-analytics.cjs');
const { describeError } = require('../backend-impact/litvm-chain-audit.cjs');
const { csvCell, classifyActivity, sessionSegment, summarizeSegments, retryableInitializer, DAY, SESSION_GAP_MS } = analytics._test;

test('relayer observations coalesce concurrent viewers, expire at ten seconds and isolate wallet rotations', async () => {
  let clock = 0, calls = 0;
  const cache = analytics._test.createSnapshotCache(async address => {
    calls++; await new Promise(resolve => setImmediate(resolve));
    return { address, status: 'online', balanceWei: String(calls), diagnostics: [] };
  }, { now: () => clock });
  const [first, concurrent] = await Promise.all([cache('alice'), cache('alice')]);
  assert.equal(calls, 1); assert.deepEqual(first, concurrent);
  first.balanceWei = 'tampered'; first.diagnostics.push('tampered');
  assert.equal((await cache('alice')).balanceWei, '1');
  assert.deepEqual((await cache('alice')).diagnostics, []);
  clock = 9999; await cache('alice'); assert.equal(calls, 1);
  clock = 10000; assert.equal((await cache('alice')).balanceWei, '2');
  const rotated = await cache('bob'); assert.equal(calls, 3); assert.equal(rotated.address, 'bob');
});

test('RPC partial snapshots back off across ten-second UI refreshes and recover when quota returns', async () => {
  let clock = 0, calls = 0, blocked = true;
  const cache = analytics._test.createSnapshotCache(async () => {
    calls++; return { status: blocked ? 'partial' : 'online', balanceWei: blocked ? null : '123' };
  }, { now: () => clock });
  const first = await cache('wallet');
  assert.equal(first.nextRefreshAt, new Date(30000).toISOString());
  clock = 10000; await cache('wallet'); clock = 20000; await cache('wallet'); assert.equal(calls, 1);
  clock = 30000; const second = await cache('wallet'); assert.equal(calls, 2);
  assert.equal(second.nextRefreshAt, new Date(90000).toISOString());
  clock = 89999; await cache('wallet'); assert.equal(calls, 2);
  blocked = false; clock = 90000; const recovered = await cache('wallet');
  assert.equal(recovered.status, 'online'); assert.equal(recovered.balanceWei, '123');
  assert.equal(recovered.observedAt, new Date(90000).toISOString());
  assert.equal(recovered.nextRefreshAt, new Date(100000).toISOString());
});

test('RPC bandwidth errors identify retryable quota exhaustion instead of admin authentication or Mongo failure', () => {
  const error = Object.assign(new Error('Bandwidth limit exceeded'), { code: -31002, stage: 'rpc_eth_getBlockByNumber' });
  const result = analytics._test.impactFailure(error, { describeError });
  assert.equal(result.status, 429); assert.equal(result.body.error, 'impact_rpc_rate_limited');
  assert.equal(result.body.code, -31002); assert.match(result.body.message, /progreso guardado se conserva/);
});

test('CSV export neutralizes spreadsheet formulas even after whitespace and escapes quoted/newline names', () => {
  for (const name of ['=HYPERLINK("evil")', '  +CMD', '\t@SUM(A1)', '\r-4']) {
    assert.equal(csvCell(name).startsWith('"\''), true);
  }
  assert.equal(csvCell('Jugador "uno"\nEquipo'), '"Jugador ""uno""\nEquipo"');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell('0x1234'), '"0x1234"');
});

test('new server segments persist no raw authentication token and retry the same identity/time idempotently', () => {
  const input = { playerName: 'Alice', sessionKey: 'secret-session-token', from: 1000, to: 6000, address: '0x' + 'A'.repeat(40) };
  const a = sessionSegment(input, 6000), b = sessionSegment(input, 6000);
  assert.equal(a._id, b._id);
  assert.equal(a.durationMs, 5000);
  assert.equal(a.address, '0x' + 'a'.repeat(40));
  assert.equal(JSON.stringify(a).includes(input.sessionKey), false);
  assert.notEqual(a._id, sessionSegment({ ...input, playerName: 'Bob' }, 6000)._id);
  assert.notEqual(a._id, sessionSegment({ ...input, to: 6001 }, 6001)._id);
});

test('invalid, future and overlong playtime does not enter measured sessions', () => {
  const valid = { playerName: 'Alice', sessionKey: 's', from: 1000, to: 6000 };
  for (const changed of [{ from: 'bad' }, { to: 1000 }, { to: 1000 + DAY + 1 }, { playerName: '---' }, { sessionKey: '' }, { to: 61001 }]) {
    assert.throws(() => sessionSegment({ ...valid, ...changed }, 1000), TypeError);
  }
});

test('session audit merges duplicate and overlapping sockets, excludes idle gaps, splits after 30 minutes', async () => {
  const segments = [
    { playerName: 'Alice', sessionHash: 'a', from: 0, to: 600000 },
    { playerName: 'Alice', sessionHash: 'a', from: 0, to: 600000 },
    { playerName: 'Alice', sessionHash: 'a', from: 300000, to: 900000 },
    { playerName: 'Alice', sessionHash: 'a', from: 900000 + SESSION_GAP_MS, to: 900000 + SESSION_GAP_MS + 60000 },
    { playerName: 'Alice', sessionHash: 'a', from: 900000 + 2 * SESSION_GAP_MS + 60001, to: 900000 + 2 * SESSION_GAP_MS + 120001 },
    { playerName: 'Bob', sessionHash: 'b', from: 0, to: 120000 }
  ];
  const result = await summarizeSegments(segments);
  assert.equal(result.sessionCount, 3);
  assert.equal(result.totalSeconds, 1140);
  assert.equal(result.players.get('Alice').seconds, 1020);
  assert.equal(result.players.get('Alice').sessions, 2);
  assert.equal(result.averageSessionMinutes, 1140 / 3 / 60);
});

test('missing historical session evidence stays unavailable, not zero or an invented mean', async () => {
  const empty = await summarizeSegments([]);
  assert.equal(empty.sessionCount, 0);
  assert.equal(empty.averageSessionMinutes, null);
  assert.equal(classifyActivity({ txCount: 100, playtimeSeconds: null, actionTypes: 8, distinctPlayDays: 20 }).label, 'Evidencia insuficiente');
  assert.equal(classifyActivity({ txCount: 600, playtimeSeconds: 3599, actionTypes: 3, distinctPlayDays: 2 }).label, 'Revisar');
  const organic = classifyActivity({ txCount: 10, playtimeSeconds: 3600, actionTypes: 3, distinctPlayDays: 2 });
  assert.equal(organic.label, 'Actividad Orgánica Humana (indicio)');
  assert.match(organic.reason, /no demuestra/);
});

test('a transient DB initialization failure is retryable, while concurrent callers share a single attempt', async () => {
  let attempts = 0;
  const initialize = retryableInitializer(async () => {
    attempts++;
    if (attempts === 1) throw new Error('Mongo unavailable');
    await new Promise(resolve => setImmediate(resolve));
    return { coverageStartedAt: new Date(0) };
  });
  await assert.rejects(initialize(), /Mongo unavailable/);
  const [first, second] = await Promise.all([initialize(), initialize()]);
  assert.equal(attempts, 2);
  assert.equal(first, second);
  await initialize();
  assert.equal(attempts, 2);
});

test('protected JSON export reconciles contract and sponsor counters with its own proof rows despite newer summary observations', async () => {
  const now = Date.now();
  const wallet = '0x' + 'a'.repeat(40), contractAddress = '0x' + 'c'.repeat(40);
  const row = (n, status, extras = {}) => ({ txHash: '0x' + String(n).repeat(64), chainId: 4441, contractAddress,
    status, canonical: true, from: wallet, attributionStatus: 'attributed', playerName: 'Alice',
    timestamp: new Date(now - DAY), firstSeenAt: new Date(now - 2 * DAY), password: 'secret-password', ip: '127.0.0.1', sessionHash: 'private-session', ...extras });
  const proof = [row(1, 'confirmed'), row(2, 'reverted'), row(3, 'pending'), row(4, 'orphaned', { canonical: false }),
    row(5, 'confirmed', { from: '0x' + 'b'.repeat(40), playerName: null, attributionStatus: 'system' }),
    row(6, 'signed'), row(7, 'confirmed', { attributionStatus: 'inferred', playerName: 'Bob' })];
  function cursor(rows) {
    return { async *[Symbol.asyncIterator]() { yield* rows; }, async close() {} };
  }
  function query(value) {
    return { select() { return this; }, sort() { return this; }, lean() { return this; },
      limit() { return this; }, exec: async () => value, cursor: () => cursor(value) };
  }
  const playerSummary = [{ registered: 2, active30d: 1, totalSeconds: 3600, measuredPlayers: 1, activeWindowTransactions: 999 }];
  const projections = [];
  const models = {};
  const db = { models, base: { Schema: class { index() {} } }, model(name) { return models[name]; } };
  models.ImpactAnalyticsMeta = { findById: () => query({ coverageStartedAt: new Date(now) }), findOneAndUpdate: () => query({ coverageStartedAt: new Date(now) }) };
  models.ImpactPlaySegment = { collection: { name: 'impact_play_segments' }, find: () => query([]) };
  const GamePlayer = { db, collection: { name: 'gameplayers' }, aggregate(pipeline) {
    const summary = pipeline.some(stage => stage.$group && stage.$group.registered);
    return { allowDiskUse() { return this; }, exec: async () => summary ? playerSummary : [{ playerName: 'Alice', lastGameplayAt: new Date(now - 1000) }, { playerName: 'Bob', lastGameplayAt: null }] };
  } };
  const Transaction = { collection: { name: 'impact_transactions' }, aggregate(pipeline) {
    const globalGroup = pipeline.some(stage => stage.$group?._id?.status);
    return { exec: async () => globalGroup ? [{ _id: { status: 'confirmed', canonical: true, attribution: 'attributed', from: wallet }, count: 999 }] : [] };
  }, find(filter) {
    const result = query(proof);
    let fields;
    result.select = function(value) { projections.push(value); fields = value.split(' ').filter(field => !field.startsWith('-')); return this; };
    result.cursor = () => ({ async *[Symbol.asyncIterator]() {
      assert.ok(filter.firstSeenAt.$lte instanceof Date);
      for (let i = 0; i < proof.length; i++) {
        const candidate = proof[i];
        if (candidate.firstSeenAt > filter.firstSeenAt.$lte) continue;
        yield Object.fromEntries(fields.filter(field => field in candidate).map(field => [field, candidate[field]]));
        if (i === 0) proof.push(row(8, 'confirmed', { firstSeenAt: new Date(now + 60000) }));
      }
    }, async close() {} });
    return result;
  } };
  const routes = new Map();
  const adminAuth = () => {}, apiLimiter = () => {}, strictLimiter = () => {}, csrfProtection = () => {};
  analytics.mountImpactAnalytics({
    app: { get(route, ...handlers) { routes.set(route, handlers); }, post(route, ...handlers) { routes.set('POST ' + route, handlers); } },
    GamePlayer, UserActivity: { collection: { name: 'useractivities' } }, PlayerPlaytime: { collection: { name: 'player_playtime' } },
    chainAudit: { Transaction, getScanStatus: async () => ({ status: 'running' }), startScan: async () => ({ status: 'running' }) },
    contractAddress, chainId: 4441, explorerUrl: 'https://example.test', getRelayerWallet: () => ({ address: wallet }),
    adminAuth, apiLimiter, strictLimiter, csrfProtection
  });
  for (const [name, handlers] of routes) {
    assert.equal(handlers[0], adminAuth, name + ' is admin protected');
    assert.equal(handlers[1], name.startsWith('POST ') ? strictLimiter : apiLimiter);
    if (name.startsWith('POST ')) assert.equal(handlers[2], csrfProtection);
  }
  class Response extends EventEmitter {
    constructor() { super(); this.output = ''; this.headersSent = false; }
    set() { return this; }
    write(text) { this.headersSent = true; this.output += text; return true; }
    end() { this.finished = true; }
    destroy(error) { throw error; }
    status(code) { this.code = code; return this; }
    json(value) { this.output = JSON.stringify(value); }
  }
  const response = new Response(), handlers = routes.get('/api/admin/impact/export/onchain.json');
  await handlers.at(-1)({ query: {} }, response);
  assert.equal(response.finished, true);
  const exported = JSON.parse(response.output);
  assert.equal(exported.transactions.length, 7);
  assert.equal(exported.contract.totalTransactions, 4);
  assert.equal(exported.contract.confirmedTransactions, 3);
  assert.equal(exported.contract.revertedTransactions, 1);
  assert.equal(exported.contract.pendingTransactions, 2);
  assert.equal(exported.contract.orphanedTransactions, 1);
  assert.equal(exported.contract.attributedTransactions, 2);
  assert.equal(exported.contract.systemTransactions, 1);
  assert.equal(exported.contract.inferredTransactions, 1);
  assert.equal(exported.contract.attributedUserCount, 1);
  assert.equal(exported.contract.activeWindowTransactions, 1);
  assert.equal(exported.contract.transactionsPerActiveUser, 1);
  assert.equal(exported.relayer.sponsoredContractTransactions, 3);
  assert.equal(exported.relayer.ledgerSignedTransactions, 5);
  assert.equal(exported.relayer.sponsoredSuccessfulTransactions, 2);
  assert.equal(exported.relayer.sponsoredUniqueRegisteredPlayers, 1);
  assert.equal(exported.exportedLedgerRows, exported.transactions.length);
  assert.equal(exported.contract.countersSource, 'serialized-evidence-rows');
  assert.equal(projections.length, 1);
  assert.doesNotMatch(projections[0], /(?:^|\s)(?:password|ip|token|sessionHash|private)(?:\s|$)/i);
  assert.doesNotMatch(response.output, /secret-password|127\.0\.0\.1|private-session/);
});

test('CSV route exports the complete hash history beyond the UI preview and keeps inferred ownership separate', async () => {
  const current = new Date(), address = '0x' + 'a'.repeat(40), contractAddress = '0x' + 'c'.repeat(40);
  const history = Array.from({ length: 30 }, (_, i) => ({ txHash: '0x' + (i + 1).toString(16).padStart(64, '0') }));
  const associated = [{ txHash: '0x' + 'b'.repeat(64) }];
  const rawPlayers = [
    { _id: 'alice-id', playerName: 'Alice', Username: '=HYPERLINK("evil")', address, registeredAt: current, lastSeen: current,
      playtimeSeconds: 3600, playtimeSource: 'server-socket', txCount: 30, revertedTxCount: 0, pendingTxCount: 0,
      inferredTxCount: 1, lastTxHash: history.at(-1).txHash, lastAssociatedTxHash: associated[0].txHash },
    { _id: 'bob-id', playerName: 'Bob', playtimeSeconds: null, playtimeSource: 'unmeasured', txCount: 0, revertedTxCount: 0, pendingTxCount: 0, inferredTxCount: 0 }
  ];
  const cursor = rows => ({ async *[Symbol.asyncIterator]() { yield* rows; }, async close() {} });
  const query = rows => ({ lean() { return this; }, select() { return this; }, sort() { return this; }, exec: async () => rows, cursor: () => cursor(rows) });
  const models = {};
  const db = { models, base: { Schema: class { index() {} } }, model: name => models[name] };
  models.ImpactAnalyticsMeta = { findById: () => query({ coverageStartedAt: current }), findOneAndUpdate: () => query({ coverageStartedAt: current }) };
  models.ImpactPlaySegment = { collection: { name: 'impact_play_segments' }, find: () => query([]) };
  const projections = [], filters = [];
  const Transaction = { collection: { name: 'impact_transactions' }, aggregate(pipeline) {
    const match = pipeline[0].$match;
    assert.equal(match.attributionStatus, 'attributed');
    assert.equal(match.status, 'confirmed');
    return { exec: async () => match.playerName.$in.includes('Alice') ? [
      { _id: { playerName: 'Alice', action: 'minar' }, count: 20, technicalFallbackCount: 0 },
      { _id: { playerName: 'Alice', action: 'increaseInvoiceQuantity' }, count: 10, technicalFallbackCount: 10 }
    ] : [] };
  }, find(filter) {
    filters.push(filter);
    const rows = filter.playerName === 'Alice' ? (filter.attributionStatus === 'inferred' ? associated : history) : [];
    const result = query(rows); result.select = function(value) { projections.push(value); return this; }; return result;
  } };
  const routes = new Map();
  analytics.mountImpactAnalytics({
    app: { get(route, ...handlers) { routes.set(route, handlers); }, post() {} },
    GamePlayer: { db, collection: { name: 'gameplayers' }, aggregate: () => ({ allowDiskUse() { return this; }, cursor: () => cursor(rawPlayers) }) },
    UserActivity: { collection: { name: 'useractivities' } }, PlayerPlaytime: { collection: { name: 'player_playtime' } },
    chainAudit: { Transaction }, contractAddress, chainId: 4441,
    adminAuth() {}, apiLimiter() {}, strictLimiter() {}, csrfProtection() {}
  });
  let output = '';
  const response = { set() { return this; }, write(text) { output += text; return true; }, end() {}, destroy(error) { throw error; },
    status() { return this; }, json(value) { throw new Error(JSON.stringify(value)); } };
  await routes.get('/api/admin/impact/export/users.csv').at(-1)({ query: {} }, response);
  function parseCSV(text) {
    const rows = []; let fields = [], value = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
      else if (char === ',' && !quoted) { fields.push(value); value = ''; }
      else if (char === '\n' && !quoted) { fields.push(value.replace(/\r$/, '')); rows.push(fields); fields = []; value = ''; }
      else value += char;
    }
    return rows;
  }
  const [headers, alice, bob] = parseCSV(output.replace(/^\uFEFF/, ''));
  const fields = Object.fromEntries(headers.map((header, index) => [header, alice[index]]));
  assert.equal(fields.confirmed_tx_count, '30');
  assert.equal(fields.inferred_tx_count, '1');
  assert.equal(fields.confirmed_tx_per_hour, '30');
  assert.equal(fields.username, '\'=HYPERLINK("evil")');
  assert.deepEqual(fields.all_actor_canonical_tx_hashes.split(';'), history.map(row => row.txHash));
  assert.deepEqual(fields.all_inferred_associated_tx_hashes.split(';'), associated.map(row => row.txHash));
  assert.deepEqual(JSON.parse(fields.actions_json), { minar: 20, increaseInvoiceQuantity: 10 });
  assert.equal(bob[headers.indexOf('playtime_seconds')], '');
  assert.equal(bob[headers.indexOf('all_actor_canonical_tx_hashes')], '');
  assert.equal(alice.length, headers.length);
  assert.equal(bob.length, headers.length);
  assert.ok(filters.every(filter => filter.contractAddress === contractAddress && filter.chainId === 4441 && filter.canonical === true));
  assert.ok(projections.every(projection => projection === 'txHash -_id'));
  assert.doesNotMatch(headers.join(','), /password|token|sessionHash|\bip\b/);
});

function diagnosticFixture(options = {}) {
  const routes = new Map(), models = {}, commands = [], calls = { metadataReads: 0, metadataWrites: 0, scans: 0 };
  const query = value => ({ lean() { return this; }, exec: async () => value });
  const db = { models, base: { Schema: class { index() {} } }, model: name => models[name],
    db: {
      async command(command) { commands.push(command); return options.command ? options.command(command) : { ok: 1 }; },
      admin() { return { async command(command) { commands.push(command); return options.adminCommand ? options.adminCommand(command) : { indexBuildMinAvailableDiskSpaceMB: 500 }; } }; }
    } };
  models.ImpactAnalyticsMeta = { findById() { calls.metadataReads++; return query({ coverageStartedAt: new Date(0) }); },
    findOneAndUpdate() { calls.metadataWrites++; throw new Error('Reads must not require Mongo write capacity'); } };
  models.ImpactPlaySegment = { collection: { name: 'impact_play_segments' } };
  const adminAuth = () => {}, apiLimiter = () => {}, strictLimiter = () => {}, csrfProtection = () => {};
  const mounted = analytics.mountImpactAnalytics({
    app: { get(path, ...handlers) { routes.set(path, handlers); }, post(path, ...handlers) { routes.set('POST ' + path, handlers); } },
    GamePlayer: { db, collection: { name: 'players' } }, UserActivity: { collection: { name: 'activities' } },
    PlayerPlaytime: { collection: { name: 'playtime' } }, contractAddress: '0x' + 'c'.repeat(40), chainId: 4441,
    chainAudit: { describeError, Transaction: { collection: { name: 'ledger' } },
      async startScan() { calls.scans++; if (options.scanError) throw options.scanError; return { status: 'running' }; },
      async getScanStatus() { return { status: 'idle', initializationDiagnostic: options.initializationDiagnostic || null }; } },
    provider: options.provider, adminAuth, apiLimiter, strictLimiter, csrfProtection
  });
  const response = () => ({ headersSent: false, status(code) { this.code = code; return this; }, json(body) { this.body = body; }, set() { return this; } });
  return { routes, mounted, calls, commands, response, adminAuth, apiLimiter, strictLimiter, csrfProtection };
}

test('POST scan names Mongo storage/index failures and RPC failures without exposing driver secrets', async () => {
  const cases = [
    { error: Object.assign(new Error('Mongo error at mongodb+srv://root:secret@example.test/db?token=private'),
      { name: 'MongoServerError', code: 14031, codeName: 'OutOfDiskSpace', stage: 'mongo_indexes' }),
      status: 507, code: 14031, stage: 'mongo_indexes', kind: 'impact_storage_full', phrase: /espacio libre requerido/ },
    { error: Object.assign(new Error('Cannot create index'), { name: 'MongoServerError', code: 67, codeName: 'CannotCreateIndex', stage: 'mongo_indexes' }),
      status: 503, code: 67, stage: 'mongo_indexes', kind: 'impact_database_error', phrase: /CannotCreateIndex/ },
    { error: Object.assign(new Error('could not coalesce error at https://rpc.example.test/secret'), {
      code: 'UNKNOWN_ERROR', info: { error: { code: -32000, message: 'method unavailable Authorization=secret-token' } }, stage: 'rpc_head' }),
      status: 503, code: -32000, stage: 'rpc_head', kind: 'impact_rpc_error', phrase: /consulta RPC/ },
    { error: Object.assign(new Error('rpc_chain_mismatch_expected_4441_received_1'), { stage: 'rpc_chain_validation' }),
      status: 422, code: null, stage: 'rpc_chain_validation', kind: 'impact_configuration_error', phrase: /configuración/ }
  ];
  const logged = [], original = console.error;
  console.error = (...values) => logged.push(values.join(' '));
  try { for (const item of cases) {
    const fixture = diagnosticFixture({ scanError: item.error });
    const handlers = fixture.routes.get('POST /api/admin/impact/scan');
    assert.equal(handlers[0], fixture.adminAuth);
    assert.equal(handlers[1], fixture.strictLimiter);
    assert.equal(handlers[2], fixture.csrfProtection);
    const response = fixture.response();
    await handlers.at(-1)({ body: {} }, response);
    assert.equal(response.code, item.status);
    assert.equal(response.body.error, item.kind);
    assert.equal(response.body.code, item.code);
    assert.equal(response.body.stage, item.stage);
    assert.equal(response.body.diagnostic.code, item.code);
    assert.match(response.body.message, item.phrase);
    assert.doesNotMatch(JSON.stringify(response.body), /root:secret|example\.test|secret-token|token=private|Mongo\/RPC esté disponible/);
    assert.equal(fixture.calls.scans, 1);
  } } finally { console.error = original; }
  assert.doesNotMatch(logged.join('\n'), /root:secret|example\.test|secret-token|token=private/);
});

test('existing measurement coverage remains readable when MongoDB has no write capacity', async () => {
  const fixture = diagnosticFixture();
  const coverage = await fixture.mounted.ensureReady();
  assert.equal(coverage.coverageStartedAt.getTime(), 0);
  assert.equal(fixture.calls.metadataReads, 1);
  assert.equal(fixture.calls.metadataWrites, 0);
});

test('admin diagnostics read Mongo storage and RPC independently without starting a scanner or writing metadata', async () => {
  const fixture = diagnosticFixture({
    command: command => command.ping ? { ok: 1 } : { ok: 1, dataSize: 5, storageSize: 10, indexSize: 2,
      fsUsedSize: 95, fsTotalSize: 100, db: 'private-database', user: 'root', password: 'private' },
    provider: { getNetwork: async () => ({ chainId: 4441n }), getBlockNumber: async () => 1234 }
  });
  const handlers = fixture.routes.get('/api/admin/impact/diagnostics');
  assert.equal(handlers[0], fixture.adminAuth);
  assert.equal(handlers[1], fixture.apiLimiter);
  const response = fixture.response();
  await handlers.at(-1)({}, response);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.mongodb.connected, true);
  assert.deepEqual(response.body.mongodb.storage, { dataSizeMB: 5, storageSizeMB: 10, indexSizeMB: 2, fsUsedSizeMB: 95, fsTotalSizeMB: 100, fsAvailableSizeMB: 5 });
  assert.equal(response.body.mongodb.indexBuildDiskRequirement.minimumAvailableMB, 500);
  assert.equal(response.body.mongodb.indexBuildDiskRequirement.enoughSpaceForIndexBuild, false);
  assert.equal(response.body.rpc.reachable, true);
  assert.equal(response.body.rpc.chainMatches, true);
  assert.equal(response.body.rpc.headBlock, 1234);
  assert.equal(response.body.rpc.chainId, 4441);
  assert.deepEqual(fixture.commands, [{ ping: 1 }, { dbStats: 1, scale: 1048576 }, { getParameter: 1, indexBuildMinAvailableDiskSpaceMB: 1 }]);
  assert.equal(fixture.calls.metadataWrites, 0);
  assert.equal(fixture.calls.scans, 0);
  assert.doesNotMatch(JSON.stringify(response.body), /private-database|password|root|private/);
  assert.match(response.body.mongodb.capacityNote, /no prueban la cuota disponible/);
});

test('diagnostics distinguish a denied dbStats permission from an online Mongo ping and a failing RPC', async () => {
  const fixture = diagnosticFixture({
    command: command => { if (command.ping) return { ok: 1 }; throw Object.assign(new Error('not authorized at mongodb://user:password@host/db'), { name: 'MongoServerError', code: 13, codeName: 'Unauthorized' }); },
    provider: { getNetwork: async () => { throw Object.assign(new Error('RPC unavailable at https://rpc.example.test/private?api_key=secret'), { code: 'NETWORK_ERROR' }); },
      getBlockNumber: async () => { throw Object.assign(new Error('RPC timeout'), { code: 'TIMEOUT' }); } }
  });
  const response = fixture.response();
  await fixture.routes.get('/api/admin/impact/diagnostics').at(-1)({}, response);
  assert.equal(response.body.mongodb.connected, true);
  assert.equal(response.body.mongodb.storage, null);
  assert.equal(response.body.mongodb.statsDiagnostic.code, 13);
  assert.equal(response.body.mongodb.statsDiagnostic.error, 'impact_database_error');
  assert.equal(response.body.rpc.reachable, false);
  assert.equal(response.body.rpc.diagnostics.length, 2);
  assert.ok(response.body.rpc.diagnostics.every(item => item.error === 'impact_rpc_error'));
  assert.doesNotMatch(JSON.stringify(response.body), /user:password|rpc\.example\.test|api_key=secret/);
});

test('Mongo diagnostic timeout stays a database error; a wrong RPC chain stays a configuration error', async () => {
  const timeout = Object.assign(new Error('Mongo timeout'), { code: 'TIMEOUT', stage: 'mongo_storage_stats' });
  assert.equal(analytics._test.impactFailure(timeout, { describeError }).body.error, 'impact_database_error');
  const fixture = diagnosticFixture({ provider: { getNetwork: async () => ({ chainId: 1n }), getBlockNumber: async () => 50 } });
  const response = fixture.response();
  await fixture.routes.get('/api/admin/impact/diagnostics').at(-1)({}, response);
  assert.equal(response.body.rpc.chainMatches, false);
  assert.equal(response.body.rpc.diagnostics[0].error, 'impact_configuration_error');
});

test('8 GiB capacity and 209 MiB used reports sufficient current headroom without claiming a stored 14031 is current', async () => {
  const fixture = diagnosticFixture({
    command: command => command.ping ? { ok: 1 } : { fsUsedSize: 209, fsTotalSize: 8192 },
    initializationDiagnostic: { code: 14031, codeName: 'OutOfDiskSpace', stage: 'mongo_indexes' }
  });
  const response = fixture.response();
  await fixture.routes.get('/api/admin/impact/diagnostics').at(-1)({}, response);
  assert.equal(response.body.mongodb.storage.fsAvailableSizeMB, 7983);
  assert.equal(response.body.mongodb.indexBuildDiskRequirement.enoughSpaceForIndexBuild, true);
  assert.equal(response.body.mongodb.connected, true);
  assert.equal(fixture.calls.metadataWrites, 0);
  assert.equal(fixture.calls.scans, 0);
});
