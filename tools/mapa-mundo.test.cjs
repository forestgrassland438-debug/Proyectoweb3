'use strict';
/* (2026-10-26) EL MAPA DEL MUNDO Y EL BOTÍN JUSTO
 *   · "al presionar la M, un mapa de los mundos para viajar; que pregunte si
 *     deseo viajar por tantas monedas, según lo lejos que esté, y que
 *     reconozca si no cumple los niveles o está bloqueado";
 *   · "me das el mineral del carbón al matar enemigos y en misiones, pero esa
 *     es la piedra no minada".
 * Se ejecuta el código REAL (server2.js, gf-mapa-mundo.js, el JSON que escribe
 * tools/generar-mapa-mundo.py) con piezas de mentira. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BIN = path.resolve(__dirname, '..');
const SERVIDOR = process.env.SERVIDOR || 'C:/Users/pc/Desktop/server2.js';
const HAY = fs.existsSync(SERVIDOR);
const SRV = HAY ? fs.readFileSync(SERVIDOR, 'utf8').replace(/\r\n/g, '\n') : '';
const leer = (f) => fs.readFileSync(path.join(BIN, f), 'utf8').replace(/\r\n/g, '\n');
const MAPA = JSON.parse(leer('Game/MAPAS/mundo/mapa_mundo.json'));

function trozo(fuente, inicio, fin) {
  const i = fuente.indexOf(inicio);
  assert.ok(i >= 0, 'no está: ' + inicio);
  const j = fuente.indexOf(fin, i);
  assert.ok(j > i, 'sin final: ' + inicio);
  return fuente.slice(i, j + fin.length);
}
const dentro = (p, r) => p[0] >= r[0] && p[0] <= r[0] + r[2] && p[1] >= r[1] && p[1] <= r[1] + r[3];

/** Las tablas del cliente: escenas y salas de cada mundo (gf-lands.js), niveles (gf-niveles-mapas.js). */
function cliente() {
  const lands = leer('gf-lands.js');
  const tabla = (nombre) => {
    const m = new RegExp('var ' + nombre + '\\s*=\\s*(\\{[^;]*\\});').exec(lands);
    assert.ok(m, 'no está ' + nombre + ' en gf-lands.js');
    return vm.runInNewContext('(' + m[1] + ')', { CLAVE_ISLA: 'LandsScene', PLAZA_X: 1, PLAZA_Y: 1 });
  };
  const ctx = vm.createContext({ window: { addEventListener() {} }, Object, Math, Number, Date });
  vm.runInContext(leer('gf-niveles-mapas.js'), ctx);
  return { escena: tabla('ESCENA_DE_MUNDO'), sala: tabla('SALA_DE_MUNDO'), nivel: ctx.window.GFNivelMapa };
}

test('el JSON del dibujo: cada destino cae en su mapa y en un mundo al que se puede viajar', () => {
  const c = cliente();
  const regiones = Object.fromEntries(MAPA.regiones.map((r) => [r.id, r]));
  assert.equal(MAPA.destinos.length, new Set(MAPA.destinos.map((d) => d.id)).size, 'ids repetidos');
  for (const r of MAPA.regiones) {
    assert.ok(r.rect[0] >= 0 && r.rect[1] >= 0 && r.rect[0] + r.rect[2] <= MAPA.tam[0] && r.rect[1] + r.rect[3] <= MAPA.tam[1], r.id + ' fuera del dibujo');
    assert.equal(c.sala[r.mundo], r.sala, r.id + ': su sala es la de su mundo');
  }
  for (const d of MAPA.destinos) {
    const r = regiones[d.region];
    assert.ok(r, d.id + ': región ' + d.region);
    assert.ok(dentro(d.px, r.rect), d.id + ': la chincheta está fuera de ' + r.id);
    assert.ok(c.escena[d.mundo], d.id + ': el mundo ' + d.mundo + ' no tiene escena en GFViaje');
    assert.equal(c.sala[d.mundo], d.sala, d.id + ': sala');
    if (d.destino) {
      const m = (MAPA.regiones.find((x) => x.sala === d.sala) || r).mapa;
      assert.ok(d.destino[0] > 0 && d.destino[1] > 0 && d.destino[0] < m[0] && d.destino[1] < m[1], d.id + ': aparece fuera de su mapa');
    }
  }
  // Están todos los mapas, las minas y la tienda.
  for (const m of [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12]) assert.ok(MAPA.destinos.some((d) => d.mundo === m), 'falta el mundo ' + m);
  assert.equal(MAPA.destinos.filter((d) => d.vip).map((d) => d.id).join(), 'isla', 'solo la isla pide VIP');
});

