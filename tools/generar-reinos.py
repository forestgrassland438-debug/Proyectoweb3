# -*- coding: utf-8 -*-
"""
LOS SIETE MAPAS DEL CONTINENTE DEL ESTE                          (2026-11-21)

    python tools/generar-reinos.py [zona ...] [--suelo] [--resumen <archivo.json>]

"Quiero 7 mapas nuevos; cada uno con su nivel de desbloqueo, sus NPC con sus
nombres, animales y enemigos 2.5D nuevos, un monstruo por mapa, zonas PvP y
neutrales, agua con sus efectos y botes... cada mapa de 5008 x 5008 y
recortado como los demás; y uno de ellos es un pueblo lejos, con casas, NPC y
una tienda."

    puerto   Saltwind Harbor        mundo 13, nivel 11   el pueblo del puerto (PvP: la cala del sureste)
    pantano  Mirefen Bog            mundo 14, nivel 12   charcas, chozas en zancos (PvP: el este)
    aldor    Sunken Ruins of Aldor  mundo 15, nivel 13   la gran plaza en ruinas (PvP: el sur)
    colinas  Amberleaf Highlands    mundo 16, nivel 14   otoño, lagos, la granja (PvP: el oeste)
    selva    Emerald Jungle         mundo 17, nivel 15   el río, la aldea, el templo (PvP: el este)
    volcan   Emberfall Caldera      mundo 18, nivel 16   ríos de lava, termas, la forja (PvP: el norte)
    hongos   Glowcap Hollow         mundo 19, nivel 17   setas gigantes que brillan (PvP: el noreste)

Se apoya en tools/generar-zonas.py (la clase Zona, el agua, los caminos, el
JSON de Tiled) y en tools/generar-salvaje.py (las casillas del pueblo), con
313 casillas de 16 = 5008 px. Lo NUEVO de cada mapa está en:

    tools/gf_reinos_arte.py      los biomas y los objetos 2.5D (casas, muelle, ruinas...)
    tools/gf_reinos_arboles.py   los árboles (2D con relieve, como los del juego)

Escribe, por mapa:
    Maps/<zona>.json                         el mapa (capas como las de los otros mapas)
    Game/MAPAS/<zona>/objetos.png|json       el atlas de objetos (cada fotograma con su apoyo)
    Game/MAPAS/<zona>/arboles/<nombre>.png   los árboles (128 x 160, el pie abajo en medio)
    Game/MAPAS/<zona>/tiles_<zona>.png       el tileset del pueblo en su bioma (el agua sigue azul)
    recortadas_<zona>/                       con --suelo: el suelo pintado en 25 trozos

Lo que el mapa promete (llegadas, NPC, guaridas, PvP) lo comprueba aquí mismo
`validar` (lo mismo que tools/reinos.test.cjs) antes de escribir nada.
SIN PUNTOS NI TRAMAS en el suelo: bandas, líneas y degradados lisos.
"""
import collections
import importlib.util
import json
import math
import os
import random
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
BIN = os.path.dirname(AQUI)

_spec = importlib.util.spec_from_file_location('generar_zonas', os.path.join(AQUI, 'generar-zonas.py'))
GZ = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(GZ)
GS = GZ.GS                        # el MISMO módulo que usa generar-zonas (sus N y W se cambian aquí)

import gf_biomas                  # noqa: E402
import gf_props3d as P            # noqa: E402
import gf_reinos_arte as RA       # noqa: E402  (al importarse registra los biomas y los catálogos)
import gf_reinos_arboles as RB    # noqa: E402
import gf_lava_mina as LM         # noqa: E402  (2026-11-24) la lava de la mina, animada
import gf_motor_casas as MC       # noqa: E402  (2026-11-24) las casas 2D del puerto, a la escala de GameScene

T = GS.T
N = 313                           # 313 x 16 = 5008 px
W = N * T
GS.N = GZ.N = N                   # las ayudas de los dos módulos leen N y W al llamarse
GZ.W = W
VERSION = '20261124a'             # (2026-11-24) la lava de la mina en el volcán (antes 20261121a)
ESCALA_ARBOL = GZ.ESCALA_ARBOL
REINOS = ['puerto', 'pantano', 'aldor', 'colinas', 'selva', 'volcan', 'hongos']
NOMBRES = {'puerto': 'Saltwind Harbor', 'pantano': 'Mirefen Bog', 'aldor': 'Sunken Ruins of Aldor',
           'colinas': 'Amberleaf Highlands', 'selva': 'Emerald Jungle', 'volcan': 'Emberfall Caldera',
           'hongos': 'Glowcap Hollow'}

# El camino que llega a cada borde: 9 casillas centradas en el mapa (2432..2576 px).
C0, C1 = 152, 160
MEDIO = (C0 + C1 + 1) * T // 2                     # 2504
# Dónde se llega por cada borde: a ~215 px de la salida (los pies), en el camino.
LLEGADA = {'O': (250, 2480), 'E': (W - 250, 2480), 'N': (MEDIO, 230), 'S': (MEDIO, W - 286)}
# Los vecinos de cada mapa por cada borde (el ferri del puerto va al pueblo).
LADOS = {
    'puerto': {'O': 'pueblo', 'N': 'colinas', 'E': 'pantano', 'S': 'aldor'},
    'pantano': {'O': 'puerto', 'N': 'selva'},
    'aldor': {'N': 'puerto'},
    'colinas': {'S': 'puerto', 'E': 'selva', 'N': 'volcan'},
    'selva': {'O': 'colinas', 'S': 'pantano', 'N': 'hongos'},
    'volcan': {'S': 'colinas', 'E': 'hongos'},
    'hongos': {'O': 'volcan', 'S': 'selva'},
}
VIDA_AGUA = {'puerto': 'mar', 'pantano': 'rio', 'aldor': 'rio', 'colinas': 'rio', 'selva': 'rio',
             'volcan': '', 'hongos': 'rio'}
SIN_MATAS = ('volcan',)           # la ceniza, sin las matas de hierba del pueblo


