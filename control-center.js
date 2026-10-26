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
    treasury:'<path d="M3 10h18L12 4 3 10ZM5 10v8m4.67-8v8m4.66-8v8M19 10v8M3 21h18"/>'
  };
  const svg = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[name]+'</svg>';
  const tools = [
    { id:'misiones', file:'misiones.html', name:'Missions', icon:'missions', group:'Game control', text:'Build daily quests and balance their rewards.' },
    { id:'admin', file:'admin.html', name:'Players & economy', icon:'players', group:'Game control', text:'Manage players, farming, economy and rankings.' },
    { id:'climas', file:'climas.html', name:'World & weather', icon:'weather', group:'Game control', text:'Control weather, seasons and the world clock.' },
    { id:'tesoro', file:'tesoro.html', name:'Treasury & incentives', icon:'treasury', group:'Game control', text:'See the 1.5% fee treasury and tune the coin drops for free and VIP players.' },
    { id:'colecciones', file:'colecciones.html', name:'Collections', icon:'collections', group:'Assets', text:'Create collections and manage NFT distribution.' },
    { id:'consola-reportes', file:'consola-reportes.html', name:'Player reports', icon:'reports', group:'Moderation', text:'Review player reports and moderation cases.' },
    { id:'puerta-login', file:'puerta_login.html', name:'Access & permissions', icon:'access', group:'Moderation', text:'Manage the whitelist and game entry rules.' },
    { id:'contrato-stats', file:'contrato-stats.html', name:'Contract analytics', icon:'contract', group:'System', text:'Read invoices, contract activity and gas usage.' },
    { id:'reporter', file:'reporter.html', name:'Error monitoring', icon:'errors', group:'System', text:'Investigate client errors and relay failures.' }
  ];
  let verified = false, active = 'overview', frame = null, loading = false, dataLoading = false, snapshot = null;
  let renewalTimer = null, frameTimer = null, retryTimer = null, requestRevision = 0;
  let destroyed = false, wallet = null, account = '';
  root.GFAdminWorkspace = Object.freeze({ version:1 });
  const t = text => ui.t(text), short = a => a.slice(0,6)+'…'+a.slice(-4);
  function text(el, value) { el.textContent = value; }
  function message(value, isError = false) { text($('cc-gate-message'),t(value)); $('cc-gate-message').dataset.error = String(isError); }
  function gate(reason) {
    verified = false; requestRevision++; clearTimeout(renewalTimer); clearTimeout(frameTimer); clearTimeout(retryTimer);
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
      watchWallet(provider); armRenewal();
      const target = location.hash.slice(1);
      activate(tools.some(tool => tool.id === target) ? target : 'overview',false);
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
      button.hidden = !!query && !(button.textContent+' '+(tool?.text || '')+' '+t(tool?.text || '')).toLocaleLowerCase().includes(query);
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
  function activate(id, ask = true) {
    if (!verified || (active === id && frame)) return;
    if (ask && !canLeave()) return;
    clearTimeout(frameTimer); if (frame) { frame.remove(); frame = null; }
    active = id; loading = false;
    const tool = tools.find(x => x.id === id);
    $('cc-overview').hidden = !!tool; $('cc-tool-area').hidden = !tool; $('cc-tool-dirty').hidden = true;
    text($('cc-breadcrumb'),t(tool?.name || 'Overview'));
    const url = new URL(location.href); url.hash = id; history.replaceState(null,'',url.href);
    renderNavigation(); closeNav();
    if (!tool) return;
    text($('cc-tool-name'),t(tool.name));
    const source = new URL(tool.file,location.href); source.searchParams.set('lang',ui.language); source.searchParams.set('theme',ui.theme);
    $('cc-original').href = source.href;
    $('cc-frame-status').hidden = false; text($('cc-frame-status'),t('Loading tool…')); loading = true;
    frame = document.createElement('iframe'); frame.title = t(tool.name); frame.referrerPolicy = 'same-origin';
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
  function renderMetrics() {
    const d = snapshot?.overview, metrics = [ ['Total accounts',d?.totalCuentas,'players','Live backend data'],['Active in 24 hours',d?.activos24h,'overview','Activity snapshot'],['Online now',d?.conectados,'weather','Activity snapshot'],['New in 7 days',d?.nuevas7d,'collections','Live backend data'] ];
    const container = $('cc-metrics'); container.replaceChildren();
    metrics.forEach(([label,value,icon,caption]) => {
      const article = document.createElement('article'); article.className = 'cc-metric';
      article.innerHTML = '<div class="cc-metric-head"><span></span>'+svg(icon)+'</div><div class="cc-metric-value"></div><div class="cc-metric-foot"></div>';
      article.querySelector('.cc-metric-head>span').textContent = t(label);
      article.querySelector('.cc-metric-value').textContent = value == null ? '—' : Number(value).toLocaleString(ui.language);
      article.querySelector('.cc-metric-foot').textContent = t(caption); container.append(article);
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
      snapshot = { overview:results[0].status === 'fulfilled' ? results[0].value : snapshot?.overview,
        days:{ granjero:results[1].status === 'fulfilled' ? results[1].value.days : snapshot?.days?.granjero, guardian:results[2].status === 'fulfilled' ? results[2].value.days : snapshot?.days?.guardian } };
      $('cc-data-notice').hidden = !failed;
      text($('cc-data-notice'),t(snapshot.overview ? 'Refresh failed. The previous snapshot is still displayed.' : 'Data could not be loaded.'));
      renderMetrics(); text($('cc-updated'),t('Last updated')+' · '+new Date().toLocaleTimeString(ui.language,{hour:'2-digit',minute:'2-digit'}));
    } finally { dataLoading = false; $('cc-refresh').disabled = false; }
    loadRpc();
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
    rpcBusy = true; renderRpc();
    try {
      const data = await session.request('/api/admin/impact/historico',{ method:'POST', body:JSON.stringify({ activo:active }) });
      if (destroyed || !verified) return;
      rpcState = data && typeof data.activo === 'boolean' ? data : rpcState;
      rpcBusy = false;
      renderRpc(active ? 'Chain reading resumed. It uses the same RPC quota as the game.' : 'Chain reading paused: the RPC is left for the game.');
    } catch (e) {
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
    renderNavigation(); renderTools(); renderMetrics(); text($('cc-breadcrumb'),t(tools.find(x=>x.id===active)?.name || 'Overview'));
    if (frame) {
      const tool = tools.find(x=>x.id===active); text($('cc-tool-name'),t(tool.name)); frame.title = t(tool.name);
      try { frame.contentWindow.GFAdminUI?.preferences({language:ui.language,theme:ui.theme}); } catch (_) {}
      const url = new URL($('cc-original').href); url.searchParams.set('lang',ui.language); url.searchParams.set('theme',ui.theme); $('cc-original').href = url.href;
    }
  }
  $('cc-connect').addEventListener('click',() => verify(true)); $('cc-retry').addEventListener('click',() => verify());
  $('cc-refresh').addEventListener('click',refreshData); $('cc-tool-close').addEventListener('click',() => activate('overview'));
  $('cc-rpc-pause').addEventListener('click',() => setRpc(false)); $('cc-rpc-resume').addEventListener('click',() => setRpc(true));
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
  root.addEventListener('pagehide',e => { if (e.persisted) return; destroyed = true; requestRevision++; clearTimeout(renewalTimer); clearTimeout(frameTimer); clearTimeout(retryTimer); unsubscribe(); wallet?.removeListener?.('accountsChanged',accountChanged); });
  root.addEventListener('pageshow',e => { if (e.persisted && verified) { armRenewal(); session.request('/api/admin/whoami').catch(err => { if ([401,403].includes(err.status)) gate(authError(err)); }); } });
  renderPreferences(); verify();
})(window);
