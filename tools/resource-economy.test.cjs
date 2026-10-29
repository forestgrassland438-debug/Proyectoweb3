'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), acorn = require('acorn'), crypto = require('node:crypto');
const src = fs.readFileSync('C:/Users/pc/Desktop/server2.js', 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 'latest' });
function declaration(name, globals = {}) {
  const n = ast.body.find(x => x.type === 'FunctionDeclaration' && x.id.name === name);
  assert.ok(n, name); return vm.runInNewContext('(' + src.slice(n.start,n.end) + ')', { console, crypto, ...globals });
}
const create = declaration('createResourceEconomy');
const stats = (quantity, limit = 100, perInvoiceLimit = 20) => ({ totalQuantity: quantity, limit, perInvoiceLimit, invoiceCount: 2, totalBurned: 7, exists: true });
const fresh = options => create({ readStats: async () => stats(50), readPolicy: async () => null, knownTypes: ['wood'], ...options });
const plain = v => JSON.parse(JSON.stringify(v));

test('monotonic smooth policy, with explicit bounds and an independent invoice cap', () => {
  const engine = fresh(); let previous = engine.evaluate(stats(0));
  for (let pct = 1; pct <= 150; pct++) {
    const state = engine.evaluate(stats(pct));
    assert.ok(state.respawnSeconds >= previous.respawnSeconds); assert.ok(state.priceFactor >= previous.priceFactor);
    assert.ok(state.respawnSeconds <= 1800); assert.ok(state.priceFactor <= 2.5);
    if (pct <= 50) { assert.equal(state.respawnSeconds,60); assert.equal(state.priceFactor,1); }
    previous = state;
  }
  assert.equal(engine.evaluate(stats(99,100,1)).respawnSeconds,engine.evaluate(stats(99,100,100000)).respawnSeconds);
  assert.equal(engine.evaluate(stats(100)).remaining,'0'); assert.equal(engine.evaluate(stats(100)).exhausted,true);
  assert.equal(engine.evaluate(stats(75), { enabled:false }).priceFactor,1);
});
test('uint256 amounts stay exact beyond JavaScript safe integers', () => {
  const engine = fresh(), limit = (1n << 255n) - 1n, amount = limit - 1n;
  const state = engine.evaluate(stats(amount.toString(),limit.toString(),'999999999999999999999999'));
  assert.equal(state.remaining,'1'); assert.equal(state.totalQuantity,amount.toString()); assert.equal(state.limit,limit.toString());
});
test('invalid or absent chain data is never fabricated as empty supply', async () => {
  const engine = fresh({ readStats: async () => { throw new Error('RPC down'); } });
  await assert.rejects(engine.state('wood'), /RPC down/);
  await assert.rejects(engine.state('wood'), /resource_rpc_unavailable/);
  await assert.rejects(engine.state('invented'), /unknown_resource_table/);
  assert.equal(engine.metrics().active,0); assert.equal(engine.metrics().queued,0);
  assert.equal(fresh().evaluate({ ...stats(0), exists:false }).configured,false);
});
test('settings reject bad fields, inherited names, fractions and invalid ranges', () => {
  const engine = fresh();
  for (const cfg of [null,[],{ startPercent:100 },{ priceMax:6 },{ baseRespawn:60.5 },{ maxRespawn:30 },{ enabled:'true' },{ priceMax:NaN },{ constructor:1 },{ limit:10000000 }]) {
    assert.throws(() => engine.validate(cfg),/invalid_resource_policy|unknown_resource_policy_field/);
  }
});
test('ten thousand simultaneous policy readers share eight RPCs and three workers', async () => {
  const types = Array.from({length:8},(_,i)=>'r'+i); let reads=0, active=0, peak=0, time=100000;
  const engine = fresh({ knownTypes:types, now:()=>time, readStats: async () => {
    reads++; active++; peak=Math.max(peak,active); await new Promise(r=>setImmediate(r)); active--; return stats(80);
  }});
  await Promise.all(Array.from({length:10000},(_,i)=>engine.state(types[i%8])));
  assert.equal(reads,8); assert.ok(peak<=3); assert.deepEqual(plain(engine.metrics()),{ entries:8,active:0,queued:0 });
  time += 15001; await Promise.all(types.map(t=>engine.state(t))); assert.equal(reads,16);
});
test('gameplay never calls setLimit, including full or missing tables', async () => {
  const check = declaration('ensureItemTipoOnChain', { TABLAS_MANUALES:new Set(), tiposDeItemPermitidos:()=>new Set(['wood']) });
  let writes=0; const contract={ getTipoStats:async()=>stats(100), setLimit:async()=>{writes++;} };
  await assert.rejects(check(contract,'wood',1),/resource_capacity_exhausted/); assert.equal(writes,0);
  contract.getTipoStats=async()=>stats(2,100,1); await assert.rejects(check(contract,'wood',2),/resource_invoice_limit/);
  contract.getTipoStats=async()=>({ ...stats(0),exists:false }); await assert.rejects(check(contract,'wood',1),/resource_not_configured/);
  assert.equal(writes,0);
});
test('error grouping is stable across wallet addresses and request URL values', () => {
  const id=declaration('reporterFingerprint'), a='0x'+'a'.repeat(40), b='0x'+'b'.repeat(40);
  assert.equal(id('RPC failed '+a,'/game?v=123&address='+a),id('RPC failed '+b,'/game?v=456&address='+b));
  assert.notEqual(id('RPC failed','mint'),id('RPC failed','burn'));
});
test('live presence counts one authenticated account, not persisted or anonymous records', () => {
  const globals={ _liveGameAccounts:new Map() };
  const leave=declaration('livePresenceLeave',globals), join=declaration('livePresenceJoin',{...globals,livePresenceLeave:leave});
  const make=(id,address,player='Ana')=>({id,authenticatedAddress:address,authenticatedPlayer:player,handlers:[],once(_,fn){this.handlers.push(fn);}});
  const address='0x'+'a'.repeat(40), a=make('a',address),b=make('b',address),anon=make('c',null,null);
  join(a);join(a);join(b);join(anon);assert.equal(globals._liveGameAccounts.size,1);assert.equal(a.handlers.length,1);
  a.handlers[0]();assert.equal(globals._liveGameAccounts.size,1); b.handlers[0]();assert.equal(globals._liveGameAccounts.size,0);
});
test('new administrator routes require server authorization; mutations require CSRF', () => {
  for (const path of ['/api/admin/cuentas','/api/admin/presencia','/api/admin/recursos','/api/admin/recursos/config','/api/admin/recursos/simular','/api/admin/relay-failures/clear']) {
    const route=ast.body.find(n=>n.expression?.callee?.object?.name==='app'&&n.expression.arguments?.[0]?.value===path);
    assert.ok(route,path); const names=route.expression.arguments.filter(n=>n.type==='Identifier').map(n=>n.name);
    assert.ok(names.includes('adminAuth'),path);
    if(route.expression.callee.property.name==='post')assert.ok(names.includes('csrfProtection'),path);
  }
});
test('the clear-relay feature preserves transaction and payment history', () => {
  const route=ast.body.find(n=>n.expression?.callee?.object?.name==='app'&&n.expression.arguments?.[0]?.value==='/api/admin/relay-failures/clear');
  const code=src.slice(route.start,route.end);
  assert.ok(code.includes('ReporterInbox.findOneAndUpdate')); assert.ok(!code.includes('deleteMany'));assert.ok(!code.includes('RelayedTransaction.update'));
});
test('the account directory uses a strict projection that excludes every vault secret', () => {
  const route=ast.body.find(n=>n.expression?.callee?.object?.name==='app'&&n.expression.arguments?.[0]?.value==='/api/admin/cuentas');
  const code=src.slice(route.start,route.end);
  for(const secret of ['serverShare','deviceShares','recoveryEnc','passphraseEnc','subHash','JWT_SECRET','privateKey'])assert.ok(!code.includes(secret),secret);
  assert.ok(code.includes('projection:'));assert.ok(code.includes("res.set('Cache-Control', 'no-store')"));assert.ok(code.includes('limit(limit + 1)'));
});

