/* BACKEND DE MENTIRA PARA PROBAR EL JUEGO ENTERO SIN SERVIDOR.
 *
 * Lo carga _prueba_offline.html (una copia de index.html con este script
 * delante de todo, la genera tools/generar-prueba-offline.js). Sustituye
 * `fetch` y `io` ANTES de que arranque nada del juego, así que el juego de
 * verdad —las mismas escenas, los mismos módulos— arranca, autentica, carga la
 * partida y se puede recorrer: mapa, tienda, mina, isla y batalla.
 *
 * Sirve para cazar fallos de EJECUCIÓN (TypeError, bucles, fugas) que no se ven
 * leyendo el código. NO habla con la cadena ni con Mongo: las transacciones
 * on-chain contestan "sin cadena" y el juego tiene que llevarlo bien.
 *
 * Todo lo que el juego pide queda apuntado en window.__mock.log.
 */
(function () {
  'use strict';

  var CSRF = new Array(65).join('a');
  try { document.cookie = 'csrf-token=' + CSRF + '; path=/'; } catch (e) {}

  var JUGADOR = 'Tester';
  var DIRECCION = '0x1111111111111111111111111111111111111111';
  var TUTORIAL = (function () {
    var m = /[?&]tut=(\d+)/.exec(location.search);
    return m ? Number(m[1]) : 1;
  })();

  var estado = {
    stats: { vida: 100, agua: 80, comida: 70, oro: 50, plata: 500, exp: 10, invoiceIds: {} },
    guardado: null,
    log: [],
    socketLog: [],
    errores: []
  };

  // Registro propio de errores de ESTA página (la consola del navegador
  // mezcla los de cargas anteriores).
  function apuntar(tipo, args) {
    try {
      var txt = Array.prototype.map.call(args, function (a) {
        if (a instanceof Error) return a.stack || a.message;
        if (a && typeof a === 'object') { try { return JSON.stringify(a).slice(0, 400); } catch (e) { return String(a); } }
        return String(a);
      }).join(' ');
      estado.errores.push(tipo + ': ' + txt.slice(0, 1500));
      if (estado.errores.length > 500) estado.errores.splice(0, 100);
    } catch (e) {}
  }
  // Rastreo de oyentes del DOM: quién los pone y si alguien los quita. Sirve
  // para cazar los que se quedan colgados de una escena que ya se fue.
  // Solo con ?rastrear=1: el rastreo guarda referencias fuertes a los
  // oyentes y falsearía cualquier medida de memoria con WeakRef.
  var rastrear = /[?&]rastrear=1/.test(location.search);
  var oyentesDom = new Set();
  var addNativo = EventTarget.prototype.addEventListener;
  var remNativo = EventTarget.prototype.removeEventListener;
  function esCaptura(o) { return typeof o === 'boolean' ? o : !!(o && o.capture); }
  // Con WeakRef: el rastreo no debe mantener vivo nada de lo que rastrea.
  if (rastrear) EventTarget.prototype.addEventListener = function (tipo, fn, opts) {
    if (fn && !(opts && opts.once)) {
      oyentesDom.add({ t: new WeakRef(this), tipo: tipo, fn: new WeakRef(fn), cap: esCaptura(opts),
                       cuando: performance.now(),
                       pila: (new Error().stack || '').split('\n').slice(2, 6).join(' | ') });
    }
    return addNativo.call(this, tipo, fn, opts);
  };
  if (rastrear) EventTarget.prototype.removeEventListener = function (tipo, fn, opts) {
    var cap = esCaptura(opts), self = this;
    oyentesDom.forEach(function (r) {
      if (r.t.deref() === self && r.tipo === tipo && r.fn.deref() === fn && r.cap === cap) oyentesDom.delete(r);
    });
    return remNativo.call(this, tipo, fn, opts);
  };

  // ?sin=GFAmigos,GFMascota: esos módulos se cargan pero su montar() no hace
  // nada. Sirve para bisecar quién retiene una escena (con WeakRef).
  var sinMod = (location.search.match(/[?&]sin=([^&]*)/) || [])[1];
  if (sinMod) decodeURIComponent(sinMod).split(',').forEach(function (n) {
    var val;
    Object.defineProperty(window, n, {
      configurable: true, enumerable: true,
      get: function () { return val; },
      set: function (v) {
        if (v && typeof v === 'object') ['montar', 'montarEscena', 'montarPanel'].forEach(function (f) {
          if (typeof v[f] === 'function') v[f] = function () { return false; };
        });
        val = v;
      }
    });
  });

  // Intervalos vivos (solo con ?rastrear=1): quién los creó y cuándo.
  var intervalos = new Map();
  if (rastrear) {
    var siNativo = window.setInterval, ciNativo = window.clearInterval;
    window.setInterval = function (fn, ms) {
      var id = siNativo.apply(window, arguments);
      intervalos.set(id, { ms: ms, cuando: performance.now(),
                           pila: (new Error().stack || '').split('\n').slice(2, 6).join(' | ') });
      return id;
    };
    window.clearInterval = function (id) { intervalos.delete(id); return ciNativo.call(window, id); };
  }

  // setTimeout y requestAnimationFrame PENDIENTES (solo con ?rastrear=1). Un
  // setTimeout que se reprograma a sí mismo retiene lo que capture para
  // siempre; un rAF pendiente con la pestaña oculta no se dispara nunca.
  var pendientes = new Map();
  if (rastrear) {
    var stNativo = window.setTimeout, ctNativo = window.clearTimeout;
    var rafNativo = window.requestAnimationFrame, crafNativo = window.cancelAnimationFrame;
    var pila = function () { return (new Error().stack || '').split('\n').slice(3, 7).join(' | '); };
    window.setTimeout = function (fn, ms) {
      var args = Array.prototype.slice.call(arguments, 2), clave;
      var id = stNativo.call(window, function () {
        pendientes.delete(clave);
        return typeof fn === 'function' ? fn.apply(this, args) : undefined;
      }, ms);
      clave = 't' + id;
      pendientes.set(clave, { tipo: 'timeout', ms: ms, cuando: performance.now(), pila: pila() });
      return id;
    };
    window.clearTimeout = function (id) { pendientes.delete('t' + id); return ctNativo.call(window, id); };
    window.requestAnimationFrame = function (fn) {
      var clave;
      var id = rafNativo.call(window, function (t) { pendientes.delete(clave); return fn(t); });
      clave = 'r' + id;
      pendientes.set(clave, { tipo: 'raf', cuando: performance.now(), pila: pila() });
      return id;
    };
    window.cancelAnimationFrame = function (id) { pendientes.delete('r' + id); return crafNativo.call(window, id); };
  }

  var errorNativo = console.error;
  console.error = function () { apuntar('console.error', arguments); return errorNativo.apply(console, arguments); };
  window.addEventListener('error', function (ev) {
    var t = ev.target;
    if (t && t !== window && (t.src || t.href)) {
      apuntar('recurso', [(t.tagName || '') + ' ' + (t.src || t.href)]);
      return;
    }
    apuntar('window.error', [ev.message + ' @ ' + (ev.filename || '') + ':' + ev.lineno + ':' + ev.colno + (ev.error && ev.error.stack ? '\n' + ev.error.stack : '')]);
  }, true);
  window.addEventListener('unhandledrejection', function (ev) {
    apuntar('unhandledrejection', [ev.reason]);
  });

  function hueco(id, objeto, cantidad, idx) {
    return { id: id, objeto: objeto, cantidad: cantidad, IDX: idx, Manualid: objeto + '#' + idx, tipo: 'inventario' };
  }

  function partida() {
    var base = {
      posicionplayerx: 2097, posicionplayery: 2359,
      vidaPorcentaje: estado.stats.vida, aguaPorcentaje: estado.stats.agua,
      comidaPorcentaje: estado.stats.comida,
      speed: 2.7, mundo: 1, moneda: estado.stats.oro, moneda_plata: estado.stats.plata,
      nivel: 6, nivel_exp: 10, misiones: 0, Username: JUGADOR, lenguaje: 1,
      agricultura: 1, agricultura_exp: 0, mineria: 1, mineria_exp: 0,
      deforestacion: 1, deforestacion_exp: 0, pesca: 0, pesca_exp: 0,
      cocina: 0, cocina_exp: 0, fuerza: 0, fuerza_exp: 0,
      // ?tut=22 = tutorial terminado (el HUD se ve entero). Por defecto el
      // paso 1, que es como entra un jugador nuevo.
      tutorial: TUTORIAL, petName: 'Firulais', petLevel: 3, petWins: 2, petBattles: 3,
      inventory: [
        hueco(0, 'hacha_de_madera', 1, 101),
        hueco(1, 'pico_de_piedra', 1, 102),
        hueco(2, 'madera_pinos', 12, 103),
        hueco(3, 'zanahoria_buena', 5, 104),
        hueco(4, 'balde_vacio', 1, 105),
        hueco(5, 'Semillax', 10, 106),
        hueco(6, 'mineral_piedra', 8, 107)
      ],
      chest: [ { id: 0, objeto: 'palo', cantidad: 4, IDX: 108, Manualid: 'palo#108', tipo: 'cofre' } ]
    };
    if (estado.guardado) {
      Object.keys(estado.guardado).forEach(function (k) {
        if (estado.guardado[k] !== undefined && estado.guardado[k] !== null) base[k] = estado.guardado[k];
      });
    }
    return base;
  }

  function cuerpo(init) {
    try { return init && init.body ? JSON.parse(init.body) : {}; } catch (e) { return {}; }
  }

  function responder(ruta, metodo, init) {
    var b;
    if (ruta === '/ping') return { ok: true };
    if (ruta === '/api/auth/csrf-token') return { csrfToken: CSRF };
    if (ruta === '/api/auth/me') return { authenticated: true, address: DIRECCION, playerName: JUGADOR };
    if (ruta === '/api/auth/refresh') return { success: true, csrfToken: CSRF };
    if (ruta === '/api/auth/logout') return { success: true };
    if (/^\/api\/load\//.test(ruta)) return partida();
    if (/^\/api\/save\//.test(ruta) && metodo === 'POST') {
      b = cuerpo(init); estado.guardado = b; return { success: true };
    }
    if (/^\/api\/stats\/[^/]+\/sync$/.test(ruta)) return { success: true, stats: estado.stats, source: 'mock' };
    if (/^\/api\/stats\/[^/]+\/update$/.test(ruta)) {
      b = cuerpo(init);
      Object.keys(b.stats || {}).forEach(function (k) { estado.stats[k] = b.stats[k]; });
      return { success: true, stats: estado.stats };
    }
    if (/^\/api\/stats\//.test(ruta)) return { success: true, stats: estado.stats };
    if (ruta === '/api/relay/contracts') return { success: true, contracts: [] };
    if (ruta === '/api/relay/call-view') return { success: false, error: 'mock: sin cadena' };
    if (/^\/api\/relay\/transaction/.test(ruta)) return { success: false, error: 'mock: sin cadena' };
    if (/^\/api\/missions\//.test(ruta)) {
      return { success: true, missions: [], userProgress: { completedMissions: [], completedCount: 0 },
               resetInfo: { hoursUntilReset: 5 } };
    }
    if (ruta === '/api/world/time') {
      return { ok: true, ahora: 6000, epocaMs: 0, cicloMs: 24000, diaMs: 12000, nocheMs: 12000 };
    }
    if (ruta === '/api/world/weather') return { ok: true, ahora: Date.now(), activo: false, lluvia: false };
    if (/^\/api\/graphics\//.test(ruta)) return { ok: true, calidad: 'alta', chunks: 12 };
    if (ruta === '/api/wallet/config') return { providers: {} };
    if (ruta === '/api/wallet/whoami') return { embedded: false };
    if (/^\/api\/soulbound\//.test(ruta)) return { ok: true, personaje: 'personaje1' };
    if (/^\/api\/(tree|mine)\/locks\/active$/.test(ruta)) return [];
    if (/^\/api\/transactions/.test(ruta)) return { interaction: [], items: [] };
    if (/^\/api\/notifications/.test(ruta)) return { success: true, notifications: [] };
    if (/^\/api\/mail/.test(ruta)) return { success: true, mails: [], messages: [] };
    return { success: true, ok: true };
  }

  var fetchNativo = window.fetch.bind(window);
  window.fetch = function (entrada, init) {
    var url = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || String(entrada);
    var u;
    try { u = new URL(url, location.href); } catch (e) { return fetchNativo(entrada, init); }
    var esBackend = u.origin !== location.origin || u.pathname.indexOf('/api/') === 0 || u.pathname === '/ping';
    if (!esBackend) return fetchNativo(entrada, init);
    var metodo = String((init && init.method) || 'GET').toUpperCase();
    estado.log.push(metodo + ' ' + u.pathname);
    if (estado.log.length > 2000) estado.log.splice(0, 500);
    var datos = responder(u.pathname, metodo, init);
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve(new Response(JSON.stringify(datos), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }, 15);
    });
  };

  // ── SOCKET.IO DE MENTIRA ───────────────────────────────────────────────────
  function Emisor() { this._h = Object.create(null); }
  Emisor.prototype.on = function (e, f) { (this._h[e] = this._h[e] || []).push(f); return this; };
  Emisor.prototype.once = function (e, f) {
    var self = this;
    var g = function () { self.off(e, g); f.apply(this, arguments); };
    g._orig = f; return this.on(e, g);
  };
  Emisor.prototype.off = function (e, f) {
    if (e === undefined) { this._h = Object.create(null); return this; }
    if (!this._h[e]) return this;
    if (!f) { delete this._h[e]; return this; }
    this._h[e] = this._h[e].filter(function (x) { return x !== f && x._orig !== f; });
    return this;
  };
  Emisor.prototype.removeListener = Emisor.prototype.off;
  Emisor.prototype.removeAllListeners = function (e) { return this.off(e); };
  Emisor.prototype.listeners = function (e) { return (this._h[e] || []).slice(); };
  Emisor.prototype.hasListeners = function (e) { return !!(this._h[e] && this._h[e].length); };
  Emisor.prototype.listenerCount = function (e) { return (this._h[e] || []).length; };
  Emisor.prototype._fire = function (e) {
    var args = Array.prototype.slice.call(arguments, 1);
    (this._h[e] || []).slice().forEach(function (f) {
      try { f.apply(null, args); } catch (err) { console.error('[mock socket] error en oyente de', e, err); }
    });
  };

  var sockets = [];
  function SocketFalso() {
    Emisor.call(this);
    this.id = 'sock-' + Math.random().toString(36).slice(2, 8);
    this.connected = false;
    this.disconnected = true;
    this.active = true;
    this.io = new Emisor();
    this.io.opts = {};
    this.io.engine = { transport: { name: 'websocket' } };
    var self = this;
    sockets.push(this);
    setTimeout(function () { self.connect(); }, 40);
  }
  SocketFalso.prototype = Object.create(Emisor.prototype);
  SocketFalso.prototype.connect = function () {
    if (this.connected) return this;
    this.connected = true; this.disconnected = false; this.active = true;
    this._fire('connect');
    return this;
  };
  SocketFalso.prototype.open = SocketFalso.prototype.connect;
  SocketFalso.prototype.disconnect = function () {
    if (!this.connected) return this;
    this.connected = false; this.disconnected = true; this.active = false;
    this._fire('disconnect', 'io client disconnect');
    return this;
  };
  SocketFalso.prototype.close = SocketFalso.prototype.disconnect;
  SocketFalso.prototype.emit = function (evento, datos, ack) {
    estado.socketLog.push(evento + (datos && datos.room ? ' ' + datos.room : ''));
    if (estado.socketLog.length > 2000) estado.socketLog.splice(0, 500);
    var self = this;
    if (evento === 'joinRoom') {
      setTimeout(function () {
        self._fire('currentPlayers', []);
        self._fire('playerCount', 1);
      }, 30);
    }
    if (/^battle:/.test(evento)) combateFalso(self, evento, datos);
    var cb = typeof ack === 'function' ? ack : (typeof datos === 'function' ? datos : null);
    if (cb) setTimeout(function () { try { cb({ ok: true, success: true }); } catch (e) {} }, 10);
    return this;
  };

  /* COMBATES DE MENTIRA, con la misma forma de datos que server2.js
     (battlePublicPlayer, cartaPublica, battle:matched/turnStart/turn/end).
     Sirve para probar una batalla entera —cartas, turnos, final, rendición y
     vuelta al mapa— sin servidor. El rival es un zorro: así se prueba también
     la carga de otra especie. */
  var CARTAS_FALSAS = [
    { id: 'zarpazo', name: 'Claw', emoji: '🐾', cost: 1, type: 'attack', rarity: 'common', desc: 'Fast swipe.', dmg: 12, shield: 0, heal: 0 },
    { id: 'guardia', name: 'Guard', emoji: '🛡️', cost: 1, type: 'defense', rarity: 'common', desc: 'Shield.', dmg: 0, shield: 15, heal: 0 },
    { id: 'colazo', name: 'Tail Whip', emoji: '🌀', cost: 1, type: 'hybrid', rarity: 'common', desc: 'Poke.', dmg: 8, shield: 5, heal: 0 },
    { id: 'mordisco', name: 'Bite', emoji: '🦷', cost: 2, type: 'attack', rarity: 'rare', desc: 'Big bite.', dmg: 22, shield: 0, heal: 0 },
    { id: 'lamer', name: 'Lick', emoji: '👅', cost: 1, type: 'heal', rarity: 'common', desc: 'Heal.', dmg: 0, shield: 0, heal: 10 }
  ];
  var combate = null;
  function publico(p) {
    return { playerName: p.playerName, petName: p.petName, address: p.address, addressShort: '0x12…abcd',
             level: p.level, hp: p.hp, maxHp: p.maxHp, isBot: !!p.isBot, species: p.species, status: [] };
  }
  function combateFalso(s, evento, datos) {
    var diario = { done: 1, max: 5, remaining: 4, nextRound: 2 };
    if (evento === 'battle:dailyStatus') {
      setTimeout(function () { s._fire('battle:daily', diario); }, 20);
      return;
    }
    if (evento === 'battle:bot' || evento === 'battle:queue') {
      var esBot = evento === 'battle:bot';
      var yo = { playerName: JUGADOR, petName: 'Firulais', address: DIRECCION, level: 6, hp: 60, maxHp: 60, species: 'perro' };
      var rival = { playerName: esBot ? 'Bot' : 'Otro', petName: 'Zorrito', address: '0xabc', level: 5, hp: 45, maxHp: 45,
                    species: 'zorro', isBot: esBot };
      combate = { id: 'm' + Date.now(), turno: 0, yo: yo, rival: rival, modo: esBot ? 'bot' : 'pvp', s: s };
      if (!esBot) setTimeout(function () { s._fire('battle:queued', { position: 1 }); }, 50);
      var c = combate;
      setTimeout(function () {
        if (combate !== c) return;
        s._fire('battle:matched', { matchId: c.id, mode: c.modo, round: 2, daily: diario, you: publico(yo), rival: publico(rival) });
        setTimeout(function () { if (combate === c) turnoFalso(); }, 600);
      }, esBot ? 300 : 1200);
      return;
    }
    if (!combate) return;
    if (evento === 'battle:action') {
      var c2 = combate, jug = (datos && datos.cards) || [];
      var hecho = 0, cura = 0, escudo = 0;
      var mano = c2.mano || [];
      jug.forEach(function (i) {
        var carta = typeof i === 'number' ? mano[i] : CARTAS_FALSAS.filter(function (k) { return k.id === i; })[0];
        if (!carta) return;
        hecho += carta.dmg; cura += carta.heal; escudo += carta.shield;
      });
      var recibido = Math.max(0, 9 - escudo);
      c2.rival.hp = Math.max(0, c2.rival.hp - hecho);
      c2.yo.hp = Math.max(0, Math.min(c2.yo.maxHp, c2.yo.hp - recibido + cura));
      setTimeout(function () {
        if (combate !== c2) return;
        s._fire('battle:turn', { matchId: c2.id, turn: c2.turno,
          yourCards: jug.map(function (i) { return typeof i === 'number' ? mano[i] : null; }).filter(Boolean),
          rivalCards: [CARTAS_FALSAS[0]], damageToYou: recibido, damageToRival: hecho,
          healYou: cura, shieldYou: escudo, shieldRival: 0, log: 'Turn ' + c2.turno,
          combosYou: [], combosRival: [], statusYou: [], statusRival: [],
          you: publico(c2.yo), rival: publico(c2.rival) });
        setTimeout(function () {
          if (combate !== c2) return;
          if (c2.rival.hp <= 0 || c2.yo.hp <= 0) finFalso(c2.rival.hp <= 0 ? 'win' : 'lose', 'ko');
          else turnoFalso();
        }, 900);
      }, 250);
      return;
    }
    if (evento === 'battle:forfeit') { finFalso('lose', 'forfeit'); return; }
    if (evento === 'battle:leave' || evento === 'battle:leaveQueue') { combate = null; }
  }
  function turnoFalso() {
    var c = combate; if (!c) return;
    c.turno++;
    c.mano = CARTAS_FALSAS.slice();
    var ahora = Date.now();
    c.s._fire('battle:turnStart', { matchId: c.id, turn: c.turno, msToChoose: 20000, deadlineAt: ahora + 20000,
      serverNow: ahora, energy: 3, energyBase: 3, energyBank: 0, hand: c.mano,
      statusYou: [], statusRival: [], statusNotes: {}, combos: [], you: publico(c.yo), rival: publico(c.rival) });
  }
  function finFalso(resultado, motivo) {
    var c = combate; if (!c) return;
    combate = null;
    c.s._fire('battle:end', { matchId: c.id, turn: c.turno, result: resultado, reason: motivo,
      pointsEarned: resultado === 'win' ? 1 : 0, mode: c.modo, round: 2,
      daily: { done: 2, max: 5, remaining: 3, nextRound: 3 }, you: publico(c.yo), rival: publico(c.rival) });
  }
  SocketFalso.prototype.timeout = function () { return this; };
  Object.defineProperty(SocketFalso.prototype, 'volatile', { get: function () { return this; } });

  function ioFalso() { return new SocketFalso(); }
  ioFalso.connect = ioFalso;
  ioFalso.io = ioFalso;
  Object.defineProperty(window, 'io', {
    configurable: true,
    get: function () { return ioFalso; },
    set: function () { /* el socket.io real no se usa aquí */ }
  });

  /* MOTOR MANUAL. Con la pestaña oculta el navegador no da fotogramas y el
     juego se queda parado (una transición de escena no llega a hacerse nunca).
     Mientras la página esté oculta, esto hace avanzar el bucle a mano: 30
     pasos de 16,7 ms cada cuarto de segundo. Con la página visible no hace
     nada: manda el bucle de verdad. */
  var motorT = 0;
  setInterval(function () {
    if (!document.hidden) { motorT = 0; return; }
    var g = window.game;
    if (!g || !g.isRunning || typeof g.step !== 'function') return;
    if (!motorT) motorT = (g.loop && g.loop.time) || performance.now();
    for (var i = 0; i < 30; i++) {
      motorT += 16.67;
      try { g.step(motorT, 16.67); } catch (e) { apuntar('motor', [e]); break; }
    }
  }, 250);

  window.__mock = {
    estado: estado,
    sockets: sockets,
    // Intervalos creados entre `desdeMs` y `hastaMs` que siguen vivos.
    intervalosDesde: function (desdeMs, hastaMs) {
      var out = [];
      intervalos.forEach(function (r, id) {
        if (r.cuando < desdeMs || (hastaMs && r.cuando > hastaMs)) return;
        out.push(r.ms + 'ms @ ' + r.pila);
      });
      return out;
    },
    // Oyentes del DOM puestos después de `desdeMs` que siguen enganchados a
    // algo que sigue vivo en la página, agrupados por quién los puso.
    oyentesDesde: function (desdeMs, hastaMs) {
      var grupos = {};
      oyentesDom.forEach(function (r) {
        if (r.cuando < desdeMs || (hastaMs && r.cuando > hastaMs)) return;
        var t = r.t.deref();
        if (!t || !r.fn.deref()) return;
        var vivo = t === window || t === document || t.isConnected ||
                   (typeof VisualViewport !== 'undefined' && t instanceof VisualViewport);
        if (!vivo) return;
        var clave = r.tipo + ' @ ' + r.pila;
        grupos[clave] = (grupos[clave] || 0) + 1;
      });
      return grupos;
    },
    // setTimeout / rAF que siguen pendientes, creados en [desde, hasta].
    pendientesDesde: function (desdeMs, hastaMs) {
      var out = [];
      pendientes.forEach(function (r) {
        if (r.cuando < desdeMs || (hastaMs && r.cuando > hastaMs)) return;
        out.push(r.tipo + (r.ms != null ? ' ' + r.ms + 'ms' : '') + ' @' + Math.round(r.cuando) + ' ' + r.pila);
      });
      return out;
    },
    // Para bisecar: quita los oyentes / intervalos creados en [desde, hasta]
    // cuya pila contenga `filtro`. Devuelve cuántos quitó.
    quitarOyentes: function (desdeMs, hastaMs, filtro) {
      var n = 0;
      oyentesDom.forEach(function (r) {
        if (r.cuando < desdeMs || r.cuando > hastaMs) return;
        if (filtro && r.pila.indexOf(filtro) < 0) return;
        var t = r.t.deref(), fn = r.fn.deref();
        if (!t || !fn) return;
        remNativo.call(t, r.tipo, fn, r.cap);
        oyentesDom.delete(r); n++;
      });
      return n;
    },
    quitarIntervalos: function (desdeMs, hastaMs, filtro) {
      var n = 0;
      intervalos.forEach(function (r, id) {
        if (r.cuando < desdeMs || r.cuando > hastaMs) return;
        if (r.pila.indexOf('_prueba_offline_mock') >= 0) return;
        if (filtro && r.pila.indexOf(filtro) < 0) return;
        ciNativo.call(window, id); intervalos.delete(id); n++;
      });
      return n;
    },
    // Simula que entra otro jugador en la sala del socket global.
    entraOtro: function (id, x, y) {
      var s = window.globalSocket;
      if (s && s._fire) s._fire('newPlayer', { id: id || 'otro1', x: x || 2150, y: y || 2380, username: 'Amigo',
        direction: 'right', directionx: 'stop_right', nivel: 3, petLevel: 2, dogName: 'Toby' });
    },
    seVaOtro: function (id) {
      var s = window.globalSocket;
      if (s && s._fire) s._fire('playerLeft', { id: id || 'otro1' });
    }
  };
  console.log('[mock] backend de mentira instalado');
})();
