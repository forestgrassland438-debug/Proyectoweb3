/*!
 * ============================================================================
 * Grassland Forest © 2026 JEAN LARREAL - TODOS LOS DERECHOS RESERVADOS
 * ============================================================================
 *
 * GF LANDS — el boton redondo de las parcelas
 *
 * ============================================================================
 *
 * QUE HACE
 * ---------------------------------------------------------------------------
 * Un solo boton del HUD con DOS estados:
 *
 *    fuera de la isla   icono de la parcela   ->  lleva a LandsScene
 *    dentro de la isla  icono con la flecha   ->  devuelve a GameScene
 *
 * POR QUE UN MODULO Y NO CODIGO EN CADA ESCENA
 * ---------------------------------------------------------------------------
 * El boton tiene que funcionar en CUATRO escenas: el mapa, la tienda, la mina
 * y la propia isla. Tres de ellas comparten clase (GameScene y sus herederas),
 * pero `tiendajuego` no: es una clase aparte con su propio HUD. Poniendo la
 * logica en cada una habria cuatro copias del mismo boton, y la del icono —que
 * es la parte facil de olvidar— se quedaria desincronizada a la primera.
 *
 * Aqui esta una vez, y cada escena solo dice `GFLands.montar(this)`.
 *
 * POR QUE EL BOTON VA EL ULTIMO EN EL HTML
 * ---------------------------------------------------------------------------
 * Porque `tiendajuego.js` engancha varios botones redondos por su POSICION en
 * la NodeList (`roundButtons[3]` son las transacciones, `[6]` la tienda).
 * Meterlo en medio del HTML correria todos esos indices y los botones de la
 * tienda pasarian a hacer lo del de al lado. Es el mismo motivo por el que
 * "Friends" tambien va el ultimo. Donde se VE lo decide el `order` del CSS
 * (`#lands-btn { order: 0 }`), que lo pone el primero, encima de Dashboard.
 *
 * EL ENGANCHE ES IDEMPOTENTE
 * ---------------------------------------------------------------------------
 * El HUD es DOM de la PAGINA: sobrevive al cambio de escena, pero sus
 * manejadores apuntan a la escena que los puso. Si esa escena muere, el boton
 * sigue ahi y al pulsarlo revienta. Por eso `montar` se llama en cada create()
 * y en cada 'wake', y siempre quita el manejador anterior antes de poner el
 * nuevo.
 */

