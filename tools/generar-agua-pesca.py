#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
EL AGUA DONDE SE PESCA EN LOS MAPAS NUEVOS                        (2026-10-19)
=============================================================================

"Quisiera pescar en el agua de los tres mapas nuevos y en la del mapa
salvaje." El servidor decide si el jugador está en la orilla (como con el río
del pueblo, PESCA_AGUA_RLE); para eso necesita saber qué casillas son agua en
cada mapa. Esto lo saca de la capa `suelo` de Maps/<mapa>.json y de su
tileset con LA MISMA regla que el juego (gf-agua.js `esAzul` y gf-pesca.js):
una casilla es agua si al menos el 35 % de sus píxeles son azules. En la
tundra eso incluye el lago helado: se pesca en el hielo, como la pescadora.

Escribe tools/agua-pesca-zonas.json con, por mapa: { tile, w, h, rle } (una
fila por casilla, tramos "a-b" separados por comas y filas por ';'). Ese
objeto va tal cual en server2.js (GF_PESCA_ZONAS).

USO:  python tools/generar-agua-pesca.py
=============================================================================
"""
import json
import os

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
MAPAS = ['salvaje', 'cementerio', 'desierto', 'tundra']


def es_azul(r, g, b, a):
    return a > 40 and b > 110 and b > r + 35 and b > g + 10


def clasificar(ruta, t):
    im = Image.open(ruta).convert('RGBA')
    px = im.load()
    cols, filas = im.width // t, im.height // t
    agua = set()
    for i in range(cols * filas):
        x0, y0 = (i % cols) * t, (i // cols) * t
        n = 0
        for y in range(t):
            for x in range(t):
                if es_azul(*px[x0 + x, y0 + y]):
                    n += 1
        if n / float(t * t) >= 0.35:
            agua.add(i + 1)            # gid = índice + firstgid (1)
    return agua


def main():
    salida = {}
    for m in MAPAS:
        d = json.load(open(os.path.join(RAIZ, 'Maps', m + '.json'), encoding='utf-8'))
        t = d['tilewidth']
        ts = d['tilesets'][0]
        ruta = os.path.normpath(os.path.join(RAIZ, 'Maps', ts['image']))
        agua = clasificar(ruta, t)
        capa = next(l for l in d['layers'] if l['name'] == 'suelo')
        w, h = capa['width'], capa['height']
        datos = capa['data']
        filas = []
        total = 0
        for y in range(h):
            tramos, a = [], None
            for x in range(w + 1):
                es = x < w and datos[y * w + x] in agua
                if es and a is None:
                    a = x
                elif not es and a is not None:
                    tramos.append('%d-%d' % (a, x - 1))
                    total += x - a
                    a = None
            filas.append(','.join(tramos))
        salida[m] = {'tile': t, 'w': w, 'h': h, 'rle': ';'.join(filas)}
        print('  %-11s %dx%d casillas, %d de agua' % (m, w, h, total))
    ruta = os.path.join(AQUI, 'agua-pesca-zonas.json')
    with open(ruta, 'w', encoding='utf-8') as f:
        json.dump(salida, f, separators=(',', ':'))
    print('listo ->', ruta, '(%d bytes)' % os.path.getsize(ruta))


if __name__ == '__main__':
    main()
