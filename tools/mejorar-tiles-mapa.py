# -*- coding: utf-8 -*-
"""
EL TILESET DEL MAPA PRINCIPAL, CON MÁS DETALLE                  (2026-10-04)

Lee  Game/MAPAS/tiles_base.png   (el tileset original de Tiled, intacto)
Escribe Game/MAPAS/tiles.png     (el que usa el mapa y la captura del suelo)

    python tools/mejorar-tiles-mapa.py

QUÉ HACE
  El tileset es pixel art de paleta corta (89 colores) y las casillas que más
  se repiten son lisas: hierba (65,133,70) en casi 12.000 casillas, agua
  (86,134,168) en 7.000 y tierra (177,133,105) en 6.000. Un color liso en
  miles de casillas es lo que hace que el suelo se vea plano.

  A cada casilla se le pinta detalle SEGÚN EL MATERIAL de cada píxel:
    hierba         briznas: un píxel claro arriba y uno oscuro debajo
    hierba oscura  hojitas en grupo, más apagadas
    agua           destellos: rayitas claras horizontales con su sombra
    tierra         motas y alguna piedrecita
    piedra         grano: píxeles sueltos un tono arriba o abajo
  Solo se tocan los píxeles del color BASE de cada material: los bordes, los
  contornos, las flores y las piedras ya dibujadas se quedan como estaban.

SIN COSTURAS
  Todo detalle con forma (brizna, rayita, piedra) se queda DENTRO de la
  casilla, a un píxel del borde como mínimo, así que nunca tiene que casar con
  la casilla de al lado. Lo que sí llega al borde son píxeles sueltos, que no
  tienen continuidad que romper.

  Cada casilla usa su propia semilla (su índice): las muchas casillas de
  hierba lisa que hay en el tileset salen distintas entre sí.

MISMA REJILLA, MISMOS ÍNDICES
  El archivo mide lo mismo y cada casilla sigue en su sitio: el TMX y el JSON
  del mapa no cambian. El rojo de las casillas sin usar no se toca.
"""
import os
import random
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.dirname(AQUI)
ORIGEN = os.path.join(BIN, 'Game', 'MAPAS', 'tiles_base.png')
DESTINO = os.path.join(BIN, 'Game', 'MAPAS', 'tiles.png')
T = 16

HIERBA = (65, 133, 70)
HIERBA_OSC = (54, 109, 58)
HIERBA_OSC2 = (55, 115, 60)
AGUA = (86, 134, 168)
TIERRA = (177, 133, 105)
PIEDRAS = {(116, 114, 111), (108, 117, 113), (117, 123, 121), (122, 115, 109)}
SIN_USO = (136, 0, 21)


def tono(c, d):
    """El color `c` desplazado `d` en cada canal (d puede ser una terna)."""
    if isinstance(d, int):
        d = (d, d, d)
    return tuple(max(0, min(255, c[i] + d[i])) for i in range(3))


