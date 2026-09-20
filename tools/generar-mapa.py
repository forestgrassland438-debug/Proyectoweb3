#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
MAPAS COMPLETOS — un mapa entero de cada tema, no un recorte
=============================================================================

QUE ESCRIBE
---------------------------------------------------------------------------
    Game/newpro/mapas/<tema>.png        EL MAPA ENTERO, 960x640 (60x40 tiles)
    Game/newpro/mapas/<tema>.json       el mismo mapa en formato Tiled
    Game/newpro/mapas/mapas.json        el indice
    Game/newpro/mapas/contacto.png      los doce mapas en miniatura

POR QUE ESTE ARCHIVO EXISTE
---------------------------------------------------------------------------
Las ocho hojas `ref_*.png` de cada tileset son RECORTES: ensenan una pieza cada
una —la orilla, el acantilado, el camino— sobre un trozo de 16x11 tiles. Sirven
para saber que hace cada tile, pero no dicen como queda el conjunto, y por eso
dan la sensacion de que el tileset "no se ve".

Esto es lo contrario: un mapa entero, con su relieve, su rio, su lago, su
pueblo, sus caminos y su bosque, montado con el tileset del tema y con las
casas y los arboles del pack encima. Es la prueba de verdad: si un tileset esta
mal, aqui se ve a la primera.

COMO SE MONTA
---------------------------------------------------------------------------
    1  RELIEVE       una funcion de ruido suave decide donde hay terreno
                     secundario (hierba sobre tierra, nieve sobre hielo...)
    2  AGUA          otra decide el lago y el rio; el borde sale del juego de
                     13 piezas, igual que el terreno
    3  MESETA        una franja con su acantilado de tres tiles de alto
    4  CAMINOS       del pueblo a la orilla y del pueblo a la escalera
    5  PUEBLO        las casas de `newpro/construcciones`, alineadas al camino
    6  BOSQUE        los arboles de `newpro/vegetacion`, mas densos lejos del
                     pueblo y nunca encima del agua ni de una casa
    7  DETALLE       los 32 objetos sueltos del tileset, repartidos

LAS SOMBRAS LAS PONE EL MAPA, NO EL ARBOL
---------------------------------------------------------------------------
Los PNG de arboles y casas salen sin sombra pegada (el juego tiene la suya). Al
montar el mapa se pinta una elipse oscura bajo cada uno multiplicando lo que hay
debajo, que es como se comporta una sombra de verdad: oscurece la hierba, la
arena o el camino sin taparlos.

USO
---------------------------------------------------------------------------
    python tools/generar-mapa.py
    python tools/generar-mapa.py --solo pradera
