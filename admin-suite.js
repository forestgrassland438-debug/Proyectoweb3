(function (root) {
  'use strict';
  if (root.GFAdminUI) return;
  const params = new URLSearchParams(location.search), html = document.documentElement;
  let embedded = false;
  try { embedded = root.parent !== root && root.parent.location.origin === location.origin && !!root.parent.GFAdminWorkspace; } catch (_) {}
  let language = params.get('lang') === 'en' ? 'en' : 'es';
  let theme = ['dark','light'].includes(params.get('theme')) ? params.get('theme')
    : ['dark','light'].includes(html.dataset.theme) ? html.dataset.theme
    : matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  let dirty = false, guard = null, disposed = false, raf = 0;
  const formBaselines = new Map();
  const originalText = new WeakMap(), originalAttributes = new WeakMap(), jobs = new Set();
  const page = location.pathname.split('/').pop().replace('.html','');
  const translate = value => root.GFAdminI18n.translate(value, language);
  const preserved = 'script,style,textarea,svg,pre,code,[data-no-translate],.mono,.addr,.rep-det,.rep-target,.msg-main,.msg-sub,.name-cell,.collection-info h3,.token-info h3,.activity-item b,.activity-item strong,#editor-title,.prev-m';
  function eligible(element) {
    if (!element || element.closest(preserved)) return false;
    if (element.closest('td') && !element.closest('button,.tag,.pill,.empty')) return false;
    if (element.closest('.kv .v,.fact .v,#dName,#file-title,.mission-preview-content')) return false;
    return true;
  }
  function textNode(node) {
    if (!eligible(node.parentElement) || !node.nodeValue.trim()) return;
    const previous = originalText.get(node);
    const source = previous && previous.rendered === node.nodeValue ? previous.source : node.nodeValue;
    const rendered = translate(source);
    originalText.set(node, { source, rendered });
    if (node.nodeValue !== rendered) node.nodeValue = rendered;
  }
  function visit(container) {
    if (container.nodeType === Node.TEXT_NODE) { textNode(container); return; }
    if (container.nodeType !== Node.ELEMENT_NODE || container.closest('script,style,svg,pre,code,[data-no-translate]')) return;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node; while ((node = walker.nextNode())) textNode(node);
    const elements = [container, ...container.querySelectorAll('[placeholder],[title],[aria-label]')];
    elements.forEach(el => {
      if (!eligible(el)) return;
      const previous = originalAttributes.get(el) || {};
      ['placeholder','title','aria-label'].forEach(key => {
        if (!el.hasAttribute(key)) return;
        const current = el.getAttribute(key), last = previous[key];
        const source = last && last.rendered === current ? last.source : current;
        const rendered = translate(source);
        previous[key] = { source, rendered };
        if (current !== rendered) el.setAttribute(key, rendered);
      });
      originalAttributes.set(el, previous);
    });
  }
  const observer = new MutationObserver(records => {
    for (const rec of records) {
      if (rec.type === 'characterData') jobs.add(rec.target);
      else if (rec.type === 'attributes') jobs.add(rec.target);
      else rec.addedNodes.forEach(node => jobs.add(node));
    }
    if (!raf && jobs.size) raf = requestAnimationFrame(flush);
  });
  function watch() { observer.observe(document.body, { subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['placeholder','title','aria-label'] }); }
  function flush() {
    raf = 0; observer.disconnect();
    jobs.forEach(node => { if (node.isConnected) visit(node); }); jobs.clear();
    if (!disposed) watch();
  }
  function preferences(next = {}, notify = true) {
    language = next.language === 'en' ? 'en' : next.language === 'es' ? 'es' : language;
    theme = next.theme === 'light' ? 'light' : next.theme === 'dark' ? 'dark' : theme;
    html.lang = language; html.dataset.theme = theme; html.dataset.adminSuite = '';
    const titles = {'control-center':'Control center',admin:'Players & economy',colecciones:'Collections',climas:'World & weather','consola-reportes':'Player reports','contrato-stats':'Contract analytics',misiones:'Missions',puerta_login:'Access & permissions',reporter:'Error monitoring',tesoro:'Treasury & incentives'};
    if (titles[page]) document.title = 'Grassland Forest · '+translate(titles[page]);
    const select = document.getElementById('suite-language'); if (select) select.value = language;
    const button = document.getElementById('suite-theme'); if (button) button.textContent = theme === 'dark' ? '☼' : '☾';
    observer.disconnect(); visit(document.body); watch();
    const url = new URL(location.href); url.searchParams.set('lang',language); url.searchParams.set('theme',theme);
    history.replaceState(null,'',url.href);
    document.querySelectorAll('[data-suite-home]').forEach(a => { a.href = './control-center.html?lang=' + language + '&theme=' + theme; });
    if (notify) root.dispatchEvent(new CustomEvent('gf-admin-preferences', { detail:{ language,theme } }));
  }
  function markDirty(value) {
    dirty = !!value;
    document.querySelectorAll('[data-suite-dirty]').forEach(el => { el.dataset.dirty = String(dirty); el.textContent = translate(dirty ? 'Unsaved changes' : 'No changes pending'); });
    if (embedded) root.parent.dispatchEvent(new CustomEvent('gf-admin-tool-dirty', { detail:{ dirty } }));
  }
  function lifecycleStatus() {
    return root.GFCollectionsLifecycle?.status() || root.GFAdminPlayerLifecycle?.status() || root.GFAccessLifecycle?.status() || root.GFWeatherLifecycle?.status() || root.GFTreasuryLifecycle?.status() || '';
  }
  function formSnapshot(prefix) {
    return JSON.stringify([...document.querySelectorAll('input[id^="'+prefix+'"],select[id^="'+prefix+'"],textarea[id^="'+prefix+'"]'+(prefix === 'farm' ? ',input[data-seed]':''))].map(el => [el.id,el.type === 'checkbox' ? el.checked : el.value]));
  }
  function formDirty() { return [...formBaselines].some(([prefix,value]) => formSnapshot(prefix) !== value); }
  function updateFormDirty() { if (page !== 'misiones') markDirty(formDirty() || lifecycleStatus() === 'dirty'); }
  function status() { return guard?.() || lifecycleStatus() || (formDirty() ? 'dirty':''); }
  function canLeave() {
    const current = status();
    if (current === 'busy') { root.alert(translate('This tool has a pending transaction. Wait for it to finish.')); return false; }
    return !(dirty || current === 'dirty') || root.confirm(translate('Leave this tool and discard unsaved changes?'));
  }
  function download(name, data, type = 'application/json') {
    const url = URL.createObjectURL(new Blob([typeof data === 'string' ? data : JSON.stringify(data,null,2)], { type }));
    const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  root.GFAdminUI = { t:translate, preferences, markDirty, canLeave, registerGuard(fn) { guard = fn; },
    get language() { return language; }, get theme() { return theme; }, get dirty() { return dirty || ['dirty','busy'].includes(status()); }, embedded, download,
    csvCell(value) { let s = String(value ?? ''); if (/^[\s\u0000-\u0020]*[=+@-]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g,'""') + '"'; } };
  // Localize native confirmation text without changing the response or any typed confirmation token.
  const nativeConfirm = root.confirm.bind(root), nativePrompt = root.prompt.bind(root), nativeAlert = root.alert.bind(root);
  root.confirm = message => nativeConfirm(translate(message));
  root.prompt = (message,initial) => nativePrompt(translate(message),initial);
  root.alert = message => nativeAlert(translate(message));
  html.dataset.adminSuite = ''; html.classList.toggle('suite-embedded',embedded); document.body.dataset.suitePage = page;
  if (!document.body.hasAttribute('data-admin-hub')) {
    const bar = document.createElement('div'); bar.className = 'suite-bar';
    bar.innerHTML = '<a class="suite-home" data-suite-home href="./control-center.html"><span class="suite-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 18c-2-9 1-14 13-14 0 12-5 15-13 14Zm0 0L16 8M6 18l-2 3"/></svg></span><span class="suite-name">Grassland Forest</span><span> / </span><span>Control center</span></a><span class="suite-status" data-suite-dirty></span><div class="suite-preferences"><label class="suite-sr" for="suite-language">Language</label><select id="suite-language"><option value="es">Español</option><option value="en">English</option></select><button id="suite-theme" type="button" title="Choose appearance" aria-label="Choose appearance">☼</button></div>';
    document.body.prepend(bar);
    document.getElementById('suite-language').addEventListener('change',e => preferences({ language:e.target.value }));
    document.getElementById('suite-theme').addEventListener('click',() => preferences({ theme:theme === 'dark' ? 'light':'dark' }));
    const legacyTheme = document.getElementById('themeBtn');
    legacyTheme?.addEventListener('click',() => preferences({ theme:html.dataset.theme }));
  }
  preferences({},false); markDirty(false);
  let removeSessionListener = null, watchedWallet = null;
  if (!embedded && !document.body.hasAttribute('data-admin-hub') && root.GFAdminSession) {
    removeSessionListener = root.GFAdminSession.subscribe((reason,previous) => {
      if (!previous?.wasVerified || document.querySelector('.suite-lock')) return;
      const overlay = document.createElement('div'); overlay.className = 'suite-lock'; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true');
      const card = document.createElement('div'), title = document.createElement('h2'), note = document.createElement('p'), button = document.createElement('button');
      title.textContent = translate(reason === 'signed_out' ? 'Signed out.' : reason === 'account_changed' ? 'The wallet account changed. Connect again.' : 'Your session expired. Connect again.');
      note.textContent = translate('Changes are not saved automatically.'); button.type = 'button'; button.textContent = translate('Connect administrator wallet');
      button.addEventListener('click',async () => {
        button.disabled = true;
        try {
          const admin = await root.GFAdminSession.signIn(message => { note.textContent = translate(message); });
          const short = admin.address.slice(0,6)+'…'+admin.address.slice(-4);
          ['adminAddr','whoAddr'].forEach(id => { const el = document.getElementById(id); if (el) { el.textContent = short; el.title = admin.address; } });
          const info = document.getElementById('adminInfo'); if (info) info.textContent = '✓ Admin: '+short;
          const who = document.getElementById('whoami'); if (who) who.textContent = translate('Signed in as')+' '+admin.address;
          overlay.remove();
        } catch (e) { note.textContent = translate(e.message); }
        finally { button.disabled = false; }
      });
      card.append(title,note,button); overlay.append(card); document.body.append(overlay); button.focus();
    });
    if (['misiones','climas','consola-reportes','puerta_login','reporter','tesoro'].includes(page)) {
      watchedWallet = root.GFAdminSession.provider(); watchedWallet?.on?.('accountsChanged',walletChanged);
    }
  }
  function walletChanged() { root.GFAdminSession.invalidate('account_changed'); }
  document.addEventListener('focusin',event => {
    if (page !== 'admin') return;
    const prefix = ['farm','lb','nft'].find(prefix => event.target.matches('input[id^="'+prefix+'"],select[id^="'+prefix+'"],textarea[id^="'+prefix+'"],input[data-seed]'));
    if (prefix && !formBaselines.has(prefix)) formBaselines.set(prefix,formSnapshot(prefix));
  });
  document.addEventListener('input',updateFormDirty);
  document.addEventListener('change',updateFormDirty);
  document.addEventListener('click',() => { if (page !== 'misiones') queueMicrotask(updateFormDirty); });
  root.addEventListener('gf-admin-form-loaded',event => {
    if (event.detail?.prefix) formBaselines.set(event.detail.prefix,formSnapshot(event.detail.prefix));
    else formBaselines.clear();
    updateFormDirty();
  });
  root.addEventListener('beforeunload',e => { if (dirty || ['busy','dirty'].includes(status())) { e.preventDefault(); e.returnValue = ''; } });
  root.addEventListener('pagehide',e => { if (e.persisted) return; disposed = true; observer.disconnect(); cancelAnimationFrame(raf); jobs.clear(); removeSessionListener?.(); watchedWallet?.removeListener?.('accountsChanged',walletChanged); });
  root.addEventListener('pageshow',e => { if (e.persisted) preferences({},false); });
})(window);
