#!/usr/bin/env node
/**
 * =============================================================================
 * GENERADOR DE NIVELES DE DETALLE (LOD) DEL TERRENO
 * =============================================================================
 *
 * POR QUÉ EXISTE ESTE SCRIPT
 * ---------------------------------------------------------------------------
 * `recortadas/mapa.json` declara cuatro niveles de detalle:
 *
 *      hd   → escala 1     (2048 × 2048 por tile)
 *      md   → escala 0.5   (debería ser 1024 × 1024)
 *      low  → escala 0.25  (debería ser  512 ×  512)
 *      zoom → escala 2
 *
 * …pero los cuatro directorios contienen EL MISMO ARCHIVO. Comprobado por
 * checksum: `tile_r0_c0_id1_hd.png`, `_md.png`, `_low.png` y `_zoom.png` son
 * byte a byte idénticos, los cuatro de 2048 × 2048.
 *
 * Consecuencia directa: poner la calidad gráfica en "Low" NO ahorra ni un byte
 * de memoria. El juego carga siempre texturas de 2048 × 2048, y cada una ocupa
 * en memoria de vídeo:
 *
 *      2048 × 2048 × 4 bytes = 16,8 MB por tile
 *
 * Con 4-9 tiles residentes son entre 67 y 151 MB solo para el suelo. En un
 * teléfono de gama media eso es la mayor parte del presupuesto de memoria de la
 * pestaña, y es la causa principal de que el navegador vaya justo, recargue
 * texturas y caliente el aparato.
 *
 * Con los LOD generados de verdad:
 *
 *      calidad          antes        después      ahorro
 *      ---------------------------------------------------------
 *      Alta   (hd)      16,8 MB/tile 16,8 MB/tile  —
 *      Media  (md)      16,8 MB/tile  4,2 MB/tile  75 %
 *      Baja   (low)     16,8 MB/tile  1,05 MB/tile 94 %
 *
 * En calidad Baja el suelo entero del mapa pasa de ~151 MB a ~9,5 MB.
 *
 *
 * CÓMO SE USA
 * ---------------------------------------------------------------------------
 *   node tools/generar-lods.js            → genera md y low desde hd
 *   node tools/generar-lods.js --dry      → solo informa, no escribe nada
 *   node tools/generar-lods.js --zoom     → genera también 'zoom' (2×)
 *
 * Antes de escribir nada hace una copia de seguridad en `recortadas/_backup/`.
 * Si algo sale mal, basta con copiar esa carpeta encima.
 *
 * NO NECESITA INSTALAR NADA: decodifica y vuelve a codificar PNG con el módulo
 * `zlib` que ya trae Node. Tarda un par de minutos con 9 tiles de 2048².
 *
 *
 * LO QUE ESTE SCRIPT NO HACE
 * ---------------------------------------------------------------------------
 * Los archivos `.webp` que hay junto a los `.png` NO se tocan: Node no trae
 * codificador WebP. Si el navegador admite WebP el juego los prefiere, así que
 * DESPUÉS de correr esto hay que hacer una de estas dos cosas:
 *
 *   a) regenerar los .webp con `cwebp` (recomendado, pesan menos al descargar):
 *          cwebp -q 82 recortadas/md/tile_r0_c0_id1_md.png -o recortadas/md/tile_r0_c0_id1_md.webp
 *      (y lo mismo para cada tile de md y de low)
 *
 *   b) o borrar los .webp de md/ y low/ para que el juego use los .png nuevos.
 *      Es lo más rápido y no rompe nada: resolveTileURL comprueba la extensión.
 * =============================================================================
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const RAIZ       = path.resolve(__dirname, '..');
const RECORTADAS = path.join(RAIZ, 'recortadas');
const BACKUP     = path.join(RECORTADAS, '_backup');

const soloInforme = process.argv.includes('--dry');
const conZoom     = process.argv.includes('--zoom');

// Destinos: nombre de carpeta → factor de escala respecto a 'hd'.
const DESTINOS = { md: 0.5, low: 0.25 };
if (conZoom) DESTINOS.zoom = 2;

// ─────────────────────────────────────────────────────────────────────────────
// LECTURA DE PNG (solo lo que necesitamos: color verdadero de 8 bits)
// ─────────────────────────────────────────────────────────────────────────────

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function leerPNG(ruta) {
  const buf = fs.readFileSync(ruta);
  if (!buf.subarray(0, 8).equals(FIRMA_PNG)) throw new Error('no es un PNG');

  let pos = 8;
  let ancho = 0, alto = 0, profundidad = 0, tipoColor = 0, entrelazado = 0;
  const trozosIDAT = [];

  while (pos < buf.length) {
    const largo = buf.readUInt32BE(pos);
    const tipo  = buf.toString('ascii', pos + 4, pos + 8);
    const datos = buf.subarray(pos + 8, pos + 8 + largo);

    if (tipo === 'IHDR') {
      ancho       = datos.readUInt32BE(0);
      alto        = datos.readUInt32BE(4);
      profundidad = datos[8];
      tipoColor   = datos[9];
      entrelazado = datos[12];
    } else if (tipo === 'IDAT') {
      trozosIDAT.push(datos);
    } else if (tipo === 'IEND') {
      break;
    }

    pos += 12 + largo;   // largo + tipo(4) + datos + CRC(4)
  }

  if (profundidad !== 8)  throw new Error(`profundidad ${profundidad} no admitida (solo 8 bits)`);
  if (entrelazado !== 0)  throw new Error('PNG entrelazado (Adam7) no admitido');
  if (tipoColor !== 2 && tipoColor !== 6) {
    throw new Error(`tipo de color ${tipoColor} no admitido (solo 2=RGB y 6=RGBA)`);
  }

  const canales = (tipoColor === 6) ? 4 : 3;
  const crudo   = zlib.inflateSync(Buffer.concat(trozosIDAT));
  const pixeles = desfiltrar(crudo, ancho, alto, canales);

  return { ancho, alto, canales, pixeles };
}

/** Deshace los filtros por línea del PNG (tipos 0..4 de la especificación). */
function desfiltrar(crudo, ancho, alto, canales) {
  const bytesPorLinea = ancho * canales;
  const salida = Buffer.allocUnsafe(bytesPorLinea * alto);

  let origen = 0;
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[origen++];
    const dest   = y * bytesPorLinea;
    const arriba = dest - bytesPorLinea;

    for (let i = 0; i < bytesPorLinea; i++) {
      const x = crudo[origen + i];
      const a = (i >= canales) ? salida[dest + i - canales] : 0;   // izquierda
      const b = (y > 0)        ? salida[arriba + i]         : 0;   // arriba
      const c = (y > 0 && i >= canales) ? salida[arriba + i - canales] : 0; // diagonal

      let v;
      switch (filtro) {
        case 0: v = x;                       break;   // None
        case 1: v = x + a;                   break;   // Sub
        case 2: v = x + b;                   break;   // Up
        case 3: v = x + ((a + b) >> 1);      break;   // Average
        case 4: {                                     // Paeth
          const p  = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = x + ((pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c));
          break;
        }
        default: throw new Error(`filtro PNG desconocido: ${filtro}`);
      }
      salida[dest + i] = v & 0xff;
    }
    origen += bytesPorLinea;
  }
  return salida;
}

