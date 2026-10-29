from pathlib import Path
import re, json, importlib.util

spec = importlib.util.spec_from_file_location('resource_apply', 'tools/resource-economy-apply.py')
util = importlib.util.module_from_spec(spec); spec.loader.exec_module(util)
read, save, once = util.read, util.save, util.once

s = read(util.SERVER)
a = s.index('// RESOURCE_ECONOMY_START'); b = s.index('// RESOURCE_ECONOMY_END', a) + len('// RESOURCE_ECONOMY_END')
s = s[:a] + read('tools/resource-economy.fragment.cjs').rstrip() + s[b:]
a = s.index('// Each known world node is acquired'); b = s.index('// =============================================================================\n// CONTROL DE ACCESO', a)
s = s[:a] + read('tools/resource-gather.fragment.cjs') + '\n\n' + s[b:]
scene = read('Scenes/GameScene.js')
keys = sorted(set(re.findall(r"['\"]((?:sprite_(?:pinos|arbustos|arbolx|minar_piedra|minar_cobre|minar_hierro)_?|carbon_pngx)\d+)['\"]", scene)))
s = re.sub(r'const RESOURCE_WORLD_NODES = new Set\(\[[^\n]*\]\);', 'const RESOURCE_WORLD_NODES = new Set(' + json.dumps(keys) + ');', s)
s = once(s, 'new Set(Object.values(GATHER_REWARD_TIPO));', "new Set([...Object.values(GATHER_REWARD_TIPO), 'mineral_carbon']);")
# Waiting forever would retain the per-account queue and wallet lock forever.
a = s.index('async function mintGatherReward('); b = s.index('// RESOURCE_GATHER_START', a)
chunk = s[a:b].replace('await tx.wait();', 'await tx.wait(1, 120000);')
s = s[:a] + chunk + s[b:]
assert 'CONTROL_SECURITY_START' not in s
s = once(s, '// RESOURCE_ECONOMY_END', '// RESOURCE_ECONOMY_END\n\n' + read('tools/control-security.fragment.cjs'))
s = once(s, '    socket.join(room);', '    socket.join(room);\n    livePresenceJoin(socket);')
s = once(s, '      ConnectedUser.countDocuments({}),', '      Promise.resolve(_liveGameAccounts.size),')
s = once(s, '      totalCuentas, nuevas24h, nuevas7d, activos24h, conectados,', "      totalCuentas, nuevas24h, nuevas7d, activos24h, conectados,\n      presencia: { scope: 'instance', source: 'authenticated_game_sockets', observedAt: new Date().toISOString() },")
for path, kind in [('client-errors','client'), ('relay-failures','relay')]:
    old = f"app.get('/api/admin/{path}', adminAuth, apiLimiter, async (req, res) => {{\n  try {{"
    s = once(s, old, old + f"\n    if (req.query.grouped === '1') return await reporterGrouped(req, res, '{kind}');")
s = once(s, "  error: { type: String },\n  revertReason:", "  error: { type: String },\n  errorFingerprint: { type: String, index: true },\n  revertReason:")
marker = "// BANDEJA DE ERRORES DEL CLIENTE + FALLOS DE RELAY"
# Hooks are attached before compiling the existing relay model.
find = re.search(r"const RelayedTransaction = mongoose.model\('RelayedTransaction', relayedTransactionSchema\);", s)
assert find
hooks = '''relayedTransactionSchema.pre('save', function (next) {
  if (this.isModified('error')) this.errorFingerprint = reporterFingerprint(this.contractName, this.functionName, this.error);
  next();
});
relayedTransactionSchema.pre(['updateOne', 'findOneAndUpdate'], function (next) {
  const update = this.getUpdate();
  if (update && !Array.isArray(update)) {
    const fields = update.$set || update;
    if (Object.prototype.hasOwnProperty.call(fields, 'error')) {
      fields.errorFingerprint = reporterFingerprint(fields.error);
    }
  }
  next();
});
'''
s = s[:find.start()] + hooks + s[find.start():]
a = s.index('function generateErrorId(error) {'); b = s.index('// Socket status', a)
s = s[:a] + '''function generateErrorId(error) {
  const file = String(error.file || '').split('?')[0];
  return reporterFingerprint(error.type || 'unknown', String(error.message || 'Sin mensaje').slice(0, 800), error.scene || 'unknown', file, error.line || 'unknown');
}

''' + s[b:]
old = '        if (password !== ERROR_PASSWORD) {'
new = '''        let reporterActor = null;
        try {
          const token = req.cookies && req.cookies.session;
          const claims = token && jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
          if (claims && claims.type === 'access') reporterActor = await GamePlayer.findOne({ address: String(claims.address).toLowerCase() }).select('playerName address').lean();
        } catch (_) {}
        if (!reporterActor && (!ERROR_PASSWORD || password !== ERROR_PASSWORD)) {'''
