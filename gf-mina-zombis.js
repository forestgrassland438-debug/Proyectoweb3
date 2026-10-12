/* ===========================================================================
 * LOS ZOMBIS DE LA MINA Y SU GUARDIÁN                              (2026-10-10)
 *
 * Lo que pidió el jugador: "respetando los gráficos de los personajes, haz
 * zombis de los personajes en las minas que puedan matarte; que paseen; y
 * hasta 1 jefe que vigile, que brinque y que el mapa se mueva. Tú agrégale
 * cosas extraordinarias."
 *
 * LOS ZOMBIS
 *   Son los personajes del juego (las carpetas de Soulbound), PODRIDOS: desde
 *   2026-10-11 son PNG (Game/Sprites/monstruos/zombi_*.png, los escribe
 *   tools/generar-monstruos.py) y ya no se repintan aquí en un lienzo —la
 *   piel verde ceniza, la ropa apagada, los ojos amarillos—, así que tienen
 *   el mismo dibujo, el mismo tamaño y las mismas cuatro direcciones que un
 *   jugador. Pasean despacio cerca de su sitio; si te ven, te persiguen
 *   arrastrando los pies (más lentos que tú: se puede huir) y muerden. En la
 *   oscuridad se les ven los OJOS ROJOS (una luz en el mapa de luz de la
 *   cueva, ver MinaScene._lucesExtra).
 *
 * EL GUARDIÁN (el jefe)
 *   Un zombi enorme, morado, que VIGILA su guarida: patrulla alrededor y, si
 *   entras, despierta con un rugido. Te persigue y cada pocos segundos se
 *   AGACHA, SALTA hacia ti y al caer TIEMBLA LA CUEVA: onda expansiva, y del
 *   techo caen piedras (con su sombra de aviso) donde estás. A media vida se
 *   ENFURECE: se pone rojo, va más deprisa y llama a dos zombis. Barra de
 *   vida arriba mientras pelea. Al morir, estallido de luz y experiencia de
 *   fuerza. Vuelve a los 10 minutos.
 *
 * EL DAÑO
 *   Lo pone el SERVIDOR, como el mordisco de los animales: aquí solo se dice
 *   "me ha mordido un zombi" (`zombi_mina`) o "me ha golpeado el guardián"
 *   (`jefe_mina`) a /api/stats/:p/consume. Muerto (modo fantasma), no te ven.
 *
 * LA ESPADA
 *   Se engancha a gf-espada.js (GFEspada.agregarObjetivo): el tajo que da a
 *   los animales del pueblo da también a los zombis aquí abajo.
 *
 * LOS MISMOS PARA TODOS (2026-10-11, gf-mobs-red.js)
 *   "Los enemigos en la mina deben salirle a los demás en la misma ubicación
 *   que a mí." Los sitios salen de una semilla fija (los mismos en todos los
 *   navegadores) y UNO de la sala, el anfitrión, piensa por ellos: persiguen
 *   al jugador más cercano, sea quien sea, y los demás los ven donde él dice.
 *   Los mordiscos los mira cada uno (un zombi que caza pegado a MI jugador me
 *   muerde a mí); el salto del guardián y su furia se anuncian a todos, y las
 *   piedras caen sobre quien esté cerca. El daño lo sigue poniendo el
 *   servidor. Muerto (fantasma), no te ven ni te muerden.
 *
 * RENDIMIENTO Y FUGAS
 *   Lejos (más de 1.000 px) un zombi no piensa ni se dibuja. Los atlas se
 *   cargan UNA vez por partida (gf-monstruos-arte.js) y se reutilizan. Al apagar la escena se quita todo: oyentes, la
 *   barra del jefe (DOM) y el objetivo de la espada.
 *
 * CÓMO SE ENGANCHA
 *   MinaScene, al terminar de construir:  GFMinaZombis.montar(this)
 * ======================================================================== */
