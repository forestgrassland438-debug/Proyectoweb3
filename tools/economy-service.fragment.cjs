// Transactional service receipts. Client failure reports request review; they never mint a refund.
app.post('/api/economia/servicio', apiLimiter, authMiddleware, csrfProtection, async (req, res) => {
  try {
    const gp = await jugadorDeLaSesion(req), b = req.body || {};
    if (!gp) return res.status(403).json({ error: 'no_autorizado' });
    const { tipo, itemId, ref } = b, cantidad = Number(b.cantidad);
    if (!['fundir', 'craftear'].includes(tipo) || !eco2Catalogo().includes(itemId) ||
        !Number.isSafeInteger(cantidad) || cantidad < 1 || cantidad > 999) return res.status(400).json({ error: 'datos_invalidos' });
    if (typeof ref !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(ref)) return res.status(400).json({ error: 'ref_invalida' });
    await eco2Config();
    const result = await ecoTransaccion(async session => {
      const id = gp.playerName + ':' + ref;
      const ya = await ServicioCobro.findById(id).session(session).lean();
      if (ya) {
        if (ya.tipo !== tipo || ya.itemId !== itemId || ya.cantidad !== cantidad || ya.devuelto || ya.estado === 'revision')
          throw ecoError('referencia_no_reutilizable', 409);
        const stats = await PlayerStats.findOne({ playerName: gp.playerName }).session(session).lean();
        return { ok: true, repetido: true, bronce: ya.bronce, stats: stats && buildStatsResponse(stats) };
      }
      const bronce = eco2PrecioServicio(tipo, itemId, cantidad);
      if (!Number.isSafeInteger(bronce) || bronce < 1) throw ecoError('precio_invalido', 503);
      const st = await PlayerStats.findOne({ playerName: gp.playerName }).session(session).lean();
      if (!st) throw ecoError('sin_stats', 409);
      const plan = eco2PlanPago(bronce, st);
      if (!plan) throw Object.assign(ecoError('saldo_insuficiente', 409), { bronce });
      const doc = await PlayerStats.findOneAndUpdate({ _id: st._id, oro: st.oro, plata: st.plata, bronce: st.bronce },
        { $set: { ...plan, chainPendingSince: new Date() }, $addToSet: { chainPending: { $each: ['oro', 'plata', 'bronce'] } } }, { new: true, session });
      if (!doc) throw ecoError('saldo_ocupado', 409);
      await ServicioCobro.create([{ _id: id, playerName: gp.playerName, tipo, itemId, cantidad, bronce, estado: 'cobrado' }], { session });
      await TesoroJuego.updateOne({ _id: TESORO_JUEGO_ID },
        { $inc: { saldo: bronce, retenidoServicios: bronce, 'ingresado.servicios': bronce, 'ingresos.servicios': 1 } }, { upsert: true, session });
      await TesoroMov.create([{ tesoro: 'juego', tipo: 'ingreso', origen: 'servicios', bronce,
        playerName: gp.playerName, detalle: tipo + ' ' + itemId + ' x' + cantidad + ' · ' + ref }], { session });
      return { ok: true, bronce, stats: buildStatsResponse(doc) };
    });
    if (!result.repetido) economiaApuntar({ serviciosBronce: result.bronce, servicios: 1 });
    return res.json(result);
  } catch (e) { return ecoResponderError(res, e); }
});

app.post('/api/economia/servicio/confirmar', apiLimiter, authMiddleware, csrfProtection, async (req, res) => {
  try {
    const gp = await jugadorDeLaSesion(req);
    if (!gp) return res.status(403).json({ error: 'no_autorizado' });
    const ref = String(req.body && req.body.ref || '');
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(ref)) return res.status(400).json({ error: 'ref_invalida' });
    await ecoTransaccion(async session => {
      const c = await ServicioCobro.findOneAndUpdate({ _id: gp.playerName + ':' + ref, estado: 'cobrado', devuelto: false },
        { $set: { estado: 'completado' } }, { new: true, session }).lean();
      if (c) await TesoroJuego.updateOne({ _id: TESORO_JUEGO_ID, retenidoServicios: { $gte: c.bronce } }, { $inc: { retenidoServicios: -c.bronce } }, { session });
    });
    return res.json({ ok: true });
  } catch (e) { return ecoResponderError(res, e); }
});

