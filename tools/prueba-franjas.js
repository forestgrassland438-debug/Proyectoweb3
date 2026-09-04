// Prueba de la segmentación óptima, aislada del navegador.
global.window = global;
global.document = { createElement: () => ({ getContext: () => null }) };
require(process.cwd() + '/gf-profundidad.js');
const I = global.GFProfundidad._interno;

function cols(tramos) {           // [[nColumnas, y], ...]
  const out = []; let x = 0;
  for (const [n, y] of tramos) for (let i = 0; i < n; i++) out.push({ x: x += 8, y });
  return out;
}
function ver(nombre, c, esperado) {
  const fr = I.franjasDe(c);
  const n = fr ? fr.length : 1;
  const ys = fr ? fr.map(f => Math.round(f.y)).join('/') : '—';
  const ok = (n === esperado) ? 'OK ' : 'MAL';
  console.log(`${ok}  ${nombre.padEnd(34)} franjas=${n} (esperado ${esperado})  lineas=${ys}`);
  return n === esperado;
}

let bien = 0, total = 0;
const casos = [
  ['fachada recta',            cols([[40, 300]]),                                   1],
  ['recta con ruido de 4px',   cols([[20, 300], [20, 304]]),                        1],
  ['planta en L',              cols([[18, 300], [22, 380]]),                        2],
  ['planta en U',              cols([[12, 380], [16, 300], [12, 380]]),             3],
  ['planta en W / E (3 alas)', cols([[10, 310], [10, 380], [10, 320], [10, 385]]),  4],
  ['escalera de 5 peldaños',   cols([[8, 300], [8, 330], [8, 360], [8, 390], [8, 420]]), 5],
  ['peine de 6 dientes',       cols([[6,300],[6,370],[6,300],[6,370],[6,300],[6,370]]), 6],
];
for (const [n, c, e] of casos) { total++; if (ver(n, c, e)) bien++; }

// ── La COBERTURA decide: un arbol (tronco fino) no se parte, una casa si ──
function conCobertura(c, frac) { c.solidas = frac; return c; }
const formaL = () => cols([[18, 300], [22, 380]]);
total++;
if (ver('arbol: 30 % solido -> NO se parte', conCobertura(formaL(), 0.30), 1)) bien++;
total++;
if (ver('casa: 85 % solido -> si se parte', conCobertura(formaL(), 0.85), 2)) bien++;

// Y el tope duro no se puede superar.
const salvaje = cols(Array.from({length: 14}, (_, i) => [4, 300 + i * 25]));
const fr = I.franjasDe(salvaje);
total++;
const dentro = fr && fr.length <= I.FRANJA_MAX;
console.log(`${dentro ? 'OK ' : 'MAL'}  tope duro (14 escalones)            franjas=${fr ? fr.length : 0} (max ${I.FRANJA_MAX})`);
if (dentro) bien++;

console.log(`\n${bien}/${total} casos correctos`);
process.exit(bien === total ? 0 : 1);
