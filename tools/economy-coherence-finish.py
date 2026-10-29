from pathlib import Path
p=Path('C:/Users/pc/Desktop/server2.js');s=p.read_text(encoding='utf8')
def rep(a,b):
 global s
 if a not in s: raise RuntimeError(a[:90])
 s=s.replace(a,b)
s=s.replace('const fee = Math.max(0, Math.round(gross * TESORO_COMISION_BPS / 10000));', 'const fee = gross > 0 ? Math.max(1, Math.round(gross * TESORO_COMISION_BPS / 10000)) : 0;')
s=s.replace('fee = Math.max(0, Math.round(gross * TESORO_COMISION_BPS / 10000));', 'fee = gross > 0 ? Math.max(1, Math.round(gross * TESORO_COMISION_BPS / 10000)) : 0;')
# Only server-settled trades influence demand; browser audit reports are not an oracle.
a=s.index('async function eco2DemandaTienda()');b=s.index('\n}\n',a)+3
s=s[:a]+'''async function eco2DemandaTienda() {
  const g = await ServicioCobro.aggregate([
    { $match: { tipo: { $in: ['tienda_compra', 'tienda_venta'] }, estado: 'completado', t: { $gte: new Date(Date.now() - 7 * 86400000) } } },
    { $group: { _id: { item: '$itemId', op: { $cond: [{ $eq: ['$tipo', 'tienda_compra'] }, 'compra', 'venta'] } }, n: { $sum: '$confirmadas' } } }
  ]);
  const m = new Map();
  for (const x of g) {
    const e = m.get(x._id.item) || { compras: 0, ventas: 0 };
    if (x._id.op === 'compra') e.compras += Number(x.n) || 0; else if (x._id.op === 'venta') e.ventas += Number(x.n) || 0;
    m.set(x._id.item, e);
  }
  return m;
}
''' + s[b:]
# Shop graphs/audit have a canonical server record too.
anchor="    const credit = venta ? net : refund;"
rep(anchor,"""    await TiendaOp.updateOne({ _id: id }, { $set: { tienda: 'juego', op: venta ? 'venta' : 'compra',
      playerName: row.playerName, itemId: row.itemId, cantidad: row.cantidad, moneda: 'bronce',
      estado: confirmed >= row.cantidad ? 'ok' : confirmed > 0 ? 'parcial' : 'reembolsada', fase: 'fin', t: row.t, tFin: new Date(),
      cliente: { precioUnidad: row.precioBronce, confirmadas: confirmed, fee, total: gross, pagadoBronce: venta ? net : 0 },
      verificacion: { visto: venta ? net : -gross - fee, esperado: venta ? net : -gross - fee, en: new Date(), solapada: false } } }, { upsert: true, session });
"""+anchor)
# Gold prices and shop indices share today's fully initialized snapshot.
rep("    await eco2Config();\n    const p = eco2PrecioTienda(b.itemId);", "    await eco2Config();\n    await eco2TrasFoto(await economiaHoy(), false);\n    const p = eco2PrecioTienda(b.itemId);")
rep("app.get('/api/economia/precios', apiLimiter, (req, res) => {\n  try {", "app.get('/api/economia/precios', apiLimiter, async (req, res) => {\n  try {\n    await eco2TrasFoto(await economiaHoy(), false);")
# Check replay inside the same atomic commit as the credit, even if an old DB lacks its hash index.
rep("  const doc = await ecoTransaccion(async (session) => {\n    const reservada", "  const doc = await ecoTransaccion(async (session) => {\n    if (await CompraOro.findOne({ txHash, _id: { $ne: id } }).session(session).lean()) throw ecoError('hash_ya_usado', 409);\n    const reservada")
p.write_text(s,encoding='utf8',newline='\r\n')
# New mocks represent server receipts rather than browser event reports.
p=Path(__file__).resolve().parent/'economia2.test.cjs';s=p.read_text(encoding='utf8')
s=s.replace("economiaFoto: async () => null, economiaConfig:", "economiaHoy: async () => null, economiaFoto: async () => null, economiaConfig:")
s=s.replace("TiendaOp: { aggregate: async () => op.ops || [] }", "TiendaOp: { aggregate: async () => op.ops || [], updateOne: async () => ({ matchedCount: 1 }) }")
anchor="  // Los valores por defecto del esquema (los pone mongoose al crear)."
s=s.replace(anchor,"  M.ServicioCobro.aggregate = async pipeline => pipeline[0]?.$match?.tipo ? op.ops || [] : [];\n"+anchor)
p.write_text(s,encoding='utf8')
print('Canonical paid demand, graph records and internal payment replay checks applied.')
