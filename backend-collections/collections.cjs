'use strict';

// Metadata/policy registry for InvoiceSystem. No private key, signer or destructive
// invoice method is used here. Wallets sign every chain write in the browser.
const crypto = require('node:crypto');
const ZERO = '0x0000000000000000000000000000000000000000';
const PREFIX = '/api/admin/collections';
const ABI = [
  'function owner() view returns (address)',
  'function isAdmin(address) view returns (bool)',
  'function setLimit(string _tipo,uint256 _limit,uint256 _perInvoiceLimit)',
  'function createInvoice(address _owner,string _tipo,uint256 _cantidad,string _manualId) returns (uint256)',
  'function transferInvoice(address _fromOwner,address _toOwner,uint256 _id,uint256 _amount,string _newManualId) returns (uint256)',
  // (2026-10-26) Quemar una pieza emitida antes de borrarla del registro. La firma
  // la hace la cartera admin en el navegador, como todas las demás.
  'function deleteInvoice(uint256 _id)',
  'function getInvoice(uint256) view returns ((uint256 id,string manualId,address owner,string tipo,uint256 cantidad,bool active,uint256 createdAt))',
  'function getTipoStats(string) view returns (uint256 totalQuantity,uint256 limit,uint256 perInvoiceLimit,uint256 invoiceCount,uint256 totalBurned,bool exists)',
  'event InvoiceCreated(uint256 indexed id,string manualId,address indexed owner,string indexed tipo,uint256 cantidad,uint256 createdAt)',
  'event InvoiceTransferred(uint256 indexed originalId,uint256 newId,address indexed from,address indexed to,uint256 amount)',
  'event InvoiceDeleted(uint256 indexed id,string manualId)',
  'event InvoiceQuantityIncreased(uint256 indexed id,uint256 increaseAmount,uint256 newCantidad)',
  'event InvoiceQuantityDecreased(uint256 indexed id,uint256 decreaseAmount,uint256 newCantidad)',
  'event InvoiceQuantityMoved(uint256 indexed fromId,uint256 indexed toId,uint256 amount)',
  'event TipoLimitSet(string tipo,uint256 limit,uint256 perInvoiceLimit)'
];
const STATES = new Set(['active', 'suspended', 'blocked', 'deleted']);
// (2026-10-26) Pública = el juego la enseña en el panel NFT; privada = solo el panel.
const VISIBILITY = new Set(['public', 'private']);
const MAX_IMAGE = 600000;
const MAX_ATTRIBUTES = 200;
const LIMITS = Object.freeze({ collections: 250, tokens: 1000, history: 2000, royaltyPayments: 1000, operations: 100, images: MAX_IMAGE, attributes: MAX_ATTRIBUTES, batch: 100, scanBlocks: 1500 });
class PanelError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function fail(status, code, message) { throw new PanelError(status, code, message); }
function object(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'invalid_body', 'Se esperaba un objeto JSON.');
  return input;
}
function keys(input, allowed) {
  object(input);
  if (Object.keys(input).some(k => !allowed.includes(k))) fail(400, 'unknown_field', 'La solicitud contiene campos no permitidos.');
}
function string(value, max, name, required = false) {
  if (value === undefined || value === null) { if (required) fail(400, 'missing_field', `Falta ${name}.`); return ''; }
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(400, 'invalid_field', `${name} no es válido (máximo ${max} caracteres).`);
  const clean = value.trim();
  if (required && !clean) fail(400, 'missing_field', `Falta ${name}.`);
  return clean;
}
function id(value) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(String(value || ''))) fail(400, 'invalid_id', 'Identificador inválido.');
  return String(value);
}
function address(value, nullable = false) {
  if (nullable && (value === '' || value === undefined || value === null)) return '';
  if (typeof value !== 'string' || !/^0x[0-9a-f]{40}$/i.test(value) || value.toLowerCase() === ZERO) fail(400, 'invalid_address', 'Dirección de cartera inválida.');
  return value.toLowerCase();
}
function uint(value, name, maximum = (1n << 256n) - 1n) {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^(0|[1-9]\d*)$/.test(String(value)) || (typeof value === 'number' && !Number.isSafeInteger(value))) fail(400, 'invalid_uint', `${name} debe ser un entero positivo.`);
  const n = BigInt(value);
  if (n < 1n || n > maximum) fail(400, 'invalid_uint', `${name} está fuera del rango permitido.`);
  return n.toString();
}
function bps(value, nullable = false) {
  if (nullable && (value === null || value === '' || value === undefined)) return null;
  const n = typeof value === 'number' ? value : /^\d{1,5}$/.test(String(value)) ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > 10000) fail(400, 'invalid_royalty', 'El royalty debe estar entre 0 y 10000 puntos básicos.');
  return n;
}
function state(value) { if (!STATES.has(value)) fail(400, 'invalid_status', 'Estado no válido.'); return value; }
function visibility(value) { if (!VISIBILITY.has(value)) fail(400, 'invalid_visibility', 'La visibilidad debe ser pública o privada.'); return value; }
function attributes(value = []) {
  if (!Array.isArray(value) || value.length > MAX_ATTRIBUTES) fail(400, 'invalid_attributes', `Se admiten hasta ${MAX_ATTRIBUTES} atributos por NFT.`);
  return value.map(a => {
    keys(a, ['trait_type', 'value']);
    const v = typeof a.value === 'number' && Number.isFinite(a.value) ? String(a.value) : a.value;
    return { trait_type: string(a.trait_type, 100, 'atributo', true), value: string(v, 500, 'valor', true) };
  });
}
function imageData(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length > 801000) fail(400, 'image_too_large', 'La imagen debe pesar como máximo 600 KB.');
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || match[2].length % 4 !== 0) fail(400, 'invalid_image', 'Usa una imagen PNG, JPEG, WebP o GIF en base64.');
  const data = Buffer.from(match[2], 'base64');
  if (!data.length || data.length > MAX_IMAGE || data.toString('base64') !== match[2]) fail(400, 'invalid_image', 'La imagen está vacía, dañada o supera 600 KB.');
  const mime = match[1];
  const valid = mime === 'png' ? data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
    mime === 'jpeg' ? data.length > 4 && data[0] === 255 && data[1] === 216 && data[2] === 255 :
    mime === 'gif' ? /^(GIF87a|GIF89a)$/.test(data.subarray(0, 6).toString('ascii')) :
    data.length > 12 && data.subarray(0,4).toString('ascii') === 'RIFF' && data.subarray(8,12).toString('ascii') === 'WEBP';
  if (!valid) fail(400, 'invalid_image_signature', 'El contenido no coincide con el formato de imagen.');
  return { data, mime: `image/${mime}`, digest: crypto.createHash('sha256').update(data).digest('hex') };
}
function hash(value) { if (!/^0x[0-9a-f]{64}$/i.test(String(value || ''))) fail(400, 'invalid_hash', 'Hash de transacción inválido.'); return value.toLowerCase(); }
function safeInteger(value, name) { const n = Number(value); if (!Number.isSafeInteger(n) || n < 0) fail(400, 'invalid_number', `${name} no es válido.`); return n; }
function plain(doc) { if (!doc) return null; const p = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc }; delete p._id; delete p.__v; delete p.scope; delete p.data; return p; }
function actor(req) { return address(req.admin && req.admin.address || req.user && req.user.address); }
function same(a, b) { return String(a || '').toLowerCase() === String(b || '').toLowerCase(); }
function parsedLogs(iface, receipt, contractAddress) {
  return (receipt.logs || []).filter(l => same(l.address, contractAddress)).map(l => { try { return { event: iface.parseLog(l), raw: l }; } catch (_) { return null; } }).filter(x => x && x.event);
}
async function verifyReceipt({ provider, iface, contractAddress, chainId, operation, txHash, confirmations = 1 }) {
  const actualChain = await provider.send('eth_chainId', []);
  if (BigInt(actualChain) !== BigInt(chainId)) fail(503, 'wrong_rpc_chain', 'El RPC está conectado a otra red.');
  const [tx, receipt, latest] = await Promise.all([provider.getTransaction(txHash), provider.getTransactionReceipt(txHash), provider.getBlockNumber()]);
  if (!tx || !receipt) fail(409, 'transaction_pending', 'La transacción todavía no tiene recibo.');
  if (Number(receipt.status) !== 1) fail(409, 'transaction_failed', 'La transacción revirtió.');
  if(!same(tx.hash,txHash)||!same(receipt.hash||receipt.transactionHash,txHash))fail(409,'transaction_hash_mismatch','El RPC devolvió un recibo de otra transacción.');
  if (!same(tx.to, contractAddress) || !same(receipt.to, contractAddress) || !same(tx.from, operation.actor) || !same(receipt.from, operation.actor) || BigInt(tx.chainId) !== BigInt(chainId)) fail(409, 'transaction_mismatch', 'La cuenta, contrato o red no corresponde a la operación preparada.');
  if (!same(tx.data, operation.data) || BigInt(tx.value || 0) !== 0n) fail(409, 'transaction_input_mismatch', 'La llamada firmada no corresponde exactamente a la operación preparada.');
  if (Number(latest) - Number(receipt.blockNumber) + 1 < confirmations) fail(409, 'transaction_unconfirmed', 'Espera más confirmaciones antes de registrar la operación.');
  const canonical = await provider.getBlock(receipt.blockNumber);
  if (!canonical || !same(canonical.hash, receipt.blockHash)) fail(409, 'transaction_reorganized', 'El recibo ya no pertenece a la cadena canónica.');
  const events = parsedLogs(iface, receipt, contractAddress);
  let found;
  if (operation.action === 'configure') {
    found = events.find(x => x.event.name === 'TipoLimitSet' && x.event.args.tipo === operation.typeKey && String(x.event.args.limit) === operation.args[1] && String(x.event.args.perInvoiceLimit) === '1');
  } else if (operation.action === 'mint') {
    found = events.find(x => x.event.name === 'InvoiceCreated' && x.event.args.manualId === operation.manualId && same(x.event.args.owner, operation.toWallet) && String(x.event.args.cantidad) === '1' && same(x.event.args.tipo.hash, iface.getEvent('InvoiceCreated') && operation.typeHash));
  } else if (operation.action === 'burn') {
    found = events.find(x => x.event.name === 'InvoiceDeleted' && String(x.event.args.id) === operation.invoiceId && x.event.args.manualId === operation.manualId);
  } else {
    found = events.find(x => x.event.name === 'InvoiceTransferred' && String(x.event.args.originalId) === operation.invoiceId && same(x.event.args.from, operation.fromWallet) && same(x.event.args.to, operation.toWallet) && String(x.event.args.amount) === '1');
    if (found && !events.some(x => x.event.name === 'InvoiceCreated' && String(x.event.args.id) === String(found.event.args.newId) && x.event.args.manualId === operation.manualId && same(x.event.args.owner, operation.toWallet) && String(x.event.args.cantidad) === '1' && same(x.event.args.tipo.hash, operation.typeHash))) found = null;
  }
  if (!found) fail(409, 'transaction_event_mismatch', 'El recibo no contiene el resultado esperado del contrato.');
  const ambiguous=operation.action==='transfer'&&!events.some(x=>x.event.name==='InvoiceDeleted'&&String(x.event.args.id)===operation.invoiceId);
  return { receipt, event: found.event, ambiguous, logIndex: Number(found.raw.index ?? found.raw.logIndex ?? 0), timestamp: new Date(Number(canonical.timestamp) * 1000).toISOString() };
}
async function verifyNativeRoyalty({provider,chainId,txHash,receiver,amountWei,confirmations=2}){
  if(BigInt(await provider.send('eth_chainId',[]))!==BigInt(chainId))fail(503,'wrong_rpc_chain','El RPC está conectado a otra red.');
  const [tx,receipt,latest]=await Promise.all([provider.getTransaction(txHash),provider.getTransactionReceipt(txHash),provider.getBlockNumber()]);
  if(!tx||!receipt)fail(409,'transaction_pending','El pago todavía no tiene un recibo confirmado.');
  if(Number(receipt.status)!==1)fail(409,'transaction_failed','La transacción de pago revirtió.');
  if(!same(tx.hash,txHash)||!same(receipt.hash||receipt.transactionHash,txHash))fail(409,'transaction_hash_mismatch','El RPC devolvió otra transacción.');
  if(BigInt(tx.chainId)!==BigInt(chainId)||!same(tx.to,receiver)||!same(receipt.to,receiver)||!same(tx.from,receipt.from))fail(409,'royalty_payment_mismatch','La red, la cartera receptora o el pagador no coinciden con el recibo.');
  const payer=address(tx.from);
  if(BigInt(tx.value||0)!==BigInt(amountWei)||!['0x',''].includes(tx.data))fail(409,'royalty_amount_mismatch','El importe debe ser exactamente el royalty calculado y el envío nativo debe tener datos vacíos.');
  if(Number(latest)-Number(receipt.blockNumber)+1<confirmations)fail(409,'transaction_unconfirmed','Espera más confirmaciones del pago.');
  const block=await provider.getBlock(receipt.blockNumber);
  if(!block||!same(block.hash,receipt.blockHash))fail(409,'transaction_reorganized','El recibo ya no pertenece a la cadena canónica.');
  return {from:payer,to:receiver,blockNumber:Number(receipt.blockNumber),timestamp:new Date(Number(block.timestamp)*1000).toISOString()};
}

