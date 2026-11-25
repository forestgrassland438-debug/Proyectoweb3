'use strict';
// Deterministic unit/integration tests: no private keys, real RPC, DB or game server.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createChainAudit, mergeAttribution, number, describeError, safeError, isRateLimited } = require('./litvm-chain-audit.cjs');
const contract = '0x' + 'c'.repeat(40), relayer = '0x' + 'd'.repeat(40);
const alice = '0x' + 'a'.repeat(40), bob = '0x' + 'b'.repeat(40);
const h = n => '0x' + BigInt(n).toString(16).padStart(64, '0');
const clone = value => value === undefined ? undefined : structuredClone(value);
function values(doc, key) {
  let values = [doc];
  for (const part of key.split('.')) values = values.flatMap(v => Array.isArray(v)
    ? v.map(item => item && item[part]) : [v && v[part]]);
  return values;
}
function equal(a, b) { return a instanceof Date || b instanceof Date ? +new Date(a) === +new Date(b) : a === b; }
function match(doc, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return expected.some(f => match(doc, f));
    if (key === '$and') return expected.every(f => match(doc, f));
    const got = values(doc, key);
    if (expected instanceof RegExp) return got.some(v => expected.test(v));
    if (!expected || typeof expected !== 'object' || expected instanceof Date) return got.some(v => equal(v, expected));
    return Object.entries(expected).every(([op, operand]) => {
      if (op === '$in') return got.some(v => operand.some(x => equal(v, x)));
      if (op === '$nin') return got.every(v => !operand.some(x => equal(v, x)));
      if (op === '$ne') return got.every(v => !equal(v, operand));
      if (op === '$lt') return got.some(v => v < operand);
      if (op === '$lte') return got.some(v => v <= operand);
      if (op === '$gt') return got.some(v => v > operand);
      if (op === '$exists') return got.some(v => (v !== undefined) === operand);
      if (op === '$regex') return got.some(v => operand.test(v));
      throw new Error('unsupported test filter ' + op);
    });
  });
}
function makeMemory() {
  class Query {
    constructor(read, one = false) { this.read = read; this.one = one; this.sorting = null; this.max = Infinity; }
    select() { return this; } lean() { return this; } sort(s) { this.sorting = s; return this; }
    limit(n) { this.max = n; return this; }
    result() {
      let rows = this.read();
      if (this.sorting) rows = rows.slice().sort((a,b) => {
        for (const [k, direction] of Object.entries(this.sorting)) if (!equal(a[k],b[k])) return a[k] > b[k] ? direction : -direction;
        return 0;
      });
      rows = rows.slice(0, this.max);
      return clone(this.one ? rows[0] || null : rows);
    }
    then(resolve,reject) { return Promise.resolve().then(() => this.result()).then(resolve,reject); }
    async *cursor() { for (const row of this.result()) yield row; }
  }
  function model(initial = []) {
    const rows = clone(initial);
    function key(doc) { return doc._id || (doc.txHash ? doc.chainId + ':' + doc.contractAddress + ':' + doc.txHash : null); }
    function apply(row, update, inserted) {
      if (inserted) Object.assign(row, clone(update.$setOnInsert || {}));
      Object.assign(row, clone(update.$set || {}));
      for (const k of Object.keys(update.$unset || {})) delete row[k];
      for (const [k,v] of Object.entries(update.$inc || {})) row[k] = (row[k] || 0) + v;
      for (const [k,v] of Object.entries(update.$addToSet || {})) { row[k] ||= []; if (!row[k].includes(v)) row[k].push(clone(v)); }
    }
    function update(filter, upd, options = {}, many = false) {
      const found = rows.filter(row => match(row, filter));
      const chosen = many ? found : found.slice(0,1);
      if (!chosen.length && options.upsert) {
        const row = Object.fromEntries(Object.entries(filter).filter(([k,v]) => !k.startsWith('$') &&
          (v === null || typeof v !== 'object')));
        apply(row, upd, true);
        if (rows.some(r => key(r) && key(r) === key(row))) { const error = new Error('duplicate'); error.code = 11000; throw error; }
        rows.push(row); return { matchedCount: 0, upsertedCount: 1, row };
      }
      for (const row of chosen) apply(row, upd, false);
      return { matchedCount: chosen.length, row: chosen[0] || null };
    }
    return { rows, init: async() => {}, createCollection: async() => {}, createIndexes: async() => {},
      find: f => new Query(() => rows.filter(row => match(row,f))),
      findOne: f => new Query(() => rows.filter(row => match(row,f)),true),
      findById: id => new Query(() => rows.filter(row => row._id === id),true),
      updateOne: async(f,u,o) => update(f,u,o), updateMany: async(f,u,o) => update(f,u,o,true),
      countDocuments: async f => rows.filter(row => match(row,f)).length,
      findOneAndUpdate: (f,u,o) => new Query(() => { const r=update(f,u,o); return r.row ? [r.row] : []; },true) };
  }
  class Schema { constructor() {} index() {} }
  const models = {};
  const mongoose = { Schema, models, model: name => models[name] ||= model() };
  return { mongoose, model };
}
const fakeEthers = {
  getCreateAddress: ({from,nonce}) => from===relayer&&Number(nonce)===0 ? contract : alice,
  Interface: class {
    constructor() {}
    parseTransaction({data}) {
      if (data === 'createAlice') return {name:'createInvoice',args:[alice,'wood',1n,'alice-wood']};
      if (data === 'createBob') return {name:'createInvoice',args:[bob,'wood',1n,'bob-wood']};
      if (data === 'increase1') return {name:'increaseInvoiceQuantity',args:[1n,1n]};
      if (data === 'decrease1') return {name:'decreaseInvoiceQuantity',args:[1n,1n]};
      if (data === 'transferAB') return {name:'transferInvoice',args:[alice,bob,1n,1n,'bob-wood']};
      if (data === 'admin') return {name:'setLimit',args:['wood',100n,10n]};
      return null;
    }
    parseLog(log) { return log.parsed || null; }
  },
  Transaction: { from: signed => signed }
};
function setup({ hanging = false, ...auditOptions } = {}) {
  const db = makeMemory(), blocks = new Map(), receipts = new Map(), txs = new Map(), requests = [];
  for(let n=0;n<=100;n++) blocks.set(n,{number:'0x'+n.toString(16),hash:h(1000+n),timestamp:'0x'+(10000+n).toString(16),transactions:[]});
  const players = db.model([{playerName:'Alice',address:alice},{playerName:'Bob',address:bob}]);
  const legacy = db.model();
  let head = 6, code = '0x6000', chain = '0x1159', broadcastCalls = 0, firstCodeBlock = null;
  const provider = { send: async(method,params) => {
    requests.push([method,clone(params)]);
    if(method === 'eth_chainId') return chain;
    if(method === 'eth_getCode') return params[1]!=='latest'&&firstCodeBlock!==null&&Number(BigInt(params[1]))<firstCodeBlock ? '0x' : code;
    if(method === 'eth_blockNumber') return '0x'+head.toString(16);
    if(method === 'eth_getBlockByNumber') return clone(blocks.get(Number(BigInt(params[0]))) || null);
    if(method === 'eth_getTransactionReceipt') return clone(receipts.get(params[0]) || null);
    if(method === 'eth_getTransactionByHash') return clone(txs.get(params[0]) || null);
    throw new Error('unsupported RPC '+method);
  }, broadcastTransaction: async tx => { broadcastCalls++; return {hash:tx.hash,marker:'original'}; } };
  const audit = createChainAudit({ mongoose:db.mongoose,ethers:fakeEthers,provider,GamePlayer:players,
    RelayTransaction:legacy,contractAddress:contract,chainId:4441,confirmations:2,reorgDepth:4,
    getRelayerWallet:()=>({address:relayer}),logger:{warn(){}},rpcTimeoutMs:1000,
    rpcMinIntervalMs:0, retryBaseMs:20, retryMaxMs:200, random:()=>0.5, ...auditOptions });
  if(hanging) audit.Transaction.createIndexes = () => new Promise(()=>{});
  function add(n,input,status,events=[],sender=relayer,id=100+n) {
    const transactionIndex='0x'+blocks.get(n).transactions.length.toString(16);
    const tx={hash:h(id),from:sender,to:contract,nonce:'0x'+n.toString(16),input,value:'0x0',transactionIndex};
    txs.set(tx.hash,tx); blocks.get(n).transactions.push(tx);
    receipts.set(tx.hash,{transactionHash:tx.hash,blockNumber:'0x'+n.toString(16),blockHash:blocks.get(n).hash,
      transactionIndex,status:'0x'+status,gasUsed:'0x5208',effectiveGasPrice:'0x1',
      logs:events.map(parsed=>({address:contract,parsed}))});
    return tx;
  }
  return {audit,db,blocks,receipts,txs,requests,legacy,players,provider,add,
    setHead:n=>head=n,setCode:v=>code=v,setChain:v=>chain=v,setFirstCodeBlock:n=>firstCodeBlock=n,
    broadcastCalls:()=>broadcastCalls};
}
const created = {name:'InvoiceCreated',args:[1n,'alice-wood',alice,{hash:h(555)},1n,10003n]};
const bandwidthError = () => Object.assign(new Error('exceeded maximum retry limit'), {
  code:'SERVER_ERROR',info:{requestUrl:'https://rpc.test/?apiKey=private-key',
    responseBody:JSON.stringify({jsonrpc:'2.0',id:2677,error:{code:-31002,message:'Bandwidth limit exceeded'}})}
});
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
function addDeployment(s,n=3,id=903) {
  const tx=s.add(n,'0x6000',1,[],relayer,id);
  Object.assign(tx,{to:null,nonce:'0x0',chainId:'0x1159',blockNumber:'0x'+n.toString(16),blockHash:s.blocks.get(n).hash});
  Object.assign(s.receipts.get(tx.hash),{from:relayer,to:null,contractAddress:contract});
  s.setFirstCodeBlock(n);return tx;
}
function interruptedState(s,nextBlock=2) {
  s.audit.Scan.rows.push({_id:4441+':'+contract,...s.audit.scope,status:'error',nextBlock,coverageStartBlock:0,
    startedAt:new Date(1),lastProcessedBlock:nextBlock-1,lastProcessedHash:s.blocks.get(nextBlock-1).hash,
    leaseUntil:new Date(0),generation:1,processedBlocks:nextBlock,autoResume:true});
}

