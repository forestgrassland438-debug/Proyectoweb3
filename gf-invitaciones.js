/* ===========================================================================
 * LAS INVITACIONES (pestaña "Invites" del dashboard)               (2026-10-11)
 *
 * "Un sistema de invitación por el dashboard con todo lo que pedí": el enlace
 * y el código para invitar, la wallet de quien invita (la tuya, y la de quien
 * te invitó), los totales (invitados y activos) y un campo para el usuario de
 * Discord. Las reglas las pone el servidor (/api/invitaciones/*, ver
 * "LAS INVITACIONES Y LA ACTIVIDAD DE CADA JUGADOR" en server2.js).
 *
 * EL ENLACE: el juego con `?ref=CÓDIGO`. Al abrirlo, esto guarda el código
 * (localStorage `gf_ref`) ANTES de que el login se lleve al jugador, y lo
 * reclama solo en cuanto hay partida. Se quita de la barra de direcciones
 * para que nadie comparta sin querer el código de otro.
 *
 * Y una cosa más, para el panel del administrador: mientras el panel de la
 * tienda está abierto, cada 30 s se avisa al servidor ('actividad:tienda').
 *
 * Todo lo que se pinta va por textContent: nombres y Discord de otros
 * jugadores nunca pasan por innerHTML.
 * ======================================================================== */