test('resource purchase preflight rejects full capacity before accepting a mint batch', async()=>{
  let table={configured:true,remaining:'4',perInvoiceLimit:'2'};
  const check=declaration('resourcePurchaseBatch',{itemTipoOnChain:id=>id,RESOURCE_ITEM_IDS:{wood:'wood'},resourceState:async()=>table,
    ecoError:(code,status)=>Object.assign(new Error(code),{code,status})});
  assert.equal(await check('wood',4),2);assert.equal(await check('unregulated',99),null);
  await assert.rejects(check('wood',5),e=>e.code==='resource_capacity_exhausted');
  table={...table,configured:false};await assert.rejects(check('wood',1),e=>e.code==='resource_not_configured');
});
test('the actual preview handler reevaluates a live table without losing its existence or occupancy',async()=>{
  const engine=fresh(),row={tipo:'wood',available:true,...engine.evaluate(stats(75))};
  const route=ast.body.find(n=>n.expression?.arguments?.[0]?.value==='/api/admin/recursos/simular');
  const node=route.expression.arguments.at(-1);
  const handler=vm.runInNewContext('('+src.slice(node.start,node.end)+')',{resourceEconomy:engine,resourceSnapshot:async()=>({rows:[row]})});
  let result,status=200;const res={set(){return this},status(s){status=s;return this},json(d){result=d;return this}};
  await handler({body:{settings:{priceMax:3}}},res);
  assert.equal(status,200);assert.equal(result.rows[0].configured,true);assert.equal(result.rows[0].occupancy,75);assert.equal(result.rows[0].priceFactor,2);assert.equal(result.rows[0].respawnSeconds,930);assert.equal(result.curve.length,101);
});
test('a duplicate report insertion race still counts the occurrence, without retrying another error',async()=>{
  const calls=[];const upsert=declaration('reporterUpsert',{ErrorReport:{async findOneAndUpdate(key,update,options){calls.push(options);if(options.upsert)throw Object.assign(new Error('duplicate'),{code:11000});return{count:2};}}});
  assert.equal((await upsert({errorId:'same'},{$inc:{count:1}},{upsert:true,new:false})).count,2);assert.equal(calls.length,2);assert.equal(calls[1].upsert,false);
  const failing=declaration('reporterUpsert',{ErrorReport:{findOneAndUpdate(){throw new Error('database down')}}});await assert.rejects(failing({}, {},{}),/database down/);
});
test('a session cleanup failure cannot turn a committed payment into a failed response',async()=>{
  let committed=false;
  const run=declaration('ecoTransaccion',{console:{warn(){}},mongoose:{async startSession(){return{async withTransaction(fn){await fn();committed=true;},async endSession(){throw new Error('cleanup only')}};}}});
  assert.equal(await run(async()=>42),42);assert.equal(committed,true);
  await assert.rejects(run(async()=>{throw new Error('write failed')}),/write failed/);
});
test('mixed mine rewards skip full outputs and obey remaining and per-invoice capacity',()=>{
  const matrix=ast.body.flatMap(n=>n.declarations || []).find(n=>n.id?.name==='RESOURCE_NODE_REWARDS');
  const rewards=vm.runInNewContext(src.slice(matrix.init.start,matrix.init.end));
  const roll=declaration('resourceRollRewards',{RESOURCE_NODE_REWARDS:rewards,itemTipoOnChain:id=>id,rollGatherAmount:()=>3});
  const tables=[{tipo:'mineral_piedra',exhausted:true,remaining:'0',perInvoiceLimit:'50'},{tipo:'mineral_piedra_cobre',exhausted:false,remaining:'2',perInvoiceLimit:'1'}];
  const result=roll({type:'cobre'},'pico_de_hierro',tables,()=>0);
  assert.deepEqual(plain(result),[{tipo:'mineral_piedra_cobre',itemId:'mineral_piedra_cobre',quantity:1}]);
  assert.deepEqual(plain(roll({type:'cobre'},'pico_de_hierro',tables.map(t=>({...t,exhausted:true})),()=>0)),[]);
});
test('all existing world nodes are recognized and invented nodes cannot be claimed',()=>{
  const variable=ast.body.flatMap(n=>n.declarations || []).find(n=>n.id?.name==='RESOURCE_WORLD_NODES');
  const nodes=vm.runInNewContext(src.slice(variable.init.start,variable.init.end));const parse=declaration('gatherNodeTypeFromKey');
  assert.equal(nodes.size,105);for(const key of nodes)assert.ok(parse(key),key);
  assert.equal(nodes.has('sprite_pinos99999'),false);assert.equal(nodes.has('carbon_pngx3'),false);
});
module.exports={create,declaration,stats,src,ast};
