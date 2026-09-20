#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
SIEMBRAS — 5 cultivos nuevos para `Game/newpro/plantas/`
=============================================================================

    planta_arroz  planta_ajo  planta_guisante  planta_col  planta_calabacin

Cada uno con los diez archivos de la convencion del pack, la misma que usan los
doce cultivos del lote 1 y los del propio juego:

    1.png … 5.png     5 etapas de crecimiento, 51x53 OPACAS   (la 5 es cosechable)
    6.png             la misma planta madura, pero MUERTA
    item_<x>_bueno    la cosecha en buen estado
    item_<x>_podrido  la cosecha pasada
    item_planta_<x>   el brote (estado "corta")
    item_semilla_<x>  la bolsa de semillas, 16x20

LA BALDOSA ESTA COPIADA, NO INVENTADA
---------------------------------------------------------------------------
Medida pixel a pixel en `planta_lechuga/1.png`: 51x53 opaca, marco de 1 px
`#4e2c16`, y la tierra cambia con la etapa —igual que las claves que carga
`GameScene.js`:

    etapa 1      seca      #915c3e
    etapas 2-5   mojada    #6d462e
    etapa 6      reseca    #8a6248

Una parcela de estas puesta al lado de una lechuga del pack en la misma etapa
tiene exactamente el mismo suelo.

LAS HOJAS NO SE PONEN A OJO
---------------------------------------------------------------------------
Cada hoja NACE EN UN NUDO del tallo y va unida a el por su peciolo, crece con
su propio angulo hacia arriba y hacia fuera, y lleva el nervio central en el
eje de la hoja —no cruzado—. Los nudos de abajo llevan hojas mas grandes y mas
abiertas y los de arriba mas pequenas y mas verticales, que es la proporcion
de una planta de verdad. Las hojas contiguas alternan dos verdes para que al
superponerse se distingan en vez de fundirse en un bloque.

LA ETAPA 6 NO ES UN FILTRO SEPIA
---------------------------------------------------------------------------
La planta se vuelve a dibujar entera, con la geometria cambiada: las hojas
cuelgan, se encogen, se doblan, se les muerde el borde y el tallo se tuerce. Y
**conserva su color**: se le aplica la regla de podredumbre medida en las
parejas bueno/podrido del juego (el tono se acerca a oliva solo a medio camino,
la saturacion casi no se toca y el brillo baja desigual), no un marron.

USO
---------------------------------------------------------------------------
    python tools/generar-siembras.py
    python tools/generar-siembras.py --hoja
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
DESTINO = os.path.join(RAIZ, 'Game', 'newpro', 'plantas')
WEB = '/Game/newpro/plantas'

TW, TH = 51, 53
SUELO = TH - 6

# TODO ESTO ESTA MEDIDO EN planta_lechuga, NO ELEGIDO A OJO.
# La baldosa lleva DOS marcos —el de fuera #452d14 y el de dentro #4e2c16—,
# la tierra es lisa y encima van unas pocas motas de uno o dos pixeles. La
# primera version salpicaba ruido en el 18 % de los pixeles y dibujaba surcos
# en filas: se veia como pana, no como tierra.
MARCO_FUERA = A.hex_rgb('#452d14')
MARCO_DENTRO = A.hex_rgb('#4e2c16')
TIERRAS = {
    'seca':   (A.hex_rgb('#915c3e'), A.hex_rgb('#5e3826'), A.hex_rgb('#6d462e')),
    'mojada': (A.hex_rgb('#6d462e'), A.hex_rgb('#593524'), A.hex_rgb('#452d14')),
    'muerta': (A.hex_rgb('#8a6248'), A.hex_rgb('#6b4a34'), A.hex_rgb('#5a3d2a')),
}

# La escalera de verdes del pack: mismo tono, seis peldanos de brillo.
#   #a2e355 #8cc44a #7cba3c #6faa32 #588828 #45781c   contorno #1e3d10
ESCALERA = [(0.63, 0.89), (0.62, 0.77), (0.68, 0.73),
            (0.71, 0.67), (0.71, 0.53), (0.77, 0.47)]
VEGETAL = A.hex_rgb('#1e3d10')

BOLSA = [A.hex_rgb(c) for c in ('#8f572f', '#824a24', '#62391f', '#522d19')]
BOLSA_CONTORNO = A.hex_rgb('#2c1a10')


