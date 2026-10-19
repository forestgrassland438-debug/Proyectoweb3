#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
TRES MAPAS NUEVOS: EL CEMENTERIO, EL DESIERTO Y LA TUNDRA         (2026-10-18)
=============================================================================

"Quiero 3 mapas nuevos del mismo tamaño que el mapa salvaje: uno de un
cementerio (todo 2.5D, los enemigos en 2.5D y TODO zona PvP como el mapa
salvaje), uno del desierto (clima de arena a veces sí y a veces no,
remolinos y cactus 2.5D; cerca de un remolino te arrastra poco a poco y
dentro te quita vida, pero el remolino no persigue: sigue su rumbo) y otro
que inventes. Buenos gráficos en el piso y el agua, como en el mapa salvaje,
con su recortada integrada. Ajustado al tamaño de los demás mapas."

LOS TRES SE ENGANCHAN A LAS TRES SALIDAS CERRADAS DEL MAPA SALVAJE
  · OESTE  (en su zona PvP)   -> EL CEMENTERIO DE LAS ALMAS (mundo 7), se
    entra por su borde ESTE, por el camino de tierra que sigue al suyo.
  · SUR                       -> EL DESIERTO ABRASADOR (mundo 8), se entra
    por su borde NORTE.
  · NORTE                     -> LA TUNDRA HELADA (mundo 9, el inventado),
    se entra por su borde SUR.

CADA MAPA (314 x 314 casillas de 16 = 5024 px, como el salvaje)
  · El SUELO se compone con el tileset del pueblo y las MISMAS reglas que el
    mapa salvaje (generar-salvaje.py: esquinas de hierba y tierra, orillas por
    ocho vecinos, bloques de piedra con bordillo), se pinta, se le pasa el
    detalle del pueblo (detallar-captura-mapa.py) y se vuelve a colorear en
    su bioma (gf_biomas.py). El tileset recoloreado (tiles_<zona>.png) es del
    que lee el agua que se mueve (gf-agua.js).
  · La tundra, además, tiene el LAGO HELADO: un anillo de hielo pisable
    pintado sobre el suelo (bandas lisas y grietas en raya) con el agua
    abierta en medio.
  · El desierto, las ONDAS DE LA ARENA: rayas onduladas sueltas (líneas,
    nunca puntos).
  · OBJETOS 2.5D (gf_props3d.py) en un atlas por mapa con su punto de apoyo
    por fotograma; ÁRBOLES del paquete (gf_arboles_zona.py) como en el
    salvaje; cada uno con su huella que choca.
  · Capas: suelo, arboles, objetos, colisiones, salidas, zonas, aparicion,
    monstruos, carteles y, en el desierto, remolinos.