(function () {
  'use strict';

  var CLAVE_REF = 'gf_ref';
  var CODIGO_RE = /^[A-HJ-NP-Z2-9]{8}$/;

  // ── 1. El código del enlace, nada más cargar ─────────────────────────────
  (function capturar() {
    try {
      var m = /[?&]ref=([A-Za-z0-9]{8})(?:[&#]|$)/.exec(location.search);
      if (!m) return;
      var c = m[1].toUpperCase();
      if (CODIGO_RE.test(c)) localStorage.setItem(CLAVE_REF, c);
      var u = new URL(location.href);
      u.searchParams.delete('ref');
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    } catch (e) { /* sin localStorage: se podrá escribir a mano */ }
  })();

  function api(ruta, cuerpo) {
    if (window.GFMascota && window.GFMascota.api) return window.GFMascota.api(ruta, cuerpo);
    return Promise.resolve({ ok: false, status: 0, datos: null });
  }
  function escenaConJugador() {
    var g = window.game;
    if (!g || !g.scene || !g.scene.getScenes) return null;
    var l = g.scene.getScenes(true) || [];
    for (var i = 0; i < l.length; i++) if (l[i] && l[i].playerName && l[i].player) return l[i];
    return null;
  }
  function aviso(texto, tipo) {
    var s = escenaConJugador();
    try { if (s && s.notifications && s.notifications.show) { s.notifications.show(texto, tipo || 'info'); return; } } catch (e) {}
  }
  function corto(w) { w = String(w || ''); return w.length > 12 ? w.slice(0, 6) + '…' + w.slice(-4) : (w || '—'); }
  function fecha(v) {
    if (!v) return '';
    var d = new Date(v);
    return isNaN(d) ? '' : d.toLocaleDateString();
  }
  function el(tag, clase, texto) {
    var e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto !== undefined && texto !== null) e.textContent = String(texto);
    return e;
  }
  function copiar(texto, boton) {
    var hecho = function () {
      var antes = boton.textContent;
      boton.textContent = 'Copied!';
      setTimeout(function () { boton.textContent = antes; }, 1400);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(hecho, function () { aviso('Could not copy. Select it and copy by hand.', 'warning'); });
        return;
      }
    } catch (e) {}
    var t = document.createElement('textarea');
    t.value = texto; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); hecho(); } catch (e) { aviso('Could not copy. Select it and copy by hand.', 'warning'); }
    t.remove();
  }
  function enlaceDe(codigo) {
    return location.origin + location.pathname + '?ref=' + encodeURIComponent(codigo);
  }

  // ── 2. Reclamar el código guardado, cuando haya partida ──────────────────
  var reclamado = false, intentosReclamo = 0, relojReclamo = null;
  function reclamarPendiente() {
    var c;
    try { c = localStorage.getItem(CLAVE_REF); } catch (e) { c = null; }
    if (!c || reclamado) { parar(); return; }
    if (!escenaConJugador()) return;                  // todavía en el login o cargando
    if (++intentosReclamo > 5) { parar(); return; }
    reclamado = true;
    api('/api/invitaciones/reclamar', { codigo: c }).then(function (r) {
      var d = (r && r.datos) || {};
      if (r && r.ok && d.ok) {
        try { localStorage.removeItem(CLAVE_REF); } catch (e) {}
        aviso('🎟️ You joined with ' + (d.invitadoPor && d.invitadoPor.nombre || 'a friend') + "'s invite!", 'success');
        datos = null;
        parar();
        return;
      }
      // Lo que no se arreglará reintentando: se olvida el código.
      if (['ya_invitado', 'propio', 'tarde', 'codigo_desconocido', 'codigo_invalido', 'circular'].indexOf(d.error) >= 0) {
        try { localStorage.removeItem(CLAVE_REF); } catch (e) {}
        parar();
        return;
      }
      reclamado = false;                               // la red: otra vez en un rato
    }).catch(function () { reclamado = false; });
  }
  function parar() { if (relojReclamo) { clearInterval(relojReclamo); relojReclamo = null; } }
  relojReclamo = setInterval(reclamarPendiente, 4000);
  setTimeout(parar, 5 * 60 * 1000);                    // como mucho cinco minutos

  // ── 3. La pestaña ────────────────────────────────────────────────────────
  var datos = null, cargando = false;

  function cuerpo() { return document.getElementById('gfi-cuerpo'); }

  function cargar() {
    var c = cuerpo();
    if (!c || cargando) return;
    cargando = true;
    if (!datos) { c.textContent = ''; c.appendChild(tarjeta(el('div', 'muted', 'Loading invites…'))); }
    api('/api/invitaciones/mia').then(function (r) {
      cargando = false;
      var d = r && r.datos;
      if (!r || !r.ok || !d || !d.ok) {
        c.textContent = '';
        c.appendChild(tarjeta(el('div', 'muted', 'Could not load your invites. Try again in a moment.')));
        return;
      }
      datos = d;
      pintar();
    }).catch(function () {
      cargando = false;
      c.textContent = '';
      c.appendChild(tarjeta(el('div', 'muted', 'Could not load your invites. Try again in a moment.')));
    });
  }

  function tarjeta() {
    var t = el('div', 'hub-row_101 dash-card_101 gfi-tarjeta');
    for (var i = 0; i < arguments.length; i++) if (arguments[i]) t.appendChild(arguments[i]);
    return t;
  }
  function fila() {
    var f = el('div', 'dash-input-row_101');
    for (var i = 0; i < arguments.length; i++) if (arguments[i]) f.appendChild(arguments[i]);
    return f;
  }
  function boton(texto, fn, principal) {
    var b = el('button', principal === false ? 'btn-ghost dash-apply_101' : 'btn-primary dash-apply_101', texto);
    b.type = 'button';
    b.addEventListener('click', function (e) { e.preventDefault(); fn(b); });
    return b;
  }
  function campo(valor, lectura, aria, placeholder) {
    var i = document.createElement('input');
    i.type = 'text';
    i.value = valor || '';
    i.autocomplete = 'off';
    if (lectura) { i.readOnly = true; i.addEventListener('focus', function () { i.select(); }); }
    if (aria) i.setAttribute('aria-label', aria);
    if (placeholder) i.placeholder = placeholder;
    return i;
  }

  function pintar() {
    var c = cuerpo();
    if (!c || !datos) return;
    var d = datos;
    c.textContent = '';

    // El enlace y el código.
    var enlace = enlaceDe(d.codigo);
    var inEnlace = campo(enlace, true, 'Your invite link');
    inEnlace.className = 'gfi-enlace';
    var codigoBonito = d.codigo.slice(0, 4) + '-' + d.codigo.slice(4);
    c.appendChild(tarjeta(
      el('label', 'hub-label_101', '🎟️ Your invite link'),
      fila(inEnlace, boton('Copy link', function (b) { copiar(enlace, b); })),
      fila(el('div', 'gfi-codigo', codigoBonito), boton('Copy code', function (b) { copiar(d.codigo, b); }, false)),
      el('div', 'dash-hint_101', 'Share the link (or the code). New players have ' + d.diasParaReclamar +
         ' days to enter a code after they start playing.')
    ));

    // La wallet de quien invita: la tuya.
    c.appendChild(tarjeta(
      el('div', 'hub-label_101', '👛 Inviter wallet (yours)'),
      fila(el('div', 'gfi-wallet', corto(d.wallet)), boton('Copy', function (b) { copiar(d.wallet, b); }, false)),
      el('div', 'dash-hint_101', 'Everyone who joins with your invite is linked to this wallet.')
    ));

    // Quién te invitó, o el campo para escribir un código.
    if (d.invitadoPor) {
      c.appendChild(tarjeta(
        el('div', 'hub-label_101', '🤝 Invited by'),
        el('div', 'gfi-nombre', d.invitadoPor.nombre),
        fila(el('div', 'gfi-wallet', 'Wallet: ' + corto(d.invitadoPor.wallet)),
             d.invitadoPor.wallet ? boton('Copy', function (b) { copiar(d.invitadoPor.wallet, b); }, false) : null),
        d.invitadoPor.desde ? el('div', 'dash-hint_101', 'Since ' + fecha(d.invitadoPor.desde)) : null
      ));
    } else if (d.puedeReclamar) {
      var inCodigo = campo('', false, 'Invite code', 'ABCD-2345');
      inCodigo.maxLength = 9;
      var msg = el('div', 'dash-hint_101', 'Did a friend invite you? Enter their code.');
      var aplicar = function (b) {
        var cod = inCodigo.value.replace(/[\s-]/g, '').toUpperCase();
        if (!CODIGO_RE.test(cod)) { msg.textContent = 'That code is not valid: 8 letters and numbers.'; return; }
        b.disabled = true;
        api('/api/invitaciones/reclamar', { codigo: cod }).then(function (r) {
          b.disabled = false;
          var x = (r && r.datos) || {};
          if (r && r.ok && x.ok) {
            try { localStorage.removeItem(CLAVE_REF); } catch (e) {}
            aviso('🎟️ You joined with ' + (x.invitadoPor && x.invitadoPor.nombre || 'a friend') + "'s invite!", 'success');
            cargar();
          } else {
            msg.textContent = x.message || 'Could not use that code.';
          }
        }).catch(function () { b.disabled = false; msg.textContent = 'Connection problem. Try again.'; });
      };
      inCodigo.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); aplicar(btn); } });
      var btn = boton('Apply', aplicar);
      c.appendChild(tarjeta(el('label', 'hub-label_101', '🤝 Invited by'), fila(inCodigo, btn), msg));
    } else {
      c.appendChild(tarjeta(el('div', 'hub-label_101', '🤝 Invited by'),
        el('div', 'muted', 'You did not join with an invite.')));
    }

    // Los totales y la lista.
    var totales = el('div', 'gfi-totales');
    var caja = function (n, t) { var b = el('div', 'gfi-total'); b.appendChild(el('strong', '', n)); b.appendChild(el('span', '', t)); return b; };
    totales.appendChild(caja(d.total, 'Invited'));
    totales.appendChild(caja(d.activos, 'Active (30+ min)'));
    var lista = el('div', 'gfi-lista');
    if (!d.invitados.length) lista.appendChild(el('div', 'muted', 'Nobody has joined with your invite yet.'));
    d.invitados.forEach(function (j) {
      var f = el('div', 'gfi-invitado' + (j.activo ? ' activo' : ''));
      f.appendChild(el('span', 'gfi-inv-nombre', j.nombre));
      f.appendChild(el('span', 'gfi-inv-dato', 'Lv. ' + j.nivel));
      f.appendChild(el('span', 'gfi-inv-dato', j.horas + ' h'));
      f.appendChild(el('span', 'gfi-inv-dato', fecha(j.desde)));
      lista.appendChild(f);
    });
    c.appendChild(tarjeta(el('div', 'hub-label_101', '📊 Your invites'), totales, lista));

    // Discord.
    var inDiscord = campo(d.discord, false, 'Discord username', 'your_discord_name');
    inDiscord.maxLength = 40;
    var msgD = el('div', 'dash-hint_101', 'So we can find you on our Discord (rewards, events).');
    var guardar = function (b) {
      var v = inDiscord.value.trim().replace(/^@/, '');
      b.disabled = true;
      api('/api/invitaciones/discord', { discord: v }).then(function (r) {
        b.disabled = false;
        var x = (r && r.datos) || {};
        if (r && r.ok && x.ok) { d.discord = x.discord; msgD.textContent = v ? 'Saved.' : 'Removed.'; }
        else msgD.textContent = x.message || 'Could not save it.';
      }).catch(function () { b.disabled = false; msgD.textContent = 'Connection problem. Try again.'; });
    };
    var btnD = boton('Save', guardar);
    inDiscord.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); guardar(btnD); } });
    c.appendChild(tarjeta(el('label', 'hub-label_101', '💬 Discord username'), fila(inDiscord, btnD), msgD));
  }

  function enganchar() {
    var tab = document.querySelector('.hub-cat_101[data-cat="invites"]');
    if (!tab || tab._gfi) return !!tab;
    tab._gfi = true;
    tab.addEventListener('click', function () { cargar(); });
    return true;
  }
  var intentos = 0;
  var relojTab = setInterval(function () { if (enganchar() || ++intentos > 60) clearInterval(relojTab); }, 500);

  // ── 4. El panel de la tienda abierto (para el admin) ─────────────────────
  setInterval(function () {
    var t = document.getElementById('tienda-hub');
    if (!t || t.classList.contains('tienda-hub-hidden') || document.hidden) return;
    var s = window.globalSocket;
    if (s && s.connected) { try { s.emit('actividad:tienda'); } catch (e) {} }
  }, 30000);

  window.GFInvitaciones = { cargar: cargar, _interno: { enlaceDe: enlaceDe, CODIGO_RE: CODIGO_RE } };
})();
