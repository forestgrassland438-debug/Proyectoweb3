/* ===========================================================================
 * LA SERPIENTE DE MAGMA (la mina)                                  (2026-10-11)
 *
 * Lo que pidió el jugador: "agrega una serpiente 2.5D en la mina que sea un
 * monstruo, que grite y que la cámara se mueva; que cave y se te acerque, o
 * que se te acerque reptando si no te moviste; que lance bolas de fuego de su
 * boca, o que invoque terremotos; que pase de pared a pared o de piso a piso;
 * que al matarla me dé nivel y objetos en el suelo."
 *
 * CÓMO ES
 *   Una cabeza y dieciséis anillos de obsidiana con la tripa al rojo, que se
 *   siguen unos a otros por el rastro de la cabeza (el cuerpo serpentea solo).
 *   Cada anillo se ordena por su Y y lleva su sombra: con el jugador entre sus
 *   anillos se ve por delante de unos y por detrás de otros (2.5D). Todo se
 *   DIBUJA aquí en lienzos (sin PNG nuevos), liso, con bandas y sin motas.
 *
 * LO QUE HACE
 *   · ACECHA bajo tierra cerca de su guarida. Si te acercas, GRITA (suena y
 *     tiembla la cueva) y CAVA hacia ti: se ve el montículo de tierra que
 *     avanza... atravesando paredes y suelo, como si nada.
 *   · SALE junto a ti —si hay una pared cerca, sale DE LA PARED— reventando
 *     el suelo; si te pilla encima, muerde.
 *   · En la superficie: si te quedas QUIETO, viene REPTANDO a morderte; si
 *     te mueves, te ESCUPE bolas de fuego desde la boca o invoca un
 *     TERREMOTO (tiembla todo y caen piedras del techo donde estás, con su
 *     sombra de aviso). A media vida se enfurece: más bolas, más deprisa.
 *   · Al rato se HUNDE y vuelve a cavar para salir por otro sitio.
 *   · Al morir revienta anillo a anillo. El SERVIDOR da la experiencia y
 *     prepara el botín (/api/monstruos/derrotado): unos montones en el suelo
 *     que se acuñan al pisarlos (/api/monstruos/botin/recoger). Vuelve a los
 *     20 minutos.
 *
 * EL DAÑO lo pone el servidor (serpiente_fuego / _terremoto / _mordisco en
 * costesDeAccion). La ESPADA le da (GFEspada.agregarObjetivo), más en la
 * cabeza. En la oscuridad de la cueva se le ven los ojos, la tripa y las
 * bolas de fuego (MinaScene._lucesExtras).
 *
 * CÓMO SE ENGANCHA:  MinaScene, al construir:  GFMinaSerpiente.montar(this)
 * ======================================================================== */
