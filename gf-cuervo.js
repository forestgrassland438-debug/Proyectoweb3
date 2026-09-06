/* ===========================================================================
 * CUERVOS DE GAMESCENE
 *
 * QUÉ HACE
 *   Uno o varios cuervos que viven en el mapa: se posan en los árboles, vuelan
 *   de uno a otro, a veces bajan a caminar por el suelo o a picotear en una
 *   parcela, y salen volando si el jugador se acerca. Si talan el árbol donde
 *   está posado uno, se va a otro.
 *
 * SE ENTERA DEL TIEMPO
 *   Cuando llueve o nieva no baja al suelo ni a las parcelas: se mete en la
 *   copa, encoge el cuello y espera, sacudiéndose el agua de vez en cuando. Y
 *   con un trueno levanta el vuelo y se cambia de árbol. Todo eso está en la
 *   sección "EL CUERVO Y EL TIEMPO"; sin gf-clima se comporta como si siempre
 *   estuviera despejado.
 *
 * NO TOCA NADA DEL JUEGO
 *   El cuervo es un sprite normal SIN cuerpo de física: no colisiona con nada,
 *   no empuja, no se le puede chocar y no interfiere con el jugador, los
 *   árboles ni los cultivos. Es decoración viva. Comer en una parcela es solo
 *   animación: no cambia el estado del cultivo ni habla con el servidor.
 *
 * PROFUNDIDAD
 *   En el suelo se ordena por su Y, como el resto de sprites del juego, así que
 *   pasa por detrás de lo que está más abajo. Volando se pone por encima de
 *   todo, que es donde va un pájaro.
 *
 * CÓMO SE ENGANCHA
 *   GameScene.create():  window.GFCuervo && window.GFCuervo.montar(this);
 *   Se desmonta solo en shutdown/destroy de la escena.
 *
 * API
 *   GFCuervo.montar(scene, opciones)   opciones: { cantidad, debug }
 *   GFCuervo.desmontar(scene)
 *   GFCuervo.estado(scene)             para depurar: lista de cuervos y su fase
 * ======================================================================== */
