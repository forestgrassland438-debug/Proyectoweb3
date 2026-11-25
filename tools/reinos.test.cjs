'use strict';
/* LOS SIETE MAPAS DEL CONTINENTE DEL ESTE (2026-11-21).
 *
 * "Quiero 7 mapas nuevos; en los botones redondos está la opción del mapa:
 * cada mapa con su nivel de desbloqueo, sus NPC con sus nombres, animales y
 * enemigos 2.5D nuevos, un monstruo por mapa, zonas PvP y neutrales, botes y
 * agua como en GameScene, la comisión del teletransporte unida a como están
 * las demás en la economía, cada mapa de 5008 x 5008 recortado como los
 * demás... y uno de ellos es un pueblo lejos, con casas, NPC y una tienda."
 *
 * Aquí se pide que el mapa, el cliente y el servidor digan LO MISMO (entre
 * módulos un nombre mal escrito es silencio, no error) y que lo que se ve se
 * pueda pisar: llegadas, salidas, NPC, carteles y monstruos en suelo libre.
 * Lo esperado va escrito a mano (no se recalcula con el código que se prueba).
 *
 *   node --test tools/reinos.test.cjs
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BIN = path.resolve(__dirname, '..');
const SERVIDOR = process.env.SERVIDOR || 'C:/Users/pc/Desktop/server2.js';
const HAY_SERVIDOR = fs.existsSync(SERVIDOR);
const SRV = HAY_SERVIDOR ? fs.readFileSync(SERVIDOR, 'utf8').replace(/\r\n/g, '\n') : '';

// ── LO QUE TIENE QUE HABER (escrito a mano) ─────────────────────────────────
const LADO = 5008;
const REINOS = {
  puerto:  { escena: 'PuertoScene',  mundo: 13, nivel: 11, ingles: 'harbor' },
  pantano: { escena: 'PantanoScene', mundo: 14, nivel: 12, ingles: 'bog' },
  aldor:   { escena: 'AldorScene',   mundo: 15, nivel: 13, ingles: 'ruins' },
  colinas: { escena: 'ColinasScene', mundo: 16, nivel: 14, ingles: 'highlands' },
  selva:   { escena: 'SelvaScene',   mundo: 17, nivel: 15, ingles: 'jungle' },
  volcan:  { escena: 'VolcanScene',  mundo: 18, nivel: 16, ingles: 'caldera' },
  hongos:  { escena: 'HongosScene',  mundo: 19, nivel: 17, ingles: 'hollow' }
};
const ZONAS_R = Object.keys(REINOS);
// Las salidas de cada mapa: a sus vecinos y, en el puerto, el ferri al pueblo.
const SALIDAS = {
  puerto: ['aldor', 'colinas', 'pantano', 'pueblo'],
  pantano: ['puerto', 'selva'],
  aldor: ['puerto'],
  colinas: ['puerto', 'selva', 'volcan'],
  selva: ['colinas', 'hongos', 'pantano'],
  volcan: ['colinas', 'hongos'],
  hongos: ['selva', 'volcan']
};
const MONSTRUOS = {
  puerto: ['cangrejo_coloso', 'pirata_ahogado'], pantano: ['sapo_toxico', 'bruja_pantano'],
  aldor: ['golem_ruinas', 'escarabajo_sol'], colinas: ['oso_otono', 'espantapajaros'],
  selva: ['pantera_selva', 'chaman_selva'], volcan: ['salamandra_magma', 'golem_magma'],
  hongos: ['hongo_andante', 'polilla_luz']
};
const JEFE = { puerto: 'jefe_cangrejo', pantano: 'jefe_sapo', aldor: 'jefe_coloso', colinas: 'jefe_ciervo',
               selva: 'jefe_gorila', volcan: 'jefe_dragon', hongos: 'jefe_micelio' };
const FAUNA = { puerto: ['gaviota', 'nutria'], pantano: ['rana', 'garza'], aldor: ['tortuga', 'ibis'],
                colinas: ['ardilla', 'alce'], selva: ['capibara', 'tucan'], volcan: ['cabra_ceniza', 'armadillo'],
                hongos: ['caracol', 'topo'] };
const PODERES_NUEVOS = ['marea', 'ancla', 'nube_toxica', 'maldicion', 'rayo_solar', 'zarpazo', 'vendaval',
                        'emboscada', 'dardos', 'erupcion', 'meteoro', 'esporas', 'brote'];
const MOLDES = ['golem', 'lobo', 'arana', 'brujo'];

// ── AYUDAS ───────────────────────────────────────────────────────────────────
const leer = (r) => fs.readFileSync(path.join(BIN, r), 'utf8');
const existe = (r) => fs.existsSync(path.join(BIN, r));
function mapa(n) { return JSON.parse(leer('Maps/' + n + '.json')); }
function capa(m, n) { return m.layers.find((l) => l.name === n); }
const noop = () => {};
function contexto(extra) {
  const doc = { addEventListener: noop, removeEventListener: noop, getElementById: () => null, querySelector: () => null,
                querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop, addEventListener: noop }),
                head: { appendChild: noop }, body: { appendChild: noop } };
  const ctx = Object.assign({ console, Math, Date, JSON, Promise, setTimeout, clearTimeout, setInterval, clearInterval,
                              addEventListener: noop, removeEventListener: noop, document: doc, navigator: {},
                              location: { search: '', hostname: 'localhost' }, localStorage: { getItem: () => null, setItem: noop } }, extra || {});
  ctx.window = ctx;
  vm.createContext(ctx);
  return ctx;
}
function cargar(archivos, extra) {
  const ctx = contexto(extra);
  [].concat(archivos).forEach((a) => vm.runInContext(leer(a), ctx, { filename: a }));
  return ctx;
}
/** Un bloque `const NOMBRE = …;` de server2.js, evaluado. */
function constante(nombre, fin) {
  const i = SRV.indexOf('const ' + nombre + ' = ');
  assert.ok(i >= 0, 'no está ' + nombre + ' en server2.js');
  const j = SRV.indexOf(fin || '\n};', i);
  assert.ok(j > i, 'sin final ' + nombre);
  const codigo = SRV.slice(i, j + (fin || '\n};').length).replace('const ' + nombre + ' = ', 'this.__v = ');
  const ctx = { salaBase: (s) => String(s || '').split('#')[0], SALVAJE_SALA: 'salvaje',
                PVP_ZONA: { x0: 0, y0: 0, x1: 2240, y1: 5024 } };
  vm.createContext(ctx);
  vm.runInContext(codigo, ctx);
  return ctx.__v;
}
/** Que el servidor contenga algo (sin volcar sus dos megas al fallar). */
function enServidor(re, msg) { assert.ok(re.test(SRV), msg); }
/** Una función de server2.js (de `function nombre(` a la llave que la cierra). */
function funcion(nombre) {
  const m = new RegExp('\\n(async )?function ' + nombre + '\\(').exec(SRV);
  assert.ok(m, 'no está la función ' + nombre + ' en server2.js');
  const i = m.index + 1;
  const j = SRV.indexOf('\n}\n', i);
  return SRV.slice(i, j + 2);
}
/** El cuerpo de una ruta o de un oyente: desde su ancla hasta el siguiente `\n});`. */
function bloque(ancla) {
  const i = SRV.indexOf(ancla);
  assert.ok(i >= 0, 'no está ' + ancla);
  return SRV.slice(i, SRV.indexOf('\n});', i));
}
/** ¿Los pies (30 x 26, de y+25 a y+51) en (x, y) caen en un rectángulo? */
const pisa = (p, r) => p.x - 15 < r.x + r.width && p.x + 15 > r.x && p.y + 25 < r.y + r.height && p.y + 51 > r.y;
/** Los NPC y los objetos se anclan en el SUELO: sus pies son (x-15, y-26, 30, 26), como en gf-npcs.js. */
const pisaBase = (p, r) => p.x - 15 < r.x + r.width && p.x + 15 > r.x && p.y - 26 < r.y + r.height && p.y > r.y;
const dentro = (p, r) => p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
/** Un array de otro contexto de vm, como array de aquí (deepStrictEqual mira el prototipo). */
const aqui = (a) => JSON.parse(JSON.stringify(a));
function distanciaPies(p, r) {
  const dx = Math.max(r.x - (p.x + 15), 0, (p.x - 15) - (r.x + r.width));
  const dy = Math.max(r.y - (p.y + 51), 0, (p.y + 25) - (r.y + r.height));
  return Math.hypot(dx, dy);
}

