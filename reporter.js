/**
 * REPORTER — BANDEJA DE ERRORES DEL CLIENTE Y FALLOS DE RELAY
 * =============================================================================
 * Panel de administración para reporter.html.
 *
 * ACCESO: cartera de administrador. Se reutiliza EXACTAMENTE el mismo ciclo de
 * entrada que admin.html (nonce → firma → /api/auth/login) y la sesión viaja en
 * la cookie httpOnly que ya emite el servidor. El backend valida con adminAuth,
 * que comprueba la dirección contra la lista de administradores.
 *
 * NADA EN localStorage NI sessionStorage — pedido expreso. La sesión vive en la
 * cookie del servidor y todos los datos se piden en cada carga. Aquí no se
 * guarda ni un token ni una preferencia: si cierras la pestaña, no queda rastro
 * en el navegador.
 * =============================================================================
 */
(function () {
  'use strict';

  // ── Configuración ──────────────────────────────────────────────────────────
  var esLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  var API_BASE = esLocal ? 'http://127.0.0.1:8080' : 'https://api.grasslandforest.com';
  var APP_NAME = 'Grassland Forest';
  var POR_PAGINA = 50;
  var peticiones = new Set(), cerrado = false, revisionErrores = 0, revisionRelay = 0, revisionCarga = 0;

  function api(p) { return API_BASE.replace(/\/$/, '') + p; }
  function $(id) { return document.getElementById(id); }

  // Estado en memoria. Se pierde al recargar, y eso es lo que se quiere.
  var estado = {
    admin: null,
    pestana: 'errors',
    errores: { skip: 0, total: 0 },
    relay:   { skip: 0, total: 0 }
  };

  // ── Utilidades ─────────────────────────────────────────────────────────────

  /** Texto seguro: se usa textContent en todos lados, nunca innerHTML con datos. */
  function td(texto, clase) {
    var e = document.createElement('td');
    if (clase) e.className = clase;
    e.textContent = texto === null || texto === undefined ? '' : String(texto);
    return e;
  }

  function leerCookie(nombre) {
    var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + nombre + '=([^;]*)'));
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch (e) { return null; }
  }

  function cuando(fecha) {
    if (!fecha) return '—';
    var d = new Date(fecha);
    if (isNaN(d)) return '—';
    var seg = Math.floor((Date.now() - d.getTime()) / 1000);
    if (seg < 60)    return 'just now';
    if (seg < 3600)  return Math.floor(seg / 60) + ' min ago';
    if (seg < 86400) return Math.floor(seg / 3600) + ' h ago';
    if (seg < 604800) return Math.floor(seg / 86400) + ' d ago';
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  var toastTimer = null;
  function toast(msg, tipo) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'show' + (tipo ? ' ' + tipo : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, 3200);
  }

  function aviso(msg, clase) {
    var g = $('gateMsg');
    g.textContent = msg;
    g.className = clase || 'muted';
  }

  // ── Peticiones ─────────────────────────────────────────────────────────────
  async function pedir(ruta, opciones) {
    if (window.GFAdminSession) return window.GFAdminSession.request(ruta, opciones);
    if (cerrado) throw new Error('Reporter closed');
    opciones = Object.assign({}, opciones || {});
    opciones.credentials = 'include';
    opciones.mode = 'cors';
    var csrf = leerCookie('csrf-token');
    opciones.headers = Object.assign(
      { 'Content-Type': 'application/json' },
      csrf ? { 'X-CSRF-Token': csrf } : {},
      opciones.headers || {}
    );
    var ctl = new AbortController();
    peticiones.add(ctl); opciones.signal = ctl.signal;
    var timer = setTimeout(function () { ctl.abort(); }, 15000);
    try {
      var r = await fetch(api(ruta), opciones);
      var d = await r.json().catch(function () { return {}; });
      if (ctl.signal.aborted || cerrado) throw new Error('Report request cancelled');
      if (!r.ok) { var error = new Error(d.message || d.error || ('HTTP ' + r.status)); error.status = r.status; throw error; }
      return d;
    } finally { clearTimeout(timer); peticiones.delete(ctl); }
  }

  // ── Entrada con la cartera ─────────────────────────────────────────────────

  function proveedor() { return window.ethereum || null; }

  function b64(s) {
    return btoa(unescape(encodeURIComponent(s)));
  }

  async function pedirCsrf() {
    try { await pedir('/api/auth/csrf-token'); }
    catch (e) { /* si falla, el login lo reintenta sin cabecera */ }
  }

  async function conectar() {
    if ($('btnConnect').disabled || cerrado) return;
    var prov = proveedor();
    if (!prov) { aviso('No wallet detected. Install MetaMask to continue.', 'err'); return; }

    $('btnConnect').disabled = true;
    try {
      aviso('Connecting wallet…');
      var cuentas = await prov.request({ method: 'eth_requestAccounts' });
      var cuenta = cuentas && cuentas[0];
      if (!cuenta) { aviso('No account selected.', 'err'); return; }

      await pedirCsrf();

      aviso('Requesting nonce…');
      var nr = await pedir('/api/auth/nonce?address=' + encodeURIComponent(cuenta.toLowerCase()));
      var nonce = nr.nonce;

      var token = nonce + ':' + Math.floor(Date.now() / 1000);
      var mensaje = 'Signing in to ' + APP_NAME + ': ' + b64(token);

      aviso('Sign the message in your wallet…');
      var firma = await prov.request({ method: 'personal_sign', params: [mensaje, cuenta] });

      var cabeceras = { 'Content-Type': 'application/json' };
      var csrf = leerCookie('csrf-token');
      if (csrf) cabeceras['X-CSRF-Token'] = csrf;

      aviso('Verifying…');
      await pedir('/api/auth/login', {
        method: 'POST', credentials: 'include', mode: 'cors', headers: cabeceras,
        body: JSON.stringify({
          address: cuenta.toLowerCase(), signature: firma, token: token, message: mensaje
        })
      });
      await comprobarSesion();
    } catch (e) {
      // 4001 = el usuario rechazó la firma en la cartera.
      var msg = (e && e.code === 4001) ? 'You rejected the signature.' : (e.message || 'Could not sign in');
      aviso(msg, 'err');
    } finally {
      $('btnConnect').disabled = false;
    }
  }

  /** ¿Hay ya una sesión de administrador viva? */
  async function comprobarSesion() {
    try {
      var d = await pedir('/api/admin/whoami');
      estado.admin = d.address || 'admin';
      $('gate').classList.add('hidden');
      $('panel').classList.remove('hidden');
      $('whoAddr').textContent = estado.admin.length > 14
        ? estado.admin.slice(0, 6) + '…' + estado.admin.slice(-4)
        : estado.admin;
      $('whoDot').className = 'dot on';
      await recargarTodo();
      return true;
    } catch (e) {
      // 401/403 es lo NORMAL antes de entrar: no es un fallo que reportar.
      if (e.status === 401 || e.status === 403) {
        aviso('Not signed in as an administrator yet.', 'muted');
      } else {
        aviso('Could not reach the server: ' + e.message, 'err');
      }
      return false;
    }
  }

  // ── Errores del cliente ────────────────────────────────────────────────────

  async function cargarErrores() {
    var run = ++revisionErrores;
    var q = $('q').value.trim();
    var t = $('fType').value;
    var ruta = '/api/admin/client-errors?grouped=1&limit=' + POR_PAGINA + '&skip=' + estado.errores.skip +
               (q ? '&q=' + encodeURIComponent(q) : '') +
               (t ? '&type=' + encodeURIComponent(t) : '');

    var d = await pedir(ruta);
    if (cerrado || run !== revisionErrores) return;
    estado.errores.total = d.total || 0;

    $('mUnique').textContent = d.total || 0;
    $('mOccur').textContent  = d.ocurrencias || 0;
    $('mTypes').textContent  = (d.tipos || []).length;
    $('mShown').textContent  = (d.items || []).length;

    // Selector de tipos: se rellena una vez y se conserva la elección.
    var sel = $('fType');
    if (sel.options.length <= 1 && d.tipos && d.tipos.length) {
      d.tipos.forEach(function (tipo) {
        var o = document.createElement('option');
        o.value = tipo; o.textContent = tipo;
        sel.appendChild(o);
      });
      sel.value = t;
    }

    var cuerpo = $('rowsErrors');
    cuerpo.textContent = '';
    var vacio = !d.items || !d.items.length;
    $('emptyErrors').classList.toggle('hidden', !vacio);

    renderReportRows(cuerpo, d.items || [], false);

    pintarPaginador('E', estado.errores);
  }

  async function borrarUno(id, boton) {
    if (!id) return;
    boton.disabled = true;
    try {
      await pedir('/api/admin/client-errors/' + encodeURIComponent(id), { method: 'DELETE' });
      toast('Report deleted', 'good');
      await cargarErrores();
    } catch (e) {
      toast('Could not delete: ' + e.message, 'bad');
      boton.disabled = false;
    }
  }

  async function borrarTodos() {
    // Doble confirmación: es irreversible y borra la bandeja entera.
    if (!confirm('Delete ALL client error reports?\n\nThis cannot be undone.')) return;
    if (!confirm('Really delete every report? Last chance.')) return;

    $('btnWipe').disabled = true;
    try {
      var d = await pedir('/api/admin/client-errors?confirm=YES', { method: 'DELETE' });
      toast('Deleted ' + (d.borrados || 0) + ' reports', 'good');
      estado.errores.skip = 0;
      await cargarErrores();
    } catch (e) {
      toast('Could not delete: ' + e.message, 'bad');
    } finally {
      $('btnWipe').disabled = false;
    }
  }

  // ── Fallos de relay ────────────────────────────────────────────────────────

  async function cargarRelay() {
    var run = ++revisionRelay;
    var d = await pedir('/api/admin/relay-failures?grouped=1&limit=' + POR_PAGINA + '&skip=' + estado.relay.skip + '&q=' + encodeURIComponent($('qRelay').value.trim()));
    if (cerrado || run !== revisionRelay) return;
    estado.relay.total = d.total || 0;

    $('mRelay').textContent      = d.total || 0;
    $('mRelayShown').textContent = (d.items || []).length;

    var cuerpo = $('rowsRelay');
    cuerpo.textContent = '';
    var vacio = !d.items || !d.items.length;
    $('emptyRelay').classList.toggle('hidden', !vacio);

    renderReportRows(cuerpo, d.items || [], true);

    pintarPaginador('R', estado.relay);
  }

  async function copyReport(it) {
    var value = JSON.stringify({ type: it.type, contract: it.contractName, function: it.functionName,
      message: it.message || it.error, file: it.file, line: it.line, scene: it.scene, stack: it.stack,
      occurrences: it.count, lastSeen: it.lastSeen, wallets: it.actors || [], walletCount: it.actorCount,
      historicalReportedPlayer: it.historicalActor || null, sampleTransaction: it.txHash || null }, null, 2);
    try { await navigator.clipboard.writeText(value); if (!cerrado) toast('Error copiado', 'good'); }
    catch (_) {
      if (cerrado) return;
      var dialog = document.createElement('dialog'), area = document.createElement('textarea'), close = document.createElement('button');
      dialog.className = 'report-copy-dialog'; area.readOnly = true; area.value = value; close.textContent = 'Cerrar';
      close.addEventListener('click', function () { dialog.close(); }); dialog.addEventListener('close', function () { dialog.remove(); }, { once: true });
      dialog.append(area, close); document.body.append(dialog); dialog.showModal(); area.focus(); area.select();
    }
  }
  function renderReportRows(host, rows, relay) {
    rows.forEach(function (it) {
      var tr = document.createElement('tr'); tr.className = 'report-row';
      var kind = td(relay ? (it.functionName || 'relay') : (it.type || 'unknown'), 'report-kind');
      var content = document.createElement('td'); content.className = 'msg';
      var main = document.createElement('div'); main.className = 'msg-main'; main.textContent = it.message || it.error || '(sin detalle)';
      var context = document.createElement('div'); context.className = 'msg-sub';
      context.textContent = relay ? (it.contractName || '') : [it.scene, it.file, it.line].filter(Boolean).join(' · ');
      content.append(main, context);
      var details = document.createElement('details'); details.className = 'stack';
      var summary = document.createElement('summary'); summary.textContent = 'Ver detalle y carteras (' + (it.actorCount || 0) + ')';
      var pre = document.createElement('pre'); pre.textContent = [it.message || it.error, it.stack, it.txHash].filter(Boolean).join('\n\n');
      details.append(summary, pre);
      var actors = document.createElement('div'); actors.className = 'report-actors';
      (it.actors || []).forEach(function (actor) {
        var row = document.createElement('div'), who = document.createElement('strong'), wallet = document.createElement('code'), count = document.createElement('span');
        who.textContent = actor.playerName || 'Sin nombre'; wallet.textContent = actor.wallet || 'Sin cartera registrada'; count.textContent = '×' + actor.count;
        row.append(who, wallet, count); actors.append(row);
      });
      if (it.historicalActor) { var legacy = document.createElement('p'); legacy.className = 'muted'; legacy.textContent = 'Nombre comunicado en registros antiguos: ' + it.historicalActor + '. No acredita una cartera autenticada.'; actors.append(legacy); }
      if (it.actorCount > (it.actors || []).length) { var note = document.createElement('p'); note.textContent = 'Se muestran las primeras 20 carteras. Busca una dirección para filtrar sus registros.'; actors.append(note); }
      details.append(actors); content.append(details);
      var number = td('×' + (it.count || 1), 'report-count'), time = td(cuando(it.lastSeen || it.createdAt), 'when'), actions = document.createElement('td'); actions.className = 'report-actions';
      var copy = document.createElement('button'); copy.type = 'button'; copy.className = 'btn-ghost rowbtn'; copy.textContent = 'Copiar error'; copy.addEventListener('click', function () { copyReport(it); }); actions.append(copy);
      if (!relay) { var remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn-ghost rowbtn'; remove.textContent = (it.count || 1) > 1 ? 'Borrar muestra' : 'Borrar'; remove.addEventListener('click', function () { borrarUno(it._id, remove); }); actions.append(remove); }
      tr.append(kind, content, number, time, actions); host.append(tr);
    });
  }
  async function clearRelay() {
    if (!confirm('¿Limpiar toda la lista visible de fallos del relayer? El historial de transacciones y pagos se conserva.')) return;
    $('btnRelayClear').disabled = true;
    try {
      await pedir('/api/admin/relay-failures/clear', { method: 'POST', body: JSON.stringify({ confirm: 'CLEAR' }) });
      estado.relay.skip = 0; await cargarRelay(); toast('Lista limpiada; historial de auditoría conservado.', 'good');
    } catch (e) { toast('No se pudo limpiar: ' + e.message, 'bad'); }
    finally { $('btnRelayClear').disabled = false; }
  }

  // ── Paginación ─────────────────────────────────────────────────────────────

  function pintarPaginador(sufijo, st) {
    var desde = st.total === 0 ? 0 : st.skip + 1;
    var hasta = Math.min(st.skip + POR_PAGINA, st.total);
    $('page' + sufijo).textContent = desde + '–' + hasta + ' of ' + st.total;
    $('prev' + sufijo).disabled = st.skip <= 0;
    $('next' + sufijo).disabled = hasta >= st.total;
  }

  // ── Orquestación ───────────────────────────────────────────────────────────

  async function recargarTodo() {
    var run = ++revisionCarga;
    try {
      if (estado.pestana === 'errors') await cargarErrores();
      else await cargarRelay();
    } catch (e) {
      if (cerrado || run !== revisionCarga) return;
      if (e.status === 401 || e.status === 403) {
        // La sesión caducó mientras el panel estaba abierto.
        $('panel').classList.add('hidden');
        $('gate').classList.remove('hidden');
        aviso('Your session expired. Connect again.', 'err');
      } else {
        toast('Could not load: ' + e.message, 'bad');
      }
    }
  }

  function cambiarPestana(nombre) {
    estado.pestana = nombre;
    document.querySelectorAll('.tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === nombre);
    });
    $('tab-errors').classList.toggle('hidden', nombre !== 'errors');
    $('tab-relay').classList.toggle('hidden', nombre !== 'relay');
    recargarTodo();
  }

  // ── Enganches ──────────────────────────────────────────────────────────────

  function iniciar() {
    $('btnConnect').addEventListener('click', conectar);
    $('btnRefresh').addEventListener('click', recargarTodo);
    $('btnWipe').addEventListener('click', borrarTodos);
    $('btnRelayClear').addEventListener('click', clearRelay);
    $('btnRelaySearch').addEventListener('click', function () { estado.relay.skip = 0; recargarTodo(); });
    $('qRelay').addEventListener('keydown', function (e) { if (e.key === 'Enter') { estado.relay.skip = 0; recargarTodo(); } });
    $('btnSearch').addEventListener('click', function () {
      estado.errores.skip = 0; recargarTodo();
    });
    $('q').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { estado.errores.skip = 0; recargarTodo(); }
    });
    $('fType').addEventListener('change', function () {
      estado.errores.skip = 0; recargarTodo();
    });

    document.querySelectorAll('.tab').forEach(function (b) {
      b.addEventListener('click', function () { cambiarPestana(b.dataset.tab); });
    });

    $('prevE').addEventListener('click', function () {
      estado.errores.skip = Math.max(0, estado.errores.skip - POR_PAGINA); recargarTodo();
    });
    $('nextE').addEventListener('click', function () {
      estado.errores.skip += POR_PAGINA; recargarTodo();
    });
    $('prevR').addEventListener('click', function () {
      estado.relay.skip = Math.max(0, estado.relay.skip - POR_PAGINA); recargarTodo();
    });
    $('nextR').addEventListener('click', function () {
      estado.relay.skip += POR_PAGINA; recargarTodo();
    });

    // Si ya había sesión de admin (por ejemplo se venía de admin.html), se
    // entra directo sin pedir firma otra vez.
    comprobarSesion();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
  var unsubscribeSession = window.GFAdminSession?.subscribe(function(){
    revisionErrores++;revisionRelay++;revisionCarga++;estado.admin=null;
    $('rowsErrors').replaceChildren();$('rowsRelay').replaceChildren();
    $('panel').classList.add('hidden');$('gate').classList.remove('hidden');
  });
  window.addEventListener('pagehide', function (e) {
    if (e.persisted) return;
    cerrado = true; clearTimeout(toastTimer); if(unsubscribeSession)unsubscribeSession();
    peticiones.forEach(function (ctl) { ctl.abort(); }); peticiones.clear();
  });
})();