def rampa_hoja(tono, sat=1.0):
    """Los seis verdes del pack trasladados a otro tono."""
    return [A.de_hsv(tono, s * sat, v) for s, v in ESCALERA]


def contorno_de_planta(muerta):
    return VEGETAL if not muerta else A.pudrir(VEGETAL, 0.2)


# ===========================================================================
# LA BALDOSA
# ===========================================================================

def baldosa(etapa):
    li = Lienzo(TW, TH)
    clave = 'seca' if etapa == 1 else ('muerta' if etapa == 6 else 'mojada')
    base, mota1, mota2 = TIERRAS[clave]
    for y in range(TH):
        for x in range(TW):
            li.set(x, y, base)
    # las motas: grupos de 1 a 3 pixeles, deterministas y escasos (~6 %)
    for i in range(46):
        h = ((i * 73856093) ^ (etapa * 19349663)) & 0xFFFFFF
        x = 3 + (h % (TW - 6))
        y = 3 + ((h >> 8) % (TH - 6))
        largo = 1 + ((h >> 16) % 3)
        col = mota1 if i % 3 else mota2
        for k in range(largo):
            li.set(x + k, y, col)
    if etapa == 6:
        for k in range(3):
            x, y = 9 + k * 14, 8
            for i in range(24):
                li.set(x + int(math.sin(i * 0.7 + k) * 2), y + i, mota2)
    for x in range(TW):
        li.set(x, 0, MARCO_FUERA)
        li.set(x, TH - 1, MARCO_FUERA)
        li.set(x, 1, MARCO_DENTRO)
        li.set(x, TH - 2, MARCO_DENTRO)
    for y in range(TH):
        li.set(0, y, MARCO_FUERA)
        li.set(TW - 1, y, MARCO_FUERA)
        li.set(1, y, MARCO_DENTRO)
        li.set(TW - 2, y, MARCO_DENTRO)
    return li


# ===========================================================================
# HOJAS: CADA UNA CON SU PROPIO CONTORNO
# ===========================================================================
#
# Esta es LA diferencia con la primera version. Antes se juntaban todas las
# hojas en una mascara y se contorneaba el conjunto: salia una mancha verde con
# una linea alrededor. En los cultivos del pack (mirese planta_lechuga/5.png)
# cada hoja lleva SU linea #1e3d10 y las hojas se pisan unas a otras, y eso es
# lo unico que las hace distinguirse. Asi que se dibujan de atras adelante y
# cada una se contornea encima de la anterior.

def hoja_mascara(x0, y0, ang, largo, ancho, dentada=False, mordida=0.0, rnd=None):
    """Una hoja con su peciolo. Devuelve (mascara, eje) para poner el nervio."""
    m = Mascara(TW, TH)
    dx, dy = math.cos(ang), math.sin(ang)
    px, py = -dy, dx
    pec = max(1.0, largo * 0.20)
    bx, by = x0 + dx * pec, y0 + dy * pec
    eje = []
    n = max(2, int(largo - pec))
    for i in range(n + 1):
        t = i / float(n)
        an = ancho * (math.sin(math.pi * min(1.0, t * 0.90 + 0.10)) ** 0.62)
        if dentada:
            an *= 1.0 + 0.20 * math.sin(t * 9.0)
        if mordida and rnd is not None:
            an *= 1.0 - mordida * (0.5 + 0.5 * math.sin(t * 6 + rnd.random() * 6))
        cx, cy = bx + dx * i, by + dy * i
        eje.append((cx, cy, an))
        for k in range(int(-an), int(an) + 1):
            m.set(cx + px * k, cy + py * k)
    for i in range(int(pec) + 1):
        m.set(x0 + dx * i, y0 + dy * i)
    return m, eje


