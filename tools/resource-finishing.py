from pathlib import Path
import importlib.util
spec=importlib.util.spec_from_file_location('res_apply','tools/resource-economy-apply.py')
u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u)
def change(path,old,new):
 s=u.read(path)
 assert s.count(old)==1,(str(path),s.count(old),old[:80])
 u.save(path,s.replace(old,new))
change(u.SERVER,'const res$ = await ErrorReport.findOneAndUpdate(', 'const res$ = await reporterUpsert(')
change(u.SERVER,'reporterFingerprint(this.contractName, this.functionName, this.error)', 'reporterFingerprint(this.error)')
change(u.SERVER,'} finally { await session.endSession(); }','} finally { try { await session.endSession(); } catch (e) { console.warn("economia session cleanup:", e.code || e.message); } }')
s=u.read(u.SERVER)
a=s.index('// =============================================================================',s.index('const ITEM_TIPO_MAP')) if False else s.index('const ITEM_TIPO_CACHE_TTL_MS')
b=s.index('let _tiposItemPermitidos',a)
s=s[:a]+s[b:]
s=s.replace(' * No lanza nunca: si algo falla, se registra y la transacción sigue su camino\n * (fallará como fallaba antes, pero no por culpa de esta comprobación).',' * Rechaza capacidad insuficiente o lecturas fallidas. No amplía ningún límite.')
u.save(u.SERVER,s)
change('recursos.js',"const provider=new window.ethers.BrowserProvider(wallet),signer=await provider.getSigner(who.address),contract=new window.ethers.Contract(snapshot.contract,['function setLimit(string,uint256,uint256)'],signer);\n          try{", "const provider=new window.ethers.BrowserProvider(wallet);\n          try{\n            const signer=await provider.getSigner(who.address),contract=new window.ethers.Contract(snapshot.contract,['function setLimit(string,uint256,uint256)'],signer);")
change('recursos.js',"await op.request('/api/admin/recursos/limites/confirmar',{method:'POST',body:JSON.stringify({txHash:tx.hash})});await load();", "try { await op.request('/api/admin/recursos/limites/confirmar',{method:'POST',body:JSON.stringify({txHash:tx.hash})}); } catch (_) { throw new Error('El envío ya se confirmó: '+tx.hash+'. Actualiza las lecturas; no vuelvas a firmar el mismo cambio.'); } await load();")
change('recursos.js',"snapshot = data; version = data.version; render(data);", "snapshot = data; version = data.version; render(data);\n    $('resource-migration').textContent = data.migrationSealed === true ? 'Migración sellada en el contrato.' : data.migrationSealed === false ? 'Migración ABIERTA: el propietario puede importar facturas por encima de los límites. Revisa la guía antes de dar por cerrado el control de emisión.' : 'No se pudo verificar si la migración está sellada. No se supone que los límites cubran importaciones administrativas.';\n    await loadDeliveries(false);")
change('recursos.html','<h2>Tablas de recursos del contrato</h2>','<h2>Tablas de recursos del contrato</h2><p id="resource-migration" class="op-notice"></p>')
change('recursos.html','</section></section></main>','</section><section class="op-card"><h2>Entregas P2P por conciliar</h2><p>Los recibos prueban quién debe recibir cada objeto. Revisar un hash continúa el mismo envío; no crea una nueva compra. Las operaciones sin hash verificable requieren revisión manual.</p><div id="resource-deliveries" data-no-translate></div><button id="resource-deliveries-next" type="button" hidden>Siguiente página</button><button id="resource-deliveries-first" type="button">Volver a la primera página</button><h3>Publicaciones anteriores</h3><p>Esta muestra de hasta 20 publicaciones no tiene prueba de custodia del nuevo protocolo. Se conserva para revisar cadena, cobros y propietarios; no se acuña ni reembolsa automáticamente.</p><div id="resource-legacy" data-no-translate></div></section></section></main>')
change('recursos.js','  window.startOperations(load);', '''  let deliveryCursor = null;
  op.onReset(()=>{deliveryCursor=null;$('resource-deliveries').replaceChildren();$('resource-legacy').replaceChildren();});
  async function loadDeliveries(next) {
    const data=await op.request('/api/admin/recursos/entregas'+(next && deliveryCursor?'?after='+encodeURIComponent(deliveryCursor):''));
    if(!op.active)return;
    deliveryCursor=data.next;const host=$('resource-deliveries');host.replaceChildren();
    for(const row of data.rows){
      const box=el('div',null,'op-receipt'),info=el('p',row.op+' · '+row.itemId+' × '+row.qty+' · '+row.status),button=el('button','Revisar mismo envío'),copy=el('button','Copiar recibo');
      box.append(info,el('small',row.wallet),el('small',row.txHash || 'Sin hash verificable'),el('small',row.error || ''),copy,button);
      copy.onclick=()=>op.copy(JSON.stringify(row,null,2));button.disabled=!row.txHash && row.status!=='pending';
      button.onclick=()=>op.run(async()=>{const result=await op.request('/api/admin/recursos/entregas/revisar',{method:'POST',body:JSON.stringify({receiptId:row._id})});await loadDeliveries(false);op.notice('Resultado: '+result.status);},button);host.append(box);
    }
    if(!data.rows.length)host.append(el('p','Sin entregas pendientes en esta página.'));
    $('resource-deliveries-next').hidden=!data.hasMore;
    const legacy=$('resource-legacy');legacy.replaceChildren();
    for(const row of data.legacy)legacy.append(el('p',String(row._id)+' · '+row.itemId+' × '+row.qty+' · '+row.owner));
    if(!data.legacy.length)legacy.append(el('p','Sin publicaciones anteriores en esta muestra.'));
  }
  $('resource-deliveries-next').onclick=()=>op.run(()=>loadDeliveries(true));
  $('resource-deliveries-first').onclick=()=>op.run(()=>loadDeliveries(false));
  window.startOperations(load);''')
