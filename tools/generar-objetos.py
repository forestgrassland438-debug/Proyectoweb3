#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
OBJETOS — 30 props de mapa para `Game/newpro/objetos/`
=============================================================================

Fogatas, hogueras, calderos, secaderos, tiendas, bancos, barriles, faroles,
anclas, boyas... lo que se planta en el suelo alrededor de un campamento de
pesca.

ORIGEN ABAJO
---------------------------------------------------------------------------
Todos se dibujan **apoyados en la ultima fila del lienzo**, como el
espantapajaros del lote 2 y como los objetos del mapa del juego. Asi se
colocan con `setOrigin(0.5, 1)` sobre la casilla y se hunden en el suelo
solos, sin ajustar cada uno a mano.

LAS FOGATAS VAN EN TRES FOTOGRAMAS
---------------------------------------------------------------------------
`fogata_apagada` mas `fogata_1` y `fogata_2`: dos llamas distintas que,
alternadas cada 150 ms, dan el parpadeo. No es una llama con dos brillos
distintos: cambia la SILUETA —una llama alta y estrecha y otra mas baja y
ancha—, que es lo unico que se lee como fuego a este tamano. Lo mismo con
`hoguera_1/2`, `brasero_1/2`, `caldero_fuego_1/2` y `farol_1/2`.

