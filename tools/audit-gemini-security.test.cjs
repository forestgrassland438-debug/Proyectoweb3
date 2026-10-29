'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),acorn=require('acorn');
const source=fs.readFileSync('C:/Users/pc/Desktop/server2.js','utf8'),ast=acorn.parse(source,{ecmaVersion:'latest'});
const decl=name=>{const node=ast.body.find(n=>n.id?.name===name);assert.ok(node,name);return source.slice(node.start,node.end);};
function findMethod(name){let result;const walk=n=>{if(!n||typeof n!=='object')return;if(n.type==='MethodDefinition'&&n.key.name===name)result=n;for(const x of Object.values(n))if(Array.isArray(x))x.forEach(walk);else if(x&&typeof x==='object')walk(x);};walk(ast);assert.ok(result,name);return source.slice(result.start,result.end);}
const quiet={warn(){},error(){},log(){}};
function allocator(extra={}){const context={Promise,Math,console:quiet,relayerWallet:{address:'relayer'},provider:{getTransactionCount:async()=>7},...extra};vm.createContext(context);vm.runInContext(decl('RelayerNonceManager')+';this.manager=new RelayerNonceManager();',context);return context;}
test('one shared allocator gives 100 concurrent callers distinct consecutive nonces',async()=>{const c=allocator();const values=await Promise.all(Array.from({length:100},()=>c.manager.getNextNonce()));assert.deepEqual([...values],Array.from({length:100},(_,i)=>i+7));assert.equal(c.manager.pending,0);assert.equal(c.manager.lock,false);});
test('failed RPC reads never invent zero or wedge the allocator',async()=>{let down=true;const c=allocator({provider:{getTransactionCount:async()=>{if(down)throw new Error('unavailable');return 42;}}});await assert.rejects(c.manager.getNextNonce(),/unavailable/);down=false;assert.equal(await c.manager.getNextNonce(),42);assert.equal(c.manager.pending,0);});
test('nonce reset cannot recycle a reservation when the RPC pending count lags',async()=>{const c=allocator();assert.equal(await c.manager.getNextNonce(),7);await c.manager.resetNonce();assert.equal(await c.manager.getNextNonce(),8);});
test('nonce queue rejects excess requests and recovers after backpressure',async()=>{let release;const block=new Promise(r=>release=r);const c=allocator({provider:{getTransactionCount:async()=>{await block;return 7;}}});const promises=Array.from({length:520},()=>c.manager.getNextNonce());const settled=Promise.allSettled(promises);release();const results=await settled;assert.ok(results.some(x=>x.status==='rejected'&&x.reason.code==='RELAY_QUEUE_CAPACITY'));assert.equal(c.manager.pending,0);assert.equal((await c.manager.getNextNonce())>=7,true);});
test('subnet rules cover IPv6, mapped IPv4 and invalid inputs without substring matching',()=>{const f=vm.runInNewContext('({'+findMethod('isIPInSubnet')+'}).isIPInSubnet',{require});const cases=[['::ffff:192.168.1.8','192.168.1.0/24',true],['192.168.2.8','192.168.1.0/24',false],['2001:db8::abcd','2001:db8::/32',true],['2001:db9::1','2001:db8::/32',false],['::1','0:0:0:0:0:0:0:1',true],['192.168.1.8','192.168.1.0/99',false],['invalid','0.0.0.0/0',false]];for(const [ip,rule,expected]of cases)assert.equal(f(ip,rule),expected,ip+' '+rule);});
test('log filter preserves unrelated timeout, MongoDB, funds and stack errors',()=>{const f=vm.runInNewContext(decl('_isRpcNoise')+';_isRpcNoise');for(const text of ['MongoNetworkError timeout','insufficient funds','TypeError: undefined','Error: database unavailable'])assert.equal(f(text),false);assert.equal(f('JsonRpcProvider failed to detect network and cannot start up; retry in 1s'),true);});
test('merge keys isolate wallets and normalize numeric pair order',()=>{const f=vm.runInNewContext(decl('mergePairKey')+';mergePairKey');assert.equal(f('0xABC','10_2'),'0xabc:2_10');assert.notEqual(f('0xabc','2_10'),f('0xdef','2_10'));for(const value of ['1_1','0_2','__proto__','2_3_4'])assert.throws(()=>f('wallet',value));});
test('protected crafted outputs, experience and vitals cannot use generic relayer issuance',()=>{const setSource=ast.body.find(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='TABLAS_SOLO_SERVIDOR'));const c={TABLA_NIVEL:'nivel',TABLA_NOMBRE:'nombre',TABLA_CONS_PARCELAS:'parcelas',GF_ALLOC_KEYS:[]};vm.createContext(c);vm.runInContext(source.slice(setSource.start,setSource.end)+';this.tables=TABLAS_SOLO_SERVIDOR;',c);for(const stat of ['oro','plata','bronce','exp','vida','agua','comida'])assert.equal(c.tables.has(stat),true);assert.ok(source.includes("for(const recipe of require('./craft-recipes.json')) TABLAS_SOLO_ACUNA_SERVIDOR.add"));});
test('sensitive socket events target verified private rooms and crop reads check ownership',()=>{assert.ok(!source.includes("global.io.emit('relay_transaction_sent'"));assert.ok(!source.includes("global.io.emit('ip_blocked'"));assert.ok(source.includes("if (!assertCropOwner(userId, 'cropsError')) return;"));assert.ok(source.includes('socket.join("wallet:" + String(socket.authenticatedAddress).toLowerCase())'));});
test('NFT metadata requests are bounded, ordered and tolerate a failed or stalled RPC',async()=>{
 let active=0,maxActive=0;const context={Date,Number,Math,Promise,setTimeout,clearTimeout,uriNftLegible:x=>x};vm.createContext(context);const fn=vm.runInContext(decl('boundedNftMetadata')+';boundedNftMetadata',context),start=Date.now();
 const data=await fn({tokenURI:async id=>{active++;maxActive=Math.max(maxActive,active);if(id==='slow')return new Promise(()=>{});try{await new Promise(r=>setTimeout(r,2));if(id==='fail')throw Error('reverted');return 'uri:'+id;}finally{active--;}}},['1','fail','slow','4','5'],30);
 assert.ok(Date.now()-start<300);assert.ok(maxActive<=4);assert.equal(data.partial,true);assert.deepEqual(Array.from(data.tokens,t=>t.id),['1','fail','slow','4','5']);assert.equal(data.tokens[0].uri,'uri:1');assert.equal(data.tokens[2].uri,'');
});
test('native preflight failure cannot consume a nonce or call the transaction sender',async()=>{
 let allocations=0,sends=0;const c={gatherGasPrice:()=>1n,relayerNonceManager:{getNextNonce:async()=>{allocations++;return 9;}},console:quiet};vm.createContext(c);const fn=vm.runInContext(decl('txRelayer')+';txRelayer',c);
 await assert.rejects(fn('fixture',async()=>{sends++;},async()=>{throw Error('preflight rejected');}),/preflight rejected/);assert.equal(allocations,0);assert.equal(sends,0);
 let options;const receipt=await fn('fixture',async opts=>{sends++;options=opts;return {wait:async()=>({status:1})};},async()=>100000n);assert.equal(receipt.status,1);assert.equal(allocations,1);assert.equal(options.gasLimit,120000n);
});
test('a gather mint rejected by estimation does not leave a nonce gap',async()=>{
 let allocations=0;const contract={getTipoStats:async()=>({perInvoiceLimit:50}),getUserInventorySnapshot:async()=>[],createInvoice:async()=>{throw Error('should not send');}};contract.createInvoice.estimateGas=async()=>{throw Error('ExceedsTipoLimit');};
 const c={ethers:{Contract:function(){return contract;}},crypto:require('node:crypto'),Set,Date,Math,relayerWallet:{address:'owner'},CONTRACTS:{ITEMS_CONTRACT:{address:'contract',abi:[]}},gatherGasPrice:()=>1n,ensureItemTipoOnChain:async()=>{},facturasGuardadasEnCofres:async()=>new Set(),relayerNonceManager:{getNextNonce:async()=>{allocations++;return 7;},resetNonce:async()=>{}},console:quiet};
 vm.createContext(c);const fn=vm.runInContext(decl('mintGatherReward')+';mintGatherReward',c);assert.equal(await fn('owner','madera pinos',1),null);assert.equal(allocations,0);
});

