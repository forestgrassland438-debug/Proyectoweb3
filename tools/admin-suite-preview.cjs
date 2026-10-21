'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const allow = new Set(['control-center.html','control-center.css','control-center.js','admin-session.js','admin-suite.js','admin-suite.css','admin-suite-i18n.js','mission-studio.css','mission-studio.js','admin.html','admin-impact.js','admin-impact.css','colecciones.html','colecciones.css','colecciones.js','climas.html','consola-reportes.html','contrato-stats.html','misiones.html','puerta_login.html','puerta-login.html','reporter.html','reporter.js','favicon.png','vendor/ethers.umd.min.js']);
const server = http.createServer((req,res) => {
  let relative;
  try { relative = decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'') || 'control-center.html'; }
  catch (_) { res.writeHead(400).end(); return; }
  const file = path.resolve(root,relative);
  if (!file.startsWith(root+path.sep) || (!allow.has(relative) && !relative.startsWith('assets/collections-')) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
  fs.createReadStream(file).pipe(res);
});
const port=Number(process.env.GF_ADMIN_PREVIEW_PORT??8137);
server.listen(Number.isInteger(port)&&port>=0&&port<=65535?port:8137,'127.0.0.1',() => console.log('Local: http://127.0.0.1:'+server.address().port+'/control-center.html'));
process.on('SIGINT',() => server.close());
module.exports = server;
