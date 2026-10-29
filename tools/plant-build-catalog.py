from pathlib import Path
import json,hashlib,shutil,struct
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('plantutils',str(Path('tools/plant-expansion-utils.py').resolve())).load_module()
names='''rabano|Radish|Rábano
lechuga|Lettuce|Lechuga
nabo|Turnip|Nabo
cebolla|Onion|Cebolla
ajo|Garlic|Ajo
espinaca|Spinach|Espinaca
acelga|Swiss Chard|Acelga
apio|Celery|Apio
perejil|Parsley|Perejil
puerro|Leek|Puerro
judia|Green Bean|Judía
guisante|Pea|Guisante
haba|Broad Bean|Haba
remolacha|Beetroot|Remolacha
rucula|Arugula|Rúcula
achicoria|Chicory|Achicoria
col_china|Bok Choy|Col china
col_rizada|Kale|Col rizada
repollo|Cabbage|Repollo
colinabo|Kohlrabi|Colinabo
hinojo|Fennel|Hinojo
albahaca|Basil|Albahaca
menta|Mint|Menta
romero|Rosemary|Romero
pepino|Cucumber|Pepino
calabacin|Zucchini|Calabacín
berenjena|Eggplant|Berenjena
pimiento|Bell Pepper|Pimiento
chile|Chili Pepper|Chile
patata|Potato|Patata
boniato|Sweet Potato|Boniato
chirivia|Parsnip|Chirivía
daikon|Daikon|Daikon
calabaza_bonetera|Pattypan Squash|Calabaza bonetera
calabaza_moscada|Butternut Squash|Calabaza moscada
melon|Melon|Melón
sandia|Watermelon|Sandía
cacahuete|Peanut|Cacahuete
jengibre|Ginger|Jengibre
curcuma|Turmeric|Cúrcuma
taro|Taro|Taro
yuca|Cassava|Yuca
cana_azucar|Sugar Cane|Caña de azúcar
ruibarbo|Rhubarb|Ruibarbo
uchuva|Cape Gooseberry|Uchuva
limon|Lemon|Limón
naranja|Orange|Naranja
manzana|Apple|Manzana
pera|Pear|Pera
ciruela|Plum|Ciruela
melocoton|Peach|Melocotón
higo|Fig|Higo
platano|Banana|Plátano
papaya|Papaya|Papaya
mango|Mango|Mango
aguacate|Avocado|Aguacate
caqui|Persimmon|Caqui
chayote|Chayote|Chayote
esparrago|Asparagus|Espárrago
carambola|Starfruit|Carambola'''
records=[line.split('|') for line in names.splitlines()];S=Path('Game/newpro/plantav2');D=Path('Game/Objetos/Plantas');assert {x[0] for x in records}=={p.name[7:] for p in S.iterdir() if p.is_dir()}
manifest=[]
for base in [S,D]:
 for p in sorted(base.rglob('*.png')):manifest.append({'path':str(p.resolve()),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
m=u.A/'assets-before.json'
if not m.exists():m.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
crops=[];copied=[]
for i,(key,en,es) in enumerate(records):
 source=S/('planta_'+key);target=D/source.name;target.mkdir(exist_ok=True)
 files=list(source.glob('*.png'));assert len(files)==9,(source,len(files))
 for p in files:
  q=target/p.name
  if q.exists():assert p.read_bytes()==q.read_bytes(),('refusing to replace manual image',q)
  else:shutil.copy2(p,q);copied.append(str(q.resolve()))
 fresh=[p.name for p in files if '_buen' in p.name];rotten=[p.name for p in files if '_podrid' in p.name];assert len(fresh)==len(rotten)==1
 level=7+round(i*143/(len(records)-1));minutes=3+round(level*.42)
 seed_price=12+level*2+round(level*level/150);profit=max(3,round(minutes*(.6+level/160)));sell=round((seed_price*1.05+profit)/.95)+1
 crops.append({'key':key,'name':en,'nameEs':es,'level':level,'growthSeconds':minutes*60,'seedSilver':seed_price,'freshSellSilver':sell,
  'food':min(18,3+level//10),'folder':'./'+target.as_posix()+'/', 'freshImage':fresh[0],'rottenImage':rotten[0]})
source="""/* Shared plant catalog. Additive: existing manual crops and item ids are preserved. */
(function(root,factory){'use strict';const catalog=factory();if(typeof module==='object'&&module.exports)module.exports=catalog;else root.GFPlantCatalog=catalog;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const plants=__PLANTS__;
 const items={},crops={},food={},levels={},itemTypes={},maxStacks={},shopPrices={},referenceValues={},names={},shop={semillas:[],comida:[]},tables=[],consumables=[];
 for(const p of plants){
  const seed='seed_'+p.key,fresh=p.key+'_buena',rotten=p.key+'_mala',short=p.key+'_corta';
  p.seedId=seed;p.freshId=fresh;p.rottenId=rotten;p.shortId=short;
  for(const [id,label,image,kind,buy,sell,gain] of [
   [seed,p.name+' Seeds','item_saco.png','seed',p.seedSilver,Math.floor(p.seedSilver*.35),0],
   [fresh,'Fresh '+p.name,p.freshImage,'fresh',Math.ceil(p.freshSellSilver*1.55),p.freshSellSilver,p.food],
   [rotten,'Rotten '+p.name,p.rottenImage,'rotten',0,Math.max(1,Math.floor(p.seedSilver*.025)),Math.max(1,Math.floor(p.food/3))],
   [short,p.name+' Sprout','planta_crecimiento_'+p.key+'.png','unripe',0,Math.max(1,Math.floor(p.seedSilver*.06)),0]
  ]){
   const maxStack=kind==='seed'?50:20,src=p.folder+image;
   items[id]={src,maxStack,tipo:id,name:label,level:p.level,plantKey:p.key,kind};levels[id]=p.level;itemTypes[id]=id;maxStacks[id]=maxStack;names[id]=[label,src];
   shopPrices[id]=[buy,sell,'p'];referenceValues[id]=sell*1000;
   tables.push({tipo:id,limit:kind==='seed'?1000000:500000,perInvoiceLimit:maxStack,para:p.nameEs+' · '+kind,plantKey:p.key,nivel:p.level});
   shop[kind==='seed'?'semillas':'comida'].push({id,name:label,image:src,buyPrice:buy,sellPrice:sell,currency:'silver',categoria:kind==='seed'?'semillas':'comida',comision:5,limiteDiario:0,nivelRequerido:p.level,
    descripcion:kind==='seed'?'Level '+p.level+' crop. Growth: '+(p.growthSeconds/60)+' minutes.':kind==='fresh'?'Fresh harvest. Restores '+gain+' food.':kind==='rotten'?'Spoiled harvest. Lower value; restores only '+gain+' food.':'An immature plant. Low resale value; not edible.'});
   if(gain){food[id]=gain;consumables.push({id:'consume_'+id,itemId:null,quantity:0,level:0,resources:[{itemId:id,quantity:1}],consume:{stat:'comida',gain}});}
  }
  crops[seed]={id:seed,name:p.name,type:'plant_'+p.key,growthStages:4,growthTime:p.growthSeconds,waterRequired:true,waterCost:1,foodCost:.2,wateringCost:.5,agricultureReq:0,strengthReq:0,levelReq:p.level,
   images:Object.fromEntries([1,2,3,4,5].map(n=>['stage'+n,'gfc_'+p.key+'_'+n])),
   rewards:{item:fresh,quantity:1,progress_reward:short,progress_quantity:1,deadReward:rotten,deadQuantity:1}};
 }
 function freeze(o){for(const v of Object.values(o))if(v&&typeof v==='object'&&!Object.isFrozen(v))freeze(v);return Object.freeze(o);}
 return freeze({version:'20261029.plants1',plants,items,crops,food,levels,itemTypes,maxStacks,shopPrices,referenceValues,names,shop,tables,consumables});
});
""".replace('__PLANTS__',json.dumps(crops,ensure_ascii=False,indent=1))
p=Path('gf-crop-catalog.js');assert not p.exists();u.save(p,source);q=Path('C:/Users/pc/Desktop/gf-crop-catalog.js');assert not q.exists();shutil.copy2(p,q)
(u.A/'copied-images.json').write_text(json.dumps(copied,ensure_ascii=False,indent=2),encoding='utf8');(u.A/'plant-design.json').write_text(json.dumps(crops,ensure_ascii=False,indent=2),encoding='utf8')
print(len(crops),'plants,',len(copied),'images copied without modifying originals; 240 item ids with explicit levels and values')
