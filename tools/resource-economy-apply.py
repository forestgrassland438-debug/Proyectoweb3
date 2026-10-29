from pathlib import Path
import re

ROOT = Path.cwd()
SERVER = Path('C:/Users/pc/Desktop/server2.js')

def read(p):
    return Path(p).read_text(encoding='utf-8')

def save(p, s):
    p = Path(p)
    original = p.read_bytes() if p.exists() else b''
    newline = '\r\n' if b'\r\n' in original else '\n'
    p.write_bytes(s.replace('\r\n', '\n').replace('\n', newline).encode('utf-8'))

def once(s, old, new):
    assert s.count(old) == 1, ('expected unique source', old[:100], s.count(old))
    return s.replace(old, new, 1)

def main():
    s = read(SERVER)
    assert 'RESOURCE_ECONOMY_START' not in s, 'Already applied; edit the current source instead.'
    marker = "console.log('✅ Reporter routes: /api/admin/client-errors, /api/admin/relay-failures');"
    s = once(s, marker, marker + '\n\n' + read('tools/resource-economy.fragment.cjs'))
    a = s.index('async function ensureItemTipoOnChain(')
    b = s.index('/**\n * Extrae', a)
    s = s[:a] + '''async function ensureItemTipoOnChain(contract, tipo, cantidad) {
  // Limits configured by the owner are immutable during gameplay, including
  // per-invoice limits. The contract remains the final atomic supply guard.
  if (!tipo || TABLAS_MANUALES.has(tipo) || !tiposDeItemPermitidos().has(tipo)) return;
  const stats = await contract.getTipoStats(tipo);
  const exists = Boolean(stats.exists ?? stats[5]);
  const quantity = BigInt(stats.totalQuantity ?? stats[0]);
  const limit = BigInt(stats.limit ?? stats[1]);
  const perInvoice = BigInt(stats.perInvoiceLimit ?? stats[2]);
  const requested = BigInt(cantidad);
  if (!exists || limit <= 0n || perInvoice <= 0n) throw Object.assign(new Error('resource_not_configured'), { code: 'resource_not_configured' });
  if (requested < 0n || quantity + requested > limit) throw Object.assign(new Error('resource_capacity_exhausted'), { code: 'resource_capacity_exhausted' });
  if (requested > perInvoice) throw Object.assign(new Error('resource_invoice_limit'), { code: 'resource_invoice_limit' });
}

''' + s[b:]
    s = once(s, "const GATHER_ENFORCE = String(process.env.GATHER_ENFORCE || '').toLowerCase() === 'true';", 'const GATHER_ENFORCE = true; // All deployed gathering clients use the authoritative endpoint.')
    # The supported keys come from the current hand-built scene; never invent nodes.
    scene = read('Scenes/GameScene.js')
    keys = sorted(set(re.findall(r"['\"](sprite_(?:pinos|arbustos|arbolx|minar_piedra|minar_cobre|minar_hierro|carbon)\d+)['\"]", scene)))
    assert len(keys) > 50, len(keys)
    s = once(s, 'function gatherNodeTypeFromKey(key) {', 'const RESOURCE_WORLD_NODES = new Set(' + __import__('json').dumps(keys) + ');\nfunction gatherNodeTypeFromKey(key) {')
    a = s.index('// Cooldown en memoria por jugador (evita spam del endpoint).')
    b = s.index('// =============================================================================\n// CONTROL DE ACCESO', a)
    s = s[:a] + read('tools/resource-gather.fragment.cjs') + '\n\n' + s[b:]
    # Both compatibility endpoints consult precisely the same table-based policy.
    for typ, model in [('treeType', 'Deforestation'), ('mineralType', 'MineDepletion')]:
        start = s.index("app.post('/api/tree/lock'" if typ == 'treeType' else "// POST /api/mine/lock")
        a = s.index('      // Obtener el porcentaje actual de deforestación' if typ == 'treeType' else '      // Obtener porcentaje de agotamiento actual', start)
        b = s.index('      const lockedUntil =', a)
        s = s[:a] + f'      const tableState = await resourceRespawn({typ});\n      const respawnSeconds = tableState.respawnSeconds;\n' + s[b:]
    # Old depletion counters stay for compatibility, but cannot drive policy.
    s = once(s, "const deforest = await Deforestation.findOne({ treeType });\n      res.json({ \n        treeType, \n        percent: deforest?.percent || 0 \n      });", "const table = await resourceRespawn(treeType);\n      res.json({ treeType, percent: table.occupancy, table });")
    s = once(s, "const depletion = await MineDepletion.findOne({ mineralType });\n      return res.json({\n        mineralType,\n        percent: depletion?.percent || 0\n      });", "const table = await resourceRespawn(mineralType);\n      return res.json({ mineralType, percent: table.occupancy, table });")
    # A fresh table reading is shared by all price calculations. Existing daily
    # movement limits and the bid/ask spread continue to apply after this factor.
    s = once(s, '  const cfg = await eco2Config();\n  const indice = eco2IndiceSync();\n  const ovs =', '  const cfg = await eco2Config();\n  const indice = eco2IndiceSync();\n  const resources = await resourceSnapshot();\n  const resourceFactors = new Map(resources.rows.filter(r => r.available && r.configured).map(r => [r.itemId, r.priceFactor]));\n  const ovs =')
    s = once(s, 'const p = eco2PrecioDinamico(base, cfg.indiceActivo ? indice : 1, dem);', 'const resourceFactor = resourceFactors.get(id) || 1;\n    const p = eco2PrecioDinamico(base, (cfg.indiceActivo ? indice : 1) * resourceFactor, dem);')
    s = once(s, '                  cambiado: !!base.cambiado };', '                  cambiado: !!base.cambiado, recurso: resourceFactor };')
    s = once(s, "if (indiceNuevo || p.dia !== doc._id) {", "if (indiceNuevo || p.dia !== doc._id || Date.now() - (p.resourceCheckedAt || 0) >= 60000) {")
    s = once(s, '_eco2Precios = { version, dia:', '_eco2Precios = { version, resourceCheckedAt: Date.now(), dia:')
    save(SERVER, s)
    print('Applied table policy to backend; canonical world nodes:', len(keys))

if __name__ == '__main__': main()
