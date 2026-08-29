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

  var SYNC_MS   = 3 * 60 * 1000;   // cada cuánto se pregunta el tiempo
  var ENTRA_MS  = 5000;            // lo que tarda en arreciar / amainar

  var N_GOTAS    = 120;   // más gotas y más finas: se lee mejor como lluvia
  var N_SALPICA  = 14;

  // Por encima del mundo y por DEBAJO de la capa de noche (9000), igual que las
  // hojas del viento y los pájaros: si fuera por encima, de noche la lluvia se
  // vería iluminada sobre un mundo a oscuras.
  var PROF_LLUVIA   = 8100;
  var PROF_CORTINA  = 8050;
  var PROF_RAYO     = 8600;
  var PROF_FOGONAZO = 8650;

  var VEL_GOTA  = 900;             // px/s con la lluvia al máximo
  var INCLINA   = 0.34;            // cuánto cae de lado

  var TRUENO_CADA = [9000, 26000]; // ms entre relámpagos

  var estado = {
    activo: false, modo: 'auto',
    viento: false, vientoFuerza: 1,
    lluvia: false, lluviaFuerza: 1,
    truenos: true, cargado: false
  };
  var montado = null;
  var timerSync = null;
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
    estado.truenos      = !!d.truenos;
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
    return n;
  }

  function hayTexturas(scene) {
    for (var i = 0; i < GOTAS.length; i++) {
      if (!scene.textures.exists('gfc_' + GOTAS[i])) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ gotas
  function nuevaGota(st) {
    var cam = st.scene.cameras.main;
    var s = st.scene.add.image(0, 0, 'gfc_' + elegir(GOTAS));
    s.setScrollFactor(0);
    s.setDepth(PROF_LLUVIA);
    /* Escala moderada: a x2.6 sobre una textura de 18 px de alto salían
       rayas de casi 50 px que parecían arañazos en la pantalla, no lluvia. */
    s.setScale(az(0.9, 1.7));
    s.setAlpha(0);
    // Inclinadas: el agua no cae a plomo, y así acompaña al viento.
    s.setRotation(INCLINA);
    var g = { spr: s, vel: az(0.8, 1.35), x: 0, y: 0 };
    reponerGota(st, g, cam.width, cam.height, true);
    return g;
  }

  function reponerGota(st, g, w, h, dentro) {
    g.x = az(-h * INCLINA, w + 40);
    g.y = dentro ? az(-40, h) : az(-90, -10);
    g.spr.setPosition(g.x, g.y);
  }

  function moverGotas(st, dt, w, h) {
    for (var i = 0; i < st.gotas.length; i++) {
      var g = st.gotas[i];
      var v = VEL_GOTA * g.vel * st.fuerzaLluvia;
      g.y += v * dt;
      g.x += v * INCLINA * dt;
      g.spr.setPosition(g.x, g.y);
      // Translúcidas: el agua no es blanca opaca. A 0.8 tapaban el mundo.
      g.spr.setAlpha(st.fuerzaLluvia * 0.5);
      if (g.y > h + 20) {
        salpicar(st, g.x, h - az(0, h * 0.55));
        reponerGota(st, g, w, h, false);
      }
    }
  }

  // ----------------------------------------------------------- salpicaduras
  function nuevaSalpica(st) {
    var s = st.scene.add.image(0, 0, 'gfc_' + SALPICA[0]);
    s.setScrollFactor(0);
    s.setDepth(PROF_LLUVIA + 1);
    s.setScale(2);
    s.setAlpha(0);
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
  function relampago(st) {
    var scene = st.scene;
    var cam = scene.cameras.main;
    var ahora = scene.time.now;

    st.rayo.setTexture('gfc_' + elegir(RAYOS));
    st.rayo.setPosition(az(cam.width * 0.15, cam.width * 0.85),
                        az(-30, cam.height * 0.12));
    st.rayo.setScale(az(1.4, 2.6));
    st.rayo.setAlpha(1);
    st.rayoHasta = ahora + az(90, 190);

    st.fogonazo.setAlpha(0.72);
    st.fogonazoHasta = ahora + 130;

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
    // Corta y suave: sacudir mucho marea y estorba para jugar.
    try { cam.shake(320, 0.006 * st.fuerzaLluvia); } catch (e) {}
  }

  // ------------------------------------------------------------------ bucle
  function actualizar(st, ahora, delta) {
    var scene = st.scene;
    if (!scene || !scene.cameras || !scene.cameras.main) return;
    var cam = scene.cameras.main;
    var w = cam.width, h = cam.height;
    var dt = Math.min(delta, 100) / 1000;

    // La lluvia arrecia y amaina poco a poco: entrar de golpe canta.
    var quiere = (estado.activo && estado.lluvia) ? estado.lluviaFuerza : 0;
    var paso = delta / ENTRA_MS;
    if (st.fuerzaLluvia < quiere) st.fuerzaLluvia = Math.min(quiere, st.fuerzaLluvia + paso);
    else if (st.fuerzaLluvia > quiere) st.fuerzaLluvia = Math.max(quiere, st.fuerzaLluvia - paso);

    var lloviendo = st.fuerzaLluvia > 0.01;
    st.cortina.setAlpha(lloviendo ? st.fuerzaLluvia * 0.20 : 0);
    st.cortina.setPosition(w / 2, h / 2);
    st.cortina.setSize ? st.cortina.setSize(w, h) : null;

    if (!lloviendo) {
      for (var i = 0; i < st.gotas.length; i++) st.gotas[i].spr.setAlpha(0);
      for (var j = 0; j < st.salpicas.length; j++) st.salpicas[j].spr.setAlpha(0);
      st.rayo.setAlpha(0);
      st.fogonazo.setAlpha(0);
      return;
    }

    moverGotas(st, dt, w, h);
    moverSalpicas(st, ahora);

    // relámpagos
    if (estado.truenos) {
      if (!st.proximoTrueno) st.proximoTrueno = ahora + az(3000, 9000);
      if (ahora >= st.proximoTrueno) relampago(st);
    }
    if (st.rayoHasta && ahora >= st.rayoHasta) { st.rayo.setAlpha(0); st.rayoHasta = 0; }
    if (st.fogonazoHasta) {
      var q = st.fogonazoHasta - ahora;
      st.fogonazo.setAlpha(q > 0 ? Math.max(0, q / 130) * 0.72 : 0);
      st.fogonazo.setPosition(w / 2, h / 2);
      if (q <= 0) st.fogonazoHasta = 0;
    }
    if (st.truenoEn && ahora >= st.truenoEn) { sacudir(st); st.truenoEn = 0; }
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
    var st = {
      scene: scene, gotas: [], salpicas: [],
      fuerzaLluvia: 0, proximoTrueno: 0, truenoEn: 0,
      rayoHasta: 0, fogonazoHasta: 0
    };
    scene.__gfClima = st;
    montado = st;

    // Cortina gris de tormenta: apaga el mundo mientras llueve.
    st.cortina = scene.add.rectangle(cam.width / 2, cam.height / 2,
                                     cam.width, cam.height, 0x37475e, 0);
    st.cortina.setScrollFactor(0).setDepth(PROF_CORTINA);

    st.fogonazo = scene.add.rectangle(cam.width / 2, cam.height / 2,
                                      cam.width, cam.height, 0xdfe9ff, 0);
    st.fogonazo.setScrollFactor(0).setDepth(PROF_FOGONAZO);

    st.rayo = scene.add.image(0, 0, 'gfc_' + RAYOS[0]);
    st.rayo.setScrollFactor(0).setDepth(PROF_RAYO).setOrigin(0.5, 0).setAlpha(0);

    var i;
    for (i = 0; i < N_GOTAS; i++)   st.gotas.push(nuevaGota(st));
    for (i = 0; i < N_SALPICA; i++) st.salpicas.push(nuevaSalpica(st));

    st.onUpdate = function (t, d) { actualizar(st, t, d); };
    scene.events.on('update', st.onUpdate);
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);

    if (!opciones.sinRed) {
      sincronizar();
      if (!timerSync) timerSync = setInterval(sincronizar, SYNC_MS);
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
    if (st.cortina)  st.cortina.destroy();
    if (st.fogonazo) st.fogonazo.destroy();
    if (st.rayo)     st.rayo.destroy();
    st.gotas.length = 0; st.salpicas.length = 0;
    scene.__gfClima = null;
    if (montado === st) montado = null;
  }

  window.GFClima = {
    precargar: precargar,
    montar: montar,
    desmontar: desmontar,
    sincronizar: sincronizar,
    estado: function () { return estado; },
    /** Pinta un tiempo concreto SIN tocar el servidor. Solo para mirarlo. */
    probar: function (que) {
      estado.activo = true;
      estado.lluvia = (que === 'lluvia' || que === 'tormenta');
      estado.viento = (que === 'viento' || que === 'tormenta');
      estado.truenos = (que === 'tormenta');
      mandarAlViento();
      return estado;
    },
    _interno: {
      aplicar: aplicar, actualizar: actualizar, relampago: relampago,
      mandarAlViento: mandarAlViento, salpicar: salpicar, sacudir: sacudir
    }
  };
})();
