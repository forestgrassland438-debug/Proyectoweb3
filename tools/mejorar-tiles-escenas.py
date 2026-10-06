# -*- coding: utf-8 -*-
"""
LOS TILESETS DE LA ISLA Y DE LA TIENDA, CON MÁS DETALLE         (2026-10-04)

    python tools/mejorar-tiles-escenas.py            (los dos)
    python tools/mejorar-tiles-escenas.py isla       (uno)

    isla    Game/MAPAS/isla_32_base.png -> isla_32.png   (LandsScene, 32 px)
    tienda  Game/MAPAS/tiles2_base.png  -> tiles2.png    (tiendajuego, 16 px)

El `_base.png` es el original y no se toca nunca: se regenera desde él.

El mismo criterio que tools/mejorar-tiles-mapa.py: se detalla cada píxel
según su MATERIAL (solo los del color base de cada uno) y todo detalle con
forma se queda dentro de la casilla, lejos del borde, para que no haya
costuras. Misma rejilla y mismos índices: los mapas no cambian.

  arena   granos claros y oscuros y alguna conchita
  agua    destellos horizontales con su sombra
  hierba  briznas
  piedra  grano
  madera  vetas (rayas horizontales cortas) y algún nudo
  yeso    (las paredes grises de la tienda) poro fino

EL AGUA DE LA ISLA FRENA AL JUGADOR SEGÚN SU COLOR: LandsScene._mascarasDeAgua
lee el tileset y marca como agua el píxel con b > 110, b > r + 35 y
b > g + 18. Al terminar se recalcula esa máscara con el tileset nuevo y se
exige que salga IDÉNTICA a la del original; si no, no se escribe nada.
"""
import os
import random
import sys
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
MAPAS = os.path.join(os.path.dirname(AQUI), 'Game', 'MAPAS')


def tono(c, d):
    if isinstance(d, int):
        d = (d, d, d)
    return tuple(max(0, min(255, c[i] + d[i])) for i in range(3))


