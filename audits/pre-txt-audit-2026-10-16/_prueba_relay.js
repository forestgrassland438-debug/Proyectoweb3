/* Prueba del camino resistente de quitarDeFactura, sin navegador y sin cadena.
   Se le da a PhaserRelay un doble de `accion` que devuelve la factura que
   queramos (o el error que queramos) y se comprueba QUÉ decide. */
const fs = require('fs');
// Por defecto, la librería que hay al lado: así se ejecuta con solo
// `node _prueba_relay.js`, sin tener que acordarse de la ruta.
const path = process.argv[2] || require('path').join(__dirname, 'phaser-relay-library.js');

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

// ── LA TUPLA DE getInvoice NO SE PUEDE QUEDAR EN EL PRIMER CAMPO ──────────
/* EL FALLO QUE VIGILA — "puedo comprar pero no vender".

   `getInvoice` tiene UNA salida y esa salida es el struct entero. El
   normalizador se quedaba con `out0 = raw[0]` (solo el id) y tiraba el
   manualId, el dueño, el tipo, la cantidad y el `active`. Con eso
   `_leerCamposFactura` devolvía null, y para `quitarDeFactura` eso significa
   "el contrato dice que esa factura no existe": los dos primeros caminos de
   la venta quedaban muertos y todo dependía de poder listar el inventario.

   `out0` tiene que seguir valiendo el id: es lo que leen las COMPRAS para
   saber el número de la factura recién creada. */
const ABI_GET_INVOICE = {
  type: 'function', name: 'getInvoice', stateMutability: 'view',
  inputs: [{ name: '_id', type: 'uint256' }],
  outputs: [{ name: '', type: 'tuple', components: [
    { name: 'id', type: 'uint256' }, { name: 'manualId', type: 'string' },
    { name: 'owner', type: 'address' }, { name: 'tipo', type: 'string' },
    { name: 'cantidad', type: 'uint256' }, { name: 'active', type: 'bool' },
    { name: 'createdAt', type: 'uint256' }
  ] }]
};
const FACTURA_ESPERADA = { id: 1764, manualId: 'zan#1', owner: '0xab',
                           tipo: 'zanahoria_buena', cantidad: 5, activa: true };

// a) como lista plana: lo que manda server2 con ethers v6
const planaNorm = r._normalizeResult(
  ['1764', 'zan#1', '0xAB', 'zanahoria_buena', '5', true, '99'], ABI_GET_INVOICE);
comprobar('tupla plana → la factura entera', r._leerCamposFactura(planaNorm), FACTURA_ESPERADA);
comprobar('y out0 sigue siendo el id (lo leen las compras)', planaNorm.out0, '1764');

// b) como objeto con nombres
const conNombresNorm = r._normalizeResult(
  { id: '1764', manualId: 'zan#1', owner: '0xAB', tipo: 'zanahoria_buena',
    cantidad: '5', active: true, createdAt: '99' }, ABI_GET_INVOICE);
comprobar('tupla con nombres → la factura entera',
  r._leerCamposFactura(conNombresNorm), FACTURA_ESPERADA);

// c) como objeto con claves numéricas
const porIndiceNorm = r._normalizeResult(
  { 0: '1764', 1: 'zan#1', 2: '0xAB', 3: 'zanahoria_buena', 4: '5', 5: true, 6: '99' },
  ABI_GET_INVOICE);
comprobar('tupla por posición → la factura entera',
  r._leerCamposFactura(porIndiceNorm), FACTURA_ESPERADA);

// d) una LISTA de tuplas no es una tupla: se deja pasar tal cual
const ABI_SNAPSHOT = {
  type: 'function', name: 'getUserInventorySnapshot', stateMutability: 'view',
  inputs: [{ name: 'user', type: 'address' }],
  outputs: [{ name: 'result', type: 'tuple[]', components: ABI_GET_INVOICE.outputs[0].components }]
};
comprobar('tuple[] no se toca',
  r._normalizeResult([['1', 'a', '0x1', 't', '2', true, '3']], ABI_SNAPSHOT),
  { result: ['1', 'a', '0x1', 't', '2', true, '3'] });

