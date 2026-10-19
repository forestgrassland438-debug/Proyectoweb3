'use strict';

// Read-only projections over the canonical audit ledger. No legacy game counters
// are overwritten by this module or by the historical scanner.
const crypto = require('node:crypto');
const DAY = 86400000;
const SESSION_GAP_MS = 30 * 60000;
const HASH_RE = /^0x[a-f0-9]{64}$/i;
const ADDRESS_RE = /^0x[a-f0-9]{40}$/i;
const ANALYTICS_REVISION = 'admin-entry-recovery-20261014-r3';

function nonnegative(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function dateMs(value) {
  if (value == null) return null;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : null;
}
function iso(value) { const t = dateMs(value); return t == null ? null : new Date(t).toISOString(); }
function csvCell(value) {
  let text = value == null ? '' : String(value);
  // Excel interprets formulas even in quoted CSV cells. Neutralize controls and
  // leading whitespace before a formula, and escape quotes/RFC4180 newlines.
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
function classifyActivity({ txCount, playtimeSeconds, actionTypes, distinctPlayDays }) {
  if (playtimeSeconds == null || playtimeSeconds <= 0 || txCount <= 0) {
    return { label: 'Evidencia insuficiente', reason: 'No hay tiempo medido y transacciones confirmadas suficientes.' };
  }
  const rate = txCount / (playtimeSeconds / 3600);
  if (rate > 600) return { label: 'Revisar', reason: 'Más de 600 tx confirmadas por hora medida; revisar sincronización, cobertura y automatización.' };
  if (playtimeSeconds >= 1800 && actionTypes >= 3 && distinctPlayDays >= 2) {
    return { label: 'Actividad Orgánica Humana (indicio)', reason: 'Actividad en varios días, variedad de acciones y tiempo medido. Esta heurística no demuestra identidad humana ni ausencia de bots.' };
  }
  return { label: 'Evidencia insuficiente', reason: 'El volumen y el tiempo por sí solos no prueban que un jugador sea humano.' };
}
function choosePlaytime(activity, saves) {
  const socketMs = nonnegative(activity && activity.tiempoJugadoMs);
  const savedSeconds = nonnegative(saves && saves.segundos);
  if (socketMs > 0) return { seconds: socketMs / 1000, source: 'server-socket' };
  if (savedSeconds > 0) return { seconds: savedSeconds, source: 'save-gap-estimate' };
  return { seconds: null, source: 'unmeasured' };
}
function retryableInitializer(initialize, onError = () => {}) {
  let pending = null;
  return function ensureReady() {
    if (!pending) pending = Promise.resolve().then(initialize).catch(error => {
      pending = null; onError(error); throw error;
    });
    return pending;
  };
}
async function withStage(stage, work) {
  try { return await work(); }
  catch (error) {
    if (error && typeof error === 'object' && !error.stage) error.stage = stage;
    throw error;
  }
}
function diagnosticText(value) {
  return String(value == null ? '' : value)
    .replace(/[a-z][a-z\d+.-]*:\/\/[^\s"'<>]+/gi, '[connection]')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/((?:password|passwd|token|secret|api[_-]?key|authorization)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token]')
    .replace(/0x[0-9a-fA-F]{80,}/g, '[payload]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 300);
}
async function boundedRead(work, timeoutMs = 8000) {
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(work), new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('La consulta de diagnóstico excedió el tiempo máximo'), { code: 'TIMEOUT' })), timeoutMs);
      timer.unref?.();
    })]);
  } finally { clearTimeout(timer); }
}
// Admin refreshes share the same RPC observation. Failed reads cool down instead
// of using every dashboard refresh to consume more of an exhausted RPC quota.
function createSnapshotCache(read, { now = Date.now, ttlMs = 10000, retryMs = 30000, maxRetryMs = 300000 } = {}) {
  let current = null;
  const copy = value => JSON.parse(JSON.stringify(value));
  return async function snapshot(key) {
    if (!current || current.key !== key) current = { key, value: null, pending: null, nextAt: 0, failures: 0 };
    const entry = current;
    if (!entry.pending && (!entry.value || now() >= entry.nextAt)) {
      entry.pending = Promise.resolve().then(() => read(key)).then(value => {
        const sampledAt = now();
        entry.failures = value.status === 'online' ? 0 : entry.failures + 1;
        const delay = entry.failures ? Math.min(maxRetryMs, retryMs * 2 ** Math.min(entry.failures - 1, 10)) : ttlMs;
        entry.nextAt = sampledAt + delay;
        entry.value = { ...value, observedAt: new Date(sampledAt).toISOString(), nextRefreshAt: new Date(entry.nextAt).toISOString() };
        return entry.value;
      }).finally(() => { entry.pending = null; });
    }
    return copy(entry.pending ? await entry.pending : entry.value);
  };
}
// Only allowlisted, redacted fields reach the authenticated admin. Never serialize
// a driver/ethers Error: it may contain an RPC URL, Mongo credentials or calldata.
function impactFailure(error, { stage: operation, describeError } = {}) {
  const described = typeof describeError === 'function' ? describeError(error) : null;
  const rawCode = described?.code ?? error?.code;
  const code = typeof rawCode === 'number' && Number.isSafeInteger(rawCode) ? rawCode :
    /^-?\d+$/.test(String(rawCode || '')) && Number.isSafeInteger(Number(rawCode)) ? Number(rawCode) :
      typeof rawCode === 'string' ? rawCode.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) : null;
  const codeName = diagnosticText(described?.codeName ?? error?.codeName).replace(/[^a-zA-Z0-9_ -]/g, '').slice(0, 80) || null;
  const stage = String(described?.stage || error?.stage || operation || 'analytics_operation').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  const reason = diagnosticText(described?.message || error?.shortMessage || error?.message || 'Error sin descripción');
  let status = 503, kind = 'impact_analytics_error', message;
  if (code === 14031 || codeName === 'OutOfDiskSpace') {
    status = 507; kind = 'impact_storage_full';
    message = 'MongoDB respondió 14031 (OutOfDiskSpace): la operación de escritura o creación de índices no dispone del espacio libre requerido. El servidor puede seguir conectado. Comprueba el espacio del sistema de archivos y la reserva mínima para índices en el diagnóstico; no implica que el volumen esté al 100 %. Vuelve a ejecutar analizarCC tras resolver la causa.';
  } else if (stage.startsWith('auth') || ['UNAUTHORIZED', 'SESSION_EXPIRED'].includes(code)) {
    status = 401; kind = 'impact_auth_required'; message = 'La sesión de administrador expiró. Vuelve a iniciar sesión.';
  } else if (/configuration|chain_mismatch|contract_not_deployed/i.test(reason) || stage === 'configuration') {
    status = 422; kind = 'impact_configuration_error'; message = 'La configuración de RPC, red, contrato o relayer impide completar la auditoría: ' + reason;
  } else if (code === -31002 || code === 429 || /bandwidth limit|too many requests|rate.?limit/i.test(reason)) {
    status = 429; kind = 'impact_rpc_rate_limited';
    message = 'El RPC ha limitado las consultas de auditoría. El progreso guardado se conserva y el análisis reintentará después de la espera indicada.';
  } else if (stage.startsWith('rpc') || (typeof code === 'number' && code < 0) || (!stage.startsWith('mongo') && ['NETWORK_ERROR', 'SERVER_ERROR', 'TIMEOUT', 'BAD_DATA'].includes(code))) {
    kind = 'impact_rpc_error'; message = 'La consulta RPC de la auditoría falló: ' + reason;
  } else if (stage.startsWith('mongo') || /^Mongo/.test(error?.name || '') || (typeof code === 'number' && code > 0)) {
    kind = 'impact_database_error'; message = 'MongoDB rechazó la operación de auditoría (' + (codeName || code || stage) + '): ' + reason;
  } else message = 'No se pudo completar la operación de analítica (' + stage + '): ' + reason;
  return { status, body: { ok: false, revision: ANALYTICS_REVISION, error: kind, code, stage, details: { codeName, reason },
    diagnostic: { code, codeName, message: reason, stage }, message } };
}
function sessionSegment(input, now = Date.now()) {
  const playerName = typeof input.playerName === 'string' ? input.playerName.trim() : '';
  const from = dateMs(input.from), to = dateMs(input.to);
  if (!playerName || playerName === '---' || playerName.length > 150 ||
      from == null || to == null || to <= from || to - from > DAY ||
      to > now + 60000 || typeof input.sessionKey !== 'string' || !input.sessionKey || input.sessionKey.length > 8192) {
    throw new TypeError('Invalid authenticated playtime segment');
  }
  const sessionHash = crypto.createHash('sha256').update(playerName).update('\0').update(input.sessionKey).digest('hex');
  const segmentId = crypto.createHash('sha256').update(sessionHash + ':' + from + ':' + to).digest('hex');
  return {
    _id: segmentId, playerName,
    address: ADDRESS_RE.test(input.address || '') ? input.address.toLowerCase() : null,
    sessionHash, from: new Date(from), to: new Date(to), durationMs: to - from
  };
}

