#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
CONSTRUCCIÓN — los iconos de la tienda de construcción      (rehecho 2026-10-04)
=============================================================================

Escribe en `Game/Objetos/construccion/`:

  parcela.png            icono de la Parcela (20 x 20)
  pala_construccion.png  icono de la Pala de construcción (20 x 20)

LA PARCELA ES LA DE SIEMPRE
---------------------------------------------------------------------------
La primera versión (2026-10-03) dibujó un bancal de madera nuevo: un marco de
tablas alrededor de la tierra, y un icono con ese marco. No era lo que se
quería: "yo tenía las parcelas viejas". La parcela que se coloca en la isla es
el MISMO cuadro de tierra del huerto del pueblo (`Game/Objetos/tierra_seca.png`,
el que usan los 24 cuadros de `funcion_siembra_1`), y su icono se saca de ESE
PNG, pixel a pixel: el borde de arriba y de la izquierda, un trozo de su
tierra con sus migas, y el borde de abajo y de la derecha. Así el icono es la
parcela de siempre en pequeño, con su textura de verdad, y no un dibujo
parecido. Lleva el contorno oscuro de los objetos del juego.

LA PALA
---------------------------------------------------------------------------
Mismo estilo que el hacha y el pico de `Game/Source/pico_y_hacha/`: 20 x 20,
contorno negro de 1 px, mango de madera en diagonal (de abajo a la izquierda a
arriba a la derecha) con su luz arriba a la izquierda, y la hoja de metal con
los grises de esas herramientas. La geometría se describe en coordenadas del
eje de la herramienta (a lo largo / a lo ancho), así que la diagonal sale
limpia y simétrica.

Las paletas son las medidas en los PNG del juego, no inventadas:
  hacha_de_hierro.png -> madera #68391a / #562f17 / #2d180e, metal #c6c5c6 /
                         #a7a9a8 / #8a8a8a / #757575 / #5f5f61, contorno #000

Determinista: volver a lanzarlo escribe los mismos bytes.

  python tools/generar-parcela.py  [carpeta bin]
