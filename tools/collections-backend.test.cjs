'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const {mountCollections,ABI,_test:utils}=require('../backend-collections/collections.cjs');
const ADMIN='0x1111111111111111111111111111111111111111';
const OTHER='0x2222222222222222222222222222222222222222';
const CONTRACT='0x3333333333333333333333333333333333333333';
const HASH='0x'+'ab'.repeat(32);
const BLOCK='0x'+'cd'.repeat(32);
const iface=new ethers.Interface(ABI);
function response(){return {statusCode:200,body:null,headers:{},headersSent:false,status(v){this.statusCode=v;return this;},set(k,v){if(typeof k==='object')Object.assign(this.headers,k);else this.headers[k]=v;return this;},json(v){this.body=v;return this;},send(v){this.body=v;return this;}};}
function fixture(overrides={}){
  const operation={id:'op',actor:ADMIN,action:'mint',typeKey:'col:collection',typeHash:ethers.id('col:collection'),manualId:'nft:stable:abc',toWallet:OTHER,args:[OTHER,'col:collection','1','nft:stable:abc']};
  operation.data=iface.encodeFunctionData('createInvoice',operation.args);
  const encoded=iface.encodeEventLog(iface.getEvent('InvoiceCreated'),[7,operation.manualId,OTHER,operation.typeKey,1,100]);
  const tx={hash:HASH,to:CONTRACT,from:ADMIN,chainId:4441n,value:0n,data:operation.data};
  const receipt={hash:HASH,to:CONTRACT,from:ADMIN,status:1,blockNumber:100,blockHash:BLOCK,logs:[{address:CONTRACT,...encoded,index:3}]};
  const data={actualChain:'0x1159',tx,receipt,latest:101,block:{hash:BLOCK,timestamp:100}};
  Object.assign(data,overrides);
  const provider={send:async()=>data.actualChain,getTransaction:async()=>data.tx,getTransactionReceipt:async()=>data.receipt,getBlockNumber:async()=>data.latest,getBlock:async()=>data.block};
  return {data,provider,operation,verify:()=>utils.verifyReceipt({provider,iface,contractAddress:CONTRACT,chainId:4441,operation,txHash:HASH,confirmations:2})};
}
test('receipt verification accepts exact mint and decodes indexed tipo hash',async()=>{
  const f=fixture();const result=await f.verify();assert.equal(result.event.args.id,7n);assert.equal(result.logIndex,3);assert.equal(result.timestamp,'1970-01-01T00:01:40.000Z');
});
test('receipt rejects wrong RPC chain even if static provider is configured correctly',async()=>{
  const f=fixture({actualChain:'0x1'});await assert.rejects(f.verify(),{code:'wrong_rpc_chain'});
});
test('receipt rejects calldata, sender, contract, network, value, revert, confirmations and reorg mismatches',async t=>{
  const cases=[
    ['input',f=>f.data.tx.data=iface.encodeFunctionData('createInvoice',[ADMIN,'col:collection',1,'different']), 'transaction_input_mismatch'],
    ['hash',f=>f.data.receipt.hash=BLOCK,'transaction_hash_mismatch'],
    ['sender',f=>f.data.tx.from=OTHER,'transaction_mismatch'],
    ['receipt sender',f=>f.data.receipt.from=OTHER,'transaction_mismatch'],
    ['contract',f=>f.data.tx.to=OTHER,'transaction_mismatch'],
    ['network',f=>f.data.tx.chainId=1n,'transaction_mismatch'],
    ['value',f=>f.data.tx.value=1n,'transaction_input_mismatch'],
    ['revert',f=>f.data.receipt.status=0,'transaction_failed'],
    ['pending',f=>f.data.receipt=null,'transaction_pending'],
    ['confirmations',f=>f.data.latest=100,'transaction_unconfirmed'],
    ['reorg',f=>f.data.block.hash=HASH,'transaction_reorganized'],
    ['forged log emitter',f=>f.data.receipt.logs[0].address=OTHER,'transaction_event_mismatch'],
    ['missing event',f=>f.data.receipt.logs=[],'transaction_event_mismatch']
  ];
  for(const [name,mutate,code]of cases)await t.test(name,async()=>{const f=fixture();mutate(f);await assert.rejects(f.verify(),{code});});
});
test('transfer requires both linked transfer and creation events with matching manual ID',async()=>{
  const f=fixture();Object.assign(f.operation,{action:'transfer',invoiceId:'7',fromWallet:ADMIN,toWallet:OTHER,manualId:'nft:replacement',args:[ADMIN,OTHER,'7','1','nft:replacement']});
  f.operation.data=iface.encodeFunctionData('transferInvoice',f.operation.args);f.data.tx.data=f.operation.data;
  const moved=iface.encodeEventLog(iface.getEvent('InvoiceTransferred'),[7,8,ADMIN,OTHER,1]);
  const created=iface.encodeEventLog(iface.getEvent('InvoiceCreated'),[8,'nft:replacement',OTHER,f.operation.typeKey,1,100]);
  f.data.receipt.logs=[{address:CONTRACT,...moved,index:2},{address:CONTRACT,...created,index:1}];
  assert.equal((await f.verify()).event.args.newId,8n);
  f.data.receipt.logs=[{address:CONTRACT,...moved,index:2}];await assert.rejects(f.verify(),{code:'transaction_event_mismatch'});
});
test('configure requires exact one-unit collection limit event',async()=>{
  const f=fixture();Object.assign(f.operation,{action:'configure',method:'setLimit',args:['col:collection','100','1']});
  f.operation.data=iface.encodeFunctionData('setLimit',f.operation.args);f.data.tx.data=f.operation.data;
  const log=iface.encodeEventLog(iface.getEvent('TipoLimitSet'),['col:collection',100,1]);f.data.receipt.logs=[{address:CONTRACT,...log,index:0}];await f.verify();
  const wrong=iface.encodeEventLog(iface.getEvent('TipoLimitSet'),['col:collection',100,2]);f.data.receipt.logs=[{address:CONTRACT,...wrong,index:0}];await assert.rejects(f.verify(),{code:'transaction_event_mismatch'});
});
test('validation rejects JS-unsafe quantities, unknown fields, addresses, and oversized metadata',()=>{
  assert.equal(utils.uint('9007199254740993','id'),'9007199254740993');
  for(const value of [9007199254740992,-1,1.5,'1e3','0','01'])assert.throws(()=>utils.uint(value,'id'));
  assert.throws(()=>utils.keys({name:'x',owner:ADMIN},['name']));
  assert.throws(()=>utils.keys(JSON.parse('{"__proto__":{}}'),['name']));
  assert.throws(()=>utils.address('0x'+'0'.repeat(40)));
  assert.throws(()=>utils.bps(10001));assert.throws(()=>utils.string('a'.repeat(501),500,'name'));
  assert.throws(()=>utils.attributes(Array.from({length:201},()=>({trait_type:'x',value:'y'}))));
  assert.deepEqual(utils.attributes([{trait_type:'Peso',value:2}]),[{trait_type:'Peso',value:'2'}]);
});
test('image MIME must match magic bytes and SVG/HTML is rejected',()=>{
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(20)]);
  assert.equal(utils.imageData('data:image/png;base64,'+png.toString('base64')).mime,'image/png');
  assert.throws(()=>utils.imageData('data:image/png;base64,'+Buffer.from('<svg onload="x()"/>').toString('base64')),{code:'invalid_image_signature'});
  assert.throws(()=>utils.imageData('data:image/svg+xml;base64,'+Buffer.from('<svg/>').toString('base64')),{code:'invalid_image'});
  assert.throws(()=>utils.imageData('data:image/png;base64,'+Buffer.alloc(600001).toString('base64')),{code:'invalid_image'});
});

