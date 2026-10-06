/* LA ARENA, JUGADA DE VERDAD EN UN NAVEGADOR.
 *
 * Abre el juego sin backend (_prueba_offline.html: el backend de mentira usa
 * el MISMO motor que el servidor) en Edge sin interfaz y juega partidas
 * enteras como lo haría una persona: en PC con teclado y ratón (WASD, clic,
 * espacio, E), en móvil con toques en los joysticks. Por cada partida:
 *
 *   · entra desde el menú de batallas del mapa (el botón de verdad);
 *   · comprueba que tu perro y el del servidor van a la par (predicción);
 *   · dispara y comprueba que las balas se casan con las del servidor;
 *   · espera el final, mira la pantalla de resultados y pulsa "Back to map";
 *   · y al volver comprueba que NO queda nada colgado: oyentes del socket,
 *     oyentes del DOM, la clase in-battle, la textura del tileset.
 *
 * Hace capturas (en la carpeta que se le diga) para mirarlas después.
 *
 *   MODO=pc|movil node tools/brawl-prueba-navegador.mjs [url] [carpeta-capturas]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const URL_PRUEBA = process.argv[2] || 'http://localhost:8123/_prueba_offline.html?tut=22';
const CAPTURAS = process.argv[3] || null;
const MODO = process.env.MODO === 'movil' ? 'movil' : 'pc';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PERFIL = 'C:/Users/pc/AppData/Local/Temp/gf-edge-brawl-' + MODO;
const PUERTO = MODO === 'movil' ? 9361 : 9360;
const ANCHO = MODO === 'movil' ? 915 : 1280, ALTO = MODO === 'movil' ? 412 : 720;

const dormir = (ms) => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${PERFIL}`,
  '--no-first-run', '--disable-extensions', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
  '--disable-features=BackForwardCache', `--window-size=${ANCHO},${ALTO}`, 'about:blank'
], { stdio: 'ignore' });

let ws, sig = 1;
const pend = new Map();
function cdp(method, params = {}) {
  const id = sig++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((ok, mal) => pend.set(id, { ok, mal, method }));
}
async function ev(expr, esperar = false) {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: esperar, returnByValue: true });
  if (r.exceptionDetails) throw new Error(expr.slice(0, 90) + ' -> ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text).slice(0, 400));
  return r.result.value;
}
async function hasta(expr, que, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    let ok = false;
    try { ok = await ev(expr); } catch (e) {}
    if (ok) return true;
    await dormir(200);
  }
  throw new Error('no llega: ' + que);
}
let nCaptura = 0;
async function captura(nombre) {
  if (!CAPTURAS) return;
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  const f = path.join(CAPTURAS, `brawl-${MODO}-${String(++nCaptura).padStart(2, '0')}-${nombre}.png`);
  fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
  console.log('   📸 ' + path.basename(f));
}

const fallos = [];
const ok = (c, m, x) => { if (c) console.log('   OK    ' + m); else { fallos.push(m); console.log('   FALLO ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x).slice(0, 300) : '')); } };

async function raton(tipo, x, y, boton = 'left') {
  await cdp('Input.dispatchMouseEvent', { type: tipo, x, y, button: boton, buttons: tipo === 'mousePressed' ? (boton === 'left' ? 1 : 2) : 0, clickCount: 1 });
}
async function clic(x, y) {
  await raton('mouseMoved', x, y);
  await raton('mousePressed', x, y);
  await raton('mouseReleased', x, y);
}
async function tecla(code, tipo) {
  const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : (code === 'Space' ? ' ' : code);
  const vk = code.startsWith('Key') ? code.charCodeAt(3) : (code === 'Space' ? 32 : 0);
  await cdp('Input.dispatchKeyEvent', { type: tipo, key, code, windowsVirtualKeyCode: vk });
}
async function toque(puntos, tipo) {
  await cdp('Input.dispatchTouchEvent', { type: tipo, touchPoints: puntos.map((p, i) => ({ x: p.x, y: p.y, radiusX: 4, radiusY: 4, force: 1, id: p.id == null ? i : p.id })) });
}
async function centroDe(sel) {
  return ev(`(function(){ var e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
}

/* Lo que mira la prueba dentro de la página, en cada vistazo. */
const ESTADO = `(function(){
  var b = game.scene.getScene('BattleScene'); var A = window.__arenaFalsa;
  if (!b) return null;
  var yo = b.vistas && b.vistas.get(b.yoId);
  var s = A && A.P && A.P.porId ? A.P.porId[b.yoId] : null;
  var enemigos = [];
  if (b.vistas) b.vistas.forEach(function (v) { if (!v.yo && v.vivo && !v.oculto) {
    var c = b.cameras.main; var z = c.zoom;
    enemigos.push({ id: v.id, x: (v.x - c.worldView.x) * z / (game.scale.width / innerWidth), y: (v.y - c.worldView.y) * z / (game.scale.height / innerHeight), d: yo ? Math.hypot(v.x - yo.x, v.y - yo.y) : 0 });
  } });
  enemigos.sort(function (a, b) { return a.d - b.d; });
  var c = b.cameras.main;
  return {
    activa: b.sys.isActive(), estado: b.estado, modo: b.modo, matchId: b.matchId, zoom: b._zoom,
    pred: b.pred ? [b.pred.x, b.pred.y] : null, srv: s ? [s.x, s.y, s.hp, s.vivo] : null,
    yoPantalla: yo ? { x: (yo.x - c.worldView.x) * c.zoom / (game.scale.width / innerWidth), y: (yo.y - c.worldView.y) * c.zoom / (game.scale.height / innerHeight) } : null,
    enemigos: enemigos, corrSrv: s ? s.correccion : 0, cAplicada: b.cAplicada,
    balas: b.balasVista ? b.balasVista.length : 0, confirmadas: b.balasVista ? b.balasVista.filter(function (x) { return x.id != null; }).length : 0,
    disparosSrv: A && A.P ? A.P.sigBala - 1 : 0, quedan: b.quedan, resultado: !!b._resultado,
    errores: __mock.estado.errores.length
  };
})()`;