"""
import math
import os
import sys

from PIL import Image

BIN = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SALIDA = os.path.join(BIN, 'Game', 'Objetos', 'construccion')
TIERRA_VIEJA = os.path.join(BIN, 'Game', 'Objetos', 'tierra_seca.png')


def hx(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


VACIO = (0, 0, 0, 0)
NEGRO = (0, 0, 0, 255)
CONTORNO_TIERRA = hx('#2f2f2e')     # el de los objetos de madera del mapa

MADERA_LUZ = hx('#86522a')
MADERA = hx('#68391a')
MADERA_OSC = hx('#562f17')
MADERA_SOMBRA = hx('#2d180e')
METAL_BRILLO = hx('#e2e2e2')
METAL_LUZ = hx('#c6c5c6')
METAL = hx('#a7a9a8')
METAL_MED = hx('#8a8a8a')
METAL_OSC = hx('#757575')
METAL_SOMBRA = hx('#5f5f61')


def contorno(im, color, diagonales=False):
    """Contorno de 1 px por FUERA de todo lo opaco."""
    w, h = im.size
    src = im.copy()
    vecinos = ((1, 0), (-1, 0), (0, 1), (0, -1))
    if diagonales:
        vecinos += ((1, 1), (-1, -1), (1, -1), (-1, 1))
    for y in range(h):
        for x in range(w):
            if src.getpixel((x, y))[3]:
                continue
            for dx, dy in vecinos:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and src.getpixel((nx, ny))[3]:
                    im.putpixel((x, y), color)
                    break


# ── la parcela: un trozo de la tierra vieja ──────────────────────────────────
def icono_parcela():
    """
    18 x 18 de `tierra_seca.png` con SU borde (arriba e izquierda del original,
    abajo y derecha también del original) y 1 px de contorno: 20 x 20.
    """
    t = Image.open(TIERRA_VIEJA).convert('RGBA')
    W, H = t.size
    N = 18
    pieza = Image.new('RGBA', (N, N), VACIO)
    # La tierra del interior, de un trozo con migas (no del centro exacto,
    # que en el original es casi liso).
    ox, oy = 3, 4
    for y in range(1, N - 1):
        for x in range(1, N - 1):
            pieza.putpixel((x, y), t.getpixel((ox + x, oy + y)))
    # Los cuatro bordes, copiados de los bordes de verdad del PNG.
    for i in range(N):
        pieza.putpixel((i, 0), t.getpixel((min(W - 1, ox + i), 0)))
        pieza.putpixel((i, N - 1), t.getpixel((min(W - 1, ox + i), H - 1)))
        pieza.putpixel((0, i), t.getpixel((0, min(H - 1, oy + i))))
        pieza.putpixel((N - 1, i), t.getpixel((W - 1, min(H - 1, oy + i))))
    im = Image.new('RGBA', (20, 20), VACIO)
    im.paste(pieza, (1, 1))
    contorno(im, CONTORNO_TIERRA)
    return im


# ── la pala ──────────────────────────────────────────────────────────────────
def icono_pala():
    """
    En coordenadas del eje: `u` a lo largo (crece hacia el mango, arriba a la
    derecha) y `v` a lo ancho (crece hacia abajo a la derecha). La hoja es
    una pala de punta redondeada; el mango, de 2 px; arriba, la empuñadura en
    T con su luz.
    """
    S = 20
    im = Image.new('RGBA', (S, S), VACIO)
    k = 1 / math.sqrt(2)
    cx, cy = 4.4, 15.2                 # centro de la hoja

    def eje(px, py):
        dx, dy = px + 0.5 - cx, py + 0.5 - cy
        u = (dx - dy) * k              # hacia arriba a la derecha
        v = (dx + dy) * k              # hacia abajo a la derecha
        return u, v

    for py in range(S):
        for px in range(S):
            u, v = eje(px, py)
            c = None
            # Hoja: de u=-4.9 (punta) a u=2.6 (hombros), 3.4 de semiancho, con
            # la punta redondeada.
            if -4.9 <= u <= 2.6:
                semi = 3.4
                if u < -2.0:
                    semi = 3.4 * math.sqrt(max(0.0, 1.0 - ((u + 2.0) / 2.9) ** 2))
                if abs(v) <= semi:
                    if v < -semi + 1.0:
                        c = METAL_LUZ
                    elif v > semi - 1.0:
                        c = METAL_SOMBRA
                    elif v < -0.6:
                        c = METAL
                    elif v > 0.9:
                        c = METAL_OSC
                    else:
                        c = METAL_MED
                    # El nervio del centro, que da volumen a la hoja.
                    if -0.5 <= v <= 0.3 and -2.8 <= u <= 1.8:
                        c = METAL_LUZ
            # El cuello de metal que abraza el mango.
            if 2.6 < u <= 3.9 and abs(v) <= 1.25:
                c = METAL_OSC if v > 0.2 else METAL
            # El mango.
            if 3.9 < u <= 13.6 and abs(v) <= 0.95:
                c = MADERA_LUZ if v < -0.3 else (MADERA_OSC if v > 0.45 else MADERA)
            # La empuñadura en T.
            if 13.6 < u <= 15.5 and abs(v) <= 2.7:
                c = MADERA_LUZ if (u > 14.9 or v < -2.0) else (MADERA_OSC if v > 2.0 else MADERA)
            if c is not None:
                im.putpixel((px, py), c)
    # Un destello en la hoja.
    for (px, py) in ((2, 14), (3, 13)):
        if im.getpixel((px, py))[3]:
            im.putpixel((px, py), METAL_BRILLO)
    contorno(im, NEGRO)
    return im


def main():
    os.makedirs(SALIDA, exist_ok=True)
    for nombre, im in (('parcela.png', icono_parcela()),
                       ('pala_construccion.png', icono_pala())):
        ruta = os.path.join(SALIDA, nombre)
        im.save(ruta)
        print('escrito', os.path.relpath(ruta, BIN), im.size)


if __name__ == '__main__':
    main()
