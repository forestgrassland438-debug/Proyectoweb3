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
 *   GFNombreColor.montar(scene)      engancha las tarjetas y aplica los colores
 *   GFNombreColor.mio()              '#rrggbb' o null (personaje)
 *   GFNombreColor.mioMascota()       '#rrggbb' o null (mascota)
 *   GFNombreColor.poner(color, silencioso, 'personaje'|'mascota')
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
  var miColorMascota = null;
  var escena = null;
  var socket = null;

  /* LAS DOS TARJETAS SON LA MISMA MÁQUINA.
     El personaje y la mascota se eligen igual, se guardan igual y se pintan
     igual: lo único que cambia es qué cartel se tiñe y por qué evento viaja.
     Con una tabla, añadir el color de un tercer cartel (una montura, un
     gremio) sería una fila más, no otra copia del módulo. */
  var QUIEN = {
    personaje: {
      prefijo: 'gfnc',
      evento:  'player:nameColor',
      campo:   'nameColor',
      leer:    function () { return miColor; },
      poner:   function (c) { miColor = c; },
      aplicar: function (sc) { pintarCartel(sc, 'usuariox', miColor); }
    },
    mascota: {
      prefijo: 'gfnp',
      evento:  'player:petNameColor',
      campo:   'petNameColor',
      leer:    function () { return miColorMascota; },
      poner:   function (c) { miColorMascota = c; },
      aplicar: function (sc) { pintarCartel(sc, 'dogNameText', miColorMascota); }
    }
  };

  /** Tiñe un cartel de texto de la escena, si existe. */
  function pintarCartel(scene, propiedad, color) {
    var sc = scene || escena;
    var t = sc && sc[propiedad];
    if (!t || typeof t.setColor !== 'function') return;
    try { t.setColor(color || POR_DEFECTO); } catch (e) {}
  }

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
    QUIEN.personaje.aplicar(s);
    QUIEN.mascota.aplicar(s);
  }

  /** Pinta el cartel de un jugador remoto. La llaman las escenas. */
  function aplicarARemoto(jugador, color) {
    if (!jugador || !jugador.nameText || typeof jugador.nameText.setColor !== 'function') return;
    var c = valido(color);
    jugador._nameColor = c;
    try { jugador.nameText.setColor(c || POR_DEFECTO); } catch (e) {}
  }

  /** Y el de su mascota. */
  function aplicarAMascotaRemota(jugador, color) {
    if (!jugador || !jugador.dog || !jugador.dog.nameText) return;
    if (typeof jugador.dog.nameText.setColor !== 'function') return;
    var c = valido(color);
    jugador._petNameColor = c;
    try { jugador.dog.nameText.setColor(c || POR_DEFECTO); } catch (e) {}
  }

  // ── Guardar ───────────────────────────────────────────────────────────────

  function poner(color, silencioso, quien) {
    var q = QUIEN[quien || 'personaje'];
    var c = valido(color);
    // Cadena vacía o null = volver al blanco de siempre.
    q.poner(c);
    q.aplicar();
    pintarTarjeta();

    var s = socketVivo();
    if (!s || !s.connected) {
      if (!silencioso) avisar('No connection — the colour was not saved.', 'error');
      return false;
    }
    s.emit(q.evento, { color: c || '' });
    if (!silencioso) {
      var quePinta = (quien === 'mascota') ? 'Pet name colour' : 'Name colour';
      avisar(quePinta + (c ? ' saved.' : ' reset.'), 'success');
    }
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

  /** El nombre que se enseña en cada muestra. */
  function nombreDe(quien) {
    try {
      if (quien === 'mascota') {
        var p = (escena && escena.petName) || global.globalPetName || null;
        return (p && p !== '---') ? p : 'Your pet';
      }
      var n = (escena && escena.Username && escena.Username !== '---') ? escena.Username : null;
      if (!n && global.GFAmigos && global.GFAmigos.miNombre) n = global.GFAmigos.miNombre();
      return n || 'Your name';
    } catch (e) { return quien === 'mascota' ? 'Your pet' : 'Your name'; }
  }

  function pintarTarjeta() {
    Object.keys(QUIEN).forEach(function (quien) {
      var q = QUIEN[quien];
      var color = q.leer();
      var rejilla = doc.getElementById(q.prefijo + '-paleta');
      if (rejilla) {
        [].forEach.call(rejilla.children, function (b) {
          b.classList.toggle('on', (b.getAttribute('data-color') || '').toLowerCase() ===
                                   (color || POR_DEFECTO).toLowerCase());
        });
      }
      var muestra = doc.getElementById(q.prefijo + '-muestra');
      if (muestra) {
        muestra.style.color = color || POR_DEFECTO;
        muestra.textContent = nombreDe(quien);
      }
      var libre = doc.getElementById(q.prefijo + '-libre');
      if (libre) libre.value = color || POR_DEFECTO;
    });
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
    Object.keys(QUIEN).forEach(function (quien) {
      var q = QUIEN[quien];
      var rejilla = doc.getElementById(q.prefijo + '-paleta');
      if (!rejilla) return;               // esta página no tiene esa tarjeta

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
          b.addEventListener('click', function (e) { e.preventDefault(); poner(c, false, quien); });
          rejilla.appendChild(b);
        });
      }

      var libre = doc.getElementById(q.prefijo + '-libre');
      if (libre && !libre.dataset.gfncListo) {
        libre.dataset.gfncListo = '1';
        /* 'change' y no 'input': el selector nativo dispara 'input' en cada
           movimiento del ratón dentro de la rueda de color. Con 'input' se
           mandaría una transacción por píxel recorrido. */
        libre.addEventListener('change', function () { poner(libre.value, false, quien); });
      }

      var reset = doc.getElementById(q.prefijo + '-reset');
      if (reset) {
        if (reset._gfncClic) reset.removeEventListener('click', reset._gfncClic);
        reset._gfncClic = function (e) { e.preventDefault(); poner(null, false, quien); };
        reset.addEventListener('click', reset._gfncClic);
      }
    });

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

    s.on('player:petNameColor', function (d) {
      if (!d || !d.ok) return;
      miColorMascota = valido(d.color);
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
    /* UNA SOLA CADENA DE COMPROBACIÓN.

       `montar()` se llama en cada entrada a una escena —mapa, tienda y cada
       despertar—, y arrancaba seis `setTimeout` encadenados cada vez. A la
       tercera visita había tres cadenas haciendo exactamente lo mismo. */
    if (global.__gfncMirando) return true;
    global.__gfncMirando = true;

    var intentos = 0;
    var mirar = function () {
      intentos++;
      var cambio = false;
      try {
        var c = valido(escena && escena.nameColor);
        if (c && c !== miColor) { miColor = c; cambio = true; }
        var p = valido(escena && escena.petNameColor);
        if (p && p !== miColorMascota) { miColorMascota = p; cambio = true; }
      } catch (e) {}
      if (cambio) pintarTarjeta();
      /* Se reaplica SIEMPRE, no solo cuando cambia: los carteles del personaje
         y de la mascota se crean dentro del create() de la escena, que puede
         terminar después de esto. Si solo se pintara al cambiar, el primer
         cartel nacería en blanco y ahí se quedaría. */
      aplicarAlLocal();
      if (intentos < 6) setTimeout(mirar, 1200);
      else global.__gfncMirando = false;   // la próxima escena puede volver a mirar
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
    mioMascota: function () { return miColorMascota; },
    valido: valido,
    aColorPhaser: aColorPhaser,
    aplicarAlLocal: aplicarAlLocal,
    aplicarARemoto: aplicarARemoto,
    aplicarAMascotaRemota: aplicarAMascotaRemota,
    POR_DEFECTO: POR_DEFECTO,
    PALETA: PALETA.slice()
  };

})(window);