// Las escenas, cargadas de verdad (ZonasScenes.js + ReinosScenes.js) con un GameScene de mentira.
function escenas() {
  const ctx = contexto({ Phaser: {} });
  vm.runInContext('var GameScene = class { constructor() {} };', ctx);
  ['Scenes/ZonasScenes.js', 'Scenes/ReinosScenes.js'].forEach((a) => vm.runInContext(leer(a), ctx, { filename: a }));
  return ctx;
}

// ===========================================================================
test('los siete mapas: 5008 x 5008, sus capas, su suelo en 25 trozos y su tileset', () => {
  for (const n of ZONAS_R) {
    assert.ok(existe('Maps/' + n + '.json'), 'falta Maps/' + n + '.json');
    const m = mapa(n);
    assert.equal(m.width * m.tilewidth, LADO, n + ' de ancho');
    assert.equal(m.height * m.tileheight, LADO, n + ' de alto');
    assert.equal(capa(m, 'suelo').data.length, m.width * m.height, n + ': la capa suelo entera');
    for (const c of ['suelo', 'arboles', 'objetos', 'colisiones', 'salidas', 'zonas', 'aparicion', 'monstruos', 'carteles']) {
      assert.ok(capa(m, c), n + ' sin capa ' + c);
    }
    const meta = JSON.parse(leer('recortadas_' + n + '/mapa.json'));
    assert.equal(meta.width, LADO, n + ': la recortada mide lo que el mapa');
    assert.equal(meta.height, LADO);
    assert.equal(meta.tiles.length, 25, n + ': 5 x 5 trozos');
    for (const t of meta.tiles) assert.ok(existe('recortadas_' + n + '/hd/' + t.lods.hd.fallback), t.lods.hd.fallback);
    assert.ok(existe('Game/MAPAS/' + n + '/tiles_' + n + '.png'), n + ': su tileset');
    assert.ok(existe('Game/MAPAS/' + n + '/objetos.png') && existe('Game/MAPAS/' + n + '/objetos.json'), n + ': su atlas');
  }
});

test('cada escena: su configuración y registrada en TODAS las tablas del cliente', () => {
  const ctx = escenas();
  for (const [n, r] of Object.entries(REINOS)) {
    const Clase = ctx[r.escena];
    assert.equal(typeof Clase, 'function', 'window.' + r.escena);
    const c = Clase.CFG;
    assert.equal(c.zona, n); assert.equal(c.sala, n); assert.equal(c.mundo, r.mundo); assert.equal(c.escena, r.escena);
    assert.ok(Object.getPrototypeOf(Clase) === ctx.ZonaScene, r.escena + ' hereda de ZonaScene');
    // Los árboles que pide la escena son los del mapa (ni uno de más ni de menos).
    const delMapa = [...new Set(capa(mapa(n), 'arboles').objects.map((o) => o.name))].sort();
    assert.deepEqual(aqui(c.arboles).sort(), delMapa, n + ': árboles de la escena = los del mapa');
  }
  const fuentes = {
    gameScene: leer('Scenes/GameScene.js'), carga: leer('Scenes/LoadingScenegame.js'), registro: leer('register-scenes.js'),
    app: leer('app.js'), lands: leer('gf-lands.js'), canales: leer('gf-canales.js'), mobs: leer('gf-mobs-red.js'),
    botes: leer('gf-botes.js'), antorchas: leer('gf-antorchas.js'), index: leer('index.html')
  };
  for (const [n, r] of Object.entries(REINOS)) {
    const E = r.escena;
    assert.match(fuentes.gameScene, new RegExp('_mundoDeEscena = \\{[^}]*' + E + ': ' + r.mundo + '\\b'), 'GameScene: ' + E);
    assert.match(fuentes.carga, new RegExp('ESCENA_DE_MUNDO = \\{[^}]*' + r.mundo + ": '" + E + "'"), 'LoadingScenegame: mundo ' + r.mundo);
    assert.match(fuentes.carga, new RegExp("nextScene === '" + E + "'"), 'LoadingScenegame le pasa la sesión a ' + E);
    assert.match(fuentes.registro, new RegExp("\\{ name: '" + E + "',\\s+required: false \\}"), 'register-scenes: ' + E);
    assert.match(fuentes.app, new RegExp("knownNames = \\[[^\\]]*'" + E + "'"), 'app.js: ' + E);
    assert.match(fuentes.lands, new RegExp('ESCENA_DE_MUNDO = \\{[^}]*' + r.mundo + ": '" + E + "'"), 'gf-lands escena');
    assert.match(fuentes.lands, new RegExp('SALA_DE_MUNDO\\s+= \\{[^}]*' + r.mundo + ": '" + n + "'"), 'gf-lands sala');
    assert.match(fuentes.lands, new RegExp('MUNDO_DE_ZONA\\s+= \\{[^}]*' + r.ingles + ': ' + r.mundo + '\\b'), 'gf-lands zona ' + r.ingles);
    assert.match(fuentes.canales, new RegExp('var salas = \\{[^}]*' + E + ": '" + n + "'"), 'gf-canales: ' + E);
    assert.match(fuentes.mobs, new RegExp('var SALAS = \\{[^}]*' + E + ': true'), 'gf-mobs-red: ' + E);
    assert.match(fuentes.botes, new RegExp('var ZONAS = \\{[^}]*' + E + ": '" + n + "'"), 'gf-botes: ' + E);
    assert.match(fuentes.antorchas, new RegExp('var ZONAS = \\{[^}]*' + E + ": '" + n + "'"), 'gf-antorchas: ' + E);
  }
  // index.html: ReinosScenes.js después de ZonasScenes.js; gf-reinos.js antes de las escenas.
  const iZ = fuentes.index.indexOf('./Scenes/ZonasScenes.js'), iR = fuentes.index.indexOf('./Scenes/ReinosScenes.js');
  const iG = fuentes.index.indexOf('./gf-reinos.js');
  assert.ok(iZ > 0 && iR > iZ, 'index.html carga ReinosScenes.js tras ZonasScenes.js');
  assert.ok(iG > 0 && iG < iR, 'index.html carga gf-reinos.js');
  // La prueba sin conexión conoce los niveles.
  assert.match(leer('_prueba_offline_mock.js'), /NIVEL_MM = \{[^}]*puerto: 11, pantano: 12, aldor: 13, colinas: 14, selva: 15, volcan: 16, hongos: 17/);
});

