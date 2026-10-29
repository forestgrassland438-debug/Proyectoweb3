// RESOURCE_ECONOMY_START — controlled by the deployed table caps; never raises them.
function createResourceEconomy({ readStats, readPolicy, now = Date.now, ttl = 15000, concurrency = 3, knownTypes }) {
  const defaults = Object.freeze({ enabled: true, startPercent: 50, baseRespawn: 60, maxRespawn: 1800, priceMax: 2.5 });
  const allowed = new Set(knownTypes), cache = new Map();
  let active = 0, queue = [], policy = null, policyAt = 0, policyWork = null;
  function validate(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_resource_policy');
    const out = { ...defaults, ...input };
    for (const k of Object.keys(input)) if (!Object.prototype.hasOwnProperty.call(defaults, k)) throw new Error('unknown_resource_policy_field');
    if (typeof out.enabled !== 'boolean') throw new Error('invalid_resource_policy');
    for (const [key, min, max] of [['startPercent', 0, 95], ['baseRespawn', 10, 3600], ['maxRespawn', 10, 86400], ['priceMax', 1, 5]]) {
      if (typeof out[key] !== 'number' || !Number.isFinite(out[key]) || out[key] < min || out[key] > max) throw new Error('invalid_resource_policy');
    }
    if (!Number.isInteger(out.baseRespawn) || !Number.isInteger(out.maxRespawn) || out.maxRespawn < out.baseRespawn) throw new Error('invalid_resource_policy');
    return out;
  }
  function evaluate(raw, settings = defaults) {
    const cfg = validate(settings);
    const quantity = BigInt(raw.totalQuantity ?? raw[0]), limit = BigInt(raw.limit ?? raw[1]);
    const perInvoice = BigInt(raw.perInvoiceLimit ?? raw[2]), burned = BigInt(raw.totalBurned ?? raw[4] ?? 0);
    const invoices = BigInt(raw.invoiceCount ?? raw[3] ?? 0), exists = Boolean(raw.exists ?? raw[5]);
    if ([quantity, limit, perInvoice, burned, invoices].some(n => n < 0n)) throw new Error('invalid_table_stats');
    const configured = exists && limit > 0n && perInvoice > 0n;
    const remaining = limit > quantity ? limit - quantity : 0n;
    const occupancy = configured ? Number((quantity * 10000n) / limit) / 100 : null;
    const pressure = configured && cfg.enabled ? Math.min(1, Math.max(0, (occupancy - cfg.startPercent) / (100 - cfg.startPercent))) : 0;
    const curve = pressure * pressure * (3 - 2 * pressure);
    return { configured, exists, totalQuantity: quantity.toString(), limit: limit.toString(), perInvoiceLimit: perInvoice.toString(),
      totalBurned: burned.toString(), invoiceCount: invoices.toString(), remaining: remaining.toString(), occupancy,
      exhausted: configured && remaining === 0n, respawnSeconds: Math.round(cfg.baseRespawn + (cfg.maxRespawn - cfg.baseRespawn) * curve),
      priceFactor: Math.round((1 + (cfg.priceMax - 1) * curve) * 10000) / 10000 };
  }
  async function config() {
    if (policy && now() - policyAt < 10000) return policy;
    if (!policyWork) policyWork = Promise.resolve().then(readPolicy).then(doc => {
      policy = { version: doc?.version || 0, settings: validate(doc?.settings || {}) }; policyAt = now(); return policy;
    }).finally(() => { policyWork = null; });
    return policyWork;
  }
  async function limited(work) {
    if (active >= concurrency) {
      if (queue.length >= allowed.size) throw new Error('resource_read_queue_full');
      await new Promise(resolve => queue.push(resolve));
    } else active++;
    try { return await work(); } finally { const next = queue.shift(); if (next) next(); else active--; }
  }
  async function state(tipo, force = false) {
    if (!allowed.has(tipo)) throw new Error('unknown_resource_table');
    let entry = cache.get(tipo);
    if (!entry) { entry = {}; cache.set(tipo, entry); }
    if (!force && entry.value && now() - entry.at < ttl) return entry.value;
    if (entry.work) return entry.work;
    if (entry.retryAt > now()) throw new Error('resource_rpc_unavailable');
    entry.work = limited(async () => {
      try {
        const [stats, cfg] = await Promise.all([readStats(tipo), config()]);
        entry.value = { tipo, ...evaluate(stats, cfg.settings), observedAt: new Date(now()).toISOString(), policyVersion: cfg.version };
        entry.at = now(); entry.retryAt = 0; return entry.value;
      } catch (e) { entry.retryAt = now() + 5000; throw e; }
    }).finally(() => { entry.work = null; });
    return entry.work;
  }
  function invalidate(tipo) { if (tipo) cache.delete(tipo); else { cache.clear(); policy = null; } }
  return { defaults, validate, evaluate, config, state, invalidate, metrics: () => ({ entries: cache.size, active, queued: queue.length }) };
}

