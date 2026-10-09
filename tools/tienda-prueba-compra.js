/* COMPRAR EN LA TIENDA: LO QUE SE PAGA SE ENTREGA, Y SOLO SE DEVUELVE LO QUE
 * LA CADENA NO ENTREGÓ.                                            (2026-10-09)
 * =============================================================================
 * Fallo de partida: "compro un objeto, me lo da, y al salir a GameScene se me
 * quita". Además de la traducción del `tipo` en la pantalla de carga (ver
 * tools/tienda-compra-sync.test.cjs), la compra tenía tres agujeros propios:
 *
 *   1. El reembolso se decidía contando el inventario antes y después. Si el
 *      jugador salía de la tienda con la compra en vuelo, la escena ya no
 *      estaba, el recuento daba 0 y se DEVOLVÍA el dinero de algo que la cadena
 *      sí había entregado (y el pintado reventaba con un TypeError).
 *   2. Para "completar un montón" se hacía `increaseInvoiceQuantity(idx)` con
 *      el idx de la casilla sin mirar de quién era esa factura ni de qué tipo.
 *   3. Una fusión con idx 0 se saltaba sin entregar NI reembolsar.
 *
 * Corre contra la pila REAL (tools/gf-banco-tienda.js).
 *
 *     node tools/tienda-prueba-compra.js  [carpeta bin]
 * =============================================================================
 */
'use strict';
const path = require('path');

const BIN = process.argv[2] || path.join(__dirname, '..');
const banco = require(path.join(__dirname, 'gf-banco-tienda.js'));

const JUGADOR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTRO    = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

let fallos = 0, pasadas = 0;
function ok(cond, mensaje, extra) {
  if (cond) { pasadas++; console.log('  OK    ' + mensaje); }
  else { fallos++; console.log('  FALLO ' + mensaje + (extra !== undefined ? '  -> ' + extra : '')); }
}

const hablar = console.log, gritar = console.error, avisar = console.warn;
const callar = () => { console.log = () => {}; console.error = () => {}; console.warn = () => {}; };
const volver = () => { console.log = hablar; console.error = gritar; console.warn = avisar; };
async function enSilencio(f) {
  callar();
  try { return await f(); } finally { volver(); }
}
const dormir = (ms) => new Promise(r => setTimeout(r, ms));

async function esperarCola(tienda, tope = 30000) {
  const hasta = Date.now() + tope;
  while (tienda.trabajosPendientes() > 0 && Date.now() < hasta) await dormir(10);
  await dormir(30);
  return tienda.trabajosPendientes() === 0;
}

function montar(opciones) {
  const b = banco.montar(BIN, opciones);
  b.tienda.playerMonedaPlata = 1000;
  b.tienda.playerMoneda = 1000;
  return b;
}

