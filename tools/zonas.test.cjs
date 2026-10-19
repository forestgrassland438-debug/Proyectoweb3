'use strict';
/* LOS TRES MAPAS NUEVOS (2026-10-18): el cementerio, el desierto y la tundra.
 * Que el mapa, el cliente y el servidor digan lo MISMO (un nombre mal escrito
 * entre módulos es silencio, no error): las salidas y las llegadas, la zona
 * PvP, cada monstruo con su arte, su comportamiento y su botín, los objetos
 * con su fotograma, los árboles y el suelo en trozos. Y los remolinos: que
 * siguen su vuelta (no persiguen) y la tormenta va por ciclos. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BIN = path.resolve(__dirname, '..');
const SERVIDOR = process.env.SERVIDOR || 'C:/Users/pc/Desktop/server2.js';
const HAY_SERVIDOR = fs.existsSync(SERVIDOR);
const SRV = HAY_SERVIDOR ? fs.readFileSync(SERVIDOR, 'utf8').replace(/\r\n/g, '\n') : '';
const MAPAS = { cementerio: 'cementerio', desierto: 'desierto', tundra: 'tundra' };

function mapa(n) { return JSON.parse(fs.readFileSync(path.join(BIN, 'Maps', n + '.json'), 'utf8')); }
function capa(m, n) { return m.layers.find(l => l.name === n); }
function cargar(archivo, extra) {
  const ctx = Object.assign({ console, Math, Date, JSON, Promise, setTimeout, clearTimeout }, extra || {});
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(BIN, archivo), 'utf8'), ctx);
  return ctx;
}
/** Un bloque `const NOMBRE = …;` de server2.js, evaluado. */
function constante(nombre, fin) {
  const i = SRV.indexOf('const ' + nombre + ' = ');
  assert.ok(i >= 0, 'no está ' + nombre + ' en server2.js');
  const j = SRV.indexOf(fin || '\n};', i);
  const codigo = SRV.slice(i, j + (fin || '\n};').length).replace('const ' + nombre + ' = ', 'this.__v = ');
  const ctx = { salaBase: (s) => String(s || '').split('#')[0], SALVAJE_SALA: 'salvaje',
                PVP_ZONA: { x0: 0, y0: 0, x1: 2240, y1: 5024 } };
  vm.createContext(ctx);
  vm.runInContext(codigo, ctx);
  return ctx.__v;
}

const Z = cargar('gf-zonas.js').GFZonas;
const S = cargar('gf-salvaje.js').GFSalvaje._interno;
const ARTE = cargar('gf-monstruos-arte.js').GFMonstruosArte._interno;

test('los tres mapas: tamaño del salvaje, sus capas, su suelo en trozos y su tileset', () => {
  for (const n of Object.keys(MAPAS)) {
    const m = mapa(n);
    assert.equal(m.width * m.tilewidth, 5024, n);
    assert.equal(m.height * m.tileheight, 5024, n);
    for (const c of ['suelo', 'arboles', 'objetos', 'colisiones', 'salidas', 'zonas', 'aparicion', 'monstruos', 'carteles']) {
      assert.ok(capa(m, c), n + ' sin capa ' + c);
    }
    const meta = JSON.parse(fs.readFileSync(path.join(BIN, 'recortadas_' + n, 'mapa.json'), 'utf8'));
    assert.equal(meta.width, 5024);
    assert.equal(meta.tiles.length, 25);
    for (const t of meta.tiles) assert.ok(fs.existsSync(path.join(BIN, 'recortadas_' + n, 'hd', t.lods.hd.fallback)), t.lods.hd.fallback);
    assert.ok(fs.existsSync(path.join(BIN, 'Game', 'MAPAS', n, 'tiles_' + n + '.png')));
  }
});

