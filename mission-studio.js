(function (root) {
  'use strict';
  const ui = root.GFAdminUI, editor = root.GFMissionEditor, $ = id => document.getElementById(id);
  if (!ui || !editor) return;
  const t = value => ui.t(value), main = document.querySelector('main');
  const sections = [...main.querySelectorAll(':scope > section.card')];
  if (sections.length !== 7) return;
  const [access,selection,manual,schedule,automatic,deliveries,history] = sections;
  const panels = {manual,automatic,deliveries,history,schedule};
  let active = 'manual', manualBaseline = '', rulesBaseline = '', deliveriesData = null, raf = 0, busy = false;
  const readManual = () => JSON.stringify({ missions:editor.read(), reset:Number($('reset').value) });
  const readRules = () => JSON.stringify(editor.rules());
  const dirtyManual = () => manualBaseline !== readManual();
  const dirtyRules = () => rulesBaseline !== readRules();
  function el(tag,className,text) { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; }
  function info(message) { editor.notice(t(message),'err'); }
  access.classList.add('ms-access'); selection.classList.add('ms-selection');
  const heading = el('div','ms-heading');
  heading.innerHTML = '<div><span class="ms-eyebrow">Game administration / Missions</span><h1>Mission studio</h1><p>Design, preview and manage daily adventures.</p></div><div class="ms-heading-tools"><button type="button" id="ms-export">↓ JSON backup</button><button type="button" id="ms-import">↑ Import draft</button><span class="ms-inline-status" data-suite-dirty></span></div>';
  main.prepend(heading);
  const tabs = el('div','ms-tabs'); tabs.setAttribute('role','tablist'); tabs.setAttribute('aria-label',t('Choose a mission section'));
  const names = { manual:'Manual editor',automatic:'Automatic rules',deliveries:'Deliveries & rewards',history:'History',schedule:'Schedule & copy' };
  Object.keys(panels).forEach((key,index) => {
    const button = el('button','',t(names[key])); button.type = 'button'; button.id = 'ms-tab-'+key;
    button.setAttribute('role','tab'); button.setAttribute('aria-controls','ms-panel-'+key); button.dataset.tab = key;
    panels[key].id = 'ms-panel-'+key; panels[key].setAttribute('role','tabpanel'); panels[key].setAttribute('aria-labelledby',button.id);
    button.addEventListener('click',() => show(key));
    button.addEventListener('keydown',e => {
      if (!['ArrowRight','ArrowLeft','Home','End'].includes(e.key)) return;
      e.preventDefault(); const keys = Object.keys(panels);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? keys.length-1 : (index+(e.key === 'ArrowRight' ? 1:-1)+keys.length)%keys.length;
      show(keys[next]); tabs.children[next].focus();
    }); tabs.append(button);
  });
  selection.after(tabs);
  const contextWarning = el('div','ms-context-warning',t('The selection changed. Load this NPC and day before saving.')); contextWarning.hidden = true; selection.before(contextWarning);
  const summary = el('div','ms-overview'); manual.querySelector('h2').after(summary);
  const previewGrid = el('div','ms-preview-grid');
  previewGrid.innerHTML = '<section class="ms-preview-panel"><div class="ms-preview-options"><h3>Player preview</h3><label><span class="suite-sr">Mission language</span><select id="ms-preview-language"><option value="en-US">English</option><option value="es-419">Español</option></select></label></div><p>This is a draft preview. Save to publish it in the game.</p><div id="ms-player-preview" class="mission-preview-content" data-no-translate></div></section><section class="ms-preview-panel"><h3>Mission mix</h3><p>Reward totals apply to one player completing all missions in this draft.</p><div id="ms-mix"></div><p>Preview does not save or send rewards.</p></section>';
  manual.append(previewGrid);
  const autoGraph = el('div','ms-autograph');
  autoGraph.innerHTML = '<div class="ms-preview-panel"><h3>Rule distribution</h3><div id="ms-auto-mix"></div></div><div class="ms-preview-panel"><h3>Reward budget per player</h3><p>Automatic missions for future days use the saved rules.</p><div id="ms-auto-budget" class="ms-budget"></div></div>';
  automatic.querySelector('.row').before(autoGraph);
  const reloadRules = el('button','ghost',t('Reload')); reloadRules.type = 'button'; reloadRules.style.marginLeft = '12px';
  reloadRules.addEventListener('click',() => { if (!dirtyRules() || root.confirm(t('Discard unsaved changes?'))) editor.loadRules(); });
  automatic.querySelector('h2').append(reloadRules);
  const deliveriesSummary = el('div','ms-results-summary'); deliveries.querySelector('.row').after(deliveriesSummary);
  const loadedCap = el('p','ms-history-help',t('The loaded results include up to 300 delivery records per source.')); deliveriesSummary.after(loadedCap);
  const importer = el('input','ms-file-input'); importer.type = 'file'; importer.accept = '.json,application/json'; importer.setAttribute('aria-label',t('Import draft')); heading.append(importer);
  $('estado').setAttribute('role','status'); $('estado').setAttribute('aria-live','polite');
  function show(key) {
    if (!panels[key]) key = 'manual'; active = key;
    Object.entries(panels).forEach(([name,panel]) => { panel.hidden = name !== key; });
    [...tabs.children].forEach(button => { const selected = button.dataset.tab === key; button.setAttribute('aria-selected',String(selected)); button.tabIndex = selected ? 0:-1; });
  }
  function dirty() { ui.markDirty(dirtyManual() || dirtyRules()); }
  function stat(label,value) { const node = el('div','ms-stat'); node.append(el('span','',t(label)),el('strong','',value)); return node; }
  function amount(value) { return Number(value || 0).toLocaleString(ui.language); }
  function mix(container,deliver,hunt) {
    container.replaceChildren(); const total = deliver+hunt;
    const stack = el('div','ms-stack'); stack.setAttribute('role','img'); stack.setAttribute('aria-label',t('Deliver items')+': '+deliver+'; '+t('Hunt monsters')+': '+hunt);
    const a = el('span'), b = el('span'); a.style.width = (total ? deliver/total*100 : 0)+'%'; b.style.width = (total ? hunt/total*100 : 0)+'%'; stack.append(a,b); container.append(stack);
    [[t('Deliver items'),deliver],[t('Hunt monsters'),hunt]].forEach(([label,value]) => { const row = el('div','ms-mix-row'); row.append(el('span','',label),el('strong','',amount(value)+(total ? ' · '+Math.round(value/total*100)+'%':''))); container.append(row); });
  }
  function render() {
    raf = 0;
    const missions = editor.read(), sum = key => missions.reduce((total,m) => total+(Number(m[key]) || 0),0);
    summary.replaceChildren(stat('Total missions',String(missions.length)),stat('Total EXP',amount(sum('expReward'))),stat('Gold reward',amount(sum('goldReward'))),stat('Silver reward',amount(sum('silverReward'))));
    const hunting = missions.filter(m => m.tipo === 'cazar').length; mix($('ms-mix'),missions.length-hunting,hunting);
    const preview = $('ms-player-preview'); preview.replaceChildren();
    const language = $('ms-preview-language').value;
    missions.forEach((mission,index) => {
      const translated = mission.texts?.[language] || {}, fallback = mission.texts?.['en-US'] || {};
      const card = el('article','ms-preview-mission'+(mission.tipo === 'cazar' ? ' ms-hunt':''));
      const title = translated.title || fallback.title || t('New mission')+' '+(index+1);
      card.append(el('h4','',title));
      if (translated.description || fallback.description) card.append(el('p','',translated.description || fallback.description));
      const target = mission.tipo === 'cazar' ? mission.monstruo : mission.itemId;
      card.append(el('p','',t('Objectives')+': '+mission.requiredAmount+' × '+(translated.itemName || fallback.itemName || target || '—')));
      const rewards = [mission.expReward+' EXP'];
      if (mission.goldReward) rewards.push(mission.goldReward+' '+t('Gold'));
      if (mission.silverReward) rewards.push(mission.silverReward+' '+t('Silver'));
      // (2026-10-28) Las misiones solo dan monedas: también bronce; un objeto viejo se paga en bronce.
      if (mission.bronzeReward) rewards.push(mission.bronzeReward+' '+t('Bronze'));
      if (mission.rewardItemId) rewards.push(mission.rewardAmount+' × '+(translated.rewardName || fallback.rewardName || mission.rewardItemId)+' ('+t('paid in Bronze')+')');
      card.append(el('small','',t('Rewards')+': '+rewards.join(' · '))); preview.append(card);
    });
    if (!missions.length) preview.append(el('p','',t('Add a mission to see its preview.')));
    [...$('misiones').children].forEach((block,index) => decorate(block,index,missions.length));
    const rules = editor.rules();
    mix($('ms-auto-mix'),rules.pedidos.length ? Number(rules.pesoEntregar)||0 : 0,rules.presas.length ? Number(rules.pesoCazar)||0 : 0);
    $('ms-auto-budget').replaceChildren();
    [['Total EXP','expMax'],['Gold','oroMax'],['Silver','plataMax'],['Bronze','bronceMax']].forEach(([label,key]) => { const column = el('div'); column.append(el('span','',t(label)),el('b','',amount((Number(rules.cuantas)||0)*(Number(rules[key])||0)))); $('ms-auto-budget').append(column); });
    const context = editor.context(); contextWarning.hidden = !context.loaded || context.loaded === context.selected;
    access.classList.toggle('ms-verified',context.authenticated);
    document.querySelectorAll('.day-chip').forEach(chip => chip.setAttribute('aria-current',String(chip.textContent.startsWith($('dia').value))));
  }
  function queueRender() { if (!raf) raf = requestAnimationFrame(render); }
  function decorate(block,index,count) {
    if (block.querySelector('.ms-action-row')) return;
    const actions = el('div','ms-action-row');
    [['↑','Move up',() => { const previous = block.previousElementSibling; if (previous) previous.before(block); }],['↓','Move down',() => { const next = block.nextElementSibling; if (next) next.after(block); }],['⧉','Duplicate',() => {
      if (editor.read().length >= 10) return info('At most 10 missions per NPC and day.');
      const mission = block._leer(), ids = new Set(editor.read().map(m=>m.missionId));
      let i = 2, id; do { id = (mission.missionId.slice(0,50)+'_copy'+i++).slice(0,60); } while (ids.has(id));
      mission.missionId = id; editor.add(mission);
    }]].forEach(([symbol,label,handler]) => {
      const button = el('button','',symbol); button.type = 'button'; button.title = t(label); button.setAttribute('aria-label',t(label));
      button.addEventListener('click',() => { handler(); dirty(); queueRender(); }); actions.append(button);
    });
    block.querySelector('.mission-head').insertBefore(actions,block.querySelector('.mission-head').lastElementChild);
  }
  function validateNumbers(container) {
    for (const input of container.querySelectorAll('input[type="number"]')) {
      if (input.closest('[hidden]')) continue;
      if (!input.value || !Number.isSafeInteger(Number(input.value)) || !input.checkValidity()) { input.reportValidity(); input.focus(); info('Complete the highlighted numeric fields.'); return false; }
    }
    return true;
  }
  function validateManual() {
    if (!validateNumbers(manual) || !$('reset').reportValidity()) return false;
    const missions = editor.read(), ids = new Set(missions.map(m=>m.missionId));
    if (!missions.length || missions.length > 10) { info('At most 10 missions per NPC and day.'); return false; }
    if (ids.size !== missions.length || ids.has('')) { info('Mission IDs must be unique and nonempty.'); return false; }
    return true;
  }
  function validateRules() {
    if (!validateNumbers(automatic)) return false;
    const r = editor.rules();
    const ranges = [['expMin','expMax'],['oroMin','oroMax'],['plataMin','plataMax'],['bronceMin','bronceMax']];
    if (ranges.some(([min,max]) => r[min]>r[max]) || [...r.pedidos,...r.presas,...r.premios].some(row => row.min>row.max)) { info('Minimum values must not exceed maximum values.'); return false; }
    if (r.activo && !(r.pedidos.some(p=>p.itemId) && r.pesoEntregar>0 || r.presas.some(p=>p.tipo) && r.pesoCazar>0)) { info('Add items or monsters with a positive mission weight.'); return false; }
    return true;
  }
  function confirmReplace() { return !dirtyManual() || root.confirm(t('Discard unsaved changes?')); }
  function renderDeliveries(data) {
    deliveriesSummary.replaceChildren();
    if (!data) { deliveriesSummary.append(el('p','ms-history-help',t('No deliveries loaded. Choose Load to read this day.'))); return; }
    const rows = data.rows || [], missions = data.misiones || [];
    const totals = rows.reduce((result,row) => { result.count += (row.completadas || []).length; result.exp += Number(row.recibido?.exp)||0; result.gold += Number(row.recibido?.oro)||0; result.silver += Number(row.recibido?.plata)||0; return result; },{count:0,exp:0,gold:0,silver:0});
    const grid = el('div','ms-overview'); grid.append(stat('Loaded players',amount(rows.length)),stat('Completed missions',amount(totals.count)),stat('Issued EXP',amount(totals.exp)),stat('Issued gold / silver',amount(totals.gold)+' / '+amount(totals.silver))); deliveriesSummary.append(grid);
    const chart = el('div','ms-results-chart'); chart.append(el('h3','',t('Completion by mission')));
    missions.forEach(m => {
      const completed = rows.filter(row=>(row.completadas||[]).some(c=>c.missionId===m.missionId)).length;
      const row = el('div','ms-result-bar'), title = el('span','',m.titulo || m.missionId); title.dataset.noTranslate = ''; title.title = m.titulo || m.missionId;
      const track = el('div','ms-result-track'), fill = el('div','ms-result-fill'); fill.style.width = (rows.length ? completed/rows.length*100 : 0)+'%'; track.append(fill);
      row.append(title,track,el('strong','',completed+'/'+rows.length)); chart.append(row);
    });
    if (!missions.length) chart.append(el('p','ms-history-help',t('No completed missions in these results.')));
    chart.append(el('p','ms-history-help',t('Actual rewards shown here come from the backend delivery records.'))); deliveriesSummary.append(chart);
  }
  root.GFMissionStudio = { validateManual,validateRules,confirmReplace };
  manualBaseline = readManual(); rulesBaseline = readRules();
  ui.registerGuard(() => busy ? 'busy' : (dirtyManual() || dirtyRules()) ? 'dirty' : '');
  main.addEventListener('input',event => {
    if (manual.contains(event.target) || automatic.contains(event.target) || event.target.id === 'reset') { dirty(); queueRender(); }
  });
  main.addEventListener('change',event => {
    if (manual.contains(event.target) || automatic.contains(event.target) || event.target.id === 'reset') dirty();
    if (['npc','dia','reset','ms-preview-language'].includes(event.target.id) || automatic.contains(event.target)) queueRender();
    if (['npc','dia'].includes(event.target.id)) { deliveriesData = null; $('entregas').replaceChildren(); $('entInfo').replaceChildren(); renderDeliveries(null); }
  });
  root.addEventListener('gf-missions-loaded',event => {
    if (event.detail.scope === 'manual') manualBaseline = readManual();
    else if (event.detail.scope === 'auto') rulesBaseline = readRules();
    dirty(); queueRender();
  });
  root.addEventListener('gf-missions-edited',event => { if (event.detail.fromPreview) show('manual'); dirty(); queueRender(); });
  root.addEventListener('gf-missions-render',queueRender);
  root.addEventListener('gf-missions-authenticated',queueRender);
  root.addEventListener('gf-missions-deliveries',event => { deliveriesData = event.detail; renderDeliveries(deliveriesData); });
  root.addEventListener('gf-missions-busy',event => { busy = !!event.detail.busy; main.inert = busy; });
  root.addEventListener('gf-missions-rules-loading',event => { automatic.inert = event.detail.loading; automatic.setAttribute('aria-busy',String(event.detail.loading)); });
  root.addEventListener('gf-missions-day-loading',event => { manual.inert = event.detail.loading; manual.setAttribute('aria-busy',String(event.detail.loading)); });
  root.addEventListener('gf-admin-preferences',() => { render(); renderDeliveries(deliveriesData); });
  const observer = new MutationObserver(queueRender); observer.observe($('misiones'),{childList:true});
  $('ms-export').addEventListener('click',() => {
    const context = editor.context(), target = context.loaded || context.selected, [npcId,day] = target.split('/');
    ui.download('grassland-missions-'+npcId+'-'+day+'.json',{format:'grassland-missions',version:1,npcId,day,dailyResetHour:Number($('reset').value),missions:editor.read()});
  });
  $('ms-import').addEventListener('click',() => { importer.value = ''; importer.click(); });
  importer.addEventListener('change',async () => {
    const file = importer.files?.[0]; if (!file) return;
    if (file.size > 1024*1024) return info('The draft file is too large (maximum 1 MB).');
    try {
      const draft = JSON.parse(await file.text());
      if (draft.format !== 'grassland-missions' || draft.version !== 1 || !['granjero','guardian'].includes(draft.npcId) || !/^\d{4}-\d{2}-\d{2}$/.test(draft.day || '') || new Date(draft.day+'T00:00:00Z').toISOString().slice(0,10)!==draft.day || !Array.isArray(draft.missions) || !draft.missions.length || draft.missions.length>10 || !Number.isInteger(draft.dailyResetHour) || draft.dailyResetHour<0 || draft.dailyResetHour>23) throw Error('Invalid mission draft file.');
      const ids = new Set();
      for (const m of draft.missions) {
        if (!m || typeof m.missionId!=='string' || !m.missionId.trim() || m.missionId.length>60 || ids.has(m.missionId) || !['entregar','cazar'].includes(m.tipo) || typeof m.itemId!=='string' || (m.tipo==='entregar'&&!m.itemId.trim()) || m.itemId.length>60 || (m.tipo==='cazar'&&(typeof m.monstruo!=='string'||m.monstruo.length>40))) throw Error('Invalid mission draft file.');
        ids.add(m.missionId);
        for (const [key,max,min] of [['requiredAmount',9999,1],['expReward',100000,0],['goldReward',1000,0],['silverReward',100000,0]]) if (!Number.isInteger(m[key]) || m[key]<min || m[key]>max) throw Error('Invalid mission draft file.');
        if (m.rewardItemId && (typeof m.rewardItemId!=='string' || m.rewardItemId.length>60 || !Number.isInteger(m.rewardAmount) || m.rewardAmount<1 || m.rewardAmount>9999)) throw Error('Invalid mission draft file.');
        if (!m.texts || typeof m.texts!=='object' || Array.isArray(m.texts)) throw Error('Invalid mission draft file.');
        for (const value of Object.values(m.texts)) for (const [key,max] of [['title',80],['description',300],['itemName',80],['rewardName',80]]) if (value?.[key] != null && (typeof value[key]!=='string' || value[key].length>max)) throw Error('Invalid mission draft file.');
      }
      // Import changes only the local editor. Publishing still needs the normal Save action.
      if (!root.confirm(t('Replace the local editor with this imported draft?')+'\n\n'+draft.npcId+' / '+draft.day)) return;
      if (dirtyRules() && !root.confirm(t('Discard unsaved changes?'))) return;
      $('npc').value = draft.npcId; $('dia').value = draft.day; $('npc').dispatchEvent(new Event('change',{bubbles:true}));
      editor.replace(draft.missions,draft.dailyResetHour); show('manual'); editor.notice(t('Imported draft. Review it before saving.'),'ok');
    } catch (e) { info(e.message === 'The draft file is too large (maximum 1 MB).' ? e.message : 'Invalid mission draft file.'); }
  });
  $('npc').addEventListener('change',event => {
    // Capture runs before the original rules loader can replace an edited rule list.
    if (dirtyRules() && !root.confirm(t('Discard unsaved changes?'))) {
      $('npc').value = editor.context().rulesNpc || 'granjero'; event.stopImmediatePropagation(); queueRender();
    }
  },true);
  root.addEventListener('pagehide',event => { if (event.persisted) return; observer.disconnect(); cancelAnimationFrame(raf); });
  show(new URLSearchParams(location.search).get('section') || 'manual'); render(); renderDeliveries(null); dirty();
})(window);
