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
    ave:       { quieto: 2, camina: 2, come: 2, vuela: 4 },
    // El topo es el único con vida bajo tierra: además de andar y comer tiene
    // que cavar, asomarse y moverse como un bulto de tierra.
    topo:      { quieto: 2, camina: 4, come: 2, cava: 3, asoma: 2,
                 monticulo: 2, hoyo: 3 },
    // La mariposa se ve DESDE ARRIBA, no de perfil: de perfil, a 14 px, es una
    // raya. Por eso no tiene poses de andar ni mira a un lado.
    mariposa:  { vuela: 4, posa: 2 }
  };

  /* Fotogramas que tiene UNA especie y no todo su grupo.
     La vaca y el cerdo son del grupo 'tierra' igual que el cocodrilo, pero
     solo este último ataca: si el `ataque` estuviera en el grupo, el módulo
     buscaría vaca_ataque_1.png y no montaría la vaca por texturas que faltan. */
  var POSES_EXTRA = {
    // Los zorros se tumban a descansar (con la cabeza levantada: no duermen).
    zorro: { ataque: 3, tumbado: 2 }, zorra: { ataque: 3, tumbado: 2 },
    cocodrilo: { ataque: 3 },
    serpiente_verde: { ataque: 3 }, serpiente_coral: { ataque: 3 },
    serpiente_vibora: { ataque: 3 },
    // Las aves se bañan en la fuente y duermen de noche en su rama.
    paloma: { bana: 3, duerme: 2 }, pajaro: { bana: 3, duerme: 2 }
  };

  /** Todas las poses de una especie: las de su grupo más las suyas propias. */
  function posesDe(especie) {
    var f = FICHA[especie];
    if (!f) return {};
    var out = {};
    var g = POSES[f.grupo] || {};
    for (var k in g) out[k] = g[k];
    var e = POSES_EXTRA[especie] || {};
    for (var k2 in e) out[k2] = e[k2];
    return out;
  }

  var RITMO = {
    quieto: 2, camina: 8, come: 5, repta: 9, vuela: 12,
    ataque: 9, cava: 8, asoma: 2, monticulo: 4, hoyo: 1,
    tumbado: 1.4, bana: 6, duerme: 0.8,
    posa: 1.6
  };

  /* Ficha de cada especie.
       vel     px/s andando
       huye    a qué distancia del jugador sale por patas (0 = ni se inmuta)
       huella  [ancho, alto] de la caja que se comprueba contra las colisiones,
               a los pies del animal y ya en píxeles de mundo (con la escala)
       ritmo   multiplicador del frameRate, para que la vaca no patalee     */
  /* Los campos de pelea (solo los agresivos los llevan):
       agresivo  se fija en un objetivo y va a por él
       vista     a qué distancia lo ve
       alcance   a qué distancia muerde
       dano      cuánto quita por mordisco
       cadencia  ms entre mordiscos
       vida      puntos de vida; a 0 el animal muere y vuelve a los 5 min    */
  var FICHA = {
    zorro:            { grupo: 'tierra',    vel: 38, corre: 92, huye: 190, huella: [22, 10], ritmo: 1.15,
                        agresivo: true, vista: 300, alcance: 44, dano: 5, cadencia: 1100, vida: 40 },
    zorra:            { grupo: 'tierra',    vel: 40, corre: 96, huye: 200, huella: [22, 10], ritmo: 1.2,
                        agresivo: true, vista: 310, alcance: 44, dano: 5, cadencia: 1000, vida: 38 },
    vaca:             { grupo: 'tierra',    vel: 13, corre: 30, huye: 0,   huella: [34, 14], ritmo: 0.55 },
    cerdo:            { grupo: 'tierra',    vel: 19, corre: 44, huye: 105, huella: [26, 12], ritmo: 0.85 },
    cocodrilo:        { grupo: 'tierra',    vel: 11, corre: 38, huye: 0,   huella: [38, 10], ritmo: 0.6,
                        agresivo: true, vista: 240, alcance: 56, dano: 9, cadencia: 1500, vida: 75 },
    serpiente_verde:  { grupo: 'serpiente', vel: 26, corre: 60, huye: 150, huella: [18, 8],  ritmo: 1.0,
                        agresivo: true, vista: 210, alcance: 36, dano: 4, cadencia: 900, vida: 26 },
    serpiente_coral:  { grupo: 'serpiente', vel: 24, corre: 56, huye: 150, huella: [18, 8],  ritmo: 1.0,
                        agresivo: true, vista: 210, alcance: 36, dano: 6, cadencia: 950, vida: 26 },
    serpiente_vibora: { grupo: 'serpiente', vel: 22, corre: 52, huye: 150, huella: [18, 8],  ritmo: 0.95,
                        agresivo: true, vista: 200, alcance: 36, dano: 5, cadencia: 1000, vida: 24 },
    topo:             { grupo: 'topo',      vel: 16, corre: 34, huye: 130, huella: [20, 9],  ritmo: 1.0 },
    mariposa_blanca:  { grupo: 'mariposa',  vel: 46, huye: 95, huella: [8, 5], ritmo: 1.6 },
    mariposa_monarca: { grupo: 'mariposa',  vel: 42, huye: 95, huella: [8, 5], ritmo: 1.45 },
    mariposa_azul:    { grupo: 'mariposa',  vel: 50, huye: 90, huella: [8, 5], ritmo: 1.7 },
    paloma:           { grupo: 'ave',       vel: 24, huye: 120, posado: 78, huella: [14, 8], ritmo: 1.0 },
    pajaro:           { grupo: 'ave',       vel: 28, huye: 110, posado: 66, huella: [12, 7], ritmo: 1.15 }
  };

  var ELENCO = [
    ['zorro', 3], ['zorra', 1], ['vaca', 2], ['cerdo', 2], ['cocodrilo', 2],
    ['serpiente_verde', 2], ['serpiente_coral', 1], ['serpiente_vibora', 2],
    ['topo', 7],
    ['mariposa_blanca', 5], ['mariposa_monarca', 4], ['mariposa_azul', 4],
    ['paloma', 4], ['pajaro', 5]
  ];

  // ------------------------------------------------------------- ajustes IA
  var VEL_VUELO = 105;              // px/s volando
  var RADIO_VUELO = 700;            // no cruzan el mapa de punta a punta
  var MIRA = 26;                    // cuánto mira por delante del paso
  /* CUÁNTO AGUANTAN QUIETOS.

     Estaban muy cortos y se notaba: un ave se posaba, contaba hasta siete y ya
     estaba volando otra vez. Con veinte bichos a la vez el mapa parecía un
     hormiguero y no un campo. Un animal de verdad se pasa la mayor parte del
     rato sin hacer nada; el movimiento vale porque es la excepción.

     Los números están multiplicados por dos y medio largo. */
  var ESPERA_TIERRA = [9000, 26000];
  var ESPERA_POSADO = [12000, 34000];
  var ESPERA_SUELO_AVE = [7000, 16000];
  var CERCA_CAMARA = 1500;          // más lejos, se actualiza a menos ritmo
  var SEPARACION_NACIMIENTO = 700;  // px mínimos entre dos animales al nacer

  // ── PELEA ────────────────────────────────────────────────────────────────
  var ALCANCE_MASCOTA  = 62;        // hasta dónde alcanza el perro
  var CADENCIA_MASCOTA = 850;       // ms entre zarpazos del perro
  var DANO_MASCOTA     = 12;        // lo que quita un zarpazo
  // Se me habia quedado fuera al reordenar las constantes y `retirarse` la
  // seguia usando: reventaba en cuanto la mascota malhería a algo.
  var RETIRADA_MS      = [5000, 9000];  // cuánto se aparta el animal malherido
  var RESPAWN_MS       = 5 * 60000; // 5 minutos, como pidió el jugador
  var BARRA_VISIBLE_MS = 6000;      // la barra se esconde si deja de pelear

  // ── TOPO ─────────────────────────────────────────────────────────────────
  /* El topo cavaba cada pocos segundos y el prado acababa lleno de agujeros.
     Ahora se pasa mucho más rato abajo y mucho más rato fuera: sale, come, da
     una vuelta larga y vuelve a desaparecer. */
  var TOPO_BAJO      = [16000, 42000];  // cuánto anda bajo tierra
  var TOPO_ASOMA     = [2200, 4200];    // cuánto se queda asomado
  var TOPO_CAVA_MS   = 900;             // lo que dura cavar
  var TOPO_FUERA     = [14000, 32000];  // cuánto se queda fuera
  var TOPO_VEL_BAJO  = 26;              // bajo tierra va más rápido
  var HOYO_DURA_MS   = 25000;           // cuánto se queda el agujero

  /* Abanico de giros que se prueban cuando el camino de frente está cortado.
     Primero desvíos pequeños (bordear), y solo si nada sirve, la vuelta
     entera. En radianes. */
  /* ─────────────────────────── EL SUEÑO ──────────────────────────────────

     De noche casi todos duermen, con su Zzz encima. Casi: PROB_DORMILON deja
     fuera a uno de cada cuatro, y ese se pasa la noche despierto. Sin esa
     excepción el mundo nocturno se queda absolutamente parado y se ve muerto,
     no dormido.

     Y se despiertan: acercarse lo bastante, o llevarse un golpe, levanta al
     animal. Un bicho que sigue roncando mientras le muerdes no se lee como
     dormido, se lee como roto.

     De día algunos echan una cabezada CORTA (SIESTA_MS, tres minutos como
     mucho, que es lo que pidió el jugador). */
  var ZZZ = ['zzz_1', 'zzz_2', 'zzz_3'];
  var PROB_DORMILON  = 0.76;            // cuántos duermen de noche
  var PROB_SIESTA    = 0.035;           // probabilidad de cabezada diurna
  var PROB_SIESTERO  = 0.4;             // y solo algunos la echan
  var SIESTA_MS      = [25000, 120000]; // nunca más de tres minutos

  /* POR QUÉ TAN POCO.

     Con 0,11 y cabezadas de hasta tres minutos, los animales se pasaban
     DORMIDOS el 40 % del día: las aves ya no se bañaban en la fuente y el zorro
     no llegaba a tumbarse. Una siesta que se ve casi la mitad del tiempo deja
     de ser una siesta y se convierte en el estado normal.

     Con 0,035 sobre el 40 % de los bichos sale en torno a un 4 % del día: se
     ve de vez en cuando, que es lo que se pedía, y no le come el sitio a lo
     demás que hacen. De noche es al revés y por eso PROB_DORMILON es 0,76. */
  var ZZZ_CICLO      = 2100;            // lo que tarda una Z en subir y borrarse
  var ZZZ_SUBE       = 20;              // px que sube
  var DESPERTAR_MIN  = 70;              // radio mínimo para despertar a alguien

  var GIROS = [0, 0.38, -0.38, 0.8, -0.8, 1.35, -1.35, 2.0, -2.0, Math.PI];

  function log(scene) {
    if (!window.GF_ANIMALES_DEBUG) return;
    var a = Array.prototype.slice.call(arguments, 1);
    a.unshift('[fauna]');
    console.log.apply(console, a);
  }

  // ── QUÉ DICE EL MÓDULO DE LA MASCOTA ─────────────────────────────────────
  // Se lee de window.GFMascota, que es quien habla con el servidor. Si ese
  // módulo no está cargado, todo se comporta como en modo pasivo y sin mascota:
  // los animales siguen siendo decoración y no pasa nada raro.
  function modoMascota() {
    return (window.GFMascota && window.GFMascota.modo) ? window.GFMascota.modo() : 'passive';
  }
  function mascotaViva() {
    return !!(window.GFMascota && window.GFMascota.viva && window.GFMascota.viva());
  }
  function jugadorFantasma() {
    var e = window.GFMascota && window.GFMascota.estado && window.GFMascota.estado();
    return !!(e && e.ghost);
  }

  function az(a, b) { return a + Math.random() * (b - a); }
  function elegir(l) { return l[Math.floor(Math.random() * l.length)]; }

  // ============================================================== TEXTURAS
  function fotogramas(especie) {
    var f = FICHA[especie];
    if (!f) return [];
    var poses = posesDe(especie);
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

  // Props que no son de ninguna especie.
  var PROPS = ['nido_1', 'nido_2', 'zzz_1', 'zzz_2', 'zzz_3'];

  function precargar(scene) {
    if (!scene || !scene.load) return 0;
    var n = 0;
    for (var q = 0; q < PROPS.length; q++) {
      scene.load.image('gfa_' + PROPS[q], RUTA + PROPS[q] + '.png');
      n++;
    }
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
    var poses = posesDe(especie);
    for (var p in poses) {
      // El hoyo son tres IMÁGENES distintas para elegir al azar, no una
      // animación de tres fotogramas: si se animara, el agujero parpadearía
      // cambiando de tamaño solo.
      if (p === 'hoyo') continue;
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
      /* La separación exigida se va RELAJANDO igual que con los posaderos.
         Con 31 animales en el mapa, exigir siempre 700 px hacía que los
         últimos no encontraran sitio y sencillamente NO NACÍAN: al montar sin
         árboles salían 6 aves de 9 en vez de las 9. */
      var exigencias = [SEPARACION_NACIMIENTO, SEPARACION_NACIMIENTO / 2,
                        SEPARACION_NACIMIENTO / 4, 60];
      var puesto = false;
      for (var ex = 0; ex < exigencias.length && !puesto; ex++) {
        for (var intento = 0; intento < 60; intento++) {
          var x = cx + az(anchoC * 0.1, anchoC * 0.9);
          var y = cy + az(altoC * 0.1, altoC * 0.9);
          if (!libre(scene, plantilla, x, y)) continue;
          if (jugador && Math.hypot(x - jugador.x, y - jugador.y) < 500) continue;
          var pegado = false;
          for (var q = 0; q < yaPuestos.length; q++) {
            if (Math.hypot(x - yaPuestos[q].x, y - yaPuestos[q].y) <
                exigencias[ex]) { pegado = true; break; }
          }
          if (pegado) continue;
          puntos.push({ x: x, y: y });
          yaPuestos.push({ x: x, y: y });
          puesto = true;
          break;
        }
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
      vida: f.vida || 30, vidaMax: f.vida || 30,
      muerto: false, revivirEn: 0, barraHasta: 0,
      /* Cada bicho con su carácter.

         `dormilon`: uno de cada cuatro se pasa la noche despierto.
         `miedo`: cuánto se asusta, de 0,25 (mansa, casi no huye) a 1,15. Antes
         todos huían a la misma distancia exacta y se veía coreografiado: te
         acercabas y salía disparada TODA la bandada a la vez. */
      dormilon: Math.random() < PROB_DORMILON,
      siestero: Math.random() < PROB_SIESTERO,
      miedo: Math.random() < 0.2 ? az(0.25, 0.45) : az(0.75, 1.15),
      durmiendo: false, despiertaEn: 0, zzz: null,
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

    // Las mariposas no llevan sombra: a 8 px de ancho, la elipse sería una
    // mancha más grande que el bicho.
    if (f.grupo !== 'mariposa') crearSombra(st, a);

    if (f.grupo === 'ave' && sitio) {
      a.soporte = sitio.clave;
      posarse(st, a, sitio);
    } else if (f.grupo === 'mariposa') {
      a.fase = 'revolotea';
      anim(a, 'vuela');
      a.hasta = scene.time.now + az(500, 2500);
    } else if (f.grupo === 'topo') {
      // Nace bajo tierra: al entrar al mapa solo se ven montículos moviéndose
      // y el jugador los descubre cuando se asoman.
      a.fase = 'bajo';
      anim(a, 'monticulo');
      a.hasta = scene.time.now + az(TOPO_BAJO[0], TOPO_BAJO[1]);
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
  function sabeComer(a) { return !!posesDe(a.especie).come; }

  /** El "hoyo" y el "montículo" son de una sola imagen: no se animan. */
  function poseEstatica(pose) { return pose === 'hoyo'; }

  // ------------------------------------------------------------ los de tierra
  /** ¿Esta especie sabe tumbarse? (los zorros sí, y solo a descansar) */
  function sabeTumbarse(a) { return !!posesDe(a.especie).tumbado; }

  function decidirTierra(st, a) {
    var r = Math.random();
    if (r < 0.55) {
      a.fase = 'pasea';
      a.rumbo = az(0, Math.PI * 2);
      anim(a, poseAndar(a));
    } else if (r < 0.73 && sabeTumbarse(a)) {
      // Descansa tumbado. NO duerme: el jugador lo pidió así, y por eso el
      // sprite tiene el ojo abierto y las orejas de pie.
      a.fase = 'tumbado';
      anim(a, 'tumbado');
      a.hasta = st.scene.time.now + az(6000, 16000);
      return;
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
    return moverTierraA(st, a, dt,
                        corriendo ? (a.ficha.corre || a.ficha.vel * 2) : a.ficha.vel);
  }

  /** Igual, pero con una velocidad concreta (el topo bajo tierra la cambia). */
  function moverTierraA(st, a, dt, vel) {
    var total = vel * dt;
    if (total <= 0) return;
    var trozos = Math.max(1, Math.ceil(total / PASO_MAX));
    for (var k = 0; k < trozos; k++) {
      if (!unPaso(st, a, total / trozos)) return;
    }
  }

  /** Un tramo suelto. Devuelve false si se ha parado y no hay que seguir.
      La velocidad ya viene metida en `paso`. */
  function unPaso(st, a, paso) {
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

    // Los agresivos primero: si tienen a quién morder, eso manda sobre pasear
    // y sobre huir. Devuelve false cuando no ve a nadie y sigue su vida.
    if (a.ficha.agresivo && actualizarAgresivo(st, a, ahora, dt)) return;

    if (a.ficha.huye > 0 && p && a.fase !== 'huye') {
      var d = Math.hypot(a.spr.x - p.x, a.spr.y - p.y);
      // × miedo: cada animal tiene el suyo, así no salen todos a la vez.
      if (d < a.ficha.huye * a.miedo) { huirDe(st, a, p.x, p.y); }
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
  /* El ave posada va en base + 2 y el nido en base + 1: así el ave se ve
     DENTRO del nido y no detrás. */
  function profundidadPosado(scene, a, sitio) {
    // +2 y no +1: el nido va en base+1, y el ave tiene que verse DENTRO de él.
    if (sitio && typeof sitio.base === 'number') return sitio.base + 2;
    var spr = a.soporte ? scene[a.soporte] : null;
    if (spr && typeof spr.depth === 'number') return spr.depth + 2;
    return a.spr.y;
  }


  /**
   * CUÁNTO SE HA MOVIDO LA RAMA DONDE ESTÁ POSADA EL AVE.
   *
   * EL FALLO QUE ARREGLA: con viento, gf-viento mece los árboles girándolos, y
   * el ave se quedaba clavada en el aire mientras su rama se iba de debajo. Se
   * veía justo lo que dijo el jugador: "el árbol se mueve y el animal no".
   *
   * El árbol gira sobre su PIE (origen 0,1), así que un punto que está `alto`
   * píxeles por encima del pie se desplaza en horizontal `alto · sen(giro)`.
   * El desplazamiento vertical es alto·(1−cos), que con los 0,035 rad que mece
   * el viento son seis centésimas de píxel: no se pone porque no se ve y
   * costaría lo mismo que el que sí se ve.
   *
   * Devuelve 0 para cualquier soporte que no gire — tejados, postes, piedras.
   */
  function balanceoSoporte(scene, clave, y) {
    if (!clave) return 0;
    var spr = scene[clave];
    if (!spr || typeof spr.rotation !== 'number' || !spr.rotation) return 0;
    var alto = spr.y - y;               // el origen (0,1) hace que spr.y sea el pie
    if (!(alto > 0)) return 0;
    return Math.sin(spr.rotation) * alto;
  }

  function posarse(st, a, sitio) {
    a.fase = 'posado';
    a.destino = null;
    a.soporte = sitio ? sitio.clave : a.soporte;
    if (sitio) a.spr.setPosition(sitio.x, sitio.y);
    // Dónde se posó de verdad: el balanceo del viento se suma a ESTO, no a la
    // posición de ahora, o el ave se iría acumulando desplazamiento y acabaría
    // en la otra punta del mapa.
    a.posX = a.spr.x;
    a.posY = a.spr.y;
    a.spr.setDepth(profundidadPosado(st.scene, a, sitio));
    anim(a, 'quieto');
    a.hasta = st.scene.time.now + az(ESPERA_POSADO[0], ESPERA_POSADO[1]);
  }

  /** Mece con su rama a todo lo que esté posado en un árbol: aves y nidos. */
  function mecerPosados(st) {
    var i;
    for (i = 0; i < st.animales.length; i++) {
      var a = st.animales[i];
      if (a.muerto || !a.soporte || a.posX == null) continue;
      if (a.fase !== 'posado' && !(a.durmiendo && a.grupo === 'ave')) continue;
      a.spr.x = a.posX + balanceoSoporte(st.scene, a.soporte, a.posY);
    }
    /* Y EL NIDO TAMBIÉN.

       Estaba clavado mientras el árbol se meneaba y el ave se movía con él: el
       ave se salía del nido con cada racha. El nido va atado a la misma rama,
       así que se mece igual. */
    for (var clave in st.nidos) {
      var n = st.nidos[clave];
      if (!n || !n.active || n.__x == null) continue;
      n.x = n.__x + balanceoSoporte(st.scene, n.__soporte || clave, n.__y);
    }
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

    a.pareja = null;

    /* DE NOCHE SE DUERME — pero de eso se encarga actualizarSuenio.

       Aqui habia un camino propio para las aves: se ponian en fase 'duerme' y
       ya. Al llegar el sueno general se quedaron DOS formas de dormir, y la
       vieja no traia nada de lo nuevo: ni Zzz, ni despertarse al acercarte, ni
       despertarse al amanecer. Un ave que cogia este camino se quedaba
       dormida para siempre y sin senal ninguna.

       Se deja solo el nido, que si es cosa del ave. */
    if (esDeNoche() && a.fase === 'posado' && a.soporte) {
      if (Math.random() < PROB_NIDO) construirNido(st, a);
      a.hasta = scene.time.now + az(2000, 5000);
      return;
    }

    // ── BAÑARSE EN LA FUENTE ───────────────────────────────────────────────
    if (r < 0.14) {
      var f = fuenteDe(scene);
      if (f && (!p || Math.hypot(f.x - p.x, f.y - p.y) > a.ficha.huye * 1.3)) {
        volarA(st, a, { x: f.x, y: f.y }, 'bana', null);
        return;
      }
    }

    // ── IRSE CON OTRA DE SU ESPECIE ────────────────────────────────────────
    if (r < 0.30 && sitios.length) {
      var otra = companiaDe(st, a);
      if (otra) {
        var juntas = elegir(lejosDe(sitios, p ? p.x : null, p ? p.y : null,
                                    a.ficha.posado * 1.6));
        irseJuntas(st, a, otra, juntas);
        return;
      }
    }

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
          anim(a, a.alFinal === 'come' ? 'come'
                 : a.alFinal === 'bana' ? 'bana' : 'camina');
          a.hasta = ahora + (a.alFinal === 'bana'
                             ? az(ESPERA_BANO[0], ESPERA_BANO[1])
                             : az(ESPERA_SUELO_AVE[0], ESPERA_SUELO_AVE[1]));
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
      /* × miedo. Una de cada cinco aves es MANSA (miedo 0,25-0,45) y te deja
         acercarte casi hasta tocarla, que es lo que pidió el jugador: "que a
         veces las aves no se asusten". Las demás siguen siendo ariscas. */
      var limite = ((a.fase === 'posado') ? a.ficha.posado : a.ficha.huye) * a.miedo;
      if (dist < limite) { huirAve(st, a); return; }
    }

    // ---- ¿le han talado el árbol donde estaba? ----
    if (a.fase === 'posado' && a.soporte && !sitioEnPie(scene, a.soporte)) {
      log(scene, a.especie, 'se queda sin', a.soporte);
      huirAve(st, a);
      return;
    }

    // Con pareja al lado, se giran el uno hacia el otro.
    if (a.fase === 'posado' && a.mirarA) cortejar(a);

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




  // ============================================================== SOMBRAS
  /* Una elipse oscura bajo cada bicho. Sin ella los animales parecen pegatinas
     flotando sobre el césped: es lo que los ancla al suelo.

     Va en `graphics`/`ellipse` y no en un sprite porque cambia de tamaño con
     cada especie y no hace falta ninguna textura.  */
  var SOMBRA_ALFA = 0.26;

  function crearSombra(st, a) {
    var scene = st.scene;
    if (a.sombra || !scene.add.ellipse) return;
    var ancho = Math.max(14, a.hw * 0.9);
    /* Relleno a tope y la opacidad con setAlpha.

       El ultimo argumento de add.ellipse es el fillAlpha, no el alpha del
       objeto, y Phaser dibuja con fillAlpha x alpha. Naciendo con 0,26 y
       poniendole ademas setAlpha(0,26) en cada frame, la sombra se pintaba a
       0,07: cuatro veces mas clara de lo que dice SOMBRA_ALFA. */
    a.sombra = scene.add.ellipse(a.spr.x, a.spr.y, ancho, ancho * 0.42,
                                 0x000000, 1);
    a.sombra.setAlpha(SOMBRA_ALFA);
    // Justo por DEBAJO del animal: si fuera por encima, se le vería una mancha
    // oscura encima del lomo.
    a.sombra.setDepth(a.spr.y - 1);
    a.sombraSuelo = a.spr.y;
  }

  function actualizarSombra(a) {
    if (!a.sombra || a.muerto) return;
    var volando = (a.fase === 'volando');
    if (!volando) a.sombraSuelo = a.spr.y;    // recuerda dónde está el suelo

    /* Volando, la sombra se queda ABAJO y se hace pequeña y tenue: es lo que da
       la sensación de altura. Si subiera con el pájaro, la sombra iría por el
       aire y no significaría nada. */
    var y = volando ? a.sombraSuelo : a.spr.y;
    a.sombra.setPosition(a.spr.x, y);
    a.sombra.setDepth(y - 1);
    a.sombra.setAlpha(volando ? SOMBRA_ALFA * 0.45 : SOMBRA_ALFA);
    a.sombra.setScale(volando ? 0.6 : 1);
    // Bajo tierra no hay sombra que valga: lo que se ve es un montón de tierra.
    a.sombra.setVisible(a.fase !== 'bajo' && a.spr.visible !== false);
  }

  // ================================================ VIDA DE LOS ANIMALES
  /** Barra de vida encima del animal. Se crea la primera vez que le pegan. */
  function crearBarra(st, a) {
    var scene = st.scene;
    if (a.barraFondo || !scene.add.rectangle) return;
    a.barraFondo = scene.add.rectangle(a.spr.x, a.spr.y, 34, 5, 0x1a1620)
      .setOrigin(0.5, 1);
    a.barraVida = scene.add.rectangle(a.spr.x - 16, a.spr.y, 32, 3, 0x5ec26a)
      .setOrigin(0, 1);
    if (a.barraFondo.setStrokeStyle) a.barraFondo.setStrokeStyle(1, 0x000000, 0.6);
  }

  function colorVida(pct) {
    if (pct > 60) return 0x5ec26a;
    if (pct > 30) return 0xe0b64a;
    return 0xc7503f;
  }

  function actualizarBarraAnimal(a, ahora) {
    if (!a.barraFondo) return;
    // Se esconde sola si hace rato que no pelea: si no, el mapa se llena de
    // barras de animales que ya nadie está tocando.
    var visible = !a.muerto && a.barraHasta > ahora;
    a.barraFondo.setVisible(visible);
    a.barraVida.setVisible(visible);
    if (!visible) return;
    var alto = a.spr.displayHeight || 40;
    var y = a.spr.y - alto - 6;
    a.barraFondo.setPosition(a.spr.x, y);
    a.barraFondo.setDepth(a.spr.y + 2);
    a.barraVida.setPosition(a.spr.x - 16, y - 1);
    a.barraVida.setDepth(a.spr.y + 3);
    var pct = Math.max(0, a.vida) / a.vidaMax * 100;
    a.barraVida.width = Math.max(0, 32 * pct / 100);
    a.barraVida.fillColor = colorVida(pct);
  }

  /**
   * El animal recibe daño.
   *
   * EL FALLO QUE ARREGLA: antes solo se contaban golpes y el animal se retiraba;
   * no tenía vida, no salía barra y no moría nunca. El jugador veía que le
   * pegaba y no pasaba nada visible.
   */
  function danarAnimal(st, a, cuanto) {
    if (a.muerto) return;
    var ahora = st.scene.time.now;
    // Un mordisco levanta a cualquiera.
    if (a.durmiendo) despertar(st, a);
    crearBarra(st, a);
    a.vida = Math.max(0, a.vida - cuanto);
    a.barraHasta = ahora + BARRA_VISIBLE_MS;
    // parpadeo rojo, para que el golpe se vea
    if (a.spr.setTint) a.spr.setTint(0xff7d6a);
    a.tinteHasta = ahora + 160;
    if (a.vida <= 0) morirAnimal(st, a, ahora);
  }

  /**
   * El animal muere: desaparece del mapa y vuelve a los 5 minutos.
   *
   * No se destruye el sprite, se esconde: recrearlo costaría más y así el
   * respawn es instantáneo. El animal deja de contar para todo lo demás
   * mientras `muerto` esté puesto.
   */
  function morirAnimal(st, a, ahora) {
    a.muerto = true;
    a.fase = 'muerto';
    quitarZzz(a);
    a.objetivo = null;
    a.revivirEn = ahora + RESPAWN_MS;
    a.spr.setVisible(false);
    if (a.barraFondo) { a.barraFondo.setVisible(false); a.barraVida.setVisible(false); }
    if (a.sombra) a.sombra.setVisible(false);
    log(st.scene, a.especie, 'ha muerto; vuelve en', RESPAWN_MS / 60000, 'min');
  }

  /** Vuelve a la vida, en OTRO sitio del mapa. */
  function revivirAnimal(st, a) {
    var scene = st.scene;
    var puntos = repartir(scene, a, 1, []);
    if (puntos.length) a.spr.setPosition(puntos[0].x, puntos[0].y);
    a.muerto = false;
    a.vida = a.vidaMax;
    a.revivirEn = 0;
    a.barraHasta = 0;
    a.golpes = 0;
    a.spr.setVisible(true);
    if (a.spr.clearTint) a.spr.clearTint();
    if (a.sombra) a.sombra.setVisible(true);
    if (a.grupo === 'topo') {
      a.fase = 'bajo'; anim(a, 'monticulo');
      a.hasta = scene.time.now + az(TOPO_BAJO[0], TOPO_BAJO[1]);
    } else {
      decidirTierra(st, a);
    }
    log(scene, a.especie, 'ha vuelto');
  }

  // =============================================================== PELEA
  /**
   * A quién va este animal.
   *
   * LA REGLA QUE PIDIÓ EL JUGADOR: con la mascota en modo ATTACK el animal
   * SOLO puede ir a por la mascota; únicamente cuando la mascota cae se fija
   * en el personaje. En modo PASSIVE la mascota no pelea, así que para ellos
   * es como si no estuviera y van directos al personaje.
   *
   * A un jugador que ya es fantasma no se le muerde: está muerto.
   */
  function objetivoDe(scene) {
    if (modoMascota() === 'attack' && mascotaViva()) {
      var d = scene.dog && scene.dog.sprite;
      if (d && d.active !== false && d.visible !== false) {
        return { tipo: 'mascota', x: d.x, y: d.y };
      }
      // Modo ataque pero sin perro a la vista: no se pasa al jugador, porque
      // la regla es que primero va la mascota.
      return null;
    }
    var p = scene.player;
    if (!p || jugadorFantasma()) return null;
    return { tipo: 'jugador', x: p.x, y: p.y };
  }

  /** Quita el parpadeo pasado el rato. */
  function limpiarGolpe(a, ahora) {
    if (a.tinteHasta && ahora >= a.tinteHasta) {
      a.tinteHasta = 0;
      if (a.spr && a.spr.clearTint) a.spr.clearTint();
    }
  }

  /** El animal se lleva un revolcón y se larga un rato. */
  function retirarse(st, a) {
    var scene = st.scene;
    var d = scene.dog && scene.dog.sprite;
    a.fase = 'retirada';
    a.objetivo = null;
    a.golpes = 0;
    a.rumbo = d ? Math.atan2(a.spr.y - d.y, a.spr.x - d.x) : az(0, Math.PI * 2);
    anim(a, poseAndar(a));
    a.hasta = scene.time.now + az(RETIRADA_MS[0], RETIRADA_MS[1]);
    log(scene, a.especie, 'se retira');
  }

  /** Mordisco. A la mascota le quita vida; al jugador, vitales. */
  function morder(st, a, obj) {
    if (obj.tipo === 'mascota') {
      if (window.GFMascota && window.GFMascota.golpear) {
        window.GFMascota.golpear(a.ficha.dano);
      }
    } else if (window.GFMascota && window.GFMascota.morderAlJugador) {
      window.GFMascota.morderAlJugador(st.scene);
    }
  }

  /**
   * La mascota devuelve los golpes.
   *
   * El perro NO cambia de trayectoria: lo mueve GameScene y meterse ahí sería
   * pelearse con el juego. Lo que hace es golpear a lo que se le acerque
   * estando en modo ataque, que visualmente es exactamente la pelea: el animal
   * se lanza, el perro le responde y a los pocos golpes el animal se retira.
   */
  function mascotaPelea(st, a, ahora) {
    if (modoMascota() !== 'attack' || !mascotaViva()) return;
    var scene = st.scene;
    var d = scene.dog && scene.dog.sprite;
    if (!d || d.visible === false) return;
    if (Math.hypot(a.spr.x - d.x, a.spr.y - d.y) > ALCANCE_MASCOTA) return;

    /* SOLO PEGA A LO QUE TIENE DELANTE.

       EL FALLO QUE ARREGLA: si una serpiente le atacaba por la espalda, el
       perro le respondía igual — "atacaba de espaldas", que es justo lo que el
       jugador no quería. GameScene guarda hacia dónde mira en dog.lastFacing
       ('left' / 'right'); si el bicho está del otro lado, el perro no llega y
       el animal se lleva unos mordiscos gratis, que es lo justo. */
    var mirando = (scene.dog.lastFacing === 'left') ? -1 : 1;
    if ((a.spr.x - d.x) * mirando < 0) return;

    if (ahora - (a.ultimoZarpazo || 0) < CADENCIA_MASCOTA) return;
    a.ultimoZarpazo = ahora;
    a.golpes = (a.golpes || 0) + 1;
    danarAnimal(st, a, DANO_MASCOTA);
    if (a.muerto) return;

    /* AL PERRO NO SE LE TOCA EL FLIP.

       EL BUG QUE ARREGLA — "el perro se ve caminando de pa atrás":
       aquí se hacía `d.setFlipX(...)` para que mirase al bicho. Pero GameScene
       NO usa flipX con el perro: tiene dos animaciones distintas, 'perro_left'
       y 'perro_right'. Al dejarle flipX en true, la animación correcta se
       dibujaba espejada y el perro andaba de espaldas para siempre.

       Se le quita el espejado por si alguien lo dejó puesto, y se le deja en
       paz: de a dónde mira ya se encarga el juego. */
    if (d.flipX) { try { d.setFlipX(false); } catch (e) {} }

    // Golpe visible: el animal parpadea en rojo. Sin esto, "la mascota ataca"
    // no se nota — que es justo lo que reportó el jugador.
    // Malherido: se retira antes de morir del todo, como haría un animal.
    if (a.vida <= a.vidaMax * 0.3) retirarse(st, a);
  }

  /**
   * Un frame de un animal agresivo.
   * @returns {boolean} true si ya se ha ocupado de él y no hay que seguir con
   *          la rutina normal de pasear.
   */
  function actualizarAgresivo(st, a, ahora, dt) {
    var scene = st.scene;

    if (a.fase === 'retirada') {
      moverTierra(st, a, dt, true);
      if (ahora >= a.hasta) decidirTierra(st, a);
      return true;
    }

    var obj = objetivoDe(scene);
    if (!obj) {
      if (a.objetivo) { a.objetivo = null; decidirTierra(st, a); }
      return false;
    }

    var dist = Math.hypot(a.spr.x - obj.x, a.spr.y - obj.y);
    if (dist > a.ficha.vista) {
      if (a.objetivo) { a.objetivo = null; decidirTierra(st, a); }
      return false;                       // fuera de su vista: vida normal
    }
    a.objetivo = obj.tipo;
    mascotaPelea(st, a, ahora);
    if (a.fase === 'retirada') return true;

    if (dist <= a.ficha.alcance) {
      a.fase = 'ataca';
      anim(a, 'ataque');
      a.spr.setFlipX(obj.x < a.spr.x);
      a.spr.setDepth(a.spr.y);
      if (ahora - (a.ultimoMordisco || 0) >= a.ficha.cadencia) {
        a.ultimoMordisco = ahora;
        morder(st, a, obj);
      }
    } else {
      a.fase = 'persigue';
      anim(a, poseAndar(a));
      a.rumbo = Math.atan2(obj.y - a.spr.y, obj.x - a.spr.x);
      moverTierra(st, a, dt, true);
    }
    return true;
  }

  // ================================================================ TOPO
  /** Deja un agujero en la tierra donde el topo se ha metido. */
  function abrirHoyo(st, x, y) {
    var scene = st.scene;
    if (!scene.textures.exists('gfa_topo_hoyo_1')) return;
    /* Tres tamaños de agujero, elegidos al azar.
       El jugador lo pidió expresamente: todos los hoyos salían idénticos y
       cantaba que era el mismo sprite copiado. */
    var cual = 1 + Math.floor(Math.random() * 3);
    var clave = 'gfa_topo_hoyo_' + cual;
    if (!scene.textures.exists(clave)) clave = 'gfa_topo_hoyo_1';
    var h = scene.add.sprite(x, y, clave);
    h.setOrigin(0.5, 1);
    h.setScale(ESCALA);
    // Por debajo de todo lo que pisa el suelo: es un agujero, no un objeto.
    h.setDepth(y - 2);
    st.hoyos.push({ spr: h, hasta: scene.time.now + HOYO_DURA_MS });
  }

  function limpiarHoyos(st, ahora) {
    for (var i = st.hoyos.length - 1; i >= 0; i--) {
      if (ahora >= st.hoyos[i].hasta) {
        if (st.hoyos[i].spr) st.hoyos[i].spr.destroy();
        st.hoyos.splice(i, 1);
      }
    }
  }

  /**
   * El topo.
   *
   * Ciclo: anda BAJO TIERRA (solo se ve el montículo moviéndose) → se ASOMA →
   * CAVA para salir → vive fuera (anda, come, se para) → si te acercas, CAVA
   * otra vez, deja el agujero y vuelve a meterse.
   *
   * Bajo tierra no se le puede morder ni asustar: es el único animal al que el
   * jugador no alcanza, y por eso no comparte la rutina de los demás.
   */
  function actualizarTopo(st, a, ahora, dt) {
    var scene = st.scene;
    var p = scene.player;
    var cerca = p && !jugadorFantasma() &&
                Math.hypot(a.spr.x - p.x, a.spr.y - p.y) < a.ficha.huye;

    switch (a.fase) {
      case 'bajo':
        /* Bajo tierra va MÁS RÁPIDO que andando por fuera: es su terreno.
           TOPO_VEL_BAJO existía y no se usaba — el montículo se arrastraba a la
           misma velocidad que el topo caminando, que es justo lo que el jugador
           notó como "no se mueve bien abajo". */
        a.rumbo += az(-0.6, 0.6) * dt;
        moverTierraA(st, a, dt, TOPO_VEL_BAJO);
        if (ahora >= a.hasta) {
          a.fase = 'asoma';
          anim(a, 'asoma');
          a.hasta = ahora + az(TOPO_ASOMA[0], TOPO_ASOMA[1]);
        }
        return;

      case 'asoma':
        // asomado se entera de todo: si hay alguien cerca, ni sale
        if (cerca) { meterse(st, a, ahora, false); return; }
        if (ahora >= a.hasta) {
          a.fase = 'sale';
          anim(a, 'cava');
          a.hasta = ahora + TOPO_CAVA_MS;
        }
        return;

      case 'sale':
        if (ahora >= a.hasta) {
          a.fase = 'quieto';
          anim(a, 'quieto');
          a.hasta = ahora + az(1200, 2600);
          // Cuánto se queda fuera EN TOTAL.
          //
          // EL FALLO QUE ARREGLA: sin este reloj, al salir pasaba a la rutina
          // normal de pasear/comer y `decidirTierra` la reiniciaba una y otra
          // vez. El topo no volvía a meritarse jamás por su cuenta: solo si el
          // jugador se le acercaba. En la simulación de 120 s salía y ya no
          // cavaba nunca más.
          a.fueraHasta = ahora + az(TOPO_FUERA[0], TOPO_FUERA[1]);
        }
        return;

      case 'cava':
        if (ahora >= a.hasta) {
          abrirHoyo(st, a.spr.x, a.spr.y);
          a.fase = 'bajo';
          anim(a, 'monticulo');
          a.rumbo = az(0, Math.PI * 2);
          a.hasta = ahora + az(TOPO_BAJO[0], TOPO_BAJO[1]);
        }
        return;

      default:
        // fuera: pasea, come o descansa como los demás
        if (cerca) { meterse(st, a, ahora, true); return; }
        // se le acabó el rato de superficie: a cavar y para dentro
        if (a.fueraHasta && ahora >= a.fueraHasta) {
          a.fueraHasta = 0;
          meterse(st, a, ahora, true);
          return;
        }
        if (a.fase === 'pasea') {
          moverTierra(st, a, dt, false);
          a.rumbo += az(-0.5, 0.5) * dt;
        }
        if (ahora >= a.hasta) decidirTierra(st, a);
        return;
    }
  }

  /** Se mete bajo tierra. `cavando` = estaba fuera y tiene que escarbar. */
  function meterse(st, a, ahora, cavando) {
    if (cavando) {
      a.fase = 'cava';
      anim(a, 'cava');
      a.hasta = ahora + TOPO_CAVA_MS;
    } else {
      a.fase = 'bajo';
      anim(a, 'monticulo');
      a.rumbo = az(0, Math.PI * 2);
      a.hasta = ahora + az(TOPO_BAJO[0], TOPO_BAJO[1]);
    }
  }


  // ======================================================= VIDA DE LAS AVES
  var FUENTES = ['sprite_pozoxd2', 'sprite_fuente1', 'sprite_fuente'];
  var ESPERA_BANO   = [4000, 9000];
  var PROB_NIDO     = 0.30;     // al posarse, a veces se pone a construir
  var DIST_PAREJA   = 520;      // hasta dónde busca compañía

  /** La fuente del pueblo, si existe. Es donde se bañan. */
  function fuenteDe(scene) {
    for (var i = 0; i < FUENTES.length; i++) {
      var f = scene[FUENTES[i]];
      if (!f || f.active === false) continue;
      var b;
      try { b = f.getBounds(); } catch (e) { continue; }
      // al borde del agua, no en el centro del pilón
      return { x: b.centerX + az(-b.width * 0.25, b.width * 0.25),
               y: b.bottom - 4, clave: FUENTES[i] };
    }
    return null;
  }

  function esDeNoche() {
    var c = window.GFCiclo;
    if (!c || !c.hayHora || !c.hayHora()) return false;
    var e = c.estado();
    return !!(e && e.esDia === false);
  }

  /** Otra ave de LA MISMA especie, posada y sin nada que hacer. */
  function companiaDe(st, a) {
    var cand = [];
    for (var i = 0; i < st.animales.length; i++) {
      var o = st.animales[i];
      if (o === a || o.especie !== a.especie) continue;
      if (o.fase !== 'posado' || o.pareja) continue;
      if (Math.hypot(o.spr.x - a.spr.x, o.spr.y - a.spr.y) > DIST_PAREJA) continue;
      cand.push(o);
    }
    return cand.length ? elegir(cand) : null;
  }

  /**
   * Dos aves iguales se van juntas.
   *
   * Se emparejan de verdad: eligen UN posadero y las dos vuelan hacia él, una
   * a cada lado. Mientras dura, se marcan como pareja para que ninguna se meta
   * en otra cosa, y al llegar se quedan de cara la una a la otra.
   */
  function irseJuntas(st, a, otra, sitio) {
    a.pareja = otra; otra.pareja = a;
    volarA(st, a, { x: sitio.x - 7, y: sitio.y }, 'posado', sitio.clave);
    volarA(st, otra, { x: sitio.x + 7, y: sitio.y }, 'posado', sitio.clave);
    a.mirarA = otra; otra.mirarA = a;
    log(st.scene, a.especie, 'se va con otra a', sitio.clave);
  }

  /** Al lado de su pareja: se giran el uno hacia el otro y se acicalan. */
  function cortejar(a) {
    if (!a.mirarA || !a.mirarA.spr || !a.mirarA.spr.active) { a.mirarA = null; return; }
    a.spr.setFlipX(a.mirarA.spr.x < a.spr.x);
  }

  /** Construye un nido en la copa donde está posada. */
  /** ¿Es un árbol? Solo ahí se hacen nidos. */
  function esArbol(clave) {
    return !!clave && (clave.indexOf('sprite_arbolx') === 0 ||
                       clave.indexOf('sprite_pinos') === 0);
  }

  /**
   * Un nido en la rama.
   *
   * TRES COSAS QUE ESTABAN MAL Y SE VEÍAN EN LA CAPTURA:
   *
   *   1. Se hacían nidos en las FAROLAS y en los tejados, porque valía
   *      cualquier sitio donde el ave se posara. Un nido colgando de un farol
   *      no se lee como nido, se lee como un fallo. Ahora solo en árboles.
   *
   *   2. El nido salía a la altura del ave y a su mismo ancho — 40 px contra
   *      los 44 de la paloma — así que en vez de verse el ave DENTRO del nido
   *      se veía un bulto gris tapándola. Ahora va más pequeño, un poco por
   *      debajo, y el ave se dibuja por delante.
   *
   *   3. Se le ponía la profundidad UNA vez, copiada del ave. El ave se mueve y
   *      cambia de profundidad; el nido se quedaba con la de aquel momento y
   *      acababa por delante o por detrás de lo que no tocaba. Ahora la lleva
   *      del ÁRBOL, que es lo que no se mueve.
   */
  function construirNido(st, a) {
    var scene = st.scene;
    if (!scene.textures.exists('gfa_nido_1')) return;
    if (!esArbol(a.soporte)) return;                  // ni farolas ni tejados
    if (st.nidos[a.soporte]) return;                  // ya hay uno en ese árbol

    var arbol = scene[a.soporte];
    var base = (arbol && typeof arbol.depth === 'number') ? arbol.depth : a.spr.y;

    var conHuevos = Math.random() < 0.45;
    var nido = scene.add.sprite(a.posX != null ? a.posX : a.spr.x,
                                (a.posY != null ? a.posY : a.spr.y) + 3,
                                conHuevos ? 'gfa_nido_2' : 'gfa_nido_1');
    nido.setOrigin(0.5, 1);
    // Más pequeño que el ave: un nido del mismo tamaño la tapa entera.
    nido.setScale(ESCALA * 0.8);
    // Por delante del árbol y por DETRÁS del ave (que va en base + 2).
    nido.setDepth(base + 1);
    // Dónde está de verdad, para poder mecerlo con la rama sin acumular.
    nido.__x = nido.x;
    nido.__y = nido.y;
    nido.__soporte = a.soporte;
    st.nidos[a.soporte] = nido;
    log(scene, a.especie, 'construye nido en', a.soporte);
  }


  // =========================================================== MARIPOSAS
  /* Dónde se posan. El jugador las quería en flores, arbustos, piedras y
     troncos, que es exactamente donde se posan las de verdad. */
  var FAMILIAS_MARIPOSA = [
    ['sprite_flor_formado1_ect', 19], ['sprite_flor_formado2_ect', 20],
    ['sprite_flor_formado3_ect', 19], ['sprite_flor_formado4_ect', 18],
    ['sprite_arbustos_', 28], ['sprite_arbusto_ect', 18],
    ['sprite_piedras_', 34]
  ];
  var MAR_ALTURA   = [0.20, 0.55];     // dónde se posa dentro del objeto
  var MAR_POSADA   = [3000, 9000];
  var MAR_VUELO    = [2500, 6000];
  var MAR_RADIO    = 420;              // no cruzan medio mapa de un tirón

  function floresYPiedras(scene) {
    var out = [];
    var i, f;
    for (f = 0; f < FAMILIAS_MARIPOSA.length; f++) {
      for (i = 1; i <= FAMILIAS_MARIPOSA[f][1]; i++) {
        var clave = FAMILIAS_MARIPOSA[f][0] + i;
        var spr = scene[clave];
        if (!spr || spr.active === false) continue;
        var b;
        try { b = spr.getBounds(); } catch (e) { continue; }
        if (!b || !isFinite(b.centerX)) continue;
        out.push({ clave: clave,
                   x: b.centerX + az(-b.width * 0.22, b.width * 0.22),
                   y: b.top + b.height * az(MAR_ALTURA[0], MAR_ALTURA[1]),
                   base: (typeof spr.depth === 'number') ? spr.depth : b.bottom });
      }
    }
    // Los troncos llevan 'png' al final del nombre; van aparte para no
    // ensuciar la tabla de arriba con el caso raro.
    for (i = 1; i <= 17; i++) {
      var t = scene['sprite_tronco_acostado_' + i + 'png'];
      if (!t || t.active === false) continue;
      var bt;
      try { bt = t.getBounds(); } catch (e) { continue; }
      out.push({ clave: 'sprite_tronco_acostado_' + i + 'png',
                 x: bt.centerX + az(-bt.width * 0.3, bt.width * 0.3),
                 y: bt.top + bt.height * 0.35,
                 base: (typeof t.depth === 'number') ? t.depth : bt.bottom });
    }
    return out;
  }

  function decidirMariposa(st, m) {
    var scene = st.scene;
    var p = scene.player;
    var sitios = floresYPiedras(scene);

    // Solo de la zona: una mariposa no cruza el pueblo de punta a punta.
    var cerca = [];
    for (var i = 0; i < sitios.length; i++) {
      if (Math.hypot(sitios[i].x - m.spr.x, sitios[i].y - m.spr.y) > MAR_RADIO) continue;
      if (p && Math.hypot(sitios[i].x - p.x, sitios[i].y - p.y) < m.ficha.huye * 1.3) continue;
      cerca.push(sitios[i]);
    }
    if (!cerca.length) {
      // Sin nada donde posarse, sigue revoloteando por ahí.
      m.fase = 'revolotea';
      anim(m, 'vuela');
      var limD = limites(scene);
      m.destino = {
        x: Math.min(limD.w - 30, Math.max(30, m.spr.x + az(-160, 160))),
        y: Math.min(limD.h - 30, Math.max(30, m.spr.y + az(-120, 120)))
      };
      m.hasta = scene.time.now + az(MAR_VUELO[0], MAR_VUELO[1]);
      return;
    }
    var s2 = elegir(cerca);
    m.fase = 'revolotea';
    anim(m, 'vuela');
    m.destino = { x: s2.x, y: s2.y };
    m.soporte = s2.clave;
    m.baseSoporte = s2.base;
    m.hasta = scene.time.now + az(MAR_VUELO[0], MAR_VUELO[1]);
  }

  /**
   * Una mariposa NO vuela recto: da tumbos.
   *
   * Se avanza hacia el destino pero con un vaivén lateral fuerte, que es lo que
   * hace que se lea como mariposa y no como un pájaro pequeño. Y no comprueba
   * colisiones: vuela por encima de todo.
   */
  function actualizarMariposa(st, m, ahora, dt) {
    var scene = st.scene;
    var p = scene.player;

    if (p && !jugadorFantasma() &&
        Math.hypot(m.spr.x - p.x, m.spr.y - p.y) < m.ficha.huye) {
      // Se espanta: sale revoloteando al lado contrario.
      var ang = Math.atan2(m.spr.y - p.y, m.spr.x - p.x);
      m.fase = 'revolotea';
      anim(m, 'vuela');
      m.soporte = null;
      var limF = limites(scene);
      m.destino = {
        x: Math.min(limF.w - 30, Math.max(30, m.spr.x + Math.cos(ang) * 260)),
        y: Math.min(limF.h - 30, Math.max(30, m.spr.y + Math.sin(ang) * 260))
      };
      m.hasta = ahora + az(MAR_VUELO[0], MAR_VUELO[1]);
    }

    if (m.fase === 'posada') {
      // Posada va por delante de la flor, si no se pierde entre los pétalos.
      m.spr.setDepth((m.baseSoporte || m.spr.y) + 2);
      if (ahora >= m.hasta) decidirMariposa(st, m);
      return;
    }

    var d = m.destino;
    if (!d) { decidirMariposa(st, m); return; }
    var dx = d.x - m.spr.x, dy = d.y - m.spr.y;
    var dist = Math.hypot(dx, dy);
    var paso = m.ficha.vel * dt;

    if (dist < 5 || paso >= dist) {
      m.spr.setPosition(d.x, d.y);
      if (m.soporte) {
        m.fase = 'posada';
        anim(m, 'posa');
        m.hasta = ahora + az(MAR_POSADA[0], MAR_POSADA[1]);
      } else {
        decidirMariposa(st, m);
      }
      return;
    }

    // vaivén: perpendicular al avance y con su propio ritmo
    m.vaiven = (m.vaiven || 0) + dt * 7.5;
    var px = -dy / dist, py = dx / dist;
    var lat = Math.sin(m.vaiven) * 22 * dt;
    /* Se quedan DENTRO del mapa. No comprueban colisiones —vuelan por encima
       de todo— pero el borde del mundo sí es un límite: sin esto, con el
       vaivén acababan saliéndose por el canto y desaparecían para siempre. */
    var lim = limites(scene);
    m.spr.x = Math.min(lim.w - 20, Math.max(20,
              m.spr.x + (dx / dist) * paso + px * lat));
    m.spr.y = Math.min(lim.h - 20, Math.max(20,
              m.spr.y + (dy / dist) * paso + py * lat -
              Math.cos(m.vaiven * 0.7) * 6 * dt));
    m.spr.setDepth(m.spr.y + 40);      // por encima de la hierba y los arbustos
    if (ahora >= m.hasta) decidirMariposa(st, m);
  }


  // ═══════════════════════════════════════════════════════════ EL SUEÑO
  /** Pose con la que se dibuja un animal dormido, la mejor que tenga. */
  function poseDormido(a) {
    var p = posesDe(a.especie);
    if (p.duerme) return 'duerme';
    if (p.tumbado) return 'tumbado';
    if (p.posa) return 'posa';          // la mariposa, con las alas cerradas
    if (p.monticulo && a.grupo === 'topo') return 'monticulo';
    return 'quieto';
  }

  /** A qué distancia se despierta este animal. */
  function radioDespertar(a) {
    return Math.max(DESPERTAR_MIN, (a.ficha.huye || 0) * 0.75 * (a.miedo || 1));
  }

  /**
   * Se duerme.
   *
   * `hasta` a null = duerme hasta que amanezca (o hasta que lo despierten);
   * con un número, es una cabezada de día.
   */
  function dormirse(st, a, hasta) {
    if (a.durmiendo || a.muerto) return;
    a.durmiendo = true;
    a.faseAntes = a.fase;
    a.fase = 'duerme';
    a.despiertaEn = hasta || 0;
    anim(a, poseDormido(a));
    // El ave que pasa la noche en su rama aprovecha para hacerse el nido.
    if (!hasta && a.grupo === 'ave' && a.soporte && Math.random() < PROB_NIDO) {
      construirNido(st, a);
    }
    crearZzz(st, a);
    /* Se coloca YA, sin esperar al siguiente frame: si no, la primera Z
       aparece un frame en el pie del animal y con profundidad 0 —o sea,
       detras de todo— y se ve el salto. */
    moverZzz(st, a, st.scene.time.now);
    log(st.scene, a.especie, hasta ? 'echa una cabezada' : 'se duerme');
  }

  function despertar(st, a) {
    if (!a.durmiendo) return;
    a.durmiendo = false;
    a.despiertaEn = 0;
    quitarZzz(a);
    // Vuelve a decidir en vez de retomar lo que hacía: al despertarse lo
    // primero que hace un animal es mirar alrededor, no seguir comiendo.
    if (a.grupo === 'ave') { a.fase = 'posado'; a.hasta = st.scene.time.now + az(400, 1400); }
    else if (a.grupo === 'mariposa') { decidirMariposa(st, a); }
    else if (a.grupo === 'topo') { a.fase = 'bajo'; anim(a, 'monticulo');
                                   a.hasta = st.scene.time.now + az(TOPO_BAJO[0], TOPO_BAJO[1]); }
    else { decidirTierra(st, a); }
  }

  /** La Z que flota encima del animal dormido. */
  function crearZzz(st, a) {
    if (a.zzz || !st.scene.textures.exists('gfa_' + ZZZ[0])) return;
    // add.sprite y no add.image: es lo que usa todo el módulo (el animal, el
    // hoyo del topo, el nido) y así la Z se comporta igual que el resto.
    a.zzz = st.scene.add.sprite(a.spr.x, a.spr.y, 'gfa_' + ZZZ[0])
      .setOrigin(0.5, 1).setScale(ESCALA).setAlpha(0);
    a.zzzFase = az(0, ZZZ_CICLO);
  }

  function quitarZzz(a) {
    if (!a.zzz) return;
    a.zzz.destroy();
    a.zzz = null;
  }

  /**
   * Anima la Z: sube, crece y se borra, y vuelta a empezar.
   *
   * Una sola imagen por animal en vez de tres: con veinte bichos dormidos,
   * sesenta sprites más para un adorno no salen a cuenta. Cambiando la textura
   * según la altura se ve igual de bien.
   */
  function moverZzz(st, a, ahora) {
    if (!a.zzz) { crearZzz(st, a); if (!a.zzz) return; }
    var t = ((ahora + a.zzzFase) % ZZZ_CICLO) / ZZZ_CICLO;
    var alto = (a.spr.displayHeight || 30);
    a.zzz.setPosition(a.spr.x + 9, a.spr.y - alto - t * ZZZ_SUBE);
    a.zzz.setTexture('gfa_' + ZZZ[Math.min(2, Math.floor(t * 3))]);
    // entra rápido y se va despacio
    a.zzz.setAlpha(t < 0.18 ? t / 0.18 : Math.max(0, 1 - (t - 0.18) / 0.82) * 0.95);
    a.zzz.setDepth(a.spr.depth + 2);
  }

  /**
   * ¿Duerme, sigue durmiendo o se despierta? Devuelve true si está dormido y
   * el resto del bucle no tiene que tocarlo.
   */
  function actualizarSuenio(st, a, ahora) {
    var scene = st.scene;
    var p = scene.player;

    if (a.durmiendo) {
      // Lo despierta el jugador al acercarse...
      if (p && !jugadorFantasma() &&
          Math.hypot(a.spr.x - p.x, a.spr.y - p.y) < radioDespertar(a)) {
        despertar(st, a); return false;
      }
      // ...que se acabe la cabezada...
      if (a.despiertaEn && ahora >= a.despiertaEn) { despertar(st, a); return false; }
      // ...o que amanezca.
      if (!a.despiertaEn && !esDeNoche()) { despertar(st, a); return false; }
      moverZzz(st, a, ahora);
      return true;
    }

    // ¿Se echa a dormir? Solo cuando ha terminado lo que estuviera haciendo.
    if (ahora < a.hasta) return false;

    if (esDeNoche()) {
      if (a.dormilon && !(a.grupo === 'ave' && a.fase === 'volando')) {
        dormirse(st, a, null);
        return true;
      }
      return false;
    }

    // De día, una cabezada corta y de vez en cuando.
    if (a.siestero && a.fase !== 'volando' && a.fase !== 'huye' &&
        !a.objetivo && Math.random() < PROB_SIESTA) {
      dormirse(st, a, ahora + az(SIESTA_MS[0], SIESTA_MS[1]));
      return true;
    }
    return false;
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

    limpiarHoyos(st, ahora);

    var dt = Math.min(delta, 100) / 1000;   // un tirón no los teletransporta
    var cam = scene.cameras && scene.cameras.main;
    var cx = cam ? cam.midPoint.x : 0, cy = cam ? cam.midPoint.y : 0;

    for (var i = 0; i < st.animales.length; i++) {
      var a = st.animales[i];
      if (!a.spr || !a.spr.active) continue;

      /* Los que están lejos de la cámara se actualizan a 5 Hz en vez de a 60.
         Siguen vivos y moviéndose, pero no se paga el coste de comprobar
         colisiones 60 veces por segundo por cada animal del mapa. */
      /* MUERTO: solo cuenta el reloj del respawn, y se mira SIEMPRE.

         Antes esto iba después del limitador de frecuencia, y como un animal
         muerto suele estar lejos de la cámara, casi nunca le tocaba turno: el
         respawn dependía de que el jugador anduviera cerca. Ahora vuelve a los
         5 minutos esté donde esté. */
      if (a.muerto) {
        if (ahora >= a.revivirEn) revivirAnimal(st, a);
        continue;
      }

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

      limpiarGolpe(a, ahora);
      actualizarBarraAnimal(a, ahora);
      actualizarSombra(a);

      // Dormido: ni se mueve ni ataca ni se asusta, solo suelta sus Z.
      if (actualizarSuenio(st, a, ahora)) continue;

      if (a.grupo === 'ave') actualizarAve(st, a, ahora, dt);
      else if (a.grupo === 'mariposa') actualizarMariposa(st, a, ahora, dt);
      else if (a.grupo === 'topo') actualizarTopo(st, a, ahora, dt);
      else actualizarTierra(st, a, ahora, dt);
    }

    /* El balanceo va AL FINAL y siempre, dormidas incluidas.

       Y se suma sobre a.posX, la posición donde el ave se posó de verdad, no
       sobre la de este frame: sumando sobre la de este frame el desplazamiento
       se acumularía frame a frame y en medio minuto el ave estaría en la otra
       punta del mapa. */
    mecerPosados(st);
  }

  // ============================================================== MONTAJE
  function montar(scene, opciones) {
    opciones = opciones || {};
    if (!scene || !scene.add || !scene.textures) return null;
    if (scene.__gfFauna) return scene.__gfFauna;      // ya montada

    var elenco = opciones.elenco || ELENCO;
    var st = { scene: scene, animales: [], hoyos: [], nidos: {} };
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
          /* Se busca un posadero libre y separado de los demás. La distancia
             exigida se va RELAJANDO en vueltas sucesivas.

             EL FALLO QUE ARREGLA: antes, si en 40 intentos no salía ninguno que
             cumpliera los 700 px, se cogía uno cualquiera — incluido uno YA
             OCUPADO. Dos aves acababan en el mismo punto exacto del mismo
             árbol, una encima de otra y moviéndose igual. Con 9 aves y los
             posaderos en racimos, pasaba de verdad. */
          var exigencias = [SEPARACION_NACIMIENTO, SEPARACION_NACIMIENTO / 2,
                            SEPARACION_NACIMIENTO / 4, 0];
          for (var ex = 0; ex < exigencias.length && !sitio; ex++) {
            for (var intento = 0; intento < 40 && sitios.length; intento++) {
              var cand = elegir(sitios);
              if (usados[cand.clave]) continue;      // nunca dos en el mismo
              var pegado = false;
              for (var q = 0; q < puestos.length; q++) {
                if (Math.hypot(cand.x - puestos[q].x, cand.y - puestos[q].y) <
                    exigencias[ex]) { pegado = true; break; }
              }
              if (pegado) continue;
              sitio = cand; break;
            }
          }
          // Ni un posadero libre en todo el mapa: se comparte, pero corrido a
          // un lado para que no queden dos sprites calcados.
          if (!sitio && sitios.length) {
            var comp = elegir(sitios);
            sitio = { clave: comp.clave, base: comp.base,
                      x: comp.x + az(-14, 14), y: comp.y + az(-4, 4) };
          }
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
      var an = st.animales[i];
      if (an.spr) an.spr.destroy();
      if (an.zzz) an.zzz.destroy();
      if (an.barraFondo) an.barraFondo.destroy();
      if (an.barraVida) an.barraVida.destroy();
      if (an.sombra) an.sombra.destroy();
    }
    st.animales.length = 0;
    for (var h = 0; h < st.hoyos.length; h++) {
      if (st.hoyos[h].spr) st.hoyos[h].spr.destroy();
    }
    st.hoyos.length = 0;
    for (var k in st.nidos) { if (st.nidos[k]) st.nidos[k].destroy(); }
    st.nidos = {};
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
      objetivoDe: objetivoDe, actualizarAgresivo: actualizarAgresivo,
      fuenteDe: fuenteDe, esDeNoche: esDeNoche, companiaDe: companiaDe,
      irseJuntas: irseJuntas, construirNido: construirNido,
      dormirse: dormirse, despertar: despertar, actualizarSuenio: actualizarSuenio,
      poseDormido: poseDormido, radioDespertar: radioDespertar,
      moverZzz: moverZzz, PROB_DORMILON: PROB_DORMILON, SIESTA_MS: SIESTA_MS,
      PROB_SIESTA: PROB_SIESTA, PROB_SIESTERO: PROB_SIESTERO,
      balanceoSoporte: balanceoSoporte, mecerPosados: mecerPosados,
      esArbol: esArbol, construirNido: construirNido,
      sabeTumbarse: sabeTumbarse, danarAnimal: danarAnimal,
      crearSombra: crearSombra, actualizarSombra: actualizarSombra,
      floresYPiedras: floresYPiedras, actualizarMariposa: actualizarMariposa,
      decidirMariposa: decidirMariposa,
      morirAnimal: morirAnimal, revivirAnimal: revivirAnimal,
      actualizarBarraAnimal: actualizarBarraAnimal, RESPAWN_MS: RESPAWN_MS,
      DANO_MASCOTA: DANO_MASCOTA,
      actualizarTopo: actualizarTopo, mascotaPelea: mascotaPelea,
      retirarse: retirarse, morder: morder, abrirHoyo: abrirHoyo,
      posesDe: posesDe, POSES: POSES, POSES_EXTRA: POSES_EXTRA
    }
  };
})();
