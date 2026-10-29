'use strict';
/* (2026-10-26) Lo nuevo del estudio de colecciones (backend-collections):
 *   "no puedo eliminar la colección y todos sus NFT, ni un NFT, ni cambiarle la
 *   imagen, ni cambiar las imágenes de todos según su id; un botón para hacerla
 *   pública o privada; ver quiénes son los propietarios con su nombre del
 *   juego; perfil y portada de la colección", y el juego leyendo las públicas.
 * El módulo REAL contra un Mongo en memoria. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ethers } = require('ethers');
const { mountCollections, ABI } = require('../backend-collections/collections.cjs');

const ADMIN = '0x1111111111111111111111111111111111111111';
const BOB = '0x2222222222222222222222222222222222222222';
const CONTRACT = '0x3333333333333333333333333333333333333333';
const SCOPE = '4441:' + CONTRACT;

/** Un Mongo de mentira: lo justo que usa el módulo. */
function memoria() {
  const tablas = {};
  const casa = (doc, q) => Object.entries(q || {}).every(([k, v]) => {
    if (k === '$or') return v.some((x) => casa(doc, x));
    const d = doc[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if ('$ne' in v) return d !== v.$ne;
      if ('$in' in v) return v.$in.includes(d) || (Array.isArray(d) && d.some((x) => v.$in.includes(x)));
      if ('$exists' in v) return (d !== undefined) === v.$exists;
      if ('$lte' in v) return d <= v.$lte;
      if ('$gt' in v) return d > v.$gt;
    }
    return Array.isArray(d) ? d.includes(v) : d === v;
  });
  const cursor = (filas) => {
    const c = { _f: filas, sort() { return c; }, limit(n) { c._f = c._f.slice(0, n); return c; }, select() { return c; }, skip() { return c; },
                lean: async () => c._f.map((x) => ({ ...x })), then: (ok, ko) => Promise.resolve(c._f.map((x) => ({ ...x }))).then(ok, ko) };
    return c;
  };
  const uno = (fila) => ({ lean: async () => (fila ? { ...fila } : null), select() { return this; }, then: (ok, ko) => Promise.resolve(fila ? { ...fila } : null).then(ok, ko) });
  const aplicar = (doc, u) => {
    for (const [k, v] of Object.entries(u.$set || {})) doc[k] = v;
    for (const [k, v] of Object.entries(u.$inc || {})) doc[k] = (doc[k] || 0) + v;
  };
  const modelo = (nombre) => {
    const t = tablas[nombre] = [];
    return {
      _t: t,
      find: (q) => cursor(t.filter((d) => casa(d, q))),
      findOne: (q) => uno(t.find((d) => casa(d, q))),
      exists: async (q) => (t.some((d) => casa(d, q)) ? { _id: 1 } : null),
      countDocuments: async (q) => t.filter((d) => casa(d, q)).length,
      create: async (doc) => { const d = { ...doc }; t.push(d); return { ...d, toObject: () => ({ ...d }) }; },
      insertMany: async (docs) => docs.map((d) => { t.push({ ...d }); return { ...d }; }),
      deleteOne: async (q) => { const i = t.findIndex((d) => casa(d, q)); if (i >= 0) t.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; },
      deleteMany: async (q) => { let n = 0; for (let i = t.length - 1; i >= 0; i--) if (casa(t[i], q)) { t.splice(i, 1); n++; } return { deletedCount: n }; },
      updateOne: async (q, u) => { const d = t.find((x) => casa(x, q)); if (d) aplicar(d, u); return { matchedCount: d ? 1 : 0, modifiedCount: d ? 1 : 0 }; },
      updateMany: async (q, u) => { const ds = t.filter((x) => casa(x, q)); ds.forEach((d) => aplicar(d, u)); return { matchedCount: ds.length, modifiedCount: ds.length }; },
      findOneAndUpdate: (q, u, o) => {
        let d = t.find((x) => casa(x, q));
        if (!d && o && o.upsert) { d = { ...(u.$setOnInsert || {}) }; t.push(d); }
        else if (d) aplicar(d, u);
        return uno(d);
      },
      createIndexes: async () => {}
    };
  };
  const nombres = ['GFNftCollection', 'GFNftToken', 'GFNftImage', 'GFNftOperation', 'GFNftHistory', 'GFNftRoyaltyPayment', 'GFNftScan'];
  const models = Object.fromEntries(nombres.map((n) => [n, modelo(n)]));
  return { mongoose: { models, Schema: { Types: { Mixed: Object } }, connection: { readyState: 1 } }, models };
}

