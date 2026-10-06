# -*- coding: utf-8 -*-
"""
LOS CUATRO COFRES Y EL BOTE DE BASURA                             (2026-10-05)

    python tools/generar-cofres.py   ->  Game/Objetos/cofres/cofre1..4.png
                                         Game/Objetos/cofres/basura.png

No se dibujan de cero: salen del cofre del juego (Game/Objetos/cofre.png),
cambiando sus RAMPAS de color. Cada píxel se clasifica por lo que es —el
contorno, la madera o el herraje dorado— y se lleva a la rampa del cofre
nuevo por su LUMINOSIDAD, así que las luces y las sombras se quedan donde
el artista las puso y el dibujo es exactamente el mismo.

  cofre1  Wooden Chest       el del juego, tal cual                 5 casillas
  cofre2  Reinforced Chest   nogal oscuro y herraje de hierro       7
  cofre3  Magic Chest        madera violeta y herraje turquesa      13
                             que brilla, con chispas alrededor
  cofre4  Legendary Chest    madera carmesí, oro vivo y un brillo   20
                             blanco en la cerradura

El bote de basura es el del pueblo (Game/Objetos/bote_de_basura.png).
"""
import os
import shutil
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.dirname(AQUI)
ORIGEN = os.path.join(BIN, 'Game', 'Objetos', 'cofre.png')
DESTINO = os.path.join(BIN, 'Game', 'Objetos', 'cofres')

RAMPAS = {
    'cofre2': {'madera': [(46, 30, 24), (70, 46, 34), (96, 64, 46), (124, 86, 60), (150, 108, 76)],
               'metal': [(70, 74, 82), (104, 110, 120), (146, 152, 162), (190, 196, 204), (228, 232, 238)]},
    'cofre3': {'madera': [(40, 22, 60), (62, 34, 92), (88, 50, 128), (116, 70, 160), (146, 96, 190)],
               'metal': [(20, 110, 120), (36, 160, 168), (70, 210, 210), (140, 245, 236), (220, 255, 250)]},
    'cofre4': {'madera': [(60, 14, 20), (96, 22, 30), (134, 34, 40), (170, 52, 52), (204, 78, 70)],
               'metal': [(170, 110, 10), (222, 160, 20), (252, 206, 60), (255, 236, 130), (255, 252, 210)]},
}
CHISPAS = {
    'cofre3': [((1, 3), (180, 255, 250)), ((25, 5), (230, 190, 255)), ((2, 20), (140, 245, 236)), ((24, 22), (220, 255, 250))],
    'cofre4': [((0, 4), (255, 240, 160)), ((26, 2), (255, 255, 255)), ((1, 22), (255, 220, 120)), ((25, 21), (255, 250, 200))],
}


def lum(c):
    return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]


def clase(c):
    r, g, b = c[:3]
    if max(r, g, b) < 60 and abs(r - g) < 12 and abs(g - b) < 12:
        return 'contorno'
    # El herraje dorado: casi sin azul, o con el verde muy cerca del rojo. La
    # madera principal (198,120,82) tiene el mismo rojo pero bastante azul.
    if r > 170 and (b < 30 or g / float(r) > 0.8):
        return 'metal'
    return 'madera'


def recolorear(im, rampas):
    px = im.load()
    W, H = im.size
    # Rangos de luminosidad de cada material en el original, para repartirlos
    # por toda la rampa nueva.
    rangos = {'madera': [999, 0], 'metal': [999, 0]}
    for y in range(H):
        for x in range(W):
            c = px[x, y]
            if c[3] == 0:
                continue
            k = clase(c)
            if k in rangos:
                l = lum(c)
                rangos[k][0] = min(rangos[k][0], l)
                rangos[k][1] = max(rangos[k][1], l)
    out = im.copy()
    po = out.load()
    for y in range(H):
        for x in range(W):
            c = px[x, y]
            if c[3] == 0:
                continue
            k = clase(c)
            if k == 'contorno':
                continue
            lo, hi = rangos[k]
            t = (lum(c) - lo) / max(1.0, hi - lo)
            rampa = rampas[k]
            i = min(len(rampa) - 1, int(round(t * (len(rampa) - 1))))
            po[x, y] = rampa[i] + (c[3],)
    return out


def main():
    os.makedirs(DESTINO, exist_ok=True)
    base = Image.open(ORIGEN).convert('RGBA')
    base.save(os.path.join(DESTINO, 'cofre1.png'))
    for nombre, rampas in RAMPAS.items():
        im = recolorear(base, rampas)
        for (x, y), color in CHISPAS.get(nombre, []):
            im.putpixel((x, y), color + (255,))
        im.save(os.path.join(DESTINO, nombre + '.png'), optimize=True)
    shutil.copyfile(os.path.join(BIN, 'Game', 'Objetos', 'bote_de_basura.png'), os.path.join(DESTINO, 'basura.png'))
    print('cofres y bote ->', DESTINO)


if __name__ == '__main__':
    main()