test('el servidor tiene la MISMA tabla que el JSON (si se regenera el dibujo, hay que regenerarla)', { skip: !HAY }, () => {
  const linea = trozo(SRV, 'const GF_MAPA_MUNDO = ', ';\n');
  const T = JSON.parse(linea.slice('const GF_MAPA_MUNDO = '.length, -2));
  assert.equal(T.version, MAPA.version);
  assert.equal(JSON.stringify(T.regiones), JSON.stringify(MAPA.regiones.map((r) => ({ sala: r.sala, mapa: r.mapa, rect: r.rect }))));
  const esperado = MAPA.destinos.map((d) => {
    const o = {};
    for (const k of ['id', 'mundo', 'sala', 'px', 'destino']) if (k in d) o[k] = d[k];
    if (d.vip) o.vip = true;
    return o;
  });
  assert.equal(JSON.stringify(T.destinos), JSON.stringify(esperado));
});

test('los niveles del mapa son los mismos en el panel y en el servidor', { skip: !HAY }, () => {
  const c = cliente();
  const ctx = vm.createContext({ Object, String });
  vm.runInContext(trozo(SRV, 'function salaBase(sala) {', '\n}\n') + trozo(SRV, 'const GF_NIVEL_MAPA = ', '\n}\n') +
                  '\nthis.f = gfNivelMinimoSala;', ctx);
  for (const r of MAPA.regiones) assert.equal(c.nivel.minimo(r.mundo), ctx.f(r.sala), r.id);
});

/** El bloque del servidor, entero, con piezas de mentira. */
function servidor(op = {}) {
  const rutas = {};
  const app = { get: (r, ...h) => { rutas['GET ' + r] = h[h.length - 1]; }, post: (r, ...h) => { rutas['POST ' + r] = h[h.length - 1]; } };
  const bolsa = { Ana: op.bronce ?? 5000 }, tesoroJuego = [];
  const yo = op.donde || { sala: 'game', x: 2097, y: 2359 };
  const ctx = vm.createContext({
    console: { log() {}, error() {}, warn() {} }, Math, Number, String, Date, Map, Object, JSON, Promise, Array,
    setInterval: () => ({ unref() {} }), crypto: { randomBytes: () => ({ toString: () => 'billete' + Math.random().toString(16).slice(2) }) },
    app, apiLimiter: 1, authMiddleware: 1, csrfProtection: 1,
    jugadorDeLaSesion: async () => ({ playerName: 'Ana', address: '0xA' }),
    enColaDelJugador: async (_k, fn) => fn(),
    socketsDeJugador: () => [{ id: 's1', playerData: { room: yo.sala } }],
    rooms: { [yo.sala]: { s1: { x: yo.x, y: yo.y } } },
    gfNivelDeJugador: async () => op.nivel ?? 6, gfTieneVipPorDireccion: async () => !!op.vip,
    PlayerStats: { findOne: () => ({ select: () => ({ lean: async () => ({ bronce: bolsa.Ana }) }) }) },
    gfCobrarStat: async (n, s, c) => (bolsa[n] >= c ? (bolsa[n] -= c, { bronce: bolsa[n] }) : null),
    gfDevolverStat: async (n, s, c) => ((bolsa[n] += c), { bronce: bolsa[n] }),
    buildStatsResponse: (d) => ({ bronce: d.bronce }),
    // (2026-10-26) El viaje paga al tesoro del juego (y la devolución lo resta).
    tesoroJuegoIngresar: async (origen, bronce) => { tesoroJuego.push([origen, bronce]); }
  });
  const codigo = trozo(SRV, 'function salaBase(sala) {', '\n}\n') + trozo(SRV, 'const GF_NIVEL_MAPA = ', '\n}\n') +
                 trozo(SRV, 'const GF_MAPA_MUNDO = ', "' destinos)');\n");
  vm.runInContext(codigo + '\nthis.precio = gfMapaPrecio; this.px = gfMapaPxDeSala;', ctx);
  const llamar = async (clave, body) => {
    let st = 200, out;
    const res = { status(c) { st = c; return this; }, json(o) { out = o; return this; } };
    await rutas[clave]({ body }, res);
    return { st, out: JSON.parse(JSON.stringify(out)) };
  };
  return { ctx, llamar, bolsa, tesoroJuego };
}

