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
 *   anillos se ve por delante de unos y por detrás de otros (2.5D). Desde
 *   2026-10-12 la cabeza y los anillos son un MODELO 3D fotografiado en 16
 *   direcciones (atlas gfm_serpiente, tools/gf_serpiente3d.py): cuernos,
 *   cejas en cresta, ojos de brasa, escudo y púa en cada anillo y la línea de
 *   magma de los costados, con la luz siempre arriba a la izquierda. El
 *   terreno (montículo, agujero, grieta) y la bola son PNG sueltos; aquí solo
 *   quedan los brillos y el polvo, que son luz, no monstruo.
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
 * LA MISMA PARA TODOS (2026-10-11, gf-mobs-red.js): uno de la sala piensa por
 * ella (va al jugador más cercano, sea quien sea) y anuncia cada cosa que
 * hace; los demás la ven donde él dice. Cada uno mira si le muerde, le quema
 * o le cae una piedra a ÉL, y el botín es solo para quien la mata.
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
  /* (2026-10-19) Cava más despacio: el montículo se ve avanzar (antes, a 240
     px/s atravesando paredes, parecía que se teletransportaba). */
  var VEL_CAVA = 175, VEL_REPTA = 92;
  var DESPIERTA = 760;                 // px a la guarida a los que despierta
  var OLVIDA = 1300;
  var SUPERFICIE_MS = [6500, 9000];
  var VUELVE_MS = 20 * 60 * 1000;
  var QUIETO_MS = 2000;
  // (2026-10-12) "La serpiente no es 2.5D ni tiene gráficos altamente
  // detallados": cabeza y anillos son un modelo 3D fotografiado en DIECISÉIS
  // direcciones (atlas gfm_serpiente, tools/gf_serpiente3d.py) a la densidad
  // del personaje (x2). Ya no se gira un dibujo plano (giraba también su luz):
  // se elige la foto de la dirección y solo se gira lo que falta (±11°).
  var ESC_ANILLO = 2, ESC_CABEZA = 2.4;
  /* (2026-10-19) EL CUERPO CONTINUO. "La serpiente se ve muy falsa": eran
     dieciséis bolitas iguales que, yendo en vertical, se apilaban como un
     poste. Ahora el cuerpo es una tira con textura (Phaser.Rope, WebGL) que
     se curva por el rastro: escamas en bandas, cresta de placas, la costura
     de magma de los costados y la cola afilada, con su resplandor y su
     sombra. En tres tramos, cada uno con su profundidad (2.5D). Con el
     renderizador Canvas (sin Rope) se siguen viendo los anillos. Los anillos
     siguen colocándose (invisibles): son los que mira la espada. */
  var TRAMOS = 3, PUNTOS_TRAMO = 14;
  var DIRS = 16, PASO_DIR = Math.PI * 2 / DIRS;
  var PIEZAS_PNG = ['gfsp_monticulo', 'gfsp_agujero', 'gfsp_grieta', 'gfsp_bola'];

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
    if (!lineal) {
      var ctx = c.getContext(), pixels = ctx.getImageData(0,0,w,h);
      for (var py=0;py<h;py+=2) for(var px=0;px<w;px+=2) {
        var base = (py*w+px)*4;
        for(var yy=py;yy<Math.min(h,py+2);yy++) for(var xx=px;xx<Math.min(w,px+2);xx++) for(var ch=0;ch<4;ch++) pixels.data[(yy*w+xx)*4+ch] = ch===3 ? (pixels.data[base+ch]>100?255:0) : Math.round(pixels.data[base+ch]/12)*12;
      }
      ctx.putImageData(pixels,0,0);
    }
    c.refresh();
    if (!lineal) c.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  /**
   * Las piezas del cuerpo y la bola de fuego se CARGAN (PNG, ver
   * gf-monstruos-arte.js); aquí solo se pintan la estela, la sombra, el polvo,
   * la onda y el brillo. Devuelve la promesa de la carga.
   */
  function texturas(scene) {
    lienzo(scene, 'gfsp_estela', 40, 16, function (x, w, h) {
      var g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,90,20,0)'); g.addColorStop(1, 'rgba(255,170,60,0.8)');
      x.fillStyle = g;
      x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, 2); x.lineTo(w, h - 2); x.closePath(); x.fill();
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
    texturasNuevas(scene);
    return window.GFMonstruosArte ? window.GFMonstruosArte.cargar(scene, ['serpiente'], PIEZAS_PNG) : Promise.resolve(false);
  }

  /* (2026-10-19) El cuerpo (vista desde arriba, cola a la izquierda y cuello
     a la derecha), su brasa, su sombra y las piezas de los poderes. Todo en
     bandas y líneas: nada de motas ni puntos. */
  function texturasNuevas(scene) {
    var L = 540, H = 48;
    if (!scene.textures.exists('gfsp_cuerpo_0')) {
      var cv = document.createElement('canvas');
      cv.width = L; cv.height = H;
      var x = cv.getContext('2d');
      var ancho = function (u) { return 4 + 18 * Math.pow(u, 0.5); };         // medio ancho: cola fina, cuello ancho
      var cy = H / 2;
      // La silueta, con la luz en el lomo (simétrica: la tira gira con el bicho).
      x.beginPath();
      for (var i = 0; i <= L; i += 2) { var w = ancho(i / L); x.lineTo(i, cy - w); }
      for (var j = L; j >= 0; j -= 2) { var w2 = ancho(j / L); x.lineTo(j, cy + w2); }
      x.closePath();
      var g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2a1824'); g.addColorStop(0.28, '#4a2c40'); g.addColorStop(0.5, '#6e4262');
      g.addColorStop(0.72, '#4a2c40'); g.addColorStop(1, '#2a1824');
      x.fillStyle = g; x.fill();
      x.save(); x.clip();
      // Bandas de escamas: arcos finos y oscuros cada 9 px, hacia la cabeza.
      x.strokeStyle = 'rgba(24,10,20,0.55)'; x.lineWidth = 1.4;
      for (var b = 6; b < L; b += 9) {
        var wb = ancho(b / L);
        x.beginPath(); x.moveTo(b - 3, cy - wb); x.quadraticCurveTo(b + 4, cy, b - 3, cy + wb); x.stroke();
      }
      // Brillo de cada escama (una línea clara junto a su arco).
      x.strokeStyle = 'rgba(160,110,150,0.28)'; x.lineWidth = 1;
      for (var b2 = 8; b2 < L; b2 += 9) {
        var wb2 = ancho(b2 / L) * 0.7;
        x.beginPath(); x.moveTo(b2 - 2, cy - wb2); x.quadraticCurveTo(b2 + 4, cy, b2 - 2, cy + wb2); x.stroke();
      }
      // La costura de magma de los costados, con su halo.
      [['rgba(255,110,40,0.3)', 5], ['#e8742e', 2], ['#ffc46a', 0.8]].forEach(function (c) {
        x.strokeStyle = c[0]; x.lineWidth = c[1];
        [-1, 1].forEach(function (lado) {
          x.beginPath();
          for (var k = 0; k <= L; k += 3) { var wk = ancho(k / L); x.lineTo(k, cy + lado * (wk - 3.2)); }
          x.stroke();
        });
      });
      // La cresta: un lomo continuo con placas anchas y bajas que se
      // solapan (tono sobre tono, sin el diente de sierra de antes).
      var gl = x.createLinearGradient(0, cy - 6, 0, cy + 6);
      gl.addColorStop(0, 'rgba(30,14,24,0)'); gl.addColorStop(0.5, 'rgba(30,14,24,0.55)'); gl.addColorStop(1, 'rgba(30,14,24,0)');
      x.fillStyle = gl; x.fillRect(0, cy - 6, L, 12);
      for (var c2 = 24; c2 < L - 10; c2 += 22) {
        var wc = Math.max(2.5, ancho(c2 / L) * 0.48);
        x.fillStyle = 'rgba(44,22,36,0.85)';
        x.beginPath(); x.moveTo(c2 - 10, cy - wc); x.quadraticCurveTo(c2 + 6, cy - wc * 0.4, c2 + 10, cy);
        x.quadraticCurveTo(c2 + 6, cy + wc * 0.4, c2 - 10, cy + wc); x.quadraticCurveTo(c2 - 4, cy, c2 - 10, cy - wc); x.fill();
        x.strokeStyle = 'rgba(176,128,160,0.4)'; x.lineWidth = 1;
        x.beginPath(); x.moveTo(c2 - 10, cy - wc); x.quadraticCurveTo(c2 + 6, cy - wc * 0.4, c2 + 10, cy); x.stroke();
      }
      x.restore();
      // El contorno.
      x.strokeStyle = '#140a10'; x.lineWidth = 1.6;
      x.beginPath();
      for (var o = 0; o <= L; o += 2) { var wo = ancho(o / L); x.lineTo(o, cy - wo); }
      for (var o2 = L; o2 >= 0; o2 -= 2) { var wo2 = ancho(o2 / L); x.lineTo(o2, cy + wo2); }
      x.closePath(); x.stroke();
      // Tres tramos (cola, medio, cuello), un poco solapados.
      for (var t = 0; t < TRAMOS; t++) {
        var x0 = Math.round(t * L / TRAMOS), x1 = Math.round((t + 1) * L / TRAMOS);
        var tex = scene.textures.createCanvas('gfsp_cuerpo_' + t, x1 - x0, H);
        tex.getContext().drawImage(cv, x0, 0, x1 - x0, H, 0, 0, x1 - x0, H);
        tex.refresh();
      }
      cv.width = cv.height = 0;
    }
    lienzo(scene, 'gfsp_brasa', 64, 64, function (x, w, h) {
      var g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,90,20,0)'); g.addColorStop(0.35, 'rgba(255,120,40,0.45)');
      g.addColorStop(0.5, 'rgba(255,170,70,0.6)'); g.addColorStop(0.65, 'rgba(255,120,40,0.45)'); g.addColorStop(1, 'rgba(255,90,20,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    }, true);
    lienzo(scene, 'gfsp_sombra_cuerpo', 64, 32, function (x, w, h) {
      var g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    }, true);
    // La llama: tres gotas en capas (rojo, naranja, amarillo).
    lienzo(scene, 'gfsp_llama', 40, 56, function (x, w, h) {
      [['#ff4a12', 1], ['#ff9a2e', 0.72], ['#fff0a8', 0.42]].forEach(function (c) {
        var k = c[1], cx = w / 2, base = h - 2;
        x.fillStyle = c[0];
        x.beginPath(); x.moveTo(cx - 17 * k, base);
        x.quadraticCurveTo(cx - 19 * k, base - 26 * k, cx, base - (h - 4) * k);
        x.quadraticCurveTo(cx + 19 * k, base - 26 * k, cx + 17 * k, base);
        x.closePath(); x.fill();
      });
    }, true);
    // La chispa: una raya que se apaga (sin puntos).
    lienzo(scene, 'gfsp_chispa', 3, 14, function (x, w, h) {
      var g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,245,190,1)'); g.addColorStop(1, 'rgba(255,110,30,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    }, true);
    // El aviso del géiser: un anillo que late en el suelo.
    lienzo(scene, 'gfsp_aviso', 96, 48, function (x, w, h) {
      x.save(); x.scale(1, h / w);
      var cyy = (h / 2) * (w / h);
      var g = x.createRadialGradient(w / 2, cyy, w * 0.18, w / 2, cyy, w / 2);
      g.addColorStop(0, 'rgba(255,120,40,0.05)'); g.addColorStop(0.7, 'rgba(255,140,50,0.5)'); g.addColorStop(0.86, 'rgba(255,220,120,0.9)'); g.addColorStop(1, 'rgba(255,120,40,0)');
      x.fillStyle = g; x.beginPath(); x.arc(w / 2, cyy, w / 2, 0, Math.PI * 2); x.fill(); x.restore();
    }, true);
    // La quemadura que deja en el suelo: un óvalo oscuro y blando.
    lienzo(scene, 'gfsp_quemado', 80, 40, function (x, w, h) {
      x.save(); x.scale(1, h / w);
      var cyy = (h / 2) * (w / h);
      var g = x.createRadialGradient(w / 2, cyy, 2, w / 2, cyy, w / 2);
      g.addColorStop(0, 'rgba(20,8,4,0.7)'); g.addColorStop(0.55, 'rgba(60,20,8,0.45)'); g.addColorStop(1, 'rgba(60,20,8,0)');
      x.fillStyle = g; x.beginPath(); x.arc(w / 2, cyy, w / 2, 0, Math.PI * 2); x.fill(); x.restore();
    }, true);
  }

  // ─────────────────────────────────────────────────────── LOS SONIDOS NUEVOS
  /* (2026-10-19) Sintetizados como el grito: el bufido del aliento de fuego
     (ruido que barre de grave a agudo) y el estallido del géiser (golpe
     grave y crepitar). */
  function sonido(scene, tipo, fuerza) {
    try {
      var snd = scene.sound, ctx = snd && snd.context;
      if (!ctx || snd.mute || typeof ctx.createBufferSource !== 'function') return;
      var vol = (scene.audioState && Number.isFinite(scene.audioState.sfxVolumeApplied)) ? scene.audioState.sfxVolumeApplied : 0.5;
      vol *= (Number.isFinite(snd.volume) ? snd.volume : 1) * (fuerza || 1);
      if (vol <= 0.001) return;
      var t0 = ctx.currentTime, dur = tipo === 'aliento' ? 1.5 : 0.9;
      var n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      var src = ctx.createBufferSource(); src.buffer = buf;
      var f = ctx.createBiquadFilter(); f.type = tipo === 'aliento' ? 'bandpass' : 'lowpass';
      var gn = ctx.createGain();
      var nodos = [src, f, gn], fuentes = [src];
      if (tipo === 'aliento') {
        f.frequency.setValueAtTime(300, t0); f.frequency.exponentialRampToValueAtTime(1800, t0 + 0.5);
        f.frequency.exponentialRampToValueAtTime(500, t0 + dur); f.Q.value = 0.6;
        gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(0.32 * vol, t0 + 0.12);
        gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      } else {
        f.frequency.setValueAtTime(1400, t0); f.frequency.exponentialRampToValueAtTime(120, t0 + dur);
        gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(0.4 * vol, t0 + 0.02);
        gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        var o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(90, t0); o.frequency.exponentialRampToValueAtTime(36, t0 + 0.5);
        var go = ctx.createGain(); go.gain.setValueAtTime(0.0001, t0);
        go.gain.exponentialRampToValueAtTime(0.5 * vol, t0 + 0.02); go.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
        o.connect(go); go.connect(ctx.destination); o.start(t0); o.stop(t0 + 0.6);
        nodos.push(o, go); fuentes.push(o);
      }
      src.connect(f); f.connect(gn); gn.connect(ctx.destination);
      var voces = scene.__gfSerpSounds || (scene.__gfSerpSounds = []), voz = { nodes: nodos, sources: fuentes };
      voces.push(voz);
      src.onended = function () { nodos.forEach(function (nd) { try { nd.disconnect(); } catch (e) {} }); var k = voces.indexOf(voz); if (k >= 0) voces.splice(k, 1); };
      src.start(t0); src.stop(t0 + dur);
    } catch (e) { /* sin sonido, sin drama */ }
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
      var nodes=[osc,lfo,ruido,lp,g,lfoG,bp,gn], voices=scene.__gfSerpSounds||(scene.__gfSerpSounds=[]);
      var voice={nodes:nodes,sources:[osc,lfo,ruido]};voices.push(voice);
      osc.onended=function(){nodes.forEach(function(node){try{node.disconnect();}catch(e){}});var at=voices.indexOf(voice);if(at>=0)voices.splice(at,1);};
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

  /* (2026-10-19) "Que no pueda pasar colisiones." Avanza `dist` hacia `ang`
     y, si choca, prueba a rodear (primero hacia el lado por el que ya iba
     rodeando, para no dudar). Devuelve el ángulo usado, o null si no cabe. */
  var GIROS_RODEO = [0, 0.4, 0.8, 1.2, 1.65, 2.1, 2.6];
  function avanzar(scene, s, ang, dist, ancho) {
    var lado = s.rodeo || 1;
    for (var i = 0; i < GIROS_RODEO.length; i++) {
      var g = GIROS_RODEO[i];
      var opciones = g ? [ang + g * lado, ang - g * lado] : [ang];
      for (var k = 0; k < opciones.length; k++) {
        var a = opciones[k];
        var nx = s.x + Math.cos(a) * dist, ny = s.y + Math.sin(a) * dist;
        if (libre(scene, nx, ny, ancho)) {
          if (g) s.rodeo = k === 0 ? lado : -lado;
          s.x = nx; s.y = ny;
          return a;
        }
      }
    }
    return null;
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
      muertaHasta: 0, ultimoMordisco: 0, gritoEn: 0, polvoEn: 0, heridaEn: 0,
      cargaEn: 0, cargaHasta: 0, cargaAng: 0, objX: st.guarida.x, objY: st.guarida.y, objAng: 0
    };
    for (var i = 0; i < ANILLOS; i++) {
      var k = 1 - i / ANILLOS * 0.55;           // la cola, más fina
      s.anillos.push(scene.add.image(s.x, s.y, 'gfm_serpiente', 'anillo_0').setScale(k * ESC_ANILLO).setVisible(false));
      s.sombras.push(scene.add.image(s.x, s.y, 'gfsp_sombra').setScale(k * 1.1).setVisible(false).setAlpha(0.8));
    }
    // (2026-10-19) El cuerpo continuo (WebGL): tres tramos con su brasa y su sombra.
    s.usaRope = !!(scene.add.rope && scene.sys.game.renderer && window.Phaser &&
                   scene.sys.game.renderer.type === Phaser.WEBGL && scene.textures.exists('gfsp_cuerpo_0'));
    s.ropes = []; s.brasas = []; s.sombrasRope = [];
    if (s.usaRope) {
      var ceros = [];
      for (var q = 0; q < PUNTOS_TRAMO; q++) ceros.push({ x: q, y: 0 });
      try {
        for (var tr = 0; tr < TRAMOS; tr++) {
          s.sombrasRope.push(scene.add.rope(0, 0, 'gfsp_sombra_cuerpo', null, ceros.slice(), true).setVisible(false).setAlpha(0.42));
          var br = scene.add.rope(0, 0, 'gfsp_brasa', null, ceros.slice(), true).setVisible(false).setAlpha(0.5);
          br.setBlendMode(Phaser.BlendModes.ADD);
          s.brasas.push(br);
          s.ropes.push(scene.add.rope(0, 0, 'gfsp_cuerpo_' + tr, null, ceros.slice(), true).setVisible(false));
        }
      } catch (e) {
        console.warn('🐍 sin cuerpo continuo:', e);
        s.ropes.concat(s.brasas, s.sombrasRope).forEach(function (o) { try { o.destroy(); } catch (e2) {} });
        s.ropes = []; s.brasas = []; s.sombrasRope = []; s.usaRope = false;
      }
    }
    s.cabeza = scene.add.image(s.x, s.y, 'gfm_serpiente', 'cabeza_0').setScale(ESC_CABEZA).setVisible(false);
    s.boca = false;
    s.sombraCabeza = scene.add.image(s.x, s.y, 'gfsp_sombra').setScale(1.4).setVisible(false).setAlpha(0.8);
    s.monticulo = scene.add.image(s.x, s.y, 'gfsp_monticulo').setVisible(false).setScale(1.8);
    s.agujero = scene.add.image(s.x, s.y, 'gfsp_agujero').setVisible(false).setScale(2.4);
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

  /** La foto de la dirección `ang` (0..15) y lo que falta girar hasta él. */
  function direccion(ang) {
    var i = Math.round(ang / PASO_DIR);
    return { i: ((i % DIRS) + DIRS) % DIRS, resto: ang - i * PASO_DIR };
  }
  /** Pone a la pieza la foto de su dirección (solo si cambia) y el resto de giro. */
  function orientar(o, prefijo, ang) {
    var d = direccion(ang), f = prefijo + d.i;
    if (!o.frame || o.frame.name !== f) o.setFrame(f);
    o.setRotation(d.resto);
  }
  /** Boca abierta (escupe, muerde, embiste) o cerrada. */
  function ponerCabeza(s, abierta) {
    if (!s || !s.cabeza || !s.cabeza.scene) return;
    s.boca = !!abierta;
    orientar(s.cabeza, s.boca ? 'abierta_' : 'cabeza_', s.ang);
  }

  function verCuerpo(s, ver) {
    s.cabeza.setVisible(ver); s.sombraCabeza.setVisible(ver);
    var anillos = ver && !s.usaRope;
    for (var i = 0; i < ANILLOS; i++) { s.anillos[i].setVisible(anillos); s.sombras[i].setVisible(anillos); }
    for (var t = 0; t < (s.ropes || []).length; t++) {
      s.ropes[t].setVisible(ver); s.brasas[t].setVisible(ver); s.sombrasRope[t].setVisible(ver);
    }
  }

  /* (2026-10-19) La tira del cuerpo sobre el rastro, de la cola al cuello.
     `largo` px de cuerpo fuera; `alza` lo levanta del suelo (como los anillos). */
  function colocarRope(st, largo, alza, vaivenT) {
    var s = st.s, n = TRAMOS * (PUNTOS_TRAMO - 1);
    var pts = [], sombra = [];
    /* Reptando, el cuerpo hace eses: una onda que lo recorre de la cabeza a
       la cola (quieta en la cabeza, más ancha en medio, menos en la cola). */
    var onda = st.s.estado === 'repta' || st.s.estado === 'embiste' ? 9 : 4;
    for (var i = 0; i <= n; i++) {
      var dist = largo * (1 - i / n) + 6;
      var p = enRastro(s, dist);
      var f = Math.min(1, dist / 70) * (1 - 0.45 * dist / Math.max(1, largo));
      var v = Math.sin(vaivenT * 6 - dist / 34) * onda * f;
      var px = p.x + Math.cos(p.ang + Math.PI / 2) * v, py = p.y + Math.sin(p.ang + Math.PI / 2) * v;
      pts.push({ x: px, y: py - alza });
      sombra.push({ x: px, y: py + 6 });
    }
    var furia = s.furia ? 1 : 0, lat = 0.3 + 0.12 * Math.sin(vaivenT * 5) + 0.15 * furia;
    for (var t = 0; t < TRAMOS; t++) {
      var a0 = t * (PUNTOS_TRAMO - 1), trozo = pts.slice(a0, a0 + PUNTOS_TRAMO), tsom = sombra.slice(a0, a0 + PUNTOS_TRAMO);
      var ymed = 0;
      for (var k = 0; k < tsom.length; k++) ymed += tsom[k].y;
      ymed = ymed / tsom.length - 6;
      s.ropes[t].setPoints(trozo).setDepth(ymed + 0.02 * t);
      s.brasas[t].setPoints(trozo).setDepth(ymed - 0.05).setAlpha(lat);
      s.sombrasRope[t].setPoints(tsom).setDepth(ymed - 2);
    }
  }
  /** Un destello en el cuerpo continuo al recibir un tajo. */
  function destelloCuerpo(st) {
    var s = st.s;
    if (!s || !s.usaRope) return;
    s.brasas.forEach(function (b) { b.setAlpha(1); });
    s.ropes.forEach(function (r) { try { r.setTintFill && r.setTintFill(0xffffff); } catch (e) {} });
    st.scene.time.delayedCall(80, function () {
      s.ropes.forEach(function (r) { try { if (r.scene) r.clearTint && r.clearTint(); } catch (e) {} });
    });
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
      var k = (1 - i / ANILLOS * 0.55) * ESC_ANILLO * (0.4 + 0.6 * a);
      orientar(an, 'anillo_', p.ang);
      an.setPosition(px, py - 10 * a).setScale(k).setDepth(py + 0.01 * i);
      so.setPosition(px, py + 2).setScale(k * 0.95).setDepth(py - 1);
    }
    if (s.usaRope && s.ropes.length) colocarRope(st, ANILLOS * SEPARACION * Math.max(0.15, a), 10 * a, t);
    orientar(s.cabeza, s.boca ? 'abierta_' : 'cabeza_', s.ang);
    s.cabeza.setPosition(s.x, s.y - 14 * a)
      .setScale(ESC_CABEZA * (0.4 + 0.6 * a)).setDepth(s.y + 1);
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
  /* ¿Mi jugador está muerto (fantasma o con la vida a 0)? Entonces ni le ve
     ni le hace daño (2026-10-11: "me golpean estando en fantasma"). */
  function fantasma() {
    try {
      if (window.GFMuerte && window.GFMuerte.muerto) return !!window.GFMuerte.muerto();
      var e = window.GFMascota && window.GFMascota.estado && window.GFMascota.estado(); return !!(e && e.ghost);
    } catch (e2) { return false; }
  }
  function piesJugador(scene) {
    var p = scene.player;
    return { x: p.x, y: p.y + 45 };
  }

  // Walking moves sprite coordinates directly; Arcade velocity can stay zero.
  function velocidadJugador(scene) {
    var p = scene.player, prev = scene.previousPosition;
    var ms = Math.max(4, Math.min(100, Number(scene.game && scene.game.loop && scene.game.loop.delta) || 16.667));
    var max = (Number(scene.speed) || 240) * 1.5;
    if (prev && Number.isFinite(prev.x) && Number.isFinite(prev.y)) {
      var vx = (p.x - prev.x) * 1000 / ms, vy = (p.y - prev.y) * 1000 / ms;
      // A scene transition or teleport must not send the attack across the map.
      return Math.hypot(vx, vy) <= max ? { x: vx, y: vy } : { x: 0, y: 0 };
    }
    var v = p.body && p.body.velocity;
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) && Math.hypot(v.x, v.y) <= max ? { x: v.x, y: v.y } : { x: 0, y: 0 };
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
  /*
   * LA MISMA PARA TODOS (2026-10-11, gf-mobs-red.js). Piensa el anfitrión: a
   * quién va (el jugador más cercano, sea quien sea), cuándo sale, se hunde,
   * escupe, hace temblar o embiste; lo anuncia y manda su foto. Los demás la
   * dibujan donde dice. Cada uno mira si le muerde, le quema o le cae una
   * piedra A ÉL: las piedras del terremoto caen sobre quien esté cerca.
   */
  var ESTADOS = ['oculta', 'cava', 'sale', 'superficie', 'repta', 'escupe', 'terremoto', 'embiste', 'hunde', 'muerta',
                 'aliento', 'geiser'];
  var FUERA = ['superficie', 'repta', 'escupe', 'terremoto', 'embiste', 'sale', 'hunde', 'aliento', 'geiser'];

  function cambiar(st, estado) {
    st.s.estado = estado;
    st.s.estadoDesde = st.scene.time.now;
  }

  function cercaDeMi(st, x, y, r) {
    var pj = piesJugador(st.scene);
    return Math.hypot(pj.x - x, pj.y - y) < (r || 800);
  }

  function anunciar(st, d) { if (st.red) st.red.evento(d); }

  function alguienCerca(st, x, y, r) {
    var lista = window.GFMobsRed ? window.GFMobsRed.jugadores(st.scene) : [piesJugador(st.scene)];
    for (var i = 0; i < lista.length; i++) if (Math.hypot(lista[i].x - x, lista[i].y - y) < r) return true;
    return false;
  }

  /** Anfitrión: el jugador más cercano a (x, y) y si lleva un rato quieto. */
  function blanco(st, x, y, max) {
    var scene = st.scene, ahora = scene.time.now;
    var lista = window.GFMobsRed ? window.GFMobsRed.jugadores(scene)
      : (fantasma() ? [] : [{ id: null, x: scene.player.x, y: scene.player.y + 45, local: true }]);
    var mejor = null, md = max || Infinity;
    for (var i = 0; i < lista.length; i++) {
      var d = Math.hypot(lista[i].x - x, lista[i].y - y);
      if (d < md) { md = d; mejor = lista[i]; }
    }
    if (!mejor) return null;
    mejor.d = md;
    var k = mejor.id || 'yo', paso = st.pasos[k];
    if (!paso || Math.hypot(mejor.x - paso.x, mejor.y - paso.y) > 6) paso = st.pasos[k] = { x: mejor.x, y: mejor.y, t: ahora };
    mejor.quieto = ahora - paso.t > QUIETO_MS;
    mejor.vel = mejor.local ? velocidadJugador(scene) : { x: 0, y: 0 };
    return mejor;
  }

  function sitioDeSalida(st, b) {
    var scene = st.scene;
    var mejor = null;
    // Mejor si hay una pared al lado: sale DE LA PARED.
    for (var k = 0; k < 24; k++) {
      var a = Math.random() * Math.PI * 2, r = 150 + Math.random() * 90;
      var x = b.x + Math.cos(a) * r, y = b.y + Math.sin(a) * r * 0.75;
      if (!libre(scene, x, y, 60)) continue;
      var pared = hayParedCerca(scene, x, y);
      if (pared) return { x: x, y: y, pared: pared };
      if (!mejor) mejor = { x: x, y: y, pared: null };
    }
    return mejor;
  }

  function empezarACavar(st, b) {
    var s = st.s;
    cambiar(st, 'cava');
    verCuerpo(s, false);
    barra(st, false);
    s.destino = b ? sitioDeSalida(st, b) : null;
    if (!s.destino) s.destino = { x: st.guarida.x, y: st.guarida.y, pared: null, aCasa: true };
    s.monticulo.setPosition(s.x, s.y).setVisible(true).setDepth(s.y);
  }

  /** Sale del suelo (o de la pared `pared`) mirando hacia `ang`. En todos. */
  function salir(st, ang, pared) {
    var s = st.s, scene = st.scene;
    cambiar(st, 'sale');
    s.monticulo.setVisible(false);
    s.agujero.setPosition(s.x, s.y + 6).setDepth(s.y - 2).setVisible(true).setAlpha(1);
    s.ang = ang; s.objAng = ang;
    reiniciarRastro(s);
    // El rastro, hacia DENTRO de la pared (o del agujero): el cuerpo sale de ahí.
    for (var i = 0; i < s.rastro.length; i++) {
      s.rastro[i] = pared ? { x: s.x + pared.x * i * 4, y: s.y + pared.y * i * 4 }
                          : { x: s.x - Math.cos(s.ang) * i * 2, y: s.y - Math.sin(s.ang) * i * 2 };
    }
    verCuerpo(s, true);
    colocarCuerpo(st, 0);
    onda(st, s.x, s.y + 4, 1.1);
    polvo(st, s.x, s.y, 1.4);
    cascotes(st, s.x, s.y, pared);
    if (cercaDeMi(st, s.x, s.y, 900)) {
      gritar(scene, 1);
      temblar(st, 650, 0.014);
      if (!st.vista) {
        st.vista = true;
        aviso(scene, '🐍 The Magma Serpent bursts out of the rock!', 'warning');
      }
      barra(st, true);
    }
    var pj = piesJugador(scene);
    if (Math.hypot(pj.x - s.x, pj.y - s.y) < 70 && !fantasma()) golpearAlJugador(st, 'serpiente_mordisco');
  }

  function hundirse(st) {
    var s = st.s;
    cambiar(st, 'hunde');
    s.agujero.setPosition(s.x, s.y + 6).setDepth(s.y - 2).setVisible(true).setAlpha(1);
    polvo(st, s.x, s.y, 1);
  }

  /** `n` bolas de fuego desde la boca hacia `base`. Cada uno mira si le dan. */
  function escupir(st, base, n) {
    var s = st.s, scene = st.scene;
    cambiar(st, 'escupe');
    s.ultimoPoder = 'fuego';
    ponerCabeza(s, true);
    scene.time.delayedCall(420, function () {
      if (!st.vivo || !s.vivo || s.estado !== 'escupe') return;
      for (var i = 0; i < n; i++) {
        var a = base + (i - (n - 1) / 2) * 0.22;
        var bx = s.x + Math.cos(s.ang) * 30, by = s.y - 14 + Math.sin(s.ang) * 30;
        // (2026-10-12) La bola va al doble de resolución: la mitad de escala.
        var b = scene.add.image(bx, by, 'gfsp_bola').setScale(1.2).setDepth(by + 40);
        var e = scene.add.image(bx, by, 'gfsp_estela').setOrigin(1, 0.5).setRotation(a).setDepth(by + 39).setScale(1.6, 1.2);
        e.setBlendMode(Phaser.BlendModes.ADD);
        // (2026-10-19) Con su resplandor alrededor.
        var h = scene.add.image(bx, by, 'gfsp_brillo').setDepth(by + 38).setScale(1.5).setAlpha(0.8);
        h.setBlendMode(Phaser.BlendModes.ADD);
        if (st.bolas.length < 18) st.bolas.push({ spr: b, estela: e, halo: h, x: bx, y: by, vx: Math.cos(a) * 270, vy: Math.sin(a) * 270, hasta: scene.time.now + 2600 });
        else { b.destroy(); e.destroy(); h.destroy(); }
      }
      if (cercaDeMi(st, s.x, s.y, 900)) gritar(scene, 0.35);
      scene.time.delayedCall(380, function () { ponerCabeza(s, false); if (s.estado === 'escupe') cambiar(st, 'superficie'); });
    });
  }

  /** Anfitrión: hacia dónde escupe (al blanco, adelantándose a su paso). */
  function apuntarFuego(st, b) {
    var s = st.s;
    var travel = Math.min(0.65, Math.hypot(b.x - s.x, b.y - s.y) / 270);
    return Math.atan2(b.y - 30 + b.vel.y * travel * 0.65 - (s.y - 14), b.x + b.vel.x * travel * 0.65 - s.x);
  }

  /**
   * El terremoto: tiembla todo y caen piedras del techo... sobre CADA jugador
   * que esté cerca (cada navegador las tira sobre el suyo, con su aviso).
   */
  function terremoto(st) {
    var s = st.s, scene = st.scene;
    cambiar(st, 'terremoto');
    s.ultimoPoder = 'terremoto';
    ponerCabeza(s, true);
    scene.time.delayedCall(1700, function () {
      ponerCabeza(s, false);
      if (s.estado === 'terremoto') cambiar(st, 'superficie');
    });
    var pj = piesJugador(scene);
    if (Math.hypot(pj.x - s.x, pj.y - s.y) > 700) return;
    gritar(scene, 1.1);
    temblar(st, 1500, s.furia ? 0.02 : 0.015);
    if (fantasma()) return;
    aviso(scene, '💥 The ground shakes!', 'warning');
    // Grietas que se abren hacia el jugador.
    for (var g = 0; g < 2; g++) {
      var gx = (s.x + pj.x) / 2 + (Math.random() - 0.5) * 120, gy = (s.y + pj.y) / 2 + (Math.random() - 0.5) * 80;
      var gr = scene.add.image(gx, gy, 'gfsp_grieta').setScale(2).setDepth(3).setRotation(Math.atan2(pj.y - s.y, pj.x - s.x) + (Math.random() - 0.5) * 0.6).setAlpha(0);
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
  }

  function embestir(st, ang) {
    var s = st.s, scene = st.scene;
    cambiar(st, 'embiste'); s.ultimoPoder = 'embestida'; s.cargaEn = scene.time.now + 700; s.cargaHasta = s.cargaEn + 650;
    s.cargaAng = ang;
    if (s.aviso) s.aviso.destroy();
    s.aviso = scene.add.ellipse(s.x + Math.cos(ang) * 100, s.y + Math.sin(ang) * 100, 50, 150, 0xff7b35, 0.16)
      .setRotation(ang - Math.PI / 2).setStrokeStyle(2, 0xffb551, 0.8).setDepth(s.y + 1);
    ponerCabeza(s, true);
  }

  /** Mordiscos: si la cabeza está pegada a MI jugador, me muerde a mí. */
  function mordiscos(st) {
    var s = st.s, scene = st.scene;
    if (!s || !s.vivo || fantasma()) return;
    if (['superficie', 'repta', 'embiste', 'escupe', 'terremoto', 'aliento', 'geiser'].indexOf(s.estado) < 0) return;
    var ahora = scene.time.now;
    if (s.estado === 'embiste' && ahora < s.cargaEn) return;
    var pj = piesJugador(scene);
    if (Math.hypot(pj.x - s.x, pj.y - s.y) >= (s.estado === 'embiste' ? 65 : 64) || ahora - s.ultimoMordisco <= 1100) return;
    s.ultimoMordisco = ahora;
    if (s.estado === 'superficie' || s.estado === 'repta') {
      ponerCabeza(s, true);
      scene.time.delayedCall(220, function () { if (s.estado === 'superficie' || s.estado === 'repta') ponerCabeza(s, false); });
    }
    golpearAlJugador(st, 'serpiente_mordisco');
  }

  /* (2026-10-19) EL SURCO: al cavar va abriendo grietas en el suelo que se
     apagan solas. Se ve por dónde pasa (y que rodea las paredes). */
  function surco(st, ahora) {
    var s = st.s, scene = st.scene;
    if (!st.surcos) st.surcos = [];
    var u = s.ultSurco;
    if (u && Math.hypot(s.x - u.x, s.y - u.y) < 34) return;
    s.ultSurco = { x: s.x, y: s.y };
    if (!scene.textures.exists('gfsp_grieta') || st.surcos.length > 24) return;
    var g = scene.add.image(s.x, s.y + 4, 'gfsp_grieta').setScale(1.1).setDepth(2.9).setAlpha(0.85)
      .setRotation(s.ang + (Math.random() - 0.5) * 0.4);
    st.surcos.push(g);
    scene.tweens.add({ targets: g, alpha: 0, delay: 2600, duration: 1400, onComplete: function () {
      var i = st.surcos.indexOf(g); if (i >= 0) st.surcos.splice(i, 1); g.destroy();
    } });
  }

  function efectoTemporal(st, o) {
    if (!st.efectos) st.efectos = [];
    st.efectos.push(o);
    o.once && o.once('destroy', function () { var i = st.efectos.indexOf(o); if (i >= 0) st.efectos.splice(i, 1); });
    return o;
  }

  /* (2026-10-19) LOS GÉISERES DE MAGMA. Se abren anillos ardientes en el
     suelo (el aviso, un segundo), y de cada uno revienta una columna de fuego
     con chispas que suben y deja el suelo quemado. Quien esté encima, se
     quema. Puntos: uno donde está el blanco y los demás alrededor. */
  function geiseres(st, puntos) {
    var s = st.s, scene = st.scene;
    cambiar(st, 'geiser');
    s.ultimoPoder = 'geiser';
    ponerCabeza(s, true);
    var pj = piesJugador(scene);
    var cerca = Math.hypot(pj.x - s.x, pj.y - s.y) < 900;
    if (cerca) { gritar(scene, 0.9); temblar(st, 500, 0.006); }
    puntos.forEach(function (p, k) {
      var x = p[0], y = p[1];
      // Pegado a una pared, un poco más arriba; dentro de la roca, no.
      if (!libre(scene, x, y, 16)) { if (libre(scene, x, y - 14, 10)) y -= 14; else if (k) return; }
      var av = efectoTemporal(st, scene.add.image(x, y, 'gfsp_aviso').setDepth(2.95).setScale(0.6).setAlpha(0));
      av.setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: av, alpha: 1, scale: 1.25, duration: 300 + k * 90 });
      scene.tweens.add({ targets: av, alpha: 0.55, duration: 160, yoyo: true, repeat: 3, delay: 300 + k * 90 });
      scene.time.delayedCall(1000 + k * 110, function () {
        if (!st.vivo) return;
        try { av.destroy(); } catch (e) {}
        estallarGeiser(st, x, y, cerca);
      });
    });
    scene.time.delayedCall(1900, function () { ponerCabeza(s, false); if (s.estado === 'geiser') cambiar(st, 'superficie'); });
  }
  function estallarGeiser(st, x, y, conSonido) {
    var scene = st.scene;
    if (conSonido) sonido(scene, 'geiser', 0.8);
    onda(st, x, y, 0.8);
    var q = efectoTemporal(st, scene.add.image(x, y + 2, 'gfsp_quemado').setDepth(2.92).setScale(1.2).setAlpha(0.9));
    scene.tweens.add({ targets: q, alpha: 0, delay: 3200, duration: 1200, onComplete: function () { q.destroy(); } });
    var halo = efectoTemporal(st, scene.add.image(x, y - 30, 'gfsp_brillo').setDepth(y + 5).setScale(2.4).setAlpha(0.9));
    halo.setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: halo, alpha: 0, scale: 3.6, duration: 900, onComplete: function () { halo.destroy(); } });
    // La columna: llamas apiladas que crecen, tiemblan y se apagan.
    for (var i = 0; i < 4; i++) {
      (function (i) {
        var l = efectoTemporal(st, scene.add.image(x + (i - 1.5) * 5, y - i * 18, 'gfsp_llama')
          .setOrigin(0.5, 1).setDepth(y + 6 + i * 0.01).setScale(0.3, 0.2).setAlpha(0.95));
        l.setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({ targets: l, scaleX: 1.15 - i * 0.12, scaleY: 1.7 - i * 0.2, duration: 220, ease: 'Back.easeOut' });
        scene.tweens.add({ targets: l, x: l.x + (Math.random() - 0.5) * 6, duration: 90, yoyo: true, repeat: 6 });
        scene.tweens.add({ targets: l, alpha: 0, scaleY: 0.4, delay: 700 + i * 60, duration: 380, onComplete: function () { l.destroy(); } });
      })(i);
    }
    // Las chispas: rayas que suben y se abren.
    for (var c = 0; c < 9; c++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * 1.3, v = 160 + Math.random() * 160;
      var ch = efectoTemporal(st, scene.add.image(x, y - 20, 'gfsp_chispa').setDepth(y + 8).setRotation(a + Math.PI / 2).setScale(1.2));
      ch.setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: ch, x: x + Math.cos(a) * v * 0.7, y: y - 20 + Math.sin(a) * v * 0.7, alpha: 0, duration: 650 + Math.random() * 300,
                         ease: 'Quad.easeOut', onComplete: function (tw, t) { t[0].destroy(); } });
    }
    var pj = piesJugador(scene);
    if (Math.hypot(pj.x - x, pj.y - y) < 46 && !fantasma()) golpearAlJugador(st, 'serpiente_fuego');
  }
  /** Anfitrión: dónde salen los géiseres (uno bajo el blanco, los demás alrededor). */
  function puntosGeiser(st, b) {
    var n = st.s.furia ? 5 : 3, out = [[Math.round(b.x), Math.round(b.y)]];
    for (var i = 1; i < n; i++) {
      var a = i / (n - 1) * Math.PI * 2 + Math.random() * 0.8, r = 70 + Math.random() * 60;
      out.push([Math.round(b.x + Math.cos(a) * r), Math.round(b.y + Math.sin(a) * r * 0.7)]);
    }
    return out;
  }

  /* (2026-10-19) EL ALIENTO DE FUEGO. Abre la boca y suelta un chorro de
     llamas en cono hacia el blanco durante un segundo y medio: llamas que
     salen de la boca, crecen, se abren y se apagan, con su resplandor. Quema
     a quien esté dentro del cono (cada 450 ms). */
  function aliento(st, ang) {
    var s = st.s, scene = st.scene;
    cambiar(st, 'aliento');
    s.ultimoPoder = 'aliento';
    s.alientoAng = ang;
    s.ang = ang;
    ponerCabeza(s, true);
    var pj = piesJugador(scene);
    if (Math.hypot(pj.x - s.x, pj.y - s.y) < 900) sonido(scene, 'aliento', 1);
    var fin = scene.time.now + 1500, ultimaQuemadura = 0;
    var tic = function () {
      if (!st.vivo || !s.vivo || s.estado !== 'aliento') {
        if (s.brilloBoca) { try { s.brilloBoca.destroy(); } catch (e) {} s.brilloBoca = null; }
        return;
      }
      var ahora = scene.time.now;
      if (ahora > fin) {
        ponerCabeza(s, false); cambiar(st, 'superficie');
        if (s.brilloBoca) { try { s.brilloBoca.destroy(); } catch (e) {} s.brilloBoca = null; }
        return;
      }
      var bx = s.x + Math.cos(ang) * 34, by = s.y - 14 + Math.sin(ang) * 34;
      // Un chorro denso: llamas que se solapan, crecen y se abren en cono.
      for (var k = 0; k < 3; k++) {
        var a = ang + (Math.random() - 0.5) * 0.55, v = 240 + Math.random() * 100;
        var l = efectoTemporal(st, scene.add.image(bx, by, 'gfsp_llama').setDepth(by + 30).setScale(0.3, 0.45).setAlpha(0.95)
          .setRotation(a + Math.PI / 2));
        l.setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({ targets: l, x: bx + Math.cos(a) * v * 0.85, y: by + Math.sin(a) * v * 0.85, scaleX: 1.3, scaleY: 1.6, alpha: 0,
                           duration: 780, ease: 'Sine.easeOut', onComplete: function (tw, t) { t[0].destroy(); } });
      }
      if (!s.brilloBoca || !s.brilloBoca.scene) {
        s.brilloBoca = efectoTemporal(st, scene.add.image(bx, by, 'gfsp_brillo').setScale(1.8).setAlpha(0.85));
        s.brilloBoca.setBlendMode(Phaser.BlendModes.ADD);
      }
      s.brilloBoca.setPosition(bx, by).setDepth(by + 31).setScale(1.6 + Math.random() * 0.5);
      var p2 = piesJugador(scene);
      var dx = p2.x - s.x, dy = (p2.y - 30) - s.y, d = Math.hypot(dx, dy);
      var da = Math.atan2(dy, dx) - ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (d < 270 && Math.abs(da) < 0.42 && ahora - ultimaQuemadura > 450 && !fantasma()) {
        ultimaQuemadura = ahora;
        golpearAlJugador(st, 'serpiente_fuego');
      }
      scene.time.delayedCall(55, tic);
    };
    scene.time.delayedCall(260, tic);
  }

  function enfurecer(st) {
    var s = st.s, scene = st.scene;
    if (s.furia) return;
    s.furia = true;
    if (cercaDeMi(st, s.x, s.y, 1000)) {
      gritar(scene, 1.2);
      temblar(st, 700, 0.012);
      aviso(scene, '🔥 The Magma Serpent is enraged!', 'warning');
    }
    var nom = st.barra && st.barra.querySelector('.gfs-nombre');
    if (nom) nom.textContent = '🔥 The Magma Serpent (enraged)';
  }

  // ─────────────────────────────────────────────────────── EL PASO
  function actualizar(st, time, delta) {
    var scene = st.scene, s = st.s;
    var p = scene.player;
    if (!s || !p || !p.active || scene._cambiandoEscena) return;
    var seg = Math.min(0.05, delta / 1000);
    var ahora = scene.time.now;
    var pj = piesJugador(scene);
    if (st.red) st.red.tick(time);

    actualizarBolas(st, seg, ahora);
    actualizarBotin(st, pj);

    if (st.red && !st.red.esHost()) { seguir(st, seg, ahora); mordiscos(st); barraTic(st); return; }

    if (!s.vivo) {
      if (Date.now() > s.muertaHasta && !alguienCerca(st, st.guarida.x, st.guarida.y, 900)) {
        revivir(st);
        anunciar(st, { e: 'revive' });
      }
      return;
    }
    var oculta = s.estado === 'oculta';
    var b = blanco(st, oculta ? st.guarida.x : s.x, oculta ? st.guarida.y : s.y, OLVIDA + 200);
    var dist = b ? b.d : Infinity;

    switch (s.estado) {
      case 'oculta':
        if (b && dist < DESPIERTA) {
          if (cercaDeMi(st, st.guarida.x, st.guarida.y, DESPIERTA + 150)) {
            gritar(scene, 0.8);
            temblar(st, 900, 0.006);
            aviso(scene, '🐍 Something huge is digging toward you…', 'warning');
          }
          anunciar(st, { e: 'despierta' });
          empezarACavar(st, b);
        }
        break;

      case 'cava': {
        if (s.destino && !s.destino.aCasa && (!b || dist > OLVIDA)) {
          s.destino = { x: st.guarida.x, y: st.guarida.y, aCasa: true };
        }
        // Sigue al blanco mientras cava (el sitio de salida se recoloca).
        if (b && s.destino && !s.destino.aCasa && ahora - s.estadoDesde > 600 &&
            Math.hypot(s.destino.x - b.x, s.destino.y - b.y) > 320) {
          var nuevo = sitioDeSalida(st, b);
          if (nuevo) s.destino = nuevo;
        }
        var d = s.destino;
        var ddx = d.x - s.x, ddy = d.y - s.y, dd = Math.hypot(ddx, ddy);
        if (dd < 12) {
          if (d.aCasa) { s.monticulo.setVisible(false); cambiar(st, 'oculta'); }
          else {
            var ang = b ? Math.atan2(b.y - s.y, b.x - s.x) : s.ang;
            salir(st, ang, d.pared);
            anunciar(st, { e: 'sale', x: Math.round(s.x), y: Math.round(s.y), a: Number(ang.toFixed(3)),
                           px: d.pared ? d.pared.x : null, py: d.pared ? d.pared.y : null });
          }
          break;
        }
        /* (2026-10-19) Bajo tierra TAMBIÉN hay paredes: la roca de la mina no
           se atraviesa. Rodea; si se queda encajada, sale donde está (nada de
           aparecer al otro lado de un muro). Y deja su surco de grietas. */
        var v = VEL_CAVA * (s.furia ? 1.2 : 1);
        var antesX = s.x, antesY = s.y;
        var usado = avanzar(scene, s, Math.atan2(ddy, ddx), Math.min(dd, v * seg), 30);
        if (usado !== null) s.ang = usado;
        if (Math.hypot(s.x - antesX, s.y - antesY) > 0.5) s.atascoDesde = 0;
        else if (!s.atascoDesde) s.atascoDesde = ahora;
        if (s.atascoDesde && ahora - s.atascoDesde > 1800) {
          s.atascoDesde = 0;
          if (d.aCasa) { s.monticulo.setVisible(false); st.guarida = { x: s.x, y: s.y }; cambiar(st, 'oculta'); break; }
          var angAt = b ? Math.atan2(b.y - s.y, b.x - s.x) : s.ang;
          salir(st, angAt, hayParedCerca(scene, s.x, s.y));
          anunciar(st, { e: 'sale', x: Math.round(s.x), y: Math.round(s.y), a: Number(angAt.toFixed(3)) });
          break;
        }
        surco(st, ahora);
        s.monticulo.setPosition(s.x + Math.sin(ahora / 70) * 2, s.y).setDepth(s.y).setVisible(true);
        if (ahora > s.polvoEn) { s.polvoEn = ahora + 180; polvo(st, s.x, s.y, 0.55); }
        if (cercaDeMi(st, s.x, s.y, 420) && ahora > (st.rumorEn || 0)) { st.rumorEn = ahora + 500; temblar(st, 300, 0.0025); }
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
        if (!b || dist > OLVIDA) { hundirse(st); anunciar(st, { e: 'hunde' }); break; }
        // Mira siempre hacia su blanco.
        var objetivo = Math.atan2(b.y - s.y, b.x - s.x);
        var dif = Math.atan2(Math.sin(objetivo - s.ang), Math.cos(objetivo - s.ang));
        s.ang += dif * Math.min(1, seg * 4);
        if (b.quieto || s.estado === 'repta') {
          // Se quedó quieto: viene reptando (con su ondulación).
          if (s.estado !== 'repta') cambiar(st, 'repta');
          if (!b.quieto && ahora - s.estadoDesde > 1500) { cambiar(st, 'superficie'); break; }
          var onda2 = Math.sin(ahora / 160) * 0.6;
          var mv = s.ang + onda2;
          var vx = Math.cos(mv) * VEL_REPTA, vy = Math.sin(mv) * VEL_REPTA;
          var nx = s.x + vx * seg, ny = s.y + vy * seg;
          if (dist > 50) {
            // (2026-10-19) Rodea las paredes; solo si no hay hueco se hunde.
            if (libre(scene, nx, ny, 34)) { s.x = nx; s.y = ny; }
            else if (avanzar(scene, s, s.ang, VEL_REPTA * seg, 34) === null && ahora - s.estadoDesde > 800) { hundirse(st); anunciar(st, { e: 'hunde' }); break; }
          }
          apuntarRastro(s);
        } else if (ahora > s.siguienteAtaque) {
          s.siguienteAtaque = ahora + (s.furia ? 1700 : 2400) + Math.random() * 900;
          var dado = Math.random();
          if (dist < 330 && dist > 90 && s.ultimoPoder !== 'embestida' && dado < 0.35) {
            var ca = Math.atan2(b.y + b.vel.y * 0.3 - s.y, b.x + b.vel.x * 0.3 - s.x);
            embestir(st, ca);
            anunciar(st, { e: 'embiste', a: Number(ca.toFixed(3)) });
          } else if (dist < 260 && s.ultimoPoder !== 'aliento' && dado < 0.7) {
            // (2026-10-19) El aliento de fuego, de cerca.
            var aa = Math.atan2(b.y - 30 - (s.y - 14), b.x - s.x);
            aliento(st, aa);
            anunciar(st, { e: 'aliento', a: Number(aa.toFixed(3)) });
          } else if (s.ultimoPoder !== 'geiser' && dado < 0.85) {
            // (2026-10-19) Los géiseres de magma, bajo los pies del blanco.
            var pg = puntosGeiser(st, b);
            geiseres(st, pg);
            anunciar(st, { e: 'geiser', p: pg });
          } else if (s.ultimoPoder !== 'terremoto' && (dist < 180 || s.ultimoPoder === 'fuego' || Math.random() < 0.3)) {
            terremoto(st);
            anunciar(st, { e: 'terremoto' });
          } else {
            var base = apuntarFuego(st, b), n = s.furia ? 5 : 3;
            escupir(st, base, n);
            anunciar(st, { e: 'escupe', a: Number(base.toFixed(3)), n: n });
          }
        }
        colocarCuerpo(st, 1);
        if (ahora > s.superficieHasta && s.estado === 'superficie') { hundirse(st); anunciar(st, { e: 'hunde' }); }
        break;
      }

      case 'escupe':
      case 'terremoto':
      case 'aliento':
      case 'geiser':
        colocarCuerpo(st, 1);
        break;
      case 'embiste':
        s.ang = s.cargaAng;
        if (ahora >= s.cargaEn) {
          if (s.aviso) { s.aviso.destroy(); s.aviso = null; }
          var dxCarga = Math.cos(s.cargaAng) * 280 * seg, dyCarga = Math.sin(s.cargaAng) * 280 * seg;
          if (libre(scene, s.x + dxCarga, s.y + dyCarga, 34)) { s.x += dxCarga; s.y += dyCarga; apuntarRastro(s); } else s.cargaHasta = ahora;
        }
        colocarCuerpo(st, 1);
        if (ahora >= s.cargaHasta) { ponerCabeza(s, false); cambiar(st, 'superficie'); }
        break;

      case 'hunde': {
        var th = Math.min(1, (ahora - s.estadoDesde) / 650);
        colocarCuerpo(st, 1 - th);
        if (th >= 1) {
          verCuerpo(s, false);
          scene.tweens.add({ targets: s.agujero, alpha: 0, duration: 900, onComplete: function () { s.agujero.setVisible(false); } });
          empezarACavar(st, b && dist < OLVIDA ? b : null);
        }
        break;
      }
    }
    s.objX = s.x; s.objY = s.y; s.objAng = s.ang;
    mordiscos(st);
    barraTic(st);
  }

  /** Invitado: la dibuja donde dice la foto del anfitrión, suavizando. */
  function seguir(st, seg, ahora) {
    var s = st.s, scene = st.scene;
    if (!s.vivo) return;
    var dx = s.objX - s.x, dy = s.objY - s.y, d = Math.hypot(dx, dy);
    if (d > 300) { s.x = s.objX; s.y = s.objY; reiniciarRastro(s); }
    else if (d > 0.3) { var k = Math.min(1, seg * 9); s.x += dx * k; s.y += dy * k; }
    var dif = Math.atan2(Math.sin(s.objAng - s.ang), Math.cos(s.objAng - s.ang));
    s.ang += dif * Math.min(1, seg * 8);
    if (s.estado === 'embiste') {
      s.ang = s.cargaAng;
      if (ahora >= s.cargaEn && s.aviso) { s.aviso.destroy(); s.aviso = null; }
      if (ahora >= s.cargaHasta) { ponerCabeza(s, false); cambiar(st, 'superficie'); }
    }
    switch (s.estado) {
      case 'oculta':
        verCuerpo(s, false); s.monticulo.setVisible(false);
        break;
      case 'cava':
        verCuerpo(s, false);
        surco(st, ahora);
        s.monticulo.setPosition(s.x + Math.sin(ahora / 70) * 2, s.y).setDepth(s.y).setVisible(true);
        if (ahora > s.polvoEn) { s.polvoEn = ahora + 180; polvo(st, s.x, s.y, 0.55); }
        break;
      case 'sale': {
        var t = Math.min(1, (ahora - s.estadoDesde) / 800);
        apuntarRastro(s);
        colocarCuerpo(st, t);
        s.agujero.setAlpha(1 - t * 0.4);
        if (t >= 1) {
          cambiar(st, 'superficie');
          scene.tweens.add({ targets: s.agujero, alpha: 0, duration: 1200, onComplete: function () { s.agujero.setVisible(false); } });
        }
        break;
      }
      case 'hunde': {
        var th = Math.min(1, (ahora - s.estadoDesde) / 650);
        colocarCuerpo(st, 1 - th);
        if (th >= 1) {
          verCuerpo(s, false);
          scene.tweens.add({ targets: s.agujero, alpha: 0, duration: 900, onComplete: function () { s.agujero.setVisible(false); } });
          cambiar(st, 'cava');
        }
        break;
      }
      default:
        apuntarRastro(s);
        colocarCuerpo(st, 1);
    }
    var verBarra = FUERA.indexOf(s.estado) >= 0 && cercaDeMi(st, s.x, s.y, 1100);
    if (verBarra !== !!st.barraVista) { st.barraVista = verBarra; barra(st, verBarra); }
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
      if (b.halo) b.halo.setPosition(b.x, b.y).setDepth(b.y + 38).setAlpha(0.65 + 0.2 * Math.sin(ahora / 40));
      var pj = piesJugador(scene);
      var tocaJugador = Math.hypot(pj.x - b.x, (pj.y - 40) - b.y) < 26;
      var choca = !libre(scene, b.x, b.y + 30, 10);
      if (tocaJugador || choca || ahora > b.hasta) {
        if (tocaJugador && !fantasma()) golpearAlJugador(st, 'serpiente_fuego');
        onda(st, b.x, b.y, 0.45);
        // (2026-10-19) Estalla en llamas y deja el suelo quemado.
        if (scene.textures.exists('gfsp_llama')) {
          var fl = efectoTemporal(st, scene.add.image(b.x, b.y + 30, 'gfsp_llama').setOrigin(0.5, 1).setDepth(b.y + 41).setScale(0.4, 0.3));
          fl.setBlendMode(Phaser.BlendModes.ADD);
          scene.tweens.add({ targets: fl, scaleX: 0.9, scaleY: 1.1, alpha: 0, duration: 420, ease: 'Quad.easeOut', onComplete: function (tw, t) { t[0].destroy(); } });
          var qm = efectoTemporal(st, scene.add.image(b.x, b.y + 32, 'gfsp_quemado').setDepth(2.92).setScale(0.6).setAlpha(0.8));
          scene.tweens.add({ targets: qm, alpha: 0, delay: 2200, duration: 1000, onComplete: function (tw, t) { t[0].destroy(); } });
        }
        b.spr.destroy(); b.estela.destroy(); if (b.halo) b.halo.destroy();
        st.bolas.splice(i, 1);
      }
    }
  }

  // ── LA RED ───────────────────────────────────────────────────────────────
  function exportar(st) {
    var s = st.s;
    if (!s) return [];
    return [[0, Math.round(s.x), Math.round(s.y), (s.vivo ? 1 : 0) | (s.furia ? 2 : 0),
             Math.max(0, Math.round(s.vida)), Math.round(s.ang * 100), Math.max(0, ESTADOS.indexOf(s.estado))]];
  }

  function importar(st, lista) {
    var s = st.s, f = lista && lista[0];
    if (!s || !Array.isArray(f)) return;
    var ahora = st.scene.time.now;
    s.objX = Number(f[1]) || s.x; s.objY = Number(f[2]) || s.y;
    s.objAng = (Number(f[5]) || 0) / 100;
    s.vida = Math.min(s.max, Math.max(0, Number(f[4]) || 0));
    if ((f[3] & 2) && !s.furia && s.vivo) enfurecer(st);
    var vivo = !!(f[3] & 1);
    if (vivo && !s.vivo) { revivir(st); s.x = s.objX; s.y = s.objY; }
    else if (!vivo && s.vivo) { morir(st, null); return; }
    if (!s.vivo) return;
    // El estado, por si se perdió un anuncio (sin pisar una salida o un
    // hundimiento que aún se está dibujando).
    var est = ESTADOS[f[6]];
    var transicion = (s.estado === 'sale' || s.estado === 'hunde' || s.estado === 'embiste') && ahora - s.estadoDesde < 1400;
    if (!est || est === s.estado || transicion || est === 'muerta') return;
    if (est === 'sale' || est === 'hunde' || est === 'embiste') return;      // esos llegan por anuncio
    var antes = FUERA.indexOf(s.estado) >= 0, ahoraFuera = FUERA.indexOf(est) >= 0;
    cambiar(st, est);
    if (ahoraFuera && !antes) {
      s.x = s.objX; s.y = s.objY; s.ang = s.objAng;
      reiniciarRastro(s); verCuerpo(s, true); s.monticulo.setVisible(false);
    } else if (!ahoraFuera && antes) {
      verCuerpo(s, false);
    }
    if (est !== 'cava') s.monticulo.setVisible(false);
  }

  function alEvento(st, d) {
    var s = st.s, scene = st.scene;
    if (!s) return;
    if (d.e === 'revive') { if (!s.vivo) revivir(st); return; }
    if (d.e === 'muere') { if (s.vivo) morir(st, d.por || null); return; }
    if (!s.vivo) return;
    if (d.e === 'herido') {
      destelloCuerpo(st);
      s.cabeza.setTintFill(0xffffff);
      scene.time.delayedCall(70, function () { if (s.cabeza && s.cabeza.scene) s.cabeza.clearTint(); });
      return;
    }
    if (d.e === 'furia') { enfurecer(st); return; }
    if (d.e === 'despierta') {
      if (cercaDeMi(st, st.guarida.x, st.guarida.y, DESPIERTA + 150)) {
        gritar(scene, 0.8);
        temblar(st, 900, 0.006);
        aviso(scene, '🐍 Something huge is digging toward you…', 'warning');
      }
      cambiar(st, 'cava');
      return;
    }
    if (d.e === 'sale') {
      s.x = s.objX = Number(d.x) || s.x; s.y = s.objY = Number(d.y) || s.y;
      salir(st, Number(d.a) || 0, d.px !== null && d.px !== undefined ? { x: Number(d.px), y: Number(d.py) } : null);
      return;
    }
    if (d.e === 'hunde') { hundirse(st); return; }
    if (d.e === 'escupe') { escupir(st, Number(d.a) || 0, Math.max(1, Math.min(5, Number(d.n) || 3))); return; }
    if (d.e === 'terremoto') { terremoto(st); return; }
    if (d.e === 'embiste') { embestir(st, Number(d.a) || 0); return; }
    // (2026-10-19) Los poderes nuevos.
    if (d.e === 'aliento') { aliento(st, Number(d.a) || 0); return; }
    if (d.e === 'geiser' && Array.isArray(d.p)) {
      geiseres(st, d.p.slice(0, 6).map(function (q) { return [Number(q && q[0]) || 0, Number(q && q[1]) || 0]; }));
    }
  }

  // ─────────────────────────────────────────────────────── LA ESPADA
  /** El anfitrión resta (un tajo suyo o de otro: `por`). */
  function aplicarDano(st, dano, ux, uy, por) {
    var s = st.s, scene = st.scene;
    if (!s || !s.vivo) return 0;
    var recibido = Math.min(s.vida, dano);
    s.vida -= recibido;
    s.heridaEn = scene.time.now;
    var L = Math.hypot(ux, uy) || 1;
    var nx = s.x + ux / L * 6, ny = s.y + uy / L * 6;
    if (FUERA.indexOf(s.estado) >= 0 && libre(scene, nx, ny, 34)) { s.x = nx; s.y = ny; apuntarRastro(s); colocarCuerpo(st, 1); }
    anunciar(st, { e: 'herido' });
    if (!s.furia && s.vida < s.max * 0.5) { enfurecer(st); anunciar(st, { e: 'furia' }); }
    if (s.vida <= 0) { morir(st, por); anunciar(st, { e: 'muere', por: por || null }); }
    return recibido;
  }

  function recibirTajo(st, scene, cx, cy, dir, alcance, dano, poder) {
    var out = { tocados: 0, muertos: 0, puntos: [] };
    var s = st.s;
    if (!st.vivo || !s || !s.vivo || scene !== st.scene) return out;
    if (['superficie', 'repta', 'escupe', 'terremoto', 'embiste', 'sale', 'aliento', 'geiser'].indexOf(s.estado) < 0) return out;
    var ang = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir] || 0;
    var partes = [{ o: s.cabeza, k: 1.6 }].concat(s.anillos.map(function (a) { return { o: a, k: 1 }; }));
    var mejor = null;
    partes.forEach(function (pt) {
      var dx = pt.o.x - cx, dy = (pt.o.y + 10) - cy, d = Math.hypot(dx, dy);
      if (d > alcance + 24) return;
      var da = Math.atan2(dy, dx) - ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > (poder && poder.arco || 1.35) && d > 28) return;
      if (!mejor || pt.k > mejor.k || d < mejor.d) mejor = { o: pt.o, k: pt.k, d: d };
    });
    if (!mejor) return out;
    var golpe = dano * mejor.k;
    out.tocados = 1;
    destelloCuerpo(st);
    mejor.o.setTintFill(0xffffff);
    scene.time.delayedCall(70, function () { if (mejor.o.scene) mejor.o.clearTint(); });
    if (!st.red || st.red.esHost()) {
      var recibido = aplicarDano(st, golpe, s.x - cx, s.y - cy, st.red ? st.red.miId() : null);
      out.puntos.push({ x: mejor.o.x, y: mejor.o.y, dano: recibido });
      if (!s.vivo) out.muertos = 1;
    } else {
      out.puntos.push({ x: mejor.o.x, y: mejor.o.y, dano: Math.min(s.vida, golpe) });
      st.red.golpe({ id: 0, dano: Math.round(golpe * 10) / 10, ux: Math.round(s.x - cx), uy: Math.round(s.y - cy) });
    }
    return out;
  }

  // ─────────────────────────────────────────────────────── LA MUERTE Y EL BOTÍN
  /** Muere en todos; cobra (nivel y botín) solo quien la mató: `por`. */
  function morir(st, por) {
    var s = st.s, scene = st.scene;
    if (!s.vivo) return;
    s.vivo = false;
    s.vida = 0;
    s.muertaHasta = Date.now() + VUELVE_MS;
    cambiar(st, 'muerta');
    barra(st, false);
    st.barraVista = false;
    if (s.aviso) { s.aviso.destroy(); s.aviso = null; }
    s.monticulo.setVisible(false);
    var cerca = cercaDeMi(st, s.x, s.y, 1100);
    if (cerca) { gritar(scene, 1.3); temblar(st, 1200, 0.016); }
    var hx = s.x, hy = s.y;
    // Revienta anillo a anillo, de la cola a la cabeza.
    var piezas = s.anillos.slice().reverse().concat([s.cabeza]);
    piezas.forEach(function (o, i) {
      scene.time.delayedCall(i * 70, function () {
        if (!o.scene) return;
        if (o.visible || s.usaRope) {
          onda(st, o.x, o.y, 0.5);
          polvo(st, o.x, o.y, 0.7);
          var br = scene.add.image(o.x, o.y, 'gfsp_brillo').setDepth(o.y + 5).setScale(1.2);
          br.setBlendMode(Phaser.BlendModes.ADD);
          scene.tweens.add({ targets: br, scale: 3, alpha: 0, duration: 420, onComplete: function () { br.destroy(); } });
        }
        o.setVisible(false);
      });
    });
    s.sombras.forEach(function (o) { o.setVisible(false); });
    s.sombraCabeza.setVisible(false);
    // (2026-10-19) El cuerpo continuo se apaga mientras revienta.
    (s.ropes || []).concat(s.brasas || [], s.sombrasRope || []).forEach(function (o) {
      scene.tweens.add({ targets: o, alpha: 0, duration: piezasLen(s) * 70, onComplete: function () { o.setVisible(false).setAlpha(1); } });
    });
    var mia = st.red ? (por && st.red.soy(por)) : true;
    scene.time.delayedCall(piezas.length * 70 + 150, function () {
      if (cerca) { try { scene.cameras.main.flash(500, 255, 170, 90); } catch (e) {} }
      if (mia) cobrar(st, hx, hy);
      else if (cerca) aviso(scene, '⚔ The Magma Serpent was defeated!', 'info');
    });
  }

  function piezasLen(s) { return (s.anillos ? s.anillos.length : 0) + 1; }

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
    if (!st.vivo || !st.scene) return;
    var scene = st.scene;
    var clave = 'gfsp_item_' + b.itemId;
    var ponerlo = function () {
      if (!st.vivo) return;
      var halo = scene.add.image(x, y, 'gfsp_brillo').setDepth(y - 1).setScale(1.3).setAlpha(0.8);
      halo.setBlendMode(Phaser.BlendModes.ADD);
      var spr = scene.add.image(x0, y0, scene.textures.exists(clave) ? clave : 'gfsp_brillo').setOrigin(0.5, 1).setScale(2).setDepth(y);
      var salto = scene.tweens.addCounter({ from: 0, to: 1, duration: 600, ease: 'Quad.easeOut', onUpdate: function (tw) {
        if (!st.vivo || !spr.scene) return;
        var t = tw.getValue();
        spr.x = x0 + (x - x0) * t; spr.y = y0 + (y - y0) * t - Math.sin(t * Math.PI) * 50;
      } });
      var m = { id: b.id, itemId: b.itemId, cantidad: b.cantidad, x: x, y: y, spr: spr, halo: halo, salto: salto, hasta: Date.now() + caducaMs, recogiendo: false };
      m.flota = scene.tweens.add({ targets: halo, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
      st.botin.push(m);
    };
    if (scene.textures.exists(clave)) { ponerlo(); return; }
    var src = imagenDe(scene, b.itemId);
    if (!src) { ponerlo(); return; }
    var cargas = st.cargasBotin || (st.cargasBotin = new Set());
    var evento = 'filecomplete-image-' + clave;
    var soltarCarga = function () {
      scene.load.off(evento, alCargar); scene.load.off('loaderror', alError); cargas.delete(soltarCarga);
    };
    var alCargar = function () { soltarCarga(); ponerlo(); };
    var alError = function (archivo) { if (archivo && archivo.key === clave) soltarCarga(); };
    cargas.add(soltarCarga);
    try {
      scene.load.image(clave, src);
      scene.load.once(evento, alCargar); scene.load.on('loaderror', alError);
      scene.load.start();
    } catch (e) { soltarCarga(); }
  }

  function quitarMonton(st, m) {
    try { if (m.flota) m.flota.stop(); } catch (e) {}
    try { if (m.salto) m.salto.stop(); } catch (e) {}
    m.flota = m.salto = null;
    [m.spr, m.halo].forEach(function (o) { try { if (o && o.scene) o.destroy(); } catch (e) {} });
    var i = st.botin.indexOf(m);
    if (i >= 0) st.botin.splice(i, 1);
  }

  function limpiarBotin(st) {
    if (st.cargasBotin) { Array.from(st.cargasBotin).forEach(function (soltar) { soltar(); }); st.cargasBotin.clear(); }
    st.botin.slice().forEach(function (m) { quitarMonton(st, m); });
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
        /* SE TOMA AL PISARLO (2026-10-19): "paso por encima y tarda mucho en
           tomarlo; quiero que lo tome y que las transacciones se hagan en
           cola". Con la cola (gf-cola-cadena.js) el servidor contesta en
           cuanto lo reserva: el montón vuela al jugador y sale el "+N" ya; el
           objeto entra en la bolsa cuando la cadena lo acuña. Mientras
           contesta, el montón se ve tenue (no se vuelve a pisar). */
        var cola = window.GFColaCadena;
        var t = cola ? cola.ticket() : null;
        var nombre = (scene._getFruitDisplayNameEN && scene._getFruitDisplayNameEN(mm.itemId)) || mm.itemId;
        var copia = { id: mm.id, itemId: mm.itemId, cantidad: mm.cantidad }, cx = mm.x, cy = mm.y, hasta = mm.hasta;
        var volar = function () {
          if (!st.vivo || !mm.spr || !mm.spr.scene) { quitarMonton(st, mm); return; }
          try { if (mm.flota) mm.flota.stop(); } catch (e) {}
          scene.tweens.add({ targets: [mm.spr, mm.halo], y: '-=40', alpha: 0, duration: 300, onComplete: function () { quitarMonton(st, mm); } });
        };
        try { mm.spr.setAlpha(0.45); } catch (e) {}
        api('/api/monstruos/botin/recoger', t ? { id: mm.id, ticket: t } : { id: mm.id }).then(function (r) {
          var d = (r && r.datos) || {};
          if (d.ok && d.pendiente && cola) {
            volar();
            if (st.vivo) {
              aviso(scene, '+' + d.cantidad + ' ' + nombre, 'success');
              try { scene.playSFX && scene.playSFX('item_pickup'); } catch (e) {}
            }
            cola.esperar(d.ticket || t, {
              alOk: function (dd, sc) { if (sc && dd.factura) meterFactura(sc, dd.itemId, dd.factura); },
              alFallo: function (dd, sc) {
                // El botín sigue siendo suyo en el servidor: vuelve al suelo para pisarlo otra vez.
                if (st.vivo) soltarMonton(st, copia, cx, cy - 20, cx, cy, Math.max(5000, hasta - Date.now()));
                if (sc) aviso(sc, dd.message || 'Could not pick it up: step on it again.', 'warning');
              }
            }, scene);
          } else if (d.ok && d.factura) {
            if (!st.vivo) return;
            meterFactura(scene, d.itemId, d.factura);
            aviso(scene, '+' + d.cantidad + ' ' + nombre, 'success');
            try { scene.playSFX && scene.playSFX('item_pickup'); } catch (e) {}
            volar();
          } else if (d.motivo === 'no_existe' || d.motivo === 'caducado') {
            quitarMonton(st, mm);
          } else {
            try { if (mm.spr && mm.spr.scene) mm.spr.setAlpha(1); } catch (e) {}
            mm.recogiendo = false;                 // la cadena: se reintenta al volver a pisarlo
            if (d.message) aviso(scene, d.message, 'warning');
          }
        }).catch(function () {
          try { if (mm.spr && mm.spr.scene) mm.spr.setAlpha(1); } catch (e) {}
          mm.recogiendo = false;
        });
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
    s.objX = s.x; s.objY = s.y;
    st.vista = false;
    st.barraVista = false;
    var nom = st.barra && st.barra.querySelector('.gfs-nombre');
    if (nom) nom.textContent = '🐍 The Magma Serpent';
    s.anillos.concat([s.cabeza]).forEach(function (o) { o.clearTint(); });
    (s.ropes || []).concat(s.sombrasRope || []).forEach(function (o) { o.setAlpha(o === s.ropes[0] || s.ropes.indexOf(o) >= 0 ? 1 : 0.42); });
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
    var st = { scene: scene, vivo: true, bolas: [], botin: [], barra: null, ultimoGolpe: 0, vista: false,
               pasos: {}, red: null, barraVista: false };
    scene.__gfSerpiente = st;
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    // Las piezas son PNG: hasta que no lleguen no se crea el bicho.
    st.arte = null;
    try {
      texturas(scene).then(function (ok) { st.arte = ok ? 'si' : 'no'; });
    } catch (e) { console.warn('🐍 texturas:', e); return; }
    // La guarida se elige un poco después: así ya está la del guardián zombi.
    var esperarGuardianHasta = scene.time.now + 18000;
    scene.time.delayedCall(1200, function iniciarSerpiente() {
      if (!st.vivo || scene.__gfSerpiente !== st) return;
      if ((st.arte === null || scene.__gfZombis && !scene.__gfZombis.preparado) && scene.time.now < esperarGuardianHasta) {
        scene.time.delayedCall(250, iniciarSerpiente);
        return;
      }
      if (st.arte !== 'si') { console.warn('🐍 faltan las piezas de la serpiente (Game/Sprites/monstruos/serpiente)'); return; }
      st.guarida = elegirGuarida(scene);
      if (!st.guarida) { log('sin sitio para la guarida'); return; }
      crear(st);
      // Compartida con los demás de la mina (gf-mobs-red.js).
      if (window.GFMobsRed) {
        st.red = window.GFMobsRed.crear(scene, 'serpiente', {
          exportar: function () { return exportar(st); },
          importar: function (l) { if (st.vivo) importar(st, l); },
          alEvento: function (d) { if (st.vivo) alEvento(st, d); },
          alGolpe: function (d) {
            if (st.vivo && st.s && st.s.vivo) aplicarDano(st, Math.min(250, Number(d.dano) || 0), Number(d.ux) || 0, Number(d.uy) || 0, d.de);
          },
          alCambiarHost: function (soyYo) {
            var s = st.s;
            if (!s) return;
            if (soyYo) { if (s.estado === 'embiste' && s.aviso) { s.aviso.destroy(); s.aviso = null; } if (s.estado === 'embiste') cambiar(st, 'superficie'); }
            else { s.objX = s.x; s.objY = s.y; s.objAng = s.ang; }
          }
        });
      }
      st.onUpdate = function (t, d) { if (st.vivo) actualizar(st, t, d); };
      scene.events.on('update', st.onUpdate);
      st.objetivo = function (sc, cx, cy, dir, alcance, dano, poder) { return recibirTajo(st, sc, cx, cy, dir, alcance, dano, poder); };
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
    if (st.red) { st.red.cerrar(); st.red = null; }
    if (Array.isArray(scene._lucesExtras)) {
      var i = scene._lucesExtras.indexOf(st.luces);
      if (i >= 0) scene._lucesExtras.splice(i, 1);
    }
    if (st.barra && st.barra.parentNode) st.barra.parentNode.removeChild(st.barra);
    st.barra = null;
    st.bolas.forEach(function (b) { try { b.spr.destroy(); b.estela.destroy(); if (b.halo) b.halo.destroy(); } catch (e) {} });
    st.bolas.length = 0;
    (st.surcos || []).concat(st.efectos || []).slice().forEach(function (o) { try { if (o && o.scene) o.destroy(); } catch (e) {} });
    st.surcos = []; st.efectos = [];
    limpiarBotin(st);
    var s = st.s;
    if (s) {
      if (s.aviso) s.aviso.destroy();
      s.anillos.concat(s.sombras, [s.cabeza, s.sombraCabeza, s.monticulo, s.agujero],
                       s.ropes || [], s.brasas || [], s.sombrasRope || []).forEach(function (o) {
        try { if (o && o.scene) o.destroy(); } catch (e) {}
      });
    }
    st.s = null;
    (scene.__gfSerpSounds||[]).slice().forEach(function(v){v.sources.forEach(function(n){try{n.stop();}catch(e){}});v.nodes.forEach(function(n){try{n.disconnect();}catch(e){}});});scene.__gfSerpSounds=[];
    scene.__gfSerpiente = null;
  }

  window.GFMinaSerpiente = {
    _botin: { crear: soltarMonton, actualizar: actualizarBotin, texturas: texturas, limpiar: limpiarBotin },
    montar: montar,
    desmontar: desmontar,
    _interno: { estado: function (s) { return s && s.__gfSerpiente; }, gritar: gritar, velocidadJugador: velocidadJugador,
                // (2026-10-19) Para probar los poderes nuevos a mano (consola / pruebas).
                poder: function (scene, cual) {
                  var st = scene && scene.__gfSerpiente, s = st && st.s;
                  if (!s || !s.vivo || FUERA.indexOf(s.estado) < 0) return false;
                  var pj = piesJugador(scene);
                  if (cual === 'aliento') aliento(st, Math.atan2(pj.y - 30 - (s.y - 14), pj.x - s.x));
                  else if (cual === 'geiser') geiseres(st, puntosGeiser(st, { x: pj.x, y: pj.y }));
                  else return false;
                  return true;
                } }
  };
})();
