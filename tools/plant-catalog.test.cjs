'use strict';const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),acorn=require('acorn');
const catalog=require('../gf-crop-catalog'),root=path.resolve(__dirname,'..'),A='C:/Users/pc/.codex/reports/grassland-plantas-20261029';
test('the plant catalog covers all 60 distinct source folders and 240 collision-free item ids',()=>{
 const folders=fs.readdirSync(path.join(root,'Game/newpro/plantav2')).filter(n=>fs.statSync(path.join(root,'Game/newpro/plantav2',n)).isDirectory());
 assert.deepEqual([...catalog.plants.map(p=>'planta_'+p.key)].sort(),folders.sort());assert.equal(Object.keys(catalog.items).length,240);assert.equal(new Set(catalog.tables.map(t=>t.tipo)).size,240);assert.equal(catalog.levels.seed_rabano,7);assert.equal(catalog.levels.seed_carambola,150);
 for(const plant of catalog.plants){for(const id of [plant.seedId,plant.freshId,plant.rottenId,plant.shortId]){assert.equal(catalog.levels[id],plant.level);assert.equal(catalog.items[id].tipo,id);assert.ok(fs.existsSync(path.join(root,catalog.items[id].src)));assert.equal(catalog.items[id].name,catalog.names[id][0]);}
  for(let stage=1;stage<=5;stage++){assert.ok(fs.existsSync(path.join(root,plant.folder,stage+'.png')));assert.equal(catalog.crops[plant.seedId].images['stage'+stage],'gfc_'+plant.key+'_'+stage);}}
});
test('every original source and manually maintained legacy crop image is byte-for-byte unchanged',()=>{
 const before=JSON.parse(fs.readFileSync(A+'/assets-before.json','utf8'));assert.equal(before.length,585);
 for(const image of before)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(image.path)).digest('hex'),image.sha256,image.path);
 for(const plant of catalog.plants)for(const image of fs.readdirSync(path.join(root,'Game/newpro/plantav2/planta_'+plant.key))){const from=fs.readFileSync(path.join(root,'Game/newpro/plantav2/planta_'+plant.key,image)),to=fs.readFileSync(path.join(root,plant.folder,image));assert.deepEqual(to,from);}
});
test('new crop prices, stack limits and reduced rotten-food benefits agree across their registries',()=>{
 for(const p of catalog.plants){const seed=catalog.shopPrices[p.seedId],fresh=catalog.shopPrices[p.freshId],bad=catalog.shopPrices[p.rottenId],short=catalog.shopPrices[p.shortId];
  assert.ok(fresh[1]*.95-seed[0]*1.05>0);assert.ok(seed[0]>seed[1]);assert.ok(fresh[0]>fresh[1]);assert.equal(bad[0],0);assert.equal(short[0],0);assert.ok(bad[1]<short[1]);assert.ok(short[1]<fresh[1]);
  assert.equal(catalog.referenceValues[p.freshId],fresh[1]*1000);assert.equal(catalog.maxStacks[p.seedId],50);assert.equal(catalog.maxStacks[p.freshId],20);
  assert.ok(catalog.food[p.freshId]>catalog.food[p.rottenId]);assert.equal(catalog.food[p.shortId],undefined);
  assert.equal(catalog.consumables.find(c=>c.id==='consume_'+p.freshId).consume.gain,catalog.food[p.freshId]);
 }
});
test('the backend and browser load exactly the same plant catalog bytes',()=>{
 assert.deepEqual(fs.readFileSync(path.join(root,'gf-crop-catalog.js')),fs.readFileSync('C:/Users/pc/Desktop/gf-crop-catalog.js'));
 const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'gf-crop-catalog.js'),'utf8'),context);assert.equal(context.GFPlantCatalog.plants.length,60);assert.equal(context.GFPlantCatalog.items.seed_carambola.name,'Starfruit Seeds');
});
test('every scene item registry retains the expanded plants rather than treating invoices as unknown',()=>{
 for(const file of ['Scenes/GameScene.js','Scenes/LoadingScenegame.js','Scenes/tiendajuego.js','tienda_sistema.js']){
  const source=fs.readFileSync(path.join(root,file),'utf8'),ast=acorn.parse(source,{ecmaVersion:'latest'});let node;const walk=n=>{if(!n||typeof n!=='object')return;if(n.type==='AssignmentExpression'&&n.left?.property && ['ItemDefinitions','_ItemDefinitionsRespaldo'].includes(n.left.property.name)&&n.right.type==='ObjectExpression')node=n.right;for(const x of Object.values(n))if(Array.isArray(x))x.forEach(walk);else if(x&&typeof x==='object')walk(x);};walk(ast);assert.ok(node,file);
  const defs=vm.runInNewContext('('+source.slice(node.start,node.end)+')',{window:{GFPlantCatalog:catalog}});for(const id of Object.keys(catalog.items))assert.equal(defs[id]?.tipo,id,file+' '+id);
 }
});
