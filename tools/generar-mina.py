#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
MINA — los tilesets de la mina, a 32 px                     (rehecho 2026-10-04)
=============================================================================

QUE ESCRIBE
---------------------------------------------------------------------------
    Game/MAPAS/Mina/tileset_mina.png     el tileset fijo: suelo, grava, tarima,
                                         puentes, via, muro, roca, sombras,
                                         vetas y los cacharros planos
    Game/MAPAS/Mina/tileset_lava_<f>.png la lava, UN PNG POR FOTOGRAMA (6)
    Game/MAPAS/Mina/tileset_agua_<f>.png el agua, uno por fotograma (4)
    Game/MAPAS/Mina/tileset_mina.json    que es cada tile, por nombre, y como
                                         se animan los liquidos
    Game/MAPAS/Mina/ref_mina.png         la hoja de referencia con los indices
    Game/MAPAS/Mina/piezas.png/.json     atlas de las piezas grandes (sprites)
    Game/MAPAS/Mina/lava_burbuja.png     6 fotogramas de 32x32 de la burbuja

QUE CAMBIO EN 2026-10-04, Y POR QUE
---------------------------------------------------------------------------
"Mejora la mina graficamente: no tiene graficos altos y profesionales." La
version anterior dibujaba cada material con TRES tonos planos (lo decia su
propia cabecera: "plano, nunca un degradado"). Bajo tierra no hay arboles ni
casas encima: el suelo ES el decorado, y tres tonos son un gris con rayas.

  · El arte sale de `gf_mina_pro.py` (rampas de 9-11 tonos, luz de arriba a la
    izquierda, tramado solo en el cambio de tono) y las piezas grandes de
    `gf_mina_piezas.py` (campos de alturas iluminados).
  · TODO TEJE EN PARCHES: el suelo, la grava, la lava y el agua en 8x8
    casillas (256 px sin repetirse), la tarima y la roca en 4x4. El mapa pone cada
    casilla segun su POSICION (x mod lado, y mod lado), asi que no se ve la
    reja de 32 px.
  · LOS BORDES VAN EN SU PROPIA CAPA (`mina_bordes`), transparentes por fuera.
    Antes cada pieza de borde traia su trozo de suelo pintado, que no era el
    del parche: en cada orilla cambiaba el dibujo. Ahora debajo esta el suelo
    entero y el borde solo pone el material y lo que le hace al suelo.
  · LA LAVA Y EL AGUA SE ANIMAN POR FOTOGRAMAS DEL TILESET. Antes un
    tileSprite se deslizaba sobre el interior del lago y la orilla se quedaba
    quieta: costura en todo el perimetro. Ahora la escena cambia la imagen del
    tileset (`tileset.setImage`) y se anima todo a la vez, orilla incluida.

LAS SOMBRAS Y LA PROFUNDIDAD DE LAS PIEZAS NO SE DIBUJAN AQUI
---------------------------------------------------------------------------
Las piezas altas salen SIN sombra: se la pone `gf-sombras.js`, proyectada con
cizalla hacia abajo y a la derecha. Y el orden de dibujo lo decide
`gf-profundidad.js`. Pintar aqui una sombra daria DOS.

