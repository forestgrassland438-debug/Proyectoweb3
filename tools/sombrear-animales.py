# -*- coding: utf-8 -*-
"""
VOLUMEN PARA LOS ANIMALES                                         (2026-10-04)

    python tools/sombrear-animales.py

Lee  Game/Sprites/animales_base/*.png   (los originales, no se tocan)
Escribe Game/Sprites/animales/*.png     (los que carga gf-animales y la arena)

Los sprites de la fauna son pixel art de colores planos con contorno oscuro:
se leen bien, pero planos, como recortables. Aquí se les da volumen con la
MISMA LUZ que el resto del juego (gf-sombras: el sol arriba a la izquierda):

  · el borde de dentro que da ARRIBA o a la IZQUIERDA se aclara, hacia un
    blanco cálido, y el siguiente píxel un poco menos;
  · el que da ABAJO o a la DERECHA se oscurece, hacia un azul frío (las
    sombras del pixel art no son negras: son frías), y el siguiente menos.

"Borde" es contra el AIRE o contra el CONTORNO exterior, nunca contra una
mancha interior: las manchas de la vaca o los ojos no se rodean de brillo.
Los píxeles muy oscuros (contorno, ojos, pezuñas) no se tocan.

NO PARPADEA ENTRE FOTOGRAMAS: todo sale de la silueta de cada fotograma, no
de la posición en la imagen, así que el brillo va pegado al animal aunque se
mueva medio cuerpo entre un paso y otro. Sin ruido ni motas por esa razón.

Las mariposas (vistas desde arriba, de 14 px) y los "zzz" se copian tal cual.
"""
import os
import shutil
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
SPRITES = os.path.join(os.path.dirname(AQUI), 'Game', 'Sprites')
BASE = os.path.join(SPRITES, 'animales_base')
SALIDA = os.path.join(SPRITES, 'animales')
SIN_TOCAR = ('mariposa_', 'zzz_')

LUZ = (255, 244, 214)
SOMBRA = (36, 44, 92)


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def mezcla(c, hacia, t):
    return tuple(int(round(c[i] + (hacia[i] - c[i]) * t)) for i in range(3))


def sombrear(im):
    w, h = im.size
    px = im.load()
    opaco = [[px[x, y][3] > 0 for x in range(w)] for y in range(h)]
    oscuro = [[opaco[y][x] and lum(px[x, y]) < 70 for x in range(w)] for y in range(h)]

    def aire(x, y):
        return x < 0 or y < 0 or x >= w or y >= h or not opaco[y][x]

    # El contorno EXTERIOR: píxel oscuro que toca el aire (8 vecinos).
    contorno = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if oscuro[y][x] and any(aire(x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                contorno[y][x] = True

    def borde(x, y):
        return aire(x, y) or contorno[y][x]

    salida = im.copy()
    po = salida.load()
    for y in range(h):
        for x in range(w):
            if not opaco[y][x] or oscuro[y][x]:
                continue
            c = px[x, y][:3]
            a = px[x, y][3]
            luz1 = borde(x, y - 1) or borde(x - 1, y)
            som1 = borde(x, y + 1) or borde(x + 1, y)
            luz2 = borde(x, y - 2) or borde(x - 2, y)
            som2 = borde(x, y + 2) or borde(x + 2, y)
            if luz1 and not som1:
                c = mezcla(c, LUZ, 0.22)
            elif som1 and not luz1:
                c = mezcla(c, SOMBRA, 0.22)
            elif luz2 and not som2 and not som1:
                c = mezcla(c, LUZ, 0.09)
            elif som2 and not luz2 and not luz1:
                c = mezcla(c, SOMBRA, 0.10)
            po[x, y] = c + (a,)
    return salida


def main():
    if not os.path.isdir(BASE):
        raise SystemExit('Falta ' + BASE + ' (copia ahí los originales antes)')
    n = 0
    for f in sorted(os.listdir(BASE)):
        if not f.lower().endswith('.png'):
            continue
        origen, destino = os.path.join(BASE, f), os.path.join(SALIDA, f)
        if f.startswith(SIN_TOCAR):
            shutil.copyfile(origen, destino)
            continue
        im = Image.open(origen).convert('RGBA')
        sombrear(im).save(destino, optimize=True)
        n += 1
    print('sprites sombreados:', n)


if __name__ == '__main__':
    main()
