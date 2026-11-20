/*!
 * gf-brawl-motor.js — el motor de las batallas de arena (Grassland Forest)
 * ===========================================================================
 *
 * Batallas en tiempo real al estilo de un "brawl": cada jugador ES su perro,
 * se mueve por una arena de casillas, dispara, se esconde en la hierba alta,
 * rompe cajas para coger huesos de poder y aguanta mientras el GAS entra desde
 * los bordes de la arena. Gana el último que queda en pie.
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
 *   brawl:snap     20 veces por segundo: dónde está cada uno que ves, y el gas
 *   brawl:balas    alguien ha disparado (para dibujar las balas)
 *   brawl:golpe    una bala ha dado a alguien
 *   brawl:caja     una caja ha recibido un golpe o se ha roto
 *   brawl:objeto   ha aparecido algo en el suelo: un hueso o carne (cura)
 *   brawl:recoger  alguien lo ha cogido
 *   brawl:boom     ha explotado un barril (x, y, radio)
 *   brawl:ko       alguien ha caído
 *   brawl:fin      (lo manda el host, con los puntos ya guardados)
 *
 * SI SE CAE LA CONEXIÓN (2026-10-02)
 * ---------------------------------------------------------------------------
 *   desconectar(P, id)   el perro NO cae: lo lleva un piloto automático flojo
 *                        y no se le manda nada mientras tanto.
 *   reconectar(P, id)    vuelve: se le manda la partida tal y como está (un
 *                        brawl:inicio con `reanudar`) y recupera el mando.
 * El host decide cuánto se espera; si se cansa, llama a abandonar().
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else raiz.GFBrawlMotor = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 3;

  /* <<ARENAS>> — lo escribe tools/generar-arenas.py a partir de los mapas.
     No se edita a mano: se cambia el mapa (o el diseño del generador) y se
     vuelve a lanzar. Leyenda: "#" muro, "~" agua, "*" arbusto, "c" caja,
     "o" caja dorada, "x" barril, "+" comedero, "=" puente, "." libre.
     Apariciones en casillas DEL CAMPO (sin contar el marco). `marco` son las
     casillas de borde macizo que crearRejilla añade alrededor: lo que se ve
     fuera del campo (el seto y el bosque) y contra lo que se choca. */
  var ARENAS = {
    pradera: {
      nombre: 'Meadow', tema: 'pradera', ancho: 30, alto: 22, celda: 32, marco: 6,
      filas: [
        '..............................',
        '.....#....***.........c.......',
        '.....#....****................',
        '.....###...***+...............',
        '.......................###....',
        '........c..........****..#....',
        '.**............o...****..#....',
        '.***c..##..xx.................',
        '.......##.....................',
        '.............~~~~....##..***..',
        '............~~~~~~............',
        '............~~~~~~............',
        '..***..##....~~~~.............',
        '.....................##.......',
        '.................xx..##..c***.',
        '....#..****...o............**.',
        '....#..****..........c........',
        '....###.......................',
        '...............+***...###.....',
        '................****....#.....',
        '.......c.........***....#.....',
        '..............................'
      ],
      apariciones: [[2,2],[27,2],[3,9],[27,19],[2,19],[26,12]]
    },
    ruinas: {
      nombre: 'Ruins', tema: 'ruinas', ancho: 30, alto: 22, celda: 32, marco: 6,
      filas: [
        '..............................',
        '.............****........c....',
        '......####....................',
        '......#..............#........',
        '......***..c....xx...###......',
        '**....**.....##...............',
        '**......................+.....',
        '**..c....#......o....***......',
        '..................#..***..##..',
        '.............~~~~.#...........',
        '.............~~~~.............',
        '.............~~~~.............',
        '...........#.~~~~.............',
        '..##..***..#..................',
        '......***....o......#....c..**',
        '.....+......................**',
        '...............##.....**....**',
        '......###...xx....c..***......',
        '........#..............#......',
        '....................####......',
        '....c........****.............',
        '..............................'
      ],
      apariciones: [[3,3],[26,3],[3,10],[26,18],[3,18],[26,11]]
    },
    rio: {
      nombre: 'River', tema: 'rio', ancho: 30, alto: 22, celda: 32, marco: 6,
      filas: [
        '..............................',
        '..................c...........',
        '.........###..........#.......',
        '.........#..........###.......',
        '***........***...+............',
        '...c.......****.#......***....',
        '....##..........#......***c...',
        '.............o......xx........',
        '...........~~~~~........~~~...',
        '~~~~~~==~~~~~~~~~~~~~~==~~~~~~',
        '~~~~~~==~~~~~~~~~~~~~~==~~~~~~',
        '~~~~~~==~~~~~~~~~~~~~~==~~~~~~',
        '~~~~~~==~~~~~~~~~~~~~~==~~~~~~',
        '...~~~........~~~~~...........',
        '........xx......o.............',
        '...c***......#..........##....',
        '....***......#.****.......c...',
        '............+...***........***',
        '.......###..........#.........',
        '.......#..........###.........',
        '...........c..................',
        '..............................'
      ],
      apariciones: [[2,2],[27,2],[14,3],[27,19],[2,19],[15,18]]
    },
    nieve: {
      nombre: 'Frostfield', tema: 'nieve', ancho: 30, alto: 22, celda: 32, marco: 6,
      filas: [
        '..............................',
        '.....##.....+.......c.........',
        '.....#..***...................',
        '........****..........###.....',
        '........................#.....',
        '**........c...................',
        '**..~~.............x....***...',
        '....~~.........o........***...',
        '.......x....##................',
        '..................#...........',
        '..............................',
        '..............................',
        '...........#..................',
        '................##....x.......',
        '...***........o.........~~....',
        '...***....x.............~~..**',
        '...................c........**',
        '.....#........................',
        '.....###..........****........',
        '...................***..#.....',
        '.........c.......+.....##.....',
        '..............................'
      ],
      apariciones: [[2,2],[27,2],[14,3],[27,19],[2,19],[15,18]]
    },
    canon: {
      nombre: 'Canyon', tema: 'canon', ancho: 30, alto: 22, celda: 32, marco: 6,
      filas: [
        '.......................##.....',
        '.....###...+.c.........##.....',
        '.....###...............##.....',
        '........xx....................',
        '.................#............',
        '.................#........x...',
        '**..............o.............',
        '***.......##..................',
        '...c...............x....**....',
        '........***..~~~~.......**....',
        '.............~~~~.............',
        '.............~~~~.............',
        '....**.......~~~~..***........',
        '....**....x...............c...',
        '..................##.......***',
        '.............o..............**',
        '...x........#.................',
        '............#.................',
        '....................xx........',
        '.....##...............###.....',
        '.....##.........c.+...###.....',
        '.....##.......................'
      ],
      apariciones: [[2,2],[27,3],[13,4],[27,19],[2,18],[16,17]]
    }
  };
  /* <</ARENAS>> */

  // =========================================================================
  // REGLAS
  // =========================================================================
  /* Las cifras salen de jugar, no de una fórmula, pero tienen su porqué:
   *
   *  · VELOCIDAD 100 px/s = unas 3 casillas por segundo. El perro mide una
   *    casilla: cruza el campo (30 casillas) en unos 10 segundos. Da tiempo a
   *    pensar por dónde ir, y una persecución no se eterniza.
   *  · VIDA ×10 y DAÑO ×12 sobre la curva de siempre (battleStatsForLevel:
   *    80 + 12·nivel de vida, 10 + 2·nivel de ataque). Con eso un perro cae
   *    con 6 ladridos a nivel 1 y con 5-6 a nivel 10: los combates duran lo
   *    que tarda en recargarse dos veces el cargador, que es lo que hace que
   *    apuntar importe más que tener nivel.
   *  · EL GAS ENTRA DESDE LOS BORDES (2026-11-15). Antes había una "zona"
   *    circular con su anillo blanco marcado en el suelo y un centro que se
   *    movía por fases: "la zona se marca cuando en este tipo de juego no es
   *    así". Ahora no se marca nada: a los 30 s el gas empieza a entrar por
   *    los cuatro lados a la vez y avanza a paso fijo (una casilla cada 9 s)
   *    hasta dejar libre el centro (17×9 casillas en una arena de 30×22: el
   *    estanque del medio y sitio para pelear alrededor). Lo que se ve es el
   *    propio gas viniendo; no hay círculo que leer. Dentro quita vida, cada
   *    vez más. Todo cerrado a los ~90 s; a los 210 s se acaba por tiempo.
   *  · La VIDA se REGENERA a los 4 s sin pegar ni recibir, y DESPACIO (un 5 %
   *    por segundo: de media vida a entera son 10 s parado). Antes eran 3 s y
   *    un 10 %: "se cura muy rápido". Retirarse sigue valiendo, pero cuesta
   *    tiempo de verdad y el gas no espera.
   *  · BARRILES ('x'): aguantan dos golpes y al romperse EXPLOTAN — quitan
   *    hasta un 32 % de la vida máxima a quien pille cerca (también a quien
   *    dispara, si está encima), empujan, rompen cajas y encienden a los
   *    barriles de al lado. Un muro en medio protege.
   *  · COMEDEROS ('+'): cada 15 s sale carne que cura un 35 %. Solo la coge
   *    quien está herido: no se puede "gastar" para que no la pille otro.
   *  · EL CUERPO ESTÁ DONDE SE VE. El círculo con el que se ANDA va en los
   *    pies; el dibujo sube unos 30 px por encima. Las balas salían de los
   *    pies y solo daban en los pies: una que cruzaba la cabeza del rival no
   *    le daba ("colisiones mal puestas"). Ahora salen del cuerpo
   *    (ALTO_CUERPO px por encima de los pies) y dan en el cuerpo.
   */
  var REGLAS = {
    TICK_MS: 50,                 // 20 pasos de simulación por segundo
    RADIO: 11,                   // el círculo con el que choca (anda) un luchador
    ALTO_CUERPO: 7,              // px por encima de los pies: de ahí salen y ahí dan las balas
    RADIO_GOLPE: 12,             // el círculo del cuerpo, para las balas
    VEL: 100,                    // px/s del perro
    ESCALA_VIDA: 10,
    ESCALA_DANO: 12,
    MUNICION: 3,
    REGEN_ESPERA_MS: 4000,
    REGEN_POR_S: 0.05,           // de la vida máxima
    CUENTA_MS: 3000,
    GAS_INICIO_MS: 30000,        // ms de combate hasta que empieza a entrar
    GAS_VEL: 3.6,                // px/s que avanza desde cada borde (1 casilla cada ~9 s)
    GAS_HUECO_MIN: 288,          // px que quedan libres, como poco, en el lado corto
    GAS_DANO_S: 0.05,            // vida máxima por segundo al empezar…
    GAS_DANO_MAX_S: 0.16,        // …y cuando lleva GAS_RAMPA_S segundos
    GAS_RAMPA_S: 110,
    DURACION_MAX_MS: 210000,
    CAJAS_EXTRA: 10,
    PODER_DURACION_MS: 8000,
    PODER_VELOCIDAD_MULT: 1.20,
    ESCUDO_VIDA: 0.25,
    BARRIL_VIDA: 2,
    BARRIL_RADIO: 76,
    BARRIL_DANO: 0.32,           // de la vida máxima, en el centro (0,14 en el borde)
    BARRIL_EMPUJE: 74,
    BARRIL_CADENA_MS: 160,       // lo que tarda en saltar el barril de al lado
    CURA_PRIMERA_MS: 9000,
    CURA_CADA_MS: 15000,
    CURA_VIDA: 0.35,
    VISION_ARBUSTO: 84,          // a esta distancia ves a quien está en la hierba
    REVELA_MS: 1200,             // disparar o recibir te delata este rato
    CAJA_VIDA: 2,                // golpes que aguanta una caja
    CAJA_ORO_VIDA: 4,
    HUESO_MULT: 0.10,            // +10 % de daño y de vida por hueso
    HUESO_MAX: 8,
    HUESO_RADIO: 22,
    /* EL MOVIMIENTO, MÁS CEÑIDO (anti-trampas). El cliente manda su posición
       y el servidor la recorta a lo que se puede andar. La tolerancia era de
       un 25 %: un cliente trucado corría un 25 % más y nadie lo notaba. Con
       un 6 % sigue habiendo sitio para el desfase de relojes (un navegador
       que mide 16,9 ms donde el servidor mide 16,6) y correr de más ya no
       compensa. El presupuesto (lo que se puede "deber" tras un parón de la
       red) baja de 350 a 300 ms. */
    PRESUPUESTO_MS: 300,
    TOLERANCIA: 1.06,
    CORRECCION_MIN: 3,           // px de diferencia para recolocar al cliente
    ENTRADAS_POR_S: 40,          // tope de paquetes de movimiento
    DISPAROS_POR_S: 14,          // tope de PETICIONES de disparo (la cadencia manda aparte)
    SALUD_MINIMA_ENTRADA: 0.20,  // nadie entra con menos de esto (ver abajo)
    VISTA_X: 10.5,               // casillas que ve un bot a cada lado (lo que ve una pantalla)…
    VISTA_Y: 6.5,                // …y arriba y abajo
    DDA_FUERZA: 0.22             // cuánto puede moverse la astucia de un bot contra un humano
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

  /* VELOCIDADES, MÁS JUNTAS (2026-11-15) — "los enemigos van muy rápidos".
     El conejo de la primera batalla del día corría un 16 % más que tu perro:
     ni le alcanzabas ni te escapabas. Ahora todo el mundo anda entre un 10 %
     menos y un 5 % más; lo que distingue a las especies es el arma y la vida.

     `golpe`: el radio de su cuerpo para las BALAS (el de andar es el mismo
     para todos, REGLAS.RADIO). Va con el tamaño del dibujo: el cocodrilo mide
     70 px de largo y el conejo 26; con el mismo círculo, al cocodrilo se le
     atravesaba la cola y al conejo se le daba en el aire. */
  var ESPECIES = {
    perro:     { vel: 1.00, vida: 1.00, arma: 'ladrido',    super: 'aullido',   etiqueta: 'Dog',    golpe: 12 },
    conejo:    { vel: 1.05, vida: 0.90, arma: 'mordisco',   super: 'estampida', etiqueta: 'Rabbit', golpe: 10 },
    cerdo:     { vel: 0.92, vida: 1.12, arma: 'colmillos',  super: 'embestida', etiqueta: 'Boar',   golpe: 13 },
    cuervo:    { vel: 1.02, vida: 0.90, arma: 'plumas',     super: 'bandada',   etiqueta: 'Crow',   golpe: 11 },
    zorro:     { vel: 1.03, vida: 0.96, arma: 'zarpazo',    super: 'fuego',     etiqueta: 'Fox',    golpe: 12 },
    zorra:     { vel: 1.03, vida: 0.96, arma: 'zarpazo',    super: 'bandada',   etiqueta: 'Vixen',  golpe: 12 },
    cocodrilo: { vel: 0.90, vida: 1.18, arma: 'dentellada', super: 'embestida', etiqueta: 'Croc',   golpe: 15 },
    vibora:    { vel: 0.98, vida: 0.94, arma: 'escupitajo', super: 'fuego',     etiqueta: 'Viper',  golpe: 11 },
    coral:     { vel: 0.98, vida: 0.94, arma: 'escupitajo', super: 'bandada',   etiqueta: 'Coral',  golpe: 11 },
    topo:      { vel: 0.95, vida: 1.05, arma: 'mordisco',   super: 'embestida', etiqueta: 'Mole',   golpe: 11 },
    vaca:      { vel: 0.90, vida: 1.15, arma: 'colmillos',  super: 'embestida', etiqueta: 'Bull',   golpe: 15 }
  };

  function propia(tabla, clave) { return Object.prototype.hasOwnProperty.call(tabla, clave); }
  function finito(valor, respaldo, min, max) { var n = Number(valor); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : respaldo; }
  function especie(id) { return propia(ESPECIES, id) ? ESPECIES[id] : ESPECIES.perro; }

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
       'x' barril    como una caja, pero al romperse explota
       '+' comedero  se pisa; de vez en cuando sale carne que cura
       '.' libre */
  /* EL MARCO. `def.marco` casillas de borde MACIZO alrededor del campo: es lo
     que hay fuera (el seto, el bosque) y por eso choca como un muro. Antes el
     campo acababa en el borde del mundo y contra eso se chocaba "con nada":
     una pared que no se veía. Ahora el borde es una casilla como otra
     cualquiera, se dibuja, y la cámara tiene sitio para centrar al perro
     aunque esté en una esquina. Las coordenadas de TODO (luchadores, balas,
     objetos) son las de la rejilla entera, con el marco dentro.
     El servidor manda la rejilla ya con su marco (`marcoIncluido`): el
     cliente no lo vuelve a añadir. */
  function crearRejilla(def) {
    if (!def || !Number.isInteger(def.ancho) || !Number.isInteger(def.alto) || def.ancho < 1 || def.alto < 1 || def.ancho * def.alto > 65536) throw new TypeError('dimensiones de arena inválidas');
    var C = def.celda === undefined ? 32 : Number(def.celda);
    if (!Number.isFinite(C) || C <= 0 || C > 1024) throw new TypeError('tamaño de casilla inválido');
    var marco = Number.isInteger(def.marco) && def.marco > 0 && def.marco <= 16 ? def.marco : 0;
    var M = def.marcoIncluido ? 0 : marco;                 // lo que hay que AÑADIR
    var W = def.ancho + 2 * M, Hh = def.alto + 2 * M;
    if (W * Hh > 65536) throw new TypeError('dimensiones de arena inválidas');
    if (def.marcoIncluido && (marco * 2 >= W || marco * 2 >= Hh)) marco = 0;
    var celdas = new Array(W * Hh);
    var cajas = {};
    var curas = [];
    for (var y = 0; y < Hh; y++) {
      var dentroY = y >= M && y < Hh - M;
      var fila = dentroY ? String((def.filas && def.filas[y - M]) || '') : '';
      for (var x = 0; x < W; x++) {
        var ch = (dentroY && x >= M && x < W - M) ? (fila.charAt(x - M) || '#') : '#';
        if ('#~*cox+=.'.indexOf(ch) < 0) ch = '.';
        celdas[y * W + x] = ch;
        if (ch === 'c') cajas[y * W + x] = { vida: REGLAS.CAJA_VIDA, max: REGLAS.CAJA_VIDA, oro: false };
        if (ch === 'o') cajas[y * W + x] = { vida: REGLAS.CAJA_ORO_VIDA, max: REGLAS.CAJA_ORO_VIDA, oro: true };
        if (ch === 'x') cajas[y * W + x] = { vida: REGLAS.BARRIL_VIDA, max: REGLAS.BARRIL_VIDA, oro: false, barril: true };
        if (ch === '+') curas.push(y * W + x);
      }
    }
    return {
      ancho: W, alto: Hh, celda: C, celdas: celdas, cajas: cajas, curas: curas,
      anchoPx: W * C, altoPx: Hh * C,
      marco: marco,
      // El CAMPO (lo de dentro del marco), en px: por donde se anda y entra el gas.
      juego: { x0: marco * C, y0: marco * C, x1: (W - marco) * C, y1: (Hh - marco) * C }
    };
  }

  /** La rejilla como filas de texto (lo que se manda al cliente). */
  function filasDe(R) {
    var out = [];
    for (var y = 0; y < R.alto; y++) out.push(R.celdas.slice(y * R.ancho, (y + 1) * R.ancho).join(''));
    return out;
  }

  function celdaEn(R, cx, cy) {
    if (!Number.isInteger(cx) || !Number.isInteger(cy) || cx < 0 || cy < 0 || cx >= R.ancho || cy >= R.alto) return '#';
    return R.celdas[cy * R.ancho + cx];
  }

  function celdaDePunto(R, x, y) {
    return celdaEn(R, Math.floor(x / R.celda), Math.floor(y / R.celda));
  }

  function bloqueaPaso(ch) { return ch === '#' || ch === '~' || ch === 'c' || ch === 'o' || ch === 'x'; }
  function bloqueaBala(ch) { return ch === '#' || ch === 'c' || ch === 'o' || ch === 'x'; }
  function esCaja(ch) { return ch === 'c' || ch === 'o' || ch === 'x'; }

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
    if (![x, y, dx, dy, r].every(Number.isFinite) || r <= 0) {
      return [finito(x, R.anchoPx / 2, 0, R.anchoPx), finito(y, R.altoPx / 2, 0, R.altoPx)];
    }
    var largo = Math.max(Math.abs(dx), Math.abs(dy));
    var limite = Math.min(Math.max(R.anchoPx, R.altoPx) * 2, r * 0.9 * 4096);
    if (largo > limite) { dx *= limite / largo; dy *= limite / largo; largo = limite; }
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
    if (!b || ![b.x, b.y, b.dx, b.dy, b.resto, dist].every(Number.isFinite) || dist < 0) return { fin: true };
    dist = Math.min(dist, Math.max(0, b.resto) + 6, Math.max(R.anchoPx, R.altoPx) * 2);
    var n = Math.max(1, Math.ceil(dist / 6));
    var paso = dist / n;
    for (var i = 0; i < n; i++) {
      b.x += b.dx * paso;
      b.y += b.dy * paso;
      b.resto -= paso;
      var cx = Math.floor(b.x / R.celda), cy = Math.floor(b.y / R.celda);
      var ch = celdaEn(R, cx, cy);
      if (bloqueaBala(ch)) {
        if (esCaja(ch)) return { caja: cy * R.ancho + cx };
        return { muro: true };
      }
      if (alPaso && alPaso(b)) return { luchador: true };
      if (b.resto <= 0) return { fin: true };
    }
    return null;
  }

  /** ¿Pasa una bala de A a B? (los arbustos y el agua no tapan). */
  function lineaDeTiro(R, x0, y0, x1, y1) {
    if (![x0, y0, x1, y1].every(Number.isFinite) || x0 < 0 || y0 < 0 || x1 < 0 || y1 < 0 || x0 > R.anchoPx || x1 > R.anchoPx || y0 > R.altoPx || y1 > R.altoPx) return false;
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
    if (!op || !Array.isArray(op.luchadores) || op.luchadores.length < 1 || op.luchadores.length > 64 || op.luchadores.some(function (s) { return !s || typeof s !== 'object'; })) throw new TypeError('luchadores inválidos');
    var ahora = op.ahora || function () { return Date.now(); };
    var azar = op.azar || Math.random;
    var def = typeof op.arena === 'string' ? (propia(ARENAS, op.arena) ? ARENAS[op.arena] : null) : op.arena;
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
      porId: Object.create(null),
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
      gas: null,
      curas: [],
      pendientes: [],      // barriles que van a saltar en cadena { t, idx, duenio }
      resumen: null,
      extraInicio: op.extraInicio || null,
      // La dificultad que se adapta (ver "LA DIFICULTAD SE ADAPTA", en los bots).
      dda: op.dda !== false,
      habMedia: 0.5,
      tDda: 0
    };

    var apar = (def.apariciones || []).slice();
    // Orden de uso: cada uno con su gemelo girado enfrente (1-4, 2-5, 3-6),
    // así en un 1 contra 1 los dos salen en esquinas opuestas.
    var orden = [0, 3, 1, 4, 2, 5].filter(function (i) { return i < apar.length; });
    for (var i = 0; i < op.luchadores.length; i++) {
      var spec = op.luchadores[i];
      var ap = apar[orden[i % orden.length]] || [1, 1];
      // Las apariciones van en casillas del CAMPO: se les suma el marco.
      P.luchadores.push(crearLuchador(P, spec, i + 1, (ap[0] + R.marco + 0.5) * R.celda, (ap[1] + R.marco + 0.5) * R.celda));
    }
    P.luchadores.forEach(function (l) { P.porId[l.id] = l; });
    var hs = P.luchadores.filter(function (l) { return l.humano; });
    if (hs.length) P.habMedia = hs.reduce(function (a, l) { return a + l.habilidad; }, 0) / hs.length;
    agregarCajas(P);

    P.gas = crearGas(P);
    actualizarGas(P, 0);

    P.curas = (R.curas || []).map(function (idx) {
      var c = celdaCentro(R, idx % R.ancho, Math.floor(idx / R.ancho));
      return { idx: idx, x: c.x, y: c.y, proxima: REGLAS.CURA_PRIMERA_MS, objeto: 0 };
    });

    P.luchadores.forEach(function (l) { enviarInicio(P, l); });
    return P;
  }

  function agregarCajas(P) {
    if (!propia(ARENAS, P.arenaId)) return;
    var R = P.R, candidatos = [], m = R.marco + 2;
    for (var y = m; y < R.alto - m; y++) for (var x = m; x < R.ancho - m; x++) {
      var idx = y * R.ancho + x;
      if (R.celdas[idx] !== '.') continue;
      var p = celdaCentro(R, x, y);
      if (P.luchadores.some(function (l) { return dist2(l, p) < Math.pow(R.celda * 2.5, 2); })) continue;
      var libres = [idx - 1, idx + 1, idx - R.ancho, idx + R.ancho].filter(function (i) { return R.celdas[i] === '.' || R.celdas[i] === '*'; });
      // Solo espacios abiertos: no se tapan puentes ni pasillos.
      if (libres.length === 4) candidatos.push(idx);
    }
    for (var i = candidatos.length - 1; i > 0; i--) {
      var j = Math.floor(P.azar() * (i + 1)), tmp = candidatos[i]; candidatos[i] = candidatos[j]; candidatos[j] = tmp;
    }
    var puestos = [];
    for (var k = 0; k < candidatos.length && puestos.length < REGLAS.CAJAS_EXTRA; k++) {
      var at = candidatos[k], pt = celdaCentro(R, at % R.ancho, Math.floor(at / R.ancho));
      if (puestos.some(function (p) { return dist2(p, pt) < Math.pow(R.celda * 3, 2); })) continue;
      var oro = puestos.length % 3 === 0;
      R.celdas[at] = oro ? 'o' : 'c';
      var vida = oro ? REGLAS.CAJA_ORO_VIDA : REGLAS.CAJA_VIDA;
      R.cajas[at] = { vida: vida, max: vida, oro: oro };
      puestos.push(pt);
    }
  }

  /** El centro de la casilla pisable más cercana a `p`, a `max` px como mucho. */
  function celdaPisableCerca(R, p, max, margen) {
    var cx = Math.floor(p.x / R.celda), cy = Math.floor(p.y / R.celda);
    var mejor = null, md = Infinity, radio = Math.ceil(max / R.celda);
    for (var y = cy - radio; y <= cy + radio; y++) {
      for (var x = cx - radio; x <= cx + radio; x++) {
        if (x < 0 || y < 0 || x >= R.ancho || y >= R.alto || bloqueaPaso(celdaEn(R, x, y))) continue;
        var q = celdaCentro(R, x, y);
        if (q.x < margen || q.y < margen || q.x > R.anchoPx - margen || q.y > R.altoPx - margen) continue;
        var d = Math.sqrt((q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y));
        if (d <= max && d < md) { md = d; mejor = q; }
      }
    }
    return mejor;
  }

  // =========================================================================
  // EL GAS
  // =========================================================================
  /* Entra por los cuatro bordes del campo a la vez y avanza `d` px hacia
     dentro: está en el gas quien queda a menos de `d` de cualquier borde. No
     hay centro ni fases ni anillo que pintar: lo que hay es un rectángulo
     libre que encoge, y se ve porque el gas se ve.

       estado 0  todavía no ha empezado
              1  avanzando
              2  ha llegado al final (queda la franja del centro)

     `max` sale del lado CORTO del campo: se para cuando quedan GAS_HUECO_MIN
     px libres en él (en una arena de 30×22 casillas, 13×5 en el centro). */
  function crearGas(P) {
    var j = P.R.juego;
    var corto = Math.min(j.x1 - j.x0, j.y1 - j.y0);
    return {
      d: 0, estado: 0, dano: 0,
      max: Math.max(0, Math.floor((corto - REGLAS.GAS_HUECO_MIN) / 2)),
      vel: REGLAS.GAS_VEL
    };
  }

  /** Cuánto ha entrado el gas a los `enCombate` ms (lo usa también la IA para adelantarse). */
  function gasEn(P, enCombate) {
    if (enCombate < REGLAS.GAS_INICIO_MS) return 0;
    return Math.min(P.gas.max, (enCombate - REGLAS.GAS_INICIO_MS) / 1000 * P.gas.vel);
  }

  function actualizarGas(P, enCombate) {
    var g = P.gas;
    if (enCombate < REGLAS.GAS_INICIO_MS || g.max <= 0) { g.d = 0; g.estado = 0; g.dano = 0; return; }
    var seg = (enCombate - REGLAS.GAS_INICIO_MS) / 1000;
    g.d = Math.min(g.max, seg * g.vel);
    g.estado = g.d >= g.max ? 2 : 1;
    g.dano = REGLAS.GAS_DANO_S + (REGLAS.GAS_DANO_MAX_S - REGLAS.GAS_DANO_S) * Math.min(1, seg / REGLAS.GAS_RAMPA_S);
  }

  /** ¿Está (x, y) en el gas? `d` = cuánto ha entrado (por defecto, lo de ahora). */
  function enGas(P, x, y, d) {
    var j = P.R.juego;
    if (d === undefined) d = P.gas.d;
    if (d <= 0) return false;
    return x < j.x0 + d || x > j.x1 - d || y < j.y0 + d || y > j.y1 - d;
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
    var maxHp = Math.max(1, Math.round(finito(s.maxHp, 92, 1, 1000000) * REGLAS.ESCALA_VIDA * multVida));
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
      especie: propia(ESPECIES, s.especie) ? s.especie : 'perro',
      nivel: finito(s.nivel, 1, 1, 1000000),
      maxHp: maxHp,
      hp: Math.max(1, Math.round(maxHp * salud)),
      ataque: finito(s.ataque, 12, 1, 100000),
      x: x, y: y, r: REGLAS.RADIO,
      golpe: esp.golpe || REGLAS.RADIO_GOLPE,     // el cuerpo, para las balas
      vel: REGLAS.VEL * esp.vel,
      velBase: REGLAS.VEL * esp.vel,
      rapidezHasta: 0,
      escudoHasta: 0,
      escudo: 0,
      fraccionNiebla: 0,
      fraccionRegen: 0,
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
      sinConexion: 0,        // desde cuándo no tiene conexión (lo lleva el piloto)
      ultimoGolpe: null,     // { id, t } quién le pegó por última vez
      // Para los bots que le apuntan: por dónde va (suavizado) y hacia dónde mira.
      px: x, py: y,
      giroEn: 0,
      cara: 0,
      caraHasta: 0,
      // Lo que ha recibido en total (para el resumen) y la cuenta de disparos pedidos.
      recibido: 0,
      disparosSegundo: 0,
      ventanaDisparos: 0,
      /* Lo hábil que es (0..1), lo dice el host (su historial, en el servidor;
         nunca el cliente). Con eso se mide a los bots contra él. */
      habilidad: finito(s.habilidad, 0.5, 0, 1),
      // La cuenta de cómo le va contra los bots EN ESTA partida (ver adaptarDificultad).
      dda: { hecho: 0, recibido: 0, ajuste: 0 },
      ia: null
    };
    if (l.bot) l.ia = crearIA(s.astucia, P.azar);
    return l;
  }

  function publico(l) {
    return {
      id: l.id, playerName: l.playerName, petName: l.petName,
      address: l.address ? (l.address.length > 10 ? l.address.slice(0, 6) + '…' + l.address.slice(-4) : l.address) : '',
      especie: l.especie, etiqueta: especie(l.especie).etiqueta,
      nivel: l.nivel, maxHp: l.maxHp, hp: l.hp, x: redondea(l.x, 2), y: redondea(l.y, 2),
      vel: l.vel, bot: l.bot, arma: l.armaId, super: l.superId, golpe: l.golpe,
      vivo: l.vivo, potencia: l.potencia
    };
  }

  function armaPublica(a) {
    return {
      nombre: a.nombre, balas: a.balas, abanico: a.abanico, vel: a.vel, alcance: a.alcance,
      radio: a.radio, cadencia: a.cadencia, recarga: a.recarga, tipo: a.tipo,
      atraviesa: !!a.atraviesa, empuje: a.empuje || 0
    };
  }

  /* El inicio de la partida. También se manda a mitad (reconectar): por eso
     lleva el ESTADO de ahora —quién sigue vivo, las cajas que quedan, lo que
     hay en el suelo, en qué fase va la niebla— y no solo el del principio. */
  function enviarInicio(P, l, reanudar) {
    if (!l.humano || l.sinConexion) return;
    var armas = {};
    Object.keys(ARMAS).forEach(function (k) { armas[k] = armaPublica(ARMAS[k]); });
    var cajas = [];
    Object.keys(P.R.cajas).forEach(function (k) {
      var c = P.R.cajas[k];
      cajas.push([Number(k), c.vida, c.max, c.oro ? 1 : 0, c.barril ? 1 : 0]);
    });
    var ahora = P.ahora();
    var g = P.gas, jg = P.R.juego;
    P.enviar(l, 'brawl:inicio', {
      matchId: P.id,
      modo: P.modo,
      ronda: P.ronda,
      version: VERSION,
      yo: l.id,
      arena: {
        id: P.arenaId, nombre: P.arenaNombre, tema: P.def.tema || '', ancho: P.R.ancho, alto: P.R.alto,
        celda: P.R.celda, marco: P.R.marco, marcoIncluido: true, filas: filasDe(P.R), cajas: cajas
      },
      /* AL VOLVER A MITAD NO SE REGALA DÓNDE ESTÁ NADIE. Este mismo mensaje se
         manda al reconectar y al pedir que se reenvíe el estado, y llevaba la
         posición de TODOS, también la de quien está escondido en la hierba:
         pedirlo una y otra vez era ver a través de la hierba. Ahora, a mitad
         de partida, quien no se ve va sin posición (como en la instantánea). */
      luchadores: P.luchadores.map(function (o) {
        var p = publico(o);
        if ((reanudar || P.fase !== 'cuenta') && o !== l && o.vivo && !loVe(P, l, o, ahora)) { p.x = null; p.y = null; p.oculto = 1; }
        return p;
      }),
      armas: armas,
      reglas: {
        tick: REGLAS.TICK_MS, municion: REGLAS.MUNICION, radio: REGLAS.RADIO,
        altoCuerpo: REGLAS.ALTO_CUERPO, radioGolpe: REGLAS.RADIO_GOLPE,
        visionArbusto: REGLAS.VISION_ARBUSTO, huesoMult: REGLAS.HUESO_MULT,
        huesoMax: REGLAS.HUESO_MAX, regenEsperaMs: REGLAS.REGEN_ESPERA_MS
      },
      // El gas: cuánto ha entrado ya, a qué paso, hasta dónde, y el campo.
      gas: {
        d: redondea(g.d, 10), estado: g.estado, vel: g.vel, max: g.max,
        inicioMs: REGLAS.GAS_INICIO_MS, maxMs: REGLAS.DURACION_MAX_MS,
        x0: jg.x0, y0: jg.y0, x1: jg.x1, y1: jg.y1
      },
      objetos: P.objetos.map(function (o) { return [o.id, redondea(o.x, 2), redondea(o.y, 2), o.tipo]; }),
      curas: P.curas.map(function (c) { return [redondea(c.x), redondea(c.y)]; }),
      fase: P.fase,
      reanudar: !!reanudar || P.fase !== 'cuenta',
      enCombateMs: P.fase === 'combate' ? Math.max(0, ahora - P.tCombate) : 0,
      cuentaMs: Math.max(0, P.tCombate - ahora),
      serverNow: ahora,
      extra: P.extraInicio
    });
  }

  function difundir(P, ev, datos) {
    for (var i = 0; i < P.luchadores.length; i++) {
      var l = P.luchadores[i];
      if (l.humano && !l.fuera && !l.sinConexion) P.enviar(l, ev, datos);
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
    if (!l || !l.vivo || l.fuera || l.sinConexion || P.fase !== 'combate' || !datos) return;
    var ahora = P.ahora();
    var seq = Number(datos.s);
    var x = Number(datos.x), y = Number(datos.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isSafeInteger(seq)) return;
    if (seq <= l.seq) return;                        // viejo o repetido
    // Un salto no puede consumir todo el espacio de secuencias y congelar
    // las entradas posteriores. 1200 tolera un minuto de paquetes perdidos.
    if (seq - l.seq > 1200) return;
    // Tope de paquetes: 40 por segundo bastan para 20 Hz con margen.
    if (ahora - l.ventanaEntradas > 1000) { l.ventanaEntradas = ahora; l.entradasSegundo = 0; }
    if (++l.entradasSegundo > REGLAS.ENTRADAS_POR_S) return;
    l.seq = seq;
    if (l.empuje) return;                            // le estamos moviendo nosotros
    /* LAS ENTRADAS VIEJAS NO VALEN. Si el servidor ha recolocado al perro (un
       empujón, o una posición que no cuadraba), las entradas que el cliente
       mandó ANTES de enterarse siguen viajando por la red con la posición
       vieja. Aceptarlas devolvería al perro hacia atrás y habría que
       corregirle otra vez: el efecto goma. Cada entrada lleva el número de la
       última corrección que el cliente ha aplicado (`c`); si va por detrás, se
       ignora hasta que se ponga al día. */
    var c = Number.isSafeInteger(datos.c) && datos.c >= 0 ? datos.c : -1;
    // Un ACK del futuro no prueba haber aplicado la corrección actual.
    if (c < l.correccion || c > l.correccion) return;
    l.cAck = Math.max(l.cAck, c);

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
    if (Number.isFinite(Number(datos.a))) l.apunta = Math.atan2(Math.sin(Number(datos.a)), Math.cos(Number(datos.a)));
    // Hacia dónde mira: hacia donde anda (salvo el instante en que dispara).
    if (andado > 0.6 && ahora >= l.caraHasta) l.cara = Math.atan2(dy, dx);
  }

  /**
   * El cliente pide disparar hacia el ángulo `a` (radianes). `sup` = la súper.
   * `s` es un número del cliente para casar su bala dibujada con la de
   * verdad; aquí no se usa para nada más.
   */
  function disparar(P, id, datos) {
    var l = P.porId[id];
    if (!l || !l.vivo || l.fuera || l.sinConexion || P.fase !== 'combate' || !datos) return false;
    var a = Number(datos.a);
    if (!Number.isFinite(a)) return false;
    /* Tope de PETICIONES. La cadencia ya impide disparar de más, pero cada
       petición rechazada también cuesta: un cliente que mande mil por segundo
       no dispara más, pero hace trabajar al servidor de todos. */
    var ahoraD = P.ahora();
    if (ahoraD - l.ventanaDisparos > 1000) { l.ventanaDisparos = ahoraD; l.disparosSegundo = 0; }
    if (++l.disparosSegundo > REGLAS.DISPAROS_POR_S) return false;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    var seqDisparo = Number.isSafeInteger(datos.s) && datos.s >= 0 ? datos.s : null;
    return dispararAngulo(P, l, a, !!datos.sup, seqDisparo);
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
    l.cara = a;
    l.caraHasta = ahora + 320;                       // mira hacia donde dispara un instante
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
        x: l.x, y: l.y - REGLAS.ALTO_CUERPO,          // sale del cuerpo, no de los pies
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
        nacio: ahora,
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

  /**
   * SE HA CAÍDO LA CONEXIÓN de un humano (lo dice el host).
   *
   * FALLO QUE ESTO ARREGLA (2026-10-02): "cuando hay reconexión a veces se
   * sale de la partida y no reconecta". Un corte de red de dos segundos
   * —un túnel, cambiar de wifi a datos— contaba como irse: el perro caía al
   * instante y, al volver, el jugador ya no tenía partida.
   *
   * Ahora no cae: lo lleva un piloto automático flojo (astucia 0,3, el mismo
   * cerebro que los bots) para que no sea un saco de boxeo quieto, y no se le
   * manda nada. Si vuelve, reconectar(); si el host se cansa, abandonar().
   */
  function desconectar(P, id) {
    var l = P.porId[id];
    if (!l || !l.humano || l.fuera || P.fase === 'fin') return false;
    if (!l.sinConexion) l.sinConexion = P.ahora();
    if (!l.ia) l.ia = crearIA(0.3, P.azar);
    l.ia.proxima = 0;
    l.ia.pf = null;
    l.moviendo = false;
    return true;
  }

  /** Vuelve la conexión: se le manda la partida tal y como está ahora. */
  function reconectar(P, id) {
    var l = P.porId[id];
    if (!l || !l.humano || l.fuera || P.fase === 'fin') return false;
    l.sinConexion = 0;
    if (l.ia) { l.ia.dirX = l.ia.dirY = l.ia.velX = l.ia.velY = 0; l.ia.esquiva = null; }
    l.ultimaEntrada = P.ahora();
    l.presupuesto = 0;
    // El cliente que vuelve empieza a contar sus entradas desde cero, y tiene
    // que coger la posición buena antes de que se le acepte ninguna (ver `c`
    // en entrada()): por eso se abre una corrección nueva.
    l.seq = 0;
    l.correccion++;
    l.corregir = true;
    enviarInicio(P, l, true);
    return true;
  }

  // Reenvía el estado completo sin reiniciar secuencias ni el piloto automático.
  function resincronizar(P, id) {
    var l = P.porId[id];
    if (!l || !l.humano || l.fuera || l.sinConexion || P.fase === 'fin') return false;
    enviarInicio(P, l, true);
    return true;
  }

  function humanosVivos(P) {
    var n = 0;
    for (var i = 0; i < P.luchadores.length; i++) {
      var l = P.luchadores[i];
      // El que está sin conexión cuenta como vivo: si no, una práctica se
      // acabaría sola en cuanto se corta la red un segundo.
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
    if (!Number.isFinite(ahora)) return;
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
    actualizarGas(P, enCombate);
    if (P.dda && t - P.tDda >= 1000) { P.tDda = t; adaptarDificultad(P); }

    for (var i = 0; i < P.luchadores.length; i++) {
      var l = P.luchadores[i];
      if (!l.vivo) continue;
      /* Por dónde va, suavizado (media móvil de ~150 ms). Lo usan los bots
         para adelantar el tiro. Antes solo se calculaba para los bots: contra
         un humano la velocidad salía 0 y nunca le adelantaban el tiro. */
      var vxAntes = l.vx, vyAntes = l.vy;
      l.vx += ((l.x - l.px) / dt - l.vx) * 0.3;
      l.vy += ((l.y - l.py) / dt - l.vy) * 0.3;
      l.px = l.x; l.py = l.y;
      if (vxAntes * l.vx + vyAntes * l.vy < -60) l.giroEn = t;
      l.vel = l.velBase * (t < l.rapidezHasta ? REGLAS.PODER_VELOCIDAD_MULT : 1);
      if (t >= l.escudoHasta) l.escudo = 0;
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
      // los bots piensan y andan (y el piloto de quien se quedó sin conexión)
      if (l.bot || l.sinConexion) pensarBot(P, l, t, dt);
      l.enArbusto = celdaDePunto(P.R, l.x, l.y) === '*';
      // el gas: quita vida a quien está dentro, cada vez más
      if (enGas(P, l.x, l.y)) {
        l.fraccionNiebla += l.maxHp * P.gas.dano * dt;
        var d = Math.floor(l.fraccionNiebla); l.fraccionNiebla -= d;
        l.hp -= d;
        l.recibido += d;
        l.regenDesde = t + REGLAS.REGEN_ESPERA_MS;
        if (l.hp <= 0) { l.hp = 0; caer(P, l, null); continue; }
      } else if (t >= l.regenDesde && l.hp < l.maxHp) {
        // regeneración
        l.fraccionRegen += l.maxHp * REGLAS.REGEN_POR_S * dt;
        var curaRegen = Math.floor(l.fraccionRegen); l.fraccionRegen -= curaRegen;
        l.hp = Math.min(l.maxHp, l.hp + curaRegen);
      }
    }

    // Barriles que saltan en cadena (los encendió otra explosión).
    if (P.pendientes.length) {
      var aun = [];
      for (var q = 0; q < P.pendientes.length; q++) {
        var pe = P.pendientes[q];
        if (t >= pe.t) golpearCaja(P, pe.idx, { rompe: true, duenio: pe.duenio }, t);
        else aun.push(pe);
      }
      P.pendientes = aun;
    }

    moverBalas(P, t, dt);
    recogerObjetos(P, t);

    // Los comederos: sale carne cuando toca.
    for (var c = 0; c < P.curas.length; c++) {
      var cu = P.curas[c];
      if (cu.objeto || enCombate < cu.proxima) continue;
      var o = { id: P.sigObjeto++, x: cu.x, y: cu.y, tipo: 'carne', cura: c };
      P.objetos.push(o);
      cu.objeto = o.id;
      difundir(P, 'brawl:objeto', { id: o.id, x: redondea(o.x, 2), y: redondea(o.y, 2), tipo: 'carne' });
    }

    // ¿Se acabó?
    var quedan = vivos(P);
    if (quedan <= 1) { terminar(P, 'ko'); return; }
    if ((P.modo === 'bot' || P.modo === 'practica') && humanosVivos(P) === 0) { terminar(P, 'ko'); return; }
    if (enCombate >= REGLAS.DURACION_MAX_MS) terminar(P, 'tiempo');
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
          var rr = l.golpe + bb.radio;
          var gx = l.x - bb.x, gy = l.y - REGLAS.ALTO_CUERPO - bb.y;
          if (gx * gx + gy * gy <= rr * rr) {
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
    if (l.escudo > 0 && t < l.escudoHasta) {
      var absorbido = Math.min(l.escudo, d); l.escudo -= absorbido; d -= absorbido;
    }
    l.hp = Math.max(0, l.hp - d);
    l.recibido += d;
    l.regenDesde = t + REGLAS.REGEN_ESPERA_MS;
    l.reveladoHasta = t + REGLAS.REVELA_MS;
    if (duenio) {
      duenio.regenDesde = t + REGLAS.REGEN_ESPERA_MS;
      duenio.dano += d;
      if (b.carga) duenio.superCarga = Math.min(1, duenio.superCarga + b.carga);
      anotarGolpe(l, duenio, t);
      anotarParaDificultad(duenio, l, d);
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

  /** Quién le pegó (para que los bots se defiendan de quien les ataca). */
  function anotarGolpe(l, duenio, t) {
    if (!duenio || duenio === l) return;
    l.ultimoGolpe = { id: duenio.id, t: t };
    if (l.ia) l.ia.amenazas[duenio.id] = { t: t };
  }

  function golpearCaja(P, idx, b, t) {
    var c = P.R.cajas[idx];
    if (!c) return;
    c.vida = b.rompe ? 0 : c.vida - 1;
    var x = (idx % P.R.ancho + 0.5) * P.R.celda, y = (Math.floor(idx / P.R.ancho) + 0.5) * P.R.celda;
    var rota = c.vida <= 0;
    if (rota) romperCaja(P.R, idx);
    difundir(P, 'brawl:caja', { i: idx, vida: Math.max(0, c.vida), max: c.max, rota: rota ? 1 : 0, oro: c.oro ? 1 : 0, barril: c.barril ? 1 : 0 });
    if (rota && c.oro) soltarHuesos(P, x, y, 1);
    if (rota && !c.barril) soltarSuministro(P, x, y, c.oro);
    if (rota && c.barril) explotar(P, x, y, b.duenio, t);
  }

  /**
   * UN BARRIL EXPLOTA en (x, y). Quita vida a quien esté cerca (menos cuanto
   * más lejos), le empuja hacia fuera, da un golpe a las cajas de alrededor y
   * enciende a los barriles vecinos, que saltan un instante después: así una
   * fila de barriles es una mecha y se ve correr.
   * Un muro entre el barril y el luchador le protege (lineaDeTiro).
   * El daño se le apunta a quien rompió el barril; si se pilla a sí mismo,
   * no cuenta como baja.
   */
  function explotar(P, x, y, duenioId, t) {
    var R = P.R, rad = REGLAS.BARRIL_RADIO;
    var duenio = duenioId ? P.porId[duenioId] : null;
    difundir(P, 'brawl:boom', { x: redondea(x, 2), y: redondea(y, 2), r: rad });
    for (var i = 0; i < P.luchadores.length; i++) {
      var l = P.luchadores[i];
      if (!l.vivo) continue;
      var dx = l.x - x, dy = l.y - y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > rad + l.r || !lineaDeTiro(R, x, y, l.x, l.y)) continue;
      var k = 1 - 0.55 * Math.min(1, d / rad);
      var dano = Math.max(1, Math.round(l.maxHp * REGLAS.BARRIL_DANO * k));
      if (l.escudo > 0 && t < l.escudoHasta) {
        var absorbido = Math.min(l.escudo, dano); l.escudo -= absorbido; dano -= absorbido;
      }
      l.hp = Math.max(0, l.hp - dano);
      l.recibido += dano;
      l.regenDesde = t + REGLAS.REGEN_ESPERA_MS;
      l.reveladoHasta = t + REGLAS.REVELA_MS;
      if (duenio && duenio !== l) { duenio.dano += dano; anotarParaDificultad(duenio, l, dano); }
      anotarGolpe(l, duenio, t);
      var ux = d > 1 ? dx / d : 1, uy = d > 1 ? dy / d : 0;
      var v = REGLAS.BARRIL_EMPUJE * k / 0.18;
      l.empuje = { vx: ux * v, vy: uy * v, hasta: t + 180 };
      difundir(P, 'brawl:golpe', {
        b: 0, t: l.id, o: duenio ? duenio.id : 0, d: dano, hp: l.hp,
        x: redondea(l.x, 2), y: redondea(l.y, 2), sup: 0, boom: 1
      });
      if (l.hp <= 0) caer(P, l, duenio && duenio !== l ? duenio : null);
    }
    // Lo de alrededor: un golpe a cada caja y la mecha a los barriles.
    var C = R.celda;
    var cx0 = Math.max(0, Math.floor((x - rad) / C)), cx1 = Math.min(R.ancho - 1, Math.floor((x + rad) / C));
    var cy0 = Math.max(0, Math.floor((y - rad) / C)), cy1 = Math.min(R.alto - 1, Math.floor((y + rad) / C));
    for (var cy = cy0; cy <= cy1; cy++) {
      for (var cx = cx0; cx <= cx1; cx++) {
        var idx = cy * R.ancho + cx;
        var c = R.cajas[idx];
        if (!c) continue;
        var px = (cx + 0.5) * C - x, py = (cy + 0.5) * C - y;
        if (px * px + py * py > rad * rad) continue;
        if (c.barril) {
          if (!c.encendido) {
            c.encendido = true;
            P.pendientes.push({ t: t + REGLAS.BARRIL_CADENA_MS, idx: idx, duenio: duenioId });
          }
        } else {
          golpearCaja(P, idx, { rompe: false, duenio: duenioId }, t);
        }
      }
    }
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
      var esCarne = o.tipo === 'carne';
      for (var j = 0; j < P.luchadores.length; j++) {
        var l = P.luchadores[j];
        if (!l.vivo) continue;
        // La carne solo la coge quien está herido: pasar por encima con la
        // vida llena no la gasta (si no, se "robaría" para que no cure a otro).
        if (esCarne && l.hp >= l.maxHp) continue;
        if (o.tipo === 'municion' && l.municion >= REGLAS.MUNICION) continue;
        if (o.tipo === 'super' && l.superCarga >= 1) continue;
        if (o.tipo === 'hueso' && l.potencia >= REGLAS.HUESO_MAX) continue;
        var rr = l.r + REGLAS.HUESO_RADIO * 0.5;
        if (dist2(l, o) <= rr * rr) { quien = l; break; }
      }
      if (!quien) { quedan.push(o); continue; }
      if (esCarne) {
        var cura = Math.round(quien.maxHp * REGLAS.CURA_VIDA);
        quien.hp = Math.min(quien.maxHp, quien.hp + cura);
        var cu = P.curas[o.cura];
        if (cu) { cu.objeto = 0; cu.proxima = (t - P.tCombate) + REGLAS.CURA_CADA_MS; }
        difundir(P, 'brawl:recoger', { id: o.id, por: quien.id, tipo: 'carne', cura: cura, potencia: quien.potencia, maxHp: quien.maxHp, hp: quien.hp });
        continue;
      }
      if (o.tipo !== 'hueso') {
        if (o.tipo === 'escudo') { quien.escudo = Math.round(quien.maxHp * REGLAS.ESCUDO_VIDA); quien.escudoHasta = t + REGLAS.PODER_DURACION_MS; }
        if (o.tipo === 'rapidez') { quien.rapidezHasta = t + REGLAS.PODER_DURACION_MS; quien.vel = quien.velBase * REGLAS.PODER_VELOCIDAD_MULT; }
        if (o.tipo === 'municion') quien.municion = Math.min(REGLAS.MUNICION, quien.municion + 1.5);
        if (o.tipo === 'super') quien.superCarga = Math.min(1, quien.superCarga + 0.35);
        difundir(P, 'brawl:recoger', { id: o.id, por: quien.id, tipo: o.tipo, potencia: quien.potencia,
          maxHp: quien.maxHp, hp: quien.hp, vel: quien.vel, m: quien.municion, s: quien.superCarga });
        continue;
      }
      if (quien.potencia < REGLAS.HUESO_MAX) {
        quien.potencia++;
        // La vida máxima sube y lo que sube se cura: coger un hueso en mitad
        // de la pelea tiene que notarse.
        var extra = Math.round(quien.maxHp / (1 + REGLAS.HUESO_MULT * (quien.potencia - 1)) * REGLAS.HUESO_MULT);
        quien.maxHp += extra;
        quien.hp = Math.min(quien.maxHp, quien.hp + extra);
      }
      difundir(P, 'brawl:recoger', { id: o.id, por: quien.id, tipo: 'hueso', potencia: quien.potencia, maxHp: quien.maxHp, hp: quien.hp });
    }
    P.objetos = quedan;
  }

  function soltarSuministro(P, x, y, oro) {
    var tipos = ['carne', 'escudo', 'rapidez', 'municion', 'super'];
    var tipo = tipos[Math.floor(P.azar() * tipos.length)];
    var p = moverCirculo(P.R, x, y, oro ? 18 : 0, 0, 8);
    var o = { id: P.sigObjeto++, x: p[0], y: p[1], tipo: tipo };
    P.objetos.push(o);
    difundir(P, 'brawl:objeto', { id: o.id, x: o.x, y: o.y, tipo: tipo });
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
          recibido: Math.round(l.recibido), vida: l.vivo ? redondea(l.hp / l.maxHp, 100) : 0,
          astucia: l.ia && l.bot ? redondea(l.ia.astucia, 100) : null,
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
       f: [id, x, y, hp, banderas, potencia, maxHp, cara]
          banderas: 1 vivo · 2 andando · 4 en la hierba · 8 mira a la izq.
          cara: hacia dónde mira, en dieciseisavos de vuelta (0 = derecha,
          4 = abajo): con eso se elige el dibujo de frente, de lado o de espaldas.
       y: lo tuyo — munición y súper en centésimas, y la posición buena si
          hay que recolocarte (c = número de corrección). */
  /* z: el gas — [px que ha entrado (con un decimal), estado]. */
  function enviarInstantaneas(P, ahora) {
    var zr = [redondea(P.gas.d, 10), P.gas.estado];
    for (var i = 0; i < P.luchadores.length; i++) {
      var yo = P.luchadores[i];
      if (!yo.humano || yo.fuera || yo.sinConexion) continue;
      var f = [];
      for (var j = 0; j < P.luchadores.length; j++) {
        var l = P.luchadores[j];
        if (!l.vivo) continue;
        if (!loVe(P, yo, l, ahora)) continue;
        var band = 1 | (l.moviendo ? 2 : 0) | (l.enArbusto ? 4 : 0) | (l.mira < 0 ? 8 : 0);
        var cara = Math.round(((l.cara % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 8)) % 16;
        f.push([l.id, redondea(l.x, 2), redondea(l.y, 2), l.hp, band, l.potencia, l.maxHp, cara]);
      }
      var y = {
        m: Math.round(yo.municion * 100),
        s: Math.round(yo.superCarga * 100),
        c: yo.correccion,
        hp: yo.hp
      };
      y.v = redondea(yo.vel, 2);
      y.e = yo.escudo;
      y.r = Math.max(0, yo.rapidezHasta - ahora);
      y.ed = Math.max(0, yo.escudoHasta - ahora);
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
      if (h.humano && !h.sinConexion && ahora - h.ultimaEntrada > 120) h.moviendo = false;
    }
  }

  // =========================================================================
  // LOS BOTS
  // =========================================================================
  /* No hacen trampas: ven lo que vería un jugador en su pantalla (la hierba
     alta les esconde a la gente igual que a ti), disparan con la misma
     munición y cadencia, y fallan. Lo que cambia de un bot a otro es la
     ASTUCIA (0..1), y de ella sale TODO lo que le hace mejor o peor (ver
     `perfil`): cuánto tarda en reaccionar, cuánto le tiembla el pulso, cuánto
     adelanta el tiro, cuánto esquiva, cada cuánto piensa y a qué paso se mueve
     al pelear.

     REHECHOS EL 2026-11-15 — "los enemigos deben ser muy muy inteligentes y su
     dificultad se debe adaptar perfectamente". Lo que hacen ahora y antes no:

       · VEN COMO UN JUGADOR. Antes solo "veían" a quien tenían a tiro sin un
         muro en medio: detrás de una roca eras invisible y te dejaban en paz.
         Ahora ven todo lo que cabe en una pantalla (salvo la hierba) y te
         rodean la roca.
       · APUNTAN DONDE VAS A ESTAR, también contra un humano (la velocidad del
         rival solo se calculaba para los bots: contra ti tiraban siempre a
         donde estabas). Resuelven el punto de encuentro de la bala; y si
         acabas de cambiar de sentido, se fían menos del adelanto.
       · LA MIRA GIRA, no salta: tardan en encararte, más los torpes. Correr en
         círculos alrededor de uno torpe funciona; alrededor de uno listo, no.
       · ELIGEN LA DISTANCIA según quién llega más lejos: si su arma alcanza
         más que la tuya te pelean desde fuera de tu alcance; si alcanza
         menos, se te echan encima.
       · GUARDAN MUNICIÓN: con el cargador a medias no disparan de lejos a un
         blanco que se mueve; rematan sin dudar al que está tocado.
       · SE RETIRAN A TIEMPO, a cubierto o a la hierba, y vuelven curados; y si
         pueden rematarte antes, no se retiran.
       · TIENDEN EMBOSCADAS desde la hierba, disparan a la mata donde te han
         visto meterte, hacen un quiebro cuando disparas, usan los barriles y
         no se quedan al lado de uno.
       · SE ADELANTAN AL GAS y no cruzan por él si pueden rodearlo.

     Lo de antes que se conserva: puntúan a quién atacar (quien les pega,
     el tocado, el que nadie más persigue), tienen carácter (agresivo, cauto o
     cazador) y pelean entre ellos.

     LA DIFICULTAD SE ADAPTA, de tres maneras que se suman:
       1. ANTES de empezar, el servidor da a cada bot su astucia según lo bien
          que juega el humano (su historial; ver brawlHabilidad en server2.js).
       2. CONTRA CADA HUMANO, según lo hábil que es respecto a los demás de la
          partida: el mismo bot aprieta más al veterano que al novato.
       3. DURANTE la partida, según cómo le va a cada humano contra los bots
          (adaptarDificultad): si le están dando una paliza aflojan con él; si
          los está barriendo, afinan. Hasta DDA_FUERZA de astucia en cada
          sentido, despacio (se nota en diez segundos, no en uno). */
  var ESTILOS = {
    // ideal: fracción del alcance a la que les gusta pelear
    // retirada: vida (0..1) por debajo de la cual se van a curar
    // arbusto: ganas de esconderse en la hierba cuando no ven a nadie
    // paciencia: ms que el cazador espera a que otros se peleen antes de entrar
    agresivo: { ideal: 0.56, retirada: 0.22, arbusto: 0.25, paciencia: 0 },
    cauto:    { ideal: 0.84, retirada: 0.40, arbusto: 0.65, paciencia: 0 },
    cazador:  { ideal: 0.74, retirada: 0.31, arbusto: 0.60, paciencia: 3000 }
  };

  /** De la astucia (0..1) a los números con los que juega un bot. */
  function perfil(a) {
    return {
      reaccion: 500 - 390 * a,                    // ms hasta reaccionar a quien aparece
      reflejo: 360 - 190 * a,                     // ms hasta reaccionar a una bala
      error: Math.max(0.022, 0.30 - 0.29 * a),    // rad de desvío típico al disparar
      adelanto: Math.min(1, 0.10 + 1.05 * a),     // cuánto adelanta el tiro (1 = todo)
      giro: (190 + 640 * a) * Math.PI / 180,      // rad/s a los que gira la mira
      encarar: 0.05 + 0.13 * (1 - a),             // rad de margen para dar por encarado
      /* Ni el mejor las esquiva todas: como mucho dos de cada tres de las que
         ve venir. Un rival al que no se le puede dar no es difícil, es injusto. */
      esquiva: 0.05 + 0.55 * a,                   // probabilidad de apartarse de una bala
      pensar: 250 - 140 * a,                      // ms entre decisiones
      ritmo: 0.70 + 0.30 * a                      // a qué paso se mueve de lado al pelear
    };
  }

  function crearIA(astucia, azar) {
    var a = Number.isFinite(Number(astucia)) ? Math.max(0, Math.min(1, Number(astucia))) : 0.35;
    var az = typeof azar === 'function' ? azar : Math.random;
    var r = az();
    var estilo = r < 0.36 ? 'agresivo' : (r < 0.70 ? 'cauto' : 'cazador');
    return {
      astucia: a,            // la suya, de serie
      a: a,                  // la de ahora (con lo que se adapta)
      pf: null,              // perfil(a), de la última vez que pensó
      estilo: estilo,
      E: ESTILOS[estilo],
      objetivo: null,
      rival: null,           // el que le cae peor (se elige al ver a los demás)
      vistoDesde: 0,
      perdidoDesde: 0,
      proxima: 0,
      dirX: 0, dirY: 0,      // el rumbo que quiere
      velX: 0, velY: 0,      // el rumbo que lleva (gira hacia el que quiere)
      ritmo: 1,              // fracción de su velocidad a la que quiere ir
      mira: az() * Math.PI * 2,
      ruta: null,
      rutaHasta: 0,
      rutaObjetivo: null,
      estrafe: az() < 0.5 ? 1 : -1,
      cambioEstrafe: 0,
      ultimoQuiebro: 0,
      proximoDisparo: 0,
      destino: null,
      destinoHasta: 0,
      pausaHasta: 0,
      atascado: 0,
      amenazas: {},          // id → { t } de quien le ha pegado
      mem: {},               // id → lo último que vio de cada uno (ver percibir)
      recuerdo: null,        // { x, y, t, arbusto } donde vio por última vez a su objetivo
      esquiva: null,         // { x, y, hasta }
      acechoDesde: 0,
      acechando: false,
      emboscadaDesde: 0,
      sinEmboscadaHasta: 0,
      barril: null,          // un barril al que disparar { x, y }
      caja: null,            // una caja que romper { x, y }
      sospecha: null,        // { x, y, hasta } una mata donde cree que hay alguien
      sectores: null,        // cuándo miró por última vez cada trozo del campo (ver sectorPorVer)
      sectCols: 0, sectFilas: 0,
      modo: 'explorar', plan: null, contenerFuego: false
    };
  }

  function celdaCentro(R, cx, cy) {
    return { x: (cx + 0.5) * R.celda, y: (cy + 0.5) * R.celda };
  }

  /* ── LA DIFICULTAD SE ADAPTA ─────────────────────────────────────────── */
  /** Se apunta cada golpe entre un humano y un bot (como fracción de vida). */
  function anotarParaDificultad(duenio, victima, d) {
    if (!duenio || !victima || duenio === victima) return;
    var k = d / Math.max(1, victima.maxHp);
    if (duenio.humano && victima.bot) duenio.dda.hecho += k;
    else if (duenio.bot && victima.humano) victima.dda.recibido += k;
  }

  /* Una vez por segundo. `hecho` y `recibido` se van olvidando (a la mitad
     cada ~10 s): cuenta cómo va AHORA, no cómo empezó. El balance va de -1
     (solo recibe) a +1 (solo pega) y el ajuste le sigue despacio. */
  function adaptarDificultad(P) {
    for (var i = 0; i < P.luchadores.length; i++) {
      var l = P.luchadores[i];
      if (!l.humano || !l.vivo) continue;
      var d = l.dda;
      d.hecho *= 0.93; d.recibido *= 0.93;
      var total = d.hecho + d.recibido;
      var balance = total > 0.02 ? (d.hecho - d.recibido) / Math.max(0.3, total) : 0;
      var meta = Math.max(-1, Math.min(1, balance)) * REGLAS.DDA_FUERZA;
      d.ajuste += (meta - d.ajuste) * 0.2;
    }
  }

  /** La astucia con la que `l` juega contra `obj` (ver "LA DIFICULTAD SE ADAPTA"). */
  function astuciaContra(P, l, obj) {
    var a = l.ia.astucia;
    if (P.dda && l.bot && obj && obj.humano) {
      a += (obj.habilidad - P.habMedia) * 0.5 + obj.dda.ajuste;
    }
    return Math.max(0.05, Math.min(1, a));
  }

  /* ── EL CAMINO ───────────────────────────────────────────────────────── */
  /**
   * Camino por casillas (A* con diagonales que no muerden esquinas).
   * `coste(indice)`: lo que cuesta DE MÁS pisar esa casilla (el gas, estar
   * junto a un barril); sin él, el camino más corto.
   */
  function buscarRuta(R, x0, y0, x1, y1, maxNodos, coste) {
    if (![x0, y0, x1, y1].every(Number.isFinite) || x0 < 0 || y0 < 0 || x0 >= R.anchoPx || y0 >= R.altoPx) return null;
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
    var N = W * Hh;
    var g = new Float32Array(N).fill(Infinity);
    var previo = new Int32Array(N).fill(-1);
    var cerrado = new Uint8Array(N);
    // Montículo: los índices y su nota (lo andado + lo que falta en línea recta).
    var hi = [], hf = [];
    var meter = function (i, f) {
      var k = hi.length; hi.push(i); hf.push(f);
      while (k > 0) { var p = (k - 1) >> 1; if (hf[p] <= f) break; hi[k] = hi[p]; hf[k] = hf[p]; k = p; }
      hi[k] = i; hf[k] = f;
    };
    var sacar = function () {
      var arriba = hi[0], n = hi.length - 1, li = hi[n], lf = hf[n];
      hi.length = n; hf.length = n;
      if (n > 0) {
        var k = 0;
        for (;;) {
          var c = 2 * k + 1;
          if (c >= n) break;
          if (c + 1 < n && hf[c + 1] < hf[c]) c++;
          if (hf[c] >= lf) break;
          hi[k] = hi[c]; hf[k] = hf[c]; k = c;
        }
        hi[k] = li; hf[k] = lf;
      }
      return arriba;
    };
    var falta = function (i) {
      var dx = Math.abs(i % W - bx), dy = Math.abs(Math.floor(i / W) - by);
      return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
    };
    var vecinos = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    var limite = maxNodos || 1600, vistos = 0;
    g[a] = 0; previo[a] = a;
    meter(a, falta(a));
    while (hi.length && vistos < limite) {
      var c = sacar();
      if (cerrado[c]) continue;
      cerrado[c] = 1; vistos++;
      if (c === b) break;
      var cx = c % W, cy = (c - cx) / W;
      for (var k = 0; k < vecinos.length; k++) {
        var nx = cx + vecinos[k][0], ny = cy + vecinos[k][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= Hh) continue;
        var n = nx + ny * W;
        if (cerrado[n] || bloqueaPaso(R.celdas[n])) continue;
        if (k >= 4 && (bloqueaPaso(celdaEn(R, cx + vecinos[k][0], cy)) || bloqueaPaso(celdaEn(R, cx, cy + vecinos[k][1])))) continue;
        var paso = (k >= 4 ? 1.414 : 1) + (coste ? coste(n) : 0);
        var ng = g[c] + paso;
        if (ng >= g[n]) continue;
        g[n] = ng; previo[n] = c;
        meter(n, ng + falta(n));
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

  function distancia(a, b) { return Math.sqrt(dist2(a, b)); }

  /** La menor diferencia entre dos ángulos (de -π a π). */
  function difAngulo(a, b) {
    var d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  /** ¿Pasa una bala del cuerpo de `a` al de `b`? (a y b: posiciones de pies) */
  function hayTiro(R, a, b) {
    return lineaDeTiro(R, a.x, a.y - REGLAS.ALTO_CUERPO, b.x, b.y - REGLAS.ALTO_CUERPO);
  }

  /* ── LO QUE VE ───────────────────────────────────────────────────────── */
  /** ¿Cabe `o` en la pantalla de `l`? (lo que vería un jugador en su sitio) */
  function enVista(P, l, o) {
    var C = P.R.celda;
    return Math.abs(o.x - l.x) <= REGLAS.VISTA_X * C && Math.abs(o.y - l.y) <= REGLAS.VISTA_Y * C;
  }

  function veBot(P, l, o, t) {
    return !!o && o.vivo && o !== l && enVista(P, l, o) && loVe(P, l, o, t);
  }

  /* Lo último que vio de cada uno. `desde` es cuándo empezó a verlo esta vez
     (de ahí cuenta su tiempo de reacción). Quien se esconde se queda en la
     memoria donde se le vio, no donde está. */
  function percibir(P, l, t) {
    var ia = l.ia;
    /* AL EMPEZAR SE SABE DE DÓNDE SALE CADA UNO (lo sabe cualquiera: la
       presentación de la partida enseña a todos en su esquina). Sin esto el
       bot salía a barrer el campo desde cero y a un rival que se quedaba en
       su sitio podía tardar más de medio minuto en encontrarle. */
    var sembrar = !ia.memSembrada && P.fase === 'combate' && t - P.tCombate < 1500 && l.bot;
    ia.memSembrada = true;
    for (var i = 0; i < P.luchadores.length; i++) {
      var o = P.luchadores[i];
      if (o === l) continue;
      var m = ia.mem[o.id];
      if (!o.vivo) { if (m) delete ia.mem[o.id]; continue; }
      if (!veBot(P, l, o, t)) {
        if (m) m.visto = false;
        else if (sembrar) ia.mem[o.id] = { x: o.x, y: o.y, t: t, desde: t, visto: false };
        continue;
      }
      if (!m) m = ia.mem[o.id] = { x: o.x, y: o.y, t: t, desde: t, visto: true };
      else if (!m.visto) m.desde = t;
      m.x = o.x; m.y = o.y; m.t = t; m.visto = true; m.descartado = false;
    }
  }

  /** El rastro más cercano que le queda: dónde vio por última vez a alguien
      (hace menos de 45 s, y que no se lo haya comido el gas). */
  function rastroCercano(P, l, t) {
    var ia = l.ia, mejor = null, md = Infinity;
    for (var id in ia.mem) {
      var m = ia.mem[id];
      if (m.visto || m.descartado || t - m.t > 45000) continue;
      if (!libreDeGas(P, m, 0, 3000)) { m.descartado = true; continue; }
      var d = dist2(l, m);
      if (d < md) { md = d; mejor = m; }
    }
    return mejor;
  }

  /** ¿Hay hierba alta a `n` casillas o menos de `p`? */
  function hayArbustoCerca(R, p, n) {
    var cx = Math.floor(p.x / R.celda), cy = Math.floor(p.y / R.celda);
    for (var y = cy - n; y <= cy + n; y++) for (var x = cx - n; x <= cx + n; x++) if (celdaEn(R, x, y) === '*') return true;
    return false;
  }

  /* ── EL GAS, PARA LOS BOTS ───────────────────────────────────────────── */
  /** ¿Seguirá `p` libre de gas dentro de `ms`? (`margen` px de holgura) */
  function libreDeGas(P, p, margen, ms) {
    var d = gasEn(P, (P.tUltimo - P.tCombate) + (ms || 0));
    if (d <= 0) return true;
    return !enGas(P, p.x, p.y, d + (margen || 0));
  }

  /** El sitio pisable más cercano a `l` que seguirá libre de gas dentro de `ms`. */
  function puntoSeguro(P, l, ms) {
    var R = P.R, j = R.juego, C = R.celda;
    var d = gasEn(P, (P.tUltimo - P.tCombate) + ms) + C * 0.9;
    var mx = (j.x0 + j.x1) / 2, my = (j.y0 + j.y1) / 2;
    var x0 = Math.min(mx, j.x0 + d), x1 = Math.max(mx, j.x1 - d);
    var y0 = Math.min(my, j.y0 + d), y1 = Math.max(my, j.y1 - d);
    var p = { x: Math.max(x0, Math.min(x1, l.x)), y: Math.max(y0, Math.min(y1, l.y)) };
    if (!bloqueaPaso(celdaDePunto(R, p.x, p.y))) return p;
    // Ahí hay un muro o agua (el estanque del centro): la casilla pisable más
    // cercana DENTRO de lo que va a quedar libre, no la más cercana a secas.
    var mejor = null, md = Infinity;
    for (var cy = Math.floor(y0 / C); cy <= Math.floor(y1 / C); cy++) {
      for (var cx = Math.floor(x0 / C); cx <= Math.floor(x1 / C); cx++) {
        if (bloqueaPaso(celdaEn(R, cx, cy))) continue;
        var q = celdaCentro(R, cx, cy);
        if (q.x < x0 - 1 || q.x > x1 + 1 || q.y < y0 - 1 || q.y > y1 + 1) continue;
        var dq = dist2(l, q);
        if (dq < md) { md = dq; mejor = q; }
      }
    }
    return mejor || celdaPisableCerca(R, { x: mx, y: my }, C * 6, 0) || { x: mx, y: my };
  }

  /* BUSCAR COMO BUSCA UNA PERSONA. El campo se parte en trozos (de unas 6×5
     casillas) y se apunta cuándo se miró cada uno por última vez. Sin nadie a
     la vista, se va al trozo que más tiempo lleva sin mirar (el más cercano
     de ellos): barre el campo en vez de dar vueltas al azar, que era lo que
     hacía que a veces no encontrara a un rival quieto en medio minuto. */
  function marcarVisto(P, l, t) {
    var ia = l.ia, R = P.R, j = R.juego, C = R.celda;
    if (!ia.sectores) {
      ia.sectCols = Math.max(1, Math.round((j.x1 - j.x0) / (C * 6)));
      ia.sectFilas = Math.max(1, Math.round((j.y1 - j.y0) / (C * 5.5)));
      ia.sectores = [];
      for (var k = 0; k < ia.sectCols * ia.sectFilas; k++) ia.sectores.push(t - 60000);
    }
    var sw = (j.x1 - j.x0) / ia.sectCols, sh = (j.y1 - j.y0) / ia.sectFilas;
    for (var i = 0; i < ia.sectores.length; i++) {
      var cx = j.x0 + (i % ia.sectCols + 0.5) * sw, cy = j.y0 + (Math.floor(i / ia.sectCols) + 0.5) * sh;
      if (Math.abs(cx - l.x) <= REGLAS.VISTA_X * C * 0.75 && Math.abs(cy - l.y) <= REGLAS.VISTA_Y * C * 0.75) ia.sectores[i] = t;
    }
  }

  function sectorPorVer(P, l, t) {
    var ia = l.ia, R = P.R, j = R.juego;
    if (!ia.sectores) return null;
    var sw = (j.x1 - j.x0) / ia.sectCols, sh = (j.y1 - j.y0) / ia.sectFilas;
    var mejor = null, mn = -Infinity;
    for (var i = 0; i < ia.sectores.length; i++) {
      var c = { x: j.x0 + (i % ia.sectCols + 0.5) * sw, y: j.y0 + (Math.floor(i / ia.sectCols) + 0.5) * sh };
      if (!libreDeGas(P, c, R.celda, 12000)) continue;
      var nota = (t - ia.sectores[i]) / 1000 - distancia(l, c) / 60;
      if (nota > mn) { mn = nota; mejor = c; }
    }
    if (!mejor || mn < 3) return null;                 // lo ha visto todo hace nada
    return celdaPisableCerca(R, mejor, R.celda * 3, 0);
  }

  /* ── EL PENSAR DE CADA PASO ──────────────────────────────────────────── */
  function pensarBot(P, l, t, dt) {
    var ia = l.ia;
    var R = P.R;
    var az = P.azar;
    if (!ia.pf) { ia.a = astuciaContra(P, l, null); ia.pf = perfil(ia.a); }

    // ── decidir (4-9 veces por segundo, no en cada paso) ──
    if (t >= ia.proxima) {
      ia.proxima = t + ia.pf.pensar * (0.8 + az() * 0.5);
      decidirBot(P, l, t, t - P.tCombate);
    }

    // ── esquivar (esto sí se mira en cada paso: una bala no espera) ──
    if (ia.esquiva && t >= ia.esquiva.hasta) ia.esquiva = null;
    if (!ia.esquiva && ia.modo !== 'emboscada') {
      var e = balaQueViene(P, l, t);
      if (e) ia.esquiva = { x: e.x, y: e.y, hasta: t + 170 + 150 * ia.a };
    }

    // ── andar ──
    var mx = ia.dirX, my = ia.dirY, ritmo = ia.ritmo;
    if (ia.esquiva) { mx = ia.esquiva.x; my = ia.esquiva.y; ritmo = 1; }
    // El rumbo no cambia de golpe: GIRA hacia el que quiere (más rápido los
    // listos). La esquiva, no: un paso de lado para apartarse de una bala es brusco.
    if (ia.esquiva) { ia.velX = mx; ia.velY = my; }
    else {
      var giro = Math.min(1, dt * (7 + 9 * ia.a));
      ia.velX += (mx - ia.velX) * giro;
      ia.velY += (my - ia.velY) * giro;
    }
    var largo = Math.sqrt(ia.velX * ia.velX + ia.velY * ia.velY);
    var antesX = l.x, antesY = l.y;
    if (largo > 0.04) {
      var v = l.vel * Math.max(0.3, Math.min(1, ritmo)) * dt * Math.min(1, largo) / largo;
      var p = moverCirculo(R, l.x, l.y, ia.velX * v, ia.velY * v, l.r);
      l.x = p[0]; l.y = p[1];
    }
    var movido = Math.abs(l.x - antesX) + Math.abs(l.y - antesY);
    l.moviendo = movido > 0.2;
    if (Math.abs(l.x - antesX) > 0.2) l.mira = l.x > antesX ? 1 : -1;
    if (movido > 0.4 && t >= l.caraHasta) l.cara = Math.atan2(l.y - antesY, l.x - antesX);
    // atascado contra algo: se le cambia el rumbo
    var quiere = Math.abs(mx) + Math.abs(my) > 0.01;
    if (quiere && movido < 0.4) {
      ia.atascado += dt;
      if (ia.atascado > 0.6) { ia.ruta = null; ia.estrafe *= -1; ia.atascado = 0; ia.proxima = t; ia.esquiva = null; ia.pausaHasta = 0; ia.plan = null; ia.destino = null; }
    } else ia.atascado = 0;

    apuntarYDisparar(P, l, t, dt);
  }

  /** El daño de UNA descarga normal si entran todas las balas. */
  function danoDeDescarga(l) {
    var unidad = l.ataque * REGLAS.ESCALA_DANO * (1 + REGLAS.HUESO_MULT * l.potencia);
    return Math.max(1, Math.round(unidad * l.arma.dano)) * l.arma.balas;
  }

  /**
   * Dónde apuntar para darle a `o` con `arma`: el punto donde se encuentran
   * la bala y él si sigue como va. Se resuelve |o + v·T − yo| = vel·T.
   * El adelanto va por la astucia, y a la mitad si acaba de cambiar de
   * sentido (quien zigzaguea engaña al que adelanta de más).
   */
  function puntoDeTiro(l, o, arma, pf, t) {
    var H = REGLAS.ALTO_CUERPO;
    var rx = o.x - l.x, ry = o.y - l.y;
    var k = pf.adelanto;
    if (t - (o.giroEn || 0) < 380) k *= 0.45;
    var vx = o.vx * k, vy = o.vy * k;
    var A = vx * vx + vy * vy - arma.vel * arma.vel;
    var B = 2 * (rx * vx + ry * vy);
    var Cc = rx * rx + ry * ry;
    var T = Math.sqrt(Cc) / arma.vel;
    if (Math.abs(A) > 1e-6) {
      var disc = B * B - 4 * A * Cc;
      if (disc >= 0) {
        var q = Math.sqrt(disc);
        var r1 = (-B - q) / (2 * A), r2 = (-B + q) / (2 * A);
        var mejor = Math.min(r1 > 0 ? r1 : Infinity, r2 > 0 ? r2 : Infinity);
        if (Number.isFinite(mejor)) T = mejor;
      }
    }
    T = Math.min(T, arma.alcance / arma.vel);
    return { x: o.x + vx * T, y: o.y - H + vy * T };
  }

  /** ¿Merece la pena gastar esta bala? (los torpes disparan en cuanto pueden) */
  function debeDisparar(l, q, t) {
    var a = l.ia.a, o = q.obj;
    if (a < 0.35) return true;
    if (l.municion >= 2.6) return true;                      // cargador lleno: no se guarda
    var frac = q.d / q.arma.alcance;
    if (frac <= 0.62) return true;                           // de cerca casi no se falla
    if (o.hp / o.maxHp < 0.3) return true;                   // rematar
    if (o.vx * o.vx + o.vy * o.vy < 625) return true;        // está parado
    if (l.municion >= 2) return true;
    // Le queda una: solo si él no acaba de hacer un quiebro y no está al límite.
    return frac <= 0.82 && t - (o.giroEn || 0) > 300;
  }

  function apuntarYDisparar(P, l, t, dt) {
    var ia = l.ia, pf = ia.pf, R = P.R, az = P.azar, H = REGLAS.ALTO_CUERPO;
    var q = null;                       // lo que quiere disparar: { x, y, arma, sup, d, obj… }
    var obj = ia.objetivo ? P.porId[ia.objetivo] : null;
    if (obj && veBot(P, l, obj, t) && !ia.contenerFuego) {
      var d = distancia(l, obj);
      var vidaObj = obj.hp / obj.maxHp;
      var sup = l.superCarga >= 1 && d <= l.superArma.alcance * 0.88 &&
        (vidaObj < 0.6 || l.hp / l.maxHp < 0.4 || grupoCerca(P, obj, l, 90) >= 1 || ia.a < 0.3 || d < l.superArma.alcance * 0.5);
      var arma = sup ? l.superArma : l.arma;
      if (sup || l.municion >= 1) {
        var pt = puntoDeTiro(l, obj, arma, pf, t);
        var dAp = Math.sqrt((pt.x - l.x) * (pt.x - l.x) + (pt.y - (l.y - H)) * (pt.y - (l.y - H)));
        if (dAp <= arma.alcance * 0.97 + 6) {
          if (lineaDeTiro(R, l.x, l.y - H, pt.x, pt.y)) q = { x: pt.x, y: pt.y, arma: arma, sup: sup, d: d, obj: obj };
          else if (hayTiro(R, l, obj)) q = { x: obj.x, y: obj.y - H, arma: arma, sup: sup, d: d, obj: obj };
        }
      }
    }
    // Un barril con enemigos al lado vale más que un tiro normal de lejos.
    if (ia.barril && l.municion >= 1 && (!q || (!q.sup && q.d > q.arma.alcance * 0.6))) {
      q = { x: ia.barril.x, y: ia.barril.y, arma: l.arma, barril: true };
    }
    // La mata donde se acaba de meter alguien.
    if (!q && ia.sospecha && t < ia.sospecha.hasta && l.municion >= 2) {
      q = { x: ia.sospecha.x, y: ia.sospecha.y - H, arma: l.arma, ciego: true };
    }
    // Sin nadie a la vista: la caja que estaba yendo a romper.
    if (!q && !obj && ia.caja && l.municion >= 1.5 && R.cajas[ia.caja.idx]) {
      var dc = distancia(l, ia.caja);
      if (dc <= l.arma.alcance * 0.85 && lineaDeTiro(R, l.x, l.y - H, ia.caja.bx, ia.caja.by)) {
        q = { x: ia.caja.x, y: ia.caja.y, arma: l.arma, caja: true };
      }
    }

    // La mira GIRA hacia lo que quiere (o hacia donde anda, si no quiere nada).
    var meta = q ? Math.atan2(q.y - (l.y - H), q.x - l.x)
                 : (Math.abs(ia.velX) + Math.abs(ia.velY) > 0.1 ? Math.atan2(ia.velY, ia.velX) : ia.mira);
    var dif = difAngulo(meta, ia.mira);
    var paso = pf.giro * dt;
    ia.mira += Math.max(-paso, Math.min(paso, dif));
    if (!q || t < ia.proximoDisparo) return;
    if (q.obj && t - ia.vistoDesde < pf.reaccion) return;            // aún no ha reaccionado
    if (Math.abs(difAngulo(meta, ia.mira)) > pf.encarar) return;     // aún no le tiene encarado
    if (q.obj && !q.sup && !debeDisparar(l, q, t)) return;
    // El pulso se asienta mientras le sigue: el primer tiro es el peor.
    var err = q.obj ? pf.error * (1.25 - 0.45 * Math.min(1, (t - ia.vistoDesde) / 1500)) : pf.error * 0.35;
    if (dispararAngulo(P, l, ia.mira + gauss(az) * err, !!q.sup, null)) {
      ia.proximoDisparo = t + q.arma.cadencia + az() * (40 + 320 * (1 - ia.a));
      if (q.barril) ia.barril = null;
      if (q.ciego) ia.sospecha = null;
    }
  }

  /* La caja más apetecible cerca de `l`: { x, y, idx, bx, by }.
     Romper cajas da huesos, pero una partida no es para pasársela rompiendo
     cajas (los bots tardaban medio minuto en acercarse a nadie): al
     principio se va a por las que hay en 7 casillas; pasados los primeros
     `prisa` ms, solo a por una dorada cercana o una normal que pille de paso. */
  function cajaCerca(P, l, conPrisa) {
    var R = P.R, mejor = null, mn = Infinity;
    var claves = Object.keys(R.cajas);
    for (var k = 0; k < claves.length; k++) {
      var c = R.cajas[claves[k]];
      if (c.barril) continue;
      var i = Number(claves[k]);
      var pt = celdaCentro(R, i % R.ancho, Math.floor(i / R.ancho));
      var d = distancia(l, pt);
      var tope = R.celda * (conPrisa ? (c.oro ? 5 : 2.6) : (c.oro ? 8 : 6));
      if (d > tope || !libreDeGas(P, pt, 8, 4000)) continue;
      var nota = d * (c.oro ? 0.55 : 1);
      if (nota < mn) {
        mn = nota;
        // El borde de la caja por el lado del que se la mira (para la línea de tiro).
        var u = d || 1;
        mejor = { x: pt.x, y: pt.y, idx: i, bx: pt.x - (pt.x - l.x) / u * (R.celda * 0.72), by: pt.y - (pt.y - (l.y - REGLAS.ALTO_CUERPO)) / u * (R.celda * 0.72) };
      }
    }
    return mejor;
  }

  /** ¿Cuántos OTROS bots van ya a por `o`? (para repartirse) */
  function cazadoresDe(P, o, yo) {
    var n = 0;
    for (var i = 0; i < P.luchadores.length; i++) {
      var b = P.luchadores[i];
      if (b === yo || !b.vivo || !b.ia || b.humano) continue;
      if (b.ia.objetivo === o.id) n++;
    }
    return n;
  }

  /** ¿Cuántos enemigos de `yo` hay a menos de `radio` de `o`? (súper en grupo) */
  function grupoCerca(P, o, yo, radio) {
    var n = 0;
    for (var i = 0; i < P.luchadores.length; i++) {
      var b = P.luchadores[i];
      if (b === o || b === yo || !b.vivo) continue;
      if (dist2(b, o) <= radio * radio) n++;
    }
    return n;
  }

  /** ¿Está `o` peleándose con otro que no soy yo? (el cazador espera) */
  function ocupado(P, o, yo, t) {
    if (o.ia && o.ia.objetivo && o.ia.objetivo !== yo.id) return true;
    return !!(o.ultimoGolpe && o.ultimoGolpe.id !== yo.id && t - o.ultimoGolpe.t < 2000);
  }

  /* A QUIÉN. Se puntúa a todos los que VE (la nota más baja gana):
       · el que está cerca, y mejor si hay tiro sin rodear nada;
       · quien le está pegando va primero (se defiende y se venga);
       · el tocado apetece más (rematar);
       · si a alguien ya van otros, busca otro: los bots se REPARTEN y por eso
         se acaban cruzando y peleando entre ellos;
       · no salta de uno a otro a cada momento;
       · al que lleva muchos más huesos, si él está tocado, mejor no. */
  function elegirObjetivo(P, l, t) {
    var ia = l.ia, R = P.R;
    var mejor = null, mejorNota = Infinity;
    for (var i = 0; i < P.luchadores.length; i++) {
      var o = P.luchadores[i];
      if (!veBot(P, l, o, t)) continue;
      if (ia.rival == null) ia.rival = o.id;
      var nota = distancia(l, o);
      if (!hayTiro(R, l, o)) nota *= 1.3;
      if (o.id === ia.objetivo) nota *= 0.72;
      var am = ia.amenazas[o.id];
      if (am && t - am.t < 4500) nota *= 0.5;
      nota *= 0.6 + 0.4 * (o.hp / o.maxHp);
      nota *= 1 + 0.55 * cazadoresDe(P, o, l);
      if (o.id === ia.rival) nota *= 0.9;
      if (o.potencia - l.potencia >= 3 && l.hp / l.maxHp < 0.5) nota *= 1.35;
      if (nota < mejorNota) { mejorNota = nota; mejor = o; }
    }
    return mejor;
  }

  /**
   * Una bala que viene derecha: devuelve hacia dónde apartarse, o null.
   * Como una persona: no la ve hasta pasado su tiempo de reflejos, y decide
   * UNA vez por bala si se aparta. Si lo decidiera en cada paso las esquivaría
   * todas.
   */
  function balaQueViene(P, l, t) {
    var R = P.R, ia = l.ia, pf = ia.pf, H = REGLAS.ALTO_CUERPO;
    for (var i = 0; i < P.balas.length; i++) {
      var b = P.balas[i];
      if (b.duenio === l.id || t - (b.nacio || 0) < pf.reflejo) continue;
      if (b.vistaPor && b.vistaPor[l.id]) continue;
      var rx = l.x - b.x, ry = (l.y - H) - b.y;
      var delante = rx * b.dx + ry * b.dy;                    // lo que le falta para llegar
      if (delante <= 0 || delante > Math.min(b.resto, b.vel * 0.55)) continue;
      var lado = rx * -b.dy + ry * b.dx;                      // a qué lado de la línea está
      if (Math.abs(lado) > l.golpe + b.radio + 5) continue;
      if (!b.vistaPor) b.vistaPor = {};
      b.vistaPor[l.id] = 1;
      if (P.azar() > pf.esquiva) continue;
      // Hacia el lado en el que ya está; si lleva rumbo hacia el otro y casi
      // está en la línea, se sigue por donde iba (frenar es lo que te come la bala).
      var s = lado >= 0 ? 1 : -1;
      var haciaOtro = ia.velX * -b.dy * -s + ia.velY * b.dx * -s;
      if (Math.abs(lado) < 5 && haciaOtro > 0.3) s = -s;
      var ex = -b.dy * s, ey = b.dx * s;
      // Si por ese lado hay un muro (o el gas), por el otro.
      var p = moverCirculo(R, l.x, l.y, ex * 16, ey * 16, l.r);
      if (Math.abs(p[0] - l.x) + Math.abs(p[1] - l.y) < 7 || enGas(P, p[0], p[1], P.gas.d + 4)) { ex = -ex; ey = -ey; }
      return { x: ex, y: ey };
    }
    return null;
  }

  /** Una casilla cerca de `l` desde la que `obj` NO le ve (un muro en medio). */
  function cobertura(P, l, obj) {
    var R = P.R;
    var cx = Math.floor(l.x / R.celda), cy = Math.floor(l.y / R.celda);
    var mejor = null, mn = Infinity;
    for (var y = cy - 5; y <= cy + 5; y++) {
      for (var x = cx - 5; x <= cx + 5; x++) {
        if (bloqueaPaso(celdaEn(R, x, y))) continue;
        var p = celdaCentro(R, x, y);
        if (hayTiro(R, obj, p) || !libreDeGas(P, p, 6, 6000)) continue;
        var dObj = distancia(obj, p);
        if (dObj < 60) continue;                              // pegado a él no es cubrirse
        // Cerca de mí, y mejor si no hay que pasar por delante de él.
        var nota = distancia(l, p) + (dObj < distancia(l, obj) ? 60 : 0);
        if (nota < mn) { mn = nota; mejor = p; }
      }
    }
    return mejor;
  }

  /** Un barril a tiro con algún enemigo al lado (y yo lejos de él). */
  function barrilUtil(P, l, t) {
    var R = P.R, rad = REGLAS.BARRIL_RADIO, alc = l.arma.alcance, H = REGLAS.ALTO_CUERPO;
    var mejor = null, mejorN = 0;
    var claves = Object.keys(R.cajas);
    for (var k = 0; k < claves.length; k++) {
      var c = R.cajas[claves[k]];
      if (!c.barril) continue;
      var i = Number(claves[k]);
      var p = celdaCentro(R, i % R.ancho, Math.floor(i / R.ancho));
      var d2 = dist2(l, p);
      if (d2 < (rad * 1.2) * (rad * 1.2) || d2 > alc * alc * 0.9) continue;
      // La línea hasta el borde del barril (el barril mismo para las balas).
      var d = Math.sqrt(d2);
      var bx = p.x - (p.x - l.x) / d * 18, by = p.y - (p.y - (l.y - H)) / d * 18;
      if (!lineaDeTiro(R, l.x, l.y - H, bx, by)) continue;
      var n = 0;
      for (var j = 0; j < P.luchadores.length; j++) {
        var o = P.luchadores[j];
        if (!veBot(P, l, o, t)) continue;
        if (dist2(o, p) <= (rad * 0.8) * (rad * 0.8)) n++;
      }
      if (n > mejorN) { mejorN = n; mejor = p; }
    }
    return mejor;
  }

  /** ¿Hay un barril entero a menos de su radio de `p`? (no es sitio para pararse) */
  function juntoABarril(P, p) {
    var R = P.R, rad = REGLAS.BARRIL_RADIO * 0.85;
    var cx = Math.floor(p.x / R.celda), cy = Math.floor(p.y / R.celda);
    for (var y = cy - 3; y <= cy + 3; y++) for (var x = cx - 3; x <= cx + 3; x++) {
      if (celdaEn(R, x, y) !== 'x') continue;
      var q = celdaCentro(R, x, y);
      if (dist2(p, q) <= rad * rad) return true;
    }
    return false;
  }

  function objetoCerca(P, l, tipo, radio) {
    var mejor = null, md = radio * radio;
    for (var h = 0; h < P.objetos.length; h++) {
      var o = P.objetos[h];
      if (tipo && o.tipo !== tipo) continue;
      if (o.tipo === 'carne' && l.hp >= l.maxHp) continue;
      if (o.tipo === 'hueso' && l.potencia >= REGLAS.HUESO_MAX) continue;
      if (o.tipo === 'municion' && l.municion >= REGLAS.MUNICION) continue;
      if (o.tipo === 'super' && l.superCarga >= 1) continue;
      if (o.tipo === 'escudo' && l.escudo > 0) continue;
      if (o.tipo === 'rapidez' && l.rapidezHasta > P.tUltimo) continue;
      var d = dist2(l, o);
      if (d < md) { md = d; mejor = o; }
    }
    return mejor;
  }

  /* Escoge una POSICIÓN de combate alrededor del rival, no la del rival: diez
     puntos en un arco a `radio` de él, y se queda con el mejor (cerca de mí,
     con tiro —o sin él, si es para retirarse—, sin gas, sin barriles al lado,
     y sin amontonarse con otros). Los listos prefieren llegar por la hierba. */
  function posicionTactica(P, l, obj, radio, retirada) {
    var ia = l.ia, R = P.R, mejor = null, notaMejor = Infinity;
    var base = Math.atan2(l.y - obj.y, l.x - obj.x);
    for (var i = 0; i < 10; i++) {
      var a = base + (i - 4.5) * 0.30 * ia.estrafe;
      var p = { x: obj.x + Math.cos(a) * radio, y: obj.y + Math.sin(a) * radio };
      if (p.x < 0 || p.y < 0 || p.x >= R.anchoPx || p.y >= R.altoPx) continue;
      var ch = celdaDePunto(R, p.x, p.y);
      if (bloqueaPaso(ch) || !libreDeGas(P, p, l.r + 4, 5000)) continue;
      var libre = hayTiro(R, obj, p);
      var nota = distancia(l, p);
      nota += retirada ? (libre ? 180 : -60) : (libre ? 0 : 120);
      if (!lineaLibre(R, l.x, l.y, p.x, p.y, l.r)) nota += 50;
      if (juntoABarril(P, p)) nota += 140;
      if (!retirada && ch === '*' && ia.a >= 0.5) nota -= 40;
      // Separación entre atacantes: evita que todos lleguen por el mismo lado.
      for (var j = 0; j < P.luchadores.length; j++) {
        var o = P.luchadores[j];
        if (o === l || o === obj || !o.vivo || !veBot(P, l, o, P.tUltimo)) continue;
        if (dist2(o, p) < 60 * 60) nota += 80;
      }
      if (nota < notaMejor) { notaMejor = nota; mejor = p; }
    }
    return mejor;
  }

  function ejecutarPlan(P, l, p, modo, t, duracion) {
    if (!p) return false;
    l.ia.modo = modo;
    l.ia.plan = { x: p.x, y: p.y, modo: modo, hasta: t + duracion, objetivo: l.ia.objetivo };
    irHacia(P, l, p.x, p.y, t);
    return true;
  }

  /** ¿Se puede dar un paso hacia (mx, my) sin chocar ni meterse en el gas? */
  function pasoLibre(P, l, mx, my) {
    var n = Math.sqrt(mx * mx + my * my);
    if (n < 1e-3) return true;
    var x = l.x + mx / n * 30, y = l.y + my / n * 30;
    return lineaLibre(P.R, l.x, l.y, x, y, l.r) && !enGas(P, x, y, P.gas.d + 8);
  }

  /* LA DECISIÓN. En orden: el gas manda sobre todo; luego seguir vivo
     (retirarse, curarse, recargar a cubierto); luego la pelea; y sin nadie a
     la vista, buscar al que se escondió, coger lo que haya y explorar. Lo que
     sale de aquí es un RUMBO (dirX, dirY), un paso (ritmo) y a quién apuntar;
     disparar lo hace apuntarYDisparar en cada paso. */
  function decidirBot(P, l, t, enCombate) {
    var ia = l.ia, R = P.R, az = P.azar, E = ia.E, C = R.celda;
    percibir(P, l, t);
    marcarVisto(P, l, t);
    ia.barril = null;
    ia.caja = null;
    ia.acechando = false;
    ia.contenerFuego = false;
    ia.modo = 'explorar';
    ia.ritmo = 1;
    // La pausa "a mirar" solo dura mientras siga paseando: cualquier otra
    // decisión (un enemigo, el gas) la corta.
    var pausa = ia.pausaHasta;
    ia.pausaHasta = 0;

    // 1) A QUIÉN (ver elegirObjetivo). Solo cuenta el que VE.
    var obj = elegirObjetivo(P, l, t);
    var anterior = ia.objetivo ? P.porId[ia.objetivo] : null;
    var pf = ia.pf = perfil(ia.a = astuciaContra(P, l, obj || anterior));
    var a = ia.a;
    if (obj) {
      var desde = ia.mem[obj.id] ? ia.mem[obj.id].desde : t;
      // Cambiar de blanco también cuesta un instante (algo menos que verle aparecer).
      if (ia.objetivo !== obj.id) ia.vistoDesde = Math.max(desde, t - pf.reaccion * 0.6);
      else ia.vistoDesde = Math.max(ia.vistoDesde, desde);
      ia.objetivo = obj.id;
      ia.perdidoDesde = 0;
      ia.recuerdo = { x: obj.x, y: obj.y, t: t };
    } else if (ia.objetivo) {
      if (!anterior || !anterior.vivo) { ia.objetivo = null; ia.recuerdo = null; }
      else {
        if (!ia.perdidoDesde) ia.perdidoDesde = t;
        if (t - ia.perdidoDesde > 2600) ia.objetivo = null;
      }
    }
    var dd = obj ? distancia(l, obj) : Infinity;
    var alcance = l.arma.alcance;
    var vida = l.hp / l.maxHp;

    // 2) EL GAS manda sobre todo lo demás. Los listos se van antes; en plena
    //    pelea se aguanta hasta que lo tiene encima.
    if (P.gas.max > 0) {
      var antes = 2200 + 5000 * a;
      var yaDentro = enGas(P, l.x, l.y, P.gas.d + 6);
      var loEstara = !libreDeGas(P, l, 14, antes);
      if (yaDentro || (loEstara && !(obj && dd < alcance && vida > 0.45 && libreDeGas(P, l, 10, 1500)))) {
        var seguro = puntoSeguro(P, l, antes + 3000);
        ia.modo = 'gas'; ia.plan = null;
        if (yaDentro) ia.esquiva = null;
        irHacia(P, l, seguro.x, seguro.y, t);
        return;
      }
    }

    // 3) SEGUIR VIVO.
    var carne = vida < 0.75 ? objetoCerca(P, l, 'carne', C * 12) : null;
    if (carne && !libreDeGas(P, carne, 8, 3000)) carne = null;
    // Un plan de retirada o de recarga en curso se respeta mientras tenga sentido.
    var plan = ia.plan;
    if (plan && t < plan.hasta && libreDeGas(P, plan, 8, 2000) &&
        ((plan.modo === 'recuperar' && vida < 0.8 && !(obj && dd < 70)) || (plan.modo === 'recargar' && l.municion < 1.8))) {
      ia.modo = plan.modo;
      /* Retirándose no dispara: disparar reinicia la espera de la cura
         (dispararAngulo pone regenDesde) y delata en la hierba. Recargando,
         tampoco: guarda las balas para cuando vuelva. Salvo que lo tenga
         encima: entonces se defiende. */
      ia.contenerFuego = !(obj && dd < 80);
      irHacia(P, l, plan.x, plan.y, t);
      return;
    }
    if (obj) {
      var suAlcance = obj.arma.alcance;
      var amenaza = dd < suAlcance * 1.25 + 30;
      var peor = vida - obj.hp / obj.maxHp;                  // negativo = voy perdiendo
      var mal = vida < E.retirada + 0.10 * a || (a >= 0.5 && peor < -0.35 && vida < 0.6 && obj.municion >= 1);
      // Rematar gana a retirarse: si con lo que llevo cargado le tumbo, no me voy.
      var leTumbo = dd <= alcance && obj.hp <= danoDeDescarga(l) * Math.floor(l.municion) && hayTiro(R, l, obj);
      if (amenaza && mal && !leTumbo) {
        if (carne && dist2(carne, obj) > dist2(carne, l)) { ia.modo = 'curar'; irHacia(P, l, carne.x, carne.y, t); return; }
        // Retirándose, sin disparar (ver el plan en curso, arriba).
        ia.contenerFuego = dd >= 80;
        var cub = cobertura(P, l, obj);
        var arb = a >= 0.3 ? arbustoCerca(P, l, 6, obj) : null;
        if (arb && (!cub || dist2(l, arb) < dist2(l, cub) * 1.3)) { ejecutarPlan(P, l, arb, 'recuperar', t, REGLAS.REGEN_ESPERA_MS + 2500); return; }
        if (cub) { ejecutarPlan(P, l, cub, 'recuperar', t, REGLAS.REGEN_ESPERA_MS + 2500); return; }
        var lejos = posicionTactica(P, l, obj, suAlcance * 1.3 + 30, true);
        if (lejos) { ejecutarPlan(P, l, lejos, 'recuperar', t, 2200); return; }
        // Sin dónde meterse: alejarse, de lado para que no acierte.
        var hx = l.x - obj.x, hy = l.y - obj.y, hl = Math.sqrt(hx * hx + hy * hy) || 1;
        fijarDir(ia, hx / hl - hy / hl * ia.estrafe * 0.5, hy / hl + hx / hl * ia.estrafe * 0.5);
        ia.ruta = null; ia.modo = 'recuperar';
        return;
      }
      // 4) SIN MUNICIÓN (y sin súper): a cubierto hasta recargar.
      if (l.municion < 1 && l.superCarga < 1 && a >= 0.25 && dd < suAlcance * 1.2 + 20) {
        var cub2 = cobertura(P, l, obj) || posicionTactica(P, l, obj, suAlcance * 1.25 + 20, true);
        if (cub2) { ia.contenerFuego = dd >= 80; ejecutarPlan(P, l, cub2, 'recargar', t, l.arma.recarga * 1.6 + 300); return; }
      }
    }
    if (carne && (!obj || dd > alcance * 1.15 || vida < 0.4)) { ia.modo = 'curar'; irHacia(P, l, carne.x, carne.y, t); return; }

    // 5) UN BARRIL con enemigos al lado: dispararle (lo hace apuntarYDisparar).
    if (a >= 0.25) ia.barril = barrilUtil(P, l, t);

    // 6) LA PELEA.
    if (obj) {
      ia.modo = 'combatir';
      var suyo = obj.arma.alcance;
      /* A QUÉ DISTANCIA. Si llego más lejos que él, desde fuera de su
         alcance; si llega más él, encima (de lejos solo recibo); parejos, a
         la que le guste a su carácter. */
      var ideal;
      if (alcance > suyo + 30) ideal = Math.min(alcance * 0.9, Math.max(suyo + 34, alcance * E.ideal));
      else if (alcance < suyo - 30) ideal = alcance * (0.55 + 0.12 * (1 - a));
      else ideal = alcance * E.ideal;
      if (obj.hp / obj.maxHp < 0.35 || l.superCarga >= 1) ideal = Math.min(ideal, alcance * 0.6);
      if (l.municion < 1 && l.superCarga < 1) ideal = Math.max(ideal, suyo * 1.15);

      /* LA EMBOSCADA. En la hierba y sin que me vea: quieto y sin disparar
         hasta tenerlo a media distancia. Entonces, todo el cargador. */
      var escondido = l.enArbusto && l.reveladoHasta <= t && dd > REGLAS.VISION_ARBUSTO + 6;
      if (escondido && a >= 0.45 && vida > 0.45 && l.municion >= 2 && dd > alcance * 0.55 && t >= ia.sinEmboscadaHasta) {
        /* Solo mientras VENGA hacia mí, y no para siempre: si a los 3 s no
           ha llegado (se ha parado, se ha dado la vuelta), se sale a por él.
           Sin el plazo, contra un rival quieto se quedaba en la mata
           mirándole hasta que cerraba el gas. */
        var viene = obj.vx * (l.x - obj.x) + obj.vy * (l.y - obj.y) > 150;
        if (!ia.emboscadaDesde) ia.emboscadaDesde = t;
        if (viene && t - ia.emboscadaDesde < 3000) {
          ia.acechando = true; ia.contenerFuego = true; ia.modo = 'emboscada';
          fijarDir(ia, 0, 0); ia.ruta = null;
          return;
        }
        ia.sinEmboscadaHasta = t + 6000;
      }
      ia.emboscadaDesde = 0;
      // El cazador deja que otros se peleen y entra cuando uno ya está tocado.
      if (E.paciencia && a >= 0.35 && ocupado(P, obj, l, t) && obj.hp / obj.maxHp > 0.55 && dd > alcance * 0.7) {
        if (!ia.acechoDesde) ia.acechoDesde = t;
        if (t - ia.acechoDesde < E.paciencia) {
          ia.acechando = true; ia.contenerFuego = true;
          var arbA = arbustoCerca(P, l, 5, null);
          if (arbA && distancia(arbA, obj) > alcance * 0.95 && distancia(arbA, obj) < alcance * 1.5) irHacia(P, l, arbA.x, arbA.y, t);
          else {
            var ux0 = (obj.x - l.x) / (dd || 1), uy0 = (obj.y - l.y) / (dd || 1);
            var k0 = dd > alcance * 1.25 ? 0.6 : (dd < alcance * 1.05 ? -0.6 : 0);
            fijarDir(ia, ux0 * k0 - uy0 * ia.estrafe * 0.3, uy0 * k0 + ux0 * ia.estrafe * 0.3);
            ia.ruta = null; ia.ritmo = pf.ritmo;
          }
          return;
        }
      } else ia.acechoDesde = 0;

      var tiro = hayTiro(R, l, obj);
      if (!tiro || dd > alcance * 0.95) {
        // Acercarse: a una posición con tiro, por el flanco.
        if (ia.plan && ia.plan.modo === 'flanquear' && ia.plan.objetivo === obj.id && t < ia.plan.hasta &&
            dist2(l, ia.plan) > 18 * 18 && libreDeGas(P, ia.plan, 8, 2000)) {
          ia.modo = 'flanquear'; irHacia(P, l, ia.plan.x, ia.plan.y, t); return;
        }
        var flanco = posicionTactica(P, l, obj, Math.min(ideal, alcance * 0.85), false);
        if (flanco && ejecutarPlan(P, l, flanco, 'flanquear', t, 900 + az() * 600)) return;
        irHacia(P, l, obj.x + obj.vx * 0.25 * a, obj.y + obj.vy * 0.25 * a, t);
        return;
      }
      /* A TIRO: de lado (para que no acierte) y corrigiendo la distancia. Los
         cambios de lado no son un metrónomo; y si él acaba de disparar, un
         quiebro (los listos). */
      if (t >= ia.cambioEstrafe) {
        if (az() < 0.55) ia.estrafe = -ia.estrafe;
        ia.cambioEstrafe = t + 480 + az() * 1100 * (1.25 - a);
      }
      if (obj.ultimoDisparo > ia.ultimoQuiebro && t - obj.ultimoDisparo < 220 && az() < a * 0.35) {
        ia.estrafe = -ia.estrafe;
        ia.ultimoQuiebro = t;
        ia.cambioEstrafe = t + 300 + az() * 500;
      }
      var ux = (obj.x - l.x) / (dd || 1), uy = (obj.y - l.y) / (dd || 1);
      var acerca = dd > ideal * 1.12 ? 0.8 : (dd < ideal * 0.82 ? -0.8 : 0);
      var lado = 0.5 + 0.5 * a;
      var mx = ux * acerca - uy * ia.estrafe * lado, my = uy * acerca + ux * ia.estrafe * lado;
      if (!pasoLibre(P, l, mx, my)) {
        ia.estrafe = -ia.estrafe;
        mx = ux * acerca - uy * ia.estrafe * lado; my = uy * acerca + ux * ia.estrafe * lado;
        if (!pasoLibre(P, l, mx, my)) { mx = ux * (acerca || 0.6); my = uy * (acerca || 0.6); }
      }
      fijarDir(ia, mx, my);
      ia.ruta = null;
      // Al corregir la distancia corre; solo de lado, a su paso.
      ia.ritmo = acerca !== 0 ? 1 : pf.ritmo;
      return;
    }

    // 7) LO HA PERDIDO DE VISTA: a donde lo vio por última vez. Y si allí hay
    //    hierba, los listos le sueltan un tiro a la mata.
    var rec = ia.recuerdo;
    if (rec && t - rec.t < 6000) {
      var dr = distancia(l, rec);
      // Lo que se sabe de ese sitio va aparte: el recuerdo es solo dónde le vio.
      var info = ia.recInfo && ia.recInfo.t === rec.t ? ia.recInfo : (ia.recInfo = { t: rec.t, arbusto: hayArbustoCerca(R, rec, 1), probado: false });
      if (info.arbusto && a >= 0.5 && l.municion >= 2 && dr < alcance * 0.9 && t - rec.t < 2200 && !info.probado && hayTiro(R, l, rec)) {
        info.probado = true;
        ia.sospecha = { x: rec.x, y: rec.y, hasta: t + 700 };
      }
      if (dr > 36) { ia.modo = 'buscar'; ia.ritmo = 0.92; irHacia(P, l, rec.x, rec.y, t); return; }
    }

    // 8) LO QUE HAYA POR EL SUELO, y las cajas.
    var cosa = objetoCerca(P, l, null, C * 8);
    if (cosa && libreDeGas(P, cosa, 8, 2500)) { ia.modo = 'recurso'; irHacia(P, l, cosa.x, cosa.y, t); return; }
    var caja = l.municion >= 1.5 ? cajaCerca(P, l, enCombate > 12000) : null;
    if (caja) {
      ia.modo = 'recurso';
      ia.caja = caja;
      var dc = distancia(l, caja);
      if (dc > alcance * 0.7 || !lineaDeTiro(R, l.x, l.y - REGLAS.ALTO_CUERPO, caja.bx, caja.by)) irHacia(P, l, caja.x, caja.y, t);
      else { fijarDir(ia, 0, 0); ia.ruta = null; }
      return;
    }

    // 8b) UN RASTRO: a donde vio por última vez a alguien (al empezar, de
    //     dónde salió cada uno). Al llegar y no encontrarle, se da por perdido.
    var rastro = rastroCercano(P, l, t);
    if (rastro) {
      if (dist2(l, rastro) < 40 * 40) rastro.descartado = true;
      else { ia.modo = 'buscar'; ia.ritmo = 0.94; irHacia(P, l, rastro.x, rastro.y, t); return; }
    }

    // 9) EXPLORAR: al trozo del campo que más lleva sin mirar (ver
    //    sectorPorVer); de vez en cuando, a una mata a esperar. Al llegar, a
    //    veces se para a mirar un momento.
    var llego = ia.destino && dist2(l, ia.destino) < 20 * 20;
    if (!ia.destino || t >= ia.destinoHasta || llego || !libreDeGas(P, ia.destino, 8, 6000)) {
      if (llego && az() < 0.3) pausa = t + 250 + az() * 500;
      var arb2 = az() < E.arbusto * 0.3 * (0.5 + a) ? arbustoCerca(P, l, 7, null) : null;
      ia.destino = arb2 || sectorPorVer(P, l, t) || puntoLibreAlAzar(P);
      ia.destinoHasta = t + 2500 + az() * 2500;
      ia.ruta = null;
    }
    if (t < pausa) { ia.pausaHasta = pausa; fijarDir(ia, 0, 0); return; }
    ia.ritmo = 0.88;
    if (ia.destino) irHacia(P, l, ia.destino.x, ia.destino.y, t);
  }

  function fijarDir(ia, x, y) {
    var n = Math.sqrt(x * x + y * y);
    if (n < 1e-3) { ia.dirX = 0; ia.dirY = 0; return; }
    ia.dirX = x / n; ia.dirY = y / n;
  }

  function irHacia(P, l, x, y, t) {
    var ia = l.ia, R = P.R;
    if (dist2(l, { x: x, y: y }) < 6 * 6) { fijarDir(ia, 0, 0); ia.ruta = null; return; }
    // En línea recta si se puede (y no hay agua ni muro en medio).
    if (lineaLibre(R, l.x, l.y, x, y, l.r)) {
      ia.ruta = null;
      fijarDir(ia, x - l.x, y - l.y);
      return;
    }
    var clave = Math.floor(x / R.celda) + ',' + Math.floor(y / R.celda);
    if (!ia.ruta || t >= ia.rutaHasta || ia.rutaObjetivo !== clave) {
      // El camino rodea el gas (y lo que será gas en 3 s) si hay por dónde.
      var d = gasEn(P, (P.tUltimo - P.tCombate) + 3000);
      var coste = d > 0 ? function (i) {
        var p = celdaCentro(R, i % R.ancho, Math.floor(i / R.ancho));
        return enGas(P, p.x, p.y, d) ? 5 : 0;
      } : null;
      ia.ruta = buscarRuta(R, l.x, l.y, x, y, 1600, coste) || [];
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
    if (![x0, y0, x1, y1, r].every(Number.isFinite) || x0 < 0 || y0 < 0 || x1 < 0 || y1 < 0 || x0 > R.anchoPx || x1 > R.anchoPx || y0 > R.altoPx || y1 > R.altoPx) return false;
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

  /** La mata más cercana que vaya a seguir sin gas; con `lejosDe`, una que le
      quede más lejos a él que a mí y fuera de su vista de cerca. */
  function arbustoCerca(P, l, radioCeldas, lejosDe) {
    var R = P.R;
    var cx = Math.floor(l.x / R.celda), cy = Math.floor(l.y / R.celda);
    var mejor = null, md = Infinity;
    for (var y = cy - radioCeldas; y <= cy + radioCeldas; y++) {
      for (var x = cx - radioCeldas; x <= cx + radioCeldas; x++) {
        if (celdaEn(R, x, y) !== '*') continue;
        var p = celdaCentro(R, x, y);
        if (!libreDeGas(P, p, R.celda, 7000)) continue;
        if (lejosDe) {
          var dl = dist2(lejosDe, p);
          if (dl < dist2(l, p) || dl < Math.pow(REGLAS.VISION_ARBUSTO + 30, 2)) continue;
        }
        var d = dist2(l, p);
        if (d < md) { md = d; mejor = p; }
      }
    }
    return mejor;
  }

  /** Un sitio libre al azar del campo que vaya a seguir sin gas (tirando al centro). */
  function puntoLibreAlAzar(P) {
    var R = P.R, j = R.juego;
    var mx = (j.x0 + j.x1) / 2, my = (j.y0 + j.y1) / 2;
    var mejor = null, md = Infinity;
    for (var i = 0; i < 30 && (!mejor || i < 12); i++) {
      var p = { x: j.x0 + P.azar() * (j.x1 - j.x0), y: j.y0 + P.azar() * (j.y1 - j.y0) };
      if (bloqueaPaso(celdaDePunto(R, p.x, p.y)) || !libreDeGas(P, p, R.celda, 12000)) continue;
      p = celdaCentro(R, Math.floor(p.x / R.celda), Math.floor(p.y / R.celda));
      // De dos candidatos, el más céntrico: el final se juega en medio.
      var d = (p.x - mx) * (p.x - mx) + (p.y - my) * (p.y - my);
      if (!mejor || (d < md && P.azar() < 0.6)) { mejor = p; md = d; }
      if (mejor && i >= 2) break;
    }
    return mejor || celdaPisableCerca(R, { x: mx, y: my }, R.celda * 6, 0) || { x: mx, y: my };
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
    desconectar: desconectar,
    reconectar: reconectar,
    resincronizar: resincronizar,
    terminar: terminar,
    loVe: loVe,
    esCaja: esCaja,
    // el gas (el cliente lo pinta con las mismas cuentas)
    enGas: enGas,
    gasEn: gasEn,
    // para las pruebas
    perfil: perfil
  };
});
