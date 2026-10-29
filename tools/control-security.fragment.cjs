// CONTROL_SECURITY_START — no secrets or vault material are selected here.
const _liveGameAccounts = new Map();
function livePresenceJoin(socket) {
  const wallet = String(socket.authenticatedAddress || '').toLowerCase();
  if (!socket.authenticatedPlayer || !/^0x[a-f0-9]{40}$/.test(wallet)) return;
  if (socket._presenceWallet === wallet) return;
  if (socket._presenceWallet) livePresenceLeave(socket);
  let item = _liveGameAccounts.get(wallet);
  if (!item) { item = { playerName: socket.authenticatedPlayer, sockets: new Set() }; _liveGameAccounts.set(wallet, item); }
  item.sockets.add(socket.id); socket._presenceWallet = wallet;
  if (!socket._presenceBound) { socket._presenceBound = true; socket.once('disconnect', () => livePresenceLeave(socket)); }
}
function livePresenceLeave(socket) {
  const wallet = socket._presenceWallet, item = _liveGameAccounts.get(wallet);
  if (item) { item.sockets.delete(socket.id); if (!item.sockets.size) _liveGameAccounts.delete(wallet); }
  socket._presenceWallet = null;
}
app.get('/api/admin/presencia', adminAuth, apiLimiter, (req, res) => {
  res.set('Cache-Control', 'no-store'); return res.json({ ok: true, conectados: _liveGameAccounts.size,
    presencia: { scope: 'instance', source: 'authenticated_game_sockets', observedAt: new Date().toISOString() } });
});
function reporterFingerprint(...parts) {
  const normalize = value => String(value || '').trim().slice(0, 8000)
    .replace(/0x[a-fA-F0-9]{40,}/g, '<address-or-hash>')
    .replace(/([?&](?:address|token|ticket|v|t|nonce)=)[^&\s]*/gi, '$1<value>')
    .replace(/\b(?:requestId|transactionId|nonce)\s*[:=]\s*[\w-]+/gi, '<request>');
  return 'group_' + crypto.createHash('sha256').update(parts.map(normalize).join('|')).digest('hex');
}
const errorActorSchema = new mongoose.Schema({
  errorId: { type: String, required: true }, wallet: { type: String, required: true }, playerName: String,
  count: { type: Number, default: 0 }, lastSeen: Date
}, { collection: 'error_report_actors', versionKey: false });
errorActorSchema.index({ errorId: 1, wallet: 1 }, { unique: true });
errorActorSchema.index({ lastSeen: 1 }, { expireAfterSeconds: 90 * 86400 });
const ErrorReportActor = mongoose.models.ErrorReportActor || mongoose.model('ErrorReportActor', errorActorSchema);
const reporterInboxSchema = new mongoose.Schema({ _id: String, clearedAt: Date, clearedBy: String }, { collection: 'reporter_inbox_state', versionKey: false });
const ReporterInbox = mongoose.models.ReporterInbox || mongoose.model('ReporterInbox', reporterInboxSchema);
async function reporterUpsert(key, update, options) {
  try { return await ErrorReport.findOneAndUpdate(key, update, options); }
  catch (e) { if (e.code !== 11000) throw e; return ErrorReport.findOneAndUpdate(key, update, { ...options, upsert: false }); }
}

app.get('/api/admin/cuentas', adminAuth, apiLimiter, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store'); res.set('Pragma', 'no-cache');
    const q = String(req.query.q || '').trim().slice(0, 100), after = String(req.query.after || '');
    if (after && !mongoose.Types.ObjectId.isValid(after)) return res.status(400).json({ error: 'invalid_cursor' });
    const filter = {}, limit = 50;
    if (after) filter._id = { $gt: new mongoose.Types.ObjectId(after) };
    if (q) {
      const prefix = new RegExp('^' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ address: prefix }, { playerName: prefix }, { Username: prefix }];
    }
    const docs = await GamePlayer.find(filter).select('playerName Username address email correo createdAt nivel tutorial mundo isGhost')
      .sort({ _id: 1 }).limit(limit + 1).maxTimeMS(5000).lean();
    const more = docs.length > limit; if (more) docs.pop();
    const wallets = docs.map(d => d.address).filter(Boolean), names = docs.map(d => d.playerName);
    const [identities, activity] = await Promise.all([
      mongoose.connection.collection('social_wallets').find({ address: { $in: wallets } },
        { projection: { _id: 0, address: 1, provider: 1, email: 1, emailVerified: 1, identityVerifiedAt: 1, lastUnlockAt: 1 } }).limit(150).toArray(),
      UserActivity.find({ playerName: { $in: names } }).select('playerName lastLogin loginCount registeredAt ultimaPartida discord').lean()
    ]);
    const byWallet = new Map(identities.map(x => [x.address, x])), byName = new Map(activity.map(x => [x.playerName, x]));
    return res.json({ ok: true, hasMore: more, next: more ? String(docs.at(-1)._id) : null, observedAt: new Date().toISOString(), presenceScope: 'instance',
      rows: docs.map(d => {
        const identity = byWallet.get(d.address), a = byName.get(d.playerName) || {};
        return { id: String(d._id), wallet: d.address || null, playerName: d.playerName, username: d.Username,
          email: identity?.email || d.email || d.correo || null, emailVerified: identity?.emailVerified === true,
          emailSource: identity?.email ? identity.provider : d.email || d.correo ? 'legacy_profile' : null,
          loginProvider: identity?.provider || 'wallet_signature', identityVerifiedAt: identity?.identityVerifiedAt || null,
          createdAt: d.createdAt, lastLogin: a.lastLogin || null, loginCount: a.loginCount || 0,
          lastGameplay: a.ultimaPartida || null, online: _liveGameAccounts.has(d.address), level: d.nivel,
          world: d.mundo, tutorial: d.tutorial, isGhost: !!d.isGhost, discord: a.discord || null };
      }) });
  } catch (e) { console.warn('admin accounts:', e.code || e.message); return res.status(503).json({ error: 'account_directory_unavailable' }); }
});

