#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
ICONO DEL BOTON REDONDO "FRIENDS"  ->  Game/Source/amistades.png
=============================================================================

POR QUE UNO NUEVO Y NO `Game/Source/amigos.png`
---------------------------------------------------------------------------
`amigos.png` ya existe y son dos siluetas. Pero el boton nuevo no es "amigos":
es AGREGAR amigos, ver quien esta conectado y contestar solicitudes. Un icono
de dos personas a secas no dice eso, y en una columna de siete botones
redondos el jugador elige por la forma, no por el nombre. Este lleva ademas la
chapa con el "+" abajo a la derecha, que es lo que lo distingue de un vistazo.

No se toca `amigos.png`: este es un archivo nuevo al lado.

POR QUE NO ES PIXEL ART
---------------------------------------------------------------------------
Los iconos de la barra de botones del juego (`Game/Source/1..5.png`,
`correo.png`, `mercado.png`, `amigos.png`) son iconos PLANOS de 512x512 con
contorno negro grueso, no pixel art. Uno de 16 bits al lado cantaria. Este usa
ese mismo tamaño, ese grosor de linea y la paleta medida de los que ya hay:

    contorno   #2b2b2b
    amarillo   #f5c945
    verde azul #127469   (y #1a9e8f para el mas claro)
    blanco     #fafafa

COMO SE DIBUJA
---------------------------------------------------------------------------
Todo se pinta a 4x (2048x2048) y se reduce con LANCZOS al final. Es la unica
forma de que un contorno de 20 px quede liso: dibujar directamente a 512 deja
los bordes de las elipses dentados, y en un boton de 46 px eso se ve.

    python tools/generar-icono-amistades.py  [carpeta bin]
=============================================================================
"""

import os
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("Falta Pillow:  pip install pillow")


BIN = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..')
BIN = os.path.abspath(BIN)
SALIDA = os.path.join(BIN, 'Game', 'Source', 'amistades.png')

LADO = 512
E    = 4                      # supermuestreo
L    = LADO * E

CONTORNO = (0x2b, 0x2b, 0x2b, 255)
AMARILLO = (0xf5, 0xc9, 0x45, 255)
TEAL     = (0x12, 0x74, 0x69, 255)
TEAL_CLR = (0x1a, 0x9e, 0x8f, 255)
BLANCO   = (0xfa, 0xfa, 0xfa, 255)

GROSOR = 13 * E               # el mismo grosor de linea que amigos.png


def e(v):
    return int(round(v * E))


def elipse(d, cx, cy, rx, ry, relleno):
    d.ellipse([e(cx - rx), e(cy - ry), e(cx + rx), e(cy + ry)], fill=relleno)


def hombros(d, cx, cy, ancho, alto, relleno):
    """El cuerpo: un trapecio con las esquinas de arriba matadas, que es la
       forma que usan los iconos del juego (no un semicirculo)."""
    a2 = ancho / 2.0
    corte = ancho * 0.22
    pts = [
        (cx - a2,          cy + alto),
        (cx - a2,          cy + corte),
        (cx - a2 + corte,  cy),
        (cx + a2 - corte,  cy),
        (cx + a2,          cy + corte),
        (cx + a2,          cy + alto),
    ]
    d.polygon([(e(x), e(y)) for (x, y) in pts], fill=relleno)


def persona(d, cx, cabeza_y, r, cuerpo_y, ancho, alto, color):
    """Una figura entera con su contorno: se pinta primero en negro un poco
       mas grande y luego el color encima. Es como se consigue un contorno
       uniforme sin trazar lineas, que en las esquinas siempre quedan mal."""
    g = GROSOR / float(E)
    elipse(d, cx, cabeza_y, r + g, r + g, CONTORNO)
    hombros(d, cx, cuerpo_y - g, ancho + 2 * g, alto + g, CONTORNO)
    elipse(d, cx, cabeza_y, r, r, color)
    hombros(d, cx, cuerpo_y, ancho, alto, color)


def main():
    img = Image.new('RGBA', (L, L), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # ── Las dos figuras ────────────────────────────────────────────────────
    # La de atras (verde) va un poco mas arriba y mas pequeña: da profundidad
    # sin necesidad de sombras, que a este tamaño no se leerian.
    persona(d, cx=306, cabeza_y=168, r=60,
            cuerpo_y=272, ancho=176, alto=140, color=TEAL)
    persona(d, cx=204, cabeza_y=190, r=68,
            cuerpo_y=304, ancho=196, alto=124, color=AMARILLO)

    # ── La chapa del "+" ───────────────────────────────────────────────────
    # Abajo a la derecha, mordiendo la silueta: asi se lee como una insignia
    # pegada al grupo y no como un simbolo suelto flotando.
    bx, by, br = 398, 400, 86
    g = GROSOR / float(E)
    elipse(d, bx, by, br + g, br + g, CONTORNO)
    elipse(d, bx, by, br, br, TEAL_CLR)

    brazo, medio = 48, 16
    d.rectangle([e(bx - brazo), e(by - medio), e(bx + brazo), e(by + medio)], fill=BLANCO)
    d.rectangle([e(bx - medio), e(by - brazo), e(bx + medio), e(by + brazo)], fill=BLANCO)

    fin = img.resize((LADO, LADO), Image.LANCZOS)
    fin.save(SALIDA, 'PNG', optimize=True)
    print('escrito  %s  %dx%d  %d bytes'
          % (SALIDA, fin.size[0], fin.size[1], os.path.getsize(SALIDA)))


if __name__ == '__main__':
    main()
