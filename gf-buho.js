/* ===========================================================================
 * EL BÚHO DE LA NOCHE
 *
 * QUÉ HACE
 *   Al anochecer aparece un búho en el mapa. Se posa en la copa de un árbol,
 *   ulula cada tanto, parpadea, y de vez en cuando se cambia de árbol. Si te
 *   acercas demasiado levanta el vuelo. Cuando amanece se va y NO vuelve hasta
 *   la noche siguiente: de día no hay búho, ni sprite ni sonido.
 *
 * SE TIENE QUE VER DE NOCHE, Y ÉSE ES EL PROBLEMA
 *   gf-ciclo-dia tapa el mundo con una capa oscura en profundidad 9000. Todo
 *   lo que va por debajo se oscurece, que es lo correcto —un cuervo a plena
 *   luz sobre un mundo negro canta muchísimo— pero deja al búho invisible
 *   justo cuando tiene que verse.
 *
 *   La solución no es sacar al búho por encima de la noche: un sprite
 *   iluminado flotando sobre la oscuridad es peor. Lo que va por encima son
 *   LOS OJOS: dos puntos ámbar con su halo, en profundidad 9100. El cuerpo se
 *   queda debajo y se oscurece con todo lo demás, así que lo que se ve es una
 *   silueta con dos ojos encendidos en la copa de un árbol — que es
 *   exactamente lo que se ve de un búho de noche.
 *
 * NO HAY PNG QUE SUBIR
 *   Los dibujos se pintan con canvas al arrancar la escena, como la nieve y
 *   las pisadas. Es a propósito: catorce PNG que nadie subió a producción
 *   tumbaron el clima entero en su día, y un módulo que se dibuja solo no
 *   puede tener ese fallo.
 *
 * NO TOCA NADA DEL JUEGO
 *   Sprite suelto, sin cuerpo de física, sin colisiones y sin hablar con el
 *   servidor. Es decoración viva.
 *
 * CÓMO SE ENGANCHA
 *   GameScene.create():  window.GFBuho && window.GFBuho.montar(this);
 *
 * API
 *   GFBuho.montar(scene, op)   op: { escala, umbralLlega, umbralSeVa }
 *   GFBuho.desmontar(scene)
 *   GFBuho.estado()
 *   GFBuho.forzar(true|false)  lo hace aparecer o irse ahora, sea la hora que sea
 * ======================================================================== */
