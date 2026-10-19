/* ===========================================================================
 * LA COLA DE LA CADENA: RECOGER Y SOLTAR SIN ESPERAR               (2026-10-19)
 *
 * "Cuando mato un monstruo suelta objetos y, al pasar por encima, tarda mucho
 * en tomarlos: quiero que los tome y que las transacciones se hagan en cola.
 * Y cuando quiero soltar un objeto tarda mucho: quiero soltar varios y que se
 * hagan en cola, en todos los mapas."
 *
 * Antes cada montón esperaba a la cadena (acuñar o quemar: segundos) antes de
 * desaparecer o de dejar soltar el siguiente. Ahora el servidor (server2.js,
 * `_ticketSuelo`) contesta YA cuando recibe un ticket y hace la transacción en
 * la cola del jugador; el resultado llega por el socket con ese ticket:
 *
 *   suelo:acunado / suelo:fallido          recoger del suelo (gf-salvaje.js)
 *   suelo:soltado / suelo:soltar_fallido   soltar en el suelo (gf-salvaje.js)
 *   botin:acunado / botin:fallido          el botín de un monstruo
 *                                          (gf-mina-serpiente.js, que lo
 *                                          presta a la mina y a los mapas
 *                                          salvajes)
 *
 * Este módulo guarda lo pendiente, ata esos avisos UNA vez por pestaña (no por
 * escena: si te vas del mapa a mitad, lo que termine llega a la bolsa de la
 * escena en la que estés) y enseña encima de la barra rápida cuántas
 * transacciones quedan en cola. Lo que se queda sin noticias (socket caído) se
 * repasa con la cadena a los dos minutos.
 *
 *   GFColaCadena.ticket()                    → un ticket nuevo
 *   GFColaCadena.esperar(ticket, { alOk(d, escena), alFallo(d, escena),
 *                                  alCaducar(escena) })
 *   GFColaCadena.escena()                    → la escena con bolsa ahora
 *   GFColaCadena.cuantas()                   → transacciones en cola
 * ======================================================================== */
(function () {
  'use strict';

  var EVENTOS = {
    'suelo:acunado': true, 'suelo:fallido': false,
    'suelo:soltado': true, 'suelo:soltar_fallido': false,
    'botin:acunado': true, 'botin:fallido': false
  };
  var ESPERA_MAX_MS = 120000;
  var PEND = {};
  var HUERFANOS = {};              // un aviso que llegó antes que la respuesta
  var socketAtado = null, oyentes = null;

  function ticket() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  /** La escena que tiene la bolsa ahora mismo (la de juego activa). */
  function escena() {
    var a = window.activeScene;
    try { if (a && a.STATE && a.sys && a.sys.isActive && a.sys.isActive()) return a; } catch (e) {}
    try {
      var l = window.game && window.game.scene ? window.game.scene.getScenes(true) : [];
      for (var i = 0; i < l.length; i++) if (l[i] && l[i].STATE) return l[i];
    } catch (e) {}
    return null;
  }

  function cuantas() { return Object.keys(PEND).length; }

  /** "⛓ 3 transactions in queue", encima de la barra rápida (sin tapar nada). */
  function pintar() {
    var n = cuantas();
    var el = document.getElementById('gf-cola-cadena');
    if (!n) { if (el) el.style.display = 'none'; return; }
    if (!el) {
      var barra = document.getElementById('quick-slots-bar');
      if (!barra) return;
      el = document.createElement('div');
      el.id = 'gf-cola-cadena';
      el.setAttribute('role', 'status');
      el.style.cssText = 'position:absolute;left:50%;bottom:calc(100% + 6px);transform:translateX(-50%);pointer-events:none;' +
        'padding:2px 10px;border-radius:10px;background:rgba(18,24,30,.88);border:1px solid rgba(160,200,255,.55);' +
        'color:#e8f1ff;font:600 11px/16px system-ui,sans-serif;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.35)';
      barra.appendChild(el);
    }
    el.style.display = '';
    el.textContent = '⛓ ' + n + (n === 1 ? ' transaction' : ' transactions') + ' in queue';
    el.title = 'Items waiting for the blockchain. You can keep playing.';
  }

  function resolver(evento, d) {
    if (!d || !d.ticket) return;
    var p = PEND[d.ticket];
    if (!p) { HUERFANOS[d.ticket] = { evento: evento, d: d, t: Date.now() }; return; }
    delete PEND[d.ticket];
    pintar();
    var sc = escena();
    try { (EVENTOS[evento] ? p.alOk : p.alFallo)(d, sc); }
    catch (e) { console.warn('[cola] ' + evento + ':', e); }
  }

  function atar() {
    var sock = window.globalSocket || null;
    if (!sock || !sock.on || sock === socketAtado) return;
    if (socketAtado && oyentes) {
      Object.keys(oyentes).forEach(function (ev) { try { socketAtado.off(ev, oyentes[ev]); } catch (e) {} });
    }
    socketAtado = sock;
    oyentes = {};
    Object.keys(EVENTOS).forEach(function (ev) {
      oyentes[ev] = function (d) { resolver(ev, d); };
      sock.on(ev, oyentes[ev]);
    });
  }

  /** Apunta una transacción en cola. `p.alOk` y `p.alFallo` reciben (datos, escena). */
  function esperar(t, p) {
    atar();
    p = p || {};
    p.alOk = p.alOk || function () {};
    p.alFallo = p.alFallo || function () {};
    p.t = Date.now();
    PEND[t] = p;
    pintar();
    var h = HUERFANOS[t];
    if (h) { delete HUERFANOS[t]; resolver(h.evento, h.d); }
  }

  /** Lo que pasó de la espera sin noticias: que lo arregle quien lo apuntó, y la bolsa, con la cadena. */
  function vigilar() {
    atar();
    var ahora = Date.now(), alguno = false;
    Object.keys(PEND).forEach(function (t) {
      var p = PEND[t];
      if (ahora - p.t < (p.esperaMs || ESPERA_MAX_MS)) return;
      delete PEND[t];
      alguno = true;
      try { if (p.alCaducar) p.alCaducar(escena()); } catch (e) {}
    });
    Object.keys(HUERFANOS).forEach(function (t) { if (ahora - HUERFANOS[t].t > 30000) delete HUERFANOS[t]; });
    if (alguno) {
      pintar();
      var sc = escena();
      try { if (sc && typeof sc._sincronizarInventarioConLaCadena === 'function') sc._sincronizarInventarioConLaCadena(); } catch (e) {}
    }
  }
  setInterval(vigilar, 1000);

  /** Acorta la espera de una transacción (p. ej. si la petición se cortó). */
  function caducarEn(t, ms) {
    var p = PEND[t];
    if (p) { p.esperaMs = Math.max(0, Date.now() - p.t) + ms; }
  }

  window.GFColaCadena = { ticket: ticket, esperar: esperar, escena: escena, cuantas: cuantas, caducarEn: caducarEn,
                          _interno: { PEND: PEND, resolver: resolver, pintar: pintar } };
})();
