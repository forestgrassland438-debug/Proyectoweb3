/* ===========================================================================
 * LOS MAPAS NUEVOS: VIAJES, CLIMA PROPIO, REMOLINOS Y LUCES       (2026-10-18)
 *
 * "Quiero 3 mapas nuevos del tamaño del mapa salvaje: un cementerio (todo
 * PvP), un desierto con clima de arena (a veces sí y a veces no) y
 * remolinos —cerca de uno el personaje se siente poco a poco arrastrado y,
 * si entra, le quita vida; el remolino no persigue: sigue su rumbo— y otro
 * que inventes (la tundra helada)." Las escenas están en
 * Scenes/ZonasScenes.js; aquí, lo que las hace distintas:
 *
 *   · VIAJAR entre el mapa salvaje y los nuevos (sus tres salidas, que antes
 *     ponían "Coming soon"): el mismo camino que entrar al salvaje desde el
 *     pueblo. Se guarda ANTES el mundo y el punto (la pantalla de carga solo
 *     lee lo guardado) y se deja la nota de viaje (GFViaje) con el punto de
 *     llegada, por si el guardado llega tarde.
 *   · CEMENTERIO: NIEBLA a ras de suelo (bandas lisas que se desplazan; de
 *     noche más espesa), por debajo de todo lo que está de pie.
 *   · DESIERTO: la TORMENTA DE ARENA, por ciclos (unos 4 minutos de cada 11),
 *     igual para todos (va con la hora del servidor): velo de arena, ráfagas
 *     en raya y el aire teñido. Y los REMOLINOS: cada uno da SU vuelta (capa
 *     `remolinos` del mapa: centro, radios y periodo) calculada con la hora
 *     del servidor, así que todos los ven en el mismo sitio sin mandarse
 *     nada. A menos de ATRAE px te arrastra hacia dentro, más cuanto más
 *     cerca, con un poco de giro; dentro (DANO px) te quita vida una vez por
 *     segundo (`remolino_arena`, lo cobra el servidor). Nunca te mete en una
 *     pared: se mueve paso a paso mirando las colisiones del mapa.
 *   · TUNDRA: NEVADA constante (copos que caen con vaivén).
 *   · LUCES DE NOCHE (gf-ciclo-dia, `scene._lucesNoche`): las farolas y la
 *     rendija de la cripta, la hoguera y los cristales de hielo.
 *
 * SIN MOTAS (tripofobia): niebla, velo y ráfagas son bandas y rayas lisas.
 *
 * CÓMO SE ENGANCHA:  ZonaScene.create():  GFZonas.montar(this, 'desierto')
 *                    salidas:             GFZonas.viajar(scene, 'desierto')
 * ======================================================================== */
