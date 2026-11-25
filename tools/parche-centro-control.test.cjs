'use strict';
/* El parche de despliegue (GrasslandBuild/scripts/prepare-deploy.cjs) copia una LISTA de archivos.
 * Hasta el 2026-11-20 se quedaban fuera ocho herramientas del centro de control (climas, cuentas,
 * reportes, acceso, precios, cultivos, recursos y el monitor de errores) y scripts de las que sí
 * iban (mission-studio.* de misiones, economia2/economia-supervisor de economía): en la web
 * publicada esas pestañas daban 404 o se quedaban a medias.
 *
 * Esta prueba lee las herramientas que monta control-center.js, sigue lo que carga cada página
 * (scripts, estilos, imágenes y las páginas a las que enlaza) y exige que todo esté en la lista.
 *
 *   node --test tools/parche-centro-control.test.cjs
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BIN = path.resolve(__dirname, '..');
const PREPARAR = process.env.GF_PREPARE_DEPLOY || path.join(BIN, 'GrasslandBuild/scripts/prepare-deploy.cjs');

function herramientas() {
  const cc = fs.readFileSync(path.join(BIN, 'control-center.js'), 'utf8');
  return [...new Set([...cc.matchAll(/file:'([^']+\.html)'/g)].map((m) => m[1]))];
}

/** Lo que una página carga o enlaza de la propia carpeta (sin ?v=, sin #, sin URLs de fuera). */
function referencias(pagina) {
  const html = fs.readFileSync(path.join(BIN, pagina), 'utf8');
  const out = [];
  for (const m of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
    const r = m[1].trim();
    if (!r || r.startsWith('#') || /^(?:[a-z]+:|\/\/)/i.test(r)) continue;
    const limpio = r.replace(/^\.\//, '').replace(/[?#].*$/, '');
    if (limpio) out.push(path.posix.normalize(path.posix.join(path.posix.dirname(pagina), limpio)));
  }
  return out;
}

// El juego (index.html / game.html) se enlaza desde alguna herramienta, pero lo suyo lo reparte
// prepare-deploy por carpetas (listar): aquí basta con que la página vaya, sin seguir dentro.
const JUEGO = new Set(['index.html', 'game.html']);

// Incluye las páginas enlazadas: la guía de economía (GUIA-ECONOMIA.html) se publica desde el
// 2026-11-20 y con ella sus imágenes de assets/economia y audits/metricas-20261029.
function cierre(paginas) {
  const visto = new Set();
  const pila = [...paginas];
  while (pila.length) {
    const f = pila.pop();
    if (visto.has(f)) continue;
    visto.add(f);
    if (f.endsWith('.html') && !JUEGO.has(f) && fs.existsSync(path.join(BIN, f))) pila.push(...referencias(f));
  }
  return visto;
}

function listaDelParche() {
  const src = fs.readFileSync(PREPARAR, 'utf8');
  const literales = new Set([...src.matchAll(/'([^'\n]+)'/g)].map((m) => m[1]));
  const index = fs.readFileSync(path.join(BIN, 'index.html'), 'utf8');
  for (const m of index.matchAll(/<script\b[^>]*\bsrc=["']\.\/([^"'?]+\.js)(?:\?[^"']*)?["']/g)) literales.add(m[1]);
  for (const m of index.matchAll(/<link\b[^>]*\bhref=["']\.\/([^"'?]+\.css)(?:\?[^"']*)?["']/g)) literales.add(m[1]);
  return literales;
}

test('control-center.js monta herramientas que existen en bin', () => {
  const lista = herramientas();
  assert.ok(lista.length >= 15, 'se leyeron ' + lista.length + ' herramientas');
  for (const f of lista) assert.ok(fs.existsSync(path.join(BIN, f)), f + ' no existe');
});

test('todo lo que carga el centro de control va en el parche de despliegue', () => {
  const parche = listaDelParche();
  const todo = cierre(['control-center.html', ...herramientas()]);
  const noExisten = [...todo].filter((f) => !fs.existsSync(path.join(BIN, f)));
  assert.deepEqual(noExisten, [], 'referencias a archivos que no existen en bin');
  const fuera = [...todo].filter((f) => !parche.has(f)).sort();
  assert.deepEqual(fuera, [], 'falta en la lista de prepare-deploy.cjs');
});
