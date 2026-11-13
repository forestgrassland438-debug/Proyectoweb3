/* ===========================================================================
 * gf-poderes.js — EL IMPULSO (C) Y LA RÁFAGA DE VIENTO (X)         (2026-11-02)
 *
 * "En la letra X quiero que el personaje tenga un poder de empujar animales o
 * personas o enemigos, pero a los monstruos un poco, con un poder de viento. Y
 * en la C un poder que haga un impulso de distancia para alcanzar cosas
 * rápidamente, como hacen los lobos."
 *
 *   C  EL IMPULSO   Sale disparado unos 210 px hacia donde anda (o mira). Va por
 *                   pasos de 3 px con la misma caja de pies que el resto del
 *                   juego: se para ANTES de una pared, nunca dentro.
 *   X  EL VIENTO    Un cono delante del personaje. Los animales salen volando,
 *                   las personas se desplazan y los monstruos apenas ceden. No
 *                   hace daño a nadie.
 *
 * NO HACEN FALTA ARMA NI NIVEL y no cuestan nada: solo la espera (el reloj del
 * botón). Siendo fantasma, pescando o a bordo no se usan.
 *
 * LA RED: el viento va por el socket ('poder:viento'). El servidor lo reparte a
 * la sala con SU posición del jugador (no la que diga el cliente) y frena el
 * spam. Cada navegador se empuja a sí mismo: la posición del jugador la lleva
 * su cliente en todo el juego. A los monstruos los mueve quien los piensa
 * (gf-mobs-red: el anfitrión), igual que el daño de un espadazo.
 *
 * El impulso no necesita red: la posición ya viaja en playerMove.
 *
 * CÓMO SE ENGANCHA: gf-espada.js lo monta en cada escena con jugador.
 * ======================================================================== */
