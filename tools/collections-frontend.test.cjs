'use strict';
// Browser verification uses synthetic API responses only: no production server,
// private key, database, RPC, signing or asset transaction is used.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/Users/pc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const evidenceDir = path.join(root, 'audits', 'collections-frontend-2026-10-16');
const address = '0x' + '1'.repeat(40), recipient = '0x' + '2'.repeat(40), contractAddress = '0x' + '3'.repeat(40);
const hash = '0x' + 'a'.repeat(64), royaltyHash = '0x' + 'b'.repeat(64);
const attack = '<img src=x onerror="window.__collectionsInjection=true">';
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+lm7QAAAAASUVORK5CYII=', 'base64');
const freshFixture = () => ({
  ok: true, address, systemOwner: address, isSystemOwner: true, chainId: 4441, contractAddress,
  abi: require('../backend-collections/collections.cjs').ABI,
  capabilities: { invoiceSystem: true, erc721: false, onchainRoyaltyEnforcement: false, royaltyPaymentTracking: 'native_direct_receipts', royaltySaleAmount: 'admin_declared', reversibleStates: 'backend_policy', delegates: 'admin_scoped_collection_policy', multiAccount: 'sequential_wallet_transactions', confirmations: 2, imageMaxBytes: 600000, attributesMax: 200, limits: { collections: 250, tokens: 1000, history: 2000, operations: 100, batch: 100 } },
  collections: [{ id: 'collection-one', name: 'Bosque ' + attack, description: 'Descripción ' + attack, symbol: 'BOS', typeKey: 'col:collection-one', status: 'active', delegate: '', royaltyBps: 500, royaltyReceiver: recipient, limit: '100', configuredLimit: '100', configured: true, nextNumber: 8, createdAt: '2026-10-16T12:00:00Z' }],
  tokens: [
    { id: 'catalog-minted', collectionId: 'collection-one', number: 7, name: 'Pieza ' + attack, description: 'Descripción privada QA', imageId: 'image-one', imageUrl: '/api/collections/images/image-one', attributes: [{ trait_type: 'Rasgo ' + attack, value: 'Valor ' + attack }], status: 'active', royaltyBps: null, royaltyReceiver: '', invoiceId: '9876543210123456789', invoiceIds: ['123', '9876543210123456789'], manualId: 'nft:catalog-minted:fixture', owner: recipient, chainActive: true, chainQuantity: '1', chainWarning: '', createdAt: '2026-10-16T12:00:00Z' },
    { id: 'catalog-draft', collectionId: 'collection-one', number: 8, name: '', description: '', imageId: 'image-one', imageUrl: '/api/collections/images/image-one', attributes: [], status: 'active', royaltyBps: 250, royaltyReceiver: recipient, invoiceId: '', invoiceIds: [], manualId: '', owner: '', chainActive: false, chainQuantity: '0', chainWarning: '', createdAt: '2026-10-16T12:01:00Z' }
  ],
  history: [{ id: 'history-one', tokenId: 'catalog-minted', collectionId: 'collection-one', number: 7, kind: 'transfer', from: address, to: recipient, invoiceId: '9876543210123456789', previousInvoiceId: '123', txHash: hash, blockNumber: 101, logIndex: 1, timestamp: '2026-10-16T12:01:00Z' }],
  royaltyPayments: [], operations: [], scan: { cursor: 101, historicalIncomplete: false },
  totals: { collections: 1, tokens: 2, history: 1, operations: 0 }, truncated: false
});

test('royalty percentages use exact basis points and reject values the API cannot store', () => {
  const { percentToBps } = require('../colecciones.js');
  for (const [input, expected] of [['0', 0], ['0.01', 1], ['4.29', 429], ['99.99', 9999], ['100', 10000]]) assert.equal(percentToBps(input), expected);
  for (const value of ['-1', '100.01', '0.001', 'NaN', '1e2', '', 'Infinity']) assert.throws(() => percentToBps(value));
});

