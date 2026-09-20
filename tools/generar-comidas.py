#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
COMIDAS — 40 platos nuevos para `Game/newpro/comidas/`
=============================================================================

Siguen el tamano y el estilo de los que el pack ya tenia en `cocina/`
(pan 20x11, sopa 19x11, pastel 16x13, brocheta 22x11): iconos de inventario de
entre 12 y 22 px, con contorno teñido y la luz arriba a la izquierda.

COMO ESTAN HECHOS
---------------------------------------------------------------------------
Un plato no es una mancha de color con nombre: es un RECIPIENTE con algo
dentro. Aqui hay nueve recipientes —plato, cuenco, tabla, sarten, taza, vaso,
hoja, cesta y "sin recipiente"— y sobre cada uno se sirven los ingredientes.

Eso es lo que hace que cuarenta comidas se distingan entre si a 20 px: la
sopa de pescado y el caldo de marisco comparten cuenco y se diferencian en lo
que asoma dentro, pero la sopa y el sushi no se parecen en nada porque ni
siquiera comparten silueta.

El vapor de los platos calientes tampoco es adorno: es lo unico que separa de
un vistazo un guiso caliente de una ensalada fria.

USO
---------------------------------------------------------------------------
    python tools/generar-comidas.py
    python tools/generar-comidas.py --hoja
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
DESTINO = os.path.join(RAIZ, 'Game', 'newpro', 'comidas')
WEB = '/Game/newpro/comidas'

W = H = 30
CX, CY = W // 2, H // 2

# los materiales del pack
LOZA = [A.hex_rgb(c) for c in ('#f2f4f6', '#dfe4e8', '#bcc4cc', '#8f979f')]
MADERA = [A.hex_rgb(c) for c in ('#c08f52', '#a3763f', '#8a5f30', '#6b4724')]
HIERRO = [A.hex_rgb(c) for c in ('#cbcbca', '#b2b2b2', '#878787', '#6b6c6c')]
CESTA = [A.hex_rgb(c) for c in ('#d8c496', '#bca170', '#99845b', '#75643f')]
HOJA = [A.hex_rgb(c) for c in ('#7ec46a', '#4f9a4a', '#356c36', '#254e28')]
VAPOR = A.hex_rgb('#eef4f8')

ING = {
    'pescado':   ('#b6c2cc', '#8d9aa6', '#5f6b76'),
    'salmon':    ('#f0a888', '#d8785a', '#a04a34'),
    'blanco':    ('#f4ecdc', '#ded4c0', '#b0a690'),
    'gamba':     ('#f2b09a', '#e08a72', '#a8543c'),
    'cangrejo':  ('#e07a5a', '#c2543a', '#8a2f1c'),
    'arroz':     ('#fbf7ee', '#e8e2d2', '#c0b8a4'),
    'alga':      ('#3f6b46', '#2c4d32', '#1c3320'),
    'caldo':     ('#e8b45a', '#d8963a', '#a86a20'),
    'caldo_rojo': ('#e07a4a', '#c25630', '#8a3418'),
    'caldo_verde': ('#a8c05a', '#87a03a', '#5f7220'),
    'verdura':   ('#8ac05a', '#5f9a3a', '#3d6b22'),
    'tomate':    ('#e0503a', '#b8341f', '#7a1f10'),
    'limon':     ('#f2e07a', '#e0c84a', '#a89a2a'),
    'queso':     ('#f0d068', '#dcb03a', '#a8801c'),
    'pan':       ('#e0b878', '#c29452', '#8a6432'),
    'carne':     ('#d88a6a', '#b8603f', '#7f3a22'),
    'setas':     ('#c8a888', '#a08258', '#6f5636'),
    'baya':      ('#c84a6a', '#a02f4a', '#6b1c30'),
    'chocolate': ('#8a5a34', '#63401f', '#3d2712'),
    'huevo':     ('#fbf6e8', '#e8dcc0', '#b8a880'),
    'te':        ('#c8a04a', '#a87a2a', '#755218'),
    'agua':      ('#a8d8e8', '#6fb0cf', '#3f7f9a'),
    'miel':      ('#f0c04a', '#d89a2a', '#a06a18'),
    'hielo':     ('#d8f0fa', '#a8d8ea', '#75a8c0'),
}


def r3(clave):
    return [A.hex_rgb(c) for c in ING[clave]]