(function () {
  'use strict';

  var IMPULSO = { espera: 3500, largo: 210, dura: 170, nombre: 'Dash' };
  var VIENTO = { espera: 7000, radio: 190, arco: 1.05, nombre: 'Wind Gust', animal: 150, jugador: 110, monstruo: 30, jefe: 8 };
  // Caja de los pies, la misma que usan las escenas (x-15, y+25, 30 de ancho).
  var PIE_X = 15, PIE_Y = 25, PIE_W = 30, PIE_H = 26;

  var SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var ICONOS = {
    c: SVG + '<path d="M3 12h9"/><path d="M4.5 7.5h6"/><path d="M4.5 16.5h6"/><path d="M13 5.5l7 6.5-7 6.5"/></svg>',
    x: SVG + '<path d="M3 8.5h10.5a2.7 2.7 0 1 0-2.6-3.4"/><path d="M3 12.5h15a2.8 2.8 0 1 1-2.7 3.6"/><path d="M3 16.5h7.5a2.3 2.3 0 1 1-2.2 3"/></svg>'
  };

  function estilos() {
    if (document.getElementById('gf-poderes-estilo')) return;
    var s = document.createElement('style');
    s.id = 'gf-poderes-estilo';
    /* El mismo aspecto que la barra de poderes de la espada: tarjeta verde, filo dorado y el reloj
       de la espera como un sector que se vacía (sin tramas). */
    s.textContent = [
      '#gf-poderes-libres{position:fixed;left:var(--gfp-left,14px);bottom:var(--gfp-bottom,86px);z-index:1000;display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:14px;',
      'background:linear-gradient(180deg,rgba(29,52,45,.86),rgba(17,30,26,.9));border:2px solid rgba(211,189,133,.75);box-shadow:0 4px 0 rgba(10,16,12,.8),0 6px 16px rgba(0,0,0,.35);user-select:none;-webkit-user-select:none;}',
      '#gf-poderes-libres[hidden]{display:none;}',
      '#gf-poderes-libres .gf-poder{position:relative;width:48px;height:48px;padding:0;border-radius:50%;border:2px solid #d3bd85;background:radial-gradient(circle at 35% 30%,#2f5446,#172b24 72%);color:#fff5ce;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 0 #0f1a14,inset 0 2px 0 rgba(255,255,255,.14);cursor:pointer;touch-action:none;-webkit-tap-highlight-color:transparent;transition:transform .08s,border-color .15s,filter .15s;}',
      '#gf-poderes-libres .gf-poder svg{width:58%;height:58%;pointer-events:none;}',
      '#gf-poderes-libres .gf-poder:hover:not(:disabled){border-color:#ffe6a6;filter:brightness(1.12);}',
      '#gf-poderes-libres .gf-poder:active:not(:disabled){transform:scale(.92);}',
      '#gf-poderes-libres .gf-poder:disabled{cursor:default;}',
      '#gf-poderes-libres .gf-poder-tecla{position:absolute;right:-5px;bottom:-5px;min-width:17px;height:17px;padding:0 3px;box-sizing:border-box;border-radius:5px;border:1px solid #d3bd85;background:#241a10;color:#ffe6a6;font:bold 11px/15px monospace;text-align:center;pointer-events:none;}',
      '#gf-poderes-libres .gf-poder-reloj{position:absolute;inset:0;border-radius:50%;background:conic-gradient(rgba(8,12,10,.72) calc(var(--p,0)*360deg),transparent 0);pointer-events:none;}',
      '#gf-poderes-libres .gf-poder-seg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font:bold 15px monospace;text-shadow:0 1px 2px #000;pointer-events:none;}',
      '#gf-poderes-libres .gf-poder.esperando svg{opacity:.45;}',
      '#gf-poderes-libres.gf-tactil .gf-poder{width:54px;height:54px;}',
      /* Con el chat abierto y sin sitio (pantallas pequeñas) el panel se guarda: tapaba los mensajes. */
      '#gf-poderes-libres.gf-tapado{display:none;}',
      'body.in-battle #gf-poderes-libres{display:none;}'
    ].join('');
    document.head.appendChild(s);
  }

  // ───────────────────────────────────────────────────────── CHOQUES
  function choca(scene, x, y, w, h) {
    if (typeof scene._chocaConEscenario === 'function') return !!scene._chocaConEscenario(x, y, w, h);
    // La tienda no tiene índice de colisiones: sus rectángulos, a mano.
    var listas = [scene.collisionRectangles, scene.collisionRectangles1, scene.collisionRectangles2];
    for (var i = 0; i < listas.length; i++) {
      var l = listas[i];
      if (!Array.isArray(l)) continue;
      for (var k = 0; k < l.length; k++) {
        var o = l[k];
        if (o && o.width > 0 && o.height > 0 && !(x + w < o.x || y + h < o.y || x > o.x + o.width || y > o.y + o.height)) return true;
      }
    }
    return false;
  }
  function piesLibres(scene, x, y) {
    var M = scene.map, W = M ? M.widthInPixels : 1e9, H = M ? M.heightInPixels : 1e9;
    if (x < 24 || y < 24 || x > W - 24 || y > H - 56) return false;
    if (choca(scene, x - PIE_X, y + PIE_Y, PIE_W, PIE_H)) return false;
    // Andar por el agua no se puede: el impulso tampoco (el bote es otra cosa).
    try {
      if (window.GFAgua && window.GFAgua.claseEn && window.GFAgua.claseEn(scene, x, y + PIE_Y + PIE_H / 2) > 0) return false;
    } catch (e) {}
    return true;
  }
  /** Mueve al jugador hasta `dist` px por pasos de 3; devuelve lo avanzado. */
  function avanzar(scene, ux, uy, dist) {
    var p = scene.player, hecho = 0;
    if (!p || !p.scene) return 0;
    // (2026-11-12) Saliendo por una puerta no se mueve: pisaría el sitio de llegada guardado.
    if (scene._cambiandoEscena) return 0;
    for (var k = 0; k < dist; k += 3) {
      var nx = p.x + ux * 3, ny = p.y + uy * 3;
      if (!piesLibres(scene, nx, ny)) {
        // Pegado a una pared se resbala por ella, como al andar.
        if (ux && piesLibres(scene, nx, p.y)) ny = p.y;
        else if (uy && piesLibres(scene, p.x, ny)) nx = p.x;
        else break;
      }
      p.x = nx; p.y = ny; hecho += 3;
    }
    try { if (p.body && p.body.reset) p.body.reset(p.x, p.y); } catch (e) {}
    scene.previousPosition = { x: p.x, y: p.y };
    scene.posicionplayerx = p.x; scene.posicionplayery = p.y;
    return hecho;
  }

  // ───────────────────────────────────────────────────────── ¿SE PUEDE?
  function bloqueado(scene) {
    var p = scene.player;
    if (!p || !p.scene || !p.active || scene._cambiandoEscena) return true;
    if (scene._accionPersonaje === 'pesca' || p.__gfABordo) return true;
    if (window.GFMuerte && window.GFMuerte.muerto && window.GFMuerte.muerto(scene)) {
      try { window.GFMuerte.bloquear(scene, 'attack'); } catch (e) {}
      return true;
    }
    return false;
  }
  function escribiendo() {
    var el = document.activeElement;
    return !!(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));
  }

  /** Hacia dónde: lo que se está pulsando; si no, donde mira. */
  function rumbo(scene) {
    var k = scene.keys || {}, dx = 0, dy = 0;
    var abajo = function (t) { return !!(t && t.isDown); };
    if (abajo(k.left) || abajo(k.leftArrow)) dx -= 1;
    if (abajo(k.right) || abajo(k.rightArrow)) dx += 1;
    if (abajo(k.up) || abajo(k.upArrow)) dy -= 1;
    if (abajo(k.down) || abajo(k.downArrow)) dy += 1;
    var mm = scene.mouseMovement;
    if (!dx && !dy && mm && (mm.followCursorActive || mm.isHolding)) { dx = Number(mm.directionX) || 0; dy = Number(mm.directionY) || 0; }
    if (!dx && !dy) {
      var v = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[scene.lastDirection] || [1, 0];
      dx = v[0]; dy = v[1];
    }
    var L = Math.hypot(dx, dy) || 1;
    return { x: dx / L, y: dy / L };
  }

  // ───────────────────────────────────────────────────────── DIBUJOS
  function texturas(scene) {
    if (!scene.textures.exists('gfp_rafaga')) {
      /* Un remolino de tres trazos largos: líneas, ni puntos ni motas. */
      var c = scene.textures.createCanvas('gfp_rafaga', 96, 64), x = c.getContext();
      x.lineCap = 'round';
      [[12, 16, 62, 12, 3.2, 0.95], [6, 32, 78, 30, 4, 1], [16, 48, 66, 50, 3.2, 0.9]].forEach(function (t) {
        x.strokeStyle = 'rgba(232,246,255,' + t[5] + ')';
        x.lineWidth = t[4];
        x.beginPath();
        x.moveTo(t[0], t[1]);
        x.bezierCurveTo(t[0] + 22, t[1] - 7, t[2] - 14, t[3] + 7, t[2], t[3]);
        x.arc(t[2], t[3] - 7, 7, Math.PI / 2, -Math.PI * 0.6, true);
        x.stroke();
      });
      c.refresh();
    }
  }
  function borrar(st, o) {
    st.fx.add(o);
    if (o.once) o.once('destroy', function () { st.fx.delete(o); });
    return o;
  }
  function estela(st, x, y, textura, voltear, capa) {
    var scene = st.scene;
    /* Montado, lo que se ve no es el personaje (está invisible) sino su jinete y el animal:
       la estela es de ellos. Antes salía una fila de personajes a pie por debajo del caballo. */
    var M = window.GFMonturas, copias = null;
    try { copias = M && M.copias ? M.copias(scene, scene.player) : null; } catch (e) { copias = null; }
    if (copias) {
      copias.forEach(function (c) {
        borrar(st, c).setAlpha(0.36).setDepth(capa - 1).setTint(0xbfe6ff);
        scene.tweens.add({ targets: c, alpha: 0, duration: 230, onComplete: function () { if (c.scene) c.destroy(); } });
      });
      return;
    }
    if (!textura || !scene.textures.exists(textura)) return;
    var g = borrar(st, scene.add.image(x, y, textura)).setScale(2).setAlpha(0.42).setDepth(capa - 1).setTint(0xbfe6ff).setFlipX(!!voltear);
    scene.tweens.add({ targets: g, alpha: 0, duration: 230, onComplete: function () { if (g.scene) g.destroy(); } });
  }
  function rafagaVista(st, x, y, ang, escala) {
    var scene = st.scene;
    texturas(scene);
    var vx = Math.cos(ang), vy = Math.sin(ang), capa = 9000;
    [-0.42, 0, 0.42].forEach(function (d, i) {
      var a = ang + d;
      var r = borrar(st, scene.add.image(x + vx * 28, y + vy * 28, 'gfp_rafaga')).setRotation(a).setDepth(capa).setAlpha(0.95).setScale(0.75 * (escala || 1));
      if (r.setBlendMode && window.Phaser && Phaser.BlendModes) r.setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: r, x: x + Math.cos(a) * VIENTO.radio * 0.92, y: y + Math.sin(a) * VIENTO.radio * 0.92,
        scale: 1.55 * (escala || 1), alpha: 0, duration: 340 + i * 30, ease: 'Quad.easeOut', onComplete: function () { if (r.scene) r.destroy(); } });
    });
  }

  /** Un silbido sintetizado, sin archivos: ruido filtrado que barre. No ocupa memoria. */
  function silbido(scene, dura, desde, hasta, vol) {
    try {
      var ctx = scene.sound && scene.sound.context;
      if (!ctx || ctx.state !== 'running') return;
      var base = scene.audioState && Number.isFinite(scene.audioState.sfxVolumeApplied) ? scene.audioState.sfxVolumeApplied : 0.5;
      if (!(base > 0)) return;
      var n = Math.floor(ctx.sampleRate * dura), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      var src = ctx.createBufferSource(), fil = ctx.createBiquadFilter(), gan = ctx.createGain();
      src.buffer = buf; fil.type = 'bandpass'; fil.Q.value = 1.1;
      fil.frequency.setValueAtTime(desde, ctx.currentTime);
      fil.frequency.exponentialRampToValueAtTime(hasta, ctx.currentTime + dura);
      gan.gain.setValueAtTime(0.0001, ctx.currentTime);
      gan.gain.exponentialRampToValueAtTime(vol * base, ctx.currentTime + dura * 0.2);
      gan.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dura);
      src.connect(fil); fil.connect(gan); gan.connect(ctx.destination);
      src.start(); src.stop(ctx.currentTime + dura);
    } catch (e) {}
  }

  // ───────────────────────────────────────────────────────── EL IMPULSO
  function impulso(st) {
    var scene = st.scene, t = scene.time.now;
    if (t < st.listo.c || bloqueado(scene)) return false;
    var u = rumbo(scene), px = scene.player.x, py = scene.player.y;
    /* ¿Puede dar siquiera un paso? Con la misma cuenta que avanzar(): de frente, o resbalando
       por UN eje que de verdad se mueva. Antes la tercera prueba, yendo en horizontal, miraba
       el sitio donde ya se está (siempre libre): contra una pared el impulso "salía", gastaba
       la espera de 3,5 s y no movía nada. */
    if (!piesLibres(scene, px + u.x * 3, py + u.y * 3) &&
        !(u.x && piesLibres(scene, px + u.x * 3, py)) &&
        !(u.y && piesLibres(scene, px, py + u.y * 3))) return false;
    st.listo.c = t + IMPULSO.espera;
    st.total.c = IMPULSO.espera;
    st.impulso = { ux: u.x, uy: u.y, resto: IMPULSO.largo, hasta: t + IMPULSO.dura, ultEstela: 0 };
    silbido(scene, 0.22, 1400, 500, 0.32);
    try { scene.cameras.main.shake(70, 0.0016); } catch (e) {}
    pintar(st);
    return true;
  }
  function pasoImpulso(st, t, dt) {
    var imp = st.impulso, scene = st.scene, p = scene.player;
    if (!imp || !p || !p.scene) { st.impulso = null; return; }
    var porcion = Math.min(imp.resto, IMPULSO.largo * dt / IMPULSO.dura);
    if (t >= imp.hasta) porcion = imp.resto;
    if (t - imp.ultEstela > 26) {
      imp.ultEstela = t;
      estela(st, p.x, p.y, p.texture && p.texture.key, p.flipX, p.depth || p.y);
    }
    var hecho = avanzar(scene, imp.ux, imp.uy, porcion);
    imp.resto -= porcion;
    if (imp.resto <= 0 || hecho < porcion - 3) st.impulso = null;
  }

  // ───────────────────────────────────────────────────────── EL VIENTO
  function enCono(cx, cy, ang, x, y, radio, arco, margen) {
    var dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
    if (d > radio + (margen || 0)) return null;
    if (d > 26) {
      var da = Math.atan2(dy, dx) - ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > arco) return null;
    }
    var L = d || 1;
    return { ux: d > 1 ? dx / L : Math.cos(ang), uy: d > 1 ? dy / L : Math.sin(ang), d: d };
  }
  function empujarAnimales(st, cx, cy, ang) {
    var scene = st.scene, F = window.GFAnimales;
    if (!F || !F.empujarViento) return 0;
    return F.empujarViento(scene, cx, cy, ang, VIENTO.radio, VIENTO.arco, VIENTO.animal);
  }
  /* A los monstruos los mueve quien los piensa (`red.esHost()`), como el daño. Un jefe casi no cede. */
  function empujarMonstruos(st, cx, cy, ang) {
    var scene = st.scene, n = 0;
    var uno = function (m, x, y, margen, fn) {
      var r = enCono(cx, cy, ang, x, y, VIENTO.radio, VIENTO.arco, margen);
      if (!r) return;
      fn(m, r);
      n++;
    };
    try {
      var S = window.GFSalvaje && window.GFSalvaje._interno;
      var sv = S && S.estado(scene);
      if (sv && sv.vivo && (!sv.red || sv.red.esHost()) && S.empujarMonstruo) {
        sv.bichos.forEach(function (m) {
          if (!m.vivo || !m.spr.visible) return;
          uno(m, m.x, m.y, m.def.ancho * 0.5, function (b, r) { S.empujarMonstruo(sv, b, r.ux, r.uy, b.def.jefe ? VIENTO.jefe : (b.def.molde === 'golem' ? 14 : VIENTO.monstruo)); });
        });
      }
    } catch (e) {}
    try {
      var Z = window.GFMinaZombis && window.GFMinaZombis._interno;
      var zv = Z && Z.estado(scene);
      if (zv && zv.vivo && (!zv.red || zv.red.esHost()) && Z.empujarZombi) {
        zv.bichos.forEach(function (z) {
          if (!z.vivo || !z.spr.visible) return;
          uno(z, z.x, z.y, 18, function (b, r) { Z.empujarZombi(zv, b, r.ux, r.uy, b.jefe ? VIENTO.jefe : VIENTO.monstruo); });
        });
      }
    } catch (e) {}
    try {
      var E = window.GFMinaEspectros && window.GFMinaEspectros._interno;
      var ev = E && E.estado(scene);
      if (ev && ev.vivo && (!ev.red || ev.red.esHost()) && E.empujarEspectro) {
        ev.mobs.forEach(function (m) {
          if (!m.alive || !m.sprite.visible) return;
          uno(m, m.x, m.y, 18, function (b, r) { E.empujarEspectro(scene, b, r.ux, r.uy, VIENTO.monstruo); });
        });
      }
    } catch (e) {}
    return n;
  }
  function viento(st) {
    var scene = st.scene, t = scene.time.now;
    if (t < st.listo.x || bloqueado(scene)) return false;
    st.listo.x = t + VIENTO.espera;
    st.total.x = VIENTO.espera;
    var u = rumbo(scene), ang = Math.atan2(u.y, u.x), p = scene.player, cy = p.y + 10;
    rafagaVista(st, p.x, cy, ang);
    silbido(scene, 0.5, 700, 1800, 0.42);
    empujarAnimales(st, p.x, cy, ang);
    empujarMonstruos(st, p.x, cy, ang);
    var s = scene.socket || window.globalSocket;
    if (s && s.connected) { try { s.emit('poder:viento', { ang: Number(ang.toFixed(3)) }); } catch (e) {} }
    pintar(st);
    return true;
  }
  /** El viento de OTRO jugador: se ve, y si me pilla me mueve a mí. */
  function vientoAjeno(st, d) {
    var scene = st.scene, p = scene.player;
    if (!d || !st.vivo || !scene.sys || !scene.sys.isActive()) return;
    var ang = Number(d.ang), x = Number(d.x), y = Number(d.y);
    if (![ang, x, y].every(Number.isFinite)) return;
    var cy = y + 10;
    rafagaVista(st, x, cy, ang);
    empujarAnimales(st, x, cy, ang);
    empujarMonstruos(st, x, cy, ang);
    if (!p || !p.scene || p.__gfABordo) return;
    var r = enCono(x, cy, ang, p.x, p.y + 10, VIENTO.radio, VIENTO.arco, 10);
    if (!r) return;
    st.soplo = { ux: r.ux, uy: r.uy, resto: VIENTO.jugador * (1 - Math.min(0.6, r.d / VIENTO.radio * 0.6)), hasta: scene.time.now + 240 };
    silbido(scene, 0.3, 900, 500, 0.2);
  }
  function pasoSoplo(st, t, dt) {
    var so = st.soplo, scene = st.scene;
    if (!so) return;
    var porcion = Math.min(so.resto, Math.max(2, VIENTO.jugador * dt / 240));
    if (t >= so.hasta) porcion = so.resto;
    avanzar(scene, so.ux, so.uy, porcion);
    so.resto -= porcion;
    if (so.resto <= 0) st.soplo = null;
  }

  // ───────────────────────────────────────────────────────── BOTONES
  function esTactil() { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); }
  function botones(st) {
    estilos();
    var panel = document.getElementById('gf-poderes-libres');
    if (!panel) { panel = document.createElement('div'); panel.id = 'gf-poderes-libres'; document.body.appendChild(panel); }
    panel.innerHTML = '';
    panel.setAttribute('role', 'toolbar');
    panel.setAttribute('aria-label', 'Powers');
    st.panel = panel;
    st.botones = [];
    [['c', IMPULSO, impulso], ['x', VIENTO, viento]].forEach(function (par) {
      var tecla = par[0], def = par[1], fn = par[2];
      var b = document.createElement('button');
      b.type = 'button'; b.tabIndex = -1; b.className = 'gf-poder';
      b.setAttribute('data-tecla', tecla);
      b.setAttribute('aria-label', def.nombre + ' (' + tecla.toUpperCase() + ')');
      b.title = def.nombre + ' — ' + tecla.toUpperCase();
      b.innerHTML = ICONOS[tecla] + '<span class="gf-poder-tecla">' + tecla.toUpperCase() + '</span><span class="gf-poder-reloj"></span><span class="gf-poder-seg"></span>';
      var activar = function (e) { e.preventDefault(); e.stopPropagation(); fn(st); };
      b.addEventListener('pointerdown', activar);
      panel.appendChild(b);
      st.botones.push({ b: b, activar: activar, tecla: tecla, reloj: b.querySelector('.gf-poder-reloj'), seg: b.querySelector('.gf-poder-seg') });
    });
    colocar(st);
  }
  function caja(id) {
    var e = document.getElementById(id);
    if (!e || e.hidden) return null;
    var r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? r : null;
  }
  /* PC: a la izquierda de la barra rápida, a su altura. Móvil: encima del botón del chat, a mano del
     pulgar izquierdo (el derecho ya lleva el abanico de la espada). */
  /** La caja del chat ABIERTO (no la del botón), o null. */
  function cajaChatAbierto() {
    var c = document.getElementById('chat-panel');
    if (!c || c.classList.contains('chat-hidden')) return null;
    var cs = getComputedStyle(c);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    var r = c.getBoundingClientRect();
    return r.width > 8 && r.height > 8 ? r : null;
  }
  var ESTORBOS_HUD = '#cajahub, .corner-box, #round-buttons-container .round-btn, #quick-slots-bar, #inv-shortcut-btn, #gf-espada-btn, ' +
    '#toggle-hud-btn, #gf-pesca-btn, #gf-bote-btn, #gf-espada-poderes, #open-chat-btn';
  function pisaHud(r, panel) {
    var lista = document.querySelectorAll(ESTORBOS_HUD);
    for (var i = 0; i < lista.length; i++) {
      var e = lista[i];
      if (e.hidden || e === panel || panel.contains(e)) continue;
      var b = e.getBoundingClientRect();
      if (b.width < 4 || b.height < 4) continue;
      if (Math.min(r.right, b.right) - Math.max(r.left, b.left) > 2 && Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top) > 2) return true;
    }
    return false;
  }
  function colocar(st) {
    var panel = st.panel;
    if (!panel || !panel.isConnected) return;
    var tactil = esTactil(), H = window.innerHeight, Wv = window.innerWidth, barra = caja('quick-slots-bar'), chat = caja('open-chat-btn');
    panel.classList.toggle('gf-tactil', tactil);
    var estabaTapado = panel.classList.contains('gf-tapado');
    if (estabaTapado) panel.classList.remove('gf-tapado');       // para poder medirlo
    var ancho = panel.offsetWidth || 130, alto = panel.offsetHeight || 64;
    var left = 14, bottom = 86;
    if (!tactil && barra && barra.left - 12 - ancho >= (chat ? chat.right + 10 : 14)) {
      left = barra.left - 12 - ancho;
      bottom = H - barra.bottom + Math.max(0, (barra.height - alto) / 2);
    } else if (chat) {
      left = Math.max(8, chat.left);
      bottom = H - chat.top + 10;
    }
    // En el teléfono el botón del chat va a la derecha: el panel no se puede salir por ahí.
    left = Math.max(8, Math.min(left, Wv - ancho - 8));
    /* EL CHAT ABIERTO MANDA (2026-11-10). "El panel de poderes C, X, H tapa el panel de chat
       en resoluciones bajas": el sitio se calculaba contra el BOTÓN del chat, y al abrirse el
       panel de mensajes (mucho más grande) los poderes quedaban encima. Si lo pisa, se prueba
       encima del chat, a su derecha y a su izquierda; y si no cabe en ningún sitio sin pisar
       otro control, se guarda mientras el chat esté abierto (escribiendo no se usan). */
    var abierto = cajaChatAbierto(), tapado = false;
    if (abierto) {
      var caben = function (l, b) {
        var r = { left: l, right: l + ancho, top: H - b - alto, bottom: H - b };
        if (r.left < 6 || r.right > Wv - 6 || r.top < 6 || r.bottom > H - 4) return false;
        var sobreChat = Math.min(r.right, abierto.right) - Math.max(r.left, abierto.left) > 2 &&
                        Math.min(r.bottom, abierto.bottom) - Math.max(r.top, abierto.top) > 2;
        return !sobreChat && !pisaHud(r, panel);
      };
      var pisaChat = Math.min(left + ancho, abierto.right) - Math.max(left, abierto.left) > 2 &&
                     Math.min(H - bottom, abierto.bottom) - Math.max(H - bottom - alto, abierto.top) > 2;
      if (pisaChat) {
        var sitios = [
          [Math.max(8, Math.min(abierto.left, Wv - ancho - 8)), H - abierto.top + 8],      // encima
          [abierto.right + 8, H - abierto.bottom + 4],                                      // a su derecha
          [abierto.left - ancho - 8, H - abierto.bottom + 4]                                // a su izquierda
        ], puesto = false;
        for (var i = 0; i < sitios.length && !puesto; i++) {
          if (caben(sitios[i][0], sitios[i][1])) { left = sitios[i][0]; bottom = sitios[i][1]; puesto = true; }
        }
        tapado = !puesto;
      }
    }
    panel.classList.toggle('gf-tapado', tapado);
    var l = Math.round(left) + 'px', bo = Math.round(bottom) + 'px', cambia = estabaTapado !== tapado;
    if (panel.style.getPropertyValue('--gfp-left') !== l) { panel.style.setProperty('--gfp-left', l); cambia = true; }
    if (panel.style.getPropertyValue('--gfp-bottom') !== bo) { panel.style.setProperty('--gfp-bottom', bo); cambia = true; }
    // Lo que se aparta de este panel (los poderes de la espada) tiene que volver a mirar.
    if (cambia && window.GFHudAjuste && window.GFHudAjuste.ajustar) { try { window.GFHudAjuste.ajustar(); } catch (e) {} }
  }
  function pintar(st) {
    var scene = st.scene, t = scene.time.now;
    var muerto = !!(window.GFMuerte && window.GFMuerte.muerto && window.GFMuerte.muerto(scene));
    if (st.panel) st.panel.classList.toggle('gf-fantasma', muerto);
    (st.botones || []).forEach(function (p) {
      var espera = Math.max(0, st.listo[p.tecla] - t), total = st.total[p.tecla] || 1, listo = espera <= 0;
      p.b.disabled = !listo || muerto;
      p.b.classList.toggle('esperando', !listo);
      var f = (listo ? 0 : Math.min(1, espera / total)).toFixed(3);
      if (p.reloj && p.reloj.style.getPropertyValue('--p') !== f) p.reloj.style.setProperty('--p', f);
      var txt = listo ? '' : String(Math.ceil(espera / 1000));
      if (p.seg && p.seg.textContent !== txt) p.seg.textContent = txt;
    });
  }

  // ───────────────────────────────────────────────────────── MONTAJE
  function montar(scene) {
    if (!scene || !scene.add || !scene.events || !scene.input || !scene.input.keyboard) return null;
    if (scene.__gfPoderes) return scene.__gfPoderes;
    var st = { scene: scene, vivo: true, listo: { c: 0, x: 0 }, total: { c: 1, x: 1 }, impulso: null, soplo: null, fx: new Set(), ultPinta: 0, ultSitio: 0 };
    scene.__gfPoderes = st;
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    try { botones(st); } catch (e) { desmontar(scene); console.warn('[poderes]', e); return null; }
    var tecla = function (fn) {
      return function (ev) {
        if ((ev && ev.repeat) || escribiendo()) return;
        fn(st);
      };
    };
    st.onC = tecla(impulso);
    st.onX = tecla(viento);
    scene.input.keyboard.on('keydown-C', st.onC);
    scene.input.keyboard.on('keydown-X', st.onX);
    st.onUpdate = function (t, delta) {
      if (!st.vivo) return;
      var dt = Math.min(50, delta || 16);
      try { if (st.impulso) pasoImpulso(st, t, dt); if (st.soplo) pasoSoplo(st, t, dt); } catch (e) { st.impulso = st.soplo = null; }
      if (t - st.ultPinta > 150) { st.ultPinta = t; pintar(st); }
      if (t - st.ultSitio > 1000) { st.ultSitio = t; colocar(st); }
    };
    scene.events.on('update', st.onUpdate);
    st.onVentana = function () { colocar(st); };
    window.addEventListener('resize', st.onVentana);
    window.addEventListener('orientationchange', st.onVentana);
    // Abrir o cerrar el chat recoloca el panel al momento (no al segundo siguiente).
    try {
      var panelChat = document.getElementById('chat-panel');
      if (panelChat && typeof MutationObserver === 'function') {
        st.obsChat = new MutationObserver(function () { if (st.vivo) colocar(st); });
        st.obsChat.observe(panelChat, { attributes: true, attributeFilter: ['class', 'style'] });
        // Y cuando CRECE (llegan mensajes, sale la barra de responder): se mide de nuevo al momento.
        if (typeof ResizeObserver === 'function') {
          st.tamChat = new ResizeObserver(function () { if (st.vivo) colocar(st); });
          st.tamChat.observe(panelChat);
        }
      }
    } catch (e) { st.obsChat = null; }
    // El socket es de la página; el oyente, de esta escena.
    st.socket = scene.socket || window.globalSocket || null;
    st.onViento = function (d) { vientoAjeno(st, d); };
    st.enganchar = function () {
      var s = scene.socket || window.globalSocket || null;
      if (s === st.socketPuesto) return;
      if (st.socketPuesto) { try { st.socketPuesto.off('poder:viento', st.onViento); } catch (e) {} }
      st.socketPuesto = s;
      if (s) s.on('poder:viento', st.onViento);
    };
    st.enganchar();
    st.relojSocket = scene.time.addEvent({ delay: 2000, loop: true, callback: st.enganchar });
    return st;
  }
  function desmontar(scene) {
    var st = scene && scene.__gfPoderes;
    if (!st) return;
    st.vivo = false;
    scene.__gfPoderes = null;
    try { scene.events.off('update', st.onUpdate); scene.events.off('shutdown', st.onApagar); scene.events.off('destroy', st.onApagar); } catch (e) {}
    try { if (scene.input && scene.input.keyboard) { scene.input.keyboard.off('keydown-C', st.onC); scene.input.keyboard.off('keydown-X', st.onX); } } catch (e) {}
    try { if (st.relojSocket) st.relojSocket.remove(false); } catch (e) {}
    if (st.socketPuesto) { try { st.socketPuesto.off('poder:viento', st.onViento); } catch (e) {} }
    if (st.onVentana) { window.removeEventListener('resize', st.onVentana); window.removeEventListener('orientationchange', st.onVentana); }
    if (st.obsChat) { try { st.obsChat.disconnect(); } catch (e) {} st.obsChat = null; }
    if (st.tamChat) { try { st.tamChat.disconnect(); } catch (e) {} st.tamChat = null; }
    (st.botones || []).forEach(function (p) { p.b.removeEventListener('pointerdown', p.activar); });
    if (st.panel) st.panel.remove();
    Array.from(st.fx).forEach(function (o) { try { scene.tweens.killTweensOf(o); if (o.scene) o.destroy(); } catch (e) {} });
    st.fx.clear();
    st.scene = null;
  }

  window.GFPoderes = { montar: montar, desmontar: desmontar, IMPULSO: IMPULSO, VIENTO: VIENTO,
    impulso: function (scene) { var st = scene && scene.__gfPoderes; return st ? impulso(st) : false; },
    viento: function (scene) { var st = scene && scene.__gfPoderes; return st ? viento(st) : false; },
    _interno: { enCono: enCono, piesLibres: piesLibres, avanzar: avanzar, rumbo: rumbo, vientoAjeno: vientoAjeno } };
})();