async function reporterGrouped(req, res, kind) {
  const relay = kind === 'relay', Model = relay ? RelayedTransaction : ErrorReport;
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 30)), skip = Math.min(10000, Math.max(0, parseInt(req.query.skip, 10) || 0));
  const inbox = relay ? await ReporterInbox.findById('relay').lean() : null;
  const filter = relay ? { status: 'failed', $and: [
    { $or: [{ revertReason: { $in: [null, ''] } }, { revertReason: { $exists: false } }] },
    { $or: [{ error: { $exists: false } }, { error: { $not: /execution reverted|call_exception|revert/i } }] }
  ] } : {};
  if (inbox?.clearedAt) filter.updatedAt = { $gt: inbox.clearedAt };
  const q = String(req.query.q || '').trim().slice(0, 120);
  if (q) {
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = (relay ? ['error', 'playerName', 'playerAddress', 'functionName'] : ['message', 'scene', 'file', 'playerName']).map(k => ({ [k]: re }));
    if (!relay && /^0x[a-f0-9]{40}$/i.test(q)) {
      const ids = await ErrorReportActor.find({wallet:q.toLowerCase()}).select('errorId').limit(1000).maxTimeMS(5000).lean();
      filter.$or.push({errorId:{$in:ids.map(x=>x.errorId)}});
    }
  }
  if (!relay && req.query.type) filter.type = String(req.query.type).slice(0, 40);
  const key = relay ? { fingerprint: { $ifNull: ['$errorFingerprint', '$error'] }, contract: '$contractName', fn: '$functionName' }
    : { type: '$type', message: '$message', file: '$file', line: '$line', scene: '$scene' };
  const report = await Model.aggregate([{ $match: filter }, { $group: { _id: key, count: { $sum: relay ? 1 : { $ifNull: ['$count', 1] } },
    lastSeen: { $max: relay ? '$updatedAt' : '$lastSeen' }, sample: { $first: relay ? {
      _id: '$_id', playerName: '$playerName', playerAddress: '$playerAddress', contractName: '$contractName', functionName: '$functionName',
      error: '$error', errorFingerprint: '$errorFingerprint', txHash: '$txHash', retryCount: '$retryCount', createdAt: '$createdAt'
    } : { _id: '$_id', errorId: '$errorId', type: '$type', message: '$message', scene: '$scene', file: '$file', line: '$line', stack: '$stack', playerName: '$playerName' } } } },
    { $sort: { count: -1, lastSeen: -1, '_id': 1 } }, { $facet: { tipos: [{ $group: { _id: '$_id.type' } }, { $sort: { _id: 1 } }, { $limit: 100 }], totals: [{ $group: { _id: null, groups: { $sum: 1 }, occurrences: { $sum: '$count' } } }],
      rows: [{ $skip: skip }, { $limit: limit }] } }]).allowDiskUse(true).option({ maxTimeMS: 10000 });
  const groups = report[0]?.rows || [];
  // Query only the current page. $facet limits returned actors without building
  // unbounded wallet arrays; the grouping itself can spill to disk.
  const items = [];
  for (const g of groups) {
    if (req.aborted || res.destroyed) return;
    const match = relay ? { ...filter, contractName: g.sample.contractName, functionName: g.sample.functionName,
      ...(g.sample.errorFingerprint ? { errorFingerprint: g.sample.errorFingerprint } : { error: g.sample.error || '' }) } : { errorId: g.sample.errorId };
    const actorModel = relay ? RelayedTransaction : ErrorReportActor;
    const actors = await actorModel.aggregate([{ $match: match }, { $group: { _id: relay ? '$playerAddress' : '$wallet',
      playerName: { $first: '$playerName' }, count: { $sum: relay ? 1 : '$count' } } }, { $sort: { count: -1, _id: 1 } },
      { $facet: { rows: [{ $limit: 20 }], total: [{ $count: 'n' }] } }]).allowDiskUse(true).option({ maxTimeMS: 5000 });
    items.push({ ...g.sample, count: g.count, lastSeen: g.lastSeen, actors: (actors[0]?.rows || []).map(a => ({ wallet: a._id, playerName: a.playerName, count: a.count, verified: true })),
      actorCount: actors[0]?.total?.[0]?.n || 0, historicalActor: !relay && !(actors[0]?.rows || []).length ? g.sample.playerName : null });
  }
  res.set('Cache-Control', 'no-store'); return res.json({ ok: true, grouped: true, items, total: report[0]?.totals?.[0]?.groups || 0,
    tipos: (report[0]?.tipos || []).map(t=>t._id).filter(Boolean), ocurrencias: report[0]?.totals?.[0]?.occurrences || 0, clearedAt: inbox?.clearedAt || null });
}
app.post('/api/admin/relay-failures/clear', adminAuth, strictLimiter, csrfProtection, async (req, res) => {
  if (req.body.confirm !== 'CLEAR') return res.status(400).json({ error: 'confirmation_required' });
  try {
    const clearedAt = new Date();
    await ReporterInbox.findOneAndUpdate({ _id: 'relay' }, { $set: { clearedAt, clearedBy: req.admin.address } }, { upsert: true });
    res.set('Cache-Control', 'no-store'); return res.json({ ok: true, clearedAt, auditPreserved: true });
  } catch (_) { return res.status(503).json({ error: 'reporter_clear_unavailable' }); }
});
// CONTROL_SECURITY_END