// Stream sorted segments, merge overlapping/retried sockets and split a logical
// login session after 30 minutes without observed gameplay. Memory is O(players).
async function summarizeSegments(iterable) {
  const players = new Map();
  let previous = null, totalMs = 0, sessionCount = 0;
  for await (const segment of iterable) {
    const from = dateMs(segment.from), to = dateMs(segment.to);
    if (from == null || to == null || to <= from || to - from > DAY) continue;
    let player = players.get(segment.playerName);
    if (!player) { player = { seconds: 0, sessions: 0, firstAt: from, lastAt: to }; players.set(segment.playerName, player); }
    player.firstAt = Math.min(player.firstAt, from); player.lastAt = Math.max(player.lastAt, to);
    const same = previous && previous.playerName === segment.playerName && previous.sessionHash === segment.sessionHash;
    const continuing = same && from <= previous.to + SESSION_GAP_MS;
    if (!continuing) { player.sessions++; sessionCount++; }
    const added = same ? Math.max(0, to - Math.max(from, previous.to)) : to - from;
    totalMs += added; player.seconds += added / 1000;
    previous = { playerName: segment.playerName, sessionHash: segment.sessionHash, to: same ? Math.max(previous.to, to) : to };
  }
  return { players, totalSeconds: totalMs / 1000, sessionCount,
    averageSessionMinutes: sessionCount ? totalMs / sessionCount / 60000 : null };
}

