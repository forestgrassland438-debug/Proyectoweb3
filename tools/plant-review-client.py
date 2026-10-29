from pathlib import Path
import shutil
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('plantutils',str(Path('tools/plant-expansion-utils.py').resolve())).load_module()
u.change('precios.js',"      if (elegido) await abrir(elegido, true);", "      if (!elegido) { const requested = new URLSearchParams(root.location.search).get('itemId'); if (requested && d.items.some(x => x.itemId === requested)) elegido = requested; }\n      if (elegido) await abrir(elegido, true);")
u.change('cultivos.html','Las tablas ausentes se crean con los límites registrados al iniciar el servidor o al necesitarse.','Las tablas nuevas se crean con los límites registrados antes de su primera compra o uso, o con el botón de preparación.')
u.change('backend-gameplay/native-farm.cjs'," async function describe(job){const m=job.metadata,rows=await Crop.find({userId:job.wallet,plotId:{$in:m.plots},isHarvested:false}).lean();return {farm:{action:m.action,seedType:m.seedType,mode:m.mode,plotIds:m.plots,crops:rows.map(dto)},...(d.progress?{progress:await d.progress(job.playerName)}:{})};}",""" async function describe(job){const m=job.metadata,rows=await Crop.find({userId:job.wallet,plotId:{$in:m.plots},isHarvested:false}).lean();
  const tool=m.tool?await Tools.findOne({invoiceId:m.tool.invoiceId}).select('invoiceId usos maxUsos').lean():null;
  return {farm:{action:m.action,seedType:m.seedType,mode:m.mode,plotIds:m.plots,crops:rows.map(dto)},toolUses:tool?[tool]:[],...(d.progress?{progress:await d.progress(job.playerName)}:{})};}
""")
shutil.copyfile('backend-gameplay/native-farm.cjs','C:/Users/pc/Desktop/native-farm.js')
u.change('gf-native-crops.js',"{code:value.error}","{code:value.error,status:response.status}")
u.change('gf-native-crops.js',"  if(data.inventoryLoadedAt)scene._inventoryLoadedAt=data.inventoryLoadedAt;","  for(const tool of data.toolUses || [])for(const list of lists)for(const item of list)if(item&&Number(item.idx)===tool.invoiceId)item.usosRestantes=tool.usos;\n  if(data.inventoryLoadedAt)scene._inventoryLoadedAt=data.inventoryLoadedAt;")
u.change('gf-native-crops.js'," async function runUnqueued(scene,body){\n  const run=scene._sceneRunId,owner=String(scene.currentAccount || scene.playerName),key=owner+':'+keyOf(body);let ticket=references.get(key),data;"," async function runUnqueued(scene,body,run){\n  const owner=String(scene.currentAccount || scene.playerName).toLowerCase(),key=owner+':'+keyOf(body);let ticket=references.get(key),data,posting=false;")
u.change('gf-native-crops.js',"    data=await request(scene,'/api/farm/execute',{...body,ref:ticket.ref});","    posting=true;data=await request(scene,'/api/farm/execute',{...body,ref:ticket.ref});")
u.change('gf-native-crops.js',"  }catch(e){if(live(scene,run))notice(scene,e.message||'Farm confirmation is pending. Check it before retrying.');return null;}","  }catch(e){if(posting&&[400,403].includes(e.status))references.delete(key);if(live(scene,run))notice(scene,e.message||'Farm confirmation is pending. Check it before retrying.');return null;}")
u.change('gf-native-crops.js',"  const owner=String(scene.currentAccount || scene.playerName),previous=queues.get(owner)||Promise.resolve();","  const runId=scene._sceneRunId,owner=String(scene.currentAccount || scene.playerName).toLowerCase(),previous=queues.get(owner)||Promise.resolve();\n  body={...body,plotIds:[...body.plotIds]};")
u.change('gf-native-crops.js',".then(()=>runUnqueued(scene,body))",".then(()=>runUnqueued(scene,body,runId))")
u.change('gf-native-crops.js',"async function waterBatch(scene,plots,mode){const data=await run(scene,{action:'water',mode,plotIds:plots});if(!data)return 0;", "async function waterBatch(scene,plots,mode){const runId=scene._sceneRunId,data=await run(scene,{action:'water',mode,plotIds:plots});if(!data||!live(scene,runId))return 0;")
print('Deep links, canonical tool badges and queued-scene lifecycle guarded')
