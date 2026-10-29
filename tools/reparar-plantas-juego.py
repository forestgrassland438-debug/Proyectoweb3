#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
REPARAR PLANTAS DEL JUEGO — las 5 plantas de `Game/Objetos/Plantas`
=============================================================================

    planta_zanahorias  planta_tomates  planta_calabaza  planta_fresa  planta_trigo

El usuario (2026-10-29) pidio rehacer sus plantas viejas con el pincel de
`plantav2` (`gf_plantav2.py`). Estas SI las usa el juego —GameScene
(_precargarTexturasCultivo), tienda_sistema, el mercado, precios.js...—, asi
que cada archivo se reescribe con su MISMO nombre y sus MISMAS medidas:

    1.png ... 5.png      51x53  (seca + 4 mojadas, como siempre)
    zanahoria  item_saco 16x20 · item_zanahoria_buena/podrida 19x25 · planta_crecimiento_zanahoria 18x15
    tomate     semillas_tomate 16x20 · item_tomate_bueno/malo 16x17 · item_planta 18x14
    calabaza   item_semilla_calabaza 16x20 · item_calabaza_buena 23x23 / podrida 22x23 · item_planta_calabaza 13x9
    fresa      item_semilla_fresa 16x20 · item_fresa_buena/podrida 16x21 · item_planta 23x17
    trigo      item_semilla_trigo 16x20 · item_trigo_bueno 21x24 / podrido 21x18 · item_planta_trigo 13x10

RESPALDO: antes de escribir en el juego se comprueba que existe
`tools/respaldo-plantas-originales/` con las 45 imagenes originales (la fresa
no esta en git: esa copia es la unica). Nunca se sobrescribe el respaldo.

Sin semillas a la vista en la fresa ni agujero en la calabaza podrida
(tripofobia): la fresa se reconoce por su forma y su corona de sepalos.

USO
---------------------------------------------------------------------------
    python tools/reparar-plantas-juego.py --salida DIR   prueba fuera del juego
    python tools/reparar-plantas-juego.py               reescribe Game/Objetos/Plantas
    python tools/reparar-plantas-juego.py --solo fresa --hoja RUTA.png
