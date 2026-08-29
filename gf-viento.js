/* ===========================================================================
 * VIENTO
 *
 * QUÉ HACE
 *   De vez en cuando —pocas veces, y ese es el punto— se levanta viento: cruzan
 *   hojas arrastradas, se ven ráfagas de aire pasar y los árboles se mecen.
 *   Dura unos minutos y se va. Como en Stardew Valley: no es un modo del juego,
 *   es algo que pasa mientras juegas.
 *
 * NO TOCA NADA DEL JUEGO
 *   Las hojas y las ráfagas son sprites sueltos SIN cuerpo de física, pegados a
 *   la cámara. El único sprite del mundo al que toca es a los árboles, y solo
 *   para inclinarlos un poco: se les guarda su rotación original y se les
 *   devuelve tal cual al parar el viento.
 *
 * POR QUÉ VA PEGADO A LA CÁMARA
 *   Las hojas solo se ven mientras cruzan la pantalla, así que no tiene sentido
 *   moverlas por el mundo: se reciclan de un lado al otro de la vista con
 *   setScrollFactor(0). Con el mapa a 5008x5008 eso es la diferencia entre 40
 *   sprites y varios miles.
 *
 * CÓMO SE ENGANCHA
 *   GameScene.preload():  window.GFViento && window.GFViento.precargar(this);
 *   GameScene.create():   window.GFViento && window.GFViento.montar(this);
 *
 * API
 *   GFViento.montar(scene) / desmontar(scene)
 *   GFViento.soplar(ms)     fuerza una racha (para probarlo sin esperar)
 *   GFViento.parar()
 *   GFViento.estado()
 * ======================================================================== */
