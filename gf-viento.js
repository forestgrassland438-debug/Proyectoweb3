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

  // El viento del mundo sopla siempre hacia el mismo lado: +1 = a la derecha.
  var DIRECCION = 1;

  var VEL_BASE = 190;           // px/s de la hoja con el viento al máximo
  var INCLINA  = 0.035;         // radianes que se mece un árbol

  /* EL LIENZO DE PANTALLA, Y POR QUÉ NO BASTA setScrollFactor(0).

     EL FALLO QUE ARREGLA: las hojas se colocaban en 0..cam.width con
     scrollFactor 0 y se daba por hecho que eso era la pantalla. No lo es.
     scrollFactor 0 libra del SCROLL, no del ZOOM: la cámara sigue dibujando

         pantalla = (p - centro) · zoom + centro

     Con el zoom a 0.5 ese rango se encogía a la mitad y las hojas quedaban
     apelotonadas en el cuadrado del medio, con los bordes de la pantalla
     vacíos. Justo lo que se veía al alejar la cámara.

     Se arregla metiéndolo todo en un contenedor con escala 1/zoom colocado de
     forma que su esquina caiga en (-MARGEN,-MARGEN) de la pantalla. Dentro se
     sigue trabajando en píxeles de pantalla y no hay que tocar nada más.

     El MARGEN es para que la sacudida del trueno no descubra el borde. */
  var MARGEN = 96;

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

  /* ══════════════════════════════════════════════════════════════════════
     POR QUÉ LAS HOJAS ERAN PREDECIBLES, Y QUÉ SE HA HECHO
     ──────────────────────────────────────────────────────────────────────
     Lo que había: cada hoja avanzaba a velocidad CONSTANTE hacia la derecha,
     subía y bajaba con UN seno y giraba a velocidad CONSTANTE. Tres reglas
     fijas. Con eso, en cuanto miras dos segundos ya sabes dónde va a estar
     cada hoja, y el efecto se cae: no parece que las lleve el aire, parece que
     las arrastra un raíl.

     Lo que se ha puesto, y cada cosa por qué:

     1. TURBULENCIA. El aire no empuja liso: hace remolinos. Se suman tres
        senos con periodos que no son múltiplos entre sí, cada hoja con sus
        propios ritmos y desfases. Tres senos así no repiten el mismo patrón a
        ojo NUNCA: es lo mismo que se hace para simular oleaje.

     2. INERCIA. La hoja ya no se coloca donde toca: tiene VELOCIDAD, y el
        viento la EMPUJA. Así una racha la acelera poco a poco y, cuando
        amaina, la hoja sigue un rato por su cuenta. Es la diferencia entre
        algo que flota y algo que va montado en una cinta.

     3. VOLTEO. Una hoja de verdad da vueltas de campana sobre su eje largo:
        se ve por delante, se pone de canto (desaparece) y se ve por detrás.
        Se consigue apretando la anchura hasta cero y devolviéndola — un coseno
        en scaleX. Es EL truco de las hojas, y es el que faltaba.

     4. MANERAS. No todas las hojas hacen lo mismo: una planea en eses largas,
        otra se pone a voltear como loca, otra se engancha en un remolino y
        gira sobre sí misma, y otra se queda casi quieta hasta que la pilla una
        racha. Y cada tantos segundos cambian de manera. Ver MANERAS.

     5. FONDO. Como con la lluvia: unas están cerca (grandes, rápidas, opacas)
        y otras lejos (pequeñas, lentas, transparentes).
     ══════════════════════════════════════════════════════════════════════ */

  /* Las cuatro maneras de volar. Los números son multiplicadores sobre el
     comportamiento base, así que se pueden tocar sin romper nada.
       arrastre  cuánto la lleva el viento (1 = lo normal)
       revuelo   cuánta turbulencia le entra
       vuelta    cuánto voltea sobre su eje
       giro      cuánto gira en el plano de la pantalla
       caida     cuánto pesa */
  var MANERAS = [
    { nombre: 'planea',   arrastre: 1.00, revuelo: 0.55, vuelta: 0.45, giro: 0.30, caida: 0.75, peso: 0.34 },
    { nombre: 'voltea',   arrastre: 1.15, revuelo: 1.10, vuelta: 2.40, giro: 1.60, caida: 1.00, peso: 0.28 },
    { nombre: 'remolino', arrastre: 0.70, revuelo: 1.90, vuelta: 1.30, giro: 3.20, caida: 0.55, peso: 0.22 },
    { nombre: 'rezagada', arrastre: 0.38, revuelo: 0.80, vuelta: 0.70, giro: 0.50, caida: 1.35, peso: 0.16 }
  ];
  // Cada cuánto se replantea una hoja lo que está haciendo.
  var CAMBIA_MANERA = [1800, 6500];

  /* Los tres planos de profundidad, como en la lluvia. */
  var PLANOS_HOJA = [
    { escala: [1.1, 1.5], vel: [0.55, 0.80], alfa: 0.45, peso: 0.30 },
    { escala: [1.6, 2.2], vel: [0.85, 1.15], alfa: 0.78, peso: 0.44 },
    { escala: [2.3, 3.1], vel: [1.15, 1.55], alfa: 1.00, peso: 0.26 }
  ];

  function porPeso(lista) {
    var r = Math.random(), acum = 0;
    for (var i = 0; i < lista.length; i++) {
      acum += lista[i].peso;
      if (r <= acum) return i;
    }
    return lista.length - 1;
  }

  // ------------------------------------------------------------------ hojas
  function nuevaHoja(st, dentro) {
    var L = lienzo(st.scene.cameras.main);
    var w = L.w, h = L.h;
    var s = st.scene.add.image(0, 0, 'gfv_' + elegir(HOJAS));
    // scrollFactor va en el HIJO aunque esté dentro del contenedor: Phaser lo
    // lee del hijo, no del padre, al montar la matriz de cámara.
    s.setScrollFactor(0);
    if (st.capa) st.capa.add(s);

    var n = porPeso(PLANOS_HOJA);
    var P = PLANOS_HOJA[n];
    var hoja = {
      spr: s, plano: n,
      tam: az(P.escala[0], P.escala[1]),
      alfaMax: P.alfa,
      vel: az(P.vel[0], P.vel[1]),

      /* TRES RITMOS QUE NO CUADRAN ENTRE SÍ. Si fueran múltiplos —0.8, 1.6,
         3.2— el patrón se repetiría cada pocos segundos y el ojo lo pillaría.
         Elegidos al azar en rangos que no se solapan, el ciclo conjunto dura
         minutos: en la práctica, nunca. */
      r1: az(0.45, 0.95), r2: az(1.30, 2.40), r3: az(3.10, 5.60),
      f1: az(0, 6.283), f2: az(0, 6.283), f3: az(0, 6.283),
      revuelo: az(14, 46),               // cuánto se la lleva la turbulencia

      // Velocidad propia: el viento la empuja, no la coloca. Ver INERCIA.
      vx: 0, vy: 0,
      inercia: az(1.6, 3.4),             // cuánto tarda en obedecer al viento

      volteo: az(0, 6.283),              // por dónde va la vuelta de campana
      volteoVel: az(2.2, 7.5),
      giro: az(-2.6, 2.6),

      manera: porPeso(MANERAS),
      cambiaEn: 0
    };
    s.setScale(hoja.tam);
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
    /* POR DÓNDE ENTRA.

       Antes entraban TODAS por el lado de barlovento, a la misma altura de
       reparto. Se veía una fila. Ahora una de cada cuatro cae DESDE ARRIBA,
       como si se acabara de soltar de un árbol, y las demás entran de lado a
       cualquier altura. Con eso el reparto deja de tener forma. */
    var deArriba = Math.random() < 0.25;
    if (dentro) {
      hoja.x = az(-40, w + 40);
      hoja.y = az(-30, h + 30);
    } else if (deArriba) {
      hoja.x = az(-60, w + 60);
      hoja.y = az(-90, -20);
    } else {
      hoja.x = st.dir > 0 ? az(-110, -20) : az(w + 20, w + 110);
      hoja.y = az(-60, h * 0.9);
    }
    // Nace ya con algo de velocidad: aparecer parada y arrancar se ve.
    hoja.vx = st.dir * VEL_BASE * hoja.vel * (st.fuerza || 0.3) * az(0.5, 1);
    hoja.vy = az(4, 22);
    hoja.manera = porPeso(MANERAS);
    hoja.cambiaEn = 0;
    hoja.spr.setPosition(hoja.x, hoja.y);
    hoja.spr.setAlpha(0);
  }

  function moverHojas(st, dt, w, h, ahora) {
    /* LA RACHA, aparte de la fuerza media. `st.fuerza` ya sube y baja despacio;
       esto es el golpe corto de viento que va por encima, con dos ritmos que
       tampoco cuadran entre sí. Es lo que hace que las hojas salgan disparadas
       de vez en cuando en vez de desfilar. */
    var racha = 1
      + 0.55 * Math.sin(ahora * 0.00081)
      + 0.30 * Math.sin(ahora * 0.00237 + 2.1);
    if (racha < 0.25) racha = 0.25;

    for (var i = 0; i < st.hojas.length; i++) {
      var j = st.hojas[i];

      // ¿Le toca cambiar de manera de volar?
      if (ahora >= j.cambiaEn) {
        j.manera = porPeso(MANERAS);
        j.cambiaEn = ahora + az(CAMBIA_MANERA[0], CAMBIA_MANERA[1]);
      }
      var M = MANERAS[j.manera];

      // ── turbulencia: tres senos que no repiten ──
      j.f1 += dt * j.r1; j.f2 += dt * j.r2; j.f3 += dt * j.r3;
      var tx = (Math.sin(j.f1) * 0.6 + Math.sin(j.f2) * 0.3 + Math.sin(j.f3) * 0.1);
      var ty = (Math.cos(j.f1 * 0.83) * 0.5 + Math.cos(j.f2 * 1.17) * 0.35 +
                Math.cos(j.f3 * 0.61) * 0.15);
      var revuelo = j.revuelo * M.revuelo * st.fuerza;

      // ── a dónde QUIERE llevarla el aire ──
      var metaX = st.dir * VEL_BASE * j.vel * M.arrastre * st.fuerza * racha
                  + tx * revuelo;
      var metaY = (14 * M.caida + ty * revuelo * 0.7) * st.fuerza
                  + 10 * M.caida;         // siempre pesa un poco, aunque no sople

      // ── inercia: se acerca a esa meta, no salta a ella ──
      var k = Math.min(1, dt * j.inercia);
      j.vx += (metaX - j.vx) * k;
      j.vy += (metaY - j.vy) * k;

      j.x += j.vx * dt;
      j.y += j.vy * dt;
      j.spr.setPosition(j.x, j.y);

      /* ── VOLTEO: la vuelta de campana ──
         scaleX pasa por CERO y se hace negativo: la hoja se pone de canto y
         luego enseña la otra cara. Se le deja un mínimo (0.12) porque una
         escala exactamente 0 hace que Phaser marque la matriz como degenerada
         y algunos navegadores parpadean. */
      j.volteo += dt * j.volteoVel * M.vuelta * (0.4 + 0.6 * st.fuerza);
      var cara = Math.cos(j.volteo);
      var anchura = cara < 0 ? Math.min(cara, -0.12) : Math.max(cara, 0.12);
      j.spr.setScale(j.tam * anchura, j.tam);

      // ── giro en el plano de la pantalla ──
      j.spr.rotation += j.giro * M.giro * st.fuerza * dt;

      /* La opacidad NO es plana: la hoja se ve menos cuando está de canto,
         igual que se ve menos de verdad. Un detalle de nada que remata el
         volteo — sin él, la hoja "de canto" sigue igual de sólida y se nota
         que es un truco de escala. */
      j.spr.setAlpha(st.fuerza * j.alfaMax * (0.55 + 0.45 * Math.abs(cara)));

      if (j.x < -140 || j.x > w + 140 || j.y > h + 80) reponer(st, j, false, w, h);
    }
  }

  // ---------------------------------------------------------------- ráfagas
  function nuevaRafaga(st) {
    var s = st.scene.add.image(0, 0, 'gfv_' + elegir(RAFAGAS));
    s.setScrollFactor(0);
    s.setScale(az(1.6, 3.2));
    s.setAlpha(0);
    // Después de las hojas: dentro de un contenedor manda el ORDEN, no depth.
    if (st.capa) st.capa.add(s);
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
  /** Los árboles y arbustos del mapa, con su rotación original guardada. */
  function arboles(scene) {
    var out = [];
    /* Los arbustos también se mecen: son las plantas que el jugador tiene
       DELANTE de la cara la mayor parte del tiempo, y verlos clavados mientras
       los árboles del fondo se mueven es lo que delata que el viento es un
       adorno. Se mecen más que un árbol —pesan menos— y eso se nota. */
    /* OJO CON EL NOMBRE: los arbustos llevan GUION BAJO antes del número
       (`sprite_arbustos_7`) y los árboles no (`sprite_pinos7`). Se pone en la
       tabla y no se adivina, porque adivinarlo es exactamente la clase de
       detalle que deja la mitad del bosque sin mecerse y nadie sabe por qué. */
    var fam = [['sprite_arbolx', 18, 1.0],
               ['sprite_pinos', 45, 0.85],
               ['sprite_arbustos_', 28, 1.9]];
    for (var f = 0; f < fam.length; f++) {
      for (var i = 1; i <= fam[f][1]; i++) {
        var spr = scene[fam[f][0] + i];
        if (!spr || spr.active === false || typeof spr.rotation !== 'number') continue;
        out.push({
          spr: spr, base: spr.rotation,
          fase: Math.random() * 6.28,
          // Cada planta con SU ritmo: si todas se mecieran a la vez, el bosque
          // entero respiraría como un solo bicho y se vería fatal.
          ritmo: az(0.75, 1.45),
          // Y con su peso: el que más pesa, menos se mueve y más tarde llega.
          peso: fam[f][2] * az(0.75, 1.3),
          fase2: Math.random() * 6.28
        });
      }
    }
    return out;
  }

  function mecerArboles(st, ahora) {
    /* Los sprites del mapa tienen origen (0,1) —la esquina de abajo a la
       izquierda—, así que rotar los inclina desde el PIE. Eso es exactamente lo
       que hace falta: el árbol se mece sin despegarse del suelo.

       LA RACHA VA APARTE DEL BALANCEO. Son dos cosas distintas y hasta ahora
       eran una: el balanceo es la planta oscilando en su sitio, cada una a lo
       suyo; la racha es el aire pasando, y esa SÍ empuja a todas hacia el mismo
       lado a la vez. Sumadas, el bosque se mueve como un bosque: cada árbol a
       su aire y, de vez en cuando, todos inclinados a la vez cuando pasa el
       golpe de viento. Con un solo seno por árbol eso no podía salir. */
    var racha = 0.55 + 0.45 * Math.sin(ahora * 0.00081);
    for (var i = 0; i < st.arboles.length; i++) {
      var a = st.arboles[i];
      if (!a.spr || a.spr.active === false) continue;
      var balanceo = Math.sin(ahora / 700 * a.ritmo + a.fase) * 0.62
                   + Math.sin(ahora / 1900 * a.ritmo + a.fase2) * 0.38;
      // El empuje siempre va hacia donde sopla: la planta no se dobla contra
      // el viento, y por eso la racha se SUMA con signo en vez de oscilar.
      var empuje = st.dir * racha * 0.55;
      a.spr.rotation = a.base + (balanceo + empuje) * INCLINA * a.peso * st.fuerza;
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
    /* SIEMPRE DE IZQUIERDA A DERECHA.

       Antes se sorteaba el lado en cada racha. Se veía mal: el mundo tiene un
       solo viento y verlo cambiar de sentido cada pocos minutos —arrastrando
       con él la lluvia y los árboles— parecía un fallo, no clima. En un pueblo
       el viento dominante es uno y no gira. Se deja en poniente, que es lo que
       pidió el jugador y además es lo natural de leer: el ojo sigue las hojas
       en el mismo sentido en que lee.

       La constante se queda como constante y no como número suelto por si algún
       día se quiere una veleta de verdad; lo que ya no hay es azar. */
    st.dir = DIRECCION;
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

  /**
   * El viento de fondo que trae la estación, aparte de las rachas.
   *
   * 0 = nada (primavera y verano: si sopla, es porque hay racha).
   * Se pregunta al clima, que es quien sabe en qué estación está el mundo; si
   * el módulo no está, no hay fondo y todo sigue como antes.
   */
  function fondoDeEstacion() {
    var e = null;
    try { if (window.GFClima && window.GFClima.estado) e = window.GFClima.estado(); } catch (x) {}
    if (!e) return 0;
    if (e.estacion === 'otono') return 0.30;
    // En invierno solo si no está nevando: la nieve ya llena el aire.
    if (e.estacion === 'invierno' && !(e.activo && e.nieve)) return 0.16;
    return 0;
  }

  function actualizar(st, ahora, delta) {
    var scene = st.scene;
    if (!scene || !scene.cameras || !scene.cameras.main) return;
    var dt = Math.min(delta, 100) / 1000;
    var cam = scene.cameras.main;
    // Se recoloca cada frame: el zoom puede cambiar en cualquier momento y la
    // ventana también.
    var L = lienzo(cam);
    var w = L.w, h = L.h;
    if (st.capa) { st.capa.setPosition(L.x, L.y); st.capa.setScale(L.escala); }

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
    }

    /* ══════════════════════════════════════════════════════════════════
       EL OTOÑO SIEMPRE TIENE HOJAS EN EL AIRE
       ──────────────────────────────────────────────────────────────────
       En otoño las hojas caen porque están muertas, no porque sople. Hasta
       ahora, entre racha y racha —que son nueve a veintidós minutos— el
       otoño se veía EXACTAMENTE igual que el verano salvo por el tinte
       ámbar, y eso es lo que hacía que la estación no se notara.

       Así que en otoño hay un suelo de viento permanente y flojito: lo justo
       para que caigan cuatro hojas y los árboles respiren. Las rachas siguen
       llegando encima, igual que siempre, y se notan igual porque son mucho
       más fuertes que esto.

       En invierno también, pero menos y solo si NO está nevando: la nieve ya
       llena el aire ella sola y sumarle hojas es ruido.
       ══════════════════════════════════════════════════════════════════ */
    var suelo = fondoDeEstacion();
    if (!st.soplando) {
      if (suelo <= 0) {
        /* Se acabó el otoño (o ha empezado a nevar) y ya no hay fondo. Hay que
           DEVOLVER a los árboles su rotación: si no, se quedarían torcidos
           para siempre en el ángulo del último fotograma, porque nadie más los
           va a tocar hasta la próxima racha. Solo se hace una vez, no en cada
           fotograma. */
        if (st.fuerza > 0) {
          st.fuerza = 0;
          enderezarArboles(st);
          for (var q = 0; q < st.hojas.length; q++) st.hojas[q].spr.setAlpha(0);
        }
        return;
      }
      // Sin racha pero con otoño: se mece flojito y caen hojas.
      st.fuerza = suelo;
      if (!st.arboles.length) st.arboles = arboles(st.scene);
      moverHojas(st, dt, w, h, ahora);
      mecerArboles(st, ahora);
      return;
    }

    // Arrecia y amaina poco a poco: entrar de golpe se nota falso.
    var t = ahora - st.empiezaEn;
    var queda = st.acabaEn - ahora;
    var f = 1;
    if (t < ENTRA_MS) f = t / ENTRA_MS;
    if (queda < ENTRA_MS) f = Math.min(f, Math.max(0, queda / ENTRA_MS));
    // Rachas: la fuerza no es plana, va y viene.
    st.fuerza = Math.max(0, f * (0.72 + 0.28 * Math.sin(ahora / 2300)) *
                            (st.mandado !== null ? st.fuerzaMandada : 1));
    // Y nunca por debajo del suelo de la estación: al amainar una racha en
    // otoño, las hojas no se paran en seco, se quedan cayendo despacio.
    if (st.fuerza < suelo) st.fuerza = suelo;

    moverHojas(st, dt, w, h, ahora);
    moverRafagas(st, dt, w, h);
    mecerArboles(st, ahora);

    if (ahora >= st.acabaEn) parar(st);
  }

  // ---------------------------------------------------------------- montaje
  /* LA ORDEN DEL SERVIDOR VIVE FUERA DE LA ESCENA.

     EL FALLO QUE ARREGLA — "desde climas.html pongo viento a mano y en el
     juego no pasa nada, pero el automatico si se ve":

     `mandado` vivia dentro del estado de la ESCENA. Cada vez que se entra a la
     tienda y se vuelve al mapa, esa escena se apaga, `desmontar()` tira el
     estado y `montar()` crea uno nuevo con `mandado: null` — o sea, "nadie
     manda, sorteo local". La orden del servidor se perdia ahi.

     Con el clima AUTOMATICO no se notaba: el servidor cambia de tiempo cada
     pocos minutos por su cuenta y el siguiente aviso volvia a mandar. Con el
     clima MANUAL el servidor avisa UNA vez, cuando el administrador guarda; si
     ese aviso se pierde no vuelve nunca, y el jugador ve el sorteo local (las
     rachas cada 9-22 minutos) y cree que "solo funciona el automatico".

     Ahora la orden se guarda aqui, en el modulo, que sobrevive a los cambios
     de escena, y `montar()` la aplica nada mas nacer. */
  var orden = { mandado: null, fuerza: 1 };

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
      // Se hereda la ultima orden del servidor: ver `orden` mas arriba.
      mandado: orden.mandado, fuerzaMandada: orden.fuerza,
      soplando: false, fuerza: 0, dir: DIRECCION,
      empiezaEn: 0, acabaEn: 0,
      proximaEn: scene.time.now + (opciones.primeraEn != null
                                   ? opciones.primeraEn
                                   : az(ESPERA[0] * 0.3, ESPERA[1]))
    };
    scene.__gfViento = st;
    montado = st;

    /* Un solo contenedor para hojas y ráfagas: una transformación por frame en
       vez de treinta. Dentro manda el orden de inserción, no el depth. */
    if (scene.add.container) {
      st.capa = scene.add.container(0, 0);
      st.capa.setScrollFactor(0);
      st.capa.setDepth(PROF_HOJAS);
    }

    var i;
    for (i = 0; i < N_HOJAS; i++)   st.hojas.push(nuevaHoja(st, true));
    for (i = 0; i < N_RAFAGAS; i++) st.rafagas.push(nuevaRafaga(st));
    var L0 = lienzo(scene.cameras.main);
    for (i = 0; i < st.rafagas.length; i++) {
      st.rafagas[i].x = az(-200, L0.w);
      st.rafagas[i].y = az(20, L0.h - 20);
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
    if (st.capa && st.capa.destroy) st.capa.destroy();
    st.capa = null;
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
      /* Se apunta SIEMPRE, aunque no haya escena montada todavia: el clima
         puede llegar antes de que el mapa termine de crearse, y perder ese
         primer aviso es justo lo que hacia que el clima manual no arrancara.
         `montar()` lee esto al nacer. */
      orden.mandado = !!activo;
      orden.fuerza  = Math.max(0.2, Math.min(2, Number(fuerza) || 1));
      var e = escenaViva();
      if (!e || !e.__gfViento) return false;      // apuntado, pero aun sin pintar
      var st = e.__gfViento;
      st.mandado = orden.mandado;
      st.fuerzaMandada = orden.fuerza;
      return true;
    },
    /** Devuelve el mando al sorteo local. */
    soltar: function () {
      orden.mandado = null;
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
    /* Dirección y fuerza AHORA, sin crear objetos.
       Lo pide la lluvia en cada frame para inclinarse con el viento; estado()
       fabrica un objeto nuevo cada vez y a 60 fps eso es basura para nada. */
    vector: function (fuera) {
      var st = (montado && montado.scene && montado.scene.__gfViento)
               ? montado.scene.__gfViento : null;
      fuera = fuera || {};
      fuera.dir = st ? st.dir : 1;
      fuera.fuerza = st ? st.fuerza : 0;
      return fuera;
    },
    estado: function () {
      var e = escenaViva();
      if (!e || !e.__gfViento) return null;
      var st = e.__gfViento;
      return { soplando: st.soplando, fuerza: Math.round(st.fuerza * 100) / 100,
               direccion: st.dir, hojas: st.hojas.length,
               arboles: st.arboles.length,
               // null = sorteo local; true/false = lo manda el servidor.
               mandado: st.mandado, fuerzaMandada: st.fuerzaMandada,
               ordenGuardada: orden.mandado };
    },
    _interno: { actualizar: actualizar, soplarEn: soplar, pararEn: parar,
                lienzo: lienzo, MARGEN: MARGEN,
                arboles: arboles, mecerArboles: mecerArboles,
                enderezarArboles: enderezarArboles,
                moverHojas: moverHojas, reponer: reponer, nuevaHoja: nuevaHoja,
                fondoDeEstacion: fondoDeEstacion,
                MANERAS: MANERAS, PLANOS_HOJA: PLANOS_HOJA }
  };
})();