test('settlement cannot clear a stat that changed while its old transaction was confirming',async()=>{
 const live={_id:'player',bronce:100,chainPending:['bronce'],invoiceIds:{bronce:9}},snapshot={...live,chainPending:[...live.chainPending],save(){throw Error('stale save forbidden');}};
 const c={console:quiet,clampStat:(_s,v)=>v,getStatsContract:()=>({}),getSafeGasPriceStats:async()=>1n,
  applyStatOnChain:async()=>{live.bronce=150;return {ok:true,chainQty:100};},PlayerStats:{updateOne:async(filter,update)=>{
   if(update.$pull){if(filter.bronce!==live.bronce)return {matchedCount:0};live.chainPending=live.chainPending.filter(s=>s!=='bronce');return {matchedCount:1};}
   if(filter['chainPending.0'] && live.chainPending.length)return {matchedCount:0};return {matchedCount:1};
  }}};
 vm.createContext(c);const settle=vm.runInContext(decl('liquidarPendientesDeCadena')+';liquidarPendientesDeCadena',c),result=await settle(snapshot);
 assert.equal(live.bronce,150);assert.deepEqual(live.chainPending,['bronce']);assert.deepEqual(Array.from(result.fallidos),['bronce']);
});
test('a missing stats invoice cannot be marked settled before its creation',async()=>{
 const c={console:quiet,getStatsContract:()=>({}),getSafeGasPriceStats:async()=>1n,PlayerStats:{updateOne:async()=>({matchedCount:0})}};
 vm.createContext(c);const settle=vm.runInContext(decl('liquidarPendientesDeCadena')+';liquidarPendientesDeCadena',c),result=await settle({_id:'player',playerName:'Ana',chainPending:['oro'],invoiceIds:{}});
 assert.deepEqual(Array.from(result.liquidados),[]);assert.deepEqual(Array.from(result.fallidos),['oro']);
});

