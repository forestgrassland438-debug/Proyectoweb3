(function(root){
 'use strict';if(root.GFNativeCrops)return;
 const catalog=root.GFPlantCatalog,queues=new Map(),references=new Map(),counts=new Map(),clocks=new WeakMap();
 const keyOf=b=>JSON.stringify([b.action,b.seedType || '',b.mode || '',[...b.plotIds].sort()]);
 const notice=(s,text,type='warning')=>s.notifications?.show(text,type);
 function live(s,run){return s._sceneRunId===run&&!s._sceneStopped&&s.sys?.isActive?.()!==false;}
 async function request(scene,path,body){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180000);
  try{const response=await fetch(scene.serverBase+path,{method:body?'POST':'GET',credentials:'include',headers:{'Content-Type':'application/json','X-CSRF-Token':await root.getCsrfToken()},body:body?JSON.stringify(body):undefined,signal:controller.signal});
   const value=await response.json();if(!response.ok)throw Object.assign(Error(value.message||value.error||'Farm request failed'),{code:value.error,status:response.status});return value;
  }finally{clearTimeout(timer);}
 }
 function adopt(scene,data,run){
  if(!live(scene,run))return;
  const lists=[scene.STATE?.slots,scene.STATE?.quickSlots].filter(Array.isArray),source=new Map((data.sourceInvoices||[]).map(i=>[Number(i.id),i.remaining]));
  for(const list of lists)for(let i=0;i<list.length;i++){const item=list[i];if(item&&source.has(Number(item.idx))){const count=source.get(Number(item.idx));if(count>0)item.count=count;else list[i]=null;}}
  let missing=false;
  for(const reward of data.rewards || []){
   let found=false;for(const list of lists)for(const item of list)if(item&&Number(item.idx)===reward.invoiceId){item.count=reward.newTotal;found=true;}
   if(!found)for(const list of lists){const ghosts=list===scene.STATE.slots?scene.STATE.ghostSlots?.inv:scene.STATE.ghostSlots?.quick,index=list.findIndex((item,i)=>!item&&!ghosts?.[i]);if(index>=0){list[index]={id:reward.itemId,count:reward.newTotal,idx:reward.invoiceId,idm:reward.manualId};found=true;break;}}
   if(!found)missing=true;
  }
  for(const tool of data.toolUses || [])for(const list of lists)for(const item of list)if(item&&Number(item.idx)===tool.invoiceId)item.usosRestantes=tool.usos;
  if(data.inventoryLoadedAt)scene._inventoryLoadedAt=data.inventoryLoadedAt;
  if(data.stats){scene._adoptarVitalesDelServidor?.(data.stats);Object.assign(root.playerStats || {},data.stats);if(root.GFBronce)root.GFBronce.adoptarStats(data.stats);}
  if(data.progress){for(const [field,value]of Object.entries(data.progress))if(Number.isFinite(value))scene[field]=value;scene._nivelDesdeExp?.();}
  for(const crop of data.farm?.crops || [])scene.updatePlotVisual?.(crop.plotId,crop);
  if(data.ok&&data.farm?.action==='harvest')for(const plot of data.farm.plotIds)scene.resetPlot?.(plot);
  scene.rebuildPlayerInventoryFromState?.();scene.renderInventory?.();scene.renderQuickSlots?.();
  if(missing)notice(scene,'Your invoices are safe on-chain. Free some inventory space and synchronize your bag.');
 }
 async function runUnqueued(scene,body,run){
  const owner=String(scene.currentAccount || scene.playerName).toLowerCase(),key=owner+':'+keyOf(body);let ticket=references.get(key),data,posting=false;
  if(!live(scene,run))return null;
  try{
   const pending=await request(scene,'/api/craft/pending');
   if(ticket?.operationId)data=await request(scene,'/api/craft/reconcile',{operationId:ticket.operationId});
   else if(pending.rows?.length){
    if(!String(pending.rows[0].recipe).startsWith('farm_')){notice(scene,'Another item operation is pending. Reconcile it before farming.');return null;}
    data=await request(scene,'/api/craft/reconcile',{operationId:pending.rows[0]._id});
   }else{
    if(!ticket){if(references.size>=256)throw Error('Reconcile pending operations before starting more farm requests.');ticket={ref:crypto.randomUUID().replace(/-/g,'')};references.set(key,ticket);}
    posting=true;data=await request(scene,'/api/farm/execute',{...body,ref:ticket.ref});
   }
   adopt(scene,data,run);
   const farm=data.farm,same=farm&&farm.action===body.action&&JSON.stringify([...farm.plotIds].sort())===JSON.stringify([...body.plotIds].sort())&&(!body.seedType||farm.seedType===body.seedType)&&(!body.mode||farm.mode===body.mode);
   if(!same){notice(scene,'The previous farm operation was reconciled. Select your current plots again.');return null;}
   if(data.status==='cancelled'){references.delete(key);notice(scene,'The untouched operation was cancelled. Its reserved resources were returned.');return null;}
   if(!data.ok){references.set(key,{...ticket,operationId:data.operationId});notice(scene,'Farm operation saved. Check pending operations before trying again.');return null;}
   references.delete(key);return data;
  }catch(e){if(posting&&[400,403].includes(e.status))references.delete(key);if(live(scene,run))notice(scene,e.message||'Farm confirmation is pending. Check it before retrying.');return null;}
 }
 function run(scene,body){
  const runId=scene._sceneRunId,owner=String(scene.currentAccount || scene.playerName).toLowerCase(),previous=queues.get(owner)||Promise.resolve();
  body={...body,plotIds:[...body.plotIds]};
  if((counts.get(owner)||0)>=32){notice(scene,'The farm queue is full. Wait for the current operations.');return Promise.resolve(null);}counts.set(owner,(counts.get(owner)||0)+1);
  const job=previous.catch(()=>{}).then(()=>runUnqueued(scene,body,runId));queues.set(owner,job);
  return job.finally(()=>{const n=counts.get(owner)-1;if(n>0)counts.set(owner,n);else counts.delete(owner);if(queues.get(owner)===job)queues.delete(owner);});
 }
 async function plantBatch(scene,lote){
  const runId=scene._sceneRunId;
  try{const result=await run(scene,{action:'plant',seedType:lote.seedType,plotIds:lote.plotIds});if(result&&live(scene,runId))notice(scene,'Planting confirmed. Water your crops in time.','success');}
  finally{const index=scene._batchesEnVuelo?.indexOf(lote)??-1;if(index>=0)scene._batchesEnVuelo.splice(index,1);if(live(scene,runId)){scene._desbloquearCasillas(lote.slotsBloqueados);for(const id of lote.plotIds){scene.marcarCuadroPendiente(id,false);scene._plotsEnVuelo.delete(id);}}}
 }
 async function harvestBatch(scene,plots){
  const runId=scene._sceneRunId,groups=new Map();
  for(const plot of plots){const crop=scene.cropData.get(plot),key=crop.cropType+':'+(crop.isDead?'rotten':crop.isCompleted?'fresh':'unripe');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(plot);}
  try{for(const group of groups.values()){
   const data=await run(scene,{action:'harvest',plotIds:group});
   if(data&&live(scene,runId))notice(scene,'Harvest confirmed on-chain.','success');
  }}finally{if(live(scene,runId))for(const plot of plots){scene.marcarCuadroPendienteCorte(plot,false);scene._cutsEnVuelo.delete(plot);}}
 }
 async function waterBatch(scene,plots,mode){const runId=scene._sceneRunId,data=await run(scene,{action:'water',mode,plotIds:plots});if(!data||!live(scene,runId))return 0;scene._nativeWaterCount=(scene._nativeWaterCount||0)+plots.length;return plots.length;}
 function visual(crop){
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
 root.GFNativeCrops=Object.freeze({run,plantBatch,harvestBatch,waterBatch,visual,attach,isSeed:id=>!!catalog?.crops[id],isCrop:c=>!!c&&!!catalog?.crops[c.cropType],adopt});
})(window);
