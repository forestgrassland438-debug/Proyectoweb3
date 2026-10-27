/* =============================================================================
 * BANCO DE PRUEBAS DE LA AUDITORÍA (_prueba_auditoria.html)        (2026-10-27)
 * Un GFAdminSession falso, cargado ANTES de admin-session.js, con las rutas y
 * las formas de respuesta de server2.js ("AUDITORÍA"):
 *   GET  /api/admin/auditoria/resumen | tienda | subidas | alertas
 *   POST /api/admin/auditoria/tienda/:id/revisada, /alertas/:id/revisada
 *   GET  /api/admin/suelo/movs | buscar | rastro/:id
 *   POST /api/admin/suelo/castigo, /suelo/castigo/quitar
 * ?viejo=1 → servidor antiguo (404). El estado queda en window.__mockAuditoria.
 * ========================================================================== */
(function (root) {
  'use strict';
  const q = new URLSearchParams(location.search);
  const viejo = q.get('viejo') === '1';
  const ahora = Date.now(), min = 60000;
  const J = {
    Ana: { playerName: 'Ana', username: 'AnaFarm', address: '0x' + '1a'.repeat(20), nivel: 12 },
    Bea: { playerName: 'Bea', username: 'BeaBee', address: '0x' + '2b'.repeat(20), nivel: 2 },
    Cris: { playerName: 'Cris', username: 'Crispy', address: '0x' + '3c'.repeat(20), nivel: 9 },
    Dani: { playerName: 'Dani', username: '', address: '0x' + '4d'.repeat(20), nivel: 5 }
  };
  const op = (id, j, extra) => Object.assign({ id, tienda: 'juego', playerName: J[j].playerName, username: J[j].username, address: J[j].address, nivel: J[j].nivel,
    estado: 'ok', avisos: [], problema: false, revisada: false }, extra);
  const estado = {
    ops: [
      op('r1', 'Ana', { op: 'compra', itemId: 'Semillax1', cantidad: 4, moneda: 'plata', t: new Date(ahora - 3 * min), tFin: new Date(ahora - 2 * min),
        cliente: { precioUnidad: 15, total: 60, fee: 3000, confirmadas: 4, reembolso: 0 }, esperado: { conocido: true, moneda: 'plata', precioUnidad: 15, total: 60, fee: 3000, nivel: 3 },
        verificacion: { visto: -63000, esperado: -63000, movs: 2, solapada: false } }),
      op('r2', 'Bea', { op: 'compra', itemId: 'espada_hierro', cantidad: 1, moneda: 'plata', t: new Date(ahora - 9 * min), tFin: new Date(ahora - 8 * min), estado: 'parcial',
        cliente: { precioUnidad: 1, total: 1, confirmadas: 0, reembolso: 1 }, esperado: { conocido: true, moneda: 'plata', precioUnidad: 600, total: 600, fee: 30000, nivel: 7 },
        avisos: ['precio_distinto', 'total_distinto', 'nivel_bajo'], problema: true, error: 'not confirmed on-chain',
        verificacion: { visto: 0, esperado: 0, movs: 0, solapada: false } }),
      op('r3', 'Cris', { op: 'venta', itemId: 'zanahoria_buena', cantidad: 5, moneda: 'plata', t: new Date(ahora - 30 * min), tFin: new Date(ahora - 29 * min),
        cliente: { precioUnidad: 14, total: 70, fee: 3500, confirmadas: 5, pagadoBronce: 66500 }, esperado: { conocido: true, moneda: 'plata', precioUnidad: 14, total: 70, fee: 3500, nivel: 1 },
        verificacion: null, avisos: ['cobro_no_visto'], problema: true }),
      op('r4', 'Dani', { op: 'compra', itemId: 'Semillax', cantidad: 2, moneda: 'plata', t: new Date(ahora - 50 * min), estado: 'en_curso',
        cliente: { precioUnidad: 10, total: 20 }, esperado: { conocido: true, moneda: 'plata', precioUnidad: 10, total: 20, fee: 1000, nivel: 1 } }),
      op('r5', 'Ana', { op: 'compra', itemId: 'cofre1', cantidad: 1, moneda: 'oro', t: new Date(ahora - 70 * min), estado: 'rechazada', fase: 'error',
        error: 'Insufficient funds for this purchase', esperado: { conocido: true, moneda: 'oro', precioUnidad: 2, total: 2, fee: 100000, nivel: 4 } })
    ],
    p2p: [
      { id: 'h:1', tienda: 'p2p', op: 'compra', playerName: 'Cris', address: J.Cris.address, itemId: 'cofre2', cantidad: 1, moneda: 'plata', estado: 'ok', avisos: [], problema: false,
        t: new Date(ahora - 12 * min), cliente: { precioUnidad: 300, total: 300, fee: 0 }, esperado: { total: 300, fee: 0 }, contraparte: 'Ana' },
      { id: 'h:2', tienda: 'p2p', op: 'venta', playerName: 'Ana', address: J.Ana.address, itemId: 'cofre2', cantidad: 1, moneda: 'plata', estado: 'ok', avisos: [], problema: false,
        t: new Date(ahora - 12 * min), cliente: { precioUnidad: 300, total: 300, fee: 15, recibe: 285 }, esperado: { total: 300, fee: 15 }, contraparte: 'Cris' },
      { id: 'p2p:9', tienda: 'p2p', op: 'POST buy/6650c0', playerName: 'Bea', username: 'BeaBee', address: J.Bea.address, nivel: 2, itemId: '', cantidad: 2, estado: 'rechazada',
        avisos: [], problema: false, t: new Date(ahora - 20 * min), cliente: { qty: '2' }, error: 'level_too_low: You need level 5 to get this item (you are level 2).' }
    ],
    subidas: [{ id: 's1', t: new Date(ahora - 40 * min), playerName: 'Dani', stat: 'oro', antes: 3, despues: 500, delta: 497, bronce: 497000000, quien: J.Dani }],
    suelo: [
      { id: 'm1', itemId: 'espada_cobre', cantidad: 1, nivelItem: 4, sala: 'salvaje', x: 812, y: 1440, de: J.Ana, para: J.Cris, estado: 'recogido', viene: [], pasadoA: ['m2'],
        t: new Date(ahora - 60 * min), tRecogido: new Date(ahora - 58 * min) },
      { id: 'm2', itemId: 'espada_cobre', cantidad: 1, nivelItem: 4, sala: 'desierto', x: 300, y: 700, de: J.Cris, para: J.Dani, estado: 'recogido', viene: ['m1'], pasadoA: [],
        t: new Date(ahora - 20 * min), tRecogido: new Date(ahora - 19 * min) },
      { id: 'm3', itemId: 'cofre3', cantidad: 1, nivelItem: 7, sala: 'salvaje', x: 500, y: 520, de: J.Ana, para: null, estado: 'en_suelo', viene: [], pasadoA: [], t: new Date(ahora - 4 * min) },
      { id: 'm4', itemId: 'madera_pinos', cantidad: 12, nivelItem: 1, sala: 'salvaje', x: 420, y: 900, de: J.Bea, para: null, estado: 'caducado', viene: [], pasadoA: [], t: new Date(ahora - 90 * min) }
    ],
    alertas: [
      { id: 'recoger_nivel:Bea:m3', tipo: 'recoger_nivel', gravedad: 'aviso', playerName: 'Bea', username: 'BeaBee', address: J.Bea.address, nivel: 2, itemId: 'cofre3',
        datos: { itemId: 'cofre3', nivelRequerido: 7, nivel: 2, de: 'Ana', deNombre: 'AnaFarm', sala: 'salvaje' }, veces: 6, t: new Date(ahora - 4 * min), ultima: new Date(ahora - 1 * min), revisada: false },
      { id: 'compra_nivel:Bea:espada_hierro', tipo: 'compra_nivel', gravedad: 'grave', playerName: 'Bea', username: 'BeaBee', address: J.Bea.address, nivel: 2, itemId: 'espada_hierro',
        datos: { itemId: 'espada_hierro', nivelRequerido: 7, nivel: 2, avisos: ['nivel_bajo'] }, veces: 1, t: new Date(ahora - 9 * min), ultima: new Date(ahora - 9 * min), revisada: false },
      { id: 'soltar_suspendido:Dani', tipo: 'soltar_suspendido', gravedad: 'aviso', playerName: 'Dani', username: '', address: J.Dani.address, nivel: 5, itemId: 'palo',
        datos: { itemId: 'palo', hasta: new Date(ahora + 2 * 86400000) }, veces: 3, t: new Date(ahora - 30 * min), ultima: new Date(ahora - 7 * min), revisada: false }
    ],
    castigos: { Dani: { address: J.Dani.address, username: '', permanente: false, hasta: new Date(ahora + 2 * 86400000), motivo: 'Spamming the ground', por: '0x' + 'ab'.repeat(20), t: new Date(ahora - 86400000) } }
  };
  function error(status, code) { const e = new Error(code || ('HTTP ' + status)); e.status = status; e.code = code; return e; }
  const espera = ms => new Promise(r => setTimeout(r, ms));
  const copia = x => JSON.parse(JSON.stringify(x));
  const vivo = c => !!c && (c.permanente || new Date(c.hasta).getTime() > Date.now());
  const buscar = s => {
    s = String(s || '').trim().toLowerCase();
    if (!s) return [];
    return Object.values(J).filter(j => j.address === s || j.playerName.toLowerCase() === s || (j.username || '').toLowerCase() === s)
      .concat(Object.values(J).filter(j => j.playerName.toLowerCase().includes(s) || (j.username || '').toLowerCase().includes(s)))
      .filter((j, i, a) => a.indexOf(j) === i);
  };
  async function request(path, options = {}) {
    if (typeof path !== 'string' || !path.startsWith('/api/')) throw new Error('Invalid API path');
    await espera(60 + Math.floor(Math.random() * 100));
    const metodo = options.method || 'GET', cuerpo = options.body ? JSON.parse(options.body) : {};
    const [ruta, query] = path.split('?');
    const qs = new URLSearchParams(query || '');
    if (ruta === '/api/admin/whoami') return { address: '0x' + 'ab'.repeat(20) };
    if (viejo) throw error(404, 'not_found');
    if (ruta === '/api/admin/auditoria/resumen') {
      const porTipo = {};
      estado.alertas.filter(a => !a.revisada).forEach(a => { porTipo[a.tipo] = porTipo[a.tipo] || { tipo: a.tipo, n: 0, veces: 0 }; porTipo[a.tipo].n++; porTipo[a.tipo].veces += a.veces; });
      return { ok: true, tienda: { ops24h: estado.ops.length, problemas: estado.ops.filter(o => o.problema && !o.revisada).length, sinTerminar: 1, p2pFallos24h: 1 },
               suelo: { soltados24h: estado.suelo.length, recogidos24h: 2, castigados: Object.values(estado.castigos).filter(vivo).length },
               alertas: { sinRevisar: estado.alertas.filter(a => !a.revisada).length, porTipo: Object.values(porTipo) } };
    }
    if (ruta === '/api/admin/auditoria/tienda') {
      const tienda = qs.get('tienda') === 'p2p' ? 'p2p' : 'juego', solo = qs.get('solo') || 'todas', txt = (qs.get('q') || '').toLowerCase();
      let filas = copia(tienda === 'p2p' ? estado.p2p : estado.ops);
      filas.forEach(o => { if (o.estado === 'en_curso' && new Date(o.t).getTime() < Date.now() - 600000) o.avisos = (o.avisos || []).concat(['sin_terminar']); });
      if (solo === 'problemas') filas = filas.filter(o => o.problema);
      if (solo === 'errores') filas = filas.filter(o => ['error', 'rechazada', 'parcial', 'reembolsada', 'no_vendida', 'ya_gastada'].includes(o.estado));
      if (txt) filas = filas.filter(o => [o.playerName, o.username, o.address, o.itemId].some(x => String(x || '').toLowerCase().includes(txt)));
      return { ok: true, tienda, filas };
    }
    let m = ruta.match(/^\/api\/admin\/auditoria\/tienda\/([^/]+)\/revisada$/);
    if (m && metodo === 'POST') { const o = estado.ops.find(x => x.id === decodeURIComponent(m[1])); if (!o) throw error(404, 'no_encontrada'); o.revisada = cuerpo.revisada !== false; o.nota = cuerpo.nota || ''; return { ok: true }; }
    if (ruta === '/api/admin/auditoria/subidas') return { ok: true, dias: Number(qs.get('dias')) || 7, subidas: copia(estado.subidas) };
    if (ruta === '/api/admin/auditoria/alertas') {
      let filas = copia(estado.alertas);
      if (qs.get('solo') !== 'todas') filas = filas.filter(a => !a.revisada);
      if (qs.get('tipo')) filas = filas.filter(a => a.tipo === qs.get('tipo'));
      if (qs.get('q')) { const ns = buscar(qs.get('q')).map(j => j.playerName); filas = filas.filter(a => ns.includes(a.playerName)); }
      return { ok: true, alertas: filas };
    }
    m = ruta.match(/^\/api\/admin\/auditoria\/alertas\/([^/]+)\/revisada$/);
    if (m && metodo === 'POST') { const a = estado.alertas.find(x => x.id === decodeURIComponent(m[1])); if (!a) throw error(404, 'no_encontrada'); a.revisada = cuerpo.revisada !== false; return { ok: true }; }
    if (ruta === '/api/admin/suelo/movs') return { ok: true, movs: copia(estado.suelo) };
    if (ruta === '/api/admin/suelo/buscar') {
      const js = buscar(qs.get('q'));
      if (js.length !== 1) return { ok: true, jugador: null, candidatos: copia(js) };
      const j = js[0], c = estado.castigos[j.playerName];
      return { ok: true, jugador: Object.assign({}, j, { vip: { activo: j.playerName === 'Ana', fin: new Date(ahora + 9 * 86400000) },
                                                         castigo: c ? Object.assign({ activo: vivo(c) }, c) : null }),
               soltados: copia(estado.suelo.filter(s => s.de && s.de.playerName === j.playerName)),
               recogidos: copia(estado.suelo.filter(s => s.para && s.para.playerName === j.playerName)),
               intentos: copia(estado.alertas.filter(a => a.playerName === j.playerName)) };
    }
    m = ruta.match(/^\/api\/admin\/suelo\/rastro\/([^/]+)$/);
    if (m) {
      const base = estado.suelo.find(s => s.id === decodeURIComponent(m[1]));
      if (!base) throw error(404, 'no_encontrado');
      const antes = estado.suelo.filter(s => (base.viene || []).includes(s.id)).map((s, i) => Object.assign(copia(s), { paso: -(i + 1) }));
      const despues = estado.suelo.filter(s => (base.pasadoA || []).includes(s.id)).map((s, i) => Object.assign(copia(s), { paso: i + 1 }));
      return { ok: true, monton: copia(base), antes, despues };
    }
    if (ruta === '/api/admin/suelo/castigo' && metodo === 'POST') {
      const js = buscar(cuerpo.jugador); if (js.length !== 1) throw error(404, 'jugador_no_encontrado');
      if (String(cuerpo.motivo || '').trim().length < 3) throw error(400, 'motivo_requerido');
      estado.castigos[js[0].playerName] = { address: js[0].address, permanente: cuerpo.permanente === true, hasta: cuerpo.permanente ? null : new Date(Date.now() + cuerpo.dias * 86400000),
                                            motivo: cuerpo.motivo, por: '0x' + 'ab'.repeat(20), t: new Date() };
      return { ok: true };
    }
    if (ruta === '/api/admin/suelo/castigo/quitar' && metodo === 'POST') {
      const js = buscar(cuerpo.jugador); if (js.length !== 1) throw error(404, 'jugador_no_encontrado');
      delete estado.castigos[js[0].playerName];
      return { ok: true };
    }
    throw error(404, 'not_found');
  }
  root.__mockAuditoria = estado;
  root.GFAdminSession = Object.freeze({
    base: 'mock', request, signIn: async () => ({ address: '0x' + 'ab'.repeat(20) }), getCsrf: async () => 'mock',
    refresh: async () => ({}), logout: async () => {}, provider: () => null, invalidate() {},
    subscribe() { return () => {}; }, diagnostics() { return { pending: 0, renewing: false }; }, dispose() {}
  });
})(window);
