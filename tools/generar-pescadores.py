#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
PESCADORES — 6 personajes soulbound para pescar
=============================================================================

QUE ESCRIBE
---------------------------------------------------------------------------
    Game/newpro/personajes/personaje8 .. personaje13/
        {abajo,arriba,derecha,izquierda}/run_1..7.png    24x50
        Perfil/Perfil.png                                204x220

29 archivos por personaje, 174 en total, con la estructura exacta que espera
`gf-soulbound.js`: copiar la carpeta a `Game/Sprites/Soulbound/personajeN` y
aparece sola en el selector.

SE DIBUJAN SOBRE LOS CUERPOS DEL JUEGO
---------------------------------------------------------------------------
Cada fotograma sale de `Soulbound/personaje1` o `personaje2`, igual que los
cinco personajes del lote anterior. El paso, el balanceo de los brazos y el
cabeceo son EXACTAMENTE los del juego, asi que no hay forma de que uno ande
raro. Lo que se cambia es:

    LA PALETA, por rampas. No color a color: se identifica cada rampa del
    original (pelo de 5 tonos, piel de 2, ropa de 4-5, pantalon de 4, iris de
    3) y se sustituye entera por otra del mismo numero de peldanos. Asi las
    sombras y los brillos se quedan donde estaban y el sprite no se aplana.

    EL SOMBRERO, que SI cambia la silueta. Es lo que convierte a un chaval
    con camisa en un pescador, y no se puede pintar dentro del pelo.

    LA CORREA y EL CINTURON, que se pintan solo sobre pixeles de la ropa, asi
    que no tocan la silueta ni pueden estropear una pose.

EL SOMBRERO NO SE PONE A OJO
---------------------------------------------------------------------------
La cabeza se localiza en cada fotograma por el COLOR: los pixeles de la rampa
del pelo son la cabeza, y los de la rampa de la piel son la cara. De ahi salen
las tres medidas que necesita el sombrero — donde empieza el pelo, cuanto mide
de ancho y donde empieza la cara — sin escribir coordenadas fijas.

Hace falta porque los 28 fotogramas no tienen la cabeza en el mismo sitio: al
andar cabecea, y de espaldas el pelo es una cupula maciza sin cara debajo. Un
ala clavada en la fila 9 quedaba flotando en unos fotogramas y tapando los ojos
en otros.

El ala se pone SIEMPRE por encima de la cara (`y_ala <= cara_arriba - 1`), que
es la regla que impide el unico fallo grave posible: taparle los ojos al
personaje en la mitad de los fotogramas.

USO
---------------------------------------------------------------------------
    python tools/generar-pescadores.py
    python tools/generar-pescadores.py --hoja
