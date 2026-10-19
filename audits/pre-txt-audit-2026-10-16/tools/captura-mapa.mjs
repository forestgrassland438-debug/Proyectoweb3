/**
 * Saca la captura del suelo del mapa principal con Edge sin ventana.
 *
 *   node tools/captura-mapa.mjs [carpeta_de_salida]
 *
 * Necesita el servidor estático de bin en http://localhost:8123 (el de
 * .claude/launch.json, "gf-static"). Abre tools/captura-mapa.html, que hace
 * lo mismo que el bloque comentado de GameScene (dibujar la capa de casillas
 * en una RenderTexture y descargarla como mapa_exportado.png), deja que el
 * navegador la descargue en la carpeta de salida y la renombra a
 * mapa_principal.png. Por defecto la carpeta es ../../recortar (la de
 * recortar.js).
 *
 * Mismo Edge y mismas banderas que tools/hud-prueba.mjs.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.resolve(process.argv[2] || path.join(AQUI, '..', '..', '..', 'recortar'));
const URL = process.env.URL_CAPTURA || 'http://localhost:8123/tools/captura-mapa.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PERFIL = 'C:/Users/pc/AppData/Local/Temp/gf-edge-captura';
const PUERTO = 9360;
const dormir = (ms) => new Promise(r => setTimeout(r, ms));

fs.mkdirSync(SALIDA, { recursive: true });
const descargada = path.join(SALIDA, 'mapa_exportado.png');
if (fs.existsSync(descargada)) fs.unlinkSync(descargada);

const edge = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${PERFIL}`,
  '--no-first-run', '--disable-extensions', '--use-angle=d3d11', '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization', '--window-size=800,600', 'about:blank'
], { stdio: 'ignore' });

let ws, sig = 1;
const pend = new Map();
let descargaTerminada = false, descargaFallida = null;
function cdp(method, params = {}, sessionId) {
  const id = sig++;
  const msg = { id, method, params };
  if (sessionId) msg.sessionId = sessionId;
  ws.send(JSON.stringify(msg));
  return new Promise((ok, mal) => pend.set(id, { ok, mal, method }));
}

async function main() {
  let version = null;
  for (let i = 0; i < 60 && !version; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${PUERTO}/json/version`)).json(); } catch (e) { await dormir(250); }
  }
  if (!version) throw new Error('Edge no arranca');
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((ok, mal) => { ws.onopen = ok; ws.onerror = mal; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Browser.downloadProgress') {
      if (m.params.state === 'completed') descargaTerminada = true;
      if (m.params.state === 'canceled') descargaFallida = 'cancelada';
    }
    if (m.id && pend.has(m.id)) {
      const p = pend.get(m.id); pend.delete(m.id);
      if (m.error) p.mal(new Error(p.method + ': ' + m.error.message)); else p.ok(m.result);
    }
  };

  await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: SALIDA, eventsEnabled: true });
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  await cdp('Page.enable', {}, sessionId);
  await cdp('Runtime.enable', {}, sessionId);
  // `&` si la URL ya trae parámetros (captura-escena.html?escena=...).
  await cdp('Page.navigate', { url: URL + (URL.includes('?') ? '&' : '?') + 'r=' + Date.now() }, sessionId);

  const t0 = Date.now();
  let hecha = null;
  while (Date.now() - t0 < 120000) {
    const r = await cdp('Runtime.evaluate', { expression: 'JSON.stringify(window.__capturaHecha || null)', returnByValue: true }, sessionId);
    hecha = JSON.parse(r.result.value || 'null');
    if (hecha) break;
    await dormir(500);
  }
  if (!hecha) throw new Error('la página no llegó a hacer la captura');
  if (hecha.b64) {
    // La página dejó el PNG en base64 (captura-escena.html): se lee a trozos.
    const largo = (await cdp('Runtime.evaluate', { expression: 'window.__capturaB64.length', returnByValue: true }, sessionId)).result.value;
    const partes = [];
    for (let i = 0; i < largo; i += 4000000) {
      const r = await cdp('Runtime.evaluate', { expression: `window.__capturaB64.slice(${i}, ${i + 4000000})`, returnByValue: true }, sessionId);
      partes.push(r.result.value);
    }
    const final = path.join(SALIDA, 'mapa_principal.png');
    fs.writeFileSync(final, Buffer.from(partes.join(''), 'base64'));
    console.log('captura:', hecha.ancho + 'x' + hecha.alto, '->', final, '(' + fs.statSync(final).size + ' bytes)');
    return;
  }
  // La descarga de un PNG de 5008 x 5008 tarda: se espera al aviso de
  // Edge de que ha terminado (no basta con ver el archivo: mientras se
  // escribe se llama .crdownload).
  for (let i = 0; i < 1200 && !descargaTerminada && !descargaFallida; i++) await dormir(250);
  if (descargaFallida) throw new Error('descarga ' + descargaFallida);
  for (let i = 0; i < 40 && !fs.existsSync(descargada); i++) await dormir(250);
  if (!descargaTerminada || !fs.existsSync(descargada)) throw new Error('no apareció ' + descargada);
  const tam = fs.statSync(descargada).size;
  const final = path.join(SALIDA, 'mapa_principal.png');
  fs.copyFileSync(descargada, final);
  console.log('captura:', hecha.ancho + 'x' + hecha.alto, '->', final, '(' + tam + ' bytes)');
}

main().then(() => { try { edge.kill(); } catch (e) {} process.exit(0); },
            (e) => { console.error('ERROR', e.message); try { edge.kill(); } catch (x) {} process.exit(1); });