function montar(opciones = {}) {
  const rutas = new Map();
  const app = { use() {}, get: (p, h) => rutas.set('GET ' + p, h), post: (p, h) => rutas.set('POST ' + p, h), patch: (p, h) => rutas.set('PATCH ' + p, h) };
  const mem = memoria();
  const invoices = opciones.invoices || {};
  class Contract {
    async isAdmin() { return true; } async owner() { return ADMIN; }
    async getTipoStats() { return { exists: true, totalQuantity: 0n, perInvoiceLimit: 1n, limit: 10n }; }
    async getInvoice(id) { return invoices[String(id)]; }
  }
  const nada = (req, res, next) => next();
  mountCollections({ app, mongoose: mem.mongoose, ethers: { ...ethers, Contract }, provider: { send: async () => '0x1159' },
                     contractAddress: CONTRACT, chainId: 4441, adminAuth: nada, csrfProtection: nada,
                     resolveOwners: opciones.resolveOwners });
  const llamar = async (clave, params = {}, body = {}) => {
    const res = { statusCode: 200, body: null, headersSent: false, status(v) { this.statusCode = v; return this; }, set() { return this; }, json(v) { this.body = v; return this; } };
    await rutas.get(clave)({ params, body, query: {}, collectionsActor: ADMIN, collectionsIsSystemOwner: true, admin: { address: ADMIN } }, res);
    return res;
  };
  return { llamar, m: mem.models };
}

function sembrar(m, { emitidas = [] } = {}) {
  m.GFNftCollection._t.push({ scope: SCOPE, id: 'col1', name: 'Guardianes', status: 'active', limit: '100', nextNumber: 3, typeKey: 'col:col1', delegate: '', royaltyBps: 0, avatarImageId: 'imgA', coverImageId: '' });
  for (const id of ['imgA', 'img1', 'img2', 'img3', 'imgNueva']) m.GFNftImage._t.push({ scope: SCOPE, id });
  [1, 2, 3].forEach((n) => m.GFNftToken._t.push({ scope: SCOPE, id: 't' + n, number: n, collectionId: 'col1', imageId: 'img' + n,
    imageUrl: '/api/collections/images/img' + n, status: 'active', invoiceId: emitidas.includes(n) ? String(100 + n) : '',
    manualId: emitidas.includes(n) ? 'nft:t' + n + ':x' : '', owner: emitidas.includes(n) ? BOB : '', chainActive: emitidas.includes(n), pendingMintOperation: '' }));
}

test('pública/privada, perfil y portada: se guardan y solo con imágenes ya subidas', async () => {
  const { llamar, m } = montar();
  sembrar(m);
  let r = await llamar('PATCH /api/admin/collections/:id', { id: 'col1' }, { visibility: 'public', coverImageId: 'img1' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.collection.visibility, 'public');
  assert.equal(r.body.collection.coverUrl, '/api/collections/images/img1');
  r = await llamar('PATCH /api/admin/collections/:id', { id: 'col1' }, { visibility: 'secreta' });
  assert.equal(r.body.error, 'invalid_visibility');
  r = await llamar('PATCH /api/admin/collections/:id', { id: 'col1' }, { avatarImageId: 'noExiste' });
  assert.equal(r.body.error, 'image_not_found');
  // Quitar el perfil: su imagen ya no la usa nadie y se borra.
  r = await llamar('PATCH /api/admin/collections/:id', { id: 'col1' }, { avatarImageId: '' });
  assert.equal(r.body.collection.avatarUrl, '');
  assert.ok(!m.GFNftImage._t.some((i) => i.id === 'imgA'));
  // Una colección nueva nace privada.
  r = await llamar('POST /api/admin/collections', {}, { name: 'Nueva' });
  assert.equal(r.statusCode, 201);
  assert.equal(r.body.collection.visibility, 'private');
  const bootstrap = await llamar('GET /api/admin/collections/bootstrap');
  for (const k of ['visibility', 'collectionImages', 'deletes', 'burn', 'bulkImages', 'owners']) assert.equal(bootstrap.body.capabilities[k], true, k);
});

test('borrar una pieza: sin emitir directo; emitida, solo con force; su imagen se va si nadie la usa', async () => {
  const { llamar, m } = montar();
  sembrar(m, { emitidas: [2] });
  let r = await llamar('POST /api/admin/collections/tokens/:id/delete', { id: 't1' }, {});
  assert.equal(r.statusCode, 200);
  assert.ok(!m.GFNftToken._t.some((t) => t.id === 't1'));
  assert.ok(!m.GFNftImage._t.some((i) => i.id === 'img1'));
  r = await llamar('POST /api/admin/collections/tokens/:id/delete', { id: 't2' }, {});
  assert.equal(r.statusCode, 409);
  assert.equal(r.body.error, 'token_on_chain');
  r = await llamar('POST /api/admin/collections/tokens/:id/delete', { id: 't2' }, { force: true });
  assert.equal(r.statusCode, 200);
  assert.equal(m.GFNftToken._t.length, 1);
});

test('borrar la colección: pide su nombre; con piezas en carteras pide force; borra piezas, imágenes y operaciones', async () => {
  const { llamar, m } = montar();
  sembrar(m, { emitidas: [3] });
  m.GFNftOperation._t.push({ scope: SCOPE, id: 'op1', collectionId: 'col1', status: 'prepared' });
  let r = await llamar('POST /api/admin/collections/:id/delete', { id: 'col1' }, { confirm: 'Otro nombre' });
  assert.equal(r.body.error, 'confirm_mismatch');
  r = await llamar('POST /api/admin/collections/:id/delete', { id: 'col1' }, { confirm: 'Guardianes' });
  assert.equal(r.statusCode, 409);
  assert.equal(r.body.error, 'collection_on_chain');
  r = await llamar('POST /api/admin/collections/:id/delete', { id: 'col1' }, { confirm: 'Guardianes', force: true });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.tokens, 3);
  assert.equal(m.GFNftCollection._t.length, 0);
  assert.equal(m.GFNftToken._t.length, 0);
  assert.equal(m.GFNftOperation._t[0].status, 'superseded');
  assert.deepEqual(m.GFNftImage._t.map((i) => i.id), ['imgNueva'], 'solo queda la imagen que nadie usaba ni se tocó');
});

