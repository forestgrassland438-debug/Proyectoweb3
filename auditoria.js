/* =============================================================================
 * AUDITORÍA DE LA TIENDA, DEL P2P Y DEL SUELO — herramienta del centro de control
 * (auditoria.html)                                                  (2026-10-27)
 * -----------------------------------------------------------------------------
 * "Quiero un panel nuevo para saber quién compró, cuánto gastó y si pagó o no;
 * ver si el gasto al comprar y al vender es el correcto; que cualquier error de
 * compra o venta salga en el historial para solucionarlo después (tienda del
 * juego y P2P). Y un apartado para saber quién recogió un dropeo y de quién, y
 * si se lo pasó a otro, como un explorer pero más cómodo, con un input para
 * buscar una wallet o un nombre; ahí mismo suspender por días o bloquear que un
 * usuario suelte objetos. Y los intentos desesperados, con wallets y nombres."
 *
 * Lo que cuenta server2.js en "AUDITORÍA":
 *   GET  /api/admin/auditoria/resumen             las cifras de arriba
 *   GET  /api/admin/auditoria/tienda              operaciones (juego | p2p) con sus comprobaciones
 *   POST /api/admin/auditoria/tienda/:id/revisada marcar una como revisada (con nota)
 *   GET  /api/admin/auditoria/subidas             saldos que subieron sin compra ni venta
 *   GET  /api/admin/auditoria/alertas             los intentos (agrupados, con "veces")
 *   POST /api/admin/auditoria/alertas/:id/revisada
 *   GET  /api/admin/suelo/movs | buscar | rastro/:id   el explorador del suelo
 *   POST /api/admin/suelo/castigo | castigo/quitar     suspender, bloquear, levantar
 *
 * Todo con textContent (nada de innerHTML con datos de jugadores).
 * ========================================================================== */