const resourcePolicySchema = new mongoose.Schema({
  _id: { type: String }, version: { type: Number, default: 0 }, settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  updatedBy: String, updatedAt: Date
}, { versionKey: false, collection: 'resource_economy_policy' });
const ResourcePolicy = mongoose.models.ResourcePolicy || mongoose.model('ResourcePolicy', resourcePolicySchema);
const RESOURCE_STATS_ABI = ['function getTipoStats(string) view returns(uint256 totalQuantity,uint256 limit,uint256 perInvoiceLimit,uint256 invoiceCount,uint256 totalBurned,bool exists)',
  'function migrationSealed() view returns(bool)', 'function setLimit(string,uint256,uint256)'];
const RESOURCE_ITEM_IDS = Object.freeze({ 'madera pinos': 'madera_pinos', 'madera seca': 'madera_seca', 'madera con hojas': 'madera_con_hojas',
  mineral_piedra: 'mineral_piedra', mineral_piedra_cobre: 'mineral_piedra_cobre', mineral_piedra_hierro: 'mineral_piedra_hierro', carbon: 'carbon', mineral_carbon: 'mineral_carbon' });
const resourceEconomy = createResourceEconomy({
  knownTypes: Object.keys(RESOURCE_ITEM_IDS),
  readPolicy: () => ResourcePolicy.findById('policy').lean(),
  readStats: tipo => new ethers.Contract(CONTRACTS.ITEMS_CONTRACT.address, RESOURCE_STATS_ABI, obtenerProveedorLecturaAdmin()).getTipoStats(tipo)
});
async function resourceState(tipo) { return resourceEconomy.state(tipo); }
async function resourcePurchaseBatch(itemId, quantity) {
  const tipo=itemTipoOnChain(itemId);
  if(!Object.prototype.hasOwnProperty.call(RESOURCE_ITEM_IDS,tipo))return null;
  const table=await resourceState(tipo);
  if(!table.configured)throw ecoError('resource_not_configured',409);
  if(BigInt(table.remaining)<BigInt(quantity))throw ecoError('resource_capacity_exhausted',409);
  return Number(BigInt(table.perInvoiceLimit)<BigInt(quantity)?BigInt(table.perInvoiceLimit):BigInt(quantity));
}
let _resourceMigration = { at: 0, sealed: null }, _resourceMigrationWork = null;
async function resourceMigrationStatus() {
  if (Date.now() - _resourceMigration.at < 60000) return _resourceMigration.sealed;
  if (!_resourceMigrationWork) _resourceMigrationWork = (async()=>{
    let sealed = null;
    try { sealed = await new ethers.Contract(CONTRACTS.ITEMS_CONTRACT.address, RESOURCE_STATS_ABI, obtenerProveedorLecturaAdmin()).migrationSealed(); } catch (_) {}
    _resourceMigration = {at:Date.now(),sealed}; return sealed;
  })().finally(()=>{_resourceMigrationWork=null;});
  return _resourceMigrationWork;
}
async function resourceRespawn(nodeType) {
  const tipos = RESOURCE_NODE_REWARDS[nodeType].map(r => itemTipoOnChain(r.id));
  const tables = await Promise.all(tipos.map(resourceState));
  if (tables.some(s => !s.configured)) throw Object.assign(new Error('Resource table has not been configured by the administrator.'), { code: 'resource_not_configured' });
  const main = tables.find(t => t.tipo === GATHER_REWARD_TIPO[nodeType]) || tables[0];
  return { ...main, tables, exhausted: tables.every(t => t.exhausted), respawnSeconds: Math.max(...tables.map(t => t.respawnSeconds)) };
}
async function resourceSnapshot() {
  const cfg = await resourceEconomy.config();
  const rows = await Promise.all(Object.keys(RESOURCE_ITEM_IDS).map(async tipo => {
    try { return { ...await resourceState(tipo), itemId: RESOURCE_ITEM_IDS[tipo], available: true }; }
    catch (_) { return { tipo, itemId: RESOURCE_ITEM_IDS[tipo], available: false, error: 'resource_read_unavailable' }; }
  }));
  return { ok: true, migrationSealed: await resourceMigrationStatus(), contract:CONTRACTS.ITEMS_CONTRACT.address, chainId:Number(CHAIN_ID), settings: cfg.settings, version: cfg.version, rows, observedAt: new Date().toISOString(), cacheSeconds: 15,
    gatherAuthoritative: GATHER_ENFORCE, capsAutomaticallyRaised: false };
}
app.get('/api/economia/recursos', apiLimiter, async (req, res) => {
  try { res.set('Cache-Control', 'no-store'); return res.json(await resourceSnapshot()); }
  catch (_) { return res.status(503).json({ error: 'resource_read_unavailable' }); }
});
app.get('/api/admin/recursos', adminAuth, apiLimiter, async (req, res) => {
  try { res.set('Cache-Control', 'no-store'); return res.json({ ...await resourceSnapshot(), diagnostics: resourceEconomy.metrics() }); }
  catch (_) { return res.status(503).json({ error: 'resource_read_unavailable' }); }
});
app.post('/api/admin/recursos/simular', adminAuth, apiLimiter, csrfProtection, async (req, res) => {
  try {
    const settings = resourceEconomy.validate(req.body.settings), current = await resourceSnapshot();
    const rows = current.rows.map(row => row.available ? { ...row, ...resourceEconomy.evaluate(row, settings) } : row);
    const curve = Array.from({ length: 101 }, (_, occupancy) => ({ occupancy, ...resourceEconomy.evaluate({ totalQuantity: occupancy,
      limit: 100, perInvoiceLimit: 10, invoiceCount: 0, totalBurned: 0, exists: true }, settings) }));
    res.set('Cache-Control', 'no-store'); return res.json({ ok: true, simulation: true, rows, curve, settings });
  } catch (e) { return res.status(/invalid_resource_policy|unknown_resource_policy_field/.test(e.message) ? 400 : 503).json({ error: e.message === 'unknown_resource_policy_field' ? e.message : 'resource_preview_unavailable' }); }
});
app.post('/api/admin/recursos/config', adminAuth, strictLimiter, csrfProtection, async (req, res) => {
  try {
    const settings = resourceEconomy.validate(req.body.settings);
    const version = req.body.version;
    if (!Number.isSafeInteger(version) || version < 0) return res.status(400).json({ error: 'invalid_version' });
    let doc;
    try {
      doc = await ResourcePolicy.findOneAndUpdate({ _id: 'policy', version }, {
        $set: { settings, updatedBy: req.admin.address, updatedAt: new Date() }, $inc: { version: 1 }
      }, { new: true, upsert: version === 0, runValidators: true }).lean();
    } catch (e) { if (e.code !== 11000) throw e; }
    if (!doc) return res.status(409).json({ error: 'resource_config_conflict', message: 'Another administrator changed this policy. Refresh before saving.' });
    resourceEconomy.invalidate();
    let pricesRecalculated = true;
    try { await eco2RecalcularPrecios('recursos'); } catch (_) { pricesRecalculated = false; }
    res.set('Cache-Control', 'no-store'); return res.json({ ok: true, version: doc.version, settings, pricesRecalculated });
  } catch (e) {
    if (/invalid_resource_policy|unknown_resource_policy_field/.test(e.message)) return res.status(400).json({ error: e.message });
    return res.status(503).json({ error: 'resource_config_unavailable' });
  }
});
const resourceLimitAuditSchema=new mongoose.Schema({_id:String,admin:String,tipo:String,limit:String,perInvoiceLimit:String,observedAt:Date},{collection:'resource_limit_audit',versionKey:false});
const ResourceLimitAudit=mongoose.models.ResourceLimitAudit || mongoose.model('ResourceLimitAudit',resourceLimitAuditSchema);
app.post('/api/admin/recursos/limites/confirmar',adminAuth,strictLimiter,csrfProtection,async(req,res)=>{
  try{
    const hash=String(req.body.txHash || '');if(!/^0x[a-f0-9]{64}$/i.test(hash))return res.status(400).json({error:'invalid_transaction_hash'});
    const provider=obtenerProveedorLecturaAdmin(),[receipt,tx]=await Promise.all([provider.getTransactionReceipt(hash),provider.getTransaction(hash)]);
    if(!receipt || Number(receipt.status)!==1 || !tx)return res.status(409).json({error:'limit_transaction_not_confirmed'});
    if(String(tx.to).toLowerCase()!==String(CONTRACTS.ITEMS_CONTRACT.address).toLowerCase() || String(tx.from).toLowerCase()!==String(req.admin.address).toLowerCase())return res.status(403).json({error:'limit_transaction_owner_mismatch'});
    const parsed=new ethers.Interface(RESOURCE_STATS_ABI).parseTransaction({data:tx.data,value:tx.value});
    if(parsed?.name!=='setLimit' || !Object.prototype.hasOwnProperty.call(RESOURCE_ITEM_IDS,String(parsed.args[0])))return res.status(400).json({error:'not_a_resource_limit_transaction'});
    const tipo=String(parsed.args[0]);
    await ResourceLimitAudit.updateOne({_id:hash},{$setOnInsert:{admin:req.admin.address,tipo,limit:String(parsed.args[1]),perInvoiceLimit:String(parsed.args[2]),observedAt:new Date()}},{upsert:true});
    resourceEconomy.invalidate();let pricesRecalculated=true;
    try{await eco2RecalcularPrecios('recursos',null,true);}catch(_){pricesRecalculated=false;}
    res.set('Cache-Control','no-store');return res.json({ok:true,txHash:hash,tipo,pricesRecalculated});
  }catch(_){return res.status(503).json({error:'limit_confirmation_unavailable',message:'Comprueba el hash antes de volver a enviar una transacción.'});}
});
// RESOURCE_ECONOMY_END