def hoja_ancha(cx, cy, rx, ry, dentada=True, giro=0.0, mordida=0.0, rnd=None):
    """
    Una hoja ANCHA, mas ancha que larga, con el borde ondulado y el nervio en
    abanico. Es la forma que de verdad tienen las hojas de los cultivos del
    pack: si se mira `planta_lechuga/5.png`, la mata son cinco lobulos redondos
    repartidos por la base, no cinco tiras largas saliendo de un punto. Con
    tiras salia una arana verde.
    """
    m = Mascara(TW, TH)
    for i in range(-int(rx) - 2, int(rx) + 3):
        u = i / float(rx)
        if abs(u) > 1.0:
            continue
        h = math.sqrt(max(0.0, 1.0 - u * u))
        if dentada:
            h *= 1.0 + 0.16 * math.sin(u * 7.5 + giro * 3)
        if mordida and rnd is not None:
            h *= 1.0 - mordida * (0.5 + 0.5 * math.sin(u * 5 + rnd.random() * 6))
        x = cx + i
        m.columna(x, cy - ry * h + giro * i * 0.30, cy + ry * 0.42 * h + giro * i * 0.30)
    # Los nervios de una hoja ancha salen EN ABANICO desde el arranque, tres o
    # cinco radios. Un nervio por columna —que es lo que devolvia la primera
    # version— pinta un peine vertical y la hoja acaba pareciendo una persiana.
    nervios = []
    for d in (-0.72, -0.36, 0.0, 0.36, 0.72):
        px = cx + rx * d * 0.82
        py = cy - ry * math.sqrt(max(0.0, 1.0 - d * d)) * 0.72 + giro * (rx * d) * 0.30
        nervios.append((cx, cy + ry * 0.20, px, py))
    return m, nervios


def tubo(x0, y0, ang, largo, grosor, curva=0.0):
    """Hoja tubular (ajo) o cana (arroz): no se ensancha, se curva."""
    m = Mascara(TW, TH)
    eje = []
    for i in range(int(largo)):
        t = i / float(max(1, largo))
        a = ang + curva * t * t
        cx = x0 + math.cos(a) * i
        cy = y0 + math.sin(a) * i
        r = grosor * (1.0 - 0.45 * t)
        m.disco(cx, cy, r)
        eje.append((cx, cy, r))
    return m, eje


def pieza(li, m, tonos, idx, muerta=False, eje=None, veta=True, nervios=None):
    """Pinta UNA hoja: primero su contorno, luego el relleno, luego el nervio."""
    caja = m.caja()
    if caja is None:
        return
    cont = contorno_de_planta(muerta)
    for x, y in m.borde(True).puntos():
        li.set(x, y, cont)
    x0, y0, x1, y1 = caja
    al = max(1, y1 - y0)
    for x, y in m.puntos():
        f = (y - y0) / float(al)
        j = idx if f < 0.42 else (idx + 1 if f < 0.78 else idx + 2)
        c = tonos[min(5, j)]
        if muerta:
            c = A.pudrir(c, ((x * 3 + y * 5) % 5) / 4.0)
        li.set(x, y, c)
    cv = tonos[min(5, idx + 3)]
    if muerta:
        cv = A.pudrir(cv, 0.3)
    if nervios and veta:
        for x0n, y0n, x1n, y1n in nervios:
            n = max(2, int(math.hypot(x1n - x0n, y1n - y0n)))
            for i in range(n + 1):
                t = i / float(n)
                px = x0n + (x1n - x0n) * t
                py = y0n + (y1n - y0n) * t
                if m.get(px, py) and not m.borde_interno(True, False).get(px, py):
                    li.encima(px, py, cv)
    elif eje and veta:
        for i, (cx, cy, an) in enumerate(eje):
            if an > 1.25 and i % 2 == 0:
                li.encima(cx, cy, cv)


def bulto(li, m, base, muerta=False, aros=0):
    """Un fruto, un bulbo o un cogollo: masa con volumen y contorno propio."""
    caja = m.caja()
    if caja is None:
        return
    cont = A.contorno_de(base) if not muerta else A.pudrir(A.contorno_de(base), .2)
    for x, y in m.borde(True).puntos():
        li.set(x, y, cont)
    x0, y0, x1, y1 = caja
    an, al = max(1, x1 - x0), max(1, y1 - y0)
    r = A.rampa(base, 5)
    if muerta:
        r = [A.pudrir(c, ((i * 7) % 5) / 4.0) for i, c in enumerate(r)]
    for x, y in m.puntos():
        f = ((x - x0) / float(an)) * 0.38 + ((y - y0) / float(al)) * 0.62
        li.set(x, y, r[0] if f < 0.22 else (r[1] if f < 0.48 else
                                            (r[2] if f < 0.76 else r[3])))
    for k in range(aros):
        rr = 1.0 - (k + 1) * 0.26
        aro = Mascara(TW, TH).elipse((x0 + x1) / 2.0, (y0 + y1) / 2.0,
                                     an / 2.0 * rr, al / 2.0 * rr)
        for x, y in aro.borde_interno(False).puntos():
            if m.get(x, y):
                li.encima(x, y, r[3])


