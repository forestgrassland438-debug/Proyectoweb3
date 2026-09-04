/* Prueba del camino resistente de quitarDeFactura, sin navegador y sin cadena.
   Se le da a PhaserRelay un doble de `accion` que devuelve la factura que
   queramos (o el error que queramos) y se comprueba QUÉ decide. */
const fs = require('fs');
const path = process.argv[2];

// Entorno mínimo para que el archivo se pueda cargar fuera del navegador.
global.window = global;
global.document = { cookie: '' };
global.navigator = { userAgent: 'node' };
global.fetch = () => Promise.reject(new Error('sin red'));
global.AbortController = class { constructor(){ this.signal = null; } abort(){} };
global.localStorage = { getItem(){ return null; }, setItem(){}, removeItem(){} };

eval(fs.readFileSync(path, 'utf8'));

const PhaserRelay = global.PhaserRelay;
let fallos = 0;
function comprobar(nombre, real, esperado) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) { fallos++; console.log('FALLA  ' + nombre + '\n   sale: ' + JSON.stringify(real) +
                                   '\n   toca: ' + JSON.stringify(esperado)); }
  else console.log('ok     ' + nombre);
}

// ── clasificación de errores ──────────────────────────────────────────────
const red = PhaserRelay._esFalloDeRed.bind(PhaserRelay);
comprobar('revert no es red',        red(new Error('execution reverted')), false);
comprobar('CALL_EXCEPTION no es red',red(Object.assign(new Error('x'), { code: 'CALL_EXCEPTION' })), false);
comprobar('failed to fetch es red',  red(new Error('Failed to fetch')), true);
comprobar('timeout es red',          red(new Error('request timeout')), true);
comprobar('HTTP 503 es red',         red(new Error('HTTP 503: Service Unavailable')), true);
comprobar('sin error no es red',     red(null), false);

// ── lectura de la factura venga como venga ────────────────────────────────
const r = Object.create(PhaserRelay.prototype);
const comoObjeto = r._leerCamposFactura({
  out0: { id: 1764n, manualId: 'abc', owner: '0xAB', tipo: 'balde_vacio', cantidad: 1n, active: true }
});
comprobar('factura envuelta en out0', comoObjeto,
  { id: 1764, manualId: 'abc', owner: '0xab', tipo: 'balde_vacio', cantidad: 1, activa: true });

const comoArray = r._leerCamposFactura({ out0: [12, 'm1', '0xCD', 'madera', 5, true] });
comprobar('factura como array', comoArray,
  { id: 12, manualId: 'm1', owner: '0xcd', tipo: 'madera', cantidad: 5, activa: true });

comprobar('factura vacía', r._leerCamposFactura(null), null);

// ── el camino completo ────────────────────────────────────────────────────
function relayDePrueba(facturas, errorLectura) {
  const rel = Object.create(PhaserRelay.prototype);
  rel.enviadas = [];
  rel.checkAuth = async () => ({ success: true, address: '0xJUGADOR'.toLowerCase() });
  rel.accion = async (dir, op) => {
    if (errorLectura) throw errorLectura;
    if (op.funcion === 'getInvoice') {
      const f = facturas.porId[op._id];
      if (!f) throw new Error('execution reverted');
      return { out0: f };
    }
    if (op.funcion === 'getInvoiceByManualId') {
      const f = facturas.porNombre[op._manualId];
      if (!f) throw new Error('execution reverted');
      return { out0: f };
    }
    throw new Error('funcion no esperada: ' + op.funcion);
  };
  rel.sendTransaction = async (dir, fn, params) => {
    rel.enviadas.push([fn, params[0], params[1]]);
    return { success: true, transactionId: 'tx1', txHash: '0xhash' };
  };
  return rel;
}

const MIA = { id: 1764, manualId: 'balde#1', owner: '0xjugador',
              tipo: 'balde_vacio', cantidad: 1, active: true };
const AJENA = { id: 3, manualId: 'otro#1', owner: '0xotro',
                tipo: 'lingote', cantidad: 9, active: true };