test('verified nonce-zero CREATE skips predeployment blocks without claiming genesis coverage or deleting saved rows',async()=>{
  const s=setup({deploymentTxHash:h(903)});const deployment=addDeployment(s);s.add(4,'createAlice',1,[created]);
  interruptedState(s);
  s.audit.Transaction.rows.push({...s.audit.scope,txHash:h(777),status:'unknown',canonical:false,source:'legacy'});
  s.players.rows[0].txCount=77;const oldPlayers=clone(s.players.rows);
  await s.audit.startScan({resume:true});await s.audit._test.getRunning();
  const state=await s.audit.getScanStatus();
  assert.equal(state.status,'complete');assert.equal(state.coverageStartBlock,3);assert.equal(state.fromBlock,3);
  assert.equal(state.nextBlock,6);assert.equal(state.historyComplete,false);
  assert.equal(state.contractExecutionHistoryComplete,true);assert.equal(state.coverageBasis,'verified_first_create');
  assert.equal(state.deploymentBlock,3);assert.equal(state.deploymentTxHash,deployment.hash);
  assert.equal(state.deploymentBlockHash,s.blocks.get(3).hash);
  assert.equal(s.requests.some(([method,args])=>method==='eth_getBlockByNumber'&&args[1]===true&&BigInt(args[0])<3n),false);
  assert.equal(s.audit.Transaction.rows.some(row=>row.txHash===h(777)),true);
  assert.deepEqual(s.players.rows,oldPlayers);assert.equal(state.indexedTransactions,2);
});

test('a mismatched deployment proof never jumps over the durable checkpoint or claims complete execution history',async()=>{
  const cases=[
    s=>{s.receipts.get(h(903)).contractAddress=alice;},
    s=>{s.txs.get(h(903)).nonce='0x1';},
    s=>{s.txs.get(h(903)).chainId='0x1';},
    s=>{s.txs.get(h(903)).from=alice;s.receipts.get(h(903)).from=alice;},
    s=>{s.blocks.get(3).hash=h(9999);},
    s=>{s.blocks.get(3).transactions=[];},
    s=>{s.setFirstCodeBlock(0);}
  ];
  for(const damage of cases) {
    const s=setup({deploymentTxHash:h(903)});addDeployment(s);interruptedState(s);damage(s);
    await assert.rejects(s.audit.startScan({resume:true}),/invalid_deployment_proof_/);
    const state=await s.audit.getScanStatus();assert.equal(state.nextBlock,2);assert.equal(state.status,'error');
    assert.equal(state.autoResume,false);assert.equal(state.historyComplete,false);
    assert.equal(state.contractExecutionHistoryComplete,false);assert.equal(state.deploymentBlock,undefined);
    assert.equal(s.requests.some(([method,args])=>method==='eth_getBlockByNumber'&&args[1]===true),false);
  }
  assert.throws(()=>setup({deploymentTxHash:'invalid'}),/invalid_deployment_proof_hash_configuration/);
});