def moho(li, m, rnd, n=6):
    pts = list(m.puntos())
    if not pts:
        return
    for _ in range(n):
        x, y = pts[rnd.randrange(len(pts))]
        for dx in range(-1, 2):
            for dy in range(-1, 2):
                if abs(dx) + abs(dy) <= 1:
                    c = li.get(x + dx, y + dy)
                    if c[3]:
                        li.set(x + dx, y + dy, ajusta(c, dv=0.6, ds=1.2))


ESCALA = [0.30, 0.50, 0.70, 0.88, 1.0]


# ===========================================================================
# LOS CINCO CULTIVOS
# ===========================================================================

def _arroz(li, etapa, muerta, rnd, tonos, grano):
    k = ESCALA[min(4, etapa - 1)]
    n = 3 + min(4, etapa)
    for i in range(n):
        t = i / float(max(1, n - 1))
        bx = 11 + t * 29
        largo = (20 + 12 * math.sin(i * 1.7)) * k
        ang = -math.pi / 2 + (t - 0.5) * 0.55
        if muerta:
            ang += (0.75 if i % 2 else -0.75)
            largo *= 0.85
        m, eje = tubo(bx, SUELO, ang, largo, 2.6 * (0.7 + 0.3 * k),
                      curva=(0.42 if i % 2 else -0.42) * (2.0 if muerta else 1.0))
        pieza(li, m, tonos, 1 + (i % 3), muerta, eje)
        if etapa >= 4 and eje:
            ex, ey, _ = eje[-1]
            g = Mascara(TW, TH)
            for j in range(8):
                g.disco(ex + j * 0.55 + (j * 0.5 if muerta else 0), ey + j * 1.5, 1.9)
            bulto(li, g, grano, muerta)


def _ajo(li, etapa, muerta, rnd, tonos, bulbo):
    k = ESCALA[min(4, etapa - 1)]
    n = 3 + min(4, etapa)
    for i in range(n):
        s2 = 1 if i % 2 else -1
        ang = -math.pi / 2 + (i - (n - 1) / 2.0) * 0.34
        if muerta:
            ang += s2 * 0.8
        m, eje = tubo(TW / 2 + (i - (n - 1) / 2.0) * 2.2, SUELO - 2, ang,
                      (24 + 7 * math.cos(i * 1.4)) * k, 2.8 * (0.75 + 0.25 * k),
                      curva=s2 * (0.42 if not muerta else 1.2))
        pieza(li, m, tonos, 1 + (i % 3), muerta, eje)
    if etapa >= 3:
        r = (4.5 + etapa * 0.9) * (0.8 + 0.2 * k)
        b = Mascara(TW, TH).elipse(TW / 2, SUELO, r, r * 0.82)
        bulto(li, b, bulbo, muerta)
        cont = A.contorno_de(bulbo)
        for kk in (-2, 0, 2):
            for j in range(int(r * 1.3)):
                li.encima(TW / 2 + kk * 1.6 + kk * j * 0.06, SUELO - r * 0.75 + j, cont)


