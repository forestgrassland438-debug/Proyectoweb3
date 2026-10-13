// Embedded in server2.js after PlayerSkills. Chain tables contain only character allocations.
async function gfCharacterSnapshot(gp, invoices) {
  const address = String(gp.address).toLowerCase();
  const rows = invoices || await facturasDeCadena(address);
  const allocations = Object.fromEntries(GF_ALLOC_KEYS.map(k => [k, 0]));
  for (const f of rows) {
    const k = f.tipo.startsWith('player_') ? f.tipo.slice(7) : '';
    if (GF_ALLOC_KEYS.includes(k) && f.owner === address && Number.isSafeInteger(f.cantidad) && f.cantidad > 0) allocations[k] += f.cantidad;
  }
  const level = Math.max(0, nivelPorExperiencia(gp.nivel_exp));
  const spent = Object.values(allocations).reduce((a, b) => a + b, 0);
  await PlayerSkills.updateOne({ playerName: gp.playerName }, { $set: { allocations, allocationSyncAt: new Date() } }, { upsert: true });
  return { ok: true, level, available: Math.max(0, level - spent), allocations };
}
app.get('/api/player/skills', apiLimiter, authMiddleware, async (req, res) => {
  try {
    const gp = await jugadorDeLaSesion(req);
    if (!gp) return res.status(403).json({ error: 'no_autorizado' });
    return res.json(await gfCharacterSnapshot(gp));
  } catch (_) { return res.status(503).json({ error: 'chain_unavailable' }); }
});
app.post('/api/player/skills/allocate', apiLimiter, authMiddleware, csrfProtection, async (req, res) => {
  try {
    const key = String(req.body && req.body.skill || '');
    if (!GF_ALLOC_KEYS.includes(key)) return res.status(400).json({ error: 'unknown_skill' });
    const gp = await jugadorDeLaSesion(req);
    if (!gp) return res.status(403).json({ error: 'no_autorizado' });
    return await enColaDelJugador(String(gp.address).toLowerCase(), async () => {
      const fresh = await GamePlayer.findOne({ playerName: gp.playerName });
      const rows = await facturasDeCadena(gp.address);
      const state = await gfCharacterSnapshot(fresh, rows);
      if (!state.available) return res.status(409).json({ error: 'no_points', ...state });
      const tipo = 'player_' + key;
      const ready = await crearTablaSiFalta(tipo);
      const c = contratoItemsServidor();
      if (!c || !ready) return res.status(503).json({ error: 'chain_unavailable' });
      const invoice = rows.find(f => f.tipo === tipo && f.owner === String(gp.address).toLowerCase());
      const receipt = await txRelayer('character skill ' + key, o => invoice
        ? c.increaseInvoiceQuantity(invoice.id, 1, o)
        : c.createInvoice(gp.address, tipo, 1, 'skill:' + key + ':' + String(gp.address).toLowerCase(), o));
      if (receipt.status !== 1 && receipt.status !== 1n) throw new Error('unconfirmed');
      // Return the confirmed result even if the subsequent RPC/mirror read is unavailable.
      state.allocations[key]++; state.available--;
      try { await PlayerSkills.updateOne({ playerName: gp.playerName }, { $set: { allocations: state.allocations, allocationSyncAt: new Date() } }); } catch (_) {}
      return res.json({ ...state, transactionHash: receipt.hash || receipt.transactionHash });
    });
  } catch (_) { return res.status(503).json({ error: 'chain_unavailable' }); }
});
async function gfCharacterCosts(playerName, reason, costs, doc) {
  const result = { ...costs };
  const mirror = await PlayerSkills.findOne({ playerName }).select('allocations').lean();
  const a = mirror && mirror.allocations || {};
  if (result.vida > 0) {
    result.vida *= 1 - Math.min(0.4, Math.max(0, Number(a.defense) || 0) * 0.02);
    if (doc.swordGuardUntil && Date.now() < new Date(doc.swordGuardUntil).getTime()) result.vida *= 0.35;
    doc.lastDamageAt = new Date(); doc.lastFullVitalHeal = new Date();
  }
  const skill = /plant|water|harvest|farm|siembr|regar/.test(reason) ? 'farming' : /wood|chop|talar/.test(reason) ? 'woodcutting' : /fish|pesca/.test(reason) ? 'fishing' : null;
  if (skill) for (const k of ['agua', 'comida']) if (result[k]) result[k] *= 1 - Math.min(0.35, (Number(a[skill]) || 0) * 0.02);
  return result;
}
app.post('/api/player/sword-power', apiLimiter, authMiddleware, csrfProtection, async (req, res) => {
  try {
    if (!req.body || req.body.ability !== 'guard') return res.status(400).json({ error: 'unknown_ability' });
    const gp = await jugadorDeLaSesion(req);
    if (!gp) return res.status(403).json({ error: 'no_autorizado' });
    if (await esFantasma({ playerName: gp.playerName })) return responderFantasma(res);
    return await enColaDelJugador(String(gp.address).toLowerCase(), async () => {
      const rows = await facturasLibresDeCadena(gp.address);
      if (!rows.some(f => ['madera', 'cobre', 'hierro'].includes(f.tipo) && f.cantidad > 0)) return res.status(409).json({ error: 'sword_required' });
      const now = Date.now();
      const st = await PlayerStats.findOneAndUpdate({ playerName: gp.playerName,
        $or: [{ swordGuardReady: { $lte: new Date(now) } }, { swordGuardReady: null }] },
      { $set: { swordGuardReady: new Date(now + 12000), swordGuardUntil: new Date(now + 3000) } }, { new: true });
      return st ? res.json({ ok: true, duration: 3000 }) : res.status(429).json({ error: 'cooldown' });
    });
  } catch (_) { return res.status(503).json({ error: 'chain_unavailable' }); }
});
// Called on authenticated reads; no timer or transaction per healing tick.
function gfFullVitalHealing(doc, now) {
  const t = now.getTime(), previous = doc.lastFullVitalHeal && new Date(doc.lastFullVitalHeal).getTime();
  const eligible = !doc.vidaCongelada && Number(doc.vida) > 0 && Number(doc.vida) < 100 && Number(doc.agua) >= 100 && Number(doc.comida) >= 100 && !_venenos.has(doc.playerName);
  const combat = doc.lastDamageAt && t - new Date(doc.lastDamageAt).getTime() < 5000;
  if (!eligible || combat || !previous || t - previous > 30000 || t < previous) { doc.lastFullVitalHeal = now; return false; }
  const ticks = Math.floor((t - previous) / 5000);
  if (!ticks) return false;
  doc.lastFullVitalHeal = new Date(previous + ticks * 5000);
  doc.vida = clampStat('vida', Number(doc.vida) + ticks);
  marcarPendienteDeCadena(doc, ['vida']);
  return true;
}
app.get('/api/player/vitals', apiLimiter, authMiddleware, async (req, res) => {
  try {
    const gp = await jugadorDeLaSesion(req);
    if (!gp) return res.status(403).json({ error: 'no_autorizado' });
    const doc = await PlayerStats.findOne({ playerName: gp.playerName });
    if (!doc) return res.status(404).json({ error: 'sin_stats' });
    const before = { vida: doc.vida, agua: doc.agua, comida: doc.comida, lastFullVitalHeal: doc.lastFullVitalHeal || null, lastDamageAt: doc.lastDamageAt || null, vidaCongelada: !!doc.vidaCongelada };
    gfFullVitalHealing(doc, new Date());
    // Compare-and-swap: a delayed healing read must never undo a concurrent hit or death.
    const saved = await PlayerStats.findOneAndUpdate({ _id: doc._id, ...before }, { $set: { vida: doc.vida, lastFullVitalHeal: doc.lastFullVitalHeal }, ...(doc.vida > before.vida ? { $addToSet: { chainPending: 'vida' } } : {}) }, { new: true });
    const result = saved || await PlayerStats.findOne({ playerName: gp.playerName });
    return res.json({ ok: true, stats: buildStatsResponse(result), poisoned: _venenos.has(gp.playerName) });
  } catch (_) { return res.status(503).json({ error: 'stats_unavailable' }); }
});
app.post('/api/alchemist/use', apiLimiter, authMiddleware, csrfProtection, async (req, res) => {
  try {
    const itemId = String(req.body && req.body.itemId || '');
    if (!['pocion_vida', 'pocion_antidoto'].includes(itemId)) return res.status(400).json({ error: 'unknown_item' });
    const gp = await jugadorDeLaSesion(req);
    if (!gp) return res.status(403).json({ error: 'no_autorizado' });
    if (await esFantasma({ playerName: gp.playerName })) return responderFantasma(res);
    return await enColaDelJugador(String(gp.address).toLowerCase(), async () => {
      const doc = await PlayerStats.findOne({ playerName: gp.playerName });
      if (!doc) return res.status(409).json({ error: 'sin_stats' });
      if (itemId === 'pocion_vida' && doc.vida >= 100 || itemId === 'pocion_antidoto' && !_venenos.has(gp.playerName)) return res.status(409).json({ error: 'not_needed' });
      const rows = await facturasLibresDeCadena(gp.address);
      const f = rows.find(f => f.tipo === ITEM_TIPO_MAP[itemId] && f.cantidad > 0);
      if (!f) return res.status(409).json({ error: 'missing_potion' });
      const c = contratoItemsServidor();
      await txRelayer('use player potion', o => f.cantidad === 1 ? c.deleteInvoice(f.id, o) : c.decreaseInvoiceQuantity(f.id, 1, o));
      if (itemId === 'pocion_vida') { doc.vida = clampStat('vida', Number(doc.vida) + 50); marcarPendienteDeCadena(doc, ['vida']); }
      else { const v = _venenos.get(gp.playerName); if (v) clearTimeout(v.reloj); _venenos.delete(gp.playerName); }
      await doc.save();
      // Preserve the invoice IDs and all other items, rather than replacing the bag with a partial snapshot.
      const fresh = await GamePlayer.findOne({ playerName: gp.playerName });
      for (const arr of [fresh.inventory, fresh.chest]) if (Array.isArray(arr)) for (let i = 0; i < arr.length; i++) {
        const s = arr[i]; if (!s || s.objeto !== itemId || Number(s.IDX) !== f.id) continue;
        const n = Math.max(0, f.cantidad - 1);
        s.cantidad = n; if (!n) { s.objeto = ''; s.IDX = null; s.Manualid = null; }
        break;
      }
      fresh.marketWriteAt = new Date(); fresh.markModified('inventory'); fresh.markModified('chest'); await fresh.save();
      return res.json({ ok: true, stats: buildStatsResponse(doc), poisoned: _venenos.has(gp.playerName) });
    });
  } catch (_) { return res.status(503).json({ error: 'use_failed' }); }
});
async function gfAlchemistBuy(req,res) {
  try {
    const itemId=String(req.body&&req.body.itemId||''),cfg=ALQUIMISTA_CATALOGO[itemId];
    if(!cfg)return res.status(400).json({error:'item_desconocido'});
    const owner=await jugadorDeLaSesion(req);if(!owner)return res.status(403).json({error:'no_autorizado'});
    return await enColaDelJugador(String(owner.address).toLowerCase(),async()=>{
      const gp=await GamePlayer.findOne({playerName:owner.playerName});
      const qty=Math.max(1,Math.min(ALQUIMISTA_MAX_POR_COMPRA,Math.floor(Number(req.body&&req.body.qty)||1)));
      const preview=agregarASlots(gp.inventory,itemId,qty);
      if(preview.metidas<qty)return res.status(409).json({error:'inventario_lleno'});
      const cost=cfg.plata*qty;
      const stats=await PlayerStats.findOneAndUpdate({playerName:gp.playerName,plata:{$gte:cost}},{$inc:{plata:-cost},$addToSet:{chainPending:'plata'}},{new:true});
      if(!stats)return res.status(409).json({error:'plata_insuficiente',precio:cost});
      let invoice;
      try { invoice=await mintGatherReward(String(gp.address).toLowerCase(),itemTipoOnChain(itemId),qty);if(!invoice||!invoice.id)throw Error('mint'); }
      catch(e){await PlayerStats.updateOne({playerName:gp.playerName},{$inc:{plata:cost},$addToSet:{chainPending:'plata'}});return res.status(502).json({error:'acunado_fallido'});}
      const placed=ponerFacturaEnSlots(gp.inventory,gp.chest,itemId,invoice);
      gp.inventory=placed.inventory;gp.chest=placed.chest;gp.marketWriteAt=new Date();gp.markModified('inventory');gp.markModified('chest');
      let mirrorPending=false;try{await gp.save();}catch(e){mirrorPending=true;}
      return res.json({ok:true,itemId,qty,paid:cost,silver:stats.plata,stats:buildStatsResponse(stats),mirrorPending});
    });
  }catch(e){return res.status(503).json({error:'purchase_failed'});}
}
