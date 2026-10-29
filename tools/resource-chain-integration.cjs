'use strict';
// Isolated Mongo replica set and an in-process EVM. No production URL, key,
// account or database is loaded, and all generated private keys stay in memory.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const runtime='C:/Users/pc/.codex/tmp/grassland-resource-tests-20261028/node_modules';
const mongoose=require(runtime+'/mongoose'),{MongoMemoryReplSet}=require(runtime+'/mongodb-memory-server');
const solc=require(runtime+'/solc'),ganache=require(runtime+'/ganache'),ethers=require('ethers'),acorn=require('acorn');
const source=fs.readFileSync('C:/Users/pc/Desktop/server2.js','utf8').replace(/\r\n/g,'\n');
const ast=acorn.parse(source,{ecmaVersion:'latest'}),quiet={log(){},warn(){},error(){}};
function fn(name,globals){const n=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);return vm.runInNewContext('('+source.slice(n.start,n.end)+')',globals);}
let mongo,connection,rpc,provider;
const report={startedAt:new Date().toISOString(),environment:'local MongoDB replica set + local EVM',assertions:[]};
function check(name){report.assertions.push(name);process.stdout.write('PASS '+name+'\n');}
(async()=>{
  try{
    process.stdout.write('Starting isolated MongoDB 7.0.14 replica set…\n');
    mongo=await MongoMemoryReplSet.create({binary:{version:'7.0.14'},replSet:{count:1,storageEngine:'wiredTiger',spawn:{windowsHide:true}}});
    connection=await mongoose.createConnection(mongo.getUri(),{dbName:'resource_tests',maxPoolSize:12}).asPromise();
    const db={Schema:mongoose.Schema,Types:mongoose.Types,models:connection.models,model:(...args)=>connection.model(...args),connection,startSession:()=>connection.startSession()};
    const model=(name,definition,options={})=>connection.model(name,new mongoose.Schema(definition,{strict:false,...options}));
    const TreeLock=model('TreeLock',{treeKey:{type:String,unique:true},treeType:String,lockedUntil:Date});
    const MineLock=model('MineLock',{mineKey:{type:String,unique:true},mineralType:String,lockedUntil:Date});
    await Promise.all([TreeLock.init(),MineLock.init()]);
    const acquire=fn('claimResourceNode',{TreeLock,MineLock});
    const node={kind:'tree',type:'pinos'},until=new Date(Date.now()+60000);
    let attempts=await Promise.all(Array.from({length:100},()=>acquire(node,'sprite_pinos1',until)));
    assert.equal(attempts.filter(Boolean).length,1);assert.equal(await TreeLock.countDocuments({}),1);
    await TreeLock.updateOne({treeKey:'sprite_pinos1'},{$set:{lockedUntil:new Date(0)}});
    attempts=await Promise.all(Array.from({length:100},()=>acquire(node,'sprite_pinos1',until)));
    assert.equal(attempts.filter(Boolean).length,1);check('100 concurrent Mongo claims award one node, including after expiry');
    // Run the real policy CAS route with Mongo, not a simulated transaction.
    const routes=new Map(),app={};for(const method of ['get','post','patch','delete'])app[method]=(p,...args)=>routes.set(method+' '+p,args.at(-1));
    const pass=()=>{},GamePlayer=model('GamePlayer',{playerName:{type:String,unique:true},address:{type:String,unique:true},inventory:[mongoose.Schema.Types.Mixed],chest:[mongoose.Schema.Types.Mixed]}),
      PlayerStats=model('PlayerStats',{playerName:{type:String,unique:true},address:String,oro:Number,plata:Number,bronce:Number}),
      Listing=model('Listing',{owner:String,ownerName:String,itemId:String,name:String,category:String,qty:Number,pricePerUnit:Number,currency:String,imageUrl:String},{timestamps:true}),
      Tesoro=model('Tesoro',{_id:String,saldo:{type:Number,default:0}}),TesoroJuego=model('TesoroJuego',{_id:String,saldo:{type:Number,default:0}}),
      TesoroMov=model('TesoroMov',{t:Date,bronce:Number,tesoro:String});
    rpc=ganache.provider({logging:{quiet:true},wallet:{totalAccounts:4},chain:{chainId:1337},miner:{blockGasLimit:30000000}});
    provider=new ethers.BrowserProvider(rpc);provider.pollingInterval=25;
    const accounts=Object.entries(rpc.getInitialAccounts());
    const owner=new ethers.Wallet(accounts[0][1].secretKey,provider),seller=accounts[1][0].toLowerCase(),buyer=accounts[2][0].toLowerCase(),attacker=accounts[3][0].toLowerCase();
    const solidity=fs.readFileSync('C:/Users/pc/Desktop/rr.txt.txt','utf8');
    const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Game.sol':{content:solidity}},settings:{optimizer:{enabled:true,runs:200},outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}}),{
      import:p=>{try{return{contents:fs.readFileSync(path.join(runtime,p),'utf8')}}catch(_){return{error:'Missing official import '+p}}}
    }));
    const errors=(output.errors||[]).filter(e=>e.severity==='error');assert.equal(errors.length,0,errors.map(e=>e.formattedMessage).join('\n'));
    const compiled=output.contracts['Game.sol'].InvoiceSystem;
    let nonce=0;
    const contract=await new ethers.ContractFactory(compiled.abi,compiled.evm.bytecode.object,owner).deploy(owner.address,{nonce:nonce++});await contract.waitForDeployment();
    const send=async(name,args)=>{const tx=await contract[name](...args,{nonce:nonce++});return tx.wait();};
    await send('setLimit',['madera pinos',10,10]);await send('createInvoice',[seller,'madera pinos',10,'source-a']);
    await assert.rejects(contract.createInvoice.staticCall(buyer,'madera pinos',1,'over-cap'));
    check('the unmodified rr.txt.txt contract rejects minting above its global cap');
    const context={mongoose:db,crypto,ethers,app,console:quiet,apiLimiter:pass,strictLimiter:pass,authMiddleware:pass,adminAuth:pass,csrfProtection:pass,Listing,
      CONTRACTS:{ITEMS_CONTRACT:{address:await contract.getAddress(),abi:compiled.abi}},relayerWallet:owner,
      relayerNonceManager:{getNextNonce:async()=>nonce++},gatherGasPrice:()=>1000000000n,
      itemTipoOnChain:id=>id==='madera_pinos'?'madera pinos':null,GamePlayer,PlayerStats,
      enColaDelJugador:(_,work)=>work(),setTimeout:()=>({unref(){}}),setInterval:()=>({unref(){}})};
    context.ecoTransaccion=async work=>{const session=await connection.startSession();try{return await session.withTransaction(()=>work(session));}finally{await session.endSession();}};
    context.resourcePersistInventory=async wallet=>{
      const invoices=await contract.getUserInventorySnapshot(wallet);
      const inventory=invoices.filter(i=>i.active&&i.tipo==='madera pinos'&&i.cantidad>0n).map((i,id)=>({id,objeto:'madera_pinos',cantidad:Number(i.cantidad),IDX:Number(i.id),Manualid:i.manualId}));
      await GamePlayer.updateOne({address:wallet},{$set:{inventory,marketWriteAt:new Date()}});return new Date().toISOString();
    };
    const sandbox=vm.createContext(context);
    const block=source.slice(source.indexOf('// RESOURCE_MARKET_START'),source.indexOf('// RESOURCE_MARKET_END')+'// RESOURCE_MARKET_END'.length);
    vm.runInContext(block,sandbox);
    const custody=vm.runInContext('({resourceMarketAdapter,MarketAssetEscrow,MarketAssetClaim,executeMarketAssetClaim})',sandbox);
    const moduleContext=vm.createContext({module:{exports:{}},require,console:quiet,setInterval:()=>({unref(){}}),setTimeout:()=>({unref(){}})});
    vm.runInContext(fs.readFileSync('marketplace-routes.js','utf8'),moduleContext);
    moduleContext.module.exports(app,{mongoose:db,authMiddleware:pass,csrfProtection:pass,apiLimiter:pass,strictLimiter:pass,
      GamePlayer,PlayerStats,Listing,Tesoro,TesoroJuego,TesoroMov,assetTransfer:custody.resourceMarketAdapter});
    await Promise.all(Object.values(connection.models).map(m=>m.init()));
    await GamePlayer.create([{playerName:'Seller',address:seller,inventory:[{id:0,objeto:'madera_pinos',cantidad:10,IDX:1,Manualid:'source-a'}],chest:[]},
      {playerName:'Buyer',address:buyer,inventory:[],chest:[]},{playerName:'Attacker',address:attacker,inventory:[],chest:[]}]);
    await PlayerStats.create([{playerName:'Seller',address:seller,oro:0,plata:0,bronce:0},{playerName:'Buyer',address:buyer,oro:20,plata:0,bronce:0}]);
    async function call(method,p,wallet,body={},params={}){
      let code=200,data;const handler=routes.get(method+' '+p);assert.ok(handler,p);
      const res={status(n){code=n;return this;},set(){return this;},json(d){data=d;return this;}};
      await handler({user:{address:wallet},body,params,query:{},headers:{}},res);return{code,data};
    }
    let result=await call('post','/api/marketplace/list',seller,{slotId:0,itemId:'madera_pinos',source:'inventory',qty:5,pricePerUnit:1,currency:'oro'});
    assert.equal(result.code,200,JSON.stringify(result.data));const listingId=result.data.listing.id;
    result=await call('post','/api/marketplace/buy/:id',buyer,{qty:2,ref:'buy_reference_aaaa'},{id:listingId});
    assert.equal(result.code,409);assert.equal((await PlayerStats.findOne({address:buyer})).oro,20);
    check('an unfunded listing cannot charge a buyer');
    result=await call('post','/api/marketplace/onchain/settle',attacker,{op:'escrow',listingId,itemId:'madera_pinos',qty:5});assert.equal(result.code,403);
    result=await call('post','/api/marketplace/onchain/settle',seller,{op:'escrow',listingId,itemId:'madera_pinos',qty:5});
    assert.equal(result.code,200,JSON.stringify(result.data));assert.equal((await contract.getTipoStats('madera pinos')).totalQuantity,10n);
    assert.equal((await contract.getTipoStats('madera pinos')).totalBurned,0n);check('escrow transfers preserve a full table and do not record a burn');
    result=await call('post','/api/marketplace/buy/:id',buyer,{qty:2,ref:'buy_reference_aaaa'},{id:listingId});assert.equal(result.code,200,JSON.stringify(result.data));
    const receiptId=result.data.receiptId;assert.ok(receiptId);assert.equal((await PlayerStats.findOne({address:buyer})).oro,18);
    result=await call('post','/api/marketplace/onchain/settle',attacker,{op:'deliver',listingId,receiptId,qty:1000,itemId:'madera_pinos'});assert.equal(result.code,403);
    result=await call('post','/api/marketplace/onchain/settle',buyer,{op:'deliver',listingId,receiptId,qty:1000,itemId:'madera_pinos'});assert.equal(result.code,200,JSON.stringify(result.data));
    assert.equal((await contract.getInvoice(result.data.invoiceId)).cantidad,2n);check('a delivery requires its actual buyer and ignores forged client quantities');
    const beforeReplay=await contract.totalInvoicesEver();
    result=await call('post','/api/marketplace/buy/:id',buyer,{qty:2,ref:'buy_reference_aaaa'},{id:listingId});assert.equal(result.code,200);assert.equal((await PlayerStats.findOne({address:buyer})).oro,18);
    await call('post','/api/marketplace/onchain/settle',buyer,{op:'deliver',listingId,receiptId});assert.equal(await contract.totalInvoicesEver(),beforeReplay);
    check('lost-response retries cannot debit or transfer twice');
    result=await call('post','/api/marketplace/buy/:id',buyer,{qty:2,ref:'buy_reference_bbbb'},{id:listingId});assert.equal(result.code,200);assert.notEqual(result.data.receiptId,receiptId);
    await call('post','/api/marketplace/onchain/settle',buyer,{op:'deliver',listingId,receiptId:result.data.receiptId});
    result=await call('post','/api/marketplace/cancel/:id',seller,{}, {id:listingId});assert.equal(result.code,200,JSON.stringify(result.data));
    await call('post','/api/marketplace/onchain/settle',seller,{op:'refund',listingId,receiptId:result.data.receiptId});
    const total=await contract.getTipoStats('madera pinos');assert.equal(total.totalQuantity,10n);assert.equal(total.totalBurned,0n);
    const owned=async wallet=>(await contract.getUserInventorySnapshot(wallet)).filter(i=>i.active).reduce((sum,i)=>sum+i.cantidad,0n);
    assert.equal(await owned(buyer),4n);assert.equal(await owned(seller),6n);assert.equal(await owned(owner.address),0n);
    check('repeated equal-size purchases and the remaining refund preserve all ten resource units');
    const s=await PlayerStats.findOne({address:seller}),b=await PlayerStats.findOne({address:buyer}),circle=await Tesoro.findById('principal'),game=await TesoroJuego.findById('juego');
    assert.equal(Math.round((s.oro+b.oro)*1000000)+circle.saldo+game.saldo,20000000);check('buyer, seller and both treasury balances conserve total monetary value');
    // Migration is intentionally privileged in the provided contract. This test
    // records the limitation rather than claiming a cap that the owner can bypass.
    await send('setLimit',['migration-test',10,5]);
    await send('migrateInvoicesBatch',[[{id:9999,manualId:'migration-risk',owner:seller,tipo:'migration-test',cantidad:11,active:true,createdAt:1}]]);
    assert.equal((await contract.getTipoStats('migration-test')).totalQuantity,11n);
    check('the contract owner can bypass caps through open migration; this requires an explicit operational warning');
    report.completedAt=new Date().toISOString();report.ok=true;
  }finally{
    if(provider)provider.destroy();
    if(connection){await connection.close();process.stdout.write('Closed isolated Mongo client.\n');}
    if(mongo){await mongo.stop();process.stdout.write('Stopped isolated Mongo server.\n');}
    if(rpc){await rpc.disconnect();process.stdout.write('Stopped local EVM.\n');}
    fs.mkdirSync('audits/recursos-20261028',{recursive:true});fs.writeFileSync('audits/recursos-20261028/chain-integration.json',JSON.stringify(report,null,2));
  }
})().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