function mounting({allowed=true,actualChain='0x1159',rpcFail=false,models={},contractOverrides={},providerOverrides={},explorerUrl=''}={}){
  const routes=new Map();const middleware=[];
  const app={use:(...args)=>middleware.push(args),get:(p,h)=>routes.set('GET '+p,h),post:(p,h)=>routes.set('POST '+p,h),patch:(p,h)=>routes.set('PATCH '+p,h)};
  const names=['GFNftCollection','GFNftToken','GFNftImage','GFNftOperation','GFNftHistory','GFNftRoyaltyPayment','GFNftScan'];
  const db=Object.fromEntries(names.map(n=>[n,{}]));Object.assign(db,models);
  const mongoose={models:db,Schema:{Types:{Mixed:Object}},connection:{readyState:1}};
  let calls=0;
  class Contract {constructor(){Object.assign(this,contractOverrides);}async isAdmin(){calls++;if(rpcFail)throw Error('RPC down');return allowed;}async owner(){return ADMIN;}async getTipoStats(){return {exists:true,totalQuantity:0n,perInvoiceLimit:1n,limit:10n};}}
  const authMiddleware=(req,res,next)=>next();
  mountCollections({app,mongoose,ethers:{...ethers,Contract},provider:{send:async()=>actualChain,...providerOverrides},contractAddress:CONTRACT,chainId:4441,explorerUrl,adminAuth:authMiddleware,csrfProtection:authMiddleware});
  return {routes,middleware,db,get calls(){return calls;}};
}
test('all admin routes are protected by inherited auth + CSRF + fresh onchain isAdmin',async()=>{
  const m=mounting();const chain=m.middleware[0];assert.equal(chain[0],'/api/admin/collections');assert.equal(chain.length,5);
  const guard=chain.at(-1);for(let i=0;i<2;i++){let next=0;const res=response();await guard({admin:{address:ADMIN}},res,()=>next++);assert.equal(next,1);assert.equal(res.body,null);}assert.equal(m.calls,2);
  assert.ok(m.routes.has('GET /api/collections/images/:id'));
});
test('env-list/Bearer role cannot bypass onchain admin, missing wallet, wrong chain or failed RPC',async t=>{
  for(const [label,options,req,status,error]of [
    ['not onchain',{allowed:false},{admin:{address:ADMIN,role:'admin'}},403,'onchain_admin_required'],
    ['no address',{}, {admin:{role:'admin'}},403,'wallet_session_required'],
    ['wrong chain',{actualChain:'0x1'},{admin:{address:ADMIN}},503,'wrong_rpc_chain'],
    ['RPC down',{rpcFail:true},{admin:{address:ADMIN}},503,'collections_unavailable']
  ])await t.test(label,async()=>{const m=mounting(options);const res=response();let next=0;await m.middleware[0].at(-1)(req,res,()=>next++);assert.equal(next,0);assert.equal(res.statusCode,status);assert.equal(res.body.error,error);});
});
test('concurrent batches atomically reserve unique sequential numbers within collection capacity',async()=>{
  const collection={id:'collection',status:'active',limit:'10',nextNumber:0,royaltyBps:0};const created=[];
  const Collection={findOne:()=>({lean:async()=>({...collection})}),findOneAndUpdate:(q,update)=>({lean:async()=>{if(collection.nextNumber>q.nextNumber.$lte)return null;collection.nextNumber+=update.$inc.nextNumber;return {...collection};}})};
  const Token={insertMany:async docs=>{created.push(...docs);return docs;}};
  const m=mounting({models:{GFNftCollection:Collection,GFNftToken:Token,GFNftImage:{exists:async()=>true}}});const handler=m.routes.get('POST /api/admin/collections/:id/tokens');
  const responses=await Promise.all(Array.from({length:15},async()=>{const res=response();await handler({params:{id:'collection'},body:{items:[{imageId:'image'}]}},res);return res;}));
  assert.equal(responses.filter(r=>r.statusCode===201).length,10);assert.equal(responses.filter(r=>r.body.error==='collection_limit').length,5);
  assert.deepEqual(created.map(t=>t.number).sort((a,b)=>a-b),[1,2,3,4,5,6,7,8,9,10]);assert.equal(new Set(created.map(t=>t.id)).size,10);
});
test('only system owner may assign a collection delegate',async()=>{
  let saved;
  const m=mounting({models:{GFNftCollection:{create:async doc=>(saved=doc)}}});const handler=m.routes.get('POST /api/admin/collections');
  const denied=response();await handler({body:{name:'Colección',delegate:OTHER},collectionsIsSystemOwner:false},denied);assert.equal(denied.statusCode,403);assert.equal(saved,undefined);
  const allowed=response();await handler({body:{name:'Colección',delegate:OTHER},collectionsIsSystemOwner:true},allowed);assert.equal(allowed.statusCode,201);assert.match(saved.typeKey,/^col:/);assert.equal(saved.delegate,OTHER);
});
test('superseded mint operations cannot be confirmed or reach RPC',async()=>{
  const op={id:'op',actor:ADMIN,status:'superseded',action:'mint'};
  const m=mounting({models:{GFNftOperation:{findOne:()=>({lean:async()=>op})}}});const handler=m.routes.get('POST /api/admin/collections/operations/:id/confirm');const res=response();
  await handler({params:{id:'op'},body:{txHash:HASH},collectionsActor:ADMIN},res);assert.equal(res.body.error,'operation_superseded');
});