test('native confirmation timeout remains uncertain and a proved revert is distinguished',async()=>{
 const c={gatherGasPrice:()=>1n,relayerNonceManager:{getNextNonce:async()=>7},console:quiet};vm.createContext(c);const native=vm.runInContext(decl('txRelayer')+';txRelayer',c);
 const timeout=Error('confirmation timeout');await assert.rejects(native('fixture',async()=>({hash:'known-hash',wait:async()=>{throw timeout;}}),async()=>21000n),e=>e.nativeSubmissionUncertain===true && e.transactionHash==='known-hash');
 const reverted=Object.assign(Error('confirmed revert'),{receipt:{status:0}});await assert.rejects(native('fixture',async()=>({wait:async()=>{throw reverted;}}),async()=>21000n),e=>e.nativeSubmissionUncertain===false);
});
test('rejected stats table setup and duplicate consolidation cannot reserve a nonce',async()=>{
 let allocations=0;const reject=async()=>{throw Error('preflight rejected');},setLimit=async()=>{throw Error('unexpected send');};setLimit.estimateGas=reject;
 const contract={getTipoStats:async()=>({exists:false,totalQuantity:0,limit:0,perInvoiceLimit:0}),setLimit,transferQuantityBetweenInvoices:Object.assign(async()=>{}, {estimateGas:reject})};
 const c={console:quiet,STAT_TIPO_CONFIG:{exp:{perInvoiceLimit:100,headroom:100,autoRaise:true}},_tipoCheckCache:new Map(),TIPO_CACHE_TTL_MS:1000,TIPO_RAISE_FACTOR:2,isVitalStat:()=>false,relayerNonceManager:{getNextNonce:async()=>{allocations++;return 7;}}};vm.createContext(c);
 const setup=vm.runInContext(decl('ensureStatTipo')+';ensureStatTipo',c);assert.equal((await setup(contract,'exp',1n)).exists,false);assert.equal(allocations,0);
 const consolidate=vm.runInContext(decl('consolidateDuplicateStatInvoices')+';consolidateDuplicateStatInvoices',c);assert.equal(await consolidate(contract,'oro',{id:1,cantidad:10},[{id:2,cantidad:5}],1n),10);assert.equal(allocations,0);
});
test('a rejected legacy material burn preflight cannot consume a relayer nonce',async()=>{
 let allocations=0;const del=Object.assign(async()=>{throw Error('unexpected send');},{estimateGas:async()=>{throw Error('not authorized');}}),contract={getUserInventorySnapshot:async()=>[{id:1,active:true,tipo:'wood',cantidad:2n}],deleteInvoice:del};
 const c={console:quiet,relayerWallet:{},ethers:{Contract:function(){return contract;}},CONTRACTS:{ITEMS_CONTRACT:{address:'contract',abi:[]}},gatherGasPrice:()=>1n,relayerNonceManager:{getNextNonce:async()=>{allocations++;return 7;},resetNonce:async()=>{}}};vm.createContext(c);
 const burn=vm.runInContext(decl('burnItemOnChain')+';burnItemOnChain',c);assert.equal(await burn('owner','wood',2),0);assert.equal(allocations,0);
});