function mountCollections(deps) {
  const { app, mongoose, ethers, provider, adminAuth, csrfProtection } = deps;
  if (!app || !mongoose || !ethers || !provider || !adminAuth || !csrfProtection) throw new TypeError('Collections dependencies incomplete');
  const contractAddress = address(deps.contractAddress);
  const chainId = safeInteger(deps.chainId, 'chainId');
  let explorerUrl='';
  if(deps.explorerUrl){const parsed=new URL(String(deps.explorerUrl));if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new TypeError('Invalid collections explorer URL');parsed.hash='';parsed.search='';explorerUrl=parsed.toString().replace(/\/$/,'');}
  const scope = `${chainId}:${contractAddress}`;
  const iface = new ethers.Interface(ABI);
  const contract = new ethers.Contract(contractAddress, ABI, provider);
  const confirmations = Math.max(1, Math.min(20, Number(deps.confirmations) || 2));
  const model = (name, definition, indexes = []) => {
    if (mongoose.models[name]) return mongoose.models[name];
    const schema = new mongoose.Schema({ scope: { type: String, required: true, index: true }, ...definition }, { minimize: false, strict: 'throw', versionKey: false });
    schema.index({ scope: 1, id: 1 }, { unique: true });
    for (const [fields, options] of indexes) schema.index(fields, options);
    return mongoose.model(name, schema);
  };
  const Collection = model('GFNftCollection', { id: String, name: String, description: String, symbol: String, delegate: String, royaltyBps: Number, royaltyReceiver: String, status: String, typeKey: String, limit: String, configuredLimit: String, configured: Boolean, nextNumber: { type: Number, default: 0 },
    // (2026-10-26) Pública/privada para el panel NFT del juego, y su imagen de perfil y portada.
    visibility: { type: String, default: 'private' }, avatarImageId: String, avatarUrl: String, coverImageId: String, coverUrl: String,
    createdAt: String, updatedAt: String }, [[{ scope: 1, typeKey: 1 }, { unique: true }]]);
  const Token = model('GFNftToken', { id: String, number: Number, collectionId: { type: String, index: true }, name: String, description: String, imageId: String, imageUrl: String, attributes: [{ _id: false, trait_type: String, value: String }], status: String, royaltyBps: { type: Number, default: null }, royaltyReceiver: String, invoiceId: String, invoiceIds: [String], manualId: String, pendingMintOperation: String, owner: String, chainActive: Boolean, chainQuantity: String, chainWarning: String, chainAmbiguous: Boolean, lastChainBlock: { type: Number, default: 0 }, lastChainIndex: { type: Number, default: -1 }, createdAt: String, updatedAt: String }, [[{ scope: 1, collectionId: 1, number: 1 }, { unique: true }], [{ scope: 1, invoiceIds: 1 }, {}]]);
  const Image = model('GFNftImage', { id: String, data: Buffer, mime: String, digest: String, createdAt: String }, [[{ scope: 1, digest: 1 }, { unique: true }]]);
  const Operation = model('GFNftOperation', { id: String, actor: String, action: String, collectionId: String, tokenId: String, method: String, args: [String], data: String, typeKey: String, typeHash: String, manualId: String, invoiceId: String, fromWallet: String, toWallet: String, status: String, txHash: { type: String }, result: mongoose.Schema.Types.Mixed, createdAt: String, confirmedAt: String }, [[{ scope: 1, txHash: 1 }, { unique: true, partialFilterExpression: { txHash: { $type: 'string' } } }]]);
  const History = model('GFNftHistory', { id: String, tokenId: String, number: Number, collectionId: String, from: String, to: String, txHash: String, blockNumber: Number, logIndex: Number, timestamp: String, kind: String, invoiceId: String, previousInvoiceId: String });
  const Payment=model('GFNftRoyaltyPayment',{id:String,tokenId:String,collectionId:String,txHash:String,from:String,to:String,amountWei:String,amount:String,currency:String,decimals:Number,status:String,verified:Boolean,timestamp:String,blockNumber:Number,saleAmountWei:String,royaltyBps:Number,recordedBy:String,recordedAt:String},[[{scope:1,txHash:1},{unique:true}]]);
  const Scan = model('GFNftScan', { id: String, cursor: Number, startBlock: Number, latest: Number, lockedUntil: Date, lockId: String, startedAt: String, updatedAt: String, historicalIncomplete: Boolean });
  const catalogs={
    collections:{model:Collection,sort:{createdAt:-1,id:1}},
    tokens:{model:Token,sort:{createdAt:-1,number:1,id:1}},
    history:{model:History,sort:{blockNumber:-1,logIndex:-1,id:1}},
    royaltyPayments:{model:Payment,sort:{blockNumber:-1,id:1}}
  };
  let indexesReady;
  const ensureIndexes=()=>{
    if(!indexesReady)indexesReady=Promise.all([Collection,Token,Image,Operation,History,Payment,Scan].map(m=>typeof m.createIndexes==='function'?m.createIndexes():Promise.resolve())).catch(error=>{indexesReady=null;throw error;});
    return indexesReady;
  };
  const query = extra => ({ scope, ...extra });
  const route = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (error) {
      if (res.headersSent) return;
      if (error instanceof PanelError) return res.status(error.status).json({ error: error.code, message: error.message });
      if (error && error.code === 11000) return res.status(409).json({ error: 'conflict', message: 'El registro ya existe o la transacción ya está asignada. Vuelve a cargar el panel.' });
      if (deps.onError) deps.onError(error);
      res.status(503).json({ error: 'collections_unavailable', message: 'No se pudo consultar la base de datos o la cadena. La operación no se marcó como completada; puedes reintentar.' });
    }
  };
  const authorization = route(async (req, res) => {
    if (mongoose.connection && mongoose.connection.readyState !== 1) fail(503, 'database_unavailable', 'La base de datos no está conectada.');
    await ensureIndexes();
    let who;
    try { who = actor(req); } catch (_) { fail(403, 'wallet_session_required', 'Inicia sesión con la firma de una cartera administradora.'); }
    // getNetwork() can return the configured static network without querying
    // RPC. Explicit eth_chainId is required to fail closed on a wrong endpoint.
    const actualChain = await provider.send('eth_chainId', []);
    if (BigInt(actualChain) !== BigInt(chainId)) fail(503, 'wrong_rpc_chain', 'El RPC está conectado a una red incorrecta.');
    const [allowed, owner] = await Promise.all([contract.isAdmin(who), contract.owner()]);
    if (allowed !== true) fail(403, 'onchain_admin_required', 'Esta cartera no es administradora en el contrato.');
    req.collectionsActor = who;
    req.collectionsSystemOwner = address(owner);
    req.collectionsIsSystemOwner = same(who, owner);
    req.collectionsNext();
  });
  const auth = (req, res, next) => { req.collectionsNext = next; return authorization(req, res); };
  const noCache = (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
  const limits = deps.apiLimiter ? [deps.apiLimiter] : [];
  app.use(PREFIX, ...limits, adminAuth, csrfProtection, noCache, auth);
  const getCollection = async value => { const c = await Collection.findOne(query({ id: id(value) })).lean(); if (!c) fail(404, 'collection_not_found', 'La colección no existe.'); return c; };
  const getToken = async value => { const t = await Token.findOne(query({ id: id(value) })).lean(); if (!t) fail(404, 'token_not_found', 'El NFT no existe.'); return t; };
  const collectionWrite=(req,collection)=>{
    if(!collection.delegate||req.collectionsIsSystemOwner||same(collection.delegate,req.collectionsActor))return;
    fail(403,'collection_delegate_required','Esta colección tiene un administrador delegado. Solo él y el dueño del sistema pueden modificarla desde el panel.');
  };
  const active = (c, t) => {
    if (c.status !== 'active' || t && t.status !== 'active') fail(409, 'policy_restricted', 'Activa la colección y el NFT antes de emitirlo o enviarlo.');
  };
  const collectionFields = (body, req, existing) => {
    keys(body, ['name', 'description', 'symbol', 'delegate', 'royaltyBps', 'royaltyReceiver', 'status', 'limit', 'visibility', 'avatarImageId', 'coverImageId']);
    const out = {};
    if (body.visibility !== undefined || !existing) out.visibility = visibility(body.visibility || 'private');
    // '' quita la imagen; si no, tiene que ser una ya subida (se comprueba en collectionImages).
    for (const k of ['avatarImageId', 'coverImageId']) if (body[k] !== undefined) out[k] = body[k] === '' || body[k] === null ? '' : id(body[k]);
    for (const [k, max] of [['name',150], ['description',5000], ['symbol',20]]) if (body[k] !== undefined || !existing) out[k] = string(body[k], max, k, k === 'name');
    if (Object.hasOwn(body, 'delegate')) {
      const value = address(body.delegate, true);
      if (!req.collectionsIsSystemOwner && value !== (existing && existing.delegate || '')) fail(403, 'system_owner_required', 'Solo el dueño del sistema puede asignar o retirar el delegado de una colección.');
      out.delegate = value;
    } else if (!existing) out.delegate = '';
    if (body.limit !== undefined || !existing) out.limit = uint(body.limit === undefined ? '10000' : body.limit, 'límite', 1000000n);
    if (body.status !== undefined || !existing) out.status = state(body.status || 'active');
    if (body.royaltyBps !== undefined || !existing) out.royaltyBps = bps(body.royaltyBps === undefined ? 0 : body.royaltyBps);
    if (body.royaltyReceiver !== undefined || !existing) out.royaltyReceiver = address(body.royaltyReceiver, true);
    const effective = { ...existing, ...out };
    if (effective.royaltyBps > 0 && !effective.royaltyReceiver) fail(400, 'royalty_receiver_required', 'Indica la cartera receptora de royalties.');
    return out;
  };
  /** El perfil y la portada: que la imagen exista, y su URL pública. */
  const collectionImages = async fields => {
    for (const [k, url] of [['avatarImageId', 'avatarUrl'], ['coverImageId', 'coverUrl']]) {
      if (!Object.hasOwn(fields, k)) continue;
      if (!fields[k]) { fields[url] = ''; continue; }
      if (!await Image.exists(query({ id: fields[k] }))) fail(400, 'image_not_found', 'Primero sube la imagen de perfil o de portada.');
      fields[url] = `/api/collections/images/${fields[k]}`;
    }
    return fields;
  };
  /** Las imágenes que nadie usa ya (ni una pieza, ni un perfil ni una portada) se borran. */
  const dropUnusedImages = async ids => {
    let dropped = 0;
    for (const imageId of [...new Set(ids.filter(Boolean))]) {
      const used = await Token.exists(query({ imageId })) || await Collection.exists(query({ $or: [{ avatarImageId: imageId }, { coverImageId: imageId }] }));
      if (!used) { const r = await Image.deleteOne(query({ id: imageId })); dropped += r && r.deletedCount || 0; }
    }
    return dropped;
  };
  const tokenFields = async (body, existing, collection) => {
    keys(body, ['name', 'description', 'imageId', 'attributes', 'status', 'royaltyBps', 'royaltyReceiver']);
    const out = {};
    for (const [k,max] of [['name',200],['description',5000]]) if (body[k] !== undefined || !existing) out[k] = string(body[k],max,k);
    if (body.imageId !== undefined || !existing) {
      out.imageId = id(body.imageId);
      if (!await Image.exists(query({ id: out.imageId }))) fail(400, 'image_not_found', 'Primero sube la imagen del NFT.');
      out.imageUrl = `/api/collections/images/${out.imageId}`;
    }
    if (body.attributes !== undefined || !existing) out.attributes = attributes(body.attributes);
    if (body.status !== undefined || !existing) out.status = state(body.status || 'active');
    if (Object.hasOwn(body,'royaltyBps') || !existing) out.royaltyBps = bps(body.royaltyBps, true);
    if (body.royaltyReceiver !== undefined || !existing) out.royaltyReceiver = address(body.royaltyReceiver, true);
    const merged = { ...existing, ...out };
    if ((merged.royaltyBps === null ? collection.royaltyBps : merged.royaltyBps) > 0 && !(merged.royaltyReceiver || collection.royaltyReceiver)) fail(400,'royalty_receiver_required','Indica una cartera receptora para los royalties.');
    return out;
  };
  app.get(`${PREFIX}/bootstrap`, route(async (req,res) => {
    const [cs,ts,hs,ps,ops,scan,totals] = await Promise.all([
      Collection.find(query()).sort(catalogs.collections.sort).limit(LIMITS.collections).lean(), Token.find(query()).sort(catalogs.tokens.sort).limit(LIMITS.tokens).lean(),
      History.find(query()).sort(catalogs.history.sort).limit(LIMITS.history).lean(),Payment.find(query()).sort(catalogs.royaltyPayments.sort).limit(LIMITS.royaltyPayments).lean(), Operation.find(query({actor:req.collectionsActor,status:{$in:['prepared','applying']}})).sort({createdAt:-1}).limit(LIMITS.operations).select('-data -typeHash').lean(),
      Scan.findOne(query({id:'main'})).lean(), Promise.all([Collection.countDocuments(query()),Token.countDocuments(query()),History.countDocuments(query()),Operation.countDocuments(query({actor:req.collectionsActor,status:{$in:['prepared','applying']}})),Payment.countDocuments(query())])
    ]);
    res.json({ok:true,address:req.collectionsActor,systemOwner:req.collectionsSystemOwner,isSystemOwner:req.collectionsIsSystemOwner,chainId,contractAddress,explorerUrl,abi:ABI,
      capabilities:{invoiceSystem:true,erc721:false,onchainRoyaltyEnforcement:false,royaltyPaymentTracking:'native_direct_receipts',royaltySaleAmount:'admin_declared',reversibleStates:'backend_policy',delegates:'admin_scoped_collection_policy',multiAccount:'sequential_wallet_transactions',confirmations,imageMaxBytes:MAX_IMAGE,attributesMax:MAX_ATTRIBUTES,limits:LIMITS,
        // (2026-10-26) Lo nuevo del estudio: el panel solo lo enseña si el servidor lo tiene.
        visibility:true,collectionImages:true,deletes:true,burn:true,bulkImages:true,owners:true},
      collections:cs.map(plain),tokens:ts.map(plain),history:hs.map(plain),royaltyPayments:ps.map(plain),operations:ops.map(plain),scan:plain(scan)||{cursor:null,historicalIncomplete:true},
      totals:{collections:totals[0],tokens:totals[1],history:totals[2],operations:totals[3],royaltyPayments:totals[4]},truncated:totals[0]>cs.length||totals[1]>ts.length||totals[2]>hs.length||totals[3]>ops.length||totals[4]>ps.length});
  }));
  app.get(`${PREFIX}/catalog`,route(async(req,res)=>{
    const params=req.query||{};keys(params,['kind','offset','limit']);
    const kind=params.kind;
    if(typeof kind!=='string'||!Object.hasOwn(catalogs,kind))fail(400,'invalid_catalog_kind','Selecciona tokens, collections, history o royaltyPayments.');
    const pagination=(value,fallback,label)=>{
      if(value===undefined)return fallback;
      if(typeof value!=='string'||!/^(0|[1-9]\d{0,8})$/.test(value))fail(400,'invalid_pagination',`${label} debe ser un entero no negativo.`);
      return Number(value);
    };
    const offset=pagination(params.offset,0,'offset');const requested=pagination(params.limit,100,'limit');
    if(requested<1)fail(400,'invalid_pagination','limit debe ser mayor que cero.');
    const limit=Math.min(500,requested);const catalog=catalogs[kind];const total=await catalog.model.countDocuments(query());
    const rows=offset>=total?[]:await catalog.model.find(query()).sort(catalog.sort).skip(offset).limit(limit).lean();
    const nextOffset=offset+rows.length;res.json({ok:true,kind,items:rows.map(plain),total,hasMore:nextOffset<total,nextOffset});
  }));
  app.post(PREFIX, route(async(req,res) => {
    const fields = await collectionImages(collectionFields(req.body,req,null)); const uid=crypto.randomUUID(); const now=new Date().toISOString();
    const c=await Collection.create({scope,id:uid,...fields,typeKey:`col:${uid}`,configured:false,configuredLimit:'0',nextNumber:0,createdAt:now,updatedAt:now});
    res.status(201).json({ok:true,collection:plain(c)});
  }));
  app.patch(`${PREFIX}/:id`,route(async(req,res) => {
    const c=await getCollection(req.params.id);collectionWrite(req,c);const fields=await collectionImages(collectionFields(req.body,req,c));
    if (fields.limit && BigInt(fields.limit)<BigInt(c.nextNumber)) fail(409,'limit_below_count','El límite no puede ser inferior al número de NFT registrados.');
    if(fields.limit)fields.configured=fields.limit===c.configuredLimit;
    if(Object.hasOwn(fields,'royaltyReceiver')&&!fields.royaltyReceiver&&await Token.exists(query({collectionId:c.id,royaltyBps:{$gt:0},royaltyReceiver:''})))fail(409,'royalty_receiver_in_use','Hay NFT con un royalty propio que dependen de la cartera receptora de esta colección. Asigna primero un receptor propio a esos NFT.');
    // Collection policy is inherited dynamically. No token status is overwritten,
    // so restoring a collection preserves previously blocked individual NFTs.
    const changed=await Collection.findOneAndUpdate(query({id:c.id}),{$set:{...fields,updatedAt:new Date().toISOString()}},{new:true}).lean();
    if(Object.hasOwn(fields,'avatarImageId')||Object.hasOwn(fields,'coverImageId'))await dropUnusedImages([c.avatarImageId,c.coverImageId]);
    res.json({ok:true,collection:plain(changed)});
  }));
  app.post(`${PREFIX}/images`,route(async(req,res) => {
    keys(req.body,['dataUrl']);const value=imageData(req.body.dataUrl);const candidate=crypto.randomUUID();
    const image=await Image.findOneAndUpdate(query({digest:value.digest}),{$setOnInsert:{scope,id:candidate,...value,createdAt:new Date().toISOString()}},{new:true,upsert:true}).lean();
    res.status(201).json({ok:true,id:image.id,url:`/api/collections/images/${image.id}`});
  }));
  app.get('/api/collections/images/:id',route(async(req,res) => {
    const image=await Image.findOne(query({id:id(req.params.id)})).lean();if(!image)fail(404,'image_not_found','Imagen no encontrada.');
    const data=Buffer.isBuffer(image.data)?image.data:Buffer.from(image.data.buffer);
    res.set({'Content-Type':image.mime,'Content-Length':String(data.length),'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cache-Control':'public,max-age=86400,immutable',
      // (2026-10-26) Imágenes públicas: el panel NFT del juego (otro origen) y las carteras las incrustan.
      'Cross-Origin-Resource-Policy':'cross-origin'}).send(data);
  }));
  app.post(`${PREFIX}/:id/tokens`,route(async(req,res) => {
    keys(req.body,['items']);const c=await getCollection(req.params.id);collectionWrite(req,c);active(c);
    const items=req.body.items;if(!Array.isArray(items)||!items.length||items.length>LIMITS.batch)fail(400,'invalid_batch',`Selecciona de 1 a ${LIMITS.batch} NFT por lote.`);
    const metadata=await Promise.all(items.map(item=>tokenFields(item,null,c)));
    // The range reservation is atomic across all Node processes. Failed inserts
    // may leave a gap; numbers are never recycled or assigned to another NFT.
    const reserved=await Collection.findOneAndUpdate(query({id:c.id,status:'active',limit:c.limit,nextNumber:{$lte:Number(c.limit)-items.length}}),{$inc:{nextNumber:items.length}},{new:true}).lean();
    if(!reserved)fail(409,'collection_limit','El lote supera el límite de la colección o su estado cambió.');
    const now=new Date().toISOString();const docs=metadata.map((m,i)=>({scope,id:crypto.randomUUID(),number:reserved.nextNumber-items.length+i+1,collectionId:c.id,...m,invoiceId:'',invoiceIds:[],manualId:'',pendingMintOperation:'',owner:'',chainActive:false,chainQuantity:'0',chainWarning:'',lastChainBlock:0,lastChainIndex:-1,createdAt:now,updatedAt:now}));
    const ts=await Token.insertMany(docs,{ordered:true});res.status(201).json({ok:true,tokens:ts.map(plain)});
  }));
  app.patch(`${PREFIX}/tokens/:id`,route(async(req,res) => {
    const t=await getToken(req.params.id);const c=await getCollection(t.collectionId);collectionWrite(req,c);const fields=await tokenFields(req.body,t,c);
    const changed=await Token.findOneAndUpdate(query({id:t.id}),{$set:{...fields,updatedAt:new Date().toISOString()}},{new:true}).lean();
    if(fields.imageId&&fields.imageId!==t.imageId)await dropUnusedImages([t.imageId]);
    res.json({ok:true,token:plain(changed)});
  }));
  /* ═══ BORRAR Y CAMBIAR IMÁGENES                                  (2026-10-26)
     "No puedo eliminar la colección y todos sus NFT, ni un NFT de una colección,
     ni cambiarle la imagen, ni cambiar las imágenes de todos según su id."

     Borrar es del REGISTRO (Mongo): lo que ya se emitió sigue siendo una
     factura en la cartera de alguien. Por eso, si hay piezas emitidas y activas,
     se pide `force` (o quemarlas antes con la acción `burn`, que firma la
     cartera admin). Las imágenes que quedan sin usar se borran. */
  app.post(`${PREFIX}/tokens/:id/delete`,route(async(req,res)=>{
    keys(req.body||{},['force']);const t=await getToken(req.params.id);const c=await getCollection(t.collectionId);collectionWrite(req,c);
    if(t.invoiceId&&t.chainActive!==false&&(req.body||{}).force!==true)fail(409,'token_on_chain','Esta pieza está emitida en la cartera '+(t.owner||'?')+'. Quémala primero o confirma borrarla solo del registro.');
    if(t.pendingMintOperation)await Operation.updateOne(query({id:t.pendingMintOperation,status:{$in:['prepared','applying']}}),{$set:{status:'superseded'}});
    await Token.deleteOne(query({id:t.id}));
    const images=await dropUnusedImages([t.imageId]);
    res.json({ok:true,deleted:t.id,number:t.number,imagesDropped:images});
  }));
  app.post(`${PREFIX}/:id/delete`,route(async(req,res)=>{
    keys(req.body||{},['confirm','force']);const c=await getCollection(req.params.id);collectionWrite(req,c);
    if(string(req.body&&req.body.confirm,150,'confirmación',true)!==String(c.name||'').trim())fail(400,'confirm_mismatch','Escribe exactamente el nombre de la colección para borrarla.');
    const onChain=await Token.countDocuments(query({collectionId:c.id,invoiceId:{$ne:''},chainActive:{$ne:false}}));
    if(onChain>0&&(req.body||{}).force!==true)fail(409,'collection_on_chain',`Hay ${onChain} piezas emitidas en carteras. Quémalas primero o confirma borrar la colección solo del registro.`);
    const images=(await Token.find(query({collectionId:c.id})).select('imageId').lean()).map(t=>t.imageId).concat([c.avatarImageId,c.coverImageId]);
    await Operation.updateMany(query({collectionId:c.id,status:{$in:['prepared','applying']}}),{$set:{status:'superseded'}});
    const removed=await Token.deleteMany(query({collectionId:c.id}));
    await Collection.deleteOne(query({id:c.id}));
    const dropped=await dropUnusedImages(images);
    res.json({ok:true,deleted:c.id,tokens:removed&&removed.deletedCount||0,onChainLeft:onChain,imagesDropped:dropped});
  }));
  // Las imágenes de muchas piezas a la vez: por su número (#) o una para todas.
  app.post(`${PREFIX}/:id/token-images`,route(async(req,res)=>{
    keys(req.body,['items','imageId']);const c=await getCollection(req.params.id);collectionWrite(req,c);
    const now=new Date().toISOString(),url=x=>`/api/collections/images/${x}`;
    const exists=async x=>{if(!await Image.exists(query({id:x})))fail(400,'image_not_found','Primero sube la imagen '+x+'.');};
    const before=(await Token.find(query({collectionId:c.id})).select('imageId').lean()).map(t=>t.imageId);
    let updated=0;const missing=[];
    if(req.body.imageId!==undefined){
      const imageId=id(req.body.imageId);await exists(imageId);
      const r=await Token.updateMany(query({collectionId:c.id}),{$set:{imageId,imageUrl:url(imageId),updatedAt:now}});updated=r&&(r.modifiedCount??r.nModified)||0;
    } else {
      const items=req.body.items;if(!Array.isArray(items)||!items.length||items.length>LIMITS.tokens)fail(400,'invalid_batch',`Indica de 1 a ${LIMITS.tokens} piezas.`);
      const rows=items.map(it=>{keys(it,['number','imageId']);const n=Number(it.number);if(!Number.isSafeInteger(n)||n<1)fail(400,'invalid_number','Número de pieza inválido.');return {number:n,imageId:id(it.imageId)};});
      if(new Set(rows.map(r=>r.number)).size!==rows.length)fail(400,'duplicate_number','Hay números de pieza repetidos.');
      for(const x of new Set(rows.map(r=>r.imageId)))await exists(x);
      for(const r of rows){const u=await Token.updateOne(query({collectionId:c.id,number:r.number}),{$set:{imageId:r.imageId,imageUrl:url(r.imageId),updatedAt:now}});if(u&&u.matchedCount===0)missing.push(r.number);else updated++;}
    }
    await dropUnusedImages(before);
    res.json({ok:true,updated,missing});
  }));
  /* Quién tiene cada pieza: su cartera y su nombre en el juego (deps.resolveOwners). */
  app.get(`${PREFIX}/:id/owners`,route(async(req,res)=>{
    const c=await getCollection(req.params.id);
    const ts=await Token.find(query({collectionId:c.id})).sort({number:1}).limit(LIMITS.tokens).lean();
    const wallets=[...new Set(ts.filter(t=>t.invoiceId&&t.chainActive!==false&&t.owner).map(t=>t.owner.toLowerCase()))];
    let names={};
    if(wallets.length&&typeof deps.resolveOwners==='function'){try{names=await deps.resolveOwners(wallets)||{};}catch(_){names={};}}
    const who=a=>names[String(a||'').toLowerCase()]||{};
    const effective=t=>c.status!=='active'?c.status:(t.status||'active');
    const tokens=ts.map(t=>({id:t.id,number:t.number,name:t.name||'',imageUrl:t.imageUrl||'',invoiceId:t.invoiceId||'',owner:t.invoiceId&&t.chainActive!==false?t.owner||'':'',
      playerName:who(t.owner).playerName||'',username:who(t.owner).username||'',chainActive:t.chainActive!==false&&!!t.invoiceId,status:effective(t)}));
    const owners=wallets.map(a=>({address:a,playerName:who(a).playerName||'',username:who(a).username||'',count:tokens.filter(t=>t.owner===a).length})).sort((x,y)=>y.count-x.count);
    res.json({ok:true,collection:plain(c),tokens,owners,total:await Token.countDocuments(query({collectionId:c.id}))});
  }));
  app.post(`${PREFIX}/prepare`,route(async(req,res) => {
    keys(req.body,['action','collectionId','tokenId','to']);const action=req.body.action;
    if(!['configure','mint','transfer','burn'].includes(action))fail(400,'invalid_action','Acción no permitida.');
    const t=action==='configure'?null:await getToken(req.body.tokenId);const c=await getCollection(t?t.collectionId:req.body.collectionId);collectionWrite(req,c);
    // Quemar se puede también con la colección o la pieza suspendidas: es el paso previo a borrarlas.
    if(action!=='burn')active(c,t);
    let method,args,toWallet='',fromWallet='',manualId='',invoiceId='';
    if(action==='burn'){
      if(!t.invoiceId)fail(409,'not_minted','Esta pieza no está emitida: bórrala directamente del registro.');
      if(t.chainAmbiguous)fail(409,'ambiguous_invoice','Una modificación externa dividió o mezcló esta unidad. Revisa la factura antes de quemarla.');
      const inv=await contract.getInvoice(t.invoiceId);
      if(inv.active!==true||inv.tipo!==c.typeKey||inv.manualId!==t.manualId)fail(409,'invoice_changed','La factura ya no está activa o su identidad no coincide. Sincroniza el historial.');
      invoiceId=t.invoiceId;manualId=t.manualId;fromWallet=address(inv.owner);
      method='deleteInvoice';args=[invoiceId];
    } else if(action==='configure'){
      const stats=await contract.getTipoStats(c.typeKey);
      if(BigInt(stats.totalQuantity)>BigInt(c.limit))fail(409,'limit_below_onchain_supply','El límite propuesto es inferior a la cantidad que ya existe en la cadena.');
      method='setLimit';args=[c.typeKey,c.limit,'1'];
    }
    else {
      toWallet=address(req.body.to);
      const stats=await contract.getTipoStats(c.typeKey);
      if(stats.exists!==true||String(stats.perInvoiceLimit)!=='1'||String(stats.limit)!==c.limit)fail(409,'collection_not_configured','Configura primero esta colección en el contrato con límite de una unidad por NFT.');
      manualId=`nft:${t.id}:${crypto.randomBytes(6).toString('hex')}`;
      if(action==='mint'){
        if(t.invoiceId)fail(409,'already_minted','Este NFT ya tiene una factura asociada.');
        if(t.pendingMintOperation){
          const pending=await Operation.findOne(query({id:t.pendingMintOperation})).lean();
          if(!pending)fail(409,'mint_reservation_missing','La reserva de emisión requiere revisar la base de datos.');
          if(pending.actor!==req.collectionsActor||pending.toWallet!==toWallet)fail(409,'mint_already_prepared','Este NFT tiene una emisión preparada. Recupérala con la misma cartera y destino para evitar una doble emisión.');
          return res.json({ok:true,operationId:pending.id,method:pending.method,args:pending.args,to:contractAddress,chainId,recovered:true,txHash:pending.txHash||null});
        }
        method='createInvoice';args=[toWallet,c.typeKey,'1',manualId];
      } else {
        if(!t.invoiceId)fail(409,'not_minted','Primero emite el NFT en la cadena.');
        if(t.chainAmbiguous)fail(409,'ambiguous_invoice','Una modificación externa dividió o mezcló esta unidad. Revisa la factura antes de hacer otro envío desde el panel.');
        const inv=await contract.getInvoice(t.invoiceId);
        if(inv.active!==true||String(inv.cantidad)!=='1'||inv.tipo!==c.typeKey||inv.manualId!==t.manualId)fail(409,'invoice_changed','La factura no está activa, su cantidad cambió o su identidad no coincide. Sincroniza el historial.');
        invoiceId=t.invoiceId;fromWallet=address(inv.owner);if(same(fromWallet,toWallet))fail(400,'same_recipient','La cuenta de destino ya tiene este NFT.');
        method='transferInvoice';args=[fromWallet,toWallet,invoiceId,'1',manualId];
      }
    }
    const operation=await Operation.create({scope,id:crypto.randomUUID(),actor:req.collectionsActor,action,collectionId:c.id,tokenId:t?t.id:'',method,args,data:iface.encodeFunctionData(method,args),typeKey:c.typeKey,typeHash:ethers.id(c.typeKey),manualId,invoiceId,fromWallet,toWallet,status:'prepared',createdAt:new Date().toISOString()});
    if(action==='mint'){
      const reservation=await Token.findOneAndUpdate(query({id:t.id,invoiceId:'',$or:[{pendingMintOperation:''},{pendingMintOperation:{$exists:false}}]}),{$set:{pendingMintOperation:operation.id}},{new:true}).lean();
      if(!reservation){await Operation.updateOne(query({id:operation.id}),{$set:{status:'superseded'}});fail(409,'mint_already_prepared','Otra petición reservó la emisión de este NFT. Vuelve a intentar para recuperar esa operación.');}
    }
    res.status(201).json({ok:true,operationId:operation.id,method,args,to:contractAddress,chainId});
  }));
  const addHistory=async (token, info)=>History.updateOne(query({id:info.id}),{$setOnInsert:{scope,tokenId:token.id,number:token.number,collectionId:token.collectionId,...info}},{upsert:true});
  app.post(`${PREFIX}/operations/:id/confirm`,route(async(req,res) => {
    keys(req.body,['txHash']);const txHash=hash(req.body.txHash);let op=await Operation.findOne(query({id:id(req.params.id)})).lean();
    if(!op)fail(404,'operation_not_found','Operación no encontrada.');
    if(op.actor!==req.collectionsActor)fail(403,'operation_wallet_mismatch','Confirma con la misma cartera que preparó la operación.');
    if(!['prepared','applying','confirmed'].includes(op.status))fail(409,'operation_superseded','Esta preparación fue reemplazada y no puede confirmarse.');
    if(op.txHash&&op.txHash!==txHash)fail(409,'operation_hash_conflict','Esta operación ya está vinculada a otra transacción.');
    if(op.status==='confirmed')return res.json({ok:true,operationId:op.id,...op.result,idempotent:true});
    if(await Payment.exists(query({txHash})))fail(409,'transaction_already_used','Esta transacción ya está registrada como pago de royalty.');
    if(op.action==='mint'&&(await getToken(op.tokenId)).pendingMintOperation!==op.id)fail(409,'mint_reservation_mismatch','Esta operación no tiene la reserva de emisión del NFT.');
    const verified=await verifyReceipt({provider,iface,contractAddress,chainId,operation:op,txHash,confirmations});
    // This unique hash claim remains persistent if a process dies mid-apply.
    // Retrying the same operation then resumes idempotent projection writes.
    const claim=await Operation.findOneAndUpdate(query({id:op.id,$or:[{txHash:{$exists:false}},{txHash}]}),{$set:{txHash,status:'applying'}},{new:true}).lean();
    if(!claim)fail(409,'operation_hash_conflict','La operación fue confirmada con otra transacción.');op=claim;
    let result={};const blockNumber=Number(verified.receipt.blockNumber);
    if(op.action==='configure'){
      const c=await getCollection(op.collectionId);
      await Collection.updateOne(query({id:op.collectionId,limit:c.limit}),{$set:{configured:c.limit===op.args[1],configuredLimit:op.args[1]}});
      result.collectionId=op.collectionId;
    } else if(op.action==='burn'){
      // La pieza pudo borrarse del registro mientras tanto: el recibo vale igual.
      const t=await Token.findOne(query({id:op.tokenId})).lean();
      if(t){
        await Token.updateOne(query({id:t.id}),{$set:{chainActive:false,chainQuantity:'0',owner:'',chainWarning:'',lastChainBlock:blockNumber,lastChainIndex:verified.logIndex,updatedAt:new Date().toISOString()}});
        await addHistory(t,{id:`${txHash}:${verified.logIndex}:${t.id}`,kind:'burn',from:op.fromWallet||ZERO,to:ZERO,txHash,blockNumber,logIndex:verified.logIndex,timestamp:verified.timestamp,invoiceId:op.invoiceId,previousInvoiceId:op.invoiceId});
      }
      result={tokenId:op.tokenId,invoiceId:op.invoiceId,burned:true};
    } else {
      const t=await getToken(op.tokenId);const invoiceId=String(op.action==='mint'?verified.event.args.id:verified.event.args.newId);
      const inv=await contract.getInvoice(invoiceId);
      if(inv.tipo!==op.typeKey||inv.manualId!==op.manualId||String(inv.id)!==invoiceId)fail(409,'invoice_identity_mismatch','El estado leído no corresponde a la factura confirmada.');
      const isNewer=t.lastChainBlock<blockNumber||t.lastChainBlock===blockNumber&&t.lastChainIndex<=verified.logIndex;
      const ambiguous=!!(t.chainAmbiguous||verified.ambiguous||inv.active===true&&String(inv.cantidad)!=='1');
      if(isNewer)await Token.updateOne(query({id:t.id,$or:[{lastChainBlock:{$lt:blockNumber}},{lastChainBlock:blockNumber,lastChainIndex:{$lte:verified.logIndex}}]}),{$set:{invoiceId,manualId:op.manualId,owner:address(inv.owner),chainActive:inv.active===true,chainQuantity:String(inv.cantidad),chainAmbiguous:ambiguous,chainWarning:ambiguous?'La factura se dividió o su cantidad dejó de ser 1; requiere revisión.':inv.active!==true?'La factura ya fue consumida o enviada por otra operación. Sincroniza el historial.':'',lastChainBlock:blockNumber,lastChainIndex:verified.logIndex,updatedAt:new Date().toISOString()},$addToSet:{invoiceIds:{$each:[op.invoiceId,invoiceId].filter(Boolean)}}});
      await addHistory(t,{id:`${txHash}:${verified.logIndex}:${t.id}`,kind:op.action,from:op.fromWallet||ZERO,to:op.toWallet,txHash,blockNumber,logIndex:verified.logIndex,timestamp:verified.timestamp,invoiceId,previousInvoiceId:op.invoiceId||''});
      await Scan.updateOne(query({id:'main'}),{$min:{cursor:Math.max(0,blockNumber-1),startBlock:blockNumber},$setOnInsert:{scope,id:'main',historicalIncomplete:false}},{upsert:true});
      result={tokenId:t.id,invoiceId};
    }
    await Operation.updateOne(query({id:op.id,txHash}),{$set:{status:'confirmed',result,confirmedAt:new Date().toISOString()}});
    res.json({ok:true,operationId:op.id,...result});
  }));
  app.post(`${PREFIX}/royalty-payments`,route(async(req,res)=>{
    keys(req.body,['tokenId','txHash','saleAmountWei']);
    const token=await getToken(req.body.tokenId);const collection=await getCollection(token.collectionId);collectionWrite(req,collection);
    const txHash=hash(req.body.txHash);const saleAmountWei=uint(req.body.saleAmountWei,'precio declarado de venta');
    const existing=await Payment.findOne(query({txHash})).lean();
    if(existing){if(existing.tokenId!==token.id||existing.saleAmountWei!==saleAmountWei)fail(409,'transaction_already_used','Este pago ya fue asignado a otro NFT o precio declarado.');return res.json({ok:true,payment:plain(existing),idempotent:true});}
    if(await Operation.exists(query({txHash})))fail(409,'transaction_already_used','Esta transacción ya está asociada a otra operación del panel.');
    const royaltyBps=bps(token.royaltyBps===null||token.royaltyBps===undefined?collection.royaltyBps:token.royaltyBps);
    const receiver=address(token.royaltyReceiver||collection.royaltyReceiver);
    const amountWei=(BigInt(saleAmountWei)*BigInt(royaltyBps)/10000n).toString();
    if(amountWei==='0')fail(400,'zero_royalty','La configuración vigente o el precio declarado producen un royalty de cero.');
    const verified=await verifyNativeRoyalty({provider,chainId,txHash,receiver,amountWei,confirmations});
    // Only the native receipt is verified. The sale price is declared by this
    // admin and is retained as such; no sale or marketplace execution is implied.
    const payment=await Payment.create({scope,id:crypto.randomUUID(),tokenId:token.id,collectionId:collection.id,txHash,...verified,amountWei,amount:ethers.formatEther(amountWei),currency:'NATIVE',decimals:18,status:'confirmed',verified:true,saleAmountWei,royaltyBps,recordedBy:req.collectionsActor,recordedAt:new Date().toISOString()});
    res.status(201).json({ok:true,payment:plain(payment)});
  }));
  app.post(`${PREFIX}/sync`,route(async(req,res) => {
    keys(req.body||{},['fromBlock','toBlock']);const latest=Number(await provider.getBlockNumber())-confirmations+1;
    if(latest<0)fail(503,'chain_unavailable','No hay bloques confirmados.');
    const prior=await Scan.findOne(query({id:'main'})).lean();
    const from=req.body.fromBlock===undefined?(prior&&Number.isSafeInteger(prior.cursor)?prior.cursor+1:Math.max(0,latest-LIMITS.scanBlocks+1)):safeInteger(req.body.fromBlock,'fromBlock');
    const requestedTo=req.body.toBlock===undefined?latest:safeInteger(req.body.toBlock,'toBlock');
    const to=Math.min(requestedTo,latest,from+LIMITS.scanBlocks-1);
    if(from>latest||to<from)return res.json({ok:true,scan:plain(prior)||{cursor:latest,latest,historicalIncomplete:true},processed:0});
    if(prior&&prior.cursor!==undefined&&from>prior.cursor+1)fail(400,'scan_gap','No se puede saltar un tramo pendiente del historial.');
    const now=new Date();
    await Scan.updateOne(query({id:'main'}),{$setOnInsert:{scope,id:'main',cursor:from-1,startBlock:from,historicalIncomplete:!prior,lockedUntil:new Date(0)}},{upsert:true});
    const lockId=crypto.randomUUID();
    const lock=await Scan.findOneAndUpdate(query({id:'main',$or:[{lockedUntil:{$lt:now}},{lockedUntil:{$exists:false}}]}),{$set:{lockId,lockedUntil:new Date(now.getTime()+120000),startedAt:now.toISOString()}},{new:true}).lean();
    if(!lock)fail(409,'scan_in_progress','Ya hay una sincronización en curso.');
    try {
      const topics=['InvoiceTransferred','InvoiceDeleted','InvoiceQuantityIncreased','InvoiceQuantityDecreased','InvoiceQuantityMoved'].map(n=>iface.getEvent(n).topicHash);
      const logs=await provider.getLogs({address:contractAddress,fromBlock:from,toBlock:to,topics:[topics]});
      if(logs.length>5000)fail(409,'scan_too_large','El tramo tiene demasiados eventos. Solicita un intervalo más pequeño.');
      logs.sort((a,b)=>Number(a.blockNumber)-Number(b.blockNumber)||Number(a.index??a.logIndex)-Number(b.index??b.logIndex));
      const blocks=new Map();let processed=0;const warnings=[];
      const transferSources=new Set(logs.map(log=>{const e=iface.parseLog(log);return e&&(e.name==='InvoiceTransferred'||e.name==='InvoiceQuantityMoved')?`${log.transactionHash}:${String(e.name==='InvoiceTransferred'?e.args.originalId:e.args.fromId)}`:'';}));
      const deletedSources=new Set(logs.map(log=>{const e=iface.parseLog(log);return e&&e.name==='InvoiceDeleted'?`${log.transactionHash}:${String(e.args.id)}`:'';}));
      for(const log of logs){
        const event=iface.parseLog(log);if(!event)continue;
        const source=String(event.name==='InvoiceTransferred'?event.args.originalId:event.name==='InvoiceQuantityMoved'?event.args.fromId:event.args.id);
        const token=await Token.findOne(query({invoiceIds:source})).lean();
        if(!token)continue;
        const index=Number(log.index??log.logIndex??0);const blockNumber=Number(log.blockNumber);
        if(!blocks.has(blockNumber))blocks.set(blockNumber,await provider.getBlock(blockNumber));
        const block=blocks.get(blockNumber);if(!block||!same(block.hash,log.blockHash))fail(409,'scan_reorganized','Un bloque cambió durante la sincronización; reintenta.');
        const timestamp=new Date(Number(block.timestamp)*1000).toISOString();const txHash=hash(log.transactionHash);
        if(event.name==='InvoiceTransferred'){
          const nextId=String(event.args.newId);const [inv,original]=await Promise.all([contract.getInvoice(nextId),contract.getInvoice(source)]);
          const ambiguous=token.chainAmbiguous||String(event.args.amount)!=='1'||!deletedSources.has(`${log.transactionHash}:${source}`)||inv.active===true&&String(inv.cantidad)!=='1';
          const newer=token.lastChainBlock<blockNumber||token.lastChainBlock===blockNumber&&token.lastChainIndex<=index;
          if(newer)await Token.updateOne(query({id:token.id,$or:[{lastChainBlock:{$lt:blockNumber}},{lastChainBlock:blockNumber,lastChainIndex:{$lte:index}}]}),{$set:{invoiceId:nextId,manualId:inv.manualId,owner:address(inv.owner),chainActive:inv.active===true,chainQuantity:String(inv.cantidad),chainAmbiguous:!!ambiguous,chainWarning:ambiguous?'La factura fue dividida o su cantidad dejó de ser 1; requiere revisión.':'',lastChainBlock:blockNumber,lastChainIndex:index,updatedAt:new Date().toISOString()},$addToSet:{invoiceIds:nextId}});
          else await Token.updateOne(query({id:token.id}),{$addToSet:{invoiceIds:nextId}});
          await addHistory(token,{id:`${txHash}:${index}:${token.id}`,kind:'transfer',from:address(event.args.from),to:address(event.args.to),txHash,blockNumber,logIndex:index,timestamp,invoiceId:nextId,previousInvoiceId:source});processed++;
        } else if(event.name==='InvoiceQuantityMoved'){
          const nextId=String(event.args.toId);const [inv,original,claimed]=await Promise.all([contract.getInvoice(nextId),contract.getInvoice(source),Token.exists(query({id:{$ne:token.id},invoiceIds:nextId}))]);
          const safe=!claimed&&String(event.args.amount)==='1'&&deletedSources.has(`${log.transactionHash}:${source}`)&&(String(inv.cantidad)==='1'||inv.active!==true&&String(inv.cantidad)==='0')&&inv.tipo===(await getCollection(token.collectionId)).typeKey&&!token.chainAmbiguous;
          const newer=token.lastChainBlock<blockNumber||token.lastChainBlock===blockNumber&&token.lastChainIndex<=index;
          if(newer)await Token.updateOne(query({id:token.id}),safe?{$set:{invoiceId:nextId,manualId:inv.manualId,owner:address(inv.owner),chainActive:inv.active===true,chainQuantity:String(inv.cantidad),lastChainBlock:blockNumber,lastChainIndex:index,updatedAt:new Date().toISOString()},$addToSet:{invoiceIds:nextId}}:{$set:{chainAmbiguous:true,chainWarning:'Movimiento externo entre facturas: la unidad se mezcló, dividió o el destino pertenece a otro NFT. Requiere revisión.',lastChainBlock:blockNumber,lastChainIndex:index}});
          await addHistory(token,{id:`${txHash}:${index}:${token.id}`,kind:safe?'transfer':'quantity-moved-review',from:address(original.owner),to:address(inv.owner),txHash,blockNumber,logIndex:index,timestamp,invoiceId:nextId,previousInvoiceId:source});processed++;
        } else if(!(event.name==='InvoiceDeleted'&&transferSources.has(`${log.transactionHash}:${source}`))){
          const inv=await contract.getInvoice(source);
          const burn=event.name==='InvoiceDeleted';
          const altered=event.name==='InvoiceQuantityIncreased'&&String(event.args.newCantidad)!=='1';
          if(altered)await Token.updateOne(query({id:token.id}),{$set:{chainAmbiguous:true,chainWarning:'La cantidad se amplió externamente: esta factura ya no conserva la identidad de una unidad única.'}});
          await addHistory(token,{id:`${txHash}:${index}:${token.id}`,kind:burn?'burn':event.name==='InvoiceQuantityIncreased'?'quantity-increased':'quantity-decreased',from:address(inv.owner),to:burn?ZERO:address(inv.owner),txHash,blockNumber,logIndex:index,timestamp,invoiceId:source,previousInvoiceId:source});processed++;
        }
      }
      // Refresh current owners/active states for a bounded page, including changes
      // such as direct burns or quantity edits that are not reversible by policy.
      const activeTokens=await Token.find(query({invoiceId:{$ne:''}})).sort({updatedAt:1}).limit(200).lean();
      const updates=[];
      for(let offset=0;offset<activeTokens.length;offset+=8){
        const batch=await Promise.allSettled(activeTokens.slice(offset,offset+8).map(async t=>{
          let fields;
          try{const inv=await contract.getInvoice(t.invoiceId);fields={owner:address(inv.owner),chainActive:inv.active===true,chainQuantity:String(inv.cantidad),chainWarning:t.chainAmbiguous?t.chainWarning:inv.active!==true?'La factura fue consumida o eliminada en la cadena. La política del panel no puede restaurarla.':String(inv.cantidad)!=='1'?'La factura actual tiene una cantidad distinta de 1.':'',updatedAt:new Date().toISOString()};}
          catch(error){if(error.code!=='CALL_EXCEPTION')throw error;warnings.push({tokenId:t.id,error:'invoice_missing_possible_reorg'});fields={chainActive:false,chainWarning:'La factura no existe en el bloque actual; podría haber una reorganización de cadena. Revisa su transacción.'};}
          return {updateOne:{filter:query({id:t.id,invoiceId:t.invoiceId}),update:{$set:fields}}};
        }));
        const failed=batch.find(r=>r.status==='rejected');if(failed)throw failed.reason;
        updates.push(...batch.map(r=>r.value));
      }
      if(updates.length)await Token.bulkWrite(updates,{ordered:false});
      const finished=await Scan.updateOne(query({id:'main',lockId}),{$max:{cursor:to},$min:{startBlock:from},$set:{latest,updatedAt:new Date().toISOString(),lockedUntil:new Date(0)}});
      if(finished.matchedCount===0)fail(409,'scan_lease_expired','Otra sincronización reemplazó esta ejecución; vuelve a consultar.');
      const scan=await Scan.findOne(query({id:'main'})).lean();res.json({ok:true,scan:plain(scan),processed,fromBlock:from,toBlock:to,hasMore:to<latest,refreshed:activeTokens.length,warnings,refreshLimited:await Token.countDocuments(query({invoiceId:{$ne:''}}))>activeTokens.length});
    } finally {await Scan.updateOne(query({id:'main',lockId}),{$set:{lockedUntil:new Date(0)}});}
  }));
  return {models:{Collection,Token,Image,Operation,History,Payment,Scan},abi:ABI,scope,limits:LIMITS};
}
module.exports={mountCollections,ABI,LIMITS,PanelError,_test:{keys,string,id,address,uint,bps,state,attributes,imageData,verifyReceipt,verifyNativeRoyalty,parsedLogs,actor}};
