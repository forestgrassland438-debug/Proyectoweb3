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
 *      sin nada pendiente Y (2026-10-24) el suelo que cae en la cámara ya está
 *      pintado (sueloListo). Entonces se quita la pantalla y se juega.
 *   4. Nunca se queda colgada: a los 20 s se entra igual, y si ninguna escena
 *      recoge la pantalla retenida, se quita sola a los 45 s.
 * ======================================================================== */
(function () {
  'use strict';
  if (window.GFCargaMapa) return;

  var MAX_MS = 20000;          // lo más que se espera dentro del mapa
  var MIN_MS = 700;            // lo menos (que no parpadee)
  var QUIETO_MS = 350;         // el cargador sin nada pendiente durante esto
  var SIN_DUENO_MS = 45000;    // pantalla retenida que nadie recoge
  var retenida = null;         // { sistema, desde }
  var seguro = null;

  function texto(sis, t) {
    try { if (sis && sis.textElement && sis.textElement.textContent !== t) sis.textElement.textContent = t; } catch (e) {}
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

  /* EL SUELO TAMBIÉN                                             (2026-10-24)

     "Cuando entro al mapa salvaje u otros me muevo y nada ha cargado aún."
     Los trozos del suelo (recortadas_*) los baja lib/tileManager.js con fetch,
     no con scene.load: `cargando` no los veía y la pantalla se quitaba con el
     suelo en negro. Ahora también se espera a que lo que cae en la cámara esté
     pintado. Y mientras se espera se BOMBEA aquí: en el pueblo los trozos los
     crea GameScene.update, que con el mapa cargando no corre. */
  function sueloListo(scene) {
    var cam = scene.cameras && scene.cameras.main;
    if (!cam) return true;
    var gs = scene.__gfSuelo;
    if (gs && gs.vivo && !gs.tm && gs.loader) return false;      // aún baja su mapa.json
    var lista = Array.isArray(scene._tileManagers) ? scene._tileManagers : [];
    var listo = true;
    for (var i = 0; i < lista.length; i++) {
      var tm = lista[i];
      if (!tm || typeof tm.listoEnVista !== 'function') continue;
      if (tm.listoEnVista(cam)) continue;
      listo = false;
      try { tm.updateVisible(cam); tm.bombear(); } catch (e) {}
    }
    return listo;
  }

  function limpiar(scene) {
    var st = scene && scene.__gfCarga;
    if (!st) return;
    st.hecho = true;
    try { scene.events.off('update', st.tic); } catch (e) {}
    try { scene.events.off('shutdown', st.cerrar); scene.events.off('destroy', st.cerrar); } catch (e) {}
    clearInterval(st.intervalo);
    st.intervalo = null;
    scene.__gfCarga = null;
    scene._gfCargando = false;
  }

  function terminar(scene) {
    var st = scene && scene.__gfCarga;
    if (!st || st.hecho) return;
    st.hecho = true;
    limpiar(scene);
    console.log('🗺️ mapa listo (' + (scene.sys && scene.sys.settings ? scene.sys.settings.key : '?') + ') en ' +
                (Date.now() - st.t0) + ' ms');
    if (retenida === st.retencion) soltar();
  }

  /** Al empezar el create() del mapa. */
  function montar(scene) {
    if (!scene || !scene.sys || !scene.events) return;
    limpiar(scene);
    var st = { t0: Date.now(), ultimo: -Infinity, quietoDesde: 0, creado: false, hecho: false };
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
    st.retencion = retenida;
    st.tic = function () {
      if (st.hecho) return;
      var ahora = Date.now();
      // El intervalo ya cubre escenas sin frames; el update solo adelanta
      // la comprobación. No es necesario consultar el loader 60 veces/s.
      if (ahora - st.ultimo < 100) return;
      st.ultimo = ahora;
      var ocupado = cargando(scene);
      if (ocupado) st.quietoDesde = 0;
      else if (!st.quietoDesde) st.quietoDesde = ahora;
      var pct = ocupado ? Math.round(Math.max(0, Math.min(1, scene.load.progress || 0)) * 100) : 100;
      if (retenida === st.retencion) texto(st.retencion && st.retencion.sistema, 'Preparing the map… ' + pct + '%');
      var creado = st.creado || (!!scene.player && ahora - st.t0 > 2500);
      if ((creado && ahora - st.t0 >= MIN_MS && st.quietoDesde && ahora - st.quietoDesde >= QUIETO_MS && sueloListo(scene)) ||
          ahora - st.t0 > MAX_MS) {
        terminar(scene);
      }
    };
    scene.events.on('update', st.tic);
    // Por si la escena aún no da fotogramas (preload largo, create esperando).
    st.intervalo = setInterval(st.tic, 250);
    st.cerrar = function () {
      if (st.hecho || scene.__gfCarga !== st) return;
      limpiar(scene);
      if (retenida === st.retencion) soltar();
    };
    scene.events.once('shutdown', st.cerrar);
    scene.events.once('destroy', st.cerrar);
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
