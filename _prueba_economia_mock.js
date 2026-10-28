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

  /* (2026-10-28) LA ECONOMÍA, 2.ª PARTE: fondo de reserva, quemas, índice e inflaciones, y los precios. */
  estado.reserva = { saldo: vacio ? 0 : 960000, retirado: 0, quemado: 0, ingresado: { muerte: vacio ? 0 : 900000, admin: vacio ? 0 : 60000 }, ingresos: { muerte: 30, admin: 1 } };
  estado.cfg2 = { indiceActivo: true, sensibilidad: 0.6, pasoMax: 0.03, demanda: 0.1, pesoObjetos: 1, muerteBase: 30, muerteMultiplicador: 2, muerteTope: 480,
                  fundirTasa: 0.05, fundirMin: 50, craftearTasa: 0.04, craftearMin: 50 };
  estado.quemas = vacio ? [] : [
    { t: new Date(ahora - 3600000).toISOString(), tipo: 'objetos', origen: 'basura', cantidad: 6, bronce: 120000, itemId: 'tomate_buena', playerName: 'Kito', detalle: 'trash bin' },
    { t: new Date(ahora - 7200000).toISOString(), tipo: 'monedas', origen: 'monedas_caducadas', tesoro: 'circular', moneda: 'bronce', cantidad: 300, bronce: 300, playerName: 'Nox', detalle: 'lobo_salvaje' },
    { t: new Date(ahora - 9600000).toISOString(), tipo: 'objetos', origen: 'suelo_caducado', cantidad: 3, bronce: 9000, itemId: 'mineral_piedra', playerName: 'Pip', detalle: 'salvaje' }];
  function v2() {
    const sc = serieEco.map((d, i) => Object.assign({}, d, { indice: 1 + i * 0.001, inflacionActiva7: i > 6 ? (serieEco[i].masa / serieEco[i - 7].masa - 1) : null,
      inflacionNeta7: i > 6 ? (serieEco[i].masa / serieEco[i - 7].masa - 1) - 0.0004 : null, inflacionTotal7: i > 6 ? (serieEco[i].masa / serieEco[i - 7].masa - 1) * 0.98 : null,
      quemadoMonedas: (i * 7919) % 30000, quemadoObjetos: (i * 3571) % 90000, muerteBronce: (i * 9173) % 240000, serviciosBronce: (i * 4441) % 50000,
      tesoroCircular: 1500000 + i * 11000, tesoroJuego: 3900000 + i * 13000, tesoroReserva: 600000 + i * 12000, masaActiva: d.masa + 1500000, masaTotal: d.masa + 6000000 }));
    const u = sc[sc.length - 1] || {};
    const precioM = (n) => Math.max(1, Math.round(Math.min(estado.cfg2.muerteBase * 1.031 * Math.pow(estado.cfg2.muerteMultiplicador, n), estado.cfg2.muerteTope * 1.031)));
    return { ok: true, ahora: Date.now(), config: Object.assign({}, estado.cfg2), base: {},
      tesoros: { circular: { saldo: estado.circular.saldo, reservado: estado.circular.reservado, quemado: estado.circular.quemado || 0 },
                 juego: { saldo: estado.juego.saldo, quemado: estado.juego.quemado || 0 }, reserva: JSON.parse(JSON.stringify(estado.reserva)) },
      indice: 1.031, indiceAyer: 1.03,
      hoy: { dia: u.dia, masa: u.masa, masaActiva: u.masaActiva, masaTotal: u.masaTotal, inflacionActiva7: u.inflacionActiva7, inflacionTotal7: u.inflacionTotal7,
             inflacionNeta7: u.inflacionNeta7, quemadoObjetos7: 220000, precioOro: u.precio, precioGwei: Math.round((u.precio || 0.001) * 1e9), salud: 'caliente' },
      proyeccion: { cfgOro: { precioBase: estado.config.precioBase, sensibilidad: estado.config.sensibilidad, pasoMax: estado.config.pasoMax } },
      muerte: { tabla: [0, 1, 2, 3, 4, 5, 6].map(n => ({ muertes: n, plata: precioM(n) })), cobrado30: 2840000, cobros30: 61 },
      servicios: { fundir: { bronce: 61250, n: 49 }, craftear: { bronce: 238000, n: 31 } },
      ejemplosServicio: [{ tipo: 'fundir', itemId: 'mineral_cobre', bronce: 1289 }, { tipo: 'fundir', itemId: 'mineral_hierro', bronce: 2320 }, { tipo: 'craftear', itemId: 'hacha_de_piedra', bronce: 8248 }],
      serie: sc, quemas: { porOrigen: [{ tipo: 'objetos', origen: 'basura', bronce: 1250000, n: 88 }, { tipo: 'monedas', origen: 'monedas_caducadas', bronce: 41000, n: 77 }],
                           ultimas: estado.quemas.slice(0, 60) } };
  }
  estado.puntos = {};
  estado.precios = [['Semillax', 10, 5, 'plata', 1], ['Semillax2', 8, 3, 'plata', 1], ['tomate_buena', 28, 20, 'plata', 1.05], ['cofre1', 2, 1, 'oro', 1],
                    ['espada_hierro', 600, 300, 'plata', 0.97], ['pes12', 0, 160, 'plata', 1], ['mineral_cobre', 0, 25000, 'bronce', 1], ['palo', 0, 1000, 'bronce', 1]]
    .map(([id, c, v, m, dem]) => ({ itemId: id, nivel: 1, tienda: !/^(mineral_cobre|palo)$/.test(id), compra: c ? Math.round(c * 1.031 * dem) : 0, venta: Math.round(v * 1.031 * dem), moneda: m,
      base: { compra: c, venta: v, moneda: m }, defecto: { compra: c, venta: v, moneda: m }, cambiado: false, sigueIndice: true, demanda: dem,
      cambio1: 0.001, cambio7: (dem - 1) + 0.012, cambio30: (dem - 1) + 0.031, valorBronce: v * (m === 'oro' ? 1e6 : m === 'plata' ? 1000 : 1),
      spark: Array.from({ length: 30 }, (_, i) => ({ t: new Date(ahora - (29 - i) * DIA).toISOString(), v: Math.round((c || v) * (1 + i * 0.001) * (1 + Math.sin(i / 4) * 0.02)) })),
      p2p: id === 'espada_hierro' ? { n: 9, mediana: 330000, min: 290000, max: 410000, media: 340000, volumen: 14 } : null, tienda7: { compras: (c * 7) % 40, ventas: (v * 3) % 25 } }));
  function preciosAdmin() { return { ok: true, ahora: Date.now(), version: Date.now(), dia: new Date().toISOString().slice(0, 10), indice: 1.031, items: JSON.parse(JSON.stringify(estado.precios)) }; }
  function historialItem(id) {
    const it = estado.precios.find(x => x.itemId === id) || estado.precios[0];
    const hist = [];
    for (let i = 89; i >= 0; i--) { const f = 1 + (89 - i) * 0.0004 + Math.sin(i / 7) * 0.02; hist.push({ t: new Date(ahora - i * DIA - 5 * 3600000).toISOString(), compra: it.base.compra ? Math.round(it.base.compra * f) : 0, venta: Math.round(it.base.venta * f), moneda: it.base.moneda, indice: f, motivo: 'diario' }); }
    hist.push(...(estado.puntos[id] || []));
    const ventas = it.p2p ? Array.from({ length: 12 }, (_, i) => ({ t: new Date(ahora - i * 5 * DIA).toISOString(), precio: 300 + (i * 17) % 90, cantidad: 1 + i % 3, moneda: 'plata' })) : [];
    return { ok: true, itemId: id, ahora: Date.now(), indice: 1.031, actual: it, valorBronce: it.valorBronce, historial: hist, p2p: { resumen: it.p2p, ventas },
             tienda: Array.from({ length: 30 }, (_, i) => ({ dia: new Date(ahora - (29 - i) * DIA).toISOString().slice(0, 10), compras: (i * 7) % 9, ventas: (i * 5) % 6 })) };
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
    // (2026-10-27) Las recargas: búsqueda, estado, totales y revisar en la cadena.
    if (path.startsWith('/api/admin/economia/compras') && metodo === 'GET') {
      const qs = new URLSearchParams(path.split('?')[1] || '');
      const q = String(qs.get('q') || '').toLowerCase(), est = qs.get('estado') || '';
      let filas = estado.compras.map((c, i) => Object.assign({ address: '0x' + String((i % 9) + 1).repeat(40), username: c.playerName + (i % 2 ? '' : '_GF'),
        reclamada: i === 3, revisadaPor: i === 5 ? '0x' + 'ab'.repeat(20) : '' }, c));
      if (est) filas = filas.filter(c => c.estado === est);
      else filas = filas.filter(c => c.estado !== 'cotizada' || c.txHash);
      if (q) filas = filas.filter(c => [c.playerName, c.username, c.address, c.txHash].some(x => String(x || '').toLowerCase().includes(q)));
      const porEstado = {};
      estado.compras.forEach((c, i) => { const p = porEstado[c.estado] = porEstado[c.estado] || { estado: c.estado, n: 0, oro: 0, reclamadas: 0 }; p.n++; p.oro += c.oroDado || 0; if (i === 3) p.reclamadas++; });
      return { ok: true, destino: estado.config.cartera || '0x' + 'cd'.repeat(20), recibidoZk: estado.juego.zkltc.recibido, resumen: Object.values(porEstado), compras: filas };
    }
    if (/^\/api\/admin\/economia\/compras\/[^/]+\/revisar$/.test(path) && metodo === 'POST') {
      const id = path.split('/')[5];
      const c = estado.compras.find(x => x.id === id);
      if (!c) throw error(404, 'no_encontrada');
      if (c.estado === 'fallida') throw error(409, 'otro_destino');
      c.estado = 'acreditada'; c.oroDado = c.oro; c.motivo = '';
      return { ok: true, oro: c.oro };
    }
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
    // (2026-10-28) LA ECONOMÍA, 2.ª PARTE (economia2.js) y los precios (precios.js), como server2.js.
    if (viejo && (path.startsWith('/api/admin/economia/v2') || path.startsWith('/api/admin/precios') || path.startsWith('/api/economia/precio'))) throw error(404, 'not_found');
    if (path === '/api/admin/economia/v2' && metodo === 'GET') return v2();
    if (path === '/api/admin/economia/v2/config' && metodo === 'POST') { estado.cfg2 = Object.assign({}, estado.cfg2, cuerpo.config || {}); return { ok: true, config: estado.cfg2 }; }
    if (path === '/api/admin/economia/v2/recalcular' && metodo === 'POST') return { ok: true, indice: 1.031, version: Date.now() };
    if (path === '/api/admin/economia/quemar' && metodo === 'POST') {
      const POR = { oro: 1e6, plata: 1000, bronce: 1 }, t2 = cuerpo.tesoro, cant = Math.floor(Number(cuerpo.cantidad) || 0);
      if (!['circular', 'juego', 'reserva'].includes(t2) || !POR[cuerpo.moneda]) throw error(400, 'datos_invalidos');
      if (String(cuerpo.motivo || '').trim().length < 3) throw error(400, 'motivo_requerido');
      const br = cant * POR[cuerpo.moneda], tes = t2 === 'circular' ? estado.circular : t2 === 'juego' ? estado.juego : estado.reserva;
      if (!(cant >= 1) || tes.saldo < br) throw error(409, 'saldo_insuficiente');
      tes.saldo -= br; tes.quemado = (tes.quemado || 0) + br;
      estado.quemas.unshift({ t: new Date().toISOString(), tipo: 'monedas', origen: 'admin', tesoro: t2, moneda: cuerpo.moneda, cantidad: cant, bronce: br, detalle: cuerpo.motivo });
      return { ok: true, tesoro: t2, bronce: br, saldo: tes.saldo };
    }
    if (path === '/api/admin/tesoro-reserva/ajuste' && metodo === 'POST') {
      const br = Math.floor(Number(cuerpo.bronce) || 0);
      if (cuerpo.tipo === 'retiro' && estado.reserva.saldo < br) throw error(409, 'saldo_insuficiente');
      if (cuerpo.tipo === 'ingreso') { estado.reserva.saldo += br; estado.reserva.ingresado.admin += br; } else { estado.reserva.saldo -= br; estado.reserva.retirado += br; }
      return { ok: true, reserva: JSON.parse(JSON.stringify(estado.reserva)) };
    }
    if (path === '/api/admin/precios' && metodo === 'GET') return preciosAdmin();
    if (path.startsWith('/api/economia/precio/') && metodo === 'GET') return historialItem(decodeURIComponent(path.split('/')[4].split('?')[0]));
    if (path === '/api/admin/precios/item' && metodo === 'POST') {
      const it = estado.precios.find(x => x.itemId === cuerpo.itemId);
      if (!it) throw error(400, 'objeto_desconocido');
      if (cuerpo.quitar) { it.base = Object.assign({}, it.defecto); it.cambiado = false; }
      else {
        if (cuerpo.compra > 0 && cuerpo.venta >= cuerpo.compra) throw error(400, 'venta_mayor');
        it.base = { compra: it.tienda ? cuerpo.compra : 0, venta: cuerpo.venta, moneda: cuerpo.moneda }; it.cambiado = true; it.sigueIndice = cuerpo.sigueIndice !== false;
      }
      const f = it.sigueIndice ? 1.031 * it.demanda : 1;
      it.compra = it.base.compra ? Math.max(1, Math.round(it.base.compra * f)) : 0; it.venta = Math.max(1, Math.round(it.base.venta * f)); it.moneda = it.base.moneda;
      (estado.puntos[it.itemId] = estado.puntos[it.itemId] || []).push({ t: new Date().toISOString(), compra: it.compra, venta: it.venta, moneda: it.moneda, indice: 1.031, motivo: 'admin' });
      return { ok: true, version: Date.now(), item: it };
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