(function () {
  'use strict';

  var ESCALA = 2;                    // la del jugador, el perro y el cuervo

  /* Cuándo llega y cuándo se va, medido en la oscuridad de gf-ciclo-dia (0 a 1).
     No son el mismo número a propósito: si llegara y se fuera con el mismo
     umbral, en el minuto justo del atardecer el búho aparecería y desaparecería
     una y otra vez. Con el hueco entre 0,30 y 0,55 eso no puede pasar. */
  var LLEGA  = 0.55;
  var SE_VA  = 0.30;

  var PROF_OJOS  = 9100;             // por encima de la capa de noche (9000)
  var PROF_VUELO = 8000;             // igual que el cuervo: sobre el mundo, bajo la noche

  var VEL_VUELO   = 78;              // px/s. Un búho vuela más despacio que un cuervo.
  var SUSTO       = 96;              // a menos de esto, se va
  var ULULA_CADA  = [11000, 27000];
  var MUDA_CADA   = [30000, 75000];  // cada cuánto se cambia de árbol
  var PARPADEO    = [2600, 7000];

  function log() {
    if (!window.GF_BUHO_DEBUG) return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[búho]');
    console.log.apply(console, a);
  }

  function az(a, b) { return a + Math.random() * (b - a); }
  function elegir(l) { return l[Math.floor(Math.random() * l.length)]; }

  // ========================================================================
  // 1. LOS DIBUJOS
  // ========================================================================

  /* El búho, píxel a píxel, en una rejilla de 16 × 16.
       o outline   B cuerpo oscuro   b cuerpo   w plumas claras
       f cara      e ojo             p pupila   k pico y garras       */
  var PALETA = {
    o: '#17110d', B: '#4a3a2c', b: '#6b5540', w: '#8a6f52',
    f: '#d9c6a5', e: '#ffd24a', p: '#100c08', k: '#e69a2b'
  };

  var POSADO = [
    '....oo....oo....',
    '...oBBo..oBBo...',
    '..oBBBBooBBBBo..',
    '..oBBffffffBBo..',
    '.oBBffffffffBBo.',
    '.oBfepeffepefBo.',
    '.oBffffkkffffBo.',
    '.oBBfffkkfffBBo.',
    '.oBBBbbbbbbBBBo.',
    '.oBbwbbbbbbwbBo.',
    '.oBbwwbbbbwwbBo.',
    '.oBBbwwbbwwbBBo.',
    '..oBBbwwwwbBBo..',
    '...oBBBbbBBBo...',
    '....okkookko....',
    '................'
  ];

  // El mismo, con los ojos cerrados. Un búho que no parpadea parece un adorno.
  var DORMITA = POSADO.slice();
  DORMITA[5] = '.oBfoooffooofBo.';

  /** Pinta una rejilla de caracteres en una textura de Phaser. */
  function pintarRejilla(scene, clave, rejilla, ancho) {
    if (scene.textures.exists(clave)) return clave;
    var alto = rejilla.length;
    ancho = ancho || rejilla[0].length;
    try {
      var t = scene.textures.createCanvas(clave, ancho, alto);
      var ctx = t.getContext();
      ctx.clearRect(0, 0, ancho, alto);
      for (var y = 0; y < alto; y++) {
        var fila = rejilla[y];
        for (var x = 0; x < fila.length && x < ancho; x++) {
          var c = PALETA[fila.charAt(x)];
          if (!c) continue;                       // '.' y cualquier hueco: transparente
          ctx.fillStyle = c;
          ctx.fillRect(x, y, 1, 1);
        }
      }
      t.refresh();
      return clave;
    } catch (e) {
      console.warn('[búho] no se pudo dibujar', clave, e);
      return null;
    }
  }

  /**
   * Los fotogramas de vuelo.
   *
   * Se dibujan en un lienzo de 26 de ancho para que quepan las alas abiertas,
   * con el cuerpo (sin patas ni penachos, que en vuelo no se leen) en medio.
   * El ala es una escalera de barras: cuanto más lejos del cuerpo, más sube o
   * baja. Con tres posiciones —arriba, extendida y abajo— el aleteo ya se lee;
   * un ave real tampoco enseña más en un tapiz de 16 píxeles.
   */
  function texturaVuelo(scene, clave, alza) {
    if (scene.textures.exists(clave)) return clave;
    /* 32 de ancho: el cuerpo son 16 y cada ala se abre 8 más. Estaba en 26 y
       la punta del ala izquierda se salía del lienzo por la izquierda —se veía
       en la foto de la prueba: un ala más corta que la otra—. El ancho tiene
       que salir de la cuenta, no de un número puesto a ojo. */
    var W = 32, H = 16;
    try {
      var t = scene.textures.createCanvas(clave, W, H);
      var ctx = t.getContext();
      ctx.clearRect(0, 0, W, H);

      // cuerpo: las filas 2 a 12 del búho posado, centradas
      var dx = Math.floor((W - 16) / 2);
      for (var y = 2; y <= 12; y++) {
        var fila = POSADO[y];
        for (var x = 0; x < 16; x++) {
          var c = PALETA[fila.charAt(x)];
          if (!c) continue;
          ctx.fillStyle = c;
          ctx.fillRect(dx + x, y - 1, 1, 1);
        }
      }

      // alas: cuatro barras a cada lado, pegadas al cuerpo y simétricas
      for (var lado = -1; lado <= 1; lado += 2) {
        for (var i = 0; i < 4; i++) {
          var largo = 4 - i;                         // la punta es más fina
          var px = (lado < 0) ? dx - (i + 1) * 2 : dx + 16 + i * 2;
          var py = 7 + Math.round(alza * (i + 1) * 1.5) - Math.floor(largo / 2);
          ctx.fillStyle = i < 2 ? PALETA.b : PALETA.B;
          ctx.fillRect(px, py, 2, largo);
          ctx.fillStyle = PALETA.o;
          ctx.fillRect(px, py + largo, 2, 1);        // borde de abajo
        }
      }
      t.refresh();
      return clave;
    } catch (e) {
      console.warn('[búho] no se pudo dibujar', clave, e);
      return null;
    }
  }

  /**
   * Los ojos, que van por encima de la noche.
   *
   * Dos puntos ámbar con halo. El halo se pinta con un degradado radial —no es
   * pixel art, y es a propósito: un brillo con el borde en escalera parece un
   * error de dibujo, mientras que un halo suave se lee como luz.
   */
  function texturaOjos(scene) {
    var clave = 'gfb_ojos';
    if (scene.textures.exists(clave)) return clave;
    var W = 24, H = 12;
    try {
      var t = scene.textures.createCanvas(clave, W, H);
      var ctx = t.getContext();
      ctx.clearRect(0, 0, W, H);
      // Los ojos del dibujo están en las columnas 4-6 y 9-11 de 16; aquí, al
      // triple de resolución y centrados, salen a 7,5 y 16,5.
      [7.5, 16.5].forEach(function (cx) {
        var g = ctx.createRadialGradient(cx, 6, 0, cx, 6, 5.5);
        g.addColorStop(0, 'rgba(255,226,130,0.95)');
        g.addColorStop(0.35, 'rgba(255,196,64,0.55)');
        g.addColorStop(1, 'rgba(255,170,30,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - 6, 0, 12, H);
        ctx.fillStyle = '#fff0c0';
        ctx.fillRect(Math.round(cx) - 1, 5, 2, 2);   // el punto duro del centro
      });
      t.refresh();
      return clave;
    } catch (e) { return null; }
  }

  function dibujos(scene) {
    var ok = pintarRejilla(scene, 'gfb_posado', POSADO) &&
             pintarRejilla(scene, 'gfb_dormita', DORMITA) &&
             texturaVuelo(scene, 'gfb_vuela_1', -1) &&
             texturaVuelo(scene, 'gfb_vuela_2', 0) &&
             texturaVuelo(scene, 'gfb_vuela_3', 1) &&
             texturaOjos(scene);
    return !!ok;
  }

  // ========================================================================
  // 2. DÓNDE SE POSA
  // ========================================================================

  /**
   * Los árboles del mapa. Se reaprovecha lo que ya sabe gf-cuervo: es el mismo
   * censo de copas y mantenerlo dos veces sería garantizar que un día dejen de
   * coincidir.
   */
  function arboles(scene) {
    try {
      if (window.GFCuervo && window.GFCuervo._interno &&
          window.GFCuervo._interno.arbolesDisponibles) {
        return window.GFCuervo._interno.arbolesDisponibles(scene);
      }
    } catch (e) {}
    return [];
  }

  function copaDe(spr) {
    try {
      if (window.GFCuervo && window.GFCuervo._interno && window.GFCuervo._interno.posadero) {
        return window.GFCuervo._interno.posadero(spr);
      }
    } catch (e) {}
    var b;
    try { b = spr.getBounds(); } catch (x) { b = null; }
    if (b) return { x: b.centerX, y: b.top + b.height * 0.26 };
    return { x: spr.x, y: spr.y - 60 };
  }

  /**
   * Un árbol lejos del jugador. El búho no se posa en tus narices: si lo
   * hiciera, saldría volando en el mismo frame en que se posa y se quedaría
   * dando vueltas para siempre.
   */
  function arbolLejano(scene, minDist) {
    var lista = arboles(scene);
    if (!lista.length) return null;
    var p = scene.player;
    var buenos = [];
    for (var i = 0; i < lista.length; i++) {
      var c = copaDe(lista[i].spr);
      if (!p) { buenos.push(lista[i]); continue; }
      var dx = c.x - p.x, dy = c.y - p.y;
      if (dx * dx + dy * dy > minDist * minDist) buenos.push(lista[i]);
    }
    return elegir(buenos.length ? buenos : lista);
  }

  // ========================================================================
  // 3. EL BÚHO
  // ========================================================================

  function crear(st) {
    var scene = st.scene;
    var arbol = arbolLejano(scene, 420);
    var destino = arbol ? copaDe(arbol.spr) : null;
    if (!destino) {
      // Sin árboles no hay dónde posarse; se reintenta más tarde.
      return null;
    }

    /* Entra volando desde arriba y desde un lado, fuera de la pantalla. Un
       búho que aparece de la nada en una rama se nota; uno que llega volando,
       no. */
    var cam = scene.cameras.main;
    var desde = {
      x: destino.x + (Math.random() < 0.5 ? -1 : 1) * (cam.width * 0.6 + 120),
      y: destino.y - az(180, 320)
    };

    var spr = scene.add.sprite(desde.x, desde.y, 'gfb_vuela_2');
    spr.setOrigin(0.5, 1);
    spr.setScale(st.escala);
    spr.setDepth(PROF_VUELO);

    var ojos = scene.add.image(desde.x, desde.y, 'gfb_ojos');
    ojos.setOrigin(0.5, 0.5);
    ojos.setScale(st.escala * 0.7);
    ojos.setDepth(PROF_OJOS);
    ojos.setBlendMode(Phaser.BlendModes.ADD);
    ojos.setVisible(false);

    var b = {
      spr: spr, ojos: ojos,
      fase: 'llega', arbol: arbol.clave, destino: destino,
      hasta: 0, ala: 0, alaHasta: 0,
      proximoUlular: scene.time.now + az(2500, 6000),
      proximaMuda: scene.time.now + az(MUDA_CADA[0], MUDA_CADA[1]),
      proximoParpadeo: 0, parpadeando: false
    };
    log('llega desde', Math.round(desde.x), 'a', arbol.clave);
    return b;
  }

  function irse(st, b) {
    b.fase = 'se_va';
    var cam = st.scene.cameras.main;
    b.destino = {
      x: b.spr.x + (Math.random() < 0.5 ? -1 : 1) * (cam.width * 0.8 + 200),
      y: b.spr.y - az(240, 420)
    };
    log('se va');
  }

  /** Se muda de árbol: o porque le toca, o porque te has acercado. */
  function volarA(st, b, minDist) {
    var arbol = arbolLejano(st.scene, minDist || 260);
    if (!arbol) return false;
    b.arbol = arbol.clave;
    b.destino = copaDe(arbol.spr);
    b.fase = 'vuela';
    b.spr.setDepth(PROF_VUELO);
    return true;
  }

  function ulular(st, b) {
    try {
      if (window.GFAudio && window.GFAudio.bicho) {
        window.GFAudio.bicho(st.scene, 'buho', b.spr.x, b.spr.y, { vol: 1.15, alcance: 780 });
      }
    } catch (e) {}
  }

  function mover(st, b, ahora, dt) {
    var scene = st.scene;
    var spr = b.spr;

    // ── aleteo ──
    if (b.fase !== 'posado') {
      if (ahora >= b.alaHasta) {
        b.ala = (b.ala + 1) % 3;
        b.alaHasta = ahora + 90;
        spr.setTexture('gfb_vuela_' + (b.ala + 1));
      }
    }

    if (b.fase === 'posado') {
      // ── posado: parpadea, ulula, y vigila si te acercas ──
      var p = scene.player;
      if (p) {
        var dx = p.x - spr.x, dy = p.y - spr.y;
        if (dx * dx + dy * dy < SUSTO * SUSTO) {
          /* Al asustarse ulula: es la única vez que hace ruido por algo que
             has hecho tú, y por eso es la que más se recuerda. */
          ulular(st, b);
          b.proximoUlular = ahora + az(ULULA_CADA[0], ULULA_CADA[1]);
          volarA(st, b, 400);
          return;
        }
      }

      if (ahora >= b.proximoParpadeo) {
        b.parpadeando = !b.parpadeando;
        spr.setTexture(b.parpadeando ? 'gfb_dormita' : 'gfb_posado');
        b.proximoParpadeo = ahora + (b.parpadeando ? az(90, 180) : az(PARPADEO[0], PARPADEO[1]));
      }

      if (ahora >= b.proximoUlular) {
        ulular(st, b);
        b.proximoUlular = ahora + az(ULULA_CADA[0], ULULA_CADA[1]);
      }

      if (ahora >= b.proximaMuda) {
        b.proximaMuda = ahora + az(MUDA_CADA[0], MUDA_CADA[1]);
        volarA(st, b, 260);
      }

      /* El árbol donde está puede desaparecer: aquí se talan. Si pasa, se
         busca otro en vez de quedarse flotando sobre un tocón. */
      var arbol = b.arbol ? scene[b.arbol] : null;
      if (!arbol || !arbol.active || (scene.treeStumps && scene.treeStumps[b.arbol])) {
        volarA(st, b, 200);
      }
      return;
    }

    // ── en el aire: hacia el destino ──
    var vx = b.destino.x - spr.x, vy = b.destino.y - spr.y;
    var d = Math.sqrt(vx * vx + vy * vy);

    if (b.fase === 'se_va') {
      if (d < 40) { retirar(st, b); return; }
    } else if (d < 6) {
      // llegó a la copa
      spr.setPosition(b.destino.x, b.destino.y);
      spr.setTexture('gfb_posado');
      b.fase = 'posado';
      b.parpadeando = false;
      b.proximoParpadeo = ahora + az(PARPADEO[0], PARPADEO[1]);
      /* Ordenado por Y como el resto del mundo, un pelo por delante del árbol
         para que se vea encima de la copa y no detrás. */
      var arbolSpr = b.arbol ? scene[b.arbol] : null;
      var base = arbolSpr && typeof arbolSpr.depth === 'number' ? arbolSpr.depth : b.destino.y;
      spr.setDepth(base + 1);
      return;
    }

    var paso = VEL_VUELO * dt;
    if (paso > d) paso = d;
    spr.x += vx / d * paso;
    spr.y += vy / d * paso;
    spr.setFlipX(vx < 0);
  }

  /** Los ojos siguen a la cara, y solo se encienden si hay noche que los tape. */
  function moverOjos(st, b, noche) {
    var o = b.ojos;
    if (!o) return;
    /* En vuelo no se le ven los ojos: va de perfil y el halo saltando por la
       pantalla parecería una luciérnaga. Solo posado. */
    var visible = (b.fase === 'posado') && !b.parpadeando && noche > 0.25;
    if (!visible) { if (o.visible) o.setVisible(false); return; }

    /* La cara está en la fila 5 de 16, y el sprite se ancla por las patas
       (origen 0,1). Diez píxeles y medio hacia arriba, por la escala. */
    o.setPosition(b.spr.x, b.spr.y - 10.5 * st.escala);
    o.setVisible(true);
    // Cuanto más cerrada la noche, más se encienden. De día no hay brillo.
    o.setAlpha(Math.min(1, (noche - 0.25) / 0.5) * (0.72 + 0.28 * Math.sin(st.scene.time.now / 420)));
  }

  function retirar(st, b) {
    try { b.spr.destroy(); } catch (e) {}
    try { if (b.ojos) b.ojos.destroy(); } catch (e) {}
    st.buho = null;
    log('retirado');
  }

  // ========================================================================
  // 4. MONTAJE
  // ========================================================================

  var montado = null;

  function noche(st) {
    if (st.forzado !== null) return st.forzado ? 1 : 0;
    try {
      if (window.GFCiclo && window.GFCiclo.oscuridad && window.GFCiclo.hayHora &&
          window.GFCiclo.hayHora()) {
        return window.GFCiclo.oscuridad();
      }
    } catch (e) {}
    return 0;    // sin reloj no se sabe si es de noche: mejor que no salga
  }

  function montar(scene, op) {
    op = op || {};
    if (!scene || !scene.add || !scene.add.sprite) return null;
    if (scene.__gfBuho) return scene.__gfBuho;
    if (!dibujos(scene)) return null;

    var st = {
      scene: scene, buho: null, escala: op.escala || ESCALA,
      llega: op.umbralLlega === undefined ? LLEGA : op.umbralLlega,
      seVa: op.umbralSeVa === undefined ? SE_VA : op.umbralSeVa,
      forzado: null, proximoIntento: 0
    };
    scene.__gfBuho = st;
    montado = st;

    st.onUpdate = function (ahora, delta) {
      try {
        var dt = Math.min(delta, 100) / 1000;
        var n = noche(st);

        if (!st.buho) {
          /* No se intenta en cada frame: si no hay árboles todavía (el mapa
             tarda en montarse) sería sesenta barridos por segundo para nada. */
          if (n >= st.llega && ahora >= st.proximoIntento) {
            st.proximoIntento = ahora + 4000;
            st.buho = crear(st);
          }
          return;
        }

        if (n <= st.seVa && st.buho.fase !== 'se_va') irse(st, st.buho);
        mover(st, st.buho, ahora, dt);
        if (st.buho) moverOjos(st, st.buho, n);
      } catch (e) {
        if (!st.avisado) { st.avisado = true; console.warn('[búho] fallo en el bucle:', e); }
      }
    };
    scene.events.on('update', st.onUpdate);

    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);

    log('montado');
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfBuho;
    if (!st) return;
    if (st.onUpdate) scene.events.off('update', st.onUpdate);
    if (st.onApagar) {
      scene.events.off('shutdown', st.onApagar);
      scene.events.off('destroy', st.onApagar);
    }
    if (st.buho) retirar(st, st.buho);
    scene.__gfBuho = null;
    if (montado === st) montado = null;
  }

  window.GFBuho = {
    montar: montar,
    desmontar: desmontar,
    estado: function () {
      if (!montado) return { montado: false };
      var b = montado.buho;
      return {
        montado: true,
        oscuridad: Math.round(noche(montado) * 100) / 100,
        hay: !!b,
        fase: b ? b.fase : null,
        arbol: b ? b.arbol : null,
        x: b ? Math.round(b.spr.x) : null,
        y: b ? Math.round(b.spr.y) : null,
        arbolesEnElMapa: montado ? arboles(montado.scene).length : 0
      };
    },
    /** Para verlo sin esperar a que anochezca: GFBuho.forzar(true) */
    forzar: function (v) {
      if (!montado) return false;
      montado.forzado = (v === null || v === undefined) ? null : !!v;
      if (montado.forzado === true) montado.proximoIntento = 0;
      return true;
    },
    /** Que ulule ahora. */
    ulular: function () {
      if (!montado || !montado.buho) return false;
      ulular(montado, montado.buho);
      return true;
    },
    _interno: {
      POSADO: POSADO, DORMITA: DORMITA, PALETA: PALETA,
      pintarRejilla: pintarRejilla, texturaVuelo: texturaVuelo,
      texturaOjos: texturaOjos, arboles: arboles, copaDe: copaDe,
      arbolLejano: arbolLejano, crear: crear, mover: mover,
      LLEGA: LLEGA, SE_VA: SE_VA, PROF_OJOS: PROF_OJOS
    }
  };
})();