La luz que la fogata echa al suelo se deja fuera a proposito: eso es un
`PointLight` o una mancha en otra capa, no parte del sprite.
"""

import io
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gf_arte as A
from gf_arte import Mascara, Lienzo, mezcla, ajusta, perfil, rng_de

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, 'Game', 'newpro', 'objetos')
WEB = '/Game/newpro/objetos'

W, H = 48, 56
CX, SUELO = W // 2, H - 1

MAD = [A.hex_rgb(c) for c in ('#c08f52', '#a3763f', '#8a5f30', '#6b4724', '#4e3319')]
MAD_OSC = [A.hex_rgb(c) for c in ('#7a5f42', '#5f4830', '#4a3624', '#33251a', '#221810')]
PIEDRA = [A.hex_rgb(c) for c in ('#b8b0a0', '#9a9284', '#7a7368', '#5c564d', '#3f3a34')]
HIERRO = [A.hex_rgb(c) for c in ('#e2e2e1', '#cbcbca', '#b2b2b2', '#878787', '#6b6c6c')]
TELA = [A.hex_rgb(c) for c in ('#e8dcc0', '#cfc0a0', '#ab9a7c', '#83745a', '#5c503b')]
LONA = [A.hex_rgb(c) for c in ('#c8a86a', '#a8874a', '#8a6c34', '#634c22', '#433315')]
CUERDA = [A.hex_rgb(c) for c in ('#d8c496', '#bca170', '#99845b', '#75643f', '#544628')]
FUEGO = [A.hex_rgb(c) for c in ('#fff6c0', '#ffd24a', '#f08a1c', '#c8420c', '#8a2408')]
BRASA = [A.hex_rgb(c) for c in ('#ff9a3a', '#e8621c', '#a83208', '#5f1c04', '#2b1008')]
CENIZA = [A.hex_rgb(c) for c in ('#9a9490', '#78726e', '#575250', '#3a3634', '#241f1e')]
AGUA = [A.hex_rgb(c) for c in ('#a8d8e8', '#6fb0cf', '#4a8fb2', '#2f6a88', '#1c4560')]
ROJO = [A.hex_rgb(c) for c in ('#e86a6c', '#c8352f', '#a02420', '#701815', '#450d0b')]


def _l():
    return Lienzo(W, H)


def _vol(li, m, cols, luz=(-1, -1)):
    caja = m.caja()
    if not caja:
        return
    x0, y0, x1, y1 = caja
    an, al = max(1, x1 - x0), max(1, y1 - y0)
    for x, y in m.puntos():
        f = ((x - x0) / float(an)) * 0.40 + ((y - y0) / float(al)) * 0.60
        i = 0 if f < 0.22 else (1 if f < 0.45 else (2 if f < 0.72 else 3))
        li.set(x, y, cols[i])
    for x, y in m.borde(True).puntos():
        li.set(x, y, cols[4] if len(cols) > 4 else A.contorno_de(cols[2]))


def _tronco(li, x0, y0, x1, y1, gr, cols=MAD):
    m = Mascara(W, H)
    pasos = max(2, int(math.hypot(x1 - x0, y1 - y0)))
    for i in range(pasos + 1):
        t = i / float(pasos)
        m.disco(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, gr / 2.0)
    _vol(li, m, cols)
    return m


def _llama(li, cx, base, alto, ancho, cols=FUEGO, forma=0):
    """Una llama. `forma` 0 = alta y estrecha, 1 = mas baja y ancha."""
    m = Mascara(W, H)
    for i in range(alto):
        t = i / float(alto - 1)
        if forma == 0:
            an = ancho * (1.0 - t) ** 0.75 * (1 + 0.25 * math.sin(t * 9))
        else:
            an = ancho * (1.15 - t) ** 0.95 * (1 + 0.35 * math.sin(t * 6 + 1.5))
        dx = math.sin(t * 3.2 + forma) * ancho * 0.30
        m.fila(base - i, cx + dx - an, cx + dx + an)
    caja = m.caja()
    for x, y in m.puntos():
        f = (y - caja[1]) / float(max(1, caja[3] - caja[1]))
        d = abs(x - cx) / float(max(1.0, ancho))
        i = 0 if (f > 0.55 and d < 0.45) else (1 if f > 0.30 else (2 if f > 0.12 else 3))
        li.set(x, y, cols[i])
    for x, y in m.borde_interno(False).puntos():
        c = li.get(x, y)
        if c[3]:
            li.set(x, y, cols[min(4, 3 + (1 if y < caja[1] + 3 else 0))])
    return m


def _cerco_piedras(li, cx, cy, rx=13, ry=6):
    for i in range(8):
        ang = i * math.pi / 4 + 0.2
        px = cx + math.cos(ang) * rx
        py = cy + math.sin(ang) * ry
        m = Mascara(W, H).elipse(px, py, 3.4, 2.6)
        _vol(li, m, PIEDRA)


# ===========================================================================
# LOS PROPS
# ===========================================================================

PROPS = {}


def prop(nombre, tam=None):
    def deco(fn):
        PROPS[nombre] = (fn, tam)
        return fn
    return deco


@prop('fogata_apagada')
def _fogata_apagada(li, p):
    _cerco_piedras(li, CX, SUELO - 6)
    for ang, lg in ((0.5, 9), (2.4, 9), (1.5, 7)):
        _tronco(li, CX - math.cos(ang) * lg, SUELO - 7 - math.sin(ang) * 2,
                CX + math.cos(ang) * lg, SUELO - 7 + math.sin(ang) * 2, 4, MAD_OSC)
    for i in range(10):
        x = CX - 7 + (i * 13) % 15
        y = SUELO - 9 + (i * 7) % 4
        li.encima(x, y, CENIZA[i % 3])


@prop('fogata_1')
def _fogata_1(li, p):
    _fogata_apagada(li, p)
    _llama(li, CX, SUELO - 9, 18, 5.0, FUEGO, 0)
    _llama(li, CX - 4, SUELO - 9, 9, 2.6, BRASA, 1)


@prop('fogata_2')
def _fogata_2(li, p):
    _fogata_apagada(li, p)
    _llama(li, CX + 1, SUELO - 9, 14, 6.2, FUEGO, 1)
    _llama(li, CX + 5, SUELO - 9, 8, 2.4, BRASA, 0)


@prop('hoguera_apagada')
def _hoguera_apagada(li, p):
    _cerco_piedras(li, CX, SUELO - 4, 17, 7)
    for i, ang in enumerate((0.3, 1.2, 2.0, 2.8)):
        _tronco(li, CX - math.cos(ang) * 12, SUELO - 6 - math.sin(ang) * 3,
                CX + math.cos(ang) * 12, SUELO - 6 + math.sin(ang) * 3, 5, MAD_OSC)
    for i in range(3):
        _tronco(li, CX - 6 + i * 6, SUELO - 8, CX - 2 + i * 5, SUELO - 22, 4, MAD)


@prop('hoguera_1')
def _hoguera_1(li, p):
    _hoguera_apagada(li, p)
    _llama(li, CX, SUELO - 12, 26, 7.0, FUEGO, 0)
    _llama(li, CX - 6, SUELO - 10, 13, 3.4, BRASA, 1)
    _llama(li, CX + 7, SUELO - 10, 11, 3.0, BRASA, 0)


@prop('hoguera_2')
def _hoguera_2(li, p):
    _hoguera_apagada(li, p)
    _llama(li, CX + 1, SUELO - 12, 22, 8.4, FUEGO, 1)
    _llama(li, CX - 7, SUELO - 10, 10, 3.0, BRASA, 0)
    _llama(li, CX + 8, SUELO - 10, 14, 3.4, BRASA, 1)


@prop('brasero_apagado')
def _brasero_apagado(li, p):
    m = Mascara(W, H)
    f = perfil([(0, 1.0), (.6, .82), (1, .30)])
    for i in range(10):
        an = f(i / 9.0) * 11
        m.fila(SUELO - 16 + i, CX - an, CX + an)
    for s in (-1, 1):
        m.linea(CX + s * 5, SUELO - 7, CX + s * 9, SUELO, 2)
    _vol(li, m, HIERRO)
    boca = Mascara(W, H).elipse(CX, SUELO - 16, 11, 3)
    for x, y in boca.puntos():
        li.set(x, y, CENIZA[3])
    for x, y in boca.borde_interno(False).puntos():
        li.set(x, y, HIERRO[1])
    for i in range(8):
        li.encima(CX - 8 + i * 2, SUELO - 16 + (i % 2), BRASA[2 + (i % 2)])


@prop('brasero_1')
def _brasero_1(li, p):
    _brasero_apagado(li, p)
    _llama(li, CX, SUELO - 17, 15, 4.6, FUEGO, 0)


@prop('brasero_2')
def _brasero_2(li, p):
    _brasero_apagado(li, p)
    _llama(li, CX + 1, SUELO - 17, 12, 5.6, FUEGO, 1)


@prop('caldero')
def _caldero(li, p):
    m = Mascara(W, H)
    f = perfil([(0, .86), (.35, 1.0), (1, .52)])
    for i in range(14):
        an = f(i / 13.0) * 12
        m.fila(SUELO - 17 + i, CX - an, CX + an)
    for s in (-1, 1):
        m.linea(CX + s * 8, SUELO - 4, CX + s * 11, SUELO, 3)
    _vol(li, m, [A.hex_rgb(c) for c in ('#6a6a6e', '#4e4e52', '#3a3a3e', '#26262a', '#141416')])
    asa = Mascara(W, H).elipse(CX, SUELO - 19, 12, 5).restar(
        Mascara(W, H).elipse(CX, SUELO - 19, 10, 3))
    for x, y in asa.puntos():
        if y < SUELO - 18:
            li.set(x, y, HIERRO[3])
    boca = Mascara(W, H).elipse(CX, SUELO - 17, 12, 3.4)
    for x, y in boca.puntos():
        li.set(x, y, A.hex_rgb('#26262a'))
    for x, y in boca.borde_interno(False).puntos():
        li.set(x, y, A.hex_rgb('#6a6a6e'))
    guiso = Mascara(W, H).elipse(CX, SUELO - 17, 9.4, 2.2)
    for x, y in guiso.puntos():
        li.set(x, y, A.hex_rgb('#a8712c') if (x + y) % 5 else A.hex_rgb('#c8903c'))


@prop('caldero_fuego_1')
def _caldero_fuego_1(li, p):
    # Las llamas tienen que SALIR por los lados del caldero. Centradas quedaban
    # enteras detras de el y los dos fotogramas salian identicos: el parpadeo no
    # se veia porque no habia nada que parpadeara.
    _fogata_apagada(li, p)
    _caldero(li, p)
    _llama(li, CX - 13, SUELO - 8, 13, 3.4, FUEGO, 0)
    _llama(li, CX + 13, SUELO - 8, 10, 2.8, FUEGO, 1)
    _llama(li, CX - 6, SUELO - 6, 6, 2.4, BRASA, 1)


@prop('caldero_fuego_2')
def _caldero_fuego_2(li, p):
    _fogata_apagada(li, p)
    _caldero(li, p)
    _llama(li, CX - 13, SUELO - 8, 9, 4.2, FUEGO, 1)
    _llama(li, CX + 13, SUELO - 8, 14, 3.6, FUEGO, 0)
    _llama(li, CX + 6, SUELO - 6, 7, 2.2, BRASA, 0)


@prop('parrilla')
def _parrilla(li, p):
    _cerco_piedras(li, CX, SUELO - 4, 14, 6)
    for i in range(6):
        li.encima(CX - 8 + i * 3, SUELO - 7, BRASA[1])
        li.encima(CX - 8 + i * 3, SUELO - 6, BRASA[2])
    for s in (-1, 1):
        _tronco(li, CX + s * 12, SUELO - 12, CX + s * 12, SUELO - 2, 2, HIERRO)
    m = Mascara(W, H).rect(CX - 13, SUELO - 14, CX + 13, SUELO - 12)
    _vol(li, m, HIERRO)
    for x in range(CX - 12, CX + 13, 3):
        li.set(x, SUELO - 15, HIERRO[1])
        li.set(x, SUELO - 13, HIERRO[3])
    pez = Mascara(W, H)
    fp = perfil([(0, .3), (.35, 1.0), (.75, .8), (1, .25)])
    for i in range(16):
        h = fp(i / 15.0) * 3.4
        pez.columna(CX - 8 + i, SUELO - 17 - h, SUELO - 17 + h)
    _vol(li, pez, [A.hex_rgb(c) for c in ('#d8c8a8', '#b8a078', '#8f7850', '#63512f',
                                          '#3f3320')])


@prop('secadero')
def _secadero(li, p):
    for s in (-1, 1):
        _tronco(li, CX + s * 18, SUELO, CX + s * 18, SUELO - 34, 4, MAD)
    m = Mascara(W, H).rect(CX - 18, SUELO - 36, CX + 18, SUELO - 34)
    _vol(li, m, MAD)
    for i, dx in enumerate((-12, -4, 4, 12)):
        for j in range(4):
            li.set(CX + dx, SUELO - 33 + j, CUERDA[1])
        pez = Mascara(W, H)
        fp = perfil([(0, .25), (.35, 1.0), (.8, .7), (1, .2)])
        for k in range(14):
            h = fp(k / 13.0) * 3.0
            pez.columna(CX + dx - 3 + (k % 2), SUELO - 28 - k * 0.0 - 0, 0)
        pez = Mascara(W, H)
        for k in range(13):
            t = k / 12.0
            an = fp(t) * 3.2
            pez.fila(SUELO - 29 + k, CX + dx - an, CX + dx + an)
        _vol(li, pez, [A.hex_rgb(c) for c in ('#d8c8a8', '#b8a078', '#8f7850',
                                              '#63512f', '#3f3320')])


@prop('tienda')
def _tienda(li, p):
    m = Mascara(W, H)
    m.poligono([(CX - 20, SUELO), (CX, SUELO - 30), (CX + 20, SUELO)])
    _vol(li, m, LONA)
    puerta = Mascara(W, H)
    puerta.poligono([(CX - 7, SUELO), (CX, SUELO - 17), (CX + 7, SUELO)])
    for x, y in puerta.puntos():
        li.set(x, y, LONA[4])
    for x, y in puerta.borde_interno(False).puntos():
        li.set(x, y, LONA[1])
    for i in range(4):
        li.set(CX - 3 - i, SUELO - 14 + i * 3, LONA[0])
        li.set(CX + 3 + i, SUELO - 14 + i * 3, LONA[0])
    for j in range(6):
        li.set(CX, SUELO - 31 - j, MAD[2])
    for s in (-1, 1):
        li.set(CX + s * 22, SUELO - 1, CUERDA[2])
        li.set(CX + s * 21, SUELO - 4, CUERDA[1])
        li.set(CX + s * 20, SUELO - 7, CUERDA[1])


@prop('saco_dormir')
def _saco(li, p):
    m = Mascara(W, H)
    f = perfil([(0, .62), (.25, 1.0), (.85, .95), (1, .55)])
    for i in range(30):
        t = i / 29.0
        an = f(t) * 7
        m.fila(SUELO - 9 + int(t * 8), CX - 15 + i, CX - 15 + i)
    m = Mascara(W, H).elipse(CX, SUELO - 5, 16, 5.4)
    _vol(li, m, [A.hex_rgb(c) for c in ('#7a9ac8', '#5f7fa8', '#4a6486', '#354a64',
                                        '#22303f')])
    alm = Mascara(W, H).elipse(CX - 11, SUELO - 7, 5, 3.4)
    _vol(li, alm, TELA)
    for i in range(6):
        li.encima(CX - 4 + i * 4, SUELO - 5, A.hex_rgb('#354a64'))


@prop('banco')
def _banco(li, p):
    m = Mascara(W, H).rect(CX - 17, SUELO - 14, CX + 17, SUELO - 10)
    for s in (-1, 1):
        m.rect(CX + s * 14 - 2, SUELO - 10, CX + s * 14 + 2, SUELO)
    _vol(li, m, MAD)
    for x in range(CX - 16, CX + 17, 6):
        li.encima(x, SUELO - 12, MAD[3])


@prop('mesa')
def _mesa(li, p):
    m = Mascara(W, H).rect(CX - 19, SUELO - 20, CX + 19, SUELO - 15)
    for s in (-1, 1):
        m.rect(CX + s * 15 - 2, SUELO - 15, CX + s * 15 + 2, SUELO)
    _vol(li, m, MAD)
    for x in range(CX - 18, CX + 19, 7):
        li.encima(x, SUELO - 18, MAD[3])


@prop('taburete')
def _taburete(li, p):
    m = Mascara(W, H).elipse(CX, SUELO - 14, 9, 3.4)
    for s in (-1, 1):
        m.rect(CX + s * 6 - 1, SUELO - 13, CX + s * 6 + 1, SUELO)
    _vol(li, m, MAD)


@prop('silla_pescador')
def _silla(li, p):
    m = Mascara(W, H)
    m.poligono([(CX - 12, SUELO), (CX - 9, SUELO - 14), (CX + 9, SUELO - 14),
                (CX + 12, SUELO)])
    m.rect(CX - 10, SUELO - 26, CX - 7, SUELO - 13)
    m.rect(CX - 10, SUELO - 27, CX + 8, SUELO - 24)
    _vol(li, m, LONA)
    for s in (-1, 1):
        _tronco(li, CX + s * 11, SUELO, CX + s * 8, SUELO - 15, 2, HIERRO)


@prop('barril')
def _barril(li, p):
    m = Mascara(W, H)
    f = perfil([(0, .86), (.5, 1.0), (1, .86)])
    for i in range(26):
        an = f(i / 25.0) * 12
        m.fila(SUELO - 25 + i, CX - an, CX + an)
    _vol(li, m, MAD)
    for y in (SUELO - 21, SUELO - 12, SUELO - 3):
        for x in range(CX - 13, CX + 14):
            li.encima(x, y, HIERRO[3])
            li.encima(x, y + 1, HIERRO[2])
    tapa = Mascara(W, H).elipse(CX, SUELO - 25, 10.4, 3)
    _vol(li, tapa, MAD)


@prop('barril_abierto')
def _barril_abierto(li, p):
    _barril(li, p)
    boca = Mascara(W, H).elipse(CX, SUELO - 25, 10.4, 3)
    for x, y in boca.puntos():
        li.set(x, y, AGUA[2] if (x + y) % 4 else AGUA[1])
    for x, y in boca.borde_interno(False).puntos():
        li.set(x, y, MAD[3])
    pez = Mascara(W, H).elipse(CX + 2, SUELO - 26, 4, 1.8)
    _vol(li, pez, [A.hex_rgb(c) for c in ('#c8d8e0', '#9ab0c0', '#6f8898', '#4a5f6e',
                                          '#2f3f4a')])


@prop('cajon')
def _cajon(li, p):
    m = Mascara(W, H).rect(CX - 13, SUELO - 22, CX + 13, SUELO)
    _vol(li, m, MAD)
    for x in (CX - 13, CX, CX + 13):
        for y in range(SUELO - 22, SUELO + 1):
            li.encima(x, y, MAD[3])
    for y in (SUELO - 22, SUELO - 11, SUELO):
        for x in range(CX - 13, CX + 14):
            li.encima(x, y, MAD[3])
    li.encima(CX - 6, SUELO - 17, MAD[0])


@prop('pila_lena')
def _pila(li, p):
    for fila in range(3):
        n = 4 - fila
        for i in range(n):
            cx = CX - (n - 1) * 5 + i * 10
            cy = SUELO - 4 - fila * 8
            m = Mascara(W, H).elipse(cx, cy, 5, 4)
            _vol(li, m, MAD)
            anillo = Mascara(W, H).elipse(cx, cy, 3, 2.4)
            for x, y in anillo.borde(False).puntos():
                li.encima(x, y, MAD[3])
            li.encima(cx, cy, MAD[0])


@prop('farol_apagado')
def _farol_apagado(li, p):
    _tronco(li, CX, SUELO, CX, SUELO - 30, 4, MAD)
    m = Mascara(W, H).rect(CX - 7, SUELO - 44, CX + 7, SUELO - 31)
    m.poligono([(CX - 8, SUELO - 44), (CX, SUELO - 50), (CX + 8, SUELO - 44)])
    _vol(li, m, HIERRO)
    cristal = Mascara(W, H).rect(CX - 5, SUELO - 42, CX + 5, SUELO - 33)
    for x, y in cristal.puntos():
        li.set(x, y, A.hex_rgb('#3a4450'))
    for x, y in cristal.borde_interno(False).puntos():
        li.set(x, y, HIERRO[4])


@prop('farol_1')
def _farol_1(li, p):
    _farol_apagado(li, p)
    _llama(li, CX, SUELO - 34, 7, 2.4, FUEGO, 0)


@prop('farol_2')
def _farol_2(li, p):
    _farol_apagado(li, p)
    _llama(li, CX, SUELO - 34, 6, 2.8, FUEGO, 1)


@prop('tendedero_red')
def _tendedero(li, p):
    for s in (-1, 1):
        _tronco(li, CX + s * 19, SUELO, CX + s * 19, SUELO - 32, 4, MAD)
    for x in range(CX - 19, CX + 20):
        li.set(x, SUELO - 33, CUERDA[1])
    for x in range(CX - 17, CX + 18):
        for y in range(SUELO - 32, SUELO - 8):
            u = (x - CX + 17) + (y - SUELO + 32)
            if u % 4 == 0:
                li.set(x, y, CUERDA[2])
            elif (x - y) % 4 == 0:
                li.set(x, y, CUERDA[3])
    for x in range(CX - 17, CX + 18):
        yy = SUELO - 8 + int(math.sin((x - CX) * 0.25) * 2)
        li.set(x, yy, CUERDA[3])


@prop('poste_cartel')
def _poste(li, p):
    _tronco(li, CX, SUELO, CX, SUELO - 30, 5, MAD)
    m = Mascara(W, H).rect(CX - 15, SUELO - 44, CX + 15, SUELO - 30)
    _vol(li, m, MAD)
    for y in range(SUELO - 42, SUELO - 32, 3):
        for x in range(CX - 11, CX + 12):
            li.encima(x, y, MAD[3])
    li.encima(CX - 13, SUELO - 42, MAD[0])


@prop('cubo')
def _cubo(li, p):
    m = Mascara(W, H)
    f = perfil([(0, 1.0), (1, .74)])
    for i in range(15):
        an = f(i / 14.0) * 9
        m.fila(SUELO - 14 + i, CX - an, CX + an)
    _vol(li, m, HIERRO)
    asa = Mascara(W, H).elipse(CX, SUELO - 15, 9, 7).restar(
        Mascara(W, H).elipse(CX, SUELO - 15, 7.4, 5.4))
    for x, y in asa.puntos():
        if y < SUELO - 15:
            li.set(x, y, HIERRO[3])
    boca = Mascara(W, H).elipse(CX, SUELO - 14, 9, 2.6)
    for x, y in boca.puntos():
        li.set(x, y, AGUA[2] if (x + y) % 5 else AGUA[1])
    for x, y in boca.borde_interno(False).puntos():
        li.set(x, y, HIERRO[4])


@prop('sombrilla')
def _sombrilla(li, p):
    _tronco(li, CX, SUELO, CX, SUELO - 36, 3, MAD)
    m = Mascara(W, H)
    for i in range(12):
        t = i / 11.0
        an = 22 * math.sqrt(max(0.0, 1 - t * t))
        m.fila(SUELO - 48 + i, CX - an, CX + an)
    caja = m.caja()
    for x, y in m.puntos():
        gajo = int((x - CX + 22) / 7.4)
        cols = ROJO if gajo % 2 == 0 else TELA
        f = (y - caja[1]) / float(max(1, caja[3] - caja[1]))
        li.set(x, y, cols[1] if f < 0.5 else cols[2])
    for x, y in m.borde(True).puntos():
        li.set(x, y, ROJO[4])
    for i in range(1, 6):
        for y in range(SUELO - 48, SUELO - 36):
            li.encima(CX - 22 + i * 7.4, y, ROJO[3])


@prop('ancla')
def _ancla(li, p):
    m = Mascara(W, H)
    m.rect(CX - 2, SUELO - 34, CX + 1, SUELO - 6)
    m.rect(CX - 9, SUELO - 28, CX + 8, SUELO - 25)
    aro = Mascara(W, H).elipse(CX, SUELO - 37, 5, 4).restar(
        Mascara(W, H).elipse(CX, SUELO - 37, 3, 2.4))
    m.unir(aro)
    for s in (-1, 1):
        for i in range(12):
            t = i / 11.0
            ang = math.pi * (0.5 + s * 0.5 * t)
            m.disco(CX + s * 13 * math.sin(t * 1.6), SUELO - 6 - 8 * (1 - math.cos(t * 1.6)),
                    2.0)
        m.poligono([(CX + s * 13, SUELO - 10), (CX + s * 18, SUELO - 14),
                    (CX + s * 15, SUELO - 6)])
    _vol(li, m, HIERRO)


@prop('boya_grande')
def _boya(li, p):
    m = Mascara(W, H).elipse(CX, SUELO - 14, 12, 13)
    _vol(li, m, ROJO)
    for x, y in m.puntos():
        if y > SUELO - 12:
            li.set(x, y, TELA[1] if (x + y) % 7 else TELA[2])
    for x, y in m.borde(True).puntos():
        li.set(x, y, ROJO[4])
    for j in range(7):
        li.set(CX, SUELO - 28 - j, HIERRO[3])
    aro = Mascara(W, H).elipse(CX, SUELO - 37, 4, 3.4).restar(
        Mascara(W, H).elipse(CX, SUELO - 37, 2.4, 2))
    _vol(li, aro, HIERRO)


@prop('nasas_apiladas')
def _nasas(li, p):
    for fila in range(2):
        for i in range(2 - fila):
            cx = CX - (1 - fila) * 11 + i * 22
            cy = SUELO - 8 - fila * 15
            m = Mascara(W, H)
            fp = perfil([(0, .78), (.5, 1.0), (1, .78)])
            for j in range(15):
                an = fp(j / 14.0) * 10
                m.fila(cy - 7 + j, cx - an, cx + an)
            _vol(li, m, CUERDA)
            for x, y in m.puntos():
                if (x + y * 2) % 5 == 0:
                    li.set(x, y, CUERDA[3])
            boca = Mascara(W, H).elipse(cx, cy, 3.4, 2.6)
            for x, y in boca.puntos():
                li.set(x, y, CUERDA[4])


@prop('hielera')
def _hielera(li, p):
    m = Mascara(W, H).rect(CX - 15, SUELO - 20, CX + 15, SUELO)
    _vol(li, m, [A.hex_rgb(c) for c in ('#dfe9ee', '#c8d1d6', '#a8b2b8', '#7f8a90',
                                        '#4f585e')])
    tapa = Mascara(W, H).rect(CX - 16, SUELO - 24, CX + 16, SUELO - 20)
    _vol(li, tapa, HIERRO)
    for i in range(5):
        li.encima(CX - 10 + i * 5, SUELO - 22, A.hex_rgb('#a8d8ea'))
    li.encima(CX + 10, SUELO - 12, A.hex_rgb('#7f8a90'))


@prop('caja_pescado')
def _caja_pescado(li, p):
    m = Mascara(W, H).rect(CX - 16, SUELO - 14, CX + 16, SUELO)
    _vol(li, m, MAD)
    for x in range(CX - 16, CX + 17, 8):
        for y in range(SUELO - 14, SUELO + 1):
            li.encima(x, y, MAD[3])
    cols = [A.hex_rgb(c) for c in ('#c8d8e0', '#9ab0c0', '#6f8898', '#4a5f6e', '#2f3f4a')]
    for i, dx in enumerate((-9, 0, 9)):
        pez = Mascara(W, H)
        fp = perfil([(0, .25), (.35, 1.0), (.8, .7), (1, .2)])
        for k in range(13):
            an = fp(k / 12.0) * 3.6
            pez.fila(SUELO - 20 + k, CX + dx - an, CX + dx + an)
        _vol(li, pez, cols)
        li.set(CX + dx - 1, SUELO - 18, (24, 22, 26))


PROPS_ORDEN = ['fogata_apagada', 'fogata_1', 'fogata_2', 'hoguera_apagada',
               'hoguera_1', 'hoguera_2', 'brasero_apagado', 'brasero_1',
               'brasero_2', 'caldero', 'caldero_fuego_1', 'caldero_fuego_2',
               'parrilla', 'secadero', 'tienda', 'saco_dormir', 'banco', 'mesa',
               'taburete', 'silla_pescador', 'barril', 'barril_abierto', 'cajon',
               'pila_lena', 'farol_apagado', 'farol_1', 'farol_2',
               'tendedero_red', 'poste_cartel', 'cubo', 'sombrilla', 'ancla',
               'boya_grande', 'nasas_apiladas', 'hielera', 'caja_pescado']

NOMBRES = {
    'fogata_apagada': 'Fogata apagada', 'fogata_1': 'Fogata', 'fogata_2': 'Fogata',
    'hoguera_apagada': 'Hoguera apagada', 'hoguera_1': 'Hoguera', 'hoguera_2': 'Hoguera',
    'brasero_apagado': 'Brasero apagado', 'brasero_1': 'Brasero', 'brasero_2': 'Brasero',
    'caldero': 'Caldero', 'caldero_fuego_1': 'Caldero al fuego',
    'caldero_fuego_2': 'Caldero al fuego', 'parrilla': 'Parrilla',
    'secadero': 'Secadero de pescado', 'tienda': 'Tienda de campana',
    'saco_dormir': 'Saco de dormir', 'banco': 'Banco', 'mesa': 'Mesa',
    'taburete': 'Taburete', 'silla_pescador': 'Silla de pescador',
    'barril': 'Barril', 'barril_abierto': 'Barril abierto', 'cajon': 'Cajon',
    'pila_lena': 'Pila de lena', 'farol_apagado': 'Farol apagado',
    'farol_1': 'Farol', 'farol_2': 'Farol', 'tendedero_red': 'Tendedero de red',
    'poste_cartel': 'Poste con cartel', 'cubo': 'Cubo', 'sombrilla': 'Sombrilla',
    'ancla': 'Ancla', 'boya_grande': 'Boya grande', 'nasas_apiladas': 'Nasas apiladas',
    'hielera': 'Hielera', 'caja_pescado': 'Caja de pescado',
}

ANIMADOS = {'fogata': ['fogata_1', 'fogata_2'], 'hoguera': ['hoguera_1', 'hoguera_2'],
            'brasero': ['brasero_1', 'brasero_2'],
            'caldero_fuego': ['caldero_fuego_1', 'caldero_fuego_2'],
            'farol': ['farol_1', 'farol_2']}


def main():
    hoja = '--hoja' in sys.argv
    cat = []
    rutas = []
    for nombre in PROPS_ORDEN:
        fn, _ = PROPS[nombre]
        li = Lienzo(W, H)
        fn(li, {})
        rec = li.recortado()
        ruta = os.path.join(DESTINO, '%s.png' % nombre)
        rec.guardar(ruta)
        rutas.append(ruta)
        cat.append({'id': nombre, 'nombre': NOMBRES[nombre],
                    'ancho': rec.w, 'alto': rec.h,
                    'origen': [0.5, 1.0],
                    'ruta': '%s/%s.png' % (WEB, nombre),
                    'clave_phaser': nombre})
    with io.open(os.path.join(DESTINO, 'objetos.json'), 'w', encoding='utf-8') as fh:
        fh.write(json.dumps({'pack': 'newpro/objetos', 'version': 1, 'base_web': WEB,
                             'total': len(cat),
                             'origen': 'todos apoyados abajo: setOrigin(0.5, 1)',
                             'animaciones': ANIMADOS, 'objetos': cat},
                            ensure_ascii=False, indent=1))
    print('%d objetos escritos en %s' % (len(cat), DESTINO))
    if hoja:
        d = os.path.join(os.environ.get('TEMP', '.'), 'gf_hojas')
        if not os.path.isdir(d):
            os.makedirs(d)
        A.hoja_contacto(rutas, columnas=9, escala=4).save(os.path.join(d, 'objetos.png'))
        print('hoja en', d)


if __name__ == '__main__':
    main()
