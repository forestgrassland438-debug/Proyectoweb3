/* ===========================================================================
 * gf-carga-mapa.js — NO SE ENTRA AL MAPA HASTA QUE ESTÉ TODO        (2026-10-19)
 * ===========================================================================
 *
 * "A veces entro a un mapa y los efectos o monstruos no están cargados y yo me
 * puedo mover a donde sea, y luego se cargan. Eso se debería cargar con
 * LoadingScenegame y dejarme pasar al mapa cuando todo esté al 100 %."
 *
 * Qué pasaba: LoadingScenegame quitaba su pantalla de carga ANTES de arrancar
 * el mapa, y el mapa, una vez creado, seguía trayendo cosas por su cuenta
 * (los monstruos y su arte, los NPC, las antorchas, el suelo pintado, los
 * sonidos…), todo con `scene.load` en segundo plano. Mientras, el jugador ya
 * andaba por un mapa a medio montar.
 *
 * Ahora:
 *   1. LoadingScenegame no quita su pantalla: la RETIENE (retener) con
 *      "Preparing the map…".
 *   2. La escena del mapa, al empezar su create(), la recoge (montar) y queda
 *      "cargando" (`scene._gfCargando`): su update() no hace nada, así que no
 *      se puede andar.
 *   3. Se da por lista cuando su create() terminó (listo, o en su defecto ya
 *      hay jugador y han pasado 2,5 s) Y el cargador de la escena lleva un rato
 *      sin nada pendiente. Entonces se quita la pantalla y se juega.
 *   4. Nunca se queda colgada: a los 20 s se entra igual, y si ninguna escena
 *      recoge la pantalla retenida, se quita sola a los 45 s.
 * ======================================================================== */
(function () {
  'use strict';

  var MAX_MS = 20000;          // lo más que se espera dentro del mapa
  var MIN_MS = 700;            // lo menos (que no parpadee)
  var QUIETO_MS = 350;         // el cargador sin nada pendiente durante esto
  var SIN_DUENO_MS = 45000;    // pantalla retenida que nadie recoge
  var retenida = null;         // { sistema, desde }
  var seguro = null;

  function texto(sis, t) {
    try { if (sis && sis.textElement) sis.textElement.textContent = t; } catch (e) {}
  }

  /** LoadingScenegame: no quites la pantalla, que la quita el mapa. */
  function retener(sistema, msg) {
    if (!sistema) return;
    retenida = { sistema: sistema, desde: Date.now() };
    texto(sistema, msg || 'Preparing the map…');
    clearTimeout(seguro);
    seguro = setTimeout(soltar, SIN_DUENO_MS);
  }

  function soltar() {
    clearTimeout(seguro);
    seguro = null;
    var r = retenida;
    retenida = null;
    if (r && r.sistema) { try { r.sistema.hide(500); } catch (e) {} }
  }

  /** ¿El cargador de la escena tiene algo entre manos? */
  function cargando(scene) {
    var ld = scene && scene.load;
    if (!ld) return false;
    try {
      if (typeof ld.isLoading === 'function' && ld.isLoading()) return true;
      if (ld.list && ld.list.size > 0) return true;
      if (ld.inflight && ld.inflight.size > 0) return true;
    } catch (e) {}
    return false;
  }

  function limpiar(scene) {
    var st = scene && scene.__gfCarga;
    if (!st) return;
    try { scene.events.off('update', st.tic); } catch (e) {}
    clearInterval(st.intervalo);
    scene._gfCargando = false;
  }

  function terminar(scene) {
    var st = scene && scene.__gfCarga;
    if (!st || st.hecho) return;
    st.hecho = true;
    limpiar(scene);
    console.log('🗺️ mapa listo (' + (scene.sys && scene.sys.settings ? scene.sys.settings.key : '?') + ') en ' +
                (Date.now() - st.t0) + ' ms');
    soltar();
  }

  /** Al empezar el create() del mapa. */
  function montar(scene) {
    if (!scene || !scene.sys || !scene.events) return;
    limpiar(scene);
    var st = { t0: Date.now(), quietoDesde: 0, creado: false, hecho: false };
    scene.__gfCarga = st;
    scene._gfCargando = true;
    // Se llegó sin pasar por la pantalla de carga: se enseña la misma.
    if (!retenida && typeof LoadingSystem === 'function') {
      try {
        var sis = new LoadingSystem();
        sis.show({ message: 'Preparing the map…', initialProgress: 0.9 });
        retenida = { sistema: sis, desde: Date.now() };
      } catch (e) {}
    }
    clearTimeout(seguro);
    seguro = null;
    st.tic = function () {
      if (st.hecho) return;
      var ahora = Date.now();
      var ocupado = cargando(scene);
      if (ocupado) st.quietoDesde = 0;
      else if (!st.quietoDesde) st.quietoDesde = ahora;
      var pct = ocupado ? Math.round(Math.max(0, Math.min(1, scene.load.progress || 0)) * 100) : 100;
      texto(retenida && retenida.sistema, 'Preparing the map… ' + pct + '%');
      var creado = st.creado || (!!scene.player && ahora - st.t0 > 2500);
      if ((creado && ahora - st.t0 >= MIN_MS && st.quietoDesde && ahora - st.quietoDesde >= QUIETO_MS) ||
          ahora - st.t0 > MAX_MS) {
        terminar(scene);
      }
    };
    scene.events.on('update', st.tic);
    // Por si la escena aún no da fotogramas (preload largo, create esperando).
    st.intervalo = setInterval(st.tic, 250);
    scene.events.once('shutdown', function () { if (!st.hecho) { st.hecho = true; limpiar(scene); } });
    scene.events.once('destroy', function () { if (!st.hecho) { st.hecho = true; limpiar(scene); } });
  }

  /** Al final del create() del mapa: ya está todo montado (falta lo que cargue). */
  function listo(scene) {
    var st = scene && scene.__gfCarga;
    if (st) st.creado = true;
  }

  function bloquea(scene) { return !!(scene && scene._gfCargando); }

  window.GFCargaMapa = { retener: retener, soltar: soltar, montar: montar, listo: listo, bloquea: bloquea,
                         _interno: { cargando: cargando } };
})();