s = once(s, old, new)
old = "                if (!res$) guardadosNuevos++;\n                procesados++;"
new = '''                if (!res$) guardadosNuevos++;
                if (reporterActor) {
                  const actorKey = { errorId, wallet: reporterActor.address };
                  const actorUpdate = { $inc: { count: 1 }, $set: { playerName: reporterActor.playerName, lastSeen: new Date() } };
                  try { await ErrorReportActor.updateOne(actorKey, actorUpdate, { upsert: true }); }
                  catch (e) { if (e.code !== 11000) throw e; await ErrorReportActor.updateOne(actorKey, actorUpdate); }
                }
                procesados++;'''
s = once(s, old, new)
s = once(s, "playerName: error.playerName || 'unknown'", "playerName: reporterActor ? reporterActor.playerName : String(error.playerName || 'unknown').slice(0, 100)")
s = once(s, '    const r = await ErrorReport.deleteMany({});', '    const r = await ErrorReport.deleteMany({});\n    await ErrorReportActor.deleteMany({});')
# Resource state cannot fall back to a cheaper multiplier on an RPC outage.
s = once(s, 'const resourceFactor = resourceFactors.get(id) || 1;', 'const resourceFactor = resourceFactors.get(id) || anterior.items[id]?.recurso || 1;')
s = once(s, "if (!soloItem) { try { demanda = await eco2DemandaTienda();", "if (!soloItem && motivo !== 'recursos') { try { demanda = await eco2DemandaTienda();")
s = once(s, "_eco2Recalculando = eco2RecalcularPrecios('diario').finally", "_eco2Recalculando = eco2RecalcularPrecios(indiceNuevo || p.dia !== doc._id ? 'diario' : 'recursos', null, !(indiceNuevo || p.dia !== doc._id)).finally")
save(util.SERVER, s)

# Activate the authoritative path in the shipped client, preserving the exact
# per-node reward probabilities and tier behaviour that were set by hand.
scene = once(scene, '      this.GATHER_SERVER = false;', '      this.GATHER_SERVER = true;')
scene = once(scene, 'const depletionSuccess = await updateDepletionPercent(mineralType, increment);', 'const depletionSuccess = this.GATHER_SERVER ? true : await updateDepletionPercent(mineralType, increment);')
scene = once(scene, 'const deforestSuccess = await updateDeforestationPercent(treeType, increment);', 'const deforestSuccess = this.GATHER_SERVER ? true : await updateDeforestationPercent(treeType, increment);')
scene = once(scene, 'const serverLockedUntil = await lockMine(mineKey, mineralType);', 'const serverLockedUntil = this.GATHER_SERVER ? this._resourceClaimLock : await lockMine(mineKey, mineralType);')
scene = once(scene, 'const serverLockedUntil = await lockTree(treeKey, treeType);', 'const serverLockedUntil = this.GATHER_SERVER ? this._resourceClaimLock : await lockTree(treeKey, treeType);')
scene = once(scene, 'rewards = await this._gatherClaim(mineKey, pickName);', '''rewards = await this._gatherClaim(mineKey, pickName);
        if (!rewards) { this._olvidarEstadoMina(mineKey); this.showMinedMineral(mineKey); this.enablePixelPerfectInput(spr); return; }''')
scene = once(scene, 'rewards = await this._gatherClaim(treeKey, pickName);', '''rewards = await this._gatherClaim(treeKey, pickName);
        if (!rewards) { this._olvidarEstadoArbol(treeKey); hideTreeStump(treeKey); this.enablePixelPerfectInput(spr); return; }''')