(function () {
  'use strict';

  var ANILLOS = 16;
  var SEPARACION = 17;                 // px de rastro entre anillos
  var VIDA = 900;
  var VEL_CAVA = 240, VEL_REPTA = 92;
  var DESPIERTA = 760;                 // px a la guarida a los que despierta
  var OLVIDA = 1300;
  var SUPERFICIE_MS = [6500, 9000];
  var VUELVE_MS = 20 * 60 * 1000;
  var QUIETO_MS = 2000;

  function log() {
    if (!window.GF_SERPIENTE_DEBUG) return;
    var a = Array.prototype.slice.call(arguments); a.unshift('[serpiente]');
    console.log.apply(console, a);
  }
  function aviso(scene, texto, tipo) {
    try { if (scene.notifications && scene.notifications.show) scene.notifications.show(texto, tipo || 'info'); } catch (e) {}
  }
  function azar(s) {
    s = s >>> 0;
    return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  function api(ruta, cuerpo) {
    if (window.GFMascota && window.GFMascota.api) return window.GFMascota.api(ruta, cuerpo);
    return Promise.resolve({ ok: false, status: 0, datos: null });
  }

  // ─────────────────────────────────────────────────────── EL DIBUJO
  function lienzo(scene, clave, w, h, pinta, lineal) {
    if (scene.textures.exists(clave)) return;
    var c = scene.textures.createCanvas(clave, w, h);
    pinta(c.getContext(), w, h);
    c.refresh();
    if (!lineal) c.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  function texturas(scene) {
    // Un anillo del cuerpo visto desde arriba en 3/4: obsidiana con el lomo
    // iluminado arriba a la izquierda y la tripa de magma abajo.
    lienzo(scene, 'gfsp_anillo', 40, 34, function (x, w, h) {
      var g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#5a3a4e'); g.addColorStop(0.35, '#33202e'); g.addColorStop(0.7, '#1c1119'); g.addColorStop(1, '#120a10');
      x.fillStyle = g;
      x.beginPath(); x.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2); x.fill();
      // La tripa al rojo: una banda curva, lisa.
      x.save(); x.beginPath(); x.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2); x.clip();
      var t = x.createLinearGradient(0, h * 0.62, 0, h);
      t.addColorStop(0, 'rgba(255,120,40,0)'); t.addColorStop(0.45, 'rgba(255,128,40,0.95)'); t.addColorStop(1, 'rgba(255,200,90,1)');
      x.fillStyle = t; x.fillRect(0, h * 0.62, w, h * 0.38);
      // El brillo del lomo: una franja, no un punto.
      var b = x.createLinearGradient(0, 0, w, 0);
      b.addColorStop(0, 'rgba(255,255,255,0)'); b.addColorStop(0.35, 'rgba(210,170,200,0.45)'); b.addColorStop(0.7, 'rgba(255,255,255,0)');
      x.fillStyle = b; x.fillRect(4, 5, w - 8, 4);
      x.restore();
      x.strokeStyle = '#0b0609'; x.lineWidth = 2;
      x.beginPath(); x.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2); x.stroke();
    });
    // La cabeza, mirando a la DERECHA: cerrada y abierta.
    [false, true].forEach(function (abierta) {
      lienzo(scene, abierta ? 'gfsp_cabeza_abierta' : 'gfsp_cabeza', 64, 48, function (x, w, h) {
        var cy = h / 2;
        // Cuernos hacia atrás.
        x.fillStyle = '#2a1a22';
        x.beginPath(); x.moveTo(14, cy - 8); x.lineTo(2, cy - 20); x.lineTo(20, cy - 12); x.closePath(); x.fill();
        x.beginPath(); x.moveTo(14, cy + 8); x.lineTo(2, cy + 20); x.lineTo(20, cy + 12); x.closePath(); x.fill();
        var g = x.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#6a4458'); g.addColorStop(0.4, '#3a2434'); g.addColorStop(1, '#140b12');
        x.fillStyle = g;
        var ab = abierta ? 9 : 0;
        // Mandíbula de arriba.
        x.beginPath();
        x.moveTo(10, cy - 13); x.quadraticCurveTo(40, cy - 20, 62, cy - 3 - ab);
        x.lineTo(60, cy - ab * 0.4); x.quadraticCurveTo(36, cy - 2, 10, cy + 2); x.closePath(); x.fill();
        // Mandíbula de abajo.
        x.beginPath();
        x.moveTo(10, cy - 2); x.quadraticCurveTo(36, cy + 2 + ab * 0.3, 58, cy + 3 + ab);
        x.lineTo(54, cy + 9 + ab); x.quadraticCurveTo(32, cy + 16, 10, cy + 13); x.closePath(); x.fill();
        if (abierta) {
          // La garganta de fuego.
          var f = x.createRadialGradient(40, cy, 2, 40, cy, 22);
          f.addColorStop(0, 'rgba(255,240,160,1)'); f.addColorStop(0.5, 'rgba(255,140,40,0.95)'); f.addColorStop(1, 'rgba(255,90,20,0)');
          x.fillStyle = f;
          x.beginPath(); x.moveTo(22, cy); x.quadraticCurveTo(44, cy - ab - 1, 60, cy - ab * 0.6); x.lineTo(56, cy + ab); x.quadraticCurveTo(40, cy + ab * 0.6, 22, cy + 1); x.closePath(); x.fill();
        }
        // Borde.
        x.strokeStyle = '#0b0609'; x.lineWidth = 2;
        x.beginPath(); x.moveTo(10, cy - 13); x.quadraticCurveTo(40, cy - 20, 62, cy - 3 - ab); x.stroke();
        x.beginPath(); x.moveTo(10, cy + 13); x.quadraticCurveTo(32, cy + 16, 54, cy + 9 + ab); x.stroke();
        // Los ojos: dos rasgos de brasa (alargados, no redondos).
        x.fillStyle = '#ffb02e';
        x.beginPath(); x.ellipse(36, cy - 11, 5, 2, -0.25, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#fff1b0';
        x.fillRect(35, cy - 12, 3, 1);
        // La línea de la boca.
        x.strokeStyle = '#ff7a2a'; x.lineWidth = 1;
        x.beginPath(); x.moveTo(22, cy); x.lineTo(56, cy - ab * 0.3); x.stroke();
      });
    });
    lienzo(scene, 'gfsp_bola', 28, 28, function (x, w, h) {
      var g = x.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,250,210,1)'); g.addColorStop(0.35, 'rgba(255,190,70,1)');
      g.addColorStop(0.7, 'rgba(255,90,20,0.7)'); g.addColorStop(1, 'rgba(255,60,10,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    }, true);
    lienzo(scene, 'gfsp_estela', 40, 16, function (x, w, h) {
      var g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,90,20,0)'); g.addColorStop(1, 'rgba(255,170,60,0.8)');
      x.fillStyle = g;
      x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, 2); x.lineTo(w, h - 2); x.closePath(); x.fill();
    }, true);
    lienzo(scene, 'gfsp_monticulo', 60, 30, function (x, w, h) {
      var g = x.createRadialGradient(w / 2, h * 0.45, 2, w / 2, h / 2, w / 2);
      g.addColorStop(0, '#7a5a42'); g.addColorStop(0.6, '#4e3828'); g.addColorStop(1, 'rgba(40,28,20,0)');
      x.fillStyle = g;
      x.beginPath(); x.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = 'rgba(30,20,14,0.8)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(12, h / 2); x.lineTo(26, h / 2 - 3); x.lineTo(34, h / 2 + 2); x.lineTo(48, h / 2 - 2); x.stroke();
    }, true);
    lienzo(scene, 'gfsp_agujero', 72, 38, function (x, w, h) {
      var g = x.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      g.addColorStop(0, '#050303'); g.addColorStop(0.6, '#1a1210'); g.addColorStop(0.85, '#3e2c22'); g.addColorStop(1, 'rgba(62,44,34,0)');
      x.fillStyle = g;
      x.beginPath(); x.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); x.fill();
    }, true);
    lienzo(scene, 'gfsp_grieta', 110, 26, function (x, w, h) {
      x.strokeStyle = 'rgba(20,12,10,0.9)'; x.lineWidth = 3; x.lineJoin = 'round';
      x.beginPath(); x.moveTo(4, 14); x.lineTo(22, 10); x.lineTo(36, 16); x.lineTo(54, 8); x.lineTo(70, 15); x.lineTo(88, 9); x.lineTo(106, 13); x.stroke();
      x.strokeStyle = 'rgba(255,120,40,0.55)'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(22, 10); x.lineTo(36, 16); x.lineTo(54, 8); x.lineTo(70, 15); x.stroke();
    }, true);
    lienzo(scene, 'gfsp_sombra', 48, 18, function (x, w, h) {
      x.save(); x.scale(1, h / w);
      var cy = (h / 2) * (w / h);
      var g = x.createRadialGradient(w / 2, cy, 1, w / 2, cy, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.7, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.beginPath(); x.arc(w / 2, cy, w / 2, 0, Math.PI * 2); x.fill(); x.restore();
    }, true);
    lienzo(scene, 'gfsp_polvo', 64, 64, function (x, w, h) {
      var g = x.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(140,120,100,0.6)'); g.addColorStop(1, 'rgba(140,120,100,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    }, true);
    lienzo(scene, 'gfsp_onda', 128, 128, function (x) {
      var g = x.createRadialGradient(64, 64, 40, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,170,90,0.55)'); g.addColorStop(1, 'rgba(255,170,90,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    }, true);
    lienzo(scene, 'gfsp_brillo', 48, 48, function (x, w, h) {
      var g = x.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,240,180,0.9)'); g.addColorStop(1, 'rgba(255,200,90,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    }, true);
  }

  // ─────────────────────────────────────────────────────── EL GRITO
  /* Sintetizado con WebAudio (sin archivos): un rugido grave que baja, con
     temblor, y un siseo encima. Respeta el silencio y el volumen del juego. */
  function gritar(scene, fuerza) {
    try {
      var snd = scene.sound;
      var ctx = snd && snd.context;
      if (!ctx || snd.mute || typeof ctx.createOscillator !== 'function') return;
      var vol = (scene.audioState && Number.isFinite(scene.audioState.sfxVolumeApplied)) ? scene.audioState.sfxVolumeApplied : 0.5;
      vol *= (Number.isFinite(snd.volume) ? snd.volume : 1) * (fuerza || 1);
      if (vol <= 0.001) return;
      var t0 = ctx.currentTime, dur = 1.5;
      var osc = ctx.createOscillator(); osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(190, t0); osc.frequency.exponentialRampToValueAtTime(52, t0 + dur);
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.42 * vol, t0 + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      var lfo = ctx.createOscillator(); lfo.frequency.value = 17;
      var lfoG = ctx.createGain(); lfoG.gain.value = 0.18 * vol;
      lfo.connect(lfoG); lfoG.connect(g.gain);
      osc.connect(lp); lp.connect(g); g.connect(ctx.destination);
      var n = Math.floor(ctx.sampleRate * dur);
      var buf = ctx.createBuffer(1, n, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      var ruido = ctx.createBufferSource(); ruido.buffer = buf;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2200, t0); bp.frequency.exponentialRampToValueAtTime(380, t0 + dur); bp.Q.value = 0.7;
      var gn = ctx.createGain();
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.exponentialRampToValueAtTime(0.22 * vol, t0 + 0.05);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.85);
      ruido.connect(bp); bp.connect(gn); gn.connect(ctx.destination);
      osc.start(t0); lfo.start(t0); ruido.start(t0);
      osc.stop(t0 + dur); lfo.stop(t0 + dur); ruido.stop(t0 + dur);
    } catch (e) { /* sin sonido, sin drama */ }
  }

  // ─────────────────────────────────────────────────────── EL MAPA
  function libre(scene, x, y, ancho) {
    if (typeof scene._chocaConEscenario !== 'function') return true;
    var w = ancho || 34;
    return !scene._chocaConEscenario(x - w / 2, y - 8, w, 16);
  }

  function hayParedCerca(scene, x, y) {
    for (var k = 0; k < 8; k++) {
      var a = k / 8 * Math.PI * 2;
      if (!libre(scene, x + Math.cos(a) * 46, y + Math.sin(a) * 36, 20)) return { x: Math.cos(a), y: Math.sin(a) };
    }
    return null;
  }

  function elegirGuarida(scene) {
    var W = scene.map.widthInPixels, H = scene.map.heightInPixels;
    var entrada = scene._puntoDeAparicion ? scene._puntoDeAparicion() : { x: W / 2, y: 300 };
    var guardian = null;
    try {
      var z = window.GFMinaZombis && window.GFMinaZombis._interno.estado(scene);
      if (z && z.jefe) guardian = z.jefe.casa;
    } catch (e) {}
    var r = azar(2026101107);
    var mejor = null, md = -1;
    for (var i = 0; i < 1600; i++) {
      var x = 160 + r() * (W - 320), y = 160 + r() * (H - 320);
      var d = Math.hypot(x - entrada.x, y - entrada.y);
      if (d < 1100 || d < md) continue;
      if (guardian && Math.hypot(x - guardian.x, y - guardian.y) < 900) continue;
      var ok = libre(scene, x, y, 60);
      for (var k = 0; ok && k < 8; k++) {
        var a = k / 8 * Math.PI * 2;
        ok = libre(scene, x + Math.cos(a) * 150, y + Math.sin(a) * 110, 40);
      }
      if (ok) { md = d; mejor = { x: x, y: y }; }
    }
    return mejor;
  }

  // ─────────────────────────────────────────────────────── EL BICHO
  function crear(st) {
    var scene = st.scene;
    var s = st.s = {
      x: st.guarida.x, y: st.guarida.y, ang: 0, vida: VIDA, max: VIDA,
      estado: 'oculta', estadoDesde: scene.time.now, rastro: [], anillos: [], sombras: [],
      cabeza: null, sombraCabeza: null, monticulo: null, agujero: null,
      destino: null, siguienteAtaque: 0, superficieHasta: 0, furia: false, vivo: true,
      muertaHasta: 0, ultimoMordisco: 0, gritoEn: 0, polvoEn: 0, heridaEn: 0
    };
    for (var i = 0; i < ANILLOS; i++) {
      var k = 1 - i / ANILLOS * 0.55;           // la cola, más fina
      s.anillos.push(scene.add.image(s.x, s.y, 'gfsp_anillo').setScale(k * 1.15).setVisible(false));
      s.sombras.push(scene.add.image(s.x, s.y, 'gfsp_sombra').setScale(k * 1.1).setVisible(false).setAlpha(0.8));
    }
    s.cabeza = scene.add.image(s.x, s.y, 'gfsp_cabeza').setOrigin(0.4, 0.5).setScale(1.25).setVisible(false);
    s.sombraCabeza = scene.add.image(s.x, s.y, 'gfsp_sombra').setScale(1.4).setVisible(false).setAlpha(0.8);
    s.monticulo = scene.add.image(s.x, s.y, 'gfsp_monticulo').setVisible(false);
    s.agujero = scene.add.image(s.x, s.y, 'gfsp_agujero').setVisible(false).setScale(1.2);
    [s.cabeza].concat(s.anillos).forEach(function (o) { o.setData('optimized', true); });
    reiniciarRastro(s);
  }

  function reiniciarRastro(s) {
    s.rastro.length = 0;
    for (var i = 0; i <= ANILLOS * SEPARACION / 4 + 4; i++) s.rastro.push({ x: s.x, y: s.y });
  }

  function apuntarRastro(s) {
    var u = s.rastro[0];
    if (Math.hypot(s.x - u.x, s.y - u.y) >= 4) {
      s.rastro.unshift({ x: s.x, y: s.y });
      var max = Math.ceil(ANILLOS * SEPARACION / 4) + 8;
      if (s.rastro.length > max) s.rastro.length = max;
    }
  }

  /** Punto del rastro a `dist` px de la cabeza. */
  function enRastro(s, dist) {
    var acc = 0;
    for (var i = 1; i < s.rastro.length; i++) {
      var a = s.rastro[i - 1], b = s.rastro[i];
      var seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (acc + seg >= dist) {
        var t = seg ? (dist - acc) / seg : 0;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ang: Math.atan2(a.y - b.y, a.x - b.x) };
      }
      acc += seg;
    }
    var u = s.rastro[s.rastro.length - 1];
    return { x: u.x, y: u.y, ang: s.ang };
  }

  function verCuerpo(s, ver) {
    s.cabeza.setVisible(ver); s.sombraCabeza.setVisible(ver);
    for (var i = 0; i < ANILLOS; i++) { s.anillos[i].setVisible(ver); s.sombras[i].setVisible(ver); }
  }

  /** Coloca cabeza y anillos sobre el rastro. `alzado` 0..1: sale del agujero. */
  function colocarCuerpo(st, alzado) {
    var s = st.s, scene = st.scene;
    var t = scene.time.now / 1000;
    var a = alzado == null ? 1 : alzado;
    for (var i = ANILLOS - 1; i >= 0; i--) {
      var p = enRastro(s, (i + 1) * SEPARACION * Math.max(0.15, a));
      var an = s.anillos[i], so = s.sombras[i];
      // Ondula un poco aunque esté quieta: está viva.
      var vaiven = Math.sin(t * 3 + i * 0.6) * 1.5;
      var px = p.x + Math.cos(p.ang + Math.PI / 2) * vaiven, py = p.y + Math.sin(p.ang + Math.PI / 2) * vaiven;
      var k = (1 - i / ANILLOS * 0.55) * 1.15 * (0.4 + 0.6 * a);
      an.setPosition(px, py - 10 * a).setRotation(p.ang).setScale(k).setDepth(py + 0.01 * i);
      so.setPosition(px, py + 2).setScale(k * 0.95).setDepth(py - 1);
    }
    var flip = Math.cos(s.ang) < 0;
    s.cabeza.setPosition(s.x, s.y - 14 * a).setRotation(s.ang).setFlipY(flip)
      .setScale(1.25 * (0.4 + 0.6 * a)).setDepth(s.y + 1);
    s.sombraCabeza.setPosition(s.x, s.y + 3).setDepth(s.y - 1).setScale(1.4 * (0.4 + 0.6 * a));
  }

  // ─────────────────────────────────────────────────────── EFECTOS
  function onda(st, x, y, escala) {
    var scene = st.scene;
    var o = scene.add.image(x, y, 'gfsp_onda').setDepth(y + 2).setScale(0.4).setAlpha(0.95);
    o.setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: o, scale: 3.4 * (escala || 1), alpha: 0, duration: 560, ease: 'Quad.easeOut', onComplete: function () { o.destroy(); } });
  }
  function polvo(st, x, y, escala) {
    var scene = st.scene;
    var p = scene.add.image(x, y, 'gfsp_polvo').setDepth(y + 3).setScale(0.9 * (escala || 1)).setAlpha(0.9);
    scene.tweens.add({ targets: p, scale: 2.6 * (escala || 1), alpha: 0, y: y - 26, duration: 900, ease: 'Sine.easeOut', onComplete: function () { p.destroy(); } });
  }
  /** Piedras que saltan al reventar el suelo (o la pared): pocas y grandes. */
  function cascotes(st, x, y, dir) {
    var scene = st.scene;
    if (!scene.textures.exists('piezas_mina')) return;
    for (var i = 0; i < 5; i++) {
      var a = (dir ? Math.atan2(dir.y, dir.x) + Math.PI : -Math.PI / 2) + (Math.random() - 0.5) * 2.2;
      var dist = 50 + Math.random() * 70;
      var r = scene.add.image(x, y, 'piezas_mina', 'pena_pequena').setOrigin(0.5, 1).setScale(0.35 + Math.random() * 0.2).setDepth(y + 4);
      (function (roca, tx, ty) {
        scene.tweens.addCounter({ from: 0, to: 1, duration: 520, ease: 'Quad.easeOut', onUpdate: function (tw) {
          var t = tw.getValue();
          roca.x = x + (tx - x) * t; roca.y = y + (ty - y) * t - Math.sin(t * Math.PI) * 60;
          roca.setDepth(roca.y + 4);
        }, onComplete: function () {
          scene.tweens.add({ targets: roca, alpha: 0, delay: 600, duration: 400, onComplete: function () { roca.destroy(); } });
        } });
      })(r, x + Math.cos(a) * dist, y + Math.sin(a) * dist * 0.7);
    }
  }
  function temblar(st, ms, fuerza) {
    try { st.scene.cameras.main.shake(ms, fuerza); } catch (e) {}
  }

  // ─────────────────────────────────────────────────────── EL DAÑO
  function golpearAlJugador(st, motivo) {
    var scene = st.scene;
    var nombre = scene.playerName;
    if (!nombre) return;
    var ahora = Date.now();
    if (ahora - st.ultimoGolpe < 700) return;
    st.ultimoGolpe = ahora;
    api('/api/stats/' + encodeURIComponent(nombre) + '/consume', { reason: motivo }).then(function (r) {
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
  function piesJugador(scene) {
    var p = scene.player;
    return { x: p.x, y: p.y + 45 };
  }

  // ─────────────────────────────────────────────────────── LA BARRA
  function barra(st, ver) {
    var el = st.barra;
    if (!el) {
      el = st.barra = document.createElement('div');
      el.id = 'gf-serpiente-barra';
      el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:50%;top:118px;transform:translateX(-50%);z-index:9000;' +
        'width:min(280px,calc(100vw - 300px));min-width:150px;pointer-events:none;font:700 12px/1.2 inherit;color:#ffe2c4;' +
        'text-align:center;text-shadow:0 1px 2px #000;display:none';
      el.innerHTML = '<div class="gfs-nombre">🐍 The Magma Serpent</div>' +
        '<div style="margin-top:4px;height:10px;border-radius:6px;background:rgba(20,6,4,.78);border:1px solid #ff9a4a;overflow:hidden">' +
        '<div class="gfs-vida" style="height:100%;width:100%;background:linear-gradient(90deg,#ff5a1e,#ffc04a);transition:width .15s"></div></div>';
      document.body.appendChild(el);
    }
    el.style.display = ver ? 'block' : 'none';
    if (ver) {
      var v = el.querySelector('.gfs-vida');
      if (v) v.style.width = Math.max(0, st.s.vida / st.s.max * 100).toFixed(1) + '%';
    }
  }

  // ─────────────────────────────────────────────────────── LOS ESTADOS
  function cambiar(st, estado) {
    st.s.estado = estado;
    st.s.estadoDesde = st.scene.time.now;
  }

  function sitioDeSalida(st) {
    var scene = st.scene, pj = piesJugador(scene);
    var mejor = null;
    // Mejor si hay una pared al lado: sale DE LA PARED.
    for (var k = 0; k < 24; k++) {
      var a = Math.random() * Math.PI * 2, r = 150 + Math.random() * 90;
      var x = pj.x + Math.cos(a) * r, y = pj.y + Math.sin(a) * r * 0.75;
      if (!libre(scene, x, y, 60)) continue;
      var pared = hayParedCerca(scene, x, y);
      if (pared) return { x: x, y: y, pared: pared };
      if (!mejor) mejor = { x: x, y: y, pared: null };
    }
    return mejor;
  }

  function empezarACavar(st, haciaJugador) {
    var s = st.s, scene = st.scene;
    cambiar(st, 'cava');
    verCuerpo(s, false);
    barra(st, false);
    s.destino = haciaJugador ? sitioDeSalida(st) : { x: st.guarida.x, y: st.guarida.y, pared: null, aCasa: true };
    if (!s.destino) s.destino = { x: st.guarida.x, y: st.guarida.y, pared: null, aCasa: true };
    s.monticulo.setPosition(s.x, s.y).setVisible(true).setDepth(s.y);
  }

  function salir(st) {
    var s = st.s, scene = st.scene;
    cambiar(st, 'sale');
    s.monticulo.setVisible(false);
    s.agujero.setPosition(s.x, s.y + 6).setDepth(s.y - 2).setVisible(true).setAlpha(1);
    var pj = piesJugador(scene);
    s.ang = Math.atan2(pj.y - s.y, pj.x - s.x);
    reiniciarRastro(s);
    // El rastro, hacia DENTRO de la pared (o del agujero): el cuerpo sale de ahí.
    var dir = s.destino && s.destino.pared;
    for (var i = 0; i < s.rastro.length; i++) {
      s.rastro[i] = dir ? { x: s.x + dir.x * i * 4, y: s.y + dir.y * i * 4 }
                        : { x: s.x - Math.cos(s.ang) * i * 2, y: s.y - Math.sin(s.ang) * i * 2 };
    }
    verCuerpo(s, true);
    colocarCuerpo(st, 0);
    gritar(scene, 1);
    temblar(st, 650, 0.014);
    onda(st, s.x, s.y + 4, 1.1);
    polvo(st, s.x, s.y, 1.4);
    cascotes(st, s.x, s.y, dir);
    if (!st.vista) {
      st.vista = true;
      aviso(scene, '🐍 The Magma Serpent bursts out of the rock!', 'warning');
    }
    barra(st, true);
    if (Math.hypot(pj.x - s.x, pj.y - s.y) < 70 && !fantasma()) golpearAlJugador(st, 'serpiente_mordisco');
  }

  function hundirse(st) {
    var s = st.s;
    cambiar(st, 'hunde');
    s.agujero.setPosition(s.x, s.y + 6).setDepth(s.y - 2).setVisible(true).setAlpha(1);
    polvo(st, s.x, s.y, 1);
  }

  function escupir(st) {
    var s = st.s, scene = st.scene;
    cambiar(st, 'escupe');
    s.cabeza.setTexture('gfsp_cabeza_abierta');
    var n = s.furia ? 5 : 3;
    scene.time.delayedCall(420, function () {
      if (!st.vivo || !s.vivo || s.estado !== 'escupe') return;
      var pj = piesJugador(scene);
      var base = Math.atan2(pj.y - 30 - (s.y - 14), pj.x - s.x);
      for (var i = 0; i < n; i++) {
        var a = base + (i - (n - 1) / 2) * 0.22;
        var bx = s.x + Math.cos(s.ang) * 30, by = s.y - 14 + Math.sin(s.ang) * 30;
        var b = scene.add.image(bx, by, 'gfsp_bola').setScale(1.4).setDepth(by + 40);
        b.setBlendMode(Phaser.BlendModes.ADD);
        var e = scene.add.image(bx, by, 'gfsp_estela').setOrigin(1, 0.5).setRotation(a).setDepth(by + 39);
        e.setBlendMode(Phaser.BlendModes.ADD);
        st.bolas.push({ spr: b, estela: e, x: bx, y: by, vx: Math.cos(a) * 270, vy: Math.sin(a) * 270, hasta: scene.time.now + 2600 });
      }
      gritar(scene, 0.35);
      scene.time.delayedCall(380, function () { if (s.cabeza && s.cabeza.scene) s.cabeza.setTexture('gfsp_cabeza'); if (s.estado === 'escupe') cambiar(st, 'superficie'); });
    });
  }

  function terremoto(st) {
    var s = st.s, scene = st.scene;
    cambiar(st, 'terremoto');
    s.cabeza.setTexture('gfsp_cabeza_abierta');
    gritar(scene, 1.1);
    temblar(st, 1500, s.furia ? 0.02 : 0.015);
    aviso(scene, '💥 The ground shakes!', 'warning');
    var pj = piesJugador(scene);
    // Grietas que se abren hacia el jugador.
    for (var g = 0; g < 2; g++) {
      var gx = (s.x + pj.x) / 2 + (Math.random() - 0.5) * 120, gy = (s.y + pj.y) / 2 + (Math.random() - 0.5) * 80;
      var gr = scene.add.image(gx, gy, 'gfsp_grieta').setDepth(3).setRotation(Math.atan2(pj.y - s.y, pj.x - s.x) + (Math.random() - 0.5) * 0.6).setAlpha(0);
      scene.tweens.add({ targets: gr, alpha: 1, duration: 200, yoyo: true, hold: 2200, onComplete: function (tw, t) { t[0].destroy(); } });
    }
    // Y del techo caen piedras donde estás (con su sombra de aviso).
    var cuantas = s.furia ? 7 : 5;
    for (var i = 0; i < cuantas; i++) {
      (function (k) {
        scene.time.delayedCall(250 + k * 260, function () {
          if (!st.vivo) return;
          var p = piesJugador(scene);
          var x = p.x + (Math.random() - 0.5) * 200, y = p.y + (Math.random() - 0.5) * 140;
          if (k === 0) { x = p.x; y = p.y; }               // una, justo donde estás
          if (!libre(scene, x, y, 20)) return;
          var sombra = scene.add.image(x, y, 'gfsp_sombra').setDepth(y - 1).setScale(0.3).setAlpha(0.2);
          scene.tweens.add({ targets: sombra, scale: 1.2, alpha: 0.85, duration: 700, onComplete: function () {
            if (!st.vivo || !scene.textures.exists('piezas_mina')) { sombra.destroy(); return; }
            var roca = scene.add.image(x, y - 460, 'piezas_mina', 'pena_pequena').setOrigin(0.5, 1).setScale(0.8).setDepth(y);
            scene.tweens.add({ targets: roca, y: y, duration: 330, ease: 'Quad.easeIn', onComplete: function () {
              sombra.destroy();
              onda(st, x, y, 0.6);
              polvo(st, x, y, 0.8);
              temblar(st, 120, 0.005);
              var pj2 = piesJugador(scene);
              if (Math.hypot(pj2.x - x, pj2.y - y) < 44 && !fantasma()) golpearAlJugador(st, 'serpiente_terremoto');
              scene.tweens.add({ targets: roca, alpha: 0, delay: 1100, duration: 400, onComplete: function () { roca.destroy(); } });
            } });
          } });
        });
      })(i);
    }
    scene.time.delayedCall(1700, function () {
      if (s.cabeza && s.cabeza.scene) s.cabeza.setTexture('gfsp_cabeza');
      if (s.estado === 'terremoto') cambiar(st, 'superficie');
    });
  }

  // ─────────────────────────────────────────────────────── EL PASO
  function actualizar(st, time, delta) {
    var scene = st.scene, s = st.s;
    var p = scene.player;
    if (!s || !p || !p.active || scene._cambiandoEscena) return;
    var seg = Math.min(0.05, delta / 1000);
    var ahora = scene.time.now;
    var pj = piesJugador(scene);

    // ¿Está quieto el jugador?
    if (!st.ultimoPaso || Math.hypot(pj.x - st.ultimoPaso.x, pj.y - st.ultimoPaso.y) > 6) {
      st.ultimoPaso = { x: pj.x, y: pj.y, t: ahora };
    }
    var quieto = ahora - st.ultimoPaso.t > QUIETO_MS;

    actualizarBolas(st, seg, ahora);
    actualizarBotin(st, pj);

    if (!s.vivo) {
      if (Date.now() > s.muertaHasta && Math.hypot(pj.x - st.guarida.x, pj.y - st.guarida.y) > 900) revivir(st);
      return;
    }
    var dist = Math.hypot(pj.x - s.x, pj.y - s.y);
    var muerto = fantasma();

    switch (s.estado) {
      case 'oculta':
        if (!muerto && Math.hypot(pj.x - st.guarida.x, pj.y - st.guarida.y) < DESPIERTA) {
          gritar(scene, 0.8);
          temblar(st, 900, 0.006);
          aviso(scene, '🐍 Something huge is digging toward you…', 'warning');
          empezarACavar(st, true);
        }
        break;

      case 'cava': {
        if (s.destino && !s.destino.aCasa && (muerto || dist > OLVIDA)) {
          s.destino = { x: st.guarida.x, y: st.guarida.y, aCasa: true };
        }
        // Sigue al jugador mientras cava (el sitio de salida se recoloca).
        if (s.destino && !s.destino.aCasa && ahora - s.estadoDesde > 600 &&
            Math.hypot(s.destino.x - pj.x, s.destino.y - pj.y) > 320) {
          var nuevo = sitioDeSalida(st);
          if (nuevo) s.destino = nuevo;
        }
        var d = s.destino;
        var ddx = d.x - s.x, ddy = d.y - s.y, dd = Math.hypot(ddx, ddy);
        if (dd < 12) {
          if (d.aCasa) { s.monticulo.setVisible(false); cambiar(st, 'oculta'); }
          else salir(st);
          break;
        }
        // Bajo tierra NO hay paredes: pasa de pared a pared.
        var v = VEL_CAVA * (s.furia ? 1.2 : 1);
        s.x += ddx / dd * Math.min(dd, v * seg);
        s.y += ddy / dd * Math.min(dd, v * seg);
        s.monticulo.setPosition(s.x + Math.sin(ahora / 70) * 2, s.y).setDepth(s.y).setVisible(true);
        if (ahora > s.polvoEn) { s.polvoEn = ahora + 180; polvo(st, s.x, s.y, 0.55); }
        if (dist < 420 && ahora > (st.rumorEn || 0)) { st.rumorEn = ahora + 500; temblar(st, 300, 0.0025); }
        break;
      }

      case 'sale': {
        var t = Math.min(1, (ahora - s.estadoDesde) / 800);
        // El cuerpo se desenrolla: la cabeza avanza un poco hacia fuera.
        if (t < 1) {
          s.x += Math.cos(s.ang) * 60 * seg; s.y += Math.sin(s.ang) * 60 * seg;
          apuntarRastro(s);
        }
        colocarCuerpo(st, t);
        s.agujero.setAlpha(1 - t * 0.4);
        if (t >= 1) {
          cambiar(st, 'superficie');
          s.superficieHasta = ahora + SUPERFICIE_MS[0] + Math.random() * (SUPERFICIE_MS[1] - SUPERFICIE_MS[0]) * (s.furia ? 0.7 : 1);
          s.siguienteAtaque = ahora + 700;
          scene.tweens.add({ targets: s.agujero, alpha: 0, duration: 1200, onComplete: function () { s.agujero.setVisible(false); } });
        }
        break;
      }

      case 'superficie':
      case 'repta': {
        if (muerto || dist > OLVIDA) { hundirse(st); break; }
        // Mira siempre hacia el jugador.
        var objetivo = Math.atan2(pj.y - s.y, pj.x - s.x);
        var dif = Math.atan2(Math.sin(objetivo - s.ang), Math.cos(objetivo - s.ang));
        s.ang += dif * Math.min(1, seg * 4);
        if (dist < 64 && ahora - s.ultimoMordisco > 1100) {
          s.ultimoMordisco = ahora;
          s.cabeza.setTexture('gfsp_cabeza_abierta');
          scene.time.delayedCall(220, function () { if (s.cabeza && s.cabeza.scene) s.cabeza.setTexture('gfsp_cabeza'); });
          golpearAlJugador(st, 'serpiente_mordisco');
        }
        if (quieto || s.estado === 'repta') {
          // Te quedaste quieto: viene reptando (con su ondulación).
          if (s.estado !== 'repta') cambiar(st, 'repta');
          if (!quieto && ahora - s.estadoDesde > 1500) { cambiar(st, 'superficie'); break; }
          var onda2 = Math.sin(ahora / 160) * 0.6;
          var mv = s.ang + onda2;
          var vx = Math.cos(mv) * VEL_REPTA, vy = Math.sin(mv) * VEL_REPTA;
          var nx = s.x + vx * seg, ny = s.y + vy * seg;
          if (dist > 50) {
            if (libre(scene, nx, ny, 34)) { s.x = nx; s.y = ny; }
            else if (ahora - s.estadoDesde > 800) { hundirse(st); break; }   // una pared: por debajo
          }
          apuntarRastro(s);
        } else if (ahora > s.siguienteAtaque) {
          s.siguienteAtaque = ahora + (s.furia ? 1700 : 2400) + Math.random() * 900;
          if (Math.random() < (s.furia ? 0.35 : 0.3)) terremoto(st); else escupir(st);
        }
        colocarCuerpo(st, 1);
        if (ahora > s.superficieHasta && s.estado === 'superficie') hundirse(st);
        break;
      }

      case 'escupe':
      case 'terremoto':
        colocarCuerpo(st, 1);
        break;

      case 'hunde': {
        var th = Math.min(1, (ahora - s.estadoDesde) / 650);
        colocarCuerpo(st, 1 - th);
        if (th >= 1) {
          verCuerpo(s, false);
          scene.tweens.add({ targets: s.agujero, alpha: 0, duration: 900, onComplete: function () { s.agujero.setVisible(false); } });
          empezarACavar(st, !muerto && dist < OLVIDA);
        }
        break;
      }
    }
    barraTic(st);
  }

  function barraTic(st) {
    if (!st.barra || st.barra.style.display === 'none') return;
    var v = st.barra.querySelector('.gfs-vida');
    if (v) v.style.width = Math.max(0, st.s.vida / st.s.max * 100).toFixed(1) + '%';
  }

  function actualizarBolas(st, seg, ahora) {
    var scene = st.scene;
    for (var i = st.bolas.length - 1; i >= 0; i--) {
      var b = st.bolas[i];
      b.x += b.vx * seg; b.y += b.vy * seg;
      b.spr.setPosition(b.x, b.y).setRotation(b.spr.rotation + seg * 6).setDepth(b.y + 40);
      b.estela.setPosition(b.x, b.y).setDepth(b.y + 39);
      var pj = piesJugador(scene);
      var tocaJugador = Math.hypot(pj.x - b.x, (pj.y - 40) - b.y) < 26;
      var choca = !libre(scene, b.x, b.y + 30, 10);
      if (tocaJugador || choca || ahora > b.hasta) {
        if (tocaJugador && !fantasma()) golpearAlJugador(st, 'serpiente_fuego');
        onda(st, b.x, b.y, 0.45);
        b.spr.destroy(); b.estela.destroy();
        st.bolas.splice(i, 1);
      }
    }
  }

  // ─────────────────────────────────────────────────────── LA ESPADA
  function recibirTajo(st, scene, cx, cy, dir, alcance, dano) {
    var out = { tocados: 0, muertos: 0, puntos: [] };
    var s = st.s;
    if (!st.vivo || !s || !s.vivo || scene !== st.scene) return out;
    if (['superficie', 'repta', 'escupe', 'terremoto', 'sale'].indexOf(s.estado) < 0) return out;
    var ang = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir] || 0;
    var partes = [{ o: s.cabeza, k: 1.6 }].concat(s.anillos.map(function (a) { return { o: a, k: 1 }; }));
    var mejor = null;
    partes.forEach(function (pt) {
      var dx = pt.o.x - cx, dy = (pt.o.y + 10) - cy, d = Math.hypot(dx, dy);
      if (d > alcance + 24) return;
      var da = Math.atan2(dy, dx) - ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > 1.35 && d > 28) return;
      if (!mejor || pt.k > mejor.k || d < mejor.d) mejor = { o: pt.o, k: pt.k, d: d };
    });
    if (!mejor) return out;
    s.vida -= dano * mejor.k;
    s.heridaEn = scene.time.now;
    out.tocados = 1;
    out.puntos.push({ x: mejor.o.x, y: mejor.o.y });
    mejor.o.setTintFill(0xffffff);
    scene.time.delayedCall(70, function () { if (mejor.o.scene) mejor.o.clearTint(); });
    if (!s.furia && s.vida < s.max * 0.5) {
      s.furia = true;
      gritar(scene, 1.2);
      temblar(st, 700, 0.012);
      aviso(scene, '🔥 The Magma Serpent is enraged!', 'warning');
      var nom = st.barra && st.barra.querySelector('.gfs-nombre');
      if (nom) nom.textContent = '🔥 The Magma Serpent (enraged)';
    }
    if (s.vida <= 0) { out.muertos = 1; morir(st); }
    return out;
  }

  // ─────────────────────────────────────────────────────── LA MUERTE Y EL BOTÍN
  function morir(st) {
    var s = st.s, scene = st.scene;
    s.vivo = false;
    s.muertaHasta = Date.now() + VUELVE_MS;
    cambiar(st, 'muerta');
    barra(st, false);
    gritar(scene, 1.3);
    temblar(st, 1200, 0.016);
    var hx = s.x, hy = s.y;
    // Revienta anillo a anillo, de la cola a la cabeza.
    var piezas = s.anillos.slice().reverse().concat([s.cabeza]);
    piezas.forEach(function (o, i) {
      scene.time.delayedCall(i * 70, function () {
        if (!o.scene) return;
        onda(st, o.x, o.y, 0.5);
        polvo(st, o.x, o.y, 0.7);
        var br = scene.add.image(o.x, o.y, 'gfsp_brillo').setDepth(o.y + 5).setScale(1.2);
        br.setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({ targets: br, scale: 3, alpha: 0, duration: 420, onComplete: function () { br.destroy(); } });
        o.setVisible(false);
      });
    });
    s.sombras.forEach(function (o) { o.setVisible(false); });
    s.sombraCabeza.setVisible(false);
    scene.time.delayedCall(piezas.length * 70 + 150, function () {
      try { scene.cameras.main.flash(500, 255, 170, 90); } catch (e) {}
      cobrar(st, hx, hy);
    });
  }

  function cobrar(st, x, y) {
    var scene = st.scene;
    api('/api/monstruos/derrotado', { tipo: 'serpiente_mina' }).then(function (r) {
      if (!st.vivo) return;
      var d = (r && r.datos) || {};
      if (!r || !r.ok || !d.ok) {
        if (d.error === 'demasiado_pronto') aviso(scene, 'You defeated the Magma Serpent! (Its treasure was already claimed — come back later.)', 'info');
        else aviso(scene, 'You defeated the Magma Serpent!', 'success');
        return;
      }
      aviso(scene, '🏆 You defeated the Magma Serpent! +' + d.exp + ' XP', 'success');
      var total = Number(d.expTotal);
      if (Number.isFinite(total) && total > (Number(scene.nivel_exp) || 0)) {
        scene.nivel_exp = total;
        try { if (scene._nivelDesdeExp) scene._nivelDesdeExp(); } catch (e) {}
      }
      (d.botin || []).forEach(function (b, i) {
        var a = (i / Math.max(1, d.botin.length)) * Math.PI * 2 + Math.random() * 0.5;
        var tx = x + Math.cos(a) * (40 + Math.random() * 30), ty = y + Math.sin(a) * (30 + Math.random() * 20);
        if (!libre(scene, tx, ty, 16)) { tx = x; ty = y; }
        soltarMonton(st, b, x, y, tx, ty, Number(d.caducaMs) || 600000);
      });
    }).catch(function () {});
  }

  function imagenDe(scene, itemId) {
    var def = scene.ItemDefinitions && scene.ItemDefinitions[itemId];
    return def && def.src ? def.src : null;
  }

  function soltarMonton(st, b, x0, y0, x, y, caducaMs) {
    var scene = st.scene;
    var clave = 'gfsp_item_' + b.itemId;
    var ponerlo = function () {
      if (!st.vivo) return;
      var halo = scene.add.image(x, y, 'gfsp_brillo').setDepth(y - 1).setScale(1.3).setAlpha(0.8);
      halo.setBlendMode(Phaser.BlendModes.ADD);
      var spr = scene.add.image(x0, y0, scene.textures.exists(clave) ? clave : 'gfsp_brillo').setOrigin(0.5, 1).setScale(2).setDepth(y);
      scene.tweens.addCounter({ from: 0, to: 1, duration: 600, ease: 'Quad.easeOut', onUpdate: function (tw) {
        var t = tw.getValue();
        spr.x = x0 + (x - x0) * t; spr.y = y0 + (y - y0) * t - Math.sin(t * Math.PI) * 50;
      } });
      var m = { id: b.id, itemId: b.itemId, cantidad: b.cantidad, x: x, y: y, spr: spr, halo: halo, hasta: Date.now() + caducaMs, recogiendo: false };
      m.flota = scene.tweens.add({ targets: halo, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
      st.botin.push(m);
    };
    if (scene.textures.exists(clave)) { ponerlo(); return; }
    var src = imagenDe(scene, b.itemId);
    if (!src) { ponerlo(); return; }
    scene.load.image(clave, src);
    scene.load.once('complete', ponerlo);
    scene.load.start();
  }

  function quitarMonton(st, m) {
    try { if (m.flota) m.flota.stop(); } catch (e) {}
    [m.spr, m.halo].forEach(function (o) { try { if (o && o.scene) o.destroy(); } catch (e) {} });
    var i = st.botin.indexOf(m);
    if (i >= 0) st.botin.splice(i, 1);
  }

  function actualizarBotin(st, pj) {
    if (!st.botin.length) return;
    var scene = st.scene;
    for (var i = st.botin.length - 1; i >= 0; i--) {
      var m = st.botin[i];
      if (Date.now() > m.hasta) { quitarMonton(st, m); continue; }
      if (m.recogiendo || Math.hypot(pj.x - m.x, pj.y - m.y) > 38) continue;
      m.recogiendo = true;
      (function (mm) {
        api('/api/monstruos/botin/recoger', { id: mm.id }).then(function (r) {
          var d = (r && r.datos) || {};
          if (d.ok && d.factura) {
            meterFactura(scene, d.itemId, d.factura);
            var nombre = (scene._getFruitDisplayNameEN && scene._getFruitDisplayNameEN(d.itemId)) || d.itemId;
            aviso(scene, '+' + d.cantidad + ' ' + nombre, 'success');
            try { scene.playSFX && scene.playSFX('item_pickup'); } catch (e) {}
            if (st.vivo) scene.tweens.add({ targets: mm.spr, y: mm.y - 40, alpha: 0, duration: 300, onComplete: function () { quitarMonton(st, mm); } });
          } else if (d.motivo === 'no_existe' || d.motivo === 'caducado') {
            quitarMonton(st, mm);
          } else {
            mm.recogiendo = false;                 // la cadena: se reintenta al volver a pisarlo
            if (d.message) aviso(scene, d.message, 'warning');
          }
        }).catch(function () { mm.recogiendo = false; });
      })(m);
    }
  }

  /** Mete la factura en la bolsa (lo mismo que hace la pesca). */
  function meterFactura(scene, itemId, f) {
    var S = scene.STATE;
    if (!S || !f) return;
    var id = Number(f.invoiceId), cantidad = Math.max(1, Number(f.cantidad) || 1);
    var listas = [S.slots || [], S.quickSlots || []];
    for (var a = 0; a < listas.length; a++) {
      for (var i = 0; i < listas[a].length; i++) {
        if (listas[a][i] && Number(listas[a][i].idx) === id) {
          listas[a][i].count = cantidad; listas[a][i].id = itemId; listas[a][i].idm = f.manualId;
          try { scene.renderAllSlots(); } catch (e) {}
          try { scene.queuedAction && scene.queuedAction({ type: 'forSpam2' }); } catch (e) {}
          return;
        }
      }
    }
    var nuevo = { id: itemId, idx: id, idm: f.manualId, count: cantidad };
    var g = S.ghostSlots || {};
    var hueco = function (lista, fantasmas) {
      for (var j = 0; j < lista.length; j++) if (lista[j] === null && !(fantasmas && fantasmas[j])) return j;
      return -1;
    };
    var k = hueco(S.slots, g.inv);
    if (k >= 0) S.slots[k] = nuevo;
    else if ((k = hueco(S.quickSlots, g.quick)) >= 0) S.quickSlots[k] = nuevo;
    else aviso(scene, 'Your bag is full: it will appear when you come back.', 'warning');
    try { scene.renderAllSlots(); } catch (e) {}
    try { scene.queuedAction && scene.queuedAction({ type: 'forSpam2' }); } catch (e) {}
  }

  function revivir(st) {
    var s = st.s;
    s.vida = s.max; s.vivo = true; s.furia = false;
    s.x = st.guarida.x; s.y = st.guarida.y;
    st.vista = false;
    var nom = st.barra && st.barra.querySelector('.gfs-nombre');
    if (nom) nom.textContent = '🐍 The Magma Serpent';
    s.anillos.concat([s.cabeza]).forEach(function (o) { o.clearTint(); });
    cambiar(st, 'oculta');
  }

  // ─────────────────────────────────────────────────────── LAS LUCES
  function luces(st, luz) {
    var s = st.s;
    if (!s) return;
    for (var i = 0; i < st.bolas.length; i++) luz(st.bolas[i].x, st.bolas[i].y, 95, 0xffb060, 0.95);
    for (var j = 0; j < st.botin.length; j++) luz(st.botin[j].x, st.botin[j].y - 10, 40, 0xffe6a0, 0.7);
    if (!s.vivo) return;
    if (s.estado === 'cava') { luz(s.x, s.y, 48, 0xff8a40, 0.45); return; }
    if (s.estado === 'oculta') return;
    luz(s.cabeza.x, s.cabeza.y, s.furia ? 130 : 105, s.furia ? 0xff7a50 : 0xffa060, 0.85);
    for (var k = 2; k < ANILLOS; k += 4) luz(s.anillos[k].x, s.anillos[k].y, 60, 0xff8a40, 0.55);
  }

  // ─────────────────────────────────────────────────────── MONTAJE
  function montar(scene) {
    if (!scene || !scene.add || !scene.map || scene.__gfSerpiente) return;
    var st = { scene: scene, vivo: true, bolas: [], botin: [], barra: null, ultimoGolpe: 0, vista: false };
    scene.__gfSerpiente = st;
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    try { texturas(scene); } catch (e) { console.warn('🐍 texturas:', e); return; }
    // La guarida se elige un poco después: así ya está la del guardián zombi.
    scene.time.delayedCall(1200, function () {
      if (!st.vivo || scene.__gfSerpiente !== st) return;
      st.guarida = elegirGuarida(scene);
      if (!st.guarida) { log('sin sitio para la guarida'); return; }
      crear(st);
      st.onUpdate = function (t, d) { if (st.vivo) actualizar(st, t, d); };
      scene.events.on('update', st.onUpdate);
      st.objetivo = function (sc, cx, cy, dir, alcance, dano) { return recibirTajo(st, sc, cx, cy, dir, alcance, dano); };
      if (window.GFEspada && window.GFEspada.agregarObjetivo) window.GFEspada.agregarObjetivo(st.objetivo);
      st.luces = function (luz) { luces(st, luz); };
      if (!Array.isArray(scene._lucesExtras)) scene._lucesExtras = [];
      scene._lucesExtras.push(st.luces);
      log('guarida en', Math.round(st.guarida.x), Math.round(st.guarida.y));
    });
  }

  function desmontar(scene) {
    var st = scene && scene.__gfSerpiente;
    if (!st) return;
    st.vivo = false;
    if (st.onUpdate) scene.events.off('update', st.onUpdate);
    scene.events.off('shutdown', st.onApagar);
    scene.events.off('destroy', st.onApagar);
    if (st.objetivo && window.GFEspada && window.GFEspada.quitarObjetivo) window.GFEspada.quitarObjetivo(st.objetivo);
    if (Array.isArray(scene._lucesExtras)) {
      var i = scene._lucesExtras.indexOf(st.luces);
      if (i >= 0) scene._lucesExtras.splice(i, 1);
    }
    if (st.barra && st.barra.parentNode) st.barra.parentNode.removeChild(st.barra);
    st.barra = null;
    st.bolas.forEach(function (b) { try { b.spr.destroy(); b.estela.destroy(); } catch (e) {} });
    st.bolas.length = 0;
    st.botin.slice().forEach(function (m) { quitarMonton(st, m); });
    var s = st.s;
    if (s) {
      s.anillos.concat(s.sombras, [s.cabeza, s.sombraCabeza, s.monticulo, s.agujero]).forEach(function (o) {
        try { if (o && o.scene) o.destroy(); } catch (e) {}
      });
    }
    st.s = null;
    scene.__gfSerpiente = null;
  }

  window.GFMinaSerpiente = {
    montar: montar,
    desmontar: desmontar,
    _interno: { estado: function (s) { return s && s.__gfSerpiente; }, gritar: gritar }
  };
})();
