// Se incrusta en server2.js mediante repair-shop-pvp.cjs.
// La cadena confirma la propiedad y cantidad; ningún precio/cantidad del
// cliente se usa para entregar objetos.
function reconciliarSlotsDeCadena(gp, facturas) {
  const porTipo = new Map(Object.entries(ITEM_TIPO_MAP).map(([id, tipo]) => [tipo, id]));
  const porId = new Map(facturas.filter(f => f.cantidad > 0 && porTipo.has(f.tipo)).map(f => [f.id, f]));
  const usados = new Set();
  const limpiar = (lista, max) => {
    const posiciones = new Set();
    return (lista || []).flatMap(s => {
      if (!s || !s.objeto || !Number.isInteger(s.id) || s.id < 0 || s.id >= max || posiciones.has(s.id)) return [];
      const f = porId.get(Number(s.IDX));
      if (!f || usados.has(f.id) || itemTipoOnChain(s.objeto) !== f.tipo || String(s.Manualid) !== f.manualId) return [];
      usados.add(f.id); posiciones.add(s.id);
      return [{ ...s, IDX: f.id, Manualid: f.manualId, cantidad: f.cantidad }];
    });
  };
  let inventory = limpiar(gp.inventory, INV_SLOTS);
  let chest = limpiar(gp.chest, CHEST_SLOTS);
  const pendientes = [];
  for (const f of porId.values()) {
    if (usados.has(f.id)) continue;
    const r = ponerFacturaEnSlots(inventory, chest, porTipo.get(f.tipo), f);
    inventory = r.inventory; chest = r.chest;
    if (!inventory.concat(chest).some(s => Number(s.IDX) === f.id)) pendientes.push(f.id);
  }
  return { inventory, chest, pendientes };
}

async function guardarInventarioProtegido(playerName, address, fields, loadedAt) {
  return enColaDelJugador('inventory:' + address, async () => {
    const gp = await GamePlayer.findOne({ playerName }).select('marketWriteAt').lean();
    const writtenAt = gp?.marketWriteAt ? new Date(gp.marketWriteAt).getTime() : 0;
    const readAt = Date.parse(loadedAt);
    const stale = writtenAt > 0 && (Number.isFinite(readAt)
      ? writtenAt > readAt : Date.now() - writtenAt < 600000);
    if (stale) { delete fields.inventory; delete fields.chest; }
    await saveGamePlayerWithTutorial(playerName, fields);
    return stale;
  });
}

app.post('/api/inventory/reconcile', apiLimiter, authMiddleware, csrfProtection, async (req, res) => {
  const address = String(req.user.address).toLowerCase();
  const itemId = String(req.body?.itemId || '');
  if (!itemTipoOnChain(itemId)) return res.status(400).json({ error: 'invalid_item' });
  const expected = req.body?.expectedInvoices;
  if (expected != null && (!Array.isArray(expected) || expected.length > INV_SLOTS + CHEST_SLOTS ||
      expected.some(f => !f || typeof f.manualId !== 'string' || !f.manualId || f.manualId.length > 256 ||
        !Number.isSafeInteger(f.cantidad) || f.cantidad < 1 ||
        (f.id != null && (!Number.isSafeInteger(f.id) || f.id < 1))))) {
    return res.status(400).json({ error: 'invalid_purchase_reference' });
  }
  try {
    const result = await enColaDelJugador('inventory:' + address, async () => {
      const auth = await PlayerAuth.findOne({ address }).lean();
      if (!auth?.playerName) throw new Error('user_not_found');
      // CAS: un guardado o entrega del mercado durante la lectura de la
      // cadena obliga a releer Mongo antes de escribir; no pierde la entrega.
      for (let attempt = 0; attempt < 4; attempt++) {
        const gp = await GamePlayer.findOne({ playerName: auth.playerName }).lean();
        if (!gp || String(gp.address).toLowerCase() !== address) throw new Error('user_not_found');
        const facturas = (await facturasLibresDeCadena(address)).filter(f => f.owner === address);
        const entregadas = facturas.filter(f => f.tipo === itemTipoOnChain(itemId));
        // Estas referencias solo exigen que la lectura alcance la compra
        // confirmada. Nunca crean objetos ni fijan cantidades en Mongo.
        if (!entregadas.length || (expected || []).some(ref => !entregadas.some(f =>
          f.manualId === ref.manualId && (ref.id == null || f.id === ref.id) && f.cantidad >= ref.cantidad))) {
          throw new Error('purchase_not_visible_on_chain');
        }
        const slots = reconciliarSlotsDeCadena(gp, facturas);
        const inventoryLoadedAt = new Date(Math.max(Date.now(), new Date(gp.marketWriteAt || 0).getTime() + 1));
        const saved = await GamePlayer.findOneAndUpdate({
          playerName: auth.playerName, address,
          inventory: gp.inventory ?? null, chest: gp.chest ?? null, marketWriteAt: gp.marketWriteAt || null
        }, { $set: { inventory: slots.inventory, chest: slots.chest, marketWriteAt: inventoryLoadedAt } }, { new: true });
        if (!saved) continue;
        const ids = new Set(slots.inventory.concat(slots.chest).map(s => Number(s.IDX)));
        const pendiente = entregadas.some(f => !ids.has(f.id));
        programarCasillasEnCadena(auth.playerName);
        return { success: !pendiente, error: pendiente ? 'inventory_full' : undefined,
          inventory: slots.inventory, chest: slots.chest, inventoryLoadedAt: inventoryLoadedAt.toISOString() };
      }
      throw new Error('inventory_changed_retry');
    });
    return res.status(result.success ? 200 : 409).json(result);
  } catch (e) {
    console.warn('inventory/reconcile:', e.message);
    return res.status(503).json({ success: false, error: 'inventory_sync_pending' });
  }
});