// ─────────────────────────────────────────────────────────────────────────────
// REESCALADO (media de caja — el filtro correcto para reducir)
// ─────────────────────────────────────────────────────────────────────────────

function reescalar(img, escala) {
  const anchoN = Math.max(1, Math.round(img.ancho * escala));
  const altoN  = Math.max(1, Math.round(img.alto  * escala));
  const c      = img.canales;
  const salida = Buffer.allocUnsafe(anchoN * altoN * c);

  const razonX = img.ancho / anchoN;
  const razonY = img.alto  / altoN;

  for (let y = 0; y < altoN; y++) {
    const y0 = Math.floor(y * razonY);
    const y1 = Math.min(img.alto, Math.max(y0 + 1, Math.floor((y + 1) * razonY)));

    for (let x = 0; x < anchoN; x++) {
      const x0 = Math.floor(x * razonX);
      const x1 = Math.min(img.ancho, Math.max(x0 + 1, Math.floor((x + 1) * razonX)));

      const acumulado = [0, 0, 0, 0];
      let cuenta = 0;

      for (let sy = y0; sy < y1; sy++) {
        const base = sy * img.ancho * c;
        for (let sx = x0; sx < x1; sx++) {
          const p = base + sx * c;
          for (let k = 0; k < c; k++) acumulado[k] += img.pixeles[p + k];
          cuenta++;
        }
      }

      const destino = (y * anchoN + x) * c;
      for (let k = 0; k < c; k++) salida[destino + k] = Math.round(acumulado[k] / cuenta);
    }
  }

  return { ancho: anchoN, alto: altoN, canales: c, pixeles: salida };
}

// ─────────────────────────────────────────────────────────────────────────────
// ESCRITURA DE PNG
// ─────────────────────────────────────────────────────────────────────────────

function trozo(tipo, datos) {
  const largo = Buffer.allocUnsafe(4);
  largo.writeUInt32BE(datos.length, 0);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.allocUnsafe(4);
  crc.writeUInt32BE(calcularCRC(cuerpo) >>> 0, 0);
  return Buffer.concat([largo, cuerpo, crc]);
}

