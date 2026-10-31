/* ===========================================================================
 * gf-jefes.js — LOS JEFES DE CADA MAPA                            (2026-10-20)
 * ===========================================================================
 *
 * "Haz 1 jefe monstruo con gráficos detallados altísimos para cada mapa, en
 * 2.5D, con poderes altamente de gráficos y sus sonidos."
 *
 *   mapa salvaje   jefe_golem      The Mossback Titan       (cristal)
 *   cementerio     jefe_arana      The Bone Widow           (alma)
 *   desierto       jefe_escorpion  The Sand Emperor         (arena)
 *   tundra         jefe_lobo       Frostfang, the Pack King (hielo)
 *   glaciar        jefe_yeti       The Glacier King         (glaciar)   (2026-10-25)
 *   caverna        jefe_murcielago Nightwing, the Cave Matriarch (cueva)
 *   pradera        jefe_ent        Oakheart, the Elder Grove (bosque)
 *   (la mina ya tiene el suyo: la Serpiente de Magma, gf-mina-serpiente.js)
 *
 * Son monstruos de gf-salvaje.js (especies con `jefe`): andan, cazan, pegan,
 * mueren, sueltan botín y se comparten por la red como los demás. Esto pone
 * lo que los hace JEFES:
 *   · su GUARIDA, elegida igual en todos los navegadores (azar con semilla
 *     del mapa) en un claro amplio, lejos de las salidas y de la aparición;
 *   · el AURA de su color bajo los pies y la BARRA grande de arriba;
 *   · sus PODERES, con su dibujo y su sonido (sintetizado, sin archivos):
 *       nova     una onda de su elemento que se abre desde él;
 *       pinchos  una fila de púas (cristal, hueso, arena, hielo) que revienta
 *                del suelo hacia el blanco, con su aviso;
 *       lluvia   seis impactos alrededor del blanco: aviso y caída;
 *       orbes    cuatro orbes que persiguen durante unos segundos.
 *     Cada jefe usa tres. Los decide el anfitrión y los anuncia; cada
 *     navegador mira si le dan a SU jugador (motivo 'jefe_poder').
 * ======================================================================== */
