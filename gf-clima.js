/* ===========================================================================
 * CLIMA: LLUVIA, TRUENOS Y MANDO DEL VIENTO
 *
 * QUÉ HACE
 *   Pregunta al servidor qué tiempo hace y lo pinta: lluvia con salpicaduras,
 *   relámpagos que iluminan la pantalla y truenos que sacuden la cámara. Y le
 *   dice al viento (gf-viento.js) si tiene que soplar o no.
 *
 * EL CLIMA ES DEL MUNDO, NO DE TU NAVEGADOR
 *   Lo decide el backend (/api/world/weather) y se configura desde climas.html
 *   con cartera de administrador. Si cada cliente sorteara su propio tiempo,
 *   dos jugadores en la misma plaza verían cosas distintas. Aquí solo se pinta
 *   lo que diga el servidor.
 *
 * NO TOCA NADA DEL JUEGO
 *   Gotas, salpicaduras, relámpagos y la cortina de tormenta son sprites SIN
 *   cuerpo de física, pegados a la cámara. El único efecto sobre el juego es la
 *   sacudida de cámara del trueno, que es de la propia cámara y se le pasa
 *   sola.
 *
 * CÓMO SE ENGANCHA
 *   GameScene.preload():  window.GFClima && window.GFClima.precargar(this);
 *   GameScene.create():   window.GFClima && window.GFClima.montar(this);
 *
 * API
 *   GFClima.montar(scene) / desmontar(scene)
 *   GFClima.sincronizar()        vuelve a preguntar al servidor
 *   GFClima.estado()
 *   GFClima.probar('lluvia'|'tormenta'|'viento'|'despejado')   solo para ver
 * ======================================================================== */
