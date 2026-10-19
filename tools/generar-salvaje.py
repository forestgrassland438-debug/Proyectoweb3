#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
EL MAPA SALVAJE (zona 5024: neutral + PvP)                       (2026-10-11)
=============================================================================

"Entre el medio, al lado izquierdo, en la esquina del mapa de GameScene hay un
camino: quiero otro mapa 5008 allí, una zona PvP donde los usuarios se puedan
dar espadazos o, si arrastran un recurso hacia afuera, soltarlo para que otro
lo tome; con monstruos; respetando las reglas de los mapas de casillas y el
tamaño del personaje; con climas como GameScene; con los árboles nuevos de
tileset_nuevos/arboles; y con 3 caminos para más mapas a futuro."

SEGUNDA VERSIÓN: EL SUELO DEL PUEBLO                              (2026-10-11)
"El mapa nuevo debe ir también recortado como la mina y los demás mapas; el
agua debe ser como la de GameScene, y también su piso; y no tiene el monte."

  · Antes era una capa de casillas de 32 con el atlas lands_pradera_32: otro
    dibujo, otra agua (azul plano) y sin trozos. Ahora el suelo se COMPONE con
    el tileset del pueblo (Game/MAPAS/tiles.png, 16 px) y sus mismas reglas,
    aprendidas leyendo Maps/mapa_principal.json:
      - hierba y tierra van por ESQUINAS (cada casilla mira sus cuatro
        vértices; el pueblo cumple ese modelo en un 98 %); nunca dos esquinas
        cruzadas (no hay pieza para eso en el tileset);
      - el agua y su orilla van por los OCHO VECINOS: la orilla de tierra con
        su terraplén de dos casillas, la espuma de los lados y las esquinas;
      - la piedra va en bloques con su bordillo (las nueve piezas de los
        bloques del pueblo) y el camino de ladrillo con el mismo dibujo de 4x4
        y la misma FASE que el camino del borde oeste del pueblo, del que sale.
  · Ese suelo se pinta entero (--captura), se le pasa el detalle del pueblo
    (tools/detallar-captura-mapa.py) y se trocea (tools/trocear-escena.py) en
    recortadas_salvaje/, como la mina y la isla. La capa de casillas se queda
    en el mapa: de ella leen el agua animada (gf-agua.js, 'rio'), la pesca y
    los pasos.
  · El puente es un dibujo aparte (Game/MAPAS/salvaje/puente*.png), encima del
    agua que se mueve: el agua sigue debajo, como en un río de verdad.
  · El monte (gf-monte.js): Maps/monte_salvaje.json, solo sobre hierba.

LAS REGLAS QUE SIGUEN VALIENDO
  · El personaje mide 46 x 102 px: los caminos tienen 8-10 casillas de 16
    (128-160 px) y el puente 160 px de tablero, para que dos se crucen.
  · Los árboles (tileset_nuevos/arboles) van a 1.3: 166 x 208 px.
  · Mapa de 314 x 314 casillas de 16 = 5024 px, como antes (157 de 32).

EL MAPA
  · ESTE: zona NEUTRAL. Se entra del pueblo por el borde este, por el camino
    de ladrillo que sigue al del borde oeste del pueblo (filas 133-144).
    Una plaza de piedra al norte del camino, un sendero norte-sur y un
    estanque.
  · El RÍO (casillas 138-149) parte el mapa de norte a sur; un puente.
    La zona PvP llega hasta x < 2240 (dentro del río), como en el servidor.
  · OESTE: zona PvP. Bosque cerrado, la arena (un claro de tierra con un
    ring de piedra) y otro estanque.
  · Tres salidas a futuros mapas (norte, sur y oeste), cerradas con valla y
    un cartel "Coming soon".

QUÉ ESCRIBE
  Game/MAPAS/salvaje/arboles/<nombre>.png    los árboles elegidos (copias)
  Game/MAPAS/salvaje/puente.png              el tablero y la baranda de atrás
  Game/MAPAS/salvaje/puente_baranda.png      la baranda de delante
  Maps/salvaje.json                           el mapa (capas: suelo, arboles,
       colisiones, salidas, zonas, aparicion, monstruos, carteles, puente)
  Maps/monte_salvaje.json                     el monte
  --captura <png>                             el suelo pintado, para trocear

Determinista (semilla fija). Todo junto:

  python tools/generar-salvaje.py --captura <tmp>/salvaje.png
  python tools/detallar-captura-mapa.py <tmp>/salvaje.png <tmp>/salvaje_det.png
  python tools/trocear-escena.py <tmp>/salvaje_det.png recortadas_salvaje <version>
