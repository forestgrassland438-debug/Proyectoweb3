"""Targeted, asserted edits. Originals are in audits/economia-20261028."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SERVER = Path('C:/Users/pc/Desktop/server2.js')
s = SERVER.read_text(encoding='utf-8-sig')

def replace(old, new, count=1):
    global s
    found = s.count(old)
    if found != count:
        raise RuntimeError(f'Expected {count}, got {found}: {old[:100]}')
    s = s.replace(old, new)

# Keep the legacy collection as an archive; only the two active treasuries receive money.
replace("'admin', 'servicios'];", "'admin', 'servicios', 'muerte'];")
replace("  zkltc:     { gwei: _cero(), compras: _cero(), oro: _cero() },", "  retenidoServicios: _cero(),\n  economia2: { type: mongoose.Schema.Types.Mixed, default: null },\n  migracionReservaV1: { type: Boolean, default: false },\n  zkltc:     { gwei: _cero(), compras: _cero(), oro: _cero() },")
a = s.index('async function tesoroReservaIngresar(')
b = s.index('\nfunction tesoroReservaPublico', a)
s = s[:a] + "async function tesoroReservaIngresar(origen, bronce, playerName, detalle) {\n  // Compatibility for existing death callers: the game treasury is the reserve.\n  return tesoroJuegoIngresar(origen, bronce, playerName, detalle);\n}\n" + s[b:]
replace("try { const t = await TesoroReserva.findById(TESORO_RESERVA_ID).select('config').lean(); guardada = t && t.config; }", "try { await eco2MigrarReserva(); const t = await TesoroJuego.findById(TESORO_JUEGO_ID).select('economia2').lean(); guardada = t && t.economia2; }")
replace("await TesoroReserva.updateOne({ _id: TESORO_RESERVA_ID }, { $set: { config: c } }, { upsert: true });", "await TesoroJuego.updateOne({ _id: TESORO_JUEGO_ID }, { $set: { economia2: c } }, { upsert: true });")
replace("  reserva:  () => ({ modelo: TesoroReserva, id: TESORO_RESERVA_ID })\n", "")
replace("  juego:    () => ({ modelo: TesoroJuego, id: TESORO_JUEGO_ID }),\n});", "  juego:    () => ({ modelo: TesoroJuego, id: TESORO_JUEGO_ID })\n});")
replace("      tesoros: {\n        circular:", "      tesoros: {\n        circular:") # assertion of API anchor
replace("        reserva: tesoroReservaPublico(tr)\n", "")
replace("quemado: Math.max(0, Number(tj && tj.quemado) || 0) },\n      },", "quemado: Math.max(0, Number(tj && tj.quemado) || 0), retenido: Math.max(0, Number(tj && tj.retenidoServicios) || 0), ingresado: tj && tj.ingresado || {} }\n      },")
replace("tesoros: { circular: hoy.tesoroCircular, juego: hoy.tesoroJuego, reserva: hoy.tesoroReserva || 0 },", "tesoros: { circular: hoy.tesoroCircular, juego: hoy.tesoroJuego },")
replace("TesoroReserva.findById(TESORO_RESERVA_ID).select('saldo').lean(), EconomiaDia.findById(hoy).lean(), eco2Config()", "Promise.resolve(null), EconomiaDia.findById(hoy).lean(), eco2Config()")
replace("tesoro: 'reserva', origen: 'muerte', t:", "tesoro: 'juego', origen: 'muerte', t:")
replace("const [cfg, cfgOro, tc, tj, tr, serie, ultimas, porOrigen, servicios, muertes30] = await Promise.all([", "await eco2MigrarReserva();\n    const [cfg, cfgOro, tc, tj, tr, serie, ultimas, porOrigen, servicios, muertes30] = await Promise.all([")
replace("Tesoro.findById(TESORO_ID).lean(), TesoroJuego.findById(TESORO_JUEGO_ID).lean(), TesoroReserva.findById(TESORO_RESERVA_ID).lean(),", "Tesoro.findById(TESORO_ID).lean(), TesoroJuego.findById(TESORO_JUEGO_ID).lean(), Promise.resolve(null),")
a = s.index("app.post('/api/admin/tesoro-reserva/ajuste'")
b = s.index('// GET /api/admin/precios', a)
s = s[:a] + "app.post('/api/admin/tesoro-reserva/ajuste', adminAuth, strictLimiter, (req, res) =>\n  res.status(410).json({ error: 'reserva_integrada', message: 'Use the game treasury. There are two active treasuries.' }));\n\n" + s[b:]
# Destroyed objects are a separate, non-monetary statistic, never a price oracle.
replace("  pesoObjetos: 1,", "  pesoObjetos: 0,")
replace("pesoObjetos: num(s.pesoObjetos, B.pesoObjetos, 0, 1),", "pesoObjetos: 0,")
replace("const neta7 = activa7 === null ? null : activa7 - quema;", "const neta7 = activa7; // Objects do not remove money. Client reports cannot drive prices.")
replace("quemaObjetos7: quema };", "quemaObjetos7: 0, valorObjetosDestruidos7: Math.max(0, Number(objetos7) || 0) };")
# Fees can never silently become zero, including old configs.
replace("c.fundirMin : c.craftearMin) * eco2IndiceSync()", "c.fundirMin : c.craftearMin) * eco2IndiceSync()")
replace("return Math.max(minimo, Math.round(eco2ValorUnidad(itemId) * q * tasa));", "return Math.max(1, minimo, Math.round(eco2ValorUnidad(itemId) * tasa)) * q;")
# The quoted price is fixed for the UTC day, as is the shop index.
replace("precioGwei: economiaPrecioGwei(cfg, ayer ? ayer.precioGwei : 0, infPrecio),", "precioGwei: actual && actual.precioGwei > 0 ? actual.precioGwei : economiaPrecioGwei(cfg, ayer ? ayer.precioGwei : 0, infPrecio),")
replace("    eco2TrasFoto(doc, set.indice !== undefined).catch", "    await eco2TrasFoto(doc, set.indice !== undefined).catch")
replace("if (!(oro >= cfg.minimoCompra))", "if (!Number.isSafeInteger(oro) || !(oro >= cfg.minimoCompra))")
replace("const oro = Math.floor(Number(req.body && req.body.oro));", "const oro = Number(req.body && req.body.oro);")
# Atomic daily quote limit within the existing per-wallet queue.
a = s.index("    const pub = await economiaEstadoPublico();", s.index("app.post('/api/currency/oro/cotizar'"))
b = s.index("  } catch (e)", a)
s = s[:a] + "    return await enColaDelJugador(address, async () => {\n" + s[a:b] + "    });\n" + s[b:]
replace("if (Number(ultimo) - Number(rc.blockNumber) + 1 < 1)", "if (Number(ultimo) - Number(rc.blockNumber) + 1 < 3)")
replace("if (!rc) return { error: 'pendiente', existe: true };", "if (!rc) return { error: 'pendiente', existe: true, from: String(tx.from || '').toLowerCase(), to: String(tx.to || '').toLowerCase() };")
replace("if (pago.error === 'pendiente') {\n        await CompraOro.updateOne", "if (pago.error === 'pendiente') {\n        if (!pago.existe || pago.from !== address || pago.to !== c.destino) return res.status(202).json({ error: 'pendiente' });\n        await CompraOro.updateOne")
replace("  const pedido = BigInt(c.wei);", "  if (pago.from === pago.to || pago.datos !== '0x') return { status: 409, body: { error: 'pago_invalido' } };\n  if (pago.hora < new Date(c.creada).getTime() - 60000) return { status: 409, body: { error: 'pago_anterior' } };\n  const pedido = BigInt(c.wei);")
a = s.index('  // La reserva del hash:', s.index('async function economiaAcreditar('))
b = s.index("  const gwei = Number(pago.valor", a)
s = s[:a] + """  // The receipt and player balance commit together. A crash cannot lose or duplicate Gold.
  const doc = await ecoTransaccion(async (session) => {
    const reservada = await CompraOro.findOneAndUpdate({ _id: id, estado: { $in: ['cotizada', 'pagada', 'fallida'] },
      $or: [{ txHash: { $exists: false } }, { txHash: null }, { txHash }] },
      { $set: Object.assign({ estado: 'acreditada', txHash, oroDado: oro, pagadoWei: pago.valor.toString(), acreditada: new Date(), motivo: '' }, extra || {}) },
      { new: true, session }).lean();
    if (!reservada) throw Object.assign(new Error('ya_procesada'), { code: 'ya_procesada' });
    const st = await PlayerStats.findOneAndUpdate({ playerName: gp.playerName },
      { $inc: { oro }, $addToSet: { chainPending: 'oro' }, $set: { chainPendingSince: new Date() } }, { new: true, session });
    if (!st) throw Object.assign(new Error('sin_stats'), { code: 'sin_stats' });
    const gwei = Number(pago.valor / 1000000000n);
    if (!Number.isSafeInteger(gwei)) throw new Error('pago_fuera_de_rango');
    await TesoroJuego.updateOne({ _id: TESORO_JUEGO_ID }, { $inc: { 'zkltc.gwei': gwei, 'zkltc.compras': 1, 'zkltc.oro': oro } }, { upsert: true, session });
    return st;
  });