"""

import argparse
import importlib.util
import math
import os
import shutil
import sys

import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

import gf_plantav2 as P  # noqa: E402
from gf_plantav2 import Material, rampa_hsv, VERDE, SECO  # noqa: E402

_spec = importlib.util.spec_from_file_location('gen_plantav2', os.path.join(AQUI, 'generar-plantav2.py'))
G = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(G)

RAIZ = os.path.dirname(AQUI)
DESTINO = os.path.join(RAIZ, 'Game', 'Objetos', 'Plantas')
RESPALDO = os.path.join(AQUI, 'respaldo-plantas-originales')
PIE = G.PIE
M = G.M
esc = G.esc
jit = G.jit


def rng(*k):
    return G.rng('juego', *k)


# ===========================================================================
# ZANAHORIA
# ===========================================================================

NARANJA_ZANAHORIA = M(['#ffc590', '#f88936', '#e57129', '#cf5e21', '#bd4d1e', '#a8431b', '#8a3e1b'], '#682e15')
V_ZAN = VERDE['zanahoria']

# hoja de zanahoria: muy picada, foliolos recortados a los dos lados
FOL_ZANAHORIA = [
    (0.20, +1, 64, 0.19, 0.080, 'ovada', 8, P.dientes(3, 0.45)),
    (0.28, -1, 62, 0.20, 0.085, 'ovada', 8, P.dientes(3, 0.45)),
    (0.40, +1, 56, 0.21, 0.090, 'ovada', 8, P.dientes(3, 0.45)),
    (0.50, -1, 54, 0.21, 0.090, 'ovada', 8, P.dientes(3, 0.45)),
    (0.61, +1, 48, 0.19, 0.085, 'ovada', 8, P.dientes(3, 0.45)),
    (0.70, -1, 44, 0.17, 0.080, 'ovada', 8, P.dientes(3, 0.45)),
    (0.74, 0, 0, 0.26, 0.095, 'ovada', 0, P.dientes(3, 0.45)),
]


def zanahoria_hoja(pie, az, e0, e1, L, mat, grupo, brillo=0.0):
    return G.hoja_comp3d(pie, (0, 0, 0), az, e0, e1, L, mat, grupo, FOL_ZANAHORIA, raquis=1.0, brillo=brillo)


def zanahoria_brote(e, pie, s=1.0):
    """Brote de zanahoria: dos cotiledones largos y finos y la primera hojita picada."""
    G.brote_cotiledones(e, pie, V_ZAN, largo=7.6 * s, ancho=1.25 * s, abre=58, curva=10, alto=2.6 * s,
                        forma_nombre='cinta')
    cx, cy = pie
    S = P.arco((cx, cy - 3.4 * s), -90, 6.0 * s, 0)
    fol = [(0.40, +1, 58, 2.0 * s, 0.9 * s, 'ovada', 0, P.dientes(2, 0.4)),
           (0.40, -1, 58, 2.0 * s, 0.9 * s, 'ovada', 0, P.dientes(2, 0.4)),
           (0.62, 0, 0, 2.6 * s, 1.1 * s, 'ovada', 0, P.dientes(2, 0.4))]
    e.pon(*P.hoja_compuesta(S, V_ZAN, 2, 'hoja1', fol, raquis=1.0, nervio=None))


def zanahoria_hombro(e, c, podrido, z, recorte):
    mat = P.podrido(NARANJA_ZANAHORIA, 0.6) if podrido else NARANJA_ZANAHORIA
    ex = P.manchas_bola([(-0.3, 0.25, .42, .34), (0.4, -0.15, .3, .28)], G.MANCHA_OSCURA, 'zh') if podrido else None
    b = P.Bola(c, 5.6, 5.0, mat, z, grupo='raiz', extra=ex)
    b.recorte = recorte
    e.pon(b)


def zanahoria_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('zanahoria', n)
    if n == 1:
        zanahoria_brote(e, PIE, s=1.3)
        return e.render()
    seco = n == 5
    mat = SECO if seco else V_ZAN
    if n == 3:
        hojas = [(188, 54, 12, 18), (222, 64, 28, 19.5), (258, 72, 42, 20.5), (294, 72, 40, 20),
                 (330, 64, 26, 19), (2, 54, 10, 18), (150, 58, 16, 14), (40, 58, 16, 14)]
    else:
        hojas = [(182, 48, 4, 25), (206, 56, 14, 26.5), (232, 64, 28, 27.5), (256, 72, 42, 28),
                 (282, 74, 46, 28), (308, 68, 34, 27.5), (334, 58, 18, 26.5), (358, 50, 6, 25),
                 (150, 58, 16, 19), (30, 58, 16, 19)]
    G.roseta(e, (cx, cy - 2.0), hojas, zanahoria_hoja, mat, seco, r)
    if n in (4, 5):
        zanahoria_hombro(e, (cx, cy + 1.0), seco, 100, G.suelo_rim(cx, cy + 2.4, 5.8, 1.6))
    return e.render()


def zanahoria_raiz(e, top, largo, grueso, ang, curva, podrido, z, grupo='raiz', rid='z'):
    """La zanahoria: cono largo con sus surcos cortos de lado a lado (rayas, no puntos)."""
    mat = P.podrido(NARANJA_ZANAHORIA, 0.55) if podrido else NARANJA_ZANAHORIA
    S = P.arco(top, ang, largo, curva)
    w = P.suave([0, .08, .35, .7, .92, 1], [grueso * .85, grueso, grueso * .86, grueso * .52, grueso * .22, 0.1])
    surcos = [(0.24, 1), (0.38, -1), (0.52, 1), (0.66, -1)]

    def ex_surcos(t, s, d, Q, idx, cols):
        m = np.zeros(len(t), bool)
        for (tp, lado) in surcos:
            m |= (np.abs(t - tp) < 0.022) & (s * lado > -0.1) & (np.abs(s) < 0.78)
        ii = np.clip(idx + 1, 0, mat.n() - 1)
        cols[m] = np.array(mat.rampa)[ii[m]]
        return cols
    ex = P.encadena_eje(ex_surcos, P.manchas_eje([(0.35, -0.3, .16, .7), (0.62, 0.35, .14, .6)], G.MANCHA, 'zr' + rid) if podrido else None)
    e.pon(P.Eje(S, w, mat, z, modelo='tubo', grupo=grupo, punta_clara=0.0, extra=ex))


def zanahoria_item(podrido):
    e = esc()
    top = (30.0, 22.0)
    mat_h = P.podrido(V_ZAN, 0.9) if podrido else V_ZAN
    for k, (a, L) in enumerate(((-118, 6.6), (-90, 7.2), (-62, 6.6))):
        if podrido:
            a = a + (-20 if a < -95 else 20 if a > -85 else 6)
        S = P.arco((top[0] + (k - 1) * 0.8, top[1] + 0.6), a, L, 10 if a > -90 else -10)
        fol = [(f[0], f[1], f[2], f[3] * L * 1.25, f[4] * L * 1.35, f[5], f[6], f[7]) for f in FOL_ZANAHORIA[1::2]]
        e.pon(*P.hoja_compuesta(S, mat_h, 1 + (0.2 if k == 1 else 0), 'hi%d' % k, fol, raquis=1.0, nervio=None))
    zanahoria_raiz(e, top, 15.0, 4.0, 78, 8, podrido, 10, rid='item')
    return e.render()


def zanahoria_emblema():
    e = esc()
    top = (30.5, 29.5)
    for k, a in enumerate((-112, -70)):
        S = P.arco((top[0], top[1] + 0.4), a, 2.4, 0)
        e.pon(P.Eje(S, P.forma('ovada', 1.0), V_ZAN, 1, grupo='h%d' % k, nervio=None))
    zanahoria_raiz(e, top, 6.4, 1.7, 58, 6, False, 10, rid='emb')
    return e.render()


def zanahoria_icono():
    e = esc()
    zanahoria_brote(e, (32.0, 40.0), s=1.1)
    return e.render()


# ===========================================================================
# TOMATE
# ===========================================================================

ROJO_TOMATE = M(['#ffc6b8', '#f2533f', '#e33224', '#cf2a1f', '#b3211a', '#971a16', '#701210'], '#580e0e')
NARANJA_TOMATE = M(['#ffd6a8', '#f8a04a', '#f08a36', '#de742c', '#c25f24', '#9e4c1e', '#7a3a18'], '#5a2a10')
V_TOM = VERDE['tomate']

FOL_TOMATE = [
    (0.34, +1, 62, 0.36, 0.17, 'ovada', 8, P.dientes(3, 0.24)),
    (0.40, -1, 60, 0.36, 0.17, 'ovada', 8, P.dientes(3, 0.24)),
    (0.66, 0, 0, 0.40, 0.19, 'ovada', 0, P.dientes(3, 0.24)),
]


def tomate_fruto(e, c, s, podrido, z, grupo, rid='t', mat=None):
    """Tomate: algo achatado, con brillo y el caliz verde en estrella encima."""
    m = mat or ROJO_TOMATE
    m = P.podrido(m, 0.65) if podrido else m
    ex = P.manchas_bola([(-0.3, 0.25, .42, .34), (0.42, -0.15, .3, .3)], G.MANCHA, 'tom' + rid) if podrido else None
    e.pon(P.Bola(c, 3.3 * s, 2.95 * s, m, z, grupo=grupo, radio=lambda th: 1.0 + 0.035 * np.cos(5 * th + 0.4),
                 especular=0.86, extra=ex))
    G.caliz_estrella(e, (c[0], c[1] - 2.6 * s), 0.85 * s, z + 0.1, grupo, puntas=5,
                     mat=(P.SECO_OSCURO if podrido else G.CALIZ))


def tomate_etapa(n):
    e = esc()
    r = rng('tomate', n)
    if n == 1:
        G.brote_cotiledones(e, PIE, V_TOM, largo=7.6, ancho=1.9, abre=62, curva=12, forma_nombre='lanceolada')
        return e.render()
    seco = n == 5
    mat = SECO if seco else V_TOM

    def hoja(origen, az, e0, e1, grupo, brillo):
        L = jit(r, (12.0 if n != 3 else 10.5) * (0.9 if seco else 1.0), 0.08)
        return G.hoja_comp3d(PIE, origen, az, e0, e1, L, mat, grupo, FOL_TOMATE, raquis=1.0, brillo=brillo)
    if n == 3:
        nud = G.mata(e, PIE, 10.0, 10.0, 7.5, 24, hoja, r)
        G.flores_en(e, nud, 3, G.FLOR_AMARILLA, 0.95)
    else:
        nud = G.mata(e, PIE, 12.5, 11.2, 9.0, 32, hoja, r, seco=seco)
        for k, q in enumerate(G.nudos_delante(nud, 5, ny0=-0.55, ny1=0.6)):
            matf = NARANJA_TOMATE if k == 3 else ROJO_TOMATE
            G.colgar(e, PIE, q, 2.4, lambda top, k=k, matf=matf: tomate_fruto(
                e, (top[0], top[1] + 2.6), 1.15, seco, 300 + k, 'fr%d' % k, rid=str(k), mat=matf),
                300 + k, 'fr%d' % k, sale=1.18, mat_r=(P.SECO_OSCURO if seco else None))
    return e.render()


def tomate_item(podrido):
    e = esc()
    tomate_fruto(e, (32.0, 33.0), 2.0, podrido, 10, 'f', rid='item')
    return e.render()


def tomate_emblema():
    e = esc()
    tomate_fruto(e, (32.0, 33.0), 0.95, False, 10, 'f', rid='emb')
    return e.render()


def tomate_icono():
    e = esc()
    G.brote_cotiledones(e, (32.0, 40.0), V_TOM, largo=7.0, ancho=1.8, abre=62, curva=12, alto=2.6,
                        forma_nombre='lanceolada')
    return e.render()


# ===========================================================================
# CALABAZA
# ===========================================================================

NARANJA_CALABAZA = M(['#ffd98a', '#f6a43a', '#ec8a24', '#dc731e', '#c25e1a', '#a14b17', '#7f3a13'], '#5e2610')
TALLO_CALABAZA = M(['#c9c28a', '#a59a62', '#87804e', '#6d6a40', '#575534', '#424128'], '#2a2a17')
V_CAL = VERDE['oliva']


def calabaza_fruto(e, c, rx, ry, podrido, z, grupo, rid='c', rabo=True):
    """Calabaza: achatada, con sus gajos marcados y el rabo grueso."""
    mat = P.podrido(NARANJA_CALABAZA, 0.6) if podrido else NARANJA_CALABAZA

    def radio(th):
        return (1.0 + 0.035 * np.cos(10 * th)) * (1.0 - 0.05 * np.clip(-np.sin(th), 0, 1) ** 2)
    ex = P.encadena(P.meridianos([-66, -34, 0, 34, 66], mat, pasos=2, grosor=0.045, v_lim=(-0.86, 0.9)),
                    P.manchas_bola([(0.30, 0.42, .44, .30), (-0.62, 0.05, .22, .34)], G.MANCHA, 'cal' + rid) if podrido else None)
    e.pon(P.Bola(c, rx, ry, mat, z, grupo=grupo, radio=radio, extra=ex))
    if rabo:
        g = max(1.6, rx * 0.26)
        e.pon(P.Tallo(P.curva([(c[0], c[1] - ry * 0.80), (c[0] + 0.6, c[1] - ry * 1.05), (c[0] + g * 1.1, c[1] - ry * 1.25)]),
                      g, g * 0.8, P.SECO_OSCURO if podrido else TALLO_CALABAZA, z + 0.1, grupo=grupo))


def calabaza_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('calabaza', n)
    if n == 1:
        G.brote_cotiledones(e, PIE, V_CAL, largo=7.4, ancho=3.4, abre=64, curva=10, forma_nombre='eliptica')
        return e.render()
    seco = n == 5
    mat = SECO if seco else V_CAL
    mt = P.SECO_OSCURO if seco else G.TALLO_GUIA
    def hoja(pie, az, e0, e1, L, mat_, grupo, brillo=0.0):
        return P.hoja3d(pie, az, e0, e1, L, 0.36 * L, 'corazon', mat_, grupo, peciolo=0.42,
                        grosor_peciolo=1.5, mat_peciolo=mt, nervio=2, borde=P.ondas(2, 0.26, irregular=0.2),
                        nervios=(3.4, 45, 1), copa=0.14, brillo=brillo)
    if n == 3:
        hojas = [(186, 50, 8, 19), (230, 64, 28, 20), (270, 70, 38, 21), (310, 64, 26, 20), (354, 50, 8, 19),
                 (140, 52, 10, 15), (40, 52, 10, 15)]
    else:
        hojas = [(182, 48, 4, 22), (222, 60, 22, 23), (262, 70, 36, 24), (302, 62, 24, 23), (342, 50, 6, 22),
                 (140, 50, 8, 17), (40, 50, 8, 17)]
    G.roseta(e, PIE, hojas, hoja, mat, seco, r)
    if n == 3:
        G.flor(e, (cx - 3.5, cy - 4.0), 1.6, G.FLOR_AMARILLA, 300, 'flor0')
        G.flor(e, (cx + 5.0, cy - 7.0), 1.3, G.FLOR_AMARILLA, 301, 'flor1')
    else:
        s = 0.94 if seco else 1.0
        calabaza_fruto(e, (cx + 0.5, cy + 2.5), 12.0 * s, 9.2 * s, seco, 400, 'f', rid='p')
    return e.render()


def calabaza_item(podrido):
    e = esc()
    calabaza_fruto(e, (32.0, 35.0), 10.0, 8.0, podrido, 10, 'f', rid='item')
    # una hojita en el rabo, como la del juego
    S = P.arco((33.2, 25.4), -30, 7.0, 20)
    e.pon(P.Eje(S, P.forma('corazon', 2.4), P.podrido(V_CAL, 0.9) if podrido else V_CAL, 11, grupo='f',
                nervio=None, borde=P.ondas(2, 0.25)))
    return e.render()


def calabaza_emblema():
    e = esc()
    calabaza_fruto(e, (32.0, 34.0), 4.4, 3.4, False, 10, 'f', rid='emb')
    return e.render()


def calabaza_icono():
    e = esc()
    G.brote_cotiledones(e, (32.0, 40.0), V_CAL, largo=4.6, ancho=2.0, abre=66, curva=8, alto=0.6,
                        forma_nombre='eliptica')
    return e.render()


# ===========================================================================
# FRESA
# ===========================================================================

ROJO_FRESA = M(['#ffb6ae', '#f2463f', '#dd2f33', '#c1242c', '#9e1d26', '#7c1720', '#5c1119'], '#3e0a10')
V_FRESA = Material(rampa_hsv(88, 104, .74, .80, .80, .30, 8), '#1c3a10')

# hoja trifoliada con dientes, sobre un rabo largo
FOL_FRESA = [
    (0.60, +1, 50, 0.36, 0.17, 'ovada', 0, P.dientes(4, 0.30)),
    (0.60, -1, 50, 0.36, 0.17, 'ovada', 0, P.dientes(4, 0.30)),
    (0.62, 0, 0, 0.40, 0.19, 'ovada', 0, P.dientes(4, 0.30)),
]


def fresa_fruto(e, c, s, podrido, z, grupo, rid='f', ang=0.0):
    """
    Fresa SIN pepitas (tripofobia): se reconoce por la forma de corazon con la
    punta abajo, el brillo y la corona de sepalos verdes.
    """
    mat = P.podrido(ROJO_FRESA, 0.65) if podrido else ROJO_FRESA
    # un cono de hombros redondos que acaba en punta: con una bola estirada
    # salia un tomate. El eje baja desde el caliz.
    S = P.arco((c[0], c[1] - 0.2 * s), 90 + ang, 6.8 * s, 0)
    w = P.suave([0, .10, .34, .62, .86, 1], [2.2 * s, 2.95 * s, 2.85 * s, 2.0 * s, 0.9 * s, 0.15])
    ex = P.manchas_eje([(0.45, -0.3, .22, .7), (0.72, 0.35, .16, .6)], G.MANCHA_OSCURA, 'fre' + rid) if podrido else None
    e.pon(P.Eje(S, w, mat, z, modelo='tubo', grupo=grupo, punta_clara=0.0, extra=ex))
    mc = P.SECO_OSCURO if podrido else G.CALIZ
    for k, a in enumerate((-168, -128, -90, -52, -12)):
        Sc = P.arco((c[0], c[1] + 0.6 * s), a, 2.6 * s, 18 if a < -90 else -18)
        e.pon(P.Eje(Sc, P.forma('lanceolada', 0.75 * s), mc, z + 0.1, grupo=grupo, nervio=None))


def hoja_fresa(pie, az, e0, e1, L, mat, grupo, brillo=0.0):
    return G.hoja_comp3d(pie, (0, 0, 0), az, e0, e1, L, mat, grupo, FOL_FRESA, raquis=1.0, brillo=brillo)


def fresa_etapa(n):
    e = esc()
    cx, cy = PIE
    r = rng('fresa', n)
    if n == 1:
        G.brote_cotiledones(e, PIE, V_FRESA, largo=6.4, ancho=2.8, abre=64, curva=10)
        e.pon(*G.hoja_comp3d(PIE, (0, 2.2, 0), 270, 86, 70, 6.6, V_FRESA, 'b3',
                             [(0.6, +1, 48, 0.4, 0.2, 'ovada'), (0.6, -1, 48, 0.4, 0.2, 'ovada'),
                              (0.62, 0, 0, 0.44, 0.22, 'ovada')], raquis=1.0))
        return e.render()
    seco = n == 5
    mat = SECO if seco else V_FRESA
    if n == 3:
        hojas = [(196, 50, 18, 14), (238, 62, 32, 15), (282, 66, 38, 15), (326, 58, 28, 14), (12, 48, 14, 13),
                 (150, 52, 14, 12)]
    else:
        hojas = [(184, 46, 12, 21), (216, 56, 24, 22), (250, 64, 34, 23), (286, 66, 38, 23), (320, 58, 28, 22),
                 (352, 48, 14, 21), (140, 50, 14, 17), (40, 50, 14, 17)]
    G.roseta(e, PIE, hojas, hoja_fresa, mat, seco, r)
    if n == 3:
        for k, (dx, dy) in enumerate(((-9.0, 1.0), (8.0, -1.0), (1.0, 3.5))):
            fin = (cx + dx, cy + dy)
            G.rabito(e, (cx, cy - 2.0), fin, G.TALLO_GUIA, 300 + k - 0.05, 'flor%d' % k, g=1.0)
            G.flor(e, fin, 1.15, G.FLOR_BLANCA, 300 + k, 'flor%d' % k)
    else:
        for k, (dx, dy) in enumerate(((-11.0, -0.5), (0.5, 2.5), (11.0, -1.0))):
            top = (cx + dx, cy + dy - 3.0)
            G.rabito(e, (cx, cy - 3.0), top, P.SECO_OSCURO if seco else G.TALLO_GUIA, 300 + k - 0.05, 'fr%d' % k, g=1.0)
            fresa_fruto(e, top, 1.4 * (0.92 if seco else 1.0), seco, 300 + k, 'fr%d' % k, rid=str(k), ang=dx * 1.2)
    return e.render()


def fresa_item(podrido):
    e = esc()
    e.pon(P.Tallo(P.curva([(32.0, 25.8), (32.6, 23.6), (33.6, 22.4)]), 1.2, 1.0,
                  P.SECO_OSCURO if podrido else G.CALIZ, 11, grupo='f'))
    fresa_fruto(e, (32.0, 25.4), 2.0, podrido, 10, 'f', rid='item')
    return e.render()


def fresa_emblema():
    e = esc()
    fresa_fruto(e, (32.0, 29.0), 0.82, False, 10, 'f', rid='emb')
    return e.render()


def fresa_icono():
    e = esc()
    base = (32.0, 42.0)
    for k, (a, L) in enumerate(((-128, 9.0), (-52, 9.0))):
        S = P.arco(base, a, L, 10 if a > -90 else -10)
        fol = [(0.58, +1, 48, 0.34 * L, 0.17 * L, 'ovada', 0, P.dientes(3, 0.28)),
               (0.58, -1, 48, 0.34 * L, 0.17 * L, 'ovada', 0, P.dientes(3, 0.28)),
               (0.62, 0, 0, 0.38 * L, 0.19 * L, 'ovada', 0, P.dientes(3, 0.28))]
        e.pon(*P.hoja_compuesta(S, V_FRESA, 1 + k * 0.1, 'h%d' % k, fol, raquis=1.0, nervio=None))
    return e.render()


# ===========================================================================
# TRIGO
# ===========================================================================

VERDE_TRIGO = Material(rampa_hsv(80, 100, .55, .64, .86, .36, 8), '#21400f')
ESPIGA_VERDE = Material(rampa_hsv(76, 92, .50, .62, .90, .42, 7), '#2a4214')
ORO_TRIGO = M(['#fff3c2', '#f4d684', '#e6be63', '#d0a44d', '#b2873e', '#916b31', '#715226'], '#4a3414')
PAJA = M(['#fbe9b8', '#ecd08c', '#dab86e', '#c29d58', '#a48347', '#846837'], '#4d3a1b')
SECO_TRIGO = M(['#dcbf92', '#c4a273', '#aa875b', '#8f6e48', '#745839', '#5a442c'], '#36271a')


def espiga(e, base, ang, L, w, mat, z, grupo, curva=0.0, aristas=True, mat_ar=None):
    """
    Espiga de trigo: los granos van en dos filas y se dibujan como uves que
    miran a la punta (lineas, nunca bolitas), con tres aristas finas.
    """
    S = P.arco(base, ang, L, curva)
    ww = P.suave([0, .14, .55, .88, 1], [w * .55, w, w * .95, w * .55, 0.25])
    paso = 2.1

    def granos(t, s, d, Q, idx, cols):
        v = t * L - np.abs(d) * 0.9
        m = (np.mod(v, paso) < 0.75) & (t > 0.08) & (t < 0.94) & (np.abs(s) > 0.15)
        ii = np.clip(idx + 2, 0, mat.n() - 1)
        cols[m] = np.array(mat.rampa)[ii[m]]
        return cols
    e.pon(P.Eje(S, ww, mat, z, modelo='tubo', grupo=grupo, punta_clara=0.0, extra=granos))
    if aristas:
        T = P.tangentes(S)
        punta = S[-1]
        a0 = P.ang_de(T[-1])
        for k, (da, la) in enumerate(((-16, 4.2), (0, 4.8), (16, 4.2))):
            ini = punta - T[-1] * (1.6 if da else 0.4) + np.array([-T[-1][1], T[-1][0]]) * (np.sign(da) * 0.8)
            Sa = P.arco(tuple(ini), a0 + da, la, 0)
            t = P.Tallo(Sa, 0.8, 0.8, mat_ar or mat, z + 0.01, grupo=grupo)
            e.pon(t)


def trigo_mata(e, n, r, seco):
    cx, cy = PIE
    if n == 3:
        tallos = [(-3.5, 0.0, 19.0, -5), (-1.0, -1.0, 23.0, -1), (1.5, 0.5, 21.0, 2), (4.0, -0.5, 18.0, 6)]
        mat_t, mat_h, mat_e = VERDE_TRIGO, VERDE_TRIGO, ESPIGA_VERDE
    elif n == 4:
        tallos = [(-6.0, 0.5, 21.0, -7), (-3.0, -1.0, 26.0, -3), (0.0, 0.0, 28.0, 0), (3.0, -1.0, 25.0, 3),
                  (6.0, 0.5, 21.0, 7)]
        mat_t, mat_h, mat_e = PAJA, PAJA, ORO_TRIGO
    else:
        tallos = [(-6.0, 0.5, 19.0, 7), (-3.0, -1.0, 23.0, 8), (0.0, 0.0, 25.0, 9), (3.0, -1.0, 22.0, 10),
                  (6.0, 0.5, 19.0, 11)]
        mat_t, mat_h, mat_e = SECO_TRIGO, SECO_TRIGO, P.podrido(SECO_TRIGO, 0.5)
    for k, (dx, dz, h, inc) in enumerate(tallos):
        h = jit(r, h, 0.04)
        if seco:
            # pasado: sigue de pie (tumbado parecia una arana), vencido y con la espiga colgando
            ctrl = [(dx * 0.4, 0, dz), (dx * 0.7 + inc * 0.35, h * 0.5, dz), (dx + inc * 0.9, h * 0.9, dz)]
        else:
            ctrl = [(dx * 0.4, 0, dz), (dx * 0.7 + inc * 0.25, h * 0.5, dz), (dx + inc * 0.5, h, dz)]
        t, C3 = G.tallo_curvo(PIE, ctrl, 1.4, 1.2, mat_t, 's%d' % k)
        e.pon(t)
        # dos hojas largas y finas desde abajo
        for j, (tt, lado) in enumerate(((0.18, -1 if k % 2 else 1), (0.42, 1 if k % 2 else -1))):
            p, d = P.en_curva3d(C3, tt)
            az = (0 if lado > 0 else 180) + r.uniform(-20, 20)
            if seco:
                # las hojas secas cuelgan pegadas al tallo, hacia el mismo lado
                az = 0 + r.uniform(-15, 15)
            e0, e1 = (52, -8) if not seco else (34, -40)
            e.pon(*P.hoja3d(PIE, az, e0, e1, jit(r, 11.0 if not seco else 8.5, 0.1), 1.05, 'cinta', mat_h, 's%dh%d' % (k, j),
                            origen=tuple(p), nervio=None, ancho_fijo=True, pliegue=0.3,
                            brillo=(0.05 if (j + k) % 2 else -0.03)))
        top = P.proyecta(PIE, [C3[-1]])[0]
        d3 = C3[-1] - C3[-3]
        a2d = P.proyecta((0, 0), [d3])[0]
        ang = math.degrees(math.atan2(a2d[1], a2d[0]))
        if seco:
            ang = ang + 62
        espiga(e, (top[0], top[1] + 0.5), ang, 7.6 if n == 4 else 6.4, 1.8 if n == 4 else 1.5, mat_e,
               float(C3[-1][2]) + 0.3, 's%d' % k, curva=(26 if seco else 0),
               aristas=not seco, mat_ar=(PAJA if n == 4 else ESPIGA_VERDE))


def trigo_pasado(e, r):
    """
    Trigo pasado, como el del juego: los tallos altos se arquean (uno a cada
    lado) y la espiga cuelga de la punta. Tumbado contra el suelo parecia un
    bicho; aqui sigue siendo una mata alta.
    """
    mat_e = P.podrido(SECO_TRIGO, 0.5)
    tallos = [(-5.0, 0.5, 22.0, -1), (-2.0, -1.0, 26.0, 1), (0.8, 0.0, 27.0, -1), (3.6, -1.0, 24.0, 1),
              (6.2, 0.5, 20.0, 1)]
    for k, (dx, dz, h, lado) in enumerate(tallos):
        h = jit(r, h, 0.04)
        ctrl = [(dx * 0.4, 0, dz), (dx * 0.6 + lado * 0.8, h * 0.55, dz), (dx + lado * 4.0, h * 0.86, dz),
                (dx + lado * 7.0, h * 0.74, dz)]
        t, C3 = G.tallo_curvo(PIE, ctrl, 1.4, 1.1, SECO_TRIGO, 's%d' % k)
        e.pon(t)
        p, d = P.en_curva3d(C3, 0.22)
        e.pon(*P.hoja3d(PIE, 0 if lado > 0 else 180, 30, -40, jit(r, 8.0, 0.1), 1.0, 'cinta', SECO_TRIGO,
                        's%dh' % k, origen=tuple(p), nervio=None, ancho_fijo=True, pliegue=0.3,
                        brillo=(0.05 if k % 2 else -0.03)))
        top = P.proyecta(PIE, [C3[-1]])[0]
        espiga(e, (top[0], top[1] - 0.5), 90 - lado * 22, 6.6, 1.6, mat_e, float(C3[-1][2]) + 0.3, 's%d' % k,
               curva=-lado * 10, aristas=False)


def trigo_etapa(n):
    e = esc()
    r = rng('trigo', n)
    if n == 1:
        G.brote_hebras(e, PIE, VERDE_TRIGO, [(-108, 8.0, -10), (-88, 10.0, 4), (-70, 8.5, 12)], grosor=1.6,
                       modelo='hoja')
        return e.render()
    if n == 5:
        trigo_pasado(e, r)
    else:
        trigo_mata(e, n, r, False)
    return e.render()


def trigo_item(podrido):
    e = esc()
    base = (32.0, 46.0)
    if not podrido:
        for k, a in enumerate((-104, -90, -76)):
            S = P.arco(base, a, 7.4, (k - 1) * 4)
            e.pon(P.Tallo(S, 1.4, 1.2, PAJA, k * 0.1, grupo='e%d' % k))
            T = P.tangentes(S)
            espiga(e, tuple(S[-1]), P.ang_de(T[-1]), 8.0, 1.9, ORO_TRIGO, k * 0.1 + 0.05, 'e%d' % k, mat_ar=PAJA)
    else:
        # la espiga pasada: diagonal, parda y algo doblada
        S = P.arco((22.0, 44.0), -40, 8.0, 6)
        e.pon(P.Tallo(S, 1.5, 1.2, SECO_TRIGO, 0, grupo='e'))
        T = P.tangentes(S)
        espiga(e, tuple(S[-1]), P.ang_de(T[-1]) + 6, 10.0, 2.2, P.podrido(SECO_TRIGO, 0.55), 0.05, 'e',
               curva=24, aristas=False)
    return e.render()


def trigo_emblema():
    e = esc()
    S = P.arco((32.0, 38.0), -90, 1.8, 0)
    e.pon(P.Tallo(S, 1.2, 1.0, PAJA, 0, grupo='e'))
    espiga(e, tuple(S[-1]), -90, 5.6, 1.6, ORO_TRIGO, 0.05, 'e', aristas=False)
    return e.render()


def trigo_icono():
    e = esc()
    G.brote_hebras(e, (32.0, 40.0), VERDE_TRIGO, [(-112, 6.0, -10), (-90, 7.4, 4), (-68, 6.4, 12)], grosor=1.4,
                   modelo='hoja')
    return e.render()


# ===========================================================================
# CATALOGO: carpeta, nombres EXACTOS y medidas EXACTAS de cada archivo
# ===========================================================================

PLANTAS = [
    dict(id='zanahoria', carpeta='planta_zanahorias', etapa=zanahoria_etapa,
         saco='item_saco.png', emblema=zanahoria_emblema,
         bueno=('item_zanahoria_buena.png', 19, 25), podrido=('item_zanahoria_podrida.png', 19, 25),
         item=zanahoria_item, brote=('planta_crecimiento_zanahoria.png', 18, 15), icono=zanahoria_icono),
    dict(id='tomate', carpeta='planta_tomates', etapa=tomate_etapa,
         saco='semillas_tomate.png', emblema=tomate_emblema,
         bueno=('item_tomate_bueno.png', 16, 17), podrido=('item_tomate_malo.png', 16, 17),
         item=tomate_item, brote=('item_planta.png', 18, 14), icono=tomate_icono),
    dict(id='calabaza', carpeta='planta_calabaza', etapa=calabaza_etapa,
         saco='item_semilla_calabaza.png', emblema=calabaza_emblema,
         bueno=('item_calabaza_buena.png', 23, 23), podrido=('item_calabaza_podrida.png', 22, 23),
         item=calabaza_item, brote=('item_planta_calabaza.png', 13, 9), icono=calabaza_icono),
    dict(id='fresa', carpeta='planta_fresa', etapa=fresa_etapa,
         saco='item_semilla_fresa.png', emblema=fresa_emblema,
         bueno=('item_fresa_buena.png', 16, 21), podrido=('item_fresa_podrida.png', 16, 21),
         item=fresa_item, brote=('item_planta.png', 23, 17), icono=fresa_icono),
    dict(id='trigo', carpeta='planta_trigo', etapa=trigo_etapa,
         saco='item_semilla_trigo.png', emblema=trigo_emblema,
         bueno=('item_trigo_bueno.png', 21, 24), podrido=('item_trigo_podrido.png', 21, 18),
         item=trigo_item, brote=('item_planta_trigo.png', 13, 10), icono=trigo_icono),
]


def generar(pl, destino, saco):
    carpeta = os.path.join(destino, pl['carpeta'])
    seca = G._carga('tierra_seca.png')
    moja = G._carga('tierra_mojada.png')
    salida = {}
    errores = []
    brote = pl['etapa'](1)
    sprites = {1: brote, 2: brote, 3: pl['etapa'](3), 4: pl['etapa'](4), 5: pl['etapa'](5)}
    for n in (1, 2, 3, 4, 5):
        spr = sprites[n]
        if P.trozos(spr) != 1:
            errores.append('%s etapa %d: %d trozos' % (pl['id'], n, P.trozos(spr)))
        try:
            img, (ox, oy, w, h) = P.sobre_parcela(spr, seca if n == 1 else moja, seca=(n == 1))
        except ValueError as ex:
            errores.append('%s etapa %d: %s' % (pl['id'], n, ex))
            img, (ox, oy, w, h) = P.sobre_parcela(spr, seca if n == 1 else moja, seca=(n == 1), margen=-99)
        izq, der, arr, aba = ox, 51 - (ox + w), oy, 53 - (oy + h)
        if abs(izq - der) > 1 or abs(arr - aba) > 1:
            errores.append('%s etapa %d descentrada %s' % (pl['id'], n, (izq, der, arr, aba)))
        salida['%d.png' % n] = img
    for clave, pod in (('bueno', False), ('podrido', True)):
        nom, W, H = pl[clave]
        spr = pl['item'](pod)
        if P.trozos(spr) != 1:
            errores.append('%s %s: %d trozos' % (pl['id'], nom, P.trozos(spr)))
        salida[nom] = G._cabe(spr, W, H, '%s %s' % (pl['id'], nom), errores)
    nom, W, H = pl['brote']
    ico = pl['icono']()
    if P.trozos(ico) != 1:
        errores.append('%s %s: %d trozos' % (pl['id'], nom, P.trozos(ico)))
    salida[nom] = G._cabe(ico, W, H, '%s %s' % (pl['id'], nom), errores)
    try:
        salida[pl['saco']] = P.poner_emblema(saco, pl['emblema']())
    except ValueError as ex:
        errores.append('%s saco: %s' % (pl['id'], ex))
        salida[pl['saco']] = saco.copy()
    if not errores:
        for nom, img in salida.items():
            P.guardar(img, os.path.join(carpeta, nom))
    return carpeta, salida, errores


def comprobar_respaldo():
    """Escribir en el juego solo si el respaldo de las 45 originales esta entero."""
    falta = []
    for pl in PLANTAS:
        orig = os.path.join(DESTINO, pl['carpeta'])
        resp = os.path.join(RESPALDO, pl['carpeta'])
        for f in os.listdir(orig):
            if f.endswith('.png') and not os.path.isfile(os.path.join(resp, f)):
                falta.append(os.path.join(pl['carpeta'], f))
    if falta:
        raise SystemExit('Falta el respaldo de: %s\n(copia antes Game/Objetos/Plantas a %s)' % (falta, RESPALDO))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--solo', default='')
    ap.add_argument('--salida', default=DESTINO)
    ap.add_argument('--hoja', default='')
    args = ap.parse_args()
    solo = [s for s in args.solo.split(',') if s]
    if os.path.abspath(args.salida) == os.path.abspath(DESTINO):
        comprobar_respaldo()
    saco = P.saco_limpio()
    resultados = []
    errores = []
    for pl in PLANTAS:
        if solo and pl['id'] not in solo:
            continue
        carpeta, salida, err = generar(pl, args.salida, saco)
        errores += err
        orden = ['1.png', '2.png', '3.png', '4.png', '5.png', pl['bueno'][0], pl['podrido'][0], pl['saco'], pl['brote'][0]]
        resultados.append((pl['id'], {k: salida[k] for k in orden}))
        print('ok' if not err else 'MAL', pl['id'], '->', carpeta)
    if args.hoja and resultados:
        G.ORDEN_HOJA = ['1.png', '2.png', '3.png', '4.png', '5.png']
        print('hoja', G.hoja_contacto(resultados, args.hoja))
    if errores:
        raise SystemExit('\n'.join(errores))


if __name__ == '__main__':
    main()