(function (root) {
  'use strict';
  const ui = root.GFAdminUI, session = root.GFAdminSession;
  const $ = id => document.getElementById(id);
  const t = s => (ui ? ui.t(s) : String(s));
  if (!ui || !session) {
    const m = $('au-gate-msg');
    if (m) { m.textContent = 'The administration suite did not load. Reload the page.'; m.dataset.error = 'true'; }
    return;
  }

  const AVISOS = {
    precio_distinto: ['Price differs from the table', 'grave'], total_distinto: ['Total differs', 'grave'],
    moneda_distinta: ['Wrong currency', 'grave'], comision_distinta: ['Fee differs', 'aviso'],
    nivel_bajo: ['Below the item level', 'grave'], compra_de_solo_venta: ['Bought a sell-only item', 'grave'],
    objeto_desconocido: ['Unknown item', 'aviso'], reembolso_distinto: ['Refund differs', 'grave'],
    sin_guardar: ['Confirmed, not saved', 'aviso'], pago_distinto: ['Payout differs', 'grave'],
    cobro_no_visto: ['Charge not seen by the server', 'grave'], cobro_distinto: ['Charge differs from the server', 'grave'],
    sin_terminar: ['Never finished', 'aviso']
  };
  const ESTADOS = { en_curso: 'In progress', ok: 'OK', parcial: 'Partial', reembolsada: 'Refunded', error: 'Error',
                    rechazada: 'Rejected', no_vendida: 'Not sold', ya_gastada: 'Already spent' };
  const ALERTAS = {
    recoger_nivel: 'Pick-up below the item level', soltar_suspendido: 'Drop while suspended or blocked',
    compra_nivel: 'Shop purchase below the item level', p2p_nivel: 'P2P purchase below the item level',
    tienda_precio: 'Shop price mismatch', tienda_cobro: 'Shop charge not matching', tienda_error: 'Shop error',
    p2p_error: 'P2P server error', recarga_hash_ajeno: 'Top-up claim with another player’s transaction',
    recarga_cartera_ajena: 'Top-up claim paid from another wallet'
  };
  const MONEDA = { oro: 'Gold', plata: 'Silver', bronce: 'Bronze', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };
  const SUELO_ESTADO = { en_suelo: 'On the ground', recogido: 'Picked up', caducado: 'Vanished' };

  let verificado = false, cerrado = false, ocupado = false, reloj = 0, peticion = null;
  const st = { tab: 'tienda', tienda: 'juego', solo: 'todas', q: '', dias: 7, aSolo: 'pendientes', filasTienda: [], sQ: '' };
  root.GFTreasuryLifecycle = Object.freeze({ status: () => (ocupado ? 'busy' : '') });

  const loc = () => (ui.language === 'es' ? 'es-EC' : 'en-US');
  const fmt = (n, d = 2) => new Intl.NumberFormat(loc(), { maximumFractionDigits: d }).format(Number(n) || 0);
  const fecha = f => { const d = new Date(f); return isNaN(d) ? '—' : new Intl.DateTimeFormat(loc(), { dateStyle: 'short', timeStyle: 'medium' }).format(d); };
  const corto = a => { a = String(a || ''); return a.length > 14 ? a.slice(0, 6) + '…' + a.slice(-4) : a; };
  const moneda = m => t(MONEDA[m] || m || '');

  function el(tag, clase, texto) { const e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = String(texto); return e; }
  function celda(principal, ...lineas) {
    const d = el('div', 'au-celda');
    d.append(principal instanceof Node ? principal : el('span', '', principal));
    lineas.filter(x => x !== null && x !== undefined && x !== '').forEach(x => d.append(x instanceof Node ? x : el('small', '', x)));
    return d;
  }
  function tabla(cols, filas, vacio, alClic) {
    if (!filas.length) return el('div', 'tz-empty', t(vacio));
    const tb = el('table', 'tz-table'), cab = el('thead'), tr = el('tr');
    cols.forEach(c => { const h = el('th', c.num ? 'num' : '', t(c.t)); h.scope = 'col'; tr.append(h); });
    cab.append(tr); tb.append(cab);
    const cuerpo = el('tbody');
    filas.forEach((f, i) => {
      const r = el('tr', f.clase || '');
      (f.celdas || f).forEach((v, j) => { const d = el('td', cols[j] && cols[j].num ? 'num' : ''); if (v instanceof Node) d.append(v); else d.textContent = v == null || v === '' ? '—' : String(v); r.append(d); });
      if (alClic && f.datos) {
        r.classList.add('au-fila-clic'); r.tabIndex = 0;
        r.addEventListener('click', ev => { if (ev.target.closest('button,a')) return; alClic(f.datos); });
        r.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && !ev.target.closest('button,a')) { ev.preventDefault(); alClic(f.datos); } });
      }
      cuerpo.append(r);
    });
    tb.append(cuerpo);
    return tb;
  }
  function chip(texto, g) { const c = el('span', 'au-chip', texto); if (g) c.dataset.g = g; return c; }
  function jugador(o) {
    if (!o) return el('span', '', '—');
    const nombre = o.username || o.playerName || corto(o.address) || '—';
    const det = [o.address ? corto(o.address) : '', o.nivel ? 'Lv. ' + o.nivel : ''].filter(Boolean).join(' · ');
    const c = celda(el('b', '', nombre), det);
    if (o.address) c.title = o.address + (o.playerName ? ' · ' + o.playerName : '');
    return c;
  }
  function boton(texto, accion, clase) {
    const b = el('button', clase || 'au-mini', t(texto)); b.type = 'button';
    b.addEventListener('click', async ev => { ev.stopPropagation(); if (b.disabled) return; b.disabled = true; try { await accion(b); } finally { if (b.isConnected) b.disabled = false; } });
    return b;
  }
  function aviso(texto) { const n = $('au-notice'); n.hidden = !texto; n.textContent = texto ? t(texto) : ''; }
  async function pedir(ruta, opciones) {
    try { return await session.request(ruta, opciones); }
    catch (e) {
      if (e && e.status === 404 && !(e.code && e.code !== 'not_found')) { aviso('This backend does not have the audit routes yet. Update server2.js.'); }
      throw e;
    }
  }

  // ── La puerta ─────────────────────────────────────────────────────────────
  function mensajePuerta(texto, error) { const m = $('au-gate-msg'); m.textContent = t(texto); m.dataset.error = String(!!error); }
  function errorDeAcceso(e) {
    if (e && e.code === 4001) return 'Signature rejected.';
    if (e && (e.code === 'not_admin' || e.status === 403)) return 'Your wallet is not an administrator.';
    if (e && e.status === 401) return 'Your session expired. Connect again.';
    if (e instanceof TypeError) return 'Connection unavailable. Check that your backend is running.';
    return (e && e.message) || 'Session could not be verified.';
  }
  function aPuerta(motivo, error) {
    verificado = false; clearInterval(reloj); reloj = 0;
    $('au-app').hidden = true; $('au-gate').hidden = false; $('au-connect').disabled = false;
    if (motivo) mensajePuerta(motivo, error);
  }
  async function verificar(interactivo) {
    if (cerrado) return;
    $('au-connect').disabled = true;
    try {
      const yo = interactivo ? await session.signIn(m => mensajePuerta(m)) : await session.request('/api/admin/whoami');
      if (!/^0x[0-9a-f]{40}$/i.test((yo && yo.address) || '')) throw new Error('This account has no administrator permission.');
      if (cerrado) return;
      verificado = true;
      $('au-gate').hidden = true; $('au-app').hidden = false;
      if (!reloj) reloj = setInterval(() => { if (document.visibilityState !== 'hidden' && !ocupado) cargarTodo(false); }, 60000);
      await cargarTodo(true);
    } catch (e) {
      if (cerrado) return;
      if (!interactivo && e && e.status === 401) aPuerta('Connect your administrator wallet to continue.', false);
      else aPuerta(errorDeAcceso(e), true);
    } finally { if (!cerrado) $('au-connect').disabled = false; }
  }

  // ── Las cifras de arriba ──────────────────────────────────────────────────
  async function cargarResumen() {
    const r = await pedir('/api/admin/auditoria/resumen');
    const k = (v, txt, alerta) => { const d = el('div', 'au-kpi'); d.append(el('b', '', fmt(v, 0)), el('span', '', t(txt))); d.dataset.alerta = String(!!(alerta && v > 0)); return d; };
    $('au-kpis').replaceChildren(
      k(r.tienda.ops24h, 'Shop operations, 24 h'), k(r.tienda.problemas, 'Open problems', true), k(r.tienda.sinTerminar, 'Never finished', true),
      k(r.tienda.p2pFallos24h, 'P2P errors, 24 h', true), k(r.suelo.soltados24h, 'Drops, 24 h'), k(r.suelo.recogidos24h, 'Picked up, 24 h'),
      k(r.suelo.castigados, 'Banned from dropping'), k(r.alertas.sinRevisar, 'Alerts not reviewed', true));
    const sel = $('au-a-tipo'), actual = sel.value;
    const opciones = [['', t('All alert types')]].concat(Object.keys(ALERTAS).map(k2 => {
      const n = (r.alertas.porTipo || []).find(x => x.tipo === k2);
      return [k2, t(ALERTAS[k2]) + (n ? ' (' + n.n + ')' : '')];
    }));
    sel.replaceChildren(...opciones.map(([v, txt]) => { const o = el('option', '', txt); o.value = v; return o; }));
    sel.value = actual;
  }

  // ── La tienda ─────────────────────────────────────────────────────────────
  function filaTienda(o) {
    const c = o.cliente || {}, e = o.esperado || {}, v = o.verificacion;
    const esCompra = o.op === 'compra';
    const opTxt = o.tienda === 'p2p' && o.op !== 'compra' && o.op !== 'venta' ? o.op : t(esCompra ? 'Buy' : 'Sell');
    const op = celda(el('b', '', opTxt), o.contraparte ? t('with') + ' ' + o.contraparte : '');
    const item = celda(el('span', 'au-mono', o.itemId || '—'), o.cantidad ? '× ' + fmt(o.cantidad, 0) + (c.confirmadas !== undefined && c.confirmadas !== o.cantidad ? ' · ' + fmt(c.confirmadas, 0) + ' ' + t('units confirmed') : '') : '');
    let cobrado = '—';
    if (c.total !== undefined || c.precioUnidad !== undefined) {
      const lineas = [];
      if (c.precioUnidad !== undefined) lineas.push(t('unit') + ' ' + fmt(c.precioUnidad));
      if (c.fee) lineas.push(t('fee') + ' ' + fmt(c.fee, 0) + ' BR');
      if (c.pagadoBronce !== undefined) lineas.push(t('paid') + ' ' + fmt(c.pagadoBronce, 0) + ' BR');
      if (c.recibe !== undefined && c.recibe !== null) lineas.push(t('seller gets') + ' ' + fmt(c.recibe));
      if (c.reembolso) lineas.push(t('refund') + ' ' + fmt(c.reembolso));
      cobrado = celda(el('b', '', (c.total !== undefined ? fmt(c.total) : fmt((c.precioUnidad || 0) * (o.cantidad || 0))) + ' ' + moneda(o.moneda)), lineas.join(' · '));
    }
    let esperado = '—';
    if (e && (e.total !== undefined)) {
      const l = [];
      if (e.precioUnidad !== undefined) l.push(t('unit') + ' ' + fmt(e.precioUnidad));
      if (e.fee) l.push(t('fee') + ' ' + fmt(e.fee, 0) + ' BR');
      if (e.nivel > 1) l.push('Lv. ' + e.nivel);
      esperado = celda(el('b', '', fmt(e.total) + ' ' + moneda(e.moneda || o.moneda)), l.join(' · '));
    } else if (e && e.conocido === false) esperado = chip(t('Not in the price table'), 'aviso');
    let pagado;
    if (o.tienda === 'p2p') pagado = o.id && String(o.id).startsWith('h:') ? el('span', 'au-ok', t('Atomic on the server ✓')) : el('span', '', '—');
    else if (!v) pagado = el('span', 'tz-muted', o.estado === 'en_curso' ? t('Waiting') : (o.estado === 'rechazada' ? t('Nothing charged') : t('Checking…')));
    else if (v.solapada) pagado = celda(el('span', 'au-duda', t('Overlaps another operation')), t('seen') + ' ' + fmt(v.visto, 0) + ' BR');
    else if (!v.movs && v.esperado !== 0) pagado = celda(el('span', 'au-mal', t('✗ Not seen')), t('expected') + ' ' + fmt(v.esperado, 0) + ' BR');
    else if (Math.abs((v.visto || 0) - (v.esperado || 0)) > Math.max(2, Math.abs(v.esperado || 0) * 0.002)) pagado = celda(el('span', 'au-mal', t('≠ Different')), t('seen') + ' ' + fmt(v.visto, 0) + ' / ' + t('expected') + ' ' + fmt(v.esperado, 0) + ' BR');
    else pagado = celda(el('span', 'au-ok', t('✓ Matches')), fmt(v.visto, 0) + ' BR');
    const estado = celda(el('b', '', t(ESTADOS[o.estado] || o.estado || '—')), o.error ? o.error : '');
    const chips = el('div', 'au-chips');
    (o.avisos || []).forEach(a => { const d = AVISOS[a] || [a, 'aviso']; chips.append(chip(t(d[0]), d[1])); });
    if (!chips.childNodes.length) chips.append(chip(t('None'), 'ok'));
    let revisar = '';
    if (o.id && !String(o.id).startsWith('h:') && (o.problema || o.revisada)) {
      revisar = boton(o.revisada ? 'Reviewed ✓' : 'Mark reviewed', async () => {
        let nota = o.nota || '';
        if (!o.revisada) { const r = root.prompt(t('Note for this review (optional):'), nota); if (r === null) return; nota = r; }
        await pedir('/api/admin/auditoria/tienda/' + encodeURIComponent(o.id) + '/revisada', { method: 'POST', body: JSON.stringify({ revisada: !o.revisada, nota }) });
        o.revisada = !o.revisada; o.nota = nota; pintarTienda();
      });
      if (o.nota) revisar = celda(revisar, o.nota);
    }
    return { celdas: [fecha(o.t), jugador({ playerName: o.playerName, username: o.username, address: o.address, nivel: o.nivel }), op, item, cobrado, esperado, pagado, estado, chips, revisar],
             clase: o.revisada ? 'au-fila-revisada' : '' };
  }
  function pintarTienda() {
    const cols = [{ t: 'When' }, { t: 'Player' }, { t: 'Operation' }, { t: 'Item' }, { t: 'Charged / paid' }, { t: 'Expected' }, { t: 'Server check' }, { t: 'Status' }, { t: 'Warnings' }, { t: 'Review' }];
    $('au-t-lista').replaceChildren(tabla(cols, st.filasTienda.map(filaTienda), st.solo === 'todas' ? 'No operations yet.' : 'Nothing to review here.'));
  }
  async function cargarTienda(mas) {
    const antes = mas && st.filasTienda.length ? st.filasTienda[st.filasTienda.length - 1].t : '';
    const qs = new URLSearchParams({ tienda: st.tienda, solo: st.solo, limit: '120' });
    if (st.q) qs.set('q', st.q);
    if (antes) qs.set('antes', new Date(antes).toISOString());
    const r = await pedir('/api/admin/auditoria/tienda?' + qs.toString());
    st.filasTienda = mas ? st.filasTienda.concat(r.filas || []) : (r.filas || []);
    $('au-t-mas').hidden = (r.filas || []).length < 120;
    pintarTienda();
  }
  async function cargarSubidas() {
    const qs = new URLSearchParams({ dias: String(st.dias) });
    if (st.q) qs.set('q', st.q);
    const r = await pedir('/api/admin/auditoria/subidas?' + qs.toString());
    const cols = [{ t: 'When' }, { t: 'Player' }, { t: 'Coin' }, { t: 'Before → after', num: true }, { t: 'Change', num: true }, { t: 'In bronze', num: true }];
    $('au-subidas').replaceChildren(tabla(cols, (r.subidas || []).map(s => [fecha(s.t), jugador(s.quien || { playerName: s.playerName }), moneda(s.stat),
      fmt(s.antes, 0) + ' → ' + fmt(s.despues, 0), '+' + fmt(s.delta, 0), '+' + fmt(s.bronce, 0)]), 'No unexplained balance increases in this period.'));
  }

  // ── El suelo ──────────────────────────────────────────────────────────────
  function filaMonton(m) {
    const item = celda(el('span', 'au-mono', m.itemId), '× ' + fmt(m.cantidad, 0) + (m.nivelItem > 1 ? ' · Lv. ' + m.nivelItem : ''));
    const cadena = (m.viene && m.viene.length ? '↩ ' + t('came from another drop') : '') + (m.pasadoA && m.pasadoA.length ? (m.viene && m.viene.length ? ' · ' : '') + '↪ ' + t('passed on') : '');
    return { celdas: [fecha(m.t), item, jugador(m.de), m.para ? jugador(m.para) : el('span', 'tz-muted', '—'),
                      celda(el('span', '', m.sala || '—'), m.x != null ? Math.round(m.x) + ', ' + Math.round(m.y) : ''),
                      celda(el('b', '', t(SUELO_ESTADO[m.estado] || m.estado)), m.tRecogido ? fecha(m.tRecogido) : ''), cadena || '—'],
             datos: m };
  }
  const COLS_SUELO = [{ t: 'Dropped' }, { t: 'Item' }, { t: 'Dropped by' }, { t: 'Picked up by' }, { t: 'Map' }, { t: 'Status' }, { t: 'Chain' }];
  async function cargarSuelo() {
    const r = await pedir('/api/admin/suelo/movs?limit=80');
    $('au-s-titulo').textContent = t('Latest drops');
    $('au-s-lista').replaceChildren(tabla(COLS_SUELO, (r.movs || []).map(filaMonton), 'No drops yet.', verRastro));
    $('au-s-lista2').hidden = true; $('au-s-lista2-cab').hidden = true;
  }
  async function buscarJugador(q) {
    st.sQ = q;
    $('au-s-candidatos').replaceChildren();
    if (!q) { $('au-s-ficha').hidden = true; await cargarSuelo(); return; }
    const r = await pedir('/api/admin/suelo/buscar?q=' + encodeURIComponent(q));
    if (!r.jugador) {
      $('au-s-ficha').hidden = true;
      const c = $('au-s-candidatos');
      if (!(r.candidatos || []).length) { c.append(el('span', 'tz-muted', t('No player matches that search.'))); return; }
      c.append(el('span', 'tz-muted', t('Several players match:')));
      r.candidatos.forEach(p => c.append(boton((p.username || p.playerName) + (p.address ? ' · ' + corto(p.address) : ''), () => { $('au-s-q').value = p.address || p.playerName; return buscarJugador(p.address || p.playerName); })));
      return;
    }
    pintarFicha(r);
  }
  function pintarFicha(r) {
    const j = r.jugador, f = $('au-s-ficha');
    const datos = el('div', 'au-ficha-datos');
    const fila = (k, v) => datos.append(el('span', '', t(k)), v instanceof Node ? v : el('span', '', v));
    fila('Account', j.playerName); fila('Username', j.username || '—'); fila('Wallet', el('span', 'au-mono', j.address || '—'));
    fila('Level', 'Lv. ' + (j.nivel || 0));
    fila('VIP', j.vip ? (j.vip.activo ? t('Active until') + ' ' + fecha(j.vip.fin) : t('No')) : '—');
    const c = j.castigo, activo = !!(c && c.activo);
    const est = el('span', 'au-estado-soltar', !activo ? t('Can drop items') : c.permanente ? t('Blocked from dropping') : t('Suspended until') + ' ' + fecha(c.hasta));
    est.dataset.on = String(activo);
    fila('Dropping', est);
    if (activo && c.motivo) fila('Reason', c.motivo + (c.por ? ' — ' + corto(c.por) : ''));
    fila('Dropped / picked up', fmt((r.soltados || []).length, 0) + ' / ' + fmt((r.recogidos || []).length, 0));
    const izq = el('div');
    izq.append(el('span', 'tz-eyebrow', t('Player')), el('h2', '', j.username || j.playerName), datos);
    if ((r.intentos || []).length) {
      izq.append(el('h3', '', t('Latest attempts')));
      izq.append(tabla([{ t: 'Last time' }, { t: 'Type' }, { t: 'Item' }, { t: 'Times', num: true }],
        r.intentos.slice(0, 10).map(a => [fecha(a.ultima), t(ALERTAS[a.tipo] || a.tipo), a.itemId || '—', fmt(a.veces, 0)]), ''));
    }
    // Suspender, bloquear o levantar (solo SOLTAR: lo que sueltan los monstruos no se toca).
    const caja = el('div', 'au-castigo');
    caja.append(el('b', '', t('Drop permission')), el('p', 'tz-card-sub', t('Only affects items this player drops on the ground. Monster drops are never affected.')));
    const campos = el('div', 'tz-fields');
    const lDias = el('label', 'tz-field'); lDias.append(el('span', '', t('Days')));
    const dias = el('input', 'tz-input'); dias.type = 'number'; dias.min = '1'; dias.max = '3650'; dias.step = '1'; dias.value = '7'; dias.inputMode = 'numeric'; lDias.append(dias);
    const lMot = el('label', 'tz-field'); lMot.append(el('span', '', t('Reason')));
    const motivo = el('input', 'tz-input'); motivo.maxLength = 200; motivo.placeholder = t('At least 3 characters'); lMot.append(motivo);
    campos.append(lDias, lMot);
    const estado = el('span', 'tz-status'); estado.setAttribute('role', 'status');
    const castigar = async (permanente) => {
      const m = motivo.value.trim();
      if (m.length < 3) { estado.textContent = t('Write a reason of at least 3 characters.'); estado.dataset.error = 'true'; return; }
      const d = Math.floor(Number(dias.value) || 0);
      if (!permanente && !(d >= 1 && d <= 3650)) { estado.textContent = t('Days must be between 1 and 3650.'); estado.dataset.error = 'true'; return; }
      ocupado = true;
      try { await pedir('/api/admin/suelo/castigo', { method: 'POST', body: JSON.stringify({ jugador: j.address || j.playerName, dias: d, permanente, motivo: m }) }); await buscarJugador(st.sQ); cargarResumen().catch(() => {}); }
      catch (e) { estado.textContent = (e && e.message) || t('Could not apply.'); estado.dataset.error = 'true'; }
      finally { ocupado = false; }
    };
    const acciones = el('div', 'tz-actions');
    acciones.append(boton('Suspend', () => castigar(false), 'tz-btn'), boton('Block for good', () => castigar(true), 'tz-btn tz-danger'));
    if (activo) acciones.append(boton('Allow again', async () => {
      ocupado = true;
      try { await pedir('/api/admin/suelo/castigo/quitar', { method: 'POST', body: JSON.stringify({ jugador: j.address || j.playerName }) }); await buscarJugador(st.sQ); cargarResumen().catch(() => {}); }
      catch (e) { estado.textContent = (e && e.message) || t('Could not apply.'); estado.dataset.error = 'true'; }
      finally { ocupado = false; }
    }, 'tz-btn tz-primary'));
    caja.append(campos, acciones, estado);
    const rejilla = el('div', 'au-ficha'); rejilla.append(izq, caja);
    f.replaceChildren(rejilla); f.hidden = false;
    $('au-s-titulo').textContent = t('Dropped by this player');
    $('au-s-lista').replaceChildren(tabla(COLS_SUELO, (r.soltados || []).map(filaMonton), 'This player has not dropped anything.', verRastro));
    $('au-s-lista2-cab').hidden = false; $('au-s-lista2').hidden = false;
    $('au-s-lista2').replaceChildren(tabla(COLS_SUELO, (r.recogidos || []).map(filaMonton), 'This player has not picked anything up.', verRastro));
  }
  async function verRastro(m) {
    const caja = $('au-s-rastro');
    caja.hidden = false;
    caja.replaceChildren(el('div', 'tz-loading', t('Loading…')));
    try {
      const r = await pedir('/api/admin/suelo/rastro/' + encodeURIComponent(m.id));
      const pasos = (r.antes || []).slice().sort((a, b) => a.paso - b.paso).concat([Object.assign({ paso: 0, base: true }, r.monton)], (r.despues || []).slice().sort((a, b) => a.paso - b.paso));
      const lista = el('div', 'au-rastro');
      pasos.forEach(p => {
        const fila = el('div', 'au-paso'); fila.dataset.base = String(!!p.base);
        fila.append(el('div', 'au-paso-n', p.base ? t('This drop') : (p.paso < 0 ? t('Before') + ' ' + (-p.paso) : t('After') + ' ' + p.paso)));
        const txt = el('div', 'au-paso-txt');
        const nombre = o => (o ? (o.username || o.playerName || corto(o.address)) : '—');
        txt.append(el('b', '', nombre(p.de)), el('span', 'au-flecha', '→'), el('span', 'au-mono', p.itemId + ' × ' + fmt(p.cantidad, 0)), el('span', 'au-flecha', '→'),
                   el('b', '', p.para ? nombre(p.para) : t(SUELO_ESTADO[p.estado] || p.estado)),
                   el('small', 'tz-muted', fecha(p.t) + (p.sala ? ' · ' + p.sala : '') + (p.de && p.de.address ? ' · ' + corto(p.de.address) : '') + (p.para && p.para.address ? ' → ' + corto(p.para.address) : '')));
        fila.append(txt); lista.append(fila);
      });
      const cab = el('div', 'au-titulo');
      const tit = el('div'); tit.append(el('h2', '', t('Drop trail')), el('p', 'tz-card-sub', t('Who dropped it, who picked it up and who they passed it to. A drop is linked to an earlier one when the player had picked up that same item before dropping it.')));
      cab.append(tit, boton('Close', () => { caja.hidden = true; }, 'tz-btn'));
      caja.replaceChildren(cab, lista);
      caja.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) { caja.replaceChildren(el('div', 'tz-empty', (e && e.message) || t('Could not load the trail.'))); }
  }

  // ── Los intentos ──────────────────────────────────────────────────────────
  function detalleAlerta(a) {
    const d = a.datos || {}, p = [];
    if (d.nivelRequerido) p.push(t('needs Lv.') + ' ' + d.nivelRequerido + ', ' + t('has Lv.') + ' ' + (d.nivel != null ? d.nivel : a.nivel));
    if (d.deNombre || d.de) p.push(t('dropped by') + ' ' + (d.deNombre || d.de));
    if (d.cantidad) p.push('× ' + fmt(d.cantidad, 0));
    if (d.permanente) p.push(t('blocked'));
    else if (d.hasta) p.push(t('suspended until') + ' ' + fecha(d.hasta));
    if (d.visto !== undefined) p.push(t('seen') + ' ' + fmt(d.visto, 0) + ' / ' + t('expected') + ' ' + fmt(d.esperado, 0) + ' BR');
    if (d.avisos && d.avisos.length) p.push(d.avisos.map(x => t((AVISOS[x] || [x])[0])).join(', '));
    if (d.error) p.push(String(d.error).slice(0, 120));
    if (d.txHash) p.push('tx ' + corto(d.txHash));
    if (d.ruta) p.push(d.ruta + (d.codigo ? ' · ' + d.codigo : ''));
    if (d.sala) p.push(d.sala);
    return p.join(' · ') || '—';
  }
  async function cargarAlertas() {
    const qs = new URLSearchParams({ solo: st.aSolo, limit: '200' });
    if ($('au-a-tipo').value) qs.set('tipo', $('au-a-tipo').value);
    const q = $('au-a-q').value.trim(); if (q) qs.set('q', q);
    const r = await pedir('/api/admin/auditoria/alertas?' + qs.toString());
    const cols = [{ t: 'Last time' }, { t: 'Type' }, { t: 'Player' }, { t: 'Item' }, { t: 'Details' }, { t: 'Times', num: true }, { t: 'Review' }];
    $('au-a-lista').replaceChildren(tabla(cols, (r.alertas || []).map(a => ({
      celdas: [celda(fecha(a.ultima), a.t && a.t !== a.ultima ? t('first') + ' ' + fecha(a.t) : ''),
               chip(t(ALERTAS[a.tipo] || a.tipo), a.gravedad === 'grave' ? 'grave' : 'aviso'),
               jugador({ playerName: a.playerName, username: a.username, address: a.address, nivel: a.nivel }),
               a.itemId ? el('span', 'au-mono', a.itemId) : '—', detalleAlerta(a), fmt(a.veces, 0),
               boton(a.revisada ? 'Reviewed ✓' : 'Mark reviewed', async () => {
                 await pedir('/api/admin/auditoria/alertas/' + encodeURIComponent(a.id) + '/revisada', { method: 'POST', body: JSON.stringify({ revisada: !a.revisada }) });
                 await cargarAlertas(); cargarResumen().catch(() => {});
               })],
      clase: a.revisada ? 'au-fila-revisada' : '' })), st.aSolo === 'todas' ? 'No alerts yet.' : 'No alerts left to review.'));
  }

  // ── Cargar y cablear ──────────────────────────────────────────────────────
  async function cargarTab() {
    if (st.tab === 'tienda') await Promise.all([cargarTienda(false), cargarSubidas()]);
    else if (st.tab === 'suelo') { if (st.sQ) await buscarJugador(st.sQ); else await cargarSuelo(); }
    else await cargarAlertas();
  }
  async function cargarTodo(primera) {
    if (!verificado || cerrado) return;
    $('au-refresh').disabled = true;
    try {
      await Promise.all([cargarResumen(), cargarTab()]);
      if (!primera || !$('au-notice').textContent) aviso('');
      $('au-updated').textContent = t('Last updated · ') + new Intl.DateTimeFormat(loc(), { hour: '2-digit', minute: '2-digit' }).format(new Date());
    } catch (e) {
      if (e && e.status === 401) { aPuerta('Your session expired. Connect again.', true); return; }
      if (!(e && e.status === 404)) aviso((e && e.message) || 'Could not load the audit.');
    } finally { if (!cerrado) $('au-refresh').disabled = false; }
  }
  const seguro = fn => () => fn().catch(e => { if (e && e.status === 401) aPuerta('Your session expired. Connect again.', true); else if (!(e && e.status === 404)) aviso((e && e.message) || 'Could not load the audit.'); });
  function pulsar(grupo, atributo, valor) {
    document.querySelectorAll('[' + atributo + ']').forEach(b => { if (b.closest('.au-seg') === grupo) b.setAttribute('aria-pressed', String(b.getAttribute(atributo) === valor)); });
  }
  document.querySelectorAll('.au-tab').forEach(b => b.addEventListener('click', () => {
    st.tab = b.dataset.tab;
    document.querySelectorAll('.au-tab').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    ['tienda', 'suelo', 'alertas'].forEach(k => { $('au-panel-' + k).hidden = k !== st.tab; });
    seguro(cargarTab)();
  }));
  document.querySelectorAll('[data-tienda]').forEach(b => b.addEventListener('click', () => { st.tienda = b.dataset.tienda; pulsar(b.closest('.au-seg'), 'data-tienda', st.tienda); seguro(() => cargarTienda(false))(); }));
  document.querySelectorAll('[data-solo]').forEach(b => b.addEventListener('click', () => { st.solo = b.dataset.solo; pulsar(b.closest('.au-seg'), 'data-solo', st.solo); seguro(() => cargarTienda(false))(); }));
  document.querySelectorAll('[data-dias]').forEach(b => b.addEventListener('click', () => { st.dias = Number(b.dataset.dias) || 7; pulsar(b.closest('.au-seg'), 'data-dias', b.dataset.dias); seguro(cargarSubidas)(); }));
  document.querySelectorAll('[data-asolo]').forEach(b => b.addEventListener('click', () => { st.aSolo = b.dataset.asolo; pulsar(b.closest('.au-seg'), 'data-asolo', st.aSolo); seguro(cargarAlertas)(); }));
  $('au-t-form').addEventListener('submit', ev => { ev.preventDefault(); st.q = $('au-t-q').value.trim(); seguro(() => Promise.all([cargarTienda(false), cargarSubidas()]))(); });
  $('au-t-mas').addEventListener('click', seguro(() => cargarTienda(true)));
  $('au-s-form').addEventListener('submit', ev => { ev.preventDefault(); seguro(() => buscarJugador($('au-s-q').value.trim()))(); });
  $('au-s-limpiar').addEventListener('click', () => { $('au-s-q').value = ''; st.sQ = ''; $('au-s-ficha').hidden = true; $('au-s-rastro').hidden = true; $('au-s-candidatos').replaceChildren(); seguro(cargarSuelo)(); });
  $('au-a-form').addEventListener('submit', ev => { ev.preventDefault(); seguro(cargarAlertas)(); });
  $('au-a-tipo').addEventListener('change', seguro(cargarAlertas));
  $('au-connect').addEventListener('click', () => verificar(true));
  $('au-refresh').addEventListener('click', () => cargarTodo(false));
  root.addEventListener('pagehide', ev => { if (ev.persisted) return; cerrado = true; clearInterval(reloj); if (peticion) peticion.abort(); });
  verificar(false);
})(window);
