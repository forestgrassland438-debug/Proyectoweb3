#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
GF ARENA ARTE B — barriles, comedero, carne y la hoja de NIEVE y CAÑON
=============================================================================

Lo usa `generar-arenas.py`. Va aparte de `gf_arena_arte.py` para no tocar ni
un pixel de la primera hoja: todo lo de aqui es NUEVO (2026-10-02).

  · barril / cuenco / carne     van en las DOS hojas, en las mismas casillas
                                (fila 12, columnas 10-14), asi el cliente los
                                encuentra igual sea cual sea la arena.
  · nieve, hielo, agua fria,    la segunda hoja (arena_32_b.png), con el mismo
    arena roja, tierra roja,    estilo plano que la primera: color liso y
    sus muros y matas           pocos pixeles de acento DIBUJADOS.

Los muros nuevos se dan de alta en `gf_arena_arte.MUROS`, asi `muro()` y
`tapa_muro()` de la primera hoja los pintan sin cambiar nada.
"""

import math

import gf_arte as A
import gf_arena_arte as R
from gf_arena_arte import (H, T, nueva, Pincel, ruido, onda, FRENTE,
                           HUESO, HUESO_OSC, HUESO_CONT, ESPUMA, tocon)

# ===========================================================================
# BARRILES, COMEDERO Y CARNE
# ===========================================================================

BARRIL_ROJO, BARRIL_ROJO_OSC, BARRIL_ROJO_CLA = H('b8392e'), H('8a2620'), H('d9574a')
ARO, ARO_CLA, ARO_OSC = H('5c5f66'), H('8b9099'), H('34363b')
CONTORNO_BARRIL = H('2a0f0b')


def barril(estado):
    """
    Barril de polvora en 3/4: tapa eliptica, duelas rojas con dos aros de
    hierro y el rombo amarillo de "cuidado" en el frente. estado 0 = entero,
    1 = tocado (abollado, con una duela saltada y humo), 2 = la marca negra que
    deja en el suelo al explotar.
    """
    im = nueva()
    p = Pincel(im)
    if estado == 2:
        rng = A.rng_de('barril-quemado')
        p.elipse(16, 19, 13, 8, H('2b2420'))
        p.elipse(16, 19, 10, 6, H('3d332c'))
        p.elipse(15, 18, 5, 3, H('1c1714'))
        for i in range(6):                              # astillas
            x, y = rng.randint(5, 25), rng.randint(13, 25)
            p.linea_h(x, x + rng.randint(2, 4), y, BARRIL_ROJO_OSC)
        p.elipse(9, 22, 3, 1.5, ARO_OSC)                # aros sueltos
        p.elipse(24, 15, 2.5, 1.2, ARO_OSC)
        return im
    x0, x1 = 7, 24
    y_tapa, y_fin = 6, 28
    # cuerpo: duelas (bandas verticales), un poco abombadas por la panza
    for y in range(y_tapa + 2, y_fin + 1):
        panza = 1 if y_tapa + 6 <= y <= y_fin - 5 else 0
        for x in range(x0 - panza, x1 + panza + 1):
            lx = (x - x0) % 4
            c = BARRIL_ROJO_CLA if lx == 0 else (BARRIL_ROJO_OSC if lx == 3 else BARRIL_ROJO)
            if x <= x0 + 1:
                c = BARRIL_ROJO_OSC
            p.set(x, y, c)
    # aros
    for yy in (y_tapa + 5, y_fin - 4):
        p.linea_h(x0 - 1, x1 + 1, yy, ARO)
        p.linea_h(x0 - 1, x1 + 1, yy + 1, ARO_OSC)
        p.linea_h(x0 + 2, x1 - 3, yy, ARO_CLA)
    # tapa
    p.elipse(16, y_tapa + 1.5, 8.6, 3.2, H('9c6a3a'))
    p.elipse(16, y_tapa + 1.5, 7.2, 2.2, H('c08f52'))
    p.linea_h(12, 19, y_tapa + 1, H('a87436'))
    # mecha
    p.linea_v(19, y_tapa - 3, y_tapa, H('3a2516'))
    p.set(20, y_tapa - 4, H('ffd34d'))
    p.set(19, y_tapa - 4, H('ff8a2a'))
    # el rombo de cuidado, con su exclamacion
    cx, cy = 16, (y_tapa + y_fin) // 2 + 1
    for dy in range(-4, 5):
        w = 4 - abs(dy)
        p.linea_h(cx - w, cx + w, cy + dy, H('f2c230'))
    p.linea_v(cx, cy - 2, cy + 1, H('3a1a10'))
    p.set(cx, cy + 3, H('3a1a10'))
    if estado == 1:
        p.rect(x1 - 4, y_tapa + 8, x1 - 2, y_tapa + 12, H('3a1a10'))   # duela saltada
        for k in range(5):                                            # abolladura
            p.set(x0 + 2 + k, y_fin - 8 + (k % 2), H('5a1c16'))
        for (hx, hy) in ((12, 2), (13, 1), (11, 1), (12, 0)):          # humito
            p.set(hx, hy, H('c9c3bb'))
    Pincel(im).contornear(CONTORNO_BARRIL)
    return im


def cuenco():
    """El comedero: un cuenco de barro con borde claro. Ahi sale la carne."""
    im = nueva()
    p = Pincel(im)
    p.elipse(16, 22, 12, 5, H('2b2420'))               # sombra
    p.elipse(16, 19, 11, 6, H('7a3f22'))               # cuerpo
    p.elipse(16, 18, 11, 5, H('a6582f'))
    p.elipse(16, 16.5, 9.5, 3.6, H('d9884a'))          # borde
    p.elipse(16, 16.8, 7.5, 2.4, H('4a2614'))          # hueco
    p.linea_h(9, 13, 18, H('e8a46a'))                  # brillo
    Pincel(im).contornear(H('2a140a'))
    return im


def carne():
    """Muslo de carne con su hueso: cura un 35 % (lo coge quien esta herido)."""
    im = nueva()
    p = Pincel(im)
    p.elipse(16, 24, 9, 3, H('2b2420'))                # sombra
    p.elipse(13, 15, 8, 7, H('8e3a22'))                # la carne
    p.elipse(12.5, 14, 7, 6, H('c4552f'))
    p.elipse(11, 12, 4, 3, H('e07a4e'))
    p.set(9, 11, H('f6b089'))
    p.set(10, 10, H('f6b089'))
    p.rect(18, 17, 23, 19, HUESO)                       # el hueso que asoma
    p.elipse(24, 16.5, 2.3, 2.3, HUESO)
    p.elipse(24, 20, 2.3, 2.3, HUESO)
    p.linea_h(18, 23, 19, HUESO_OSC)
    Pincel(im).contornear(H('3a120a'))
    return im


# ===========================================================================
# HOJA B: SUELOS
# ===========================================================================

NIEVE, NIEVE_SOMBRA, NIEVE_CLA, NIEVE_AZUL = H('e9f2f8'), H('c9d9e6'), H('ffffff'), H('aec6d8')
HIELO, HIELO_CLA, HIELO_OSC = H('a8dbef'), H('def4fc'), H('7cc0dd')
AGUA_FRIA, AGUA_FRIA_CLA, AGUA_FRIA_OSC = H('3f86ad'), H('63a9cc'), H('2f6f95')
ESPUMA_FRIA, ORILLA_FRIA = H('e6f6fd'), H('7fbad8')
ARENA_ROJA, ARENA_ROJA_OSC, ARENA_ROJA_CLA = H('d9a066'), H('bd8350'), H('ecbd86')
TIERRA_ROJA, TIERRA_ROJA_OSC, TIERRA_ROJA_CLA = H('b06a40'), H('8f522f'), H('c98457')

PAL_NEVADO = (H('1f4229'), H('2f5d3a'), H('dfeef6'), NIEVE_CLA)
CONTORNO_NEVADO = H('15301d')
PAL_SECO = (H('8a6f2c'), H('b99a4a'), H('d9bd6a'), H('efd88f'))
CONTORNO_SECO = H('5a4518')


def nieve(variante):
    im = nueva()
    p = Pincel(im)
    p.rect(0, 0, T - 1, T - 1, NIEVE)
    rng = A.rng_de('nieve', variante)
    # Montoncitos: una sombra corta con su luz encima.
    for i in range(2 + variante % 3):
        x, y = rng.randint(3, T - 9), rng.randint(5, T - 4)
        largo = rng.randint(3, 6)
        p.linea_h(x, x + largo - 1, y, NIEVE_SOMBRA)
        p.linea_h(x + 1, x + largo - 2, y - 1, NIEVE_CLA)
    for i in range(1 + variante % 2):
        p.set(rng.randint(2, T - 3), rng.randint(2, T - 3), NIEVE_AZUL)
    return im


def nieve_brillos(variante):
    im = nieve(variante + 5)
    p = Pincel(im)
    rng = A.rng_de('nieve-brillo', variante)
    for i in range(4):
        x, y = rng.randint(3, T - 4), rng.randint(3, T - 4)
        p.set(x, y, NIEVE_CLA)
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            p.set(x + dx, y + dy, H('dbe9f3'))
    return im


def hielo(variante):
    im = nueva()
    p = Pincel(im)
    p.rect(0, 0, T - 1, T - 1, HIELO)
    rng = A.rng_de('hielo', variante)
    for i in range(2):                                   # reflejos en diagonal
        x, y = rng.randint(2, T - 12), rng.randint(9, T - 3)
        for k in range(rng.randint(5, 9)):
            p.set(x + k, y - k, HIELO_CLA)
    if variante % 2 == 1:                                # una grieta
        x, y = rng.randint(6, 14), rng.randint(10, 22)
        for k in range(9):
            p.set(x + k, y + (k // 3) * (1 if variante % 4 == 1 else -1), HIELO_OSC)
    return im


def agua_fria(variante):
    im = nueva()
    p = Pincel(im)
    p.rect(0, 0, T - 1, T - 1, AGUA_FRIA)
    rng = A.rng_de('agua-fria', variante)
    for i in range(3):
        x, y = rng.randint(3, T - 9), rng.randint(3, T - 4)
        largo = rng.randint(3, 6)
        p.linea_h(x, x + largo - 1, y, AGUA_FRIA_CLA)
        p.linea_h(x + 1, x + largo, y + 1, AGUA_FRIA_OSC)
    if variante == 2:
        p.elipse(22, 10, 3, 2, ESPUMA_FRIA)             # un trocito de hielo flotando
        p.linea_h(20, 23, 11, HIELO_OSC)
    return im


def arena_roja(variante):
    im = nueva()
    p = Pincel(im)
    p.rect(0, 0, T - 1, T - 1, ARENA_ROJA)
    rng = A.rng_de('arena-roja', variante)
    for i in range(2 if variante % 2 else 1):            # ondas del viento
        x, y = rng.randint(4, T - 12), rng.randint(4, T - 5)
        largo = rng.randint(6, 9)
        for k in range(largo):
            dy = -1 if 1 <= k < largo - 1 else 0
            p.set(x + k, y + dy, ARENA_ROJA_OSC)
            if 2 <= k < largo - 2:
                p.set(x + k, y + dy - 1, ARENA_ROJA_CLA)
    for i in range(2 + variante % 2):
        p.set(rng.randint(2, T - 3), rng.randint(2, T - 3), ARENA_ROJA_CLA)
    return im


def arena_roja_ondas(variante):
    """Dunas: tres ondas largas de lado a lado (periodo 32: siguen en la vecina)."""
    im = nueva()
    p = Pincel(im)
    p.rect(0, 0, T - 1, T - 1, ARENA_ROJA)
    for base in (6, 16, 26):
        for x in range(T):
            y = base + int(round(2 * math.sin(2 * math.pi * x / T + variante)))
            p.set(x, y, ARENA_ROJA_OSC)
            p.set(x, y - 1, ARENA_ROJA_CLA)
    return im


def tierra_roja(variante):
    im = nueva()
    p = Pincel(im)
    p.rect(0, 0, T - 1, T - 1, TIERRA_ROJA)
    rng = A.rng_de('tierra-roja', variante)
    for i in range(4 + variante % 3):                    # terrones
        x, y = rng.randint(3, T - 5), rng.randint(3, T - 5)
        w, hh = rng.choice([2, 3, 4]), rng.choice([1, 2])
        p.rect(x, y, x + w - 1, y + hh - 1, TIERRA_ROJA_OSC)
        p.linea_h(x, x + w - 1, y - 1, TIERRA_ROJA_CLA)
    if variante % 2 == 1:
        p.elipse(rng.randint(8, T - 9), rng.randint(8, T - 9), 2, 1.4, H('7a4426'))
    return im


def transicion_b(nw, ne, sw, se, relleno_a, relleno_b, estilo, semilla):
    """
    Como `gf_arena_arte.transicion`, con los bordes de los terrenos nuevos.
    Usa la MISMA mascara (`mascara_wang`), asi casa con las de la hoja A.
    """
    dentro, ext = R.mascara_wang(nw, ne, sw, se, semilla)
    pa, pb = relleno_a.load(), relleno_b.load()
    im = nueva()
    p = Pincel(im)
    for y in range(T):
        for x in range(T):
            p.set(x, y, pb[x, y] if dentro[y, x] else pa[x, y])

    def es_b(x, y):
        return bool(ext[y + 2, x + 2])

    def dist_al_otro(x, y, b, maximo):
        for r in range(1, maximo + 1):
            for dy in range(-r, r + 1):
                for dx in range(-r, r + 1):
                    if max(abs(dx), abs(dy)) != r:
                        continue
                    xx, yy = x + dx, y + dy
                    if -2 <= xx < T + 2 and -2 <= yy < T + 2 and es_b(xx, yy) != b:
                        return r
        return None

    for y in range(T):
        for x in range(T):
            b = es_b(x, y)
            d = dist_al_otro(x, y, b, 2)
            if d is None:
                continue
            c = None
            if estilo == 'agua_nieve':
                if b:
                    c = ESPUMA_FRIA if d == 1 else ORILLA_FRIA
                elif d == 1:
                    c = NIEVE_SOMBRA
            elif estilo == 'hielo':
                if b and d == 1:
                    c = HIELO_OSC
                elif not b and d == 1:
                    c = NIEVE_SOMBRA
            elif estilo == 'agua_arenaroja':
                if b:
                    c = ESPUMA if d == 1 else R.AGUA_ORILLA
                elif d == 1:
                    c = ARENA_ROJA_OSC
            elif estilo == 'tierraroja':
                if b and d == 1:
                    c = TIERRA_ROJA_OSC
                elif not b and d == 1:
                    c = ARENA_ROJA_OSC
            if c is not None:
                p.set(x, y, c)
    return im


# ===========================================================================
# HOJA B: MUROS (se dan de alta en gf_arena_arte.MUROS)
# ===========================================================================

def _cara_hielo(x, yrel):
    """Bloque de hielo visto desde arriba: losas de 16 px con reflejos."""
    lx, ly = x % 16, yrel % 16
    if lx == 15 or ly == 15:
        return H('8fcbe3')
    if (x + yrel) % 16 in (3, 4) and 2 <= lx <= 13:
        return H('eefafe')
    if lx == 0 or ly == 0:
        return H('dcf3fb')
    return H('c3e8f6')


def _frente_hielo(x, yf):
    if yf >= FRENTE - 2:
        return H('5b9cbd')
    if (x + yf * 2) % 9 == 0:
        return H('b9e2f3')
    return H('93cde5') if (yf // 3) % 2 == 0 else H('82c2de')


def _cara_roca_nevada(x, yrel):
    """Roca con nieve encima: la nieve manda, la piedra asoma a ratos."""
    v = onda(x, yrel, 'roca-nevada', k=((2, 1), (1, 2), (3, 2)))
    if v > 0.48:
        return H('8e98a4') if ruido(x % T, yrel % T, 5) > 0.3 else H('a7b0ba')
    if v > 0.36:
        return NIEVE_SOMBRA
    return NIEVE if ruido(x % T, yrel % T, 9) > 0.08 else NIEVE_CLA


def _frente_roca_nevada(x, yf):
    if yf == 0:
        return NIEVE
    # carambanos colgando del borde de la nieve
    if 1 <= yf <= 3 and x % 7 == 3 and yf <= 1 + (x % 3):
        return HIELO_CLA
    fila = yf // 5
    desfase = 5 if fila % 2 else 0
    lx = (x + desfase) % 10
    if yf % 5 == 4 or lx == 9:
        return H('4f5761')
    return H('7d8794') if (fila + (x + desfase) // 10) % 2 == 0 else H('6d7783')


def _cara_roca_roja(x, yrel):
    """La meseta del cañon vista desde arriba: arena dura con vetas."""
    v = onda(x, yrel, 'meseta', k=((1, 1), (2, 3), (3, 1)))
    if v > 0.42:
        return H('d48a52')
    if v < -0.40:
        return H('a85e35')
    if ruido(x % T, yrel % T, 21) > 0.93:
        return H('8a4a2a')
    return H('c47a48')


def _frente_roca_roja(x, yf):
    """El frente: capas de sedimento, cada una de su color, onduladas."""
    y = yf + int(round(onda(x, 0, 'estratos', k=((1, 1), (2, 1)), amp=1.2)))
    if y <= 1:
        return H('d68a55')
    if y <= 4:
        return H('b8693d')
    if y <= 6:
        return H('9a5532')
    if y <= 9:
        return H('a95f37')
    return H('7f4429')


R.MUROS.update({
    'hielo': {
        'cara': _cara_hielo, 'frente': _frente_hielo,
        'contorno': H('2f5f78'), 'labio': H('eefafe'),
    },
    'roca_nevada': {
        'cara': _cara_roca_nevada, 'frente': _frente_roca_nevada,
        'contorno': H('2f3640'), 'labio': NIEVE_CLA,
    },
    'roca_roja': {
        'cara': _cara_roca_roja, 'frente': _frente_roca_roja,
        'contorno': H('4a2414'), 'labio': H('e5a06b'),
    },
})


# ===========================================================================
# HOJA B: DECORACION
# ===========================================================================

def deco_huellas(variante):
    """Un rastro de huellas de perro en la nieve."""
    im = nueva()
    p = Pincel(im)
    pasos = [(7, 25), (12, 19), (17, 13), (22, 7)] if variante == 0 else [(6, 9), (12, 14), (18, 18), (24, 23)]
    for i, (x, y) in enumerate(pasos):
        x += 2 if i % 2 else -2
        p.elipse(x, y, 1.8, 1.5, NIEVE_AZUL)
        for ox, oy in ((-2, -2), (0, -3), (2, -2)):
            p.set(x + ox, y + oy, NIEVE_AZUL)
    return im


def deco_ramitas(variante):
    im = nueva()
    p = Pincel(im)
    rng = A.rng_de('ramitas', variante)
    for i in range(2 + variante):
        x, y = rng.randint(6, 20), rng.randint(8, 24)
        largo = rng.randint(5, 8)
        for k in range(largo):
            p.set(x + k, y - k // 3, H('5b3d27'))
        p.set(x + largo // 2, y - largo // 6 - 2, H('5b3d27'))
        p.set(x + largo // 2 + 1, y - largo // 6 - 3, H('5b3d27'))
    return im


def deco_piedra_nevada(variante):
    im = nueva()
    p = Pincel(im)
    rng = A.rng_de('piedra-nevada', variante)
    for i in range(1 + variante):
        x, y = rng.randint(9, 22), rng.randint(10, 22)
        rx = rng.choice([3, 4])
        p.elipse(x, y, rx + 1, 3, H('3f4650'))
        p.elipse(x, y, rx, 2.4, H('8e98a4'))
        p.elipse(x, y - 1.5, rx - 0.5, 1.5, NIEVE)
    return im


def deco_grieta_hielo(variante):
    im = nueva()
    p = Pincel(im)
    rng = A.rng_de('grieta-hielo', variante)
    x, y = rng.randint(5, 10), rng.randint(8, 22)
    for k in range(14 + variante * 4):
        p.set(x, y, HIELO_OSC)
        x += 1
        if rng.random() < 0.4:
            y += rng.choice([-1, 1])
    return im


def deco_cactus(variante):
    """Un cactus pequeño (decorado: no choca). variante 1 lleva flor."""
    im = nueva()
    p = Pincel(im)
    verde, osc, cla = H('5e9a4a'), H('3f6f33'), H('86c06a')
    cx = 16
    p.elipse(cx, 26, 6, 2, TIERRA_ROJA_OSC)              # sombra
    p.rect(cx - 2, 10, cx + 2, 26, verde)                 # tronco
    p.linea_v(cx - 2, 10, 26, osc)
    p.linea_v(cx + 1, 11, 25, cla)
    p.elipse(cx, 10, 2.5, 2, verde)
    lado = 1 if variante == 0 else -1
    # brazo alto, hacia `lado`
    bx = cx + 5 * lado
    p.rect(min(cx, bx), 16, max(cx, bx), 18, verde)
    p.rect(min(bx, bx + lado), 11, max(bx, bx + lado), 18, verde)
    # brazo bajo, hacia el otro lado
    bx2 = cx - 5 * lado
    p.rect(min(cx, bx2), 20, max(cx, bx2), 22, verde)
    p.rect(min(bx2, bx2 - lado), 16, max(bx2, bx2 - lado), 22, verde)
    if variante == 1:
        p.set(cx, 8, H('f08ab2'))
        p.set(cx - 1, 8, H('f8b8d0'))
        p.set(cx + 1, 8, H('f8b8d0'))
    Pincel(im).contornear(H('24401d'))
    return im


def deco_calavera():
    """La calavera de una vaca, medio enterrada en la arena."""
    im = nueva()
    p = Pincel(im)
    p.elipse(16, 21, 9, 3, ARENA_ROJA_OSC)
    p.elipse(16, 17, 6, 5, HUESO)
    p.rect(13, 19, 19, 23, HUESO)
    p.elipse(13.5, 16, 1.6, 1.8, H('4a4030'))
    p.elipse(18.5, 16, 1.6, 1.8, H('4a4030'))
    p.set(15, 21, H('4a4030'))
    p.set(17, 21, H('4a4030'))
    for k in range(5):                                    # cuernos
        p.set(10 - k // 2, 13 - k, HUESO_OSC)
        p.set(22 + k // 2, 13 - k, HUESO_OSC)
    Pincel(im).contornear(HUESO_CONT)
    return im


def deco_piedras_rojas(variante):
    im = nueva()
    p = Pincel(im)
    rng = A.rng_de('piedras-rojas', variante)
    for i in range(2 + variante):
        x, y = rng.randint(8, 23), rng.randint(8, 23)
        rx = rng.choice([2, 3])
        p.elipse(x, y, rx + 1, 3, H('5a2c18'))
        p.elipse(x, y, rx, 2, H('a85e35'))
        p.set(x - rx + 1, y - 1, H('d48a52'))
    return im


def deco_grieta_seca(variante):
    im = nueva()
    p = Pincel(im)
    rng = A.rng_de('grieta-seca', variante)
    x, y = rng.randint(5, 10), rng.randint(8, 22)
    for k in range(16 + variante * 4):
        p.set(x, y, TIERRA_ROJA_OSC)
        x += 1
        if rng.random() < 0.45:
            y += rng.choice([-1, 1])
        if k == 7:
            bx, by = x, y
            for j in range(4):
                p.set(bx + j // 2, by + j, TIERRA_ROJA_OSC)
    return im


def deco_cardo():
    """Un cardo seco: cuatro tallos y una flor morada."""
    im = nueva()
    p = Pincel(im)
    for dx, alto in ((-4, 8), (-1, 11), (2, 9), (5, 7)):
        inclina = 1 if dx > 0 else (-1 if dx < 0 else 0)
        for y in range(alto):
            p.set(16 + dx + (y // 4) * inclina, 26 - y, H('8a6f2c'))
    p.elipse(15, 15, 2.2, 2, H('9a5ab8'))
    p.set(15, 14, H('c99ae0'))
    return im


def tempano():
    """Un tempano flotando en el agua fria."""
    im = nueva()
    p = Pincel(im)
    p.elipse(16, 20, 11, 5, ESPUMA_FRIA)
    p.elipse(16, 17, 9, 6, H('9fd0e6'))
    p.elipse(15, 15, 8, 5, H('d8f1fb'))
    p.linea_h(11, 15, 13, NIEVE_CLA)
    return im


def tocon_nevado():
    im = tocon()
    p = Pincel(im)
    p.elipse(15.5, 12.5, 7, 2.6, NIEVE)
    p.linea_h(12, 16, 11, NIEVE_CLA)
    return im


def charco_helado():
    im = nueva()
    p = Pincel(im)
    p.elipse(16, 17, 10, 5, HIELO_OSC)
    p.elipse(15, 16, 8, 3.5, HIELO)
    p.linea_h(11, 15, 15, HIELO_CLA)
    return im


def roca_roja_agua():
    im = nueva()
    p = Pincel(im)
    p.elipse(16, 20, 10, 5, ESPUMA)
    p.elipse(16, 17, 8, 6, H('7f4429'))
    p.elipse(15, 15, 7, 5, H('b8693d'))
    p.elipse(13, 13, 3, 2, H('d68a55'))
    return im
