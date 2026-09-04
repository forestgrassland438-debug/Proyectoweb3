/* ===========================================================================
 * ARTE DE LAS BATALLAS: ESCENARIOS Y EFECTOS, DIBUJADOS AL VUELO
 *
 * QUÉ HACE
 *   Dibuja con canvas todo lo que la batalla necesita ver: cinco escenarios
 *   distintos y las dieciséis piezas con las que se montan los efectos
 *   (zarpazos, impactos, escudos, curas, veneno, aturdimiento, fuego, hielo,
 *   rayos, chispas, ondas, humo, sombras…).
 *
 * POR QUÉ DIBUJADO Y NO EN PNG
 *   Porque así no hay nada que subir, nada que se quede a medias en el
 *   despliegue y nada que pese en la primera carga. Ese fallo ya pasó una vez
 *   en este proyecto: faltaban catorce PNG de clima en producción y el clima
 *   entero se quedó sin funcionar durante semanas. Lo que se dibuja aquí
 *   existe siempre, en cualquier máquina, sin depender del servidor de
 *   ficheros. Y además cada escenario puede variar con una semilla, cosa que
 *   una imagen fija no puede hacer.
 *
 * CÓMO SE USA
 *   GFBatallaArte.efectos(scene)          crea las piezas de los efectos
 *   GFBatallaArte.arena(scene, id)        crea (una vez) el fondo de un
 *                                         escenario y devuelve su clave
 *   GFBatallaArte.elegirArena(semilla)    escenario estable para una batalla
 *   GFBatallaArte.ARENAS                  la lista, para el menú de pruebas
 *
 * TODO ES OPCIONAL
 *   Si `createCanvas` falla —contexto perdido, memoria— cada función devuelve
 *   null y quien llama sigue con lo que tenga. Nunca lanza.
 * ======================================================================== */
