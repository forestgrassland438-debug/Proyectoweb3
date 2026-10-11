/* ===========================================================================
 * LOS ZOMBIS DE LA MINA Y SU GUARDIÁN                              (2026-10-10)
 *
 * Lo que pidió el jugador: "respetando los gráficos de los personajes, haz
 * zombis de los personajes en las minas que puedan matarte; que paseen; y
 * hasta 1 jefe que vigile, que brinque y que el mapa se mueva. Tú agrégale
 * cosas extraordinarias."
 *
 * LOS ZOMBIS
 *   Son los personajes del juego (las carpetas de Soulbound), PODRIDOS: al
 *   montar se cargan sus fotogramas de andar y se repintan en un lienzo —la
 *   piel pasa a verde ceniza y la ropa se apaga y se ensucia—, así que tienen
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
 * CADA UNO VE LOS SUYOS
 *   Los zombis viven en el navegador de cada jugador, no en el servidor (el
 *   daño sí lo decide el servidor).
 *
 * RENDIMIENTO Y FUGAS
 *   Lejos (más de 1.000 px) un zombi no piensa ni se dibuja. Las texturas
 *   repintadas se hacen UNA vez por personaje y se reutilizan; las de origen
 *   se sueltan al acabar. Al apagar la escena se quita todo: oyentes, la
 *   barra del jefe (DOM) y el objetivo de la espada.
 *
 * CÓMO SE ENGANCHA
 *   MinaScene, al terminar de construir:  GFMinaZombis.montar(this)
 * ======================================================================== */
