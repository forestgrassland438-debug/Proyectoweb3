from pathlib import Path
import shutil
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('plantutils',str(Path('tools/plant-expansion-utils.py').resolve())).load_module();p='C:/Users/pc/Desktop/server2.js'
u.change(p,"      const resourceBatch = op === 'compra' ? await resourcePurchaseBatch(b.itemId,q) : null;", "      if(op==='compra' && GF_CROP_CATALOG.items[b.itemId] && !await crearTablaSiFalta(itemTipoOnChain(b.itemId)))throw ecoError('crop_table_unavailable',503);\n      const resourceBatch = op === 'compra' ? await resourcePurchaseBatch(b.itemId,q) : null;")
u.change(p,"  if(!Object.prototype.hasOwnProperty.call(RESOURCE_ITEM_IDS,tipo))return null;", """  if(GF_CROP_CATALOG.items[itemId]){
    const t=await contratoItemsServidor().getTipoStats(tipo),free=BigInt(t.limit)-BigInt(t.totalQuantity),per=BigInt(t.perInvoiceLimit);
    if(!t.exists || per<1n)throw ecoError('crop_table_unavailable',409);
    if(free<BigInt(quantity))throw ecoError('resource_capacity_exhausted',409);
    return Number(per<BigInt(quantity)?per:BigInt(quantity));
  }
  if(!Object.prototype.hasOwnProperty.call(RESOURCE_ITEM_IDS,tipo))return null;""")
# Crop tables are prepared on demand, before charging. Boot and GET must not
# spend gas creating 240 tables before the essential legacy/stat tables work.
u.change(p,'  for (const t of TABLAS_RECOMENDADAS) {\n    const antes = await infoTablaCadena(t.tipo);','  for (const t of TABLAS_RECOMENDADAS) {\n    if(t.plantKey)continue; // Expanded crop tables initialize before their first use.\n    const antes = await infoTablaCadena(t.tipo);')
u.change(p,'    for (const t of TABLAS_RECOMENDADAS) {\n      let info = await infoTablaCadena(t.tipo);',"    for (const t of TABLAS_RECOMENDADAS) {\n      if(t.plantKey){filas.push({...t,cadena:null,existe:null,lecturaDiferida:true,creadaAhora:false,avisos:['Consultar en Cultivos y tablas']});continue;}\n      let info = await infoTablaCadena(t.tipo);")
u.change(p,'// CRAFT_AUTHORITY_END',"""require('./crop-admin')({app,catalog:GF_CROP_CATALOG,adminAuth,apiLimiter,strictLimiter,csrfProtection,
 contract:contratoItemsServidor,prices:eco2PreciosActuales,Services:ServicioCobro,Players:GamePlayer,Burns:EconomiaQuema,Jobs:authoritativeCrafts.Job,chainId:CHAIN_ID,ensure:crearTablaSiFalta});
// CRAFT_AUTHORITY_END""")
dest=Path('C:/Users/pc/Desktop/crop-admin.js');assert not dest.exists();shutil.copyfile('backend-gameplay/crop-admin.cjs',dest)
u.change('admin.html',"var estado = !c ? '<span class=\"pill warn\">sin leer</span>'", "var estado = t.lecturaDiferida ? '<a href=\"cultivos.html\">Ver Cultivos y tablas</a>' : !c ? '<span class=\"pill warn\">sin leer</span>'")
u.change('control-center.js',"    { id:'recursos', file:'recursos.html'", "    { id:'cultivos', file:'cultivos.html', name:'Cultivos y tablas', icon:'prices', group:'Game control', text:'Plantas, niveles, tablas, porcentajes, precios, compras, ventas y quemas de objetos.' },\n    { id:'recursos', file:'recursos.html'")
p=Path('cultivos.html');u.save(p,u.read(p).replace('<script defer src="cultivos.js','<script defer src="gf-graficos.js?v=20261029.plants1"></script><script defer src="cultivos.js'))
for p in [Path('gf-crop-catalog.js'),Path('C:/Users/pc/Desktop/gf-crop-catalog.js')]:
 s=u.read(p);old="consumables.push({id:'consume_'+id,itemId:null,quantity:0,level:0,";assert old in s;u.save(p,s.replace(old,"consumables.push({id:'consume_'+id,itemId:null,quantity:0,level:p.level,"))
print('Crop administration mounted; NPC preflight creates missing crop tables without changing existing limits or charging first')