// A model-shaped in-memory double exercises projection state transitions; it is
// never used by production, which always receives the persistent Mongo models.
const SCOPE='4441:'+CONTRACT;
function matches(doc,q){return Object.entries(q).every(([k,v])=>{
  if(k==='$or')return v.some(part=>matches(doc,part));
  const actual=doc[k];
  if(v&&typeof v==='object'&&!Array.isArray(v)&&!(v instanceof Date))return Object.entries(v).every(([op,w])=>op==='$ne'?actual!==w:op==='$exists'?(actual!==undefined)===w:op==='$lt'?actual<w:op==='$lte'?actual<=w:op==='$gt'?actual>w:op==='$in'?w.includes(actual):false);
  return Array.isArray(actual)?actual.includes(v):actual===v;
});}
function memory(seed=[]){
  const docs=seed.map(d=>({scope:SCOPE,...structuredClone(d)}));
  const apply=(doc,u,fresh=false)=>{
    if(fresh)Object.assign(doc,structuredClone(u.$setOnInsert||{}));Object.assign(doc,structuredClone(u.$set||{}));
    for(const [k,v]of Object.entries(u.$inc||{}))doc[k]=(doc[k]||0)+v;
    for(const [k,v]of Object.entries(u.$min||{}))if(doc[k]===undefined||v<doc[k])doc[k]=v;
    for(const [k,v]of Object.entries(u.$max||{}))if(doc[k]===undefined||v>doc[k])doc[k]=v;
    for(const [k,v]of Object.entries(u.$addToSet||{})){doc[k]||=[];for(const value of v&&v.$each||[v])if(!doc[k].includes(value))doc[k].push(value);}
  };
  const select=q=>{let order=null,offset=0,limit=Infinity;return {sort(value){order=value;return this;},skip(value){offset=value;return this;},limit(value){limit=value;return this;},select(){return this;},lean:async()=>docs.filter(d=>matches(d,q)).sort((a,b)=>{for(const[k,direction]of Object.entries(order||{})){if(a[k]<b[k])return-direction;if(a[k]>b[k])return direction;}return 0;}).slice(offset,offset+limit).map(d=>structuredClone(d))};};
  const change=(q,u,options={})=>{let doc=docs.find(d=>matches(d,q));let fresh=false;if(!doc&&options.upsert){doc=Object.fromEntries(Object.entries(q).filter(([k,v])=>!k.startsWith('$')&&(v===null||typeof v!=='object')));docs.push(doc);fresh=true;}if(doc)apply(doc,u,fresh);return doc;};
  return {docs,find:select,findOne:q=>({lean:async()=>structuredClone(docs.find(d=>matches(d,q))||null)}),findOneAndUpdate:(q,u,o)=>({lean:async()=>structuredClone(change(q,u,o)||null)}),updateOne:async(q,u,o)=>({matchedCount:change(q,u,o)?1:0}),exists:async q=>docs.some(d=>matches(d,q)),countDocuments:async q=>docs.filter(d=>matches(d,q)).length,create:async d=>{docs.push(structuredClone(d));return d;}};
}
test('mint preparation reserves exactly one persistent operation under concurrency and reuses it',async()=>{
  const Collection=memory([{id:'collection',name:'Art',typeKey:'col:collection',status:'active',limit:'10'}]);
  const Token=memory([{id:'token',collectionId:'collection',status:'active',invoiceId:'',pendingMintOperation:''}]);
  const Operation=memory();
  const m=mounting({models:{GFNftCollection:Collection,GFNftToken:Token,GFNftOperation:Operation}});const handler=m.routes.get('POST /api/admin/collections/prepare');
  const req=()=>({collectionsActor:ADMIN,body:{action:'mint',tokenId:'token',to:OTHER}});
  const results=await Promise.all(Array.from({length:10},async()=>{const res=response();await handler(req(),res);return res;}));
  assert.equal(results.filter(r=>r.statusCode===201).length,1);assert.equal(Operation.docs.filter(d=>d.status==='prepared').length,1);assert.equal(Token.docs[0].pendingMintOperation,Operation.docs.find(d=>d.status==='prepared').id);
  const retry=response();await handler(req(),retry);assert.equal(retry.body.recovered,true);assert.equal(retry.body.operationId,Token.docs[0].pendingMintOperation);
  const changed=response();const other=req();other.body.to=ADMIN;await handler(other,changed);assert.equal(changed.body.error,'mint_already_prepared');
});
test('sync follows A to B to C through new invoice IDs without false split warning',async()=>{
  const Collection=memory([{id:'collection',typeKey:'col:collection',status:'active',limit:'10'}]);
  const Token=memory([{id:'token',number:1,collectionId:'collection',status:'active',invoiceId:'7',invoiceIds:['7'],manualId:'m7',owner:ADMIN,chainActive:true,lastChainBlock:99,lastChainIndex:1}]);
  const Scan=memory([{id:'main',cursor:99,startBlock:99,lockedUntil:new Date(0),historicalIncomplete:false}]);const History=memory();
  const invoices={'7':{id:7n,owner:ADMIN,tipo:'col:collection',manualId:'m7',cantidad:0n,active:false},'8':{id:8n,owner:OTHER,tipo:'col:collection',manualId:'m8',cantidad:0n,active:false},'9':{id:9n,owner:CONTRACT,tipo:'col:collection',manualId:'m9',cantidad:1n,active:true}};
  const log=(name,args,block,index,tx)=>({address:CONTRACT,...iface.encodeEventLog(iface.getEvent(name),args),blockNumber:block,index,blockHash:BLOCK,transactionHash:'0x'+tx.repeat(32)});
  const logs=[log('InvoiceDeleted',[7,'m7'],100,1,'aa'),log('InvoiceTransferred',[7,8,ADMIN,OTHER,1],100,2,'aa'),log('InvoiceDeleted',[8,'m8'],101,1,'bb'),log('InvoiceTransferred',[8,9,OTHER,CONTRACT,1],101,2,'bb')];
  const m=mounting({models:{GFNftCollection:Collection,GFNftToken:Token,GFNftScan:Scan,GFNftHistory:History},contractOverrides:{getInvoice:async id=>invoices[String(id)]},providerOverrides:{getBlockNumber:async()=>103,getLogs:async()=>logs,getBlock:async()=>({hash:BLOCK,timestamp:100})}});
  const handler=m.routes.get('POST /api/admin/collections/sync');const res=response();await handler({body:{}},res);
  assert.equal(res.body.ok,true,JSON.stringify(res.body));assert.equal(Token.docs[0].invoiceId,'9');assert.equal(Token.docs[0].owner,CONTRACT);assert.equal(Token.docs[0].chainAmbiguous,false);assert.equal(Token.docs[0].chainWarning,'');assert.deepEqual(Token.docs[0].invoiceIds,['7','8','9']);assert.equal(History.docs.length,2);assert.equal(Scan.docs[0].cursor,102);
  const again=response();await handler({body:{fromBlock:100,toBlock:102}},again);assert.equal(again.body.ok,true);assert.equal(History.docs.length,2);assert.equal(Token.docs[0].invoiceId,'9');
});
test('confirmation applies once and recovers idempotently after repeated requests',async()=>{
  const f=fixture();Object.assign(f.operation,{collectionId:'collection',tokenId:'token',status:'prepared'});
  const Collection=memory([{id:'collection',typeKey:f.operation.typeKey,status:'active',limit:'10'}]);
  const Token=memory([{id:'token',number:1,collectionId:'collection',invoiceId:'',invoiceIds:[],manualId:'',pendingMintOperation:'op',lastChainBlock:0,lastChainIndex:-1}]);
  const Operation=memory([f.operation]);const History=memory();const Scan=memory();
  const m=mounting({models:{GFNftCollection:Collection,GFNftToken:Token,GFNftOperation:Operation,GFNftHistory:History,GFNftRoyaltyPayment:memory(),GFNftScan:Scan},contractOverrides:{getInvoice:async()=>({id:7n,tipo:f.operation.typeKey,manualId:f.operation.manualId,owner:OTHER,active:true,cantidad:1n})},providerOverrides:f.provider});
  const handler=m.routes.get('POST /api/admin/collections/operations/:id/confirm');const req=()=>({params:{id:'op'},collectionsActor:ADMIN,body:{txHash:HASH}});
  const results=await Promise.all(Array.from({length:5},async()=>{const res=response();await handler(req(),res);return res;}));
  assert.ok(results.every(r=>r.body.ok===true));assert.equal(History.docs.length,1);assert.equal(Token.docs[0].invoiceId,'7');assert.deepEqual(Token.docs[0].invoiceIds,['7']);assert.equal(Operation.docs[0].status,'confirmed');
  const again=response();await handler(req(),again);assert.equal(again.body.idempotent,true);assert.equal(History.docs.length,1);
  const other=response();const different=req();different.body.txHash=BLOCK;await handler(different,other);assert.equal(other.body.error,'operation_hash_conflict');
});
test('partial external transfer stays ambiguous after current-quantity refresh',async()=>{
  const Collection=memory([{id:'collection',typeKey:'col:collection',status:'active',limit:'10'}]);
  const Token=memory([{id:'token',number:1,collectionId:'collection',status:'active',invoiceId:'7',invoiceIds:['7'],manualId:'m7',owner:ADMIN,chainActive:true,lastChainBlock:99,lastChainIndex:1}]);
  const Scan=memory([{id:'main',cursor:99,startBlock:99,lockedUntil:new Date(0)}]);const History=memory();
  const invoices={'7':{id:7n,owner:ADMIN,tipo:'col:collection',manualId:'m7',cantidad:1n,active:true},'8':{id:8n,owner:OTHER,tipo:'col:collection',manualId:'m8',cantidad:1n,active:true}};
  const log=(name,args,block,index,tx)=>({address:CONTRACT,...iface.encodeEventLog(iface.getEvent(name),args),blockNumber:block,index,blockHash:BLOCK,transactionHash:'0x'+tx.repeat(32)});
  const logs=[log('InvoiceQuantityIncreased',[7,1,2],100,1,'aa'),log('InvoiceTransferred',[7,8,ADMIN,OTHER,1],101,2,'bb')];
  const m=mounting({models:{GFNftCollection:Collection,GFNftToken:Token,GFNftScan:Scan,GFNftHistory:History},contractOverrides:{getInvoice:async id=>invoices[String(id)]},providerOverrides:{getBlockNumber:async()=>103,getLogs:async()=>logs,getBlock:async()=>({hash:BLOCK,timestamp:100})}});
  const res=response();await m.routes.get('POST /api/admin/collections/sync')({body:{}},res);assert.equal(res.body.ok,true);assert.equal(Token.docs[0].chainAmbiguous,true);assert.match(Token.docs[0].chainWarning,/dividida|cantidad/);assert.equal(Token.docs[0].chainQuantity,'1');
  const prepare=response();await m.routes.get('POST /api/admin/collections/prepare')({body:{action:'transfer',tokenId:'token',to:CONTRACT},collectionsActor:ADMIN},prepare);assert.equal(prepare.body.error,'ambiguous_invoice');
});
test('bundle is standalone, reproducible, and mounts before API 404 handler',()=>{
  const {renderBundle,integrate,BEGIN,END}=require('./build-collections-backend.cjs');
  const bundle=renderBundle();const source="const keep = 1;\r\n// --- MANEJO DE ERRORES ---\r\napp.use(() => {});\r\n";
  const out=integrate(source,bundle);assert.equal(integrate(out,bundle),out);assert.equal(out.split(BEGIN).length,2);assert.equal(out.split(END).length,2);assert.ok(out.indexOf(BEGIN)<out.indexOf('// --- MANEJO DE ERRORES ---'));
  assert.ok(out.includes('provider: obtenerProveedorLecturaAdmin()'));assert.ok(out.includes('chainId: CHAIN_ID'));assert.ok(!out.includes("require('./collections"));
});
function royaltyFixture(){const f=fixture();f.data.tx.to=OTHER;f.data.receipt.to=OTHER;f.data.tx.data='0x';f.data.tx.value=50000000000000000n;return f;}
test('native royalty receipt rejects incorrect recipient, amount, data, payer, chain, hash and reorg',async t=>{
  const good=royaltyFixture();assert.equal((await utils.verifyNativeRoyalty({provider:good.provider,chainId:4441,txHash:HASH,receiver:OTHER,amountWei:'50000000000000000'})).from,ADMIN);
  for(const [name,mutate,code]of [
    ['recipient',f=>f.data.tx.to=ADMIN,'royalty_payment_mismatch'],
    ['amount',f=>f.data.tx.value=100n,'royalty_amount_mismatch'],
    ['data',f=>f.data.tx.data='0x1234','royalty_amount_mismatch'],
    ['payer',f=>f.data.receipt.from=OTHER,'royalty_payment_mismatch'],
    ['chain',f=>f.data.actualChain='0x1','wrong_rpc_chain'],
    ['tx chain',f=>f.data.tx.chainId=1n,'royalty_payment_mismatch'],
    ['hash',f=>f.data.receipt.hash=BLOCK,'transaction_hash_mismatch'],
    ['failed',f=>f.data.receipt.status=0,'transaction_failed'],
    ['confirmations',f=>f.data.latest=100,'transaction_unconfirmed'],
    ['reorg',f=>f.data.block.hash=HASH,'transaction_reorganized']
  ])await t.test(name,async()=>{const f=royaltyFixture();mutate(f);await assert.rejects(utils.verifyNativeRoyalty({provider:f.provider,chainId:4441,txHash:HASH,receiver:OTHER,amountWei:'50000000000000000'}),{code});});
});
test('royalty registration records verified native amount and declared sale once, rejects hash reuse',async()=>{
  const f=royaltyFixture();const Collection=memory([{id:'collection',typeKey:'col:collection',royaltyBps:500,royaltyReceiver:OTHER}]);
  const Token=memory([{id:'token',collectionId:'collection',invoiceId:'7',royaltyBps:null,royaltyReceiver:''},{id:'second',collectionId:'collection',invoiceId:'8',royaltyBps:null,royaltyReceiver:''}]);
  const Payment=memory();const Operation=memory();
  const m=mounting({models:{GFNftCollection:Collection,GFNftToken:Token,GFNftRoyaltyPayment:Payment,GFNftOperation:Operation},providerOverrides:f.provider});
  const handler=m.routes.get('POST /api/admin/collections/royalty-payments');const req=()=>({collectionsActor:ADMIN,body:{tokenId:'token',txHash:HASH,saleAmountWei:'1000000000000000000'}});
  const first=response();await handler(req(),first);assert.equal(first.statusCode,201,JSON.stringify(first.body));assert.equal(first.body.payment.amount,'0.05');assert.equal(first.body.payment.amountWei,'50000000000000000');assert.equal(first.body.payment.currency,'NATIVE');assert.equal(first.body.payment.verified,true);assert.equal(first.body.payment.saleAmountWei,'1000000000000000000');
  const again=response();await handler(req(),again);assert.equal(again.body.idempotent,true);assert.equal(Payment.docs.length,1);
  const second=response();const r2=req();r2.body.tokenId='second';await handler(r2,second);assert.equal(second.body.error,'transaction_already_used');
  const changed=response();const r3=req();r3.body.saleAmountWei='2000000000000000000';await handler(r3,changed);assert.equal(changed.body.error,'transaction_already_used');
  Operation.docs.push({scope:SCOPE,id:'used-operation',txHash:BLOCK});const alreadyOp=response();const r4=req();r4.body.txHash=BLOCK;await handler(r4,alreadyOp);assert.equal(alreadyOp.body.error,'transaction_already_used');
});
test('delegated collection denies every associated write from another onchain admin',async t=>{
  const Collection=memory([{id:'collection',delegate:OTHER,typeKey:'col:collection',status:'active',limit:'10'}]);
  const Token=memory([{id:'token',collectionId:'collection',status:'active',invoiceId:'7'}]);
  const m=mounting({models:{GFNftCollection:Collection,GFNftToken:Token}});
  for(const [route,params,body]of [
    ['PATCH /api/admin/collections/:id',{id:'collection'},{name:'Attempt'}],
    ['POST /api/admin/collections/:id/tokens',{id:'collection'},{items:[{imageId:'image'}]}],
    ['PATCH /api/admin/collections/tokens/:id',{id:'token'},{name:'Attempt'}],
    ['POST /api/admin/collections/prepare',{}, {action:'configure',collectionId:'collection'}],
    ['POST /api/admin/collections/prepare',{}, {action:'mint',tokenId:'token',to:ADMIN}],
    ['POST /api/admin/collections/prepare',{}, {action:'transfer',tokenId:'token',to:ADMIN}],
    ['POST /api/admin/collections/royalty-payments',{}, {tokenId:'token',txHash:HASH,saleAmountWei:'100'}]
  ])await t.test(route+' '+(body.action||''),async()=>{const res=response();await m.routes.get(route)({params,body,collectionsActor:CONTRACT,collectionsIsSystemOwner:false},res);assert.equal(res.statusCode,403);assert.equal(res.body.error,'collection_delegate_required');});
});
test('delegate can edit, owner overrides and reassigns, revocation takes effect on the next write',async()=>{
  const Collection=memory([{id:'collection',name:'Initial',delegate:OTHER,typeKey:'col:collection',status:'active',limit:'10',nextNumber:0}]);
  const m=mounting({models:{GFNftCollection:Collection}});const patch=m.routes.get('PATCH /api/admin/collections/:id');
  const request=(who,owner,body)=>({params:{id:'collection'},body,collectionsActor:who,collectionsIsSystemOwner:owner});
  const delegated=response();await patch(request(OTHER,false,{name:'Delegate edit'}),delegated);assert.equal(delegated.body.ok,true);assert.equal(Collection.docs[0].name,'Delegate edit');
  const steal=response();await patch(request(OTHER,false,{delegate:CONTRACT}),steal);assert.equal(steal.body.error,'system_owner_required');assert.equal(Collection.docs[0].delegate,OTHER);
  const owner=response();await patch(request(ADMIN,true,{delegate:CONTRACT,name:'Owner edit'}),owner);assert.equal(owner.body.ok,true);assert.equal(Collection.docs[0].delegate,CONTRACT);
  const revoked=response();await patch(request(OTHER,false,{name:'Old delegate edit'}),revoked);assert.equal(revoked.body.error,'collection_delegate_required');
  const reassigned=response();await patch(request(CONTRACT,false,{name:'New delegate edit'}),reassigned);assert.equal(reassigned.body.ok,true);
  const remove=response();await patch(request(ADMIN,true,{delegate:''}),remove);assert.equal(remove.body.ok,true);assert.equal(Collection.docs[0].delegate,'');
  const unscoped=response();await patch(request(OTHER,false,{name:'Any admin edit'}),unscoped);assert.equal(unscoped.body.ok,true);
});
test('delegate metadata never bypasses fresh onchain admin authorization',async()=>{
  const m=mounting({allowed:false,models:{GFNftCollection:memory([{id:'collection',delegate:OTHER}])}});const res=response();let called=false;await m.middleware[0].at(-1)({admin:{address:OTHER}},res,()=>{called=true;});assert.equal(called,false);assert.equal(res.body.error,'onchain_admin_required');
});
test('original admin may confirm already prepared transaction after collection delegate changes',async()=>{
  const f=fixture();f.operation.actor=OTHER;f.data.tx.from=OTHER;f.data.receipt.from=OTHER;Object.assign(f.operation,{collectionId:'collection',tokenId:'token',status:'prepared'});
  const Collection=memory([{id:'collection',delegate:CONTRACT,typeKey:f.operation.typeKey,status:'active',limit:'10'}]);
  const Token=memory([{id:'token',number:1,collectionId:'collection',invoiceId:'',invoiceIds:[],manualId:'',pendingMintOperation:'op',lastChainBlock:0,lastChainIndex:-1}]);
  const m=mounting({models:{GFNftCollection:Collection,GFNftToken:Token,GFNftOperation:memory([f.operation]),GFNftHistory:memory(),GFNftRoyaltyPayment:memory(),GFNftScan:memory()},contractOverrides:{getInvoice:async()=>({id:7n,tipo:f.operation.typeKey,manualId:f.operation.manualId,owner:OTHER,active:true,cantidad:1n})},providerOverrides:f.provider});
  const res=response();await m.routes.get('POST /api/admin/collections/operations/:id/confirm')({params:{id:'op'},body:{txHash:HASH},collectionsActor:OTHER,collectionsIsSystemOwner:false},res);assert.equal(res.body.ok,true,JSON.stringify(res.body));assert.equal(Token.docs[0].invoiceId,'7');
});
test('bootstrap exposes explorer and scoped delegate policy from backend configuration',async()=>{
  const names=['GFNftCollection','GFNftToken','GFNftImage','GFNftOperation','GFNftHistory','GFNftRoyaltyPayment','GFNftScan'];const models=Object.fromEntries(names.map(n=>[n,memory()]));
  const m=mounting({models,explorerUrl:'https://explorer.example.org/'});const res=response();await m.routes.get('GET /api/admin/collections/bootstrap')({collectionsActor:ADMIN,collectionsSystemOwner:ADMIN,collectionsIsSystemOwner:true},res);assert.equal(res.body.explorerUrl,'https://explorer.example.org');assert.equal(res.body.capabilities.delegates,'admin_scoped_collection_policy');
  const {renderBundle}=require('./build-collections-backend.cjs');assert.match(renderBundle(),/explorerUrl: EXPLORER_URL/);
});
test('catalog paginates only allowlisted scoped records, caps pages and strips database internals',async()=>{
  const Token=memory(Array.from({length:503},(_,i)=>({id:'token-'+String(i).padStart(4,'0'),number:i+1,createdAt:'2026-10-16',_id:'mongo-'+i,__v:9,data:'private-buffer'})));
  Token.docs.push({scope:'other-contract',id:'foreign-token',number:1,createdAt:'2026-10-16'});
  const m=mounting({models:{GFNftToken:Token,GFNftCollection:memory([{id:'collection',createdAt:'2026-10-16'}]),GFNftHistory:memory([{id:'event',blockNumber:1,logIndex:1}]),GFNftRoyaltyPayment:memory([{id:'payment',blockNumber:1}])}});
  const handler=m.routes.get('GET /api/admin/collections/catalog');
  const page=response();await handler({query:{kind:'tokens',limit:'10000',offset:'0'}},page);assert.equal(page.body.ok,true);assert.equal(page.body.items.length,500);assert.equal(page.body.total,503);assert.equal(page.body.nextOffset,500);assert.equal(page.body.hasMore,true);assert.equal(page.body.items[0].id,'token-0000');assert.ok(page.body.items.every(row=>!('scope'in row)&&!('_id'in row)&&!('__v'in row)&&!('data'in row)));
  const tail=response();await handler({query:{kind:'tokens',offset:'500',limit:'100'}},tail);assert.equal(tail.body.items.length,3);assert.equal(tail.body.hasMore,false);assert.equal(tail.body.nextOffset,503);
  const beyond=response();await handler({query:{kind:'tokens',offset:'1000'}},beyond);assert.deepEqual(beyond.body.items,[]);assert.equal(beyond.body.hasMore,false);
  for(const kind of ['collections','history','royaltyPayments']){const r=response();await handler({query:{kind}},r);assert.equal(r.body.items.length,1);assert.equal(r.body.kind,kind);}
});
test('catalog rejects model injection, raw filters, invalid offsets and zero limits',async()=>{
  const m=mounting();const handler=m.routes.get('GET /api/admin/collections/catalog');
  for(const query of [{kind:'GFNftImage'},{kind:'__proto__'},{kind:'toString'},{kind:'tokens',offset:'-1'},{kind:'tokens',offset:'1.5'},{kind:'tokens',offset:['1']},{kind:'tokens',offset:'1000000000'},{kind:'tokens',limit:'0'},{kind:'tokens',filter:{$ne:null}},{kind:'tokens',scope:'other'}]){const r=response();await handler({query},r);assert.equal(r.statusCode,400,JSON.stringify(query));}
});