(function () {
  'use strict';

  var RUTA = './Game/Objetos/clima/';
  var GOTAS   = ['gota_1', 'gota_2', 'gota_3'];
  var SALPICA = ['salpica_1', 'salpica_2', 'salpica_3'];
  var RAYOS   = ['rayo_1', 'rayo_2', 'rayo_3'];
  var COPOS   = ['copo_1', 'copo_2', 'copo_3', 'copo_4'];
  var POSAS   = ['posa_1', 'posa_2', 'posa_3'];
  var CHARCOS = ['charco_1', 'charco_2', 'charco_3', 'charco_4'];
  var FUEGOS  = ['fuego_1', 'fuego_2', 'fuego_3', 'fuego_4'];
  var HUMOS   = ['humo_1', 'humo_2', 'humo_3'];
  var BRASAS  = ['brasa_1', 'brasa_2', 'brasa_3'];

  /* CADA CUANTO SE PREGUNTA EL TIEMPO SI EL SOCKET FALLA.

     Estaba en 3 minutos, y con eso un administrador lanzaba una tormenta desde
     climas.html y en el juego no pasaba nada durante tres minutos largos —
     tiempo mas que de sobra para dar por hecho que no funcionaba. Ahora 45
     segundos: sigue siendo una consulta muy barata y el peor caso deja de
     parecer una averia. */
  var SYNC_MS   = 45 * 1000;
  var ENTRA_MS  = 5000;            // lo que tarda en arreciar / amainar

  var N_GOTAS    = 120;   // más gotas y más finas: se lee mejor como lluvia
  var N_SALPICA  = 14;
  var N_COPOS    = 110;   // la nieve necesita más piezas: caen mucho más lento
  var N_POSAS    = 18;

  var VEL_COPO   = 62;    // px/s; un copo baja como diez veces más lento que una gota
  var VAIVEN_COPO = [0.5, 1.9];   // cada copo se mece a su ritmo

  /* ESTACIONES.

     El filtro es lo que hace que un mismo mapa se lea como otoño o como
     invierno sin repintar un solo tile: se multiplica el mundo entero por un
     color. Multiplicar y no superponer es la diferencia entre "el mundo es de
     otro color" y "hay un cristal de color delante"; lo segundo apaga el arte
     y se nota mucho.

     El verano no lleva filtro a propósito: es el aspecto con el que está
     pintado el juego, así que cualquier tinte solo lo empeoraría. */
  var ESTACIONES = {
    primavera: { color: 0xdcffe4, alfa: 0.18 },
    verano:    { color: 0xffffff, alfa: 0.00 },
    otono:     { color: 0xffb15c, alfa: 0.42 },
    invierno:  { color: 0xbcd4ff, alfa: 0.38 }
  };
  var ESTACION_MS = 2500;          // lo que tarda en pasar de una a otra

  /* MULTIPLY.

     Se lee de Phaser si esta, y si no se usa el 2, que es el valor de MULTIPLY
     en Phaser 3. El respaldo NO es por capricho: con un `if (window.Phaser)`
     delante, cargar Phaser de otra forma —como modulo, o en las pruebas sin
     navegador— dejaba el filtro en modo normal SIN avisar, y la diferencia
     entre multiplicar y superponer es la diferencia entre tenir el mundo y
     echarle un velo por encima. */
  var MULTIPLICAR = (window.Phaser && window.Phaser.BlendModes &&
                     window.Phaser.BlendModes.MULTIPLY != null)
                    ? window.Phaser.BlendModes.MULTIPLY : 2;

  // Por encima del mundo y por DEBAJO de la capa de noche (9000), igual que las
  // hojas del viento y los pájaros: si fuera por encima, de noche la lluvia se
  // vería iluminada sobre un mundo a oscuras.
  var PROF_LLUVIA   = 8100;
  var PROF_CORTINA  = 8050;
  var PROF_RAYO     = 8600;
  var PROF_FOGONAZO = 8650;
  // El filtro de la estación va DEBAJO de todo lo demás del clima: la nieve no
  // puede salir de color ámbar en otoño, es agua helada.
  var PROF_ESTACION = 8030;

  /* CÓMO SE CREA UN RECTÁNGULO QUE LUEGO SE ENCIENDE Y SE APAGA.

     scene.add.rectangle(x, y, w, h, color, alfa) NO pone el alpha del objeto:
     pone el fillAlpha del RELLENO. Phaser dibuja con fillAlpha × alpha, así que
     un rectángulo creado con 0 no pinta nada por mucho que luego se le suba el
     alpha con setAlpha().

     Aquí estaban los cuatro así —cortina, fogonazo, marco y filtro— y ninguno
     se veía: existían, se les cambiaba el alpha en cada frame y no salían en
     pantalla. Se crean con el relleno a tope y se apagan con setAlpha(0). */
  /**
   * Textura blanca de 4x4 para estirarla por la pantalla.
   *
   * POR QUÉ UNA IMAGEN Y NO UN RECTÁNGULO: Phaser NO aplica los modos de mezcla
   * a las figuras (Rectangle, Graphics). Ni en canvas ni en WebGL: el
   * MULTIPLY se ignora y la figura se dibuja como NORMAL, o sea, un velo de
   * color por encima que aplasta el arte en vez de teñirlo. Las imágenes sí lo
   * respetan, así que el filtro de la estación va con textura y tinte.
   */
  function texturaBlanca(scene) {
    var clave = 'gfc_blanco';
    if (scene.textures.exists(clave)) return clave;
    try {
      var c = scene.textures.createCanvas(clave, 4, 4);
      var ctx = c.getContext();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 4, 4);
      c.refresh();
    } catch (e) {
      return null;
    }
    return clave;
  }

  /**
   * Dos tiras de degradado blanco, una vertical y otra horizontal.
   *
   * POR QUÉ: el marco de la centella eran cuatro RECTÁNGULOS planos, y se veía
   * lo que es: cuatro cuadrados blancos pegados a los bordes, con un corte
   * recto donde acababan. Un resplandor no tiene borde; se apaga.
   *
   * Con una tira de blanco que va de opaco a transparente, estirada contra
   * cada lado, el marco se desvanece hacia el centro y ya no se ve dónde
   * termina. Dos texturas y no una para no tener que girar nada: girar un
   * sprite obliga a cuadrar origen y medidas al revés y se presta a errores
   * tontos de un píxel.
   *
   * El degradado no es lineal: cae rápido al principio y luego se arrastra
   * (0.45 a la mitad del recorrido), que es como se apaga la luz de verdad.
   */
  /* ══════════════════════════════════════════════════════════════════════
     RAYOS DE SOL
     ──────────────────────────────────────────────────────────────────────
     Entran por la esquina de ARRIBA A LA IZQUIERDA. No es un capricho: es de
     donde viene la luz en todo el arte del juego y hacia donde apunta el sol
     que calcula gf-sombras.js. Si los rayos vinieran de otro lado, el mundo
     tendría dos soles y se notaría al instante.

     CÓMO SE HACE QUE PAREZCAN LUZ Y NO TIRAS BLANCAS. Tres cosas:

       · MEZCLA ADITIVA. La luz SUMA, no tapa. Una tira blanca normal encima
         del mundo es un plástico; la misma tira sumando es un haz.
       · BORDES QUE SE APAGAN. El haz se difumina a lo ancho y se va perdiendo
         a lo largo, porque un rayo de sol no tiene canto.
       · NUNCA QUIETOS. Cada haz respira con su propio ritmo —abre y cierra un
         poco el ángulo y sube y baja la intensidad—, que es lo que hace el
         polvo del aire de verdad. Un haz fijo se lee como un dibujo pegado.

     Y de noche no hay rayos: la intensidad se multiplica por la luz del día,
     así que al atardecer se apagan solos.                                  */
  var N_RAYOS      = 7;
  var SOL_ANGULO   = -0.95;      // radianes: hacia abajo y a la derecha
  var SOL_ABANICO  = 0.30;       // cuánto se abren unos de otros
  var SOL_ALFA     = 0.16;       // por haz, ya con la mezcla aditiva
  var SOL_ENTRA_MS = 3500;       // lo que tarda en entrar y en irse
  var PROF_SOL     = 8020;       // sobre el mundo, bajo la cortina de lluvia

  /** El haz: blanco por el centro, apagado a los lados y hacia la punta. */
  function texturaRayo(scene) {
    var clave = 'gfc_rayo_sol';
    if (scene.textures.exists(clave)) return clave;
    var W = 64, H = 256;
    try {
      var c = scene.textures.createCanvas(clave, W, H);
      var ctx = c.getContext();

      // A lo ancho: el canto se apaga. Un haz con borde recto no es un haz.
      var gx = ctx.createLinearGradient(0, 0, W, 0);
      gx.addColorStop(0.00, 'rgba(255,246,214,0)');
      gx.addColorStop(0.30, 'rgba(255,249,226,0.55)');
      gx.addColorStop(0.50, 'rgba(255,253,240,1)');
      gx.addColorStop(0.70, 'rgba(255,249,226,0.55)');
      gx.addColorStop(1.00, 'rgba(255,246,214,0)');
      ctx.fillStyle = gx;
      ctx.fillRect(0, 0, W, H);

      /* A lo largo: se va perdiendo. `destination-in` conserva el color que ya
         hay y le aplica ESTE alfa — es la forma de cruzar dos degradados sin
         que el segundo repinte el primero. */
      ctx.globalCompositeOperation = 'destination-in';
      var gy = ctx.createLinearGradient(0, 0, 0, H);
      gy.addColorStop(0.00, 'rgba(0,0,0,0.85)');
      gy.addColorStop(0.35, 'rgba(0,0,0,1)');
      gy.addColorStop(1.00, 'rgba(0,0,0,0)');
      ctx.fillStyle = gy;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      c.refresh();
    } catch (e) { return null; }
    return clave;
  }

  /* EL HALO DEL FUEGO.

     Lo que hace que un fuego parezca fuego no son las llamas: es la LUZ que
     tira alrededor. Sin halo, tres dibujitos naranjas encima de un árbol son
     tres dibujitos naranjas. Con halo —un círculo cálido en modo aditivo que
     tiembla al ritmo de las llamas— el árbol se enciende de verdad y la hierba
     de al lado se pone dorada.

     Va aparte del resplandor del sol porque el color es otro: el sol es
     blanco-crema y el fuego es naranja-rojo. Reutilizar el del sol dejaba el
     incendio pálido. */
  function texturaHalo(scene) {
    var clave = 'gfc_halo_fuego';
    if (scene.textures.exists(clave)) return clave;
    var T = 256;
    try {
      var c = scene.textures.createCanvas(clave, T, T);
      var ctx = c.getContext();
      var g = ctx.createRadialGradient(T / 2, T / 2, 0, T / 2, T / 2, T / 2);
      g.addColorStop(0.00, 'rgba(255,236,170,0.95)');
      g.addColorStop(0.18, 'rgba(255,186,88,0.55)');
      g.addColorStop(0.45, 'rgba(238,120,40,0.20)');
      g.addColorStop(0.75, 'rgba(180,64,20,0.06)');
      g.addColorStop(1.00, 'rgba(150,50,16,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, T, T);
      c.refresh();
    } catch (e) { return null; }
    return clave;
  }

  /* ══════════════════════════════════════════════════════════════════════
     LAS MOTAS DE POLVO
     ──────────────────────────────────────────────────────────────────────
     Un día soleado no es "el mismo día pero con haces de luz dibujados". Lo
     que hace que una escena se lea como un día de sol es que se VE el aire:
     motas de polvo y de polen flotando, encendidas por la luz, subiendo
     despacio y apagándose cuando salen del haz.

     Son treinta puntitos de dos píxeles. Cuesta nada y es, con diferencia, lo
     que más cambia un día soleado.

     VAN EN EL MUNDO, no pegadas a la cámara: una mota está a metro y medio de
     tu cara, así que si andas, se queda atrás. Pegadas a la pantalla se ven
     como suciedad en el monitor — que es exactamente lo que el jugador dijo de
     las gotas.
     ══════════════════════════════════════════════════════════════════════ */
  var N_MOTAS    = 30;
  var PROF_MOTA  = 8010;      // sobre el mundo, bajo los haces de sol (8020)
  var MOTA_VEL   = [-9, -26]; // suben (px/s): el aire caliente tira hacia arriba

  function texturaMota(scene) {
    var clave = 'gfc_mota';
    if (scene.textures.exists(clave)) return clave;
    var T = 16;
    try {
      var c = scene.textures.createCanvas(clave, T, T);
      var ctx = c.getContext();
      var g = ctx.createRadialGradient(T / 2, T / 2, 0, T / 2, T / 2, T / 2);
      g.addColorStop(0.00, 'rgba(255,252,232,1)');
      g.addColorStop(0.35, 'rgba(255,246,206,0.55)');
      g.addColorStop(1.00, 'rgba(255,240,190,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, T, T);
      c.refresh();
    } catch (e) { return null; }
    return clave;
  }

  function nuevaMota(st, clave) {
    var s = st.scene.add.image(0, 0, clave);
    s.setDepth(PROF_MOTA);
    s.setAlpha(0);
    if (s.setBlendMode && window.Phaser && Phaser.BlendModes) {
      s.setBlendMode(Phaser.BlendModes.ADD);
    }
    return { spr: s, x: 0, y: 0, vy: 0, vx: 0, fase: az(0, 6.283),
             vaiven: az(0.25, 0.9), amplitud: az(3, 14),
             tam: az(0.18, 0.55), brillo: az(0.25, 0.75), sembrada: false };
  }

  /** Coloca una mota en un sitio al azar de lo que se ve ahora mismo. */
  function sembrarMota(st, m, dentro) {
    var v = st.scene.cameras.main.worldView;
    m.x = v.x + az(-40, v.width + 40);
    m.y = dentro ? v.y + az(0, v.height) : v.bottom + az(4, 90);
    m.vy = az(MOTA_VEL[0], MOTA_VEL[1]);
    m.vx = az(-6, 10);
    m.sembrada = true;
    m.spr.setPosition(m.x, m.y);
    m.spr.setScale(m.tam);
  }

  function moverMotas(st, dt, fuerza) {
    if (!st.motas || !st.motas.length) return;
    if (fuerza <= 0.01) {
      for (var k = 0; k < st.motas.length; k++) st.motas[k].spr.setAlpha(0);
      return;
    }
    var v = st.scene.cameras.main.worldView;
    // El viento también las lleva: son lo más ligero que hay en el mapa.
    var lado = (st.inclina || 0) * 26;
    for (var i = 0; i < st.motas.length; i++) {
      var m = st.motas[i];
      if (!m.sembrada) sembrarMota(st, m, true);
      m.fase += dt * m.vaiven;
      m.x += (m.vx + Math.sin(m.fase) * m.amplitud + lado) * dt;
      m.y += m.vy * dt;
      m.spr.setPosition(m.x, m.y);
      /* Titilan: una mota solo se ve cuando gira y le da la luz de canto. Ese
         parpadeo lento es lo que las hace parecer polvo y no puntos pegados. */
      var brillo = 0.45 + 0.55 * Math.sin(m.fase * 1.7 + i);
      m.spr.setAlpha(fuerza * m.brillo * brillo);
      if (m.y < v.y - 120 || m.x < v.x - 120 || m.x > v.right + 120) {
        sembrarMota(st, m, false);
      }
    }
  }

  /** El resplandor de la esquina: de donde salen los haces. */
  function texturaResplandor(scene) {
    var clave = 'gfc_resplandor';
    if (scene.textures.exists(clave)) return clave;
    var T = 256;
    try {
      var c = scene.textures.createCanvas(clave, T, T);
      var ctx = c.getContext();
      var g = ctx.createRadialGradient(T / 2, T / 2, 0, T / 2, T / 2, T / 2);
      g.addColorStop(0.00, 'rgba(255,252,236,0.95)');
      g.addColorStop(0.25, 'rgba(255,244,206,0.45)');
      g.addColorStop(0.60, 'rgba(255,238,190,0.14)');
      g.addColorStop(1.00, 'rgba(255,236,186,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, T, T);
      c.refresh();
    } catch (e) { return null; }
    return clave;
  }

  function texturasBorde(scene) {
    var hecho = true;
    ['gfc_borde_v', 'gfc_borde_h'].forEach(function (clave) {
      if (scene.textures.exists(clave)) return;
      var vertical = (clave === 'gfc_borde_v');
      var N = 64;
      try {
        var c = scene.textures.createCanvas(clave, vertical ? 1 : N, vertical ? N : 1);
        var ctx = c.getContext();
        var g = vertical ? ctx.createLinearGradient(0, 0, 0, N)
                         : ctx.createLinearGradient(0, 0, N, 0);
        g.addColorStop(0.00, 'rgba(255,255,255,1)');
        g.addColorStop(0.18, 'rgba(255,255,255,0.86)');
        g.addColorStop(0.50, 'rgba(255,255,255,0.45)');
        g.addColorStop(0.78, 'rgba(255,255,255,0.14)');
        g.addColorStop(1.00, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, vertical ? 1 : N, vertical ? N : 1);
        c.refresh();
      } catch (e) { hecho = false; }
    });
    return hecho;
  }

  function lienzoRect(scene, x, y, w, h, color) {
    var r = scene.add.rectangle(x, y, w, h, color, 1);
    r.setScrollFactor(0);
    r.setAlpha(0);
    return r;
  }

  var VEL_GOTA  = 900;             // px/s con la lluvia al máximo

  /* CUÁNTO CAE DE LADO.

     EL FALLO QUE ARREGLA: era un número fijo, 0.34, y la gota se DIBUJABA con
     setRotation(+0.34) mientras se MOVÍA hacia (+0.34, +1). En Phaser el eje Y
     va hacia abajo, así que una rotación positiva inclina el sprite hacia
     abajo-IZQUIERDA: la raya apuntaba a un lado y la gota viajaba al otro. Por
     eso "las gotas salen mal de lado".

     Ahora la inclinación la marca el VIENTO (dirección y fuerza) y el dibujo se
     saca de ella, no al revés: rotación = -atan(inclinación). El menos deshace
     el eje invertido y el arco tiene en cuenta que la gota también cae. */
  var INCLINA_MIN = 0.14;          // sin viento el agua cae casi a plomo
  var INCLINA_MAX = 0.66;          // con vendaval

  /* Sobrante alrededor de la pantalla, por la sacudida del trueno. Sin él, al
     temblar la cámara asomaba el borde de todo lo pegado a ella. */
  var MARGEN = 96;

  /* EL LIENZO DE PANTALLA. setScrollFactor(0) libra del SCROLL pero NO del
     ZOOM: la cámara sigue dibujando  pantalla = (p - centro)·zoom + centro.
     Con el zoom a 0.5 la lluvia se encogía al cuadrado del medio y los bordes
     quedaban secos. Se mete todo en un contenedor con escala 1/zoom colocado
     para que su esquina caiga en (-MARGEN,-MARGEN) de la pantalla; dentro se
     sigue trabajando en píxeles de pantalla. */
  function lienzo(cam) {
    var z = (cam && cam.zoom > 0) ? cam.zoom : 1;
    var W = cam.width, H = cam.height;
    return {
      z: z, m: MARGEN,
      w: W + MARGEN * 2, h: H + MARGEN * 2,
      escala: 1 / z,
      x: W / 2 - (W / 2 + MARGEN) / z,
      y: H / 2 - (H / 2 + MARGEN) / z
    };
  }

  /** Hacia dónde y cuánto se tuerce la lluvia, según lo que haga el viento. */
  function inclinacion(st) {
    var V = window.GFViento;
    var dir = 1, f = 0;
    if (V && V.vector) {
      var v = V.vector(st._v || (st._v = {}));
      dir = v.dir || 1;
      f = Math.max(0, Math.min(1, v.fuerza || 0));
    }
    return dir * (INCLINA_MIN + (INCLINA_MAX - INCLINA_MIN) * f);
  }

  /* CHARCOS.

     Van en el MUNDO, no pegados a la cámara como la lluvia: un charco se queda
     donde está y tienes que poder rodearlo. Aparecen despacio mientras llueve,
     crecen, y se secan poco a poco cuando escampa.

     Se colocan mirando las colisiones del mapa: nada de charcos dentro de una
     pared, encima de una casa o flotando en el agua. */
  var N_CHARCOS     = 26;
  var CHARCO_CADA   = [900, 2600];   // ms entre charco y charco
  var CHARCO_CRECE  = 26000;         // lo que tarda en llegar a su tamaño
  var CHARCO_SECA   = 22000;         // lo que tarda en secarse
  var CHARCO_RADIO  = 620;           // alrededor del jugador
  var PROF_CHARCO   = 1;             // pegado al suelo: todo pasa por encima

  /* INCENDIO POR RAYO.

     Cuando cae un rayo con trazo, a veces le da a un árbol. El árbol arde un
     minuto y luego se cae solo: se queda el tocón y entra en el respawn normal
     del juego. NO da recompensa a nadie — no lo ha talado nadie, se ha quemado.
     Eso se consigue avisando al servidor por /api/tree/lock, que es la ruta que
     bloquea el árbol y avisa a todos, y que no reparte nada. */
  var PROB_INCENDIO = 0.30;          // de los rayos con trazo
  var ARDE_MS       = 60000;         // un minuto ardiendo
  var BRASAS_MS     = 9000;          // y un rato de rescoldos
  var FUEGO_FPS     = 9;

  var TRUENO_CADA  = [9000, 26000]; // ms entre relámpagos
  var CENTELLA_CADA = [1800, 7000]; // ms entre centellas (mucho más seguidas)
  var RAYO_SEPARA  = 0.28;          // fracción del ancho que ha de moverse el rayo

  var estado = {
    activo: false, modo: 'auto',
    viento: false, vientoFuerza: 1,
    lluvia: false, lluviaFuerza: 1,
    nieve: false, nieveFuerza: 1,
    soleado: false, soleadoFuerza: 1,
    truenos: true, estacion: 'verano', cargado: false
  };
  var montado = null;
  var timerSync = null;
  var timerSocket = null;
  var pidiendo = null;
  var ultimoFallo = null;
  var ultimaRespuesta = 0;
  var avisadoDelFallo = false;
  var redArrancada = false;
  var timerViento = null;

  function log() {
    if (!window.GF_CLIMA_DEBUG) return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[clima]');
    console.log.apply(console, a);
  }

  function az(a, b) { return a + Math.random() * (b - a); }
  function elegir(l) { return l[Math.floor(Math.random() * l.length)]; }

  // ------------------------------------------------------------------- red
  function base() {
    // Mismo criterio que gf-mascota.js: la escena viva es quien sabe de verdad
    // dónde está el backend (en local es el 8080, no el 3001).
    var g = window.game || (window.phaserScaler && window.phaserScaler.game);
    try {
      if (g && g.scene && g.scene.getScenes) {
        var ss = g.scene.getScenes(true) || [];
        for (var i = 0; i < ss.length; i++) {
          if (typeof ss[i].serverBase === 'string') return ss[i].serverBase;
        }
      }
    } catch (e) {}
    if (typeof window.serverBase === 'string')  return window.serverBase;
    if (typeof window.GF_API_BASE === 'string') return window.GF_API_BASE;
    var h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return 'http://127.0.0.1:8080';
    return 'https://api.grasslandforest.com';
  }

  function aplicar(d) {
    if (!d || d.ok !== true) return false;
    estado.activo       = !!d.activo;
    estado.modo         = d.modo || 'auto';
    estado.viento       = !!d.viento;
    estado.vientoFuerza = Number(d.vientoFuerza) || 1;
    estado.lluvia       = !!d.lluvia;
    estado.lluviaFuerza = Number(d.lluviaFuerza) || 1;
    estado.nieve        = !!d.nieve;
    estado.nieveFuerza  = Number(d.nieveFuerza) || 1;
    estado.soleado      = !!d.soleado;
    estado.soleadoFuerza = Number(d.soleadoFuerza) || 1;
    estado.truenos      = !!d.truenos;
    if (ESTACIONES[d.estacion]) estado.estacion = d.estacion;
    estado.cargado      = true;
    mandarAlViento();
    log('tiempo:', estado.lluvia ? 'lluvia'
                 : (estado.nieve ? 'nieve'
                 : (estado.soleado ? 'soleado'
                 : (estado.viento ? 'viento' : 'despejado'))));
    return true;
  }

  function sincronizar() {
    if (pidiendo) return pidiendo;
    var url = base().replace(/\/$/, '') + '/api/world/weather';
    pidiendo = fetch(url, { credentials: 'omit', mode: 'cors', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        pidiendo = null;
        ultimoFallo = null;
        ultimaRespuesta = Date.now();
        aplicar(d);
        return estado;
      })
      .catch(function (e) {
        pidiendo = null;
        ultimoFallo = (e && e.message) || 'error';
        /* Se AVISA una vez, no en silencio.

           Antes esto se tragaba el error salvo con GF_CLIMA_DEBUG puesto. Si la
           consulta fallaba (dominio mal, CORS, backend caido) el juego se
           quedaba sin clima para siempre y no habia forma de enterarse: parecia
           que el clima sencillamente no funciona. Se avisa UNA vez por sesion
           para no llenar la consola. */
        if (!avisadoDelFallo) {
          avisadoDelFallo = true;
          console.warn('[clima] no se pudo consultar el tiempo en ' + url +
                       ' (' + ultimoFallo + '). El juego se queda sin clima ' +
                       'del servidor. Mira GFClima.diagnostico().');
        }
        return estado;
      });
    return pidiendo;
  }

  /**
   * Se engancha al socket del juego para enterarse AL MOMENTO.
   *
   * EL FALLO QUE ARREGLA: el tiempo solo se preguntaba cada 3 minutos, así que
   * lo que se cambiaba en climas.html no se veía hasta recargar la página.
   *
   * El socket lo crea el juego al conectarse, que puede ser después de que
   * este módulo se monte; por eso montar() reintenta hasta que aparece.
   */
  /**
   * Se engancha al socket del juego para enterarse AL MOMENTO.
   *
   * EL FALLO GORDO QUE ARREGLA — "lanzo una tormenta desde climas.html, dice
   * lanzado y en el juego no pasa nada":
   *
   *   GameScene monta este modulo ANTES de crear el socket. Asi que al montar
   *   no habia socket, se arrancaba un reintento cada 1,5 s, se enganchaba al
   *   primero que apareciera... y ahi se paraba el reintento PARA SIEMPRE.
   *
   *   Pero `window.globalSocket` no es uno para toda la partida: initSocket()
   *   lo TIRA Y LO VUELVE A CREAR cada vez que lo encuentra desconectado — al
   *   volver de la tienda, tras un corte de red, al cambiar de escena. Desde
   *   ese momento el modulo se quedaba escuchando a un socket muerto y no se
   *   enteraba de nada mas. Como ademas la consulta de seguridad era cada 3
   *   minutos, parecia que el clima sencillamente no funcionaba.
   *
   * Ahora se guarda A CUAL se engancho y se comprueba que siga siendo ese. Si
   * cambia, se engancha al nuevo. La comprobacion es un `!==` cada dos
   * segundos: no cuesta nada y no hay forma de que se quede colgado.
   */
  var socketEnganchado = null;

  function socketDelJuego() {
    // El global es el de siempre; el de la escena vale de respaldo por si
    // alguna escena se creara el suyo sin publicarlo.
    if (window.globalSocket && window.globalSocket.on) return window.globalSocket;
    try {
      var g = window.game || (window.phaserScaler && window.phaserScaler.game);
      var ss = (g && g.scene && g.scene.getScenes) ? (g.scene.getScenes(true) || []) : [];
      for (var i = 0; i < ss.length; i++) {
        if (ss[i] && ss[i].socket && ss[i].socket.on) return ss[i].socket;
      }
    } catch (e) {}
    return null;
  }

  function engancharSocket() {
    var s = socketDelJuego();
    if (!s) return false;
    if (s === socketEnganchado) return true;      // ya es este

    socketEnganchado = s;
    s.on('worldWeather', function (d) {
      log('el servidor manda tiempo nuevo');
      aplicar(d);
    });
    /* Al (re)conectar se pregunta: mientras estuvo caido pudo perderse un
       aviso, y ademas un socket recien creado no ha recibido nada todavia. */
    s.on('connect', function () { sincronizar(); });
    sincronizar();
    log('enganchado al socket', s.id || '(sin id todavia)');
    return true;
  }

  /**
   * Le dice al viento lo que manda el servidor.
   *
   * CON REINTENTO, y hace falta. El clima se monta DESPUES del viento en
   * GameScene, pero la respuesta del servidor puede llegar en cualquier
   * momento: al cargar el mapa, al volver de la tienda, o justo mientras se
   * esta cambiando de escena, cuando no hay ningun viento montado. Si en ese
   * hueco se soltaba la orden, se perdia y no se volvia a intentar hasta la
   * siguiente consulta — 45 segundos, o NUNCA si el clima es manual, porque el
   * servidor no vuelve a avisar hasta que el administrador toque algo. Se
   * reintenta cada segundo hasta que el viento la coge.
   */
  function mandarAlViento() {
    var V = window.GFViento;
    if (!V || !V.forzar) { reintentarViento(); return; }
    var ok = V.forzar(estado.activo && estado.viento, estado.vientoFuerza);
    if (ok && timerViento) { clearInterval(timerViento); timerViento = null; }
    if (!ok) reintentarViento();
  }

  function reintentarViento() {
    if (timerViento) return;
    timerViento = setInterval(function () {
      var V = window.GFViento;
      if (V && V.forzar && V.forzar(estado.activo && estado.viento, estado.vientoFuerza)) {
        clearInterval(timerViento);
        timerViento = null;
      }
    }, 1000);
  }

  // ------------------------------------------------------------------ carga
  function precargar(scene) {
    if (!scene || !scene.load) return 0;
    var n = 0, i;
    for (i = 0; i < GOTAS.length; i++)   { scene.load.image('gfc_' + GOTAS[i],   RUTA + GOTAS[i] + '.png'); n++; }
    for (i = 0; i < SALPICA.length; i++) { scene.load.image('gfc_' + SALPICA[i], RUTA + SALPICA[i] + '.png'); n++; }
    for (i = 0; i < RAYOS.length; i++)   { scene.load.image('gfc_' + RAYOS[i],   RUTA + RAYOS[i] + '.png'); n++; }
    for (i = 0; i < COPOS.length; i++)   { scene.load.image('gfc_' + COPOS[i],   RUTA + COPOS[i] + '.png'); n++; }
    for (i = 0; i < POSAS.length; i++)   { scene.load.image('gfc_' + POSAS[i],   RUTA + POSAS[i] + '.png'); n++; }
    for (i = 0; i < CHARCOS.length; i++) { scene.load.image('gfc_' + CHARCOS[i], RUTA + CHARCOS[i] + '.png'); n++; }
    for (i = 0; i < FUEGOS.length; i++)  { scene.load.image('gfc_' + FUEGOS[i],  RUTA + FUEGOS[i] + '.png'); n++; }
    for (i = 0; i < HUMOS.length; i++)   { scene.load.image('gfc_' + HUMOS[i],   RUTA + HUMOS[i] + '.png'); n++; }
    for (i = 0; i < BRASAS.length; i++)  { scene.load.image('gfc_' + BRASAS[i],  RUTA + BRASAS[i] + '.png'); n++; }
    return n;
  }

  /** ¿Están TODAS las texturas de una familia? */
  function hay(scene, lista) {
    for (var i = 0; i < lista.length; i++) {
      if (!scene.textures.exists('gfc_' + lista[i])) return false;
    }
    return true;
  }

  /** Las que faltan, por nombre, para poder decirlo en la consola. */
  function faltan(scene) {
    var todas = [].concat(GOTAS, SALPICA, RAYOS, COPOS, POSAS, CHARCOS,
                          FUEGOS, HUMOS, BRASAS);
    var out = [];
    for (var i = 0; i < todas.length; i++) {
      if (!scene.textures.exists('gfc_' + todas[i])) out.push(todas[i] + '.png');
    }
    return out;
  }

  /**
   * ¿Se puede montar el clima?
   *
   * SOLO SE EXIGE LA LLUVIA, y este cambio arregla un fallo grande.
   *
   * EL FALLO: antes se exigían CINCO familias (gotas, copos, rayos, CHARCOS y
   * FUEGOS) y, si faltaba UNA sola imagen, montar() devolvía null y el clima
   * entero se quedaba sin montar. Pasó de verdad: en producción faltaban por
   * subir los 14 PNG de charcos, fuego, humo y brasas. Resultado: NUNCA llovía,
   * nunca nevaba y nunca caía un rayo, por muchas tormentas que se lanzaran
   * desde climas.html — y lo único que se seguía viendo eran las rachas de
   * viento, que son de otro módulo y se sortean solas. De ahí "solo funcionan
   * los climas automáticos".
   *
   * Un charco que falta debe costar los charcos, no la lluvia. Ahora cada
   * adorno comprueba lo suyo por separado (ver montar) y lo que falte
   * sencillamente no aparece.
   */
  function hayTexturas(scene) {
    return hay(scene, GOTAS);
  }

  /* ══════════════════════════════════════════════════════════════════════
     DE LA PANTALLA AL MUNDO
     ──────────────────────────────────────────────────────────────────────
     La lluvia CAE pegada a la pantalla, y eso está bien: el agua está en el
     aire, entre tus ojos y el pueblo, así que tiene que seguirte. Lo que NO
     puede seguirte es lo que ya ha CAÍDO. Una salpicadura es agua que ha dado
     contra el suelo, y el suelo no se mueve contigo: se queda en su charquito
     mientras tú te vas. Igual la nieve que se posa.

     EL FALLO QUE ESTO ARREGLA: salpicaduras y montoncitos de nieve vivían en
     el lienzo de pantalla, con scrollFactor 0, así que al andar se DESLIZABAN
     por el suelo acompañando a la cámara. Se veía justo como lo describió el
     jugador: "no queda cada gota exactamente donde cayó porque está pegada a
     la cámara".

     Esta función traduce un punto del lienzo (píxeles de pantalla, con el
     MARGEN sumado) al punto del MUNDO donde de verdad está. Con eso, la
     salpicadura se crea como un objeto normal del mundo y se queda quieta.
     Los charcos ya funcionaban así desde siempre; ahora todo lo que toca el
     suelo funciona igual. */
  function aMundo(st, L, x, y) {
    var cam = st.scene.cameras.main;
    if (!cam || typeof cam.getWorldPoint !== 'function') return { x: x, y: y };
    return cam.getWorldPoint(x - L.m, y - L.m);
  }

  /* ══════════════════════════════════════════════════════════════════════
     LA LLUVIA TIENE FONDO
     ──────────────────────────────────────────────────────────────────────
     Una cortina de gotas todas iguales se lee como una textura moviéndose, no
     como agua cayendo. Lo que le da cuerpo a la lluvia de verdad es que unas
     gotas están CERCA y otras LEJOS: las de cerca son largas, rápidas y se
     ven; las del fondo son finas, lentas y casi no están. Tres planos bastan
     para que el ojo lo lea como volumen.

     Cada plano es [escala, velocidad, alfa]. No cuesta ni un sprite más: es
     el mismo número de gotas, repartidas. */
  var PLANOS_GOTA = [
    { escala: [0.55, 0.85], vel: [0.55, 0.80], alfa: 0.26, peso: 0.34 },  // fondo
    { escala: [0.85, 1.30], vel: [0.85, 1.15], alfa: 0.46, peso: 0.40 },  // medio
    { escala: [1.30, 1.95], vel: [1.20, 1.60], alfa: 0.68, peso: 0.26 }   // frente
  ];

  function planoAlAzar() {
    var r = Math.random(), acum = 0;
    for (var i = 0; i < PLANOS_GOTA.length; i++) {
      acum += PLANOS_GOTA[i].peso;
      if (r <= acum) return i;
    }
    return PLANOS_GOTA.length - 1;
  }

  // ------------------------------------------------------------------ gotas
  function nuevaGota(st) {
    var L = lienzo(st.scene.cameras.main);
    var s = st.scene.add.image(0, 0, 'gfc_' + elegir(GOTAS));
    // El scrollFactor va en el HIJO aunque viva dentro del contenedor: Phaser
    // lo lee del hijo al montar la matriz de cámara, no del padre.
    s.setScrollFactor(0);
    var n = planoAlAzar();
    var P = PLANOS_GOTA[n];
    /* Escala moderada: a x2.6 sobre una textura de 18 px de alto salían
       rayas de casi 50 px que parecían arañazos en la pantalla, no lluvia.
       Y la del fondo, más fina todavía: es lo que la manda lejos. */
    var e = az(P.escala[0], P.escala[1]);
    /* Estirada a lo largo de la caída y estrechada a lo ancho: una gota en
       movimiento no es una gota, es una raya. Es el mismo truco que usa
       cualquier motion blur, hecho a mano y gratis. */
    s.setScale(e * az(0.62, 0.85), e * az(1.15, 1.55));
    s.setAlpha(0);
    if (st.capa) st.capa.add(s);
    var g = { spr: s, plano: n, vel: az(P.vel[0], P.vel[1]), alfa: P.alfa, x: 0, y: 0 };
    reponerGota(st, g, L.w, L.h, true);
    return g;
  }

  /**
   * Devuelve una gota arriba del todo, por el lado de BARLOVENTO.
   *
   * Con la inclinación fija bastaba con desplazar el borde izquierdo. Ahora que
   * puede torcerse a los dos lados hay que ensanchar el lado del que VIENE: si
   * no, con viento de poniente la mitad derecha de la pantalla se queda seca
   * porque ninguna gota nace lo bastante a la derecha.
   */
  function reponerGota(st, g, w, h, dentro) {
    /* Cuántas veces ha vuelto a empezar esta gota. No lo usa el juego: sirve
       para poder AFIRMAR desde fuera si una gota se ha reciclado. Sin esto una
       prueba solo puede adivinarlo por el salto de posición, y adivinarlo sale
       mal: una gota reciclada da un salto enorme hacia arriba que parece que
       vuela en vez de caer. Es el mismo contador que llevan las hojas del
       viento, y por el mismo motivo. */
    g.vueltas = (g.vueltas || 0) + (dentro ? 0 : 1);
    var corr = (st.inclina || 0) * h;      // cuánto se desplaza en toda la caída
    var lo = corr > 0 ? -corr - 20 : -20;
    var hi = corr > 0 ? w + 20 : w - corr + 20;
    g.x = dentro ? az(0, w) : az(lo, hi);
    g.y = dentro ? az(-40, h) : az(-90, -10);
    g.spr.setPosition(g.x, g.y);
  }

  function moverGotas(st, dt, w, h, m, L) {
    // La raya se dibuja hacia donde va la gota. atan() y no la pendiente a
    // secas: a 0.66 la diferencia ya son 7 grados y se nota.
    var rot = -Math.atan(st.inclina);
    for (var i = 0; i < st.gotas.length; i++) {
      var g = st.gotas[i];
      var v = VEL_GOTA * g.vel * st.fuerzaLluvia;
      g.y += v * dt;
      g.x += v * st.inclina * dt;
      g.spr.setPosition(g.x, g.y);
      g.spr.setRotation(rot);
      // Translúcidas: el agua no es blanca opaca. A 0.8 tapaban el mundo.
      // Y cada plano con la suya: el fondo casi no está, el frente sí.
      g.spr.setAlpha(st.fuerzaLluvia * g.alfa);
      if (g.y > h + 20) {
        /* La salpicadura, dentro de lo que se VE: el lienzo sobra por los
           bordes y una salpicadura en el sobrante no la ve nadie.

           Solo salpica el plano de DELANTE. Las gotas del fondo están, por
           definición, mucho más allá del suelo que se ve: si salpicaran, el
           agua reventaría en el aire y se vería el truco. */
        if (g.plano === PLANOS_GOTA.length - 1) {
          salpicar(st, g.x, h - m - az(0, (h - m * 2) * 0.55), L);
        }
        reponerGota(st, g, w, h, false);
      } else if (g.x < -80 || g.x > w + 80) {
        // Se la ha llevado el viento de lado: vuelve arriba sin salpicar.
        reponerGota(st, g, w, h, false);
      }
    }
  }

  // ------------------------------------------------------------------ nieve
  /**
   * Un copo.
   *
   * No es una gota lenta: cae diez veces más despacio, se mece de lado a lado
   * con su propio ritmo y el viento lo empuja MUCHO más que a la lluvia — un
   * copo pesa nada. Esa diferencia de comportamiento es lo que hace que se lea
   * como nieve y no como lluvia blanca.
   */
  function nuevoCopo(st) {
    var L = lienzo(st.scene.cameras.main);
    var s = st.scene.add.image(0, 0, 'gfc_' + elegir(COPOS));
    s.setScrollFactor(0);
    // Sin escalar: los copos están dibujados al tamaño del tileset (2..7 px) y
    // agrandarlos los convertiría en pelotas de papel.
    s.setAlpha(0);
    if (st.capa) st.capa.add(s);
    var c = {
      spr: s,
      vel: az(0.55, 1.5),
      vaiven: az(VAIVEN_COPO[0], VAIVEN_COPO[1]),
      fase: az(0, Math.PI * 2),
      amplitud: az(9, 30),
      x: 0, y: 0, vueltas: 0
    };
    reponerCopo(st, c, L.w, L.h, true);
    return c;
  }

  function reponerCopo(st, c, w, h, dentro) {
    c.vueltas = (c.vueltas || 0) + (dentro ? 0 : 1);
    // El viento arrastra al copo durante toda la caída, así que hay que
    // sembrarlos bien a barlovento o el lado de sotavento se queda vacío.
    var corr = (st.inclina || 0) * h * 2.2;
    var lo = corr > 0 ? -corr - 30 : -30;
    var hi = corr > 0 ? w + 30 : w - corr + 30;
    c.x = dentro ? az(0, w) : az(lo, hi);
    c.y = dentro ? az(-40, h) : az(-70, -6);
    c.spr.setPosition(c.x, c.y);
  }

  function moverCopos(st, dt, w, h, m, L) {
    for (var i = 0; i < st.copos.length; i++) {
      var c = st.copos[i];
      var v = VEL_COPO * c.vel * st.fuerzaNieve;
      c.fase += dt * c.vaiven;
      c.y += v * dt;
      // El vaivén va aparte del viento: uno es el aire quieto moviéndolo, el
      // otro es el aire empujándolo. Sumados dan el revoloteo que se ve.
      c.x += (Math.sin(c.fase) * c.amplitud + v * st.inclina * 2.2) * dt;
      c.spr.setPosition(c.x, c.y);
      c.spr.setAlpha(st.fuerzaNieve * 0.92);
      if (c.y > h + 12) {
        posarNieve(st, c.x, h - m - az(0, (h - m * 2) * 0.5), L);
        reponerCopo(st, c, w, h, false);
      } else if (c.x < -80 || c.x > w + 80) {
        reponerCopo(st, c, w, h, false);
      }
    }
  }

  /**
   * Marca un montoncito de nieve posada. Se deshace solo.
   *
   * Va en el MUNDO por el mismo motivo que la salpicadura: la nieve que ya ha
   * caído está EN EL SUELO. Pegada a la cámara, el manto entero patinaba por
   * el pueblo cada vez que el jugador daba un paso.
   */
  function posarNieve(st, x, y, L) {
    if (Math.random() > 0.3 * st.fuerzaNieve) return;
    for (var i = 0; i < st.posas.length; i++) {
      var p = st.posas[i];
      if (p.hasta > st.scene.time.now) continue;
      var q = L ? aMundo(st, L, x, y) : { x: x, y: y };
      p.spr.setTexture('gfc_' + elegir(POSAS));
      p.spr.setPosition(q.x, q.y);
      p.spr.setScale(az(0.9, 1.6));
      p.hasta = st.scene.time.now + az(1400, 3200);
      p.nace = st.scene.time.now;
      return;
    }
  }

  function nuevaPosa(st) {
    var s = st.scene.add.image(0, 0, 'gfc_' + POSAS[0]);
    s.setAlpha(0);
    s.setDepth(PROF_SALPICA);
    return { spr: s, hasta: 0, nace: 0 };
  }

  function moverPosas(st, ahora) {
    for (var i = 0; i < st.posas.length; i++) {
      var p = st.posas[i];
      var queda = p.hasta - ahora;
      if (queda <= 0) { p.spr.setAlpha(0); continue; }
      // aparece de golpe y se derrite despacio
      var t = (ahora - p.nace) / Math.max(1, p.hasta - p.nace);
      p.spr.setAlpha((1 - t) * 0.85 * st.fuerzaNieve);
    }
  }

  // ----------------------------------------------------------- salpicaduras
  /* La salpicadura vive en el MUNDO (ver aMundo), a ras de suelo y por debajo
     de todo lo demás: es agua en el barro, tiene que pisarse. Misma altura que
     los charcos, que llevan ahí desde siempre. */
  var PROF_SALPICA = PROF_CHARCO + 1;
  var SALPICA_MS   = 300;

  function nuevaSalpica(st) {
    var s = st.scene.add.image(0, 0, 'gfc_' + SALPICA[0]);
    s.setScale(2);
    s.setAlpha(0);
    s.setDepth(PROF_SALPICA);
    return { spr: s, hasta: 0, paso: 0, nace: 0, escala: 2 };
  }

  /**
   * Marca una salpicadura libre para que empiece su animación aquí.
   *
   * `x, y` vienen en píxeles del LIENZO (pantalla). Aquí se traducen al mundo
   * una sola vez, al nacer: a partir de ese momento la salpicadura ya no se
   * mueve nunca más, se queda donde cayó el agua aunque el jugador se vaya.
   */
  function salpicar(st, x, y, L) {
    if (Math.random() > 0.8 * st.fuerzaLluvia) return;
    for (var i = 0; i < st.salpicas.length; i++) {
      var sp = st.salpicas[i];
      if (sp.hasta > st.scene.time.now) continue;
      var p = L ? aMundo(st, L, x, y) : { x: x, y: y };
      sp.spr.setPosition(p.x, p.y);
      /* Cada salpicadura de su tamaño y girada a su aire. Todas iguales y
         mirando al mismo lado se veían como un sello repetido por el suelo. */
      sp.escala = az(1.4, 2.4);
      sp.spr.setScale(sp.escala);
      sp.spr.setRotation(az(-0.25, 0.25));
      sp.paso = 0;
      sp.nace = st.scene.time.now;
      sp.hasta = sp.nace + SALPICA_MS;
      return;
    }
  }

  function moverSalpicas(st, ahora) {
    for (var i = 0; i < st.salpicas.length; i++) {
      var sp = st.salpicas[i];
      var queda = sp.hasta - ahora;
      if (queda <= 0) { if (sp.spr.alpha) sp.spr.setAlpha(0); continue; }
      var paso = queda > SALPICA_MS * 0.62 ? 1 : (queda > SALPICA_MS * 0.3 ? 2 : 3);
      if (paso !== sp.paso) {
        sp.paso = paso;
        sp.spr.setTexture('gfc_salpica_' + paso);
      }
      /* LA ONDA SE ABRE. La corona de agua no se queda del mismo tamaño: sale
         disparada hacia arriba y se derrama hacia fuera. Creciendo un 45 %
         mientras se desvanece, tres dibujos fijos pasan a leerse como una
         salpicadura de verdad. */
      var t = 1 - queda / SALPICA_MS;                 // 0 al nacer, 1 al morir
      sp.spr.setScale(sp.escala * (1 + t * 0.45));
      sp.spr.setAlpha(Math.min(1, queda / (SALPICA_MS * 0.62)) * 0.85 * st.fuerzaLluvia);
    }
  }

  // -------------------------------------------------------- rayos y truenos
  /**
   * Un relámpago.
   *
   * Se hace en tres capas porque un rayo de verdad se ve así: primero el cielo
   * entero se ilumina (el fogonazo), luego se ve el trazo, y la sacudida de la
   * cámara llega con el trueno, un poco después.
   */
  /**
   * Dónde cae el próximo rayo.
   *
   * EL FALLO QUE ARREGLA: la x salía de un sorteo limpio, así que dos rayos
   * seguidos podían caer casi en el mismo sitio y parecía que la tormenta se
   * había quedado enganchada. Ahora se sortea hasta encontrar un sitio que esté
   * al menos a RAYO_SEPARA del anterior; si a la sexta no lo encuentra —puede
   * pasar con una pantalla estrecha— se queda con el último, que es mejor que
   * girar en el bucle.
   */
  function sitioDelRayo(st, L) {
    var izq = L.m + (L.w - L.m * 2) * 0.12;
    var der = L.m + (L.w - L.m * 2) * 0.88;
    var minSep = (der - izq) * RAYO_SEPARA;
    var p = st.ultimoRayoX;
    var x;

    if (p == null) {
      x = az(izq, der);
    } else {
      /* Se sortea DENTRO de lo permitido, no se sortea y se comprueba.

         Antes se tiraba al azar y se repetía hasta acertar, con seis intentos
         de tope. Con la banda prohibida ocupando más de la mitad de la
         pantalla, uno de cada treinta sorteos agotaba los seis intentos y se
         quedaba con el último — justo el que no valía. En 200 rayos eso son
         media docena de repeticiones: exactamente lo que se quería evitar.

         Repartiendo por LONGITUD entre el trozo de la izquierda y el de la
         derecha sale uniforme dentro de lo válido y no falla nunca. */
      var iz = Math.max(0, (p - minSep) - izq);
      var de = Math.max(0, der - (p + minSep));
      if (iz + de <= 0) {
        // No cabe la separación (pantalla estrechísima): al extremo más lejano.
        x = (p - izq > der - p) ? izq : der;
      } else if (Math.random() * (iz + de) < iz) {
        x = az(izq, izq + iz);
      } else {
        x = az(der - de, der);
      }
    }
    st.ultimoRayoX = x;
    return x;
  }

  /**
   * Una CENTELLA: el resplandor sin el trazo.
   *
   * En una tormenta de verdad la mayoría de los relámpagos no se ven como un
   * rayo dibujado: se ve el cielo encenderse y los bordes de todo blanquear un
   * instante. Solo unos pocos enseñan el trazo. Antes aquí solo había rayos, y
   * una tormenta entera de rayos con nombre y apellidos cansa y se nota falsa.
   *
   * La centella es barata: no mueve el sprite del rayo, solo enciende el
   * fogonazo flojo y el marco blanco de los bordes. A veces sacude un poco,
   * a veces nada — que no todas suenan.
   */
  function centella(st) {
    var ahora = st.scene.time.now;
    var fuerte = Math.random() < 0.45;

    st.fogonazo.setAlpha(fuerte ? 0.34 : 0.18);
    st.fogonazoHasta = ahora + (fuerte ? 110 : 70);

    st.bordeAlfa = fuerte ? 0.8 : 0.45;
    st.bordeHasta = ahora + az(120, 260);
    // Una centella es un rayo lejano: el mismo golpe de luz, mas flojo.
    if (window.GFPost && window.GFPost.pulso) window.GFPost.pulso(fuerte ? 0.5 : 0.28);

    // Una de cada tres retumba, y flojito.
    if (fuerte && Math.random() < 0.35) {
      st.truenoEn = ahora + az(260, 900);
      st.truenoFuerza = az(0.25, 0.5);
    }
    st.proximaCentella = ahora + az(CENTELLA_CADA[0], CENTELLA_CADA[1]) / st.fuerzaLluvia;
  }

  /** Pinta el marco blanco de los bordes de la pantalla. */
  function moverBorde(st, ahora, w, h, m) {
    var queda = st.bordeHasta - ahora;
    var i, b;
    if (queda <= 0) {
      for (i = 0; i < st.bordes.length; i++) st.bordes[i].setAlpha(0);
      return;
    }
    var a = Math.min(1, queda / 160) * st.bordeAlfa;
    // Grosor: la centella fuerte abre más el marco. Se mide sobre la pantalla,
    // no sobre el lienzo, o en pantallas anchas el marco se comería medio mapa.
    var g = (h - m * 2) * (0.10 + 0.16 * st.bordeAlfa);

    if (st.bordeSuave) {
      /* Cada tira pegada a su lado y estirada hacia dentro. El origen ya está
         puesto en el lado que toca, así que basta con colocar y estirar. */
      var lados = [
        [w / 2,     m,         w, g],      // arriba
        [w / 2,     h - m,     w, g],      // abajo
        [m,         h / 2,     g, h],      // izquierda
        [w - m,     h / 2,     g, h]       // derecha
      ];
      for (i = 0; i < st.bordes.length; i++) {
        b = st.bordes[i];
        b.setPosition(lados[i][0], lados[i][1]);
        b.setDisplaySize(lados[i][2], lados[i][3]);
        b.setAlpha(a);
      }
      return;
    }

    // respaldo recto
    var rectos = [
      [w / 2, m + g / 2, w, g], [w / 2, h - m - g / 2, w, g],
      [m + g / 2, h / 2, g, h], [w - m - g / 2, h / 2, g, h]
    ];
    for (i = 0; i < st.bordes.length; i++) {
      b = st.bordes[i];
      b.setPosition(rectos[i][0], rectos[i][1]);
      if (b.setSize) b.setSize(rectos[i][2], rectos[i][3]);
      b.setAlpha(a);
    }
  }

  function relampago(st) {
    var scene = st.scene;
    var cam = scene.cameras.main;
    var ahora = scene.time.now;

    var L = lienzo(cam);
    if (!st.rayo) { centella(st); return; }   // sin dibujo de rayo: solo fogonazo
    st.rayo.setTexture('gfc_' + elegir(RAYOS));
    // Dentro de lo que se ve, no del sobrante, y NUNCA donde cayó el anterior.
    st.rayo.setPosition(sitioDelRayo(st, L),
                        az(L.m - 30, L.m + L.h * 0.12));
    st.rayo.setScale(az(1.4, 2.6));
    st.rayo.setAlpha(1);
    st.rayoHasta = ahora + az(90, 190);

    st.fogonazo.setAlpha(0.72);
    st.fogonazoHasta = ahora + 130;
    st.bordeAlfa = 1;
    st.bordeHasta = ahora + az(180, 320);
    st.truenoFuerza = az(0.8, 1.3);

    /* Y el fotograma entero reacciona: el post-procesado sube el brillo, se
       lleva el color por delante y abre la vinneta durante un instante, que es
       lo que hace un rayo con un ojo de verdad. Si el modulo no esta (canvas,
       calidad baja) no pasa nada: sigue habiendo fogonazo. */
    if (window.GFPost && window.GFPost.pulso) window.GFPost.pulso(1);

    /* La sacudida llega DESPUÉS del destello, como el trueno de verdad: la luz
       viaja más rápido que el sonido. Ese retardo es lo que lo hace creíble. */
    /* Y a veces le da a un arbol. Va aqui, en el rayo CON TRAZO: una centella
       lejana no quema nada, y asi el jugador ve el rayo y el fuego a la vez. */
    if (Math.random() < PROB_INCENDIO) prenderArbol(st, st.rayo ? st.rayo.x : null);

    var retardo = az(180, 700);
    st.truenoEn = ahora + retardo;
    st.proximoTrueno = ahora + az(TRUENO_CADA[0], TRUENO_CADA[1]) / st.fuerzaLluvia;
    log('relámpago; trueno en', Math.round(retardo), 'ms');
  }

  function sacudir(st) {
    var cam = st.scene.cameras && st.scene.cameras.main;
    if (!cam || !cam.shake) return;
    /* Corta y suave: sacudir mucho marea y estorba para jugar.

       La fuerza VARÍA (st.truenoFuerza): el trueno de un rayo cercano retumba y
       el de una centella lejana apenas se nota. Todos iguales sonaba a efecto
       enlatado. El tope se queda en 0.006 · fuerza para no pasarse del sobrante
       que llevan las capas (ver MARGEN). */
    var f = st.truenoFuerza == null ? 1 : st.truenoFuerza;
    var dur = 220 + 180 * f;
    try { cam.shake(dur, 0.006 * f * st.fuerzaLluvia); } catch (e) {}
  }

  // ------------------------------------------------------------------ bucle
  function actualizar(st, ahora, delta) {
    var scene = st.scene;
    if (!scene || !scene.cameras || !scene.cameras.main) return;
    var cam = scene.cameras.main;
    /* Se recalcula cada frame: el jugador puede cambiar el zoom o el tamaño de
       la ventana en cualquier momento, y hasta ahora la lluvia se quedaba con
       la medida del arranque. */
    var L = lienzo(cam);
    var w = L.w, h = L.h;
    if (st.capa) { st.capa.setPosition(L.x, L.y); st.capa.setScale(L.escala); }
    st.inclina = inclinacion(st);
    var dt = Math.min(delta, 100) / 1000;

    // La lluvia y la nieve arrecian y amainan poco a poco: entrar de golpe canta.
    var paso = delta / ENTRA_MS;
    st.fuerzaLluvia = hacia(st.fuerzaLluvia,
                            (estado.activo && estado.lluvia) ? estado.lluviaFuerza : 0, paso);
    st.fuerzaNieve  = hacia(st.fuerzaNieve,
                            (estado.activo && estado.nieve) ? estado.nieveFuerza : 0, paso);

    moverSol(st, ahora, delta, w, h);
    filtroEstacion(st, delta, w, h);

    var lloviendo = st.fuerzaLluvia > 0.01;
    var nevando   = st.fuerzaNieve > 0.01;

    // La cortina la levantan las dos: nevando el mundo también se apaga, pero
    // hacia el blanco frío en vez del gris de tormenta.
    st.cortina.setPosition(w / 2, h / 2);
    if (st.cortina.setSize) st.cortina.setSize(w, h);
    if (nevando && !lloviendo) {
      st.cortina.fillColor = 0x9fb4cf;
      st.cortina.setAlpha(st.fuerzaNieve * 0.16);
    } else {
      st.cortina.fillColor = 0x37475e;
      st.cortina.setAlpha(lloviendo ? st.fuerzaLluvia * 0.20 : 0);
    }

    /* Charcos e incendio van SIEMPRE, llueva o no: los charcos tienen que
       poder secarse cuando escampa, y un arbol encendido tiene que acabar de
       arder aunque la tormenta ya haya pasado. Por eso van ANTES del `return`
       de "no llueve" que hay mas abajo. */
    moverCharcos(st, ahora, delta);
    moverIncendio(st, ahora, delta);

    var i, j;
    if (nevando) {
      moverCopos(st, dt, w, h, L.m, L);
      moverPosas(st, ahora);
    } else {
      for (i = 0; i < st.copos.length; i++) st.copos[i].spr.setAlpha(0);
      for (i = 0; i < st.posas.length; i++) st.posas[i].spr.setAlpha(0);
    }

    if (!lloviendo) {
      for (i = 0; i < st.gotas.length; i++) st.gotas[i].spr.setAlpha(0);
      for (j = 0; j < st.salpicas.length; j++) st.salpicas[j].spr.setAlpha(0);
      if (st.rayo) st.rayo.setAlpha(0);
      st.fogonazo.setAlpha(0);
      for (i = 0; i < st.bordes.length; i++) st.bordes[i].setAlpha(0);
      return;
    }

    moverGotas(st, dt, w, h, L.m, L);
    moverSalpicas(st, ahora);

    /* RELÁMPAGOS Y CENTELLAS.
       Los rayos con trazo son los pocos; las centellas —el resplandor sin
       dibujo— van mucho más seguidas. Es la proporción de una tormenta de
       verdad, y hace que la de aquí no parezca una feria de rayos. */
    if (estado.truenos) {
      if (!st.proximoTrueno) st.proximoTrueno = ahora + az(3000, 9000);
      if (ahora >= st.proximoTrueno) relampago(st);
      if (!st.proximaCentella) st.proximaCentella = ahora + az(800, 4000);
      // Nunca a la vez que un rayo: se pisarían y se vería un parpadeo raro.
      if (ahora >= st.proximaCentella && !st.rayoHasta) centella(st);
    }
    if (st.rayoHasta && ahora >= st.rayoHasta) {
      if (st.rayo) st.rayo.setAlpha(0);
      st.rayoHasta = 0;
    }
    if (st.fogonazoHasta) {
      var q = st.fogonazoHasta - ahora;
      var pico = st.fogonazo.alpha;
      st.fogonazo.setAlpha(q > 0 ? Math.max(0, q / 130) * Math.max(pico, 0.18) : 0);
      st.fogonazo.setPosition(w / 2, h / 2);
      if (st.fogonazo.setSize) st.fogonazo.setSize(w, h);
      if (q <= 0) st.fogonazoHasta = 0;
    }
    moverBorde(st, ahora, w, h, L.m);
    if (st.truenoEn && ahora >= st.truenoEn) { sacudir(st); st.truenoEn = 0; }
  }

  /**
   * Los haces de sol.
   *
   * El sol se pone FUERA del lienzo, arriba a la izquierda, y cada haz sale de
   * ahí girado un poco distinto. La intensidad se multiplica por la luz del día
   * (gf-ciclo-dia): al atardecer los rayos se van solos, porque un rayo de sol
   * de noche no tiene sentido y quedaría como una linterna.
   */
  function moverSol(st, ahora, delta, w, h) {
    if (!st.rayosSol || !st.rayosSol.length) return;

    var quiere = (estado.activo && estado.soleado) ? estado.soleadoFuerza : 0;
    st.fuerzaSol = hacia(st.fuerzaSol, quiere, delta / SOL_ENTRA_MS);

    // La luz del día. Sin el módulo del ciclo se da por hecho que es de día.
    var dia = 1;
    var C = window.GFCiclo;
    if (C && C.oscuridad) {
      try {
        var o = C.oscuridad();
        if (typeof o === 'number' && isFinite(o)) dia = Math.max(0, 1 - o);
      } catch (e) {}
    }
    var f = st.fuerzaSol * dia;

    /* Las motas de polvo van con el sol y con la luz del dia: si no hay sol no
       hay haz que las encienda, y de noche no se ve el polvo. */
    moverMotas(st, Math.min(delta, 100) / 1000, f);

    if (st.resplandorSol) {
      var t = Math.min(w, h) * 1.5;
      st.resplandorSol.setPosition(w * 0.06, h * 0.02);
      st.resplandorSol.setDisplaySize(t, t);
      st.resplandorSol.setAlpha(Math.min(0.5, f * 0.30));
      st.resplandorSol.setVisible(f > 0.01);
    }

    if (f <= 0.01) {
      for (var k = 0; k < st.rayosSol.length; k++) st.rayosSol[k].spr.setAlpha(0);
      return;
    }

    // De dónde salen: un punto fuera de cuadro, arriba a la izquierda.
    var sx = -w * 0.10, sy = -h * 0.14;
    var largoBase = Math.sqrt(w * w + h * h) * 1.25;

    for (var i = 0; i < st.rayosSol.length; i++) {
      var r = st.rayosSol[i];
      var s = r.spr;
      // Respira: abre y cierra el ángulo y sube y baja la intensidad.
      var b = Math.sin(ahora * 0.001 * r.ritmo + r.fase);
      s.setPosition(sx, sy);
      s.setRotation(SOL_ANGULO + r.desvio + b * 0.045);
      s.setDisplaySize(Math.max(18, 90 * r.ancho * (1 + b * 0.10)),
                       largoBase * r.largo);
      s.setAlpha(SOL_ALFA * r.alfa * f * (0.78 + 0.22 * b));
    }
  }

  /** Acerca `v` a `meta` como mucho `paso`. */
  function hacia(v, meta, paso) {
    if (v < meta) return Math.min(meta, v + paso);
    if (v > meta) return Math.max(meta, v - paso);
    return v;
  }

  /**
   * El color de la estación.
   *
   * Se cruza poco a poco de una estación a otra (ESTACION_MS): cambiar el color
   * del mundo de un frame al siguiente se ve como un fallo de render, no como
   * que ha entrado el otoño.
   */
  function filtroEstacion(st, delta, w, h) {
    if (!st.filtro) return;
    var e = ESTACIONES[estado.estacion] || ESTACIONES.verano;
    var paso = delta / ESTACION_MS;

    if (st.filtroColor !== e.color) {
      // Al cambiar de estación se baja a cero con el color viejo y se sube con
      // el nuevo: mezclar dos colores a medio camino da tonos que no son de
      // ninguna de las dos.
      st.filtroAlfa = Math.max(0, st.filtroAlfa - paso);
      if (st.filtroAlfa <= 0.001) {
        st.filtroColor = e.color;
        if (st.filtro.setTint) st.filtro.setTint(e.color);
        else st.filtro.fillColor = e.color;
      }
    } else {
      st.filtroAlfa = hacia(st.filtroAlfa, e.alfa, paso);
    }
    st.filtro.setAlpha(st.filtroAlfa);
    st.filtro.setPosition(w / 2, h / 2);
    // Imagen: se estira. Rectángulo (el respaldo): se redimensiona.
    if (st.filtro.setDisplaySize) st.filtro.setDisplaySize(w, h);
    else if (st.filtro.setSize) st.filtro.setSize(w, h);
  }


  // ═══════════════════════════════════════════════════════════ CHARCOS
  /**
   * ¿Se puede poner un charco aquí?
   *
   * Se pregunta a la escena por sus colisiones — el mismo camino que usan los
   * animales para no meterse en las paredes. Si la escena no lo expone, se dice
   * que no a todo: mejor sin charcos que con charcos dentro de una casa.
   */
  function sueloLibre(scene, x, y) {
    if (typeof scene._chocaConEscenario !== 'function') return false;
    try {
      // Se mira el punto y sus cuatro esquinas: un charco ocupa sitio, y
      // comprobando solo el centro se colaba medio charco bajo una pared.
      var r = 14;
      return !scene._chocaConEscenario(x, y) &&
             !scene._chocaConEscenario(x - r, y) &&
             !scene._chocaConEscenario(x + r, y) &&
             !scene._chocaConEscenario(x, y - 6) &&
             !scene._chocaConEscenario(x, y + 6);
    } catch (e) { return false; }
  }

  function nuevoCharco(st) {
    var s = st.scene.add.image(0, 0, 'gfc_' + CHARCOS[0]);
    s.setOrigin(0.5, 0.5);
    s.setDepth(PROF_CHARCO);
    s.setScale(2);                    // la escala del juego
    s.setAlpha(0);
    s.setVisible(false);
    return { spr: s, vivo: false, nace: 0, tam: 0 };
  }

  /** Busca sitio y enciende un charco. */
  function brotarCharco(st) {
    var scene = st.scene;
    var p = scene.player;
    if (!p) return;
    var libre = null;
    for (var i = 0; i < st.charcos.length; i++) {
      if (!st.charcos[i].vivo) { libre = st.charcos[i]; break; }
    }
    if (!libre) return;

    // Ocho intentos: si no hay sitio, se deja para la próxima vuelta.
    for (var t = 0; t < 8; t++) {
      var ang = az(0, Math.PI * 2);
      var d = az(120, CHARCO_RADIO);
      var x = p.x + Math.cos(ang) * d;
      var y = p.y + Math.sin(ang) * d;
      if (!sueloLibre(scene, x, y)) continue;
      // Ni encima de otro charco.
      var pegado = false;
      for (var k = 0; k < st.charcos.length; k++) {
        var c = st.charcos[k];
        if (c.vivo && Math.hypot(c.spr.x - x, c.spr.y - y) < 46) { pegado = true; break; }
      }
      if (pegado) continue;

      libre.vivo = true;
      libre.nace = scene.time.now;
      libre.tam = Math.floor(az(0, CHARCOS.length));
      libre.spr.setTexture('gfc_' + CHARCOS[libre.tam]);
      libre.spr.setPosition(Math.round(x), Math.round(y));
      libre.spr.setVisible(true);
      libre.spr.setAlpha(0);
      return;
    }
  }

  function moverCharcos(st, ahora, delta) {
    var lloviendo = st.fuerzaLluvia > 0.05;

    if (lloviendo) {
      if (!st.proximoCharco) st.proximoCharco = ahora + az(CHARCO_CADA[0], CHARCO_CADA[1]);
      if (ahora >= st.proximoCharco) {
        brotarCharco(st);
        st.proximoCharco = ahora + az(CHARCO_CADA[0], CHARCO_CADA[1]) / st.fuerzaLluvia;
      }
    }

    for (var i = 0; i < st.charcos.length; i++) {
      var c = st.charcos[i];
      if (!c.vivo) continue;
      var paso = delta / (lloviendo ? CHARCO_CRECE : -CHARCO_SECA);
      c.spr.alpha = Math.max(0, Math.min(0.82, c.spr.alpha + paso));
      if (!lloviendo && c.spr.alpha <= 0.001) {
        c.vivo = false;
        c.spr.setVisible(false);
      }
    }
  }

  // ═══════════════════════════════════════════════════════ INCENDIO
  /** Los árboles que se ven y no son ya un tocón. */
  function arbolesAlcanzables(scene) {
    var out = [];
    var vista = scene.cameras && scene.cameras.main && scene.cameras.main.worldView;
    var tocones = scene.treeStumps || {};
    var fam = [['sprite_arbolx', 18], ['sprite_pinos', 45]];
    for (var f = 0; f < fam.length; f++) {
      for (var i = 1; i <= fam[f][1]; i++) {
        var clave = fam[f][0] + i;
        if (tocones[clave]) continue;
        var spr = scene[clave];
        if (!spr || spr.active === false) continue;
        // Solo lo que se ve: quemar un árbol al otro lado del mapa no lo vería
        // nadie y encima lo bloquearía sin motivo.
        if (vista && (spr.x < vista.x - 60 || spr.x > vista.right + 60 ||
                      spr.y < vista.y - 60 || spr.y > vista.bottom + 60)) continue;
        out.push({ clave: clave, spr: spr });
      }
    }
    return out;
  }

  /** El rayo le ha dado a un árbol: empieza a arder. */
  function prenderArbol(st, rayoX) {
    var scene = st.scene;
    if (st.incendio) return;                       // uno a la vez
    if (!scene.textures.exists('gfc_' + FUEGOS[0])) return;
    var cand = arbolesAlcanzables(scene);
    if (!cand.length) return;

    /* El más cercano a donde ha caído el rayo, en pantalla. Si se cogiera uno
       al azar, se vería el rayo en un lado y el fuego en el otro. */
    var vista = scene.cameras.main.worldView;
    var mundoX = vista.x + (rayoX == null ? vista.width / 2 : rayoX);
    var mejor = cand[0], mejorD = Infinity;
    for (var i = 0; i < cand.length; i++) {
      var d = Math.abs(cand[i].spr.x - mundoX);
      if (d < mejorD) { mejorD = d; mejor = cand[i]; }
    }

    var spr = mejor.spr;
    var alto = spr.displayHeight || 80;
    var ancho = spr.displayWidth || 40;
    var base = spr.y;                              // origen (0,1)
    var cx = spr.x + ancho / 2;

    var inc = {
      clave: mejor.clave, spr: spr, nace: scene.time.now,
      llamas: [], humos: [], pavesas: [], halo: null,
      cx: cx, base: base, alto: alto, ancho: ancho,
      baseRot: spr.rotation || 0,
      fase: 'arde', paso: 0, proximoPaso: 0
    };

    /* EL HALO, LO PRIMERO Y LO MÁS ABAJO.

       Va por DEBAJO de las llamas y por debajo del propio árbol: es la luz que
       el fuego echa sobre el suelo y sobre lo que tiene alrededor, no un
       adorno delante. En aditivo, así que suma luz en vez de pintar naranja
       encima — la diferencia entre "está iluminado" y "le han puesto un filtro". */
    var claveHalo = texturaHalo(scene);
    if (claveHalo) {
      var halo = scene.add.image(cx, base - alto * 0.30, claveHalo);
      halo.setDepth(Math.max(0, spr.depth - 1));
      if (halo.setBlendMode && window.Phaser && Phaser.BlendModes) {
        halo.setBlendMode(Phaser.BlendModes.ADD);
      }
      halo.setAlpha(0);
      inc.halo = halo;
    }

    /* SEIS LLAMAS, NO TRES, Y CADA UNA A SU AIRE.

       Con tres el fuego se leía como tres pegatinas: las tres del mismo
       tamaño, las tres cambiando de dibujo A LA VEZ (mismo `paso`), las tres
       quietas en su sitio. Un fuego real no tiene dos lenguas iguales ni dos
       que hagan lo mismo al mismo tiempo.

       Ahora cada llama lleva su propio desfase de animación, su propio ritmo
       de parpadeo, su propia amplitud de vaivén y su propia altura. Y las de
       abajo son grandes y las de arriba pequeñas, que es como arde un árbol:
       la base es una hoguera y la copa son lenguas sueltas. */
    var sitios = [
      [cx,                    base - alto * 0.06, 2.5, 1.00],
      [cx - ancho * 0.20,     base - alto * 0.14, 2.1, 0.92],
      [cx + ancho * 0.22,     base - alto * 0.12, 2.0, 0.88],
      [cx - ancho * 0.12,     base - alto * 0.40, 1.6, 0.74],
      [cx + ancho * 0.16,     base - alto * 0.46, 1.4, 0.68],
      [cx + ancho * 0.02,     base - alto * 0.64, 1.1, 0.55]
    ];
    for (var k = 0; k < sitios.length; k++) {
      var ll = scene.add.image(sitios[k][0], sitios[k][1], 'gfc_' + elegir(FUEGOS));
      ll.setOrigin(0.5, 1).setScale(sitios[k][2]);
      ll.setDepth(spr.depth + 2 + k);
      if (ll.setBlendMode && window.Phaser && Phaser.BlendModes) {
        // Aditivo: dos lenguas que se cruzan dan más luz, no una mancha opaca.
        ll.setBlendMode(Phaser.BlendModes.ADD);
      }
      inc.llamas.push({
        spr: ll,
        x0: sitios[k][0], y0: sitios[k][1], escala: sitios[k][2],
        brillo: sitios[k][3],
        desfase: Math.floor(az(0, FUEGOS.length)),   // no cambian todas a la vez
        ritmo: az(0.7, 1.6),                          // ni al mismo ritmo
        fase: az(0, Math.PI * 2),
        vaiven: az(1.6, 4.2),
        amplitud: az(1.5, 5.0)
      });
    }

    /* Cuatro columnas de humo en vez de dos, y cada una con su vida: nace
       pequeña y opaca junto a la llama, sube, se ensancha y se deshace. Antes
       las dos subían a la misma velocidad y volvían al mismo sitio, y se veía
       el bucle. */
    if (scene.textures.exists('gfc_' + HUMOS[0])) {
      for (var h = 0; h < 4; h++) {
        var hu = scene.add.image(cx, base - alto * 0.5, 'gfc_' + elegir(HUMOS));
        hu.setOrigin(0.5, 1).setDepth(spr.depth + 9).setAlpha(0);
        inc.humos.push({
          spr: hu,
          x0: cx + az(-ancho * 0.22, ancho * 0.22),
          vida: az(0, 1),                 // escalonadas: no salen todas a la vez
          dura: az(2200, 4200),
          sube: az(16, 34),               // px/s
          giro: az(-0.5, 0.5),
          escala: az(1.5, 2.8)
        });
      }
    }

    /* PAVESAS: los puntitos de brasa que suben del fuego. Es el detalle que
       más "fuego real" da por lo poco que cuesta — ocho imágenes de tres
       píxeles subiendo en espiral y apagándose. */
    if (scene.textures.exists('gfc_' + BRASAS[0])) {
      for (var b = 0; b < 10; b++) {
        var pv = scene.add.image(cx, base, 'gfc_' + elegir(BRASAS));
        pv.setDepth(spr.depth + 8).setAlpha(0);
        if (pv.setBlendMode && window.Phaser && Phaser.BlendModes) {
          pv.setBlendMode(Phaser.BlendModes.ADD);
        }
        inc.pavesas.push({ spr: pv, vida: 1, dura: 1, x: cx, y: base,
                           vx: 0, vy: 0, fase: 0, vaiven: 0 });
      }
    }

    st.incendio = inc;
    log('rayo en', mejor.clave, '— arde', ARDE_MS / 1000, 's');
  }

  /** Reinicia una pavesa en la base del fuego, con su empujón y su vida. */
  function soltarPavesa(inc, p, ahora) {
    p.x = inc.cx + az(-inc.ancho * 0.24, inc.ancho * 0.24);
    p.y = inc.base - inc.alto * az(0.02, 0.22);
    p.vy = -az(26, 62);                    // px/s hacia arriba
    p.vx = az(-8, 8);
    p.fase = az(0, Math.PI * 2);
    p.vaiven = az(1.5, 4);
    p.dura = az(900, 2100);
    p.vida = 0;
    p.nace = ahora;
    p.spr.setScale(az(1.2, 2.4));
  }

  /** Avisa al servidor de que el árbol ha caído. Nadie se lleva nada. */
  function avisarArbolQuemado(scene, clave) {
    var tipo = null;
    if (clave.indexOf('sprite_pinos') === 0) tipo = 'pinos';
    else if (clave.indexOf('sprite_arbustos') === 0) tipo = 'arbustos';
    else if (clave.indexOf('sprite_arbolx') === 0) tipo = 'arbolx';
    if (!tipo) return;
    var M = window.GFMascota;
    if (!M || !M.api) return;
    /* /api/tree/lock es la ruta que bloquea el árbol y avisa a TODOS por
       socket. No entrega nada a nadie, que es justo lo que se quiere: el árbol
       se ha quemado, no lo ha talado un jugador. Y el respawn que aplica es el
       normal del juego, con su deforestación y todo. */
    M.api('/api/tree/lock', { treeKey: clave, treeType: tipo })
     .then(function (r) { log('árbol quemado avisado:', clave, r && r.ok); });
  }

  function moverIncendio(st, ahora, delta) {
    var inc = st.incendio;
    if (!inc) return;
    var scene = st.scene;
    var t = ahora - inc.nace;
    var dt = Math.min(delta || 16, 100) / 1000;
    var i;

    /* EL PULSO DEL FUEGO.

       Un solo seno se ve como un latido de máquina. Tres senos con periodos
       que no son múltiplos entre sí no se repiten nunca a ojo: es el truco
       clásico para que algo parpadee "como una llama" y no "como un LED".
       Sale entre 0 y 1, casi siempre alto y de vez en cuando bajo. */
    var pulso = 0.62
      + 0.20 * Math.sin(ahora * 0.0130)
      + 0.11 * Math.sin(ahora * 0.0291 + 1.7)
      + 0.07 * Math.sin(ahora * 0.0533 + 4.2);
    if (pulso < 0) pulso = 0; else if (pulso > 1) pulso = 1;

    // El viento también empuja el fuego: las lenguas se tumban a sotavento.
    var empuje = (st.inclina || 0) * 0.55;

    // Cuánto queda de fuego: entra rápido y, al final, se apaga solo.
    var vigor = inc.fase === 'arde'
      ? Math.min(1, t / 900) * (1 - Math.max(0, (t - (ARDE_MS - 7000)) / 7000))
      : 0;
    if (vigor < 0) vigor = 0;

    // ── llamas ──────────────────────────────────────────────────────────
    if (ahora >= inc.proximoPaso) {
      inc.proximoPaso = ahora + 1000 / FUEGO_FPS;
      inc.paso++;
      for (i = 0; i < inc.humos.length; i++) {
        // El humo cambia de dibujo mucho más despacio que la llama.
        if (inc.paso % 3 === 0) {
          inc.humos[i].spr.setTexture('gfc_' + elegir(HUMOS));
        }
      }
    }
    for (i = 0; i < inc.llamas.length; i++) {
      var ll = inc.llamas[i];
      /* Cada lengua avanza su animación a SU ritmo y desde SU fotograma. Ese
         desfase es lo que rompe el "todas iguales" de antes. */
      var cuadro = Math.floor(inc.paso * ll.ritmo + ll.desfase) % FUEGOS.length;
      ll.spr.setTexture('gfc_' + FUEGOS[cuadro]);

      ll.fase += dt * ll.vaiven;
      var b = Math.sin(ll.fase);
      var p = pulso * (0.75 + 0.25 * Math.sin(ll.fase * 0.7 + 1.1));
      // Se bambolea, se estira y se encoge: el fuego nunca está quieto.
      ll.spr.setPosition(ll.x0 + b * ll.amplitud + empuje * 14 * ll.brillo,
                         ll.y0 + Math.sin(ll.fase * 1.7) * 1.5);
      ll.spr.setScale(ll.escala * (0.86 + 0.20 * p) * vigor || 0.0001,
                      ll.escala * (0.78 + 0.34 * p) * vigor || 0.0001);
      ll.spr.setRotation(b * 0.06 + empuje * 0.22);
      ll.spr.setAlpha(Math.min(1, (0.55 + 0.45 * p) * ll.brillo * vigor));
    }

    // ── halo: la luz que echa el fuego alrededor ────────────────────────
    if (inc.halo) {
      var radio = inc.alto * (1.5 + 0.16 * pulso) * (0.4 + 0.6 * vigor);
      inc.halo.setDisplaySize(radio, radio);
      inc.halo.setPosition(inc.cx, inc.base - inc.alto * 0.26);
      inc.halo.setAlpha((0.30 + 0.22 * pulso) * vigor);
      /* De noche el fuego se ve MUCHO más: es la única luz que hay. Se le
         sube el halo con la oscuridad del ciclo de día, si está. */
      var C = window.GFCiclo;
      if (C && C.oscuridad) {
        try {
          var o = C.oscuridad();
          if (typeof o === 'number' && isFinite(o)) {
            inc.halo.setAlpha(inc.halo.alpha * (1 + o * 1.1));
          }
        } catch (e) {}
      }
    }

    // ── humo: nace, sube, se ensancha y se va ───────────────────────────
    for (i = 0; i < inc.humos.length; i++) {
      var hm = inc.humos[i];
      hm.vida += dt * 1000 / hm.dura;
      if (hm.vida >= 1) { hm.vida = 0; hm.spr.setTexture('gfc_' + elegir(HUMOS)); }
      var vh = hm.vida;
      /* Sube derecho al principio y luego se lo lleva el viento, que es lo que
         hace una columna de humo de verdad: recta hasta que gana el aire. */
      hm.spr.setPosition(hm.x0 + empuje * 60 * vh * vh + Math.sin(vh * 6 + i) * 6,
                         inc.base - inc.alto * 0.45 - hm.sube * vh * 3.2);
      hm.spr.setScale(hm.escala * (0.5 + vh * 1.5));
      hm.spr.setRotation(hm.giro * vh);
      // Aparece deprisa y se deshace despacio.
      hm.spr.setAlpha(Math.min(vh * 5, 1 - vh) * 0.55 * Math.max(vigor, 0.25));
    }

    // ── pavesas: chispas que suben y se apagan ──────────────────────────
    for (i = 0; i < inc.pavesas.length; i++) {
      var pv = inc.pavesas[i];
      pv.vida += dt * 1000 / pv.dura;
      if (pv.vida >= 1) {
        // Solo se sueltan chispas mientras haya fuego que las suelte.
        if (vigor > 0.05 && Math.random() < 0.6) soltarPavesa(inc, pv, ahora);
        else { pv.spr.setAlpha(0); pv.vida = 1; continue; }
      }
      pv.fase += dt * pv.vaiven;
      // La chispa pierde fuerza al subir (el aire caliente se enfría).
      pv.vy += 26 * dt;
      pv.x += (pv.vx + Math.sin(pv.fase) * 12 + empuje * 40) * dt;
      pv.y += pv.vy * dt;
      pv.spr.setPosition(pv.x, pv.y);
      pv.spr.setAlpha((1 - pv.vida) * (0.55 + 0.45 * Math.sin(pv.fase * 3)));
    }

    if (inc.fase === 'arde') {
      // el árbol se va tiznando
      var q = Math.min(1, t / ARDE_MS);
      if (inc.spr.setTint) {
        /* Y no solo se oscurece: primero coge el color del fuego (se pone
           anaranjado por la luz que le da) y solo después se vuelve carbón.
           Pasar directo de verde a gris se veía como si le bajaran el brillo. */
        var calor = Math.max(0, 1 - q * 2.2);
        var v = Math.round(255 - 165 * q);
        var r = Math.min(255, Math.round(v + 70 * calor * pulso));
        var g2 = Math.round(v + 24 * calor * pulso);
        inc.spr.setTint((r << 16) | (Math.min(255, g2) << 8) | v);
      }
      /* Y tiembla un poco: el aire caliente y la madera que cruje. Muy poco
         —dos centésimas de radián— pero el ojo lo nota y el árbol deja de
         parecer una calcomanía con fuego encima. */
      if (typeof inc.spr.rotation === 'number') {
        inc.spr.rotation = inc.baseRot +
          Math.sin(ahora * 0.021) * 0.010 * vigor +
          Math.sin(ahora * 0.047) * 0.006 * vigor;
      }
      if (t >= ARDE_MS) {
        /* SE CAE. Solo queda el tocón, y entra en el respawn normal.
           showTreeStump es el mismo camino que usa el juego al talar, así que
           el tocón sale con la textura, la posición y la profundidad buenas. */
        if (typeof scene.showTreeStump === 'function') scene.showTreeStump(inc.clave);
        if (inc.spr.clearTint) inc.spr.clearTint();
        // Se le devuelve la rotación que tenía: el temblor era prestado.
        if (typeof inc.spr.rotation === 'number') inc.spr.rotation = inc.baseRot;
        avisarArbolQuemado(scene, inc.clave);
        // las llamas se apagan y quedan rescoldos en el suelo
        for (i = 0; i < inc.llamas.length; i++) inc.llamas[i].spr.destroy();
        inc.llamas.length = 0;
        /* TRES RESCOLDOS EN EL SUELO, no uno. Un árbol que se cae deja una
           mancha de brasas, no un puntito. Y quedan a ras de suelo, con la
           profundidad del tocón, para que se pueda pasar por delante. */
        inc.brasas = [];
        for (var rb = 0; rb < 3; rb++) {
          var brasa = scene.add.image(
            inc.cx + az(-inc.ancho * 0.25, inc.ancho * 0.25),
            inc.base + az(-3, 3), 'gfc_' + elegir(BRASAS));
          brasa.setOrigin(0.5, 1).setScale(az(1.4, 2.3));
          brasa.setDepth(inc.spr.depth + 1);
          if (brasa.setBlendMode && window.Phaser && Phaser.BlendModes) {
            brasa.setBlendMode(Phaser.BlendModes.ADD);
          }
          inc.brasas.push({ spr: brasa, fase: az(0, 6.28), ritmo: az(1.2, 3.0) });
        }
        inc.fase = 'brasas';
        inc.nace = ahora;
        log('el árbol', inc.clave, 'se ha caído; queda el tocón');
      }
      return;
    }

    /* RESCOLDOS: se apagan y se acabó.
       El halo sigue un rato, cada vez más bajo y más rojo: unas brasas dan
       luz mucho después de que ya no haya llama. Es lo que remata el efecto. */
    if (inc.halo) {
      var res = Math.max(0, 1 - t / BRASAS_MS);
      inc.halo.setDisplaySize(inc.alto * 0.9 * res, inc.alto * 0.9 * res);
      inc.halo.setPosition(inc.cx, inc.base - 6);
      inc.halo.setAlpha(res * res * (0.14 + 0.08 * pulso));
    }
    if (inc.brasas) {
      for (i = 0; i < inc.brasas.length; i++) {
        var br = inc.brasas[i];
        br.fase += dt * br.ritmo;
        br.spr.setTexture('gfc_' + BRASAS[Math.floor(inc.paso * 0.4 + i) % BRASAS.length]);
        // Respiran: se avivan y se apagan, como brasas de verdad.
        br.spr.setAlpha(Math.max(0, 1 - t / BRASAS_MS) * (0.55 + 0.45 * Math.sin(br.fase)));
      }
    }
    if (t >= BRASAS_MS) {
      apagarIncendio(st);
    }
  }

  function apagarIncendio(st) {
    var inc = st.incendio;
    if (!inc) return;
    var i;
    for (i = 0; i < inc.llamas.length; i++) inc.llamas[i].spr.destroy();
    for (i = 0; i < inc.humos.length; i++) inc.humos[i].spr.destroy();
    if (inc.pavesas) for (i = 0; i < inc.pavesas.length; i++) inc.pavesas[i].spr.destroy();
    if (inc.brasas)  for (i = 0; i < inc.brasas.length; i++) inc.brasas[i].spr.destroy();
    if (inc.brasa && inc.brasa.destroy) inc.brasa.destroy();   // incendios viejos
    if (inc.halo) inc.halo.destroy();
    if (inc.spr && inc.spr.clearTint) inc.spr.clearTint();
    // La rotación era prestada: se devuelve pase lo que pase.
    if (inc.spr && typeof inc.spr.rotation === 'number') inc.spr.rotation = inc.baseRot || 0;
    st.incendio = null;
  }

  // ---------------------------------------------------------------- montaje
  function montar(scene, opciones) {
    opciones = opciones || {};
    if (!scene || !scene.add) return null;
    if (scene.__gfClima) return scene.__gfClima;
    if (!hayTexturas(scene)) {
      console.warn('[clima] falta la textura de la lluvia (' + RUTA +
                   'gota_*.png): no se monta. Revisa GFClima.precargar().');
      return null;
    }
    /* Se avisa de lo que falte, pero se sigue: lo que no esté, no se pinta. */
    var ausentes = faltan(scene);
    if (ausentes.length) {
      console.warn('[clima] faltan ' + ausentes.length + ' imágenes en ' + RUTA +
                   ' — esos adornos no se verán: ' + ausentes.join(', '));
    }
    var cam = scene.cameras.main;
    var L = lienzo(cam);
    var st = {
      scene: scene, gotas: [], salpicas: [], copos: [], posas: [], bordes: [],
      motas: [],
      charcos: [], proximoCharco: 0, incendio: null,
      fuerzaLluvia: 0, fuerzaNieve: 0,
      proximoTrueno: 0, proximaCentella: 0, truenoEn: 0, truenoFuerza: 1,
      rayoHasta: 0, fogonazoHasta: 0, ultimoRayoX: null,
      bordeAlfa: 0, bordeHasta: 0,
      filtroColor: ESTACIONES.verano.color, filtroAlfa: 0,
      inclina: INCLINA_MIN
    };
    scene.__gfClima = st;
    montado = st;

    /* TODO EN UN CONTENEDOR.
       Una sola transformación por frame para las ~270 piezas, y el zoom se
       resuelve en un sitio. Dentro manda el ORDEN de inserción: filtro de la
       estación, cortina, gotas, copos, salpicaduras, nieve posada, rayo, marco
       y por último el fogonazo. */
    if (scene.add.container) {
      st.capa = scene.add.container(0, 0);
      st.capa.setScrollFactor(0);
      st.capa.setDepth(PROF_LLUVIA);
    }

    /* Filtro de la estación, el primero de todos: es el color del MUNDO, así
       que la lluvia y la nieve van por encima sin teñirse. Multiplica en vez de
       superponerse — ver ESTACIONES. */
    var blanco = texturaBlanca(scene);
    if (blanco) {
      st.filtro = scene.add.image(L.w / 2, L.h / 2, blanco);
      st.filtro.setScrollFactor(0);
      st.filtro.setDisplaySize(L.w, L.h);
      st.filtro.setTint(ESTACIONES.verano.color);
      st.filtro.setAlpha(0);
      if (st.filtro.setBlendMode) st.filtro.setBlendMode(MULTIPLICAR);
    } else {
      // Sin canvas de texturas: se cae a un rectángulo. Se verá como un velo
      // en vez de como un tinte, pero es mejor que no tener estaciones.
      st.filtro = lienzoRect(scene, L.w / 2, L.h / 2, L.w, L.h,
                             ESTACIONES.verano.color);
    }
    if (st.capa) st.capa.add(st.filtro); else st.filtro.setDepth(PROF_ESTACION);

    // Cortina gris de tormenta: apaga el mundo mientras llueve.
    st.cortina = lienzoRect(scene, L.w / 2, L.h / 2, L.w, L.h, 0x37475e);
    if (st.capa) st.capa.add(st.cortina); else st.cortina.setDepth(PROF_CORTINA);

    /* SOL. Va aquí, entre la cortina y las gotas, y no es indiferente: la luz
       está en el aire, así que tiene que quedar por encima del mundo pero por
       DEBAJO de la lluvia y de la nieve — si no, los haces se dibujarían encima
       de los copos y parecerían un cristal delante de la pantalla. */
    var i;
    st.rayosSol = [];
    st.fuerzaSol = 0;
    var claveRayo = texturaRayo(scene);
    if (claveRayo) {
      /* El sol está FUERA de la pantalla, arriba a la izquierda: los haces
         salen de un punto que no se ve, que es lo que hace que se lean como
         algo que entra por la ventana y no como un abanico dibujado. */
      for (i = 0; i < N_RAYOS; i++) {
        var r = scene.add.image(0, 0, claveRayo);
        r.setOrigin(0.5, 0);          // el pie del haz es el sol
        r.setScrollFactor(0);
        r.setAlpha(0);
        if (r.setBlendMode && window.Phaser && Phaser.BlendModes) {
          r.setBlendMode(Phaser.BlendModes.ADD);
        }
        if (st.capa) st.capa.add(r); else r.setDepth(PROF_SOL);
        st.rayosSol.push({
          spr: r,
          // Cada haz con su sitio, su grosor y su ritmo: si respiraran todos
          // igual se vería la cuadrícula.
          desvio: (i / (N_RAYOS - 1) - 0.5) * 2 * SOL_ABANICO,
          ancho: az(0.5, 1.6),
          largo: az(1.1, 1.9),
          alfa: az(0.55, 1.15),
          fase: az(0, Math.PI * 2),
          ritmo: az(0.10, 0.28)
        });
      }
      /* Las motas de polvo del día soleado. Van en el MUNDO, así que no entran
         en el contenedor de pantalla; se crean aquí, junto al sol, porque son
         parte del mismo efecto y se apagan con él. */
      var claveMota = texturaMota(scene);
      st.motas = [];
      if (claveMota) {
        for (var mm = 0; mm < N_MOTAS; mm++) st.motas.push(nuevaMota(st, claveMota));
      }

      var claveRes = texturaResplandor(scene);
      if (claveRes) {
        st.resplandorSol = scene.add.image(0, 0, claveRes);
        st.resplandorSol.setScrollFactor(0);
        st.resplandorSol.setAlpha(0);
        if (st.resplandorSol.setBlendMode && window.Phaser && Phaser.BlendModes) {
          st.resplandorSol.setBlendMode(Phaser.BlendModes.ADD);
        }
        if (st.capa) st.capa.add(st.resplandorSol);
        else st.resplandorSol.setDepth(PROF_SOL);
      }
    }

    /* Cada familia se crea SOLO si tiene sus imágenes. Los bucles de
       actualizar() recorren estos arrays, así que uno vacío simplemente no
       pinta nada — no hace falta ningún `if` más abajo. */
    for (i = 0; i < N_GOTAS; i++)   st.gotas.push(nuevaGota(st));
    if (hay(scene, COPOS))   for (i = 0; i < N_COPOS; i++)   st.copos.push(nuevoCopo(st));
    if (hay(scene, SALPICA)) for (i = 0; i < N_SALPICA; i++) st.salpicas.push(nuevaSalpica(st));
    if (hay(scene, POSAS))   for (i = 0; i < N_POSAS; i++)   st.posas.push(nuevaPosa(st));
    // Los charcos NO van en el contenedor: viven en el mundo, no en la pantalla.
    if (hay(scene, CHARCOS)) for (i = 0; i < N_CHARCOS; i++) st.charcos.push(nuevoCharco(st));

    // Rayo, marco y fogonazo al final: van por encima de todo lo que cae.
    /* El rayo con TRAZO necesita sus imágenes. Sin ellas se pierde el dibujo
       del rayo, pero el fogonazo, el marco encendido y el trueno siguen — que
       es casi toda la tormenta. */
    if (hay(scene, RAYOS)) {
      st.rayo = scene.add.image(0, 0, 'gfc_' + RAYOS[0]);
      st.rayo.setScrollFactor(0).setOrigin(0.5, 0).setAlpha(0);
      if (st.capa) st.capa.add(st.rayo); else st.rayo.setDepth(PROF_RAYO);
    }

    /* Marco de los bordes, lo que enciende una centella. Cuatro tiras de
       degradado, cada una anclada a su lado y desvaneciéndose hacia dentro.
       El orden es arriba, abajo, izquierda, derecha — igual que en moverBorde. */
    st.bordeSuave = texturasBorde(scene);
    var lados = st.bordeSuave
      ? [['gfc_borde_v', 0.5, 0, false, false],   // arriba
         ['gfc_borde_v', 0.5, 1, false, true],    // abajo  (volteada)
         ['gfc_borde_h', 0,   0.5, false, false], // izquierda
         ['gfc_borde_h', 1,   0.5, true,  false]] // derecha (volteada)
      : null;
    for (i = 0; i < 4; i++) {
      var b;
      if (lados) {
        b = scene.add.image(0, 0, lados[i][0]);
        b.setOrigin(lados[i][1], lados[i][2]);
        b.setFlipX(lados[i][3]);
        b.setFlipY(lados[i][4]);
        b.setScrollFactor(0);
        b.setAlpha(0);
      } else {
        // Sin canvas de texturas: el marco recto de antes, que es mejor que nada.
        b = lienzoRect(scene, 0, 0, 10, 10, 0xffffff);
      }
      if (st.capa) st.capa.add(b); else b.setDepth(PROF_RAYO + 1);
      st.bordes.push(b);
    }

    st.fogonazo = lienzoRect(scene, L.w / 2, L.h / 2, L.w, L.h, 0xdfe9ff);
    if (st.capa) st.capa.add(st.fogonazo); else st.fogonazo.setDepth(PROF_FOGONAZO);

    st.onUpdate = function (t, d) { actualizar(st, t, d); };
    scene.events.on('update', st.onUpdate);
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);

    if (!opciones.sinRed) arrancarRed();
    // Y se reenvia al viento lo ultimo que se sepa: al entrar a una escena
    // nueva el viento nace sin orden y hay que volver a darsela.
    if (estado.cargado) mandarAlViento();
    log('montado');
    return st;
  }

  /**
   * Arranca la consulta periodica y el enganche al socket.
   *
   * VA APARTE DE montar() A PROPOSITO. Antes esto vivia dentro de montar(), asi
   * que si la escena no llegaba a montar el clima —falta una textura, se esta
   * en la tienda, el mapa aun no ha terminado de crearse— el juego se quedaba
   * SIN PREGUNTAR NUNCA que tiempo hace, y sin escuchar los avisos del
   * servidor. Un aviso perdido con el clima en MANUAL no se recupera solo,
   * porque el servidor no vuelve a mandar nada hasta que el administrador
   * toque algo: por eso "solo funcionaban los climas automaticos".
   *
   * Ahora la red arranca sola al cargar el archivo y no se para nunca: cuesta
   * una consulta cada 45 s y una comprobacion cada 2 s.
   */
  function arrancarRed() {
    if (redArrancada) return;
    redArrancada = true;
    sincronizar();
    if (!timerSync) timerSync = setInterval(sincronizar, SYNC_MS);
    /* El vigilante NO se para al conseguirlo: sigue mirando por si el juego
       cambia de socket. Pararlo era justo el fallo. */
    engancharSocket();
    if (!timerSocket) timerSocket = setInterval(engancharSocket, 2000);
  }

  function desmontar(scene) {
    var st = scene && scene.__gfClima;
    if (!st) return;
    if (st.onUpdate) scene.events.off('update', st.onUpdate);
    if (st.onApagar) {
      scene.events.off('shutdown', st.onApagar);
      scene.events.off('destroy', st.onApagar);
    }
    var i;
    for (i = 0; i < st.gotas.length; i++)    st.gotas[i].spr.destroy();
    for (i = 0; i < st.salpicas.length; i++) st.salpicas[i].spr.destroy();
    for (i = 0; i < st.copos.length; i++)    st.copos[i].spr.destroy();
    for (i = 0; i < st.posas.length; i++)    st.posas[i].spr.destroy();
    for (i = 0; i < st.bordes.length; i++)   st.bordes[i].destroy();
    for (i = 0; i < st.charcos.length; i++)  st.charcos[i].spr.destroy();
    apagarIncendio(st);
    if (st.rayosSol) {
      for (i = 0; i < st.rayosSol.length; i++) st.rayosSol[i].spr.destroy();
      st.rayosSol.length = 0;
    }
    if (st.motas) {
      for (i = 0; i < st.motas.length; i++) st.motas[i].spr.destroy();
      st.motas.length = 0;
    }
    if (st.resplandorSol) st.resplandorSol.destroy();
    if (st.filtro)   st.filtro.destroy();
    if (st.cortina)  st.cortina.destroy();
    if (st.fogonazo) st.fogonazo.destroy();
    if (st.rayo)     st.rayo.destroy();
    if (st.capa && st.capa.destroy) st.capa.destroy();
    st.capa = null;
    st.gotas.length = 0; st.salpicas.length = 0;
    st.copos.length = 0; st.posas.length = 0; st.bordes.length = 0;
    st.charcos.length = 0;
    scene.__gfClima = null;
    if (montado === st) montado = null;
  }

  window.GFClima = {
    precargar: precargar,
    montar: montar,
    desmontar: desmontar,
    sincronizar: sincronizar,
    engancharSocket: engancharSocket,
    estado: function () { return estado; },
    /**
     * Para mirar desde la consola por que no se ve el tiempo.
     *   GFClima.diagnostico()
     */
    /** Vuelve a pedir el tiempo AHORA y lo aplica. Para probarlo a mano. */
    refrescar: function () { return sincronizar(); },
    /** Reenvia al viento lo ultimo que dijo el servidor. */
    reaplicar: function () { mandarAlViento(); return estado; },
    diagnostico: function () {
      var st = montado;
      return {
        montado: !!st,
        redArrancada: redArrancada,
        socket: !!socketEnganchado,
        socketVivo: !!(socketEnganchado && socketEnganchado.connected),
        servidor: base(),
        ultimoFallo: ultimoFallo,
        segundosDesdeRespuesta: ultimaRespuesta
          ? Math.round((Date.now() - ultimaRespuesta) / 1000) : null,
        viento: (window.GFViento && window.GFViento.estado)
          ? window.GFViento.estado() : null,
        estado: estado,
        fuerzaLluvia: st ? Number(st.fuerzaLluvia.toFixed(2)) : null,
        fuerzaSol: st ? Number((st.fuerzaSol || 0).toFixed(2)) : null,
        fuerzaNieve: st ? Number(st.fuerzaNieve.toFixed(2)) : null,
        piezas: st ? { gotas: st.gotas.length, copos: st.copos.length,
                       salpicas: st.salpicas.length, posas: st.posas.length,
                       charcos: st.charcos.length, rayo: !!st.rayo } : null,
        texturasQueFaltan: st ? faltan(st.scene) : null,
        gotas: st ? st.gotas.length : 0,
        charcos: st ? st.charcos.filter(function (c) { return c.vivo; }).length : 0
      };
    },
    /** Pinta un tiempo concreto SIN tocar el servidor. Solo para mirarlo. */
    probar: function (que) {
      estado.activo = true;
      estado.lluvia = (que === 'lluvia' || que === 'tormenta');
      estado.viento = (que === 'viento' || que === 'tormenta' || que === 'nieve');
      estado.nieve  = (que === 'nieve');
      estado.soleado = (que === 'soleado');
      estado.truenos = (que === 'tormenta');
      mandarAlViento();
      return estado;
    },
    /** Cambia la estación SIN tocar el servidor. Solo para mirarla. */
    probarEstacion: function (e) {
      if (ESTACIONES[e]) estado.estacion = e;
      return estado.estacion;
    },
    _interno: {
      lienzo: lienzo, inclinacion: inclinacion, MARGEN: MARGEN,
      INCLINA_MIN: INCLINA_MIN, INCLINA_MAX: INCLINA_MAX,
      aplicar: aplicar, actualizar: actualizar, relampago: relampago,
      mandarAlViento: mandarAlViento, salpicar: salpicar, sacudir: sacudir,
      centella: centella, sitioDelRayo: sitioDelRayo, ESTACIONES: ESTACIONES,
      moverCharcos: moverCharcos, brotarCharco: brotarCharco,
      sueloLibre: sueloLibre, prenderArbol: prenderArbol,
      moverSol: moverSol, texturaRayo: texturaRayo,
      texturaHalo: texturaHalo, texturaMota: texturaMota,
      moverMotas: moverMotas, sembrarMota: sembrarMota, N_MOTAS: N_MOTAS,
      aMundo: aMundo, PLANOS_GOTA: PLANOS_GOTA,
      texturaResplandor: texturaResplandor,
      arrancarRed: arrancarRed, reintentarViento: reintentarViento,
      hay: hay, faltan: faltan,
      moverIncendio: moverIncendio, apagarIncendio: apagarIncendio,
      arbolesAlcanzables: arbolesAlcanzables, ARDE_MS: ARDE_MS,
      PROB_INCENDIO: PROB_INCENDIO, N_CHARCOS: N_CHARCOS,
      lienzoRect: lienzoRect, texturaBlanca: texturaBlanca,
      texturasBorde: texturasBorde, moverBorde: moverBorde,
      MULTIPLICAR: MULTIPLICAR,
      filtroEstacion: filtroEstacion, moverCopos: moverCopos,
      RAYO_SEPARA: RAYO_SEPARA
    }
  };

  /* La red arranca sola, sin esperar a ninguna escena. Con un respiro para que
     el resto de modulos (y `window.game`) esten en pie y `base()` acierte con
     el servidor. */
  if (typeof window !== 'undefined') setTimeout(arrancarRed, 1200);
})();
