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
 * SE ENTERAN DEL TIEMPO QUE HACE
 *   Con lluvia, nieve o viento fuerte cada especie hace lo suyo: las mariposas
 *   se agarran a una hoja, las aves se meten en la rama, el conejo corre a su
 *   madriguera, el zorro se tumba bajo una copa, el cocodrilo se acuesta, la
 *   vaca aguanta de pie y el cerdo se va derecho al primer charco. Al tronar,
 *   se sobresaltan. Con sol, los reptiles se tuestan y las mariposas no paran.
 *   Todo eso está en la sección "EL TIEMPO Y LOS ANIMALES", y lo que hace el
 *   tiempo se le pregunta a gf-clima (`GFClima.ahora()`); sin ese módulo el
 *   mundo se comporta como si estuviera siempre despejado.
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
 *   GFAnimales.congelar(n) / descongelarTodos()
 *   GFAnimales.tiempo()                  qué tiempo creen que hace
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
    mariposa:  { vuela: 4, posa: 2 },
    /* El conejo es el único que tiene CASA: la madriguera se queda dibujada en
       el mapa aunque él no esté, y de noche se mete dentro. Por eso necesita
       fotogramas que ningún otro usa: cavar, la madriguera vacía y andar con
       una zanahoria en la boca. */
    conejo:    { quieto: 2, camina: 4, corre: 4, come: 2, lleva: 2,
                 cava: 3, duerme: 2, madriguera: 2 }
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
    posa: 1.6,
    // El conejo corre a saltos rapidos; llevando la zanahoria va igual que
    // andando, para que no parezca que la zanahoria le da prisa.
    corre: 13, lleva: 8, madriguera: 1
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
    /* El conejo es el animal MAS RAPIDO del mapa y el mas asustadizo: 190 px/s
       corriendo contra los 96 del zorro, y salta a huir a 240 px. Es lo que lo
       hace conejo — no lo vas a alcanzar, solo lo vas a ver marcharse. */
    conejo:           { grupo: 'conejo',    vel: 30, corre: 190, huye: 240, huella: [20, 10], ritmo: 1.25, vida: 22 },
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
    ['conejo', 4],
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

  /* ─────────────────────────── LOS CONEJOS ───────────────────────────────

     Cada conejo cava UNA madriguera y se la queda: es su casa, no un escondite
     de usar y tirar. Se dibuja en el mapa y sigue ahí aunque él ande lejos.

     De noche vuelve a ella y se mete dentro — desaparece el conejo y queda la
     madriguera con sus Z encima. Es distinto de dormir a la intemperie como los
     demás, y es lo que hace que un conejo se lea como conejo.

     De día busca zanahorias. Cuando encuentra una, la mitad de las veces se la
     come ahí mismo y la otra mitad se la LLEVA a la madriguera con la zanahoria
     en la boca. */
  var CONEJO_CAVA_MS   = 1400;          // lo que tarda en abrir la madriguera
  var CONEJO_ESPERA    = [4000, 13000]; // entre una cosa y otra
  var CONEJO_COME_MS   = [3000, 7000];
  var CONEJO_RADIO     = 520;           // no se aleja mucho de su casa
  var CONEJO_PROB_CAVA = 0.30;          // de las veces que decide algo
  var CONEJO_PROB_ZANA = 0.35;          // ...y de buscar zanahoria
  var CONEJO_LLEVA     = 0.5;           // se la lleva a casa en vez de comerla

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

  /* ══════════════════════════════════════════════════════════════════════
     EL ESCENARIO SE MIDE UNA VEZ CADA TANTO, NO EN CADA DECISIÓN
     ──────────────────────────────────────────────────────────────────────
     LA FUGA QUE ESTO ARREGLA (no de memoria retenida, sino de BASURA):

     `posaderos()` recorre 93 sprites y `floresYPiedras()` recorre 173, y cada
     uno de ellos llama a `getBounds()` —que fabrica un rectángulo nuevo— y
     además deja un objeto suelto por cada sitio encontrado. Las dos se
     llamaban ENTERAS cada vez que un bicho decidía qué hacer.

     Con trece mariposas decidiendo cada dos segundos y medio y nueve aves
     haciendo lo propio, salían del orden de mil `getBounds()` y varios cientos
     de objetos POR SEGUNDO, tirados acto seguido. Eso no llena la memoria,
     pero obliga al recolector a pasar sin parar, y el recolector pasando es
     exactamente el tirón que se nota al andar por el mapa.

     Ahora el barrido se hace como mucho cada CACHE_SITIOS_MS y el resultado se
     guarda. Los árboles y las casas no se mueven; lo único que cambia es que
     talen uno, y eso ya se comprueba aparte (`sitioEnPie`) justo cuando hace
     falta.

     EL AZAR NO SE GUARDA. Si se cacheara el punto exacto con su desviación al
     azar ya aplicada, todas las aves que fueran a un mismo tejado caerían en
     el mismísimo píxel. Lo que se guarda es el CENTRO y CUÁNTO se puede
     desviar; el sorteo se hace al elegir (`puntoPosadero`, `puntoFlor`).
     ══════════════════════════════════════════════════════════════════════ */
  var CACHE_SITIOS_MS = 2500;

  /** Se guarda por escena: dos mapas distintos no comparten árboles. */
  function cacheDe(scene) {
    var c = scene.__gfFaunaSitios;
    if (!c) {
      c = scene.__gfFaunaSitios = { posaderos: null, flores: null,
                                    refugios: null, hasta: 0, tocones: -1 };
    }
    return c;
  }

  /** ¿Vale todavía lo guardado? Caduca por tiempo y si han talado algo. */
  function cacheVale(scene, c) {
    var ahora = (scene.time && scene.time.now) || 0;
    var tocones = 0;
    var t = scene.treeStumps;
    if (t) { for (var k in t) { if (t[k]) tocones++; } }
    if (ahora >= c.hasta || tocones !== c.tocones) {
      c.hasta = ahora + CACHE_SITIOS_MS;
      c.tocones = tocones;
      c.posaderos = null;
      c.flores = null;
      c.refugios = null;
      return false;
    }
    return true;
  }

  /** Tira lo guardado: lo llama quien cambie el escenario a mano. */
  function olvidarSitios(scene) {
    if (scene && scene.__gfFaunaSitios) scene.__gfFaunaSitios.hasta = 0;
  }

  /** Un punto CONCRETO dentro de un posadero, con su desviación al azar. */
  function puntoPosadero(s) {
    return { clave: s.clave, base: s.base, spr: s.spr,
             x: s.x + (s.jit ? (Math.random() - 0.5) * s.jit : 0),
             y: s.y };
  }

  /** Sitios donde puede posarse un ave: árboles, postes y tejados. */
  function posaderos(scene) {
    var c = cacheDe(scene);
    if (cacheVale(scene, c) && c.posaderos) return c.posaderos;

    var out = [];
    var tocones = scene.treeStumps || {};

    function meter(clave, spr, alto, anchoUtil) {
      if (!spr || spr.active === false || typeof spr.x !== 'number') return;
      var b;
      try { b = spr.getBounds(); } catch (e) { return; }
      if (!b || !isFinite(b.centerX)) return;
      out.push({
        clave: clave, spr: spr,
        // El CENTRO. La desviación a lo ancho —para que no se posen siempre en
        // el mismísimo píxel— la pone `puntoPosadero` al elegir, no aquí: si
        // se guardara sorteada, todas las aves irían al mismo punto.
        x: b.centerX,
        jit: anchoUtil ? b.width * anchoUtil : 0,
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
    c.posaderos = out;
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

  /**
   * La caja del DIBUJO de un sprite, en el mundo.
   *
   * `getBounds()` devuelve el rectángulo del ARCHIVO, y casi todos los PNG del
   * juego traen transparencia de sobra alrededor. Para colocar algo ENCIMA de
   * otra cosa —una mariposa sobre una flor— esa diferencia es justo el error
   * que se ve: la mariposa aparece flotando por encima de la flor, o metida
   * dentro del arbusto, según cuánto relleno traiga ese sprite.
   *
   * La caja opaca la mide gf-profundidad.js y la guarda en caché, así que esto
   * sale gratis. Sin ese módulo se devuelve la caja entera, que es lo que había.
   */
  function cajaDibujada(scene, spr) {
    var b;
    try { b = spr.getBounds(); } catch (e) { return null; }
    if (!b || !isFinite(b.centerX) || !b.width) return null;

    var P = window.GFProfundidad, m = null;
    if (P && P.medir && spr.texture && spr.texture.key) {
      try { m = P.medir(scene, spr.texture.key); } catch (e) {}
    }
    if (!m || !m.leida || !m.ancho || !m.alto) {
      return { x: b.x, y: b.y, width: b.width, height: b.height,
               centerX: b.centerX, top: b.top, bottom: b.bottom };
    }
    var ex = b.width / m.ancho, ey = b.height / m.alto;
    var x = b.x + m.izq * ex;
    var y = b.y + m.arriba * ey;
    var w = Math.max(1, (m.der - m.izq + 1) * ex);
    var h = Math.max(1, (m.abajo - m.arriba + 1) * ey);
    return { x: x, y: y, width: w, height: h,
             centerX: x + w / 2, top: y, bottom: y + h };
  }

  /* ══════════════════════════════════════════════════════════════════════
     EL TIEMPO Y LOS ANIMALES
     ──────────────────────────────────────────────────────────────────────
     LO QUE ESTABA MAL, EN UNA LÍNEA: llovía a mares y el mapa seguía igual.
     Los pájaros se bañaban en la fuente bajo el chaparrón, el cocodrilo
     paseaba, las mariposas revoloteaban y el cuervo picoteaba en la parcela.
     El clima se PINTABA encima del mundo, pero el mundo no se enteraba.

     Un animal de verdad es el mejor barómetro que hay. Antes de que caiga la
     primera gota ya se ha ido todo el mundo a cubierto, y lo que se ve no es
     un efecto de lluvia: es un prado que se queda vacío. Eso es lo que se
     monta aquí.

     CÓMO ESTÁ HECHO
       · `tiempo()` lee de gf-clima lo que se ve AHORA (ya interpolado), y una
         sola vez por fotograma para los treinta y pico bichos.
       · `molestia()` convierte ese tiempo en un número por animal: cuánto le
         fastidia. Un cerdo casi ni se entera; una mariposa se refugia con
         cuatro gotas.
       · Cada especie tiene su MANERA de guarecerse (`ANTE_EL_AGUA`), porque no
         se guarecen igual un conejo, un pájaro y un cocodrilo.
       · Con histéresis: se entra a refugio en 0,30 y no se sale hasta 0,12.
         Sin ella, con la lluvia parada justo en el umbral, el prado entero
         entraría y saldría del refugio varias veces por segundo.
       · Y ESCALONADO: cada bicho tarda lo suyo en reaccionar (`reaccionaEn`).
         Sin eso, treinta y un animales deciden refugiarse en el MISMO
         fotograma —un tirón bien visible— y encima se ve coreografiado, que es
         el mismo fallo que ya tenía el huir en manada y que arregló `miedo`.

     POR QUÉ NO SE METE ESTO EN `decidirTierra` Y YA
     Porque el tiempo no es algo que el animal ELIJA hacer, es algo que le
     PASA. Tiene que poder interrumpir lo que estuviera haciendo —comiendo,
     paseando, bañándose— y tiene que soltarlo en cuanto escampe. Un `if` más
     en la ruleta de decisiones no haría ni lo uno ni lo otro.
     ══════════════════════════════════════════════════════════════════════ */

  /* Los umbrales. Van sobre la fuerza YA INTERPOLADA (lo que se ve), no sobre
     lo que manda el servidor: ver `GFClima.ahora()`. */
  var LLUVIA_MOJA    = 0.15;   // a partir de aquí el bicho se entera
  var NIEVE_CUAJA    = 0.20;
  /* POR ENCIMA DE ESTO, UNA MARIPOSA NO SE SOSTIENE.

     Estaba en 0,80 y con eso casi no se notaba, porque hay que mirar QUÉ
     números da el viento de verdad: `st.fuerza` de gf-viento vale como mucho
     1 en un día ventoso normal, y encima va y viene con un seno (el término
     0,72 + 0,28·sen), o sea que oscila entre 0,44 y 1 cada catorce segundos y
     medio. Con el umbral en 0,80 la molestia llegaba a 0,36 durante un
     instante — apenas por encima del 0,30 que hace falta para refugiarse— y
     el retraso de reacción se comía casi toda la racha. Medido en el
     navegador: las mariposas seguían volando el 30 % de las rachas fuertes.

     Con 0,70 la molestia sube a 0,66 en lo más fuerte de cada racha y baja de
     0,12 —el umbral de salir— cuando amaina. El resultado es lo que se ve en
     un prado con viento: se agarran mientras sopla y vuelven a volar en
     cuanto afloja. */
  var VIENTO_VUELA   = 0.70;
  var REFUGIO_ENTRA  = 0.30;   // molestia a la que se va a cubierto
  var REFUGIO_SALE   = 0.12;   // ...y a la que vuelve a salir (histéresis)
  var REFUGIO_RADIO  = 620;    // hasta dónde busca un techo
  var CERDO_RADIO_CHARCO = 1500;      // ...y hasta dónde va un cerdo por barro
  var REACCION_MS    = [400, 4200];   // lo que tarda en darse cuenta

  /* CUÁNTO LE CAMBIA EL DÍA EL AGUA A CADA UNO.

     Ojo con leer esto como "cuánto le fastidia": no es lo mismo. Es cuánto le
     CAMBIA lo que estaba haciendo, y hay quien lo cambia porque le fastidia y
     quien lo cambia porque le encanta. Al cerdo la lluvia le alegra el día y
     aun así el número es alto, porque suelta lo que tuviera entre manos y se
     va derecho al barro. Lo que decide QUÉ hace cada uno es `ANTE_EL_AGUA`;
     esto solo dice CUÁNTO le importa.

       mariposa  1,00  una sola gota pesa como ella; se agarra y no vuela más
       conejo    0,95  es el primero que desaparece, siempre
       ave       0,85  a la rama, y las plumas esponjadas
       serpiente 0,80  de sangre fría: con agua se queda tiesa
       zorro     0,70  se tumba bajo un árbol, no le corre prisa
       cerdo     0,60  suelta lo que sea y se va al primer charco, feliz
       cocodrilo 0,55  no corre a ningún lado, pero se acuesta y no anda más
       vaca      0,50  aguanta el chaparrón de pie, pero deja de pastar

     EL COCODRILO ESTABA EN 0,25 Y ÉSE ERA EL FALLO. Con el umbral de entrada
     en 0,30, ni con el diluvio universal llegaba a reaccionar: seguía paseando
     bajo la tormenta, que es exactamente lo que se reportó. Un cocodrilo no
     busca techo —eso es verdad y por eso su manera es 'acostarse'—, pero
     dejar de andar sí lo hace.

     El topo va aparte y no usa esta tabla: ver `actualizarTopo`. */
  var SENSIBLE_GRUPO = { mariposa: 1.00, ave: 0.85, conejo: 0.95,
                         serpiente: 0.80, tierra: 0.60, topo: 0 };
  var SENSIBLE = { zorro: 0.70, zorra: 0.70, vaca: 0.50,
                   cocodrilo: 0.55, cerdo: 0.60 };

  /* CÓMO se guarece cada uno. */
  var ANTE_EL_AGUA_GRUPO = {
    mariposa: 'agarrarse', ave: 'ramaje', conejo: 'madriguera',
    serpiente: 'techo', tierra: 'techo', topo: 'nada'
  };
  var ANTE_EL_AGUA = { cerdo: 'charco', cocodrilo: 'acostarse', vaca: 'aguantar' };

  function comoSeGuarece(a) {
    return ANTE_EL_AGUA[a.especie] || ANTE_EL_AGUA_GRUPO[a.grupo] || 'techo';
  }

  /* ── LO QUE HACE AHORA MISMO ───────────────────────────────────────────
     Una lectura por fotograma para todos los animales. Preguntárselo a
     gf-clima treinta y una veces por vuelta no cuesta mucho, pero tampoco hace
     falta: el tiempo no cambia entre un bicho y el siguiente. */
  /* TIEMPO_SECO NO SE TOCA NUNCA. Es la respuesta de "aquí no hay clima", y
     tiene que seguir siendo cero pase lo que pase: si se reaprovechara como
     borrador y luego gf-clima desapareciera —al cambiar de mapa, por ejemplo—
     los animales se quedarían creyendo que sigue lloviendo para siempre. El
     borrador de la vía antigua es `tiempoViejo`, que es otro objeto. */
  var TIEMPO_SECO = { activo: false, cargado: false, estacion: 'verano',
                      lluvia: 0, nieve: 0, sol: 0, viento: 0,
                      truenos: false, tormenta: false };
  var tiempoViejo = { activo: false, cargado: false, estacion: 'verano',
                      lluvia: 0, nieve: 0, sol: 0, viento: 0,
                      truenos: false, tormenta: false };
  var tiempoUltimo = TIEMPO_SECO;
  var tiempoSello = -1;

  function tiempo() { return tiempoUltimo; }

  /** Relee el tiempo. Se llama UNA vez por vuelta, desde `actualizar`. */
  function releerTiempo(ahora) {
    if (tiempoSello === ahora) return tiempoUltimo;
    tiempoSello = ahora;
    var C = window.GFClima;
    try {
      if (C && C.ahora) {
        var t = C.ahora();
        tiempoUltimo = t || TIEMPO_SECO;
        return tiempoUltimo;
      }
      /* gf-clima viejo, sin `ahora()`: se apaña con lo que hay. Peor —salta de
         golpe en vez de arreciar— pero funciona, que es lo que importa. */
      if (C && C.estado) {
        var e = C.estado();
        tiempoViejo.activo = !!(e && e.activo);
        tiempoViejo.lluvia = (e && e.activo && e.lluvia) ? (Number(e.lluviaFuerza) || 1) : 0;
        tiempoViejo.nieve  = (e && e.activo && e.nieve)  ? (Number(e.nieveFuerza)  || 1) : 0;
        tiempoViejo.sol    = (e && e.activo && e.soleado) ? (Number(e.soleadoFuerza) || 1) : 0;
        tiempoViejo.truenos  = !!(e && e.activo && e.lluvia && e.truenos);
        tiempoViejo.tormenta = tiempoViejo.truenos && tiempoViejo.lluvia > 0.45;
        tiempoViejo.estacion = (e && e.estacion) || 'verano';
        tiempoViejo.cargado  = !!(e && e.cargado);
        tiempoUltimo = tiempoViejo;
        return tiempoUltimo;
      }
    } catch (x) { /* sin clima, tiempo seco */ }
    tiempoUltimo = TIEMPO_SECO;
    return tiempoUltimo;
  }

  /** Cuánto le fastidia a ESTE bicho el tiempo que hace, de 0 a 1. */
  function molestia(a, t) {
    if (!t || !t.activo) return 0;
    var f = (SENSIBLE[a.especie] != null) ? SENSIBLE[a.especie]
          : (SENSIBLE_GRUPO[a.grupo] != null ? SENSIBLE_GRUPO[a.grupo] : 0.6);
    if (!f) return 0;
    /* La nieve moja bastante menos que la lluvia a igual fuerza. Lo que trae la
       nieve es el frío, y de eso ya se encarga el hielo más abajo. */
    var m = Math.max(t.lluvia, t.nieve * 0.85) * f;
    /* El viento solo cuenta para quien vuela, y a la mariposa la tumba: por
       encima de VIENTO_VUELA no hay ala de mariposa que se sostenga. */
    if (a.grupo === 'mariposa') {
      m = Math.max(m, (t.viento - VIENTO_VUELA) * 2.2);
    } else if (a.grupo === 'ave') {
      m = Math.max(m, (t.viento - VIENTO_VUELA * 1.5) * 0.8);
    }
    // Con truenos todo el mundo se pone más nervioso.
    if (t.tormenta) m *= 1.25;
    return m < 0 ? 0 : (m > 1 ? 1 : m);
  }

  /** ¿Está el suelo mojado o nevado? Lo miran las aves para no bañarse. */
  function sueloMojado(t) {
    return !!(t && t.activo && (t.lluvia > LLUVIA_MOJA || t.nieve > NIEVE_CUAJA));
  }

  /** Lo que frena el barro o la nieve: nadie corre igual sobre ellos. */
  function factorSuelo(t) {
    if (!t || !t.activo) return 1;
    return 1 - Math.min(0.40, t.nieve * 0.38 + t.lluvia * 0.10);
  }

  /* ── DÓNDE HAY TECHO ───────────────────────────────────────────────────
     Bajo las copas y bajo los aleros. Se mide una vez y se guarda, igual que
     los posaderos: un árbol no se mueve de sitio. */
  function refugios(scene) {
    var c = cacheDe(scene);
    if (cacheVale(scene, c) && c.refugios) return c.refugios;

    var out = [];
    var tocones = scene.treeStumps || {};

    function meter(clave, spr, ancho, dy) {
      if (!spr || spr.active === false || typeof spr.x !== 'number') return;
      var b;
      try { b = spr.getBounds(); } catch (e) { return; }
      if (!b || !isFinite(b.centerX) || !b.width) return;
      out.push({ clave: clave, x: b.centerX, jit: b.width * ancho,
                 y: b.bottom + dy,
                 base: (typeof spr.depth === 'number') ? spr.depth : b.bottom });
    }

    var fam = [['sprite_arbolx', 18, 0.50], ['sprite_pinos', 45, 0.34]];
    for (var f = 0; f < fam.length; f++) {
      for (var i = 1; i <= fam[f][1]; i++) {
        var clave = fam[f][0] + i;
        if (tocones[clave]) continue;            // un tocón no tapa de nada
        meter(clave, scene[clave], fam[f][2], -2);
      }
    }
    /* Los aleros. Un animal pegado a la pared de una casa está tan a cubierto
       como bajo un árbol, y repartir los refugios entre el bosque y el pueblo
       evita que se amontonen todos en la misma arboleda. */
    var casas = ['sprite_jj', 'sprite_h', 'sprite_p', 'sprite_casa_npc1xc',
                 'sprite_casa_npc2xc', 'sprite_casa_npc3xc', 'sprite_molino',
                 'sprite_cabaña', 'sprite_casa_comida', 'sprite_casa_comida2'];
    for (var k = 0; k < casas.length; k++) meter(casas[k], scene[casas[k]], 0.75, 8);

    c.refugios = out;
    return out;
  }

  /* Sitio para los tres candidatos más cercanos. Es un array de módulo y no
     uno nuevo en cada llamada: esto se usa justo cuando empieza a llover y
     treinta animales buscan techo casi a la vez. */
  var _cerca3 = [null, null, null];

  /** ¿Cabe el animal bajo esta copa? Devuelve el punto, o null. */
  function huecoBajo(scene, a, r) {
    for (var k = 0; k < 5; k++) {
      var x = r.x + (Math.random() - 0.5) * r.jit;
      var y = r.y + az(-5, 9);
      if (libre(scene, a, x, y)) {
        return { x: x, y: y, clave: r.clave, base: r.base };
      }
    }
    return null;
  }

  /**
   * El techo más cercano donde quepa, o null.
   *
   * Se hace en DOS PASADAS a propósito. La primera solo mide distancias, que
   * es aritmética; la segunda, que es la cara (comprueba colisiones), se hace
   * únicamente sobre los tres más cercanos. Probando el hueco de los 63
   * árboles salían 315 comprobaciones de colisión por animal, y con el prado
   * entero buscando techo casi en el mismo fotograma eso es un tirón que se ve.
   */
  function refugioCerca(st, a, radio) {
    var scene = st.scene;
    var lista = refugios(scene);
    if (!lista.length) return null;
    var d0 = Infinity, d1 = Infinity, d2 = Infinity;
    _cerca3[0] = _cerca3[1] = _cerca3[2] = null;
    for (var i = 0; i < lista.length; i++) {
      var r = lista[i];
      var d = Math.hypot(r.x - a.spr.x, r.y - a.spr.y);
      if (d > radio) continue;
      if (d < d0) {
        d2 = d1; _cerca3[2] = _cerca3[1];
        d1 = d0; _cerca3[1] = _cerca3[0];
        d0 = d;  _cerca3[0] = r;
      } else if (d < d1) {
        d2 = d1; _cerca3[2] = _cerca3[1];
        d1 = d;  _cerca3[1] = r;
      } else if (d < d2) {
        d2 = d;  _cerca3[2] = r;
      }
    }
    for (var j = 0; j < 3; j++) {
      if (!_cerca3[j]) continue;
      var pt = huecoBajo(scene, a, _cerca3[j]);
      if (pt) return pt;
    }
    return null;
  }

  /* ── ACOSTARSE ─────────────────────────────────────────────────────────
     EL ARREGLO DE "EL COCODRILO NO SE ACUESTA".

     No hay ningún `cocodrilo_tumbado.png`, y no lo va a haber: el cocodrilo
     tiene cuatro poses y ninguna es de tumbarse. Pero es que un cocodrilo YA
     está tumbado — mide 70×24 px y está pegado al suelo de perfil. Lo que le
     faltaba no era una pose nueva: era DEJAR DE ANDAR.

     Así que acostarse es quedarse quieto, respirar mucho más despacio
     (`timeScale`) y asentarse sobre la tripa. Lo último se hace achatándolo en
     vertical; como el sprite tiene el origen en los pies (0.5, 1), achatar en
     Y lo baja contra el suelo en vez de encogerlo hacia el centro, que es
     justo lo que hace un bicho al echarse.

     Entra y sale con un fundido porque un animal que se desinfla en un
     fotograma no parece que se acueste, parece que se rompe. */
  var ACHATA = 0.13;          // cuánto se achata como mucho
  var ACHATA_VEL = 2.4;       // por segundo

  function achatar(a, dt) {
    var meta = a.achataMeta || 0;
    var v = a.achata || 0;
    if (v === meta) return;
    if (v < meta) v = Math.min(meta, v + ACHATA_VEL * dt);
    else v = Math.max(meta, v - ACHATA_VEL * dt);
    a.achata = v;
    a.spr.setScale(ESCALA, ESCALA * (1 - ACHATA * v));
  }

  /** Respira más despacio: un bicho en reposo no jadea. */
  function ritmoAnim(a, k) {
    try { if (a.spr.anims) a.spr.anims.timeScale = k; } catch (e) {}
  }

  /* ── EL SOBRESALTO DEL TRUENO ──────────────────────────────────────────
     Retumba y salta todo lo que está a la intemperie. Es la reacción que mejor
     se lee de una tormenta, y era justo la que faltaba: hasta ahora el trueno
     sacudía la cámara y los animales seguían pastando como si nada.

     No salta TODO el mundo. La probabilidad sale del `miedo` de cada uno, que
     es el mismo número que decide a qué distancia huyen; así el manso apenas
     levanta la cabeza y el asustadizo sale disparado, que es lo que pasa. */
  function sobresaltar(st, a, ahora) {
    if (a.muerto || a.congelado) return;
    if (a.enMadriguera) return;                    // metido en casa, ni se entera
    if (a.grupo === 'topo' && (a.fase === 'bajo' || a.fase === 'cava')) return;
    if (a.especie === 'cocodrilo') return;         // a un cocodrilo no le impresiona
    if (a.durmiendo) despertar(st, a);
    if (Math.random() > 0.30 + 0.45 * (a.miedo || 1)) return;

    if (a.grupo === 'mariposa') return;            // agarrada a la hoja, aguanta
    if (a.grupo === 'ave') {
      /* Una bandada saliendo del árbol al tronar es de las cosas más bonitas
         que puede hacer un mapa. Pero no todas a la vez, o se vacían los
         árboles en el primer trueno. */
      if (a.fase === 'volando') return;
      if (Math.random() < 0.5) {
        a.refugio = null; a.aCubierto = false; a.reaccionaEn = 0;
        huirAve(st, a);
      }
      return;
    }
    a.refugio = null;
    a.aCubierto = false;
    a.reaccionaEn = 0;
    a.achataMeta = 0;
    ritmoAnim(a, 1);
    a.fase = 'sobresalto';
    a.rumbo = az(0, Math.PI * 2);
    anim(a, poseAndar(a));
    a.hasta = ahora + az(500, 1400);
  }

  /* ── ENTRAR Y SALIR DEL REFUGIO ────────────────────────────────────────── */

  /** Se planta donde está y se queda a cubierto. */
  function guarecerse(st, a, ahora, pose, lento) {
    a.fase = 'refugio';
    /* `aCubierto` sobrevive al sueño, y `fase` no: al dormirse, `fase` pasa a
       'duerme' y se pierde el dato de si estaba resguardado. Hace falta para
       que el chaparrón levante SOLO al que duerme a la intemperie. */
    a.aCubierto = true;
    a.destino = null;
    anim(a, pose);
    ritmoAnim(a, lento || 1);
    /* Un rato largo: mientras dure el mal tiempo no vuelve a decidir nada, y si
       escampa antes, `actualizarTiempo` lo saca igual. El número solo importa
       para que no se quede clavado si el clima desapareciera de golpe. */
    a.hasta = ahora + az(9000, 22000);
  }

  /** Vuelve a la vida normal. */
  function salirDelRefugio(st, a, ahora) {
    a.refugio = null;
    a.achataMeta = 0;
    a.reaccionaEn = 0;
    a.aCubierto = false;
    ritmoAnim(a, 1);
    if (a.enMadriguera && !a.durmiendo) {
      a.spr.setVisible(true);
      if (a.sombra) a.sombra.setVisible(true);
      a.enMadriguera = false;
    }
    a.fase = 'quieto';
    a.hasta = ahora;                 // que su rutina decida ya
    if (a.grupo === 'ave') {
      /* En las aves `rumbo` es -1 o +1 (a qué lado dan los pasitos), NO un
         ángulo: `decidirTierra` no vale para ellas. Que decida `decidirAve`. */
      a.fase = 'posado';
    } else if (a.grupo === 'mariposa') {
      decidirMariposa(st, a);
    } else if (a.grupo === 'conejo') {
      decidirConejo(st, a);
    } else if (a.grupo !== 'topo') {
      decidirTierra(st, a);
    }
  }

  /** Busca dónde meterse y sale para allá. Devuelve false si no hay dónde. */
  function irseARefugio(st, a, ahora) {
    var scene = st.scene;
    var como = comoSeGuarece(a);
    var i, d;

    if (como === 'acostarse') {
      /* No busca nada: se acuesta donde esté. Es lo que hace un cocodrilo. */
      guarecerse(st, a, ahora, 'quieto', 0.35);
      a.achataMeta = 1;
      return true;
    }

    if (como === 'aguantar') {
      /* La vaca no corre a ningún lado: se queda de pie y deja de pastar. Si
         resulta que hay un árbol a cuatro pasos, entonces sí se acerca — una
         vaca busca el árbol cuando lo tiene al lado, no cuando está lejos. */
      var techoVaca = refugioCerca(st, a, 230);
      if (techoVaca) {
        a.refugio = techoVaca;
        a.fase = 'aRefugio';
        anim(a, poseAndar(a));
        a.hasta = ahora + 14000;
        return true;
      }
      guarecerse(st, a, ahora, 'quieto', 0.6);
      /* De espaldas al agua: se gira a favor del viento, que es justo lo que
         hace el ganado bajo un chaparrón. */
      try {
        var v = { dir: 1, fuerza: 0 };
        if (window.GFViento && window.GFViento.vector) window.GFViento.vector(v);
        if (v.fuerza > 0.2) a.spr.setFlipX(v.dir > 0);
      } catch (e) {}
      return true;
    }

    if (como === 'charco') {
      /* AL CERDO LE GUSTA. No se refugia: se va derecho al primer charco y se
         revuelca. Es el único animal del mapa al que la lluvia le MEJORA el
         día, y verlo cruzar el prado hacia el barro mientras los demás corren
         a esconderse es la mitad de la gracia. */
      var ch = null;
      try {
        if (window.GFClima && window.GFClima.charcos) {
          var lista = window.GFClima.charcos(scene);
          /* Y va a por él LEJOS. El radio es el doble largo que el de buscar
             techo: un cerdo cruza el prado entero por un buen charco, y ver
             cómo lo cruza es justo la gracia. */
          var mejorD = CERDO_RADIO_CHARCO;
          for (i = 0; i < lista.length; i++) {
            d = Math.hypot(lista[i].x - a.spr.x, lista[i].y - a.spr.y);
            if (d < mejorD && libre(scene, a, lista[i].x, lista[i].y)) {
              mejorD = d; ch = lista[i];
            }
          }
        }
      } catch (e) {}
      if (ch) {
        a.refugio = { x: ch.x, y: ch.y, clave: null, base: null };
        a.fase = 'aRefugio';
        anim(a, poseAndar(a));
        a.hasta = ahora + 22000;
        return true;
      }
      /* Ni un charco a tiro (o todavía no se han formado). Tampoco se va a
         cubierto: hoza en la tierra mojada ahí mismo, que se ablanda con el
         agua y es la otra mitad de lo que hace un cerdo cuando llueve. Y
         vuelve a mirar dentro de un rato, por si aparece charco. */
      guarecerse(st, a, ahora, sabeComer(a) ? 'come' : 'quieto', 0.9);
      a.reaccionaEn = 0;
      a.sacudeEn = ahora + az(4000, 9000);
      return true;
    }

    if (como === 'madriguera') {
      if (a.casa) {
        if (enCasa(a)) {
          a.enMadriguera = meterseEnMadriguera(st, a);
          guarecerse(st, a, ahora, 'quieto', 0.6);
          return true;
        }
        a.refugio = { x: a.casa.x, y: a.casa.y, clave: null, base: null, casa: true };
        a.fase = 'aRefugio';
        anim(a, 'corre');            // a la madriguera se vuelve corriendo
        a.hasta = ahora + 14000;
        return true;
      }
      /* Sin casa todavía: la cava AHORA. Es exactamente lo que hace un conejo
         al que le pilla el agua fuera. */
      a.refugio = null;
      a.fase = 'cava';
      anim(a, 'cava');
      a.hasta = ahora + CONEJO_CAVA_MS;
      return true;
    }

    if (como === 'agarrarse') {
      /* La mariposa NO busca sitio bonito: se agarra a lo primero que pilla.
         Con lluvia no hay tiempo de cruzar el prado buscando la mejor flor. */
      if (a.fase === 'posada' && a.soporte) {
        guarecerse(st, a, ahora, 'posa', 0.35);
        a.spr.setDepth((a.baseSoporte || a.spr.y) + 2);
        return true;
      }
      var flores = floresYPiedras(scene);
      var mej = null, mejD = Infinity;
      for (i = 0; i < flores.length; i++) {
        d = Math.hypot(flores[i].x - a.spr.x, flores[i].y - a.spr.y);
        if (d < mejD) { mejD = d; mej = flores[i]; }
      }
      if (!mej) { a.reaccionaEn = ahora + 3000; return false; }
      var pf = puntoFlor(mej);
      a.refugio = { x: pf.x, y: pf.y, clave: pf.clave, base: pf.base };
      a.soporte = pf.clave;
      a.baseSoporte = pf.base;
      a.destino = { x: pf.x, y: pf.y };
      a.fase = 'aRefugio';
      anim(a, 'vuela');
      a.hasta = ahora + 12000;
      return true;
    }

    if (como === 'ramaje') {
      /* El ave se mete en la RAMA, que es lo único que tapa de verdad. Se coge
         el árbol más cercano aunque no sea el mejor: bajo el agua no se cruza
         medio mapa. */
      var sitios = posaderos(scene);
      if (!sitios.length) {
        var abajo = refugioCerca(st, a, REFUGIO_RADIO);
        if (!abajo) { a.reaccionaEn = ahora + 4000; return false; }
        a.refugio = abajo;
        volarA(st, a, { x: abajo.x, y: abajo.y }, 'refugio', null);
        return true;
      }
      var mejorS = null, mejorSD = Infinity;
      for (i = 0; i < sitios.length; i++) {
        /* Un árbol tapa; un poste y un tejado, mucho menos. Se penaliza la
           distancia de lo que no es árbol para que, a igualdad, se vayan al
           bosque. */
        var pen = esArbol(sitios[i].clave) ? 1 : 2.1;
        d = Math.hypot(sitios[i].x - a.spr.x, sitios[i].y - a.spr.y) * pen;
        if (d < mejorSD) { mejorSD = d; mejorS = sitios[i]; }
      }
      var pp = puntoPosadero(mejorS);
      a.refugio = pp;
      volarA(st, a, { x: pp.x, y: pp.y }, 'refugio', pp.clave);
      return true;
    }

    // 'techo': los de tierra y las serpientes, bajo una copa.
    var techo = refugioCerca(st, a, REFUGIO_RADIO);
    if (!techo) {
      /* Ni un árbol a tiro. Se para donde esté, que sigue siendo mejor que
         pasear bajo el agua como si no lloviera. */
      guarecerse(st, a, ahora, sabeTumbarse(a) ? 'tumbado' : 'quieto', 0.6);
      if (!sabeTumbarse(a)) a.achataMeta = 0.6;
      return true;
    }
    a.refugio = techo;
    a.fase = 'aRefugio';
    anim(a, poseAndar(a));
    a.hasta = ahora + 15000;
    return true;
  }

  /** Ha llegado a donde iba: se acomoda. */
  function acomodarse(st, a, ahora) {
    var como = comoSeGuarece(a);
    if (como === 'madriguera') {
      if (a.refugio && a.refugio.casa) a.enMadriguera = meterseEnMadriguera(st, a);
      guarecerse(st, a, ahora, 'quieto', 0.6);
      return;
    }
    if (como === 'charco') {
      /* Revolcándose: la pose de comer es la de hocicar, que es exactamente lo
         que hace un cerdo metido en un charco. */
      guarecerse(st, a, ahora, sabeComer(a) ? 'come' : 'quieto', 0.8);
      a.achataMeta = 0.5;
      return;
    }
    if (como === 'agarrarse') {
      guarecerse(st, a, ahora, 'posa', 0.35);
      a.spr.setDepth((a.baseSoporte || a.spr.y) + 2);
      return;
    }
    // zorros tumbados, serpientes enroscadas, vacas y demás, quietos
    guarecerse(st, a, ahora, sabeTumbarse(a) ? 'tumbado' : 'quieto', 0.5);
    if (!sabeTumbarse(a)) a.achataMeta = 0.55;
  }

  /**
   * UN FOTOGRAMA DE "QUÉ HACE ESTE BICHO CON EL TIEMPO QUE HACE".
   *
   * @returns {boolean} true si ya se ha ocupado de él y la rutina normal no
   *          tiene que tocarlo en este fotograma.
   */
  function actualizarTiempo(st, a, ahora, dt) {
    var scene = st.scene;
    var t = tiempo();

    // ── 1. el sobresalto manda sobre todo ────────────────────────────────
    if (st.trueno && a.truenoVisto !== st.trueno) {
      a.truenoVisto = st.trueno;
      sobresaltar(st, a, ahora);
    }
    if (a.fase === 'sobresalto') {
      if (ahora < a.hasta) { moverTierra(st, a, dt, true); return true; }
      a.fase = 'quieto';
      a.hasta = ahora;               // que decida su rutina
      return false;
    }

    // El topo tiene su propio trato con la lluvia: ver `actualizarTopo`.
    if (a.grupo === 'topo') return false;

    var m = molestia(a, t);
    var refugiado = (a.fase === 'refugio' || a.fase === 'aRefugio');

    // ── 2. escampó: todo el mundo fuera ──────────────────────────────────
    if (m <= REFUGIO_SALE) {
      if (refugiado) salirDelRefugio(st, a, ahora);
      else if (a.reaccionaEn) a.reaccionaEn = 0;
      /* El que se durmió a cubierto no pasa por `salirDelRefugio` —está en
         fase 'duerme'— y se quedaría con la marca puesta para siempre. Sin
         quitársela, `aLaIntemperie` diría que sigue resguardado y el próximo
         chaparrón ya no lo levantaría nunca. */
      else if (a.aCubierto) { a.aCubierto = false; a.refugio = null; }
      return false;
    }

    /* Pelear y huir van POR DELANTE del tiempo. Que llueva no es motivo para
       dejarse morder, ni para que un cocodrilo deje pasar al jugador por
       delante del morro. */
    if (a.fase === 'huye' || a.fase === 'persigue' || a.fase === 'ataca' ||
        a.fase === 'retirada') {
      return false;
    }

    if (refugiado) {
      var p = scene.player;
      // Un bicho a cubierto sigue teniendo ojos.
      if (a.ficha.huye > 0 && p && !jugadorFantasma() &&
          Math.hypot(a.spr.x - p.x, a.spr.y - p.y) < a.ficha.huye * a.miedo * 0.8) {
        salirDelRefugio(st, a, ahora);
        if (a.grupo === 'ave') huirAve(st, a);
        else if (a.grupo !== 'mariposa') huirDe(st, a, p.x, p.y);
        return false;
      }
      if (a.ficha.agresivo) {
        var obj = objetivoDe(scene);
        if (obj && Math.hypot(a.spr.x - obj.x, a.spr.y - obj.y) <= a.ficha.vista) {
          salirDelRefugio(st, a, ahora);
          return false;
        }
      }
    }

    // ── 3. ya está a cubierto: se queda ──────────────────────────────────
    if (a.fase === 'refugio') {
      // Si le talan el árbol bajo el que se guarece, a buscar otro.
      if (a.refugio && a.refugio.clave && !sitioEnPie(scene, a.refugio.clave)) {
        salirDelRefugio(st, a, ahora);
        return false;
      }
      /* De vez en cuando se sacude el agua: se le sube un momento el ritmo de
         la animación. Un bicho absolutamente inmóvil durante dos minutos se lee
         como colgado, no como resguardado. */
      if (ahora >= (a.sacudeEn || 0)) {
        a.sacudeEn = ahora + az(4000, 12000);
        a.sacudeHasta = ahora + az(400, 900);
      }
      ritmoAnim(a, ahora < (a.sacudeHasta || 0) ? 2.2 : 0.45);
      if (ahora >= a.hasta) a.hasta = ahora + az(9000, 22000);
      return true;
    }

    // ── 4. yendo a cubierto ──────────────────────────────────────────────
    if (a.fase === 'aRefugio') {
      var r = a.refugio;
      if (!r) { a.fase = 'quieto'; a.hasta = ahora; return false; }
      var dx = r.x - a.spr.x, dy = r.y - a.spr.y;
      var dist = Math.hypot(dx, dy);
      /* LA MARIPOSA VUELA, NO ANDA.

         `moverTierraA` comprueba colisiones y una mariposa pasa por encima de
         todo — con él se quedaría atascada contra el primer arbusto que
         tuviera entre ella y la flor. Y encima, con lluvia va a trompicones y
         más despacio, que es lo que se ve: un ala mojada no manda igual. */
      if (a.grupo === 'mariposa') {
        var vm = a.ficha.vel * (0.55 + 0.25 * (1 - Math.min(1, t.lluvia)));
        var pm = vm * dt;
        if (dist < 5 || pm >= dist) {
          a.spr.setPosition(r.x, r.y);
          acomodarse(st, a, ahora);
          return true;
        }
        a.vaiven = (a.vaiven || 0) + dt * 9;
        var nx = -dy / dist, ny = dx / dist;
        var lat = Math.sin(a.vaiven) * 30 * dt;
        var limM = limites(scene);
        a.spr.x = Math.min(limM.w - 20, Math.max(20, a.spr.x + (dx / dist) * pm + nx * lat));
        a.spr.y = Math.min(limM.h - 20, Math.max(20, a.spr.y + (dy / dist) * pm + ny * lat));
        a.spr.setDepth(a.spr.y + 40);
        return true;
      }
      var vel = (a.ficha.corre || a.ficha.vel * 2) * factorSuelo(t);
      var paso = vel * dt;
      /* El `paso >= dist` es el mismo arreglo que ya lleva el vuelo de las
         aves: lejos de la cámara se actualiza a 5 Hz y con dt de 0,2 s el paso
         se pasa de largo del destino. Sin esto el bicho orbitaría el árbol
         para siempre sin llegar nunca. */
      if (dist < 8 || paso >= dist || ahora >= a.hasta) {
        if (dist < 60) {
          a.spr.setPosition(r.x, r.y);
          a.spr.setDepth(r.y);
        }
        acomodarse(st, a, ahora);
        return true;
      }
      a.rumbo = Math.atan2(dy, dx);
      moverTierraA(st, a, dt, vel);
      a.spr.setFlipX(dx < 0);
      return true;
    }

    // ── 5. ¿se va a cubierto ya? ─────────────────────────────────────────
    if (m < REFUGIO_ENTRA) return false;

    /* YA ESTÁ EN ELLO: NO SE LE VUELVE A MANDAR.

       Dos fases no se llaman 'aRefugio' y aun así SON ir a cubierto. Sin este
       cierre, el paso 5 las volvía a lanzar desde cero cada vez que se le
       cumplía el retraso de reacción:

       · EL AVE VOLANDO A SU RAMA. Se le vuelve a elegir posadero cada segundo
         escaso. No llega a romperse —el más cercano sigue siendo el mismo—
         pero es trabajo tirado en cada vuelta.

       · EL CONEJO CAVANDO. Un conejo sin casa al que le pilla el agua se pone
         a cavar una (`fase = 'cava'`, 1400 ms). Quien cuenta ese rato y abre
         la madriguera al terminar es `actualizarConejo`. Pero el retraso de
         reacción de un conejo bajo un chaparrón se sortea entre 180 y 1890 ms,
         o sea que MÁS DE LA MITAD DE LAS VECES se cumple antes de que acabe de
         cavar; y al cumplirse se vuelve a entrar aquí, se ve que sigue sin
         casa y se le reinicia el reloj desde el principio.

         No es un cuelgue —acaba saliendo en cuanto le toca un retraso largo—
         pero se ve: el conejo empieza a escarbar, vuelve a empezar, y vuelve a
         empezar. Medido con ocho conejos, la animación se reiniciaba 10 veces
         y abrir la madriguera pasaba de 2,1 a 3,2 segundos de media. Con el
         cierre puesto: cero reinicios. */
    if (a.fase === 'cava') return false;
    if (a.fase === 'volando' && a.alFinal === 'refugio') return false;
    /* No todos a la vez. Cada bicho tarda lo suyo en darse cuenta de que está
       lloviendo, y eso es lo que hace que el prado se vacíe POCO A POCO en vez
       de de golpe, que es lo que se ve de verdad. */
    if (!a.reaccionaEn) {
      a.reaccionaEn = ahora + az(REACCION_MS[0], REACCION_MS[1]) *
                              (1.4 - Math.min(1, m));    // si arrecia, antes
      return false;
    }
    if (ahora < a.reaccionaEn) return false;
    a.reaccionaEn = 0;
    return irseARefugio(st, a, ahora);
  }


  /* ══════════════════════════════════════════════════════════════════════
     ANIMALES CONGELADOS
     ──────────────────────────────────────────────────────────────────────
     Cuando nieva de verdad, de vez en cuando un bicho se queda tieso: se para,
     se le pone el pelaje escarchado y le sale un bloque de hielo alrededor.
     Al rato se descongela y sigue a lo suyo. No muere ni pierde vida — es un
     detalle del mundo, no una mecánica.

     A QUIÉN: solo a los de tierra (zorros, cocodrilo, cerdos, serpientes…).
     Un pájaro se va volando y una mariposa con nieve no está fuera; helar a
     los que están posados sería castigar al que no puede huir.

     EL HIELO NO ES UNA IMAGEN NUEVA: se dibuja con canvas al arrancar. Añadir
     un PNG obliga a subirlo al servidor, y ya se ha visto lo que pasa cuando
     falta uno (el clima entero se quedó sin montar por catorce que no estaban).
     Lo que se dibuja solo, no se puede olvidar de subir.                    */

  var CONGELA_MIRA    = 4000;        // cada cuánto se sortea, por animal
  var CONGELA_PROB    = 0.045;       // probabilidad en cada sorteo, a nieve tope
  var CONGELA_DURA    = [7000, 18000];
  var CONGELA_TINTE   = 0xbfe4ff;
  /* Los grupos que existen son: ave, conejo, mariposa, serpiente, tierra y
     topo. El cocodrilo, los zorros, la vaca y los cerdos son 'tierra'. Se dejan
     fuera las aves y las mariposas (se van volando), y el topo, que vive bajo
     tierra y no se ve. */
  var CONGELA_GRUPOS  = { tierra: 1, conejo: 1, serpiente: 1 };
  var CLAVE_HIELO     = 'gfa_hielo';

  /**
   * Cuánta nieve cae ahora mismo, de 0 a 1.
   *
   * EL FALLO QUE ARREGLA: esto leía `GFClima.estado()`, que es lo que MANDA el
   * servidor, no lo que se ve. La nieve tarda cinco segundos en arreciar
   * (ENTRA_MS), así que los animales se congelaban con el cielo todavía
   * despejado y se descongelaban de golpe en cuanto el panel apagaba la nieve,
   * con el mundo aún blanco. Ahora se pregunta por la fuerza ya interpolada,
   * que es la misma que se está pintando.
   */
  function nieveAhora() {
    var t = tiempo();
    return (t && t.activo) ? Math.max(0, Math.min(1, t.nieve || 0)) : 0;
  }

  /**
   * El bloque de hielo, dibujado una vez con canvas.
   *
   * Un rectángulo redondeado de hielo con brillo arriba a la izquierda —de
   * donde viene la luz en este juego, igual que las sombras— y el borde más
   * claro. Se estira luego al tamaño de cada bicho.
   */
  function texturaHielo(scene) {
    if (scene.textures.exists(CLAVE_HIELO)) return CLAVE_HIELO;
    var W = 64, H = 64;
    try {
      var cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      var c = cv.getContext('2d');
      if (!c) return null;

      // Cuerpo: azul muy claro, más denso por abajo (el hielo se acumula).
      var g = c.createLinearGradient(0, 0, W * 0.6, H);
      g.addColorStop(0,    'rgba(226,246,255,0.62)');
      g.addColorStop(0.55, 'rgba(176,222,248,0.50)');
      g.addColorStop(1,    'rgba(140,196,232,0.66)');
      c.fillStyle = g;
      redondeado(c, 3, 3, W - 6, H - 6, 10);
      c.fill();

      // Borde helado
      c.strokeStyle = 'rgba(240,252,255,0.85)';
      c.lineWidth = 2;
      redondeado(c, 3, 3, W - 6, H - 6, 10);
      c.stroke();

      // Brillo arriba a la izquierda: es lo que lo hace leer como HIELO y no
      // como una mancha azul.
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.beginPath();
      c.moveTo(11, 9); c.lineTo(25, 9); c.lineTo(15, 30); c.lineTo(8, 30);
      c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.32)';
      c.beginPath();
      c.moveTo(31, 11); c.lineTo(37, 11); c.lineTo(27, 27); c.lineTo(22, 27);
      c.closePath(); c.fill();

      scene.textures.addCanvas(CLAVE_HIELO, cv);
      return CLAVE_HIELO;
    } catch (e) { return null; }
  }

  /** Rectángulo con las esquinas redondeadas, que canvas no trae en todos lados. */
  function redondeado(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  function congelar(st, a, ahora) {
    if (a.congelado || a.muerto || a.durmiendo) return;
    var clave = texturaHielo(st.scene);
    if (!clave) return;
    a.congelado = true;
    a.hieloDesde = ahora;
    a.deshielaEn = ahora + az(CONGELA_DURA[0], CONGELA_DURA[1]);
    a.faseAntesHielo = a.fase;
    try { if (a.spr.anims) a.spr.anims.pause(); } catch (e) {}
    a.spr.setTint(CONGELA_TINTE);

    var w = (a.spr.displayWidth || 20) * 1.35;
    var h = (a.spr.displayHeight || 20) * 1.2;
    a.hielo = st.scene.add.image(a.spr.x, a.spr.y, clave);
    a.hielo.setOrigin(0.5, 1);
    a.hielo.setDisplaySize(w, h);
    a.hielo.setDepth(a.spr.depth + 1);
    a.hielo.setAlpha(0);
    log(st.scene, a.especie, 'se ha quedado congelado');
  }

  function descongelar(a) {
    if (!a.congelado) return;
    a.congelado = false;
    a.deshielaEn = 0;
    try { if (a.spr.anims) a.spr.anims.resume(); } catch (e) {}
    if (a.spr.clearTint) a.spr.clearTint();
    if (a.hielo) { a.hielo.destroy(); a.hielo = null; }
  }

  /**
   * ¿Está helado? Devuelve true si este animal no tiene que hacer nada más
   * este frame.
   */
  function actualizarHielo(st, a, ahora) {
    var nieve = nieveAhora();

    if (a.congelado) {
      // Se descongela por tiempo, o en cuanto deja de nevar.
      if (ahora >= a.deshielaEn || nieve <= 0.02) { descongelar(a); return false; }
      if (a.hielo) {
        a.hielo.setPosition(a.spr.x, a.spr.y + 2);
        a.hielo.setDepth(a.spr.depth + 1);
        /* Entra y sale con un fundido, y tiembla un pelín: un bloque de hielo
           que aparece de golpe parece un fallo de dibujo. */
        var queda = a.deshielaEn - ahora;
        /* Entra y sale con un fundido de 600 ms. Se mide contra el instante en
           que se congeló, no contra la duración máxima: la duración es al azar
           y con la máxima el fundido de entrada salía mal en los hielos cortos. */
        var f = Math.min(1, Math.min(ahora - a.hieloDesde, queda) / 600);
        a.hielo.setAlpha(Math.max(0.25, Math.min(0.9, f)));
        a.hielo.setVisible(a.spr.visible !== false);
      }
      return true;                       // ni se mueve, ni huye, ni ataca
    }

    if (nieve <= 0.05) return false;
    if (!CONGELA_GRUPOS[a.grupo]) return false;   // aves y mariposas, no
    if (a.durmiendo || a.muerto) return false;

    if (!a.proximoHielo) { a.proximoHielo = ahora + az(CONGELA_MIRA, CONGELA_MIRA * 2.5); }
    if (ahora < a.proximoHielo) return false;
    a.proximoHielo = ahora + az(CONGELA_MIRA, CONGELA_MIRA * 2.5);
    if (Math.random() < CONGELA_PROB * nieve) congelar(st, a, ahora);
    return !!a.congelado;
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
      lento: 0,
      /* El tiempo. Se dejan puestos desde el principio y no `undefined`: así
         `salirDelRefugio` y compañía no tienen que preguntar si existen. */
      refugio: null, reaccionaEn: 0, aCubierto: false,
      achata: 0, achataMeta: 0, truenoVisto: 0,
      sacudeEn: 0, sacudeHasta: 0, pruebaSuenio: 0,
      // La pareja de las aves; se apuntan la una a la otra al irse juntas.
      pareja: null, mirarA: null
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
    } else if (f.grupo === 'conejo') {
      a.fase = 'pasea';
      a.rumbo = az(0, Math.PI * 2);
      anim(a, 'camina');
      a.hasta = scene.time.now + az(500, 3000);
      a.casa = null;
      a.madriguera = null;
      a.llevando = false;
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
    var t = tiempo();
    var r = Math.random();
    /* EL SOL PESA.

       Un cocodrilo al sol no pasea: se tuesta. Una serpiente, igual — son de
       sangre fría y el sol es su motor, así que se pasan las horas de luz
       quietas al descubierto. Y los de sangre caliente, al revés: con el sol
       alto se echan y se mueven menos.

       Se hace empujando `r` HACIA ARRIBA, que es donde están 'tumbado',
       'come' y 'quieto'. Los reptiles se empujan más que el resto.

       PERO NO HASTA CLAVARLOS. El empujón de los reptiles estaba en 0,55, y
       con eso `r` salía siempre por encima de 0,55 — o sea que NUNCA podían
       coger el camino de pasear. Medido en la simulación: a pleno sol, los
       cocodrilos y las serpientes recorrían CERO píxeles en diez minutos. Eso
       no se lee como un bicho tostándose, se lee como un bicho colgado. Con
       0,35 les queda cerca de un tercio de probabilidad de levantarse a dar
       una vuelta, que sigue siendo mucho menos que sin sol y sí se mueven. */
    if (t.activo && t.sol > 0.25) {
      var tuesta = t.sol * (esReptil(a) ? 0.35 : 0.22);
      r = r * (1 - tuesta) + tuesta;
    }
    if (r < 0.55) {
      a.fase = 'pasea';
      a.rumbo = az(0, Math.PI * 2);
      anim(a, poseAndar(a));
    } else if (r < 0.73 && sabeTumbarse(a)) {
      // Descansa tumbado. NO duerme: el jugador lo pidió así, y por eso el
      // sprite tiene el ojo abierto y las orejas de pie.
      a.fase = 'tumbado';
      anim(a, 'tumbado');
      a.hasta = st.scene.time.now + az(6000, 16000) * quietudDelSol(a, t);
      return;
    } else if (r < 0.80 && sabeComer(a)) {
      a.fase = 'come';
      anim(a, 'come');
    } else {
      a.fase = 'quieto';
      anim(a, 'quieto');
    }
    /* El sol alarga lo que se está QUIETO, no lo que se anda.

       Puesto también sobre el paseo, un cocodrilo que decidía moverse se
       echaba una caminata de más de un minuto seguido: el sol le multiplicaba
       por 2,6 el rato de CADA fase, andar incluido. Lo que hace el calor es
       que salgas menos, no que cuando salgas andes más. */
    var espera = az(ESPERA_TIERRA[0], ESPERA_TIERRA[1]);
    if (a.fase !== 'pasea') espera *= quietudDelSol(a, t);
    a.hasta = st.scene.time.now + espera;
  }

  /** De sangre fría: el sol les manda mucho más que a los demás. */
  function esReptil(a) {
    return a.grupo === 'serpiente' || a.especie === 'cocodrilo';
  }

  /** Cuánto más aguanta sin moverse por el sol que hace. */
  function quietudDelSol(a, t) {
    if (!t || !t.activo || t.sol <= 0.05) return 1;
    return 1 + t.sol * (esReptil(a) ? 1.6 : 0.45);
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
    var v = corriendo ? (a.ficha.corre || a.ficha.vel * 2) : a.ficha.vel;
    /* El barro y la nieve frenan. No es un adorno: es lo que hace que un
       chaparrón se NOTE aunque el bicho no se haya ido a cubierto todavía. */
    return moverTierraA(st, a, dt, v * factorSuelo(tiempo()));
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
      /* 'refugio' cuenta igual que 'posado': el ave que espera a que escampe
         está en la misma rama y tiene que mecerse con ella. Sin esto se
         quedaba clavada en el aire justo cuando más se menea el árbol, que es
         cuando hay tormenta. */
      if (a.fase !== 'posado' && a.fase !== 'refugio' &&
          !(a.durmiendo && a.grupo === 'ave')) continue;
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

    // Se rompe la pareja POR LOS DOS LADOS. Ver `desemparejar`.
    desemparejar(a);

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

    /* ── BAÑARSE EN UN CHARCO RECIÉN LLOVIDO ──────────────────────────────
       Cuando escampa, el suelo se queda lleno de charcos y los pájaros bajan
       a bañarse en ellos. Es lo primero que hace un gorrión de verdad después
       de un chaparrón, y en el juego llega justo cuando el mapa se ha quedado
       en silencio, así que se nota.

       Va ANTES que la fuente y con más probabilidad porque es lo excepcional:
       la fuente está siempre y los charcos duran un rato. `GFClima.charcos()`
       ya devuelve solo los que están crecidos y sin helar — en un charco
       congelado no se baña nadie. */
    /* PERO NO MIENTRAS LLUEVE.

       EL FALLO QUE ARREGLA — "los pájaros se siguen bañando en la fuente":
       aquí no se miraba el tiempo, así que en mitad de un chaparrón los
       pájaros bajaban al pozo a darse un baño. Un pájaro empapado no se baña;
       lo que hace un pájaro bajo la lluvia es meterse debajo de algo.

       Bañarse es lo que se hace CUANDO ESCAMPA, y por eso los charcos —que
       duran un rato después— siguen valiendo: es justo el premio de haber
       esperado. */
    var mojado = sueloMojado(tiempo());

    if (!mojado && r < 0.30) {
      var ch = charcoParaBanarse(scene, p, a);
      if (ch) {
        a.fuente = null;                 // charco: no hay que ponerse delante de nada
        volarA(st, a, { x: ch.x, y: ch.y }, 'bana', null);
        return;
      }
    }

    // ── BAÑARSE EN LA FUENTE ───────────────────────────────────────────────
    if (!mojado && r < 0.38) {
      var f = fuenteDe(scene);
      if (f && (!p || Math.hypot(f.x - p.x, f.y - p.y) > a.ficha.huye * 1.3)) {
        // Se apunta EN QUE fuente se va a bañar: al llegar hace falta para
        // ponerse por delante de ella (ver el aterrizaje en 'bana').
        a.fuente = f.clave;
        volarA(st, a, { x: f.x, y: f.y }, 'bana', null);
        return;
      }
    }

    // ── IRSE CON OTRA DE SU ESPECIE ────────────────────────────────────────
    if (r < 0.30 && sitios.length) {
      var otra = companiaDe(st, a);
      if (otra) {
        var juntas = puntoPosadero(elegir(lejosDe(sitios, p ? p.x : null,
                                    p ? p.y : null, a.ficha.posado * 1.6)));
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
      var s2 = puntoPosadero(elegir(cerca.length ? cerca : cand));
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
    var pt = puntoPosadero(mejor);
    volarA(st, a, { x: pt.x, y: pt.y }, 'posado', pt.clave);
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
        if (a.alFinal === 'posado' || a.alFinal === 'refugio') {
          posarse(st, a, { clave: a.soporte, x: a.destino.x, y: a.destino.y,
                           base: null });
          /* Venía huyendo del agua: se queda ahí hasta que escampe, en vez de
             volver a la ruleta de "y ahora qué hago". */
          if (a.alFinal === 'refugio') acomodarse(st, a, ahora);
        } else {
          a.fase = a.alFinal;
          a.soporte = null;
          spr.setPosition(a.destino.x, a.destino.y);
          /* EL AVE QUE SE BANA VA POR DELANTE DE LA FUENTE.

             El agua de un pozo esta MUY por encima de su linea de suelo, asi
             que con la profundidad normal (= su Y) el pajaro quedaba DETRAS
             del brocal y no se veia ni un pluma: se oia el chapoteo y no habia
             pajaro. Se le da la profundidad de la fuente + 2, igual que se
             hace con un ave posada en una rama. */
          var prof = a.destino.y;
          if (a.alFinal === 'bana' && a.fuente) {
            var fte = scene[a.fuente];
            if (fte && typeof fte.depth === 'number') prof = fte.depth + 2;
          }
          spr.setDepth(prof);
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

  /* CÓMO ES LA SOMBRA DE CADA CLASE DE BICHO.

     DOS FALLOS QUE ARREGLA:

     1. LA SERPIENTE PARECÍA VOLAR. La sombra salía de la HUELLA de colisión,
        centrada en spr.y — que con origen (0.5, 1) es el borde de abajo del
        sprite. En un animal alto eso queda medio debajo de las patas y cuela;
        en una serpiente, que es plana y ya está tumbada en el suelo, la elipse
        asomaba por detrás del cuerpo y se leía como que el bicho iba por el
        aire, con su sombra proyectada abajo.

     2. LA DE LA VACA ERA DIMINUTA. La huella de la vaca son 34 px, pero el
        sprite mide bastante más: la sombra salía como un tercio del animal y
        parecía una piedrecita a sus pies.

     Ahora la sombra se saca del ANCHO DIBUJADO del sprite, que es lo que se ve,
     y cada grupo lleva su proporción: los que están tumbados en el suelo la
     llevan estrecha, pegada y muy tenue, porque un cuerpo que toca el suelo
     apenas proyecta sombra aparte. */
  var SOMBRA_POR_GRUPO = {
    serpiente: { ancho: 0.72, alto: 0.13, dy: -1, alfa: 0.45 },
    tierra:    { ancho: 0.80, alto: 0.26, dy: -1, alfa: 1.00 },
    topo:      { ancho: 0.72, alto: 0.24, dy: -1, alfa: 0.85 },
    ave:       { ancho: 0.70, alto: 0.30, dy:  0, alfa: 0.90 },
    mariposa:  { ancho: 0.60, alto: 0.35, dy:  0, alfa: 0.60 }
  };
  // El cocodrilo es de tierra pero está tan tumbado como una serpiente.
  var SOMBRA_POR_ESPECIE = { cocodrilo: SOMBRA_POR_GRUPO.serpiente };

  function fichaSombra(a) {
    return SOMBRA_POR_ESPECIE[a.especie] ||
           SOMBRA_POR_GRUPO[a.grupo] || SOMBRA_POR_GRUPO.tierra;
  }

  /** El ancho de la sombra, sacado de lo que MIDE el sprite en pantalla. */
  function anchoSombra(a) {
    var f = fichaSombra(a);
    var w = a.spr.displayWidth || (a.hw * 2) || 20;
    return Math.max(10, w * f.ancho);
  }

  function crearSombra(st, a) {
    var scene = st.scene;
    if (a.sombra || !scene.add.ellipse) return;
    var f = fichaSombra(a);
    var ancho = anchoSombra(a);
    /* Relleno a tope y la opacidad con setAlpha.

       El ultimo argumento de add.ellipse es el fillAlpha, no el alpha del
       objeto, y Phaser dibuja con fillAlpha x alpha. Naciendo con 0,26 y
       poniendole ademas setAlpha(0,26) en cada frame, la sombra se pintaba a
       0,07: cuatro veces mas clara de lo que dice SOMBRA_ALFA. */
    a.sombra = scene.add.ellipse(a.spr.x, a.spr.y + f.dy, ancho, ancho * f.alto,
                                 0x000000, 1);
    a.sombra.setAlpha(SOMBRA_ALFA * f.alfa);
    // Justo por DEBAJO del animal: si fuera por encima, se le vería una mancha
    // oscura encima del lomo.
    a.sombra.setDepth(a.spr.y - 1);
    a.sombraSuelo = a.spr.y;
  }

  function actualizarSombra(a) {
    if (!a.sombra || a.muerto) return;

    /* BAÑÁNDOSE NO HAY SOMBRA EN EL SUELO.

       El ave está metida en el agua, a media altura del pozo. Su sombra, que
       va a la profundidad de su Y, quedaría DETRÁS del brocal y encima no
       significa nada: la sombra sirve para anclar al bicho al suelo, y aquí no
       hay suelo debajo, hay agua. Se apaga mientras dura el baño y vuelve sola
       en cuanto el pájaro sale volando. */
    if (a.fase === 'bana') { a.sombra.setVisible(false); return; }
    if (!a.sombra.visible) a.sombra.setVisible(true);

    var volando = (a.fase === 'volando');
    if (!volando) a.sombraSuelo = a.spr.y;    // recuerda dónde está el suelo

    /* Volando, la sombra se queda ABAJO y se hace pequeña y tenue: es lo que da
       la sensación de altura. Si subiera con el pájaro, la sombra iría por el
       aire y no significaría nada. */
    var f = fichaSombra(a);
    var y = volando ? a.sombraSuelo : (a.spr.y + f.dy);
    a.sombra.setPosition(a.spr.x, y);
    a.sombra.setDepth(y - 1);
    a.sombra.setAlpha(SOMBRA_ALFA * f.alfa * (volando ? 0.45 : 1));
    /* El ancho se rehace por si el sprite cambió de pose: el cocodrilo abriendo
       la boca o la serpiente estirada no miden lo mismo que quietos, y una
       sombra que no acompaña al cuerpo se nota enseguida. */
    if (!volando && a.sombra.setSize) {
      var an = anchoSombra(a);
      if (Math.abs(an - a.sombra.width) > 1.5) a.sombra.setSize(an, an * f.alto);
    }
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

    /* SE MUERE DEL TODO, NO A MEDIAS.

       TRES FALLOS QUE ARREGLA, y los tres son lo mismo: al morir se escondía
       el sprite y ya, dejando puesto el resto del estado.

       1. EL BLOQUE DE HIELO SE QUEDABA FLOTANDO. `a.hielo` es un sprite
          aparte, y quien lo mueve y lo borra es `actualizarHielo`... al que ya
          no se llega, porque el bucle ve `a.muerto` y salta al siguiente. Un
          animal que moría helado dejaba un cubito de hielo suelto en mitad del
          prado durante los cinco minutos del respawn.

       2. REVIVÍA DORMIDO. `durmiendo` seguía en true, así que el bicho volvía
          a la vida con sus Z encima y sin moverse hasta el amanecer.

       3. LA PAREJA SEGUÍA CORTEJANDO AL CADÁVER. `mirarA` apunta a otra ave;
          `cortejar` solo mira si el sprite sigue ACTIVO, y esconderlo no lo
          desactiva. La compañera se pasaba cinco minutos girándose hacia un
          pájaro invisible. Y además `pareja` puesta en la otra la dejaba fuera
          de `companiaDe` para siempre. */
    descongelar(a);
    if (a.durmiendo) despertar(st, a);
    quitarZzz(a);
    desemparejar(a);
    a.objetivo = null;
    a.refugio = null;
    a.aCubierto = false;
    a.reaccionaEn = 0;
    a.achata = 0;
    a.achataMeta = 0;
    a.spr.setScale(ESCALA);
    ritmoAnim(a, 1);
    a.revivirEn = ahora + RESPAWN_MS;
    a.spr.setVisible(false);
    if (a.barraFondo) { a.barraFondo.setVisible(false); a.barraVida.setVisible(false); }
    if (a.sombra) a.sombra.setVisible(false);
    log(st.scene, a.especie, 'ha muerto; vuelve en', RESPAWN_MS / 60000, 'min');
  }

  /**
   * Deshace la pareja de un ave, POR LOS DOS LADOS.
   *
   * EL FALLO QUE ARREGLA — "al rato las aves dejan de juntarse": `decidirAve`
   * hacía `a.pareja = null` y se quedaba tan ancho, pero la OTRA seguía con su
   * `pareja` apuntando a ésta. Y `companiaDe` descarta a cualquiera que tenga
   * pareja puesta. Ave a ave, el mapa entero se iba quedando "emparejado" con
   * fantasmas y no volvían a irse juntas nunca más.
   */
  function desemparejar(a) {
    if (a.pareja) {
      if (a.pareja.pareja === a) a.pareja.pareja = null;
      if (a.pareja.mirarA === a) a.pareja.mirarA = null;
      a.pareja = null;
    }
    if (a.mirarA) {
      if (a.mirarA.mirarA === a) a.mirarA.mirarA = null;
      a.mirarA = null;
    }
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
    a.soporte = null;
    a.destino = null;
    a.posX = null;
    a.posY = null;
    a.spr.setVisible(true);
    a.spr.setScale(ESCALA);
    if (a.spr.clearTint) a.spr.clearTint();
    if (a.sombra) a.sombra.setVisible(true);

    /* CADA UNO VUELVE A LO SUYO.

       EL FALLO QUE ARREGLA: aquí se llamaba a `decidirTierra` para TODO lo que
       no fuera un topo, y esa rutina no vale para media plantilla:

         · EN LAS AVES `rumbo` es -1 o +1 (a qué lado dan los pasitos), no un
           ángulo. `decidirTierra` le metía un ángulo en radianes —hasta 6,28—
           y el ave revivida cruzaba la pantalla de lado a seis veces su
           velocidad, como una bala.
         · LAS MARIPOSAS NO TIENEN 'camina'. `decidirTierra` pedía esa
           animación, Phaser no la encontraba y la mariposa se quedaba en el
           fotograma suelto en el que estuviera, sin animar, hasta morirse otra
           vez. Es el mismo aviso que ya salía por consola y nadie ataba.
         · EL CONEJO revivía con su `casa` en la otra punta del mapa. */
    if (a.grupo === 'topo') {
      a.fase = 'bajo'; anim(a, 'monticulo');
      a.hasta = scene.time.now + az(TOPO_BAJO[0], TOPO_BAJO[1]);
    } else if (a.grupo === 'ave') {
      a.fase = 'camina';
      a.rumbo = Math.random() < 0.5 ? -1 : 1;
      anim(a, 'camina');
      a.hasta = scene.time.now + az(ESPERA_SUELO_AVE[0], ESPERA_SUELO_AVE[1]);
    } else if (a.grupo === 'mariposa') {
      a.fase = 'revolotea';
      anim(a, 'vuela');
      a.hasta = scene.time.now + az(500, 2500);
      decidirMariposa(st, a);
    } else if (a.grupo === 'conejo') {
      /* La madriguera vieja se queda sin dueño en la otra punta del mapa, y
         además el sprite no lo borraba nadie: partida larga, conejos que van
         muriendo y madrigueras huérfanas acumulándose. Se cierra la vieja y ya
         cavará otra donde le toque vivir ahora. */
      if (a.madriguera) { try { a.madriguera.destroy(); } catch (e) {} }
      a.madriguera = null;
      a.casa = null;
      a.llevando = false;
      a.zanahoria = null;
      decidirConejo(st, a);
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

    /* EL TOPO Y LA LLUVIA, QUE NO ES LO QUE PARECE.

       Con LLOVIZNA sale MÁS, no menos. El agua encharca las galerías y empuja
       a las lombrices a la superficie; el topo va detrás de ellas. Es de las
       cosas menos evidentes y más ciertas del comportamiento animal, y da un
       detalle que nadie espera: empieza a chispear y el prado se vacía... y a
       la vez empiezan a salir topos.

       Con CHAPARRÓN es al revés: una madriguera anegada es lo peor que le
       puede pasar, así que se mete y no vuelve a asomar hasta que amaine. */
    var t = tiempo();
    var chaparron = t.activo && t.lluvia > 0.55;
    var llovizna  = t.activo && t.lluvia > LLUVIA_MOJA && !chaparron;

    switch (a.fase) {
      case 'bajo':
        /* Bajo tierra va MÁS RÁPIDO que andando por fuera: es su terreno.
           TOPO_VEL_BAJO existía y no se usaba — el montículo se arrastraba a la
           misma velocidad que el topo caminando, que es justo lo que el jugador
           notó como "no se mueve bien abajo". */
        a.rumbo += az(-0.6, 0.6) * dt;
        moverTierraA(st, a, dt, TOPO_VEL_BAJO);
        // Con el chaparrón encima no asoma: espera abajo a que amaine.
        if (chaparron) {
          if (ahora >= a.hasta) a.hasta = ahora + az(4000, 9000);
          return;
        }
        // Chispeando, se acorta la espera: hay lombrices arriba.
        if (llovizna && a.hasta - ahora > 9000) a.hasta = ahora + az(3000, 9000);
        if (ahora >= a.hasta) {
          a.fase = 'asoma';
          anim(a, 'asoma');
          a.hasta = ahora + az(TOPO_ASOMA[0], TOPO_ASOMA[1]);
        }
        return;

      case 'asoma':
        // asomado se entera de todo: si hay alguien cerca, ni sale
        if (cerca || chaparron) { meterse(st, a, ahora, false); return; }
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
        if (cerca || chaparron) { meterse(st, a, ahora, true); return; }
        // Chispeando se queda fuera más rato: es cuando mejor se come.
        if (llovizna && a.fueraHasta && a.fueraHasta - ahora < 6000) {
          a.fueraHasta = ahora + az(6000, 14000);
        }
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

  /* ══════════════════════════════════════════════════════════════════════
     DÓNDE ESTÁ EL AGUA, DE VERDAD
     ──────────────────────────────────────────────────────────────────────
     EL FALLO QUE ESTO ARREGLA — "los pájaros no están en el sitio correcto
     para bañarse":

     El sitio del baño se calculaba como `b.bottom - 4`, o sea el borde de
     ABAJO del sprite del pozo. Pero el pozo no es una charca: es un tejadillo,
     una polea, un brocal de piedra y, ahí en medio, un agujero con agua. El
     borde de abajo del sprite es el SUELO delante del pozo. Los pájaros
     aterrizaban en la hierba y hacían la animación de bañarse en seco.

     Y no se puede arreglar con un número a ojo, porque cada fuente tiene el
     agua a una altura distinta: en `pozo.png` (68×92) está en la fila 57 y en
     `Fuente_de_agua.png` (48×48) en la 28.

     Así que se MIDE. Se buscan los píxeles azules del PNG y se coge la banda
     más BAJA: en un pozo, lo azul de arriba es el tejado y lo azul de abajo es
     el agua, siempre. De ahí salen el centro y el ancho reales del agua, y el
     pájaro se posa dentro. Se mide una vez por textura y se guarda.
     ══════════════════════════════════════════════════════════════════════ */
  var cacheAgua = {};

  /**
   * Devuelve, en fracciones de la textura (0..1):
   *   { cy, alto, cx, ancho }  el centro y el tamaño de la lámina de agua.
   * null si la textura no se puede leer o no tiene nada azul.
   */
  function medirAgua(scene, clave) {
    if (Object.prototype.hasOwnProperty.call(cacheAgua, clave)) return cacheAgua[clave];
    var r = null;
    try {
      var tex = scene.textures.get(clave);
      var img = tex && tex.getSourceImage ? tex.getSourceImage() : null;
      if (!img || !img.width) throw new Error('sin imagen');
      var w = img.width, h = img.height;
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      var ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      var d = ctx.getImageData(0, 0, w, h).data;

      /* Azul = el canal azul manda con claridad sobre los otros dos. El +18 y
         el +8 no son iguales a propósito: el agua de estos PNG tira a cian, así
         que el verde le anda más cerca que el rojo. */
      var bandas = [], actual = null, y, x;
      for (y = 0; y < h; y++) {
        var n = 0, sx = 0, minX = w, maxX = -1;
        for (x = 0; x < w; x++) {
          var i = (y * w + x) * 4;
          if (d[i + 3] > 200 && d[i + 2] > d[i] + 18 && d[i + 2] > d[i + 1] + 8 && d[i + 2] > 70) {
            n++; sx += x;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
          }
        }
        if (n > 0) {
          if (!actual) actual = { y0: y, y1: y, n: 0, sx: 0, minX: w, maxX: -1 };
          actual.y1 = y; actual.n += n; actual.sx += sx;
          if (minX < actual.minX) actual.minX = minX;
          if (maxX > actual.maxX) actual.maxX = maxX;
        } else if (actual) {
          bandas.push(actual); actual = null;
        }
      }
      if (actual) bandas.push(actual);
      if (!bandas.length) throw new Error('sin agua');

      // La banda MÁS BAJA es el agua; lo de arriba es tejado, polea o cielo.
      var agua = bandas[bandas.length - 1];
      r = {
        cy:    (agua.y0 + agua.y1 + 1) / 2 / h,
        alto:  (agua.y1 - agua.y0 + 1) / h,
        cx:    (agua.sx / agua.n) / w,
        ancho: (agua.maxX - agua.minX + 1) / w
      };
    } catch (e) {
      r = null;   // textura de otro dominio, o una fuente sin agua pintada
    }
    cacheAgua[clave] = r;
    return r;
  }

  /** La fuente del pueblo, si existe. Es donde se bañan. */
  /**
   * UN CHARCO EN EL QUE BAÑARSE, o null si no hay ninguno que valga.
   *
   * Se lo pregunta a gf-clima, que es quien los pone y quien sabe cuáles
   * están helados. Se descartan los que caen encima del jugador —un pájaro no
   * baja a bañarse a tus pies— y se elige entre los que quedan, con
   * preferencia por los cercanos: si se cogiera el charco más lejano, el
   * pájaro cruzaría media pantalla y llegaría cuando ya se hubiera secado.
   */
  function charcoParaBanarse(scene, jugador, a) {
    var lista = null;
    try {
      if (window.GFClima && window.GFClima.charcos) lista = window.GFClima.charcos(scene);
    } catch (e) {}
    if (!lista || !lista.length) return null;

    var huye = (a && a.ficha && a.ficha.huye) ? a.ficha.huye * 1.3 : 150;
    var buenos = [];
    for (var i = 0; i < lista.length; i++) {
      var c = lista[i];
      if (jugador && Math.hypot(c.x - jugador.x, c.y - jugador.y) < huye) continue;
      if (a && a.spr && Math.hypot(c.x - a.spr.x, c.y - a.spr.y) > RADIO_VUELO) continue;
      buenos.push(c);
    }
    if (!buenos.length) return null;

    var c2 = elegir(buenos);
    /* No al centro exacto: repartidos por la lámina, y un pelín por debajo del
       medio, que es donde apoyan las patas. Si todos cayeran en el mismo punto
       se verían tres pájaros dentro del mismo píxel. */
    return { x: c2.x + az(-c2.ancho * 0.22, c2.ancho * 0.22),
             y: c2.y + c2.alto * 0.12 };
  }

  function fuenteDe(scene) {
    for (var i = 0; i < FUENTES.length; i++) {
      var f = scene[FUENTES[i]];
      if (!f || f.active === false) continue;
      var b;
      try { b = f.getBounds(); } catch (e) { continue; }

      var clave = f.texture && f.texture.key;
      var agua = clave ? medirAgua(scene, clave) : null;

      if (agua) {
        /* DENTRO del agua, no al borde. El pájaro se mete en el charco:
           un poco por debajo del centro de la lámina (ahí es donde apoya) y
           repartido a lo ancho del agua, sin salirse. */
        var cx = b.x + agua.cx * b.width;
        var mediaAncho = agua.ancho * b.width * 0.30;
        return {
          x: cx + az(-mediaAncho, mediaAncho),
          y: b.y + (agua.cy + agua.alto * 0.18) * b.height,
          clave: FUENTES[i],
          enAgua: true
        };
      }

      /* Sin poder medir (textura ilegible): al menos no en el suelo de delante.
         Dos tercios de la altura es donde está el agua en las dos fuentes que
         tiene el juego, así que es una apuesta mucho mejor que el borde. */
      return { x: b.centerX + az(-b.width * 0.18, b.width * 0.18),
               y: b.y + b.height * 0.62, clave: FUENTES[i], enAgua: false };
    }
    return null;
  }

  function esDeNoche() {
    var c = window.GFCiclo;
    if (!c || !c.hayHora || !c.estado) return false;
    try {
      if (!c.hayHora()) return false;
      var e = c.estado();
      return !!(e && e.esDia === false);
    } catch (x) {
      // Sin reloj fiable es de día: mejor un mundo despierto que uno colgado.
      return false;
    }
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
  /* Dónde se posa dentro del DIBUJO de la flor, contando desde su borde de
     arriba. La mariposa tiene el origen en los pies, así que estos valores son
     dónde apoya: en el tercio de arriba de la flor, que es donde está el
     pétalo. Antes se medía sobre la caja del archivo y por eso a veces se
     quedaba en el aire, por encima de la flor. */
  var MAR_ALTURA   = [0.12, 0.42];
  var MAR_POSADA   = [3000, 9000];
  var MAR_VUELO    = [2500, 6000];
  var MAR_RADIO    = 420;              // no cruzan medio mapa de un tirón

  /** Un punto CONCRETO dentro de una flor, con su desviación al azar.
      Ver el comentario de la caché en `posaderos`: lo que se guarda es el
      centro, y el sorteo se hace aquí, al elegir. */
  function puntoFlor(s) {
    return { clave: s.clave, base: s.base,
             x: s.x + (s.jit ? az(-s.jit, s.jit) : 0),
             y: s.y0 + s.alto * az(s.a0, s.a1) };
  }

  function floresYPiedras(scene) {
    var c = cacheDe(scene);
    if (cacheVale(scene, c) && c.flores) return c.flores;

    var out = [];
    var i, f;
    for (f = 0; f < FAMILIAS_MARIPOSA.length; f++) {
      for (i = 1; i <= FAMILIAS_MARIPOSA[f][1]; i++) {
        var clave = FAMILIAS_MARIPOSA[f][0] + i;
        var spr = scene[clave];
        if (!spr || spr.active === false) continue;
        /* La caja del DIBUJO, no la del archivo: si no, la mariposa se posa en
           el relleno transparente y queda flotando al lado de la flor. */
        var b = cajaDibujada(scene, spr);
        if (!b) continue;
        out.push({ clave: clave,
                   // Centro y márgenes; el sorteo lo hace `puntoFlor`.
                   x: b.centerX, jit: b.width * 0.22,
                   y: b.top + b.height * (MAR_ALTURA[0] + MAR_ALTURA[1]) / 2,
                   y0: b.top, alto: b.height,
                   a0: MAR_ALTURA[0], a1: MAR_ALTURA[1],
                   base: (typeof spr.depth === 'number') ? spr.depth : b.bottom });
      }
    }
    // Los troncos llevan 'png' al final del nombre; van aparte para no
    // ensuciar la tabla de arriba con el caso raro.
    for (i = 1; i <= 17; i++) {
      var t = scene['sprite_tronco_acostado_' + i + 'png'];
      if (!t || t.active === false) continue;
      var bt = cajaDibujada(scene, t);
      if (!bt) continue;
      out.push({ clave: 'sprite_tronco_acostado_' + i + 'png',
                 x: bt.centerX, jit: bt.width * 0.3,
                 y: bt.top + bt.height * 0.35,
                 y0: bt.top, alto: bt.height, a0: 0.3, a1: 0.4,
                 base: (typeof t.depth === 'number') ? t.depth : bt.bottom });
    }
    c.flores = out;
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
      /* Sin nada donde posarse, sigue revoloteando por ahí.

         SE BORRA EL SOPORTE, Y ESTE ES EL ARREGLO DE "LAS MARIPOSAS DUERMEN
         EN EL AIRE":

         `m.soporte` guarda la flor o la piedra a la que va. Por este camino
         —cuando no hay NADA cerca donde posarse— se le daba un destino al azar
         pero NO se borraba el soporte anterior. Al llegar a ese punto en medio
         de la nada, actualizarMariposa() hacía `if (m.soporte)` , lo veía puesto
         del viaje anterior y la daba por posada: animación de reposo y quieta
         entre tres y nueve segundos FLOTANDO EN EL AIRE, sin nada debajo. Y de
         paso se le ponía la profundidad de una flor que estaba en otro sitio.

         Volando no hay soporte. Punto. */
      m.fase = 'revolotea';
      anim(m, 'vuela');
      m.soporte = null;
      m.baseSoporte = null;
      var limD = limites(scene);
      m.destino = {
        x: Math.min(limD.w - 30, Math.max(30, m.spr.x + az(-160, 160))),
        y: Math.min(limD.h - 30, Math.max(30, m.spr.y + az(-120, 120)))
      };
      m.hasta = scene.time.now + az(MAR_VUELO[0], MAR_VUELO[1]);
      return;
    }
    var s2 = puntoFlor(elegir(cerca));
    m.fase = 'revolotea';
    anim(m, 'vuela');
    m.destino = { x: s2.x, y: s2.y };
    m.soporte = s2.clave;
    m.baseSoporte = s2.base;
    /* CON SOL, MÁS VUELO Y MENOS PARADA.

       Una mariposa es un termómetro con alas: al sol no para quieta y con el
       cielo tapado se queda posada esperando. Como el vuelo dura `MAR_VUELO` y
       la parada `MAR_POSADA`, basta con estirar el uno y encoger la otra. */
    m.hasta = scene.time.now + az(MAR_VUELO[0], MAR_VUELO[1]) * animoDelSol(scene);
  }

  /**
   * Cuántas ganas de volar hay hoy, de 0,7 (encapotado) a 1,45 (a pleno sol).
   * Lo usan las mariposas, que es a quien más le nota.
   */
  function animoDelSol(scene) {
    var t = tiempo();
    if (!t || !t.activo) return 1;
    return 1 + t.sol * 0.70 - Math.min(0.3, t.lluvia * 0.4 + t.nieve * 0.3);
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
      /* Y se comprueba que lo que hay debajo SIGA EXISTIENDO: un arbusto
         talado o una piedra minada dejaban a la mariposa posada sobre el aire
         hasta que se le acabara el rato. Si el soporte se fue, se va ella. */
      if (!m.soporte || !scene[m.soporte] || scene[m.soporte].active === false) {
        decidirMariposa(st, m);
        return;
      }
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
        // Al sol se para menos; encapotado, más. Ver `animoDelSol`.
        m.hasta = ahora + az(MAR_POSADA[0], MAR_POSADA[1]) / animoDelSol(scene);
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



  // ═══════════════════════════════════════════════════════════ CONEJOS
  /** Las zanahorias del mapa: cultivos maduros y las flores/matas que valgan. */
  function zanahoriasCerca(scene, a) {
    var out = [];
    /* Los cultivos del jugador son la fuente buena: si hay una parcela con algo
       crecido, ahí va el conejo. El juego los guarda en scene.cropSprites o en
       propiedades sueltas; se mira lo que haya sin dar por hecho ninguna. */
    var mapa = scene.cropSprites || scene.cultivos || null;
    if (mapa) {
      for (var k in mapa) {
        var c = mapa[k];
        var spr = (c && c.sprite) ? c.sprite : c;
        if (!spr || typeof spr.x !== 'number' || spr.active === false) continue;
        if (Math.hypot(spr.x - a.spr.x, spr.y - a.spr.y) > CONEJO_RADIO) continue;
        out.push({ x: spr.x, y: spr.y });
      }
    }
    return out;
  }

  /** Dibuja la madriguera de un conejo donde está ahora. */
  function abrirMadriguera(st, a) {
    var scene = st.scene;
    if (a.madriguera && a.madriguera.active) return a.madriguera;
    if (!scene.textures.exists('gfa_conejo_madriguera_1')) return null;
    var m = scene.add.sprite(a.spr.x, a.spr.y, 'gfa_conejo_madriguera_1');
    m.setOrigin(0.5, 1);
    m.setScale(ESCALA);
    // Pegada al suelo: el conejo y todo lo demás pasan por encima.
    m.setDepth(a.spr.y - 2);
    var clave = 'gfa_conejo_madriguera';
    if (scene.anims && !scene.anims.exists(clave)) {
      try {
        scene.anims.create({
          key: clave, frameRate: RITMO.madriguera, repeat: -1,
          frames: [{ key: 'gfa_conejo_madriguera_1' },
                   { key: 'gfa_conejo_madriguera_2' }]
        });
      } catch (e) {}
    }
    try { m.anims.play(clave); } catch (e) {}
    a.madriguera = m;
    a.casa = { x: a.spr.x, y: a.spr.y };
    log(scene, 'un conejo abre su madriguera');
    return m;
  }

  /** ¿Está el conejo encima de su madriguera? */
  function enCasa(a) {
    return !!(a.casa && Math.hypot(a.spr.x - a.casa.x, a.spr.y - a.casa.y) < 10);
  }

  function irA(a, x, y, fase, pose) {
    a.fase = fase;
    a.destino = { x: x, y: y };
    anim(a, pose);
  }

  function decidirConejo(st, a) {
    var scene = st.scene;
    var ahora = scene.time.now;
    var r = Math.random();

    // 1. Sin casa todavía: lo primero es cavarla.
    if (!a.casa && r < CONEJO_PROB_CAVA + 0.25) {
      a.fase = 'cava';
      anim(a, 'cava');
      a.hasta = ahora + CONEJO_CAVA_MS;
      return;
    }

    // 2. Buscar una zanahoria.
    if (r < CONEJO_PROB_ZANA) {
      var zs = zanahoriasCerca(scene, a);
      if (zs.length) {
        var z = elegir(zs);
        a.zanahoria = z;
        irA(a, z.x, z.y, 'aZanahoria', 'camina');
        a.hasta = ahora + 9000;
        return;
      }
    }

    // 3. Volver a casa de vez en cuando.
    if (a.casa && r < 0.55 && !enCasa(a)) {
      irA(a, a.casa.x, a.casa.y, 'aCasa', 'camina');
      a.hasta = ahora + 9000;
      return;
    }

    // 4. Lo normal: pasear o mordisquear.
    if (r < 0.78) {
      a.fase = 'pasea';
      a.rumbo = az(0, Math.PI * 2);
      anim(a, 'camina');
    } else {
      a.fase = 'come';
      anim(a, 'come');
      a.hasta = ahora + az(CONEJO_COME_MS[0], CONEJO_COME_MS[1]);
      return;
    }
    a.hasta = ahora + az(CONEJO_ESPERA[0], CONEJO_ESPERA[1]);
  }

  /**
   * El conejo.
   *
   * Huye CORRIENDO, no trotando: usa su pose de carrera y su velocidad de
   * carrera, que es la más alta del mapa. Es la diferencia entre un conejo y
   * cualquier otro bicho pequeño.
   */
  function actualizarConejo(st, a, ahora, dt) {
    var scene = st.scene;
    var p = scene.player;

    // ── huir ────────────────────────────────────────────────────────────
    if (p && !jugadorFantasma() && a.fase !== 'huye' && a.fase !== 'cava') {
      var d = Math.hypot(a.spr.x - p.x, a.spr.y - p.y);
      if (d < a.ficha.huye * a.miedo) {
        a.fase = 'huye';
        a.rumbo = Math.atan2(a.spr.y - p.y, a.spr.x - p.x);
        anim(a, 'corre');
        a.hasta = ahora + az(1400, 2600);
        return;
      }
    }

    switch (a.fase) {
      case 'huye':
        moverTierra(st, a, dt, true);
        if (ahora >= a.hasta) decidirConejo(st, a);
        return;

      case 'cava':
        if (ahora >= a.hasta) {
          abrirMadriguera(st, a);
          decidirConejo(st, a);
        }
        return;

      case 'come':
        if (ahora >= a.hasta) decidirConejo(st, a);
        return;

      case 'aZanahoria':
      case 'aCasa':
        var dst = a.destino;
        if (!dst) { decidirConejo(st, a); return; }
        var dx = dst.x - a.spr.x, dy = dst.y - a.spr.y;
        var dist = Math.hypot(dx, dy);
        var paso = a.ficha.vel * dt;
        if (dist < 6 || paso >= dist || ahora >= a.hasta) {
          if (a.fase === 'aZanahoria') {
            /* La coge. La mitad de las veces se la come ahí y la otra mitad se
               la lleva a casa: verlo cruzar el prado con la zanahoria en la
               boca es la mitad de la gracia. */
            if (a.casa && Math.random() < CONEJO_LLEVA) {
              a.llevando = true;
              irA(a, a.casa.x, a.casa.y, 'aCasa', 'lleva');
              a.hasta = ahora + 12000;
            } else {
              a.fase = 'come';
              anim(a, 'come');
              a.hasta = ahora + az(CONEJO_COME_MS[0], CONEJO_COME_MS[1]);
            }
          } else {
            a.llevando = false;
            decidirConejo(st, a);
          }
          return;
        }
        moverTierraA(st, a, dt, a.ficha.vel);
        a.rumbo = Math.atan2(dy, dx);
        a.spr.setFlipX(dx < 0);
        return;

      default:
        if (a.fase === 'pasea') {
          moverTierra(st, a, dt, false);
          a.rumbo += az(-0.5, 0.5) * dt;
        }
        if (ahora >= a.hasta) decidirConejo(st, a);
    }
  }

  /**
   * De noche el conejo se METE en su madriguera: no duerme a la intemperie.
   *
   * Devuelve true si se ha metido, para que el sueño normal no haga nada más.
   */
  function meterseEnMadriguera(st, a) {
    if (a.grupo !== 'conejo' || !a.casa) return false;
    if (!enCasa(a)) return false;
    a.spr.setVisible(false);
    if (a.sombra) a.sombra.setVisible(false);
    return true;
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

  /** ¿Está durmiendo al raso, sin nada encima? */
  function aLaIntemperie(a) {
    if (a.aCubierto || a.enMadriguera) return false;
    // El ave que duerme en la copa de un árbol está bajo las hojas.
    if (a.grupo === 'ave' && esArbol(a.soporte)) return false;
    // El topo bajo tierra tampoco se moja.
    if (a.grupo === 'topo' && (a.fase === 'bajo' || a.faseAntes === 'bajo')) return false;
    return true;
  }

  /** A qué distancia se despierta este animal. */
  function radioDespertar(a) {
    var r = Math.max(DESPERTAR_MIN, (a.ficha.huye || 0) * 0.75 * (a.miedo || 1));
    /* LOS QUE MUERDEN SE ENTERAN ANTES.

       EL FALLO QUE ARREGLA: el radio salía de `huye`, o sea de lo asustadizo
       que es el bicho. Pero el cocodrilo tiene `huye` a 0 —no huye de nada, es
       él quien va a por ti— así que se quedaba con el mínimo de 70 px. Podías
       plantarte a un palmo de un cocodrilo dormido y seguía roncando; y ni
       siquiera te atacaba, porque el camino de pelear va por debajo del sueño.
       Un bicho que muerde no se lee como dormido, se lee como roto.

       Un depredador tiene que enterarse por lo menos a la distancia a la que
       podría morderte, con margen. */
    if (a.ficha.agresivo) {
      r = Math.max(r, (a.ficha.alcance || 0) * 2.2, 110);
    }
    return r;
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
    /* Respirando despacio. Es lo mismo que se le hace al que se resguarda, y
       por el mismo motivo: la pose de dormir suele ser de dos fotogramas, y a
       ritmo normal un bicho dormido parpadea como si estuviera nervioso. */
    ritmoAnim(a, 0.45);
    /* El conejo, si tiene casa y esta en ella, se METE dentro y no se le ve:
       queda la madriguera con sus Z encima. Dormir tirado en la hierba a la
       vista es de otros animales, no de un conejo. */
    a.enMadriguera = meterseEnMadriguera(st, a);
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
    if (a.enMadriguera) {
      a.spr.setVisible(true);
      if (a.sombra) a.sombra.setVisible(true);
      a.enMadriguera = false;
    }
    /* Se levanta del todo: si sigue lloviendo, `acomodarse` volverá a
       achatarlo enseguida. Sin esto se quedaba andando aplastado, y respirando
       al ralentí — `timeScale` se lo había bajado `guarecerse` y no lo subía
       nadie, porque el que se duerme resguardado nunca pasa por
       `salirDelRefugio`. */
    a.achataMeta = 0;
    a.pruebaSuenio = 0;
    ritmoAnim(a, 1);
    quitarZzz(a);

    /* SI DESPIERTA Y SIGUE LLOVIENDO, NO SE VA DE PASEO.

       EL FALLO QUE ARREGLA: un bicho puede echar una cabezada mientras espera
       a que escampe. Al acabársele, esto llamaba a `decidirTierra` y lo mandaba
       a pasear bajo el chaparrón; `actualizarTiempo` lo volvía a meter a
       cubierto un segundo después, pero para entonces ya había salido de
       debajo del árbol y dado unos pasos bajo el agua. Se veía justo lo que no
       tiene que verse: al cocodrilo levantarse y andar en plena tormenta.

       Despertarse a cubierto y seguir a cubierto es además lo natural: si
       sigue cayendo, no hay nada que decidir. */
    if (a.aCubierto && molestia(a, tiempo()) > REFUGIO_SALE) {
      acomodarse(st, a, st.scene.time.now);
      return;
    }
    a.aCubierto = false;

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
    /* Metido en la madriguera no se le ve, así que las Z salen del agujero: si
       salieran de donde está el sprite escondido, flotarían solas en el aire. */
    if (a.enMadriguera && a.casa) {
      a.zzz.setPosition(a.casa.x + 9, a.casa.y - 14 - t * ZZZ_SUBE);
    } else {
      a.zzz.setPosition(a.spr.x + 9, a.spr.y - alto - t * ZZZ_SUBE);
    }
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
      /* ...O QUE SE PONGA A LLOVER ENCIMA.

         Nadie sigue durmiendo tirado en la hierba bajo un chaparrón: se
         levanta y se va a cubierto. Solo al que duerme A LA INTEMPERIE — el
         que ya está resguardado, metido en su madriguera o en la rama de un
         árbol, sigue durmiendo tan tranquilo, que es lo que hace un animal de
         verdad. Al despertar, `actualizarTiempo` se encarga de llevárselo. */
      if (aLaIntemperie(a) && molestia(a, tiempo()) > REFUGIO_ENTRA) {
        despertar(st, a); return false;
      }
      /* Y SI ESCAMPÓ MIENTRAS DORMÍA, se le quitan las marcas del mal tiempo.

         EL FALLO QUE ARREGLA: el que se duerme resguardado no vuelve a pasar
         por `actualizarTiempo` —el bucle sale aquí, en el sueño— así que se
         quedaba con `aCubierto` puesto y achatado para siempre. Al despertar
         se levantaba encogido, y peor: con `aCubierto` puesto, `aLaIntemperie`
         diría que sigue a cubierto y el siguiente chaparrón ya no lo
         levantaría nunca de la hierba. */
      if (a.aCubierto && molestia(a, tiempo()) <= REFUGIO_SALE) {
        a.aCubierto = false;
        a.refugio = null;
        a.achataMeta = 0;
      }
      moverZzz(st, a, ahora);
      return true;
    }

    /* ¿SE ECHA A DORMIR?

       Normalmente, solo cuando ha terminado lo que estuviera haciendo. El que
       ya está a cubierto es la excepción: está parado esperando a que escampe
       y puede dormitar en cualquier momento, sin esperar a que se le acabe un
       rato que, mientras dure el mal tiempo, se renueva solo.

       PERO CON SU PROPIO RELOJ, y esto importa: sin él la cabezada se sortea
       en CADA FOTOGRAMA. Con PROB_SIESTA a 0,035 eso son sesenta tiradas por
       segundo, o sea que cualquier bicho resguardado se dormía en menos de
       medio segundo. En la simulación se quedaban dormidos 20 de 48 nada más
       ponerse a llover, y el prado no se leía como "todos a cubierto" sino
       como "todos KO". Ahora se sortea cada 6-16 s, que es más o menos la
       cadencia con la que decide un animal despejado. */
    if (a.fase === 'refugio') {
      if (ahora < (a.pruebaSuenio || 0)) return false;
      a.pruebaSuenio = ahora + az(6000, 16000);
    } else if (ahora < a.hasta) {
      return false;
    }

    if (esDeNoche()) {
      /* El conejo no se echa donde le pille: primero vuelve a su madriguera.
         Si aún no tiene casa, duerme fuera como los demás. */
      if (a.grupo === 'conejo' && a.dormilon && a.casa && !enCasa(a)) {
        irA(a, a.casa.x, a.casa.y, 'aCasa', 'camina');
        a.hasta = ahora + 12000;
        return false;
      }
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

    /* El tiempo se lee UNA vez para los treinta y pico bichos, no una vez por
       bicho. Va lo primero porque todo lo demás lo consulta. */
    releerTiempo(ahora);

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
      // Acostarse y levantarse es un fundido, no un salto: ver `achatar`.
      achatar(a, dt);

      // Congelado: ni se mueve ni ataca ni se asusta. Va ANTES del sueño
      // porque un animal helado no se duerme, se queda como está.
      if (actualizarHielo(st, a, ahora)) continue;

      // Dormido: ni se mueve ni ataca ni se asusta, solo suelta sus Z.
      if (actualizarSuenio(st, a, ahora)) continue;

      /* EL TIEMPO. Va después del sueño y antes de la rutina normal: un animal
         dormido a cubierto sigue durmiendo (de eso se encarga `actualizarSuenio`,
         que despierta al que duerme a la intemperie bajo el chaparrón), y uno
         despierto se refugia en vez de pasear bajo el agua. */
      if (actualizarTiempo(st, a, ahora, dt)) continue;

      if (a.grupo === 'ave') actualizarAve(st, a, ahora, dt);
      else if (a.grupo === 'mariposa') actualizarMariposa(st, a, ahora, dt);
      else if (a.grupo === 'topo') actualizarTopo(st, a, ahora, dt);
      else if (a.grupo === 'conejo') actualizarConejo(st, a, ahora, dt);
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
  /** Reparte por el mapa a todo el elenco. Lo saca de `montar` para que ahí
      se vea de un vistazo qué se monta y en qué orden. */
  function poblar(st, scene, elenco, puestos, usados) {
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
            var comp = puntoPosadero(elegir(sitios));
            sitio = { clave: comp.clave, base: comp.base,
                      x: comp.x + az(-14, 14), y: comp.y + az(-4, 4) };
          } else if (sitio) {
            /* La desviación a lo ancho se sortea AQUÍ. `sitio` viene de la
               lista guardada, que es compartida y no se puede tocar. */
            sitio = puntoPosadero(sitio);
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
  }

  function montar(scene, opciones) {
    opciones = opciones || {};
    if (!scene || !scene.add || !scene.textures) return null;
    if (scene.__gfFauna) return scene.__gfFauna;      // ya montada

    var elenco = opciones.elenco || ELENCO;
    var st = { scene: scene, animales: [], hoyos: [], nidos: {} };
    var puestos = [];
    var usados = {};

    /* Se apunta la fauna en la escena ANTES de poblarla.

       Si algo revienta a mitad del reparto —una textura rara, un sprite del
       mapa en un estado inesperado— hay que poder llamar a `desmontar` para
       recoger los animales que ya se habían creado. Sin esto, los sprites
       hechos hasta el fallo se quedaban sueltos en la escena sin que nadie los
       tuviera apuntados: imposibles de mover, de borrar y de encontrar. */
    scene.__gfFauna = st;
    try {
      poblar(st, scene, elenco, puestos, usados);
    } catch (fallo) {
      console.warn('[fauna] no se pudo montar:', fallo);
      desmontar(scene);
      return null;
    }

    st.onUpdate = function (t, d) { actualizar(st, t, d); };
    scene.events.on('update', st.onUpdate);
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);

    /* EL TRUENO.

       Se guarda solo el INSTANTE del último; cada animal lleva apuntado cuál
       fue el último que oyó (`truenoVisto`) y así se entera exactamente una
       vez, aunque su turno le toque tres fotogramas después por estar lejos de
       la cámara.

       `soltarTrueno` hay que llamarlo al desmontar o el oyente se queda vivo
       para siempre dentro de gf-clima, que NO se desmonta al cambiar de mapa:
       sería una fuga de las de verdad, con la escena entera colgando de él. */
    st.trueno = 0;
    st.soltarTrueno = null;
    try {
      if (window.GFClima && window.GFClima.alTronar) {
        st.soltarTrueno = window.GFClima.alTronar(function () {
          st.trueno = Date.now();
        });
      }
    } catch (e) { /* sin clima no hay truenos, y no pasa nada */ }

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
    /* Y el oyente del trueno. gf-clima sobrevive al cambio de escena, así que
       un oyente que no se da de baja se lleva por delante la escena vieja
       entera: `st` → `st.scene` → todo el mapa. */
    if (st.soltarTrueno) { try { st.soltarTrueno(); } catch (e) {} st.soltarTrueno = null; }
    for (var i = 0; i < st.animales.length; i++) {
      var an = st.animales[i];
      if (an.spr) an.spr.destroy();
      if (an.zzz) an.zzz.destroy();
      if (an.madriguera) an.madriguera.destroy();
      if (an.barraFondo) an.barraFondo.destroy();
      if (an.barraVida) an.barraVida.destroy();
      if (an.hielo) an.hielo.destroy();
      if (an.sombra) an.sombra.destroy();
    }
    st.animales.length = 0;
    for (var h = 0; h < st.hoyos.length; h++) {
      if (st.hoyos[h].spr) st.hoyos[h].spr.destroy();
    }
    st.hoyos.length = 0;
    for (var k in st.nidos) { if (st.nidos[k]) st.nidos[k].destroy(); }
    st.nidos = {};
    // La medida del escenario (posaderos, flores, refugios) es de ESTA escena.
    scene.__gfFaunaSitios = null;
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

  /** La escena viva con fauna montada, para las pruebas desde la consola. */
  function escenaConFauna() {
    var g = window.game || (window.phaserScaler && window.phaserScaler.game);
    try {
      var ss = (g && g.scene && g.scene.getScenes) ? (g.scene.getScenes(true) || []) : [];
      for (var i = 0; i < ss.length; i++) if (ss[i].__gfFauna) return ss[i].__gfFauna;
    } catch (e) {}
    return null;
  }

  /** Congela unos cuantos AHORA, para verlo sin esperar a que nieve. */
  function congelarAhora(cuantos) {
    var st = escenaConFauna();
    if (!st) return 0;
    var n = 0, ahora = st.scene.time.now;
    for (var i = 0; i < st.animales.length && n < (cuantos || 1); i++) {
      var a = st.animales[i];
      if (!a.spr || a.muerto || a.congelado) continue;
      if (!CONGELA_GRUPOS[a.grupo]) continue;
      congelar(st, a, ahora);
      if (a.congelado) n++;
    }
    return n;
  }

  window.GFAnimales = {
    precargar: precargar,
    montar: montar,
    congelar: congelarAhora,
    descongelarTodos: function () {
      var st = escenaConFauna();
      if (!st) return 0;
      var n = 0;
      for (var i = 0; i < st.animales.length; i++) {
        if (st.animales[i].congelado) { descongelar(st.animales[i]); n++; }
      }
      return n;
    },
    desmontar: desmontar,
    estado: estado,
    /** Qué tiempo cree la fauna que hace ahora mismo. Para depurar. */
    tiempo: function () { return releerTiempo(Date.now()); },
    /** Un trueno de mentira, para ver los sobresaltos sin esperar. */
    tronar: function () {
      var st = escenaConFauna();
      if (!st) return false;
      st.trueno = Date.now();
      return true;
    },
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
      fuenteDe: fuenteDe, medirAgua: medirAgua, FUENTES: FUENTES,
      esDeNoche: esDeNoche, companiaDe: companiaDe,
      irseJuntas: irseJuntas, construirNido: construirNido,
      actualizarConejo: actualizarConejo, decidirConejo: decidirConejo,
      abrirMadriguera: abrirMadriguera, enCasa: enCasa,
      meterseEnMadriguera: meterseEnMadriguera,
      zanahoriasCerca: zanahoriasCerca, CONEJO_RADIO: CONEJO_RADIO,
      dormirse: dormirse, despertar: despertar, actualizarSuenio: actualizarSuenio,
      poseDormido: poseDormido, radioDespertar: radioDespertar,
      moverZzz: moverZzz, PROB_DORMILON: PROB_DORMILON, SIESTA_MS: SIESTA_MS,
      PROB_SIESTA: PROB_SIESTA, PROB_SIESTERO: PROB_SIESTERO,
      balanceoSoporte: balanceoSoporte, mecerPosados: mecerPosados,
      esArbol: esArbol,
      sabeTumbarse: sabeTumbarse, danarAnimal: danarAnimal,
      crearSombra: crearSombra, actualizarSombra: actualizarSombra,
      fichaSombra: fichaSombra, anchoSombra: anchoSombra,
      SOMBRA_POR_GRUPO: SOMBRA_POR_GRUPO,
      floresYPiedras: floresYPiedras, actualizarMariposa: actualizarMariposa,
      decidirMariposa: decidirMariposa,
      morirAnimal: morirAnimal, revivirAnimal: revivirAnimal,
      actualizarBarraAnimal: actualizarBarraAnimal, RESPAWN_MS: RESPAWN_MS,
      DANO_MASCOTA: DANO_MASCOTA,
      actualizarTopo: actualizarTopo, mascotaPelea: mascotaPelea,
      retirarse: retirarse, morder: morder, abrirHoyo: abrirHoyo,
      posesDe: posesDe, POSES: POSES, POSES_EXTRA: POSES_EXTRA,
      // el tiempo
      releerTiempo: releerTiempo, tiempo: tiempo, molestia: molestia,
      comoSeGuarece: comoSeGuarece, refugios: refugios,
      refugioCerca: refugioCerca, huecoBajo: huecoBajo,
      actualizarTiempo: actualizarTiempo, irseARefugio: irseARefugio,
      salirDelRefugio: salirDelRefugio, guarecerse: guarecerse,
      acomodarse: acomodarse, sobresaltar: sobresaltar,
      achatar: achatar, factorSuelo: factorSuelo, sueloMojado: sueloMojado,
      quietudDelSol: quietudDelSol, animoDelSol: animoDelSol,
      esReptil: esReptil, aLaIntemperie: aLaIntemperie,
      desemparejar: desemparejar,
      REFUGIO_ENTRA: REFUGIO_ENTRA, REFUGIO_SALE: REFUGIO_SALE,
      SENSIBLE: SENSIBLE, SENSIBLE_GRUPO: SENSIBLE_GRUPO,
      ANTE_EL_AGUA: ANTE_EL_AGUA, ANTE_EL_AGUA_GRUPO: ANTE_EL_AGUA_GRUPO,
      // la caché del escenario
      cacheDe: cacheDe, cacheVale: cacheVale, olvidarSitios: olvidarSitios,
      puntoPosadero: puntoPosadero, puntoFlor: puntoFlor
    }
  };
})();
