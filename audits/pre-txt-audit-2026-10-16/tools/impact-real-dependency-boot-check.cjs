'use strict';

// Validate only the embedded analytics factories against installed runtime
// dependencies. The game server, dotenv, database and RPC are never started.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const acorn = require('acorn');

const root = path.resolve(__dirname, '..');
function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  if (!process.argv[index + 1] || process.argv[index + 1].startsWith('--')) {
    throw new Error('Missing value for ' + name);
  }
  return path.resolve(process.argv[index + 1]);
}
function packageVersion(name, loader) {
  let directory = path.dirname(loader.resolve(name));
  for (;;) {
    const candidate = path.join(directory, 'package.json');
    if (fs.existsSync(candidate)) {
      const metadata = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (metadata.name === name) return metadata.version;
    }
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error('Cannot locate package metadata: ' + name);
    directory = parent;
  }
}

async function main() {
  const backend = argument('--backend', path.join(root, 'backend-impact', 'server2.js'));
  const dependencies = argument('--deps', path.resolve(root, '..', '..', 'backendnuevo (backen.js) Developer'));
  const output = argument('--output', path.join(root, 'audits', 'cors-startup-fix-2026-10-14', 'real-dependency-boot.json'));
  const abiFile = argument('--abi', null);
  const source = fs.readFileSync(backend, 'utf8');
  const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
  const factoryNames = ['cargarLitvmChainAuditIntegrado', 'cargarLitvmImpactAnalyticsIntegrado'];
  const factories = factoryNames.map(name => {
    const found = ast.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name);
    assert(found, 'Embedded factory missing: ' + name);
    return source.slice(found.start, found.end);
  });
  let externalRequires = 0, networkCalls = 0;
  const builtinRequires = [];
  const logs = [];
  const context = vm.createContext({
    require(name) {
      if (!name.startsWith('node:')) { externalRequires++; throw new Error('External dependency denied: ' + name); }
      builtinRequires.push(name);
      return require(name);
    },
    console: { log: (...args) => logs.push(args.map(String).join(' ')),
      warn: (...args) => logs.push(args.map(String).join(' ')),
      error: (...args) => logs.push(args.map(String).join(' ')) },
    process: { env: {} }, setTimeout, clearTimeout, setInterval, clearInterval
  });
  vm.runInContext(factories.join('\n'), context, { timeout: 1000 });
  const auditModule = context.cargarLitvmChainAuditIntegrado();
  const impactModule = context.cargarLitvmImpactAnalyticsIntegrado();
  const loader = createRequire(path.join(dependencies, 'package.json'));
  const mongooseLibrary = loader('mongoose');
  const mongoose = new mongooseLibrary.Mongoose();
  const ethersLibrary = loader('ethers');
  const ethers = ethersLibrary.ethers || ethersLibrary;
  const express = loader('express');
  mongoose.set('bufferCommands', false);
  mongoose.set('autoCreate', false);
  mongoose.set('autoIndex', false);
  const schema = () => new mongoose.Schema({ playerName: String, address: String });
  const GamePlayer = mongoose.model('IsolatedPlayer', schema());
  const UserActivity = mongoose.model('IsolatedActivity', schema());
  const PlayerPlaytime = mongoose.model('IsolatedPlaytime', schema());
  const RelayTransaction = mongoose.model('IsolatedRelay', schema());
  const deniedNetwork = async () => { networkCalls++; throw new Error('Network denied in isolated boot validation'); };
  const provider = { send: deniedNetwork, broadcastTransaction: deniedNetwork };
  const address = '0x686E17D89Bf97247fadC04C3A3f0dfD02F914115';
  let abi = auditModule.INVOICE_ABI;
  if (abiFile) {
    const loaded = JSON.parse(fs.readFileSync(abiFile, 'utf8'));
    abi = Array.isArray(loaded) ? loaded : loaded.abi;
    assert(Array.isArray(abi), 'ABI must be an array');
  }
  const unhandled = [];
  const onRejection = error => unhandled.push(error && error.message || String(error));
  process.on('unhandledRejection', onRejection);
  let result;
  try {
    const chainAudit = auditModule.createChainAudit({
      mongoose, ethers, provider, GamePlayer, RelayTransaction,
      contractAddress: address, chainId: 4441, contractAbi: abi
    });
    const app = express();
    const middleware = (req, res, next) => next();
    const analytics = impactModule.mountImpactAnalytics({
      app, mongoose, ethers, provider, GamePlayer, UserActivity, PlayerPlaytime,
      RelayTransaction, chainAudit, contractAddress: address, chainId: 4441,
      explorerUrl: 'https://liteforge.explorer.caldera.xyz', getRelayerWallet: () => null,
      adminAuth: middleware, apiLimiter: middleware, strictLimiter: middleware, csrfProtection: middleware
    });
    assert(analytics && typeof analytics.summary === 'function');
    assert.equal(chainAudit.Transaction.schema.path('invoiceUpdates').schema.path('tipo').instance, 'String');
    const routeStack = (app._router || app.router).stack;
    const routes = routeStack.filter(layer => layer.route).map(layer => ({
      path: layer.route.path, methods: Object.keys(layer.route.methods)
    }));
    assert.equal(routes.length, 7);
    assert(routes.some(route => route.path === '/api/admin/impact/diagnostics'));
    await new Promise(resolve => setTimeout(resolve, 75));
    assert.equal(externalRequires, 0);
    assert.equal(networkCalls, 0);
    assert.equal(unhandled.length, 0);
    await assert.rejects(analytics.ensureReady(), error => /^mongo_/.test(error.stage || ''),
      'Disconnected Mongo initialization must reject with its database stage');
    assert(logs.some(message => message.includes('Impact analytics:')),
      'Disconnected Mongo initialization must be logged without an unhandled rejection');
    result = {
      passed: true, generatedAt: new Date().toISOString(), nodeVersion: process.version,
      backend, backendSha256: crypto.createHash('sha256').update(source).digest('hex'),
      dependencies: Object.fromEntries(['mongoose', 'ethers', 'express'].map(name => [name, packageVersion(name, loader)])),
      factories: factoryNames, externalRequires, builtinRequires, networkCalls,
      mongooseConnectionState: mongoose.connection.readyState,
      ledgerSchemaPaths: Object.keys(chainAudit.Transaction.schema.paths).length,
      invoiceUpdateTipoSchemaType: 'String', models: Object.keys(mongoose.models),
      routes, mounted: true, unhandledRejections: unhandled,
      disconnectedMongoInitializationCaught: true,
      validationScope: 'Analytics factories only. No full server startup, dotenv, live database, HTTP listener or RPC transaction.'
    };
  } finally {
    process.removeListener('unhandledRejection', onRejection);
    await mongoose.disconnect();
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  process.stdout.write('PASS embedded analytics mount with real dependencies; network=0; external modules=0; unhandled rejections=0\n');
  process.stdout.write(output + '\n');
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