test('sendmulticuentas parses full catalog identifiers and prevents duplicate or invalid destinations', () => {
  const { parseSendRows } = require('../colecciones.js');
  assert.deepEqual(parseSendRows('\uFEFFid_catalogo,direccion\r\ncatalog-minted,' + recipient.toUpperCase().replace('0X', '0x') + '\r\ncatalog-draft,' + address), [
    { tokenId: 'catalog-minted', to: recipient, status: 'ready' }, { tokenId: 'catalog-draft', to: address, status: 'ready' }
  ]);
  for (const value of ['', 'id_catalogo,direccion', 'one,0x' + '0'.repeat(40), 'one,invalid', 'one,' + address + ',extra', 'one,' + address + '\none,' + recipient]) assert.throws(() => parseSendRows(value));
});

test('attributes accepted by the frontend satisfy the production API validator', () => {
  const { parseAttributes } = require('../colecciones.js'), backend = require('../backend-collections/collections.cjs')._test;
  const values = [{ trait_type: 'Rareza', value: 'Épico' }, { trait_type: 'Fuerza', value: 12 }];
  assert.equal(backend.attributes(parseAttributes(values)).length, 2);
  assert.throws(() => parseAttributes([{ trait_type: 'x'.repeat(101), value: 'a' }]));
  assert.throws(() => parseAttributes([{ trait_type: 'Color', value: 'x'.repeat(501) }]));
  assert.throws(() => parseAttributes(Array.from({ length: 201 }, () => values[0])));
  assert.throws(() => parseAttributes([{ trait_type: 'Nivel', value: Infinity }]));
});

test('account connections count distinct wallet addresses and exclude burns and self links', () => {
  const { accountSummary } = require('../colecciones.js');
  const zero = '0x' + '0'.repeat(40);
  const rows = accountSummary([{ invoiceId: '99999999999999999999', owner: address, chainActive: true }, { invoiceId: '2', owner: recipient, chainActive: false }], [
    { from: zero, to: address }, { from: address, to: recipient }, { from: address, to: recipient }, { from: address, to: address }
  ]);
  assert.equal(rows.length, 2); assert.equal(rows[0].address, address); assert.equal(rows[0].held, 1);
  assert.deepEqual([...rows[0].linked], [recipient]); assert.deepEqual([...rows[1].linked], [address]);
  assert.equal(rows[1].held, 0);
});

test('text and spreadsheet exports neutralize executable content', () => {
  const { escapeHTML, csvCell } = require('../colecciones.js');
  assert.equal(escapeHTML('<img src="x" onerror=\'evil\'>&'), '&lt;img src=&quot;x&quot; onerror=&#39;evil&#39;&gt;&amp;');
  for (const input of ['=SUM(A1:A2)', '+CMD()', '@SUM(1)', '-1', ' \t=IMPORTXML("evil")']) assert.ok(csvCell(input).startsWith('"\''));
  assert.equal(csvCell('Bosque "Raro"'), '"Bosque ""Raro"""');
});

