/* =============================================================================
 * BANCO DE PRUEBAS DEL PANEL DEL TESORO (_prueba_tesoro.html)      (2026-10-22)
 * Un GFAdminSession falso, cargado ANTES de admin-session.js (que entonces no
 * hace nada), con las mismas rutas y respuestas que server2.js:
 *   GET  /api/admin/whoami, GET /api/admin/tesoro,
 *   POST /api/admin/tesoro/config, POST /api/admin/tesoro/ajuste
 * ?vacio=1  → tesoro recién creado (sin movimientos)
 * ?viejo=1  → servidor antiguo: /api/admin/tesoro da 404
 * El estado queda en window.__mockTesoro para inspeccionarlo.
 * ========================================================================== */
(function (root) {
  'use strict';
  const q = new URLSearchParams(location.search);
  const vacio = q.get('vacio') === '1', viejo = q.get('viejo') === '1';
  // Números repetibles de una prueba a otra.
  let semilla = 20261022;
  const azar = () => { semilla = (semilla + 0x6D2B79F5) | 0; let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const ahora = Date.now();
  const serie = [];
  for (let i = 29; i >= 0; i--) {
    const dia = new Date(ahora - i * 86400000).toISOString().slice(0, 10);
    const f = vacio ? 0 : 1;
    const premios = f * Math.floor(azar() * 9);
    serie.push({ dia, tienda: f * Math.round(azar() * 42000 + 3000), p2p: f * (azar() < 0.55 ? Math.round(azar() * 90000) : 0),
                 admin: f * (i === 12 ? 500000 : 0), pagoFree: f * Math.round(premios * (900 + azar() * 1400)),
                 pagoVip: f * (azar() < 0.6 ? Math.round(azar() * 16000) : 0), premios });
  }
  const sumar = k => serie.reduce((a, d) => a + d[k], 0);
  const estado = {
    tesoro: {
      saldo: vacio ? 0 : 1834560, reservado: vacio ? 0 : 4120,
      ingresado: { tienda: sumar('tienda') + (vacio ? 0 : 210000), p2p: sumar('p2p') + (vacio ? 0 : 95000), admin: sumar('admin') },
      ingresos: { tienda: vacio ? 0 : 412, p2p: vacio ? 0 : 57 },
      pagado: { free: sumar('pagoFree'), vip: sumar('pagoVip') }, pagos: { free: vacio ? 0 : 131, vip: vacio ? 0 : 38 },
      retirado: vacio ? 0 : 120000, caducados: vacio ? 0 : 9, actualizado: new Date().toISOString()
    },
    config: null,
    movs: []
  };
  if (!vacio) {
    const nombres = ['Rosalind', 'Kito', 'MarAzul', 'Thorne', 'Lia_88', 'Bramble', 'Nox', 'Pip'];
    for (let i = 0; i < 30; i++) {
      const r = azar(), quien = nombres[Math.floor(azar() * nombres.length)], t = new Date(ahora - i * 47 * 60000 - Math.floor(azar() * 600000));
      if (r < 0.45) estado.movs.push({ t, tipo: 'ingreso', origen: 'tienda', bronce: Math.round(azar() * 6000 + 150), playerName: quien, vip: null, nivel: null, detalle: (azar() < 0.6 ? 'compra' : 'venta') + ' arco x1' });
      else if (r < 0.6) estado.movs.push({ t, tipo: 'ingreso', origen: 'p2p', bronce: Math.round(azar() * 30000 + 1500), playerName: quien, vip: null, nivel: null, detalle: 'p2p espada_hierro x2' });
      else if (r < 0.97) estado.movs.push({ t, tipo: 'pago', origen: 'monstruo', bronce: Math.round(azar() * 3000 + 100), playerName: quien, vip: azar() < 0.3, nivel: 4 + Math.floor(azar() * 9), detalle: azar() < 0.1 ? 'jefe_desierto' : 'lobo' });
      else estado.movs.push({ t, tipo: 'ajuste', origen: 'admin', bronce: 500000, playerName: null, vip: null, nivel: null, detalle: 'Launch boost — 0xabc…' });
    }
  }

  function error(status, code) { const e = new Error(code || ('HTTP ' + status)); e.status = status; e.code = code; return e; }
  const espera = ms => new Promise(r => setTimeout(r, ms));
  // En _prueba_tesoro_cc.html la sesión falsa vive en el centro de control y las cuentas en el iframe.
  function calc() {
    if (root.GFTesoroCalc) return root.GFTesoroCalc;
    for (let i = 0; i < root.frames.length; i++) { try { if (root.frames[i].GFTesoroCalc) return root.frames[i].GFTesoroCalc; } catch (_) {} }
    throw new Error('GFTesoroCalc is not loaded');
  }
  function respuestaTesoro() {
    const C = calc(), cfg = C.normalizar(estado.config);
    const ejemplos = C.NIVELES_EJEMPLO.map(nivel => ({
      nivel,
      free: C.probabilidad(cfg, { vip: false, nivel, racha: 0 }), vip: C.probabilidad(cfg, { vip: true, nivel, racha: 0 }),
      freeRacha: C.probabilidad(cfg, { vip: false, nivel, racha: 1000 }), vipRacha: C.probabilidad(cfg, { vip: true, nivel, racha: 1000 }),
      pagoFree: C.cantidad(cfg, estado.tesoro.saldo, { vip: false, nivel, exp: 130 }, 0.5), pagoVip: C.cantidad(cfg, estado.tesoro.saldo, { vip: true, nivel, exp: 130 }, 0.5)
    }));
    const premiados = new Map();
    estado.movs.filter(m => m.tipo === 'pago').forEach(m => {
      const p = premiados.get(m.playerName) || { playerName: m.playerName, bronce: 0, premios: 0, vip: m.vip };
      p.bronce += m.bronce; p.premios++; premiados.set(m.playerName, p);
    });
    return {
      ok: true, tesoro: JSON.parse(JSON.stringify(estado.tesoro)), config: cfg, base: C.BASE, comisionBps: 150,
      bronce: C.BRONCE_POR, probMax: C.PROB_MAX, ejemplos,
      jugadores: vacio ? { cuentas: 0, vip: 0, free: 0, conNombre: 0, sinNombre: 0, activos24h: 0, vipActivos24h: 0 }
        : { cuentas: 1287, vip: 143, free: 1144, conNombre: 1012, sinNombre: 275, activos24h: 318, vipActivos24h: 61 },
      niveles: vacio ? [] : [{ tramo: '1', jugadores: 402 }, { tramo: '2-3', jugadores: 377 }, { tramo: '4', jugadores: 188 },
                             { tramo: '5', jugadores: 121 }, { tramo: '6', jugadores: 104 }, { tramo: '7+', jugadores: 95 }],
      mapas: vacio ? [] : [{ sala: 'mina', nivel: 2, jugadores: 885 }, { sala: 'salvaje', nivel: 4, jugadores: 508 }, { sala: 'desierto', nivel: 5, jugadores: 320 },
                           { sala: 'cementerio', nivel: 6, jugadores: 199 }, { sala: 'tundra', nivel: 7, jugadores: 95 }],
      serie: JSON.parse(JSON.stringify(serie)),
      top: [...premiados.values()].sort((a, b) => b.bronce - a.bronce).slice(0, 10),
      ultimos: estado.movs.slice(0, 30)
    };
  }
  async function request(path, options = {}) {
    if (typeof path !== 'string' || !path.startsWith('/api/')) throw new Error('Invalid API path');
    await espera(80 + Math.floor(Math.random() * 120));
    if (options.signal && options.signal.aborted) throw new DOMException('Administration request cancelled', 'AbortError');
    const metodo = options.method || 'GET', cuerpo = options.body ? JSON.parse(options.body) : {};
    if (path === '/api/admin/whoami') return { address: '0x' + 'ab'.repeat(20) };
    if (viejo && path.startsWith('/api/admin/tesoro')) throw error(404, 'not_found');
    if (path === '/api/admin/tesoro' && metodo === 'GET') return respuestaTesoro();
    if (path === '/api/admin/tesoro/config' && metodo === 'POST') {
      estado.config = calc().normalizar(cuerpo.config);
      return { ok: true, config: estado.config };
    }
    if (path === '/api/admin/tesoro/ajuste' && metodo === 'POST') {
      const tipo = String(cuerpo.tipo || ''), bronce = Math.floor(Number(cuerpo.bronce) || 0), motivo = String(cuerpo.motivo || '').trim();
      if (tipo !== 'ingreso' && tipo !== 'retiro') throw error(400, 'tipo_invalido');
      if (!(bronce >= 1 && bronce <= 1e12)) throw error(400, 'cantidad_invalida');
      if (motivo.length < 3) throw error(400, 'motivo_requerido');
      if (tipo === 'retiro' && estado.tesoro.saldo < bronce) throw error(409, 'saldo_insuficiente');
      if (tipo === 'ingreso') { estado.tesoro.saldo += bronce; estado.tesoro.ingresado.admin += bronce; }
      else { estado.tesoro.saldo -= bronce; estado.tesoro.retirado += bronce; }
      estado.movs.unshift({ t: new Date(), tipo: 'ajuste', origen: 'admin', bronce: tipo === 'ingreso' ? bronce : -bronce, playerName: null, vip: null, nivel: null, detalle: motivo + ' — 0xabab…' });
      return { ok: true, tesoro: JSON.parse(JSON.stringify(estado.tesoro)) };
    }
    throw error(404, 'not_found');
  }
  root.__mockTesoro = estado;
  root.GFAdminSession = Object.freeze({
    base: 'mock', request, signIn: async () => ({ address: '0x' + 'ab'.repeat(20) }), getCsrf: async () => 'mock',
    refresh: async () => ({}), logout: async () => {}, provider: () => null, invalidate() {},
    subscribe() { return () => {}; }, diagnostics() { return { pending: 0, renewing: false }; }, dispose() {}
  });
})(window);