assert scene.count('if (rewards.length === 0) {') == 2
scene = scene.replace('if (rewards.length === 0) {', 'if (rewards.pending) { /* A separate reconciliation notice was shown. */ } else if (rewards.length === 0) {')
scene = scene.replace('setTimeout(() => unlockMineSprite(spr, mineKey), remainingMs);', 'this.time.delayedCall(remainingMs, () => unlockMineSprite(spr, mineKey));')
scene = scene.replace('setTimeout(() => unlockTreeSprite(spr, treeKey), remainingMs);', 'this.time.delayedCall(remainingMs, () => unlockTreeSprite(spr, treeKey));')
a = scene.index('async _gatherClaim(nodeKey, toolId) {'); b = scene.index('// ═══════════════════════════════════════════════════════════════════════════', a)
scene = scene[:a] + '''async _gatherClaim(nodeKey, toolId) {
  this._resourceClaimLock = null;
  const ref = window.crypto?.randomUUID?.() || ('gather_' + Date.now().toString(36) + Math.random().toString(36).slice(2));
  try {
    const res = await this.fetchWithTokenRetry(`${this.serverBase}/api/gather/claim`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nodeKey, toolId, ref })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || data.error || 'Gathering unavailable');
    if (!this.sys?.isActive?.()) return null;
    this._resourceClaimLock = new Date(data.lockedUntil);
    if (!Number.isFinite(this._resourceClaimLock.getTime())) throw new Error('Invalid resource cooldown');
    const rewards = [];
    for (const r of data.rewards || []) {
      if (!(r.invoiceId > 0) || !r.manualId || !(r.newTotal > 0)) continue;
      const itemId = r.itemId || Object.keys(this.ItemDefinitions).find(id => this.ItemDefinitions[id]?.tipo === r.tipo);
      if (!itemId) continue;
      const collections = [this.STATE.slots, this.STATE.quickSlots];
      let placed = false;
      for (const slots of collections) for (const slot of slots) {
        if (slot && Number(slot.idx) === r.invoiceId && slot.idm === r.manualId) { slot.count = r.newTotal; placed = true; }
      }
      if (!placed) for (const slots of collections) {
        const index = slots.findIndex((slot, n) => slot === null && !((slots === this.STATE.slots ? this.STATE.ghostSlots?.inv : this.STATE.ghostSlots?.quick)?.[n]));
        if (index >= 0) { slots[index] = { id: itemId, count: r.newTotal, idx: r.invoiceId, idm: r.manualId }; placed = true; break; }
      }
      if (!placed) this.notifications?.show('The item is confirmed on-chain. Free a slot and reconcile your inventory.', 'warning');
      rewards.push({ id: itemId, cantidad: r.quantity });
    }
    if (data.inventoryLoadedAt) this._inventoryLoadedAt = data.inventoryLoadedAt;
    this.rebuildPlayerInventoryFromState?.(); this.renderAllSlots?.();
    if (data.revision) { rewards.pending = true; this.notifications?.show(data.message, 'warning'); }
    return rewards;
  } catch (e) {
    this.notifications?.show(e.message || 'Resources cannot be verified right now.', 'error');
    return null;
  }
}

''' + scene[b:]
# Experience is granted after a successful authoritative node claim, including
# a genuine unlucky roll, but never after a failed RPC or occupied node.
for skill in ['mineria','deforestacion']:
    lines = f"      this.nivel_exp = (this.nivel_exp || 0) + 50;\n      this._sumarExpHabilidad('{skill}', 25);"
    if lines in scene: scene = scene.replace(lines, '', 1)
    else:
        # The hand-edited tree comments separate these two statements.
        start = scene.index('      // GATHER_SERVER (anti-trampa):', scene.index("console.log('✅ Sistema de minería"))
        pre = scene[:start]
        i = pre.rfind('      this.nivel_exp = (this.nivel_exp || 0) + 50;')
        if i >= 0: pre = pre[:i] + pre[i:].replace('      this.nivel_exp = (this.nivel_exp || 0) + 50;', '', 1)
        pre = pre.replace(f"      this._sumarExpHabilidad('{skill}', 25);", '', 1)
        scene = pre + scene[start:]
# Unique success blocks distinguish the two existing loops.
scene = once(scene, "      // (los textos de progreso y el estado ya se limpiaron arriba, ver FIX)", "      this.nivel_exp = (this.nivel_exp || 0) + 50;\n      this._sumarExpHabilidad('mineria', 25);\n      // (los textos de progreso y el estado ya se limpiaron arriba, ver FIX)")
pos = scene.index('rewards = await this._gatherClaim(treeKey, pickName);')
i = scene.index('      if (rewards.pending)', pos)
scene = scene[:i] + "      this.nivel_exp = (this.nivel_exp || 0) + 50;\n      this._sumarExpHabilidad('deforestacion', 25);\n" + scene[i:]
save('Scenes/GameScene.js', scene)
print('Integrated resource authority, reporter grouping, presence and account API; world nodes:', len(keys))
