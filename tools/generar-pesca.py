#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
PESCA — aparejo, cebos, recursos del mar y chatarra del fondo
=============================================================================

QUE ESCRIBE
---------------------------------------------------------------------------
    Game/newpro/pesca/canas/       8 canas
    Game/newpro/pesca/aparejo/     anzuelos, sedales, boyas, redes, nasas
    Game/newpro/pesca/cebos/       11 cebos
    Game/newpro/pesca/despiece/    lo que se saca de un pez
    Game/newpro/pesca/marinos/     perlas, corales, algas, conchas, sal
    Game/newpro/pesca/tesoros/     lo que se pesca del fondo y vale algo
    Game/newpro/pesca/basura/      lo que se pesca del fondo y no vale nada
    Game/newpro/pesca/pesca.json

COMO ESTA HECHO
---------------------------------------------------------------------------
Cada familia es UN pintor con parametros, no un dibujo por objeto: las ocho
canas salen del mismo pintor cambiando material y adornos, los siete anzuelos
del mismo cambiando metal y numero de puas. Asi ocho canas se parecen entre si
lo que se tienen que parecer —son todas canas— y se diferencian en lo que las
diferencia de verdad: el material.

Los materiales estan copiados de los sprites que ya tiene el juego, para que
una cana de hierro y un pico de hierro sean del mismo hierro:

    hierro   #cbcbca #b2b2b2 #878787 #6b6c6c   (Game/Source/hierro.png)
    cobre    #bc8763 #ab7149 #915f3e #754b33   (Game/Source/cobre.png)
    madera   #a3763f #8a5f30 #6b4724 #4e3319   (mangos de las herramientas)
    arpillera#824a24 #8f572f #62391f #522d19   (bolsas de semilla del juego)

USO
---------------------------------------------------------------------------
    python tools/generar-pesca.py
    python tools/generar-pesca.py --hoja
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
DESTINO = os.path.join(RAIZ, 'Game', 'newpro', 'pesca')
WEB = '/Game/newpro/pesca'

W = H = 34

# --- materiales, sacados del arte que ya existe -----------------------------
MAT = {
    'hierro':   ['#e2e2e1', '#cbcbca', '#b2b2b2', '#878787', '#6b6c6c'],
    'acero':    ['#e8ecee', '#c8d2d8', '#a3b0b8', '#78858d', '#525c63'],
    'cobre':    ['#d8a37c', '#bc8763', '#ab7149', '#915f3e', '#754b33'],
    'bronce':   ['#d8b070', '#bd9450', '#a07a3c', '#7f5f2c', '#5f461f'],
    'plata':    ['#f2f4f6', '#d8dee4', '#b6bec8', '#8d95a0', '#666e78'],
    'oro':      ['#f7e08a', '#e8c552', '#c9a232', '#a07d1e', '#775c12'],
    'madera':   ['#c08f52', '#a3763f', '#8a5f30', '#6b4724', '#4e3319'],
    'bambu':    ['#e0d08a', '#c9b76a', '#ab9a4e', '#877a38', '#635922'],
    'hueso':    ['#f2ecd8', '#ded6bc', '#c0b696', '#9a8f70', '#6f664e'],
    'arpillera': ['#a3623a', '#8f572f', '#824a24', '#62391f', '#522d19'],
    'cuerda':   ['#d8c496', '#bca170', '#99845b', '#75643f', '#544628'],
    'abisal':   ['#4a5a6b', '#36434f', '#252f39', '#182028', '#0e1318'],
    'espectral': ['#dffbf8', '#b0e8e2', '#8fd8d0', '#5fa8a2', '#3f7a76'],
    'oxido':    ['#a87048', '#8a5734', '#6f4326', '#54301a', '#3a2011'],
    'coral':    ['#f0a88f', '#d8624a', '#b8412c', '#8a2f1c', '#5f1d10'],
    'alga':     ['#7ab04a', '#5f8f34', '#4a7226', '#37561c', '#243a12'],
    'perla':    ['#fdfbff', '#f2eef6', '#ded6e6', '#b8aec6', '#8a7f9c'],
    'hielo':    ['#f2fbfd', '#c6e8f2', '#a8d8e8', '#7fb2c8', '#5f8fa8'],
    'cristal':  ['#eef6fa', '#cfe0e8', '#a8bcc8', '#7c8f9c', '#55646e'],
    'tela':     ['#e8dcc0', '#cfc0a0', '#ab9a7c', '#83745a', '#5c503b'],
    'carne':    ['#f0b8a0', '#e09a7f', '#c47a5e', '#9c5a42', '#70392a'],
    'papel':    ['#eee0bc', '#dccfa8', '#c0b184', '#998a62', '#6f6344'],
}


def M(nombre):
    return [A.hex_rgb(c) for c in MAT[nombre]]


def _lienzo():
    return Lienzo(W, H), Mascara(W, H)


def _pinta(li, m, cols, dir_luz=(-1, -1), plano=False):
    """
    Rellena una mascara con una rampa de 5 tonos segun lo lejos que este cada
    pixel de la esquina iluminada. Es el sombreado por defecto de todo el pack:
    la luz viene de arriba a la izquierda.
    """
    caja = m.caja()
    if not caja:
        return
    x0, y0, x1, y1 = caja
    an = max(1, x1 - x0)
    al = max(1, y1 - y0)
    for x, y in m.puntos():
        if plano:
            li.set(x, y, cols[2])
            continue
        fx = (x - x0) / float(an)
        fy = (y - y0) / float(al)
        d = (fx * 0.45 + fy * 0.55) if dir_luz == (-1, -1) else (1 - fx) * .5 + fy * .5
        li.set(x, y, cols[min(4, max(0, int(d * 4.4)))])


def _contorno(li, base=None):
    m = li.mascara_opaca()
    col = A.contorno_de(base if base else li.color_medio(m))
    li.contornear(m, color=col, diagonales=True)
    return li


# ===========================================================================
# CANAS
# ===========================================================================

def cana(p):
    """
    Una cana en diagonal: puno abajo a la izquierda, puntera arriba a la
    derecha, sedal colgando de la punta. La diagonal no es capricho — en
    vertical la cana ocupa 30 px de alto y 3 de ancho, y en la casilla del
    inventario se ve como un palo.
    """
    li, _ = _lienzo()
    cols = M(p['mat'])
    metal = M(p.get('metal', 'hierro'))
    largo = p.get('largo', 26)
    x0, y0 = 3, H - 5
    x1, y1 = x0 + int(largo * .78), y0 - int(largo * .80)

    # la vara, mas gruesa en el puno
    vara = Mascara(W, H)
    pasos = max(abs(x1 - x0), abs(y1 - y0))
    for i in range(pasos + 1):
        t = i / float(pasos)
        px = x0 + (x1 - x0) * t
        py = y0 + (y1 - y0) * t
        gr = 1.7 - 1.2 * t
        vara.disco(px, py, gr)
    _pinta(li, vara, cols)

    # puno forrado
    puno = Mascara(W, H)
    for i in range(int(pasos * .30)):
        t = i / float(pasos)
        puno.disco(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 2.1)
    cu = M(p.get('puno', 'cuerda'))
    _pinta(li, puno, cu)
    for i in range(0, int(pasos * .30), 2):
        t = i / float(pasos)
        li.encima(int(round(x0 + (x1 - x0) * t)), int(round(y0 + (y1 - y0) * t)), cu[3])

    # carrete
    t = 0.33
    rx = int(round(x0 + (x1 - x0) * t))
    ry = int(round(y0 + (y1 - y0) * t))
    car = Mascara(W, H).disco(rx - 2, ry + 2, 2.6)
    _pinta(li, car, metal)
    li.encima(rx - 2, ry + 2, metal[4])
    li.encima(rx - 3, ry + 1, metal[0])

    # anillas
    for t in (0.55, 0.75, 0.92):
        ax = int(round(x0 + (x1 - x0) * t))
        ay = int(round(y0 + (y1 - y0) * t))
        li.set(ax, ay + 2, metal[3])
        li.set(ax + 1, ay + 2, metal[1])

    # sedal y anzuelo
    sed = A.hex_rgb('#e4ecef')
    for i in range(8):
        li.set(x1 + 1, y1 + 1 + i, sed if i % 2 == 0 else ajusta(sed, dv=0.86))
    li.set(x1 + 1, y1 + 9, metal[2])
    li.set(x1, y1 + 10, metal[2])
    li.set(x1 - 1, y1 + 9, metal[1])

    _contorno(li, cols[3])
    if p.get('brillo'):
        au = A.hex_rgb(p['brillo'])
        for i, t in enumerate((0.45, 0.68, 0.88)):
            ax = int(round(x0 + (x1 - x0) * t))
            ay = int(round(y0 + (y1 - y0) * t))
            li.set(ax + 1, ay - 2, au)
    return li.recortado()


