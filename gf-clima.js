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

  var SYNC_MS   = 3 * 60 * 1000;   // cada cuánto se pregunta el tiempo
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

  var TRUENO_CADA  = [9000, 26000]; // ms entre relámpagos
  var CENTELLA_CADA = [1800, 7000]; // ms entre centellas (mucho más seguidas)
  var RAYO_SEPARA  = 0.28;          // fracción del ancho que ha de moverse el rayo

  var estado = {
    activo: false, modo: 'auto',
    viento: false, vientoFuerza: 1,
    lluvia: false, lluviaFuerza: 1,
    nieve: false, nieveFuerza: 1,
    truenos: true, estacion: 'verano', cargado: false
  };
  var montado = null;
  var timerSync = null;
  var timerSocket = null;
  var pidiendo = null;

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
    estado.truenos      = !!d.truenos;
    if (ESTACIONES[d.estacion]) estado.estacion = d.estacion;
    estado.cargado      = true;
    mandarAlViento();
    log('tiempo:', estado.lluvia ? 'lluvia' : (estado.viento ? 'viento' : 'despejado'));
    return true;
  }

  function sincronizar() {
    if (pidiendo) return pidiendo;
    pidiendo = fetch(base().replace(/\/$/, '') + '/api/world/weather',
                     { credentials: 'omit', mode: 'cors', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) { pidiendo = null; aplicar(d); return estado; })
      .catch(function (e) {
        pidiendo = null;
        log('no se pudo consultar el tiempo:', e && e.message);
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
  function engancharSocket() {
    var s = window.globalSocket;
    if (!s || !s.on) return false;
    if (s.__gfClima) return true;
    s.__gfClima = true;
    s.on('worldWeather', function (d) {
      log('el servidor manda tiempo nuevo');
      aplicar(d);
    });
    // Al reconectar se pregunta: mientras estuvo caído pudo perderse un aviso.
    s.on('connect', function () { sincronizar(); });
    log('enganchado al socket');
    return true;
  }

  /** Le dice al viento lo que manda el servidor. */
  function mandarAlViento() {
    var V = window.GFViento;
    if (!V || !V.forzar) return;
    V.forzar(estado.activo && estado.viento, estado.vientoFuerza);
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
    return n;
  }

  function hayTexturas(scene) {
    /* Se miran las tres familias, no solo las gotas: si se anade la nieve al
       modulo pero se olvida el precargar, montar() seguiria adelante y el
       primer copo reventaria con "texture not found" a mitad de partida. */
    var familias = [GOTAS, COPOS, RAYOS];
    for (var f = 0; f < familias.length; f++) {
      for (var i = 0; i < familias[f].length; i++) {
        if (!scene.textures.exists('gfc_' + familias[f][i])) return false;
      }
    }
    return true;
  }

  // ------------------------------------------------------------------ gotas
  function nuevaGota(st) {
    var L = lienzo(st.scene.cameras.main);
    var s = st.scene.add.image(0, 0, 'gfc_' + elegir(GOTAS));
    // El scrollFactor va en el HIJO aunque viva dentro del contenedor: Phaser
    // lo lee del hijo al montar la matriz de cámara, no del padre.
    s.setScrollFactor(0);
    /* Escala moderada: a x2.6 sobre una textura de 18 px de alto salían
       rayas de casi 50 px que parecían arañazos en la pantalla, no lluvia. */
    s.setScale(az(0.9, 1.7));
    s.setAlpha(0);
    if (st.capa) st.capa.add(s);
    var g = { spr: s, vel: az(0.8, 1.35), x: 0, y: 0 };
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

  function moverGotas(st, dt, w, h, m) {
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
      g.spr.setAlpha(st.fuerzaLluvia * 0.5);
      if (g.y > h + 20) {
        // La salpicadura, dentro de lo que se VE: el lienzo sobra por los
        // bordes y una salpicadura en el sobrante no la ve nadie.
        salpicar(st, g.x, h - m - az(0, (h - m * 2) * 0.55));
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

  function moverCopos(st, dt, w, h, m) {
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
        posarNieve(st, c.x, h - m - az(0, (h - m * 2) * 0.5));
        reponerCopo(st, c, w, h, false);
      } else if (c.x < -80 || c.x > w + 80) {
        reponerCopo(st, c, w, h, false);
      }
    }
  }

  /** Marca un montoncito de nieve posada. Se deshace solo. */
  function posarNieve(st, x, y) {
    if (Math.random() > 0.3 * st.fuerzaNieve) return;
    for (var i = 0; i < st.posas.length; i++) {
      var p = st.posas[i];
      if (p.hasta > st.scene.time.now) continue;
      p.spr.setTexture('gfc_' + elegir(POSAS));
      p.spr.setPosition(x, y);
      p.hasta = st.scene.time.now + az(1400, 3200);
      p.nace = st.scene.time.now;
      return;
    }
  }

  function nuevaPosa(st) {
    var s = st.scene.add.image(0, 0, 'gfc_' + POSAS[0]);
    s.setScrollFactor(0);
    s.setAlpha(0);
    if (st.capa) st.capa.add(s);
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
  function nuevaSalpica(st) {
    var s = st.scene.add.image(0, 0, 'gfc_' + SALPICA[0]);
    s.setScrollFactor(0);
    s.setScale(2);
    s.setAlpha(0);
    // Después de las gotas: dentro de un contenedor manda el ORDEN de
    // inserción, no el depth.
    if (st.capa) st.capa.add(s);
    return { spr: s, hasta: 0, paso: 0 };
  }

  /** Marca una salpicadura libre para que empiece su animación aquí. */
  function salpicar(st, x, y) {
    if (Math.random() > 0.35 * st.fuerzaLluvia) return;
    for (var i = 0; i < st.salpicas.length; i++) {
      var sp = st.salpicas[i];
      if (sp.hasta > st.scene.time.now) continue;
      sp.spr.setPosition(x, y);
      sp.paso = 0;
      sp.hasta = st.scene.time.now + 240;
      return;
    }
  }

  function moverSalpicas(st, ahora) {
    for (var i = 0; i < st.salpicas.length; i++) {
      var sp = st.salpicas[i];
      var queda = sp.hasta - ahora;
      if (queda <= 0) { sp.spr.setAlpha(0); continue; }
      var paso = queda > 160 ? 1 : (queda > 80 ? 2 : 3);
      if (paso !== sp.paso) {
        sp.paso = paso;
        sp.spr.setTexture('gfc_salpica_' + paso);
      }
      sp.spr.setAlpha(Math.min(1, queda / 160) * 0.85 * st.fuerzaLluvia);
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
    if (queda <= 0) {
      for (var k = 0; k < st.bordes.length; k++) st.bordes[k].setAlpha(0);
      return;
    }
    var a = Math.min(1, queda / 160) * st.bordeAlfa;
    // grosor: la centella fuerte abre más el marco
    var g = 26 + 46 * st.bordeAlfa;
    var lados = [
      [w / 2, m + g / 2, w, g],              // arriba
      [w / 2, h - m - g / 2, w, g],          // abajo
      [m + g / 2, h / 2, g, h],              // izquierda
      [w - m - g / 2, h / 2, g, h]           // derecha
    ];
    for (var i = 0; i < st.bordes.length; i++) {
      var b = st.bordes[i], L = lados[i];
      b.setPosition(L[0], L[1]);
      if (b.setSize) b.setSize(L[2], L[3]);
      b.setAlpha(a);
    }
  }

  function relampago(st) {
    var scene = st.scene;
    var cam = scene.cameras.main;
    var ahora = scene.time.now;

    var L = lienzo(cam);
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

    /* La sacudida llega DESPUÉS del destello, como el trueno de verdad: la luz
       viaja más rápido que el sonido. Ese retardo es lo que lo hace creíble. */
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

    var i, j;
    if (nevando) {
      moverCopos(st, dt, w, h, L.m);
      moverPosas(st, ahora);
    } else {
      for (i = 0; i < st.copos.length; i++) st.copos[i].spr.setAlpha(0);
      for (i = 0; i < st.posas.length; i++) st.posas[i].spr.setAlpha(0);
    }

    if (!lloviendo) {
      for (i = 0; i < st.gotas.length; i++) st.gotas[i].spr.setAlpha(0);
      for (j = 0; j < st.salpicas.length; j++) st.salpicas[j].spr.setAlpha(0);
      st.rayo.setAlpha(0);
      st.fogonazo.setAlpha(0);
      for (i = 0; i < st.bordes.length; i++) st.bordes[i].setAlpha(0);
      return;
    }

    moverGotas(st, dt, w, h, L.m);
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
    if (st.rayoHasta && ahora >= st.rayoHasta) { st.rayo.setAlpha(0); st.rayoHasta = 0; }
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

  // ---------------------------------------------------------------- montaje
  function montar(scene, opciones) {
    opciones = opciones || {};
    if (!scene || !scene.add) return null;
    if (scene.__gfClima) return scene.__gfClima;
    if (!hayTexturas(scene)) {
      console.warn('[clima] faltan las texturas: no se monta. ' +
                   'Revisa GFClima.precargar() en el preload.');
      return null;
    }
    var cam = scene.cameras.main;
    var L = lienzo(cam);
    var st = {
      scene: scene, gotas: [], salpicas: [], copos: [], posas: [], bordes: [],
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

    var i;
    for (i = 0; i < N_GOTAS; i++)   st.gotas.push(nuevaGota(st));
    for (i = 0; i < N_COPOS; i++)   st.copos.push(nuevoCopo(st));
    for (i = 0; i < N_SALPICA; i++) st.salpicas.push(nuevaSalpica(st));
    for (i = 0; i < N_POSAS; i++)   st.posas.push(nuevaPosa(st));

    // Rayo, marco y fogonazo al final: van por encima de todo lo que cae.
    st.rayo = scene.add.image(0, 0, 'gfc_' + RAYOS[0]);
    st.rayo.setScrollFactor(0).setOrigin(0.5, 0).setAlpha(0);
    if (st.capa) st.capa.add(st.rayo); else st.rayo.setDepth(PROF_RAYO);

    // Marco blanco de los bordes, lo que enciende una centella.
    for (i = 0; i < 4; i++) {
      var b = lienzoRect(scene, 0, 0, 10, 10, 0xffffff);
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

    if (!opciones.sinRed) {
      sincronizar();
      // Red de seguridad, no la vía principal: la vía principal es el socket.
      if (!timerSync) timerSync = setInterval(sincronizar, SYNC_MS);
      if (!engancharSocket() && !timerSocket) {
        timerSocket = setInterval(function () {
          if (engancharSocket()) { clearInterval(timerSocket); timerSocket = null; }
        }, 1500);
      }
    }
    log('montado');
    return st;
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
    if (st.filtro)   st.filtro.destroy();
    if (st.cortina)  st.cortina.destroy();
    if (st.fogonazo) st.fogonazo.destroy();
    if (st.rayo)     st.rayo.destroy();
    if (st.capa && st.capa.destroy) st.capa.destroy();
    st.capa = null;
    st.gotas.length = 0; st.salpicas.length = 0;
    st.copos.length = 0; st.posas.length = 0; st.bordes.length = 0;
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
    /** Pinta un tiempo concreto SIN tocar el servidor. Solo para mirarlo. */
    probar: function (que) {
      estado.activo = true;
      estado.lluvia = (que === 'lluvia' || que === 'tormenta');
      estado.viento = (que === 'viento' || que === 'tormenta' || que === 'nieve');
      estado.nieve  = (que === 'nieve');
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
      lienzoRect: lienzoRect, texturaBlanca: texturaBlanca,
      MULTIPLICAR: MULTIPLICAR,
      filtroEstacion: filtroEstacion, moverCopos: moverCopos,
      RAYO_SEPARA: RAYO_SEPARA
    }
  };
})();