test('las salidas: cada mapa va a sus vecinos y se vuelve por el mismo borde, lejos de la salida', () => {
  const Z = cargar('gf-zonas.js').GFZonas.ZONAS;
  const ctx = escenas();
  for (const n of ZONAS_R) {
    const m = mapa(n);
    const salidas = capa(m, 'salidas').objects;
    assert.deepEqual(salidas.map((o) => o.name).sort(), SALIDAS[n], n + ': sus salidas');
    for (const s of salidas) {
      const clave = s.name + '_desde_' + n;
      const z = Z[clave];
      assert.ok(z, n + ': la salida ' + s.name + ' no tiene su viaje ' + clave);
      if (s.name === 'pueblo') {
        assert.deepEqual([z.mundo, z.escena, z.sala], [1, 'GameScene', 'game'], 'el ferri lleva al pueblo');
        continue;
      }
      const r = REINOS[s.name];
      assert.deepEqual([z.mundo, z.escena, z.sala], [r.mundo, r.escena, s.name], clave);
      // Se llega al lado de la salida por la que se vuelve, pero no encima.
      const md = mapa(s.name);
      const vuelta = capa(md, 'salidas').objects.find((o) => o.name === n);
      assert.ok(vuelta, s.name + ' no tiene salida de vuelta a ' + n);
      const d = distanciaPies(z.llegada, vuelta);
      assert.ok(d >= 150 && d <= 460, clave + ': se llega a ' + Math.round(d) + ' px de la salida de vuelta');
      for (const o of capa(md, 'salidas').objects) assert.ok(!pisa(z.llegada, o), clave + ': encima de la salida ' + o.name);
      const choca = capa(md, 'colisiones').objects.find((c) => pisa(z.llegada, c));
      assert.ok(!choca, clave + ': se llega dentro de ' + (choca && choca.name));
    }
    // El viaje "sin más" (el del mapa del mundo y el de la escena) llega a la aparición, en suelo libre.
    const z = Z[n];
    assert.ok(z, 'GFZonas.ZONAS.' + n);
    assert.deepEqual([z.mundo, z.escena, z.sala], [REINOS[n].mundo, REINOS[n].escena, n]);
    const ap = capa(m, 'aparicion').objects[0];
    assert.ok(ap, n + ': su punto de aparición');
    for (const p of [z.llegada, ap]) {
      const choca = capa(m, 'colisiones').objects.find((c) => pisa(p, c));
      assert.ok(!choca, n + ': se aparece dentro de ' + (choca && choca.name) + ' (' + p.x + ', ' + p.y + ')');
      for (const o of salidas) assert.ok(distanciaPies(p, o) >= 150, n + ': se aparece a ' + Math.round(distanciaPies(p, o)) + ' px de ' + o.name);
    }
    assert.equal(ctx[REINOS[n].escena].CFG.mundo, z.mundo);
  }
});

/* Igual que en los otros mapas (tools/zonas.test.cjs): el cuerpo de física
   se para en el borde antes que los pies; la salida se toca con lo uno o lo otro. */
test('cada salida se toca con el jugador parado contra el borde del mapa', () => {
  const BW = 46, BH = 102;
  const corta = (a, b) => !(a.x + a.w < b.x || a.y + a.h < b.y || a.x > b.x + b.w || a.y > b.y + b.h);
  for (const n of ZONAS_R) {
    const m = mapa(n), W = m.width * m.tilewidth, H = m.height * m.tileheight;
    for (const s of capa(m, 'salidas').objects) {
      const r = { x: s.x, y: s.y, w: s.width, h: s.height };
      let x = s.x + s.width / 2, y = s.y + s.height / 2;
      if (s.x <= 0) x = BW / 2; else if (s.x + s.width >= W) x = W - BW / 2;
      if (s.y <= 0) y = BH / 2; else if (s.y + s.height >= H) y = H - BH / 2;
      const pies = { x: x - 15, y: y + 25, w: 30, h: 26 };
      const cuerpo = { x: x - BW / 2, y: y - BH / 2, w: BW, h: BH };
      assert.ok(corta(pies, r) || corta(cuerpo, r), n + ': la salida "' + s.name + '" no se toca nunca');
      // Y no hay un choque tapándola: se llega hasta ella.
      const tapa = capa(m, 'colisiones').objects.find((c) => c.x < s.x + s.width && c.x + c.width > s.x && c.y < s.y + s.height && c.y + c.height > s.y);
      assert.ok(!tapa, n + ': la salida ' + s.name + ' la tapa ' + (tapa && tapa.name));
    }
  }
});

test('niveles de desbloqueo: los mismos en el cliente y en el servidor', { skip: !HAY_SERVIDOR }, () => {
  const N = cargar('gf-niveles-mapas.js').GFNivelMapa;
  const NIVEL = constante('GF_NIVEL_MAPA', '});');
  for (const [n, r] of Object.entries(REINOS)) {
    assert.equal(N.minimo(r.mundo), r.nivel, 'cliente: mundo ' + r.mundo);
    assert.equal(NIVEL[n], r.nivel, 'servidor: ' + n);
  }
  // Lo de antes, igual.
  assert.equal(N.minimo(12), 10);
  assert.equal(NIVEL.pradera, 10);
});

test('los monstruos: su especie, su molde, su arte cargable y sus poderes, que existen', () => {
  const S = cargar('gf-salvaje.js').GFSalvaje._interno;
  const ARTE = cargar('gf-monstruos-arte.js').GFMonstruosArte._interno;
  const fuente = leer('gf-salvaje.js');
  const usados = new Set();
  for (const n of ZONAS_R) {
    const objs = capa(mapa(n), 'monstruos').objects;
    assert.deepEqual([...new Set(objs.map((o) => o.name))].sort(), MONSTRUOS[n].slice().sort(), n + ': sus especies');
    assert.ok(objs.length >= 12, n + ': ' + objs.length + ' monstruos');
    for (const tipo of MONSTRUOS[n]) {
      const d = S.ESPECIES[tipo];
      assert.ok(d, 'especie desconocida ' + tipo);
      assert.ok(MOLDES.includes(d.molde), tipo + ' sin molde');
      assert.ok(d.nombre && d.vida > 0 && d.poder && d.poder.length === 2, tipo + ': nombre, vida y ritmo');
      assert.ok(ARTE.HUMANOIDES[d.arte] || ARTE.BESTIAS[d.arte], tipo + ': arte ' + d.arte + ' sin dar de alta');
      for (const ext of ['.png', '.json']) assert.ok(existe('Game/Sprites/monstruos/' + d.arte + ext), d.arte + ext);
      const fr = JSON.parse(leer('Game/Sprites/monstruos/' + d.arte + '.json')).frames;
      // Un humanoide anda con los fotogramas de las personas ('<dir>_<n>'); una
      // bestia, con los suyos por acción y vista. Lo que diga la especie y lo que
      // tenga el atlas, lo mismo (gf-salvaje elige el fotograma por `humanoide`).
      assert.equal(!!d.humanoide, !!ARTE.HUMANOIDES[d.arte], tipo + ': humanoide en la especie y en el arte, a la vez');
      const vistas = ARTE.HUMANOIDES[d.arte] ? ['abajo_1', 'arriba_1', 'derecha_1', 'izquierda_1']
                                             : ['camina_1', 'camina_abajo_1', 'camina_arriba_1', 'ataque_1', 'quieto_1'];
      for (const f of vistas) assert.ok(fr[f], d.arte + ': sin ' + f + ' (cuatro direcciones)');
      for (const t of Object.values(d.tex || {})) {
        assert.ok(ARTE.SUELTAS[t], tipo + ': proyectil ' + t + ' sin dar de alta');
        assert.ok(existe('Game/Sprites/monstruos/' + ARTE.SUELTAS[t]), ARTE.SUELTAS[t]);
      }
      assert.ok(Array.isArray(d.poderes) && d.poderes.length, tipo + ': con poderes propios');
      d.poderes.forEach((p) => usados.add(p));
    }
  }
  // Cada poder nuevo: lo decide el anfitrión (poderExtra) y lo pintan todos (ejecutarExtra).
  const decide = fuente.slice(fuente.indexOf('function poderExtra('), fuente.indexOf('function ejecutarExtra('));
  const pinta = fuente.slice(fuente.indexOf('function ejecutarExtra('), fuente.indexOf('function elegirPoder('));
  for (const p of PODERES_NUEVOS) {
    assert.ok(usados.has(p), 'el poder ' + p + ' no lo usa nadie');
    assert.ok(decide.includes("'" + p + "'"), 'poderExtra no decide ' + p);
    assert.ok(pinta.includes("d.q === '" + p + "'"), 'ejecutarExtra no pinta ' + p);
  }
});

