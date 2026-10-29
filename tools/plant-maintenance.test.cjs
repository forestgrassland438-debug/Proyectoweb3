'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),acorn=require('acorn');
const source=fs.readFileSync('C:/Users/pc/Desktop/server2.js','utf8'),ast=acorn.parse(source,{ecmaVersion:'latest',ranges:true});
const decl=name=>{const n=ast.body.find(n=>n.id?.name===name);assert.ok(n,name);return source.slice(n.start,n.end);};
test('the actual maintenance timer purges stale records and logs without referencing retired gather state',()=>{
 const now=Date.now(),old=now-7200000,active=now-1000,logs=[],freed=[];
 const c={Date,Math,Object,console:{log:(...a)=>logs.push(a)},PURGA_EDAD_MS:3600000,PESCA_SESION_MS:60000,FANTASMA_CACHE_MS:30000,
  plantSpamTracker:new Map([['old',{lastPlantAt:old}],['active',{lastPlantAt:active}],['locked',{lastPlantAt:old,lockedUntil:now+60000}]]),
  rooms:{live:{socket:{}}},chatHistory:new Map([['empty',[]],['live',[]]]),GFBrawlMotor:{REGLAS:{CUENTA_MS:1000,DURACION_MAX_MS:180000}},
  battleMatches:new Map([['old',{creada:old}],['live',{creada:active}]]),socketMatch:new Map([['gone','old'],['present','live']]),brawlSoltarJugadores:m=>freed.push(m),
  _pescaSesiones:new Map([['old',{t0:old}],['live',{t0:active}]]),_pvpEspadas:new Map([['old',{hasta:old}],['live',{hasta:now+60000}]]),
  _cacheFantasma:new Map([['old',{t:old}],['live',{t:active}]]),_tradUso:new Map([['old',{desde:old}],['live',{desde:active}]]),
  _infoTablaCache:new Map([['old',{at:old}],['live',{at:active}]]),_falloTabla:new Map([['old',old],['live',active]]),_motivoTabla:new Map([['old','expired'],['live','keep']]),
  _nftCacheJugador:new Map([['old',{at:old}],['live',{at:active}]]),_adminAddrCache:new Map([['old',{at:old}],['live',{at:active}]])};
 for(const name of ['_gfResetPuntos','_verifierCooldown','_cuervoUltimo','_pescaUltimo','_casillasUltimoEnvio'])c[name]=new Map([['old',old],['live',active]]);
 vm.createContext(c);const purge=vm.runInContext(decl('purgarMapaDeTiempos')+';'+decl('purgarMapasEnMemoria')+';purgarMapasEnMemoria',c);
 const result=purge();assert.equal(result.plantSpamTracker,1);assert.equal(c.plantSpamTracker.size,2);assert.equal(c._verifierCooldown.size,1);assert.equal(c.chatHistory.size,1);
 assert.equal(c.battleMatches.size,1);assert.equal(c.socketMatch.size,1);assert.equal(c._motivoTabla.has('old'),false);assert.equal(freed.length,1);assert.equal(logs.length,1);
 assert.doesNotThrow(()=>purge());assert.equal(logs.length,1);
});
test('all free names in the maintenance function are declared in the backend or are standard globals',()=>{
 const scope=require('eslint-scope').analyze(ast,{ecmaVersion:2024,sourceType:'script',ignoreEval:true});
 const fn=scope.scopes.find(s=>s.block.type==='FunctionDeclaration'&&s.block.id?.name==='purgarMapasEnMemoria');assert.ok(fn);
 const globals=new Set(scope.globalScope.variables.map(v=>v.name));for(const name of ['Date','Object','Math','console','JSON'])globals.add(name);
 assert.deepEqual([...new Set(fn.through.map(r=>r.identifier.name).filter(n=>!globals.has(n)))],[]);
});
