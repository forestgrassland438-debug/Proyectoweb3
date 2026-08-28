/* ===========================================================================
 * FAUNA DE GAMESCENE
 *
 * QUÉ HACE
 *   Puebla el mapa con animales que van a lo suyo: zorros, una vaca, cerdos,
 *   un cocodrilo y serpientes paseando por el suelo, y palomas y pájaros que
 *   vuelan y se posan en árboles, postes y tejados.
 *
 * NO TOCA NADA DEL JUEGO
 *   Ningún animal tiene cuerpo de física: no colisionan, no empujan, no se les
 *   puede chocar y no interfieren con el jugador, los cultivos ni los árboles.
 *   Son decoración viva. Tampoco hablan con el servidor.
 *
 * ESQUIVAN EL ESCENARIO
 *   Los de tierra sí respetan las colisiones del mapa: usan el MISMO índice
 *   espacial que el jugador (scene._chocaConEscenario), así que no se meten
 *   dentro de las casas, las rocas ni los árboles. Miran un poco más allá del
 *   paso que van a dar y, si el camino está cortado, prueban a girar en
 *   abanico hasta encontrar hueco. Por eso bordean los obstáculos en vez de
 *   quedarse empotrados contra ellos.
 *
 * REPARTIDOS POR EL MAPA
 *   El mapa se divide en una rejilla y cada animal nace en una celda distinta,
 *   sobre suelo libre. Así no aparecen todos amontonados en el mismo sitio.
 *
 * PROFUNDIDAD
 *   En el suelo se ordenan por su Y, como el resto de sprites. Posados, van
 *   por delante de aquello donde se han posado (depth del soporte + 1);
 *   volando, por encima de todo.
 *
 * CÓMO SE ENGANCHA
 *   GameScene.preload():  window.GFAnimales && window.GFAnimales.precargar(this);
 *   GameScene.create():   window.GFAnimales && window.GFAnimales.montar(this);
 *   Se desmonta solo en el shutdown de la escena.
 *
 * API
 *   GFAnimales.precargar(scene)
 *   GFAnimales.montar(scene, opciones)   opciones: { elenco, debug }
 *   GFAnimales.desmontar(scene)
 *   GFAnimales.estado(scene)             para depurar
 * ======================================================================== */
