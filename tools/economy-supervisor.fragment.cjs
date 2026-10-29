// ECONOMY SAFETY POLICY v3. Deterministic decisions, bounded jobs, two active treasuries.
function ecoError(code, status = 503) { return Object.assign(new Error(code), { code, status }); }
function ecoResponderError(res, e) {
  console.warn('economia:', e.code || e.message);
  return res.status(e.status || 503).json({ error: e.status ? e.code : 'economia_no_disponible', bronce: e.bronce,
    message: e.status ? e.code : 'The operation could not be committed safely. Try again later.' });
}
async function ecoTransaccion(fn) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => { result = await fn(session); },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
    return result;
  } finally { await session.endSession(); }
}
let _eco2Migracion = null;
function eco2MigrarReserva() {
  if (!_eco2Migracion) _eco2Migracion = ecoTransaccion(async session => {
    const game = await TesoroJuego.findById(TESORO_JUEGO_ID).session(session).lean();
    if (game && game.migracionReservaV1) return;
    const old = await TesoroReserva.findById(TESORO_RESERVA_ID).session(session).lean();
    const saldo = Math.max(0, Number(old && old.saldo) || 0);
    if (!Number.isSafeInteger(saldo)) throw ecoError('saldo_legacy_invalido');
    await TesoroJuego.updateOne({ _id: TESORO_JUEGO_ID }, { $inc: { saldo,
      quemado: Math.max(0, Number(old && old.quemado) || 0), retirado: Math.max(0, Number(old && old.retirado) || 0),
      'ingresado.muerte': Math.max(0, Number(old && old.ingresado && old.ingresado.muerte) || 0) },
      $set: { migracionReservaV1: true, ...(!(game && game.economia2) && old && old.config ? { economia2: old.config } : {}) } }, { upsert: true, session });
    if (old) await TesoroReserva.updateOne({ _id: TESORO_RESERVA_ID }, { $set: { saldo: 0, archivado: true, migradoA: 'juego' } }, { session, strict: false });
    await TesoroMov.create([{ tesoro: 'juego', tipo: 'ajuste', origen: 'migracion_reserva_v1', bronce: saldo,
      detalle: 'Legacy reserve merged exactly once. Original collection retained for audit.' }], { session });
  }).catch(e => { _eco2Migracion = null; throw e; });
  return _eco2Migracion;
}
const ECO_SUPERVISOR_BASE = Object.freeze({ activo: true, quemaAutomatica: true, pisoJuego: 5000000,
  pisoCircular: 100000, objetivoCircular: 1000000, quemaMaxBps: 10, umbralInflacion: 0.20 });
