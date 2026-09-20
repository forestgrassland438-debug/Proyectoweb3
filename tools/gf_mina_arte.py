#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
GF MINA ARTE — las primitivas de dibujo de la mina, a 32 px
=============================================================================

POR QUE ESTE ARCHIVO EXISTE
---------------------------------------------------------------------------
`tools/gf_tiles.py` es el motor de tilesets del juego, y esta atado a
**T = 16**: `transicion`, `mascara_borde`, `acantilado` y los perfiles de
borde usan esa constante por dentro, en bucles `range(T)` y en indices
`[x % T]`. No acepta otro tamano.

La mina se dibuja a **32 px**. El motivo no es un capricho: el personaje mide
46 x 102 px en pantalla (sprite de 23x51 a escala 2). Con casillas de 16 px
eso son 2,9 x 6,4 casillas, asi que CUALQUIER cosa que ocupe una casilla —un
tramo de via, un cascote, una junta de la pared— sale seis veces mas pequena
que el personaje y el mundo se ve como una maqueta. A 32 px el jugador ocupa
1,4 x 3,2 casillas, que es la proporcion a la que estan dibujados los juegos
de vista cenital de este estilo.

Escalar el arte de 16 a 32 NO sirve: se ve el mismo dibujo con los pixeles del
doble de gordos, que es exactamente de lo que se queja el ojo. Hay que dibujar
a 32 con detalle de 32.

QUE HAY AQUI
---------------------------------------------------------------------------
Lo que gf_tiles.py no puede dar a 32 px:

    perfil()          la onda periodica que traza un borde
    mascara_borde()   la mascara del juego de 13 piezas
    relleno()         el relleno plano con motas
    transicion()      una pieza del juego de 13

Lo demas se reutiliza tal cual, porque `gf_volumen` SI es agnostico del
tamano: `empedrado`, `guijarro`, `lobulos` y `fleco` reciben coordenadas
explicitas.