test('las salidas: el salvaje lleva a los tres y cada uno vuelve; nadie llega encima de una salida', () => {
  const sv = mapa('salvaje');
  const nombres = capa(sv, 'salidas').objects.map(o => o.name).sort();
  assert.deepEqual(nombres, ['cementerio', 'desierto', 'pueblo', 'tundra']);
  assert.equal(capa(sv, 'colisiones').objects.filter(o => o.name === 'valla').length, 0, 'sin vallas en las salidas');
  const rects = { salvaje: capa(sv, 'salidas').objects };
  for (const n of Object.keys(MAPAS)) rects[n] = capa(mapa(n), 'salidas').objects;
  const pisa = (p, r) => p.x - 15 < r.x + r.width && p.x + 15 > r.x && p.y + 25 < r.y + r.height && p.y + 51 > r.y;
  for (const [clave, z] of Object.entries(Z.ZONAS)) {
    const destino = clave.startsWith('salvaje') ? 'salvaje' : clave;
    for (const r of rects[destino]) {
      assert.ok(!pisa(z.llegada, r), clave + ': se llega encima de la salida ' + r.name);
      // Lo que separa los pies (el rectángulo con el que se choca) de la
      // salida: un empujón de un monstruo no debe bastar para salir.
      const p = z.llegada;
      const dx = Math.max(r.x - (p.x + 15), 0, (p.x - 15) - (r.x + r.width));
      const dy = Math.max(r.y - (p.y + 51), 0, (p.y + 25) - (r.y + r.height));
      assert.ok(Math.hypot(dx, dy) >= 150, clave + ' a ' + Math.round(Math.hypot(dx, dy)) + ' px de la salida ' + r.name);
    }
  }
  // Cada mapa nuevo sale al salvaje por su borde.
  for (const n of Object.keys(MAPAS)) assert.deepEqual(rects[n].map(o => o.name), ['salvaje']);
  assert.equal(Z.ZONAS.cementerio.mundo, 7);
  assert.equal(Z.ZONAS.desierto.mundo, 8);
  assert.equal(Z.ZONAS.tundra.mundo, 9);
});

test('cada monstruo del mapa: especie con molde, su arte y sus proyectiles cargables', () => {
  const MOLDES = ['golem', 'lobo', 'arana', 'brujo'];
  for (const n of Object.keys(MAPAS)) {
    for (const o of capa(mapa(n), 'monstruos').objects) {
      const d = S.ESPECIES[o.name];
      assert.ok(d, n + ': especie desconocida ' + o.name);
      assert.ok(MOLDES.includes(d.molde), o.name + ' sin molde');
      assert.ok(ARTE.HUMANOIDES[d.arte] || ARTE.BESTIAS[d.arte], o.name + ': arte ' + d.arte + ' sin dar de alta');
      assert.ok(fs.existsSync(path.join(BIN, 'Game', 'Sprites', 'monstruos', d.arte + '.png')), d.arte + '.png');
      assert.ok(fs.existsSync(path.join(BIN, 'Game', 'Sprites', 'monstruos', d.arte + '.json')), d.arte + '.json');
      for (const t of Object.values(d.tex || {})) {
        assert.ok(ARTE.SUELTAS[t], o.name + ': proyectil ' + t + ' sin dar de alta');
        assert.ok(fs.existsSync(path.join(BIN, 'Game', 'Sprites', 'monstruos', ARTE.SUELTAS[t])), ARTE.SUELTAS[t]);
      }
    }
  }
});

test('el botín en el servidor: cada especie, en su sala y con instancias para todos', { skip: !HAY_SERVIDOR }, () => {
  const BOTIN = constante('MONSTRUOS_BOTIN');
  for (const n of Object.keys(MAPAS)) {
    const cuenta = {};
    for (const o of capa(mapa(n), 'monstruos').objects) cuenta[o.name] = (cuenta[o.name] || 0) + 1;
    for (const [tipo, k] of Object.entries(cuenta)) {
      assert.ok(BOTIN[tipo], 'sin botín en el servidor: ' + tipo);
      assert.ok(BOTIN[tipo].salas.includes(n), tipo + ' no es de la sala ' + n);
      assert.ok(BOTIN[tipo].instancias >= k, tipo + ': ' + k + ' en el mapa y ' + BOTIN[tipo].instancias + ' instancias');
    }
  }
});

