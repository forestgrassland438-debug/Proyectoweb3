'use strict';
/* (2026-11-02) El catálogo de los objetos nuevos (gf-items-v2.js): que la economía no regale dinero, que
 * cada receta se pueda hacer con lo que el nivel permite y que el servidor conozca cada objeto. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const V2 = require(path.join(RAIZ, 'gf-items-v2.js'));
const BASE = require(path.join(RAIZ, 'gf-crop-catalog.js'));
const M = V2.fusionar(BASE);
const VIEJOS = { zanahoria_buena: [20, 14, 1], tomate_buena: [28, 20, 3], fresa_buena: [40, 28, 3], trigo_buena: [13, 9, 5], calabaza_buena: [48, 34, 6], balde_vacio: [0, 2, 1] };
const precio = (id) => {
  if (VIEJOS[id]) return { compra: VIEJOS[id][0], venta: VIEJOS[id][1], nivel: VIEJOS[id][2] };
  assert.ok(M.shopPrices[id], 'sin precio: ' + id);
  return { compra: M.shopPrices[id][0], venta: M.shopPrices[id][1], nivel: M.levels[id] };
};
const SERVIDOR = 'C:/Users/pc/Desktop/server2.js';
const HAY = fs.existsSync(SERVIDOR);
const SRV = HAY ? fs.readFileSync(SERVIDOR, 'utf8').split('\r\n').join('\n') : '';

test('hay de todo lo que se pidió', () => {
  const kinds = {};
  for (const it of Object.values(V2.items)) kinds[it.kind] = (kinds[it.kind] || 0) + 1;
  assert.equal(kinds.pan, 20);
  assert.equal(kinds.torta, 20);
  assert.equal(kinds.obra, 20);
  assert.equal(kinds.pez, 10);
  assert.equal(kinds.montura, 100);
  assert.equal(kinds.cana, 6);
  assert.equal(kinds.arma, 14);
});

test('cada dibujo existe', () => {
  for (const [id, it] of Object.entries(V2.items)) assert.ok(fs.existsSync(path.join(RAIZ, it.src)), id + ': ' + it.src);
  for (const m of Object.values(V2.monturas)) assert.ok(fs.existsSync(path.join(RAIZ, m.atlas)), m.atlas);
});

test('ningún objeto nuevo pisa a uno que ya había', () => {
  for (const id of Object.keys(V2.items)) assert.ok(!BASE.items[id], id);
  if (!HAY) return;
  const i = SRV.indexOf('const TIENDA_PRECIOS = {'), j = SRV.indexOf('};', i);
  for (const id of Object.keys(V2.items)) assert.ok(!SRV.slice(i, j).includes('"' + id + '"'), id + ' ya está en TIENDA_PRECIOS');
});

test('todo objeto tiene nivel, tabla bajo demanda y pila', () => {
  for (const [id, it] of Object.entries(V2.items)) {
    assert.ok(Number.isInteger(V2.levels[id]) && V2.levels[id] >= 1, id);
    assert.equal(V2.itemTypes[id], id);
    assert.ok(V2.maxStacks[id] >= 1, id);
    const t = V2.tables.find((x) => x.tipo === id);
    assert.ok(t && t.plantKey && t.perInvoiceLimit === it.maxStack, id);
  }
});

test('no hay dinero gratis: comprar, cocinar y vender a la tienda siempre pierde, con la demanda a favor (±10 %)', () => {
  for (const r of V2.recipes) {
    if (r.free) continue;
    const coste = r.resources.reduce((s, m) => s + precio(m.itemId).compra * m.quantity, 0);
    const venta = precio(r.itemId).venta * r.quantity;
    const devuelve = (r.returns || []).reduce((s, m) => s + precio(m.itemId).venta * m.quantity, 0);
    // Peor caso: ingredientes un 10 % más baratos y lo cocinado un 10 % más caro, con la comisión del 1,5 %.
    assert.ok((venta + devuelve) * 1.1 * 0.985 < coste * 0.9 * 1.015 + 1, r.id + ': ' + venta + ' contra ' + coste);
  }
});

test('cocinar compensa: comprarlo hecho sale más caro que comprar los ingredientes', () => {
  for (const r of V2.recipes) {
    if (r.free || !/^(pan|torta)_/.test(r.itemId)) continue;
    const coste = r.resources.reduce((s, m) => s + precio(m.itemId).compra * m.quantity, 0);
    assert.ok(precio(r.itemId).compra * r.quantity >= coste * 1.3, r.id);
    assert.ok(precio(r.itemId).compra > precio(r.itemId).venta, r.id);
  }
});

test('nadie necesita para una receta algo de más nivel que la receta', () => {
  for (const r of V2.recipes) for (const m of r.resources) assert.ok(precio(m.itemId).nivel <= r.level, r.id + ' necesita ' + m.itemId);
});

test('lo que vende cada NPC se puede comprar y sus recetas existen', () => {
  for (const npc of Object.values(V2.npcs)) {
    for (const id of npc.venta) assert.ok(V2.shopPrices[id] && V2.shopPrices[id][0] > 0, id);
    for (const rid of npc.recetas) assert.ok(V2.recipes.some((r) => r.id === rid), rid);
    assert.ok(npc.recetas.length >= 1);
  }
  // Ordeñar no se puede pedir desde el panel: es de su ruta, donde están la suerte y la espera.
  const ordenar = V2.recipes.find((r) => r.id === 'ordenar_vaca');
  assert.ok(ordenar.internal && ordenar.free);
  assert.ok(!Object.values(V2.npcs).some((n) => n.recetas.includes('ordenar_vaca')));
});

test('las recetas usan la leche y el trigo, y la leche sube la vida', () => {
  const usa = (id) => V2.recipes.filter((r) => r.id !== 'ordenar_vaca' && r.resources.some((m) => m.itemId === id)).length;
  assert.ok(usa('balde_leche') >= 3);
  assert.ok(usa('trigo_buena') >= 3);
  const c = V2.consumables.find((x) => x.id === 'consume_balde_leche');
  assert.equal(c.consume.stat, 'vida');
  assert.ok(c.consume.gain > 0 && c.consume.gain <= 10, 'un poquito de vida');
  assert.equal(c.itemId, 'balde_vacio', 'devuelve el cubo');
});

test('en el servidor: tabla de pesca, reglas del suelo y construcciones', { skip: !HAY }, () => {
  assert.match(SRV, /const GF_CROP_CATALOG=GF_ITEMS_V2\.fusionar\(require\('\.\/gf-crop-catalog'\)\);/);
  const i = SRV.indexOf('PESCA_ESPECIES = ['), j = SRV.indexOf('];', i);
  const filas = [...SRV.slice(i, j).matchAll(/\['(pes\d+)', ([\d.]+), (\d+)\]/g)].map((m) => [m[1], Number(m[2])]);
  assert.equal(filas.length, 24);
  for (let k = 1; k < filas.length; k++) assert.ok(filas[k][1] > filas[k - 1][1], filas[k][0]);
  assert.equal(filas[filas.length - 1][1], 1);
  for (const id of Object.keys(V2.pesca)) assert.ok(filas.some((f) => f[0] === id), id);
  assert.match(SRV, /const SUELO_SOLTABLES = new Set\(\[\n {2}\.\.\.Object\.keys\(GF_CROP_CATALOG\.items\)/);
  assert.match(SRV, /\.\.\.\(typeof GF_ITEMS_V2 === 'undefined' \? \{\} : GF_ITEMS_V2\.obras\)/);
  assert.match(SRV, /recipes:\[\.\.\.require\('\.\/craft-recipes\.json'\),\.\.\.\(GF_CROP_CATALOG\.recipes\|\|\[\]\)\]/);
});

test('las construcciones caben en su sitio', () => {
  const { imageSize } = (() => {
    const leer = (ruta) => { const b = fs.readFileSync(ruta); return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }; };
    return { imageSize: leer };
  })();
  for (const [id, o] of Object.entries(V2.obras)) {
    const c = V2.colocables[id];
    assert.equal(c.ancho, o.ancho);
    assert.equal(c.alto, o.alto);
    const t = imageSize(path.join(RAIZ, c.icono));
    // Se pinta al doble y la casilla mide 32: un par de píxeles de contorno no estorban.
    assert.ok(t.width * 2 <= o.ancho * 32 + 8, id + ': ' + t.width);
  }
});
