'use strict';
// Behavioral regressions for the TXT audit. All HTTP/socket responses are local
// fixtures; the DOM and MutationObserver run in the installed headless browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { chromium } = require('C:/Users/pc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');

async function fixture(browser, files) {
  const page = await browser.newPage();
  await page.route('**/*', r => r.abort());
  await page.setContent('<button id="friends-btn"></button><button id="open-chat-btn"></button><div id="chat-panel"><div id="chat-messages"></div></div><div class="skills-body"><div class="skills-section"><span id="sk-strength"></span></div></div>');
  await page.evaluate(() => {
    window.check = (ok, message) => { if (!ok) throw new Error(message); };
    window.flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
    window.defer = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
    let serial = 0, now = 100000;
    const timers = new Map();
    window.setTimeout = (fn, ms = 0) => { const id = ++serial; timers.set(id, { fn, due: now + ms, ms: 0 }); return id; };
    window.setInterval = (fn, ms) => { const id = ++serial; timers.set(id, { fn, due: now + ms, ms }); return id; };
    window.clearTimeout = window.clearInterval = id => timers.delete(id);
    Date.now = () => now;
    window.clock = { timers, tick(ms) { const end = now + ms; for (;;) { let id, entry; for (const [k, t] of timers) if (t.due <= end && (!entry || t.due < entry.due)) { id = k; entry = t; } if (!entry) break; now = entry.due; if (entry.ms) entry.due += entry.ms; else timers.delete(id); entry.fn(); } now = end; } };
    window.Emitter = class {
      constructor() { this.listeners = new Map(); }
      on(ev, fn) { const list = this.listeners.get(ev) || []; list.push({ fn, once: false }); this.listeners.set(ev, list); return this; }
      once(ev, fn) { this.on(ev, fn); this.listeners.get(ev).at(-1).once = true; return this; }
      off(ev, fn) { if (!fn) this.listeners.delete(ev); else this.listeners.set(ev, (this.listeners.get(ev) || []).filter(x => x.fn !== fn)); return this; }
      emit(ev, ...args) { for (const entry of [...(this.listeners.get(ev) || [])]) { if (entry.once) this.off(ev, entry.fn); entry.fn(...args); } return this; }
      listenerCount(ev) { return (this.listeners.get(ev) || []).length; }
    };
    window.socket = new Emitter(); socket.connected = true; socket.id = 'local'; socket.sent = [];
    socket.receive = socket.emit.bind(socket); socket.emit = (ev, data) => { socket.sent.push({ ev, data }); };
    window.globalSocket = socket;
    window.Phaser = { Scene: class {}, Geom: { Rectangle: class {} }, Textures: { FilterMode: { NEAREST: 0 } } };
    window.makeSprite = scene => Object.assign(new Emitter(), {
      scene, active: true, visible: true, input: {}, x: 0, y: 0,
      setInteractive() { return this; }, setOrigin() { return this; }, setDepth() { return this; }, setCrop() { return this; }, play() { return this; },
      setVisible(v) { this.visible = v; return this; }, setAlpha() { return this; }, setScale() { return this; },
      clear() { return this; }, lineStyle() { return this; }, strokeRect() { return this; },
      destroy() { this.active = false; this.scene = null; this.emit('destroy'); }
    });
    window.makeScene = (key = 'GameScene') => {
      const canvas = document.createElement('canvas'); document.body.appendChild(canvas);
      const scene = { events: new Emitter(), input: new Emitter(), socket, playerName: 'Tester',
        scene: { key, get: () => ({}), start(name) { scene.started = name; } }, sys: { settings: { key }, canvas, isActive: () => true },
        player: { x: 100, y: 100, active: true }, map: { widthInPixels: 1000, heightInPixels: 1000 },
        cameras: { main: { getWorldPoint: (x, y) => ({ x, y }) } },
        add: {}, textures: { exists: () => true, get: () => ({ setFilter() {} }) }, anims: { exists: () => true },
        tweens: { entries: [], add(cfg) { const entry = { cfg, killed: false }; this.entries.push(entry); return entry; }, killTweensOf(o) { this.entries.forEach(t => { if (t.cfg.targets === o || Array.isArray(t.cfg.targets) && t.cfg.targets.includes(o)) t.killed = true; }); } },
        notifications: { show() {} }, clearSelectedItem() { this.cleared = (this.cleared || 0) + 1; },
        savegg: async () => {}, cleanupScene() { this.cleaned = true; }
      };
      scene.input.hitTestPointer = () => [];
      for (const kind of ['sprite', 'image', 'ellipse', 'text', 'graphics']) scene.add[kind] = () => makeSprite(scene);
      return scene;
    };
    window.GFMascota = { api: async () => ({ ok: false, datos: null }) };
  });
  for (const file of files) await page.addScriptTag({ content: source(file) });
  return page;
}

