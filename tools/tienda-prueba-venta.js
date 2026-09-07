/* La venta en la tienda: que lo vendido se quite DE VERDAD y se guarde.
 *
 * EL FALLO QUE VIGILA — "vendo 5 zanahorias, me dice que las vendio, y al salir
 * del mapa las sigo teniendo". Eran dos cosas encadenadas:
 *
 *   · processSale mandaba el literal 'slots' como tipo on-chain. Ese argumento
 *     acaba en quitarDeFactura, que lo compara con el tipo de la factura del
 *     contrato: nunca cuadraba, la respuesta era "esa factura ya no estaba", y
 *     el cliente se lo creia y borraba el objeto EN LOCAL sin tocar la cadena.
 *     Con el dinero ya cobrado.
 *
 *   · EliitemWithCheck termina con `if (typeof this.savegg === 'function')`,
 *     y `savegg` vive en la ESCENA, no en TiendaSistema. La comprobacion daba
 *     false, el guardado se saltaba en silencio y nada llegaba al servidor.
 *
 * Esta prueba carga el tienda_sistema.js REAL contra un navegador y una escena
 * de mentira, y le vende cosas.
 *
 *   node tools/tienda-prueba-venta.js  [carpeta bin]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BIN = process.argv[2] || path.join(__dirname, '..');

let fallos = 0, pasadas = 0;
const ok = (c, m, x) => {
  if (c) { pasadas++; console.log('  OK    ' + m); }
  else { fallos++; console.log('  FALLO ' + m + (x ? '  -> ' + x : '')); }
};

// ── Navegador de mentira ────────────────────────────────────────────────────
const nodoFalso = () => ({
  style: {}, classList: { add() {}, remove() {}, contains() { return false; } },
  appendChild() {}, removeChild() {}, remove() {}, setAttribute() {},
  addEventListener() {}, querySelector() { return null; },
  querySelectorAll() { return []; }, insertAdjacentHTML() {},
  innerHTML: '', textContent: '', value: '', dataset: {}, children: []
});
global.window = global;
global.addEventListener = function () {};
global.removeEventListener = function () {};
global.innerWidth = 1280;
global.innerHeight = 720;
global.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
global.document = {
  body: nodoFalso(), head: nodoFalso(),
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() { return nodoFalso(); },
  addEventListener() {}, removeEventListener() {}
};
global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; },
                        setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
// `navigator` en Node moderno solo tiene getter: se redefine.
try { Object.defineProperty(global, 'navigator', { value: { userAgent: 'node' }, configurable: true }); }
catch (e) { /* si no se deja, el userAgent de Node ya sirve */ }
global.fetch = () => Promise.reject(new Error('sin red'));
global.getCsrfToken = () => 'x';

// ── Escena de mentira ───────────────────────────────────────────────────────
function catalogoDeLaEscena() {
  const t = fs.readFileSync(path.join(BIN, 'Scenes', 'tiendajuego.js'), 'utf8').replace(/\r\n/g, '\n');
  const marca = 'this.ItemDefinitions = {';
  const i = t.indexOf(marca);
  const ini = t.indexOf('{', i + marca.length - 1);
  let p = 0, j = ini;
  for (; j < t.length; j++) { const c = t[j]; if (c === '{') p++; else if (c === '}') { p--; if (!p) { j++; break; } } }
  return eval('(' + t.slice(ini, j) + ')');
}

class EscenaFalsa {
  constructor() {
    this.ItemDefinitions = catalogoDeLaEscena();
    this.playerName = 'Ana';
    this.serverBase = 'http://prueba.local';
    this.moneda = 0; this.moneda_plata = 500;
    this.guardados = 0;
    this.STATE = { slots: [], quickSlots: [], ghostSlots: { inv: [], quick: [] }, selectedItem: null };
    for (let i = 0; i < 24; i++) { this.STATE.slots.push(null); this.STATE.ghostSlots.inv.push(null); }
    for (let i = 0; i < 7; i++) { this.STATE.quickSlots.push(null); this.STATE.ghostSlots.quick.push(null); }
    this.scene = { key: 'tiendajuego' };
  }
  poner(idx, id, count, invoiceId) {
    this.STATE.slots[idx] = { id, count, idx: invoiceId, idm: id + '#' + invoiceId };
  }
  contar(id) {
    let n = 0;
    for (const s of [...this.STATE.slots, ...this.STATE.quickSlots]) if (s && s.id === id) n += s.count || 0;
    return n;
  }
  async savegg() { this.guardados++; return true; }
  queuedAction() {}
  rebuildPlayerInventoryFromState() {}
  renderSlot() {}
}

