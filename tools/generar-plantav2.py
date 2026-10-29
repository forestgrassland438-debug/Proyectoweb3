#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
PLANTAV2 — 30 cultivos comestibles para `Game/newpro/plantav2`
=============================================================================

Cada cultivo lleva las MISMAS 9 imagenes que la zanahoria del juego
(`Game/Objetos/Plantas/planta_zanahorias`), con las mismas medidas:

    1.png  2.png  3.png  4.png  5.png       51x53  (seca, y cuatro mojadas)
    item_saco.png                            16x20
    item_<id>_buen{o,a}.png                  19x25
    item_<id>_podrid{o,a}.png                19x25
    planta_crecimiento_<id>.png              18x15

La tierra son los PNG del juego (`tierra_seca.png`, `tierra_mojada.png`)
copiados tal cual; el saco es el de la zanahoria con el emblema cambiado. Lo
unico dibujado es la planta, y se dibuja con `gf_plantav2.py` (ver alli las
reglas medidas en la zanahoria).

Nada lleva motas, racimos de bolitas ni agujeros (tripofobia del usuario): por
eso no hay maiz, fresa, frambuesa, girasol ni pina, la patata no tiene ojos y
lo podrido son manchas grandes, no puntitos.

USO
---------------------------------------------------------------------------
    python tools/generar-plantav2.py                  los 30 cultivos
    python tools/generar-plantav2.py --solo rabano,ajo
    python tools/generar-plantav2.py --salida DIR     escribe en otra carpeta
    python tools/generar-plantav2.py --hoja RUTA.png  y una hoja de contacto x5
