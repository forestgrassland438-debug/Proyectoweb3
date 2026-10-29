from pathlib import Path
import shutil
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('plantutils',str(Path('tools/plant-expansion-utils.py').resolve())).load_module();p='Scenes/GameScene.js'
u.change(p,'async _procesarLoteSiembra(lote) {','async _procesarLoteSiembra(lote) {\n  if(window.GFNativeCrops?.isSeed(lote.seedType))return window.GFNativeCrops.plantBatch(this,lote);')
u.change(p,'async _procesarLoteCorte(plotIds) {',"async _procesarLoteCorte(plotIds) {\n  const nativePlots=plotIds.filter(id=>window.GFNativeCrops?.isCrop(this.cropData.get(id)));\n  if(nativePlots.length){await window.GFNativeCrops.harvestBatch(this,nativePlots);plotIds=plotIds.filter(id=>!nativePlots.includes(id));if(!plotIds.length)return;}")
for name,mode in [('_regarLoteConRegadera','can'),('_regarLoteConBaldes','bucket')]:
 anchor='async '+name+'(plotIds) {'
 u.change(p,anchor,anchor+"\n  const nativePlots=plotIds.filter(id=>window.GFNativeCrops?.isCrop(this.cropData.get(id)));\n  let nativeCount=0;if(nativePlots.length){nativeCount=await window.GFNativeCrops.waterBatch(this,nativePlots,'"+mode+"');plotIds=plotIds.filter(id=>!nativePlots.includes(id));if(!plotIds.length)return nativeCount;}")
# Return totals to the existing batch interface, without awarding the native
# operation's server-confirmed experience a second time locally.
s=u.read(p)
for name,nextname in [('_regarLoteConRegadera','_regarLoteConBaldes'),('_regarLoteConBaldes','_getFruitDisplayNameEN')]:
 a=s.index('async '+name+'(plotIds)');b=s.index(nextname+'(',a+len('async '+name+'(plotIds)'));part=s[a:b];assert part.count('return regadas;')==1;part=part.replace('return regadas;','return regadas+nativeCount;');s=s[:a]+part+s[b:]
u.save(p,s)
u.change(p,'  this._riegoEnCurso = true;\n  try {','  this._riegoEnCurso = true;this._nativeWaterCount=0;\n  try {')
u.change(p,'this.nivel_exp = (this.nivel_exp || 0) + 5 * regadas;','this.nivel_exp = (this.nivel_exp || 0) + 5 * Math.max(0,regadas-(this._nativeWaterCount||0));')
u.change(p,"  const cropData = this.cropData.get(plotId);\n  if (!cropData) return;\n\n  const cropConfig = this.cropTypes[cropData.cropType] || cropData.cropConfig;", "  const cropData = this.cropData.get(plotId);\n  if (!cropData) return;\n  if(window.GFNativeCrops?.isCrop(cropData))return !!await window.GFNativeCrops.waterBatch(this,[plotId],'can');\n\n  const cropConfig = this.cropTypes[cropData.cropType] || cropData.cropConfig;")
u.change(p,"  onCrop('cropConfig', (config) => {", "  onCrop('nativeFarmResult',data=>window.GFNativeCrops?.adopt(this,data,run));\n  onCrop('cropConfig', (config) => {")
u.change('gf-salvaje.js',"  ['Semillax', 'Semillax1'","  [...Object.keys(window.GFPlantCatalog?.items || {}), 'Semillax', 'Semillax1'")
for p in Path('.').glob('*.html'):
 s=u.read(p)
 if 'Scenes/GameScene.js' in s:
  anchor='<script src="./gf-crop-catalog.js?v=20261029.plants1"></script>';assert anchor in s,p;u.change(p,anchor,anchor+'\n<script src="./gf-native-crops.js?v=20261029.plants1" defer></script>')
p='C:/Users/pc/Desktop/server2.js'
u.change(p,'  notify:(wallet,event,data)=>io.to(',"  progress:async(playerName)=>{const gp=await GamePlayer.findOne({playerName}).select('nivel_exp agricultura agricultura_exp').lean();return gp?{nivel_exp:Number(gp.nivel_exp)||0,agricultura:Number(gp.agricultura)||0,agricultura_exp:Number(gp.agricultura_exp)||0}:{};},\n  notify:(wallet,event,data)=>io.to(")
u.change(p,'    crop.growthDuration = nueva;', '    crop.growthDuration = nueva;\n    if(crop.nativeFarm && crop.nativeWateredAt)crop.nativeReadyAt=new Date(new Date(crop.nativeWateredAt).getTime()+nueva*1000);')
u.change(p,'  serviceFingerprint:authoritativeFarm.fingerprint,',"  afterService:async(job)=>{if(job.kind==='farm')io.to('wallet:'+job.wallet).emit('nativeFarmResult',await authoritativeCrafts.describe(job));},\n  serviceFingerprint:authoritativeFarm.fingerprint,")
p=Path('backend-gameplay/crafting-authority.cjs')
u.change(p,"if(job.kind!=='vip'){try{await d.persistInventory(job.wallet);}catch(_){}}", "if(job.kind!=='vip'){try{await d.persistInventory(job.wallet);}catch(_){}}\n   if(job.kind==='farm' && d.afterService){try{await d.afterService(job);}catch(_){}}")
u.change(p,"full.privateSteps.filter(s=>s.kind==='mint'&&s.status==='confirmed')", "full.privateSteps.filter(s=>s.kind==='mint'&&s.status==='confirmed'&&byId.has(s.invoiceId))")
u.change(p,"newTotal:byId.get(s.invoiceId)||s.amount","newTotal:byId.get(s.invoiceId)")
shutil.copyfile(p,'C:/Users/pc/Desktop/crafting-authority.js');shutil.copyfile('backend-gameplay/native-farm.cjs','C:/Users/pc/Desktop/native-farm.js')
print('Native farm UI connected for planting, harvesting and both watering modes; canonical reward adoption avoids stale invoice resurrection')
