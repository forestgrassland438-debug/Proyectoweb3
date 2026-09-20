#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
EL ICONO DE "VOLVER" DEL BOTON DE LANDS
=============================================================================

QUE ESCRIBE
---------------------------------------------------------------------------
    Game/Source/lands_volver.png    512x512, el icono del boton cuando ya
                                    estas en la isla

POR QUE SE COMPONE Y NO SE DIBUJA DE NUEVO
---------------------------------------------------------------------------
`Game/Source/lands.png` ya existe y es el icono de la parcela con su banderin.
El boton necesita un SEGUNDO estado —el de "pulsa para volver al mapa"— y ese
segundo icono tiene que parecer el hermano del primero, no un icono de otro
juego pegado al lado.

La forma barata de conseguirlo, y la que usa el resto del proyecto (ver
tools/generar-stickers.py), es COMPONER: se parte del PNG que ya existe, se
apaga un poco y se le monta encima la flecha de vuelta, dibujada con los tres
colores que el propio icono ya usa:

    #2b2b2b   el contorno negro de todo el icono
    #f5c945   el amarillo del banderin
    #6cbe5b   el verde del cesped

Asi el par de iconos comparte paleta, grosor de contorno y peso visual, que es
lo que hace que se lean como dos estados de la misma cosa.

LA FLECHA SE DIBUJA CON ANTIALIAS Y SE REDUCE
---------------------------------------------------------------------------
Los iconos del HUD no son pixel art: son planos, de contorno grueso y bordes
limpios (se ven a 40 px en el boton, escalados por el navegador desde 512). Por
eso esto NO usa `gf_arte` —que pinta pixel a pixel— sino Pillow dibujando a 4x
y reduciendo con LANCZOS. Dibujar la flecha pixel a pixel a 512 daria un borde
dentado que en el boton se vería sucio al lado del icono original, que es
vectorial.

Corre con:  python tools/generar-icono-lands.py
"""

import math
import os
import sys

from PIL import Image, ImageDraw

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGEN = os.path.join(RAIZ, 'Game', 'Source', 'lands.png')
DESTINO = os.path.join(RAIZ, 'Game', 'Source', 'lands_volver.png')

LADO = 512
SUPER = 4                       # se dibuja a 4x y se reduce: bordes limpios

NEGRO = (43, 43, 43, 255)       # #2b2b2b, el contorno del icono original
AMARILLO = (245, 201, 69, 255)  # #f5c945, el del banderin
VERDE = (108, 190, 91, 255)     # #6cbe5b, el del cesped


def flecha_vuelta(lado, grosor, color, contorno=None):
    """
    Una flecha en U que sale por la derecha, da la vuelta y apunta a la
    izquierda: el gesto universal de "volver".

    Se dibuja como un ARCO grueso mas una punta de flecha triangular. Un arco
    con `ImageDraw.arc` no admite grosor con extremos redondos en todas las
    versiones de Pillow, asi que se traza a mano con circulos pequenos a lo
    largo de la curva; sale con el extremo redondeado sin depender de la
    version.
    """
    im = Image.new('RGBA', (lado, lado), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    cx, cy = lado * 0.52, lado * 0.56
    r = lado * 0.30

    def traza(col, gr):
        # De 200 a 20 grados: la U abierta por abajo a la izquierda.
        pasos = 220
        for i in range(pasos + 1):
            a = math.radians(200 - (200 - -25) * i / float(pasos))
            x = cx + math.cos(a) * r
            y = cy - math.sin(a) * r
            d.ellipse([x - gr / 2, y - gr / 2, x + gr / 2, y + gr / 2], fill=col)

    def punta(col, escala):
        # La punta va en el extremo de 200 grados, apuntando hacia abajo-izq.
        a = math.radians(200)
        px = cx + math.cos(a) * r
        py = cy - math.sin(a) * r
        t = grosor * escala
        # Triangulo orientado segun la tangente de la curva en ese punto.
        tang = a + math.pi / 2
        nx, ny = math.cos(tang), -math.sin(tang)
        ox, oy = math.cos(a), -math.sin(a)
        d.polygon([
            (px + nx * t * 1.5, py + ny * t * 1.5),
            (px - ox * t * 1.3 - nx * t * 0.9, py - oy * t * 1.3 - ny * t * 0.9),
            (px + ox * t * 1.3 - nx * t * 0.9, py + oy * t * 1.3 - ny * t * 0.9),
        ], fill=col)

    if contorno is not None:
        traza(contorno, grosor * 1.75)
        punta(contorno, 1.45)
    traza(color, grosor)
    punta(color, 1.0)
    return im


def main():
    if not os.path.isfile(ORIGEN):
        print('no encuentro', ORIGEN)
        return 1

    base = Image.open(ORIGEN).convert('RGBA')
    if base.size != (LADO, LADO):
        base = base.resize((LADO, LADO), Image.LANCZOS)

    # La parcela se apaga y se encoge: pasa a ser el fondo, y lo que manda es
    # la flecha. Si se dejara a tamano y color completos, los dos iconos serian
    # casi iguales y en el boton no se notaria el cambio de estado — que es
    # justo para lo que sirve el segundo icono.
    pequena = base.resize((int(LADO * 0.78), int(LADO * 0.78)), Image.LANCZOS)
    fondo = Image.new('RGBA', (LADO, LADO), (0, 0, 0, 0))
    fondo.alpha_composite(pequena, (int(LADO * 0.11), int(LADO * 0.02)))
    fondo.putalpha(fondo.getchannel('A').point(lambda a: int(a * 0.55)))

    flecha = flecha_vuelta(LADO * SUPER, LADO * SUPER * 0.085,
                           AMARILLO, contorno=NEGRO)
    flecha = flecha.resize((LADO, LADO), Image.LANCZOS)

    salida = Image.new('RGBA', (LADO, LADO), (0, 0, 0, 0))
    salida.alpha_composite(fondo)
    salida.alpha_composite(flecha)
    salida.save(DESTINO)

    print('escrito', DESTINO)
    print('  la parcela al 78 %% y al 55 %% de opacidad, con la flecha de '
          'vuelta en amarillo #f5c945 y contorno #2b2b2b')
    return 0


if __name__ == '__main__':
    sys.exit(main())