// ── el camino completo ────────────────────────────────────────────────────
/**
 * @param facturas      { porId, porNombre } lo que contesta getInvoice / ByManualId
 * @param errorLectura  si se pasa, TODA lectura revienta con ese error
 * @param inventario    lo que contesta la funcion de inventario:
 *                        array  → esas son las facturas vivas del jugador
 *                        null   → existe pero NO se puede leer
 * @param sinInventario true = el contrato NO tiene funcion para listar el
 *                      inventario (hay despliegues asi; por eso la pantalla de
 *                      carga trae un plan B). Cambia la decision, asi que hay
 *                      que poder probarlo.
 */
function relayDePrueba(facturas, errorLectura, inventario, sinInventario) {
  const rel = Object.create(PhaserRelay.prototype);
  rel.enviadas = [];
  rel.config = { debug: false };
  rel.contractsCache = new Map();
  rel.checkAuth = async () => ({ success: true, address: '0xJUGADOR'.toLowerCase() });

  /* El ABI decide POR QUE FUNCION se listan las facturas. Un contrato sin
     ninguna es el caso que dejo la tienda sin poder vender. */
  rel.fetchABI = async () => (sinInventario ? [] : [{
    type: 'function', name: 'getUserInventorySnapshot', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'tuple[]' }]
  }]);

  /* El snapshot del inventario, que es la TERCERA vía por la que
     `quitarDeFactura` busca la factura buena cuando el idx y el manualId del
     hueco son basura. `inventario === null` = no se puede leer la cadena. */
  rel._apiRequest = async (ruta, metodo, cuerpo) => {
    if (ruta === '/api/relay/call-view' &&
        cuerpo && cuerpo.functionName === 'getUserInventorySnapshot') {
      if (inventario === null || inventario === undefined) {
        throw new Error('Failed to fetch');
      }
      return { success: true, result: inventario };
    }
    throw new Error('ruta no esperada en la prueba: ' + ruta);
  };
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

  /* 3. YA NO EXISTE — pero eso solo se puede AFIRMAR mirando el inventario.
   *
   *    `ya:true` es lo que autoriza a quien llama a borrar el objeto de la
   *    pantalla sin tocar la cadena. Decirlo porque `getInvoice` revirtió es
   *    justo lo que hacía que se vendieran zanahorias que seguían vivas: el
   *    `idx` del hueco es a menudo el NÚMERO DE HUECO, no un id de factura.
   *
   *    Ahora hay tres respuestas distintas según lo que diga el inventario. */

  // 3a. El inventario confirma que no le queda ninguna de ese tipo: sí se gastó.
  rel = relayDePrueba({ porId: {}, porNombre: {} }, null, []);
  res = await rel.quitarDeFactura('0xC', { idx: 1764, manualid: 'balde#1',
                                           cantidad: 1, tipo: 'balde_vacio',
                                           vaciarFactura: true });
  comprobar('no queda ninguna en la cadena → ya:true sin enviar nada',
            [res.ok, res.ya, rel.enviadas.length], [true, true, 0]);

  // 3b. EL CASO DE LAS ZANAHORIAS. El idx del hueco no vale y el manualId
  //     tampoco, pero el jugador SÍ tiene una factura viva de ese tipo: hay que
  //     encontrarla y quitarle a ELLA, no dar la venta por hecha.
  const DIEZ = { id: 4321, manualId: 'zanahoria#7', owner: '0xjugador',
                 tipo: 'zanahoria_buena', cantidad: 10, active: true };
  rel = relayDePrueba({ porId: {}, porNombre: {} }, null,
                      [{ ...DIEZ, activa: true }]);
  res = await rel.quitarDeFactura('0xC', { idx: 3, manualid: 'zanahoria_buena',
                                           cantidad: 5, tipo: 'zanahoria_buena',
                                           vaciarFactura: false });
  comprobar('idx basura pero la factura existe → se quita de la BUENA',
            [res.ok, res.ya, res.id, rel.enviadas[0]],
            [true, false, 4321, ['decreaseInvoiceQuantity', '4321', '5']]);

  // 3c. En la cadena hay un balde de ese tipo, pero es de OTRO jugador. Eso no
  //     es "mío": para mí no queda ninguno, así que sí se puede cuadrar el
  //     inventario. Y desde luego no se toca la factura ajena.
  rel = relayDePrueba({ porId: {}, porNombre: {} }, null,
                      [{ id: 99, manualId: 'x', owner: '0xotro',
                         tipo: 'balde_vacio', cantidad: 2, activa: true }]);
  res = await rel.quitarDeFactura('0xC', { idx: 1764, manualid: 'balde#1',
                                           cantidad: 1, tipo: 'balde_vacio',
                                           vaciarFactura: true });
  comprobar('una factura de OTRO no cuenta como mía → ya:true y sin tocarla',
            [res.ok, res.ya, rel.enviadas.length], [true, true, 0]);

  // 3d. La funcion existe pero NO se puede leer (nodo caido): no se afirma nada.
  rel = relayDePrueba({ porId: {}, porNombre: {} }, null, null);
  res = await rel.quitarDeFactura('0xC', { idx: 1764, manualid: 'balde#1',
                                           cantidad: 1, tipo: 'balde_vacio',
                                           vaciarFactura: true });
  comprobar('el inventario no se deja leer → error, nunca ya:true',
            [res.ok, res.ya, rel.enviadas.length], [false, false, 0]);

  /* 3e. EL CONTRATO NO SABE LISTAR EL INVENTARIO.
   *
   *    Hay despliegues asi —la pantalla de carga trae un plan B por eso mismo—
   *    y al exigir la comprobacion, NINGUNA venta se confirmaba: "The sale of
   *    Fresh Carrot was not confirmed on-chain", siempre.
   *
   *    Cuando no hay forma de comprobar, se vuelve a la regla de antes: se
   *    acepta "ya se gasto" solo si el contrato lo dijo EXPLICITAMENTE (un
   *    revert). No es peor que lo que habia, y donde si se puede enumerar se
   *    sigue quitando de la factura buena (caso 3b). */
  rel = relayDePrueba({ porId: {}, porNombre: {} }, null, null, true);
  res = await rel.quitarDeFactura('0xC', { idx: 1764, manualid: 'balde#1',
                                           cantidad: 1, tipo: 'balde_vacio',
                                           vaciarFactura: true });
  comprobar('contrato sin listado → se cree al contrato y se cuadra',
            [res.ok, res.ya, rel.enviadas.length], [true, true, 0]);

  /* 3f. Y con ese mismo contrato, una factura VIVA que no es la que se pide
   *    sigue siendo un error: la falta de listado no puede convertirse en
   *    barra libre para dar cosas por gastadas. */
  rel = relayDePrueba({ porId: { 1764: MIA }, porNombre: {} }, null, null, true);
  res = await rel.quitarDeFactura('0xC', { idx: 1764, manualid: 'balde#1',
                                           cantidad: 1, tipo: 'zanahoria_buena',
                                           vaciarFactura: true });
  comprobar('contrato sin listado + factura viva de otro tipo → sigue siendo error',
            [res.ok, res.ya, rel.enviadas.length], [false, false, 0]);

  // 4. EL CASO PELIGROSO: el hueco lleva un numero de hueco (3) que resulta ser
  //    una factura de OTRO jugador y de otro objeto. No se puede tocar.
  //
  //    OJO CON LO QUE SE DEVUELVE: antes esto contestaba `ya: true` ("ya estaba
  //    quitada"), y quien llama entiende eso como "cuadra tu inventario", o sea
  //    BORRA EL OBJETO de la pantalla. Como en la cadena seguia intacto, al
  //    recargar el mapa reaparecia — y en la tienda, encima, ya te habian
  //    pagado. Una factura viva que no es la que buscabas es un ERROR: el
  //    jugador conserva su objeto y no se cobra nada.
  rel = relayDePrueba({ porId: { 3: AJENA }, porNombre: {} });
  res = await rel.quitarDeFactura('0xC', { idx: 3, manualid: '',
                                           cantidad: 1, tipo: 'balde_vacio',
                                           vaciarFactura: true });
  comprobar('id que apunta a factura ajena → error, no "ya quitada"',
            [res.ok, res.ya, rel.enviadas.length], [false, false, 0]);

  // 4-bis. EL FALLO DE LA VENTA EN LA TIENDA (2026-09-07): la factura es MIA y
  //    esta viva, pero se pide con un tipo que no es el suyo — la tienda
  //    mandaba el literal 'slots' en vez del tipo on-chain del objeto. Eso
  //    NUNCA puede leerse como "ya se gasto".
  rel = relayDePrueba({ porId: { 1764: MIA }, porNombre: {} });
  res = await rel.quitarDeFactura('0xC', { idx: 1764, manualid: 'balde#1',
                                           cantidad: 1, tipo: 'slots',
                                           vaciarFactura: true });
  comprobar('tipo equivocado → error, y no se envia nada',
            [res.ok, res.ya, rel.enviadas.length], [false, false, 0]);
  comprobar('y el motivo dice cual es el objeto de verdad',
            /es de otro objeto \(balde_vacio\)/.test(res.error || ''), true);

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

  // 8. TRAS UN FALLO, EL REINTENTO VUELVE A PREGUNTAR A LA CADENA.
  //    `misFacturas` guarda la respuesta unos segundos para no pedirla una vez
  //    por hueco. Esa foto se quedaba puesta tambien al fallar, asi que
  //    reintentar en el acto —lo primero que hace cualquiera— repetia la
  //    respuesta vieja y volvia a fallar aunque la cadena ya hubiera cambiado.
  {
    // El hueco apunta a una factura AJENA: el primer intento tiene que fallar.
    let inventario = [];
    const relCache = relayDePrueba({ porId: { 3: AJENA }, porNombre: {} }, null, inventario);
    let lecturas = 0;
    relCache._apiRequest = async (ruta, metodo, cuerpo) => {
      if (cuerpo && cuerpo.functionName === 'getUserInventorySnapshot') {
        lecturas++;
        return { success: true, result: inventario };
      }
      throw new Error('ruta no esperada en la prueba: ' + ruta);
    };

    const r1 = await relCache.quitarDeFactura('0xC', { idx: 3, manualid: 'otro#1',
                                                       cantidad: 1, tipo: 'madera',
                                                       vaciarFactura: false });
    comprobar('primer intento con factura ajena → error', [r1.ok, r1.ya], [false, false]);

    // La cadena cambia (otra pestaña, una misión, la propia tx que sí entró) y
    // el jugador reintenta EN EL ACTO. Sin tirar la foto, volvería a fallar.
    inventario = [[77, 'mad#1', '0xjugador', 'madera', 4, true, 1]];
    const antes = lecturas;
    const r2 = await relCache.quitarDeFactura('0xC', { idx: 3, manualid: 'otro#1',
                                                       cantidad: 1, tipo: 'madera',
                                                       vaciarFactura: false });
    comprobar('el reintento vuelve a leer la cadena', lecturas > antes, true);
    comprobar('y encuentra la factura buena', [r2.ok, r2.ya], [true, false]);
    comprobar('y quita de ELLA, no de la ajena', relCache.enviadas[0],
              ['decreaseInvoiceQuantity', '77', '1']);
  }

  console.log(fallos ? '\n' + fallos + ' PRUEBAS FALLAN' : '\nTodas las pruebas pasan');
  process.exit(fallos ? 1 : 0);
})();