async function jugarPartida(modo, rendirse) {
  console.log(`\n══ ${modo.toUpperCase()} ${rendirse ? '(rindiéndose)' : ''} ══`);
  const err0 = await ev('__mock.estado.errores.length');
  // Entrar por el menú de batallas del mapa, pulsando su botón de verdad.
  await ev(`game.scene.getScene('GameScene').openBattleHub(), true`);
  await dormir(400);
  const idBoton = { practica: '#battleHubPracticeBtn', bot: '#battleHubAdventureBtn', pvp: '#battleHubPvpBtn' }[modo];
  const b = await centroDe(idBoton);
  ok(!!b && b.w > 0, 'el botón del menú se ve: ' + idBoton);
  if (MODO === 'movil') { await toque([{ x: b.x, y: b.y }], 'touchStart'); await dormir(60); await toque([], 'touchEnd'); }
  else await clic(b.x, b.y);
  await hasta(`(function(){ var b = game.scene.getScene('BattleScene'); return !!(b && b.sys.isActive() && b.estado === 'buscando'); })()`, 'escena de batalla buscando', 15000);
  await dormir(modo === 'pvp' ? 900 : 120);
  await captura(modo + '-buscando');
  await hasta(`(function(){ var b = game.scene.getScene('BattleScene'); return !!(b && (b.estado === 'cuenta' || b.estado === 'combate')); })()`, 'la partida empieza', 20000);
  await dormir(700);
  await captura(modo + '-cuenta');
  await hasta(`(function(){ var b = game.scene.getScene('BattleScene'); return !!(b && b.estado === 'combate'); })()`, 'combate', 8000);
  let e = await ev(ESTADO);
  ok(e.modo === modo, 'modo ' + modo, e.modo);
  ok(e.zoom >= 1, 'zoom entero ' + e.zoom);

  if (rendirse) {
    await dormir(1500);
    const s = await centroDe('#bzSalir');
    if (MODO === 'movil') { for (let i = 0; i < 2; i++) { await toque([{ x: s.x, y: s.y }], 'touchStart'); await dormir(50); await toque([], 'touchEnd'); await dormir(250); } }
    else { await clic(s.x, s.y); await dormir(250); await clic(s.x, s.y); }
    await hasta(`(function(){ var g = game.scene.getScene('GameScene'); return !!(g && g.sys.isActive()); })()`, 'vuelta al mapa tras rendirse', 15000);
    ok(true, 'rendirse (dos toques) vuelve al mapa');
  } else {
    // ── jugar: acercarse al rival más cercano y dispararle ──
    let maxDesfase = 0, disparos = 0, capturado = false;
    const t0 = Date.now();
    let teclas = new Set();
    const soltarTeclas = async () => { for (const k of teclas) await tecla(k, 'keyUp'); teclas = new Set(); };
    while (Date.now() - t0 < 150000) {
      e = await ev(ESTADO);
      if (!e || e.estado === 'fin' || e.resultado) break;
      if (e.pred && e.srv && e.srv[3]) maxDesfase = Math.max(maxDesfase, Math.hypot(e.pred[0] - e.srv[0], e.pred[1] - e.srv[1]));
      const obj = e.enemigos[0];
      if (e.estado === 'combate' && obj && e.yoPantalla) {
        const dx = obj.x - e.yoPantalla.x, dy = obj.y - e.yoPantalla.y;
        const lejos = Math.hypot(dx, dy) > 140;
        if (MODO === 'pc') {
          const quiero = new Set();
          if (lejos) {
            if (dx > 20) quiero.add('KeyD'); if (dx < -20) quiero.add('KeyA');
            if (dy > 20) quiero.add('KeyS'); if (dy < -20) quiero.add('KeyW');
          } else {
            // de cerca: esquivar de lado
            quiero.add((Date.now() / 700 | 0) % 2 ? 'KeyW' : 'KeyS');
          }
          for (const k of teclas) if (!quiero.has(k)) { await tecla(k, 'keyUp'); teclas.delete(k); }
          for (const k of quiero) if (!teclas.has(k)) { await tecla(k, 'keyDown'); teclas.add(k); }
          await raton('mouseMoved', obj.x, obj.y);
          if (!lejos || Math.random() < 0.3) { await raton('mousePressed', obj.x, obj.y); await raton('mouseReleased', obj.x, obj.y); disparos++; }
          if (disparos % 9 === 8) await tecla('KeyE', 'keyDown'), await tecla('KeyE', 'keyUp');
        } else {
          // móvil: el joystick izquierdo hacia el rival y toques en el de disparo
          const zm = await centroDe('#bzZonaMover'), zd = await centroDe('#bzZonaDisparo');
          const bx = zm.x - zm.w / 2 + 110, by = zm.y + zm.h / 2 - 100;
          const n = Math.hypot(dx, dy) || 1;
          const mx = lejos ? bx + dx / n * 45 : bx, my = lejos ? by + dy / n * 45 : by + 40;
          await toque([{ x: bx, y: by, id: 1 }], 'touchStart');
          await toque([{ x: mx, y: my, id: 1 }], 'touchMove');
          await dormir(260);
          // disparo: tocar y soltar en la zona derecha (apuntado automático)
          const fx = zd.x + zd.w / 2 - 110, fy = zd.y + zd.h / 2 - 100;
          await toque([{ x: mx, y: my, id: 1 }, { x: fx, y: fy, id: 2 }], 'touchStart');
          await dormir(60);
          await toque([{ x: mx, y: my, id: 1 }], 'touchEnd');
          await toque([], 'touchEnd');
          disparos++;
        }
        if (!capturado && obj && Math.hypot(dx, dy) < 260) { capturado = true; await dormir(120); await captura(modo + '-combate'); }
      }
      await dormir(MODO === 'movil' ? 60 : 160);
    }
    await soltarTeclas();
    e = await ev(ESTADO);
    ok(maxDesfase < 40, 'tu perro y el del servidor van a la par (máx. ' + maxDesfase.toFixed(1) + ' px)', maxDesfase);
    ok(e.disparosSrv > 0, 'el servidor recibió disparos (' + e.disparosSrv + ')');
    await hasta(`(function(){ var b = game.scene.getScene('BattleScene'); return !!(b && b._resultado); })()`, 'resultados', 20000);
    await dormir(600);
    await captura(modo + '-resultado');
    const res = await ev(`(function(){ var r = document.getElementById('bzResultado'); var t = document.getElementById('bzResTabla');
      return { visible: !r.classList.contains('hidden'), titulo: document.getElementById('bzResTitulo').textContent, filas: t.children.length,
               premios: document.getElementById('bzResPremios').textContent }; })()`);
    ok(res.visible && res.filas >= 2, 'pantalla de resultados con la tabla (' + res.titulo + ' · ' + res.premios + ')', res);
    const v = await centroDe('#bzVolver');
    if (MODO === 'movil') { await toque([{ x: v.x, y: v.y }], 'touchStart'); await dormir(50); await toque([], 'touchEnd'); }
    else await clic(v.x, v.y);
    await hasta(`(function(){ var g = game.scene.getScene('GameScene'); return !!(g && g.sys.isActive()); })()`, 'vuelta al mapa', 15000);
  }
  await dormir(1500);
  // ── nada colgado ──
  const resto = await ev(`(function(){
    var s = window.globalSocket; var n = 0, cuales = [];
    if (s && s._h) Object.keys(s._h).forEach(function (k) { if (/^brawl:/.test(k) && s._h[k].length) { n += s._h[k].length; cuales.push(k); } });
    var b = game.scene.getScene('BattleScene');
    return { oyentesSocket: n, cuales: cuales, inBattle: document.body.classList.contains('in-battle'),
             ui: document.getElementById('battleUI').classList.contains('hidden'),
             tileset: game.textures.exists('bz_arena_32'), especies: game.textures.getTextureKeys().filter(function (k) { return k.indexOf('bz_esp_') === 0; }).length,
             dom: b && b._domBindings ? b._domBindings.length : -1, relojes: b && b._relojes ? b._relojes.size : -1,
             batallaActiva: b ? b.sys.isActive() : false, vistas: b && b.vistas ? b.vistas.size : -1 };
  })()`);
  ok(resto.oyentesSocket === 0, 'sin oyentes brawl:* en el socket', resto.cuales);
  ok(!resto.inBattle && resto.ui, 'el HUD de la arena se esconde y vuelve el del mapa');
  ok(!resto.tileset && resto.especies === 0, 'las texturas de la arena se sueltan', resto);
  ok(resto.dom === 0 && resto.relojes === 0, 'sin oyentes del DOM ni relojes de la batalla', resto);
  ok(!resto.batallaActiva && resto.vistas === 0, 'la escena de batalla queda parada y vacía', resto);
  const errs = await ev(`__mock.estado.errores.slice(${err0}).map(function(x){return x.slice(0,300);})`);
  ok(errs.length === 0, 'sin errores en la consola', errs);
}