let _ecoSupervisor = { ejecutando: false, ultima: null, error: null, acciones: [] };
function ecoSaldoDisponible(t, tesoro) {
  const piso = tesoro === 'juego' ? ECO_SUPERVISOR_BASE.pisoJuego : ECO_SUPERVISOR_BASE.pisoCircular;
  return Math.max(0, Math.floor(Number(t && t.saldo) || 0) - piso - (tesoro === 'juego' ? Math.max(0, Number(t && t.retenidoServicios) || 0) : 0));
}
async function ecoQuemarSeguro(tesoro, moneda, cantidad, motivo, ref) {
  if (!Object.prototype.hasOwnProperty.call(ECO2_TESOROS, tesoro) || !['oro', 'plata', 'bronce'].includes(moneda)) throw ecoError('datos_invalidos', 400);
  const bronce = cantidad * TESORO_BRONCE_POR[moneda];
  if (!Number.isSafeInteger(cantidad) || cantidad < 1 || !Number.isSafeInteger(bronce)) throw ecoError('cantidad_invalida', 400);
  const result = await ecoTransaccion(async session => {
    const ya = await EconomiaQuema.findOne({ ref }).session(session).lean();
    if (ya) return { ok: true, repetida: true, bronce: ya.bronce };
    const { modelo, id } = ECO2_TESOROS[tesoro]();
    const antes = await modelo.findById(id).session(session).lean();
    if (bronce > ecoSaldoDisponible(antes, tesoro)) throw ecoError('reserva_protegida', 409);
    const t = await modelo.findOneAndUpdate({ _id: id, saldo: antes.saldo }, { $inc: { saldo: -bronce, quemado: bronce } }, { new: true, session }).lean();
    if (!t) throw ecoError('saldo_ocupado', 409);
    await EconomiaQuema.create([{ ref, tipo: 'monedas', origen: ref.startsWith('auto:') ? 'supervisor' : 'admin', tesoro, moneda, cantidad, bronce, detalle: motivo }], { session });
    await TesoroMov.create([{ tesoro, tipo: 'ajuste', origen: 'quema', bronce: -bronce, detalle: motivo }], { session });
    return { ok: true, tesoro, bronce, saldo: t.saldo };
  });
  if (!result.repetida) economiaApuntar({ quemadoMonedas: bronce });
  _economiaEstado = null;
  return result;
}
async function ecoTransferirCircular(cantidad, motivo, ref) {
  return ecoTransaccion(async session => {
    const ya = await TesoroMov.findOne({ ref }).session(session).lean();
    if (ya) return { ok: true, repetida: true, bronce: ya.bronce };
    const game = await TesoroJuego.findById(TESORO_JUEGO_ID).session(session).lean();
    if (!Number.isSafeInteger(cantidad) || cantidad < 1 || cantidad > ecoSaldoDisponible(game, 'juego')) throw ecoError('reserva_protegida', 409);
    const r = await TesoroJuego.updateOne({ _id: TESORO_JUEGO_ID, saldo: game.saldo }, { $inc: { saldo: -cantidad } }, { session });
    if (!r.matchedCount) throw ecoError('saldo_ocupado', 409);
    await Tesoro.updateOne({ _id: TESORO_ID }, { $inc: { saldo: cantidad } }, { upsert: true, session });
    await TesoroMov.create([{ ref, tesoro: 'juego', tipo: 'ajuste', origen: 'transferencia_circular', bronce: cantidad, detalle: motivo }], { session });
    return { ok: true, bronce: cantidad };
  });
}
async function ecoSupervisorEjecutar() {
  if (_ecoSupervisor.ejecutando || mongoose.connection.readyState !== 1) return;
  _ecoSupervisor.ejecutando = true;
  const acciones = [];
  try {
    await eco2MigrarReserva();
    // Recover confirmed payments even if the player closed the top-up panel.
    const pendientes = await CompraOro.find({ estado: 'pagada', txHash: { $exists: true } }).sort({ creada: 1 }).limit(20).lean();
    for (const c of pendientes) {
      try {
        const pago = await economiaLeerPago(c.txHash);
        if (pago.ok) await enColaDelJugador(c.address, () => economiaAcreditar({ playerName: c.playerName, address: c.address }, c, c.txHash, pago));
      } catch (e) { console.warn('supervisor: recarga pendiente:', c._id, e.code || e.message); }
    }
    const [game, circular] = await Promise.all([TesoroJuego.findById(TESORO_JUEGO_ID).lean(), Tesoro.findById(TESORO_ID).lean()]);
    const reponer = Math.min(ecoSaldoDisponible(game, 'juego'), Math.max(0, ECO_SUPERVISOR_BASE.objetivoCircular - (Number(circular && circular.saldo) || 0)));
    if (reponer > 0) { await ecoTransferirCircular(reponer, 'Supervisor: funded rewards, game reserve protected', 'reponer:' + _diaUTC()); acciones.push('Repuestos ' + reponer + ' BR al circular'); }
    const serie = await EconomiaDia.find({ _id: { $gte: _diaMenos(_diaUTC(), 7) } }).sort({ _id: 1 }).lean();
    const hoy = serie[serie.length - 1];
    const completa = serie.length >= 8 && serie[0]._id <= _diaMenos(_diaUTC(), 7);
    // Conservative, once per day; never burn reserved drops or protected working capital.
    if (completa && hoy && hoy.inflacionNeta7 > ECO_SUPERVISOR_BASE.umbralInflacion) {
      const actual = await Tesoro.findById(TESORO_ID).lean();
      const excedente = Math.max(0, (Number(actual && actual.saldo) || 0) - ECO_SUPERVISOR_BASE.objetivoCircular);
      const cantidad = Math.min(excedente, Math.floor((Number(actual && actual.saldo) || 0) * ECO_SUPERVISOR_BASE.quemaMaxBps / 10000));
      if (cantidad > 0) { const r = await ecoQuemarSeguro('circular', 'bronce', cantidad, 'Supervisor: active supply growth >20%, capped at 0.1% per UTC day', 'auto:' + _diaUTC()); if (!r.repetida) acciones.push('Quemados ' + cantidad + ' BR de excedente circular'); }
    }
    _ecoSupervisor.ultima = new Date(); _ecoSupervisor.error = null; _ecoSupervisor.acciones = acciones;
  } catch (e) { _ecoSupervisor.error = String(e.code || e.message).slice(0, 160); }
  finally { _ecoSupervisor.ejecutando = false; }
}
app.get('/api/admin/economia/supervisor', adminAuth, apiLimiter, async (req, res) => {
  try {
    const [juego, circular] = await Promise.all([TesoroJuego.findById(TESORO_JUEGO_ID).lean(), Tesoro.findById(TESORO_ID).lean()]);
    res.json({ ok: true, politica: ECO_SUPERVISOR_BASE, estado: _ecoSupervisor,
      disponibleJuego: ecoSaldoDisponible(juego, 'juego'), disponibleCircular: ecoSaldoDisponible(circular, 'circular'),
      reservadoServicios: Number(juego && juego.retenidoServicios) || 0,
      saldoCircular: Number(circular && circular.saldo) || 0, reservadoBotin: Number(circular && circular.reservado) || 0 });
  } catch (e) { ecoResponderError(res, e); }
});
app.post('/api/admin/economia/transferir', adminAuth, strictLimiter, async (req, res) => {
  try {
    const b = req.body || {}, motivo = String(b.motivo || '').trim().slice(0, 200);
    if (motivo.length < 5 || !/^[A-Za-z0-9_-]{8,64}$/.test(b.ref || '')) throw ecoError('datos_invalidos', 400);
    res.json(await ecoTransferirCircular(Number(b.bronce), motivo, 'admin:' + b.ref));
  } catch (e) { ecoResponderError(res, e); }
});
setTimeout(() => { ecoSupervisorEjecutar().catch(() => {}); }, 30000).unref();
setInterval(() => { ecoSupervisorEjecutar().catch(() => {}); }, 60000).unref();
