#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
GF TILES DECO — los objetos sueltos de 16x16 de los tilesets
=============================================================================

Treinta y tres pintores, todos con la misma firma:

    pintor(pal, semilla) -> Lienzo de 16x16 con FONDO TRANSPARENTE

El fondo transparente no es un detalle: permite ponerlos en una capa por encima
del terreno, asi que la misma seta vale sobre tierra, sobre musgo o sobre roca
sin repintarla para cada suelo. Los tilesets traen ademas cuatro variantes del
suelo con la decoracion ya incrustada, que es como lo hace el juego en
`tiles.png`, para el caso de una sola capa.

`pal` es la paleta del tema: un diccionario con rampas de tres tonos
(claro, medio, oscuro). Cada pintor coge las que necesita, asi que la misma
roca sale gris en la cueva, ocre en el desierto y negra en el volcan sin tocar
una linea de codigo.
"""

import math

import gf_arte as A
from gf_arte import Mascara, Lienzo, mezcla, ajusta
from gf_tiles import T, ruido, relleno

TRANSP = A.TRANSP


def _l():
    return Lienzo(T, T)


def _volumen(t, m, cols, dir_luz=(-1, -1)):
    """Rellena una mascara con luz arriba-izquierda y contorno propio."""
    caja = m.caja()
    if not caja:
        return t
    x0, y0, x1, y1 = caja
    an = max(1, x1 - x0)
    al = max(1, y1 - y0)
    for x, y in m.puntos():
        f = ((x - x0) / float(an)) * 0.42 + ((y - y0) / float(al)) * 0.58
        t.set(x, y, cols[0] if f < 0.28 else (cols[1] if f < 0.72 else cols[2]))
    for x, y in m.borde(True).puntos():
        t.set(x, y, A.contorno_de(cols[1]))
    return t


# ===========================================================================
# PIEDRA Y SUELO
# ===========================================================================

def roca(pal, s, tam=1.0):
    t = _l()
    m = Mascara(T, T)
    cx, cy = 8, 10
    rx, ry = 4.6 * tam, 3.4 * tam
    for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
        u = (x - cx) / rx
        if abs(u) > 1:
            continue
        h = math.sqrt(max(0.0, 1 - u * u))
        m.columna(x, cy - ry * h, cy + ry * 0.55 * h)
    _volumen(t, m, pal['roca'])
    return t


def roca_grande(pal, s):
    t = _l()
    m = Mascara(T, T)
    m.poligono([(1, 14), (2, 7), (6, 3), (11, 4), (14, 9), (14, 14)])
    _volumen(t, m, pal['roca'])
    for x, y in [(5, 8), (9, 10), (6, 11)]:
        t.encima(x, y, pal['roca'][2])
    return t


def guijarros(pal, s):
    t = _l()
    for i, (cx, cy, r) in enumerate([(4, 6, 1.4), (10, 5, 1.1), (7, 11, 1.6), (12, 11, 1.2)]):
        m = Mascara(T, T).elipse(cx, cy, r + .4, r)
        _volumen(t, m, pal['roca'])
    return t


def grieta(pal, s, col=None):
    t = _l()
    c = col or pal['roca'][2]
    cl = ajusta(c, dv=1.6)
    pts = [(2, 3), (5, 6), (6, 9), (9, 11), (11, 14)]
    for i in range(len(pts) - 1):
        m = Mascara(T, T).linea(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])
        for x, y in m.puntos():
            t.set(x, y, c)
            t.set(x + 1, y, cl)
    t.set(4, 5, c); t.set(8, 8, c)
    return t


def mineral(pal, s, col=None):
    t = _l()
    m = Mascara(T, T)
    m.poligono([(3, 12), (4, 6), (8, 4), (12, 7), (12, 13)])
    _volumen(t, m, pal['roca'])
    v = col or pal['acento']
    for x, y in [(6, 8), (7, 9), (9, 8), (6, 11), (10, 11), (8, 6)]:
        t.encima(x, y, v[1])
        t.encima(x, y - 1, v[0])
    return t


def cristal(pal, s, col=None):
    t = _l()
    v = col or pal['acento']
    for i, (bx, alto, an) in enumerate([(5, 9, 2.0), (9, 6, 1.5), (7, 11, 1.2)]):
        m = Mascara(T, T)
        m.poligono([(bx - an, 14), (bx - an * .6, 14 - alto + 1), (bx, 14 - alto),
                    (bx + an * .6, 14 - alto + 1), (bx + an, 14)])
        for x, y in m.puntos():
            f = (x - (bx - an)) / float(max(1, an * 2))
            t.set(x, y, v[0] if f < 0.38 else (v[1] if f < 0.74 else v[2]))
        for x, y in m.borde(True).puntos():
            t.set(x, y, A.contorno_de(v[1]))
    return t


def estalagmita(pal, s):
    t = _l()
    for bx, alto, an in [(5, 10, 2.2), (10, 7, 1.6)]:
        m = Mascara(T, T)
        m.poligono([(bx - an, 15), (bx, 15 - alto), (bx + an, 15)])
        _volumen(t, m, pal['roca'])
    return t


def estalactita(pal, s):
    t = _l()
    for bx, alto, an in [(4, 9, 2.0), (9, 6, 1.5), (13, 4, 1.2)]:
        m = Mascara(T, T)
        m.poligono([(bx - an, 0), (bx, alto), (bx + an, 0)])
        _volumen(t, m, pal['roca'])
    return t


def losa_rota(pal, s):
    t = _l()
    m = Mascara(T, T)
    m.poligono([(2, 12), (2, 5), (9, 4), (13, 8), (12, 13)])
    _volumen(t, m, pal['roca'])
    for x, y in [(5, 6), (6, 7), (7, 9), (8, 10)]:
        t.encima(x, y, pal['roca'][2])
    return t


def columna(pal, s):
    t = _l()
    m = Mascara(T, T).rect(5, 2, 10, 15)
    m.rect(4, 2, 11, 4)
    m.rect(4, 13, 11, 15)
    _volumen(t, m, pal['roca'])
    for y in range(5, 13, 2):
        t.encima(6, y, pal['roca'][2])
        t.encima(9, y, pal['roca'][0])
    return t


def escalon(pal, s):
    t = _l()
    m = Mascara(T, T).rect(2, 6, 13, 14)
    _volumen(t, m, pal['roca'])
    for x in range(2, 14):
        t.set(x, 9, pal['roca'][2])
        t.set(x, 10, pal['roca'][0])
    return t


# ===========================================================================
# PLANTAS
# ===========================================================================

def hierba(pal, s):
    t = _l()
    v = pal['planta']
    for i, (bx, alto, curva) in enumerate([(4, 5, -1), (7, 7, 0), (10, 5, 1), (12, 4, 1)]):
        for j in range(alto):
            x = bx + int(curva * (j / float(alto)) ** 2 * 2.2)
            t.set(x, 14 - j, v[1] if j < alto - 2 else v[0])
        t.set(bx, 14, v[2])
    return t


def hierba_alta(pal, s):
    t = _l()
    v = pal['planta']
    for i, (bx, alto, curva) in enumerate([(3, 10, -1.6), (6, 13, -0.5), (9, 12, 0.6),
                                           (12, 9, 1.6)]):
        for j in range(alto):
            x = bx + int(curva * (j / float(alto)) ** 2 * 3.0)
            t.set(x, 15 - j, v[1] if j < alto - 3 else v[0])
            if j % 3 == 0:
                t.set(x + 1, 15 - j, v[2])
    return t


def arbusto(pal, s):
    t = _l()
    v = pal['planta']
    m = Mascara(T, T)
    m.elipse(8, 9, 6, 4.6)
    m.elipse(5, 7, 3.4, 3)
    m.elipse(11, 7, 3, 2.6)
    _volumen(t, m, v)
    for x, y in m.borde_interno(True).puntos():
        if ruido(x, y, s) > 0.55:
            t.set(x, y, v[0] if y < 8 else v[2])
    return t


def flor(pal, s, col=None):
    t = _l()
    v = pal['planta']
    c = col or pal['acento']
    for bx, alto in [(5, 6), (10, 5)]:
        for j in range(alto):
            t.set(bx, 14 - j, v[1])
        for dx, dy in ((0, 0), (-1, 0), (1, 0), (0, -1), (0, 1)):
            t.set(bx + dx, 14 - alto + dy, c[1] if (dx or dy) else c[0])
    t.set(4, 14, v[2]); t.set(11, 14, v[2])
    return t


def seta(pal, s, col=None):
    t = _l()
    c = col or pal['acento']
    tallo = pal['hueso'] if 'hueso' in pal else pal['roca']
    for bx, alto, r in [(5, 5, 3.2), (10, 3, 2.2)]:
        for j in range(alto):
            t.set(bx, 14 - j, tallo[1])
            t.set(bx + 1, 14 - j, tallo[2])
        m = Mascara(T, T)
        for x in range(int(bx - r), int(bx + r) + 2):
            u = (x - bx - 0.5) / r
            if abs(u) > 1:
                continue
            h = math.sqrt(max(0.0, 1 - u * u)) * (r * 0.8)
            m.columna(x, 14 - alto - h, 14 - alto)
        _volumen(t, m, c)
        for x, y in m.puntos():
            if ruido(x, y, s + 3) > 0.80:
                t.set(x, y, c[0])
    return t


def helecho(pal, s):
    t = _l()
    v = pal['planta']
    for bx, curva in [(5, -1), (9, 1)]:
        for j in range(10):
            x = bx + int(curva * (j / 10.0) ** 2 * 3)
            t.set(x, 14 - j, v[1])
            if j % 2 == 0 and j > 1:
                lg = 3 - j // 4
                for k in range(1, lg + 1):
                    t.set(x - k, 14 - j + k // 2, v[0])
                    t.set(x + k, 14 - j + k // 2, v[2])
    return t


def tronco(pal, s):
    t = _l()
    m = Mascara(T, T).rect(1, 7, 14, 11)
    m.elipse(1, 9, 1.6, 2.4)
    m.elipse(14, 9, 1.6, 2.4)
    _volumen(t, m, pal['madera'])
    for x in range(3, 13, 3):
        for y in range(7, 12):
            t.encima(x, y, pal['madera'][2])
    t.encima(14, 9, pal['madera'][0])
    return t


def tocon(pal, s):
    t = _l()
    m = Mascara(T, T).rect(4, 6, 11, 14)
    m.elipse(7.5, 6, 4, 2)
    _volumen(t, m, pal['madera'])
    anillo = Mascara(T, T).elipse(7.5, 6, 4, 2)
    for x, y in anillo.puntos():
        d = math.hypot((x - 7.5) / 4.0, (y - 6) / 2.0)
        t.set(x, y, pal['madera'][0] if d < 0.45 else pal['madera'][1])
    for x, y in anillo.borde_interno(False).puntos():
        t.set(x, y, pal['madera'][2])
    return t


def raiz(pal, s):
    t = _l()
    c = pal['madera']
    for pts in ([(0, 10), (4, 9), (7, 11), (11, 10), (15, 12)],
                [(2, 14), (5, 13), (9, 14)]):
        for i in range(len(pts) - 1):
            m = Mascara(T, T)
            m.linea(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 2)
            for x, y in m.puntos():
                t.set(x, y, c[1])
            for x, y in m.borde_interno(False).puntos():
                if y > pts[i][1]:
                    t.set(x, y, c[2])
    return t


def cactus(pal, s):
    t = _l()
    v = pal['planta']
    m = Mascara(T, T).rect(6, 3, 9, 15)
    m.rect(3, 7, 5, 9)
    m.rect(3, 7, 4, 11)
    m.rect(10, 5, 12, 7)
    m.rect(11, 5, 12, 10)
    _volumen(t, m, v)
    for y in range(4, 15, 3):
        t.encima(7, y, v[0])
        t.encima(9, y, v[2])
    return t


def palmera(pal, s):
    t = _l()
    c = pal['madera']
    v = pal['planta']
    for j in range(9):
        t.set(7 + j // 5, 15 - j, c[1])
        t.set(8 + j // 5, 15 - j, c[2])
    for ang in (-2.6, -2.0, -1.1, -0.5):
        for k in range(6):
            x = 7 + math.cos(ang) * k
            y = 7 + math.sin(ang) * k * 0.7 + (k * k) * 0.06
            t.set(x, y, v[1] if k < 4 else v[0])
            t.set(x, y + 1, v[2])
    return t


def junco(pal, s):
    t = _l()
    v = pal['planta']
    for bx, alto in [(4, 11), (7, 14), (11, 10), (13, 8)]:
        for j in range(alto):
            t.set(bx, 15 - j, v[1])
        t.set(bx, 15 - alto, v[0])
        if alto > 10:
            for j in range(3):
                t.set(bx, 15 - alto + j, pal['madera'][1])
                t.set(bx + 1, 15 - alto + j, pal['madera'][2])
    return t


def nenufar(pal, s):
    t = _l()
    v = pal['planta']
    m = Mascara(T, T).elipse(7, 9, 5.4, 4)
    for x in range(7, 13):
        m.set(x, 9, 0)
        m.set(x, 8, 0) if x > 9 else None
    _volumen(t, m, v)
    m2 = Mascara(T, T).disco(11, 5, 1.8)
    _volumen(t, m2, pal['acento'])
    return t


def alga(pal, s):
    t = _l()
    v = pal['planta']
    for bx, alto, f in [(4, 12, 1.0), (8, 15, -1.0), (12, 10, 0.8)]:
        for j in range(alto):
            x = bx + int(math.sin(j * 0.5) * 1.6 * f)
            t.set(x, 15 - j, v[1])
            if j % 3 == 0:
                t.set(x + 1, 15 - j, v[0])
                t.set(x - 1, 15 - j, v[2])
    return t


def coral(pal, s, col=None):
    t = _l()
    c = col or pal['acento']

    def rama(x, y, ang, largo, gr):
        for i in range(int(largo)):
            m = Mascara(T, T).disco(x + math.cos(ang) * i, y + math.sin(ang) * i,
                                    max(0.7, gr * (1 - i / largo)))
            for xx, yy in m.puntos():
                t.set(xx, yy, c[1])
        return x + math.cos(ang) * largo, y + math.sin(ang) * largo

    x1, y1 = rama(8, 15, -math.pi / 2, 6, 1.8)
    a, b = rama(x1, y1, -math.pi / 2 - 0.8, 5, 1.3)
    c2, d = rama(x1, y1, -math.pi / 2 + 0.7, 4, 1.3)
    rama(a, b, -math.pi / 2 - 0.2, 3, 1.0)
    rama(c2, d, -math.pi / 2 + 0.3, 3, 1.0)
    m = t.mascara_opaca()
    for x, y in m.borde_interno(True).puntos():
        if x > 8:
            t.set(x, y, c[2])
        elif y < 8:
            t.set(x, y, c[0])
    return t


# ===========================================================================
# HUESOS Y RESTOS
# ===========================================================================

def hueso(pal, s):
    t = _l()
    c = pal['hueso']
    m = Mascara(T, T).rect(4, 8, 12, 9)
    for sx in (4, 12):
        m.disco(sx, 7, 1.4)
        m.disco(sx, 10, 1.4)
    _volumen(t, m, c)
    return t


def calavera(pal, s):
    t = _l()
    c = pal['hueso']
    m = Mascara(T, T).elipse(8, 8, 4.6, 4)
    m.rect(6, 11, 10, 13)
    _volumen(t, m, c)
    for x, y in ((6, 8), (10, 8)):
        t.set(x, y, (24, 20, 22))
        t.set(x + 1, y, (24, 20, 22))
        t.set(x, y + 1, (24, 20, 22))
    t.set(8, 11, (24, 20, 22))
    for x in range(6, 11, 2):
        t.set(x, 13, ajusta(c[2], dv=0.7))
    return t


def concha(pal, s):
    t = _l()
    c = pal['hueso']
    m = Mascara(T, T)
    m.poligono([(3, 12), (4, 7), (8, 4), (12, 7), (13, 12), (8, 14)])
    _volumen(t, m, c)
    for k in range(-2, 3):
        ang = math.pi / 2 + k * 0.34
        for j in range(2, 9):
            t.encima(8 + math.cos(ang + math.pi) * j * 0.7, 13 - math.sin(ang) * j * 1.0,
                     c[2])
    return t


def estrella_mar(pal, s):
    t = _l()
    c = pal['acento']
    pts = []
    for i in range(10):
        ang = -math.pi / 2 + i * math.pi / 5
        r = 6.0 if i % 2 == 0 else 2.6
        pts.append((8 + math.cos(ang) * r, 8 + math.sin(ang) * r))
    m = Mascara(T, T).poligono(pts)
    _volumen(t, m, c)
    return t


def vasija(pal, s):
    t = _l()
    c = pal['roca']
    m = Mascara(T, T)
    m.elipse(8, 10, 4.4, 4)
    m.rect(6, 4, 9, 7)
    m.rect(5, 3, 10, 4)
    _volumen(t, m, c)
    for x in range(4, 12):
        t.encima(x, 9, ajusta(c[2], dv=1.15))
    return t


def telarana(pal, s):
    t = _l()
    c = pal['hueso'] if 'hueso' in pal else pal['roca']
    col = ajusta(c[0], ds=0.4)
    for k in range(4):
        ang = k * math.pi / 6
        for j in range(11):
            t.set(0 + math.cos(ang) * j, 0 + math.sin(ang) * j, col)
    for r in (4, 7, 10):
        for i in range(9):
            ang = i * (math.pi / 2) / 8
            t.set(math.cos(ang) * r, math.sin(ang) * r, col)
    return t


def antorcha(pal, s):
    t = _l()
    c = pal['madera']
    f = pal['acento']
    m = Mascara(T, T).rect(7, 6, 8, 15)
    _volumen(t, m, c)
    llama = Mascara(T, T)
    llama.poligono([(5, 6), (7.5, 0), (10, 6), (7.5, 8)])
    for x, y in llama.puntos():
        d = abs(x - 7.5) / 3.0 + (y / 8.0) * 0.4
        t.set(x, y, f[0] if d < 0.35 else (f[1] if d < 0.75 else f[2]))
    return t


def charco(pal, s):
    t = _l()
    c = pal['liquido']
    m = Mascara(T, T).elipse(8, 10, 6, 3.4)
    for x, y in m.puntos():
        t.set(x, y, c[1] if ruido(x, y, s) > 0.25 else c[2])
    for x, y in m.borde_interno(False).puntos():
        t.set(x, y, c[2])
    t.set(5, 8, c[0]); t.set(6, 8, c[0]); t.set(10, 11, c[0])
    return t


def burbujas(pal, s):
    t = _l()
    c = pal['liquido']
    for cx, cy, r in [(5, 11, 1.6), (9, 7, 1.2), (11, 12, 1.0), (7, 3, 0.9)]:
        m = Mascara(T, T).disco(cx, cy, r)
        for x, y in m.puntos():
            t.set(x, y, mezcla(c[0], (255, 255, 255), 0.35))
        for x, y in m.borde_interno(False).puntos():
            t.set(x, y, c[0])
        t.set(cx, cy, mezcla(c[1], (255, 255, 255), 0.6))
    return t


def duna(pal, s):
    t = _l()
    c = pal['base']
    for x in range(T):
        y = 9 + int(math.sin(x * 0.5) * 1.6)
        t.set(x, y, c[0])
        t.set(x, y + 1, c[2])
        y2 = 13 + int(math.sin(x * 0.4 + 2) * 1.2)
        t.set(x, y2, c[0])
    return t


def ceniza(pal, s):
    t = _l()
    c = pal['roca']
    for i in range(14):
        x = int(ruido(i, 1, s) * T)
        y = int(ruido(2, i, s) * T)
        t.set(x, y, c[0] if i % 3 else c[2])
    return t


def hongo_luz(pal, s):
    t = _l()
    c = pal['acento']
    for cx, cy, r in [(5, 9, 2.2), (10, 11, 1.8), (8, 5, 1.4)]:
        m = Mascara(T, T).disco(cx, cy, r)
        for x, y in m.puntos():
            t.set(x, y, c[1])
        for x, y in m.borde_interno(False).puntos():
            t.set(x, y, c[2])
        t.set(cx - 1, cy - 1, c[0])
        t.set(cx, cy - r - 1, mezcla(c[0], (255, 255, 255), .5))
    return t


PINTORES = {
    'roca': roca, 'roca_grande': roca_grande, 'guijarros': guijarros,
    'grieta': grieta, 'mineral': mineral, 'cristal': cristal,
    'estalagmita': estalagmita, 'estalactita': estalactita,
    'losa_rota': losa_rota, 'columna': columna, 'escalon': escalon,
    'hierba': hierba, 'hierba_alta': hierba_alta, 'arbusto': arbusto,
    'flor': flor, 'seta': seta, 'helecho': helecho, 'tronco': tronco,
    'tocon': tocon, 'raiz': raiz, 'cactus': cactus, 'palmera': palmera,
    'junco': junco, 'nenufar': nenufar, 'alga': alga, 'coral': coral,
    'hueso': hueso, 'calavera': calavera, 'concha': concha,
    'estrella_mar': estrella_mar, 'vasija': vasija, 'telarana': telarana,
    'antorcha': antorcha, 'charco': charco, 'burbujas': burbujas,
    'duna': duna, 'ceniza': ceniza, 'hongo_luz': hongo_luz,
}


# ===========================================================================
# OBJETOS NUEVOS — lo que hacia falta para que un mapa parezca habitado
# ===========================================================================

def valla(pal, s):
    """Un tramo de valla de madera: dos travesanos y tres postes."""
    t = _l()
    c = pal['madera']
    for x in range(T):
        t.set(x, 7, c[1]); t.set(x, 8, c[2])
        t.set(x, 11, c[1]); t.set(x, 12, c[2])
    for x in (1, 7, 13):
        for y in range(5, 15):
            t.set(x, y, c[1]); t.set(x + 1, y, c[0])
        t.set(x, 4, c[0])
    return t


def poste(pal, s):
    """Un poste solo, con su base de tierra."""
    t = _l()
    c = pal['madera']
    for y in range(3, 15):
        t.set(7, y, c[1]); t.set(8, y, c[0]); t.set(9, y, c[2])
    for x in range(5, 12):
        t.set(x, 14, pal['roca'][2])
    t.set(7, 2, c[0]); t.set(8, 2, c[0]); t.set(9, 2, c[2])
    return t


def cartel_tile(pal, s):
    """Un cartel chico clavado en el suelo."""
    t = _l()
    c = pal['madera']
    for y in range(8, 15):
        t.set(8, y, c[1]); t.set(9, y, c[2])
    for y in range(3, 9):
        for x in range(3, 14):
            t.set(x, y, c[1] if (y % 3) else c[0])
    for x in range(3, 14):
        t.set(x, 8, c[2])
    for y in (4, 6):
        for x in range(5, 11):
            t.set(x, y, ajusta(c[2], dv=0.7))
    return t


def barril_tile(pal, s):
    t = _l()
    c = pal['madera']
    m = Mascara(T, T)
    for y in range(3, 15):
        hw = 4.2 + 1.0 * math.sin(math.pi * (y - 3) / 11.0)
        for x in range(int(8 - hw), int(8 + hw) + 1):
            m.set(x, y)
    _volumen(t, m, c)
    for y in (5, 12):
        for x in range(T):
            if m.get(x, y):
                t.set(x, y, pal['roca'][1])
    return t


def caja_tile(pal, s):
    t = _l()
    c = pal['madera']
    m = Mascara(T, T).rect(3, 4, 12, 14)
    _volumen(t, m, c)
    for i in range(11):
        t.encima(3 + i, 4 + i, c[2])
    for x in range(3, 13):
        t.encima(x, 4, c[0])
    return t


def hoguera_tile(pal, s):
    t = _l()
    c = pal['madera']
    for dx in (-3, 0, 3):
        m = Mascara(T, T)
        m.linea(8 + dx, 14, 8 - dx * 0.6, 9, 2)
        _volumen(t, m, c)
    f = pal['acento']
    m = Mascara(T, T).disco(8, 8, 2.6).disco(9, 6, 1.6).disco(7, 5, 1.2)
    for x, y in m.puntos():
        t.set(x, y, f[1])
    for x, y in m.borde_interno(False).puntos():
        t.set(x, y, f[2])
    t.set(8, 7, f[0]); t.set(8, 5, f[0])
    for x in (2, 5, 10, 13):
        t.set(x, 14, pal['roca'][1]); t.set(x, 15, pal['roca'][2])
    return t


def trigo(pal, s):
    """Espigas: tallo con grano, para campos de labranza."""
    t = _l()
    c = pal['acento']
    v = pal['planta']
    for i, x in enumerate((3, 7, 11, 14)):
        alto = 9 + (i % 3)
        for k in range(alto):
            t.set(x, 15 - k, v[1] if k % 2 else v[2])
        for k in range(4):
            y = 15 - alto - k + 3
            t.set(x, y, c[1])
            t.set(x - 1, y, c[2] if k % 2 else c[0])
            t.set(x + 1, y, c[0] if k % 2 else c[2])
    return t


def girasol(pal, s):
    t = _l()
    v = pal['planta']
    c = pal['acento']
    for k in range(9):
        t.set(8, 15 - k, v[1]); t.set(7, 15 - k, v[2])
    t.set(6, 11, v[0]); t.set(5, 12, v[1]); t.set(10, 10, v[0]); t.set(11, 11, v[1])
    m = Mascara(T, T).disco(8, 5, 3.4)
    for x, y in m.puntos():
        t.set(x, y, c[1])
    for x, y in m.borde_interno(False).puntos():
        t.set(x, y, c[2])
    for x, y in Mascara(T, T).disco(8, 5, 1.6).puntos():
        t.set(x, y, A.hex_rgb('#5a3a18'))
    t.set(7, 4, A.hex_rgb('#7a5228'))
    return t


def calabaza(pal, s):
    t = _l()
    c = pal['acento']
    m = Mascara(T, T).elipse(8, 10, 5.2, 4.2)
    _volumen(t, m, c)
    for x in (5, 8, 11):
        for y in range(T):
            if m.get(x, y):
                t.set(x, y, ajusta(c[2], dv=1.1))
    for y in range(3, 6):
        t.set(8, y, pal['planta'][1])
    t.set(9, 3, pal['planta'][0]); t.set(7, 4, pal['planta'][2])
    return t


def zarza(pal, s):
    """Un matojo espinoso con bayas."""
    t = _l()
    v = pal['planta']
    for i in range(9):
        x0 = 2 + int(ruido(i, 3, s) * 12)
        y0 = 15 - int(ruido(4, i, s) * 9)
        for k in range(3 + i % 3):
            t.set(x0 + k - 1, y0 - k, v[1] if k % 2 else v[2])
        t.set(x0, y0 + 1, v[2])
    c = pal['acento2']
    for dx, dy in ((4, 7), (10, 5), (7, 11)):
        t.set(dx, dy, c[1]); t.set(dx + 1, dy, c[2]); t.set(dx, dy - 1, c[0])
    return t


def monton_nieve(pal, s):
    t = _l()
    c = [A.hex_rgb(x) for x in ('#ffffff', '#e0e8f0', '#b0c0d0')]
    m = Mascara(T, T).elipse(8, 13, 6.4, 3.4).elipse(5, 11, 3.2, 2.4)
    m.elipse(11, 12, 3.0, 2.2)
    _volumen(t, m, c)
    return t


def carambano(pal, s):
    """Carambanos colgando del borde de arriba."""
    t = _l()
    c = [A.hex_rgb(x) for x in ('#eafaff', '#a8d8ec', '#5f90b0')]
    for i, (x, largo) in enumerate(((2, 6), (6, 9), (10, 5), (13, 8))):
        for k in range(largo):
            an = 1 if k > largo * 0.6 else 2
            for dx in range(an):
                t.set(x + dx, k, c[1])
            t.set(x, k, c[0])
        t.set(x, largo, c[2])
    return t


def farol(pal, s):
    t = _l()
    c = pal['madera']
    for y in range(7, 15):
        t.set(8, y, c[1]); t.set(7, y, c[0]); t.set(9, y, c[2])
    m = Mascara(T, T).rect(5, 2, 11, 7)
    for x, y in m.puntos():
        t.set(x, y, pal['acento'][1])
    for x, y in m.borde(False).puntos():
        t.set(x, y, c[2])
    t.set(7, 4, pal['acento'][0]); t.set(8, 4, pal['acento'][0])
    for x in range(4, 13):
        t.set(x, 1, c[2])
    return t


def camino_losa(pal, s):
    """Unas losas sueltas, para hacer sendas de piedra."""
    t = _l()
    c = pal['roca']
    for (x0, y0, w, h) in ((1, 2, 6, 4), (9, 3, 5, 4), (3, 8, 5, 4), (10, 9, 5, 5)):
        m = Mascara(T, T).rect(x0, y0, x0 + w - 1, y0 + h - 1)
        _volumen(t, m, c)
    return t


def huellas(pal, s):
    t = _l()
    c = pal['base']
    for i, (x, y) in enumerate(((3, 12), (6, 8), (9, 11), (12, 5))):
        t.set(x, y, c[2]); t.set(x + 1, y, c[2]); t.set(x, y + 1, c[2])
    return t


PINTORES.update({
    'valla': valla, 'poste': poste, 'cartel': cartel_tile,
    'barril': barril_tile, 'caja': caja_tile, 'hoguera': hoguera_tile,
    'trigo': trigo, 'girasol': girasol, 'calabaza': calabaza, 'zarza': zarza,
    'monton_nieve': monton_nieve, 'carambano': carambano, 'farol': farol,
    'camino_losa': camino_losa, 'huellas': huellas,
})
