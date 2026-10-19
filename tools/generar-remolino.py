#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
EL REMOLINO DE ARENA DEL DESIERTO                                (2026-10-18)
=============================================================================

"Que existan remolinos; al estar cerca, el personaje se siente poco a poco
arrastrado y, si entra, le quita vida; el remolino no persigue: sigue su
rumbo." Esto es su DIBUJO (el comportamiento está en gf-zonas.js).

Un embudo de arena en 2.5D: ancho arriba y estrecho abajo, con BANDAS en
espiral que giran (cada fotograma las corre un octavo de vuelta) y la luz
arriba a la izquierda: el lado izquierdo, más claro; el derecho, en sombra.
Su falda de polvo abajo, una elipse con las mismas bandas. Semitransparente
(es aire con arena), con el contorno del juego. Sin partículas ni motas: el
dueño del juego tiene tripofobia.

A la densidad del personaje: el juego lo pone a escala 2 (128 x 228 px, algo
más alto que el personaje).

SALIDA: Game/MAPAS/desierto/remolino.png — 8 fotogramas de 64 x 114 en fila.
Determinista.
=============================================================================
"""
import math
import os

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.dirname(AQUI)
SALIDA = os.path.join(BIN, 'Game', 'MAPAS', 'desierto', 'remolino.png')
W, H, FOTOS = 64, 114, 8
CLARO, MEDIO, OSCURO, HONDO = (240, 216, 158), (218, 186, 122), (186, 148, 92), (152, 116, 70)
LINEA = (112, 82, 48)


def fotograma(f):
    fase = 2 * math.pi * f / FOTOS
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    px = im.load()
    base_y = H - 10
    # ── el embudo ──
    for y in range(4, base_y):
        t = (y - 4) / float(base_y - 4)            # 0 arriba, 1 abajo
        r = 27 * (1 - t) ** 1.25 + 4.5
        # Se mece: más arriba, más vaivén (el pie va pegado al suelo).
        cx = W / 2.0 + math.sin(t * 5.5 + fase) * 3.5 * (1 - t) + math.sin(fase + 1.3) * 2.0 * (1 - t)
        for x in range(int(cx - r) - 1, int(cx + r) + 2):
            u = (x + 0.5 - cx) / r
            if abs(u) > 1 or not (0 <= x < W):
                continue
            th = math.asin(u)                       # el ángulo de la cara que se ve
            banda = int(math.floor((th * 1.6 + t * 9.0 - fase * 2) / (math.pi / 3.0))) % 2
            luz = -u                                # izquierda = luz
            if luz > 0.45:
                col = CLARO if banda else MEDIO
            elif luz > -0.35:
                col = MEDIO if banda else OSCURO
            else:
                col = OSCURO if banda else HONDO
            alfa = 205 if abs(u) < 0.82 else 150
            if abs(u) > 0.93:
                col, alfa = LINEA, 200
            px[x, y] = col + (alfa,)
    # ── la boca de arriba: el borde de la copa, una elipse clara ──
    rt, cxt = 27 + 4.5, W / 2.0 + math.sin(fase) * 3.5 + math.sin(fase + 1.3) * 2.0
    for k in range(240):
        a = k / 240.0 * 2 * math.pi
        x, y = int(cxt + math.cos(a) * rt * 0.98), int(5 + math.sin(a) * 3.2)
        if 0 <= x < W and 0 <= y < H:
            px[x, y] = (CLARO if math.sin(a) < 0 else MEDIO) + (220,)
    # ── la falda de polvo ──
    for y in range(base_y - 7, H):
        for x in range(W):
            dx, dy = (x + 0.5 - W / 2.0) / 27.0, (y + 0.5 - (base_y - 1)) / 7.0
            d = dx * dx + dy * dy
            if d > 1 or px[x, y][3] > 0 and dy < 0:
                continue
            ang = math.atan2(dy, dx)
            banda = int(math.floor((ang + fase) / (math.pi / 4.0))) % 2
            col = MEDIO if banda else OSCURO
            alfa = int(170 * (1 - d) + 40)
            if d > 0.74:
                col, alfa = OSCURO, 150         # el borde: una banda continua
            if px[x, y][3] == 0:
                px[x, y] = col + (alfa,)
    return im


def main():
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    hoja = Image.new('RGBA', (W * FOTOS, H), (0, 0, 0, 0))
    for f in range(FOTOS):
        hoja.paste(fotograma(f), (f * W, 0))
    hoja.save(SALIDA, optimize=True)
    print('remolino:', SALIDA, hoja.size)


if __name__ == '__main__':
    main()
