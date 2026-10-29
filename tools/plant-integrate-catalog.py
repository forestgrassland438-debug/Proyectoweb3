from pathlib import Path
import re,shutil
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('plantutils',str(Path('tools/plant-expansion-utils.py').resolve())).load_module()
server=Path('C:/Users/pc/Desktop/server2.js')
u.change(server,"const crypto = require('crypto');","const crypto = require('crypto');\nconst GF_CROP_CATALOG=require('./gf-crop-catalog');")
props=[('const ITEM_TIPO_MAP = {','itemTypes'),('const ITEM_MAX_STACK = {','maxStacks'),('const GF_NIVEL_OBJETO = Object.freeze({','levels'),('const ECO2_VALOR_REFERENCIA = Object.freeze({','referenceValues')]
for anchor,key in props:u.change(server,anchor,anchor+"\n  ...(typeof GF_CROP_CATALOG==='undefined'?{}:GF_CROP_CATALOG."+key+'),')
u.change(server,'const TIENDA_PRECIOS = {','const TIENDA_PRECIOS = {...GF_CROP_CATALOG.shopPrices,')
u.change(server,'const TABLAS_RECOMENDADAS = [','const TABLAS_RECOMENDADAS = [\n  ...GF_CROP_CATALOG.tables,')
u.change(server,"const SUELO_SOLTABLES = new Set([","const SUELO_SOLTABLES = new Set([\n  ...Object.keys(GF_CROP_CATALOG.items),")
u.change(server,"const TABLAS_SOLO_ACUNA_SERVIDOR = new Set(['pes1'","const TABLAS_SOLO_ACUNA_SERVIDOR = new Set([...Object.keys(GF_CROP_CATALOG.items), 'pes1'")
u.change(server,'    this.cropTypes = {','    this.cropTypes = {\n      ...GF_CROP_CATALOG.crops,')
u.change(server,"consumables:require('./consumables.json')","consumables:[...require('./consumables.json'),...GF_CROP_CATALOG.consumables]")

for file in ['Scenes/GameScene.js','Scenes/LoadingScenegame.js','Scenes/tiendajuego.js']:
 p=Path(file);s=u.read(p);matches=list(re.finditer(r'^[ \t]+this\.ItemDefinitions = \{',s,re.M));assert len(matches)==1,(file,len(matches));anchor=matches[0][0];u.change(p,anchor,anchor+'\n          ...(window.GFPlantCatalog?.items || {}),')
p=Path('tienda_sistema.js');u.change(p,'this._ItemDefinitionsRespaldo = {','this._ItemDefinitionsRespaldo = {\n          ...(window.GFPlantCatalog?.items || {}),')
u.change(p,'            semillas: [','            semillas: [\n                ...(window.GFPlantCatalog?.shop.semillas || []),')
u.change(p,'            alimentos: [','            alimentos: [\n                ...(window.GFPlantCatalog?.shop.comida || []),')
p=Path('Scenes/GameScene.js')
u.change(p,'CONSUMABLES_FOOD = {','CONSUMABLES_FOOD = {\n  ...(window.GFPlantCatalog?.food || {}),')
for anchor,arg in [('getItemDisplayName(itemId) {','itemId'),('_getSeedDisplayNameEN(seedType) {','seedType'),('_getFruitDisplayNameEN(itemId) {','itemId')]:
 u.change(p,anchor,anchor+'\n  if(window.GFPlantCatalog?.items['+arg+'])return window.GFPlantCatalog.items['+arg+'].name;')
u.change(p,'  for (const [clave, ruta] of TEXTURAS) {',"  for(const plant of window.GFPlantCatalog?.plants || [])for(let stage=1;stage<=5;stage++)TEXTURAS.push(['gfc_'+plant.key+'_'+stage,plant.folder+stage+'.png']);\n  for (const [clave, ruta] of TEXTURAS) {")
u.change('gf-niveles-objetos.js','  var TABLA = Object.freeze({','  var TABLA = Object.freeze({\n    ...(window.GFPlantCatalog?.levels || {}),')
u.change('precios.js','  const NOMBRES = {','  const NOMBRES = {\n    ...(root.GFPlantCatalog?.names || {}),')
u.change('market.html','  const ITEM_NAME_EN = {',"  const ITEM_NAME_EN = {\n    ...Object.fromEntries(Object.entries(window.GFPlantCatalog?.items || {}).map(([id,d])=>[id,d.name])),")
for p in [Path('marketplace-routes.js'),Path('C:/Users/pc/Desktop/marketplace-routes.js')]:
 u.change(p,'const ITEM_CATALOG = {',"const ITEM_CATALOG = {\n  ...Object.fromEntries(Object.entries(require('./gf-crop-catalog').items).map(([id,d])=>[id,{name:d.name,category:d.kind==='seed'?'semillas':'cultivos',icon:d.src.replace(/^\\./,''),maxStack:d.maxStack}])),")
# The same catalog must load before every standalone scene/shop/price page.
changed=[]
for p in Path('.').glob('*.html'):
 s=u.read(p)
 if any(name in s for name in ['Scenes/GameScene.js','Scenes/LoadingScenegame.js','tienda_sistema.js','gf-niveles-objetos.js','precios.js']) or p.name=='market.html':
  assert '<head' in s.lower(),p;u.backup(p);end=s.lower().index('>',s.lower().index('<head'))+1
  u.save(p,s[:end]+'\n<script src="./gf-crop-catalog.js?v=20261029.plants1"></script>'+s[end:]);changed.append(str(p))
# Align the existing shop's category id; preserve the shared catalog key.
for p in [Path('gf-crop-catalog.js'),Path('C:/Users/pc/Desktop/gf-crop-catalog.js')]:
 s=u.read(p);assert "categoria:kind==='seed'?'semillas':'comida'" in s;u.save(p,s.replace("categoria:kind==='seed'?'semillas':'comida'","categoria:kind==='seed'?'semillas':'alimentos'"))
print('Catalog integrated into backend registries, all three scene catalogs, NPC/P2P, prices and',len(changed),'entry pages')