async function environment() {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + decodeURIComponent(pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  return { browser, origin, close: async () => { await browser.close(); await new Promise(resolve => server.close(resolve)); } };
}

async function fixtureContext(env, options = {}) {
  const context = await env.browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  if (options.queue) await context.addInitScript(({ key, rows }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(rows)); }, {
    key: 'gf-collections-queue:4441:' + contractAddress + ':' + address, rows: options.queue
  });
  await context.addInitScript(() => {
    window.__walletListeners = {}; window.__walletRequests = [];
    window.ethereum = { isMetaMask: true,
      on(event, callback) { window.__walletListeners[event] = callback; },
      removeListener(event) { delete window.__walletListeners[event]; },
      async request({ method }) {
        window.__walletRequests.push(method);
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return ['0x' + '1'.repeat(40)];
        if (method === 'eth_chainId') return '0x1159';
        if (method === 'personal_sign') return 'fixture-signature';
        throw Error('Wallet write forbidden in frontend fixture: ' + method);
      }
    };
  });
  let data = freshFixture(), authorized = options.authorized !== false, bootstrapStatus = 200, accessExpired = false, refreshStatus = 200;
  const requests = [], mutations = [], pageErrors = [], catalogItems = {};
  await context.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), p = url.pathname;
    requests.push({ method: request.method(), path: p, search: url.search, headers: request.headers(), body: request.postData() });
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (p.startsWith('/api/collections/images/')) return route.fulfill({ contentType: 'image/png', body: image });
    if (p === '/api/auth/csrf-token') return json({ csrfToken: 'fixture-csrf' });
    if (p === '/api/auth/nonce') return json({ nonce: 'fixture-nonce' });
    if (p === '/api/auth/login') { authorized = true; return json({ ok: true, csrfToken: 'fixture-csrf' }); }
    if (p === '/api/auth/refresh') {
      await new Promise(resolve => setTimeout(resolve, 75));
      if (refreshStatus !== 200) return json({ error: 'temporarily_unavailable', message: 'Renovación temporalmente no disponible' }, refreshStatus);
      accessExpired = false;
      return authorized ? json({ ok: true, csrfToken: 'fixture-csrf' }) : json({ error: 'refresh_token_not_found', requiresReauth: true }, 401);
    }
    if (!authorized) return json({ error: 'unauthorized' }, 401);
    if (p.startsWith('/api/admin/collections') && accessExpired) return json({ error: 'access_token_expired' }, 401);
    if (p === '/api/admin/whoami') return json({ address });
    if (p === '/api/admin/collections/bootstrap') return bootstrapStatus === 200 ? json(data) : json({ error: bootstrapStatus === 403 ? 'onchain_admin_required' : 'collections_unavailable', message: 'Fixture access rejected' }, bootstrapStatus);
    if (p === '/api/admin/collections/catalog') {
      const kind = url.searchParams.get('kind'), offset = Number(url.searchParams.get('offset')), limit = Number(url.searchParams.get('limit'));
      const records = catalogItems[kind] || data[kind], items = records.slice(offset, offset + limit), nextOffset = offset + items.length;
      return json({ ok: true, kind, items, total: records.length, nextOffset, hasMore: nextOffset < records.length });
    }
    if (request.method() !== 'GET') {
      mutations.push(requests.at(-1));
      const body = request.postDataJSON() || {};
      if (request.method() === 'PATCH' && p === '/api/admin/collections/collection-one') {
        Object.assign(data.collections[0], body); return json({ ok: true, collection: data.collections[0] });
      }
      if (request.method() === 'PATCH' && p.startsWith('/api/admin/collections/tokens/')) {
        const token = data.tokens.find(t => t.id === p.split('/').at(-1)); Object.assign(token, body); return json({ ok: true, token });
      }
      if (p === '/api/admin/collections/images') return json({ ok: true, id: 'image-upload', url: '/api/collections/images/image-upload' }, 201);
      if (p === '/api/admin/collections/collection-one/tokens') {
        const added = body.items.map(item => {
          const number = ++data.collections[0].nextNumber;
          return { ...item, id: 'catalog-added-' + number, collectionId: 'collection-one', number, imageUrl: '/api/collections/images/' + item.imageId, invoiceId: '', invoiceIds: [], owner: '', chainActive: false, chainQuantity: '0', createdAt: new Date().toISOString() };
        });
        data.tokens.push(...added); data.totals.tokens = data.tokens.length; return json({ ok: true, tokens: added }, 201);
      }
      if (p === '/api/admin/collections/operations/recovery-op/confirm') {
        Object.assign(data.tokens[1], { invoiceId: '99999999999999999999', owner: recipient, chainActive: true, chainQuantity: '1' });
        data.operations = []; return json({ ok: true, operationId: 'recovery-op', tokenId: 'catalog-draft', invoiceId: '99999999999999999999' });
      }
      if (p === '/api/admin/collections/royalty-payments') {
        const existing = data.royaltyPayments.find(p => p.txHash === body.txHash);
        if (existing) return existing.tokenId === body.tokenId && existing.saleAmountWei === body.saleAmountWei
          ? json({ ok: true, payment: existing, idempotent: true })
          : json({ error: 'transaction_already_used', message: 'Este pago ya fue asignado a otro NFT o precio declarado.' }, 409);
        const token = data.tokens.find(t => t.id === body.tokenId), collection = data.collections.find(c => c.id === token.collectionId);
        const royaltyBps = token.royaltyBps == null ? collection.royaltyBps : token.royaltyBps;
        const amountWei = (BigInt(body.saleAmountWei) * BigInt(royaltyBps) / 10000n).toString();
        const payment = { id: 'royalty-fixture', tokenId: token.id, collectionId: token.collectionId, txHash: body.txHash,
          from: recipient, to: token.royaltyReceiver || collection.royaltyReceiver, amountWei,
          amount: require('ethers').formatEther(amountWei), currency: 'NATIVE', decimals: 18,
          status: 'confirmed', verified: true, saleAmountWei: body.saleAmountWei, royaltyBps, timestamp: new Date().toISOString() };
        data.royaltyPayments.push(payment); return json({ ok: true, payment }, 201);
      }
      return json({ error: 'unexpected_fixture_mutation', message: 'Unexpected mutation: ' + p }, 400);
    }
    return json({ error: 'unexpected_fixture_route', message: 'Unexpected route: ' + p }, 404);
  });
  const page = await context.newPage(); page.on('pageerror', error => pageErrors.push(error.message));
  return { context, page, requests, mutations, pageErrors, get data() { return data; }, setCatalogItems(kind, rows) { catalogItems[kind] = rows; }, setAuthorized(value) { authorized = value; }, setBootstrapStatus(value) { bootstrapStatus = value; }, setRefreshStatus(value) { refreshStatus = value; }, expireAccess() { accessExpired = true; } };
}

