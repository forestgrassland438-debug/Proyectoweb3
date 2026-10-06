#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
GF ARENA ARTE — las casillas de 32x32 del tileset de las batallas
=============================================================================

No genera nada por si sola: la usa `generar-arenas.py`, que ordena las piezas
en el tileset, escribe el .tsx para Tiled y monta los mapas.

EL TAMANO
---------------------------------------------------------------------------
Los mapas del mundo van en casillas de 16 px (`tiles.png`), pero la isla de las
Lands ya usa 32 px (`Game/MAPAS/isla_32.png`, 16 columnas). Las arenas siguen a
la isla: 32x32 por casilla y 16 columnas, o sea una hoja de 512x512 con 16x16
casillas. A 32 px el perro (38x32) ocupa una casilla, que es la escala de un
juego de arena: cada luchador del tamano de una baldosa.

LA PALETA SE MIDE, NO SE ELIGE
---------------------------------------------------------------------------
Contando pixeles en el arte del juego:

    hierba   #418546  oscuro #37733c  claro #62b368     (tiles.png)
    seto     #366d3a  #2d5b30  #244827  #28512c          (el arbusto de tiles.png)
    camino   #987656  #7f5e3c  #745232  #aa8969  #5b3d27 (empedrado de tiles.png)
    arena    #dcc188  #b89b66  #f0dcaa                    (isla_32.png)
    agua     #4aa8cf  #51b9e4                             (isla_32.png)
    piedra   #8b8376  #90887a  #665f55  #514b43  #b8b0a0  (isla_32.png)
    madera   #8a5f30  #c08f52  #5b3d27                    (isla_32.png)

EL ESTILO ES PLANO
---------------------------------------------------------------------------
Como en el resto del juego (ver gf_tiles.py): color liso con unos pocos
pixeles de acento DIBUJADOS. Nada de ruido pixel a pixel, que se ve como nieve
de television.

TODO ES FUNCION DE LA COORDENADA
---------------------------------------------------------------------------
Las texturas que tienen que continuar de una casilla a la vecina (la cara de
un muro, las hojas de un seto, la hierba alta) se calculan con funciones
PERIODICAS de periodo 32. Asi dos muros pegados siguen la misma hilera de
bloques sin escalon, y la tapa de un muro (que va en la casilla de ARRIBA)
continua exactamente la cara que empieza en la de abajo.

LAS TRANSICIONES SON DE ESQUINAS (Wang "corner" de Tiled)
---------------------------------------------------------------------------
Cada juego de transicion son 16 casillas: una por cada combinacion de las
cuatro esquinas (terreno A o terreno B). Es el formato que el pincel de
terrenos de Tiled rellena solo.