(function (root) {
  'use strict';

  var ICONO_IR     = './Game/Source/lands.png';
  var ICONO_VOLVER = './Game/Source/lands_volver.png';

  var CLAVE_ISLA = 'LandsScene';

  function log() {
    if (root.console && console.log) {
      console.log.apply(console, ['[gf-lands]'].concat([].slice.call(arguments)));
    }
  }

  function boton() {
    return document.getElementById('lands-btn');
  }

  /**
   * Pone el icono y el texto que tocan segun donde estes.
   *
   * El `alt` y la chapita tambien cambian: el boton es el mismo nodo, asi que
   * si solo cambiara la imagen, un lector de pantalla seguiria diciendo
   * "Lands" cuando el boton ya sirve para volver.
   */
  function pintarIcono(enLaIsla) {
    var b = boton();
    if (!b) return;
    var img = b.querySelector('img');
    var chapa = b.querySelector('.label-badge');
    var ruta = enLaIsla ? ICONO_VOLVER : ICONO_IR;
    if (img && img.getAttribute('src') !== ruta) {
      img.setAttribute('src', ruta);
      img.setAttribute('alt', enLaIsla ? 'Volver al mapa' : 'Lands');
    }
    if (chapa) chapa.textContent = enLaIsla ? 'Back' : 'Lands';
    b.setAttribute('aria-label', enLaIsla ? 'Volver al mapa' : 'Ir a mis parcelas');
    b.classList.toggle('lands-activo', !!enLaIsla);
  }

  /**
   * Apaga el HUD de la pagina antes de cambiar de escena.
   *
   * Todo va con `?.` / comprobaciones: esto lo usan cuatro escenas distintas y
   * no todas tienen los mismos metodos. Lo que no exista, se salta; lo que
   * exista, se llama. Es preferible a cuatro copias de esta funcion, cada una
   * con la lista de metodos de su escena.
   */
  function apagarHUD(escena) {
    var $ = function (id) { return document.getElementById(id); };
    var hud = $('game-hud');
    if (hud) {
      hud.classList.remove('hud-visible');
      hud.classList.add('hud-hidden');
    }
    ['hub', 'quick-slots-bar', 'open-chat-btn'].forEach(function (id) {
      var el = $(id);
      if (el) el.classList.add('hidden');
    });
    document.querySelectorAll('.quick-slot').forEach(function (s) {
      s.style.display = 'none';
    });
    var izq = $('info-text-left');
    if (izq) izq.textContent = '';
    var ui = $('game-ui-text');
    if (ui) ui.style.display = 'none';

    try { if (escena._cancelarArrastre) escena._cancelarArrastre(); } catch (e) {}
    try { if (escena.savegg) escena.savegg(); } catch (e) { log('guardado:', e); }
    try { if (escena.removeListener) escena.removeListener(); } catch (e) {}
    try { if (escena._unbindAllDomClicks) escena._unbindAllDomClicks(); } catch (e) {}
    try { if (escena.hideHudElements) escena.hideHudElements(); } catch (e) {}
    try { if (escena.stopMusicSafely) escena.stopMusicSafely(); } catch (e) {}
    try { if (escena.cleanupScene) escena.cleanupScene(); } catch (e) { log('limpieza:', e); }
  }

  /**
   * Empaqueta la sesion para pasarsela a la isla.
   *
   * Las escenas que heredan de GameScene traen `_capturarSesion()`.
   * `tiendajuego` no hereda, asi que se compone a mano con lo que tenga — y
   * si le falta algo, la isla lo resuelve sola llamando a `loadx()`.
   *
   * POR QUE ESTO IMPORTA: cambiar de escena crea una instancia NUEVA, y la
   * isla se autenticaba de cero. Eso dio el cartel de SESSION EXPIRED, porque
   * `serverBase` se rellena en el preload() de GameScene y la isla tiene el
   * suyo propio: la peticion salia a `undefined/api/auth/me`.
   */
  function sesionDe(escena) {
    if (typeof escena._capturarSesion === 'function') {
      try { return escena._capturarSesion(); } catch (e) {}
    }
    return {
      playerName:      escena.playerName,
      address:         escena.address,
      currentAccount:  escena.currentAccount,
      isAuthenticated: escena.isAuthenticated === true,
      csrfToken:       escena.csrfToken || root.csrfToken || null,
      serverBase:      escena.serverBase,
      serverclient:    escena.serverclient,
      serverclient1:   escena.serverclient1
    };
  }

  /** De donde se vino, para poder devolver al jugador a su sitio. */
  function recordarVuelta(escena) {
    try {
      root.__gfLandsVuelta = {
        escena: escena.sys.settings.key,
        x: escena.player ? Math.round(escena.player.x) : null,
        y: escena.player ? Math.round(escena.player.y) : null
      };
    } catch (e) {
      root.__gfLandsVuelta = null;
    }
  }

  function ir(escena) {
    if (escena._cambiandoEscena) return;
    if (!escena.scene.get(CLAVE_ISLA)) {
      log('LandsScene no esta registrada: no se puede ir a la isla');
      return;
    }
    escena._cambiandoEscena = true;
    recordarVuelta(escena);
    log('a la isla desde', escena.sys.settings.key);
    apagarHUD(escena);
    escena.scene.start(CLAVE_ISLA, { sesion: sesionDe(escena) });
  }

  function volver(escena) {
    if (escena._cambiandoEscena) return;
    escena._cambiandoEscena = true;
    log('de vuelta al mapa');
    apagarHUD(escena);

    /* SIEMPRE a GameScene, aunque se hubiera venido de la tienda o de la mina.
       Es lo que se pidio, y ademas es lo unico que no deja al jugador en un
       sitio raro: volver a la tienda significaria reaparecer dentro de un
       edificio al que ya no se sabe por donde se entro. */
    var vuelta = root.__gfLandsVuelta || {};
    var datos = { targetScene: 'GameScene', playerData: { mundo: 1 } };
    if (vuelta.escena === 'GameScene' &&
        typeof vuelta.x === 'number' && typeof vuelta.y === 'number') {
      datos.playerData.x = vuelta.x;
      datos.playerData.y = vuelta.y;
    }
    escena.scene.start('LoadingScenegame', datos);
  }

  /**
   * Engancha el boton a ESTA escena y le pone el icono que toca.
   * Lo llaman los create() de GameScene, tiendajuego, MinaScene y LandsScene.
   */
  function montar(escena) {
    var b = boton();
    if (!b) {
      log('no existe #lands-btn en el HTML');
      return;
    }
    var enLaIsla = false;
    try { enLaIsla = escena.sys.settings.key === CLAVE_ISLA; } catch (e) {}

    pintarIcono(enLaIsla);

    var accion = function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      if (enLaIsla) volver(escena);
      else ir(escena);
    };

    // `_bindDomClick` (GameScene y herederas) ya es idempotente. `tiendajuego`
    // no lo tiene, asi que alli se usa `onclick`, que tambien pisa el anterior
    // en vez de acumularlo.
    if (typeof escena._bindDomClick === 'function') {
      escena._bindDomClick(b, 'lands', accion);
    } else {
      b.onclick = accion;
    }
  }

  root.GFLands = {
    montar: montar,
    ir: ir,
    volver: volver,
    pintarIcono: pintarIcono,
    boton: boton,
    CLAVE_ISLA: CLAVE_ISLA
  };
})(window);
