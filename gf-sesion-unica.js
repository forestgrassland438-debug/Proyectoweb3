/* ===========================================================================
 * UNA SOLA PARTIDA POR CUENTA                                      (2026-10-10)
 *
 * Lo que pidió el jugador: "no permitas que un usuario abra dos pestañas e
 * inicie sesión en el mismo o en otros navegadores con la misma cuenta, ni
 * en PC ni en teléfonos, ni por MetaMask ni por Google".
 *
 * CÓMO FUNCIONA
 *   Cada pestaña que carga el juego se inventa un identificador de partida
 *   (en memoria: ni sessionStorage, que se copia al DUPLICAR la pestaña, ni
 *   localStorage, que comparten todas). Viaja en el saludo del socket
 *   (`auth.sesion`). El servidor (server2.js, "UNA SOLA PARTIDA POR CUENTA")
 *   guarda cuál es la partida de cada cartera: si llega otra, LA NUEVA
 *   MANDA y a la vieja le dice `sesion:reemplazada` y la desconecta.
 *
 *   La que queda fuera se para: cortina encima, juego dormido, sonido
 *   apagado y socket sin reconexión (si no, sus reintentos volverían a
 *   echar a la otra y se pelearían). "Play here" recarga la página: es una
 *   partida nueva, y entonces la que se queda fuera es la otra.
 *
 *   Da igual cómo se entró (MetaMask, Google, PC o teléfono): manda la
 *   cartera, que es la cuenta.
 *
 * LAS PETICIONES HTTP
 *   Cuando el servidor contesta `sesion:aceptada` con `cabecera: true`, las
 *   peticiones a /api/ llevan además `X-GF-Sesion`, y el servidor rechaza
 *   (409) las de una partida reemplazada: una pestaña vieja no puede
 *   guardar encima de la buena. Solo se manda si el servidor la anuncia: un
 *   servidor viejo no la admite en su CORS y rompería todas las peticiones.
 *
 * SE ENGANCHA SOLO
 *   Envuelve `window.io` (el cliente de Socket.IO), así que vale para el
 *   socket de GameScene y el de la tienda sin tocar sus initSocket. Va justo
 *   después de vendor/socket.io.min.js en index.html.
 * ======================================================================== */
