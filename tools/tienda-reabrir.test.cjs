'use strict';
/* (2026-11-19) "Quieres comprar algo, cierras el panel antes y, al volver para comprarlo,
 * el botón de comprar no hace nada (hay que ir a otro objeto y volver)".
 *
 * close() y open() ponían selectedItem = null, pero el panel de la derecha (PC) se
 * quedaba enseñando el objeto de antes con el botón "Interact" ACTIVO: al pulsarlo,
 * openPcModal() veía selectedItem null y no hacía nada, sin un solo aviso.
 *
 * El tienda_sistema.js real (banco de la tienda) con nodos DOM que guardan sus oyentes:
 * se pulsa el botón de verdad, el que engancha initEvents(). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const bank = require('./gf-banco-tienda.js');
const root = path.resolve(__dirname, '..');

const IDS = ['interact-button-pc', 'detail-img-simple', 'detail-name-simple', 'detail-price-simple', 'price-history-button-pc',
  'pc-item-modal', 'tab-detalles', 'pc-item-name', 'pc-item-img', 'pc-modal-price', 'pc-item-desc', 'pc-category-value',
  'pc-item-stock', 'pc-item-disponible', 'pc-item-comision', 'pc-max-value', 'pc-quantity-input', 'pc-action-total',
  'pc-action-button', 'pc-action-text', 'tienda-hub', 'tienda-overlay', 'tienda-tipo', 'tienda-items'];

/** Nodo del banco que además guarda sus oyentes para poder pulsarlo. */
function conOyentes(n) {
  n._oy = {};
  n.addEventListener = (ev, fn) => { (n._oy[ev] = n._oy[ev] || []).push(fn); };
  n._pulsar = () => (n._oy.click || []).forEach((fn) => fn({ preventDefault() {}, stopPropagation() {}, target: n, currentTarget: n }));
  return n;
}

function montarTienda(t) {
  const f = bank.montar(root);
  t.after(() => f.relay.cleanup());
  for (const id of IDS) conOyentes(document._crear(id));
  document.getElementById('pc-item-modal').classList.add('hidden');
  document.getElementById('tienda-tipo').value = 'compra';
  // Una tienda NUEVA, para que initEvents() enganche estos nodos (el banco ya creó la suya antes).
  const tienda = new f.tienda.constructor(f.escena);
  Object.assign(tienda, { relayClient: f.tienda.relayClient, showNotification: () => {}, updateMonedaDisplay: () => {},
    showTransactionAnimation: () => {}, filterItems: () => {}, _cargarPreciosServidor: async () => false,
    _servidorAlDia: async () => true, _comprobarConstruccion: async () => {} });
  tienda.isMobile = false;
  tienda.playerMoneda = 1000; tienda.playerMonedaPlata = 1000;
  return { f, tienda, $: (id) => document.getElementById(id) };
}

test('PC: elegir, cerrar y reabrir — el botón sigue abriendo la compra del mismo objeto', async (t) => {
  const { tienda, $ } = montarTienda(t);
  await tienda.open();
  tienda.selectItem('Semillax');
  const nombre = tienda.selectedItem && tienda.selectedItem.name;
  assert.ok(nombre, 'Semillax existe en el catálogo');
  assert.equal($('detail-name-simple').textContent, nombre);
  tienda.close();
  await tienda.open();

  // Lo que ve el jugador y lo que hace el botón tienen que decir lo mismo.
  const boton = $('interact-button-pc');
  assert.equal($('detail-name-simple').textContent, nombre, 'el panel sigue con el objeto elegido');
  assert.equal(boton.disabled, false, 'y su botón está activo');
  boton._pulsar();
  assert.equal($('pc-item-modal').classList.contains('hidden'), false, 'el botón abre la ventana de compra');
  assert.equal($('pc-item-name').textContent, nombre, 'con el mismo objeto');
});

test('PC: si el objeto ya no se ofrece al reabrir, el panel se vacía y el botón no engaña', async (t) => {
  const { tienda, $ } = montarTienda(t);
  await tienda.open();
  tienda.selectItem('Semillax');
  tienda.close();
  // Mientras estaba cerrada pasó a modo venta y no tiene ninguna.
  $('tienda-tipo').value = 'venta';
  tienda.disponibleParaVenta = () => 0;
  await tienda.open();
  assert.equal(tienda.transactionType, 'venta', 'el modo es el que enseña el desplegable');
  const boton = $('interact-button-pc');
  if (boton.disabled === false) {
    boton._pulsar();
    assert.equal($('pc-item-modal').classList.contains('hidden'), false, 'si el botón está activo, tiene que abrir algo');
  } else {
    assert.equal($('detail-name-simple').textContent, 'Select an item');
  }
});

test('PC: el botón recupera la selección del panel aunque algo la haya borrado por dentro', async (t) => {
  const { tienda, $ } = montarTienda(t);
  await tienda.open();
  tienda.selectItem('Semillax');
  tienda.selectedItem = null;            // cualquier camino que la suelte sin repintar el panel
  $('interact-button-pc')._pulsar();
  assert.equal($('pc-item-modal').classList.contains('hidden'), false);
  assert.equal(tienda.selectedItem && tienda.selectedItem.id, 'Semillax');
});
