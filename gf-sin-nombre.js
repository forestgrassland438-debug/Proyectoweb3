/* ===========================================================================
 * gf-sin-nombre.js — SIN NOMBRE NO HAY BOTÍN, TIENDAS NI BATALLAS  (2026-10-19)
 * ===========================================================================
 *
 * "A los usuarios que no tengan nombre puesto aún niégales recibir drops de
 * cualquier cosa, persona o monstruo, y el acceso a las dos tiendas del juego,
 * a batallar, pescar, sembrar y hacer misiones."
 *
 * Quien manda es el SERVIDOR (server2.js: gfExigeNombre / gfSocketConNombre /
 * el botín de /api/monstruos/derrotado). Esto es la otra mitad, la del juego:
 *
 *   · se pregunta ANTES de hacer nada que cueste algo (la siembra quema la
 *     semilla en la cadena antes de hablar con el servidor: sin esta parada,
 *     un jugador sin nombre perdería la semilla);
 *   · se dice con claras qué falta: "Choose your character name first…";
 *   · y si el servidor contesta `name_required` (403) a cualquier llamada, o
 *     un monstruo muere sin soltar nada por eso (`sinNombre`), se avisa igual.
 *
 * El nombre nace en '---' y se fija UNA vez en el panel del jugador. Mientras
 * la partida no ha llegado (no se sabe el nombre), no se bloquea: decide el
 * servidor.
 *
 * Uso:
 *   GFSinNombre.tiene()                 ¿tiene nombre? (true si aún no se sabe)
 *   GFSinNombre.exigir(scene, 'shop')   false (y avisa) si no lo tiene
 *   GFSinNombre.avisar(scene, 'loot')   solo el aviso (con freno)
 * Además, GFMuerte.bloquear(scene, 'plant' | 'mission') también lo comprueba.
 * ======================================================================== */
