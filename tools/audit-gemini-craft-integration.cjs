'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),vm=require('node:vm'),acorn=require('acorn');
const temp='C:/Users/pc/.codex/tmp/grassland-resource-tests-20261028/node_modules',mongoose=require(temp+'/mongoose'),{MongoMemoryReplSet}=require(temp+'/mongodb-memory-server'),ganache=require(temp+'/ganache'),solc=require(temp+'/solc'),ethers=require('ethers');
const out='C:/Users/pc/.codex/reports/grassland-auditoria-20261029',report={ok:false,checks:[]};
let mongo,connection,rpc,provider;
const check=label=>{report.checks.push(label);console.log('PASS',label)};
(async()=>{try{
 mongo=await MongoMemoryReplSet.create({binary:{version:'7.0.14'},replSet:{count:1,storageEngine:'wiredTiger',spawn:{windowsHide:true}}});
 connection=await mongoose.createConnection(mongo.getUri(),{dbName:'craft_audit',maxPoolSize:12}).asPromise();
 const db={Schema:mongoose.Schema,models:connection.models,model:(...a)=>connection.model(...a),connection};
 const model=(name,shape)=>connection.model(name,new mongoose.Schema(shape,{strict:false,versionKey:false}));
 const Player=model('GamePlayer',{playerName:{type:String,unique:true},address:String,nivel_exp:Number}),Stats=model('PlayerStats',{playerName:{type:String,unique:true},bronce:Number,plata:Number,oro:Number,exp:Number,chainPending:[String]}),Treasury=model('TesoroJuego',{_id:String,saldo:Number,retenidoServicios:Number}),Service=model('ServicioCobro',{_id:String,estado:String,serverOwned:Boolean}),Mov=model('TesoroMov',{bronce:Number});
 rpc=ganache.provider({logging:{quiet:true},wallet:{totalAccounts:3},chain:{chainId:1337}});provider=new ethers.BrowserProvider(rpc);provider.pollingInterval=20;
 const accounts=Object.entries(rpc.getInitialAccounts()),owner=new ethers.Wallet(accounts[0][1].secretKey,provider),wallet=accounts[1][0].toLowerCase();let nonce=0;
 const source=fs.readFileSync('C:/Users/pc/Desktop/rr.txt.txt','utf8'),compiled=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Game.sol':{content:source}},settings:{optimizer:{enabled:true,runs:200},outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}}),{import:p=>({contents:fs.readFileSync(path.join(temp,p),'utf8')})}));
 assert.equal((compiled.errors || []).filter(e=>e.severity==='error').length,0);
 const art=compiled.contracts['Game.sol'].InvoiceSystem,contract=await new ethers.ContractFactory(art.abi,art.evm.bytecode.object,owner).deploy(owner.address,{nonce:nonce++});await contract.waitForDeployment();
 const send=async(fn,args)=>(await contract[fn](...args,{nonce:nonce++})).wait();
 await send('setLimit',['madera pinos',100,20]);await send('setLimit',['balde_vacio',10,5]);await send('createInvoice',[wallet,'madera pinos',6,'original-wood']);
 await Player.create({playerName:'Ana',address:wallet,nivel_exp:0});await Stats.create({playerName:'Ana',bronce:1000,oro:0,plata:0,exp:0});await Treasury.create({_id:'juego',saldo:0,retenidoServicios:0});
 const transaction=async fn=>{const session=await connection.startSession();let result;try{await session.withTransaction(async()=>{result=await fn(session)});return result;}finally{await session.endSession();}};
 const routes=new Map(),app={};for(const method of ['get','post'])app[method]=(p,...handlers)=>routes.set(method+' '+p,handlers.at(-1));const pass=()=>{};
 const itemType=id=>id==='madera_pinos'?'madera pinos':id;
 const reservations=new Map();
 const backend=fs.readFileSync('C:/Users/pc/Desktop/server2.js','utf8'),ast=acorn.parse(backend,{ecmaVersion:'latest'});
 const initializer=name=>{for(const n of ast.body){const d=n.declarations?.find(d=>d.id.name===name);if(d)return d.init;}throw Error(name);};
 const declaration=name=>{const n=ast.body.find(n=>n.id?.name===name);assert.ok(n,name);return backend.slice(n.start,n.end);};
 const adapter=initializer('authoritativeCrafts').arguments[0],vipModel=model('VipEstado',{address:{type:String,unique:true},fin:Date,inicio:Date,playerName:String});
 const vipContext={authoritativeFarm:{recipes:[]},Date,Math,Number,String,Map,VipEstado:vipModel,_gfVipCache:new Map(),crearTablaSiFalta:async()=>true,
  facturasDeCadena:async address=>(await contract.getUserInventorySnapshot(address)).filter(f=>f.active).map(f=>({id:Number(f.id),tipo:f.tipo,owner:f.owner.toLowerCase(),cantidad:Number(f.cantidad),manualId:f.manualId}))};vm.createContext(vipContext);
 for(const name of ['VIP_PLANES','VIP_MONEDAS','TESORO_BRONCE_POR'])vm.runInContext('var '+name+'='+backend.slice(initializer(name).start,initializer(name).end),vipContext);
 vm.runInContext(declaration('gfVipLeerFacturas')+'\n'+declaration('gfVipResumen'),vipContext);
 const vip={};for(const name of ['services','prepareService','completeService','describeService']){const prop=adapter.properties.find(p=>p.key.name===name);assert.ok(prop,name);vip[name]=vm.runInContext('('+backend.slice(prop.value.start,prop.value.end)+')',vipContext);}
 const authority=require('../backend-gameplay/crafting-authority.cjs')({mongoose:db,ethers,crypto,recipes:require('../backend-gameplay/recipes.json'),consumables:require('../backend-gameplay/consumables.json'),app,authMiddleware:pass,adminAuth:pass,csrfProtection:pass,strictLimiter:pass,apiLimiter:pass,
  ...vip,
  itemType,maxStack:()=>5,items:()=>contract,wallet:()=>owner,nonce:async key=>{if(!reservations.has(key))reservations.set(key,nonce++);return reservations.get(key);},gasPrice:()=>1000000000n,
  freeInvoices:async w=>(await contract.getUserInventorySnapshot(w)).filter(i=>i.active).map(i=>({id:Number(i.id),owner:i.owner.toLowerCase(),tipo:i.tipo,cantidad:Number(i.cantidad),manualId:i.manualId})),
  player:async()=>Player.findOne({address:wallet}).lean(),ghost:async()=>false,level:async()=>30,transaction,queue:(_,fn)=>fn(),loadEconomy:async()=>{},price:(_t,_i,q)=>50*q,
  planPayment:(amount,s)=>s.bronce>=amount?{oro:s.oro,plata:s.plata,bronce:s.bronce-amount}:null,Stats,Player,Treasury,treasuryId:'juego',Service,Mov,persistInventory:async()=>{},statsResponse:s=>s,
  award:async(player,ref,amount,profession,x,session)=>{await Stats.updateOne({playerName:player},{$inc:{exp:amount}},{session});},
  gain:async(player,stat,amount,session)=>{await Stats.updateOne({playerName:player},{$inc:{[stat]:amount}},{session});}
 });
 vipContext.authoritativeCrafts=authority;
 await Promise.all(Object.values(connection.models).map(m=>m.init()));
 const gp=await Player.findOne({address:wallet}).lean(),body={recipeId:'balde_vacio',quantity:1,ref:'craft_test_reference_1'};
 await assert.rejects(authority.create({...gp,address:accounts[2][0]},body),/craft_materials_missing/);assert.equal((await Stats.findOne({playerName:'Ana'})).bronce,1000);check('unowned or absent ingredients cannot debit a fee');
 const created=await authority.create(gp,body);assert.equal((await Stats.findOne({playerName:'Ana'})).bronce,950);await authority.create(gp,body);assert.equal((await Stats.findOne({playerName:'Ana'})).bronce,950);check('craft preparation and its reference debit exactly once');
 const done=await authority.execute(created._id);assert.equal(done.status,'completed',JSON.stringify(done));
 const supply=await contract.getTipoStats('madera pinos');assert.equal(supply.totalQuantity,3n);assert.equal(supply.totalBurned,3n);assert.equal((await contract.getTipoStats('balde_vacio')).totalQuantity,1n);
 assert.equal((await Treasury.findById('juego')).retenidoServicios,0);assert.equal((await Stats.findOne({playerName:'Ana'})).exp,30);check('verified custody and consumption precede the output; fee and experience settle after confirmation');
 const total=await contract.totalInvoicesEver();await authority.execute(created._id);assert.equal(await contract.totalInvoicesEver(),total);assert.equal((await Stats.findOne({playerName:'Ana'})).bronce,950);check('reconciliation of a completed craft cannot burn, mint or debit twice');
 const d=await authority.describe(done);assert.equal(d.rewards.length,1);assert.equal(d.sourceInvoices[0].remaining,3);assert.equal(d.rewards[0].newTotal,1);check('the interface receives canonical source quantities and output invoice ids');
 const second=await authority.create(gp,{...body,ref:'craft_test_reference_2'});
 const broadcast=provider.broadcastTransaction.bind(provider);let lost=true;
 provider.broadcastTransaction=async raw=>{const tx=await broadcast(raw);if(lost){lost=false;throw new Error('network response lost after send');}return tx;};
 const uncertain=await authority.execute(second._id);assert.equal(uncertain.status,'review');
 provider.broadcastTransaction=broadcast;
 const recovered=await authority.execute(second._id);assert.equal(recovered.status,'completed',JSON.stringify(recovered));
 assert.equal((await contract.getTipoStats('madera pinos')).totalQuantity,0n);assert.equal((await contract.getTipoStats('madera pinos')).totalBurned,6n);assert.equal((await contract.getTipoStats('balde_vacio')).totalQuantity,2n);
 assert.equal((await Stats.findOne({playerName:'Ana'})).bronce,900);assert.equal((await Treasury.findById('juego')).saldo,100);assert.equal((await Treasury.findById('juego')).retenidoServicios,0);check('a lost broadcast response recovers the same signed transaction without duplicate consumption or output');
 const nativeBalance=async w=>(await contract.getUserInventorySnapshot(w)).filter(i=>i.active).reduce((n,i)=>n+i.cantidad,0n);assert.equal(await nativeBalance(owner.address),0n);check('temporary material custody is empty after success; resources and monetary value conserve exactly');
 await send('setLimit',['pes1',100,50]);await send('createInvoice',[wallet,'pes1',2,'food-original']);
 await Stats.updateOne({playerName:'Ana'},{$set:{comida:30}});
 const food=await authority.create(gp,{recipeId:'consume_pes1',quantity:2,ref:'eat_reference_123'});assert.equal(food.fee,0);
 const eaten=await authority.execute(food._id);assert.equal(eaten.status,'completed');assert.equal((await Stats.findOne({playerName:'Ana'})).comida,42);
 await authority.execute(food._id);assert.equal((await Stats.findOne({playerName:'Ana'})).comida,42);assert.equal((await Stats.findOne({playerName:'Ana'})).bronce,900);
 assert.equal((await contract.getTipoStats('pes1')).totalQuantity,0n);check('verified consumption burns the food before its one-time buff and never charges a crafting fee');
 await send('createInvoice',[wallet,'madera pinos',3,'cancel-wood']);
 const unstarted=await authority.create(gp,{...body,ref:'cancel_reference_123'});assert.equal((await Stats.findOne({playerName:'Ana'})).bronce,850);
 await authority.cancelUntouched(unstarted._id);assert.equal((await Stats.findOne({playerName:'Ana'})).bronce,900);assert.equal((await Treasury.findById('juego')).retenidoServicios,0);
 await assert.rejects(authority.cancelUntouched(unstarted._id),/craft_busy_or_settled/);
 assert.equal((await contract.getTipoStats('madera pinos')).totalQuantity,3n);check('only an untouched craft can be cancelled and its held fee refunded once');
 await send('setLimit',['tablon_de_madera',20,5]);
 const automatic=await authority.create(gp,{recipeId:'tablon_de_madera',quantity:1,ref:'auto_optional_123'});assert.equal(automatic.option,0);await authority.cancelUntouched(automatic._id);
 check('optional materials keep the original automatic choice, selected from verified available invoices');
 const expired=await authority.create(gp,{...body,ref:'expired_summary_123'});await Service.deleteOne({_id:expired.serviceId});
 const finishedExpired=await authority.execute(expired._id);assert.equal(finishedExpired.status,'completed');assert.equal((await Service.findById(expired.serviceId)).estado,'completado');assert.equal((await Treasury.findById('juego')).retenidoServicios,0);
 check('expiry of the legacy service summary cannot strand the durable craft or its held fee');
 await send('createInvoice',[wallet,'madera pinos',3,'interrupted-signing-wood']);
 const interrupted=await authority.create(gp,{...body,ref:'interrupted_sign_123'}),sign=owner.signTransaction.bind(owner);let signingInterrupted=true;
 owner.signTransaction=async tx=>{const raw=await sign(tx);if(signingInterrupted){signingInterrupted=false;throw Error('signing interrupted before durable raw bytes');}return raw;};
 const signingReview=await authority.execute(interrupted._id);assert.equal(signingReview.status,'review');const reservationCount=reservations.size;
 owner.signTransaction=sign;
 const signingRecovered=await authority.execute(interrupted._id);assert.equal(signingRecovered.status,'completed');assert.equal(reservations.size,reservationCount+2);
 assert.equal((await Stats.findOne({playerName:'Ana'})).bronce,800);assert.equal((await Treasury.findById('juego')).retenidoServicios,0);assert.equal((await contract.getTipoStats('madera pinos')).totalQuantity,0n);
 check('interruption before signed bytes are stored recovers the original nonce ticket, then burns and delivers once');
 await send('setLimit',['vip',1000,30]);await Stats.updateOne({playerName:'Ana'},{$set:{oro:30,plata:20000}});
 const vipBody={recipeId:'vip_1m_oro',quantity:1,ref:'vip_once_gold_123'},beforeVip=await Stats.findOne({playerName:'Ana'}).lean();
 await assert.rejects(authority.create(gp,{...vipBody,recipeId:'vip_3m_oro'}),/craft_result_capacity_unavailable/);
 await assert.rejects(authority.create(gp,{...vipBody,quantity:2}),/craft_invalid_request/);
 assert.equal((await Stats.findOne({playerName:'Ana'})).oro,30);check('VIP capacity and single-ticket limits reject before any selected currency is charged');
 const vipJob=await authority.create(gp,vipBody);await authority.create(gp,vipBody);
 let st=await Stats.findOne({playerName:'Ana'});assert.equal(st.oro,25);assert.equal(st.plata,20000);assert.equal(st.bronce,beforeVip.bronce);
 assert.equal((await Treasury.findById('juego')).retenidoServicios,5000000);check('VIP charges the selected gold currency once and reserves its exact bronze value in the game treasury');
 let vipLost=true;provider.broadcastTransaction=async raw=>{const tx=await broadcast(raw);if(vipLost){vipLost=false;throw Error('VIP response lost after broadcast');}return tx;};
 const vipReview=await authority.execute(vipJob._id);assert.equal(vipReview.status,'review');assert.equal((await Stats.findOne({playerName:'Ana'})).oro,25);
 await assert.rejects(authority.cancelUntouched(vipJob._id),/craft_must_reconcile/);provider.broadcastTransaction=broadcast;
 const vipRecovered=await authority.execute(vipJob._id);assert.equal(vipRecovered.status,'completed');const vipResult=await authority.describe(vipRecovered);
 assert.equal(vipResult.ok,true);assert.equal(vipResult.plan,'1m');assert.equal(vipResult.precio,5);assert.ok(vipResult.activo);assert.ok(vipResult.facturaId>0);assert.ok(vipResult.ahora>0);
 assert.equal((await Stats.findOne({playerName:'Ana'})).exp,beforeVip.exp);assert.equal((await Treasury.findById('juego')).retenidoServicios,0);
 const vipCount=await contract.totalInvoicesEver();await authority.execute(vipJob._id);assert.equal(await contract.totalInvoicesEver(),vipCount);
 assert.equal((await vipModel.findOne({address:wallet})).fin.getTime(),vipResult.fin);check('uncertain VIP broadcast recovers one invoice, forbids an automatic refund, preserves expiry and awards no crafting experience');
 const cancelVip=await authority.create(gp,{...vipBody,ref:'vip_cancel_gold_123'});await authority.cancelUntouched(cancelVip._id);
 assert.equal((await Stats.findOne({playerName:'Ana'})).oro,25);assert.equal((await Stats.findOne({playerName:'Ana'})).bronce,beforeVip.bronce);assert.equal((await Treasury.findById('juego')).retenidoServicios,0);
 check('cancelling an untouched VIP returns the original currency instead of silently converting it');
 await send('setLimit',['vip',1000,180]);const extended=await authority.create(gp,{recipeId:'vip_3m_plata',quantity:1,ref:'vip_extend_silver_123'});
 assert.equal((await Stats.findOne({playerName:'Ana'})).plata,8000);assert.equal(extended.metadata.fin,vipResult.fin+90*86400000);
 const extensionDone=await authority.execute(extended._id);assert.equal(extensionDone.status,'completed',JSON.stringify(extensionDone));assert.equal((await Treasury.findById('juego')).retenidoServicios,0);
 check('a silver VIP extension retains the existing expiry and the original 90-day manual plan');
 for(const recipe of vip.services){const metadata=await vip.prepareService(gp,recipe,'f'.repeat(64));assert.ok(Buffer.byteLength(metadata.manualId)<=64,recipe.id);}
 check('all nine original VIP payment options fit the contract manual-id byte limit');
 await send('setLimit',['exp',10000,1000]);const statReceipt=await send('createInvoice',[wallet,'exp',100,'audit-stat-original']);
 const statInvoice=statReceipt.logs.map(l=>{try{return contract.interface.parseLog(l)}catch(_){return null}}).find(e=>e?.name==='InvoiceCreated').args.id;
 const makeJournal=()=>require('../backend-gameplay/stat-chain-journal.cjs')({mongoose:db,ethers,crypto,wallet:()=>owner,nonce:async key=>{if(!reservations.has(key))reservations.set(key,nonce++);return reservations.get(key);}});
 const firstJournal=makeJournal();let statLost=true;provider.broadcastTransaction=async raw=>{const tx=await broadcast(raw);if(statLost){statLost=false;throw Error('stat response lost after broadcast');}return tx;};
 const statReview=await firstJournal.apply(contract,'exp',Number(statInvoice),90,1000000000n);assert.equal(statReview.ok,false);assert.equal(statReview.pending,true);
 provider.broadcastTransaction=broadcast;const nextJournal=makeJournal();let statRecovered;
 // The real provider can cache an absent receipt for 250 ms. Recovery must
 // remain idempotent during that interval too; a failed rebroadcast is pending.
 for(let attempt=0;attempt<3;attempt++){statRecovered=await nextJournal.apply(contract,'exp',Number(statInvoice),80,1000000000n);if(statRecovered.chainQty!==null)break;await new Promise(resolve=>setTimeout(resolve,300));}
 assert.equal(statRecovered.ok,false);assert.equal(statRecovered.chainQty,90,JSON.stringify(statRecovered));assert.equal((await contract.getTipoStats('exp')).totalBurned,10n);
 const converged=await nextJournal.apply(contract,'exp',Number(statInvoice),80,1000000000n);assert.equal(converged.ok,true);assert.equal(converged.chainQty,80);
 assert.equal((await contract.getTipoStats('exp')).totalBurned,20n);check('a restarted stats synchronizer recovers its original signed delta before considering a changed target');
 const statParallel=await Promise.all([firstJournal.apply(contract,'exp',Number(statInvoice),70,1000000000n),nextJournal.apply(contract,'exp',Number(statInvoice),70,1000000000n)]);
 assert.ok(statParallel.some(r=>r.ok));assert.equal((await contract.getInvoice(statInvoice)).cantidad,70n);assert.equal((await contract.getTipoStats('exp')).totalBurned,30n);
 check('two stats workers cannot apply the same monetary or experience delta twice');
 report.ok=true;report.completedAt=new Date().toISOString();
 }finally{if(provider)provider.destroy();if(connection)await connection.close(true);if(mongo)await mongo.stop();if(rpc)await rpc.disconnect();fs.writeFileSync(out+'/craft-integration.json',JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
