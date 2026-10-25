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
    salvaje_desde_tundra:     { mundo: 6, escena: 'SalvajeScene', sala: 'salvaje', nombre: 'Wild Lands', llegada: { x: 3552, y: 230 } },
    // (2026-10-25) Los tres de nivel 8, 9 y 10: el glaciar (por el camino
    // nuevo del norte de la tundra), la caverna (por la puerta de la casa de
    // la bruja del cementerio) y la pradera (por el camino del este del
    // desierto). Y las vueltas, al lado de por donde se salió.
    glaciar: { mundo: 10, escena: 'GlaciarScene', sala: 'glaciar', nombre: 'The Shattered Glacier', llegada: { x: 3552, y: 4740 } },
    caverna: { mundo: 11, escena: 'CavernaScene', sala: 'caverna', nombre: 'Crystal Caverns', llegada: { x: 4040, y: 2250 } },
    pradera: { mundo: 12, escena: 'PraderaScene', sala: 'pradera', nombre: 'Blossom Meadow', llegada: { x: 234, y: 2456 } },
    tundra_desde_glaciar:     { mundo: 9, escena: 'TundraScene',     sala: 'tundra',     nombre: 'Frostfang Tundra',       llegada: { x: 3552, y: 234 } },
    cementerio_desde_caverna: { mundo: 7, escena: 'CementerioScene', sala: 'cementerio', nombre: 'Cemetery of Lost Souls', llegada: { x: 250, y: 2250 } },
    desierto_desde_pradera:   { mundo: 8, escena: 'DesiertoScene',   sala: 'desierto',   nombre: 'Scorching Desert',       llegada: { x: 4790, y: 2456 } }
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
    var z = Object.prototype.hasOwnProperty.call(ZONAS, cual) ? ZONAS[cual] : null;
    if (!scene || !z || scene._cambiandoEscena || scene._viajeZona) return Promise.resolve(false);
    if (!scene.scene.get(z.escena)) {
      console.warn('[zonas] ' + z.escena + ' no está registrada: no se puede viajar');
      aviso(scene, 'This road is closed for now. Try again later.', 'info');
      return Promise.resolve(false);
    }
    // (2026-10-22) Cada mapa tiene su nivel mínimo (gf-niveles-mapas.js).
    if (window.GFNivelMapa && !window.GFNivelMapa.exigir(scene, z.mundo)) return Promise.resolve(false);
    scene._viajeZona = true;
    var contexto = { cancelado: false, reloj: null, resolver: null }, nota = null;
    scene.__gfViajeZona = contexto;
    function vigente() { return !contexto.cancelado && scene.__gfViajeZona === contexto && (!scene.sys || scene.sys.isActive()); }
    function soltar() {
      if (contexto.reloj !== null) clearTimeout(contexto.reloj);
      if (scene.events) { scene.events.off('shutdown', cancelar); scene.events.off('destroy', cancelar); }
      if (scene.__gfViajeZona === contexto) scene.__gfViajeZona = null;
    }
    function cancelar() {
      contexto.cancelado = true;
      if (window.__gfViaje === nota) window.__gfViaje = null;
      if (scene.__gfViajeZona === contexto) { scene._viajeZona = false; scene._cambiandoEscena = false; }
      if (contexto.resolver) contexto.resolver(false);
      soltar();
    }
    if (scene.events) { scene.events.once('shutdown', cancelar); scene.events.once('destroy', cancelar); }
    var previo = { mundo: scene.mundo, x: scene.posicionplayerx, y: scene.posicionplayery };
    var clave = scene.sys && scene.sys.settings ? scene.sys.settings.key : '';
    try { scene._cancelarArrastre(); } catch (e) {}
    try { scene.player.anims.stop(); } catch (e) {}
    scene.mundo = z.mundo;
    scene.posicionplayerx = z.llegada.x;
    scene.posicionplayery = z.llegada.y;
    // El candado corta el update() (que reescribiría la posición).
    scene._cambiandoEscena = true;
    nota = window.__gfViaje = { mundo: z.mundo, x: z.llegada.x, y: z.llegada.y, islaDe: null, islaDeNombre: null, t: Date.now() };
    /* UN REINTENTO (2026-10-19). Un guardado que vuelve `false` una vez (el
       inventario recargándose tras una compra en el mercado, un token que se
       renueva) dejaba al jugador plantado en la salida. Antes de cada intento
       se vuelve a poner el destino: esa recarga copia el `mundo` de la
       partida (el de ANTES del viaje) encima del nuestro. */
    var guardarUna = function () {
      if (!vigente()) return Promise.resolve(false);
      scene.mundo = z.mundo;
      scene.posicionplayerx = z.llegada.x;
      scene.posicionplayery = z.llegada.y;
      try { return Promise.resolve(scene.savegg()); } catch (e) { return Promise.reject(e); }
    };
    var guardar = guardarUna().catch(function () { return false; }).then(function (ok) {
      if (ok !== false || !vigente()) return ok;
      return new Promise(function (r) { contexto.resolver = r; contexto.reloj = setTimeout(function () { contexto.reloj = null; contexto.resolver = null; r(); }, 900); }).then(guardarUna);
    });
    return guardar.then(function (ok) {
      if (!vigente()) return false;
      if (ok === false) throw new Error('guardado no completado');
      console.log('🧭 de ' + clave + ' a ' + z.escena);
      try { scene._ocultarHUD(); } catch (e) {}
      try { scene.removeListener(); } catch (e) {}
      try { scene._unbindAllDomClicks(); } catch (e) {}
      try { scene.stopMusicSafely(); } catch (e) {}
      scene._salaDestino = z.sala;
      if (scene.socket && scene.socket.connected) {
        scene.socket.emit('joinRoom', { room: z.sala, username: scene.Username || '---', soulbound: window.GFSoulbound ? window.GFSoulbound.actual() : null, lastScene: clave, x: z.llegada.x, y: z.llegada.y });
      }
      // La limpieza intencional del viaje no es una cancelación.
      if (scene.events) { scene.events.off('shutdown', cancelar); scene.events.off('destroy', cancelar); }
      try { scene.cleanupScene(); } catch (e) { console.warn('limpieza:', e); }
      scene._viajeZona = false;
      scene.scene.start('LoadingScenegame', { targetScene: z.escena, playerData: { x: z.llegada.x, y: z.llegada.y, mundo: z.mundo } });
      return true;
    }).catch(function (err) {
      if (!vigente()) return false;
      console.warn('[zonas] guardado antes del viaje:', err);
      if (window.__gfViaje === nota) window.__gfViaje = null;
      scene.mundo = previo.mundo;
      scene.posicionplayerx = previo.x; scene.posicionplayery = previo.y;
      scene._cambiandoEscena = false;
      scene._salidaArmada = false;
      scene._viajeZona = false;
      aviso(scene, 'Unable to save your trip. Try again.', 'error');
      return false;
    }).finally(soltar);
  }

  // ─────────────────────────────────────────────────────── TEXTURAS (canvas)
  function lienzo(scene, clave, w, h, pinta) {
    if (scene.textures.exists(clave)) return;
    var c = scene.textures.createCanvas(clave, w, h);
    try { pinta(c.getContext(), w, h); c.refresh(); }
    catch (e) { if (scene.textures.exists(clave) && scene.textures.get(clave) === c) scene.textures.remove(clave); throw e; }
  }
  function propio(st, o) { st.objetos.push(o); return o; }
  function dato(st, key, value) { st.escritos[key] = value; st.scene[key] = value; }
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
    // (2026-10-25) La ventisca del glaciar: el velo blanco y sus ráfagas.
    lienzo(scene, 'zn_velo_nieve', 256, 256, function (x, w, h) {
      manchasCiclicas(x, w, h, [[60, 70, 120, 0.55, 'rgba(236,244,252,0.6)'], [190, 150, 130, 0.5, 'rgba(226,238,250,0.55)'],
                                [120, 220, 100, 0.45, 'rgba(244,248,255,0.5)'], [230, 40, 90, 0.5, 'rgba(220,234,248,0.45)']]);
    });
    lienzo(scene, 'zn_rafaga_nieve', 220, 5, function (x, w, h) {
      var g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(240,248,255,0)'); g.addColorStop(0.5, 'rgba(250,252,255,0.9)'); g.addColorStop(1, 'rgba(240,248,255,0)');
      x.fillStyle = g; x.fillRect(0, 1, w, 3);
      x.globalAlpha = 0.4; x.fillRect(0, 0, w, 1); x.fillRect(0, 4, w, 1);
    });
    // El pétalo de la pradera: una lágrima alargada (no un punto), rosa.
    lienzo(scene, 'zn_petalo', 12, 6, function (x, w, h) {
      x.fillStyle = 'rgba(248,176,196,0.95)';
      x.beginPath(); x.ellipse(w / 2, h / 2, w / 2 - 0.5, h / 2 - 0.8, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(255,224,232,0.95)';
      x.beginPath(); x.ellipse(w / 2 - 1.5, h / 2 - 0.6, w / 4, h / 5, 0, 0, Math.PI * 2); x.fill();
    });
    // La gota de la caverna: una raya que cae y el anillo que deja en el suelo.
    lienzo(scene, 'zn_gota', 2, 12, function (x, w, h) {
      var g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(180,230,255,0)'); g.addColorStop(1, 'rgba(210,244,255,0.95)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    });
    lienzo(scene, 'zn_anillo_gota', 24, 10, function (x, w, h) {
      x.strokeStyle = 'rgba(200,240,255,0.9)'; x.lineWidth = 1.2;
      x.beginPath(); x.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2); x.stroke();
    });
    lienzo(scene, 'zn_sombra_remolino', 128, 40, function (x, w, h) {
      x.save(); x.scale(1, h / w);
      var cy = (h / 2) * (w / h);
      var g = x.createRadialGradient(w / 2, cy, 2, w / 2, cy, w / 2);
      g.addColorStop(0, 'rgba(90,60,30,0.45)'); g.addColorStop(0.7, 'rgba(90,60,30,0.2)'); g.addColorStop(1, 'rgba(90,60,30,0)');
      x.fillStyle = g; x.beginPath(); x.arc(w / 2, cy, w / 2, 0, Math.PI * 2); x.fill(); x.restore();
    });
  }

  /* (2026-10-19) El fuego de la hoguera y el polvo de arena. Las llamas,
     tres formas de gota en capas (rojo, naranja, amarillo) que se alternan;
     el resplandor, un óvalo blando; la chispa, una RAYA corta (nada de
     puntos); el polvo, una mancha alargada y blanda del color de la arena. */
  function texturasFuego(scene) {
    for (var f = 0; f < 3; f++) {
      (function (f) {
        lienzo(scene, 'zn_llama_' + f, 22, 30, function (x, w, h) {
          [['#ff5a1a', 1.0], ['#ffb02e', 0.72], ['#fff3b0', 0.42]].forEach(function (capa) {
            var k = capa[1], cx = w / 2 + (f - 1) * 1.5, base = h - 1;
            x.fillStyle = capa[0];
            x.beginPath();
            x.moveTo(cx - 9 * k, base);
            x.quadraticCurveTo(cx - 10 * k, base - 13 * k, cx + (f - 1) * 2, base - (h - 3) * k);
            x.quadraticCurveTo(cx + 10 * k, base - 13 * k, cx + 9 * k, base);
            x.closePath();
            x.fill();
          });
        });
      })(f);
    }
    lienzo(scene, 'zn_brillo', 96, 56, function (x, w, h) {
      x.save(); x.scale(1, h / w);
      var cy = (h / 2) * (w / h);
      var g = x.createRadialGradient(w / 2, cy, 2, w / 2, cy, w / 2);
      g.addColorStop(0, 'rgba(255,190,90,0.85)'); g.addColorStop(0.5, 'rgba(255,140,50,0.35)'); g.addColorStop(1, 'rgba(255,120,40,0)');
      x.fillStyle = g; x.beginPath(); x.arc(w / 2, cy, w / 2, 0, Math.PI * 2); x.fill(); x.restore();
    });
    lienzo(scene, 'zn_chispa', 2, 7, function (x, w, h) {
      var g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,240,170,1)'); g.addColorStop(1, 'rgba(255,120,40,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    });
    // El velo de polvo: tres óvalos blandos y alargados, más claros que la
    // arena (si fueran del mismo color no se verían sobre ella).
    lienzo(scene, 'zn_polvo', 160, 26, function (x, w, h) {
      [[0.5, 0.55, 0.5, 0.8], [0.3, 0.45, 0.3, 0.55], [0.72, 0.6, 0.28, 0.5]].forEach(function (o) {
        var cx = w * o[0], cy = h * o[1], rx = w * o[2], ry = h * 0.42;
        x.save(); x.translate(cx, cy); x.scale(1, ry / rx);
        var g = x.createRadialGradient(0, 0, 1, 0, 0, rx);
        g.addColorStop(0, 'rgba(255,246,222,' + o[3] + ')'); g.addColorStop(0.55, 'rgba(250,236,200,' + (o[3] * 0.4) + ')'); g.addColorStop(1, 'rgba(250,236,200,0)');
        x.fillStyle = g; x.beginPath(); x.arc(0, 0, rx, 0, Math.PI * 2); x.fill(); x.restore();
      });
    });
    // El hilo de arena: una raya larga y fina que se desvanece por los dos
    // extremos; corre deprisa a ras de suelo, como la arena que arrastra el aire.
    lienzo(scene, 'zn_hilo', 96, 3, function (x, w, h) {
      var g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,244,214,0)'); g.addColorStop(0.35, 'rgba(255,244,214,0.85)');
      g.addColorStop(0.7, 'rgba(255,244,214,0.6)'); g.addColorStop(1, 'rgba(255,244,214,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    });
  }

  // ─────────────────────────────────────────────────────── LA HOGUERA (fuego de verdad)
  /* "Las fogatas del mapa de nieve se ven falsas, no hay fuego real." El
     dibujo de la hoguera trae una llama quieta; encima va un fuego vivo: tres
     llamas que cambian de forma y se estiran, el resplandor que tiembla en el
     suelo y unas chispas que suben (rayas cortas). */
  function montarHogueras(st) {
    var scene = st.scene, capa = scene.map && scene.map.getObjectLayer('objetos');
    st.hogueras = [];
    (capa ? capa.objects : []).forEach(function (o) {
      if (o.name !== 'hoguera' && o.name !== 'brasero') return;
      var alto = o.name === 'brasero' ? 30 : 0;      // el fuego del brasero, en su cuenco
      var ADD = window.Phaser && Phaser.BlendModes ? Phaser.BlendModes.ADD : 1;
      var brillo = propio(st, scene.add.image(o.x, o.y - 8 - alto * 0.3, 'zn_brillo')).setDepth(o.y - 1).setAlpha(0.55).setBlendMode(ADD);
      var llamas = [-4, 0, 4].map(function (dx, k) {
        return { spr: propio(st, scene.add.image(o.x + dx, o.y - 10 - alto, 'zn_llama_' + k)).setOrigin(0.5, 1).setDepth(o.y + 1 + k * 0.01),
                 dx: dx, fase: Math.random() * 6, k: (k === 1 ? 1.0 : 0.68) * (alto ? 0.7 : 1) };
      });
      var chispas = [];
      for (var i = 0; i < 6; i++) {
        chispas.push({ spr: propio(st, scene.add.image(o.x, o.y, 'zn_chispa')).setDepth(o.y + 2).setBlendMode(ADD).setVisible(false), vida: 0 });
      }
      st.hogueras.push({ x: o.x, y: o.y - alto, base: o.y, brillo: brillo, llamas: llamas, chispas: chispas, prox: 0 });
    });
  }
  function hoguerasTic(st, t, dt) {
    var v = vista(st.scene);
    for (var i = 0; i < st.hogueras.length; i++) {
      var h = st.hogueras[i];
      var ve = !v || (h.x > v.x - 100 && h.x < v.right + 100 && h.base > v.y - 100 && h.base < v.bottom + 140);
      h.brillo.setVisible(ve);
      if (!ve) { h.llamas.forEach(function (l) { l.spr.setVisible(false); }); continue; }
      var cambia = t > h.prox;
      if (cambia) h.prox = t + 90 + Math.random() * 80;
      h.llamas.forEach(function (l, k) {
        var w = Math.sin(t / 1000 * (7 + k * 1.3) + l.fase) * 0.5 + Math.sin(t / 1000 * (13 + k) + k * 2) * 0.5;
        l.spr.setVisible(true).setScale(l.k * 1.15 * (1 + w * 0.1), l.k * 1.15 * (1 + w * 0.24));
        l.spr.x = h.x + l.dx + Math.sin(t / 260 + k) * 1.2;
        if (cambia) l.spr.setTexture('zn_llama_' + Math.floor(Math.random() * 3));
      });
      h.brillo.setAlpha(0.45 + 0.12 * Math.sin(t / 90) + 0.06 * Math.sin(t / 37));
      for (var k = 0; k < h.chispas.length; k++) {
        var ch = h.chispas[k];
        if (ch.vida <= 0) {
          if (Math.random() < dt * 1.6) {
            ch.vida = 0.7 + Math.random() * 0.6; ch.max = ch.vida;
            ch.x = h.x + (Math.random() - 0.5) * 10; ch.y = h.y - 30; ch.vx = (Math.random() - 0.5) * 18;
          } else { ch.spr.setVisible(false); continue; }
        }
        ch.vida -= dt;
        ch.y -= 46 * dt; ch.x += ch.vx * dt;
        ch.spr.setVisible(true).setPosition(ch.x, ch.y).setAlpha(Math.max(0, ch.vida / ch.max)).setScale(1.5);
      }
    }
  }

  // ─────────────────────────────────────────────────────── DESIERTO: EL POLVO DE ARENA
  /* "En el desierto debe haber polvo de arena": aunque no haya tormenta,
     corren a ras de suelo velos de polvo alargados (manchas blandas, sin
     motas), despacio, y se apagan cuando llega la tormenta (ella ya lo llena
     todo de arena). */
  /* El polvo vive en el MUNDO (no pegado a la pantalla: al andar, el suelo y
     su polvo se quedan atrás) y va pegado al suelo, por debajo de personas y
     objetos. El que se sale por sotavento vuelve a nacer por barlovento,
     dentro de lo que ve la cámara. */
  function montarPolvo(st) {
    var scene = st.scene, v = vista(scene);
    st.polvo = [];
    for (var i = 0; i < 22; i++) {
      var hilo = i >= 12;
      var p = { spr: propio(st, scene.add.image(0, 0, hilo ? 'zn_hilo' : 'zn_polvo')).setDepth(PROF_NIEBLA + 0.02).setAlpha(0),
                hilo: hilo, v: hilo ? 110 + Math.random() * 90 : 26 + Math.random() * 30,
                k: hilo ? 0.8 + Math.random() * 0.9 : 1.3 + Math.random() * 1.7, fase: Math.random() * 6.3 };
      nacerPolvo(p, v, true);
      st.polvo.push(p);
    }
  }
  function nacerPolvo(p, v, dentro) {
    if (!v) { p.x = 0; p.y = 0; return; }
    p.x = dentro ? v.x + Math.random() * v.width : v.x - 140 - Math.random() * 120;
    p.y = v.y + 20 + Math.random() * Math.max(40, v.height - 40);
  }
  function polvoTic(st, tSrv, dt) {
    var v = vista(st.scene);
    if (!v) return;
    var calma = 1 - Math.min(1, (st.tormentaVista || 0) * 1.6);
    st.polvo.forEach(function (p) {
      p.x += p.v * dt;
      if (p.x > v.right + 160 || p.x < v.x - 300 || p.y < v.y - 120 || p.y > v.bottom + 120) nacerPolvo(p, v, false);
      var a = p.hilo ? (0.18 + 0.22 * Math.max(0, Math.sin(tSrv * 0.9 + p.fase))) * calma
                     : (0.34 + 0.16 * Math.sin(tSrv * 0.7 + p.fase)) * calma;
      p.spr.setPosition(p.x, p.y + Math.sin(tSrv * 1.3 + p.fase) * 3)
        .setScale(p.k, p.hilo ? 1 : p.k * 0.7).setAlpha(Math.max(0, a)).setVisible(a > 0.01);
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
      var t = propio(st, scene.add.tileSprite(0, 0, 64, 64, 'zn_niebla')).setOrigin(0, 0).setDepth(PROF_NIEBLA + i * 0.01);
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
  function fuerzaTormenta(t, ciclo, dura) {
    ciclo = ciclo || CICLO_TORMENTA; dura = dura || DURA_TORMENTA;
    var k = ((t % ciclo) + ciclo) % ciclo;
    if (k > dura) return 0;
    return Math.max(0, Math.min(1, k / RAMPA_TORMENTA, (dura - k) / RAMPA_TORMENTA));
  }
  /* (2026-10-25) La misma tormenta sirve de VENTISCA en el glaciar: velo y
     ráfagas blancos, otro ciclo y otros avisos (`TORMENTAS`). */
  var TORMENTAS = {
    desierto: { tinte: 0xd9b67a, velo: 'zn_velo', rafaga: 'zn_rafaga', ciclo: CICLO_TORMENTA, dura: DURA_TORMENTA, desfase: 0,
                entra: '🌪 A sandstorm is rolling in — you can barely see!', sale: '☀ The sandstorm has passed.' },
    glaciar:  { tinte: 0xe8f2ff, velo: 'zn_velo_nieve', rafaga: 'zn_rafaga_nieve', ciclo: 9 * 60, dura: 3 * 60, desfase: 200,
                entra: '❄ A blizzard sweeps over the glacier — stay close to the fire!', sale: '🌨 The blizzard eases off.' }
  };
  function montarTormenta(st) {
    var scene = st.scene, T = TORMENTAS[st.zona] || TORMENTAS.desierto;
    st.tormenta = T;
    st.tinte = propio(st, scene.add.rectangle(0, 0, 16, 16, T.tinte, 1)).setOrigin(0, 0).setDepth(PROF_AIRE).setAlpha(0);
    st.velos = [0, 1].map(function (i) {
      return { spr: propio(st, scene.add.tileSprite(0, 0, 64, 64, T.velo)).setOrigin(0, 0).setDepth(PROF_AIRE + 0.1 + i * 0.1).setAlpha(0).setTileScale(2.4 + i, 2.4 + i),
               ox: i * 300, vx: [150, 220][i], vy: [10, -14][i] };
    });
    st.rafagas = [];
    for (var i = 0; i < 34; i++) {
      st.rafagas.push({ spr: propio(st, scene.add.image(0, 0, T.rafaga)).setDepth(PROF_AIRE + 0.3).setAlpha(0).setVisible(false),
                        x: Math.random(), y: Math.random(), v: 0.55 + Math.random() * 0.5, k: 0.6 + Math.random() * 1.3 });
    }
    st.tormentaVista = 0;
    st.enTormenta = false;
  }
  function tormentaTic(st, tSrv, dt) {
    var scene = st.scene, v = vista(scene);
    if (!v) return;
    var T = st.tormenta || TORMENTAS.desierto;
    var f = fuerzaTormenta(tSrv + T.desfase, T.ciclo, T.dura);
    // Suavizado: entra y sale poco a poco aunque la hora salte.
    st.tormentaVista += (f - st.tormentaVista) * Math.min(1, dt * 1.5);
    var a = st.tormentaVista;
    // Las palmeras se doblan con la tormenta (gf-viento.js lee esta brisa)
    // y se oye (gf-audio.js lee su fuerza).
    dato(st, '_vientoExtra', 0.35 + 0.85 * a);
    dato(st, '_tormentaArena', a);
    var ahora = a > 0.05;
    if (ahora !== st.enTormenta) {
      st.enTormenta = ahora;
      aviso(scene, ahora ? T.entra : T.sale, ahora ? 'warning' : 'info');
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
      var spr = propio(st, scene.add.sprite(o.x, o.y, 'zn_remolino', 0)).setOrigin(0.5, 0.94).setScale(2);
      if (scene.anims.exists('zn_remolino')) spr.play({ key: 'zn_remolino', startFrame: Math.floor(Math.random() * 8) });
      var sombra = propio(st, scene.add.image(o.x, o.y, 'zn_sombra_remolino')).setDepth(2.6).setScale(1.3);
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
    // El remolino se oye antes de que tire: hasta 520 px (gf-audio.js).
    dato(st, '_remolinoCerca', cerca && dmin < 520 ? Math.pow(1 - dmin / 520, 1.3) : 0);
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
      st.copos.push({ spr: propio(st, scene.add.image(0, 0, 'zn_copo')).setDepth(PROF_AIRE + 0.2).setScale(1.0 + Math.random() * 0.8).setAlpha(0.6 + Math.random() * 0.2),
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

  // ─────────────────────────────────────────────────────── CAVERNA: LAS GOTAS
  /* (2026-10-25) Del techo de la caverna cae de vez en cuando una gota cerca
     del jugador: una raya que baja y un anillo que se abre en el suelo y se
     apaga. Pocas y sueltas, y nunca puntos. */
  function montarGotas(st) {
    var scene = st.scene;
    st.gotas = [];
    for (var i = 0; i < 6; i++) {
      st.gotas.push({ spr: propio(st, scene.add.image(0, 0, 'zn_gota')).setDepth(PROF_AIRE + 0.2).setVisible(false),
                      anillo: propio(st, scene.add.image(0, 0, 'zn_anillo_gota')).setDepth(PROF_NIEBLA).setVisible(false),
                      fase: 'nada', t: 0 });
    }
  }
  function gotasTic(st, dt) {
    var scene = st.scene, v = vista(scene);
    if (!v) return;
    st.gotas.forEach(function (g) {
      if (g.fase === 'nada') {
        if (Math.random() > dt * 0.35) return;
        g.x = v.x + 60 + Math.random() * Math.max(10, v.width - 120);
        g.suelo = v.y + 80 + Math.random() * Math.max(10, v.height - 120);
        if (typeof scene._chocaConEscenario === 'function' && scene._chocaConEscenario(g.x - 4, g.suelo - 4, 8, 8)) return;
        g.y = g.suelo - 260; g.fase = 'cae';
        g.spr.setVisible(true).setAlpha(0.85);
      } else if (g.fase === 'cae') {
        g.y += 620 * dt;
        g.spr.setPosition(g.x, g.y);
        if (g.y >= g.suelo) { g.fase = 'anillo'; g.t = 0; g.spr.setVisible(false); g.anillo.setVisible(true).setPosition(g.x, g.suelo); }
      } else {
        g.t += dt;
        var k = g.t / 0.7;
        g.anillo.setScale(0.4 + k * 1.2).setAlpha(Math.max(0, 0.8 * (1 - k)));
        if (k >= 1) { g.fase = 'nada'; g.anillo.setVisible(false); }
      }
    });
  }

  // ─────────────────────────────────────────────────────── PRADERA: LOS PÉTALOS
  /* (2026-10-25) Los pétalos de los cerezos que lleva la brisa: pocos (18),
     alargados, que cruzan la pantalla meciéndose y girando. */
  function montarPetalos(st) {
    var scene = st.scene;
    st.petalos = [];
    for (var i = 0; i < 18; i++) {
      st.petalos.push({ spr: propio(st, scene.add.image(0, 0, 'zn_petalo')).setDepth(PROF_AIRE + 0.2).setAlpha(0.85).setScale(0.9 + Math.random() * 0.6),
                        x: Math.random(), y: Math.random(), vx: 0.03 + Math.random() * 0.03, vy: 0.025 + Math.random() * 0.03,
                        fase: Math.random() * 6.3, giro: (Math.random() - 0.5) * 3 });
    }
  }
  function petalosTic(st, tSrv, dt) {
    var v = vista(st.scene);
    if (!v) return;
    st.petalos.forEach(function (p) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x > 1.05 || p.y > 1.05) { p.x = Math.random() * 0.8 - 0.1; p.y = -0.05; }
      var x = p.x + Math.sin(tSrv * 1.1 + p.fase) * 0.012;
      p.spr.setPosition(v.x + x * v.width, v.y + p.y * v.height).setRotation(p.fase + tSrv * p.giro);
    });
  }

  // ─────────────────────────────────────────────────────── LUCES DE NOCHE
  var LUCES = {
    farola: [-88, 300, 1], cripta: [-70, 260, 0.75], hoguera: [-16, 340, 1],
    cristal_grande: [-60, 230, 0.7], cristal_hielo: [-30, 130, 0.45],
    // (2026-10-25) Las de los mapas nuevos: en la caverna alumbran siempre
    // (allí la noche no se va del todo, gf-ciclo-dia `_oscuridadMinima`).
    poste_runas: [-50, 170, 0.6], farol_jardin: [-64, 220, 0.9], brasero: [-40, 300, 1],
    cristal_cueva: [-26, 150, 0.6], cristal_cueva_t: [-26, 150, 0.6], cristal_grande_cueva: [-50, 260, 0.85],
    seta_brillante: [-12, 90, 0.5], salida_cueva: [-60, 320, 0.9], casa_bruja: [-70, 260, 0.8]
  };
  function montarLuces(st) {
    var scene = st.scene, capa = scene.map && scene.map.getObjectLayer('objetos');
    st.luces = [];
    (capa ? capa.objects : []).forEach(function (o) {
      var l = Object.prototype.hasOwnProperty.call(LUCES, o.name) ? LUCES[o.name] : null;
      if (l) st.luces.push({ x: o.x, y: o.y + l[0], r: l[1], a: l[2] });
    });
    // Y lo que la escena pone a mano (la casa de la bruja).
    ((scene.cfg && scene.cfg.extras) || []).forEach(function (e) {
      var l = Object.prototype.hasOwnProperty.call(LUCES, e.fotograma) ? LUCES[e.fotograma] : null;
      if (l) st.luces.push({ x: e.x, y: e.y + l[0], r: l[1], a: l[2] });
    });
    if (!st.luces.length) return;
    st.alumbrar = function (luz) { for (var i = 0; i < st.luces.length; i++) { var q = st.luces[i]; luz(q.x, q.y, q.r, q.a); } };
    if (!Array.isArray(scene._lucesNoche)) scene._lucesNoche = [];
    scene._lucesNoche.push(st.alumbrar);
  }

  // ─────────────────────────────────────────────────────── MONTAJE
  function montar(scene, zona) {
    if (!scene || !scene.add || scene.__gfZonas) return null;
    var st = { scene: scene, zona: zona, vivo: true, objetos: [], atrapado: false, danoEn: 0, remolinos: [], niebla: [], copos: [], rafagas: [], velos: [] };
    scene.__gfZonas = st;
    st.anteriores = Object.create(null); st.escritos = Object.create(null);
    ['_vientoExtra', '_tormentaArena', '_remolinoCerca'].forEach(function (key) { st.anteriores[key] = { propio: Object.prototype.hasOwnProperty.call(scene, key), valor: scene[key] }; });
    st.onApagar = function () { desmontar(scene); };
    scene.events.once('shutdown', st.onApagar); scene.events.once('destroy', st.onApagar);
    try {
    texturas(scene);
    texturasFuego(scene);
    try { montarLuces(st); } catch (e) { console.warn('[zonas] luces:', e); }
    try { montarHogueras(st); } catch (e) { console.warn('[zonas] hogueras:', e); st.hogueras = []; }
    st.polvo = [];
    if (zona === 'desierto') { try { montarPolvo(st); } catch (e) { console.warn('[zonas] polvo:', e); } }
    if (zona === 'cementerio') montarNiebla(st);
    if (zona === 'desierto') { montarTormenta(st); montarRemolinos(st); }
    if (zona === 'tundra') montarNevada(st);
    // (2026-10-25) El glaciar: su nevada de siempre y, a ratos, la ventisca.
    if (zona === 'glaciar') { montarNevada(st); montarTormenta(st); }
    if (zona === 'caverna') montarGotas(st);
    if (zona === 'pradera') montarPetalos(st);
    } catch (e) { desmontar(scene); console.warn('[zonas]', e); return null; }
    st.onUpdate = function (t, delta) {
      if (!st.vivo) return;
      var dt = Math.min(0.1, (delta || 16) / 1000);
      var tSrv = ahoraServidor() / 1000;
      try {
        if (st.niebla.length) nieblaTic(st, dt);
        if (st.velos.length) tormentaTic(st, tSrv, dt);
        if (st.remolinos.length) remolinosTic(st, tSrv, dt);
        if (st.copos.length) nevadaTic(st, tSrv, dt);
        if (st.hogueras.length) hoguerasTic(st, t, dt);
        if (st.polvo.length) polvoTic(st, tSrv, dt);
        if (st.gotas && st.gotas.length) gotasTic(st, dt);
        if (st.petalos && st.petalos.length) petalosTic(st, tSrv, dt);
      } catch (e) { console.warn('[zonas]', e); }
    };
    scene.events.on('update', st.onUpdate);
    console.log('🧭 zona ' + zona + ': ' + st.remolinos.length + ' remolinos, ' + (st.luces ? st.luces.length : 0) + ' luces');
    return st;
  }

  function desmontar(scene) {
    var st = scene && scene.__gfZonas;
    if (!st) return;
    st.vivo = false;
    if (st.onUpdate) scene.events.off('update', st.onUpdate);
    scene.events.off('shutdown', st.onApagar);
    scene.events.off('destroy', st.onApagar);
    if (st.alumbrar && Array.isArray(scene._lucesNoche)) {
      var i = scene._lucesNoche.indexOf(st.alumbrar);
      if (i >= 0) scene._lucesNoche.splice(i, 1);
    }
    var todos = [].concat(st.niebla.map(function (n) { return n.spr; }), st.velos.map(function (n) { return n.spr; }),
      st.rafagas.map(function (r) { return r.spr; }), st.copos.map(function (c) { return c.spr; }),
      st.remolinos.map(function (r) { return r.spr; }), st.remolinos.map(function (r) { return r.sombra; }), [st.tinte],
      (st.polvo || []).map(function (p) { return p.spr; }),
      (st.gotas || []).map(function (g) { return g.spr; }), (st.gotas || []).map(function (g) { return g.anillo; }),
      (st.petalos || []).map(function (p) { return p.spr; }));
    (st.hogueras || []).forEach(function (h) {
      todos.push(h.brillo);
      h.llamas.forEach(function (l) { todos.push(l.spr); });
      h.chispas.forEach(function (ch) { todos.push(ch.spr); });
    });
    todos.forEach(function (o) { try { if (o && o.scene) o.destroy(); } catch (e) {} });
    st.objetos.forEach(function (o) { try { if (o && o.scene) { scene.tweens.killTweensOf(o); o.destroy(); } } catch (e) {} });
    st.objetos.length = 0;
    Object.keys(st.escritos).forEach(function (key) { if (scene[key] !== st.escritos[key]) return; var antes = st.anteriores[key]; if (antes.propio) scene[key] = antes.valor; else delete scene[key]; });
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
