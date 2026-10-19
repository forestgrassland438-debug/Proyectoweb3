'use strict';
// End-to-end DOM checks with local synthetic API evidence. No wallet signing or live chain access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/Users/pc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const evidenceDir = path.join(root, 'audits', 'impact-frontend-2026-10-14');
const address = '0x' + '1'.repeat(40), relayerAddress = '0x' + '2'.repeat(40), hash = '0x' + 'a'.repeat(64);
const summaryFixture = {
  generatedAt: '2026-10-14T12:00:00Z',
  users: { registered: 60, active24h: 9, active7d: 15, active30d: 30, withAttributedTransactions: 4, retention7d: { percent: null, eligible: 0, returning: 0, definition: 'D7 por cuenta registrada: al menos un tramo de juego que solape [registro + 7d, registro + 8d). Cohorte: registros entre 15 y 8 días atrás, posteriores al inicio de medición.' } },
  playtime: { totalSeconds: 7200, totalHours: 2, averageSessionMinutes: null, sessionCount: 0, source: 'backend_recorded', coverageNote: 'Tiempo acumulado medido desde que existieron los contadores: socket si disponible; guardados como estimación de respaldo. No se suman ambas fuentes.' },
  contract: { address, chainId: 12345, totalTransactions: 120, confirmedTransactions: 112, revertedTransactions: 8, pendingTransactions: 3, attributedTransactions: 80, inferredTransactions: 30, unattributedTransactions: 10, transactionsPerActiveUser: 2, activeWindowTransactions: 60, attributedUserCount: 4 },
  relayer: { address: relayerAddress, balanceNative: '0.123456789123456789', balanceWei: '123456789123456789', nonceLatest: 140, noncePending: 143, ledgerSignedTransactions: 123, sponsoredContractTransactions: 115, sponsoredSuccessfulTransactions: 109, sponsoredUniqueRegisteredPlayers: 4, status: 'available' },
  explorerTxBase: 'https://liteforge.explorer.caldera.xyz/tx/',
  quality: { notes: ['Las métricas representan los registros ya indexados. Hasta completar analizarCC desde el bloque de despliegue, el volumen histórico es parcial.'] },
  scan: { status: 'idle', fromBlock: 0, nextBlock: 0, targetBlock: 100 }
};
const malicious = '<img src=x onerror="window.__auditInjection=true">';
const rowFixture = { id: 'test-uid', playerName: malicious, username: 'Forest Tester', address, registeredAt: '2026-10-01T12:00:00Z', lastSeen: '2026-10-14T11:00:00Z', playtimeSeconds: 7200, sessionCount: 2, txCount: 6, minedTxCount: 8, revertedTxCount: 2, pendingTxCount: 1, inferredTxCount: 200, lastAssociatedTxHash: '0x' + 'b'.repeat(64), actions: { chop: 4, mine: 2, '<svg onload="window.__auditInjection=true">': 1 }, txPerHour: 3, activityLabel: 'Actividad Orgánica Humana (indicio)', activityReason: 'Indicators are not proof.', lastTxHash: hash, hashes: [hash] };

