/* PRUEBA DEL HUD ENTERO, ESCENA POR ESCENA, COMO LO HARÍA UN JUGADOR.
 *
 * Abre el juego sin backend (_prueba_offline.html) en Edge sin interfaz y
 * recorre: mapa → tienda → mapa → mina → mapa → isla (con el botón) → mapa →
 * tienda → isla (desde la tienda) → mapa → combate completo → mapa. En cada
 * escena pulsa CADA control del HUD en sus coordenadas reales (un clic de
 * ratón en PC, un toque en móvil), así que también se entera de si un botón
 * está tapado por otro elemento. Por cada control:
 *   - ¿se ve? ¿qué panel abre?
 *   - ¿se cierra (con su X, pulsando otra vez o con Escape)?
 *   - ¿vuelve a abrir? (un manejador de más abre y cierra en el mismo clic)
 *   - ¿salta algún error?
 *   - al cerrar, ¿el teclado y la entrada de la escena siguen activos y el
 *     centro de la pantalla llega al juego (sin capa invisible encima)?
 * Con NIVEL2=1 pulsa además los botones seguros de dentro de cada panel.
 * Luego fuerza cada clima y cada estación, y cambia de escena con tormenta.
 *
 *   MODO=pc|movil [NIVEL2=1] node tools/hud-prueba.mjs [url] [informe.json]
 *
 * Edge: perfil en ruta corta y FUERA de la shell aislada (ver
 * tools/heap-escenas.mjs, mismas trampas).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const URL_PRUEBA = process.argv[2] || 'http://localhost:8123/_prueba_offline.html?hud=1';
const SALIDA = process.argv[3] || null;
const MODO = process.env.MODO === 'movil' ? 'movil' : 'pc';
const NIVEL2 = process.env.NIVEL2 === '1';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PERFIL = 'C:/Users/pc/AppData/Local/Temp/gf-edge-hud-' + MODO + (process.env.ORIENTACION || '');
const PUERTO = MODO === 'movil' ? (process.env.ORIENTACION === 'vertical' ? 9352 : 9351) : 9350;

const dormir = (ms) => new Promise(r => setTimeout(r, ms));
const edge = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${PERFIL}`,
  '--no-first-run', '--disable-extensions', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
  '--disable-features=BackForwardCache', '--window-size=1280,800', 'about:blank'
], { stdio: 'ignore' });

let ws, sig = 1;
const pend = new Map();
const oyentes = [];
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
    await dormir(250);
  }
  throw new Error('no llega: ' + que);
}

/* Un clic de verdad: ratón en PC, toque en móvil. Las coordenadas son CSS px. */
async function pulsar(x, y) {
  if (MODO === 'movil') {
    /* touchStart + touchEnd, NO synthesizeTapGesture: en Edge sin interfaz el
       gesto sintético no genera el `click` (comprobado tocando hasta el fondo
       de la página), así que todos los botones "no hacían nada". Un toque
       normal sí lo genera, igual que en un teléfono. */
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }] });
    await dormir(70);
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
}
async function tecla(key) {
  const code = key === 'Escape' ? 'Escape' : key;
  const kc = key === 'Escape' ? 27 : key.toUpperCase().charCodeAt(0);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: kc });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: kc });
}