# ===========================================================================
# ANZUELOS, SEDAL, BOYAS
# ===========================================================================

def anzuelo(p):
    """
    La J. Se traza como lo que es: caña recta, CURVA de medio circulo abajo y
    punta que vuelve a subir por dentro, con la lengueta mirando hacia arriba.

    El primer intento la dibujaba con una espiral de discos calculada a ojo y
    salia una S: la curva se cerraba antes de tiempo y la punta acababa
    apuntando al suelo. Media circunferencia de verdad —angulo de 0 a 180
    grados alrededor de un centro— no tiene ese problema.
    """
    li, _ = _lienzo()
    cols = M(p['mat'])
    n = p.get('puas', 1)
    cx, cy = W // 2, H // 2 + 2
    r = 3.6

    def una(dx, espejo=1):
        m = Mascara(W, H)
        sx = cx + dx + espejo * r
        m.rect(sx - 0.5, cy - 11, sx + 0.5, cy)                 # caña
        aro = Mascara(W, H).disco(sx, cy - 12, 2.0)
        aro.restar(Mascara(W, H).disco(sx, cy - 12, 0.9))
        m.unir(aro)                                             # ojal
        for i in range(19):                                     # curva
            ang = math.pi * i / 18.0
            m.disco(cx + dx + espejo * r * math.cos(ang), cy + r * math.sin(ang), 0.95)
        px = cx + dx - espejo * r
        for i in range(6):                                      # punta
            m.disco(px + espejo * i * 0.22, cy - i * 0.9, 0.95 - i * 0.06)
        tx, ty = px + espejo * 1.1, cy - 5.4
        m.set(tx, ty)
        m.set(tx + espejo * 1, ty - 1)                          # el pincho
        m.set(tx - espejo * 0.5, ty + 1.6)                      # la lengueta
        m.set(tx + espejo * 0.8, ty + 1.2)
        return m

    m = una(0)
    if n > 1:
        # El triple comparte UNA sola caña: los tres anzuelos van soldados a
        # ella. Dibujar dos anzuelos enteros daba dos cañas paralelas, que es
        # otra cosa (un aparejo de dos anzuelos).
        m.unir(una(2 * r, -1))
        recto = Mascara(W, H)
        recto.rect(cx + r - 0.5, cy, cx + r + 0.5, cy + r + 1.5)
        recto.set(cx + r - 1.5, cy + r + 0.5)
        recto.set(cx + r + 1.5, cy + r + 0.5)
        m.unir(recto)

    _pinta(li, m, cols)
    for x, y in m.borde_interno(False).puntos():
        if x > cx or y > cy + 1:
            li.set(x, y, cols[4])
    _contorno(li, cols[3])
    return li.recortado()


def sedal(p):
    """Carrete de hilo: dos tapas y el hilo enrollado en medio."""
    li, _ = _lienzo()
    mad = M('madera')
    hilo = M(p['mat'])
    cx, cy = W // 2, H // 2
    an, al = 5, 9

    tapa = Mascara(W, H)
    tapa.rect(cx - an, cy - al, cx - an + 1, cy + al)
    tapa.rect(cx + an - 1, cy - al, cx + an, cy + al)
    cuerpo = Mascara(W, H).rect(cx - an + 2, cy - al + 2, cx + an - 2, cy + al - 2)
    _pinta(li, cuerpo, hilo)
    for y in range(cy - al + 2, cy + al - 1):
        if (y - cy) % 2 == 0:
            for x in range(cx - an + 2, cx + an - 1):
                li.encima(x, y, hilo[3])
    _pinta(li, tapa, mad)
    # una hebra suelta
    li.set(cx + an + 1, cy - al + 3, hilo[1])
    li.set(cx + an + 2, cy - al + 4, hilo[2])
    li.set(cx + an + 2, cy - al + 5, hilo[1])
    _contorno(li, mad[3])
    return li.recortado()


def boya(p):
    """Flotador: mitad de arriba de color, mitad de abajo clara, y la antena."""
    li, _ = _lienzo()
    arriba = M(p['mat'])
    abajo = M(p.get('mat2', 'perla'))
    cx, cy = W // 2, H // 2 + 2
    r = 5.2

    bola = Mascara(W, H).disco(cx, cy, r)
    for x, y in bola.puntos():
        f = math.hypot((x - cx + 1.6) / (r * 1.7), (y - cy + 1.6) / (r * 1.7))
        cols = arriba if y < cy else abajo
        li.set(x, y, cols[min(4, max(0, int(f * 4.2)))])
    for i in range(4):
        li.set(cx, cy - int(r) - 1 - i, arriba[2] if i % 2 else arriba[1])
    li.set(cx, cy + int(r) + 1, M('hierro')[3])
    _contorno(li, arriba[3])
    if p.get('brillo'):
        au = A.hex_rgb(p['brillo'])
        for dx, dy in ((-2, -6), (3, -4), (0, -8)):
            li.set(cx + dx, cy + dy, au)
    return li.recortado()


# ===========================================================================
# REDES Y NASAS
# ===========================================================================

def red_mano(p):
    """Aro con malla y mango. La malla se dibuja como rombos, no como rejilla:
    una red colgando no tiene los hilos rectos."""
    li, _ = _lienzo()
    mad = M('madera')
    hilo = M(p.get('mat', 'cuerda'))
    cx, cy = W // 2 + 1, 11

    mango = Mascara(W, H)
    mango.linea(cx - 4, cy + 4, cx - 11, cy + 13, 2)
    _pinta(li, mango, mad)

    aro = Mascara(W, H).elipse(cx, cy, 8, 5).restar(Mascara(W, H).elipse(cx, cy, 6.4, 3.4))
    _pinta(li, aro, M(p.get('metal', 'hierro')))

    bolsa = Mascara(W, H)
    for x in range(cx - 8, cx + 9):
        u = (x - cx) / 8.0
        if abs(u) > 1:
            continue
        prof = int(9 * math.sqrt(max(0.0, 1 - u * u)))
        bolsa.columna(x, cy + 2, cy + 2 + prof)
    bolsa.restar(aro)
    c1, c2 = hilo[1], hilo[3]
    for x, y in bolsa.puntos():
        if (x + y) % 3 == 0:
            li.set(x, y, c1)
        elif (x - y) % 3 == 0:
            li.set(x, y, c2)
    _contorno(li, hilo[3])
    return li.recortado()


