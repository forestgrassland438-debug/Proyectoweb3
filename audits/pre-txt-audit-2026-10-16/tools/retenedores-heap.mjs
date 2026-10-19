/* Camino más corto desde las raíces del GC hasta cada objeto marcado con
 * MarcaFuga_* (ver tools/heap-escenas.mjs) en un .heapsnapshot de V8.
 *
 *   node --max-old-space-size=8000 tools/retenedores-heap.mjs <archivo>
 *
 * Una arista `context` seguida de un nombre de variable (`scene`, `escena`,
 * `this`) es un CIERRE que la retiene: la función de la línea anterior guarda
 * esa variable en su contexto. Así se encontraron el oyente 'chatMessage' de
 * gf-chat-social, el onclick de #lands-btn y el envoltorio de
 * game.scene.start, que no se veían ni leyendo ni recorriendo `window`.
 */
import fs from 'node:fs';

const snap = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const CAMINOS = Number(process.argv[3] || 3);
const m = snap.snapshot.meta;
const NF = m.node_fields.length, EF = m.edge_fields.length;
const nTipo = m.node_fields.indexOf('type'), nNombre = m.node_fields.indexOf('name'),
      nEdges = m.node_fields.indexOf('edge_count'), nId = m.node_fields.indexOf('id');
const eTipo = m.edge_fields.indexOf('type'), eNom = m.edge_fields.indexOf('name_or_index'),
      eA = m.edge_fields.indexOf('to_node');
const tiposNodo = m.node_types[0], tiposEdge = m.edge_types[0];
const nodes = snap.nodes, edges = snap.edges, str = snap.strings;
const N = nodes.length / NF;

const primerEdge = new Uint32Array(N + 1);
for (let i = 0, e = 0; i < N; i++) { primerEdge[i] = e; e += nodes[i * NF + nEdges] * EF; primerEdge[i + 1] = e; }

const nombreNodo = (i) => str[nodes[i * NF + nNombre]];
const tipoNodo = (i) => tiposNodo[nodes[i * NF + nTipo]];
const nombreEdge = (e) => {
  const t = tiposEdge[edges[e + eTipo]];
  return (t === 'element' || t === 'hidden') ? '[' + edges[e + eNom] + ']' : str[edges[e + eNom]];
};
const desc = (i) => tipoNodo(i) + ' ' + String(nombreNodo(i)).slice(0, 70) + ' @' + nodes[i * NF + nId];

// Retenedores (inversa), sin aristas débiles.
const cuentaIn = new Uint32Array(N);
for (let i = 0; i < N; i++) for (let e = primerEdge[i]; e < primerEdge[i + 1]; e += EF) {
  if (tiposEdge[edges[e + eTipo]] === 'weak') continue;
  cuentaIn[edges[e + eA] / NF]++;
}
const inicioIn = new Uint32Array(N + 1);
for (let i = 0; i < N; i++) inicioIn[i + 1] = inicioIn[i] + cuentaIn[i];
const inDe = new Uint32Array(inicioIn[N]), inEdge = new Uint32Array(inicioIn[N]);
const pos = inicioIn.slice(0, N);
for (let i = 0; i < N; i++) for (let e = primerEdge[i]; e < primerEdge[i + 1]; e += EF) {
  if (tiposEdge[edges[e + eTipo]] === 'weak') continue;
  const a = edges[e + eA] / NF;
  inDe[pos[a]] = i; inEdge[pos[a]] = e; pos[a]++;
}

// Distancia desde la raíz (nodo 0) por BFS hacia delante, sin débiles.
const dist = new Int32Array(N).fill(-1);
const padre = new Int32Array(N).fill(-1), padreEdge = new Int32Array(N).fill(-1);
const cola = new Uint32Array(N); let qi = 0, qn = 0;
dist[0] = 0; cola[qn++] = 0;
while (qi < qn) {
  const i = cola[qi++];
  for (let e = primerEdge[i]; e < primerEdge[i + 1]; e += EF) {
    const t = tiposEdge[edges[e + eTipo]];
    if (t === 'weak' || t === 'shortcut') continue;
    const a = edges[e + eA] / NF;
    if (dist[a] >= 0) continue;
    dist[a] = dist[i] + 1; padre[a] = i; padreEdge[a] = e; cola[qn++] = a;
  }
}

function camino(obj) {
  const pasos = [];
  let x = obj;
  while (x > 0 && padre[x] >= 0) { pasos.push(nombreEdge(padreEdge[x]) + '  ->  ' + desc(x)); x = padre[x]; }
  return pasos.reverse();
}

for (let i = 0; i < N; i++) {
  const nom = nombreNodo(i);
  if (tipoNodo(i) !== 'object' || !/^MarcaFuga_/.test(nom)) continue;
  // El objeto marcado es quien tiene la propiedad __marcaFuga hacia esta marca.
  let escena = -1;
  for (let k = inicioIn[i]; k < inicioIn[i + 1]; k++) if (nombreEdge(inEdge[k]) === '__marcaFuga') escena = inDe[k];
  console.log('\n==== ' + nom + '  (escena ' + (escena >= 0 ? desc(escena) : '?') + ', dist ' + (escena >= 0 ? dist[escena] : '-') + ')');
  if (escena < 0) continue;
  console.log(camino(escena).map(s => '   ' + s).join('\n'));
  // Además: los retenedores directos de la escena que NO son de su propio árbol.
  console.log('  retenedores directos (' + (inicioIn[escena + 1] - inicioIn[escena]) + '):');
  const vistos = {};
  for (let k = inicioIn[escena]; k < inicioIn[escena + 1] && k < inicioIn[escena] + 400; k++) {
    const r = inDe[k];
    const clave = nombreEdge(inEdge[k]) + ' <- ' + tipoNodo(r) + ' ' + String(nombreNodo(r)).slice(0, 50);
    vistos[clave] = (vistos[clave] || 0) + 1;
  }
  Object.entries(vistos).sort((a, b) => b[1] - a[1]).slice(0, 40).forEach(([k, v]) => console.log('     ' + v + '  ' + k));
}
