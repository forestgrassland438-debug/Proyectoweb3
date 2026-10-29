// NPC money is authoritative. A chain action is never repeated after an ambiguous result.
async function ecoTiendaResolver(id, confirmed) {
  return ecoTransaccion(async session => {
    const row = await ServicioCobro.findOneAndUpdate({ _id: id, estado: { $in: ['cobrado', 'revision'] } },
      { $set: { estado: 'completado', confirmadas: confirmed } }, { new: true, session }).lean();
    if (!row) throw ecoError('ya_procesada', 409);
    const venta = row.tipo === 'tienda_venta';
    const gross = row.precioBronce * confirmed;
    const fee = Math.max(0, Math.round(gross * TESORO_COMISION_BPS / 10000));
    const circular = tesoroParteCircular(fee);
    const net = Math.max(0, gross - fee);
    const refund = venta ? 0 : row.bronce - gross - fee;
    const debit = venta ? net + circular : refund + circular;
    const result = await TesoroJuego.updateOne({ _id: TESORO_JUEGO_ID, saldo: { $gte: debit }, retenidoServicios: { $gte: row.bronce } },
      { $inc: { saldo: -debit, retenidoServicios: -row.bronce, 'ingresado.tienda': venta ? -debit : gross + fee - circular } }, { session });
    if (!result.matchedCount) throw ecoError('reserva_insuficiente', 409);
    if (circular) await Tesoro.updateOne({ _id: TESORO_ID }, { $inc: { saldo: circular, 'ingresado.tienda': circular } }, { upsert: true, session });
    const credit = venta ? net : refund;
    const stats = await PlayerStats.findOneAndUpdate({ playerName: row.playerName },
      { $inc: { bronce: credit }, $addToSet: { chainPending: 'bronce' }, $set: { chainPendingSince: new Date() } }, { new: true, session });
    if (!stats) throw ecoError('sin_stats', 409);
    await TesoroMov.create([{ ref: 'tienda-fin:' + id, tesoro: 'juego', tipo: 'ajuste', origen: 'tienda',
      bronce: venta ? -debit : gross + fee - circular, playerName: row.playerName,
      detalle: row.tipo + ' ' + row.itemId + ' x' + confirmed + ' · ' + id }], { session });
    return { ok: true, confirmadas: confirmed, bronce: credit, fee, stats: buildStatsResponse(stats) };
  });
}
app.post('/api/economia/tienda', strictLimiter, authMiddleware, csrfProtection, async (req, res) => {
  try {
    const gp = await jugadorDeLaSesion(req), b = req.body || {};
    if (!gp) return res.status(403).json({ error: 'no_autorizado' });
    const q = Number(b.cantidad), op = b.op;
    if (!['compra', 'venta'].includes(op) || !Number.isSafeInteger(q) || q < 1 || q > 99 || !/^[A-Za-z0-9_-]{8,64}$/.test(b.ref || ''))
      throw ecoError('datos_invalidos', 400);
    await eco2Config();
    const p = eco2PrecioTienda(b.itemId);
    if (!p || !(p[op === 'compra' ? 0 : 1] > 0)) throw ecoError('objeto_no_disponible', 409);
    if (await esFantasma(gp)) throw ecoError('fantasma', 409);
    const level = await gfNivelDeJugador(gp);
    if (level < gfNivelDeObjeto(b.itemId)) throw ecoError('nivel_bajo', 403);
    const native = ECO2_MONEDA_DE[p[2]], unit = p[op === 'compra' ? 0 : 1];
    const price = unit * TESORO_BRONCE_POR[native];
    if (Number(b.precioBronce) !== price) throw ecoError('precios_actualizados', 409);
    const gross = price * q, fee = Math.max(0, Math.round(gross * TESORO_COMISION_BPS / 10000));
    const reserve = op === 'compra' ? gross + fee : gross - fee + tesoroParteCircular(fee);
    if (!Number.isSafeInteger(reserve) || reserve < 1) throw ecoError('precio_invalido', 409);
    const id = gp.playerName + ':shop-' + b.ref;
    return await enColaDelJugador('inventory:' + String(gp.address).toLowerCase(), async () => {
      const previous = await ServicioCobro.findById(id).lean();
      if (previous) {
        if (previous.itemId !== b.itemId || previous.cantidad !== q || previous.tipo !== 'tienda_' + op) throw ecoError('referencia_no_reutilizable', 409);
        const st = await PlayerStats.findOne({ playerName: gp.playerName }).lean();
        return res.status(previous.estado === 'completado' ? 200 : 202).json({ ok: previous.estado === 'completado', revision: previous.estado !== 'completado',
          confirmadas: previous.confirmadas || 0, stats: st && buildStatsResponse(st), ref: id });
      }
      await ecoTransaccion(async session => {
        const st = await PlayerStats.findOne({ playerName: gp.playerName }).session(session).lean();
        if (!st) throw ecoError('sin_stats', 409);
        if (op === 'compra') {
          const plan = eco2PlanPago(reserve, st);
          if (!plan) throw ecoError('saldo_insuficiente', 409);
          const paid = await PlayerStats.updateOne({ _id: st._id, oro: st.oro, plata: st.plata, bronce: st.bronce },
            { $set: { ...plan, chainPendingSince: new Date() }, $addToSet: { chainPending: { $each: ['oro', 'plata', 'bronce'] } } }, { session });
          if (!paid.matchedCount) throw ecoError('saldo_ocupado', 409);
          await TesoroJuego.updateOne({ _id: TESORO_JUEGO_ID }, { $inc: { saldo: reserve, retenidoServicios: reserve } }, { upsert: true, session });
        } else {
          const game = await TesoroJuego.findById(TESORO_JUEGO_ID).session(session).lean();
          if (reserve > ecoSaldoDisponible(game, 'juego')) throw ecoError('tienda_sin_liquidez', 409);
          await TesoroJuego.updateOne({ _id: TESORO_JUEGO_ID }, { $inc: { retenidoServicios: reserve } }, { session });
        }
        await ServicioCobro.create([{ _id: id, playerName: gp.playerName, tipo: 'tienda_' + op, itemId: b.itemId, cantidad: q,
          bronce: reserve, precioBronce: price, estado: 'cobrado' }], { session });
      });
      // The durable row now prevents replay even if the process crashes during the chain operation.
      let confirmed = 0;
      try {
        const tipo = itemTipoOnChain(b.itemId);
        if (!tipo) throw new Error('tipo_no_configurado');
        if (op === 'venta') confirmed = await burnItemOnChain(gp.address, tipo, q);
        else {
          const stack = Math.max(1, Number(ITEM_MAX_STACK[b.itemId]) || 1);
          while (confirmed < q) {
            const batch = Math.min(stack, q - confirmed);
            const minted = await mintGatherReward(gp.address, tipo, batch);
            if (!minted || !minted.id) break;
            confirmed += batch;
            await ServicioCobro.updateOne({ _id: id }, { $set: { confirmadas: confirmed } });
          }
        }
        if (confirmed !== q) throw new Error('confirmacion_incompleta');
        const result = await ecoTiendaResolver(id, confirmed);
        return res.json(result);
      } catch (e) {
        await ServicioCobro.updateOne({ _id: id }, { $set: { estado: 'revision', confirmadas: confirmed, revisionMotivo: String(e.message || '').slice(0, 200) } });
        return res.status(202).json({ ok: false, revision: true, ref: id,
          message: 'The operation is recorded for chain review. Do not repeat it with a new reference.' });
      }
    });
  } catch (e) { return ecoResponderError(res, e); }
});
app.post('/api/admin/economia/tienda/revisar', adminAuth, strictLimiter, async (req, res) => {
  try {
    const b = req.body || {}, confirmed = Number(b.confirmadas), motivo = String(b.motivo || '').trim().slice(0, 200);
    const row = typeof b.id === 'string' ? await ServicioCobro.findById(b.id).lean() : null;
    if (!row || !['tienda_compra', 'tienda_venta'].includes(row.tipo) || !Number.isSafeInteger(confirmed) || confirmed < 0 || confirmed > row.cantidad || motivo.length < 5)
      throw ecoError('datos_invalidos', 400);
    const result = await ecoTiendaResolver(b.id, confirmed);
    await ServicioCobro.updateOne({ _id: b.id }, { $set: { revisionMotivo: motivo } });
    res.json(result);
  } catch (e) { ecoResponderError(res, e); }
});
