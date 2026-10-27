(function (root) {
  'use strict';
  const escapeHTML = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const lower = value => String(value || '').toLowerCase();
  const addressValid = value => /^0x[0-9a-f]{40}$/i.test(String(value || '')) && !/^0x0{40}$/i.test(value);
  function percentToBps(value) {
    const s = String(value).trim();
    if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(s)) throw new Error('Usa un porcentaje entre 0 y 100, con hasta dos decimales.');
    const [whole, decimal = ''] = s.split('.');
    const result = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
    if (result > 10000) throw new Error('El royalty no puede superar el 100 %.');
    return result;
  }
  function parseAttributes(value) {
    const list = typeof value === 'string' ? JSON.parse(value || '[]') : value;
    if (!Array.isArray(list) || list.length > 200) throw new Error('Usa una lista con un máximo de 200 atributos por pieza.');
    return list.map(a => {
      if (!a || typeof a !== 'object' || Object.keys(a).some(k=>!['trait_type','value'].includes(k)) || typeof a.trait_type !== 'string' || !a.trait_type.trim() || a.trait_type.length > 100 || !['string','number'].includes(typeof a.value) || !String(a.value).trim() || String(a.value).length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(a.trait_type+String(a.value)) || (typeof a.value === 'number' && !Number.isFinite(a.value))) throw new Error('Cada atributo necesita un nombre de hasta 100 caracteres y un valor de texto o número de hasta 500 caracteres.');
      return {trait_type:a.trait_type.trim(), value:a.value};
    });
  }
  function parseSendRows(text) {
    const rows = String(text).replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(s => s.trim());
    if (rows[0] && /^(id_catalogo|tokenId)\s*[,;\t]/i.test(rows[0])) rows.shift();
    if (!rows.length || rows.length > 200) throw new Error('Importa entre 1 y 200 filas.');
    const seen = new Set();
    return rows.map((line,i) => {
      const parts = line.split(/[,;\t]/).map(v => v.trim().replace(/^"(.*)"$/, '$1'));
      if (parts.length !== 2 || !parts[0] || !addressValid(parts[1])) throw new Error('Fila ' + (i+1) + ': indica el ID de catálogo y una dirección válida.');
      if (seen.has(parts[0])) throw new Error('La pieza ' + parts[0] + ' está repetida.');
      seen.add(parts[0]);
      return {tokenId:parts[0], to:lower(parts[1]), status:'ready'};
    });
  }
  function csvCell(value) {
    let s = String(value == null ? '' : value);
    if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function timestamp(value) {
    if (typeof value === 'number') return value < 100000000000 ? value * 1000 : value;
    if (/^\d+$/.test(String(value || ''))) return timestamp(Number(value));
    return new Date(value || 0).getTime();
  }
  function accountSummary(tokens, history) {
    const map = new Map();
    function account(a) { if (!addressValid(a)) return null; const key=lower(a); if(!map.has(key)) map.set(key,{address:key,held:0,received:0,sent:0,linked:new Set()}); return map.get(key); }
    tokens.forEach(t => { if(t.invoiceId && t.chainActive !== false) {const a=account(t.owner); if(a) a.held++;} });
    history.forEach(h => {const from=account(h.from),to=account(h.to); if(from) from.sent++; if(to) to.received++; if(from && to && from.address !== to.address){from.linked.add(to.address);to.linked.add(from.address);} });
    return [...map.values()].sort((a,b) => b.held-a.held || b.linked.size-a.linked.size);
  }
  const utils = {escapeHTML,addressValid,percentToBps,parseAttributes,parseSendRows,csvCell,timestamp,accountSummary};
  if (typeof module === 'object' && module.exports) module.exports = utils;
  if (!root || !root.document) return;
  root.CollectionsUtils = Object.freeze(utils);

  const $ = id => document.getElementById(id), esc = escapeHTML;
  const BASE = '/api/admin/collections';
  const STATUS = {active:'Activo',suspended:'Suspendido',blocked:'Bloqueado',deleted:'Papelera',draft:'Borrador'};
  const VIEWS = {overview:'Vista general',collections:'Colecciones',tokens:'Biblioteca NFT',owners:'Propietarios',send:'Sendmulticuentas',activity:'Movimientos',accounts:'Cuentas vinculadas',royalties:'Royalties',operations:'Operaciones',settings:'Contrato y permisos'};
  const EMPTY = () => ({collections:[],tokens:[],history:[],royaltyPayments:[],operations:[]});
  let state = {data:EMPTY(),account:'',wallet:null,csrf:'',generation:0,verified:false,view:'overview',selection:new Set(),queue:[],running:false,stop:false,editing:null,uploads:[],busy:false,paging:{},more:{}};
  let controller = new AbortController(), reviewResolve = null, renewalWork=null, authVersion=0;
  function storedGet(key) {try{return localStorage.getItem(key);}catch(_){return null;}}
  function storedSet(key,value) {try{localStorage.setItem(key,value);}catch(_){/* Storage may be disabled. Server operations remain recoverable. */}}
  const defaultOrigin = ['localhost','127.0.0.1',''].includes(location.hostname) ? 'http://127.0.0.1:8080' : 'https://api.grasslandforest.com';
  let apiOrigin = storedGet('gf-collections-api') || defaultOrigin;
  try {apiOrigin=normalizeOrigin(apiOrigin);} catch(_){apiOrigin=defaultOrigin;}
  $('api-origin').value = apiOrigin;
  function normalizeOrigin(value) {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) throw new Error('Indica solo el origen HTTPS de tu API; para pruebas se permite HTTP en localhost.');
    return url.origin;
  }
  function notify(message,error=false) {const el=document.createElement('div');el.className='toast'+(error?' error':'');el.textContent=message;$('toasts').append(el);setTimeout(()=>el.remove(),error?12000:6500);}
  function errorMessage(error) {return error && (error.shortMessage || error.reason || error.message) || 'No se pudo completar la operación.';}
  function showError(error) {if(error && (error.name === 'AbortError' || error.code === 'STALE_SESSION')) return;notify(errorMessage(error),true);}
  function short(value) {const s=String(value||'');return s.length>17?s.slice(0,7)+'…'+s.slice(-5):s||'—';}
  function date(value) {const t=timestamp(value);return t?new Date(t).toLocaleString('es-EC',{dateStyle:'short',timeStyle:'short'}):'—';}
  function idOf(item) {return String(item && (item.id || item._id) || '');}
  function collection(id) {return state.data.collections.find(c=>idOf(c)===String(id));}
  function token(id) {return state.data.tokens.find(t=>idOf(t)===String(id));}
  function pieceName(t) {return (t && t.name) || ('Pieza #'+(t && t.number || '?'));}
  function colName(id) {const c=collection(id);return c?c.name:'Colección';}
  function canManage(c) {return !!c&&(!c.delegate||state.data.isSystemOwner||lower(c.delegate)===state.account);}
  function effectiveStatus(t) {const c=collection(t.collectionId);return c && c.status && c.status!=='active'?c.status:(t.status||'active');}
  function badge(status) {return '<span class="badge '+esc(status)+'">'+esc(STATUS[status]||status)+'</span>';}
  function royalty(t) {const c=collection(t.collectionId)||{};return {bps:t.royaltyBps==null?Number(c.royaltyBps||0):Number(t.royaltyBps),receiver:t.royaltyReceiver||c.royaltyReceiver};}
  function imageURL(t) {if(!t || !t.imageUrl) return '';try{const url=new URL(t.imageUrl,apiOrigin);if(url.origin!==apiOrigin || !/^\/api\/collections\/images\/[a-z0-9-]+$/i.test(url.pathname)) return '';return url.href;}catch(_){return '';}}
  // (2026-10-26) El perfil y la portada de una colección: misma regla que las piezas.
  function collectionImageURL(c,kind) {return imageURL({imageUrl:c&&(kind==='cover'?c.coverUrl:c.avatarUrl)});}
  function isPublic(c) {return !!c&&c.visibility==='public';}
  // Lo que el servidor anuncia que sabe hacer (un server2.js viejo no tiene esto).
  function can(feature) {return !!(state.data.capabilities&&state.data.capabilities[feature]);}
  function explorer(hash) {const candidate=state.data.explorerUrl || 'https://liteforge.explorer.caldera.xyz';try{const u=new URL(candidate);if(u.protocol!=='https:')return '';return u.origin+'/tx/'+encodeURIComponent(hash);}catch(_){return '';}}
  function hashLink(hash) {if(!/^0x[0-9a-f]{64}$/i.test(hash||''))return '—';const link=explorer(hash);return link?'<a class="mono" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer" title="'+esc(hash)+'">'+esc(short(hash))+' ↗</a>':esc(hash);}
  function empty(title,text,action='') {return '<div class="empty"><div class="empty-symbol">◇</div><h3>'+esc(title)+'</h3><p>'+esc(text)+'</p>'+action+'</div>';}
  function assertSession(epoch) {if(epoch!==state.generation || !state.verified) throw Object.assign(new Error('La sesión cambió. Reconecta la cartera.'),{code:'STALE_SESSION'});}
  async function request(path,options={},allowGate=false) {
    const epoch=state.generation,version=authVersion;
    const method=options.method||'GET';
    let csrfRetried=false, refreshed=false;
    for(;;){
      const response=await fetch(apiOrigin+path,{...options,method,credentials:'include',mode:'cors',signal:controller.signal,headers:{'Accept':'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(state.csrf?{'X-CSRF-Token':state.csrf}:{}),...options.headers}});
      let data;try{data=await response.json();}catch(_){throw new Error('La API no devolvió JSON. Comprueba que server2.js esté actualizado.');}
      if(epoch!==state.generation)throw Object.assign(new Error('La sesión cambió.'),{code:'STALE_SESSION'});
      if(response.ok)return data;
      if(response.status===403 && /csrf/i.test(data.error||'') && !csrfRetried){csrfRetried=true;await csrf();continue;}
      if(response.status===401 && path.startsWith(BASE) && state.verified && !refreshed){refreshed=true;try{if(authVersion===version)await renewSession();if(epoch!==state.generation)throw Object.assign(new Error('La sesión cambió.'),{code:'STALE_SESSION'});continue;}catch(error){if(epoch===state.generation&&[401,403].includes(error.status))lock('La sesión expiró. Conecta de nuevo.');throw error;}}
      if(!allowGate && (response.status===401 || (response.status===403&&['not_admin','onchain_admin_required','wallet_session_required','admin_auth_required'].includes(data.error)))) lock(data.message || 'Esta cuenta no tiene acceso al panel.');
      throw Object.assign(new Error(data.message||data.error||('Error HTTP '+response.status)),{status:response.status,body:data});
    }
  }
  async function renewSession() {if(renewalWork)return renewalWork;const epoch=state.generation;const work=(async()=>{if(root.GFAdminSession?.shared&&root.GFAdminSession.base===apiOrigin)await root.GFAdminSession.refresh();else await request('/api/auth/refresh',{method:'POST',body:'{}'},true);await csrf();assertSession(epoch);authVersion++;})();renewalWork=work;try{return await work;}finally{if(renewalWork===work)renewalWork=null;}}
  async function csrf() {const result=await request('/api/auth/csrf-token',{},true);state.csrf=result.csrfToken||'';if(!state.csrf)throw new Error('El backend no devolvió el token CSRF.');}
  function lock(message='Conecta tu cartera administradora para continuar.') {
    state.generation++;controller.abort();controller=new AbortController();renewalWork=null;authVersion++;state.stop=true;state.verified=false;state.busy=false;state.running=false;state.account='';state.data=EMPTY();state.selection.clear();state.queue=[];state.uploads=[];state.editing=null;state.csrf='';state.paging={};state.more={};state.owners={};
    if($('editor').open)$('editor').close();if($('review').open)$('review').close();if(reviewResolve){reviewResolve(false);reviewResolve=null;}
    document.querySelectorAll('#app .collection-grid,#token-list,#metrics,#history-list,#account-list,#account-metrics,#royalty-metrics,#royalty-rules,#royalty-payments,#operation-list,#contract-details,#recent-activity,#movement-chart,#royalty-chart,#send-rows,#owners-list,#owners-summary').forEach(el=>el.replaceChildren());
    ['editor-body','review-body','editor-error','sync-result','wallet','network','catalog-pagination'].forEach(id=>$(id).replaceChildren());
    document.querySelectorAll('#app input,#app textarea').forEach(el=>{if(el.type==='checkbox')el.checked=false;else el.value='';});
    ['token-collection'].forEach(id=>$(id).replaceChildren());$('toasts').replaceChildren();$('app').hidden=true;$('gate').hidden=false;$('gate-message').textContent=message;$('connect').disabled=false;
  }
  function getWallet() {if(root.ethereum && root.ethereum.providers)return root.ethereum.providers.find(p=>p.isMetaMask)||root.ethereum.providers[0];return root.ethereum||null;}
  const walletEvents = {
    accountsChanged:()=>lock('Cambió la cuenta conectada. Verifica el acceso de nuevo.'),
    chainChanged:()=>lock('Cambió la red de la cartera. Verifica el acceso de nuevo.'),
    disconnect:()=>lock('La cartera se desconectó.')
  };
  function unwatchWallet() {if(state.wallet?.removeListener)for(const [event,handler]of Object.entries(walletEvents))state.wallet.removeListener(event,handler);}
  function watchWallet(wallet) {if(state.wallet===wallet)return;unwatchWallet();state.wallet=wallet;if(wallet?.on)for(const [event,handler]of Object.entries(walletEvents))wallet.on(event,handler);}
  async function loadData() {
    const result=await request(BASE+'/bootstrap');
    if(lower(result.address)!==lower(state.account)) {lock('La sesión del backend corresponde a otra cartera. Conecta la administradora.');throw new Error('La sesión y la cartera no coinciden.');}
    for(const key of ['collections','tokens','history','operations','royaltyPayments'])if(!Array.isArray(result[key]))result[key]=[];
    state.data=result;state.paging={};state.more={};
    state.selection=new Set([...state.selection].filter(id=>token(id)));
    render();
  }
  async function connect(silent=false) {
    if(state.busy)return;state.busy=true;$('connect').disabled=true;
    const epoch=state.generation;
    try {
      const wallet=getWallet();if(!wallet)throw new Error('Abre esta página con una cartera EVM instalada, como MetaMask.');watchWallet(wallet);
      const accounts=await wallet.request({method:silent?'eth_accounts':'eth_requestAccounts'});if(!accounts.length){if(silent)return;throw new Error('No elegiste una cuenta.');}
      const account=lower(accounts[0]);
      let snapshot=null;
      try {snapshot=await request(BASE+'/bootstrap',{},true);if(lower(snapshot.address)!==account)snapshot=null;}catch(error){if(![401,403].includes(error.status))throw error;}
      if(!snapshot){
        if(silent)return;
        $('gate-message').textContent='Verifica y firma el mensaje de acceso en tu cartera…';
        await csrf();const nonce=await request('/api/auth/nonce?address='+encodeURIComponent(account),{},true);
        if(typeof nonce.nonce!=='string' || !nonce.nonce)throw new Error('Nonce inválido.');
        const authToken=nonce.nonce+':'+Math.floor(Date.now()/1000),message='Signing in to Grassland Forest: '+btoa(authToken);
        const signature=await wallet.request({method:'personal_sign',params:[message,account]});
        if(epoch!==state.generation)return;
        const current=await wallet.request({method:'eth_accounts'});if(lower(current[0])!==account)throw new Error('La cuenta cambió durante la firma.');
        await request('/api/auth/login',{method:'POST',body:JSON.stringify({address:account,signature,token:authToken,message})},true);
        await csrf();snapshot=await request(BASE+'/bootstrap',{},true);
      } else await csrf();
      if(epoch!==state.generation)return;
      if(lower(snapshot.address)!==account)throw new Error('La sesión no corresponde a tu cartera.');
      state.account=account;state.verified=true;state.data={...EMPTY(),...snapshot};loadQueue();$('gate').hidden=true;$('app').hidden=false;render();
      if(!silent)notify('Cartera verificada. Bienvenido al estudio.');
    }catch(error){if(epoch===state.generation){$('gate-message').textContent=errorMessage(error);if(!silent)showError(error);}}
    finally{if(epoch===state.generation){state.busy=false;$('connect').disabled=false;}}
  }
  function queueKey() {return 'gf-collections-queue:'+state.data.chainId+':'+lower(state.data.contractAddress)+':'+state.account;}
  function saveQueue() {if(state.verified)storedSet(queueKey(),JSON.stringify(state.queue.map(({tokenId,to,status,txHash,operationId,error})=>({tokenId,to,status,txHash,operationId,error}))));}
  function loadQueue() {try{const rows=JSON.parse(storedGet(queueKey())||'[]');state.queue=Array.isArray(rows)?rows.slice(0,200).filter(r=>r&&typeof r.tokenId==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(r.tokenId)).map(r=>({...r,status:r.status==='sending'?'ready':r.status})):[];}catch(_){state.queue=[];}}
  function changeView(view) {if(!VIEWS[view])return;state.view=view;document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!=='view-'+view);document.querySelectorAll('[data-view]').forEach(el=>{el.classList.toggle('active',el.dataset.view===view);el.setAttribute('aria-current',el.dataset.view===view?'page':'false');});$('current-view').textContent=VIEWS[view];renderView(view);}
  function metric(label,value,caption,icon) {return '<article class="metric"><div class="metric-label">'+esc(label)+'<span class="metric-icon">'+esc(icon)+'</span></div><div class="metric-value">'+esc(value)+'</div><div class="metric-caption">'+esc(caption)+'</div></article>';}
  function render() {
    const d=state.data;$('wallet').textContent=short(state.account);$('wallet').title=state.account;$('network').textContent='● CHAIN '+d.chainId;$('sidebar-role').textContent=d.isSystemOwner?'Owner del sistema':'Administrador del contrato';$('nav-count').textContent=d.collections.length;
    const scan=d.scan||{};$('last-sync').textContent=(scan.lastBlock??scan.cursor)!=null?'Último bloque observado: '+(scan.lastBlock??scan.cursor):'Datos cargados: '+new Date().toLocaleTimeString('es-EC');
    const partial=d.totals?Object.keys(d.totals).some(k=>Array.isArray(d[k])&&d[k].length<d.totals[k]):d.truncated;
    const warning=partial || d.limits?.truncated || scan.error || scan.truncated || scan.historicalIncomplete;
    $('global-warning').hidden=!warning;$('global-warning').textContent=warning?'La consulta contiene datos parciales o una sincronización pendiente. Revisa Contrato y permisos y los límites del catálogo antes de exportar o interpretar totales.':'';
    const labels={collections:'colecciones',tokens:'piezas',history:'movimientos',royaltyPayments:'cobros'};
    $('catalog-pagination').innerHTML=Object.keys(labels).filter(k=>Number(d.totals?.[k])>d[k].length&&state.more[k]!==false).map(k=>'<button class="button" data-more-catalog="'+k+'">Cargar más '+labels[k]+' ('+d[k].length+'/'+Number(d.totals[k])+')</button>').join('');$('catalog-pagination').hidden=!$('catalog-pagination').children.length;
    const previous=$('token-collection').value;$('token-collection').innerHTML='<option value="all">Todas las colecciones</option>'+d.collections.map(c=>'<option value="'+esc(idOf(c))+'">'+esc(c.name)+'</option>').join('');if(d.collections.some(c=>idOf(c)===previous))$('token-collection').value=previous;
    // (2026-10-26) Con un server2.js viejo, sin lo que todavía no sabe hacer.
    $('bulk-images').hidden=!can('bulkImages');
    renderView(state.view);renderOperations();
  }
  function collectionCard(c) {
    const tokens=state.data.tokens.filter(t=>t.collectionId===idOf(c)),held=tokens.filter(t=>t.invoiceId&&t.chainActive!==false),owners=new Set(held.map(t=>lower(t.owner)).filter(Boolean)),art=tokens.find(t=>imageURL(t));
    // (2026-10-26) La portada manda sobre la primera pieza; el perfil va en un círculo encima.
    const cover=collectionImageURL(c,'cover'),avatar=collectionImageURL(c,'avatar'),pub=isPublic(c);
    return '<article class="collection-card"><div class="collection-art">'+(cover?'<img loading="lazy" src="'+esc(cover)+'" alt="'+esc(c.name)+'">':art?'<img loading="lazy" src="'+esc(imageURL(art))+'" alt="'+esc(c.name)+'">':'<span class="collection-monogram" aria-hidden="true">'+esc((c.symbol||c.name||'GF').slice(0,2).toUpperCase())+'</span>')+(avatar?'<img class="collection-avatar" loading="lazy" src="'+esc(avatar)+'" alt="">':'')+badge(c.status||'active')+'<span class="badge visibility '+(pub?'public':'private')+'">'+(pub?'Pública':'Privada')+'</span></div><div class="collection-info"><h3>'+esc(c.name)+'</h3><p>'+esc(c.description||'Tu próxima historia empieza aquí.')+'</p><div class="card-stats"><span><b>'+tokens.length+'</b>PIEZAS</span><span><b>'+owners.size+'</b>TENEDORES</span><span><b>'+Number(c.royaltyBps||0)/100+'%</b>ROYALTY</span></div><div class="card-actions"><button class="button" data-open-collection="'+esc(idOf(c))+'">Abrir biblioteca ↗</button><button class="text-button" data-edit-collection="'+esc(idOf(c))+'">Configurar</button>'+(canManage(c)&&can('visibility')?'<button class="text-button" data-toggle-visibility="'+esc(idOf(c))+'">'+(pub?'Hacer privada':'Hacer pública')+'</button>':'')+(can('owners')?'<button class="text-button" data-owners-collection="'+esc(idOf(c))+'">Propietarios</button>':'')+'</div></div></article>';
  }
  function renderOverview() {
    const d=state.data,issued=d.tokens.filter(t=>t.invoiceId&&t.chainActive!==false),accounts=new Set(issued.map(t=>lower(t.owner)).filter(Boolean)),transfers=d.history.filter(h=>addressValid(h.from)&&addressValid(h.to));
    $('metrics').innerHTML=metric('Colecciones',d.collections.filter(c=>c.status!=='deleted').length,'Tu archivo de colecciones','▦')+metric('Piezas emitidas',issued.length,d.tokens.filter(t=>!t.invoiceId).length+' borradores preparados','◇')+metric('Tenedores',accounts.size,'Direcciones con piezas en cadena','◎')+metric('Transferencias',transfers.length,'Movimientos registrados en cadena','↗');
    const active=d.collections.filter(c=>c.status!=='deleted').slice(0,3);$('overview-collections').innerHTML=active.length?active.map(collectionCard).join(''):empty('Tu primera colección empieza aquí','Ponle un nombre y prepara sus primeras piezas.','<button class="button primary" data-action="new-collection">+ Crear colección</button>');
    drawChart('movement-chart',transfers,'count');
    $('recent-activity').innerHTML=d.history.length?[...d.history].sort((a,b)=>timestamp(b.timestamp)-timestamp(a.timestamp)).slice(0,4).map(h=>'<div class="activity-item"><span class="activity-symbol">'+(addressValid(h.from)?'↗':'+')+'</span><div><b>'+esc(historyName(h))+'</b><p>'+esc(short(h.from))+' → '+esc(short(h.to))+'</p></div><time>'+esc(date(h.timestamp))+'</time></div>').join(''):empty('Sin movimientos todavía','Aquí aparecerán las emisiones y transferencias confirmadas.');
  }
  function renderCollections() {const search=lower($('collection-search').value),filter=$('collection-filter').value;const list=state.data.collections.filter(c=>(filter==='all'||c.status===filter)&&lower(c.name+' '+c.description).includes(search));$('collection-list').innerHTML=list.length?list.map(collectionCard).join(''):empty('No hay colecciones en esta vista','Crea una colección o cambia los filtros.');}
  function visibleTokens() {const collectionId=$('token-collection').value,search=lower($('token-search').value),filter=$('token-filter').value;const list=state.data.tokens.filter(t=>(collectionId==='all'||t.collectionId===collectionId)&&(filter==='all'||(filter==='draft'?!t.invoiceId:effectiveStatus(t)===filter))&&lower(pieceName(t)+' #'+t.number+' '+t.invoiceId+' '+t.owner+' '+idOf(t)).includes(search));const sort=$('token-sort').value;return list.sort((a,b)=>sort==='name'?pieceName(a).localeCompare(pieceName(b)):sort==='old'?Number(a.number)-Number(b.number):timestamp(b.createdAt)-timestamp(a.createdAt)||Number(b.number)-Number(a.number));}
  function renderTokens() {const list=visibleTokens();$('token-list').innerHTML=list.length?list.map(t=>{const id=idOf(t),status=effectiveStatus(t),image=imageURL(t);return '<article class="token-card '+(state.selection.has(id)?'selected':'')+'"><div class="token-art"><input type="checkbox" data-select-token="'+esc(id)+'" aria-label="Seleccionar '+esc(pieceName(t))+'" '+(state.selection.has(id)?'checked':'')+'>'+(image?'<img loading="lazy" src="'+esc(image)+'" alt="'+esc(pieceName(t))+'">':'')+badge(status!=='active'?status:t.invoiceId?'active':'draft')+'<span class="piece-id">#'+esc(t.number)+'</span></div><div class="token-info"><h3>'+esc(pieceName(t))+'</h3><p>'+esc(colName(t.collectionId))+'</p><div class="token-meta"><span title="'+esc(t.owner||'')+'">'+esc(t.invoiceId?short(t.owner):'Sin emitir')+'</span><span>'+royalty(t).bps/100+'%</span></div><button class="button" data-edit-token="'+esc(id)+'">Ver pieza / editar ↗</button></div></article>';}).join(''):empty('No hay piezas en esta vista','Selecciona una colección y agrega imágenes para comenzar.');$('selected-count').textContent=state.selection.size+' seleccionados';$('select-all').checked=list.length>0&&list.every(t=>state.selection.has(idOf(t)));$('select-all').indeterminate=list.some(t=>state.selection.has(idOf(t)))&&!$('select-all').checked;$('token-total').textContent=list.length+' resultados · '+state.data.tokens.length+' piezas cargadas';}
  function historyName(h) {const t=token(h.tokenId);return t?pieceName(t)+(t.name?' · #'+t.number:''):(h.number?'Pieza #'+h.number:h.kind||'Movimiento');}
  function filteredHistory() {const q=lower($('history-search').value),from=$('history-from').value?new Date($('history-from').value+'T00:00:00').getTime():0,to=$('history-to').value?new Date($('history-to').value+'T23:59:59.999').getTime():Infinity;return [...state.data.history].filter(h=>timestamp(h.timestamp)>=from&&timestamp(h.timestamp)<=to&&lower(historyName(h)+' '+h.from+' '+h.to+' '+h.txHash).includes(q)).sort((a,b)=>Number(b.blockNumber)-Number(a.blockNumber));}
  function renderHistory() {$('history-list').innerHTML=filteredHistory().map(h=>'<tr><td class="nowrap">'+esc(date(h.timestamp))+'</td><td>'+esc(historyName(h))+'<div class="small">'+esc(h.kind||'Transferencia')+'</div></td><td class="address" title="'+esc(h.from)+'">'+esc(h.from||'Emisión')+'</td><td class="address">'+esc(h.to||'—')+'</td><td>'+hashLink(h.txHash)+'</td></tr>').join('')||'<tr><td colspan="5">No hay movimientos en este rango.</td></tr>';}
  function renderAccounts() {const accounts=accountSummary(state.data.tokens,state.data.history),links=accounts.reduce((n,a)=>n+a.linked.size,0)/2;$('account-metrics').innerHTML=metric('Direcciones',accounts.length,'Observadas en el catálogo','◎')+metric('Tenedores actuales',accounts.filter(a=>a.held).length,'Último estado consultado','◇')+metric('Conexiones',links,'Pares con transferencias','⇄')+metric('Piezas en tenencia',accounts.reduce((n,a)=>n+a.held,0),'Facturas activas observadas','▦');$('account-list').innerHTML=accounts.map(a=>'<tr><td class="address">'+esc(a.address)+'</td><td>'+a.held+'</td><td>'+a.received+'</td><td>'+a.sent+'</td><td>'+a.linked.size+'</td><td>'+[...a.linked].map(v=>'<div class="address">'+esc(v)+'</div>').join('')+'</td></tr>').join('')||'<tr><td colspan="6">No hay direcciones registradas todavía.</td></tr>';}
  function drawChart(id,records,kind) {
    if(!records.length){$(id).innerHTML='<div class="chart-empty">'+(kind==='count'?'Todavía no hay transferencias confirmadas.':'No hay cobros verificados registrados.')+'</div>';return;}
    const today=new Date();today.setHours(0,0,0,0);const buckets=Array.from({length:14},(_,i)=>({at:today.getTime()-(13-i)*86400000,value:0}));
    records.forEach(r=>{const t=timestamp(r.timestamp||r.createdAt),bucket=buckets.find(b=>t>=b.at&&t<b.at+86400000);if(bucket)bucket.value+=kind==='count'?1:Number(r.amount||0);});
    const max=Math.max(...buckets.map(b=>b.value),1),width=600,height=155,gap=11,bar=(width-40)/14-gap;
    $(id).innerHTML='<svg viewBox="0 0 600 190" role="img" aria-label="'+esc(kind==='count'?'Transferencias de los últimos catorce días':'Cobros verificados de los últimos catorce días')+'"><line x1="20" y1="155" x2="590" y2="155"/>'+buckets.map((b,i)=>{const h=b.value/max*120,x=22+i*(bar+gap);return '<rect x="'+x+'" y="'+(height-h)+'" width="'+bar+'" height="'+Math.max(h,1)+'" rx="3"><title>'+esc(new Date(b.at).toLocaleDateString('es-EC'))+': '+b.value+'</title></rect>'+(b.value?'<text x="'+(x+bar/2)+'" y="'+(height-h-6)+'" text-anchor="middle">'+esc(b.value)+'</text>':'')+(i%3===0||i===13?'<text x="'+(x+bar/2)+'" y="178" text-anchor="middle">'+new Date(b.at).getDate()+'/'+(new Date(b.at).getMonth()+1)+'</text>':'');}).join('')+'</svg>';
  }
  function renderRoyalties() {const payments=state.data.royaltyPayments.filter(p=>p.verified===true&&p.status==='confirmed');const currencies=new Set(payments.map(p=>p.currency||p.asset||'native'));$('royalty-metrics').innerHTML=metric('Reglas por colección',state.data.collections.filter(c=>Number(c.royaltyBps)>0).length,'Configuración en el backend','%')+metric('Excepciones por pieza',state.data.tokens.filter(t=>t.royaltyBps!=null).length,'Porcentaje individual','◇')+metric('Pagos verificados',payments.length,'Sin sumar monedas diferentes','✓')+metric('Monedas registradas',currencies.size,'El contrato no registra ventas','◎');if(payments.length&&currencies.size>1)$('royalty-chart').innerHTML='<div class="chart-empty">Existen cobros en distintas monedas. Exporta el catálogo para verlos por separado.</div>';else drawChart('royalty-chart',payments,'amount');$('royalty-payments').innerHTML=payments.map(p=>'<tr><td class="nowrap">'+esc(date(p.timestamp))+'</td><td>'+esc(token(p.tokenId)?pieceName(token(p.tokenId)):p.tokenId)+'</td><td class="address">'+esc(p.from)+'</td><td class="address">'+esc(p.to)+'</td><td class="mono">'+esc(p.amount)+' '+esc(p.currency||'NATIVE')+'</td><td>'+hashLink(p.txHash)+'</td></tr>').join('')||'<tr><td colspan="6">No hay cobros verificados registrados.</td></tr>';$('royalty-rules').innerHTML=state.data.collections.map(c=>'<div class="rule-row"><div><button class="text-button" data-edit-collection="'+esc(idOf(c))+'">'+esc(c.name)+'</button><p class="mono">'+esc(c.royaltyReceiver||'Sin receptor')+'</p></div><b>'+Number(c.royaltyBps||0)/100+'%</b></div>').join('')||'<p class="small">Crea una colección para configurar su royalty.</p>';calculate();}
  function calculate() {const price=Number($('sale-price').value),pct=Number($('sale-percent').value);$('sale-result').textContent=Number.isFinite(price)&&price>=0&&Number.isFinite(pct)&&pct>=0&&pct<=100?(price*pct/100).toLocaleString('es-EC',{maximumFractionDigits:12}):'—';}
  function renderSettings() {const d=state.data;$('contract-details').innerHTML='<h2>Conexión activa</h2><dl class="detail-grid"><dt>Contrato</dt><dd class="mono">'+esc(d.contractAddress)+'</dd><dt>Chain ID</dt><dd>'+esc(d.chainId)+'</dd><dt>Owner del sistema</dt><dd class="mono">'+esc(d.systemOwner)+'</dd><dt>Tu cuenta</dt><dd class="mono">'+esc(state.account)+'</dd><dt>Permiso</dt><dd>'+esc(d.isSystemOwner?'Owner del sistema':'Administrador verificado en el contrato')+'</dd><dt>Backend</dt><dd class="mono">'+esc(apiOrigin)+'</dd><dt>Sincronización</dt><dd><pre>'+esc(JSON.stringify(d.scan||{},null,2))+'</pre></dd></dl>';}
  function renderOperations() {const ops=(state.data.operations||[]).filter(op=>op.status!=='superseded'),hashes=hashStore();$('operation-list').innerHTML=ops.length?ops.map(op=>'<div class="operation-row"><div><b>'+esc(op.action||op.method||'Operación')+'</b> '+badge(op.status||'prepared')+'<p class="mono">'+esc(idOf(op))+'</p><p class="small">'+esc(date(op.createdAt))+'</p></div>'+(op.txHash?hashLink(op.txHash):'<input data-operation-hash="'+esc(idOf(op))+'" value="'+esc(hashes[idOf(op)]||'')+'" placeholder="0x… hash de la transacción firmada" aria-label="Hash de la operación '+esc(idOf(op))+'">')+(op.status!=='confirmed'?'<button class="button" data-confirm-operation="'+esc(idOf(op))+'">Confirmar hash</button>':'')+'</div>').join(''):empty('Sin operaciones todavía','Las operaciones preparadas en el backend aparecerán aquí.');}
  function renderView(view) {({overview:renderOverview,collections:renderCollections,tokens:renderTokens,owners:()=>renderOwners().catch(showError),send:renderQueue,activity:renderHistory,accounts:renderAccounts,royalties:renderRoyalties,operations:renderOperations,settings:renderSettings}[view]||(()=>{}))();}
  async function loadMoreCatalog(kind,button) {
    if(!['collections','tokens','history','royaltyPayments'].includes(kind))return;const epoch=state.generation;button.disabled=true;
    try{const result=await request(BASE+'/catalog?kind='+kind+'&offset='+(state.paging[kind]??state.data[kind].length)+'&limit=500');assertSession(epoch);if(!Array.isArray(result.items)||result.kind!==kind)throw new Error('Respuesta de paginación inválida.');const known=new Map(state.data[kind].map(item=>[idOf(item),item]));result.items.forEach(item=>known.set(idOf(item),item));state.data[kind]=[...known.values()];state.data.totals={...state.data.totals,[kind]:result.total};state.paging[kind]=result.nextOffset;state.more[kind]=result.hasMore;render();notify(result.items.length+' registros adicionales cargados.');}finally{button.disabled=false;}
  }
  function readOnlyEditor() {$('editor-body').querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=true);$('save-editor').disabled=true;$('save-editor').textContent='Solo lectura';state.editing=null;$('editor-error').textContent='Esta colección está delegada. Solo su delegado y el owner del sistema pueden modificarla en el panel.';}

  function statusOptions(value) {return ['active','suspended','blocked','deleted'].map(s=>'<option value="'+s+'" '+(s===value?'selected':'')+'>'+STATUS[s]+'</option>').join('');}
  function openEditor(title,eyebrow,body,save,label='Guardar') {
    state.editing=save;$('editor-title').textContent=title;$('editor-eyebrow').textContent=eyebrow;$('editor-body').innerHTML=body;$('editor-error').textContent='';$('save-editor').textContent=label;$('save-editor').disabled=false;$('cancel-editor').disabled=false;
    if(!$('editor').open)$('editor').showModal();
  }
  function attributesHTML(attributes=[]) {return '<div class="attributes-section"><div class="section-title"><h3>Atributos <span class="small">· opcionales</span></h3><button class="text-button" type="button" id="add-attribute">+ Agregar atributo</button></div><div id="attribute-rows">'+attributes.map(attributeRow).join('')+'</div><p class="small">Hasta 200 atributos por pieza. Puedes agregar y quitar filas.</p></div>';}
  function attributeRow(a={trait_type:'',value:''}) {return '<div class="attribute-row"><input class="trait-name" aria-label="Nombre del atributo" placeholder="Rasgo, por ejemplo: rareza" maxlength="100" value="'+esc(a.trait_type)+'"><input class="trait-value" aria-label="Valor del atributo" placeholder="Valor" maxlength="500" value="'+esc(a.value)+'"><button class="icon-button" type="button" data-remove-attribute aria-label="Quitar atributo">×</button></div>';}
  function readAttributes() {return parseAttributes([...document.querySelectorAll('#attribute-rows .attribute-row')].map(row=>({trait_type:row.querySelector('.trait-name').value,value:row.querySelector('.trait-value').value})).filter(a=>a.trait_type||a.value));}
  /* (2026-10-26) Sube un archivo de imagen (perfil, portada o pieza) y devuelve su id. */
  async function uploadImageFile(file) {
    const max=Number(state.data.capabilities?.imageMaxBytes)||600000;
    if(!file)return '';
    if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size>max||file.size<1)throw new Error(file.name+': usa PNG, JPEG, WebP o GIF de hasta '+max.toLocaleString('es-EC')+' bytes.');
    const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('No se pudo leer '+file.name));reader.readAsDataURL(file);});
    const result=await request(BASE+'/images',{method:'POST',body:JSON.stringify({dataUrl})});
    return result.id||result.imageId;
  }
  function imagePicker(kind,label,current,required=false) {
    return '<div class="image-picker"><span class="picker-label">'+esc(label)+'</span>'+(current?'<img class="picker-preview '+kind+'" src="'+esc(current)+'" alt="">':'<span class="picker-empty">Sin imagen</span>')+'<input id="edit-'+kind+'" type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="'+esc(label)+'">'+(current&&!required?'<label class="check-label"><input type="checkbox" id="remove-'+kind+'"> Quitar</label>':'')+'</div>';
  }
  async function pickedImage(kind) {
    const input=$('edit-'+kind),remove=$('remove-'+kind);
    if(input&&input.files&&input.files[0])return uploadImageFile(input.files[0]);
    if(remove&&remove.checked)return '';
    return undefined;
  }
  function openCollection(id) {
    const c=collection(id)||{name:'',description:'',symbol:'',delegate:'',royaltyBps:0,royaltyReceiver:state.account,status:'active',limit:'10000',visibility:'private'};
    openEditor(id?'Configurar colección':'Crear colección','IDENTIDAD Y REGLAS','<div class="form-grid"><label>Nombre *<input id="edit-name" required maxlength="100" value="'+esc(c.name)+'" placeholder="Guardianes del bosque"></label><label>Símbolo (opcional)<input id="edit-symbol" maxlength="20" value="'+esc(c.symbol)+'" placeholder="BOSQUE"></label><label class="full">Descripción<textarea id="edit-description" rows="3" maxlength="5000">'+esc(c.description)+'</textarea></label><label>Límite de piezas en cadena<input id="edit-limit" required inputmode="numeric" pattern="[0-9]+" maxlength="78" value="'+esc(c.limit)+'"></label><label>Estado reversible<select id="edit-status">'+statusOptions(c.status)+'</select></label>'+(can('visibility')?'<label>Visibilidad en el juego<select id="edit-visibility"><option value="private" '+(isPublic(c)?'':'selected')+'>Privada · solo en este panel</option><option value="public" '+(isPublic(c)?'selected':'')+'>Pública · se ve en el panel NFT del juego</option></select></label><div class="full image-pickers">'+imagePicker('avatar','Imagen de perfil',collectionImageURL(c,'avatar'))+imagePicker('cover','Portada',collectionImageURL(c,'cover'))+'</div>':'')+'<label>Royalty de referencia (%)<input id="edit-percent" required type="number" min="0" max="100" step="0.01" value="'+Number(c.royaltyBps||0)/100+'"></label><label>Receptor de royalties<input id="edit-receiver" maxlength="42" value="'+esc(c.royaltyReceiver)+'" placeholder="0x…"></label><label class="full">Representante / dueño de la colección (opcional)<input id="edit-delegate" maxlength="42" value="'+esc(c.delegate)+'" '+(!state.data.isSystemOwner?'disabled':'')+' placeholder="Sin asignar"><span class="small">Solo el owner del sistema asigna este representante. No concede administración global ni acceso a este panel.</span></label></div><div class="notice">Los royalties y estados son políticas del backend. Enviar una colección a la papelera conserva sus piezas e historial; restaurarla no cambia los estados individuales.</div>'+(id?'<div class="section-title"><span class="small">'+(c.configured?'Tipo configurado en cadena.':'Pendiente de configurar en cadena.')+'<br><code>'+esc(c.typeKey)+'</code></span><button class="button" type="button" data-configure="'+esc(id)+'">Configurar límite en cadena ↗</button></div>':'')+(id&&canManage(c)&&can('deletes')?'<div class="danger-zone"><div><b>Zona de peligro</b><p class="small">Borra la colección y todas sus piezas del registro. Las piezas ya emitidas puedes quemarlas antes en la cadena.</p></div><button class="button danger" type="button" data-delete-collection="'+esc(id)+'">Eliminar colección…</button></div>':''),async()=>{
      const bps=percentToBps($('edit-percent').value),receiver=$('edit-receiver').value.trim(),delegate=$('edit-delegate').value.trim();
      if(receiver&&!addressValid(receiver))throw new Error('Receptor de royalties inválido.');if(bps>0&&!addressValid(receiver))throw new Error('Indica el receptor del royalty.');if(delegate&&!addressValid(delegate))throw new Error('Dirección del representante inválida.');
      const payload={name:$('edit-name').value.trim(),symbol:$('edit-symbol').value.trim(),description:$('edit-description').value,limit:$('edit-limit').value,royaltyBps:bps,royaltyReceiver:receiver,status:$('edit-status').value};if($('edit-visibility'))payload.visibility=$('edit-visibility').value;if(state.data.isSystemOwner)payload.delegate=delegate;
      if(!payload.name)throw new Error('Escribe el nombre de la colección.');
      if(!/^\d+$/.test(payload.limit)||BigInt(payload.limit)<1n)throw new Error('El límite debe ser un entero positivo.');
      if(id&&payload.status!==c.status&&payload.status!=='active'){const ok=await review('Cambiar estado de la colección','<p>La colección <b>'+esc(payload.name)+'</b> y todas sus piezas quedarán restringidas en este panel por su estado <b>'+esc(STATUS[payload.status])+'</b>.</p><p class="small">Podrás restaurarla. Las facturas en cadena se conservan.</p>','Aplicar estado');if(!ok)return false;}
      // (2026-10-26) El perfil y la portada: se suben justo antes de guardar la colección.
      for(const [kind,key]of[['avatar','avatarImageId'],['cover','coverImageId']]){const value=await pickedImage(kind);if(value!==undefined)payload[key]=value;}
      await request(id?BASE+'/'+encodeURIComponent(id):BASE,{method:id?'PATCH':'POST',body:JSON.stringify(payload)});notify(id?'Colección actualizada.':'Colección creada. Configura su tipo en cadena antes de emitir piezas.');return true;
    },id?'Guardar cambios':'Crear colección');if(id&&!canManage(c))readOnlyEditor();
  }
  function openToken(id) {
    const t=token(id);if(!t)return;const r=royalty(t),image=imageURL(t);
    openEditor(pieceName(t),'PIEZA #'+t.number+' / '+colName(t.collectionId),(image?'<img class="editor-preview" src="'+esc(image)+'" alt="'+esc(pieceName(t))+'">':'')+'<dl class="detail-grid"><dt>ID catálogo</dt><dd class="mono">'+esc(id)+'</dd><dt>ID factura actual</dt><dd class="mono">'+esc(t.invoiceId||'Sin emitir')+'</dd><dt>Propietario en cadena</dt><dd class="mono">'+esc(t.owner||'Sin emitir')+'</dd></dl>'+(t.chainWarning?'<div class="notice warning">'+esc(t.chainWarning)+'</div>':'')+'<div class="form-grid"><label class="full">Nombre (opcional)<input id="edit-name" maxlength="160" value="'+esc(t.name)+'" placeholder="Pieza #'+esc(t.number)+'"></label><label class="full">Descripción<textarea id="edit-description" rows="3" maxlength="5000">'+esc(t.description)+'</textarea></label><label>Estado reversible<select id="edit-status">'+statusOptions(t.status)+'</select></label><label>Royalty<select id="edit-royalty-mode"><option value="inherit" '+(t.royaltyBps==null?'selected':'')+'>Heredar de la colección</option><option value="custom" '+(t.royaltyBps!=null?'selected':'')+'>Personalizado para esta pieza</option></select></label><label>Royalty individual (%)<input id="edit-percent" type="number" min="0" max="100" step="0.01" value="'+r.bps/100+'"></label><label>Receptor individual<input id="edit-receiver" maxlength="42" value="'+esc(r.receiver)+'" placeholder="0x…"></label></div>'+attributesHTML(t.attributes)+'<div class="notice">El #'+esc(t.number)+' es estable dentro de su colección. El contrato creará otro ID de factura al transferir. Los estados de la colección también se aplican a esta pieza.</div><button type="button" class="button" data-queue-token="'+esc(id)+'">'+(t.invoiceId?'Preparar transferencia':'Preparar emisión')+' ↗</button><div class="image-pickers">'+imagePicker('piece','Cambiar imagen de esta pieza',image,true)+'</div>'+(can('deletes')&&canManage(collection(t.collectionId))?'<div class="danger-zone"><div><b>Zona de peligro</b><p class="small">'+(t.invoiceId&&t.chainActive!==false?'Esta pieza está emitida en la cartera '+esc(short(t.owner))+'. Puedes quemarla en la cadena (una firma) y después borrarla del registro.':'Borra esta pieza del registro. Su número no se reutiliza.')+'</p></div>'+(t.invoiceId&&t.chainActive!==false&&can('burn')?'<button class="button danger" type="button" data-burn-token="'+esc(id)+'">Quemar en cadena…</button>':'')+'<button class="button danger" type="button" data-delete-token="'+esc(id)+'">Eliminar pieza…</button></div>':''),async()=>{
      const custom=$('edit-royalty-mode').value==='custom',bps=custom?percentToBps($('edit-percent').value):null,receiver=custom?$('edit-receiver').value.trim():'';
      if(receiver&&!addressValid(receiver))throw new Error('Receptor inválido.');
      if(bps>0&&!addressValid(receiver)&&!addressValid(collection(t.collectionId)?.royaltyReceiver))throw new Error('Indica un receptor de royalties.');
      const body={name:$('edit-name').value.trim(),description:$('edit-description').value,status:$('edit-status').value,attributes:readAttributes(),royaltyBps:bps,royaltyReceiver:receiver};
      // (2026-10-26) La imagen nueva de la pieza, si se eligió una.
      const nueva=await pickedImage('piece');if(nueva)body.imageId=nueva;
      await request(BASE+'/tokens/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(body)});notify(nueva?'Pieza e imagen actualizadas.':'Pieza actualizada.');return true;
    });if(!canManage(collection(t.collectionId)))readOnlyEditor();
  }
  function openUpload() {
    const selected=$('token-collection').value,available=state.data.collections.filter(c=>c.status==='active'&&canManage(c));if(!available.length){notify('Necesitas una colección activa con permiso de gestión para agregar imágenes.',true);return;}
    state.uploads=[];
    openEditor('Agregar imágenes','NUEVAS PIEZAS','<label>Colección de destino<select id="upload-collection">'+available.map(c=>'<option value="'+esc(idOf(c))+'" '+(idOf(c)===selected?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></label><div class="upload-drop"><b>Selecciona tus imágenes</b><p class="small">PNG, JPEG, WebP o GIF · máximo 600 000 bytes por imagen · hasta 100 piezas por selección.</p><input id="upload-files" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple aria-label="Seleccionar imágenes NFT"></div><p id="upload-count" class="upload-count">0 imágenes seleccionadas</p><label>Descripción común (opcional)<textarea id="upload-description" rows="2" maxlength="5000"></textarea></label>'+attributesHTML()+'<div class="notice">Los atributos comunes se copian a cada pieza. Puedes personalizarlos por imagen abajo. Los #ID finales los asigna el backend, sin reutilizar números.</div><div id="upload-items" class="upload-items"></div>',saveUploads,'Guardar borradores');
  }
  async function chooseFiles(files) {
    const epoch=state.generation;
    if(files.length>100)throw new Error('Selecciona como máximo 100 imágenes a la vez.');
    const max=Number(state.data.capabilities?.imageMaxBytes)||600000;
    for(const file of files)if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size>max||file.size<1)throw new Error(file.name+': usa PNG, JPEG, WebP o GIF de hasta '+max.toLocaleString('es-EC')+' bytes.');
    const uploads=await Promise.all([...files].map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({fileName:file.name,dataUrl:reader.result,name:'',attributes:null,saved:false});reader.onerror=()=>reject(new Error('No se pudo leer '+file.name));reader.readAsDataURL(file);})));assertSession(epoch);state.uploads=uploads;
    $('upload-count').textContent=uploads.length+' imágenes seleccionadas · '+uploads.length+' borradores por crear';
    $('upload-items').innerHTML=uploads.map((u,i)=>'<div class="upload-item"><img src="'+esc(u.dataUrl)+'" alt="Vista previa '+(i+1)+'"><div><span class="small">'+esc(u.fileName)+' · orden '+(i+1)+'</span><input data-upload-name="'+i+'" placeholder="Nombre opcional" maxlength="160" aria-label="Nombre de la pieza '+(i+1)+'"><details><summary class="small">Atributos individuales (opcional)</summary><textarea data-upload-attributes="'+i+'" rows="3" placeholder=\'[{"trait_type":"Rareza","value":"Épico"}]\' aria-label="Atributos JSON de la pieza '+(i+1)+'"></textarea><span class="small">Déjalo vacío para usar los comunes. Usa [] para una pieza sin atributos.</span></details></div><span class="small" id="upload-state-'+i+'">Pendiente</span></div>').join('');
  }
  async function saveUploads() {
    if(!state.uploads.length)throw new Error('Selecciona al menos una imagen.');
    const collectionId=$('upload-collection').value,common=readAttributes(),description=$('upload-description').value,epoch=state.generation;
    const metadata=state.uploads.map((u,i)=>({name:document.querySelector('[data-upload-name="'+i+'"]').value.trim(),attributes:parseAttributes(document.querySelector('[data-upload-attributes="'+i+'"]').value.trim()||common),description}));
    $('upload-files').disabled=true;$('upload-collection').disabled=true;
    for(let i=0;i<state.uploads.length;i++){
      const u=state.uploads[i];if(u.saved)continue;assertSession(epoch);$('upload-state-'+i).textContent='Subiendo…';
      if(u.uncertain)throw new Error('El resultado del guardado de '+u.fileName+' es desconocido. Cierra esta ventana y actualiza el catálogo para comprobarlo antes de volver a cargar esa imagen.');
      if(!u.imageId){const result=await request(BASE+'/images',{method:'POST',body:JSON.stringify({dataUrl:u.dataUrl})});u.imageId=result.id||result.imageId;}
      assertSession(epoch);let result;try{result=await request(BASE+'/'+encodeURIComponent(collectionId)+'/tokens',{method:'POST',body:JSON.stringify({items:[{...metadata[i],imageId:u.imageId}]})});}catch(error){if(!error.status||error.status>=500){u.uncertain=true;throw new Error('No se pudo confirmar el guardado de '+u.fileName+'. Cierra esta ventana y actualiza el catálogo antes de volver a cargarla. Las piezas confirmadas se conservan.');}throw error;}u.saved=true;u.tokenId=idOf(result.tokens?.[0]);$('upload-state-'+i).textContent='Guardado ✓';
    }
    notify(state.uploads.length+' piezas guardadas. Los #ID fueron asignados por el backend.');return true;
  }
  /* ═══ (2026-10-26) PÚBLICA/PRIVADA, QUEMAR, BORRAR E IMÁGENES POR NÚMERO ═══
     "No puedo eliminar la colección y todos sus NFT, ni un NFT de una
     colección, ni cambiarle la imagen, ni cambiar las de todos según su id; y
     quiero un botón para hacerla pública o privada." */
  async function toggleVisibility(id) {
    const c=collection(id);if(!c||!canManage(c))return;const next=isPublic(c)?'private':'public';
    const ok=await review(next==='public'?'Hacer pública la colección':'Hacer privada la colección',next==='public'?'<p><b>'+esc(c.name)+'</b> aparecerá en el panel NFT del juego. Cada jugador verá las piezas de esta colección que tenga en su cartera.</p>':'<p><b>'+esc(c.name)+'</b> dejará de verse en el juego. Solo aparecerá en este panel.</p>',next==='public'?'Hacer pública':'Hacer privada');
    if(!ok)return;
    await request(BASE+'/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({visibility:next})});
    notify(next==='public'?'La colección ya es pública en el juego.':'La colección ahora es privada.');await loadData();
  }
  /** Quema una pieza emitida (deleteInvoice, una firma). `sinPreguntar` cuando ya se confirmó en otro diálogo. */
  async function burnToken(id,sinPreguntar=false) {
    const t=token(id);if(!t)return false;
    if(!sinPreguntar){const ok=await review('Quemar pieza en cadena','<p><b>'+esc(pieceName(t))+'</b> · #'+esc(t.number)+' de '+esc(colName(t.collectionId))+'</p><dl class="detail-grid"><dt>Factura</dt><dd class="mono">'+esc(t.invoiceId)+'</dd><dt>Cartera</dt><dd class="mono">'+esc(t.owner)+'</dd></dl><p class="notice warning">La factura se elimina del contrato y el jugador deja de tenerla. No se puede deshacer. Requiere gas y una firma.</p>','Firmar quema');if(!ok)return false;}
    await executeOperation({action:'burn',tokenId:id});return true;
  }
  function openDeleteToken(id) {
    const t=token(id);if(!t)return;const enCadena=!!(t.invoiceId&&t.chainActive!==false);
    openEditor('Eliminar pieza','#'+t.number+' / '+colName(t.collectionId),(enCadena?'<div class="notice warning">Esta pieza está emitida en la cartera <span class="mono">'+esc(t.owner)+'</span> (factura '+esc(t.invoiceId)+').</div>'+(can('burn')?'<label class="check-label"><input type="radio" name="del-mode" value="burn" checked> Quemarla en la cadena (una firma) y borrarla del registro</label>':'')+'<label class="check-label"><input type="radio" name="del-mode" value="registry" '+(can('burn')?'':'checked')+'> Borrarla solo del registro: la factura sigue en su cartera, pero el juego deja de enseñarla</label>':'<p>Se borrará <b>'+esc(pieceName(t))+'</b> del registro. Su número no se reutiliza.</p>'),async()=>{
      const mode=enCadena?(document.querySelector('input[name="del-mode"]:checked')||{}).value:'registry';
      if(mode==='burn')await burnToken(id,true);
      await request(BASE+'/tokens/'+encodeURIComponent(id)+'/delete',{method:'POST',body:JSON.stringify(enCadena&&mode==='registry'?{force:true}:{})});
      state.selection.delete(id);notify('Pieza #'+t.number+' eliminada.');return true;
    },'Eliminar pieza');
  }
  function openDeleteCollection(id) {
    const c=collection(id);if(!c)return;const ts=state.data.tokens.filter(t=>t.collectionId===id),emitidas=ts.filter(t=>t.invoiceId&&t.chainActive!==false);
    openEditor('Eliminar colección','ZONA DE PELIGRO','<p>Se borrarán <b>'+esc(c.name)+'</b> y sus <b>'+ts.length+'</b> piezas del registro, junto con las imágenes que ya no use nadie.</p>'+(emitidas.length?'<div class="notice warning">'+emitidas.length+' piezas están emitidas en carteras de jugadores.</div>'+(can('burn')?'<label class="check-label"><input type="radio" name="del-mode" value="burn" checked> Quemar antes en la cadena las '+emitidas.length+' piezas emitidas (una firma por pieza)</label>':'')+'<label class="check-label"><input type="radio" name="del-mode" value="registry" '+(can('burn')?'':'checked')+'> Borrar solo del registro: las facturas siguen en las carteras, pero el juego deja de enseñarlas</label>':'')+'<label>Escribe el nombre de la colección para confirmar<input id="delete-confirm" autocomplete="off" placeholder="'+esc(c.name)+'"></label><p id="delete-progress" class="small" role="status" aria-live="polite"></p>',async()=>{
      const confirm=$('delete-confirm').value.trim();if(confirm!==String(c.name||'').trim())throw new Error('Escribe exactamente el nombre de la colección.');
      const mode=emitidas.length?(document.querySelector('input[name="del-mode"]:checked')||{}).value:'registry';
      if(mode==='burn'){let i=0;for(const t of emitidas){$('delete-progress').textContent='Quemando '+(++i)+' de '+emitidas.length+'…';await burnToken(idOf(t),true);}}
      const r=await request(BASE+'/'+encodeURIComponent(id)+'/delete',{method:'POST',body:JSON.stringify({confirm,force:mode==='registry'})});
      notify('Colección eliminada · '+Number(r.tokens||0)+' piezas borradas.');return true;
    },'Eliminar definitivamente');
  }
  /** El número de pieza que lleva el nombre de un archivo: «12.png», «pieza-12.png», «#12.webp». */
  function numberFromName(name) {const m=/(\d{1,9})(?!.*\d)/.exec(String(name||'').replace(/\.[a-z0-9]+$/i,''));return m?Number(m[1]):0;}
  function openBulkImages() {
    const available=state.data.collections.filter(c=>canManage(c));if(!available.length)throw new Error('No tienes colecciones que puedas modificar.');
    const selected=$('token-collection').value;
    openEditor('Cambiar imágenes por número','IMÁGENES DE LAS PIEZAS','<label>Colección<select id="bulk-img-collection">'+available.map(c=>'<option value="'+esc(idOf(c))+'" '+(idOf(c)===selected?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></label><label>Modo<select id="bulk-img-mode"><option value="numbers">Una imagen por pieza, según el número del archivo</option><option value="all">La misma imagen para todas las piezas de la colección</option></select></label><div class="upload-drop"><b>Selecciona las imágenes</b><p class="small">El número de la pieza sale del nombre del archivo: «12.png», «pieza-12.png» o «#12.webp» van a la pieza #12. PNG, JPEG, WebP o GIF de hasta 600 000 bytes.</p><input id="bulk-img-files" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple aria-label="Imágenes por número"></div><div id="bulk-img-preview" class="upload-items"></div><p id="bulk-img-progress" class="small" role="status" aria-live="polite"></p>',async()=>{
      const cid=$('bulk-img-collection').value,mode=$('bulk-img-mode').value,files=[...($('bulk-img-files').files||[])];
      if(!files.length)throw new Error('Selecciona al menos una imagen.');
      if(mode==='all'){
        if(files.length!==1)throw new Error('Para todas las piezas elige una sola imagen.');
        if(!await review('Misma imagen para toda la colección','<p>Todas las piezas de <b>'+esc(colName(cid))+'</b> tendrán la imagen <b>'+esc(files[0].name)+'</b>.</p>','Aplicar a todas'))return false;
        const imageId=await uploadImageFile(files[0]);const r=await request(BASE+'/'+encodeURIComponent(cid)+'/token-images',{method:'POST',body:JSON.stringify({imageId})});
        notify(Number(r.updated||0)+' piezas con la imagen nueva.');return true;
      }
      const rows=files.map(f=>({f,n:numberFromName(f.name)}));
      const sinNumero=rows.filter(r=>!r.n).map(r=>r.f.name);if(sinNumero.length)throw new Error('Sin número de pieza en el nombre: '+sinNumero.join(', '));
      const vistos=new Set();for(const r of rows){if(vistos.has(r.n))throw new Error('Dos archivos para la pieza #'+r.n+'.');vistos.add(r.n);}
      const items=[];let i=0;for(const r of rows){$('bulk-img-progress').textContent='Subiendo '+(++i)+' de '+rows.length+'…';items.push({number:r.n,imageId:await uploadImageFile(r.f)});}
      const res=await request(BASE+'/'+encodeURIComponent(cid)+'/token-images',{method:'POST',body:JSON.stringify({items})});
      notify(Number(res.updated||0)+' piezas actualizadas'+(res.missing&&res.missing.length?' · no existen: #'+res.missing.join(', #'):'')+'.');return true;
    },'Subir y aplicar');
  }
  function previewBulkImages() {
    const cid=$('bulk-img-collection')?.value,files=[...($('bulk-img-files')?.files||[])],mode=$('bulk-img-mode')?.value;
    const numeros=new Set(state.data.tokens.filter(t=>t.collectionId===cid).map(t=>Number(t.number)));
    $('bulk-img-preview').innerHTML=mode==='all'?(files[0]?'<div class="upload-item"><span class="small">'+esc(files[0].name)+' → todas las piezas</span></div>':''):files.map(f=>{const n=numberFromName(f.name);return '<div class="upload-item"><span class="small">'+esc(f.name)+'</span><b>'+(n?'#'+n:'¿sin número?')+'</b><span class="small">'+(!n?'No se aplicará':numeros.has(n)?'Pieza encontrada ✓':'No hay pieza #'+n+' cargada')+'</span></div>';}).join('');
  }
  // ── Propietarios: quién tiene cada pieza, con su nombre en el juego ──────────
  async function renderOwners() {
    const sel=$('owners-collection');if(!sel)return;
    const prev=sel.value;sel.innerHTML=state.data.collections.map(c=>'<option value="'+esc(idOf(c))+'">'+esc(c.name)+'</option>').join('');
    if(state.data.collections.some(c=>idOf(c)===prev))sel.value=prev;
    if(!can('owners')){$('owners-list').innerHTML='<tr><td colspan="8">Actualiza server2.js para ver los propietarios.</td></tr>';return;}
    const cid=sel.value;if(!cid){$('owners-summary').innerHTML='';$('owners-list').innerHTML='<tr><td colspan="8">Crea una colección primero.</td></tr>';return;}
    const epoch=state.generation;state.owners=state.owners||{};
    if(!state.owners[cid]||Date.now()-state.owners[cid].at>60000){
      $('owners-list').innerHTML='<tr><td colspan="8">Cargando propietarios…</td></tr>';
      const r=await request(BASE+'/'+encodeURIComponent(cid)+'/owners');assertSession(epoch);state.owners[cid]={at:Date.now(),data:r};
    }
    paintOwners();
  }
  function paintOwners() {
    const cid=$('owners-collection').value,entry=state.owners&&state.owners[cid];if(!entry)return;const d=entry.data,q=lower($('owners-search').value);
    const rows=(d.tokens||[]).filter(t=>lower(['#'+t.number,t.name,t.playerName,t.username,t.owner,t.invoiceId,t.id].join(' ')).includes(q));
    $('owners-summary').innerHTML=metric('Piezas',Number(d.total||0),(d.tokens||[]).filter(t=>t.chainActive).length+' emitidas en carteras','◇')+metric('Propietarios',(d.owners||[]).length,'Carteras distintas','◎')+metric('Visibilidad',isPublic(d.collection)?'Pública':'Privada',isPublic(d.collection)?'Se ve en el juego':'Solo en este panel','◫')+((d.owners||[])[0]?metric('Mayor tenedor',d.owners[0].count,d.owners[0].playerName||d.owners[0].username||short(d.owners[0].address),'▦'):'');
    $('owners-list').innerHTML=rows.map(t=>{const img=imageURL(t);return '<tr><td>'+(img?'<img class="owner-thumb" loading="lazy" src="'+esc(img)+'" alt="">':'—')+'</td><td class="nowrap">#'+esc(t.number)+'</td><td>'+esc(t.name||'Pieza #'+t.number)+'<div class="small mono" title="'+esc(t.id)+'">'+esc(short(t.id))+'</div></td><td>'+esc(t.playerName||'—')+'</td><td>'+esc(t.username||'—')+'</td><td class="address" title="'+esc(t.owner)+'">'+esc(t.owner||(t.invoiceId?'—':'Sin emitir'))+'</td><td class="mono">'+esc(t.invoiceId||'—')+'</td><td>'+badge(t.chainActive?(t.status||'active'):(t.invoiceId?'deleted':'draft'))+'</td></tr>';}).join('')||'<tr><td colspan="8">No hay piezas que coincidan.</td></tr>';
  }
  function selectedTokens() {return [...state.selection].map(token).filter(Boolean);}
  function requireSelection() {const selected=selectedTokens();if(!selected.length)throw new Error('Selecciona primero las piezas en la biblioteca.');if(selected.some(t=>!canManage(collection(t.collectionId))))throw new Error('La selección incluye una colección delegada que solo puedes consultar.');return selected;}
  function bulkStatus() {const selected=requireSelection(),ids=selected.map(idOf);openEditor('Cambiar estado de '+ids.length+' piezas','CONTROL DEL CATÁLOGO','<label>Nuevo estado<select id="bulk-status-value">'+statusOptions('active')+'</select></label><p class="small">Aplica a las piezas seleccionadas. La papelera conserva imágenes, atributos e historial; ninguna factura será quemada.</p>',async()=>{const status=$('bulk-status-value').value;for(const id of ids)await request(BASE+'/tokens/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({status})});notify(ids.length+' piezas actualizadas.');return true;});}
  function bulkRoyalty() {
    const selected=selectedTokens();openEditor('Asignar royalties','POLÍTICAS DEL BACKEND','<label>Aplicar a<select id="bulk-royalty-scope"><option value="selected">'+selected.length+' piezas seleccionadas</option><option value="visible">Todas las piezas de la vista actual</option><option value="all">Todas las piezas cargadas del catálogo</option></select></label><label>Regla<select id="bulk-royalty-mode"><option value="custom">Porcentaje personalizado</option><option value="inherit">Restaurar regla de cada colección</option></select></label><div class="form-grid"><label>Royalty (%)<input id="bulk-percent" type="number" min="0" max="100" step="0.01" value="5"></label><label>Receptor<input id="bulk-receiver" value="'+esc(state.account)+'" maxlength="42"></label></div><div class="notice">Esto configura porcentajes de referencia. No ejecuta pagos ni añade royalties al contrato.</div>',async()=>{const scope=$('bulk-royalty-scope').value,list=scope==='all'?state.data.tokens:scope==='visible'?visibleTokens():selected,custom=$('bulk-royalty-mode').value==='custom',bps=custom?percentToBps($('bulk-percent').value):null,receiver=custom?$('bulk-receiver').value.trim():'';if(!list.length)throw new Error('No hay piezas en el alcance seleccionado.');if(custom&&bps>0&&!addressValid(receiver))throw new Error('Indica un receptor válido.');if(receiver&&!addressValid(receiver))throw new Error('Receptor inválido.');if(!await review('Aplicar royalties a '+list.length+' piezas','<p>'+esc(custom?bps/100+' % para '+receiver:'Se restaurará la regla de cada colección.')+'</p>','Aplicar'))return false;for(const t of list)await request(BASE+'/tokens/'+encodeURIComponent(idOf(t)),{method:'PATCH',body:JSON.stringify({royaltyBps:bps,royaltyReceiver:receiver})});notify('Política actualizada en '+list.length+' piezas.');return true;});
  }
  function royaltyPaymentPreview() {
    const t=token($('payment-token')?.value);if(!t||!root.ethers)return;
    try{const wei=root.ethers.parseEther($('payment-sale').value),r=royalty(t),due=wei*BigInt(r.bps)/10000n;if(wei<=0n||due<=0n)throw new Error('Precio o royalty igual a cero.');$('payment-preview').textContent=root.ethers.formatEther(due)+' moneda nativa → '+r.receiver+' ('+r.bps/100+' %)';}catch(_){$('payment-preview').textContent='Introduce un precio positivo válido, con hasta 18 decimales.';}
  }
  function openRoyaltyPayment() {
    const pieces=state.data.tokens.filter(t=>canManage(collection(t.collectionId))&&t.invoiceId&&royalty(t).bps>0);
    if(!pieces.length)throw new Error('Primero emite una pieza y configura su porcentaje y receptor de royalties.');
    if(state.data.capabilities?.royaltyPaymentTracking!=='native_direct_receipts')throw new Error('Actualiza server2.js para registrar cobros verificados.');
    openEditor('Registrar cobro de royalty','VERIFICACIÓN DE PAGO NATIVO','<label>Pieza<select id="payment-token">'+pieces.map(t=>'<option value="'+esc(idOf(t))+'">'+esc(colName(t.collectionId)+' / #'+t.number+' · '+pieceName(t))+'</option>').join('')+'</select></label><label>Precio de venta declarado · moneda nativa<input id="payment-sale" required inputmode="decimal" value="1" placeholder="1.00" maxlength="96"></label><output id="payment-preview" class="receipt-preview"></output><label>Hash del pago de royalty ya realizado<input id="payment-hash" required placeholder="0x…" minlength="66" maxlength="66" class="mono"></label><div class="notice">El servidor comprobará que el recibo corresponde a un envío directo al receptor y por el importe exacto del royalty actual, con al menos '+(Number(state.data.capabilities.confirmations)||2)+' confirmaciones. El precio de venta lo declaras tú; el contrato no registra ventas. Esta acción solo registra un pago existente.</div>',async()=>{
      if(!root.ethers)throw new Error('No se pudo cargar ethers.');const price=$('payment-sale').value.trim();if(!/^\d+(?:\.\d{1,18})?$/.test(price))throw new Error('Usa un precio en moneda nativa con hasta 18 decimales.');const saleAmountWei=root.ethers.parseEther(price).toString();if(BigInt(saleAmountWei)<=0n)throw new Error('El precio debe ser positivo.');const txHash=$('payment-hash').value.trim();if(!/^0x[0-9a-f]{64}$/i.test(txHash))throw new Error('El hash debe tener 32 bytes (0x y 64 caracteres hexadecimales).');
      await request(BASE+'/royalty-payments',{method:'POST',body:JSON.stringify({tokenId:$('payment-token').value,txHash,saleAmountWei})});notify('Cobro verificado y registrado.');return true;
    },'Verificar y registrar');royaltyPaymentPreview();
  }
  function review(title,body,label='Confirmar') {if(reviewResolve)reviewResolve(false);$('review-title').textContent=title;$('review-body').innerHTML=body;$('confirm-review').textContent=label;if(!$('review').open)$('review').showModal();return new Promise(resolve=>{reviewResolve=resolve;});}
  function closeReview(accepted) {const resolve=reviewResolve;reviewResolve=null;$('review').close();if(resolve)resolve(accepted);}
  function addQueue(tokens) {if(state.running)throw new Error('Espera o pausa los envíos antes de cambiar la cola.');if(tokens.some(t=>!canManage(collection(t.collectionId))))throw new Error('No tienes permiso de gestión sobre todas las piezas seleccionadas.');for(const t of tokens){if(!state.queue.some(r=>r.tokenId===idOf(t)&&r.status!=='done'))state.queue.push({tokenId:idOf(t),to:'',status:'ready'});}if(state.queue.length>200)state.queue=state.queue.slice(0,200);saveQueue();if($('editor').open)$('editor').close();changeView('send');}
  function renderQueue() {
    const usable=state.data.tokens.filter(t=>canManage(collection(t.collectionId))&&effectiveStatus(t)==='active'&&(!t.invoiceId||t.chainActive!==false));
    $('send-rows').innerHTML=state.queue.map((row,index)=>{const t=token(row.tokenId),fixed=state.running||!!row.operationId||row.status==='done';return '<tr><td><select data-queue-token-index="'+index+'" '+(fixed?'disabled':'')+' aria-label="Pieza del envío '+(index+1)+'"><option value="">Selecciona una pieza</option>'+[...new Map([...usable,...(t?[t]:[])].map(t=>[idOf(t),t])).values()].map(t=>'<option value="'+esc(idOf(t))+'" '+(idOf(t)===row.tokenId?'selected':'')+'>'+esc(colName(t.collectionId)+' / #'+t.number+' · '+pieceName(t))+'</option>').join('')+'</select></td><td><input class="address-input" data-queue-to="'+index+'" value="'+esc(row.to)+'" placeholder="0x…" maxlength="42" '+(fixed?'disabled':'')+' aria-label="Dirección del envío '+(index+1)+'"></td><td class="queue-status '+esc(row.status)+'">'+esc(row.status==='done'?'Confirmado ✓':row.status==='sending'?'Esperando confirmación…':row.error||(row.txHash?'Pendiente de registrar hash':t?.invoiceId?'Transferir pieza existente':'Emitir al destinatario'))+(row.txHash?'<span class="queue-hash">'+hashLink(row.txHash)+'</span>':'')+(row.operationId&&!row.txHash&&row.status!=='done'?'<span class="small">Destino reservado. Reanuda esta operación.</span>':'')+'</td><td>'+(!fixed?'<button class="icon-button" data-remove-queue="'+index+'" aria-label="Quitar envío '+(index+1)+'">×</button>':'')+'</td></tr>';}).join('')||'<tr><td colspan="4">Agrega una fila, selecciona piezas en la biblioteca o importa un CSV.</td></tr>';
    $('queue-count').textContent=state.queue.length+' ENVÍOS';$('review-send').disabled=state.running||!state.queue.length;$('stop-send').hidden=!state.running;$('add-send-row').disabled=state.running;$('import-send').disabled=state.running;$('clear-send').disabled=state.running;
  }
  function validateQueue() {
    const pending=state.queue.filter(r=>r.status!=='done'),seen=new Set();if(!pending.length)throw new Error('Todos los envíos ya fueron completados.');
    for(const row of pending){const t=token(row.tokenId);if(!t)throw new Error('Selecciona una pieza en cada fila.');if(seen.has(row.tokenId))throw new Error('La pieza #'+t.number+' está repetida. Una pieza solo puede tener un destino por ejecución.');seen.add(row.tokenId);if(!addressValid(row.to))throw new Error('Indica una dirección válida para '+pieceName(t)+'.');if(!row.txHash&&(effectiveStatus(t)!=='active'||t.chainAmbiguous||(t.invoiceId&&t.chainActive===false)))throw new Error(pieceName(t)+': revisa su estado y sincronización antes de enviarla.');if(t.invoiceId&&lower(t.owner)===lower(row.to)&&!row.txHash)throw new Error(pieceName(t)+' ya pertenece al destinatario.');}
    return pending;
  }
  async function walletSigner(epoch) {assertSession(epoch);if(!root.ethers)throw new Error('No se pudo cargar vendor/ethers.umd.min.js.');const accounts=await state.wallet.request({method:'eth_accounts'});assertSession(epoch);if(lower(accounts[0])!==state.account){lock('Cambió la cartera.');throw new Error('La cartera cambió.');}const network=await state.wallet.request({method:'eth_chainId'});assertSession(epoch);if(BigInt(network)!==BigInt(state.data.chainId))throw new Error('Selecciona la red '+state.data.chainId+' (0x'+Number(state.data.chainId).toString(16)+') en tu cartera y vuelve a conectar el panel.');const browser=new root.ethers.BrowserProvider(state.wallet);return browser.getSigner(state.account);}
  function hashStore() {try{return JSON.parse(storedGet(queueKey()+':hashes')||'{}');}catch(_){return {};}}
  function rememberHash(operationId,hash,key=queueKey()) {let known;try{known=JSON.parse(storedGet(key+':hashes')||'{}');}catch(_){known={};}known[operationId]=hash;storedSet(key+':hashes',JSON.stringify(known));}
  async function confirmOperation(operationId,hash) {if(!/^0x[0-9a-f]{64}$/i.test(hash||''))throw new Error('Indica un hash de transacción válido de 32 bytes.');return request(BASE+'/operations/'+encodeURIComponent(operationId)+'/confirm',{method:'POST',body:JSON.stringify({txHash:hash})});}
  async function executeOperation(payload,row=null) {
    const epoch=state.generation,storageKey=queueKey();assertSession(epoch);
    const operation=await request(BASE+'/prepare',{method:'POST',body:JSON.stringify(payload)});assertSession(epoch);
    if(!operation.operationId)throw new Error('El backend no devolvió una operación válida.');
    if(row){row.operationId=operation.operationId;saveQueue();renderQueue();}
    let hash=row?.txHash||operation.txHash||hashStore()[operation.operationId];
    if(!hash){
      const signer=await walletSigner(epoch);assertSession(epoch);
      if(lower(operation.to)!==lower(state.data.contractAddress)||Number(operation.chainId)!==Number(state.data.chainId)||!['setLimit','createInvoice','transferInvoice','deleteInvoice'].includes(operation.method))throw new Error('La operación devuelta por el backend no corresponde al contrato esperado.');
      const contract=new root.ethers.Contract(state.data.contractAddress,state.data.abi,signer),method=contract.getFunction(operation.method);
      await method.staticCall(...operation.args);assertSession(epoch);
      const tx=await method(...operation.args);hash=tx.hash;
      // Save immediately, before any wait or HTTP call: a submitted tx must never be sent twice after a connection failure.
      rememberHash(operation.operationId,hash,storageKey);assertSession(epoch);if(row){row.txHash=hash;row.status='sending';saveQueue();renderQueue();}
      notify('Transacción enviada: '+short(hash)+'. Esperando confirmaciones.');
      try{await tx.wait(Number(state.data.capabilities?.confirmations)||2);}catch(error){if(error.code==='TRANSACTION_REPLACED' && !error.cancelled && error.replacement && lower(error.replacement.to)===lower(tx.to) && lower(error.replacement.data)===lower(tx.data)&&BigInt(error.replacement.value||0)===BigInt(tx.value||0)){hash=error.replacement.hash;rememberHash(operation.operationId,hash,storageKey);assertSession(epoch);if(row){row.txHash=hash;saveQueue();}}else throw error;}
    }
    assertSession(epoch);const result=await confirmOperation(operation.operationId,hash);assertSession(epoch);return result;
  }
  async function configureCollection(id) {
    if(state.running||state.busy)return;const c=collection(id);if(!c)return;
    const accepted=await review('Configurar colección en cadena','<p><b>'+esc(c.name)+'</b></p><dl class="detail-grid"><dt>Tipo</dt><dd class="mono">'+esc(c.typeKey)+'</dd><dt>Límite total</dt><dd>'+esc(c.limit)+'</dd><dt>Por factura</dt><dd>1 unidad</dd><dt>Contrato</dt><dd class="mono">'+esc(state.data.contractAddress)+'</dd></dl><p class="small">Se aplican los datos ya guardados. Esta operación requiere gas y una firma.</p>','Firmar configuración');if(!accepted)return;
    const epoch=state.generation;state.busy=true;try{await executeOperation({action:'configure',collectionId:id});notify('Colección configurada en cadena.');await loadData();if($('editor').open)$('editor').close();}finally{if(epoch===state.generation)state.busy=false;}
  }
  async function runQueue() {
    if(state.running||state.busy)return;const pending=validateQueue();
    const accepted=await review('Revisar '+pending.length+' envíos','<div class="review-table"><table><thead><tr><th>Pieza</th><th>Destino</th><th>Acción</th></tr></thead><tbody>'+pending.map(r=>{const t=token(r.tokenId);return '<tr><td>'+esc(colName(t.collectionId)+' / #'+t.number)+'</td><td class="mono">'+esc(r.to)+'</td><td>'+esc(r.txHash?'Registrar hash':t.invoiceId?'Transferir':'Emitir')+'</td></tr>';}).join('')+'</tbody></table></div><p class="notice">Cada transacción requiere una firma y gas. Al comenzar, los borradores quedan reservados para la cartera y el destino elegidos. Si interrumpes el proceso, reanuda esta misma operación; conserva el hash si ya se envió.</p>','Comenzar envíos');
    if(!accepted)return;const epoch=state.generation;state.running=true;state.stop=false;renderQueue();let completed=0;
    try{
      for(const row of pending){assertSession(epoch);if(state.stop)break;const t=token(row.tokenId);row.status='sending';row.error='';renderQueue();$('send-progress').textContent='Procesando '+(completed+1)+' de '+pending.length+'…';
        try{
          if(row.txHash&&row.operationId)await confirmOperation(row.operationId,row.txHash);
          else await executeOperation({action:t.invoiceId?'transfer':'mint',tokenId:idOf(t),to:lower(row.to)},row);
          assertSession(epoch);row.status='done';completed++;saveQueue();renderQueue();await loadData();
        }catch(error){if(epoch!==state.generation)throw error;row.status='error';row.error=errorMessage(error);saveQueue();renderQueue();notify('La cola se pausó: '+row.error,true);break;}
      }
      assertSession(epoch);$('send-progress').textContent=completed+' confirmados en esta ejecución. '+state.queue.filter(r=>r.status!=='done').length+' pendientes.';
    }finally{if(epoch===state.generation){state.running=false;saveQueue();renderQueue();}}
  }
  function download(name,content,type) {const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function exportCSV(name,head,rows) {download(name,[head,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');}
  async function runHandler(fn) {try{await fn();}catch(error){showError(error);}}

  $('connect').addEventListener('click',()=>connect());
  $('save-api').addEventListener('click',()=>runHandler(async()=>{const value=normalizeOrigin($('api-origin').value.trim());lock('Conexión guardada. Conecta tu cartera con este backend.');apiOrigin=value;storedSet('gf-collections-api',value);notify('Backend: '+value);}));
  $('disconnect').addEventListener('click',()=>{lock('Panel cerrado.');});
  $('refresh').addEventListener('click',()=>runHandler(async()=>{await loadData();notify('Datos actualizados.');}));
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    runHandler(async()=>{
      const d=button.dataset;
      if(d.view)changeView(d.view);else if(d.go)changeView(d.go);
      else if(d.action==='new-collection')openCollection();
      else if(d.editCollection)openCollection(d.editCollection);
      else if(d.openCollection){$('token-collection').value=d.openCollection;state.selection.clear();changeView('tokens');}
      else if(d.editToken)openToken(d.editToken);
      else if(d.moreCatalog)await loadMoreCatalog(d.moreCatalog,button);
      else if(d.configure)await configureCollection(d.configure);
      else if(d.queueToken)addQueue([token(d.queueToken)].filter(Boolean));
      // (2026-10-26) Público/privado, propietarios, borrar y quemar.
      else if(d.toggleVisibility)await toggleVisibility(d.toggleVisibility);
      else if(d.ownersCollection){changeView('owners');$('owners-collection').value=d.ownersCollection;await renderOwners();}
      else if(d.deleteCollection)openDeleteCollection(d.deleteCollection);
      else if(d.deleteToken)openDeleteToken(d.deleteToken);
      else if(d.burnToken){if(await burnToken(d.burnToken)){notify('Pieza quemada en la cadena.');if($('editor').open)$('editor').close();await loadData();}}
      else if(button.hasAttribute('data-remove-attribute'))button.closest('.attribute-row').remove();
      else if(d.removeQueue!==undefined&&!state.running){state.queue.splice(Number(d.removeQueue),1);saveQueue();renderQueue();}
      else if(d.confirmOperation){const op=state.data.operations.find(op=>idOf(op)===d.confirmOperation),input=document.querySelector('[data-operation-hash="'+CSS.escape(d.confirmOperation)+'"]'),hash=op?.txHash||input?.value.trim()||hashStore()[d.confirmOperation];await confirmOperation(d.confirmOperation,hash);notify('Operación confirmada.');await loadData();}
      else if(button.id==='add-attribute'){if(document.querySelectorAll('#attribute-rows .attribute-row').length>=200)throw new Error('Máximo 200 atributos.');$('attribute-rows').insertAdjacentHTML('beforeend',attributeRow());}
    });
  });
  document.addEventListener('change',event=>runHandler(async()=>{
    const el=event.target;
    if(el.dataset.selectToken){if(el.checked)state.selection.add(el.dataset.selectToken);else state.selection.delete(el.dataset.selectToken);renderTokens();}
    else if(el.id==='select-all'){visibleTokens().forEach(t=>el.checked?state.selection.add(idOf(t)):state.selection.delete(idOf(t)));renderTokens();}
    else if(el.id==='upload-files')await chooseFiles(el.files);
    else if(['bulk-img-files','bulk-img-mode','bulk-img-collection'].includes(el.id))previewBulkImages();
    else if(el.id==='owners-collection')await renderOwners();
    else if(el.dataset.queueTokenIndex!==undefined&&!state.running){const r=state.queue[Number(el.dataset.queueTokenIndex)];r.tokenId=el.value;r.status='ready';r.error='';saveQueue();renderQueue();}
    else if(el.dataset.queueTo!==undefined&&!state.running){const r=state.queue[Number(el.dataset.queueTo)];r.to=lower(el.value.trim());r.status='ready';r.error='';saveQueue();}
  }));
  document.addEventListener('input',event=>{if(['payment-sale','payment-token'].includes(event.target.id))royaltyPaymentPreview();});
  ['collection-search','collection-filter'].forEach(id=>$(id).addEventListener('input',renderCollections));
  ['token-collection','token-search','token-filter','token-sort'].forEach(id=>$(id).addEventListener('input',renderTokens));
  $('owners-search').addEventListener('input',paintOwners);
  $('bulk-images').addEventListener('click',()=>runHandler(openBulkImages));
  ['history-search','history-from','history-to'].forEach(id=>$(id).addEventListener('input',renderHistory));
  ['sale-price','sale-percent'].forEach(id=>$(id).addEventListener('input',calculate));
  $('upload-open').addEventListener('click',()=>runHandler(openUpload));
  $('queue-selected').addEventListener('click',()=>runHandler(()=>addQueue(requireSelection())));
  $('bulk-status').addEventListener('click',()=>runHandler(bulkStatus));
  $('bulk-royalty').addEventListener('click',()=>runHandler(bulkRoyalty));
  $('royalty-bulk-open').addEventListener('click',()=>runHandler(bulkRoyalty));
  $('royalty-payment-open').addEventListener('click',()=>runHandler(openRoyaltyPayment));
  $('add-send-row').addEventListener('click',()=>runHandler(()=>{if(state.queue.length>=200)throw new Error('Máximo 200 envíos en una cola.');state.queue.push({tokenId:'',to:'',status:'ready'});saveQueue();renderQueue();}));
  $('review-send').addEventListener('click',()=>runHandler(runQueue));
  $('stop-send').addEventListener('click',()=>{state.stop=true;$('stop-send').textContent='Pausa solicitada…';});
  $('clear-send').addEventListener('click',()=>{if(state.running)return;state.queue=state.queue.filter(r=>r.status!=='done');saveQueue();renderQueue();});
  $('import-send').addEventListener('click',()=>runHandler(()=>{if(state.running)throw new Error('Pausa la cola antes de importar.');const rows=parseSendRows($('send-csv').value);for(const row of rows){if(!token(row.tokenId))throw new Error('No existe el ID de catálogo '+row.tokenId);if(state.queue.some(r=>r.tokenId===row.tokenId&&r.status!=='done'))throw new Error('La pieza '+row.tokenId+' ya está en la cola.');}if(rows.length+state.queue.length>200)throw new Error('La cola admite un máximo de 200 filas.');state.queue.push(...rows);saveQueue();renderQueue();notify(rows.length+' destinos importados.');}));
  $('download-template').addEventListener('click',()=>{const t=state.data.tokens[0];download('destinos-colecciones.csv','id_catalogo,direccion\r\n'+(t?idOf(t):'ID_CATALOGO')+',0x0000000000000000000000000000000000000001\r\n','text/csv;charset=utf-8');});
  $('export-history').addEventListener('click',()=>exportCSV('movimientos-colecciones.csv',['fecha','id_catalogo','coleccion','numero','tipo','desde','hacia','txHash','bloque'],filteredHistory().map(h=>[date(h.timestamp),h.tokenId,h.collectionId,h.number,h.kind,h.from,h.to,h.txHash,h.blockNumber])));
  $('export-accounts').addEventListener('click',()=>exportCSV('cuentas-colecciones.csv',['direccion','piezas_activas','recibidos','enviados','cuentas_relacionadas','direcciones'],accountSummary(state.data.tokens,state.data.history).map(a=>[a.address,a.held,a.received,a.sent,a.linked.size,[...a.linked].join(' | ')])));
  $('export-catalog').addEventListener('click',()=>download('colecciones-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({exportedAt:new Date().toISOString(),...state.data},null,2),'application/json'));
  $('sync-chain').addEventListener('click',()=>runHandler(async()=>{const button=$('sync-chain');button.disabled=true;try{const body={};for(const [id,key]of[['sync-from','fromBlock'],['sync-to','toBlock']]){const value=$(id).value;if(value!==''){const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw new Error('Usa números de bloque válidos.');body[key]=n;}}const result=await request(BASE+'/sync',{method:'POST',body:JSON.stringify(body)});$('sync-result').textContent=JSON.stringify(result,null,2);await loadData();notify(result.hasMore?'Tramo sincronizado. Hay más bloques; vuelve a sincronizar para continuar.':'Sincronización terminada.');}finally{button.disabled=false;}}));
  $('editor-form').addEventListener('submit',event=>{event.preventDefault();runHandler(async()=>{
    if(state.busy||state.running||!state.editing)return;const epoch=state.generation;state.busy=true;$('save-editor').disabled=true;$('cancel-editor').disabled=true;$('editor-error').textContent='';
    try{const saved=await state.editing();assertSession(epoch);if(saved!==false){$('editor').close();state.uploads=[];state.editing=null;await loadData();}}
    catch(error){if(epoch===state.generation)$('editor-error').textContent=errorMessage(error);else throw error;}
    finally{if(epoch===state.generation){state.busy=false;$('save-editor').disabled=false;$('cancel-editor').disabled=false;}}
  });});
  function cancelEditor() {if(state.busy)return;$('editor').close();state.editing=null;state.uploads=[];$('editor-body').replaceChildren();}
  $('close-editor').addEventListener('click',cancelEditor);$('cancel-editor').addEventListener('click',cancelEditor);
  $('editor').addEventListener('cancel',event=>{if(state.busy)event.preventDefault();});
  $('confirm-review').addEventListener('click',()=>closeReview(true));$('cancel-review').addEventListener('click',()=>closeReview(false));$('close-review').addEventListener('click',()=>closeReview(false));$('review').addEventListener('cancel',event=>{event.preventDefault();closeReview(false);});
  root.addEventListener('unhandledrejection',event=>{if(event.reason?.name==='AbortError'){event.preventDefault();}});
  root.GFCollectionsLifecycle = { status:()=>state.running||(state.busy&&state.verified)?'busy':$('editor').open?'dirty':'' };
  root.addEventListener('pagehide',event=>{if(event.persisted)return;unwatchWallet();controller.abort();state.generation++;state.stop=true;if(reviewResolve){reviewResolve(false);reviewResolve=null;}});
  watchWallet(getWallet());
  if(state.wallet)connect(true);
})(typeof window === 'undefined' ? null : window);