def detallar(px, ox, oy, T, semilla, materiales):
    rnd = random.Random(semilla)

    def base(x, y):
        return px[ox + x, oy + y][:3]

    def poner(x, y, color, ok):
        if 0 <= x < T and 0 <= y < T and base(x, y) in ok:
            px[ox + x, oy + y] = tuple(color) + (px[ox + x, oy + y][3],)

    cuenta = {}
    for y in range(T):
        for x in range(T):
            c = base(x, y)
            cuenta[c] = cuenta.get(c, 0) + 1
    area = T * T
    m = 1 if T <= 16 else 2                                  # margen al borde

    for tipo, col in materiales:
        n = cuenta.get(col, 0)
        if n < area * 0.15:
            continue
        ok = {col}
        if tipo == 'arena':
            for _ in range(n // 16):
                poner(rnd.randrange(T), rnd.randrange(T),
                      tono(col, (9, 9, 10)) if rnd.random() < 0.5 else tono(col, (-14, -15, -14)), ok)
            if rnd.random() < 0.35:
                x, y = rnd.randint(m, T - m - 2), rnd.randint(m, T - m - 2)
                poner(x, y, (246, 236, 214), ok); poner(x + 1, y, (232, 218, 192), ok)
                poner(x, y + 1, (198, 172, 128), ok); poner(x + 1, y + 1, (186, 160, 116), ok)
        elif tipo == 'agua':
            for _ in range(max(1, n // (70 if T <= 16 else 110))):
                largo = rnd.randint(2, 4 if T <= 16 else 6)
                x, y = rnd.randint(m, T - m - largo), rnd.randint(m, T - m - 2)
                for k in range(largo):
                    poner(x + k, y, (130, 208, 232) if (k == 1 and largo > 2) else (98, 188, 222), ok)
                    if 0 < k < largo:
                        poner(x + k, y + 1, tono(col, (-8, -16, -17)), ok)
            for _ in range(n // 50):
                poner(rnd.randrange(T), rnd.randrange(T), tono(col, (-5, -8, -8)), ok)
        elif tipo == 'hierba':
            claro, claro2, oscuro = tono(col, (12, 19, 9)), tono(col, (22, 33, 16)), tono(col, (-12, -19, -11))
            for _ in range(max(2, n // 28)):
                x, y = rnd.randint(m, T - m - 1), rnd.randint(m, T - m - 2)
                if base(x, y) not in ok or base(x, y + 1) not in ok:
                    continue
                poner(x, y, claro2 if rnd.random() < 0.35 else claro, ok)
                poner(x, y + 1, oscuro, ok)
                if rnd.random() < 0.45:
                    poner(x + rnd.choice((-1, 1)), y + 1, claro, ok)
            for _ in range(n // 22):
                poner(rnd.randrange(T), rnd.randrange(T),
                      tono(col, (-5, -8, -5)) if rnd.random() < 0.6 else tono(col, (4, 6, 3)), ok)
        elif tipo == 'piedra':
            for _ in range(n // 14):
                poner(rnd.randrange(T), rnd.randrange(T), tono(col, 7) if rnd.random() < 0.5 else tono(col, -7), ok)
        elif tipo == 'madera':
            veta = tono(col, (-14, -11, -7))
            for _ in range(max(1, n // 40)):
                largo = rnd.randint(3, 6 if T <= 16 else 9)
                x, y = rnd.randint(m, max(m, T - m - largo)), rnd.randint(m, T - m - 1)
                for k in range(largo):
                    poner(x + k, y, veta, ok)
                poner(x + largo, y, tono(col, (8, 6, 3)), ok)     # brillo al final
            if rnd.random() < 0.2:
                x, y = rnd.randint(m + 1, T - m - 2), rnd.randint(m + 1, T - m - 2)
                poner(x, y, tono(col, (-34, -26, -16)), ok)
                poner(x + 1, y, tono(col, (-20, -15, -9)), ok)
        elif tipo == 'yeso':
            for _ in range(n // 12):
                poner(rnd.randrange(T), rnd.randrange(T), tono(col, 6) if rnd.random() < 0.45 else tono(col, -7), ok)


def mascara_agua(im, T):
    """La misma cuenta que LandsScene._mascarasDeAgua (SUB = 4)."""
    px = im.load()
    w, h = im.size
    sub, paso = 4, T // 4
    salida = {}
    for ty in range(h // T):
        for tx in range(w // T):
            m = []
            for sy in range(sub):
                for sx in range(sub):
                    az = 0
                    for py in range(paso):
                        for pxx in range(paso):
                            r, g, b, a = px[tx * T + sx * paso + pxx, ty * T + sy * paso + py]
                            if a > 40 and b > 110 and b > r + 35 and b > g + 18:
                                az += 1
                    m.append(az >= paso * paso * 0.5)
            salida[(tx, ty)] = tuple(m)
    return salida


TILESETS = {
    'isla': {
        'base': 'isla_32_base.png', 'salida': 'isla_32.png', 'T': 32, 'agua': True,
        'materiales': [('arena', (220, 193, 136)), ('agua', (74, 168, 207)), ('hierba', (65, 133, 70)),
                       ('piedra', (139, 131, 118)), ('piedra', (144, 136, 122)), ('piedra', (184, 176, 160)),
                       ('madera', (138, 95, 48)), ('madera', (184, 155, 102)), ('arena', (240, 220, 170))],
    },
    'tienda': {
        'base': 'tiles2_base.png', 'salida': 'tiles2.png', 'T': 16, 'agua': False,
        'materiales': [('madera', (177, 112, 67)), ('madera', (140, 88, 53)), ('madera', (160, 101, 61)),
                       ('madera', (191, 126, 84)), ('yeso', (197, 197, 197)), ('yeso', (173, 173, 173))],
    },
}


def generar(nombre):
    cfg = TILESETS[nombre]
    base = os.path.join(MAPAS, cfg['base'])
    salida = os.path.join(MAPAS, cfg['salida'])
    if not os.path.exists(base):
        raise SystemExit('Falta ' + base + ' (copia ahí el original antes)')
    T = cfg['T']
    original = Image.open(base).convert('RGBA')
    im = original.copy()
    px = im.load()
    w, h = im.size
    for ty in range(h // T):
        for tx in range(w // T):
            detallar(px, tx * T, ty * T, T, ty * (w // T) + tx + 1, cfg['materiales'])
    if cfg['agua']:
        if mascara_agua(original, T) != mascara_agua(im, T):
            raise SystemExit(nombre + ': la máscara de agua ha cambiado; no se escribe nada')
        print(nombre + ': máscara de agua idéntica')
    im.save(salida, optimize=True)
    print(nombre + ':', salida)


if __name__ == '__main__':
    for n in (sys.argv[1:] or list(TILESETS)):
        generar(n)