(function () {
  'use strict';

  var RUTA = './Game/Objetos/viento/';
  var HOJAS   = ['hoja_1', 'hoja_2', 'hoja_3', 'hoja_4'];
  var RAFAGAS = ['rafaga_1', 'rafaga_2', 'rafaga_3'];

  // Cada cuánto se levanta viento y cuánto dura. Es raro a propósito: si
  // soplara siempre dejaría de llamar la atención.
  var ESPERA   = [9 * 60000, 22 * 60000];
  var DURACION = [70000, 160000];
  var ENTRA_MS = 6000;          // lo que tarda en arreciar y en amainar

  var N_HOJAS   = 26;
  var N_RAFAGAS = 4;

  // Profundidad: por encima del mundo y por DEBAJO de la capa de noche (9000),
  // igual que los pájaros volando. Si fueran por encima, de noche las hojas se
  // verían iluminadas sobre un mundo a oscuras.
  var PROF_HOJAS   = 7900;
  var PROF_RAFAGAS = 7950;

  var VEL_BASE = 190;           // px/s de la hoja con el viento al máximo
  var INCLINA  = 0.035;         // radianes que se mece un árbol

  function log() {
    if (!window.GF_VIENTO_DEBUG) return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[viento]');
    console.log.apply(console, a);
  }

  function az(a, b) { return a + Math.random() * (b - a); }
  function elegir(l) { return l[Math.floor(Math.random() * l.length)]; }

  function precargar(scene) {
    if (!scene || !scene.load) return 0;
    var n = 0, i;
    for (i = 0; i < HOJAS.length; i++) {
      scene.load.image('gfv_' + HOJAS[i], RUTA + HOJAS[i] + '.png'); n++;
    }
    for (i = 0; i < RAFAGAS.length; i++) {
      scene.load.image('gfv_' + RAFAGAS[i], RUTA + RAFAGAS[i] + '.png'); n++;
    }
    return n;
  }

  function hayTexturas(scene) {
    for (var i = 0; i < HOJAS.length; i++) {
      if (!scene.textures.exists('gfv_' + HOJAS[i])) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ hojas
  function nuevaHoja(st, dentro) {
    var cam = st.scene.cameras.main;
    var w = cam.width, h = cam.height;
    var s = st.scene.add.image(0, 0, 'gfv_' + elegir(HOJAS));
    s.setScrollFactor(0);
    s.setDepth(PROF_HOJAS);
    s.setScale(2);
    var hoja = {
      spr: s,
      // Cada hoja lleva su propio ritmo de bamboleo: si todas ondularan igual
      // se vería la cuadrícula.
      fase: az(0, Math.PI * 2),
      vaiven: az(0.6, 2.2),
      amplitud: az(6, 22),
      vel: az(0.75, 1.35),
      giro: az(-2.2, 2.2)
    };
    reponer(st, hoja, dentro, w, h);
    return hoja;
  }

  function reponer(st, hoja, dentro, w, h) {
    // Cuántas veces ha dado la vuelta esta hoja. No lo usa el juego: sirve para
    // poder AFIRMAR desde fuera si una hoja ha vuelto a empezar. Sin esto, una
    // prueba solo puede adivinarlo por el salto de posición, y adivinarlo sale
    // mal: al reciclarse por abajo la x apenas cambia, y la y sube y baja sola
    // por el bamboleo.
    hoja.vueltas = (hoja.vueltas || 0) + (dentro ? 0 : 1);
    // Entra por el lado de barlovento y sale por el otro.
    hoja.x = dentro ? az(-40, w + 40) : (st.dir > 0 ? az(-90, -20) : az(w + 20, w + 90));
    hoja.y = az(-30, h + 30);
    hoja.spr.setPosition(hoja.x, hoja.y);
    hoja.spr.setAlpha(0);
  }

  function moverHojas(st, dt, w, h) {
    for (var i = 0; i < st.hojas.length; i++) {
      var j = st.hojas[i];
      j.fase += dt * j.vaiven;
      j.x += st.dir * VEL_BASE * j.vel * st.fuerza * dt;
      // El bamboleo va en la vertical y depende de la fuerza: con poco viento
      // las hojas casi solo caen, con mucho salen disparadas.
      j.y += (Math.sin(j.fase) * j.amplitud + 14) * st.fuerza * dt;
      j.spr.setPosition(j.x, j.y);
      j.spr.setAlpha(st.fuerza * 0.95);
      j.spr.rotation += j.giro * st.fuerza * dt;
      if (j.x < -110 || j.x > w + 110 || j.y > h + 60) reponer(st, j, false, w, h);
    }
  }

  // ---------------------------------------------------------------- ráfagas
  function nuevaRafaga(st) {
    var s = st.scene.add.image(0, 0, 'gfv_' + elegir(RAFAGAS));
    s.setScrollFactor(0);
    s.setDepth(PROF_RAFAGAS);
    s.setScale(az(1.6, 3.2));
    s.setAlpha(0);
    return { spr: s, x: 0, y: 0, vel: az(1.5, 2.6), esperaHasta: 0 };
  }

  function moverRafagas(st, dt, w, h) {
    var ahora = st.scene.time.now;
    for (var i = 0; i < st.rafagas.length; i++) {
      var r = st.rafagas[i];
      if (r.esperaHasta > ahora) { r.spr.setAlpha(0); continue; }
      r.x += st.dir * VEL_BASE * r.vel * st.fuerza * dt;
      r.spr.setPosition(r.x, r.y);
      // Casi transparentes: es aire. Se ven de refilón y eso basta.
      r.spr.setAlpha(st.fuerza * 0.22);
      r.spr.setFlipX(st.dir < 0);
      if (r.x < -160 || r.x > w + 160) {
        r.x = st.dir > 0 ? az(-200, -80) : az(w + 80, w + 200);
        r.y = az(20, h - 20);
        // Una pausa entre pasadas: si cruzaran sin parar parecerían lluvia.
        r.esperaHasta = ahora + az(500, 4000);
      }
    }
  }

  // ---------------------------------------------------------------- árboles
  /** Los árboles del mapa, con su rotación original guardada. */
  function arboles(scene) {
    var out = [];
    var fam = [['sprite_arbolx', 18], ['sprite_pinos', 45]];
    for (var f = 0; f < fam.length; f++) {
      for (var i = 1; i <= fam[f][1]; i++) {
        var spr = scene[fam[f][0] + i];
        if (!spr || spr.active === false || typeof spr.rotation !== 'number') continue;
        out.push({ spr: spr, base: spr.rotation, fase: Math.random() * 6.28 });
      }
    }
    return out;
  }

  function mecerArboles(st, ahora) {
    /* Los sprites del mapa tienen origen (0,1) —la esquina de abajo a la
       izquierda—, así que rotar los inclina desde el PIE. Eso es exactamente lo
       que hace falta: el árbol se mece sin despegarse del suelo. */
    for (var i = 0; i < st.arboles.length; i++) {
      var a = st.arboles[i];
      if (!a.spr || a.spr.active === false) continue;
      var v = Math.sin(ahora / 700 + a.fase) * INCLINA * st.fuerza;
      a.spr.rotation = a.base + v;
    }
  }

  function enderezarArboles(st) {
    for (var i = 0; i < st.arboles.length; i++) {
      var a = st.arboles[i];
      if (a.spr && a.spr.active !== false) a.spr.rotation = a.base;
    }
  }

  // ------------------------------------------------------------------ racha
  function soplar(st, ms) {
    st.soplando = true;
    st.dir = Math.random() < 0.5 ? -1 : 1;
    st.empiezaEn = st.scene.time.now;
    st.acabaEn = st.empiezaEn + (ms || az(DURACION[0], DURACION[1]));
    st.arboles = arboles(st.scene);
    log('empieza a soplar', st.dir > 0 ? 'hacia la derecha' : 'hacia la izquierda',
        Math.round((st.acabaEn - st.empiezaEn) / 1000) + ' s');
  }

  function parar(st) {
    st.soplando = false;
    st.fuerza = 0;
    enderezarArboles(st);
    for (var i = 0; i < st.hojas.length; i++) st.hojas[i].spr.setAlpha(0);
    for (var j = 0; j < st.rafagas.length; j++) st.rafagas[j].spr.setAlpha(0);
    st.proximaEn = st.scene.time.now + az(ESPERA[0], ESPERA[1]);
    log('amaina; vuelve en', Math.round((st.proximaEn - st.scene.time.now) / 60000), 'min');
  }

  function actualizar(st, ahora, delta) {
    var scene = st.scene;
    if (!scene || !scene.cameras || !scene.cameras.main) return;
    var dt = Math.min(delta, 100) / 1000;
    var cam = scene.cameras.main;
    var w = cam.width, h = cam.height;

    /* MANDA EL SERVIDOR.
       Si gf-clima.js ha dicho algo (porque el backend lo dice), eso pesa sobre
       el sorteo local: el clima es del MUNDO, no de cada navegador. Solo cuando
       nadie manda —el módulo de clima no está cargado o el servidor no
       responde— el viento se sortea solo, como antes. */
    if (st.mandado !== null) {
      if (st.mandado && !st.soplando) soplar(st, 24 * 60 * 60 * 1000);
      if (!st.mandado && st.soplando) { parar(st); return; }
    } else if (!st.soplando) {
      if (ahora >= st.proximaEn) soplar(st);
      return;
    }
    if (!st.soplando) return;

    // Arrecia y amaina poco a poco: entrar de golpe se nota falso.
    var t = ahora - st.empiezaEn;
    var queda = st.acabaEn - ahora;
    var f = 1;
    if (t < ENTRA_MS) f = t / ENTRA_MS;
    if (queda < ENTRA_MS) f = Math.min(f, Math.max(0, queda / ENTRA_MS));
    // Rachas: la fuerza no es plana, va y viene.
    st.fuerza = Math.max(0, f * (0.72 + 0.28 * Math.sin(ahora / 2300)) *
                            (st.mandado !== null ? st.fuerzaMandada : 1));

    moverHojas(st, dt, w, h);
    moverRafagas(st, dt, w, h);
    mecerArboles(st, ahora);

    if (ahora >= st.acabaEn) parar(st);
  }

  // ---------------------------------------------------------------- montaje
  function montar(scene, opciones) {
    opciones = opciones || {};
    if (!scene || !scene.add) return null;
    if (scene.__gfViento) return scene.__gfViento;
    if (!hayTexturas(scene)) {
      console.warn('[viento] faltan las texturas: no se monta. ' +
                   'Revisa GFViento.precargar() en el preload.');
      return null;
    }

    var st = {
      scene: scene, hojas: [], rafagas: [], arboles: [],
      // null = nadie manda, se sortea solo. true/false = lo dice el servidor.
      mandado: null, fuerzaMandada: 1,
      soplando: false, fuerza: 0, dir: 1,
      empiezaEn: 0, acabaEn: 0,
      proximaEn: scene.time.now + (opciones.primeraEn != null
                                   ? opciones.primeraEn
                                   : az(ESPERA[0] * 0.3, ESPERA[1]))
    };
    scene.__gfViento = st;
    montado = st;

    var i;
    for (i = 0; i < N_HOJAS; i++)   st.hojas.push(nuevaHoja(st, true));
    for (i = 0; i < N_RAFAGAS; i++) st.rafagas.push(nuevaRafaga(st));
    for (i = 0; i < st.rafagas.length; i++) {
      st.rafagas[i].x = az(-200, scene.cameras.main.width);
      st.rafagas[i].y = az(20, scene.cameras.main.height - 20);
    }

    st.onUpdate = function (t, d) { actualizar(st, t, d); };
    scene.events.on('update', st.onUpdate);
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    log('montado; primera racha en',
        Math.round((st.proximaEn - scene.time.now) / 60000), 'min');
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfViento;
    if (!st) return;
    if (st.onUpdate) scene.events.off('update', st.onUpdate);
    if (st.onApagar) {
      scene.events.off('shutdown', st.onApagar);
      scene.events.off('destroy', st.onApagar);
    }
    // Los árboles son del MAPA, no míos: se les devuelve su rotación.
    enderezarArboles(st);
    var i;
    for (i = 0; i < st.hojas.length; i++)   st.hojas[i].spr.destroy();
    for (i = 0; i < st.rafagas.length; i++) st.rafagas[i].spr.destroy();
    st.hojas.length = 0; st.rafagas.length = 0; st.arboles.length = 0;
    scene.__gfViento = null;
    if (montado === st) montado = null;
  }

  /* La escena donde está montado.

     Se GUARDA al montar en vez de buscarla por `window.game`. Buscarla fallaba
     en cuanto la página no exponía ese global — pasó en el banco de pruebas:
     el viento soplaba bien pero GFViento.estado() devolvía null y parecía que
     no se había montado. */
  var montado = null;

  function escenaViva() {
    if (montado && montado.scene && montado.scene.__gfViento) return montado.scene;
    var g = window.game || (window.phaserScaler && window.phaserScaler.game);
    if (!g || !g.scene || !g.scene.getScenes) return null;
    try {
      var ss = g.scene.getScenes(true) || [];
      for (var i = 0; i < ss.length; i++) if (ss[i].__gfViento) return ss[i];
    } catch (e) {}
    return null;
  }

  window.GFViento = {
    precargar: precargar,
    montar: montar,
    desmontar: desmontar,
    /** Fuerza una racha ahora mismo, para verlo sin esperar. */
    /** El clima manda: sopla o para, con la fuerza que le digan. */
    forzar: function (activo, fuerza) {
      var e = escenaViva();
      if (!e || !e.__gfViento) return false;
      var st = e.__gfViento;
      st.mandado = !!activo;
      st.fuerzaMandada = Math.max(0.2, Math.min(2, Number(fuerza) || 1));
      return true;
    },
    /** Devuelve el mando al sorteo local. */
    soltar: function () {
      var e = escenaViva();
      if (e && e.__gfViento) e.__gfViento.mandado = null;
    },
    soplar: function (ms) {
      var e = escenaViva();
      if (e && e.__gfViento) soplar(e.__gfViento, ms);
      return !!e;
    },
    parar: function () {
      var e = escenaViva();
      if (e && e.__gfViento) parar(e.__gfViento);
      return !!e;
    },
    estado: function () {
      var e = escenaViva();
      if (!e || !e.__gfViento) return null;
      var st = e.__gfViento;
      return { soplando: st.soplando, fuerza: Math.round(st.fuerza * 100) / 100,
               direccion: st.dir, hojas: st.hojas.length,
               arboles: st.arboles.length };
    },
    _interno: { actualizar: actualizar, soplarEn: soplar, pararEn: parar,
                arboles: arboles, mecerArboles: mecerArboles,
                enderezarArboles: enderezarArboles }
  };
})();