"""

import io
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gf_arte as A
from gf_arte import Mascara, Lienzo, mezcla, ajusta

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGEN = os.path.join(RAIZ, 'Game', 'Sprites', 'Soulbound')
DESTINO = os.path.join(RAIZ, 'Game', 'newpro', 'personajes')
WEB = '/Game/newpro/personajes'

DIRS = ['abajo', 'arriba', 'derecha', 'izquierda']
NEGRO = (0, 0, 0)


# ===========================================================================
# LAS RAMPAS DE LOS DOS CUERPOS BASE
#   medidas contando pixeles en los 28 fotogramas de cada uno
# ===========================================================================

BASES = {
    'personaje1': {
        'pelo':     ['#251e1d', '#3f3432', '#554340', '#7d6864', '#9b8784'],
        'piel':     ['#cf8d7c', '#f7beb6'],
        'ropa':     ['#1e1e1e', '#282828', '#333333', '#4e4e4e'],
        'pantalon': ['#3c2451', '#573476', '#7747a3', '#8451b3'],
        'iris':     ['#213467', '#2e488d', '#3f62be'],
    },
    'personaje2': {
        'pelo':     ['#251e1d', '#3f3432', '#554340', '#7d6864', '#9b8784'],
        'piel':     ['#cf8d7c', '#f7beb6'],
        'ropa':     ['#00482c', '#006c41', '#007948', '#009259', '#00a664'],
        'pantalon': ['#1e1e1e', '#282828', '#333333', '#4e4e4e'],
        'iris':     ['#255026', '#3c803e', '#81c583'],
    },
}


def _mapa(base, destino):
    """{color original -> color nuevo} para las rampas de un cuerpo base."""
    m = {}
    for grupo, origen in BASES[base].items():
        nuevo = destino.get(grupo)
        if not nuevo:
            continue
        if len(nuevo) != len(origen):
            raise ValueError('la rampa %s necesita %d colores, tiene %d'
                             % (grupo, len(origen), len(nuevo)))
        for a, b in zip(origen, nuevo):
            m[A.hex_rgb(a)] = A.hex_rgb(b)
    return m


def _mascara_de(li, colores):
    m = Mascara(li.w, li.h)
    quiero = set(colores)
    for y in range(li.h):
        for x in range(li.w):
            c = li.get(x, y)
            if c[3] and c[:3] in quiero:
                m.set(x, y)
    return m


# ===========================================================================
# SOMBREROS
# ===========================================================================

def _ala(m, cx, y, rx, ry):
    for yy in range(int(y - ry), int(y + ry) + 1):
        d = abs(yy - y) / float(max(0.6, ry))
        an = rx * math.sqrt(max(0.0, 1 - d * d))
        m.fila(yy, cx - an, cx + an)
    return m


def _copa(m, cx, y_top, y_base, an, curva=0.40):
    """
    La copa del sombrero. `curva` es lo ANCHA que se queda arriba: 0 es un cono
    y 1 un cilindro.

    El perfil es un arco de circunferencia, no una raiz cuadrada. Con la raiz
    la copa arrancaba ya con el 62% de su ancho y, como el pelo de estos
    sprites llega a la fila 0, el redondeo se salia del lienzo y se recortaba:
    cuatro filas de 14 pixeles macizos, un sombrero con la copa cortada a
    cuchillo. El arco arranca estrecho y ensancha deprisa, asi que redondea
    dentro del lienzo.
    """
    y_top = max(0, y_top)
    alto = max(1, int(y_base - y_top))
    for i in range(alto + 1):
        t = i / float(max(1, alto))
        r = an * (curva + (1 - curva) * math.sqrt(max(0.0, 1 - (1 - t) ** 2)))
        m.fila(y_top + i, cx - r, cx + r)
    return m


def sombrero(li, pelo_m, cara_m, tipo, cols, direccion):
    """
    Pinta el sombrero sobre `li` y devuelve la mascara de lo que ha anadido
    FUERA de la silueta original (para saber que hay que contornear).
    """
    caja = pelo_m.caja()
    if caja is None:
        return Mascara(li.w, li.h)
    x0, y0, x1, y1 = caja
    an = x1 - x0 + 1
    al = y1 - y0 + 1
    cx = (x0 + x1) / 2.0

    y_ala = y0 + al * 0.56
    cara = cara_m.caja()
    if cara is not None:
        y_ala = min(y_ala, cara[1] - 1)          # NUNCA por debajo de la cara
    y_ala = max(y0 + 2, y_ala)

    m = Mascara(li.w, li.h)
    banda = Mascara(li.w, li.h)
    pompon = None

    # DONDE EMPIEZA LA COPA. Nunca por encima de la fila 1, porque el pelo de
    # estos sprites ya llega a la 0 y una copa que arranque ahi se queda sin
    # sitio para redondear: sale plana. Se asienta un pixel DENTRO del pelo y
    # lo que quede por encima se borra — un sombrero tapa el pelo, no flota
    # sobre el.
    y_copa = max(1, y0)
    if y_copa > y0:
        for y in range(0, int(y_copa)):
            for x in range(x0 - 2, x1 + 3):
                li.set(x, y, A.TRANSP)
        pelo_m = pelo_m.copia()
        for x, y in list(pelo_m.puntos()):
            if y < y_copa:
                pelo_m.set(x, y, 0)

    if tipo == 'paja':
        _ala(m, cx, y_ala, an / 2.0 + 1.5, 1.6)
        _copa(m, cx, y_copa, y_ala, an * 0.32, curva=0.26)
        banda.fila(int(y_ala) - 2, cx - an * 0.30, cx + an * 0.30)

    elif tipo == 'sueste':
        # el ala del sueste cae mas por detras: dos filas mas a los lados
        _ala(m, cx, y_ala, an / 2.0 + 1.0, 1.4)
        m.fila(int(y_ala) + 1, cx - an * 0.46, cx - an * 0.18)
        m.fila(int(y_ala) + 1, cx + an * 0.18, cx + an * 0.46)
        _copa(m, cx, y_copa, y_ala, an * 0.35, curva=0.34)
        banda.fila(int(y_ala) - 1, cx - an * 0.33, cx + an * 0.33)

    elif tipo == 'lana':
        _copa(m, cx, y_copa, y_ala + 1, an * 0.42, curva=0.40)
        banda.fila(int(y_ala), cx - an * 0.42, cx + an * 0.42)
        banda.fila(int(y_ala) + 1, cx - an * 0.42, cx + an * 0.42)
        m.unir(banda)
        pompon = (int(cx), int(y_copa) - 2)
        m.disco(pompon[0], pompon[1], 1.6)

    elif tipo == 'gorra':
        _copa(m, cx, y_copa, y_ala, an * 0.38, curva=0.34)
        v = {'abajo': 0, 'arriba': None, 'derecha': 1, 'izquierda': -1}[direccion]
        if v is not None:
            if v == 0:
                _ala(m, cx, y_ala + 1, an * 0.40, 1.2)
                m.fila(int(y_ala) + 2, cx - an * 0.30, cx + an * 0.30)
            else:
                for i in range(4):
                    m.fila(int(y_ala) - 1 + i // 2,
                           cx + v * an * 0.30, cx + v * (an * 0.36 + i))
        banda.fila(int(y_ala) - 1, cx - an * 0.36, cx + an * 0.36)

    elif tipo == 'panuelo':
        for i in range(3):
            _copa(m, cx, y_ala - 2 + i, y_ala - 2 + i, an * (0.46 - 0.02 * i), curva=1.0)
        _copa(m, cx, y0 + al * 0.18, y_ala - 1, an * 0.44, curva=0.58)
        s = -1 if direccion in ('izquierda', 'abajo') else 1
        nx = cx + s * an * 0.44
        m.disco(nx, y_ala - 1, 1.6)
        m.linea(nx, y_ala, nx + s * 2, y_ala + 3)
        m.linea(nx + 1 * s, y_ala, nx + s * 3, y_ala + 1)

    elif tipo == 'capucha':
        # La capucha tapa TODO el pelo y deja solo la cara. Recortarla a la
        # altura de la cara —como se recortan los sombreros— dejaba una franja
        # de pelo asomando entre la capucha y los ojos, y de espaldas (donde no
        # hay cara pero si orejas) la franja salia en mitad del craneo.
        for x, y in pelo_m.dilatar(True).puntos():
            m.set(x, y)
        m.restar(cara_m)
        if cara is not None:
            for i in range(4):                       # los lados enmarcan la cara
                m.set(cara[0] - 1, cara[1] + i)
                m.set(cara[2] + 1, cara[1] + i)
        for i in range(2):                           # los hombros
            m.fila(y1 + 1 + i, x0 - 1 + i, x1 + 1 - i)

    elif cara is not None:
        # el resto de sombreros nunca bajan de la cara
        for x, y in list(m.puntos()):
            if y > cara[1] and cara[0] <= x <= cara[2]:
                m.set(x, y, 0)

    original = li.mascara_opaca()
    ramp = [A.hex_rgb(c) for c in cols]
    caja_m = m.caja()
    if caja_m is None:
        return Mascara(li.w, li.h)
    hx0, hy0, hx1, hy1 = caja_m
    for x, y in m.puntos():
        fx = (x - hx0) / float(max(1, hx1 - hx0))
        fy = (y - hy0) / float(max(1, hy1 - hy0))
        d = fx * 0.40 + fy * 0.60
        li.set(x, y, ramp[min(len(ramp) - 1, int(d * (len(ramp) - 0.2)))])
    for x, y in banda.puntos():
        if m.get(x, y):
            li.set(x, y, ramp[-1])
    if pompon:
        li.set(pompon[0], pompon[1], ramp[0])
        li.set(pompon[0] - 1, pompon[1], ramp[1])
    # el filo de abajo del ala, en sombra
    for x, y in m.borde_interno(False).puntos():
        if y >= y_ala:
            li.set(x, y, ramp[-1])
    if tipo == 'capucha' and cara is not None:
        # el reborde interior, que es lo que le da hueco a la capucha
        for x, y in m.borde_interno(True).puntos():
            if cara[0] - 2 <= x <= cara[2] + 2 and y >= cara[1] - 2:
                li.set(x, y, ramp[-1])

    nuevos = m.copia().restar(original)
    for x, y in nuevos.dilatar(True).restar(m).puntos():
        if not original.get(x, y):
            li.set(x, y, NEGRO)
    return nuevos


# ===========================================================================
# CORREA Y CINTURON — solo sobre pixeles de ropa, nunca tocan la silueta
# ===========================================================================

def correa(li, ropa_m, color, direccion):
    caja = ropa_m.caja()
    if caja is None:
        return
    x0, y0, x1, y1 = caja
    col = A.hex_rgb(color)
    som = ajusta(col, dv=0.72)
    s = 1 if direccion != 'izquierda' else -1
    for x, y in ropa_m.puntos():
        fy = (y - y0) / float(max(1, y1 - y0))
        if fy > 0.72:
            continue
        u = (x - x0) - (0.55 if s > 0 else 0.45) * (x1 - x0) - s * (y - y0) * 0.55
        if abs(u) < 1.1:
            li.set(x, y, col)
        elif abs(u) < 2.0:
            li.set(x, y, som)


def cinturon(li, ropa_m, pant_m, color, hebilla):
    todo = ropa_m.copia().unir(pant_m)
    caja = todo.caja()
    if caja is None:
        return
    x0, y0, x1, y1 = caja
    cintura = None
    cr = ropa_m.caja()
    if cr:
        cintura = cr[3] - 1
    if cintura is None:
        return
    col = A.hex_rgb(color)
    for x in range(x0, x1 + 1):
        for y in (cintura, cintura - 1):
            if todo.get(x, y):
                li.set(x, y, col if y == cintura else ajusta(col, dv=1.2))
    cx = (x0 + x1) // 2
    if todo.get(cx, cintura):
        li.set(cx, cintura, A.hex_rgb(hebilla))
        li.set(cx, cintura - 1, ajusta(A.hex_rgb(hebilla), dv=1.25))


# ===========================================================================
# PERFIL
# ===========================================================================

def perfil_de(base, mapa, pj):
    """
    El retrato del selector NO se dibuja: se RECOLOREA el del cuerpo base.

    `personaje1/Perfil/Perfil.png` es una ilustracion de 204x220 con el marco
    azul del juego y las letras G y F; inventar un retrato nuevo con otro fondo
    lo delataria como pegote en cuanto se pusiera al lado en el panel. Ademas
    usa exactamente las mismas rampas que el sprite (medido: pelo 9.6%, piel
    3.0%, ropa 8.3% de los pixeles opacos), asi que el mismo diccionario de
    colores que viste el sprite viste el retrato.

    Se trabaja a 51x55 y se vuelve a subir x4 con vecino mas proximo, que es
    como esta hecho el original — comprobado: sus 204x220 son bloques macizos
    de 4x4. El sombrero se pinta ahi abajo, a tamano real; dibujarlo a 204 de
    ancho habria dado un ala de un pixel de grosor.
    """
    src = os.path.join(ORIGEN, base, 'Perfil', 'Perfil.png')
    gran = Lienzo.desde(src)
    escala = 4 if gran.w % 4 == 0 and gran.w > 60 else 1
    li = Lienzo(gran.w // escala, gran.h // escala)
    for y in range(li.h):
        for x in range(li.w):
            li.set(x, y, gran.get(x * escala, y * escala))

    for y in range(li.h):
        for x in range(li.w):
            c = li.get(x, y)
            if c[3] and c[:3] in mapa:
                li.set(x, y, mapa[c[:3]])

    pelo_m = _mascara_de(li, [A.hex_rgb(c) for c in pj['pelo']])
    cara_m = _mascara_de(li, [A.hex_rgb(c) for c in pj['piel']])
    cp = pelo_m.caja()
    if cp:
        for x, y in list(cara_m.puntos()):
            if y > cp[3] + 2:
                cara_m.set(x, y, 0)
    sombrero(li, pelo_m, cara_m, pj['sombrero'], pj['sombrero_cols'], 'abajo')
    return li, escala


# ===========================================================================
# LOS SEIS PESCADORES
# ===========================================================================

PESCADORES = [
    dict(carpeta='personaje8', nombre='Marea', base='personaje1',
         sombrero='paja', sombrero_cols=['#e8d08a', '#d8b862', '#b8964a', '#8f7132'],
         correa='#6b4a24', cinturon='#4a3318', hebilla='#c9a24a',
         fondo=('#3f6b8a', '#1e3a4f'),
         pelo=['#3a2a12', '#5c431c', '#83632c', '#b08f4a', '#d8bd7a'],
         piel=['#c9846b', '#f2b9a4'],
         ropa=['#141d2e', '#1f2c44', '#2b3d5c', '#3f5880'],
         pantalon=['#4a3a1c', '#6b552a', '#8a6f38', '#a88a4a'],
         iris=['#1c4a3f', '#2a6b5c', '#3f9682']),
    dict(carpeta='personaje9', nombre='Sueste', base='personaje2',
         sombrero='sueste', sombrero_cols=['#f0cf5a', '#dcb63f', '#b8932c', '#8a6e1c'],
         correa='#3a4450', cinturon='#2b333d', hebilla='#b2b2b2',
         fondo=('#8a7f4a', '#3f3a1e'),
         pelo=['#2b1f14', '#43301e', '#5f452c', '#886647', '#b08c66'],
         piel=['#cf8d7c', '#f7beb6'],
         ropa=['#8a6a14', '#b08a1e', '#d8ab2c', '#efc849', '#f7dd7a'],
         pantalon=['#161d28', '#202a38', '#2c384a', '#3d4c62'],
         iris=['#4a3a14', '#6f5a24', '#9c8340']),
    dict(carpeta='personaje10', nombre='Ancla', base='personaje1',
         sombrero='lana', sombrero_cols=['#5f86b2', '#41648f', '#2e4a6b', '#1e3149'],
         correa='#8a7f6a', cinturon='#3a3128', hebilla='#cbcbca',
         fondo=('#4a5f7a', '#1c2735'),
         pelo=['#141518', '#22262c', '#333a44', '#4d5765', '#6d7887'],
         piel=['#b8735c', '#e8a68e'],
         ropa=['#1c2b3a', '#26394d', '#334b64', '#476486'],
         pantalon=['#22242a', '#2e313a', '#3d414c', '#535866'],
         iris=['#4a3a1c', '#6b5528', '#96793c']),
    dict(carpeta='personaje11', nombre='Cana', base='personaje2',
         sombrero='gorra', sombrero_cols=['#7a9e4a', '#5f7f34', '#496424', '#354b18'],
         correa='#5f4a2c', cinturon='#3d2f1a', hebilla='#a07a32',
         fondo=('#6b8a4a', '#2b3a1c'),
         pelo=['#3a2a14', '#5c431e', '#856330', '#ad8a52', '#d0b284'],
         piel=['#cf8d7c', '#f7beb6'],
         ropa=['#4a4a2c', '#63633a', '#7d7d49', '#97975c', '#b0b076'],
         pantalon=['#3a2c1c', '#4d3b26', '#634c32', '#7e6342'],
         iris=['#2c4a1c', '#456b2c', '#66963f']),
    dict(carpeta='personaje12', nombre='Bruma', base='personaje1',
         sombrero='panuelo', sombrero_cols=['#d8524a', '#b83a34', '#912b26', '#6b1e1a'],
         correa='#4a4a4a', cinturon='#2b2b2b', hebilla='#b2b2b2',
         fondo=('#7a7f8a', '#2e333b'),
         pelo=['#1c1a1c', '#2e2b2e', '#454144', '#635e63', '#847f84'],
         piel=['#c98a72', '#f2b8a8'],
         ropa=['#2b2e33', '#3a3e45', '#4c525b', '#666d78'],
         pantalon=['#1e2a3a', '#28384c', '#354a63', '#476280'],
         iris=['#4a2c2c', '#6b4141', '#965c5c']),
    dict(carpeta='personaje13', nombre='Abisal', base='personaje2',
         sombrero='capucha', sombrero_cols=['#41566b', '#2e3d4f', '#22303e', '#18222c'],
         correa='#1a2531', cinturon='#0f161d', hebilla='#7fe0d8',
         fondo=('#2b4a5f', '#0e1a24'),
         pelo=['#4a5f6b', '#6b8794', '#8fa8b5', '#b5c8d2', '#dbe8ee'],
         piel=['#a8968f', '#dcc8be'],
         ropa=['#14202b', '#1c2c3a', '#27394a', '#33495e', '#446076'],
         pantalon=['#101820', '#18232d', '#22303c', '#2e404f'],
         iris=['#1c5f5a', '#2e8f88', '#4ac0b5']),
]


def genera(pj, hoja=False):
    mapa = _mapa(pj['base'], pj)
    cols_pelo = [A.hex_rgb(c) for c in pj['pelo']]
    cols_piel = [A.hex_rgb(c) for c in pj['piel']]
    cols_ropa = [A.hex_rgb(c) for c in pj['ropa']]
    cols_pant = [A.hex_rgb(c) for c in pj['pantalon']]
    escritos = []
    abajo1 = None

    for d in DIRS:
        for i in range(1, 8):
            src = os.path.join(ORIGEN, pj['base'], d, 'run_%d.png' % i)
            li = Lienzo.desde(src)
            for y in range(li.h):
                for x in range(li.w):
                    c = li.get(x, y)
                    if c[3] and c[:3] in mapa:
                        li.set(x, y, mapa[c[:3]])
            pelo_m = _mascara_de(li, cols_pelo)
            cara_m = _mascara_de(li, cols_piel)
            ropa_m = _mascara_de(li, cols_ropa)
            pant_m = _mascara_de(li, cols_pant)
            # la cara son los pixeles de piel de la CABEZA, no las manos
            cp = pelo_m.caja()
            if cp:
                for x, y in list(cara_m.puntos()):
                    if y > cp[3] + 2:
                        cara_m.set(x, y, 0)
            cinturon(li, ropa_m, pant_m, pj['cinturon'], pj['hebilla'])
            correa(li, ropa_m, pj['correa'], d)
            sombrero(li, pelo_m, cara_m, pj['sombrero'], pj['sombrero_cols'], d)
            ruta = os.path.join(DESTINO, pj['carpeta'], d, 'run_%d.png' % i)
            li.guardar(ruta)
            escritos.append(ruta)
            if d == 'abajo' and i == 1:
                abajo1 = li

    p, escala = perfil_de(pj['base'], mapa, pj)
    ruta = os.path.join(DESTINO, pj['carpeta'], 'Perfil', 'Perfil.png')
    p.guardar(ruta, escala=escala)
    escritos.append(ruta)
    return escritos


def main():
    hoja = '--hoja' in sys.argv
    cat = []
    todas = []
    for pj in PESCADORES:
        rutas = genera(pj)
        todas += [r for r in rutas if 'run_1.png' in r or 'run_4.png' in r]
        cat.append({'carpeta': pj['carpeta'], 'nombre': pj['nombre'],
                    'base': pj['base'], 'sombrero': pj['sombrero'],
                    'archivos': len(rutas),
                    'ruta': '%s/%s' % (WEB, pj['carpeta'])})
        print('  %-13s %-8s (%s, %s)  %d archivos'
              % (pj['carpeta'], pj['nombre'], pj['base'], pj['sombrero'], len(rutas)))
    with io.open(os.path.join(DESTINO, 'pescadores.json'), 'w', encoding='utf-8') as fh:
        fh.write(json.dumps({'pack': 'newpro/personajes', 'version': 1, 'base_web': WEB,
                             'total': sum(c['archivos'] for c in cat),
                             'personajes': cat}, ensure_ascii=False, indent=1))
    print('%d personajes en %s' % (len(cat), DESTINO))
    if hoja:
        d = os.path.join(os.environ.get('TEMP', '.'), 'gf_hojas')
        if not os.path.isdir(d):
            os.makedirs(d)
        A.hoja_contacto(todas, columnas=8, escala=6).save(os.path.join(d, 'pescadores.png'))
        A.hoja_contacto([os.path.join(DESTINO, p['carpeta'], 'Perfil', 'Perfil.png')
                         for p in PESCADORES], columnas=6, escala=1).save(
            os.path.join(d, 'pescadores_perfil.png'))
        print('hoja en', d)


if __name__ == '__main__':
    main()
