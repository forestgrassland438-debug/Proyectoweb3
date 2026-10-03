/*!
 * gf-brawl-motor.js — el motor de las batallas de arena (Grassland Forest)
 * ===========================================================================
 *
 * Batallas en tiempo real al estilo de un "brawl": cada jugador ES su perro,
 * se mueve por una arena de casillas, dispara, se esconde en la hierba alta,
 * rompe cajas para coger huesos de poder y aguanta mientras la niebla cierra
 * el campo. Gana el último que queda en pie.
 *
 * UN SOLO MOTOR PARA LOS TRES SITIOS
 * ---------------------------------------------------------------------------
 * Este archivo lo usan tres sitios, y por eso no depende de nada:
 *
 *   · El SERVIDOR (server2.js lleva una copia incrustada entre las marcas
 *     <<BRAWL-MOTOR>>; ver tools/brawl-a-servidor.js). Allí manda: mueve las
 *     balas, reparte el daño, decide quién cae y lleva a los bots.
 *   · El CLIENTE (BattleScene.js), que usa las MISMAS funciones de choque para
 *     mover a su propio perro sin esperar al servidor —si no, con 150 ms de
 *     red el perro iría "a tirones de goma"— y para dibujar dónde se paran las
 *     balas contra los muros.
 *   · Los bancos de prueba (tools/brawl-prueba-*.js y _prueba_brawl.html),
 *     que juegan partidas enteras sin servidor.
 *
 * Si la física del cliente y la del servidor fueran dos copias escritas a
 * mano, tarde o temprano dirían cosas distintas y el perro daría saltos al
 * corregirse. Con un único archivo eso no puede pasar. tools/brawl-prueba-
 * motor.js comprueba además que la copia de server2.js es ESTE archivo.
 *
 * QUIÉN DECIDE QUÉ (anti-trampas)
 * ---------------------------------------------------------------------------
 *   · El movimiento lo predice el cliente y lo VALIDA el servidor: cada
 *     posición que llega se recorta a lo que el perro puede andar en ese
 *     tiempo (con un margen para la red) y se pasa por la misma física de
 *     choques. Si no cuadra, el servidor manda la buena y el cliente se
 *     recoloca. No se puede correr más ni atravesar muros.
 *   · Los disparos los decide el servidor entero: munición, cadencia, daño,
 *     a quién da. El cliente solo dice "disparo hacia este ángulo".
 *   · La hierba alta esconde DE VERDAD: el servidor no manda la posición de un
 *     enemigo escondido (salvo que esté muy cerca o se haya delatado), así que
 *     un cliente trucado tampoco lo ve.
 *
 * EL MOTOR NO SABE NADA DE SOCKETS
 * ---------------------------------------------------------------------------
 * Para hablar con fuera usa dos funciones que le da quien lo usa:
 *
 *   opciones.enviar(luchador, evento, datos)   un mensaje a UN luchador
 *   opciones.alTerminar(partida, resumen)      la partida ha acabado
 *
 * y el reloj (`opciones.ahora`) y el azar (`opciones.azar`) también se le
 * pasan, para que las pruebas puedan jugar una partida entera en un instante y
 * con la misma tirada siempre.
 *
 * EL PROTOCOLO (eventos del servidor al cliente; el cliente manda los suyos
 * con el host, ver BattleScene.js):
 *
 *   brawl:inicio   la partida: arena, luchadores, reglas, cuenta atrás
 *   brawl:ya       empieza el combate (fin de la cuenta atrás)
 *   brawl:snap     20 veces por segundo: dónde está cada uno que ves
 *   brawl:balas    alguien ha disparado (para dibujar las balas)
 *   brawl:golpe    una bala ha dado a alguien
 *   brawl:caja     una caja ha recibido un golpe o se ha roto
 *   brawl:objeto   ha aparecido un hueso en el suelo
 *   brawl:recoger  alguien ha cogido un hueso
 *   brawl:ko       alguien ha caído
 *   brawl:fin      (lo manda el host, con los puntos ya guardados)
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else raiz.GFBrawlMotor = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 1;

  /* <<ARENAS>> — lo escribe tools/generar-arenas.py a partir de los mapas.
     No se edita a mano: se cambia el mapa (o el diseño del generador) y se
     vuelve a lanzar. Leyenda: "#" muro, "~" agua, "*" arbusto, "c" caja,
     "o" caja dorada, "=" puente, "." libre. Apariciones en casillas. */
  var ARENAS = {
    pradera: {
      nombre: 'Meadow', ancho: 30, alto: 22, celda: 32,
      filas: [
        '..............................',
        '.....#....***.........c.......',
        '.....#....****................',
        '.....###...***................',
        '.......................###....',
        '........c..........****..#....',
        '.**............o...****..#....',
        '.***c..##.....................',
        '.......##.....................',
        '.............~~~~....##..***..',
        '............~~~~~~............',
        '............~~~~~~............',
        '..***..##....~~~~.............',
        '.....................##.......',
        '.....................##..c***.',
        '....#..****...o............**.',
        '....#..****..........c........',
        '....###.......................',
        '................***...###.....',
        '................****....#.....',
        '.......c.........***....#.....',
        '..............................'
      ],
      apariciones: [[2,2],[27,2],[3,9],[27,19],[2,19],[26,12]]
    },
    ruinas: {
      nombre: 'Ruins', ancho: 30, alto: 22, celda: 32,
      filas: [
        '..............................',
        '.............****........c....',
        '......####....................',
        '......#..............#........',
        '......***..c.........###......',
        '**....**.....##...............',
        '**............................',
        '**..c....#......o....***......',
        '..................#..***..##..',
        '.............~~~~.#...........',
        '.............~~~~.............',
        '.............~~~~.............',
        '...........#.~~~~.............',
        '..##..***..#..................',
        '......***....o......#....c..**',
        '............................**',
        '...............##.....**....**',
        '......###.........c..***......',
        '........#..............#......',
        '....................####......',
        '....c........****.............',
        '..............................'
      ],
      apariciones: [[3,3],[26,3],[3,10],[26,18],[3,18],[26,11]]
    },
    rio: {
      nombre: 'River', ancho: 30, alto: 22, celda: 32,
      filas: [
        '..............................',
        '..................c...........',
        '.........###..........#.......',
        '.........#..........###.......',
        '***........***................',
        '...c.......****.#......***....',
        '....##..........#......***c...',
        '.............o................',
        '...........~~~~~........~~~...',
        '~~~~~~==~~~~~~~~~~~~~~==~~~~~~',
        '~~~~~~==~~~~~~~~~~~~~~==~~~~~~',
        '~~~~~~==~~~~~~~~~~~~~~==~~~~~~',
        '~~~~~~==~~~~~~~~~~~~~~==~~~~~~',
        '...~~~........~~~~~...........',
        '................o.............',
        '...c***......#..........##....',
        '....***......#.****.......c...',
        '................***........***',
        '.......###..........#.........',
        '.......#..........###.........',
        '...........c..................',
        '..............................'
      ],
      apariciones: [[2,2],[27,2],[14,3],[27,19],[2,19],[15,18]]
    }
  };
  /* <</ARENAS>> */

  // =========================================================================
  // REGLAS
  // =========================================================================
  /* Las cifras salen de jugar, no de una fórmula, pero tienen su porqué:
   *
   *  · VELOCIDAD 104 px/s = 3,25 casillas por segundo. El perro mide una
   *    casilla, así que cruza la arena (30 casillas) en unos 9 segundos: da
   *    tiempo a pensar por dónde ir, y una persecución no se eterniza.
   *  · VIDA ×10 y DAÑO ×12 sobre la curva de siempre (battleStatsForLevel:
   *    80 + 12·nivel de vida, 10 + 2·nivel de ataque). Con eso un perro cae
   *    con 6 ladridos a nivel 1 y con 5-6 a nivel 10: los combates duran lo
   *    que tarda en recargarse dos veces el cargador, que es lo que hace que
   *    apuntar importe más que tener nivel.
   *  · La NIEBLA empieza a cerrar a los 40 s y deja el centro a los 140 s.
   *    Sin ella, dos jugadores prudentes se pasan la partida escondidos en la
   *    hierba; con ella, la partida acaba sí o sí en menos de tres minutos.
   *  · La VIDA se REGENERA sola a los 3 s sin pegar ni recibir: premia saber
   *    retirarse, y castiga quedarse a pegar con poca vida.
   */
  var REGLAS = {
    TICK_MS: 50,                 // 20 pasos de simulación por segundo
    RADIO: 11,                   // el círculo con el que choca un luchador
    VEL: 104,                    // px/s del perro
    ESCALA_VIDA: 10,
    ESCALA_DANO: 12,
    MUNICION: 3,
    REGEN_ESPERA_MS: 3000,
    REGEN_POR_S: 0.10,           // de la vida máxima
    CUENTA_MS: 3000,
    ZONA_INICIO_MS: 40000,
    ZONA_FIN_MS: 140000,
    DURACION_MAX_MS: 170000,
    ZONA_RADIO_FINAL: 80,
    ZONA_DANO_S: 0.07,           // de la vida máxima, por segundo, fuera
    ZONA_DANO_FINAL_S: 0.16,     // cuando ya se ha cerrado del todo
    VISION_ARBUSTO: 84,          // a esta distancia ves a quien está en la hierba
    REVELA_MS: 1200,             // disparar o recibir te delata este rato
    CAJA_VIDA: 2,                // golpes que aguanta una caja
    CAJA_ORO_VIDA: 4,
    HUESO_MULT: 0.10,            // +10 % de daño y de vida por hueso
    HUESO_MAX: 8,
    HUESO_RADIO: 22,
    PRESUPUESTO_MS: 350,         // margen de red para el movimiento
    TOLERANCIA: 1.25,
    CORRECCION_MIN: 2.5,         // px de diferencia para recolocar al cliente
    SALUD_MINIMA_ENTRADA: 0.20   // nadie entra con menos de esto (ver abajo)
  };

  // =========================================================================
  // ARMAS
  // =========================================================================
  /* Cada especie tiene su ataque y su súper. Las cifras de daño están hechas
     para que el daño por segundo "si acierta todo" sea parecido (~0,8 de la
     unidad de daño): unos pegan de lejos y poco, otros de cerca y mucho, pero
     ninguno es simplemente mejor.

       balas     cuántas salen a la vez
       abanico   el ángulo total del abanico, en grados
       vel       px/s
       alcance   px que recorre antes de deshacerse
       radio     px del círculo de choque de la bala
       dano      múltiplo de la unidad de daño (ataque × 12), POR BALA
       cadencia  ms mínimos entre dos disparos
       recarga   ms para recuperar una carga de munición
       carga     súper que da cada bala que acierta (1 = súper lista)
       atraviesa pasa a través de los luchadores (no de los muros)
       empuje    px que retrocede quien la recibe
       rompe     destroza cualquier caja de un golpe
       tipo      cómo se dibuja (BattleScene.js) */
  var ARMAS = {
    // ── ataques ──
    ladrido:    { nombre: 'Bark',      balas: 1, abanico: 0,  vel: 360, alcance: 232, radio: 9,  dano: 1.00, cadencia: 360, recarga: 1250, carga: 0.34, tipo: 'onda' },
    mordisco:   { nombre: 'Bite',      balas: 1, abanico: 0,  vel: 430, alcance: 122, radio: 11, dano: 0.85, cadencia: 300, recarga: 950,  carga: 0.30, tipo: 'mordisco' },
    colmillos:  { nombre: 'Tusks',     balas: 2, abanico: 14, vel: 340, alcance: 158, radio: 8,  dano: 0.62, cadencia: 380, recarga: 1350, carga: 0.17, tipo: 'colmillo' },
    plumas:     { nombre: 'Feathers',  balas: 3, abanico: 20, vel: 410, alcance: 262, radio: 6,  dano: 0.36, cadencia: 400, recarga: 1300, carga: 0.12, tipo: 'pluma' },
    zarpazo:    { nombre: 'Claw',      balas: 1, abanico: 0,  vel: 380, alcance: 204, radio: 9,  dano: 0.95, cadencia: 340, recarga: 1150, carga: 0.33, tipo: 'zarpa' },
    dentellada: { nombre: 'Chomp',     balas: 1, abanico: 0,  vel: 360, alcance: 132, radio: 14, dano: 1.45, cadencia: 450, recarga: 1500, carga: 0.36, tipo: 'diente' },
    escupitajo: { nombre: 'Spit',      balas: 1, abanico: 0,  vel: 330, alcance: 250, radio: 8,  dano: 0.90, cadencia: 380, recarga: 1200, carga: 0.32, tipo: 'veneno' },
    // ── súpers ──
    aullido:    { nombre: 'Howl',      balas: 1, abanico: 0,  vel: 300, alcance: 262, radio: 20, dano: 2.20, cadencia: 300, recarga: 0, carga: 0, atraviesa: true, empuje: 64, rompe: true, tipo: 'aullido' },
    estampida:  { nombre: 'Stampede',  balas: 5, abanico: 50, vel: 420, alcance: 142, radio: 9,  dano: 0.55, cadencia: 300, recarga: 0, carga: 0, tipo: 'mordisco' },
    embestida:  { nombre: 'Charge',    balas: 1, abanico: 0,  vel: 320, alcance: 172, radio: 22, dano: 1.90, cadencia: 300, recarga: 0, carga: 0, atraviesa: true, empuje: 80, rompe: true, tipo: 'embestida' },
    bandada:    { nombre: 'Flock',     balas: 7, abanico: 40, vel: 420, alcance: 262, radio: 7,  dano: 0.42, cadencia: 300, recarga: 0, carga: 0, tipo: 'pluma' },
    fuego:      { nombre: 'Wisp',      balas: 1, abanico: 0,  vel: 250, alcance: 282, radio: 16, dano: 2.30, cadencia: 300, recarga: 0, carga: 0, rompe: true, tipo: 'fuego' }
  };

  var ESPECIES = {
    perro:     { vel: 1.00, vida: 1.00, arma: 'ladrido',    super: 'aullido',   etiqueta: 'Dog' },
    conejo:    { vel: 1.16, vida: 0.92, arma: 'mordisco',   super: 'estampida', etiqueta: 'Rabbit' },
    cerdo:     { vel: 0.90, vida: 1.12, arma: 'colmillos',  super: 'embestida', etiqueta: 'Boar' },
    cuervo:    { vel: 1.06, vida: 0.90, arma: 'plumas',     super: 'bandada',   etiqueta: 'Crow' },
    zorro:     { vel: 1.08, vida: 0.96, arma: 'zarpazo',    super: 'fuego',     etiqueta: 'Fox' },
    zorra:     { vel: 1.08, vida: 0.96, arma: 'zarpazo',    super: 'bandada',   etiqueta: 'Vixen' },
    cocodrilo: { vel: 0.88, vida: 1.18, arma: 'dentellada', super: 'embestida', etiqueta: 'Croc' },
    vibora:    { vel: 1.02, vida: 0.94, arma: 'escupitajo', super: 'fuego',     etiqueta: 'Viper' },
    coral:     { vel: 1.02, vida: 0.94, arma: 'escupitajo', super: 'bandada',   etiqueta: 'Coral' },
    topo:      { vel: 0.96, vida: 1.05, arma: 'mordisco',   super: 'embestida', etiqueta: 'Mole' },
    vaca:      { vel: 0.90, vida: 1.15, arma: 'colmillos',  super: 'embestida', etiqueta: 'Bull' }
  };

  function especie(id) { return ESPECIES[id] || ESPECIES.perro; }

  // =========================================================================
  // LA REJILLA
  // =========================================================================
  /* Una letra por casilla (la leyenda de ARENAS):
       '#' muro      bloquea el paso y las balas
       '~' agua      bloquea el paso, NO las balas (se dispara por encima)
       'c' caja      bloquea las dos cosas hasta que se rompe
       'o' caja oro  igual, y al romperse suelta un hueso
       '*' arbusto   se atraviesa; quien está dentro no se ve
       '=' puente    se anda por encima del agua
       '.' libre */
  function crearRejilla(def) {
    var W = def.ancho | 0, Hh = def.alto | 0, C = def.celda || 32;
    var celdas = new Array(W * Hh);
    var cajas = {};
    for (var y = 0; y < Hh; y++) {
      var fila = String((def.filas && def.filas[y]) || '');
      for (var x = 0; x < W; x++) {
        var ch = fila.charAt(x) || '#';
        if ('#~*co=.'.indexOf(ch) < 0) ch = '.';
        celdas[y * W + x] = ch;
        if (ch === 'c') cajas[y * W + x] = { vida: REGLAS.CAJA_VIDA, max: REGLAS.CAJA_VIDA, oro: false };
        if (ch === 'o') cajas[y * W + x] = { vida: REGLAS.CAJA_ORO_VIDA, max: REGLAS.CAJA_ORO_VIDA, oro: true };
      }
    }
    return { ancho: W, alto: Hh, celda: C, celdas: celdas, cajas: cajas, anchoPx: W * C, altoPx: Hh * C };
  }

  /** La rejilla como filas de texto (lo que se manda al cliente). */
  function filasDe(R) {
    var out = [];
    for (var y = 0; y < R.alto; y++) out.push(R.celdas.slice(y * R.ancho, (y + 1) * R.ancho).join(''));
    return out;
  }

  function celdaEn(R, cx, cy) {
    if (cx < 0 || cy < 0 || cx >= R.ancho || cy >= R.alto) return '#';
    return R.celdas[cy * R.ancho + cx];
  }

  function celdaDePunto(R, x, y) {
    return celdaEn(R, Math.floor(x / R.celda), Math.floor(y / R.celda));
  }

  function bloqueaPaso(ch) { return ch === '#' || ch === '~' || ch === 'c' || ch === 'o'; }
  function bloqueaBala(ch) { return ch === '#' || ch === 'c' || ch === 'o'; }

  /** Quita una caja rota: la casilla pasa a ser suelo. */
  function romperCaja(R, idx) {
    delete R.cajas[idx];
    R.celdas[idx] = '.';
  }

  // =========================================================================
  // CHOQUES (idénticos en el cliente y en el servidor)
  // =========================================================================
  /* Un luchador es un CÍRCULO, no un cuadrado: así resbala por las esquinas
     de los muros en vez de engancharse en ellas, que es lo que hace cómodo
     moverse con el joystick.

     El empuje hacia fuera mira las casillas que toca el círculo y lo saca por
     el punto más cercano de cada una. Se repite hasta 3 veces porque en un
     rincón al salir de una casilla se puede entrar en la de al lado. */
  function empujarFuera(R, x, y, r) {
    var C = R.celda;
    for (var vuelta = 0; vuelta < 3; vuelta++) {
      var movido = false;
      var cx0 = Math.floor((x - r) / C), cx1 = Math.floor((x + r) / C);
      var cy0 = Math.floor((y - r) / C), cy1 = Math.floor((y + r) / C);
      for (var cy = cy0; cy <= cy1; cy++) {
        for (var cx = cx0; cx <= cx1; cx++) {
          if (!bloqueaPaso(celdaEn(R, cx, cy))) continue;
          var rx0 = cx * C, rx1 = rx0 + C, ry0 = cy * C, ry1 = ry0 + C;
          var px = x < rx0 ? rx0 : (x > rx1 ? rx1 : x);
          var py = y < ry0 ? ry0 : (y > ry1 ? ry1 : y);
          var dx = x - px, dy = y - py;
          var d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          if (d2 > 1e-9) {
            var d = Math.sqrt(d2);
            var pen = r - d;
            x += dx / d * pen;
            y += dy / d * pen;
          } else {
            // El centro dentro de la casilla: se sale por el lado más cercano.
            var izq = x - rx0, der = rx1 - x, arr = y - ry0, aba = ry1 - y;
            var m = Math.min(izq, der, arr, aba);
            if (m === izq) x = rx0 - r;
            else if (m === der) x = rx1 + r;
            else if (m === arr) y = ry0 - r;
            else y = ry1 + r;
          }
          movido = true;
        }
      }
      if (!movido) break;
    }
    return [x, y];
  }

  /**
   * Mueve un círculo (x, y, r) un desplazamiento (dx, dy) resbalando por los
   * muros. En pasos de menos de un radio, para no atravesar una casilla de
   * lado a lado en un fotograma lento.
   */
  function moverCirculo(R, x, y, dx, dy, r) {
    var largo = Math.max(Math.abs(dx), Math.abs(dy));
    var pasos = Math.max(1, Math.ceil(largo / (r * 0.9)));
    var sx = dx / pasos, sy = dy / pasos;
    var p = [x, y];
    for (var i = 0; i < pasos; i++) {
      p = empujarFuera(R, p[0] + sx, p[1] + sy, r);
    }
    // Y nunca fuera de la arena.
    p[0] = Math.max(r, Math.min(R.anchoPx - r, p[0]));
    p[1] = Math.max(r, Math.min(R.altoPx - r, p[1]));
    return p;
  }

  /**
   * Avanza una bala `dist` px. Devuelve null si sigue volando, o lo que la
   * paró: { muro: true } o { caja: indice }. Se mira en pasos de 6 px, que es
   * menos que el radio de cualquier bala: no se cuela por una esquina.
   * (El choque con los luchadores lo hace el servidor aparte.)
   */
  function avanzarBala(R, b, dist, alPaso) {
    var n = Math.max(1, Math.ceil(dist / 6));
    var paso = dist / n;
    for (var i = 0; i < n; i++) {
      b.x += b.dx * paso;
      b.y += b.dy * paso;
      b.resto -= paso;
      var cx = Math.floor(b.x / R.celda), cy = Math.floor(b.y / R.celda);
      var ch = celdaEn(R, cx, cy);
      if (bloqueaBala(ch)) {
        if (ch === 'c' || ch === 'o') return { caja: cy * R.ancho + cx };
        return { muro: true };
      }
      if (alPaso && alPaso(b)) return { luchador: true };
      if (b.resto <= 0) return { fin: true };
    }
    return null;
  }

  /** ¿Pasa una bala de A a B? (los arbustos y el agua no tapan). */
  function lineaDeTiro(R, x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0;
    var largo = Math.sqrt(dx * dx + dy * dy);
    var n = Math.max(1, Math.ceil(largo / 8));
    for (var i = 1; i < n; i++) {
      var t = i / n;
      if (bloqueaBala(celdaDePunto(R, x0 + dx * t, y0 + dy * t))) return false;
    }
    return true;
  }

  // =========================================================================
  // LA PARTIDA
  // =========================================================================
  function dist2(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }
  function redondea(v, k) { var m = k || 1; return Math.round(v * m) / m; }

  /**
   * Crea una partida.
   *
   * opciones = {
   *   id, modo: 'bot'|'pvp'|'practica', ronda,
   *   arena: id de ARENAS, o { ancho, alto, celda, filas, apariciones },
   *   luchadores: [{ clave, humano, playerName, petName, especie, nivel,
   *                  maxHp, ataque, salud (0..1), astucia (bots) }],
   *   ahora(), azar(), enviar(l, ev, datos), alTerminar(P, resumen)
   * }
   */
  function crearPartida(op) {
    var ahora = op.ahora || function () { return Date.now(); };
    var azar = op.azar || Math.random;
    var def = typeof op.arena === 'string' ? ARENAS[op.arena] : op.arena;
    if (!def) throw new Error('arena desconocida: ' + op.arena);
    var R = crearRejilla(def);
    var t0 = ahora();
    var P = {
      id: op.id || ('x_' + t0),
      modo: op.modo || 'pvp',
      ronda: op.ronda || null,
      arenaId: typeof op.arena === 'string' ? op.arena : (def.id || 'personalizada'),
      arenaNombre: def.nombre || '',
      def: def,
      R: R,
      luchadores: [],
      porId: {},
      balas: [],
      sigBala: 1,
      objetos: [],
      sigObjeto: 1,
      fase: 'cuenta',
      tCreada: t0,
      tCombate: t0 + REGLAS.CUENTA_MS,
      tUltimo: t0,
      tick: 0,
      caidas: [],          // ids, en el orden en que cayeron
      ahora: ahora,
      azar: azar,
      enviar: op.enviar || function () {},
      alTerminar: op.alTerminar || function () {},
      zona: null,
      resumen: null,
      extraInicio: op.extraInicio || null
    };

    var apar = (def.apariciones || []).slice();
    // Orden de uso: cada uno con su gemelo girado enfrente (1-4, 2-5, 3-6),
    // así en un 1 contra 1 los dos salen en esquinas opuestas.
    var orden = [0, 3, 1, 4, 2, 5].filter(function (i) { return i < apar.length; });
    for (var i = 0; i < op.luchadores.length; i++) {
      var spec = op.luchadores[i];
      var ap = apar[orden[i % orden.length]] || [1, 1];
      P.luchadores.push(crearLuchador(P, spec, i + 1, (ap[0] + 0.5) * R.celda, (ap[1] + 0.5) * R.celda));
    }
    P.luchadores.forEach(function (l) { P.porId[l.id] = l; });

    var cx = R.anchoPx / 2, cy = R.altoPx / 2;
    /* `x`/`y` además de `cx`/`cy`: dist2() lee x e y. Sin ellos la distancia a
       la zona salía NaN, "fuera de la niebla" no era nunca verdad y la niebla
       no hacía daño a nadie (ni los bots huían de ella). Lo cazó
       tools/brawl-prueba-motor.js. */
    P.zona = {
      cx: cx, cy: cy, x: cx, y: cy,
      r0: Math.sqrt(cx * cx + cy * cy) + R.celda,
      rFin: REGLAS.ZONA_RADIO_FINAL,
      r: Math.sqrt(cx * cx + cy * cy) + R.celda
    };

    P.luchadores.forEach(function (l) { enviarInicio(P, l); });
    return P;
  }

  /*  LA SALUD CON LA QUE SE ENTRA.
      Las batallas por cartas hacían entrar a la mascota con la vida que le
      quedara en el mapa, y eso se mantiene: cuidar al perro sigue contando.
      Pero en tiempo real entrar con el 3 % es caer al primer ladrido sin haber
      llegado a jugar, así que hay un suelo del 20 %. */
  function crearLuchador(P, s, id, x, y) {
    var esp = especie(s.especie);
    /* `vidaFija`: los bots de las batallas diarias traen su vida ya medida
       por la escalera de rondas (crearBotDeRonda, con su techo sobre la
       mascota). Si encima se les sumara el extra de su especie, el cocodrilo
       de la ronda 5 se pasaría de ese techo. */
    var multVida = s.vidaFija ? 1 : esp.vida;
    var maxHp = Math.max(1, Math.round((Number(s.maxHp) || 92) * REGLAS.ESCALA_VIDA * multVida));
    var salud = Number.isFinite(Number(s.salud)) ? Math.max(0, Math.min(1, Number(s.salud))) : 1;
    salud = Math.max(REGLAS.SALUD_MINIMA_ENTRADA, salud);
    var l = {
      id: id,
      clave: s.clave || ('l' + id),
      humano: !!s.humano,
      bot: !s.humano,
      playerName: String(s.playerName || 'Player').slice(0, 40),
      petName: String(s.petName || 'Pet').slice(0, 24),
      address: String(s.address || ''),
      especie: ESPECIES[s.especie] ? s.especie : 'perro',
      nivel: Math.max(1, Number(s.nivel) || 1),
      maxHp: maxHp,
      hp: Math.max(1, Math.round(maxHp * salud)),
      ataque: Math.max(1, Number(s.ataque) || 12),
      x: x, y: y, r: REGLAS.RADIO,
      vel: REGLAS.VEL * esp.vel,
      arma: ARMAS[esp.arma],
      armaId: esp.arma,
      superArma: ARMAS[esp.super],
      superId: esp.super,
      municion: REGLAS.MUNICION,
      ultimoDisparo: 0,
      superCarga: 0,
      vivo: true,
      potencia: 0,
      regenDesde: 0,
      reveladoHasta: 0,
      enArbusto: false,
      // el movimiento que manda el cliente
      seq: 0,
      ultimaEntrada: 0,
      presupuesto: 0,
      correccion: 0,
      cAck: 0,              // la última corrección que el cliente dice haber aplicado
      corregir: false,
      entradasSegundo: 0,
      ventanaEntradas: 0,
      empuje: null,
      // lo que se ve
      apunta: 0,
      moviendo: false,
      mira: 1,
      vx: 0, vy: 0,
      // marcador
      bajas: 0,
      dano: 0,
      puesto: null,
      muertoEn: null,
      fuera: false,          // se fue de la partida (rendición o desconexión)
      ia: null
    };
    if (l.bot) l.ia = crearIA(s.astucia);
    return l;
  }

  function publico(l) {
    return {
      id: l.id, playerName: l.playerName, petName: l.petName,
      address: l.address ? (l.address.length > 10 ? l.address.slice(0, 6) + '…' + l.address.slice(-4) : l.address) : '',
      especie: l.especie, etiqueta: especie(l.especie).etiqueta,
      nivel: l.nivel, maxHp: l.maxHp, hp: l.hp, x: redondea(l.x, 2), y: redondea(l.y, 2),
      vel: l.vel, bot: l.bot, arma: l.armaId, super: l.superId
    };
  }

  function armaPublica(a) {
    return {
      nombre: a.nombre, balas: a.balas, abanico: a.abanico, vel: a.vel, alcance: a.alcance,
      radio: a.radio, cadencia: a.cadencia, recarga: a.recarga, tipo: a.tipo,
      atraviesa: !!a.atraviesa, empuje: a.empuje || 0
    };
  }

  function enviarInicio(P, l) {
    if (!l.humano) return;
    var armas = {};
    Object.keys(ARMAS).forEach(function (k) { armas[k] = armaPublica(ARMAS[k]); });
    var cajas = [];
    Object.keys(P.R.cajas).forEach(function (k) {
      var c = P.R.cajas[k];
      cajas.push([Number(k), c.vida, c.max, c.oro ? 1 : 0]);
    });
    P.enviar(l, 'brawl:inicio', {
      matchId: P.id,
      modo: P.modo,
      ronda: P.ronda,
      version: VERSION,
      yo: l.id,
      arena: {
        id: P.arenaId, nombre: P.arenaNombre, ancho: P.R.ancho, alto: P.R.alto,
        celda: P.R.celda, filas: filasDe(P.R), cajas: cajas
      },
      luchadores: P.luchadores.map(publico),
      armas: armas,
      reglas: {
        tick: REGLAS.TICK_MS, municion: REGLAS.MUNICION, radio: REGLAS.RADIO,
        visionArbusto: REGLAS.VISION_ARBUSTO, huesoMult: REGLAS.HUESO_MULT,
        huesoMax: REGLAS.HUESO_MAX
      },
      zona: {
        cx: P.zona.cx, cy: P.zona.cy, r0: P.zona.r0, rFin: P.zona.rFin,
        inicioMs: REGLAS.ZONA_INICIO_MS, finMs: REGLAS.ZONA_FIN_MS, maxMs: REGLAS.DURACION_MAX_MS
      },
      cuentaMs: Math.max(0, P.tCombate - P.ahora()),
      serverNow: P.ahora(),
      extra: P.extraInicio
    });
  }

  function difundir(P, ev, datos) {
    for (var i = 0; i < P.luchadores.length; i++) {
      var l = P.luchadores[i];
      if (l.humano && !l.fuera) P.enviar(l, ev, datos);
    }
  }

  function vivos(P) {
    var n = 0;
    for (var i = 0; i < P.luchadores.length; i++) if (P.luchadores[i].vivo) n++;
    return n;
  }

  // =========================================================================
  // LO QUE MANDA EL JUGADOR
  // =========================================================================
  /**
   * El cliente dice dónde está su perro (lo ha movido él mismo). Se acepta lo
   * que se pueda andar en el tiempo transcurrido, con las mismas paredes.
   *
   * EL PRESUPUESTO. Los paquetes no llegan cada 50 ms clavados: a veces llegan
   * tres juntos tras un parón de la red. Si cada uno solo pudiera mover lo de
   * "50 ms", tras el parón se recortarían los tres y el perro daría un salto
   * atrás. Por eso se lleva una cuenta de cuánto se ha podido andar, que se
   * llena con el tiempo (hasta 350 ms) y se gasta al moverse.
   */
  function entrada(P, id, datos) {
    var l = P.porId[id];
    if (!l || !l.vivo || l.fuera || P.fase !== 'combate' || !datos) return;
    var ahora = P.ahora();
    var seq = Number(datos.s);
    var x = Number(datos.x), y = Number(datos.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(seq)) return;
    if (seq <= l.seq) return;                        // viejo o repetido
    // Tope de paquetes: 40 por segundo bastan para 20 Hz con margen.
    if (ahora - l.ventanaEntradas > 1000) { l.ventanaEntradas = ahora; l.entradasSegundo = 0; }
    if (++l.entradasSegundo > 40) return;
    l.seq = seq;
    if (l.empuje) return;                            // le estamos moviendo nosotros
    /* LAS ENTRADAS VIEJAS NO VALEN. Si el servidor ha recolocado al perro (un
       empujón, o una posición que no cuadraba), las entradas que el cliente
       mandó ANTES de enterarse siguen viajando por la red con la posición
       vieja. Aceptarlas devolvería al perro hacia atrás y habría que
       corregirle otra vez: el efecto goma. Cada entrada lleva el número de la
       última corrección que el cliente ha aplicado (`c`); si va por detrás, se
       ignora hasta que se ponga al día. */
    var c = Number(datos.c);
    if (Number.isFinite(c)) l.cAck = Math.max(l.cAck, c);
    if (Number.isFinite(c) && c < l.correccion) return;

    var dt = Math.max(0, Math.min(REGLAS.PRESUPUESTO_MS, ahora - (l.ultimaEntrada || ahora)));
    l.ultimaEntrada = ahora;
    var tope = l.vel * REGLAS.PRESUPUESTO_MS / 1000;
    l.presupuesto = Math.min(tope, l.presupuesto + l.vel * dt / 1000 * REGLAS.TOLERANCIA);

    var dx = x - l.x, dy = y - l.y;
    var largo = Math.sqrt(dx * dx + dy * dy);
    if (largo > l.presupuesto + 0.5) {
      var k = l.presupuesto / Math.max(1e-6, largo);
      dx *= k; dy *= k;
    }
    var p = moverCirculo(P.R, l.x, l.y, dx, dy, l.r);
    var andado = Math.sqrt((p[0] - l.x) * (p[0] - l.x) + (p[1] - l.y) * (p[1] - l.y));
    l.presupuesto = Math.max(0, l.presupuesto - andado);
    l.moviendo = andado > 0.3;
    if (Math.abs(p[0] - l.x) > 0.3) l.mira = p[0] > l.x ? 1 : -1;
    l.x = p[0]; l.y = p[1];
    var fallo = Math.max(Math.abs(p[0] - x), Math.abs(p[1] - y));
    if (fallo > REGLAS.CORRECCION_MIN) { l.correccion++; l.corregir = true; }
    if (Number.isFinite(Number(datos.a))) l.apunta = Number(datos.a);
  }

  /**
   * El cliente pide disparar hacia el ángulo `a` (radianes). `sup` = la súper.
   * `s` es un número del cliente para casar su bala dibujada con la de
   * verdad; aquí no se usa para nada más.
   */
  function disparar(P, id, datos) {
    var l = P.porId[id];
    if (!l || !l.vivo || l.fuera || P.fase !== 'combate' || !datos) return false;
    var a = Number(datos.a);
    if (!Number.isFinite(a)) return false;
    return dispararAngulo(P, l, a, !!datos.sup, datos.s);
  }

  function dispararAngulo(P, l, a, sup, seqCliente) {
    var ahora = P.ahora();
    var arma = sup ? l.superArma : l.arma;
    if (ahora - l.ultimoDisparo < arma.cadencia) return false;
    if (sup) {
      if (l.superCarga < 1) return false;
      l.superCarga = 0;
    } else {
      if (l.municion < 1) return false;
      l.municion -= 1;
    }
    l.ultimoDisparo = ahora;
    l.apunta = a;
    if (Math.abs(Math.cos(a)) > 0.2) l.mira = Math.cos(a) > 0 ? 1 : -1;
    l.reveladoHasta = ahora + REGLAS.REVELA_MS;
    l.regenDesde = ahora + REGLAS.REGEN_ESPERA_MS;

    var mult = 1 + REGLAS.HUESO_MULT * l.potencia;
    var unidad = l.ataque * REGLAS.ESCALA_DANO * mult;
    var nuevas = [];
    for (var i = 0; i < arma.balas; i++) {
      var off = arma.balas > 1 ? (i / (arma.balas - 1) - 0.5) * arma.abanico * Math.PI / 180 : 0;
      var ang = a + off;
      var b = {
        id: P.sigBala++,
        duenio: l.id,
        x: l.x, y: l.y,
        dx: Math.cos(ang), dy: Math.sin(ang),
        ang: ang,
        vel: arma.vel,
        resto: arma.alcance,
        radio: arma.radio,
        dano: Math.max(1, Math.round(unidad * arma.dano)),
        atraviesa: !!arma.atraviesa,
        empuje: arma.empuje || 0,
        rompe: !!arma.rompe,
        carga: sup ? 0 : arma.carga,
        tipo: arma.tipo,
        golpeados: {}
      };
      P.balas.push(b);
      nuevas.push([b.id, redondea(b.x, 2), redondea(b.y, 2), redondea(ang, 1000), b.vel, arma.alcance, b.radio, b.tipo]);
    }
    difundir(P, 'brawl:balas', { o: l.id, sup: sup ? 1 : 0, s: seqCliente == null ? null : seqCliente, b: nuevas });
    return true;
  }

  /**
   * Rendirse o desconectarse: cuenta como caer, sin asesino.
   * `op.irse` = se va del todo (deja de recibir mensajes). Sin él, se rinde
   * pero se queda mirando cómo acaba la partida.
   */
  function abandonar(P, id, op) {
    var l = P.porId[id];
    if (!l) return;
    if (!op || op.irse !== false) l.fuera = true;
    if (l.vivo && P.fase !== 'fin') caer(P, l, null);
    if (P.fase === 'cuenta' && humanosVivos(P) === 0) terminar(P, 'abandono');
  }

  function humanosVivos(P) {
    var n = 0;
    for (var i = 0; i < P.luchadores.length; i++) {
      var l = P.luchadores[i];
      if (l.humano && l.vivo && !l.fuera) n++;
    }
    return n;
  }

  // =========================================================================
  // EL PASO DE LA SIMULACIÓN
  // =========================================================================
  /**
   * Lo llama el host cada ~50 ms. Hace los pasos de simulación que tocan
   * según el reloj (como mucho 4 de golpe: si el proceso se ha atascado, mejor
   * perder un poco de tiempo de partida que congelar el servidor recuperándolo)
   * y manda una instantánea a cada jugador.
   */
  function paso(P) {
    if (!P || P.fase === 'fin') return;
    var ahora = P.ahora();
    if (P.fase === 'cuenta') {
      if (ahora < P.tCombate) return;
      P.fase = 'combate';
      P.tUltimo = P.tCombate;
      P.luchadores.forEach(function (l) { l.ultimaEntrada = ahora; l.presupuesto = 0; });
      difundir(P, 'brawl:ya', { serverNow: ahora });
    }
    var n = Math.floor((ahora - P.tUltimo) / REGLAS.TICK_MS);
    if (n <= 0) return;
    if (n > 4) { P.tUltimo = ahora - 4 * REGLAS.TICK_MS; n = 4; }
    for (var i = 0; i < n && P.fase !== 'fin'; i++) {
      P.tUltimo += REGLAS.TICK_MS;
      tick(P, P.tUltimo);
    }
    if (P.fase !== 'fin') enviarInstantaneas(P, ahora);
  }

  function tick(P, t) {
    P.tick++;
    var dt = REGLAS.TICK_MS / 1000;
    var enCombate = t - P.tCombate;
    actualizarZona(P, enCombate);

    for (var i = 0; i < P.luchadores.length; i++) {
      var l = P.luchadores[i];
      if (!l.vivo) continue;
      // munición
      if (l.municion < REGLAS.MUNICION) {
        l.municion = Math.min(REGLAS.MUNICION, l.municion + REGLAS.TICK_MS / l.arma.recarga);
      }
      // empujón en curso (lo mueve el servidor)
      if (l.empuje) {
        var e = l.empuje;
        var p = moverCirculo(P.R, l.x, l.y, e.vx * dt, e.vy * dt, l.r);
        l.x = p[0]; l.y = p[1];
        if (t >= e.hasta) l.empuje = null;
        l.correccion++; l.corregir = true;
      }
      // los bots piensan y andan
      if (l.bot) pensarBot(P, l, t, dt);
      l.enArbusto = celdaDePunto(P.R, l.x, l.y) === '*';
      // niebla
      var fuera = Math.sqrt(dist2(l, P.zona)) > P.zona.r;
      if (fuera && enCombate >= REGLAS.ZONA_INICIO_MS) {
        var frac = enCombate >= REGLAS.ZONA_FIN_MS ? REGLAS.ZONA_DANO_FINAL_S : REGLAS.ZONA_DANO_S;
        var d = Math.max(1, Math.round(l.maxHp * frac * dt));
        l.hp -= d;
        l.regenDesde = t + REGLAS.REGEN_ESPERA_MS;
        if (l.hp <= 0) { l.hp = 0; caer(P, l, null); continue; }
      } else if (t >= l.regenDesde && l.hp < l.maxHp) {
        // regeneración
        l.hp = Math.min(l.maxHp, l.hp + Math.max(1, Math.round(l.maxHp * REGLAS.REGEN_POR_S * dt)));
      }
    }

    moverBalas(P, t, dt);
    recogerObjetos(P, t);

    // ¿Se acabó?
    var quedan = vivos(P);
    if (quedan <= 1) { terminar(P, 'ko'); return; }
    if ((P.modo === 'bot' || P.modo === 'practica') && humanosVivos(P) === 0) { terminar(P, 'ko'); return; }
    if (enCombate >= REGLAS.DURACION_MAX_MS) terminar(P, 'tiempo');
  }

  function actualizarZona(P, enCombate) {
    var z = P.zona;
    if (enCombate <= REGLAS.ZONA_INICIO_MS) { z.r = z.r0; return; }
    var f = Math.min(1, (enCombate - REGLAS.ZONA_INICIO_MS) / (REGLAS.ZONA_FIN_MS - REGLAS.ZONA_INICIO_MS));
    // suave al principio y al final
    var s = f * f * (3 - 2 * f);
    z.r = z.r0 + (z.rFin - z.r0) * s;
  }

  function moverBalas(P, t, dt) {
    var R = P.R;
    var quedan = [];
    for (var i = 0; i < P.balas.length; i++) {
      var b = P.balas[i];
      var duenio = P.porId[b.duenio];
      var choque = avanzarBala(R, b, Math.min(b.resto, b.vel * dt), function (bb) {
        // ¿da a alguien en este punto?
        for (var j = 0; j < P.luchadores.length; j++) {
          var l = P.luchadores[j];
          if (!l.vivo || l.id === bb.duenio || bb.golpeados[l.id]) continue;
          var rr = l.r + bb.radio;
          if (dist2(l, bb) <= rr * rr) {
            golpear(P, bb, duenio, l, t);
            if (!bb.atraviesa) return true;
          }
        }
        return false;
      });
      if (choque && choque.caja != null) {
        golpearCaja(P, choque.caja, b, t);
        // La súper que rompe sigue su camino si la caja ya no está.
        if (b.rompe && R.celdas[choque.caja] === '.' && b.resto > 0) { quedan.push(b); continue; }
        continue;
      }
      if (choque) continue;
      if (b.resto > 0) quedan.push(b);
    }
    P.balas = quedan;
  }

  function golpear(P, b, duenio, l, t) {
    b.golpeados[l.id] = true;
    var d = b.dano;
    l.hp = Math.max(0, l.hp - d);
    l.regenDesde = t + REGLAS.REGEN_ESPERA_MS;
    l.reveladoHasta = t + REGLAS.REVELA_MS;
    if (duenio) {
      duenio.regenDesde = t + REGLAS.REGEN_ESPERA_MS;
      duenio.dano += d;
      if (b.carga) duenio.superCarga = Math.min(1, duenio.superCarga + b.carga);
    }
    if (b.empuje) {
      var v = b.empuje / 0.18;          // recorre `empuje` px en 180 ms
      l.empuje = { vx: b.dx * v, vy: b.dy * v, hasta: t + 180 };
    }
    difundir(P, 'brawl:golpe', {
      b: b.id, t: l.id, o: b.duenio, d: d, hp: l.hp,
      x: redondea(b.x, 2), y: redondea(b.y, 2), sup: b.carga ? 0 : 1
    });
    if (l.hp <= 0) caer(P, l, duenio);
  }

  function golpearCaja(P, idx, b, t) {
    var c = P.R.cajas[idx];
    if (!c) return;
    c.vida = b.rompe ? 0 : c.vida - 1;
    var x = (idx % P.R.ancho + 0.5) * P.R.celda, y = (Math.floor(idx / P.R.ancho) + 0.5) * P.R.celda;
    var rota = c.vida <= 0;
    if (rota) romperCaja(P.R, idx);
    difundir(P, 'brawl:caja', { i: idx, vida: Math.max(0, c.vida), max: c.max, rota: rota ? 1 : 0, oro: c.oro ? 1 : 0 });
    if (rota && c.oro) soltarHuesos(P, x, y, 1);
  }

  function soltarHuesos(P, x, y, n) {
    var R = P.R;
    for (var i = 0; i < n; i++) {
      // Un poco repartidos, y nunca dentro de un muro o del agua.
      var ang = P.azar() * Math.PI * 2;
      var d = n > 1 ? 10 + P.azar() * 18 : 0;
      var p = moverCirculo(R, x, y, Math.cos(ang) * d, Math.sin(ang) * d, 8);
      var o = { id: P.sigObjeto++, x: p[0], y: p[1], tipo: 'hueso' };
      P.objetos.push(o);
      difundir(P, 'brawl:objeto', { id: o.id, x: redondea(o.x, 2), y: redondea(o.y, 2), tipo: o.tipo });
    }
  }

  function recogerObjetos(P, t) {
    if (!P.objetos.length) return;
    var quedan = [];
    for (var i = 0; i < P.objetos.length; i++) {
      var o = P.objetos[i];
      var quien = null;
      for (var j = 0; j < P.luchadores.length; j++) {
        var l = P.luchadores[j];
        if (!l.vivo) continue;
        var rr = l.r + REGLAS.HUESO_RADIO * 0.5;
        if (dist2(l, o) <= rr * rr) { quien = l; break; }
      }
      if (!quien) { quedan.push(o); continue; }
      if (quien.potencia < REGLAS.HUESO_MAX) {
        quien.potencia++;
        // La vida máxima sube y lo que sube se cura: coger un hueso en mitad
        // de la pelea tiene que notarse.
        var extra = Math.round(quien.maxHp / (1 + REGLAS.HUESO_MULT * (quien.potencia - 1)) * REGLAS.HUESO_MULT);
        quien.maxHp += extra;
        quien.hp = Math.min(quien.maxHp, quien.hp + extra);
      }
      difundir(P, 'brawl:recoger', { id: o.id, por: quien.id, potencia: quien.potencia, maxHp: quien.maxHp, hp: quien.hp });
    }
    P.objetos = quedan;
  }

  function caer(P, l, asesino) {
    if (!l.vivo) return;
    l.vivo = false;
    l.hp = 0;
    l.muertoEn = P.ahora();
    l.empuje = null;
    var puesto = vivos(P) + 1;
    l.puesto = puesto;
    P.caidas.push(l.id);
    if (asesino && asesino !== l) asesino.bajas++;
    // Suelta sus huesos (y uno más): ir a por el que acaba de caer tiene premio.
    var n = Math.min(4, l.potencia + 1);
    if (P.fase === 'combate') soltarHuesos(P, l.x, l.y, n);
    difundir(P, 'brawl:ko', {
      t: l.id, k: asesino ? asesino.id : 0, puesto: puesto,
      quedan: vivos(P), x: redondea(l.x, 2), y: redondea(l.y, 2)
    });
  }

  /**
   * Fin de la partida. Los que siguen vivos se ordenan por la vida que les
   * queda (en proporción, para no premiar a la especie con más vida); los
   * caídos, al revés de como cayeron.
   */
  function terminar(P, motivo) {
    if (P.fase === 'fin') return;
    P.fase = 'fin';
    var enPie = P.luchadores.filter(function (l) { return l.vivo; });
    enPie.sort(function (a, b) { return b.hp / b.maxHp - a.hp / a.maxHp; });
    var puesto = 1;
    enPie.forEach(function (l) { l.puesto = puesto++; });
    for (var i = P.caidas.length - 1; i >= 0; i--) {
      var c = P.porId[P.caidas[i]];
      c.puesto = puesto++;
    }
    P.balas = [];
    var ganador = P.luchadores.filter(function (l) { return l.puesto === 1; })[0] || null;
    P.resumen = {
      motivo: motivo || 'ko',
      ganador: ganador ? ganador.id : 0,
      duracionMs: Math.max(0, P.ahora() - P.tCombate),
      puestos: P.luchadores.map(function (l) {
        return {
          id: l.id, clave: l.clave, humano: l.humano, playerName: l.playerName,
          petName: l.petName, especie: l.especie, nivel: l.nivel,
          puesto: l.puesto, bajas: l.bajas, dano: Math.round(l.dano),
          potencia: l.potencia, vivo: l.vivo, fuera: l.fuera
        };
      }).sort(function (a, b) { return a.puesto - b.puesto; })
    };
    try { P.alTerminar(P, P.resumen); } catch (e) {
      if (typeof console !== 'undefined') console.error('alTerminar:', e);
    }
  }

  // =========================================================================
  // LO QUE VE CADA UNO
  // =========================================================================
  function loVe(P, obs, l, ahora) {
    if (!obs || obs === l || !obs.vivo) return true;
    if (!l.enArbusto) return true;
    if (l.reveladoHasta > ahora) return true;
    return dist2(obs, l) <= REGLAS.VISION_ARBUSTO * REGLAS.VISION_ARBUSTO;
  }

  /* La instantánea, en listas cortas para que pese poco (20 por segundo):
       f: [id, x, y, hp, banderas, potencia, maxHp]
          banderas: 1 vivo · 2 andando · 4 en la hierba · 8 mira a la izq.
       y: lo tuyo — munición y súper en centésimas, y la posición buena si
          hay que recolocarte (c = número de corrección). */
  function enviarInstantaneas(P, ahora) {
    var zr = Math.round(P.zona.r);
    for (var i = 0; i < P.luchadores.length; i++) {
      var yo = P.luchadores[i];
      if (!yo.humano || yo.fuera) continue;
      var f = [];
      for (var j = 0; j < P.luchadores.length; j++) {
        var l = P.luchadores[j];
        if (!l.vivo) continue;
        if (!loVe(P, yo, l, ahora)) continue;
        var band = 1 | (l.moviendo ? 2 : 0) | (l.enArbusto ? 4 : 0) | (l.mira < 0 ? 8 : 0);
        f.push([l.id, redondea(l.x, 2), redondea(l.y, 2), l.hp, band, l.potencia, l.maxHp]);
      }
      var y = {
        m: Math.round(yo.municion * 100),
        s: Math.round(yo.superCarga * 100),
        c: yo.correccion,
        hp: yo.hp
      };
      /* La posición buena va en TODAS las instantáneas hasta que el cliente
         confirme (con la `c` de sus entradas) que ya la ha aplicado. Mandarla
         una sola vez bastaría con una red perfecta; con una pestaña que se
         queda atrás un momento, esa instantánea se pisa con la siguiente y el
         perro no se recolocaría nunca. */
      if (yo.corregir || yo.cAck < yo.correccion) { y.x = redondea(yo.x, 2); y.y = redondea(yo.y, 2); }
      P.enviar(yo, 'brawl:snap', { t: ahora, k: P.tick, f: f, y: y, z: zr });
    }
    for (var k = 0; k < P.luchadores.length; k++) P.luchadores[k].corregir = false;
    // 'moviendo' de los humanos se apaga si ya no llegan entradas.
    for (var q = 0; q < P.luchadores.length; q++) {
      var h = P.luchadores[q];
      if (h.humano && ahora - h.ultimaEntrada > 120) h.moviendo = false;
    }
  }

  // =========================================================================
  // LOS BOTS
  // =========================================================================
  /* No hacen trampas: ven lo mismo que vería un jugador en su sitio (la
     hierba alta les esconde a la gente igual), disparan con la misma munición
     y cadencia, y fallan. Lo que cambia con la ronda es la ASTUCIA (0,2 en la
     primera batalla del día, 0,6 en la quinta):

       · puntería: el error del disparo va de ±14° a ±7°;
       · adelantar el tiro a donde vas a estar, en vez de a donde estás;
       · cuánto tardan en reaccionar al verte (450 ms → 180 ms);
       · a partir de 0,4 se esconden en la hierba, y a partir de 0,5 se
         retiran a curarse cuando van mal de vida. */
  function crearIA(astucia) {
    var a = Number.isFinite(Number(astucia)) ? Math.max(0, Math.min(1, Number(astucia))) : 0.35;
    return {
      astucia: a,
      objetivo: null,
      vistoDesde: 0,
      perdidoDesde: 0,
      proxima: 0,
      dirX: 0, dirY: 0,
      ruta: null,
      rutaHasta: 0,
      rutaObjetivo: null,
      estrafe: 1,
      cambioEstrafe: 0,
      proximoDisparo: 0,
      destino: null,
      destinoHasta: 0,
      atascado: 0,
      ultX: 0, ultY: 0
    };
  }

  function celdaCentro(R, cx, cy) {
    return { x: (cx + 0.5) * R.celda, y: (cy + 0.5) * R.celda };
  }

  /** Camino por casillas (BFS con diagonales que no muerden esquinas). */
  function buscarRuta(R, x0, y0, x1, y1, maxNodos) {
    var W = R.ancho, Hh = R.alto;
    var a = Math.floor(x0 / R.celda) + Math.floor(y0 / R.celda) * W;
    var bx = Math.floor(x1 / R.celda), by = Math.floor(y1 / R.celda);
    // Si el destino no se puede pisar (un muro, el agua), el vecino libre más cercano.
    if (bloqueaPaso(celdaEn(R, bx, by))) {
      var mejor = null, md = Infinity;
      for (var oy = -2; oy <= 2; oy++) for (var ox = -2; ox <= 2; ox++) {
        if (!bloqueaPaso(celdaEn(R, bx + ox, by + oy))) {
          var dd = ox * ox + oy * oy;
          if (dd < md) { md = dd; mejor = [bx + ox, by + oy]; }
        }
      }
      if (!mejor) return null;
      bx = mejor[0]; by = mejor[1];
    }
    var b = bx + by * W;
    if (a === b) return [];
    var previo = new Int32Array(W * Hh).fill(-1);
    previo[a] = a;
    var cola = [a], cab = 0;
    var vecinos = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    var limite = maxNodos || 2000;
    while (cab < cola.length && cab < limite) {
      var c = cola[cab++];
      if (c === b) break;
      var cx = c % W, cy = (c - cx) / W;
      for (var k = 0; k < vecinos.length; k++) {
        var nx = cx + vecinos[k][0], ny = cy + vecinos[k][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= Hh) continue;
        var n = nx + ny * W;
        if (previo[n] !== -1 || bloqueaPaso(R.celdas[n])) continue;
        if (k >= 4 && (bloqueaPaso(celdaEn(R, cx + vecinos[k][0], cy)) || bloqueaPaso(celdaEn(R, cx, cy + vecinos[k][1])))) continue;
        previo[n] = c;
        cola.push(n);
      }
    }
    if (previo[b] === -1) return null;
    var ruta = [];
    for (var p = b; p !== a; p = previo[p]) ruta.push(p);
    ruta.reverse();
    return ruta.map(function (i) { return celdaCentro(R, i % W, Math.floor(i / W)); });
  }

  function gauss(azar) {
    var u = Math.max(1e-6, azar()), v = azar();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function pensarBot(P, l, t, dt) {
    var ia = l.ia;
    var R = P.R;
    var enCombate = t - P.tCombate;
    var az = P.azar;

    // ── decidir (5-7 veces por segundo, no en cada paso) ──
    if (t >= ia.proxima) {
      ia.proxima = t + 140 + az() * 120 * (1.2 - ia.astucia);
      decidirBot(P, l, t, enCombate);
    }

    // ── andar ──
    var mx = ia.dirX, my = ia.dirY;
    var largo = Math.sqrt(mx * mx + my * my);
    var antesX = l.x, antesY = l.y;
    if (largo > 0.01) {
      var v = l.vel * dt / largo;
      var p = moverCirculo(R, l.x, l.y, mx * v, my * v, l.r);
      l.x = p[0]; l.y = p[1];
    }
    var movido = Math.abs(l.x - antesX) + Math.abs(l.y - antesY);
    l.moviendo = movido > 0.2;
    l.vx = (l.x - antesX) / dt;
    l.vy = (l.y - antesY) / dt;
    if (Math.abs(l.x - antesX) > 0.2) l.mira = l.x > antesX ? 1 : -1;
    // atascado contra algo: se le cambia el rumbo
    if (largo > 0.01 && movido < 0.4) {
      ia.atascado += dt;
      if (ia.atascado > 0.6) { ia.ruta = null; ia.estrafe *= -1; ia.atascado = 0; ia.proxima = t; }
    } else ia.atascado = 0;

    // ── disparar ──
    var obj = ia.objetivo ? P.porId[ia.objetivo] : null;
    if (obj && obj.vivo && t >= ia.proximoDisparo && t - ia.vistoDesde >= ia.reaccion) {
      var d = Math.sqrt(dist2(l, obj));
      var usarSuper = l.superCarga >= 1 && d <= l.superArma.alcance * 0.85;
      var arma = usarSuper ? l.superArma : l.arma;
      if (d <= arma.alcance * 0.96 && lineaDeTiro(R, l.x, l.y, obj.x, obj.y) && (usarSuper || l.municion >= 1)) {
        // apuntar: adelantar el tiro según la astucia, y fallar un poco
        var tVuelo = d / arma.vel;
        var px = obj.x + (obj.vx || 0) * tVuelo * ia.astucia;
        var py = obj.y + (obj.vy || 0) * tVuelo * ia.astucia;
        var ang = Math.atan2(py - l.y, px - l.x) + gauss(az) * (1 - ia.astucia) * 0.30;
        // No vaciar el cargador de golpe si no hace falta: los listos guardan una.
        var guarda = !usarSuper && ia.astucia >= 0.45 && l.municion < 2 && d > arma.alcance * 0.6;
        if (!guarda && dispararAngulo(P, l, ang, usarSuper, null)) {
          ia.proximoDisparo = t + arma.cadencia + az() * 420 * (1.1 - ia.astucia);
        }
      }
    } else if (!obj && t >= ia.proximoDisparo) {
      // Sin nadie a la vista: si tiene una caja dorada a tiro, a por ella.
      var caja = cajaOroCerca(P, l);
      if (caja && l.municion >= 2) {
        var a2 = Math.atan2(caja.y - l.y, caja.x - l.x);
        if (dispararAngulo(P, l, a2, false, null)) ia.proximoDisparo = t + l.arma.cadencia + 300;
      }
    }
  }

  function cajaOroCerca(P, l) {
    var R = P.R, mejor = null, md = Infinity;
    Object.keys(R.cajas).forEach(function (k) {
      var c = R.cajas[k];
      if (!c.oro) return;
      var i = Number(k);
      var pt = celdaCentro(R, i % R.ancho, Math.floor(i / R.ancho));
      var d = dist2(l, pt);
      if (d < md && d <= l.arma.alcance * l.arma.alcance * 0.8 && lineaDeTiro(R, l.x, l.y, pt.x, pt.y)) {
        md = d; mejor = pt;
      }
    });
    return mejor;
  }

  function decidirBot(P, l, t, enCombate) {
    var ia = l.ia, R = P.R, az = P.azar;
    if (ia.reaccion == null) ia.reaccion = 450 - 450 * ia.astucia + 90;

    // 1) ¿A quién ve?
    var mejor = null, md = Infinity;
    for (var i = 0; i < P.luchadores.length; i++) {
      var o = P.luchadores[i];
      if (o === l || !o.vivo) continue;
      if (!loVe(P, l, o, t)) continue;
      var d = dist2(l, o);
      // Prefiere seguir con el que ya tenía (no salta de uno a otro).
      if (o.id === ia.objetivo) d *= 0.6;
      if (d < md) { md = d; mejor = o; }
    }
    if (mejor) {
      if (ia.objetivo !== mejor.id) ia.vistoDesde = t;
      ia.objetivo = mejor.id;
      ia.perdidoDesde = 0;
    } else if (ia.objetivo) {
      if (!ia.perdidoDesde) ia.perdidoDesde = t;
      if (t - ia.perdidoDesde > 1500) ia.objetivo = null;
    }
    var obj = ia.objetivo ? P.porId[ia.objetivo] : null;
    if (obj && !obj.vivo) { ia.objetivo = null; obj = null; }

    // 2) La niebla manda sobre todo lo demás.
    var z = P.zona;
    var dz = Math.sqrt(dist2(l, z));
    if (enCombate >= REGLAS.ZONA_INICIO_MS - 4000 && dz > z.r - R.celda * 1.6) {
      irHacia(P, l, z.cx, z.cy, t);
      return;
    }

    // 3) Mal de vida y listo: a esconderse a curarse.
    var vida = l.hp / l.maxHp;
    if (obj && vida < 0.32 && ia.astucia >= 0.5) {
      var hx = l.x - obj.x, hy = l.y - obj.y;
      var hl = Math.sqrt(hx * hx + hy * hy) || 1;
      var arb = arbustoCerca(P, l, 6);
      if (arb && dist2(arb, obj) > dist2(l, obj)) irHacia(P, l, arb.x, arb.y, t);
      else fijarDir(ia, hx / hl, hy / hl);
      return;
    }

    if (obj) {
      var dd = Math.sqrt(dist2(l, obj));
      var alcance = l.arma.alcance;
      var ideal = alcance < 150 ? alcance * 0.45 : alcance * 0.68;
      var tiro = lineaDeTiro(R, l.x, l.y, obj.x, obj.y);
      if (!tiro || dd > alcance * 0.92) {
        irHacia(P, l, obj.x, obj.y, t);
        return;
      }
      // A tiro: moverse de lado (esquivar) y corregir la distancia.
      if (t >= ia.cambioEstrafe) {
        ia.estrafe = az() < 0.5 ? -1 : 1;
        ia.cambioEstrafe = t + 500 + az() * 900;
      }
      var ux = (obj.x - l.x) / (dd || 1), uy = (obj.y - l.y) / (dd || 1);
      var acerca = dd > ideal * 1.15 ? 0.7 : (dd < ideal * 0.75 ? -0.7 : 0);
      var lado = 0.55 + 0.45 * ia.astucia;
      fijarDir(ia, ux * acerca + -uy * ia.estrafe * lado, uy * acerca + ux * ia.estrafe * lado);
      ia.ruta = null;
      return;
    }

    // 4) Nadie a la vista: un hueso cerca, o explorar (los listos, por la hierba).
    var hueso = null, mh = (R.celda * 7) * (R.celda * 7);
    for (var h = 0; h < P.objetos.length; h++) {
      var dh = dist2(l, P.objetos[h]);
      if (dh < mh) { mh = dh; hueso = P.objetos[h]; }
    }
    if (hueso) { irHacia(P, l, hueso.x, hueso.y, t); return; }

    if (!ia.destino || t >= ia.destinoHasta || dist2(l, ia.destino) < 20 * 20) {
      var arb2 = ia.astucia >= 0.4 && az() < 0.5 ? arbustoCerca(P, l, 9) : null;
      ia.destino = arb2 || puntoLibreAlAzar(P, l);
      ia.destinoHasta = t + 2500 + az() * 2500;
      ia.ruta = null;
    }
    if (ia.destino) irHacia(P, l, ia.destino.x, ia.destino.y, t);
  }

  function fijarDir(ia, x, y) {
    var n = Math.sqrt(x * x + y * y);
    if (n < 1e-3) { ia.dirX = 0; ia.dirY = 0; return; }
    ia.dirX = x / n; ia.dirY = y / n;
  }

  function irHacia(P, l, x, y, t) {
    var ia = l.ia, R = P.R;
    // En línea recta si se puede (y no hay agua ni muro en medio).
    if (lineaLibre(R, l.x, l.y, x, y, l.r)) {
      ia.ruta = null;
      fijarDir(ia, x - l.x, y - l.y);
      return;
    }
    var clave = Math.floor(x / R.celda) + ',' + Math.floor(y / R.celda);
    if (!ia.ruta || t >= ia.rutaHasta || ia.rutaObjetivo !== clave) {
      ia.ruta = buscarRuta(R, l.x, l.y, x, y) || [];
      ia.rutaHasta = t + 700;
      ia.rutaObjetivo = clave;
    }
    while (ia.ruta.length && dist2(l, ia.ruta[0]) < 8 * 8) ia.ruta.shift();
    // Atajo: si el punto siguiente al siguiente ya se ve, se salta uno.
    if (ia.ruta.length > 1 && lineaLibre(R, l.x, l.y, ia.ruta[1].x, ia.ruta[1].y, l.r)) ia.ruta.shift();
    var sig = ia.ruta[0];
    if (sig) fijarDir(ia, sig.x - l.x, sig.y - l.y);
    else fijarDir(ia, x - l.x, y - l.y);
  }

  /** ¿Se puede ir andando en línea recta? (con el ancho del cuerpo) */
  function lineaLibre(R, x0, y0, x1, y1, r) {
    var dx = x1 - x0, dy = y1 - y0;
    var largo = Math.sqrt(dx * dx + dy * dy);
    if (largo < 1) return true;
    var nx = -dy / largo * r * 0.9, ny = dx / largo * r * 0.9;
    var n = Math.max(1, Math.ceil(largo / 8));
    for (var i = 1; i <= n; i++) {
      var t = i / n;
      var px = x0 + dx * t, py = y0 + dy * t;
      if (bloqueaPaso(celdaDePunto(R, px, py)) ||
          bloqueaPaso(celdaDePunto(R, px + nx, py + ny)) ||
          bloqueaPaso(celdaDePunto(R, px - nx, py - ny))) return false;
    }
    return true;
  }

  function arbustoCerca(P, l, radioCeldas) {
    var R = P.R;
    var cx = Math.floor(l.x / R.celda), cy = Math.floor(l.y / R.celda);
    var mejor = null, md = Infinity;
    for (var y = cy - radioCeldas; y <= cy + radioCeldas; y++) {
      for (var x = cx - radioCeldas; x <= cx + radioCeldas; x++) {
        if (celdaEn(R, x, y) !== '*') continue;
        var p = celdaCentro(R, x, y);
        var d = dist2(l, p);
        if (d < md) { md = d; mejor = p; }
      }
    }
    return mejor;
  }

  function puntoLibreAlAzar(P, l) {
    var R = P.R;
    for (var i = 0; i < 30; i++) {
      var cx = Math.floor(P.azar() * R.ancho), cy = Math.floor(P.azar() * R.alto);
      if (bloqueaPaso(celdaEn(R, cx, cy))) continue;
      var p = celdaCentro(R, cx, cy);
      if (Math.sqrt(dist2(p, P.zona)) > P.zona.r - R.celda * 2) continue;
      return p;
    }
    return { x: P.zona.cx, y: P.zona.cy };
  }

  // =========================================================================
  return {
    VERSION: VERSION,
    ARENAS: ARENAS,
    REGLAS: REGLAS,
    ARMAS: ARMAS,
    ESPECIES: ESPECIES,
    // física compartida
    crearRejilla: crearRejilla,
    filasDe: filasDe,
    celdaEn: celdaEn,
    celdaDePunto: celdaDePunto,
    bloqueaPaso: bloqueaPaso,
    bloqueaBala: bloqueaBala,
    romperCaja: romperCaja,
    empujarFuera: empujarFuera,
    moverCirculo: moverCirculo,
    avanzarBala: avanzarBala,
    lineaDeTiro: lineaDeTiro,
    buscarRuta: buscarRuta,
    // la partida (servidor y bancos de prueba)
    crearPartida: crearPartida,
    paso: paso,
    entrada: entrada,
    disparar: disparar,
    abandonar: abandonar,
    terminar: terminar,
    loVe: loVe
  };
});
