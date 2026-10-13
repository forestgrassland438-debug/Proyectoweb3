const fs = require('node:fs');
const target='C:/Users/pc/Desktop/server2.js';let b=fs.readFileSync(target),original=b;
function repl(a,s){const n=Buffer.from(a),p=b.indexOf(n);if(p<0||b.indexOf(n,p+1)>=0)throw Error('anchor '+a.slice(0,55));b=Buffer.concat([b.subarray(0,p),Buffer.from(s),b.subarray(p+n.length)]);}
const begin=Buffer.from('// CHARACTER-WORLD BEGIN\r\n'),finish=Buffer.from('// CHARACTER-WORLD END');
const a=b.indexOf(begin),z=b.indexOf(finish,a);if(a<0||z<0)throw Error('block');
b=Buffer.concat([b.subarray(0,a+begin.length),Buffer.from(fs.readFileSync(__dirname+'/character-world-server.js','utf8').replace(/\r?\n/g,'\r\n')+'\r\n'),b.subarray(z)]);
const buy=Buffer.from("app.post('/api/alchemist/buy', apiLimiter, authMiddleware, csrfProtection, async (req, res) => {");
const from=b.indexOf(buy);if(from>=0){const to=b.indexOf(Buffer.from('\r\n});'),from)+6;if(to<6)throw Error('buy end');b=Buffer.concat([b.subarray(0,from),Buffer.from("app.post('/api/alchemist/buy', apiLimiter, authMiddleware, csrfProtection, gfAlchemistBuy);"),b.subarray(to)]);}
if(b.indexOf(Buffer.from('if (_venenos.get(playerName) !== v) return;'))<0)repl("    if (!doc) { _venenos.delete(playerName); return; }", "    if (_venenos.get(playerName) !== v) return;\r\n    if (!doc) { _venenos.delete(playerName); return; }");
if(b.indexOf(Buffer.from("const basePesca = zonaDeSala(sala)"))<0){
  repl("    if (!sala || !['game','isla'].includes(salaBase(sala)) || !rooms[sala] || !rooms[sala][s.id]) continue;", "    const basePesca = zonaDeSala(sala) === 'island' ? 'isla' : salaBase(sala);\r\n    if (!sala || !['game','isla'].includes(basePesca) || !rooms[sala] || !rooms[sala][s.id]) continue;");
  repl('return { x: p.x, y: p.y, sala: salaBase(sala) };','return { x: p.x, y: p.y, sala: basePesca };');
}
fs.writeFileSync(target+'.bak-character-world-update-'+Date.now(),original,{flag:'wx'});fs.writeFileSync(target,b);console.log('Updated character routes and island room fishing.');