test('an RPC quota failure while proving deployment preserves the old checkpoint and schedules a safe retry',async()=>{
  const s=setup({deploymentTxHash:h(903)});addDeployment(s);interruptedState(s);
  const original=s.provider.send;s.provider.send=async(method,args)=>{
    if(method==='eth_getCode'&&args[1]==='0x2')throw bandwidthError();return original(method,args);
  };
  await assert.rejects(s.audit.startScan({resume:true}),error=>isRateLimited(error));
  const state=await s.audit.getScanStatus();assert.equal(state.nextBlock,2);assert.equal(state.status,'retrying');
  assert.equal(state.deploymentBlock,undefined);assert.equal(state.contractExecutionHistoryComplete,false);
  assert.equal(s.requests.some(([method,args])=>method==='eth_getBlockByNumber'&&args[1]===true),false);
});

test('a replacement worker revalidates the saved deployment proof and retains its resumed coverage range',async()=>{
  const s=setup({deploymentTxHash:h(903)});addDeployment(s);s.add(4,'createAlice',1,[created]);
  s.setHead(20);
  await s.audit.startScan();await s.audit._test.getRunning();
  const row=s.audit.Scan.rows[0];Object.assign(row,{status:'running',autoResume:true,leaseUntil:new Date(0),
    nextBlock:18,lastProcessedBlock:17,lastProcessedHash:s.blocks.get(17).hash,owner:'old-process'});
  s.requests.length=0;
  const next=createChainAudit({mongoose:s.db.mongoose,ethers:fakeEthers,provider:s.provider,GamePlayer:s.players,
    RelayTransaction:s.legacy,contractAddress:contract,chainId:4441,confirmations:2,reorgDepth:4,rpcMinIntervalMs:0,
    logger:{warn(){}}});
  await next._test.maintain();await next._test.getRunning();
  const state=await next.getScanStatus();assert.equal(state.status,'complete');assert.equal(state.deploymentTxHash,h(903));
  assert.equal(state.coverageBasis,'verified_first_create');assert.equal(state.coverageStartBlock,3);
  assert.equal(state.historyComplete,false);assert.equal(state.contractExecutionHistoryComplete,true);
  assert.equal(next.Transaction.rows.length,2);
  assert.ok(s.requests.some(([method,args])=>method==='eth_getTransactionReceipt'&&args[0]===h(903)));
  assert.ok(s.requests.some(([method,args])=>method==='eth_getCode'&&args[1]==='0x2'));
  assert.equal(state.fromBlock,14,'automatic recovery retains the checkpoint with its four-block reorg overlap');
  assert.equal(s.requests.some(([method,args])=>method==='eth_getBlockByNumber'&&args[1]===true&&BigInt(args[0])<14n),false);
  s.requests.length=0;
  await next.startScan({fromBlock:0});await next._test.getRunning();
  assert.equal((await next.getScanStatus()).fromBlock,16,
    'the normal analizarCC request from zero is clamped to deployment and must not restart completed history');
  assert.equal(s.requests.some(([method,args])=>method==='eth_getBlockByNumber'&&args[1]===true&&BigInt(args[0])<16n),false);
  assert.equal(next.Transaction.rows.length,2);
  await next.dispose();
});

test('a changed canonical deployment block rebuilds from the reverified creation without duplicating ledger hashes',async()=>{
  const s=setup({deploymentTxHash:h(903)});const deployment=addDeployment(s);
  await s.audit.startScan();await s.audit._test.getRunning();
  s.blocks.get(3).transactions=[];s.blocks.get(2).transactions=[deployment];
  Object.assign(deployment,{blockNumber:'0x2',blockHash:s.blocks.get(2).hash,transactionIndex:'0x0'});
  Object.assign(s.receipts.get(deployment.hash),{blockNumber:'0x2',blockHash:s.blocks.get(2).hash,transactionIndex:'0x0'});
  s.blocks.get(5).hash=h(9905);s.setFirstCodeBlock(2);s.requests.length=0;
  await s.audit.startScan({resume:true});await s.audit._test.getRunning();
  const state=await s.audit.getScanStatus();assert.equal(state.deploymentBlock,2);assert.equal(state.coverageStartBlock,2);
  assert.equal(state.reorgDetected,true);assert.equal(state.contractExecutionHistoryComplete,true);
  assert.equal(state.historyComplete,false);assert.equal(s.audit.Transaction.rows.length,1);
  assert.equal(s.audit.Transaction.rows[0].blockNumber,2);
  assert.ok(s.requests.some(([method,args])=>method==='eth_getBlockByNumber'&&args[0]==='0x2'&&args[1]===true));
});

test('explicit genesis mode ignores configured and persisted deployment shortcuts and widens coverage safely',async()=>{
  const s=setup({deploymentTxHash:h(903)});addDeployment(s);s.add(4,'createAlice',1,[created]);
  await s.audit.startScan();await s.audit._test.getRunning();
  Object.assign(s.audit.Scan.rows[0],{status:'running',autoResume:true,owner:'previous-process',leaseUntil:new Date(0)});
  s.requests.length=0;
  const next=createChainAudit({mongoose:s.db.mongoose,ethers:fakeEthers,provider:s.provider,GamePlayer:s.players,
    RelayTransaction:s.legacy,contractAddress:contract,chainId:4441,confirmations:2,reorgDepth:4,rpcMinIntervalMs:0,
    scanFromGenesis:true,deploymentTxHash:'invalid-is-ignored-in-genesis-mode',logger:{warn(){}}});
  await next._test.maintain();await next._test.getRunning();
  const state=await next.getScanStatus();assert.equal(state.coverageBasis,'genesis');assert.equal(state.coverageStartBlock,0);
  assert.equal(state.historyComplete,true);assert.equal(state.contractExecutionHistoryComplete,true);
  assert.equal(next.Transaction.rows.length,2);
  assert.ok(s.requests.some(([method,args])=>method==='eth_getBlockByNumber'&&args[0]==='0x0'&&args[1]===true));
  assert.equal(s.requests.some(([method,args])=>method==='eth_getTransactionByHash'&&args[0]===h(903)),false);
  await next.dispose();
});

test('wrapped ethers bandwidth errors expose the real RPC code without endpoint credentials',()=>{
  const error=bandwidthError(); assert.equal(isRateLimited(error),true);
  assert.deepEqual(describeError(error),{code:-31002,codeName:null,message:'Bandwidth limit exceeded',stage:null});
  assert.doesNotMatch(safeError(error),/private-key|rpc\.test/);
});