const TABLA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function calcularCRC(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

function escribirPNG(ruta, img) {
  const { ancho, alto, canales, pixeles } = img;
  const bytesPorLinea = ancho * canales;

  // Filtro 0 (None) en todas las líneas: el resultado lo comprime zlib igual de
  // bien para este tipo de imagen y el código queda mucho más simple.
  const conFiltro = Buffer.allocUnsafe((bytesPorLinea + 1) * alto);
  for (let y = 0; y < alto; y++) {
    conFiltro[y * (bytesPorLinea + 1)] = 0;
    pixeles.copy(conFiltro, y * (bytesPorLinea + 1) + 1, y * bytesPorLinea, (y + 1) * bytesPorLinea);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8]  = 8;                              // profundidad
  ihdr[9]  = (canales === 4) ? 6 : 2;        // tipo de color
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;  // compresión, filtro, entrelazado

  fs.writeFileSync(ruta, Buffer.concat([
    FIRMA_PNG,
    trozo('IHDR', ihdr),
    trozo('IDAT', zlib.deflateSync(conFiltro, { level: 9 })),
    trozo('IEND', Buffer.alloc(0))
  ]));
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRAMA
// ─────────────────────────────────────────────────────────────────────────────

function mb(bytes) { return (bytes / 1048576).toFixed(1) + ' MB'; }

function main() {
  const carpetaHD = path.join(RECORTADAS, 'hd');
  if (!fs.existsSync(carpetaHD)) {
    console.error(`✗ No existe ${carpetaHD}`);
    process.exit(1);
  }

  const originales = fs.readdirSync(carpetaHD).filter(f => f.endsWith('_hd.png'));
  if (!originales.length) {
    console.error('✗ No se encontró ningún tile *_hd.png');
    process.exit(1);
  }

  console.log(`\n📦 ${originales.length} tiles en 'hd'`);
  console.log(soloInforme ? '🔍 Modo informe: no se escribe nada\n' : '');

  let vramAntes = 0, vramDespues = 0;

  for (const [destino, escala] of Object.entries(DESTINOS)) {
    const carpetaDestino = path.join(RECORTADAS, destino);
    if (!fs.existsSync(carpetaDestino)) fs.mkdirSync(carpetaDestino, { recursive: true });

    console.log(`\n── ${destino} (×${escala}) ──────────────────────────────`);

    for (const nombre of originales) {
      const rutaOrigen  = path.join(carpetaHD, nombre);
      const nombreSalida = nombre.replace(/_hd\.png$/, `_${destino}.png`);
      const rutaSalida   = path.join(carpetaDestino, nombreSalida);

      let img;
      try {
        img = leerPNG(rutaOrigen);
      } catch (e) {
        console.log(`   ✗ ${nombre}: ${e.message}`);
        continue;
      }

      const nuevoAncho = Math.round(img.ancho * escala);
      const vram1 = img.ancho * img.alto * 4;
      const vram2 = nuevoAncho * Math.round(img.alto * escala) * 4;
      vramAntes   += vram1;
      vramDespues += vram2;

      if (soloInforme) {
        console.log(`   · ${nombreSalida}: ${img.ancho}×${img.alto} → ${nuevoAncho}×${nuevoAncho}` +
                    `   (VRAM ${mb(vram1)} → ${mb(vram2)})`);
        continue;
      }

      // Copia de seguridad del archivo que se va a sustituir
      if (fs.existsSync(rutaSalida)) {
        const dirBackup = path.join(BACKUP, destino);
        if (!fs.existsSync(dirBackup)) fs.mkdirSync(dirBackup, { recursive: true });
        const copia = path.join(dirBackup, nombreSalida);
        if (!fs.existsSync(copia)) fs.copyFileSync(rutaSalida, copia);
      }

      escribirPNG(rutaSalida, reescalar(img, escala));
      const tam = fs.statSync(rutaSalida).size;
      console.log(`   ✓ ${nombreSalida}  ${nuevoAncho}×${nuevoAncho}  ${(tam / 1024).toFixed(0)} KB` +
                  `   (VRAM ${mb(vram1)} → ${mb(vram2)})`);
    }
  }

  console.log('\n─────────────────────────────────────────────────────');
  console.log(`Memoria de vídeo del terreno: ${mb(vramAntes)} → ${mb(vramDespues)}`);
  if (!soloInforme) {
    console.log(`Copia de seguridad en: ${BACKUP}`);
    console.log('\n⚠️  RECUERDA: borra o regenera los .webp de md/ y low/, o el');
    console.log('    navegador seguirá prefiriéndolos y cargando los de 2048².');
  }
  console.log('');
}

main();