def _guisante(li, etapa, muerta, rnd, tonos, vaina):
    k = ESCALA[min(4, etapa - 1)]
    alto = 32 * k
    cx = TW / 2
    # la guia: un tallo que sube serpenteando
    tallo_m = Mascara(TW, TH)
    for j in range(int(alto)):
        t = j / max(1.0, alto)
        tallo_m.disco(cx + math.sin(t * 3.2) * 4.0 + (t * 10 if muerta else 0),
                      SUELO - j, 1.3)
    pieza(li, tallo_m, tonos, 3, muerta, None)
    # POCOS foliolos y GRANDES. Con seis pequenos por lado salia una marana de
    # manchas y no se distinguia una hoja de otra.
    nudos = [(0.18, 8.0, 6.2), (0.48, 7.2, 5.6), (0.78, 6.0, 4.8)]
    for i, (ft, rx, ry) in enumerate(nudos):
        j = alto * ft
        if j > alto:
            continue
        t = j / max(1.0, alto)
        x = cx + math.sin(t * 3.2) * 4.0 + (t * 10 if muerta else 0)
        for s2 in (-1, 1):
            dx = s2 * (rx + 1.5) * k
            dy = (3.0 if muerta else 0)
            pe = Mascara(TW, TH)
            pe.linea(x, SUELO - j, x + dx * 0.55, SUELO - j + dy, 2)
            pieza(li, pe, tonos, 4, muerta, None)
            m, nerv = hoja_ancha(x + dx, SUELO - j + dy, rx * k, ry * k,
                                 False, s2 * 0.20, 0.35 if muerta else 0.0, rnd)
            pieza(li, m, tonos, 1 + (i % 3), muerta, nervios=nerv)
    if etapa >= 4:
        for c, (ft, dx) in enumerate(((0.34, 8), (0.64, -9))):
            if c > etapa - 4:
                break
            j = alto * ft
            x = cx + math.sin(j / max(1.0, alto) * 3.2) * 4.0
            v = Mascara(TW, TH)
            ang = 1.15 + (0.35 if muerta else 0)
            for i in range(13):
                t = i / 12.0
                v.disco(x + dx * k + math.cos(ang) * i * 0.9,
                        SUELO - j + math.sin(ang) * i * 0.9,
                        2.4 * math.sin(math.pi * (0.14 + 0.72 * t)) + 1.0)
            bulto(li, v, vaina, muerta)


def _col(li, etapa, muerta, rnd, tonos, cogollo):
    tonos_cogollo = [A.ajusta(c, dv=1.10, ds=0.80) for c in tonos]
    k = ESCALA[min(4, etapa - 1)]
    base = SUELO - 1
    # los lobulos van repartidos a lo ancho de la baldosa, no todos saliendo
    # del mismo punto: es lo que hace que se lean como hojas distintas
    lobulos = [(-15, 2, 9.0, 7.5, -0.30, 3), (15, 2, 9.0, 7.5, 0.30, 3),
               (-8, -2, 8.5, 8.0, -0.16, 1), (8, -2, 8.5, 8.0, 0.16, 2),
               (0, -5, 8.0, 8.5, 0.0, 2)]
    for i, (dx, dy, rx, ry, giro, idx) in enumerate(lobulos):
        g = giro + ((0.5 if i % 2 else -0.5) if muerta else 0)
        m, nerv = hoja_ancha(TW / 2 + dx * k, base + dy * k, rx * k, ry * k,
                             True, g, 0.40 if muerta else 0.0, rnd)
        pieza(li, m, tonos, idx, muerta, nervios=nerv)
    if etapa >= 3:
        # El cogollo son HOJAS ENVOLVIENDOSE, tres capas cada vez mas pequenas
        # y mas claras, cada una con su contorno. Un disco con anillos concen-
        # tricos parecia el corte de un tronco.
        r = (5.0 + etapa * 1.15) * (0.85 + 0.15 * k)
        cy = base - 6 * k - r * 0.30
        tc = A.hex_rgb('#000000')
        for capa, (fr, idx) in enumerate(((1.0, 2), (0.72, 1), (0.44, 0))):
            m, nerv = hoja_ancha(TW / 2, cy + r * (1 - fr) * 0.55, r * fr,
                                 r * 0.92 * fr, False, 0.0,
                                 0.30 if muerta else 0.0, rnd)
            pieza(li, m, tonos_cogollo, idx, muerta, nervios=nerv if capa == 0 else None)


def _calabacin(li, etapa, muerta, rnd, tonos, fruto):
    k = ESCALA[min(4, etapa - 1)]
    base = SUELO - 1
    lobulos = [(0, -8, 10.5, 9.0, 0.0, 3),
               (-14, -1, 10.0, 8.5, -0.28, 1), (14, -1, 10.0, 8.5, 0.28, 2),
               (-7, 3, 8.5, 7.0, -0.14, 2), (7, 3, 8.5, 7.0, 0.14, 1)]
    for i, (dx, dy, rx, ry, giro, idx) in enumerate(lobulos):
        g = giro + ((0.6 if i % 2 else -0.6) if muerta else 0)
        m, nerv = hoja_ancha(TW / 2 + dx * k, base + dy * k, rx * k, ry * k,
                             True, g, 0.45 if muerta else 0.0, rnd)
        pieza(li, m, tonos, idx, muerta, nervios=nerv)
        # el peciolo, para que la hoja no flote
        pe = Mascara(TW, TH)
        pe.linea(TW / 2, base + 1, TW / 2 + dx * k, base + dy * k + ry * k * 0.3, 2)
        pieza(li, pe, tonos, 4, muerta, None)
    if etapa >= 4:
        f = Mascara(TW, TH)
        ang = 0.26 + (0.42 if muerta else 0)
        largo = 18 if not muerta else 14
        for i in range(largo):
            t = i / float(largo)
            f.disco(TW / 2 - 14 + math.cos(ang) * i * 1.45,
                    base - 1 + math.sin(ang) * i * 1.45,
                    3.2 * math.sin(math.pi * (0.18 + 0.72 * t)) + 1.4)
        bulto(li, f, fruto, muerta)