// ── Relay de mentira: se comporta como quitarDeFactura de verdad ────────────
function relayFalso(facturas) {
  return {
    pedidos: [],
    async initialize() {}, async debugBackendConnection() { return {}; },
    async checkAuth() { return { success: true, address: '0xjugador' }; },
    async findContract() { return { address: '0xC' }; },
    showError() {}, showWarning() {}, showInfo() {}, showSuccess() {},
    async waitForTransaction() { return { success: true, txHash: '0xabc' }; },
    async accion() { return null; },
    async quitarDeFactura(dir, o) {
      this.pedidos.push({ idx: o.idx, tipo: o.tipo, cantidad: o.cantidad });
      const f = facturas[o.idx];
      // Misma regla que la libreria real: el tipo tiene que cuadrar.
      if (!f || !f.activa) return { ok: true, ya: true, motivo: 'no existe' };
      if (o.tipo && f.tipo && f.tipo !== o.tipo) {
        return { ok: false, ya: false, error: 'ese id es de otro objeto (' + f.tipo + ')' };
      }
      const quita = Math.min(Number(o.cantidad) || 0, f.cantidad);
      f.cantidad -= quita;
      if (f.cantidad <= 0) f.activa = false;
      return { ok: true, ya: false, funcion: 'decreaseInvoiceQuantity', id: o.idx,
               cantidad: quita, transactionId: 'tx1', txHash: '0xabc' };
    }
  };
}

// ── Cargar el fichero real ──────────────────────────────────────────────────
const ruta = path.join(BIN, 'tienda_sistema.js');
if (!fs.existsSync(ruta)) { console.error('No encuentro ' + ruta); process.exit(2); }
const hablar = console.log;
console.log = () => {};                       // la tienda habla muchisimo al cargar
// El `class` de un eval queda en el ambito del eval, no en global: se expone
// desde dentro del propio eval.
try {
  eval(fs.readFileSync(ruta, 'utf8') + '\n;global.TiendaSistema = TiendaSistema;');
} finally { console.log = hablar; }

const TiendaSistema = global.TiendaSistema;
if (typeof TiendaSistema !== 'function') {
  console.error('No se pudo cargar la clase TiendaSistema'); process.exit(2);
}

function tienda(escena, facturas) {
  const t = new TiendaSistema(escena);
  t.relayClient = relayFalso(facturas);
  t.showNotification = (msg, tipo) => { (t.avisos = t.avisos || []).push(String(msg)); };
  t.registrarTransaccion = () => {};
  t.agregarAlHistorial = () => {};
  t.updateMonedaDisplay = () => {};
  t.actualizarLimitesDiarios = () => {};
  return t;
}

const callar = () => { console.log = () => {}; };
const volver = () => { console.log = hablar; };

console.log('=== LA VENTA EN LA TIENDA ===\n');

// ── 1. Todo lo vendible se puede quitar de la cadena ────────────────────────
console.log('1) Cada objeto del catalogo tiene tipo on-chain');
{
  const e = new EscenaFalsa();
  const t = tienda(e, {});
  let sinTipo = [];
  for (const arr of Object.values(t.itemsTienda)) for (const it of arr) {
    if (!t._getOnchainTableFor(it.id)) sinTipo.push(it.id);
  }
  ok(sinTipo.length === 0, 'ninguno se venderia sin poder quitarlo', sinTipo.join(', '));

  const z = t._getOnchainTableFor('zanahoria_buena');
  ok(z && z[0] === 'zanahoria_buena' && z[1] === 20, 'la zanahoria sale de ItemDefinitions',
     JSON.stringify(z));
  const fr = t._getOnchainTableFor('fresa_buena');
  ok(fr && fr[0] === 'fresa_buena', 'y la fresa tambien (antes no estaba)', JSON.stringify(fr));
}

// ── 2. Las cosechas que faltaban ya se venden ───────────────────────────────
console.log('\n2) Trigo, fresa y calabaza estan a la venta');
{
  const t = tienda(new EscenaFalsa(), {});
  const ids = Object.values(t.itemsTienda).flat().map(x => x.id);
  ['trigo_buena', 'fresa_buena', 'calabaza_buena'].forEach(id => {
    const it = Object.values(t.itemsTienda).flat().find(x => x.id === id);
    ok(!!it && it.sellPrice > 0, id + ' tiene precio de venta',
       it ? String(it.sellPrice) : 'no esta en el catalogo');
  });
}