test('la zona PvP: la misma en el mapa y en el servidor; el cementerio, entero', { skip: !HAY_SERVIDOR }, () => {
  const ZONAS = constante('PVP_ZONAS');
  for (const n of Object.keys(MAPAS)) {
    const z = capa(mapa(n), 'zonas').objects.find(o => o.name === 'pvp');
    const s = ZONAS[n];
    assert.deepEqual([z.x, z.y, z.x + z.width, z.y + z.height], [s.x0, s.y0, s.x1, s.y1], n);
  }
  assert.deepEqual([ZONAS.cementerio.x0, ZONAS.cementerio.y0, ZONAS.cementerio.x1, ZONAS.cementerio.y1], [0, 0, 5024, 5024]);
  for (const sala of ['cementerio', 'desierto', 'tundra']) {
    assert.ok(SRV.includes("'" + sala + "'") && /SALAS_SALVAJES = new Set\(\[SALVAJE_SALA, 'cementerio', 'desierto', 'tundra'\]\)/.test(SRV));
    assert.match(SRV, new RegExp("const MOBS_SALAS = new Set\\(\\[[^\\]]*'" + sala + "'"));
    assert.match(SRV, new RegExp("const ANTORCHA_ZONAS = new Set\\(\\[[^\\]]*'" + sala + "'"));
  }
  assert.match(SRV, /remolino_arena: 4/, 'el daño del remolino');
});

test('los objetos y los árboles del mapa existen (fotograma del atlas y PNG)', () => {
  for (const n of Object.keys(MAPAS)) {
    const m = mapa(n);
    const atlas = JSON.parse(fs.readFileSync(path.join(BIN, 'Game', 'MAPAS', n, 'objetos.json'), 'utf8'));
    for (const o of capa(m, 'objetos').objects) {
      const f = atlas.frames[o.name];
      assert.ok(f, n + ': sin fotograma ' + o.name);
      assert.ok(f.pivot && f.pivot.y > 0.5 && f.pivot.y <= 1, o.name + ': el apoyo, abajo');
    }
    const arboles = new Set(capa(m, 'arboles').objects.map(o => o.name));
    for (const a of arboles) assert.ok(fs.existsSync(path.join(BIN, 'Game', 'MAPAS', n, 'arboles', a + '.png')), a);
    // Las escenas piden exactamente esos árboles (ZonasScenes.js).
    const escena = fs.readFileSync(path.join(BIN, 'Scenes', 'ZonasScenes.js'), 'utf8');
    for (const a of arboles) assert.ok(escena.includes("'" + a + "'"), 'ZonasScenes.js no carga el árbol ' + a);
  }
});

test('los remolinos siguen su vuelta (no persiguen) y la tormenta va por ciclos', () => {
  const cap = capa(mapa('desierto'), 'remolinos');
  assert.ok(cap && cap.objects.length >= 5);
  for (const o of cap.objects) {
    const p = {}; o.properties.forEach(q => { p[q.name] = Number(q.value); });
    const r = { x: o.x, y: o.y, rx: p.rx, ry: p.ry, periodo: p.periodo, fase: p.fase, vaiven: p.vaiven };
    let max = 0, prev = Z._interno.posRemolino(r, 1000);
    for (let t = 1000.5; t < 1000 + r.periodo; t += 0.5) {
      const q = Z._interno.posRemolino(r, t);
      max = Math.max(max, Math.hypot(q.x - prev.x, q.y - prev.y) / 0.5);
      assert.ok(q.x > 0 && q.y > 0 && q.x < 5024 && q.y < 5024, 'dentro del mapa');
      prev = q;
    }
    assert.ok(max < 160, 'más lento que el jugador (240 px/s): ' + Math.round(max));
    // La misma hora, el mismo sitio: todos lo ven igual.
    assert.deepEqual(Z._interno.posRemolino(r, 1234.5), Z._interno.posRemolino(r, 1234.5));
    // Y vuelve al cabo de su periodo (su rumbo, no el del jugador).
    const a = Z._interno.posRemolino(r, 500), b = Z._interno.posRemolino(r, 500 + r.periodo);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < r.vaiven, 'su vuelta se repite');
  }
  const f = Z._interno.fuerzaTormenta;
  assert.equal(f(11 * 60 * 3 + 120), 1, 'en mitad de la tormenta');
  assert.equal(f(11 * 60 * 3 + 6 * 60), 0, 'entre tormentas');
  assert.ok(f(11 * 60 * 3 + 10) > 0 && f(11 * 60 * 3 + 10) < 1, 'entra poco a poco');
});