/* ── Lo que corre dentro de la página ─────────────────────────────────────── */
const LIB = String.raw`
window.__H = window.__H || (function () {
  var H = {};
  function vis(el) {
    if (!el || !el.isConnected) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    return true;
  }
  function desc(el) {
    if (!el) return 'nada';
    var s = el.tagName.toLowerCase();
    if (el.id) return s + '#' + el.id;
    var c = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return s + (c ? '.' + c : '');
  }
  function grandes() {
    var out = [], vw = innerWidth, vh = innerHeight, all = document.body.getElementsByTagName('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i], t = el.tagName;
      if (t === 'CANVAS' || t === 'SCRIPT' || t === 'STYLE' || t === 'svg' || t === 'path') continue;
      var r = el.getBoundingClientRect();
      if (r.width < 60 || r.height < 40) continue;
      if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) continue;
      if (!vis(el)) continue;
      out.push(el);
    }
    return out;
  }
  function raices(lista) {
    var set = new Set(lista);
    return lista.filter(function (e) {
      for (var p = e.parentElement; p; p = p.parentElement) if (set.has(p)) return false;
      return true;
    });
  }
  function errs() { return (window.__mock && window.__mock.estado.errores) || []; }
  // Partes FIJAS del HUD: aparecen y desaparecen solas (barra rápida, perfil)
  // y no son paneles que se abran con un botón.
  var HUD_FIJO = '#quick-slots-bar, #hub, #cajahub, #game-hud, #round-buttons-container, #open-chat-btn, .corner-box, #local-chat-bubble';
  function esHudFijo(e) { try { return !!(e.closest && e.closest(HUD_FIJO)); } catch (x) { return false; } }
  H.vis = vis; H.desc = desc;

  // window.open, alert, confirm y prompt no pueden bloquear la prueba.
  window.__abiertos = window.__abiertos || [];
  window.__dialogos = window.__dialogos || [];
  window.open = function (u) { window.__abiertos.push(String(u)); return null; };
  window.alert = function (m) { window.__dialogos.push('alert: ' + m); };
  window.confirm = function (m) { window.__dialogos.push('confirm: ' + m); return false; };
  window.prompt = function (m) { window.__dialogos.push('prompt: ' + m); return null; };

  var NOMBRES = ['dashboard', 'mail', 'musica', 'transacciones', 'nft', 'skills', 'store', 'amigos', 'lands'];
  H.controles = function () {
    var rb = document.querySelectorAll('#round-buttons-container .round-btn');
    var out = [];
    for (var i = 0; i < rb.length; i++) out.push({ clave: 'rb' + i, nombre: NOMBRES[i] || ('rb' + i) });
    [['#toggle-hud-btn', 'ocultar-hud'], ['.corner-box .left-stack', 'oro'], ['.corner-box .right-stack', 'plata'],
     ['#hud-reloj', 'reloj'], ['#open-chat-btn', 'chat'], ['#inv-shortcut-btn', 'mochila'],
     ['#hud-containerx2', 'mochila-2'], ['#hub-image', 'retrato']]
      .forEach(function (p) { out.push({ clave: p[0], nombre: p[1] }); });
    return out;
  };
  H.el = function (clave) {
    if (/^rb\d+$/.test(clave)) return document.querySelectorAll('#round-buttons-container .round-btn')[+clave.slice(2)];
    return document.querySelector(clave);
  };
  function centro(el) {
    var r = el.getBoundingClientRect();
    var x = Math.max(1, Math.min(innerWidth - 2, r.left + r.width / 2));
    var y = Math.max(1, Math.min(innerHeight - 2, r.top + r.height / 2));
    var top = document.elementFromPoint(x, y);
    return { x: x, y: y, tapado: (top && top !== el && !el.contains(top)) ? desc(top) : null,
             fuera: (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) };
  }
  H.punto = function (sel) { var el = H.el(sel); if (!el || !vis(el)) return null; return centro(el); };
  H.prepara = function (clave) {
    var el = H.el(clave);
    H._antes = new Set(grandes()); H._err0 = errs().length; H._abiertos0 = window.__abiertos.length;
    H._raices = []; H._clave = clave;
    if (!el) return { existe: false };
    if (!vis(el)) return { existe: true, visible: false };
    var c = centro(el); c.existe = true; c.visible = true; return c;
  };
  H.tras = function () {
    var ahora = grandes(), set = new Set(ahora);
    var nuevos = raices(ahora.filter(function (e) { return !H._antes.has(e) && !esHudFijo(e); }));
    var perdidos = raices(Array.from(H._antes).filter(function (e) { return !set.has(e); }));
    H._raices = nuevos;
    return { nuevos: nuevos.map(desc), perdidos: perdidos.map(desc),
             abrioVentana: window.__abiertos.slice(H._abiertos0) };
  };
  H.errores = function () { return errs().slice(H._err0).map(function (e) { return e.slice(0, 400); }); };
  H.sigueAbierto = function () { return H._raices.some(function (r) { return vis(r); }); };
  var RX_CIERRE_ID = /close|cerrar|cierre|btn-x|x-btn|dismiss/i;
  var RX_CIERRE_TX = /^(×|✕|✖|✗|x|X|Close|CLOSE|Cerrar|CERRAR|Back|Volver)$/;
  function esCierre(el) {
    var id = (el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '') + ' ' + (el.getAttribute('aria-label') || '');
    return RX_CIERRE_ID.test(id) || RX_CIERRE_TX.test((el.textContent || '').trim());
  }
  H.cierre = function () {
    for (var i = 0; i < H._raices.length; i++) {
      var cands = H._raices[i].querySelectorAll('button,[role=button],span,div,a,i');
      for (var j = 0; j < cands.length; j++) {
        var el = cands[j];
        if (!vis(el) || !esCierre(el)) continue;
        var r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8 || r.width > 320 || r.height > 120) continue;
        var c = centro(el); c.desc = desc(el);
        var cy = r.top + r.height / 2, cx = r.left + r.width / 2;
        c.fueraDePantalla = cy < 0 || cy > innerHeight || cx < 0 || cx > innerWidth;
        return c;
      }
    }
    return null;
  };
  var PELIGRO = /log ?out|cerrar sesi|sign ?out|delete|borrar|elimin|trash|basura|confirm|buy|sell|compr|vend|send|enviar|claim|reclam|exchange|swap|convert|private|clave|secret|seed|withdraw|retir|burn|quem|reset|craft|fabric|smelt|fundir|pay|pag|mint|transfer|accept|acept|reject|rechaz|remove|quitar|block|bloque|report|denunc|save|guardar|surrender|rendir|market|store|explorer|copy|copiar|import|export|key|rename|nombre|name|use\b|usar|equip|drop|soltar|reviv|feed|alimenta|heal|curar|lands|battle|batalla|logout|mute|test/i;
  H.dentro = function () {
    var out = [];
    H._raices.forEach(function (raiz) {
      var cands = raiz.querySelectorAll('button,[role=button],[role=tab],.tab,.tab-btn,[data-tab],input[type=checkbox]');
      for (var j = 0; j < cands.length && out.length < 30; j++) {
        var el = cands[j];
        if (!vis(el) || esCierre(el) || el.disabled) continue;
        var txt = ((el.textContent || '') + ' ' + (el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.title || '')).replace(/\s+/g, ' ').trim();
        if (PELIGRO.test(txt)) continue;
        var c = centro(el); if (c.tapado || c.fuera) continue;
        c.desc = desc(el) + ' "' + txt.slice(0, 40) + '"'; out.push(c);
      }
    });
    return out;
  };
  H.estadoEscena = function () {
    var s = window.activeScene;
    var cx = innerWidth / 2, cy = innerHeight * 0.45;
    var top = document.elementFromPoint(cx, cy);
    return {
      escena: s && s.sys ? s.sys.settings.key : null,
      teclado: s && s.input && s.input.keyboard ? s.input.keyboard.enabled : null,
      entrada: s && s.input ? s.input.enabled : null,
      centro: top ? (top.tagName === 'CANVAS' ? 'canvas' : desc(top)) : 'nada'
    };
  };
  H.hud = function () {
    function v(sel) { var e = document.querySelector(sel); return !!(e && vis(e)); }
    var rb = document.querySelectorAll('#round-buttons-container .round-btn'), rv = 0;
    for (var i = 0; i < rb.length; i++) if (vis(rb[i])) rv++;
    return {
      hud: v('#game-hud'), botonesVisibles: rv + '/' + rb.length, chat: v('#open-chat-btn'),
      barraRapida: v('#quick-slots-bar'), perfil: v('#hub'), reloj: (document.getElementById('hud-reloj-hora') || {}).textContent,
      oro: (document.getElementById('info-text-left') || {}).textContent, plata: (document.getElementById('info-text-right') || {}).textContent,
      nombre: (document.getElementById('username') || {}).textContent
    };
  };
  // Firma de lo que se ve: sirve para esperar a que la pantalla se quede quieta.
  H.firma = function () { return grandes().map(desc).join('|'); };
  // Lo que se ve al empezar la escena es "el HUD"; lo demás son paneles.
  H.base = function () { H._base = new Set(grandes()); return H._base.size; };
  H.extras = function () {
    var base = H._base || new Set();
    H._raices = raices(grandes().filter(function (e) { return !base.has(e) && !esHudFijo(e); }));
    return H._raices.map(desc);
  };
  H.errTotal = function () { return errs().length; };
  H.errDesde = function (n) { return errs().slice(n).map(function (e) { return e.slice(0, 400); }); };
  return H;
})(); true`;