CULTIVOS = {
    # `tono` es el matiz del verde en HSV; la escalera de brillo es la misma
    # para los cinco, la del pack. Asi el arroz tira a amarillo y la col a
    # azulado sin salirse del arte del juego.
    'arroz': dict(nombre='Arroz', fn=_arroz, tono=0.190, sat=1.00,
                  extra='#e0c84a', cosecha='grano', articulo='o'),
    'ajo': dict(nombre='Ajo', fn=_ajo, tono=0.262, sat=0.92,
                extra='#f0ead8', cosecha='bulbo', articulo='o'),
    'guisante': dict(nombre='Guisante', fn=_guisante, tono=0.238, sat=1.00,
                     extra='#8cc44a', cosecha='vaina', articulo='o'),
    'col': dict(nombre='Col', fn=_col, tono=0.278, sat=0.88,
                extra='#a8d06a', cosecha='cogollo', articulo='a'),
    'calabacin': dict(nombre='Calabacin', fn=_calabacin, tono=0.300, sat=1.00,
                      extra='#3f7a2a', cosecha='fruto', articulo='o'),
}


# ===========================================================================
# ICONOS DE INVENTARIO
# ===========================================================================

IW = IH = 30
ICX, ICY = IW // 2, IH // 2


def _icono_cosecha(clave, malo):
    d = CULTIVOS[clave]
    rnd = rng_de('cosecha', clave, malo)
    li = Lienzo(IW, IH)
    tonos = rampa_hoja(d['tono'], d['sat'])
    extra = A.hex_rgb(d['extra'])
    m = Mascara(IW, IH)
    if d['cosecha'] == 'grano':
        for i in range(3):
            for j in range(9):
                m.disco(ICX - 6 + i * 6 + j * 0.4, ICY - 8 + j * 1.9, 1.6)
        base = extra
    elif d['cosecha'] == 'bulbo':
        m.elipse(ICX, ICY + 3, 8, 7)
        for j in range(7):
            m.set(ICX + int(math.sin(j) * 2), ICY - 5 - j)
            m.set(ICX + 1 + int(math.sin(j) * 2), ICY - 5 - j)
        base = extra
    elif d['cosecha'] == 'vaina':
        for i in range(18):
            t = i / 17.0
            m.disco(ICX - 9 + i * 1.1, ICY + math.sin(t * 3.0) * 3,
                    3.0 * math.sin(math.pi * (0.15 + 0.7 * t)) + 1.0)
        base = extra
    elif d['cosecha'] == 'cogollo':
        m.elipse(ICX, ICY + 1, 10, 9)
        base = extra
    else:
        for i in range(20):
            t = i / 19.0
            m.disco(ICX - 10 + i * 1.05, ICY - 4 + i * 0.42,
                    3.2 * math.sin(math.pi * (0.18 + 0.72 * t)) + 1.2)
        base = extra
    if malo:
        base = A.pudrir(base, 0.3)
    r = A.rampa(base, 5)
    caja = m.caja()
    for x, y in m.puntos():
        f = ((x - caja[0]) / float(max(1, caja[2] - caja[0]))) * 0.4 + \
            ((y - caja[1]) / float(max(1, caja[3] - caja[1]))) * 0.6
        li.set(x, y, r[0] if f < 0.25 else (r[1] if f < 0.5 else (r[2] if f < 0.78 else r[3])))
    li.contornear(m, color=A.contorno_de(base), diagonales=True)
    if d['cosecha'] == 'cogollo':
        v = ajusta(base, dv=0.78)
        for k in range(3):
            aro = Mascara(IW, IH).elipse(ICX, ICY + 1, 8 - k * 2.6, 7 - k * 2.4)
            for x, y in aro.borde_interno(False).puntos():
                li.encima(x, y, v)
    if d['cosecha'] == 'vaina':
        v = ajusta(base, dv=0.8)
        for i in range(3):
            li.encima(ICX - 4 + i * 4, ICY + int(math.sin((i + 3) / 5.0 * 3.0) * 3), v)
    if malo:
        moho(li, m, rnd, 7)
    return li.recortado()