test('el botín en el servidor: cada especie y su jefe, en su sala y con instancias para todos', { skip: !HAY_SERVIDOR }, () => {
  const BOTIN = constante('MONSTRUOS_BOTIN');
  for (const n of ZONAS_R) {
    const cuenta = {};
    for (const o of capa(mapa(n), 'monstruos').objects) cuenta[o.name] = (cuenta[o.name] || 0) + 1;
    for (const [tipo, k] of Object.entries(cuenta)) {
      assert.ok(BOTIN[tipo], 'sin botín en el servidor: ' + tipo);
      assert.ok(BOTIN[tipo].salas.includes(n), tipo + ' no es de la sala ' + n);
      assert.ok(BOTIN[tipo].instancias >= k, tipo + ': ' + k + ' en el mapa y ' + BOTIN[tipo].instancias + ' instancias');
    }
    assert.ok(BOTIN[JEFE[n]] && BOTIN[JEFE[n]].salas.includes(n), 'el jefe ' + JEFE[n] + ' sin botín en ' + n);
  }
});

test('un jefe por mapa: su guarida en suelo libre, su arte, su tema y su especie', () => {
  const ctx = cargar(['gf-salvaje.js', 'gf-jefes.js', 'gf-monstruos-arte.js']);
  const S = ctx.GFSalvaje._interno, J = ctx.GFJefes.JEFES, ARTE = ctx.GFMonstruosArte._interno;
  const temas = leer('gf-jefes.js');
  for (const [n, r] of Object.entries(REINOS)) {
    const j = J[r.escena];
    assert.ok(j, 'sin jefe en ' + r.escena);
    assert.equal(j.tipo, JEFE[n]);
    const d = S.ESPECIES[j.tipo];
    assert.ok(d && d.jefe === true && MOLDES.includes(d.molde), j.tipo + ': especie de jefe');
    assert.ok(ARTE.BESTIAS[d.arte] || ARTE.HUMANOIDES[d.arte], j.tipo + ': arte sin dar de alta');
    assert.ok(existe('Game/Sprites/monstruos/' + d.arte + '.png'), d.arte + '.png');
    assert.match(temas, new RegExp('\\n\\s+' + j.tema + ':\\s+\\{ luz:'), j.tipo + ': el tema ' + j.tema);
    const [x0, y0, x1, y1] = j.caja;
    assert.ok(x0 >= 0 && y0 >= 0 && x1 <= LADO && y1 <= LADO && x1 - x0 >= 600 && y1 - y0 >= 600, n + ': la guarida dentro del mapa');
    // Su centro, en suelo libre (ni agua, ni lava, ni roca).
    const c = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    const choca = capa(mapa(n), 'colisiones').objects.find((q) => /^(agua|lava|roca|grieta)$/.test(q.name) && pisa(c, q));
    assert.ok(!choca, n + ': el centro de la guarida cae en ' + (choca && choca.name));
    assert.ok(j.poderes && j.poderes.length >= 3, j.tipo + ': sus poderes de jefe');
  }
});

test('PvP y neutral: las dos zonas en cada mapa, la misma PvP en el servidor; la plaza del puerto, en paz', { skip: !HAY_SERVIDOR }, () => {
  const PVP = constante('PVP_ZONAS');
  for (const n of ZONAS_R) {
    const zonas = capa(mapa(n), 'zonas').objects;
    const z = zonas.find((o) => o.name === 'pvp');
    assert.ok(z && zonas.find((o) => o.name === 'neutral'), n + ': zona PvP y zona neutral');
    assert.deepEqual([z.x, z.y, z.x + z.width, z.y + z.height], [PVP[n].x0, PVP[n].y0, PVP[n].x1, PVP[n].y1], n + ': la PvP del mapa = la del servidor');
    enServidor(new RegExp("const SALAS_SALVAJES = new Set\\(\\[SALVAJE_SALA,[^\\]]*'" + n + "'"), n + ' en SALAS_SALVAJES');
    enServidor(new RegExp("const MOBS_SALAS = new Set\\(\\[[^\\]]*'" + n + "'"), n + ' en MOBS_SALAS');
    enServidor(new RegExp("const ANTORCHA_ZONAS = new Set\\(\\[[^\\]]*'" + n + "'"), n + ' en ANTORCHA_ZONAS');
    enServidor(new RegExp("const BOTE_ZONAS = new Set\\(\\[[^\\]]*'" + n + "'"), n + ' en BOTE_ZONAS');
    enServidor(new RegExp("if \\(b === '" + n + "'\\) return '" + REINOS[n].ingles + "';"), 'zonaDeSala: ' + n);
    enServidor(new RegExp('TIEMPO_POR_SALA = \\{[^}]*' + n + ": 'tiempoSalvajeMs'"), 'TIEMPO_POR_SALA: ' + n);
    // Ni la aparición ni la llegada en la PvP: se llega en paz.
    const ap = capa(mapa(n), 'aparicion').objects[0];
    assert.ok(!(ap.x >= z.x && ap.x < z.x + z.width && ap.y >= z.y && ap.y < z.y + z.height), n + ': se aparece en la PvP');
  }
  // El pueblo: la PvP es solo la cala de los contrabandistas (menos de un 15 % del mapa).
  const z = capa(mapa('puerto'), 'zonas').objects.find((o) => o.name === 'pvp');
  assert.ok(z.width * z.height < 0.15 * LADO * LADO, 'el puerto es casi todo neutral');
});

test('objetos, casas y árboles: con su apoyo, su PNG, y nada encima del agua ni de una salida', () => {
  const escena = leer('Scenes/ReinosScenes.js');
  for (const n of ZONAS_R) {
    const m = mapa(n);
    const atlas = JSON.parse(leer('Game/MAPAS/' + n + '/objetos.json'));
    const objs = capa(m, 'objetos').objects;
    assert.ok(objs.length >= 60, n + ': ' + objs.length + ' objetos');
    assert.ok(Object.keys(atlas.frames).length >= 6, n + ': al menos 6 objetos distintos');
    const agua = capa(m, 'colisiones').objects.filter((c) => c.name === 'agua' || c.name === 'lava');
    const salidas = capa(m, 'salidas').objects;
    for (const o of objs) {
      const f = atlas.frames[o.name];
      assert.ok(f, n + ': sin fotograma ' + o.name);
      assert.ok(f.pivot && f.pivot.y > 0.5 && f.pivot.y <= 1, o.name + ': el apoyo, abajo');
      const p = { x: o.x, y: o.y - 40 };
      assert.ok(!agua.find((a) => o.x > a.x && o.x < a.x + a.width && o.y > a.y && o.y < a.y + a.height), n + ': ' + o.name + ' en el agua (' + o.x + ', ' + o.y + ')');
      for (const s of salidas) assert.ok(distanciaPies(p, s) > 60, n + ': ' + o.name + ' tapa la salida ' + s.name);
    }
    const arboles = capa(m, 'arboles').objects;
    assert.ok(arboles.length >= 150, n + ': ' + arboles.length + ' árboles');
    for (const a of new Set(arboles.map((o) => o.name))) {
      assert.ok(existe('Game/MAPAS/' + n + '/arboles/' + a + '.png'), n + '/arboles/' + a + '.png');
      assert.ok(escena.includes("'" + a + "'"), 'ReinosScenes.js no carga el árbol ' + a);
    }
    for (const a of arboles) {
      assert.ok(!agua.find((q) => a.x > q.x && a.x < q.x + q.width && a.y > q.y && a.y < q.y + q.height), n + ': un árbol en el agua');
    }
  }
  // El pueblo: casas nuevas (y una tienda), cada una con su choque.
  const m = mapa('puerto');
  const casas = capa(m, 'objetos').objects.filter((o) => /^casa_/.test(o.name));
  assert.ok(casas.length >= 8, 'el puerto con ' + casas.length + ' casas');
  assert.ok(capa(m, 'objetos').objects.some((o) => o.name === 'tienda_puerto'), 'la tienda del puerto');
  for (const c of casas) {
    assert.ok(capa(m, 'colisiones').objects.some((q) => q.name === c.name && dentro({ x: c.x, y: c.y - 10 }, q)), c.name + ' sin choque en su base');
  }
});