# ===========================================================================
# RECIPIENTES
# ===========================================================================

def plato(li):
    """Plato hondo visto en escorzo. Devuelve la zona util para la comida."""
    m = Mascara(W, H).elipse(CX, CY + 4, 11, 4.4)
    for x, y in m.puntos():
        f = (y - (CY - 0.4)) / 9.0
        li.set(x, y, LOZA[1] if f < 0.55 else LOZA[2])
    for x, y in m.borde_interno(False).puntos():
        li.set(x, y, LOZA[3] if y > CY + 4 else LOZA[0])
    dentro = Mascara(W, H).elipse(CX, CY + 3, 8, 3.0)
    for x, y in dentro.puntos():
        li.set(x, y, LOZA[2])
    return dentro


def cuenco(li, color_borde=None):
    m = Mascara(W, H)
    f = perfil([(0, 1.0), (.45, .92), (1, .42)])
    for i in range(9):
        t = i / 8.0
        an = f(t) * 9.0
        m.fila(CY + i, CX - an, CX + an)
    for x, y in m.puntos():
        fx = (x - (CX - 9)) / 18.0
        li.set(x, y, LOZA[1] if fx < 0.42 else LOZA[2])
    for x, y in m.borde_interno(False).puntos():
        li.set(x, y, LOZA[3])
    boca = Mascara(W, H).elipse(CX, CY, 9, 2.4)
    for x, y in boca.puntos():
        li.set(x, y, LOZA[0])
    dentro = Mascara(W, H).elipse(CX, CY, 7.4, 1.8)
    return dentro


def tabla(li):
    m = Mascara(W, H).rect(CX - 11, CY + 2, CX + 11, CY + 6)
    m.elipse(CX + 11, CY + 4, 2.4, 2.4)
    for x, y in m.puntos():
        f = (y - (CY + 2)) / 5.0
        li.set(x, y, MADERA[0] if f < 0.35 else (MADERA[1] if f < 0.75 else MADERA[2]))
    for x, y in m.borde_interno(False).puntos():
        li.set(x, y, MADERA[3])
    for x in range(CX - 9, CX + 10, 5):
        li.encima(x, CY + 3, MADERA[2])
    return Mascara(W, H).rect(CX - 9, CY - 4, CX + 8, CY + 2)


def sarten(li):
    m = Mascara(W, H).elipse(CX - 2, CY + 2, 9, 4.6)
    mango = Mascara(W, H).rect(CX + 6, CY + 1, CX + 13, CY + 3)
    for x, y in mango.puntos():
        li.set(x, y, HIERRO[1] if y == CY + 1 else HIERRO[2])
    for x, y in m.puntos():
        f = (y - (CY - 2.6)) / 9.0
        li.set(x, y, HIERRO[1] if f < 0.5 else HIERRO[2])
    for x, y in m.borde_interno(False).puntos():
        li.set(x, y, HIERRO[3])
    return Mascara(W, H).elipse(CX - 2, CY + 1, 7, 3.2)


def taza(li, color=None):
    m = Mascara(W, H)
    f = perfil([(0, 1.0), (.5, .95), (1, .72)])
    for i in range(11):
        t = i / 10.0
        an = f(t) * 6.0
        m.fila(CY - 3 + i, CX - an - 1, CX + an - 1)
    asa = Mascara(W, H).elipse(CX + 7, CY + 2, 3, 3).restar(
        Mascara(W, H).elipse(CX + 7, CY + 2, 1.6, 1.6))
    for x, y in asa.puntos():
        if x > CX + 5:
            li.set(x, y, LOZA[2])
    for x, y in m.puntos():
        fx = (x - (CX - 7)) / 13.0
        li.set(x, y, LOZA[1] if fx < 0.42 else LOZA[2])
    for x, y in m.borde_interno(False).puntos():
        li.set(x, y, LOZA[3])
    boca = Mascara(W, H).elipse(CX - 1, CY - 3, 6, 1.8)
    for x, y in boca.puntos():
        li.set(x, y, LOZA[0])
    return Mascara(W, H).elipse(CX - 1, CY - 3, 4.6, 1.3)


