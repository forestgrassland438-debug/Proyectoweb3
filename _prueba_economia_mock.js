/* =============================================================================
 * BANCO DE PRUEBAS DE LA ECONOMÍA (_prueba_economia.html)          (2026-10-26)
 * Un GFAdminSession falso, cargado ANTES de admin-session.js, con las rutas y
 * las respuestas de server2.js:
 *   GET  /api/admin/whoami, GET /api/admin/economia,
 *   POST /api/admin/economia/config, POST /api/admin/economia/foto,
 *   POST /api/admin/tesoro-juego/ajuste
 * ?vacio=1  → todo recién creado (sin fotos ni movimientos)
 * ?viejo=1  → servidor antiguo: /api/admin/economia da 404
 * El estado queda en window.__mockEconomia para inspeccionarlo.
 * ========================================================================== */
(function (root) {
  'use strict';
  const q = new URLSearchParams(location.search);
  const vacio = q.get('vacio') === '1', viejo = q.get('viejo') === '1';
  // Números repetibles de una prueba a otra.
  let semilla = 20261026;
  const azar = () => { semilla = (semilla + 0x6D2B79F5) | 0; let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const ahora = Date.now(), DIA = 86400000;
  const BASE = { compraActiva: true, precioBase: 0.001, sensibilidad: 0.8, pasoMax: 0.05, topeDiario: 300, topeMin: 25, minimoCompra: 1, cartera: '' };
  const serieJuego = [], serieEco = [];
  let oro = 4000, plata = 2.1e6, bronce = 6.5e8, precio = 0.001;
  for (let i = 29; i >= 0; i--) {
    const dia = new Date(ahora - i * DIA).toISOString().slice(0, 10), f = vacio ? 0 : 1;
    serieJuego.push({ dia, tienda: f * Math.round(azar() * 98000 + 7000), p2p: f * (azar() < 0.6 ? Math.round(azar() * 210000) : 0),
                      viajes: f * Math.round(azar() * 40000), vip: f * (azar() < 0.25 ? 5000000 : 0), revivir: f * Math.round(azar() * 9000),
                      admin: f * (i === 9 ? 1000000 : 0), compras: f * Math.floor(azar() * 4) });
    if (vacio) continue;
    const inf = Math.sin(i / 4) * 0.012 + (i < 6 ? 0.018 : 0.004);
    oro = Math.round(oro * (1 + inf * 0.6)); plata = Math.round(plata * (1 + inf)); bronce = Math.round(bronce * (1 + inf * 1.4));
    precio = Math.max(0.0008, precio * (1 + inf * 0.8 * 0.3));
    serieEco.push({ dia, precio, inflacion1: i === 29 ? null : inf, inflacion7: null, salud: 'estable', oro, plata, bronce,
                    masa: oro * 1e6 + plata * 1000 + bronce, jugadores: 1100 + (29 - i) * 6 });
  }
  const sumar = k => serieJuego.reduce((a, d) => a + d[k], 0);
  const ult = serieEco[serieEco.length - 1];
  const estado = {
    config: Object.assign({}, BASE),
    juego: { saldo: vacio ? 0 : sumar('tienda') + sumar('p2p') + sumar('viajes') + sumar('vip') + sumar('revivir') + sumar('admin') - 250000,
             retirado: vacio ? 0 : 250000,
             ingresado: { tienda: sumar('tienda'), p2p: sumar('p2p'), viajes: sumar('viajes'), vip: sumar('vip'), revivir: sumar('revivir'), admin: sumar('admin'), compra_oro: 0 },
             ingresos: {}, zkltc: { recibido: vacio ? 0 : 0.84213, compras: vacio ? 0 : 41, oro: vacio ? 0 : 763 }, actualizado: new Date().toISOString() },
    circular: { saldo: vacio ? 0 : 1834560, reservado: vacio ? 0 : 4120,
                ingresado: { tienda: vacio ? 0 : 412000, p2p: vacio ? 0 : 158000, admin: vacio ? 0 : 500000, cambio: vacio ? 0 : 96400 },
                ingresos: { tienda: 0, p2p: 0, cambio: 0 }, pagado: { free: vacio ? 0 : 288000, vip: vacio ? 0 : 91000 },
                pagos: { free: vacio ? 0 : 131, vip: vacio ? 0 : 38 }, retirado: vacio ? 0 : 120000, caducados: vacio ? 0 : 9, actualizado: new Date().toISOString() },
    movs: [], compras: []
  };
  if (!vacio) {
    const nombres = ['Rosalind', 'Kito', 'MarAzul', 'Thorne', 'Lia_88', 'Bramble', 'Nox', 'Pip'];
    const origenes = ['tienda', 'tienda', 'p2p', 'viajes', 'viajes', 'vip', 'revivir'];
    for (let i = 0; i < 40; i++) {
      const o = origenes[Math.floor(azar() * origenes.length)], quien = nombres[Math.floor(azar() * nombres.length)];
      const bronceM = { tienda: Math.round(azar() * 9000 + 300), p2p: Math.round(azar() * 40000 + 2000), viajes: [600, 1500, 3200][Math.floor(azar() * 3)],
                        vip: 5000000, revivir: 2000 }[o];
      estado.movs.push({ t: new Date(ahora - i * 53 * 60000), tipo: 'ingreso', origen: o, bronce: bronceM, playerName: quien,
                         detalle: { tienda: 'compra arco x1', p2p: 'p2p espada_hierro x2', viajes: 'mapa desierto', vip: 'VIP 1m', revivir: 'pocion_revivir x1' }[o] });
    }
    const estados = ['acreditada', 'acreditada', 'acreditada', 'pagada', 'cotizada', 'fallida'];
    for (let i = 0; i < 12; i++) {
      const e = estados[Math.floor(azar() * estados.length)], oroC = 5 + Math.floor(azar() * 60);
      estado.compras.push({ id: 'c' + i, t: new Date(ahora - i * 3.1 * 3600000), playerName: nombres[i % nombres.length], oro: oroC, oroDado: e === 'acreditada' ? oroC : 0,
                            estado: e, zkltc: oroC * ult.precio, pagado: e === 'acreditada' || e === 'pagada' ? oroC * ult.precio : 0,
                            txHash: e === 'cotizada' ? null : '0x' + (i + 10).toString(16).padStart(2, '0').repeat(32), motivo: e === 'fallida' ? 'pago_insuficiente' : '' });
    }
  }

  function publico() {
    const ant = serieEco[serieEco.length - 8];
    const inf7 = ant ? ult.masa / ant.masa - 1 : null;
    const salud = !ult ? 'sin_datos' : inf7 < -0.01 ? 'deflacion' : inf7 < 0.05 ? 'estable' : inf7 < 0.15 ? 'caliente' : 'recalentada';
    return { ok: true, dia: ult ? ult.dia : null, moneda: 'zkLTC', chainId: 4441,
             precioOro: { zkltc: ult ? ult.precio : estado.config.precioBase, gwei: Math.round((ult ? ult.precio : estado.config.precioBase) * 1e9), base: estado.config.precioBase },
             salud, inflacion1: ult ? ult.inflacion1 : null, inflacion7: inf7,
             masa: ult ? { oro: ult.oro, plata: ult.plata, bronce: ult.bronce, total: ult.masa, jugadores: ult.jugadores } : { oro: 0, plata: 0, bronce: 0, total: 0, jugadores: 0 },
             tope: salud === 'recalentada' ? estado.config.topeMin : salud === 'caliente' ? Math.round((estado.config.topeDiario + estado.config.topeMin) / 2) : estado.config.topeDiario,
             compra: { activa: estado.config.compraActiva, destino: estado.config.cartera || '0x' + 'cd'.repeat(20), minimo: estado.config.minimoCompra },
             comisiones: { mercadoBps: 500, circularBps: 150, juegoBps: 350, cambioBps: { oro: 100, plata: 200, bronce: 300 } },
             tesoros: { circular: estado.circular.saldo, juego: estado.juego.saldo }, serie: JSON.parse(JSON.stringify(serieEco)) };
  }

  function error(status, code) { const e = new Error(code || ('HTTP ' + status)); e.status = status; e.code = code; return e; }
  const espera = ms => new Promise(r => setTimeout(r, ms));
  async function request(path, options = {}) {
    if (typeof path !== 'string' || !path.startsWith('/api/')) throw new Error('Invalid API path');
    await espera(80 + Math.floor(Math.random() * 120));
    if (options.signal && options.signal.aborted) throw new DOMException('Administration request cancelled', 'AbortError');
    const metodo = options.method || 'GET', cuerpo = options.body ? JSON.parse(options.body) : {};
    if (path === '/api/admin/whoami') return { address: '0x' + 'ab'.repeat(20) };
    if (viejo && (path.startsWith('/api/admin/economia') || path.startsWith('/api/admin/tesoro-juego'))) throw error(404, 'not_found');
    if (path === '/api/admin/economia' && metodo === 'GET') {
      return { ok: true, juego: JSON.parse(JSON.stringify(estado.juego)), circular: JSON.parse(JSON.stringify(estado.circular)),
               config: Object.assign({}, estado.config), base: BASE, destino: estado.config.cartera || '0x' + 'cd'.repeat(20), destinoServidor: !estado.config.cartera,
               economia: publico(), serieJuego: JSON.parse(JSON.stringify(serieJuego)), ultimos: estado.movs.slice(0, 40), compras: estado.compras.slice(0, 40) };
    }
    if (path === '/api/admin/economia/config' && metodo === 'POST') {
      const c = cuerpo.config || {};
      if (c.cartera && !/^0x[0-9a-f]{40}$/.test(c.cartera)) throw error(400, 'cartera_invalida');
      estado.config = Object.assign({}, BASE, c);
      return { ok: true, config: estado.config };
    }
    if (path === '/api/admin/economia/foto' && metodo === 'POST') return { ok: true, dia: ult ? ult.dia : null };
    if (path === '/api/admin/tesoro-juego/ajuste' && metodo === 'POST') {
      const tipo = String(cuerpo.tipo || ''), bronceA = Math.floor(Number(cuerpo.bronce) || 0), motivo = String(cuerpo.motivo || '').trim();
      if (tipo !== 'ingreso' && tipo !== 'retiro') throw error(400, 'tipo_invalido');
      if (!(bronceA >= 1 && bronceA <= 1e12)) throw error(400, 'cantidad_invalida');
      if (motivo.length < 3) throw error(400, 'motivo_requerido');
      if (tipo === 'retiro' && estado.juego.saldo < bronceA) throw error(409, 'saldo_insuficiente');
      if (tipo === 'ingreso') { estado.juego.saldo += bronceA; estado.juego.ingresado.admin += bronceA; }
      else { estado.juego.saldo -= bronceA; estado.juego.retirado += bronceA; }
      estado.movs.unshift({ t: new Date(), tipo: 'ajuste', origen: 'admin', bronce: tipo === 'ingreso' ? bronceA : -bronceA, playerName: null, detalle: motivo + ' — 0xabab…' });
      return { ok: true, juego: JSON.parse(JSON.stringify(estado.juego)) };
    }
    throw error(404, 'not_found');
  }
  root.__mockEconomia = estado;
  root.GFAdminSession = Object.freeze({
    base: 'mock', request, signIn: async () => ({ address: '0x' + 'ab'.repeat(20) }), getCsrf: async () => 'mock',
    refresh: async () => ({}), logout: async () => {}, provider: () => null, invalidate() {},
    subscribe() { return () => {}; }, diagnostics() { return { pending: 0, renewing: false }; }, dispose() {}
  });
})(window);