QUÉ ESCRIBE (por mapa <z>)
  Maps/<z>.json                            el mapa
  Game/MAPAS/<z>/tiles_<z>.png             el tileset del pueblo en el bioma
  Game/MAPAS/<z>/objetos.png + .json       los objetos 2.5D (atlas)
  Game/MAPAS/<z>/arboles/*.png             los árboles
  recortadas_<z>/                          el suelo en trozos (con --suelo)

USO
  python tools/generar-zonas.py [cementerio|desierto|tundra ...] [--suelo]
Sin --suelo solo rehace el mapa y los objetos (rápido); con --suelo pinta,
detalla, recolorea y trocea (unos minutos por mapa). Determinista.
=============================================================================
"""
import importlib.util
import json
import math
import os
import random
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
BIN = os.path.dirname(AQUI)
PAQUETE = os.path.join(BIN, '..', 'tileset_nuevos')

_spec = importlib.util.spec_from_file_location('generar_salvaje', os.path.join(AQUI, 'generar-salvaje.py'))
GS = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(GS)

import gf_biomas  # noqa: E402
import gf_props3d  # noqa: E402
import gf_arboles_zona  # noqa: E402

T, N = GS.T, GS.N
W = N * T
VERSION = '20261019c'   # (2026-10-19) la playa de los oasis del desierto
ESCALA_ARBOL = 1.3
TILESET = GS.TILESET
# La entrada de cada mapa: el camino que sigue al de la salida del salvaje.
CAM_Y0, CAM_Y1 = GS.CAM_Y0, GS.CAM_Y1            # filas 133-144 (bordillos)
CUERPO_Y0, CUERPO_Y1 = GS.CUERPO_Y0, GS.CUERPO_Y1  # filas 134-143
CRUCE_X0, CRUCE_X1 = GS.CRUCE_X0, GS.CRUCE_X1    # columnas 218-225
ENTRADA_X = (CRUCE_X0 + CRUCE_X1 + 1) * T // 2   # 3552: el centro del camino norte-sur
ENTRADA_Y = (CUERPO_Y0 + CUERPO_Y1 + 1) * T // 2  # 2224


# ─────────────────────────────────────────────────────────── AYUDAS
def rect_set(x0, y0, x1, y1):
    return GS.rect_set(max(0, x0), max(0, y0), min(N - 1, x1), min(N - 1, y1))


def elipse_set(cx, cy, rx, ry, semilla=0, rugoso=0.18):
    """Casillas de una elipse de borde irregular (ruido suave)."""
    borde = GS.ruido_valor(semilla, 6)
    out = set()
    for y in range(int(cy - ry - 3), int(cy + ry + 4)):
        for x in range(int(cx - rx - 3), int(cx + rx + 4)):
            if not (0 <= x < N and 0 <= y < N):
                continue
            d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
            if d <= 1 - rugoso + borde(x, y) * rugoso * 2:
                out.add((x, y))
    return out


def distancias(agua, hasta=14):
    dist = {c: 0 for c in agua}
    frente = list(agua)
    for paso in range(1, hasta + 1):
        nuevo = []
        for (x, y) in frente:
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    c = (x + dx, y + dy)
                    if 0 <= c[0] < N and 0 <= c[1] < N and c not in dist:
                        dist[c] = paso
                        nuevo.append(c)
        frente = nuevo
    return dist


def orilla(dist, semilla, base=4, extra=7):
    ancho = GS.ruido_valor(semilla, 9)
    return {c for c, dd in dist.items() if dd and dd <= base + int(ancho(*c) * extra)}


def manchas(semilla, umbral, excluir):
    m = GS.ruido_valor(semilla, 18)
    out = set()
    for y in range(4, N - 4):
        for x in range(4, N - 4):
            if m(x, y) >= umbral and not excluir(x, y):
                out.add((x, y))
    return out


def plaza(piedra, x0, y0, x1, y1):
    """Bloque de piedra con su bordillo: las nueve piezas del pueblo."""
    B, L = GS.BLOQUE, GS.LADRILLO
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if y == y0:
                g = B['NO'] if x == x0 else B['NE'] if x == x1 else B['N'][x % 2]
            elif y == y1:
                g = B['SO'] if x == x0 else B['SE'] if x == x1 else B['S'][x % 2]
            elif x == x0:
                g = B['O1'] if y == y0 + 1 else B['O'][y % 2]
            elif x == x1:
                g = B['E1'] if y == y0 + 1 else B['E'][y % 2]
            else:
                g = L[(y - y0 - 1) % 4] + (x - x0 - 1) % 4
            piedra[(x, y)] = g


class Zona(object):
    """Lo que se va colocando en un mapa, con su comprobación de sitio libre."""

    def __init__(self, nombre, semilla):
        self.nombre = nombre
        self.rnd = random.Random(semilla)
        self.agua, self.tierra, self.piedra, self.hielo = set(), set(), {}, set()
        self.dist = {}
        self.arboles, self.objetos, self.colisiones = [], [], []
        self.monstruos, self.carteles, self.salidas, self.zonas = [], [], [], []
        self.aparicion, self.remolinos = [], []
        self.ocupado = []          # (x, y, radio) en px
        self.reservado = []        # rectángulos (px) donde no va nada suelto

    # ── el suelo ──
    def es_agua_px(self, px, py):
        return (int(px // T), int(py // T)) in self.agua

    def cerca_agua(self, px, py, casillas):
        return self.dist.get((int(px // T), int(py // T)), 99) <= casillas

    def suelo_de(self, px, py):
        c = (int(px // T), int(py // T))
        if c in self.agua:
            return 'agua'
        if c in self.piedra:
            return 'piedra'
        if c in self.hielo:
            return 'hielo'
        if c in self.tierra:
            return 'tierra'
        return 'campo'

    def libre(self, px, py, radio, suelos=('campo',), margen_agua=2):
        if px < 48 or py < 48 or px > W - 48 or py > W - 48:
            return False
        for dx, dy in ((0, 0), (-radio, 0), (radio, 0), (0, -radio * 0.5), (0, radio * 0.3)):
            if self.suelo_de(px + dx, py + dy) not in suelos:
                return False
        if self.cerca_agua(px, py, margen_agua):
            return False
        for (x0, y0, x1, y1) in self.reservado:
            if x0 - radio < px < x1 + radio and y0 - radio < py < y1 + radio:
                return False
        for (ox, oy, orad) in self.ocupado:
            if (ox - px) ** 2 + ((oy - py) * 1.4) ** 2 < (orad + radio) ** 2:
                return False
        return True

    # ── lo que se pone ──
    def poner_objeto(self, nombre, px, py, fotos, radio=None, choca=True):
        f = fotos[nombre]
        hw, hh = f['huella']
        self.objetos.append({'nombre': nombre, 'x': round(px), 'y': round(py), 'sombra': f['sombra']})
        if choca and hw and hh:
            self.colisiones.append({'x': round(px - hw / 2), 'y': round(py - hh), 'width': round(hw), 'height': round(hh), 'name': nombre})
        self.ocupado.append((px, py, radio if radio is not None else max(hw, hh) * 0.6 + 6))

    def poner_arbol(self, nombre, px, py):
        self.arboles.append({'nombre': nombre, 'x': round(px), 'y': round(py)})
        w, h = 30 * ESCALA_ARBOL, 10 * ESCALA_ARBOL + 4
        self.colisiones.append({'x': round(px - w / 2), 'y': round(py - h), 'width': round(w), 'height': round(h), 'name': 'tronco'})
        self.ocupado.append((px, py, 46))

    def esparcir(self, nombres, cuantos, caja, radio, suelos=('campo',), pesos=None, sep=0, fotos=None, intentos=40, arbol=False, margen_agua=2):
        x0, y0, x1, y1 = caja
        puestos = 0
        for _ in range(cuantos * intentos):
            if puestos >= cuantos:
                break
            px, py = self.rnd.uniform(x0, x1), self.rnd.uniform(y0, y1)
            if not self.libre(px, py, max(radio, sep), suelos, margen_agua):
                continue
            n = self.rnd.choices(nombres, weights=pesos)[0] if pesos else nombres[self.rnd.randrange(len(nombres))]
            if arbol:
                self.poner_arbol(n, px, py)
            else:
                self.poner_objeto(n, px, py, fotos, radio=max(radio, sep))
            puestos += 1
        return puestos

    def monstruos_en(self, tipo, n, caja, lejos_de, sep=520):
        x0, y0, x1, y1 = caja
        puestos = 0
        for _ in range(8000):
            if puestos >= n:
                break
            px, py = self.rnd.uniform(x0, x1), self.rnd.uniform(y0, y1)
            if self.suelo_de(px, py) == 'agua' or self.cerca_agua(px, py, 3):
                continue
            if any((ox - px) ** 2 + (oy - py) ** 2 < 70 ** 2 for ox, oy, _r in self.ocupado):
                continue
            if any((m['x'] - px) ** 2 + (m['y'] - py) ** 2 < sep ** 2 for m in self.monstruos):
                continue
            if (px - lejos_de[0]) ** 2 + (py - lejos_de[1]) ** 2 < 1000 ** 2:
                continue
            self.monstruos.append({'tipo': tipo, 'x': round(px), 'y': round(py)})
            puestos += 1
        return puestos


# ===========================================================================
# EL CEMENTERIO DE LAS ALMAS (mundo 7, todo PvP)
# ===========================================================================
def disenar_cementerio(z, fotos):
    rnd = z.rnd
    LAGO = (62, 236, 32, 22)
    ESTANQUE = (264, 50, 14, 9)
    z.agua = elipse_set(*LAGO, semilla=701) | elipse_set(*ESTANQUE, semilla=702)
    z.dist = distancias(z.agua)
    z.tierra |= orilla(z.dist, 703, base=3, extra=5)
    # Caminos de tierra: el que viene del salvaje (este-oeste) y el norte-sur.
    z.tierra |= rect_set(6, CUERPO_Y0, N - 1, CUERPO_Y1)
    z.tierra |= rect_set(150, 10, 159, N - 10)
    # El camino que rodea el lago y sube al estanque.
    z.tierra |= rect_set(96, 196, 103, CUERPO_Y0)
    z.tierra |= rect_set(232, 46, 239, CUERPO_Y0)
    # La plaza de la cripta.
    PLAZA = (126, 92, 183, 131)
    plaza(z.piedra, *PLAZA)
    # Barro suelto por los prados.
    def fuera(x, y):
        return (PLAZA[0] - 6 <= x <= PLAZA[2] + 6 and PLAZA[1] - 6 <= y <= PLAZA[3] + 6) or x > N - 26
    z.tierra |= manchas(704, 0.84, fuera)
    z.tierra -= z.agua
    for c in list(z.piedra):
        z.tierra.discard(c)

    # La llegada, a ~230 px del borde (como en gf-zonas.js): un empujón no
    # te devuelve por la misma salida.
    entrada = (W - 234, ENTRADA_Y)
    z.aparicion.append({'name': 'desde_salvaje', 'x': entrada[0], 'y': entrada[1] - 16})
    z.salidas.append({'name': 'salvaje', 'x': W - 20, 'y': CAM_Y0 * T, 'width': 20, 'height': (CAM_Y1 - CAM_Y0 + 1) * T})
    z.zonas.append({'name': 'pvp', 'x': 0, 'y': 0, 'width': W, 'height': W})
    z.carteles += [
        {'name': 'bienvenida', 'x': W - 260, 'y': CAM_Y0 * T - 8, 'texto': 'Cemetery of Lost Souls — PvP everywhere!'},
        {'name': 'salvaje', 'x': W - 96, 'y': (CAM_Y1 + 1) * T + 70, 'texto': 'To the wild lands'},
        {'name': 'cripta', 'x': (PLAZA[0] + 3) * T, 'y': (PLAZA[3] + 4) * T, 'texto': 'The Old Crypt'},
    ]
    # Nada suelto en la entrada (que se vea el camino al llegar).
    z.reservado.append((W - 380, CAM_Y0 * T - 120, W, (CAM_Y1 + 1) * T + 120))

    # ── la cripta y la plaza ──
    px0, py0, px1, py1 = PLAZA[0] * T, PLAZA[1] * T, (PLAZA[2] + 1) * T, (PLAZA[3] + 1) * T
    cx = (px0 + px1) / 2
    z.poner_objeto('cripta', cx, py0 + 400, fotos, radio=200)
    for sx in (-1, 1):
        z.poner_objeto('obelisco', cx + sx * 380, py0 + 90, fotos)
        z.poner_objeto('obelisco', cx + sx * 380, py1 - 70, fotos)
        z.poner_objeto('estatua', cx + sx * 130, py1 - 110, fotos)
        z.poner_objeto('farola', cx + sx * 180, py0 + 440, fotos, radio=20)
        z.poner_objeto('lapida_angel', cx + sx * 300, py0 + 300, fotos)
        z.poner_objeto('lapida_angel', cx + sx * 300, py0 + 470, fotos)

    # ── los campos de tumbas ──
    campos = [(20, 20, 120, 124, True), (190, 22, 300, 124, False), (20, 150, 140, 300, False), (166, 150, 300, 300, True)]
    tipos = ['lapida_redonda', 'lapida_alta', 'lapida_cruz', 'lapida_rota', 'lapida_angel', 'obelisco', 'tumba_abierta', 'ataud']
    pesos = [30, 20, 26, 9, 4, 3, 5, 3]
    for (fx0, fy0, fx1, fy1, verja) in campos:
        fila = 0
        y = (fy0 + 4) * T
        while y < (fy1 - 2) * T:
            desfase = 26 if fila % 2 else -10
            x = (fx0 + 3) * T + desfase
            while x < (fx1 - 2) * T:
                if rnd.random() < 0.8:
                    px, py = x + rnd.uniform(-7, 7), y + rnd.uniform(-5, 5)
                    n = rnd.choices(tipos, weights=pesos)[0]
                    if z.libre(px, py, 30, ('campo', 'tierra')):
                        z.poner_objeto(n, px, py, fotos, radio=30)
                x += 84
            y += 118
            fila += 1
        if verja:
            # Verja al norte y al sur del campo, con su puerta en medio.
            for yy in (fy0 * T + 6, (fy1 + 1) * T - 6):
                xx = fx0 * T + 32
                k = 0
                medio = ((fx1 - fx0) * T) // 128
                while xx < (fx1 + 1) * T - 32:
                    if abs(k - medio) > 0 and z.suelo_de(xx, yy) in ('campo', 'tierra') and not z.cerca_agua(xx, yy, 2):
                        z.poner_objeto('verja', xx, yy, fotos, radio=0)
                    xx += 64
                    k += 1

    # ── las farolas de los caminos ──
    for x in range(40, N - 12, 22):
        for y in (CAM_Y0 - 1, CAM_Y1 + 2):
            px, py = x * T + 8, y * T
            if z.libre(px, py, 14, ('campo', 'tierra'), margen_agua=1):
                z.poner_objeto('farola', px, py, fotos, radio=20)
    for y in range(20, N - 12, 22):
        for x in (149, 161):
            px, py = x * T + 8, y * T
            if z.libre(px, py, 14, ('campo', 'tierra'), margen_agua=1):
                z.poner_objeto('farola', px, py, fotos, radio=20)

    # ── los árboles muertos ──
    nombres, pa = ['seco_ceniza', 'seco'], [7, 3]
    z.esparcir(nombres, 70, (PLAZA[0] * T, 20 * T, (PLAZA[2] + 1) * T, (PLAZA[1] - 2) * T), 60, pesos=pa, sep=96, arbol=True)
    for caja in ((40, 40, 300, 400), (40, 40, W - 40, 300), (40, W - 300, W - 40, W - 40), (40, 40, 260, W - 40)):
        z.esparcir(nombres, 60, caja, 60, pesos=pa, sep=110, arbol=True)
    z.esparcir(nombres, 90, (40, 40, W - 40, W - 40), 60, pesos=pa, sep=150, arbol=True)

    # ── los monstruos (todo es PvP: por todas partes) ──
    for tipo, n in (('nigromante_cementerio', 1),):
        z.monstruos.append({'tipo': tipo, 'x': round(cx + 40), 'y': round(py1 - 40)})
    for tipo, n, caja in (('golem_cripta', 2, (px0 - 400, py0 - 300, px1 + 400, py1 + 300)),
                          # (2026-10-19) Más esqueletos: arqueros y guerreros.
                          ('esqueleto_cementerio', 8, (80, 80, W - 80, W - 80)),
                          ('esqueleto_guerrero', 8, (80, 80, W - 80, W - 80)),
                          ('zombi_cementerio', 4, (80, 80, W - 80, W - 80)),
                          ('zombi_podrido', 3, (80, 80, W - 80, W - 80)),
                          ('espectro_cementerio', 3, (80, 80, W - 80, W - 80))):
        z.monstruos_en(tipo, n, caja, entrada)


# ===========================================================================
# EL DESIERTO ABRASADOR (mundo 8; PvP al sur de y = 2600)
# ===========================================================================
PVP_DESIERTO_Y = 2600


def disenar_desierto(z, fotos):
    rnd = z.rnd
    OASIS_N = (190, 74, 24, 14)
    OASIS_S = (252, 252, 20, 13)
    OASIS_O = (42, 120, 14, 10)
    z.agua = elipse_set(*OASIS_N, semilla=801) | elipse_set(*OASIS_S, semilla=802) | elipse_set(*OASIS_O, semilla=803)
    z.oasis = [OASIS_N, OASIS_S, OASIS_O]          # para la playa (pintar_playa)
    z.dist = distancias(z.agua)
    z.playa = orilla(z.dist, 804, base=3, extra=4)  # la banda que se pinta de playa
    z.tierra |= z.playa
    # Caminos de arena prensada: el que baja del salvaje, el que cruza.
    z.tierra |= rect_set(CRUCE_X0, 0, CRUCE_X1, 200)
    z.tierra |= rect_set(30, 150, 290, 158)
    z.tierra |= rect_set(96, 159, 103, 212)
    CAMPAMENTO = (204, 60, 241, 82)
    RUINAS = (70, 212, 125, 250)
    plaza(z.piedra, *CAMPAMENTO)
    plaza(z.piedra, *RUINAS)
    def fuera(x, y):
        return (CAMPAMENTO[0] - 8 <= x <= CAMPAMENTO[2] + 8 and CAMPAMENTO[1] - 8 <= y <= CAMPAMENTO[3] + 8)
    z.tierra |= manchas(805, 0.86, fuera)
    z.tierra -= z.agua
    for c in list(z.piedra):
        z.tierra.discard(c)

    entrada = (ENTRADA_X, 230)
    z.aparicion.append({'name': 'desde_salvaje', 'x': entrada[0], 'y': entrada[1]})
    z.salidas.append({'name': 'salvaje', 'x': (CRUCE_X0 - 1) * T, 'y': 0, 'width': (CRUCE_X1 - CRUCE_X0 + 3) * T, 'height': 20})
    z.zonas.append({'name': 'pvp', 'x': 0, 'y': PVP_DESIERTO_Y, 'width': W, 'height': W - PVP_DESIERTO_Y})
    z.zonas.append({'name': 'neutral', 'x': 0, 'y': 0, 'width': W, 'height': PVP_DESIERTO_Y})
    z.carteles += [
        {'name': 'bienvenida', 'x': (CRUCE_X1 + 1) * T + 40, 'y': 220, 'texto': 'Scorching Desert — beware the sand whirls!'},
        {'name': 'salvaje', 'x': (CRUCE_X0 - 1) * T - 40, 'y': 150, 'texto': 'To the wild lands'},
        {'name': 'pvp', 'x': (CRUCE_X1 + 1) * T + 40, 'y': PVP_DESIERTO_Y - 30, 'texto': 'PvP zone — swords on!'},
        {'name': 'pvp2', 'x': 104 * T + 40, 'y': PVP_DESIERTO_Y - 30, 'texto': 'PvP zone — swords on!'},
        {'name': 'ruinas', 'x': (RUINAS[0] + 2) * T, 'y': (RUINAS[1] - 2) * T, 'texto': 'Sunken Ruins'},
    ]
    z.reservado.append((ENTRADA_X - 220, 0, ENTRADA_X + 220, 300))

    # ── el campamento de la caravana ──
    cx0, cy0, cx1, cy1 = CAMPAMENTO[0] * T, CAMPAMENTO[1] * T, (CAMPAMENTO[2] + 1) * T, (CAMPAMENTO[3] + 1) * T
    for (tx, ty) in ((cx0 + 110, cy0 + 120), (cx1 - 110, cy0 + 120), (cx0 + 110, cy1 - 40), (cx1 - 110, cy1 - 40)):
        z.poner_objeto('tienda', tx, ty, fotos, radio=60)
    for k in range(6):
        z.poner_objeto('vasija', cx0 + 220 + k * 34, cy1 - 30 - (k % 2) * 14, fotos, radio=14)
    # Palmeras alrededor de los oasis.
    for (ox, oy, rx, ry) in (OASIS_N, OASIS_S, OASIS_O):
        for k in range(18):
            a = k / 18.0 * math.tau + rnd.uniform(-0.12, 0.12)
            px = (ox + math.cos(a) * (rx + 6)) * T
            py = (oy + math.sin(a) * (ry + 6)) * T + 40
            if z.libre(px, py, 40, ('campo', 'tierra'), margen_agua=1):
                z.poner_arbol(rnd.choice(['palmera_cocotera', 'palmera_abanico']), px, py)

    # ── las ruinas ──
    rx0, ry0, rx1, ry1 = RUINAS[0] * T, RUINAS[1] * T, (RUINAS[2] + 1) * T, (RUINAS[3] + 1) * T
    z.poner_objeto('arco_ruinas', (rx0 + rx1) / 2, ry0 + 140, fotos, radio=90)
    for k in range(6):
        for sy in (ry0 + 260, ry1 - 80):
            z.poner_objeto('columna_rota', rx0 + 90 + k * 140, sy, fotos, radio=30)
    z.poner_objeto('obelisco_desierto', rx0 + 60, ry0 + 100, fotos)
    z.poner_objeto('obelisco_desierto', rx1 - 60, ry0 + 100, fotos)
    for k in range(8):
        z.esparcir(['vasija'], 1, (rx0 + 40, ry0 + 40, rx1 - 40, ry1 - 40), 16, suelos=('piedra',), fotos=fotos)

    # ── las mesas de arenisca, las rocas, los huesos ──
    for (mx, my) in ((900, 900), (4300, 700), (600, 2900), (2900, 3600), (4500, 4300), (1800, 4500), (3700, 2500)):
        if z.libre(mx, my, 110, margen_agua=4):
            z.poner_objeto('mesa_roca', mx, my, fotos, radio=120)
    z.esparcir(['roca_arenisca', 'roca_arenisca2'], 70, (60, 60, W - 60, W - 60), 34, fotos=fotos, sep=90)
    z.esparcir(['costillas'], 4, (300, 600, W - 300, W - 300), 70, fotos=fotos, sep=600)
    z.esparcir(['craneo'], 14, (100, 300, W - 100, W - 100), 20, fotos=fotos, sep=300)

    # ── los cactus: bosquecillos (por ruido) y sueltos ──
    bosque = GS.ruido_valor(806, 22)
    nombres = ['saguaro', 'saguaro_bajo', 'cactus_barril', 'nopal', 'cactus_pequeno']
    pesos = [26, 20, 18, 18, 18]
    puestos = 0
    for _ in range(26000):
        if puestos >= 520:
            break
        px, py = rnd.uniform(60, W - 60), rnd.uniform(240, W - 60)
        if bosque(px / T, py / T) < 0.6 and rnd.random() < 0.7:
            continue
        if not z.libre(px, py, 26, margen_agua=3):
            continue
        z.poner_objeto(rnd.choices(nombres, weights=pesos)[0], px, py, fotos, radio=30)
        puestos += 1

    # ── LOS REMOLINOS: cada uno sigue SU vuelta (no persigue a nadie). Se
    #    calculan con la hora del servidor en cada navegador (gf-zonas.js):
    #    todos los ven en el mismo sitio sin mandarse nada. ──
    for i, (rcx, rcy, rrx, rry, per) in enumerate((
            (1400, 1450, 520, 300, 46), (3950, 1900, 380, 340, 40), (1250, 3300, 560, 300, 52),
            (3350, 3450, 500, 420, 50), (2450, 4350, 700, 260, 58), (4350, 3050, 300, 560, 44),
            (2300, 2100, 420, 260, 38))):
        z.remolinos.append({'name': 'remolino_%d' % i, 'x': rcx, 'y': rcy,
                            'propiedades': {'rx': rrx, 'ry': rry, 'periodo': per, 'fase': round(i * 0.9, 2),
                                            'vaiven': 70 + (i % 3) * 30}})

    # ── los monstruos ──
    for tipo, n, caja in (('escorpion_desierto', 3, (100, 300, W - 100, PVP_DESIERTO_Y - 100)),
                          ('escorpion_desierto', 4, (100, PVP_DESIERTO_Y + 100, W - 100, W - 100)),
                          ('momia_desierto', 1, (100, 600, W - 100, PVP_DESIERTO_Y - 100)),
                          ('momia_desierto', 3, (rx0 - 300, ry0 - 300, rx1 + 300, ry1 + 300)),
                          ('golem_arena', 1, (100, 600, W - 100, PVP_DESIERTO_Y - 100)),
                          ('golem_arena', 2, (100, PVP_DESIERTO_Y + 100, W - 100, W - 100))):
        z.monstruos_en(tipo, n, caja, entrada)


# ===========================================================================
# LA TUNDRA HELADA (mundo 9, el inventado; PvP al norte de y = 2400)
# ===========================================================================
PVP_TUNDRA_Y = 2400
LAGO_HELADO = (112, 150, 66, 46)       # el hielo
LAGO_ABIERTO = (112, 150, 34, 22)      # el agua abierta en medio


def disenar_tundra(z, fotos):
    rnd = z.rnd
    z.agua = elipse_set(*LAGO_ABIERTO, semilla=901, rugoso=0.22) | elipse_set(258, 210, 12, 8, semilla=902)
    z.dist = distancias(z.agua)
    hielo = elipse_set(*LAGO_HELADO, semilla=903, rugoso=0.14)
    z.tierra |= orilla(z.dist, 904, base=2, extra=3)
    z.hielo = (hielo - z.agua)
    z.tierra |= z.hielo                            # en la capa de casillas, suelo firme
    z.tierra |= rect_set(CRUCE_X0, 60, CRUCE_X1, N - 1)
    z.tierra |= rect_set(180, 120, 300, 128)
    z.tierra |= rect_set(170, 148, CRUCE_X0, 155)
    CAMPAMENTO = (204, 232, 240, 249)
    SANTUARIO = (196, 30, 246, 58)
    plaza(z.piedra, *CAMPAMENTO)
    plaza(z.piedra, *SANTUARIO)
    def fuera(x, y):
        return (x, y) in hielo or (CAMPAMENTO[0] - 6 <= x <= CAMPAMENTO[2] + 6 and CAMPAMENTO[1] - 6 <= y <= CAMPAMENTO[3] + 6)
    z.tierra |= manchas(905, 0.88, fuera)
    z.tierra -= z.agua
    for c in list(z.piedra):
        z.tierra.discard(c)
        z.hielo.discard(c)

    entrada = (ENTRADA_X, W - 284)
    z.aparicion.append({'name': 'desde_salvaje', 'x': entrada[0], 'y': entrada[1]})
    z.salidas.append({'name': 'salvaje', 'x': (CRUCE_X0 - 1) * T, 'y': W - 20, 'width': (CRUCE_X1 - CRUCE_X0 + 3) * T, 'height': 20})
    z.zonas.append({'name': 'pvp', 'x': 0, 'y': 0, 'width': W, 'height': PVP_TUNDRA_Y})
    z.zonas.append({'name': 'neutral', 'x': 0, 'y': PVP_TUNDRA_Y, 'width': W, 'height': W - PVP_TUNDRA_Y})
    z.carteles += [
        {'name': 'bienvenida', 'x': (CRUCE_X1 + 1) * T + 40, 'y': W - 220, 'texto': 'Frostfang Tundra — mind the thin ice'},
        {'name': 'salvaje', 'x': (CRUCE_X0 - 1) * T - 40, 'y': W - 110, 'texto': 'To the wild lands'},
        {'name': 'pvp', 'x': (CRUCE_X1 + 1) * T + 40, 'y': PVP_TUNDRA_Y + 60, 'texto': 'PvP zone — swords on!'},
        {'name': 'santuario', 'x': (SANTUARIO[0] + 2) * T, 'y': (SANTUARIO[3] + 3) * T, 'texto': 'Frozen Shrine'},
        {'name': 'lago', 'x': (LAGO_HELADO[0] + LAGO_HELADO[2] + 3) * T, 'y': (LAGO_HELADO[1] + 4) * T, 'texto': 'Frozen Lake'},
    ]
    z.reservado.append((ENTRADA_X - 220, W - 320, ENTRADA_X + 220, W))

    # ── el campamento ──
    cx0, cy0, cx1, cy1 = CAMPAMENTO[0] * T, CAMPAMENTO[1] * T, (CAMPAMENTO[2] + 1) * T, (CAMPAMENTO[3] + 1) * T
    z.poner_objeto('hoguera', (cx0 + cx1) / 2, (cy0 + cy1) / 2 + 20, fotos, radio=30)
    for (tx, ty) in ((cx0 - 120, cy0 + 60), (cx1 + 120, cy0 + 60), (cx0 - 120, cy1 + 90)):
        if z.libre(tx, ty, 50, ('campo', 'tierra')):
            z.poner_objeto('iglu', tx, ty, fotos, radio=60)
    for (tx, ty) in ((cx0 + 70, cy0 + 70), (cx1 - 70, cy1 - 50)):
        z.poner_objeto('muneco_nieve', tx, ty, fotos, radio=24)
    # ── el santuario ──
    sx0, sy0, sx1, sy1 = SANTUARIO[0] * T, SANTUARIO[1] * T, (SANTUARIO[2] + 1) * T, (SANTUARIO[3] + 1) * T
    z.poner_objeto('cristal_grande', (sx0 + sx1) / 2, (sy0 + sy1) / 2 + 30, fotos, radio=50)
    for k in range(7):
        a = k / 7.0 * math.tau
        z.poner_objeto('cristal_hielo', (sx0 + sx1) / 2 + math.cos(a) * 260, (sy0 + sy1) / 2 + 30 + math.sin(a) * 130, fotos, radio=26)
    # ── rocas, troncos, cristales y muñecos ──
    z.esparcir(['roca_nevada', 'roca_nevada2'], 80, (60, 60, W - 60, W - 60), 30, fotos=fotos, sep=90)
    z.esparcir(['tronco_nevado'], 26, (60, 60, W - 60, W - 60), 36, fotos=fotos, sep=200)
    z.esparcir(['cristal_hielo'], 30, (60, 60, W - 60, PVP_TUNDRA_Y), 26, fotos=fotos, sep=260)
    z.esparcir(['muneco_nieve'], 6, (2800, 3400, 4700, W - 300), 24, fotos=fotos, sep=400)
    # ── los bosques nevados: densos al norte y al este, sueltos en lo demás ──
    nombres, pa = ['abeto_nevado', 'pino_nevado', 'seco_nevado'], [45, 45, 10]
    bosque = GS.ruido_valor(906, 26)
    puestos = 0
    for _ in range(30000):
        if puestos >= 620:
            break
        px, py = rnd.uniform(60, W - 60), rnd.uniform(60, W - 60)
        denso = py < 700 or px > 4100 or bosque(px / T, py / T) > 0.62
        if not denso and rnd.random() < 0.82:
            continue
        if not z.libre(px, py, 44, margen_agua=4):
            continue
        z.poner_arbol(rnd.choices(nombres, weights=pa)[0], px, py)
        puestos += 1

    # ── los monstruos ──
    for tipo, n, caja in (('lobo_escarcha', 2, (100, PVP_TUNDRA_Y + 100, W - 100, W - 600)),
                          ('lobo_escarcha', 4, (100, 100, W - 100, PVP_TUNDRA_Y - 100)),
                          ('golem_hielo', 1, (100, PVP_TUNDRA_Y + 100, W - 100, W - 600)),
                          ('golem_hielo', 2, (100, 100, W - 100, PVP_TUNDRA_Y - 100)),
                          ('bruja_ventisca', 2, (sx0 - 600, sy0 - 200, sx1 + 600, sy1 + 600))):
        z.monstruos_en(tipo, n, caja, entrada)


DISENOS = {'cementerio': (disenar_cementerio, 707), 'desierto': (disenar_desierto, 808), 'tundra': (disenar_tundra, 909)}
VIDA_AGUA = {'cementerio': 'rio', 'desierto': 'rio', 'tundra': None}


# ===========================================================================
# EL ATLAS DE OBJETOS (cada fotograma con su punto de apoyo)
# ===========================================================================
def atlas_objetos(fotos, ruta_png, ruta_json):
    nombres = sorted(fotos, key=lambda n: (-fotos[n]['foto'].h, n))
    ANCHO, sep = 1024, 2
    x = y = alto_fila = 0
    sitios = {}
    for n in nombres:
        li = fotos[n]['foto']
        if x + li.w > ANCHO:
            x = 0; y += alto_fila + sep; alto_fila = 0
        sitios[n] = (x, y)
        x += li.w + sep
        alto_fila = max(alto_fila, li.h)
    H = y + alto_fila
    hoja = Image.new('RGBA', (ANCHO, H), (0, 0, 0, 0))
    datos = {'frames': {}, 'meta': {'app': 'tools/generar-zonas.py', 'image': os.path.basename(ruta_png),
                                     'format': 'RGBA8888', 'scale': '1', 'size': {'w': ANCHO, 'h': H}}}
    for n in nombres:
        li = fotos[n]['foto']
        x0, y0 = sitios[n]
        hoja.alpha_composite(li.imagen(), (x0, y0))
        ax, ay = fotos[n]['apoyo']
        datos['frames'][n] = {'frame': {'x': x0, 'y': y0, 'w': li.w, 'h': li.h}, 'rotated': False, 'trimmed': False,
                              'spriteSourceSize': {'x': 0, 'y': 0, 'w': li.w, 'h': li.h}, 'sourceSize': {'w': li.w, 'h': li.h},
                              'pivot': {'x': round(ax / li.w, 4), 'y': round(ay / li.h, 4)}}
    hoja.save(ruta_png, optimize=True)
    with open(ruta_json, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(datos, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write('\n')
    print('  objetos: %d fotogramas, hoja %dx%d' % (len(nombres), ANCHO, H))


# ===========================================================================
# EL SUELO PINTADO
# ===========================================================================
def ondas_arena(arr, z, semilla):
    """Las ondas que deja el viento en la arena: rayas onduladas sueltas, un
    poco más oscuras con su luz debajo (líneas, nunca puntos)."""
    rng = random.Random(semilla)
    H, Wd = arr.shape[:2]
    hechas = 0
    for _ in range(26000):
        if hechas >= 5200:
            break
        x0, y0 = rng.uniform(40, Wd - 200), rng.uniform(40, H - 40)
        if z.suelo_de(x0, y0) != 'campo':
            continue
        largo = rng.randint(40, 130)
        fase, onda, amp = rng.uniform(0, 6.3), rng.uniform(0.05, 0.09), rng.uniform(1.5, 3.2)
        pts = []
        ok = True
        for k in range(largo):
            x = int(x0 + k)
            y = int(y0 + math.sin(fase + k * onda) * amp)
            if not (0 <= x < Wd and 1 <= y < H - 1) or z.suelo_de(x, y) != 'campo':
                ok = False
                break
            pts.append((x, y))
        if not ok or len(pts) < 30:
            continue
        for (x, y) in pts[2:-2]:
            arr[y, x, :3] = np.clip(arr[y, x, :3].astype(np.int16) - (26, 26, 20), 0, 255)
            arr[y + 1, x, :3] = np.clip(arr[y + 1, x, :3].astype(np.int16) + (14, 12, 8), 0, 255)
        hechas += 1
    print('  ondas de arena:', hechas)


def pintar_playa(arr, z):
    """LA PLAYA DE LOS OASIS (2026-10-19). "Las orillas del agua del desierto
    están malas en el tileset." Alrededor del agua el diseño pone una banda de
    camino (`orilla`), que en el desierto se vuelve arena prensada rojiza con
    los bordes festoneados de la hierba del pueblo: parecía barro. Encima se
    pinta una playa de verdad, por la DISTANCIA al agua (los píxeles azules):
    arena mojada junto al agua, húmeda, clara, y se funde con la arena del
    desierto. Con las líneas de la marea paralelas a la orilla (líneas, nunca
    puntos) y el ancho variando con un ruido grande, sin tramado. También se
    pinta el terraplén que traen las casillas de agua del pueblo (lo que en
    ellas no es azul), como en el lago helado de la tundra."""
    H, Wd = arr.shape[:2]
    R0, R1 = 150, 190                     # ancho de la playa, en px
    MOJADA, HUMEDA, CLARA = (np.array([206, 172, 118]), np.array([224, 194, 140]), np.array([238, 214, 162]))
    MAREA = np.array([228, 200, 146])
    for (ocx, ocy, orx, ory) in getattr(z, 'oasis', []):
        x0, x1 = int(max(0, (ocx - orx - 14) * T)), int(min(Wd, (ocx + orx + 14) * T))
        y0, y1 = int(max(0, (ocy - ory - 14) * T)), int(min(H, (ocy + ory + 14) * T))
        sub = arr[y0:y1, x0:x1]
        a = sub[..., :3].astype(np.int16)
        azul_real = (a[..., 2] > a[..., 0] + 30) & (a[..., 2] > a[..., 1] + 4)
        # Dónde se puede pintar: la banda de la orilla, las casillas de agua
        # (su terraplén) y la arena lisa. NUNCA la piedra (la plaza de las
        # tiendas) ni los caminos.
        se_pinta = np.zeros(azul_real.shape, bool)
        for ty in range(y0 // T, (y1 + T - 1) // T):
            for tx in range(x0 // T, (x1 + T - 1) // T):
                c = (tx, ty)
                if c in z.piedra:
                    continue                      # la piedra, nunca (aunque caiga en la banda)
                if c in z.playa or c in z.agua or c not in z.tierra:
                    se_pinta[max(0, ty * T - y0):max(0, (ty + 1) * T - y0), max(0, tx * T - x0):max(0, (tx + 1) * T - x0)] = True
        # La orilla REDONDEADA: el agua sale de casillas (escalones), así que
        # la distancia se mide desde su silueta suavizada (media en una caja
        # de 25 px, con la imagen integral), y las líneas de la marea salen
        # en curva y no en escalera.
        integ = np.pad(azul_real.astype(np.float32), ((1, 0), (1, 0))).cumsum(0).cumsum(1)
        k = 12
        hh, ww = azul_real.shape
        ya, yb = np.clip(np.arange(hh) - k, 0, hh), np.clip(np.arange(hh) + k + 1, 0, hh)
        xa, xb = np.clip(np.arange(ww) - k, 0, ww), np.clip(np.arange(ww) + k + 1, 0, ww)
        suma = (integ[yb][:, xb] - integ[ya][:, xb] - integ[yb][:, xa] + integ[ya][:, xa])
        area = ((yb - ya)[:, None] * (xb - xa)[None, :]).astype(np.float32)
        azul = (suma / area) > 0.5
        # La distancia al agua: se crece la máscara un píxel cada vez,
        # alternando cruz y cuadrado (sale un octógono, casi un círculo).
        dist = np.full(azul.shape, 32000, np.int32)
        dist[azul] = 0
        visto = azul.copy()
        borde = azul.copy()
        for d in range(1, R1 + 2):
            g = borde.copy()
            g[1:, :] |= borde[:-1, :]; g[:-1, :] |= borde[1:, :]
            g[:, 1:] |= borde[:, :-1]; g[:, :-1] |= borde[:, 1:]
            if d % 2 == 0:
                g[1:, 1:] |= borde[:-1, :-1]; g[1:, :-1] |= borde[:-1, 1:]
                g[:-1, 1:] |= borde[1:, :-1]; g[:-1, :-1] |= borde[1:, 1:]
            nuevo = g & ~visto
            if not nuevo.any():
                break
            dist[nuevo] = d
            visto |= nuevo
            borde = nuevo
        yy, xx = np.mgrid[y0:y1, x0:x1]
        ruido = (np.sin(xx / 83.0 + 0.7) + np.sin(yy / 57.0 + xx / 173.0)) * 0.5
        R = (R0 + R1) / 2.0 + ruido * (R1 - R0) / 2.0
        playa = (~azul_real) & (dist <= R) & se_pinta
        col = np.where((dist < 8)[..., None], MOJADA, np.where((dist < 22)[..., None], HUMEDA, CLARA)).astype(np.float32)
        # Las líneas de la marea: a tres distancias del agua, de 1 px.
        for L in (40, 80):
            linea = (np.abs(dist - L) < 1) & (dist < R - 30)
            col = np.where(linea[..., None], MAREA, col)
        # Y se funde con la arena del desierto en los últimos 30 px.
        t = np.clip((R - dist) / 30.0, 0.0, 1.0)[..., None]
        orig = a.astype(np.float32)
        mezcla_ = col * t + orig * (1 - t)
        out = sub.copy()
        out[..., :3] = np.where(playa[..., None], np.clip(mezcla_, 0, 255).astype(np.uint8), out[..., :3])
        arr[y0:y1, x0:x1] = out
    print('  playas de los oasis:', len(getattr(z, 'oasis', [])))


def pintar_hielo(arr, z, semilla):
    """El lago helado: hielo celeste en bandas lisas (sin tramado), con su
    orilla de nieve apretada y GRIETAS en raya. Solo donde no es agua."""
    H, Wd = arr.shape[:2]
    cx, cy, rx, ry = [v * T for v in LAGO_HELADO]
    caja_x0, caja_x1 = int(max(0, cx - rx - 2 * T)), int(min(Wd, cx + rx + 2 * T))
    caja_y0, caja_y1 = int(max(0, cy - ry - 2 * T)), int(min(H, cy + ry + 2 * T))
    sub = (slice(caja_y0, caja_y1), slice(caja_x0, caja_x1))
    yy, xx = np.mgrid[caja_y0:caja_y1, caja_x0:caja_x1]
    tile_hielo = np.zeros(yy.shape, bool)
    # El hielo y el agua de dentro del lago: en las casillas de agua, lo que
    # no es azul (el terraplén de la orilla) también se vuelve hielo; así el
    # hielo llega hasta el agua sin escalón de tierra.
    for (tx, ty) in z.hielo | {c for c in z.agua if ((c[0] - LAGO_HELADO[0]) / LAGO_HELADO[2]) ** 2 + ((c[1] - LAGO_HELADO[1]) / LAGO_HELADO[3]) ** 2 < 1.2}:
        y0, x0 = ty * T - caja_y0, tx * T - caja_x0
        if 0 <= y0 < tile_hielo.shape[0] and 0 <= x0 < tile_hielo.shape[1]:
            tile_hielo[y0:y0 + T, x0:x0 + T] = True
    # Sin pisar el agua (que pinta gf-agua) ni su espuma: los píxeles azules.
    a = arr[sub][..., :3].astype(np.int16)
    azul = (a[..., 2] > a[..., 0] + 30) & (a[..., 2] > a[..., 1] + 4)
    m = tile_hielo & ~azul
    d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
    # Bandas lisas: tres tonos por la distancia al centro y un ruido grande.
    ruido = (np.sin(xx / 97.0 + 1.3) + np.sin(yy / 61.0 + xx / 211.0)) * 0.06
    k = d + ruido
    base = np.array([196, 228, 242]); medio = np.array([178, 216, 236]); hondo = np.array([160, 204, 230])
    col = np.where((k < 0.62)[..., None], hondo, np.where((k < 0.82)[..., None], medio, base))
    orilla_nieve = (k > 0.95)
    col = np.where(orilla_nieve[..., None], np.array([232, 242, 250]), col)
    out = arr[sub].copy()
    out[..., :3] = np.where(m[..., None], col, out[..., :3])
    # Grietas: caminos de 1 px que avanzan en zigzag suave.
    r = random.Random(semilla)
    for _ in range(46):
        px, py = r.uniform(cx - rx * 0.8, cx + rx * 0.8), r.uniform(cy - ry * 0.8, cy + ry * 0.8)
        ang = r.uniform(0, math.tau)
        for paso in range(r.randint(60, 180)):
            ang += r.uniform(-0.35, 0.35)
            px += math.cos(ang); py += math.sin(ang) * 0.8
            ix, iy = int(px) - caja_x0, int(py) - caja_y0
            if not (0 <= iy < m.shape[0] and 0 <= ix < m.shape[1]) or not m[iy, ix]:
                break
            out[iy, ix, :3] = (122, 170, 204)
            if iy + 1 < m.shape[0] and m[iy + 1, ix]:
                out[iy + 1, ix, :3] = (226, 242, 252)
    arr[sub] = out


def suelo(z, datos, carpeta_tmp):
    """Pinta el suelo del pueblo, le pasa su detalle, lo recolorea y lo trocea."""
    cap = os.path.join(carpeta_tmp, z.nombre + '.png')
    det = os.path.join(carpeta_tmp, z.nombre + '_det.png')
    fin = os.path.join(carpeta_tmp, z.nombre + '_bioma.png')
    GS.pintar(datos, cap)
    subprocess.run([sys.executable, os.path.join(AQUI, 'detallar-captura-mapa.py'), cap, det], check=True)
    arr = np.array(Image.open(det).convert('RGBA'))
    arr = gf_biomas.recolorear(arr, z.nombre)
    if z.nombre == 'desierto':
        ondas_arena(arr, z, 8101)
        pintar_playa(arr, z)
    if z.nombre == 'tundra':
        pintar_hielo(arr, z, 9101)
    Image.fromarray(arr).save(fin, optimize=True)
    destino = os.path.join(BIN, 'recortadas_' + z.nombre)
    subprocess.run([sys.executable, os.path.join(AQUI, 'trocear-escena.py'), fin, destino, VERSION], check=True)


# ===========================================================================
# TODO
# ===========================================================================
def generar(nombre, con_suelo, carpeta_tmp):
    print('== %s' % nombre)
    disenar, semilla = DISENOS[nombre]
    destino = os.path.join(BIN, 'Game', 'MAPAS', nombre)
    os.makedirs(destino, exist_ok=True)
    fotos = gf_props3d.fotos(nombre)
    atlas_objetos(fotos, os.path.join(destino, 'objetos.png'), os.path.join(destino, 'objetos.json'))
    arboles = gf_arboles_zona.arboles(nombre, PAQUETE, os.path.join(destino, 'arboles'))
    # El tileset del pueblo en el bioma (lo lee el agua que se mueve).
    ts = np.array(Image.open(TILESET).convert('RGBA'))
    Image.fromarray(gf_biomas.recolorear(ts, nombre)).save(os.path.join(destino, 'tiles_%s.png' % nombre), optimize=True)

    z = Zona(nombre, semilla)
    disenar(z, fotos)
    V = GS.vertices(z.tierra)
    datos = GS.componer(random.Random(semilla), z.agua, set(), z.tierra, z.piedra, V)

    # ── colisiones del agua (se deja pisar la orilla, como en el salvaje) ──
    for (x0, y0, x1, y1) in GS.rectangulos(z.agua):
        def tierra_al(lado):
            if lado == 'N': cs = [(x, y0 - 1) for x in range(x0, x1 + 1)]
            elif lado == 'S': cs = [(x, y1 + 1) for x in range(x0, x1 + 1)]
            elif lado == 'O': cs = [(x0 - 1, y) for y in range(y0, y1 + 1)]
            else: cs = [(x1 + 1, y) for y in range(y0, y1 + 1)]
            return any(0 <= cx < N and 0 <= cy < N and (cx, cy) not in z.agua for cx, cy in cs)
        mn = 12 if tierra_al('N') else 0
        ms = 10 if tierra_al('S') else 0
        mo = 10 if tierra_al('O') else 0
        me = 10 if tierra_al('E') else 0
        z.colisiones.append({'x': x0 * T + mo, 'y': y0 * T + mn, 'width': (x1 - x0 + 1) * T - mo - me,
                             'height': (y1 - y0 + 1) * T - mn - ms, 'name': 'agua'})
    print('  árboles %d, objetos %d, colisiones %d, monstruos %d' % (
        len(z.arboles), len(z.objetos), len(z.colisiones), len(z.monstruos)))
    cuenta = {}
    for m in z.monstruos:
        cuenta[m['tipo']] = cuenta.get(m['tipo'], 0) + 1
    print('  por especie:', cuenta)

    # ── el JSON de Tiled ──
    oid = [1]
    def obj(o, **extra):
        d = {'id': oid[0], 'name': o.get('name', ''), 'type': '', 'rotation': 0, 'visible': True,
             'x': o['x'], 'y': o['y'], 'width': o.get('width', 0), 'height': o.get('height', 0)}
        d.update(extra)
        oid[0] += 1
        return d
    def props(dic):
        return [{'name': k, 'type': 'float' if isinstance(v, float) else 'int' if isinstance(v, int) else 'string', 'value': v}
                for k, v in dic.items()]
    capa_arboles = [obj({'name': a['nombre'], 'x': a['x'], 'y': a['y']}, point=True) for a in z.arboles]
    capa_objetos = [obj({'name': o['nombre'], 'x': o['x'], 'y': o['y']}, point=True,
                        properties=props({'sombra': int(o['sombra'])})) for o in z.objetos]
    capas = [
        {'id': 1, 'name': 'suelo', 'type': 'tilelayer', 'width': N, 'height': N, 'x': 0, 'y': 0,
         'opacity': 1, 'visible': True, 'data': datos},
        {'id': 2, 'name': 'arboles', 'type': 'objectgroup', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0, 'objects': capa_arboles},
        {'id': 3, 'name': 'objetos', 'type': 'objectgroup', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0, 'objects': capa_objetos},
        {'id': 4, 'name': 'colisiones', 'type': 'objectgroup', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0,
         'objects': [obj(c) for c in z.colisiones]},
        {'id': 5, 'name': 'salidas', 'type': 'objectgroup', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0,
         'objects': [obj(s) for s in z.salidas]},
        {'id': 6, 'name': 'zonas', 'type': 'objectgroup', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0,
         'objects': [obj(s) for s in z.zonas]},
        {'id': 7, 'name': 'aparicion', 'type': 'objectgroup', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0,
         'objects': [obj(a, point=True) for a in z.aparicion]},
        {'id': 8, 'name': 'monstruos', 'type': 'objectgroup', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0,
         'objects': [obj({'name': m['tipo'], 'x': m['x'], 'y': m['y']}, point=True) for m in z.monstruos]},
        {'id': 9, 'name': 'carteles', 'type': 'objectgroup', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0,
         'objects': [obj(c, point=True, properties=props({'texto': c['texto']})) for c in z.carteles]},
    ]
    if z.remolinos:
        capas.append({'id': 10, 'name': 'remolinos', 'type': 'objectgroup', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0,
                      'objects': [obj(r, point=True, properties=props(r['propiedades'])) for r in z.remolinos]})
    mapa = {
        'compressionlevel': -1, 'width': N, 'height': N, 'tilewidth': T, 'tileheight': T,
        'infinite': False, 'orientation': 'orthogonal', 'renderorder': 'right-down',
        'tiledversion': '1.10.2', 'type': 'map', 'version': '1.10', 'nextlayerid': 12, 'nextobjectid': 0,
        'properties': props({'generado_por': 'tools/generar-zonas.py', 'version': VERSION, 'zona': nombre,
                             'escala_arbol': ESCALA_ARBOL, 'agua_vida': VIDA_AGUA[nombre] or ''}),
        'tilesets': [{'firstgid': 1, 'name': 'Tileset_mapa', 'image': '../Game/MAPAS/%s/tiles_%s.png' % (nombre, nombre),
                      'imagewidth': 1440, 'imageheight': 512, 'tilewidth': T, 'tileheight': T, 'columns': GS.TS_COLS,
                      'tilecount': 2880, 'margin': 0, 'spacing': 0}],
        'layers': capas,
    }
    mapa['nextobjectid'] = oid[0]
    ruta = os.path.join(BIN, 'Maps', nombre + '.json')
    with open(ruta, 'w', encoding='utf-8') as fh:
        json.dump(mapa, fh, ensure_ascii=False, separators=(',', ':'))
    print('  mapa:', ruta, 'árboles:', ', '.join(arboles))
    if con_suelo:
        suelo(z, datos, carpeta_tmp)
    return z


def main():
    nombres = [a for a in sys.argv[1:] if not a.startswith('--')] or list(DISENOS)
    con_suelo = '--suelo' in sys.argv
    tmp = tempfile.mkdtemp(prefix='gf_zonas_')
    for n in nombres:
        generar(n, con_suelo, tmp)
    print('listo (temporales en %s)' % tmp)


if __name__ == '__main__':
    main()
