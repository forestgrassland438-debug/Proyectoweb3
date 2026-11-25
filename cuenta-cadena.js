/* cuenta-cadena.js — "Chain backup" del centro de control (2026-11-19).
   La cuenta de cada jugador respaldada en el contrato (Desktop/cuenta-en-cadena.js):
     GET  /api/admin/cuenta-cadena/estado
     POST /api/admin/cuenta-cadena/config
     GET  /api/admin/cuenta-cadena/jugador/:p           (Mongo frente a la cadena)
     POST /api/admin/cuenta-cadena/jugador/:p/sincronizar
     POST /api/admin/cuenta-cadena/jugador/:p/restaurar
     POST /api/admin/cuenta-cadena/anclar
     POST /api/admin/cuenta-cadena/restaurar-todo        ({ confirmar: 'RESTAURAR' })
   Todo lo que viene del servidor se pinta con textContent. Los textos de la interfaz
   pasan por GFAdminUI.t (admin-suite-i18n.js); los datos (cuentas, hashes) no. */
(function () {
  'use strict';
  const op = window.GFOperations, { $, el } = op;
  const t = (s) => (window.GFAdminUI && typeof window.GFAdminUI.t === 'function' ? window.GFAdminUI.t(s) : s);
  let estado = null, sondeo = null;

  const NOMBRES = { tutorial: 'Tutorial', habilidades: 'Skills (experience)', misiones: 'Missions completed', ranking: 'Ranking',
    amigos: 'Friends', invitados: 'Invites', lands: 'Lands buildings', respaldo: 'Encrypted anchor (head)',
    // (2026-11-25) Las cuentas creadas y las tx minadas, en una factura del relayer (ver el centro de control).
    contadores: 'Contract counters' };
  const nombre = (k) => t(NOMBRES[k] || k);
  const fecha = (v) => v ? new Date(v).toLocaleString() : '—';
  const minutos = (ms) => Math.round((Number(ms) || 0) / 60000);

  op.onReset(() => {
    estado = null;
    if (sondeo) { clearTimeout(sondeo); sondeo = null; }
    ['cc-estado', 'cc-tablas', 'cc-jugador-datos', 'cc-ancla', 'cc-tarea'].forEach((id) => $(id).replaceChildren());
  });

  /** Una tarjeta: la etiqueta y el pie son interfaz (se traducen); el valor es dato. */
  function dato(cont, etiqueta, valor, pie, clase) {
    const d = el('div', null, 'cc-dato');
    d.append(el('span', t(etiqueta)));
    const s = el('strong', valor == null ? '—' : valor);
    if (clase) s.className = clase;
    d.append(s);
    if (pie) d.append(el('small', pie));
    cont.append(d);
  }

  async function pedir(ruta, opciones) {
    try { return await op.request(ruta, opciones); }
    catch (e) {
      if (e && e.status === 404) { $('cc-sin-servidor').hidden = false; throw new Error(t('The game server does not have this module yet.')); }
      throw e;
    }
  }

  function pintarEstado() {
    const s = estado, c = $('cc-estado');
    c.replaceChildren();
    if (!s) return;
    const cfg = s.config || {}, m = s.metricas || {}, j = s.jugadores || {};
    dato(c, 'Backup', t(cfg.activo ? 'Active' : 'Paused'), t(s.contrato ? 'Contract connected' : 'No contract or relayer'), cfg.activo ? 'cc-ok' : 'cc-mal');
    dato(c, 'Anchor key', t(s.claveAncla ? 'Key ready' : 'Missing'),
      t(s.claveAncla ? 'Set GF_RESPALDO_CLAVE to make it independent of the relayer key' : 'Without a key the anchor stays off'), s.claveAncla ? 'cc-ok' : 'cc-mal');
    dato(c, 'Queue', String(s.cola || 0), t(s.trabajando ? 'Working now' : 'Idle'));
    dato(c, 'Players backed up', j.sincronizados == null ? '—' : String(j.sincronizados),
      (j.pendientes || 0) + ' ' + t('waiting their interval') + ' · ' + (j.conError || 0) + ' ' + t('with errors'));
    dato(c, 'Transactions (this run)', String(m.tx || 0), Object.entries(m.porTabla || {}).map(([k, v]) => nombre(k) + ' ' + v).join(' · ') || '—');
    const gas = Number(m.gas || 0) / 1e18;
    dato(c, 'Gas spent (this run)', gas ? gas.toFixed(6) : '0', t('In the network coin (zkLTC on LitVM)'));
    dato(c, 'Restored values', String(m.restaurados || 0), t('Taken from the chain because the database had less'));
    dato(c, 'Last sweep', fecha(m.ultimoCiclo), (m.ciclos || 0) + ' ' + t('sweeps'));
    if (m.ultimoError) dato(c, 'Last error', m.ultimoError, fecha(m.ultimoErrorEn), 'cc-mal');
    const aviso = $('cc-clave-aviso');
    aviso.hidden = !!s.claveAncla && !!cfg.anclaActiva;
    aviso.replaceChildren();
    if (!s.claveAncla) {
      aviso.append(el('strong', t('The encrypted anchor has no key.') + ' '));
      aviso.append(document.createTextNode(t('Add GF_RESPALDO_CLAVE (any long secret, at least 32 characters) to the backend variables and keep a copy outside the server: without it the anchored batches cannot be read after a wipe.')));
    } else if (!cfg.anclaActiva) {
      aviso.append(el('strong', t('The encrypted anchor is paused.') + ' '));
      aviso.append(document.createTextNode(t('Private messages, Google wallets and profiles are not being backed up.')));
    }
  }

  function pintarTablas() {
    const tb = $('cc-tablas');
    tb.replaceChildren();
    const tablas = (estado && estado.tablas) || {};
    for (const [k, v] of Object.entries(tablas)) {
      const tr = el('tr');
      tr.append(el('td', nombre(k)));
      tr.append(el('td', v.tipo, 'cc-mono'));
      tr.append(el('td', t(v.existe === null ? 'Unknown (node did not answer)' : v.existe ? 'Yes' : 'Not yet (created on first use)'), v.existe ? 'cc-ok' : 'cc-gris'));
      tr.append(el('td', v.facturas == null ? '—' : String(v.facturas)));
      tb.append(tr);
    }
  }

  function pintarAjustes() {
    const cfg = (estado && estado.config) || {};
    const mm = cfg.minimoMs || {};
    $('cc-activo').checked = !!cfg.activo;
    $('cc-ancla-activa').checked = !!cfg.anclaActiva;
    $('cc-min-habilidades').value = minutos(mm.habilidades);
    $('cc-min-misiones').value = minutos(mm.misiones);
    $('cc-min-ranking').value = minutos(mm.ranking);
    $('cc-ancla-cada').value = minutos(cfg.anclaCadaMs) || 10;
    $('cc-ciclo').value = minutos(cfg.cicloMs) || 2;
    $('cc-tx-min').value = cfg.txPorMinuto || 20;
    $('cc-por-ciclo').value = cfg.jugadoresPorCiclo || 40;
  }

  function pintarAncla() {
    const a = (estado && estado.ancla) || {}, c = $('cc-ancla');
    c.replaceChildren();
    dato(c, 'Batches anchored', String(a.lotes || 0));
    dato(c, 'Bytes anchored', String(a.bytes || 0), t('Compressed and encrypted'));
    dato(c, 'Last batch', a.ultimo && a.ultimo.hash ? a.ultimo.hash : '—', a.ultimo && a.ultimo.bloque ? t('Block') + ' ' + a.ultimo.bloque : '');
  }

  function pintarTarea(tarea) {
    const c = $('cc-tarea');
    c.replaceChildren();
    if (!tarea) return;
    const fase = t({ anclas: 'Reading the encrypted batches', facturas: 'Reading every invoice of the contract', jugadores: 'Rebuilding the accounts' }[tarea.fase] || String(tarea.fase || ''));
    c.append(el('p', t(tarea.estado === 'en_curso' ? 'In progress' : tarea.estado === 'hecho' ? 'Finished' : 'Error') + ' · ' + fase));
    if (tarea.total) {
      const barra = el('div', null, 'cc-barra'), i = el('i');
      i.style.width = Math.min(100, Math.round(100 * (tarea.hechos || 0) / tarea.total)) + '%';
      barra.append(i); c.append(barra);
      c.append(el('small', (tarea.hechos || 0) + ' / ' + tarea.total + ' ' + t('invoices') + ' · ' + (tarea.jugadores || 0) + ' ' + t('players'), 'cc-gris'));
    }
    if (tarea.resultado) {
      const r = tarea.resultado, a = r.anclas || {};
      c.append(el('p', t('Accounts rebuilt') + ': ' + (r.jugadores || 0) + ' · ' + t('values restored') + ': ' + (r.repuestas || 0) + ' · ' +
        t('from the anchor') + ': ' + (a.cuentas || 0) + ' ' + t('profiles') + ', ' + (a.dms || 0) + ' ' + t('messages') + ', ' + (a.carteras || 0) + ' ' + t('Google wallets')));
    }
    if (tarea.error) c.append(el('p', tarea.error, 'cc-mal'));
  }

  function pintarTodo() { pintarEstado(); pintarTablas(); pintarAjustes(); pintarAncla(); pintarTarea(estado && estado.tarea); }

  async function load() {
    $('cc-sin-servidor').hidden = true;
    estado = await pedir('/api/admin/cuenta-cadena/estado');
    if (!op.active) return;
    pintarTodo();
    if (estado.tarea && estado.tarea.estado === 'en_curso') vigilarTarea();
    op.notice('');
  }

  function vigilarTarea() {
    if (sondeo) clearTimeout(sondeo);
    sondeo = setTimeout(async () => {
      sondeo = null;
      if (!op.active) return;
      try {
        estado = await pedir('/api/admin/cuenta-cadena/estado');
        pintarTodo();
        if (estado.tarea && estado.tarea.estado === 'en_curso') vigilarTarea();
        else if (estado.tarea) op.notice(t(estado.tarea.estado === 'hecho' ? 'Recovery finished.' : 'Recovery stopped with an error.'), estado.tarea.estado !== 'hecho');
      } catch (_) { vigilarTarea(); }
    }, 3000);
  }

  function pintarJugador(d) {
    const c = $('cc-jugador-datos');
    c.replaceChildren();
    if (!d || !d.ok) { c.append(el('p', t(d && d.motivo === 'sin_jugador' ? 'No player with that account (or without a wallet address).' : 'Could not read this player.'), 'cc-mal')); return; }
    c.append(el('p', d.playerName + ' · ' + d.address, 'cc-mono'));
    const tabla = el('table', null, 'cc-tabla'), cab = el('tr');
    ['Data', 'Database', 'On the chain'].forEach((h) => cab.append(el('th', t(h))));
    const thead = el('thead'); thead.append(cab); tabla.append(thead);
    const tb = el('tbody');
    const texto = (v) => {
      if (v == null) return '—';
      if (Array.isArray(v)) return v.length ? v.map((x) => x.otro || x.invitado || x.codigo || (x.tipo ? x.tipo + ' ' + x.gx + ',' + x.gy : x.manualId)).join(', ') : t('(none)');
      if (typeof v === 'object') return Object.entries(v).filter(([k]) => k !== '_marca').map(([k, x]) => k + ': ' + (x == null ? '—' : x)).join(' · ');
      return String(v);
    };
    for (const [k, v] of Object.entries(d.tablas || {})) {
      const tr = el('tr');
      tr.append(el('td', nombre(k)));
      tr.append(el('td', texto(v.mongo), 'cc-mono'));
      tr.append(el('td', v.cadena == null ? t('Not on the chain yet') : texto(v.cadena), v.cadena == null ? 'cc-gris' : 'cc-mono'));
      tb.append(tr);
    }
    tabla.append(tb); c.append(tabla);
    if (d.estado) {
      c.append(el('small', t('Last write') + ': ' + fecha(d.estado.actualizado) +
        (d.estado.vence ? ' · ' + t('next allowed write') + ' ' + fecha(d.estado.vence) : '') +
        (d.estado.error ? ' · ' + t('last error') + ': ' + d.estado.error : ''), 'cc-gris'));
    }
  }

  const jugador = () => {
    const v = $('cc-jugador').value.trim();
    if (!v) throw new Error(t('Write the account name (playerName).'));
    return encodeURIComponent(v);
  };

  $('cc-ver').addEventListener('click', () => op.run(async () => {
    pintarJugador(await pedir('/api/admin/cuenta-cadena/jugador/' + jugador()));
  }, $('cc-ver')));
  $('cc-sincronizar').addEventListener('click', () => op.run(async () => {
    const p = jugador();
    if (!window.confirm(t('Write this player\'s changes to the chain now? It skips the waiting intervals and can send several transactions.'))) return;
    const r = await pedir('/api/admin/cuenta-cadena/jugador/' + p + '/sincronizar', { method: 'POST', body: '{}' });
    op.notice(r.ok ? (r.escritas && r.escritas.length ? t('Written') + ': ' + r.escritas.join(', ') + '.' : t('Nothing to write: the chain already matches.')) :
      t('Not completed') + ': ' + (r.motivo || t('see the last error')), !r.ok);
    pintarJugador(await pedir('/api/admin/cuenta-cadena/jugador/' + p));
  }, $('cc-sincronizar')));
  $('cc-restaurar').addEventListener('click', () => op.run(async () => {
    const p = jugador();
    if (!window.confirm(t('Restore this player from the chain? Only what the database is missing is filled in.'))) return;
    const r = await pedir('/api/admin/cuenta-cadena/jugador/' + p + '/restaurar', { method: 'POST', body: '{}' });
    const n = Object.entries(r.repuestas || {}).map(([k, v]) => nombre(k) + ' ' + v).join(', ');
    op.notice(r.ok ? (n ? t('Restored') + ': ' + n + '.' : t('Nothing to restore: the database already had it.')) : t('Not completed') + ': ' + (r.motivo || '—'), !r.ok);
    pintarJugador(await pedir('/api/admin/cuenta-cadena/jugador/' + p));
  }, $('cc-restaurar')));
  $('cc-anclar').addEventListener('click', () => op.run(async () => {
    const r = await pedir('/api/admin/cuenta-cadena/anclar', { method: 'POST', body: '{}' });
    op.notice(!r.ok ? (r.motivo === 'sin_clave' ? t('There is no anchor key (GF_RESPALDO_CLAVE).') : t('Not sent') + ': ' + (r.motivo || t('see the last error'))) :
      r.enviado ? t('Batch sent') + ': ' + r.dms + ' ' + t('messages') + ', ' + r.carteras + ' ' + t('Google wallets') + ', ' + r.cuentas + ' ' + t('profiles') + ' (' + r.bytes + ' bytes).' :
        t('Nothing new to anchor.'), !r.ok);
    await load();
  }, $('cc-anclar')));
  $('cc-guardar').addEventListener('click', () => op.run(async () => {
    const n = (id, def) => { const x = Math.floor(Number($(id).value)); return Number.isFinite(x) && x >= 0 ? x : def; };
    const cambios = {
      activo: $('cc-activo').checked, anclaActiva: $('cc-ancla-activa').checked,
      minimoMs: { habilidades: n('cc-min-habilidades', 20) * 60000, misiones: n('cc-min-misiones', 10) * 60000, ranking: n('cc-min-ranking', 10) * 60000 },
      anclaCadaMs: Math.max(1, n('cc-ancla-cada', 10)) * 60000, cicloMs: Math.max(1, n('cc-ciclo', 2)) * 60000,
      txPorMinuto: Math.max(1, n('cc-tx-min', 20)), jugadoresPorCiclo: Math.max(1, n('cc-por-ciclo', 40))
    };
    await pedir('/api/admin/cuenta-cadena/config', { method: 'POST', body: JSON.stringify(cambios) });
    op.notice(t('Settings saved.'));
    await load();
  }, $('cc-guardar')));
  $('cc-restaurar-todo').addEventListener('click', () => op.run(async () => {
    if ($('cc-confirmar').value.trim().toUpperCase() !== 'RESTAURAR') throw new Error(t('Type RESTAURAR to confirm.'));
    if (!window.confirm(t('Rebuild every account from the chain? Only missing data is filled in. It can take several minutes.'))) return;
    const r = await pedir('/api/admin/cuenta-cadena/restaurar-todo', { method: 'POST', body: JSON.stringify({ confirmar: 'RESTAURAR' }) });
    $('cc-confirmar').value = '';
    pintarTarea(r.tarea);
    op.notice(t('Recovery started.'));
    vigilarTarea();
  }, $('cc-restaurar-todo')));

  window.startOperations(load);
})();