test('audit RPC reads use a separate provider, remain serialized and paced, and never delay broadcasts',async()=>{
  const starts=[];let active=0,maxActive=0,release;
  const gate=new Promise(resolve=>release=resolve);
  const readProvider={send:async()=>{
    starts.push(Date.now());active++;maxActive=Math.max(active,maxActive);
    try { if(starts.length===1)await gate;else await pause(3);return '0x6'; }
    finally {active--;}
  }};
  const s=setup({readProvider,rpcMinIntervalMs:15});s.audit.installLiveCapture();
  const reads=Promise.all([s.audit._test.rpc('eth_blockNumber',[]),s.audit._test.rpc('eth_blockNumber',[]),
    s.audit._test.rpc('eth_blockNumber',[])]);
  await new Promise(resolve=>setImmediate(resolve));
  const signed={hash:h(998),from:relayer,to:contract,nonce:8,data:'increase1',value:0,chainId:4441n};
  const response=await Promise.race([s.provider.broadcastTransaction(signed),pause(100).then(()=>{throw new Error('broadcast delayed');})]);
  assert.equal(response.marker,'original');assert.equal(s.broadcastCalls(),1);
  release();assert.deepEqual(await reads,['0x6','0x6','0x6']);
  assert.equal(maxActive,1);assert.equal(s.requests.length,0);
  assert.ok(starts[1]-starts[0]>=12);assert.ok(starts[2]-starts[1]>=12);
  await s.audit.dispose();
});

test('bandwidth cooldown keeps the last complete block and resumes after a new worker starts without duplicate hashes',async()=>{
  const s=setup({retryBaseMs:60});s.add(1,'createAlice',1,[created]);s.add(3,'increase1',1,[]);
  const original=s.provider.send;let failures=0;
  s.provider.send=async(method,args)=>{
    if(method==='eth_getBlockByNumber'&&args[0]==='0x3'&&args[1]===false&&failures++===0)throw bandwidthError();
    return original(method,args);
  };
  await s.audit.startScan();await s.audit._test.getRunning();
  const saved=await s.audit.getScanStatus();
  assert.equal(saved.status,'retrying');assert.equal(saved.phase,'rpc_cooldown');assert.equal(saved.nextBlock,3);
  assert.equal(saved.lastProcessedBlock,2);assert.equal(saved.errorDiagnostic.code,-31002);
  assert.equal(saved.retryReason,'rpc_rate_limited');assert.equal(saved.retryCount,1);
  assert.ok(new Date(saved.nextRetryAt)>new Date());assert.equal(saved.autoResume,true);
  assert.equal(s.audit.Transaction.rows.length,2,'partial block row must survive its interrupted checkpoint');
  const afterFailure=s.requests.length;await s.audit.startScan();
  assert.equal(s.requests.length,afterFailure,'clicking during cooldown cannot force additional RPC calls');
  await s.audit.dispose();
  const next=createChainAudit({mongoose:s.db.mongoose,ethers:fakeEthers,provider:s.provider,GamePlayer:s.players,
    RelayTransaction:s.legacy,contractAddress:contract,chainId:4441,confirmations:2,reorgDepth:4,
    rpcMinIntervalMs:0,retryBaseMs:60,retryMaxMs:200,random:()=>0.5,logger:{warn(){}}});
  await next._test.maintain();
  assert.equal(s.requests.length,afterFailure,'new process honors the persisted cooldown before any chain read');
  await pause(Math.max(0,new Date(saved.nextRetryAt).getTime()-Date.now())+10);
  await next._test.maintain();await next._test.getRunning();
  const completed=await next.getScanStatus();
  assert.equal(completed.status,'complete');assert.equal(completed.nextBlock,6);
  assert.equal(completed.indexedTransactions,2);assert.equal(next.Transaction.rows.length,2);
  assert.equal(completed.retryCount,0);assert.equal(completed.nextRetryAt,null);
  const generation=completed.generation;s.requests.length=0;
  await next._test.maintain();await next._test.getRunning();
  assert.equal((await next.getScanStatus()).generation,generation,'maintenance never restarts a completed scan');
  assert.equal(s.requests.some(([method,args])=>method==='eth_getBlockByNumber'&&args[1]===true),false);
  await next.dispose();
});

test('a rate limit during initial validation persists scan intent and retries exponentially across restarts',async()=>{
  const s=setup({retryBaseMs:25,retryMaxMs:100});let attempts=0;
  const original=s.provider.send;
  s.provider.send=async(method,args)=>{
    if(method==='eth_chainId'&&attempts++<2)throw bandwidthError();
    return original(method,args);
  };
  await assert.rejects(s.audit.startScan(),error=>describeError(error).code===-31002);
  let state=await s.audit.getScanStatus();assert.equal(state.status,'retrying');assert.equal(state.nextBlock,0);
  assert.equal(state.autoResume,true);assert.equal(state.retryCount,1);assert.equal(attempts,1);
  await s.audit.startScan();assert.equal(attempts,1,'first rate response is not retried immediately');
  await pause(Math.max(0,new Date(state.nextRetryAt).getTime()-Date.now())+5);
  const before=Date.now();await assert.rejects(s.audit.startScan(),error=>isRateLimited(error));
  state=await s.audit.getScanStatus();assert.equal(state.retryCount,2);
  assert.ok(new Date(state.nextRetryAt).getTime()-before>=45,'second consecutive failure doubles the cooldown');
  await pause(Math.max(0,new Date(state.nextRetryAt).getTime()-Date.now())+5);
  s.audit.startMaintenance();
  await s.audit._test.maintain();await s.audit._test.getRunning();
  assert.equal((await s.audit.getScanStatus()).status,'complete');assert.equal(attempts,3);
  await s.audit.dispose();
});

test('automatic recovery of an expired worker preserves a partial coverage range and ledger data',async()=>{
  const s=setup();s.add(4,'createAlice',1,[created]);
  await s.audit.startScan({fromBlock:3});await s.audit._test.getRunning();
  const row=s.audit.Scan.rows[0];Object.assign(row,{status:'running',phase:'indexing',autoResume:true,
    nextBlock:5,lastProcessedBlock:4,lastProcessedHash:s.blocks.get(4).hash,leaseUntil:new Date(0),owner:'old-process'});
  const oldHashes=s.audit.Transaction.rows.map(tx=>tx.txHash);s.requests.length=0;
  const next=createChainAudit({mongoose:s.db.mongoose,ethers:fakeEthers,provider:s.provider,GamePlayer:s.players,
    RelayTransaction:s.legacy,contractAddress:contract,chainId:4441,confirmations:2,reorgDepth:4,rpcMinIntervalMs:0,
    logger:{warn(){}}});
  await next._test.maintain();await next._test.getRunning();
  const status=await next.getScanStatus();assert.equal(status.status,'complete');assert.equal(status.coverageStartBlock,3);
  assert.equal(status.historyComplete,false);assert.equal(status.nextBlock,6);
  assert.deepEqual(next.Transaction.rows.map(tx=>tx.txHash),oldHashes);
  assert.equal(s.requests.some(([method,args])=>method==='eth_getBlockByNumber'&&args[0]==='0x0'),false,
    'resume must not widen the requested coverage to genesis');
  await next.dispose();
});