Corre con:  python tools/generar-mina.py   (y despues generar-mina-mapa.py)
"""

import io
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gf_arte as A
from gf_arte import Lienzo
import gf_mina_pro as P
import gf_mina_piezas as Z
from gf_mina_arte import T, perfil, cortar, hoja

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, 'Game', 'MAPAS', 'Mina')

COLS = 16                       # columnas de los tilesets (16 x 32 = 512 px)

# ── MEDIDAS, TODAS EN CASILLAS DE 32 ──────────────────────────────────────
ALTO_MURO = 5                   # 5 x 32 = 160 px, vez y media el jugador (102)
ANCHO_MURO = 8                  # el parche del muro: 256 px sin repetirse
PARCHE_SUELO = 8                # 256 px
PARCHE_LIQ = 8                  # grava, lava y agua: 256 px (ver BORDES A MEDIDA)
PARCHE = 4                      # tarima y roca: 128 px
FOTOS_LAVA = 6                  # fotogramas de la lava (bucle de ~1 s)
FOTOS_AGUA = 4
FPS_LAVA = 6
FPS_AGUA = 4

# El juego de 13 piezas MENOS el centro, que es el propio parche.
LADOS = P.LADOS_BORDE


# ===========================================================================
# BORDES A MEDIDA
# ===========================================================================
#
# La lava, el agua y la grava tejen en parches de 8x8 casillas (256 px). Con
# 4x4 (128 px) en un lago de veinte casillas se le veia el periodo: la misma
# figura repetida en reja. Pero cada pieza de borde lleva DENTRO el trozo del
# parche que le toca por su posicion, asi que con 8x8 harian falta 12 lados x
# 64 posiciones = 768 bordes por material y por fotograma.
#
# El mapa usa muchos menos: se excava aqui la misma mina que va a pintar
# `generar-mina-mapa.py` (es determinista: sin `random`) y se dibujan SOLO los
# bordes que aparecen. Para la lava son unos 250. Si se cambia el plano de la
# mina hay que correr los dos generadores, en este orden, y el del mapa se
# planta con un error claro si le falta una pieza.

def bordes_necesarios():
    import importlib.util
    ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'generar-mina-mapa.py')
    spec = importlib.util.spec_from_file_location('gf_mina_mapa', ruta)
    M = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(M)
    g, _zonas, carriles = M.excavar()
    # La via se traza DESPUES de excavar y pisa casillas de grava: hay que
    # trazarla tambien aqui o los bordes de la grava salen otros.
    M.poner_carriles(g, carriles)
    usados = {'lava': set(), 'agua': set(), 'grava': set()}
    material = {M.LAVA: 'lava', M.AGUA: 'agua', M.GRAVA: 'grava'}
    for y in range(M.H):
        for x in range(M.W):
            m = material.get(g[y][x])
            if m is None:
                continue
            lado = M._lado(g, x, y, g[y][x])
            if lado != 'C':
                usados[m].add((lado, x % PARCHE_LIQ, y % PARCHE_LIQ))
    return {m: sorted(v, key=lambda t: (LADOS.index(t[0]), t[2], t[1]))
            for m, v in usados.items()}

S = 41                          # la semilla de todo


# ===========================================================================
# LA SOMBRA DEL MURO (sigue siendo la de antes: esta bien)
# ===========================================================================

def sombra_muro(lado, semilla):
    """
    La sombra que el muro echa sobre el suelo. El sol esta ARRIBA A LA
    IZQUIERDA, asi que cae hacia abajo y a la derecha, se desvanece, y su
    borde sigue el perfil ondulado del pie de la pared.
    """
    t = Lienzo(T, T)
    pf = perfil(semilla + 13, T, 2.2)
    ALTO = 13
    SESGO = 0.45
    if lado in ('N', 'NO', 'NE'):
        for x in range(T):
            largo = max(1, ALTO + pf[x % T])
            for y in range(largo):
                xx = int(x + y * SESGO)
                if not (0 <= xx < T):
                    continue
                a = int(150 * (1.0 - y / float(largo)) ** 0.75)
                if a > 4:
                    c = t.get(xx, y)
                    t.set(xx, y, (12, 10, 14, max(c[3], a)))
    if lado in ('O', 'NO'):
        for y in range(T):
            largo = max(1, 9 + pf[y % T])
            for x in range(largo):
                a = int(125 * (1.0 - x / float(largo)) ** 0.8)
                if a > 4:
                    c = t.get(x, y)
                    t.set(x, y, (12, 10, 14, max(c[3], a)))
    if lado in ('E', 'NE'):
        # A contraluz: solo la linea de contacto. La misma sombra que a la
        # izquierda seria decir que hay dos soles.
        for y in range(T):
            largo = max(1, 4 + max(0, pf[y % T]) // 2)
            for k in range(largo):
                x = T - 1 - k
                a = int(85 * (1.0 - k / float(largo)))
                if a > 4:
                    c = t.get(x, y)
                    t.set(x, y, (12, 10, 14, max(c[3], a)))
    return t


# ===========================================================================
# EL MURO
# ===========================================================================

def muro_parche(semilla):
    """El tramo corrido: ANCHO_MURO x ALTO_MURO tiles, en [fila][columna]."""
    li = P.pinta_muro(Lienzo(ANCHO_MURO * T, ALTO_MURO * T), semilla, ALTO_MURO)
    return [[P._recortar(li, cx * T, fy * T) for cx in range(ANCHO_MURO)]
            for fy in range(ALTO_MURO)]


def muro_extremo(lado, semilla):
    """
    El canto de un muro, donde se acaba y dobla hacia atras. Se oscurecen TRES
    columnas, no se pinta una raya: una raya de un pixel en una pared de
    sillares se ve como un fallo de dibujo.
    """
    li = P.pinta_muro(Lienzo(T, ALTO_MURO * T), semilla, ALTO_MURO)
    H = ALTO_MURO * T
    for y in range(H):
        cols = (0, 1, 2) if lado == 'izq' else (T - 1, T - 2, T - 3)
        for k, x in enumerate(cols):
            li.set(x, y, P.oscurecer(li.get(x, y), (0.6, 0.76, 0.9)[k]))
    return [P._recortar(li, 0, fy * T) for fy in range(ALTO_MURO)]


# ===========================================================================
# VETAS
# ===========================================================================

def veta(mineral, semilla, sobre):
    """
    Una veta de mineral incrustada en la pared o en la roca: cinco pepitas
    alargadas siguiendo una diagonal, cada una con su luz y su destello, y la
    roca de alrededor un poco hundida.
    """
    t = Lienzo(T, T)
    t.pegar(sobre)
    rm = Z.MINERAL[mineral]
    ang = -0.9 + P.h01(1, 2, semilla) * 1.8
    cx, cy = T * 0.5, T * 0.5
    for i in range(5):
        d = (i - 2.0) * 5.6
        nx = cx + math.cos(ang) * d
        ny = cy + math.sin(ang) * d
        rx = 2.8 + P.h01(i * 7, 3, semilla) * 2.0
        ry = 2.0 + P.h01(3, i * 5, semilla) * 1.6
        # El hueco donde va la pepita, un pelo mas oscuro y mas ancho.
        for y in range(int(ny - ry - 2), int(ny + ry + 3)):
            for x in range(int(nx - rx - 2), int(nx + rx + 3)):
                if ((x + 0.5 - nx) / (rx + 1.2)) ** 2 + ((y + 0.5 - ny) / (ry + 1.2)) ** 2 <= 1.0:
                    t.set(x, y, P.oscurecer(t.get(x, y), 0.7))
        Z.pepita(t, None, nx, ny, rx, ry, rm)
    return t


# ===========================================================================
# EL TILESET
# ===========================================================================

class Hoja(object):
    """Una lista de tiles con nombre, en filas de COLS."""

    def __init__(self):
        self.tiles = []
        self.fichas = []
        self.indices = {}

    def add(self, t, nombre, papel):
        self.tiles.append(t)
        i = len(self.tiles) - 1
        self.fichas.append({'i': i, 'nombre': nombre, 'papel': papel})
        self.indices[nombre] = i
        return i

    def fila(self):
        """Cada seccion empieza en columna 0: la hoja se lee de un vistazo."""
        while len(self.tiles) % COLS:
            self.add(None, '_hueco_%d' % len(self.tiles), 'hueco')


def construye(necesarios):
    h = Hoja()
    grandes = {}
    lienzos = {}

    # --- SUELO: el parche de 8x8 ---------------------------------------------
    suelo = P.suelo_parche(PARCHE_SUELO, S)
    for j in range(PARCHE_SUELO):
        for i in range(PARCHE_SUELO):
            h.add(suelo[j][i], 'suelo_p%d%d' % (i, j), 'suelo')
    h.fila()

    # Lo que se deja caer encima (transparente: va en la capa de objetos).
    for k in range(1, 5):
        h.add(P.deco_suelo(k, S + k * 5), 'suelo_deco_%d' % k, 'deco')
    for k in range(1, 5):
        h.add(P.deco_grava(k, S + 60), 'grava_deco_%d' % k, 'deco')
    h.fila()

    # --- GRAVA: parche y los bordes que usa el mapa --------------------------
    grava = P.grava_parche(PARCHE_LIQ, S + 40)
    for j in range(PARCHE_LIQ):
        for i in range(PARCHE_LIQ):
            h.add(grava[j][i], 'grava_p%d%d' % (i, j), 'suelo')
    for (lado, i, j) in necesarios['grava']:
        h.add(P.borde_capa(lado, grava[j][i], 'grava', S + 3),
              'grava_b_%s_%d%d' % (lado, i, j), 'borde')
    h.fila()

    # --- TARIMA y PUENTES ---------------------------------------------------
    tablas = P.tablas_parche(PARCHE, S + 4)
    for j in range(PARCHE):
        for i in range(PARCHE):
            h.add(tablas[j][i], 'tabla_p%d%d' % (i, j), 'suelo')
    puente = P.puente_parche(S + 6, PARCHE)
    for fila in ('n', 'c', 's'):
        for i in range(PARCHE):
            h.add(puente[(fila, i)], 'puente_%s_%d' % (fila, i), 'suelo')
    h.fila()

    # --- LA VIA (2 casillas de galibo) --------------------------------------
    for k, t in enumerate(P.via('h', S + 11)):
        h.add(t, 'via_h_%d' % k, 'camino')
    for k, t in enumerate(P.via('v', S + 11)):
        h.add(t, 'via_v_%d' % k, 'camino')
    h.fila()

    # --- EL MURO: 5 casillas de alto (160 px) -------------------------------
    parche_muro = muro_parche(S + 7)
    for fila in range(ALTO_MURO):
        for col in range(ANCHO_MURO):
            h.add(parche_muro[fila][col], 'muro_%d_%d' % (fila, col), 'muro')
    for lado in ('izq', 'der'):
        for fila, t in enumerate(muro_extremo(lado, S + 7)):
            h.add(t, 'muro_%s_%d' % (lado, fila), 'muro')
    h.fila()

    # --- LA ROCA SIN EXCAVAR ------------------------------------------------
    roca = P.roca_parche(PARCHE, S + 13)
    for k, t in enumerate(roca):
        h.add(t, 'roca_top_%d%d' % (k % PARCHE, k // PARCHE), 'muro')
    for lado in ('N', 'O', 'E'):
        h.add(P.roca_canto(lado, roca[0], S + 21), 'roca_canto_%s' % lado, 'muro')
    for lado in ('N', 'NO', 'NE', 'O', 'E'):
        h.add(sombra_muro(lado, S + 29), 'sombra_%s' % lado, 'sombra')
    h.fila()

    # --- VETAS DE MINERAL ---------------------------------------------------
    cara_muro = parche_muro[2][3]
    for m in ('piedra', 'cobre', 'hierro', 'carbon', 'oro'):
        h.add(veta(m, S + 17, cara_muro), 'veta_%s' % m, 'veta')
    for m in ('piedra', 'cobre', 'hierro', 'carbon', 'oro'):
        h.add(veta(m, S + 23, roca[5]), 'veta_macizo_%s' % m, 'veta')
    h.fila()

    # =======================================================================
    # PIEZAS GRANDES
    # =======================================================================

    def pieza(nombre, lienzo, ancho, alto, alta=True):
        """
        Da de alta una pieza grande en el atlas. Las PLANAS (`alta=False`, lo
        que se pisa) ademas se parten en tiles, porque van en la capa de
        objetos del mapa. Las altas ya no: eran 70 tiles que solo servian para
        pintarlas a mano en Tiled y ocupaban memoria de video en el juego.
        """
        if lienzo.w != ancho * T or lienzo.h != alto * T:
            raise ValueError('la pieza %s mide %dx%d y deberia medir %dx%d'
                             % (nombre, lienzo.w, lienzo.h, ancho * T, alto * T))
        if not alta:
            for k, t in enumerate(cortar(lienzo, ancho, alto)):
                h.add(t, '%s_%d%d' % (nombre, k % ancho, k // ancho), 'grande')
        grandes[nombre] = (ancho, alto)
        lienzos[nombre] = (lienzo, alta)

    pieza('pena_pequena', Z.pena(2, 2, S + 31), 2, 2, alta=False)
    pieza('pena_mediana', Z.pena(2, 2, S + 37, vetas='piedra'), 2, 2)
    pieza('pena_grande', Z.pena(3, 2, S + 41, musgo=True), 3, 2)
    for nombre, col in (('racimo_azul', 'azul'), ('racimo_morado', 'morado'),
                        ('racimo_verde', 'verde')):
        pieza(nombre, Z.racimo(col, S + 27), 2, 3)
    pieza('vagoneta', Z.vagoneta(S + 43), 2, 2)
    pieza('puntal', Z.puntal(S + 47), 3, 2)
    pieza('antorcha', Z.antorcha(S + 51), 1, 2)
    for m in ('piedra', 'cobre', 'hierro', 'carbon', 'oro'):
        pieza('monton_%s' % m, Z.monton(m, S + 53), 2, 2, alta=False)
    for i in range(3):
        pieza('estalagmita_g%d' % (i + 1), Z.estalagmita(S + 61 + i * 7), 2, 3)
    h.fila()

    return h, grandes, lienzos


def construye_liquido(material, fotogramas, necesarios):
    """
    Los tilesets de un liquido, uno por fotograma, con el MISMO orden de
    tiles en todos: el parche (64) y los bordes que usa el mapa.
    Devuelve (lista de Hojas, indices).
    """
    hojas = []
    for f, parche in enumerate(fotogramas):
        h = Hoja()
        for j in range(PARCHE_LIQ):
            for i in range(PARCHE_LIQ):
                h.add(parche[j][i], '%s_p%d%d' % (material, i, j), material)
        for (lado, i, j) in necesarios:
            h.add(P.borde_capa(lado, parche[j][i], material, S + 9, f),
                  '%s_b_%s_%d%d' % (material, lado, i, j), 'borde')
        h.fila()
        hojas.append(h)
    return hojas, hojas[0].indices


# ===========================================================================
# HOJA DE REFERENCIA
# ===========================================================================

def ref_indice(tiles):
    """La hoja con el numero de cada tile encima, para construir en Tiled."""
    esc = 2
    li = Lienzo(COLS * T * esc, ((len(tiles) + COLS - 1) // COLS) * T * esc)
    fondo = A.hex_rgb('#1b1f24')
    for y in range(li.h):
        for x in range(li.w):
            li.set(x, y, fondo)
    for i, t in enumerate(tiles):
        if t is None:
            continue
        cx, cy = (i % COLS) * T * esc, (i // COLS) * T * esc
        for y in range(T):
            for x in range(T):
                c = t.get(x, y)
                if c[3] == 0:
                    continue
                for dy in range(esc):
                    for dx in range(esc):
                        li.set(cx + x * esc + dx, cy + y * esc + dy, c)
        A.texto_pixel(li, cx + 2, cy + 2, str(i), A.hex_rgb('#ffe680'))
    return li


# ===========================================================================
# MAIN
# ===========================================================================

def main():
    necesarios = bordes_necesarios()
    print('bordes que usa el mapa: ' +
          ', '.join('%s %d' % (m, len(v)) for m, v in sorted(necesarios.items())))
    h, grandes, lienzos = construye(necesarios)
    if not os.path.isdir(DESTINO):
        os.makedirs(DESTINO)

    sheet = hoja(h.tiles, COLS)
    sheet.guardar(os.path.join(DESTINO, 'tileset_mina.png'))
    ref_indice(h.tiles).guardar(os.path.join(DESTINO, 'ref_mina.png'))
    print('tileset fijo hecho (%d tiles)' % len(h.tiles))

    # ── LOS LIQUIDOS, POR FOTOGRAMAS ───────────────────────────────────────
    liquidos = {}
    for material, F, fps, fotos in (
            ('lava', FOTOS_LAVA, FPS_LAVA, P.lava_fotogramas(PARCHE_LIQ, S, FOTOS_LAVA)),
            ('agua', FOTOS_AGUA, FPS_AGUA, P.agua_fotogramas(PARCHE_LIQ, S + 6, FOTOS_AGUA))):
        hojas, indices = construye_liquido(material, fotos, necesarios[material])
        imagenes = []
        for f, hj in enumerate(hojas):
            nombre = 'tileset_%s_%d.png' % (material, f)
            hoja(hj.tiles, COLS).guardar(os.path.join(DESTINO, nombre))
            imagenes.append('Game/MAPAS/Mina/' + nombre)
        n = len(hojas[0].tiles)
        liquidos[material] = {
            'imagenes': imagenes,
            'fotogramas': F,
            'fps': fps,
            'tiles': n,
            'columnas': COLS,
            'filas': (n + COLS - 1) // COLS,
            'indices': indices,
        }
        print('tileset_%s_*.png  %d fotogramas de %d tiles' % (material, F, n))

    # ── EL ATLAS DE PIEZAS ─────────────────────────────────────────────────
    # Un solo PNG con todas las piezas grandes, empaquetado por estantes.
    orden = sorted(lienzos.items(), key=lambda kv: (-kv[1][0].h, kv[0]))
    ancho_atlas = 512
    margen = 1
    x = y = fila_alta = 0
    marcos = {}
    for nombre, (li, alta) in orden:
        if x + li.w + margen > ancho_atlas:
            x = 0
            y += fila_alta + margen
            fila_alta = 0
        marcos[nombre] = (x, y, li.w, li.h, alta)
        x += li.w + margen
        fila_alta = max(fila_alta, li.h)
    alto_atlas = y + fila_alta + margen
    atlas = Lienzo(ancho_atlas, alto_atlas)
    for nombre, (px, py, pw, ph, _) in marcos.items():
        atlas.pegar(lienzos[nombre][0], px, py)
    atlas.guardar(os.path.join(DESTINO, 'piezas.png'))
    ficha_atlas = {
        'frames': {
            nombre: {
                'frame': {'x': px, 'y': py, 'w': pw, 'h': ph},
                'rotated': False, 'trimmed': False,
                'spriteSourceSize': {'x': 0, 'y': 0, 'w': pw, 'h': ph},
                'sourceSize': {'w': pw, 'h': ph},
            } for nombre, (px, py, pw, ph, _) in sorted(marcos.items())
        },
        'meta': {
            'image': 'piezas.png',
            'size': {'w': ancho_atlas, 'h': alto_atlas},
            'scale': '1',
            'app': 'tools/generar-mina.py',
            'nota': ('Las piezas de `altas` se ponen como SPRITE y su orden de '
                     'dibujo lo decide gf-profundidad.js. Su sombra la pone '
                     'gf-sombras.js: por eso NINGUNA lleva sombra pintada.'),
            'altas': sorted(n for n, m in marcos.items() if m[4]),
        },
    }
    with io.open(os.path.join(DESTINO, 'piezas.json'), 'w', encoding='utf-8') as fh:
        fh.write(json.dumps(ficha_atlas, ensure_ascii=False, indent=1))

    # ── LA BURBUJA: 6 fotogramas de 32x32 ──────────────────────────────────
    hoja(P.burbujas_lava(), 6).guardar(os.path.join(DESTINO, 'lava_burbuja.png'))

    filas = (len(h.tiles) + COLS - 1) // COLS
    ficha = {
        'nombre': 'Mina',
        'imagen': 'Game/MAPAS/Mina/tileset_mina.png',
        'tile': T,
        'columnas': COLS,
        'filas': filas,
        'tiles': len(h.tiles),
        'generado_por': 'tools/generar-mina.py',
        'nota': ('Indices BASE 0, como la hoja de referencia. En el .json de '
                 'Tiled hay que sumarles el firstgid de su tileset.'),
        'muro': {
            'alto_tiles': ALTO_MURO,
            'alto_px': ALTO_MURO * T,
            'ancho_tiles': ANCHO_MURO,
            'nota': ('muro_<fila>_<col>: fila 0 es el remate y la ultima el pie '
                     'que toca el suelo. Los extremos son muro_izq/der_<fila>.'),
        },
        'parche_suelo': {'lado': PARCHE_SUELO, 'nota': 'suelo_p<i><j>, i = x mod 8, j = y mod 8.'},
        'parche_grava': {'lado': PARCHE_LIQ, 'nota': ('grava_p<i><j> y grava_b_<lado>_<i><j>; '
                                                      'solo los bordes que usa el mapa.')},
        'parche_tabla': {'lado': PARCHE, 'nota': 'tabla_p<i><j>; los puentes, puente_<n|c|s>_<i>.'},
        'parche_lava': {'lado': PARCHE_LIQ, 'nota': 'lava_p<i><j>, en el tileset de la lava.'},
        'parche_agua': {'lado': PARCHE_LIQ, 'nota': 'agua_p<i><j>, en el tileset del agua.'},
        'parche_roca': {'lado': PARCHE, 'nota': 'roca_top_<i><j>, con i = x mod 4 y j = y mod 4.'},
        'lados_borde': LADOS,
        'piezas_grandes': {
            'atlas': 'Game/MAPAS/Mina/piezas.png',
            'nota': ('Las `alta:true` van como sprite para que el jugador pueda '
                     'pasar por detras. Las planas, ademas, como tiles '
                     '<pieza>_<columna><fila> en la capa de objetos.'),
            'medidas': {k: {'ancho': v[0], 'alto': v[1],
                            'px': [v[0] * T, v[1] * T],
                            'alta': bool(lienzos[k][1])}
                        for k, v in sorted(grandes.items())},
        },
        'liquidos': liquidos,
        'animacion': {
            'burbuja': 'Game/MAPAS/Mina/lava_burbuja.png',
            'burbuja_fotograma': T,
            'como': ('La lava y el agua van en la capa `mina_bordes` con su propio '
                     'tileset. La escena cambia la imagen de ese tileset '
                     '(tileset.setImage) a `fps` fotogramas por segundo: se anima '
                     'el lago entero, orilla incluida, sin redibujar un pixel.'),
        },
        'indices': h.indices,
        'tiles_detalle': h.fichas,
    }
    with io.open(os.path.join(DESTINO, 'tileset_mina.json'), 'w',
                 encoding='utf-8') as fh:
        fh.write(json.dumps(ficha, ensure_ascii=False, indent=1))

    print('tileset_mina.png  %d tiles de %dx%d  %d columnas x %d filas  (%dx%d px)'
          % (len(h.tiles), T, T, COLS, filas, sheet.w, sheet.h))
    print('  muro: %d casillas = %d px (el personaje mide 102)'
          % (ALTO_MURO, ALTO_MURO * T))
    print('piezas.png        %d piezas (%d altas, en 2.5D)  %dx%d px'
          % (len(marcos), sum(1 for m in marcos.values() if m[4]),
             ancho_atlas, alto_atlas))
    print('escrito en', DESTINO)


if __name__ == '__main__':
    main()