(async () => {
  console.log('=== COMPRAR EN LA TIENDA ===\n');

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('1) Comprar semillas: factura con su tipo, casilla enlazada, sin reembolso');
  {
    const b = montar();
    const semilla = banco.itemTienda(b.tienda, 'Semillax');
    await enSilencio(async () => {
      await b.tienda.processPurchase(semilla, 3);
      await esperarCola(b.tienda);
    });
    const vivas = b.cadena.vivasDe('bolsa zanahorias', JUGADOR);
    ok(vivas.length === 1 && vivas[0].cantidad === 3, 'la cadena tiene 3 en "bolsa zanahorias"', JSON.stringify(vivas));
    ok(b.escena.contar('Semillax') === 3, 'y el inventario enseña 3 semillas', String(b.escena.contar('Semillax')));
    const casilla = [...b.escena.STATE.quickSlots, ...b.escena.STATE.slots].find(s => s && s.id === 'Semillax');
    ok(casilla && vivas[0] && Number(casilla.idx) === vivas[0].id && casilla.idm === vivas[0].manualId,
       'la casilla apunta a SU factura (id y manualId)', JSON.stringify(casilla));
    ok(b.tienda.getBalanceByCurrency('silver') === 1000 - semilla.buyPrice * 3, 'se cobra el precio exacto',
       String(b.tienda.getBalanceByCurrency('silver')));
    ok(!b.tienda.avisos.some(a => a.includes('refunded')), 'sin reembolsos', JSON.stringify(b.tienda.avisos));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n2) Completar un montón cuya factura NO es suya: no se toca la ajena');
  {
    const b = montar();
    const ajena = b.cadena.crear(OTRO, 'bolsa zanahorias', 5, 'ajena#1');
    b.escena.poner(0, 'Semillax', 5, ajena, 'ajena#1');       // idx apuntando a otro jugador
    const semilla = banco.itemTienda(b.tienda, 'Semillax');
    await enSilencio(async () => {
      await b.tienda.processPurchase(semilla, 4);
      await esperarCola(b.tienda);
    });
    ok(b.cadena.facturas.get(ajena).cantidad === 5, 'la factura ajena sigue en 5',
       String(b.cadena.facturas.get(ajena).cantidad));
    ok(b.cadena.totalDe('bolsa zanahorias', JUGADOR) === 4, 'las 4 compradas están en una factura del jugador',
       String(b.cadena.totalDe('bolsa zanahorias', JUGADOR)));
    ok(!b.cadena.llamadas.some(x => x.fn === 'increaseInvoiceQuantity'), 'no se intentó sumar a la ajena');
    ok(b.tienda.getBalanceByCurrency('silver') === 1000 - semilla.buyPrice * 4, 'cobro correcto y sin reembolso',
       String(b.tienda.getBalanceByCurrency('silver')));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n3) Completar un montón con idx BASURA de otro objeto del jugador');
  {
    const b = montar();
    const hacha = b.cadena.crear(JUGADOR, 'hacha de madera', 1, 'hacha#1');
    b.escena.poner(2, 'Semillax', 10, hacha, 'Semillax');    // idx = la factura del hacha
    const semilla = banco.itemTienda(b.tienda, 'Semillax');
    await enSilencio(async () => {
      await b.tienda.processPurchase(semilla, 2);
      await esperarCola(b.tienda);
    });
    ok(b.cadena.facturas.get(hacha).cantidad === 1, 'el hacha no gana 2 unidades',
       String(b.cadena.facturas.get(hacha).cantidad));
    ok(b.cadena.totalDe('bolsa zanahorias', JUGADOR) === 2, 'las semillas van a su propia factura',
       String(b.cadena.totalDe('bolsa zanahorias', JUGADOR)));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n4) Completar un montón bueno: se suma a SU factura');
  {
    const b = montar();
    const mia = b.cadena.crear(JUGADOR, 'bolsa zanahorias', 10, 'mia#1');
    b.escena.poner(1, 'Semillax', 10, mia, 'mia#1');
    const semilla = banco.itemTienda(b.tienda, 'Semillax');
    await enSilencio(async () => {
      await b.tienda.processPurchase(semilla, 5);
      await esperarCola(b.tienda);
    });
    ok(b.cadena.facturas.get(mia).cantidad === 15, 'la factura pasa de 10 a 15',
       String(b.cadena.facturas.get(mia).cantidad));
    ok(b.escena.contar('Semillax') === 15, 'y la casilla enseña 15', String(b.escena.contar('Semillax')));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n5) Salir de la tienda con la compra EN VUELO: se entrega y NO se reembolsa');
  {
    const b = montar({ retrasoTx: 4 });
    const semilla = banco.itemTienda(b.tienda, 'Semillax2');
    let error = null;
    await enSilencio(async () => {
      await b.tienda.processPurchase(semilla, 6);
      await dormir(5);
      b.tienda.scene = null;                       // performCleanup de tiendajuego
      try { await esperarCola(b.tienda); } catch (e) { error = e; }
    });
    ok(!error, 'sin excepciones', String(error));
    ok(b.cadena.totalDe('bolsa de trigo', JUGADOR) === 6, 'la cadena tiene las 6 (las repone la pantalla de carga)',
       String(b.cadena.totalDe('bolsa de trigo', JUGADOR)));
    ok(!b.tienda.avisos.some(a => a.includes('refunded')), 'y NO se devuelve el dinero de algo entregado',
       JSON.stringify(b.tienda.avisos));
    ok(b.tienda.getBalanceByCurrency('silver') === 1000 - semilla.buyPrice * 6, 'el cobro se mantiene',
       String(b.tienda.getBalanceByCurrency('silver')));
    ok(window.GFTxGate.pending() === 0, 'y el TxGate queda libre', String(window.GFTxGate.pending()));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n6) Sin escena desde el principio: todo a facturas nuevas de maxStack');
  {
    const b = montar();
    const semilla = banco.itemTienda(b.tienda, 'Semillax');
    const maxStack = b.escena.ItemDefinitions.Semillax.maxStack;
    // Se encola con escena y se suelta antes de que le toque turno.
    await enSilencio(async () => {
      const espera = b.tienda.processPurchase(semilla, maxStack + 7);
      b.tienda.scene = null;
      await espera;
      await esperarCola(b.tienda);
    });
    const vivas = b.cadena.vivasDe('bolsa zanahorias', JUGADOR).map(f => f.cantidad).sort((x, y) => y - x);
    ok(JSON.stringify(vivas) === JSON.stringify([maxStack, 7]), `dos facturas: ${maxStack} y 7`, JSON.stringify(vivas));
    ok(!b.tienda.avisos.some(a => a.includes('refunded')), 'sin reembolso', JSON.stringify(b.tienda.avisos));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n7) El contrato rechaza la compra: se devuelve TODO');
  {
    const b = montar();
    b.cadena.tiposConfigurados = new Set(['otra_tabla']);   // createInvoice revierte
    const semilla = banco.itemTienda(b.tienda, 'Semillax');
    await enSilencio(async () => {
      await b.tienda.processPurchase(semilla, 3);
      await esperarCola(b.tienda);
    });
    ok(b.escena.contar('Semillax') === 0, 'no aparece nada en el inventario', String(b.escena.contar('Semillax')));
    ok(b.tienda.getBalanceByCurrency('silver') === 1000, 'y se devuelve el dinero entero',
       String(b.tienda.getBalanceByCurrency('silver')));
    ok(b.tienda.avisos.some(a => a.includes('refunded')), 'avisando al jugador', JSON.stringify(b.tienda.avisos));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n8) Inventario lleno: se cobra solo lo que cabe');
  {
    const b = montar();
    for (let i = 0; i < 40; i++) b.escena.poner(i, 'palo', 20, 900 + i, 'palo' + i);
    for (let i = 0; i < 6; i++) b.escena.ponerRapido(i, 'palo', 20, 950 + i, 'palor' + i);
    const semilla = banco.itemTienda(b.tienda, 'Semillax');
    const maxStack = b.escena.ItemDefinitions.Semillax.maxStack;
    await enSilencio(async () => {
      await b.tienda.processPurchase(semilla, maxStack + 3);   // solo cabe un montón
      await esperarCola(b.tienda);
    });
    ok(b.cadena.totalDe('bolsa zanahorias', JUGADOR) === maxStack, `la cadena recibe ${maxStack}`,
       String(b.cadena.totalDe('bolsa zanahorias', JUGADOR)));
    ok(b.tienda.getBalanceByCurrency('silver') === 1000 - semilla.buyPrice * maxStack, 'se reembolsan las 3 que no caben',
       String(b.tienda.getBalanceByCurrency('silver')));
  }

  console.log('\n==============================================================');
  console.log(`Pasan: ${pasadas}   Fallan: ${fallos}`);
  console.log(fallos ? 'HAY FALLOS.' : 'Sin fallos.');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { volver(); console.error(e); process.exit(1); });