# Cada brote con su forma: numero de hojas, apertura, largo, ancho y si el
# borde va dentado. Con la misma plantilla para los cinco, los cinco brotes
# salian identicos y en el inventario no habia forma de saber cual era cual.
BROTES = {
    'arroz':     dict(n=4, abre=0.34, largo=12, ancho=1.3, dentada=False),
    'ajo':       dict(n=3, abre=0.46, largo=11, ancho=1.6, dentada=False),
    'guisante':  dict(n=3, abre=0.85, largo=8, ancho=3.0, dentada=False),
    'col':       dict(n=5, abre=0.62, largo=8, ancho=3.4, dentada=True),
    'calabacin': dict(n=3, abre=0.72, largo=10, ancho=4.2, dentada=True),
}


def _icono_brote(clave):
    d = CULTIVOS[clave]
    b = BROTES[clave]
    li = Lienzo(IW, IH)
    tonos = rampa_hoja(d['tono'], d['sat'])
    n = b['n']
    tal = Mascara(IW, IH)
    for j in range(4):
        tal.disco(ICX, ICY + 8 + j, 1.0)
    pieza(li, tal, tonos, 3, False, None)
    for i in range(n):
        ang = -math.pi / 2 + (i - (n - 1) / 2.0) * b['abre']
        lg = b['largo'] * (1.0 - 0.10 * abs(i - (n - 1) / 2.0))
        m, eje = _hoja_icono(ICX, ICY + 8, ang, lg, b['ancho'], b['dentada'])
        pieza(li, m, tonos, 1 + (i % 3), False, eje)
    return li.recortado()


def _hoja_icono(x0, y0, ang, largo, ancho, dentada):
    """Igual que `hoja_mascara` pero en el lienzo pequeno de los iconos."""
    m = Mascara(IW, IH)
    dx, dy = math.cos(ang), math.sin(ang)
    px, py = -dy, dx
    pec = max(1.0, largo * 0.20)
    bx, by = x0 + dx * pec, y0 + dy * pec
    eje = []
    n = max(2, int(largo - pec))
    for i in range(n + 1):
        t = i / float(n)
        an = ancho * (math.sin(math.pi * min(1.0, t * 0.90 + 0.10)) ** 0.62)
        if dentada:
            an *= 1.0 + 0.20 * math.sin(t * 9.0)
        cx, cy = bx + dx * i, by + dy * i
        eje.append((cx, cy, an))
        for k in range(int(-an), int(an) + 1):
            m.set(cx + px * k, cy + py * k)
    for i in range(int(pec) + 1):
        m.set(x0 + dx * i, y0 + dy * i)
    return m, eje