def nasa(p):
    """
    Nasa de perfil: barriga en el centro, extremos estrechos, aros marcados y
    la boca de embudo —un agujero oscuro— a la izquierda. La primera version
    era un tronco de cono relleno de trenzado y se leia como una alfombra
    enrollada; lo que dice "trampa" es el AGUJERO.
    """
    li, _ = _lienzo()
    cols = M(p['mat'])
    cx, cy = W // 2, H // 2
    largo = 20
    f = perfil([(0, .46), (.28, 1.0), (.72, .96), (1, .40)])
    m = Mascara(W, H)
    topo = {}
    for i in range(largo):
        t = i / float(largo - 1)
        r = f(t) * 7.0
        x = cx - largo // 2 + i
        m.columna(x, cy - r, cy + r)
        topo[x] = r
    _pinta(li, m, cols)
    # varillas horizontales
    for x, y in m.puntos():
        if (y - cy) % 3 == 0:
            li.set(x, y, cols[3])
    # aros verticales
    for i in (2, largo // 2, largo - 3):
        x = cx - largo // 2 + i
        r = topo[x]
        for y in range(int(cy - r), int(cy + r) + 1):
            li.encima(x, y, cols[4])
            li.encima(x + 1, y, cols[1])
    # la boca
    bx = cx - largo // 2 + 1
    boca = Mascara(W, H).elipse(bx + 1, cy, 2.2, topo[bx] * 0.60)
    hondo = A.contorno_de(cols[2])
    for x, y in boca.puntos():
        li.set(x, y, hondo)
    for x, y in boca.borde(False).puntos():
        li.encima(x, y, cols[0])
    _contorno(li, cols[3])
    return li.recortado()


def arpon(p):
    """Arpon o tridente segun `puntas`."""
    li, _ = _lienzo()
    mad = M('madera')
    met = M(p['mat'])
    n = p.get('puntas', 1)
    cx = W // 2
    m_mango = Mascara(W, H).rect(cx - 1, 10, cx, H - 4)
    _pinta(li, m_mango, mad)
    m = Mascara(W, H)
    if n == 1:
        # hoja de lanza con dos lenguetas: un triangulo de 3 px no se ve
        m.poligono([(cx - 3, 11), (cx - 0.5, 1), (cx + 2, 11)])
        m.poligono([(cx - 5, 12), (cx - 2, 6), (cx - 2, 12)])
        m.poligono([(cx + 4, 12), (cx + 1, 6), (cx + 1, 12)])
        m.rect(cx - 2, 11, cx + 1, 12)
    else:
        for s in (-1, 0, 1):
            m.poligono([(cx - 0.5 + s * 3.2 - 1, 11), (cx - 0.5 + s * 3.2, 3 + abs(s)),
                        (cx - 0.5 + s * 3.2 + 1, 11)])
        m.rect(cx - 4, 10, cx + 3, 11)
    _pinta(li, m, met)
    _contorno(li, mad[3])
    return li.recortado()


def trampa(p):
    """Trampa de cangrejos: aro plano con malla, vista en escorzo."""
    li, _ = _lienzo()
    met = M(p.get('metal', 'hierro'))
    hilo = M('cuerda')
    cx, cy = W // 2, H // 2 + 1
    aro = Mascara(W, H).elipse(cx, cy, 10, 5).restar(Mascara(W, H).elipse(cx, cy, 8.6, 3.6))
    malla = Mascara(W, H).elipse(cx, cy, 8.6, 3.6)
    for x, y in malla.puntos():
        if (x + y) % 3 == 0:
            li.set(x, y, hilo[2])
        elif (x - y) % 3 == 0:
            li.set(x, y, hilo[3])
        else:
            li.set(x, y, A.hex_rgb('#2b3a42'))
    _pinta(li, aro, met)
    for i in range(3):
        li.set(cx - 6 + i * 6, cy - 6, met[2])
        li.set(cx - 6 + i * 6, cy - 5, met[3])
    li.set(cx, cy - 8, hilo[1])
    li.set(cx, cy - 7, hilo[2])
    _contorno(li, met[3])
    return li.recortado()


# ===========================================================================
# CEBOS
# ===========================================================================

def cebo(p):
    tipo = p['tipo']
    li, _ = _lienzo()
    cx, cy = W // 2, H // 2
    cols = M(p['mat'])

    if tipo == 'gusano':
        m = Mascara(W, H)
        for i in range(16):
            t = i / 15.0
            m.disco(cx - 7 + i, cy + math.sin(t * 6.5) * 3.4, 1.5 - 0.4 * t)
        _pinta(li, m, cols)
        for i in range(1, 16, 3):
            t = i / 15.0
            li.encima(cx - 7 + i, int(cy + math.sin(t * 6.5) * 3.4), cols[3])

    elif tipo == 'larva':
        m = Mascara(W, H)
        f = perfil([(0, .30), (.35, 1.0), (.75, .92), (1, .34)])
        for i in range(14):
            t = i / 13.0
            m.disco(cx - 6 + i, cy - 1 + t * 2, f(t) * 4.0)
        _pinta(li, m, cols)
        for i in range(2, 13, 2):
            t = i / 13.0
            for dy in (-1, 0, 1):
                li.encima(cx - 6 + i, int(cy - 1 + t * 2 + dy), cols[3])
        li.encima(cx - 6, cy - 1, A.hex_rgb('#5a4030'))

    elif tipo == 'mosca':
        m = Mascara(W, H)
        m.elipse(cx, cy + 1, 3.2, 2.2)                       # cuerpo
        _pinta(li, m, cols)
        plu = M(p.get('mat2', 'coral'))
        alas = Mascara(W, H)
        alas.poligono([(cx + 2, cy), (cx + 9, cy - 4), (cx + 8, cy + 2)])
        alas.poligono([(cx + 2, cy + 2), (cx + 8, cy + 5), (cx + 3, cy + 3)])
        _pinta(li, alas, plu)
        met = M('hierro')
        for i in range(4):
            li.set(cx - 3 - i, cy + 2 + i, met[2])
        li.set(cx - 6, cy + 6, met[1])

    elif tipo == 'saltamontes':
        m = Mascara(W, H)
        m.elipse(cx + 1, cy, 4.6, 2.4)
        m.elipse(cx - 4, cy - 1, 2.2, 2.0)
        _pinta(li, m, cols)
        pat = Mascara(W, H)
        pat.poligono([(cx, cy + 1), (cx + 4, cy + 5), (cx + 6, cy + 1), (cx + 2, cy + 2)])
        pat.linea(cx + 4, cy + 4, cx + 7, cy + 6)
        _pinta(li, pat, [ajusta(c, dv=0.86) for c in cols])
        li.encima(cx - 5, cy - 1, (24, 22, 18))

    elif tipo == 'camaron':
        m = Mascara(W, H)
        for i in range(9):
            t = i / 8.0
            ang = math.pi * (0.95 - 0.55 * t)
            m.disco(cx + math.cos(ang) * 5.5, cy - 2 + math.sin(ang) * 5.0, 2.2 - 1.1 * t)
        _pinta(li, m, cols)
        li.set(int(cx + math.cos(math.pi * .95) * 5.5) + 1, cy - 3, (24, 20, 22))

    elif tipo in ('pan', 'masa'):
        m = Mascara(W, H).disco(cx, cy, 4.6)
        if tipo == 'masa':
            m.disco(cx + 2, cy - 2, 3.0)
        _pinta(li, m, cols)
        met = M('hierro')
        for i in range(4):
            li.set(cx - 1 + i // 2, cy - 5 - i, met[2] if i % 2 else met[1])

    elif tipo in ('brillante', 'magico'):
        m = Mascara(W, H).disco(cx, cy, 4.4)
        for x, y in m.puntos():
            d = math.hypot(x - cx + 1.4, y - cy + 1.4) / 6.0
            li.set(x, y, cols[min(4, int(d * 4.6))])
        au = A.hex_rgb(p.get('brillo', '#f0e07a'))
        for dx, dy in ((-6, -3), (6, -2), (0, -7), (5, 5), (-5, 4)):
            li.set(cx + dx, cy + dy, au)
        if tipo == 'magico':
            for i in range(10):
                ang = i * 0.8
                li.encima(int(cx + math.cos(ang) * (2 + i * .2)),
                          int(cy + math.sin(ang) * (2 + i * .2)), ajusta(au, dv=1.1))

    elif tipo == 'hueva':
        m = Mascara(W, H)
        for dx, dy in ((0, 0), (3, 1), (-3, 1), (1, -3), (-2, -2), (2, 4), (-1, 3), (4, -2)):
            m.disco(cx + dx, cy + dy, 1.9)
        _pinta(li, m, cols)
        for dx, dy in ((0, 0), (3, 1), (-3, 1), (1, -3), (-2, -2), (2, 4), (-1, 3), (4, -2)):
            li.encima(cx + dx - 1, cy + dy - 1, cols[0])

    elif tipo == 'hueso':
        m = Mascara(W, H)
        m.rect(cx - 5, cy - 1, cx + 5, cy + 1)
        for s in (-1, 1):
            m.disco(cx + s * 6, cy - 1.6, 1.8)
            m.disco(cx + s * 6, cy + 1.6, 1.8)
        _pinta(li, m, cols)

    _contorno(li, cols[3])
    return li.recortado()


# ===========================================================================
# DESPIECE DEL PESCADO
# ===========================================================================

def escamas(p):
    """
    Un punado de escamas. Van montadas como TEJAS —cada fila tapa la mitad de
    la de arriba y las filas van a tresbolillo—, y cada escama lleva el filo
    de abajo oscuro. Sin ese filo, doce ovalos pegados se leen como una
    rejilla; con el, se leen como escamas.
    """
    li, _ = _lienzo()
    cols = M(p['mat'])
    cx, cy = W // 2, H // 2
    for fila in range(4):
        n = 3 if fila % 2 == 0 else 2
        for i in range(n):
            ex = cx - (n - 1) * 3.0 + i * 6.0
            ey = cy - 6 + fila * 3
            m = Mascara(W, H)
            for dy in range(-3, 4):
                an = math.sqrt(max(0.0, 1 - (dy / 3.4) ** 2)) * 3.4
                m.fila(ey + dy, ex - an, ex + an)
            for x, y in m.puntos():
                d = math.hypot((x - ex + 1.2) / 5.0, (y - ey + 1.2) / 5.0)
                li.set(x, y, cols[min(4, int(d * 4.2))])
            for x, y in m.borde_interno(True).puntos():
                if y >= ey + 1:
                    li.set(x, y, cols[4])
    _contorno(li, cols[3])
    return li.recortado()


def aleta(p):
    """
    Aleta suelta con forma de hoz: borde de ataque largo hasta el pico y borde
    de salida CONCAVO (el punto de en medio metido hacia dentro). Los radios
    van paralelos al borde de ataque, que es como se abren de verdad; en
    abanico desde el centro parecia una concha.
    """
    li, _ = _lienzo()
    cols = M(p['mat'])
    cx, cy = W // 2, H // 2 + 6
    pico = (cx + 3, cy - 13)
    m = Mascara(W, H).poligono([
        (cx - 8, cy + 1), (cx - 5, cy - 6), (cx - 1, cy - 11), pico,
        (cx + 3, cy - 6), (cx + 5, cy - 2), (cx + 8, cy + 1)])
    _pinta(li, m, cols)
    ray = cols[3]
    for k in range(7):
        x0 = cx - 7 + k * 2.2
        for j in range(16):
            t = j / 15.0
            x = x0 + (pico[0] - x0) * t * 0.55
            y = cy + 1 - j
            if m.get(x, y):
                li.set(x, y, ray)
    for x, y in m.borde_interno(False).puntos():
        if y >= cy:
            li.set(x, y, cols[4])
    _contorno(li, cols[3])
    return li.recortado()


def filete(p):
    li, _ = _lienzo()
    cols = M(p['mat'])
    cx, cy = W // 2, H // 2
    m = Mascara(W, H)
    f = perfil([(0, .28), (.30, 1.0), (.72, .90), (1, .30)])
    for i in range(20):
        t = i / 19.0
        m.columna(cx - 10 + i, cy - f(t) * 5.0, cy + f(t) * 4.0)
    _pinta(li, m, cols)
    veta = ajusta(cols[0], dv=1.06, ds=0.7)
    for i in range(2, 19, 3):
        t = i / 19.0
        for dy in range(int(-f(t) * 3), int(f(t) * 3)):
            if (i + dy) % 4 == 0:
                li.encima(cx - 10 + i, cy + dy, veta)
    if p.get('piel'):
        pi = M(p['piel'])
        for i in range(20):
            t = i / 19.0
            li.encima(cx - 10 + i, int(cy + f(t) * 4.0), pi[2])
            li.encima(cx - 10 + i, int(cy + f(t) * 4.0) - 1, pi[1])
    _contorno(li, cols[3])
    return li.recortado()


def pescado_seco(p):
    """Un pez abierto y colgado de una cuerda: lo que se ve en un secadero."""
    li, _ = _lienzo()
    cols = M(p['mat'])
    cx, cy = W // 2, H // 2 + 2
    m = Mascara(W, H)
    f = perfil([(0, .35), (.25, 1.0), (.70, .78), (1, .30)])
    for i in range(19):
        t = i / 18.0
        m.columna(cx - 9 + i, cy - f(t) * 5.5, cy + f(t) * 4.5)
    m.poligono([(cx + 9, cy - 4), (cx + 13, cy - 6), (cx + 11, cy), (cx + 13, cy + 5), (cx + 9, cy + 3)])
    _pinta(li, m, cols)
    esp = ajusta(cols[4], dv=1.15)
    for i in range(19):                                  # la espina
        li.encima(cx - 9 + i, cy, esp)
        if i % 3 == 0:
            li.encima(cx - 9 + i, cy - 2, esp)
            li.encima(cx - 9 + i, cy + 2, esp)
    cu = M('cuerda')
    for i in range(5):
        li.set(cx - 8, cy - 6 - i, cu[1] if i % 2 else cu[2])
    li.set(cx - 9, cy - 4, (26, 22, 20))
    if p.get('sal'):
        for dx, dy in ((-5, -3), (2, -4), (5, 1), (-2, 3), (7, -2)):
            li.encima(cx + dx, cy + dy, (250, 250, 246))
    _contorno(li, cols[3])
    return li.recortado()


def saco(p):
    """Saco de arpillera, calcado del de las bolsas de semilla del juego."""
    li, _ = _lienzo()
    cols = M('arpillera')
    cx, cy = W // 2, H // 2 + 3
    m = Mascara(W, H)
    f = perfil([(0, .40), (.20, .52), (.35, .90), (1, 1.0)])
    for i in range(16):
        t = i / 15.0
        an = f(t) * 7.0
        m.fila(cy - 8 + i, cx - an, cx + an)
    _pinta(li, m, cols)
    nudo = M('cuerda')
    for x in range(cx - 4, cx + 5):
        li.encima(x, cy - 5, nudo[2])
        li.encima(x, cy - 6, nudo[1])
    # la boca fruncida
    for i in range(3):
        li.encima(cx - 2 + i * 2, cy - 8, cols[4])
    # el contenido asomando
    dentro = M(p['mat'])
    for dx, dy in ((-1, -9), (1, -9), (0, -10), (2, -10)):
        li.set(cx + dx, cy + dy, dentro[1])
    _contorno(li, cols[3])
    return li.recortado()


def frasco_simple(p):
    """Frasquito para aceites y esencias del despiece."""
    li, _ = _lienzo()
    vid = M('cristal')
    liq = M(p['mat'])
    cx, cy = W // 2, H // 2 + 3
    m = Mascara(W, H)
    f = perfil([(0, .34), (.20, .50), (.42, 1.0), (1, .94)])
    for i in range(15):
        t = i / 14.0
        an = f(t) * 5.0
        m.fila(cy - 7 + i, cx - an, cx + an - 1)
    _pinta(li, m, vid)
    for i in range(6, 15):
        t = i / 14.0
        an = int(f(t) * 5.0)
        for x in range(cx - an + 1, cx + an - 1):
            li.set(x, cy - 7 + i, liq[min(4, 1 + (i - 6) // 3)])
    for x in range(cx - 3, cx + 3):
        li.encima(x, cy - 1, liq[0])
    cork = M('madera')
    for i in range(2):
        li.set(cx - 1, cy - 9 - i, cork[1])
        li.set(cx, cy - 9 - i, cork[2])
    li.contornear(li.mascara_opaca(), color=A.hex_rgb('#20303a'), diagonales=True)
    return li.recortado()


def espina(p):
    """Esqueleto de pez. Con `roto`, el que se pesca del fondo: mordido,
    sin cabeza y manchado de cieno — si no, era la misma imagen que la espina
    limpia del despiece con otro nombre."""
    li, _ = _lienzo()
    cols = M(p.get('mat', 'hueso'))
    cx, cy = W // 2, H // 2
    m = Mascara(W, H)
    m.rect(cx - 9, cy, cx + 7, cy)
    for i in range(-8, 7, 2):
        gr = 4 - abs(i) // 4
        m.linea(cx + i, cy - 1, cx + i - 1, cy - gr)
        m.linea(cx + i, cy + 1, cx + i - 1, cy + gr)
    m.elipse(cx - 10, cy, 3, 2.4)
    m.poligono([(cx + 7, cy - 3), (cx + 10, cy - 4), (cx + 8, cy), (cx + 10, cy + 4), (cx + 7, cy + 3)])
    if p.get('roto'):
        m.restar(Mascara(W, H).disco(cx - 10, cy, 3.4))          # sin cabeza
        m.restar(Mascara(W, H).disco(cx + 2, cy - 3, 2.6))       # mordido
        m.restar(Mascara(W, H).disco(cx - 4, cy + 3, 2.2))
    _pinta(li, m, cols)
    if p.get('roto'):
        verde = M('alga')
        for dx, dy in ((-6, 1), (0, -1), (4, 2), (-2, 2)):
            li.encima(cx + dx, cy + dy, verde[3])
    else:
        li.set(cx - 10, cy - 1, A.hex_rgb('#6f664e'))
    _contorno(li, cols[3])
    return li.recortado()


# ===========================================================================
# MARINOS
# ===========================================================================

def perla(p):
    li, _ = _lienzo()
    cols = M(p['mat'])
    cx, cy = W // 2, H // 2
    r = p.get('r', 5.0)
    m = Mascara(W, H).disco(cx, cy, r)
    for x, y in m.puntos():
        d = math.hypot((x - cx + r * .38) / (r * 1.5), (y - cy + r * .38) / (r * 1.5))
        li.set(x, y, cols[min(4, int(d * 4.6))])
    li.set(int(cx - r * .40), int(cy - r * .45), (255, 255, 255))
    for x, y in m.borde_interno(False).puntos():
        if y > cy + r * .3:
            li.set(x, y, ajusta(li.get(x, y), dv=1.20))     # luz rebotada
    _contorno(li, cols[3])
    return li.recortado()


def coral(p):
    """Coral ramificado: un tronco y ramas que se abren y adelgazan."""
    li, _ = _lienzo()
    cols = M(p['mat'])
    cx, cy = W // 2, H - 6
    m = Mascara(W, H)

    def rama(x, y, ang, largo, gr):
        for i in range(int(largo)):
            m.disco(x + math.cos(ang) * i, y + math.sin(ang) * i, max(0.8, gr * (1 - i / largo)))
        return x + math.cos(ang) * largo, y + math.sin(ang) * largo

    x1, y1 = rama(cx, cy, -math.pi / 2, 8, 2.4)
    a, b = rama(x1, y1, -math.pi / 2 - 0.7, 7, 1.8)
    c, d = rama(x1, y1, -math.pi / 2 + 0.6, 6, 1.8)
    rama(a, b, -math.pi / 2 - 0.2, 4, 1.2)
    rama(a, b, -math.pi / 2 - 1.1, 3, 1.0)
    rama(c, d, -math.pi / 2 + 0.2, 4, 1.2)
    rama(c, d, -math.pi / 2 + 1.0, 3, 1.0)
    _pinta(li, m, cols)
    pol = ajusta(cols[0], dv=1.15)
    for x, y in m.borde_interno(True).puntos():
        if (x + y) % 4 == 0:
            li.set(x, y, pol)
    _contorno(li, cols[3])
    return li.recortado()


def alga(p):
    """Fronda: un estipe y las laminas colgando a los lados."""
    li, _ = _lienzo()
    cols = M(p['mat'])
    cx, cy = W // 2, H - 4
    m = Mascara(W, H)
    alto = p.get('alto', 20)
    for i in range(alto):
        t = i / float(alto)
        m.disco(cx + math.sin(t * 3.0) * 3.0, cy - i, 1.3 - 0.4 * t)
    forma = p.get('forma', 'lamina')
    for i in range(2, alto - 2, 3):
        t = i / float(alto)
        bx = cx + math.sin(t * 3.0) * 3.0
        by = cy - i
        s = 1 if (i // 3) % 2 else -1
        if forma == 'lamina':
            m.poligono([(bx, by), (bx + s * 7, by - 3), (bx + s * 8, by + 1), (bx, by + 2)])
        elif forma == 'burbuja':
            m.disco(bx + s * 4, by - 1, 2.4)
            m.linea(bx, by, bx + s * 3, by - 1)
        else:                                     # filamento
            m.linea(bx, by, bx + s * 6, by - 4)
            m.linea(bx + s * 6, by - 4, bx + s * 8, by - 1)
    _pinta(li, m, cols)
    ner = ajusta(cols[3], dv=0.9)
    for i in range(alto):
        t = i / float(alto)
        li.encima(int(cx + math.sin(t * 3.0) * 3.0), cy - i, ner)
    _contorno(li, cols[3])
    return li.recortado()


def monton(p):
    """Un monton de grano (sal, arena): tres filas de puntos y sombra abajo."""
    li, _ = _lienzo()
    cols = M(p['mat'])
    cx, cy = W // 2, H // 2 + 4
    m = Mascara(W, H)
    f = perfil([(0, .10), (.45, .80), (1, 1.0)])
    for i in range(9):
        t = i / 8.0
        m.fila(cy - 8 + i, cx - f(t) * 9, cx + f(t) * 9)
    _pinta(li, m, cols)
    for x, y in m.puntos():
        if (x * 3 + y * 7) % 5 == 0:
            li.set(x, y, cols[0])
        elif (x * 5 - y * 3) % 7 == 0:
            li.set(x, y, cols[3])
    _contorno(li, cols[3])
    return li.recortado()


def esponja(p):
    li, _ = _lienzo()
    cols = M(p['mat'])
    cx, cy = W // 2, H // 2
    m = Mascara(W, H).elipse(cx, cy, 7, 6)
    m.disco(cx - 4, cy - 4, 3)
    m.disco(cx + 4, cy - 3, 2.6)
    _pinta(li, m, cols)
    for dx, dy in ((-3, -1), (1, -3), (3, 1), (-1, 2), (4, -1), (-4, 2), (0, 0), (2, 4)):
        li.encima(cx + dx, cy + dy, cols[4])
        li.encima(cx + dx + 1, cy + dy, cols[3])
    _contorno(li, cols[3])
    return li.recortado()


def gema_bruta(p):
    """Piedra irregular con caras planas: ambar, nacar, cristal de sal."""
    li, _ = _lienzo()
    cols = M(p['mat'])
    cx, cy = W // 2, H // 2
    m = Mascara(W, H)
    m.poligono([(cx - 6, cy + 2), (cx - 4, cy - 5), (cx + 2, cy - 6),
                (cx + 6, cy - 1), (cx + 4, cy + 6), (cx - 3, cy + 6)])
    _pinta(li, m, cols)
    # dos caras
    cara = Mascara(W, H).poligono([(cx - 4, cy - 4), (cx + 1, cy - 5), (cx, cy), (cx - 5, cy + 1)])
    cara.intersecar(m)
    for x, y in cara.puntos():
        li.set(x, y, cols[0])
    cara2 = Mascara(W, H).poligono([(cx + 1, cy), (cx + 6, cy - 1), (cx + 4, cy + 5), (cx, cy + 4)])
    cara2.intersecar(m)
    for x, y in cara2.puntos():
        li.set(x, y, cols[3])
    _contorno(li, cols[3])
    return li.recortado()


def concha_vacia(p):
    li, _ = _lienzo()
    cols = M(p['mat'])
    cx, cy = W // 2, H // 2 + 2
    m = Mascara(W, H)
    m.poligono([(cx - 8, cy + 3), (cx - 6, cy - 4), (cx, cy - 7), (cx + 6, cy - 4),
                (cx + 8, cy + 3), (cx, cy + 6)])
    _pinta(li, m, cols)
    rib = cols[3]
    for k in range(-3, 4):
        ang = math.pi / 2 + k * 0.30
        for j in range(2, 13):
            li.encima(int(round(cx + math.cos(ang + math.pi) * j * 0.75)),
                      int(round(cy - 6 + math.sin(ang) * j * 1.0)), rib)
    _contorno(li, cols[3])
    return li.recortado()


# ===========================================================================
# TESOROS
# ===========================================================================

def cofre(p):
    li, _ = _lienzo()
    mad = M('madera')
    met = M(p.get('metal', 'oro'))
    cx, cy = W // 2, H // 2 + 3
    cuerpo = Mascara(W, H).rect(cx - 9, cy - 2, cx + 8, cy + 6)
    tapa = Mascara(W, H)
    for i in range(6):
        an = 9 - int(i * 0.55)
        tapa.fila(cy - 3 - i, cx - an, cx + an - 1)
    _pinta(li, cuerpo, mad)
    _pinta(li, tapa, [ajusta(c, dv=1.08) for c in mad])
    for x in range(cx - 9, cx + 9):                       # herrajes
        li.encima(x, cy - 2, met[2])
    for dx in (-6, 0, 6):
        for y in range(cy - 8, cy + 7):
            li.encima(cx + dx, y, met[2] if (y % 2) else met[1])
    li.set(cx, cy, met[0])
    li.set(cx, cy + 1, met[3])
    if p.get('algas'):
        al = M('alga')
        for dx, dy in ((-8, 4), (-7, 2), (7, 5), (8, 3), (5, -6)):
            li.encima(cx + dx, cy + dy, al[2])
    _contorno(li, mad[3])
    return li.recortado()


def moneda(p):
    li, _ = _lienzo()
    cols = M(p['mat'])
    cx, cy = W // 2, H // 2
    r = p.get('r', 5.0)
    m = Mascara(W, H).elipse(cx, cy, r, r * 0.95)
    for x, y in m.puntos():
        d = math.hypot((x - cx + r * .35) / (r * 1.5), (y - cy + r * .35) / (r * 1.5))
        li.set(x, y, cols[min(4, int(d * 4.4))])
    aro = Mascara(W, H).elipse(cx, cy, r * .62, r * .58)
    for x, y in aro.borde(False).puntos():
        li.encima(x, y, cols[3])
    li.encima(cx, cy - 1, cols[0])
    li.encima(cx, cy, cols[1])
    li.encima(cx, cy + 1, cols[0])
    if p.get('pila'):
        for i in (1, 2):
            for x, y in m.puntos():
                if y > cy:
                    li.set(x, y + i * 2, cols[min(4, 2 + i)])
    _contorno(li, cols[3])
    return li.recortado()


def anfora(p):
    li, _ = _lienzo()
    cols = M(p['mat'])
    cx, cy = W // 2, H // 2 + 4
    m = Mascara(W, H)
    f = perfil([(0, .28), (.14, .42), (.40, 1.0), (.80, .70), (1, .26)])
    for i in range(20):
        t = i / 19.0
        an = f(t) * 6.5
        m.fila(cy - 14 + i, cx - an, cx + an)
    for s in (-1, 1):                                     # asas
        m.linea(cx + s * 3, cy - 12, cx + s * 6, cy - 10)
        m.linea(cx + s * 6, cy - 10, cx + s * 5, cy - 7)
    _pinta(li, m, cols)
    dec = ajusta(cols[4], dv=1.2)
    for x in range(cx - 6, cx + 7):
        li.encima(x, cy - 6, dec)
        if (x + cy) % 3 == 0:
            li.encima(x, cy - 4, dec)
    _contorno(li, cols[3])
    return li.recortado()


def botella_mensaje(p):
    li, _ = _lienzo()
    vid = M('cristal')
    pap = M('papel')
    cx, cy = W // 2, H // 2 + 2
    m = Mascara(W, H)
    f = perfil([(0, .30), (.22, .44), (.42, 1.0), (1, .96)])
    for i in range(18):
        t = i / 17.0
        an = f(t) * 5.5
        m.fila(cy - 10 + i, cx - an, cx + an - 1)
    _pinta(li, m, vid)
    rollo = Mascara(W, H).rect(cx - 3, cy - 1, cx + 2, cy + 4)
    _pinta(li, rollo, pap)
    for y in range(cy - 1, cy + 5, 2):
        li.encima(cx + 2, y, pap[3])
    cork = M('madera')
    li.set(cx - 1, cy - 12, cork[1]); li.set(cx, cy - 12, cork[2])
    li.set(cx - 1, cy - 11, cork[2]); li.set(cx, cy - 11, cork[3])
    li.contornear(li.mascara_opaca(), color=A.hex_rgb('#20303a'), diagonales=True)
    return li.recortado()


def brujula(p):
    li, _ = _lienzo()
    cols = M(p['mat'])
    cx, cy = W // 2, H // 2
    caja = Mascara(W, H).disco(cx, cy, 7)
    _pinta(li, caja, cols)
    esfera = Mascara(W, H).disco(cx, cy, 5)
    esf = M('papel')
    for x, y in esfera.puntos():
        li.set(x, y, esf[1] if (x + y) % 5 else esf[2])
    ag = Mascara(W, H).linea(cx - 3, cy + 3, cx + 3, cy - 3)
    for x, y in ag.puntos():
        li.set(x, y, A.hex_rgb('#c8303c') if x > cx else A.hex_rgb('#dfe9ee'))
    li.set(cx, cy, cols[4])
    li.set(cx, cy - 8, cols[2])
    li.set(cx, cy - 9, cols[1])
    _contorno(li, cols[3])
    return li.recortado()


def mapa(p):
    li, _ = _lienzo()
    pap = M('papel')
    cx, cy = W // 2, H // 2
    m = Mascara(W, H).rect(cx - 9, cy - 7, cx + 9, cy + 7)
    for i in range(3):                                    # esquinas rotas
        m.set(cx - 9 + i, cy - 7 + (2 - i), 0)
        m.set(cx + 9 - i, cy + 7 - (2 - i), 0)
    _pinta(li, m, pap)
    tin = A.hex_rgb('#6b4724')
    for x in range(cx - 7, cx + 8):
        if (x + cy) % 3:
            li.encima(x, cy - 3, tin)
    for x in range(cx - 5, cx + 4):
        if (x * 2) % 3:
            li.encima(x, cy + 1, tin)
    li.encima(cx + 5, cy + 4, A.hex_rgb('#a8322c'))
    li.encima(cx + 6, cy + 3, A.hex_rgb('#a8322c'))
    li.encima(cx + 4, cy + 3, A.hex_rgb('#a8322c'))
    li.encima(cx + 5, cy + 2, A.hex_rgb('#a8322c'))
    for y in range(cy - 7, cy + 8):                        # el doblez
        li.encima(cx - 1, y, pap[3])
    _contorno(li, pap[3])
    return li.recortado()


def llave(p):
    li, _ = _lienzo()
    cols = M(p['mat'])
    cx, cy = W // 2, H // 2
    m = Mascara(W, H)
    m.elipse(cx - 5, cy - 4, 4, 4).restar(Mascara(W, H).elipse(cx - 5, cy - 4, 2, 2))
    m.rect(cx - 6, cy, cx - 4, cy + 9)
    m.rect(cx - 3, cy + 6, cx - 1, cy + 7)
    m.rect(cx - 3, cy + 9, cx, cy + 10)
    _pinta(li, m, cols)
    _contorno(li, cols[3])
    return li.recortado()


def anillo(p):
    li, _ = _lienzo()
    cols = M(p['mat'])
    gema = M(p.get('gema', 'hielo'))
    cx, cy = W // 2, H // 2 + 1
    m = Mascara(W, H).elipse(cx, cy, 5.5, 5.5).restar(Mascara(W, H).elipse(cx, cy, 3.6, 3.6))
    _pinta(li, m, cols)
    g = Mascara(W, H).disco(cx, cy - 6, 2.6)
    for x, y in g.puntos():
        d = math.hypot(x - cx + 1, y - cy + 7) / 4.0
        li.set(x, y, gema[min(4, int(d * 4))])
    _contorno(li, cols[3])
    return li.recortado()


def reliquia(p):
    """Estatuilla hundida: una figura tosca con una gema en el pecho."""
    li, _ = _lienzo()
    cols = M(p['mat'])
    gema = M(p.get('gema', 'coral'))
    cx, cy = W // 2, H // 2 + 4
    m = Mascara(W, H)
    m.rect(cx - 6, cy + 5, cx + 5, cy + 7)                 # peana
    m.rect(cx - 4, cy - 4, cx + 3, cy + 5)                 # cuerpo
    m.elipse(cx, cy - 7, 3.2, 3.2)                         # cabeza
    m.poligono([(cx - 6, cy - 2), (cx - 4, cy - 3), (cx - 4, cy + 2)])
    m.poligono([(cx + 5, cy - 2), (cx + 3, cy - 3), (cx + 3, cy + 2)])
    _pinta(li, m, cols)
    for x, y in m.borde_interno(False).puntos():
        if x > cx + 2:
            li.set(x, y, cols[4])
    for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
        li.set(cx - 1 + dx, cy - 1 + dy, gema[1])
    li.set(cx - 1, cy - 1, gema[0])
    if p.get('algas'):
        al = M('alga')
        for dx, dy in ((-5, 4), (5, 5), (-6, 0)):
            li.encima(cx + dx, cy + dy, al[2])
    _contorno(li, cols[3])
    return li.recortado()


# ===========================================================================
# BASURA
# ===========================================================================

def bota(p):
    li, _ = _lienzo()
    cols = M(p['mat'])
    cx, cy = W // 2, H // 2 + 3
    m = Mascara(W, H)
    m.rect(cx - 4, cy - 9, cx + 1, cy + 2)                 # cana
    m.poligono([(cx - 4, cy + 2), (cx + 1, cy + 2), (cx + 8, cy + 4), (cx + 8, cy + 6),
                (cx - 5, cy + 6)])
    _pinta(li, m, cols)
    sue = M('oxido')
    for x in range(cx - 5, cx + 9):
        li.encima(x, cy + 6, sue[3])
        li.encima(x, cy + 5, sue[2])
    for i in range(3):                                     # cordones
        li.encima(cx - 3 + i * 2, cy - 7, cols[0])
        li.encima(cx - 3 + i * 2, cy - 5, cols[0])
    li.set(cx - 1, cy - 3, cols[4])                        # el agujero
    li.set(cx, cy - 3, cols[4])
    li.set(cx - 1, cy - 2, cols[4])
    _contorno(li, cols[3])
    return li.recortado()


def lata(p):
    li, _ = _lienzo()
    cols = M(p['mat'])
    cx, cy = W // 2, H // 2
    m = Mascara(W, H).rect(cx - 4, cy - 6, cx + 4, cy + 6)
    m.elipse(cx, cy - 6, 4.6, 2.0)
    m.elipse(cx, cy + 6, 4.6, 2.0)
    _pinta(li, m, cols)
    tapa = Mascara(W, H).elipse(cx, cy - 6, 4.6, 2.0)
    for x, y in tapa.puntos():
        li.set(x, y, cols[0] if y < cy - 6 else cols[2])
    for i in range(3):
        li.set(cx - 4 + i, cy - 2 + i, cols[4])            # la abolladura
    ox = M('oxido')
    for dx, dy in ((3, 2), (-3, 4), (2, -3), (-2, 0), (4, 5)):
        li.encima(cx + dx, cy + dy, ox[2])
    _contorno(li, cols[3])
    return li.recortado()


def rama(p):
    li, _ = _lienzo()
    cols = M(p['mat'])
    cx, cy = W // 2, H // 2
    m = Mascara(W, H)
    for i in range(22):
        t = i / 21.0
        m.disco(cx - 11 + i, cy + math.sin(t * 3.4) * 3.5, 1.6 - 0.5 * t)
    m.linea(cx - 2, cy + 1, cx + 2, cy - 4)
    m.linea(cx + 4, cy - 1, cx + 7, cy - 5)
    _pinta(li, m, cols)
    for i in range(1, 21, 4):
        t = i / 21.0
        li.encima(cx - 11 + i, int(cy + math.sin(t * 3.4) * 3.5), cols[4])
    if p.get('mojada'):
        for dx, dy in ((-8, 3), (0, 4), (6, 2)):
            li.encima(cx + dx, cy + dy, ajusta(cols[4], dv=0.8))
    _contorno(li, cols[3])
    return li.recortado()


def enredo(p):
    """Marana de algas o de red rota: hilos que se cruzan sin orden."""
    li, _ = _lienzo()
    cols = M(p['mat'])
    rnd = rng_de('enredo', p['id'])
    cx, cy = W // 2, H // 2
    m = Mascara(W, H)
    for i in range(7):
        ang = rnd.uniform(0, 3.14)
        lg = rnd.uniform(8, 13)
        x0 = cx + rnd.uniform(-4, 4)
        y0 = cy + rnd.uniform(-4, 4)
        pasos = int(lg)
        for j in range(pasos):
            t = j / float(pasos)
            m.set(int(x0 + math.cos(ang + math.sin(t * 4) * .6) * (j - pasos / 2)),
                  int(y0 + math.sin(ang + math.sin(t * 4) * .6) * (j - pasos / 2)))
    m = m.dilatar(False)
    _pinta(li, m, cols)
    for x, y in m.borde_interno(True).puntos():
        li.set(x, y, cols[3])
    _contorno(li, cols[3])
    return li.recortado()


def trapo(p):
    li, _ = _lienzo()
    cols = M(p['mat'])
    cx, cy = W // 2, H // 2
    m = Mascara(W, H)
    m.poligono([(cx - 8, cy - 4), (cx - 2, cy - 7), (cx + 7, cy - 3), (cx + 8, cy + 3),
                (cx + 1, cy + 6), (cx - 7, cy + 4)])
    for dx, dy in ((-8, -4), (7, -3), (1, 6)):             # deshilachado
        m.set(cx + dx, cy + dy, 0)
    _pinta(li, m, cols)
    for x, y in m.puntos():
        if (x + y * 2) % 6 == 0:
            li.set(x, y, cols[3])
    plie = cols[4]
    for i in range(-6, 7, 4):
        li.encima(cx + i, cy + (i % 3) - 1, plie)
        li.encima(cx + i + 1, cy + (i % 3), plie)
    _contorno(li, cols[3])
    return li.recortado()


def cristal_roto(p):
    li, _ = _lienzo()
    cols = M(p['mat'])
    cx, cy = W // 2, H // 2
    m = Mascara(W, H)
    m.poligono([(cx - 6, cy + 5), (cx - 3, cy - 6), (cx + 1, cy + 4)])
    m.poligono([(cx + 1, cy + 5), (cx + 5, cy - 3), (cx + 7, cy + 5)])
    m.poligono([(cx - 8, cy + 5), (cx - 7, cy + 1), (cx - 5, cy + 5)])
    _pinta(li, m, cols)
    for x, y in m.puntos():
        if x < cx - 4 and y < cy + 2:
            li.set(x, y, cols[0])
    li.contornear(li.mascara_opaca(), color=A.hex_rgb('#20303a'), diagonales=True)
    return li.recortado()


# ===========================================================================
# CATALOGO
# ===========================================================================

ITEMS = [
    # --- canas -----------------------------------------------------------
    ('canas', 'cana_de_madera', 'Cana de madera', cana, dict(mat='madera', largo=24)),
    ('canas', 'cana_de_bambu', 'Cana de bambu', cana, dict(mat='bambu', largo=26)),
    ('canas', 'cana_reforzada', 'Cana reforzada', cana, dict(mat='madera', metal='bronce', largo=26)),
    ('canas', 'cana_de_hierro', 'Cana de hierro', cana, dict(mat='hierro', largo=27)),
    ('canas', 'cana_de_plata', 'Cana de plata', cana, dict(mat='plata', metal='plata', largo=27)),
    ('canas', 'cana_dorada', 'Cana dorada', cana, dict(mat='oro', metal='oro', largo=28, brillo='#f7e08a')),
    ('canas', 'cana_abisal', 'Cana abisal', cana, dict(mat='abisal', metal='acero', largo=28, brillo='#7fe0d8')),
    ('canas', 'cana_espectral', 'Cana espectral', cana, dict(mat='espectral', metal='plata', largo=28,
                                                             brillo='#dffbf8')),
    # --- aparejo ----------------------------------------------------------
    ('aparejo', 'anzuelo_de_hueso', 'Anzuelo de hueso', anzuelo, dict(mat='hueso')),
    ('aparejo', 'anzuelo_de_cobre', 'Anzuelo de cobre', anzuelo, dict(mat='cobre')),
    ('aparejo', 'anzuelo_de_hierro', 'Anzuelo de hierro', anzuelo, dict(mat='hierro')),
    ('aparejo', 'anzuelo_de_acero', 'Anzuelo de acero', anzuelo, dict(mat='acero')),
    ('aparejo', 'anzuelo_de_plata', 'Anzuelo de plata', anzuelo, dict(mat='plata')),
    ('aparejo', 'anzuelo_dorado', 'Anzuelo dorado', anzuelo, dict(mat='oro')),
    ('aparejo', 'anzuelo_triple', 'Anzuelo triple', anzuelo, dict(mat='acero', puas=3)),
    ('aparejo', 'sedal_de_fibra', 'Sedal de fibra', sedal, dict(mat='cuerda')),
    ('aparejo', 'sedal_trenzado', 'Sedal trenzado', sedal, dict(mat='tela')),
    ('aparejo', 'sedal_de_seda', 'Sedal de seda', sedal, dict(mat='perla')),
    ('aparejo', 'sedal_de_acero', 'Sedal de acero', sedal, dict(mat='acero')),
    ('aparejo', 'corcho_de_pesca', 'Corcho de pesca', boya, dict(mat='madera', mat2='hueso')),
    ('aparejo', 'boya_roja', 'Boya roja', boya, dict(mat='coral', mat2='perla')),
    ('aparejo', 'boya_luminosa', 'Boya luminosa', boya, dict(mat='espectral', mat2='perla',
                                                             brillo='#dffbf8')),
    ('aparejo', 'red_de_mano', 'Red de mano', red_mano, dict(mat='cuerda')),
    ('aparejo', 'red_reforzada', 'Red reforzada', red_mano, dict(mat='tela', metal='acero')),
    ('aparejo', 'nasa_de_mimbre', 'Nasa de mimbre', nasa, dict(mat='bambu')),
    ('aparejo', 'nasa_de_hierro', 'Nasa de hierro', nasa, dict(mat='hierro')),
    ('aparejo', 'trampa_de_cangrejos', 'Trampa de cangrejos', trampa, dict(metal='hierro')),
    ('aparejo', 'arpon', 'Arpon', arpon, dict(mat='hierro', puntas=1)),
    ('aparejo', 'tridente', 'Tridente', arpon, dict(mat='acero', puntas=3)),
    ('aparejo', 'tridente_dorado', 'Tridente dorado', arpon, dict(mat='oro', puntas=3)),
    # --- cebos -------------------------------------------------------------
    ('cebos', 'cebo_gusano', 'Gusano', cebo, dict(tipo='gusano', mat='coral')),
    ('cebos', 'cebo_lombriz', 'Lombriz de tierra', cebo, dict(tipo='gusano', mat='oxido')),
    ('cebos', 'cebo_larva', 'Larva', cebo, dict(tipo='larva', mat='hueso')),
    ('cebos', 'cebo_mosca', 'Mosca artificial', cebo, dict(tipo='mosca', mat='abisal', mat2='coral')),
    ('cebos', 'cebo_saltamontes', 'Saltamontes', cebo, dict(tipo='saltamontes', mat='alga')),
    ('cebos', 'cebo_camaron', 'Camaron', cebo, dict(tipo='camaron', mat='coral')),
    ('cebos', 'cebo_pan', 'Bola de pan', cebo, dict(tipo='pan', mat='bambu')),
    ('cebos', 'cebo_masa', 'Masa de cebo', cebo, dict(tipo='masa', mat='papel')),
    ('cebos', 'cebo_hueva', 'Huevas', cebo, dict(tipo='hueva', mat='coral')),
    ('cebos', 'cebo_brillante', 'Cebo brillante', cebo, dict(tipo='brillante', mat='oro',
                                                             brillo='#f7e08a')),
    ('cebos', 'cebo_magico', 'Cebo magico', cebo, dict(tipo='magico', mat='espectral',
                                                       brillo='#b0e8e2')),
    ('cebos', 'cebo_de_hueso', 'Astilla de hueso', cebo, dict(tipo='hueso', mat='hueso')),
    # --- despiece ------------------------------------------------------------
    ('despiece', 'escama_plateada', 'Escama plateada', escamas, dict(mat='plata')),
    ('despiece', 'escama_dorada', 'Escama dorada', escamas, dict(mat='oro')),
    ('despiece', 'escama_iridiscente', 'Escama iridiscente', escamas, dict(mat='perla')),
    ('despiece', 'escama_abisal', 'Escama abisal', escamas, dict(mat='abisal')),
    ('despiece', 'aleta_de_pescado', 'Aleta', aleta, dict(mat='cristal')),
    ('despiece', 'aleta_de_tiburon', 'Aleta de tiburon', aleta, dict(mat='abisal')),
    ('despiece', 'filete_crudo', 'Filete crudo', filete, dict(mat='carne', piel='plata')),
    ('despiece', 'filete_de_salmon', 'Filete de salmon', filete, dict(mat='coral', piel='plata')),
    ('despiece', 'filete_blanco', 'Filete blanco', filete, dict(mat='hueso', piel='cristal')),
    ('despiece', 'pescado_seco', 'Pescado seco', pescado_seco, dict(mat='bambu')),
    ('despiece', 'pescado_salado', 'Pescado salado', pescado_seco, dict(mat='hueso', sal=True)),
    ('despiece', 'harina_de_pescado', 'Harina de pescado', saco, dict(mat='hueso')),
    ('despiece', 'aceite_de_pescado', 'Aceite de pescado', frasco_simple, dict(mat='oro')),
    ('despiece', 'esencia_de_escama', 'Esencia de escama', frasco_simple, dict(mat='hielo')),
    ('despiece', 'espina_de_pez', 'Espina de pez', espina, dict()),
    ('despiece', 'hueva_de_esturion', 'Huevas de esturion', cebo, dict(tipo='hueva', mat='abisal')),
    ('despiece', 'vejiga_natatoria', 'Vejiga natatoria', perla, dict(mat='tela', r=4.4)),
    # --- marinos ---------------------------------------------------------------
    ('marinos', 'perla', 'Perla', perla, dict(mat='perla')),
    ('marinos', 'perla_negra', 'Perla negra', perla, dict(mat='abisal')),
    ('marinos', 'perla_rosa', 'Perla rosa', perla, dict(mat='coral')),
    ('marinos', 'perla_gigante', 'Perla gigante', perla, dict(mat='perla', r=7.0)),
    ('marinos', 'nacar', 'Nacar', gema_bruta, dict(mat='perla')),
    ('marinos', 'ambar_marino', 'Ambar marino', gema_bruta, dict(mat='oro')),
    ('marinos', 'cristal_de_sal', 'Cristal de sal', gema_bruta, dict(mat='hielo')),
    ('marinos', 'coral_rojo', 'Coral rojo', coral, dict(mat='coral')),
    ('marinos', 'coral_blanco', 'Coral blanco', coral, dict(mat='hueso')),
    ('marinos', 'coral_negro', 'Coral negro', coral, dict(mat='abisal')),
    ('marinos', 'alga_verde', 'Alga verde', alga, dict(mat='alga', forma='lamina')),
    ('marinos', 'alga_parda', 'Alga parda', alga, dict(mat='oxido', forma='burbuja')),
    ('marinos', 'alga_roja', 'Alga roja', alga, dict(mat='coral', forma='filamento')),
    ('marinos', 'sal_marina', 'Sal marina', monton, dict(mat='perla')),
    ('marinos', 'arena_fina', 'Arena fina', monton, dict(mat='bambu')),
    ('marinos', 'esponja_de_mar', 'Esponja de mar', esponja, dict(mat='oxido')),
    ('marinos', 'concha_vacia', 'Concha vacia', concha_vacia, dict(mat='tela')),
    ('marinos', 'concha_de_nacar', 'Concha de nacar', concha_vacia, dict(mat='perla')),
    # --- tesoros -----------------------------------------------------------------
    ('tesoros', 'cofre_hundido', 'Cofre hundido', cofre, dict(metal='oro', algas=True)),
    ('tesoros', 'cofre_de_hierro', 'Cofre de hierro', cofre, dict(metal='hierro')),
    ('tesoros', 'doblon', 'Doblon', moneda, dict(mat='oro')),
    ('tesoros', 'moneda_antigua', 'Moneda antigua', moneda, dict(mat='bronce')),
    ('tesoros', 'pila_de_doblones', 'Pila de doblones', moneda, dict(mat='oro', pila=True)),
    ('tesoros', 'anfora', 'Anfora', anfora, dict(mat='oxido')),
    ('tesoros', 'botella_con_mensaje', 'Botella con mensaje', botella_mensaje, dict()),
    ('tesoros', 'brujula_oxidada', 'Brujula oxidada', brujula, dict(mat='bronce')),
    ('tesoros', 'mapa_nautico', 'Mapa nautico', mapa, dict()),
    ('tesoros', 'llave_oxidada', 'Llave oxidada', llave, dict(mat='oxido')),
    ('tesoros', 'llave_de_plata', 'Llave de plata', llave, dict(mat='plata')),
    ('tesoros', 'anillo_perdido', 'Anillo perdido', anillo, dict(mat='oro', gema='coral')),
    ('tesoros', 'reliquia_hundida', 'Reliquia hundida', reliquia, dict(mat='bronce', gema='hielo',
                                                                      algas=True)),
    # --- basura --------------------------------------------------------------------
    ('basura', 'bota_vieja', 'Bota vieja', bota, dict(mat='oxido')),
    ('basura', 'lata_oxidada', 'Lata oxidada', lata, dict(mat='hierro')),
    ('basura', 'rama_empapada', 'Rama empapada', rama, dict(mat='madera', mojada=True)),
    ('basura', 'alga_enredada', 'Alga enredada', enredo, dict(mat='alga')),
    ('basura', 'red_rota', 'Red rota', enredo, dict(mat='cuerda')),
    ('basura', 'trapo_mojado', 'Trapo mojado', trapo, dict(mat='tela')),
    ('basura', 'cristal_roto', 'Cristal roto', cristal_roto, dict(mat='cristal')),
    ('basura', 'esqueleto_de_pez', 'Esqueleto de pez', espina, dict(mat='oxido', roto=True)),
]


def main():
    hoja = '--hoja' in sys.argv
    cat = []
    rutas = {}
    for carpeta, ident, nombre, fn, args in ITEMS:
        args = dict(args)
        args['id'] = ident
        li = fn(args)
        ruta = os.path.join(DESTINO, carpeta, '%s.png' % ident)
        li.guardar(ruta)
        rutas.setdefault(carpeta, []).append(ruta)
        cat.append({'id': ident, 'nombre': nombre, 'categoria': carpeta,
                    'ancho': li.w, 'alto': li.h,
                    'maxStack': 20 if carpeta in ('cebos', 'despiece', 'marinos', 'basura') else 5,
                    'ruta': '%s/%s/%s.png' % (WEB, carpeta, ident),
                    'clave_phaser': ident})
    with io.open(os.path.join(DESTINO, 'pesca.json'), 'w', encoding='utf-8') as fh:
        fh.write(json.dumps({'pack': 'newpro/pesca', 'version': 1, 'base_web': WEB,
                             'total': len(cat), 'items': cat}, ensure_ascii=False, indent=1))
    print('%d objetos de pesca escritos en %s' % (len(cat), DESTINO))
    if hoja:
        d = os.path.join(os.environ.get('TEMP', '.'), 'gf_hojas')
        if not os.path.isdir(d):
            os.makedirs(d)
        todas = []
        for c in sorted(rutas):
            todas += rutas[c]
        A.hoja_contacto(todas, columnas=10, escala=6).save(os.path.join(d, 'pesca.png'))
        print('hoja en', d)


if __name__ == '__main__':
    main()
