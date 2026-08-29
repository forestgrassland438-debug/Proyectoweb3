/* ===========================================================================
 * CUERVOS DE GAMESCENE
 *
 * QUÉ HACE
 *   Uno o varios cuervos que viven en el mapa: se posan en los árboles, vuelan
 *   de uno a otro, a veces bajan a caminar por el suelo o a picotear en una
 *   parcela, y salen volando si el jugador se acerca. Si talan el árbol donde
 *   está posado uno, se va a otro.
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
  function azEnt(a, b) { return Math.floor(az(a, b + 1)); }
  function elegir(lista) { return lista[Math.floor(Math.random() * lista.length)]; }

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
    c.hambriento = false;
    c.hambreEn = scene.time.now + az(HAMBRE_CADA[0], HAMBRE_CADA[1]);
    c.parcela = null;
    c.picoteoEn = 0;
    posarse(st, c, inicio);
    return c;
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

  function posarse(st, c, punto) {
    c.fase = 'posado';
    c.destino = null;
    c.spr.setPosition(punto.x, punto.y);
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
    c.spr.setFlipX(punto.x < c.spr.x);
  }

  /** Huye al árbol disponible más lejos del jugador. */
  function huir(st, c) {
    var scene = st.scene;
    var arboles = arbolesDisponibles(scene);
    if (!arboles.length) return;
    var p = scene.player;
    var mejor = null, mejorD = -1;
    for (var i = 0; i < arboles.length; i++) {
      var pt = posadero(arboles[i].spr);
      var d = p ? Math.hypot(pt.x - p.x, pt.y - p.y) : Math.random();
      // no vale irse al mismo árbol ni a uno pegado al jugador
      if (arboles[i].clave === c.arbol) continue;
      if (d > mejorD) { mejorD = d; mejor = arboles[i]; }
    }
    if (!mejor) return;
    c.asustado = true;
    volarA(st, c, posadero(mejor.spr), 'posado', mejor.clave);
    log(st.scene, 'se asusta y vuela a', mejor.clave);
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

    // Con hambre, la balanza se inclina hacia las parcelas: es lo único que le
    // interesa. Sin hambre reparte 45% árbol · 30% suelo · 25% parcela.
    var hambre = tieneHambre(st, c);
    if (hambre && parcelas(scene).length) r = r * 0.35 + 0.65;

    // 45% cambiar de árbol · 30% bajar a caminar · 25% picotear una parcela
    if (r < 0.45 || !scene.player) {
      if (!arboles.length) { c.hasta = scene.time.now + 3000; return; }
      var libres = lejosDelJugador(scene, arboles, DIST_SUSTO_ARBOL * 1.5);
      var destino = elegir(libres);
      volarA(st, c, posadero(destino.spr), 'posado', destino.clave);
      return;
    }

    if (r < 0.75) {
      // bajar a caminar cerca de un árbol, pero no encima del jugador
      var base = arboles.length ? posadero(elegir(arboles).spr)
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
    var libres2 = lejosDelJugador(scene, pars, DIST_SUSTO_SUELO * 1.4);
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
        // Si se ha comido una cosecha, la parcela cambia de aspecto: se pide al
        // juego que la repinte si sabe hacerlo.
        if (res === 'comida' && typeof st.scene.refrescarCultivos === 'function') {
          try { st.scene.refrescarCultivos(); } catch (e) {}
        }
      })
      .catch(function () { /* sin red: ya se ha saciado igual */ });
  }

  function actualizarCuervo(st, c, dt) {
    var scene = st.scene;
    var spr = c.spr;
    if (!spr || !spr.active) return;
    var ahora = scene.time.now;
    var p = scene.player;

    if (c.fase === 'volando') {
      var dx = c.destino.x - spr.x, dy = c.destino.y - spr.y;
      var d = Math.hypot(dx, dy);
      if (d < 3) {
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
    if (p) {
      var dist = Math.hypot(spr.x - p.x, spr.y - p.y);
      var limite = (c.fase === 'posado') ? DIST_SUSTO_ARBOL : DIST_SUSTO_SUELO;
      if (dist < limite) { huir(st, c); return; }
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
    scene.events.once('shutdown', function () { desmontar(scene); });
    scene.events.once('destroy', function () { desmontar(scene); });

    log(scene, 'montados', st.cuervos.length, 'cuervos');
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfCuervos;
    if (!st) return;
    try {
      if (st.onUpdate) scene.events.off('update', st.onUpdate);
      for (var i = 0; i < st.cuervos.length; i++) {
        var c = st.cuervos[i];
        if (c && c.spr && c.spr.destroy) c.spr.destroy();
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
               y: Math.round(c.spr.y), asustado: c.asustado };
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
      parcelas: parcelas, actualizarCuervo: actualizarCuervo,
      huir: huir, decidir: decidir, profundidadPosado: profundidadPosado,
      tieneHambre: tieneHambre, saciar: saciar, picotearParcela: picotearParcela
    }
  };
})();
