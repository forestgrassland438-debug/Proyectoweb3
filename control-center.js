(function (root) {
  'use strict';
  const ui = root.GFAdminUI, session = root.GFAdminSession, $ = id => document.getElementById(id);
  const icons = {
    overview:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    missions:'<path d="M7 4h10v17l-5-3-5 3V4Z"/><path d="M9 3h6v3H9zM10 10h4m-4 4h4"/>',
    players:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a6 6 0 0 1 3 5v2"/>',
    collections:'<rect x="3" y="3" width="14" height="14" rx="2"/><path d="m6 13 3-3 2 2 3-4M7 21h12a2 2 0 0 0 2-2V7"/>',
    weather:'<path d="M7 16a4 4 0 1 1 0-8 5 5 0 0 1 9 1 3.5 3.5 0 1 1 1 7H7ZM7 19v2m5-2v2m5-2v2M5 2v2m-4 4h2m8-6-1 2"/>',
    reports:'<path d="m12 3 8 3v6c0 5-8 10-8 10S4 17 4 12V6l8-3Z"/><path d="M12 8v5m0 3h.01"/>',
    contract:'<path d="M4 21V3h14v18H4ZM8 7h6M8 11h6M8 15h2m3 0h1M8 18h6"/>',
    access:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
    errors:'<path d="m12 3 10 18H2L12 3ZM12 9v5m0 3h.01"/>',
    treasury:'<path d="M3 10h18L12 4 3 10ZM5 10v8m4.67-8v8m4.66-8v8M19 10v8M3 21h18"/>',
    // (2026-10-26) La economía: una línea que sube sobre sus ejes.
    economy:'<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
    // (2026-10-27) La auditoría: una lista y una lupa.
    audit:'<path d="M4 6h9M4 10h6M4 14h4"/><circle cx="15.5" cy="14.5" r="4"/><path d="m18.5 17.5 3 3"/>',
    // (2026-10-28) Los precios: una etiqueta de precio.
    prices:'<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z"/><circle cx="8" cy="8" r="1.6"/>',
    // (2026-11-10) La red: tres nodos unidos.
    network:'<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7.5 6h9M6.3 8.2l4.4 7.6m7-7.6-4.4 7.6"/>',
    // (2026-11-19) El respaldo de la cuenta en la cadena: dos eslabones.
    chain:'<path d="M9.5 14.5 14.5 9.5"/><path d="M8 11 5.5 13.5a3.5 3.5 0 0 0 5 5L13 16"/><path d="M16 13l2.5-2.5a3.5 3.5 0 0 0-5-5L11 8"/>'
  };
  const svg = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[name]+'</svg>';
  /* (2026-11-19) ORDENADO Y SIN REPETIDOS. "Quita las cosas repetidas, ordena todo y si
     una era repetida y con más opciones, únelas para no perder esas opciones."
     Lo que se solapaba va JUNTO en una entrada con pestañas, y cada pestaña es la página
     de siempre (no se pierde ninguna opción):
       · Players & accounts      = Players & economy (admin.html) + Accounts & identity (cuentas.html)
       · Economy & treasuries    = Economy supervisor (economia.html) + Treasury & incentives (tesoro.html)
       · Items, prices & tables  = Shop & P2P prices (precios.html) + Crops & tables (cultivos.html) + Resources & capacity (recursos.html)
     Los ids de las pestañas (tesoro, cuentas, cultivos, recursos) siguen valiendo en los
     enlaces (#tesoro) y en los botones data-open-tool. La primera pestaña es la página que
     ya abría esa entrada (las pruebas del navegador cuentan con ello). */
  const tools = [
    { id:'misiones', file:'misiones.html', name:'Missions', icon:'missions', group:'Game control', text:'Build daily quests and balance their rewards.' },
    { id:'climas', file:'climas.html', name:'World & weather', icon:'weather', group:'Game control', text:'Control weather, seasons and the world clock.' },
    { id:'admin', file:'admin.html', name:'Players & accounts', icon:'players', group:'Players', text:'Manage players, farming, economy and rankings, and the private directory of wallets, names, verified emails, login methods and activity.',
      tabs:[ { file:'admin.html', name:'Players & economy' }, { id:'cuentas', file:'cuentas.html', name:'Accounts & identity' } ] },
    { id:'consola-reportes', file:'consola-reportes.html', name:'Player reports', icon:'reports', group:'Players', text:'Review player reports and moderation cases.' },
    { id:'puerta-login', file:'puerta_login.html', name:'Access & permissions', icon:'access', group:'Players', text:'Manage the whitelist and game entry rules.' },
    // (2026-10-26) Los dos tesoros, el precio del oro, la inflación y las compras con zkLTC; (2026-10-22) el tesoro circular y sus monedas.
    { id:'economia', file:'economia.html', name:'Economy & treasuries', icon:'economy', group:'Economy', text:'Two treasuries, protected reserves, the automatic supervisor, payment review, price limits and Gold top-ups; the circular treasury and the coin drops for free and VIP players.',
      tabs:[ { file:'economia.html', name:'Supervisor & treasuries' }, { id:'tesoro', file:'tesoro.html', name:'Treasury & incentives' } ] },
    // (2026-10-28) Precios de la tienda y del P2P; las plantas y sus tablas; la capacidad de las tablas.
    { id:'precios', file:'precios.html', name:'Items, prices & tables', icon:'prices', group:'Economy', text:'Shop and P2P prices with inflation and demand, default prices in Gold, Silver or Bronze; plants, levels and tables; global table capacity and respawn.',
      tabs:[ { file:'precios.html', name:'Shop & P2P prices' }, { id:'cultivos', file:'cultivos.html', name:'Crops & tables' }, { id:'recursos', file:'recursos.html', name:'Resources & capacity' } ] },
    // (2026-10-27) Quién compró y vendió y si pagó, los fallos de la tienda y del P2P, el explorador del suelo y los intentos.
    { id:'auditoria', file:'auditoria.html', name:'Shop & drop audit', icon:'audit', group:'Economy', text:'Who bought and sold, what it cost and if it was paid; shop and P2P errors; who picked up each drop and from whom; drop bans and level attempts.' },
    { id:'colecciones', file:'colecciones.html', name:'Collections', icon:'collections', group:'Blockchain', text:'Create collections and manage NFT distribution.' },
    // (2026-11-19) La cuenta de cada jugador respaldada en el contrato (cuenta-en-cadena.js del servidor).
    { id:'cuenta-cadena', file:'cuenta-cadena.html', name:'Chain backup', icon:'chain', group:'Blockchain', text:'Tutorial, skills, missions, ranking, friends, invites and Lands kept on the contract, plus encrypted private messages, Google sign-in wallets and profiles; compare, restore and recover after a wipe.' },
    { id:'contrato-stats', file:'contrato-stats.html', name:'Contract analytics', icon:'contract', group:'Blockchain', text:'Read invoices, contract activity and gas usage.' },
    // (2026-11-10) La red de la cadena: RPC, explorador, contratos y la migración a mainnet.
    { id:'red', file:'red.html', name:'Network & RPC', icon:'network', group:'Blockchain', text:'Change the RPC, explorer and contracts used by the server, the game, the shop, the login and the wallets; test them first, and migrate from testnet to mainnet.' },
    { id:'reporter', file:'reporter.html', name:'Error monitoring', icon:'errors', group:'System', text:'Investigate client errors and relay failures.' }
  ];
  // Cada entrada con su lista de pestañas (las sencillas, una) y los alias de las pestañas.
  tools.forEach(tool => { if (!tool.tabs) tool.tabs = [{ file:tool.file, name:tool.name }]; tool.tabs.forEach((tab,i) => { tab.id = tab.id || (i ? tool.id+'-'+i : tool.id); }); });
  const aliases = new Map();
  tools.forEach(tool => tool.tabs.forEach((tab,i) => aliases.set(tab.id,{ tool:tool.id, tab:i })));
  const resolve = id => aliases.get(id) || { tool:id, tab:0 };
  let activeTab = 0;
  let verified = false, active = 'overview', frame = null, loading = false, dataLoading = false, snapshot = null;
  let renewalTimer = null, frameTimer = null, retryTimer = null, presenceTimer = null, requestRevision = 0;
  let destroyed = false, wallet = null, account = '';
  root.GFAdminWorkspace = Object.freeze({ version:1 });
  const t = text => ui.t(text), short = a => a.slice(0,6)+'…'+a.slice(-4);
  function text(el, value) { el.textContent = value; }
  function message(value, isError = false) { text($('cc-gate-message'),t(value)); $('cc-gate-message').dataset.error = String(isError); }
  function gate(reason) {
    verified = false; requestRevision++; clearTimeout(renewalTimer); clearTimeout(frameTimer); clearTimeout(retryTimer); clearTimeout(presenceTimer);
    if (frame) { frame.remove(); frame = null; }
    $('cc-app').hidden = true; $('cc-gate').hidden = false; $('cc-tool-dirty').hidden = true;
    $('cc-account').textContent = ''; snapshot = null;
    $('cc-connect').disabled = false;
    if (reason) message(reason,true);
  }
  function authError(e) {
    if (e?.code === 4001) return 'Signature rejected.';
    if (e?.code === 'not_admin' || e?.status === 403) return 'Your wallet is not an administrator.';
    if (e?.status === 503 || e?.status === 429) return 'The API could not verify your role. Retry verification without signing again.';
    if (e?.status === 401) return 'Your session expired. Connect again.';
    if (e?.name === 'AbortError') return 'Requests were cancelled because the session changed.';
    if (e instanceof TypeError) return 'Connection unavailable. Check that your backend is running.';
    return e?.message || 'Session could not be verified.';
  }
  function armRenewal() {
    clearTimeout(renewalTimer);
    if (!verified || destroyed) return;
    renewalTimer = setTimeout(async () => {
      if (document.visibilityState === 'visible') {
        try { await session.refresh(); }
        catch (e) { if (e.status === 401 || e.status === 403) { session.invalidate('session_expired'); return; } }
      }
      armRenewal();
    },240000);
  }
  async function verify(interactive = false) {
    $('cc-connect').disabled = true; $('cc-retry').hidden = true; clearTimeout(retryTimer);
    try {
      const data = interactive ? await session.signIn(value => message(value)) : await session.request('/api/admin/whoami');
      if (!/^0x[0-9a-f]{40}$/i.test(data.address || '')) throw new Error('This account has no administrator permission.');
      const provider = session.provider();
      if (provider?.request) {
        const accounts = await provider.request({method:'eth_accounts'});
        if (accounts?.length && accounts[0].toLowerCase() !== data.address.toLowerCase()) throw new Error('The session and wallet do not match.');
      }
      await session.getCsrf();
      account = data.address.toLowerCase(); verified = true;
      $('cc-gate').hidden = true; $('cc-app').hidden = false;
      $('cc-account').textContent = short(account); $('cc-account').title = account;
      watchWallet(provider); armRenewal(); armPresence();
      const target = location.hash.slice(1);
      activate(aliases.has(target) ? target : 'overview',false);
      refreshData();
    } catch (e) {
      gate();
      if (!interactive && e.status === 401) message('Connect your administrator wallet to continue.');
      else message(authError(e),true);
      if ([429,503].includes(e.status)) {
        $('cc-retry').hidden = false; $('cc-retry').disabled = true;
        retryTimer = setTimeout(() => { $('cc-retry').disabled = false; },e.retryAfterMs || 30000);
      }
    } finally { $('cc-connect').disabled = false; }
  }
  function watchWallet(provider) {
    if (wallet === provider) return;
    if (wallet?.removeListener) wallet.removeListener('accountsChanged',accountChanged);
    wallet = provider; wallet?.on?.('accountsChanged',accountChanged);
  }
  function accountChanged(accounts) {
    if (verified && accounts?.[0]?.toLowerCase() !== account) session.invalidate('account_changed');
  }
  function renderNavigation() {
    const nav = $('cc-nav'); nav.replaceChildren();
    const make = (id,name,icon,index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'cc-nav-item'; button.dataset.tool = id;
      button.innerHTML = svg(icon)+'<span></span><b>'+(index || '00')+'</b>'; button.querySelector('span').textContent = t(name);
      button.classList.toggle('active',active === id); if (active === id) button.setAttribute('aria-current','page');
      button.addEventListener('click',() => activate(id)); nav.append(button);
    };
    make('overview','Overview','overview','00');
    let group = '';
    tools.forEach((tool,i) => {
      if (tool.group !== group) { group = tool.group; const label = document.createElement('div'); label.className = 'cc-nav-group'; label.textContent = t(group); nav.append(label); }
      make(tool.id,tool.name,tool.icon,String(i+1).padStart(2,'0'));
    });
    filterTools();
  }
  function renderTools() {
    const container = $('cc-tools'); container.replaceChildren();
    tools.forEach((tool,i) => {
      const card = document.createElement('button'); card.className = 'cc-tool-card'; card.type = 'button'; card.dataset.openTool = tool.id;
      card.innerHTML = '<span class="cc-tool-card-head"><span class="cc-tool-icon">'+svg(tool.icon)+'</span><span>'+String(i+1).padStart(2,'0')+'</span></span><h3></h3><p></p><span class="cc-card-link"><span></span><span aria-hidden="true">↗</span></span>';
      card.querySelector('h3').textContent = t(tool.name); card.querySelector('p').textContent = t(tool.text); card.querySelector('.cc-card-link>span').textContent = t('Open tool');
      container.append(card);
    });
  }
  function filterTools() {
    const query = $('cc-search').value.trim().toLocaleLowerCase(); let count = 0;
    document.querySelectorAll('[data-tool]').forEach(button => {
      const tool = tools.find(x => x.id === button.dataset.tool);
      // Las pestañas también se encuentran por su nombre (p. ej. "tesoro" o "cuentas").
      const tabs = (tool?.tabs || []).map(x => x.name+' '+t(x.name)+' '+x.id).join(' ');
      button.hidden = !!query && !(button.textContent+' '+(tool?.text || '')+' '+t(tool?.text || '')+' '+tabs).toLocaleLowerCase().includes(query);
      if (!button.hidden) count++;
    });
    document.querySelectorAll('.cc-nav-group').forEach(label => {
      let next = label.nextElementSibling, visible = false;
      while (next && !next.classList.contains('cc-nav-group')) { if (!next.hidden) visible = true; next = next.nextElementSibling; }
      label.hidden = !visible;
    });
    $('cc-no-tools').hidden = count > 0;
  }
  function canLeave() {
    if (!frame) return true;
    try { return frame.contentWindow.GFAdminUI?.canLeave() ?? root.confirm(t('The tool is still loading.')+' '+t('Go back')+'?'); }
    catch (_) { return root.confirm(t('Leave this tool and discard unsaved changes?')); }
  }
  /** La barra de pestañas de la entrada abierta (solo si tiene más de una). */
  function renderTabs(tool) {
    const bar = $('cc-tool-tabs'); if (!bar) return;
    bar.replaceChildren();
    bar.hidden = !tool || tool.tabs.length < 2;
    if (bar.hidden) return;
    tool.tabs.forEach((tab,i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'cc-tool-tab'; b.setAttribute('role','tab');
      b.textContent = t(tab.name); b.setAttribute('aria-selected',String(i === activeTab)); b.classList.toggle('active',i === activeTab);
      b.addEventListener('click',() => activate(tab.id)); bar.append(b);
    });
  }
  function breadcrumb(tool) {
    const tab = tool && tool.tabs[activeTab];
    return t(tool?.name || 'Overview') + (tool && tool.tabs.length > 1 && tab ? ' · '+t(tab.name) : '');
  }
  function activate(id, ask = true) {
    const destino = resolve(id);
    if (!verified || (active === destino.tool && activeTab === destino.tab && frame)) return;
    if (ask && !canLeave()) return;
    clearTimeout(frameTimer); if (frame) { frame.remove(); frame = null; }
    active = destino.tool; activeTab = destino.tab; loading = false;
    const tool = tools.find(x => x.id === active);
    const tab = tool ? (tool.tabs[activeTab] || tool.tabs[0]) : null;
    $('cc-overview').hidden = !!tool; $('cc-tool-area').hidden = !tool; $('cc-tool-dirty').hidden = true;
    text($('cc-breadcrumb'),breadcrumb(tool));
    const url = new URL(location.href); url.hash = tab ? tab.id : 'overview'; history.replaceState(null,'',url.href);
    renderNavigation(); renderTabs(tool); closeNav();
    if (!tool) { armPresence(); return; }
    clearTimeout(presenceTimer);
    text($('cc-tool-name'),t(tool.name));
    const source = new URL(tab.file,location.href); source.searchParams.set('lang',ui.language); source.searchParams.set('theme',ui.theme);
    $('cc-original').href = source.href;
    $('cc-frame-status').hidden = false; text($('cc-frame-status'),t('Loading tool…')); loading = true;
    frame = document.createElement('iframe'); frame.title = t(tab.name); frame.referrerPolicy = 'same-origin';
    // The allowlist above is the only source of iframe URLs. No arbitrary page or API URL is accepted.
    frame.src = source.href; const current = frame;
    frame.addEventListener('load',() => {
      if (current !== frame) return;
      clearTimeout(frameTimer); loading = false; $('cc-frame-status').hidden = true;
      try { current.contentWindow.GFAdminUI?.preferences({language:ui.language,theme:ui.theme}); } catch (_) {}
    });
    $('cc-frame-host').append(frame);
    frameTimer = setTimeout(() => { if (current === frame && loading) text($('cc-frame-status'),t('Tool did not finish loading. Open its original page or retry.')); },20000);
  }
  function armPresence() {
    clearTimeout(presenceTimer);
    if (!verified || destroyed || active !== 'overview' || document.visibilityState === 'hidden') return;
    presenceTimer = setTimeout(async () => {
      const revision = requestRevision;
      try {
        const data = await session.request('/api/admin/presencia');
        if (destroyed || !verified || revision !== requestRevision) return;
        snapshot = { ...(snapshot || {}), overview:{ ...(snapshot?.overview || {}), conectados:data.conectados, presencia:data.presencia } };
        renderMetrics();
      } catch (_) {
        if (!destroyed && verified && snapshot?.overview) { snapshot.overview.conectados = null; snapshot.overview.presencia = null; renderMetrics(); }
      } finally { armPresence(); }
    },15000);
  }
  document.addEventListener('visibilitychange',armPresence);
  function renderMetrics() {
    /* (2026-11-25) "Las cuentas creadas en total" salen del CONTRATO (la factura de los
       contadores), no de la base de datos; mientras no exista, la base de datos y lo dice. */
    const d = snapshot?.overview, c = contadores && contadores.existe && contadores.enCadena ? contadores : null;
    const pendientes = c && c.pendiente ? Number(c.pendiente.cuentas) || 0 : 0;
    const total = c ? ['Total accounts',c.enCadena.cuentas,'players','On the contract',pendientes ? ' · +'+pendientes.toLocaleString(ui.language)+' '+t('in the next batch') : '']
      : ['Total accounts',d?.totalCuentas,'players',contadores && contadores.ok !== false && !contadores.existe ? 'Database · not on the contract yet' : 'Live backend data'];
    const metrics = [ total,['Active in 24 hours',d?.activos24h,'overview','Activity snapshot'],['Online now',d?.conectados,'weather',d?.presencia ? 'Game connections · this instance' : 'Presence unavailable'],['New in 7 days',d?.nuevas7d,'collections','Live backend data'] ];
    const container = $('cc-metrics'); container.replaceChildren();
    metrics.forEach(([label,value,icon,caption,extra]) => {
      const article = document.createElement('article'); article.className = 'cc-metric';
      article.innerHTML = '<div class="cc-metric-head"><span></span>'+svg(icon)+'</div><div class="cc-metric-value"></div><div class="cc-metric-foot"></div>';
      article.querySelector('.cc-metric-head>span').textContent = t(label);
      article.querySelector('.cc-metric-value').textContent = value == null ? '—' : Number(value).toLocaleString(ui.language);
      article.querySelector('.cc-metric-foot').textContent = t(caption)+(extra || ''); container.append(article);
    });
    const chart = $('cc-chart'); chart.replaceChildren();
    if (!d) { text(chart,t('No data loaded')); return; }
    const values = [['New accounts in 24 h',d.nuevas24h],['New accounts in 7 d',d.nuevas7d],['Active accounts in 24 h',d.activos24h]];
    const max = Math.max(1,...values.map(row => Number(row[1]) || 0));
    values.forEach(([label,value]) => {
      const row = document.createElement('div'); row.className = 'cc-bar-row';
      row.innerHTML = '<span></span><div class="cc-bar-track"><div class="cc-bar-fill"></div></div><b></b>';
      row.querySelector('span').textContent = t(label); row.querySelector('b').textContent = value == null ? '—' : Number(value).toLocaleString(ui.language);
      row.querySelector('.cc-bar-fill').style.width = Math.max(0,Math.min(100,100*(Number(value)||0)/max))+'%'; chart.append(row);
    });
    const mission = $('cc-mission-state'); mission.replaceChildren();
    for (const npc of ['granjero','guardian']) {
      const days = snapshot?.days?.[npc];
      const item = document.createElement('div'), value = document.createElement('strong'), label = document.createElement('span');
      value.textContent = days ? String(days.length) : '—'; label.textContent = t(npc === 'granjero' ? 'Farmer Joe':'Guardian')+' · '+t('Saved days');
      item.append(value,label); mission.append(item);
    }
  }
  async function refreshData() {
    if (!verified || dataLoading) return;
    dataLoading = true; $('cc-refresh').disabled = true;
    const revision = ++requestRevision;
    try {
      const results = await Promise.allSettled([session.request('/api/admin/overview'),session.request('/api/admin/missions/days/granjero'),session.request('/api/admin/missions/days/guardian')]);
      if (destroyed || !verified || revision !== requestRevision) return;
      const failed = results.some(r => r.status === 'rejected');
      snapshot = { overview:results[0].status === 'fulfilled' ? results[0].value : snapshot?.overview ? { ...snapshot.overview, conectados:null, presencia:null } : null,
        days:{ granjero:results[1].status === 'fulfilled' ? results[1].value.days : snapshot?.days?.granjero, guardian:results[2].status === 'fulfilled' ? results[2].value.days : snapshot?.days?.guardian } };
      $('cc-data-notice').hidden = !failed;
      text($('cc-data-notice'),t(snapshot.overview ? 'Refresh failed. The previous snapshot is still displayed.' : 'Data could not be loaded.'));
      renderMetrics(); text($('cc-updated'),t('Last updated')+' · '+new Date().toLocaleTimeString(ui.language,{hour:'2-digit',minute:'2-digit'}));
    } finally { dataLoading = false; $('cc-refresh').disabled = false; }
    loadRpc();
    loadCuenta();
    loadContadores();
  }
  /* (2026-11-19) EL RESPALDO DE LAS CUENTAS EN LA CADENA, de un vistazo. Va aparte de
     las métricas, como la lectura de la cadena: un servidor sin la ruta (404) no es
     "Refresh failed" sino "falta subir el servidor nuevo". */
  async function loadCuenta() {
    if (!verified) return;
    const revision = requestRevision;
    try {
      const s = await session.request('/api/admin/cuenta-cadena/estado');
      if (destroyed || !verified || revision !== requestRevision) return;
      const j = s.jugadores || {}, m = s.metricas || {};
      text($('cc-cuenta-state'),t(s.config && s.config.activo ? 'Active' : 'Paused')+' · '+(j.sincronizados == null ? '—' : j.sincronizados)+' '+t('players')+' · '+(m.tx || 0)+' '+t('transactions'));
      text($('cc-cuenta-note'),m.ultimoError ? t('Last error')+': '+m.ultimoError : t(s.claveAncla ? 'Accounts are kept on the contract; private messages, Google wallets and profiles go in the encrypted anchor.' : 'Accounts are kept on the contract. The encrypted anchor has no key yet (GF_RESPALDO_CLAVE).'));
    } catch (e) {
      if (e?.name === 'AbortError' || destroyed || !verified) return;
      text($('cc-cuenta-state'),'—');
      text($('cc-cuenta-note'),t(e.status === 404 ? 'The game server does not have this module yet: upload the new server2.js and cuenta-en-cadena.js.' : 'The state could not be read.'));
    }
  }
  /* (2026-11-25) LOS CONTADORES DEL CONTRATO. "Las tx minadas deben guardarse en el contrato
     mismo, no en la base de datos; así mismo las cuentas creadas en total." El servidor los
     escribe por lotes (cada 10 minutos) en una factura suya: cta_contadores · ct:contrato.
     Aquí se leen, se ve lo que espera al próximo lote y se puede escribir el lote ya. */
  const NOTA_CONTADORES = 'Accounts created and mined transactions are written to the contract itself, in batches every 10 minutes, so a database wipe does not lose them.';
  let contadores = null, contadoresBusy = false, contadoresMsg = null;
  const numero = v => v == null || v === '' || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString(ui.language);
  const fechaHora = v => { const f = v ? new Date(v) : null; return f && !isNaN(f) ? f.toLocaleString(ui.language,{ dateStyle:'short', timeStyle:'short' }) : '—'; };
  function enlaceLote(c) {
    const hash = c && c.ultimoLote && c.ultimoLote.hash;
    if (!hash || !/^0x[0-9a-f]{64}$/i.test(hash) || !c.explorador) return null;
    try {
      const u = new URL(String(c.explorador));
      if (u.protocol !== 'https:' && !(u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) return null;
      return u.href.replace(/\/+$/,'')+'/tx/'+hash;
    } catch (_) { return null; }
  }
  function mensajeContadores(e) {
    if (e.status === 404) return 'The game server does not have the counters yet: upload the new server2.js and cuenta-en-cadena.js.';
    if (e.code === 'contadores_factura_rota' || e.code === 'contadores_factura_ajena') return 'The counters invoice on the contract is damaged; nothing is written over it.';
    return null;
  }
  function renderContadores() {
    const c = contadores, e = c && c.existe ? c.enCadena : null, p = c && c.pendiente;
    const values = $('cc-contadores-values'); values.replaceChildren();
    [['Accounts created',e?.cuentas],['Mined transactions',e?.txMinadas],['Successful',e?.txExito],['Reverted',e?.txRevertidas],['Batches written',e?.lotes]].forEach(([label,value]) => {
      const item = document.createElement('div'), strong = document.createElement('strong'), span = document.createElement('span');
      strong.textContent = numero(value); span.textContent = t(label); item.append(strong,span); values.append(item);
    });
    const cada = Math.max(1,Math.round((Number(c && c.cadaMs) || 600000)/60000));
    text($('cc-contadores-state'),!c || c.ok === false ? '—' : (c.activo ? t('Batches every')+' '+cada+' min' : t('Batches paused'))+(c.activo && c.proximoEn ? ' · '+t('Next batch')+' '+fechaHora(c.proximoEn) : ''));
    const parts = [];
    if (c && c.existe) {
      parts.push(t('Invoice')+' #'+c.factura);
      if (e && e.bloque) parts.push(t('Counted up to block')+' '+numero(e.bloque));
      if (c.ultimoLote && c.ultimoLote.en) parts.push(t('Last batch')+' '+fechaHora(c.ultimoLote.en));
    } else if (c && c.ok !== false) parts.push(t('Not written yet')+' — '+t('The first batch creates the counters invoice on the contract.'));
    if (p) {
      const tx = (Number(p.txExito) || 0)+(Number(p.txRevertidas) || 0);
      if (p.cuentas || tx) parts.push(t('Waiting for the next batch')+': +'+numero(p.cuentas || 0)+' '+t('accounts')+', +'+numero(tx)+' '+t('transactions'));
      if (p.esperandoRecibos) parts.push(t('Waiting for receipts')+': '+numero(p.esperandoRecibos));
    }
    text($('cc-contadores-detail'),parts.join(' · '));
    const link = enlaceLote(c), a = $('cc-contadores-lote');
    a.hidden = !link; if (link) a.href = link;
    $('cc-contadores-escribir').disabled = contadoresBusy || !c || c.ok === false;
    text($('cc-contadores-escribir-texto'),t(contadoresBusy ? 'Writing…' : 'Write now'));
    text($('cc-contadores-note'),t(contadoresMsg || NOTA_CONTADORES));
  }
  async function loadContadores(keepMessage) {
    if (!verified) return;
    const revision = requestRevision;
    if (!keepMessage) contadoresMsg = null;
    try {
      const c = await session.request('/api/admin/contadores');
      if (destroyed || !verified || revision !== requestRevision) return;
      contadores = c && typeof c === 'object' ? c : null;
      if (contadores && contadores.ok === false) contadoresMsg = contadores.motivo === 'sin_contrato' ? 'The contract is not configured on the server.' : 'The counters could not be read.';
    } catch (e) {
      if (e?.name === 'AbortError' || destroyed || !verified) return;
      contadores = null;
      contadoresMsg = mensajeContadores(e) || 'The counters could not be read.';
    } finally { $('cc-contadores').setAttribute('aria-busy','false'); }
    renderContadores(); renderMetrics();
  }
  async function writeContadores() {
    if (!verified || contadoresBusy) return;
    const revision = requestRevision;
    contadoresBusy = true; renderContadores();
    try {
      const r = await session.request('/api/admin/contadores/escribir',{ method:'POST', body:'{}' });
      if (destroyed || !verified || revision !== requestRevision) return;
      contadoresMsg = r && r.escrito ? 'Written to the contract.' : r && r.nada ? 'Nothing new to write.'
        : r && r.motivo === 'ocupado' ? 'Another server is writing the counters right now.'
        : r && r.motivo === 'sin_contrato' ? 'The contract is not configured on the server.' : 'The counters could not be written.';
    } catch (e) {
      if (e?.name === 'AbortError' || destroyed || !verified) return;
      contadoresMsg = mensajeContadores(e) || 'The counters could not be written.';
    } finally { contadoresBusy = false; }
    await loadContadores(true);
  }
  /* (2026-10-26) PAUSAR / REANUDAR LA LECTURA DE LA CADENA. El escaneo
     histórico gasta el mismo cupo de RPC que el juego. Va aparte de las
     métricas: un servidor sin la ruta (404) no debe dar "Refresh failed". */
  let rpcBusy = false, rpcState = null;
  function renderRpc(message) {
    const s = rpcState, label = !s ? 'Unknown' : s.activo ? 'Running' : 'Paused';
    text($('cc-rpc-state'),t(label)+(s && s.scan && s.scan.status ? ' · '+s.scan.status : ''));
    $('cc-rpc-pause').disabled = rpcBusy || !s || !s.activo;
    $('cc-rpc-resume').disabled = rpcBusy || !s || !!s.activo;
    if (message) text($('cc-rpc-note'),t(message));
  }
  async function loadRpc() {
    if (!verified) return;
    const revision = requestRevision;
    try {
      const data = await session.request('/api/admin/impact/historico');
      if (destroyed || !verified || revision !== requestRevision) return;
      rpcState = data && typeof data.activo === 'boolean' ? data : null;
      renderRpc();
    } catch (e) {
      if (e?.name === 'AbortError' || destroyed || !verified) return;
      rpcState = null;
      renderRpc(e.status === 404 ? 'The game server does not have this control yet: upload the new server2.js.' : 'The state could not be read.');
    }
  }
  async function setRpc(active) {
    if (!verified || rpcBusy) return;
    const revision=requestRevision;
    rpcBusy = true; renderRpc();
    try {
      const data = await session.request('/api/admin/impact/historico',{ method:'POST', body:JSON.stringify({ activo:active }) });
      if (destroyed || !verified || revision!==requestRevision) return;
      rpcState = data && typeof data.activo === 'boolean' ? data : rpcState;
      rpcBusy = false;
      renderRpc(active ? 'Chain reading resumed. It uses the same RPC quota as the game.' : 'Chain reading paused: the RPC is left for the game.');
    } catch (e) {
      if (revision!==requestRevision) return;
      rpcBusy = false;
      if (e?.name === 'AbortError' || destroyed || !verified) return;
      renderRpc(e.status === 404 ? 'The game server does not have this control yet: upload the new server2.js.' : 'The change could not be saved.');
    }
  }
  function closeNav() { $('cc-navigation').classList.remove('open'); $('cc-nav-shade').hidden = true; $('cc-menu').setAttribute('aria-expanded','false'); }
  function renderPreferences() {
    $('cc-lang').value = ui.language; $('cc-lang-gate').value = ui.language;
    document.querySelectorAll('[data-cc-theme]').forEach(button => { button.textContent = ui.theme === 'dark' ? '☼':'☾'; });
    $('cc-today').textContent = new Intl.DateTimeFormat(ui.language === 'es' ? 'es-EC':'en-US',{dateStyle:'medium',timeZone:'UTC'}).format(new Date())+' · UTC';
    const actual = tools.find(x=>x.id===active);
    renderNavigation(); renderTools(); renderMetrics(); renderContadores(); renderTabs(actual); text($('cc-breadcrumb'),breadcrumb(actual));
    if (frame) {
      const tool = actual; text($('cc-tool-name'),t(tool.name)); frame.title = t((tool.tabs[activeTab] || tool.tabs[0]).name);
      try { frame.contentWindow.GFAdminUI?.preferences({language:ui.language,theme:ui.theme}); } catch (_) {}
      const url = new URL($('cc-original').href); url.searchParams.set('lang',ui.language); url.searchParams.set('theme',ui.theme); $('cc-original').href = url.href;
    }
  }
  $('cc-connect').addEventListener('click',() => verify(true)); $('cc-retry').addEventListener('click',() => verify());
  $('cc-refresh').addEventListener('click',refreshData); $('cc-tool-close').addEventListener('click',() => activate('overview'));
  $('cc-rpc-pause').addEventListener('click',() => setRpc(false)); $('cc-rpc-resume').addEventListener('click',() => setRpc(true));
  $('cc-contadores-escribir').addEventListener('click',writeContadores);
  $('cc-logout').addEventListener('click',async () => {
    if (!canLeave()) return; $('cc-logout').disabled = true;
    try { await session.logout(); gate('Signed out.'); }
    catch (e) { gate(authError(e)); }
    finally { $('cc-logout').disabled = false; }
  });
  document.addEventListener('click',e => { const button = e.target.closest('[data-open-tool]'); if (button) activate(button.dataset.openTool); const a = e.target.closest('a[href="#overview"]'); if (a) { e.preventDefault(); activate('overview'); } });
  $('cc-search').addEventListener('input',filterTools);
  ['cc-lang','cc-lang-gate'].forEach(id => $(id).addEventListener('change',e => ui.preferences({language:e.target.value})));
  document.querySelectorAll('[data-cc-theme]').forEach(button => button.addEventListener('click',() => ui.preferences({theme:ui.theme === 'dark' ? 'light':'dark'})));
  $('cc-menu').addEventListener('click',() => { const open = !$('cc-navigation').classList.contains('open'); $('cc-navigation').classList.toggle('open',open); $('cc-nav-shade').hidden = !open; $('cc-menu').setAttribute('aria-expanded',String(open)); if (open) $('cc-search').focus(); });
  $('cc-nav-shade').addEventListener('click',closeNav);
  document.addEventListener('keydown',e => { if (e.key === 'Escape' && $('cc-navigation').classList.contains('open')) { closeNav(); $('cc-menu').focus(); } });
  root.addEventListener('gf-admin-preferences',renderPreferences);
  root.addEventListener('gf-admin-tool-dirty',e => { $('cc-tool-dirty').hidden = !e.detail.dirty; });
  root.addEventListener('beforeunload',e => { try { if (frame?.contentWindow.GFAdminUI?.dirty) { e.preventDefault(); e.returnValue = ''; } } catch (_) {} });
  const unsubscribe = session.subscribe(reason => {
    if (!verified) return;
    gate(reason === 'account_changed' ? 'The wallet account changed. Connect again.' : reason === 'signed_out' ? 'Signed out.' : 'Your session expired. Connect again.');
  });
  root.addEventListener('pagehide',e => { if (e.persisted) return; destroyed = true; requestRevision++; clearTimeout(renewalTimer); clearTimeout(frameTimer); clearTimeout(retryTimer); clearTimeout(presenceTimer); unsubscribe(); wallet?.removeListener?.('accountsChanged',accountChanged); });
  root.addEventListener('pageshow',e => { if (e.persisted && verified) { armRenewal(); armPresence(); session.request('/api/admin/whoami').catch(err => { if ([401,403].includes(err.status)) gate(authError(err)); }); } });
  renderPreferences(); verify();
})(window);
