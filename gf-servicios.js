/* =============================================================================
 * FUNDIR Y CRAFTEAR CUESTAN: UN PRECIO JUSTO QUE CORRE CON LA ECONOMÍA (2026-10-28)
 * -----------------------------------------------------------------------------
 * "Al fundir se debería cobrar un precio justo, y al craftear también; esos
 * precios tienen que correr con la economía para que suban o bajen según la
 * inflación." El precio lo pone el SERVIDOR (server2.js, "LA ECONOMÍA, 2.ª
 * PARTE": un tanto por ciento de lo que vale lo que sale, con el índice de
 * precios y un mínimo) y lo cobra él, en bronce (si no llega, rompe plata u oro
 * y devuelve el cambio). Va al tesoro del juego.
 *
 *   GFServicios.precio(tipo, itemId, cantidad) → Promise<bronce|null>
 *   GFServicios.cobrar(tipo, itemId, cantidad) → Promise<{ ok, bronce, ref } | { ok:false, error, message }>
 *   GFServicios.devolver(ref)                  → Promise<bool>   (si el fundido o el crafteo no salió)
 *
 * Un servicio sin cobro confirmado se bloquea. Un fallo pide revisión del
 * recibo: el navegador nunca puede autorizar su propia devolución.
 * ========================================================================== */
(function () {
  'use strict';
  if (window.GFServicios) return;

  var precios = new Map();          // 'tipo|itemId|cantidad' -> { bronce, en }

  function api(ruta, cuerpo) {
    if (window.GFMascota && typeof window.GFMascota.api === 'function') return window.GFMascota.api(ruta, cuerpo);
    return Promise.resolve({ ok: false, status: 0, datos: null });
  }
  function nuevaRef() {
    try { if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID(); } catch (e) {}
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }
  function adoptar(stats) {
    if (stats && window.GFBronce && typeof window.GFBronce.adoptarStats === 'function') {
      try { window.GFBronce.adoptarStats(stats); } catch (e) {}
    }
  }
  function cantidadValida(n) { return Math.max(1, Math.min(999, Math.floor(Number(n) || 1))); }

  function precio(tipo, itemId, cantidad) {
    var q = cantidadValida(cantidad), k = tipo + '|' + itemId + '|' + q;
    var c = precios.get(k);
    if (c && Date.now() - c.en < 60000) return Promise.resolve(c.bronce);
    return api('/api/economia/servicio/precio?tipo=' + encodeURIComponent(tipo) + '&itemId=' + encodeURIComponent(itemId) + '&cantidad=' + q)
      .then(function (r) {
        if (!r || r.status === 404) return null;
        var b = r.ok && r.datos ? Number(r.datos.bronce) : NaN;
        if (!isFinite(b)) return null;
        precios.set(k, { bronce: b, en: Date.now() });
        if (precios.size > 200) precios.clear();
        return b;
      })
      .catch(function () { return null; });
  }

  function devolver(ref) {
    if (!ref) return Promise.resolve(false);
    return api('/api/economia/servicio/devolver', { ref: ref })
      .then(function (r) { if (r.ok && r.datos && r.datos.ok) { adoptar(r.datos.stats); return true; } return false; })
      .catch(function () { return false; });
  }

  function cobrar(tipo, itemId, cantidad) {
    var ref = nuevaRef();
    return api('/api/economia/servicio', { tipo: tipo, itemId: itemId, cantidad: cantidadValida(cantidad), ref: ref })
      .then(function (r) {
        var d = r.datos || {};
        if (r.ok && d.ok && Number.isSafeInteger(d.bronce) && d.bronce > 0 && !d.devuelto) {
          adoptar(d.stats); return { ok: true, bronce: d.bronce, ref: ref };
        }
        if (r.status === 409 && d.error === 'saldo_insuficiente') {
          return { ok: false, error: 'saldo', bronce: d.bronce, message: d.message || ('You need ' + Number(d.bronce || 0).toLocaleString('en-US') + ' Bronze for this.') };
        }
        // No se sabe si cobró (red, 5xx): se pide la devolución con la misma referencia.
        devolver(ref);
        return { ok: false, error: 'servidor', message: 'The fee could not be charged right now. Try again in a moment.' };
      })
      .catch(function () {
        devolver(ref);
        return { ok: false, error: 'red', message: 'No connection to the server. Try again in a moment.' };
      });
  }

  function confirmar(ref) {
    if (!ref) return Promise.resolve(false);
    return api('/api/economia/servicio/confirmar', { ref: ref })
      .then(function (r) { return !!(r && r.ok && r.datos && r.datos.ok); })
      .catch(function () { return false; });
  }

  /* (2026-11-25) EL REGALO DEL TUTORIAL. Mientras dura, la tienda regala las 4 bolsas de
     zanahoria que pide y craftear no cobra comisión. Lo decide y lo aplica el SERVIDOR
     (server2.js, TUTORIAL_SEMILLAS_GRATIS); aquí solo se pregunta para enseñarlo.
       GFServicios.tutorialPosible(escena) → bool   (sin red: ¿su paso es uno del tutorial?)
       GFServicios.tutorial()               → Promise<{ activo, semillas: { itemId: n }, crafteos: n } | null>
       GFServicios.olvidarTutorial()        (tras comprar o craftear, para volver a preguntar)
     Una cuenta que nunca vio el tutorial no tiene el paso: no se pregunta. */
  var regalo = null;                // { datos, en } | { promesa }
  var vuelta = 0;                   // olvidarTutorial() deja sin valor lo que estuviera en camino
  function tutorialPosible(escena) {
    var paso = escena ? escena.tutorial : undefined;
    if (paso === undefined || paso === null || paso === '') return false;
    var n = Number(paso);
    return Number.isInteger(n) && n >= 0 && n <= 21 && !(n >= 8 && n < 20);
  }
  function tutorial() {
    if (regalo && regalo.promesa) return regalo.promesa;
    if (regalo && Date.now() - regalo.en < (regalo.datos ? 20000 : 60000)) return Promise.resolve(regalo.datos);
    var mia = vuelta;
    var p = api('/api/tutorial/gratis')
      .then(function (r) {
        var d = r && r.ok && r.datos && r.datos.ok ? r.datos : null;
        var limpio = d ? {
          activo: !!d.activo,
          semillas: d.semillas && typeof d.semillas === 'object' ? d.semillas : {},
          crafteos: Math.max(0, Math.floor(Number(d.crafteos) || 0))
        } : null;
        if (mia === vuelta) regalo = { datos: limpio, en: Date.now() };
        return limpio;
      })
      .catch(function () { if (mia === vuelta) regalo = { datos: null, en: Date.now() }; return null; });
    regalo = { promesa: p };
    return p;
  }
  function olvidarTutorial() { regalo = null; vuelta++; }

  window.GFServicios = Object.freeze({ precio: precio, cobrar: cobrar, devolver: devolver, confirmar: confirmar,
    tutorialPosible: tutorialPosible, tutorial: tutorial, olvidarTutorial: olvidarTutorial });
})();