(function () {
  'use strict';

  var QUE = {
    shop: 'enter the shop', market: 'use the Market', battle: 'battle', pvp: 'fight other players',
    fish: 'fish', plant: 'plant seeds', mission: 'do missions', loot: 'pick up loot or receive drops'
  };
  // Las acciones que GFMuerte.bloquear ya vigila y que también piden nombre.
  var POR_MUERTE = { plant: 'plant', mission: 'mission' };
  var avisadoEn = {};

  function valido(u) { u = String(u == null ? '' : u).trim(); return !!u && u !== '---'; }

  /** El nombre que tenga cargado alguna escena activa (null si ninguna lo sabe). */
  function nombreActual() {
    try {
      var g = window.game, escenas = g && g.scene ? g.scene.getScenes(true) : [];
      for (var i = 0; i < escenas.length; i++) {
        var u = escenas[i] && escenas[i].Username;
        if (typeof u === 'string' && u.trim()) return u;
      }
    } catch (e) {}
    return null;
  }

  function tiene() {
    if (window._gfNombreFijado === true) return true;       // fijado una vez, para siempre
    if (Number(window._acttov) === 1) return true;          // el panel del jugador ya lo vio fijado
    var u = nombreActual();
    if (u == null) return true;                              // aún no se sabe: decide el servidor
    var ok = valido(u);
    if (ok) window._gfNombreFijado = true;
    return ok;
  }

  function escenaActiva() {
    try {
      var g = window.game, escenas = g && g.scene ? g.scene.getScenes(true) : [];
      for (var i = 0; i < escenas.length; i++) if (escenas[i] && escenas[i].notifications) return escenas[i];
    } catch (e) {}
    return null;
  }

  /** Un aviso propio por si la escena no tiene el de notificaciones. */
  function toast(txt) {
    var e = document.getElementById('gf-sin-nombre-aviso');
    if (!e) {
      e = document.createElement('div');
      e.id = 'gf-sin-nombre-aviso';
      e.setAttribute('role', 'status');
      e.style.cssText = 'position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:100000;' +
        'max-width:min(92vw,460px);padding:10px 16px;border-radius:10px;background:rgba(28,22,14,.94);' +
        'color:#ffe7a8;border:1px solid #c9a24a;font:600 14px/1.35 system-ui,sans-serif;text-align:center;' +
        'box-shadow:0 6px 24px rgba(0,0,0,.45);pointer-events:none;transition:opacity .3s';
      document.body.appendChild(e);
    }
    e.textContent = txt;
    e.style.opacity = '1';
    clearTimeout(e._t);
    e._t = setTimeout(function () { e.style.opacity = '0'; }, 3800);
  }

  function avisar(scene, accion) {
    var ahora = Date.now();
    if (ahora - (avisadoEn[accion] || 0) < 4000) return;
    avisadoEn[accion] = ahora;
    var txt = '✏️ Choose your character name first (Profile → Character name) to ' + (QUE[accion] || 'do that') + '.';
    var sc = scene && scene.notifications ? scene : escenaActiva();
    try {
      if (sc && sc.notifications && typeof sc.notifications.show === 'function') { sc.notifications.show(txt, 'warning'); return; }
    } catch (e) {}
    toast(txt);
  }

  function exigir(scene, accion) {
    if (tiene()) return true;
    avisar(scene, accion);
    return false;
  }

  // ── GFMuerte.bloquear: la siembra y las misiones ya pasan por ahí ─────────
  function envolverMuerte() {
    var m = window.GFMuerte;
    if (!m || typeof m.bloquear !== 'function' || m.bloquear.__gfSinNombre) return !!m;
    var original = m.bloquear;
    var nuevo = function (scene, accion) {
      if (original.apply(this, arguments)) return true;
      if (POR_MUERTE[accion] && !tiene()) { avisar(scene, POR_MUERTE[accion]); return true; }
      return false;
    };
    nuevo.__gfSinNombre = true;
    m.bloquear = nuevo;
    return true;
  }
  if (!envolverMuerte()) {
    // gf-muerte.js aún no estaba: se reintenta al cargar la página.
    window.addEventListener('load', envolverMuerte);
  }

  // ── Lo que conteste el servidor ───────────────────────────────────────────
  var ACCION_DE_URL = [
    [/\/api\/(salvaje\/recoger|monstruos\/botin)/, 'loot'], [/\/api\/pesca\//, 'fish'],
    [/\/api\/missions\//, 'mission'], [/\/api\/alchemist\//, 'shop'], [/\/api\/marketplace\//, 'market']
  ];
  function accionDeUrl(url) {
    for (var i = 0; i < ACCION_DE_URL.length; i++) if (ACCION_DE_URL[i][0].test(url)) return ACCION_DE_URL[i][1];
    return 'do that';
  }
  if (typeof window.fetch === 'function' && !window.fetch.__gfSinNombre) {
    var f0 = window.fetch;
    var envuelto = function (input, init) {
      var p = f0.apply(this, arguments);
      var url = '';
      try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch (e) {}
      if (!/\/api\/(salvaje|monstruos|pesca|missions|alchemist|marketplace)\//.test(url)) return p;
      return p.then(function (res) {
        try {
          if (res && res.status === 403) {
            res.clone().json().then(function (j) {
              if (j && j.error === 'name_required') { window._gfNombreFijado = false; avisar(null, accionDeUrl(url)); }
            }).catch(function () {});
          } else if (res && res.ok && /\/api\/monstruos\/derrotado/.test(url)) {
            // El monstruo murió pero, sin nombre, no soltó nada.
            res.clone().json().then(function (j) { if (j && j.sinNombre) avisar(null, 'loot'); }).catch(function () {});
          }
        } catch (e) {}
        return res;
      });
    };
    envuelto.__gfSinNombre = true;
    window.fetch = envuelto;
  }

  window.GFSinNombre = { tiene: tiene, exigir: exigir, avisar: avisar, _interno: { valido: valido, nombreActual: nombreActual } };
})();