async function main() {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const errors = [], checks = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
    await context.addCookies([{ name: 'csrf-token', value: 'fixture-csrf', url: origin }]);
    await context.addInitScript(() => { window.__walletListeners = {}; window.ethereum = { on: (name, listener) => { window.__walletListeners[name] = listener; } }; });
    let authorized = true, storageBlocked = false, rpcBlocked = false, scan = { ...summaryFixture.scan }, summaryCalls = 0, impactCalls = 0, concurrentSummaries = 0, maxConcurrent = 0;
    let accessExpired = false, refreshCalls = 0, refreshFailure = null, notAdmin = false, csrfBlocked = false, csrfCalls = 0, temporarySummaryStatus = 0, delayOldUnauthorized = false;
    const userQueries = [], exportCalls = [], scanPosts = [], apiRequests = [];
    await context.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      apiRequests.push({ method: request.method(), headers: request.headers(), path: p });
      const json = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      if (p.startsWith('/api/admin/impact/')) impactCalls++;
      if (p === '/api/auth/refresh') {
        refreshCalls++;
        await new Promise(resolve => setTimeout(resolve, 75));
        if (refreshFailure === 'network') return route.abort('failed');
        if (refreshFailure) return route.fulfill({ status: refreshFailure, contentType: 'application/json', body: '{"error":"temporarily_unavailable"}' });
        if (!authorized) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"refresh_token_not_found","requiresReauth":true}' });
        accessExpired = false;
        await context.addCookies([{ name: 'csrf-token', value: 'renewed-csrf', url: origin }]);
        return json({ ok: true, csrfToken: 'renewed-csrf', accessTokenExpiresIn: 900 });
      }
      if (!authorized) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthorized' }) });
      if (p.startsWith('/api/admin/') && notAdmin) return route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"not_admin"}' });
      if (p.startsWith('/api/admin/') && accessExpired) {
        if (delayOldUnauthorized && p === '/api/admin/impact/users') await new Promise(resolve => setTimeout(resolve, 250));
        return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"admin_auth_required"}' });
      }
      if (p === '/api/admin/whoami') return json({ address });
      if (p === '/api/auth/csrf-token') {
        csrfCalls++;
        if (csrfBlocked) {
          csrfBlocked = false;
          // Simulate a host-only API cookie: its new CSRF value is available in JSON, while game document.cookie is unchanged.
          return json({ csrfToken: 'csrf-repaired' });
        }
        return json({ csrfToken: 'fixture-csrf' });
      }
      if (p === '/api/admin/impact/summary') {
        summaryCalls++; concurrentSummaries++; maxConcurrent = Math.max(maxConcurrent, concurrentSummaries);
        await new Promise(resolve => setTimeout(resolve, 50)); concurrentSummaries--;
        if (temporarySummaryStatus) return route.fulfill({ status: temporarySummaryStatus, contentType: 'application/json', body: '{"error":"impact_rpc_error","message":"RPC temporalmente limitado"}' });
        return json({ ...summaryFixture, scan });
      }
      if (p === '/api/admin/impact/users') {
        userQueries.push(Object.fromEntries(url.searchParams));
        return json({ page: Number(url.searchParams.get('page') || 1), limit: 50, total: 60, rows: [rowFixture] });
      }
      if (p === '/api/admin/impact/scan') {
        if (request.method() === 'POST') {
          if (csrfBlocked) return route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"csrf_token_invalid"}' });
          if (rpcBlocked) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
            ok: false, error: 'impact_rpc_error', code: -32000, stage: 'rpc_head',
            diagnostic: { code: -32000, stage: 'rpc_head', message: 'El RPC rechazó la consulta del bloque actual.' },
            message: 'El RPC rechazó la consulta del bloque actual.'
          }) });
          if (storageBlocked) return route.fulfill({ status: 507, contentType: 'application/json', body: JSON.stringify({
            ok: false, error: 'impact_storage_full', code: 14031, stage: 'mongo_indexes',
            diagnostic: { code: 14031, codeName: 'OutOfDiskSpace', stage: 'mongo_indexes', message: 'MongoDB no puede crear índices por falta de espacio.' },
            message: 'MongoDB respondió 14031 (OutOfDiskSpace): amplía el volumen del servicio MongoDB en Railway.'
          }) });
          scanPosts.push({ csrf: request.headers()['x-csrf-token'], data: request.postData() });
          scan = { status: 'running', fromBlock: 0, nextBlock: 25, targetBlock: 100, processedBlocks: 25, updatedAt: '2026-10-14T12:01:00Z' };
        }
        return json({ ok: true, scan });
      }
      if (p.includes('/api/admin/impact/export/')) {
        exportCalls.push({ path: p, params: url.search, csrf: request.headers()['x-csrf-token'] });
        if (p.endsWith('.csv')) return route.fulfill({ contentType: 'text/csv', body: 'id,txCount,playtimeSeconds,hashes\r\ntest-uid,6,7200,' + hash + '\r\nall-users,112,7200,all-evidence\r\n' });
        return json({ ...summaryFixture, proof: 'complete server snapshot' });
      }
      if (p === '/api/admin/players') return json({ players: [], total: 0, page: 1 });
      if (p === '/api/admin/tablas') return json({ tablas: [] });
      return json({ config: {}, seeds: [], totalCuentas: 60, tiempoTotal: '2 h' });
    });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + '/admin.html');
    await page.waitForFunction(() => document.querySelector('#impactKpis').textContent.includes('Usuarios registrados') && document.querySelector('#impactUserRows a'));
    assert.equal(await page.locator('#panel').isVisible(), true);
    assert.equal(await page.locator('#gate').isVisible(), false);
    assert.equal(await page.locator('#impactGas').textContent(), summaryFixture.relayer.balanceNative);
    assert.equal(await page.locator('#impactSigned').textContent(), '123');
    assert.match(await page.locator('#impactSponsored').textContent(), /115 minadas/);
    assert.match(await page.locator('#impactKpis').textContent(), /Historial de cohortes insuficiente/);
    assert.match(await page.locator('#impactUserRows').textContent(), /6exitosas/);
    assert.equal(await page.locator('#impactUserRows img').count(), 0);
    assert.equal(await page.evaluate(() => window.__auditInjection), undefined);
    assert.equal(await page.locator('#impactUserRows a').first().getAttribute('href'), summaryFixture.explorerTxBase + hash);
    assert.match(await page.locator('#impactUserRows').textContent(), /200 asociadas al inventario · origen no verificado/);
    assert.match(await page.locator('#impactUserRows').textContent(), /3 tx\/h/);
    checks.push('Authenticated entry; real counters; unknown retention/session shown as unavailable; decimal gas preserved; escaped player/action data; official hash link.');

    await page.locator('#impactQ').fill('Forest Tester'); await page.locator('#impactSearch').click();
    await page.waitForFunction(() => document.getElementById('impactUserInfo').textContent.includes('60 jugadores'));
    await page.locator('#impactSort').selectOption('playtime'); await page.locator('#impactNext').click();
    await page.waitForFunction(() => document.getElementById('impactPage').textContent === '2 / 2');
    assert.ok(userQueries.some(q => q.q === 'Forest Tester' && q.sort === 'playtime' && q.page === '2'));
    await page.locator('#impactPrev').click();
    await page.waitForFunction(() => document.getElementById('impactPage').textContent === '1 / 2');
    checks.push('Search, backend sort, next/previous pagination.');

    await page.locator('#analizarCC').click();
    await page.waitForFunction(() => document.getElementById('impactScanStatus').textContent.includes('Analizando'));
    assert.equal(scanPosts.length, 1); assert.equal(scanPosts[0].csrf, 'fixture-csrf'); assert.equal(scanPosts[0].data, '{}');
    assert.ok(apiRequests.filter(r => r.method === 'GET').every(r => !r.headers['content-type']));
    assert.equal(apiRequests.find(r => r.method === 'POST' && r.path === '/api/admin/impact/scan').headers['content-type'], 'application/json');
    assert.equal(await page.locator('#analizarCC').isDisabled(), true);
    assert.ok(await page.locator('#impactScanProgress').isVisible());
    await page.reload();
    await page.waitForFunction(() => document.getElementById('impactScanStatus').textContent.includes('Analizando'));
    assert.equal(scanPosts.length, 1);
    scan = { status: 'complete', fromBlock: 0, nextBlock: 101, targetBlock: 100, processedBlocks: 101 };
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(() => document.getElementById('impactScanStatus').textContent.includes('completado'));
    assert.equal(await page.locator('#impactScanProgress').getAttribute('value'), '100');
    scan = { status: 'retrying', fromBlock: 33, nextBlock: 42, targetBlock: 100, retryCount: 2,
      nextRetryAt: new Date(Date.now() + 60000).toISOString(), deploymentBlock: 33, coverageBasis: 'verified_first_create' };
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(() => document.getElementById('impactScanStatus').textContent.includes('Reintentando'));
    assert.equal(await page.locator('#analizarCC').isDisabled(), true);
    assert.match(await page.locator('#impactScanDetail').textContent(), /Reintentos: 2/);
    assert.match(await page.locator('#impactScanDetail').textContent(), /Próximo intento RPC/);
    scan = { status: 'complete', fromBlock: 33, nextBlock: 101, targetBlock: 100,
      deploymentBlock: 33, coverageBasis: 'verified_first_create', historyComplete: false, contractExecutionHistoryComplete: true };
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(() => document.getElementById('impactScanStatus').textContent.includes('desde despliegue verificado'));
    assert.match(await page.locator('#impactScanDetail').textContent(), /despliegue verificado: 33/);
    checks.push('CSRF-protected background scan request, durable progress after reload, completion and progress bar.');

    for (const [button, suffix] of [['#impactExportCsv', '.csv'], ['#impactExportJson', '.json']]) {
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator(button).click()]);
      const file = path.join(evidenceDir, 'fixture-export' + suffix); await download.saveAs(file);
      assert.ok(fs.readFileSync(file, 'utf8').includes(suffix === '.csv' ? 'all-evidence' : 'complete server snapshot'));
      assert.ok(!fs.readFileSync(file, 'utf8').includes('password'));
    }
    assert.ok(exportCalls.every(c => c.params === '' && c.csrf === 'fixture-csrf'));
    checks.push('Authenticated full CSV and JSON downloads from backend, independent of current table filter/page.');

    await page.locator('#impactGenerate').click();
    await page.waitForFunction(() => document.getElementById('impactReportText').value.includes('EXECUTIVE TRACTION SUMMARY'));
    await page.locator('#impactDiscord').fill('1,234 members · 2026-10-14');
    await page.locator('#impactTwitter').fill('987 followers · 2026-10-14');
    assert.match(await page.locator('#impactReportText').inputValue(), /1,234 members/);
    assert.match(await page.locator('#impactReportText').inputValue(), /do not establish distinct humans/);
    assert.match(await page.locator('#impactReportText').inputValue(), /Not available for an exact eligible cohort/);
    assert.match(await page.locator('#impactReportText').inputValue(), /Inferred inventory-owner associations \(initiator unverified\): 30/);
    assert.doesNotMatch(await page.locator('#impactReportText').inputValue(), /Tiempo acumulado|Las métricas|D7 por cuenta/);
    await page.locator('#impactCopy').click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /LITVM IMPACT REPORT/);
    await page.locator('#impactReportLanguage').selectOption('es');
    assert.match(await page.locator('#impactReportText').inputValue(), /RESUMEN EJECUTIVO DE TRACCIÓN/);
    assert.match(await page.locator('#impactReportText').inputValue(), /1,234 members/);
    await page.evaluate(() => { window.__print = null; window.open = () => { const doc = document.implementation.createHTMLDocument('Print'); return { document: doc, focus() {}, print() { window.__print = doc.body.textContent; } }; }; });
    await page.locator('#impactPrint').click();
    assert.match(await page.evaluate(() => window.__print), /REPORTE DE IMPACTO LITVM/);
    checks.push('Fresh English and Spanish technical report, editable community fields, clipboard copy, text-safe PDF print rendering.');

    await page.locator('#impactReportLanguage').selectOption('en');
    await page.locator('#impactPanel').scrollIntoViewIfNeeded();
    await page.evaluate(() => { document.getElementById('toast').className = ''; });
    await page.screenshot({ path: path.join(evidenceDir, 'admin-impact-desktop-viewport.png') });
    await page.locator('#themeBtn').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.screenshot({ path: path.join(evidenceDir, 'admin-impact-desktop-dark.png') });
    await page.locator('#themeBtn').click();
    await page.screenshot({ path: path.join(evidenceDir, 'admin-impact-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const widths = await page.evaluate(() => ({ body: document.documentElement.scrollWidth, viewport: innerWidth, executive: document.getElementById('impactPanel').getBoundingClientRect().width }));
    assert.ok(widths.body <= widths.viewport + 1, JSON.stringify(widths));
    await page.screenshot({ path: path.join(evidenceDir, 'admin-impact-mobile-viewport.png') });
    await page.screenshot({ path: path.join(evidenceDir, 'admin-impact-mobile.png'), fullPage: true });
    checks.push('Mobile 390px viewport: no page-level horizontal overflow; large evidence table scrolls inside its container.');

    await page.setViewportSize({ width: 1440, height: 1000 });
    const before = summaryCalls;
    await page.evaluate(() => { document.getElementById('reloadBtn').click(); document.getElementById('reloadBtn').click(); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(150);
    assert.ok(summaryCalls <= before + 1); assert.equal(maxConcurrent, 1);
    assert.match(await page.locator('#impactUpdated').textContent(), /cada 10 s/);
    const beforeTimedSummary = summaryCalls, beforeTimedScans = apiRequests.filter(r => r.path === '/api/admin/impact/scan' && r.method === 'GET').length;
    await page.waitForTimeout(10400);
    assert.equal(summaryCalls, beforeTimedSummary + 1);
    assert.equal(apiRequests.filter(r => r.path === '/api/admin/impact/scan' && r.method === 'GET').length, beforeTimedScans);
    assert.equal(maxConcurrent, 1);
    checks.push('Metrics refresh automatically every 10 seconds with a single nonoverlapping cycle; summary scan status avoids a redundant polling route.');
    scan = { status: 'idle', nextBlock: 0, legacyImportError: '14031' };
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(() => document.getElementById('impactScanStatus').textContent.includes('Error de espacio registrado'));
    assert.match(await page.locator('#impactScanStatus').textContent(), /comprueba el diagnóstico actual/);
    assert.doesNotMatch(await page.locator('#impactScanStatus').textContent(), /bloqueado|lleno/i);
    assert.match(await page.locator('#impactScanDetail').textContent(), /14031.*OutOfDiskSpace.*Railway/);
    storageBlocked = true;
    await page.locator('#analizarCC').click();
    await page.waitForFunction(() => document.getElementById('impactScanStatus').textContent.includes('No se pudo iniciar'));
    assert.match(await page.locator('#impactScanDetail').textContent(), /14031.*OutOfDiskSpace.*Railway/);
    assert.equal(await page.locator('#panel').isVisible(), true);
    assert.equal(await page.locator('#analizarCC').isDisabled(), false);
    assert.doesNotMatch(await page.locator('#toast').textContent(), /Mongo\/RPC esté disponible/);
    storageBlocked = false;
    rpcBlocked = true;
    await page.locator('#analizarCC').click();
    await page.waitForFunction(() => document.getElementById('impactScanDetail').textContent.includes('RPC rechazó'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(150);
    assert.match(await page.locator('#impactScanDetail').textContent(), /RPC rechazó/);
    assert.doesNotMatch(await page.locator('#impactScanDetail').textContent(), /OutOfDiskSpace|amplía el volumen/);
    rpcBlocked = false;
    await page.locator('#analizarCC').click();
    await page.waitForFunction(() => document.getElementById('impactScanStatus').textContent.includes('Analizando'));
    scan = { status: 'complete', fromBlock: 0, nextBlock: 101, targetBlock: 100, processedBlocks: 101 };
    checks.push('Mongo 14031 in legacy scan state and HTTP 507 identifies Railway storage, preserves admin access and allows a successful manual retry.');

    const renewalBefore = refreshCalls;
    accessExpired = true; delayOldUnauthorized = true;
    const [renewedDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#impactExportCsv').click(),
      page.locator('#impactRefresh').click()
    ]);
    await renewedDownload.saveAs(path.join(evidenceDir, 'fixture-export-after-renewal.csv'));
    await page.waitForFunction(() => !document.getElementById('impactRefresh').disabled);
    assert.equal(refreshCalls, renewalBefore + 1);
    assert.equal(await page.locator('#panel').isVisible(), true);
    assert.equal(exportCalls.at(-1).csrf, 'renewed-csrf');
    assert.ok(apiRequests.some(r => r.path === '/api/admin/overview' && r.headers['x-csrf-token'] === 'renewed-csrf'));
    delayOldUnauthorized = false;
    checks.push('Concurrent expired-session metrics and CSV export share one renewal, including delayed old 401 responses; retry uses rotated CSRF and keeps the panel visible.');

    csrfBlocked = true;
    scan = { status: 'idle', fromBlock: 0, nextBlock: 0, targetBlock: 100 };
    await page.locator('#impactRefresh').click();
    await page.waitForFunction(() => !document.getElementById('analizarCC').disabled);
    const beforeCsrfRepair = csrfCalls;
    await page.locator('#analizarCC').click();
    await page.waitForFunction(() => document.getElementById('impactScanStatus').textContent.includes('Analizando'));
    assert.equal(csrfCalls, beforeCsrfRepair + 1);
    assert.equal(scanPosts.at(-1).csrf, 'csrf-repaired');
    assert.equal(await page.locator('#panel').isVisible(), true);
    checks.push('A stale CSRF token is renewed and the rejected scan request retries once without ending the admin session.');

    for (const status of [429, 503]) {
      temporarySummaryStatus = status;
      await page.locator('#impactRefresh').click();
      await page.waitForFunction(() => !document.getElementById('impactRefresh').disabled);
      assert.equal(await page.locator('#panel').isVisible(), true);
      assert.equal(refreshCalls, renewalBefore + 1);
    }
    temporarySummaryStatus = 0;
    accessExpired = true; refreshFailure = 503;
    await page.locator('#impactRefresh').click();
    await page.waitForFunction(() => !document.getElementById('impactRefresh').disabled);
    assert.equal(await page.locator('#panel').isVisible(), true);
    const refreshAfterFailure = refreshCalls;
    await page.locator('#impactRefresh').click();
    await page.waitForFunction(() => !document.getElementById('impactRefresh').disabled);
    assert.equal(refreshCalls, refreshAfterFailure);
    assert.equal(await page.locator('#panel').isVisible(), true);
    refreshFailure = null; accessExpired = false;
    // Reload clears the transient renewal cooldown while preserving the server-side session.
    await page.reload();
    await page.waitForFunction(() => document.getElementById('impactKpis').textContent.includes('Usuarios registrados'));
    checks.push('RPC 429/503 and a temporary refresh failure preserve the session; a cooldown prevents repeated refresh requests.');
    accessExpired = true; refreshFailure = 'network';
    await page.locator('#impactRefresh').click();
    await page.waitForFunction(() => !document.getElementById('impactRefresh').disabled);
    assert.equal(await page.locator('#panel').isVisible(), true);
    refreshFailure = null; accessExpired = false;
    await page.reload();
    await page.waitForFunction(() => document.getElementById('impactKpis').textContent.includes('Usuarios registrados'));
    checks.push('A network failure during session renewal preserves the panel and its last verified metrics.');
    authorized = false;
    await page.locator('#impactRefresh').click();
    await page.waitForFunction(() => !document.getElementById('gate').classList.contains('hidden'));
    assert.equal(await page.locator('#panel').isVisible(), false);
    assert.equal(await page.locator('#impactReportText').inputValue(), '');
    const callsAfterLogout = impactCalls;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(100);
    assert.equal(impactCalls, callsAfterLogout);
    checks.push('Revoked refresh credentials gate the panel, clear sensitive evidence and stop polling after one renewal attempt.');
    authorized = true;
    await page.reload();
    await page.waitForFunction(() => !document.getElementById('panel').classList.contains('hidden'));
    await page.evaluate(() => window.__walletListeners.accountsChanged([]));
    assert.equal(await page.locator('#panel').isVisible(), false);
    await page.reload();
    await page.waitForFunction(() => !document.getElementById('panel').classList.contains('hidden'));
    await page.evaluate(() => window.__walletListeners.disconnect({ code: 4900 }));
    assert.equal(await page.locator('#panel').isVisible(), true);
    assert.match(await page.locator('#toast').textContent(), /sesión administrativa sigue activa/);
    notAdmin = true;
    await page.locator('#impactRefresh').click();
    await page.waitForFunction(() => document.getElementById('panel').classList.contains('hidden'));
    assert.equal(await page.locator('#panel').isVisible(), false);
    notAdmin = false;
    await page.reload();
    await page.waitForFunction(() => document.getElementById('impactKpis').textContent.includes('Usuarios registrados'));
    await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
    await page.waitForFunction(() => document.getElementById('impactKpis').textContent.includes('Usuarios registrados'));
    checks.push('Wallet account removal and revoked admin role gate evidence; provider RPC disconnect preserves session; back-forward cache restore revalidates admin.');
    await context.close();

    const gateContext = await browser.newContext(); let unauthorizedImpactCalls = 0;
    await gateContext.route('**/api/**', route => { if (new URL(route.request().url()).pathname.startsWith('/api/admin/impact/')) unauthorizedImpactCalls++; return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"unauthorized"}' }); });
    const gatePage = await gateContext.newPage(); gatePage.on('pageerror', e => errors.push(e.message));
    await gatePage.goto(origin + '/admin.html'); await gatePage.waitForTimeout(100);
    assert.equal(await gatePage.locator('#gate').isVisible(), true); assert.equal(await gatePage.locator('#panel').isVisible(), false); assert.equal(unauthorizedImpactCalls, 0);
    assert.equal(await gatePage.locator('#toast').textContent(), '');
    checks.push('Anonymous viewers never request protected impact endpoints.');
    await gateContext.close();

    const retryContext = await browser.newContext();
    let retrySession = false, roleAvailable = false, retryWhoami = 0, retryNonce = 0, retryLogin = 0, retryImpact = 0;
    await retryContext.addInitScript(() => {
      window.__walletRequests = []; window.__walletListeners = {};
      window.ethereum = {
        on(name, listener) { window.__walletListeners[name] = listener; },
        async request({ method }) {
          window.__walletRequests.push(method);
          if (method === 'eth_requestAccounts') return ['0x' + '1'.repeat(40)];
          if (method === 'personal_sign') return 'fixture-signature';
          throw new Error('Unexpected wallet method: ' + method);
        }
      };
    });
    await retryContext.route('**/api/**', route => {
      const p = new URL(route.request().url()).pathname;
      const json = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      if (p === '/api/auth/csrf-token') return json({ csrfToken: 'retry-csrf' });
      if (p === '/api/auth/nonce') { retryNonce++; return json({ nonce: 'retry-nonce' }); }
      if (p === '/api/auth/login') { retryLogin++; retrySession = true; return json({ ok: true, csrfToken: 'retry-csrf' }); }
      if (!retrySession) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"unauthorized"}' });
      if (p === '/api/admin/whoami') {
        retryWhoami++;
        if (!roleAvailable) return route.fulfill({ status: 503, headers: { 'Retry-After': '15', 'Access-Control-Expose-Headers': 'Retry-After' }, contentType: 'application/json', body: '{"error":"admin_verification_unavailable","retryAfterSeconds":15,"message":"RPC temporalmente limitado"}' });
        return json({ address });
      }
      if (p.startsWith('/api/admin/impact/')) retryImpact++;
      if (p === '/api/admin/impact/summary') return json(summaryFixture);
      if (p === '/api/admin/impact/users') return json({ total: 0, rows: [], page: 1 });
      if (p === '/api/admin/players') return json({ players: [], total: 0, page: 1 });
      if (p === '/api/admin/tablas') return json({ tablas: [] });
      return json({ config: {}, seeds: [] });
    });
    const retryPage = await retryContext.newPage(); retryPage.on('pageerror', e => errors.push(e.message));
    await retryPage.goto(origin + '/admin.html');
    await retryPage.waitForTimeout(100);
    await retryPage.clock.install();
    await retryPage.locator('#connectBtn').click();
    await retryPage.waitForFunction(() => document.getElementById('adminAccessStatus').textContent.includes('15 segundos'));
    assert.equal(await retryPage.locator('#gate').isVisible(), true);
    assert.equal(await retryPage.locator('#connectBtn').isDisabled(), true);
    assert.match(await retryPage.locator('#adminAccessStatus').textContent(), /sesión sigue activa.*No necesitas volver a firmar/);
    assert.equal(retryImpact, 0); assert.equal(retryWhoami, 1);
    roleAvailable = true;
    await retryPage.clock.fastForward(14000);
    assert.equal(retryWhoami, 1);
    await retryPage.clock.fastForward(1000);
    await retryPage.waitForFunction(() => !document.getElementById('panel').classList.contains('hidden'));
    assert.equal(retryWhoami, 2); assert.equal(retryNonce, 1); assert.equal(retryLogin, 1);
    assert.deepEqual(await retryPage.evaluate(() => window.__walletRequests), ['eth_requestAccounts', 'personal_sign']);
    assert.equal(await retryPage.locator('#adminAccessStatus').isVisible(), false);
    checks.push('Initial RPC503 after wallet login honors Retry-After and rechecks the existing session automatically; recovery opens admin without another nonce, login or signature.');
    roleAvailable = false;
    await retryPage.reload();
    await retryPage.waitForFunction(() => document.getElementById('adminAccessStatus').textContent.includes('15 segundos'));
    await retryPage.evaluate(() => window.__walletListeners.accountsChanged([]));
    const beforeAccountCancellation = retryWhoami;
    await retryPage.clock.fastForward(30000);
    assert.equal(retryWhoami, beforeAccountCancellation);
    assert.equal(await retryPage.locator('#panel').isVisible(), false);
    assert.equal(await retryPage.locator('#adminAccessStatus').isVisible(), false);
    await retryPage.reload();
    await retryPage.waitForFunction(() => document.getElementById('adminAccessStatus').textContent.includes('15 segundos'));
    await retryPage.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    const beforePagehideCancellation = retryWhoami;
    await retryPage.clock.fastForward(30000);
    assert.equal(retryWhoami, beforePagehideCancellation);
    roleAvailable = true;
    await retryPage.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await retryPage.waitForFunction(() => !document.getElementById('panel').classList.contains('hidden'));
    assert.equal(retryNonce, 1); assert.equal(retryLogin, 1);
    checks.push('Pending permission retries stop on wallet account removal and pagehide; back-forward restoration rechecks the existing session safely.');
    roleAvailable = false;
    await retryPage.reload();
    await retryPage.waitForFunction(() => document.getElementById('adminAccessStatus').textContent.includes('15 segundos'));
    const beforeBoundedRetry = retryWhoami;
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = retryPage.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/whoami');
      await retryPage.clock.fastForward(15000);
      await response;
      await retryPage.waitForTimeout(50);
    }
    assert.equal(retryWhoami, beforeBoundedRetry + 5);
    assert.equal(await retryPage.locator('#connectBtn').isDisabled(), false);
    assert.equal(await retryPage.locator('#connectBtn').textContent(), 'Reintentar verificación');
    const exhaustedWhoami = retryWhoami;
    await retryPage.clock.fastForward(120000);
    assert.equal(retryWhoami, exhaustedWhoami);
    roleAvailable = true;
    await retryPage.locator('#connectBtn').click();
    await retryPage.waitForFunction(() => !document.getElementById('panel').classList.contains('hidden'));
    assert.equal(retryNonce, 1); assert.equal(retryLogin, 1);
    assert.deepEqual(await retryPage.evaluate(() => window.__walletRequests), []);
    checks.push('Permission retries stop after six attempts; manual reverification then opens admin without wallet signing or restarting login.');
    await retryContext.close();

    for (const failureMode of ['network', 'http503', 'missingCsrf']) {
      const failContext = await browser.newContext();
      const requests = [];
      await failContext.addInitScript(() => {
        window.__walletRequests = [];
        window.ethereum = { on() {}, async request({ method }) {
          window.__walletRequests.push(method);
          if (method === 'eth_requestAccounts') return ['0x' + '1'.repeat(40)];
          throw new Error('Unexpected wallet signing after failed API precheck');
        } };
      });
      await failContext.route('**/api/**', route => {
        const p = new URL(route.request().url()).pathname; requests.push(p);
        if (failureMode === 'network') return route.abort('failed');
        if (p === '/api/auth/csrf-token') {
          return failureMode === 'http503'
            ? route.fulfill({ status: 503, contentType: 'text/html', body: 'Service Unavailable' })
            : route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        }
        return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"unauthorized"}' });
      });
      const failPage = await failContext.newPage(); failPage.on('pageerror', e => errors.push(e.message));
      await failPage.goto(origin + '/admin.html');
      if (failureMode === 'network') {
        await failPage.waitForFunction(() => document.getElementById('toast').textContent.includes('No se pudo conectar con la API'));
        assert.equal(await failPage.locator('#gate').isVisible(), true);
        assert.equal(await failPage.locator('#panel').isVisible(), false);
        await failPage.evaluate(() => {
          document.getElementById('toast').textContent = 'Diagnóstico ya mostrado';
          window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
        });
        await failPage.waitForTimeout(150);
        assert.ok(requests.filter(p => p === '/api/admin/whoami').length >= 2);
        assert.equal(await failPage.locator('#toast').textContent(), 'Diagnóstico ya mostrado');
      }
      await failPage.locator('#connectBtn').click();
      const expected = failureMode === 'network' ? 'No se pudo conectar con la API' : failureMode === 'http503' ? 'HTTP 503' : 'token CSRF válido';
      await failPage.waitForFunction(text => document.getElementById('toast').textContent.includes(text), expected);
      assert.deepEqual(await failPage.evaluate(() => window.__walletRequests), ['eth_requestAccounts']);
      assert.equal(requests.filter(p => p === '/api/auth/csrf-token').length, 1);
      assert.ok(!requests.some(p => p === '/api/auth/nonce' || p === '/api/auth/login' || p.startsWith('/api/admin/impact/')));
      assert.equal(await failPage.locator('#connectBtn').isDisabled(), false);
      assert.equal(await failPage.locator('#panel').isVisible(), false);
      checks.push('Login precheck ' + failureMode + ': clear diagnosis, no nonce/signature/login or protected metrics; connect button recovers.');
      await failContext.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(evidenceDir, 'browser-verification.json'), JSON.stringify({ fixtureOnly: true, checks, errors }, null, 2));
    console.log(checks.join('\n'));
    console.log('PASS: ' + checks.length + ' end-to-end verification groups; zero JavaScript errors; fixtures only.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