"""
import json
import math
import os
import random
import shutil
import sys

from PIL import Image, ImageDraw

AQUI = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.dirname(AQUI)
PAQUETE = os.path.join(BIN, '..', 'tileset_nuevos')
T = 16
N = 314
SEMILLA = 20261011
ESCALA_ARBOL = 1.3
VERSION = '20261018b'

TILESET = os.path.join(BIN, 'Game', 'MAPAS', 'tiles.png')
TS_COLS = 90
DESTINO = os.path.join(BIN, 'Game', 'MAPAS', 'salvaje')
MAPA = os.path.join(BIN, 'Maps', 'salvaje.json')
MONTE = os.path.join(BIN, 'Maps', 'monte_salvaje.json')

# Los árboles nuevos que van con un bosque templado (sin hongos ni palmeras).
ARBOLES_ESTE = ['roble_redondo', 'roble_ancho', 'abedul', 'roble_otono', 'cerezo', 'roble_curvado']
ARBOLES_OESTE = ['abeto', 'pino', 'roble_ancho', 'roble_curvado', 'arbol_seco', 'abedul']
ARBOL_RARO = 'arbol_ancestral'

# ── EL TRAZADO (en casillas de 16) ────────────────────────────────────────
RIO_X0, RIO_X1 = 138, 149            # el río, de norte a sur (incluidas): 192 px
CAM_Y0, CAM_Y1 = 133, 144            # el camino de ladrillo: bordillos en 133 y 144
CUERPO_Y0, CUERPO_Y1 = 134, 143      # lo que se pisa del camino (y el sendero del oeste)
PUENTE = (134, 133, 153, 144)        # x0, y0, x1, y1 (el tablero va de 134 a 143)
CAMINO_ESTE_X0 = 152                 # el ladrillo empieza debajo del puente
CRUCE_X0, CRUCE_X1 = 218, 225        # el sendero norte-sur de la zona neutral
PLAZA = (204, 98, 239, 126)          # bloque de piedra al norte del camino
ARENA = (44, 104, 97, 173)           # el claro de la zona PvP
RING = (60, 124, 81, 153)            # el ring de piedra en medio de la arena
ESTANQUE_ESTE = (256, 192, 281, 213)
ESTANQUE_OESTE = (20, 224, 45, 245)

# ── LAS PIEZAS DEL TILESET DEL PUEBLO (gid, firstgid 1) ───────────────────
# Hierba y tierra por esquinas: (NO, NE, SO, SE). Las de cuatro piezas
# seguidas en el tileset son una tira que se repite (por x o por y).
ESQ = {
    'HHHH': [86],
    'TTTT': [179],
    'HTHT': ('y', [2150, 2240, 2330, 2420]),
    'THTH': ('y', [2145, 2235, 2325, 2415]),
    'HHTT': ('x', [2506, 2507, 2508, 2509]),
    'TTHH': ('x', [2056, 2057, 2058, 2059]),
    'THHH': [2241], 'TTTH': [2055], 'HHTH': [2153], 'HTHH': [2244],
    'THTT': [2505], 'TTHT': [2060], 'HHHT': [2152], 'HTTT': [2510],
}
TIERRA_VARIANTES = [179, 179, 179, 179, 179, 268, 178, 269]
MATAS_2X2 = [(2165, 2166, 2255, 2256), (2167, 2168, 2257, 2258)]

# El agua por sus ocho vecinos (N, S, E, O, NE, NO, SE, SO; 1 = agua).
AGUA = {
    'tierra_O': [1607, 1697], 'tierra_E': [1612, 1702], 'tierra_N': [1429, 1430],
    'esq_NO': 1427, 'esq_NE': 1432, 'esq_SO': 1787, 'esq_SE': 1792, 'centro': 1610,
}
# La orilla (tierra) por dónde le queda el agua.
ORILLA = {
    'agua_E': [1606, 1696], 'agua_O': [1613, 1703], 'agua_S': [1339, 1340], 'agua_N': [1879, 1880],
    '00000010': 1336, '01000010': 1337, '00100010': 1426,
    '00000001': 1343, '01000001': 1342, '00010001': 1433,
    '00001000': 1876, '00101000': 1786, '10001000': 1877,
    '00000100': 1883, '00010100': 1793, '10000100': 1882,
}
# A dos casillas del agua: la parte de arriba del terraplén (agua al sur) y
# la tierra lisa del otro lado.
ORILLA2 = {'S': [1249, 1250], 'N': [1969, 1970]}

# Bloque de piedra (las nueve piezas) y el camino de ladrillo.
BLOQUE = {'NO': 611, 'NE': 1694, 'SO': 343, 'SE': 1422,
          'N': [71, 72], 'S': [343, 344], 'O1': 701, 'O': [1151, 1241], 'E1': 1784, 'E': [74, 164]}
LADRILLO = [791, 881, 971, 1061]     # + fase de columna (0-3), por fila


def rect_set(x0, y0, x1, y1):
    return {(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)}


def rectangulos(celdas):
    """Rectángulos (en casillas) que cubren `celdas`: tiras horizontales que se
    funden hacia abajo si tienen el mismo ancho."""
    filas = {}
    for (x, y) in celdas:
        filas.setdefault(y, set()).add(x)
    tiras = []
    for y in sorted(filas):
        xs = sorted(filas[y])
        ini = prev = xs[0]
        for x in xs[1:] + [None]:
            if x is not None and x == prev + 1:
                prev = x
                continue
            tiras.append([ini, y, prev, y])
            if x is not None:
                ini = prev = x
    abiertos = {}
    salida = []
    for t in sorted(tiras, key=lambda r: (r[1], r[0])):
        clave = (t[0], t[2])
        prev = abiertos.get(clave)
        if prev and prev[3] == t[1] - 1:
            prev[3] = t[1]
        else:
            r = list(t)
            abiertos[clave] = r
            salida.append(r)
    return salida


def ruido_valor(semilla, paso):
    """Ruido de valor suave en [0, 1] sobre la rejilla de casillas."""
    r = random.Random(semilla)
    gn = N // paso + 3
    g = [[r.random() for _ in range(gn)] for _ in range(gn)]
    def f(x, y):
        fx, fy = x / paso, y / paso
        x0, y0 = int(fx), int(fy)
        tx, ty = fx - x0, fy - y0
        tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty)
        a, b, c, d = g[y0][x0], g[y0][x0 + 1], g[y0 + 1][x0], g[y0 + 1][x0 + 1]
        return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty
    return f


# ─────────────────────────────────────────────────────────────── EL PUENTE
MADERA = {'perfil': (52, 33, 18), 'oscura': (84, 56, 31), 'media': (112, 78, 43),
          'clara': (138, 99, 55), 'luz': (163, 121, 70), 'brillo': (185, 143, 85)}


def dibujar_puente():
    """El tablero y la baranda de atrás (puente.png) y la de delante
    (puente_baranda.png). Tablas de canto que van de orilla a orilla, con su
    veta en trazos largos: nada de clavos ni nudos (puntos)."""
    x0, y0, x1, y1 = PUENTE
    ancho = (x1 - x0 + 1) * T                       # 256
    tab_y0, tab_y1 = (y0 + 1) * T, (y1) * T          # 2144 .. 2304
    arriba = 24                                      # lo que sube la baranda de atrás
    alto = (tab_y1 - tab_y0) + arriba + 14           # + canto del tablero y su sombra
    im = Image.new('RGBA', (ancho, alto), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    oy = arriba                                      # y del tablero dentro de la imagen
    hondo = tab_y1 - tab_y0                          # 160
    r = random.Random(SEMILLA + 7)
    # La sombra sobre el agua, debajo del canto (lisa, sin tramas).
    d.rectangle([4, oy + hondo + 6, ancho - 5, oy + hondo + 12], fill=(10, 24, 30, 70))
    # El canto del tablero (la cara que da al sur, en 3/4).
    d.rectangle([0, oy + hondo, ancho - 1, oy + hondo + 5], fill=MADERA['oscura'])
    d.line([0, oy + hondo + 5, ancho - 1, oy + hondo + 5], fill=MADERA['perfil'])
    d.line([0, oy + hondo, ancho - 1, oy + hondo], fill=MADERA['media'])
    # Las tablas, de 9 px, de norte a sur.
    x = 0
    k = 0
    while x < ancho:
        w = 9 if x + 9 <= ancho else ancho - x
        tono = [MADERA['media'], MADERA['clara'], MADERA['media'], MADERA['luz']][k % 4]
        if r.random() < 0.25:
            tono = MADERA['clara']
        d.rectangle([x, oy, x + w - 1, oy + hondo - 1], fill=tono)
        # Luz a la izquierda (el sol del juego viene de arriba a la izquierda)
        d.line([x, oy, x, oy + hondo - 1], fill=MADERA['brillo'] if tono != MADERA['media'] else MADERA['luz'])
        # La junta entre tablas: una raya oscura.
        d.line([x + w - 1, oy, x + w - 1, oy + hondo - 1], fill=MADERA['perfil'])
        # Veta: dos o tres trazos largos, finos, un tono más oscuros.
        for _ in range(r.randint(2, 3)):
            vx = x + r.randint(2, max(2, w - 3))
            va = oy + r.randint(0, hondo // 2)
            vb = min(oy + hondo - 1, va + r.randint(hondo // 3, hondo - 10))
            d.line([vx, va, vx, vb], fill=MADERA['oscura'] if tono != MADERA['oscura'] else MADERA['perfil'])
        x += w
        k += 1
    # Las vigas de los extremos (donde apoya en la orilla).
    for bx in (0, ancho - 12):
        d.rectangle([bx, oy - 2, bx + 11, oy + hondo + 1], fill=MADERA['oscura'])
        d.line([bx, oy - 2, bx, oy + hondo + 1], fill=MADERA['luz'])
        d.line([bx + 11, oy - 2, bx + 11, oy + hondo + 1], fill=MADERA['perfil'])
    # Sombra suave de la baranda de atrás sobre el tablero.
    d.rectangle([12, oy, ancho - 13, oy + 3], fill=(40, 26, 14, 90))

    def baranda(img, base_y, delante):
        """Postes cada 32 px y dos largueros. `base_y`: donde apoyan."""
        dd = ImageDraw.Draw(img)
        xa, xb = 2 * T, ancho - 2 * T                 # sobre la orilla y el agua
        alto_p = 22
        # Largueros (detrás de los postes)
        for (ly, lh) in ((base_y - alto_p + 2, 4), (base_y - 10, 3)):
            dd.rectangle([xa, ly, xb, ly + lh], fill=MADERA['media'])
            dd.line([xa, ly, xb, ly], fill=MADERA['brillo'])
            dd.line([xa, ly + lh, xb, ly + lh], fill=MADERA['perfil'])
        px = xa
        while px <= xb:
            grueso = 8 if px in (xa, xb) else 6
            pa = px - grueso // 2
            cima = base_y - alto_p - (4 if grueso == 8 else 0)
            dd.rectangle([pa, cima, pa + grueso - 1, base_y], fill=MADERA['clara'])
            dd.line([pa, cima, pa, base_y], fill=MADERA['brillo'])
            dd.line([pa + grueso - 1, cima, pa + grueso - 1, base_y], fill=MADERA['perfil'])
            dd.line([pa, cima, pa + grueso - 1, cima], fill=MADERA['perfil'])
            dd.line([pa + 1, cima + 1, pa + grueso - 2, cima + 1], fill=MADERA['brillo'])
            if delante:
                # La sombra del poste en el tablero, hacia abajo a la derecha.
                dd.rectangle([pa + grueso, base_y - 3, pa + grueso + 3, base_y], fill=(40, 26, 14, 80))
            px += 32
    baranda(im, oy + 1, False)
    # La baranda de delante: imagen aparte, se dibuja por ENCIMA del jugador.
    alto_b = 34
    fr = Image.new('RGBA', (ancho, alto_b), (0, 0, 0, 0))
    baranda(fr, alto_b - 3, True)
    return im, fr, {'x': x0 * T, 'y': tab_y0 - arriba, 'ancho': ancho, 'alto': alto,
                    'baranda_y': tab_y1 - (alto_b - 3), 'baranda_alto': alto_b,
                    'tablero_y0': tab_y0, 'tablero_y1': tab_y1}


# ─────────────────────────────────────────────────────────────── EL SUELO
def disenar(rnd):
    """Las regiones: agua, tierra (casillas), piedra y el puente."""
    agua = rect_set(RIO_X0, 0, RIO_X1, N - 1)
    agua |= rect_set(*ESTANQUE_ESTE) | rect_set(*ESTANQUE_OESTE)
    puente = rect_set(*PUENTE)

    # Distancia (de Chebyshev) de cada casilla al agua, hasta 12.
    dist = {}
    frente = list(agua)
    for c in agua:
        dist[c] = 0
    for paso in range(1, 13):
        nuevo = []
        for (x, y) in frente:
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    c = (x + dx, y + dy)
                    if 0 <= c[0] < N and 0 <= c[1] < N and c not in dist:
                        dist[c] = paso
                        nuevo.append(c)
        frente = nuevo

    tierra = set()
    # La orilla: tres casillas como poco (dos de terraplén y una de aire) y
    # luego una franja que va y viene, como la del río del pueblo.
    ancho_orilla = ruido_valor(SEMILLA + 1, 9)
    for c, dd in dist.items():
        if dd == 0:
            continue
        extra = int(ancho_orilla(*c) * 8)
        if dd <= 4 + extra:
            tierra.add(c)
    # El sendero del oeste (zona PvP) hasta el puente.
    tierra |= rect_set(0, CUERPO_Y0, PUENTE[0] + 1, CUERPO_Y1)
    # El sendero norte-sur de la zona neutral, cortado por la plaza y el camino.
    tierra |= rect_set(CRUCE_X0, 0, CRUCE_X1, PLAZA[1] - 1)
    tierra |= rect_set(CRUCE_X0, PLAZA[3] + 1, CRUCE_X1, CAM_Y0 - 1)
    tierra |= rect_set(CRUCE_X0, CAM_Y1 + 1, CRUCE_X1, N - 1)
    # La arena: un claro redondeado, de borde irregular.
    borde = ruido_valor(SEMILLA + 2, 6)
    cx, cy = (ARENA[0] + ARENA[2]) / 2, (ARENA[1] + ARENA[3]) / 2
    rx, ry = (ARENA[2] - ARENA[0]) / 2, (ARENA[3] - ARENA[1]) / 2
    for y in range(ARENA[1] - 4, ARENA[3] + 5):
        for x in range(ARENA[0] - 4, ARENA[2] + 5):
            dd = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
            if dd <= 0.82 + borde(x, y) * 0.32:
                tierra.add((x, y))
    # Manchas de tierra sueltas por el prado, como las del pueblo.
    manchas = ruido_valor(SEMILLA + 3, 18)
    cerca_de = lambda x, y, rect, m: rect[0] - m <= x <= rect[2] + m and rect[1] - m <= y <= rect[3] + m
    for y in range(4, N - 4):
        for x in range(4, N - 4):
            if manchas(x, y) < 0.80:
                continue
            if cerca_de(x, y, PLAZA, 6) or cerca_de(x, y, (CAMINO_ESTE_X0, CAM_Y0, N - 1, CAM_Y1), 4):
                continue
            if x > N - 30 and CAM_Y0 - 30 < y < CAM_Y1 + 30:
                continue                              # la entrada del pueblo, limpia
            tierra.add((x, y))
    tierra -= agua

    piedra = {}
    # El camino de ladrillo, el mismo del borde oeste del pueblo.
    for x in range(CAMINO_ESTE_X0, N):
        fase = (x - 314) % 4
        piedra[(x, CAM_Y0)] = BLOQUE['N'][x % 2]
        piedra[(x, CAM_Y1)] = 1421 + x % 2
        for y in range(CUERPO_Y0, CUERPO_Y1 + 1):
            piedra[(x, y)] = LADRILLO[(y - CUERPO_Y0) % 4] + fase
    for (bx0, by0, bx1, by1) in (PLAZA, RING):
        for y in range(by0, by1 + 1):
            for x in range(bx0, bx1 + 1):
                if y == by0:
                    g = BLOQUE['NO'] if x == bx0 else BLOQUE['NE'] if x == bx1 else BLOQUE['N'][x % 2]
                elif y == by1:
                    g = BLOQUE['SO'] if x == bx0 else BLOQUE['SE'] if x == bx1 else BLOQUE['S'][x % 2]
                elif x == bx0:
                    g = BLOQUE['O1'] if y == by0 + 1 else BLOQUE['O'][y % 2]
                elif x == bx1:
                    g = BLOQUE['E1'] if y == by0 + 1 else BLOQUE['E'][y % 2]
                else:
                    g = LADRILLO[(y - by0 - 1) % 4] + (x - bx0 - 1) % 4
                piedra[(x, y)] = g
    return agua, puente, tierra, piedra, dist


def vertices(tierra):
    """Hierba (H) o tierra (T) en cada vértice: T si toca una casilla de tierra.
    Luego se quitan las esquinas cruzadas (HT/TH), que no tienen pieza."""
    V = [['H'] * (N + 1) for _ in range(N + 1)]
    for (x, y) in tierra:
        for vy in (y, y + 1):
            for vx in (x, x + 1):
                V[vy][vx] = 'T'
    cambios = True
    vueltas = 0
    while cambios and vueltas < 20:
        cambios = False
        vueltas += 1
        for y in range(N):
            for x in range(N):
                k = V[y][x] + V[y][x + 1] + V[y + 1][x] + V[y + 1][x + 1]
                if k in ('HTTH', 'THHT'):
                    for (vx, vy) in ((x, y), (x + 1, y), (x, y + 1), (x + 1, y + 1)):
                        V[vy][vx] = 'T'
                    cambios = True
    return V


def componer(rnd, agua, puente, tierra, piedra, V):
    def es_agua(x, y):
        # Fuera del mapa, lo mismo que en el borde (el río sigue).
        x = min(max(x, 0), N - 1); y = min(max(y, 0), N - 1)
        return (x, y) in agua
    VEC = ((0, -1), (0, 1), (1, 0), (-1, 0), (1, -1), (-1, -1), (1, 1), (-1, 1))   # N S E O NE NO SE SO
    datos = [0] * (N * N)
    usadas_matas = set()
    for y in range(N):
        for x in range(N):
            c = (x, y)
            if c in piedra:
                datos[y * N + x] = piedra[c]
                continue
            bits = ''.join('1' if es_agua(x + dx, y + dy) else '0' for dx, dy in VEC)
            if c in agua:
                n, s, e, o = bits[0] == '1', bits[1] == '1', bits[2] == '1', bits[3] == '1'
                if not n and not o: g = AGUA['esq_NO']
                elif not n and not e: g = AGUA['esq_NE']
                elif not s and not o: g = AGUA['esq_SO']
                elif not s and not e: g = AGUA['esq_SE']
                elif not o: g = AGUA['tierra_O'][y % 2]
                elif not e: g = AGUA['tierra_E'][y % 2]
                elif not n: g = AGUA['tierra_N'][x % 2]
                else: g = AGUA['centro']
                datos[y * N + x] = g
                continue
            g = None
            if bits != '00000000':
                n, s, e, o = bits[0] == '1', bits[1] == '1', bits[2] == '1', bits[3] == '1'
                if e and not (n or s or o): g = ORILLA['agua_E'][y % 2] if bits[4] == '1' and bits[6] == '1' else ORILLA.get(bits)
                elif o and not (n or s or e): g = ORILLA['agua_O'][y % 2] if bits[5] == '1' and bits[7] == '1' else ORILLA.get(bits)
                elif s and not (n or e or o): g = ORILLA['agua_S'][x % 2] if bits[6] == '1' and bits[7] == '1' else ORILLA.get(bits)
                elif n and not (s or e or o): g = ORILLA['agua_N'][x % 2] if bits[4] == '1' and bits[5] == '1' else ORILLA.get(bits)
                else: g = ORILLA.get(bits)
                if g is None:
                    g = 179
            else:
                if es_agua(x, y + 2):
                    g = ORILLA2['S'][x % 2]
                elif es_agua(x, y - 2):
                    g = ORILLA2['N'][x % 2]
            if g is None:
                k = V[y][x] + V[y][x + 1] + V[y + 1][x] + V[y + 1][x + 1]
                pieza = ESQ.get(k)
                if pieza is None:
                    g = 179 if k.count('T') >= 2 else 86
                elif isinstance(pieza, tuple):
                    eje, lista = pieza
                    g = lista[(y if eje == 'y' else x) % len(lista)]
                elif k == 'TTTT':
                    g = TIERRA_VARIANTES[rnd.randrange(len(TIERRA_VARIANTES))]
                else:
                    g = pieza[0]
            datos[y * N + x] = g
    # Unas matas de hierba de 2x2 en el prado (las del pueblo), sueltas.
    for _ in range(9000):
        x, y = rnd.randrange(2, N - 3), rnd.randrange(2, N - 3)
        if any(datos[(y + dy) * N + x + dx] != 86 for dy in (-1, 0, 1, 2) for dx in (-1, 0, 1, 2)):
            continue
        if any(abs(x - a) < 9 and abs(y - b) < 9 for a, b in usadas_matas):
            continue
        m = MATAS_2X2[rnd.randrange(2)]
        datos[y * N + x], datos[y * N + x + 1], datos[(y + 1) * N + x], datos[(y + 1) * N + x + 1] = m
        usadas_matas.add((x, y))
        if len(usadas_matas) >= 420:
            break
    return datos


def pintar(datos, salida):
    ts = Image.open(TILESET).convert('RGBA')
    cache = {}
    im = Image.new('RGBA', (N * T, N * T), (0, 0, 0, 255))
    for y in range(N):
        for x in range(N):
            g = datos[y * N + x]
            t = cache.get(g)
            if t is None:
                i = g - 1
                t = cache[g] = ts.crop(((i % TS_COLS) * T, (i // TS_COLS) * T, (i % TS_COLS) * T + T, (i // TS_COLS) * T + T))
            im.paste(t, (x * T, y * T))
    im.save(salida)
    print('captura:', salida, im.size)


# ─────────────────────────────────────────────────────────────── TODO
def main():
    rnd = random.Random(SEMILLA)
    os.makedirs(os.path.join(DESTINO, 'arboles'), exist_ok=True)
    indice = json.load(open(os.path.join(PAQUETE, 'arboles', 'indice.json'), encoding='utf-8'))
    por_nombre = {s['name']: s for s in indice['sprites']}
    usados = sorted(set(ARBOLES_ESTE + ARBOLES_OESTE + [ARBOL_RARO]))
    for n in usados:
        shutil.copyfile(os.path.join(PAQUETE, 'arboles', n + '.png'), os.path.join(DESTINO, 'arboles', n + '.png'))
    # El atlas de la primera versión ya no se usa.
    viejo = os.path.join(DESTINO, 'terreno_32.png')
    if os.path.isfile(viejo):
        os.remove(viejo)

    agua, puente, tierra, piedra, dist = disenar(rnd)
    V = vertices(tierra)
    datos = componer(rnd, agua, puente, tierra, piedra, V)

    pu, baranda, geo = dibujar_puente()
    pu.save(os.path.join(DESTINO, 'puente.png'))
    baranda.save(os.path.join(DESTINO, 'puente_baranda.png'))

    def hierba_pura(cx, cy, r):
        for yy in range(cy - r, cy + r + 1):
            for xx in range(cx - r, cx + r + 1):
                if not (1 <= xx < N - 1 and 1 <= yy < N - 1):
                    return False
                if (xx, yy) in piedra or (xx, yy) in agua or (xx, yy) in tierra or (xx, yy) in puente:
                    return False
                if 'T' in (V[yy][xx], V[yy][xx + 1], V[yy + 1][xx], V[yy + 1][xx + 1]):
                    return False
        return True

    # ── LOS ÁRBOLES ───────────────────────────────────────────────────────
    def libre_para_arbol(px, py):
        cx, cy = int(px // T), int(py // T)
        # El agua, más lejos: la copa no puede caer sobre un estanque.
        for yy in range(cy - 12, cy + 5):
            for xx in range(cx - 6, cx + 7):
                if dist.get((xx, yy), 99) == 0:
                    return False
        return hierba_pura(cx, cy, 4)
    arboles = []
    def lejos(px, py, sep):
        return all((a['x'] - px) ** 2 + (a['y'] - py) ** 2 >= sep * sep for a in arboles)
    for zona, (x0, x1), nombres, sep in (
            ('oeste', (2, RIO_X0 - 4), ARBOLES_OESTE, 120),
            ('este', (RIO_X1 + 4, N - 4), ARBOLES_ESTE, 150)):
        for _ in range(9000):
            px = rnd.uniform(x0 * T, x1 * T)
            py = rnd.uniform(6 * T, (N - 4) * T)
            if zona == 'este':
                centros = [(168, 40), (188, 240), (276, 60), (292, 256), (260, 160), (172, 192), (248, 280), (300, 104)]
                if min((px / T - a) ** 2 + (py / T - b) ** 2 for a, b in centros) > 28 ** 2:
                    continue
            if not libre_para_arbol(px, py) or not lejos(px, py, sep):
                continue
            nombre = ARBOL_RARO if rnd.random() < 0.025 else nombres[rnd.randrange(len(nombres))]
            arboles.append({'nombre': nombre, 'x': round(px), 'y': round(py)})
    print('árboles:', len(arboles))

    # ── LAS COLISIONES ────────────────────────────────────────────────────
    colisiones = []
    agua_dura = agua - puente
    for (x0, y0, x1, y1) in rectangulos(agua_dura):
        # Se deja pisar la orilla (10 px) por el lado que da a tierra.
        def tierra_al(lado):
            if lado == 'N': cs = [(x, y0 - 1) for x in range(x0, x1 + 1)]
            elif lado == 'S': cs = [(x, y1 + 1) for x in range(x0, x1 + 1)]
            elif lado == 'O': cs = [(x0 - 1, y) for y in range(y0, y1 + 1)]
            else: cs = [(x1 + 1, y) for y in range(y0, y1 + 1)]
            return any(0 <= cx < N and 0 <= cy < N and (cx, cy) not in agua for cx, cy in cs)
        mn = 12 if tierra_al('N') else 0
        ms = 10 if tierra_al('S') else 0
        mo = 10 if tierra_al('O') else 0
        me = 10 if tierra_al('E') else 0
        colisiones.append({'x': x0 * T + mo, 'y': y0 * T + mn,
                           'width': (x1 - x0 + 1) * T - mo - me, 'height': (y1 - y0 + 1) * T - mn - ms, 'name': 'agua'})
    # Las barandas del puente (solo sobre el agua y la orilla: los extremos,
    # abiertos).
    colisiones.append({'x': geo['x'] + 2 * T, 'y': geo['tablero_y0'] - 6, 'width': geo['ancho'] - 4 * T, 'height': 12, 'name': 'baranda'})
    colisiones.append({'x': geo['x'] + 2 * T, 'y': geo['tablero_y1'] - 8, 'width': geo['ancho'] - 4 * T, 'height': 12, 'name': 'baranda'})
    # El tronco de cada árbol (la huella sugerida, a escala).
    for a in arboles:
        s = por_nombre[a['nombre']]
        fp = s.get('suggestedFootprint', {'width': 30, 'height': 10})
        w, h = fp['width'] * ESCALA_ARBOL, fp['height'] * ESCALA_ARBOL + 4
        colisiones.append({'x': round(a['x'] - w / 2), 'y': round(a['y'] - h), 'width': round(w), 'height': round(h), 'name': 'tronco'})

    # ── SALIDAS, VALLAS DE LAS FUTURAS Y CARTELES ──────────────────────────
    W = N * T
    cam_y, cam_h = CUERPO_Y0 * T, (CUERPO_Y1 - CUERPO_Y0 + 1) * T
    cruce_x, cruce_w = CRUCE_X0 * T, (CRUCE_X1 - CRUCE_X0 + 1) * T
    # (2026-10-18) Las tres salidas llevan a los mapas nuevos
    # (tools/generar-zonas.py): ya no hay valla, se sale por el borde.
    salidas = [
        {'name': 'pueblo', 'x': W - 20, 'y': CAM_Y0 * T, 'width': 20, 'height': (CAM_Y1 - CAM_Y0 + 1) * T},
        {'name': 'cementerio', 'x': 0, 'y': cam_y, 'width': 20, 'height': cam_h},
        {'name': 'tundra', 'x': cruce_x, 'y': 0, 'width': cruce_w, 'height': 20},
        {'name': 'desierto', 'x': cruce_x, 'y': W - 20, 'width': cruce_w, 'height': 20},
    ]
    carteles = [
        {'name': 'cementerio', 'x': 128, 'y': cam_y - 6, 'texto': 'West: Cemetery of Lost Souls (PvP)'},
        {'name': 'tundra', 'x': (CRUCE_X1 + 1) * T + 10, 'y': 128, 'texto': 'North: Frostfang Tundra'},
        {'name': 'desierto', 'x': (CRUCE_X1 + 1) * T + 10, 'y': W - 128, 'texto': 'South: Scorching Desert'},
        {'name': 'pvp', 'x': (RIO_X0 - 10) * T, 'y': cam_y - 6, 'texto': 'PvP zone — swords on!'},
        {'name': 'neutral', 'x': (PUENTE[2] + 4) * T, 'y': CAM_Y0 * T - 8, 'texto': 'Safe zone'},
        {'name': 'pueblo', 'x': W - 128, 'y': CAM_Y0 * T - 8, 'texto': 'To the village'},
    ]
    # El borde de la zona PvP: el mismo que mira el servidor (PVP_ZONA en
    # server2.js, x < 2240), dentro del río.
    MITAD_RIO = 2240
    zonas = [
        {'name': 'pvp', 'x': 0, 'y': 0, 'width': MITAD_RIO, 'height': W},
        {'name': 'neutral', 'x': MITAD_RIO, 'y': 0, 'width': W - MITAD_RIO, 'height': W},
    ]
    aparicion = [{'name': 'desde_pueblo', 'x': W - 128, 'y': 2208}]

    # ── LOS MONSTRUOS (sitios de salida) ──────────────────────────────────
    monstruos = []
    deseados = [('golem_salvaje', 'oeste', 3), ('lobo_salvaje', 'oeste', 3), ('arana_salvaje', 'oeste', 3),
                ('brujo_salvaje', 'oeste', 2), ('lobo_salvaje', 'este', 2), ('arana_salvaje', 'este', 2),
                ('golem_salvaje', 'este', 1)]
    for tipo, zona, n in deseados:
        puestos = 0
        for _ in range(6000):
            if puestos >= n: break
            if zona == 'oeste':
                px, py = rnd.uniform(6 * T, (RIO_X0 - 6) * T), rnd.uniform(8 * T, (N - 8) * T)
            else:
                px, py = rnd.uniform((RIO_X1 + 8) * T, (N - 16) * T), rnd.uniform(8 * T, (N - 8) * T)
            cx, cy = int(px // T), int(py // T)
            if dist.get((cx, cy), 99) <= 2 or (cx, cy) in puente or (cx, cy) in piedra:
                continue
            if any((a['x'] - px) ** 2 + (a['y'] - py) ** 2 < 90 ** 2 for a in arboles):
                continue
            if any((m['x'] - px) ** 2 + (m['y'] - py) ** 2 < 600 ** 2 for m in monstruos):
                continue
            # Lejos de la entrada del pueblo y de la plaza.
            if (px - aparicion[0]['x']) ** 2 + (py - aparicion[0]['y']) ** 2 < 1100 ** 2:
                continue
            if PLAZA[0] * T - 200 < px < PLAZA[2] * T + 200 and PLAZA[1] * T - 200 < py < PLAZA[3] * T + 200:
                continue
            monstruos.append({'tipo': tipo, 'x': round(px), 'y': round(py)})
            puestos += 1
    print('monstruos:', len(monstruos))

    # ── EL MONTE ──────────────────────────────────────────────────────────
    # Como tools/generar-monte.py en el pueblo: matorrales de 5 a 10 matas,
    # solo en hierba, lejos de árboles, caminos, agua y monstruos.
    def libre_monte(px, py):
        if px < 64 or py < 64 or px > W - 64 or py > W - 64:
            return False
        if not hierba_pura(int(px // T), int(py // T), 3):
            return False
        if any((a['x'] - px) ** 2 + ((a['y'] - 20) - py) ** 2 < 100 ** 2 for a in arboles):
            return False
        if any((m['x'] - px) ** 2 + (m['y'] - py) ** 2 < 70 ** 2 for m in monstruos):
            return False
        if (px - aparicion[0]['x']) ** 2 + (py - aparicion[0]['y']) ** 2 < 260 ** 2:
            return False
        return True
    rm = random.Random(SEMILLA + 11)
    candidatos = [(x * T + 8, y * T + 8) for y in range(0, N, 2) for x in range(0, N, 2)]
    rm.shuffle(candidatos)
    centros = []
    for (x, y) in candidatos:
        if len(centros) >= 44:
            break
        if any((x - a) ** 2 + (y - b) ** 2 < 330 ** 2 for a, b in centros):
            continue
        if libre_monte(x, y):
            centros.append((x, y))
    matas = []
    for (cx, cy) in centros:
        cuantas = rm.randint(5, 10)
        puestas = []
        intentos = 0
        while len(puestas) < cuantas and intentos < 200:
            intentos += 1
            a = rm.random() * math.tau
            r = 78 * math.sqrt(rm.random()) * (0.55 + 0.45 * rm.random())
            x, y = cx + math.cos(a) * r, cy + math.sin(a) * r * 0.7
            if any((x - a2) ** 2 + (y - b2) ** 2 < 20 ** 2 for a2, b2, _, _ in puestas):
                continue
            if not libre_monte(x, y):
                continue
            puestas.append((round(x), round(y), rm.randint(0, 3), round(0.85 + rm.random() * 0.35, 2)))
        matas.extend(puestas)
    matas.sort(key=lambda m: (m[1], m[0]))
    with open(MONTE, 'w', encoding='utf-8') as fh:
        json.dump({'version': VERSION,
                   'nota': 'Lo escribe tools/generar-salvaje.py. Cada mata: [x, y (la base), variante 0-3, escala].',
                   'matorrales': len(centros), 'matas': [list(m) for m in matas]},
                  fh, ensure_ascii=False, separators=(',', ':'))
    print('monte:', len(centros), 'matorrales,', len(matas), 'matas')

    # ── EL JSON DE TILED ──────────────────────────────────────────────────
    oid = [1]
    def obj(o, **extra):
        d = {'id': oid[0], 'name': o.get('name', ''), 'type': '', 'rotation': 0, 'visible': True,
             'x': o['x'], 'y': o['y'], 'width': o.get('width', 0), 'height': o.get('height', 0)}
        d.update(extra)
        oid[0] += 1
        return d
    # Los árboles como objetos-imagen (Tiled los dibuja), con su colección.
    PRIMER_ARBOL = 1 + 2880
    coleccion = []
    gid_de = {}
    for i, n in enumerate(usados):
        coleccion.append({'id': i, 'image': '../Game/MAPAS/salvaje/arboles/%s.png' % n, 'imagewidth': 128, 'imageheight': 160})
        gid_de[n] = PRIMER_ARBOL + i
    capa_arboles = []
    for a in arboles:
        w, h = round(128 * ESCALA_ARBOL), round(160 * ESCALA_ARBOL)
        capa_arboles.append(obj({'name': a['nombre'], 'x': a['x'] - w // 2, 'y': a['y'], 'width': w, 'height': h},
                                gid=gid_de[a['nombre']],
                                properties=[{'name': 'pie_x', 'type': 'int', 'value': a['x']}]))
    puente_obj = {'name': 'puente', 'x': geo['x'], 'y': geo['y'], 'width': geo['ancho'], 'height': geo['alto']}
    baranda_obj = {'name': 'baranda', 'x': geo['x'], 'y': geo['baranda_y'], 'width': geo['ancho'], 'height': geo['baranda_alto']}
    mapa = {
        'compressionlevel': -1, 'width': N, 'height': N, 'tilewidth': T, 'tileheight': T,
        'infinite': False, 'orientation': 'orthogonal', 'renderorder': 'right-down',
        'tiledversion': '1.10.2', 'type': 'map', 'version': '1.10', 'nextlayerid': 20, 'nextobjectid': 0,
        'properties': [{'name': 'generado_por', 'type': 'string', 'value': 'tools/generar-salvaje.py'},
                       {'name': 'version', 'type': 'string', 'value': VERSION},
                       {'name': 'escala_arbol', 'type': 'float', 'value': ESCALA_ARBOL}],
        'tilesets': [
            {'firstgid': 1, 'name': 'Tileset_mapa', 'image': '../Game/MAPAS/tiles.png',
             'imagewidth': 1440, 'imageheight': 512, 'tilewidth': T, 'tileheight': T, 'columns': TS_COLS,
             'tilecount': 2880, 'margin': 0, 'spacing': 0},
            {'firstgid': PRIMER_ARBOL, 'name': 'arboles', 'columns': 0, 'grid': {'orientation': 'orthogonal', 'width': 1, 'height': 1},
             'margin': 0, 'spacing': 0, 'tilecount': len(coleccion), 'tilewidth': 128, 'tileheight': 160, 'tiles': coleccion}
        ],
        'layers': [
            {'id': 1, 'name': 'suelo', 'type': 'tilelayer', 'width': N, 'height': N, 'x': 0, 'y': 0,
             'opacity': 1, 'visible': True, 'data': datos},
            {'id': 2, 'name': 'arboles', 'type': 'objectgroup', 'draworder': 'topdown', 'opacity': 1, 'visible': True,
             'x': 0, 'y': 0, 'objects': capa_arboles},
            {'id': 3, 'name': 'colisiones', 'type': 'objectgroup', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0,
             'objects': [obj(c) for c in colisiones]},
            {'id': 4, 'name': 'salidas', 'type': 'objectgroup', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0,
             'objects': [obj(s) for s in salidas]},
            {'id': 5, 'name': 'zonas', 'type': 'objectgroup', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0,
             'objects': [obj(z) for z in zonas]},
            {'id': 6, 'name': 'aparicion', 'type': 'objectgroup', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0,
             'objects': [obj(a, point=True) for a in aparicion]},
            {'id': 7, 'name': 'monstruos', 'type': 'objectgroup', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0,
             'objects': [obj({'name': m['tipo'], 'x': m['x'], 'y': m['y']}, point=True) for m in monstruos]},
            {'id': 8, 'name': 'carteles', 'type': 'objectgroup', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0,
             'objects': [obj(c, point=True, properties=[{'name': 'texto', 'type': 'string', 'value': c['texto']}]) for c in carteles]},
            {'id': 9, 'name': 'puente', 'type': 'objectgroup', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0,
             'objects': [obj(puente_obj), obj(baranda_obj)]},
        ]
    }
    mapa['nextobjectid'] = oid[0]
    with open(MAPA, 'w', encoding='utf-8') as fh:
        json.dump(mapa, fh, ensure_ascii=False, separators=(',', ':'))
    print('mapa:', MAPA, '(%dx%d casillas de %d px = %d px)' % (N, N, T, N * T),
          'colisiones', len(colisiones), 'árboles', len(arboles))

    if '--captura' in sys.argv:
        pintar(datos, sys.argv[sys.argv.index('--captura') + 1])


if __name__ == '__main__':
    main()
