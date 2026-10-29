from pathlib import Path
P=Path('C:/Users/pc/Desktop/server2.js')
s=P.read_text(encoding='utf8')
def rep(a,b,n=1):
    global s
    if s.count(a)!=n: raise RuntimeError(str(s.count(a))+': '+a[:100])
    s=s.replace(a,b)
# Price changes use yesterday as their anchor, including both index and demand.
rep('  const anterior = eco2PreciosActuales();\n  const items', '''  const anterior = eco2PreciosActuales();
  const anclas = soloItem ? [] : await PrecioHist.aggregate([
    { $match: { dia: { $lt: _diaUTC() } } }, { $sort: { t: 1 } },
    { $group: { _id: '$itemId', compra: { $last: '$compra' }, venta: { $last: '$venta' }, moneda: { $last: '$moneda' } } }
  ]);
  const ancla = new Map(anclas.map(x => [x._id, x]));
  const items''')
rep('    const p = eco2PrecioDinamico(base, cfg.indiceActivo ? indice : 1, dem);', '''    const p = eco2PrecioDinamico(base, cfg.indiceActivo ? indice : 1, dem);
    const ayer = ancla.get(id);
    if (!soloItem && base.sigueIndice !== false && ayer && ayer.moneda === base.moneda) {
      for (const k of ['compra', 'venta']) if (ayer[k] > 0 && p[k] > 0) {
        p[k] = Math.max(Math.ceil(ayer[k] * (1 - cfg.pasoMax)), Math.min(Math.floor(ayer[k] * (1 + cfg.pasoMax)), p[k]));
      }
      if (p.compra > 0 && p.venta >= p.compra) p.venta = Math.max(0, p.compra - 1);
    }''')
# Use an actual transaction and a durable receipt for each bronze pickup.
a=s.index("  const doc = await gfDevolverStat(gp.playerName, 'bronce', b.cantidad);", s.index('async function tesoroPagar('))
z=s.index('\n}\n',a)
s=s[:a]+'''  const ref = b.id ? 'botin:' + b.id : null;
  return ecoTransaccion(async session => {
    if (ref && await TesoroMov.findOne({ ref }).session(session).lean())
      return PlayerStats.findOne({ playerName: gp.playerName }).session(session);
    const grupo = b.incentivo && b.incentivo.vip ? 'vip' : 'free';
    const t = await Tesoro.updateOne({ _id: TESORO_ID, reservado: { $gte: b.cantidad } },
      { $inc: { reservado: -b.cantidad, ['pagado.' + grupo]: b.cantidad, ['pagos.' + grupo]: 1 } }, { session });
    if (!t.matchedCount) throw ecoError('botin_sin_reserva', 409);
    const doc = await PlayerStats.findOneAndUpdate({ playerName: gp.playerName }, { $inc: { bronce: b.cantidad },
      $addToSet: { chainPending: 'bronce' }, $set: { chainPendingSince: new Date() } }, { new: true, session });
    if (!doc) throw ecoError('sin_stats', 409);
    await TesoroMov.create([{ ...(ref ? { ref } : {}), tipo: 'pago', origen: 'monstruo', bronce: b.cantidad,
      playerName: gp.playerName, vip: grupo === 'vip', nivel: b.incentivo ? b.incentivo.nivel : null }], { session });
    return doc;
  });'''+s[z:]
# The map key is also the durable idempotency key of the payment.
s=s.replace("_botinPendiente.set(id, { playerName:", "_botinPendiente.set(id, { id, playerName:")
# Legacy third-reserve schemas stay archived. New snapshots refer to the two active treasuries.
s=s.replace('LOS TRES TESOROS, LO RESERVADO', 'LOS DOS TESOROS, LO RESERVADO')
# Cross-process safe and bounded treasury reward reservations.
rep("_tesoroRacha.set(quien, racha + 1); return null;", "_tesoroRacha.set(quien, Math.min(100, racha + 1)); return null;")
# Item values used in fees must not be raised by self-trades on P2P.
rep("  if (x && x.n >= 3 && x.mediana > 0) v = Math.max(v, Math.min(Math.round(x.mediana), v * 3));", "  // P2P is informational; self-trades cannot increase service fees or burn estimates.")
# Prevent unbounded caches, without discarding today's counters.
anchor="function tesoroNormalizarConfig(c) {"
pos=s.index(anchor)
s=s[:pos]+'''setInterval(() => {
  const hoy = _diaUTC();
  for (const [k, v] of _tesoroDia) if (v.dia !== hoy) { _tesoroDia.delete(k); _tesoroRacha.delete(k); }
  for (const [k, v] of _tesoroTiendaDia) if (v.dia !== hoy) _tesoroTiendaDia.delete(k);
  if (_tesoroRacha.size > 20000) for (const k of _tesoroRacha.keys()) { if (!_tesoroDia.has(k)) _tesoroRacha.delete(k); if (_tesoroRacha.size <= 10000) break; }
}, 600000).unref();
''' +s[pos:]
P.write_text(s,encoding='utf8',newline='\r\n')
print('Price, pickup and cache protections applied.')
