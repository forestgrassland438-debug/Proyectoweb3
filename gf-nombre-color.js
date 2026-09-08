/* =============================================================================
 * GF NOMBRE COLOR — el color del nombre del personaje
 * =============================================================================
 *
 * QUÉ HACE
 * ---------------------------------------------------------------------------
 * La tarjeta del dashboard, encima de "Language", con la paleta. El color
 * elegido se ve en TRES sitios y en las dos escenas (mapa y tienda):
 *
 *   · el cartel con tu nombre encima de tu personaje,
 *   · el mismo cartel de los DEMÁS jugadores, cada uno con el suyo,
 *   · el nombre delante de cada mensaje del chat general.
 *
 * DÓNDE VIVE EL COLOR
 * ---------------------------------------------------------------------------
 * En `GamePlayer.nameColor`, en el servidor. No en localStorage: si viviera en
 * el navegador, tú te verías de color y todos los demás te verían en blanco —
 * que es exactamente lo contrario de para lo que sirve elegir un color.
 *
 * Se guarda por el socket (`player:nameColor`) y no por /api/save, por dos
 * motivos: el cambio se ve al instante en la pantalla de todos los que estén en
 * tu sala, y no hay que arrastrar el inventario entero para cambiar un color.
 * /api/save también lo acepta y lo valida, por si llegara por ahí.
 *
 * EL COLOR DE OTRO JUGADOR NUNCA SE PINTA A CIEGAS
 * ---------------------------------------------------------------------------
 * Este valor acaba dentro de la pantalla de los demás. Se comprueba que sea
 * '#rrggbb' en el servidor (al guardarlo) y OTRA VEZ aquí antes de pintarlo.
 * Las dos veces hacen falta: la del servidor cierra la puerta, y la del cliente
 * es la que impide que un dato viejo o corrupto de la base de datos acabe en un
 * `style.color`.
 *
 * TODO EL TEXTO QUE VE EL JUGADOR ESTÁ EN INGLÉS.
 *
 * API
 * ---------------------------------------------------------------------------
 *   GFNombreColor.montar(scene)      engancha la tarjeta y aplica el color
 *   GFNombreColor.mio()              '#rrggbb' o null
 *   GFNombreColor.poner(color)       lo cambia y lo guarda
 *   GFNombreColor.valido(color)      '#rrggbb' o null
 *   GFNombreColor.aColorPhaser(c)    '#rrggbb' -> número, para setColor/tint
 *   GFNombreColor.aplicarAlLocal(scene)
 * ========================================================================== */
