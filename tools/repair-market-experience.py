from pathlib import Path
p=Path(__file__).resolve().parent.parent/'market.html'
s=p.read_text(encoding='utf8')
def rep(a,b):
    global s
    if a not in s: raise RuntimeError(a[:100])
    s=s.replace(a,b)
rep('width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover','width=device-width, initial-scale=1, viewport-fit=cover')
rep('</head>','<link rel="stylesheet" href="./market-experience.css?v=20261028-v3">\n</head>')
rep('      <section id="tab-market">','''      <section id="tab-market">
        <div class="market-intro"><div><small>Grassland Forest · Player market</small><h1 id="market-intro-title">El bosque también comercia.</h1>
          <p id="market-intro-copy">Encuentra recursos, compara precios y equipa tu próxima aventura. Cada operación conserva su historial.</p></div>
          <div class="market-intro-meta"><span id="market-fee-note">Comisión de venta: 5 %</span><button id="market-refresh" type="button">↻ Actualizar mercado</button></div></div>
        <p id="market-network" class="market-network" role="status" aria-live="polite"></p>''')
a=s.index('    const res = await fetch(CONFIG.API_BASE + path', s.index('async function rawFetch'))
b=s.index('\n    return res;',a)
s=s[:a]+'''    const controller = new AbortController();
    const taskOptions = opts || {};
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      return await fetch(CONFIG.API_BASE + path, { ...taskOptions, credentials: 'include', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(taskOptions.headers || {}),
          ...(state.csrfToken ? { 'X-CSRF-Token': state.csrfToken } : {}) } });
    } finally { clearTimeout(timeout); }'''+s[b+len('\n    return res;'):]
rep('  async function loadListings(){','  let listingRevision = 0;\n  async function loadListings(){\n    const revision = ++listingRevision;')
rep('    state.listings = data.listings || [];','    if (revision !== listingRevision) return;\n    state.listings = data.listings || [];')
rep('    await loadEverything();\n    showApp();','''    try { await loadEverything(); showApp(); }
    catch (e) { showGate(); document.getElementById('gate-msg').textContent = state.lang === 'en' ? 'The market could not be loaded. Check your connection and try again.' : 'No se pudo cargar el mercado. Comprueba la conexión y vuelve a entrar.'; return; }''')
rep("  function applyLang(){", """  function applyLang(){
    const english = state.lang === 'en';
    document.getElementById('market-intro-title').textContent = english ? 'The forest trades, too.' : 'El bosque también comercia.';
    document.getElementById('market-intro-copy').textContent = english ? 'Find resources, compare prices and equip your next adventure. Every trade keeps its history.' : 'Encuentra recursos, compara precios y equipa tu próxima aventura. Cada operación conserva su historial.';
    document.getElementById('market-refresh').textContent = english ? '↻ Refresh market' : '↻ Actualizar mercado';
    document.getElementById('market-fee-note').textContent = english ? 'Sales fee: 5%' : 'Comisión de venta: 5 %';""")
rep("    const l = state.buyCtx; if(!l) return;", "    const l = state.buyCtx; if(!l || document.getElementById('buy-confirm').disabled) return;")
rep('    const item = state.sellCtx;\n    if(!item) return;', "    const item = state.sellCtx;\n    if(!item || document.getElementById('sell-confirm').disabled) return;")
# Bounded notifications; no open modal may leak keyboard focus into the game.
rep("    const el = document.createElement('div');\n    el.className = 'toast'", "    document.querySelectorAll('.toast').forEach((old, i) => { if (i >= 3) old.remove(); });\n    const el = document.createElement('div');\n    el.className = 'toast'") if "    const el = document.createElement('div');\n    el.className = 'toast'" in s else None
rep('  boot();','''  let refreshingMarket = false;
  document.getElementById('market-refresh').addEventListener('click', async () => {
    if (refreshingMarket) return;
    refreshingMarket = true; const b = document.getElementById('market-refresh'); b.disabled = true;
    const status = document.getElementById('market-network');
    try { await Promise.all([loadListings(), loadAccount()]); renderMarket(); renderWallet(); status.textContent = state.lang === 'en' ? 'Market refreshed.' : 'Mercado actualizado.'; }
    catch (e) { status.textContent = state.lang === 'en' ? 'Connection interrupted. Try again.' : 'Conexión interrumpida. Vuelve a intentarlo.'; }
    finally { b.disabled = false; refreshingMarket = false; }
  });
  document.addEventListener('keydown', e => {
    const modals = Array.from(document.querySelectorAll('.modal-backdrop.show'));
    const modal = modals[modals.length - 1]; if (!modal) return;
    if (e.key === 'Escape') { e.preventDefault(); modal.classList.remove('show'); return; }
    if (e.key !== 'Tab') return;
    const focusable = Array.from(modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select, a[href], [tabindex="0"]')).filter(n => n.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  });
  window.addEventListener('pagehide', () => { clearTimeout(searchTimer); if (window.GFPrecioPanel) GFPrecioPanel.cerrar(); });
  boot().catch(() => { showGate(); });''')
p.write_text(s,encoding='utf8',newline='\n')
print('Market enhancements preserve existing catalog, language and trade flows.')
