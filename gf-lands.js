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

  /* LA PLAZA: donde nace toda cuenta nueva, y adonde devuelve la isla.
     El valor esta escrito igual en LoadingScenegame.js y en GameScene.js
     (`this.posicionplayerx = 2097; this.posicionplayery = 2359;`). Si algun
     dia se mueve la plaza, hay que cambiarlo en los tres sitios. */
  var PLAZA_X = 2097;
  var PLAZA_Y = 2359;

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

  /**
   * A la isla POR LA PANTALLA DE CARGA, igual que a la mina y a la tienda.
   *
   * DOS MOTIVOS, y el segundo es un fallo de verdad:
   *
   *   1. Consistencia: es el mismo viaje que hace el resto del juego, con su
   *      pantalla de carga y su sincronizacion del inventario con la cadena.
   *
   *   2. LA ISLA NO SE GUARDABA. `LandsScene` se marca como `mundo = 4` en su
   *      create, pero eso solo vive en la instancia: hasta que algo llamara a
   *      `savegg()` con ese valor puesto, la partida seguia diciendo "mundo 1".
   *      Recargar la pagina te sacaba al mapa como si nunca hubieras ido.
   *      Ahora el mundo se guarda ANTES de irse, y se ESPERA a que el guardado
   *      termine: la pantalla de carga decide a donde va leyendo /api/load, y
   *      si el guardado sigue en vuelo cuando pregunta, lee el mundo viejo.
   *
   * `sesionDe()` ya no hace falta aqui: viniendo de la pantalla de carga, es
   * ella la que le pasa su sesion a la isla.
   */
  function ir(escena) {
    if (escena._cambiandoEscena) return;
    if (!escena.scene.get(CLAVE_ISLA)) {
      log('LandsScene no esta registrada: no se puede ir a la isla');
      return;
    }
    escena._cambiandoEscena = true;
    recordarVuelta(escena);
    log('a la isla desde', escena.sys.settings.key);

    escena.mundo = 4;
    var irYa = function () {
      apagarHUD(escena);
      escena.scene.start('LoadingScenegame');
    };
    try {
      var p = escena.savegg && escena.savegg();
      if (p && typeof p.then === 'function') p.then(irYa, irYa);
      else irYa();
    } catch (e) {
      log('guardado antes de la isla:', e);
      irYa();
    }
  }

  function volver(escena) {
    if (escena._cambiandoEscena) return;
    escena._cambiandoEscena = true;
    log('de vuelta al mapa');

    /* EL MUNDO SE CORRIGE ANTES DE APAGAR EL HUD, y el orden no es un detalle:
       `apagarHUD()` tambien llama a `savegg()`. Corrigiendolo despues habria
       DOS guardados en vuelo -uno diciendo "esta en la isla" y otro diciendo
       "esta en el mapa"- y cual de los dos llega el ultimo al servidor no lo
       decide nadie. Poniendolo aqui, los dos guardan lo mismo. */
    if (typeof escena._dejarPartidaEnElMapa === 'function') {
      escena._dejarPartidaEnElMapa(PLAZA_X, PLAZA_Y);
    }

    apagarHUD(escena);

    /* SIEMPRE a GameScene, aunque se hubiera venido de la tienda o de la mina.
       Es lo que se pidio, y ademas es lo unico que no deja al jugador en un
       sitio raro: volver a la tienda significaria reaparecer dentro de un
       edificio al que ya no se sabe por donde se entro.

       Y SIEMPRE A LA PLAZA. Antes se devolvia al jugador a las coordenadas
       exactas desde las que habia pulsado el boton (`__gfLandsVuelta`). Suena
       mejor de lo que es: desde la tienda o desde la mina esa posicion no
       existe en el mapa de fuera, y desde el mapa te devolvia pegado a
       cualquier sitio, a veces dentro de una colision. La plaza es el punto
       de partida de toda cuenta nueva (LoadingScenegame y GameScene lo tienen
       igual: 2097, 2359), asi que siempre es suelo pisable y siempre es un
       sitio reconocible.

       `__gfLandsVuelta` se sigue guardando: no se usa para colocar al
       jugador, pero dice en el log de donde se vino. */
    var vuelta = root.__gfLandsVuelta || {};
    log('vuelta a la plaza (se venia de', vuelta.escena || 'ningun sitio', ')');

    /* El `playerData` de aqui abajo es DECORATIVO y se deja solo por parecerse
       a las demas transiciones del juego: LoadingScenegame no tiene `init()`,
       nadie lo lee, y la posicion y el mundo salen siempre de /api/load. Quien
       de verdad decide donde apareces es el `_dejarPartidaEnElMapa()` de
       arriba, que lo deja guardado antes de irse. */
    escena.scene.start('LoadingScenegame', {
      targetScene: 'GameScene',
      playerData: { x: PLAZA_X, y: PLAZA_Y, mundo: 1 }
    });
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