test('la fauna: dos especies por mapa, cada una en tres vistas (cuatro direcciones) y con sus datos', () => {
  const F = cargar('gf-fauna-zonas.js').GFFaunaZonas._interno;
  for (const [n, r] of Object.entries(REINOS)) {
    const lista = F.POR_ESCENA[r.escena];
    assert.ok(lista, 'sin fauna en ' + r.escena);
    assert.deepEqual(aqui(lista.map((e) => e[0])).sort(), FAUNA[n].slice().sort(), n + ': su fauna');
    for (const e of lista) {
      const d = F.DATOS[e[0]];
      assert.ok(d && d.vel > 0 && d.radio > 0 && Array.isArray(d.huella), e[0] + ': sus datos');
      const fr = JSON.parse(leer('Game/Sprites/fauna3d/' + e[0] + '.json')).frames;
      assert.ok(existe('Game/Sprites/fauna3d/' + e[0] + '.png'), e[0] + '.png');
      for (const pose of ['camina', 'quieto', 'come']) {
        for (const v of ['', '_abajo', '_arriba']) assert.ok(fr[pose + v + '_1'], e[0] + ': sin ' + pose + v + '_1');
      }
    }
  }
});

test('la nutria se mete al agua a nadar (como el pingüino) y la gaviota no; al irse la escena no queda nada', () => {
  // Un azar con semilla: cada pasada es la misma.
  let s = 7;
  const azar = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const M = Object.create(Math); M.random = azar;
  // El agua: de la columna 150 al este (x >= 2400) y la 149 es su orilla. Como en los mapas, el agua choca.
  const T = 16, W = 313, H = 313, clase = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 149; x < W; x++) clase[y * W + x] = x === 149 ? 1 : 2;
  const claseEn = (x, y) => { const cx = Math.floor(x / T), cy = Math.floor(y / T); return cx < 0 || cy < 0 || cx >= W || cy >= H ? 0 : clase[cy * W + cx]; };
  const avisos = [];
  const ctx = cargar('gf-fauna-zonas.js', { Math: M, GFAgua: { claseEn: (sc, x, y) => claseEn(x, y) },
                                           console: { log: noop, warn: (...a) => avisos.push(a.join(' ')), error: noop } });
  const F = ctx.GFFaunaZonas;
  // Una escena de mentira con lo justo que toca el módulo.
  const hechos = [], pendientes = [], oyentes = {};
  const objeto = (frame) => {
    const o = { scene: null, visible: true, x: 0, y: 0, scaleX: 1, scaleY: 1, frame: frame || { width: 32, realWidth: 32, realHeight: 24 },
                anims: { isPlaying: false }, recorte: null, destruido: false };
    const yo = (f) => function () { if (f) f.apply(o, arguments); return o; };
    Object.assign(o, {
      setOriginFromFrame: yo(), setAlpha: yo(), setDepth: yo(), setFlipX: yo(),
      setScale: yo((a, b) => { o.scaleX = a; o.scaleY = b === undefined ? a : b; }),
      setPosition: yo((x, y) => { o.x = x; o.y = y; }),
      setVisible: yo((v) => { o.visible = v; }),
      setCrop: yo((...a) => { o.recorte = a.length ? a : null; }),
      play: yo(() => { o.anims.isPlaying = true; }),
      destroy: () => { o.destruido = true; o.scene = null; }
    });
    hechos.push(o);
    return o;
  };
  const atlas = {}, anims = new Set(), lienzos = new Set();
  const lienzo = new Proxy({}, { get: (o, k) => (k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : noop), set: () => true });
  const lista = (e) => (oyentes[e] = oyentes[e] || new Set());
  const scene = {
    sys: { settings: { key: 'PuertoScene' } },
    map: { widthInPixels: LADO, heightInPixels: LADO },
    __gfAgua: { clase, W, T },
    _chocaConEscenario: (x, y, w) => x + w > 149 * T,
    cameras: { main: { worldView: { x: 0, y: 0, right: LADO, bottom: LADO } } },
    textures: {
      exists: (k) => lienzos.has(k) || !!atlas[k],
      get: (k) => ({ key: k, has: (f) => !!(atlas[k] && atlas[k][f]), setFilter: noop }),
      createCanvas: (k) => { lienzos.add(k); return { getContext: () => lienzo, refresh: noop }; }
    },
    anims: { exists: (k) => anims.has(k), create: (c) => { anims.add(c.key); } },
    tweens: { add: (c) => { pendientes.push(c); return { stop: noop }; }, addCounter: (c) => { pendientes.push(c); return { stop: noop }; }, killTweensOf: noop },
    events: { on: (e, f) => lista(e).add(f), once: (e, f) => lista(e).add(f), off: (e, f) => lista(e).delete(f) }
  };
  scene.add = {
    sprite: (x, y, k, f) => { const fr = atlas[k][f].frame, o = objeto({ width: fr.w, realWidth: fr.w, realHeight: fr.h }); o.scene = scene; o.x = x; o.y = y; return o; },
    image: (x, y) => { const o = objeto(); o.scene = scene; o.x = x; o.y = y; return o; }
  };
  for (const esp of FAUNA.puerto) atlas['gff_' + esp] = JSON.parse(leer('Game/Sprites/fauna3d/' + esp + '.json')).frames;

  const st = F.montar(scene);
  assert.ok(st, 'la fauna del puerto no se monta');
  assert.deepEqual(avisos, []);
  const de = (esp) => st.animales.filter((a) => a.esp === esp);
  assert.ok(de('nutria').length >= 2 && de('gaviota').length >= 3, de('nutria').length + ' nutrias y ' + de('gaviota').length + ' gaviotas');
  for (const a of st.animales) {
    assert.equal(claseEn(a.x, a.y), 0, a.esp + ' nace en el agua');
    assert.ok(a.x > 149 * T - 200, a.esp + ' nace lejos de la orilla (x ' + Math.round(a.x) + ')');
  }
  // Dos minutos de juego, a 20 fotogramas por segundo.
  const nadan = new Set();
  for (let t = 0; t < 120000; t += 50) {
    pendientes.splice(0).forEach((c) => { if (c.onUpdate) c.onUpdate({ getValue: () => 1 }); if (c.onComplete) c.onComplete(); });
    [...lista('update')].forEach((f) => f(t, 50));
    for (const a of st.animales) if (claseEn(a.x, a.y) === 2 && a.hundido > 0) nadan.add(a);
  }
  assert.ok([...nadan].some((a) => a.esp === 'nutria'), 'ninguna nutria se metió al agua');
  assert.ok(![...nadan].some((a) => a.esp === 'gaviota'), 'una gaviota nadando');
  // Al apagarse la escena: ni dibujos vivos ni el oyente de update.
  [...lista('shutdown')].forEach((f) => f());
  assert.equal(F._interno.estado(scene), null);
  assert.equal(lista('update').size, 0, 'el oyente de update sigue puesto');
  const vivos = hechos.filter((o) => !o.destruido);
  assert.equal(vivos.length, 0, vivos.length + ' dibujos sin destruir');
});