test('Mongo 14031 explains disk exhaustion and retries indexes after storage recovers without resetting data',async()=>{
  const s=setup(); s.add(3,'createAlice',1,[created]);
  s.players.rows[0].txCount=77;
  s.players.rows[0].playtimeSeconds=3600;
  const savedPlayers=clone(s.players.rows);
  const legacyRow={txHash:h(701),chainId:4441,contractAddress:contract,playerName:'Bob',playerAddress:bob,status:'confirmed'};
  s.legacy.rows.push(legacyRow);
  const savedLegacy=clone(s.legacy.rows);
  let attempts=0;
  // Mongoose .init() is deliberately poisoned. Recovery must use public
  // createCollection/createIndexes, which are independently retryable.
  s.audit.Transaction.init=async()=>{throw new Error('cached_model_init_rejection');};
  s.audit.Transaction.createIndexes=async()=>{
    if(++attempts===1) throw Object.assign(new Error('Index build failed: out of disk space'),{
      code:14031,codeName:'OutOfDiskSpace'});
  };
  await assert.rejects(s.audit.startScan(),error=>error.code===14031 && error.stage==='mongo_indexes');
  const failure=await s.audit.getScanStatus();
  assert.equal(failure.status,'idle'); assert.equal(failure.nextBlock,0);
  assert.equal(failure.initializationDiagnostic.code,14031);
  assert.equal(failure.initializationDiagnostic.codeName,'OutOfDiskSpace');
  assert.equal(failure.initializationDiagnostic.stage,'mongo_indexes');
  assert.equal(s.audit.Transaction.rows.length,0);
  assert.equal(s.requests.length,0,'must not scan before the unique index exists');
  await s.audit.startScan(); await s.audit._test.getRunning();
  await s.audit.importLegacy(); await s.audit.importLegacy();
  assert.equal(attempts,2);
  assert.equal((await s.audit.getScanStatus()).initializationDiagnostic,undefined);
  assert.equal(s.audit.Transaction.rows.length,2,'legacy hash import remains idempotent');
  assert.deepEqual(s.players.rows,savedPlayers); assert.deepEqual(s.legacy.rows,savedLegacy);
  await s.audit.startScan(); await s.audit._test.getRunning();
  assert.equal(s.audit.Transaction.rows.length,2,'recovery and rescan do not duplicate hashes');
});

test('numeric diagnostics from older deployments are explained read-only and clear when import succeeds',async()=>{
  const s=setup();
  s.audit.Scan.rows.push({_id:4441+':'+contract,...s.audit.scope,status:'idle',nextBlock:0,legacyImportError:'14031'});
  const before=clone(s.audit.Scan.rows);
  const status=await s.audit.getScanStatus();
  assert.equal(status.legacyImportDiagnostic.code,14031);
  assert.equal(status.legacyImportDiagnostic.codeName,'OutOfDiskSpace');
  assert.equal(status.legacyImportDiagnostic.stage,'mongo_legacy_import');
  assert.deepEqual(s.audit.Scan.rows,before,'GET must not write diagnostics to a full DB');
  await s.audit.importLegacy();
  assert.equal((await s.audit.getScanStatus()).legacyImportDiagnostic,undefined);
  assert.equal((await s.audit.getScanStatus()).legacyImportError,undefined);
});

test('diagnostics preserve zero and signed codes, stage and names while removing endpoint credentials and signed bytes',()=>{
  const payload='0x'+'a'.repeat(200);
  const error=Object.assign(new Error('RPC https://rpc.test/?key=secret Mongo mongodb+srv://user:password@db.test/game '+
    'Bearer token-value privateKey=key-value '+payload),{code:-32000,codeName:'RpcFailure',stage:'rpc_chain_validation'});
  const diagnostic=describeError(error);
  assert.equal(diagnostic.code,-32000); assert.equal(diagnostic.codeName,'RpcFailure');
  assert.equal(diagnostic.stage,'rpc_chain_validation');
  assert.match(diagnostic.message,/\[endpoint\]/); assert.match(diagnostic.message,/\[payload\]/);
  assert.doesNotMatch(JSON.stringify(diagnostic),/user:password|key=secret|token-value|key-value|a{100}/);
  assert.match(safeError(error),/^-32000: RpcFailure:/);
  assert.equal(describeError({code:0,message:'zero'}).code,0);
  assert.equal(describeError({code:'14031',message:'disk'}).codeName,'OutOfDiskSpace');
});

test('collection creation failures retain their Mongo stage and recover on the next request',async()=>{
  const s=setup(); let attempts=0;
  s.audit.Transaction.createCollection=async()=>{
    if(++attempts===1) throw Object.assign(new Error('Storage quota exceeded'),{code:14031});
  };
  await assert.rejects(s.audit.startScan(),error=>error.stage==='mongo_collections');
  assert.equal((await s.audit.getScanStatus()).initializationDiagnostic.codeName,'OutOfDiskSpace');
  await s.audit.startScan(); await s.audit._test.getRunning();
  assert.equal((await s.audit.getScanStatus()).status,'complete');
});