test('TXT social regressions in a real browser DOM', async t => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    await t.test('alchemist rejects HTTP 200 business failures and releases its NPC search after late mounting', async () => {
      const page = await fixture(browser, ['gf-alquimista.js']);
      try { await page.evaluate(async () => {
        const scene = makeScene(), st = GFAlquimista.montar(scene); let applied = 0, syncs = 0;
        scene._sincronizarInventarioConLaCadena = async () => { syncs++; };
        window.GFCharacterSkills = { applyStats() { applied++; } };
        scene.events.emit('update', 0); check(!st.enganchado, 'NPC is initially absent');
        scene.sprite_npc3 = makeSprite(scene); scene.events.emit('update', 100); check(!st.enganchado, 'search is throttled');
        scene.events.emit('update', 500); check(st.enganchado, 'late NPC is bound'); check(scene.events.listenerCount('update') === 0, 'update search released');
        GFMascota.api = async route => route === '/api/alchemist/catalog' ? { ok: true, datos: { ok: true, silver: 10, pet: {}, player: { health: 1 }, items: [{ id: 'pocion_vida', name: '<img src=x onerror=alert(1)>', target: 'player', owned: 1, price: 1 }] } } : { ok: true, datos: { ok: false, error: 'inventario_desfasado' } };
        GFAlquimista.abrir(); await flush(); document.querySelector('.gf-alq-item .usar').click(); await flush();
        check(!applied && !syncs, 'rejected action must not apply stats or inventory');
        check(document.getElementById('gf-alq-aviso').textContent.includes('Save your game'), 'business failure is visible');
        check(!document.querySelector('.gf-alq-info img'), 'catalog text remains escaped');
        scene.events.emit('shutdown'); check(!scene.sprite_npc3.listenerCount('pointerdown'), 'NPC listener released');
      }); } finally { await page.close(); }
    });

    await t.test('DM read throttle sends its trailing update, flushes on close and confirms identical messages FIFO', async () => {
      const page = await fixture(browser, ['gf-amigos.js']);
      try { await page.evaluate(() => {
        GFAmigos.montar(makeScene()); GFAmigos.abrirChatCon('friend', 'Friend'); socket.sent.length = 0;
        const message = id => ({ id, de: 'friend', para: 'Tester', texto: 'hello', ts: new Date().toISOString() });
        socket.receive('friends:dm', message('one')); clock.tick(500); socket.receive('friends:dm', message('two'));
        check(socket.sent.filter(x => x.ev === 'friends:dm:history').length === 1, 'read requests coalesce');
        clock.tick(2500); check(socket.sent.filter(x => x.ev === 'friends:dm:history').length === 2, 'last message is eventually read');
        socket.receive('friends:dm', message('three')); GFAmigos.cerrar();
        check(socket.sent.filter(x => x.ev === 'friends:dm:history').length === 3, 'closing flushes messages already seen');
        GFAmigos.abrirChatCon('friend', 'Friend');
        for (let i = 0; i < 2; i++) { document.getElementById('gfa-chat-input').value = 'ok'; document.getElementById('gfa-chat-enviar').click(); }
        const msgs = document.getElementById('gfa-chat-msgs');
        socket.receive('friends:dm:sent', { id: 'a', de: 'Tester', para: 'friend', texto: 'ok', ts: new Date().toISOString() });
        check(!msgs.children[0].textContent.includes('sending'), 'oldest optimistic message confirmed first');
        check(msgs.children[1].textContent.includes('sending'), 'newest remains pending');
        socket.receive('friends:dm:sent', { id: 'a', de: 'Tester', para: 'friend', texto: 'ok' });
        check(msgs.children[1].textContent.includes('sending'), 'duplicate echo does not consume next message');
        socket.receive('friends:dm:sent', { id: 'b', de: 'Tester', para: 'friend', texto: 'ok', ts: new Date().toISOString() });
        check(!msgs.textContent.includes('sending'), 'both echoes settle');
        document.getElementById('gfa-chat-input').value = 'rock & <safe> &lt;'; document.getElementById('gfa-chat-enviar').click();
        check(msgs.lastElementChild.querySelector('.gfa-burbuja-txt').textContent === 'rock & <safe> &lt;', 'optimistic text keeps literal entities');
        socket.receive('friends:dm:sent', { id: 'c', de: 'Tester', para: 'friend', texto: 'rock &amp; &lt;safe&gt; &amp;lt;', ts: new Date().toISOString() });
        check(msgs.children.length === 3 && !msgs.textContent.includes('sending'), 'HTML-escaped server echo replaces its optimistic copy');
      }); } finally { await page.close(); }
    });

    await t.test('friend sprite listeners are idempotent and follow scene ownership; confirmation is unique', async () => {
      const page = await fixture(browser, ['gf-amigos.js']);
      try { await page.evaluate(() => {
        const scene = makeScene(), sprite = makeSprite(scene); let infoCalls = 0;
        GFAmigos.habilitarEnSprite(scene, sprite, () => { infoCalls++; return null; });
        GFAmigos.habilitarEnSprite(scene, sprite, () => { infoCalls++; return null; });
        check(sprite.listenerCount('pointerdown') === 1, 'one pointer handler'); sprite.emit('pointerdown', {}); check(infoCalls === 1, 'one action');
        scene.events.emit('shutdown'); check(!sprite.listenerCount('pointerdown') && !sprite.__gfaInteraccion, 'sprite releases departing scene');
        GFAmigos.montar(makeScene()); socket.receive('friends:state', { ok: true, amigos: [{ playerName: 'friend', username: 'Friend' }] }); GFAmigos.abrir('friends');
        const remove = document.querySelector('button[title="Remove friend"]'); check(remove, 'friend removal exists'); remove.click(); remove.click();
        check(document.querySelectorAll('#gfa-confirmar').length === 1, 'only one confirmation dialog');
      }); } finally { await page.close(); }
    });

    await t.test('invalid torch placements keep the selection and a server extension revives a fading torch', async () => {
      const page = await fixture(browser, ['gf-antorchas.js']);
      try { await page.evaluate(async () => {
        const scene = makeScene(); scene.STATE = { selectedItem: { id: 'antorcha', isGhost: true } };
        const st = GFAntorchas.montar(scene); await flush();
        const click = (x, y) => scene.input.emit('pointerdown', { x, y, button: 0, event: { target: scene.sys.canvas } });
        click(900, 900); check(!scene.cleared, 'out of range keeps selection');
        scene._chocaConEscenario = () => true; click(100, 145); check(!scene.cleared, 'obstacle keeps selection');
        scene._chocaConEscenario = () => false; st.poniendo = true; click(100, 145); check(!scene.cleared, 'in-flight placement keeps selection');
        st.poniendo = false; click(100, 145); check(scene.cleared === 1, 'valid placement clears once'); await flush();
        GFAntorchas._interno.crear(st, { id: 'torch', zona: 'game', x: 100, y: 145, hasta: Date.now() - 1 });
        const previous = st.mapa.torch; scene.events.emit('update', 1000); check(previous.adios, 'expired torch begins fade');
        const fade = scene.tweens.entries.find(t => t.cfg.onComplete);
        GFAntorchas._interno.crear(st, { id: 'torch', zona: 'game', x: 100, y: 145, hasta: Date.now() + 90000 });
        check(st.mapa.torch !== previous && !st.mapa.torch.adios && !previous.palo.active && fade.killed, 'extended torch replaces and cancels old fade');
        fade.cfg.onComplete(); check(st.mapa.torch && !st.mapa.torch.adios, 'stale callback cannot delete replacement');
        GFAntorchas.desmontar(scene); check(!Object.keys(st.mapa).length, 'torch resources released');
      }); } finally { await page.close(); }
    });

    await t.test('channel rejoin uses real scene room resolvers, updates the HUD and stops both polling stages', async () => {
      const page = await fixture(browser, ['Scenes/GameScene.js', 'Scenes/tiendajuego.js', 'Scenes/MinaScene.js', 'Scenes/SalvajeScene.js', 'Scenes/LandsScene.js', 'Scenes/InteriorScene.js', 'gf-canales.js']);
      try { await page.evaluate(() => {
        let active, notices = 0; window.addEventListener('gf-canal-cambiado', () => notices++);
        window.game = { scene: { getScenes: () => [active] } };
        for (const [name, room, extra] of [['GameScene', 'game'], ['tiendajuego', 'tienda'], ['MinaScene', 'mina'], ['SalvajeScene', 'salvaje'], ['LandsScene', 'isla@Tester'], ['LandsScene', 'isla@guest%40owner', { _islaDe: 'guest@owner' }], ['InteriorScene', 'casa:cabana', { _casaId: 'cabana' }]]) {
          active = Object.assign(makeScene(name), extra, { _salaDeEscena: window[name].prototype._salaDeEscena, currentRoom: 'obsolete', joinRoom(room) { this.joined = room; }, clearOtherPlayers() { this.clearedPlayers = true; } });
          socket.receive('canalCambiado', { canal: 2 }); check(active.joined === room && active.clearedPlayers, name + ' rejoins ' + room);
        }
        const before = notices; socket.receive('canalesEstado', { canal: 4 }); socket.receive('canalesEstado', { canal: 4 });
        check(notices === before + 1 && window.__gfCanalActual === 4, 'HUD receives changed channel once');
        GFCanales.detener(); check(clock.timers.size === 0, 'early polling and delay stop');
        GFCanales.iniciar(); clock.tick(60000); check(clock.timers.size === 1, 'slow polling is tracked');
        GFCanales.detener(); check(clock.timers.size === 0 && socket.listenerCount('canalCambiado') === 0, 'slow polling and owned listeners stop');
      }); } finally { await page.close(); }
    });

    await t.test('house entry ignores saves from a departed mount and discovers a cave loaded later', async () => {
      const page = await fixture(browser, ['gf-casas.js']);
      try { await page.evaluate(async () => {
        const scene = makeScene(), save = defer(); scene.savegg = () => save.promise;
        GFCasas.montar(scene); const previous = scene.__gfCasas;
        scene.events.emit('update', 0); check(!previous.soloCartel.cueva, 'no cave initially');
        scene.collisionRectangles3 = [{ x: 10, y: 20, width: 40, height: 50 }]; scene.events.emit('update', 600);
        check(previous.soloCartel.cueva && previous.cartelIds.includes('cueva'), 'late cave found');
        const entry = GFCasas.entrar(scene, 'cabana'); scene.events.emit('shutdown'); GFCasas.montar(scene);
        save.resolve(); await entry; check(!scene.started && !scene.cleaned, 'stale save cannot transition a new mount');
        check(!socket.sent.some(x => x.ev === 'joinRoom'), 'stale save cannot move rooms');
        scene._cambiandoEscena = false; scene.savegg = async () => {}; await GFCasas.entrar(scene, 'cabana');
        check(scene.started === 'LoadingScenegame' && socket.sent.some(x => x.data.room === 'casa:cabana'), 'active entry preserves normal behavior');
      }); } finally { await page.close(); }
    });

    await t.test('character panels survive repeated battle modals and missing API never throws', async () => {
      const page = await fixture(browser, ['gf-character-skills.js']);
      try { await page.evaluate(async () => {
        delete window.GFMascota; const scene = makeScene(); scene.datosJugador = { playerName: 'Tester' };
        GFCharacterSkills.render(scene); const st = scene.__gfCharacter, panel = st.panel;
        clock.tick(6000); check(await GFCharacterSkills.usePotion(scene, 'pocion_vida') === false, 'missing API returns controlled failure');
        GFCharacterSkills.battle(scene); st.button.click(); st.button.click();
        check(document.querySelectorAll('.gf-character-modal').length === 1 && document.querySelectorAll('#gf-character-upgrades').length === 1, 'one modal, one main panel ID');
        check(st.panel === panel && st.modalPanel !== panel, 'main reference is preserved');
        st.modal.querySelector('button').click(); check(st.panel === panel && panel.isConnected && !st.modalPanel, 'closing modal preserves main panel');
        scene.events.emit('shutdown'); check(!panel.isConnected && !document.querySelector('.gf-character-battle-button'), 'all UI released'); await flush();
      }); } finally { await page.close(); }
    });

    await t.test('chat prunes detached nodes and releases/rebinds its MutationObserver over scene transitions', async () => {
      const page = await fixture(browser, ['gf-chat-social.js']);
      try { await page.evaluate(async () => {
        const scene = makeScene(), panel = document.getElementById('chat-panel'), messages = document.getElementById('chat-messages'); GFChatSocial.montar(scene);
        const add = id => { const line = document.createElement('div'), text = document.createElement('span'); text.textContent = 'Hello'; line.appendChild(text); messages.appendChild(line); GFChatSocial.decorar(scene, { mid: id, texto: 'Hello' }, line, null, text); };
        add('one'); check(GFChatSocial._interno.pintados.size === 1, 'message registered');
        messages.replaceChildren(); await flush(); check(!GFChatSocial._interno.pintados.size, 'detached DOM pruned without new messages');
        add('two'); scene.events.emit('shutdown'); check(!GFChatSocial._interno.pintados.size && !window.__gfcsVigilaChat, 'shutdown clears records and observer');
        const replacement = panel.cloneNode(true); panel.replaceWith(replacement); const next = makeScene(); GFChatSocial.montar(next);
        document.getElementById('open-chat-btn').classList.add('gfcs-titila'); replacement.classList.add('chat-hidden'); await flush(); replacement.classList.remove('chat-hidden'); await flush();
        check(!document.getElementById('open-chat-btn').classList.contains('gfcs-titila'), 'observer follows replacement panel'); next.events.emit('shutdown');
      }); } finally { await page.close(); }
    });

    await t.test('invite reads follow the current account and stale Discord buttons cannot mutate the next account', async () => {
      const page = await fixture(browser, ['gf-invitaciones.js']);
      try { await page.evaluate(async () => {
        const body = document.createElement('div'); body.id = 'gfi-cuerpo'; document.body.appendChild(body);
        let active = makeScene(); window.game = { scene: { getScenes: () => [active] } };
        const calls = []; GFMascota.api = (route, data) => { const pending = defer(); calls.push({ route, data, ...pending }); return pending.promise; };
        const response = code => ({ ok: true, datos: { ok: true, codigo: code, wallet: 'wallet', invitados: [], total: 0, activos: 0, discord: '' } });
        GFInvitaciones.cargar(); active = makeScene(); active.playerName = 'Another'; GFInvitaciones.cargar();
        check(calls.length === 2, 'new account can load before old read finishes');
        calls[1].resolve(response('BBBBBBBB')); await flush(); const save = [...body.querySelectorAll('button')].find(b => b.textContent === 'Save');
        calls[0].resolve(response('AAAAAAAA')); await flush(); check(body.querySelector('.gfi-codigo').textContent === 'BBBB-BBBB', 'late response cannot repaint previous account');
        active = makeScene(); active.playerName = 'Third'; save.click(); check(calls.length === 2, 'stale form cannot send another account mutation');
        GFInvitaciones.cargar(); check(!body.querySelector('.gfi-codigo'), 'old account cache cleared while loading'); calls[2].resolve(response('CCCCCCCC')); await flush();
        check(body.querySelector('.gfi-codigo').textContent === 'CCCC-CCCC', 'new account renders normally');
      }); } finally { await page.close(); }
    });

    await t.test('wallet reads and secret responses are bound to the address as well as SDK instance', async () => {
      const page = await fixture(browser, []);
      try {
        await page.evaluate(() => {
          document.body.insertAdjacentHTML('beforeend', '<button class="hub-cat_101" data-cat="wallet" id="wallet-tab"></button><button class="hub-cat_101" data-cat="general"></button><div id="gfw-cat-wallet"><div id="gfw-wallet-body"></div></div><div id="gfw-cat-general"></div>');
          window.address = '0xAAAA'; window.balance = defer(); window.secret = defer();
          window.gfWallet = { getAddress: () => address, getBalance: () => balance.promise, getActivity: async () => ({ txs: [] }), exportPrivateKey: () => secret.promise };
        });
        await page.addScriptTag({ content: source('gf-wallet-dashboard.js') });
        await page.evaluate(async () => {
          document.getElementById('wallet-tab').click(); await flush();
          document.getElementById('gfw-w-pk-secret').value = 'test credential'; document.getElementById('gfw-w-showpk').click();
          address = '0xBBBB'; balance.resolve({ formatted: '999', symbol: 'OLD', chainName: 'old', chainId: 1 }); secret.resolve({ privateKey: 'old private key' }); await flush();
          check(!document.getElementById('gfw-w-pk-out').textContent, 'old address secret cannot display');
          check(document.getElementById('gfw-w-bal').textContent === '—', 'old address balance cannot display');
          document.getElementById('wallet-tab').click(); await flush(); check(document.getElementById('gfw-w-addr').textContent === '0xBBBB', 'opening again follows changed account');
        });
      } finally { await page.close(); }
    });

    await t.test('an old translation failure does not erase a cached result from the newly selected language', async () => {
      const page = await fixture(browser, ['gf-traductor.js']);
      try { await page.evaluate(async () => {
        window.fetch = undefined; const pending = defer(); GFMascota.api = () => pending.promise;
        const node = document.createElement('span'); node.textContent = 'hola'; document.body.appendChild(node);
        GFTraductor.ponerModo('es'); GFTraductor.traducirEn(node, 'hola'); clock.tick(80); await flush();
        GFTraductor._interno.cache.set('en\u0001hola', { t: 'hello', de: 'es' }); GFTraductor.ponerModo('en');
        check(node.__gftNodo.textContent === '🌐 hello', 'new language result renders');
        pending.reject(new Error('old request failed')); await flush();
        check(node.__gftNodo && node.__gftNodo.textContent === '🌐 hello', 'old failure preserves current result');
        check(GFTraductor._interno.pausa() === 0, 'old language failure does not pause new mode');
      }); } finally { await page.close(); }
    });

    await t.test('wallet adoption from a replaced SDK cannot paint an obsolete address', async () => {
      const page = await fixture(browser, []);
      try {
        await page.evaluate(() => {
          document.body.insertAdjacentHTML('beforeend', '<button class="hub-cat_101" data-cat="wallet" id="wallet-tab"></button><div id="gfw-cat-wallet"><div id="gfw-wallet-body"></div></div>');
          window.adoption = defer(); window.gfWallet = { getAddress: () => null, adoptSession: () => adoption.promise };
        });
        await page.addScriptTag({ content: source('gf-wallet-dashboard.js') });
        await page.evaluate(async () => {
          document.getElementById('wallet-tab').click();
          const obsolete = gfWallet;
          gfWallet = { getAddress: () => '0xCURRENT', getBalance: async () => ({ formatted: '1', symbol: 'NEW', chainName: 'current', chainId: 1 }), getActivity: async () => ({ txs: [] }) };
          obsolete.getAddress = () => '0xOBSOLETE'; adoption.resolve({ embedded: true }); await flush();
          check(document.getElementById('gfw-w-addr').textContent === '0xCURRENT', 'replacement SDK owns the wallet view');
        });
      } finally { await page.close(); }
    });
  } finally { await browser.close(); }
});