def detallar_casilla(px, ox, oy, semilla):
    rnd = random.Random(semilla)

    def base(x, y):
        return px[ox + x, oy + y][:3]

    def poner(x, y, color, solo_si):
        if 0 <= x < T and 0 <= y < T and base(x, y) in solo_si:
            a = px[ox + x, oy + y][3]
            px[ox + x, oy + y] = color + (a,)

    cuenta = {}
    for y in range(T):
        for x in range(T):
            c = base(x, y)
            cuenta[c] = cuenta.get(c, 0) + 1
    hay = lambda col: cuenta.get(col, 0)

    # ── hierba: briznas (claro arriba, oscuro abajo) y alguna mota ─────────
    if hay(HIERBA) >= 40:
        ok = {HIERBA}
        claro, claro2, oscuro = tono(HIERBA, (12, 19, 9)), tono(HIERBA, (22, 33, 16)), tono(HIERBA, (-12, -19, -11))
        for _ in range(max(2, hay(HIERBA) // 28)):
            x, y = rnd.randint(1, T - 2), rnd.randint(1, T - 3)
            if base(x, y) not in ok or base(x, y + 1) not in ok:
                continue
            poner(x, y, claro2 if rnd.random() < 0.35 else claro, ok)
            poner(x, y + 1, oscuro, ok)
            if rnd.random() < 0.45:                      # brizna doble, en V
                lado = rnd.choice((-1, 1))
                poner(x + lado, y + 1, claro, ok)
        for _ in range(hay(HIERBA) // 22):              # motas sueltas
            x, y = rnd.randrange(T), rnd.randrange(T)
            poner(x, y, tono(HIERBA, (-5, -8, -5)) if rnd.random() < 0.6 else tono(HIERBA, (4, 6, 3)), ok)

    # ── hierba oscura (las manchas de matorral): hojitas en grupo ─────────
    for osc in (HIERBA_OSC, HIERBA_OSC2):
        if hay(osc) >= 40:
            ok = {osc}
            for _ in range(max(2, hay(osc) // 36)):
                x, y = rnd.randint(2, T - 3), rnd.randint(2, T - 3)
                poner(x, y, tono(osc, (7, 12, 6)), ok)
                poner(x + 1, y, tono(osc, (4, 7, 3)), ok)
                poner(x, y + 1, tono(osc, (-8, -12, -7)), ok)
            for _ in range(hay(osc) // 26):
                poner(rnd.randrange(T), rnd.randrange(T), tono(osc, (-5, -8, -5)), ok)

    # ── agua: destellos horizontales con sombra debajo ────────────────────
    if hay(AGUA) >= 40:
        ok = {AGUA}
        brillo, brillo2, sombra = tono(AGUA, (14, 14, 12)), tono(AGUA, (30, 30, 24)), tono(AGUA, (-8, -10, -10))
        for _ in range(max(1, hay(AGUA) // 90)):
            largo = rnd.randint(2, 4)
            x, y = rnd.randint(1, T - 1 - largo), rnd.randint(1, T - 3)
            for k in range(largo):
                poner(x + k, y, brillo2 if (k == 1 and largo > 2) else brillo, ok)
                if 0 < k < largo:
                    poner(x + k, y + 1, sombra, ok)
        for _ in range(hay(AGUA) // 40):
            poner(rnd.randrange(T), rnd.randrange(T), tono(AGUA, (-4, -6, -6)), ok)

    # ── tierra: motas y alguna piedrecita ─────────────────────────────────
    if hay(TIERRA) >= 40:
        ok = {TIERRA}
        for _ in range(hay(TIERRA) // 18):
            poner(rnd.randrange(T), rnd.randrange(T),
                  tono(TIERRA, (9, 9, 8)) if rnd.random() < 0.45 else tono(TIERRA, (-14, -12, -10)), ok)
        if rnd.random() < 0.55:
            x, y = rnd.randint(1, T - 3), rnd.randint(1, T - 3)
            poner(x, y, (205, 178, 156), ok)
            poner(x + 1, y, (190, 160, 138), ok)
            poner(x, y + 1, (140, 104, 82), ok)
            poner(x + 1, y + 1, (126, 92, 72), ok)

    # ── piedra: grano ─────────────────────────────────────────────────────
    for p in PIEDRAS:
        if hay(p) >= 30:
            ok = {p}
            for _ in range(hay(p) // 14):
                poner(rnd.randrange(T), rnd.randrange(T),
                      tono(p, 7) if rnd.random() < 0.5 else tono(p, -7), ok)


def main():
    if not os.path.exists(ORIGEN):
        raise SystemExit('Falta ' + ORIGEN + ' (el tileset original). Cópialo ahí antes.')
    im = Image.open(ORIGEN).convert('RGBA')
    w, h = im.size
    if w % T or h % T:
        raise SystemExit('El tileset no es múltiplo de 16: %dx%d' % (w, h))
    px = im.load()
    cols = w // T
    n = 0
    for ty in range(h // T):
        for tx in range(cols):
            ox, oy = tx * T, ty * T
            if px[ox, oy][:3] == SIN_USO and px[ox + 15, oy + 15][:3] == SIN_USO:
                continue
            detallar_casilla(px, ox, oy, semilla=ty * cols + tx + 1)
            n += 1
    im.save(DESTINO, optimize=True)
    print('casillas detalladas:', n, '->', DESTINO)


if __name__ == '__main__':
    main()