// ── 3. VENDER 5 ZANAHORIAS: el caso del informe ─────────────────────────────
(async () => {
  console.log('\n3) Vender 5 zanahorias');
  const e = new EscenaFalsa();
  e.poner(0, 'zanahoria_buena', 5, 1764);
  const facturas = { 1764: { id: 1764, tipo: 'zanahoria_buena', cantidad: 5, activa: true } };
  const t = tienda(e, facturas);
  const item = Object.values(t.itemsTienda).flat().find(x => x.id === 'zanahoria_buena');
  // El saldo se lee por donde lo lee la tienda, no por un campo suelto de la
  // escena: setBalanceByCurrency escribe en varios sitios a la vez.
  const plataAntes = Math.floor(Number(t.getBalanceByCurrency('silver')) || 0);
  const bruto = item.sellPrice * 5;
  const esperado = plataAntes + bruto - Math.ceil(bruto * (item.comision / 100));

  callar(); await t.processSale(item, 5); volver();

  const pedido = t.relayClient.pedidos[0] || {};
  ok(pedido.tipo === 'zanahoria_buena', 'se pide el tipo on-chain, no "slots"',
     'tipo enviado: ' + pedido.tipo);
  ok(facturas[1764].cantidad === 0, 'la factura de la cadena baja a 0',
     String(facturas[1764].cantidad));
  ok(e.contar('zanahoria_buena') === 0, 'el inventario local se queda sin zanahorias',
     String(e.contar('zanahoria_buena')));
  ok(e.guardados > 0, 'SE GUARDA en el servidor (savegg llega a la escena)',
     e.guardados + ' guardados');
  const plataDespues = Math.floor(Number(t.getBalanceByCurrency('silver')) || 0);
  ok(plataDespues === esperado, 'se paga el precio exacto menos comision',
     plataAntes + ' -> ' + plataDespues + ' (tocaba ' + esperado + ')');

  // ── 4. Si la cadena no confirma, NO se paga ni se quita ──────────────────
  console.log('\n4) Si la factura no cuadra, no se cobra ni se quita');
  const e2 = new EscenaFalsa();
  e2.poner(0, 'zanahoria_buena', 5, 3);
  // El hueco lleva un id que en realidad es de OTRO objeto: el caso peligroso.
  const facturas2 = { 3: { id: 3, tipo: 'lingote', cantidad: 9, activa: true } };
  const t2 = tienda(e2, facturas2);
  const plataAntes2 = Math.floor(Number(t2.getBalanceByCurrency('silver')) || 0);

  callar(); await t2.processSale(item, 5); volver();

  ok(e2.contar('zanahoria_buena') === 5, 'el jugador conserva sus zanahorias',
     String(e2.contar('zanahoria_buena')));
  const plataDespues2 = Math.floor(Number(t2.getBalanceByCurrency('silver')) || 0);
  ok(plataDespues2 === plataAntes2, 'y no se le paga nada',
     plataAntes2 + ' -> ' + plataDespues2);
  ok(facturas2[3].cantidad === 9, 'la factura ajena queda intacta',
     String(facturas2[3].cantidad));

  // ── 5. Vender fresas ────────────────────────────────────────────────────
  console.log('\n5) Vender fresas (antes no se podia)');
  const e3 = new EscenaFalsa();
  e3.poner(0, 'fresa_buena', 3, 900);
  const facturas3 = { 900: { id: 900, tipo: 'fresa_buena', cantidad: 3, activa: true } };
  const t3 = tienda(e3, facturas3);
  const fresa = Object.values(t3.itemsTienda).flat().find(x => x.id === 'fresa_buena');
  const plataAntes3 = Math.floor(Number(t3.getBalanceByCurrency('silver')) || 0);
  const bruto3 = fresa.sellPrice * 3;
  const esperado3 = plataAntes3 + bruto3 - Math.ceil(bruto3 * (fresa.comision / 100));

  callar(); await t3.processSale(fresa, 3); volver();

  ok(e3.contar('fresa_buena') === 0, 'las fresas salen del inventario',
     String(e3.contar('fresa_buena')));
  ok(facturas3[900].cantidad === 0, 'y de la cadena', String(facturas3[900].cantidad));
  ok(e3.guardados > 0, 'y queda guardado', String(e3.guardados));
  const plataDespues3 = Math.floor(Number(t3.getBalanceByCurrency('silver')) || 0);
  ok(plataDespues3 === esperado3, 'y se paga el precio exacto',
     plataAntes3 + ' -> ' + plataDespues3 + ' (tocaba ' + esperado3 + ')');

  console.log('\n' + '='.repeat(60));
  console.log('Pasan: ' + pasadas + '   Fallan: ' + fallos);
  if (fallos) { console.log('\nHay fallos en la venta.'); process.exit(1); }
  console.log('Sin fallos.');
  process.exit(0);
})().catch(e => { volver(); console.error('EXPLOTO:', e); process.exit(1); });