test('el precio: según la distancia en el dibujo, con mínimo, tope y de 10 en 10', { skip: !HAY }, () => {
  const { ctx } = servidor();
  const P = (desde, id) => ctx.precio(desde, MAPA.destinos.find((d) => d.id === id));
  const pueblo = MAPA.destinos.find((d) => d.id === 'pueblo').px;
  assert.equal(P(pueblo, 'pueblo'), 100, 'el mínimo');
  const lejos = ['salvaje', 'cementerio', 'caverna'].map((id) => P(pueblo, id));
  assert.ok(lejos[0] < lejos[1] && lejos[1] < lejos[2], 'más lejos, más caro: ' + lejos);
  for (const d of MAPA.destinos) {
    const p = P(pueblo, d.id);
    assert.ok(p >= 100 && p <= 6000 && p % 10 === 0, d.id + ': ' + p);
  }
  assert.equal(P([0, 0], 'isla') <= 6000, true, 'el tope');
  // Dónde estás según tu sala: tienda, casas, isla de otro, un mapa y su posición.
  const px = (s, x, y) => JSON.stringify(ctx.px(s, x, y));
  const de = (id) => JSON.stringify(MAPA.destinos.find((d) => d.id === id).px);
  assert.equal(px('tienda'), de('pueblo_tienda'));
  assert.equal(px('casa:casa_herreria'), de('pueblo_casa_herreria'));
  assert.equal(px('casa:cabana_monte'), de('salvaje_cabana'));
  assert.equal(px('isla@bob'), de('isla'));
  assert.equal(px('arena#3'), de('pueblo'), 'un sitio sin dibujo: el pueblo');
  const salv = MAPA.regiones.find((r) => r.id === 'salvaje');
  assert.equal(px('salvaje#2', 0, 0), JSON.stringify([salv.rect[0], salv.rect[1]]), 'el canal no cambia el sitio');
  assert.equal(px('salvaje', salv.mapa[0], salv.mapa[1]), JSON.stringify([salv.rect[0] + salv.rect[2], salv.rect[1] + salv.rect[3]]));
});

test('viajar: pregunta lo que cobra, reconoce nivel y VIP, y devuelve una sola vez', { skip: !HAY }, async () => {
  const s = servidor({ nivel: 6, bronce: 5000 });
  const g = await s.llamar('GET /api/viaje/mapa');
  assert.equal(g.st, 200);
  assert.equal(g.out.nivel, 6);
  assert.equal(g.out.bronce, 5000);
  assert.equal(g.out.destinos.pueblo.aqui, true, 'en la plaza: estás en el pueblo');
  assert.equal(g.out.destinos.glaciar.bloqueo, 'nivel');
  assert.equal(g.out.destinos.glaciar.nivelMin, 8);
  assert.equal(g.out.destinos.cementerio.bloqueo, null, 'nivel 6: el cementerio sí');
  assert.equal(g.out.destinos.isla.bloqueo, 'vip');

  assert.equal((await s.llamar('POST /api/viaje/mapa', { destino: 'nada' })).st, 400);
  assert.equal((await s.llamar('POST /api/viaje/mapa', { destino: 'pueblo' })).out.error, 'ya_estas_aqui');
  const n = await s.llamar('POST /api/viaje/mapa', { destino: 'glaciar' });
  assert.equal(n.st, 403); assert.equal(n.out.error, 'nivel_bajo'); assert.equal(n.out.nivelMinimo, 8);
  assert.equal((await s.llamar('POST /api/viaje/mapa', { destino: 'isla' })).out.error, 'vip_required');
  const precio = g.out.destinos.salvaje.precio;
  const c = await s.llamar('POST /api/viaje/mapa', { destino: 'salvaje', precio: precio - 10 });
  assert.equal(c.st, 409, 'si sale más caro que lo que vio, se le vuelve a preguntar');
  assert.equal(c.out.precio, precio);
  assert.equal(s.bolsa.Ana, 5000, 'y no se cobra');

  const ok = await s.llamar('POST /api/viaje/mapa', { destino: 'salvaje', precio });
  assert.equal(ok.st, 200);
  assert.equal(ok.out.precio, precio);
  assert.equal(s.bolsa.Ana, 5000 - precio, 'se cobra lo preguntado');
  assert.equal(JSON.stringify(ok.out.destino), JSON.stringify({ id: 'salvaje', mundo: 6, x: 4896, y: 2208 }));
  const d1 = await s.llamar('POST /api/viaje/mapa/devolver', { billete: ok.out.billete });
  assert.equal(d1.out.devuelto, precio);
  assert.equal(s.bolsa.Ana, 5000);
  assert.equal((await s.llamar('POST /api/viaje/mapa/devolver', { billete: ok.out.billete })).st, 404, 'un billete se devuelve una vez');
  assert.equal(JSON.stringify(s.tesoroJuego), JSON.stringify([['viajes', precio], ['viajes', -precio]]), 'el viaje, al tesoro del juego; la devolución, fuera');

  const pobre = servidor({ nivel: 6, bronce: 50 });
  const p = await pobre.llamar('POST /api/viaje/mapa', { destino: 'desierto' });
  assert.equal(p.st, 400); assert.equal(p.out.error, 'insufficient_funds'); assert.equal(p.out.have, 50);
  const vip = servidor({ nivel: 12, vip: true, bronce: 99999 });
  assert.equal((await vip.llamar('POST /api/viaje/mapa', { destino: 'isla' })).st, 200, 'con VIP, la isla');
  assert.equal((await vip.llamar('POST /api/viaje/mapa', { destino: 'pradera' })).st, 200, 'con nivel, la pradera');
  // En TU isla estás en la isla; de visita en la de otro, no (se puede pagar ir a la tuya).
  const mia = servidor({ vip: true, donde: { sala: 'isla@Ana', x: 100, y: 100 } });
  assert.equal((await mia.llamar('GET /api/viaje/mapa')).out.destinos.isla.aqui, true);
  const ajena = servidor({ vip: true, donde: { sala: 'isla@Bob', x: 100, y: 100 } });
  const ga = await ajena.llamar('GET /api/viaje/mapa');
  assert.equal(ga.out.destinos.isla.aqui, false);
  assert.equal((await ajena.llamar('POST /api/viaje/mapa', { destino: 'isla', precio: ga.out.destinos.isla.precio })).st, 200);
});