""" + s[b:]
replace("    await TesoroJuego.updateOne({ _id: TESORO_JUEGO_ID }, { $inc: { 'zkltc.gwei': gwei, 'zkltc.compras': 1, 'zkltc.oro': oro } }, { upsert: true });\n", "")
# Service receipts and refunds are handled by the transactional implementation below.
a = s.index("app.post('/api/economia/servicio',")
b = s.index('// POST /api/economia/quema/basura', a)
s = s[:a] + (ROOT / 'tools/economy-service.fragment.cjs').read_text(encoding='utf8') + '\n\n' + s[b:]
# Historical prices must compare currency units too (not just the numerical price).
replace("    if (Math.abs(unidad - Number(precioUnidad)) <= 0.001) return true;", "    if (moneda !== p.moneda && !(op === 'compra' && moneda === 'bronce')) continue;\n    if (Math.abs(unidad - Number(precioUnidad)) <= 0.001) return true;")
# Guarantee a funded reward after ten automatic-mode misses; never mint unbacked coins.
replace("const prob = tesoroProbabilidad(cfg, { vip, nivel, racha, jefe });", "const prob = cfg.modo === 'auto' && racha >= 9 ? 1 : tesoroProbabilidad(cfg, { vip, nivel, racha, jefe });")
replace("if (!(cantidad >= cfg.pagoMin)) return null;", "if (!(cantidad >= cfg.pagoMin)) { _tesoroRacha.set(quien, Math.min(100, racha + 1)); return null; }")
# Never decrement another outstanding loot reservation twice.
replace("{ _id: TESORO_ID }, { $inc: { saldo: n, reservado: -n, caducados:", "{ _id: TESORO_ID, reservado: { $gte: n } }, { $inc: { saldo: n, reservado: -n, caducados:")
# Install helpers before the existing v2 completion marker (keeps extraction tests possible).
replace("  tDevuelto:  { type: Date, default: null }", "  estado: { type: String, enum: ['cobrado', 'completado', 'revision', 'devuelto'], default: 'cobrado', index: true },\n  revisionMotivo: { type: String, default: '' },\n  tDevuelto:  { type: Date, default: null }")
replace("  ref:        { type: String }                        // cuenta una vez", "  ref:        { type: String }                        // cuenta una vez")
replace("const tesoroMovSchema = new mongoose.Schema({", "const tesoroMovSchema = new mongoose.Schema({\n  ref: { type: String },")
replace("const TesoroMov = mongoose.models.TesoroMov", "tesoroMovSchema.index({ ref: 1 }, { unique: true, sparse: true });\nconst TesoroMov = mongoose.models.TesoroMov")
a = s.index("    const { modelo, id } = ECO2_TESOROS[tesoro]();", s.index("app.post('/api/admin/economia/quemar'"))
b = s.index("  } catch (e)", a)
s = s[:a] + """    const ref = String(b.ref || '');
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(ref)) return res.status(400).json({ error: 'ref_invalida' });
    return res.json(await ecoQuemarSeguro(tesoro, moneda, cantidad, motivo, 'admin:' + ref));
""" + s[b:]
# Do not permit an ordinary withdrawal to bypass the same protected reserves.
replace("t = await TesoroJuego.findOneAndUpdate({ _id: TESORO_JUEGO_ID, saldo: { $gte: bronce } },", "const disponible = await TesoroJuego.findById(TESORO_JUEGO_ID).lean();\n      if (bronce > ecoSaldoDisponible(disponible, 'juego')) return res.status(409).json({ error: 'reserva_protegida' });\n      t = await TesoroJuego.findOneAndUpdate({ _id: TESORO_JUEGO_ID, saldo: disponible.saldo, retenidoServicios: disponible.retenidoServicios },")
anchor = "console.log('✅ Economía (2.ª parte)"
pos = s.index(anchor)
s = s[:pos] + (ROOT / 'tools/economy-supervisor.fragment.cjs').read_text(encoding='utf8') + '\n\n' + s[pos:]
SERVER.write_text(s, encoding='utf-8', newline='\r\n')
print('Backend patched without replacing unrelated sections.')