"""

import argparse
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gf_arte as GA  # noqa: E402
import gf_plantav2 as P  # noqa: E402
from gf_plantav2 import Material, rampa_hsv, VERDE, SECO  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, 'Game', 'newpro', 'plantav2')
OBJ = os.path.join(RAIZ, 'Game', 'Objetos')

PIE = (32.0, 46.0)          # pie de la planta en el lienzo de trabajo (64x64)
LIENZO = 64

# ---------------------------------------------------------------------------
# MATERIALES (claro -> oscuro, y su contorno)
# ---------------------------------------------------------------------------


def M(lista, contorno):
    return Material(lista, contorno)


MANCHA = M(['#9a8a44', '#7d7034', '#655a2a', '#4f4721', '#3c361a', '#2d2814', '#211d0e'], '#1a160b')
MANCHA_OSCURA = M(['#6e5a35', '#5a4a2b', '#4a3c23', '#3b301c', '#2e2516', '#231c11', '#1a140c'], '#140f09')

ROJO_RABANO = M(['#ffa3b1', '#f2546a', '#e0344f', '#c62845', '#a61f3c', '#861a33', '#69152b'], '#4a0f1e')
BLANCO_RAIZ = M(['#ffffff', '#f8eef0', '#ead8dc', '#d4bcc2', '#b49aa1', '#917880', '#6e5960'], '#4a3a40')
REMOLACHA = M(['#e67aa6', '#b8305f', '#9c2450', '#831d45', '#6c173a', '#561230', '#430d26'], '#2c0818')
TALLO_REMOLACHA = M(['#ff7a96', '#e2385f', '#c42a50', '#a12245', '#801b3a', '#62152f'], '#3e0c1d')
MORADO_NABO = M(['#eab0e4', '#b862b5', '#9c4a9d', '#813a85', '#6a2d6e', '#532258', '#3e1742'], '#2a0e2c')
BLANCO_NABO = M(['#ffffff', '#f8f5ec', '#ebe5d6', '#d8cfbc', '#bfb39d', '#9f927c', '#7d725f'], '#4a4236')
DORADO_CEBOLLA = M(['#fde6b0', '#eebb70', '#dc9d4c', '#c7843c', '#ab6c30', '#8c5627', '#6c421e'], '#432812')
SECO_CEBOLLA = M(['#f4dfb6', '#e2c28e', '#cda56e', '#b38957', '#957045', '#765836'], '#47331d')
BLANCO_AJO = M(['#ffffff', '#f7f1e9', '#e9dfd2', '#d4c6b5', '#b9a996', '#998976', '#786957'], '#45392e')
VIOLETA_AJO = M(['#f0d6ee', '#d9aed6', '#c493c2', '#a97aa8', '#8c628c', '#6e4c6f', '#523853'], '#2f2030')

VERDE_AJO = Material(rampa_hsv(96, 128, .50, .58, .84, .32, 8), '#183522')
VERDE_CEBOLLA = Material(rampa_hsv(108, 140, .42, .55, .84, .31, 8), '#15332a')
VERDE_REMOLACHA = Material(rampa_hsv(90, 112, .72, .80, .78, .28, 8), '#163312')


def rng(*k):
    return GA.rng_de('plantav2', *k)


def jit(r, v, frac):
    return v * (1.0 + r.uniform(-frac, frac))


def esc():
    return P.Escena(LIENZO, LIENZO)


def suelo_rim(cx, cy, rx, hondo=2.2):
    """Recorte de una raiz que asoma: el borde de la tierra se curva hacia abajo."""
    def f(X, Y):
        return Y < cy + hondo * np.clip(1 - ((X - cx) / max(rx, 1e-6)) ** 2, 0, 1)
    return f


def secar(e0, e1, L, A=None):
    """
    Hoja marchita, como la etapa 5 de la zanahoria del juego: la MISMA planta en
    marron, con las puntas caidas y algo mas corta. (Tumbarla entera contra el
    suelo dejaba un monton de ruido marron en el que no se reconocia nada.)
    """
    e0n = e0 * 0.86
    e1n = max(-14.0, e1 - 24.0)
    if A is None:
        return e0n, e1n, L * 0.9
    return e0n, e1n, L * 0.9, A * 0.88


# ---------------------------------------------------------------------------
# BROTES (etapas 1 y 2, y el icono de la planta corta)
# ---------------------------------------------------------------------------

def brote_cotiledones(e, pie, mat, largo=7.0, ancho=3.3, abre=66, curva=16,
                      alto=3.5, fm=None, mat_tallo=None, forma_nombre='redonda'):
    """Dos hojitas de semilla sobre un tallito (las crucíferas, las calabazas...)."""
    cx, cy = pie
    alto = alto + 1.0
    t = P.Tallo(P.curva([(cx, cy), (cx, cy - alto)]), 1.2, 1.2, mat_tallo or mat, 0, grupo='brote')
    e.pon(t)
    if forma_nombre in ('redonda', 'eliptica'):
        # las hojitas redondas y anchas se fundian en un corazon: base estrecha
        forma_nombre = 'cotiledon'
        largo, ancho = largo * 1.08, ancho * 0.92
    for s in (-1, 1):
        S = P.arco((cx, cy - alto), -90 + s * max(abre, 62), largo, -s * curva)
        w = fm or P.forma(forma_nombre, ancho)
        e.pon(P.Eje(S, w, mat, 1, grupo='cot%d' % s, nervio=1, nervio_t=(0.1, 0.7), pliegue=0.25))


def brote_hebras(e, pie, mat, hebras, grosor=1.6, modelo='tubo'):
    """Hojitas finas (cebolla, ajo, puerro): (angulo, largo, curva)."""
    cx, cy = pie
    for k, (ang, L, cv) in enumerate(hebras):
        S = P.arco((cx, cy), ang, L, cv)
        g = grosor / 2.0
        w = P.suave([0, .5, .85, 1], [g, g * 0.9, g * 0.6, 0.15])
        h = P.Eje(S, w, mat, k * 0.1, modelo=modelo, grupo='hebra%d' % k, punta_clara=0.3,
                  nervio=None)
        e.pon(h)


# ---------------------------------------------------------------------------
# HOJAS TIPO
# ---------------------------------------------------------------------------

def hoja_lirada(pie, az, e0, e1, L, mat, grupo, brillo=0.0, ancho=1.0, origen=(0, 0, 0),
                mat_raquis=None, raquis=0.8):
    """Rabano y nabo: lobulos pequenos abajo y uno grande y redondo en la punta."""
    P3 = P.espina3d(az, e0, e1, L, origen=origen)
    S = P.proyecta(pie, P3)
    vis = P.ancho_visible(az, (e0 + e1) / 2.0) * ancho
    z = float(P3[:, 2].mean())
    W = L * vis
    fol = [
        # los lobulos empiezan abajo: asi la lamina tapa el peciolo y la base
        # no se llena de rayitas (un peciolo de 1 px con contorno = 3 px)
        (0.14, +1, 64, 0.13 * L, 0.075 * W, 'ovada', 10),
        (0.21, -1, 62, 0.15 * L, 0.085 * W, 'ovada', 10),
        (0.31, +1, 56, 0.19 * L, 0.105 * W, 'ovada', 12),
        (0.40, -1, 54, 0.21 * L, 0.115 * W, 'ovada', 12),
        (0.50, 0, 0, 0.50 * L, 0.200 * W, 'redonda', 0, P.ondas(3, 0.10)),
    ]
    return P.hoja_compuesta(S, mat, z, grupo, fol, raquis=raquis, nervio=2, brillo=brillo,
                            raquis_mat=mat_raquis)


def roseta(e, pie, hojas, fabrica, mat, seco, r, jit_ang=5.0, jit_largo=0.07, **kw):
    """Una roseta: cada hoja (az, el0, el1, largo) con un poco de azar fijo."""
    for i, h in enumerate(hojas):
        az, e0, e1, L = h[:4]
        az = az + r.uniform(-jit_ang, jit_ang)
        L = jit(r, L, jit_largo)
        if seco:
            e0, e1, L = secar(e0, e1, L)
        e.pon(*fabrica(pie, az, e0, e1, L, mat, 'h%d' % i,
                       brillo=(0.05 if i % 2 else -0.03), **kw))


# ===========================================================================
# 1. RABANO
# ===========================================================================

def rabano_raiz(e, c, s, podrido, z, recorte=None):
    mat = P.podrido(ROJO_RABANO, 0.75) if podrido else ROJO_RABANO
    ex = P.manchas_bola([(-0.32, 0.18, .42, .30), (0.38, -0.20, .30, .26)], MANCHA, 'rabano') if podrido else None
    b = P.Bola(c, 6.0 * s, 5.6 * s, mat, z, grupo='raiz', extra=ex)
    b.recorte = recorte
    e.pon(b)
    return b


def rabano_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('rabano', n)
    if n == 1:
        brote_cotiledones(e, PIE, VERDE['zanahoria'], largo=7.2, ancho=3.4)
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE['zanahoria']
    if n == 3:
        hojas = [(188, 50, 8, 15), (230, 62, 24, 16.5), (270, 70, 36, 17.5),
                 (310, 62, 24, 16.5), (352, 50, 8, 15)]
    else:
        hojas = [(182, 46, 2, 24), (212, 56, 14, 25), (244, 66, 28, 26),
                 (274, 72, 40, 24), (302, 66, 28, 26), (332, 56, 14, 25), (2, 46, 2, 24)]
    roseta(e, (cx, cy - 2.5), hojas, hoja_lirada, mat, seco, r)
    if n in (4, 5):
        rabano_raiz(e, (cx, cy + 1.0), 1.05, seco, 100, suelo_rim(cx, cy + 2.0, 6.4))
    return e.render()


def hojitas_item(e, c, mat, podrido, angs, grupo='hi', ancho=2.3, fm='redonda', raquis=0.8,
                 raquis_mat=None, borde=None, abre_podrido=26):
    """Las hojas cortadas que quedan sobre una raiz cosechada."""
    for k, (a, L) in enumerate(angs):
        if podrido:
            a = a + (-abre_podrido if a < -95 else abre_podrido if a > -85 else 6)
        S = P.arco(c, a, L, 10 if a > -90 else -10)
        fol = [(0.40, 0, 0, L * 0.62, ancho * (0.85 if podrido else 1.0), fm, 0, borde)]
        e.pon(*P.hoja_compuesta(S, mat, 1 + (0.2 if k == 1 else 0), '%s%d' % (grupo, k), fol,
                                raquis=raquis, raquis_mat=raquis_mat, nervio=1))


def rabano_item(podrido):
    e = esc()
    c = (32.0, 34.0)
    mat_h = P.podrido(VERDE['zanahoria'], 0.9) if podrido else VERDE['zanahoria']
    hojitas_item(e, (c[0], c[1] - 4.3), mat_h, podrido, ((-122, 7.0), (-90, 8.0), (-58, 7.0)))
    raicilla = P.Eje(P.arco((c[0], c[1] + 3.8), 90, 4.6, 18),
                     P.suave([0, .3, 1], [0.9, 0.6, 0.0]), BLANCO_RAIZ, 5, modelo='tubo', grupo='raiz')
    raicilla.fino = raicilla.S
    e.pon(raicilla)
    rabano_raiz(e, c, 0.95, podrido, 10)
    return e.render()


def rabano_emblema():
    e = esc()
    c = (32.0, 33.0)
    for k, a in enumerate((-118, -62)):
        S = P.arco((c[0], c[1] - 1.8), a, 3.2, 0)
        e.pon(P.Eje(S, P.forma('redonda', 1.3), VERDE['zanahoria'], 1, grupo='eh%d' % k, nervio=None))
    e.pon(P.Bola(c, 3.1, 2.8, ROJO_RABANO, 10, grupo='raiz'))
    return e.render()


# ===========================================================================
# 2. REMOLACHA
# ===========================================================================

def remolacha_hoja(pie, az, e0, e1, L, mat, grupo, brillo=0.0, seco=False):
    vena = None if seco else TALLO_REMOLACHA.rampa[2]
    return P.hoja3d(pie, az, e0, e1, L, 0.20 * L, 'ovada', mat, grupo, peciolo=0.36,
                    grosor_peciolo=1.2, mat_peciolo=(SECO_OSCURO_ROJO if seco else TALLO_REMOLACHA),
                    nervio=vena, brillo=brillo, borde=P.ondas(4, 0.10), pliegue=0.24)


SECO_OSCURO_ROJO = M(['#c98a6a', '#a8684c', '#8a503b', '#6f3f30', '#563126', '#41251d'], '#2c1712')


def remolacha_raiz(e, c, s, podrido, z, recorte=None, punta=True):
    mat = P.podrido(REMOLACHA, 0.7) if podrido else REMOLACHA

    def forma(th):
        # punta abajo (y crece hacia abajo en pantalla: th = +90 grados)
        return 1.0 + 0.30 * np.clip(np.sin(th), 0, 1) ** 3 if punta else 1.0
    ex = P.manchas_bola([(-0.30, 0.25, .40, .30), (0.35, -0.15, .30, .28)], MANCHA_OSCURA, 'remo') if podrido else None
    b = P.Bola(c, 6.6 * s, 6.0 * s, mat, z, grupo='raiz', radio=forma, extra=ex)
    b.recorte = recorte
    e.pon(b)


def remolacha_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('remolacha', n)
    if n == 1:
        brote_cotiledones(e, PIE, VERDE_REMOLACHA, largo=8.0, ancho=1.9, abre=58, curva=12,
                          mat_tallo=TALLO_REMOLACHA, forma_nombre='cinta')
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE_REMOLACHA
    if n == 3:
        hojas = [(196, 62, 22, 15), (240, 72, 38, 16), (282, 76, 46, 16),
                 (322, 72, 36, 16), (356, 62, 22, 15)]
    else:
        hojas = [(186, 58, 14, 22), (214, 66, 26, 23), (244, 74, 38, 24),
                 (272, 78, 50, 23), (300, 74, 38, 24), (330, 66, 26, 23), (358, 58, 14, 22)]
    for i, h in enumerate(hojas):
        az, e0, e1, L = h
        az += r.uniform(-5, 5)
        L = jit(r, L, 0.07)
        if seco:
            e0, e1, L = secar(e0, e1, L)
        e.pon(*remolacha_hoja((cx, cy - 2.5), az, e0, e1, L, mat, 'h%d' % i,
                              brillo=(0.05 if i % 2 else -0.03), seco=seco))
    if n in (4, 5):
        remolacha_raiz(e, (cx, cy + 1.0), 1.0, seco, 100, suelo_rim(cx, cy + 2.0, 6.6), punta=False)
    return e.render()


def remolacha_item(podrido):
    e = esc()
    c = (32.0, 33.0)
    mat_h = P.podrido(VERDE_REMOLACHA, 0.9) if podrido else VERDE_REMOLACHA
    hojitas_item(e, (c[0], c[1] - 4.2), mat_h, podrido, ((-120, 7.5), (-92, 8.2), (-62, 7.5)),
                 ancho=2.2, fm='ovada', raquis=1.0,
                 raquis_mat=(SECO_OSCURO_ROJO if podrido else TALLO_REMOLACHA))
    rz = P.Eje(P.arco((c[0], c[1] + 5.0), 90, 3.6, 14), P.suave([0, .4, 1], [0.9, 0.5, 0.0]),
               (P.podrido(REMOLACHA, .7) if podrido else REMOLACHA), 5, modelo='tubo', grupo='raiz')
    rz.fino = rz.S
    e.pon(rz)
    remolacha_raiz(e, c, 0.86, podrido, 10)
    return e.render()


def remolacha_emblema():
    e = esc()
    c = (32.0, 33.0)
    for k, a in enumerate((-116, -64)):
        S = P.arco((c[0], c[1] - 1.8), a, 3.2, 0)
        e.pon(P.Eje(S, P.forma('ovada', 1.3), VERDE_REMOLACHA, 1, grupo='eh%d' % k, nervio=None))
    e.pon(P.Bola(c, 3.0, 2.8, REMOLACHA, 10, grupo='raiz',
                 radio=lambda th: 1.0 + 0.3 * np.clip(np.sin(th), 0, 1) ** 3))
    return e.render()


# ===========================================================================
# 3. NABO
# ===========================================================================

def nabo_raiz(e, c, s, podrido, z, recorte=None, corte=-0.05):
    alto = P.podrido(MORADO_NABO, 0.7) if podrido else MORADO_NABO
    bajo = P.podrido(BLANCO_NABO, 0.6) if podrido else BLANCO_NABO
    ex = P.encadena(P.dos_tonos_bola(bajo, corte=corte, onda=0.08),
                    P.manchas_bola([(-0.35, 0.30, .38, .30), (0.30, -0.30, .30, .25)], MANCHA, 'nabo') if podrido else None)

    def forma(th):
        return 1.0 + 0.16 * np.clip(np.sin(th), 0, 1) ** 4 - 0.06 * np.clip(-np.sin(th), 0, 1) ** 2
    b = P.Bola(c, 7.2 * s, 6.4 * s, alto, z, grupo='raiz', radio=forma, extra=ex)
    b.recorte = recorte
    e.pon(b)


def nabo_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('nabo', n)
    V = VERDE['tomate']
    if n == 1:
        brote_cotiledones(e, PIE, V, largo=7.6, ancho=3.6, abre=70, curva=14)
        return e.render()
    seco = n == 5
    mat = SECO if seco else V
    if n == 3:
        hojas = [(188, 52, 10, 15), (230, 62, 24, 16), (270, 70, 36, 17),
                 (310, 62, 24, 16), (352, 52, 10, 15)]
    else:
        hojas = [(182, 48, 4, 22), (210, 58, 16, 23), (240, 66, 28, 24),
                 (270, 72, 40, 22), (300, 66, 28, 24), (330, 58, 16, 23), (358, 48, 4, 22)]
    roseta(e, (cx, cy - 3.0), hojas, hoja_lirada, mat, seco, r, ancho=1.12)
    if n in (4, 5):
        nabo_raiz(e, (cx, cy + 0.5), 1.0, seco, 100, suelo_rim(cx, cy + 2.5, 7.2), corte=0.25)
    return e.render()


def nabo_item(podrido):
    e = esc()
    c = (32.0, 34.0)
    mat_h = P.podrido(VERDE['tomate'], 0.9) if podrido else VERDE['tomate']
    hojitas_item(e, (c[0], c[1] - 4.6), mat_h, podrido, ((-118, 7.0), (-90, 7.8), (-62, 7.0)),
                 ancho=2.4, borde=P.ondas(2, 0.12))
    rz = P.Eje(P.arco((c[0], c[1] + 4.8), 90, 3.8, 16), P.suave([0, .4, 1], [0.8, 0.5, 0.0]),
               BLANCO_NABO, 5, modelo='tubo', grupo='raiz')
    rz.fino = rz.S
    e.pon(rz)
    nabo_raiz(e, c, 0.88, podrido, 10)
    return e.render()


def nabo_emblema():
    e = esc()
    c = (32.0, 33.0)
    for k, a in enumerate((-116, -64)):
        S = P.arco((c[0], c[1] - 1.8), a, 3.0, 0)
        e.pon(P.Eje(S, P.forma('redonda', 1.3), VERDE['tomate'], 1, grupo='eh%d' % k, nervio=None))
    e.pon(P.Bola(c, 3.4, 3.0, MORADO_NABO, 10, grupo='raiz',
                 extra=P.dos_tonos_bola(BLANCO_NABO, corte=0.0, onda=0.05)))
    return e.render()


# ===========================================================================
# 4. CEBOLLA
# ===========================================================================

def tubo3d(pie, az, e0, e1, L, g0, g1, mat, grupo, origen=(0, 0, 0), brillo=0.0, curva_el=1.25,
           giro=0.0):
    """Hoja hueca (cebolla, puerro joven): un tubo grueso que se afina, en 3D."""
    P3 = P.espina3d(az, e0, e1, L, origen=origen, curva_el=curva_el, giro=giro)
    S = P.proyecta(pie, P3)
    z = float(P3[:, 2].mean())
    # la punta se afina hasta cero: una hoja de cebolla acaba en punta, no cortada
    w = P.suave([0, .45, .72, .90, 1], [g0 / 2, (g0 * .55 + g1 * .45) / 2, g1 / 2, g1 / 2 * 0.55, 0.0])
    h = P.Eje(P.remuestrear(S, 32), w, mat, z, modelo='tubo', grupo=grupo, punta_clara=0.5)
    h.brillo0 += brillo
    return [h]


def cebolla_bulbo(e, c, s, podrido, z, recorte=None, cuello=0.30, ancho=1.0):
    mat = P.podrido(DORADO_CEBOLLA, 0.65) if podrido else DORADO_CEBOLLA

    def forma(th):
        arriba = np.clip(-np.sin(th), 0, 1)
        return 1.0 + cuello * arriba ** 6 - 0.05 * np.clip(np.sin(th), 0, 1) ** 2
    ex = P.encadena(P.meridianos([-50, -12, 26, 60], mat, pasos=1, grosor=0.05, v_lim=(-0.78, 0.84)),
                    P.manchas_bola([(-0.30, 0.25, .42, .32), (0.38, -0.05, .28, .30)], MANCHA_OSCURA, 'ceb') if podrido else None)
    b = P.Bola(c, 7.0 * s * ancho, 6.4 * s, mat, z, grupo='bulbo', radio=forma, extra=ex)
    b.recorte = recorte
    e.pon(b)


def cebolla_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('cebolla', n)
    if n == 1:
        # el brote de la cebolla sale doblado ("bandera") y uno recto al lado
        e.pon(*tubo3d((cx, cy), 210, 90, 18, 11.0, 3.0, 1.8, VERDE_CEBOLLA, 'b0', curva_el=1.6))
        e.pon(*tubo3d((cx + 0.5, cy), 300, 88, 74, 9.0, 3.0, 1.8, VERDE_CEBOLLA, 'b1'))
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE_CEBOLLA
    if n == 3:
        origen = (0.0, 0.0, 0.0)
        hojas = [(200, 84, 30, 19, 4.4), (240, 88, 54, 22, 4.8), (290, 88, 52, 22, 4.8),
                 (334, 84, 28, 19, 4.4), (160, 86, 44, 16, 4.0)]
    elif n == 4:
        origen = (0.0, 6.0, 0.0)
        hojas = [(198, 80, 18, 23, 5.0), (236, 86, 50, 25, 5.2), (274, 88, 62, 26, 5.2),
                 (312, 84, 40, 24, 5.0), (348, 74, 4, 23, 4.8), (160, 82, 6, 20, 4.6)]
    else:
        # las hojas secas se tumban todas hacia el mismo lado, como en el huerto
        origen = (0.0, 5.0, 0.0)
        hojas = [(118, 40, -10, 17, 4.4, 18), (150, 30, -8, 22, 4.8, -12), (186, 46, -10, 21, 4.6, 16),
                 (214, 36, -8, 19, 4.4, -20), (246, 56, -6, 15, 4.0, 10)]
    for i, h in enumerate(hojas):
        az, e0, e1, L, g = h[:5]
        giro = h[5] if len(h) > 5 else 0.0
        az += r.uniform(-4, 4)
        L = jit(r, L, 0.06)
        e.pon(*tubo3d((cx, cy), az, e0, e1, L, g, 2.0, mat, 'h%d' % i, origen=origen,
                      brillo=(0.05 if i % 2 else -0.03), giro=giro))
    if n in (4, 5):
        cebolla_bulbo(e, (cx, cy - 1.5), 1.0, seco, 100, suelo_rim(cx, cy + 2.6, 8.0, 1.4),
                      cuello=0.22, ancho=1.18)
    return e.render()


def cebolla_item(podrido):
    e = esc()
    c = (32.0, 35.0)
    cuello = P.Eje(P.arco((c[0], c[1] - 5.5), -90 + (14 if podrido else 6), 6.0, 18),
                   P.suave([0, .5, 1], [1.4, 1.0, 0.45]), SECO_CEBOLLA, 5, modelo='tubo', grupo='cuello')
    e.pon(cuello)
    for k, a in enumerate((72, 90, 108)):
        rz = P.Eje(P.arco((c[0] + (k - 1) * 1.2, c[1] + 5.4), a, 2.6, 0), P.const(0.45),
                   BLANCO_AJO, 4, modelo='tubo', grupo='raices')
        rz.fino = rz.S
        e.pon(rz)
    cebolla_bulbo(e, c, 1.0, podrido, 10, cuello=0.28)
    return e.render()


def cebolla_emblema():
    e = esc()
    c = (32.0, 33.0)
    e.pon(P.Eje(P.arco((c[0], c[1] - 2.6), -84, 2.6, 10), P.suave([0, 1], [0.9, 0.4]),
                SECO_CEBOLLA, 5, modelo='tubo', grupo='cu'))
    e.pon(P.Bola(c, 3.4, 3.1, DORADO_CEBOLLA, 10, grupo='b',
                 radio=lambda th: 1.0 + 0.26 * np.clip(-np.sin(th), 0, 1) ** 6))
    return e.render()


# ===========================================================================
# 5. AJO
# ===========================================================================

def ajo_hoja(pie, az, e0, e1, L, mat, grupo, brillo=0.0, origen=(0, 0, 0), ancho=2.0, giro=0.0):
    return P.hoja3d(pie, az, e0, e1, L, ancho, 'cinta', mat, grupo, nervio=1, brillo=brillo,
                    pliegue=0.30, origen=origen, ancho_fijo=True, giro=giro)


def ajo_cabeza(e, c, s, podrido, z, recorte=None):
    mat = P.podrido(BLANCO_AJO, 0.7) if podrido else BLANCO_AJO

    def forma(th):
        arriba = np.clip(-np.sin(th), 0, 1)
        abajo = np.clip(np.sin(th), 0, 1)
        return 1.0 + 0.32 * arriba ** 7 - 0.12 * abajo ** 3
    ex = P.encadena(P.meridianos([-56, -18, 18, 56], VIOLETA_AJO, pasos=1, grosor=0.05, v_lim=(-0.75, 0.86)),
                    P.manchas_bola([(-0.25, 0.30, .40, .32), (0.40, -0.10, .30, .28)], MANCHA, 'ajo') if podrido else None)
    b = P.Bola(c, 6.8 * s, 6.2 * s, mat, z, grupo='cabeza', radio=forma, extra=ex)
    b.recorte = recorte
    e.pon(b)


def ajo_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('ajo', n)
    if n == 1:
        e.pon(*ajo_hoja((cx, cy), 255, 88, 52, 11.0, VERDE_AJO, 'b0', ancho=1.6))
        e.pon(*ajo_hoja((cx + 0.5, cy), 300, 88, 66, 8.0, VERDE_AJO, 'b1', ancho=1.4))
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE_AJO
    if n == 3:
        origen = (0.0, 0.0, 0.0)
        hojas = [(198, 84, 46, 17), (246, 88, 66, 20), (292, 88, 64, 20), (342, 84, 44, 17)]
    elif n == 4:
        origen = (0.0, 5.5, 0.0)
        hojas = [(186, 80, 26, 22), (222, 86, 52, 25), (260, 88, 70, 27),
                 (298, 86, 58, 26), (336, 80, 30, 23), (156, 84, 36, 19)]
    else:
        origen = (0.0, 4.5, 0.0)
        hojas = [(120, 42, -10, 17, 16), (148, 32, -8, 22, -14), (182, 46, -10, 21, 18),
                 (212, 36, -8, 19, -16), (244, 54, -6, 15, 10)]
    for i, h in enumerate(hojas):
        az, e0, e1, L = h[:4]
        giro = h[4] if len(h) > 4 else 0.0
        az += r.uniform(-4, 4)
        L = jit(r, L, 0.06)
        e.pon(*ajo_hoja((cx, cy), az, e0, e1, L, mat, 'h%d' % i,
                        brillo=(0.05 if i % 2 else -0.03), origen=origen,
                        ancho=(1.8 if seco else 2.1), giro=giro))
    if n in (4, 5):
        ajo_cabeza(e, (cx, cy - 1.2), 1.0, seco, 100, suelo_rim(cx, cy + 2.5, 6.8, 1.5))
    return e.render()


def ajo_item(podrido):
    e = esc()
    c = (32.0, 35.0)
    cuello = P.Eje(P.arco((c[0], c[1] - 5.5), -90 + (12 if podrido else 4), 5.5, 14),
                   P.suave([0, .5, 1], [1.3, 0.9, 0.45]), SECO_CEBOLLA, 5, modelo='tubo', grupo='cuello')
    e.pon(cuello)
    for k, a in enumerate((66, 82, 98, 114)):
        rz = P.Eje(P.arco((c[0] + (k - 1.5) * 1.3, c[1] + 4.8), a, 2.4, 0), P.const(0.45),
                   SECO_CEBOLLA, 4, modelo='tubo', grupo='raices')
        rz.fino = rz.S
        e.pon(rz)
    ajo_cabeza(e, c, 1.05, podrido, 10)
    return e.render()


def ajo_emblema():
    e = esc()
    c = (32.0, 33.0)
    e.pon(P.Eje(P.arco((c[0], c[1] - 2.6), -86, 2.4, 8), P.suave([0, 1], [0.9, 0.4]),
                SECO_CEBOLLA, 5, modelo='tubo', grupo='cu'))
    e.pon(P.Bola(c, 3.4, 3.0, BLANCO_AJO, 10, grupo='b',
                 radio=lambda th: 1.0 + 0.30 * np.clip(-np.sin(th), 0, 1) ** 7,
                 extra=P.meridianos([-35, 35], VIOLETA_AJO, pasos=1, grosor=0.06)))
    return e.render()


# ===========================================================================
# PIEZAS COMUNES: hoja compuesta en 3D, tallos, tuberculos
# ===========================================================================

def hoja_comp3d(pie, origen, az, e0, e1, L, mat, grupo, fol_rel, raquis=1.0, brillo=0.0,
                raquis_mat=None, giro=0.0, nervio=1, curva_el=1.25):
    """
    Hoja compuesta pensada en 3D. `fol_rel` = (t, lado, angulo, largo, ancho, forma
    [, curva, borde]) con largo y ancho RELATIVOS al largo de la hoja.
    """
    P3 = P.espina3d(az, e0, e1, L, origen=origen, giro=giro, curva_el=curva_el)
    S = P.proyecta(pie, P3)
    z = float(P3[:, 2].mean())
    vis = P.ancho_visible(az, (e0 + e1) / 2.0)
    fol = []
    for f in fol_rel:
        t, lado, ang, lr, wr, fm = f[:6]
        fol.append((t, lado, ang, lr * L, wr * L * vis, fm) + tuple(f[6:]))
    return P.hoja_compuesta(S, mat, z, grupo, fol, raquis=raquis, nervio=nervio, brillo=brillo,
                            raquis_mat=raquis_mat)


def tallo_curvo(pie, ctrl3d, g0, g1, mat, grupo, zextra=0.0):
    """Tallo por puntos del mundo; devuelve la pieza y la curva 3D (para colgarle hojas)."""
    C3 = P.curva3d(ctrl3d, 32)
    S = P.proyecta(pie, C3)
    z = float(C3[:, 2].mean()) + zextra
    return P.Tallo(S, g0, g1, mat, z, grupo=grupo), C3


def tuberculo(e, c, rx, ry, mat, z, giro, podrido, rid, recorte=None, mancha=None, grupo=None):
    """Patata y similares: bulto algo irregular (dos armonicos, nunca regular)."""
    r = rng('tuberculo', rid)
    a1, f1 = r.uniform(.03, .06), r.uniform(0, 6.28)
    a2, f2 = r.uniform(.02, .04), r.uniform(0, 6.28)

    def radio(th):
        return 1 + a1 * np.cos(2 * th + f1) + a2 * np.cos(3 * th + f2)
    ex = P.manchas_bola([(-0.30, 0.20, .40, .34), (0.38, -0.22, .30, .28)], mancha or MANCHA, 'tub%s' % rid) if podrido else None
    b = P.Bola(c, rx, ry, P.podrido(mat, 0.6) if podrido else mat, z, radio=radio, giro=giro,
               grupo=grupo or ('tub%s' % rid), extra=ex)
    b.recorte = recorte
    e.pon(b)
    return b


def huso(e, c, largo, grueso, ang, curva, mat, z, grupo, podrido=False, mancha=None, rid='h'):
    """Raiz en huso (boniato): gruesa en medio y afilada en las dos puntas."""
    S = P.arco((c[0] - math.cos(math.radians(ang)) * largo / 2, c[1] - math.sin(math.radians(ang)) * largo / 2),
               ang, largo, curva)
    w = P.suave([0, .12, .35, .6, .85, 1], [0.35, grueso * .62, grueso, grueso * .92, grueso * .5, 0.3])
    ex = P.manchas_eje([(0.35, -0.2, .18, .7), (0.7, 0.3, .14, .6)], mancha or MANCHA_OSCURA, 'huso%s' % rid) if podrido else None
    p = P.Eje(S, w, P.podrido(mat, 0.6) if podrido else mat, z, modelo='tubo', grupo=grupo,
              punta_clara=0.0, extra=ex)
    e.pon(p)
    return p


def degradado_eje(mat_b, t0, t1):
    """Del material de la pieza (abajo) al `mat_b` (arriba) entre t0 y t1, sin tramado."""
    def extra(t, s, d, Q, idx, cols):
        m = t > (t0 + (t1 - t0) * 0.5)
        ii = np.clip(idx, 0, mat_b.n() - 1)
        cols[m] = np.array(mat_b.rampa)[ii[m]]
        return cols
    return extra



def copa(e, pie, alto, rh, rv, n, hoja_fn, r, seco=False, tallo_mat=None, y_min=-0.25,
         grupo='c', giro0=0.0, tallo_g=2.0, ramas=True, frente_vacio=None):
    """
    Mata redonda como la tomatera del juego: `n` hojas MEDIANAS repartidas por
    una cupula (reparto de Fibonacci: ni huecos ni montones), cada una colgada
    de una ramita que sale del tallo — ninguna hoja flota.

        alto    altura del centro de la copa sobre el suelo (mundo)
        rh, rv  radios horizontal y vertical de la copa
        hoja_fn(origen, az, e0, e1, grupo, brillo) -> piezas
        frente_vacio  (az0, az1): sector sin hojas bajas (deja ver los frutos)

    Devuelve los anclajes (x, y, z) de las hojas, para colgar frutos.
    """
    tm = tallo_mat or (SECO if seco else TALLO_VERDE)
    # las ramitas de dentro van en sombra: claras se leian como una telarana
    tr = P.SECO_OSCURO if seco else TALLO_SOMBRA
    caida = 0.88 if seco else 1.0
    cy = alto * caida
    t, C3 = tallo_curvo(pie, [(0, 0, 0), (0.2, cy * 0.5, 0.2), (0, cy, 0)], tallo_g, tallo_g * 0.75, tm, grupo + 't')
    e.pon(t)
    oro = 137.508
    anclas = []
    for i in range(n):
        y = 1.0 - (i + 0.5) / n * (1.0 - y_min)
        rad = math.sqrt(max(0.0, 1.0 - y * y))
        az = (i * oro + giro0 + r.uniform(-12, 12)) % 360
        if frente_vacio and y < 0.35 and frente_vacio[0] <= az <= frente_vacio[1]:
            az = (az + 90) % 360 if az < (frente_vacio[0] + frente_vacio[1]) / 2 else (az - 90) % 360
        k = 0.42
        ox = math.cos(math.radians(az)) * rad * rh * k
        oz = math.sin(math.radians(az)) * rad * rh * k
        oy = cy + y * rv * k
        el = math.degrees(math.asin(max(-1.0, min(1.0, y))))
        e0 = max(-20.0, min(80.0, el * 0.75 + 22))
        e1 = max(-30.0, min(60.0, el * 0.75 - 6))
        if seco:
            e0, e1 = e0 * 0.86, max(-30.0, e1 - 24)
        brillo = 0.05 if i % 2 else -0.03
        piezas = hoja_fn((ox, oy, oz), az, e0, e1, '%sh%d' % (grupo, i), brillo)
        e.pon(*piezas)
        if ramas:
            zmin = min(p.z for p in piezas)
            base_y = max(cy * 0.35, oy - rv * 0.35)
            rama, _ = tallo_curvo(pie, [(0, base_y, 0), (ox * 0.5, (base_y + oy) / 2 + 0.6, oz * 0.5), (ox, oy, oz)],
                                  1.2, 1.0, tr, grupo + 't')
            rama.z = zmin - 0.3
            e.pon(rama)
        anclas.append((ox / k, oy, oz / k))
    return anclas


# ===========================================================================
# 6. PUERRO
# ===========================================================================

BLANCO_PUERRO = M(['#ffffff', '#f3f6ec', '#e2ead6', '#cad9ba', '#abc198', '#8aa279', '#68805b'], '#33452f')
VERDE_CLARO_PUERRO = Material(rampa_hsv(96, 118, .30, .48, .94, .48, 7), '#2a4425')
VERDE_PUERRO = Material(rampa_hsv(122, 154, .40, .55, .74, .26, 8), '#122b24')


def puerro_fuste(e, pie, alto, grosor, z, podrido=False, raices=False):
    cx, cy = pie
    S = P.curva([(cx, cy + 1.0), (cx, cy - alto)])
    mb = P.podrido(BLANCO_PUERRO, 0.6) if podrido else BLANCO_PUERRO
    mv = P.podrido(VERDE_CLARO_PUERRO, 0.6) if podrido else VERDE_CLARO_PUERRO
    f = P.Eje(S, P.const(grosor / 2.0), mb, z, modelo='tubo', grupo='fuste', punta_clara=0.0,
              extra=degradado_eje(mv, 0.45, 0.85))
    e.pon(f)
    return f


def puerro_hoja(pie, az, e0, e1, L, mat, grupo, origen, brillo=0.0, giro=0.0, ancho=2.5):
    return P.hoja3d(pie, az, e0, e1, L, ancho, 'cinta', mat, grupo, nervio=1, brillo=brillo,
                    pliegue=0.34, origen=origen, ancho_fijo=True, giro=giro)


def puerro_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('puerro', n)
    if n == 1:
        e.pon(*puerro_hoja(PIE, 200, 90, 48, 10.0, VERDE_PUERRO, 'b0', (0, 0, 0), ancho=1.5))
        e.pon(*puerro_hoja((cx + 0.5, cy), 330, 90, 60, 8.5, VERDE_PUERRO, 'b1', (0, 0, 0), ancho=1.4))
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE_PUERRO
    if n == 3:
        alto, grosor = 5.0, 5.0
        hojas = [(184, 86, 22, 16), (356, 86, 22, 16), (206, 88, 52, 18), (334, 88, 50, 18)]
    elif n == 4:
        alto, grosor = 10.0, 6.4
        hojas = [(180, 84, 6, 21), (2, 84, 6, 21), (196, 88, 34, 24), (346, 88, 32, 24),
                 (214, 90, 58, 23), (326, 90, 56, 22)]
    else:
        alto, grosor = 8.0, 6.0
        hojas = [(176, 40, -10, 19, 14), (6, 40, -10, 19, -14), (200, 54, -8, 20, 10),
                 (340, 54, -8, 20, -10), (230, 64, -6, 16, 0)]
    origen = (0.0, alto * 0.9, 0.0)
    for i, h in enumerate(hojas):
        az, e0, e1, L = h[:4]
        giro = h[4] if len(h) > 4 else 0.0
        az += r.uniform(-3, 3)
        L = jit(r, L, 0.05)
        e.pon(*puerro_hoja((cx, cy), az, e0, e1, L, mat, 'h%d' % i, origen,
                           brillo=(0.05 if i % 2 else -0.03), giro=giro,
                           ancho=(2.2 if seco else 2.6)))
    puerro_fuste(e, (cx, cy), alto, grosor, 100, podrido=seco)
    return e.render()


def puerro_item(podrido):
    e = esc()
    cx, cy = 32.0, 44.0
    mat = P.podrido(VERDE_PUERRO, 0.85) if podrido else VERDE_PUERRO
    for k, a in enumerate((72, 90, 108)):
        rz = P.Eje(P.arco((cx + (k - 1) * 1.6, cy + 1.0), a, 2.4, 0), P.const(0.45),
                   BLANCO_AJO, 4, modelo='tubo', grupo='raices')
        rz.fino = rz.S
        e.pon(rz)
    fuste = puerro_fuste(e, (cx, cy), 10.0, 6.0, 10, podrido=podrido)
    abre = 10 if podrido else 0
    for k, (a, L, cv) in enumerate(((-116 - abre, 8.6, -14), (-90, 9.6, 6), (-64 + abre, 8.6, 14))):
        S = P.arco((cx + (k - 1) * 1.2, cy - 9.0), a, L, cv)
        e.pon(P.Eje(S, P.forma('cinta', 2.3), mat, 5 + (0.3 if k == 1 else 0), grupo='hi%d' % k,
                    nervio=1, pliegue=0.32))
    return e.render()


def puerro_emblema():
    e = esc()
    S = P.arco((30.0, 35.0), -58, 4.6, 0)
    e.pon(P.Eje(S, P.const(1.5), BLANCO_PUERRO, 5, modelo='tubo', grupo='f', punta_clara=0.0,
                extra=degradado_eje(VERDE_CLARO_PUERRO, 0.4, 0.9)))
    for k, a in enumerate((-88, -36)):
        S = P.arco((32.4, 31.6), a, 2.6, 0)
        e.pon(P.Eje(S, P.forma('cinta', 1.2), VERDE_PUERRO, 4, grupo='h%d' % k, nervio=None))
    return e.render()


# ===========================================================================
# 7. PATATA
# ===========================================================================

PATATA = M(['#f8e4b8', '#e2c08a', '#cfa46a', '#b78a54', '#9b7044', '#7c5836', '#5f4329'], '#3b2917')
TALLO_VERDE = Material(rampa_hsv(88, 100, .62, .72, .74, .34, 6), '#223f14')
TALLO_SOMBRA = Material(rampa_hsv(96, 110, .70, .74, .44, .24, 5), '#16300f')

# la hoja de la patata es compuesta, pero a este tamano se dibuja con TRES
# foliolos grandes: con siete foliolos de 2 px la mata era ruido verde
FOL_PATATA = [
    (0.30, +1, 62, 0.32, 0.16, 'ovada', 8), (0.36, -1, 60, 0.32, 0.16, 'ovada', 8),
    (0.58, 0, 0, 0.44, 0.21, 'ovada'),
]


def patata_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('patata', n)
    V = VERDE['tomate']
    if n == 1:
        t, C3 = tallo_curvo(PIE, [(0, 0, 0), (0, 3.0, 0), (0.3, 5.0, 0)], 1.4, 1.2, TALLO_VERDE, 'tb')
        e.pon(t)
        for j, az in enumerate((200, 340)):
            e.pon(*hoja_comp3d(PIE, (0.2, 4.6, 0), az, 50, 20, 8.5, V, 'bh%d' % j, FOL_PATATA, raquis=1.0))
        return e.render()
    seco = n == 5
    mat = SECO if seco else V

    def hoja(origen, az, e0, e1, grupo, brillo):
        L = jit(r, (11.5 if n != 3 else 9.5) * (0.88 if seco else 1.0), 0.08)
        return hoja_comp3d(PIE, origen, az, e0, e1, L, mat, grupo, FOL_PATATA, raquis=1.0, brillo=brillo)
    if n == 3:
        copa(e, PIE, 8.0, 18.0, 13.0, 12, hoja, r, seco=False)
    else:
        copa(e, PIE, 10.5, 24.0, 16.0, 19, hoja, r, seco=seco, frente_vacio=(60, 120))
    if n in (4, 5):
        for k, (dx, dy, rx, ry, g) in enumerate(((-6.0, 4.0, 4.6, 3.6, -12), (3.8, 4.8, 4.2, 3.4, 18))):
            tuberculo(e, (cx + dx, cy + dy), rx, ry, PATATA, 120 + k, g, seco, 'pl%d%d' % (n, k),
                      recorte=suelo_rim(cx + dx, cy + dy + 1.2, rx * 1.05, 1.4))
    return e.render()


def patata_item(podrido):
    e = esc()
    tuberculo(e, (32.0, 32.0), 7.4, 5.8, PATATA, 10, -14, podrido, 'item')
    return e.render()


def patata_emblema():
    e = esc()
    tuberculo(e, (32.0, 32.0), 3.9, 3.0, PATATA, 10, -14, False, 'emb')
    return e.render()


# ===========================================================================
# 8. BONIATO
# ===========================================================================

BONIATO = M(['#f6a6ad', '#d9646f', '#c24e5d', '#a64051', '#893446', '#6c2a3a', '#52202d'], '#38141f')
TALLO_BONIATO = M(['#a7c07a', '#8fa863', '#7d8d55', '#6e7148', '#5f533d', '#4c3e31'], '#2b2219')


def boniato_guia(e, pie, az, largo, curva_az, nhojas, Lh, mat, mat_tallo, seco, r, k):
    """Una guia que se arrastra por el suelo con hojas acorazonadas en los nudos."""
    pts = []
    a = az
    for i in range(5):
        u = i / 4.0
        rr = largo * u
        pts.append((math.cos(math.radians(a)) * rr, 0.6 + 0.8 * math.sin(math.pi * u), math.sin(math.radians(a)) * rr))
        a += curva_az / 4.0
    t, C3 = tallo_curvo(pie, pts, 1.3, 1.0, mat_tallo, 'g%d' % k)
    e.pon(t)
    for j in range(nhojas):
        tt = 0.30 + 0.70 * j / max(1, nhojas - 1)
        p, d = P.en_curva3d(C3, tt)
        az_t, _ = P.az_el(d)
        lado = 1 if j % 2 else -1
        azh = az_t + lado * 50 + r.uniform(-10, 10)
        e0, e1 = (12, -12) if seco else (64, 18)
        L = jit(r, Lh, 0.1)
        borde = P.ondas(2, 0.16) if (j + k) % 3 == 0 else None
        e.pon(*P.hoja3d(pie, azh, e0, e1, L, 0.30 * L, 'corazon', mat, 'g%dh%d' % (k, j),
                        peciolo=0.38, grosor_peciolo=1.0, mat_peciolo=mat_tallo, origen=tuple(p),
                        nervio=2, brillo=(0.05 if (j + k) % 2 else -0.03), borde=borde))


def boniato_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('boniato', n)
    V = VERDE['tomate']
    if n == 1:
        t, C3 = tallo_curvo(PIE, [(0, 0, 0), (0.6, 3.0, 0), (1.2, 6.0, 0)], 1.4, 1.2, TALLO_BONIATO, 'tb')
        e.pon(t)
        for j, (az, h) in enumerate(((195, 3.2), (340, 5.6))):
            e.pon(*P.hoja3d(PIE, az, 46, 14, 7.5, 2.3, 'corazon', V, 'bh%d' % j, peciolo=0.3,
                            grosor_peciolo=1.0, mat_peciolo=TALLO_BONIATO, origen=(0.4 + j * 0.6, h, 0), nervio=1))
        return e.render()
    seco = n == 5
    mat = SECO if seco else V
    mt = P.SECO_OSCURO if seco else TALLO_BONIATO
    if n == 3:
        guias = [(200, 13, 30, 3), (320, 13, -30, 3), (265, 9, 10, 2)]
        Lh = 9.0
    else:
        guias = [(186, 18, 36, 4), (232, 16, 20, 3), (290, 16, -20, 3), (350, 18, -36, 4),
                 (130, 12, 24, 2), (50, 12, -24, 2)]
        Lh = 11.0
    for k, (az, L, cv, nh) in enumerate(guias):
        boniato_guia(e, PIE, az + r.uniform(-4, 4), L * (0.86 if seco else 1.0), cv, nh,
                     Lh * (0.9 if seco else 1.0), mat, mt, seco, r, k)
    if n in (4, 5):
        huso(e, (cx - 3.0, cy + 3.5), 12.0, 3.0, 12, 10, BONIATO, 130, 'tb0', seco, rid='p0')
        huso(e, (cx + 4.5, cy + 2.5), 10.0, 2.6, -20, -10, BONIATO, 129, 'tb1', seco, rid='p1')
    return e.render()


def boniato_item(podrido):
    e = esc()
    huso(e, (32.0, 32.0), 17.0, 4.6, -32, 14, BONIATO, 10, 'b', podrido, rid='item')
    return e.render()


def boniato_emblema():
    e = esc()
    huso(e, (32.0, 32.0), 7.6, 2.4, -36, 8, BONIATO, 10, 'b', False, rid='emb')
    return e.render()


# ===========================================================================
# 9. JENGIBRE
# ===========================================================================

JENGIBRE = M(['#fdebc6', '#efcd95', '#dfb579', '#c99b62', '#ab804e', '#8b663f', '#6c4e30'], '#45301c')
ROSA_JENGIBRE = M(['#ffd6cf', '#f5aca0', '#e48d82', '#c9736b', '#a85d58', '#874a46'], '#4a2826')


def jengibre_rizoma(e, c, s, podrido, z, recorte=None):
    """Rizoma: un cuerpo y tres dedos gordos (pocos y grandes, nada de bultitos)."""
    mat = P.podrido(JENGIBRE, 0.6) if podrido else JENGIBRE
    piezas = [((0, 0), 6.0, 3.6, -8), ((-5.2, -2.4), 3.6, 2.6, -40), ((4.6, -2.8), 3.4, 2.5, 35),
              ((6.4, 1.6), 3.0, 2.3, 12)]
    for k, ((dx, dy), rx, ry, g) in enumerate(piezas):
        ex = P.manchas_bola([(-0.2, 0.2, .5, .45)], MANCHA_OSCURA, 'jen%d' % k) if (podrido and k in (0, 2)) else None
        b = P.Bola((c[0] + dx * s, c[1] + dy * s), rx * s, ry * s, mat, z + (0.1 if k == 0 else 0),
                   giro=g, grupo='rizoma', extra=ex)
        b.recorte = recorte
        e.pon(b)
    if not podrido:
        # las puntas rosadas de los brotes nuevos
        for (dx, dy) in ((-7.6, -3.6), (6.8, -4.4)):
            b = P.Bola((c[0] + dx * s, c[1] + dy * s), 1.4 * s, 1.2 * s, ROSA_JENGIBRE, z - 0.1, grupo='rizoma')
            b.recorte = recorte
            e.pon(b)


def jengibre_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('jengibre', n)
    V = VERDE['tomate']
    if n == 1:
        t, C3 = tallo_curvo(PIE, [(0, 0, 0), (0, 5.0, 0), (0.4, 9.0, 0)], 1.8, 1.2, TALLO_VERDE, 'tb')
        e.pon(t)
        for j, (tt, az) in enumerate(((0.55, 190), (0.85, 345))):
            p, d = P.en_curva3d(C3, tt)
            e.pon(*P.hoja3d(PIE, az, 34, -4, 8.5, 1.5, 'lanceolada', V, 'bh%d' % j, origen=tuple(p), nervio=1))
        return e.render()
    seco = n == 5
    mat = SECO if seco else V
    if n == 3:
        tallos = [(-2.0, 0.0, 14.0, -4), (2.0, -1.0, 18.0, 4)]
        hojas_por = 3
        Lh = 11.0
    else:
        tallos = [(-4.5, 0.5, 17.0, -8), (-1.0, -1.5, 23.0, -2), (2.5, 0.0, 21.0, 5), (5.5, 1.0, 15.0, 10)]
        hojas_por = 4
        Lh = 13.0
    for k, (dx, dz, h, inc) in enumerate(tallos):
        h = jit(r, h, 0.05)
        top = (dx + inc * (0.5 if not seco else 1.1), h * (1.0 if not seco else 0.84), dz)
        mid = (dx + inc * (0.2 if not seco else 0.45), h * (0.5 if not seco else 0.46), dz)
        t, C3 = tallo_curvo(PIE, [(dx * 0.6, 0, dz), mid, top], 1.8, 1.2, SECO if seco else TALLO_VERDE, 's%d' % k)
        e.pon(t)
        for j in range(hojas_por):
            tt = 0.38 + 0.62 * j / max(1, hojas_por - 1)
            p, d = P.en_curva3d(C3, tt)
            lado = 1 if (j + k) % 2 else -1
            az = (0 if lado > 0 else 180) + r.uniform(-18, 18)
            e0, e1 = (40, -18) if seco else (50, 6)
            L = jit(r, Lh * (0.75 + 0.25 * (1 - abs(tt - 0.6))) * (0.84 if seco else 1.0), 0.08)
            e.pon(*P.hoja3d(PIE, az, e0, e1, L, 2.0, 'lanceolada', mat, 's%dh%d' % (k, j),
                            origen=tuple(p), nervio=1, brillo=(0.05 if (j + k) % 2 else -0.03)))
    if n in (4, 5):
        jengibre_rizoma(e, (cx, cy + 2.5), 0.85, seco, 130, recorte=suelo_rim(cx, cy + 3.6, 9.0, 1.6))
    return e.render()


def jengibre_item(podrido):
    e = esc()
    jengibre_rizoma(e, (32.0, 33.0), 0.86, podrido, 10)
    return e.render()


def jengibre_emblema():
    e = esc()
    jengibre_rizoma(e, (32.0, 33.0), 0.42, False, 10)
    return e.render()


# ===========================================================================
# 10. ALBAHACA
# ===========================================================================

VERDE_ALBAHACA = Material(rampa_hsv(86, 104, .76, .82, .92, .32, 8), '#1a3a10')
SECO_NEGRO = M(['#8a7a52', '#6f5f3f', '#5a4c33', '#473b29', '#372d20', '#2a2219'], '#1c160f')


def albahaca_etapa(n):
    e = esc()
    r = rng('albahaca', n)
    if n == 1:
        brote_cotiledones(e, PIE, VERDE_ALBAHACA, largo=6.4, ancho=3.0, abre=70, curva=10, alto=4.0)
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE_ALBAHACA

    def hoja(origen, az, e0, e1, grupo, brillo):
        # la de albahaca: ovada, ahuecada y brillante, con un rabito corto
        L = jit(r, (9.5 if n != 3 else 8.0) * (0.9 if seco else 1.0), 0.08)
        return P.hoja3d(PIE, az, e0, e1, L, 0.29 * L, 'ovada', mat, grupo, peciolo=0.16,
                        grosor_peciolo=1.0, origen=origen, nervio=1, copa=0.24, pliegue=0.16,
                        brillo=brillo + 0.04)
    if n == 3:
        copa(e, PIE, 8.0, 17.0, 13.0, 12, hoja, r, seco=False, giro0=20)
    else:
        copa(e, PIE, 11.0, 26.0, 19.0, 21, hoja, r, seco=seco, giro0=20)
    return e.render()


def albahaca_item(podrido):
    e = esc()
    mat = SECO_NEGRO if podrido else VERDE_ALBAHACA
    cx, cy = 32.0, 44.0
    S = P.arco((cx, cy), -90 + (16 if podrido else 0), 19.0, 10 if podrido else -4)
    e.pon(P.Tallo(S, 1.4, 1.2, P.podrido(TALLO_VERDE, 0.8) if podrido else TALLO_VERDE, 0, grupo='t'))
    T = P.tangentes(S)
    for j, (tt, L) in enumerate(((0.40, 8.0), (0.66, 7.0), (0.92, 5.5))):
        k = int(tt * (len(S) - 1))
        base = S[k]
        for s in (-1, 1):
            a = P.ang_de(T[k]) + s * (62 if not podrido else 92)
            Sh = P.arco(base, a, L, s * (14 if not podrido else 40))
            e.pon(P.Eje(Sh, P.forma('ovada', 0.27 * L * 1.9), mat, 1 + j * 0.1 + s * 0.01,
                        grupo='h%d%d' % (j, s), nervio=1, copa=0.22, pliegue=0.18))
    return e.render()


def albahaca_emblema():
    e = esc()
    for k, (a, L) in enumerate(((-130, 4.6), (-90, 5.2), (-50, 4.6))):
        S = P.arco((32.0, 36.0), a, L, 0)
        e.pon(P.Eje(S, P.forma('ovada', 1.7), VERDE_ALBAHACA, 1 + (0.2 if k == 1 else 0),
                    grupo='h%d' % k, nervio=None, copa=0.2))
    return e.render()


# ===========================================================================
# HOJAS DE HUERTA (lechuga, col, espinaca...)
# ===========================================================================

def anillos(e, pie, anillos_def, mat_por_anillo, r, seco, forma_hoja, borde_fn=None, peciolo=0.12,
            grosor_peciolo=1.2, mat_peciolo=None, nervio=2, nervios=None, origen_y=0.0, giro0=0.0,
            copa_h=0.12, grupo='a'):
    """
    Una roseta en anillos: los de fuera tumbados y grandes, los de dentro de pie
    y pequenos. anillos_def = [(n, el0, el1, largo, ancho_rel), ...] de fuera a dentro.
    """
    for ia, (n, e0, e1, L, ar) in enumerate(anillos_def):
        mat = mat_por_anillo[min(ia, len(mat_por_anillo) - 1)]
        for k in range(n):
            az = giro0 + ia * 37 + k * 360.0 / n + r.uniform(-9, 9)
            LL = jit(r, L, 0.07)
            a0, a1 = e0, e1
            if seco:
                a0, a1, LL = secar(a0, a1, LL)
            borde = borde_fn(ia, k) if borde_fn else None
            e.pon(*P.hoja3d(pie, az, a0, a1, LL, ar * LL, forma_hoja, mat, '%s%d_%d' % (grupo, ia, k),
                            peciolo=peciolo, grosor_peciolo=grosor_peciolo,
                            mat_peciolo=mat_peciolo, origen=(0.0, origen_y, 0.0), nervio=nervio,
                            nervios=nervios, borde=borde, copa=copa_h,
                            brillo=(0.05 if (k + ia) % 2 else -0.03)))


def rizado(n, prof, fase=0.0):
    """Borde de lechuga o col rizada: ondas finas e irregulares."""
    return P.ondas(n, prof, fase=fase, t0=0.05, t1=0.99, irregular=0.45)


# ===========================================================================
# 11. LECHUGA
# ===========================================================================

LECHUGA_FUERA = Material(rampa_hsv(80, 98, .62, .80, .88, .38, 8), '#22420f')
LECHUGA_DENTRO = Material(rampa_hsv(72, 88, .52, .74, .97, .50, 8), '#2a4a12')


def lechuga_etapa(n):
    e = esc()
    r = rng('lechuga', n)
    if n == 1:
        brote_cotiledones(e, PIE, LECHUGA_FUERA, largo=6.4, ancho=2.8, abre=64, curva=10, alto=3.0)
        e.pon(*P.hoja3d(PIE, 270, 88, 70, 5.0, 2.0, 'redonda', LECHUGA_DENTRO, 'b3', origen=(0, 2.4, 0), nervio=None))
        return e.render()
    seco = n == 5
    if n == 3:
        defs = [(6, 34, 4, 11.5, 0.46), (4, 70, 40, 8.0, 0.5), (2, 86, 66, 5.5, 0.55)]
    else:
        defs = [(8, 30, -2, 16.0, 0.44), (6, 62, 30, 12.0, 0.48), (4, 80, 56, 8.5, 0.52), (2, 88, 74, 5.5, 0.56)]
    mats = [SECO] if seco else [LECHUGA_FUERA, LECHUGA_FUERA, LECHUGA_DENTRO, LECHUGA_DENTRO]
    anillos(e, PIE, defs, mats, r, seco, 'redonda',
            borde_fn=lambda ia, k: rizado(4 + ia, 0.13, fase=k * 1.3), peciolo=0.10, nervio=1,
            nervios=(3.2, 40, 1), copa_h=0.18)
    return e.render()


def cabeza_hojas(e, c, s, mat_f, mat_d, podrido, r, grupo='cab', abrir=0.0):
    """Una cabeza de lechuga suelta (item): roseta pequena vista algo de lado."""
    defs = [(6, 28 - abrir, -6 - abrir, 9.5 * s, 0.48), (5, 62, 26, 7.5 * s, 0.5), (3, 84, 60, 5.0 * s, 0.56)]
    mats = [mat_f, mat_f, mat_d]
    anillos(e, c, defs, mats, r, False, 'redonda',
            borde_fn=lambda ia, k: rizado(3 + ia, 0.13, fase=k * 1.1), peciolo=0.08, nervio=1,
            copa_h=0.18, grupo=grupo)


def lechuga_item(podrido):
    e = esc()
    r = rng('lechuga', 'item')
    mf = P.podrido(LECHUGA_FUERA, 0.85) if podrido else LECHUGA_FUERA
    md = P.podrido(LECHUGA_DENTRO, 0.7) if podrido else LECHUGA_DENTRO
    cabeza_hojas(e, (32.0, 38.0), 0.88, mf, md, podrido, r, abrir=(10 if podrido else 0))
    return e.render()


def lechuga_emblema():
    e = esc()
    r = rng('lechuga', 'emb')
    defs = [(5, 30, 0, 5.0, 0.5), (3, 80, 56, 3.2, 0.6)]
    anillos(e, (32.0, 36.0), defs, [LECHUGA_FUERA, LECHUGA_DENTRO], r, False, 'redonda',
            peciolo=0.0, nervio=None, copa_h=0.18)
    return e.render()


# ===========================================================================
# 12. REPOLLO
# ===========================================================================

VERDE_COL = Material(rampa_hsv(100, 142, .34, .50, .84, .30, 8), '#173327')
COGOLLO = Material(rampa_hsv(76, 104, .26, .52, .97, .48, 8), '#28451f')


def repollo_cabeza(e, c, rx, ry, podrido, z):
    mat = P.podrido(COGOLLO, 0.7) if podrido else COGOLLO
    ex = P.encadena(P.meridianos([-62, -28, 34], mat, pasos=2, grosor=0.05, v_lim=(-0.9, 0.7)),
                    P.manchas_bola([(-0.3, 0.2, .42, .34), (0.42, -0.25, .3, .28)], MANCHA, 'col') if podrido else None)
    e.pon(P.Bola(c, rx, ry, mat, z, grupo='cogollo', extra=ex))


def repollo_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('repollo', n)
    if n == 1:
        brote_cotiledones(e, PIE, VERDE_COL, largo=7.0, ancho=3.4, abre=68, curva=14)
        return e.render()
    seco = n == 5
    if n == 3:
        defs = [(6, 40, 6, 13.0, 0.50), (3, 76, 50, 9.0, 0.52)]
    else:
        defs = [(7, 30, -4, 17.0, 0.50), (5, 52, 14, 14.0, 0.52)]
    mats = [SECO] if seco else [VERDE_COL]
    anillos(e, PIE, defs, mats, r, seco, 'redonda', borde_fn=lambda ia, k: P.ondas(3, 0.08, fase=k),
            peciolo=0.10, nervio=1, nervios=(3.6, 45, 1), copa_h=0.2)
    if n in (4, 5):
        repollo_cabeza(e, (cx, cy - 6.0), 8.6, 7.8, seco, 200)
    return e.render()


def repollo_item(podrido):
    e = esc()
    c = (32.0, 33.0)
    repollo_cabeza(e, c, 8.4, 7.6, podrido, 10)
    mat = P.podrido(VERDE_COL, 0.85) if podrido else VERDE_COL
    # dos hojas de fuera que todavia la abrazan por abajo
    for s in (-1, 1):
        S = P.arco((c[0] + s * 1.0, c[1] + 6.4), -90 - s * 72, 10.0, s * 46)
        e.pon(P.Eje(S, P.forma('redonda', 3.4), mat, 12, grupo='env%d' % s, nervio=1))
    return e.render()


def repollo_emblema():
    e = esc()
    e.pon(P.Bola((32.0, 32.0), 4.2, 3.8, COGOLLO, 10, grupo='c',
                 extra=P.meridianos([-40, 30], COGOLLO, pasos=2, grosor=0.08)))
    return e.render()


# ===========================================================================
# 13. ESPINACA
# ===========================================================================

VERDE_ESPINACA = Material(rampa_hsv(96, 116, .72, .82, .70, .24, 8), '#122d10')


def espinaca_hoja(pie, az, e0, e1, L, mat, grupo, brillo=0.0, origen=(0, 0, 0)):
    return P.hoja3d(pie, az, e0, e1, L, 0.21 * L, 'ovada', mat, grupo, peciolo=0.34,
                    grosor_peciolo=1.1, nervio=2, brillo=brillo + 0.05, borde=P.ondas(3, 0.07),
                    origen=origen, copa=0.16)


def espinaca_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('espinaca', n)
    if n == 1:
        brote_cotiledones(e, PIE, VERDE_ESPINACA, largo=8.0, ancho=1.8, abre=56, curva=10,
                          forma_nombre='cinta')
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE_ESPINACA
    if n == 3:
        hojas = [(190, 56, 18, 14), (232, 66, 32, 15), (272, 74, 44, 16), (312, 66, 32, 15),
                 (354, 56, 18, 14), (140, 60, 20, 11), (40, 60, 20, 11)]
    else:
        hojas = [(180, 50, 6, 20), (206, 60, 18, 21), (236, 70, 32, 22), (268, 76, 44, 21),
                 (300, 70, 32, 22), (330, 60, 18, 21), (0, 50, 6, 20), (150, 56, 12, 16), (30, 56, 12, 16)]
    roseta(e, PIE, hojas, espinaca_hoja, mat, seco, r)
    return e.render()


def manojo(e, c, hojas, mat, grupo='m', fabrica=None, mat_peciolo=None, grosor=1.1, forma_h='ovada',
           ancho_rel=0.22, peciolo=0.38, borde=None, nervio=2, z0=0):
    """Un manojo atado: hojas en abanico que se juntan abajo en un punto."""
    for k, (a, L, cv) in enumerate(hojas):
        S = P.arco(c, a, L, cv)
        kk = max(2, int(round(peciolo * (len(S) - 1))))
        pec = P.Eje(S[:kk + 1], P.const(grosor / 2.0), mat_peciolo or mat, z0 + k * 0.1 + 0.01,
                    modelo='tubo', grupo='%s%d' % (grupo, k), punta_clara=0.0)
        if grosor < 1.6:
            pec.fino = pec.S
        lam = P.Eje(P.remuestrear(S[kk:], 24), P.forma(forma_h, ancho_rel * L), mat, z0 + k * 0.1,
                    grupo='%s%d' % (grupo, k), nervio=nervio, borde=borde)
        e.pon(pec, lam)


def espinaca_item(podrido):
    e = esc()
    mat = P.podrido(VERDE_ESPINACA, 0.9) if podrido else VERDE_ESPINACA
    abre = 1.25 if podrido else 1.0
    hojas = [(-90 - 22 * abre, 14.0, -8), (-90 + 22 * abre, 14.0, 8), (-90 - 7 * abre, 16.0, -3),
             (-90 + 7 * abre, 16.0, 3)]
    manojo(e, (32.0, 44.0), hojas, mat, borde=P.ondas(3, 0.07), ancho_rel=0.2)
    return e.render()


def espinaca_emblema():
    e = esc()
    manojo(e, (32.0, 38.0), [(-116, 6.2, -6), (-64, 6.2, 6), (-90, 7.0, 0)], VERDE_ESPINACA,
           ancho_rel=0.24, peciolo=0.3, nervio=None)
    return e.render()


# ===========================================================================
# 14. ACELGA
# ===========================================================================

VERDE_ACELGA = Material(rampa_hsv(92, 112, .70, .80, .72, .25, 8), '#132e10')
PENCA_ROJA = M(['#ff8a94', '#ec4a5c', '#d23a4e', '#b02f43', '#8e2638', '#6d1e2d'], '#44101b')
PENCA_AMARILLA = M(['#fff4b0', '#fbd85e', '#ecc142', '#d3a634', '#b0882b', '#8a6a22'], '#4a3812')
PENCA_BLANCA = M(['#ffffff', '#f4f2e6', '#e2dfcd', '#c9c4ac', '#a8a28a', '#85806b'], '#45412f')
PENCAS = [PENCA_ROJA, PENCA_AMARILLA, PENCA_BLANCA]


def acelga_hoja(pie, az, e0, e1, L, mat, grupo, brillo=0.0, penca=PENCA_ROJA, seco=False):
    vena = None if seco else penca.rampa[2]
    return P.hoja3d(pie, az, e0, e1, L, 0.24 * L, 'ovada', mat, grupo, peciolo=0.32,
                    grosor_peciolo=2.0, mat_peciolo=(P.SECO_OSCURO if seco else penca), nervio=vena,
                    brillo=brillo, borde=P.ondas(4, 0.12), nervios=(3.0, 40, 1), copa=0.16)


def acelga_etapa(n):
    e = esc()
    r = rng('acelga', n)
    if n == 1:
        brote_cotiledones(e, PIE, VERDE_ACELGA, largo=8.0, ancho=1.9, abre=58, curva=12,
                          mat_tallo=PENCA_ROJA, forma_nombre='cinta')
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE_ACELGA
    if n == 3:
        hojas = [(200, 70, 34, 16), (248, 80, 52, 17), (292, 80, 50, 17), (340, 70, 32, 16), (150, 74, 40, 13)]
    else:
        hojas = [(190, 68, 22, 22), (222, 76, 40, 24), (256, 82, 56, 25), (288, 82, 54, 25),
                 (320, 76, 38, 24), (352, 68, 20, 22), (150, 72, 30, 18), (30, 72, 30, 18)]
    for i, (az, e0, e1, L) in enumerate(hojas):
        az += r.uniform(-5, 5)
        L = jit(r, L, 0.06)
        if seco:
            e0, e1, L = secar(e0, e1, L)
        e.pon(*acelga_hoja(PIE, az, e0, e1, L, mat, 'h%d' % i, brillo=(0.05 if i % 2 else -0.03),
                           penca=PENCAS[i % 3], seco=seco))
    return e.render()


def acelga_item(podrido):
    e = esc()
    mat = P.podrido(VERDE_ACELGA, 0.9) if podrido else VERDE_ACELGA
    abre = 1.2 if podrido else 1.0
    hojas = [(-90 - 17 * abre, 17.0, -6), (-90 + 17 * abre, 17.0, 6), (-90, 19.0, 0)]
    for k, h in enumerate(hojas):
        manojo(e, (32.0 + (k - 1) * 0.6, 45.0), [h], mat, grupo='m%d' % k,
               mat_peciolo=(P.podrido(PENCAS[k], 0.7) if podrido else PENCAS[k]), grosor=2.2,
               ancho_rel=0.25, peciolo=0.36, borde=P.ondas(4, 0.12), z0=k)
    return e.render()


def acelga_emblema():
    e = esc()
    manojo(e, (32.0, 39.0), [(-90, 7.6, 0)], VERDE_ACELGA, mat_peciolo=PENCA_ROJA, grosor=1.6,
           ancho_rel=0.28, peciolo=0.34, nervio=None)
    return e.render()


# ===========================================================================
# 15. APIO
# ===========================================================================

PENCA_APIO = Material(rampa_hsv(78, 98, .30, .58, .95, .44, 7), '#2a461b')
VERDE_APIO = VERDE['zanahoria']


def apio_rama(pie, az, el, L, grosor, mat_p, mat_h, grupo, origen=(0, 0, 0), brillo=0.0, seco=False):
    """Una penca de apio: un tallo grueso y acanalado con un penacho de hojuelas arriba."""
    piezas = []
    P3 = P.espina3d(az, el, el - (40 if seco else 12), L, origen=origen)
    S = P.proyecta(pie, P3)
    z = float(P3[:, 2].mean())
    w = P.suave([0, .6, 1], [grosor / 2 * 1.15, grosor / 2, grosor / 2 * 0.8])
    tallo = P.Eje(P.remuestrear(S, 32), w, mat_p, z, modelo='tubo', grupo=grupo, punta_clara=0.2,
                  extra=P.rayas_eje(3, 0.22, P.desplaza(mat_p, 1)))
    tallo.tapas = True
    piezas.append(tallo)
    top = P3[-1]
    d = P3[-1] - P3[-4]
    a_t, e_t = P.az_el(d / max(1e-9, np.linalg.norm(d)))
    for j, (da, de, Lh) in enumerate(((-38, -10, 6.0), (36, -14, 6.0), (0, 8, 6.8))):
        piezas += P.hoja3d(pie, a_t + da, e_t + de, e_t + de - 30, Lh, 2.0, 'ovada', mat_h,
                           grupo, origen=tuple(top), nervio=None, borde=P.dientes(3, 0.28),
                           brillo=brillo + (0.04 if j == 2 else 0.0))
    return piezas


def apio_etapa(n):
    e = esc()
    r = rng('apio', n)
    if n == 1:
        brote_cotiledones(e, PIE, VERDE_APIO, largo=5.6, ancho=2.0, abre=62, curva=10, alto=3.0)
        return e.render()
    seco = n == 5
    mp = P.podrido(PENCA_APIO, 0.6) if seco else PENCA_APIO
    mh = SECO if seco else VERDE_APIO
    if n == 3:
        ramas = [(200, 76, 12), (240, 82, 14), (270, 86, 15), (300, 82, 14), (340, 76, 12)]
        g = 2.4
    else:
        ramas = [(190, 72, 19), (214, 78, 22), (240, 84, 24), (262, 87, 25), (282, 86, 25),
                 (304, 84, 24), (328, 78, 22), (350, 72, 19), (130, 80, 17), (50, 80, 17)]
        g = 3.0
    for i, (az, el, L) in enumerate(ramas):
        az += r.uniform(-4, 4)
        L = jit(r, L, 0.05) * (0.92 if seco else 1.0)
        el = el * (0.86 if seco else 1.0)
        e.pon(*apio_rama(PIE, az, el, L, g, mp, mh, 'r%d' % i, brillo=(0.05 if i % 2 else -0.03), seco=seco))
    return e.render()


def apio_item(podrido):
    e = esc()
    mp = P.podrido(PENCA_APIO, 0.75) if podrido else PENCA_APIO
    mh = P.podrido(VERDE_APIO, 0.9) if podrido else VERDE_APIO
    cae = 1.0
    for k, (a, L) in enumerate(((-99, 15.0), (-81, 15.0), (-93, 16.5), (-87, 16.0))):
        a = a + (4 if podrido else 0)
        S = P.arco((32.0 + (k - 1.5) * 1.8, 44.0), a, L * (0.94 if podrido else 1.0),
                   (k - 1.5) * 4 * cae + (5 if podrido else 0))
        e.pon(P.Eje(S, P.suave([0, .6, 1], [1.6, 1.4, 1.2]), mp, k * 0.1, modelo='tubo',
                    grupo='p%d' % k, punta_clara=0.2, extra=P.rayas_eje(3, 0.22, P.desplaza(mp, 1))))
        top = S[-1]
        for j, da in enumerate((-40, 0, 40)):
            Sh = P.arco(top, a + da, 4.6, 0)
            e.pon(P.Eje(Sh, P.forma('ovada', 1.6), mh, k * 0.1 + 0.05, grupo='p%d' % k, nervio=None,
                        borde=P.dientes(2, 0.25)))
    return e.render()


def apio_emblema():
    e = esc()
    for k, a in enumerate((-100, -80)):
        S = P.arco((32.0 + (k - 0.5) * 2.0, 38.0), a, 4.6, 0)
        e.pon(P.Eje(S, P.const(0.9), PENCA_APIO, k * 0.1, modelo='tubo', grupo='p%d' % k))
        Sh = P.arco(S[-1], a, 2.2, 0)
        e.pon(P.Eje(Sh, P.forma('ovada', 1.4), VERDE_APIO, k * 0.1 + 0.05, grupo='p%d' % k, nervio=None))
    return e.render()


# ===========================================================================
# 16. COL RIZADA
# ===========================================================================

VERDE_KALE = Material(rampa_hsv(118, 152, .30, .46, .74, .26, 8), '#13291f')
TALLO_KALE = Material(rampa_hsv(120, 140, .22, .34, .80, .40, 6), '#1c3226')


# La col rizada no es una hoja con dientes: es un raquis con lobulos rizados a
# los dos lados. Asi, cada lobulo coge su luz y el borde sale ondulado de verdad.
FOL_KALE = [
    (0.24, +1, 58, 0.16, 0.085, 'redonda', 0, P.ondas(2, 0.22)),
    (0.32, -1, 56, 0.17, 0.090, 'redonda', 0, P.ondas(2, 0.22)),
    (0.42, +1, 54, 0.18, 0.095, 'redonda', 0, P.ondas(2, 0.22)),
    (0.51, -1, 52, 0.18, 0.095, 'redonda', 0, P.ondas(2, 0.22)),
    (0.60, +1, 50, 0.17, 0.090, 'redonda', 0, P.ondas(2, 0.22)),
    (0.69, -1, 48, 0.16, 0.085, 'redonda', 0, P.ondas(2, 0.22)),
    (0.78, +1, 44, 0.14, 0.080, 'redonda', 0, P.ondas(2, 0.22)),
    (0.82, 0, 0, 0.20, 0.090, 'redonda', 0, P.ondas(2, 0.22)),
]


def kale_hoja(pie, az, e0, e1, L, mat, grupo, brillo=0.0, origen=(0, 0, 0)):
    seco = mat is SECO
    return hoja_comp3d(pie, origen, az, e0, e1, L, mat, grupo, FOL_KALE, raquis=1.4, brillo=brillo,
                       raquis_mat=(P.SECO_OSCURO if seco else TALLO_KALE), nervio=1)


def col_rizada_etapa(n):
    e = esc()
    r = rng('col_rizada', n)
    if n == 1:
        brote_cotiledones(e, PIE, VERDE_KALE, largo=7.0, ancho=3.2, abre=66, curva=14)
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE_KALE
    if n == 3:
        hojas = [(196, 64, 24, 15), (240, 76, 44, 16), (300, 76, 42, 16), (344, 64, 22, 15), (150, 68, 30, 12)]
        alto = 2.0
    else:
        hojas = [(186, 58, 8, 21), (214, 68, 26, 23), (246, 78, 46, 24), (282, 82, 56, 24),
                 (316, 76, 42, 23), (346, 66, 22, 22), (140, 64, 20, 18), (36, 64, 20, 18)]
        alto = 4.0
    t, _ = tallo_curvo(PIE, [(0, 0, 0), (0, alto, 0)], 3.0, 2.6, P.SECO_OSCURO if seco else TALLO_KALE, 'tk')
    e.pon(t)
    roseta(e, PIE, hojas, kale_hoja, mat, seco, r, origen=(0, alto, 0))
    return e.render()


def col_rizada_item(podrido):
    e = esc()
    mat = P.podrido(VERDE_KALE, 0.9) if podrido else VERDE_KALE
    S = P.arco((27.0, 44.0), -68 + (10 if podrido else 0), 23.0, 16 if podrido else 8)
    L = 23.0
    fol = [(t, lado, ang, lr * L, wr * L, fm, cv, b) for (t, lado, ang, lr, wr, fm, cv, b) in FOL_KALE]
    e.pon(*P.hoja_compuesta(S, mat, 0, 'k', fol, raquis=1.4,
                            raquis_mat=(P.podrido(TALLO_KALE, 0.8) if podrido else TALLO_KALE), nervio=1))
    return e.render()


def col_rizada_emblema():
    e = esc()
    S = P.arco((30.5, 36.0), -58, 7.6, 8)
    L = 7.6
    fol = [(t, lado, ang, lr * L * 1.3, wr * L * 1.3, fm, cv, b) for (t, lado, ang, lr, wr, fm, cv, b) in FOL_KALE[1::2]]
    e.pon(*P.hoja_compuesta(S, VERDE_KALE, 0, 'k', fol, raquis=1.0, raquis_mat=TALLO_KALE, nervio=None))
    return e.render()


# ===========================================================================
# 17. COL CHINA (pak choi)
# ===========================================================================

PENCA_CHOI = M(['#ffffff', '#f3f6ee', '#e1ead8', '#c8d7bc', '#a8bc9b', '#869b7a'], '#3a4b33')
VERDE_CHOI = Material(rampa_hsv(96, 120, .66, .78, .66, .22, 8), '#112a10')


def choi_hoja(pie, az, e0, e1, L, mat_h, mat_p, grupo, brillo=0.0, ancho_p=3.2):
    """Penca blanca y ancha como una cuchara, con la lamina verde y redonda arriba."""
    P3 = P.espina3d(az, e0, e1, L)
    S = P.proyecta(pie, P3)
    z = float(P3[:, 2].mean())
    k = int(0.58 * (len(S) - 1))
    pec = P.Eje(P.remuestrear(S[:k + 1], 16), P.suave([0, 1], [ancho_p * 0.34, ancho_p * 0.56]), mat_p, z + 0.01,
                modelo='tubo', grupo=grupo, punta_clara=0.0)
    lam = P.Eje(P.remuestrear(S[k - 1:], 24), P.forma('redonda', 0.19 * L), mat_h, z, grupo=grupo,
                nervio=2, nervio_t=(0.0, 0.6), copa=0.18)
    lam.brillo0 += brillo
    return [pec, lam]


def col_china_etapa(n):
    e = esc()
    r = rng('col_china', n)
    if n == 1:
        brote_cotiledones(e, PIE, VERDE_CHOI, largo=6.6, ancho=3.0, abre=62, curva=12, mat_tallo=PENCA_CHOI)
        return e.render()
    seco = n == 5
    mh = SECO if seco else VERDE_CHOI
    mp = P.podrido(PENCA_CHOI, 0.6) if seco else PENCA_CHOI
    if n == 3:
        hojas = [(190, 74, 40, 15), (238, 82, 58, 16), (302, 82, 56, 16), (350, 74, 38, 15)]
        ap = 3.0
    else:
        hojas = [(176, 66, 30, 22), (206, 74, 44, 24), (240, 82, 60, 25), (272, 86, 70, 26),
                 (304, 82, 58, 25), (338, 74, 42, 24), (4, 66, 28, 22)]
        ap = 4.0
    for i, (az, e0, e1, L) in enumerate(hojas):
        az += r.uniform(-4, 4)
        L = jit(r, L, 0.05)
        if seco:
            e0, e1, L = secar(e0, e1, L)
        e.pon(*choi_hoja(PIE, az, e0, e1, L, mh, mp, 'h%d' % i, brillo=(0.05 if i % 2 else -0.03), ancho_p=ap))
    return e.render()


def col_china_item(podrido):
    e = esc()
    r = rng('col_china', 'item')
    mh = P.podrido(VERDE_CHOI, 0.9) if podrido else VERDE_CHOI
    mp = P.podrido(PENCA_CHOI, 0.7) if podrido else PENCA_CHOI
    hojas = [(212, 78, 52, 17), (328, 78, 50, 17), (246, 85, 64, 19), (294, 85, 62, 19), (270, 88, 74, 20)]
    for i, (az, e0, e1, L) in enumerate(hojas):
        if podrido:
            e0, e1, L = e0 - 4, e1 - 14, L * 0.94
        e.pon(*choi_hoja((32.0, 46.0), az, e0, e1, L, mh, mp, 'h%d' % i, brillo=(0.05 if i % 2 else -0.03), ancho_p=3.6))
    return e.render()


def col_china_emblema():
    e = esc()
    for i, (az, L) in enumerate(((205, 6.4), (335, 6.4), (270, 7.4))):
        e.pon(*choi_hoja((32.0, 40.0), az, 80, 60, L, VERDE_CHOI, PENCA_CHOI, 'h%d' % i, ancho_p=2.0))
    return e.render()


# ===========================================================================
# 18. HINOJO
# ===========================================================================

BULBO_HINOJO = Material(rampa_hsv(70, 92, .10, .34, 1.0, .58, 7), '#3a4a2a')
TALLO_HINOJO = Material(rampa_hsv(84, 100, .32, .56, .90, .44, 6), '#26421a')
VERDE_HINOJO = Material(rampa_hsv(84, 100, .70, .78, .90, .36, 8), '#1f3e12')


def hinojo_bulbo(e, c, s, podrido, z, recorte=None):
    mat = P.podrido(BULBO_HINOJO, 0.65) if podrido else BULBO_HINOJO

    def forma(th):
        return 1.0 - 0.10 * np.clip(-np.sin(th), 0, 1) ** 2
    ex = P.encadena(P.meridianos([-52, -14, 26, 60], mat, pasos=1, grosor=0.05, v_lim=(-0.6, 0.95)),
                    P.manchas_bola([(-0.3, 0.3, .4, .3), (0.4, -0.1, .3, .3)], MANCHA, 'hin') if podrido else None)
    b = P.Bola(c, 7.2 * s, 6.0 * s, mat, z, grupo='bulbo', radio=forma, extra=ex)
    b.recorte = recorte
    e.pon(b)


def penacho(pie, origen, az, el, L, mat, grupo, brillo=0.0):
    """Hoja plumosa del hinojo: un plumero de borde muy fino, nunca hilos sueltos."""
    if mat is SECO:
        # seco, el plumero fino se leia como una garra: mas lleno y de borde suave
        return P.hoja3d(pie, az, el, el - 30, L, 0.22 * L, 'eliptica', mat, grupo, origen=origen,
                        nervio=None, borde=P.dientes(5, 0.40), brillo=brillo, pliegue=0.10, copa=0.04)
    return P.hoja3d(pie, az, el, el - 30, L, 0.15 * L, 'lanceolada', mat, grupo, origen=origen,
                    nervio=None, borde=P.dientes(9, 0.62), brillo=brillo, pliegue=0.10, copa=0.04)


def hinojo_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('hinojo', n)
    if n == 1:
        brote_hebras(e, PIE, VERDE_HINOJO, [(-112, 7.0, -10), (-70, 7.0, 10), (-90, 8.5, 0)], grosor=1.4)
        return e.render()
    seco = n == 5
    mt = P.podrido(TALLO_HINOJO, 0.6) if seco else TALLO_HINOJO
    mh = SECO if seco else VERDE_HINOJO
    if n == 3:
        tallos = [(220, 74, 10), (270, 84, 12), (320, 74, 10)]
        Lp, bulbo = 10.0, 0.0
    else:
        tallos = [(200, 68, 14), (236, 78, 17), (270, 86, 19), (304, 78, 17), (340, 68, 14)]
        Lp, bulbo = 13.0, 1.0
    oy = 4.5 if bulbo else 0.0
    for i, (az, el, L) in enumerate(tallos):
        az += r.uniform(-4, 4)
        if seco:
            el, L = el * 0.74, L * 0.86
        P3 = P.espina3d(az, el, el - (30 if seco else 8), L, origen=(0, oy, 0))
        S = P.proyecta(PIE, P3)
        t = P.Tallo(P.remuestrear(S, 24), 1.8, 1.4, mt, float(P3[:, 2].mean()), grupo='t%d' % i)
        e.pon(t)
        d = P3[-1] - P3[-3]
        a_t, e_t = P.az_el(d / max(1e-9, np.linalg.norm(d)))
        for j, da in enumerate((-30, 0, 30)):
            e.pon(*penacho(PIE, tuple(P3[-1]), a_t + da, e_t + (6 if j == 1 else -6),
                           Lp * (1.0 if j == 1 else 0.82) * (0.85 if seco else 1.0),
                           mh, 't%d' % i, brillo=(0.05 if (i + j) % 2 else -0.03)))
    if bulbo:
        hinojo_bulbo(e, (cx, cy - 1.0), 1.0, seco, 100, suelo_rim(cx, cy + 3.0, 7.2, 1.2))
    return e.render()


def hinojo_item(podrido):
    e = esc()
    c = (32.0, 38.0)
    mt = P.podrido(TALLO_HINOJO, 0.7) if podrido else TALLO_HINOJO
    for k, a in enumerate((-112, -90, -68)):
        S = P.arco((c[0] + (k - 1) * 2.0, c[1] - 4.0), a + (k - 1) * (10 if podrido else 0), 8.0, 0)
        e.pon(P.Tallo(S, 2.0, 1.8, mt, 1 + (0.2 if k == 1 else 0), grupo='t%d' % k))
    S = P.arco((c[0], c[1] - 11.0), -90, 6.0, 0)
    e.pon(P.Eje(S, P.forma('eliptica', 1.6), SECO if podrido else VERDE_HINOJO, 2, grupo='pl',
                borde=P.dientes(4, 0.4), nervio=None))
    hinojo_bulbo(e, c, 1.0, podrido, 10)
    return e.render()


def hinojo_emblema():
    e = esc()
    for k, a in enumerate((-110, -70)):
        S = P.arco((32.0 + (k - 0.5) * 1.6, 31.6), a, 2.4, 0)
        e.pon(P.Tallo(S, 1.4, 1.2, TALLO_HINOJO, 1, grupo='t%d' % k))
    e.pon(P.Bola((32.0, 34.0), 3.4, 2.8, BULBO_HINOJO, 10, grupo='b'))
    return e.render()


# ===========================================================================
# 19. COLINABO
# ===========================================================================

MORADO_COLINABO = M(['#dcb0f2', '#a96ccc', '#9257b6', '#79459c', '#613882', '#4c2b68', '#391f4e'], '#26143a')
VERDE_COLINABO = VERDE['azulado']


def colinabo_bola(e, c, s, podrido, z, recorte=None):
    mat = P.podrido(MORADO_COLINABO, 0.7) if podrido else MORADO_COLINABO
    ex = P.manchas_bola([(-0.3, 0.25, .42, .34), (0.4, -0.2, .3, .28)], MANCHA_OSCURA, 'koh') if podrido else None
    b = P.Bola(c, 7.8 * s, 7.0 * s, mat, z, grupo='bola', extra=ex)
    b.recorte = recorte
    e.pon(b)


def colinabo_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('colinabo', n)
    if n == 1:
        brote_cotiledones(e, PIE, VERDE_COLINABO, largo=7.0, ancho=3.3, abre=66, curva=14,
                          mat_tallo=MORADO_COLINABO)
        return e.render()
    seco = n == 5
    mh = SECO if seco else VERDE_COLINABO
    mp = P.SECO_OSCURO if seco else MORADO_COLINABO
    s = 0.55 if n == 3 else 1.0
    rb = 7.0 * s
    hojas = [(196, 70, 30), (236, 80, 46), (276, 84, 54), (316, 80, 44), (352, 70, 28), (150, 72, 34)]
    if n == 3:
        hojas = hojas[:5]
    for i, (az, e0, e1) in enumerate(hojas):
        az += r.uniform(-5, 5)
        L = jit(r, 17.0 if n != 3 else 13.0, 0.06)
        if seco:
            e0, e1, L = secar(e0, e1, L)
        # las hojas nacen de la parte alta de la bola, no del suelo
        o = (math.cos(math.radians(az)) * rb * 0.35, rb * 1.3, math.sin(math.radians(az)) * rb * 0.35)
        e.pon(*P.hoja3d(PIE, az, e0, e1, L, 0.2 * L, 'ovada', mh, 'h%d' % i, peciolo=0.45,
                        grosor_peciolo=1.2, mat_peciolo=mp, origen=o, nervio=2,
                        borde=P.ondas(3, 0.1), brillo=(0.05 if i % 2 else -0.03)))
    colinabo_bola(e, (cx, cy - rb * 0.55), s, seco, 50, suelo_rim(cx, cy + 1.5, rb, 1.2))
    return e.render()


def colinabo_item(podrido):
    e = esc()
    c = (32.0, 35.0)
    mh = P.podrido(VERDE_COLINABO, 0.9) if podrido else VERDE_COLINABO
    for k, (a, L) in enumerate(((-122, 8.0), (-90, 9.0), (-58, 8.0))):
        aa = a + ((-12 if a < -95 else 12 if a > -85 else 0) if podrido else 0)
        S = P.arco((c[0] + (k - 1) * 2.0, c[1] - 5.5), aa, L, 8 if aa > -90 else -8)
        kk = 10
        e.pon(P.Eje(S[:kk + 1], P.const(0.55), P.podrido(MORADO_COLINABO, .6) if podrido else MORADO_COLINABO,
                    1.01, modelo='tubo', grupo='h%d' % k))
        e.pon(P.Eje(P.remuestrear(S[kk:], 20), P.forma('ovada', 2.0), mh, 1, grupo='h%d' % k, nervio=1))
    colinabo_bola(e, c, 0.95, podrido, 10)
    return e.render()


def colinabo_emblema():
    e = esc()
    for k, a in enumerate((-118, -62)):
        S = P.arco((32.0, 30.4), a, 2.8, 0)
        e.pon(P.Eje(S, P.forma('ovada', 1.2), VERDE_COLINABO, 1, grupo='h%d' % k, nervio=None))
    e.pon(P.Bola((32.0, 33.0), 3.3, 3.0, MORADO_COLINABO, 10, grupo='b'))
    return e.render()


# ===========================================================================
# 20. RUIBARBO
# ===========================================================================

PENCA_RUIBARBO = M(['#ffa0aa', '#ea5468', '#d33f58', '#b3334b', '#90283e', '#6e1f31'], '#45111f')
VERDE_RUIBARBO = Material(rampa_hsv(88, 110, .62, .76, .74, .27, 8), '#173311')


def ruibarbo_hoja(pie, az, e0, e1, L, mat, grupo, brillo=0.0, seco=False):
    return P.hoja3d(pie, az, e0, e1, L, 0.30 * L, 'corazon', mat, grupo, peciolo=0.42,
                    grosor_peciolo=2.4, mat_peciolo=(P.SECO_OSCURO if seco else PENCA_RUIBARBO),
                    nervio=None if seco else PENCA_RUIBARBO.rampa[1], borde=P.ondas(4, 0.14),
                    nervios=(3.0, 35, 1), brillo=brillo, copa=0.18)


def ruibarbo_etapa(n):
    e = esc()
    r = rng('ruibarbo', n)
    if n == 1:
        brote_cotiledones(e, PIE, VERDE_RUIBARBO, largo=6.6, ancho=3.2, abre=64, curva=12,
                          mat_tallo=PENCA_RUIBARBO)
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE_RUIBARBO
    if n == 3:
        hojas = [(200, 64, 22, 16), (262, 76, 40, 18), (330, 64, 22, 16), (140, 66, 26, 13)]
    else:
        hojas = [(186, 56, 8, 23), (226, 68, 26, 25), (270, 76, 40, 26), (314, 68, 26, 25),
                 (354, 56, 8, 23), (140, 62, 18, 19), (40, 62, 18, 19)]
    for i, (az, e0, e1, L) in enumerate(hojas):
        az += r.uniform(-5, 5)
        L = jit(r, L, 0.05)
        if seco:
            e0, e1, L = secar(e0, e1, L)
        e.pon(*ruibarbo_hoja(PIE, az, e0, e1, L, mat, 'h%d' % i, brillo=(0.05 if i % 2 else -0.03), seco=seco))
    return e.render()


def ruibarbo_item(podrido):
    e = esc()
    m = P.podrido(PENCA_RUIBARBO, 0.7) if podrido else PENCA_RUIBARBO
    for k, (dx, a, L) in enumerate(((-2.2, -70, 20.0), (0.0, -66, 22.0), (2.2, -62, 20.0))):
        S = P.arco((26.0 + dx, 44.0 - dx * 0.4), a + (2 if podrido else 0) * (k - 1), L, (k - 1) * (3 if podrido else 2))
        e.pon(P.Eje(S, P.suave([0, 1], [1.3, 1.1]), m, k * 0.1, modelo='tubo', grupo='p%d' % k,
                    punta_clara=0.2, extra=P.encadena_eje(
                        P.rayas_eje(2, 0.2, P.desplaza(m, 1)),
                        P.manchas_eje([(0.5, 0.0, .2, .9)], MANCHA_OSCURA, 'rui%d' % k) if podrido else None)))
    return e.render()


def ruibarbo_emblema():
    e = esc()
    for k, dx in enumerate((-1.4, 1.4)):
        S = P.arco((30.5 + dx, 37.5), -62, 7.0, 0)
        e.pon(P.Eje(S, P.const(0.9), PENCA_RUIBARBO, k * 0.1, modelo='tubo', grupo='p%d' % k))
    return e.render()


# ===========================================================================
# FRUTOS Y FLORES
# ===========================================================================

FLOR_BLANCA = M(['#ffffff', '#f7f5ec', '#e8e4d2', '#d2ccb2', '#b4ad92'], '#4d4a3a')
FLOR_LILA = M(['#f3dcff', '#d9b2f2', '#c497e3', '#a87ccc', '#8b63ad'], '#3c2850')
FLOR_AMARILLA = M(['#fff8c2', '#ffe25a', '#f7cd34', '#e3b22a', '#c49222'], '#5a3f0c')
CENTRO_FLOR = M(['#fff3a0', '#f2d24a', '#dcb43a', '#c0962e', '#9e7a26'], '#4a3812')
CALIZ = Material(rampa_hsv(88, 104, .62, .74, .78, .36, 6), '#1d3a12')


def flor(e, c, s, mat, z, grupo):
    """Flor de cinco petalos vista de frente: un disco festoneado con su centro."""
    def radio(th):
        return 1.0 + 0.16 * np.cos(5 * th + 0.3)

    def centro(u, v, th, n, i, cols, Q):
        m = u * u + v * v < 0.12
        cols[m] = np.array(CENTRO_FLOR.rampa)[np.clip(i[m], 0, CENTRO_FLOR.n() - 1)]
        return cols
    e.pon(P.Bola(c, 1.9 * s, 1.7 * s, mat, z, radio=radio, grupo=grupo, extra=centro, plano=0.5))


def rabito(e, a, b, mat, z, grupo, g=1.0):
    """El pedunculo que une un fruto a la mata (nada cuelga en el aire)."""
    t = P.Tallo(P.curva([a, ((a[0] + b[0]) / 2 + 0.4, (a[1] + b[1]) / 2), b]), g, g, mat, z, grupo=grupo)
    e.pon(t)


def anclas_delante(anclas, n, r, y0, y1, zmin=0.0):
    """Elige `n` anclajes de la mitad delantera de la copa, repartidos de izquierda a derecha."""
    cand = [a for a in anclas if a[2] > zmin and y0 <= a[1] <= y1]
    cand.sort(key=lambda a: a[0])
    if len(cand) <= n:
        return cand
    paso = len(cand) / float(n)
    return [cand[int(i * paso + paso / 2)] for i in range(n)]


def caliz_estrella(e, c, s, z, grupo, puntas=5, mat=None):
    """El caliz verde de berenjena/pimiento: una estrella corta de puntas romas."""
    def radio(th):
        return 1.0 + 0.30 * np.cos(puntas * th + 1.2)
    e.pon(P.Bola(c, 2.4 * s, 1.5 * s, mat or CALIZ, z, radio=radio, grupo=grupo, plano=0.4))



def mata(e, pie, alto, rh, rv, n, hoja_fn, r, seco=False, tallo_mat=None, y_min=-0.45,
         grupo='m', giro0=0.0, tallo_g=2.2, prof=(0.35, 1.0)):
    """
    Mata DENSA, como la tomatera del juego: las hojas nacen repartidas por todo
    el volumen de la copa (no en una sola capa, que dejaba una estrella rala) y
    miran hacia fuera. Las de dentro, mas oscuras. Cada hoja cuelga de una
    ramita oscura que sale del tallo.

        alto     altura del centro de la copa
        rh, rv   radios (horizontal / vertical) donde NACEN las hojas
        hoja_fn(origen, az, e0, e1, grupo, brillo) -> piezas

    Devuelve los nudos [(x, y, z, az, ny)] para colgar flores y frutos DENTRO
    de la mata.
    """
    tm = tallo_mat or (SECO if seco else TALLO_VERDE)
    tr = P.SECO_OSCURO if seco else TALLO_SOMBRA
    caida = 0.88 if seco else 1.0
    cy = alto * caida
    t, _ = tallo_curvo(pie, [(0, 0, 0), (0.2, cy * 0.5, 0.2), (0, cy * 0.85, 0)], tallo_g, tallo_g * 0.8, tm, grupo + 't')
    e.pon(t)
    oro = 137.508
    nudos = []
    for i in range(n):
        ny = 1.0 - (i + 0.5) / n * (1.0 - y_min)
        rad = math.sqrt(max(0.0, 1.0 - ny * ny))
        az = (i * oro + giro0 + r.uniform(-14, 14)) % 360
        k = prof[0] + (prof[1] - prof[0]) * ((i * 0.6180339) % 1.0)
        ox = math.cos(math.radians(az)) * rad * rh * k
        oz = math.sin(math.radians(az)) * rad * rh * k
        oy = cy + ny * rv * k * caida
        el = math.degrees(math.asin(max(-1.0, min(1.0, ny))))
        e0 = max(-10.0, min(80.0, el * 0.7 + 30 + r.uniform(-8, 8)))
        e1 = max(-26.0, min(64.0, el * 0.7 + r.uniform(-8, 8)))
        if seco:
            e0, e1 = e0 * 0.86, max(-30.0, e1 - 24)
        brillo = 0.05 * ny - 0.07 * (1.0 - k) + (0.03 if i % 2 else -0.02)
        piezas = hoja_fn((ox, oy, oz), az, e0, e1, '%sh%d' % (grupo, i), brillo)
        e.pon(*piezas)
        zmin = min(p.z for p in piezas)
        base_y = max(cy * 0.3, oy - rv * 0.5)
        rama, _ = tallo_curvo(pie, [(0, base_y, 0), (ox * 0.5, (base_y + oy) / 2 + 0.5, oz * 0.5), (ox, oy, oz)],
                              1.2, 1.0, tr, grupo + 't')
        rama.z = zmin - 0.3
        e.pon(rama)
        nudos.append((ox, oy, oz, az, ny))
    return nudos


def nudos_delante(nudos, n, ny0=-0.5, ny1=0.55, zmin=0.5):
    """`n` nudos de la cara de delante, repartidos de izquierda a derecha."""
    cand = [q for q in nudos if q[2] > zmin and ny0 <= q[4] <= ny1]
    cand.sort(key=lambda q: q[0])
    if len(cand) <= n:
        return cand
    paso = len(cand) / float(n)
    return [cand[int(i * paso + paso / 2)] for i in range(n)]


def colgar(e, pie, nudo, caida, fruto_fn, z, grupo, sale=1.25, mat_r=None):
    """
    Cuelga un fruto de un nudo: el rabito sale del nudo y el fruto queda un poco
    por fuera y por debajo, siempre tocando la mata (nunca suelto en el aire).
    fruto_fn(c) dibuja el fruto con su parte de arriba en c.
    """
    ox, oy, oz = nudo[0], nudo[1], nudo[2]
    a = P.proyecta(pie, [(ox, oy, oz)])[0]
    b = P.proyecta(pie, [(ox * sale, oy, oz * sale)])[0]
    top = (b[0], b[1] + caida)
    rabito(e, (a[0], a[1]), top, mat_r or CALIZ, z - 0.05, grupo, g=1.0)
    fruto_fn(top)


# ===========================================================================
# 21. PIMIENTO
# ===========================================================================

ROJO_PIMIENTO = M(['#ffa596', '#f2493c', '#de3529', '#c22a21', '#9e221b', '#7c1b16', '#5d1411'], '#3f0c0a')
VERDE_PIMIENTO = VERDE['oscuro']


def pimiento_fruto(e, c, s, podrido, z, grupo, giro=0.0, rid='p', rabo=True):
    """Pimiento morron: cuadrado de esquinas redondas con tres lobulos abajo."""
    mat = P.podrido(ROJO_PIMIENTO, 0.7) if podrido else ROJO_PIMIENTO

    def radio(th):
        # superelipse (caja de esquinas redondas), un poco mas estrecho abajo y
        # con los tres lobulos del culo
        cth, sth = np.abs(np.cos(th)), np.abs(np.sin(th))
        caja = (cth ** 3.0 + sth ** 3.0) ** (-1.0 / 3.0)
        abajo = np.clip(np.sin(th), 0, 1)
        return caja * (1.0 - 0.07 * abajo) * (1.0 - 0.05 * abajo ** 2 * (0.5 + 0.5 * np.cos(6 * th)))
    ex = P.encadena(P.meridianos([-30, 26], mat, pasos=2, grosor=0.05, v_lim=(-0.62, 0.86)),
                    P.manchas_bola([(-0.3, 0.3, .4, .34), (0.42, -0.1, .3, .3)], MANCHA_OSCURA, 'pim' + rid) if podrido else None)
    e.pon(P.Bola(c, 3.5 * s, 4.1 * s, mat, z, radio=radio, giro=giro, grupo=grupo, extra=ex,
                 especular=0.86, brillo_extra=0.03))
    mc = P.SECO_OSCURO if podrido else CALIZ
    e.pon(P.Bola((c[0], c[1] - 4.0 * s), 2.2 * s, 0.9 * s, mc, z + 0.1, grupo=grupo, plano=0.3))
    if rabo:
        e.pon(P.Tallo(P.curva([(c[0] + 0.2, c[1] - 4.2 * s), (c[0] + 0.6 * s, c[1] - 5.6 * s),
                               (c[0] + 1.4 * s, c[1] - 6.6 * s)]), 1.2 + 0.5 * s, 1.0 + 0.4 * s, mc,
                      z + 0.2, grupo=grupo))


def hoja_simple_copa(mat, L0, ancho_rel=0.27, fm='ovada', borde=None, copa_h=0.12, r=None, seco=False):
    def hoja(origen, az, e0, e1, grupo, brillo):
        L = jit(r, L0 * (0.9 if seco else 1.0), 0.08)
        return P.hoja3d(PIE, az, e0, e1, L, ancho_rel * L, fm, mat, grupo, peciolo=0.18,
                        grosor_peciolo=1.0, origen=origen, nervio=1, copa=copa_h, borde=borde,
                        brillo=brillo)
    return hoja


def pimiento_etapa(n):
    e = esc()
    r = rng('pimiento', n)
    if n == 1:
        brote_cotiledones(e, PIE, VERDE_PIMIENTO, largo=7.6, ancho=1.9, abre=60, curva=10, forma_nombre='lanceolada')
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE_PIMIENTO
    hoja = hoja_simple_copa(mat, 9.5 if n != 3 else 8.0, r=r, seco=seco)
    if n == 3:
        nud = mata(e, PIE, 8.0, 7.0, 5.5, 18, hoja, r)
        flores_en(e, nud, 3, FLOR_BLANCA, 1.0)
    else:
        nud = mata(e, PIE, 11.0, 10.0, 7.5, 30, hoja, r, seco=seco)
        for k, q in enumerate(nudos_delante(nud, 3)):
            colgar(e, PIE, q, 1.0, lambda top, k=k: pimiento_fruto(
                e, (top[0], top[1] + 4.2), 1.0, seco, 300 + k, 'fr%d' % k, giro=(k - 1) * 8, rid=str(k), rabo=False),
                300 + k, 'fr%d' % k, mat_r=(P.SECO_OSCURO if seco else None))
    return e.render()


def flores_en(e, nudos, n, mat, s, ny0=-0.3, ny1=0.85):
    """Flores en la cara de delante de la mata, encima de sus hojas."""
    for k, q in enumerate(nudos_delante(nudos, n, ny0=ny0, ny1=ny1)):
        p = P.proyecta(PIE, [(q[0] * 1.15, q[1], q[2] * 1.15)])[0]
        flor(e, (p[0], p[1]), s, mat, 300 + k, 'flor%d' % k)


def pimiento_item(podrido):
    e = esc()
    pimiento_fruto(e, (32.0, 34.0), 1.85, podrido, 10, 'f', rid='item')
    return e.render()


def pimiento_emblema():
    e = esc()
    pimiento_fruto(e, (32.0, 34.0), 0.74, False, 10, 'f', rid='emb', rabo=False)
    return e.render()


# ===========================================================================
# 22. BERENJENA
# ===========================================================================

MORADO_BERENJENA = M(['#d6b0f0', '#7a40a8', '#64328e', '#502774', '#3e1e5b', '#2e1644', '#211031'], '#140a20')
VERDE_BERENJENA = VERDE['gris']


def berenjena_fruto(e, c, largo, grueso, ang, podrido, z, grupo, rid='b'):
    """Berenjena: gota alargada, estrecha arriba, con el caliz verde puntiagudo."""
    mat = P.podrido(MORADO_BERENJENA, 0.6) if podrido else MORADO_BERENJENA
    a = math.radians(ang)
    S = P.arco(c, ang, largo, 8)
    w = P.suave([0, .15, .45, .78, .93, 1], [grueso * .42, grueso * .55, grueso * .85, grueso, grueso * .8, 0.3])
    ex = P.manchas_eje([(0.55, -0.3, .2, .6), (0.8, 0.4, .15, .5)], MANCHA_OSCURA, 'ber' + rid) if podrido else None
    e.pon(P.Eje(S, w, mat, z, modelo='tubo', grupo=grupo, punta_clara=0.0, extra=ex))
    mc = P.SECO_OSCURO if podrido else CALIZ
    e.pon(P.Bola((c[0] + math.cos(a) * 0.6, c[1] + math.sin(a) * 0.6), grueso * 0.62, grueso * 0.5, mc,
                 z + 0.12, giro=ang - 90, grupo=grupo, plano=0.3))
    for s in (-1, 1):
        Sc = P.arco((c[0] + math.cos(a) * 0.4, c[1] + math.sin(a) * 0.4), ang + s * 30, grueso * 1.35, -s * 12)
        e.pon(P.Eje(Sc, P.forma('lanceolada', grueso * 0.36), mc, z + 0.1, grupo=grupo, nervio=None))
    rabito(e, (c[0] + math.cos(a) * 0.5, c[1] + math.sin(a) * 0.5),
           (c[0] - math.cos(a) * 2.6, c[1] - math.sin(a) * 2.6), P.SECO_OSCURO if podrido else CALIZ,
           z + 0.2, grupo, g=1.6)


def berenjena_etapa(n):
    e = esc()
    r = rng('berenjena', n)
    if n == 1:
        brote_cotiledones(e, PIE, VERDE_BERENJENA, largo=7.0, ancho=2.6, abre=62, curva=12)
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE_BERENJENA
    hoja = hoja_simple_copa(mat, 11.0 if n != 3 else 9.0, ancho_rel=0.30, borde=P.ondas(3, 0.10), r=r, seco=seco)
    if n == 3:
        nud = mata(e, PIE, 8.0, 7.5, 6.0, 16, hoja, r)
        flores_en(e, nud, 2, FLOR_LILA, 1.1)
    else:
        nud = mata(e, PIE, 11.5, 10.0, 7.5, 26, hoja, r, seco=seco)
        for k, q in enumerate(nudos_delante(nud, 2)):
            colgar(e, PIE, q, 0.5, lambda top, k=k: berenjena_fruto(
                e, top, 11.0 * (0.9 if seco else 1.0), 3.5, 84 + (k - 0.5) * 18, seco, 300 + k, 'fr%d' % k, rid=str(k)),
                300 + k, 'fr%d' % k, mat_r=(P.SECO_OSCURO if seco else None))
    return e.render()


def berenjena_item(podrido):
    e = esc()
    berenjena_fruto(e, (25.0, 22.0), 20.0, 6.2, 62, podrido, 10, 'f', rid='item')
    return e.render()


def berenjena_emblema():
    e = esc()
    berenjena_fruto(e, (29.5, 29.0), 6.0, 2.2, 52, False, 10, 'f', rid='emb')
    return e.render()


# ===========================================================================
# GUIAS RASTRERAS (pepino, sandia, melon)
# ===========================================================================

def guia(e, pie, az, largo, curva_az, nhojas, hoja_fn, r, k, mat_tallo, seco=False, g=1.3):
    """Una guia por el suelo con hojas en los nudos (cada hoja nace en un nudo)."""
    pts = []
    a = az
    for i in range(5):
        u = i / 4.0
        rr = largo * u
        pts.append((math.cos(math.radians(a)) * rr, 0.6 + 0.6 * math.sin(math.pi * u), math.sin(math.radians(a)) * rr))
        a += curva_az / 4.0
    t, C3 = tallo_curvo(pie, pts, g, g * 0.8, mat_tallo, 'g%d' % k)
    e.pon(t)
    for j in range(nhojas):
        tt = 0.32 + 0.68 * j / max(1, nhojas - 1)
        p, d = P.en_curva3d(C3, tt)
        az_t, _ = P.az_el(d)
        lado = 1 if (j + k) % 2 else -1
        e.pon(*hoja_fn(tuple(p), az_t + lado * 48 + r.uniform(-10, 10), 'g%dh%d' % (k, j),
                       0.05 if (j + k) % 2 else -0.03))
    return C3


def hoja_palmeada(mat, L0, r, seco=False, lobulos=0.30, mat_p=None, ancho=0.34):
    """Hoja grande de cucurbitacea: acorazonada con lobulos marcados, sobre un rabo largo."""
    def hoja(origen, az, grupo, brillo):
        L = jit(r, L0 * (0.9 if seco else 1.0), 0.08)
        e0, e1 = (40, -12) if seco else (62, 14)
        return P.hoja3d(PIE, az, e0, e1, L, ancho * L, 'corazon', mat, grupo, peciolo=0.40,
                        grosor_peciolo=1.2, mat_peciolo=mat_p, origen=origen, nervio=2,
                        borde=P.ondas(2, lobulos, irregular=0.2), nervios=(3.2, 45, 1), copa=0.14,
                        brillo=brillo)
    return hoja


# ===========================================================================
# 23. PEPINO
# ===========================================================================

VERDE_PEPINO = M(['#b6dc8a', '#4f8a30', '#417628', '#356422', '#2a521c', '#203f16', '#172e10'], '#0d1f09')
TALLO_GUIA = Material(rampa_hsv(84, 98, .55, .66, .78, .40, 6), '#223f14')


def pepino_fruto(e, c, largo, r0, ang, podrido, z, grupo, rid='p', curva=8):
    mat = P.podrido(VERDE_PEPINO, 0.6) if podrido else VERDE_PEPINO
    a = math.radians(ang)
    ini = (c[0] - math.cos(a) * largo / 2, c[1] - math.sin(a) * largo / 2)
    S = P.arco(ini, ang, largo, curva)
    w = P.suave([0, .08, .3, .7, .92, 1], [r0 * .55, r0 * .85, r0, r0, r0 * .85, r0 * .5])
    ex = P.encadena_eje(P.rayas_eje(4, 0.16, P.desplaza(mat, -2), ondula=0.0),
                        P.manchas_eje([(0.35, -0.3, .16, .7), (0.72, 0.35, .14, .6)], MANCHA, 'pep' + rid) if podrido else None)
    e.pon(P.Eje(S, w, mat, z, modelo='tubo', grupo=grupo, punta_clara=0.0, extra=ex))
    rabito(e, (ini[0] + math.cos(a) * 0.6, ini[1] + math.sin(a) * 0.6),
           (ini[0] - math.cos(a) * 1.8, ini[1] - math.sin(a) * 1.8), P.SECO_OSCURO if podrido else CALIZ,
           z + 0.1, grupo, g=1.2)


def pepino_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('pepino', n)
    V = VERDE['tomate']
    if n == 1:
        brote_cotiledones(e, PIE, V, largo=7.4, ancho=3.4, abre=64, curva=10, forma_nombre='eliptica')
        return e.render()
    seco = n == 5
    mat = SECO if seco else V
    mt = P.SECO_OSCURO if seco else TALLO_GUIA
    hp = hoja_palmeada(mat, 12.0 if n != 3 else 10.0, r, seco=seco, mat_p=mt)
    if n == 3:
        guias = [(196, 12, 30, 2), (262, 9, 10, 2), (338, 12, -30, 2)]
    else:
        guias = [(184, 16, 34, 3), (232, 13, 16, 2), (292, 13, -16, 2), (352, 16, -34, 3), (126, 10, 20, 1), (54, 10, -20, 1)]
    C3s = []
    for k, (az, L, cv, nh) in enumerate(guias):
        C3s.append(guia(e, PIE, az + r.uniform(-4, 4), L * (0.88 if seco else 1.0), cv, nh, hp, r, k, mt))
    if n == 3:
        for k, C3 in enumerate(C3s[:2]):
            p, _ = P.en_curva3d(C3, 0.55)
            q = P.proyecta(PIE, [p])[0]
            flor(e, (q[0], q[1] - 1.0), 1.1, FLOR_AMARILLA, 300 + k, 'flor%d' % k)
    else:
        pepino_fruto(e, (cx - 4.5, cy + 4.0), 12.0, 2.6, 8, seco, 400, 'f0', rid='0')
        pepino_fruto(e, (cx + 5.5, cy + 2.0), 10.5, 2.4, -24, seco, 399, 'f1', rid='1', curva=-6)
    return e.render()


def pepino_item(podrido):
    e = esc()
    pepino_fruto(e, (32.0, 32.0), 20.0, 3.8, -62, podrido, 10, 'f', rid='item')
    return e.render()


def pepino_emblema():
    e = esc()
    pepino_fruto(e, (32.0, 32.0), 7.0, 1.5, -45, False, 10, 'f', rid='emb', curva=4)
    return e.render()


# ===========================================================================
# 24. CALABACIN
# ===========================================================================

VERDE_CALABACIN = M(['#a6d470', '#3f7a2c', '#346a25', '#2a5a1f', '#214a19', '#183913', '#112a0e'], '#0a1a08')


def calabacin_fruto(e, c, largo, r0, ang, podrido, z, grupo, rid='c'):
    mat = P.podrido(VERDE_CALABACIN, 0.55) if podrido else VERDE_CALABACIN
    a = math.radians(ang)
    ini = (c[0] - math.cos(a) * largo / 2, c[1] - math.sin(a) * largo / 2)
    S = P.arco(ini, ang, largo, 4)
    w = P.suave([0, .1, .4, .85, 1], [r0 * .62, r0 * .82, r0 * .92, r0 * 1.05, r0 * .7])
    ex = P.manchas_eje([(0.4, -0.3, .18, .7), (0.75, 0.3, .14, .6)], MANCHA, 'cal' + rid) if podrido else None
    e.pon(P.Eje(S, w, mat, z, modelo='tubo', grupo=grupo, punta_clara=0.0, extra=ex))
    # el pedunculo grueso y claro
    e.pon(P.Tallo(P.curva([(ini[0] + math.cos(a) * 0.8, ini[1] + math.sin(a) * 0.8),
                           (ini[0] - math.cos(a) * 2.0, ini[1] - math.sin(a) * 2.0)]),
                  2.2, 1.8, P.SECO_OSCURO if podrido else TALLO_GUIA, z + 0.1, grupo=grupo))


def calabacin_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('calabacin', n)
    V = VERDE['oliva']
    if n == 1:
        brote_cotiledones(e, PIE, V, largo=7.6, ancho=3.6, abre=64, curva=10, forma_nombre='eliptica')
        return e.render()
    seco = n == 5
    mat = SECO if seco else V
    mt = P.SECO_OSCURO if seco else TALLO_GUIA

    def hoja(pie, az, e0, e1, L, mat_, grupo, brillo=0.0):
        return P.hoja3d(pie, az, e0, e1, L, 0.36 * L, 'corazon', mat_, grupo, peciolo=0.42,
                        grosor_peciolo=1.6, mat_peciolo=mt, nervio=2, borde=P.ondas(2, 0.34, irregular=0.2),
                        nervios=(3.4, 45, 1), copa=0.14, brillo=brillo)
    if n == 3:
        hojas = [(196, 62, 22, 16), (250, 72, 38, 17), (300, 72, 36, 17), (350, 62, 20, 16)]
    else:
        hojas = [(184, 54, 8, 22), (222, 64, 24, 23), (262, 72, 38, 24), (300, 70, 34, 24),
                 (340, 62, 20, 23), (140, 58, 14, 18), (40, 58, 14, 18)]
    roseta(e, PIE, hojas, hoja, mat, seco, r)
    if n == 3:
        flor(e, (cx - 1.0, cy - 6.0), 1.7, FLOR_AMARILLA, 300, 'flor')
    else:
        calabacin_fruto(e, (cx - 4.0, cy + 3.0), 13.0, 2.6, 14, seco, 400, 'f0', rid='0')
        calabacin_fruto(e, (cx + 5.0, cy + 1.0), 11.0, 2.4, -30, seco, 399, 'f1', rid='1')
    return e.render()


def calabacin_item(podrido):
    e = esc()
    calabacin_fruto(e, (32.0, 33.0), 20.0, 3.6, -64, podrido, 10, 'f', rid='item')
    return e.render()


def calabacin_emblema():
    e = esc()
    calabacin_fruto(e, (32.0, 32.0), 6.4, 1.5, -45, False, 10, 'f', rid='emb')
    return e.render()


# ===========================================================================
# 25. SANDIA
# ===========================================================================

SANDIA_CLARA = M(['#e6f7b6', '#a8d672', '#92c45e', '#7caf4d', '#66983f', '#507e31', '#3c6325'], '#1d3a12')
SANDIA_RAYA = M(['#6aa64e', '#2f6a25', '#25591f', '#1c4919', '#153a14', '#0f2c0f', '#0a200a'], '#081808')
VERDE_SANDIA = Material(rampa_hsv(92, 118, .48, .60, .80, .30, 8), '#183320')

FOL_SANDIA = [
    (0.30, +1, 60, 0.30, 0.10, 'lanceolada', 8), (0.36, -1, 60, 0.30, 0.10, 'lanceolada', 8),
    (0.55, +1, 50, 0.26, 0.09, 'lanceolada', 8), (0.60, -1, 50, 0.26, 0.09, 'lanceolada', 8),
    (0.72, 0, 0, 0.30, 0.10, 'lanceolada'),
]


def sandia_fruto(e, c, rx, ry, podrido, z, grupo, giro=-8.0, rid='s'):
    mat = P.podrido(SANDIA_CLARA, 0.55) if podrido else SANDIA_CLARA
    raya = P.podrido(SANDIA_RAYA, 0.55) if podrido else SANDIA_RAYA
    ex = P.encadena(P.rayas_bola(7, 0.42, raya, giro=10, ondula=0.12),
                    P.manchas_bola([(-0.3, 0.3, .4, .3), (0.45, -0.1, .3, .3)], MANCHA, 'san' + rid) if podrido else None)
    e.pon(P.Bola(c, rx, ry, mat, z, giro=giro, grupo=grupo, extra=ex))
    rabito(e, (c[0] - rx * 0.92, c[1] - 0.6), (c[0] - rx * 0.92 - 2.0, c[1] - 1.6),
           P.SECO_OSCURO if podrido else CALIZ, z + 0.1, grupo, g=1.2)


def sandia_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('sandia', n)
    if n == 1:
        brote_cotiledones(e, PIE, VERDE_SANDIA, largo=7.2, ancho=3.2, abre=64, curva=10, forma_nombre='eliptica')
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE_SANDIA
    mt = P.SECO_OSCURO if seco else TALLO_GUIA

    def hoja(origen, az, grupo, brillo):
        L = jit(r, (11.0 if n != 3 else 9.0) * (0.9 if seco else 1.0), 0.08)
        e0, e1 = (40, -12) if seco else (58, 10)
        return hoja_comp3d(PIE, origen, az, e0, e1, L, mat, grupo, FOL_SANDIA, raquis=1.0, brillo=brillo,
                           raquis_mat=mt)
    if n == 3:
        guias = [(196, 13, 30, 3), (264, 10, 10, 2), (336, 13, -30, 3)]
    else:
        guias = [(180, 18, 34, 4), (226, 15, 16, 3), (300, 15, -16, 3), (360, 18, -34, 4), (130, 11, 20, 2), (52, 11, -20, 2)]
    for k, (az, L, cv, nh) in enumerate(guias):
        guia(e, PIE, az + r.uniform(-4, 4), L * (0.88 if seco else 1.0), cv, nh, hoja, r, k, mt, g=1.1)
    if n == 3:
        flor(e, (cx + 3.0, cy - 4.0), 1.0, FLOR_AMARILLA, 300, 'flor')
    else:
        sandia_fruto(e, (cx + 1.0, cy + 2.5), 10.5 * (0.94 if seco else 1.0), 8.0 * (0.94 if seco else 1.0),
                     seco, 400, 'f', rid='p')
    return e.render()


def sandia_item(podrido):
    e = esc()
    sandia_fruto(e, (32.0, 32.0), 7.6, 6.6, podrido, 10, 'f', rid='item')
    return e.render()


def sandia_emblema():
    e = esc()
    e.pon(P.Bola((32.0, 32.0), 3.6, 3.1, SANDIA_CLARA, 10, giro=-8, grupo='f',
                 extra=P.rayas_bola(5, 0.42, SANDIA_RAYA, giro=10, ondula=0.12)))
    return e.render()


# ===========================================================================
# 26. MELON
# ===========================================================================

AMARILLO_MELON = M(['#fff8c6', '#fde25e', '#f5ce3e', '#e2b32f', '#c49427', '#9e751f', '#795917'], '#4a350c')


def melon_fruto(e, c, rx, ry, podrido, z, grupo, giro=-10.0, rid='m'):
    mat = P.podrido(AMARILLO_MELON, 0.6) if podrido else AMARILLO_MELON
    ex = P.encadena(P.meridianos([-34, 30], mat, pasos=1, grosor=0.04, v_lim=(-0.8, 0.8)),
                    P.manchas_bola([(-0.3, 0.3, .4, .3), (0.42, -0.1, .3, .3)], MANCHA_OSCURA, 'mel' + rid) if podrido else None)
    e.pon(P.Bola(c, rx, ry, mat, z, giro=giro, grupo=grupo, extra=ex))
    rabito(e, (c[0] - rx * 0.9, c[1] - 0.8), (c[0] - rx * 0.9 - 2.0, c[1] - 2.0),
           P.SECO_OSCURO if podrido else CALIZ, z + 0.1, grupo, g=1.2)


def melon_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('melon', n)
    V = VERDE['tomate']
    if n == 1:
        brote_cotiledones(e, PIE, V, largo=7.0, ancho=3.3, abre=64, curva=10, forma_nombre='eliptica')
        return e.render()
    seco = n == 5
    mat = SECO if seco else V
    mt = P.SECO_OSCURO if seco else TALLO_GUIA

    def hoja(origen, az, grupo, brillo):
        L = jit(r, (11.0 if n != 3 else 9.0) * (0.9 if seco else 1.0), 0.08)
        e0, e1 = (40, -12) if seco else (60, 12)
        return P.hoja3d(PIE, az, e0, e1, L, 0.38 * L, 'redonda', mat, grupo, peciolo=0.36,
                        grosor_peciolo=1.1, mat_peciolo=mt, origen=origen, nervio=2,
                        borde=P.ondas(3, 0.14), nervios=(3.0, 45, 1), copa=0.14, brillo=brillo)
    if n == 3:
        guias = [(196, 12, 30, 2), (264, 9, 10, 2), (336, 12, -30, 2)]
    else:
        guias = [(182, 16, 34, 3), (228, 13, 16, 2), (298, 13, -16, 2), (358, 16, -34, 3), (128, 10, 20, 1), (52, 10, -20, 1)]
    for k, (az, L, cv, nh) in enumerate(guias):
        guia(e, PIE, az + r.uniform(-4, 4), L * (0.88 if seco else 1.0), cv, nh, hoja, r, k, mt)
    if n == 3:
        flor(e, (cx - 3.0, cy - 4.0), 1.0, FLOR_AMARILLA, 300, 'flor0')
        flor(e, (cx + 4.0, cy - 6.0), 0.9, FLOR_AMARILLA, 301, 'flor1')
    else:
        melon_fruto(e, (cx + 1.0, cy + 3.0), 8.6 * (0.94 if seco else 1.0), 6.6 * (0.94 if seco else 1.0),
                    seco, 400, 'f', rid='p')
    return e.render()


def melon_item(podrido):
    e = esc()
    melon_fruto(e, (32.0, 32.0), 7.6, 6.2, podrido, 10, 'f', rid='item')
    return e.render()


def melon_emblema():
    e = esc()
    e.pon(P.Bola((32.0, 32.0), 3.6, 2.9, AMARILLO_MELON, 10, giro=-10, grupo='f'))
    return e.render()


# ===========================================================================
# 27. CHILE
# ===========================================================================

ROJO_CHILE = M(['#ffa696', '#f04a36', '#d9362a', '#bb2a22', '#98221b', '#761a15', '#58130f'], '#3a0b08')


def chile_fruto(e, c, largo, r0, ang, curva, podrido, z, grupo, rid='c'):
    """Guindilla: un cono largo y curvo con su caliz verde."""
    mat = P.podrido(ROJO_CHILE, 0.65) if podrido else ROJO_CHILE
    S = P.arco(c, ang, largo, curva)
    w = P.suave([0, .12, .5, .85, 1], [r0 * .9, r0, r0 * .78, r0 * .4, 0.2])
    ex = P.manchas_eje([(0.5, -0.2, .25, .9)], MANCHA_OSCURA, 'chi' + rid) if podrido else None
    e.pon(P.Eje(S, w, mat, z, modelo='tubo', grupo=grupo, punta_clara=0.0, extra=ex))
    a = math.radians(ang)
    e.pon(P.Tallo(P.curva([(c[0] + math.cos(a) * 0.4, c[1] + math.sin(a) * 0.4),
                           (c[0] - math.cos(a) * 2.2, c[1] - math.sin(a) * 2.2)]),
                  max(1.0, r0 * 0.9), 1.0, P.SECO_OSCURO if podrido else CALIZ, z + 0.1, grupo=grupo))


def chile_etapa(n):
    e = esc()
    r = rng('chile', n)
    V = VERDE['tomate']
    if n == 1:
        brote_cotiledones(e, PIE, V, largo=7.0, ancho=1.7, abre=60, curva=10, forma_nombre='lanceolada')
        return e.render()
    seco = n == 5
    mat = SECO if seco else V
    hoja = hoja_simple_copa(mat, 8.6 if n != 3 else 7.4, ancho_rel=0.21, fm='lanceolada', r=r, seco=seco)
    if n == 3:
        nud = mata(e, PIE, 7.5, 7.0, 5.5, 18, hoja, r)
        flores_en(e, nud, 3, FLOR_BLANCA, 0.85)
    else:
        nud = mata(e, PIE, 10.0, 9.5, 7.0, 28, hoja, r, seco=seco)
        for k, q in enumerate(nudos_delante(nud, 5, ny0=-0.6, ny1=0.7)):
            ang = 90 + (k - 2) * 10 + r.uniform(-5, 5)
            colgar(e, PIE, q, 0.5, lambda top, k=k, ang=ang: chile_fruto(
                e, top, 7.6 * (0.9 if seco else 1.0), 1.5, ang, (k - 2) * 6, seco, 300 + k, 'fr%d' % k, rid=str(k)),
                300 + k, 'fr%d' % k, sale=1.15, mat_r=(P.SECO_OSCURO if seco else None))
    return e.render()


def chile_item(podrido):
    e = esc()
    chile_fruto(e, (24.0, 21.0), 21.0, 2.7, 58, 26, podrido, 10, 'f', rid='item')
    return e.render()


def chile_emblema():
    e = esc()
    chile_fruto(e, (30.0, 29.0), 6.4, 1.3, 58, 20, False, 10, 'f', rid='emb')
    return e.render()


# ===========================================================================
# 28. JUDIA
# ===========================================================================

VAINA_JUDIA = M(['#e2f6a6', '#8ccf4c', '#76ba3c', '#62a332', '#4f8a29', '#3d6f20', '#2d5418'], '#1a3410')
FOL_JUDIA = [
    (0.40, +1, 70, 0.34, 0.17, 'ovada', 6), (0.40, -1, 70, 0.34, 0.17, 'ovada', 6),
    (0.60, 0, 0, 0.42, 0.21, 'ovada'),
]


def vaina(e, c, largo, r0, ang, curva, mat, z, grupo, podrido=False, rid='v', bultos=0.0):
    m = P.podrido(mat, 0.6) if podrido else mat
    S = P.arco(c, ang, largo, curva)
    w = P.suave([0, .08, .5, .9, 1], [r0 * .6, r0, r0, r0 * .7, 0.25])
    borde = P.ondas(4, bultos, irregular=0.1) if bultos else None
    ex = P.manchas_eje([(0.45, 0.0, .2, .9)], MANCHA, 'vai' + rid) if podrido else None
    e.pon(P.Eje(S, w, m, z, modelo='tubo', grupo=grupo, punta_clara=0.0, borde=borde, extra=ex))


def judia_etapa(n):
    e = esc()
    r = rng('judia', n)
    V = VERDE['tomate']
    if n == 1:
        # la judia nace con dos hojas acorazonadas sobre un tallo que se endereza
        t, _ = tallo_curvo(PIE, [(0, 0, 0), (0.3, 3.0, 0), (0, 6.0, 0)], 1.6, 1.4, TALLO_VERDE, 'tb')
        e.pon(t)
        for j, az in enumerate((195, 345)):
            e.pon(*P.hoja3d(PIE, az, 34, 6, 7.4, 2.6, 'corazon', V, 'bh%d' % j, peciolo=0.2,
                            grosor_peciolo=1.0, origen=(0, 5.8, 0), nervio=1))
        return e.render()
    seco = n == 5
    mat = SECO if seco else V

    def hoja(origen, az, e0, e1, grupo, brillo):
        L = jit(r, (11.0 if n != 3 else 9.0) * (0.9 if seco else 1.0), 0.08)
        return hoja_comp3d(PIE, origen, az, e0, e1, L, mat, grupo, FOL_JUDIA, raquis=1.0, brillo=brillo)
    if n == 3:
        nud = mata(e, PIE, 7.5, 7.0, 5.5, 14, hoja, r)
        flores_en(e, nud, 3, FLOR_LILA, 0.85)
    else:
        nud = mata(e, PIE, 10.0, 9.5, 7.0, 22, hoja, r, seco=seco)
        for k, q in enumerate(nudos_delante(nud, 4, ny0=-0.6, ny1=0.6)):
            colgar(e, PIE, q, 0.3, lambda top, k=k: vaina(
                e, top, 10.0 * (0.9 if seco else 1.0), 1.1, 88 + (k - 1.5) * 8, (k - 1.5) * 6,
                VAINA_JUDIA, 300 + k, 'v%d' % k, podrido=seco, rid=str(k)),
                300 + k, 'v%d' % k, sale=1.15, mat_r=(P.SECO_OSCURO if seco else None))
    return e.render()


def judia_item(podrido):
    e = esc()
    for k, (dx, ang, cv) in enumerate(((-2.4, 64, 14), (0.0, 60, 10), (2.4, 56, 6))):
        vaina(e, (23.0 + dx, 22.0 - dx * 0.5), 21.0, 1.35, ang, cv, VAINA_JUDIA, 10 + k * 0.1, 'v%d' % k,
              podrido=podrido, rid='i%d' % k)
    return e.render()


def judia_emblema():
    e = esc()
    for k, dx in enumerate((-1.2, 1.2)):
        vaina(e, (29.0 + dx, 28.0), 8.0, 0.9, 62, 10, VAINA_JUDIA, 10 + k * 0.1, 'v%d' % k)
    return e.render()


# ===========================================================================
# 29. GUISANTE
# ===========================================================================

VAINA_GUISANTE = M(['#e8f8b2', '#9fd85e', '#88c64c', '#72b13e', '#5d9832', '#497d27', '#365f1d'], '#1d3610')
VERDE_GUISANTE = Material(rampa_hsv(94, 122, .40, .55, .86, .33, 8), '#1a3320')


def zarcillo(e, base, ang, largo, mat, z, grupo):
    """Zarcillo: una linea fina que se enrosca al final (nunca un hilo suelto)."""
    S1 = P.arco(base, ang, largo * 0.6, 20)
    S2 = P.arco(S1[-1], ang + 20, largo * 0.4, 230)
    S = np.vstack([S1, S2[1:]])
    t = P.Tallo(S, 0.9, 0.9, mat, z, grupo=grupo)
    e.pon(t)


def guisante_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('guisante', n)
    if n == 1:
        t, _ = tallo_curvo(PIE, [(0, 0, 0), (0.3, 4.0, 0), (0, 7.5, 0)], 1.4, 1.2, TALLO_VERDE, 'tb')
        e.pon(t)
        for j, (az, h) in enumerate(((200, 4.0), (340, 6.6))):
            e.pon(*P.hoja3d(PIE, az, 30, 0, 6.0, 2.1, 'ovada', VERDE_GUISANTE, 'bh%d' % j, peciolo=0.15,
                            grosor_peciolo=1.0, origen=(0, h, 0), nervio=1))
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE_GUISANTE
    mt = SECO if seco else TALLO_VERDE
    if n == 3:
        tallos = [(-3.0, 18.0, -3), (2.5, 21.0, 3)]
    else:
        tallos = [(-6.0, 22.0, -6), (-1.5, 28.0, -2), (3.5, 26.0, 3), (7.5, 20.0, 7)]
    for k, (dx, h, inc) in enumerate(tallos):
        h = jit(r, h, 0.05) * (0.86 if seco else 1.0)
        t, C3 = tallo_curvo(PIE, [(dx * 0.3, 0, 0), (dx * 0.7 + inc * 0.3, h * 0.5, 0.5), (dx + inc, h, 0)],
                            1.4, 1.1, mt, 's%d' % k)
        e.pon(t)
        nn = 4 if n == 3 else 5
        for j in range(nn):
            tt = 0.25 + 0.7 * j / max(1, nn - 1)
            p, d = P.en_curva3d(C3, tt)
            for s_ in (-1, 1):
                az = (0 if s_ > 0 else 180) + r.uniform(-25, 25)
                e0, e1 = (20, -30) if seco else (30, 0)
                L = jit(r, 6.6 if n != 3 else 5.8, 0.08)
                e.pon(*P.hoja3d(PIE, az, e0, e1, L, 0.33 * L, 'ovada', mat, 's%dn%d%d' % (k, j, s_),
                                peciolo=0.12, grosor_peciolo=1.0, origen=tuple(p), nervio=1,
                                brillo=(0.05 if (j + k) % 2 else -0.03)))
        top = P.proyecta(PIE, [C3[-1]])[0]
        if not seco:
            zarcillo(e, (top[0], top[1]), -90 + inc * 6, 5.0, TALLO_VERDE, float(C3[-1][2]) + 0.2, 's%d' % k)
        if n == 3 and k < 2:
            p, _ = P.en_curva3d(C3, 0.72)
            q = P.proyecta(PIE, [p])[0]
            flor(e, (q[0] + (2.5 if k else -2.5), q[1]), 0.95, FLOR_BLANCA, 300 + k, 'flor%d' % k)
        if n in (4, 5):
            p, _ = P.en_curva3d(C3, 0.55 if k % 2 else 0.68)
            q = P.proyecta(PIE, [p])[0]
            lado = -1 if k < len(tallos) / 2 else 1
            vaina(e, (q[0] + lado * 0.8, q[1] + 0.5), 8.6 * (0.9 if seco else 1.0), 1.7, 90 - lado * 14,
                  -lado * 10, VAINA_GUISANTE, 300 + k, 'v%d' % k, podrido=seco, rid='%d' % k, bultos=0.10)
    return e.render()


def guisante_item(podrido):
    e = esc()
    vaina(e, (23.0, 21.0), 21.0, 3.0, 58, 22, VAINA_GUISANTE, 10, 'v', podrido=podrido, rid='item', bultos=0.08)
    e.pon(P.Tallo(P.curva([(23.4, 21.6), (21.6, 18.8)]), 1.6, 1.2, P.SECO_OSCURO if podrido else CALIZ, 11, grupo='v'))
    return e.render()


def guisante_emblema():
    e = esc()
    vaina(e, (29.0, 28.0), 8.2, 1.5, 58, 18, VAINA_GUISANTE, 10, 'v', rid='emb')
    return e.render()


# ===========================================================================
# 30. ESPARRAGO
# ===========================================================================

VERDE_ESPARRAGO = M(['#eaf7b8', '#a9d96c', '#90c658', '#79af48', '#63963b', '#4d7b2f', '#3a5f23'], '#203a12')
PUNTA_ESPARRAGO = M(['#eecbe9', '#bb7eb8', '#a266a1', '#875189', '#6d4070', '#543255', '#3d243e'], '#24152a')


def turion(e, base, alto, g, ang, mat, punta, z, grupo, podrido=False, rid='t', curva=0.0):
    """Un turion: tallo grueso que acaba en una punta morada y cerrada."""
    S = P.arco(base, ang, alto, curva)
    w = P.suave([0, .62, .80, .92, 1], [g / 2, g / 2, g / 2 * 0.92, g / 2 * 0.55, 0.0])
    m = P.podrido(mat, 0.7) if podrido else mat
    pm = P.podrido(punta, 0.7) if podrido else punta
    ex = P.encadena_eje(degradado_eje(pm, 0.70, 0.86),
                        P.manchas_eje([(0.5, 0.0, .2, .9)], MANCHA, 'tur' + rid) if podrido else None)
    e.pon(P.Eje(S, w, m, z, modelo='tubo', grupo=grupo, punta_clara=0.0, extra=ex))


def esparrago_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('esparrago', n)
    if n == 1:
        turion(e, (cx, cy + 1.0), 6.0, 3.2, -90, VERDE_ESPARRAGO, PUNTA_ESPARRAGO, 0, 't0')
        return e.render()
    seco = n == 5
    if n == 3:
        turiones = [(-3.5, 9.0, -94), (0.5, 12.5, -89), (4.0, 7.0, -85)]
    else:
        turiones = [(-7.0, 13.0, -97), (-3.5, 19.0, -93), (0.5, 23.0, -90), (4.0, 17.0, -87), (7.5, 11.0, -83)]
    if seco:
        for k, (dx, dz, h, inc) in enumerate(((-6.0, 0.5, 19.0, -5), (-2.0, -1.0, 24.0, -2),
                                              (2.5, 0.0, 22.0, 3), (6.5, 1.0, 17.0, 6))):
            h = jit(r, h, 0.05)
            t, C3 = tallo_curvo(PIE, [(dx * 0.6, 0, dz), (dx * 0.8 + inc * 0.3, h * 0.5, dz), (dx + inc, h, dz)],
                                1.6, 1.0, SECO, 's%d' % k)
            e.pon(t)
            for j, (tt, lado) in enumerate(((0.55, -1), (0.75, 1), (1.0, 0))):
                p, d = P.en_curva3d(C3, tt)
                a_t, e_t = P.az_el(d)
                # plumero seco: mas ancho que el del hinojo para que se lea como follaje y no como ramitas
                e.pon(*P.hoja3d(PIE, a_t + lado * 55, e_t - (20 if lado else 0), e_t - (50 if lado else 30),
                                7.6 if lado else 8.6, 0.24 * (7.6 if lado else 8.6), 'eliptica', SECO, 's%d' % k,
                                origen=tuple(p), nervio=None, borde=P.dientes(5, 0.40),
                                brillo=(0.05 if (j + k) % 2 else -0.03), pliegue=0.10, copa=0.04))
        return e.render()
    for k, (dx, h, a) in enumerate(turiones):
        h = jit(r, h, 0.05)
        turion(e, (cx + dx, cy + 1.0 - abs(dx) * 0.25), h, 3.6, a, VERDE_ESPARRAGO, PUNTA_ESPARRAGO,
               k * 0.1 - abs(dx) * 0.05, 't%d' % k, rid=str(k))
    return e.render()


def esparrago_item(podrido):
    e = esc()
    for k, (dx, L) in enumerate(((-2.6, 20.0), (0.0, 22.0), (2.6, 19.0))):
        turion(e, (32.0 + dx, 44.0), L, 3.0, -90 + dx * (2.2 if podrido else 0.8), VERDE_ESPARRAGO,
               PUNTA_ESPARRAGO, 10 + k * 0.1, 't%d' % k, podrido=podrido, rid='i%d' % k)
    # la cinta que ata el manojo
    e.pon(P.Eje(P.curva([(27.4, 37.0), (36.6, 37.0)]), P.const(1.0), P.SECO_OSCURO if podrido else ROJO_CHILE,
                20, modelo='tubo', grupo='cinta', punta_clara=0.0))
    return e.render()


def esparrago_emblema():
    e = esc()
    for k, dx in enumerate((-1.6, 1.6)):
        turion(e, (32.0 + dx, 38.0), 7.4 - abs(dx) * 0.4, 2.0, -90, VERDE_ESPARRAGO, PUNTA_ESPARRAGO, 10 + k * 0.1, 't%d' % k)
    return e.render()


# ===========================================================================
# 31. MENTA
# ===========================================================================

VERDE_MENTA = Material(rampa_hsv(100, 128, .54, .66, .88, .30, 8), '#123a1c')


def menta_hoja_fn(mat, L0, r, seco):
    def hoja(origen, az, e0, e1, grupo, brillo):
        L = jit(r, L0 * (0.9 if seco else 1.0), 0.08)
        return P.hoja3d(PIE, az, e0, e1, L, 0.27 * L, 'ovada', mat, grupo, peciolo=0.14, grosor_peciolo=1.0,
                        origen=origen, nervio=1, copa=0.2, borde=P.dientes(4, 0.22), nervios=(2.4, 45, 1),
                        brillo=brillo)
    return hoja


def menta_etapa(n):
    e = esc()
    r = rng('menta', n)
    if n == 1:
        brote_cotiledones(e, PIE, VERDE_MENTA, largo=6.0, ancho=2.8, abre=66, curva=10, alto=3.5)
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE_MENTA
    hoja = menta_hoja_fn(mat, 9.0 if n != 3 else 7.6, r, seco)
    if n == 3:
        mata(e, PIE, 8.0, 7.0, 6.0, 18, hoja, r)
    else:
        mata(e, PIE, 11.0, 10.0, 8.0, 30, hoja, r, seco=seco)
    return e.render()


def menta_item(podrido):
    e = esc()
    mat = SECO_NEGRO if podrido else VERDE_MENTA
    cx, cy = 32.0, 44.0
    S = P.arco((cx, cy), -90 + (14 if podrido else 0), 19.0, 8 if podrido else -4)
    e.pon(P.Tallo(S, 1.4, 1.2, P.podrido(TALLO_VERDE, 0.8) if podrido else TALLO_VERDE, 0, grupo='t'))
    T = P.tangentes(S)
    for j, (tt, L) in enumerate(((0.36, 7.6), (0.62, 6.8), (0.88, 5.4))):
        k = int(tt * (len(S) - 1))
        for s in (-1, 1):
            a = P.ang_de(T[k]) + s * (58 if not podrido else 90)
            Sh = P.arco(S[k], a, L, s * (12 if not podrido else 36))
            e.pon(P.Eje(Sh, P.forma('ovada', 0.27 * L * 1.6), mat, 1 + j * 0.1 + s * 0.01, grupo='h%d%d' % (j, s),
                        nervio=1, copa=0.2, borde=P.dientes(3, 0.22)))
    return e.render()


def menta_emblema():
    e = esc()
    for k, (a, L) in enumerate(((-128, 4.6), (-90, 5.2), (-52, 4.6))):
        S = P.arco((32.0, 36.0), a, L, 0)
        e.pon(P.Eje(S, P.forma('ovada', 1.6), VERDE_MENTA, 1 + (0.2 if k == 1 else 0), grupo='h%d' % k,
                    nervio=None, borde=P.dientes(2, 0.2)))
    return e.render()


# ===========================================================================
# 32. PEREJIL
# ===========================================================================

VERDE_PEREJIL = Material(rampa_hsv(92, 110, .74, .82, .84, .28, 8), '#143410')
FOL_PEREJIL = [
    (0.50, +1, 54, 0.20, 0.10, 'ovada', 6, P.dientes(3, 0.42)),
    (0.50, -1, 54, 0.20, 0.10, 'ovada', 6, P.dientes(3, 0.42)),
    (0.74, +1, 44, 0.22, 0.11, 'ovada', 6, P.dientes(3, 0.42)),
    (0.74, -1, 44, 0.22, 0.11, 'ovada', 6, P.dientes(3, 0.42)),
    (0.80, 0, 0, 0.24, 0.12, 'ovada', 0, P.dientes(3, 0.42)),
]


def perejil_hoja(pie, az, e0, e1, L, mat, grupo, brillo=0.0):
    return hoja_comp3d(pie, (0, 0, 0), az, e0, e1, L, mat, grupo, FOL_PEREJIL, raquis=1.0, brillo=brillo)


def perejil_etapa(n):
    e = esc()
    r = rng('perejil', n)
    if n == 1:
        brote_cotiledones(e, PIE, VERDE_PEREJIL, largo=7.2, ancho=1.3, abre=58, curva=10, forma_nombre='cinta')
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE_PEREJIL
    if n == 3:
        hojas = [(194, 58, 18, 15), (236, 70, 36, 16.5), (278, 76, 46, 17), (320, 70, 34, 16.5), (2, 58, 16, 15)]
    else:
        hojas = [(184, 52, 8, 21), (210, 62, 22, 22), (238, 70, 36, 23), (266, 76, 46, 23.5),
                 (294, 74, 42, 23), (322, 66, 28, 22), (350, 54, 10, 21), (146, 58, 16, 17), (36, 58, 16, 17)]
    roseta(e, PIE, hojas, perejil_hoja, mat, seco, r)
    return e.render()


def perejil_item(podrido):
    e = esc()
    mat = P.podrido(VERDE_PEREJIL, 0.9) if podrido else VERDE_PEREJIL
    abre = 1.1 if podrido else 1.0
    for k, (a, L, cv) in enumerate(((-90 - 15 * abre, 18.0, -6), (-90 + 15 * abre, 18.0, 6), (-90, 20.0, 0))):
        S = P.arco((32.0 + (k - 1) * 0.8, 45.0), a, L, cv)
        fol = [(t, lado, ang, lr * L, wr * L, fm, c, b) for (t, lado, ang, lr, wr, fm, c, b) in FOL_PEREJIL]
        e.pon(*P.hoja_compuesta(S, mat, k * 0.1, 'p%d' % k, fol, raquis=1.0, nervio=None))
    return e.render()


def perejil_emblema():
    e = esc()
    for k, (a, L) in enumerate(((-132, 4.4), (-90, 5.0), (-48, 4.4))):
        S = P.arco((32.0, 36.0), a, L, 0)
        e.pon(P.Eje(S, P.forma('ovada', 1.7), VERDE_PEREJIL, 1 + (0.2 if k == 1 else 0), grupo='h%d' % k,
                    nervio=None, borde=P.dientes(2, 0.4)))
    return e.render()


# ===========================================================================
# 33. ROMERO
# ===========================================================================

VERDE_ROMERO = Material(rampa_hsv(108, 140, .30, .42, .80, .30, 8), '#16302a')
LENA_ROMERO = M(['#c7b39a', '#a8917a', '#8f7863', '#77634f', '#5f4f3f', '#4a3d31'], '#2c241c')


def ramita_romero(e, base, ang, L, mat, z, grupo, curva=0.0, mat_lena=None):
    """
    Ramita de romero: una escobilla de agujas que miran a la punta. Se dibuja
    como UNA figura de borde dentado (agujas sueltas de 1 px eran ruido).
    """
    S = P.arco(base, ang, L, curva)
    k = max(2, int(0.22 * (len(S) - 1)))
    e.pon(P.Tallo(S[:k + 1], 1.4, 1.2, mat_lena or LENA_ROMERO, z - 0.01, grupo=grupo))
    w = P.suave([0, .2, .55, .85, 1], [1.2, 2.3, 2.3, 1.6, 0.3])
    e.pon(P.Eje(P.remuestrear(S[k:], 28), w, mat, z, grupo=grupo, nervio=1, nervio_t=(0.0, 0.9),
                borde=P.dientes(7, 0.55, t0=0.02, t1=0.98), pliegue=0.16))


def romero_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('romero', n)
    if n == 1:
        ramita_romero(e, (cx, cy + 1.0), -90, 9.0, VERDE_ROMERO, 0, 'r0')
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE_ROMERO
    lena = P.SECO_OSCURO if seco else LENA_ROMERO
    if n == 3:
        troncos = [(-2.0, -104, 9.0, -6, 2), (2.0, -78, 10.0, 6, 2)]
        Lr = 9.0
    else:
        troncos = [(-4.0, -118, 12.0, -10, 3), (-1.0, -98, 15.0, -4, 3), (2.0, -80, 14.0, 4, 3), (5.0, -60, 11.0, 10, 2)]
        Lr = 11.0
    for k, (dx, a, L, cv, nr) in enumerate(troncos):
        base = (cx + dx * 0.4, cy + 1.0)
        L = jit(r, L, 0.05) * (0.9 if seco else 1.0)
        S = P.arco(base, a + (cv * 1.5 if seco else 0), L, cv * (2.5 if seco else 1.0))
        e.pon(P.Tallo(S, 2.0, 1.4, lena, k * 0.1, grupo='t%d' % k))
        T = P.tangentes(S)
        for j in range(nr):
            tt = 0.45 + 0.55 * j / max(1, nr - 1)
            kk = min(len(S) - 1, int(tt * (len(S) - 1)))
            lado = 1 if (j + k) % 2 else -1
            aa = P.ang_de(T[kk]) + (lado * 26 if j < nr - 1 else 0)
            ramita_romero(e, tuple(S[kk]), aa, jit(r, Lr * (0.85 if j < nr - 1 else 1.0), 0.08) * (0.9 if seco else 1.0),
                          mat, k * 0.1 + 0.05 + j * 0.01, 't%d' % k, curva=lado * (30 if seco else 8), mat_lena=lena)
    return e.render()


def romero_item(podrido):
    e = esc()
    mat = P.podrido(VERDE_ROMERO, 0.9) if podrido else VERDE_ROMERO
    ramita_romero(e, (24.0, 45.0), -64 + (6 if podrido else 0), 23.0, mat, 0, 'r', curva=(16 if podrido else 6))
    return e.render()


def romero_emblema():
    e = esc()
    ramita_romero(e, (29.5, 37.5), -62, 8.2, VERDE_ROMERO, 0, 'r', curva=4)
    return e.render()


# ===========================================================================
# 34. RUCULA
# ===========================================================================

VERDE_RUCULA = Material(rampa_hsv(94, 112, .70, .80, .76, .26, 8), '#142e10')


def rucula_hoja(pie, az, e0, e1, L, mat, grupo, brillo=0.0):
    """Rucula: hoja larga y estrecha, recortada en lobulos profundos."""
    P3 = P.espina3d(az, e0, e1, L)
    S = P.proyecta(pie, P3)
    vis = P.ancho_visible(az, (e0 + e1) / 2.0)
    z = float(P3[:, 2].mean())
    W = L * vis
    fol = [
        (0.22, +1, 66, 0.12 * L, 0.060 * W, 'ovada', 8), (0.30, -1, 64, 0.13 * L, 0.065 * W, 'ovada', 8),
        (0.40, +1, 60, 0.15 * L, 0.070 * W, 'ovada', 10), (0.49, -1, 58, 0.16 * L, 0.075 * W, 'ovada', 10),
        (0.58, +1, 54, 0.16 * L, 0.075 * W, 'ovada', 10),
        (0.62, 0, 0, 0.38 * L, 0.120 * W, 'ovada', 0, P.ondas(2, 0.12)),
    ]
    return P.hoja_compuesta(S, mat, z, grupo, fol, raquis=1.0, nervio=1, brillo=brillo)


def rucula_etapa(n):
    e = esc()
    r = rng('rucula', n)
    if n == 1:
        brote_cotiledones(e, PIE, VERDE_RUCULA, largo=6.6, ancho=3.0, abre=66, curva=12)
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE_RUCULA
    if n == 3:
        hojas = [(190, 50, 10, 16), (232, 62, 26, 17), (274, 70, 38, 18), (316, 62, 26, 17), (356, 50, 10, 16)]
    else:
        hojas = [(182, 46, 2, 23), (208, 56, 14, 24), (236, 64, 28, 25), (264, 72, 40, 25), (292, 70, 36, 25),
                 (320, 62, 22, 24), (348, 52, 8, 23), (144, 54, 12, 18), (36, 54, 12, 18)]
    roseta(e, PIE, hojas, rucula_hoja, mat, seco, r)
    return e.render()


def rucula_item(podrido):
    e = esc()
    mat = P.podrido(VERDE_RUCULA, 0.9) if podrido else VERDE_RUCULA
    abre = 1.1 if podrido else 1.0
    for k, (a, L, cv) in enumerate(((-90 - 16 * abre, 18.0, -8), (-90 + 16 * abre, 18.0, 8), (-90, 20.0, 0))):
        S = P.arco((32.0 + (k - 1) * 0.6, 45.0), a, L, cv)
        fol = [(0.30, +1, 60, 0.15 * L, 0.07 * L, 'ovada', 8), (0.40, -1, 58, 0.16 * L, 0.075 * L, 'ovada', 8),
               (0.52, +1, 54, 0.16 * L, 0.075 * L, 'ovada', 8), (0.62, 0, 0, 0.38 * L, 0.12 * L, 'ovada', 0, P.ondas(2, 0.12))]
        e.pon(*P.hoja_compuesta(S, mat, k * 0.1, 'p%d' % k, fol, raquis=1.0, nervio=1))
    return e.render()


def rucula_emblema():
    e = esc()
    for k, (a, L) in enumerate(((-120, 5.6), (-60, 5.6))):
        S = P.arco((32.0, 37.0), a, L, 0)
        e.pon(P.Eje(S, P.forma('ovada', 1.6), VERDE_RUCULA, 1 + k * 0.1, grupo='h%d' % k, nervio=None,
                    borde=P.ondas(2, 0.35)))
    return e.render()


# ===========================================================================
# 35. CHIRIVIA
# ===========================================================================

CREMA_CHIRIVIA = M(['#fffbe8', '#f4e7c6', '#e7d4a9', '#d4bd8b', '#ba9f6e', '#9a8055', '#7a6440'], '#4a3c24')
VERDE_CHIRIVIA = VERDE['tomate']
FOL_CHIRIVIA = [
    (0.30, +1, 62, 0.22, 0.11, 'ovada', 8, P.dientes(3, 0.32)),
    (0.38, -1, 60, 0.22, 0.11, 'ovada', 8, P.dientes(3, 0.32)),
    (0.56, +1, 54, 0.22, 0.11, 'ovada', 8, P.dientes(3, 0.32)),
    (0.63, -1, 52, 0.22, 0.11, 'ovada', 8, P.dientes(3, 0.32)),
    (0.72, 0, 0, 0.28, 0.13, 'ovada', 0, P.dientes(3, 0.32)),
]


def chirivia_hoja(pie, az, e0, e1, L, mat, grupo, brillo=0.0):
    return hoja_comp3d(pie, (0, 0, 0), az, e0, e1, L, mat, grupo, FOL_CHIRIVIA, raquis=1.0, brillo=brillo)


def chirivia_raiz(e, top, largo, grueso, ang, curva, podrido, z, rid='c'):
    mat = P.podrido(CREMA_CHIRIVIA, 0.6) if podrido else CREMA_CHIRIVIA
    S = P.arco(top, ang, largo, curva)
    w = P.suave([0, .07, .3, .68, .92, 1], [grueso * .9, grueso, grueso * .82, grueso * .45, grueso * .18, 0.1])
    surcos = [(0.22, 1), (0.36, -1), (0.5, 1), (0.64, -1)]

    def ex_surcos(t, s, d, Q, idx, cols):
        m = np.zeros(len(t), bool)
        for (tp, lado) in surcos:
            m |= (np.abs(t - tp) < 0.022) & (s * lado > -0.1) & (np.abs(s) < 0.78)
        ii = np.clip(idx + 1, 0, mat.n() - 1)
        cols[m] = np.array(mat.rampa)[ii[m]]
        return cols
    ex = P.encadena_eje(ex_surcos, P.manchas_eje([(0.35, -0.3, .16, .7), (0.62, 0.35, .14, .6)], MANCHA, 'chi' + rid) if podrido else None)
    e.pon(P.Eje(S, w, mat, z, modelo='tubo', grupo='raiz', punta_clara=0.0, extra=ex))


def chirivia_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('chirivia', n)
    if n == 1:
        brote_cotiledones(e, PIE, VERDE_CHIRIVIA, largo=7.4, ancho=1.4, abre=58, curva=10, forma_nombre='cinta')
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE_CHIRIVIA
    if n == 3:
        hojas = [(192, 56, 14, 15), (232, 66, 30, 16.5), (270, 74, 44, 17.5), (308, 66, 30, 16.5), (348, 56, 14, 15)]
    else:
        hojas = [(184, 50, 6, 21), (212, 58, 18, 22.5), (240, 66, 32, 23.5), (268, 74, 44, 24), (296, 70, 38, 23.5),
                 (324, 62, 24, 22.5), (352, 52, 8, 21), (148, 58, 16, 16), (34, 58, 16, 16)]
    roseta(e, (cx, cy - 2.0), hojas, chirivia_hoja, mat, seco, r)
    if n in (4, 5):
        m = P.podrido(CREMA_CHIRIVIA, 0.6) if seco else CREMA_CHIRIVIA
        ex = P.manchas_bola([(-0.3, 0.25, .42, .34), (0.4, -0.15, .3, .28)], MANCHA, 'chh') if seco else None
        b = P.Bola((cx, cy + 1.0), 5.8, 5.0, m, 100, grupo='raiz', extra=ex)
        b.recorte = suelo_rim(cx, cy + 2.4, 6.0, 1.6)
        e.pon(b)
    return e.render()


def chirivia_item(podrido):
    e = esc()
    top = (30.0, 23.0)
    mat_h = P.podrido(VERDE_CHIRIVIA, 0.9) if podrido else VERDE_CHIRIVIA
    for k, (a, L) in enumerate(((-118, 6.4), (-90, 7.0), (-62, 6.4))):
        if podrido:
            a = a + (-20 if a < -95 else 20 if a > -85 else 6)
        S = P.arco((top[0] + (k - 1) * 0.8, top[1] + 0.6), a, L, 10 if a > -90 else -10)
        e.pon(*P.hoja_compuesta(S, mat_h, 1 + (0.2 if k == 1 else 0), 'hi%d' % k,
                                [(0.42, 0, 0, L * 0.6, 2.2, 'ovada', 0, P.dientes(2, 0.3))], raquis=1.0, nervio=1))
    chirivia_raiz(e, top, 15.0, 4.0, 80, 8, podrido, 10, rid='item')
    return e.render()


def chirivia_emblema():
    e = esc()
    top = (30.5, 29.5)
    for k, a in enumerate((-112, -70)):
        S = P.arco((top[0], top[1] + 0.4), a, 2.4, 0)
        e.pon(P.Eje(S, P.forma('ovada', 1.0), VERDE_CHIRIVIA, 1, grupo='h%d' % k, nervio=None))
    chirivia_raiz(e, top, 6.4, 1.8, 58, 6, False, 10, rid='emb')
    return e.render()


# ===========================================================================
# 36. CALABAZA MOSCADA
# ===========================================================================

BEIGE_MOSCADA = M(['#fff2cc', '#f2d49a', '#e6bf7c', '#d4a764', '#bc8d50', '#9c7240', '#7c5932'], '#4e3820')


def moscada_fruto(e, c, largo, grueso, ang, podrido, z, grupo, rid='m'):
    """Calabaza moscada: cuello largo y estrecho y el culo gordo, en forma de campana."""
    mat = P.podrido(BEIGE_MOSCADA, 0.6) if podrido else BEIGE_MOSCADA
    a = math.radians(ang)
    ini = (c[0] - math.cos(a) * largo / 2, c[1] - math.sin(a) * largo / 2)
    S = P.arco(ini, ang, largo, 4)
    w = P.suave([0, .1, .4, .58, .8, .94, 1], [grueso * .5, grueso * .58, grueso * .6, grueso * .8, grueso,
                                              grueso * .86, grueso * .5])
    ex = P.manchas_eje([(0.7, -0.3, .16, .7), (0.4, 0.3, .14, .6)], MANCHA_OSCURA, 'mos' + rid) if podrido else None
    e.pon(P.Eje(S, w, mat, z, modelo='tubo', grupo=grupo, punta_clara=0.0, extra=ex))
    e.pon(P.Tallo(P.curva([(ini[0] + math.cos(a) * 0.6, ini[1] + math.sin(a) * 0.6),
                           (ini[0] - math.cos(a) * 1.8, ini[1] - math.sin(a) * 1.8 - 0.8)]),
                  1.8, 1.4, P.SECO_OSCURO if podrido else TALLO_GUIA, z + 0.1, grupo=grupo))


def moscada_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('calabaza_moscada', n)
    V = VERDE['oliva']
    if n == 1:
        brote_cotiledones(e, PIE, V, largo=7.4, ancho=3.4, abre=64, curva=10, forma_nombre='eliptica')
        return e.render()
    seco = n == 5
    mat = SECO if seco else V
    mt = P.SECO_OSCURO if seco else TALLO_GUIA

    def hoja(pie, az, e0, e1, L, mat_, grupo, brillo=0.0):
        return P.hoja3d(pie, az, e0, e1, L, 0.36 * L, 'corazon', mat_, grupo, peciolo=0.42, grosor_peciolo=1.5,
                        mat_peciolo=mt, nervio=2, borde=P.ondas(2, 0.24, irregular=0.2), nervios=(3.4, 45, 1),
                        copa=0.14, brillo=brillo)
    if n == 3:
        hojas = [(186, 50, 8, 17), (232, 64, 28, 18), (272, 70, 38, 19), (312, 64, 26, 18), (354, 50, 8, 17)]
    else:
        hojas = [(182, 48, 4, 21), (222, 60, 22, 22), (262, 70, 36, 23), (302, 62, 24, 22), (342, 50, 6, 21),
                 (140, 50, 8, 16), (40, 50, 8, 16)]
    roseta(e, PIE, hojas, hoja, mat, seco, r)
    if n == 3:
        flor(e, (cx - 2.0, cy - 5.0), 1.6, FLOR_AMARILLA, 300, 'flor0')
    else:
        moscada_fruto(e, (cx + 1.0, cy + 2.6), 17.0 * (0.94 if seco else 1.0), 5.0, -14, seco, 400, 'f', rid='p')
    return e.render()


def moscada_item(podrido):
    e = esc()
    moscada_fruto(e, (32.0, 33.0), 18.5, 5.6, 62, podrido, 10, 'f', rid='item')
    return e.render()


def moscada_emblema():
    e = esc()
    moscada_fruto(e, (32.0, 32.5), 5.8, 2.1, 36, False, 10, 'f', rid='emb')
    return e.render()


# ===========================================================================
# 37. CHAYOTE
# ===========================================================================

VERDE_CHAYOTE = M(['#eefbd0', '#c2e28c', '#abd273', '#93bd5f', '#7aa34d', '#61873d', '#4a6a2e'], '#2a4019')


def chayote_fruto(e, c, s, podrido, z, grupo, rid='c', giro=0.0):
    """Chayote: pera verde clara con cuatro surcos de arriba abajo."""
    mat = P.podrido(VERDE_CHAYOTE, 0.6) if podrido else VERDE_CHAYOTE

    def radio(th):
        arriba = np.clip(-np.sin(th), 0, 1)
        abajo = np.clip(np.sin(th), 0, 1)
        return (1.0 - 0.28 * arriba ** 1.4 + 0.06 * abajo) * (1.0 + 0.025 * np.cos(8 * th))
    ex = P.encadena(P.meridianos([-50, -16, 18, 52], mat, pasos=2, grosor=0.05, v_lim=(-0.8, 0.9)),
                    P.manchas_bola([(-0.3, 0.3, .4, .32), (0.4, -0.1, .3, .3)], MANCHA, 'cha' + rid) if podrido else None)
    e.pon(P.Bola(c, 3.6 * s, 4.2 * s, mat, z, grupo=grupo, radio=radio, giro=giro, extra=ex, especular=0.88))
    e.pon(P.Tallo(P.curva([(c[0], c[1] - 3.2 * s), (c[0] + 0.6, c[1] - 4.6 * s)]), 1.2 + 0.3 * s, 1.0,
                  P.SECO_OSCURO if podrido else TALLO_GUIA, z + 0.1, grupo=grupo))


def chayote_etapa(n):
    e = esc()
    r = rng('chayote', n)
    V = VERDE['tomate']
    if n == 1:
        brote_cotiledones(e, PIE, V, largo=7.0, ancho=3.2, abre=64, curva=10, forma_nombre='eliptica')
        return e.render()
    seco = n == 5
    mat = SECO if seco else V
    mt = P.SECO_OSCURO if seco else TALLO_GUIA
    hp = hoja_palmeada(mat, 11.5 if n != 3 else 10.0, r, seco=seco, mat_p=mt, lobulos=0.16, ancho=0.36)

    def hoja(origen, az, e0, e1, grupo, brillo):
        return hp(origen, az, grupo, brillo)
    if n == 3:
        nud = mata(e, PIE, 8.0, 8.0, 6.0, 12, hoja, r, tallo_mat=mt)
        flores_en(e, nud, 2, FLOR_BLANCA, 0.9)
    else:
        nud = mata(e, PIE, 10.5, 10.5, 7.5, 18, hoja, r, seco=seco, tallo_mat=mt)
        for k, q in enumerate(nudos_delante(nud, 2, ny0=-0.6, ny1=0.5)):
            colgar(e, PIE, q, 1.0, lambda top, k=k: chayote_fruto(
                e, (top[0], top[1] + 4.0), 1.0 * (0.92 if seco else 1.0), seco, 300 + k, 'fr%d' % k, rid=str(k),
                giro=(k - 0.5) * 16), 300 + k, 'fr%d' % k, mat_r=(P.SECO_OSCURO if seco else None))
    return e.render()


def chayote_item(podrido):
    e = esc()
    chayote_fruto(e, (32.0, 34.0), 1.9, podrido, 10, 'f', rid='item', giro=-12)
    return e.render()


def chayote_emblema():
    e = esc()
    chayote_fruto(e, (32.0, 34.0), 0.74, False, 10, 'f', rid='emb')
    return e.render()


# ===========================================================================
# 38. CACAHUETE
# ===========================================================================

CACAHUETE = M(['#fcebc6', '#ecd09a', '#ddb97e', '#c9a066', '#ad8551', '#8c6a40', '#6c5131'], '#45321c')
FOL_CACAHUETE = [
    (0.42, +1, 52, 0.30, 0.15, 'eliptica', 6), (0.42, -1, 52, 0.30, 0.15, 'eliptica', 6),
    (0.80, +1, 34, 0.32, 0.16, 'eliptica', 6), (0.80, -1, 34, 0.32, 0.16, 'eliptica', 6),
]


def vaina_cacahuete(e, c, s, ang, podrido, z, grupo, rid='v'):
    """Cascara de cacahuete: dos bultos unidos por una cintura (lisa, sin redecilla)."""
    mat = P.podrido(CACAHUETE, 0.6) if podrido else CACAHUETE
    a = math.radians(ang)
    d = np.array([math.cos(a), math.sin(a)])
    for k, (off, rx, ry) in enumerate(((-2.0, 2.5, 2.2), (2.1, 2.7, 2.35))):
        cc = (c[0] + d[0] * off * s, c[1] + d[1] * off * s)
        ex = P.manchas_bola([(0.1, 0.2, .5, .4)], MANCHA_OSCURA, 'cac%s%d' % (rid, k)) if (podrido and k == 1) else None
        e.pon(P.Bola(cc, rx * s, ry * s, mat, z + k * 0.01, grupo=grupo, giro=ang, extra=ex))


def cacahuete_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('cacahuete', n)
    V = VERDE['tomate']
    if n == 1:
        brote_cotiledones(e, PIE, V, largo=6.0, ancho=2.8, abre=64, curva=10)
        e.pon(*hoja_comp3d(PIE, (0, 2.6, 0), 270, 86, 70, 6.0, V, 'b3', FOL_CACAHUETE, raquis=1.0))
        return e.render()
    seco = n == 5
    mat = SECO if seco else V

    def hoja(origen, az, e0, e1, grupo, brillo):
        L = jit(r, (10.0 if n != 3 else 8.6) * (0.9 if seco else 1.0), 0.08)
        return hoja_comp3d(PIE, origen, az, e0, e1, L, mat, grupo, FOL_CACAHUETE, raquis=1.0, brillo=brillo)
    if n == 3:
        nud = mata(e, PIE, 6.5, 9.0, 5.0, 16, hoja, r, y_min=-0.6)
        flores_en(e, nud, 3, FLOR_AMARILLA, 0.8)
    else:
        mata(e, PIE, 8.0, 12.0, 6.0, 24, hoja, r, seco=seco, y_min=-0.6)
        for k, (dx, dy, ang) in enumerate(((-6.0, 4.0, 18), (5.5, 4.6, -24))):
            vaina_cacahuete(e, (cx + dx, cy + dy), 1.0, ang, seco, 400 + k, 'v%d' % k, rid=str(k))
    return e.render()


def cacahuete_item(podrido):
    e = esc()
    vaina_cacahuete(e, (30.0, 30.0), 1.75, -58, podrido, 10, 'v', rid='item')
    return e.render()


def cacahuete_emblema():
    e = esc()
    vaina_cacahuete(e, (32.0, 32.0), 0.78, -50, False, 10, 'v', rid='emb')
    return e.render()


# ===========================================================================
# 39. YUCA
# ===========================================================================

CORTEZA_YUCA = M(['#ddb98f', '#bb8d5f', '#a3784c', '#8a653f', '#715233', '#5a4128', '#45311e'], '#2c1d12')
PULPA_YUCA = M(['#ffffff', '#fbf7ee', '#f0e9d8', '#ddd2bb', '#c3b69b'], '#5a4c35')
PECIOLO_YUCA = M(['#ff9a8a', '#d9584c', '#bf463d', '#a03932', '#802d28'], '#4a1814')
TALLO_YUCA = M(['#d8cbb4', '#b9a98f', '#9e8d74', '#85755f', '#6c5e4c', '#55493b'], '#2f281f')


def hoja_yuca(pie, origen, az, e0, e1, L, mat, grupo, brillo=0.0, seco=False):
    """Hoja palmeada de la yuca: 5-7 dedos estrechos saliendo del final del rabo rojo."""
    P3 = P.espina3d(az, e0, e1, L * 0.45, origen=origen)
    S = P.proyecta(pie, P3)
    z = float(P3[:, 2].mean())
    piezas = [P.Tallo(S, 1.1, 1.0, P.SECO_OSCURO if seco else PECIOLO_YUCA, z + 0.01, grupo=grupo)]
    T = P.tangentes(S)
    a0 = P.ang_de(T[-1])
    for k, da in enumerate((-64, -32, 0, 32, 64)):
        Ld = L * (0.62 if abs(da) > 40 else 0.78 if da else 0.86)
        Sd = P.arco(tuple(S[-1]), a0 + da, Ld, da * 0.25 + 10)
        h = P.Eje(Sd, P.forma('lanceolada', 0.11 * L), mat, z, grupo=grupo, nervio=1, pliegue=0.24)
        h.brillo0 += brillo
        piezas.append(h)
    return piezas


def yuca_raices(e, cx, cy, seco):
    for k, (dx, dy, L, g, ang) in enumerate(((-5.0, 3.4, 12.0, 2.4, 168), (4.6, 3.8, 11.0, 2.3, 14))):
        huso(e, (cx + dx, cy + dy), L, g, ang, 6 if k else -6, CORTEZA_YUCA, 120 + k, 'raiz%d' % k, seco,
             mancha=MANCHA_OSCURA, rid='p%d' % k)


def yuca_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('yuca', n)
    V = VERDE['tomate']
    if n == 1:
        t, C3 = tallo_curvo(PIE, [(0, 0, 0), (0, 2.0, 0), (0.2, 3.6, 0)], 1.8, 1.4, TALLO_YUCA, 'tb')
        e.pon(t)
        e.pon(*hoja_yuca(PIE, tuple(C3[-1]), 270, 60, 30, 7.0, V, 'bh0'))
        return e.render()
    seco = n == 5
    mat = SECO if seco else V
    mt = P.SECO_OSCURO if seco else TALLO_YUCA
    if n == 3:
        tallos = [(-2.0, 0.0, 14.0, -3), (2.0, -1.0, 17.0, 3)]
        Lh = 11.0
    else:
        tallos = [(-4.0, 0.5, 18.0, -6), (0.0, -1.0, 23.0, 0), (4.0, 0.5, 20.0, 6)]
        Lh = 12.5
    for k, (dx, dz, h, inc) in enumerate(tallos):
        h = jit(r, h, 0.05) * (0.92 if seco else 1.0)
        t, C3 = tallo_curvo(PIE, [(dx * 0.4, 0, dz), (dx * 0.8 + inc * 0.3, h * 0.5, dz), (dx + inc * 0.6, h, dz)],
                            2.2, 1.6, mt, 's%d' % k)
        e.pon(t)
        for j, (tt, az) in enumerate(((0.62, 200 + k * 30), (0.8, 330 - k * 25), (1.0, 270))):
            p, _ = P.en_curva3d(C3, tt)
            e0, e1 = (50, 0) if not seco else (30, -30)
            e.pon(*hoja_yuca(PIE, tuple(p), az + r.uniform(-10, 10), e0, e1, jit(r, Lh, 0.08), mat,
                             's%dh%d' % (k, j), brillo=(0.05 if (j + k) % 2 else -0.03), seco=seco))
    if n in (4, 5):
        yuca_raices(e, cx, cy, seco)
    return e.render()


def yuca_item(podrido):
    """La raiz de yuca cortada: gruesa arriba (donde se ve la pulpa blanca) y afilada abajo."""
    e = esc()
    mat = P.podrido(CORTEZA_YUCA, 0.6) if podrido else CORTEZA_YUCA
    top = (37.0, 22.0)
    S = P.arco(top, 116, 21.0, -8)
    w = P.suave([0, .3, .62, .9, 1], [2.6, 2.6, 2.0, 0.9, 0.2])
    ex = P.manchas_eje([(0.45, -0.3, .18, .7), (0.7, 0.3, .14, .6)], MANCHA_OSCURA, 'yuc') if podrido else None
    e.pon(P.Eje(S, w, mat, 10, modelo='tubo', grupo='y', punta_clara=0.0, extra=ex))
    e.pon(P.Bola((top[0] + 0.2, top[1] - 0.2), 2.4, 1.6, P.podrido(PULPA_YUCA, 0.4) if podrido else PULPA_YUCA,
                 11, grupo='y', giro=26, plano=0.6))
    return e.render()


def yuca_emblema():
    e = esc()
    huso(e, (32.0, 32.0), 9.0, 2.2, -50, 6, CORTEZA_YUCA, 10, 'y', False, rid='emb')
    return e.render()


# ===========================================================================
# 40. TARO
# ===========================================================================

TARO = M(['#dcbe9c', '#bb946d', '#a27c58', '#896646', '#705238', '#58402b', '#42301f'], '#2a1d12')
ROSA_TARO = M(['#f7d2e0', '#e2a2bc', '#cc84a2', '#b06a88', '#90546e'], '#4a2a38')
VERDE_TARO = Material(rampa_hsv(96, 120, .62, .72, .74, .26, 8), '#132d12')


def taro_hoja(pie, az, e0, e1, L, mat, grupo, brillo=0.0, seco=False):
    """Oreja de elefante: rabo largo y una hoja grande acorazonada que cuelga."""
    return P.hoja3d(pie, az, e0, e1, L, 0.29 * L, 'corazon', mat, grupo, peciolo=0.56, grosor_peciolo=1.8,
                    mat_peciolo=(P.SECO_OSCURO if seco else VERDE_TARO), nervio=1, nervios=(3.2, 40, -1),
                    copa=0.18, brillo=brillo, curva_el=2.6)


def taro_cormo(e, c, s, podrido, z, recorte=None):
    mat = P.podrido(TARO, 0.6) if podrido else TARO

    def aros(u, v, th, n, i, cols, Q):
        m = np.zeros(len(u), bool)
        for k in (-0.5, -0.12, 0.26, 0.62):
            m |= np.abs(v - (k + 0.05 * np.sin(u * 4.0))) < 0.06
        ii = np.clip(i + 2, 0, mat.n() - 1)
        cols[m] = np.array(mat.rampa)[ii[m]]
        return cols
    ex = P.encadena(aros, P.manchas_bola([(-0.3, 0.2, .4, .3), (0.4, -0.25, .3, .28)], MANCHA_OSCURA, 'taro') if podrido else None)
    b = P.Bola(c, 5.6 * s, 6.6 * s, mat, z, grupo='cormo', extra=ex,
               radio=lambda th: 1.0 - 0.10 * np.clip(-np.sin(th), 0, 1) ** 2)
    b.recorte = recorte
    e.pon(b)


def taro_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('taro', n)
    if n == 1:
        e.pon(*taro_hoja(PIE, 260, 88, 30, 11.0, VERDE_TARO, 'b0'))
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE_TARO
    if n == 3:
        hojas = [(192, 78, -16, 19), (268, 86, 10, 21), (346, 78, -16, 19)]
    else:
        hojas = [(178, 70, -24, 24), (232, 80, -6, 26), (300, 82, -4, 26), (360, 70, -24, 24)]
    for i, (az, e0, e1, L) in enumerate(hojas):
        az += r.uniform(-4, 4)
        L = jit(r, L, 0.05)
        if seco:
            e0, e1, L = secar(e0, e1, L)
        e.pon(*taro_hoja(PIE, az, e0, e1, L, mat, 'h%d' % i, brillo=(0.05 if i % 2 else -0.03), seco=seco))
    if n in (4, 5):
        taro_cormo(e, (cx, cy + 0.5), 0.9, seco, 100, suelo_rim(cx, cy + 2.4, 5.2, 1.6))
    return e.render()


def taro_item(podrido):
    e = esc()
    c = (32.0, 35.0)
    S = P.arco((c[0], c[1] - 6.6), -90 + (12 if podrido else 2), 5.0, 8)
    e.pon(P.Eje(S, P.suave([0, 1], [1.6, 0.8]), P.podrido(ROSA_TARO, 0.5) if podrido else ROSA_TARO, 5,
                modelo='tubo', grupo='brote'))
    taro_cormo(e, c, 1.0, podrido, 10)
    return e.render()


def taro_emblema():
    e = esc()
    S = P.arco((32.0, 30.4), -90, 1.6, 0)
    e.pon(P.Eje(S, P.suave([0, 1], [0.9, 0.6]), ROSA_TARO, 5, modelo='tubo', grupo='b'))
    taro_cormo(e, (32.0, 33.0), 0.46, False, 10)
    return e.render()


# ===========================================================================
# 41. CANA DE AZUCAR
# ===========================================================================

CANA = M(['#f6f2b8', '#dcd87e', '#c6c466', '#acaa52', '#908e42', '#727034', '#575526'], '#35341a')
VERDE_CANA = Material(rampa_hsv(84, 104, .56, .64, .84, .32, 8), '#1e3c12')


def nudos_cana(mat, paso_px, largo):
    """Los nudos de la cana: anillos un tono mas oscuros (lineas de lado a lado)."""
    def extra(t, s, d, Q, idx, cols):
        u = t * largo
        m = (np.mod(u, paso_px) < 0.9) & (t > 0.05) & (t < 0.97)
        ii = np.clip(idx + 2, 0, mat.n() - 1)
        cols[m] = np.array(mat.rampa)[ii[m]]
        return cols
    return extra


def cana_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('cana_azucar', n)
    if n == 1:
        t = P.Eje(P.arco((cx, cy + 1.0), -90, 5.0, 0), P.const(1.3), CANA, 0, modelo='tubo', grupo='c0')
        e.pon(t)
        for k, (a, L) in enumerate(((-128, 8.0), (-58, 9.0))):
            S = P.arco((cx, cy - 3.0), a, L, 30 if a > -90 else -30)
            e.pon(P.Eje(S, P.forma('cinta', 1.1), VERDE_CANA, 1 + k * 0.1, grupo='h%d' % k, nervio=None))
        return e.render()
    seco = n == 5
    mc = P.podrido(CANA, 0.5) if seco else CANA
    mh = SECO if seco else VERDE_CANA
    if n == 3:
        canas = [(-3.0, 15.0, -3), (0.5, 18.0, 0), (3.5, 14.0, 4)]
    else:
        canas = [(-5.5, 20.0, -5), (-2.0, 25.0, -2), (1.5, 27.0, 1), (5.0, 22.0, 5)]
    for k, (dx, h, inc) in enumerate(canas):
        h = jit(r, h, 0.04)
        base = (cx + dx, cy + 1.0 - abs(dx) * 0.1)
        S = P.arco(base, -90 + inc * 1.2 + (inc * 2.0 if seco else 0), h, inc * (2.0 if seco else 0.6))
        L = float(np.sqrt(((S[1:] - S[:-1]) ** 2).sum(1)).sum())
        e.pon(P.Eje(S, P.const(1.4), mc, k * 0.1, modelo='tubo', grupo='c%d' % k, punta_clara=0.0,
                    extra=nudos_cana(mc, 4.2, L)))
        T = P.tangentes(S)
        for j, tt in enumerate((0.45, 0.65, 0.82, 1.0)):
            kk = min(len(S) - 1, int(tt * (len(S) - 1)))
            lado = 1 if (j + k) % 2 else -1
            a = P.ang_de(T[kk]) + lado * (40 if not seco else 75)
            Lh = jit(r, 12.0 if n != 3 else 10.0, 0.08)
            Sh = P.arco(tuple(S[kk]), a, Lh, lado * (70 if not seco else 90))
            e.pon(P.Eje(Sh, P.forma('cinta', 1.15), mh, k * 0.1 + 0.05 + j * 0.01, grupo='c%dh%d' % (k, j),
                        nervio=1, pliegue=0.3))
    return e.render()


def cana_item(podrido):
    e = esc()
    mc = P.podrido(CANA, 0.6) if podrido else CANA
    for k, (dx, L) in enumerate(((-2.2, 20.0), (2.0, 21.5))):
        S = P.arco((26.0 + dx, 44.0), -64, L, 0)
        ex = P.encadena_eje(nudos_cana(mc, 5.0, L),
                            P.manchas_eje([(0.5, 0.0, .18, .9)], MANCHA_OSCURA, 'can%d' % k) if podrido else None)
        e.pon(P.Eje(S, P.const(1.9), mc, k * 0.1, modelo='tubo', grupo='c%d' % k, punta_clara=0.0, tapas=True,
                    extra=ex))
    return e.render()


def cana_emblema():
    e = esc()
    S = P.arco((30.0, 36.5), -56, 6.6, 0)
    e.pon(P.Eje(S, P.const(1.5), CANA, 0, modelo='tubo', grupo='c', extra=nudos_cana(CANA, 2.8, 6.6)))
    return e.render()


# ===========================================================================
# 42. ACHICORIA (radicchio)
# ===========================================================================

RADICCHIO = M(['#f4a8cc', '#c23c70', '#a72e60', '#8c2652', '#721e44', '#591736', '#421029'], '#2a0a19')
VENA_BLANCA = M(['#ffffff', '#f7eff3', '#e8d8e0', '#d2bcc7', '#b69eab', '#93798a'], '#4a3640')
VERDE_ACHICORIA = Material(rampa_hsv(90, 110, .56, .66, .74, .28, 8), '#173312')


def achicoria_cabeza(e, c, rx, ry, podrido, z):
    mat = P.podrido(RADICCHIO, 0.6) if podrido else RADICCHIO
    ex = P.encadena(P.meridianos([-58, -24, 12, 46], VENA_BLANCA, pasos=0, grosor=0.05, v_lim=(-0.2, 0.95)),
                    P.manchas_bola([(-0.3, 0.2, .42, .34), (0.42, -0.2, .3, .28)], MANCHA_OSCURA, 'ach') if podrido else None)
    e.pon(P.Bola(c, rx, ry, mat, z, grupo='cogollo', extra=ex))


def achicoria_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('achicoria', n)
    if n == 1:
        brote_cotiledones(e, PIE, VERDE_ACHICORIA, largo=6.6, ancho=3.0, abre=66, curva=12, mat_tallo=RADICCHIO)
        return e.render()
    seco = n == 5
    if n == 3:
        defs = [(6, 40, 6, 13.0, 0.46), (3, 74, 48, 9.0, 0.5)]
        mats = [SECO] if seco else [VERDE_ACHICORIA, RADICCHIO]
    else:
        defs = [(7, 30, -4, 16.0, 0.46)]
        mats = [SECO] if seco else [VERDE_ACHICORIA]
    anillos(e, PIE, defs, mats, r, seco, 'redonda', borde_fn=lambda ia, k: P.ondas(3, 0.1, fase=k),
            peciolo=0.12, nervio=VENA_BLANCA.rampa[1] if not seco else 1, copa_h=0.2)
    if n in (4, 5):
        achicoria_cabeza(e, (cx, cy - 5.5), 8.2, 7.4, seco, 200)
    return e.render()


def achicoria_item(podrido):
    e = esc()
    c = (32.0, 33.0)
    achicoria_cabeza(e, c, 8.2, 7.6, podrido, 10)
    mat = P.podrido(VERDE_ACHICORIA, 0.85) if podrido else VERDE_ACHICORIA
    for s in (-1, 1):
        S = P.arco((c[0] + s * 1.0, c[1] + 6.4), -90 - s * 72, 9.6, s * 46)
        e.pon(P.Eje(S, P.forma('redonda', 3.2), mat, 12, grupo='env%d' % s, nervio=1))
    return e.render()


def achicoria_emblema():
    e = esc()
    achicoria_cabeza(e, (32.0, 32.0), 4.2, 3.8, False, 10)
    return e.render()


# ===========================================================================
# 43. CALABAZA BONETERA (patisson)
# ===========================================================================

AMARILLO_PATISSON = M(['#fffbd6', '#fbe98c', '#f2d864', '#e2c04c', '#c9a23c', '#a5832f', '#7f6424'], '#4e3c12')


def patisson_fruto(e, c, rx, ry, podrido, z, grupo, rid='p'):
    """Calabaza bonetera: un platillo de borde festoneado con el rabo en medio."""
    mat = P.podrido(AMARILLO_PATISSON, 0.6) if podrido else AMARILLO_PATISSON

    def radio(th):
        return 1.0 + 0.07 * np.cos(12 * th)
    ex = P.manchas_bola([(-0.35, 0.25, .36, .4), (0.4, -0.1, .26, .36)], MANCHA_OSCURA, 'pat' + rid) if podrido else None
    e.pon(P.Bola(c, rx, ry, mat, z, grupo=grupo, radio=radio, extra=ex))
    e.pon(P.Bola((c[0], c[1] - ry * 0.15), rx * 0.32, ry * 0.42, mat, z + 0.05, grupo=grupo + 'c', extra=None))
    e.pon(P.Tallo(P.curva([(c[0], c[1] - ry * 0.3), (c[0] + 0.5, c[1] - ry * 0.75)]), 1.6, 1.3,
                  P.SECO_OSCURO if podrido else TALLO_GUIA, z + 0.1, grupo=grupo + 'c'))


def patisson_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('calabaza_bonetera', n)
    V = VERDE['oliva']
    if n == 1:
        brote_cotiledones(e, PIE, V, largo=7.4, ancho=3.4, abre=64, curva=10, forma_nombre='eliptica')
        return e.render()
    seco = n == 5
    mat = SECO if seco else V
    mt = P.SECO_OSCURO if seco else TALLO_GUIA

    def hoja(pie, az, e0, e1, L, mat_, grupo, brillo=0.0):
        return P.hoja3d(pie, az, e0, e1, L, 0.36 * L, 'corazon', mat_, grupo, peciolo=0.42, grosor_peciolo=1.5,
                        mat_peciolo=mt, nervio=2, borde=P.ondas(2, 0.3, irregular=0.2), nervios=(3.4, 45, 1),
                        copa=0.14, brillo=brillo)
    if n == 3:
        hojas = [(194, 60, 20, 16), (248, 70, 36, 17), (300, 70, 34, 17), (352, 60, 18, 16)]
    else:
        hojas = [(184, 54, 8, 21), (222, 64, 24, 22), (262, 72, 38, 23), (300, 70, 34, 23),
                 (340, 62, 20, 22), (140, 58, 14, 17), (40, 58, 14, 17)]
    roseta(e, PIE, hojas, hoja, mat, seco, r)
    if n == 3:
        flor(e, (cx + 1.0, cy - 6.0), 1.7, FLOR_AMARILLA, 300, 'flor')
    else:
        s = 0.94 if seco else 1.0
        patisson_fruto(e, (cx - 5.0, cy + 3.0), 6.2 * s, 3.4 * s, seco, 400, 'f0', rid='0')
        patisson_fruto(e, (cx + 6.0, cy + 2.0), 5.4 * s, 3.0 * s, seco, 399, 'f1', rid='1')
    return e.render()


def patisson_item(podrido):
    e = esc()
    patisson_fruto(e, (32.0, 32.0), 7.8, 5.2, podrido, 10, 'f', rid='item')
    return e.render()


def patisson_emblema():
    e = esc()
    patisson_fruto(e, (32.0, 32.0), 4.2, 2.8, False, 10, 'f', rid='emb')
    return e.render()


# ===========================================================================
# 44. UCHUVA (physalis)
# ===========================================================================

FAROLILLO = M(['#f7f0c8', '#e6d9a0', '#d6c482', '#c0aa68', '#a38d52', '#836f3f'], '#4f4224')
FAROLILLO_VERDE = M(['#eef5c4', '#cfe091', '#b8cd76', '#9fb560', '#86994f', '#6b7c40'], '#3a4522')
BAYA_UCHUVA = M(['#ffe4a6', '#f8b94c', '#f0a032', '#dc8a26', '#c2741f', '#9e5c19'], '#5a330c')
VERDE_UCHUVA = Material(rampa_hsv(84, 100, .56, .66, .84, .32, 8), '#1f3c12')


def farolillo(e, top, s, podrido, z, grupo, rid='f', maduro=True):
    """El farolillo de la uchuva: un capuchon de papel con nervios que cuelga."""
    m = FAROLILLO if maduro else FAROLILLO_VERDE
    m = P.podrido(m, 0.6) if podrido else m
    S = P.arco(top, 90, 6.6 * s, 0)
    w = P.suave([0, .14, .45, .72, .92, 1], [0.8 * s, 2.4 * s, 3.0 * s, 2.5 * s, 1.0 * s, 0.1])
    ex = P.encadena_eje(P.rayas_eje(4, 0.16, P.desplaza(m, 2)),
                        P.manchas_eje([(0.5, 0.0, .25, .9)], MANCHA_OSCURA, 'far' + rid) if podrido else None)
    e.pon(P.Eje(S, w, m, z, modelo='tubo', grupo=grupo, punta_clara=0.0, extra=ex))


def uchuva_etapa(n):
    e = esc()
    r = rng('uchuva', n)
    if n == 1:
        brote_cotiledones(e, PIE, VERDE_UCHUVA, largo=6.4, ancho=2.8, abre=64, curva=10)
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE_UCHUVA

    def hoja(origen, az, e0, e1, grupo, brillo):
        L = jit(r, (10.0 if n != 3 else 8.6) * (0.9 if seco else 1.0), 0.08)
        return P.hoja3d(PIE, az, e0, e1, L, 0.32 * L, 'corazon', mat, grupo, peciolo=0.2, grosor_peciolo=1.0,
                        origen=origen, nervio=1, copa=0.16, borde=P.ondas(2, 0.1), brillo=brillo)
    if n == 3:
        nud = mata(e, PIE, 8.5, 8.5, 6.5, 18, hoja, r)
        flores_en(e, nud, 3, FLOR_AMARILLA, 0.8)
    else:
        nud = mata(e, PIE, 11.0, 10.5, 7.5, 26, hoja, r, seco=seco)
        for k, q in enumerate(nudos_delante(nud, 4, ny0=-0.6, ny1=0.6)):
            colgar(e, PIE, q, 0.4, lambda top, k=k: farolillo(
                e, top, 1.0 * (0.92 if seco else 1.0), seco, 300 + k, 'fr%d' % k, rid=str(k), maduro=(k % 2 == 0)),
                300 + k, 'fr%d' % k, sale=1.15, mat_r=(P.SECO_OSCURO if seco else None))
    return e.render()


def uchuva_item(podrido):
    """El farolillo abierto: sus cinco petalos de papel hacia arriba y la baya naranja delante."""
    e = esc()
    c = (32.0, 36.0)
    m = P.podrido(FAROLILLO, 0.6) if podrido else FAROLILLO
    for k, a in enumerate((-154, -122, -90, -58, -26)):
        S = P.arco((c[0], c[1] + 1.0), a, 9.0, 14 if a < -90 else -14 if a > -90 else 0)
        e.pon(P.Eje(S, P.forma('lanceolada', 2.4), m, k * 0.02, grupo='pet', nervio=2, pliegue=0.2))
    baya = P.podrido(BAYA_UCHUVA, 0.6) if podrido else BAYA_UCHUVA
    ex = P.manchas_bola([(-0.3, 0.3, .45, .36)], MANCHA_OSCURA, 'uch') if podrido else None
    e.pon(P.Bola(c, 4.4, 4.2, baya, 10, grupo='baya', especular=0.86, extra=ex))
    return e.render()


def uchuva_emblema():
    e = esc()
    farolillo(e, (32.0, 28.0), 1.05, False, 10, 'f', rid='emb')
    return e.render()


# ===========================================================================
# 45. HABA
# ===========================================================================

VAINA_HABA = M(['#e8f6bc', '#a8d472', '#90c25e', '#7aac4e', '#649240', '#4e7633', '#3a5926'], '#1f3612')
VERDE_HABA = VERDE['gris']
FOL_HABA = [
    (0.40, +1, 50, 0.36, 0.17, 'eliptica', 6), (0.40, -1, 50, 0.36, 0.17, 'eliptica', 6),
    (0.78, +1, 34, 0.36, 0.17, 'eliptica', 6), (0.78, -1, 34, 0.36, 0.17, 'eliptica', 6),
]


def vaina_haba(e, base, L, r0, ang, curva, podrido, z, grupo, rid='h'):
    """Vaina de haba: gorda, de pie y con tres bultos suaves (nada de bolitas)."""
    m = P.podrido(VAINA_HABA, 0.6) if podrido else VAINA_HABA
    S = P.arco(base, ang, L, curva)
    w = P.suave([0, .1, .5, .88, 1], [r0 * .55, r0, r0, r0 * .7, 0.3])
    ex = P.manchas_eje([(0.5, 0.0, .22, .9)], MANCHA_OSCURA, 'hab' + rid) if podrido else None
    e.pon(P.Eje(S, w, m, z, modelo='tubo', grupo=grupo, punta_clara=0.0, borde=P.ondas(3, 0.08, irregular=0.1),
                extra=ex))


def haba_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('haba', n)
    if n == 1:
        t, _ = tallo_curvo(PIE, [(0, 0, 0), (0, 2.4, 0), (0.2, 4.0, 0)], 1.8, 1.6, TALLO_VERDE, 'tb')
        e.pon(t)
        e.pon(*hoja_comp3d(PIE, (0.2, 3.8, 0), 270, 60, 30, 6.6, VERDE_HABA, 'bh',
                           FOL_HABA[:2] + [(0.62, 0, 0, 0.4, 0.2, 'eliptica')], raquis=1.0))
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE_HABA
    mt = SECO if seco else TALLO_VERDE
    if n == 3:
        tallos = [(-2.0, 0.0, 17.0, -3), (2.0, -1.0, 20.0, 3)]
    else:
        tallos = [(-4.5, 0.5, 21.0, -5), (0.0, -1.0, 26.0, 0), (4.5, 0.5, 23.0, 5)]
    for k, (dx, dz, h, inc) in enumerate(tallos):
        h = jit(r, h, 0.04) * (0.9 if seco else 1.0)
        t, C3 = tallo_curvo(PIE, [(dx * 0.4, 0, dz), (dx * 0.8 + inc * 0.3, h * 0.5, dz), (dx + inc * (0.6 if not seco else 1.6), h, dz)],
                            2.0, 1.6, mt, 's%d' % k)
        e.pon(t)
        nn = 4 if n == 3 else 5
        for j in range(nn):
            tt = 0.3 + 0.7 * j / max(1, nn - 1)
            p, _ = P.en_curva3d(C3, tt)
            az = (0 if (j + k) % 2 else 180) + r.uniform(-25, 25)
            e0, e1 = (40, 6) if not seco else (24, -30)
            e.pon(*hoja_comp3d(PIE, tuple(p), az, e0, e1, jit(r, 9.0, 0.08), mat, 's%dn%d' % (k, j), FOL_HABA,
                               raquis=1.0, brillo=(0.05 if (j + k) % 2 else -0.03)))
        if n == 3:
            p, _ = P.en_curva3d(C3, 0.7)
            q = P.proyecta(PIE, [p])[0]
            flor(e, (q[0] + (2.0 if k else -2.0), q[1]), 0.95, FLOR_BLANCA, 300 + k, 'flor%d' % k)
        else:
            p, _ = P.en_curva3d(C3, 0.5)
            q = P.proyecta(PIE, [p])[0]
            lado = 1 if k % 2 == 0 else -1
            vaina_haba(e, (q[0] + lado * 1.0, q[1] + 1.0), 10.0 * (0.9 if seco else 1.0), 2.1,
                       -90 + lado * 34 + (lado * 60 if seco else 0), lado * 14, seco, 300 + k, 'v%d' % k, rid=str(k))
    return e.render()


def haba_item(podrido):
    e = esc()
    vaina_haba(e, (24.0, 44.0), 22.0, 3.2, -62, 20, podrido, 10, 'v', rid='item')
    e.pon(P.Tallo(P.curva([(24.4, 43.4), (22.6, 46.0)]), 1.8, 1.4, P.SECO_OSCURO if podrido else CALIZ, 11, grupo='v'))
    return e.render()


def haba_emblema():
    e = esc()
    vaina_haba(e, (28.0, 37.0), 9.0, 1.5, -60, 12, False, 10, 'v', rid='emb')
    return e.render()


# ===========================================================================
# FRUTALES: arbolito joven (tronco + copa densa) con los frutos colgados
# ===========================================================================

CORTEZA = M(['#c9a27c', '#a87f5a', '#8f6a4a', '#77583e', '#604633', '#4a3628'], '#2c2019')
FLOR_ROSA = M(['#fff0f4', '#f9cfdc', '#f0b2c6', '#de93ab', '#c27590'], '#5a2c3c')
TALLO_FRUTO = M(['#b9a77a', '#998759', '#7f6e47', '#675939', '#51462e'], '#2e2818')


def arbolito(e, n, r, mat_h, L_hoja, fruto_fn, flor_mat=None, n_frutos=5, ancho_rel=0.27, fm='ovada',
             borde=None, copa_h=0.12, rh=10.5, rv=8.0, alto=19.0, nh=30, caida=1.0, sale=1.18,
             ny0=-0.6, ny1=0.45):
    """
    Un frutal joven en la parcela: el tallo de la mata es el TRONCO (corteza,
    3 px) y la copa es una mata densa encima; los frutos cuelgan de nudos de
    la cara de delante. Etapa 3 = arbolito en flor; 5 = seco con fruta podrida.
    fruto_fn(e, top, podrido, z, grupo, rid) dibuja el fruto colgando de `top`.
    """
    seco = n == 5
    mat = SECO if seco else mat_h
    hoja = hoja_simple_copa(mat, L_hoja * (0.86 if n == 3 else 1.0), ancho_rel=ancho_rel, fm=fm, borde=borde,
                            copa_h=copa_h, r=r, seco=seco)
    if n == 3:
        nud = mata(e, PIE, alto * 0.82, rh * 0.8, rv * 0.82, int(nh * 0.7), hoja, r, tallo_mat=CORTEZA,
                   y_min=-0.3, tallo_g=2.4)
        if flor_mat is not None:
            flores_en(e, nud, 4, flor_mat, 0.9, ny0=-0.2, ny1=0.9)
        return
    nud = mata(e, PIE, alto, rh, rv, nh, hoja, r, seco=seco, tallo_mat=CORTEZA, y_min=-0.3, tallo_g=3.0)
    cuantos = n_frutos if not seco else max(2, n_frutos - 2)
    for k, q in enumerate(nudos_repartidos(nud, cuantos)):
        colgar(e, PIE, q, caida, lambda top, k=k: fruto_fn(e, top, seco, 300 + k, 'fr%d' % k, str(k)),
               300 + k, 'fr%d' % k, sale=sale, mat_r=(P.SECO_OSCURO if seco else TALLO_FRUTO))


def nudos_repartidos(nudos, n, zmin=0.0, dmin=7.5):
    """
    `n` nudos de la cara de delante repartidos de izquierda a derecha Y a
    distintas alturas (abajo, arriba, en medio...): colgados todos del borde de
    abajo formaban una fila, un collar de fruta.
    """
    cand = [q for q in nudos if q[2] > zmin and -0.7 <= q[4] <= 0.8]
    if len(cand) <= n:
        return cand
    # posicion en pantalla de cada fruto, para que ninguno pise a otro (amontonados
    # parecian un racimo)
    pos = [P.proyecta(PIE, [(q[0] * 1.18, q[1], q[2] * 1.18)])[0] for q in cand]
    x0 = min(p[0] for p in pos)
    x1 = max(p[0] for p in pos)
    objetivos = [-0.45, 0.40, -0.05, 0.60, -0.30, 0.20]
    elegidos = []
    usados = []
    for i in range(n):
        xs = x0 + (x1 - x0) * (i + 0.5) / n
        mejor = None
        for j, q in enumerate(cand):
            if j in usados:
                continue
            if any(np.hypot(pos[j][0] - pos[o][0], pos[j][1] - pos[o][1]) < dmin for o in usados):
                continue
            nota = abs(q[4] - objetivos[i % len(objetivos)]) * 6.0 + abs(pos[j][0] - xs) * 0.35
            if mejor is None or nota < mejor[0]:
                mejor = (nota, j)
        if mejor is not None:
            usados.append(mejor[1])
            elegidos.append(cand[mejor[1]])
    return elegidos


def brote_frutal(e, mat, n=1):
    brote_cotiledones(e, PIE, mat, largo=6.4, ancho=2.6, abre=64, curva=10, alto=4.0, mat_tallo=CORTEZA)


def con_manchas(mat, podrido, rid, lista=None, mancha=None):
    """Material y manchas de un fruto podrido (dos manchas grandes, nunca motas)."""
    if not podrido:
        return mat, None
    lista = lista or [(-0.3, 0.25, .42, .34), (0.42, -0.15, .30, .28)]
    return P.podrido(mat, 0.62), P.manchas_bola(lista, mancha or MANCHA_OSCURA, 'fr' + rid)


def hoja_suelta(e, base, ang, L, ancho, mat, z, grupo, curva=14):
    """La hojita que acompana a un fruto suelto (item)."""
    S = P.arco(base, ang, L, curva)
    e.pon(P.Eje(S, P.forma('ovada', ancho), mat, z, grupo=grupo, nervio=1))


# ===========================================================================
# 46. PLATANO
# ===========================================================================

PLATANO = M(['#fffbc6', '#fae66c', '#f0d44c', '#dcbc3c', '#c09e30', '#9c7e26', '#7a601c'], '#4a3a0e')
PLATANO_VERDE = M(['#e6f6a6', '#b4d866', '#9ec452', '#87ae44', '#709438', '#59782d'], '#2f4116')
FLOR_PLATANO = M(['#e8a2c4', '#a8406e', '#90345e', '#782a4e', '#60213f', '#4a1930'], '#2a0d1b')
PSEUDOTALLO = M(['#cfd6a0', '#aab676', '#919d62', '#798550', '#636c41', '#4c5333'], '#2b3019')
VERDE_PLATANO = Material(rampa_hsv(86, 102, .66, .74, .84, .30, 8), '#1d3a10')


def dedo_platano(e, base, ang, L, g, mat, z, grupo, podrido=False, curva=34):
    """Un platano: curvo, mas grueso en medio, la punta oscura."""
    m = P.podrido(mat, 0.75) if podrido else mat
    S = P.arco(base, ang, L, curva)
    w = P.suave([0, .1, .45, .85, 1], [g * .45, g * .85, g, g * .7, 0.3])
    punta = M(['#9a8a5a', '#7d6d44', '#655634', '#4f4228', '#3c321e'], '#241d10')
    e.pon(P.Eje(S, w, m, z, modelo='tubo', grupo=grupo, punta_clara=0.0, extra=degradado_eje(punta, 0.9, 0.98)))


def platano_suelto(e, base, s, podrido, z):
    """Un platano en media luna: el rabo abajo a la izquierda y la punta oscura arriba."""
    m = P.podrido(PLATANO, 0.7) if podrido else PLATANO
    S = P.arco(base, -28, 21.0 * s, -84)
    w = P.suave([0, .06, .14, .5, .84, .96, 1], [0.7 * s, 0.9 * s, 2.0 * s, 2.7 * s, 1.9 * s, 0.9 * s, 0.4])
    punta = M(['#9a8a5a', '#7d6d44', '#655634', '#4f4228', '#3c321e'], '#241d10')
    rabo = M(['#c8c49a', '#a8a276', '#8c875e', '#726e4a', '#5a5739'], '#33311f')
    ex = P.encadena_eje(degradado_eje(punta, 0.93, 0.99),
                        lambda t, s_, d, Q, idx, cols: _rabo_platano(t, idx, cols, rabo),
                        P.manchas_eje([(0.45, -0.2, .16, .8), (0.7, 0.3, .12, .7)], MANCHA_OSCURA, 'pla') if podrido else None)
    e.pon(P.Eje(S, w, m, z, modelo='tubo', grupo='platano', punta_clara=0.0, extra=ex))


def _rabo_platano(t, idx, cols, rabo):
    msk = t < 0.1
    ii = np.clip(idx, 0, rabo.n() - 1)
    cols[msk] = np.array(rabo.rampa)[ii[msk]]
    return cols


def racimo_platano(e, top, maduro, podrido, z, grupo, s=1.0):
    """El racimo: un tallo que baja, dos manos de platanos que miran arriba y la bellota morada."""
    m = PLATANO if maduro else PLATANO_VERDE
    S = P.arco(top, 96, 11.0 * s, -10)
    e.pon(P.Tallo(S, 1.4, 1.2, PSEUDOTALLO if not podrido else P.SECO_OSCURO, z - 0.05, grupo=grupo))
    # dos manos alrededor del raquis, la de abajo mas pequena; cada dedo sale de
    # un arco, se abre y se curva hacia arriba (asi crecen), con su contorno
    for fila, (tt, ss) in enumerate(((0.36, 1.0), (0.66, 0.84))):
        k = int(tt * (len(S) - 1))
        cx0, cy0 = S[k]
        for j, dx in enumerate((-3.2, -1.1, 1.1, 3.2)):
            base = (cx0 + dx * s * ss, cy0 + abs(dx) * 0.35 * s * ss)
            dedo_platano(e, base, -90 + dx * 12.0, 6.6 * s * ss, 1.45 * s * ss, m,
                         z + fila * 0.2 + (0.1 if abs(dx) < 2 else 0.0), '%s%d%d' % (grupo, fila, j),
                         podrido=podrido, curva=-dx * 9.0)
    e.pon(P.Bola((S[-1][0], S[-1][1] + 1.6 * s), 1.8 * s, 2.4 * s, P.podrido(FLOR_PLATANO, 0.6) if podrido else FLOR_PLATANO,
                 z + 0.3, grupo=grupo, radio=lambda th: 1.0 + 0.3 * np.clip(np.sin(th), 0, 1) ** 2))


def platano_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('platano', n)
    if n == 1:
        e.pon(P.Eje(P.arco((cx, cy + 1.0), -90, 5.0, 0), P.const(1.6), PSEUDOTALLO, 0, modelo='tubo', grupo='p'))
        for k, (a, L) in enumerate(((-120, 8.0), (-62, 8.6))):
            S = P.arco((cx, cy - 3.0), a, L, 24 if a > -90 else -24)
            e.pon(P.Eje(S, P.forma('eliptica', 1.8), VERDE_PLATANO, 1 + k * 0.1, grupo='h%d' % k, nervio=1))
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE_PLATANO
    alto = 13.0 if n != 3 else 10.0
    e.pon(P.Eje(P.arco((cx, cy + 1.0), -90, alto, 0), P.suave([0, 1], [2.4, 1.9]),
                P.podrido(PSEUDOTALLO, 0.5) if seco else PSEUDOTALLO, 0, modelo='tubo', grupo='tronco'))
    hojas = [(190, 62, -22, 22), (232, 72, -4, 24), (274, 80, 12, 24), (316, 72, -4, 24), (356, 62, -22, 22)]
    if n == 3:
        hojas = [(200, 66, -14, 19), (264, 78, 8, 21), (334, 66, -14, 19)]
    for i, (az, e0, e1, L) in enumerate(hojas):
        az += r.uniform(-4, 4)
        L = jit(r, L, 0.05)
        if seco:
            e0, e1, L = secar(e0, e1, L)
        e.pon(*P.hoja3d(PIE, az, e0, e1, L, 0.19 * L, 'eliptica', mat, 'h%d' % i, origen=(0, alto * 0.95, 0),
                        peciolo=0.12, grosor_peciolo=1.4, mat_peciolo=(P.SECO_OSCURO if seco else PSEUDOTALLO),
                        nervio=1, nervios=(2.6, 70, 1), brillo=(0.05 if i % 2 else -0.03)))
    top = (cx + 1.0, cy + 1.0 - alto * 0.95)
    if n == 3:
        S = P.arco(top, 92, 9.0, -8)
        e.pon(P.Tallo(S, 1.4, 1.2, PSEUDOTALLO, 300, grupo='flor'))
        e.pon(P.Bola((S[-1][0], S[-1][1] + 2.2), 2.4, 3.2, FLOR_PLATANO, 300.2, grupo='flor',
                     radio=lambda th: 1.0 + 0.3 * np.clip(np.sin(th), 0, 1) ** 2))
    else:
        racimo_platano(e, top, True, seco, 300, 'racimo', s=1.0)
    return e.render()


def platano_item(podrido):
    e = esc()
    # un platano grande en media luna: es la silueta que todo el mundo reconoce
    # (tres dedos juntos, a este tamano, salian como una manopla)
    platano_suelto(e, (22.0, 43.0), 1.0, podrido, 10)
    return e.render()


def platano_emblema():
    e = esc()
    platano_suelto(e, (28.0, 37.5), 0.45, False, 10)
    return e.render()


# ===========================================================================
# 47. LIMON
# ===========================================================================

LIMON = M(['#fffcc4', '#fbe85c', '#f2d63e', '#e0be32', '#c49f28', '#9e7f20', '#7a6118'], '#4a3a0c')
VERDE_CITRICO = Material(rampa_hsv(96, 116, .70, .80, .70, .24, 8), '#122c0f')


def limon_fruto(e, top, podrido, z, grupo, rid, s=1.0, giro=10.0):
    mat, ex = con_manchas(LIMON, podrido, 'lim' + rid)
    c = (top[0], top[1] + 2.8 * s)
    e.pon(P.Bola(c, 3.6 * s, 2.7 * s, mat, z, grupo=grupo, giro=giro, extra=ex, especular=0.86,
                 radio=lambda th: 1.0 + 0.17 * np.abs(np.cos(th)) ** 8))


def limon_etapa(n):
    e = esc()
    r = rng('limon', n)
    if n == 1:
        brote_frutal(e, VERDE_CITRICO)
        return e.render()
    arbolito(e, n, r, VERDE_CITRICO, 8.4, lambda e_, top, pod, z, g, rid: limon_fruto(e_, top, pod, z, g, rid),
             flor_mat=FLOR_BLANCA, n_frutos=5, ancho_rel=0.26, fm='eliptica', copa_h=0.14)
    return e.render()


def limon_item(podrido):
    e = esc()
    hoja_suelta(e, (31.0, 26.0), -42, 8.0, 2.4, P.podrido(VERDE_CITRICO, 0.9) if podrido else VERDE_CITRICO, 11, 'f')
    limon_fruto(e, (31.0, 26.0), podrido, 10, 'f', 'item', s=2.0, giro=-18)
    return e.render()


def limon_emblema():
    e = esc()
    limon_fruto(e, (32.0, 29.0), False, 10, 'f', 'emb', s=1.0, giro=-18)
    return e.render()


# ===========================================================================
# 48. NARANJA
# ===========================================================================

NARANJA = M(['#ffd8a4', '#f8a43a', '#ef8f26', '#dc7a1e', '#c06418', '#9c5014', '#783d10'], '#4a250a')


def naranja_fruto(e, top, podrido, z, grupo, rid, s=1.0):
    mat, ex = con_manchas(NARANJA, podrido, 'nar' + rid)
    c = (top[0], top[1] + 3.0 * s)
    e.pon(P.Bola(c, 3.3 * s, 3.15 * s, mat, z, grupo=grupo, extra=ex, especular=0.86))
    e.pon(P.Bola((c[0], c[1] - 2.7 * s), 0.9 * s, 0.6 * s, P.SECO_OSCURO if podrido else CALIZ, z + 0.1,
                 grupo=grupo, plano=0.4))


def naranja_etapa(n):
    e = esc()
    r = rng('naranja', n)
    if n == 1:
        brote_frutal(e, VERDE_CITRICO)
        return e.render()
    arbolito(e, n, r, VERDE_CITRICO, 8.6, lambda e_, top, pod, z, g, rid: naranja_fruto(e_, top, pod, z, g, rid),
             flor_mat=FLOR_BLANCA, n_frutos=5, ancho_rel=0.27, fm='eliptica', copa_h=0.14)
    return e.render()


def naranja_item(podrido):
    e = esc()
    hoja_suelta(e, (33.0, 24.4), -40, 8.0, 2.4, P.podrido(VERDE_CITRICO, 0.9) if podrido else VERDE_CITRICO, 11, 'f')
    naranja_fruto(e, (32.0, 25.0), podrido, 10, 'f', 'item', s=2.15)
    return e.render()


def naranja_emblema():
    e = esc()
    naranja_fruto(e, (32.0, 29.0), False, 10, 'f', 'emb', s=1.1)
    return e.render()


# ===========================================================================
# 49. MANZANA
# ===========================================================================

ROJO_MANZANA = M(['#ffb6a6', '#e8443c', '#d2302c', '#b72826', '#962020', '#761a1a', '#581313'], '#3c0c0c')
VERDE_MANZANO = VERDE['tomate']


def manzana_fruto(e, top, podrido, z, grupo, rid, s=1.0):
    mat, ex = con_manchas(ROJO_MANZANA, podrido, 'man' + rid)
    c = (top[0], top[1] + 3.0 * s)

    def radio(th):
        arriba = np.clip(-np.sin(th), 0, 1)
        return 1.0 - 0.12 * np.exp(-((np.cos(th)) ** 2) / 0.02) * arriba + 0.04 * arriba
    e.pon(P.Bola(c, 3.4 * s, 3.1 * s, mat, z, grupo=grupo, radio=radio, extra=ex, especular=0.86))
    e.pon(P.Tallo(P.curva([(c[0], c[1] - 2.4 * s), (c[0] + 0.5 * s, c[1] - 3.6 * s)]), 1.0 + 0.2 * s, 1.0,
                  P.SECO_OSCURO if podrido else TALLO_FRUTO, z + 0.1, grupo=grupo))


def manzana_etapa(n):
    e = esc()
    r = rng('manzana', n)
    if n == 1:
        brote_frutal(e, VERDE_MANZANO)
        return e.render()
    arbolito(e, n, r, VERDE_MANZANO, 8.8, lambda e_, top, pod, z, g, rid: manzana_fruto(e_, top, pod, z, g, rid),
             flor_mat=FLOR_ROSA, n_frutos=5, ancho_rel=0.27, borde=P.dientes(4, 0.12))
    return e.render()


def manzana_item(podrido):
    e = esc()
    manzana_fruto(e, (32.0, 26.0), podrido, 10, 'f', 'item', s=2.15)
    hoja_suelta(e, (33.0, 21.4), -30, 7.0, 2.2, P.podrido(VERDE_MANZANO, 0.9) if podrido else VERDE_MANZANO, 11, 'f')
    return e.render()


def manzana_emblema():
    e = esc()
    manzana_fruto(e, (32.0, 29.0), False, 10, 'f', 'emb', s=1.1)
    return e.render()


# ===========================================================================
# 50. PERA
# ===========================================================================

PERA = M(['#f6fac0', '#d8e27a', '#c4d062', '#adb94f', '#929d40', '#767f33', '#5b6227'], '#363b16')


def pera_fruto(e, top, podrido, z, grupo, rid, s=1.0):
    mat, ex = con_manchas(PERA, podrido, 'per' + rid, mancha=MANCHA)
    c = (top[0], top[1] + 4.0 * s)

    def radio(th):
        arriba = np.clip(-np.sin(th), 0, 1)
        abajo = np.clip(np.sin(th), 0, 1)
        return 1.0 - 0.36 * arriba ** 1.4 + 0.04 * abajo
    e.pon(P.Bola(c, 3.0 * s, 4.0 * s, mat, z, grupo=grupo, radio=radio, extra=ex, especular=0.88))
    e.pon(P.Tallo(P.curva([(c[0], c[1] - 3.2 * s), (c[0] + 0.4 * s, c[1] - 4.4 * s), (c[0] + 1.0 * s, c[1] - 5.0 * s)]),
                  1.0 + 0.2 * s, 1.0, P.SECO_OSCURO if podrido else TALLO_FRUTO, z + 0.1, grupo=grupo))


def pera_etapa(n):
    e = esc()
    r = rng('pera', n)
    if n == 1:
        brote_frutal(e, VERDE['oscuro'])
        return e.render()
    arbolito(e, n, r, VERDE['oscuro'], 8.6, lambda e_, top, pod, z, g, rid: pera_fruto(e_, top, pod, z, g, rid),
             flor_mat=FLOR_BLANCA, n_frutos=4, ancho_rel=0.28, copa_h=0.14, caida=0.4)
    return e.render()


def pera_item(podrido):
    e = esc()
    pera_fruto(e, (32.0, 22.0), podrido, 10, 'f', 'item', s=1.95)
    return e.render()


def pera_emblema():
    e = esc()
    pera_fruto(e, (32.0, 27.5), False, 10, 'f', 'emb', s=0.82)
    return e.render()


# ===========================================================================
# 51. MELOCOTON
# ===========================================================================

MELOCOTON = M(['#ffe4b4', '#fbc078', '#f2a95e', '#e08e4a', '#c4743c', '#a05c2e', '#7c4524'], '#4e2a14')
RUBOR = M(['#ffb6a2', '#f2765c', '#e05e4a', '#c84c3e', '#a83e34', '#86322a'], '#4a1a14')
VERDE_MELOCOTONERO = Material(rampa_hsv(88, 104, .66, .74, .80, .30, 8), '#1d3a10')


def melocoton_fruto(e, top, podrido, z, grupo, rid, s=1.0):
    mat, ex = con_manchas(MELOCOTON, podrido, 'mel' + rid)
    rub = P.podrido(RUBOR, 0.62) if podrido else RUBOR

    def rubor(u, v, th, n, i, cols, Q):
        m = (u * 0.75 + v * 0.65) < (-0.05 + 0.12 * np.sin(u * 5.0))
        ii = np.clip(i, 0, rub.n() - 1)
        cols[m] = np.array(rub.rampa)[ii[m]]
        return cols
    c = (top[0], top[1] + 3.0 * s)
    e.pon(P.Bola(c, 3.3 * s, 3.2 * s, mat, z, grupo=grupo, especular=0.9,
                 extra=P.encadena(rubor, P.meridianos([22], mat, pasos=2, grosor=0.05, v_lim=(-0.9, 0.6)), ex)))


def melocoton_etapa(n):
    e = esc()
    r = rng('melocoton', n)
    if n == 1:
        brote_frutal(e, VERDE_MELOCOTONERO)
        return e.render()
    arbolito(e, n, r, VERDE_MELOCOTONERO, 9.6, lambda e_, top, pod, z, g, rid: melocoton_fruto(e_, top, pod, z, g, rid),
             flor_mat=FLOR_ROSA, n_frutos=5, ancho_rel=0.18, fm='lanceolada', copa_h=0.1)
    return e.render()


def melocoton_item(podrido):
    e = esc()
    hoja_suelta(e, (33.0, 24.0), -36, 9.0, 1.8, P.podrido(VERDE_MELOCOTONERO, 0.9) if podrido else VERDE_MELOCOTONERO, 11, 'f')
    melocoton_fruto(e, (32.0, 25.0), podrido, 10, 'f', 'item', s=2.15)
    return e.render()


def melocoton_emblema():
    e = esc()
    melocoton_fruto(e, (32.0, 29.0), False, 10, 'f', 'emb', s=1.1)
    return e.render()


# ===========================================================================
# 52. CIRUELA
# ===========================================================================

CIRUELA = M(['#dcbcee', '#8a50b2', '#743f9a', '#5f3381', '#4b2867', '#3a1e51', '#2a153a'], '#1a0d24')


def ciruela_fruto(e, top, podrido, z, grupo, rid, s=1.0):
    mat, ex = con_manchas(CIRUELA, podrido, 'cir' + rid)
    c = (top[0], top[1] + 3.2 * s)
    e.pon(P.Bola(c, 2.8 * s, 3.3 * s, mat, z, grupo=grupo, especular=0.9, brillo_extra=0.04,
                 extra=P.encadena(P.meridianos([16], mat, pasos=2, grosor=0.05, v_lim=(-0.9, 0.7)), ex)))


def ciruela_etapa(n):
    e = esc()
    r = rng('ciruela', n)
    if n == 1:
        brote_frutal(e, VERDE['tomate'])
        return e.render()
    arbolito(e, n, r, VERDE['tomate'], 8.4, lambda e_, top, pod, z, g, rid: ciruela_fruto(e_, top, pod, z, g, rid),
             flor_mat=FLOR_BLANCA, n_frutos=6, ancho_rel=0.25, borde=P.dientes(4, 0.12), caida=0.6)
    return e.render()


def ciruela_item(podrido):
    e = esc()
    e.pon(P.Tallo(P.curva([(32.0, 23.4), (32.6, 21.0), (33.6, 19.8)]), 1.4, 1.2,
                  P.SECO_OSCURO if podrido else TALLO_FRUTO, 11, grupo='f'))
    ciruela_fruto(e, (32.0, 23.0), podrido, 10, 'f', 'item', s=2.1)
    return e.render()


def ciruela_emblema():
    e = esc()
    ciruela_fruto(e, (32.0, 28.0), False, 10, 'f', 'emb', s=1.05)
    return e.render()


# ===========================================================================
# 53. MANGO
# ===========================================================================

MANGO_ROJO = M(['#ffb894', '#f0644c', '#dc503e', '#c04036', '#9e342e', '#7c2a26'], '#4a1612')
MANGO_AMARILLO = M(['#fff4ac', '#f8d462', '#eec04a', '#daa83c', '#bc8c32', '#98702a'], '#5a420e')
VERDE_MANGO = Material(rampa_hsv(94, 112, .70, .78, .68, .22, 8), '#112a0e')


def mango_fruto(e, top, podrido, z, grupo, rid, s=1.0):
    """Mango: alargado y algo arrinonado, rojo arriba y amarillo abajo."""
    mat = P.podrido(MANGO_ROJO, 0.6) if podrido else MANGO_ROJO
    bajo = P.podrido(MANGO_AMARILLO, 0.6) if podrido else MANGO_AMARILLO
    ex = P.encadena(P.dos_tonos_bola(bajo, corte=-0.05, onda=0.1),
                    P.manchas_bola([(-0.3, 0.3, .4, .3), (0.4, -0.1, .3, .3)], MANCHA_OSCURA, 'man' + rid) if podrido else None)
    c = (top[0] + 0.4 * s, top[1] + 4.0 * s)
    e.pon(P.Bola(c, 2.9 * s, 4.0 * s, mat, z, grupo=grupo, giro=-14, extra=ex, especular=0.88,
                 radio=lambda th: 1.0 - 0.08 * np.clip(np.cos(th), 0, 1) ** 2))


def mango_etapa(n):
    e = esc()
    r = rng('mango', n)
    if n == 1:
        brote_frutal(e, VERDE_MANGO)
        return e.render()
    arbolito(e, n, r, VERDE_MANGO, 10.6, lambda e_, top, pod, z, g, rid: mango_fruto(e_, top, pod, z, g, rid),
             flor_mat=FLOR_AMARILLA, n_frutos=4, ancho_rel=0.17, fm='lanceolada', copa_h=0.1, caida=2.4)
    return e.render()


def mango_item(podrido):
    e = esc()
    e.pon(P.Tallo(P.curva([(31.0, 22.4), (30.4, 20.0), (29.4, 18.6)]), 1.4, 1.2,
                  P.SECO_OSCURO if podrido else TALLO_FRUTO, 11, grupo='f'))
    mango_fruto(e, (31.0, 22.0), podrido, 10, 'f', 'item', s=1.85)
    return e.render()


def mango_emblema():
    e = esc()
    mango_fruto(e, (32.0, 27.0), False, 10, 'f', 'emb', s=0.92)
    return e.render()


# ===========================================================================
# 54. AGUACATE
# ===========================================================================

AGUACATE = M(['#b2c884', '#527c30', '#446a28', '#385820', '#2c481a', '#223a14', '#182a0e'], '#0e1a08')


def aguacate_fruto(e, top, podrido, z, grupo, rid, s=1.0):
    mat, ex = con_manchas(AGUACATE, podrido, 'agu' + rid)
    c = (top[0], top[1] + 4.0 * s)

    def radio(th):
        arriba = np.clip(-np.sin(th), 0, 1)
        return 1.0 - 0.26 * arriba ** 1.6
    e.pon(P.Bola(c, 3.1 * s, 4.0 * s, mat, z, grupo=grupo, radio=radio, extra=ex, especular=0.9))


def aguacate_etapa(n):
    e = esc()
    r = rng('aguacate', n)
    if n == 1:
        brote_frutal(e, VERDE['oscuro'])
        return e.render()
    arbolito(e, n, r, VERDE['oscuro'], 10.0, lambda e_, top, pod, z, g, rid: aguacate_fruto(e_, top, pod, z, g, rid),
             flor_mat=FLOR_AMARILLA, n_frutos=4, ancho_rel=0.25, fm='eliptica', copa_h=0.12, caida=1.2)
    return e.render()


def aguacate_item(podrido):
    e = esc()
    e.pon(P.Tallo(P.curva([(32.0, 22.6), (32.6, 20.4)]), 1.6, 1.3, P.SECO_OSCURO if podrido else TALLO_FRUTO, 11, grupo='f'))
    aguacate_fruto(e, (32.0, 22.0), podrido, 10, 'f', 'item', s=1.95)
    return e.render()


def aguacate_emblema():
    e = esc()
    aguacate_fruto(e, (32.0, 27.0), False, 10, 'f', 'emb', s=0.95)
    return e.render()


# ===========================================================================
# 55. PAPAYA
# ===========================================================================

PAPAYA_NARANJA = M(['#ffdca6', '#f8b04c', '#efa036', '#dc8a2a', '#c07222', '#9c5c1c'], '#5a3410')
PAPAYA_VERDE = M(['#d8eca4', '#9cc262', '#86ae4e', '#709840', '#5a7e34', '#46642a'], '#26380f')
TRONCO_PAPAYA = M(['#d2cfae', '#b2ad88', '#98926e', '#7e785a', '#666048', '#4e4a38'], '#2c2a1e')


def papaya_fruto(e, c, podrido, z, grupo, rid, s=1.0, madura=True):
    mat = P.podrido(PAPAYA_NARANJA, 0.6) if podrido else (PAPAYA_NARANJA if madura else PAPAYA_VERDE)
    arriba = P.podrido(PAPAYA_VERDE, 0.6) if podrido else PAPAYA_VERDE
    ex = P.encadena(
        (lambda u, v, th, n, i, cols, Q: _verde_arriba(u, v, i, cols, arriba)) if madura else None,
        P.manchas_bola([(-0.3, 0.3, .4, .3), (0.4, -0.1, .3, .3)], MANCHA_OSCURA, 'pap' + rid) if podrido else None)
    e.pon(P.Bola(c, 2.8 * s, 4.2 * s, mat, z, grupo=grupo, extra=ex, especular=0.9,
                 radio=lambda th: 1.0 - 0.12 * np.clip(-np.sin(th), 0, 1) ** 2))


def _verde_arriba(u, v, i, cols, arriba):
    m = v < (-0.45 + 0.08 * np.sin(u * 6.0))
    ii = np.clip(i, 0, arriba.n() - 1)
    cols[m] = np.array(arriba.rampa)[ii[m]]
    return cols


def papaya_etapa(n):
    """La papaya: un tronco recto, la corona de hojas palmeadas arriba y las papayas pegadas al tronco."""
    e = esc()
    cx, cy = PIE
    r = rng('papaya', n)
    V = VERDE['tomate']
    if n == 1:
        brote_frutal(e, V)
        return e.render()
    seco = n == 5
    mat = SECO if seco else V
    alto = 22.0 if n != 3 else 16.0
    e.pon(P.Eje(P.arco((cx, cy + 1.0), -90, alto, 0), P.suave([0, 1], [2.6, 1.8]),
                P.podrido(TRONCO_PAPAYA, 0.5) if seco else TRONCO_PAPAYA, 0, modelo='tubo', grupo='tronco'))
    top = (0.0, alto * 0.97, 0.0)
    hojas = [(176, 40, -24, 15), (214, 52, -10, 16), (250, 62, 6, 16), (290, 62, 6, 16), (326, 52, -10, 16),
             (2, 40, -24, 15), (120, 46, -16, 12), (60, 46, -16, 12)]
    if n == 3:
        hojas = hojas[:6]
    for i, (az, e0, e1, L) in enumerate(hojas):
        L = jit(r, L * (0.8 if n == 3 else 1.0), 0.06)
        if seco:
            e0, e1, L = secar(e0, e1, L)
        P3 = P.espina3d(az, e0, e1, L * 0.55, origen=top)
        S = P.proyecta(PIE, P3)
        z = float(P3[:, 2].mean())
        e.pon(P.Tallo(S, 1.0, 1.0, P.SECO_OSCURO if seco else TALLO_GUIA, z + 0.01, grupo='h%d' % i))
        T = P.tangentes(S)
        a0 = P.ang_de(T[-1])
        for k, da in enumerate((-50, -16, 16, 50)):
            Sd = P.arco(tuple(S[-1]), a0 + da, L * (0.42 if abs(da) > 30 else 0.5), da * 0.3)
            h = P.Eje(Sd, P.forma('ovada', 0.12 * L), mat, z, grupo='h%d' % i, nervio=1,
                      borde=P.ondas(2, 0.2))
            h.brillo0 += (0.05 if (i + k) % 2 else -0.03)
            e.pon(h)
    if n in (4, 5):
        tt = P.proyecta(PIE, [top])[0]
        for k, (dx, dy, ma) in enumerate(((-3.0, 6.0, True), (3.0, 6.5, True), (0.0, 9.5, False))):
            papaya_fruto(e, (tt[0] + dx, tt[1] + dy), seco, 300 + k * 0.1 + (0.3 if dy > 8 else 0), 'fr%d' % k,
                         str(k), s=0.95, madura=ma)
    return e.render()


def papaya_item(podrido):
    e = esc()
    papaya_fruto(e, (32.0, 32.0), podrido, 10, 'f', 'item', s=2.3)
    return e.render()


def papaya_emblema():
    e = esc()
    papaya_fruto(e, (32.0, 32.0), False, 10, 'f', 'emb', s=1.0)
    return e.render()


# ===========================================================================
# 56. CARAMBOLA
# ===========================================================================

CARAMBOLA = M(['#fcfcc4', '#ecec6c', '#dcd850', '#c6c040', '#a8a234', '#86822a', '#64601e'], '#3c3a10')


def carambola_fruto(e, top, podrido, z, grupo, rid, s=1.0):
    """Carambola colgando, vista de lado: alargada con sus costillas."""
    mat, ex = con_manchas(CARAMBOLA, podrido, 'car' + rid, mancha=MANCHA)
    c = (top[0], top[1] + 4.0 * s)
    e.pon(P.Bola(c, 2.6 * s, 4.0 * s, mat, z, grupo=grupo, especular=0.88,
                 radio=lambda th: 1.0 + 0.12 * np.abs(np.sin(th)) ** 8,
                 extra=P.encadena(P.meridianos([-34, 34], mat, pasos=2, grosor=0.05, v_lim=(-0.9, 0.9)), ex)))


def carambola_estrella(e, c, s, podrido, z, grupo):
    """La carambola vista de punta: una estrella de cinco puntas redondeadas."""
    mat, ex = con_manchas(CARAMBOLA, podrido, 'care', mancha=MANCHA)

    def radio(th):
        return 1.0 + 0.30 * np.cos(5 * th + math.pi / 2)

    def interior(u, v, th, n, i, cols, Q):
        rr = np.sqrt(u * u + v * v)
        lim = 0.55 * (1.0 + 0.30 * np.cos(5 * th + math.pi / 2))
        m = np.abs(rr - lim) < 0.07
        ii = np.clip(i + 2, 0, mat.n() - 1)
        cols[m] = np.array(mat.rampa)[ii[m]]
        return cols
    e.pon(P.Bola(c, 6.4 * s, 6.2 * s, mat, z, grupo=grupo, radio=radio, especular=0.88, plano=0.25,
                 extra=P.encadena(interior, ex)))


def carambola_etapa(n):
    e = esc()
    r = rng('carambola', n)
    if n == 1:
        brote_frutal(e, VERDE['tomate'])
        return e.render()
    arbolito(e, n, r, VERDE['tomate'], 8.0, lambda e_, top, pod, z, g, rid: carambola_fruto(e_, top, pod, z, g, rid),
             flor_mat=FLOR_ROSA, n_frutos=5, ancho_rel=0.24, copa_h=0.12, caida=0.5)
    return e.render()


def carambola_item(podrido):
    e = esc()
    carambola_estrella(e, (32.0, 32.0), 1.05, podrido, 10, 'f')
    return e.render()


def carambola_emblema():
    e = esc()
    carambola_estrella(e, (32.0, 32.0), 0.52, False, 10, 'f')
    return e.render()


# ===========================================================================
# 57. HIGO
# ===========================================================================

HIGO = M(['#dab6d0', '#8a5272', '#74425e', '#60364e', '#4c2a3e', '#3a2030', '#2a1622'], '#180c14')


def higo_fruto(e, top, podrido, z, grupo, rid, s=1.0):
    """Higo: gota con el cuello estrecho arriba y el culo redondo."""
    mat = P.podrido(HIGO, 0.6) if podrido else HIGO
    S = P.arco(top, 90, 6.4 * s, 0)
    w = P.suave([0, .22, .55, .82, .95, 1], [0.7 * s, 1.5 * s, 2.7 * s, 2.8 * s, 2.0 * s, 0.6 * s])
    ex = P.manchas_eje([(0.6, -0.3, .2, .7)], MANCHA_OSCURA, 'hig' + rid) if podrido else None
    e.pon(P.Eje(S, w, mat, z, modelo='tubo', grupo=grupo, punta_clara=0.0, extra=ex))


def higo_etapa(n):
    e = esc()
    r = rng('higo', n)
    V = VERDE['oliva']
    if n == 1:
        brote_frutal(e, V)
        return e.render()
    arbolito(e, n, r, V, 11.0, lambda e_, top, pod, z, g, rid: higo_fruto(e_, top, pod, z, g, rid),
             flor_mat=None, n_frutos=5, ancho_rel=0.34, fm='corazon', borde=P.ondas(2, 0.38, irregular=0.2),
             copa_h=0.12, nh=24, caida=0.3)
    return e.render()


def higo_item(podrido):
    e = esc()
    higo_fruto(e, (32.0, 22.0), podrido, 10, 'f', 'item', s=2.2)
    return e.render()


def higo_emblema():
    e = esc()
    higo_fruto(e, (32.0, 27.0), False, 10, 'f', 'emb', s=1.1)
    return e.render()


# ===========================================================================
# 58. CAQUI
# ===========================================================================

CAQUI = M(['#ffd2a0', '#f8983c', '#ee8028', '#da6c20', '#bd5818', '#994614', '#753510'], '#4a2008')


def caqui_fruto(e, top, podrido, z, grupo, rid, s=1.0):
    mat, ex = con_manchas(CAQUI, podrido, 'caq' + rid)
    c = (top[0], top[1] + 2.8 * s)
    e.pon(P.Bola(c, 3.5 * s, 2.9 * s, mat, z, grupo=grupo, extra=ex, especular=0.86,
                 radio=lambda th: 1.0 + 0.04 * np.cos(4 * th)))
    caliz_estrella(e, (c[0], c[1] - 2.5 * s), 1.05 * s, z + 0.1, grupo, puntas=4,
                   mat=(P.SECO_OSCURO if podrido else CALIZ))


def caqui_etapa(n):
    e = esc()
    r = rng('caqui', n)
    if n == 1:
        brote_frutal(e, VERDE['oscuro'])
        return e.render()
    arbolito(e, n, r, VERDE['oscuro'], 9.4, lambda e_, top, pod, z, g, rid: caqui_fruto(e_, top, pod, z, g, rid),
             flor_mat=FLOR_AMARILLA, n_frutos=5, ancho_rel=0.30, copa_h=0.14)
    return e.render()


def caqui_item(podrido):
    e = esc()
    caqui_fruto(e, (32.0, 26.0), podrido, 10, 'f', 'item', s=2.15)
    return e.render()


def caqui_emblema():
    e = esc()
    caqui_fruto(e, (32.0, 29.0), False, 10, 'f', 'emb', s=1.1)
    return e.render()


# ===========================================================================
# 59. DAIKON
# ===========================================================================

BLANCO_DAIKON = M(['#ffffff', '#f6f8f0', '#e6ecdc', '#d0d8c2', '#b2bca2', '#929c84', '#727b66'], '#3c4234')
VERDE_HOMBRO = Material(rampa_hsv(80, 96, .30, .48, .92, .48, 7), '#2c4420')


def daikon_raiz(e, top, largo, grueso, ang, curva, podrido, z, rid='d', recorte=None):
    """El daikon: un cilindro blanco largo con el hombro verde que asoma de la tierra."""
    mb = P.podrido(BLANCO_DAIKON, 0.6) if podrido else BLANCO_DAIKON
    mv = P.podrido(VERDE_HOMBRO, 0.6) if podrido else VERDE_HOMBRO
    S = P.arco(top, ang, largo, curva)
    w = P.suave([0, .06, .3, .8, .95, 1], [grueso * .8, grueso, grueso, grueso * .8, grueso * .45, 0.2])

    def hombro(t, s, d, Q, idx, cols):
        m = t < 0.24
        ii = np.clip(idx, 0, mv.n() - 1)
        cols[m] = np.array(mv.rampa)[ii[m]]
        return cols
    ex = P.encadena_eje(hombro, P.manchas_eje([(0.45, -0.3, .18, .7), (0.7, 0.3, .14, .6)], MANCHA, 'dai' + rid) if podrido else None)
    p = P.Eje(S, w, mb, z, modelo='tubo', grupo='raiz', punta_clara=0.0, extra=ex)
    p.recorte = recorte
    e.pon(p)


def daikon_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('daikon', n)
    V = VERDE['tomate']
    if n == 1:
        brote_cotiledones(e, PIE, V, largo=7.4, ancho=3.4, abre=68, curva=14)
        return e.render()
    seco = n == 5
    mat = SECO if seco else V
    if n == 3:
        hojas = [(188, 52, 10, 16), (230, 62, 24, 17), (270, 70, 36, 18), (310, 62, 24, 17), (352, 52, 10, 16)]
    else:
        hojas = [(182, 48, 4, 23), (210, 58, 16, 24), (240, 66, 28, 25), (270, 72, 40, 23), (300, 66, 28, 25),
                 (330, 58, 16, 24), (358, 48, 4, 23)]
    alto = 7.0 if n in (4, 5) else 0.0
    roseta(e, (cx, cy - 2.0 - alto), hojas, hoja_lirada, mat, seco, r, ancho=1.05)
    if n in (4, 5):
        # el daikon crece medio fuera de la tierra
        daikon_raiz(e, (cx, cy - 3.0 - alto), alto + 6.0, 3.6, 90, 0, seco, 100,
                    recorte=lambda X, Y: Y < cy + 2.0)
    return e.render()


def daikon_item(podrido):
    e = esc()
    top = (31.0, 23.5)
    mat_h = P.podrido(VERDE['tomate'], 0.9) if podrido else VERDE['tomate']
    hojitas_item(e, (top[0], top[1] + 0.8), mat_h, podrido, ((-116, 5.4), (-90, 6.0), (-64, 5.4)), ancho=1.9,
                 abre_podrido=16)
    daikon_raiz(e, top, 15.5, 3.1, 84, 6, podrido, 10, rid='item')
    return e.render()


def daikon_emblema():
    e = esc()
    daikon_raiz(e, (30.5, 29.0), 7.0, 1.6, 58, 4, False, 10, rid='emb')
    return e.render()


# ===========================================================================
# 60. CURCUMA
# ===========================================================================

CURCUMA = M(['#f6d7a0', '#d9a870', '#c48e58', '#a87446', '#8a5c38', '#6c472c', '#523520'], '#331f12')
NARANJA_CURCUMA = M(['#ffe08a', '#ffb42a', '#f49a14', '#dc8010', '#bc680e', '#9a540c'], '#5a2c06')
VERDE_CURCUMA = Material(rampa_hsv(88, 106, .62, .72, .82, .30, 8), '#1c3a10')


def curcuma_rizoma(e, c, s, podrido, z, recorte=None, corte=True):
    """Rizoma de curcuma: cuerpo y dedos pardos; un dedo cortado deja ver el naranja intenso."""
    mat = P.podrido(CURCUMA, 0.6) if podrido else CURCUMA
    piezas = [((0, 0), 5.0, 3.0, -6), ((-5.0, -1.2), 3.6, 1.9, -28), ((4.6, -1.8), 3.8, 1.9, 30),
              ((5.6, 1.8), 3.2, 1.7, 16)]
    for k, ((dx, dy), rx, ry, g) in enumerate(piezas):
        ex = P.manchas_bola([(-0.2, 0.2, .5, .45)], MANCHA_OSCURA, 'cur%d' % k) if (podrido and k in (0, 2)) else None
        b = P.Bola((c[0] + dx * s, c[1] + dy * s), rx * s, ry * s, mat, z + (0.1 if k == 0 else 0), giro=g,
                   grupo='rizoma', extra=ex)
        b.recorte = recorte
        e.pon(b)
    if corte:
        a = math.radians(-28)
        pc = (c[0] + (-5.0 - math.cos(a) * 3.4) * s, c[1] + (-1.2 - math.sin(a) * 3.4) * s)
        b = P.Bola(pc, 1.3 * s, 1.6 * s, P.podrido(NARANJA_CURCUMA, 0.5) if podrido else NARANJA_CURCUMA,
                   z + 0.2, grupo='rizoma', giro=-28, plano=0.6)
        b.recorte = recorte
        e.pon(b)


def curcuma_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('curcuma', n)
    if n == 1:
        brote_hebras(e, PIE, VERDE_CURCUMA, [(-100, 8.0, -10), (-78, 9.0, 8)], grosor=2.6, modelo='hoja')
        return e.render()
    seco = n == 5
    mat = SECO if seco else VERDE_CURCUMA
    if n == 3:
        hojas = [(200, 76, 34, 17), (250, 84, 52, 19), (300, 84, 50, 19), (346, 76, 32, 17)]
    else:
        hojas = [(188, 70, 20, 22), (222, 78, 38, 24), (258, 84, 54, 25), (294, 84, 52, 25), (330, 78, 36, 24),
                 (2, 70, 18, 22)]
    for i, (az, e0, e1, L) in enumerate(hojas):
        az += r.uniform(-4, 4)
        L = jit(r, L, 0.05)
        if seco:
            e0, e1, L = secar(e0, e1, L)
        e.pon(*P.hoja3d(PIE, az, e0, e1, L, 0.2 * L, 'eliptica', mat, 'h%d' % i, peciolo=0.34,
                        grosor_peciolo=1.6, nervio=1, nervios=(2.8, 55, 1), brillo=(0.05 if i % 2 else -0.03)))
    if n in (4, 5):
        curcuma_rizoma(e, (cx, cy + 2.5), 0.82, seco, 130, recorte=suelo_rim(cx, cy + 3.6, 8.6, 1.6), corte=False)
    return e.render()


def curcuma_item(podrido):
    e = esc()
    curcuma_rizoma(e, (32.0, 33.0), 0.95, podrido, 10)
    return e.render()


def curcuma_emblema():
    e = esc()
    curcuma_rizoma(e, (32.0, 33.0), 0.46, False, 10, corte=False)
    return e.render()


# ===========================================================================
# CATALOGO
# ===========================================================================

CULTIVOS = [
    # id, nombre, genero (o/a), etapa(n), item(podrido), emblema()
    ('rabano', 'Rabano', 'o', rabano_etapa, rabano_item, rabano_emblema),
    ('remolacha', 'Remolacha', 'a', remolacha_etapa, remolacha_item, remolacha_emblema),
    ('nabo', 'Nabo', 'o', nabo_etapa, nabo_item, nabo_emblema),
    ('cebolla', 'Cebolla', 'a', cebolla_etapa, cebolla_item, cebolla_emblema),
    ('ajo', 'Ajo', 'o', ajo_etapa, ajo_item, ajo_emblema),
    ('puerro', 'Puerro', 'o', puerro_etapa, puerro_item, puerro_emblema),
    ('patata', 'Patata', 'a', patata_etapa, patata_item, patata_emblema),
    ('boniato', 'Boniato', 'o', boniato_etapa, boniato_item, boniato_emblema),
    ('jengibre', 'Jengibre', 'o', jengibre_etapa, jengibre_item, jengibre_emblema),
    ('albahaca', 'Albahaca', 'a', albahaca_etapa, albahaca_item, albahaca_emblema),
    ('lechuga', 'Lechuga', 'a', lechuga_etapa, lechuga_item, lechuga_emblema),
    ('repollo', 'Repollo', 'o', repollo_etapa, repollo_item, repollo_emblema),
    ('espinaca', 'Espinaca', 'a', espinaca_etapa, espinaca_item, espinaca_emblema),
    ('acelga', 'Acelga', 'a', acelga_etapa, acelga_item, acelga_emblema),
    ('apio', 'Apio', 'o', apio_etapa, apio_item, apio_emblema),
    ('col_rizada', 'Col rizada', 'a', col_rizada_etapa, col_rizada_item, col_rizada_emblema),
    ('col_china', 'Col china', 'a', col_china_etapa, col_china_item, col_china_emblema),
    ('hinojo', 'Hinojo', 'o', hinojo_etapa, hinojo_item, hinojo_emblema),
    ('colinabo', 'Colinabo', 'o', colinabo_etapa, colinabo_item, colinabo_emblema),
    ('ruibarbo', 'Ruibarbo', 'o', ruibarbo_etapa, ruibarbo_item, ruibarbo_emblema),
    ('pimiento', 'Pimiento', 'o', pimiento_etapa, pimiento_item, pimiento_emblema),
    ('berenjena', 'Berenjena', 'a', berenjena_etapa, berenjena_item, berenjena_emblema),
    ('pepino', 'Pepino', 'o', pepino_etapa, pepino_item, pepino_emblema),
    ('calabacin', 'Calabacin', 'o', calabacin_etapa, calabacin_item, calabacin_emblema),
    ('sandia', 'Sandia', 'a', sandia_etapa, sandia_item, sandia_emblema),
    ('melon', 'Melon', 'o', melon_etapa, melon_item, melon_emblema),
    ('chile', 'Chile', 'o', chile_etapa, chile_item, chile_emblema),
    ('judia', 'Judia', 'a', judia_etapa, judia_item, judia_emblema),
    ('guisante', 'Guisante', 'o', guisante_etapa, guisante_item, guisante_emblema),
    ('esparrago', 'Esparrago', 'o', esparrago_etapa, esparrago_item, esparrago_emblema),
    ('menta', 'Menta', 'a', menta_etapa, menta_item, menta_emblema),
    ('perejil', 'Perejil', 'o', perejil_etapa, perejil_item, perejil_emblema),
    ('romero', 'Romero', 'o', romero_etapa, romero_item, romero_emblema),
    ('rucula', 'Rucula', 'a', rucula_etapa, rucula_item, rucula_emblema),
    ('chirivia', 'Chirivia', 'a', chirivia_etapa, chirivia_item, chirivia_emblema),
    ('calabaza_moscada', 'Calabaza moscada', 'a', moscada_etapa, moscada_item, moscada_emblema),
    ('chayote', 'Chayote', 'o', chayote_etapa, chayote_item, chayote_emblema),
    ('cacahuete', 'Cacahuete', 'o', cacahuete_etapa, cacahuete_item, cacahuete_emblema),
    ('yuca', 'Yuca', 'a', yuca_etapa, yuca_item, yuca_emblema),
    ('taro', 'Taro', 'o', taro_etapa, taro_item, taro_emblema),
    ('cana_azucar', 'Cana de azucar', 'a', cana_etapa, cana_item, cana_emblema),
    ('achicoria', 'Achicoria', 'a', achicoria_etapa, achicoria_item, achicoria_emblema),
    ('calabaza_bonetera', 'Calabaza bonetera', 'a', patisson_etapa, patisson_item, patisson_emblema),
    ('uchuva', 'Uchuva', 'a', uchuva_etapa, uchuva_item, uchuva_emblema),
    ('haba', 'Haba', 'a', haba_etapa, haba_item, haba_emblema),
    ('platano', 'Platano', 'o', platano_etapa, platano_item, platano_emblema),
    ('limon', 'Limon', 'o', limon_etapa, limon_item, limon_emblema),
    ('naranja', 'Naranja', 'a', naranja_etapa, naranja_item, naranja_emblema),
    ('manzana', 'Manzana', 'a', manzana_etapa, manzana_item, manzana_emblema),
    ('pera', 'Pera', 'a', pera_etapa, pera_item, pera_emblema),
    ('melocoton', 'Melocoton', 'o', melocoton_etapa, melocoton_item, melocoton_emblema),
    ('ciruela', 'Ciruela', 'a', ciruela_etapa, ciruela_item, ciruela_emblema),
    ('mango', 'Mango', 'o', mango_etapa, mango_item, mango_emblema),
    ('aguacate', 'Aguacate', 'o', aguacate_etapa, aguacate_item, aguacate_emblema),
    ('papaya', 'Papaya', 'a', papaya_etapa, papaya_item, papaya_emblema),
    ('carambola', 'Carambola', 'a', carambola_etapa, carambola_item, carambola_emblema),
    ('higo', 'Higo', 'o', higo_etapa, higo_item, higo_emblema),
    ('caqui', 'Caqui', 'o', caqui_etapa, caqui_item, caqui_emblema),
    ('daikon', 'Daikon', 'o', daikon_etapa, daikon_item, daikon_emblema),
    ('curcuma', 'Curcuma', 'a', curcuma_etapa, curcuma_item, curcuma_emblema),
]


# ===========================================================================
# MONTAJE Y COMPROBACION
# ===========================================================================

def _carga(nombre):
    return np.array(Image.open(os.path.join(OBJ, nombre)).convert('RGBA'))


def _centrado(rgba, sil=None):
    """Margenes (izq, der, arriba, abajo) de lo opaco."""
    a = rgba[..., 3] > 0 if sil is None else sil
    ys, xs = np.nonzero(a)
    H, W = a.shape
    return xs.min(), W - 1 - xs.max(), ys.min(), H - 1 - ys.max()


def generar(cultivo, destino, saco):
    cid, nombre, genero, etapa, item, emblema = cultivo
    carpeta = os.path.join(destino, 'planta_%s' % cid)
    seca = _carga('tierra_seca.png')
    moja = _carga('tierra_mojada.png')
    salida = {}
    errores = []
    brote = etapa(1)
    sprites = {1: brote, 2: brote, 3: etapa(3), 4: etapa(4), 5: etapa(5)}
    for n in (1, 2, 3, 4, 5):
        spr = sprites[n]
        if P.trozos(spr) != 1:
            errores.append('%s etapa %d: %d trozos' % (cid, n, P.trozos(spr)))
        try:
            img, (ox, oy, w, h) = P.sobre_parcela(spr, seca if n == 1 else moja, seca=(n == 1))
        except ValueError as ex:
            errores.append('%s etapa %d: %s' % (cid, n, ex))
            img, (ox, oy, w, h) = P.sobre_parcela(spr, seca if n == 1 else moja, seca=(n == 1), margen=-99)
        izq, der, arr, aba = ox, 51 - (ox + w), oy, 53 - (oy + h)
        if abs(izq - der) > 1 or abs(arr - aba) > 1:
            errores.append('%s etapa %d descentrada %s' % (cid, n, (izq, der, arr, aba)))
        salida['%d.png' % n] = img
    sufijo_b = 'bueno' if genero == 'o' else 'buena'
    sufijo_p = 'podrido' if genero == 'o' else 'podrida'
    for pod, suf in ((False, sufijo_b), (True, sufijo_p)):
        spr = item(pod)
        if P.trozos(spr) != 1:
            errores.append('%s item %s: %d trozos' % (cid, suf, P.trozos(spr)))
        salida['item_%s_%s.png' % (cid, suf)] = _cabe(spr, 19, 25, '%s item %s' % (cid, suf), errores)
    salida['planta_crecimiento_%s.png' % cid] = _cabe(brote, 18, 15, '%s brote' % cid, errores)
    emb = emblema()
    try:
        salida['item_saco.png'] = P.poner_emblema(saco, emb)
    except ValueError as ex:
        errores.append('%s saco: %s' % (cid, ex))
        salida['item_saco.png'] = saco.copy()
    if not errores:
        for nom, img in salida.items():
            P.guardar(img, os.path.join(carpeta, nom))
    return carpeta, salida, errores


def _cabe(spr, W, H, que, errores):
    """Centra en WxH; si no cabe lo apunta (y recorta para poder mirarlo)."""
    s = P.recortar(spr)
    h, w = s.shape[:2]
    if w > W or h > H:
        errores.append('%s: %dx%d no cabe en %dx%d' % (que, w, h, W, H))
        y0 = max(0, (h - H) // 2)
        x0 = max(0, (w - W) // 2)
        s = s[y0:y0 + H, x0:x0 + W]
    return P.en_lienzo(s, W, H)


ORDEN_HOJA = ['1.png', '2.png', '3.png', '4.png', '5.png']


def hoja_contacto(resultados, ruta, escala=5):
    filas = []
    fondo = np.array([111, 138, 90, 255], np.uint8)
    for cid, salida in resultados:
        celdas = [salida[k] for k in ORDEN_HOJA]
        items = [salida[k] for k in sorted(salida) if k not in ORDEN_HOJA]
        for it in items:
            c = np.zeros((53, 51, 4), np.uint8)
            c[...] = fondo
            h, w = it.shape[:2]
            oy, ox = (53 - h) // 2, (51 - w) // 2
            a = it[..., 3:4] / 255.0
            c[oy:oy + h, ox:ox + w, :3] = (it[..., :3] * a + c[oy:oy + h, ox:ox + w, :3] * (1 - a)).astype(np.uint8)
            celdas.append(c)
        fila = np.concatenate([np.pad(c, ((2, 2), (2, 2), (0, 0)), constant_values=0) for c in celdas], 1)
        filas.append(fila)
    W = max(f.shape[1] for f in filas)
    filas = [np.pad(f, ((0, 0), (0, W - f.shape[1]), (0, 0))) for f in filas]
    hoja = np.concatenate(filas, 0)
    hoja[hoja[..., 3] == 0] = fondo
    im = Image.fromarray(hoja).resize((hoja.shape[1] * escala, hoja.shape[0] * escala), Image.NEAREST)
    im.save(ruta)
    return ruta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--solo', default='')
    ap.add_argument('--salida', default=DESTINO)
    ap.add_argument('--hoja', default='')
    args = ap.parse_args()
    solo = [s for s in args.solo.split(',') if s]
    saco = P.saco_limpio(os.path.join(OBJ, 'Plantas'))
    resultados = []
    errores = []
    for c in CULTIVOS:
        if solo and c[0] not in solo:
            continue
        carpeta, salida, err = generar(c, args.salida, saco)
        resultados.append((c[0], salida))
        errores += err
        print('ok' if not err else 'MAL', c[0], '->', carpeta)
    if args.hoja and resultados:
        print('hoja', hoja_contacto(resultados, args.hoja))
    if errores:
        raise SystemExit('\n'.join(errores))


if __name__ == '__main__':
    main()
