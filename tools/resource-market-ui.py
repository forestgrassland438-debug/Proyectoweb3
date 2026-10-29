from pathlib import Path
import importlib.util
spec=importlib.util.spec_from_file_location('res_apply','tools/resource-economy-apply.py');u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u)
s=u.read('market.html')
s=u.once(s,'        <div class="toolbar">','''        <div class="market-quick-actions"><button id="market-open-sell" type="button">Vender inventario ↗</button><button id="market-open-mine" type="button">Mis publicaciones</button><button id="market-open-pending" type="button">Entregas pendientes <span id="market-pending-count">0</span></button></div>
        <section id="market-pending-panel" class="market-pending-panel" hidden><div class="market-section-head"><h2 id="market-pending-title">Entregas pendientes</h2><button id="market-reconcile" type="button">Comprobar entregas</button></div><p id="market-pending-note">El recibo del servidor conserva tu entrega aunque cierres la página.</p><div id="market-pending-rows"></div></section>
        <details id="market-resource-brief" class="market-resource-brief"><summary id="market-resource-title">Recursos del bosque · capacidad y reaparición</summary><div id="market-resource-rows"><p>Abre este apartado para consultar las tablas.</p></div></details>
        <div class="toolbar">''')
anchor='        <div class="chips-row" id="cat-chips"></div>'
s=u.once(s,anchor,'''        <div class="market-filter-row"><label><span id="market-currency-label">Moneda</span><select id="market-currency"><option value="">Todas</option><option value="oro">Oro</option><option value="plata">Plata</option></select></label><button id="market-clear-filters" type="button">Limpiar filtros</button><div class="market-view-toggle" role="group" aria-label="Vista de publicaciones"><button id="market-view-grid" type="button" aria-label="Cuadrícula" aria-pressed="true">▦</button><button id="market-view-list" type="button" aria-label="Lista" aria-pressed="false">☷</button></div></div>
'''+anchor)
s=u.once(s,'        <div id="market-grid" class="grid"></div>','''        <div class="market-results"><span id="market-result-count" role="status"></span><span id="market-price-note">Precio por unidad · oro y plata</span></div><div id="market-grid" class="grid"></div><div class="market-pagination"><button id="market-previous" type="button" disabled>← Anterior</button><span id="market-page">1</span><button id="market-next" type="button" disabled>Siguiente →</button></div>''')
s=u.once(s,"    csrfToken: null, catalog: {}, categories: [],", "    csrfToken: null, catalog: {}, categories: [], currency:'', page:1, hasMore:false, marketView:'grid', pendingDeliveries:[], buyRef:null,")
s=u.once(s,'  const state = {','  const marketRequests = new Set(), marketTimers = new Set();\n  let marketClosed = false;\n  const state = {')
s=u.once(s,'    const timeout = setTimeout(() => controller.abort(), 90000);','    if(marketClosed)return new Response(\'{"error":"market_closed"}\',{status:503});\n    marketRequests.add(controller);\n    const timeout = setTimeout(() => controller.abort(), 90000);')
s=u.once(s,'    } finally { clearTimeout(timeout); }','    } finally { clearTimeout(timeout); marketRequests.delete(controller); }')
s=u.once(s,'    if(state.sort) params.set(\'sort\', state.sort);',"    if(state.sort) params.set('sort', state.sort);\n    if(state.currency) params.set('currency', state.currency);\n    params.set('page',String(state.page));")
s=u.once(s,'    state.listings = data.listings || [];','    state.listings = data.listings || [];\n    state.hasMore = !!data.hasMore;')
s=u.once(s,"        state.activeCategory = cat.id;", "        state.activeCategory = cat.id; state.page = 1;")
s=u.once(s,"      state.search = e.target.value.trim();", "      state.search = e.target.value.trim(); state.page = 1;")
s=u.once(s,"    state.sort = e.target.value;", "    state.sort = e.target.value; state.page = 1;")
s=u.once(s,'    const grid = document.getElementById(\'market-grid\');\n    grid.innerHTML', "    const grid = document.getElementById('market-grid');\n    grid.classList.toggle('market-list-view',state.marketView==='list');\n    document.getElementById('market-result-count').textContent = state.listings.length + (LANG==='en' ? ' listings on this page' : ' publicaciones en esta página');\n    document.getElementById('market-page').textContent = (LANG==='en' ? 'Page ' : 'Página ') + state.page;\n    document.getElementById('market-previous').disabled = state.page <= 1; document.getElementById('market-next').disabled = !state.hasMore;\n    grid.innerHTML")
s=u.once(s,'      card.className = \'ticket\';',"      card.className = 'ticket' + (l.chainReady === false ? ' market-awaiting' : '');")
s=u.once(s,'<button class="stats-btn" type="button" title=', '<button class="stats-btn" type="button" title=') if False else s
old='>📈</button>${l.mine ?'
new='><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 3v17h17M7 14l4-4 4 3 5-7"/></svg></button>${l.mine ?'
s=u.once(s,old,new)
s=u.once(s,"      if(!l.mine){\n        card.querySelector('.buy-btn')", "      if(l.chainReady === false){ const pending=document.createElement('span'); pending.className='market-custody-note'; pending.textContent=LANG==='en'?'Custody awaiting confirmation':'Custodia pendiente de confirmar'; card.append(pending); for(const button of card.querySelectorAll('.buy-btn,.offer-link-btn'))button.disabled=true; }\n      if(!l.mine){\n        card.querySelector('.buy-btn')")
s=u.once(s,'    state.buyCtx = listing;', "    state.buyCtx = listing; state.buyRef = window.crypto?.randomUUID?.() || ('buy_'+Date.now().toString(36)+Math.random().toString(36).slice(2));")
s=u.once(s,"const job = { op, listingId: String(listingId || ''), itemId, qty: Number(qty) || 0 };", "const job = { op, listingId: String(listingId || ''), itemId, qty: Number(qty) || 0, receiptId:opciones?.receiptId || undefined };")
s=u.once(s,"const definitivos = ['listing_not_found'", "const definitivos = ['legacy_listing_requires_review','market_receipt_required','not_settlement_owner','listing_not_found'")
# Identical quantities in separate purchases have different server receipts.
s=s.replace('`${job.op}:${job.listingId}:${job.itemId}:${job.qty}`','`${job.receiptId || job.op}:${job.listingId}:${job.itemId}:${job.qty}`')
s=s.replace('`${j.op}:${j.listingId}:${j.itemId}:${j.qty}`','`${j.receiptId || j.op}:${j.listingId}:${j.itemId}:${j.qty}`')
s=u.once(s,'    const list = readPending();\n    if (!list.length) return;', '    const list = readPending().filter(j => j.op === \'escrow\' || j.receiptId);\n    await loadPendingDeliveries();\n    for(const row of state.pendingDeliveries) if(!list.some(j=>j.receiptId===row.receiptId))list.push({...row, silent:true});\n    if (!list.length) return;')
s=u.once(s,"    for (const job of list){\n      await settleOnchain(job.op, job.listingId, job.itemId, job.qty, { silent: true });", "    for (const job of list){\n      if(marketClosed)break;\n      await settleOnchain(job.op, job.listingId, job.itemId, job.qty, { silent: true, receiptId:job.receiptId });")
s=u.once(s,"const res = await api('/api/marketplace/buy/' + l.id, { method: 'POST', body: JSON.stringify({ qty }) });", "const res = await api('/api/marketplace/buy/' + l.id, { method: 'POST', body: JSON.stringify({ qty, ref:state.buyRef }) });")
s=u.once(s,"await settleOnchain('deliver', l.id, l.itemId, qty);", "await settleOnchain('deliver', l.id, l.itemId, qty, {receiptId:data.receiptId});\n      await loadAccount(); renderWallet(); renderSell(); await loadPendingDeliveries();")
s=u.once(s,"await settleOnchain('refund', id, publicacion.itemId, publicacion.qty);", "if(data.receiptId)await settleOnchain('refund', id, publicacion.itemId, publicacion.qty, {receiptId:data.receiptId});\n        else await api('/api/inventory/reconcile',{method:'POST',body:JSON.stringify({itemId:publicacion.itemId})});\n        await loadAccount(); await loadPendingDeliveries();")
s=u.once(s,"      if (nuevoId) await settleOnchain('escrow', nuevoId, item.itemId, qty);", "      if (nuevoId) await settleOnchain('escrow', nuevoId, item.itemId, qty);\n      await loadAccount(); await loadPendingDeliveries();")
s=u.once(s,"      insufficient_funds: LANG==='en'", "      market_escrow_pending: LANG==='en' ? 'Seller custody is not confirmed yet.' : 'El depósito del vendedor todavía no está confirmado.',\n      canonical_invoice_required: LANG==='en' ? 'Reconcile this item with the game inventory first.' : 'Primero sincroniza este objeto con el inventario del juego.',\n      legacy_listing_requires_review: LANG==='en' ? 'This older listing needs an administrator review.' : 'Esta publicación antigua necesita revisión del administrador.',\n      market_transfer_pending: LANG==='en' ? 'The server holds your delivery receipt. Check pending deliveries.' : 'El servidor conserva tu recibo. Consulta las entregas pendientes.',\n      insufficient_funds: LANG==='en'")
# New UI controls are scoped to the existing authenticated application.
i=s.index('  let refreshingMarket = false;')
extra='''  async function loadPendingDeliveries(){
    const response=await api('/api/marketplace/onchain/pending'); if(!response.ok || marketClosed)return;
    const data=await response.json(); state.pendingDeliveries=data.rows || [];
    document.getElementById('market-pending-count').textContent=state.pendingDeliveries.length;
    const host=document.getElementById('market-pending-rows');host.replaceChildren();
    if(!state.pendingDeliveries.length){const p=document.createElement('p');p.textContent=LANG==='en'?'No deliveries awaiting confirmation.':'No hay entregas pendientes de confirmar.';host.append(p);}
    for(const row of state.pendingDeliveries){
      const card=document.createElement('div');card.className='market-pending-row';
      const title=document.createElement('strong'),note=document.createElement('small'),button=document.createElement('button');
      title.textContent=itemName(row.itemId,row.itemId)+' × '+row.qty;note.textContent=row.status+' · '+(row.txHash || row.receiptId);
      button.type='button';button.textContent=LANG==='en'?'Check delivery':'Comprobar entrega';
      button.addEventListener('click',async()=>{button.disabled=true;try{await settleOnchain(row.op,row.listingId,row.itemId,row.qty,{receiptId:row.receiptId});await loadPendingDeliveries();await loadAccount();renderWallet();renderSell();}finally{button.disabled=false;}});
      card.append(title,note,button);host.append(card);
    }
  }
  document.getElementById('market-open-sell').addEventListener('click',()=>switchTab('sell'));
  document.getElementById('market-open-mine').addEventListener('click',()=>switchTab('mine'));
  document.getElementById('market-open-pending').addEventListener('click',()=>{const panel=document.getElementById('market-pending-panel');panel.hidden=!panel.hidden;if(!panel.hidden)loadPendingDeliveries().catch(()=>{});});
  document.getElementById('market-reconcile').addEventListener('click',async e=>{e.currentTarget.disabled=true;try{await retryPendingSettlements();await loadPendingDeliveries();await loadAccount();renderWallet();renderSell();}finally{e.currentTarget.disabled=false;}});
  document.getElementById('market-currency').addEventListener('change',async e=>{state.currency=e.target.value;state.page=1;await loadListings();renderMarket();});
  document.getElementById('market-clear-filters').addEventListener('click',async()=>{clearTimeout(searchTimer);state.currency='';state.search='';state.sort='';state.activeCategory='todos';state.page=1;document.getElementById('market-currency').value='';document.getElementById('search-input').value='';document.getElementById('sort-select').value='';renderCategoryChips();await loadListings();renderMarket();});
  for(const view of ['grid','list'])document.getElementById('market-view-'+view).addEventListener('click',()=>{state.marketView=view;for(const x of ['grid','list'])document.getElementById('market-view-'+x).setAttribute('aria-pressed',String(x===view));renderMarket();});
  let paging=false;
  for(const [id,delta] of [['market-previous',-1],['market-next',1]])document.getElementById(id).addEventListener('click',async()=>{if(paging)return;paging=true;const old=state.page;state.page=Math.max(1,state.page+delta);try{if(await loadListings()===false)state.page=old;renderMarket();}finally{paging=false;}});
  let resourceReadAt=0,resourceWork=null;
  document.getElementById('market-resource-brief').addEventListener('toggle',async e=>{
    if(!e.currentTarget.open || resourceWork || Date.now()-resourceReadAt<15000)return;
    resourceWork=(async()=>{try{
      const response=await api('/api/economia/recursos');if(!response.ok)throw new Error('resources');const data=await response.json();if(marketClosed)return;
      const host=document.getElementById('market-resource-rows');host.replaceChildren();
      for(const r of data.rows || []){const card=document.createElement('div'),name=document.createElement('strong'),details=document.createElement('small');name.textContent=itemName(r.itemId,r.itemId);details.textContent=r.available&&r.configured?(r.occupancy.toFixed(1)+'% · '+r.respawnSeconds+' s · '+(LANG==='en'?'free capacity ':'capacidad libre ')+r.remaining):(LANG==='en'?'Reading unavailable':'Lectura no disponible');card.append(name,details);host.append(card);}resourceReadAt=Date.now();
    }catch(_){document.getElementById('market-resource-rows').textContent=LANG==='en'?'Resource capacity could not be verified.':'No se pudo verificar la capacidad de los recursos.';}})().finally(()=>{resourceWork=null;});await resourceWork;
  });

'''
s=s[:i]+extra+s[i:]
# New labels remain bilingual without replacing the hand-built dictionary.
i=s.index('    document.documentElement.lang = LANG;')
labels={
'market-open-sell':['Sell inventory ↗','Vender inventario ↗'],'market-open-mine':['My listings','Mis publicaciones'],
'market-pending-title':['Pending deliveries','Entregas pendientes'],'market-reconcile':['Check deliveries','Comprobar entregas'],
'market-pending-note':['The server retains your delivery receipt even if you close this page.','El servidor conserva tu recibo de entrega aunque cierres la página.'],
'market-resource-title':['Forest resources · capacity and respawn','Recursos del bosque · capacidad y reaparición'],
'market-currency-label':['Currency','Moneda'],'market-clear-filters':['Clear filters','Limpiar filtros'],
'market-price-note':['Per-unit price · Gold and Silver','Precio por unidad · oro y plata'],
'market-previous':['← Previous','← Anterior'],'market-next':['Next →','Siguiente →']}
js=''
for id,(en,es) in labels.items():js+=f'    document.getElementById({id!r}).textContent = english ? {en!r} : {es!r};\n'
js+="    document.getElementById('market-open-pending').firstChild.textContent = english ? 'Pending deliveries ' : 'Entregas pendientes ';\n"
js+="    const currencyOptions=document.getElementById('market-currency').options;currencyOptions[0].textContent=english?'All':'Todas';currencyOptions[1].textContent=english?'Gold':'Oro';currencyOptions[2].textContent=english?'Silver':'Plata';\n"
s=s[:i]+js+s[i:]
# Page lifecycle: abort all owned fetches instead of retaining a closed market.
s=u.once(s,"  window.addEventListener('pagehide', () => { clearTimeout(searchTimer); if (window.GFPrecioPanel) GFPrecioPanel.cerrar(); });", "  window.addEventListener('pagehide', e => { clearTimeout(searchTimer); if (window.GFPrecioPanel) GFPrecioPanel.cerrar(); if(e.persisted)return; marketClosed=true;marketRequests.forEach(c=>c.abort());marketRequests.clear();marketTimers.forEach(clearTimeout);marketTimers.clear(); });")
u.save('market.html',s)
# Paginate read-only browsing and compare gold/silver prices in the same unit.
for p in [Path('marketplace-routes.js'),Path('C:/Users/pc/Desktop/marketplace-routes.js')]:
 m=u.read(p)
 old='      const listings = await Listing.find(filter).sort(sortOpt).limit(300).exec();'
 new='''      const page=Math.min(10000,Math.max(1,parseInt(req.query.page,10)||1)), pageSize=48;
      let listings;
      if(sort==='price_asc' || sort==='price_desc'){
        listings=await RawListing.aggregate([{$match:filter},{$addFields:{_sortPrice:{$multiply:['$pricePerUnit',{$cond:[{$eq:['$currency','oro']},1000,1]}]}}},
          {$sort:{_sortPrice:sort==='price_asc'?1:-1,_id:1}},{$skip:(page-1)*pageSize},{$limit:pageSize+1}]).option({maxTimeMS:5000});
      }else listings=await Listing.find(filter).sort({...sortOpt,_id:-1}).skip((page-1)*pageSize).limit(pageSize+1).maxTimeMS(5000).exec();
      const hasMore=listings.length>pageSize;if(hasMore)listings.pop();'''
 m=u.once(m,old,new)
 m=u.once(m,'return res.json({listings:ctx.assetTransfer ? await ctx.assetTransfer.describe(serialized) : serialized});','return res.json({page,hasMore,listings:ctx.assetTransfer ? await ctx.assetTransfer.describe(serialized) : serialized});') if m.count('return res.json({listings:ctx.assetTransfer ? await ctx.assetTransfer.describe(serialized) : serialized});')==1 else m.replace('return res.json({listings:ctx.assetTransfer ? await ctx.assetTransfer.describe(serialized) : serialized});','return res.json({page,hasMore,listings:ctx.assetTransfer ? await ctx.assetTransfer.describe(serialized) : serialized});',1)
 u.save(p,m)
print('Market UI, currencies, view switching, bounded pages and durable delivery receipts connected.')
