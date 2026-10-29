// RESOURCE_GATHER_START
// Each known world node is acquired with one Mongo compare-and-set. A duplicate
// upsert is a competing claim, never permission to award the same node twice.
async function claimResourceNode(node, nodeKey, lockedUntil) {
  const Model = node.kind === 'tree' ? TreeLock : MineLock;
  const key = node.kind === 'tree' ? 'treeKey' : 'mineKey';
  const type = node.kind === 'tree' ? 'treeType' : 'mineralType';
  try {
    return await Model.findOneAndUpdate({ [key]: nodeKey, $or: [{ lockedUntil: { $lte: new Date() } }, { lockedUntil: null }] },
      { $set: { [type]: node.type, lockedUntil } }, { new: true, upsert: true }).lean();
  } catch (e) { if (e.code === 11000) return null; throw e; }
}
async function gatherToolAllowed(address, node, toolId) {
  const match = /^(hacha|pico)_de_(madera|piedra|cobre|hierro)$/.exec(String(toolId));
  if (!match || match[1] !== (node.kind === 'tree' ? 'hacha' : 'pico')) return false;
  const tipo = itemTipoOnChain(toolId);
  if (!tipo) return false;
  const contract = new ethers.Contract(CONTRACTS.ITEMS_CONTRACT.address, CONTRACTS.ITEMS_CONTRACT.abi, obtenerProveedorLecturaAdmin());
  const invoices = await contract.getUserInventorySnapshot(address);
  return invoices.some(inv => inv.active && String(inv.owner).toLowerCase() === address && String(inv.tipo) === tipo && BigInt(inv.cantidad) > 0n);
}
// Existing probabilities and mixed mine outputs are preserved from GameScene.
const RESOURCE_NODE_REWARDS = Object.freeze({
  pinos: [{ id: 'madera_pinos', chance: 100 }], arbustos: [{ id: 'madera_con_hojas', chance: 100 }], arbolx: [{ id: 'madera_seca', chance: 100 }],
  piedra: [{ id: 'mineral_piedra', chance: 100 }],
  cobre: [{ id: 'mineral_piedra', chance: 40 }, { id: 'mineral_piedra_cobre', chance: 60 }],
  hierro: [{ id: 'mineral_piedra', chance: 60 }, { id: 'mineral_piedra_hierro', chance: 40 }],
  carbon: [{ id: 'carbon', chance: 100 }, { id: 'mineral_carbon', chance: 100 }]
});
function resourceRollRewards(node, toolId, tables, random = Math.random) {
  const bonus = toolId.endsWith('_madera') ? 0.6 : toolId.endsWith('_piedra') ? 1.1 : toolId.endsWith('_cobre') ? 1.25 : 1.5;
  const candidates = RESOURCE_NODE_REWARDS[node.type].filter(r => tables.some(t => t.tipo === itemTipoOnChain(r.id) && !t.exhausted));
  let selected = candidates.filter(r => Math.floor(random() * 100) + 1 <= Math.min(100, r.chance * bonus));
  if (!selected.length && bonus >= 1 && candidates.length) selected = [candidates[0]];
  return selected.map(r => {
    const tipo = itemTipoOnChain(r.id), table = tables.find(t => t.tipo === tipo);
    return { tipo, itemId: r.id, quantity: Math.min(rollGatherAmount(toolId),
      Number(BigInt(table.remaining) < 3n ? BigInt(table.remaining) : 3n), Number(BigInt(table.perInvoiceLimit) < 3n ? BigInt(table.perInvoiceLimit) : 3n)) };
  });
}
const _resourceGatherInFlight = new Set();
const gatherReceiptSchema = new mongoose.Schema({
  _id: String, wallet: String, nodeKey: String, result: mongoose.Schema.Types.Mixed,
  status: { type: String, default: 'pending' }, createdAt: { type: Date, default: Date.now }
}, { collection: 'resource_gather_receipts', versionKey: false });
gatherReceiptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 86400 });
const GatherReceipt = mongoose.models.GatherReceipt || mongoose.model('GatherReceipt', gatherReceiptSchema);
async function resourcePersistInventory(address) {
  const auth = await PlayerAuth.findOne({ address }).lean();
  if (!auth?.playerName) throw new Error('user_not_found');
  const invoices = (await facturasLibresDeCadena(address)).filter(f => f.owner === address);
  for (let n = 0; n < 4; n++) {
    const gp = await GamePlayer.findOne({ playerName: auth.playerName, address }).lean();
    if (!gp) throw new Error('user_not_found');
    const slots = reconciliarSlotsDeCadena(gp, invoices);
    const stamp = new Date(Math.max(Date.now(), new Date(gp.marketWriteAt || 0).getTime() + 1));
    const saved = await GamePlayer.updateOne({ playerName: auth.playerName, address,
      inventory: gp.inventory ?? null, chest: gp.chest ?? null, marketWriteAt: gp.marketWriteAt || null },
      { $set: { inventory: slots.inventory, chest: slots.chest, marketWriteAt: stamp } });
    if (saved.matchedCount === 1) return stamp.toISOString();
  }
  throw new Error('inventory_changed_retry');
}
app.post('/api/gather/claim', apiLimiter, authMiddleware, csrfProtection,
  body('nodeKey').isString().isLength({ min: 1, max: 100 }), body('toolId').isString().isLength({ min: 1, max: 50 }),
  body('ref').isString().matches(/^[A-Za-z0-9_-]{8,64}$/),
  async (req, res) => {
    try {
      if (!validationResult(req).isEmpty()) return res.status(400).json({ error: 'invalid_gather_request' });
      const address = String(req.user.address).toLowerCase(), { nodeKey, toolId, ref } = req.body;
      if (await esFantasma({ address })) return responderFantasma(res);
      const node = gatherNodeTypeFromKey(nodeKey);
      if (!node || !RESOURCE_WORLD_NODES.has(nodeKey)) return res.status(400).json({ error: 'invalid_node' });
      if (_resourceGatherInFlight.has(address) || _resourceGatherInFlight.size >= 64) return res.status(429).json({ error: 'gather_busy' });
      _resourceGatherInFlight.add(address);
      try { return await enColaDelJugador('inventory:' + address, async () => {
        const receiptKey = address + ':' + ref;
        const previous = await GatherReceipt.findById(receiptKey).lean();
        if (previous) {
          if (previous.nodeKey !== nodeKey) return res.status(409).json({ error: 'gather_ref_conflict' });
          return res.status(previous.result ? previous.result.revision ? 202 : 200 : 202).json(previous.result || {
            ok: false, revision: true, error: 'gather_confirmation_pending', message: 'This gathering request is awaiting reconciliation; it will not be minted twice.' });
        }
        const table = await resourceRespawn(node.type);
        if (table.exhausted) return res.status(409).json({ error: 'resource_capacity_exhausted', message: 'This resource has reached its global table limit. Capacity returns when resources are consumed.', table });
        if (!await gatherToolAllowed(address, node, toolId)) return res.status(403).json({ error: 'gather_tool_required', message: 'You need to own the required tool.' });
        const lockedUntil = new Date(Date.now() + table.respawnSeconds * 1000);
        const acquired = await claimResourceNode(node, nodeKey, lockedUntil);
        if (!acquired) return res.status(409).json({ error: 'node_locked', message: 'Another player has already gathered this node.' });
        await GatherReceipt.create({ _id: receiptKey, wallet: address, nodeKey, createdAt: new Date() });
        try { io.emit(node.kind === 'tree' ? 'treeLocked' : 'mineLocked', { [node.kind === 'tree' ? 'treeKey' : 'mineKey']: nodeKey,
          [node.kind === 'tree' ? 'treeType' : 'mineralType']: node.type, lockedUntil }); } catch (_) {}
        const rewards = resourceRollRewards(node, toolId, table.tables), confirmed = [];
        let revision = false;
        for (const reward of rewards) {
          let minted;
          try { minted = await mintGatherReward(address, reward.tipo, reward.quantity); } catch (_) {}
          if (!minted || !minted.id) { revision = true; break; }
          confirmed.push({ ...reward, invoiceId: minted.id, manualId: minted.manualId, newTotal: minted.cantidad });
        }
        let inventoryLoadedAt = null;
        if (confirmed.length) { try { inventoryLoadedAt = await resourcePersistInventory(address); } catch (_) { revision = true; } }
        const result = { ok: true, locked: true, lockedUntil, table, rewards: confirmed, inventoryLoadedAt,
          revision, message: revision ? 'Some deliveries need inventory reconciliation. Only confirmed items are shown.' : undefined };
        await GatherReceipt.updateOne({ _id: receiptKey }, { $set: { result, status: revision ? 'review' : 'confirmed' } });
        return res.status(revision ? 202 : 200).json(result);
      }); } finally { _resourceGatherInFlight.delete(address); }
    } catch (e) {
      console.warn('gather:', e.code || e.message);
      return res.status(503).json({ error: e.code || 'resource_read_unavailable', message: 'Resources cannot be verified right now. No delivery was reported as confirmed.' });
    }
  });
// RESOURCE_GATHER_END
