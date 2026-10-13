const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const keys=['strength','defense','wisdom','patience','farming','woodcutting','fishing','combat'];
const address='0x'+'1'.repeat(40);
function fixture(){
  const routes=new Map(),rows=[],queues=new Map(),mirror={allocations:{}},stats={_id:'s',playerName:'Tester',vida:50,agua:100,comida:100,plata:100,vidaCongelada:false,lastFullVitalHeal:null,save:async()=>{},markModified(){}},gp={address,playerName:'Tester',nivel_exp:1,inventory:[],chest:[],save:async()=>{},markModified(){}};
  const q=data=>({select(){return this;},lean:async()=>data,then(a,b){return Promise.resolve(data).then(a,b);}});
  let mintFails=false,burnFails=false,tableFails=false;
  const ctx={console,Date,Math,Map,Set,Number,String,Object,clearTimeout,GF_ALLOC_KEYS:keys,apiLimiter(){},authMiddleware(){},csrfProtection(){},
    app:{get:(url,...f)=>routes.set(url,f.at(-1)),post:(url,...f)=>routes.set(url,f.at(-1))},
    jugadorDeLaSesion:async req=>req.user?gp:null,nivelPorExperiencia:x=>x,esFantasma:async()=>false,responderFantasma:r=>r.status(403).json({error:'ghost'}),
    GamePlayer:{findOne:()=>q(gp)},PlayerSkills:{updateOne:async(_f,u)=>Object.assign(mirror,u.$set),findOne:()=>q(mirror)},
    PlayerStats:{findOne:()=>q(stats),updateOne:async(_f,u)=>{if(u.$inc)for(const [k,n]of Object.entries(u.$inc))stats[k]+=n;},findOneAndUpdate:async(f,u)=>{
      if(f.plata?.$gte>stats.plata)return null;
      if(f.$or&&stats.swordGuardReady>Date.now())return null;
      if(f.vida!==undefined&&stats.vida!==f.vida)return null;
      if(u.$inc)for(const [k,n]of Object.entries(u.$inc))stats[k]+=n;if(u.$set)Object.assign(stats,u.$set);return stats;
    }},
    facturasDeCadena:async()=>structuredClone(rows),facturasLibresDeCadena:async()=>structuredClone(rows),crearTablaSiFalta:async()=>!tableFails,
    contratoItemsServidor:()=>({
      createInvoice:async(owner,tipo,cantidad,manualId)=>{rows.push({id:rows.length+1,owner,tipo,cantidad,manualId});return {status:1};},
      increaseInvoiceQuantity:async(id,n)=>{rows.find(r=>r.id===id).cantidad+=n;return {status:1};},
      decreaseInvoiceQuantity:async(id,n)=>{if(burnFails)throw Error('burn failed');rows.find(r=>r.id===id).cantidad-=n;return{status:1};},
      deleteInvoice:async id=>{if(burnFails)throw Error('burn failed');rows.splice(rows.findIndex(r=>r.id===id),1);return{status:1};}
    }),txRelayer:async(_name,fn)=>fn({}),enColaDelJugador:(k,fn)=>{const p=(queues.get(k)||Promise.resolve()).then(fn);queues.set(k,p.catch(()=>{}));return p;},
    _venenos:new Map(),clampStat:(k,n)=>Math.max(0,Math.min(k==='plata'?999999:100,n)),marcarPendienteDeCadena(){},buildStatsResponse:s=>({...s}),applyGhostVitalRegen(){},
    ALQUIMISTA_CATALOGO:{pocion_vida:{plata:65,cura:50}},ALQUIMISTA_MAX_POR_COMPRA:5,ITEM_TIPO_MAP:{pocion_vida:'pocion_vida',pocion_antidoto:'pocion_antidoto'},itemTipoOnChain:x=>x,
    agregarASlots:(inventory,id,qty)=>({metidas:qty,inventory}),ponerFacturaEnSlots:(inventory,chest,id,f)=>({inventory:[...inventory,{id:0,objeto:id,IDX:f.id,cantidad:f.cantidad}],chest}),
    mintGatherReward:async(owner,tipo,cantidad)=>{if(mintFails)throw Error('mint');const f={id:rows.length+1,owner,tipo,cantidad};rows.push(f);return f;}
  };vm.createContext(ctx);vm.runInContext(fs.readFileSync('tools/character-world-server.js','utf8'),ctx);
  async function call(url,body={},auth=true){let status=200,result;await routes.get(url)({user:auth?{address}:null,body},{status(n){status=n;return this;},json(data){result=data;return data;}});return{status,data:result};}
  return{ctx,call,rows,stats,gp,mirror,failMint:()=>mintFails=true,failBurn:()=>burnFails=true,failTable:()=>tableFails=true};
}
test('one point per character level; concurrent allocation cannot overspend or touch pets',async()=>{
  const f=fixture();const results=await Promise.all([f.call('/api/player/skills/allocate',{skill:'strength'}),f.call('/api/player/skills/allocate',{skill:'defense'})]);
  assert.deepEqual(results.map(r=>r.status),[200,409]);assert.equal(f.rows.length,1);assert.equal(f.rows[0].tipo,'player_strength');assert.equal(f.rows[0].cantidad,1);
  assert.equal((await f.call('/api/player/skills')).data.available,0);
});
test('unknown skills, missing auth and failing table creation never spend points',async()=>{
  const f=fixture();assert.equal((await f.call('/api/player/skills/allocate',{skill:'pet_strength'})).status,400);assert.equal((await f.call('/api/player/skills',{},false)).status,403);
  f.failTable();assert.equal((await f.call('/api/player/skills/allocate',{skill:'strength'})).status,503);assert.equal(f.rows.length,0);
});
test('guard requires a sword and its cooldown is server owned',async()=>{
  const f=fixture();assert.equal((await f.call('/api/player/sword-power',{ability:'guard'})).status,409);f.rows.push({id:1,tipo:'madera',cantidad:1,owner:address});
  assert.equal((await f.call('/api/player/sword-power',{ability:'guard'})).status,200);assert.equal((await f.call('/api/player/sword-power',{ability:'guard'})).status,429);
  f.mirror.allocations.defense=10;f.stats.swordGuardUntil=new Date(Date.now()+3000);const cost=await f.ctx.gfCharacterCosts('Tester','mago_mina',{vida:10},f.stats);assert.equal(cost.vida,2.8);
});
test('full water/food heal gradually without offline credit, resurrection or poison healing',()=>{
  const f=fixture(),t=100000;
  assert.equal(f.ctx.gfFullVitalHealing(f.stats,new Date(t)),false);assert.equal(f.ctx.gfFullVitalHealing(f.stats,new Date(t+5000)),true);assert.equal(f.stats.vida,51);
  f.stats.vidaCongelada=true;f.stats.vida=0;assert.equal(f.ctx.gfFullVitalHealing(f.stats,new Date(t+10000)),false);assert.equal(f.stats.vida,0);
  f.stats.vidaCongelada=false;f.stats.vida=30;f.ctx._venenos.set('Tester',{});assert.equal(f.ctx.gfFullVitalHealing(f.stats,new Date(t+15000)),false);f.ctx._venenos.clear();assert.equal(f.ctx.gfFullVitalHealing(f.stats,new Date(t+600000)),false);assert.equal(f.stats.vida,30);
});
test('player potion burns a confirmed canonical invoice, then heals; failed burn has no effect',async()=>{
  const f=fixture();f.rows.push({id:1,owner:address,tipo:'pocion_vida',cantidad:2});f.gp.inventory=[{id:0,objeto:'pocion_vida',IDX:1,cantidad:2}];
  const r=await f.call('/api/alchemist/use',{itemId:'pocion_vida'});assert.equal(r.status,200);assert.equal(f.stats.vida,100);assert.equal(f.rows[0].cantidad,1);assert.equal(f.gp.inventory[0].cantidad,1);
  f.stats.vida=20;f.failBurn();assert.equal((await f.call('/api/alchemist/use',{itemId:'pocion_vida'})).status,503);assert.equal(f.stats.vida,20);assert.equal(f.rows[0].cantidad,1);
});
test('antidote cancels poison only after consuming the owned invoice',async()=>{
  const f=fixture();f.rows.push({id:1,tipo:'pocion_antidoto',owner:address,cantidad:1});f.ctx._venenos.set('Tester',{reloj:null});
  assert.equal((await f.call('/api/alchemist/use',{itemId:'pocion_antidoto'})).status,200);assert.equal(f.ctx._venenos.size,0);assert.equal(f.rows.length,0);
});
test('alchemist serializes purchases; mint failure refunds silver without adding fake items',async()=>{
  const f=fixture();const res={status(n){this.code=n;return this;},json(d){return d;}};const request={user:{address},body:{itemId:'pocion_vida',qty:1}};
  await Promise.all([f.ctx.gfAlchemistBuy(request,res),f.ctx.gfAlchemistBuy(request,res)]);assert.equal(f.rows.length,1);assert.equal(f.stats.plata,35);
  const g=fixture();g.failMint();await g.ctx.gfAlchemistBuy(request,res);assert.equal(g.stats.plata,100);assert.equal(g.gp.inventory.length,0);
});
test('backend Lands water matches the map and rejects interior land and invalid map coordinates',()=>{
  const src=fs.readFileSync('C:/Users/pc/Desktop/server2.js','utf8'),a=src.indexOf('const GF_LANDS_WATER'),z=src.indexOf('function pescaCercaDelAgua',a),c={};vm.createContext(c);vm.runInContext(src.slice(a,z),c);
  assert.equal(c.gfLandsNearWater(32,32),true);assert.equal(c.gfLandsNearWater(2000,1500),false);assert.equal(c.gfLandsNearWater(999999,999999),false);
});
