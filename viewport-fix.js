/**
 * ALTURA REAL DEL VIEWPORT EN MÓVIL
 * =============================================================================
 * PROBLEMA (2026-08-03, visto en el teléfono del usuario):
 *   Al entrar al juego, el mapa se dibujaba solo en la franja de arriba de la
 *   pantalla y el resto quedaba en negro. El motivo es que el lienzo de Phaser
 *   se crea con `window.innerHeight` del momento del arranque — cuando el
 *   navegador móvil todavía enseña su barra de direcciones — y después, cuando
 *   esa barra se esconde y la pantalla útil crece, nadie volvía a ajustar el
 *   lienzo. Lo mismo pasaba con la tienda y los paneles, porque `100vh` en
 *   móvil NO es la altura visible: incluye la barra del navegador.
 *
 * QUÉ HACE ESTE ARCHIVO:
 *   1. Publica la altura REAL de la ventana en la variable CSS --app-height
 *      (usando visualViewport, que es la única medida fiable en móvil).
 *      styless.css la usa para #container, html/body y las capas a pantalla
 *      completa.
 *   2. Estira el lienzo del juego al 100 % de su contenedor.
 *   3. Avisa al juego de que se redimensione lanzando el evento `resize` que
 *      app.js y phaser-canvas-scaler.js YA escuchan (ellos son los que tienen
 *      la referencia del juego y llaman a game.scale.resize).
 *
 * QUÉ **NO** HACE:
 *   No toca el zoom de la cámara ni la configuración de escala del juego.
 *   Solo corrige el tamaño del lienzo y del contenedor.
 * =============================================================================
 */
(function (global) {
  'use strict';

  var doc = global.document;
  var vv = global.visualViewport || null;

  // Evita el bucle: nosotros lanzamos 'resize' y a la vez lo escuchamos.
  var reentrando = false;
  var temporizador = null;

  function alturaReal() {
    // visualViewport.height es lo que de verdad se ve (descuenta la barra del
    // navegador y el teclado). innerHeight es el respaldo para navegadores que
    // no lo tienen.
    var h = vv && vv.height ? vv.height : global.innerHeight;
    return Math.max(240, Math.round(h || 0));
  }

  function anchoReal() {
    var w = vv && vv.width ? vv.width : global.innerWidth;
    return Math.max(320, Math.round(w || 0));
  }

  function aplicar() {
    var h = alturaReal();
    var w = anchoReal();

    try {
      doc.documentElement.style.setProperty('--app-height', h + 'px');
      doc.documentElement.style.setProperty('--app-width', w + 'px');
    } catch (e) { /* navegador sin custom properties: se ignora */ }

    var container = doc.getElementById('container');
    if (container) {
      container.style.setProperty('height', h + 'px', 'important');
      container.style.setProperty('width', w + 'px', 'important');

      var canvas = container.querySelector('canvas');
      if (canvas) {
        // El lienzo siempre ocupa TODO el contenedor. Sin esto, Phaser lo deja
        // con el tamaño en píxeles que tenía al arrancar y sobra el negro.
        canvas.style.setProperty('width', '100%', 'important');
        canvas.style.setProperty('height', '100%', 'important');
        canvas.style.display = 'block';
        canvas.style.imageRendering = 'pixelated';
      }
    }
  }

  /**
   * Le pide al juego que recalcule su resolución interna. No se llama a
   * game.scale.resize() desde aquí a propósito: app.js y
   * phaser-canvas-scaler.js ya tienen la referencia del juego y lo hacen bien
   * en su manejador de 'resize'. Reutilizar ese camino evita duplicar lógica
   * (y evita romper el zoom, que se maneja en la cámara, no aquí).
   */
  function avisarAlJuego() {
    if (reentrando) return;
    reentrando = true;
    try {
      global.dispatchEvent(new Event('resize'));
    } catch (e) {
      // Navegadores viejos sin constructor de Event
      try {
        var ev = doc.createEvent('Event');
        ev.initEvent('resize', true, true);
        global.dispatchEvent(ev);
      } catch (e2) { /* nada más que hacer */ }
    }
    // Se libera en el siguiente tick: así el 'resize' que acabamos de lanzar
    // no vuelve a entrar aquí, pero los siguientes de verdad sí.
    setTimeout(function () { reentrando = false; }, 0);
  }

  function actualizar(avisar) {
    aplicar();
    if (avisar !== false) avisarAlJuego();
  }

  function actualizarConRetardo() {
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(function () {
      temporizador = null;
      actualizar(true);
    }, 90);
  }

  // ── Enganches ─────────────────────────────────────────────────────────────
  if (vv) {
    // En móvil esto es lo que se dispara al esconderse/mostrarse la barra de
    // direcciones y al abrirse el teclado.
    vv.addEventListener('resize', actualizarConRetardo);
    vv.addEventListener('scroll', function () { aplicar(); });
  }
  global.addEventListener('resize', function () {
    if (reentrando) return;   // es el nuestro
    aplicar();                // el tamaño se corrige, pero sin relanzar el evento
  });
  global.addEventListener('orientationchange', function () {
    // El navegador tarda un poco en dar las medidas definitivas al girar.
    setTimeout(actualizarConRetardo, 120);
    setTimeout(actualizarConRetardo, 420);
  });
  global.addEventListener('pageshow', actualizarConRetardo);
  doc.addEventListener('visibilitychange', function () {
    if (!doc.hidden) actualizarConRetardo();
  });

  // Primera medida lo antes posible.
  aplicar();
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', function () { actualizar(false); });
  }

  // El contenedor y el lienzo los crea app.js DESPUÉS de que este archivo
  // corra, así que se vigila su aparición y se ajusta en cuanto existan.
  // Además se repite unas cuantas veces durante los primeros segundos: es
  // justo cuando el navegador móvil esconde su barra y la pantalla útil crece.
  var intentos = 0;
  var vigilante = setInterval(function () {
    intentos++;
    var container = doc.getElementById('container');
    var canvas = container && container.querySelector('canvas');
    aplicar();
    if (canvas) avisarAlJuego();
    // ~12 s de vigilancia: de sobra para la carga inicial en un móvil lento.
    if (intentos >= 40) clearInterval(vigilante);
  }, 300);

  global.addEventListener('load', function () {
    [0, 300, 900, 2000, 4000].forEach(function (ms) {
      setTimeout(function () { actualizar(true); }, ms);
    });
  });

  // Expuesto por si alguna escena necesita forzar el ajuste a mano
  // (por ejemplo al volver de la tienda).
  global.gfViewportFix = { update: function () { actualizar(true); }, height: alturaReal, width: anchoReal };
})(window);