(function () {
  'use strict';

  var RUTA = './Game/Sprites/animales/';
  var ESCALA = 2;                   // igual que el jugador y el perro
  /* Profundidad volando.
   *
   * TIENE QUE QUEDAR POR DEBAJO DE LA CAPA DE NOCHE, que gf-ciclo-dia.js pone
   * a 9000. Estaba en 20000 y por eso de noche los pajaros volaban por encima
   * del cuadro oscuro: se veian a plena luz recortados sobre el mundo oscuro.
   *
   * 8000 esta por encima de TODO el mundo (el y-sort llega como mucho a la
   * altura del mapa, 5008, y el borde del mapa usa 1000) y por debajo de la
   * noche, del chat (99998) y de los carteles de los NPC (90000). Si algun dia
   * se cambia PROFUNDIDAD en gf-ciclo-dia.js, hay que mover esto con ella.
   */
  var PROF_VUELO = 8000;

  /* Fotogramas de cada especie. La clave de textura lleva prefijo gfa_ para no
     pisar ninguna de las miles que ya carga el juego. */
  var POSES = {
    tierra:    { quieto: 2, camina: 4, come: 2 },
    serpiente: { quieto: 2, repta: 4 },
    ave:       { quieto: 2, camina: 2, come: 2, vuela: 4 }
  };

  var RITMO = {
    quieto: 2, camina: 8, come: 5, repta: 9, vuela: 12
  };

  /* Ficha de cada especie.
       vel     px/s andando
       huye    a qué distancia del jugador sale por patas (0 = ni se inmuta)
       huella  [ancho, alto] de la caja que se comprueba contra las colisiones,
               a los pies del animal y ya en píxeles de mundo (con la escala)
       ritmo   multiplicador del frameRate, para que la vaca no patalee     */
  var FICHA = {
    zorro:            { grupo: 'tierra',    vel: 38, corre: 92, huye: 190, huella: [22, 10], ritmo: 1.15 },
    zorra:            { grupo: 'tierra',    vel: 40, corre: 96, huye: 200, huella: [22, 10], ritmo: 1.2 },
    vaca:             { grupo: 'tierra',    vel: 13, corre: 30, huye: 0,   huella: [34, 14], ritmo: 0.55 },
    cerdo:            { grupo: 'tierra',    vel: 19, corre: 44, huye: 105, huella: [26, 12], ritmo: 0.85 },
    cocodrilo:        { grupo: 'tierra',    vel: 11, corre: 38, huye: 0,   huella: [38, 10], ritmo: 0.6 },
    serpiente_verde:  { grupo: 'serpiente', vel: 26, corre: 60, huye: 150, huella: [18, 8],  ritmo: 1.0 },
    serpiente_coral:  { grupo: 'serpiente', vel: 24, corre: 56, huye: 150, huella: [18, 8],  ritmo: 1.0 },
    serpiente_vibora: { grupo: 'serpiente', vel: 22, corre: 52, huye: 150, huella: [18, 8],  ritmo: 0.95 },
    paloma:           { grupo: 'ave',       vel: 24, huye: 120, posado: 78, huella: [14, 8], ritmo: 1.0 },
    pajaro:           { grupo: 'ave',       vel: 28, huye: 110, posado: 66, huella: [12, 7], ritmo: 1.15 }
  };

  var ELENCO = [
    ['zorro', 3], ['zorra', 1], ['vaca', 1], ['cerdo', 2], ['cocodrilo', 1],
    ['serpiente_verde', 2], ['serpiente_coral', 1], ['serpiente_vibora', 2],
    ['paloma', 4], ['pajaro', 5]
  ];

  // ------------------------------------------------------------- ajustes IA
  var VEL_VUELO = 105;              // px/s volando
  var RADIO_VUELO = 700;            // no cruzan el mapa de punta a punta
  var MIRA = 26;                    // cuánto mira por delante del paso
  var ESPERA_TIERRA = [3500, 11000];
  var ESPERA_POSADO = [4500, 12000];
  var ESPERA_SUELO_AVE = [3000, 7000];
  var CERCA_CAMARA = 1500;          // más lejos, se actualiza a menos ritmo
  var SEPARACION_NACIMIENTO = 700;  // px mínimos entre dos animales al nacer

  /* Abanico de giros que se prueban cuando el camino de frente está cortado.
     Primero desvíos pequeños (bordear), y solo si nada sirve, la vuelta
     entera. En radianes. */
  var GIROS = [0, 0.38, -0.38, 0.8, -0.8, 1.35, -1.35, 2.0, -2.0, Math.PI];

  function log(scene) {
    if (!window.GF_ANIMALES_DEBUG) return;
    var a = Array.prototype.slice.call(arguments, 1);
    a.unshift('[fauna]');
    console.log.apply(console, a);
  }

  function az(a, b) { return a + Math.random() * (b - a); }
  function elegir(l) { return l[Math.floor(Math.random() * l.length)]; }

  // ============================================================== TEXTURAS
  function fotogramas(especie) {
    var f = FICHA[especie];
    if (!f) return [];
    var poses = POSES[f.grupo];
    var out = [];
    for (var p in poses) {
      for (var i = 1; i <= poses[p]; i++) {
        out.push({ clave: 'gfa_' + especie + '_' + p + '_' + i,
                   archivo: especie + '_' + p + '_' + i + '.png',
                   pose: p });
      }
    }
    return out;
  }

  function precargar(scene) {
    if (!scene || !scene.load) return 0;
    var n = 0;
    for (var e in FICHA) {
      var fs = fotogramas(e);
      for (var i = 0; i < fs.length; i++) {
        scene.load.image(fs[i].clave, RUTA + fs[i].archivo);
        n++;
      }
    }
    log(scene, 'precargadas', n, 'texturas');
    return n;
  }

  function hayTexturas(scene, especie) {
    var fs = fotogramas(especie);
    for (var i = 0; i < fs.length; i++) {
      if (!scene.textures.exists(fs[i].clave)) return false;
    }
    return true;
  }

  function crearAnimaciones(scene, especie) {
    var f = FICHA[especie];
    var poses = POSES[f.grupo];
    for (var p in poses) {
      var clave = 'gfa_' + especie + '_' + p;
      if (scene.anims.exists(clave)) continue;
      var frames = [];
      for (var i = 1; i <= poses[p]; i++) {
        frames.push({ key: 'gfa_' + especie + '_' + p + '_' + i });
      }
      // El "quieto" de dos fotogramas queda mejor con una pausa: se repite el
      // primero para que el bicho no parpadee sin parar.
      if (p === 'quieto') frames.push({ key: 'gfa_' + especie + '_quieto_1' });
      scene.anims.create({
        key: clave, frames: frames,
        frameRate: Math.max(1, RITMO[p] * (f.ritmo || 1)), repeat: -1
      });
    }
  }

  // ============================================================== ESCENARIO
  function limites(scene) {
    var m = scene.map;
    return { w: (m && m.widthInPixels) || 5008,
             h: (m && m.heightInPixels) || 5008 };
  }

  /** ¿Cabe el animal aquí sin meterse en una colisión del mapa? */
  function libre(scene, a, x, y) {
    var lim = limites(scene);
    var borde = 40;
    if (x < borde || y < borde || x > lim.w - borde || y > lim.h - borde) {
      return false;
    }
    if (typeof scene._chocaConEscenario !== 'function') return true;
    // La caja va a los PIES: el sprite se dibuja con origen (0.5, 1), así que
    // (x, y) es donde el animal pisa. Comprobar el cuerpo entero haría que no
    // pudiera pasar por debajo de la copa de ningún árbol.
    return !scene._chocaConEscenario(x - a.hw / 2, y - a.hh, a.hw, a.hh);
  }

  /**
   * ¿Puede seguir en esta dirección?
   *
   * Mira MIRA píxeles más allá del paso que va a dar. Comprobando solo el paso
   * siguiente, el animal llegaba a rozar el obstáculo y giraba pegado a él,
   * dando tirones; mirando antes, la curva sale limpia.
   */
  function caminoLibre(scene, a, rumbo, paso) {
    var d = paso + MIRA;
    return libre(scene, a, a.spr.x + Math.cos(rumbo) * d,
                          a.spr.y + Math.sin(rumbo) * d);
  }

  /** Primer rumbo despejado del abanico, o null si está todo cerrado. */
  function rumboLibre(scene, a, deseado, paso) {
    for (var i = 0; i < GIROS.length; i++) {
      var r = deseado + GIROS[i];
      if (caminoLibre(scene, a, r, paso)) return r;
    }
    return null;
  }

  /** Sitios donde puede posarse un ave: árboles, postes y tejados. */
  function posaderos(scene) {
    var out = [];
    var tocones = scene.treeStumps || {};

    function meter(clave, spr, alto, anchoUtil) {
      if (!spr || spr.active === false || typeof spr.x !== 'number') return;
      var b;
      try { b = spr.getBounds(); } catch (e) { return; }
      if (!b || !isFinite(b.centerX)) return;
      // Un poco al azar a lo ancho, para que no se posen siempre en el
      // mismísimo píxel central del tejado.
      var jitter = anchoUtil ? (Math.random() - 0.5) * b.width * anchoUtil : 0;
      out.push({
        clave: clave, spr: spr,
        x: b.centerX + jitter,
        y: b.top + b.height * alto,
        base: (typeof spr.depth === 'number') ? spr.depth : b.bottom
      });
    }

    var i;
    for (i = 1; i <= 18; i++) {
      if (!tocones['sprite_arbolx' + i]) {
        meter('sprite_arbolx' + i, scene['sprite_arbolx' + i], 0.26, 0.3);
      }
    }
    for (i = 1; i <= 45; i++) {
      if (!tocones['sprite_pinos' + i]) {
        meter('sprite_pinos' + i, scene['sprite_pinos' + i], 0.22, 0.2);
      }
    }
    for (i = 1; i <= 20; i++) {
      meter('post_' + i, scene['post_' + i], 0.06, 0);
    }
    var casas = ['sprite_jj', 'sprite_h', 'sprite_p', 'sprite_casa_npc1xc',
                 'sprite_casa_npc2xc', 'sprite_casa_npc3xc', 'sprite_molino',
                 'sprite_cabaña', 'sprite_casa_comida', 'sprite_casa_comida2'];
    for (i = 0; i < casas.length; i++) {
      meter(casas[i], scene[casas[i]], 0.10, 0.55);
    }
    return out;
  }

  /** ¿Sigue en pie el sitio donde está posada? (se lo pueden talar) */
  function sitioEnPie(scene, clave) {
    if (!clave) return false;
    if (scene.treeStumps && scene.treeStumps[clave]) return false;
    var spr = scene[clave];
    return !!(spr && spr.active !== false);
  }

  // ============================================================ NACIMIENTO
  /**
   * Reparte n puntos por el mapa, uno por celda de una rejilla, sobre suelo
   * libre. Sin la rejilla, el azar los junta: salían seis animales en la misma
   * esquina y el resto del mapa vacío.
   */
  function repartir(scene, plantilla, n, yaPuestos) {
    var lim = limites(scene);
    var lado = Math.max(2, Math.ceil(Math.sqrt(n * 2)));
    var celdas = [];
    for (var f = 0; f < lado; f++) {
      for (var c = 0; c < lado; c++) celdas.push([c, f]);
    }
    // barajar
    for (var i = celdas.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = celdas[i]; celdas[i] = celdas[j]; celdas[j] = t;
    }

    var puntos = [];
    var anchoC = lim.w / lado, altoC = lim.h / lado;
    var jugador = scene.player;

    for (var k = 0; k < celdas.length && puntos.length < n; k++) {
      var cx = celdas[k][0] * anchoC, cy = celdas[k][1] * altoC;
      for (var intento = 0; intento < 60; intento++) {
        var x = cx + az(anchoC * 0.1, anchoC * 0.9);
        var y = cy + az(altoC * 0.1, altoC * 0.9);
        if (!libre(scene, plantilla, x, y)) continue;
        if (jugador && Math.hypot(x - jugador.x, y - jugador.y) < 500) continue;
        var pegado = false;
        for (var q = 0; q < yaPuestos.length; q++) {
          if (Math.hypot(x - yaPuestos[q].x, y - yaPuestos[q].y) <
              SEPARACION_NACIMIENTO) { pegado = true; break; }
        }
        if (pegado) continue;
        puntos.push({ x: x, y: y });
        yaPuestos.push({ x: x, y: y });
        break;
      }
    }
    return puntos;
  }

  // ================================================================ ANIMAL
  function nuevo(st, especie, punto, sitio) {
    var scene = st.scene;
    var f = FICHA[especie];
    var a = {
      especie: especie, grupo: f.grupo, ficha: f,
      hw: f.huella[0], hh: f.huella[1],
      fase: 'quieto', rumbo: az(0, Math.PI * 2), hasta: 0,
      destino: null, alFinal: null, soporte: null, _anim: null,
      lento: 0
    };
    var spr = scene.add.sprite(punto.x, punto.y,
                               'gfa_' + especie + '_quieto_1');
    spr.setOrigin(0.5, 1);
    spr.setScale(ESCALA);
    spr.setDepth(punto.y);
    // Sin cuerpo de física a propósito: así no puede colisionar con nada.
    a.spr = spr;

    if (f.grupo === 'ave' && sitio) {
      a.soporte = sitio.clave;
      posarse(st, a, sitio);
    } else if (f.grupo === 'ave') {
      // Ave sin sitio donde posarse: empieza andando por el suelo. Ojo, no
      // vale llamar a decidirTierra: en las aves `rumbo` es -1 o +1 (a qué
      // lado dan los pasitos), no un ángulo, y con un ángulo en radianes
      // andarían al doble o al triple de velocidad.
      a.fase = 'camina';
      a.rumbo = Math.random() < 0.5 ? -1 : 1;
      anim(a, 'camina');
      a.hasta = scene.time.now + az(ESPERA_SUELO_AVE[0], ESPERA_SUELO_AVE[1]);
    } else {
      decidirTierra(st, a);
    }
    return a;
  }

  function anim(a, pose) {
    if (a._anim === pose) return;
    a._anim = pose;
    if (a.spr && a.spr.anims) a.spr.play('gfa_' + a.especie + '_' + pose, true);
  }

  /** La pose de andar se llama distinto en las serpientes. */
  function poseAndar(a) { return a.grupo === 'serpiente' ? 'repta' : 'camina'; }

  /** ¿Esta especie sabe comer? Las serpientes no tienen esa animación. */
  function sabeComer(a) { return POSES[a.grupo].come > 0; }

  // ------------------------------------------------------------ los de tierra
  function decidirTierra(st, a) {
    var r = Math.random();
    if (r < 0.55) {
      a.fase = 'pasea';
      a.rumbo = az(0, Math.PI * 2);
      anim(a, poseAndar(a));
    } else if (r < 0.80 && sabeComer(a)) {
      a.fase = 'come';
      anim(a, 'come');
    } else {
      a.fase = 'quieto';
      anim(a, 'quieto');
    }
    a.hasta = st.scene.time.now + az(ESPERA_TIERRA[0], ESPERA_TIERRA[1]);
  }

  function huirDe(st, a, px, py) {
    a.fase = 'huye';
    a.rumbo = Math.atan2(a.spr.y - py, a.spr.x - px);
    anim(a, poseAndar(a));
    a.hasta = st.scene.time.now + az(1600, 3200);
  }

  var PASO_MAX = 14;                // px por comprobación de colisión

  /**
   * Mueve al animal, troceando el avance.
   *
   * POR QUÉ SE TROCEA: la comprobación mira el punto de DESTINO, no el camino.
   * Con un tirón del navegador (una pestaña en segundo plano, una carga) el
   * delta se dispara y un animal corriendo daba un salto de casi 40 px de una
   * vez; si justo había una pared fina en medio, aparecía al otro lado. Con
   * trozos de 14 px como mucho no puede colarse por nada más ancho que eso, y
   * la velocidad media no cambia.
   */
  function moverTierra(st, a, dt, corriendo) {
    var vel = corriendo ? (a.ficha.corre || a.ficha.vel * 2) : a.ficha.vel;
    var total = vel * dt;
    if (total <= 0) return;
    var trozos = Math.max(1, Math.ceil(total / PASO_MAX));
    for (var k = 0; k < trozos; k++) {
      if (!unPaso(st, a, total / trozos, corriendo)) return;
    }
  }

  /** Un tramo suelto. Devuelve false si se ha parado y no hay que seguir. */
  function unPaso(st, a, paso, corriendo) {
    var scene = st.scene;
    var elegido = rumboLibre(scene, a, a.rumbo, paso);
    if (elegido === null) {
      // Todo cerrado: se para un momento y se da la vuelta. Antes de esto se
      // quedaba temblando contra la pared.
      a.rumbo += Math.PI + az(-0.5, 0.5);
      a.fase = 'quieto';
      anim(a, 'quieto');
      a.hasta = scene.time.now + az(400, 900);
      return false;
    }
    a.rumbo = elegido;

    var nx = a.spr.x + Math.cos(a.rumbo) * paso;
    var ny = a.spr.y + Math.sin(a.rumbo) * paso;
    // Segunda comprobación con el paso REAL: `caminoLibre` mira por delante,
    // pero el sitio donde de verdad se va a poner también tiene que estar
    // libre. Sin esto podía colarse en una esquina estrecha.
    if (!libre(scene, a, nx, ny)) {
      a.rumbo += Math.PI * 0.5;
      return false;
    }
    a.spr.setPosition(nx, ny);
    a.spr.setFlipX(Math.cos(a.rumbo) < 0);
    a.spr.setDepth(ny);
    return true;
  }

  function actualizarTierra(st, a, ahora, dt) {
    var scene = st.scene;
    var p = scene.player;

    if (a.ficha.huye > 0 && p && a.fase !== 'huye') {
      var d = Math.hypot(a.spr.x - p.x, a.spr.y - p.y);
      if (d < a.ficha.huye) { huirDe(st, a, p.x, p.y); }
    }

    if (a.fase === 'pasea') {
      moverTierra(st, a, dt, false);
      // pequeño vaivén: sin esto andan en línea recta como un tren
      a.rumbo += az(-0.5, 0.5) * dt;
    } else if (a.fase === 'huye') {
      moverTierra(st, a, dt, true);
    }

    if (ahora >= a.hasta) decidirTierra(st, a);
  }

  // ----------------------------------------------------------------- las aves
  /**
   * Profundidad de un ave posada.
   *
   * Los sprites del mapa se dibujan con depth = obj.y, que con origen (0,1) es
   * su BASE. Si al ave se le pone la Y del sitio donde se posa (la copa, el
   * tejado) queda por DETRÁS del árbol o de la casa. Va delante de su soporte
   * y sigue quedando detrás de lo que esté más abajo en pantalla.
   */
  function profundidadPosado(scene, a, sitio) {
    if (sitio && typeof sitio.base === 'number') return sitio.base + 1;
    var spr = a.soporte ? scene[a.soporte] : null;
    if (spr && typeof spr.depth === 'number') return spr.depth + 1;
    return a.spr.y;
  }

  function posarse(st, a, sitio) {
    a.fase = 'posado';
    a.destino = null;
    a.soporte = sitio ? sitio.clave : a.soporte;
    if (sitio) a.spr.setPosition(sitio.x, sitio.y);
    a.spr.setDepth(profundidadPosado(st.scene, a, sitio));
    anim(a, 'quieto');
    a.hasta = st.scene.time.now + az(ESPERA_POSADO[0], ESPERA_POSADO[1]);
  }

  function volarA(st, a, destino, alFinal, soporte) {
    a.fase = 'volando';
    a.destino = destino;
    a.alFinal = alFinal || 'posado';
    a.soporte = soporte || null;
    a.spr.setDepth(PROF_VUELO);
    anim(a, 'vuela');
  }

  function lejosDe(sitios, px, py, min) {
    if (px === null) return sitios;
    var ok = [];
    for (var i = 0; i < sitios.length; i++) {
      if (Math.hypot(sitios[i].x - px, sitios[i].y - py) > min) ok.push(sitios[i]);
    }
    return ok.length ? ok : sitios;
  }

  function sueloCerca(st, a, desde, radio) {
    var scene = st.scene;
    for (var i = 0; i < 25; i++) {
      var ang = az(0, Math.PI * 2), r = az(radio * 0.3, radio);
      var x = desde.x + Math.cos(ang) * r;
      var y = desde.y + Math.sin(ang) * r;
      if (libre(scene, a, x, y)) return { x: x, y: y };
    }
    return null;
  }

  function decidirAve(st, a) {
    var scene = st.scene;
    var p = scene.player;
    var sitios = posaderos(scene);
    var r = Math.random();

    if (!sitios.length) {
      // Mapa sin árboles, postes ni casas: en vez de quedarse clavada en el
      // aire, el ave se queda haciendo vida de suelo.
      var suelo = sueloCerca(st, a, a.spr, 200);
      if (suelo) {
        volarA(st, a, suelo, (Math.random() < 0.5 && sabeComer(a)) ? 'come' : 'camina', null);
      } else {
        a.hasta = scene.time.now + 2000;
      }
      return;
    }
    if (r < 0.50 || !p) {
      var cand = lejosDe(sitios, p ? p.x : null, p ? p.y : null,
                         a.ficha.posado * 1.6);
      // Solo posaderos de la zona. Eligiendo entre TODOS los del mapa, un
      // vuelo medio cruzaba 1500 px: a 105 px/s son 14 segundos volando, más
      // tiempo del que se pasan posadas. Parecían aviones de línea.
      var cerca = cand.filter(function (q) {
        return Math.hypot(q.x - a.spr.x, q.y - a.spr.y) < RADIO_VUELO;
      });
      var s2 = elegir(cerca.length ? cerca : cand);
      volarA(st, a, { x: s2.x, y: s2.y }, 'posado', s2.clave);
      return;
    }
    // baja al suelo, a picotear o a dar unos pasos
    var punto = sueloCerca(st, a, a.spr, 240);
    if (!punto) { a.hasta = scene.time.now + 1500; return; }
    volarA(st, a, punto, (r < 0.78 && sabeComer(a)) ? 'come' : 'camina', null);
  }

  function huirAve(st, a) {
    var scene = st.scene;
    var p = scene.player;
    var sitios = posaderos(scene);
    if (!sitios.length) {
      // sin sitios donde posarse, al menos se aleja volando
      var ang = p ? Math.atan2(a.spr.y - p.y, a.spr.x - p.x) : az(0, 6.28);
      volarA(st, a, { x: a.spr.x + Math.cos(ang) * 400,
                      y: a.spr.y + Math.sin(ang) * 400 }, 'camina', null);
      return;
    }
    var mejor = null, mejorD = -1;
    for (var i = 0; i < sitios.length; i++) {
      if (sitios[i].clave === a.soporte) continue;
      // huyendo puede irse más lejos, pero tampoco al otro extremo del mapa
      if (Math.hypot(sitios[i].x - a.spr.x, sitios[i].y - a.spr.y) >
          RADIO_VUELO * 2) continue;
      var d = p ? Math.hypot(sitios[i].x - p.x, sitios[i].y - p.y)
                : Math.hypot(sitios[i].x - a.spr.x, sitios[i].y - a.spr.y);
      // el más lejano del jugador, pero sin cruzar medio mapa
      var castigo = Math.hypot(sitios[i].x - a.spr.x, sitios[i].y - a.spr.y) * 0.35;
      if (d - castigo > mejorD) { mejorD = d - castigo; mejor = sitios[i]; }
    }
    if (!mejor) mejor = sitios[0];
    volarA(st, a, { x: mejor.x, y: mejor.y }, 'posado', mejor.clave);
  }

  function actualizarAve(st, a, ahora, dt) {
    var scene = st.scene;
    var spr = a.spr;
    var p = scene.player;

    if (a.fase === 'volando') {
      var dx = a.destino.x - spr.x, dy = a.destino.y - spr.y;
      var d = Math.hypot(dx, dy);
      var paso = VEL_VUELO * dt;
      /* Si el paso se pasa de largo, se aterriza YA.
         EL FALLO QUE ARREGLA: lejos de la cámara los animales se actualizan a
         5 Hz, y con dt de 0,2 s el paso pasa de 20 px. Como el aterrizaje solo
         valía a menos de 4 px del destino, el ave se pasaba de largo, daba
         media vuelta, se volvía a pasar... y se quedaba orbitando el árbol
         para siempre. En la simulación de 200 s salía volando el 94% del
         tiempo y casi no se posaba ni bajaba a picotear. */
      if (d < 4 || paso >= d) {
        spr.setPosition(a.destino.x, a.destino.y);
        if (a.alFinal === 'posado') {
          posarse(st, a, { clave: a.soporte, x: a.destino.x, y: a.destino.y,
                           base: null });
        } else {
          a.fase = a.alFinal;
          a.soporte = null;
          spr.setPosition(a.destino.x, a.destino.y);
          spr.setDepth(a.destino.y);
          anim(a, a.alFinal === 'come' ? 'come' : 'camina');
          a.hasta = ahora + az(ESPERA_SUELO_AVE[0], ESPERA_SUELO_AVE[1]);
          a.rumbo = Math.random() < 0.5 ? -1 : 1;
        }
        return;
      }
      spr.x += (dx / d) * paso;
      spr.y += (dy / d) * paso;
      spr.setFlipX(dx < 0);
      return;
    }

    // ---- posada o en el suelo: ¿se acerca el jugador? ----
    if (p) {
      var dist = Math.hypot(spr.x - p.x, spr.y - p.y);
      var limite = (a.fase === 'posado') ? a.ficha.posado : a.ficha.huye;
      if (dist < limite) { huirAve(st, a); return; }
    }

    // ---- ¿le han talado el árbol donde estaba? ----
    if (a.fase === 'posado' && a.soporte && !sitioEnPie(scene, a.soporte)) {
      log(scene, a.especie, 'se queda sin', a.soporte);
      huirAve(st, a);
      return;
    }

    if (a.fase === 'camina') {
      var nx = spr.x + a.rumbo * a.ficha.vel * dt;
      if (libre(scene, a, nx, spr.y)) {
        spr.x = nx;
      } else {
        a.rumbo *= -1;
      }
      spr.setFlipX(a.rumbo < 0);
      spr.setDepth(spr.y);
      if (Math.random() < 0.012) a.rumbo *= -1;
    }

    if (ahora >= a.hasta) decidirAve(st, a);
  }

  // =============================================================== BUCLE
  function actualizar(st, ahora, delta) {
    var scene = st.scene;
    // sys.isActive es una FUNCION en Phaser, no una propiedad: compararla con
    // false no comprobaba nada.
    if (!scene || !scene.sys) return;
    if (typeof scene.sys.isActive === 'function' && !scene.sys.isActive()) return;

    /* El índice espacial de colisiones lo reconstruye GameScene en su update.
       Este listener se dispara ANTES que Scene.update(), así que en el primer
       frame el índice todavía no existe. Pedirlo aquí es barato (compara dos
       longitudes) y evita que los animales atraviesen paredes ese frame. */
    if (typeof scene._asegurarIndiceColisiones === 'function') {
      try { scene._asegurarIndiceColisiones(); } catch (e) { /* da igual */ }
    }

    var dt = Math.min(delta, 100) / 1000;   // un tirón no los teletransporta
    var cam = scene.cameras && scene.cameras.main;
    var cx = cam ? cam.midPoint.x : 0, cy = cam ? cam.midPoint.y : 0;

    for (var i = 0; i < st.animales.length; i++) {
      var a = st.animales[i];
      if (!a.spr || !a.spr.active) continue;

      /* Los que están lejos de la cámara se actualizan a 5 Hz en vez de a 60.
         Siguen vivos y moviéndose, pero no se paga el coste de comprobar
         colisiones 60 veces por segundo por cada animal del mapa. */
      var lejos = cam && Math.hypot(a.spr.x - cx, a.spr.y - cy) > CERCA_CAMARA;
      if (lejos) {
        a.lento += delta;
        if (a.lento < 200) continue;
        dt = Math.min(a.lento, 400) / 1000;
        a.lento = 0;
      } else {
        a.lento = 0;
        dt = Math.min(delta, 100) / 1000;
      }

      if (a.grupo === 'ave') actualizarAve(st, a, ahora, dt);
      else actualizarTierra(st, a, ahora, dt);
    }
  }

  // ============================================================== MONTAJE
  function montar(scene, opciones) {
    opciones = opciones || {};
    if (!scene || !scene.add || !scene.textures) return null;
    if (scene.__gfFauna) return scene.__gfFauna;      // ya montada

    var elenco = opciones.elenco || ELENCO;
    var st = { scene: scene, animales: [] };
    var puestos = [];
    var usados = {};

    for (var e = 0; e < elenco.length; e++) {
      var especie = elenco[e][0];
      var cuantos = elenco[e][1];
      var f = FICHA[especie];
      if (!f) { console.warn('[fauna] especie desconocida:', especie); continue; }
      if (!hayTexturas(scene, especie)) {
        console.warn('[fauna] faltan las texturas de ' + especie +
                     ': no se monta. Revisa GFAnimales.precargar() en el preload.');
        continue;
      }
      crearAnimaciones(scene, especie);

      if (f.grupo === 'ave') {
        var sitios = posaderos(scene);
        for (var k = 0; k < cuantos; k++) {
          var sitio = null;
          // se buscan posaderos separados entre sí, para no llenar un árbol
          for (var intento = 0; intento < 40 && sitios.length; intento++) {
            var cand = elegir(sitios);
            if (usados[cand.clave]) continue;
            var pegado = false;
            for (var q = 0; q < puestos.length; q++) {
              if (Math.hypot(cand.x - puestos[q].x, cand.y - puestos[q].y) <
                  SEPARACION_NACIMIENTO) { pegado = true; break; }
            }
            if (pegado) continue;
            sitio = cand; break;
          }
          if (!sitio && sitios.length) sitio = elegir(sitios);
          if (sitio) {
            usados[sitio.clave] = true;
            puestos.push({ x: sitio.x, y: sitio.y });
            st.animales.push(nuevo(st, especie, { x: sitio.x, y: sitio.y }, sitio));
          } else {
            // sin ningún sitio donde posarse, nace en el suelo como los demás
            var enSuelo = repartir(scene, { hw: f.huella[0], hh: f.huella[1] },
                                   1, puestos);
            if (enSuelo.length) {
              st.animales.push(nuevo(st, especie, enSuelo[0], null));
            }
          }
        }
      } else {
        var plantilla = { hw: f.huella[0], hh: f.huella[1] };
        var puntos = repartir(scene, plantilla, cuantos, puestos);
        for (var j = 0; j < puntos.length; j++) {
          st.animales.push(nuevo(st, especie, puntos[j], null));
        }
      }
    }

    st.onUpdate = function (t, d) { actualizar(st, t, d); };
    scene.events.on('update', st.onUpdate);
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);

    scene.__gfFauna = st;
    log(scene, 'montados', st.animales.length, 'animales');
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfFauna;
    if (!st) return;
    if (st.onUpdate) scene.events.off('update', st.onUpdate);
    if (st.onApagar) {
      scene.events.off('shutdown', st.onApagar);
      scene.events.off('destroy', st.onApagar);
    }
    for (var i = 0; i < st.animales.length; i++) {
      if (st.animales[i].spr) st.animales[i].spr.destroy();
    }
    st.animales.length = 0;
    scene.__gfFauna = null;
    log(scene, 'desmontada');
  }

  function estado(scene) {
    var st = scene && scene.__gfFauna;
    if (!st) return null;
    return st.animales.map(function (a) {
      return { especie: a.especie, fase: a.fase, soporte: a.soporte,
               x: Math.round(a.spr.x), y: Math.round(a.spr.y),
               depth: Math.round(a.spr.depth) };
    });
  }

  window.GFAnimales = {
    precargar: precargar,
    montar: montar,
    desmontar: desmontar,
    estado: estado,
    RUTA: RUTA,
    FICHA: FICHA,
    ELENCO: ELENCO,
    // se exponen para poder probarlos sin navegador
    _interno: {
      fotogramas: fotogramas, posaderos: posaderos, repartir: repartir,
      libre: libre, caminoLibre: caminoLibre, rumboLibre: rumboLibre,
      actualizarTierra: actualizarTierra, actualizarAve: actualizarAve,
      decidirTierra: decidirTierra, decidirAve: decidirAve,
      huirAve: huirAve, huirDe: huirDe, moverTierra: moverTierra,
      profundidadPosado: profundidadPosado, sitioEnPie: sitioEnPie,
      POSES: POSES
    }
  };
})();
