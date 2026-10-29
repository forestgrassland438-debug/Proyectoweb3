/* LA COLA DE LA TIENDA: vender sin quedarse esperando, y sin perder nada.
 * =============================================================================
 * Lo que vigila, en el orden en que se rompió:
 *
 *   1. "PUEDO COMPRAR PERO NO VENDER."  Tres fallos encadenados:
 *      · `_normalizeResult` se quedaba solo con el PRIMER campo de la factura
 *        (el id) y tiraba el resto, así que `leerFactura` devolvía null y los
 *        dos primeros caminos de `quitarDeFactura` estaban muertos;
 *      · `RemoveItemBlockchains` DESCARTABA la operación cuando el hueco no
 *        traía id de factura — y el hueco 0 da `idx = 0`, que es falso;
 *      · `EliitemWithCheck` casaba por `idx` sin mirar de qué objeto era.
 *
 *   2. "TENGO QUE ESPERAR A QUE TERMINE PARA VENDER OTRA COSA."  `processSale`
 *      esperaba a la cadena con el botón bloqueado. Ahora se encola, como la
 *      compra, y el mando vuelve al jugador en el acto.
 *
 * Corre contra la pila REAL (ver tools/gf-banco-tienda.js): tienda_sistema.js
 * y phaser-relay-library.js de verdad, con un server2 y un contrato imitados.
 *
 *     node tools/tienda-prueba-cola.js  [carpeta bin]
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

// La tienda habla muchísimo: se calla mientras se opera y se vuelve a oír para
// los resultados.
const hablar = console.log, gritar = console.error, avisar = console.warn;
const callar = () => { console.log = () => {}; console.error = () => {}; console.warn = () => {}; };
const volver = () => { console.log = hablar; console.error = gritar; console.warn = avisar; };
async function enSilencio(f) {
  callar();
  try { return await f(); } finally { volver(); }
}

const dormir = (ms) => new Promise(r => setTimeout(r, ms));

/** Espera a que la cola de la tienda se vacíe (con tope, para no colgarse). */
async function esperarCola(tienda, tope = 30000) {
  const hasta = Date.now() + tope;
  while (tienda.trabajosPendientes() > 0 && Date.now() < hasta) {
    await dormir(10);
  }
  // Un respiro por si el último trabajo aún está soltando su `finally`.
  await dormir(30);
  return tienda.trabajosPendientes() === 0;
}

/* LA COMISIÓN DEL TESORO (2026-10-22): el 1,5 % se cobra en BRONCE (la misma
   cuenta que el servidor, gfComisionTesoroBronce). De una venta en plata se
   paga la plata entera que queda y el resto en bronce; antes se quitaba la
   `comision` de cada objeto (2-10 %) de la plata y se perdía. */
function cobroDeVenta(item, unidades) {
  const neto = (Number(item.sellPrice) || 0) * unidades * 1000 - banco.comisionTesoro(item.sellPrice, 'silver', unidades);
  return { plata: Math.floor(neto / 1000), bronce: neto % 1000 };
}
function precioNeto(item, unidades) { return cobroDeVenta(item, unidades).plata; }
/** Todo lo que tiene el jugador, en bronce (1 plata = 1.000). */
function valorEnBronce(tienda) {
  return tienda.getBalanceByCurrency('silver') * 1000 + tienda.getBalanceByCurrency('bronze');
}

