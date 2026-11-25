#!/usr/bin/env python3
"""
LA LAVA DE LA MINA, EN LOS MAPAS DE LOS REINOS (2026-11-24)
===========================================================

"La lava del volcán no es igual a la de la mina de nivel 2." La de la mina es
un tileset ANIMADO (seis fotogramas: vetas que corren, costra oscura en franjas
y el labio de basalto) con sus piezas de borde a medida del lago
(tools/generar-mina.py, BORDES A MEDIDA); la del volcán era un degradado pintado
QUIETO en la imagen del suelo.

Esto hace para un mapa de los reinos lo mismo que la mina:

  1. Lee sus casillas de lava: las de los rectángulos de choque 'lava' del mapa
     (casillas de 16 px; las mismas que paran al jugador).
  2. Las lleva a la rejilla del arte de la mina (32 px): una casilla de 32 es
     lava si lo es CUALQUIERA de sus cuatro de 16. Así la lava que se ve cubre
     toda la que choca (la orilla de las piezas cae unos 10 px por dentro).
  3. A cada una le da su pieza con la regla de la mina (`lado`, el juego de 13)
     y su posición en el parche, y dibuja SOLO los bordes que salen, con el
     MISMO campo, la MISMA semilla, los MISMOS colores y el MISMO movimiento
     que la mina: es la misma lava, no una parecida. El parche es de 16x16
     (512 px) y no de 8x8: en un lago de 1100 px el de 256 se veía repetido en
     reja (en la mina los lagos son pequeños). El campo de la mina teje con el
     periodo que se le pida (gf_mina_pro.lava_fotogramas).

Escribe:

  Game/MAPAS/<zona>/lava_<f>.png   un tileset por fotograma, con el mismo orden
                                   de tiles (el parche, 256, y luego los bordes),
                                   ya EXTRUIDO (margen 1, separación 2: el borde
                                   de cada tile repetido por fuera, el arreglo de
                                   las rayas entre casillas con zoom no entero;
                                   la mina lo hace al cargar, aquí sale hecho y
                                   no hay que guardar dos copias en la tarjeta)
  Maps/<zona>.json                 la capa de casillas 'lava' (cada tile de 32
                                   en la casilla (2ax, 2ay) de la rejilla de 16:
                                   ver DÓNDE DIBUJA PHASER) y su tileset
                                   'lava_<zona>'; y en las propiedades del mapa,
                                   lava_fotogramas, lava_fps y lava_interior

DÓNDE DIBUJA PHASER una casilla más grande que la rejilla (2026-11-24): desde la
esquina de ARRIBA a la izquierda de la suya (Phaser 3.90: Tile.updatePixelXY
hace pixelY = y * 16, y el render la pinta en pixelY - tileOffset.y). Tiled la
dibuja desde la de ABAJO, y la mina sigue a Tiled (fila impar, `expandir`):
en el juego su arte cae 16 px por debajo de su rejilla de 32. Aquí cada tile va
en la fila PAR y se dibuja exactamente sobre su casilla de 32 (y cabe siempre en
el mapa: la última fila de lava del borde sur ya no se pierde). Lo fija
tools/lava-volcan.test.cjs (también leyendo vendor/phaser.min.js).

El juego la monta y la anima (gf-reinos.js, montarLavaMina) cambiando la imagen
del tileset, con las burbujas de la mina y su luz de noche. Debajo, el suelo
pintado lleva el primer fotograma (pintar_en): si la capa no llegara a montarse,
se seguiría viendo la misma lava, quieta.

    python tools/gf_lava_mina.py volcan          (rehace la capa del mapa actual)

tools/generar-reinos.py la llama sola al generar un mapa con lava.
"""
import importlib.util
import json
import os
import sys

import numpy as np
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.dirname(AQUI)
sys.path.insert(0, AQUI)

T_MAPA = 16                     # la casilla de los mapas de los reinos
T_ARTE = 32                     # la del arte de la mina (gf_mina_arte.T)
PARCHE = 16                     # el parche de la lava, en casillas de 32 (512 px)
INTERIOR = PARCHE * PARCHE      # los primeros tiles de cada hoja son el parche (el interior)
COLS = 16                       # columnas de las hojas (como las de la mina)
MARGEN, SEPARA = 1, 2           # la extrusión: margen 1, separación 2 (como _extruirTileset)

