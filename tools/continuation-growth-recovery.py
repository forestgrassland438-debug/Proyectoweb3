from pathlib import Path
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('cutils',str(Path('tools/continuation-utils.py').resolve())).load_module()
u.change('gf-native-crops.js',"  const timer=scene._nativeCropClock=scene.time.addEvent({delay:1000,loop:true,callback:()=>{if(!live(scene,runId))return;for(const [plot,crop]of scene.cropData || [])if(catalog?.crops[crop.cropType]&&crop.isWatered&&!crop.isCompleted&&!crop.isDead)scene.updatePlotVisual(plot,crop);}});", """  let lastRefresh=0;
  const timer=scene._nativeCropClock=scene.time.addEvent({delay:1000,loop:true,callback:()=>{
   if(!live(scene,runId))return;let due=false;
   for(const [plot,crop]of scene.cropData || [])if(catalog?.crops[crop.cropType]&&crop.isWatered&&!crop.isCompleted&&!crop.isDead){scene.updatePlotVisual(plot,crop);if(crop.currentGrowthTime>=crop.growthDuration)due=true;}
   if(due&&performance.now()-lastRefresh>=20000&&root.document?.visibilityState!=='hidden'){lastRefresh=performance.now();scene.loadUserCrops?.();}
  }});""")
p='C:/Users/pc/Desktop/server2.js'
u.change(p,"        for (const crop of caducadas) {\n          crop.isDead = true;\n          await crop.save();", "        for (const crop of caducadas) {\n          const changed=await UserCrop.updateOne({_id:crop._id,nativeLocked:{$ne:true},isDead:false,isHarvested:false,isCompleted:true,expiresAt:{$lte:ahora}},{$set:{isDead:true}});\n          if(changed.modifiedCount!==1)continue;\n          crop.isDead = true;")
u.change(p,"        for (const crop of secas) {\n          crop.isDead = true;\n          crop.sedientaHasta = null;\n          await crop.save();", "        for (const crop of secas) {\n          const changed=await UserCrop.updateOne({_id:crop._id,nativeLocked:{$ne:true},isDead:false,isHarvested:false,isCompleted:false,isWatered:false,sedientaHasta:{$lte:ahora}},{$set:{isDead:true,sedientaHasta:null}});\n          if(changed.modifiedCount!==1)continue;\n          crop.isDead = true;\n          crop.sedientaHasta = null;")
print('Dropped growth notification recovers through bounded refresh; expiry cannot overwrite an active farm reservation')
