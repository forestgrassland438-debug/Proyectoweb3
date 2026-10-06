'use strict';
// Solo fixture local y perfil nuevo; no conecta wallets ni el servidor real.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/pc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'GrasslandBuild/dist');
async function main() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.ogg': 'audio/ogg' };
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, chromiumSandbox: true });
  const errors = [], samples = [];
  try {
    for (const mobile of [false, true]) {
      const page = await browser.newPage({ viewport: mobile ? { width: 915, height: 412 } : { width: 1280, height: 720 }, hasTouch: mobile });
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/_prueba_combate.html`, { waitUntil: 'networkidle' });
      for (let run = 0; run < 3; run++) {
        await page.locator('[data-modo="practica"]').click();
        await page.waitForFunction(() => window.game && game.scene.getScene('BattleScene').estado === 'combate');
        await page.evaluate(() => {
          const b = game.scene.getScene('BattleScene');
          // Fixture de la geometría real, sin saltar reloj/destrozar la partida.
          b._pintarNiebla = b._pintarNiebla.bind(b);
          b.zona.r0 = 900; b.zonaR = b.zonaRObjetivo = 185;
          const p = b.pred; b.zonaC = b.zonaCObjetivo = { x: p.x + 120, y: p.y + 30 };
          b.zonaSig = { x: p.x + 150, y: p.y + 30, r: 125 }; b.zonaEstado = 1;
          // Los snaps del fixture no sobrescriben la visual que examinamos.
          b.socket.off('brawl:snap', b._listeners.find(x => x[0] === 'brawl:snap')?.[1]);
          b.alSnap = () => {};
        });
        await page.waitForTimeout(500);
        const stats = await page.evaluate(() => {
          const b = game.scene.getScene('BattleScene');
          return { cloud: !!b.nieblaNubes, fogVisible: b.nieblaRT?.visible,
            children: b.children.list.length, textures: game.textures.getTextureKeys().length,
            fogTextures: game.textures.getTextureKeys().filter(k => k.includes('niebla')).length,
            renderer: game.renderer.type };
        });
        assert.equal(stats.cloud, true); assert.equal(stats.fogVisible, true);
        samples.push({ mobile, run, ...stats });
        if (!run) { await page.waitForTimeout(1100); await page.locator('#mando').evaluate(el => el.style.display = 'none');
          await page.screenshot({ path: path.join(dist, `battle-fog-${mobile ? 'android' : 'desktop'}.png`) });
          await page.locator('#mando').evaluate(el => el.style.display = ''); }
        await page.evaluate(() => game.scene.getScene('BattleScene').rendirse());
        await page.waitForFunction(() => game.scene.isActive('LoadingScenegame'));
        assert.equal(await page.evaluate(() => game.textures.exists('bfx_niebla')), false);
      }
      await page.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(dist, 'battle-visual-verification.json'), JSON.stringify({ fixtureOnly: true, errors, samples, cycles: 6, releasedAfterExit: true }, null, 2));
    console.log('OK: niebla animada en PC/móvil, seis entradas/salidas, texturas liberadas, sin errores JS.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