(function () {
  'use strict';

  // Cuatro caras distintas y el jefe (atlas de gf-monstruos-arte.js).
  var PERSONAJES = ['zombi_a', 'zombi_b', 'zombi_c', 'zombi_d'];
  var PERSONAJE_JEFE = 'zombi_jefe';
  var DIR_ES = { right: 'derecha', left: 'izquierda', up: 'arriba', down: 'abajo' };
  var N_ZOMBIS = 12;
  var VIDA_ZOMBI = 60, VIDA_JEFE = 720;
  var VEL_PASEO = 36, VEL_CAZA = 76, VEL_JEFE = 64;
  var VISTA = 290, OLVIDA = 560;
  var VISTA_JEFE = 400, GUARDIA = 320;
  var ESCALA = 2, ESCALA_JEFE = 3.4;
  var MORDISCO_MS = 1150, ALCANCE_MORDISCO = 38;
  var VUELVE_ZOMBI_MS = 75 * 1000, VUELVE_JEFE_MS = 10 * 60 * 1000;
  var LEJOS = 1000;

  function log() {
    if (!window.GF_ZOMBIS_DEBUG) return;
    var a = Array.prototype.slice.call(arguments); a.unshift('[zombis]');
    console.log.apply(console, a);
  }
  function aviso(scene, texto, tipo) {
    try { if (scene.notifications && scene.notifications.show) scene.notifications.show(texto, tipo || 'info'); } catch (e) {}
  }
  function azar(s) {
    s = s >>> 0;
    return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }

  // ─────────────────────────────────────────────────────── LAS TEXTURAS
  /* Los cuerpos son PNG (gf-monstruos-arte.js). Aquí solo quedan la sombra,
     la onda y el polvo: luz y aire, no monstruos. */
  function texturasSueltas(scene) {
    if (!scene.textures.exists('gfz_sombra')) {
      var s = scene.textures.createCanvas('gfz_sombra', 48, 16);
      var x = s.getContext();
      x.save(); x.scale(1, 16 / 48);
      var g = x.createRadialGradient(24, 24, 1, 24, 24, 24);
      g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(0.7, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.beginPath(); x.arc(24, 24, 24, 0, Math.PI * 2); x.fill(); x.restore();
      s.refresh();
    }
    if (!scene.textures.exists('gfz_onda')) {
      // Un anillo liso (UNO): la onda del salto del guardián.
      var o = scene.textures.createCanvas('gfz_onda', 128, 128);
      var y = o.getContext();
      var g2 = y.createRadialGradient(64, 64, 40, 64, 64, 64);
      g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(0.7, 'rgba(230,210,255,0.55)'); g2.addColorStop(1, 'rgba(230,210,255,0)');
      y.fillStyle = g2; y.fillRect(0, 0, 128, 128);
      o.refresh();
    }
    if (!scene.textures.exists('gfz_polvo')) {
      // Una nube de polvo blanda (una sola mancha, sin grumos).
      var p = scene.textures.createCanvas('gfz_polvo', 64, 64);
      var z = p.getContext();
      var g3 = z.createRadialGradient(32, 32, 2, 32, 32, 32);
      g3.addColorStop(0, 'rgba(150,140,130,0.55)'); g3.addColorStop(1, 'rgba(150,140,130,0)');
      z.fillStyle = g3; z.fillRect(0, 0, 64, 64);
      p.refresh();
    }
  }

  // ─────────────────────────────────────────────────────── EL MAPA
  function pies(z) { return z.y + z.alto * 0.5; }

  function libre(scene, x, y, jefe) {
    if (typeof scene._chocaConEscenario !== 'function') return true;
    var w = jefe ? 52 : 28, hh = jefe ? 18 : 13;
    var py = y + (jefe ? 70 : 38);
    return !scene._chocaConEscenario(x - w / 2, py, w, hh);
  }

  /** Los sitios de salida de los zombis y la guarida del guardián. */
  function elegirSitios(scene) {
    var W = scene.map.widthInPixels, H = scene.map.heightInPixels;
    var entrada = scene._puntoDeAparicion ? scene._puntoDeAparicion() : { x: W / 2, y: 300 };
    var r = azar(20261010);
    var cand = [];
    for (var i = 0; i < 5000 && cand.length < 600; i++) {
      var x = 96 + r() * (W - 192), y = 96 + r() * (H - 192);
      if (Math.hypot(x - entrada.x, y - entrada.y) < 700) continue;
      if (!libre(scene, x, y, false)) continue;
      cand.push({ x: x, y: y });
    }
    // La guarida: un sitio amplio (libre en un círculo) y lejos de la entrada.
    var guarida = null, mejor = -1;
    cand.forEach(function (c) {
      var d = Math.hypot(c.x - entrada.x, c.y - entrada.y);
      if (d < mejor) return;
      for (var k = 0; k < 8; k++) {
        var a = k / 8 * Math.PI * 2;
        if (!libre(scene, c.x + Math.cos(a) * 140, c.y + Math.sin(a) * 110, true)) return;
      }
      mejor = d; guarida = c;
    });
    var zombis = [];
    for (var j = 0; j < cand.length && zombis.length < N_ZOMBIS; j++) {
      var c2 = cand[j];
      if (guarida && Math.hypot(c2.x - guarida.x, c2.y - guarida.y) < 500) continue;
      if (zombis.some(function (z) { return Math.hypot(z.x - c2.x, z.y - c2.y) < 380; })) continue;
      zombis.push(c2);
    }
    return { entrada: entrada, guarida: guarida, zombis: zombis };
  }

  // ─────────────────────────────────────────────────────── LOS BICHOS
  function crearBicho(st, sitio, per, jefe, id) {
    var scene = st.scene;
    var A = window.GFMonstruosArte;
    var esc = jefe ? ESCALA_JEFE : ESCALA;
    if (!A || !scene.textures.exists(A.clave(per))) return null;
    var spr = scene.add.sprite(sitio.x, sitio.y, A.clave(per), 'abajo_1').setScale(esc);
    // `y` es el centro del CUERPO, como el del jugador (el cuadro del atlas
    // es más alto: sitio para la cola y el báculo de otros monstruos).
    A.origenHumanoide(spr);
    var sombra = scene.add.image(sitio.x, sitio.y, 'gfz_sombra').setScale(jefe ? 2.2 : 1.1).setAlpha(0.8);
    var z = {
      id: id, spr: spr, sombra: sombra, per: per, jefe: jefe, casa: { x: sitio.x, y: sitio.y },
      x: sitio.x, y: sitio.y, alto: A.ALTO_CUERPO * esc, vida: jefe ? VIDA_JEFE : VIDA_ZOMBI,
      max: jefe ? VIDA_JEFE : VIDA_ZOMBI, estado: jefe ? 'guarda' : 'pasea', destino: null,
      ideaEn: 0, mordioEn: 0, dir: 'down', anim: null, andando: false, barra: null, heridoEn: 0,
      muertoHasta: 0, vivo: true, saltoEn: 0, furia: false, rugio: false, fase: Math.random() * 6,
      objX: sitio.x, objY: sitio.y
    };
    spr.setData('optimized', true);
    jugarAnim(z, 'down', false);
    return z;
  }

  function jugarAnim(z, dir, andando) {
    z.andando = !!andando;
    var k = window.GFMonstruosArte.anim(z.per, dir);
    if (!andando) {
      if (z.anim) { z.spr.anims.stop(); z.anim = null; }
      var f = DIR_ES[dir] + '_1';
      if (z.spr.frame && z.spr.frame.name !== f) z.spr.setFrame(f);
      return;
    }
    if (z.anim !== k && z.spr.scene.anims.exists(k)) { z.spr.play(k, true); z.anim = k; }
  }

  function mover(st, z, vx, vy, seg) {
    var scene = st.scene;
    var nx = z.x + vx * seg, ny = z.y + vy * seg;
    var movido = false;
    if (libre(scene, nx, z.y, z.jefe)) { z.x = nx; movido = true; }
    if (libre(scene, z.x, ny, z.jefe)) { z.y = ny; movido = true; }
    if (Math.abs(vx) > 1 || Math.abs(vy) > 1) {
      z.dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up');
    }
    jugarAnim(z, z.dir, movido && (Math.abs(vx) + Math.abs(vy) > 1));
    return movido;
  }

  /* Hacia (tx, ty) por un CAMINO (gf-rutas.js) y no en línea recta: con una
     pared en medio, el zombi la rodea en vez de quedarse pegado. La ruta se
     pide como mucho cada 700 ms; de cerca se va derecho. */
  function haciaConRuta(st, z, tx, ty, vel, seg) {
    var ahora = st.scene.time.now;
    var dDirecto = Math.hypot(tx - z.x, ty - z.y);
    var obj = { x: tx, y: ty };
    if (dDirecto > 60 && window.GFRutas) {
      if (!(ahora <= z.rutaEn)) {          // (sin rutaEn todavía, también)
        z.rutaEn = ahora + 700;
        z.ruta = window.GFRutas.siguiente(st.scene, { x: z.x, y: z.y }, { x: tx, y: ty }, {
          clave: z.jefe ? 'jefe' : 'zombi',
          libre: function (x, y) { return libre(st.scene, x, y, z.jefe); }
        });
      }
      if (z.ruta) {
        if (Math.hypot(z.ruta.x - z.x, z.ruta.y - z.y) <= 8) z.rutaEn = 0;   // llegó: el siguiente
        else obj = z.ruta;
      }
    }
    var ddx = obj.x - z.x, ddy = obj.y - z.y, d = Math.hypot(ddx, ddy) || 1;
    var x0 = z.x, y0 = z.y;
    var ok = mover(st, z, ddx / d * vel, ddy / d * vel, seg);
    // Atascado (no avanzó nada): ruta nueva en el siguiente fotograma.
    if (Math.abs(z.x - x0) + Math.abs(z.y - y0) < 0.01 && z.ruta) { z.rutaEn = Math.min(z.rutaEn, st.scene.time.now + 250); z.ruta = null; }
    return ok;
  }

  function colocar(z) {
    // El tambaleo del zombi: un leve vaivén al andar.
    var vaiven = z.anim ? Math.sin(z.spr.scene.time.now / (z.jefe ? 260 : 190) + z.fase) * (z.jefe ? 0.04 : 0.07) : 0;
    z.spr.setPosition(z.x, z.y).setRotation(vaiven);
    var py = pies(z);
    z.spr.setDepth(py);
    z.sombra.setPosition(z.x, py - 2).setDepth(py - 1);
  }

  function pintarBarra(st, z) {
    var scene = st.scene;
    if (z.jefe) return;                         // el del jefe es la barra de arriba
    var reciente = scene.time.now - z.heridoEn < 3000 && z.vivo;
    if (!reciente) { if (z.barra) z.barra.setVisible(false); return; }
    if (!z.barra) z.barra = scene.add.graphics();
    var g = z.barra.clear().setVisible(true);
    var w = 36, x = z.x - w / 2, y = z.y - z.alto * 0.5 - 10;
    g.fillStyle(0x000000, 0.65).fillRect(x - 1, y - 1, w + 2, 6);
    g.fillStyle(0x9be36b, 1).fillRect(x, y, w * Math.max(0, z.vida / z.max), 4);
    g.setDepth(pies(z) + 2);
  }

  // ─────────────────────────────────────────────────────── EL DAÑO AL JUGADOR
  function golpearAlJugador(st, motivo) {
    var scene = st.scene;
    var nombre = scene.playerName;
    if (!nombre || !window.GFMascota || !window.GFMascota.api || fantasma()) return;
    var ahora = Date.now();
    if (ahora - st.ultimoGolpe < 850) return;   // el mismo freno que el servidor
    st.ultimoGolpe = ahora;
    window.GFMascota.api('/api/stats/' + encodeURIComponent(nombre) + '/consume', { reason: motivo })
      .then(function (r) {
        if (!r || !r.ok || !r.datos || !st.vivo) return;
        var s = r.datos.stats;
        if (!s || typeof s.vida !== 'number') return;
        try {
          if (typeof scene._adoptarVitalesDelServidor === 'function') scene._adoptarVitalesDelServidor(s);
          else if (window.playerStats) window.playerStats.vida = s.vida;
        } catch (e) {}
        try { if (window.GFMascota.parpadearDano) window.GFMascota.parpadearDano(scene); } catch (e) {}
        if (s.vida <= 0 && window.GFMascota.declararMuerte) window.GFMascota.declararMuerte();
      }).catch(function () {});
  }

  /* ¿Mi jugador está muerto (fantasma o con la vida a 0)? Entonces no le ven
     ni le muerden (2026-10-11: "me golpean estando en fantasma"). */
  function fantasma() {
    try {
      if (window.GFMuerte && window.GFMuerte.muerto) return !!window.GFMuerte.muerto();
      var e = window.GFMascota && window.GFMascota.estado && window.GFMascota.estado(); return !!(e && e.ghost);
    } catch (e2) { return false; }
  }

  /**
   * LOS MORDISCOS LOS MIRA CADA UNO (2026-10-11). El anfitrión solo los lleva
   * hasta alguien; si un zombi que caza está pegado a MI jugador, me muerde a
   * mí, lo haya traído quien lo haya traído. Así un mordisco nunca se pierde
   * por la red ni se lo lleva el que no estaba.
   */
  function mordiscos(st) {
    var scene = st.scene, p = scene.player;
    if (!p || !p.active || fantasma()) return;
    var ahora = scene.time.now, px = p.x, py = p.y + 45;
    for (var i = 0; i < st.bichos.length; i++) {
      var z = st.bichos[i];
      if (!z.vivo || z.estado !== 'caza') continue;
      var alcance = z.jefe ? ALCANCE_MORDISCO + 34 : ALCANCE_MORDISCO;
      if (Math.hypot(px - z.x, py - pies(z)) > alcance) continue;
      var cada = z.jefe ? MORDISCO_MS * 1.3 : MORDISCO_MS;
      if (ahora - z.mordioEn < cada) continue;
      z.mordioEn = ahora;
      // Que mire hacia mí mientras muerde.
      var dx = px - z.x, dy = py - pies(z);
      z.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      golpearAlJugador(st, z.jefe ? 'jefe_mina' : 'zombi_mina');
    }
  }

  // ─────────────────────────────────────────────────────── EL GUARDIÁN
  function barraJefe(st, mostrar) {
    var el = st.barraJefe;
    if (!el) {
      el = st.barraJefe = document.createElement('div');
      el.id = 'gf-jefe-mina';
      el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:50%;top:74px;transform:translateX(-50%);z-index:9000;' +
        'width:min(280px,calc(100vw - 300px));min-width:150px;pointer-events:none;font:700 12px/1.2 inherit;color:#f3e3ff;' +
        'text-align:center;text-shadow:0 1px 2px #000;display:none';
      el.innerHTML = '<div class="gfj-nombre">💀 The Mine Warden</div>' +
        '<div style="margin-top:4px;height:10px;border-radius:6px;background:rgba(10,4,20,.75);border:1px solid #b78cff;overflow:hidden">' +
        '<div class="gfj-vida" style="height:100%;width:100%;background:linear-gradient(90deg,#7b3cff,#d36bff);transition:width .15s"></div></div>';
      document.body.appendChild(el);
    }
    el.style.display = mostrar ? 'block' : 'none';
    return el;
  }

  function onda(st, x, y) {
    var scene = st.scene;
    var o = scene.add.image(x, y, 'gfz_onda').setDepth(y + 1).setScale(0.4).setAlpha(0.95);
    if (o.setBlendMode) o.setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: o, scale: 3.2, alpha: 0, duration: 520, ease: 'Quad.easeOut', onComplete: function () { o.destroy(); } });
    var p = scene.add.image(x, y - 6, 'gfz_polvo').setDepth(y + 2).setScale(1.2).setAlpha(0.9);
    scene.tweens.add({ targets: p, scale: 3.4, alpha: 0, y: y - 30, duration: 900, ease: 'Sine.easeOut', onComplete: function () { p.destroy(); } });
  }

  function cercaDeMi(st, x, y, r) {
    var p = st.scene.player;
    return !!(p && Math.hypot(p.x - x, p.y + 45 - y) < (r || 700));
  }

  /** Del techo caen piedras sobre MI jugador: primero la sombra, luego la piedra. */
  function lluviaDePiedras(st, cuantas) {
    var scene = st.scene, p = scene.player;
    if (!p || !scene.textures.exists('piezas_mina')) return;
    var piesJ = p.y + 45;
    for (var i = 0; i < cuantas; i++) {
      (function (k) {
        var x = p.x + (Math.random() - 0.5) * 220, y = piesJ + (Math.random() - 0.5) * 140;
        if (!libre(scene, x, y - 38, false)) return;
        var aviso2 = scene.add.image(x, y, 'gfz_sombra').setDepth(y - 1).setScale(0.3).setAlpha(0.2);
        scene.tweens.add({ targets: aviso2, scale: 1.1, alpha: 0.75, duration: 650 + k * 120, onComplete: function () {
          if (!st.vivo) { aviso2.destroy(); return; }
          var roca = scene.add.image(x, y - 420, 'piezas_mina', 'pena_pequena').setOrigin(0.5, 1).setScale(0.8).setDepth(y);
          scene.tweens.add({ targets: roca, y: y, duration: 320, ease: 'Quad.easeIn', onComplete: function () {
            aviso2.destroy();
            onda(st, x, y);
            try { scene.cameras.main.shake(120, 0.004); } catch (e) {}
            var pj = scene.player;
            if (pj && Math.hypot(pj.x - x, pj.y + 45 - y) < 46 && !fantasma()) golpearAlJugador(st, 'zombi_mina');
            scene.tweens.add({ targets: roca, alpha: 0, delay: 900, duration: 400, onComplete: function () { roca.destroy(); } });
          } });
        } });
      })(i);
    }
  }

  /** Despierta: lo dice y tiembla (si está cerca de mí). */
  function despertar(st, z) {
    var scene = st.scene;
    z.estado = 'caza';
    if (!z.rugio) {
      z.rugio = true;
      if (cercaDeMi(st, z.x, pies(z), 1000)) {
        aviso(scene, '💀 The Mine Warden awakens!', 'warning');
        try { scene.cameras.main.shake(600, 0.008); } catch (e) {}
      }
    }
    if (cercaDeMi(st, z.x, pies(z), 1100)) barraJefe(st, true);
  }

  /** Anfitrión: el guardián piensa con el jugador más cercano de su guarida. */
  function pensarJefe(st, z, seg, b) {
    var scene = st.scene;
    var ahora = scene.time.now;
    var vel = VEL_JEFE * (z.furia ? 1.35 : 1);
    var lejosDeCasa = Math.hypot(z.x - z.casa.x, z.y - z.casa.y);
    var enGuarida = b && Math.hypot(b.x - z.casa.x, (b.y - 45) - z.casa.y) < GUARDIA + 120;
    var dist = b ? b.d : Infinity;

    if (z.estado === 'agacha' || z.estado === 'salta') return;   // los mueve su tween

    if (z.estado === 'guarda') {
      if (b && dist < VISTA_JEFE && enGuarida) {
        z.saltoEn = ahora + 1800;
        despertar(st, z);
        if (st.red) st.red.evento({ e: 'despierta', id: z.id });
        return;
      }
      // Patrulla: de un punto a otro alrededor de la guarida.
      if (!z.destino || ahora > z.ideaEn || Math.hypot(z.destino.x - z.x, z.destino.y - z.y) < 8) {
        var a = Math.random() * Math.PI * 2, r = Math.random() * GUARDIA * 0.7;
        z.destino = { x: z.casa.x + Math.cos(a) * r, y: z.casa.y + Math.sin(a) * r * 0.7 };
        z.ideaEn = ahora + 4000 + Math.random() * 3000;
      }
      var ddx = z.destino.x - z.x, ddy = z.destino.y - z.y, dd = Math.hypot(ddx, ddy) || 1;
      if (!mover(st, z, ddx / dd * vel * 0.5, ddy / dd * vel * 0.5, seg)) z.destino = null;
      return;
    }

    // Persiguiendo. Si se van lejos de su guarida, vuelve a ella.
    if (!b || lejosDeCasa > GUARDIA * 2.4 || (!enGuarida && dist > VISTA_JEFE * 1.6)) {
      z.estado = 'guarda';
      z.destino = { x: z.casa.x, y: z.casa.y };
      barraJefe(st, false);
      return;
    }
    if (ahora > z.saltoEn && dist < 520) {
      var hasta = destinoDelSalto(st, z, b);
      saltar(st, z, hasta);
      if (st.red) st.red.evento({ e: 'salta', id: z.id, x: Math.round(hasta.x), y: Math.round(hasta.y) });
      return;
    }
    if (dist < ALCANCE_MORDISCO + 34) { jugarAnim(z, z.dir, false); return; }   // muerde (mordiscos)
    haciaConRuta(st, z, b.x, b.y - z.alto * 0.5, vel, seg);
  }

  /** A dónde salta (hacia el blanco), sin caer dentro de una pared. */
  function destinoDelSalto(st, z, b) {
    var scene = st.scene;
    var desde = { x: z.x, y: z.y };
    var hasta = { x: b.x, y: b.y - z.alto * 0.5 };
    for (var k = 0; k < 6 && !libre(scene, hasta.x, hasta.y, true); k++) {
      hasta.x = desde.x + (hasta.x - desde.x) * 0.75;
      hasta.y = desde.y + (hasta.y - desde.y) * 0.75;
    }
    if (!libre(scene, hasta.x, hasta.y, true)) hasta = desde;
    return hasta;
  }

  /** El salto (en todos los navegadores): se agacha y cae en `hasta`. */
  function saltar(st, z, hasta) {
    var scene = st.scene;
    z.estado = 'agacha';
    jugarAnim(z, z.dir, false);
    var esc = ESCALA_JEFE;
    scene.tweens.add({ targets: z.spr, scaleY: esc * 0.72, scaleX: esc * 1.12, duration: 420, yoyo: false, onComplete: function () {
      if (!st.vivo || !z.vivo) return;
      var desde = { x: z.x, y: z.y };
      z.estado = 'salta';
      z.spr.setScale(esc);
      scene.tweens.addCounter({ from: 0, to: 1, duration: 640, ease: 'Sine.easeInOut', onUpdate: function (tw) {
        if (!z.vivo) return;
        var t = tw.getValue();
        z.x = desde.x + (hasta.x - desde.x) * t;
        z.y = desde.y + (hasta.y - desde.y) * t;
        colocar(z);
        z.spr.y = z.y - Math.sin(t * Math.PI) * 150;     // el arco: la sombra se queda en el suelo
        z.sombra.setScale(2.2 * (1 - Math.sin(t * Math.PI) * 0.45));
      }, onComplete: function () {
        if (!st.vivo || !z.vivo) return;
        z.estado = 'caza';
        z.objX = z.x; z.objY = z.y;
        z.saltoEn = scene.time.now + (z.furia ? 3200 : 4600) + Math.random() * 1200;
        colocar(z);
        z.sombra.setScale(2.2);
        // EL GOLPE: tiembla la cueva, onda, y caen piedras (sobre quien esté cerca).
        onda(st, z.x, pies(z));
        if (cercaDeMi(st, z.x, pies(z), 650)) {
          try { scene.cameras.main.shake(420, z.furia ? 0.016 : 0.011); } catch (e) {}
          var pj = scene.player;
          if (pj && !fantasma() && Math.hypot(pj.x - z.x, (pj.y + 45) - pies(z)) < 105) golpearAlJugador(st, 'jefe_mina');
          lluviaDePiedras(st, z.furia ? 4 : 2);
        }
      } });
    } });
  }

  // ─────────────────────────────────────────────────────── EL PASO
  function actualizar(st, time, delta) {
    var scene = st.scene;
    var p = scene.player;
    if (!p || !p.active || scene._cambiandoEscena) return;
    var seg = Math.min(0.05, delta / 1000);
    if (st.red) st.red.tick(time);
    if (st.red && !st.red.esHost()) actualizarInvitado(st, seg);
    else actualizarAnfitrion(st, seg);
    mordiscos(st);
    if (st.jefe && st.barraJefe && st.barraJefe.style.display !== 'none') {
      var v = st.barraJefe.querySelector('.gfj-vida');
      if (v) v.style.width = Math.max(0, st.jefe.vida / st.jefe.max * 100).toFixed(1) + '%';
    }
  }

  function alguienCerca(st, x, y, r) {
    var lista = window.GFMobsRed ? window.GFMobsRed.jugadores(st.scene) : [{ x: st.scene.player.x, y: st.scene.player.y + 45 }];
    for (var i = 0; i < lista.length; i++) if (Math.hypot(lista[i].x - x, lista[i].y - y) < r) return true;
    return false;
  }

  function blancoDe(st, z, max) {
    var scene = st.scene;
    if (window.GFMobsRed) return window.GFMobsRed.masCercano(scene, z.x, pies(z), max);
    var p = scene.player;
    if (fantasma()) return null;
    var d = Math.hypot(p.x - z.x, p.y + 45 - pies(z));
    return d < max ? { x: p.x, y: p.y + 45, d: d, local: true } : null;
  }

  function actualizarAnfitrion(st, seg) {
    var scene = st.scene, p = scene.player;
    var ahora = scene.time.now;
    for (var i = 0; i < st.bichos.length; i++) {
      var z = st.bichos[i];
      if (!z.vivo) {
        if (Date.now() > z.muertoHasta && !alguienCerca(st, z.casa.x, z.casa.y, 500)) {
          revivir(st, z);
          if (st.red) st.red.evento({ e: 'revive', id: z.id });
        }
        continue;
      }
      var miD = Math.hypot(p.x - z.x, p.y + 45 - pies(z));
      var b = blancoDe(st, z, LEJOS);
      var ver = miD < LEJOS;
      if (ver !== z.spr.visible) { z.spr.setVisible(ver); z.sombra.setVisible(ver); }
      if (!ver && !b) continue;                 // nadie cerca: ni piensa

      if (z.jefe) {
        pensarJefe(st, z, seg, b);
      } else if (z.estado === 'pasea') {
        if (b && b.d < VISTA) {
          z.estado = 'caza';
        } else {
          if (!z.destino || ahora > z.ideaEn || Math.hypot(z.destino.x - z.x, z.destino.y - z.y) < 6) {
            var a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 170;
            z.destino = { x: z.casa.x + Math.cos(a) * r, y: z.casa.y + Math.sin(a) * r * 0.7 };
            // A veces se queda quieto, balanceándose: un zombi no tiene prisa.
            z.ideaEn = ahora + 2500 + Math.random() * 4000;
            if (Math.random() < 0.3) z.destino = { x: z.x, y: z.y };
          }
          var ddx = z.destino.x - z.x, ddy = z.destino.y - z.y, dd = Math.hypot(ddx, ddy);
          if (dd > 4) { if (!mover(st, z, ddx / dd * VEL_PASEO, ddy / dd * VEL_PASEO, seg)) z.destino = null; }
          else jugarAnim(z, z.dir, false);
        }
      } else {
        // Caza: hasta el blanco; pegado, para (el mordisco lo mira cada uno).
        if (!b || b.d > OLVIDA) { z.estado = 'pasea'; z.destino = null; }
        else if (b.d < ALCANCE_MORDISCO) jugarAnim(z, z.dir, false);
        else haciaConRuta(st, z, b.x, b.y - z.alto * 0.5, VEL_CAZA * (z.furia ? 1.2 : 1), seg);
      }
      if (z.estado !== 'salta') colocar(z);
      pintarBarra(st, z);
    }
  }

  /** Invitado: no piensa. Sigue la foto del anfitrión, suavizando. */
  function actualizarInvitado(st, seg) {
    var p = st.scene.player;
    for (var i = 0; i < st.bichos.length; i++) {
      var z = st.bichos[i];
      if (!z.vivo) continue;
      if (z.estado !== 'agacha' && z.estado !== 'salta') {
        var dx = z.objX - z.x, dy = z.objY - z.y, d = Math.hypot(dx, dy);
        if (d > 240) { z.x = z.objX; z.y = z.objY; }
        else if (d > 0.3) { var k = Math.min(1, seg * 9); z.x += dx * k; z.y += dy * k; }
        jugarAnim(z, z.dir, z.andandoRed);
      }
      var ver = Math.hypot(p.x - z.x, p.y + 45 - pies(z)) < LEJOS;
      if (ver !== z.spr.visible) { z.spr.setVisible(ver); z.sombra.setVisible(ver); }
      if (z.estado !== 'salta') colocar(z);
      pintarBarra(st, z);
    }
  }

  function revivir(st, z) {
    z.vida = z.max; z.vivo = true; z.furia = false; z.rugio = false;
    z.x = z.casa.x; z.y = z.casa.y; z.estado = z.jefe ? 'guarda' : 'pasea'; z.destino = null;
    z.objX = z.x; z.objY = z.y;
    z.spr.setAlpha(1).setVisible(true).clearTint().setScale(z.jefe ? ESCALA_JEFE : ESCALA);
    z.sombra.setVisible(true).setAlpha(0.8).setScale(z.jefe ? 2.2 : 1.1);
    if (z.jefe) {
      var nombre = st.barraJefe && st.barraJefe.querySelector('.gfj-nombre');
      if (nombre) nombre.textContent = '💀 The Mine Warden';
    }
    colocar(z);
  }

  /** Muere. El premio del guardián, solo para quien lo mató (`por`). */
  function morir(st, z, por) {
    var scene = st.scene;
    if (!z.vivo) return;
    z.vivo = false;
    z.vida = 0;
    z.muertoHasta = Date.now() + (z.jefe ? VUELVE_JEFE_MS : VUELVE_ZOMBI_MS);
    if (z.barra) z.barra.setVisible(false);
    var p = scene.add.image(z.x, pies(z) - 20, 'gfz_polvo').setDepth(pies(z) + 3).setScale(z.jefe ? 2.2 : 1.1);
    scene.tweens.add({ targets: p, scale: (z.jefe ? 5 : 2.6), alpha: 0, duration: 900, onComplete: function () { p.destroy(); } });
    scene.tweens.add({ targets: [z.spr, z.sombra], alpha: 0, duration: 600, onComplete: function () {
      z.spr.setVisible(false); z.sombra.setVisible(false);
    } });
    if (z.jefe) {
      barraJefe(st, false);
      var mio = st.red ? (por && st.red.soy(por)) : true;
      if (cercaDeMi(st, z.x, pies(z), 1200)) {
        try { scene.cameras.main.flash(500, 220, 180, 255); scene.cameras.main.shake(700, 0.012); } catch (e) {}
      }
      if (mio) {
        aviso(scene, '🏆 You defeated the Mine Warden! +300 strength XP', 'success');
        try { if (scene._sumarExpHabilidad) scene._sumarExpHabilidad('fuerza', 300); } catch (e) {}
      } else if (cercaDeMi(st, z.x, pies(z), 1200)) {
        aviso(scene, '⚔ The Mine Warden was defeated!', 'info');
      }
      // Los zombis cercanos se deshacen con él (lo decide el anfitrión).
      if (!st.red || st.red.esHost()) {
        st.bichos.forEach(function (o) {
          if (o.jefe || !o.vivo || Math.hypot(o.x - z.x, o.y - z.y) >= 600) return;
          morir(st, o, por);
          if (st.red) st.red.evento({ e: 'muere', id: o.id, por: por || null });
        });
      }
    }
  }

  function destello(st, z) {
    z.spr.setTintFill(0xffffff);
    st.scene.time.delayedCall(70, function () { if (z.spr.active) { if (z.furia) z.spr.setTint(0xff9a9a); else z.spr.clearTint(); } });
  }

  /** El anfitrión resta: un tajo suyo o el de otro (`por`). */
  function aplicarDano(st, z, dano, ux, uy, por) {
    var scene = st.scene;
    if (!z.vivo) return 0;
    var recibido = Math.min(z.vida, dano);
    z.vida -= dano;
    z.heridoEn = scene.time.now;
    // Retrocede un poco (el jefe casi nada). Por pasos de 4 px que se paran
    // ANTES de la pared: de un salto de 16 se podía cruzar una pared fina.
    var L = Math.hypot(ux, uy) || 1, emp = z.jefe ? 4 : 16;
    ux /= L; uy /= L;
    for (var paso = 0; paso < emp; paso += 4) {
      if (!libre(scene, z.x + ux * 4, z.y + uy * 4, z.jefe)) break;
      z.x += ux * 4; z.y += uy * 4;
    }
    destello(st, z);
    if (st.red) st.red.evento({ e: 'herido', id: z.id });
    if (!z.jefe) z.estado = 'caza';
    if (z.jefe && z.estado === 'guarda') {
      z.saltoEn = scene.time.now + 1500;
      despertar(st, z);
      if (st.red) st.red.evento({ e: 'despierta', id: z.id });
    }
    if (z.jefe && !z.furia && z.vida < z.max * 0.5) {
      enfurecer(st, z);
      if (st.red) st.red.evento({ e: 'furia', id: z.id });
    }
    if (z.vida <= 0) {
      morir(st, z, por);
      if (st.red) st.red.evento({ e: 'muere', id: z.id, por: por || null });
    }
    return recibido;
  }

  /** El tajo de la espada (gf-espada.js): a quién da y cuánto. */
  function recibirTajo(st, scene, cx, cy, dir, alcance, dano, poder) {
    var out = { tocados: 0, muertos: 0, puntos: [] };
    if (!st.vivo || scene !== st.scene) return out;
    var anfitrion = !st.red || st.red.esHost();
    var ang = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir] || 0;
    st.bichos.forEach(function (z) {
      if (!z.vivo || !z.spr.visible) return;
      var zx = z.x, zy = z.y + (z.jefe ? 20 : 0);
      var dx = zx - cx, dy = zy - cy;
      var d = Math.hypot(dx, dy);
      if (d > alcance + (z.jefe ? 46 : 18)) return;
      var da = Math.atan2(dy, dx) - ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > (poder && poder.arco || 1.35) && d > 26) return;
      out.tocados++;
      if (anfitrion) {
        var recibido = aplicarDano(st, z, dano, dx, dy, st.red ? st.red.miId() : null);
        out.puntos.push({ x: zx, y: zy - 10, dano: recibido });
        if (!z.vivo) out.muertos++;
      } else {
        out.puntos.push({ x: zx, y: zy - 10, dano: Math.min(z.vida, dano) });
        destello(st, z);
        z.heridoEn = scene.time.now;
        st.red.golpe({ id: z.id, dano: Math.round(dano * 10) / 10, ux: Math.round(dx), uy: Math.round(dy) });
      }
    });
    return out;
  }

  function enfurecer(st, z) {
    var scene = st.scene;
    if (z.furia) return;
    z.furia = true;
    z.spr.setTint(0xff9a9a);
    if (cercaDeMi(st, z.x, pies(z), 1100)) {
      aviso(scene, '💢 The Mine Warden is enraged!', 'warning');
      try { scene.cameras.main.shake(500, 0.01); } catch (e) {}
    }
    var nombre = st.barraJefe && st.barraJefe.querySelector('.gfj-nombre');
    if (nombre) nombre.textContent = '💢 The Mine Warden (enraged)';
    // Llama a dos de los suyos (los mueve el anfitrión; los demás lo ven en la foto).
    if (st.red && !st.red.esHost()) return;
    var llamados = 0;
    st.bichos.forEach(function (o) {
      if (llamados >= 2 || o.jefe) return;
      if (!o.vivo) { revivir(st, o); if (st.red) st.red.evento({ e: 'revive', id: o.id }); }
      for (var k = 0; k < 8; k++) {
        var a = Math.random() * Math.PI * 2;
        var x = z.x + Math.cos(a) * 130, y = z.y + Math.sin(a) * 100;
        if (libre(scene, x, y, false)) { o.x = x; o.y = y; o.estado = 'caza'; colocar(o); llamados++; onda(st, x, pies(o)); break; }
      }
    });
  }

  // ── LA RED ───────────────────────────────────────────────────────────────
  var DIRS = ['down', 'up', 'left', 'right'];
  var ESTADOS = ['pasea', 'caza', 'guarda', 'agacha', 'salta'];

  function exportar(st) {
    return st.bichos.map(function (z) {
      return [z.id, Math.round(z.x), Math.round(z.y),
              (z.vivo ? 1 : 0) | (z.andando ? 2 : 0) | (z.furia ? 4 : 0),
              Math.max(0, Math.round(z.vida)), Math.max(0, DIRS.indexOf(z.dir)), Math.max(0, ESTADOS.indexOf(z.estado))];
    });
  }

  function importar(st, lista) {
    lista.forEach(function (f) {
      var z = st.porId[f[0]];
      if (!z || !Array.isArray(f)) return;
      var vivo = !!(f[3] & 1);
      z.objX = Number(f[1]) || z.x; z.objY = Number(f[2]) || z.y;
      z.andandoRed = !!(f[3] & 2);
      z.vida = Math.min(z.max, Math.max(0, Number(f[4]) || 0));
      z.dir = DIRS[f[5]] || z.dir;
      var estado = ESTADOS[f[6]] || z.estado;
      // El salto lo lleva su tween aquí: no se pisa con la foto.
      if (z.estado !== 'agacha' && z.estado !== 'salta') z.estado = estado === 'agacha' || estado === 'salta' ? 'caza' : estado;
      if ((f[3] & 4) && !z.furia && z.vivo) enfurecer(st, z);
      if (vivo && !z.vivo) { revivir(st, z); z.x = z.objX; z.y = z.objY; }
      else if (!vivo && z.vivo) morir(st, z, null);
      if (z.jefe && z.vivo) barraJefe(st, z.estado !== 'guarda' && cercaDeMi(st, z.x, pies(z), 1100));
    });
  }

  function alEvento(st, d) {
    var z = st.porId[d.id];
    if (!z) return;
    if (d.e === 'revive') { if (!z.vivo) revivir(st, z); return; }
    if (d.e === 'muere') { if (z.vivo) morir(st, z, d.por || null); return; }
    if (!z.vivo) return;
    if (d.e === 'herido') { destello(st, z); z.heridoEn = st.scene.time.now; return; }
    if (d.e === 'despierta') { despertar(st, z); return; }
    if (d.e === 'furia') { enfurecer(st, z); return; }
    if (d.e === 'salta' && z.estado !== 'agacha' && z.estado !== 'salta') {
      saltar(st, z, { x: Number(d.x) || z.x, y: Number(d.y) || z.y });
    }
  }

  function alCambiarHost(st, soyYo) {
    st.bichos.forEach(function (z) {
      if (soyYo) { z.ruta = null; z.destino = null; if (z.estado === 'agacha' || z.estado === 'salta') z.estado = 'caza'; }
      else { z.objX = z.x; z.objY = z.y; }
    });
  }

  // ─────────────────────────────────────────────────────── MONTAJE
  function montar(scene) {
    if (!scene || !scene.add || !scene.map || scene.__gfZombis) return;
    var st = { scene: scene, bichos: [], porId: {}, red: null, jefe: null, vivo: true, preparado: false, ultimoGolpe: 0, barraJefe: null };
    scene.__gfZombis = st;
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    var lista = PERSONAJES.concat([PERSONAJE_JEFE]);
    // Los PNG ya están pintados: cargar el atlas es lo único (sin repintar
    // fotograma a fotograma, que era lo que daba tirones al entrar).
    var cargado = window.GFMonstruosArte ? window.GFMonstruosArte.cargar(scene, lista) : Promise.resolve(false);
    cargado.then(function (ready) {
      if (!st.vivo || scene.__gfZombis !== st) return;
      if (!ready) console.warn('[zombis] faltan dibujos de Game/Sprites/monstruos: algunos no saldrán');
      texturasSueltas(scene);
      // Los sitios salen de una semilla fija y del mapa: los mismos para todos.
      var sitios = elegirSitios(scene);
      sitios.zombis.forEach(function (s, i) {
        var z = crearBicho(st, s, PERSONAJES[i % PERSONAJES.length], false, i);
        if (z) { st.bichos.push(z); st.porId[i] = z; colocar(z); }
      });
      if (sitios.guarida) {
        var j = crearBicho(st, sitios.guarida, PERSONAJE_JEFE, true, 100);
        if (j) { st.bichos.push(j); st.porId[100] = j; st.jefe = j; colocar(j); }
      }
      st.preparado = true;
      log('zombis:', st.bichos.length - (st.jefe ? 1 : 0), 'guardián:', !!st.jefe, sitios.guarida);
      // Compartidos con los demás de la mina (gf-mobs-red.js).
      if (window.GFMobsRed) {
        st.red = window.GFMobsRed.crear(scene, 'zombis', {
          exportar: function () { return exportar(st); },
          importar: function (l) { if (st.vivo) importar(st, l); },
          alEvento: function (d) { if (st.vivo) alEvento(st, d); },
          alGolpe: function (d) {
            var z = st.porId[d.id];
            if (st.vivo && z && z.vivo) aplicarDano(st, z, Math.min(250, Number(d.dano) || 0), Number(d.ux) || 0, Number(d.uy) || 0, d.de);
          },
          alCambiarHost: function (soyYo) { if (st.vivo) alCambiarHost(st, soyYo); }
        });
      }
      st.onUpdate = function (t, d) { if (st.vivo) actualizar(st, t, d); };
      scene.events.on('update', st.onUpdate);
      // La espada les da.
      st.objetivo = function (sc, cx, cy, dir, alcance, dano, poder) { return recibirTajo(st, sc, cx, cy, dir, alcance, dano, poder); };
      if (window.GFEspada && window.GFEspada.agregarObjetivo) window.GFEspada.agregarObjetivo(st.objetivo);
      // Sus ojos en la oscuridad (MinaScene._pintarOscuridad).
      scene._lucesExtra = function (luz) {
        for (var i = 0; i < st.bichos.length; i++) {
          var z = st.bichos[i];
          if (!z.vivo || !z.spr.visible) continue;
          var cabeza = z.spr.y - z.alto * 0.32;
          if (z.jefe) luz(z.x, cabeza + 30, z.furia ? 150 : 120, z.furia ? 0xff7a8a : 0xc58cff, 0.75);
          else luz(z.x, cabeza, 34, 0xff5a4a, 0.6);
        }
      };
    });
  }

  function desmontar(scene) {
    var st = scene && scene.__gfZombis;
    if (!st) return;
    st.vivo = false;
    if (st.onUpdate) scene.events.off('update', st.onUpdate);
    scene.events.off('shutdown', st.onApagar);
    scene.events.off('destroy', st.onApagar);
    if (st.objetivo && window.GFEspada && window.GFEspada.quitarObjetivo) window.GFEspada.quitarObjetivo(st.objetivo);
    if (st.red) { st.red.cerrar(); st.red = null; }
    if (st.barraJefe && st.barraJefe.parentNode) st.barraJefe.parentNode.removeChild(st.barraJefe);
    st.barraJefe = null;
    st.bichos.forEach(function (z) {
      [z.spr, z.sombra, z.barra].forEach(function (o) { try { if (o && o.scene) o.destroy(); } catch (e) {} });
    });
    st.bichos.length = 0;
    st.porId = {};
    st.jefe = null;
    if (scene._lucesExtra) scene._lucesExtra = null;
    scene.__gfZombis = null;
  }

  window.GFMinaZombis = {
    montar: montar,
    desmontar: desmontar,
    _interno: { estado: function (s) { return s && s.__gfZombis; }, elegirSitios: elegirSitios }
  };
})();
