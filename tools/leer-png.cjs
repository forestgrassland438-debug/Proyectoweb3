'use strict';
/* Lee un PNG de 8 bits RGB o RGBA sin entrelazar (lo que escriben los
 * generadores de tools/ con PIL) para las pruebas que miran píxeles del arte.
 * Es el lector de tools/generar-lods.js, que no se puede `require` porque
 * arranca al cargarse. Devuelve { ancho, alto, canales, pixeles, rgba(x, y) }. */
const fs = require('node:fs');
const zlib = require('node:zlib');

const FIRMA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function leerPNG(ruta) {
  const buf = fs.readFileSync(ruta);
  if (!buf.subarray(0, 8).equals(FIRMA)) throw new Error(ruta + ': no es un PNG');
  let pos = 8, ancho = 0, alto = 0, bits = 0, tipo = 0, entrelazado = 0;
  const idat = [];
  while (pos < buf.length) {
    const largo = buf.readUInt32BE(pos);
    const t = buf.toString('ascii', pos + 4, pos + 8);
    const d = buf.subarray(pos + 8, pos + 8 + largo);
    if (t === 'IHDR') { ancho = d.readUInt32BE(0); alto = d.readUInt32BE(4); bits = d[8]; tipo = d[9]; entrelazado = d[12]; }
    else if (t === 'IDAT') idat.push(d);
    else if (t === 'IEND') break;
    pos += 12 + largo;
  }
  if (bits !== 8 || entrelazado !== 0 || (tipo !== 2 && tipo !== 6)) {
    throw new Error(ruta + ': solo PNG de 8 bits RGB/RGBA sin entrelazar (bits ' + bits + ', tipo ' + tipo + ')');
  }
  const canales = tipo === 6 ? 4 : 3;
  const crudo = zlib.inflateSync(Buffer.concat(idat));
  const linea = ancho * canales;
  const pixeles = Buffer.alloc(linea * alto);
  let o = 0;
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[o++], dest = y * linea, arriba = dest - linea;
    for (let i = 0; i < linea; i++) {
      const x = crudo[o + i];
      const a = i >= canales ? pixeles[dest + i - canales] : 0;
      const b = y > 0 ? pixeles[arriba + i] : 0;
      const c = y > 0 && i >= canales ? pixeles[arriba + i - canales] : 0;
      let v;
      if (filtro === 0) v = x;
      else if (filtro === 1) v = x + a;
      else if (filtro === 2) v = x + b;
      else if (filtro === 3) v = x + ((a + b) >> 1);
      else if (filtro === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c));
      } else throw new Error(ruta + ': filtro PNG ' + filtro);
      pixeles[dest + i] = v & 0xff;
    }
    o += linea;
  }
  return {
    ancho, alto, canales, pixeles,
    rgba(x, y) {
      const i = (y * ancho + x) * canales;
      return [pixeles[i], pixeles[i + 1], pixeles[i + 2], canales === 4 ? pixeles[i + 3] : 255];
    }
  };
}

module.exports = { leerPNG };