test('imágenes por número y una para todas; los números que no existen se devuelven', async () => {
  const { llamar, m } = montar();
  sembrar(m);
  let r = await llamar('POST /api/admin/collections/:id/token-images', { id: 'col1' }, { items: [{ number: 2, imageId: 'imgNueva' }, { number: 9, imageId: 'imgNueva' }] });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.updated, 1);
  assert.deepEqual(r.body.missing, [9]);
  assert.equal(m.GFNftToken._t.find((t) => t.number === 2).imageUrl, '/api/collections/images/imgNueva');
  assert.ok(!m.GFNftImage._t.some((i) => i.id === 'img2'), 'la vieja ya no la usa nadie');
  r = await llamar('POST /api/admin/collections/:id/token-images', { id: 'col1' }, { items: [{ number: 1, imageId: 'x' }, { number: 1, imageId: 'x' }] });
  assert.equal(r.body.error, 'duplicate_number');
  r = await llamar('POST /api/admin/collections/:id/token-images', { id: 'col1' }, { imageId: 'imgA' });
  assert.equal(r.body.updated, 3);
  assert.ok(m.GFNftToken._t.every((t) => t.imageId === 'imgA'));
});

test('propietarios: cartera, nombre en el juego y usuario de quien tiene cada pieza', async () => {
  const { llamar, m } = montar({ resolveOwners: async (w) => ({ [w[0]]: { playerName: 'Bobby', username: 'bob_gf' } }) });
  sembrar(m, { emitidas: [1, 3] });
  const r = await llamar('GET /api/admin/collections/:id/owners', { id: 'col1' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.total, 3);
  const t1 = r.body.tokens.find((t) => t.number === 1);
  assert.equal(t1.owner, BOB); assert.equal(t1.playerName, 'Bobby'); assert.equal(t1.username, 'bob_gf');
  assert.equal(t1.imageUrl, '/api/collections/images/img1');
  assert.equal(r.body.tokens.find((t) => t.number === 2).owner, '', 'sin emitir: sin dueño');
  assert.deepEqual(r.body.owners, [{ address: BOB, playerName: 'Bobby', username: 'bob_gf', count: 2 }]);
});

test('quemar una pieza emitida: prepara deleteInvoice y el recibo con InvoiceDeleted la da por quemada', async () => {
  const { llamar, m } = montar({ invoices: { 102: { active: true, tipo: 'col:col1', manualId: 'nft:t2:x', owner: BOB, cantidad: 1n } } });
  sembrar(m, { emitidas: [2] });
  const r = await llamar('POST /api/admin/collections/prepare', {}, { action: 'burn', tokenId: 't2' });
  assert.equal(r.statusCode, 201);
  assert.equal(r.body.method, 'deleteInvoice');
  assert.deepEqual(r.body.args, ['102']);
  const op = m.GFNftOperation._t[0];
  assert.equal(op.data, new ethers.Interface(ABI).encodeFunctionData('deleteInvoice', ['102']));
  // Una pieza sin emitir no se quema.
  const r2 = await llamar('POST /api/admin/collections/prepare', {}, { action: 'burn', tokenId: 't1' });
  assert.equal(r2.body.error, 'not_minted');
});

test('el juego lee las colecciones PÚBLICAS con las piezas de la cartera; el panel las pinta con su imagen', () => {
  const SRV = process.env.SERVIDOR || 'C:/Users/pc/Desktop/server2.js';
  if (fs.existsSync(SRV)) {
    const s = fs.readFileSync(SRV, 'utf8').replace(/\r\n/g, '\n');
    assert.match(s, /async function gfNftColeccionesPublicas\(address\) \{/);
    assert.match(s, /Col\.find\(\{ scope, visibility: 'public', status: 'active' \}\)/);
    assert.match(s, /return res\.json\(\{ ok: true, configurada: false, coleccion, address, tokens: \[\], colecciones \}\);/);
    assert.match(s, /resolveOwners: async wallets =>/);
  }
  const js = fs.readFileSync(path.join(__dirname, '..', 'gf-nft.js'), 'utf8');
  assert.match(js, /\/\^\\\/api\\\/collections\\\/images\\\/\[A-Za-z0-9_-\]\{1,80\}\$\//, 'solo rutas de imagen del estudio');
  assert.match(js, /registro\.forEach\(function \(c\) \{ lista\.appendChild\(seccionColeccion\(esc\.serverBase, c\)\); \}\);/);
});
