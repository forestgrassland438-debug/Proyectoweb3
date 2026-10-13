#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
EL MONTE DEL PUEBLO: dónde va cada mata                          (2026-10-10)
=============================================================================

"Quiero monte en GameScene que, si le paso por arriba, se abra mientras paso
por él o que se mueva. Pero con buenos gráficos."

Las matas las DIBUJA y las MUEVE gf-monte.js (canvas, sin PNG nuevos). Aquí
solo se decide DÓNDE van, una vez, y se escribe en Maps/monte.json:

  · solo sobre CÉSPED: se mira el suelo de verdad (la captura detallada del
    mapa, ../../recortar/mapa_principal.png) y se exige hierba alrededor, así
    que nunca caen en el camino, en el río ni en la tierra de cultivo;
  · nunca encima de nada del mapa: se apartan de TODOS los objetos de Tiled
    (casas, árboles, pinos, troncos, piedras, farolas, la huerta, los NPC, las
    puertas y las colisiones), con margen;
  · en MATORRALES, no repartidas como confeti: unos cuantos montes de 5 a 10
    matas, separados entre sí. Un prado salpicado de matas sueltas es justo
    el patrón de "muchos puntitos" que no puede haber.

Es determinista (semilla fija): volver a correrlo da lo mismo.

Corre con:  python tools/generar-monte.py [ruta de la captura]
"""

import io
import json
import math
import os
import random
import sys

from PIL import Image

BIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAPTURA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BIN, '..', '..', 'recortar', 'mapa_principal.png')
MAPA = os.path.join(BIN, 'Maps', 'mapa_principal.json')
SALIDA = os.path.join(BIN, 'Maps', 'monte.json')

CELDA = 16               # la casilla del mapa
MARGEN_OBJ = 28          # px de aire alrededor de cada objeto de Tiled
RADIO_HIERBA = 3         # casillas alrededor que tienen que ser césped
MIN_HIERBA = 0.92        # fracción de césped en cada una
SEP_MONTES = 330         # px entre centros de matorral
N_MONTES = 46
RADIO_MONTE = 78         # lo que ocupa un matorral
SEP_MATAS = 20           # px entre dos matas del mismo matorral
PASILLO_PUERTA = (60, 230)  # px libres a los lados y delante de la puerta de la mina
SEMILLA = 2026_10_10


def es_cesped(r, g, b):
    """Verde de hierba: el verde manda con claridad y no es oscuro del todo."""
    return g > r + 10 and g > b + 14 and g > 60


def fraccion_de_cesped(im):
    w, h = im.size
    cw, ch = w // CELDA, h // CELDA
    px = im.load()
    frac = [[0.0] * cw for _ in range(ch)]
    for cy in range(ch):
        for cx in range(cw):
            n = ok = 0
            # 4x4 muestras por casilla bastan y van 16 veces más rápido.
            for yy in range(2, CELDA, 4):
                for xx in range(2, CELDA, 4):
                    c = px[cx * CELDA + xx, cy * CELDA + yy]
                    n += 1
                    if c[3] > 0 and es_cesped(c[0], c[1], c[2]):
                        ok += 1
            frac[cy][cx] = ok / float(n)
    return frac


def rectangulos_del_mapa():
    m = json.load(io.open(MAPA, encoding='utf-8'))
    out = []
    for capa in m['layers']:
        if capa.get('type') != 'objectgroup' or capa.get('name') == 'mapa_principal_img':
            continue
        for o in capa.get('objects', []):
            x, y = float(o.get('x', 0)), float(o.get('y', 0))
            w, h = float(o.get('width', 0) or 0), float(o.get('height', 0) or 0)
            if o.get('gid'):
                y -= h            # los objetos-imagen de Tiled van anclados abajo
            if o.get('polygon'):
                xs = [x + p['x'] for p in o['polygon']]
                ys = [y + p['y'] for p in o['polygon']]
                x, y, w, h = min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)
            if w <= 0 and h <= 0:
                w = h = 16        # un punto: se le da algo de cuerpo
            out.append((x - MARGEN_OBJ, y - MARGEN_OBJ, x + w + MARGEN_OBJ, y + h + MARGEN_OBJ))
            # DELANTE DE LA MINA, NADA (2026-10-11): "la entrada a la mina debe
            # estar en la pared sin ningún objeto". El margen normal dejaba un
            # matorral a 50 px de la puerta, en el camino de entrada.
            if o.get('name') == 'puerta_mina':
                out.append((x - PASILLO_PUERTA[0], y + h, x + w + PASILLO_PUERTA[0], y + h + PASILLO_PUERTA[1]))
    return out


def main():
    if not os.path.isfile(CAPTURA):
        print('No encuentro la captura del suelo:', CAPTURA)
        sys.exit(1)
    im = Image.open(CAPTURA).convert('RGBA')
    W, H = im.size
    print('suelo', W, 'x', H)
    frac = fraccion_de_cesped(im)
    ch, cw = len(frac), len(frac[0])
    rects = rectangulos_del_mapa()
    print('objetos del mapa:', len(rects))

    def libre(px, py):
        if px < 64 or py < 64 or px > W - 64 or py > H - 64:
            return False
        for (a, b, c, d) in rects:
            if a <= px <= c and b <= py <= d:
                return False
        cx, cy = int(px // CELDA), int(py // CELDA)
        for dy in range(-RADIO_HIERBA, RADIO_HIERBA + 1):
            for dx in range(-RADIO_HIERBA, RADIO_HIERBA + 1):
                x, y = cx + dx, cy + dy
                if not (0 <= x < cw and 0 <= y < ch) or frac[y][x] < MIN_HIERBA:
                    return False
        return True

    rnd = random.Random(SEMILLA)
    candidatos = [(x * CELDA + 8, y * CELDA + 8) for y in range(0, ch, 2) for x in range(0, cw, 2)]
    rnd.shuffle(candidatos)
    centros = []
    for (x, y) in candidatos:
        if len(centros) >= N_MONTES:
            break
        if any((x - a) ** 2 + (y - b) ** 2 < SEP_MONTES ** 2 for a, b in centros):
            continue
        if libre(x, y):
            centros.append((x, y))
    matas = []
    for (cx, cy) in centros:
        cuantas = rnd.randint(5, 10)
        puestas = []
        intentos = 0
        while len(puestas) < cuantas and intentos < 200:
            intentos += 1
            a = rnd.random() * math.tau
            # Más densas en el centro: el matorral se "espesa" hacia dentro.
            r = RADIO_MONTE * math.sqrt(rnd.random()) * (0.55 + 0.45 * rnd.random())
            x, y = cx + math.cos(a) * r, cy + math.sin(a) * r * 0.7
            if any((x - a2) ** 2 + (y - b2) ** 2 < SEP_MATAS ** 2 for a2, b2, _, _ in puestas):
                continue
            if not libre(x, y):
                continue
            variante = rnd.randint(0, 3)
            escala = round(0.85 + rnd.random() * 0.35, 2)
            puestas.append((round(x), round(y), variante, escala))
        matas.extend(puestas)
    matas.sort(key=lambda m: (m[1], m[0]))
    out = {
        'version': '20261010a',
        'nota': 'Lo escribe tools/generar-monte.py. Cada mata: [x, y (la base), variante 0-3, escala].',
        'matorrales': len(centros),
        'matas': [list(m) for m in matas]
    }
    io.open(SALIDA, 'w', encoding='utf-8').write(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
    print('matorrales:', len(centros), ' matas:', len(matas), ' ->', SALIDA)


if __name__ == '__main__':
    main()