# ===========================================================================
# LA ZONA (la de generar-zonas, con lava, llegadas, NPC y guarida)
# ===========================================================================
class Reino(GZ.Zona):
    def __init__(self, nombre, semilla):
        super().__init__(nombre, semilla)
        self.lava = set()
        self.vados = set()        # casillas del río de lava tapadas por una costra de basalto (se pisan)
        self.llegadas = []        # (x, y): donde se aparece; los monstruos, lejos
        self.npcs = {}            # id -> (x, y) (la base de sus pies)
        self.sin_monstruos = []   # cajas (px) donde no nace ningún monstruo
        self.oasis = []           # cajas (cx, cy, rx, ry) en casillas: donde se pinta la orilla
        self.playa = set()
        self.brillos = []         # (x, y, radio, (r, g, b), fuerza): halos pintados en el suelo
        self.jefe = None          # [x0, y0, x1, y1] la guarida del jefe
        self.pvp = None

    def suelo_de(self, px, py):
        if (int(px // T), int(py // T)) in self.lava:
            return 'lava'
        return super().suelo_de(px, py)


def caja_t(x0, y0, x1, y1, m=0):
    """Casillas (inclusivas) -> caja en px, con margen."""
    return (x0 * T - m, y0 * T - m, (x1 + 1) * T + m, (y1 + 1) * T + m)


def pavimentar(z, celdas):
    """La piedra de un conjunto de casillas, con el bordillo del pueblo donde
    la de al lado no es piedra (en el borde del mapa no: el muelle sigue). El
    adoquín va en fase con el mapa entero: muelle, calle y plaza sin costuras."""
    B, L = GS.BLOQUE, GS.LADRILLO
    for (x, y) in celdas:
        n = y > 0 and (x, y - 1) not in celdas
        s = y < N - 1 and (x, y + 1) not in celdas
        o = x > 0 and (x - 1, y) not in celdas
        e = x < N - 1 and (x + 1, y) not in celdas
        if n:
            g = B['NO'] if o else B['NE'] if e else B['N'][x % 2]
        elif s:
            g = B['SO'] if o else B['SE'] if e else B['S'][x % 2]
        elif o:
            g = B['O1'] if (x, y - 2) not in celdas else B['O'][y % 2]
        elif e:
            g = B['E1'] if (x, y - 2) not in celdas else B['E'][y % 2]
        else:
            g = L[y % 4] + x % 4
        z.piedra[(x, y)] = g


def sin_islas(celdas, minimo=14):
    """Quita los trocitos sueltos (menos de `minimo` casillas): de lejos son puntos."""
    resto, out = set(celdas), set()
    while resto:
        semilla = resto.pop()
        grupo, pila = {semilla}, [semilla]
        while pila:
            x, y = pila.pop()
            for c in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if c in resto:
                    resto.discard(c)
                    grupo.add(c)
                    pila.append(c)
        if len(grupo) >= minimo:
            out |= grupo
    return out


def erosionar(celdas, rect, semilla, hondo=6, paso=7):
    """El borde desmoronado de una plaza en ruinas: mordiscos que entran desde
    fuera (nunca agujeros en medio: de lejos serían puntos)."""
    x0, y0, x1, y1 = rect
    r = GS.ruido_valor(semilla, paso)
    fila = {'N': 3, 'S': 11, 'O': 19, 'E': 27}
    fuera = set()
    for (x, y) in celdas:
        if not (x0 <= x <= x1 and y0 <= y <= y1):
            continue
        for lado, d in (('N', y - y0), ('S', y1 - y), ('O', x - x0), ('E', x1 - x)):
            t = x if lado in 'NS' else y
            prof = int(r(t, fila[lado]) * hondo * 1.6 - hondo * 0.45)
            if d < prof:
                fuera.add((x, y))
                break
    return sin_islas(celdas - fuera)


def camino_borde(z, lado, hasta):
    """El camino recto (9 casillas) desde un borde hasta la casilla `hasta`."""
    if lado == 'O':
        z.tierra |= GZ.rect_set(0, C0, hasta, C1)
    elif lado == 'E':
        z.tierra |= GZ.rect_set(hasta, C0, N - 1, C1)
    elif lado == 'N':
        z.tierra |= GZ.rect_set(C0, 0, C1, hasta)
    else:
        z.tierra |= GZ.rect_set(C0, hasta, C1, N - 1)


def rect_salida(lado, nombre):
    if lado == 'O':
        return {'name': nombre, 'x': 0, 'y': C0 * T, 'width': 20, 'height': (C1 - C0 + 1) * T}
    if lado == 'E':
        return {'name': nombre, 'x': W - 20, 'y': C0 * T, 'width': 20, 'height': (C1 - C0 + 1) * T}
    if lado == 'N':
        return {'name': nombre, 'x': C0 * T, 'y': 0, 'width': (C1 - C0 + 1) * T, 'height': 20}
    return {'name': nombre, 'x': C0 * T, 'y': W - 20, 'width': (C1 - C0 + 1) * T, 'height': 20}


def poner_salidas(z, aparicion):
    """Las salidas a los vecinos, sus llegadas (nada suelto alrededor) y la aparición."""
    for lado, destino in sorted(LADOS[z.nombre].items()):
        z.salidas.append(rect_salida(lado, destino))
        if destino != 'pueblo':
            z.llegadas.append(LLEGADA[lado])
        a, b = C0 * T - 160, (C1 + 1) * T + 160
        caja = {'O': (0, a, 620, b), 'E': (W - 620, a, W, b), 'N': (a, 0, b, 620), 'S': (a, W - 620, b, W)}[lado]
        z.reservado.append(caja)
    z.aparicion.append({'name': 'llegada', 'x': aparicion[0], 'y': aparicion[1]})
    z.llegadas.append(aparicion)
    z.reservado.append((aparicion[0] - 90, aparicion[1] - 70, aparicion[0] + 90, aparicion[1] + 90))


def zonas_pvp(z, x0, y0, x1, y1):
    """La zona PvP (un rectángulo, el mismo que PVP_ZONAS en server2.js) y lo
    demás neutral."""
    z.pvp = (x0, y0, x1, y1)
    z.zonas.append({'name': 'pvp', 'x': x0, 'y': y0, 'width': x1 - x0, 'height': y1 - y0})
    trozos = []
    if y0 > 0:
        trozos.append((0, 0, W, y0))
    if y1 < W:
        trozos.append((0, y1, W, W))
    if x0 > 0:
        trozos.append((0, y0, x0, y1))
    if x1 < W:
        trozos.append((x1, y0, W, y1))
    for (a, b, c, d) in trozos:
        z.zonas.append({'name': 'neutral', 'x': a, 'y': b, 'width': c - a, 'height': d - b})


def reservar_npc(z, ident, x, y):
    z.npcs[ident] = (x, y)
    z.reservado.append((x - 64, y - 120, x + 64, y + 44))
    z.ocupado.append((x, y - 16, 46))
    z.sin_monstruos.append((x - 420, y - 420, x + 420, y + 420))


def guarida(z, x0, y0, x1, y1):
    """La guarida del jefe (gf-jefes.js `caja`): abierta, sin árboles ni objetos."""
    z.jefe = [x0, y0, x1, y1]
    z.reservado.append((x0 + 60, y0 + 60, x1 - 60, y1 - 60))


def cartel(z, nombre, x, y, texto):
    z.carteles.append({'name': nombre, 'x': x, 'y': y, 'texto': texto})
    z.ocupado.append((x, y, 26))


def monstruos(z, tipo, n, caja, sep=380, lejos=880):
    """`n` monstruos en `caja`: en suelo libre, lejos del agua y la lava, de
    las llegadas (880 px; el test pide 700) y de los sitios sin monstruos."""
    x0, y0, x1, y1 = caja
    puestos = 0
    for _ in range(20000):
        if puestos >= n:
            break
        px, py = z.rnd.uniform(x0, x1), z.rnd.uniform(y0, y1)
        if z.suelo_de(px, py) in ('agua', 'muro', 'grieta', 'lava') or z.cerca_agua(px, py, 4):
            continue
        if any(z.suelo_de(px + dx, py + dy) in ('muro', 'lava', 'agua') for dx, dy in ((-64, 0), (64, 0), (0, -64), (0, 40))):
            continue
        if any((ox - px) ** 2 + (oy - py) ** 2 < 80 ** 2 for ox, oy, _r in z.ocupado):
            continue
        if any((m['x'] - px) ** 2 + (m['y'] - py) ** 2 < sep ** 2 for m in z.monstruos):
            continue
        if any((lx - px) ** 2 + (ly - py) ** 2 < lejos ** 2 for lx, ly in z.llegadas):
            continue
        if any(a <= px <= c and b <= py <= d for a, b, c, d in z.sin_monstruos):
            continue
        z.monstruos.append({'tipo': tipo, 'x': round(px), 'y': round(py)})
        puestos += 1
    assert puestos == n, '%s: solo caben %d de %d %s en %s' % (z.nombre, puestos, n, tipo, caja)


def arboleda(z, especies, cuantos, caja=None, peso=None, sep=44, margen_agua=4, intentos=80):
    """Árboles en suelo libre. `especies`: [(nombre, peso)] o una función
    (px, py) -> esa lista; `peso(px, py)` en [0, 1]: la densidad del bosque."""
    x0, y0, x1, y1 = caja or (60, 60, W - 60, W - 60)
    puestos = 0
    for _ in range(cuantos * intentos):
        if puestos >= cuantos:
            break
        px, py = z.rnd.uniform(x0, x1), z.rnd.uniform(y0, y1)
        if peso and z.rnd.random() > peso(px, py):
            continue
        if not z.libre(px, py, sep, ('campo',), margen_agua):
            continue
        lista = especies(px, py) if callable(especies) else especies
        z.poner_arbol(z.rnd.choices([e[0] for e in lista], weights=[e[1] for e in lista])[0], px, py)
        puestos += 1
    return puestos


def junto_al_agua(z, nombres, cuantos, fotos, hasta=3, radio=22, sep=90):
    """Lo que crece en la orilla (juncos, bambú): en la banda de la playa, a
    1..`hasta` casillas del agua."""
    celdas = sorted(c for c in z.playa if 1 <= z.dist.get(c, 99) <= hasta and c not in z.piedra and c not in z.lava)
    puestos = 0
    for _ in range(cuantos * 40):
        if puestos >= cuantos or not celdas:
            break
        cx, cy = celdas[z.rnd.randrange(len(celdas))]
        px, py = cx * T + z.rnd.uniform(2, 14), cy * T + z.rnd.uniform(2, 14)
        if any(a - radio < px < c + radio and b - radio < py < d + radio for a, b, c, d in z.reservado):
            continue
        if any((ox - px) ** 2 + ((oy - py) * 1.4) ** 2 < (orad + max(radio, sep)) ** 2 for ox, oy, orad in z.ocupado):
            continue
        if z.suelo_de(px, py) in ('agua', 'lava') or z.suelo_de(px, py + 8) in ('agua', 'lava'):
            continue
        z.poner_objeto(nombres[z.rnd.randrange(len(nombres))], px, py, fotos, radio=max(radio, sep * 0.5))
        puestos += 1
    return puestos


def bosque_ruido(semilla, umbral, paso=22, base=0.12):
    r = GS.ruido_valor(semilla, paso)
    return lambda px, py: 1.0 if r(px / T, py / T) > umbral else base


# ===========================================================================
# 1. SALTWIND HARBOR — el pueblo del puerto (mundo 13, nivel 11)
# ===========================================================================
PUERTO_MUELLE = (36, 116, 52, 196)       # casillas; al oeste de x = 44 tiene el mar debajo
PUERTO_PLAZA = (132, 128, 180, 176)
PUERTO_CALA = (299, 299, 23, 18)         # la cala de los contrabandistas (PvP)
PUERTO_ESTANQUE = (214, 66, 13, 8)


def disenar_puerto(z, fotos):
    costa = GS.ruido_valor(1301, 16)
    m0, m1 = PUERTO_MUELLE[1], PUERTO_MUELLE[3]
    for y in range(N):
        c = 27 + costa(6, y) * 13
        if m0 <= y <= m1:
            c = 44
        elif m0 - 12 <= y < m0:
            t = (m0 - y) / 12.0
            c = 44 * (1 - t) + c * t
        elif m1 < y <= m1 + 12:
            t = (y - m1) / 12.0
            c = 44 * (1 - t) + c * t
        for x in range(int(round(c))):
            z.agua.add((x, y))
    z.agua |= GZ.elipse_set(*PUERTO_CALA, semilla=1302)
    z.agua |= GZ.elipse_set(*PUERTO_ESTANQUE, semilla=1303)
    z.oasis = [(22, 156, 26, 160), PUERTO_CALA, PUERTO_ESTANQUE]
    z.dist = GZ.distancias(z.agua)
    z.playa = GZ.orilla(z.dist, 1304, base=3, extra=6)

    # ── la piedra: el muelle, el embarcadero del ferri, la calle mayor, la plaza y el pie del faro ──
    piedra = GZ.rect_set(*PUERTO_MUELLE) | GZ.rect_set(0, 150, 35, 162) | GZ.rect_set(53, C0, 131, C1)
    piedra |= GZ.rect_set(*PUERTO_PLAZA) | GZ.rect_set(50, 86, 62, 96)
    pavimentar(z, piedra)
    z.playa -= piedra
    # ── los caminos ──
    camino_borde(z, 'N', PUERTO_PLAZA[1] - 1)
    camino_borde(z, 'S', PUERTO_PLAZA[3] + 1)
    camino_borde(z, 'E', PUERTO_PLAZA[2] + 1)
    z.tierra |= GZ.rect_set(56, 197, 151, 202)                                     # la calle de atrás
    z.tierra |= GZ.tubo([(48, 116), (54, 104), (56, 97)], 2.4, 1305, rugoso=0.1)     # al faro
    z.tierra |= GZ.tubo([(160, 248), (200, 262), (240, 270), (268, 279)], 2.6, 1306, rugoso=0.12)  # a la cala
    z.tierra |= GZ.tubo([(160, 84), (185, 76), (199, 70)], 2.4, 1307, rugoso=0.1)    # al parque
    z.tierra |= z.playa
    z.tierra -= z.agua

    poner_salidas(z, (MEDIO, 2640))
    zonas_pvp(z, 3800, 3900, W, W)
    guarida(z, 3900, 4100, 4540, 4740)

    # ── lo que no se toca: el muelle, las calles y sus casas, la plaza con la tienda y la taberna, la cala ──
    # (2026-11-24) Las casas del motor 2D (tools/gf_motor_casas.py) son de la escala de GameScene: ~400 px de
    # ancho y hasta 520 de alto; lo que ocupan sus tejados se guarda también (sin árboles encima).
    z.reservado += [caja_t(*PUERTO_MUELLE, m=24), (848, 1930, 1740, 2900), caja_t(*PUERTO_PLAZA, m=40),
                    (848, 2600, 2460, 3290), (760, 960, 1060, 1600), (4540, 4200, 5008, 4460),
                    (1880, 1680, 2440, 2160), (2570, 1500, 3090, 2160), (3070, 1920, 4390, 2460)]
    z.sin_monstruos.append((560, 1340, 3040, 3360))
    # Los NPC de gf-npcs.js (PuertoScene): marisol, bettina (la tienda), pike, bartholomew, nell (la taberna),
    # wexley y silas (el faro). Mismas posiciones que allí.
    for ident, x, y in (('marisol', 700, 2360), ('bettina', 2290, 2214), ('pike', 724, 2920),
                        ('bartholomew', 2960, 2400), ('nell', 2740, 2222), ('wexley', 2290, 1500), ('silas', 1000, 1664)):
        reservar_npc(z, ident, x, y)

    # ── las casas, todas de cara al sur: dos en la calle mayor, tres en la de atrás y tres en el camino del este ──
    PIE_MAYOR, PIE_ATRAS = C0 * T - 6, 197 * T - 6
    calle = [('casa_azul', 1080), ('casa_coral', 1530)]
    atras = [('casa_pizarra', 1110), ('casa_terracota', 1560), ('casa_marfil', 2010)]
    este = [('casa_ocre', 3290), ('casa_menta', 3730), ('casa_lila', 4170)]
    for n, x in calle + este:
        z.poner_objeto(n, x, PIE_MAYOR, fotos, radio=150)
    for n, x in atras:
        z.poner_objeto(n, x, PIE_ATRAS, fotos, radio=150)
    for lista, pie in ((calle, PIE_MAYOR), (atras, PIE_ATRAS), (este, PIE_MAYOR)):
        for _n, x in lista:                       # dos macetas, una a cada lado de la puerta
            for sx in (-1, 1):
                z.poner_objeto('macetero', x + sx * 70, pie + 22, fotos, radio=10)
    # Las farolas (del alto del poste de GameScene): en los huecos entre las casas, al pie de la calle, y
    # al otro lado de la calle mayor y del camino del este.
    for x in (1308, 1812):
        z.poner_objeto('farol_puerto', x, PIE_MAYOR + 12, fotos, radio=14)
    for x in (1338, 1781, 2262):
        z.poner_objeto('farol_puerto', x, PIE_ATRAS + 12, fotos, radio=14)
    for x in (3512, 3948):
        z.poner_objeto('farol_puerto', x, PIE_MAYOR + 12, fotos, radio=14)
    for x in (900, 1320, 1740):
        z.poner_objeto('farol_puerto', x, C1 * T + 36, fotos, radio=14)
    for x in (3100, 3520, 3940, 4360):
        z.poner_objeto('farol_puerto', x, C1 * T + 36, fotos, radio=14)
    for x in (1110, 1530):
        z.poner_objeto('banco_puerto', x, C1 * T + 38, fotos, radio=24)
    # ── la plaza: la tienda y la taberna al norte, una a cada lado del camino del norte; la fuente del ancla ──
    py0 = PUERTO_PLAZA[1] * T
    z.poner_objeto('tienda_puerto', 2160, py0 + 60, fotos, radio=200)
    z.poner_objeto('taberna_puerto', 2830, py0 + 60, fotos, radio=200)
    z.poner_objeto('fuente_ancla', MEDIO, 2470, fotos, radio=90)
    # (2026-11-25) Los puestos 2D miden 168 x 176 (los de antes, 72 x 88): 26 px hacia dentro y a la línea de
    # los faroles, para no rozar ni los faroles de las esquinas ni los bancos de detrás.
    z.poner_objeto('puesto_pescado', 2326, 2760, fotos, radio=40)     # el mercado de la plaza
    z.poner_objeto('puesto_pescado', 2682, 2760, fotos, radio=40)
    for (x, y) in ((2200, 2330), (2808, 2330), (2200, 2760), (2808, 2760)):
        z.poner_objeto('farol_puerto', x, y, fotos, radio=16)
    for sx in (-1, 1):
        z.poner_objeto('banco_puerto', MEDIO + sx * 210, 2572, fotos, radio=26)
        z.poner_objeto('macetero', MEDIO + sx * 120, 2410, fotos, radio=14)
        z.poner_objeto('macetero', MEDIO + sx * 330, 2470, fotos, radio=14)
    # ── el muelle: norays, faroles, barriles, cajas, el ancla, las boyas y la lonja ──
    qx0 = PUERTO_MUELLE[0] * T
    for y in (1960, 2120, 2270, 2740, 2900, 3060):
        z.poner_objeto('noray', qx0 + 22, y, fotos, radio=12)
    # (2026-11-25) Los faroles al bordillo (x 836, antes 800): con los puestos grandes, el de 2680 los cortaba.
    for (x, y) in ((836, 1950), (836, 2300), (836, 2680), (836, 3080)):
        z.poner_objeto('farol_puerto', x, y, fotos, radio=14)
    # (2026-11-25) La lonja con los puestos grandes: uno a 2620 y el de Pike a 2944 (él, detrás del mostrador);
    # el barril y las cajas, al hueco de entre los dos (antes 2792 y 2804: quedaban debajo del toldo).
    for (n, x, y) in (('barril', 660, 2012), ('barril', 690, 2034), ('cajas', 744, 2004), ('cajas', 782, 2044),
                      ('barril', 650, 2700), ('cajas', 700, 2712), ('rollo_cuerda', 640, 2172),
                      ('rollo_cuerda', 664, 3004), ('ancla', 760, 2212), ('boya', 646, 2244), ('boya', 670, 2258),
                      ('puesto_pescado', 724, 2620), ('puesto_pescado', 724, 2944)):
        z.poner_objeto(n, x, y, fotos, radio=16)
    z.poner_objeto('bote_varado', 760, 3420, fotos, radio=60)
    z.poner_objeto('bote_varado', 790, 1770, fotos, radio=60)
    # ── el faro y su guardián ──
    z.poner_objeto('faro', 904, 1530, fotos, radio=70)
    z.poner_objeto('farol_puerto', 1040, 1540, fotos, radio=14)
    # ── el parque del estanque (noreste) ──
    ex, ey = PUERTO_ESTANQUE[0] * T, PUERTO_ESTANQUE[1] * T
    for k in range(6):
        a = k / 6.0 * math.tau + 0.3
        x, y = ex + math.cos(a) * 380, ey + math.sin(a) * 250 + 20
        if z.libre(x, y, 26, ('campo', 'tierra'), margen_agua=2):
            z.poner_objeto('banco_puerto' if k % 2 else 'farol_puerto', x, y, fotos, radio=30)
    # ── la cala de los contrabandistas: cajas, barriles, cuerda y un bote ──
    for (n, x, y) in (('cajas', 4600, 4330), ('cajas', 4640, 4360), ('barril', 4700, 4320), ('barril', 4730, 4344),
                      ('rollo_cuerda', 4780, 4330), ('ancla', 4860, 4350), ('bote_varado', 4420, 4420)):
        if z.libre(x, y, 10, ('campo', 'tierra'), margen_agua=1):
            z.poner_objeto(n, x, y, fotos, radio=18)

    cartel(z, 'bienvenida', 2330, 2870, 'Saltwind Harbor')
    cartel(z, 'ferri', 330, 2444, 'Ferry to Grassland Village')
    cartel(z, 'colinas', 2384, 660, 'North: Amberleaf Highlands')
    cartel(z, 'pantano', 4540, 2414, 'East: Mirefen Bog')
    cartel(z, 'aldor', 2640, 4500, 'South: Sunken Ruins of Aldor')
    cartel(z, 'pvp', 3850, 3980, "Smugglers' Cove — PvP zone, swords out!")
    cartel(z, 'faro', 1070, 1600, 'Saltwind Lighthouse')
    cartel(z, 'lonja', 910, 2660, 'Fish Market')
    cartel(z, 'parque', 3110, 1200, 'Gull Pond Park')

    # ── lo de suelta: rocas no hay (es un pueblo); pilas de cajas en la playa y faroles en los caminos ──
    # (las del camino del este van con las casas, más arriba; las del norte se paran antes de la tienda)
    for y in range(700, 1600, 420):
        z.poner_objeto('farol_puerto', 2416, y, fotos, radio=14)
    for y in range(3000, 4500, 420):
        z.poner_objeto('farol_puerto', 2610, y, fotos, radio=14)
    z.esparcir(['barril', 'cajas', 'rollo_cuerda'], 16, (420, 300, 1700, 4800), 18, fotos=fotos, sep=260,
               suelos=('tierra', 'campo'), margen_agua=2)
    z.esparcir(['macetero'], 10, (2950, 600, 4800, 3700), 14, fotos=fotos, sep=600)

    # ── los árboles: pinos en la costa, jacarandas en el parque, tilos en el campo ──
    def especie(px, py):
        if px < 1500:
            return [('pino_costero', 7), ('tilo_costero', 2)]
        if 2950 < px < 3900 and 700 < py < 1450:
            return [('jacaranda', 6), ('tilo_costero', 2)]
        return [('tilo_costero', 5), ('pino_costero', 2), ('jacaranda', 2)]
    arboleda(z, especie, 360, peso=bosque_ruido(1308, 0.55, base=0.14))

    monstruos(z, 'cangrejo_coloso', 4, (420, 150, 1700, 1320))
    monstruos(z, 'cangrejo_coloso', 2, (3880, 3980, 4990, 4990), sep=300)
    monstruos(z, 'cangrejo_coloso', 2, (420, 3460, 1900, 4900))
    monstruos(z, 'pirata_ahogado', 3, (3840, 3940, 4990, 4990), sep=300)
    monstruos(z, 'pirata_ahogado', 3, (420, 3460, 1900, 4900))


# ===========================================================================
# 2. MIREFEN BOG — el pantano (mundo 14, nivel 12)
# ===========================================================================
PANTANO_CHARCAS = [(68, 66, 22, 14), (34, 118, 12, 8), (106, 228, 18, 12), (178, 246, 15, 9), (128, 292, 14, 9),
                   (232, 64, 20, 12), (254, 206, 24, 16), (288, 286, 20, 16), (293, 130, 13, 17), (60, 286, 16, 11)]
PANTANO_CLARO = (172, 160, 22, 16)


def disenar_pantano(z, fotos):
    for i, c in enumerate(PANTANO_CHARCAS):
        z.agua |= GZ.elipse_set(*c, semilla=1401 + i, rugoso=0.25)
    z.oasis = list(PANTANO_CHARCAS)
    z.dist = GZ.distancias(z.agua)
    z.playa = GZ.orilla(z.dist, 1415, base=2, extra=4)
    z.tierra |= GZ.elipse_set(*PANTANO_CLARO, semilla=1411, rugoso=0.12)
    camino_borde(z, 'O', 150)
    camino_borde(z, 'N', 146)
    z.tierra |= GZ.tubo([(152, 112), (138, 106), (126, 104)], 2.4, 1413, rugoso=0.1)                 # al santuario
    z.tierra |= GZ.tubo([(192, 162), (220, 170), (250, 178), (280, 172)], 2.6, 1414, rugoso=0.12)    # al este
    z.tierra |= GZ.tubo([(170, 176), (166, 200), (172, 226)], 2.4, 1416, rugoso=0.12)                # a la charca del sur
    z.tierra |= GZ.manchas(1412, 0.86, lambda x, y: False)                                          # barro suelto
    z.tierra |= z.playa
    z.tierra -= z.agua

    poner_salidas(z, (2752, 2664))
    zonas_pvp(z, 3400, 0, W, W)
    guarida(z, 3900, 3480, 4600, 4180)
    z.reservado += [(2380, 2160, 3140, 2900), (1760, 1420, 2280, 1800)]
    z.sin_monstruos += [(2250, 2100, 3260, 3060), (1700, 1350, 2340, 1980)]
    reservar_npc(z, 'fenwick', 2016, 1728)
    reservar_npc(z, 'wila', 2966, 2564)
    # Los carteles, como en los otros seis (2026-11-21: la ciénaga se había quedado sin ninguno).
    cartel(z, 'bienvenida', 2600, 2900, 'Mirefen Bog')
    cartel(z, 'puerto', 330, 2414, 'West: Saltwind Harbor')
    cartel(z, 'selva', 2384, 660, 'North: Emerald Jungle')
    cartel(z, 'pvp', 3330, 2650, 'Witchwood Mire — PvP zone')
    cartel(z, 'santuario', 2140, 1790, 'Shrine of the Drowned Bell')

    # ── la aldea de las chozas en zancos, alrededor del claro ──
    for (x, y) in ((2480, 2330), (2760, 2290), (3040, 2340), (2420, 2800), (3090, 2800)):
        z.poner_objeto('choza_zancos', x, y, fotos, radio=90)
    z.poner_objeto('caldero_pantano', 2752, 2500, fotos, radio=40)
    for (x, y) in ((2620, 2560), (2880, 2650)):
        z.poner_objeto('farol_fatuo', x, y, fotos, radio=18)
    # ── el santuario de la campana ahogada: tótems en corro ──
    sx, sy = 2016, 1640
    for k in range(6):
        a = k / 6.0 * math.tau + 0.5
        z.poner_objeto('totem_pantano', sx + math.cos(a) * 190, sy + math.sin(a) * 110, fotos, radio=20)
    z.poner_objeto('farol_fatuo', sx - 70, sy - 10, fotos, radio=16)
    z.poner_objeto('farol_fatuo', sx + 70, sy - 10, fotos, radio=16)
    # ── los fuegos fatuos del camino ──
    for x in range(700, 2300, 460):
        z.poner_objeto('farol_fatuo', x, C0 * T - 22, fotos, radio=16)
    # (2026-11-25) El último, de 2080 a 1990: con 230 px quedaba detrás de la choza de (2480, 2330).
    for y in (700, 1160, 1620, 1990):
        z.poner_objeto('farol_fatuo', C0 * T - 30, y, fotos, radio=16)
    # ── por todo el pantano ──
    junto_al_agua(z, ['juncos'], 120, fotos, hasta=3, sep=70)
    z.esparcir(['roca_pantano'], 34, (60, 60, W - 60, W - 60), 24, fotos=fotos, sep=300)
    z.esparcir(['seta_pantano'], 60, (60, 60, W - 60, W - 60), 14, fotos=fotos, sep=200)
    z.esparcir(['tronco_caido'], 16, (60, 60, W - 60, W - 60), 40, fotos=fotos, sep=420)
    z.esparcir(['raiz_retorcida'], 14, (60, 60, W - 60, W - 60), 36, fotos=fotos, sep=420)
    z.esparcir(['totem_pantano'], 8, (3450, 60, W - 60, W - 60), 18, fotos=fotos, sep=600)
    z.esparcir(['farol_fatuo'], 12, (60, 60, W - 60, W - 60), 16, fotos=fotos, sep=700)

    def especie(px, py):
        if z.cerca_agua(px, py, 7):
            return [('manglar', 6), ('cipres_calvo', 3)]
        return [('aliso_negro', 4), ('cipres_calvo', 4), ('manglar', 1)]
    arboleda(z, especie, 380, margen_agua=2, peso=bosque_ruido(1417, 0.5, base=0.2))

    monstruos(z, 'sapo_toxico', 4, (100, 100, 3360, 4900))
    monstruos(z, 'sapo_toxico', 3, (3450, 100, 4950, 4950))
    monstruos(z, 'bruja_pantano', 3, (100, 100, 3360, 4900))
    monstruos(z, 'bruja_pantano', 3, (3450, 100, 4950, 4950))


# ===========================================================================
# 3. THE SUNKEN RUINS OF ALDOR — las ruinas (mundo 15, nivel 13)
# ===========================================================================
ALDOR_AVENIDA = (148, 41, 164, 99)
ALDOR_PLAZA = (112, 100, 200, 180)
ALDOR_POZAS = [(128, 140, 146, 152), (166, 140, 184, 152)]   # agua; la piedra tapa su anillo de fuera
ALDOR_PATIO = (130, 222, 182, 262)                            # el patio del coloso (PvP)
ALDOR_LAGUNAS = [(244, 238, 32, 22), (54, 196, 20, 14)]


def disenar_aldor(z, fotos):
    for i, c in enumerate(ALDOR_LAGUNAS):
        z.agua |= GZ.elipse_set(*c, semilla=1501 + i, rugoso=0.2)
    for r in ALDOR_POZAS:
        z.agua |= GZ.rect_set(*r)
    z.oasis = list(ALDOR_LAGUNAS)
    z.dist = GZ.distancias(z.agua)
    z.playa = GZ.orilla(z.dist, 1504, base=2, extra=4)

    plaza = erosionar(GZ.rect_set(*ALDOR_PLAZA), ALDOR_PLAZA, 1505, hondo=6)
    patio = erosionar(GZ.rect_set(*ALDOR_PATIO), ALDOR_PATIO, 1506, hondo=5)
    # La avenida entra en la plaza: el borde desmoronado no la deja suelta.
    piedra = GZ.rect_set(ALDOR_AVENIDA[0], ALDOR_AVENIDA[1], ALDOR_AVENIDA[2], ALDOR_PLAZA[1] + 12) | plaza | patio
    for (a, b, c, d) in ALDOR_POZAS:
        piedra |= GZ.rect_set(a, b, c, d)
        piedra -= GZ.rect_set(a + 1, b + 1, c - 1, d - 1)
    pavimentar(z, piedra)
    z.playa -= piedra
    camino_borde(z, 'N', ALDOR_AVENIDA[1])
    z.tierra |= GZ.tubo([(156, 178), (154, 200), (156, 224)], 3.0, 1507, rugoso=0.1)                 # al patio
    z.tierra |= GZ.tubo([(200, 150), (226, 168), (238, 200)], 2.4, 1508, rugoso=0.12)                # a la laguna
    z.tierra |= GZ.tubo([(112, 160), (88, 176), (70, 190)], 2.4, 1509, rugoso=0.12)                  # al oeste
    z.tierra |= z.playa
    z.tierra -= z.agua

    poner_salidas(z, (MEDIO, 1200))
    zonas_pvp(z, 0, 3000, W, W)
    guarida(z, 2150, 3560, 2860, 4270)
    z.reservado += [caja_t(*ALDOR_AVENIDA, m=30), caja_t(*ALDOR_PLAZA, m=30), caja_t(*ALDOR_PATIO, m=20)]
    reservar_npc(z, 'tamsin', 2290, 1180)
    reservar_npc(z, 'iris', 2250, 2610)

    # ── la avenida de las columnas ──
    for y in range(760, 1560, 160):
        for x in (2400, 2608):
            z.poner_objeto('columna_hiedra', x, y, fotos, radio=18)
    for x in (2200, 2808):                       # dos pórticos a los lados de la entrada
        z.poner_objeto('portico_ruinas', x, 1740, fotos, radio=90)
        for dx in (-76, 76):                     # (2026-11-24) las dos columnas del pórtico, ya x2.1
            z.colisiones.append({'x': round(x + dx - 27), 'y': 1740 - 34, 'width': 54, 'height': 42, 'name': 'portico_ruinas'})
    # ── la gran plaza: el altar entre las dos pozas, braseros, obeliscos, la cabeza del rey ──
    z.poner_objeto('altar_solar', MEDIO, 2340, fotos, radio=50)
    for (x, y) in ((2420, 2290), (2588, 2290), (2420, 2440), (2588, 2440)):
        z.poner_objeto('brasero_dorado', x, y, fotos, radio=16)
    px0, py0, px1, py1 = caja_t(*ALDOR_PLAZA)
    for (x, y) in ((px0 + 150, py0 + 140), (px1 - 150, py0 + 140), (px0 + 150, py1 - 120), (px1 - 150, py1 - 120)):
        z.poner_objeto('obelisco_sol', x, y, fotos, radio=22)
    z.poner_objeto('cabeza_estatua', 2870, 2660, fotos, radio=50)
    z.poner_objeto('escalinata_rota', 2140, 2660, fotos, radio=40)
    for (n, x, y) in (('columna_caida', 2000, 1900), ('columna_caida', 3000, 1960), ('fuste_roto', 1940, 2200),
                      ('fuste_roto', 3060, 2240), ('fuste_roto', 2000, 2500), ('columna_hiedra', 3080, 2480),
                      ('anfora', 2320, 2560), ('anfora', 2700, 2560), ('anfora', 2740, 2590),
                      ('muro_roto', 2240, 1900), ('muro_roto', 2780, 1900), ('columna_caida', 2500, 2780)):
        z.poner_objeto(n, x, y, fotos, radio=30)
    for y in range(1780, 2840, 260):                       # columnas sueltas a lo largo de los bordes
        for x in (px0 + 60, px1 - 60):
            if z.suelo_de(x, y) == 'piedra':
                z.poner_objeto('columna_hiedra' if (y // 260) % 2 else 'fuste_roto', x, y, fotos, radio=20)
    # ── el patio del coloso: un corro de columnas caídas y en pie ──
    cx, cy = (z.jefe[0] + z.jefe[2]) / 2, (z.jefe[1] + z.jefe[3]) / 2
    for k in range(10):
        a = k / 10.0 * math.tau
        n = ('columna_hiedra', 'fuste_roto', 'columna_caida')[k % 3]
        z.poner_objeto(n, cx + math.cos(a) * 400, cy + math.sin(a) * 330, fotos, radio=22)
    z.poner_objeto('obelisco_sol', cx, cy - 380, fotos, radio=22)
    # ── ruinas sueltas por el campo ──
    z.esparcir(['muro_roto', 'columna_caida', 'fuste_roto'], 36, (60, 60, W - 60, W - 60), 30, fotos=fotos, sep=360)
    z.esparcir(['anfora'], 18, (60, 60, W - 60, W - 60), 14, fotos=fotos, sep=400)
    z.esparcir(['columna_hiedra', 'obelisco_sol'], 14, (60, 60, W - 60, W - 60), 18, fotos=fotos, sep=600)
    z.esparcir(['brasero_dorado'], 8, (60, 60, W - 60, W - 60), 14, fotos=fotos, sep=800)
    z.esparcir(['cabeza_estatua', 'escalinata_rota'], 5, (60, 3100, W - 60, W - 60), 40, fotos=fotos, sep=900)

    cartel(z, 'bienvenida', 2330, 1340, 'The Sunken Ruins of Aldor')
    cartel(z, 'puerto', 2380, 640, 'North: Saltwind Harbor')
    cartel(z, 'plaza', 2330, 1690, 'Plaza of the Sun King')
    cartel(z, 'pvp', 2380, 3060, 'Court of the Colossus — PvP zone')
    cartel(z, 'laguna', 3330, 3240, 'The Drowned Quarter')

    arboleda(z, [('olivo_antiguo', 5), ('laurel', 4), ('higuera_raices', 3)], 300,
             peso=bosque_ruido(1510, 0.52, base=0.16))

    monstruos(z, 'golem_ruinas', 4, (100, 300, 4900, 2940))
    monstruos(z, 'golem_ruinas', 3, (100, 3080, 4900, 4900))
    monstruos(z, 'escarabajo_sol', 3, (100, 300, 4900, 2940))
    monstruos(z, 'escarabajo_sol', 3, (100, 3080, 4900, 4900))


# ===========================================================================
# 4. AMBERLEAF HIGHLANDS — las colinas de otoño (mundo 16, nivel 14)
# ===========================================================================
COLINAS_LAGOS = [(72, 78, 30, 20), (244, 86, 17, 11), (92, 252, 14, 9), (262, 250, 12, 8)]
COLINAS_GRANJA = (190, 202, 250, 248)        # casillas de la tierra labrada


def disenar_colinas(z, fotos):
    for i, c in enumerate(COLINAS_LAGOS):
        z.agua |= GZ.elipse_set(*c, semilla=1601 + i, rugoso=0.2)
    z.oasis = list(COLINAS_LAGOS)
    z.dist = GZ.distancias(z.agua)
    z.playa = GZ.orilla(z.dist, 1605, base=2, extra=3)
    camino_borde(z, 'N', 30)
    camino_borde(z, 'S', 282)
    camino_borde(z, 'E', 282)
    z.tierra |= GZ.tubo([(156, 28), (150, 70), (160, 120), (156, 156), (150, 200), (158, 250), (156, 284)], 4.6, 1606, rugoso=0.06)
    z.tierra |= GZ.tubo([(156, 156), (190, 150), (230, 162), (270, 152), (284, 156)], 4.6, 1607, rugoso=0.06)
    z.tierra |= GZ.elipse_set(136, 140, 12, 8, semilla=1608, rugoso=0.12)                          # el campamento
    z.tierra |= GZ.rect_set(*COLINAS_GRANJA)
    z.tierra |= GZ.tubo([(170, 214), (190, 218)], 2.4, 1609, rugoso=0.1)                           # a la granja
    z.tierra |= GZ.tubo([(150, 196), (110, 210), (80, 236)], 2.4, 1610, rugoso=0.12)                # al lago del sur
    z.tierra |= GZ.tubo([(150, 70), (110, 90), (92, 96)], 2.4, 1611, rugoso=0.12)                  # al lago del norte
    z.tierra |= z.playa
    z.tierra -= z.agua

    poner_salidas(z, (2560, 2640))
    zonas_pvp(z, 0, 0, 1800, W)
    guarida(z, 480, 2080, 1180, 2780)
    gx0, gy0, gx1, gy1 = caja_t(*COLINAS_GRANJA)
    z.reservado += [(1960, 2080, 2400, 2420), (gx0 - 40, gy0 - 80, gx1 + 40, gy1 + 40)]
    z.sin_monstruos += [(1900, 1950, 2500, 2600)]
    reservar_npc(z, 'hazel', 2236, 2340)
    reservar_npc(z, 'rowan', 3300, 3120)

    # ── el campamento del leñador ──
    z.poner_objeto('cabana_cazador', 2110, 2160, fotos, radio=100)
    z.poner_objeto('pila_lena', 2276, 2196, fotos, radio=34)
    z.poner_objeto('tocon_hacha', 2330, 2290, fotos, radio=20)
    z.poner_objeto('carro_lena', 1990, 2300, fotos, radio=40)
    z.poner_objeto('pila_lena', 2050, 2380, fotos, radio=34)
    # ── la granja de las calabazas: vallas arriba y abajo, hileras de calabazas, gavillas ──
    for x in range(gx0 + 32, gx1 - 30, 58):
        for y in (gy0 - 6, gy1 + 8):
            z.poner_objeto('cerca_rustica', x, y, fotos, radio=0)
    for fila in range(6):
        y = gy0 + 110 + fila * 112
        for x in range(gx0 + 90, gx1 - 60, 120):
            z.poner_objeto('calabazas', x + (fila % 2) * 40, y, fotos, radio=20)
    for x in range(gx0 + 60, gx0 + 560, 70):
        z.poner_objeto('gavilla', x, gy0 - 50, fotos, radio=10)
    z.poner_objeto('carro_lena', gx1 + 120, gy0 + 60, fotos, radio=40)
    z.poner_objeto('cabana_cazador', gx1 + 170, gy0 + 300, fotos, radio=100)
    # ── por las colinas: rocas con liquen, hojas caídas, setas, tocones ──
    z.esparcir(['roca_liquen'], 46, (60, 60, W - 60, W - 60), 26, fotos=fotos, sep=260)
    z.esparcir(['pila_hojas'], 70, (60, 60, W - 60, W - 60), 18, fotos=fotos, sep=180)
    z.esparcir(['seta_otono'], 40, (60, 60, W - 60, W - 60), 14, fotos=fotos, sep=220)
    z.esparcir(['tocon_hacha', 'pila_lena'], 16, (60, 60, W - 60, W - 60), 24, fotos=fotos, sep=600)
    z.esparcir(['calabazas', 'gavilla'], 14, (1900, 2700, W - 60, W - 60), 18, fotos=fotos, sep=500)

    cartel(z, 'bienvenida', 2700, 2760, 'Amberleaf Highlands')
    cartel(z, 'puerto', 2384, 4500, 'South: Saltwind Harbor')
    cartel(z, 'selva', 4560, 2414, 'East: Emerald Jungle')
    cartel(z, 'volcan', 2384, 660, 'North: Emberfall Caldera')
    cartel(z, 'pvp', 1860, 2380, 'Stag Woods — PvP zone')
    cartel(z, 'granja', gx0 - 60, gy0 - 30, 'Ashby Pumpkin Farm')

    arboleda(z, [('arce_rojo', 4), ('roble_ambar', 4), ('haya_cobre', 3), ('ginkgo', 2)], 480,
             peso=bosque_ruido(1612, 0.48, base=0.16))

    monstruos(z, 'oso_otono', 4, (1900, 100, 4900, 4900))
    monstruos(z, 'oso_otono', 3, (100, 100, 1740, 4900))
    monstruos(z, 'espantapajaros', 3, (1900, 2900, 4900, 4900))
    monstruos(z, 'espantapajaros', 3, (100, 100, 1740, 4900))


# ===========================================================================
# 5. THE EMERALD JUNGLE — la selva (mundo 17, nivel 15)
# ===========================================================================
SELVA_RIO = [(316, 64), (290, 76), (268, 94), (248, 120), (236, 148), (226, 164)]
SELVA_LAGUNA = (220, 176, 20, 15)
SELVA_CHARCAS = [(70, 70, 15, 10), (80, 250, 14, 9), (290, 250, 14, 10)]
SELVA_CLARO = (125, 156, 16, 12)


def disenar_selva(z, fotos):
    z.agua |= GZ.tubo(SELVA_RIO, 3.6, 1701, rugoso=0.22) | GZ.elipse_set(*SELVA_LAGUNA, semilla=1702, rugoso=0.2)
    for i, c in enumerate(SELVA_CHARCAS):
        z.agua |= GZ.elipse_set(*c, semilla=1703 + i, rugoso=0.22)
    z.oasis = [(272, 112, 46, 54), SELVA_LAGUNA] + SELVA_CHARCAS
    z.dist = GZ.distancias(z.agua)
    z.playa = GZ.orilla(z.dist, 1706, base=2, extra=3)
    camino_borde(z, 'O', 40)
    camino_borde(z, 'N', 30)
    camino_borde(z, 'S', 282)
    z.tierra |= GZ.tubo([(40, 156), (80, 150), (112, 156), (140, 156), (156, 156)], 4.4, 1707, rugoso=0.06)
    z.tierra |= GZ.tubo([(156, 28), (162, 80), (152, 120), (156, 156), (162, 200), (152, 250), (156, 284)], 4.6, 1708, rugoso=0.06)
    z.tierra |= GZ.elipse_set(*SELVA_CLARO, semilla=1709, rugoso=0.12)
    z.tierra |= GZ.tubo([(162, 170), (190, 176), (198, 178)], 2.4, 1710, rugoso=0.1)                 # a la laguna
    z.tierra |= GZ.tubo([(200, 196), (230, 214), (256, 222)], 2.6, 1711, rugoso=0.12)               # al templo
    z.tierra |= z.playa
    z.tierra -= z.agua

    poner_salidas(z, (2000, 2620))
    zonas_pvp(z, 3300, 0, W, W)
    guarida(z, 3800, 3600, 4500, 4300)
    z.reservado += [(1640, 2160, 2380, 2860)]
    z.sin_monstruos += [(1500, 2000, 2500, 3000)]
    reservar_npc(z, 'tupa', 2000, 2392)
    reservar_npc(z, 'kaia', 3090, 2806)

    # ── la aldea de Tupa: cabañas, tótems ──
    for (x, y) in ((1830, 2330), (2170, 2330), (1770, 2760), (2230, 2760)):
        z.poner_objeto('cabana_selva', x, y, fotos, radio=80)
    for (x, y) in ((1860, 2604), (2140, 2604)):
        z.poner_objeto('totem_selva', x, y, fotos, radio=20)
    # ── el templo de la selva y su guardia de tótems ──
    tx, ty = 4150, 3560
    z.poner_objeto('templo_selva', tx, ty, fotos, radio=140)
    for (x, y) in ((tx - 260, ty + 40), (tx + 260, ty + 40), (tx - 330, ty + 330), (tx + 330, ty + 330)):
        z.poner_objeto('totem_selva', x, y, fotos, radio=20)
    # ── la selva ──
    junto_al_agua(z, ['bambu'], 40, fotos, hasta=3, sep=120)
    z.esparcir(['helecho'], 110, (60, 60, W - 60, W - 60), 18, fotos=fotos, sep=150)
    z.esparcir(['flor_tropical'], 80, (60, 60, W - 60, W - 60), 16, fotos=fotos, sep=170)
    z.esparcir(['roca_selva'], 28, (60, 60, W - 60, W - 60), 24, fotos=fotos, sep=320)
    z.esparcir(['tronco_lianas'], 16, (60, 60, W - 60, W - 60), 40, fotos=fotos, sep=460)
    z.esparcir(['bambu'], 26, (60, 60, W - 60, W - 60), 18, fotos=fotos, sep=260)
    z.esparcir(['totem_selva'], 8, (3350, 60, W - 60, W - 60), 18, fotos=fotos, sep=700)

    cartel(z, 'bienvenida', 2240, 2860, 'The Emerald Jungle')
    cartel(z, 'colinas', 330, 2414, 'West: Amberleaf Highlands')
    cartel(z, 'pantano', 2384, 4500, 'South: Mirefen Bog')
    cartel(z, 'hongos', 2384, 660, 'North: Glowcap Hollow')
    cartel(z, 'pvp', 3360, 2380, 'Temple Grounds — PvP zone')
    cartel(z, 'aldea', 1700, 2620, "Tupa's Village")

    arboleda(z, [('ceiba', 3), ('platanera', 4), ('helecho_arboreo', 4)], 540,
             peso=bosque_ruido(1712, 0.42, base=0.3), margen_agua=3)

    monstruos(z, 'pantera_selva', 4, (100, 100, 3240, 4900))
    monstruos(z, 'pantera_selva', 3, (3360, 100, 4950, 4950))
    monstruos(z, 'chaman_selva', 3, (100, 100, 3240, 4900))
    monstruos(z, 'chaman_selva', 3, (3360, 100, 4950, 4950))


# ===========================================================================
# 6. EMBERFALL CALDERA — el volcán (mundo 18, nivel 16)
# ===========================================================================
VOLCAN_LAGO = (150, 60, 36, 22)
VOLCAN_RIOS = [[(118, 72), (96, 96), (74, 132), (58, 176), (44, 230), (34, 280), (30, 316)],
               [(184, 70), (214, 84), (244, 98), (276, 108), (316, 116)]]
VOLCAN_TERMAS = [(206, 226, 16, 11), (100, 252, 12, 8)]
VOLCAN_CAMPO = (158, 162, 18, 12)
# Los vados de roca enfriada: sin ellos los dos ríos y el lago parten el mapa y el
# norte (con sus monstruos) queda aislado. Uno a media altura de cada tramo.
VOLCAN_VADOS = [(66, 154), (39, 255), (229, 91), (296, 112)]


def disenar_volcan(z, fotos):
    z.lava |= GZ.elipse_set(*VOLCAN_LAGO, semilla=1801, rugoso=0.16)
    for i, r in enumerate(VOLCAN_RIOS):
        z.lava |= GZ.tubo(r, 3.2, 1802 + i, rugoso=0.2)
    for i, (vx, vy) in enumerate(VOLCAN_VADOS):
        v = GZ.elipse_set(vx, vy, 5, 5, semilla=1820 + i, rugoso=0.08) & z.lava
        z.lava -= v
        z.vados |= v
    for i, c in enumerate(VOLCAN_TERMAS):
        z.agua |= GZ.elipse_set(*c, semilla=1810 + i, rugoso=0.18)
    z.oasis = list(VOLCAN_TERMAS)
    # La orilla (tierra) solo en las termas: alrededor de la lava la ceniza llega hasta
    # el borde y el calor la tiñe en degradado (un anillo de tierra dejaba un borde dentado).
    z.dist = GZ.distancias(z.agua)
    z.playa = GZ.orilla(z.dist, 1812, base=2, extra=3)
    z.tierra |= GZ.elipse_set(*VOLCAN_CAMPO, semilla=1813, rugoso=0.12)
    camino_borde(z, 'S', 172)
    camino_borde(z, 'E', 170)
    z.tierra |= GZ.tubo([(150, 152), (140, 120), (150, 96)], 2.6, 1814, rugoso=0.12)               # a la caldera
    z.tierra |= GZ.tubo([(176, 168), (196, 196), (204, 212)], 2.4, 1815, rugoso=0.12)              # a las termas
    z.tierra |= GZ.tubo([(152, 200), (120, 230), (104, 242)], 2.4, 1816, rugoso=0.12)              # a la terma del oeste
    # Las sendas que llevan a los vados (y siguen un poco al otro lado).
    z.tierra |= GZ.tubo([(150, 160), (120, 156), (90, 154), (66, 154), (44, 150)], 2.2, 1821, rugoso=0.12)
    z.tierra |= GZ.tubo([(104, 242), (70, 250), (39, 255), (20, 258)], 2.2, 1822, rugoso=0.12)
    z.tierra |= GZ.tubo([(190, 168), (206, 130), (229, 91), (236, 70)], 2.2, 1823, rugoso=0.12)
    z.tierra |= GZ.tubo([(286, 168), (292, 140), (296, 112), (298, 92)], 2.2, 1824, rugoso=0.12)
    z.tierra -= z.lava
    z.tierra |= z.playa
    z.tierra -= z.agua

    poner_salidas(z, (2600, 2700))
    zonas_pvp(z, 0, 0, W, 2000)
    guarida(z, 2060, 1300, 2960, 1980)
    z.reservado += [(2200, 2360, 2860, 2860)]
    z.sin_monstruos += [(2100, 2250, 3000, 2950)]
    reservar_npc(z, 'brakka', 2400, 2604)
    reservar_npc(z, 'sorrel', 3060, 2140)

    # ── el campamento de la forja ──
    z.poner_objeto('forja', 2380, 2490, fotos, radio=80)
    z.poner_objeto('yunque', 2480, 2524, fotos, radio=24)
    for (x, y) in ((2290, 2566), (2680, 2470), (2680, 2780), (2300, 2790)):
        z.poner_objeto('brasero_volcan', x, y, fotos, radio=16)
    z.poner_objeto('obelisco_obsidiana', 2790, 2560, fotos, radio=20)
    # ── la guarida del dragón: obeliscos de obsidiana y el cráneo ──
    for (x, y) in ((2110, 1420), (2910, 1420), (2110, 1900), (2910, 1900)):
        z.poner_objeto('obelisco_obsidiana', x, y, fotos, radio=20)
    z.poner_objeto('craneo_dragon', 3060, 1780, fotos, radio=60)
    # ── junto a la lava: rocas de lava; por todo: fumarolas, cristales, rocas ──
    z.esparcir(['roca_lava'], 30, (60, 60, W - 60, W - 60), 20, fotos=fotos, sep=240, margen_agua=1)
    z.esparcir(['roca_volcanica'], 44, (60, 60, W - 60, W - 60), 24, fotos=fotos, sep=260)
    z.esparcir(['fumarola'], 22, (60, 60, W - 60, W - 60), 20, fotos=fotos, sep=420)
    z.esparcir(['cristal_fuego'], 26, (60, 60, W - 60, W - 60), 18, fotos=fotos, sep=380)
    z.esparcir(['obelisco_obsidiana'], 8, (60, 60, W - 60, W - 60), 18, fotos=fotos, sep=900)
    for y in range(3000, 4600, 420):
        z.poner_objeto('brasero_volcan', C0 * T - 30, y, fotos, radio=14)
    for x in range(3000, 4600, 420):
        z.poner_objeto('brasero_volcan', x, C0 * T - 24, fotos, radio=14)

    cartel(z, 'bienvenida', 2780, 2860, 'Emberfall Caldera')
    cartel(z, 'colinas', 2384, 4500, 'South: Amberleaf Highlands')
    cartel(z, 'hongos', 4560, 2414, 'East: Glowcap Hollow')
    cartel(z, 'pvp', 2620, 2080, "Dragon's Caldera — PvP zone")
    cartel(z, 'termas', 3060, 3440, 'Ember Springs')

    arboleda(z, [('pino_ceniza', 4), ('arbol_carbonizado', 4), ('arbusto_brasa', 3)], 280,
             peso=bosque_ruido(1817, 0.5, base=0.18))

    monstruos(z, 'salamandra_magma', 4, (100, 2060, 4900, 4900))
    monstruos(z, 'salamandra_magma', 3, (100, 100, 4900, 1940))
    monstruos(z, 'golem_magma', 3, (100, 2060, 4900, 4900))
    monstruos(z, 'golem_magma', 3, (100, 100, 4900, 1940))


# ===========================================================================
# 7. GLOWCAP HOLLOW — la hondonada de las setas (mundo 19, nivel 17)
# ===========================================================================
HONGOS_POZAS = [(80, 90, 18, 12), (232, 232, 20, 14), (90, 242, 16, 11), (252, 118, 14, 10), (176, 58, 12, 8)]
HONGOS_CLARO = (165, 160, 20, 13)


def disenar_hongos(z, fotos):
    for i, c in enumerate(HONGOS_POZAS):
        z.agua |= GZ.elipse_set(*c, semilla=1901 + i, rugoso=0.2)
    z.oasis = list(HONGOS_POZAS)
    z.dist = GZ.distancias(z.agua)
    z.playa = GZ.orilla(z.dist, 1906, base=2, extra=3)
    camino_borde(z, 'O', 40)
    camino_borde(z, 'S', 172)
    z.tierra |= GZ.tubo([(40, 156), (80, 150), (120, 160), (150, 158)], 4.4, 1907, rugoso=0.06)
    z.tierra |= GZ.elipse_set(*HONGOS_CLARO, semilla=1908, rugoso=0.12)
    z.tierra |= GZ.tubo([(150, 150), (120, 120), (100, 104)], 2.4, 1909, rugoso=0.12)             # a la poza del norte
    z.tierra |= GZ.tubo([(184, 166), (210, 196), (222, 216)], 2.4, 1910, rugoso=0.12)             # a la poza del este
    z.tierra |= GZ.tubo([(150, 150), (124, 136), (108, 130)], 2.0, 1911, rugoso=0.12)             # al corro de runas
    z.tierra |= z.playa
    z.tierra -= z.agua

    poner_salidas(z, (2700, 2644))
    zonas_pvp(z, 2800, 0, W, 2600)
    guarida(z, 3460, 860, 4160, 1560)
    z.reservado += [(2240, 2180, 3060, 2900), (1340, 1800, 1860, 2180)]
    z.sin_monstruos += [(2150, 2100, 3150, 3050)]
    reservar_npc(z, 'fennel', 2470, 2474)
    reservar_npc(z, 'grub', 2880, 2604)

    # ── la aldea de las casas seta ──
    for (x, y) in ((2420, 2380), (2860, 2380), (2320, 2800), (2920, 2800)):
        z.poner_objeto('casa_seta', x, y, fotos, radio=80)
    # (2026-11-25) El del este, de (2800, 2700) a (2720, 2500): con 230 px quedaba DETRÁS de la casa seta
    # del sureste (asomaba el sombrero por el tejado); ahora va delante de la del noreste, como el del oeste.
    for (x, y) in ((2560, 2500), (2720, 2500), (2580, 2780)):
        z.poner_objeto('farol_luciernaga', x, y, fotos, radio=16)
    # ── el corro de las piedras rúnicas ──
    rx, ry = 1600, 1990
    for k in range(7):
        a = k / 7.0 * math.tau
        z.poner_objeto('piedra_runa', rx + math.cos(a) * 200, ry + math.sin(a) * 130, fotos, radio=18)
    z.poner_objeto('cristal_luz', rx, ry + 10, fotos, radio=20)
    # ── faroles de luciérnagas en los caminos ──
    for x in range(700, 2300, 440):
        z.poner_objeto('farol_luciernaga', x, C0 * T - 24, fotos, radio=14)
    for y in range(3000, 4600, 440):
        z.poner_objeto('farol_luciernaga', C0 * T - 30, y, fotos, radio=14)
    # ── la hondonada: setitas, cristales junto al agua, raíces que brillan, tocones ──
    junto_al_agua(z, ['cristal_luz'], 26, fotos, hasta=3, sep=140)
    z.esparcir(['seta_pequena'], 120, (60, 60, W - 60, W - 60), 14, fotos=fotos, sep=150)
    z.esparcir(['raiz_brillante'], 24, (60, 60, W - 60, W - 60), 34, fotos=fotos, sep=360)
    z.esparcir(['tocon_musgo', 'hongo_estante'], 30, (60, 60, W - 60, W - 60), 26, fotos=fotos, sep=320)
    z.esparcir(['cristal_luz'], 20, (60, 60, W - 60, W - 60), 18, fotos=fotos, sep=520)
    z.esparcir(['piedra_runa'], 8, (60, 60, W - 60, W - 60), 16, fotos=fotos, sep=800)
    # Los halos del suelo bajo los cristales (pintados lisos, sin puntos).
    for o in z.objetos:
        if o['nombre'] == 'cristal_luz':
            z.brillos.append((o['x'], o['y'] - 6, 120, (110, 230, 240), 0.32))
        elif o['nombre'] == 'raiz_brillante':
            z.brillos.append((o['x'], o['y'] - 4, 90, (170, 130, 250), 0.24))

    cartel(z, 'bienvenida', 2240, 2880, 'Glowcap Hollow')
    cartel(z, 'volcan', 330, 2414, 'West: Emberfall Caldera')
    cartel(z, 'selva', 2384, 4500, 'South: Emerald Jungle')
    cartel(z, 'pvp', 2860, 2660, 'Queen\'s Mycelium — PvP zone')
    cartel(z, 'runas', 1600, 2200, 'The Whispering Stones')

    arboleda(z, [('seta_paraguas', 4), ('seta_campana', 4), ('seta_torre', 3)], 320,
             peso=bosque_ruido(1912, 0.5, base=0.18))

    monstruos(z, 'hongo_andante', 4, (100, 100, 4900, 4900))
    monstruos(z, 'hongo_andante', 3, (2860, 100, 4950, 2540))
    monstruos(z, 'polilla_luz', 3, (100, 100, 4900, 4900))
    monstruos(z, 'polilla_luz', 3, (2860, 100, 4950, 2540))


DISENOS = {'puerto': (disenar_puerto, 1313), 'pantano': (disenar_pantano, 1414), 'aldor': (disenar_aldor, 1515),
           'colinas': (disenar_colinas, 1616), 'selva': (disenar_selva, 1717), 'volcan': (disenar_volcan, 1818),
           'hongos': (disenar_hongos, 1919)}


# ===========================================================================
# LA COMPROBACIÓN (lo mismo que tools/reinos.test.cjs, antes de escribir)
# ===========================================================================
def _pisa(p, r):
    return p[0] - 15 < r['x'] + r['width'] and p[0] + 15 > r['x'] and p[1] + 25 < r['y'] + r['height'] and p[1] + 51 > r['y']


def _pisa_base(p, r):
    return p[0] - 15 < r['x'] + r['width'] and p[0] + 15 > r['x'] and p[1] - 26 < r['y'] + r['height'] and p[1] > r['y']


def _dist_pies(p, r):
    dx = max(r['x'] - (p[0] + 15), 0, (p[0] - 15) - (r['x'] + r['width']))
    dy = max(r['y'] - (p[1] + 51), 0, (p[1] + 25) - (r['y'] + r['height']))
    return math.hypot(dx, dy)


def _corta(a, b):
    return a['x'] < b['x'] + b['width'] and a['x'] + a['width'] > b['x'] and a['y'] < b['y'] + b['height'] and a['y'] + a['height'] > b['y']


def alcance(z):
    """Lo que el jugador alcanza A PIE desde la aparición (el espejo de la prueba de
    tools/reinos.test.cjs): celdas de 16 px con los pies (30 x 26) centrados en y + 38.
    Devuelve (alcanzadas, cuántas, libres)."""
    c = np.arange(N) * T + 8
    libre = np.ones((N, N), bool)
    libre[:, (c - 15 < 0) | (c + 15 > W)] = False
    libre[(c - 13 < 0) | (c + 13 > W), :] = False
    for r in z.colisiones:
        cx0 = max(0, math.floor((r['x'] - 23) / T) + 1)
        cx1 = min(N - 1, math.ceil((r['x'] + r['width'] + 7) / T) - 1)
        cy0 = max(0, math.floor((r['y'] - 21) / T) + 1)
        cy1 = min(N - 1, math.ceil((r['y'] + r['height'] + 5) / T) - 1)
        if cx1 >= cx0 and cy1 >= cy0:
            libre[cy0:cy1 + 1, cx0:cx1 + 1] = False
    ax, ay = z.aparicion[0]['x'], z.aparicion[0]['y']
    f0, c0 = int((ay + 38) // T), int(ax // T)
    vis = np.zeros((N, N), bool)
    if not libre[f0, c0]:
        return vis, 0, int(libre.sum())
    vis[f0, c0] = True
    cola = collections.deque([(f0, c0)])
    while cola:
        f, k = cola.popleft()
        for (f2, k2) in ((f, k + 1), (f, k - 1), (f + 1, k), (f - 1, k)):
            if 0 <= f2 < N and 0 <= k2 < N and libre[f2, k2] and not vis[f2, k2]:
                vis[f2, k2] = True
                cola.append((f2, k2))
    return vis, int(vis.sum()), int(libre.sum())


def _se_llega(vis, px, py, r):
    for cy in range(max(0, int((py - r) // T)), min(N - 1, int((py + r) // T)) + 1):
        for cx in range(max(0, int((px - r) // T)), min(N - 1, int((px + r) // T)) + 1):
            if vis[cy, cx] and math.hypot(cx * T + 8 - px, cy * T + 8 - py) <= r:
                return True
    return False


def _toca_salida(vis, s):
    c = np.arange(N) * T + 8
    filas = (c - 13 < s['y'] + s['height']) & (c + 13 > s['y'])
    cols = (c - 15 < s['x'] + s['width']) & (c + 15 > s['x'])
    return bool(vis[np.ix_(filas, cols)].any())


def validar_alcance(z):
    mal = []
    vis, total, libres = alcance(z)
    if total < 0.9 * libres:
        mal.append('solo se alcanza el %d %% del suelo libre' % (100 * total // max(1, libres)))
    for (lx, ly) in z.llegadas:
        if not _se_llega(vis, lx, ly + 38, 12):
            mal.append('la llegada (%d, %d) queda aislada' % (lx, ly))
    for s in z.salidas:
        if not _toca_salida(vis, s):
            mal.append('no se llega a la salida %s' % s['name'])
    for ident, (x, y) in z.npcs.items():
        if not _se_llega(vis, x, y + 20, 90):
            mal.append('no se llega a %s' % ident)
    for o in z.carteles:
        if not _se_llega(vis, o['x'], o['y'] + 20, 90):
            mal.append('no se llega al cartel %s' % o['name'])
    for m in z.monstruos:
        if not _se_llega(vis, m['x'], m['y'], 90):
            mal.append('no se llega a %s (%d, %d)' % (m['tipo'], m['x'], m['y']))
    jx0, jy0, jx1, jy1 = z.jefe
    if not _se_llega(vis, (jx0 + jx1) / 2, (jy0 + jy1) / 2, 160):
        mal.append('la guarida del jefe queda aislada')
    return mal, total, libres


def validar(z, fotos):
    mal = []
    cols = z.colisiones
    malas = [c for c in cols if c['name'] in ('agua', 'lava', 'roca', 'grieta')]
    agua = [c for c in cols if c['name'] in ('agua', 'lava')]
    for p in z.llegadas:
        for c in cols:
            if _pisa(p, c):
                mal.append('se llega a %s dentro de %s' % (p, c['name']))
        for s in z.salidas:
            if _pisa(p, s):
                mal.append('se llega a %s encima de la salida %s' % (p, s['name']))
    ap = (z.aparicion[0]['x'], z.aparicion[0]['y'])
    for s in z.salidas:
        if _dist_pies(ap, s) < 150:
            mal.append('la aparición a %d px de %s' % (_dist_pies(ap, s), s['name']))
        for c in cols:
            if _corta(c, s):
                mal.append('la salida %s la tapa %s' % (s['name'], c['name']))
    x0, y0, x1, y1 = z.pvp
    if x0 <= ap[0] < x1 and y0 <= ap[1] < y1:
        mal.append('la aparición en la PvP')
    for ident, (x, y) in z.npcs.items():
        for c in cols:
            if _pisa_base((x, y), c):
                mal.append('NPC %s dentro de %s' % (ident, c['name']))
        for s in z.salidas:
            if _dist_pies((x, y - 51), s) <= 200:
                mal.append('NPC %s junto a la salida %s' % (ident, s['name']))
    jx0, jy0, jx1, jy1 = z.jefe
    cj = ((jx0 + jx1) / 2, (jy0 + jy1) / 2)
    if not (jx0 >= 0 and jy0 >= 0 and jx1 <= W and jy1 <= W and jx1 - jx0 >= 600 and jy1 - jy0 >= 600):
        mal.append('la guarida fuera del mapa o pequeña')
    for c in malas:
        if _pisa(cj, c):
            mal.append('el centro de la guarida en %s' % c['name'])
    for o in z.objetos:
        ax, ay = fotos[o['nombre']]['apoyo']
        li = fotos[o['nombre']]['foto']
        if not (0.5 < ay / li.h <= 1):
            mal.append('%s: el apoyo no está abajo (%.2f)' % (o['nombre'], ay / li.h))
        if any(o['x'] > a['x'] and o['x'] < a['x'] + a['width'] and o['y'] > a['y'] and o['y'] < a['y'] + a['height'] for a in agua):
            mal.append('%s en el agua (%d, %d)' % (o['nombre'], o['x'], o['y']))
        for s in z.salidas:
            if _dist_pies((o['x'], o['y'] - 40), s) <= 60:
                mal.append('%s tapa la salida %s' % (o['nombre'], s['name']))
    for a in z.arboles:
        if any(a['x'] > q['x'] and a['x'] < q['x'] + q['width'] and a['y'] > q['y'] and a['y'] < q['y'] + q['height'] for q in agua):
            mal.append('un árbol en el agua (%d, %d)' % (a['x'], a['y']))
    for o in z.carteles:
        for q in malas:
            if o['x'] - 12 < q['x'] + q['width'] and o['x'] + 12 > q['x'] and o['y'] - 6 < q['y'] + q['height'] and o['y'] > q['y']:
                mal.append('el cartel %s en %s' % (o['name'], q['name']))
    for m in z.monstruos:
        for q in malas:
            if q['x'] - 20 < m['x'] < q['x'] + q['width'] + 20 and q['y'] - 20 < m['y'] < q['y'] + q['height'] + 20:
                mal.append('%s en %s (%d, %d)' % (m['tipo'], q['name'], m['x'], m['y']))
        for (lx, ly) in z.llegadas:
            if math.hypot(m['x'] - lx, m['y'] - ly) < 700:
                mal.append('%s a %d px de una llegada' % (m['tipo'], math.hypot(m['x'] - lx, m['y'] - ly)))
    area = sum(c['width'] * c['height'] for c in cols if c['name'] == 'agua')
    if area <= 120000:
        mal.append('poca agua: %d px²' % area)
    if len(z.objetos) < 60 or len(z.arboles) < 150 or len(z.monstruos) < 12:
        mal.append('pocos: %d objetos, %d árboles, %d monstruos' % (len(z.objetos), len(z.arboles), len(z.monstruos)))
    usados = sorted({a['nombre'] for a in z.arboles})
    if usados != sorted(RB.POR_ZONA[z.nombre]):
        mal.append('árboles usados %s != los de la zona %s' % (usados, sorted(RB.POR_ZONA[z.nombre])))
    mal += validar_alcance(z)[0]
    if mal:
        raise AssertionError('%s:\n  ' % z.nombre + '\n  '.join(mal[:40]))


# ===========================================================================
# EL ATLAS Y EL SUELO PINTADO
# ===========================================================================
def atlas_objetos(fotos, ruta_png, ruta_json, usados):
    """El atlas de generar-zonas, con solo lo que el mapa pone y su firma."""
    GZ.atlas_objetos({n: f for n, f in fotos.items() if n in usados}, ruta_png, ruta_json)
    with open(ruta_json, encoding='utf-8') as fh:
        datos = json.load(fh)
    datos['meta']['app'] = 'tools/generar-reinos.py'
    with open(ruta_json, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(datos, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write('\n')


# La orilla de cada bioma: ancho (px) y los tonos mojado, húmedo, claro y la línea de la marea.
ORILLAS = {
    'puerto': (110, 170, (198, 172, 124), (222, 198, 150), (238, 220, 176), (228, 206, 158)),
    'pantano': (50, 80, (60, 52, 36), (82, 72, 48), (98, 100, 62), (74, 66, 44)),
    'aldor': (70, 110, (178, 158, 118), (204, 186, 142), (222, 208, 164), (212, 194, 150)),
    'colinas': (52, 80, (96, 82, 62), (136, 118, 90), (150, 134, 92), (122, 108, 82)),
    'selva': (52, 82, (98, 62, 42), (138, 92, 60), (112, 118, 58), (122, 82, 54)),
    'volcan': (44, 68, (56, 50, 48), (82, 74, 70), (98, 88, 82), (112, 98, 90)),
    'hongos': (46, 72, (48, 42, 60), (72, 60, 82), (86, 72, 98), (96, 112, 120)),
}
# Las manchas grandes de la hierba: el giro cálido, el tono de los claros y su fuerza.
MANCHAS = {
    'puerto': ((30, 18, -20), (226, 222, 150), 0.12),
    'pantano': ((-10, 12, -6), (110, 120, 70), 0.10),
    'aldor': ((36, 24, -18), (230, 210, 130), 0.14),
    'colinas': ((40, 10, -24), (214, 150, 70), 0.18),
    'selva': ((-8, 24, -10), (120, 170, 70), 0.10),
    'volcan': ((26, 6, -6), (120, 104, 96), 0.10),
    'hongos': ((14, -6, 26), (120, 96, 150), 0.12),
}


def _mascara_casillas(celdas):
    m = np.zeros((N, N), bool)
    for (x, y) in celdas:
        m[y, x] = True
    return m


def pintar_manchas(arr, z):
    """La hierba con vida: manchas de cientos de px (más cálida donde da el sol)
    y claros de otro tono; degradados lisos, ni un punto."""
    calido, claro_c, fuerza = MANCHAS[z.nombre]
    hierba = ~_mascara_casillas(set(z.tierra) | set(z.agua) | set(z.piedra) | z.lava)
    H, Wd = arr.shape[:2]
    xs = np.arange(Wd, dtype=np.float32)
    cal = np.array(calido, np.float32)
    cla = np.array(claro_c, np.float32)
    for y0 in range(0, H, 512):
        y1 = min(H, y0 + 512)
        yy = np.arange(y0, y1, dtype=np.float32)[:, None]
        filas = np.arange(y0, y1) // T
        Ht = np.repeat(hierba[filas], T, axis=1)[:, :Wd]
        s = (np.sin(xs[None, :] / 211.0 + yy / 157.0) + np.sin(xs[None, :] / 389.0 - yy / 271.0 + 1.3)) * 0.5
        claro = np.clip((np.sin(xs[None, :] / 263.0 + 2.1) * np.sin(yy / 197.0 + 0.7) - 0.45) / 0.4, 0, 1)
        a = arr[y0:y1, :, :3].astype(np.float32)
        b = a + (s * 0.09)[..., None] * cal
        b = b * (1 - fuerza * claro[..., None]) + cla * (fuerza * claro[..., None])
        a = np.where(Ht[..., None], b, a)
        arr[y0:y1, :, :3] = np.clip(a, 0, 255).astype(np.uint8)


def pintar_orilla(arr, z):
    """La orilla de cada charca, lago o mar (la de generar-zonas, en el tono de
    cada bioma): mojada, húmeda y clara por la DISTANCIA a los píxeles azules,
    con dos líneas de marea; nunca sobre la piedra, los caminos ni la lava."""
    R0, R1, MOJ, HUM, CLA, MAR = ORILLAS[z.nombre]
    MOJ, HUM, CLA, MAR = [np.array(c, np.float32) for c in (MOJ, HUM, CLA, MAR)]
    H, Wd = arr.shape[:2]
    pinta_t = (_mascara_casillas(z.playa) | _mascara_casillas(z.agua) | ~_mascara_casillas(z.tierra)) \
        & ~_mascara_casillas(set(z.piedra)) & ~_mascara_casillas(z.lava)
    for (ocx, ocy, orx, ory) in z.oasis:
        x0, x1 = int(max(0, (ocx - orx - 14) * T)), int(min(Wd, (ocx + orx + 14) * T))
        y0, y1 = int(max(0, (ocy - ory - 14) * T)), int(min(H, (ocy + ory + 14) * T))
        sub = arr[y0:y1, x0:x1]
        a = sub[..., :3].astype(np.int16)
        azul_real = (a[..., 2] > a[..., 0] + 30) & (a[..., 2] > a[..., 1] + 4)
        hh, ww = azul_real.shape
        ty = (np.arange(y0, y1) // T).clip(0, N - 1)
        tx = (np.arange(x0, x1) // T).clip(0, N - 1)
        se_pinta = pinta_t[ty][:, tx]
        azul = GZ._caja_media(azul_real, 12) > 0.5
        dist = np.full(azul.shape, 32000, np.int32)
        dist[azul] = 0
        visto, borde = azul.copy(), azul.copy()
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
        col = np.where((dist < 8)[..., None], MOJ, np.where((dist < 22)[..., None], HUM, CLA)).astype(np.float32)
        for L in (40, 80):
            linea = (np.abs(dist - L) < 1) & (dist < R - 30)
            col = np.where(linea[..., None], MAR, col)
        t = np.clip((R - dist) / 30.0, 0.0, 1.0)[..., None]
        mezcla = col * t + a.astype(np.float32) * (1 - t)
        out = sub.copy()
        out[..., :3] = np.where(playa[..., None], np.clip(mezcla, 0, 255).astype(np.uint8), out[..., :3])
        arr[y0:y1, x0:x1] = out


def _media(a, k):
    """Media de `a` (reales) en una caja de (2k+1)² (imagen integral en doble)."""
    integ = np.pad(a.astype(np.float64), ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    hh, ww = a.shape
    ya, yb = np.clip(np.arange(hh) - k, 0, hh), np.clip(np.arange(hh) + k + 1, 0, hh)
    xa, xb = np.clip(np.arange(ww) - k, 0, ww), np.clip(np.arange(ww) + k + 1, 0, ww)
    suma = integ[yb][:, xb] - integ[ya][:, xb] - integ[yb][:, xa] + integ[ya][:, xa]
    return (suma / ((yb - ya)[:, None] * (xb - xa)[None, :])).astype(np.float32)


def _a_pixeles(campo, esc, x0, y0, x1, y1):
    """Un campo calculado a `esc` px por casilla, llevado (bilineal) a los
    píxeles de la caja x0..x1, y0..y1 del mapa."""
    f = esc / float(T)
    a, b = int(x0 * f), int(y0 * f)
    c, d = int(math.ceil(x1 * f)), int(math.ceil(y1 * f))
    trozo = Image.fromarray(np.ascontiguousarray(campo[b:d, a:c]).astype(np.float32), 'F')
    caja = ((x0 * f - a), (y0 * f - b), (x1 * f - a), (y1 * f - b))
    return np.array(trozo.resize((x1 - x0, y1 - y0), Image.BILINEAR, box=caja), np.float32)


def pintar_lava(arr, z):
    """LA LAVA (2026-11-24): la de la MINA. La lava de verdad va en su capa
    animada (tools/gf_lava_mina.py: el mismo tileset de seis fotogramas que la
    mina, con sus bordes a medida; gf-reinos.js la monta y la mueve). Aquí,
    debajo, va el LECHO: basalto tostado que se funde con la ceniza (es lo que
    asoma por fuera del labio de las piezas de borde), el calor que tiñe la
    ceniza de alrededor, la costra de los vados y, encima de todo, el PRIMER
    fotograma de esa capa: si no llegara a montarse se vería la misma lava,
    quieta.

    (Antes, 2026-11-21, era un degradado pintado quieto, costra, rojo, naranja
    y amarillo: "la lava no es igual a la de la mina de nivel 2".)"""
    ESC = 4
    m = np.repeat(np.repeat(_mascara_casillas(z.lava), ESC, 0), ESC, 1).astype(np.float32)
    mv = np.repeat(np.repeat(_mascara_casillas(z.vados), ESC, 0), ESC, 1).astype(np.float32)
    mt = np.maximum(m, mv)                                  # el río entero, también bajo la costra
    borde_r = _media(_media(m, 3), 3)                       # doble: el borde sale redondo, sin escalera
    calor_r = _media(_media(mt, 4), 4)
    costra_r = _media(_media(mv, 3), 3)
    debajo_r = (_media(mt, 4) + _media(mt, 10)) / 2.0       # por dónde corre la lava bajo la costra
    ys, xs_ = np.nonzero(_mascara_casillas(z.lava | z.vados))
    y0, y1 = max(0, (int(ys.min()) - 6) * T), min(W, (int(ys.max()) + 7) * T)
    x0, x1 = max(0, (int(xs_.min()) - 6) * T), min(W, (int(xs_.max()) + 7) * T)
    borde = _a_pixeles(borde_r, ESC, x0, y0, x1, y1)
    calor = _a_pixeles(calor_r, ESC, x0, y0, x1, y1)
    costra = _a_pixeles(costra_r, ESC, x0, y0, x1, y1)
    debajo = _a_pixeles(debajo_r, ESC, x0, y0, x1, y1)
    a = arr[y0:y1, x0:x1, :3].astype(np.float32)
    tinte = (np.clip(calor * 2.2, 0, 1) * 0.42)[..., None]
    a_fuera = a * (1 - tinte) + np.array((150, 52, 22), np.float32) * tinte
    # LOS VADOS: una costra de basalto encima del río (oscura, con el resplandor de la
    # lava que corre debajo por el centro), fundida en la ceniza por el borde.
    g = (np.clip((debajo - 0.72) / 0.28, 0, 1) * 0.42)[..., None]
    basalto = np.array((60, 49, 47), np.float32) * (1 - g) + np.array((168, 60, 24), np.float32) * g
    alfa = (np.clip((costra - 0.3) / 0.35, 0, 1) * 0.86)[..., None]
    a_fuera = a_fuera * (1 - alfa) + basalto * alfa
    # EL LECHO: basalto tostado, con su orilla fundida en la ceniza (borde liso).
    k = np.clip((borde - 0.3) / 0.35, 0, 1)[..., None]
    out = a_fuera * (1 - k) + np.array((54, 34, 30), np.float32) * k
    arr[y0:y1, x0:x1, :3] = np.clip(out, 0, 255).astype(np.uint8)
    # Y encima, el primer fotograma de la lava de la mina (su capa ya está escrita: generar()).
    LM.pintar_en(arr, z.nombre)


def pintar_brillo(arr, z):
    """Los halos de luz que dan los cristales y las raíces de la hondonada: un
    degradado redondo y liso (nunca sobre el agua, que tiene que seguir azul)."""
    H, Wd = arr.shape[:2]
    for (cx, cy, rad, color, fuerza) in z.brillos:
        x0, x1 = int(max(0, cx - rad)), int(min(Wd, cx + rad))
        y0, y1 = int(max(0, cy - rad * 0.6)), int(min(H, cy + rad * 0.6))
        if x1 <= x0 or y1 <= y0:
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
        d2 = ((xx - cx) / rad) ** 2 + ((yy - cy) / (rad * 0.6)) ** 2
        k = (np.exp(-d2 * 3.0) * fuerza * (d2 < 1))[..., None]
        a = arr[y0:y1, x0:x1, :3].astype(np.float32)
        azul = (a[..., 2] > a[..., 0] + 30) & (a[..., 2] > a[..., 1] + 4)
        b = a + (np.array(color, np.float32) - a) * k
        arr[y0:y1, x0:x1, :3] = np.where(azul[..., None], a, np.clip(b, 0, 255)).astype(np.uint8)


def suelo(z, datos, carpeta_tmp):
    """Pinta el suelo, le pasa su detalle, lo recolorea, le pone lo de su bioma y lo trocea."""
    cap = os.path.join(carpeta_tmp, z.nombre + '.png')
    det = os.path.join(carpeta_tmp, z.nombre + '_det.png')
    fin = os.path.join(carpeta_tmp, z.nombre + '_bioma.png')
    GS.pintar(datos, cap)
    extra = ['--sin-matas'] if z.nombre in SIN_MATAS else []
    subprocess.run([sys.executable, os.path.join(AQUI, 'detallar-captura-mapa.py'), cap, det] + extra, check=True)
    arr = np.array(Image.open(det).convert('RGBA'))
    arr = gf_biomas.recolorear(arr, z.nombre)
    pintar_manchas(arr, z)
    pintar_orilla(arr, z)
    if z.lava:
        pintar_lava(arr, z)
    if z.brillos:
        pintar_brillo(arr, z)
    Image.fromarray(arr).save(fin, optimize=True)
    destino = os.path.join(BIN, 'recortadas_' + z.nombre)
    subprocess.run([sys.executable, os.path.join(AQUI, 'trocear-escena.py'), fin, destino, VERSION], check=True)
    return fin


# ===========================================================================
# TODO
# ===========================================================================
def construir(nombre, fotos=None):
    """El diseño entero del mapa (sin escribir nada): zona, capa del suelo y fotos."""
    disenar, semilla = DISENOS[nombre]
    fotos = fotos or P.fotos(nombre)
    # (2026-11-24) Lo que dibuja el motor 2D (casas, tienda, taberna, faro, farolas) sustituye a la foto
    # del modelo 3D del mismo nombre: "las casas no se ven como las de GameScene ni de su tamaño".
    fotos.update(MC.fotos(nombre))
    z = Reino(nombre, semilla)
    disenar(z, fotos)
    V = GS.vertices(z.tierra)
    datos = GS.componer(random.Random(semilla), z.agua, set(), z.tierra, z.piedra, V)
    if nombre in SIN_MATAS:
        matas = {g for m in GS.MATAS_2X2 for g in m}
        datos = [86 if g in matas else g for g in datos]
    # Las colisiones del agua (sin la que tapa la piedra: el muelle se pisa).
    for (x0, y0, x1, y1) in GS.rectangulos(z.agua - set(z.piedra)):
        sur = any(0 <= cx < N and 0 <= y1 + 1 < N and (cx, y1 + 1) not in z.agua for cx in range(x0, x1 + 1))
        ms = 4 if sur else 0
        z.colisiones.append({'x': x0 * T, 'y': y0 * T, 'width': (x1 - x0 + 1) * T, 'height': (y1 - y0 + 1) * T - ms, 'name': 'agua'})
    for (x0, y0, x1, y1) in GS.rectangulos(z.lava):
        z.colisiones.append({'x': x0 * T, 'y': y0 * T, 'width': (x1 - x0 + 1) * T, 'height': (y1 - y0 + 1) * T, 'name': 'lava'})
    validar(z, fotos)
    return z, datos, fotos


def escribir_mapa(z, datos):
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
    capa = lambda i, n, objs: {'id': i, 'name': n, 'type': 'objectgroup', 'opacity': 1, 'visible': True, 'x': 0, 'y': 0, 'objects': objs}
    capas = [
        {'id': 1, 'name': 'suelo', 'type': 'tilelayer', 'width': N, 'height': N, 'x': 0, 'y': 0, 'opacity': 1, 'visible': True, 'data': datos},
        capa(2, 'arboles', [obj({'name': a['nombre'], 'x': a['x'], 'y': a['y']}, point=True) for a in z.arboles]),
        capa(3, 'objetos', [obj({'name': o['nombre'], 'x': o['x'], 'y': o['y']}, point=True,
                                properties=props({'sombra': int(o['sombra'])})) for o in z.objetos]),
        capa(4, 'colisiones', [obj(c) for c in z.colisiones]),
        capa(5, 'salidas', [obj(s) for s in z.salidas]),
        capa(6, 'zonas', [obj(s) for s in z.zonas]),
        capa(7, 'aparicion', [obj(a, point=True) for a in z.aparicion]),
        capa(8, 'monstruos', [obj({'name': m['tipo'], 'x': m['x'], 'y': m['y']}, point=True) for m in z.monstruos]),
        capa(9, 'carteles', [obj(c, point=True, properties=props({'texto': c['texto']})) for c in z.carteles]),
    ]
    mapa = {
        'compressionlevel': -1, 'width': N, 'height': N, 'tilewidth': T, 'tileheight': T,
        'infinite': False, 'orientation': 'orthogonal', 'renderorder': 'right-down',
        'tiledversion': '1.10.2', 'type': 'map', 'version': '1.10', 'nextlayerid': 10, 'nextobjectid': 0,
        'properties': props({'generado_por': 'tools/generar-reinos.py', 'version': VERSION, 'zona': z.nombre,
                             'escala_arbol': ESCALA_ARBOL, 'agua_vida': VIDA_AGUA[z.nombre]}),
        'tilesets': [{'firstgid': 1, 'name': 'Tileset_mapa', 'image': '../Game/MAPAS/%s/tiles_%s.png' % (z.nombre, z.nombre),
                      'imagewidth': 1440, 'imageheight': 512, 'tilewidth': T, 'tileheight': T, 'columns': GS.TS_COLS,
                      'tilecount': 2880, 'margin': 0, 'spacing': 0}],
        'layers': capas,
    }
    mapa['nextobjectid'] = oid[0]
    ruta = os.path.join(BIN, 'Maps', z.nombre + '.json')
    with open(ruta, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(mapa, fh, ensure_ascii=False, separators=(',', ':'))
    return ruta


def resumen(z):
    """Lo que el cliente tiene que decir igual (gf-zonas, gf-npcs, gf-jefes, servidor)."""
    return {'aparicion': [z.aparicion[0]['x'], z.aparicion[0]['y']],
            'llegadas': {lado: list(LLEGADA[lado]) for lado, d in LADOS[z.nombre].items() if d != 'pueblo'},
            'salidas': {s['name']: [s['x'], s['y'], s['width'], s['height']] for s in z.salidas},
            'npcs': {k: list(v) for k, v in sorted(z.npcs.items())}, 'jefe': z.jefe, 'pvp': list(z.pvp),
            'arboles': sorted({a['nombre'] for a in z.arboles}),
            'objetos': len(z.objetos), 'n_arboles': len(z.arboles),
            'monstruos': {t: sum(1 for m in z.monstruos if m['tipo'] == t) for t in sorted({m['tipo'] for m in z.monstruos})},
            'luces': sorted({o['nombre'] for o in z.objetos if o['nombre'] in RA.LUCES}),
            'agua_px2': sum(c['width'] * c['height'] for c in z.colisiones if c['name'] == 'agua')}


def generar(nombre, con_suelo, carpeta_tmp):
    print('== %s (%s)' % (nombre, NOMBRES[nombre]))
    z, datos, fotos = construir(nombre)
    destino = os.path.join(BIN, 'Game', 'MAPAS', nombre)
    os.makedirs(destino, exist_ok=True)
    atlas_objetos(fotos, os.path.join(destino, 'objetos.png'), os.path.join(destino, 'objetos.json'),
                  {o['nombre'] for o in z.objetos})
    RB.arboles(nombre, os.path.join(destino, 'arboles'))
    GZ.despejar_faroles(z, fotos, os.path.join(destino, 'arboles'))     # (2026-11-25) los faroles 2D, sin un árbol delante
    ts = np.array(Image.open(GS.TILESET).convert('RGBA'))
    Image.fromarray(gf_biomas.recolorear(ts, nombre)).save(os.path.join(destino, 'tiles_%s.png' % nombre), optimize=True)
    ruta = escribir_mapa(z, datos)
    # (2026-11-24) La lava de la mina: su capa animada en el mapa y sus hojas (gf_lava_mina).
    if z.lava:
        print('  lava: %s' % LM.poner(nombre, ruta, destino))
    r = resumen(z)
    print('  mapa: %s | %d árboles, %d objetos, %d colisiones, monstruos %s, agua %d px²' % (
        ruta, r['n_arboles'], r['objetos'], len(z.colisiones), r['monstruos'], r['agua_px2']))
    if con_suelo:
        suelo(z, datos, carpeta_tmp)
    return r


def main():
    args = sys.argv[1:]
    ruta_resumen = None
    if '--resumen' in args:
        i = args.index('--resumen')
        ruta_resumen = args[i + 1]
        del args[i:i + 2]
    nombres = [a for a in args if not a.startswith('--')] or list(REINOS)
    for n in nombres:
        assert n in DISENOS, 'zona desconocida: ' + n
    # El agua del tileset de cada bioma sigue azul (gf-agua y la pesca la reconocen así).
    for zona, (ok, falso) in RA.comprobar_biomas(GS.TILESET).items():
        assert ok > 0.97 and falso < 0.002, 'el agua de %s ya no es azul (%s, %s)' % (zona, ok, falso)
    tmp = tempfile.mkdtemp(prefix='gf_reinos_')
    todo = {}
    for n in nombres:
        todo[n] = generar(n, '--suelo' in args, tmp)
    if ruta_resumen:
        with open(ruta_resumen, 'w', encoding='utf-8', newline='\n') as fh:
            json.dump(todo, fh, ensure_ascii=False, indent=1)
    print('listo (temporales en %s)' % tmp)


if __name__ == '__main__':
    main()
