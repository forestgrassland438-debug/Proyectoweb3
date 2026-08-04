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

  // ── TECLADO EN PANTALLA ───────────────────────────────────────────────────
  // Cuando se abre el teclado del móvil (al enfocar el chat, el buscador del
  // crafting, el nombre del personaje…), visualViewport.height se desploma.
  // Si se hiciera caso a esa medida, el lienzo del juego se encogería y al
  // cerrarse el teclado volvería a crecer: eso es exactamente el "zoom" y los
  // fallos de repintado que se veían en el teléfono.
  //
  // Por eso se guarda la última altura ESTABLE (sin teclado) y, mientras haya
  // un campo de texto enfocado o la altura se haya desplomado, se sigue usando
  // esa altura estable y NO se avisa al juego de ningún cambio de tamaño.
  var alturaEstable = 0;
  var ultimoAncho = 0;

  function hayCampoEnfocado() {
    var a = doc.activeElement;
    if (!a) return false;
    var tag = (a.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || a.isContentEditable === true;
  }

  /** ¿La medida actual está distorsionada por el teclado? */
  function tecladoAbierto() {
    var h = vv && vv.height ? vv.height : global.innerHeight;
    // Un teclado se come fácilmente un tercio de la pantalla. Por debajo del
    // 80 % de la altura estable se da por seguro que está abierto.
    var desplomada = alturaEstable > 0 && h < alturaEstable * 0.8;
    return desplomada || (hayCampoEnfocado() && desplomada);
  }

  function alturaReal() {
    // visualViewport.height es lo que de verdad se ve (descuenta la barra del
    // navegador). innerHeight es el respaldo para navegadores que no lo tienen.
    var h = Math.max(240, Math.round((vv && vv.height ? vv.height : global.innerHeight) || 0));

    // Con el teclado abierto se conserva la última altura estable: el juego no
    // debe encogerse por escribir en el chat.
    if (alturaEstable > 0 && h < alturaEstable * 0.8) return alturaEstable;

    alturaEstable = h;
    return h;
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
      // Con el teclado abierto NO se avisa al juego: redimensionar el lienzo
      // mientras se escribe es lo que provocaba el zoom y el repintado roto.
      if (tecladoAbierto()) { aplicar(); return; }
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
    // Un cambio de ANCHO nunca lo provoca el teclado: es un giro de pantalla o
    // una ventana redimensionada, así que la referencia estable debe soltarse.
    var anchoAhora = anchoReal();
    if (ultimoAncho && Math.abs(anchoAhora - ultimoAncho) > 2) alturaEstable = 0;
    ultimoAncho = anchoAhora;
    aplicar();                // el tamaño se corrige, pero sin relanzar el evento
  });
  global.addEventListener('orientationchange', function () {
    // IMPORTANTE: al girar, la altura cambia de verdad (en apaisado es mucho
    // menor). Sin borrar la referencia estable, el filtro anti-teclado la
    // confundiría con un teclado abierto y se quedaría con la altura vertical.
    alturaEstable = 0;
    // El navegador tarda un poco en dar las medidas definitivas al girar.
    setTimeout(actualizarConRetardo, 120);
    setTimeout(actualizarConRetardo, 420);
  });
  global.addEventListener('pageshow', actualizarConRetardo);
  doc.addEventListener('visibilitychange', function () {
    if (!doc.hidden) actualizarConRetardo();
  });

  // ── Teclado: enfocar y desenfocar campos ──────────────────────────────────
  // Al ENFOCAR no se toca nada (el lienzo se queda como está). Al DESENFOCAR
  // se espera a que el teclado termine de cerrarse y se vuelve a medir, que es
  // cuando la altura recupera su valor real.
  doc.addEventListener('focusin', function (e) {
    var t = e.target;
    if (!t) return;
    var tag = (t.tagName || '').toUpperCase();
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && !t.isContentEditable) return;
    // iOS a veces desplaza la página al abrir el teclado y eso se ve como
    // zoom. Se devuelve al origen sin tocar el tamaño del lienzo.
    setTimeout(function () {
      try { global.scrollTo(0, 0); } catch (err) {}
    }, 50);
  }, true);

  doc.addEventListener('focusout', function () {
    // 250 ms: lo que tarda la animación de cierre del teclado.
    setTimeout(function () {
      try { global.scrollTo(0, 0); } catch (err) {}
      actualizarConRetardo();
    }, 250);
  }, true);

  // Gesto de pellizco (pinch-zoom) sobre el juego: se corta. `user-scalable=no`
  // lo ignoran algunos navegadores, así que se bloquea también aquí.
  doc.addEventListener('touchmove', function (e) {
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }, { passive: false });
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (ev) {
    doc.addEventListener(ev, function (e) { e.preventDefault(); });
  });
  // Doble toque rápido = zoom en iOS. Se anula sin romper el toque simple.
  var ultimoToque = 0;
  doc.addEventListener('touchend', function (e) {
    var ahora = Date.now();
    if (ahora - ultimoToque < 320 && e.cancelable) e.preventDefault();
    ultimoToque = ahora;
  }, { passive: false });

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