(function () {
  'use strict';

  var PREFIJO = 'bfx_';

  function log() {
    if (!window.GF_BATALLA_DEBUG) return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[batalla-arte]');
    console.log.apply(console, a);
  }

  /**
   * Crea una textura de canvas y la pinta con `pintor(ctx, w, h)`.
   * Devuelve la clave, o null si no se pudo.
   */
  function lienzo(scene, clave, w, h, pintor) {
    if (!scene || !scene.textures) return null;
    if (scene.textures.exists(clave)) return clave;
    try {
      var c = scene.textures.createCanvas(clave, w, h);
      if (!c) return null;
      var ctx = c.getContext();
      pintor(ctx, w, h);
      c.refresh();
      return clave;
    } catch (e) {
      log('no se pudo crear', clave, e && e.message);
      try { scene.textures.remove(clave); } catch (e2) {}
      return null;
    }
  }

  /* Azar REPETIBLE. Los escenarios se dibujan con una semilla para que la
     misma batalla se vea igual si la escena se recrea (volver del menú, girar
     el teléfono) — un fondo que cambia solo al rotar la pantalla parece un
     fallo. Es un generador congruencial de toda la vida: corto, sin
     dependencias y más que suficiente para colocar piedras. */
  function dado(semilla) {
    var s = (semilla >>> 0) || 1;
    return function (a, b) {
      s = (s * 1664525 + 1013904223) >>> 0;
      var r = s / 4294967296;
      return a === undefined ? r : a + r * ((b === undefined ? 1 : b) - a);
    };
  }

  function rgba(c, a) {
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  function mezcla(a, b, t) {
    return [Math.round(a[0] + (b[0] - a[0]) * t),
            Math.round(a[1] + (b[1] - a[1]) * t),
            Math.round(a[2] + (b[2] - a[2]) * t)];
  }

  // ══════════════════════════════════════════════════════════════════════
  //  LOS ESCENARIOS
  // ══════════════════════════════════════════════════════════════════════
  /* Cada escenario es una paleta y cuatro interruptores. El dibujo es siempre
     el mismo —cielo, astro, nubes, dos filas de montañas, la línea del suelo,
     el suelo con su grano, matojos y piedras, niebla y viñeta— y lo que
     cambia es de qué color es cada capa. Es como se pinta un fondo de verdad:
     la composición no cambia, cambia la luz.

     `suelo` es la fracción de altura a la que está la LÍNEA DEL SUELO. Importa
     mucho más de lo que parece: es donde la escena planta a los luchadores, y
     si no coincide con el dibujo, los bichos flotan.

     Y está ALTA a propósito (0,56-0,58, no 0,70). La franja de abajo de la
     pantalla no es del escenario: es de la mano de cartas. Con el horizonte a
     dos tercios, los luchadores caían justo detrás de las cartas y se les veía
     medio cuerpo — que es lo que se veía en la captura del jugador. Subiendo
     la línea, el terreno de juego queda entero por encima de la mano. */
  var ARENAS = {
    pradera: {
      nombre: 'Green Meadow', suelo: 0.56,
      cielo: [[132, 205, 242], [196, 232, 246], [231, 243, 236]],
      lejos: [[126, 158, 176], [104, 140, 162]],
      cerca: [[92, 132, 92], [70, 108, 74]],
      tierra: [[196, 178, 124], [156, 136, 92]],
      astro: 'sol', astroXY: [0.78, 0.16], luz: [255, 246, 214],
      mata: [86, 132, 74], piedra: [150, 148, 140], niebla: [226, 240, 236],
      silueta: 'copa', siluetaColor: [52, 84, 58], siluetaN: 10
    },
    bosque: {
      nombre: 'Deep Woods', suelo: 0.58,
      cielo: [[62, 96, 96], [104, 144, 122], [160, 186, 140]],
      lejos: [[44, 70, 62], [34, 56, 50]],
      cerca: [[30, 52, 40], [22, 40, 32]],
      tierra: [[86, 76, 56], [58, 52, 38]],
      astro: 'sol', astroXY: [0.22, 0.12], luz: [230, 246, 190],
      mata: [46, 82, 50], piedra: [96, 100, 92], niebla: [150, 180, 150],
      silueta: 'pino', siluetaColor: [14, 26, 20], siluetaN: 14,
      rayos: true
    },
    canon: {
      nombre: 'Red Canyon', suelo: 0.58,
      cielo: [[240, 168, 110], [246, 206, 148], [250, 232, 194]],
      lejos: [[168, 100, 78], [140, 78, 62]],
      cerca: [[126, 68, 52], [98, 52, 42]],
      tierra: [[210, 152, 104], [168, 114, 76]],
      astro: 'sol', astroXY: [0.5, 0.22], luz: [255, 232, 176],
      mata: [140, 116, 62], piedra: [162, 110, 82], niebla: [246, 210, 168],
      silueta: 'cactus', siluetaColor: [92, 62, 48], siluetaN: 7
    },
    nieve: {
      nombre: 'Frozen Field', suelo: 0.57,
      cielo: [[142, 176, 214], [190, 214, 236], [226, 238, 246]],
      lejos: [[150, 172, 198], [124, 148, 180]],
      cerca: [[198, 214, 232], [172, 192, 214]],
      tierra: [[236, 243, 250], [206, 220, 236]],
      astro: 'sol', astroXY: [0.66, 0.14], luz: [255, 255, 250],
      mata: [150, 176, 196], piedra: [176, 190, 206], niebla: [236, 244, 250],
      silueta: 'pino', siluetaColor: [126, 148, 176], siluetaN: 11,
      nevando: true
    },
    noche: {
      nombre: 'Moonlit Ruins', suelo: 0.58,
      cielo: [[16, 20, 44], [34, 40, 76], [66, 74, 110]],
      lejos: [[34, 40, 68], [24, 30, 54]],
      cerca: [[22, 28, 46], [14, 20, 34]],
      tierra: [[54, 58, 78], [36, 40, 58]],
      astro: 'luna', astroXY: [0.74, 0.14], luz: [212, 226, 255],
      mata: [40, 60, 62], piedra: [70, 76, 96], niebla: [70, 84, 120],
      silueta: 'ruina', siluetaColor: [10, 14, 26], siluetaN: 8,
      estrellas: true, luciernagas: true
    }
  };

  var ORDEN_ARENAS = Object.keys(ARENAS);

  /** Una silueta de montañas, dibujada como una cordillera de picos. */
  function cordillera(ctx, w, y0, alto, color, rnd, picos) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-10, y0 + alto);
    var n = picos || 7;
    var paso = (w + 40) / n;
    for (var i = 0; i <= n; i++) {
      var x = -20 + i * paso;
      var h = alto * rnd(0.35, 1.0);
      // Cada pico con su valle: se traza el subir y el bajar por separado
      // para que no salga una sierra de dientes iguales.
      ctx.lineTo(x - paso * 0.32, y0 + alto - h * rnd(0.15, 0.45));
      ctx.lineTo(x, y0 + alto - h);
    }
    ctx.lineTo(w + 20, y0 + alto);
    ctx.closePath();
    ctx.fill();
  }

  /** Colinas redondas del plano medio. */
  function colinas(ctx, w, yBase, color, rnd, n) {
    ctx.fillStyle = color;
    for (var i = 0; i < n; i++) {
      var cx = rnd(-40, w + 40);
      var r = rnd(w * 0.10, w * 0.26);
      ctx.beginPath();
      ctx.ellipse(cx, yBase + r * 0.35, r, r * rnd(0.30, 0.5), 0, Math.PI, 0);
      ctx.fill();
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     LA LÍNEA DE SILUETAS DEL HORIZONTE
     ──────────────────────────────────────────────────────────────────────
     Sin esto, los escenarios eran cielo, montañas y una explanada — correctos
     pero vacíos, y sobre todo TODOS IGUALES salvo por el color. Lo que le da
     carácter a un fondo no son las montañas del fondo del fondo: es la fila de
     cosas que hay justo detrás de donde peleas, porque es lo único a lo que el
     ojo le puede poner escala.

     Van en silueta oscura y a media opacidad, no dibujadas con detalle: están
     a contraluz y compiten con los luchadores, que son lo que hay que mirar.
     ══════════════════════════════════════════════════════════════════════ */
  function siluetas(ctx, w, yBase, color, rnd, tipo, n) {
    ctx.fillStyle = color;
    for (var i = 0; i < n; i++) {
      var x = rnd(-20, w + 20);
      var alto = rnd(w * 0.045, w * 0.11);
      var ancho = alto * rnd(0.45, 0.85);

      if (tipo === 'pino') {
        // Tres pisos de triángulo y un tronquito: el pino de manual.
        for (var p = 0; p < 3; p++) {
          var f = 1 - p * 0.24;
          var yTop = yBase - alto * (0.30 + p * 0.30);
          ctx.beginPath();
          ctx.moveTo(x, yTop - alto * 0.36 * f);
          ctx.lineTo(x - ancho * 0.5 * f, yTop);
          ctx.lineTo(x + ancho * 0.5 * f, yTop);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillRect(x - ancho * 0.07, yBase - alto * 0.32, ancho * 0.14, alto * 0.32);

      } else if (tipo === 'copa') {
        // Árbol de copa redonda.
        ctx.fillRect(x - ancho * 0.08, yBase - alto * 0.55, ancho * 0.16, alto * 0.55);
        ctx.beginPath();
        ctx.ellipse(x, yBase - alto * 0.72, ancho * 0.62, alto * 0.40, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x - ancho * 0.38, yBase - alto * 0.55, ancho * 0.38, alto * 0.26, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + ancho * 0.36, yBase - alto * 0.58, ancho * 0.36, alto * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();

      } else if (tipo === 'cactus') {
        var tr = ancho * 0.22;
        ctx.fillRect(x - tr / 2, yBase - alto, tr, alto);
        // los dos brazos, a alturas distintas para que no parezca un tenedor
        ctx.fillRect(x - ancho * 0.46, yBase - alto * 0.66, ancho * 0.46, tr * 0.8);
        ctx.fillRect(x - ancho * 0.46, yBase - alto * 0.90, tr * 0.8, alto * 0.28);
        ctx.fillRect(x + tr / 2, yBase - alto * 0.52, ancho * 0.40, tr * 0.8);
        ctx.fillRect(x + ancho * 0.40, yBase - alto * 0.78, tr * 0.8, alto * 0.30);

      } else {   // 'ruina': columnas y muros rotos
        var alt2 = alto * rnd(0.5, 1);
        ctx.fillRect(x, yBase - alt2, ancho * 0.30, alt2);
        if (rnd() < 0.5) ctx.fillRect(x - ancho * 0.6, yBase - alt2 * 0.6, ancho * 0.42, alt2 * 0.6);
        ctx.fillRect(x - ancho * 0.7, yBase - alt2 * 1.06, ancho * 1.4, alt2 * 0.10);
      }
    }
  }

  function pintarArena(ctx, w, h, cfg, semilla) {
    var rnd = dado(semilla);
    var ySuelo = Math.round(h * cfg.suelo);

    // ── CIELO ──
    var g = ctx.createLinearGradient(0, 0, 0, ySuelo);
    g.addColorStop(0.00, rgba(cfg.cielo[0], 1));
    g.addColorStop(0.62, rgba(cfg.cielo[1], 1));
    g.addColorStop(1.00, rgba(cfg.cielo[2], 1));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, ySuelo + 2);

    // ── ESTRELLAS (solo de noche) ──
    if (cfg.estrellas) {
      for (var s = 0; s < 90; s++) {
        var sx = rnd(0, w), sy = rnd(0, ySuelo * 0.75);
        var br = rnd(0.25, 1);
        ctx.fillStyle = 'rgba(255,255,255,' + (br * 0.85) + ')';
        ctx.fillRect(sx, sy, br < 0.7 ? 1 : 2, br < 0.7 ? 1 : 2);
      }
    }

    // ── EL ASTRO y su halo ──
    var ax = w * cfg.astroXY[0], ay = h * cfg.astroXY[1];
    var rAstro = Math.min(w, h) * (cfg.astro === 'luna' ? 0.055 : 0.048);
    var halo = ctx.createRadialGradient(ax, ay, 0, ax, ay, rAstro * 7);
    halo.addColorStop(0.00, rgba(cfg.luz, 0.55));
    halo.addColorStop(0.30, rgba(cfg.luz, 0.16));
    halo.addColorStop(1.00, rgba(cfg.luz, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(ax - rAstro * 7, ay - rAstro * 7, rAstro * 14, rAstro * 14);
    ctx.fillStyle = rgba(cfg.luz, 0.95);
    ctx.beginPath(); ctx.arc(ax, ay, rAstro, 0, Math.PI * 2); ctx.fill();
    if (cfg.astro === 'luna') {
      // La luna se hace con una mordida: un círculo del color del cielo encima.
      ctx.fillStyle = rgba(cfg.cielo[0], 1);
      ctx.beginPath();
      ctx.arc(ax + rAstro * 0.42, ay - rAstro * 0.30, rAstro * 0.92, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── NUBES ──
    if (!cfg.estrellas) {
      for (var n = 0; n < 7; n++) {
        var cx = rnd(0, w), cy = rnd(h * 0.05, ySuelo * 0.55);
        var esc = rnd(0.5, 1.35);
        ctx.fillStyle = 'rgba(255,255,255,' + rnd(0.18, 0.42) + ')';
        for (var b = 0; b < 5; b++) {
          var bx = cx + (b - 2) * 26 * esc + rnd(-8, 8);
          var by = cy + rnd(-6, 6);
          ctx.beginPath();
          ctx.ellipse(bx, by, rnd(22, 42) * esc, rnd(10, 18) * esc, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // ── DOS FILAS DE MONTAÑAS Y DOS DE COLINAS ──
    cordillera(ctx, w, ySuelo - h * 0.32, h * 0.32, rgba(cfg.lejos[0], 1), rnd, 6);
    cordillera(ctx, w, ySuelo - h * 0.23, h * 0.23, rgba(cfg.lejos[1], 1), rnd, 9);
    /* Las colinas suben POR ENCIMA de la línea del suelo. Antes se dibujaban
       justo en ella y quedaban enterradas: se veía una franja verde de tres
       píxeles y nada más. Ahora asoman de verdad y hacen de plano medio. */
    colinas(ctx, w, ySuelo - h * 0.075, rgba(cfg.cerca[0], 1), rnd, 5);
    colinas(ctx, w, ySuelo - h * 0.015, rgba(cfg.cerca[1], 1), rnd, 4);

    // ── LA FILA DE SILUETAS, justo detrás del terreno de juego ──
    if (cfg.silueta) {
      siluetas(ctx, w, ySuelo + h * 0.008, rgba(cfg.siluetaColor || cfg.cerca[1], 0.92),
               rnd, cfg.silueta, cfg.siluetaN || 9);
    }

    // ── NIEBLA EN EL HORIZONTE ──
    // Es lo que separa el fondo del terreno de juego. Sin ella, las montañas
    // se pegan al suelo y todo parece una sola calcomanía.
    var nb = ctx.createLinearGradient(0, ySuelo - h * 0.14, 0, ySuelo + h * 0.03);
    nb.addColorStop(0, rgba(cfg.niebla, 0));
    nb.addColorStop(0.7, rgba(cfg.niebla, 0.55));
    nb.addColorStop(1, rgba(cfg.niebla, 0.15));
    ctx.fillStyle = nb;
    ctx.fillRect(0, ySuelo - h * 0.14, w, h * 0.17);

    // ── EL SUELO ──
    var gs = ctx.createLinearGradient(0, ySuelo, 0, h);
    gs.addColorStop(0.00, rgba(cfg.tierra[0], 1));
    gs.addColorStop(1.00, rgba(cfg.tierra[1], 1));
    ctx.fillStyle = gs;
    ctx.fillRect(0, ySuelo, w, h - ySuelo);

    /* GRANO DEL SUELO. Un degradado liso se ve como plástico. Con unas manchas
       ovaladas y muy transparentes, repartidas más densas hacia abajo, el
       suelo coge textura sin que se distinga ni una sola de las manchas. */
    for (var t = 0; t < 260; t++) {
      var ty = ySuelo + Math.pow(rnd(), 0.6) * (h - ySuelo);
      var tx = rnd(0, w);
      var claro = rnd() < 0.5;
      ctx.fillStyle = claro ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      ctx.beginPath();
      ctx.ellipse(tx, ty, rnd(6, 34), rnd(2, 7), rnd(-0.3, 0.3), 0, Math.PI * 2);
      ctx.fill();
    }

    // ── PIEDRAS Y MATOJOS ──
    for (var p = 0; p < 14; p++) {
      var px = rnd(0, w);
      // Cuanto más abajo, más grande: es la perspectiva del suelo.
      var prof = rnd(0, 1);
      var py = ySuelo + prof * (h - ySuelo) * 0.95;
      var tam = 5 + prof * 22;
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.beginPath();
      ctx.ellipse(px, py + tam * 0.36, tam * 1.1, tam * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      if (rnd() < 0.55) {
        ctx.fillStyle = rgba(cfg.piedra, 0.95);
        ctx.beginPath();
        ctx.ellipse(px, py, tam, tam * 0.72, rnd(-0.4, 0.4), Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.beginPath();
        ctx.ellipse(px - tam * 0.25, py - tam * 0.25, tam * 0.45, tam * 0.28, 0, Math.PI, 0);
        ctx.fill();
      } else {
        ctx.strokeStyle = rgba(cfg.mata, 0.95);
        ctx.lineWidth = Math.max(1, tam * 0.14);
        for (var hb = 0; hb < 5; hb++) {
          ctx.beginPath();
          ctx.moveTo(px + (hb - 2) * tam * 0.22, py);
          ctx.quadraticCurveTo(px + (hb - 2) * tam * 0.4, py - tam * 0.7,
                               px + (hb - 2) * tam * 0.75, py - tam * rnd(0.7, 1.2));
          ctx.stroke();
        }
      }
    }

    // ── HACES DE LUZ (bosque) ──
    if (cfg.rayos) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var r = 0; r < 5; r++) {
        var rx = rnd(0, w);
        var gr = ctx.createLinearGradient(rx, 0, rx + w * 0.16, ySuelo);
        gr.addColorStop(0, rgba(cfg.luz, 0.16));
        gr.addColorStop(1, rgba(cfg.luz, 0));
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.moveTo(rx - w * 0.03, -10);
        ctx.lineTo(rx + w * 0.03, -10);
        ctx.lineTo(rx + w * 0.19, ySuelo);
        ctx.lineTo(rx + w * 0.10, ySuelo);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // ── COPOS QUIETOS (nieve) y LUCIÉRNAGAS (noche) ──
    if (cfg.nevando) {
      for (var cq = 0; cq < 70; cq++) {
        ctx.fillStyle = 'rgba(255,255,255,' + rnd(0.25, 0.7) + ')';
        var qx = rnd(0, w), qy = rnd(0, h), qr = rnd(1, 2.6);
        ctx.beginPath(); ctx.arc(qx, qy, qr, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (cfg.luciernagas) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var lc = 0; lc < 26; lc++) {
        var lx = rnd(0, w), ly = rnd(ySuelo - h * 0.22, h * 0.96);
        var lr = rnd(3, 9);
        var lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
        lg.addColorStop(0, 'rgba(200,255,150,0.9)');
        lg.addColorStop(1, 'rgba(160,255,120,0)');
        ctx.fillStyle = lg;
        ctx.fillRect(lx - lr, ly - lr, lr * 2, lr * 2);
      }
      ctx.restore();
    }

    /* ── LA SOMBRA DEL SUELO Y LA VIÑETA ──
       Las dos hacen lo mismo: meter a los luchadores DENTRO de la escena en
       vez de dejarlos pegados encima. La banda oscura de abajo es el suelo en
       sombra, sobre el que se apoyan; la viñeta cierra los bordes y lleva la
       mirada al centro, que es donde pasa el combate. */
    var som = ctx.createLinearGradient(0, h * 0.72, 0, h);
    som.addColorStop(0, 'rgba(0,0,0,0)');
    som.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = som;
    ctx.fillRect(0, h * 0.72, w, h * 0.28);

    var vg = ctx.createRadialGradient(w / 2, h * 0.52, Math.min(w, h) * 0.30,
                                      w / 2, h * 0.52, Math.max(w, h) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.7, 'rgba(0,0,0,0.14)');
    vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  /**
   * Crea (una sola vez) la textura de un escenario.
   * Devuelve { clave, suelo, cfg } o null.
   */
  function arena(scene, id, semilla) {
    var cfg = ARENAS[id] || ARENAS.pradera;
    var sem = (semilla >>> 0) || 12345;
    var clave = PREFIJO + 'arena_' + id + '_' + sem;
    /* 1024×576 y no la resolución de pantalla: es 16:9, se estira sin
       deformarse a cualquier tamaño y ocupa 2,3 MB de VRAM. Subirlo a 1920
       serían 8 MB por un detalle que, escalado, no se distingue. */
    var W = 1024, H = 576;
    var hecha = lienzo(scene, clave, W, H, function (ctx, w, h) {
      pintarArena(ctx, w, h, cfg, sem);
    });
    if (!hecha) return null;
    return { clave: clave, suelo: cfg.suelo, cfg: cfg, nombre: cfg.nombre };
  }

  /** Un escenario estable para una batalla concreta. */
  function elegirArena(semilla) {
    var s = 0, txt = String(semilla == null ? Math.random() : semilla);
    for (var i = 0; i < txt.length; i++) s = (s * 31 + txt.charCodeAt(i)) >>> 0;
    return ORDEN_ARENAS[s % ORDEN_ARENAS.length];
  }

  // ══════════════════════════════════════════════════════════════════════
  //  LAS PIEZAS DE LOS EFECTOS
  // ══════════════════════════════════════════════════════════════════════
  /* Todas se dibujan en BLANCO. El color se lo pone la escena con setTint, así
     que una misma pieza sirve para el veneno (verde), el fuego (naranja) y el
     hielo (celeste). Es la diferencia entre dieciséis texturas y cuarenta. */

  var EFECTOS = {
    // Un punto blando. Es la pieza más usada: chispas, motas, destellos.
    chispa: [32, 32, function (ctx, w, h) {
      var g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0.00, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
      g.addColorStop(1.00, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }],

    // Anillo de choque: la onda que sale del impacto.
    anillo: [128, 128, function (ctx, w, h) {
      ctx.strokeStyle = 'rgba(255,255,255,1)';
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 8, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 20, 0, Math.PI * 2); ctx.stroke();
    }],

    // Anillo aplastado: la onda vista desde arriba, a ras de suelo.
    onda: [160, 64, function (ctx, w, h) {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, w / 2 - 6, h / 2 - 6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }],

    /* ZARPAZO: tres arañazos curvos. Se dibuja como un arco que empieza fino,
       se ensancha y vuelve a afinarse — un trazo de ancho constante se ve como
       un tubo, no como un corte. */
    zarpazo: [192, 192, function (ctx, w, h) {
      var PASOS = 26;
      /* Cada arañazo se traza como UNA figura cerrada: se recorre el borde de
         fuera de principio a fin y el de dentro de vuelta. El grosor va con
         sen(πt), o sea cero en las puntas y máximo en el medio — eso es lo que
         convierte un arco en un CORTE. Con un grosor constante salía un tubo. */
      for (var i = 0; i < 3; i++) {
        var sep = (i - 1) * 24;
        var largo = 1.5 + (i === 1 ? 0.35 : 0);   // el del medio, más largo
        var gordo = (i === 1 ? 11 : 8);
        var rBase = w * 0.40 + sep;
        var a0 = -largo / 2 - 0.15;

        ctx.beginPath();
        var s, t, ang, g, r;
        for (s = 0; s <= PASOS; s++) {
          t = s / PASOS;
          ang = a0 + t * largo;
          g = Math.sin(t * Math.PI) * gordo;
          r = rBase + g;
          var x = w / 2 + Math.cos(ang) * r * 0.92;
          var y = h / 2 + Math.sin(ang) * r;
          if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        for (s = PASOS; s >= 0; s--) {
          t = s / PASOS;
          ang = a0 + t * largo;
          g = Math.sin(t * Math.PI) * gordo;
          r = rBase - g;
          ctx.lineTo(w / 2 + Math.cos(ang) * r * 0.92,
                     h / 2 + Math.sin(ang) * r);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,' + (i === 1 ? 1 : 0.8) + ')';
        ctx.fill();
      }
    }],

    // Estallido de impacto: una estrella de puntas desiguales.
    estallido: [160, 160, function (ctx, w, h) {
      var puntas = 12;
      ctx.beginPath();
      for (var i = 0; i < puntas * 2; i++) {
        var a = (i / (puntas * 2)) * Math.PI * 2;
        var largo = (i % 2 === 0)
          ? w / 2 * (0.72 + 0.28 * Math.abs(Math.sin(i * 2.3)))
          : w / 2 * 0.30;
        var x = w / 2 + Math.cos(a) * largo;
        var y = h / 2 + Math.sin(a) * largo;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fill();
      var g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }],

    // Escudo hexagonal, con su rejilla: se lee como energía, no como un plato.
    escudo: [160, 176, function (ctx, w, h) {
      var cx = w / 2, cy = h / 2, r = w * 0.46;
      function hexa(rr) {
        ctx.beginPath();
        for (var i = 0; i < 6; i++) {
          var a = -Math.PI / 2 + i * Math.PI / 3;
          var x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 1.1;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
      }
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0.00, 'rgba(255,255,255,0.05)');
      g.addColorStop(0.72, 'rgba(255,255,255,0.18)');
      g.addColorStop(1.00, 'rgba(255,255,255,0.42)');
      hexa(r); ctx.fillStyle = g; ctx.fill();
      hexa(r); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 4; ctx.stroke();
      hexa(r * 0.72); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.stroke();
      // radios de la rejilla
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2;
      for (var i2 = 0; i2 < 6; i2++) {
        var a2 = -Math.PI / 2 + i2 * Math.PI / 3;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a2) * r, cy + Math.sin(a2) * r * 1.1); ctx.stroke();
      }
    }],

    // Cruz de curación con brillo.
    cruz: [96, 96, function (ctx, w, h) {
      var b = w * 0.22, l = w * 0.68;
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.fillRect(w / 2 - b / 2, h / 2 - l / 2, b, l);
      ctx.fillRect(w / 2 - l / 2, h / 2 - b / 2, l, b);
      var g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }],

    // Burbuja: veneno, y también lo que sale del agua.
    burbuja: [48, 48, function (ctx, w, h) {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 5, 0, Math.PI * 2); ctx.fill();
      // el brillito de arriba a la izquierda: sin él no parece una burbuja
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(w * 0.35, h * 0.32, w * 0.09, 0, Math.PI * 2); ctx.fill();
    }],

    // Estrellita de cuatro puntas: aturdimiento y destellos.
    estrella: [64, 64, function (ctx, w, h) {
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.beginPath();
      for (var i = 0; i < 8; i++) {
        var a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        var r = (i % 2 === 0) ? w / 2 - 2 : w * 0.14;
        var x = w / 2 + Math.cos(a) * r, y = h / 2 + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill();
    }],

    // Llama: la gota al revés de toda la vida, con su corazón claro.
    llama: [64, 96, function (ctx, w, h) {
      ctx.beginPath();
      ctx.moveTo(w / 2, 4);
      ctx.bezierCurveTo(w * 0.95, h * 0.42, w * 0.86, h * 0.95, w / 2, h - 4);
      ctx.bezierCurveTo(w * 0.14, h * 0.95, w * 0.05, h * 0.42, w / 2, 4);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w / 2, h * 0.26);
      ctx.bezierCurveTo(w * 0.76, h * 0.55, w * 0.70, h * 0.92, w / 2, h * 0.94);
      ctx.bezierCurveTo(w * 0.30, h * 0.92, w * 0.24, h * 0.55, w / 2, h * 0.26);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,1)'; ctx.fill();
    }],

    // Esquirla de hielo: un rombo alargado con una arista clara.
    hielo: [48, 96, function (ctx, w, h) {
      ctx.beginPath();
      ctx.moveTo(w / 2, 2);
      ctx.lineTo(w - 4, h * 0.38);
      ctx.lineTo(w / 2, h - 2);
      ctx.lineTo(4, h * 0.38);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w / 2, 6); ctx.lineTo(w * 0.68, h * 0.40); ctx.lineTo(w / 2, h * 0.9);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,1)'; ctx.fill();
    }],

    // Rayo: el zigzag clásico, ancho arriba y afilado abajo.
    rayo: [64, 160, function (ctx, w, h) {
      ctx.beginPath();
      ctx.moveTo(w * 0.58, 0);
      ctx.lineTo(w * 0.16, h * 0.52);
      ctx.lineTo(w * 0.46, h * 0.52);
      ctx.lineTo(w * 0.26, h);
      ctx.lineTo(w * 0.90, h * 0.40);
      ctx.lineTo(w * 0.56, h * 0.40);
      ctx.lineTo(w * 0.92, 0);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,1)'; ctx.fill();
    }],

    // Humo / polvareda.
    humo: [96, 96, function (ctx, w, h) {
      for (var i = 0; i < 6; i++) {
        var a = (i / 6) * Math.PI * 2;
        var x = w / 2 + Math.cos(a) * w * 0.18;
        var y = h / 2 + Math.sin(a) * h * 0.14;
        var r = w * 0.26;
        var g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.34)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }],

    // La sombra de los luchadores: una elipse muy difuminada.
    sombra: [128, 64, function (ctx, w, h) {
      var g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0.00, 'rgba(0,0,0,0.60)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.30)');
      g.addColorStop(1.00, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.translate(w / 2, h / 2); ctx.scale(1, 0.5); ctx.translate(-w / 2, -h / 2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }],

    // Marca de suelo bajo cada luchador: dice DÓNDE está plantado.
    plataforma: [256, 96, function (ctx, w, h) {
      var g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0.00, 'rgba(255,255,255,0.16)');
      g.addColorStop(0.70, 'rgba(255,255,255,0.06)');
      g.addColorStop(1.00, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.translate(w / 2, h / 2); ctx.scale(1, 0.36); ctx.translate(-w / 2, -h / 2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }],

    // Flecha de "te toca": apunta hacia abajo sobre el luchador activo.
    flecha: [48, 48, function (ctx, w, h) {
      ctx.beginPath();
      ctx.moveTo(w / 2, h - 4);
      ctx.lineTo(w - 6, h * 0.35);
      ctx.lineTo(w * 0.68, h * 0.35);
      ctx.lineTo(w * 0.68, 5);
      ctx.lineTo(w * 0.32, 5);
      ctx.lineTo(w * 0.32, h * 0.35);
      ctx.lineTo(6, h * 0.35);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,1)'; ctx.fill();
    }]
  };

  /** Crea TODAS las piezas de efectos. Devuelve cuántas se pudieron crear. */
  function efectos(scene) {
    var n = 0;
    for (var id in EFECTOS) {
      if (!Object.prototype.hasOwnProperty.call(EFECTOS, id)) continue;
      var e = EFECTOS[id];
      if (lienzo(scene, PREFIJO + id, e[0], e[1], e[2])) n++;
    }
    log('piezas de efecto listas:', n, '/', Object.keys(EFECTOS).length);
    return n;
  }

  /** La clave de una pieza, para no repartir el prefijo por ahí. */
  function pieza(id) { return PREFIJO + id; }

  window.GFBatallaArte = {
    efectos: efectos,
    arena: arena,
    elegirArena: elegirArena,
    pieza: pieza,
    ARENAS: ARENAS,
    ORDEN_ARENAS: ORDEN_ARENAS,
    PREFIJO: PREFIJO,
    _interno: {
      lienzo: lienzo, dado: dado, pintarArena: pintarArena,
      cordillera: cordillera, colinas: colinas, EFECTOS: EFECTOS,
      rgba: rgba, mezcla: mezcla
    }
  };
})();