function mountImpactAnalytics(deps) {
  const { app, GamePlayer, UserActivity, PlayerPlaytime, chainAudit, provider,
    adminAuth, apiLimiter, strictLimiter, csrfProtection } = deps;
  if (!app || !GamePlayer || !UserActivity || !PlayerPlaytime || !chainAudit || !chainAudit.Transaction ||
      !adminAuth || !apiLimiter || !strictLimiter || !csrfProtection) throw new TypeError('Impact analytics dependencies are incomplete');
  const contractAddress = String(deps.contractAddress || deps.CONTRACT_ADDRESS || '').toLowerCase();
  const chainId = Number(deps.chainId || deps.CHAIN_ID);
  if (!ADDRESS_RE.test(contractAddress) || !Number.isSafeInteger(chainId) || chainId <= 0) throw new TypeError('Impact analytics needs a valid contract address and chain ID');
  const explorerUrl = String(deps.explorerUrl || deps.EXPLORER_URL || '').replace(/\/$/, '');
  const explorerTxBase = /^https:\/\//.test(explorerUrl) ? explorerUrl + '/tx/' : null;
  const Transaction = chainAudit.Transaction;
  const connection = GamePlayer.db;
  const Schema = connection.base.Schema;
  const playSegmentSchema = new Schema({
    _id: String, playerName: { type: String, required: true }, address: String,
    sessionHash: { type: String, required: true }, from: { type: Date, required: true },
    to: { type: Date, required: true }, durationMs: Number
  }, { collection: 'impact_play_segments', versionKey: false });
  playSegmentSchema.index({ playerName: 1, sessionHash: 1, from: 1, to: 1 });
  playSegmentSchema.index({ playerName: 1, to: -1 });
  playSegmentSchema.index({ to: -1 });
  const Segment = connection.models.ImpactPlaySegment || connection.model('ImpactPlaySegment', playSegmentSchema);
  const metaSchema = new Schema({ _id: String, coverageStartedAt: Date }, { collection: 'impact_analytics_meta', versionKey: false, autoCreate: false, autoIndex: false });
  const Meta = connection.models.ImpactAnalyticsMeta || connection.model('ImpactAnalyticsMeta', metaSchema);
  const failure = (error, stage) => impactFailure(error, { stage, describeError: chainAudit.describeError });
  const logFailure = (error, stage) => console.error('Impact analytics:', JSON.stringify(failure(error, stage).body));
  const ensureReady = retryableInitializer(async () => {
    // Reading existing coverage must not require write capacity. A full database
    // can still serve metrics; only first setup needs the idempotent upsert.
    const existing = await withStage('mongo_analytics_metadata_read', () => Meta.findById('playtime-v1').lean().exec());
    if (existing) return existing;
    return withStage('mongo_analytics_initialization', () => Meta.findOneAndUpdate({ _id: 'playtime-v1' }, { $setOnInsert: { coverageStartedAt: new Date() } }, { upsert: true, new: true }).lean().exec());
  },
    error => logFailure(error, 'mongo_analytics_initialization'));
  ensureReady().catch(() => {});
  const scope = { chainId, contractAddress };
  const minedScope = { ...scope, canonical: true, status: { $in: ['confirmed', 'reverted'] } };
  let sessionCache = null;

  async function recordPlaytimeSegment(input) {
    await ensureReady();
    const segment = sessionSegment(input);
    // A deterministic _id makes network retry and repeated flush idempotent.
    await withStage('mongo_playtime_write', () => Segment.updateOne({ _id: segment._id }, { $setOnInsert: segment }, { upsert: true }).exec());
    sessionCache = null;
  }
  async function observedSessions(now) {
    if (sessionCache && now.getTime() - sessionCache.at < 30000) return sessionCache.data;
    const cursor = Segment.find({ to: { $lte: now } }).select('playerName sessionHash from to -_id')
      .sort({ playerName: 1, sessionHash: 1, from: 1, to: 1 }).lean().cursor();
    const data = await withStage('mongo_playtime_read', () => summarizeSegments(cursor));
    sessionCache = { at: now.getTime(), data }; return data;
  }

  function playerPipeline(search = '') {
    const pipeline = [];
    if (search) {
      const safe = search.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pipeline.push({ $match: { $or: [{ playerName: { $regex: safe, $options: 'i' } }, { Username: { $regex: safe, $options: 'i' } }, { address: { $regex: safe, $options: 'i' } },
        { $expr: { $regexMatch: { input: { $toString: '$_id' }, regex: safe, options: 'i' } } }] } });
    }
    // Allowlist early: password, tokens, IPs, devices and inventory never enter a response.
    pipeline.push({ $project: { playerName: 1, Username: 1, address: 1, createdAt: 1 } },
      { $lookup: { from: UserActivity.collection.name, localField: 'playerName', foreignField: 'playerName', as: '_activity' } },
      { $lookup: { from: PlayerPlaytime.collection.name, localField: 'playerName', foreignField: 'playerName', as: '_saves' } },
      { $lookup: { from: Segment.collection.name, let: { name: '$playerName' }, as: '_segment',
        pipeline: [{ $match: { $expr: { $eq: ['$playerName', '$$name'] } } }, { $sort: { to: -1 } }, { $limit: 1 }, { $project: { to: 1, _id: 0 } }] } },
      { $set: { _activity: { $arrayElemAt: ['$_activity', 0] }, _saves: { $arrayElemAt: ['$_saves', 0] } } },
      { $set: { _segment: { $arrayElemAt: ['$_segment', 0] } } },
      { $set: {
        _socketSeconds: { $divide: [{ $max: [0, { $ifNull: ['$_activity.tiempoJugadoMs', 0] }] }, 1000] },
        _saveSeconds: { $max: [0, { $ifNull: ['$_saves.segundos', 0] }] },
        registeredAt: '$createdAt',
        lastGameplayAt: { $max: ['$_activity.ultimaPartida', '$_saves.ultimaVez', '$_segment.to'] },
        lastSeen: { $max: ['$_activity.lastLogin', '$_activity.ultimaPartida', '$_saves.ultimaVez', '$_segment.to'] }
      } },
      { $set: { playtimeSeconds: { $cond: [{ $gt: ['$_socketSeconds', 0] }, '$_socketSeconds', { $cond: [{ $gt: ['$_saveSeconds', 0] }, '$_saveSeconds', null] }] },
        playtimeSource: { $cond: [{ $gt: ['$_socketSeconds', 0] }, 'server-socket', { $cond: [{ $gt: ['$_saveSeconds', 0] }, 'save-gap-estimate', 'unmeasured'] }] }
      } });
    return pipeline;
  }
  function userLedgerStages(now) {
    const recent = new Date(now.getTime() - 30 * DAY);
    return [{ $lookup: {
      from: Transaction.collection.name, let: { actor: '$playerName' }, as: '_tx',
      pipeline: [{ $match: { ...scope, canonical: true, attributionStatus: 'attributed',
        status: { $in: ['confirmed', 'reverted', 'pending', 'signed'] }, $expr: { $eq: ['$playerName', '$$actor'] } } },
      { $set: { _sortTime: { $ifNull: ['$timestamp', '$firstSeenAt'] } } },
      { $sort: { _sortTime: -1, blockNumber: -1, transactionIndex: -1, _id: -1 } },
      { $group: { _id: null,
        txCount: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] } },
        revertedTxCount: { $sum: { $cond: [{ $eq: ['$status', 'reverted'] }, 1, 0] } },
        pendingTxCount: { $sum: { $cond: [{ $in: ['$status', ['pending', 'signed']] }, 1, 0] } },
        tx30d: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'confirmed'] }, { $gte: ['$timestamp', recent] }, { $lte: ['$timestamp', now] }] }, 1, 0] } },
        lastTxHash: { $first: '$txHash' }, lastTxAt: { $max: '$timestamp' }
      } }]
    } }, { $set: { _tx: { $arrayElemAt: ['$_tx', 0] } } },
    { $lookup: { from: Transaction.collection.name, let: { actor: '$playerName' }, as: '_associated',
      pipeline: [{ $match: { ...scope, canonical: true, attributionStatus: 'inferred', status: { $in: ['confirmed', 'reverted'] },
        $expr: { $eq: ['$playerName', '$$actor'] } } }, { $sort: { timestamp: -1, blockNumber: -1, transactionIndex: -1 } },
      { $group: { _id: null, count: { $sum: 1 }, lastAssociatedTxHash: { $first: '$txHash' } } }] } },
    { $set: { _associated: { $arrayElemAt: ['$_associated', 0] } } },
    { $set: { txCount: { $ifNull: ['$_tx.txCount', 0] }, revertedTxCount: { $ifNull: ['$_tx.revertedTxCount', 0] },
      pendingTxCount: { $ifNull: ['$_tx.pendingTxCount', 0] }, tx30d: { $ifNull: ['$_tx.tx30d', 0] },
      inferredTxCount: { $ifNull: ['$_associated.count', 0] }, lastAssociatedTxHash: { $ifNull: ['$_associated.lastAssociatedTxHash', null] },
      lastTxHash: { $ifNull: ['$_tx.lastTxHash', null] } } }];
  }
  function publicPlayerProjection() {
    return { $project: { playerName: 1, Username: 1, address: 1, registeredAt: 1, lastSeen: 1, lastGameplayAt: 1,
      playtimeSeconds: 1, playtimeSource: 1, txCount: 1, revertedTxCount: 1, pendingTxCount: 1, lastTxHash: 1, inferredTxCount: 1, lastAssociatedTxHash: 1 } };
  }

  async function enrichRows(rows, now, includeHashes = true, sessionSnapshot = null) {
    if (!rows.length) return [];
    const names = rows.map(row => row.playerName);
    const [actionRows, hashes, sessions, associatedHashes] = await withStage('mongo_user_details', () => Promise.all([
      Transaction.aggregate([{ $match: { ...scope, canonical: true, status: 'confirmed', attributionStatus: 'attributed', playerName: { $in: names } } },
        { $group: { _id: { playerName: '$playerName', action: { $cond: [{ $ne: [{ $ifNull: ['$gameplayAction', ''] }, ''] }, '$gameplayAction', { $ifNull: ['$action', 'unknown'] }] } },
          count: { $sum: 1 }, technicalFallbackCount: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$gameplayAction', ''] }, ''] }, 1, 0] } } } }]).exec(),
      includeHashes ? Promise.all(names.map(async playerName => ({ _id: playerName,
        hashes: (await Transaction.aggregate([{ $match: { ...scope, canonical: true, status: { $in: ['confirmed', 'reverted', 'pending', 'signed'] }, attributionStatus: 'attributed', playerName } },
          { $set: { _sortTime: { $ifNull: ['$timestamp', '$firstSeenAt'] } } },
          { $sort: { _sortTime: -1, blockNumber: -1, transactionIndex: -1 } }, { $limit: 25 }, { $project: { txHash: 1, _id: 0 } }]).exec()).map(row => row.txHash)
      }))) : Promise.resolve([]),
      sessionSnapshot || observedSessions(now),
      includeHashes ? Promise.all(names.map(async playerName => ({ _id: playerName,
        hashes: (await Transaction.find({ ...scope, canonical: true, status: { $in: ['confirmed', 'reverted'] }, attributionStatus: 'inferred', playerName })
          .select('txHash -_id').sort({ timestamp: -1, blockNumber: -1, transactionIndex: -1 }).limit(25).lean().exec()).map(row => row.txHash)
      }))) : Promise.resolve([])
    ]));
    const actionMap = new Map(), hashMap = new Map(hashes.map(row => [row._id, row.hashes]));
    const fallbackMap = new Map();
    const associatedHashMap = new Map(associatedHashes.map(row => [row._id, row.hashes]));
    for (const row of actionRows) {
      if (!actionMap.has(row._id.playerName)) actionMap.set(row._id.playerName, Object.create(null));
      actionMap.get(row._id.playerName)[row._id.action] = row.count;
      fallbackMap.set(row._id.playerName, (fallbackMap.get(row._id.playerName) || 0) + (row.technicalFallbackCount || 0));
    }
    return rows.map(row => {
      const actions = actionMap.get(row.playerName) || Object.create(null);
      const measured = sessions.players.get(row.playerName);
      const classification = classifyActivity({ txCount: row.txCount, playtimeSeconds: row.playtimeSeconds,
        actionTypes: Object.keys(actions).length, distinctPlayDays: measured && measured.lastAt - measured.firstAt >= DAY ? 2 : 1 });
      return { id: String(row._id), playerName: row.playerName, username: row.Username || null,
        address: row.address || null, registeredAt: iso(row.registeredAt), lastSeen: iso(row.lastSeen),
        lastGameplayAt: iso(row.lastGameplayAt), playtimeSeconds: row.playtimeSeconds == null ? null : nonnegative(row.playtimeSeconds),
        playtimeSource: row.playtimeSource, sessionCount: measured ? measured.sessions : null,
        txCount: nonnegative(row.txCount), successfulTxCount: nonnegative(row.txCount),
        revertedTxCount: nonnegative(row.revertedTxCount), pendingTxCount: nonnegative(row.pendingTxCount),
        minedTxCount: nonnegative(row.txCount) + nonnegative(row.revertedTxCount),
        sentTxCount: nonnegative(row.txCount) + nonnegative(row.revertedTxCount) + nonnegative(row.pendingTxCount),
        inferredTxCount: nonnegative(row.inferredTxCount),
        lastAssociatedTxHash: HASH_RE.test(row.lastAssociatedTxHash || '') ? row.lastAssociatedTxHash : null,
        associatedHashes: (associatedHashMap.get(row.playerName) || []).filter(hash => HASH_RE.test(hash)),
        associatedHashesTruncated: nonnegative(row.inferredTxCount) > 25,
        actions, technicalActionCount: fallbackMap.get(row.playerName) || 0,
        actionBreakdownSource: 'trusted-gameplay-action-with-decoded-contract-function-fallback',
        actionBreakdownNote: 'Las etiquetas de juego requieren contexto autenticado del backend. Sin él se conserva el nombre técnico de la función; una factura genérica no demuestra talar/minar.',
        txPerHour: row.playtimeSeconds > 0 ? row.txCount / (row.playtimeSeconds / 3600) : null,
        activityLabel: classification.label, activityReason: classification.reason,
        lastTxHash: HASH_RE.test(row.lastTxHash || '') ? row.lastTxHash : null,
        hashes: (hashMap.get(row.playerName) || []).filter(hash => HASH_RE.test(hash)), hashesTruncated: row.txCount + row.revertedTxCount + row.pendingTxCount > 25 };
    });
  }

  const relayerSnapshot = createSnapshotCache(async address => {
    address = address || null;
    const result = { address, balanceNative: null, balanceWei: null, nonceLatest: null, noncePending: null,
      status: 'unavailable', note: 'El nonce mide transacciones de esta cartera en toda la red; no equivale a tx de este contrato ni firmas locales.' };
    if (!provider || !address) {
      result.status = 'unconfigured';
      result.diagnostics = [{ operation: 'relayer_configuration', ...failure(new Error(!provider ? 'RPC provider no configurado' : 'Cartera relayer no configurada'), 'configuration').body }];
      return result;
    }
    const responses = await Promise.allSettled([
      boundedRead(() => provider.getBalance(address)), boundedRead(() => provider.getTransactionCount(address, 'latest')),
      boundedRead(() => provider.getTransactionCount(address, 'pending'))
    ]);
    if (responses[0].status === 'fulfilled') {
      result.balanceWei = responses[0].value.toString();
      const wei = BigInt(result.balanceWei), base = 10n ** 18n;
      result.balanceNative = (wei / base).toString() + '.' + (wei % base).toString().padStart(18, '0');
    }
    if (responses[1].status === 'fulfilled') result.nonceLatest = Number(responses[1].value);
    if (responses[2].status === 'fulfilled') result.noncePending = Number(responses[2].value);
    result.status = responses.every(response => response.status === 'fulfilled') ? 'online' : 'partial';
    const operations = ['rpc_relayer_balance', 'rpc_relayer_nonce_latest', 'rpc_relayer_nonce_pending'];
    result.diagnostics = responses.flatMap((response, index) => response.status === 'rejected' ?
      [{ operation: operations[index], ...failure(response.reason, operations[index]).body }] : []);
    return result;
  });

  async function retention(now, metadata) {
    const start = new Date(Math.max(dateMs(metadata.coverageStartedAt), now.getTime() - 15 * DAY));
    const end = new Date(now.getTime() - 8 * DAY);
    const definition = 'D7 por cuenta registrada: al menos un tramo de juego que solape [registro + 7d, registro + 8d). Cohorte: registros entre 15 y 8 días atrás, posteriores al inicio de medición. Se excluyen cohortes sin ocho días completos de observación.';
    if (start > end) return { eligible: 0, returning: 0, percent: null, definition, coverageStartedAt: iso(metadata.coverageStartedAt) };
    const [eligible, returning] = await Promise.all([
      GamePlayer.countDocuments({ createdAt: { $gte: start, $lte: end } }).exec(),
      GamePlayer.aggregate([{ $match: { createdAt: { $gte: start, $lte: end } } },
        { $lookup: { from: Segment.collection.name, let: { name: '$playerName', d7: { $add: ['$createdAt', 7 * DAY] }, d8: { $add: ['$createdAt', 8 * DAY] } }, as: '_return',
          pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$playerName', '$$name'] }, { $lt: ['$from', '$$d8'] }, { $gt: ['$to', '$$d7'] }] } } }, { $limit: 1 }, { $project: { _id: 1 } }] } },
        { $match: { '_return.0': { $exists: true } } }, { $count: 'count' }]).exec()
    ]);
    const count = returning[0]?.count || 0;
    return { eligible, returning: count, percent: eligible ? count / eligible * 100 : null, definition, coverageStartedAt: iso(metadata.coverageStartedAt) };
  }

  let summaryWork = null;
  async function summary() {
    if (!summaryWork) summaryWork = buildSummary().finally(() => { summaryWork = null; });
    // Callers such as exports add their own evidence fields; do not share a
    // mutable response between concurrent authenticated requests.
    return JSON.parse(JSON.stringify(await summaryWork));
  }
  async function buildSummary() {
    const metadata = await ensureReady(), now = new Date();
    const currentWallet = typeof deps.getRelayerWallet === 'function' ? deps.getRelayerWallet() : deps.relayerWallet;
    const currentRelayerAddress = currentWallet?.address?.toLowerCase() || null;
    const base = playerPipeline();
    const summaryPipeline = base.concat(userLedgerStages(now), [{ $group: { _id: null,
      registered: { $sum: 1 }, active24h: { $sum: { $cond: [{ $and: [{ $gte: ['$lastGameplayAt', new Date(now - DAY)] }, { $lte: ['$lastGameplayAt', now] }] }, 1, 0] } },
      withAttributedTransactions: { $sum: { $cond: [{ $gt: [{ $add: ['$txCount', '$revertedTxCount'] }, 0] }, 1, 0] } },
      withConfirmedTransactions: { $sum: { $cond: [{ $gt: ['$txCount', 0] }, 1, 0] } },
      active7d: { $sum: { $cond: [{ $and: [{ $gte: ['$lastGameplayAt', new Date(now - 7 * DAY)] }, { $lte: ['$lastGameplayAt', now] }] }, 1, 0] } },
      active30d: { $sum: { $cond: [{ $and: [{ $gte: ['$lastGameplayAt', new Date(now - 30 * DAY)] }, { $lte: ['$lastGameplayAt', now] }] }, 1, 0] } },
      activeWindowTransactions: { $sum: { $cond: [{ $and: [{ $gte: ['$lastGameplayAt', new Date(now - 30 * DAY)] }, { $lte: ['$lastGameplayAt', now] }] }, '$tx30d', 0] } },
      totalSeconds: { $sum: { $ifNull: ['$playtimeSeconds', 0] } }, measuredPlayers: { $sum: { $cond: [{ $gt: ['$playtimeSeconds', 0] }, 1, 0] } },
      socketPlayers: { $sum: { $cond: [{ $eq: ['$playtimeSource', 'server-socket'] }, 1, 0] } },
      estimatedPlayers: { $sum: { $cond: [{ $eq: ['$playtimeSource', 'save-gap-estimate'] }, 1, 0] } }
    } }]);
    const [playersAgg, ledgerAgg, relayer, scan, sessions, retained, sponsoredPlayers] = await Promise.all([
      withStage('mongo_summary_players', () => GamePlayer.aggregate(summaryPipeline).allowDiskUse(true).exec()),
      withStage('mongo_summary_ledger', () => Transaction.aggregate([{ $match: scope }, { $group: { _id: { status: '$status', canonical: '$canonical', attribution: '$attributionStatus', from: '$from' }, count: { $sum: 1 } } }]).exec()),
      relayerSnapshot(currentRelayerAddress), withStage('scan_status', () => chainAudit.getScanStatus()), observedSessions(now), withStage('mongo_retention', () => retention(now, metadata)),
      currentRelayerAddress ? withStage('mongo_sponsored_players', () => Transaction.aggregate([{ $match: { ...scope, from: currentRelayerAddress, canonical: true, status: 'confirmed', attributionStatus: 'attributed', playerName: { $ne: null } } },
        { $group: { _id: '$playerName' } }, { $lookup: { from: GamePlayer.collection.name, localField: '_id', foreignField: 'playerName', as: '_registered' } },
        { $match: { '_registered.0': { $exists: true } } }, { $count: 'count' }]).exec()) : Promise.resolve([])
    ]);
    const p = playersAgg[0] || {};
    let confirmed = 0, reverted = 0, pending = 0, attributed = 0, inferred = 0, unattributed = 0, system = 0, orphaned = 0, unknown = 0;
    let sponsoredTransactions = 0, sponsoredSuccessfulTransactions = 0, recordedSigned = 0;
    for (const group of ledgerAgg) {
      const { status, canonical, attribution, from } = group._id;
      const sponsored = currentRelayerAddress && typeof from === 'string' && from.toLowerCase() === currentRelayerAddress;
      if (sponsored && canonical === true && ['signed', 'pending', 'confirmed', 'reverted'].includes(status)) recordedSigned += group.count;
      if (canonical === true && ['confirmed', 'reverted'].includes(status)) {
        if (sponsored) { sponsoredTransactions += group.count; if (status === 'confirmed') sponsoredSuccessfulTransactions += group.count; }
        if (status === 'confirmed') confirmed += group.count; else reverted += group.count;
        if (attribution === 'attributed') attributed += group.count;
        else if (attribution === 'inferred') inferred += group.count;
        else if (attribution === 'system') system += group.count;
        else unattributed += group.count;
      } else if (canonical === true && ['signed', 'pending'].includes(status)) pending += group.count;
      else if (status === 'orphaned') orphaned += group.count;
      else unknown += group.count;
    }
    const total = confirmed + reverted;
    relayer.ledgerSignedTransactions = recordedSigned;
    relayer.sponsoredContractTransactions = sponsoredTransactions;
    relayer.sponsoredSuccessfulTransactions = sponsoredSuccessfulTransactions;
    relayer.sponsoredUniqueRegisteredPlayers = sponsoredPlayers[0]?.count || 0;
    relayer.sponsorshipCoverage = 'Current relayer wallet only; prior rotated wallets are included in contract totals but cannot be claimed as sponsored by this current address.';
    const result = {
      generatedAt: now.toISOString(),
      users: { registered: p.registered || 0, active24h: p.active24h || 0, active7d: p.active7d || 0, active30d: p.active30d || 0,
        withAttributedTransactions: p.withAttributedTransactions || 0, withConfirmedTransactions: p.withConfirmedTransactions || 0,
        retention7d: retained, activeDefinition: 'Última evidencia de juego del servidor o guardado /api/save; el login por sí solo no cuenta.' },
      playtime: { totalSeconds: p.measuredPlayers ? p.totalSeconds : null, totalHours: p.measuredPlayers ? p.totalSeconds / 3600 : null,
        averageSessionMinutes: sessions.averageSessionMinutes, sessionCount: sessions.sessionCount || null,
        observedSessionSeconds: sessions.totalSeconds, measuredPlayers: p.measuredPlayers || 0, source: 'server-socket-with-save-gap-fallback',
        sessionSource: 'authenticated-server-segments; overlap merged per session; 30 minute inactivity gap',
        sessionCoverageStartedAt: iso(metadata.coverageStartedAt),
        coverageNote: 'Tiempo acumulado medido desde que existieron los contadores: socket si disponible; guardados como estimación de respaldo. No se suman ambas fuentes. El promedio de sesión solo incluye nuevos tramos autenticados desde el inicio indicado; el historial on-chain no permite reconstruir tiempo de juego anterior. Los contadores antiguos pueden incluir pestañas concurrentes.',
        socketPlayers: p.socketPlayers || 0, estimatedPlayers: p.estimatedPlayers || 0 },
      contract: { address: contractAddress, chainId, totalTransactions: total, minedTransactions: total,
        confirmedTransactions: confirmed, revertedTransactions: reverted, pendingTransactions: pending,
        attributedTransactions: attributed, inferredTransactions: inferred, unattributedTransactions: unattributed, systemTransactions: system,
        attributedUserCount: p.withAttributedTransactions || 0,
        orphanedTransactions: orphaned, unresolvedTransactions: unknown, activeWindowTransactions: p.activeWindowTransactions || 0,
        sponsoredTransactions,
        transactionsPerActiveUser: p.active30d ? (p.activeWindowTransactions || 0) / p.active30d : null,
        transactionsPerActiveUserWindow: '30d', userAttributionNote: 'Actor exacto: caller autenticado del backend o emisor directo registrado. La titularidad de inventario recuperada de eventos/calldata es una asociación inferida separada; no demuestra quién originó la operación. Destinatarios, candidatos ambiguos y escrituras de sistema no se cuentan como acciones generadas por otro jugador.' },
      relayer, scan: scan || { status: 'idle' }, explorerTxBase,
      quality: { notes: [
        'totalTransactions cuenta hashes canónicos minados: confirmadas exitosas + revertidas. Pendientes y firmadas sin recibo se muestran aparte.',
        'txCount por jugador, actions y Tx/h cuentan solo tx canónicas exitosas del actor; no eventos múltiples ni participantes secundarios.',
        'inferredTransactions e inferredTxCount conservan asociaciones históricas a titulares de inventario sin atribuirles la autoría de las acciones.',
        'El desglose usa gameplayAction autenticada cuando existe; en el historial sin contexto usa la función técnica del contrato. No se inventa talar/minar a partir de facturas.',
        'El promedio Tx/usuario activo usa únicamente tx exitosas de los últimos 30 días atribuidas a jugadores activos en esa misma ventana.',
        'Las etiquetas de actividad son indicios estadísticos y no certifican que una cuenta sea humana.',
        'Las métricas representan los registros ya indexados. Hasta completar analizarCC desde el bloque de despliegue, el volumen histórico es parcial.',
        'Los datos de Mongo y RPC se leen durante un intervalo corto, sin garantía de snapshot atómico entre servicios.'
      ] }
    };
    if (scan && scan.coverageBasis === 'verified_first_create') result.quality.notes.push(
      'El despliegue se verificó en el bloque ' + scan.deploymentBlock + '; la cobertura efectiva empieza en ' + scan.coverageStartBlock +
      '. La recuperación de ejecución desde el despliegue no enumera posibles envíos a la dirección anteriores a la creación del contrato.');
    return result;
  }

  const route = (stage, handler) => (req, res, next) => Promise.resolve().then(() => handler(req, res)).catch(error => {
    const result = failure(error, stage);
    console.error('Impact analytics:', JSON.stringify(result.body));
    if (res.headersSent) { res.destroy(error); return; }
    res.status(result.status).json(result.body);
  });
  const noCache = (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
  const read = [adminAuth, apiLimiter, noCache];
  async function diagnostics() {
    const mongoCommand = command => {
      if (!connection.db || typeof connection.db.command !== 'function') throw new Error('La conexión MongoDB aún no dispone de un cliente activo');
      return connection.db.command(command);
    };
    const tasks = [
      withStage('mongo_connectivity', () => boundedRead(() => mongoCommand({ ping: 1 }))),
      withStage('mongo_storage_stats', () => boundedRead(() => mongoCommand({ dbStats: 1, scale: 1048576 }))),
      provider ? withStage('rpc_diagnostics_network', () => boundedRead(async () => typeof provider.send === 'function'
        ? { chainId: await provider.send('eth_chainId', []) } : provider.getNetwork())) : Promise.resolve(null),
      provider ? withStage('rpc_diagnostics_head', () => boundedRead(() => provider.getBlockNumber())) : Promise.resolve(null),
      withStage('mongo_index_disk_requirement', () => boundedRead(() => {
        if (!connection.db || typeof connection.db.admin !== 'function') throw new Error('El diagnóstico del parámetro de índices requiere acceso de lectura a la base admin');
        return connection.db.admin().command({ getParameter: 1, indexBuildMinAvailableDiskSpaceMB: 1 });
      }))
    ];
    const [ping, stats, network, head, indexRequirement] = await Promise.allSettled(tasks);
    const storage = stats.status === 'fulfilled' ? {} : null;
    if (storage) for (const field of ['dataSize', 'storageSize', 'indexSize', 'fsUsedSize', 'fsTotalSize']) {
      const value = stats.value?.[field];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) storage[field + 'MB'] = value;
    }
    if (storage && storage.fsTotalSizeMB != null && storage.fsUsedSizeMB != null) {
      storage.fsAvailableSizeMB = Math.max(0, storage.fsTotalSizeMB - storage.fsUsedSizeMB);
    }
    const required = indexRequirement.status === 'fulfilled' ? indexRequirement.value?.indexBuildMinAvailableDiskSpaceMB : null;
    const minimumMB = typeof required === 'number' && Number.isFinite(required) && required >= 0 ? required : null;
    const rawNetworkId = network.status === 'fulfilled' && network.value ? Number(network.value.chainId) : null;
    const actualChainId = Number.isSafeInteger(rawNetworkId) && rawNetworkId > 0 ? rawNetworkId : null;
    const rawHead = head.status === 'fulfilled' ? Number(head.value) : null;
    const headBlock = provider && Number.isSafeInteger(rawHead) && rawHead >= 0 ? rawHead : null;
    const rpcDiagnostics = [];
    if (network.status === 'rejected') rpcDiagnostics.push(failure(network.reason, 'rpc_diagnostics_network').body);
    if (head.status === 'rejected') rpcDiagnostics.push(failure(head.reason, 'rpc_diagnostics_head').body);
    if (actualChainId != null && actualChainId !== chainId) rpcDiagnostics.push(failure(new Error('rpc_chain_mismatch_expected_' + chainId + '_received_' + actualChainId), 'configuration').body);
    return { ok: true, revision: ANALYTICS_REVISION, generatedAt: new Date().toISOString(), mongodb: {
      connected: ping.status === 'fulfilled', status: ping.status === 'fulfilled' ? 'online' : 'error',
      storage, diagnostic: ping.status === 'rejected' ? failure(ping.reason, 'mongo_connectivity').body : null,
      statsDiagnostic: stats.status === 'rejected' ? failure(stats.reason, 'mongo_storage_stats').body : null,
      indexBuildDiskRequirement: { minimumAvailableMB: minimumMB, source: minimumMB == null ? 'unavailable' : 'getParameter',
        enoughSpaceForIndexBuild: minimumMB != null && storage?.fsAvailableSizeMB != null ? storage.fsAvailableSizeMB >= minimumMB : null,
        diagnostic: indexRequirement.status === 'rejected' ? failure(indexRequirement.reason, 'mongo_index_disk_requirement').body : null,
        note: 'Desde MongoDB 7.1 la reserva predeterminada para construir índices es de 500 MB libres; el valor real puede ser distinto. Se consulta sin modificarlo. RAM y capacidad asignada del volumen no son espacio libre medido por mongod.' },
      capacityNote: 'dbStats informa tamaños en MiB. fsUsedSize/fsTotalSize, cuando existen, describen el sistema de archivos del servidor MongoDB; no prueban la cuota disponible de esta base de datos, del cluster o del plan contratado.'
    }, rpc: { configured: Boolean(provider), reachable: Boolean(provider) && (actualChainId != null || headBlock != null),
      chainId: actualChainId, expectedChainId: chainId, chainMatches: actualChainId == null ? null : actualChainId === chainId,
      headBlock, diagnostics: rpcDiagnostics } };
  }
  async function write(res, text) {
    if (res.destroyed) throw new Error('Export client disconnected');
    if (!res.write(text)) await new Promise((resolve, reject) => {
      const cleanup = () => { res.off('drain', onDrain); res.off('close', onClose); res.off('error', onError); };
      const onDrain = () => { cleanup(); resolve(); };
      const onClose = () => { cleanup(); reject(new Error('Export client disconnected')); };
      const onError = error => { cleanup(); reject(error); };
      res.once('drain', onDrain); res.once('close', onClose); res.once('error', onError);
    });
  }
  app.get('/api/admin/impact/summary', ...read, route('summary', async (req, res) => res.json(await summary())));
  app.get('/api/admin/impact/users', ...read, route('mongo_users_query', async (req, res) => {
    await ensureReady();
    const page = Math.min(1000000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const sort = req.query.sort === 'playtime' ? 'playtimeSeconds' : 'txCount';
    const now = new Date(), search = String(req.query.q || '').trim();
    const pipeline = playerPipeline(search).concat(userLedgerStages(now), [{ $facet: {
      total: [{ $count: 'count' }], rows: [{ $sort: { [sort]: -1, playerName: 1, _id: 1 } }, { $skip: (page - 1) * limit }, { $limit: limit }, publicPlayerProjection()]
    } }]);
    const result = (await GamePlayer.aggregate(pipeline).allowDiskUse(true).exec())[0] || { rows: [], total: [] };
    res.json({ page, limit, total: result.total[0]?.count || 0, rows: await enrichRows(result.rows, now),
      txCountDefinition: 'confirmed-successful-canonical-unique-hashes', hashPreviewLimit: 25 });
  }));
  app.get('/api/admin/impact/scan', ...read, route('scan_status', async (req, res) => res.json({ ok: true, revision: ANALYTICS_REVISION, scan: await chainAudit.getScanStatus() })));
  app.get('/api/admin/impact/diagnostics', ...read, route('diagnostics', async (req, res) => res.json(await diagnostics())));
  app.post('/api/admin/impact/scan', adminAuth, strictLimiter, csrfProtection, noCache, route('scan_start', async (req, res) => {
    // Intentionally do not accept a browser supplied range: recover from genesis
    // (or the configured deployment start) and let the scanner resume its cursor.
    const scan = await chainAudit.startScan({ fromBlock: 0 });
    res.status(202).json({ ok: true, scan });
  }));

  app.get('/api/admin/impact/export/users.csv', ...read, route('mongo_users_export', async (req, res) => {
    await ensureReady();
    const now = new Date();
    const sessionSnapshot = await observedSessions(now);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="litvm-user-audit-' + now.toISOString().slice(0, 10) + '.csv"');
    const headers = ['user_id', 'player_name', 'username', 'wallet', 'registered_at', 'last_seen', 'last_gameplay_at', 'playtime_seconds', 'playtime_hours', 'playtime_source', 'observed_sessions', 'confirmed_tx_count', 'reverted_tx_count', 'pending_or_signed_tx_count', 'confirmed_tx_per_hour', 'actions_json', 'activity_label', 'activity_reason', 'last_tx_hash', 'inferred_tx_count', 'last_associated_tx_hash', 'all_actor_canonical_tx_hashes', 'all_inferred_associated_tx_hashes'];
    await write(res, '\uFEFF' + headers.map(csvCell).join(',') + '\r\n');
    const cursor = GamePlayer.aggregate(playerPipeline().concat(userLedgerStages(now), [{ $sort: { playerName: 1, _id: 1 } }, publicPlayerProjection()]))
      .allowDiskUse(true).cursor({ batchSize: 50 });
    try {
      for await (const raw of cursor) {
        const row = (await enrichRows([raw], now, false, sessionSnapshot))[0];
        const values = [row.id, row.playerName, row.username, row.address, row.registeredAt, row.lastSeen, row.lastGameplayAt,
          row.playtimeSeconds, row.playtimeSeconds == null ? null : row.playtimeSeconds / 3600, row.playtimeSource, row.sessionCount,
          row.txCount, row.revertedTxCount, row.pendingTxCount, row.txPerHour, JSON.stringify(row.actions), row.activityLabel, row.activityReason, row.lastTxHash,
          row.inferredTxCount, row.lastAssociatedTxHash];
        await write(res, values.map(csvCell).join(',') + ',"');
        for (const attributionStatus of ['attributed', 'inferred']) {
          if (attributionStatus === 'inferred') await write(res, '","');
          const hashes = Transaction.find({ ...scope, canonical: true,
            status: { $in: attributionStatus === 'inferred' ? ['confirmed', 'reverted'] : ['confirmed', 'reverted', 'pending', 'signed'] }, attributionStatus, playerName: row.playerName })
            .select('txHash -_id').sort({ blockNumber: 1, transactionIndex: 1, firstSeenAt: 1 }).lean().cursor();
          let first = true;
          try { for await (const item of hashes) {
            if (!HASH_RE.test(item.txHash || '')) continue;
            await write(res, (first ? '' : ';') + item.txHash); first = false;
          } } finally { await hashes.close(); }
        }
        await write(res, '"\r\n');
      }
    } finally { await cursor.close(); }
    res.end();
  }));

  app.get('/api/admin/impact/export/onchain.json', ...read, route('mongo_onchain_export', async (req, res) => {
    const data = await summary();
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="litvm-onchain-evidence-' + data.generatedAt.slice(0, 10) + '.json"');
    const { contract: observedContract, relayer: observedRelayer, ...header } = data;
    const captureAt = new Date(data.generatedAt);
    const playerRows = await GamePlayer.aggregate(playerPipeline().concat([
      { $project: { playerName: 1, lastGameplayAt: 1, _id: 0 } }
    ])).exec();
    const registeredNames = new Set(playerRows.map(row => row.playerName));
    const activeNames = new Set(playerRows.filter(row => dateMs(row.lastGameplayAt) >= captureAt - 30 * DAY &&
      dateMs(row.lastGameplayAt) <= captureAt.getTime()).map(row => row.playerName));
    await write(res, JSON.stringify({ schemaVersion: 1, ...header, captureAt: captureAt.toISOString(),
      evidenceDefinition: 'Ledger rows first observed no later than captureAt. Contract counters below are calculated from exactly the emitted rows. Verify receipts and block hashes against the configured chain. Row statuses may change during streaming: this is not an atomic database/RPC snapshot.' }).slice(0, -1) + ',"transactions":[');
    const cursor = Transaction.find({ ...scope, firstSeenAt: { $lte: captureAt } }).select('txHash chainId contractAddress from to nonce blockNumber blockHash transactionIndex timestamp status canonical finalized attributionStatus playerName playerAddress attributionSource actorVerified participantPlayerNames action gameplayAction gasUsed effectiveGasPrice -_id')
      .sort({ blockNumber: 1, transactionIndex: 1, firstSeenAt: 1 }).lean().cursor();
    let first = true, count = 0;
    const contract = { ...observedContract, totalTransactions: 0, minedTransactions: 0, confirmedTransactions: 0,
      revertedTransactions: 0, pendingTransactions: 0, attributedTransactions: 0, inferredTransactions: 0, unattributedTransactions: 0,
      systemTransactions: 0, orphanedTransactions: 0, unresolvedTransactions: 0, activeWindowTransactions: 0,
      sponsoredTransactions: 0, attributedUserCount: 0, transactionsPerActiveUser: null, countersSource: 'serialized-evidence-rows' };
    const relayer = { ...observedRelayer, ledgerSignedTransactions: 0, sponsoredContractTransactions: 0,
      sponsoredSuccessfulTransactions: 0, sponsoredUniqueRegisteredPlayers: 0, countersSource: 'serialized-evidence-rows' };
    const attributedNames = new Set(), sponsoredNames = new Set();
    try { for await (const row of cursor) {
      if (!HASH_RE.test(row.txHash || '')) continue;
      await write(res, (first ? '' : ',') + JSON.stringify(row)); first = false; count++;
      const sponsored = Boolean(relayer.address && row.from && row.from.toLowerCase() === relayer.address.toLowerCase());
      if (sponsored && row.canonical === true && ['signed', 'pending', 'confirmed', 'reverted'].includes(row.status)) relayer.ledgerSignedTransactions++;
      if (row.canonical === true && ['confirmed', 'reverted'].includes(row.status)) {
        if (sponsored) {
          contract.sponsoredTransactions++; relayer.sponsoredContractTransactions++;
          if (row.status === 'confirmed') {
            relayer.sponsoredSuccessfulTransactions++;
            if (row.attributionStatus === 'attributed' && registeredNames.has(row.playerName)) sponsoredNames.add(row.playerName);
          }
        }
        contract.totalTransactions++; contract.minedTransactions++;
        contract[row.status === 'confirmed' ? 'confirmedTransactions' : 'revertedTransactions']++;
        if (row.attributionStatus === 'attributed') { contract.attributedTransactions++; if (registeredNames.has(row.playerName)) attributedNames.add(row.playerName); }
        else if (row.attributionStatus === 'inferred') contract.inferredTransactions++;
        else if (row.attributionStatus === 'system') contract.systemTransactions++;
        else contract.unattributedTransactions++;
        if (row.status === 'confirmed' && row.attributionStatus === 'attributed' && activeNames.has(row.playerName) &&
            dateMs(row.timestamp) >= captureAt - 30 * DAY && dateMs(row.timestamp) <= captureAt.getTime()) contract.activeWindowTransactions++;
      } else if (row.canonical === true && ['signed', 'pending'].includes(row.status)) contract.pendingTransactions++;
      else if (row.status === 'orphaned') contract.orphanedTransactions++;
      else contract.unresolvedTransactions++;
    } } finally { await cursor.close(); }
    contract.activeUserDenominator = activeNames.size;
    contract.attributedUserCount = attributedNames.size;
    relayer.sponsoredUniqueRegisteredPlayers = sponsoredNames.size;
    contract.transactionsPerActiveUser = activeNames.size ? contract.activeWindowTransactions / activeNames.size : null;
    await write(res, '],"contract":' + JSON.stringify(contract) + ',"relayer":' + JSON.stringify(relayer) + ',"exportedLedgerRows":' + count + ',"exportCompletedAt":' + JSON.stringify(new Date().toISOString()) + '}');
    res.end();
  }));

  return { recordPlaytimeSegment, summary, diagnostics, Segment, Meta, ensureReady };
}

module.exports = { mountImpactAnalytics, _test: { csvCell, classifyActivity, choosePlaytime, sessionSegment, summarizeSegments, retryableInitializer, impactFailure, withStage, boundedRead, createSnapshotCache, DAY, SESSION_GAP_MS } };
