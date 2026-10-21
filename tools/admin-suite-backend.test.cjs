'use strict';
// Extract actual production handlers by AST. Never execute server startup or access a database/RPC.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const acorn=require('acorn');
const source=fs.readFileSync(process.env.GF_BACKEND_SOURCE||'C:/Users/pc/Desktop/server2.js','utf8');
const ast=acorn.parse(source,{ecmaVersion:'latest'});
const copy=value=>JSON.parse(JSON.stringify(value));
function declaration(name){const node=ast.body.find(n=>n.id?.name===name||n.declarations?.some(d=>d.id.name===name));assert.ok(node,'Missing '+name);return source.slice(node.start,node.end);}
function handler(method,path){const node=ast.body.find(n=>n.type==='ExpressionStatement'&&n.expression.callee?.object?.name==='app'&&n.expression.callee?.property?.name===method&&n.expression.arguments[0]?.value===path);assert.ok(node,'Missing route '+path);const fn=node.expression.arguments.at(-1);return '('+source.slice(fn.start,fn.end)+')';}
function fixture(extra={}){
  const writes=[],context={console:{log(){},error(){},warn(){}},MISSION_NPCS:['granjero','guardian'],Date,...extra};
  context.DailyMission={findOne:()=>({lean:async()=>({missions:[{missionId:'test',itemId:'carbon'}],dailyResetHour:4,auto:true})}),async findOneAndUpdate(query,update){writes.push({query:copy(query),update:copy(update)});return update;},...extra.DailyMission};
  vm.createContext(context);vm.runInContext(declaration('gfMissionDayValid')+';this.valid=gfMissionDayValid;',context);
  return {context,writes,async run(method,path,req){let status=200,body;const res={status(n){status=n;return this;},json(value){body=value;return this;}};await vm.runInContext(handler(method,path),context)(req,res);return {status,body};}};
}
test('real calendar validation accepts leap days and rejects impossible or untrusted dates',()=>{
  const {context:c}=fixture();for(const value of ['2026-10-21','2028-02-29','2000-02-29'])assert.equal(c.valid(value),true,value);
  for(const value of ['2026-02-29','2026-02-30','2026-04-31','2026-13-01','2026-00-01','2026-10-00','2026-1-1',null,{},['2026-10-21'],'2026-10-21T00:00:00Z'])assert.equal(c.valid(value),false,String(value));
});
test('saving over an automatic day explicitly protects the manual edition from rerolls',async()=>{
  const f=fixture({sanearMisionesDelDia:value=>value});const result=await f.run('put','/api/admin/missions/daily',{body:{npcId:'granjero',day:'2026-10-21',dailyResetHour:4,missions:[{missionId:'mine',itemId:'carbon',expReward:0}]}});
  assert.equal(result.status,200);assert.equal(f.writes[0].update.$set.auto,false);assert.equal(f.writes[0].update.$set.missions[0].expReward,0);
  const invalid=await f.run('put','/api/admin/missions/daily',{body:{npcId:'granjero',day:'2026-02-30',missions:[]}});assert.equal(invalid.status,400);assert.equal(f.writes.length,1);
});
test('copied automatic days become manual schedules and invalid dates perform no writes',async()=>{
  const f=fixture();const result=await f.run('post','/api/admin/missions/copy',{body:{npcId:'granjero',fromDay:'2026-10-21',toDay:'2026-10-22',repeatDays:2}});
  assert.equal(result.status,200);assert.deepEqual(copy(result.body.days),['2026-10-22','2026-10-23']);assert.ok(f.writes.every(w=>w.update.$set.auto===false));
  const invalid=await f.run('post','/api/admin/missions/copy',{body:{npcId:'granjero',fromDay:'2026-10-21',toDay:'2026-02-30'}});assert.equal(invalid.status,400);assert.equal(f.writes.length,2);
});
test('a refused reroll of a manual day has zero side effects on rules or seed',async()=>{
  let mutations=0;
  const f=fixture({DailyMission:{findOne:()=>({lean:async()=>({auto:false})})},MisionesAutoConfig:{findOneAndUpdate(){mutations++;throw Error('Must not write');}},gfReglasAuto(){throw Error('Must not need rules');}});
  const result=await f.run('post','/api/admin/missions/auto/:npcId/reroll',{params:{npcId:'granjero'}});assert.equal(result.status,409);assert.equal(result.body.error,'today_is_manual');assert.equal(mutations,0);
});
test('reroll increments the seed atomically and deletes only an automatic day',async()=>{
  let update,deleted;
  const f=fixture({DailyMission:{deleteOne:async query=>{deleted=copy(query);}},MisionesAutoConfig:{findOneAndUpdate(query,value){update=copy(value);return {lean:async()=>({semilla:9})};}},gfReglasAuto:async()=>({semilla:8,activo:true}),gfMisionesAutoDelDia:async()=>({missions:[]})});
  const result=await f.run('post','/api/admin/missions/auto/:npcId/reroll',{params:{npcId:'granjero'}});assert.equal(result.status,200);assert.deepEqual(update.$inc,{semilla:1});assert.equal(deleted.auto,true);assert.equal(result.body.semilla,9);
});
test('empty automatic previews are a successful empty result and cannot call the nonempty sanitizer',async()=>{
  const f=fixture({gfSanearReglas:()=>({}),gfGenerarMisiones:()=>[],sanearMisionesDelDia:()=>{throw Error('Empty sanitizer must not run');}});
  const result=await f.run('post','/api/admin/missions/auto/:npcId/preview',{params:{npcId:'granjero'},body:{day:'2026-10-21',reglas:{}}});assert.equal(result.status,200);assert.equal(result.body.missions.length,0);
});
test('history counts distinct UTC days for players using more than one NPC',async()=>{
  let pipeline;
  const chain={select(){return this;},sort(){return this;},limit(){return this;},lean:async()=>[{playerName:'test',misiones:2,nivel:1}]};
  const f=fixture({GamePlayer:{find:()=>chain},UserDailyProgress:{aggregate:async value=>{pipeline=copy(value);return [{_id:'test',dias:['2026-10-21'],entregas:2}];}}});
  const result=await f.run('get','/api/admin/missions/history',{query:{}});assert.equal(result.status,200);assert.deepEqual(pipeline[1].$group.dias,{$addToSet:'$day'});assert.equal(result.body.rows[0].diasConActividad,1);
});
test('all original controls and local dependencies remain present in the eight pages',()=>{
  const path=require('node:path'),root=path.resolve(__dirname,'..'),backup=path.join(root,'audits/admin-suite-20261020-225316');
  for(const file of ['admin.html','colecciones.html','climas.html','consola-reportes.html','contrato-stats.html','misiones.html','puerta_login.html','reporter.html']){
    const before=fs.readFileSync(path.join(backup,file),'utf8'),after=fs.readFileSync(path.join(root,file),'utf8');
    const ids=text=>new Set([...text.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));const current=ids(after);
    for(const id of ids(before))assert.ok(current.has(id),file+' lost '+id);
    for(const match of after.matchAll(/(?:src|href)="(\.\/[^"?#]+)(?:\?[^"#]*)?"/g))assert.ok(fs.existsSync(path.resolve(root,match[1])),file+' missing '+match[1]);
  }
});