(async () => {
  // 1. Caso normal: la factura está y es mía → decrease, no delete.
  let rel = relayDePrueba({ porId: { 1764: MIA }, porNombre: {} });
  let res = await rel.quitarDeFactura('0xC', { idx: 1764, manualid: 'balde#1',
                                               cantidad: 1, tipo: 'balde_vacio',
                                               vaciarFactura: true });
  comprobar('caso normal usa decrease', [res.ok, res.ya, res.funcion, rel.enviadas[0]],
            [true, false, 'decreaseInvoiceQuantity', ['decreaseInvoiceQuantity', '1764', '1']]);

  // 2. El id está viejo pero el manualId lo salva.
  rel = relayDePrueba({ porId: {}, porNombre: { 'balde#1': MIA } });
  res = await rel.quitarDeFactura('0xC', { idx: 9999, manualid: 'balde#1',
                                           cantidad: 1, tipo: 'balde_vacio',
                                           vaciarFactura: true });
  comprobar('id viejo, lo salva el manualId', [res.ok, res.ya, res.id], [true, false, 1764]);

  // 3. Ya no existe: no es error, es "ya estaba quitada".
  rel = relayDePrueba({ porId: {}, porNombre: {} });
  res = await rel.quitarDeFactura('0xC', { idx: 1764, manualid: 'balde#1',
                                           cantidad: 1, tipo: 'balde_vacio',
                                           vaciarFactura: true });
  comprobar('ya no existe → ya:true sin enviar nada',
            [res.ok, res.ya, rel.enviadas.length], [true, true, 0]);

  // 4. EL CASO PELIGROSO: el hueco lleva un numero de hueco (3) que resulta ser
  //    una factura de OTRO jugador y de otro objeto. No se puede tocar.
  rel = relayDePrueba({ porId: { 3: AJENA }, porNombre: {} });
  res = await rel.quitarDeFactura('0xC', { idx: 3, manualid: '',
                                           cantidad: 1, tipo: 'balde_vacio',
                                           vaciarFactura: true });
  comprobar('id que apunta a factura ajena → no se toca',
            [res.ok, res.ya, rel.enviadas.length], [true, true, 0]);

  // 5. El nodo no contesta: NO puede acabar en "ya estaba quitada".
  rel = relayDePrueba({ porId: {}, porNombre: {} }, new Error('Failed to fetch'));
  res = await rel.quitarDeFactura('0xC', { idx: 1764, manualid: 'balde#1',
                                           cantidad: 1, tipo: 'balde_vacio',
                                           vaciarFactura: true });
  comprobar('nodo caido → error, nunca ya:true',
            [res.ok, res.ya, rel.enviadas.length], [false, false, 0]);

  // 6. Quitar solo una parte de un montón: nunca se borra la factura entera.
  const MONTON = { id: 50, manualId: 'madera#1', owner: '0xjugador',
                   tipo: 'madera', cantidad: 8, active: true };
  rel = relayDePrueba({ porId: { 50: MONTON }, porNombre: {} });
  res = await rel.quitarDeFactura('0xC', { idx: 50, manualid: 'madera#1',
                                           cantidad: 3, tipo: 'madera',
                                           vaciarFactura: false });
  comprobar('quitar parte → decrease de 3', rel.enviadas[0],
            ['decreaseInvoiceQuantity', '50', '3']);

  // 7. Pedir más de lo que hay: se conforma con lo que hay, no revienta.
  rel = relayDePrueba({ porId: { 50: MONTON }, porNombre: {} });
  res = await rel.quitarDeFactura('0xC', { idx: 50, manualid: 'madera#1',
                                           cantidad: 99, tipo: 'madera',
                                           vaciarFactura: false });
  comprobar('pedir de mas → se recorta a lo que hay', rel.enviadas[0],
            ['decreaseInvoiceQuantity', '50', '8']);

  console.log(fallos ? '\n' + fallos + ' PRUEBAS FALLAN' : '\nTodas las pruebas pasan');
  process.exit(fallos ? 1 : 0);
})();