test('los NPC: con nombre, atlas en cuatro direcciones y en suelo libre; el puerto con su tienda', () => {
  const ctx = cargar(['gf-npc-tiendas.js', 'gf-npcs.js']);
  const N = ctx.GFNpcs;
  for (const [n, r] of Object.entries(REINOS)) {
    const lista = N.MAPAS[r.escena];
    assert.ok(lista && lista.length >= (n === 'puerto' ? 7 : 2), r.escena + ': ' + (lista ? lista.length : 0) + ' NPC');
    const m = mapa(n), cols = capa(m, 'colisiones').objects, salidas = capa(m, 'salidas').objects;
    for (const d of lista) {
      assert.ok(typeof d.nombre === 'string' && d.nombre.length >= 4 && /\s/.test(d.nombre), d.id + ': nombre y apellido');
      assert.ok(Array.isArray(d.frases) && d.frases.length >= 2, d.id + ': sus frases');
      const fr = JSON.parse(leer('Game/Sprites/npcs/' + d.arte + '.json')).frames;
      for (const dir of ['abajo', 'arriba', 'derecha', 'izquierda']) assert.ok(fr[dir + '_1'], d.arte + ': sin ' + dir + '_1');
      const choca = cols.find((c) => pisaBase(d, c));
      assert.ok(!choca, n + ': ' + d.id + ' dentro de ' + (choca && choca.name) + ' (' + d.x + ', ' + d.y + ')');
      for (const s of salidas) assert.ok(distanciaPies({ x: d.x, y: d.y - 51 }, s) > 200, d.id + ' junto a la salida ' + s.name);
    }
  }
  // Los nombres no se repiten con los de otros mapas.
  const todos = Object.values(N.MAPAS).flat().map((d) => d.nombre);
  assert.equal(new Set(todos).size, todos.length, 'nombres de NPC repetidos');
  // El tendero del puerto abre su tienda (gf-npc-tiendas), con objetos que existen en la tienda del juego.
  const tendero = N.MAPAS.PuertoScene.find((d) => d.tienda);
  assert.ok(tendero, 'el puerto sin tendero');
  const def = ctx.GFNpcTiendas.definicion(tendero.tienda);
  assert.ok(def && def.venta.length >= 8, 'la tienda del puerto vende al menos 8 cosas');
  const catalogo = leer('tienda_sistema.js');
  for (const id of def.venta) assert.ok(catalogo.includes("'" + id + "'") || catalogo.includes('"' + id + '"'), 'la tienda del juego no conoce ' + id);
});