"""

import io
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gf_arte as A
from gf_arte import Lienzo, Mascara, ajusta, rng_de
import gf_tiles as GT
from gf_tiles import T, LADOS
import gf_vegetacion as VEG

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEWPRO = os.path.join(RAIZ, 'Game', 'newpro')
DESTINO = os.path.join(NEWPRO, 'mapas')
WEB = '/Game/newpro/mapas'

AN, AL = 60, 40                      # tiles
BASE = [0, 1, 2, 3]
BASE_DECO = [4, 5, 6, 7]
SEC = [8, 9, 10, 11]
SEC_DECO = [12, 13, 14, 15]
TR_SEC, TR_LIQ = 16, 32
CAMINO_H, CAMINO_V, CAMINO_X = 29, 30, 31
LIQ_HONDO, LIQ_CLARO, LIQ_BRILLO = 45, 46, 47
ACA, ESCALERA, DECO0 = 48, 59, 64
_ORDEN = dict((l, i) for i, l in enumerate(LADOS))

# que temas tienen pueblo: en una cueva, en un volcan y en el fondo del mar no
# vive nadie, y plantar una casa de pizarra alli se ve peor que no ponerla
CON_PUEBLO = {'pradera', 'otono', 'nieve', 'isla', 'bosque_oscuro', 'ruinas',
              'desierto', 'jungla', 'pantano'}

# que arboles pega en cada tema
BOSQUE = {
    'pradera': ['roble', 'roble_grande', 'roble_chico', 'haya', 'abedul',
                'pino', 'cerezo', 'manzano', 'sauce'],
    'otono': ['otono_rojo', 'otono_dorado', 'arbol_seco', 'roble_chico'],
    'nieve': ['pino_nevado', 'arbol_nevado', 'arbol_muerto', 'pino_chico'],
    'isla': ['palmera', 'palmera_chica', 'roble_chico'],
    'bosque_oscuro': ['pino', 'abeto', 'roble_grande', 'haya', 'arbol_seco'],
    'jungla': ['ceiba', 'arbol_jungla', 'palmera', 'bambu'],
    'pantano': ['sauce_pantano', 'arbol_pantano', 'arbol_muerto', 'cana_pantano'],
    'desierto': ['palmera_chica', 'cactus', 'cactus_chico', 'arbol_seco'],
    'ruinas': ['roble', 'abedul', 'arbol_seco', 'haya'],
    'cueva': ['seta_gigante_roja', 'seta_gigante_lila', 'pedrusco', 'roca_musgo'],
    'volcan': ['arbol_muerto', 'arbol_seco', 'pedrusco'],
    'fondo_marino': ['roca_musgo', 'pedrusco', 'seta_gigante_lila'],
}
MATORRAL = ['arbusto', 'arbusto_grande', 'mata_hierba', 'mata_alta', 'helecho',
            'flores_rosa', 'flores_amarillas', 'flores_blancas', 'tocon',
            'pedrusco', 'roca_musgo']

PUEBLO = ['casa_mediana', 'tienda', 'casa_chica', 'posada', 'herreria',
          'casa_dos_pisos', 'boticario', 'casa_labranza', 'granero', 'cabana']
ADORNOS = ['valla', 'cartel', 'farola', 'banco', 'barril', 'caja', 'hoguera',
           'pila_lena', 'espantapajaros', 'pozo']


# ===========================================================================
# RUIDO SUAVE (para las manchas de terreno y el agua)
# ===========================================================================

def _h(x, y, s):
    return GT.ruido(int(x) * 3 + 1, int(y) * 7 + 3, s)


def _suave(x, y, esc, s):
    """Ruido de valor con interpolacion coseno: manchas redondas, no pixeles."""
    fx, fy = x / float(esc), y / float(esc)
    x0, y0 = int(math.floor(fx)), int(math.floor(fy))
    tx = (1 - math.cos((fx - x0) * math.pi)) / 2.0
    ty = (1 - math.cos((fy - y0) * math.pi)) / 2.0
    a = _h(x0, y0, s) * (1 - tx) + _h(x0 + 1, y0, s) * tx
    b = _h(x0, y0 + 1, s) * (1 - tx) + _h(x0 + 1, y0 + 1, s) * tx
    return a * (1 - ty) + b * ty


def campo(x, y, s):
    return (_suave(x, y, 11.0, s) * 0.62 + _suave(x, y, 5.0, s + 17) * 0.26 +
            _suave(x, y, 2.5, s + 31) * 0.12)


# ===========================================================================
# EL AUTOTILE DE 13 PIEZAS
# ===========================================================================

def pieza(d, x, y, base):
    if not d(x, y):
        return None
    n, s_, e, o = d(x, y - 1), d(x, y + 1), d(x + 1, y), d(x - 1, y)
    ne, no = d(x + 1, y - 1), d(x - 1, y - 1)
    se, so = d(x + 1, y + 1), d(x - 1, y + 1)
    if not n and not o:
        k = 'NO'
    elif not n and not e:
        k = 'NE'
    elif not s_ and not o:
        k = 'SO'
    elif not s_ and not e:
        k = 'SE'
    elif not n:
        k = 'N'
    elif not s_:
        k = 'S'
    elif not o:
        k = 'O'
    elif not e:
        k = 'E'
    elif not no:
        k = 'iNO'
    elif not ne:
        k = 'iNE'
    elif not so:
        k = 'iSO'
    elif not se:
        k = 'iSE'
    else:
        k = 'C'
    return base + _ORDEN[k]


# ===========================================================================
# EL MAPA
# ===========================================================================

class Mapa(object):
    def __init__(self, tema, semilla):
        self.tema = tema
        self.s = semilla
        self.suelo = [[BASE[0]] * AN for _ in range(AL)]
        self.capa2 = [[None] * AN for _ in range(AL)]      # transiciones, agua
        self.capa3 = [[None] * AN for _ in range(AL)]      # objetos de tile
        self.libre = [[True] * AN for _ in range(AL)]      # donde se puede pisar
        self.agua = [[False] * AN for _ in range(AL)]
        self.piezas = []                                   # PNG sueltos

    # ------------------------------------------------------------------ 1
    def terreno(self):
        s = self.s
        for y in range(AL):
            for x in range(AN):
                self.suelo[y][x] = BASE[(x * 3 + y * 5) % 4]

        def es_sec(x, y):
            if not (0 <= x < AN and 0 <= y < AL):
                return False
            return campo(x, y, s) > 0.60
        for y in range(AL):
            for x in range(AN):
                p = pieza(es_sec, x, y, TR_SEC)
                if p is not None:
                    self.capa2[y][x] = p

    # ------------------------------------------------------------------ 2
    def agua_y_rio(self):
        s = self.s + 101
        # el lago y el rio NO estan siempre en el mismo sitio: si lo estuvieran,
        # los doce mapas serian el mismo mapa repintado de otro color
        r = rng_de('agua', self.tema)
        cx = AN * (0.60 + r.random() * 0.22)
        cy = AL * (0.60 + r.random() * 0.20)
        rx = AN * (0.15 + r.random() * 0.08)
        ry = AL * (0.14 + r.random() * 0.07)
        self.rio_x = AN * (0.22 + r.random() * 0.18)
        self.rio_f = 0.16 + r.random() * 0.14

        def hay(x, y):
            if not (0 <= x < AN and 0 <= y < AL):
                return False
            d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
            lago = d < 0.85 + (campo(x, y, s) - 0.5) * 0.9
            # el rio: una banda que serpentea de arriba abajo hasta el lago
            xr = self.rio_x + math.sin(y * self.rio_f + s * 0.11) * AN * 0.08
            rio = abs(x - xr) < 1.6 + campo(x, y, s + 5) * 1.6 and y < cy + ry
            return lago or rio
        for y in range(AL):
            for x in range(AN):
                if hay(x, y):
                    self.agua[y][x] = True
                    self.libre[y][x] = False
        for y in range(AL):
            for x in range(AN):
                p = pieza(hay, x, y, TR_LIQ)
                if p is None:
                    continue
                dentro = all(hay(x + dx, y + dy)
                             for dx in (-1, 0, 1) for dy in (-1, 0, 1))
                if dentro:
                    # un destello suelto de vez en cuando. Con un modulo fijo
                    # (%11) los destellos salian en diagonal, como un rayado
                    p = LIQ_BRILLO if campo(x, y, s + 23) > 0.72 else LIQ_HONDO
                self.capa2[y][x] = p

    # ------------------------------------------------------------------ 3
    def meseta(self):
        """Una meseta con su acantilado de tres tiles, arriba a la izquierda."""
        y0 = 7
        # arranca en el BORDE del mapa: un acantilado que empieza en medio
        # de un prado se lee como un muro tirado ahi, no como un desnivel
        x0, x1 = 0, int(AN * 0.44)
        for y in range(0, y0):
            for x in range(x0, x1 + 1):
                if self.agua[y][x]:
                    continue
                self.suelo[y][x] = BASE[(x + y) % 4]
                self.capa2[y][x] = None
        for i, x in enumerate(range(x0, x1 + 1)):
            if self.agua[y0][x]:
                continue
            col = 0 if x == x0 else (2 if x == x1 else 1)
            for k in range(3):
                self.capa2[y0 + k][x] = ACA + k * 3 + col
                self.libre[y0 + k][x] = False
        xe = (x0 + x1) // 2
        for k in range(3):
            self.capa2[y0 + k][xe] = ESCALERA if k == 0 else ESCALERA + 1
            self.libre[y0 + k][xe] = True
        self.escalera = xe
        self.pie_meseta = y0 + 3

    # ------------------------------------------------------------------ 4
    def caminos(self):
        yv = int(AL * (0.46 + rng_de('camino', self.tema).random() * 0.14))
        self.camino_y = yv
        for x in range(2, AN - 2):
            if self.agua[yv][x]:
                continue
            self.capa3[yv][x] = CAMINO_H
            self.libre[yv][x] = False
        xe = self.escalera
        for y in range(self.pie_meseta, yv):
            if self.agua[y][xe]:
                continue
            self.capa3[y][xe] = CAMINO_V
            self.libre[y][xe] = False
        if not self.agua[yv][xe]:
            self.capa3[yv][xe] = CAMINO_X
        xb = int(AN * 0.70)
        for y in range(yv + 1, int(AL * 0.62)):
            if self.agua[y][xb]:
                continue
            self.capa3[y][xb] = CAMINO_V
            self.libre[y][xb] = False
        self.capa3[yv][xb] = CAMINO_X

    # ------------------------------------------------------------------ 4b
    def puentes(self, cat):
        """
        Donde el camino cruza el agua va un PUENTE.

        Sin el, el camino llega a la orilla, desaparece y reaparece al otro
        lado: se lee como un fallo del mapa, no como un rio. Se mira por donde
        pasa el agua a la altura del camino y se tienden tantas tablas como
        haga falta para cruzarla entera.
        """
        f = cat.get('puente_h')
        if f is None:
            return
        yv = self.camino_y
        tramos = []
        x = 0
        while x < AN:
            if self.agua[yv][x]:
                x0 = x
                while x < AN and self.agua[yv][x]:
                    x += 1
                tramos.append((x0, x - 1))
            x += 1
        anchos = max(1, f['ancho'] // T)
        for x0, x1 in tramos:
            largo = x1 - x0 + 3
            px = (x0 - 1) * T
            n = (largo + anchos - 1) // anchos
            for k in range(n):
                self._pon(f, px + k * f['ancho'],
                          (yv + 1) * T - f['alto'] // 2 - 4, 'puente')
            for xx in range(max(0, x0 - 1), min(AN, x1 + 2)):
                self.libre[yv][xx] = False

    # ------------------------------------------------------------------ 5
    def pueblo(self, cat):
        if self.tema not in CON_PUEBLO:
            return
        rng = rng_de('pueblo', self.tema)
        yv = self.camino_y
        x = 6
        arriba = True
        for nombre in PUEBLO:
            f = cat.get(nombre)
            if f is None:
                continue
            anchos = (f['ancho'] + T - 1) // T
            if x + anchos + 1 >= AN - 4:
                break
            altos = (f['alto'] + T - 1) // T
            fy = yv - 1 if arriba else yv + 1
            py = (fy - altos + 1) if arriba else fy
            if py < 0 or py + altos > AL:
                arriba = not arriba
                continue
            if any(self.agua[yy][xx]
                   for yy in range(max(0, py), min(AL, py + altos))
                   for xx in range(x, min(AN, x + anchos))):
                x += anchos + 1
                continue
            self._pon(f, x * T + (anchos * T - f['ancho']) // 2,
                      (py + altos) * T - f['alto'], 'casa')
            for yy in range(max(0, py), min(AL, py + altos)):
                for xx in range(x, min(AN, x + anchos)):
                    self.libre[yy][xx] = False
            x += anchos + 2
            arriba = not arriba
        # adornos pegados al camino
        for i, nombre in enumerate(ADORNOS):
            f = cat.get(nombre)
            if f is None:
                continue
            xx = 5 + i * 5
            if xx >= AN - 4:
                break
            yy = yv + (2 if i % 2 else -2)
            if not (0 <= yy < AL) or self.agua[yy][xx] or not self.libre[yy][xx]:
                continue
            self._pon(f, xx * T, (yy + 1) * T - f['alto'], 'prop')
            self.libre[yy][xx] = False

    # ------------------------------------------------------------------ 6
    def bosque(self, cat):
        rng = rng_de('bosque', self.tema)
        arboles = BOSQUE.get(self.tema, BOSQUE['pradera'])
        for y in range(1, AL - 1):
            for x in range(1, AN - 1):
                if not self.libre[y][x] or self.agua[y][x]:
                    continue
                d = campo(x, y, self.s + 71)
                cerca = abs(y - self.camino_y) < 3
                p = (0.05 if cerca else 0.22) * (0.35 + d * 1.3)
                if rng.random() > p:
                    continue
                cual = arboles[int(rng.random() * len(arboles)) % len(arboles)]
                if rng.random() < 0.38:
                    cual = MATORRAL[int(rng.random() * len(MATORRAL)) % len(MATORRAL)]
                f = cat.get(cual)
                if f is None:
                    continue
                anchos = max(1, (f['ancho'] + T - 1) // T)
                altos = max(1, (f['alto'] + T - 1) // T)
                if x + anchos >= AN - 1 or (y + 1) * T - f['alto'] < 0:
                    continue
                if any(not self.libre[yy][xx] or self.agua[yy][xx]
                       for yy in range(max(0, y - altos + 1), y + 1)
                       for xx in range(x, min(AN, x + anchos))):
                    continue
                self._pon(f, x * T + (anchos * T - f['ancho']) // 2,
                          (y + 1) * T - f['alto'],
                          'arbol' if f['alto'] > 40 else 'planta')
                for yy in range(max(0, y - altos + 1), y + 1):
                    for xx in range(x, min(AN, x + anchos)):
                        self.libre[yy][xx] = False

    # ------------------------------------------------------------------ 7
    def detalle(self):
        rng = rng_de('detalle', self.tema)
        for y in range(AL):
            for x in range(AN):
                if not self.libre[y][x] or self.agua[y][x]:
                    continue
                if self.capa3[y][x] is not None or rng.random() > 0.035:
                    continue
                # solo la PRIMERA fila de objetos: en la segunda de casi todos
                # los temas estan las vallas, los barriles y las vasijas, y
                # sembrados por el campo se leen como basura tirada
                self.capa3[y][x] = DECO0 + int(rng.random() * 16)

    def _pon(self, ficha, px, py, clase):
        self.piezas.append(dict(id=ficha['id'], x=px, y=py, clase=clase,
                                ancho=ficha['ancho'], alto=ficha['alto'],
                                ruta=ficha['ruta']))


# ===========================================================================
# PINTAR
# ===========================================================================

def _sombra(li, cx, cy, rx, ry, fuerza=0.34):
    """
    La sombra de una pieza: MULTIPLICA lo que hay debajo, no lo tapa.

    Pintarla de un gris opaco deja una mancha plana que no se entera de si
    debajo hay hierba, arena o camino. Multiplicando, la sombra sobre la hierba
    es hierba oscura y sobre la arena es arena oscura, que es lo que hace el
    juego con `gf-sombras` en MULTIPLY.
    """
    m = Mascara(li.w, li.h).elipse(cx, cy, rx, ry)
    for x, y in m.puntos():
        c = li.get(x, y)
        if not c[3]:
            continue
        dx = (x - cx) / max(1.0, rx)
        dy = (y - cy) / max(1.0, ry)
        k = 1.0 - fuerza * max(0.0, 1.0 - (dx * dx + dy * dy) * 0.55)
        li.set(x, y, (int(c[0] * k), int(c[1] * k), int(c[2] * k), 255))


def pinta(mapa, tiles, cargar):
    li = Lienzo(AN * T, AL * T)
    for y in range(AL):
        for x in range(AN):
            for idx in (mapa.suelo[y][x], mapa.capa2[y][x], mapa.capa3[y][x]):
                if idx is None or idx >= len(tiles):
                    continue
                li.pegar(tiles[idx], x * T, y * T)
    # las piezas sueltas, de arriba abajo para que las de delante tapen
    for p in sorted(mapa.piezas, key=lambda q: q['y'] + q['alto']):
        im = cargar(p['ruta'])
        sx = p['x'] + p['ancho'] / 2.0
        sy = p['y'] + p['alto'] - 2
        if p['clase'] in ('arbol', 'casa'):
            _sombra(li, sx, sy, p['ancho'] * 0.40, max(2.5, p['alto'] * 0.055))
        elif p['clase'] == 'puente':
            pass
        elif p['clase'] == 'prop':
            _sombra(li, sx, sy, p['ancho'] * 0.38, 2.4, 0.26)
        li.pegar(im, p['x'], p['y'])
    return li


# ===========================================================================

def _catalogo():
    cat = {}
    for nombre in ('vegetacion/vegetacion.json', 'construcciones/construcciones.json'):
        ruta = os.path.join(NEWPRO, nombre.replace('/', os.sep))
        if not os.path.isfile(ruta):
            continue
        with io.open(ruta, encoding='utf-8') as fh:
            d = json.load(fh)
        for f in d['piezas']:
            cat[f['id']] = f
    return cat


_CACHE = {}


def _cargar(web):
    if web not in _CACHE:
        _CACHE[web] = Lienzo.desde(os.path.join(RAIZ, web.lstrip('/').replace('/', os.sep)))
    return _CACHE[web]


def _tiles_de(tema):
    ruta = os.path.join(NEWPRO, 'tilesets', tema, '%s.png' % tema)
    hoja = Lienzo.desde(ruta)
    cols = hoja.w // T
    fuera = []
    for i in range((hoja.w // T) * (hoja.h // T)):
        t = Lienzo(T, T)
        cx, cy = (i % cols) * T, (i // cols) * T
        for y in range(T):
            for x in range(T):
                c = hoja.get(cx + x, cy + y)
                if c[3]:
                    t.set(x, y, c)
        fuera.append(t)
    return fuera


def tiled(mapa, tema):
    """El mismo mapa en el formato que abre Tiled y que carga Phaser."""
    def plano(capa, vacio=0):
        return [((v + 1) if v is not None else vacio)
                for fila in capa for v in fila]
    return {
        'compressionlevel': -1, 'infinite': False, 'orientation': 'orthogonal',
        'renderorder': 'right-down', 'tiledversion': '1.10.2', 'type': 'map',
        'version': '1.10', 'width': AN, 'height': AL,
        'tilewidth': T, 'tileheight': T, 'nextlayerid': 5, 'nextobjectid': 1,
        'layers': [
            {'id': 1, 'name': 'suelo', 'type': 'tilelayer', 'visible': True,
             'opacity': 1, 'x': 0, 'y': 0, 'width': AN, 'height': AL,
             'data': plano(mapa.suelo)},
            {'id': 2, 'name': 'terreno', 'type': 'tilelayer', 'visible': True,
             'opacity': 1, 'x': 0, 'y': 0, 'width': AN, 'height': AL,
             'data': plano(mapa.capa2)},
            {'id': 3, 'name': 'objetos', 'type': 'tilelayer', 'visible': True,
             'opacity': 1, 'x': 0, 'y': 0, 'width': AN, 'height': AL,
             'data': plano(mapa.capa3)},
            {'id': 4, 'name': 'piezas', 'type': 'objectgroup', 'visible': True,
             'opacity': 1, 'x': 0, 'y': 0, 'draworder': 'topdown',
             'objects': [{'id': i + 1, 'name': p['id'], 'type': p['clase'],
                          'x': p['x'], 'y': p['y'] + p['alto'],
                          'width': p['ancho'], 'height': p['alto'],
                          'visible': True, 'rotation': 0,
                          'properties': [{'name': 'imagen', 'type': 'string',
                                          'value': p['ruta']}]}
                         for i, p in enumerate(mapa.piezas)]},
        ],
        'tilesets': [{'firstgid': 1, 'source': '../tilesets/%s/%s.json' % (tema, tema)}],
    }


def main():
    solo = None
    if '--solo' in sys.argv:
        solo = sys.argv[sys.argv.index('--solo') + 1]
    idx = os.path.join(NEWPRO, 'tilesets', 'tilesets.json')
    with io.open(idx, encoding='utf-8') as fh:
        temas = [t['tema'] for t in json.load(fh)['tilesets']]
    cat = _catalogo()
    fichas = []
    rutas = []
    for i, tema in enumerate(temas):
        if solo and tema != solo:
            continue
        tiles = _tiles_de(tema)
        m = Mapa(tema, 11 + i * 13)
        m.terreno()
        m.agua_y_rio()
        m.meseta()
        m.caminos()
        m.puentes(cat)
        m.pueblo(cat)
        m.bosque(cat)
        m.detalle()
        li = pinta(m, tiles, _cargar)
        png = os.path.join(DESTINO, '%s.png' % tema)
        li.guardar(png)
        rutas.append(png)
        with io.open(os.path.join(DESTINO, '%s.json' % tema), 'w',
                     encoding='utf-8') as fh:
            fh.write(json.dumps(tiled(m, tema), ensure_ascii=False, indent=1))
        fichas.append(dict(tema=tema, ancho=li.w, alto=li.h,
                           tiles=[AN, AL], piezas=len(m.piezas),
                           png='%s/%s.png' % (WEB, tema),
                           tiled='%s/%s.json' % (WEB, tema)))
        print('  %-14s %dx%d px, %d piezas encima' % (tema, li.w, li.h, len(m.piezas)))

    if not solo:
        A.hoja_contacto(rutas, columnas=3, escala=1).save(
            os.path.join(DESTINO, 'contacto.png'))
        with io.open(os.path.join(DESTINO, 'mapas.json'), 'w', encoding='utf-8') as fh:
            fh.write(json.dumps({
                'pack': 'newpro/mapas', 'version': 1, 'base_web': WEB,
                'tile': T, 'ancho_tiles': AN, 'alto_tiles': AL,
                'descripcion': ('Un mapa COMPLETO de cada tema: relieve, rio, lago, '
                                'meseta con acantilado, caminos, pueblo y bosque. '
                                'PNG para mirarlo y JSON de Tiled para usarlo.'),
                'mapas': fichas}, ensure_ascii=False, indent=1))
    print('%d mapas en %s' % (len(fichas), DESTINO))


if __name__ == '__main__':
    main()