// Opt-in integration test starts a fresh localhost mongod in a temporary folder.
// It never uses a configured application URI, .env, existing DB or private key.
test('real Mongoose/MongoDB index failure 14031 recovers with the unique ledger and existing rows intact',{
  skip:!process.env.LITVM_TEST_MONGODB_BIN || !process.env.LITVM_TEST_MONGOOSE_ROOT,timeout:45000
},async()=>{
  const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),net=require('node:net');
  const {spawn}=require('node:child_process'),{createRequire}=require('node:module');
  const load=createRequire(path.join(process.env.LITVM_TEST_MONGOOSE_ROOT,'package.json'));
  const mongoose=load('mongoose');
  const tmpBase=path.resolve(os.tmpdir());
  const tempRoot=await fs.mkdtemp(path.join(tmpBase,'litvm-mongo-index-recovery-'));
  const port=await new Promise((resolve,reject)=>{
    const server=net.createServer();server.on('error',reject);
    server.listen(0,'127.0.0.1',()=>{const chosen=server.address().port;server.close(()=>resolve(chosen));});
  });
  const mongod=spawn(process.env.LITVM_TEST_MONGODB_BIN,['--dbpath',tempRoot,'--port',String(port),
    '--bind_ip','127.0.0.1','--setParameter','enableTestCommands=1'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let startupOutput='',connection,audit;
  for(const pipe of [mongod.stdout,mongod.stderr]) pipe.on('data',data=>{startupOutput=(startupOutput+data).slice(-10000);});
  try {
    for(let attempt=0;attempt<80;attempt++) {
      if(mongod.exitCode!==null) throw new Error('isolated_mongod_stopped '+startupOutput);
      try {
        await new Promise((resolve,reject)=>{const socket=net.connect(port,'127.0.0.1');
          socket.once('connect',()=>{socket.destroy();resolve();});socket.once('error',reject);});break;
      } catch(error) {if(attempt===79)throw error;await new Promise(resolve=>setTimeout(resolve,100));}
    }
    connection=mongoose.createConnection('mongodb://127.0.0.1:'+port+'/litvm_index_recovery',{
      serverSelectionTimeoutMS:3000,autoIndex:true});
    await connection.asPromise();
    const admin=connection.db.admin();
    const failOnce=()=>admin.command({configureFailPoint:'failCommand',mode:{times:1},
      data:{failCommands:['createIndexes'],errorCode:14031}});
    // Reproduce the former behavior using real Mongoose: a rejected init() is
    // still rejected even after Mongo accepts index creation again.
    await failOnce();
    const poisoned=connection.model('PoisonedInit',new mongoose.Schema({txHash:{type:String,unique:true}}));
    await assert.rejects(poisoned.init(),error=>error.code===14031);
    await admin.command({configureFailPoint:'failCommand',mode:'off'});
    await assert.rejects(poisoned.init(),error=>error.code===14031);
    const adapter={Schema:mongoose.Schema,models:connection.models,model:connection.model.bind(connection)};
    const players=connection.model('IsolatedPlayers',new mongoose.Schema({playerName:String,address:String,txCount:Number}));
    const legacy=connection.model('IsolatedLegacy',new mongoose.Schema({chainId:Number,contractAddress:String,
      txHash:String,playerName:String,playerAddress:String,status:String}));
    const player=await players.create({playerName:'Alice',address:alice,txCount:77});
    const legacyDoc=await legacy.create({chainId:4441,contractAddress:contract,txHash:h(779),playerName:'Alice',
      playerAddress:alice,status:'confirmed'});
    const s=setup();s.add(3,'createAlice',1,[created]);
    audit=createChainAudit({mongoose:adapter,ethers:fakeEthers,provider:s.provider,GamePlayer:players,rpcMinIntervalMs:0,
      RelayTransaction:legacy,contractAddress:contract,chainId:4441,confirmations:2,logger:{warn(){}}});
    await audit.Transaction.createCollection();
    const existing={...audit.scope,txHash:h(990),status:'pending',canonical:false,finalized:false,
      playerName:'Alice',actorVerified:true};
    await audit.Transaction.collection.insertOne({...existing});
    await failOnce();
    await assert.rejects(audit.startScan(),error=>error.code===14031 && error.stage==='mongo_indexes');
    assert.equal((await audit.getScanStatus()).initializationDiagnostic.codeName,'OutOfDiskSpace');
    assert.equal(await audit.Transaction.countDocuments(),1);
    await admin.command({configureFailPoint:'failCommand',mode:'off'});
    await audit.startScan();await audit._test.getRunning();
    await audit.importLegacy();await audit.importLegacy();
    await audit.startScan();await audit._test.getRunning();
    assert.equal((await audit.getScanStatus()).status,'complete');
    assert.equal((await audit.getScanStatus()).initializationDiagnostic,undefined);
    assert.equal(await audit.Transaction.countDocuments(),3);
    assert.equal((await audit.Transaction.findOne({txHash:existing.txHash}).lean()).status,'pending');
    const indexes=await audit.Transaction.collection.indexes();
    assert.ok(indexes.some(index=>index.unique && index.key.chainId===1 &&
      index.key.contractAddress===1 && index.key.txHash===1));
    assert.ok(indexes.some(index=>index.key['invoiceUpdates.id']===1),'compound invoice index is valid');
    await assert.rejects(audit.Transaction.collection.insertOne({...existing}),error=>error.code===11000);
    assert.equal((await players.findById(player._id)).txCount,77);
    assert.equal((await legacy.findById(legacyDoc._id)).status,'confirmed');
  } finally {
    if(audit)await audit.dispose();
    if(connection)await connection.close();
    if(mongod.exitCode===null) {
      const exited=new Promise(resolve=>mongod.once('exit',resolve));mongod.kill();await exited;
    }
    const resolved=path.resolve(tempRoot);
    if(resolved.startsWith(tmpBase+path.sep) && path.basename(resolved).startsWith('litvm-mongo-index-recovery-'))
      await fs.rm(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
});

test('one transaction with multiple events; historical owner; reverts; repeated scan and live capture do not double count',async()=>{
  const s=setup();
  const tx=s.add(3,'createAlice',1,[created]);
  s.add(4,'decrease1',1,[{name:'InvoiceDeleted',args:[1n,'alice-wood']},{name:'ManualIdFreed',args:['alice-wood']}]);
  s.add(5,'increase1',0,[],relayer);
  await s.audit.startScan(); await s.audit._test.getRunning();
  assert.equal(s.audit.Transaction.rows.length,3);
  assert.equal(s.audit.Transaction.rows[1].eventNames.length,2);
  assert.equal(s.audit.Transaction.rows[1].playerName,'Alice');
  assert.equal(s.audit.Transaction.rows[1].attributionStatus,'inferred');
  assert.equal(s.audit.Transaction.rows[1].actorVerified,false);
  assert.equal(s.audit.Transaction.rows[2].status,'reverted');
  assert.equal(s.audit.Transaction.rows[2].playerName,'Alice');
  await s.audit.recordSubmitted(tx,null,'pending');
  assert.equal(s.audit.Transaction.rows[0].status,'confirmed');
  await s.audit.startScan(); await s.audit._test.getRunning();
  assert.equal(s.audit.Transaction.rows.length,3);
  const status=await s.audit.getScanStatus();
  assert.equal(status.historyComplete,true); assert.equal(status.nextBlock,6);
  assert.equal(status.indexedTransactions,3);
});

test('multi-user transfer remains ambiguous, backend verified caller takes precedence, system calls explicit',async()=>{
  const s=setup();
  s.add(1,'createAlice',1,[created]);
  const ambiguous=s.add(2,'transferAB',1,[{name:'InvoiceTransferred',args:[1n,2n,alice,bob,1n]}]);
  const verified=s.add(3,'transferAB',1,[],relayer);
  s.legacy.rows.push({txHash:verified.hash,chainId:4441,contractAddress:contract,playerName:'Alice',playerAddress:alice});
  s.add(4,'admin',1,[]);
  await s.audit.startScan(); await s.audit._test.getRunning();
  const ambiguousRow=s.audit.Transaction.rows.find(t=>t.txHash===ambiguous.hash);
  assert.equal(ambiguousRow.attributionStatus,'ambiguous'); assert.equal(ambiguousRow.playerName,null);
  assert.equal(s.audit.Transaction.rows.find(t=>t.txHash===verified.hash).playerName,'Alice');
  assert.equal(s.audit.Transaction.rows.find(t=>t.txHash===verified.hash).actorVerified,true);
  assert.equal(s.audit.Transaction.rows.find(t=>t.action==='setLimit').attributionStatus,'system');
});

test('registered direct sender is the verified actor rather than the transferred-to owner',async()=>{
  const s=setup(); const tx=s.add(3,'transferAB',1,[{name:'InvoiceTransferred',args:[1n,2n,alice,bob,1n]}],alice);
  await s.audit.startScan(); await s.audit._test.getRunning();
  const row=s.audit.Transaction.rows.find(t=>t.txHash===tx.hash);
  assert.equal(row.playerName,'Alice'); assert.equal(row.attributionStatus,'attributed');
  assert.equal(row.attributionSource,'direct_registered_sender'); assert.equal(row.actorVerified,true);
});

test('authenticated withPlayer context is durable and retained when receipt later reconciles',async()=>{
  const s=setup(); s.audit.installLiveCapture();
  const tx=s.add(3,'increase1',1,[],relayer,908);
  await s.audit.withPlayer({playerName:'Bob',address:bob,gameplayAction:'minar'},()=>s.provider.broadcastTransaction({...tx,data:tx.input,value:0,chainId:4441n}));
  await new Promise(resolve=>setImmediate(resolve));
  const pending=s.audit.Transaction.rows.find(row=>row.txHash===tx.hash);
  assert.equal(pending.playerName,'Bob'); assert.equal(pending.actorVerified,true);
  assert.equal(pending.gameplayAction,'minar');
  await s.audit.reconcilePending();
  const mined=s.audit.Transaction.rows.find(row=>row.txHash===tx.hash);
  assert.equal(mined.playerName,'Bob'); assert.equal(mined.status,'confirmed'); assert.equal(mined.actorVerified,true);
  assert.equal(mined.gameplayAction,'minar'); assert.equal(mined.action,'increaseInvoiceQuantity');
  assert.throws(()=>s.audit.withPlayer({playerName:'Bob',address:bob,gameplayAction:'<script>'},()=>{}),/invalid_server_gameplay_action/);
  await s.audit.dispose();
});

test('live audit cannot delay gameplay if Mongo initialization never resolves',async()=>{
  const s=setup({hanging:true}); s.audit.installLiveCapture();
  const signed={hash:h(900),from:relayer,to:contract,nonce:8,data:'increase1',value:0,chainId:4441n};
  const result=await Promise.race([s.provider.broadcastTransaction(signed),new Promise((_,reject)=>setTimeout(()=>reject(new Error('broadcast delayed')),80))]);
  assert.equal(result.marker,'original'); assert.equal(s.broadcastCalls(),1);
  await s.audit.dispose();
});

test('live hook forwards original broadcast but excludes transactions signed for a different network',async()=>{
  const s=setup(); s.audit.installLiveCapture();
  const response=await s.provider.broadcastTransaction({hash:h(901),from:relayer,to:contract,nonce:8,data:'increase1',value:0,chainId:1n});
  assert.equal(response.hash,h(901)); assert.equal(s.broadcastCalls(),1);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(s.audit.Transaction.rows.length,0);
  await s.audit.dispose();
});

test('legacy import never pretends receipt confirmation and does not mutate legacy documents',async()=>{
  const s=setup(); const row={txHash:h(777),chainId:4441,contractAddress:contract,playerName:'Alice',playerAddress:alice,status:'confirmed',functionName:'increaseInvoiceQuantity',nonce:3};
  s.legacy.rows.push(clone(row)); await s.audit.importLegacy();
  assert.deepEqual(s.legacy.rows,[row]);
  assert.equal(s.audit.Transaction.rows[0].status,'unknown'); assert.equal(s.audit.Transaction.rows[0].canonical,false);
});

test('wrong RPC chain or empty configured contract is rejected before historical scan',async()=>{
  const s=setup(); s.setChain('0x1'); await assert.rejects(s.audit.startScan(),/rpc_chain_mismatch/);
  s.setChain('0x1159'); s.setCode('0x'); await assert.rejects(s.audit.startScan(),/configured_contract_has_no_bytecode/);
  assert.equal(s.audit.Transaction.rows.length,0);
});

test('partial-history scan widening to genesis really processes earlier blocks',async()=>{
  const s=setup(); s.add(1,'createAlice',1,[created]);
  await s.audit.startScan({fromBlock:3}); await s.audit._test.getRunning();
  assert.equal(s.audit.Transaction.rows.length,0); assert.equal((await s.audit.getScanStatus()).historyComplete,false);
  s.requests.length=0; await s.audit.startScan({fromBlock:0}); await s.audit._test.getRunning();
  assert.ok(s.requests.some(([method,args])=>method==='eth_getBlockByNumber'&&args[0]==='0x0'&&args[1]===true));
  assert.equal(s.audit.Transaction.rows.length,1); assert.equal((await s.audit.getScanStatus()).historyComplete,true);
});

test('changed checkpoint anchor forces full rebuild, orphan rows retained without counting',async()=>{
  const s=setup(); s.add(1,'createAlice',1,[created]); await s.audit.startScan(); await s.audit._test.getRunning();
  s.blocks.get(5).hash=h(905); s.blocks.get(1).hash=h(901); s.blocks.get(1).transactions=[];
  s.requests.length=0; await s.audit.startScan(); await s.audit._test.getRunning();
  assert.ok(s.requests.some(([method,args])=>method==='eth_getBlockByNumber'&&args[0]==='0x0'&&args[1]===true));
  assert.equal(s.audit.Transaction.rows[0].status,'orphaned'); assert.equal(s.audit.Transaction.rows[0].canonical,false);
  assert.equal((await s.audit.getScanStatus()).indexedTransactions,0);
});

test('same-block fork invoice ownership cannot leak from old fork into rebuilt later transaction',async()=>{
  const s=setup(); const oldCreate=s.add(3,'createAlice',1,[created],relayer,333);
  s.add(3,'increase1',1,[],relayer,334); await s.audit.startScan(); await s.audit._test.getRunning();
  assert.equal(s.audit.Transaction.rows.find(t=>t.txHash===h(334)).playerName,'Alice');
  s.blocks.get(5).hash=h(995); s.blocks.get(3).hash=h(993); s.blocks.get(3).transactions=[];
  s.add(3,'createBob',1,[{name:'InvoiceCreated',args:[1n,'bob-wood',bob,{hash:h(555)},1n,10003n]}],relayer,335);
  s.add(3,'increase1',1,[],relayer,334);
  await s.audit.startScan(); await s.audit._test.getRunning();
  assert.equal(s.audit.Transaction.rows.find(t=>t.txHash===h(334)).playerName,'Bob');
  assert.equal(s.audit.Transaction.rows.find(t=>t.txHash===oldCreate.hash).status,'orphaned');
});

test('Mongo lease prevents concurrent process scan and resume after error keeps checkpoint',async()=>{
  const s=setup();
  const other=createChainAudit({mongoose:s.db.mongoose,ethers:fakeEthers,provider:s.provider,GamePlayer:s.db.model(),
    contractAddress:contract,chainId:4441,confirmations:2,rpcMinIntervalMs:0,logger:{warn(){}}});
  const originalSend=s.provider.send;
  let release; const blockGate=new Promise(resolve=>release=resolve);
  s.provider.send=async(method,args)=>{ if(method==='eth_getBlockByNumber'&&args[1]===true) await blockGate; return originalSend(method,args); };
  await s.audit.startScan();
  const result=await other.startScan(); assert.equal(result.alreadyRunning,true);
  release(); await s.audit._test.getRunning();
  s.blocks.delete(5); await assert.rejects(other.startScan(),/checkpoint_anchor_unavailable/);
  assert.equal((await s.audit.getScanStatus()).nextBlock,6);
});

test('missing receipt stops before checkpoint, retry recovers without losing indexed rows or double counting',async()=>{
  const s=setup(); s.add(1,'createAlice',1,[created]);
  const tx=s.add(3,'increase1',1,[]); const saved=clone(s.receipts.get(tx.hash)); s.receipts.delete(tx.hash);
  await s.audit.startScan(); await s.audit._test.getRunning();
  const failed=await s.audit.getScanStatus(); assert.equal(failed.status,'error'); assert.equal(failed.nextBlock,3);
  assert.equal(s.audit.Transaction.rows.length,1); assert.equal(failed.historyComplete,false);
  s.receipts.set(tx.hash,saved); await s.audit.startScan(); await s.audit._test.getRunning();
  assert.equal((await s.audit.getScanStatus()).status,'complete'); assert.equal(s.audit.Transaction.rows.length,2);
  assert.equal((await s.audit.getScanStatus()).indexedTransactions,2);
});

test('RPC unsafe integers and ambiguous names never fabricate exact user attribution',()=>{
  assert.throws(()=>number('0x20000000000000'),/unsafe_integer/);
  assert.equal(mergeAttribution([{playerName:'Alice',address:alice},{playerName:'Bob',address:bob}],'test').attributionStatus,'ambiguous');
});

test('receipt hash mismatch is rejected without advancing checkpoint or creating a bogus ledger row',async()=>{
  const s=setup(); const tx=s.add(2,'createAlice',1,[created]); s.receipts.get(tx.hash).transactionHash=h(9999);
  await s.audit.startScan(); await s.audit._test.getRunning();
  assert.equal((await s.audit.getScanStatus()).status,'error'); assert.equal((await s.audit.getScanStatus()).nextBlock,2);
  assert.equal(s.audit.Transaction.rows.length,0);
});

test('expired worker blocked in attribution cannot overwrite replacement worker or advance its checkpoint',async()=>{
  const s=setup(); s.add(1,'createAlice',1,[created],relayer,331);
  const sharedTx=s.add(3,'increase1',1,[],relayer,334);
  let release, enter;
  const blocked=new Promise(resolve=>release=resolve), entered=new Promise(resolve=>enter=resolve);
  const originalFind=s.players.find;
  let didBlock=false;
  s.players.find=function(filter) {
    const q=originalFind(filter);
    if (!didBlock && filter.address && filter.address.$in && filter.address.$in.includes(alice) &&
        s.audit.Transaction.rows.some(row=>row.txHash===sharedTx.hash)) {
      didBlock=true;
      const originalThen=q.then;
      q.then=function(resolve,reject) { enter(); return blocked.then(()=>originalThen.call(q,resolve,reject)); };
    }
    return q;
  };
  await s.audit.startScan(); const oldRun=s.audit._test.getRunning(); await entered;
  const scanRow=s.audit.Scan.rows[0]; scanRow.leaseUntil=new Date(0);
  for (let n=1;n<=5;n++) s.blocks.get(n).hash=h(9000+n);
  s.blocks.get(1).transactions=[];
  s.add(1,'createBob',1,[{name:'InvoiceCreated',args:[1n,'bob-wood',bob,{hash:h(555)},1n,10001n]}],relayer,332);
  s.receipts.get(sharedTx.hash).blockHash=s.blocks.get(3).hash;
  const next=createChainAudit({mongoose:s.db.mongoose,ethers:fakeEthers,provider:s.provider,
    GamePlayer:s.db.model([{playerName:'Alice',address:alice},{playerName:'Bob',address:bob}]),
    RelayTransaction:s.legacy,contractAddress:contract,chainId:4441,confirmations:2,reorgDepth:4,rpcMinIntervalMs:0,logger:{warn(){}}});
  await next.startScan(); await next._test.getRunning();
  const replacement=clone(s.audit.Transaction.rows.find(row=>row.txHash===sharedTx.hash));
  assert.equal(replacement.playerName,'Bob'); assert.equal(replacement.canonical,true); assert.equal(replacement.scanGeneration,2);
  const completed=clone(await next.getScanStatus()); assert.equal(completed.status,'complete');
  release(); await oldRun;
  assert.deepEqual(s.audit.Transaction.rows.find(row=>row.txHash===sharedTx.hash),replacement);
  assert.deepEqual(await next.getScanStatus(),completed);
});

test('generation predicate fences a stale historical write even after its earlier lease check succeeded',async()=>{
  const s=setup(); const tx=s.add(1,'createAlice',1,[created]);
  await s.audit.startScan(); await s.audit._test.getRunning();
  await s.audit.startScan({fullRescan:true}); await s.audit._test.getRunning();
  const before=clone(s.audit.Transaction.rows.find(row=>row.txHash===tx.hash)); assert.equal(before.scanGeneration,2);
  await assert.rejects(s.audit._test.upsert({txHash:tx.hash,status:'confirmed',canonical:true,playerName:'Bob',source:'historical'},false,1),/scan_fence_rejected/);
  assert.deepEqual(s.audit.Transaction.rows.find(row=>row.txHash===tx.hash),before);
});
