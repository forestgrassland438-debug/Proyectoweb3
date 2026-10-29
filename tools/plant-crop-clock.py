from pathlib import Path
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('plantutils',str(Path('tools/plant-expansion-utils.py').resolve())).load_module()
u.change('gf-native-crops.js',"const catalog=root.GFPlantCatalog,queues=new Map(),references=new Map(),counts=new Map();","const catalog=root.GFPlantCatalog,queues=new Map(),references=new Map(),counts=new Map(),clocks=new WeakMap();")
u.change('gf-native-crops.js'," root.GFNativeCrops=Object.freeze({run,plantBatch,harvestBatch,waterBatch,isSeed:",""" function visual(crop){
  if(!catalog?.crops[crop.cropType]||!crop.isWatered||crop.isCompleted||crop.isDead)return;
  let anchor=clocks.get(crop);if(!anchor){anchor={at:performance.now(),elapsed:Number(crop.currentGrowthTime)||0};clocks.set(crop,anchor);}
  crop.currentGrowthTime=Math.min(crop.growthDuration,anchor.elapsed+Math.max(0,Math.floor((performance.now()-anchor.at)/1000)));
  crop.growthStage=crop.currentGrowthTime>=crop.growthDuration/2?3:2;
 }
 function attach(scene){
  if(scene._nativeCropClock||!scene.time?.addEvent)return;const runId=scene._sceneRunId;
  const timer=scene._nativeCropClock=scene.time.addEvent({delay:1000,loop:true,callback:()=>{if(!live(scene,runId))return;for(const [plot,crop]of scene.cropData || [])if(catalog?.crops[crop.cropType]&&crop.isWatered&&!crop.isCompleted&&!crop.isDead)scene.updatePlotVisual(plot,crop);}});
  scene._onceSceneEnd(()=>{timer.remove(false);if(scene._nativeCropClock===timer)scene._nativeCropClock=null;});
 }
 root.GFNativeCrops=Object.freeze({run,plantBatch,harvestBatch,waterBatch,visual,attach,isSeed:""")
u.change('Scenes/GameScene.js',"setupCropSocketEvents() {","setupCropSocketEvents() {\n  window.GFNativeCrops?.attach(this);")
u.change('Scenes/GameScene.js',"updatePlotVisual(plotId, cropData) {\n", "updatePlotVisual(plotId, cropData) {\n  window.GFNativeCrops?.visual(cropData);\n")
u.change('Scenes/GameScene.js',"  if (this.textures.exists(textureKey)) {\n    imagen.setTexture(textureKey);", "  if(window.GFNativeCrops?.isCrop(cropData)&&progressText){if(cropData.isDead)progressText.setText('Rotten crop');else if(cropData.isCompleted)progressText.setText('Harvest!');else if(!cropData.isWatered)progressText.setText('Needs Water');else if(cropData.currentGrowthTime>=cropData.growthDuration)progressText.setText('Confirming growth…');}\n  if (this.textures.exists(textureKey)) {\n    imagen.setTexture(textureKey);")
u.change('tools/audit-gemini-craft-integration.cjs','const vipContext={Date,Math,Number,String,Map,VipEstado:', 'const vipContext={authoritativeFarm:{recipes:[]},Date,Math,Number,String,Map,VipEstado:')
print('One scene-owned crop clock; elapsed presentation cannot create a harvest')
