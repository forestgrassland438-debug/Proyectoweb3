'use strict';

// Read-only chain indexer. It never signs, retries gameplay, or updates legacy counters.
// Its unique (chainId, contractAddress, txHash) ledger is the source of tx counts.
const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const ZERO = '0x0000000000000000000000000000000000000000';
const HASH_RX = /^0x[0-9a-f]{64}$/i;
const ADDRESS_RX = /^0x[0-9a-f]{40}$/i;
const INVOICE_ABI = [
  'function createInvoice(address _owner,string _tipo,uint256 _cantidad,string _manualId) returns (uint256)',
  'function increaseInvoiceQuantity(uint256 _id,uint256 _increaseAmount) returns (uint256)',
  'function decreaseInvoiceQuantity(uint256 _id,uint256 _decreaseAmount) returns (uint256)',
  'function deleteInvoice(uint256 _id)',
  'function transferInvoice(address _fromOwner,address _toOwner,uint256 _id,uint256 _amount,string _newManualId) returns (uint256)',
  'function transferQuantityBetweenInvoices(uint256 fromId,uint256 toId,uint256 amount)',
  'function setInvoiceSlotsBatch(address _owner,uint256[] _ids,uint32[] _slots) returns (uint256)',
  'function setLimit(string _tipo,uint256 _limit,uint256 _perInvoiceLimit)',
  'function deprecateTipo(string _tipo)',
  'function addAdmin(address _admin)', 'function removeAdmin(address _admin)',
  'function transferOwnership(address newOwner)', 'function renounceOwnership()',
  'function sealMigration()',
  'function migrateInvoicesBatch((uint256 id,string manualId,address owner,string tipo,uint256 cantidad,bool active,uint256 createdAt)[] batch)',
  'event InvoiceCreated(uint256 indexed id,string manualId,address indexed owner,string indexed tipo,uint256 cantidad,uint256 createdAt)',
  'event InvoiceQuantityIncreased(uint256 indexed id,uint256 increaseAmount,uint256 newCantidad)',
  'event InvoiceQuantityDecreased(uint256 indexed id,uint256 decreaseAmount,uint256 newCantidad)',
  'event InvoiceDeleted(uint256 indexed id,string manualId)',
  'event InvoiceTransferred(uint256 indexed originalId,uint256 newId,address indexed from,address indexed to,uint256 amount)',
  'event InvoiceQuantityMoved(uint256 indexed fromId,uint256 indexed toId,uint256 amount)',
  'event InvoiceMigrated(uint256 indexed id,address indexed owner,string tipo,uint256 cantidad)',
  'event InvoiceSlotSet(uint256 indexed id,address indexed owner,uint32 slot)',
  'event TipoLimitSet(string tipo,uint256 limit,uint256 perInvoiceLimit)',
  'event TipoDeprecated(string tipo)', 'event ManualIdFreed(string manualId)',
  'event AdminAdded(address indexed admin)', 'event AdminRemoved(address indexed admin)',
  'event MigrationSealed()', 'event OwnershipTransferred(address indexed previousOwner,address indexed newOwner)'
];
const SYSTEM_ACTIONS = new Set(['setLimit','deprecateTipo','addAdmin','removeAdmin',
  'transferOwnership','renounceOwnership','sealMigration','migrateInvoicesBatch','contractDeployment']);