/* ── Informe ──────────────────────────────────────────────────────────────── */
const informe = { modo: MODO, escenas: [], clima: [], combate: [], transiciones: [], fallos: [] };
function fallo(donde, que) { informe.fallos.push(donde + ' :: ' + que); console.log('   ✘ ' + que); }

/* ¿Se ha cerrado? Se mira varias veces: los paneles se van con una transición
   de opacidad y en un Edge sin GPU el hilo principal va con retraso. */
async function cerradoEn(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (!(await ev('__H.sigueAbierto()'))) return true;
    await dormir(250);
  }
  return false;
}

/* Cierra lo que se haya abierto: X del panel, el propio control otra vez o
   Escape. Apunta cada intento en `intentos` para poder diagnosticar. */
async function cerrarAbierto(clave, intentos = []) {
  const c = await ev('__H.cierre()');
  if (!c) intentos.push('sin botón de cerrar a la vista');
  else if (c.fueraDePantalla) intentos.push(c.desc + ' está FUERA de la pantalla');
  else if (c.tapado) intentos.push(c.desc + ' TAPADO por ' + c.tapado);
  else {
    await pulsar(c.x, c.y);
    if (await cerradoEn(2500)) return 'con ' + c.desc;
    intentos.push('pulsé ' + c.desc + ' y siguió abierto');
  }
  const p = clave ? await ev(`__H.punto(${JSON.stringify(clave)})`) : null;
  if (!clave) { /* limpieza entre controles: no hay botón que repetir */ }
  else if (!p) intentos.push('el botón no se ve con el panel abierto');
  else if (p.tapado) intentos.push('el botón queda tapado por ' + p.tapado);
  else {
    await pulsar(p.x, p.y);
    if (await cerradoEn(2000)) return 'pulsando el botón otra vez';
    intentos.push('pulsar el botón otra vez no lo cierra');
  }
  await tecla('Escape');
  if (await cerradoEn(1500)) return 'con Escape';
  intentos.push('Escape no lo cierra');
  return null;
}

/* Espera a que la pantalla deje de cambiar (dos lecturas seguidas iguales). */
async function quieto(max = 4000) {
  const t0 = Date.now();
  let prev = null, iguales = 0;
  while (Date.now() - t0 < max) {
    const f = await ev('__H.firma()');
    if (f === prev) { if (++iguales >= 2) return true; } else { iguales = 0; prev = f; }
    await dormir(300);
  }
  return false;
}

let anterior = null;   // el último control probado, para culparle si deja algo abierto