app.post('/api/economia/servicio/devolver', apiLimiter, authMiddleware, csrfProtection, async (req, res) => {
  try {
    const gp = await jugadorDeLaSesion(req);
    if (!gp) return res.status(403).json({ error: 'no_autorizado' });
    const ref = String(req.body && req.body.ref || '');
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(ref)) return res.status(400).json({ error: 'ref_invalida' });
    const c = await ServicioCobro.findOneAndUpdate({ _id: gp.playerName + ':' + ref, estado: { $in: ['cobrado', 'revision'] }, devuelto: false },
      { $set: { estado: 'revision' } }, { new: true }).lean();
    // A client cannot prove that an on-chain result was not delivered.
    return res.status(c ? 202 : 409).json({ ok: false, revision: !!c, motivo: c ? 'revision_pendiente' : 'nada_que_devolver' });
  } catch (e) { return ecoResponderError(res, e); }
});

app.get('/api/admin/economia/servicios/revisar', adminAuth, apiLimiter, async (req, res) => {
  try {
    const filas = await ServicioCobro.find({ estado: { $in: ['revision', 'cobrado'] } }).sort({ t: 1 }).limit(100).lean();
    res.json({ ok: true, filas });
  } catch (e) { ecoResponderError(res, e); }
});

app.post('/api/admin/economia/servicios/revisar', adminAuth, strictLimiter, async (req, res) => {
  try {
    const b = req.body || {}, motivo = String(b.motivo || '').trim().slice(0, 200);
    if (typeof b.id !== 'string' || b.id.length > 160 || !['devolver', 'completado'].includes(b.accion) || motivo.length < 5)
      return res.status(400).json({ error: 'datos_invalidos' });
    const c = await ecoTransaccion(async session => {
      const row = await ServicioCobro.findOneAndUpdate({ _id: b.id, estado: { $in: ['cobrado', 'revision'] }, devuelto: false },
        { $set: { estado: b.accion === 'devolver' ? 'devuelto' : 'completado', devuelto: b.accion === 'devolver',
          tDevuelto: b.accion === 'devolver' ? new Date() : null, revisionMotivo: motivo } }, { new: true, session }).lean();
      if (!row) throw ecoError('ya_procesada', 409);
      const inc = { retenidoServicios: -row.bronce };
      if (b.accion === 'devolver') { inc.saldo = -row.bronce; inc['ingresado.servicios'] = -row.bronce; }
      const t = await TesoroJuego.updateOne({ _id: TESORO_JUEGO_ID, saldo: { $gte: row.bronce }, retenidoServicios: { $gte: row.bronce } }, { $inc: inc }, { session });
      if (!t.matchedCount) throw ecoError('reserva_insuficiente', 409);
      if (b.accion === 'devolver') {
        const st = await PlayerStats.updateOne({ playerName: row.playerName }, { $inc: { bronce: row.bronce },
          $addToSet: { chainPending: 'bronce' }, $set: { chainPendingSince: new Date() } }, { session });
        if (!st.matchedCount) throw ecoError('sin_stats', 409);
      }
      await TesoroMov.create([{ tesoro: 'juego', tipo: 'ajuste', origen: 'servicios', bronce: b.accion === 'devolver' ? -row.bronce : 0,
        playerName: row.playerName, detalle: b.accion + ' · ' + row._id + ' · ' + motivo }], { session });
      return row;
    });
    if (b.accion === 'devolver') economiaApuntar({ serviciosBronce: -c.bronce });
    return res.json({ ok: true });
  } catch (e) { ecoResponderError(res, e); }
});
