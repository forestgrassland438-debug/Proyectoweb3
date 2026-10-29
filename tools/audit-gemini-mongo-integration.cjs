'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),acorn=require('acorn'),crypto=require('node:crypto');
const dep='C:/Users/pc/.codex/tmp/grassland-resource-tests-20261028/node_modules',mongoose=require(dep+'/mongoose'),{MongoMemoryReplSet}=require(dep+'/mongodb-memory-server');
const source=fs.readFileSync('C:/Users/pc/Desktop/server2.js','utf8'),ast=acorn.parse(source,{ecmaVersion:'latest'}),report={ok:false,checks:[]},output='C:/Users/pc/.codex/reports/grassland-auditoria-20261029/mongo-guards.json';
const declaration=name=>{const n=ast.body.find(n=>n.id?.name===name||n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name===name));assert.ok(n,name);return source.slice(n.start,n.end);};
const handler=(method,path)=>{const n=ast.body.find(n=>n.expression?.callee?.object?.name==='app'&&n.expression.callee.property.name===method&&n.expression.arguments[0]?.value===path);assert.ok(n,path);return source.slice(n.expression.arguments.at(-1).start,n.expression.arguments.at(-1).end);};
const check=text=>{report.checks.push(text);console.log('PASS',text);};
let mongo,connection;
(async()=>{try{
 mongo=await MongoMemoryReplSet.create({binary:{version:'7.0.14'},replSet:{count:1,storageEngine:'wiredTiger',spawn:{windowsHide:true}}});connection=await mongoose.createConnection(mongo.getUri(),{dbName:'audit_guard',maxPoolSize:20}).asPromise();
 const db={Schema:mongoose.Schema,models:connection.models,model:(...args)=>connection.model(...args),connection};
 let quantity=2;const c={mongoose:db,console:{warn(){},error(){},log(){}},Date,Math,Number,BigInt,crypto,Promise,Set,Map,global:{},process:{env:{}},
  contratoItemsServidor:()=>({getInvoice:async id=>({owner:id===99?'other':'owner',tipo:'hacha_de_madera',cantidad:BigInt(quantity),active:quantity>0})}),itemTipoOnChain:x=>x,
  facturasLibresDeCadena:async()=>[{id:1}],GamePlayer:{findOne:()=>({select:()=>({lean:async()=>({address:'owner'})})})},asyncRoute:x=>x,
  requireOwner:async(req,res,name)=>{if(name!==req.user.playerName){res.status(403).json({error:'forbidden'});return false;}return true;}
 };vm.createContext(c);
 for(const name of ['waterCollectionSchema','WaterCollection','WaterCollectionController','toolUsesSchema','ToolUses','TOOL_DURABILITY','ownedTool','toolError','MAIL_MAX_POR_JUGADOR','Mailbox','getPlayerMail'])vm.runInContext(declaration(name),c);
 vm.runInContext('this.Water=WaterCollection;this.water=new WaterCollectionController(null);this.Tools=ToolUses;this.Mailbox=Mailbox;',c);
 await Promise.all(Object.values(connection.models).map(m=>m.init()));
 c.CHAIN_ID=1337;c.relayerWallet={address:'0x'+'a'.repeat(40)};c.provider={getTransactionCount:async()=>7};
 vm.runInContext(declaration('RelayerNonceManager')+';this.nonceA=new RelayerNonceManager();this.nonceB=new RelayerNonceManager();',c);
 const allocations=await Promise.all(Array.from({length:200},(_,i)=>(i%2?c.nonceA:c.nonceB).getNextNonce()));assert.equal(new Set(allocations).size,200);assert.equal(Math.min(...allocations),7);assert.equal(Math.max(...allocations),206);
 vm.runInContext('this.nonceRestarted=new RelayerNonceManager();',c);assert.equal(await c.nonceRestarted.getNextNonce(),207);await c.nonceA.resetNonce();assert.equal(await c.nonceA.getNextNonce(),208);
 check('two backend nonce managers reserve 200 distinct nonces atomically, and a restarted manager cannot recycle them');
 const oneTicket=await Promise.all([c.nonceA.getNextNonce('same-signed-job'),c.nonceB.getNextNonce('same-signed-job')]);assert.equal(oneTicket[0],oneTicket[1]);
 vm.runInContext('this.nonceAnotherRestart=new RelayerNonceManager();',c);assert.equal(await c.nonceAnotherRestart.getNextNonce('same-signed-job'),oneTicket[0]);
 check('a durable nonce ticket returns the same reservation across simultaneous workers and a process restart');
 c.mongoose={connection:{readyState:0}};await assert.rejects(c.nonceA.getNextNonce(),/nonce_store_unavailable/);c.mongoose=db;
 check('a database outage cannot silently switch production nonce allocation back to process-local memory');
 const call=async(method,path,{body={},params={},user={address:'owner',playerName:'Ana'}}={})=>{const req={body,params,user};const res={statusCode:200,status(n){this.statusCode=n;return this;},json(x){this.data=x;return this;},set(){return this;}};await vm.runInContext('('+handler(method,path)+')',c)(req,res);return res;};
 let result=await call('post','/api/tool/uses/decrease',{body:{invoiceId:99,maxUsos:99999}});assert.equal(result.statusCode,403);assert.equal(await c.Tools.countDocuments(),0);check('foreign invoices cannot be worn or initialized');
 result=await call('post','/api/tool/uses/decrease',{body:{invoiceId:1,maxUsos:99999}});assert.equal(result.data.maxUsos,5);assert.equal(result.data.usos,4);check('tool durability is fixed by the server catalog, ignoring client-supplied maximums');
 await Promise.all(Array.from({length:30},()=>call('post','/api/tool/uses/decrease',{body:{invoiceId:1,maxUsos:5}})));const tool=await c.Tools.findOne({invoiceId:1}).lean();assert.equal(tool.usos,0);assert.equal(tool.rota,true);check('30 concurrent wear requests cannot lose updates or drive durability below zero');
 result=await call('delete','/api/tool/uses/:invoiceId',{params:{invoiceId:1}});assert.equal(result.statusCode,409);quantity=1;result=await call('delete','/api/tool/uses/:invoiceId',{params:{invoiceId:1}});assert.equal(result.statusCode,200);assert.equal((await c.Tools.findOne({invoiceId:1})).usos,5);check('a worn stack only resets after an on-chain quantity reduction');
 result=await call('post','/api/tool/uses/bulk',{body:{invoiceIds:Array(51).fill(1)}});assert.equal(result.statusCode,400);result=await call('post','/api/tool/uses/bulk',{body:{invoiceIds:[99]}});assert.equal(result.statusCode,403);check('bulk durability reads enforce a 50-invoice bound and wallet ownership');
 const claims=await Promise.allSettled(Array.from({length:40},()=>c.water.collectWater('Ana')));assert.equal(claims.filter(r=>r.status==='fulfilled').length,1);assert.equal((await c.Water.findOne({playerName:'Ana'})).totalCollectionsToday,1);check('40 concurrent water claims grant exactly one turn, including multi-connection races');
 await c.Water.updateOne({playerName:'Ana'},{$set:{dailyResetTime:new Date(Date.now()-5*3600000),totalCollectionsToday:5,isDailyLimitReached:true,nextAvailableTime:new Date(Date.now()+3600000)}});const status=await c.water.getWaterCollectionStatus('Ana');assert.equal(status.canCollect,true);assert.equal(status.collectionsToday,0);assert.equal(status.windowHours,4);await c.water.collectWater('Ana');assert.equal((await c.water.refundCollection('Ana')).requiresReview,true);assert.equal((await c.Water.findOne({playerName:'Ana'})).totalCollectionsToday,1);check('status and claim share the same four-hour reset; an unverified refund cannot erase the cooldown');
 await Promise.all(Array.from({length:115},(_,i)=>call('post','/api/mail/:playerName',{params:{playerName:'Ana'},body:{subject:'Mail '+i,body:'Body'}})));
 const mailbox=await c.Mailbox.findOne({playerName:'Ana'}).lean();assert.equal(mailbox.mails.length,100);assert.equal(new Set(mailbox.mails.map(x=>x.id)).size,100);check('parallel mail delivery persists the latest 100 distinct messages without a process-memory mailbox');
 result=await call('get','/api/mail/:playerName',{params:{playerName:'Otro'}});assert.equal(result.statusCode,403);await call('post','/api/mail/:playerName/read-all',{params:{playerName:'Ana'}});assert.equal((await c.Mailbox.findOne({playerName:'Ana'})).mails.every(m=>m.read),true);await call('delete','/api/mail/:playerName/:mailId',{params:{playerName:'Ana',mailId:mailbox.mails[0].id}});assert.equal((await c.Mailbox.findOne({playerName:'Ana'})).mails.length,99);check('mail read, mark-read and delete preserve owner isolation and durable state');
 for(const name of ['playerStatsSchema','PlayerStats','STAT_TYPES_LIST','persistStatsSync','statsSessionOwner'])vm.runInContext(declaration(name),c);
 vm.runInContext('this.Stats=PlayerStats;this.persist=persistStatsSync;this.ownerGuard=statsSessionOwner;',c);await c.Stats.init();
 let stats=await c.Stats.create({playerName:'StatsTest',address:'owner',bronce:1000,chainPending:['bronce']});let baseline=stats.toObject();stats.bronce=900;stats.chainPending=[];stats.lastSync=new Date();
 await c.Stats.updateOne({_id:stats._id},{$inc:{bronce:50},$addToSet:{chainPending:'bronce'}});
 let persisted=await c.persist(stats,baseline);assert.equal(persisted.bronce,1050);assert.deepEqual(Array.from(persisted.chainPending),['bronce']);assert.equal(persisted.lastSync,null);
 check('a stale chain-sync document cannot overwrite a concurrent balance credit or clear its pending flag');
 stats=await c.Stats.findById(stats._id);baseline=stats.toObject();stats.lastSync=new Date();stats.chainPending=[];persisted=await c.persist(stats,baseline);
 assert.ok(persisted.lastSync);assert.equal(persisted.bronce,1050);assert.deepEqual(Array.from(persisted.chainPending),[]);
 check('an unchanged stats snapshot can persist invoice reconciliation and clear only its own pending flags');
 const duplicate=new c.Stats({playerName:'StatsTest',address:'owner',bronce:0});assert.equal((await c.persist(duplicate,duplicate.toObject())).bronce,1050);
 check('simultaneous first-time stats initialization adopts the existing row without overwriting its money');
 c.resolvePlayerName=async x=>x;let forwarded=0;const response={status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
 await c.ownerGuard({params:{playerName:'Ana'},user:{address:'other'}},response,()=>forwarded++);assert.equal(response.code,403);assert.equal(forwarded,0);
 await c.ownerGuard({params:{playerName:'Ana'},user:{address:'owner'}},response,()=>forwarded++);assert.equal(forwarded,1);
 c.GamePlayer={findOne:()=>({select:()=>({lean:async()=>null})})};await c.ownerGuard({params:{playerName:'Missing'},user:{address:'owner'}},response,()=>forwarded++);assert.equal(response.code,403);assert.equal(forwarded,1);
 check('all stats sub-routes reject another wallet or a missing player instead of treating absence as authorization');
 report.ok=true;
 }finally{if(connection)await connection.close(true);if(mongo)await mongo.stop();fs.writeFileSync(output,JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
