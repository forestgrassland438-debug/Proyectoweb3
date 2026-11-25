'use strict';
/* (2026-11-02) "Los precios de muchas semillas están en 0". No eran semillas: las
 * cosechas podridas y los brotes de los cultivos nuevos ("Radish Sprout") están en
 * el catálogo para VENDERLOS, con compra 0, y salían en la lista de compra. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const bank = require('./gf-banco-tienda.js');
const catalogo = require('../gf-crop-catalog.js');
const root = path.resolve(__dirname, '..');

function tienda(t) {
  global.GFPlantCatalog = catalogo;
  const f = bank.montar(root);
  t.after(() => f.relay.cleanup());
  return f;
}
/** Lo que pinta filterItems: se cuenta lo que mete en la rejilla. */
async function lista(f, tipo) {
  f.tienda.transactionType = tipo;
  f.tienda.currentCategory = 'todas';
  f.tienda.searchQuery = '';
  if (!document.getElementById('tienda-items')) document._crear('tienda-items');
  const pintadas = [];
  const crear = f.tienda.createItemCard;
  f.tienda.createItemCard = function (item) { pintadas.push(item); return crear.call(this, item); };
  // El banco la deja en blanco porque sus pruebas no pintan; aquí es lo que se prueba.
  Object.getPrototypeOf(f.tienda).filterItems.call(f.tienda);
  await new Promise(r => setTimeout(r, 5));
  f.tienda.createItemCard = crear;
  return pintadas;
}

test('en la lista de compra no sale nada a precio 0', async t => {
  const f = tienda(t);
  const todas = Object.values(f.tienda.itemsTienda).flat();
  assert.ok(todas.some(i => i.id === 'rabano_mala' && i.buyPrice === 0), 'siguen en el catálogo');
  assert.ok(todas.some(i => i.id === 'rabano_corta' && i.buyPrice === 0), 'siguen en el catálogo');
  const compra = await lista(f, 'compra');
  assert.ok(compra.length > 0);
  assert.deepEqual(compra.filter(i => !(Number(i.buyPrice) > 0)).map(i => i.id), []);
  assert.ok(!compra.some(i => i.soloVenta), 'lo que solo se vende tampoco');
});

test('todas las semillas del catálogo se pueden comprar y tienen precio', async t => {
  const f = tienda(t);
  const compra = await lista(f, 'compra');
  const ids = new Set(compra.map(i => i.id));
  for (const p of catalogo.plants) {
    assert.ok(ids.has(p.seedId), 'falta ' + p.seedId);
    assert.ok(ids.has(p.freshId), 'falta ' + p.freshId);
    assert.ok(!ids.has(p.rottenId) && !ids.has(p.shortId), p.key + ': podrido y brote no se compran');
  }
  for (const id of ['Semillax', 'Semillax1', 'Semillax2', 'Semillax3', 'Semillax4']) assert.ok(ids.has(id), id);
});

test('con los precios del servidor sigue igual: el 0 de lo que no se vende no cuela', async t => {
  const f = tienda(t);
  const items = {};
  for (const i of Object.values(f.tienda.itemsTienda).flat()) items[i.id] = { compra: i.buyPrice ? i.buyPrice + 1 : 0, venta: i.sellPrice, moneda: 'plata' };
  f.tienda._aplicarPreciosServidor({ version: 1, indice: 1, items });
  const compra = await lista(f, 'compra');
  assert.deepEqual(compra.filter(i => !(Number(i.buyPrice) > 0)).map(i => i.id), []);
  assert.ok(compra.find(i => i.id === 'seed_rabano').buyPrice > 0);
});

test('lo podrido y los brotes se siguen pudiendo VENDER', async t => {
  const f = tienda(t);
  const contar = f.tienda.disponibleParaVenta;
  f.tienda.disponibleParaVenta = id => (id === 'rabano_mala' || id === 'rabano_corta') ? 2 : 0;
  const venta = await lista(f, 'venta');
  f.tienda.disponibleParaVenta = contar;
  assert.deepEqual(venta.map(i => i.id).sort(), ['rabano_corta', 'rabano_mala']);
  assert.ok(venta.every(i => i.sellPrice > 0));
});