test('audio gain recovers from zero and outdoor weather buffers remain cached until teardown', async () => {
  let now = 100000, rain = true, fetches = 0;
  const data = new Map(), sounds = [];
  const context = { console: { log() {}, warn() {} }, AbortController, Date: { now: () => now }, setTimeout, clearTimeout,
    fetch() { fetches++; return Promise.reject(new Error('unexpected fetch')); }, GFClima: { estado: () => ({ activo: true, lluvia: rain }) } };
  context.window = context; vm.runInNewContext(source('gf-audio.js'), context);
  const api = context.GFAudio, initial = api.ganancia().lluvia;
  api.ganancia(0); assert.equal(api.ganancia().lluvia, 0); api.ganancia(1); assert.equal(api.ganancia().lluvia, initial);
  const scene = { events: new EventEmitter(), sys: { isActive: () => true }, scene: { key: 'GameScene' }, time: { now: 0 }, player: { x: 0, y: 0 }, audioState: { sfxVolumeApplied: 1, musicVolumeApplied: 1 },
    cache: { audio: { exists: k => data.has(k), get: k => data.get(k), add: (k, v) => data.set(k, v), remove: k => data.delete(k) } },
    sound: Object.assign(new EventEmitter(), { locked: false, sounds, context: { sampleRate: 48000 }, add(key) { const s = { key, isPlaying: false, manager: this, play() { this.isPlaying = true; }, stop() { this.isPlaying = false; }, setVolume() {}, setRate() {}, setPan() {}, destroy() { sounds.splice(sounds.indexOf(this), 1); this.manager = null; this.pendingRemove = true; } }; sounds.push(s); return s; } }) };
  for (const name of api._interno.listaDe('campo')) data.set('gfa_' + name, { length: 1000, numberOfChannels: 1 });
  const st = api.montar(scene, { tipo: 'campo' }), frame = () => { scene.time.now += 250; scene.events.emit('update', scene.time.now, 250); };
  for (let i = 0; i < 30; i++) frame(); assert.ok(st.bucles.lluvia);
  const buffer = data.get('gfa_amb_lluvia'); rain = false; now += 1000; for (let i = 0; i < 60; i++) frame();
  assert.equal(st.bucles.lluvia, undefined); assert.equal(data.get('gfa_amb_lluvia'), buffer);
  rain = true; now += 1000; frame(); assert.ok(st.bucles.lluvia); assert.equal(fetches, 0);
  api.desmontar(scene); assert.equal(data.size, 0); assert.equal(sounds.length, 0);
});
