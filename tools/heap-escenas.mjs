/* ¿Qué escenas se quedan en memoria al ir y volver? — con un heap snapshot de verdad.
 *
 * Lanza Edge sin interfaz con depuración remota, abre el banco de pruebas
 * (_prueba_offline.html, sin backend), da N vueltas mapa <-> destino, fuerza el
 * GC, cuelga una marca con nombre propio (MarcaFuga_<escena>_<n>) de cada
 * escena que sigue viva y guarda un .heapsnapshot. Luego:
 *     node --max-old-space-size=8000 tools/retenedores-heap.mjs <snapshot>
 * imprime la cadena exacta desde las raíces del GC hasta cada escena marcada.
 *
 *   python -m http.server 8123            (o el preview gf-static)
 *   RUTA=tienda|mina|islas|batalla node tools/heap-escenas.mjs  *        "http://localhost:8123/_prueba_offline.html?r=1" C:/ruta/salida.heapsnapshot 3
 *
 * LO QUE COSTÓ HACERLO FUNCIONAR (2026-09-23):
 *   - El perfil de Edge va en una ruta CORTA: con la del scratchpad de Claude
 *     Edge salía sin decir nada y sin abrir el puerto.
 *   - Desde la shell aislada de Claude Edge no arranca: hay que ejecutarlo
 *     fuera del aislamiento.
 *   - Sin `--disable-features=BackForwardCache` la página anterior se queda en
 *     la caché de retroceso y su heap sale mezclado en el snapshot.
 *   - MinaScene, LandsScene y BattleScene se REUTILIZAN (misma instancia): que
 *     salgan "VIVA" es normal. GameScene solo es nueva tras pasar por la tienda.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const URL_PRUEBA = process.argv[2];
const SALIDA = process.argv[3];
const VUELTAS = Number(process.argv[4] || 2);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PERFIL = 'C:/Users/pc/AppData/Local/Temp/gf-edge-prof';
const PUERTO = Number(process.env.PUERTO || 9335);
const YA = !!process.env.PUERTO;

const dormir = (ms) => new Promise(r => setTimeout(r, ms));
const edge = YA ? { kill() {} } : spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${PERFIL}`,
  '--no-first-run', '--disable-extensions', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
  '--window-size=1280,800', '--disable-features=BackForwardCache', 'about:blank'
], { stdio: 'ignore' });

let ws, sig = 1;
const pend = new Map();
const oyentes = [];
function cdp(method, params = {}) {
  const id = sig++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((ok, mal) => pend.set(id, { ok, mal, method }));
}
async function evaluar(expr, esperar = true) {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: esperar, returnByValue: true });
  if (r.exceptionDetails) throw new Error(expr.slice(0, 80) + ' -> ' + JSON.stringify(r.exceptionDetails).slice(0, 600));
  return r.result.value;
}

try {
  let lista;
  for (let i = 0; i < 50; i++) {
    try { lista = await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json(); if (lista.length) break; } catch (e) {}
    await dormir(300);
  }
  let pagina = (lista || []).find(t => t.type === 'page');
  if (!pagina) pagina = await (await fetch(`http://127.0.0.1:${PUERTO}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) {
      const p = pend.get(m.id); pend.delete(m.id);
      if (m.error) p.mal(new Error(p.method + ': ' + JSON.stringify(m.error))); else p.ok(m.result);
    } else if (m.method) oyentes.forEach(f => f(m));
  });
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('HeapProfiler.enable');
  await cdp('Page.navigate', { url: URL_PRUEBA });
  console.log('navegando', URL_PRUEBA);

  // Espera a la primera GameScene jugable.
  for (let i = 0; i < 240; i++) {
    await dormir(500);
    let ok = false;
    try {
      ok = await evaluar(`(() => { const s = window.game && game.scene.getScene('GameScene');
        return !!(s && s.sys.isActive() && s.player && s.collisionRectangles1 && s.collisionRectangles1.length); })()`, false);
    } catch (e) {}
    if (ok) break;
    if (i === 239) throw new Error('la GameScene no llega');
  }
  console.log('GameScene lista; vueltas:', VUELTAS);

  const RUTA = process.env.RUTA || 'tienda';
  const RUTAS = {
    tienda: { clave: 'tiendajuego', etiqueta: 'tienda',
      ir: `const r = gs.collisionRectangles1[0]; gs._puertaArmada = true;
           gs.player.setPosition(r.centerX, r.y + 5); if (gs.player.body) gs.player.body.reset(r.centerX, r.y + 5);`,
      volver: `const d = t.collisionRectangles1[0]; t._puertaArmada = true;
           t.player.setPosition(d.centerX, d.y - 5); if (t.player.body) t.player.body.reset(d.centerX, d.y - 5);`,
      lista: `s.player && s.collisionRectangles1 && s.collisionRectangles1.length` },
    mina: { clave: 'MinaScene', etiqueta: 'mina',
      ir: `gs.entrarEnLaMina();`, volver: `t._volverAlMapa();`, lista: `!!s.player` },
    islas: { clave: 'LandsScene', etiqueta: 'isla',
      ir: `GFLands.ir(gs);`, volver: `GFLands.volver(t);`, lista: `!!s.player` },
    batalla: { clave: 'BattleScene', etiqueta: 'batalla',
      ir: `gs.startPvpBattle('bot');`, volver: `t.volverAlMapa();`, lista: `true` }
  };
  const R = RUTAS[RUTA];
  const res = await evaluar(`(async () => {
    window.__refs = [];
    const dormir = (ms) => new Promise(r => setTimeout(r, ms));
    const esperar = async (clave, lista) => { const t0 = Date.now(); while (Date.now() - t0 < 60000) {
      const s = game.scene.getScene(clave);
      if (s && s.sys.isActive() && lista(s)) return s;
      await dormir(250); } throw new Error('no llega ' + clave); };
    const listaMapa = (s) => s.player && s.collisionRectangles1 && s.collisionRectangles1.length;
    const listaDestino = (s) => ${R.lista};
    for (let i = 0; i < ${VUELTAS}; i++) {
      const gs = await esperar('GameScene', listaMapa); window.__refs.push({ k: 'GameScene', r: new WeakRef(gs) });
      await dormir(2500);
      ${R.ir}
      const t = await esperar('${R.clave}', listaDestino); window.__refs.push({ k: '${R.etiqueta}', r: new WeakRef(t) });
      await dormir(2500);
      ${R.volver}
    }
    await esperar('GameScene', listaMapa); await dormir(3000);
    return window.__refs.length;
  })()`);
  console.log('vueltas hechas, refs:', res);
  const diag = await evaluar(`(() => {
    const b = document.getElementById('lands-btn');
    const errs = (window.__mock && __mock.estado.errores) || [];
    return { landsOnclick: b ? typeof b.onclick : 'sin boton', errores: errs.length,
             muestra: errs.slice(0, 12).map(e => e.slice(0, 400)) };
  })()`, false);
  console.log('diagnostico:', JSON.stringify(diag, null, 1));

  for (let i = 0; i < 4; i++) { await cdp('HeapProfiler.collectGarbage'); await dormir(300); }
  // Marca: una instancia de una clase con nombre propio cuelga de cada escena
  // que sigue viva sin deber. El snapshot la encuentra por ese nombre.
  const vivas = await evaluar(`(() => {
    const out = [];
    window.__refs.forEach((x, i) => {
      const o = x.r.deref();
      if (!o) { out.push(x.k + '#' + i + ':lib'); return; }
      const nombre = 'MarcaFuga_' + x.k + '_' + i;
      const C = ({ [nombre]: class {} })[nombre];
      o.__marcaFuga = new C();
      out.push(x.k + '#' + i + ':VIVA');
    });
    return out.join(' ');
  })()`, false);
  console.log('estado:', vivas);

  const trozos = [];
  oyentes.push((m) => { if (m.method === 'HeapProfiler.addHeapSnapshotChunk') trozos.push(m.params.chunk); });
  await cdp('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false });
  fs.writeFileSync(SALIDA, trozos.join(''));
  console.log('snapshot:', SALIDA, (fs.statSync(SALIDA).size / 1e6).toFixed(1), 'MB');
} catch (e) {
  console.error('FALLO', e);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch (e) {}
  edge.kill();
}