(function () {
  'use strict';

  function nuevoId() {
    try { if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID().replace(/-/g, ''); } catch (e) {}
    var s = '';
    for (var i = 0; i < 4; i++) s += Math.floor(Math.random() * 0x100000000).toString(16);
    return s + Date.now().toString(16);
  }

  var SESION = nuevoId();
  var cabecera = false;            // el servidor la admite (ver arriba)
  var reemplazada = false;
  var sockets = [];                // los sockets de esta pestaña (normalmente uno)

  function log() {
    try { console.log.apply(console, ['[sesion]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  // ─────────────────────────────────────────────────────────── LA CORTINA
  function cortina(info) {
    if (document.getElementById('gf-sesion-cortina')) return;
    var d = document.createElement('div');
    d.id = 'gf-sesion-cortina';
    d.setAttribute('role', 'alertdialog');
    d.setAttribute('aria-modal', 'true');
    d.setAttribute('aria-labelledby', 'gf-sesion-titulo');
    d.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483000', 'display:flex',
      'align-items:center', 'justify-content:center', 'padding:16px',
      'background:rgba(8,12,10,.86)', 'backdrop-filter:blur(3px)',
      '-webkit-backdrop-filter:blur(3px)', 'font-family:inherit'
    ].join(';');

    var c = document.createElement('div');
    c.style.cssText = [
      'max-width:420px', 'width:100%', 'box-sizing:border-box', 'padding:22px 20px 18px',
      'border-radius:14px', 'background:linear-gradient(180deg,#2b2418,#1d1810)',
      'border:2px solid #c9a35a', 'box-shadow:0 10px 40px rgba(0,0,0,.6)',
      'color:#f3e6c8', 'text-align:center', 'line-height:1.45'
    ].join(';');

    var t = document.createElement('div');
    t.id = 'gf-sesion-titulo';
    t.textContent = '⚔️ Playing somewhere else';
    t.style.cssText = 'font-size:20px;font-weight:700;color:#ffd98a;margin-bottom:10px';

    var p = document.createElement('div');
    p.textContent = 'This account was just opened in another tab or device' +
                    (info && info.dispositivo ? ' (' + info.dispositivo + ')' : '') +
                    '. Only one game session per account is allowed, so this one has been paused.';
    p.style.cssText = 'font-size:14px;margin-bottom:16px';

    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Play here';
    b.style.cssText = [
      'cursor:pointer', 'font:inherit', 'font-size:15px', 'font-weight:700',
      'padding:10px 22px', 'border-radius:10px', 'border:2px solid #ffe2a0',
      'background:linear-gradient(180deg,#e7b84f,#b8862d)', 'color:#2a1c05'
    ].join(';');
    b.addEventListener('click', function () {
      b.disabled = true;
      b.textContent = 'Loading…';
      try { window.location.reload(); } catch (e) {}
    });

    var n = document.createElement('div');
    n.textContent = 'Playing here will pause the other session.';
    n.style.cssText = 'font-size:12px;opacity:.7;margin-top:10px';

    c.appendChild(t); c.appendChild(p); c.appendChild(b); c.appendChild(n);
    d.appendChild(c);
    // Que nada de debajo reciba teclas ni toques.
    ['keydown', 'keyup', 'pointerdown', 'touchstart', 'wheel'].forEach(function (ev) {
      d.addEventListener(ev, function (e) { if (e.target !== b) e.stopPropagation(); }, true);
    });
    (document.body || document.documentElement).appendChild(d);
    try { b.focus(); } catch (e) {}
  }

  // ─────────────────────────────────────────────────────────── PARAR ESTA
  function apagarSocket(s) {
    try { if (s.io && typeof s.io.reconnection === 'function') s.io.reconnection(false); } catch (e) {}
    // Ni el vigilante de GameScene ni el 'io server disconnect' la levantan.
    try { s.connect = s.open = function () { return s; }; } catch (e) {}
    try { s.disconnect(); } catch (e) {}
  }

  function bloquear(info) {
    if (reemplazada) return;
    reemplazada = true;
    window.__gfSesionReemplazada = true;
    log('esta partida queda fuera: la cuenta se abrió en otro sitio');
    sockets.forEach(apagarSocket);
    try {
      var g = window.game;
      if (g) {
        if (g.sound) g.sound.mute = true;
        if (g.loop && typeof g.loop.sleep === 'function') g.loop.sleep();
      }
    } catch (e) {}
    if (document.body) cortina(info);
    else document.addEventListener('DOMContentLoaded', function () { cortina(info); });
  }

  // ─────────────────────────────────────────────────────────── EL SOCKET
  function enganchar(s) {
    if (!s || s.__gfSesion) return s;
    s.__gfSesion = true;
    sockets.push(s);
    if (sockets.length > 8) sockets = sockets.filter(function (x) { return x && (x.connected || x.active); });
    try {
      s.on('sesion:aceptada', function (d) {
        cabecera = !!(d && d.cabecera);
      });
      s.on('sesion:reemplazada', function (d) { bloquear(d || {}); });
    } catch (e) {}
    if (reemplazada) apagarSocket(s);
    return s;
  }

  function conSesion(opts) {
    opts = opts || {};
    var a = opts.auth;
    if (typeof a === 'function') {
      opts.auth = function (cb) {
        a(function (datos) {
          datos = datos || {};
          datos.sesion = SESION;
          cb(datos);
        });
      };
    } else {
      var o = {};
      if (a && typeof a === 'object') for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k];
      o.sesion = SESION;
      opts.auth = o;
    }
    if (reemplazada) opts.autoConnect = false;
    return opts;
  }

  function envolverIo() {
    var original = window.io;
    if (typeof original !== 'function' || original.__gfSesion) return !!(original && original.__gfSesion);
    var envuelto = function (uri, opts) {
      // io(opts) sin uri también existe.
      if (uri && typeof uri === 'object' && opts === undefined) return enganchar(original(conSesion(uri)));
      return enganchar(original(uri, conSesion(opts)));
    };
    for (var k in original) if (Object.prototype.hasOwnProperty.call(original, k)) envuelto[k] = original[k];
    envuelto.__gfSesion = true;
    window.io = envuelto;
    if (window.globalSocket) enganchar(window.globalSocket);
    return true;
  }

  if (!envolverIo()) {
    // El cliente de Socket.IO aún no está (o no se ha cargado): se reintenta.
    document.addEventListener('DOMContentLoaded', envolverIo);
  }

  // ─────────────────────────────────────────────────────────── EL FETCH
  var fetchOriginal = window.fetch ? window.fetch.bind(window) : null;
  if (fetchOriginal) {
    window.fetch = function (entrada, init) {
      var url = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || '';
      var esApi = false;
      try { esApi = new URL(url, location.href).pathname.indexOf('/api/') === 0; } catch (e) {}
      if (esApi && cabecera && typeof entrada === 'string') {
        init = init ? Object.assign({}, init) : {};
        var h = new Headers(init.headers || {});
        h.set('X-GF-Sesion', SESION);
        init.headers = h;
      }
      var p = fetchOriginal(entrada, init);
      if (!esApi) return p;
      return p.then(function (r) {
        if (r && r.status === 409) {
          r.clone().json().then(function (d) {
            if (d && d.error === 'sesion_reemplazada') bloquear(d);
          }).catch(function () {});
        }
        return r;
      });
    };
  }

  window.GFSesionUnica = {
    id: function () { return SESION; },
    reemplazada: function () { return reemplazada; },
    _bloquear: bloquear,
    _enganchar: enganchar
  };
})();