(function () {
  'use strict';

  var PERSONAJES = ['personaje1', 'personaje3', 'personaje5', 'personaje8'];
  var PERSONAJE_JEFE = 'personaje6';
  var DIRS = { derecha: 'right', izquierda: 'left', arriba: 'up', abajo: 'down' };
  var FOTOS = 7;
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
  function claveOrigen(per, dir, n) { return 'gfz_src_' + per + '_' + dir + '_' + n; }
  function claveZombi(per, dir, n, jefe) { return 'gfz_' + (jefe ? 'j_' : '') + per + '_' + dir + '_' + n; }

  /** Carga los fotogramas de andar que falten. Nunca falla: resuelve igual. */
  function cargarOrigen(scene, lista) {
    var faltan = 0;
    lista.forEach(function (per) {
      Object.keys(DIRS).forEach(function (dir) {
        for (var n = 1; n <= FOTOS; n++) {
          var k = claveOrigen(per, dir, n);
          if (scene.textures.exists(k) || scene.textures.exists(claveZombi(per, dir, n, per === PERSONAJE_JEFE))) continue;
          scene.load.image(k, './Game/Sprites/Soulbound/' + per + '/' + dir + '/run_' + n + '.png');
          faltan++;
        }
      });
    });
    if (!faltan) return Promise.resolve();
    return new Promise(function (ok) {
      var listo = false;
      var fin = function () { if (!listo) { listo = true; ok(); } };
      scene.load.once('complete', fin);
      setTimeout(fin, 15000);
      scene.load.start();
    });
  }

  /** Repinta un fotograma: piel podrida, ropa apagada. `jefe`: morado. */
  function podrir(scene, per, dir, n, jefe) {
    var kz = claveZombi(per, dir, n, jefe);
    if (scene.textures.exists(kz)) return true;
    var ko = claveOrigen(per, dir, n);
    if (!scene.textures.exists(ko)) return false;
    var img = scene.textures.get(ko).getSourceImage();
    if (!img || !img.width) return false;
    var w = img.width, h = img.height;
    var c = scene.textures.createCanvas(kz, w, h);
    var ctx = c.getContext();
    ctx.drawImage(img, 0, 0);
    var d = ctx.getImageData(0, 0, w, h);
    var p = d.data;
    for (var i = 0; i < p.length; i += 4) {
      if (p[i + 3] === 0) continue;
      var r = p[i], g = p[i + 1], b = p[i + 2];
      var lum = 0.3 * r + 0.59 * g + 0.11 * b;
      var piel = r > 115 && r > g + 12 && g > b - 6 && (r - b) > 38 && (r - b) < 150;
      if (piel) {
        if (jefe) { r = lum * 0.62 + 34; g = lum * 0.44 + 18; b = lum * 0.72 + 40; }
        else { r = lum * 0.56 + 22; g = lum * 0.80 + 30; b = lum * 0.50 + 16; }
      } else {
        var k = 0.6;
        r = (r * (1 - k) + lum * k) * (jefe ? 0.66 : 0.76);
        g = (g * (1 - k) + lum * k) * (jefe ? 0.58 : 0.84);
        b = (b * (1 - k) + lum * k) * (jefe ? 0.80 : 0.72);
      }
      p[i] = Math.max(0, Math.min(255, r));
      p[i + 1] = Math.max(0, Math.min(255, g));
      p[i + 2] = Math.max(0, Math.min(255, b));
    }
    ctx.putImageData(d, 0, 0);
    c.refresh();
    c.setFilter(Phaser.Textures.FilterMode.NEAREST);
    return true;
  }

  function prepararPersonaje(scene, per, jefe) {
    var ok = true;
    Object.keys(DIRS).forEach(function (dir) {
      for (var n = 1; n <= FOTOS; n++) ok = podrir(scene, per, dir, n, jefe) && ok;
      var anim = 'gfz_' + (jefe ? 'j_' : '') + per + '_' + DIRS[dir];
      if (!scene.anims.exists(anim)) {
        var frames = [];
        for (var m = 1; m <= FOTOS; m++) {
          var k = claveZombi(per, dir, m, jefe);
          if (scene.textures.exists(k)) frames.push({ key: k });
        }
        // Una animación sin fotogramas nace vacía y tumba el bucle (ver la
        // memoria "animaciones globales"): sin fotogramas, no se crea.
        if (frames.length) scene.anims.create({ key: anim, frames: frames, frameRate: jefe ? 5 : 6, repeat: -1 });
      }
    });
    // Los de origen ya no hacen falta.
    Object.keys(DIRS).forEach(function (dir) {
      for (var n = 1; n <= FOTOS; n++) {
        var ko = claveOrigen(per, dir, n);
        try { if (scene.textures.exists(ko)) scene.textures.remove(ko); } catch (e) {}
      }
    });
    return ok;
  }

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
  function crearBicho(st, sitio, per, jefe) {
    var scene = st.scene;
    var esc = jefe ? ESCALA_JEFE : ESCALA;
    var anim = 'gfz_' + (jefe ? 'j_' : '') + per + '_down';
    var k0 = claveZombi(per, 'abajo', 1, jefe);
    if (!scene.textures.exists(k0)) return null;
    var spr = scene.add.sprite(sitio.x, sitio.y, k0).setScale(esc);
    var sombra = scene.add.image(sitio.x, sitio.y, 'gfz_sombra').setScale(jefe ? 2.2 : 1.1).setAlpha(0.8);
    var z = {
      spr: spr, sombra: sombra, per: per, jefe: jefe, casa: { x: sitio.x, y: sitio.y },
      x: sitio.x, y: sitio.y, alto: spr.displayHeight, vida: jefe ? VIDA_JEFE : VIDA_ZOMBI,
      max: jefe ? VIDA_JEFE : VIDA_ZOMBI, estado: jefe ? 'guarda' : 'pasea', destino: null,
      ideaEn: 0, mordioEn: 0, dir: 'down', anim: null, barra: null, heridoEn: 0,
      muertoHasta: 0, vivo: true, saltoEn: 0, furia: false, rugio: false, fase: Math.random() * 6
    };
    spr.setData('optimized', true);
    jugarAnim(z, 'down', false);
    return z;
  }

  function jugarAnim(z, dir, andando) {
    var k = 'gfz_' + (z.jefe ? 'j_' : '') + z.per + '_' + dir;
    if (!andando) {
      if (z.anim) { z.spr.anims.stop(); z.anim = null; }
      var d = { right: 'derecha', left: 'izquierda', up: 'arriba', down: 'abajo' }[dir];
      var k1 = claveZombi(z.per, d, 1, z.jefe);
      if (z.spr.texture.key !== k1 && z.spr.scene.textures.exists(k1)) z.spr.setTexture(k1);
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
    if (!nombre || !window.GFMascota || !window.GFMascota.api) return;
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

  function fantasma() {
    try { var e = window.GFMascota && window.GFMascota.estado && window.GFMascota.estado(); return !!(e && e.ghost); }
    catch (e2) { return false; }
  }

  // ─────────────────────────────────────────────────────── EL GUARDIÁN
  function barraJefe(st, mostrar) {
    var el = st.barraJefe;
    if (!el) {
      el = st.barraJefe = document.createElement('div');
      el.id = 'gf-jefe-mina';
      el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:9000;' +
        'width:min(420px,calc(100vw - 32px));pointer-events:none;font:700 13px/1.2 inherit;color:#f3e3ff;' +
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

  /** Del techo caen piedras sobre el jugador: primero la sombra, luego la piedra. */
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

  function pensarJefe(st, z, seg, dist, dx, dy) {
    var scene = st.scene;
    var ahora = scene.time.now;
    var p = scene.player;
    var vel = VEL_JEFE * (z.furia ? 1.35 : 1);
    var lejosDeCasa = Math.hypot(z.x - z.casa.x, z.y - z.casa.y);
    var jugadorEnGuarida = Math.hypot(p.x - z.casa.x, p.y - z.casa.y) < GUARDIA + 120;

    if (z.estado === 'agacha' || z.estado === 'salta') return;   // los mueve su tween

    if (z.estado === 'guarda') {
      if (!fantasma() && dist < VISTA_JEFE && jugadorEnGuarida) {
        z.estado = 'caza';
        z.saltoEn = ahora + 1800;
        if (!z.rugio) {
          z.rugio = true;
          aviso(scene, '💀 The Mine Warden awakens!', 'warning');
          try { scene.cameras.main.shake(600, 0.008); } catch (e) {}
        }
        barraJefe(st, true);
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

    // Persiguiendo. Si te vas lejos de su guarida, vuelve a ella.
    if (fantasma() || lejosDeCasa > GUARDIA * 2.4 || (!jugadorEnGuarida && dist > VISTA_JEFE * 1.6)) {
      z.estado = 'guarda';
      z.destino = { x: z.casa.x, y: z.casa.y };
      barraJefe(st, false);
      return;
    }
    if (ahora > z.saltoEn && dist < 520) { saltar(st, z); return; }
    if (dist < ALCANCE_MORDISCO + 34) {
      jugarAnim(z, z.dir, false);
      if (ahora - z.mordioEn > MORDISCO_MS * 1.3) { z.mordioEn = ahora; golpearAlJugador(st, 'jefe_mina'); }
      return;
    }
    mover(st, z, -dx / dist * vel, -dy / dist * vel, seg);
  }

  function saltar(st, z) {
    var scene = st.scene, p = scene.player;
    z.estado = 'agacha';
    jugarAnim(z, z.dir, false);
    var esc = ESCALA_JEFE;
    // Se agacha (aviso), y salta hacia donde estabas.
    scene.tweens.add({ targets: z.spr, scaleY: esc * 0.72, scaleX: esc * 1.12, duration: 420, yoyo: false, onComplete: function () {
      if (!st.vivo || !z.vivo) return;
      var desde = { x: z.x, y: z.y };
      var hasta = { x: p.x, y: p.y - (z.alto * 0.5 - 51) };
      // Que no caiga dentro de una pared: se acorta el salto hasta un sitio libre.
      for (var k = 0; k < 6 && !libre(scene, hasta.x, hasta.y, true); k++) {
        hasta.x = desde.x + (hasta.x - desde.x) * 0.75;
        hasta.y = desde.y + (hasta.y - desde.y) * 0.75;
      }
      if (!libre(scene, hasta.x, hasta.y, true)) hasta = desde;
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
        z.saltoEn = scene.time.now + (z.furia ? 3200 : 4600) + Math.random() * 1200;
        colocar(z);
        z.sombra.setScale(2.2);
        // EL GOLPE: tiembla la cueva, onda, y caen piedras.
        try { scene.cameras.main.shake(420, z.furia ? 0.016 : 0.011); } catch (e) {}
        onda(st, z.x, pies(z));
        var pj = scene.player;
        if (pj && !fantasma() && Math.hypot(pj.x - z.x, (pj.y + 45) - pies(z)) < 105) golpearAlJugador(st, 'jefe_mina');
        lluviaDePiedras(st, z.furia ? 4 : 2);
      } });
    } });
  }

  // ─────────────────────────────────────────────────────── EL PASO
  function actualizar(st, time, delta) {
    var scene = st.scene;
    var p = scene.player;
    if (!p || !p.active || scene._cambiandoEscena) return;
    var seg = Math.min(0.05, delta / 1000);
    var ahora = scene.time.now;
    var py = p.y + 45;
    var muerto = fantasma();
    for (var i = 0; i < st.bichos.length; i++) {
      var z = st.bichos[i];
      if (!z.vivo) {
        if (Date.now() > z.muertoHasta && Math.hypot(p.x - z.casa.x, p.y - z.casa.y) > 500) revivir(st, z);
        continue;
      }
      var dx = p.x - z.x, dy = py - pies(z);
      var dist = Math.hypot(dx, dy) || 1;
      var cerca = dist < LEJOS;
      if (cerca !== z.spr.visible) { z.spr.setVisible(cerca); z.sombra.setVisible(cerca); }
      if (!cerca) continue;

      if (z.jefe) {
        // `dx` al revés aquí: pensarJefe mueve con -dx/dist (del jefe hacia ti).
        pensarJefe(st, z, seg, dist, -dx, -dy);
      } else if (z.estado === 'pasea') {
        if (!muerto && dist < VISTA) {
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
        // Caza.
        if (muerto || dist > OLVIDA) { z.estado = 'pasea'; z.destino = null; }
        else if (dist < ALCANCE_MORDISCO) {
          jugarAnim(z, z.dir, false);
          if (ahora - z.mordioEn > MORDISCO_MS) { z.mordioEn = ahora; golpearAlJugador(st, 'zombi_mina'); }
        } else {
          mover(st, z, dx / dist * VEL_CAZA * (z.furia ? 1.2 : 1), dy / dist * VEL_CAZA * (z.furia ? 1.2 : 1), seg);
        }
      }
      if (z.estado !== 'salta') colocar(z);
      pintarBarra(st, z);
    }
    if (st.jefe && st.barraJefe && st.barraJefe.style.display !== 'none') {
      var v = st.barraJefe.querySelector('.gfj-vida');
      if (v) v.style.width = Math.max(0, st.jefe.vida / st.jefe.max * 100).toFixed(1) + '%';
    }
  }

  function revivir(st, z) {
    z.vida = z.max; z.vivo = true; z.furia = false; z.rugio = false;
    z.x = z.casa.x; z.y = z.casa.y; z.estado = z.jefe ? 'guarda' : 'pasea'; z.destino = null;
    z.spr.setAlpha(1).setVisible(true).clearTint();
    z.sombra.setVisible(true).setAlpha(0.8);
    colocar(z);
  }

  function morir(st, z) {
    var scene = st.scene;
    z.vivo = false;
    z.muertoHasta = Date.now() + (z.jefe ? VUELVE_JEFE_MS : VUELVE_ZOMBI_MS);
    if (z.barra) z.barra.setVisible(false);
    var p = scene.add.image(z.x, pies(z) - 20, 'gfz_polvo').setDepth(pies(z) + 3).setScale(z.jefe ? 2.2 : 1.1);
    scene.tweens.add({ targets: p, scale: (z.jefe ? 5 : 2.6), alpha: 0, duration: 900, onComplete: function () { p.destroy(); } });
    scene.tweens.add({ targets: [z.spr, z.sombra], alpha: 0, duration: 600, onComplete: function () {
      z.spr.setVisible(false); z.sombra.setVisible(false);
    } });
    if (z.jefe) {
      barraJefe(st, false);
      try { scene.cameras.main.flash(500, 220, 180, 255); scene.cameras.main.shake(700, 0.012); } catch (e) {}
      aviso(scene, '🏆 You defeated the Mine Warden! +300 strength XP', 'success');
      try { if (scene._sumarExpHabilidad) scene._sumarExpHabilidad('fuerza', 300); } catch (e) {}
      // Los zombis cercanos se deshacen con él.
      st.bichos.forEach(function (o) { if (!o.jefe && o.vivo && Math.hypot(o.x - z.x, o.y - z.y) < 600) morir(st, o); });
    }
  }

  /** El tajo de la espada (gf-espada.js): a quién da y cuánto. */
  function recibirTajo(st, scene, cx, cy, dir, alcance, dano) {
    var out = { tocados: 0, muertos: 0, puntos: [] };
    if (!st.vivo || scene !== st.scene) return out;
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
      if (Math.abs(da) > 1.35 && d > 26) return;
      z.vida -= dano;
      z.heridoEn = scene.time.now;
      out.tocados++;
      out.puntos.push({ x: zx, y: zy - 10 });
      // Retrocede un poco (el jefe casi nada).
      var emp = z.jefe ? 4 : 16;
      if (libre(scene, z.x + dx / (d || 1) * emp, z.y + dy / (d || 1) * emp, z.jefe)) { z.x += dx / (d || 1) * emp; z.y += dy / (d || 1) * emp; }
      z.spr.setTintFill(0xffffff);
      scene.time.delayedCall(70, function () { if (z.spr.active) { if (z.furia) z.spr.setTint(0xff9a9a); else z.spr.clearTint(); } });
      if (!z.jefe) z.estado = 'caza';
      if (z.jefe && z.estado === 'guarda') { z.estado = 'caza'; z.saltoEn = scene.time.now + 1500; barraJefe(st, true); }
      if (z.jefe && !z.furia && z.vida < z.max * 0.5) enfurecer(st, z);
      if (z.vida <= 0) { out.muertos++; morir(st, z); }
    });
    return out;
  }

  function enfurecer(st, z) {
    var scene = st.scene;
    z.furia = true;
    z.spr.setTint(0xff9a9a);
    aviso(scene, '💢 The Mine Warden is enraged!', 'warning');
    try { scene.cameras.main.shake(500, 0.01); } catch (e) {}
    var nombre = st.barraJefe && st.barraJefe.querySelector('.gfj-nombre');
    if (nombre) nombre.textContent = '💢 The Mine Warden (enraged)';
    // Llama a dos de los suyos.
    var llamados = 0;
    st.bichos.forEach(function (o) {
      if (llamados >= 2 || o.jefe) return;
      if (!o.vivo) revivir(st, o);
      for (var k = 0; k < 8; k++) {
        var a = Math.random() * Math.PI * 2;
        var x = z.x + Math.cos(a) * 130, y = z.y + Math.sin(a) * 100;
        if (libre(scene, x, y, false)) { o.x = x; o.y = y; o.estado = 'caza'; colocar(o); llamados++; onda(st, x, pies(o)); break; }
      }
    });
  }

  // ─────────────────────────────────────────────────────── MONTAJE
  function montar(scene) {
    if (!scene || !scene.add || !scene.map || scene.__gfZombis) return;
    var st = { scene: scene, bichos: [], jefe: null, vivo: true, ultimoGolpe: 0, barraJefe: null };
    scene.__gfZombis = st;
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    var lista = PERSONAJES.concat([PERSONAJE_JEFE]);
    cargarOrigen(scene, lista).then(function () {
      if (!st.vivo || scene.__gfZombis !== st) return;
      texturasSueltas(scene);
      PERSONAJES.forEach(function (per) { prepararPersonaje(scene, per, false); });
      prepararPersonaje(scene, PERSONAJE_JEFE, true);
      var sitios = elegirSitios(scene);
      sitios.zombis.forEach(function (s, i) {
        var z = crearBicho(st, s, PERSONAJES[i % PERSONAJES.length], false);
        if (z) { st.bichos.push(z); colocar(z); }
      });
      if (sitios.guarida) {
        var j = crearBicho(st, sitios.guarida, PERSONAJE_JEFE, true);
        if (j) { st.bichos.push(j); st.jefe = j; colocar(j); }
      }
      log('zombis:', st.bichos.length - (st.jefe ? 1 : 0), 'guardián:', !!st.jefe, sitios.guarida);
      st.onUpdate = function (t, d) { if (st.vivo) actualizar(st, t, d); };
      scene.events.on('update', st.onUpdate);
      // La espada les da.
      st.objetivo = function (sc, cx, cy, dir, alcance, dano) { return recibirTajo(st, sc, cx, cy, dir, alcance, dano); };
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
    if (st.barraJefe && st.barraJefe.parentNode) st.barraJefe.parentNode.removeChild(st.barraJefe);
    st.barraJefe = null;
    st.bichos.forEach(function (z) {
      [z.spr, z.sombra, z.barra].forEach(function (o) { try { if (o && o.scene) o.destroy(); } catch (e) {} });
    });
    st.bichos.length = 0;
    st.jefe = null;
    if (scene._lucesExtra) scene._lucesExtra = null;
    scene.__gfZombis = null;
  }

  window.GFMinaZombis = {
    montar: montar,
    desmontar: desmontar,
    _interno: { estado: function (s) { return s && s.__gfZombis; }, podrir: podrir, elegirSitios: elegirSitios }
  };
})();
