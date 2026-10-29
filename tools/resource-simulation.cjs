'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const src=fs.readFileSync('tools/resource-economy.fragment.cjs','utf8');
const create=vm.runInNewContext('('+src.slice(src.indexOf('function createResourceEconomy'),src.indexOf('\nconst resourcePolicySchema')).trim()+')');
const types=Array.from({length:8},(_,i)=>'table'+i);let reads=0,peakRPC=0,active=0;
const engine=create({knownTypes:types,now:()=>100000,readPolicy:async()=>null,readStats:async()=>{reads++;active++;peakRPC=Math.max(peakRPC,active);await new Promise(r=>setImmediate(r));active--;return{totalQuantity:75000,limit:100000,perInvoiceLimit:50,invoiceCount:1500,totalBurned:0,exists:true}}});
const evaluate=q=>engine.evaluate({totalQuantity:Math.floor(q),limit:100000,perInvoiceLimit:50,invoiceCount:0,totalBurned:0,exists:true});
(async()=>{
 const start=performance.now();let peakHeap=0;
 for(let batch=0;batch<1000;batch++){await Promise.all(Array.from({length:1000},(_,i)=>engine.state(types[i%8])));peakHeap=Math.max(peakHeap,process.memoryUsage().heapUsed);}
 assert.equal(reads,8);assert.ok(peakRPC<=3);assert.equal(engine.metrics().entries,8);assert.equal(engine.metrics().queued,0);
 const scenarios=[];
 for(const cfg of [{name:'1.000 jugadores · consumo 1.000 u/día',players:1000,consumption:1000},{name:'1.000.000 jugadores · consumo 5.000 u/día',players:1000000,consumption:5000},{name:'1.000.000 jugadores · sin consumo',players:1000000,consumption:0},{name:'1.000.000 · consumo desde día 181',players:1000000,consumption:5000,recovery:180}]){
  let q=0,minted=0,burned=0,blocked=0;const days=[];
  for(let hour=0;hour<365*24;hour++){
   const consumed=Math.min(q,Math.floor((cfg.recovery && hour<cfg.recovery*24?0:cfg.consumption)/24));q-=consumed;burned+=consumed;
   const policy=evaluate(q),demand=Math.floor(cfg.players*2/24);
   // Synthetic single-resource world: 20 nodes, two units per successful harvest.
   // The real map differs. RPC costs, latency and player behavior are not simulated.
   const physicalCapacity=Math.floor(20*3600/policy.respawnSeconds)*2;
   const accepted=Math.max(0,Math.min(100000-q,demand,physicalCapacity));
   q+=accepted;minted+=accepted;blocked+=demand-accepted;
   assert.ok(q>=0 && q<=100000);assert.equal(minted-burned,q);
   if(hour%24===23)days.push({day:Math.floor(hour/24)+1,quantity:q,occupancy:q/1000,respawn:evaluate(q).respawnSeconds,minted,burned});
  }
  scenarios.push({...cfg,days,final:q,minted,burned,blocked});
 }
 const report={ok:true,scope:'Policy simulation, not a multiplayer capacity or production load test',assumptions:{cap:100000,perInvoice:50,nodes:20,unitsPerHarvest:2,startingStock:0,days:365},benchmark:{requests:1000000,batch:1000,elapsedMs:Math.round(performance.now()-start),reads,peakRPC,peakHeapBytes:peakHeap,cache:engine.metrics()},curve:Array.from({length:101},(_,i)=>({percent:i,...evaluate(i*1000)})),scenarios};
 fs.writeFileSync('audits/recursos-20261028/simulation.json',JSON.stringify(report,null,2));console.log(JSON.stringify({ok:true,benchmark:report.benchmark,finals:scenarios.map(s=>({name:s.name,final:s.final}))},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