def vaso(li):
    m = Mascara(W, H)
    for i in range(15):
        an = 5.4 - i * 0.10
        m.fila(CY - 7 + i, CX - an, CX + an)
    for x, y in m.puntos():
        fx = (x - (CX - 6)) / 12.0
        li.set(x, y, LOZA[0] if fx < 0.30 else LOZA[1])
    for x, y in m.borde_interno(False).puntos():
        li.set(x, y, LOZA[2])
    return Mascara(W, H).rect(CX - 4, CY - 3, CX + 3, CY + 6)


def hoja_servir(li):
    m = Mascara(W, H).elipse(CX, CY + 3, 11, 5)
    for x, y in m.puntos():
        f = (y - (CY - 2)) / 10.0
        li.set(x, y, HOJA[0] if f < 0.35 else (HOJA[1] if f < 0.75 else HOJA[2]))
    for x, y in m.borde_interno(False).puntos():
        li.set(x, y, HOJA[3])
    for x in range(CX - 9, CX + 10):
        li.encima(x, CY + 3, HOJA[2])
    return Mascara(W, H).elipse(CX, CY + 2, 8, 3.2)


def cesta(li):
    m = Mascara(W, H)
    f = perfil([(0, 1.0), (1, .70)])
    for i in range(9):
        an = f(i / 8.0) * 9.0
        m.fila(CY + i, CX - an, CX + an)
    for x, y in m.puntos():
        li.set(x, y, CESTA[1] if (x + y) % 3 else CESTA[2])
    for x, y in m.borde_interno(False).puntos():
        li.set(x, y, CESTA[3])
    return Mascara(W, H).elipse(CX, CY, 8, 2.2)


def suelto(li):
    return Mascara(W, H).elipse(CX, CY + 2, 10, 6)


RECIPIENTES = {'plato': plato, 'cuenco': cuenco, 'tabla': tabla, 'sarten': sarten,
               'taza': taza, 'vaso': vaso, 'hoja': hoja_servir, 'cesta': cesta,
               'suelto': suelto}


# ===========================================================================
# CONTENIDOS
# ===========================================================================

def _monton(li, zona, cols, rnd, n=26, alto=4):
    caja = zona.caja()
    x0, y0, x1, y1 = caja
    for i in range(n):
        x = int(rnd.uniform(x0, x1))
        y = int(rnd.uniform(y0 - alto, y1))
        if not zona.get(x, min(y1, max(y0, y))):
            continue
        li.set(x, y, cols[0] if i % 4 == 0 else (cols[1] if i % 4 != 3 else cols[2]))
        li.set(x + 1, y, cols[1])
    return li


def _liquido(li, zona, cols):
    for x, y in zona.puntos():
        li.set(x, y, cols[1])
    for x, y in zona.borde_interno(False).puntos():
        li.set(x, y, cols[2])
    caja = zona.caja()
    li.set(caja[0] + 2, caja[1] + 1, cols[0])
    li.set(caja[0] + 3, caja[1] + 1, cols[0])
    return li