def _icono_semilla(clave):
    """Calcada de la bolsa del juego: 16x20, mismo nudo y misma arpillera."""
    d = CULTIVOS[clave]
    li = Lienzo(16, 20)
    m = Mascara(16, 20)
    f = perfil([(0, .38), (.22, .44), (.42, .92), (1, 1.0)])
    for i in range(17):
        t = i / 16.0
        an = f(t) * 6.6
        m.fila(3 + i, 8 - an, 7 + an)
    for x, y in m.puntos():
        fy = (y - 3) / 17.0
        fx = (x - 1) / 14.0
        i = 0 if (fx < 0.35 and fy < 0.55) else (1 if fy < 0.62 else 2)
        li.set(x, y, BOLSA[i])
    for x, y in m.borde(True).puntos():
        li.set(x, y, BOLSA_CONTORNO)
    for x in range(4, 12):
        li.encima(x, 5, BOLSA[3])
        li.encima(x, 6, BOLSA[2])
    for x in range(5, 11):
        li.encima(x, 3, BOLSA_CONTORNO)
    li.set(6, 2, BOLSA[1]); li.set(9, 2, BOLSA[1])
    li.set(7, 1, BOLSA[0]); li.set(8, 1, BOLSA[0])
    # el icono del frente
    c = A.hex_rgb(d['extra'])
    if d['cosecha'] == 'grano':
        for j in range(5):
            li.encima(8, 10 + j, c)
            li.encima(7 + (j % 2), 10 + j, ajusta(c, dv=0.85))
    elif d['cosecha'] == 'bulbo':
        m2 = Mascara(16, 20).elipse(8, 13, 3.2, 3.0)
        for x, y in m2.puntos():
            li.encima(x, y, c)
        li.encima(8, 9, ajusta(c, dv=0.7))
    elif d['cosecha'] == 'vaina':
        for i in range(9):
            li.encima(4 + i, 13 + int(math.sin(i / 8.0 * 3.0) * 1.6), c)
    elif d['cosecha'] == 'cogollo':
        m2 = Mascara(16, 20).elipse(8, 13, 3.6, 3.2)
        for x, y in m2.puntos():
            li.encima(x, y, c)
        for x, y in Mascara(16, 20).elipse(8, 13, 1.8, 1.6).borde_interno(False).puntos():
            li.encima(x, y, ajusta(c, dv=0.8))
    else:
        for i in range(9):
            li.encima(4 + i, 12 + i // 3, c)
            li.encima(4 + i, 13 + i // 3, ajusta(c, dv=0.82))
    return li


# ===========================================================================

def main():
    hoja_ = '--hoja' in sys.argv
    cat = []
    rutas = []
    for clave, d in CULTIVOS.items():
        carpeta = os.path.join(DESTINO, 'planta_%s' % clave)
        tonos = rampa_hoja(d['tono'], d['sat'])
        extra = A.hex_rgb(d['extra'])
        for etapa in range(1, 7):
            rnd = rng_de('siembra', clave, etapa)
            li = baldosa(etapa)
            d['fn'](li, min(5, etapa), etapa == 6, rnd, tonos, extra)
            ruta = os.path.join(carpeta, '%d.png' % etapa)
            li.guardar(ruta)
            rutas.append(ruta)
        art = d['articulo']
        pares = [('item_%s_buen%s' % (clave, art), _icono_cosecha(clave, False)),
                 ('item_%s_podrid%s' % (clave, art), _icono_cosecha(clave, True)),
                 ('item_planta_%s' % clave, _icono_brote(clave)),
                 ('item_semilla_%s' % clave, _icono_semilla(clave))]
        for nombre, li in pares:
            ruta = os.path.join(carpeta, '%s.png' % nombre)
            li.guardar(ruta)
            rutas.append(ruta)
        cat.append({
            'id': clave, 'nombre': d['nombre'],
            'carpeta': '%s/planta_%s' % (WEB, clave),
            'etapas': ['%s/planta_%s/%d.png' % (WEB, clave, i) for i in range(1, 7)],
            'items': dict((n, '%s/planta_%s/%s.png' % (WEB, clave, n)) for n, _ in pares),
            'claves_phaser': {
                'tierra_seca_plant_%s' % clave: '1.png',
                'tierra_mojada_plant_%s' % clave: '2.png',
                'tierra_mojada_plant2_%s' % clave: '3.png',
                'tierra_mojada_plant3_%s' % clave: '4.png',
                'tierra_muerta_plant4_%s' % clave: '5.png',
                'planta_seca_%s' % clave: '6.png',
            },
            'tam_baldosa': [TW, TH],
        })
        print('  planta_%-12s 10 archivos' % clave)
    with io.open(os.path.join(DESTINO, 'siembras.json'), 'w', encoding='utf-8') as fh:
        fh.write(json.dumps({'pack': 'newpro/plantas', 'version': 2, 'base_web': WEB,
                             'nuevos': len(cat), 'cultivos': cat},
                            ensure_ascii=False, indent=1))
    print('%d cultivos nuevos, %d archivos' % (len(cat), len(rutas)))
    if hoja_:
        d2 = os.path.join(os.environ.get('TEMP', '.'), 'gf_hojas')
        if not os.path.isdir(d2):
            os.makedirs(d2)
        A.hoja_contacto(rutas, columnas=10, escala=3).save(os.path.join(d2, 'siembras.png'))
        print('hoja en', d2)


if __name__ == '__main__':
    main()