test('la comisión del viaje: como las demás, 30 % al tesoro circular y 70 % al del juego', { skip: !HAY_SERVIDOR }, async () => {
  // El código del servidor, con la base de datos de mentira (lo único que no se prueba aquí).
  const apuntes = [];
  const modelo = (tesoro) => ({ updateOne: async (filtro, cambio) => { apuntes.push({ tesoro, cambio }); return { acknowledged: true }; },
                                create: async () => ({}) });
  const ctx = { console: { warn: noop, log: noop, error: noop }, Math, Number, String, Object, Date,
                Tesoro: modelo('circular'), TesoroJuego: modelo('juego'), TesoroMov: { create: async () => ({}) } };
  vm.createContext(ctx);
  const piezas = [
    SRV.slice(SRV.indexOf('const TESORO_COMISION_BPS'), SRV.indexOf('\n', SRV.indexOf('const TESORO_CIRCULAR_BPS'))),
    "const TESORO_ID = 'principal'; const TESORO_JUEGO_ID = 'juego';",
    SRV.slice(SRV.indexOf('const TESORO_JUEGO_ORIGENES'), SRV.indexOf('\n', SRV.indexOf('const TESORO_JUEGO_ORIGENES'))),
    funcion('tesoroParteCircular'), funcion('tesoroJuegoIngresar'), funcion('tesoroCircularIngresar'),
    funcion('tesoroCircularAjustar'), funcion('gfViajeReparto'), funcion('gfViajeAlTesoro'), funcion('gfViajeDevolverTesoro'),
    'this.R = { gfViajeReparto, gfViajeAlTesoro, gfViajeDevolverTesoro };'
  ];
  vm.runInContext(piezas.join('\n'), ctx);
  const R = ctx.R;
  assert.deepEqual({ ...R.gfViajeReparto(1000) }, { circular: 300, juego: 700 });
  assert.deepEqual({ ...R.gfViajeReparto(3470) }, { circular: 1041, juego: 2429 });
  assert.deepEqual({ ...R.gfViajeReparto(101) }, { circular: 30, juego: 71 });
  assert.deepEqual({ ...R.gfViajeReparto(0) }, { circular: 0, juego: 0 });
  assert.deepEqual({ ...R.gfViajeReparto(-50) }, { circular: 0, juego: 0 });
  const saldo = () => apuntes.reduce((s, a) => { s[a.tesoro] += a.cambio.$inc.saldo; return s; }, { circular: 0, juego: 0 });
  const r = await R.gfViajeAlTesoro(1000, 'ana', 'mapa puerto');
  assert.deepEqual(saldo(), { circular: 300, juego: 700 }, 'el viaje entra en los dos tesoros');
  assert.ok(apuntes.every((a) => a.cambio.$inc['ingresado.viajes']), 'apuntado como viajes en los dos');
  await R.gfViajeDevolverTesoro(r, 'ana', 'devolución del billete');
  assert.deepEqual(saldo(), { circular: 0, juego: 0 }, 'la devolución deshace las dos partes');
  // El esquema del tesoro circular guarda los viajes (si no, Mongoose los tira sin avisar).
  const esquema = SRV.slice(SRV.indexOf('const tesoroSchema = new mongoose.Schema'), SRV.indexOf('const Tesoro = mongoose.models.Tesoro'));
  // Dentro de SUS llaves (las de cada campo, `{ type: Number, ... }`, se saltan enteras).
  assert.match(esquema, /ingresado: \{(?:[^{}]|\{[^{}]*\})*viajes: \{ type: Number, default: 0 \}/);
  assert.match(esquema, /ingresos:\s+\{(?:[^{}]|\{[^{}]*\})*viajes: \{ type: Number, default: 0 \}/);
  // Y el panel de economía lo ve: tesoroPublico es el `circular` de /api/admin/economia.
  const pub = vm.runInNewContext(funcion('tesoroPublico') + '\ntesoroPublico({ saldo: 5, ingresado: { tienda: 1, viajes: 300 }, ingresos: { viajes: 2 } })', { Math, Number });
  assert.equal(pub.ingresado.viajes, 300, 'el panel ve lo que entró por viajes');
  assert.equal(pub.ingresos.viajes, 2);
  assert.match(leer('economia.js'), /\['From map travel \(30%\)', fmt\(c\.ingresado\.viajes \|\| 0\)\]/, 'su fila en el panel de economía');
  const i18n = leer('admin-suite-i18n.js'), html = leer('economia.html');
  assert.ok(i18n.includes('\nFrom map travel (30%)|'), 'la fila, traducida');
  assert.doesNotMatch(html, /map travel, VIP and revive potions go to the game treasury/, 'el panel ya no dice que el viaje va entero al del juego');
  const explica = 'Map travel (the world map and the friends button) is split like the market fees: 30% circular and 70% game.';
  assert.ok(html.includes(explica), 'el panel explica el reparto del viaje');
  assert.ok(i18n.split('\n').some((l) => l.startsWith('Two treasuries.') && l.includes(explica) && l.includes('|')), 'y su traducción');
  // Las rutas usan el reparto: el mapa del mundo, su devolución y el viaje con un amigo.
  const pagar = bloque("app.post('/api/viaje/mapa', ");
  assert.match(pagar, /gfViajeAlTesoro\(e\.precio, gp\.playerName,/);
  assert.doesNotMatch(pagar, /tesoroJuegoIngresar\('viajes'/);
  const devolver = bloque("app.post('/api/viaje/mapa/devolver'");
  assert.match(devolver, /gfViajeDevolverTesoro\(b\.reparto/);
  assert.doesNotMatch(devolver, /tesoroJuegoIngresar\('viajes'/);
  assert.match(bloque("socket.on('friends:ir'"), /gfViajeAlTesoro\(precio, yo,/);
});

test('el mapa del mundo: los siete en el dibujo, la copia del servidor idéntica y su icono', { skip: !HAY_SERVIDOR }, () => {
  const MM = JSON.parse(leer('Game/MAPAS/mundo/mapa_mundo.json'));
  const srv = constante('GF_MAPA_MUNDO', '};\n');
  assert.deepEqual(JSON.parse(JSON.stringify(srv.regiones)), MM.regiones.map((r) => ({ sala: r.sala, mapa: r.mapa, rect: r.rect })), 'regiones = las del dibujo');
  assert.deepEqual(JSON.parse(JSON.stringify(srv.destinos)), MM.destinos.map((d) => {
    const o = { id: d.id, mundo: d.mundo, sala: d.sala, px: d.px, destino: d.destino };
    if (d.vip) o.vip = true;
    return o;
  }), 'destinos = los del dibujo');
  assert.deepEqual(aqui(srv.tam), MM.tam);
  // Lo de antes, en su sitio (OX = 224, OY = 48 no se mueven al crecer el dibujo).
  assert.deepEqual(MM.regiones.find((r) => r.id === 'pueblo').rect, [1120, 944, 448, 448]);
  assert.deepEqual(MM.destinos.find((d) => d.id === 'pueblo').px, [1308, 1155]);
  const iconos = leer('gf-mapa-mundo.js');
  for (const [n, r] of Object.entries(REINOS)) {
    const reg = MM.regiones.find((x) => x.id === n);
    assert.ok(reg && reg.mundo === r.mundo && reg.sala === n && reg.mapa[0] === LADO, 'región ' + n);
    const d = MM.destinos.find((x) => x.id === n);
    assert.ok(d && d.tipo === 'mapa' && d.mundo === r.mundo, 'destino ' + n);
    // Se llega a donde llega la escena por sí sola (la aparición del mapa).
    const ap = capa(mapa(n), 'aparicion').objects[0];
    assert.ok(Math.hypot(d.destino[0] - ap.x, d.destino[1] - ap.y) < 260, n + ': el mapa del mundo deja junto a la aparición');
    assert.match(iconos, new RegExp('\\b' + n + ": '"), 'gf-mapa-mundo: icono de ' + n);
    assert.ok(d.px[0] > 2240, n + ': en el continente del este (a la derecha del dibujo de antes)');
  }
  assert.ok(MM.tam[0] >= 3360 && fs.statSync(path.join(BIN, 'Game/MAPAS/mundo/mapa_mundo.png')).size > 0);
});

test('sonidos: el tema y el ambiente de cada mapa existen y gf-audio los pide allí y solo allí', () => {
  const A = cargar('gf-audio.js').GFAudio._interno;
  const ctx = escenas();
  const propios = {};
  for (const [n, r] of Object.entries(REINOS)) {
    const zona = ctx[r.escena].CFG.audio || n;
    const lista = A.listaDe('campo', zona);
    assert.ok(A.TEMAS[zona], n + ': su tema en gf-audio');
    assert.ok(lista.includes(A.TEMAS[zona]), n + ': se pide su tema');
    assert.ok(A.AMBIENTES[zona] && lista.includes(A.AMBIENTES[zona]), n + ': se pide su ambiente');
    for (const f of [A.TEMAS[zona], A.AMBIENTES[zona]]) {
      const ruta = 'Game/MUSIC/' + f + '.wav';
      assert.ok(existe(ruta), ruta);
      const b = fs.readFileSync(path.join(BIN, ruta));
      assert.equal(b.toString('ascii', 0, 4), 'RIFF', ruta + ' es un WAV');
      assert.ok(b.length > 40000 && b.length < 2500000, ruta + ': ' + b.length + ' bytes');
    }
    propios[n] = A.AMBIENTES[zona];
  }
  // Ningún mapa pide el ambiente de otro (ni el pueblo el de ellos).
  for (const n of ZONAS_R) {
    const lista = A.listaDe('campo', ctx[REINOS[n].escena].CFG.audio || n);
    for (const m of ZONAS_R) if (m !== n) assert.ok(!lista.includes(propios[m]), n + ' pide el ambiente de ' + m);
  }
  assert.ok(!ZONAS_R.some((n) => A.listaDe('campo', null).includes(propios[n])), 'el pueblo no carga los ambientes nuevos');
});

test('el agua: se pesca y se navega en cada mapa (servidor y escena)', { skip: !HAY_SERVIDOR }, () => {
  const pesca = JSON.parse(leer('tools/agua-pesca-zonas.json'));
  for (const n of ZONAS_R) {
    enServidor(new RegExp('GF_PESCA_ZONAS\\.' + n + ' = \\{'), 'el agua de ' + n + ' en el servidor');
    const m = mapa(n);
    const agua = capa(m, 'colisiones').objects.filter((c) => c.name === 'agua');
    const area = agua.reduce((s, c) => s + c.width * c.height, 0);
    assert.ok(area > 120000, n + ': ' + area + ' px² de agua (un bote necesita sitio)');
    // La copia del servidor es la de tools/generar-agua-pesca.py, y con ella el
    // servidor (pesca y bote) ve el agua del mapa donde está, y la tierra no.
    const linea = new RegExp('\\nGF_PESCA_ZONAS\\.' + n + ' = (\\{[^\\n]*\\});\\n').exec(SRV);
    const z = JSON.parse(linea[1]);
    assert.deepEqual(z, pesca[n], n + ': la copia del servidor = tools/agua-pesca-zonas.json');
    const ctxA = vm.createContext({ GF_PESCA_ZONAS: { [n]: z }, _gfPescaZonas: {}, Math, Number, Uint8Array });
    vm.runInContext(funcion('gfZonaCercaDelAgua') + '\nthis.f = gfZonaCercaDelAgua;', ctxA);
    const charca = agua.slice().sort((a, b) => b.width * b.height - a.width * a.height)[0];
    assert.equal(ctxA.f(n, charca.x + charca.width / 2, charca.y + charca.height / 2, 0), true, n + ': el servidor no ve el agua del mapa');
    const ap = capa(m, 'aparicion').objects[0];
    assert.equal(ctxA.f(n, ap.x, ap.y, 0), false, n + ': el servidor ve agua en la aparición');
    // El tileset del bioma sigue teniendo el agua azul (gf-agua y la pesca la reconocen por el color).
    const props = Object.fromEntries((m.properties || []).map((p) => [p.name, p.value]));
    assert.equal(props.generado_por, 'tools/generar-reinos.py');
  }
});

test('ningún cartel ni monstruo en el agua, la lava, la roca o una grieta; los monstruos lejos de la llegada', () => {
  const Z = cargar('gf-zonas.js').GFZonas.ZONAS;
  for (const n of ZONAS_R) {
    const m = mapa(n), cols = capa(m, 'colisiones').objects;
    const malas = cols.filter((r) => /^(agua|lava|roca|grieta)$/.test(r.name));
    for (const o of capa(m, 'carteles').objects) {
      const r = malas.find((q) => o.x - 12 < q.x + q.width && o.x + 12 > q.x && o.y - 6 < q.y + q.height && o.y > q.y);
      assert.ok(!r, n + ': el cartel "' + o.name + '" está en ' + (r && r.name));
      assert.ok((o.properties || []).some((p) => p.name === 'texto' && String(p.value).length > 3), n + ': el cartel ' + o.name + ' sin texto');
    }
    const llegadas = Object.entries(Z).filter(([k, z]) => z.sala === n).map(([, z]) => z.llegada);
    for (const o of capa(m, 'monstruos').objects) {
      const r = malas.find((q) => o.x > q.x - 20 && o.x < q.x + q.width + 20 && o.y > q.y - 20 && o.y < q.y + q.height + 20);
      assert.ok(!r, n + ': ' + o.name + ' en ' + (r && r.name) + ' (' + o.x + ', ' + o.y + ')');
      for (const p of llegadas) assert.ok(Math.hypot(o.x - p.x, o.y - p.y) >= 700, n + ': ' + o.name + ' a ' + Math.round(Math.hypot(o.x - p.x, o.y - p.y)) + ' px de una llegada');
    }
  }
});

// ===========================================================================
// Todo lo que importa se alcanza A PIE desde la aparición. Un río de lava, una
// hilera de casas o una valla parten un mapa en dos sin que ninguna otra prueba
// lo note: aquí se inunda el suelo libre desde la aparición, con los pies del
// jugador (30 x 26, centrados en y + 38) en celdas de 16 px.
const CELDA = 16;
function sueloLibre(cols) {
  const n = Math.ceil(LADO / CELDA);
  const libre = new Uint8Array(n * n).fill(1);
  for (let k = 0; k < n; k++) {
    const f = k * CELDA + 8;
    for (let j = 0; j < n; j++) {
      if (f - 15 < 0 || f + 15 > LADO) libre[j * n + k] = 0;   // los pies se salen por un lado
      if (f - 13 < 0 || f + 13 > LADO) libre[k * n + j] = 0;   // ... o por arriba o por abajo
    }
  }
  for (const r of cols) {
    // Las celdas cuyos pies (centro ± 15, ± 13) cortan el rectángulo.
    const cx0 = Math.max(0, Math.floor((r.x - 23) / CELDA) + 1), cx1 = Math.min(n - 1, Math.ceil((r.x + r.width + 7) / CELDA) - 1);
    const cy0 = Math.max(0, Math.floor((r.y - 21) / CELDA) + 1), cy1 = Math.min(n - 1, Math.ceil((r.y + r.height + 5) / CELDA) - 1);
    for (let cy = cy0; cy <= cy1; cy++) if (cx1 >= cx0) libre.fill(0, cy * n + cx0, cy * n + cx1 + 1);
  }
  return { n, libre };
}
/** Inunda desde la posición del jugador (x, y): sus pies, en (x, y + 38). */
function inundar(s, x, y, n0) {
  const { n, libre } = s;
  const vis = new Uint8Array(n * n), cola = new Int32Array(n * n);
  const i0 = Math.floor((y + 38) / CELDA) * n + Math.floor(x / CELDA);
  assert.ok(libre[i0], n0 + ': la aparición no está en suelo libre');
  let a = 0, b = 0;
  cola[b++] = i0; vis[i0] = 1;
  while (a < b) {
    const i = cola[a++], cx = i % n;
    for (const j of [cx + 1 < n ? i + 1 : -1, cx > 0 ? i - 1 : -1, i + n < n * n ? i + n : -1, i - n]) {
      if (j >= 0 && libre[j] && !vis[j]) { vis[j] = 1; cola[b++] = j; }
    }
  }
  return Object.assign({ vis, total: b }, s);
}
/** ¿Alguna celda alcanzada con los pies a menos de r px de (px, py)? */
function seLlega(t, px, py, r) {
  const { n, vis } = t;
  for (let cy = Math.max(0, Math.floor((py - r) / CELDA)); cy <= Math.min(n - 1, Math.floor((py + r) / CELDA)); cy++) {
    for (let cx = Math.max(0, Math.floor((px - r) / CELDA)); cx <= Math.min(n - 1, Math.floor((px + r) / CELDA)); cx++) {
      if (vis[cy * n + cx] && Math.hypot(cx * CELDA + 8 - px, cy * CELDA + 8 - py) <= r) return true;
    }
  }
  return false;
}
/** ¿Alguna celda alcanzada cuyos pies tocan la salida? */
function tocaSalida(t, s) {
  const { n, vis } = t;
  for (let cy = 0; cy < n; cy++) {
    const fy = cy * CELDA + 8;
    if (!(fy - 13 < s.y + s.height && fy + 13 > s.y)) continue;
    for (let cx = 0; cx < n; cx++) {
      const fx = cx * CELDA + 8;
      if (vis[cy * n + cx] && fx - 15 < s.x + s.width && fx + 15 > s.x) return true;
    }
  }
  return false;
}

test('todo se alcanza a pie desde la aparición: llegadas, salidas, NPC, carteles, monstruos y la guarida', () => {
  const Z = cargar('gf-zonas.js').GFZonas.ZONAS;
  const NPCS = cargar(['gf-npc-tiendas.js', 'gf-npcs.js']).GFNpcs.MAPAS;
  const J = cargar(['gf-salvaje.js', 'gf-jefes.js']).GFJefes.JEFES;
  for (const [n, r] of Object.entries(REINOS)) {
    const m = mapa(n);
    const ap = capa(m, 'aparicion').objects[0];
    const t = inundar(sueloLibre(capa(m, 'colisiones').objects), ap.x, ap.y, n);
    let libres = 0;
    for (let i = 0; i < t.libre.length; i++) libres += t.libre[i];
    // Casi todo el suelo libre es UNA pieza (fuera quedan rincones entre troncos y rocas).
    assert.ok(t.total >= 0.9 * libres, n + ': solo se alcanza el ' + Math.round(100 * t.total / libres) + ' % del suelo libre');
    for (const z of Object.values(Z).filter((q) => q.sala === n)) {
      assert.ok(seLlega(t, z.llegada.x, z.llegada.y + 38, 12), n + ': la llegada (' + z.llegada.x + ', ' + z.llegada.y + ') queda aislada');
    }
    for (const s of capa(m, 'salidas').objects) assert.ok(tocaSalida(t, s), n + ': no se llega a la salida ' + s.name);
    for (const d of NPCS[r.escena]) assert.ok(seLlega(t, d.x, d.y + 20, 90), n + ': no se llega a ' + d.id);
    for (const o of capa(m, 'carteles').objects) assert.ok(seLlega(t, o.x, o.y + 20, 90), n + ': no se llega al cartel ' + o.name);
    for (const o of capa(m, 'monstruos').objects) assert.ok(seLlega(t, o.x, o.y, 90), n + ': no se llega a ' + o.name + ' (' + o.x + ', ' + o.y + ')');
    const [x0, y0, x1, y1] = J[r.escena].caja;
    assert.ok(seLlega(t, (x0 + x1) / 2, (y0 + y1) / 2, 160), n + ': la guarida del jefe queda aislada');
  }
});