_MINA = None


def mina():
    """tools/generar-mina.py como módulo (su nombre lleva guion): su parche,
    su semilla, sus fotogramas y su constructor de hojas."""
    global _MINA
    if _MINA is None:
        spec = importlib.util.spec_from_file_location('gf_generar_mina', os.path.join(AQUI, 'generar-mina.py'))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        _MINA = m
    return _MINA


def celdas_de_lava(mapa):
    """Las casillas de 16 px de lava: las de los rectángulos de choque 'lava'."""
    celdas = set()
    for capa in mapa.get('layers', []):
        if capa.get('name') != 'colisiones':
            continue
        for o in capa.get('objects', []):
            if o.get('name') != 'lava':
                continue
            x0, y0 = int(round(o['x'])) // T_MAPA, int(round(o['y'])) // T_MAPA
            w, h = int(round(o['width'])) // T_MAPA, int(round(o['height'])) // T_MAPA
            for cy in range(y0, y0 + h):
                for cx in range(x0, x0 + w):
                    celdas.add((cx, cy))
    return celdas


def rejilla_arte(celdas):
    """De las casillas de 16 a las del arte (32): lava si lo es cualquiera de sus cuatro."""
    return {(cx // 2, cy // 2) for (cx, cy) in celdas}


def lado(g, x, y):
    """La pieza del juego de 13 (la regla de la mina, generar-mina-mapa._lado):
    'C' rodeada de lava; 'N' si arriba no hay, 'NO' arriba e izquierda... e
    'iNO' si solo se escapa por la esquina."""
    def fuera(dx, dy):
        return (x + dx, y + dy) not in g
    n, s_, o, e = fuera(0, -1), fuera(0, 1), fuera(-1, 0), fuera(1, 0)
    if n and o:
        return 'NO'
    if n and e:
        return 'NE'
    if s_ and o:
        return 'SO'
    if s_ and e:
        return 'SE'
    if n:
        return 'N'
    if s_:
        return 'S'
    if o:
        return 'O'
    if e:
        return 'E'
    if fuera(-1, -1):
        return 'iNO'
    if fuera(1, -1):
        return 'iNE'
    if fuera(-1, 1):
        return 'iSO'
    if fuera(1, 1):
        return 'iSE'
    return 'C'


def nombre_interior(i, j):
    return 'p_%d_%d' % (i, j)          # con guion bajo: con 16 posiciones 'p115' sería (1,15) o (11,5)


def nombre_borde(ld, i, j):
    return 'b_%s_%d_%d' % (ld, i, j)


def piezas(g, parche):
    """{(ax, ay): nombre de su tile}."""
    out = {}
    for (x, y) in g:
        ld = lado(g, x, y)
        i, j = x % parche, y % parche
        out[(x, y)] = nombre_interior(i, j) if ld == 'C' else nombre_borde(ld, i, j)
    return out


def bordes_necesarios(g, parche, lados):
    usados = set()
    for (x, y) in g:
        ld = lado(g, x, y)
        if ld != 'C':
            usados.add((ld, x % parche, y % parche))
    return sorted(usados, key=lambda t: (lados.index(t[0]), t[2], t[1]))


def construir_hojas(M, fotos, necesarios, parche):
    """Las hojas de la lava, una por fotograma, con el MISMO orden de tiles:
    el parche y los bordes que salen (lo de generar-mina.construye_liquido,
    con los nombres sin ambigüedad). Los bordes, con la semilla de la mina."""
    hojas = []
    for f, p in enumerate(fotos):
        h = M.Hoja()
        for j in range(parche):
            for i in range(parche):
                h.add(p[j][i], nombre_interior(i, j), 'lava')
        for (ld, i, j) in necesarios:
            h.add(M.P.borde_capa(ld, p[j][i], 'lava', M.S + 9, f), nombre_borde(ld, i, j), 'borde')
        while len(h.tiles) % COLS:
            h.add(None, '_hueco_%d' % len(h.tiles), 'hueco')
        hojas.append(h)
    return hojas, hojas[0].indices


def hoja_extruida(tiles):
    """La hoja con cada tile EXTRUIDO: margen 1, separación 2 y el borde de
    cada tile repetido un píxel por fuera (lo de MinaScene._extruirTileset)."""
    filas = (len(tiles) + COLS - 1) // COLS
    paso = T_ARTE + SEPARA
    out = np.zeros((MARGEN * 2 + filas * paso - SEPARA, MARGEN * 2 + COLS * paso - SEPARA, 4), np.uint8)
    for k, t in enumerate(tiles):
        if t is None:
            continue
        a = np.array(t.imagen().convert('RGBA'), np.uint8)
        x0, y0 = MARGEN + (k % COLS) * paso, MARGEN + (k // COLS) * paso
        out[y0:y0 + T_ARTE, x0:x0 + T_ARTE] = a
        out[y0 - 1, x0:x0 + T_ARTE] = a[0]
        out[y0 + T_ARTE, x0:x0 + T_ARTE] = a[-1]
        out[y0:y0 + T_ARTE, x0 - 1] = a[:, 0]
        out[y0:y0 + T_ARTE, x0 + T_ARTE] = a[:, -1]
    return Image.fromarray(out, 'RGBA'), filas


def poner(zona, ruta_mapa=None, carpeta_arte=None):
    """Hace las hojas de la lava de `zona` y le pone su capa al mapa. Devuelve
    un resumen. Sin lava en el mapa, quita lo que hubiera de antes."""
    ruta_mapa = ruta_mapa or os.path.join(BIN, 'Maps', zona + '.json')
    carpeta_arte = carpeta_arte or os.path.join(BIN, 'Game', 'MAPAS', zona)
    with open(ruta_mapa, encoding='utf-8') as fh:
        mapa = json.load(fh)
    n = int(mapa['width'])
    nombre_ts = 'lava_' + zona
    mapa['layers'] = [c for c in mapa['layers'] if c.get('name') != 'lava']
    mapa['tilesets'] = [t for t in mapa['tilesets'] if t.get('name') != nombre_ts]
    props = [p for p in mapa.get('properties', []) if not str(p.get('name', '')).startswith('lava_')]
    g = rejilla_arte(celdas_de_lava(mapa))
    if not g:
        mapa['properties'] = props
        _escribir(ruta_mapa, mapa)
        return {'zona': zona, 'casillas': 0}

    M = mina()
    necesarios = bordes_necesarios(g, PARCHE, M.LADOS)
    fotos = M.P.lava_fotogramas(PARCHE, M.S, M.FOTOS_LAVA)
    hojas, indices = construir_hojas(M, fotos, necesarios, PARCHE)
    os.makedirs(carpeta_arte, exist_ok=True)
    for f, hj in enumerate(hojas):
        im, filas = hoja_extruida(hj.tiles)
        im.save(os.path.join(carpeta_arte, 'lava_%d.png' % f), 'PNG', optimize=True)
    # Si antes había más fotogramas, fuera los que sobran.
    f = len(hojas)
    while os.path.exists(os.path.join(carpeta_arte, 'lava_%d.png' % f)):
        os.remove(os.path.join(carpeta_arte, 'lava_%d.png' % f))
        f += 1

    ntiles = len(hojas[0].tiles)
    firstgid = max(t['firstgid'] + int(t.get('tilecount', 0)) for t in mapa['tilesets'])
    mapa['tilesets'].append({
        'firstgid': firstgid, 'name': nombre_ts, 'image': '../Game/MAPAS/%s/lava_0.png' % zona,
        'imagewidth': im.width, 'imageheight': im.height, 'tilewidth': T_ARTE, 'tileheight': T_ARTE,
        'columns': COLS, 'tilecount': ntiles, 'margin': MARGEN, 'spacing': SEPARA})
    # La capa: cada tile de 32 en la casilla (ax*2, ay*2) de la rejilla de 16;
    # Phaser lo dibuja desde ahí, sobre [ax*32, ax*32+32) x [ay*32, ay*32+32)
    # (DÓNDE DIBUJA PHASER, arriba). Siempre cabe: la casilla de 16 de una de
    # lava está en el mapa y la de su esquina también. Si no, es un fallo.
    datos = [0] * (n * n)
    for (ax, ay), nombre in piezas(g, PARCHE).items():
        cx, cy = ax * 2, ay * 2
        if not (0 <= cx < n and 0 <= cy < n):
            raise ValueError('lava fuera del mapa en la casilla de 32 (%d, %d)' % (ax, ay))
        datos[cy * n + cx] = firstgid + indices[nombre]
    sig = max([c.get('id', 0) for c in mapa['layers']] + [int(mapa.get('nextlayerid', 1)) - 1]) + 1
    mapa['layers'].append({'id': sig, 'name': 'lava', 'type': 'tilelayer', 'width': n, 'height': n,
                           'x': 0, 'y': 0, 'opacity': 1, 'visible': True, 'data': datos})
    mapa['nextlayerid'] = sig + 1
    props += [{'name': 'lava_fotogramas', 'type': 'int', 'value': len(hojas)},
              {'name': 'lava_fps', 'type': 'int', 'value': int(M.FPS_LAVA)},
              {'name': 'lava_interior', 'type': 'int', 'value': INTERIOR}]
    mapa['properties'] = props
    _escribir(ruta_mapa, mapa)
    return {'zona': zona, 'casillas': len(g), 'bordes': len(necesarios), 'tiles': ntiles,
            'fotogramas': len(hojas), 'firstgid': firstgid}


def _escribir(ruta, mapa):
    # Como tools/generar-reinos.py (escribir_mapa): compacto, UTF-8, LF.
    with open(ruta, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(mapa, fh, ensure_ascii=False, separators=(',', ':'))


def pintar_en(arr, zona, ruta_mapa=None, carpeta_arte=None):
    """Pega el PRIMER fotograma de la capa 'lava' del mapa en la imagen del
    suelo `arr` (RGBA, 1 px = 1 px del mundo), por encima de lo que haya. La
    capa animada va encima en el juego; esto es lo que queda si no se montara."""
    ruta_mapa = ruta_mapa or os.path.join(BIN, 'Maps', zona + '.json')
    carpeta_arte = carpeta_arte or os.path.join(BIN, 'Game', 'MAPAS', zona)
    with open(ruta_mapa, encoding='utf-8') as fh:
        mapa = json.load(fh)
    capa = next((c for c in mapa['layers'] if c.get('name') == 'lava'), None)
    ts = next((t for t in mapa['tilesets'] if t.get('name') == 'lava_' + zona), None)
    if not capa or not ts:
        return 0
    hoja = np.array(Image.open(os.path.join(carpeta_arte, 'lava_0.png')).convert('RGBA')).astype(np.float32)
    n, cols, fg = int(mapa['width']), int(ts['columns']), int(ts['firstgid'])
    mg, sp = int(ts.get('margin', 0)), int(ts.get('spacing', 0))
    H, W = arr.shape[:2]
    puestos = 0
    for k, gid in enumerate(capa['data']):
        if not gid:
            continue
        i = gid - fg
        cx, cy = k % n, k // n
        x0, y0 = cx * T_MAPA, cy * T_MAPA           # donde la dibuja Phaser: arriba a la izquierda
        sx, sy = mg + (i % cols) * (T_ARTE + sp), mg + (i // cols) * (T_ARTE + sp)
        tile = hoja[sy:sy + T_ARTE, sx:sx + T_ARTE]
        # Lo que cae dentro de la imagen.
        ax0, ay0 = max(0, x0), max(0, y0)
        ax1, ay1 = min(W, x0 + T_ARTE), min(H, y0 + T_ARTE)
        if ax1 <= ax0 or ay1 <= ay0:
            continue
        t = tile[ay0 - y0:ay1 - y0, ax0 - x0:ax1 - x0]
        a = t[..., 3:4] / 255.0
        bajo = arr[ay0:ay1, ax0:ax1, :3].astype(np.float32)
        arr[ay0:ay1, ax0:ax1, :3] = np.clip(bajo * (1 - a) + t[..., :3] * a, 0, 255).astype(np.uint8)
        puestos += 1
    return puestos


def main():
    zonas = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not zonas:
        print(__doc__)
        sys.exit(2)
    for z in zonas:
        print(json.dumps(poner(z), ensure_ascii=False))


if __name__ == '__main__':
    main()