def _pieza_pez(li, cx, cy, cols, largo=11, alto=4):
    m = Mascara(W, H)
    f = perfil([(0, .30), (.35, 1.0), (.75, .85), (1, .25)])
    for i in range(largo):
        t = i / float(largo - 1)
        h = f(t) * alto
        m.columna(cx - largo // 2 + i, cy - h, cy + h * .8)
    for x, y in m.puntos():
        fy = (y - (cy - alto)) / float(alto * 2)
        li.set(x, y, cols[0] if fy < 0.4 else (cols[1] if fy < 0.8 else cols[2]))
    for x, y in m.borde_interno(False).puntos():
        li.set(x, y, cols[2])
    return m


def _rodaja(li, cx, cy, r, cols, borde=None):
    m = Mascara(W, H).elipse(cx, cy, r, r * 0.62)
    for x, y in m.puntos():
        li.set(x, y, cols[1])
    for x, y in m.borde_interno(False).puntos():
        li.set(x, y, (borde or cols)[2])
    li.set(cx - 1, cy - 1, cols[0])
    return m


def _vapor(li, cx, cy):
    """
    Una voluta PEGADA al plato, no una nube de puntos a nueve pixeles. Sale del
    borde de la comida, se enrosca y se apaga: cinco pixeles seguidos se leen
    como vapor, cinco puntos sueltos se leen como suciedad en la imagen.
    """
    curva = ((0, -1), (1, -2), (1, -3), (0, -4), (-1, -5), (-1, -6), (0, -7))
    for i, (dx, dy) in enumerate(curva):
        f = 1.0 - i / float(len(curva))
        li.set(cx + dx, cy + dy, mezcla(A.hex_rgb('#b8c8d4'), VAPOR, f))


CONTENIDOS = {}


def contenido(nombre):
    def deco(fn):
        CONTENIDOS[nombre] = fn
        return fn
    return deco


@contenido('sopa')
def _c_sopa(li, zona, p, rnd):
    _liquido(li, zona, r3(p.get('caldo', 'caldo')))
    caja = zona.caja()
    for k, clave in enumerate(p.get('tropiezos', ['pescado'])):
        c = r3(clave)
        for i in range(3):
            x = caja[0] + 2 + (k * 5 + i * 3) % max(2, (caja[2] - caja[0] - 2))
            y = caja[1] + 1 + (i % 2)
            li.encima(x, y, c[1])
            li.encima(x + 1, y, c[2])


@contenido('pez_entero')
def _c_pez(li, zona, p, rnd):
    caja = zona.caja()
    cy = (caja[1] + caja[3]) // 2
    _pieza_pez(li, CX, cy, r3(p.get('ing', 'pescado')), largo=p.get('largo', 15),
               alto=p.get('alto', 4))
    li.set(CX - p.get('largo', 15) // 2 + 2, cy - 1, (24, 22, 26))
    if p.get('rodajas'):
        _rodaja(li, CX + 6, cy + 3, 2.2, r3(p['rodajas']))


@contenido('filetes')
def _c_filetes(li, zona, p, rnd):
    caja = zona.caja()
    cy = (caja[1] + caja[3]) // 2
    c = r3(p.get('ing', 'salmon'))
    for i, dx in enumerate((-5, 1)):
        m = Mascara(W, H).elipse(CX + dx, cy + i, 4.4, 2.6)
        for x, y in m.puntos():
            li.set(x, y, c[0] if y < cy + i else c[1])
        for x, y in m.borde_interno(False).puntos():
            li.set(x, y, c[2])
        for k in range(-2, 3):
            li.encima(CX + dx + k, cy + i - 1, c[2])


@contenido('monton')
def _c_monton(li, zona, p, rnd):
    _monton(li, zona, r3(p.get('ing', 'arroz')), rnd, n=p.get('n', 30),
            alto=p.get('alto', 4))
    for clave in p.get('encima', []):
        c = r3(clave)
        caja = zona.caja()
        for i in range(3):
            x = caja[0] + 3 + i * 4
            y = caja[1] - 1 + (i % 2)
            li.encima(x, y, c[1])
            li.encima(x, y - 1, c[0])


@contenido('sushi')
def _c_sushi(li, zona, p, rnd):
    caja = zona.caja()
    cy = (caja[1] + caja[3]) // 2
    for i, dx in enumerate((-7, -1, 5)):
        m = Mascara(W, H).rect(CX + dx, cy - 4, CX + dx + 4, cy + 2)
        alga = r3('alga')
        for x, y in m.puntos():
            li.set(x, y, alga[0] if x == CX + dx else alga[1])
        arroz = r3('arroz')
        for x, y in Mascara(W, H).rect(CX + dx + 1, cy - 3, CX + dx + 3, cy + 1).puntos():
            li.set(x, y, arroz[0] if y < cy else arroz[1])
        for x, y in m.borde_interno(False).puntos():
            li.set(x, y, alga[2])
        # El ingrediente va AL FINAL y por encima del rollo, no dentro. Antes se
        # pintaba antes que el contorno del alga y el contorno se lo comia: el
        # nigiri y el sushi salian identicos byte a byte pese a llevar pescados
        # distintos.
        c = r3(p.get('ing', 'salmon'))
        for k, col in ((0, c[0]), (1, c[1]), (2, c[1]), (3, c[2])):
            li.set(CX + dx + k + 1, cy - 5, col)
        li.set(CX + dx + 1, cy - 6, c[0])
        li.set(CX + dx + 3, cy - 6, c[1])


@contenido('brocheta')
def _c_brocheta(li, zona, p, rnd):
    cy = CY + 1
    for x in range(CX - 12, CX + 13):
        li.set(x, cy, MADERA[1])
        li.set(x, cy + 1, MADERA[3])
    for i, clave in enumerate(p.get('ing', ['pescado', 'verdura', 'pescado', 'tomate'])):
        c = r3(clave)
        cx = CX - 9 + i * 6
        m = Mascara(W, H).elipse(cx, cy, 2.8, 3.2)
        for x, y in m.puntos():
            li.set(x, y, c[0] if (x - cx) + (y - cy) < -1 else c[1])
        for x, y in m.borde_interno(False).puntos():
            li.set(x, y, c[2])


@contenido('masa')
def _c_masa(li, zona, p, rnd):
    """Empanadas, croquetas, buñuelos: bultos dorados."""
    c = r3(p.get('ing', 'pan'))
    caja = zona.caja()
    cy = (caja[1] + caja[3]) // 2
    for cx, r in p.get('bultos', [(-5, 4.0), (2, 4.4), (8, 3.4)]):
        m = Mascara(W, H).elipse(CX + cx, cy, r, r * 0.78)
        for x, y in m.puntos():
            d = math.hypot((x - CX - cx + r * .3) / r, (y - cy + r * .3) / r)
            li.set(x, y, c[0] if d < 0.5 else (c[1] if d < 0.9 else c[2]))
        for x, y in m.borde_interno(False).puntos():
            li.set(x, y, c[2])


@contenido('bebida')
def _c_bebida(li, zona, p, rnd):
    c = r3(p.get('ing', 'te'))
    caja = zona.caja()
    m = Mascara(W, H)
    for y in range(caja[1] + 1, caja[3]):
        m.fila(y, caja[0] + 1, caja[2] - 1)
    m.intersecar(zona.dilatar(True))
    for x, y in m.puntos():
        li.set(x, y, c[1])
    for x in range(caja[0] + 1, caja[2]):
        li.encima(x, caja[1] + 1, c[0])
    if p.get('espuma'):
        for x in range(caja[0] + 1, caja[2]):
            li.encima(x, caja[1] + 1, ING and A.hex_rgb('#f4ece0'))
    if p.get('trozo'):
        _rodaja(li, caja[2] - 2, caja[1] + 1, 2.0, r3(p['trozo']))


@contenido('tarta')
def _c_tarta(li, zona, p, rnd):
    c = r3(p.get('ing', 'pan'))
    relleno = r3(p.get('relleno', 'baya'))
    m = Mascara(W, H)
    m.poligono([(CX - 9, CY + 5), (CX - 7, CY - 4), (CX + 7, CY - 4), (CX + 9, CY + 5)])
    for x, y in m.puntos():
        li.set(x, y, c[0] if y < CY - 1 else c[1])
    for x, y in m.borde_interno(False).puntos():
        li.set(x, y, c[2])
    for x in range(CX - 7, CX + 8):
        li.set(x, CY - 1, relleno[1])
        li.set(x, CY, relleno[2])
    for i in range(3):
        li.set(CX - 5 + i * 5, CY - 5, relleno[0])


@contenido('marisco')
def _c_marisco(li, zona, p, rnd):
    caja = zona.caja()
    cy = (caja[1] + caja[3]) // 2
    tipo = p.get('tipo', 'gamba')
    c = r3(p.get('ing', 'gamba'))
    if tipo == 'gamba':
        for k, (dx, dy) in enumerate(((-6, 0), (0, 1), (6, -1))):
            for i in range(6):
                t = i / 5.0
                ang = math.pi * (1.0 - 0.6 * t)
                px = CX + dx + math.cos(ang) * 3.4
                py = cy + dy + math.sin(ang) * 3.0
                m = Mascara(W, H).disco(px, py, 1.6 - 0.5 * t)
                for x, y in m.puntos():
                    li.set(x, y, c[0] if i % 2 else c[1])
                for x, y in m.borde_interno(False).puntos():
                    li.set(x, y, c[2])
    elif tipo == 'concha':
        for dx in (-7, 0, 7):
            m = Mascara(W, H)
            m.poligono([(CX + dx - 4, cy + 2), (CX + dx - 3, cy - 3), (CX + dx, cy - 4),
                        (CX + dx + 3, cy - 3), (CX + dx + 4, cy + 2)])
            for x, y in m.puntos():
                li.set(x, y, c[1])
            for x, y in m.borde_interno(False).puntos():
                li.set(x, y, c[2])
            for k in range(-2, 3):
                for j in range(5):
                    li.encima(CX + dx + k * (j * 0.4), cy + 2 - j, c[0] if j % 2 else c[2])
    else:                                  # cangrejo entero
        m = Mascara(W, H).elipse(CX, cy, 7, 4.4)
        for x, y in m.puntos():
            li.set(x, y, c[0] if y < cy else c[1])
        for x, y in m.borde_interno(False).puntos():
            li.set(x, y, c[2])
        for s in (-1, 1):
            for i in range(3):
                li.set(CX + s * (8 + i), cy + 2 + i, c[1])
            li.set(CX + s * 9, cy - 3, c[1])
            li.set(CX + s * 10, cy - 4, c[0])


# ===========================================================================
# CATALOGO
#   id | Nombre | recipiente | contenido | extras
# ===========================================================================

COMIDAS = """
pescado_a_la_plancha | Pescado a la plancha | sarten  | pez_entero | ing=pescado,largo=13,vapor=1
pescado_frito        | Pescado frito        | plato   | pez_entero | ing=pan,largo=13,rodajas=limon
pescado_al_horno     | Pescado al horno     | tabla   | pez_entero | ing=salmon,largo=15,vapor=1
pescado_asado        | Pescado asado        | hoja    | pez_entero | ing=carne,largo=14,vapor=1
filete_de_salmon     | Filete de salmon     | plato   | filetes    | ing=salmon
filete_blanco        | Filete blanco        | plato   | filetes    | ing=blanco
sopa_de_pescado      | Sopa de pescado      | cuenco  | sopa       | caldo=caldo,tropiezos=pescado,vapor=1
caldo_de_marisco     | Caldo de marisco     | cuenco  | sopa       | caldo=caldo_rojo,tropiezos=gamba,vapor=1
sopa_de_almejas      | Sopa de almejas      | cuenco  | sopa       | caldo=blanco,tropiezos=blanco,vapor=1
sopa_de_algas        | Sopa de algas        | cuenco  | sopa       | caldo=caldo_verde,tropiezos=alga,vapor=1
sopa_de_setas        | Sopa de setas        | cuenco  | sopa       | caldo=setas,tropiezos=setas,vapor=1
guiso_del_pescador   | Guiso del pescador   | cuenco  | sopa       | caldo=caldo_rojo,tropiezos=pescado/verdura,vapor=1
estofado             | Estofado             | cuenco  | sopa       | caldo=chocolate,tropiezos=carne/verdura,vapor=1
crema_de_calabaza    | Crema de calabaza    | cuenco  | sopa       | caldo=caldo,tropiezos=caldo,vapor=1
arroz_con_pescado    | Arroz con pescado    | plato   | monton     | ing=arroz,encima=pescado/verdura
paella_de_marisco    | Paella de marisco    | sarten  | monton     | ing=caldo,encima=gamba/tomate,n=34
risotto              | Risotto              | plato   | monton     | ing=arroz,encima=setas
gachas_calientes     | Gachas calientes     | cuenco  | monton     | ing=blanco,vapor=1
sushi                | Sushi                | tabla   | sushi      | ing=salmon
sashimi              | Sashimi              | tabla   | filetes    | ing=salmon
nigiri               | Nigiri               | tabla   | sushi      | ing=pescado
brocheta_de_pescado  | Brocheta de pescado  | suelto  | brocheta   | ing=pescado/verdura/pescado/tomate
brocheta_de_marisco  | Brocheta de marisco  | suelto  | brocheta   | ing=gamba/limon/gamba/verdura
brocheta_de_verdura  | Brocheta de verdura  | suelto  | brocheta   | ing=verdura/tomate/setas/verdura
empanada_de_pescado  | Empanada de pescado  | tabla   | masa       | ing=pan
croquetas            | Croquetas            | plato   | masa       | ing=pan,bultos=-6:3.4;0:3.6;6:3.4
bunuelos             | Bunuelos             | cesta   | masa       | ing=caldo
pan_de_pescador      | Pan de pescador      | tabla   | masa       | ing=pan,bultos=-3:5.0;5:4.0
galleta_marinera     | Galleta marinera     | suelto  | masa       | ing=blanco,bultos=-4:4.2;4:4.2
hamburguesa_de_pez   | Hamburguesa de pez   | suelto  | masa       | ing=pan,bultos=0:6.0
taco_de_pescado      | Taco de pescado      | suelto  | masa       | ing=caldo,bultos=-2:5.4
ceviche              | Ceviche              | cuenco  | monton     | ing=blanco,encima=tomate/limon
escabeche            | Escabeche            | cuenco  | monton     | ing=caldo,encima=pescado
gambas_a_la_plancha  | Gambas a la plancha  | sarten  | marisco    | tipo=gamba,ing=gamba,vapor=1
mejillones_al_vapor  | Mejillones al vapor  | cuenco  | marisco    | tipo=concha,ing=alga,vapor=1
ostras_frescas       | Ostras frescas       | hoja    | marisco    | tipo=concha,ing=blanco
cangrejo_cocido      | Cangrejo cocido      | plato   | marisco    | tipo=entero,ing=cangrejo,vapor=1
calamares_fritos     | Calamares fritos     | cesta   | masa       | ing=pan,bultos=-5:3.2;0:3.6;5:3.0
ensalada_de_algas    | Ensalada de algas    | cuenco  | monton     | ing=alga,encima=tomate
te_de_hierbas        | Te de hierbas        | taza    | bebida     | ing=te,vapor=1
"""


def fichas():
    fuera = []
    for linea in COMIDAS.strip().split('\n'):
        partes = [c.strip() for c in linea.split('|')]
        p = dict(id=partes[0], nombre=partes[1], recipiente=partes[2],
                 contenido=partes[3])
        if len(partes) > 4 and partes[4]:
            for par in partes[4].split(','):
                k, _, v = par.partition('=')
                k, v = k.strip(), v.strip()
                # OJO con los separadores: la ficha ya usa '|' para las
                # columnas, asi que dentro de los extras las listas van con '/'
                # y los pares con ':'. Usar '|' tambien aqui partia la linea
                # antes de tiempo y las listas llegaban con un solo elemento.
                if k in ('tropiezos', 'encima', 'ing') and '/' in v:
                    p[k] = v.split('/')
                elif k == 'bultos':
                    p[k] = [tuple(float(z) for z in b.split(':')) for b in v.split(';')]
                elif v.isdigit():
                    p[k] = int(v)
                else:
                    p[k] = v
        if p['contenido'] in ('sopa',) and isinstance(p.get('tropiezos'), str):
            p['tropiezos'] = [p['tropiezos']]
        if p['contenido'] in ('monton',) and isinstance(p.get('encima'), str):
            p['encima'] = [p['encima']]
        if p['contenido'] == 'brocheta' and isinstance(p.get('ing'), str):
            p['ing'] = [p['ing']]
        fuera.append(p)
    return fuera


def dibujar(p):
    rnd = rng_de('comida', p['id'])
    li = Lienzo(W, H)
    zona = RECIPIENTES[p['recipiente']](li)
    CONTENIDOS[p['contenido']](li, zona, p, rnd)
    li.contornear(li.mascara_opaca(), diagonales=True)
    if p.get('vapor'):
        _vapor(li, CX, li.mascara_opaca().caja()[1])
    return li.recortado()


def main():
    hoja = '--hoja' in sys.argv
    cat = []
    rutas = []
    for p in fichas():
        li = dibujar(p)
        ruta = os.path.join(DESTINO, '%s.png' % p['id'])
        li.guardar(ruta)
        rutas.append(ruta)
        cat.append({'id': p['id'], 'nombre': p['nombre'],
                    'recipiente': p['recipiente'], 'contenido': p['contenido'],
                    'caliente': bool(p.get('vapor')),
                    'ancho': li.w, 'alto': li.h, 'maxStack': 10,
                    'ruta': '%s/%s.png' % (WEB, p['id']),
                    'clave_phaser': p['id']})
    with io.open(os.path.join(DESTINO, 'comidas.json'), 'w', encoding='utf-8') as fh:
        fh.write(json.dumps({'pack': 'newpro/comidas', 'version': 1, 'base_web': WEB,
                             'total': len(cat), 'comidas': cat},
                            ensure_ascii=False, indent=1))
    print('%d comidas escritas en %s' % (len(cat), DESTINO))
    if hoja:
        d = os.path.join(os.environ.get('TEMP', '.'), 'gf_hojas')
        if not os.path.isdir(d):
            os.makedirs(d)
        A.hoja_contacto(rutas, columnas=8, escala=5).save(os.path.join(d, 'comidas.png'))
        print('hoja en', d)


if __name__ == '__main__':
    main()
