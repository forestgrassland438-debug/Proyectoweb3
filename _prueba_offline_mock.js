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
  // ?mundo=3 arranca en la mina, ?mundo=4 en la isla (el mundo guardado manda).
  var MUNDO = (function () {
    var m = /[?&]mundo=(\d+)/.exec(location.search);
    return m ? Number(m[1]) : 1;
  })();
  var TUTORIAL = (function () {
    var m = /[?&]tut=(\d+)/.exec(location.search);
    return m ? Number(m[1]) : 1;
  })();

  var estado = {
    stats: { vida: 100, agua: 80, comida: 70, oro: 50, plata: 500, exp: 10, invoiceIds: {} },
    // Construcción en la isla: lo colocado y las parcelas que quedan.
    construcciones: [],
    parcelas: 5,
    // El bote y los cofres (2026-10-05): cuántos hay en la mochila, su
    // factura, lo que guarda cada cofre ('gx,gy' -> [...]) y las facturas que
    // están dentro de alguno (no salen en /api/load).
    colocables: { basura: 1, cofre1: 2, cofre3: 1 },
    facturaDe: { parcela: 109, basura: 114, cofre1: 115, cofre3: 116, espantapajaros: 113 },
    cofres: {},
    enCofres: {},
    // ?palas=0 entra sin la pala de construccion (para probar que se pide).
    palas: /[?&]palas=0/.test(location.search) ? 0 : 1,
    cultivos: [],
    espantapajaros: 3,
    espantas: [],
    pesca: null,
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
      speed: 2.7, mundo: MUNDO, moneda: estado.stats.oro, moneda_plata: estado.stats.plata,
      nivel: 6, nivel_exp: 4500, misiones: 0, Username: JUGADOR, lenguaje: 1,
      agricultura: 1, agricultura_exp: 0, mineria: 1, mineria_exp: 0,
      deforestacion: 1, deforestacion_exp: 0, pesca: 0, pesca_exp: 0,
      cocina: 0, cocina_exp: 0, fuerza: 0, fuerza_exp: 0,
      // ?tut=22 = tutorial terminado (el HUD se ve entero). Por defecto el
      // paso 1, que es como entra un jugador nuevo.
      tutorial: TUTORIAL, petName: 'Firulais', petLevel: 6, petWins: 2, petBattles: 3,
      // La mascota con nivel propio (2026-10-03): su barra de experiencia.
      petExp: 2400, petExpBase: 2100, petExpSiguiente: 2800,
      inventory: [
        hueco(0, 'hacha_de_madera', 1, 101),
        hueco(1, 'pico_de_piedra', 1, 102),
        hueco(2, 'madera_pinos', 12, 103),
        hueco(3, 'zanahoria_buena', 5, 104),
        hueco(4, 'balde_vacio', 1, 105),
        hueco(5, 'Semillax', 10, 106),
        hueco(6, 'mineral_piedra', 8, 107),
        // Parcelas para construir en la isla (factura 109).
        hueco(7, 'parcela', estado.parcelas, 109)
      ].concat(estado.palas > 0 ? [hueco(8, 'pala_construccion', estado.palas, 110)] : [])
       .concat([hueco(9, 'cana_pescar', 1, 111), hueco(10, 'espada_madera', 1, 112),
                hueco(11, 'espantapajaros', estado.espantapajaros, 113)])
       .concat(['basura', 'cofre1', 'cofre3'].map(function (t, k) {
         return estado.colocables[t] > 0 ? hueco(12 + k, t, estado.colocables[t], estado.facturaDe[t]) : null;
       }).filter(Boolean)),
      chest: [ { id: 0, objeto: 'palo', cantidad: 4, IDX: 108, Manualid: 'palo#108', tipo: 'cofre' } ]
    };
    if (estado.guardado) {
      Object.keys(estado.guardado).forEach(function (k) {
        if (estado.guardado[k] !== undefined && estado.guardado[k] !== null) base[k] = estado.guardado[k];
      });
    }
    // Lo guardado en un cofre de la isla no está en la mochila.
    ['inventory', 'chest'].forEach(function (k) {
      if (Array.isArray(base[k])) base[k] = base[k].filter(function (s) { return !(s && estado.enCofres[s.IDX]); });
    });
    return base;
  }

  function cuerpo(init) {
    try { return init && init.body ? JSON.parse(init.body) : {}; } catch (e) { return {}; }
  }

  function responder(ruta, metodo, init, consulta) {
    var b;
    if (ruta === '/ping') return { ok: true };
    if (ruta === '/api/auth/csrf-token') return { csrfToken: CSRF };
    if (ruta === '/api/auth/me') return { authenticated: true, address: DIRECCION, playerName: JUGADOR };
    if (ruta === '/api/auth/refresh') return { success: true, csrfToken: CSRF };
    if (ruta === '/api/auth/logout') return { success: true };
    if (/^\/api\/load\//.test(ruta)) {
      /* Lo ULTIMO GUARDADO manda, como en el servidor de verdad: el mundo y
         la posicion. Sin esto los viajes por la pantalla de carga (mina,
         isla, casas) volvian siempre al mundo de la URL. */
      var p = partida(), g = estado.guardado;
      if (g) {
        if (Number(g.mundo)) p.mundo = Number(g.mundo);
        if (Number.isFinite(Number(g.posicionplayerx))) p.posicionplayerx = Number(g.posicionplayerx);
        if (Number.isFinite(Number(g.posicionplayery))) p.posicionplayery = Number(g.posicionplayery);
      }
      return p;
    }
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
    // ── Construcción en la isla (ver /api/lands/* en server2.js) ───────────
    if (ruta === '/api/inventory/casillas') {
      return { soportado: false, casillas: {}, enCofres: Object.keys(estado.enCofres).map(Number) };
    }
    var TIPOS = {
      parcela: { ancho: 2, alto: 2, itemId: 'parcela' },
      basura: { ancho: 2, alto: 2, itemId: 'basura' },
      cofre1: { ancho: 2, alto: 2, itemId: 'cofre1', capacidad: 5 },
      cofre2: { ancho: 2, alto: 2, itemId: 'cofre2', capacidad: 7 },
      cofre3: { ancho: 2, alto: 2, itemId: 'cofre3', capacidad: 13 },
      cofre4: { ancho: 2, alto: 2, itemId: 'cofre4', capacidad: 20 },
      espantapajaros: { ancho: 2, alto: 2, itemId: 'espantapajaros' }
    };
    // El espantapajaros construido sale de la misma casilla que el de las parcelas.
    var cuantos = function (t) { return t === 'parcela' ? estado.parcelas : t === 'espantapajaros' ? estado.espantapajaros : (estado.colocables[t] || 0); };
    var sumar = function (t, n) { if (t === 'parcela') estado.parcelas += n; else if (t === 'espantapajaros') estado.espantapajaros += n; else estado.colocables[t] = (estado.colocables[t] || 0) + n; };
    if (ruta === '/api/lands/construcciones') {
      return { ok: true, isla: { ancho: 128, alto: 96, casilla: 32 },
               tipos: TIPOS, maximo: 200,
               tablas: { parcelas: true, cons_parcelas: true, pala_contrucion: true }, requierePala: true,
               construcciones: estado.construcciones.slice(), cadenaLeida: true };
    }
    if (ruta === '/api/lands/colocar' && metodo === 'POST') {
      b = cuerpo(init);
      var gx = Number(b.gx), gy = Number(b.gy), tipo = String(b.tipo || 'parcela');
      if (!TIPOS[tipo]) return { error: 'tipo_invalido' };
      if (estado.construcciones.some(function (c) {
        return gx < c.gx + 2 && gx + 2 > c.gx && gy < c.gy + 2 && gy + 2 > c.gy;
      })) return { error: 'ocupado' };
      if (cuantos(tipo) <= 0) return { error: 'no_tienes', itemId: tipo };
      sumar(tipo, -1);
      var c = { tipo: tipo, gx: gx, gy: gy, ancho: 2, alto: 2, invoiceId: tipo === 'parcela' ? 900 + estado.construcciones.length : null };
      estado.construcciones.push(c);
      var fac = estado.facturaDe[tipo] || 199;
      return { ok: true, construccion: c,
               gastado: { itemId: tipo, invoiceId: fac, manualId: tipo + '#' + fac, cantidadRestante: cuantos(tipo) } };
    }
    if (ruta === '/api/lands/quitar' && metodo === 'POST') {
      b = cuerpo(init);
      var i = estado.construcciones.findIndex(function (c) { return c.gx === Number(b.gx) && c.gy === Number(b.gy); });
      if (i < 0) return { error: 'no_existe' };
      var q = estado.construcciones[i];
      if (q.tipo === 'parcela' && estado.cultivos.some(function (k) { return k.plotId === 'isla_' + b.gx + '_' + b.gy; })) {
        return { error: 'tiene_cultivo', message: 'Harvest or clear the crop before picking up this plot.' };
      }
      if (estado.palas <= 0) return { error: 'sin_pala' };
      if ((estado.cofres[q.gx + ',' + q.gy] || []).length) {
        return { error: 'cofre_con_cosas', message: 'Empty the chest before picking it up.' };
      }
      estado.construcciones.splice(i, 1);
      sumar(q.tipo, 1);
      if (!estado.facturaDe[q.tipo]) estado.facturaDe[q.tipo] = 120 + Object.keys(estado.facturaDe).length;
      var fd = estado.facturaDe[q.tipo];
      return { ok: true, quitada: { tipo: q.tipo, gx: Number(b.gx), gy: Number(b.gy) },
               devuelto: { itemId: q.tipo, invoiceId: fd, manualId: q.tipo + '#' + fd, cantidad: cuantos(q.tipo) } };
    }
    // ── Los cofres de la isla (ver LOS COFRES DE LA ISLA en server2.js) ────
    if (/^\/api\/lands\/cofre/.test(ruta)) {
      b = metodo === 'GET' ? {} : cuerpo(init);
      var cgx = Number(metodo === 'GET' ? consulta.get('gx') : b.gx);
      var cgy = Number(metodo === 'GET' ? consulta.get('gy') : b.gy);
      var k = estado.construcciones.find(function (c) { return c.gx === cgx && c.gy === cgy; });
      if (!k || !TIPOS[k.tipo].capacidad) return { error: 'no_existe', message: 'That chest is no longer there.' };
      var cap = TIPOS[k.tipo].capacidad;
      var dentro = estado.cofres[cgx + ',' + cgy] = estado.cofres[cgx + ',' + cgy] || [];
      var resp = function (extra) {
        var r = { ok: true, tipo: k.tipo, gx: cgx, gy: cgy, capacidad: cap, contenido: dentro.slice() };
        Object.keys(extra || {}).forEach(function (x) { r[x] = extra[x]; });
        return r;
      };
      if (metodo === 'GET') return resp();
      if (ruta === '/api/lands/cofre/guardar') {
        var id = Number(b.invoiceId);
        if (estado.enCofres[id]) return { error: 'ya_guardada', message: 'That is already in a chest.' };
        if (dentro.length >= cap) return { error: 'cofre_lleno', message: 'This chest is full (' + cap + ' slots).' };
        var p2 = partida();
        var s = (p2.inventory || []).concat(p2.chest || []).find(function (x) { return x && Number(x.IDX) === id; });
        if (!s) return { error: 'no_tienes', message: 'That item is not in your bag any more.' };
        dentro.push({ invoiceId: id, itemId: s.objeto, manualId: s.Manualid || '', cantidad: Number(s.cantidad) || 1 });
        estado.enCofres[id] = true;
        return resp({ guardado: { invoiceId: id, itemId: s.objeto, cantidad: Number(s.cantidad) || 1 } });
      }
      if (ruta === '/api/lands/cofre/sacar') {
        var j = dentro.findIndex(function (e) { return e.invoiceId === Number(b.invoiceId); });
        if (j < 0) return resp({ ok: false, error: 'no_esta', message: 'That is no longer in the chest.' });
        var v = dentro.splice(j, 1)[0];
        delete estado.enCofres[v.invoiceId];
        return resp({ sacado: v });
      }
    }
    // ── La pesca (ver /api/pesca/* en server2.js). Pica a los 2,5 s. ──────
    if (ruta === '/api/pesca/lanzar' && metodo === 'POST') {
      estado.pesca = { sesion: 's' + Date.now(), picaEn: Date.now() + 2500 };
      return { ok: true, sesion: estado.pesca.sesion, picaEnMs: 2500, ventanaMs: 1700 };
    }
    if (ruta === '/api/pesca/enganchar' && metodo === 'POST') {
      var pe = estado.pesca;
      if (!pe || pe.enganchadoEn) return { ok: false, motivo: 'sin_sesion' };
      if (Date.now() < pe.picaEn - 150) { estado.pesca = null; return { ok: false, motivo: 'pronto' }; }
      if (Date.now() > pe.picaEn + 2600) { estado.pesca = null; return { ok: false, motivo: 'tarde' }; }
      var DIF = { pes1: { tam: 0.42, vel: 0.32, nervio: 0.70, mengua: 0, rafaga: 0 },
                  pes2: { tam: 0.32, vel: 0.54, nervio: 1.20, mengua: 0.12, rafaga: 0.16 },
                  pes3: { tam: 0.29, vel: 0.60, nervio: 1.35, mengua: 0.22, rafaga: 0.22 } };
      pe.especie = (/[?&]pez=(pes[123])/.exec(location.search) || [])[1] || ['pes1', 'pes2', 'pes3'][Math.floor(Math.random() * 3)];
      pe.enganchadoEn = Date.now();
      return { ok: true, especie: pe.especie, dificultad: DIF[pe.especie], maxMs: 45000 };
    }
    if (ruta === '/api/pesca/recoger' && metodo === 'POST') {
      var ps = estado.pesca; estado.pesca = null;
      if (!ps) return { ok: false, motivo: 'sin_sesion' };
      if (ps.enganchadoEn) {
        b = cuerpo(init);
        if (b.exito !== true || Date.now() - ps.enganchadoEn < 1900) return { ok: false, motivo: 'escapo' };
        return { ok: true, itemId: ps.especie, exp: 25, factura: { invoiceId: 700 + Math.floor(Math.random() * 99), manualId: ps.especie + '#m', cantidad: 1 } };
      }
      if (Date.now() < ps.picaEn - 150) return { ok: false, motivo: 'pronto' };
      if (Date.now() > ps.picaEn + 2600) return { ok: false, motivo: 'tarde' };
      var pez = ['pes1', 'pes2', 'pes3'][Math.floor(Math.random() * 3)];
      return { ok: true, itemId: pez, exp: 25, factura: { invoiceId: 700 + Math.floor(Math.random() * 99), manualId: pez + '#m', cantidad: 1 } };
    }
    // ── El espantapájaros (ver /api/espantapajaros en server2.js) ────────
    // ── El traductor del chat (ver /api/chat/traducir en server2.js) ──────
    if (ruta === '/api/chat/traducir' && metodo === 'POST') {
      b = cuerpo(init);
      estado.traducciones = (estado.traducciones || 0) + 1;
      if (b.a !== 'es' && b.a !== 'en') return { error: 'idioma_invalido' };
      return { ok: true, a: b.a, traducciones: (b.textos || []).slice(0, 25).map(function (t) {
        t = String(t || '').trim();
        if (!t) return null;
        var de = /\b(hola|amigo|vamos|gracias|quieres|pescar)\b/i.test(t) ? 'es' : 'en';
        return { t: de === b.a ? t : '[' + b.a + '] ' + t, de: de };
      }) };
    }
    if (ruta === '/api/espantapajaros' && metodo === 'GET') {
      return { ok: true, ahora: Date.now(), duracionMs: 7200000,
               lista: estado.espantas.filter(function (e) { return e.hasta > Date.now(); }) };
    }
    if (ruta === '/api/espantapajaros/colocar' && metodo === 'POST') {
      b = cuerpo(init);
      if (estado.espantapajaros <= 0) return { error: 'no_tienes', message: 'You have no scarecrow.' };
      if (estado.espantas.some(function (e) { return e.plotId === b.plotId && e.hasta > Date.now(); })) return { error: 'ya_hay' };
      estado.espantapajaros--;
      var hasta = Date.now() + 7200000;
      estado.espantas.push({ plotId: b.plotId, hasta: hasta });
      return { ok: true, plotId: b.plotId, hasta: hasta, duracionMs: 7200000,
               gastado: { itemId: 'espantapajaros', invoiceId: 113, manualId: 'espantapajaros#113', cantidadRestante: estado.espantapajaros } };
    }
    // ── La isla de OTRO, de visita (ver /api/lands/visita en server2.js) ──
    if (ruta === '/api/lands/visita') {
      return { ok: true, dueno: { playerName: 'Aria', username: 'Aria' },
               tipos: { parcela: { ancho: 2, alto: 2, itemId: 'parcela' }, cofre2: { ancho: 2, alto: 2, itemId: 'cofre2', capacidad: 7 } },
               construcciones: [ { tipo: 'cofre2', gx: 26, gy: 20, ancho: 2, alto: 2 },
                                 { tipo: 'parcela', gx: 30, gy: 20, ancho: 2, alto: 2 },
                                 { tipo: 'parcela', gx: 33, gy: 20, ancho: 2, alto: 2 },
                                 { tipo: 'parcela', gx: 36, gy: 20, ancho: 2, alto: 2 } ],
               cultivos: [ { plotId: 'isla_33_20', cropType: 'Semillax', growthStage: 3, growthDuration: 60,
                             currentGrowthTime: 20, isWatered: true, isCompleted: false, isDead: false,
                             cropConfig: { images: { stage1: 'tierra_seca_plant', stage2: 'tierra_mojada_plant',
                               stage3: 'tierra_mojada_plant2', stage4: 'tierra_mojada_plant3',
                               stage5: 'tierra_muerta_plant4' } } },
                           { plotId: 'isla_36_20', cropType: 'Semillax', growthStage: 4, growthDuration: 60,
                             currentGrowthTime: 60, isWatered: true, isCompleted: true, isDead: false,
                             cropConfig: { images: { stage4: 'tierra_mojada_plant3' } } } ] };
    }
    // ── "My NFTs" (ver /api/nft/mios en server2.js). ?nft=0: sin colección.
    if (ruta === '/api/battle/leaderboard') {
      var fila = function (rank, nombre, pet, pts, w, l) {
        return { rank: rank, playerName: nombre, petName: pet, address: '0x' + String(rank).repeat(40).slice(0, 40),
                 points: pts, wins: w, losses: l, battles: w + l, bestStreak: Math.min(w, 5) };
      };
      return { success: true, season: { number: 3, msRemaining: 3 * 86400000 + 5 * 3600000 }, minBattlesForRanking: 5,
               rows: [fila(1, 'Aria', 'Kuro', 420, 21, 4), fila(2, JUGADOR, 'Firulais', 310, 15, 6), fila(3, 'Bram', 'Toby', 190, 9, 9)],
               me: { playerName: JUGADOR, points: 310, wins: 15, losses: 6, battles: 21, bestStreak: 5, rank: 2, missingBattles: 0 } };
    }
    if (ruta === '/api/nft/mios') {
      if (/[?&]nft=0/.test(location.search)) {
        return { ok: true, configurada: false, coleccion: { nombre: '', contrato: '' }, address: DIRECCION, tokens: [] };
      }
      var nft = function (id, nombre, color) {
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="' + color +
                  '"/><circle cx="16" cy="14" r="8" fill="#fff8"/><rect x="8" y="24" width="16" height="4" fill="#0006"/></svg>';
        var meta = { name: nombre, image: 'data:image/svg+xml;base64,' + btoa(svg) };
        return { id: String(id), uri: 'data:application/json;base64,' + btoa(JSON.stringify(meta)) };
      };
      return { ok: true, configurada: true, address: DIRECCION, total: 4, truncado: false,
               coleccion: { nombre: 'Forest Spirits', contrato: '0x9999999999999999999999999999999999999999', chainId: 4441 },
               tokens: [nft(7, 'Moss Spirit', '#3f8f5a'), nft(12, 'Ember Fox', '#c0582a'),
                        nft(31, 'Night Owl', '#3a3f8f'), { id: '44', uri: 'https://example.invalid/44.json' }] };
    }
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
    var datos = responder(u.pathname, metodo, init, u.searchParams);
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
    if (/^(battle|brawl):/.test(evento)) combateFalso(self, evento, datos);
    huertoFalso(self, evento, datos);
    amigosFalsos(self, evento, datos);
    var cb = typeof ack === 'function' ? ack : (typeof datos === 'function' ? datos : null);
    if (cb) setTimeout(function () { try { cb({ ok: true, success: true }); } catch (e) {} }, 10);
    return this;
  };

  /* LOS AMIGOS DE MENTIRA (gf-amigos.js): Aria está en su isla, Bram en la
     mina (sin moverse: punto 0,0) y Cid en el mapa, junto a la plaza. Lo justo
     para probar los botones de "ir con él" y "visitar su isla". */
  function amigosFalsos(s, evento, datos) {
    var ficha = function (n, nivel, zona, extra) {
      var f = { playerName: n, username: n, nivel: nivel, nameColor: null, online: true, canal: 1, zona: zona,
                esAmigo: n === 'Aria', pendiente: false, tePidio: false };
      Object.keys(extra || {}).forEach(function (k) { f[k] = extra[k]; });
      return f;
    };
    var aria = ficha('Aria', 12, 'island', { islaDe: 'Aria', islaDeNombre: 'Aria' });
    if (evento === 'friends:state') {
      setTimeout(function () {
        s._fire('friends:state', { ok: true, limpiezaDM: 0, noLeidos: 0,
          yo: { playerName: JUGADOR, username: JUGADOR, nivel: 6 },
          amigos: [aria, ficha('Dana', 4, null, { online: false, canal: null })], entrantes: [], salientes: [] });
      }, 20);
    }
    if (evento === 'friends:online') {
      setTimeout(function () {
        s._fire('friends:online', { ok: true, canal: 1, jugadores: [aria, ficha('Bram', 9, 'mine'), ficha('Cid', 3, 'world')] });
      }, 20);
    }
    if (evento === 'friends:dm:history' && datos) {
      setTimeout(function () {
        var t0 = Date.now() - 600000;
        s._fire('friends:dm:history', { ok: true, con: datos.con, ficha: aria, mensajes: [
          { id: 'dm1', de: datos.con, para: JUGADOR, texto: 'Hello! Do you want to go fishing?', ts: t0 },
          { id: 'dm2', de: JUGADOR, para: datos.con, texto: 'Sure, see you at the river', ts: t0 + 60000 },
          { id: 'dm3', de: datos.con, para: JUGADOR, texto: 'hola amigo, vamos a la mina', ts: t0 + 120000 },
          { id: 'dm4', de: datos.con, para: JUGADOR, texto: '🎣🐟', ts: t0 + 180000 }
        ] });
      }, 20);
    }
    if (evento === 'friends:ir' && datos) {
      var donde = {
        Aria: { ok: true, zona: 'island', x: 1100, y: 690, islaDe: 'Aria', islaDeNombre: 'Aria' },
        Bram: { ok: true, zona: 'mine', x: 0, y: 0 },
        Cid:  { ok: true, zona: 'world', x: 2180, y: 2400 }
      }[datos.playerName] || { ok: false, motivo: 'no_conectado' };
      donde.playerName = datos.playerName;
      donde.nombre = datos.playerName;
      setTimeout(function () { s._fire('friends:ir', donde); }, 20);
    }
  }

  /* EL HUERTO DE MENTIRA: la configuración de una semilla y los cultivos
     sembrados, lo justo para sembrar en las parcelas de la isla. */
  function huertoFalso(s, evento, datos) {
    var CONFIG = {
      Semillax: { id: 'Semillax', name: 'Zanahoria', growthTime: 60, waterCost: 1, foodCost: 0.2, wateringCost: 0.5,
                  levelReq: 0, images: { stage1: 'tierra_seca_plant', stage2: 'tierra_mojada_plant',
                  stage3: 'tierra_mojada_plant2', stage4: 'tierra_mojada_plant3', stage5: 'tierra_muerta_plant4' },
                  rewards: { item: 'zanahoria_buena', quantity: 1 } }
    };
    if (evento === 'getCropConfig') setTimeout(function () { s._fire('cropConfig', CONFIG); }, 20);
    if (evento === 'getUserCrops') setTimeout(function () { s._fire('userCropsData', { crops: estado.cultivos.slice() }); }, 20);
    if (evento === 'plantSeed' && datos) {
      var crop = { userId: datos.userId, plotId: datos.plotId, cropType: datos.seedType, seedType: datos.seedType,
                   growthStage: 1, isWatered: false, isCompleted: false, isDead: false,
                   growthDuration: 60, currentGrowthTime: 0, cropConfig: CONFIG[datos.seedType] };
      estado.cultivos.push(crop);
      setTimeout(function () { s._fire('plantSuccess', { plotId: datos.plotId, crop: crop }); }, 30);
    }
  }

  /* LA ARENA DE MENTIRA. No imita al servidor: usa EL MISMO MOTOR que lleva
     server2.js (gf-brawl-motor.js, que el index ya carga), con un "host" de
     juguete y 40 ms de red en cada sentido. Así la prueba juega partidas de
     verdad —moverse, disparar, cajas, huesos, niebla, bots— sin servidor:
     diaria contra un zorro, PvP contra dos "jugadores" (que son bots) y
     práctica contra tres. */
  var RED_MS = 40;
  var brawl = null;
  var diario = { done: 1, max: 5, remaining: 4, nextRound: 2, wins: 1 };
  function combateFalso(s, evento, datos) {
    if (evento === 'battle:dailyStatus') {
      setTimeout(function () { s._fire('battle:daily', diario); }, 20);
      return;
    }
    var M = window.GFBrawlMotor;
    if (!M) return;
    if (evento === 'brawl:bot' || evento === 'brawl:practica' || evento === 'brawl:cola') {
      if (brawl && brawl.P.fase !== 'fin') {
        if (evento === 'brawl:practica' && brawl.esperando) { clearTimeout(brawl.esperando); brawl = null; }
        else { setTimeout(function () { s._fire('brawl:error', { error: 'already_in_battle' }); }, 10); return; }
      }
      var modo = evento === 'brawl:bot' ? 'bot' : (evento === 'brawl:practica' ? 'practica' : 'pvp');
      if (modo === 'pvp') {
        setTimeout(function () { s._fire('brawl:enCola', { posicion: 1, enCola: 1 }); }, 30);
        setTimeout(function () { s._fire('brawl:sala', { jugadores: 3, max: 6, empiezaEnMs: 1500 }); }, 600);
        var espera = setTimeout(function () { arrancarArena(s, modo); }, 2100);
        brawl = { P: { fase: 'cola' }, esperando: espera };
      } else {
        setTimeout(function () { arrancarArena(s, modo); }, 250);
      }
      return;
    }
    if (!brawl || !brawl.P || brawl.P.fase === 'cola') {
      if (evento === 'brawl:salirCola' || evento === 'brawl:salir') {
        if (brawl && brawl.esperando) clearTimeout(brawl.esperando);
        brawl = null;
      }
      return;
    }
    var P = brawl.P, yo = brawl.yo;
    var copia = datos == null ? datos : JSON.parse(JSON.stringify(datos));
    setTimeout(function () {
      if (!brawl || brawl.P !== P) return;
      try {
        if (evento === 'brawl:mover') M.entrada(P, yo, copia);
        else if (evento === 'brawl:disparo') M.disparar(P, yo, copia);
        else if (evento === 'brawl:rendirse') M.abandonar(P, yo, { irse: false });
        else if (evento === 'brawl:salir' || evento === 'brawl:salirCola') {
          M.abandonar(P, yo, { irse: true });
          P._fuera = true;
        }
      } catch (e) { console.error('[arena de mentira]', e); }
    }, RED_MS);
  }
  var arenaN = 0;
  function arrancarArena(s, modo) {
    var M = window.GFBrawlMotor;
    var arenas = Object.keys(M.ARENAS);
    var bots;
    if (modo === 'bot') {
      bots = [{ especie: 'zorro', petName: 'Rusty', playerName: 'Red Fox · Round 2', nivel: 5, maxHp: 140, ataque: 20, astucia: 0.3, vidaFija: true }];
    } else if (modo === 'practica') {
      bots = [
        { especie: 'cerdo', petName: 'Tusk', playerName: 'Wild Boar · Practice', nivel: 6, maxHp: 152, ataque: 22, astucia: 0.30 },
        { especie: 'cuervo', petName: 'Shade', playerName: 'Old Crow · Practice', nivel: 6, maxHp: 152, ataque: 22, astucia: 0.38 },
        { especie: 'cocodrilo', petName: 'Gnash', playerName: 'Swamp Croc · Practice', nivel: 6, maxHp: 152, ataque: 22, astucia: 0.46 }
      ];
    } else {
      bots = [
        { especie: 'perro', petName: 'Toby', playerName: 'Lucia', nivel: 6, maxHp: 152, ataque: 22, astucia: 0.4 },
        { especie: 'perro', petName: 'Kira', playerName: 'Marco', nivel: 7, maxHp: 164, ataque: 24, astucia: 0.35 }
      ];
    }
    var luchadores = [{ clave: 'yo', humano: true, playerName: JUGADOR, petName: 'Firulais', address: DIRECCION,
                        especie: 'perro', nivel: 6, maxHp: 152, ataque: 22, salud: 1 }];
    bots.forEach(function (b, i) { b.clave = 'bot' + i; b.humano = false; luchadores.push(b); });
    var P = null;
    var host = {};
    P = M.crearPartida({
      id: (modo === 'bot' ? 'b_' : modo === 'practica' ? 'p_' : 'm_') + Date.now(),
      modo: modo, ronda: modo === 'bot' ? diario.nextRound : null,
      arena: (window.__arenaPrueba && M.ARENAS[window.__arenaPrueba]) ? window.__arenaPrueba : arenas[arenaN++ % arenas.length],
      luchadores: luchadores,
      extraInicio: modo === 'bot' ? { daily: diario } : null,
      enviar: function (l, ev, d) {
        if (l.clave !== 'yo') return;
        var c = JSON.parse(JSON.stringify(d));
        setTimeout(function () { if (!P || !P._fuera) s._fire(ev, c); }, RED_MS);
      },
      alTerminar: function (Pf, r) {
        clearInterval(host.reloj);
        var fila = r.puestos.filter(function (f) { return f.clave === 'yo'; })[0];
        var gano = !!fila && fila.puesto === 1;
        if (modo === 'bot') {
          diario = { done: diario.done + 1, max: 5, remaining: Math.max(0, 4 - diario.done), nextRound: Math.min(5, diario.done + 2), wins: diario.wins + (gano ? 1 : 0) };
        }
        var fin = {
          matchId: Pf.id, modo: modo, ronda: Pf.ronda, resultado: gano ? 'win' : 'lose',
          puesto: fila ? fila.puesto : r.puestos.length, de: r.puestos.length, yo: fila ? fila.id : null,
          puntos: modo === 'practica' ? 0 : (modo === 'bot' ? (gano ? 1 : 0) : (gano ? 3 : 1)),
          motivo: r.motivo, duracionMs: r.duracionMs, daily: modo === 'bot' ? diario : null,
          petLevel: 6, tabla: r.puestos,
          // La arena da EXP (misma tabla que expDeArena en server2.js).
          exp: modo === 'practica' ? 0 : (modo === 'bot' ? (gano ? 60 : 15) : ([100, 60, 40, 25][Math.min(3, (fila ? fila.puesto : 9) - 1)])),
          expTotal: null
        };
        setTimeout(function () {
          if (!Pf._fuera) s._fire('brawl:fin', fin);
          if (modo === 'bot') s._fire('battle:daily', diario);
          if (brawl && brawl.P === Pf) brawl = null;
        }, RED_MS + 30);
      }
    });
    host.reloj = setInterval(function () {
      try { M.paso(P); } catch (e) { console.error('[arena de mentira] paso', e); clearInterval(host.reloj); }
      if (P._fuera && P.fase !== 'fin') { /* se fue: sigue sola hasta acabar */ }
    }, 50);
    brawl = { P: P, yo: 1, host: host };
    window.__arenaFalsa = brawl;
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
  /* Tampoco llegan fotogramas si la página está "visible" pero el panel que
     la contiene no se está pintando (el navegador integrado de las pruebas,
     minimizado): se detecta mirando si requestAnimationFrame sigue vivo. */
  var rafVivo = performance.now();
  (function latir() { rafVivo = performance.now(); requestAnimationFrame(latir); })();
  var motorT = 0;
  setInterval(function () {
    var sinFotogramas = performance.now() - rafVivo > 400;
    if (!document.hidden && !sinFotogramas) { motorT = 0; return; }
    var g = window.game;
    if (!g || !g.isRunning || typeof g.step !== 'function') return;
    if (!motorT) motorT = (g.loop && g.loop.time) || performance.now();
    // A tiempo real (antes iba al doble: 30 pasos cada 250 ms). Con el
    // combate en tiempo real eso importa: el servidor recorta lo que se anda.
    var ahora = performance.now();
    var pasos = Math.max(1, Math.min(30, Math.floor((ahora - motorT) / 16.67)));
    for (var i = 0; i < pasos; i++) {
      motorT += 16.67;
      try { g.step(motorT, 16.67); } catch (e) { apuntar('motor', [e]); break; }
    }
  }, 50);

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
