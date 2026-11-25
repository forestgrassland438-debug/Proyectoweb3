from pathlib import Path
import shutil
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('cutils',str(Path('tools/continuation-utils.py').resolve())).load_module()
u.change('tienda_sistema.js','...(window.GFPlantCatalog?.shop.semillas || []),','...(window.GFPlantCatalog?.shop.semillas || []).map(item => ({ ...item })),')
u.change('tienda_sistema.js','...(window.GFPlantCatalog?.shop.comida || []),','...(window.GFPlantCatalog?.shop.comida || []).map(item => ({ ...item })),')
u.change('backend-gameplay/native-farm.cjs',"d.notify(row.userId,'cropGrowthUpdate'","d.notify(row.userId,'cropGrowth'")
shutil.copyfile('backend-gameplay/native-farm.cjs','C:/Users/pc/Desktop/native-farm.js')
u.change('gf-native-crops.js'," function visual(crop){",""" function growth(scene,data,run){
  const account=String(scene.currentAccount || '').toLowerCase();
  if(!live(scene,run)||String(data?.userId || '').toLowerCase()!==account)return false;
  const previous=scene.cropData?.get(data.plotId);if(!previous||!catalog?.crops[previous.cropType])return false;
  const next={...previous,...data,cropConfig:data.cropConfig || previous.cropConfig};delete next.timeRemaining;
  if(Number.isFinite(data.timeRemaining))next.currentGrowthTime=Math.max(0,Number(previous.growthDuration)-data.timeRemaining);
  if(next.isCompleted)next.currentGrowthTime=previous.growthDuration;
  scene.updatePlotVisual?.(data.plotId,next);return true;
 }
 function visual(crop){""")
u.change('gf-native-crops.js','waterBatch,visual,attach,isSeed:','waterBatch,visual,attach,growth,isSeed:')
u.change('Scenes/GameScene.js',"  onCrop('nativeFarmResult',data=>window.GFNativeCrops?.adopt(this,data,run));","  onCrop('nativeFarmResult',data=>window.GFNativeCrops?.adopt(this,data,run));\n  onCrop('cropGrowthUpdate',data=>window.GFNativeCrops?.growth(this,data,run));")
u.change('Scenes/GameScene.js',"  onCrop('cropGrowth', (data) => {\n    if (data.userId === this.currentAccount)","  onCrop('cropGrowth', (data) => {\n    if(window.GFNativeCrops?.growth(this,data,run))return;\n    if (data.userId === this.currentAccount)")
# Use the authoritative absolute balances, never add the displayed reward again.
u.change('C:/Users/pc/Desktop/server2.js',"        completedCount: progress.completedCount,\n        rewards:","        completedCount: progress.completedCount,\n        stats: buildStatsResponse(await PlayerStats.findOne({playerName}).lean()),\n        rewards:")
u.change('Scenes/GameScene.js',"    // 9. El servidor ya movió inventario, experiencia y recompensa: se recarga\n", "    if(result.stats){\n      if(!window.playerStats)window.playerStats={};Object.assign(window.playerStats,result.stats);\n      window.GFBronce?.adoptarStats(result.stats);\n      if(Number.isFinite(result.stats.oro))this.moneda=result.stats.oro;\n      if(Number.isFinite(result.stats.plata))this.moneda_plata=result.stats.plata;\n      if(Number.isFinite(result.stats.bronce))this.moneda_bronce=result.stats.bronce;\n    }\n    // 9. El servidor ya movió inventario, experiencia y recompensa: se recarga\n")
print('Mutable shop instances, compatible growth event, canonical mission balance response and immediate HUD adoption')
