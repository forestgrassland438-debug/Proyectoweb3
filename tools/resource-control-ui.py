from pathlib import Path
import importlib.util
spec=importlib.util.spec_from_file_location('res_apply','tools/resource-economy-apply.py')
u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u)
s=u.read('control-center.js')
s=u.once(s,"    { id:'colecciones',", "    { id:'recursos', file:'recursos.html', name:'Resources & capacity', icon:'prices', group:'Game control', text:'Read global table capacity, simulate gradual respawn and price adjustments, and preserve the owner’s limits.' },\n    { id:'cuentas', file:'cuentas.html', name:'Accounts & identity', icon:'players', group:'Moderation', text:'Private administrator directory: wallets, character names, available verified emails, login methods and recorded activity.' },\n    { id:'colecciones',")
s=u.once(s,'let renewalTimer = null, frameTimer = null, retryTimer = null, requestRevision = 0;', 'let renewalTimer = null, frameTimer = null, retryTimer = null, presenceTimer = null, requestRevision = 0;')
s=u.once(s,'verified = false; requestRevision++; clearTimeout(renewalTimer); clearTimeout(frameTimer); clearTimeout(retryTimer);', 'verified = false; requestRevision++; clearTimeout(renewalTimer); clearTimeout(frameTimer); clearTimeout(retryTimer); clearTimeout(presenceTimer);')
s=u.once(s,'      watchWallet(provider); armRenewal();', '      watchWallet(provider); armRenewal(); armPresence();')
s=u.once(s,"    if (!tool) return;", "    if (!tool) { armPresence(); return; }\n    clearTimeout(presenceTimer);")
s=u.once(s,"['Online now',d?.conectados,'weather','Activity snapshot']", "['Online now',d?.conectados,'weather',d?.presencia ? 'Game connections · this instance' : 'Presence unavailable']")
# Do not keep advertising an old online count when the refresh failed.
s=u.once(s,"overview:results[0].status === 'fulfilled' ? results[0].value : snapshot?.overview,", "overview:results[0].status === 'fulfilled' ? results[0].value : snapshot?.overview ? { ...snapshot.overview, conectados:null, presencia:null } : null,")
insert='''  function armPresence() {
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
'''
s=u.once(s,'  function renderMetrics() {',insert+'  function renderMetrics() {')
s=u.once(s,'destroyed = true; requestRevision++; clearTimeout(renewalTimer); clearTimeout(frameTimer); clearTimeout(retryTimer);', 'destroyed = true; requestRevision++; clearTimeout(renewalTimer); clearTimeout(frameTimer); clearTimeout(retryTimer); clearTimeout(presenceTimer);')
s=u.once(s,'if (e.persisted && verified) { armRenewal();', 'if (e.persisted && verified) { armRenewal(); armPresence();')
u.save('control-center.js',s)
s=u.read('control-center.html')
s=s.replace('One connected wallet. Twelve tools.','One verified wallet. All administration tools.').replace('All twelve tools are available below.','All administration tools are available below.')
s=u.once(s,'<button class="cc-button" type="button" data-open-tool="economia">Open economy supervisor ↗</button>', '<button class="cc-button" type="button" data-open-tool="economia">Open economy supervisor ↗</button><button class="cc-button" type="button" data-open-tool="recursos">Resources & capacity ↗</button><button class="cc-button" type="button" data-open-tool="cuentas">Accounts & identity ↗</button>')
u.save('control-center.html',s)
s=u.read('admin-suite-i18n.js')
s=u.once(s,'  const pairs = `', '''  const pairs = `
Resources & capacity|Recursos y capacidad
Accounts & identity|Cuentas e identidad
Read global table capacity, simulate gradual respawn and price adjustments, and preserve the owner’s limits.|Consulta la capacidad global de las tablas, simula reapariciones y precios graduales y conserva los límites del propietario.
Private administrator directory: wallets, character names, available verified emails, login methods and recorded activity.|Directorio privado del administrador: carteras, nombres, correos verificados disponibles, métodos de acceso y actividad registrada.
Game connections · this instance|Conexiones del juego · esta instancia
Presence unavailable|Presencia no disponible
One verified wallet. All administration tools.|Una cartera verificada. Todas las herramientas administrativas.
All administration tools are available below.|Todas las herramientas administrativas están disponibles debajo.
Copiar error|Copiar error
''')
u.save('admin-suite-i18n.js',s)
print('Control center expanded; online metric now uses live authenticated presence and bounded polling.')