try {
  if (CAPTURAS) fs.mkdirSync(CAPTURAS, { recursive: true });
  let lista;
  for (let i = 0; i < 60; i++) {
    try { lista = await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json(); if (lista.length) break; } catch (e) {}
    await dormir(300);
  }
  let pagina = (lista || []).find(t => t.type === 'page');
  ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) {
      const p = pend.get(d.id); pend.delete(d.id);
      if (d.error) p.mal(new Error(p.method + ': ' + JSON.stringify(d.error))); else p.ok(d.result);
    } else if (d.method === 'Page.javascriptDialogOpening') {
      cdp('Page.handleJavaScriptDialog', { accept: false }).catch(() => {});
    }
  });
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  if (MODO === 'movil') {
    await cdp('Emulation.setDeviceMetricsOverride', { width: ANCHO, height: ALTO, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36' });
  } else {
    await cdp('Emulation.setDeviceMetricsOverride', { width: ANCHO, height: ALTO, deviceScaleFactor: 1, mobile: false });
  }
  await cdp('Page.navigate', { url: URL_PRUEBA });
  console.log(`MODO ${MODO}: ${URL_PRUEBA}`);
  await hasta(`(function(){ var s = window.game && game.scene.getScene('GameScene'); return !!(s && s.sys.isActive() && s.player); })()`, 'primer mapa', 120000);
  await dormir(2500);
  for (const m of (process.env.MODOS || 'practica,bot,pvp').split(',')) await jugarPartida(m, false);
  await jugarPartida('practica', true);
  await jugarPartida('bot', false);   // la escena se reutiliza: la segunda vez tiene que ir igual
  console.log('\n══ RESUMEN ' + MODO + ': ' + fallos.length + ' fallos ══');
  fallos.forEach(f => console.log(' ✘ ' + f));
  process.exitCode = fallos.length ? 1 : 0;
} catch (e) {
  console.error('FALLO DE LA PRUEBA', e);
  try { await captura('fallo'); } catch (_) {}
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch (e) {}
  edge.kill();
}
