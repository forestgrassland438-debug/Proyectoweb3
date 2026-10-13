'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
let html = fs.readFileSync('index.html', 'utf8');
const revised = new Set(['styless.css','viewport-fix.js','gf-profundidad.js','gf-cuervo.js','gf-animales.js','gf-pesca.js','gf-viento.js','gf-clima.js','gf-mina-zombis.js','gf-alquimista.js','Scenes/GameScene.js','Scenes/tiendajuego.js','Scenes/LoadingScenegame.js','Scenes/MinaScene.js','Scenes/LandsScene.js','Scenes/BattleScene.js','Scenes/ShopScene.js','phaser-relay-library.js','tienda_sistema.js']);
['gf-session-api.js','gf-character-skills.js','gf-character-skills.css','gf-espada.js','gf-espada-poderes.css','gf-mina-serpiente.js','gf-mina-espectros.js'].forEach(file=>revised.add(file));
html = html.replace(/((?:src|href)=["'](?:\.\/)?)([^"'?]+)(\?v=[^"']+)(["'])/g, (all, prefix, file, query, end) => revised.has(file) ? prefix + file + '?v=22.4.' + crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0,12) + end : all);
fs.writeFileSync('index.html', html);
const missing = [...html.matchAll(/(?:src|href)=["'](?:\.\/)?([^"'?]+\.(?:js|css))(?:\?[^"']*)?["']/g)].map(m => m[1]).filter(file => !/^https?:/.test(file) && !fs.existsSync(file));
if (missing.length) { console.error('Missing entry files:', missing); process.exitCode = 1; }
let website = fs.readFileSync('../index.html','utf8');
website = website.replace(/1\.1\.1/g, '1.1.2');
fs.writeFileSync('../index.html',website);
console.log('Release URLs updated; current source and unrelated manual edits retained.');