(function () {
  'use strict';

  var RUTA = './Game/Sprites/cuervo/';
  var CANTIDAD = 2;                 // cuervos a la vez
  var ESCALA = 2;                   // igual que el jugador y el perro

  var DIST_SUSTO_SUELO = 110;       // en el suelo es más asustadizo
  var DIST_SUSTO_ARBOL = 62;        // posado aguanta más
  var VEL_VUELO = 95;               // px por segundo
  var VEL_ANDAR = 22;

  var ESPERA_ARBOL = [4000, 11000]; // cuánto se queda posado
  var ESPERA_SUELO = [3000, 7000];  // cuánto anda o come antes de decidir

  /* HASTA DÓNDE SE VA DE UN VUELO.
   *
   * EL FALLO QUE ARREGLA: `decidir` elegía el árbol entre TODOS los del mapa,
   * y el mapa mide 5008 px. Un vuelo medio salía de unos 2000 px, y a 95 px/s
   * son VEINTE SEGUNDOS en el aire contra los 4-11 que se queda posado. En la
   * simulación, el cuervo se pasaba el 72 % del tiempo volando: no parecía un
   * cuervo, parecía un avión de línea dando vueltas al mapa.
   *
   * Es exactamente el mismo fallo que ya se corrigió en las aves de
   * gf-animales (allí se llama RADIO_VUELO y vale 700); aquí se había quedado
   * sin arreglar. Se deja algo más largo porque un cuervo sí recorre más
   * terreno que una paloma, pero deja de cruzar el mundo entero.
   *
   * Si en la zona no hay ningún árbol dentro del radio, se coge el más cercano
   * de los que haya: nunca se queda sin sitio donde ir.
   */
  var RADIO_VUELO = 950;

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

  // ── HAMBRE ───────────────────────────────────────────────────────────────
  // Cada tanto al cuervo le entra hambre. Con hambre busca parcelas mucho mas
  // a menudo, y si pica en una donde hay cultivo, avisa al SERVIDOR: si esta
  // lista se la come, y si todavia esta creciendo la pisotea y la retrasa.
  // Que pasa exactamente lo decide el backend, no este archivo.
  var HAMBRE_CADA   = [90000, 200000];
  var PICOTEO_MS    = 1600;      // lo que tarda en hincarle el pico

  function log(scene) {
    if (!window.GF_CUERVO_DEBUG) return;
    var a = Array.prototype.slice.call(arguments, 1);
    a.unshift('[cuervo]');
    console.log.apply(console, a);
  }

  function az(a, b) { return a + Math.random() * (b - a); }
  function elegir(lista) { return lista[Math.floor(Math.random() * lista.length)]; }

  /* ══════════════════════════════════════════════════════════════════════
     EL CUERVO Y EL TIEMPO
     ──────────────────────────────────────────────────────────────────────
     LO QUE ESTABA MAL: "el cuervo sigue comiendo". Y era literal — el cuervo
     no miraba el tiempo por ningún lado, así que bajaba a picotear la parcela
     en mitad de la tormenta como si hiciera un día espléndido.

     Un córvido bajo el agua hace exactamente una cosa: se mete en la copa,
     encoge el cuello, deja las plumas de punta y espera. No baja al suelo, no
     come, no cambia de árbol y casi no se mueve. Se sacude cada tanto, y eso
     es todo.

     No hace falta una fase nueva para eso: 'posado' ya es "está en un árbol
     sin hacer nada". Lo único que se añade es que, mientras llueve, `decidir`
     no le deje bajarse, y que se le note en el cuerpo (`encogido`).
     ══════════════════════════════════════════════════════════════════════ */
  var MAL_TIEMPO_ENTRA = 0.30;   // por encima, al árbol
  var MAL_TIEMPO_SALE  = 0.12;   // y no baja hasta que no baje de aquí
  var ENCOGE = 0.10;             // cuánto se achata al encogerse
  var SECO = { activo: false, lluvia: 0, nieve: 0, sol: 0, viento: 0,
               truenos: false, tormenta: false };

  /** Cuánto moja lo que está cayendo ahora mismo, de 0 a 1. */
  function malTiempo() {
    var C = window.GFClima;
    var t = null;
    try {
      if (C && C.ahora) t = C.ahora();
      else if (C && C.estado) {
        /* gf-clima viejo, sin `ahora()`: peor —salta de golpe en vez de
           arreciar— pero funciona. */
        var e = C.estado();
        if (!e || !e.activo) return 0;
        t = { activo: true,
              lluvia: e.lluvia ? (Number(e.lluviaFuerza) || 1) : 0,
              nieve:  e.nieve  ? (Number(e.nieveFuerza)  || 1) : 0 };
      }
    } catch (x) { return 0; }
    if (!t || !t.activo) return 0;
    return Math.max(t.lluvia || 0, (t.nieve || 0) * 0.85);
  }

  // ------------------------------------------------------------- animaciones
  var CLAVES = {
    quieto: ['cuervo_quieto_1', 'cuervo_quieto_2'],
    camina: ['cuervo_camina_1', 'cuervo_camina_2', 'cuervo_camina_3', 'cuervo_camina_4'],
    come:   ['cuervo_come_1', 'cuervo_come_2', 'cuervo_come_3', 'cuervo_come_2'],
    vuela:  ['cuervo_vuela_1', 'cuervo_vuela_2', 'cuervo_vuela_3', 'cuervo_vuela_4']
  };
  var RITMO = { quieto: 2, camina: 8, come: 6, vuela: 12 };

  /** ¿Están cargadas las texturas? Sin ellas no se monta nada. */
  function hayTexturas(scene) {
    for (var g in CLAVES) {
      for (var i = 0; i < CLAVES[g].length; i++) {
        if (!scene.textures.exists(CLAVES[g][i])) return false;
      }
    }
    return true;
  }

  function crearAnimaciones(scene) {
    for (var g in CLAVES) {
      var clave = 'cuervo_' + g;
      if (scene.anims.exists(clave)) continue;
      var frames = [];
      for (var i = 0; i < CLAVES[g].length; i++) frames.push({ key: CLAVES[g][i] });
      scene.anims.create({
        key: clave, frames: frames, frameRate: RITMO[g], repeat: -1
      });
    }
  }

  // ------------------------------------------------------------------ sitios
  /* Árboles donde posarse. Los sprites se llaman sprite_arbolx1..18 y
     sprite_pinos1..45; this.treeStumps marca los que están talados o en
     respawn, y esos no valen. */
  function arbolesDisponibles(scene) {
    var out = [];
    var tocones = scene.treeStumps || {};
    var familias = [['sprite_arbolx', 18], ['sprite_pinos', 45]];
    for (var f = 0; f < familias.length; f++) {
      for (var i = 1; i <= familias[f][1]; i++) {
        var clave = familias[f][0] + i;
        var spr = scene[clave];
        if (!spr || !spr.active || typeof spr.x !== 'number') continue;
        if (tocones[clave]) continue;
        out.push({ clave: clave, spr: spr });
      }
    }
    return out;
  }

  /* Punto donde se posa: arriba de la copa y en el centro.
     Los sprites del mapa se crean con setOrigin(0, 1) — esquina inferior
     izquierda —, así que spr.x NO es el centro ni spr.y el medio. getBounds()
     no depende del origen y evita ese error. */
  function posadero(spr) {
    var b;
    try { b = spr.getBounds(); } catch (e) { b = null; }
    if (!b) {
      return { x: spr.x + (spr.displayWidth || 0) / 2,
               y: spr.y - (spr.displayHeight || 0) * 0.72 };
    }
    return { x: b.centerX, y: b.top + b.height * 0.26 };
  }

  /** Parcelas de cultivo, para bajar a picotear. */
  function parcelas(scene) {
    var out = [];
    if (!scene.plotImages || !scene.plotImages.forEach) return out;
    // La clave del Map es el plotId ('field1'...), y hace falta para poder
    // decirle al servidor EN QUE parcela ha picoteado.
    scene.plotImages.forEach(function (img, clave) {
      if (!img || !img.active) return;
      var b;
      try { b = img.getBounds(); } catch (e) { return; }
      out.push({ x: b.centerX, y: b.bottom - 6, clave: clave });
    });
    return out;
  }

  /** Solo los de la zona; si no hay ninguno, la lista entera. */
  function deLaZona(sitios, c) {
    var out = [];
    for (var i = 0; i < sitios.length; i++) {
      var s = sitios[i].spr ? posadero(sitios[i].spr) : sitios[i];
      if (Math.hypot(s.x - c.spr.x, s.y - c.spr.y) <= RADIO_VUELO) out.push(sitios[i]);
    }
    return out.length ? out : sitios;
  }

  function lejosDelJugador(scene, sitios, minDist) {
    var p = scene.player;
    if (!p) return sitios;
    var ok = [];
    for (var i = 0; i < sitios.length; i++) {
      var s = sitios[i].spr ? posadero(sitios[i].spr) : sitios[i];
      var d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d > minDist) ok.push(sitios[i]);
    }
    return ok.length ? ok : sitios;
  }

  // ------------------------------------------------------------------ cuervo
  function nuevoCuervo(st) {
    var scene = st.scene;
    var arboles = arbolesDisponibles(scene);
    // OJO: hay que elegir el arbol UNA sola vez. Si se llama a elegir() por
    // separado para la posicion y para la clave salen dos arboles distintos:
    // el cuervo se posa en uno pero cree estar en otro, y entonces vigila la
    // tala del arbol equivocado.
    var arbolIni = arboles.length ? elegir(arboles) : null;
    var inicio = arbolIni ? posadero(arbolIni.spr)
                          : { x: scene.player ? scene.player.x : 0,
                              y: scene.player ? scene.player.y - 80 : 0 };

    /* Sombra en el suelo. Volando se queda abajo, pequeña y tenue: es lo que
       hace que se note que el pájaro está en alto y no pegado al césped.

       EL RELLENO VA A TOPE Y LA OPACIDAD LA PONE setAlpha.

       EL FALLO QUE ARREGLA (el mismo que ya se corrigió en gf-animales): el
       último argumento de `add.ellipse` es el fillAlpha, NO el alpha del
       objeto, y Phaser pinta multiplicando los dos. Naciendo con 0,26 y
       poniéndole además `setAlpha(0.26)` en cada fotograma, la sombra del
       cuervo se dibujaba al 0,068 — cuatro veces más clara de lo que dice el
       código. En la práctica el cuervo no tenía sombra. */
    var sombra = null;
    if (scene.add.ellipse) {
      sombra = scene.add.ellipse(inicio.x, inicio.y, 18, 8, 0x000000, 1);
      sombra.setAlpha(0.26);
      sombra.setDepth(inicio.y - 1);
    }

    var spr = scene.add.sprite(inicio.x, inicio.y, CLAVES.quieto[0]);
    spr.setOrigin(0.5, 1);          // las patas en el punto de apoyo
    // Escala del mundo, la misma que el jugador y el perro. Sin ella el cuervo
    // (30x24) salia mas pequeno que una paloma (26x20 a x2), y un cuervo es
    // mayor que una paloma. Para dejarlo como estaba, poner ESCALA = 1.
    spr.setScale(ESCALA);
    spr.setDepth(inicio.y);
    // Sin cuerpo de física a propósito: así no puede colisionar con nada.
    if (spr.setPipeline) { /* nada: usa el pipeline por defecto */ }

    var c = {
      spr: spr,
      fase: 'posado',
      arbol: null,               // clave del árbol donde está posado
      destino: null,
      alFinal: null,             // qué hacer al aterrizar
      hasta: 0,                  // cuándo toca decidir otra vez
      asustado: false
    };
    if (arbolIni) c.arbol = arbolIni.clave;
    c.sombra = sombra;
    c.sombraSuelo = inicio.y;
    c.hambriento = false;
    c.hambreEn = scene.time.now + az(HAMBRE_CADA[0], HAMBRE_CADA[1]);
    c.parcela = null;
    c.picoteoEn = 0;
    // el tiempo
    c.encogido = false;
    c.encoge = 0;
    c.sacudeEn = 0;
    c.sacudeHasta = 0;
    c.truenoVisto = 0;
    c.huyeEn = 0;
    posarse(st, c, inicio);
    return c;
  }

  /** Se encoge sobre sí mismo (o se estira) con un fundido, no de golpe. */
  function encoger(c, dt) {
    var meta = c.encogido ? 1 : 0;
    var v = c.encoge || 0;
    if (v === meta) return;
    v = (v < meta) ? Math.min(meta, v + 2.4 * dt) : Math.max(meta, v - 2.4 * dt);
    c.encoge = v;
    c.spr.setScale(ESCALA, ESCALA * (1 - ENCOGE * v));
  }

  function ritmo(c, k) {
    try { if (c.spr.anims) c.spr.anims.timeScale = k; } catch (e) {}
  }

  function anim(c, nombre) {
    if (c._anim === nombre) return;
    c._anim = nombre;
    if (c.spr && c.spr.anims) c.spr.play('cuervo_' + nombre, true);
  }

  /**
   * Profundidad del cuervo posado en un arbol.
   *
   * EL FALLO QUE ARREGLA: los sprites del mapa se dibujan con
   * depth = obj.y (createOptimizedSprite, setOrigin(0,1) -> obj.y es la BASE
   * del arbol). Al cuervo se le ponia la profundidad del punto donde se posa,
   * que esta en la COPA y por tanto es un numero MUCHO menor. Resultado: el
   * cuervo quedaba por detras del arbol y solo se le veia asomar entre las
   * hojas.
   *
   * Posado va delante de SU arbol (base + 1) y sigue quedando detras de
   * cualquier cosa que este mas abajo en la pantalla, que es lo correcto.
   */
  function profundidadPosado(scene, c, punto) {
    var spr = c.arbol ? scene[c.arbol] : null;
    if (!spr) return punto.y;
    var base = spr.depth;
    if (typeof base !== 'number') {
      try { base = spr.getBounds().bottom; } catch (e) { base = punto.y; }
    }
    return base + 1;
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

  function posarse(st, c, punto) {
    c.fase = 'posado';
    c.destino = null;
    c.spr.setPosition(punto.x, punto.y);
    // Dónde se posó de verdad; el balanceo del viento se suma a esto.
    c.posX = punto.x;
    c.posY = punto.y;
    c.spr.setDepth(profundidadPosado(st.scene, c, punto));
    anim(c, 'quieto');
    c.hasta = st.scene.time.now + az(ESPERA_ARBOL[0], ESPERA_ARBOL[1]);
  }

  function volarA(st, c, punto, alFinal, arbolClave) {
    c.fase = 'volando';
    c.destino = punto;
    c.alFinal = alFinal || 'posado';
    c.arbol = arbolClave || null;
    c.spr.setDepth(PROF_VUELO);
    anim(c, 'vuela');
    /* Volando se aletea a ritmo normal SIEMPRE.

       EL FALLO QUE ARREGLA: al resguardarse de la lluvia se le baja el
       `timeScale` a 0,45 (y a 2,4 en las sacudidas). Si despegaba estando
       encogido —huyendo del jugador, o con un trueno— se llevaba ese ritmo al
       vuelo y cruzaba el mapa aleteando a cámara lenta. Nadie se lo devolvía a
       1 hasta que volviera a posarse y decidir. */
    ritmo(c, 1);
    c.spr.setFlipX(punto.x < c.spr.x);
  }

  /** Huye al árbol disponible más lejos del jugador. */
  function huir(st, c) {
    var scene = st.scene;
    var arboles = arbolesDisponibles(scene);
    var p = scene.player;
    var mejor = null, mejorD = -1;
    for (var i = 0; i < arboles.length; i++) {
      var pt = posadero(arboles[i].spr);
      var d = p ? Math.hypot(pt.x - p.x, pt.y - p.y) : Math.random();
      // no vale irse al mismo árbol ni a uno pegado al jugador
      if (arboles[i].clave === c.arbol) continue;
      /* Y SE CASTIGA LA DISTANCIA. Huyendo puede irse más lejos que en un
         vuelo normal, pero sin cruzar el mapa: sin este castigo, el "más lejos
         del jugador" es siempre la esquina opuesta del mundo, y el cuervo se
         pasaba medio minuto en el aire cada vez que te acercabas. */
      var castigo = Math.hypot(pt.x - c.spr.x, pt.y - c.spr.y) * 0.35;
      if (d - castigo > mejorD) { mejorD = d - castigo; mejor = arboles[i]; }
    }
    if (!mejor) {
      /* Ni un árbol al que irse (mapa sin árboles, o solo queda el suyo).

         EL FALLO QUE ARREGLA: aquí se hacía `return` a secas, y como a `huir`
         se le llama desde el bucle cada vez que el jugador está cerca, el
         cuervo se pasaba SESENTA VECES POR SEGUNDO recorriendo los 63 árboles
         del mapa para no hacer nada. Ahora se aparta a la desesperada y, si
         tampoco puede, se calla un par de segundos antes de volver a mirar. */
      var ang = p ? Math.atan2(c.spr.y - p.y, c.spr.x - p.x) : az(0, 6.283);
      c.huyeEn = scene.time.now + 2000;
      c.asustado = true;
      volarA(st, c, { x: c.spr.x + Math.cos(ang) * 320,
                      y: c.spr.y + Math.sin(ang) * 320 }, 'camina', null);
      return;
    }
    c.asustado = true;
    c.encogido = false;
    volarA(st, c, posadero(mejor.spr), 'posado', mejor.clave);
    log(st.scene, 'se asusta y vuela a', mejor.clave);
  }

  /** El árbol en pie más cercano, para meterse debajo cuanto antes. */
  function arbolMasCerca(scene, c) {
    var arboles = arbolesDisponibles(scene);
    var mejor = null, mejorD = Infinity;
    for (var i = 0; i < arboles.length; i++) {
      var pt = posadero(arboles[i].spr);
      var d = Math.hypot(pt.x - c.spr.x, pt.y - c.spr.y);
      if (d < mejorD) { mejorD = d; mejor = arboles[i]; }
    }
    return mejor;
  }

  /** El árbol donde está posado, ¿sigue en pie? */
  function arbolSigueEnPie(scene, clave) {
    if (!clave) return false;
    var spr = scene[clave];
    if (!spr || !spr.active) return false;
    var tocones = scene.treeStumps || {};
    return !tocones[clave];
  }

  /** ¿Le toca tener hambre ya? */
  function tieneHambre(st, c) {
    if (c.hambriento) return true;
    if (st.scene.time.now >= (c.hambreEn || 0)) { c.hambriento = true; return true; }
    return false;
  }

  function saciar(st, c) {
    c.hambriento = false;
    c.hambreEn = st.scene.time.now + az(HAMBRE_CADA[0], HAMBRE_CADA[1]);
  }

  function decidir(st, c) {
    var scene = st.scene;
    var arboles = arbolesDisponibles(scene);
    var r = Math.random();

    /* ── ¿ESTÁ CAYENDO ALGO? ───────────────────────────────────────────
       Entonces no hay nada que decidir: a la copa y a esperar. Se sale con un
       umbral más bajo del que se entra (0,12 contra 0,30) porque con los dos
       iguales, y la lluvia parada justo ahí, el cuervo bajaría y subiría del
       árbol una y otra vez. */
    var mal = malTiempo();
    if (mal > (c.encogido ? MAL_TIEMPO_SALE : MAL_TIEMPO_ENTRA)) {
      // Ya está en un árbol que sigue en pie: no se mueve de ahí.
      if (c.fase === 'posado' && arbolSigueEnPie(scene, c.arbol)) {
        c.encogido = true;
        anim(c, 'quieto');
        ritmo(c, 0.45);
        c.parcela = null;               // ni se le ocurra picotear bajo el agua
        c.hasta = scene.time.now + az(6000, 15000);
        return;
      }
      // No lo está: al árbol en pie más cercano, sin buscar el mejor.
      var refugio = arbolMasCerca(scene, c);
      if (refugio) {
        c.encogido = true;
        c.parcela = null;
        volarA(st, c, posadero(refugio.spr), 'posado', refugio.clave);
        return;
      }
      // Mapa sin árboles: al menos se queda quieto en el suelo.
      c.encogido = true;
      anim(c, 'quieto');
      ritmo(c, 0.45);
      c.hasta = scene.time.now + 5000;
      return;
    }
    if (c.encogido) { c.encogido = false; ritmo(c, 1); }

    // Con hambre, la balanza se inclina hacia las parcelas: es lo único que le
    // interesa. Sin hambre reparte 45% árbol · 30% suelo · 25% parcela.
    var hambre = tieneHambre(st, c);
    if (hambre && parcelas(scene).length) r = r * 0.35 + 0.65;

    // 45% cambiar de árbol · 30% bajar a caminar · 25% picotear una parcela
    if (r < 0.45 || !scene.player) {
      if (!arboles.length) { c.hasta = scene.time.now + 3000; return; }
      var libres = lejosDelJugador(scene, deLaZona(arboles, c), DIST_SUSTO_ARBOL * 1.5);
      var destino = elegir(libres);
      volarA(st, c, posadero(destino.spr), 'posado', destino.clave);
      return;
    }

    if (r < 0.75) {
      // bajar a caminar cerca de un árbol, pero no encima del jugador
      var base = arboles.length ? posadero(elegir(deLaZona(arboles, c)).spr)
                                : { x: c.spr.x, y: c.spr.y };
      var punto = { x: base.x + az(-70, 70), y: base.y + az(60, 110) };
      if (scene.player &&
          Math.hypot(punto.x - scene.player.x, punto.y - scene.player.y) < DIST_SUSTO_SUELO * 1.4) {
        c.hasta = scene.time.now + 1500;
        return;
      }
      volarA(st, c, punto, 'camina', null);
      return;
    }

    var pars = parcelas(scene);
    if (!pars.length) { c.hasta = scene.time.now + 2000; return; }
    var libres2 = lejosDelJugador(scene, deLaZona(pars, c), DIST_SUSTO_SUELO * 1.4);
    var elegida = elegir(libres2);
    /* Solo se apunta la parcela SI TIENE HAMBRE.
       EL FALLO QUE ARREGLA: `c.parcela` se ponía siempre que bajaba a una
       parcela, y el picoteo avisa al servidor en cuanto hay parcela apuntada.
       Resultado: un cuervo saciado, que baja a una parcela por gusto, se
       comía la cosecha igual. Sin hambre puede picotear todo lo que quiera,
       pero no toca el cultivo. */
    c.parcela = hambre ? (elegida.clave || null) : null;
    c.picoteoEn = 0;
    volarA(st, c, elegida, 'come', null);
  }

  /**
   * El cuervo hinca el pico en una parcela con cultivo.
   *
   * El resultado NO lo decide el navegador: se le dice al servidor en qué
   * parcela ha picado y él mira en qué estado está el cultivo — si está listo
   * se lo come, y si todavía está creciendo lo retrasa. Aquí solo se avisa.
   */
  function picotearParcela(st, c) {
    if (!c.parcela || !window.GFMascota || !window.GFMascota.api) { saciar(st, c); return; }
    var clave = c.parcela;
    c.parcela = null;
    saciar(st, c);
    window.GFMascota.api('/api/crops/crow', { plotId: clave })
      .then(function (r) {
        var res = r && r.datos && r.datos.resultado;
        log(st.scene, 'picoteó', clave, '→', res);
        /* Se la ha comido: la parcela queda vacía. `resetPlot` es la MISMA
           función que usa el juego al recoger o cortar, así que el cuadro
           vuelve a tierra pelada igual que siempre.

           Sin esto, el servidor borraba el cultivo pero en pantalla seguía
           viéndose la planta hasta recargar. */
        if (res === 'comida' && typeof st.scene.resetPlot === 'function') {
          try { st.scene.resetPlot(clave); } catch (e) {}
        }
      })
      .catch(function () { /* sin red: ya se ha saciado igual */ });
  }

  /** La sombra sigue al cuervo por el suelo. */
  function actualizarSombraCuervo(c) {
    if (!c.sombra) return;
    var alto = (c.fase === 'volando' || c.fase === 'posado');
    if (!alto) c.sombraSuelo = c.spr.y;      // en el suelo, recuerda dónde
    var y = alto ? c.sombraSuelo : c.spr.y;
    c.sombra.setPosition(c.spr.x, y);
    c.sombra.setDepth(y - 1);
    c.sombra.setAlpha(alto ? 0.12 : 0.26);
    c.sombra.setScale(alto ? 0.6 : 1);
  }

  function actualizarCuervo(st, c, dt) {
    var scene = st.scene;
    var spr = c.spr;
    if (!spr || !spr.active) return;
    actualizarSombraCuervo(c);
    encoger(c, dt);
    var ahora = scene.time.now;
    var p = scene.player;

    /* EL TRUENO. Un cuervo con un trueno encima levanta el vuelo y se cambia
       de árbol graznando; es lo que hace un córvido de verdad y lo que remata
       la tormenta. `st.trueno` lo pone el oyente que se engancha en `montar`. */
    if (st.trueno && c.truenoVisto !== st.trueno) {
      c.truenoVisto = st.trueno;
      if (c.fase !== 'volando' && Math.random() < 0.6) { huir(st, c); return; }
    }

    /* ESCAMPÓ: SE ESTIRA YA, sin esperar a que le toque decidir.

       Resguardado, la siguiente decisión se sortea entre 6 y 15 segundos; y
       quien lo saca del encogimiento es `decidir`. O sea que el cuervo se
       quedaba con el cuello metido y las plumas de punta bajo un cielo
       despejado hasta un cuarto de minuto después de la última gota. Aquí se
       le devuelve el cuerpo en cuanto para, y se le adelanta la decisión para
       que vuelva a hacer vida normal. */
    if (c.encogido && malTiempo() <= MAL_TIEMPO_SALE) {
      c.encogido = false;
      ritmo(c, 1);
      if (c.hasta > ahora + 2500) c.hasta = ahora + az(600, 2500);
    }

    /* Posado en un árbol: se mece CON la rama. Antes el árbol se meneaba con
       el viento y el cuervo se quedaba clavado en el aire. Se suma sobre la
       posición donde se posó (c.posX), nunca sobre la de este frame, para que
       el desplazamiento no se acumule. */
    if (c.fase === 'posado' && c.posX != null) {
      spr.x = c.posX + balanceoSoporte(scene, c.arbol, c.posY);
    }

    if (c.fase === 'volando') {
      var dx = c.destino.x - spr.x, dy = c.destino.y - spr.y;
      var d = Math.hypot(dx, dy);
      /* SE ATERRIZA TAMBIÉN SI EL PASO SE PASA DE LARGO.

         EL FALLO QUE ARREGLA: aquí solo valía `d < 3`, y el paso de un
         fotograma es VEL_VUELO · dt. A 60 fps son 1,6 px y cuela; en móvil,
         que va topado a 30 fps, son 3,2 px — más que el umbral. El cuervo
         llegaba al árbol, se pasaba de largo, daba media vuelta, se volvía a
         pasar... y se quedaba orbitando la copa para siempre sin posarse
         nunca. Es exactamente el mismo fallo que ya se corrigió en el vuelo de
         las aves de gf-animales, y aquí se había quedado sin arreglar. */
      if (d < 3 || VEL_VUELO * dt >= d) {
        if (c.alFinal === 'posado') {
          posarse(st, c, c.destino);
        } else {
          c.fase = c.alFinal;                 // 'camina' o 'come'
          c.arbol = null;
          spr.setPosition(c.destino.x, c.destino.y);
          spr.setDepth(c.destino.y);
          anim(c, c.alFinal === 'come' ? 'come' : 'camina');
          c.hasta = ahora + az(ESPERA_SUELO[0], ESPERA_SUELO[1]);
          c.rumbo = Math.random() < 0.5 ? -1 : 1;
        }
        c.asustado = false;
        return;
      }
      var paso = VEL_VUELO * dt;
      spr.x += (dx / d) * paso;
      spr.y += (dy / d) * paso;
      spr.setFlipX(dx < 0);
      return;
    }

    // ---- en el suelo o posado: ¿hay que salir por patas? ----
    if (p && ahora >= (c.huyeEn || 0)) {
      var dist = Math.hypot(spr.x - p.x, spr.y - p.y);
      var limite = (c.fase === 'posado') ? DIST_SUSTO_ARBOL : DIST_SUSTO_SUELO;
      if (dist < limite) { huir(st, c); return; }
    }

    /* Encogido bajo el agua: cada tanto se sacude. Un pájaro absolutamente
       inmóvil durante un minuto se lee como colgado, no como resguardado. */
    if (c.encogido && c.fase === 'posado') {
      if (ahora >= (c.sacudeEn || 0)) {
        c.sacudeEn = ahora + az(5000, 13000);
        c.sacudeHasta = ahora + az(400, 900);
      }
      ritmo(c, ahora < (c.sacudeHasta || 0) ? 2.4 : 0.45);
    }

    // ---- ¿le han talado el árbol? ----
    if (c.fase === 'posado' && c.arbol && !arbolSigueEnPie(scene, c.arbol)) {
      log(scene, 'talaron', c.arbol, '→ se muda');
      huir(st, c);
      return;
    }

    if (c.fase === 'come' && c.parcela) {
      // Un solo picotazo por visita, y solo tras un momento comiendo: así se
      // ve la animación antes de que pase nada.
      if (!c.picoteoEn) c.picoteoEn = ahora + PICOTEO_MS;
      else if (ahora >= c.picoteoEn) { c.picoteoEn = 0; picotearParcela(st, c); }
    }

    if (c.fase === 'camina') {
      // pasitos cortos de un lado a otro
      spr.x += c.rumbo * VEL_ANDAR * dt;
      spr.setFlipX(c.rumbo < 0);
      spr.setDepth(spr.y);
      if (Math.random() < 0.012) c.rumbo *= -1;
    }

    if (ahora >= c.hasta) decidir(st, c);
  }

  // ------------------------------------------------------------------ montaje
  function montar(scene, opciones) {
    if (!scene || !scene.add || !scene.anims) return null;
    if (scene.__gfCuervos) return scene.__gfCuervos;
    opciones = opciones || {};

    if (!hayTexturas(scene)) {
      console.warn('[cuervo] faltan las texturas del cuervo: no se monta. ' +
                   'Revisa el preload de GameScene.');
      return null;
    }

    var st = { scene: scene, cuervos: [] };
    try {
      crearAnimaciones(scene);
      var n = opciones.cantidad != null ? opciones.cantidad : CANTIDAD;
      for (var i = 0; i < n; i++) st.cuervos.push(nuevoCuervo(st));
    } catch (e) {
      console.warn('[cuervo] no se pudo crear:', e);
      desmontar(scene);
      return null;
    }

    scene.__gfCuervos = st;
    st.onUpdate = function (t, delta) {
      var dt = Math.min(delta || 16, 100) / 1000;   // sin saltos si hay tirón
      for (var i = 0; i < st.cuervos.length; i++) {
        try { actualizarCuervo(st, st.cuervos[i], dt); } catch (e) { /* nunca romper el frame */ }
      }
    };
    scene.events.on('update', st.onUpdate);
    /* Guardados en una variable: los manejadores anónimos que había aquí NO se
       podían quitar en `desmontar`, así que al desmontar a mano (sin apagar la
       escena) se quedaban vivos colgando de la escena y del `st` viejo. */
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);

    /* El trueno, para sobresaltarse con él. Hay que darse de baja al
       desmontar: gf-clima NO se apaga al cambiar de mapa, así que un oyente
       que se quede enganchado arrastra la escena vieja entera con él. */
    st.trueno = 0;
    st.soltarTrueno = null;
    try {
      if (window.GFClima && window.GFClima.alTronar) {
        st.soltarTrueno = window.GFClima.alTronar(function () { st.trueno = Date.now(); });
      }
    } catch (e) { /* sin clima no hay truenos */ }

    log(scene, 'montados', st.cuervos.length, 'cuervos');
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfCuervos;
    if (!st) return;
    try {
      if (st.onUpdate) scene.events.off('update', st.onUpdate);
      if (st.onApagar) {
        scene.events.off('shutdown', st.onApagar);
        scene.events.off('destroy', st.onApagar);
      }
      if (st.soltarTrueno) { st.soltarTrueno(); st.soltarTrueno = null; }
      for (var i = 0; i < st.cuervos.length; i++) {
        var c = st.cuervos[i];
        if (c && c.spr && c.spr.destroy) c.spr.destroy();
        if (c && c.sombra && c.sombra.destroy) c.sombra.destroy();
      }
    } catch (e) { /* al apagar la escena da igual */ }
    st.cuervos = [];
    scene.__gfCuervos = null;
  }

  function estado(scene) {
    var st = scene && scene.__gfCuervos;
    if (!st) return null;
    return st.cuervos.map(function (c) {
      return { fase: c.fase, arbol: c.arbol, x: Math.round(c.spr.x),
               y: Math.round(c.spr.y), asustado: c.asustado,
               encogido: c.encogido, malTiempo: Math.round(malTiempo() * 100) / 100 };
    });
  }

  window.GFCuervo = {
    montar: montar,
    desmontar: desmontar,
    estado: estado,
    RUTA: RUTA,
    CLAVES: CLAVES,
    // se exponen para poder probarlos sin navegador
    _interno: {
      posadero: posadero, arbolesDisponibles: arbolesDisponibles,
      deLaZona: deLaZona, RADIO_VUELO: RADIO_VUELO,
      parcelas: parcelas, actualizarCuervo: actualizarCuervo,
      huir: huir, decidir: decidir, profundidadPosado: profundidadPosado,
      tieneHambre: tieneHambre, saciar: saciar, picotearParcela: picotearParcela,
      malTiempo: malTiempo, arbolMasCerca: arbolMasCerca, encoger: encoger,
      MAL_TIEMPO_ENTRA: MAL_TIEMPO_ENTRA, MAL_TIEMPO_SALE: MAL_TIEMPO_SALE
    }
  };
})();