(async () => {
  console.log('=== LA COLA DE LA TIENDA ===\n');

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('1) Vender NO bloquea: processSale vuelve antes que la cadena');
  {
    // La confirmación tarda: el servidor contesta "pending" varias veces.
    const b = banco.montar(BIN, { retrasoTx: 4 });
    const id = b.cadena.crear(JUGADOR, 'zanahoria_buena', 5, 'zan#1');
    b.escena.poner(3, 'zanahoria_buena', 5, id, 'zan#1');
    const item = banco.itemTienda(b.tienda, 'zanahoria_buena');

    const t0 = Date.now();
    await enSilencio(() => b.tienda.processSale(item, 5));
    const tardanza = Date.now() - t0;

    ok(tardanza < 1500, 'processSale vuelve enseguida', tardanza + ' ms');
    ok(b.tienda.trabajosPendientes() === 1, 'la venta queda encolada',
       String(b.tienda.trabajosPendientes()));
    ok(b.cadena.totalDe('zanahoria_buena') === 5,
       'y la cadena todavía no se ha tocado', String(b.cadena.totalDe('zanahoria_buena')));

    const plata0 = b.tienda.getBalanceByCurrency('silver');
    ok(plata0 === 0, 'no se ha pagado nada por adelantado', String(plata0));

    const vacia = await enSilencio(() => esperarCola(b.tienda));
    ok(vacia, 'la cola termina sola');
    ok(b.cadena.totalDe('zanahoria_buena') === 0, 'la factura baja a 0 en la cadena',
       String(b.cadena.totalDe('zanahoria_buena')));
    ok(b.escena.contar('zanahoria_buena') === 0, 'el inventario se queda sin zanahorias',
       String(b.escena.contar('zanahoria_buena')));
    ok(b.tienda.getBalanceByCurrency('silver') === precioNeto(item, 5),
       'y se paga el precio exacto menos comisión',
       b.tienda.getBalanceByCurrency('silver') + ' (tocaba ' + precioNeto(item, 5) + ')');
    const bruto = item.sellPrice * 5 * 1000;
    // (2026-10-26) La comisión pasó al 5 % (1,5 % circular + 3,5 % del juego): GF_COMISION_TESORO_BPS = 500.
    ok(b.tienda.getBalanceByCurrency('bronze') === (bruto - Math.round(bruto * 0.05)) % 1000,
       'el cambio de la comisión del 5 % llega en bronce',
       b.tienda.getBalanceByCurrency('bronze') + ' (tocaba ' + ((bruto - Math.round(bruto * 0.05)) % 1000) + ')');
    const aviso = b.servidor.comisiones[0] || {};
    ok(b.servidor.comisiones.length === 1 && aviso.operacion === 'venta' && aviso.itemId === 'zanahoria_buena' &&
       aviso.cantidad === 5 && /^[A-Za-z0-9_-]{8,64}$/.test(String(aviso.ref || '')),
       'y se avisa al tesoro UNA vez, con su ref', JSON.stringify(b.servidor.comisiones));
    ok(b.escena.guardados > 0, 'queda guardado en el servidor', String(b.escena.guardados));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n2) Tres ventas seguidas sin esperar: salen las tres, en orden');
  {
    const b = banco.montar(BIN, { retrasoTx: 2 });
    b.cadena.crear(JUGADOR, 'zanahoria_buena', 6, 'z1');
    b.cadena.crear(JUGADOR, 'tomate_buena',    4, 't1');
    b.cadena.crear(JUGADOR, 'fresa_buena',     3, 'f1');
    b.escena.poner(0, 'zanahoria_buena', 6, 0, 'zanahoria_buena');   // idx 0: el caso que no se podía vender
    b.escena.poner(1, 'tomate_buena',    4, 1, 'tomate_buena');
    b.escena.poner(2, 'fresa_buena',     3, null, null);             // sin idx ni manualId

    const zanahoria = banco.itemTienda(b.tienda, 'zanahoria_buena');
    const tomate    = banco.itemTienda(b.tienda, 'tomate_buena');
    const fresa     = banco.itemTienda(b.tienda, 'fresa_buena');

    await enSilencio(async () => {
      await b.tienda.processSale(zanahoria, 6);
      await b.tienda.processSale(tomate, 4);
      await b.tienda.processSale(fresa, 3);
    });

    ok(b.tienda.trabajosPendientes() === 3, 'las tres se encolan sin esperar',
       String(b.tienda.trabajosPendientes()));

    await enSilencio(() => esperarCola(b.tienda, 60000));

    ok(b.escena.contar('zanahoria_buena') === 0, 'zanahorias vendidas (hueco 0, idx 0)',
       String(b.escena.contar('zanahoria_buena')));
    ok(b.escena.contar('tomate_buena') === 0, 'tomates vendidos',
       String(b.escena.contar('tomate_buena')));
    ok(b.escena.contar('fresa_buena') === 0, 'fresas vendidas (sin idx ni manualId)',
       String(b.escena.contar('fresa_buena')));
    ok(b.cadena.totalDe('zanahoria_buena') === 0 && b.cadena.totalDe('tomate_buena') === 0 &&
       b.cadena.totalDe('fresa_buena') === 0, 'y las tres facturas se vacían en la cadena');

    const esperado = precioNeto(zanahoria, 6) + precioNeto(tomate, 4) + precioNeto(fresa, 3);
    ok(b.tienda.getBalanceByCurrency('silver') === esperado, 'se paga la suma exacta de las tres',
       b.tienda.getBalanceByCurrency('silver') + ' (tocaba ' + esperado + ')');

    const orden = b.cadena.llamadas.filter(x => x.fn === 'decreaseInvoiceQuantity').map(x => Number(x.args[0]));
    ok(JSON.stringify(orden) === JSON.stringify([1, 2, 3]),
       'las transacciones salen en el orden en que se pidieron', JSON.stringify(orden));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n3) No se puede vender dos veces lo mismo mientras espera turno');
  {
    const b = banco.montar(BIN, { retrasoTx: 6 });
    const id = b.cadena.crear(JUGADOR, 'zanahoria_buena', 5, 'z1');
    b.escena.poner(3, 'zanahoria_buena', 5, id, 'z1');
    const item = banco.itemTienda(b.tienda, 'zanahoria_buena');

    await enSilencio(() => b.tienda.processSale(item, 5));
    ok(b.tienda.disponibleParaVenta('zanahoria_buena') === 0,
       'las 5 quedan comprometidas aunque sigan en el inventario',
       String(b.tienda.disponibleParaVenta('zanahoria_buena')));
    ok(b.tienda.getItemCountInInventory('zanahoria_buena') === 5,
       'pero el inventario real sigue diciendo 5 (todavía son suyas)',
       String(b.tienda.getItemCountInInventory('zanahoria_buena')));

    b.tienda.avisos.length = 0;
    await enSilencio(() => b.tienda.processSale(item, 5));   // segunda venta: no debe entrar
    ok(b.tienda.trabajosPendientes() === 1, 'la segunda venta NO se encola',
       String(b.tienda.trabajosPendientes()));
    ok(b.tienda.avisos.some(a => a.includes('free to sell')),
       'y se le dice al jugador por qué', JSON.stringify(b.tienda.avisos));

    await enSilencio(() => esperarCola(b.tienda, 60000));
    ok(b.tienda.getBalanceByCurrency('silver') === precioNeto(item, 5),
       'se paga UNA vez, no dos', String(b.tienda.getBalanceByCurrency('silver')));
    ok(b.tienda.disponibleParaVenta('zanahoria_buena') === 0 &&
       b.tienda._comprometido('zanahoria_buena') === 0,
       'y al terminar no queda nada comprometido',
       String(b.tienda._comprometido('zanahoria_buena')));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n4) Si la cadena no confirma: ni se cobra ni se pierde el objeto');
  {
    const b = banco.montar(BIN);
    // La factura del hueco es de OTRO jugador y de otro tipo: no vale.
    const ajena = b.cadena.crear(OTRO, 'lingote', 9, 'otro#1');
    b.cadena.crear(JUGADOR, 'trigo_buena', 2, 'tr1');    // suya, pero de otra cosa
    b.escena.poner(3, 'zanahoria_buena', 5, ajena, 'otro#1');
    const item = banco.itemTienda(b.tienda, 'zanahoria_buena');

    await enSilencio(async () => {
      await b.tienda.processSale(item, 5);
      await esperarCola(b.tienda, 60000);
    });

    ok(b.escena.contar('zanahoria_buena') === 5, 'el jugador conserva sus zanahorias',
       String(b.escena.contar('zanahoria_buena')));
    ok(b.tienda.getBalanceByCurrency('silver') === 0, 'y no se le paga nada',
       String(b.tienda.getBalanceByCurrency('silver')));
    ok(b.cadena.facturas.get(ajena).cantidad === 9, 'la factura ajena queda intacta',
       String(b.cadena.facturas.get(ajena).cantidad));
    ok(b.cadena.totalDe('trigo_buena') === 2, 'y su trigo tampoco se toca',
       String(b.cadena.totalDe('trigo_buena')));
    ok(b.tienda._comprometido('zanahoria_buena') === 0,
       'las unidades se sueltan: se puede reintentar',
       String(b.tienda._comprometido('zanahoria_buena')));
    ok(b.tienda.avisos.some(a => a.includes('not sold')),
       'y el aviso dice que no se vendió', JSON.stringify(b.tienda.avisos.slice(-1)));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n5) Vender NUNCA toca otro objeto que comparta el idx');
  {
    const b = banco.montar(BIN);
    const idZan = b.cadena.crear(JUGADOR, 'zanahoria_buena', 5, 'z1');
    b.cadena.crear(JUGADOR, 'hacha de madera', 1, 'h1');
    // El hacha está en el cofre rápido con el MISMO número en idx (número de
    // hueco, que es lo que rellena addItem cuando nadie pasa un id de factura).
    b.escena.poner(3, 'zanahoria_buena', 5, idZan, 'z1');
    b.escena.ponerRapido(1, 'hacha_de_madera', 1, idZan, 'z1');

    const item = banco.itemTienda(b.tienda, 'zanahoria_buena');
    await enSilencio(async () => {
      await b.tienda.processSale(item, 5);
      await esperarCola(b.tienda, 60000);
    });

    ok(b.escena.contar('hacha_de_madera') === 1, 'el hacha sigue en el cofre rápido',
       String(b.escena.contar('hacha_de_madera')));
    ok(b.escena.contar('zanahoria_buena') === 0, 'y las zanahorias sí se fueron',
       String(b.escena.contar('zanahoria_buena')));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n6) Comprar y vender a la vez: la compra no se reembolsa sola');
  {
    const b = banco.montar(BIN);
    b.tienda.playerMonedaPlata = 1000;
    const id = b.cadena.crear(JUGADOR, 'zanahoria_buena', 5, 'z1');
    b.escena.poner(3, 'zanahoria_buena', 5, id, 'z1');

    const zanahoria = banco.itemTienda(b.tienda, 'zanahoria_buena');
    const semilla   = banco.itemTienda(b.tienda, 'Semillax');
    const valor0    = valorEnBronce(b.tienda);

    await enSilencio(async () => {
      await b.tienda.processPurchase(semilla, 3);   // compra encolada
      await b.tienda.processSale(zanahoria, 5);     // venta encolada detrás
      await esperarCola(b.tienda, 60000);
    });

    ok(b.escena.contar('Semillax') === 3, 'las 3 semillas llegan al inventario',
       String(b.escena.contar('Semillax')));
    ok(!b.tienda.avisos.some(a => a.includes('refunded')),
       'y NO hay reembolso fantasma', JSON.stringify(b.tienda.avisos));
    ok(b.escena.contar('zanahoria_buena') === 0, 'la venta también sale',
       String(b.escena.contar('zanahoria_buena')));

    // La compra paga su 1,5 % en bronce (rompiendo una plata si no hay bronce) y
    // la venta cobra el suyo: se mira el total, en bronce.
    const esperado = valor0 - (semilla.buyPrice * 3 * 1000 + banco.comisionTesoro(semilla.buyPrice, 'silver', 3))
                            + (zanahoria.sellPrice * 5 * 1000 - banco.comisionTesoro(zanahoria.sellPrice, 'silver', 5));
    ok(valorEnBronce(b.tienda) === esperado, 'y las cuentas cuadran',
       valorEnBronce(b.tienda) + ' BR (tocaba ' + esperado + ')');
    ok(b.servidor.comisiones.length === 2, 'y el tesoro recibe las dos comisiones',
       JSON.stringify(b.servidor.comisiones.map(c => c.operacion)));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n7) Lo ya gastado en la cadena se cuadra, pero NO se paga');
  {
    const b = banco.montar(BIN);
    // El hueco dice que hay zanahorias, pero en la cadena no queda ninguna.
    b.escena.poner(3, 'zanahoria_buena', 5, 4242, 'z-viejo');
    const item = banco.itemTienda(b.tienda, 'zanahoria_buena');

    await enSilencio(async () => {
      await b.tienda.processSale(item, 5);
      await esperarCola(b.tienda, 60000);
    });

    ok(b.escena.contar('zanahoria_buena') === 0, 'el hueco se cuadra (ya no existían)',
       String(b.escena.contar('zanahoria_buena')));
    ok(b.tienda.getBalanceByCurrency('silver') === 0,
       'y no se paga por algo que ya no estaba', String(b.tienda.getBalanceByCurrency('silver')));
    ok(b.tienda.avisos.some(a => a.includes('already been spent')),
       'se explica por qué no se ha cobrado', JSON.stringify(b.tienda.avisos));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n8) Salir de la tienda con ventas en cola: el TxGate las espera');
  {
    const b = banco.montar(BIN, { retrasoTx: 3 });
    const id = b.cadena.crear(JUGADOR, 'zanahoria_buena', 5, 'z1');
    b.escena.poner(3, 'zanahoria_buena', 5, id, 'z1');
    const item = banco.itemTienda(b.tienda, 'zanahoria_buena');

    await enSilencio(() => b.tienda.processSale(item, 5));
    ok(global.GFTxGate.pending() > 0, 'la venta encolada cuenta en el TxGate',
       String(global.GFTxGate.pending()));

    const r = await enSilencio(() => global.GFTxGate.whenIdle({ timeout: 60000 }));
    ok(r.idle === true, 'whenIdle espera a que termine de verdad', JSON.stringify(r));
    ok(b.cadena.totalDe('zanahoria_buena') === 0, 'y para entonces ya está quemada',
       String(b.cadena.totalDe('zanahoria_buena')));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n9) Vender de dos montones a la vez');
  {
    const b = banco.montar(BIN);
    b.cadena.crear(JUGADOR, 'zanahoria_buena', 20, 'z1');
    b.cadena.crear(JUGADOR, 'zanahoria_buena', 6,  'z2');
    b.escena.poner(3, 'zanahoria_buena', 20, 3, 'zanahoria_buena');   // idx basura
    b.escena.poner(4, 'zanahoria_buena', 6,  4, 'zanahoria_buena');
    const item = banco.itemTienda(b.tienda, 'zanahoria_buena');

    await enSilencio(async () => {
      await b.tienda.processSale(item, 24);
      await esperarCola(b.tienda, 60000);
    });

    ok(b.escena.contar('zanahoria_buena') === 2, 'quedan 2 en el inventario',
       String(b.escena.contar('zanahoria_buena')));
    ok(b.cadena.totalDe('zanahoria_buena') === 2, 'y 2 en la cadena: van a la par',
       String(b.cadena.totalDe('zanahoria_buena')));
    ok(b.tienda.getBalanceByCurrency('silver') === precioNeto(item, 24),
       'se paga por las 24', String(b.tienda.getBalanceByCurrency('silver')));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n10) Aunque no se pueda leer el inventario de la cadena, se vende');
  {
    // El hueco trae el id BUENO: no hace falta el snapshot para nada.
    const b = banco.montar(BIN, { snapshotRoto: true });
    const id = b.cadena.crear(JUGADOR, 'zanahoria_buena', 5, 'z1');
    b.escena.poner(3, 'zanahoria_buena', 5, id, 'z1');
    const item = banco.itemTienda(b.tienda, 'zanahoria_buena');

    await enSilencio(async () => {
      await b.tienda.processSale(item, 5);
      await esperarCola(b.tienda, 60000);
    });

    ok(b.cadena.totalDe('zanahoria_buena') === 0,
       'la factura se lee por su id y se quema', String(b.cadena.totalDe('zanahoria_buena')));
    ok(b.tienda.getBalanceByCurrency('silver') === precioNeto(item, 5),
       'y se cobra', String(b.tienda.getBalanceByCurrency('silver')));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n11) Contrato sin listar inventario: no se regala nada');
  {
    // Sin `getUserInventorySnapshot`, con el id bueno la venta tiene que salir
    // POR LA CADENA. Antes se "vendía" en local y la factura seguía viva.
    const b = banco.montar(BIN, { sinSnapshot: true });
    const id = b.cadena.crear(JUGADOR, 'zanahoria_buena', 5, 'z1');
    b.escena.poner(3, 'zanahoria_buena', 5, id, 'z1');
    const item = banco.itemTienda(b.tienda, 'zanahoria_buena');

    await enSilencio(async () => {
      await b.tienda.processSale(item, 5);
      await esperarCola(b.tienda, 60000);
    });

    ok(b.cadena.totalDe('zanahoria_buena') === 0,
       'la factura se quema DE VERDAD, no solo en pantalla',
       String(b.cadena.totalDe('zanahoria_buena')));
    ok(b.escena.contar('zanahoria_buena') === 0, 'y el inventario cuadra',
       String(b.escena.contar('zanahoria_buena')));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n12) Cantidades imposibles: ni se encolan');
  {
    const b = banco.montar(BIN);
    const id = b.cadena.crear(JUGADOR, 'zanahoria_buena', 5, 'z1');
    b.escena.poner(3, 'zanahoria_buena', 5, id, 'z1');
    const item = banco.itemTienda(b.tienda, 'zanahoria_buena');

    await enSilencio(async () => {
      await b.tienda.processSale(item, 0);
      await b.tienda.processSale(item, -3);
      await b.tienda.processSale(item, 999);
    });
    ok(b.tienda.trabajosPendientes() === 0, 'nada se encola',
       String(b.tienda.trabajosPendientes()));
    ok(b.tienda._comprometido('zanahoria_buena') === 0, 'y nada queda comprometido',
       String(b.tienda._comprometido('zanahoria_buena')));
    ok(b.escena.contar('zanahoria_buena') === 5, 'el inventario no se toca',
       String(b.escena.contar('zanahoria_buena')));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n13) Un objeto sin precio de venta no se quema por nada');
  {
    const b = banco.montar(BIN);
    const id = b.cadena.crear(JUGADOR, 'zanahoria_buena', 5, 'z1');
    b.escena.poner(3, 'zanahoria_buena', 5, id, 'z1');
    const item = banco.itemTienda(b.tienda, 'zanahoria_buena');
    const sinPrecio = Object.assign({}, item, { sellPrice: 0 });

    await enSilencio(async () => {
      await b.tienda.processSale(sinPrecio, 5);
      await esperarCola(b.tienda, 20000);
    });

    ok(b.escena.contar('zanahoria_buena') === 5, 'el objeto sigue en el inventario',
       String(b.escena.contar('zanahoria_buena')));
    ok(b.cadena.totalDe('zanahoria_buena') === 5, 'y en la cadena',
       String(b.cadena.totalDe('zanahoria_buena')));
    ok(b.tienda.avisos.some(a => a.includes('no sale price')),
       'y se explica por qué', JSON.stringify(b.tienda.avisos));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n14) Después de una venta fallida se puede reintentar y sale');
  {
    const b = banco.montar(BIN);
    // Primero, un hueco con la factura de otro jugador: la venta falla.
    const ajena = b.cadena.crear(OTRO, 'lingote', 9, 'otro#1');
    b.escena.poner(3, 'zanahoria_buena', 5, ajena, 'otro#1');
    const item = banco.itemTienda(b.tienda, 'zanahoria_buena');

    await enSilencio(async () => {
      await b.tienda.processSale(item, 5);
      await esperarCola(b.tienda, 60000);
    });
    ok(b.escena.contar('zanahoria_buena') === 5, 'la primera venta falla y no quita nada',
       String(b.escena.contar('zanahoria_buena')));

    // Ahora el jugador SÍ tiene una factura buena de zanahorias.
    b.cadena.crear(JUGADOR, 'zanahoria_buena', 5, 'z-bueno');
    b.tienda.avisos.length = 0;
    await enSilencio(async () => {
      await b.tienda.processSale(item, 5);
      await esperarCola(b.tienda, 60000);
    });

    ok(b.escena.contar('zanahoria_buena') === 0, 'el reintento sí vende',
       String(b.escena.contar('zanahoria_buena')));
    ok(b.cadena.totalDe('zanahoria_buena') === 0, 'y la factura buena se quema',
       String(b.cadena.totalDe('zanahoria_buena')));
    ok(b.cadena.facturas.get(ajena).cantidad === 9, 'sin tocar la ajena en ningún momento',
       String(b.cadena.facturas.get(ajena).cantidad));
    ok(b.tienda.getBalanceByCurrency('silver') === precioNeto(item, 5),
       'y se paga una sola vez', String(b.tienda.getBalanceByCurrency('silver')));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n15) Vender desde el cofre rápido y vender solo una parte');
  {
    const b = banco.montar(BIN);
    const id = b.cadena.crear(JUGADOR, 'zanahoria_buena', 9, 'z1');
    b.escena.ponerRapido(2, 'zanahoria_buena', 9, id, 'z1');
    const item = banco.itemTienda(b.tienda, 'zanahoria_buena');

    await enSilencio(async () => {
      await b.tienda.processSale(item, 4);
      await esperarCola(b.tienda, 60000);
    });

    ok(b.escena.contar('zanahoria_buena') === 5, 'quedan 5 en el cofre rápido',
       String(b.escena.contar('zanahoria_buena')));
    ok(b.cadena.totalDe('zanahoria_buena') === 5, 'y 5 en la cadena',
       String(b.cadena.totalDe('zanahoria_buena')));
    ok(b.cadena.facturas.get(id).active === true, 'la factura sigue viva (no se borró entera)',
       String(b.cadena.facturas.get(id).active));
    ok(b.tienda.getBalanceByCurrency('silver') === precioNeto(item, 4), 'se paga por 4',
       String(b.tienda.getBalanceByCurrency('silver')));

    // Y ahora el resto, sin salir de la tienda.
    await enSilencio(async () => {
      await b.tienda.processSale(item, 5);
      await esperarCola(b.tienda, 60000);
    });
    ok(b.escena.contar('zanahoria_buena') === 0, 'la segunda venta se lleva el resto',
       String(b.escena.contar('zanahoria_buena')));
    ok(b.cadena.totalDe('zanahoria_buena') === 0, 'y la cadena queda a 0',
       String(b.cadena.totalDe('zanahoria_buena')));
    ok(b.tienda.getBalanceByCurrency('silver') === precioNeto(item, 4) + precioNeto(item, 5),
       'y el total pagado es la suma de las dos',
       String(b.tienda.getBalanceByCurrency('silver')));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n16) Con el servidor de antes (sin tesoro) no se cobra comisión');
  {
    const b = banco.montar(BIN, { servidorViejo: true });
    b.tienda.playerMonedaPlata = 1000;
    const id = b.cadena.crear(JUGADOR, 'zanahoria_buena', 5, 'z1');
    b.escena.poner(3, 'zanahoria_buena', 5, id, 'z1');
    const zanahoria = banco.itemTienda(b.tienda, 'zanahoria_buena');
    const semilla   = banco.itemTienda(b.tienda, 'Semillax');

    await enSilencio(async () => {
      await b.tienda.processPurchase(semilla, 3);
      await b.tienda.processSale(zanahoria, 5);
      await esperarCola(b.tienda, 60000);
    });
    const esperado = 1000 - semilla.buyPrice * 3 + zanahoria.sellPrice * 5;
    ok(b.tienda.getBalanceByCurrency('silver') === esperado, 'se paga y se cobra el precio justo, sin el 1,5 %',
       b.tienda.getBalanceByCurrency('silver') + ' (tocaba ' + esperado + ')');
    ok(b.tienda.getBalanceByCurrency('bronze') === 0, 'no se toca el bronce', String(b.tienda.getBalanceByCurrency('bronze')));
    ok(b.servidor.comisiones.length === 0, 'y no se avisa a un tesoro que no existe', String(b.servidor.comisiones.length));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n17) El registro de la tienda: cada compra y venta se cuenta al servidor, con sus números');
  {
    /* (2026-10-27) "Quiero ver quién compró, cuánto gastó y si pagó o no; si el
       gasto al comprar y al vender es el correcto; y cualquier error en el
       historial." La tienda manda inicio y fin (o error) a /api/tienda/registro. */
    const b = banco.montar(BIN, {});
    b.tienda.playerMonedaPlata = 1000;
    const id = b.cadena.crear(JUGADOR, 'zanahoria_buena', 5, 'z1');
    b.escena.poner(3, 'zanahoria_buena', 5, id, 'z1');
    const zanahoria = banco.itemTienda(b.tienda, 'zanahoria_buena');
    const semilla   = banco.itemTienda(b.tienda, 'Semillax');
    await enSilencio(async () => {
      await b.tienda.processPurchase(semilla, 3);
      await b.tienda.processSale(zanahoria, 5);
      await esperarCola(b.tienda, 60000);
    });
    const R = b.servidor.registros;
    const de = (op, fase) => R.filter(r => r.op === op && r.fase === fase);
    const ci = de('compra', 'inicio')[0] || {}, cf = de('compra', 'fin')[0] || {};
    ok(ci.ref && ci.ref === cf.ref, 'la compra manda inicio y fin con la MISMA ref', JSON.stringify(R.map(r => r.op + ':' + r.fase)));
    ok(ci.itemId === 'Semillax' && ci.cantidad === 3 && ci.precioUnidad === semilla.buyPrice && ci.total === semilla.buyPrice * 3 && ci.moneda === 'silver',
       'con lo que costó (precio, total y moneda)', JSON.stringify(ci));
    ok(ci.fee > 0 && ci.fee === b.tienda._comisionBronce(semilla, 3, 'compra'), 'y su comisión en bronce', String(ci.fee));
    // `guardada` es lo que devolvió /api/inventory/reconcile (este banco no lo imita: sale false, y así se ve en la auditoría).
    ok(cf.confirmadas === 3 && cf.reembolso === 0 && typeof cf.guardada === 'boolean', 'el fin dice cuántas se confirmaron y si se guardó', JSON.stringify(cf));
    const vi = de('venta', 'inicio')[0] || {}, vf = de('venta', 'fin')[0] || {};
    ok(vi.ref && vi.ref === vf.ref && vi.ref !== ci.ref, 'la venta, con su propia ref', vi.ref + ' / ' + vf.ref);
    const brutoV = zanahoria.sellPrice * 5 * 1000, feeV = b.tienda._comisionBronce(zanahoria, 5, 'venta');
    ok(vf.confirmadas === 5 && vf.pagadoBronce === brutoV - feeV, 'y lo que se pagó, en bronce (precio menos la comisión)', JSON.stringify(vf));
    // Un fallo antes de cobrar también llega (sin fondos).
    b.tienda.playerMonedaPlata = 0;
    b.tienda.selectedItem = semilla; b.tienda.transactionType = 'compra';
    const input = { value: '2' };
    const getEl = global.document.getElementById;
    global.document.getElementById = (x) => (x === 'pc-quantity-input' ? input : (getEl ? getEl.call(global.document, x) : null));
    try { await enSilencio(() => b.tienda.executePcModalTransaction()); } finally { global.document.getElementById = getEl; }
    await new Promise(r => setTimeout(r, 50));
    const err = de('compra', 'error')[0] || {};
    ok(err.itemId === 'Semillax' && err.cantidad === 2 && /insufficient/i.test(err.error || '') && err.grave === false,
       'y una compra que no se pudo hacer, con su motivo', JSON.stringify(err));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\nX) Comprar y SALIR de la tienda con la compra en cola');
  {
    /* "Compro en la tienda y me salgo: sale «Error crítico: Cannot read
       properties of undefined (reading 'quickSlots')» y en el mapa no tengo
       los objetos." La compra que esperaba turno arrancaba sin inventario. */
    const b = banco.montar(BIN, { retrasoTx: 3 });
    const item = banco.itemTienda(b.tienda, 'Semillax') || banco.itemTienda(b.tienda, 'Regaderax');
    b.tienda.playerMonedaPlata = 5000; b.tienda.playerMoneda = 5000;
    const errores = [];
    await enSilencio(async () => {
      const errOrig = console.error;
      console.error = (...a) => errores.push(a.map(String).join(' '));
      try {
        await b.tienda.processPurchase(item, 1);
        await b.tienda.processPurchase(item, 1);     // la segunda espera turno
        b.escena.salir(b.tienda);                    // y el jugador se va ya
        b.tienda.scene = null;                       // el caso peor: nadie apunta ya a la escena
        await esperarCola(b.tienda, 60000);
      } finally { console.error = errOrig; }
    });
    const tabla = b.tienda._getOnchainTableFor(item.id)[0];
    ok(!errores.some(e => /quickSlots|crítico/.test(e)), 'sin el error de quickSlots',
       errores.filter(e => /quickSlots|crítico/.test(e)).join(' | ').slice(0, 200));
    ok(b.cadena.totalDe(tabla) === 2, 'las DOS compras llegan a la cadena', String(b.cadena.totalDe(tabla)));
    ok(!b.tienda.avisos.some(a => /refunded/i.test(a)), 'y no se reembolsa nada sin motivo',
       b.tienda.avisos.join(' | ').slice(0, 200));
    ok(b.escena.guardados === 0, 'la escena ya apagada no guarda (el mapa recoge el objeto de la cadena)',
       String(b.escena.guardados));
  }

  console.log('\n' + '='.repeat(62));
  console.log('Pasan: ' + pasadas + '   Fallan: ' + fallos);
  if (fallos) { console.log('\nHay fallos en la tienda.'); process.exit(1); }
  console.log('Sin fallos.');
  process.exit(0);
})().catch(e => { volver(); console.error('EXPLOTO:', e); process.exit(1); });