test('el botín y los premios no dan la roca de carbón (el yacimiento), sino el carbón minado', { skip: !HAY }, () => {
  const botin = trozo(SRV, 'const MONSTRUOS_BOTIN = {', '\n};\n');
  assert.doesNotMatch(botin, /\['carbon',/, 'ningún monstruo suelta `carbon`');
  assert.match(botin, /\['mineral_carbon',/);
  for (const linea of botin.split('\n').filter((l) => /botin: \[/.test(l))) {
    const ids = [...linea.matchAll(/\['([^']+)',/g)].map((m) => m[1]);
    assert.equal(ids.length, new Set(ids).size, 'el mismo objeto dos veces en un botín: ' + linea.trim());
  }
  assert.match(SRV, /\{ itemId: 'mineral_carbon', nombre: 'Coal Ore', min: 2, max: 6 \}/, 'lo que pide Joe');
  const ctx = vm.createContext({ String });
  vm.runInContext(trozo(SRV, 'function gfPremioJusto(itemId) {', '\n}\n') + '\nthis.f = gfPremioJusto;', ctx);
  assert.equal(ctx.f('carbon'), 'mineral_carbon');
  assert.equal(ctx.f(' Coal '), 'mineral_carbon');
  assert.equal(ctx.f('pocion_vida'), 'pocion_vida');
  // Y se usa en los tres sitios donde nace un premio de misión.
  assert.match(SRV, /const rewardId {2}= mission\.rewardItemId \? gfPremioJusto\(mission\.rewardItemId\) : null;/);
  assert.match(SRV, /salida\.rewardItemId = gfPremioJusto\(rewardItemId\);/);
  assert.match(SRV, /m\.rewardItemId = gfPremioJusto\(elegido\.itemId\);/);
});

test('el panel: tecla M, botón del HUD, un icono por sitio y sin ventanas emergentes', () => {
  const js = leer('gf-mapa-mundo.js');
  new vm.Script(js, { filename: 'gf-mapa-mundo.js' });
  const html = leer('index.html');
  assert.match(html, /<script src="\.\/gf-mapa-mundo\.js\?v=[^"]+" defer><\/script>/);
  assert.match(html, /id="map-btn"/);
  assert.ok(fs.existsSync(path.join(BIN, 'Game/Source/hud/mapa.png')));
  for (const f of ['mapa_mundo.png', 'mapa_mundo.webp']) assert.ok(fs.existsSync(path.join(BIN, 'Game/MAPAS/mundo', f)), f);
  const iconos = vm.runInNewContext('(' + trozo(js, 'var ICONO = {', '};').slice('var ICONO = '.length, -1) + ')');
  for (const d of MAPA.destinos) assert.ok(iconos[d.id], 'sin icono: ' + d.id);
  assert.ok(!/window\.(confirm|alert|prompt)\(/.test(js), 'la pregunta va dentro del panel');
  assert.ok(js.includes("Travel to <b>' + esc(d.nombre) + '</b> for <b>'"), 'la pregunta en inglés con el precio');
  // El teclado del juego se apaga al abrir y se devuelve con _tecladoLibre.
  assert.ok(js.includes('kb.enabled = false'));
  assert.ok(js.includes('_tecladoLibre()'));
});