(function () {
  'use strict';

  // Los mapas: su mundo, su escena, su sala y dónde se llega. La llegada,
  // a unos 230 px del borde: más cerca, un empujón de un monstruo (o un paso
  // de más) te devolvía por la misma salida nada más llegar.
  var ZONAS = {
    cementerio: { mundo: 7, escena: 'CementerioScene', sala: 'cementerio', nombre: 'Cemetery of Lost Souls', llegada: { x: 4790, y: 2208 } },
    desierto:   { mundo: 8, escena: 'DesiertoScene',   sala: 'desierto',   nombre: 'Scorching Desert',       llegada: { x: 3552, y: 230 } },
    tundra:     { mundo: 9, escena: 'TundraScene',     sala: 'tundra',     nombre: 'Frostfang Tundra',       llegada: { x: 3552, y: 4740 } },
    // Volver al mapa salvaje: al lado de la salida por la que se fue.
    salvaje_desde_cementerio: { mundo: 6, escena: 'SalvajeScene', sala: 'salvaje', nombre: 'Wild Lands', llegada: { x: 250, y: 2208 } },
    salvaje_desde_desierto:   { mundo: 6, escena: 'SalvajeScene', sala: 'salvaje', nombre: 'Wild Lands', llegada: { x: 3552, y: 4740 } },
    salvaje_desde_tundra:     { mundo: 6, escena: 'SalvajeScene', sala: 'salvaje', nombre: 'Wild Lands', llegada: { x: 3552, y: 230 } }
  };

  var ATRAE = 280, DANO = 54;                 // px: arrastra / hace daño
  var CICLO_TORMENTA = 11 * 60, DURA_TORMENTA = 4 * 60, RAMPA_TORMENTA = 25;   // segundos
  var PROF_NIEBLA = 2.95, PROF_AIRE = 8040;

  function aviso(scene, texto, tipo) {
    try { if (scene.notifications && scene.notifications.show) scene.notifications.show(texto, tipo || 'info'); } catch (e) {}
  }
  function api(ruta, cuerpo) {
    if (window.GFMascota && window.GFMascota.api) return window.GFMascota.api(ruta, cuerpo);
    return Promise.resolve({ ok: false, status: 0, datos: null });
  }
  function fantasma() {
    try {
      if (window.GFMuerte && window.GFMuerte.muerto) return !!window.GFMuerte.muerto();
      var e = window.GFMascota && window.GFMascota.estado && window.GFMascota.estado(); return !!(e && e.ghost);
    } catch (e2) { return false; }
  }

  /* LA HORA DEL SERVIDOR (la del ciclo de día y noche, ya sincronizada).
     Si el administrador congela la hora del mundo, `ahora` deja de avanzar:
     entonces se sigue con el último desfase bueno (los remolinos no paran). */
  var desfase = null;
  function ahoraServidor() {
    try {
      var e = window.GFCiclo && window.GFCiclo.estado && window.GFCiclo.estado();
      if (e && Number.isFinite(e.ahora)) {
        var d = e.ahora - Date.now();
        if (desfase === null || Math.abs(d - desfase) < 5000) desfase = d;
      }
    } catch (x) {}
    return Date.now() + (desfase || 0);
  }

  // ─────────────────────────────────────────────────────── EL VIAJE
  /**
   * De un mapa a otro (salvaje <-> nuevos). `cual`: clave de ZONAS.
   * Igual que GameScene.entrarEnSalvaje: guardado esperado, nota de viaje,
   * la sala nueva y la pantalla de carga.
   */
  function viajar(scene, cual) {
    var z = ZONAS[cual];
    if (!scene || !z || scene._cambiandoEscena || scene._viajeZona) return Promise.resolve(false);
    if (!scene.scene.get(z.escena)) {
      console.warn('[zonas] ' + z.escena + ' no está registrada: no se puede viajar');
      aviso(scene, 'This road is closed for now. Try again later.', 'info');
      return Promise.resolve(false);
    }
    scene._viajeZona = true;
    var previo = { mundo: scene.mundo, x: scene.posicionplayerx, y: scene.posicionplayery };
    var clave = scene.sys && scene.sys.settings ? scene.sys.settings.key : '';
    try { scene._cancelarArrastre(); } catch (e) {}
    try { scene.player.anims.stop(); } catch (e) {}
    scene.mundo = z.mundo;
    scene.posicionplayerx = z.llegada.x;
    scene.posicionplayery = z.llegada.y;
    // El candado corta el update() (que reescribiría la posición).
    scene._cambiandoEscena = true;
    window.__gfViaje = { mundo: z.mundo, x: z.llegada.x, y: z.llegada.y, islaDe: null, islaDeNombre: null, t: Date.now() };
    var guardar;
    try { guardar = Promise.resolve(scene.savegg()); } catch (e) { guardar = Promise.reject(e); }
    return guardar.then(function (ok) {
      if (ok === false) throw new Error('guardado no completado');
      console.log('🧭 de ' + clave + ' a ' + z.escena);
      try { scene._ocultarHUD(); } catch (e) {}
      try { scene.removeListener(); } catch (e) {}
      try { scene._unbindAllDomClicks(); } catch (e) {}
      try { scene.stopMusicSafely(); } catch (e) {}
      scene._salaDestino = z.sala;
      if (scene.socket && scene.socket.connected) {
        scene.socket.emit('joinRoom', { room: z.sala, username: scene.Username || '---', lastScene: clave, x: z.llegada.x, y: z.llegada.y });
      }
      try { scene.cleanupScene(); } catch (e) { console.warn('limpieza:', e); }
      scene._viajeZona = false;
      scene.scene.start('LoadingScenegame', { targetScene: z.escena, playerData: { x: z.llegada.x, y: z.llegada.y, mundo: z.mundo } });
      return true;
    }).catch(function (err) {
      console.warn('[zonas] guardado antes del viaje:', err);
      window.__gfViaje = null;
      scene.mundo = previo.mundo;
      scene.posicionplayerx = previo.x; scene.posicionplayery = previo.y;
      scene._cambiandoEscena = false;
      scene._salidaArmada = false;
      scene._viajeZona = false;
      aviso(scene, 'Unable to save your trip. Try again.', 'error');
      return false;
    });
  }

  // ─────────────────────────────────────────────────────── TEXTURAS (canvas)
  function lienzo(scene, clave, w, h, pinta) {
    if (scene.textures.exists(clave)) return;
    var c = scene.textures.createCanvas(clave, w, h);
    pinta(c.getContext(), w, h);
    c.refresh();
  }
  /** Manchas suaves que se repiten sin costura (cada una se pinta 9 veces). */
  function manchasCiclicas(x, w, h, manchas) {
    manchas.forEach(function (m) {
      for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
        var cx = m[0] + ox * w, cy = m[1] + oy * h;
        x.save();
        x.translate(cx, cy); x.scale(1, m[3]);
        var g = x.createRadialGradient(0, 0, 1, 0, 0, m[2]);
        g.addColorStop(0, m[4]); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.beginPath(); x.arc(0, 0, m[2], 0, Math.PI * 2); x.fill();
        x.restore();
      }
    });
  }
  function texturas(scene) {
    lienzo(scene, 'zn_niebla', 512, 128, function (x, w, h) {
      manchasCiclicas(x, w, h, [[90, 64, 150, 0.32, 'rgba(206,214,210,0.75)'], [300, 50, 170, 0.28, 'rgba(196,206,204,0.7)'],
                                [430, 82, 120, 0.3, 'rgba(214,220,216,0.65)'], [200, 96, 110, 0.26, 'rgba(190,200,198,0.6)']]);
    });
    lienzo(scene, 'zn_velo', 256, 256, function (x, w, h) {
      manchasCiclicas(x, w, h, [[60, 70, 120, 0.55, 'rgba(214,180,118,0.6)'], [190, 150, 130, 0.5, 'rgba(226,192,128,0.55)'],
                                [120, 220, 100, 0.45, 'rgba(200,164,104,0.5)'], [230, 40, 90, 0.5, 'rgba(232,202,140,0.45)']]);
    });
    lienzo(scene, 'zn_rafaga', 220, 5, function (x, w, h) {
      var g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(240,214,160,0)'); g.addColorStop(0.5, 'rgba(244,222,170,0.85)'); g.addColorStop(1, 'rgba(240,214,160,0)');
      x.fillStyle = g; x.fillRect(0, 1, w, 3);
      x.globalAlpha = 0.4; x.fillRect(0, 0, w, 1); x.fillRect(0, 4, w, 1);
    });
    lienzo(scene, 'zn_copo', 8, 8, function (x) {
      var g = x.createRadialGradient(4, 4, 0.5, 4, 4, 4);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.6, 'rgba(238,246,255,0.6)'); g.addColorStop(1, 'rgba(238,246,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 8, 8);
    });
    lienzo(scene, 'zn_sombra_remolino', 128, 40, function (x, w, h) {
      x.save(); x.scale(1, h / w);
      var cy = (h / 2) * (w / h);
      var g = x.createRadialGradient(w / 2, cy, 2, w / 2, cy, w / 2);
      g.addColorStop(0, 'rgba(90,60,30,0.45)'); g.addColorStop(0.7, 'rgba(90,60,30,0.2)'); g.addColorStop(1, 'rgba(90,60,30,0)');
      x.fillStyle = g; x.beginPath(); x.arc(w / 2, cy, w / 2, 0, Math.PI * 2); x.fill(); x.restore();
    });
  }

  function vista(scene) { return scene.cameras && scene.cameras.main ? scene.cameras.main.worldView : null; }
  /** Pone `o` sobre lo que ve la cámara; el tamaño, solo si cambió (rehacer
      un tileSprite cada fotograma sale caro). */
  function cubrir(o, v) {
    o.setPosition(v.x, v.y);
    var w = Math.ceil(v.width), h = Math.ceil(v.height);
    if (o.width !== w || o.height !== h) o.setSize(w, h);
    return o;
  }

  // ─────────────────────────────────────────────────────── CEMENTERIO: NIEBLA
  function montarNiebla(st) {
    var scene = st.scene;
    st.niebla = [0, 1, 2].map(function (i) {
      var t = scene.add.tileSprite(0, 0, 64, 64, 'zn_niebla').setOrigin(0, 0).setDepth(PROF_NIEBLA + i * 0.01);
      t.setTileScale(2 + i * 0.6, 2 + i * 0.4);
      return { spr: t, vx: [14, -9, 6][i], vy: [2, -1, 1.5][i], ox: i * 170, oy: i * 90 };
    });
  }
  function nieblaTic(st, dt) {
    var v = vista(st.scene);
    if (!v) return;
    var noche = 0;
    try { noche = window.GFCiclo && window.GFCiclo.oscuridad ? window.GFCiclo.oscuridad() : 0; } catch (e) {}
    st.niebla.forEach(function (n, i) {
      n.ox += n.vx * dt; n.oy += n.vy * dt;
      cubrir(n.spr, v);
      n.spr.setTilePosition((v.x + n.ox) / n.spr.tileScaleX, (v.y + n.oy) / n.spr.tileScaleY);
      n.spr.setAlpha((0.22 + 0.2 * noche) * (i === 2 ? 0.7 : 1));
    });
  }

  // ─────────────────────────────────────────────────────── DESIERTO: TORMENTA
  function fuerzaTormenta(t) {
    var k = ((t % CICLO_TORMENTA) + CICLO_TORMENTA) % CICLO_TORMENTA;
    if (k > DURA_TORMENTA) return 0;
    return Math.max(0, Math.min(1, k / RAMPA_TORMENTA, (DURA_TORMENTA - k) / RAMPA_TORMENTA));
  }
  function montarTormenta(st) {
    var scene = st.scene;
    st.tinte = scene.add.rectangle(0, 0, 16, 16, 0xd9b67a, 1).setOrigin(0, 0).setDepth(PROF_AIRE).setAlpha(0);
    st.velos = [0, 1].map(function (i) {
      return { spr: scene.add.tileSprite(0, 0, 64, 64, 'zn_velo').setOrigin(0, 0).setDepth(PROF_AIRE + 0.1 + i * 0.1).setAlpha(0).setTileScale(2.4 + i, 2.4 + i),
               ox: i * 300, vx: [150, 220][i], vy: [10, -14][i] };
    });
    st.rafagas = [];
    for (var i = 0; i < 34; i++) {
      st.rafagas.push({ spr: scene.add.image(0, 0, 'zn_rafaga').setDepth(PROF_AIRE + 0.3).setAlpha(0).setVisible(false),
                        x: Math.random(), y: Math.random(), v: 0.55 + Math.random() * 0.5, k: 0.6 + Math.random() * 1.3 });
    }
    st.tormentaVista = 0;
    st.enTormenta = false;
  }
  function tormentaTic(st, tSrv, dt) {
    var scene = st.scene, v = vista(scene);
    if (!v) return;
    var f = fuerzaTormenta(tSrv);
    // Suavizado: entra y sale poco a poco aunque la hora salte.
    st.tormentaVista += (f - st.tormentaVista) * Math.min(1, dt * 1.5);
    var a = st.tormentaVista;
    var ahora = a > 0.05;
    if (ahora !== st.enTormenta) {
      st.enTormenta = ahora;
      aviso(scene, ahora ? '🌪 A sandstorm is rolling in — you can barely see!' : '☀ The sandstorm has passed.', ahora ? 'warning' : 'info');
    }
    cubrir(st.tinte, v).setAlpha(0.3 * a).setVisible(a > 0.01);
    st.velos.forEach(function (n) {
      n.ox += n.vx * dt;
      cubrir(n.spr, v).setVisible(a > 0.01).setAlpha(0.55 * a);
      n.spr.setTilePosition((v.x - n.ox) / n.spr.tileScaleX, (v.y + n.vy * tSrv) / n.spr.tileScaleY);
    });
    st.rafagas.forEach(function (r) {
      if (a <= 0.01) { r.spr.setVisible(false); return; }
      r.x += r.v * dt * 1.6;
      if (r.x > 1.2) { r.x = -0.25; r.y = Math.random(); }
      r.spr.setVisible(true).setAlpha(0.6 * a).setScale(r.k, 1)
        .setPosition(v.x + r.x * v.width, v.y + r.y * v.height + Math.sin(tSrv * 2 + r.y * 9) * 6);
    });
  }

  // ─────────────────────────────────────────────────────── DESIERTO: REMOLINOS
  function montarRemolinos(st) {
    var scene = st.scene;
    st.remolinos = [];
    var capa = scene.map && scene.map.getObjectLayer('remolinos');
    if (!capa) return;
    if (!scene.anims.exists('zn_remolino') && scene.textures.exists('zn_remolino')) {
      scene.anims.create({ key: 'zn_remolino', frames: scene.anims.generateFrameNumbers('zn_remolino', { start: 0, end: 7 }), frameRate: 14, repeat: -1 });
    }
    capa.objects.forEach(function (o) {
      var p = {};
      (o.properties || []).forEach(function (q) { p[q.name] = Number(q.value); });
      if (!scene.textures.exists('zn_remolino')) return;
      var spr = scene.add.sprite(o.x, o.y, 'zn_remolino', 0).setOrigin(0.5, 0.94).setScale(2);
      if (scene.anims.exists('zn_remolino')) spr.play({ key: 'zn_remolino', startFrame: Math.floor(Math.random() * 8) });
      var sombra = scene.add.image(o.x, o.y, 'zn_sombra_remolino').setDepth(2.6).setScale(1.3);
      st.remolinos.push({ x: o.x, y: o.y, rx: p.rx || 300, ry: p.ry || 200, periodo: p.periodo || 45, fase: p.fase || 0,
                          vaiven: p.vaiven || 60, spr: spr, sombra: sombra, px: o.x, py: o.y });
    });
  }
  function posRemolino(r, t) {
    var a = (t / r.periodo) * Math.PI * 2 + r.fase;
    return { x: r.x + Math.cos(a) * r.rx + Math.sin(a * 2.7 + r.fase) * r.vaiven * 0.35,
             y: r.y + Math.sin(a) * r.ry + Math.cos(a * 1.9 + r.fase * 2) * r.vaiven * 0.25 };
  }
  /** Mueve al jugador (dx, dy) sin meterlo en una pared: por ejes, mirando las colisiones. */
  function arrastrar(scene, dx, dy) {
    var p = scene.player;
    var choca = function (x, y) {
      if (!scene.map || x < 24 || y < 24 || x > scene.map.widthInPixels - 24 || y > scene.map.heightInPixels - 56) return true;
      return typeof scene._chocaConEscenario === 'function' && scene._chocaConEscenario(x - 15, y + 25, 30, 26);
    };
    if (!choca(p.x + dx, p.y)) p.x += dx;
    if (!choca(p.x, p.y + dy)) p.y += dy;
  }
  function adoptarVitales(scene, s) {
    if (!s || typeof s.vida !== 'number') return;
    try {
      if (window.GFCharacterSkills && window.GFCharacterSkills.applyStats) window.GFCharacterSkills.applyStats(scene, s);
      else if (typeof scene._adoptarVitalesDelServidor === 'function') scene._adoptarVitalesDelServidor(s);
    } catch (e) {}
    try { if (window.GFMascota.parpadearDano) window.GFMascota.parpadearDano(scene); } catch (e) {}
    if (s.vida <= 0 && window.GFMascota && window.GFMascota.declararMuerte) window.GFMascota.declararMuerte();
  }
  function remolinosTic(st, tSrv, dt) {
    var scene = st.scene, p = scene.player, v = vista(scene);
    if (!p || !p.active || !v) return;
    var pie = { x: p.x, y: p.y + 45 };
    var cerca = null, dmin = Infinity;
    st.remolinos.forEach(function (r) {
      var q = posRemolino(r, tSrv);
      r.px = q.x; r.py = q.y;
      var ve = q.x > v.x - 200 && q.x < v.right + 200 && q.y > v.y - 60 && q.y < v.bottom + 300;
      r.spr.setVisible(ve).setPosition(q.x, q.y).setDepth(q.y + 1);
      r.sombra.setVisible(ve).setPosition(q.x, q.y - 4);
      var d = Math.hypot(q.x - pie.x, q.y - pie.y);
      if (d < dmin) { dmin = d; cerca = r; }
    });
    if (!cerca || scene._cambiandoEscena || fantasma()) { st.atrapado = false; return; }
    if (dmin < ATRAE) {
      // Poco a poco: lejos apenas tira (unos 20 px/s); cerca, la mitad de lo
      // que anda el personaje (240): siempre se puede escapar corriendo.
      var f = 1 - dmin / ATRAE;
      var vel = 18 + 104 * f * f;
      var ux = (cerca.px - pie.x) / (dmin || 1), uy = (cerca.py - pie.y) / (dmin || 1);
      var gx = -uy, gy = ux;                                   // y un poco de giro
      var paso = vel * dt;
      if (dmin > 6) arrastrar(scene, (ux * 0.86 + gx * 0.42) * paso, (uy * 0.86 + gy * 0.42) * paso);
      if (!st.atrapado) {
        st.atrapado = true;
        aviso(scene, '🌪 The sand whirl is pulling you in — run!', 'warning');
      }
    } else {
      st.atrapado = false;
    }
    if (dmin < DANO) {
      var ahora = Date.now();
      try { if (ahora - (st.temblorEn || 0) > 600) { st.temblorEn = ahora; scene.cameras.main.shake(260, 0.004); } } catch (e) {}
      if (ahora - (st.danoEn || 0) >= 1000 && scene.playerName) {
        st.danoEn = ahora;
        p.setTintFill(0xffd29a);
        scene.time.delayedCall(110, function () { if (p.scene) p.clearTint(); });
        api('/api/stats/' + encodeURIComponent(scene.playerName) + '/consume', { reason: 'remolino_arena' }).then(function (r) {
          if (!st.vivo || !r || !r.ok || !r.datos) return;
          adoptarVitales(scene, r.datos.stats);
          if (window.GFEspada && window.GFEspada.mostrarDano && r.datos.spent && r.datos.spent.vida) {
            window.GFEspada.mostrarDano(scene, p.x, p.y - 64, r.datos.spent.vida);
          }
        }).catch(function () {});
      }
    }
  }

  // ─────────────────────────────────────────────────────── TUNDRA: NEVADA
  function montarNevada(st) {
    var scene = st.scene;
    st.copos = [];
    // Pocos y suaves: que se lea nevada, no puntos sueltos.
    for (var i = 0; i < 44; i++) {
      st.copos.push({ spr: scene.add.image(0, 0, 'zn_copo').setDepth(PROF_AIRE + 0.2).setScale(1.0 + Math.random() * 0.8).setAlpha(0.6 + Math.random() * 0.2),
                      x: Math.random(), y: Math.random(), v: 0.05 + Math.random() * 0.07, fase: Math.random() * 6.3, mece: 0.008 + Math.random() * 0.012 });
    }
  }
  function nevadaTic(st, tSrv, dt) {
    var v = vista(st.scene);
    if (!v) return;
    st.copos.forEach(function (c) {
      c.y += c.v * dt;
      if (c.y > 1.05) { c.y = -0.05; c.x = Math.random(); }
      var x = c.x + Math.sin(tSrv * 0.9 + c.fase) * c.mece;
      c.spr.setPosition(v.x + x * v.width, v.y + c.y * v.height);
    });
  }

  // ─────────────────────────────────────────────────────── LUCES DE NOCHE
  var LUCES = {
    farola: [-88, 300, 1], cripta: [-70, 260, 0.75], hoguera: [-16, 340, 1],
    cristal_grande: [-60, 230, 0.7], cristal_hielo: [-30, 130, 0.45]
  };
  function montarLuces(st) {
    var scene = st.scene, capa = scene.map && scene.map.getObjectLayer('objetos');
    st.luces = [];
    (capa ? capa.objects : []).forEach(function (o) {
      var l = LUCES[o.name];
      if (l) st.luces.push({ x: o.x, y: o.y + l[0], r: l[1], a: l[2] });
    });
    if (!st.luces.length) return;
    st.alumbrar = function (luz) { for (var i = 0; i < st.luces.length; i++) { var q = st.luces[i]; luz(q.x, q.y, q.r, q.a); } };
    if (!Array.isArray(scene._lucesNoche)) scene._lucesNoche = [];
    scene._lucesNoche.push(st.alumbrar);
  }

  // ─────────────────────────────────────────────────────── MONTAJE
  function montar(scene, zona) {
    if (!scene || !scene.add || scene.__gfZonas) return null;
    var st = { scene: scene, zona: zona, vivo: true, atrapado: false, danoEn: 0, remolinos: [], niebla: [], copos: [], rafagas: [], velos: [] };
    scene.__gfZonas = st;
    texturas(scene);
    try { montarLuces(st); } catch (e) { console.warn('[zonas] luces:', e); }
    if (zona === 'cementerio') montarNiebla(st);
    if (zona === 'desierto') { montarTormenta(st); montarRemolinos(st); }
    if (zona === 'tundra') montarNevada(st);
    st.onUpdate = function (t, delta) {
      if (!st.vivo) return;
      var dt = Math.min(0.1, (delta || 16) / 1000);
      var tSrv = ahoraServidor() / 1000;
      try {
        if (st.niebla.length) nieblaTic(st, dt);
        if (st.velos.length) tormentaTic(st, tSrv, dt);
        if (st.remolinos.length) remolinosTic(st, tSrv, dt);
        if (st.copos.length) nevadaTic(st, tSrv, dt);
      } catch (e) { console.warn('[zonas]', e); }
    };
    st.onApagar = function () { desmontar(scene); };
    scene.events.on('update', st.onUpdate);
    scene.events.once('shutdown', st.onApagar);
    scene.events.once('destroy', st.onApagar);
    console.log('🧭 zona ' + zona + ': ' + st.remolinos.length + ' remolinos, ' + (st.luces ? st.luces.length : 0) + ' luces');
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfZonas;
    if (!st) return;
    st.vivo = false;
    scene.events.off('update', st.onUpdate);
    scene.events.off('shutdown', st.onApagar);
    scene.events.off('destroy', st.onApagar);
    if (st.alumbrar && Array.isArray(scene._lucesNoche)) {
      var i = scene._lucesNoche.indexOf(st.alumbrar);
      if (i >= 0) scene._lucesNoche.splice(i, 1);
    }
    var todos = [].concat(st.niebla.map(function (n) { return n.spr; }), st.velos.map(function (n) { return n.spr; }),
      st.rafagas.map(function (r) { return r.spr; }), st.copos.map(function (c) { return c.spr; }),
      st.remolinos.map(function (r) { return r.spr; }), st.remolinos.map(function (r) { return r.sombra; }), [st.tinte]);
    todos.forEach(function (o) { try { if (o && o.scene) o.destroy(); } catch (e) {} });
    scene.__gfZonas = null;
  }

  window.GFZonas = {
    ZONAS: ZONAS,
    viajar: viajar,
    montar: montar,
    desmontar: desmontar,
    _interno: { posRemolino: posRemolino, fuerzaTormenta: fuerzaTormenta, ahoraServidor: ahoraServidor, ATRAE: ATRAE, DANO: DANO,
                estado: function (s) { return s && s.__gfZonas; } }
  };
})();