(function () {
  'use strict';

  var JEFES = {
    SalvajeScene:    { tipo: 'jefe_golem',     tema: 'cristal', caja: [2700, 400, 4500, 2000], poderes: ['nova', 'pinchos', 'lluvia'] },
    CementerioScene: { tipo: 'jefe_arana',     tema: 'alma',    caja: [1300, 1300, 3700, 3700], poderes: ['orbes', 'pinchos', 'nova'] },
    DesiertoScene:   { tipo: 'jefe_escorpion', tema: 'arena',   caja: [800, 2700, 4200, 4500], poderes: ['lluvia', 'nova', 'pinchos'] },
    TundraScene:     { tipo: 'jefe_lobo',      tema: 'hielo',   caja: [800, 600, 4200, 2200], poderes: ['pinchos', 'nova', 'orbes'] },
    // (2026-10-25) Los de nivel 8, 9 y 10: el rey del glaciar entre las ruinas
    // del norte, la matriarca de los murciélagos en la guarida del oeste de la
    // caverna (la lluvia son estalactitas que caen) y el viejo roble andante
    // junto al círculo de piedras de la pradera.
    GlaciarScene:    { tipo: 'jefe_yeti',       tema: 'glaciar', caja: [1600, 300, 3600, 1500], poderes: ['lluvia', 'nova', 'pinchos'] },
    CavernaScene:    { tipo: 'jefe_murcielago', tema: 'cueva',   caja: [500, 3300, 1700, 4300], poderes: ['lluvia', 'orbes', 'nova'] },
    PraderaScene:    { tipo: 'jefe_ent',        tema: 'bosque',  caja: [900, 400, 2500, 1300], poderes: ['pinchos', 'orbes', 'nova'] }
  };
  var TEMAS = {
    cristal: { luz: '#b6ffd8', medio: '#5fe0a0', oscuro: '#1f7a4a', hex: 0x5fe0a0 },
    alma:    { luz: '#d8ffe8', medio: '#7dffb0', oscuro: '#2a6a4a', hex: 0x7dffb0 },
    arena:   { luz: '#fff0c0', medio: '#e6b85a', oscuro: '#8a5a1e', hex: 0xe6b85a },
    hielo:   { luz: '#f0fbff', medio: '#8ce9ff', oscuro: '#2f6fa8', hex: 0x8ce9ff },
    glaciar: { luz: '#ffffff', medio: '#b8e4ff', oscuro: '#3a6a9c', hex: 0xb8e4ff },
    cueva:   { luz: '#f2e2ff', medio: '#b48cff', oscuro: '#4a2a7a', hex: 0xb48cff },
    bosque:  { luz: '#f0ffd8', medio: '#8fd45a', oscuro: '#3a6a22', hex: 0x8fd45a }
  };
  var ID_JEFE = 900;
  var sonidos = new WeakMap();

  function demorar(st, ms, fn) {
    var j = st.jefe, evento;
    if (!j || !st.vivo) return;
    evento = st.scene.time.delayedCall(ms, function () { j.demoras.delete(evento); if (st.vivo && st.jefe === j) fn(); });
    j.demoras.add(evento);
    return evento;
  }

  function azar(s) { s = s >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  function semillaDe(t) { var h = 2166136261; for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ── LAS TEXTURAS (por canvas; bandas y rayas, sin motas) ─────────────────
  function lienzo(scene, clave, w, h, pinta) {
    if (scene.textures.exists(clave)) return;
    var t = scene.textures.createCanvas(clave, w, h);
    try { pinta(t.getContext(), w, h); t.refresh(); }
    catch (e) { if (scene.textures.exists(clave) && scene.textures.get(clave) === t) scene.textures.remove(clave); throw e; }
  }
  function texturas(scene, tema) {
    var c = TEMAS[tema];
    lienzo(scene, 'gfj_aura_' + tema, 160, 64, function (x, w, h) {
      x.save(); x.scale(1, h / w);
      var cy = (h / 2) * (w / h), g = x.createRadialGradient(w / 2, cy, 4, w / 2, cy, w / 2);
      g.addColorStop(0, c.luz); g.addColorStop(0.35, c.medio); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.globalAlpha = 0.6; x.fillStyle = g; x.beginPath(); x.arc(w / 2, cy, w / 2, 0, Math.PI * 2); x.fill(); x.restore();
    });
    lienzo(scene, 'gfj_anillo_' + tema, 256, 128, function (x, w, h) {
      x.save(); x.scale(1, h / w);
      var cy = (h / 2) * (w / h), g = x.createRadialGradient(w / 2, cy, w * 0.33, w / 2, cy, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.55, c.medio); g.addColorStop(0.75, c.luz); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.beginPath(); x.arc(w / 2, cy, w / 2, 0, Math.PI * 2); x.fill(); x.restore();
    });
    // La púa: tres caras (luz, medio, sombra) y el contorno.
    lienzo(scene, 'gfj_pincho_' + tema, 34, 72, function (x, w, h) {
      var cx = w / 2, base = h - 2;
      x.fillStyle = c.medio; x.beginPath(); x.moveTo(cx - 13, base); x.lineTo(cx, 2); x.lineTo(cx + 13, base); x.closePath(); x.fill();
      x.fillStyle = c.luz; x.beginPath(); x.moveTo(cx - 13, base); x.lineTo(cx, 2); x.lineTo(cx - 2, base); x.closePath(); x.fill();
      x.fillStyle = c.oscuro; x.beginPath(); x.moveTo(cx + 3, base); x.lineTo(cx, 2); x.lineTo(cx + 13, base); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(20,16,24,0.9)'; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(cx - 13, base); x.lineTo(cx, 2); x.lineTo(cx + 13, base); x.closePath(); x.stroke();
    });
    lienzo(scene, 'gfj_orbe_' + tema, 48, 48, function (x, w, h) {
      var g = x.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, c.luz); g.addColorStop(0.6, c.medio); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    });
    lienzo(scene, 'gfj_aviso_' + tema, 96, 40, function (x, w, h) {
      x.save(); x.scale(1, h / w);
      var cy = (h / 2) * (w / h), g = x.createRadialGradient(w / 2, cy, w * 0.2, w / 2, cy, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.75, c.medio); g.addColorStop(0.9, c.luz); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.beginPath(); x.arc(w / 2, cy, w / 2, 0, Math.PI * 2); x.fill(); x.restore();
    });
    lienzo(scene, 'gfj_raya_' + tema, 4, 22, function (x, w, h) {
      var g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, c.luz); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    });
  }

  // ── LOS SONIDOS ──────────────────────────────────────────────────────────
  function sonido(scene, tipo, fuerza) {
    var liberar = null;
    try {
      var snd = scene.sound, ctx = snd && snd.context;
      if (!ctx || snd.mute || typeof ctx.createOscillator !== 'function') return;
      var vol = (scene.audioState && Number.isFinite(scene.audioState.sfxVolumeApplied)) ? scene.audioState.sfxVolumeApplied : 0.5;
      vol *= (Number.isFinite(snd.volume) ? snd.volume : 1) * (fuerza || 1);
      if (vol <= 0.001) return;
      var t0 = ctx.currentTime, nodos = [];
      var registro = sonidos.get(scene), reloj = null;
      if (!registro) { registro = new Set(); sonidos.set(scene, registro); }
      liberar = function () { clearTimeout(reloj); registro.delete(liberar); nodos.forEach(function (n) { try { if (n.stop) n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} }); nodos.length = 0; };
      registro.add(liberar);
      var ruido = function (dur, f0, f1, tipoF, g0) {
        var n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        var s = ctx.createBufferSource(); nodos.push(s); s.buffer = buf;
        var f = ctx.createBiquadFilter(); nodos.push(f); f.type = tipoF; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
        var g = ctx.createGain(); nodos.push(g); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(g0 * vol, t0 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        s.connect(f); f.connect(g); g.connect(ctx.destination); s.start(t0); s.stop(t0 + dur);
      };
      var tono = function (dur, f0, f1, forma, g0) {
        var o = ctx.createOscillator(); nodos.push(o); o.type = forma; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
        var g = ctx.createGain(); nodos.push(g); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(g0 * vol, t0 + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(ctx.destination); o.start(t0); o.stop(t0 + dur);
      };
      if (tipo === 'rugido') { tono(1.6, 140, 46, 'sawtooth', 0.32); ruido(1.4, 1800, 300, 'bandpass', 0.18); }
      else if (tipo === 'nova') { tono(0.9, 90, 30, 'sine', 0.5); ruido(0.9, 2400, 200, 'lowpass', 0.3); }
      else if (tipo === 'pincho') { tono(0.18, 1400, 2600, 'triangle', 0.12); ruido(0.25, 3000, 900, 'bandpass', 0.12); }
      else if (tipo === 'impacto') { tono(0.5, 110, 40, 'sine', 0.45); ruido(0.5, 1600, 180, 'lowpass', 0.25); }
      else if (tipo === 'orbes') { tono(0.7, 520, 1040, 'sine', 0.14); tono(0.7, 780, 1560, 'sine', 0.08); }
      reloj = setTimeout(liberar, 2000);
    } catch (e) { if (liberar) liberar(); }
  }

  // ── LA GUARIDA (igual en todos: azar con semilla) ──────────────────────
  var cachePuestos=new Map();
  function puesto(scene) {
    var key = scene.sys && scene.sys.settings ? scene.sys.settings.key : '';
    var cfg = Object.prototype.hasOwnProperty.call(JEFES, key) ? JEFES[key] : null;
    if (!cfg || !scene.map) return null;
    var lib = function (x, y, r) {
      if (typeof scene._chocaConEscenario !== 'function') return true;
      for (var k = 0; k < 8; k++) {
        var a = k / 8 * Math.PI * 2;
        if (scene._chocaConEscenario(x + Math.cos(a) * r - 20, y + Math.sin(a) * r * 0.7 - 10, 40, 20)) return false;
      }
      return !scene._chocaConEscenario(x - 45, y - 24, 90, 24);
    };
    var lejosDe = [];
    (scene._salidas || []).forEach(function (s) { lejosDe.push({ x: s.rect.centerX, y: s.rect.centerY, r: 900 }); });
    try { var ap = scene._puntoDeAparicion && scene._puntoDeAparicion(); if (ap) lejosDe.push({ x: ap.x, y: ap.y, r: 900 }); } catch (e) {}
    var cm = scene.map.getObjectLayer('monstruos');
    (cm ? cm.objects : []).forEach(function (o) { lejosDe.push({ x: o.x, y: o.y, r: 260 }); });
    var cacheKey=key+'|'+JSON.stringify([cfg.caja,lejosDe]),cached=cachePuestos.get(cacheKey);
    if(cached){var valid=true;for(var check=60;check<=cached.clearance*60;check+=60)if(!lib(cached.point.x,cached.point.y,check)){valid=false;break;}if(valid)return Object.assign({},cached.point);cachePuestos.delete(cacheKey);}
    var r = azar(semillaDe(key + '|jefe')), caja = cfg.caja, mejor = null, holgura = -1;
    for (var i = 0; i < 500; i++) {
      var x = caja[0] + r() * (caja[2] - caja[0]), y = caja[1] + r() * (caja[3] - caja[1]);
      if (lejosDe.some(function (p) { return Math.hypot(p.x - x, p.y - y) < p.r; })) continue;
      var h = 0;
      for (var rad = 60; rad <= 300; rad += 60) { if (lib(x, y, rad)) h++; else break; }
      if (h > holgura) { holgura = h; mejor = { x: Math.round(x), y: Math.round(y), tipo: cfg.tipo, tema: cfg.tema, id: ID_JEFE }; if (h >= 5) break; }
    }
    if(mejor){if(cachePuestos.size>=16)cachePuestos.delete(cachePuestos.keys().next().value);cachePuestos.set(cacheKey,{point:Object.assign({},mejor),clearance:holgura});}
    return mejor;
  }

  // ── EL JEFE MONTADO: aura, barra y su sonido ────────────────────────────
  function decorar(st, m, A) {
    var scene = st.scene, key = scene.sys.settings.key, cfg = Object.prototype.hasOwnProperty.call(JEFES, key) ? JEFES[key] : null;
    if (!cfg) return;
    desmontar(st);
    var j = { m: m, cfg: cfg, aura: null, rayas: [], barra: null, A: A, rugio: false, oyentes: new Set(), demoras: new Set() };
    st.jefe = j;
    try {
    texturas(scene, cfg.tema);
    var aura = j.aura = scene.add.image(m.x, m.y, 'gfj_aura_' + cfg.tema);
    aura.setDepth(2.6).setScale(1.6).setAlpha(0.7);
    aura.setBlendMode(Phaser.BlendModes.ADD);
    for (var i = 0; i < 6; i++) {
      var r = scene.add.image(m.x, m.y, 'gfj_raya_' + cfg.tema);
      j.rayas.push({ spr: r, vida: 0 });
      r.setDepth(m.y + 1).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    }
    } catch (e) { desmontar(st); throw e; }
  }
  function barra(st, j, ver) {
    var el = j.barra;
    if (!el) {
      el = j.barra = document.createElement('div');
      el.className = 'gf-jefe-barra';
      el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:50%;top:118px;transform:translateX(-50%);z-index:9000;width:min(320px,calc(100vw - 140px));' +
        'min-width:160px;pointer-events:none;font:700 12px/1.2 inherit;color:#fff3d0;text-align:center;text-shadow:0 1px 2px #000;display:none';
      el.innerHTML = '<div class="gfj-n">👑 </div>' +
        '<div style="margin-top:4px;height:12px;border-radius:7px;background:rgba(10,6,14,.8);border:1px solid ' + TEMAS[j.cfg.tema].medio + ';overflow:hidden">' +
        '<div class="gfj-v" style="height:100%;width:100%;background:linear-gradient(90deg,' + TEMAS[j.cfg.tema].oscuro + ',' + TEMAS[j.cfg.tema].medio + ',' + TEMAS[j.cfg.tema].luz + ');transition:width .15s"></div></div>';
      document.body.appendChild(el);
    }
      var label=el.querySelector('.gfj-n');if(label)label.textContent='👑 '+String(j.m.def.nombre || '');
    el.style.display = ver ? 'block' : 'none';
    if (ver) { var v = el.querySelector('.gfj-v'); if (v) v.style.width = Math.max(0, j.m.vida / j.m.max * 100).toFixed(1) + '%'; }
  }
  function tic(st, t, seg) {
    var j = st.jefe;
    if (!j) return;
    var m = j.m, scene = st.scene;
    var vivo = m.vivo && m.spr.visible;
    j.aura.setVisible(vivo).setPosition(m.x, m.y - 4).setAlpha(0.55 + 0.15 * Math.sin(t / 260)).setScale(1.6 + 0.08 * Math.sin(t / 400));
    // Unas rayas de su elemento que suben (despacio; nada de puntos).
    for (var i = 0; i < j.rayas.length; i++) {
      var r = j.rayas[i];
      if (!vivo) { r.spr.setVisible(false); continue; }
      if (r.vida <= 0 && Math.random() < seg * 1.4) {
        r.vida = r.max = 0.9 + Math.random() * 0.7; r.x = m.x + (Math.random() - 0.5) * 120; r.y = m.y - Math.random() * 40;
      }
      if (r.vida <= 0) { r.spr.setVisible(false); continue; }
      r.vida -= seg; r.y -= 55 * seg;
      r.spr.setVisible(true).setPosition(r.x, r.y).setDepth(m.y + 2).setAlpha(Math.max(0, r.vida / r.max) * 0.8);
    }
    var p = scene.player, cerca = p && Math.hypot(p.x - m.x, p.y + 45 - m.y) < 1000;
    var ver = !!(vivo && cerca && (m.estado === 'caza' || scene.time.now - m.heridoEn < 6000));
    if (ver && !j.rugio) { j.rugio = true; sonido(scene, 'rugido', 1); try { scene.cameras.main.shake(500, 0.008); } catch (e) {} }
    if (!ver && m.estado !== 'caza') j.rugio = false;
    if (ver !== !!j.barraVista || ver) { j.barraVista = ver; barra(st, j, ver); }
  }
  function desmontar(st) {
    var j = st && st.jefe;
    if (!j) return;
    st.jefe = null;
    j.oyentes.forEach(function (fn) { st.scene.events.off('update', fn); }); j.oyentes.clear();
    j.demoras.forEach(function (evento) { evento.remove(false); }); j.demoras.clear();
    var audio = sonidos.get(st.scene); if (audio) Array.from(audio).forEach(function (fin) { fin(); });
    try { j.aura.destroy(); } catch (e) {}
    j.rayas.forEach(function (r) { try { r.spr.destroy(); } catch (e) {} });
    if (j.barra && j.barra.parentNode) j.barra.parentNode.removeChild(j.barra);
  }

  // ── LOS PODERES (en TODOS los navegadores; cada uno mira a SU jugador) ──
  function pies(scene) { var p = scene.player; return { x: p.x, y: p.y + 45 }; }
  function efimero(st, A, o) { return A.efimero(st, o); }
  function golpe(st, A, x, y) { A.golpearJugador(st, 'jefe_poder', x, y, 34); }

  function nova(st, m, A) {
    var scene = st.scene, tema = st.jefe.cfg.tema, t0 = scene.time.now;
    A.animar(m, 'ataque');
    sonido(scene, 'nova', A.cercaDeMi(st, m.x, m.y, 900) ? 1 : 0.2);
    try { if (A.cercaDeMi(st, m.x, m.y, 700)) scene.cameras.main.shake(420, 0.01); } catch (e) {}
    var ox = m.x, oy = m.y, dado = false;
    [0, 160].forEach(function (retraso, k) {
      demorar(st, retraso, function () {
        var o = efimero(st, A, scene.add.image(ox, oy, 'gfj_anillo_' + tema).setDepth(2.95).setScale(0.2).setAlpha(0.95));
        o.setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({ targets: o, scale: 2.5 - k * 0.3, alpha: 0, duration: 900, ease: 'Quad.easeOut', onComplete: function () { A.soltarEfimero(st, o); } });
      });
    });
    m.accion = { hasta: t0 + 900, cada: function (t) {
      if (dado) return;
      var rad = Math.min(1, (t - t0) / 900) * 300, p = pies(scene);
      var d = Math.hypot((p.x - ox) / 1, (p.y - oy) / 0.5);
      if (Math.abs(d - rad) < 34) { dado = true; golpe(st, A, ox, oy); }
    } };
  }

  function pinchos(st, m, A, ang) {
    var scene = st.scene, tema = st.jefe.cfg.tema;
    A.animar(m, 'ataque');
    A.orientar(m, Math.cos(ang), Math.sin(ang));
    m.accion = { hasta: scene.time.now + 1100, cada: function () {} };
    for (var k = 0; k < 9; k++) {
      (function (k) {
        var x = m.x + Math.cos(ang) * (70 + k * 48), y = m.y + Math.sin(ang) * (70 + k * 48) * 0.85;
        if (!A.libre(scene, x, y, 10, 6)) return;
        demorar(st, k * 85, function () {
          if (!st.vivo) return;
          var av = efimero(st, A, scene.add.image(x, y, 'gfj_aviso_' + tema).setDepth(2.95).setScale(0.7).setAlpha(0.9));
          av.setBlendMode(Phaser.BlendModes.ADD);
          demorar(st, 380, function () {
            A.soltarEfimero(st, av);
            if (!st.vivo) return;
            sonido(scene, 'pincho', A.cercaDeMi(st, x, y, 600) ? 0.8 : 0.15);
            var p = efimero(st, A, scene.add.image(x, y + 4, 'gfj_pincho_' + tema).setOrigin(0.5, 1).setDepth(y + 2).setScale(1.3, 0.1));
            scene.tweens.add({ targets: p, scaleY: 1.4, duration: 110, ease: 'Back.easeOut' });
            scene.tweens.add({ targets: p, scaleY: 0.1, alpha: 0, delay: 650, duration: 260, onComplete: function () { A.soltarEfimero(st, p); } });
            var pj = pies(scene);
            if (Math.hypot(pj.x - x, pj.y - y) < 40) golpe(st, A, x, y);
          });
        });
      })(k);
    }
  }

  function lluvia(st, m, A, puntos) {
    var scene = st.scene, tema = st.jefe.cfg.tema;
    A.animar(m, 'ataque');
    m.accion = { hasta: scene.time.now + 700, cada: function () {} };
    sonido(scene, 'rugido', A.cercaDeMi(st, m.x, m.y, 900) ? 0.5 : 0.1);
    puntos.forEach(function (pt, k) {
      var x = pt[0], y = pt[1];
      demorar(st, k * 120, function () {
        if (!st.vivo) return;
        var av = efimero(st, A, scene.add.image(x, y, 'gfj_aviso_' + tema).setDepth(2.95).setScale(0.4).setAlpha(0.95));
        av.setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({ targets: av, scale: 1.0, duration: 850 });
        var cae = efimero(st, A, scene.add.image(x + 60, y - 520, 'gfj_pincho_' + tema).setOrigin(0.5, 1).setDepth(9000).setScale(1.1).setRotation(Math.PI + 0.12));
        var halo = efimero(st, A, scene.add.image(x + 60, y - 540, 'gfj_orbe_' + tema).setDepth(8999).setScale(1.3).setBlendMode(Phaser.BlendModes.ADD));
        scene.tweens.add({ targets: [cae, halo], x: x, y: '+=520', duration: 900, ease: 'Quad.easeIn', onComplete: function () {
          A.soltarEfimero(st, av); A.soltarEfimero(st, cae); A.soltarEfimero(st, halo);
          if (!st.vivo) return;
          sonido(scene, 'impacto', A.cercaDeMi(st, x, y, 600) ? 0.7 : 0.1);
          var o = efimero(st, A, scene.add.image(x, y, 'gfj_anillo_' + tema).setDepth(2.95).setScale(0.1).setBlendMode(Phaser.BlendModes.ADD));
          scene.tweens.add({ targets: o, scale: 0.55, alpha: 0, duration: 420, onComplete: function () { A.soltarEfimero(st, o); } });
          for (var c = 0; c < 6; c++) {
            var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 70 + Math.random() * 80;
            var r = efimero(st, A, scene.add.image(x, y - 6, 'gfj_raya_' + tema).setDepth(y + 3).setRotation(a + Math.PI / 2).setBlendMode(Phaser.BlendModes.ADD));
            scene.tweens.add({ targets: r, x: x + Math.cos(a) * v, y: y - 6 + Math.sin(a) * v, alpha: 0, duration: 480, onComplete: function (tw, tg) { A.soltarEfimero(st, tg[0]); } });
          }
          try { if (A.cercaDeMi(st, x, y, 500)) scene.cameras.main.shake(140, 0.006); } catch (e) {}
          var pj = pies(scene);
          if (Math.hypot(pj.x - x, pj.y - y) < 46) golpe(st, A, x, y);
        } });
      });
    });
  }

  function orbes(st, m, A, semilla) {
    var scene = st.scene, jefe = st.jefe, tema = jefe.cfg.tema, r = azar(semilla >>> 0);
    A.animar(m, 'ataque');
    m.accion = { hasta: scene.time.now + 600, cada: function () {} };
    sonido(scene, 'orbes', A.cercaDeMi(st, m.x, m.y, 900) ? 1 : 0.2);
    var lista = [];
    for (var i = 0; i < 4; i++) {
      var a = i / 4 * Math.PI * 2 + r(), o = efimero(st, A, scene.add.image(m.x + Math.cos(a) * 60, m.y - 40 + Math.sin(a) * 40, 'gfj_orbe_' + tema)
        .setDepth(9000).setScale(0.2).setBlendMode(Phaser.BlendModes.ADD));
      scene.tweens.add({ targets: o, scale: 1.0, duration: 300 });
      lista.push({ spr: o, x: o.x, y: o.y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, fin: scene.time.now + 5200 + i * 200, dado: false });
    }
    var alPaso = function (t, dl) {
      if (!st.vivo || st.jefe !== jefe || !scene.player) { scene.events.off('update', alPaso); jefe.oyentes.delete(alPaso); return; }
      var seg = Math.min(0.05, (dl || 16) / 1000), p = pies(scene), vivos = 0;
      lista.forEach(function (b) {
        if (!b.spr.scene) return;
        if (t > b.fin || b.dado) { A.soltarEfimero(st, b.spr); return; }
        vivos++;
        var dx = p.x - b.x, dy = (p.y - 34) - b.y, d = Math.hypot(dx, dy) || 1;
        b.vx += dx / d * 260 * seg; b.vy += dy / d * 260 * seg;
        var v = Math.hypot(b.vx, b.vy), tope = 150;
        if (v > tope) { b.vx *= tope / v; b.vy *= tope / v; }
        b.x += b.vx * seg; b.y += b.vy * seg;
        b.spr.setPosition(b.x, b.y).setScale(0.9 + 0.12 * Math.sin(t / 90));
        if (d < 26) { b.dado = true; golpe(st, A, b.x, b.y); }
      });
      if (!vivos || !st.vivo) { scene.events.off('update', alPaso); jefe.oyentes.delete(alPaso); }
    };
    scene.events.on('update', alPaso);
    jefe.oyentes.add(alPaso);
  }

  /** Anfitrión: ¿usa ahora un poder de jefe? (lo ejecuta y lo anuncia). */
  function poder(st, m, dist, b, anunciar, A) {
    var j = st.jefe;
    if (!j || j.m !== m || Math.random() < 0.3) return false;
    var cual = j.cfg.poderes[Math.floor(Math.random() * j.cfg.poderes.length)];
    if (cual === j.ultimo) cual = j.cfg.poderes[(j.cfg.poderes.indexOf(cual) + 1) % j.cfg.poderes.length];
    j.ultimo = cual;
    var d = { e: 'jefe', p: cual };
    if (cual === 'pinchos') d.a = Number(Math.atan2(b.y - m.y, b.x - m.x).toFixed(3));
    if (cual === 'lluvia') {
      d.pts = [[Math.round(b.x), Math.round(b.y)]];
      for (var i = 1; i < 6; i++) { var a = i / 5 * Math.PI * 2 + Math.random(), rr = 60 + Math.random() * 90; d.pts.push([Math.round(b.x + Math.cos(a) * rr), Math.round(b.y + Math.sin(a) * rr * 0.7)]); }
    }
    if (cual === 'orbes') d.s = Math.floor(Math.random() * 1e9);
    ejecutar(st, m, d, A);
    anunciar(d);
    return true;
  }
  function ejecutar(st, m, d, A) {
    if (!st || !st.vivo || !st.jefe || !m || !m.vivo || !d) return;
    if (d.p === 'nova') nova(st, m, A);
    else if (d.p === 'pinchos' && Number.isFinite(Number(d.a))) pinchos(st, m, A, Number(d.a) % (Math.PI * 2));
    else if (d.p === 'lluvia' && Array.isArray(d.pts) && d.pts.every(function (q) { return Array.isArray(q) && Number.isFinite(Number(q[0])) && Number.isFinite(Number(q[1])); })) lluvia(st, m, A, d.pts.slice(0, 6).map(function (q) { return [Number(q[0]), Number(q[1])]; }));
    else if (d.p === 'orbes') orbes(st, m, A, Number(d.s) || 1);
  }

  window.GFJefes = { puesto: puesto, decorar: decorar, tic: tic, desmontar: desmontar, poder: poder, ejecutar: ejecutar,
                     JEFES: JEFES, _interno: { texturas: texturas, sonido: sonido } };
})();