function address(value) { return ADDRESS_RX.test(String(value || '')) ? String(value).toLowerCase() : null; }
function hash(value) { return HASH_RX.test(String(value || '')) ? String(value).toLowerCase() : null; }
function number(value) {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'string' && value.startsWith('0x') ? Number(BigInt(value)) : Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('unsafe_integer_from_rpc');
  return n;
}
function text(value) { return value === null || value === undefined ? null : String(value); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function rpcErrorDetail(error) {
  // ethers may hide a JSON-RPC bandwidth error inside responseBody after its
  // own transport retries. Recover its structured code without exposing URLs.
  const seen = new Set();
  const visit = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 5) return null;
    seen.add(value);
    if (typeof value.code === 'number' && value.code < 0) return value;
    if (typeof value.responseBody === 'string') {
      try { const found = visit(JSON.parse(value.responseBody), depth + 1); if (found) return found; } catch (_) {}
    }
    for (const child of [value.errorResponse, value.error, value.info, value.cause]) {
      const found = visit(child, depth + 1); if (found) return found;
    }
    return null;
  };
  return visit(error);
}
function isRateLimited(error) {
  const detail = rpcErrorDetail(error) || error || {};
  return [429, -31002, -32005].includes(Number(detail.code)) ||
    /bandwidth limit|rate.?limit|too many requests|request limit|quota exceeded|http.?429/i.test(
      String(detail.message || '') + ' ' + String(error && error.message || ''));
}
function describeError(error) {
  // Error messages can embed Mongo/RPC credentials, authorization or signed bytes.
  // Preserve the actual code (including a negative JSON-RPC code), not the URL.
  const scrub = (value, limit) => String(value || '')
    .replace(/\b(?:https?|wss?|mongodb(?:\+srv)?):\/\/[^\s"'<>]+/gi, '[endpoint]')
    .replace(/\bBearer\s+[^\s,"']+/gi, 'Bearer [redacted]')
    .replace(/((?:private[_-]?key|password|authorization|api[_-]?key|access[_-]?token|secret)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]')
    .replace(/0x[0-9a-fA-F]{80,}/g, '[payload]').replace(/[\r\n\t]+/g, ' ').slice(0, limit);
  const nested = rpcErrorDetail(error) || error && (error.errorResponse || (error.info && error.info.error) || error.error || error.cause);
  const wrapped = !error || error.code == null || ['UNKNOWN_ERROR', 'SERVER_ERROR', 'NETWORK_ERROR'].includes(error.code);
  const detail = wrapped && nested && nested.code != null ? nested : error;
  const rawCode = detail && detail.code;
  const code = typeof rawCode === 'number' && Number.isFinite(rawCode) ? rawCode
    : rawCode === null || rawCode === undefined ? null
      : String(rawCode).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) || null;
  const codeName = String(detail && detail.codeName ||
    (String(code) === '14031' ? 'OutOfDiskSpace' : '')).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || null;
  return { code, codeName, message: scrub(detail && detail.message || error && error.message || 'chain_audit_error', 240),
    stage: String(error && error.stage || detail && detail.stage || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || null };
}
function safeError(error) {
  const detail = describeError(error);
  return [detail.code === null ? null : String(detail.code), detail.codeName,
    detail.message, detail.stage && 'stage=' + detail.stage].filter(Boolean).join(': ').slice(0, 480);
}
async function withStage(stage, operation) {
  try { return await operation(); }
  catch (error) {
    if (error && typeof error === 'object' && !error.stage) error.stage = stage;
    throw error;
  }
}
function mergeAttribution(candidates, source) {
  const byName = new Map();
  for (const c of candidates) if (c && c.playerName) byName.set(c.playerName, c);
  const players = [...byName.values()];
  if (players.length === 1) return { attributionStatus: 'attributed', playerName: players[0].playerName,
    playerAddress: address(players[0].address), attributionSource: source,
    attributionCandidates: players.map(p => p.playerName) };
  return { attributionStatus: players.length > 1 ? 'ambiguous' : 'unattributed', playerName: null,
    playerAddress: null, attributionSource: source, attributionCandidates: players.map(p => p.playerName) };
}

function createChainAudit(options) {
  const { mongoose, ethers, provider, GamePlayer, RelayTransaction, contractAddress, chainId } = options;
  const readProvider = options.readProvider || provider;
  const contract = address(contractAddress);
  if (!contract || !Number.isSafeInteger(Number(chainId))) throw new Error('invalid_chain_audit_configuration');
  const scanFromGenesis = options.scanFromGenesis === true;
  const configuredDeploymentHash = !scanFromGenesis && options.deploymentTxHash ? hash(options.deploymentTxHash) : null;
  if (!scanFromGenesis && options.deploymentTxHash && !configuredDeploymentHash) throw new Error('invalid_deployment_proof_hash_configuration');
  const networkId = Number(chainId);
  const scope = { chainId: networkId, contractAddress: contract };
  const key = networkId + ':' + contract;
  const owner = crypto.randomUUID();
  const playerContext = new AsyncLocalStorage();
  const confirmations = Math.max(2, number(options.confirmations ?? process.env.LITVM_AUDIT_CONFIRMATIONS ?? 12));
  const reorgDepth = Math.max(confirmations * 2, number(options.reorgDepth ?? 64));
  const leaseMs = Math.max(60000, number(options.leaseMs ?? 120000));
  const rpcTimeoutMs = Math.max(1000, number(options.rpcTimeoutMs ?? 15000));
  const rpcIntervalMs = Math.max(0, number(options.rpcMinIntervalMs ?? process.env.LITVM_AUDIT_RPC_INTERVAL_MS ?? 250));
  const retryBaseMs = Math.max(1, number(options.retryBaseMs ?? process.env.LITVM_AUDIT_RETRY_BASE_MS ?? 30000));
  const retryMaxMs = Math.max(retryBaseMs, number(options.retryMaxMs ?? process.env.LITVM_AUDIT_RETRY_MAX_MS ?? 900000));
  const maintenanceIntervalMs = Math.max(10, number(options.maintenanceIntervalMs ?? 15000));
  const maintenanceStartDelayMs = Math.max(0, number(options.maintenanceStartDelayMs ?? 5000));
  const random = typeof options.random === 'function' ? options.random : Math.random;
  const logger = options.logger || console;
  const interfaces = [new ethers.Interface(options.contractAbi || []), new ethers.Interface(INVOICE_ABI)];
  const transactionSchema = new mongoose.Schema({
    chainId: { type: Number, required: true }, contractAddress: { type: String, required: true },
    txHash: { type: String, required: true }, from: String, to: String, nonce: Number,
    status: { type: String, enum: ['signed','pending','confirmed','reverted','orphaned','unknown'], required: true },
    canonical: { type: Boolean, default: false }, finalized: { type: Boolean, default: false },
    blockNumber: Number, blockHash: String, transactionIndex: Number, timestamp: Date,
    firstSeenAt: { type: Date, default: Date.now }, lastSeenAt: Date,
    submittedAt: Date, confirmedAt: Date, receiptObservedAt: Date,
    attributionStatus: { type: String, enum: ['attributed','inferred','ambiguous','unattributed','system'], default: 'unattributed' },
    actorVerified: { type: Boolean, default: false }, participantPlayerNames: [String],
    playerName: String, playerAddress: String, attributionSource: String, attributionCandidates: [String],
    action: String, gameplayAction: String, actions: [String], eventNames: [String], invoiceIds: [String],
    invoiceUpdates: [{ _id: false, id: String, owner: String, tipo: String, manualId: String }],
    selector: String, source: String, sources: [String], gasUsed: String, effectiveGasPrice: String,
    receiptStatus: Number, legacyTransactionId: String, scanGeneration: Number
  }, { collection: 'litvm_chain_transactions', versionKey: false, autoCreate: false, autoIndex: false });
  transactionSchema.index({ chainId: 1, contractAddress: 1, txHash: 1 }, { unique: true });
  transactionSchema.index({ chainId: 1, contractAddress: 1, canonical: 1, status: 1, playerName: 1 });
  transactionSchema.index({ chainId: 1, contractAddress: 1, blockNumber: 1, transactionIndex: 1 });
  transactionSchema.index({ chainId: 1, contractAddress: 1, 'invoiceUpdates.id': 1, blockNumber: -1 });
  const diagnosticSchema = { _id: false, code: mongoose.Schema.Types ? mongoose.Schema.Types.Mixed : Object,
    codeName: String, message: String, stage: String };
  const scanSchema = new mongoose.Schema({
    _id: String, chainId: Number, contractAddress: String, status: String, owner: String, generation: Number,
    leaseUntil: Date, fromBlock: Number, nextBlock: Number, targetBlock: Number,
    lastProcessedBlock: Number, lastProcessedHash: String, processedBlocks: Number,
    indexedTransactions: Number, coverageStartBlock: Number, confirmations: Number,
    error: String, startedAt: Date, updatedAt: Date, completedAt: Date,
    requestedBy: String, phase: String, legacyImportedAt: Date, historyComplete: Boolean,
    reorgDetected: Boolean,
    legacyImportError: String, liveCaptureError: String, liveCaptureErrorAt: Date,
    initializationError: String, initializationDiagnostic: diagnosticSchema,
    legacyImportDiagnostic: diagnosticSchema, errorDiagnostic: diagnosticSchema,
    autoResume: Boolean, nextRetryAt: Date, retryCount: Number, retryReason: String,
    rpcIntervalMs: Number, deploymentBlock: Number, deploymentTxHash: String,
    deploymentBlockHash: String, deploymentVerifiedAt: Date, coverageBasis: String,
    contractExecutionHistoryComplete: Boolean
  }, { collection: 'litvm_chain_scans', versionKey: false, autoCreate: false, autoIndex: false });
  const Transaction = mongoose.models.LitvmChainTransaction || mongoose.model('LitvmChainTransaction', transactionSchema);
  const Scan = mongoose.models.LitvmChainScan || mongoose.model('LitvmChainScan', scanSchema);
  let running = null, initialized = null, timer = null, initialTimer = null, disposed = false, starting = false;
  let originalBroadcast = null, installedBroadcast = null, reconcileRunning = false;
  let activeGeneration = null;
  let rpcQueue = Promise.resolve(), nextRpcAt = 0, rpcBlockedUntil = 0, lastRpcError = null;
  let maintenanceBusy = false, didImport = false, lastReconcileAt = 0;
  const queryLean = q => typeof q.lean === 'function' ? q.lean() : q;
  let initializationDiagnostic = null;
  const initialize = () => initialized || (initialized = (async () => {
    // Model.init() caches its rejected promise in Mongoose. A transient failure
    // (e.g. disk exhausted during index creation) must be retryable after repair.
    // Explicit public APIs avoid that cache and keep the unique index mandatory.
    await withStage('mongo_collections', async () => {
      if (typeof Transaction.createCollection === 'function') await Transaction.createCollection();
      if (typeof Scan.createCollection === 'function') await Scan.createCollection();
    });
    await withStage('mongo_indexes', async () => {
      if (typeof Transaction.createIndexes === 'function') await Transaction.createIndexes();
    });
    initializationDiagnostic = null;
    await withStage('mongo_initialization_state', () => Scan.updateOne({ _id: key },
      { $unset: { initializationError: '', initializationDiagnostic: '' } }));
  })().catch(async error => {
    initializationDiagnostic = describeError(error);
    // Best effort only: a full/unavailable DB may also reject the diagnostic.
    await Scan.updateOne({ _id: key }, { $set: { ...scope, initializationError: safeError(error),
      initializationDiagnostic }, $setOnInsert: { status: 'idle', nextBlock: 0 } }, { upsert: true }).catch(() => {});
    initialized = null;
    throw error;
  }));

  function retryDelay(failures) {
    const base = Math.min(retryMaxMs, retryBaseMs * (2 ** Math.min(10, Math.max(0, failures - 1))));
    return Math.min(retryMaxMs, Math.max(1, Math.round(base * (0.85 + Math.max(0, Math.min(1, random())) * 0.3))));
  }
  function cooldownError() {
    const error = new Error(lastRpcError && lastRpcError.message || 'rpc_cooldown_active');
    Object.assign(error, lastRpcError || {}, { rpcRetryable: true, retryAt: rpcBlockedUntil });
    return error;
  }
  async function waitForRead(ms) {
    const until = Date.now() + ms;
    while (!disposed && until > Date.now()) {
      await sleep(Math.min(10000, until - Date.now()));
      // Slow, operator-configured pacing cannot silently outlive the lease.
      if (until > Date.now() && activeGeneration !== null && (running || starting)) await renew();
    }
    if (disposed) throw new Error('scan_stopped');
  }
  async function rpcRequest(method, params, attempts) {
    for (let i = 0; ; i++) {
      if (disposed) throw new Error('scan_stopped');
      if (rpcBlockedUntil > Date.now()) throw cooldownError();
      const wait = Math.max(0, nextRpcAt - Date.now());
      if (wait) await waitForRead(wait);
      if (rpcBlockedUntil > Date.now()) throw cooldownError();
      nextRpcAt = Date.now() + rpcIntervalMs;
      let timeout;
      try {
        return await Promise.race([readProvider.send(method, params), new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('rpc_timeout_' + method)), rpcTimeoutMs);
        })]);
      } catch (error) {
        if (error && typeof error === 'object') {
          if (!error.stage) error.stage = 'rpc_' + method;
          error.rpcRetryable = true;
          error.rateLimited = isRateLimited(error);
        }
        // A bandwidth response is not helped by immediate retries. Share its
        // cooldown between the historical scanner and receipt reconciliation.
        if (isRateLimited(error) || i + 1 >= attempts || /rpc_timeout_/.test(String(error && error.message))) {
          rpcBlockedUntil = Date.now() + retryDelay(1);
          lastRpcError = { ...describeError(error), rateLimited: isRateLimited(error) };
          if (error && typeof error === 'object') error.retryAt = rpcBlockedUntil;
          throw error;
        }
        await waitForRead(Math.min(4000, 250 * (2 ** i)));
      } finally { clearTimeout(timeout); }
    }
  }
  function rpc(method, params, attempts = 3) {
    // Only audit reads enter this queue. The original broadcast provider and
    // gameplay signing path are never delayed by historical recovery.
    const result = rpcQueue.then(() => rpcRequest(method, params, attempts));
    rpcQueue = result.catch(() => {});
    return result;
  }
  async function validateChain() {
    return withStage('rpc_chain_validation', async () => {
    const actual = number(await rpc('eth_chainId', []));
    if (actual !== networkId) throw new Error('rpc_chain_mismatch_expected_' + networkId + '_received_' + actual);
    const code = await rpc('eth_getCode', [contract, 'latest']);
    if (!code || /^0x0*$/i.test(code)) throw new Error('configured_contract_has_no_bytecode');
    });
  }
  async function verifyDeployment(txHash, confirmedTarget) {
    return withStage('rpc_deployment_proof_validation', async () => {
      const invalid = reason => { throw new Error('invalid_deployment_proof_' + reason); };
      await renew({ phase: 'validating_deployment' });
      const receipt = await rpc('eth_getTransactionReceipt', [txHash]);
      if (!receipt || hash(receipt.transactionHash || receipt.hash) !== txHash || number(receipt.status) !== 1 ||
          address(receipt.contractAddress) !== contract || receipt.to !== null) invalid('receipt');
      const deploymentBlock = number(receipt.blockNumber), deploymentBlockHash = hash(receipt.blockHash);
      if (!deploymentBlock || !deploymentBlockHash) invalid('block');
      if (deploymentBlock > confirmedTarget) throw new Error('deployment_proof_not_confirmed');
      await renew({ phase: 'validating_deployment' });
      const tx = await rpc('eth_getTransactionByHash', [txHash]);
      if (!tx || hash(tx.hash) !== txHash || tx.to !== null || !address(tx.from) ||
          number(tx.chainId) !== networkId || number(tx.nonce) !== 0 || number(tx.blockNumber) !== deploymentBlock ||
          hash(tx.blockHash) !== deploymentBlockHash || address(receipt.from) !== address(tx.from)) invalid('transaction');
      // A top-level CREATE by nonce-zero account is its first CREATE. Verify the
      // derived address rather than trusting an explorer's deployment label.
      if (typeof ethers.getCreateAddress !== 'function' ||
          address(ethers.getCreateAddress({ from: address(tx.from), nonce: 0 })) !== contract) invalid('create_address');
      const blockTag = '0x' + deploymentBlock.toString(16);
      await renew({ phase: 'validating_deployment' });
      const canonical = await rpc('eth_getBlockByNumber', [blockTag, false]);
      if (!canonical || number(canonical.number) !== deploymentBlock || hash(canonical.hash) !== deploymentBlockHash ||
          !Array.isArray(canonical.transactions) || !canonical.transactions.some(t => hash(typeof t === 'string' ? t : t && t.hash) === txHash)) invalid('canonical_block');
      await renew({ phase: 'validating_deployment' });
      const before = await rpc('eth_getCode', [contract, '0x' + (deploymentBlock - 1).toString(16)]);
      await renew({ phase: 'validating_deployment' });
      const after = await rpc('eth_getCode', [contract, blockTag]);
      if (before !== '0x' || !/^0x[0-9a-f]+$/i.test(String(after || ''))) invalid('historical_code');
      await renew({ phase: 'validating_deployment' });
      const check = await rpc('eth_getBlockByNumber', [blockTag, false]);
      if (!check || hash(check.hash) !== deploymentBlockHash) throw new Error('deployment_proof_changed_during_validation');
      return { deploymentBlock, deploymentTxHash: txHash, deploymentBlockHash,
        deploymentVerifiedAt: new Date() };
    });
  }
  function fencedFilter(base, generation) {
    if (generation === null || generation === undefined) return base;
    return { ...base, $and: [...(base.$and || []), { $or: [
      { scanGeneration: { $exists: false } }, { scanGeneration: { $lte: generation } }
    ] }] };
  }
  async function upsert(record, onlyInsert = false, generation = null) {
    const txHash = hash(record.txHash);
    if (!txHash) throw new Error('invalid_transaction_hash');
    const filter = fencedFilter({ ...scope, txHash }, generation);
    const at = new Date();
    const { source = 'historical', ...fields } = record;
    const update = onlyInsert ? {
      $setOnInsert: { ...scope, ...fields, txHash, firstSeenAt: at },
      $addToSet: { sources: source }, $set: { lastSeenAt: at }
    } : {
      $set: { ...fields, txHash, ...scope, source, lastSeenAt: at },
      $setOnInsert: { firstSeenAt: at }, $addToSet: { sources: source }
    };
    if (generation !== null) update.$set.scanGeneration = generation;
    let result;
    try { result = await Transaction.updateOne(filter, update, { upsert: true }); }
    catch (error) {
      if (error && error.code === 11000) result = await Transaction.updateOne(filter, update, { upsert: false });
      else throw error;
    }
    if (generation !== null && !result.matchedCount && !result.upsertedCount) throw new Error('scan_fence_rejected');
  }
  function decode(tx, receipt) {
    let parsed = null;
    for (const iface of interfaces) {
      try { parsed = iface.parseTransaction({ data: tx.input || tx.data || '0x', value: tx.value || 0 }); }
      catch (_) {}
      if (parsed) break;
    }
    const events = [];
    for (const log of receipt && receipt.logs || []) {
      if (address(log.address) !== contract) continue;
      for (const iface of interfaces) {
        try { const e = iface.parseLog(log); if (e) { events.push(e); break; } }
        catch (_) {}
      }
    }
    const action = parsed && parsed.name || (tx.to ? 'unknownSelector' : 'contractDeployment');
    const eventNames = [...new Set(events.map(e => e.name))];
    return { parsed, events, action, eventNames, actions: [...new Set([action, ...eventNames])],
      selector: (tx.input || tx.data || '0x').slice(0, 10) };
  }
  function facts(decoded) {
    const wallets = new Set(), ids = new Set(), updates = [];
    const p = decoded.parsed;
    const addWallet = value => { const a = address(value); if (a && a !== ZERO) wallets.add(a); };
    const addId = value => { if (value !== null && value !== undefined) ids.add(String(value)); };
    if (p) {
      if (p.name === 'createInvoice') addWallet(p.args[0]);
      if (p.name === 'transferInvoice') { addWallet(p.args[0]); addWallet(p.args[1]); addId(p.args[2]); }
      if (['increaseInvoiceQuantity','decreaseInvoiceQuantity','deleteInvoice'].includes(p.name)) addId(p.args[0]);
      if (p.name === 'transferQuantityBetweenInvoices') { addId(p.args[0]); addId(p.args[1]); }
      if (p.name === 'setInvoiceSlotsBatch') { addWallet(p.args[0]); for (const id of p.args[1]) addId(id); }
    }
    for (const e of decoded.events) {
      if (e.name === 'InvoiceCreated') {
        const tipo = p && p.name === 'createInvoice' ? String(p.args[1]) : null;
        const u = { id: String(e.args[0]), owner: address(e.args[2]), manualId: String(e.args[1]) };
        // Indexed dynamic tipo is a hash, never pretend it is the original string.
        if (tipo !== null) u.tipo = tipo;
        updates.push(u); addWallet(u.owner); addId(u.id);
      } else if (e.name === 'InvoiceMigrated') {
        const u = { id: String(e.args[0]), owner: address(e.args[1]), tipo: String(e.args[2]) };
        updates.push(u); addWallet(u.owner); addId(u.id);
      } else if (e.name === 'InvoiceTransferred') {
        addWallet(e.args[2]); addWallet(e.args[3]); addId(e.args[0]); addId(e.args[1]);
        updates.push({ id: String(e.args[1]), owner: address(e.args[3]) });
      } else if (e.name === 'InvoiceQuantityMoved') { addId(e.args[0]); addId(e.args[1]); }
      else if (e.name === 'InvoiceSlotSet') { addId(e.args[0]); addWallet(e.args[1]); }
      else if (e.name.startsWith('Invoice')) addId(e.args[0]);
    }
    return { wallets, ids, updates };
  }
  async function attribute(tx, decoded, f, blockNumber, txIndex, context, blockHash = null) {
    if (SYSTEM_ACTIONS.has(decoded.action)) return { attributionStatus: 'system', playerName: null,
      playerAddress: null, attributionSource: 'contract_administration', attributionCandidates: [], actorVerified: false,
      participantPlayerNames: [] };
    // Existing relayer metadata records the authenticated caller, unlike token owners.
    const known = [];
    if (context && context.playerName) known.push(context);
    // Persisted authenticated context from a live direct contract call survives
    // restart and is reusable by the historical scan. Inferred owners never qualify.
    const recordedActor = await queryLean(Transaction.findOne({ ...scope, txHash: hash(tx.hash),
      attributionStatus: 'attributed', actorVerified: true }).select('playerName playerAddress'));
    if (recordedActor) known.push({ playerName: recordedActor.playerName, address: recordedActor.playerAddress });
    if (RelayTransaction) {
      const legacy = await queryLean(RelayTransaction.find({
        txHash: { $in: [hash(tx.hash), tx.hash] }, chainId: networkId, contractAddress: contract
      }).select('playerName playerAddress functionName').limit(20));
      for (const r of legacy || []) if (r.playerName && r.playerName !== '---') known.push({ playerName: r.playerName, address: r.playerAddress });
    }
    if (known.length) {
      const names = [...new Set(known.map(p => p.playerName))];
      const rows = await queryLean(GamePlayer.find({ playerName: { $in: names } }).select('playerName address').limit(21));
      const verified = known.filter(k => (rows || []).some(p => p.playerName === k.playerName &&
        (!k.address || address(p.address) === address(k.address))));
      if (verified.length) {
        const resolved = mergeAttribution(verified, 'backend_authenticated_caller');
        return { ...resolved, actorVerified: resolved.attributionStatus === 'attributed',
          participantPlayerNames: resolved.attributionCandidates };
      }
    }
    // The signature proves the sender, and a unique backend wallet mapping proves
    // the player account. This takes precedence over any recipient of a transfer.
    const sender = address(tx.from);
    const relayer = options.getRelayerWallet && options.getRelayerWallet();
    const relayerAddress = address(relayer && relayer.address);
    if (sender && sender !== relayerAddress) {
      const senderPlayers = await queryLean(GamePlayer.find({ address: sender }).select('playerName address').limit(3));
      if (senderPlayers && senderPlayers.length) {
        const resolved = mergeAttribution(senderPlayers, 'direct_registered_sender');
        return { ...resolved, actorVerified: resolved.attributionStatus === 'attributed',
          participantPlayerNames: resolved.attributionCandidates };
      }
    }
    if (blockNumber !== null) {
      for (const id of f.ids) {
        const prior = await queryLean(Transaction.findOne({ ...scope, status: 'confirmed', canonical: true,
          'invoiceUpdates.id': id, $or: [{ blockNumber: { $lt: blockNumber } },
            { blockNumber, blockHash: hash(blockHash), transactionIndex: { $lt: txIndex } }]
        }).sort({ blockNumber: -1, transactionIndex: -1 }).select('invoiceUpdates'));
        for (const u of prior && prior.invoiceUpdates || []) if (u.id === id && u.owner) f.wallets.add(u.owner);
      }
    }
    f.wallets.delete(relayerAddress); f.wallets.delete(contract);
    const rows = f.wallets.size ? await queryLean(GamePlayer.find({ address: { $in: [...f.wallets] } })
      .select('playerName address').limit(100)) : [];
    // A multi-owner operation is not proof of which human initiated it.
    const matched = { ...mergeAttribution(rows || [], 'historical_owner_association'), actorVerified: false,
      participantPlayerNames: (rows || []).map(p => p.playerName) };
    if (matched.attributionStatus === 'attributed' && f.wallets.size > 1) return {
      ...matched, attributionStatus: 'ambiguous', playerName: null, playerAddress: null,
      attributionSource: 'multiple_participants_caller_unknown'
    };
    return matched.attributionStatus === 'attributed' ? { ...matched, attributionStatus: 'inferred' } : matched;
  }
  async function recordSubmitted(tx, context, status = 'pending') {
    if (address(tx.to) !== contract) return;
    await initialize();
    const decoded = decode(tx, null), f = facts(decoded);
    const attribution = await attribute(tx, decoded, f, null, null, context);
    await upsert({ txHash: tx.hash, from: address(tx.from), to: contract, nonce: number(tx.nonce),
      status, canonical: true, finalized: false, submittedAt: new Date(), ...attribution,
      action: decoded.action, actions: [decoded.action], eventNames: [], invoiceIds: [...f.ids],
      ...(attribution.actorVerified && context && context.gameplayAction ? { gameplayAction: context.gameplayAction } : {}),
      invoiceUpdates: [], selector: decoded.selector, source: 'live' }, true);
    // Never overwrite confirmed/reverted/orphaned information with a late mempool update.
    if (status === 'pending') await Transaction.updateOne({ ...scope, txHash: hash(tx.hash), status: 'signed' },
      { $set: { status: 'pending', submittedAt: new Date() } });
  }
  async function ingest(tx, receipt, block, head, source = 'historical', context) {
    const started = Date.now();
    const blockNumber = number(block.number), txIndex = number(receipt.transactionIndex ?? tx.transactionIndex ?? tx.index ?? 0);
    if (!hash(tx.hash) || hash(receipt.transactionHash || receipt.hash) !== hash(tx.hash)) throw new Error('receipt_transaction_hash_mismatch');
    if (hash(receipt.blockHash) !== hash(block.hash) || number(receipt.blockNumber) !== blockNumber) {
      throw new Error('receipt_block_hash_mismatch');
    }
    if (tx.transactionIndex !== undefined && number(tx.transactionIndex) !== txIndex) throw new Error('receipt_transaction_index_mismatch');
    const generation = source === 'historical' ? activeGeneration : null;
    if (source === 'historical') {
      if (generation === null) throw new Error('historical_scan_lease_required');
      await renew({ phase: 'attributing_transaction' });
      // Establish a noncanonical row before potentially slow ownership lookups.
      // A replacement worker can fence/orphan this claim even when the transaction
      // disappeared from the new fork. Existing confirmed rows are never demoted.
      await upsert({ txHash: tx.hash, status: 'unknown', canonical: false, finalized: false,
        blockNumber, blockHash: hash(block.hash), transactionIndex: txIndex,
        timestamp: new Date(number(block.timestamp) * 1000), source: 'historical' }, true, generation);
    }
    const decoded = decode(tx, receipt), f = facts(decoded);
    const attribution = await attribute(tx, decoded, f, blockNumber, txIndex, context, block.hash);
    const receiptStatus = number(receipt.status);
    if (receiptStatus !== 0 && receiptStatus !== 1) throw new Error('receipt_status_missing');
    if (source === 'historical') {
      await renew({ phase: 'saving_transaction' });
      if (Date.now() - started >= 5000) {
        const current = await rpc('eth_getBlockByNumber', ['0x' + blockNumber.toString(16), false]);
        if (!current || hash(current.hash) !== hash(block.hash)) throw new Error('block_changed_during_attribution');
        await renew({ phase: 'saving_transaction' });
      }
    }
    await upsert({ txHash: tx.hash || receipt.transactionHash, from: address(tx.from), to: address(tx.to),
      nonce: number(tx.nonce), status: receiptStatus === 1 ? 'confirmed' : 'reverted',
      canonical: true, finalized: head - blockNumber + 1 >= confirmations,
      blockNumber, blockHash: hash(block.hash), transactionIndex: txIndex,
      timestamp: new Date(number(block.timestamp) * 1000), receiptObservedAt: new Date(),
      ...attribution, action: decoded.action, actions: decoded.actions, eventNames: decoded.eventNames,
      invoiceIds: [...f.ids], invoiceUpdates: receiptStatus === 1 ? f.updates : [],
      selector: decoded.selector, receiptStatus, gasUsed: text(receipt.gasUsed),
      effectiveGasPrice: text(receipt.effectiveGasPrice ?? receipt.gasPrice), source }, false, generation);
  }
  async function getScanStatus() {
    const doc = await queryLean(Scan.findById(key));
    const { owner: _owner, _id: _id, __v: _v, requestedBy: _by, ...publicStatus } = doc || {
      status: 'idle', chainId: networkId, contractAddress: contract, confirmations,
      historyComplete: false, nextBlock: 0, indexedTransactions: 0, processedBlocks: 0 };
    // Older deployments stored only the numeric error. Explain it without
    // requiring a write to the possibly full database or a second failed POST.
    if (publicStatus.legacyImportError && !publicStatus.legacyImportDiagnostic &&
        /^-?\d+$/.test(publicStatus.legacyImportError)) publicStatus.legacyImportDiagnostic = describeError({
      code: Number(publicStatus.legacyImportError), stage: 'mongo_legacy_import',
      message: publicStatus.legacyImportError === '14031' ? 'MongoDB reported OutOfDiskSpace' : 'Legacy import failed' });
    if (initializationDiagnostic) {
      publicStatus.initializationDiagnostic = initializationDiagnostic;
      publicStatus.initializationError = safeError(initializationDiagnostic);
    }
    if (publicStatus.status === 'running' && new Date(doc && doc.leaseUntil || 0).getTime() < Date.now()) {
      publicStatus.status = 'interrupted'; publicStatus.error = 'worker_lease_expired_resume_available';
    }
    publicStatus.confirmations = confirmations;
    return publicStatus;
  }
  async function renew(extra = {}, increments = null) {
    const now = new Date();
    const result = await Scan.updateOne({ _id: key, owner, generation: activeGeneration, leaseUntil: { $gt: now } },
      { $set: { ...extra, leaseUntil: new Date(Date.now() + leaseMs), updatedAt: now },
        ...(increments ? { $inc: increments } : {}) });
    if (!result.matchedCount) throw new Error('scan_lease_lost');
  }
  async function processBlock(n, head) {
    await renew({ phase: 'reading_block' });
    const block = await rpc('eth_getBlockByNumber', ['0x' + n.toString(16), true]);
    if (!block || number(block.number) !== n || !hash(block.hash) || !Array.isArray(block.transactions)) throw new Error('block_unavailable_' + n);
    let count = 0;
    const matchedHashes = [];
    // Sequential transaction order is required for invoice ownership reconstruction.
    for (const tx of block.transactions) {
      if (!tx || typeof tx === 'string') throw new Error('rpc_full_transactions_unavailable');
      const to = address(tx.to);
      if (to !== contract && tx.to !== null) continue;
      await renew({ phase: 'reading_receipt' });
      const receipt = await rpc('eth_getTransactionReceipt', [tx.hash]);
      if (!receipt) throw new Error('receipt_unavailable_' + n);
      if (to !== contract && address(receipt.contractAddress) !== contract) continue;
      if (hash(receipt.blockHash) !== hash(block.hash) || number(receipt.blockNumber) !== n) throw new Error('block_changed_during_scan_' + n);
      await ingest(tx, receipt, block, head);
      matchedHashes.push(hash(tx.hash)); count++;
    }
    // Validate the canonical hash again before advancing the durable checkpoint.
    const check = await rpc('eth_getBlockByNumber', ['0x' + n.toString(16), false]);
    if (!check || hash(check.hash) !== hash(block.hash)) {
      await renew({ phase: 'orphaning_changed_block' });
      await Transaction.updateMany(fencedFilter({ ...scope, blockNumber: n, blockHash: hash(block.hash) }, activeGeneration),
        { $set: { canonical: false, finalized: false, status: 'orphaned', lastSeenAt: new Date(), scanGeneration: activeGeneration } });
      throw new Error('block_changed_during_scan_' + n);
    }
    await renew({ phase: 'saving_checkpoint' });
    await Transaction.updateMany(fencedFilter({ ...scope, blockNumber: n,
      $or: [{ blockHash: { $ne: hash(block.hash) } }, { txHash: { $nin: matchedHashes } }],
      status: { $in: ['confirmed', 'reverted', 'unknown'] }
    }, activeGeneration), { $set: { canonical: false, finalized: false, status: 'orphaned', lastSeenAt: new Date(), scanGeneration: activeGeneration } });
    await renew({ nextBlock: n + 1, lastProcessedBlock: n, lastProcessedHash: hash(block.hash),
      phase: 'indexing', retryCount: 0, nextRetryAt: null, retryReason: null, error: null, errorDiagnostic: null },
      { processedBlocks: 1 });
    return count;
  }
  async function runScan(start, target, head) {
    try {
      for (let n = start; n <= target && !disposed; n++) await processBlock(n, head);
      if (disposed) throw new Error('scan_stopped');
      const indexedTransactions = await Transaction.countDocuments({ ...scope, canonical: true,
        status: { $in: ['confirmed','reverted'] } });
      const completedState = await queryLean(Scan.findById(key));
      await renew({ status: 'complete', phase: 'complete', indexedTransactions, completedAt: new Date(),
        autoResume: false, nextRetryAt: null, retryCount: 0, retryReason: null,
        historyComplete: completedState.coverageStartBlock === 0,
        contractExecutionHistoryComplete: completedState.coverageStartBlock === 0 ||
          completedState.coverageBasis === 'verified_first_create' && completedState.coverageStartBlock === completedState.deploymentBlock });
      await Scan.updateOne({ _id: key, owner, generation: activeGeneration }, { $set: { leaseUntil: new Date(0) }, $unset: { owner: '' } });
    } catch (error) {
      await saveScanFailure(error);
    } finally { running = null; }
  }
  async function saveScanFailure(error) {
    const errorText = safeError(error);
    const stopped = disposed || error && error.message === 'scan_stopped';
    const rpcFailure = !!(error && error.rpcRetryable) || isRateLimited(error);
    const permanent = /rpc_chain_mismatch|configured_contract_has_no_bytecode|from_block_above_confirmed_head|invalid_chain_audit_configuration|invalid_deployment_proof_/.test(
      String(error && error.message || ''));
    try {
      const state = await queryLean(Scan.findById(key));
      const retryCount = rpcFailure ? (state && state.retryCount || 0) + 1 : 0;
      const nextRetryAt = rpcFailure ? new Date(Math.max(Date.now() + retryDelay(retryCount), Number(error.retryAt) || 0)) : null;
      if (nextRetryAt) rpcBlockedUntil = Math.max(rpcBlockedUntil, nextRetryAt.getTime());
      await Scan.updateOne({ _id: key, owner, generation: activeGeneration }, { $set: {
        status: stopped ? 'interrupted' : rpcFailure ? 'retrying' : 'error',
        phase: stopped ? 'stopped' : rpcFailure ? 'rpc_cooldown' : 'error',
        error: stopped ? null : errorText, errorDiagnostic: stopped ? null : describeError(error),
        autoResume: !permanent, retryCount, nextRetryAt,
        retryReason: rpcFailure ? isRateLimited(error) ? 'rpc_rate_limited' : 'rpc_unavailable' : null,
        leaseUntil: new Date(0), updatedAt: new Date()
      }, $unset: { owner: '' } });
    } catch (_) { /* Existing durable checkpoint remains usable if Mongo is unavailable. */ }
    if (!stopped) logger.warn('[LitVM audit] historical scan stopped:', errorText);
  }
  async function startScan(input = {}) {
    if (starting) return { ...await getScanStatus(), alreadyRunning: true };
    starting = true;
    try {
    await initialize();
    if (running) return { ...await getScanStatus(), alreadyRunning: true };
    const prior = await withStage('mongo_scan_checkpoint', () => queryLean(Scan.findById(key)));
    // Manual and automatic retries share the persisted cooldown. Reloading a
    // page, redeploying or pressing analizarCC must not defeat an RPC quota.
    const pendingRetry = new Date(prior && prior.nextRetryAt || 0).getTime();
    if (pendingRetry > Date.now()) {
      rpcBlockedUntil = Math.max(rpcBlockedUntil, pendingRetry);
      lastRpcError = prior.errorDiagnostic || lastRpcError;
      return { ...await getScanStatus(), deferred: true };
    }
    const requestedStart = scanFromGenesis ? 0 : number(input.fromBlock ?? (input.resume && prior ? prior.coverageStartBlock ?? 0 : 0));
    const now = new Date();
    let lease;
    try {
      lease = await withStage('mongo_scan_lease', () => queryLean(Scan.findOneAndUpdate({ _id: key, $or: [
        { leaseUntil: { $lte: now } }, { leaseUntil: { $exists: false } }, { owner }
      ] }, { $set: { ...scope, status: 'running', phase: 'initializing', owner,
        leaseUntil: new Date(Date.now() + leaseMs), confirmations,
        autoResume: true, rpcIntervalMs, historyComplete: false, contractExecutionHistoryComplete: false,
        startedAt: prior && prior.startedAt || now, updatedAt: now },
        $setOnInsert: { nextBlock: requestedStart, coverageStartBlock: requestedStart,
          processedBlocks: 0, indexedTransactions: 0 }, $inc: { generation: 1 }
      }, { upsert: true, new: true })));
    } catch (error) { if (!error || error.code !== 11000) throw error; }
    if (!lease || lease.owner !== owner) return { ...await getScanStatus(), alreadyRunning: true };
    activeGeneration = lease.generation;
    try {
    await validateChain();
    await renew({ phase: 'initializing' });
    const head = await withStage('rpc_head', async () => number(await rpc('eth_blockNumber', [])));
    const target = Math.max(0, head - confirmations + 1);
    if (requestedStart > target) throw new Error('from_block_above_confirmed_head');
    const deploymentHash = scanFromGenesis ? null : configuredDeploymentHash || hash(prior && prior.deploymentTxHash);
    const deployment = deploymentHash ? await verifyDeployment(deploymentHash, target) : null;
    const executionStart = deployment ? deployment.deploymentBlock : 0;
    const deploymentChanged = !!(deployment && prior && prior.deploymentBlockHash &&
      (hash(prior.deploymentBlockHash) !== deployment.deploymentBlockHash || prior.deploymentBlock !== deployment.deploymentBlock));
    const coverageRequest = deploymentChanged && input.fromBlock === undefined && prior.coverageBasis === 'verified_first_create'
      ? executionStart : requestedStart;
    let deepReorg = false;
    if (prior && prior.lastProcessedBlock !== undefined && prior.lastProcessedHash) {
      const anchor = await rpc('eth_getBlockByNumber', ['0x' + prior.lastProcessedBlock.toString(16), false]);
      if (!anchor || !hash(anchor.hash)) throw new Error('checkpoint_anchor_unavailable');
      deepReorg = hash(anchor.hash) !== hash(prior.lastProcessedHash);
    }
    const priorStart = prior && prior.startedAt ? (prior.coverageStartBlock ?? 0) : requestedStart;
    // Expanding coverage must actually scan the newly requested earlier blocks.
    const widened = Math.max(requestedStart, executionStart) < priorStart;
    const requestedCheckpoint = input.fullRescan || widened ? requestedStart : deepReorg ? Math.min(priorStart, requestedStart)
      : Math.max(requestedStart, prior && prior.nextBlock !== undefined
        ? Math.max(0, prior.nextBlock - reorgDepth) : requestedStart);
    const start = deploymentChanged ? Math.max(coverageRequest, executionStart) : Math.max(executionStart, requestedCheckpoint);
    const coverageStartBlock = Math.max(executionStart,
      input.fullRescan ? coverageRequest : Math.min(priorStart, coverageRequest));
    await renew({ fromBlock: start, nextBlock: start, targetBlock: target,
      error: null, errorDiagnostic: null, nextRetryAt: null, retryReason: null,
      historyComplete: false, reorgDetected: deepReorg,
      coverageStartBlock, coverageBasis: coverageStartBlock === 0 ? 'genesis' :
        deployment && coverageStartBlock === executionStart ? 'verified_first_create' : 'partial_range',
      ...(deployment || {}) });
    running = runScan(start, target, head);
    return { ...await getScanStatus(), started: true };
    } catch (error) { await saveScanFailure(error); throw error; }
    } finally { starting = false; }
  }
  async function reconcilePending(limit = 100) {
    if (reconcileRunning || disposed) return;
    reconcileRunning = true;
    try {
      await initialize(); await validateChain();
      const head = number(await rpc('eth_blockNumber', []));
      const docs = await queryLean(Transaction.find({ ...scope, $or: [
        { status: { $in: ['signed','pending','unknown'] } },
        { status: { $in: ['confirmed','reverted'] }, finalized: false }
      ] }).sort({ lastSeenAt: 1 }).limit(limit));
      for (const doc of docs) {
        const receipt = await rpc('eth_getTransactionReceipt', [doc.txHash]);
        if (!receipt) {
          if (doc.blockNumber !== undefined && doc.blockNumber !== null) await Transaction.updateOne({ ...scope,
            txHash: doc.txHash, blockHash: doc.blockHash }, { $set: { canonical: false, finalized: false,
            status: 'orphaned', lastSeenAt: new Date() } });
          else await Transaction.updateOne({ ...scope, txHash: doc.txHash,
            status: { $in: ['signed','pending','unknown'] } }, { $set: { lastSeenAt: new Date() } });
          continue;
        }
        const block = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
        if (!block || hash(block.hash) !== hash(receipt.blockHash)) continue;
        const tx = await rpc('eth_getTransactionByHash', [doc.txHash]);
        if (tx && hash(tx.hash) === doc.txHash) await ingest(tx, receipt, block, head, 'live');
      }
    } finally { reconcileRunning = false; }
  }
  async function importLegacy() {
    if (!RelayTransaction) return { imported: 0 };
    await initialize();
    return withStage('mongo_legacy_import', async () => {
    let imported = 0;
    // Project only audit fields; no IP, passwords, signatures, signed bytes or session tokens.
    const cursor = RelayTransaction.find({ chainId: networkId, contractAddress: contract,
      txHash: { $regex: /^0x[0-9a-fA-F]{64}$/ } })
      .select('txHash playerName playerAddress functionName status nonce blockNumber blockHash createdAt transactionId').cursor();
    for await (const r of cursor) {
      await upsert({ txHash: r.txHash, from: null, to: contract, nonce: number(r.nonce),
        // A legacy success is evidence to reconcile, not a currently verified chain receipt.
        status: ['signed','pending','processing','broadcasted'].includes(r.status) ? 'pending' : 'unknown',
        canonical: false, finalized: false, attributionStatus: 'unattributed',
        attributionSource: 'legacy_pending_chain_verification', playerName: null, playerAddress: null,
        attributionCandidates: [], action: r.functionName || 'unknownSelector', actions: [r.functionName || 'unknownSelector'],
        eventNames: [], invoiceIds: [], invoiceUpdates: [], source: 'legacy',
        legacyTransactionId: r.transactionId }, true);
      imported++;
    }
    await Scan.updateOne({ _id: key }, { $set: { ...scope, legacyImportedAt: new Date(), updatedAt: new Date() },
      $unset: { legacyImportError: '', legacyImportDiagnostic: '' },
      $setOnInsert: { status: 'idle', nextBlock: 0, historyComplete: false, coverageStartBlock: 0 } }, { upsert: true });
    return { imported };
    });
  }
  async function noteCaptureError(error) {
    const safe = safeError(error);
    logger.warn('[LitVM audit] live capture requires reconciliation:', safe);
    // Recording degradation is best effort and must never delay an actual broadcast.
    Scan.updateOne({ _id: key }, { $set: { ...scope, liveCaptureError: safe,
      liveCaptureErrorAt: new Date() }, $setOnInsert: { status: 'idle', nextBlock: 0 } }, { upsert: true }).catch(() => {});
  }
  function installLiveCapture() {
    if (installedBroadcast || typeof provider.broadcastTransaction !== 'function') return;
    originalBroadcast = provider.broadcastTransaction;
    installedBroadcast = async function(signedTx) {
      let decoded;
      try {
        const t = ethers.Transaction.from(signedTx);
        // Never put a transaction signed for another network into this chain's scope.
        if (number(t.chainId) !== networkId) {
          noteCaptureError(new Error('signed_transaction_chain_mismatch'));
        } else decoded = { hash: t.hash, from: t.from, to: t.to, nonce: t.nonce, data: t.data, value: t.value };
        // The existing RelayManager already persists its signed hash before sending.
        // Auditing direct calls is asynchronous: a Mongo outage cannot stall gameplay.
        // Historical full-block scan recovers them without replaying any transaction.
        if (decoded && address(decoded.to) === contract) recordSubmitted(decoded, playerContext.getStore(), 'signed').catch(noteCaptureError);
      } catch (error) { noteCaptureError(error); }
      let response;
      try { response = await originalBroadcast.call(this, signedTx); }
      catch (error) {
        // The node may have received it despite an HTTP failure. Do not mark reverted.
        if (decoded && address(decoded.to) === contract) Transaction.updateOne({ ...scope,
          txHash: hash(decoded.hash), status: 'signed' }, { $set: { status: 'pending' } }).catch(noteCaptureError);
        throw error;
      }
      if (decoded && address(decoded.to) === contract) recordSubmitted({ ...decoded, hash: response.hash || decoded.hash }, playerContext.getStore(), 'pending')
        .catch(noteCaptureError);
      return response;
    };
    provider.broadcastTransaction = installedBroadcast;
  }
  async function maintain() {
      if (maintenanceBusy || disposed) return;
      maintenanceBusy = true;
      try {
        if (!didImport) { await importLegacy(); didImport = true; }
        const state = await getScanStatus();
        // Persisted rate-limit cooldown survives redeployment and also prevents
        // the maintenance worker from spending quota on pending receipts.
        if (new Date(state.nextRetryAt || 0).getTime() > Date.now()) return;
        const unfinished = state.status !== 'complete' && state.autoResume !== false &&
          (state.autoResume || state.startedAt);
        const leaseAvailable = !state.leaseUntil || new Date(state.leaseUntil).getTime() <= Date.now();
        if (unfinished && !running && leaseAvailable) {
          await startScan({ resume: true });
          return;
        }
        // A completed historical range stays completed. Live capture is
        // reconciled separately rather than rescanning the tail every minute.
        if ((!unfinished || running) && Date.now() - lastReconcileAt >= 60000) {
          lastReconcileAt = Date.now();
          await reconcilePending(running ? 25 : 100);
        }
      } catch (error) {
        const safe = safeError(error); logger.warn('[LitVM audit] maintenance:', safe);
        if (!didImport) await Scan.updateOne({ _id: key }, { $set: { ...scope, legacyImportError: safe,
          legacyImportDiagnostic: describeError(error) },
          $setOnInsert: { status: 'idle', nextBlock: 0 } }, { upsert: true }).catch(() => {});
      } finally { maintenanceBusy = false; }
  }
  function startMaintenance() {
    if (timer) return;
    installLiveCapture();
    timer = setInterval(() => maintain().catch(noteCaptureError), maintenanceIntervalMs);
    if (timer.unref) timer.unref();
    initialTimer = setTimeout(() => maintain().catch(noteCaptureError), maintenanceStartDelayMs);
    if (initialTimer.unref) initialTimer.unref();
  }
  async function dispose() {
    disposed = true; clearInterval(timer); clearTimeout(initialTimer);
    if (provider.broadcastTransaction === installedBroadcast) provider.broadcastTransaction = originalBroadcast;
    if (running) await running;
  }
  function withPlayer(player, operation) {
    if (!player || !player.playerName || typeof operation !== 'function') throw new Error('verified_player_context_required');
    if (player.gameplayAction !== undefined && !/^[a-z][a-z0-9_:-]{0,79}$/i.test(String(player.gameplayAction))) {
      throw new Error('invalid_server_gameplay_action');
    }
    // Call only with identity resolved by existing authentication middleware.
    // Never take this metadata from a client-supplied playerName/body.
    return playerContext.run({ playerName: String(player.playerName),
      address: address(player.address || player.playerAddress),
      gameplayAction: player.gameplayAction === undefined ? null : String(player.gameplayAction) }, operation);
  }
  return { Transaction, Scan, scope, chainId: networkId, contractAddress: contract, confirmations,
    startScan, getScanStatus, importLegacy, reconcilePending, recordSubmitted,
    installLiveCapture, startMaintenance, dispose, withPlayer, describeError,
    // Allows deterministic tests without loading the game server or accessing a real chain.
    _test: { decode, facts, ingest, upsert, rpc, attribute, processBlock, maintain,
      getRunning: () => running } };
}

module.exports = { createChainAudit, INVOICE_ABI, mergeAttribution, safeError, describeError, isRateLimited, number };