async function probarControl(escena, ctl) {
  const donde = escena + ' / ' + ctl.nombre;
  const r = { control: ctl.nombre, resultado: '' };
  await quieto(4000);
  // Si el control anterior dejó un panel abierto, se dice y se cierra antes de seguir.
  const extras = await ev('__H.extras()');
  if (extras.length) {
    const int = [];
    const ok = await cerrarAbierto(null, int);
    fallo(escena + ' / ' + (anterior || '?'), 'deja abierto ' + extras.join(', ') + (ok ? ' (se cerró ' + ok + ')' : ' y no hay forma de cerrarlo: ' + int.join('; ')));
    await quieto(3000);
  }
  anterior = ctl.nombre;
  const info = await ev(`__H.prepara(${JSON.stringify(ctl.clave)})`);
  if (!info.existe) { r.resultado = 'no existe'; return r; }
  if (!info.visible) { r.resultado = 'no visible'; return r; }
  if (info.fuera) { r.resultado = 'fuera de pantalla'; fallo(donde, 'fuera de la pantalla'); return r; }
  if (info.tapado) { r.resultado = 'TAPADO por ' + info.tapado; fallo(donde, 'tapado por ' + info.tapado); return r; }
  const botones0 = (await ev('__H.hud()')).botonesVisibles;
  await pulsar(info.x, info.y);
  // Se espera a que pase ALGO (hasta 3,5 s) y luego a que se quede quieto.
  const tc = Date.now();
  while (Date.now() - tc < 3500) {
    const x = await ev('__H.tras()');
    if (x.nuevos.length || x.perdidos.length || x.abrioVentana.length) break;
    await dormir(250);
  }
  await quieto(2500);
  const t = await ev('__H.tras()');
  r.abre = t.nuevos; r.oculta = t.perdidos;
  if (t.abrioVentana.length) r.ventana = t.abrioVentana;
  if (NIVEL2 && t.nuevos.length) r.dentro = await probarDentro(donde, ctl);
  if (t.nuevos.length) {
    r.conPanelAbierto = await ev('__H.estadoEscena()');
    const intentos = [];
    const como = await cerrarAbierto(ctl.clave, intentos);
    r.cierre = como || 'NO SE CIERRA';
    if (!como) fallo(donde, 'abre ' + t.nuevos.join(', ') + ' y NO se cierra (' + intentos.join('; ') + ')');
    else if (MODO === 'movil' && como === 'con Escape') {
      fallo(donde, 'en un teléfono NO se puede cerrar (solo con Escape): ' + intentos.join('; '));
    }
    else {
      // ¿Vuelve a abrir? Un manejador de más abre y cierra en el mismo clic.
      const i2 = await ev(`__H.prepara(${JSON.stringify(ctl.clave)})`);
      if (i2.visible && !i2.tapado) {
        await pulsar(i2.x, i2.y);
        const tc2 = Date.now();
        while (Date.now() - tc2 < 3500) {
          const x = await ev('__H.tras()');
          if (x.nuevos.length) break;
          await dormir(250);
        }
        await quieto(2500);
        const t2 = await ev('__H.tras()');
        r.reabre = t2.nuevos.length > 0;
        const int2 = [];
        if (!r.reabre) fallo(donde, 'la segunda vez no abre nada');
        else if (!(await cerrarAbierto(ctl.clave, int2))) fallo(donde, 'la segunda vez no se cierra (' + int2.join('; ') + ')');
      } else if (i2.tapado) fallo(donde, 'tras cerrar, el botón queda tapado por ' + i2.tapado);
    }
  } else if ((await ev('__H.hud()')).botonesVisibles !== botones0) {
    // Esconde/enseña los botones redondos (la columna mide menos de 60 px y no
    // cuenta como panel): se vuelve a pulsar y tienen que volver como estaban.
    const botones1 = (await ev('__H.hud()')).botonesVisibles;
    const p = await ev(`__H.punto(${JSON.stringify(ctl.clave)})`);
    if (p && !p.tapado) { await pulsar(p.x, p.y); await quieto(2000); }
    const botones2 = (await ev('__H.hud()')).botonesVisibles;
    r.botones = botones0 + ' → ' + botones1 + ' → ' + botones2;
    if (botones2 !== botones0) fallo(donde, 'los botones redondos no vuelven: ' + r.botones);
  } else if (t.perdidos.length) {
    // Oculta cosas (el botón de esconder el HUD): se vuelve a pulsar y deben volver.
    const p = await ev(`__H.punto(${JSON.stringify(ctl.clave)})`);
    if (p) { await pulsar(p.x, p.y); await dormir(700); }
    const vuelve = await ev(`(function(){ var h = __H.hud(); return h.botonesVisibles; })()`);
    r.restaura = vuelve;
  }
  const e = await ev('__H.errores()');
  if (e.length) { r.errores = e; fallo(donde, 'errores: ' + e.join(' | ').slice(0, 500)); }
  let st = await ev('__H.estadoEscena()');
  // La entrada se apaga un instante en cada pulsación sobre el HUD y vuelve con
  // un temporizador DE JUEGO: en un Edge sin GPU (pocos FPS) tarda. Se le da
  // hasta 5 s antes de llamarlo fallo, y se apunta a cuántos FPS iba.
  if (st.teclado === false || st.entrada === false) {
    const t0e = Date.now();
    while (Date.now() - t0e < 5000 && (st.teclado === false || st.entrada === false)) {
      await dormir(300); st = await ev('__H.estadoEscena()');
    }
    if (st.teclado !== false && st.entrada !== false) r.entradaTardo = Date.now() - t0e;
  }
  if (st.teclado === false || st.entrada === false) {
    st.fps = await ev('Math.round(game.loop.actualFps)');
    const abierto = await ev(`(function(){ __H.marca0 = true; return Array.from(document.body.children).filter(function(e){
      var r = e.getBoundingClientRect(); return r.width > 100 && r.height > 100 && __H.vis(e) && e.tagName !== 'CANVAS'; })
      .map(__H.desc).slice(0, 12); })()`);
    fallo(donde, 'tras cerrar, ' + (st.teclado === false ? 'el TECLADO ' : '') + (st.entrada === false ? 'la ENTRADA ' : '') +
      'de ' + st.escena + ' queda desactivado 5 s después (a ' + st.fps + ' FPS) · visible: ' + abierto.join(', '));
  }
  if (st.centro !== 'canvas' && !/game-container|#game\b|div#game/.test(st.centro)) r.centroTapadoPor = st.centro;
  r.resultado = t.nuevos.length ? 'abre ' + t.nuevos.join(', ') + ' · cierra ' + r.cierre + (r.reabre === false ? ' · NO REABRE' : '')
    : r.botones ? 'botones redondos ' + r.botones
    : t.perdidos.length ? 'oculta ' + t.perdidos.length + ' elementos · al repetir: ' + (r.restaura || '?')
    : (t.abrioVentana.length ? 'abre pestaña ' + t.abrioVentana.join(' ') : 'no abre nada visible');
  return r;
}

async function probarDentro(donde, ctl) {
  const botones = await ev('__H.dentro()');
  const out = [];
  for (const b of botones) {
    const n0 = await ev('__H.errTotal()');
    await pulsar(b.x, b.y); await dormir(450);
    const e = await ev(`__H.errDesde(${n0})`);
    const abierto = await ev('__H.sigueAbierto()');
    out.push(b.desc + (e.length ? ' → ERROR' : '') + (abierto ? '' : ' → cerró el panel'));
    if (e.length) fallo(donde + ' › ' + b.desc, 'errores: ' + e.join(' | ').slice(0, 400));
    if (!abierto) {
      // Se reabre para seguir con los demás botones.
      const p = await ev(`__H.prepara(${JSON.stringify(ctl.clave)})`);
      if (p.visible && !p.tapado) { await pulsar(p.x, p.y); await dormir(800); await ev('__H.tras()'); }
      if (!(await ev('__H.sigueAbierto()'))) break;
    }
  }
  return out;
}

/* CUÁNTOS MANEJADORES TIENE CADA BOTÓN, contados por el depurador (no por
   lo que dice el código). Dos manejadores de clic en un botón que abre y cierra
   un panel = lo abre y lo cierra en el mismo clic: "el botón no hace nada". */
const SCRIPTS = new Map();
const TIPOS_CLIC = ['click', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend'];
async function contarOyentes(escena) {
  const ctls = await ev('__H.controles()');
  ctls.push({ clave: '#close-panel', nombre: '✕ dashboard' }, { clave: '#sound-hub-close', nombre: '✕ sonido' },
            { clave: '#notif-close', nombre: '✕ mail' }, { clave: '#tx-hub-close', nombre: '✕ transacciones' },
            { clave: '#nft-close', nombre: '✕ nft' }, { clave: '#skills-close', nombre: '✕ skills' },
            { clave: '#gfc-x', nombre: '✕ monedas' }, { clave: '#inventory-panel .cerrar-hud', nombre: '✕ mochila' },
            { clave: '#gfa-cerrar', nombre: '✕ amigos' }, { clave: '#battleHubCloseBtn', nombre: '✕ hub batallas' });
  const out = [];
  for (const c of ctls) {
    const r = await cdp('Runtime.evaluate', { expression: `__H.el(${JSON.stringify(c.clave)})`, returnByValue: false });
    if (!r.result || !r.result.objectId) continue;
    const l = await cdp('DOMDebugger.getEventListeners', { objectId: r.result.objectId, depth: 0 });
    const por = {};
    (l.listeners || []).filter(x => TIPOS_CLIC.includes(x.type)).forEach(x => {
      const f = (SCRIPTS.get(x.scriptId) || '').split('/').pop().split('?')[0] || 'en línea';
      (por[x.type] = por[x.type] || []).push(f + ':' + ((x.lineNumber || 0) + 1));
    });
    const clics = (por.click || []).length;
    out.push({ control: c.nombre, clics, tipos: Object.fromEntries(Object.entries(por).map(([k, v]) => [k, v.length])), manejadores: por.click || [] });
    // El botón del chat lleva DOS a propósito: abrir/cerrar (la escena) y apagar
    // el aviso de mensaje nuevo (gf-chat-social). No es un duplicado.
    const propios = (por.click || []).filter(h => !/^gf-chat-social\.js:/.test(h));
    const esperados = c.nombre === 'chat' ? propios.length : clics;
    if (esperados > 1) fallo(escena + ' / ' + c.nombre, clics + ' manejadores de clic: ' + (por.click || []).join('  ||  '));
    await cdp('Runtime.releaseObject', { objectId: r.result.objectId }).catch(() => {});
  }
  const resumen = out.map(o => o.control + ':' + o.clics).join(' ');
  console.log('   manejadores de clic: ' + resumen);
  return out;
}

async function bateria(escena) {
  console.log(`\n── ${escena} ──`);
  await ev(LIB);
  // El HUD sale cuando la escena ha cargado la partida (nombre incluido). En
  // un Edge sin GPU eso tarda: se espera, y si no llega es un fallo de verdad.
  const t0 = Date.now();
  try {
    await hasta(`(function(){ var h = document.getElementById('game-hud'); var n = document.getElementById('username');
      return !!(h && h.classList.contains('hud-visible') && n && n.textContent && n.textContent !== 'Username'); })()`,
      'HUD visible', 45000);
  } catch (e) { fallo(escena, 'el HUD no aparece en 45 s'); }
  await quieto(8000);
  console.log(`   (HUD listo en ${Date.now() - t0} ms)`);
  await ev('__H.base()');
  anterior = null;
  const hud = await ev('__H.hud()');
  console.log('   HUD:', JSON.stringify(hud));
  const res = { escena, hud, controles: [] };
  res.oyentes = await contarOyentes(escena);
  if (process.env.SOLO_OYENTES === '1') { informe.escenas.push(res); return; }
  const n0 = await ev('__H.errTotal()');
  const ctls = await ev('__H.controles()');
  for (const c of ctls) {
    if (c.nombre === 'lands') continue;           // cambia de escena: va en las transiciones
    let r;
    try { r = await probarControl(escena, c); }
    catch (e) { r = { control: c.nombre, resultado: 'la prueba falló: ' + e.message }; fallo(escena + ' / ' + c.nombre, 'la prueba falló: ' + e.message); }
    res.controles.push(r);
    console.log(`   ${r.errores ? '✘' : '·'} ${c.nombre.padEnd(14)} ${r.resultado}${r.centroTapadoPor ? '  [centro: ' + r.centroTapadoPor + ']' : ''}`);
    if (r.dentro && r.dentro.length) console.log('       dentro: ' + r.dentro.join(' · '));
  }
  const eTot = await ev(`__H.errDesde(${n0})`);
  res.erroresEscena = eTot.length;
  informe.escenas.push(res);
}

/* ── Viajes ───────────────────────────────────────────────────────────────── */
const MAPA_NUEVO = `(function(){ var s = game.scene.getScene('GameScene');
  return !!(s && s.sys.isActive() && s.player && s.player.scene && s.map && s.collisionRectangles1 &&
    s.collisionRectangles1.length && (s !== window.__prevGS || s._sceneRunId !== window.__prevRun)); })()`;
const marcarMapa = () => ev(`(function(){ var s = game.scene.getScene('GameScene'); window.__prevGS = s; window.__prevRun = s && s._sceneRunId; return true; })()`);
const activa = (k, extra = 'true') => `(function(){ var s = game.scene.getScene('${k}'); return !!(s && s.sys.isActive() && (${extra})); })()`;

const HUD_LISTO = `(function(){ var h = document.getElementById('game-hud'); var n = document.getElementById('username');
  return !!(h && h.classList.contains('hud-visible') && n && n.textContent && n.textContent !== 'Username'); })()`;
async function esperarHud(que) { await hasta(HUD_LISTO, 'HUD en ' + que, 45000); await dormir(1200); }
const escenaActiva = () => ev(`(function(){ var a = game.scene.getScenes(true).map(function(s){ return s.sys.settings.key; });
  return a.filter(function(k){ return k !== 'LoadingScenegame' && k !== 'LoadingSceneshop'; })[0] || a[0] || null; })()`);

/* Si un viaje sale mal, se vuelve al mapa como sea antes de seguir: si no, un
   fallo arrastra a todas las pruebas de detrás (una cascada que no dice nada). */
async function alMapa() {
  for (let i = 0; i < 3; i++) {
    const k = await escenaActiva();
    if (k === 'GameScene' && await ev(MAPA_NUEVO.replace('&& (s !== window.__prevGS || s._sceneRunId !== window.__prevRun)', ''))) return true;
    await marcarMapa();
    if (k === 'tiendajuego') await ev(`(function(){ var t = game.scene.getScene('tiendajuego'); var d = t.collisionRectangles1[0]; t._puertaArmada = true;
      t.player.setPosition(d.centerX, d.y - 5); if (t.player.body) t.player.body.reset(d.centerX, d.y - 5); return true; })()`);
    else if (k === 'MinaScene') await ev(`game.scene.getScene('MinaScene')._volverAlMapa(), true`);
    else if (k === 'LandsScene') await ev(`GFLands.volver(game.scene.getScene('LandsScene')), true`);
    else if (k === 'BattleScene') await ev(`game.scene.getScene('BattleScene').volverAlMapa(), true`);
    try { await hasta(MAPA_NUEVO.replace('&& (s !== window.__prevGS || s._sceneRunId !== window.__prevRun)', ''), 'mapa (recuperación)', 45000); await esperarHud('mapa'); return true; }
    catch (e) {}
  }
  return false;
}

async function viaje(nombre, fn) {
  const n0 = await ev('(window.__mock && __mock.estado.errores.length) || 0');
  const t0 = Date.now();
  let ok = true;
  try { await fn(); }
  catch (e) { ok = false; fallo('viaje ' + nombre, e.message + ' (estaba en ' + (await escenaActiva()) + ')'); }
  const e = await ev(`(window.__mock && __mock.estado.errores.slice(${n0}).map(function(x){return x.slice(0,400);})) || []`);
  if (e.length) fallo('viaje ' + nombre, 'errores: ' + e.join(' | ').slice(0, 600));
  informe.transiciones.push({ viaje: nombre, ms: Date.now() - t0, errores: e, ok });
  console.log(`\n>> ${nombre} (${Date.now() - t0} ms)${ok ? '' : '  ✘ NO LLEGÓ'}${e.length ? '  ✘ ' + e.length + ' errores' : ''}`);
  if (!ok && !(await alMapa())) throw new Error('no se pudo volver al mapa tras "' + nombre + '"');
  return ok;
}
async function aLaTienda() {
  await ev(`(function(){ var gs = game.scene.getScene('GameScene'); var r = gs.collisionRectangles1[0]; gs._puertaArmada = true;
    gs.player.setPosition(r.centerX, r.y + 5); if (gs.player.body) gs.player.body.reset(r.centerX, r.y + 5); return true; })()`);
  await hasta(activa('tiendajuego', 's.player && s.collisionRectangles1 && s.collisionRectangles1.length'), 'tienda');
  await esperarHud('tienda');
}
async function deLaTiendaAlMapa() {
  await marcarMapa();
  await ev(`(function(){ var t = game.scene.getScene('tiendajuego'); var d = t.collisionRectangles1[0]; t._puertaArmada = true;
    t.player.setPosition(d.centerX, d.y - 5); if (t.player.body) t.player.body.reset(d.centerX, d.y - 5); return true; })()`);
  await hasta(MAPA_NUEVO, 'mapa desde la tienda');
  await esperarHud('mapa');
}
async function pulsarLands() {
  await ev(LIB);
  const p = await ev(`__H.punto('#lands-btn')`);
  if (!p) throw new Error('el botón de las islas no se ve');
  if (p.tapado) throw new Error('el botón de las islas está tapado por ' + p.tapado);
  await pulsar(p.x, p.y);
}
async function aLaIsla() {
  await pulsarLands();
  await hasta(activa('LandsScene', 's.player && s.player.scene'), 'isla');
  await esperarHud('isla');
}
async function deLaIslaAlMapa() {
  await marcarMapa();
  await pulsarLands();
  await hasta(MAPA_NUEVO, 'mapa desde la isla');
  await esperarHud('mapa');
}
async function aLaMina() {
  await ev(`game.scene.getScene('GameScene').entrarEnLaMina(), true`);
  await hasta(activa('MinaScene', 's.player && s.player.scene'), 'mina');
  await esperarHud('mina');
}
async function deLaMinaAlMapa() {
  await marcarMapa();
  await ev(`game.scene.getScene('MinaScene')._volverAlMapa(), true`);
  await hasta(MAPA_NUEVO, 'mapa desde la mina');
  await esperarHud('mapa');
}

/* Un combate entero con clics reales: hub de batallas → batalla diaria →
   cartas → "End turn" hasta ganar → vuelta al mapa. Y otro rindiéndose. */
async function combateCompleto(rendirse) {
  await marcarMapa();
  await ev(LIB);
  await ev(`game.scene.getScene('GameScene').openBattleHub(), true`);
  await dormir(700);
  const b = await ev(`__H.punto('#battleHubAdventureBtn')`);
  if (!b) throw new Error('el hub de batallas no enseña el botón de la batalla diaria');
  if (b.tapado) throw new Error('botón de batalla diaria tapado por ' + b.tapado);
  await pulsar(b.x, b.y);
  await hasta(activa('BattleScene', "s.estado === 'combate' && s.puedeJugar"), 'primer turno del combate', 30000);
  // Móvil en vertical: el aviso de girar el teléfono tapa la batalla; se usa su
  // botón "Play in portrait", igual que haría un jugador con el giro bloqueado.
  const seguir = await ev(`(function(){ var a = document.getElementById('battleRotateNotice');
    return a && !a.classList.contains('hidden') ? __H.punto('#battleRotateSeguir') : null; })()`);
  if (seguir) { await pulsar(seguir.x, seguir.y); await dormir(600); }
  const ui = await ev(`(function(){ var h = document.querySelectorAll('#bfHand > *'); return { cartas: h.length }; })()`);
  informe.combate.push({ rendirse, cartas: ui.cartas });
  if (rendirse) {
    const s = await ev(`__H.punto('#bfLeave') || __H.punto('#bfSurrender')`);
    if (!s) throw new Error('no se ve el botón de rendirse');
    await pulsar(s.x, s.y); await dormir(500);
    // Pide confirmación: segunda pulsación.
    const s2 = await ev(`__H.punto('#bfLeave') || __H.punto('#bfSurrender')`);
    if (s2) await pulsar(s2.x, s2.y);
  } else {
    for (let turno = 0; turno < 12; turno++) {
      const fin = await ev(`(function(){ var s = game.scene.getScene('BattleScene'); return !s || !s.sys.isActive() || s.estado === 'fin'; })()`);
      if (fin) break;
      await hasta(activa('BattleScene', "s.puedeJugar || s.estado === 'fin'"), 'turno ' + (turno + 1), 15000);
      if (await ev(`game.scene.getScene('BattleScene').estado === 'fin'`)) break;
      // Dos cartas de ataque (índices 0 y 3 = Claw + Bite) y "End turn".
      for (const i of [0, 3]) {
        const c = await ev(`(function(){ var el = document.querySelectorAll('#bfHand > *')[${i}]; if (!el || !__H.vis(el)) return null;
          var r = el.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()`);
        if (c) { await pulsar(c.x, c.y); await dormir(250); }
      }
      const e = await ev(`__H.punto('#bfEndTurn')`);
      if (!e) throw new Error('no se ve "End turn"');
      await pulsar(e.x, e.y);
      await dormir(1800);
    }
  }
  await hasta(MAPA_NUEVO, 'mapa tras el combate', 30000);
  await esperarHud('mapa tras el combate');
}

/* ── Clima ────────────────────────────────────────────────────────────────── */
async function probarClima(escena) {
  if (!(await ev('!!(window.GFClima && GFClima.probar)'))) return;
  const tiempos = ['lluvia', 'tormenta', 'nieve', 'viento', 'soleado', 'nublado'];
  for (const q of tiempos) {
    const n0 = await ev('(__mock.estado.errores.length)');
    await ev(`GFClima.probar('${q}'), true`);
    await dormir(3500);
    const d = await ev(`(function(){ try { var x = GFClima.diagnostico(); return { montado: x.montado, piezas: x.piezas, faltan: x.texturasQueFaltan }; } catch (e) { return String(e); } })()`);
    const e = await ev(`__mock.estado.errores.slice(${n0}).map(function(x){return x.slice(0,300);})`);
    informe.clima.push({ escena, tiempo: q, diag: d, errores: e });
    console.log(`   clima ${escena} ${q.padEnd(9)} ${e.length ? '✘ ' + e.join(' | ').slice(0, 300) : 'ok'} ${JSON.stringify(d).slice(0, 160)}`);
    if (e.length) fallo('clima ' + escena + ' ' + q, e.join(' | ').slice(0, 400));
  }
  const est = await ev(`Object.keys((GFClima._interno && GFClima._interno.ESTACIONES) || {})`);
  for (const s of est) {
    const n0 = await ev('(__mock.estado.errores.length)');
    await ev(`GFClima.probarEstacion('${s}'), true`);
    await dormir(1500);
    const e = await ev(`__mock.estado.errores.slice(${n0}).map(function(x){return x.slice(0,300);})`);
    console.log(`   estación ${s.padEnd(10)} ${e.length ? '✘ ' + e.join(' | ').slice(0, 300) : 'ok'}`);
    if (e.length) fallo('estación ' + s, e.join(' | ').slice(0, 400));
  }
}

/* ── Arranque ─────────────────────────────────────────────────────────────── */
try {
  let lista;
  for (let i = 0; i < 60; i++) {
    try { lista = await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json(); if (lista.length) break; } catch (e) {}
    await dormir(300);
  }
  let pagina = (lista || []).find(t => t.type === 'page');
  if (!pagina) pagina = await (await fetch(`http://127.0.0.1:${PUERTO}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) {
      const p = pend.get(d.id); pend.delete(d.id);
      if (d.error) p.mal(new Error(p.method + ': ' + JSON.stringify(d.error))); else p.ok(d.result);
    } else if (d.method) oyentes.forEach(f => f(d));
  });
  // Un diálogo nativo (alert/confirm) congelaría la página: se cierra solo.
  oyentes.push((d) => {
    if (d.method === 'Page.javascriptDialogOpening') {
      informe.transiciones.push({ dialogo: d.params.message });
      cdp('Page.handleJavaScriptDialog', { accept: false }).catch(() => {});
    }
  });
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  // scriptId → fichero, para decir DÓNDE está cada manejador de clic.
  oyentes.push((d) => { if (d.method === 'Debugger.scriptParsed') SCRIPTS.set(d.params.scriptId, d.params.url); });
  await cdp('Debugger.enable');
  if (MODO === 'movil') {
    // ORIENTACION=vertical|horizontal (por defecto horizontal): el juego no
    // bloquea el giro, así que hay que probar las dos.
    const vertical = process.env.ORIENTACION === 'vertical';
    await cdp('Emulation.setDeviceMetricsOverride', vertical
      ? { width: 412, height: 915, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 0 } }
      : { width: 915, height: 412, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36' });
  } else {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  }
  await cdp('Page.navigate', { url: URL_PRUEBA });
  console.log(`MODO ${MODO}${NIVEL2 ? ' + botones de dentro de los paneles' : ''}: ${URL_PRUEBA}`);
  await hasta(`(function(){ var s = window.game && game.scene.getScene('GameScene');
    return !!(s && s.sys.isActive() && s.player && s.map && s.collisionRectangles1 && s.collisionRectangles1.length); })()`, 'primer mapa', 120000);
  await dormir(3000);

  await bateria('mapa');
  if (process.env.SOLO_OYENTES !== '1') await probarClima('mapa');
  await ev(`GFClima.probar('tormenta'), true`);
  await viaje('mapa → tienda (con tormenta)', aLaTienda);
  await bateria('tienda');
  await viaje('tienda → mapa', deLaTiendaAlMapa);
  await bateria('mapa tras la tienda');
  await viaje('mapa → mina', aLaMina);
  await bateria('mina');
  await viaje('mina → mapa', deLaMinaAlMapa);
  await bateria('mapa tras la mina');
  await viaje('mapa → isla (botón)', aLaIsla);
  await bateria('isla');
  if (process.env.SOLO_OYENTES !== '1') await probarClima('isla');
  await viaje('isla → mapa (botón)', deLaIslaAlMapa);
  await bateria('mapa tras la isla');
  await viaje('mapa → tienda', aLaTienda);
  await viaje('tienda → isla (botón)', aLaIsla);
  await bateria('isla desde la tienda');
  await viaje('isla → mapa (botón)', deLaIslaAlMapa);
  await bateria('mapa tras isla-desde-tienda');
  await viaje('combate completo (ganando)', () => combateCompleto(false));
  await bateria('mapa tras el combate');
  await viaje('combate rindiéndose', () => combateCompleto(true));
  await bateria('mapa tras rendirse');
  await ev(`GFClima.probar('nieve'), true`);
  await viaje('mapa → mina (con nieve)', aLaMina);
  await viaje('mina → mapa', deLaMinaAlMapa);

  const vivo = await ev(`(function(){ var f = game.loop.frame; return new Promise(function(r){ setTimeout(function(){ r(game.loop.frame > f); }, 1500); }); })()`, true);
  if (!vivo) fallo('final', 'el bucle del juego está PARADO');
  console.log('\n══ RESUMEN ' + MODO + ': ' + informe.fallos.length + ' fallos ══');
  informe.fallos.forEach(f => console.log(' ✘ ' + f));
  if (SALIDA) fs.writeFileSync(SALIDA, JSON.stringify(informe, null, 1));
} catch (e) {
  console.error('FALLO DE LA PRUEBA', e);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch (e) {}
  edge.kill();
}
