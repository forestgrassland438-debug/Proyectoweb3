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
    return m ? decodeURIComponent(m[1]) : null;
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
  function pedir(ruta, opciones) {
    opciones = opciones || {};
    opciones.credentials = 'include';
    opciones.mode = 'cors';
    var csrf = leerCookie('csrf-token');
    opciones.headers = Object.assign(
      { 'Content-Type': 'application/json' },
      csrf ? { 'X-CSRF-Token': csrf } : {},
      opciones.headers || {}
    );
    return fetch(api(ruta), opciones).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) {
          var e = new Error(d.message || d.error || ('HTTP ' + r.status));
          e.status = r.status;
          throw e;
        }
        return d;
      });
    });
  }

  // ── Entrada con la cartera ─────────────────────────────────────────────────

  function proveedor() { return window.ethereum || null; }

  function b64(s) {
    return btoa(unescape(encodeURIComponent(s)));
  }

  async function pedirCsrf() {
    try { await fetch(api('/api/auth/csrf-token'), { credentials: 'include', mode: 'cors' }); }
    catch (e) { /* si falla, el login lo reintenta sin cabecera */ }
  }

  async function conectar() {
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
      var nr = await fetch(api('/api/auth/nonce?address=' + encodeURIComponent(cuenta.toLowerCase())),
                           { credentials: 'include', mode: 'cors' });
      if (!nr.ok) throw new Error('Could not get a nonce from the server');
      var nonce = (await nr.json()).nonce;

      var token = nonce + ':' + Math.floor(Date.now() / 1000);
      var mensaje = 'Signing in to ' + APP_NAME + ': ' + b64(token);

      aviso('Sign the message in your wallet…');
      var firma = await prov.request({ method: 'personal_sign', params: [mensaje, cuenta] });

      var cabeceras = { 'Content-Type': 'application/json' };
      var csrf = leerCookie('csrf-token');
      if (csrf) cabeceras['X-CSRF-Token'] = csrf;

      aviso('Verifying…');
      var lr = await fetch(api('/api/auth/login'), {
        method: 'POST', credentials: 'include', mode: 'cors', headers: cabeceras,
        body: JSON.stringify({
          address: cuenta.toLowerCase(), signature: firma, token: token, message: mensaje
        })
      });
      if (!lr.ok) {
        var cuerpo = {}; try { cuerpo = await lr.json(); } catch (e) {}
        throw new Error(cuerpo.message || cuerpo.error || 'Sign-in failed');
      }

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
    var q = $('q').value.trim();
    var t = $('fType').value;
    var ruta = '/api/admin/client-errors?limit=' + POR_PAGINA + '&skip=' + estado.errores.skip +
               (q ? '&q=' + encodeURIComponent(q) : '') +
               (t ? '&type=' + encodeURIComponent(t) : '');

    var d = await pedir(ruta);
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

    (d.items || []).forEach(function (it) {
      var tr = document.createElement('tr');

      var tdTipo = document.createElement('td');
      var pill = document.createElement('span');
      pill.className = 'pill'; pill.textContent = it.type || 'unknown';
      tdTipo.appendChild(pill);
      tr.appendChild(tdTipo);

      // Mensaje + origen + traza plegable
      var tdMsg = document.createElement('td');
      tdMsg.className = 'msg';
      var main = document.createElement('div');
      main.className = 'msg-main'; main.textContent = it.message || '(no message)';
      tdMsg.appendChild(main);

      var origen = [it.file, it.line].filter(function (x) { return x && x !== 'unknown'; }).join(':');
      if (origen) {
        var sub = document.createElement('div');
        sub.className = 'msg-sub'; sub.textContent = origen;
        tdMsg.appendChild(sub);
      }
      if (it.stack) {
        var det = document.createElement('details');
        det.className = 'stack';
        var sum = document.createElement('summary'); sum.textContent = 'Stack trace';
        var pre = document.createElement('pre'); pre.textContent = it.stack;
        det.appendChild(sum); det.appendChild(pre);
        tdMsg.appendChild(det);
      }
      tr.appendChild(tdMsg);

      tr.appendChild(td(it.scene || '—'));

      var tdC = document.createElement('td');
      var pc = document.createElement('span');
      var n = it.count || 1;
      pc.className = 'pill count' + (n >= 10 ? ' hot' : '');
      pc.textContent = '×' + n;
      tdC.appendChild(pc);
      tr.appendChild(tdC);

      tr.appendChild(td(cuando(it.lastSeen || it.timestamp), 'when'));

      var tdB = document.createElement('td');
      var b = document.createElement('button');
      b.className = 'btn-ghost rowbtn'; b.textContent = 'Delete';
      b.addEventListener('click', function () { borrarUno(it._id, b); });
      tdB.appendChild(b);
      tr.appendChild(tdB);

      cuerpo.appendChild(tr);
    });

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
    var d = await pedir('/api/admin/relay-failures?limit=' + POR_PAGINA + '&skip=' + estado.relay.skip);
    estado.relay.total = d.total || 0;

    $('mRelay').textContent      = d.total || 0;
    $('mRelayShown').textContent = (d.items || []).length;

    var cuerpo = $('rowsRelay');
    cuerpo.textContent = '';
    var vacio = !d.items || !d.items.length;
    $('emptyRelay').classList.toggle('hidden', !vacio);

    (d.items || []).forEach(function (it) {
      var tr = document.createElement('tr');
      tr.appendChild(td(it.playerName || '—'));
      tr.appendChild(td((it.contractName || '?') + ' · ' + (it.functionName || '?')));

      var tdE = document.createElement('td');
      tdE.className = 'msg';
      var m = document.createElement('div');
      m.className = 'msg-main'; m.textContent = it.error || '(no detail)';
      tdE.appendChild(m);
      if (it.txHash) {
        var h = document.createElement('div');
        h.className = 'msg-sub'; h.textContent = it.txHash;
        tdE.appendChild(h);
      }
      tr.appendChild(tdE);

      tr.appendChild(td(it.retryCount || 0));
      tr.appendChild(td(cuando(it.createdAt), 'when'));
      cuerpo.appendChild(tr);
    });

    pintarPaginador('R', estado.relay);
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
    try {
      if (estado.pestana === 'errors') await cargarErrores();
      else await cargarRelay();
    } catch (e) {
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
})();