EL ESTILO NO CAMBIA
---------------------------------------------------------------------------
Sigue siendo plano: tres tonos por material y manchas dibujadas, nunca un
degradado ni ruido pixel a pixel. Lo unico que cambia es que ahora caben
detalles que a 16 px no cabian.
"""

import math

import gf_arte as A
from gf_arte import Lienzo, Mascara, ajusta, mezcla
import gf_volumen as VOL

T = 32                          # el lado del tile de la mina


# ===========================================================================
# RUIDO Y PERFILES
# ===========================================================================

def ruido(x, y, semilla):
    """0..1 determinista. Mismo hash que el resto del proyecto."""
    h = (int(x) * 73856093) ^ (int(y) * 19349663) ^ (int(semilla) * 83492791)
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


_PERFILES = {}


def perfil(semilla, largo=T, amp=3.2, k=1):
    """
    Una onda PERIODICA de longitud `largo`, en pixeles enteros.

    Que sea periodica es lo que hace que dos piezas de borde pegadas continuen
    la linea sin escalon: vale lo mismo en el pixel 0 que en el `largo`. Es el
    mismo truco que usa gf_tiles a 16 px, escrito para cualquier tamano.

    Se cachea porque se pide muchas veces con la misma semilla.
    """
    clave = (semilla, largo, round(amp, 2), k)
    if clave in _PERFILES:
        return _PERFILES[clave]
    out = []
    for i in range(largo):
        v = (math.sin(2 * math.pi * k * i / largo + semilla * 0.7) * amp +
             math.sin(2 * math.pi * 2 * k * i / largo + semilla * 1.9) * amp * 0.42 +
             math.sin(2 * math.pi * 3 * k * i / largo + semilla * 3.1) * amp * 0.18)
        out.append(int(round(v)))
    _PERFILES[clave] = out
    return out


# ===========================================================================
# RELLENO
# ===========================================================================

def relleno(t, cols, semilla, motas=0, x0=0, y0=0, x1=None, y1=None,
            mascara=None, largo=3):
    """
    Rellena PLANO con el tono medio y estampa unas pocas motas deliberadas.

    El suelo del juego es liso: medido en `Game/MAPAS/tiles.png`, el tile de
    hierba es un 91 % de un unico color, y lo que no lo es son flores
    DIBUJADAS, no ruido. Salpicar pixel a pixel deja el mapa con nieve de
    television.

    Las motas van en posiciones funcion de la coordenada, no del azar, para
    que todas las copias del tile salgan identicas.
    """
    x1 = T if x1 is None else x1
    y1 = T if y1 is None else y1
    cl, me, os_ = cols[0], cols[1], cols[2]
    for y in range(y0, y1):
        for x in range(x0, x1):
            if mascara is not None and not mascara.get(x, y):
                continue
            t.set(x, y, me)
    for i in range(motas):
        mx = int(x0 + ruido(i * 13 + 1, 7, semilla) * max(1, x1 - x0 - largo))
        my = int(y0 + ruido(5, i * 17 + 3, semilla) * max(1, y1 - y0 - 1))
        col = os_ if i % 3 else cl
        for k in range(largo):
            if mascara is not None and not mascara.get(mx + k, my):
                continue
            if x0 <= mx + k < x1 and y0 <= my < y1:
                t.set(mx + k, my, col)
    return t


# ===========================================================================
# EL JUEGO DE 13 PIEZAS
# ===========================================================================

LADOS = ['NO', 'N', 'NE', 'O', 'C', 'E', 'SO', 'S', 'SE',
         'iNO', 'iNE', 'iSO', 'iSE']


def mascara_borde(lado, semilla, dentro=10.0, amp=3.2):
    """
    La mascara del terreno de DENTRO para una pieza del juego de 13.

    `lado` dice por donde se ACABA el terreno de dentro: 'N' es que lo de
    arriba es otra cosa, 'NO' que son arriba e izquierda, 'iNO' que solo se
    escapa por la esquina, y 'C' que esta rodeado.

    `dentro` es a cuantos pixeles del canto pasa el borde. A 32 px se usa 10
    (a 16 se usaban 5): la proporcion es la misma.
    """
    m = Mascara(T, T)
    pn = perfil(semilla, T, amp)
    ps = perfil(semilla + 3, T, amp)
    po = perfil(semilla + 5, T, amp)
    pe = perfil(semilla + 7, T, amp)

    def bajo_n(x, y):
        return y >= dentro + pn[int(x) % T]

    def sobre_s(x, y):
        return y <= (T - 1 - dentro) + ps[int(x) % T]

    def dcha_o(x, y):
        return x >= dentro + po[int(y) % T]

    def izda_e(x, y):
        return x <= (T - 1 - dentro) + pe[int(y) % T]

    reglas = {
        'C': lambda x, y: True,
        'N': bajo_n, 'S': sobre_s, 'O': dcha_o, 'E': izda_e,
        'NO': lambda x, y: bajo_n(x, y) and dcha_o(x, y),
        'NE': lambda x, y: bajo_n(x, y) and izda_e(x, y),
        'SO': lambda x, y: sobre_s(x, y) and dcha_o(x, y),
        'SE': lambda x, y: sobre_s(x, y) and izda_e(x, y),
        'iNO': lambda x, y: not (not bajo_n(x, y) and not dcha_o(x, y)),
        'iNE': lambda x, y: not (not bajo_n(x, y) and not izda_e(x, y)),
        'iSO': lambda x, y: not (not sobre_s(x, y) and not dcha_o(x, y)),
        'iSE': lambda x, y: not (not sobre_s(x, y) and not izda_e(x, y)),
    }
    f = reglas[lado]
    for y in range(T):
        for x in range(T):
            if f(x, y):
                m.set(x, y)
    return m


def _complemento(m):
    c = Mascara(m.w, m.h)
    for i, v in enumerate(m.d):
        if not v:
            c.d[i] = 1
    return c


def transicion(lado, fuera, dentro, semilla, estilo='ondulado',
               dentro_px=10.0, amp=3.2, piel=None):
    """
    Una pieza del juego de 13: `dentro` sobre `fuera`.

    EL BORDE NO ES UNA RAYA, ES UN ESCALON. Lo que el juego dibuja donde se
    acaba un terreno y empieza otro son tres cosas: el canto del terreno de
    dentro, una linea OSCURA por fuera —la sombra que proyecta, que es lo
    unico que dice que esta mas alto— y unos matojos del tono claro de dentro
    cayendo por encima de esa sombra. Un solo pixel de filo no es un escalon:
    es un cambio de pintura, y el mapa se ve como un mosaico plano.

    `piel` permite rellenar el interior con una TEXTURA en vez de con el tono
    medio liso. Lo usa la lava: un naranja liso al lado de un tile de lava
    agrietada se ve como un parche de otro material.
    """
    t = Lienzo(T, T)
    relleno(t, fuera, semilla, motas=2)
    m = mascara_borde(lado, semilla, dentro_px, amp)

    if piel is not None:
        for x, y in m.puntos():
            c = piel.get(x % piel.w, y % piel.h)
            if c[3]:
                t.set(x, y, c)
    else:
        relleno(t, dentro, semilla + 11, motas=2, mascara=m)

    if lado == 'C':
        return t

    d_cl, d_me, d_os = dentro[0], dentro[1], dentro[2]
    f_me = fuera[1]

    if estilo == 'seco':
        # Cascote: el borde se desmigaja en piedrecitas del tono de dentro.
        for x, y in m.borde(False).puntos():
            t.set(x, y, ajusta(f_me, dv=0.72))
        i = 0
        for x, y in m.borde_interno(True, contar_fuera=False).puntos():
            i += 1
            t.set(x, y, d_os if i % 3 else d_cl)
    else:
        # Ondulado: sombra por fuera y fleco del tono claro cayendo encima.
        VOL.fleco(t, m, d_cl, ajusta(f_me, dv=0.66), semilla + 19,
                  densidad=0.62, largo=3)
        for x, y in m.borde_interno(True, contar_fuera=False).puntos():
            if t.get(x, y) != d_cl:
                t.set(x, y, mezcla(d_os, d_cl, 0.25))
    return t


# ===========================================================================
# CORTAR
# ===========================================================================

def cortar(li, ancho, alto):
    """Parte un lienzo de `ancho` x `alto` TILES en la lista de sus tiles."""
    trozos = []
    for fy in range(alto):
        for fx in range(ancho):
            t = Lienzo(T, T)
            t.pegar(li, -fx * T, -fy * T)
            trozos.append(t)
    return trozos


def trozo(li, cx, fy):
    """Un tile suelto de un lienzo grande."""
    t = Lienzo(T, T)
    t.pegar(li, -cx * T, -fy * T)
    return t


def hoja(tiles, columnas):
    """Monta una lista de tiles en una imagen de `columnas` de ancho."""
    filas = (len(tiles) + columnas - 1) // columnas
    li = Lienzo(columnas * T, filas * T)
    for i, t in enumerate(tiles):
        if t is None:
            continue
        li.pegar(t, (i % columnas) * T, (i // columnas) * T)
    return li