(function (global) {
  'use strict';

  var doc = global.document;

  /* El blanco de siempre. Es lo que se ve cuando nadie ha elegido nada, y el
     valor al que vuelve el botón "Default". */
  var POR_DEFECTO = '#ffffff';

  /* La paleta. Doce colores elegidos para que se lean sobre el mapa —que es
     verde y marrón— y con el contorno negro que llevan los carteles. Nada de
     verdes oscuros ni marrones: sobre la hierba desaparecerían. */
  var PALETA = [
    '#ffffff', '#ffd166', '#ff9f43', '#ff6b6b',
    '#ff8fd0', '#c77dff', '#8ab4ff', '#4cc9f0',
    '#3ddc84', '#b5e48c', '#ffe066', '#a0aec0'
  ];

  var miColor = null;
  var escena = null;
  var socket = null;

  function valido(c) {
    return (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) ? c.toLowerCase() : null;
  }

  /** '#rrggbb' -> 0xrrggbb, que es lo que quieren setColor/setTint de Phaser. */
  function aColorPhaser(c) {
    var v = valido(c);
    return v ? parseInt(v.slice(1), 16) : 0xffffff;
  }

  function socketVivo() {
    if (escena && typeof escena._socketVivo === 'function') {
      try { var s = escena._socketVivo(); if (s) return s; } catch (e) {}
    }
    return global.globalSocket || (escena && escena.socket) || null;
  }

  // ── Aplicar ───────────────────────────────────────────────────────────────

  /**
   * Pinta el cartel del jugador LOCAL.
   *
   * Las dos escenas llaman `usuariox` a su etiqueta, así que con una función
   * vale para las dos. `setColor` quiere una cadena '#rrggbb' (no un número):
   * es un estilo de texto, no un tinte.
   */
  function aplicarAlLocal(scene) {
    var s = scene || escena;
    if (!s || !s.usuariox || typeof s.usuariox.setColor !== 'function') return;
    try { s.usuariox.setColor(miColor || POR_DEFECTO); } catch (e) {}
  }

  /** Pinta el cartel de un jugador remoto. La llaman las escenas. */
  function aplicarARemoto(jugador, color) {
    if (!jugador || !jugador.nameText || typeof jugador.nameText.setColor !== 'function') return;
    var c = valido(color);
    jugador._nameColor = c;
    try { jugador.nameText.setColor(c || POR_DEFECTO); } catch (e) {}
  }

  // ── Guardar ───────────────────────────────────────────────────────────────

  function poner(color, silencioso) {
    var c = valido(color);
    // Cadena vacía o null = volver al blanco de siempre.
    miColor = c;
    aplicarAlLocal();
    pintarTarjeta();

    var s = socketVivo();
    if (!s || !s.connected) {
      if (!silencioso) avisar('No connection — the colour was not saved.', 'error');
      return false;
    }
    s.emit('player:nameColor', { color: c || '' });
    if (!silencioso) avisar(c ? 'Name colour saved.' : 'Name colour reset.', 'success');
    return true;
  }

  function avisar(texto, tipo) {
    try {
      if (global.GFAmigos && global.GFAmigos.aviso) { global.GFAmigos.aviso(texto, tipo); return; }
      if (escena && escena.notifications && escena.notifications.show) {
        escena.notifications.show(texto, tipo || 'info'); return;
      }
    } catch (e) {}
    try { console.log('[GFNombreColor]', texto); } catch (e) {}
  }

  // ── La tarjeta del dashboard ──────────────────────────────────────────────

  function pintarTarjeta() {
    var rejilla = doc.getElementById('gfnc-paleta');
    if (rejilla) {
      [].forEach.call(rejilla.children, function (b) {
        b.classList.toggle('on', (b.getAttribute('data-color') || '').toLowerCase() ===
                                 (miColor || POR_DEFECTO).toLowerCase());
      });
    }
    var muestra = doc.getElementById('gfnc-muestra');
    if (muestra) {
      muestra.style.color = miColor || POR_DEFECTO;
      var nombre = null;
      try {
        nombre = (escena && escena.Username && escena.Username !== '---') ? escena.Username : null;
        if (!nombre && global.GFAmigos && global.GFAmigos.miNombre) nombre = global.GFAmigos.miNombre();
      } catch (e) {}
      muestra.textContent = nombre || 'Your name';
    }
    var libre = doc.getElementById('gfnc-libre');
    if (libre) libre.value = miColor || POR_DEFECTO;
  }

  /**
   * Engancha la tarjeta.
   *
   * Es idempotente y se llama en cada entrada a una escena: el dashboard es DOM
   * de la página y sobrevive al cambio, pero sus manejadores apuntan a la
   * escena que los puso. Los botones se construyen una sola vez y el manejador
   * se REEMPLAZA, nunca se suma — si no, un viaje al mapa y vuelta guardaría el
   * color dos veces por clic.
   */
  function engancharTarjeta() {
    var rejilla = doc.getElementById('gfnc-paleta');
    if (!rejilla) return;                 // esta página no tiene dashboard

    if (!rejilla.dataset.gfncListo) {
      rejilla.dataset.gfncListo = '1';
      PALETA.forEach(function (c) {
        var b = doc.createElement('button');
        b.type = 'button';
        b.className = 'gfnc-color';
        b.setAttribute('data-color', c);
        b.setAttribute('aria-label', 'Use colour ' + c);
        b.title = c;
        b.style.background = c;
        b.addEventListener('click', function (e) { e.preventDefault(); poner(c); });
        rejilla.appendChild(b);
      });
    }

    var libre = doc.getElementById('gfnc-libre');
    if (libre && !libre.dataset.gfncListo) {
      libre.dataset.gfncListo = '1';
      /* 'change' y no 'input': el selector nativo dispara 'input' en cada
         movimiento del ratón dentro de la rueda de color. Con 'input' se
         mandaría una transacción por píxel recorrido. */
      libre.addEventListener('change', function () { poner(libre.value); });
    }

    var reset = doc.getElementById('gfnc-reset');
    if (reset) {
      if (reset._gfncClic) reset.removeEventListener('click', reset._gfncClic);
      reset._gfncClic = function (e) { e.preventDefault(); poner(null); };
      reset.addEventListener('click', reset._gfncClic);
    }

    pintarTarjeta();
  }

  // ── Socket ────────────────────────────────────────────────────────────────

  function enlazar() {
    var s = socketVivo();
    if (!s || socket === s) return s;
    socket = s;

    s.on('player:nameColor', function (d) {
      if (!d || !d.ok) return;
      miColor = valido(d.color);
      aplicarAlLocal();
      pintarTarjeta();
    });

    return s;
  }

  // ── Montaje ───────────────────────────────────────────────────────────────

  function montar(scene) {
    escena = scene || escena;
    enlazar();
    engancharTarjeta();

    /* De dónde sale el color al entrar: de lo que ya cargó la escena en
       /api/load. Si la escena todavía no lo tiene (la carga es asíncrona y
       create() no la espera), se vuelve a mirar un par de veces — es un dato
       de pantalla, así que no pasa nada por llegar un segundo tarde, pero
       tampoco puede quedarse sin aplicar. */
    var intentos = 0;
    var mirar = function () {
      intentos++;
      var c = null;
      try { c = valido(escena && escena.nameColor); } catch (e) {}
      if (c && c !== miColor) {
        miColor = c;
        aplicarAlLocal();
        pintarTarjeta();
      }
      if (miColor) aplicarAlLocal();
      if (intentos < 6) setTimeout(mirar, 1200);
    };
    mirar();

    return true;
  }

  function desmontar(scene) {
    if (escena === scene) escena = null;
  }

  global.GFNombreColor = {
    montar: montar,
    desmontar: desmontar,
    poner: poner,
    mio: function () { return miColor; },
    valido: valido,
    aColorPhaser: aColorPhaser,
    aplicarAlLocal: aplicarAlLocal,
    aplicarARemoto: aplicarARemoto,
    POR_DEFECTO: POR_DEFECTO,
    PALETA: PALETA.slice()
  };

})(window);