change('market.html',"    setTimeout(() => { el.style.opacity = '0'; el.style.transition='opacity .25s'; setTimeout(()=>el.remove(), 260); }, 2600);", "    scheduleMarket(() => { el.style.opacity = '0'; el.style.transition='opacity .25s'; scheduleMarket(()=>el.remove(),260); },2600);")
change('market.html','  function toast(msg, isError){',"  function scheduleMarket(work,ms){ const id=setTimeout(()=>{marketTimers.delete(id);if(!marketClosed)work();},ms);marketTimers.add(id);return id; }\n  function toast(msg, isError){")
change('market.html',"      row.querySelector('.cancel-btn').addEventListener('click', () => cancelListing(l.id, row));", """      row.querySelector('.cancel-btn').addEventListener('click', () => cancelListing(l.id, row));
      if(l.chainReady === false){
        const note=document.createElement('small');note.textContent=LANG==='es'?'Custodia: '+l.chainStatus:'Custody: '+l.chainStatus;row.querySelector('.mylist-info').append(note);
        if(['awaiting_escrow','processing'].includes(l.chainStatus)){
          const resume=document.createElement('button');resume.className='cancel-btn';resume.textContent=LANG==='es'?'Completar depósito':'Complete deposit';
          resume.onclick=async()=>{resume.disabled=true;try{await settleOnchain('escrow',l.id,l.itemId,l.qty);await loadMyListings();await loadAccount();renderMine();}finally{resume.disabled=false;}};row.append(resume);
        }
      }""")
change('reporter.js',"  window.addEventListener('pagehide', function (e) {", """  var unsubscribeSession = window.GFAdminSession?.subscribe(function(){
    revisionErrores++;revisionRelay++;revisionCarga++;estado.admin=null;
    $('rowsErrors').replaceChildren();$('rowsRelay').replaceChildren();
    $('panel').classList.add('hidden');$('gate').classList.remove('hidden');
  });
  window.addEventListener('pagehide', function (e) {""")
change('reporter.js','    cerrado = true; clearTimeout(toastTimer);','    cerrado = true; clearTimeout(toastTimer); if(unsubscribeSession)unsubscribeSession();')
change('reporter.html','Search message, scene or file…','Buscar mensaje, escena o cartera completa…')
print('Finished targeted safeguards and review controls.')