Para que dos casillas vecinas casen, la mascara de cada una sale de una regla
que SOLO depende de sus cuatro esquinas: cada esquina es duena del cuadrado de
32x32 centrado en ella, y la mascara es ese reparto suavizado con un nucleo
gaussiano de radio 12. Cerca de un borde solo influyen las dos esquinas de
ese borde —que comparte con la vecina—, asi que la linea entre terrenos llega
al borde en el mismo sitio desde los dos lados. El ruido que la hace
irregular se apaga a 4 px de los bordes por lo mismo.
"""

import math

import numpy as np
from PIL import Image

import gf_arte as A

T = 32                       # lado de una casilla
TRANSP = (0, 0, 0, 0)

# ---------------------------------------------------------------------------
# PALETA (medida; ver arriba)
# ---------------------------------------------------------------------------
H = A.hex_rgb

HIERBA, HIERBA_OSC, HIERBA_CLA = H('418546'), H('37733c'), H('62b368')
HIERBA_BORDE = H('2f6b37')

TIERRA, TIERRA_OSC, TIERRA_OSC2, TIERRA_CLA, TIERRA_LINEA = (
    H('987656'), H('7f5e3c'), H('745232'), H('aa8969'), H('5b3d27'))

ARENA, ARENA_OSC, ARENA_CLA = H('dcc188'), H('b89b66'), H('f0dcaa')

AGUA, AGUA_CLA, AGUA_OSC = H('4aa8cf'), H('51b9e4'), H('3d93bb')
AGUA_ORILLA, ESPUMA = H('6cc3e3'), H('d4f0fa')

PIEDRA, PIEDRA_M, PIEDRA_OSC, PIEDRA_OSC2, PIEDRA_CLA = (
    H('8b8376'), H('90887a'), H('665f55'), H('514b43'), H('b8b0a0'))

MADERA, MADERA_CLA, MADERA_OSC = H('8a5f30'), H('c08f52'), H('5b3d27')
MADERA_TOPE = H('cf9e5e')
CONTORNO_MADERA = H('3a2516')         # contorno del tronco de arbol.png

SETO, SETO_OSC, SETO_OSC2, SETO_SOMBRA = H('366d3a'), H('2d5b30'), H('244827'), H('28512c')

FLOR_AMARILLA, FLOR_AMARILLA_OSC = H('ebdd36'), H('cdbf14')
FLOR_BLANCA = H('f2f2ee')
FLOR_ROSA, FLOR_ROSA_OSC = H('d77ad8'), H('a552b0')
GUIJARRO, GUIJARRO_CLA, GUIJARRO_CONT = H('baada0'), H('d7cfc4'), H('4a443c')

ORO, ORO_OSC, ORO_CLA = H('ebdd36'), H('b59a12'), H('fff3a0')
HUESO, HUESO_OSC, HUESO_CONT = H('f3ecd8'), H('cfc4a6'), H('4a4030')


# ===========================================================================
# PINCEL
# ===========================================================================

def nueva(w=T, h=T):
    return Image.new('RGBA', (w, h), TRANSP)


class Pincel(object):
    """Acceso por pixel a una imagen PIL, con las primitivas que hacen falta."""

    def __init__(self, im):
        self.im = im
        self.px = im.load()
        self.w, self.h = im.size

    def set(self, x, y, c):
        x = int(math.floor(x + 0.5)) if not isinstance(x, int) else x
        y = int(math.floor(y + 0.5)) if not isinstance(y, int) else y
        if c is None or not (0 <= x < self.w and 0 <= y < self.h):
            return
        if len(c) == 3:
            c = (c[0], c[1], c[2], 255)
        self.px[x, y] = c

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[x, y]
        return TRANSP

    def opaco(self, x, y):
        return self.get(x, y)[3] > 0

    def rect(self, x0, y0, x1, y1, c):
        """Rectangulo relleno, extremos INCLUIDOS."""
        for y in range(max(0, y0), min(self.h - 1, y1) + 1):
            for x in range(max(0, x0), min(self.w - 1, x1) + 1):
                self.set(x, y, c)

    def linea_h(self, x0, x1, y, c):
        for x in range(x0, x1 + 1):
            self.set(x, y, c)

    def linea_v(self, x, y0, y1, c):
        for y in range(y0, y1 + 1):
            self.set(x, y, c)

    def elipse(self, cx, cy, rx, ry, c, solo_si=None):
        """Elipse rellena centrada en (cx, cy); `solo_si(x, y)` filtra."""
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                dx = (x + 0.5 - cx) / max(0.01, rx)
                dy = (y + 0.5 - cy) / max(0.01, ry)
                if dx * dx + dy * dy <= 1.0 and (solo_si is None or solo_si(x, y)):
                    self.set(x, y, c)

    def contornear(self, color, diagonales=False):
        """Pinta `color` en los pixeles transparentes que tocan algo opaco."""
        marcar = []
        for y in range(self.h):
            for x in range(self.w):
                if self.opaco(x, y):
                    continue
                vecinos = [(1, 0), (-1, 0), (0, 1), (0, -1)]
                if diagonales:
                    vecinos += [(1, 1), (1, -1), (-1, 1), (-1, -1)]
                if any(self.opaco(x + dx, y + dy) for dx, dy in vecinos):
                    marcar.append((x, y))
        for x, y in marcar:
            self.set(x, y, color)


def ruido(x, y, semilla):
    """0..1 determinista: un hash de la coordenada, no un dado."""
    h = (x * 73856093) ^ (y * 19349663) ^ ((semilla & 0xFFFFFFF) * 83492791)
    h &= 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


def semilla_de(*partes):
    return A.rng_de('arena', *partes).randrange(1, 1 << 27)


def onda(x, y, semilla, k=((1, 1), (2, 1), (1, 2)), amp=1.0):
    """
    Ruido suave PERIODICO de periodo 32 en x y en y: suma de senos con
    frecuencias enteras. Vale lo mismo en x = 0 que en x = 32, asi que la
    textura sigue sin escalon en la casilla de al lado.
    """
    rng = A.rng_de('onda', semilla)
    v = 0.0
    tot = 0.0
    for kx, ky in k:
        fx = rng.random() * 2 * math.pi
        fy = rng.random() * 2 * math.pi
        a = 1.0 / (kx + ky)
        v += a * math.sin(2 * math.pi * kx * x / T + fx) * math.cos(2 * math.pi * ky * y / T + fy)
        tot += a
    return amp * v / tot


# ===========================================================================
# SUELOS
# ===========================================================================

def _brotes(p, rng, n, claro=HIERBA_CLA, oscuro=HIERBA_OSC, margen=3):
    """Matitas de 3 hojas como las de tiles.png: base oscura, puntas claras."""
    sitios = []
    intentos = 0
    while len(sitios) < n and intentos < 200:
        intentos += 1
        x = rng.randint(margen, T - 1 - margen)
        y = rng.randint(margen + 2, T - 1 - margen)
        if all(abs(x - a) + abs(y - b) > 7 for a, b in sitios):
            sitios.append((x, y))
    for x, y in sitios:
        p.set(x, y, oscuro)
        p.set(x - 1, y - 1, claro)
        p.set(x + 1, y - 1, claro)
        p.set(x, y - 2, claro)
        if rng.random() < 0.5:
            p.set(x - 2, y - 2, claro)
        else:
            p.set(x + 2, y - 2, claro)


def hierba(variante, base=HIERBA):
    im = nueva()
    p = Pincel(im)
    p.rect(0, 0, T - 1, T - 1, base)
    rng = A.rng_de('hierba', variante)
    _brotes(p, rng, [3, 2, 4, 1][variante % 4])
    return im


def _flor(p, x, y, petalo, centro, sombra=None):
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        p.set(x + dx, y + dy, petalo)
    p.set(x, y, centro)
    if sombra:
        p.set(x, y + 2, sombra)


def hierba_flores(variante):
    im = hierba(variante + 7)
    p = Pincel(im)
    rng = A.rng_de('flores', variante)
    colores = [(FLOR_AMARILLA, FLOR_AMARILLA_OSC), (FLOR_BLANCA, FLOR_AMARILLA),
               (FLOR_ROSA, FLOR_AMARILLA)]
    sitios = []
    while len(sitios) < 5:
        x, y = rng.randint(3, T - 4), rng.randint(3, T - 5)
        if all(abs(x - a) + abs(y - b) > 6 for a, b in sitios):
            sitios.append((x, y))
    for i, (x, y) in enumerate(sitios):
        pet, cen = colores[(i + variante) % len(colores)]
        _flor(p, x, y, pet, cen, HIERBA_OSC)
    return im


def _guijarro(p, x, y, rx, ry):
    p.elipse(x, y, rx + 1, ry + 1, GUIJARRO_CONT)
    p.elipse(x, y, rx, ry, GUIJARRO)
    p.set(x - rx + 1, y - ry + 1, GUIJARRO_CLA)
    p.set(x - rx + 2, y - ry + 1, GUIJARRO_CLA)


def hierba_piedras(variante):
    im = hierba(variante + 11)
    p = Pincel(im)
    rng = A.rng_de('piedras', variante)
    for i in range(2 + variante % 2):
        x, y = rng.randint(6, T - 7), rng.randint(6, T - 7)
        _guijarro(p, x, y, rng.choice([2, 3]), 2)
    return im


def tierra(variante):
    im = nueva()
    p = Pincel(im)
    p.rect(0, 0, T - 1, T - 1, TIERRA)
    rng = A.rng_de('tierra', variante)
    # Terrones: manchas de 2-4 px, pocas y grandes, con su luz encima.
    for i in range(4 + variante % 3):
        x, y = rng.randint(3, T - 5), rng.randint(3, T - 5)
        w, hh = rng.choice([2, 3, 4]), rng.choice([1, 2])
        p.rect(x, y, x + w - 1, y + hh - 1, TIERRA_OSC)
        p.linea_h(x, x + w - 1, y - 1, TIERRA_CLA)
    for i in range(3):
        x, y = rng.randint(2, T - 3), rng.randint(2, T - 3)
        p.set(x, y, TIERRA_OSC2)
    if variante % 2 == 1:
        _guijarro(p, rng.randint(8, T - 9), rng.randint(8, T - 9), 2, 1)
    return im


def arena(variante):
    im = nueva()
    p = Pincel(im)
    p.rect(0, 0, T - 1, T - 1, ARENA)
    rng = A.rng_de('arena', variante)
    # Ondas del viento: arcos cortos de un pixel.
    for i in range(2 if variante % 2 else 1):
        x, y = rng.randint(4, T - 12), rng.randint(4, T - 5)
        largo = rng.randint(6, 9)
        for k in range(largo):
            dy = -1 if 1 <= k < largo - 1 else 0
            p.set(x + k, y + dy, ARENA_OSC)
            if 2 <= k < largo - 2:
                p.set(x + k, y + dy - 1, ARENA_CLA)
    for i in range(2 + variante % 2):
        p.set(rng.randint(2, T - 3), rng.randint(2, T - 3), ARENA_CLA)
    return im


def _losa_pixel(x, y, variante):
    """
    Color de una baldosa de la plaza en (x, y). 2x2 losas por casilla, con la
    llaga en la columna 0 y la fila 0 (y en la 16): asi cada casilla trae SU
    llaga de la izquierda y de arriba y el suelo cierra solo.
    """
    lx, ly = x % 16, y % 16
    if lx == 0 or ly == 0:
        return PIEDRA_OSC
    losa = (x // 16) + 2 * (y // 16)
    cara = PIEDRA_M if (losa + variante) % 3 else PIEDRA
    if lx == 1 or ly == 1:
        return PIEDRA_CLA
    if lx == 15 or ly == 15:
        return A.mezcla(cara, PIEDRA_OSC, 0.45)
    return cara


def losa(variante):
    im = nueva()
    p = Pincel(im)
    for y in range(T):
        for x in range(T):
            p.set(x, y, _losa_pixel(x, y, variante))
    rng = A.rng_de('losa', variante)
    # Una grieta en alguna losa, y alguna esquina mellada.
    if variante in (2, 3):
        x, y = rng.randint(4, 11) + 16 * rng.randint(0, 1), rng.randint(4, 11) + 16 * rng.randint(0, 1)
        for k in range(rng.randint(4, 7)):
            p.set(x + k, y + (k // 2) * (1 if variante % 4 else -1), PIEDRA_OSC2)
    if variante >= 2:
        cx = 16 * rng.randint(0, 1) + 14
        cy = 16 * rng.randint(0, 1) + 14
        p.set(cx, cy, PIEDRA_OSC)
        p.set(cx - 1, cy, PIEDRA_OSC)
        p.set(cx, cy - 1, PIEDRA_OSC)
    return im


def agua(variante):
    im = nueva()
    p = Pincel(im)
    p.rect(0, 0, T - 1, T - 1, AGUA)
    rng = A.rng_de('agua', variante)
    for i in range(3):
        x, y = rng.randint(3, T - 9), rng.randint(3, T - 4)
        largo = rng.randint(3, 6)
        p.linea_h(x, x + largo - 1, y, AGUA_CLA)
        p.linea_h(x + 1, x + largo, y + 1, AGUA_OSC)
    return im


# ===========================================================================
# TRANSICIONES (Wang de esquinas)
# ===========================================================================

def _nucleo_gauss(sigma, radio):
    xs = np.arange(-radio, radio + 1)
    k = np.exp(-(xs * xs) / (2.0 * sigma * sigma))
    return k / k.sum()


_NUCLEO = _nucleo_gauss(4.6, 12)
_MARGEN = 16


def mascara_wang(nw, ne, sw, se, semilla, rugosidad=0.26):
    """
    Devuelve (dentro, ext): `dentro` es la mascara 32x32 del terreno B y `ext`
    la misma mascara con 2 px de borde fuera de la casilla, para que los
    rebordes se vean iguales desde las dos casillas vecinas.
    """
    n = T + 2 * _MARGEN
    esquinas = {(0, 0): nw, (1, 0): ne, (0, 1): sw, (1, 1): se}
    dueno = np.zeros((n, n))
    for y in range(n):
        for x in range(n):
            tx = x - _MARGEN + 0.5
            ty = y - _MARGEN + 0.5
            dueno[y, x] = esquinas[(0 if tx < T / 2 else 1, 0 if ty < T / 2 else 1)]
    # Suavizado separable.
    m = np.apply_along_axis(lambda r: np.convolve(r, _NUCLEO, mode='same'), 1, dueno)
    m = np.apply_along_axis(lambda c: np.convolve(c, _NUCLEO, mode='same'), 0, m)

    rng = A.rng_de('wang', semilla)
    fases = [rng.random() * 2 * math.pi for _ in range(6)]
    def ruido_borde(x, y):
        u, v = (x + 0.5) / T, (y + 0.5) / T
        r = (math.sin(2 * math.pi * (2 * u) + fases[0]) * math.sin(2 * math.pi * (1 * v) + fases[1]) +
             0.6 * math.sin(2 * math.pi * (3 * u) + fases[2]) * math.cos(2 * math.pi * (2 * v) + fases[3]) +
             0.4 * math.cos(2 * math.pi * (1 * u + 2 * v) + fases[4]))
        # Se apaga a 4 px de cada borde: ahi manda la regla comun.
        d = min(x + 0.5, T - x - 0.5, y + 0.5, T - y - 0.5)
        ventana = max(0.0, min(1.0, (d - 2.0) / 5.0))
        return r / 2.0 * ventana

    ext = np.zeros((T + 4, T + 4), dtype=bool)
    for y in range(-2, T + 2):
        for x in range(-2, T + 2):
            v = m[y + _MARGEN, x + _MARGEN]
            if 0 <= x < T and 0 <= y < T:
                v += rugosidad * ruido_borde(x, y)
            ext[y + 2, x + 2] = v > 0.5
    return ext[2:-2, 2:-2], ext


def transicion(nw, ne, sw, se, relleno_a, relleno_b, estilo, semilla):
    """
    Casilla de transicion de A a B. `relleno_a`/`relleno_b` son casillas
    enteras de cada terreno (las mismas que van solas en el tileset, para que
    la pieza case con ellas). `estilo` dice como se pinta la linea entre los
    dos: orilla, borde de camino, llaga de la plaza...
    """
    dentro, ext = mascara_wang(nw, ne, sw, se, semilla)
    pa, pb = relleno_a.load(), relleno_b.load()
    im = nueva()
    p = Pincel(im)
    for y in range(T):
        for x in range(T):
            p.set(x, y, pb[x, y] if dentro[y, x] else pa[x, y])

    def es_b(x, y):
        return bool(ext[y + 2, x + 2])

    def dist_al_otro(x, y, b, maximo):
        """Distancia (en anillos) al pixel del otro terreno mas cercano."""
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
            if estilo == 'agua':
                if b:
                    c = ESPUMA if d == 1 else AGUA_ORILLA
                elif d == 1:
                    c = HIERBA_BORDE
            elif estilo == 'agua_arena':
                if b:
                    c = ESPUMA if d == 1 else AGUA_ORILLA
                elif d == 1:
                    c = ARENA_OSC
            elif estilo == 'tierra':
                if b and d == 1:
                    c = TIERRA_LINEA
                elif not b and d == 1:
                    c = HIERBA_OSC
            elif estilo == 'losa':
                if b and d == 1:
                    c = PIEDRA_OSC2
                elif not b and d == 1:
                    c = HIERBA_OSC
            elif estilo == 'arena':
                if b and d == 1:
                    c = ARENA_OSC
                elif not b and d == 1:
                    c = HIERBA_OSC
            if c is not None:
                p.set(x, y, c)
    return im


# ===========================================================================
# MUROS (cara de arriba + frente, con tapa en la casilla de encima)
# ===========================================================================
#
#  La HUELLA de un muro es su casilla entera (es lo que choca). Lo que se ve
#  es un bloque: la cara de arriba ocupa la casilla y sube TAPA px por encima
#  (en la casilla de arriba, como pieza aparte) y el frente baja FRENTE px por
#  la parte de abajo de la casilla cuando no hay muro al sur. Con eso el muro
#  "tiene alto" y el y-sort del cliente tapa bien al perro que pasa por detras.

FRENTE = 12
TAPA = 12
HUECO = 2          # lo que se mete el muro por un lado sin vecino


def _cara_piedra(x, yrel):
    """Cara de arriba del muro de piedra: hileras de bloques con traba."""
    fila = (yrel // 8)
    ly = yrel % 8
    desfase = 8 if fila % 2 else 0
    lx = (x + desfase) % 16
    base = H('a59d8e')
    # Bloque a bloque cambia un poco el tono (funcion de la posicion).
    bloque = ((x + desfase) // 16) * 7 + fila * 3
    if bloque % 5 == 0:
        base = H('9d9585')
    elif bloque % 5 == 3:
        base = H('aca596')
    if ly == 7 or lx == 15:
        return H('7d7568')
    if ly == 0 or lx == 0:
        return H('c2baa9')
    return base


def _frente_piedra(x, yf):
    """Frente del muro (yf = 0 arriba del frente)."""
    fila = yf // 6
    ly = yf % 6
    desfase = 6 if fila % 2 else 0
    lx = (x + desfase) % 12
    if ly == 5 or lx == 11:
        return PIEDRA_OSC2
    if ly == 0:
        return H('857d70')
    return H('6f685d')


def _cara_seto(x, yrel):
    v = onda(x, yrel, 'seto', k=((2, 2), (3, 1), (1, 3), (4, 3)))
    w = ruido(x % T, yrel % T, 77)
    if v > 0.42 or (v > 0.30 and w > 0.6):
        return HIERBA_CLA if w > 0.5 else HIERBA
    if v < -0.40:
        return SETO_OSC
    if v < -0.18 and w > 0.55:
        return SETO_OSC
    return HIERBA if v > 0.12 else SETO


def _frente_seto(x, yf):
    v = onda(x, yf, 'seto-frente', k=((3, 1), (2, 2), (5, 1)))
    if yf <= 1:
        return SETO
    if v > 0.35:
        return SETO_OSC
    if v < -0.35:
        return SETO_OSC2
    return SETO_SOMBRA


def _cara_empalizada(x, yrel):
    """
    La empalizada es una LENERA: troncos apilados a lo largo del muro. Desde
    arriba se ve la corteza de los de encima (bandas de 8 px, periodo 32), y
    por delante las puntas cortadas (los aros, en `_frente_empalizada`).
    Antes eran aros tambien por arriba y se leia como una cesta.
    """
    ly = yrel % 8
    if ly == 7:
        return H('3d2a19')                       # la rendija entre dos troncos
    if ly == 0:
        return H('b07f45')                       # el lomo, con luz
    if ly == 6:
        return H('6e4a27')
    # vetas de la corteza: trazos cortos, desfasados por banda
    banda = (yrel // 8) % 4
    v = (x + banda * 11) % 13
    if v in (3, 4, 5) and ly in (2, 3):
        return H('7c5429')
    if v in (9, 10) and ly == 4:
        return H('7c5429')
    return MADERA


def _frente_empalizada(x, yf):
    """Las puntas de los troncos: dos filas de aros de 6 px."""
    fila = yf // 6
    desfase = 3 if fila % 2 else 0
    cx = ((x + desfase) % 6) - 2.5
    cy = (yf % 6) - 2.5
    d = math.sqrt(cx * cx + cy * cy)
    if d > 3.0:
        return H('3d2a19')
    if d > 2.2:
        return H('6e4a27')
    if d < 0.9:
        return H('a87436')
    return MADERA_TOPE


MUROS = {
    'piedra': {
        'cara': _cara_piedra, 'frente': _frente_piedra,
        'contorno': H('3c3730'), 'labio': H('d2cbbb'),
    },
    'seto': {
        'cara': _cara_seto, 'frente': _frente_seto,
        'contorno': H('16351c'), 'labio': HIERBA_CLA,
    },
    'empalizada': {
        'cara': _cara_empalizada, 'frente': _frente_empalizada,
        'contorno': CONTORNO_MADERA, 'labio': MADERA_TOPE,
    },
}


def muro(tipo, n, e, s, o):
    """Cuerpo de un muro con vecinos (n, e, s, o) del MISMO tipo."""
    cfg = MUROS[tipo]
    im = nueva()
    p = Pincel(im)
    x0 = 0 if o else HUECO
    x1 = T - 1 if e else T - 1 - HUECO
    y_cara_fin = T - 1 if s else T - 1 - FRENTE
    for y in range(0, y_cara_fin + 1):
        for x in range(x0, x1 + 1):
            p.set(x, y, cfg['cara'](x, y))
    if not s:
        for y in range(y_cara_fin + 1, T):
            for x in range(x0, x1 + 1):
                p.set(x, y, cfg['frente'](x, y - y_cara_fin - 1))
        # El labio: la arista entre la cara y el frente, con luz.
        p.linea_h(x0, x1, y_cara_fin, cfg['labio'])
        # Base: el frente toca el suelo con su contorno.
        p.linea_h(x0, x1, T - 1, cfg['contorno'])
    # Contorno de los lados sin vecino.
    if not o:
        p.linea_v(x0, 0, T - 1, cfg['contorno'])
    if not e:
        p.linea_v(x1, 0, T - 1, cfg['contorno'])
    # Esquinas redondeadas abajo.
    if not s:
        if not o:
            p.set(x0, T - 1, TRANSP)
            p.set(x0 + 1, T - 1, cfg['contorno'])
        if not e:
            p.set(x1, T - 1, TRANSP)
            p.set(x1 - 1, T - 1, cfg['contorno'])
    return im


def tapa_muro(tipo, e, o):
    """
    Tapa de un muro: va en la casilla de ENCIMA de un muro que no tiene muro
    al norte, ocupando sus TAPA px de abajo. Continua la cara de arriba.
    """
    cfg = MUROS[tipo]
    im = nueva()
    p = Pincel(im)
    x0 = 0 if o else HUECO
    x1 = T - 1 if e else T - 1 - HUECO
    y0 = T - TAPA
    for y in range(y0, T):
        for x in range(x0, x1 + 1):
            # yrel negativo: la cara sigue hacia arriba desde la casilla de abajo.
            p.set(x, y, cfg['cara'](x, y - T))
    p.linea_h(x0, x1, y0, cfg['contorno'])
    p.linea_h(x0 + (0 if o else 1), x1 - (0 if e else 1), y0 + 1, cfg['labio'])
    if not o:
        p.linea_v(x0, y0, T - 1, cfg['contorno'])
        p.set(x0, y0, TRANSP)
    if not e:
        p.linea_v(x1, y0, T - 1, cfg['contorno'])
        p.set(x1, y0, TRANSP)
    return im


# ===========================================================================
# ARBUSTOS (hierba alta donde esconderse)
# ===========================================================================
#
#  Se distinguen del seto a primera vista, que es lo que importa en una
#  arena: el seto es un bloque oscuro y recortado CON FRENTE (choca), el
#  arbusto es hierba alta, mas clara y con las puntas al aire (se atraviesa
#  y esconde).

ARB_BASE, ARB_OSC, ARB_CLA, ARB_PUNTA = H('4c9a46'), H('2f6b33'), H('7cc464'), H('b2dc6e')


PAL_ARBUSTO = (ARB_OSC, ARB_BASE, ARB_CLA, ARB_PUNTA)
CONTORNO_ARBUSTO = H('1f4a24')


def _hojas_arbusto(p, x0, x1, y0, y1, semilla, solo_puntas_desde=None, pal=PAL_ARBUSTO):
    """
    Siembra hojas con base en [x0..x1] x [y0..y1]. Cada hoja sube de 7 a 11 px
    desde su base, oscura abajo y clara arriba. Las bases salen de una rejilla
    de periodo 32 con jitter, asi que dos casillas pegadas siguen el mismo
    campo.
    """
    hojas = []
    for gy in range(-8, T + 8, 4):
        for gx in range(-4, T + 4, 4):
            r = ruido(gx % T, gy % T, semilla)
            bx = gx + int(r * 4)
            by = gy + int(ruido(gy % T, gx % T, semilla + 1) * 4)
            alto = 7 + int(ruido(bx % T, by % T, semilla + 2) * 5)
            lado = 1 if r > 0.5 else -1
            hojas.append((by, bx, alto, lado))
    hojas.sort()
    for by, bx, alto, lado in hojas:
        if not (x0 <= bx <= x1 and y0 <= by <= y1):
            continue
        for k in range(alto):
            x = bx + (lado if k > alto * 0.6 else 0)
            y = by - k
            if solo_puntas_desde is not None and y >= solo_puntas_desde:
                continue
            t = k / float(alto)
            c = pal[0] if t < 0.25 else (pal[1] if t < 0.62 else (pal[2] if t < 0.88 else pal[3]))
            p.set(x, y, c)


def arbusto(n, e, s, o, pal=PAL_ARBUSTO, contorno=CONTORNO_ARBUSTO):
    """`pal` = (oscuro, base, claro, punta): la misma mata vale para la hierba
    alta, el pino nevado y el matorral seco del desierto."""
    im = nueva()
    p = Pincel(im)
    x0 = 0 if o else 3
    x1 = T - 1 if e else T - 4
    y_fin = T - 1 if s else T - 3
    # Base: la mata llena el centro; los lados sin vecino se deshilachan.
    for y in range(0, y_fin + 1):
        for x in range(x0, x1 + 1):
            p.set(x, y, pal[1] if (x + y) % 7 else pal[0])
    _hojas_arbusto(p, x0 - 2, x1 + 2, 2, y_fin + 6, 31, pal=pal)
    # Sombra al pie, si no sigue al sur.
    if not s:
        p.linea_h(x0 + 1, x1 - 1, y_fin, pal[0])
    pincel = Pincel(im)
    # Contorno oscuro suave alrededor de lo que asoma.
    pincel.contornear(contorno)
    return im


def tapa_arbusto(e, o, pal=PAL_ARBUSTO, contorno=CONTORNO_ARBUSTO):
    """Las puntas que asoman por encima de una mata sin mata al norte."""
    im = nueva()
    p = Pincel(im)
    x0 = 0 if o else 3
    x1 = T - 1 if e else T - 4
    # Las hojas nacen en la casilla de abajo (by >= 32) y se ven aqui arriba.
    for y in range(T - 3, T):
        for x in range(x0, x1 + 1):
            p.set(x, y, pal[1] if (x + y) % 7 else pal[0])
    _hojas_arbusto(p, x0 - 2, x1 + 2, T, T + 12, 31, pal=pal)
    Pincel(im).contornear(contorno)
    return im


# ===========================================================================
# OBJETOS
# ===========================================================================

def caja(estado):
    """
    Caja de madera rompible, en 3/4: tapa clara arriba y frente de tablas.
    estado 0 = entera, 1 = astillada, 2 = rota (los restos en el suelo).
    """
    im = nueva()
    p = Pincel(im)
    x0, x1 = 4, 27
    if estado < 2:
        y_tapa0, y_tapa1, y_fin = 5, 13, 28
        # tapa
        p.rect(x0, y_tapa0, x1, y_tapa1, H('c9975a'))
        for x in range(x0 + 2, x1 - 1, 6):
            p.linea_v(x + 4, y_tapa0 + 1, y_tapa1 - 1, H('a87436'))
        p.linea_h(x0, x1, y_tapa0, MADERA_TOPE)
        # frente
        p.rect(x0, y_tapa1 + 1, x1, y_fin, H('b07f45'))
        for y in range(y_tapa1 + 4, y_fin, 5):
            p.linea_h(x0 + 1, x1 - 1, y, MADERA_OSC)
        # marco
        p.rect(x0, y_tapa1 + 1, x0 + 2, y_fin, MADERA)
        p.rect(x1 - 2, y_tapa1 + 1, x1, y_fin, MADERA)
        p.linea_h(x0, x1, y_tapa1 + 1, MADERA)
        # aspa del frente
        for k in range(0, x1 - x0 - 5):
            xx = x0 + 3 + k
            yy = y_tapa1 + 2 + int(k * (y_fin - y_tapa1 - 3) / float(x1 - x0 - 6))
            p.set(xx, yy, MADERA)
            p.set(xx, yy + 1, H('6e4a27'))
        # clavos
        for (cx, cy) in ((x0 + 1, y_tapa1 + 3), (x1 - 1, y_tapa1 + 3), (x0 + 1, y_fin - 2), (x1 - 1, y_fin - 2)):
            p.set(cx, cy, H('d6d6d0'))
        if estado == 1:
            # grietas y una tabla saltada
            for k in range(6):
                p.set(x0 + 8 + k, y_tapa1 + 6 + (k % 3), H('3a2516'))
            for k in range(5):
                p.set(x1 - 7 + (k % 2), y_tapa0 + 2 + k, H('6e4a27'))
            p.rect(x0 + 12, y_fin - 6, x0 + 17, y_fin - 4, H('3a2516'))
        Pincel(im).contornear(CONTORNO_MADERA)
    else:
        rng = A.rng_de('caja-rota')
        for i in range(7):
            x = rng.randint(x0, x1 - 6)
            y = rng.randint(18, 27)
            largo = rng.randint(4, 8)
            c = rng.choice([H('b07f45'), H('c9975a'), MADERA])
            for k in range(largo):
                p.set(x + k, y + (k // 4) * (1 if i % 2 else -1), c)
                p.set(x + k, y + 1 + (k // 4) * (1 if i % 2 else -1), H('6e4a27'))
        Pincel(im).contornear(CONTORNO_MADERA)
    return im


def _hueso(p, cx, cy, largo=14, cuerpo=HUESO, sombra=HUESO_OSC):
    """Hueso horizontal centrado en (cx, cy): dos nudos en cada punta."""
    x0, x1 = cx - largo // 2, cx + largo // 2
    p.rect(x0 + 2, cy - 1, x1 - 2, cy + 1, cuerpo)
    for x in (x0 + 1, x1 - 1):
        p.elipse(x, cy - 2, 2.2, 2.2, cuerpo)
        p.elipse(x, cy + 2, 2.2, 2.2, cuerpo)
    p.linea_h(x0 + 2, x1 - 2, cy + 1, sombra)


def caja_oro(estado):
    """Caja reforzada con el hueso dorado: al romperse suelta un potenciador."""
    im = nueva()
    p = Pincel(im)
    x0, x1 = 3, 28
    y_tapa0, y_tapa1, y_fin = 4, 12, 28
    p.rect(x0, y_tapa0, x1, y_tapa1, H('7a5530'))
    p.linea_h(x0, x1, y_tapa0, H('a87436'))
    p.rect(x0, y_tapa1 + 1, x1, y_fin, MADERA_OSC)
    for y in range(y_tapa1 + 4, y_fin, 5):
        p.linea_h(x0 + 1, x1 - 1, y, H('46301d'))
    # herrajes dorados
    for x in (x0, x0 + 1, x1 - 1, x1):
        p.linea_v(x, y_tapa0, y_fin, ORO_OSC)
    p.linea_h(x0, x1, y_tapa1 + 1, ORO)
    p.linea_h(x0, x1, y_fin, ORO_OSC)
    p.linea_h(x0 + 2, x1 - 2, y_tapa0 + 1, ORO_CLA)
    # emblema: hueso dorado en el frente
    _hueso(p, (x0 + x1) // 2 + 1, (y_tapa1 + y_fin) // 2 + 1, 14, ORO, ORO_OSC)
    if estado == 1:
        for k in range(7):
            p.set(x0 + 4 + k, y_tapa1 + 4 + (k % 3), H('1f140a'))
        p.rect(x1 - 7, y_tapa0 + 2, x1 - 4, y_tapa0 + 4, H('3a2516'))
    Pincel(im).contornear(CONTORNO_MADERA)
    return im


def hueso_potenciador():
    """El hueso que sueltan las cajas doradas y los caidos: +daño y +vida."""
    im = nueva()
    p = Pincel(im)
    _hueso(p, 16, 16, 20)
    Pincel(im).contornear(HUESO_CONT)
    return im


def base_aparicion():
    """Circulo de piedra con una huella: donde aparece cada luchador."""
    im = nueva()
    p = Pincel(im)
    p.elipse(16, 16.5, 14, 11, H('6f685d'))
    p.elipse(16, 16, 13, 10, PIEDRA_M)
    p.elipse(16, 15, 11, 8, H('a59d8e'))
    # huella
    huella = H('6f685d')
    p.elipse(16, 17, 3.5, 3, huella)
    for dx, dy in ((-4, -2), (-1.5, -5), (1.5, -5), (4, -2)):
        p.elipse(16 + dx, 17 + dy, 1.4, 1.6, huella)
    return im


def roca_agua():
    im = nueva()
    p = Pincel(im)
    p.elipse(16, 20, 10, 5, ESPUMA)
    p.elipse(16, 17, 8, 6, H('6f685d'))
    p.elipse(15, 15, 7, 5, PIEDRA_M)
    p.elipse(13, 13, 3, 2, PIEDRA_CLA)
    return im


def nenufar(variante):
    im = nueva()
    p = Pincel(im)
    rng = A.rng_de('nenufar', variante)
    for i in range(1 + variante):
        cx, cy = rng.randint(9, 22), rng.randint(9, 22)
        r = rng.choice([4, 5])
        p.elipse(cx, cy, r + 1, r * 0.8 + 1, H('2b6a3a'))
        p.elipse(cx, cy, r, r * 0.8, H('4f9a4a'))
        # muesca
        for k in range(r):
            p.set(cx + k, cy - k // 2, AGUA)
        p.set(cx - 1, cy - 1, H('7cc464'))
        if i == 0 and variante == 1:
            _flor(p, cx - 1, cy + 1, H('f4c2e6'), FLOR_AMARILLA)
    return im


def puente(eje, parte, lado):
    """
    Puente de tablas de DOS casillas de ancho. eje 'v' = se cruza de norte a
    sur; 'h' = de oeste a este. parte 0 = arranque, 1 = tramo, 2 = final.
    lado 0 = la mitad izquierda (o de arriba), lado 1 = la derecha (o de
    abajo): la barandilla va solo por FUERA, asi que las dos mitades juntas
    son un puente y no dos pasarelas con una raya en medio. Fuera de las
    tablas es transparente: se ve el agua del suelo.
    """
    im = nueva()
    p = Pincel(im)
    tabla, tabla_cla, ranura = H('b07f45'), H('c9975a'), MADERA_OSC
    poste, oscuro = MADERA_OSC, H('46301d')
    fuera = 4                                     # lo que ocupa la barandilla
    if eje == 'v':
        x0 = fuera if lado == 0 else 0
        x1 = T - 1 if lado == 0 else T - 1 - fuera
        for y in range(T):
            ly = y % 6
            c = ranura if ly == 5 else (tabla_cla if ly == 0 else tabla)
            p.linea_h(x0, x1, y, c)
        xr = x0 - 2 if lado == 0 else x1 + 1     # la barandilla
        p.rect(xr, 0, xr + 1, T - 1, poste)
        p.linea_v(xr - 1 if lado == 0 else xr + 2, 0, T - 1, CONTORNO_MADERA)
        for yy in (2, 18):
            p.rect(xr - (1 if lado == 0 else 0), yy, xr + (1 if lado == 1 else 0) + 1, yy + 3, oscuro)
        if parte in (0, 2):
            yy = 0 if parte == 0 else T - 5
            p.rect(xr - (1 if lado == 0 else 0), yy, xr + 2, yy + 4, oscuro)
    else:
        y0 = fuera if lado == 0 else 0
        y1 = T - 1 if lado == 0 else T - 1 - fuera
        for x in range(T):
            lx = x % 6
            c = ranura if lx == 5 else (tabla_cla if lx == 0 else tabla)
            p.linea_v(x, y0, y1, c)
        yr = y0 - 2 if lado == 0 else y1 + 1
        p.rect(0, yr, T - 1, yr + 1, poste)
        p.linea_h(0, T - 1, yr - 1 if lado == 0 else yr + 2, CONTORNO_MADERA)
        for xx in (2, 18):
            p.rect(xx, yr - (1 if lado == 0 else 0), xx + 3, yr + (1 if lado == 1 else 0) + 1, oscuro)
        if parte in (0, 2):
            xx = 0 if parte == 0 else T - 5
            p.rect(xx, yr - (1 if lado == 0 else 0), xx + 4, yr + 2, oscuro)
    return im


# ── Decoracion suelta (va en la capa 'deco', encima del suelo) ─────────────

def deco_flores(variante):
    im = nueva()
    p = Pincel(im)
    rng = A.rng_de('deco-flores', variante)
    paletas = [(FLOR_AMARILLA, FLOR_AMARILLA_OSC), (FLOR_BLANCA, FLOR_AMARILLA),
               (FLOR_ROSA, FLOR_AMARILLA), (H('8fb8ff'), FLOR_BLANCA)]
    pet, cen = paletas[variante % 4]
    sitios = []
    while len(sitios) < 3 + variante % 2:
        x, y = rng.randint(6, 25), rng.randint(6, 25)
        if all(abs(x - a) + abs(y - b) > 5 for a, b in sitios):
            sitios.append((x, y))
    for x, y in sitios:
        p.set(x, y + 1, HIERBA_OSC)
        p.set(x, y + 2, HIERBA_OSC)
        _flor(p, x, y - 1, pet, cen)
    return im


def deco_piedras(variante):
    im = nueva()
    p = Pincel(im)
    rng = A.rng_de('deco-piedras', variante)
    for i in range(2 + variante):
        _guijarro(p, rng.randint(8, 23), rng.randint(8, 23), rng.choice([2, 3]), 2)
    return im


def deco_matas(variante):
    im = nueva()
    p = Pincel(im)
    rng = A.rng_de('deco-matas', variante)
    _brotes(p, rng, 3 + variante, HIERBA_CLA, HIERBA_OSC, margen=6)
    return im


def deco_setas(variante):
    im = nueva()
    p = Pincel(im)
    rng = A.rng_de('deco-setas', variante)
    sitios = []
    while len(sitios) < 2 + variante:
        x, y = rng.randint(8, 23), rng.randint(10, 23)
        if all(abs(x - a) + abs(y - b) > 8 for a, b in sitios):
            sitios.append((x, y))
    for x, y in sitios:
        p.rect(x - 1, y, x, y + 3, H('efe6d2'))
        p.set(x, y + 3, H('c9bfa8'))
        sombrero = H('c8352f') if variante == 0 else H('e2a83a')
        p.elipse(x - 0.5, y, 3.2, 2.2, sombrero)
        p.set(x - 2, y - 1, FLOR_BLANCA)
        p.set(x + 1, y, FLOR_BLANCA)
    Pincel(im).contornear(H('2a0d0c'))
    return im


def deco_hojas(variante):
    im = nueva()
    p = Pincel(im)
    rng = A.rng_de('deco-hojas', variante)
    colores = [H('d98b2b'), H('e6b23a'), H('b5532a')]
    for i in range(4 + variante):
        x, y = rng.randint(6, 25), rng.randint(6, 25)
        c = colores[(i + variante) % 3]
        p.set(x, y, c); p.set(x + 1, y, c); p.set(x, y + 1, c)
        p.set(x + 1, y + 1, A.mezcla(c, H('5b3d27'), 0.4))
    return im


def deco_grieta(variante):
    im = nueva()
    p = Pincel(im)
    rng = A.rng_de('deco-grieta', variante)
    x, y = rng.randint(5, 10), rng.randint(8, 22)
    for k in range(16 + variante * 4):
        p.set(x, y, PIEDRA_OSC2)
        x += 1
        if rng.random() < 0.45:
            y += rng.choice([-1, 1])
        if k == 7:
            bx, by = x, y
            for j in range(4):
                p.set(bx + j // 2, by + j, PIEDRA_OSC2)
    return im


def tocon():
    im = nueva()
    p = Pincel(im)
    p.elipse(16, 22, 9, 4, H('2b4f2e'))
    p.rect(9, 13, 22, 21, H('8a5c37'))
    p.linea_v(10, 13, 21, H('a8744a'))
    p.linea_v(21, 13, 21, H('674529'))
    p.elipse(15.5, 13, 7, 3, H('c9a06a'))
    p.elipse(15.5, 13, 4, 1.6, H('a87c4a'))
    Pincel(im).contornear(H('3a2516'))
    return im


def charco():
    im = nueva()
    p = Pincel(im)
    p.elipse(16, 17, 10, 5, H('3d7f9e'))
    p.elipse(15, 16, 8, 3.5, AGUA)
    p.linea_h(11, 15, 15, AGUA_CLA)
    return im