test('collections browser: identity, XSS, batch validation, privacy and responsive layout', { timeout: 120000 }, async () => {
  const env = await environment();
  const checks = [];
  try {
    const f = await fixtureContext(env), { page } = f;
    f.data.royaltyPayments = [
      { id: 'unverified-payment', verified: false, status: 'confirmed', amount: '999', currency: 'NATIVE', timestamp: new Date().toISOString() },
      { id: 'pending-payment', verified: true, status: 'pending', amount: '999', currency: 'NATIVE', timestamp: new Date().toISOString() }
    ];
    await page.goto(env.origin + '/colecciones.html');
    await page.locator('#app').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#gate').isVisible(), false);
    assert.match(await page.locator('#overview-collections').textContent(), /Bosque <img/);
    assert.equal(await page.locator('[onerror], [onload]').count(), 0);
    assert.equal(await page.evaluate(() => window.__collectionsInjection), undefined);
    assert.ok(!f.requests.some(r => r.path === '/api/auth/login' || r.path === '/api/auth/nonce'));
    checks.push('Existing admin session opens without a signature; collection and NFT metadata remain text-safe.');

    await page.locator('[data-view="tokens"]').click();
    assert.equal(await page.locator('#token-list .token-card').count(), 2);
    await page.locator('#token-search').fill('9876543210123456789');
    assert.equal(await page.locator('#token-list .token-card').count(), 1);
    await page.locator('#token-search').fill('');
    assert.equal(await page.locator('#token-list .token-card img').count(), 2);
    await page.locator('#select-all').check();
    assert.match(await page.locator('#selected-count').textContent(), /2/);
    await page.locator('#queue-selected').click();
    await page.locator('#view-send').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#send-rows tr').count(), 2);
    checks.push('Catalog selections preserve full database identity and large onchain IDs; two selected pieces become two distribution rows.');

    await page.locator('#view-send details').evaluate(el => { el.open = true; });
    await page.locator('#send-csv').fill('id_catalogo,direccion\ncatalog-draft,' + recipient + '\ncatalog-draft,' + address);
    await page.locator('#import-send').click();
    await page.waitForFunction(() => document.getElementById('toasts').textContent.includes('repetida'));
    assert.equal(await page.locator('#send-rows tr').count(), 2);
    await page.locator('#send-csv').fill('id_catalogo,direccion\ncatalog-draft,' + recipient);
    await page.locator('#import-send').click();
    await page.waitForFunction(() => document.getElementById('toasts').textContent.includes('ya está en la cola'));
    assert.equal(await page.locator('#send-rows tr').count(), 2);
    assert.equal(f.mutations.length, 0);
    checks.push('Repeated CSV pieces and pieces already in the distribution queue are rejected before any request or signature.');

    await page.locator('[data-view="tokens"]').click();
    await page.locator('[data-edit-token="catalog-minted"]').click();
    assert.match(await page.locator('#editor-body').textContent(), /9876543210123456789/);
    assert.equal(await page.locator('#editor [onerror], #editor [onload]').count(), 0);
    await page.locator('#edit-name').fill('');
    await page.locator('#edit-description').fill('Descripción privada QA');
    await page.locator('#edit-royalty-mode').selectOption('custom');
    await page.locator('#edit-percent').fill('4.29');
    await page.locator('#edit-receiver').fill(address);
    await page.locator('#attribute-rows .trait-name').fill('Rareza');
    await page.locator('#attribute-rows .trait-value').fill('Épico');
    await page.locator('#add-attribute').click();
    assert.equal(await page.locator('#attribute-rows .attribute-row').count(), 2);
    await page.locator('#attribute-rows .attribute-row').last().locator('[data-remove-attribute]').click();
    await page.locator('#save-editor').click();
    await page.locator('#editor').waitFor({ state: 'hidden' });
    const edit = f.mutations.find(r => r.path === '/api/admin/collections/tokens/catalog-minted');
    assert.ok(edit); assert.equal(edit.headers['x-csrf-token'], 'fixture-csrf');
    const edited = JSON.parse(edit.body);
    assert.equal(edited.name, ''); assert.equal(edited.royaltyBps, 429); assert.equal(edited.royaltyReceiver, address);
    assert.deepEqual(edited.attributes, [{ trait_type: 'Rareza', value: 'Épico' }]);
    checks.push('NFT details preserve large invoice IDs; optional names, individual royalties and arbitrary attribute rows save through the protected API.');

    await page.locator('#upload-open').click();
    await page.locator('#upload-files').setInputFiles([
      { name: 'bosque-uno.png', mimeType: 'image/png', buffer: image },
      { name: 'bosque-dos.png', mimeType: 'image/png', buffer: image }
    ]);
    await page.waitForFunction(() => document.getElementById('upload-count').textContent.includes('2 imágenes'));
    assert.equal(await page.locator('#upload-items .upload-item').count(), 2);
    await page.locator('[data-upload-name="0"]').fill('Pieza de prueba');
    await page.locator('#add-attribute').click();
    await page.locator('#attribute-rows .trait-name').fill('Bioma');
    await page.locator('#attribute-rows .trait-value').fill('Bosque');
    await page.locator('[data-upload-attributes="1"]').evaluate(el => { el.closest('details').open = true; });
    await page.locator('[data-upload-attributes="1"]').fill('[{"trait_type":"Nivel","value":7}]');
    await page.locator('#save-editor').click();
    await page.locator('#editor').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelectorAll('#token-list .token-card').length === 4);
    assert.equal(await page.locator('#token-list .token-card').count(), 4);
    const uploaded = f.mutations.filter(r => r.path === '/api/admin/collections/collection-one/tokens').map(r => JSON.parse(r.body).items[0]);
    assert.equal(uploaded.length, 2); assert.equal(uploaded[0].name, 'Pieza de prueba'); assert.equal(uploaded[1].name, '');
    assert.deepEqual(uploaded[0].attributes, [{ trait_type: 'Bioma', value: 'Bosque' }]);
    assert.deepEqual(uploaded[1].attributes, [{ trait_type: 'Nivel', value: 7 }]);
    assert.deepEqual(f.data.tokens.slice(-2).map(t => t.number), [9, 10]);
    checks.push('Two selected images are counted, previewed and uploaded; final numbers come from the API, with optional names and per-image attribute overrides.');

    await page.locator('[data-view="accounts"]').click();
    assert.match(await page.locator('#account-list').textContent(), /0x2222/);
    await page.locator('[data-view="royalties"]').click();
    assert.match(await page.locator('#royalty-chart').textContent(), /sin|no|disponible|registr/i);
    assert.equal(await page.locator('#royalty-chart svg').count(), 0);
    assert.match(await page.locator('#royalty-payments').textContent(), /No hay cobros verificados/);
    assert.doesNotMatch(await page.locator('#royalty-metrics').textContent(), /999/);
    checks.push('Observed holders and transfer relationships render; configured rates, transfers and unverified or pending payments do not invent royalty income.');

    const walletBeforePayment = await page.evaluate(() => window.__walletRequests.slice());
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.locator('#royalty-payment-open').click();
      await page.locator('#payment-token').selectOption('catalog-minted');
      await page.locator('#payment-sale').fill('1');
      assert.match(await page.locator('#payment-preview').textContent(), /^0\.0429 moneda nativa/);
      assert.match(await page.locator('#payment-preview').textContent(), /4\.29 %/);
      await page.locator('#payment-hash').fill(royaltyHash);
      await page.locator('#save-editor').click();
      await page.locator('#editor').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.getElementById('royalty-payments').textContent.includes('0.0429 NATIVE'));
      assert.equal(await page.locator('#royalty-payments tr').count(), 1);
    }
    const receipts = f.mutations.filter(r => r.path === '/api/admin/collections/royalty-payments');
    assert.equal(receipts.length, 2);
    assert.deepEqual(JSON.parse(receipts[0].body), { tokenId: 'catalog-minted', txHash: royaltyHash, saleAmountWei: '1000000000000000000' });
    assert.equal(receipts[0].headers['x-csrf-token'], 'fixture-csrf');
    assert.equal(f.data.royaltyPayments.filter(p => p.txHash === royaltyHash).length, 1);
    assert.equal(f.data.royaltyPayments.find(p => p.txHash === royaltyHash).amountWei, '42900000000000000');
    assert.equal(await page.locator('#royalty-chart svg').count(), 1);
    assert.match(await page.locator('#royalty-chart').textContent(), /0\.0429/);
    assert.equal(await page.locator('#royalty-payments a').getAttribute('href'), 'https://liteforge.explorer.caldera.xyz/tx/' + royaltyHash);
    assert.deepEqual(await page.evaluate(() => window.__walletRequests), walletBeforePayment);
    await page.screenshot({ path: path.join(evidenceDir, 'collections-royalties.png'), fullPage: true });
    checks.push('Registering a native payment sends exact price wei, previews 4.29% of 1 as 0.0429, shows only a verified receipt in table/chart, handles the same hash idempotently and never requests a wallet signature or transaction.');

    await page.locator('[data-view="overview"]').click();
    await page.locator('#toasts').evaluate(el => el.replaceChildren());
    await page.screenshot({ path: path.join(evidenceDir, 'collections-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    for (const view of ['overview', 'tokens', 'send', 'accounts', 'royalties', 'settings']) {
      await page.locator('[data-view="' + view + '"]').click();
      const width = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth,
        overflow: [...document.querySelectorAll('body *')].map(el => ({ el, r: el.getBoundingClientRect() })).filter(({ el, r }) => r.width && r.right > innerWidth + 1 && !el.closest('.table-scroll,nav')).slice(0, 12).map(({ el, r }) => ({ tag: el.tagName, id: el.id, className: typeof el.className === 'string' ? el.className : '', left: r.left, right: r.right, width: r.width, text: el.textContent.slice(0, 100) })) }));
      if (width.content > width.viewport + 1) await page.screenshot({ path: path.join(evidenceDir, 'collections-mobile-overflow-' + view + '.png'), fullPage: true });
      assert.ok(width.content <= width.viewport + 1, view + ': ' + JSON.stringify(width));
    }
    await page.locator('[data-view="overview"]').click();
    await page.screenshot({ path: path.join(evidenceDir, 'collections-mobile.png'), fullPage: true });
    checks.push('Desktop and 390px mobile layouts render without page-level horizontal overflow.');

    f.expireAccess();
    const refreshBefore = f.requests.filter(r => r.path === '/api/auth/refresh').length;
    await page.evaluate(() => { document.getElementById('refresh').click(); document.getElementById('refresh').click(); });
    await page.waitForFunction(() => document.getElementById('toasts').textContent.includes('Datos actualizados'));
    await page.waitForTimeout(150);
    assert.equal(f.requests.filter(r => r.path === '/api/auth/refresh').length, refreshBefore + 1);
    assert.equal(await page.locator('#app').isVisible(), true);
    checks.push('Concurrent expired administrative reads share one session refresh without another wallet signature.');

    f.expireAccess(); f.setRefreshStatus(503);
    await page.locator('#refresh').click();
    await page.waitForFunction(() => document.getElementById('toasts').textContent.includes('Renovación temporalmente no disponible'));
    assert.equal(await page.locator('#app').isVisible(), true);
    f.setRefreshStatus(200);
    await page.locator('#toasts').evaluate(el => el.replaceChildren());
    await page.locator('#refresh').click();
    await page.waitForFunction(() => document.getElementById('toasts').textContent.includes('Datos actualizados'));
    assert.equal(await page.locator('#app').isVisible(), true);
    checks.push('Temporary refresh unavailability preserves the verified panel and recovers without requiring wallet login.');

    await page.evaluate(() => window.__walletListeners.accountsChanged([]));
    await page.locator('#gate').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#app').isVisible(), false);
    assert.doesNotMatch(await page.locator('body').textContent(), /Descripción privada QA|catalog-minted|9876543210123456789/);
    assert.deepEqual(f.pageErrors, []);
    checks.push('Removing the wallet locks access and clears previous catalog details from the DOM.');
    await f.context.close();

    const recovery = await fixtureContext(env, { queue: [{ tokenId: 'catalog-draft', to: recipient, status: 'sending', txHash: hash, operationId: 'recovery-op' }] });
    recovery.data.operations = [{ id: 'recovery-op', action: 'mint', tokenId: 'catalog-draft', status: 'prepared', createdAt: '2026-10-16T12:00:00Z' }];
    await recovery.page.goto(env.origin + '/colecciones.html');
    await recovery.page.locator('#app').waitFor({ state: 'visible' });
    await recovery.page.locator('[data-view="send"]').click();
    await recovery.page.locator('#review-send').click();
    await recovery.page.locator('#review').waitFor({ state: 'visible' });
    assert.match(await recovery.page.locator('#review-body').textContent(), /Registrar hash/);
    await recovery.page.locator('#confirm-review').click();
    await recovery.page.waitForFunction(() => document.getElementById('send-rows').textContent.includes('Confirmado'));
    assert.equal(recovery.requests.filter(r => r.path === '/api/admin/collections/operations/recovery-op/confirm').length, 1);
    assert.equal(recovery.requests.filter(r => r.path === '/api/admin/collections/prepare').length, 0);
    assert.ok(!(await recovery.page.evaluate(() => window.__walletRequests)).some(method => method === 'eth_sendTransaction' || method === 'personal_sign' || method === 'eth_chainId'));
    await recovery.page.reload();
    await recovery.page.locator('#app').waitFor({ state: 'visible' });
    await recovery.page.locator('[data-view="send"]').click();
    await recovery.page.locator('#review-send').click();
    await recovery.page.waitForFunction(() => document.getElementById('toasts').textContent.includes('ya fueron completados'));
    assert.equal(recovery.requests.filter(r => r.path.endsWith('/confirm')).length, 1);
    assert.deepEqual(recovery.pageErrors, []);
    await recovery.context.close();
    checks.push('A stored transaction hash recovers by confirmation only; reloading and clicking again does not prepare, sign or submit the completed NFT a second time.');

    const pagination = await fixtureContext(env);
    const largeInvoice = '115792089237316195423570985008687907853269984665640564039457584007913129639934';
    const extra = { ...pagination.data.tokens[0], id: 'catalog-paginated', number: 9, name: 'Pieza paginada', invoiceId: largeInvoice, invoiceIds: [largeInvoice] };
    pagination.setCatalogItems('tokens', [...pagination.data.tokens, extra]);
    pagination.data.totals.tokens = 3; pagination.data.truncated = true;
    await pagination.page.goto(env.origin + '/colecciones.html');
    await pagination.page.locator('#app').waitFor({ state: 'visible' });
    await pagination.page.locator('[data-view="tokens"]').click();
    assert.equal(await pagination.page.locator('#token-list .token-card').count(), 2);
    assert.match(await pagination.page.locator('[data-more-catalog="tokens"]').textContent(), /2\/3/);
    await pagination.page.locator('[data-more-catalog="tokens"]').click();
    await pagination.page.waitForFunction(() => document.querySelectorAll('#token-list .token-card').length === 3);
    assert.equal(pagination.requests.filter(r => r.path === '/api/admin/collections/catalog').length, 1);
    assert.equal(pagination.requests.find(r => r.path === '/api/admin/collections/catalog').search, '?kind=tokens&offset=2&limit=500');
    assert.equal(await pagination.page.locator('[data-more-catalog="tokens"]').count(), 0);
    assert.equal(await pagination.page.locator('#catalog-pagination').isVisible(), false);
    await pagination.page.locator('[data-edit-token="catalog-paginated"]').click();
    assert.match(await pagination.page.locator('#editor-body').textContent(), new RegExp(largeInvoice));
    assert.equal(await pagination.page.locator('#app').isVisible(), true);
    assert.deepEqual(pagination.pageErrors, []);
    await pagination.context.close();
    checks.push('Catalog pagination requests the next offset, appends a token with an exact 78-digit invoice ID and removes its load button when all records are present.');

    const delegated = await fixtureContext(env);
    delegated.data.isSystemOwner = false; delegated.data.systemOwner = contractAddress;
    delegated.data.collections[0].delegate = recipient;
    await delegated.page.goto(env.origin + '/colecciones.html');
    await delegated.page.locator('#app').waitFor({ state: 'visible' });
    await delegated.page.locator('[data-view="tokens"]').click();
    await delegated.page.locator('[data-edit-token="catalog-minted"]').click();
    assert.equal(await delegated.page.locator('#save-editor').isDisabled(), true);
    assert.match(await delegated.page.locator('#save-editor').textContent(), /Solo lectura/);
    assert.equal(await delegated.page.locator('#edit-name').isDisabled(), true);
    assert.equal(await delegated.page.locator('#edit-status').isDisabled(), true);
    assert.equal(await delegated.page.locator('#add-attribute').isDisabled(), true);
    await delegated.page.locator('#editor-form').evaluate(el => el.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })));
    await delegated.page.locator('#cancel-editor').click();
    await delegated.page.locator('[data-view="collections"]').click();
    await delegated.page.locator('#collection-list [data-edit-collection="collection-one"]').click();
    assert.equal(await delegated.page.locator('#edit-delegate').isDisabled(), true);
    assert.equal(await delegated.page.locator('#save-editor').isDisabled(), true);
    await delegated.page.locator('#cancel-editor').click();
    assert.equal(delegated.mutations.length, 0);
    assert.equal(await delegated.page.locator('#app').isVisible(), true);
    assert.equal(await delegated.page.locator('#gate').isVisible(), false);
    assert.deepEqual(delegated.pageErrors, []);
    await delegated.context.close();
    checks.push('A different collection delegate makes NFT and collection editors read-only; attempted form submission makes no mutation and preserves the admin session.');

    const anonymous = await fixtureContext(env, { authorized: false });
    await anonymous.page.goto(env.origin + '/colecciones.html');
    await anonymous.page.waitForTimeout(150);
    assert.equal(await anonymous.page.locator('#gate').isVisible(), true);
    assert.equal(await anonymous.page.locator('#app').isVisible(), false);
    assert.ok(!anonymous.requests.some(r => r.path === '/api/auth/login' || r.path === '/api/auth/nonce'));
    assert.deepEqual(anonymous.pageErrors, []);
    await anonymous.context.close();
    checks.push('Anonymous startup keeps the catalog locked without requesting wallet signatures.');
    fs.writeFileSync(path.join(evidenceDir, 'browser-verification.json'), JSON.stringify({ fixtureOnly: true, checks }, null, 2));
  } finally { await env.close(); }
});
