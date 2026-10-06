# -*- coding: utf-8 -*-
"""
TROCEA UNA CAPTURA EN TROZOS PARA lib/tileManager.js            (2026-10-05)

    python tools/trocear-escena.py <imagen.png> <carpeta_salida> <version> [lado]

Hace lo mismo que recortar/recortar.js con el mapa del pueblo, sin Node ni
sharp: trozos de `lado` px (1024 por defecto) en tres niveles de detalle

    hd   1.0   WebP SIN pérdida (es pixel art: con pérdida se emborrona) + PNG
    md   0.5   WebP con pérdida + PNG
    low  0.25  WebP con pérdida + PNG

y el `mapa.json` con el formato que lee TileManager (el mismo de
bin/recortadas/mapa.json): `tiles[].lods[nivel].filename/fallback` y el
tamaño EN EL MUNDO de cada trozo (`width/height`), que es lo que el gestor
usa para colocarlo; el archivo de 'md' mide la mitad y se estira.

Los del borde NO se rellenan ni se estiran a `lado`: miden lo que miden. El
gestor coloca cada trozo por su `x, y, width, height`, así que no hace falta,
y se ahorra memoria de vídeo.

`version` va en el mapa.json: TileManager la pega a la URL (?v=) para que el
navegador no se quede con la copia vieja (las imágenes van con force-cache).
"""
import json
import os
import sys
from PIL import Image

NIVELES = [('hd', 1.0), ('md', 0.5), ('low', 0.25)]


def main(entrada, salida, version, lado=1024):
    im = Image.open(entrada).convert('RGBA')
    W, H = im.size
    cols, filas = (W + lado - 1) // lado, (H + lado - 1) // lado
    for n, _ in NIVELES:
        os.makedirs(os.path.join(salida, n), exist_ok=True)
    tiles = []
    ident = 0
    for f in range(filas):
        for c in range(cols):
            ident += 1
            x, y = c * lado, f * lado
            w, h = min(lado, W - x), min(lado, H - y)
            trozo = im.crop((x, y, x + w, y + h))
            lods = {}
            for n, esc in NIVELES:
                tw, th = max(1, round(w * esc)), max(1, round(h * esc))
                img = trozo if esc == 1.0 else trozo.resize((tw, th), Image.BOX)
                base = 'tile_r%d_c%d_id%d_%s' % (f, c, ident, n)
                if n == 'hd':
                    img.save(os.path.join(salida, n, base + '.webp'), 'WEBP', lossless=True, method=6)
                else:
                    img.save(os.path.join(salida, n, base + '.webp'), 'WEBP', quality=86, method=6)
                img.save(os.path.join(salida, n, base + '.png'), optimize=True)
                lods[n] = {'filename': base + '.webp', 'fallback': base + '.png',
                           'x': 0, 'y': 0, 'width': tw, 'height': th}
            tiles.append({'id': ident, 'row': f, 'col': c, 'x': x, 'y': y, 'width': w, 'height': h, 'lods': lods})
    meta = {
        'source': os.path.basename(entrada), 'width': W, 'height': H, 'tileSize': lado,
        'cols': cols, 'rows': filas, 'totalTiles': len(tiles),
        'lods': [{'name': n, 'scale': esc, 'width': round(W * esc), 'height': round(H * esc)} for n, esc in NIVELES],
        'tiles': tiles, 'version': version
    }
    with open(os.path.join(salida, 'mapa.json'), 'w', encoding='utf-8') as fh:
        json.dump(meta, fh, ensure_ascii=False, separators=(',', ':'))
    total = sum(os.path.getsize(os.path.join(r, a)) for r, _, fs in os.walk(salida) for a in fs)
    print('%s: %dx%d -> %d trozos de %d (%d x %d), %.1f MB en %s' % (
        os.path.basename(entrada), W, H, len(tiles), lado, cols, filas, total / 1048576, salida))


if __name__ == '__main__':
    if len(sys.argv) not in (4, 5):
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) == 5 else 1024)
