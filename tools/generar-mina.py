#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
MINA — el tileset gigante de la mina, a 32 px
=============================================================================

QUE ESCRIBE
---------------------------------------------------------------------------
    Game/MAPAS/Mina/tileset_mina.png    el tileset, casillas de 32x32
    Game/MAPAS/Mina/tileset_mina.json   que es cada tile, por nombre
    Game/MAPAS/Mina/ref_mina.png        la hoja de referencia con los indices
    Game/MAPAS/Mina/piezas.png/.json    atlas de las piezas grandes (sprites)
    Game/MAPAS/Mina/lava_flujo.png      textura que TEJE para la lava
    Game/MAPAS/Mina/lava_brillo.png     capa de brillo, tambien teje
    Game/MAPAS/Mina/lava_burbuja.png    6 fotogramas de la burbuja
    Game/MAPAS/Mina/agua_flujo.png      lo mismo para las charcas

POR QUE 32 PX Y NO 16
---------------------------------------------------------------------------
La primera version de la mina se dibujo a 16 px, como `tiles.png`. Estaba mal,
y la medida lo dice sola:

    el personaje en pantalla        46 x 102 px
    con casillas de 16 px           2,9 x 6,4 casillas
    con casillas de 32 px           1,4 x 3,2 casillas

Con casillas de 16, TODO lo que ocupa una casilla —un tramo de via, un
cascote, la junta de una pared— sale a la sexta parte de la altura del
personaje. Por eso los railes parecian hilos y las paredes bordillos. No era
cosa del dibujo: era la escala.

Y agrandar el mundo no arregla nada, porque agranda el personaje con el. Lo
que hay que agrandar es la CASILLA, que es la unidad en la que se dibuja el
detalle. A 32 px caben una traviesa de verdad, una hilada de mamposteria de
verdad y una grieta que no sea un pixel.

ESCALAR EL ARTE DE 16 A 32 NO VALE
---------------------------------------------------------------------------
Seria el mismo dibujo con los pixeles del doble de gordos: exactamente lo que
canta a la vista. Todo lo de aqui esta dibujado a 32 con detalle de 32. Las
primitivas que hacian falta y `gf_tiles.py` no podia dar (esta atado a T=16)
estan en `tools/gf_mina_arte.py`.

LA PALETA SALE DE tiles.png
---------------------------------------------------------------------------
`Game/MAPAS/tiles.png` tiene 89 colores opacos y nada mas. La mina usa las
MISMAS familias, que son las que ya estan en el mapa de fuera:

    piedra   #89817a  #7a736d  #5f5a54  #423f3c
    tierra   #b18569  #a57456  #80573f  #745232
    madera   #7b5740  #5b3d27
    agua     #5686a8  #5d6a70

Lo unico que no sale de ahi es la lava, porque fuera no hay lava; esos
naranjas vienen del tema `volcan` de generar-tilesets.py.

LAS SOMBRAS Y LA PROFUNDIDAD DE LAS PIEZAS NO SE DIBUJAN AQUI
---------------------------------------------------------------------------
Las piezas altas (racimos, pedruscos, vagonetas, arcos) salen SIN sombra a
proposito: en el juego se la pone `gf-sombras.js`, que la proyecta con cizalla
hacia abajo y a la derecha —el sol del juego esta arriba a la izquierda— y la
hornea por textura. Y el orden de dibujo lo decide `gf-profundidad.js`, que
mide la linea de suelo de verdad en vez de usar la Y del sprite. Pintar aqui
una sombra encima daria DOS sombras, y una con la direccion equivocada.

Corre con:  python tools/generar-mina.py
"""

import io
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gf_arte as A
from gf_arte import Lienzo, Mascara, ajusta, mezcla
import gf_volumen as VOL
import gf_mina_arte as MA
from gf_mina_arte import T, LADOS, relleno, transicion, mascara_borde, ruido, \
    perfil, cortar, trozo, hoja

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, 'Game', 'MAPAS', 'Mina')

COLS = 16                       # columnas del tileset (16 x 32 = 512 px)


def R(*hexes):
    return [A.hex_rgb(h) for h in hexes]


# ===========================================================================
# LA PALETA
# ===========================================================================
#
# `base` es el suelo pisado de la mina. `sec` es el cascote suelto: ojo, tiene
# que quedarse A UN PASO del suelo. La primera version le puso los tonos de la
# madera y en el mapa se leia como tablones tirados, no como grava. `roca` es
# la PARED, mas clara que el suelo a proposito: si fuera mas oscura no se
# sabria donde acaba el hueco.

PAL = dict(
    base=R('#6c6560', '#524c48', '#3a3532'),
    sec=R('#7d7065', '#5e5449', '#413a32'),
    liquido=R('#f8d24a', '#e8621c', '#a8280c'),
    roca=R('#89817a', '#7a736d', '#5f5a54'),
    madera=R('#a57456', '#7b5740', '#5b3d27'),
    hueso=R('#e8e2cc', '#c8c0a8', '#8f8770'),
    acento=R('#a8e0f0', '#5fb0d8', '#3a7ba8'),
    acento2=R('#d8a0f0', '#a05fd8', '#6b3a9a'),
    acento3=R('#a0f0b8', '#4ac878', '#28804a'),
)

AGUA = R('#5686a8', '#41708f', '#2e5570')
METAL = R('#c2c8d0', '#8a8f96', '#4e535a')

VETAS = {
    'piedra': R('#b8b0a6', '#8d857b', '#5f5a54'),
    'cobre':  R('#e09a5a', '#c1682f', '#8a4420'),
    'hierro': R('#cdd2d8', '#9aa2ac', '#646c76'),
    'carbon': R('#5a5a60', '#3a3a3f', '#1e1e22'),
    'oro':    R('#f6dc7a', '#e0b13a', '#9c7520'),
}

# ── MEDIDAS, TODAS EN CASILLAS DE 32 ──────────────────────────────────────
ALTO_MURO = 5                   # 5 x 32 = 160 px, vez y media el jugador
#
# ERA 3 (96 px) Y SE VEIA BAJO. El personaje mide 102 px en pantalla, asi
# que la pared le llegaba al hombro: parecia un bordillo, no una galeria
# excavada. A 160 px le saca media altura y la mina se lee como un sitio
# cerrado. El mapa coge este numero de la ficha del tileset, asi que basta
# con volver a correr los dos generadores.
ANCHO_MURO = 8                  # el parche: 8 x 32 = 256 px sin repetirse
PARCHE_LAVA = 4                 # 4 x 32 = 128 px de lava sin repetirse
PARCHE_ROCA = 2                 # 2 x 32 = 64 px de lomo sin repetirse


# ===========================================================================
# SUELOS
# ===========================================================================

def suelo(semilla, cols=None, motas=3):
    cols = cols or PAL['base']
    t = Lienzo(T, T)
    relleno(t, cols, semilla, motas=motas, largo=3)
    # A 32 px caben grietas finas de verdad, no un pixel suelto.
    if semilla % 3 == 0:
        gx = 4 + int(ruido(1, 2, semilla) * (T - 10))
        gy = 3 + int(ruido(3, 4, semilla) * (T - 14))
        largo = 6 + int(ruido(5, 6, semilla) * 10)
        for k in range(largo):
            x = gx + int(math.sin(k * 0.55 + semilla) * 2.0)
            y = gy + k
            if 0 <= x < T and y < T:
                t.set(x, y, ajusta(cols[2], dv=0.82))
    return t


def guijarros_sueltos(cols, semilla, n=4):
    """Cascote suelto sobre fondo transparente, para salpicar el suelo."""
    t = Lienzo(T, T)
    for i in range(n):
        cx = 4 + ruido(i * 7 + 1, 3, semilla) * (T - 8)
        cy = 4 + ruido(5, i * 11 + 2, semilla) * (T - 8)
        VOL.guijarro(t, cx, cy, 2.6 + ruido(i, 2, semilla) * 1.8,
                     1.9 + ruido(2, i, semilla) * 1.2, cols)
    return t


def tabla(semilla, cortes=()):
    """
    Tarima de madera: el descansillo de la entrada y las pasarelas.

    A 32 px caben CUATRO tablas de 8 px en lugar de tres de 5, y con eso la
    veta deja de ser una raya suelta.

    SE VEIA COMO UN MURO DE LADRILLO en la version de 16 px, y costo tres
    arreglos entender por que: no eran las juntas, eran las VETAS. Seis rayas
    claras en 16x16 es una marca cada dos pixeles, y esa retahila al tamano al
    que se juega es exactamente el dibujo de las juntas de un ladrillo. Aqui va
    UNA veta por tabla y en un tono a medio camino entre el claro y el medio.
    """
    cl, me, os_ = PAL['madera']
    t = Lienzo(T, T)
    relleno(t, PAL['madera'], semilla, motas=0)

    # DOS tablones de 16, no cuatro de 8: cuatro tablas en una casilla de 32
    # es el dibujo de un suelo de 16 px, que es justo lo que se veia pequeno.
    franjas = [(0, 16), (16, T)]
    for (y0, y1) in franjas[1:]:
        for x in range(T):
            t.set(x, y0 - 1, os_)
            t.set(x, y0, mezcla(os_, me, 0.45))

    veta_col = mezcla(me, cl, 0.5)
    for k, (y0, y1) in enumerate(franjas):
        cx = -1
        if k in cortes:
            cx = 4 + int(ruido(k * 11 + 1, 3, semilla) * (T - 9))
            for y in range(y0, y1 - 1):
                t.set(cx, y, os_)
                t.set(cx + 1, y, cl)
        vy = y0 + 2 + int(ruido(k * 5 + 2, 3, semilla) * max(1, y1 - y0 - 4))
        vx = int(ruido(k * 9 + 4, 7, semilla) * (T - 14))
        for dx in range(20):
            if vx + dx != cx and vy < y1 - 1:
                t.set(vx + dx, vy, veta_col)
    return t


# ===========================================================================
# LA VIA
# ===========================================================================

def via(orientacion, semilla):
    """
    La via de la vagoneta: DOS casillas de galibo = 64 px.

    A 16 px esto eran dos railes dentro de una banda de 32 px: se veia un hilo.
    A 32 px la banda mide 64 px —mas de un ancho de personaje— y caben
    traviesas de 6 px con su canto, railes de 4 px con su brillo y el lastre de
    grava entre ellas.

    OJO AL EJE: en una via HORIZONTAL (railes de este a oeste) el galibo se
    mide EN VERTICAL. La pieza horizontal es de 1 casilla de ancho por 2 de
    alto y se repite a lo largo de la x; la vertical, al reves.
    """
    mad_cl, mad, mad_os = PAL['madera']
    met_cl, met, met_os = METAL
    lastre = [ajusta(c, dv=0.96) for c in PAL['sec']]

    def fondo(li):
        relleno(li, lastre, semilla, motas=0, x1=li.w, y1=li.h)
        for y in range(li.h):
            for x in range(li.w):
                if ruido(x, y, semilla) > 0.86:
                    li.set(x, y, lastre[2])

    if orientacion == 'h':
        W, H = T, 2 * T                      # 32 x 64
        li = Lienzo(W, H)
        fondo(li)
        # Traviesas: perpendiculares a los railes, o sea VERTICALES.
        # Traviesas de 10 px cada 16, no de 6 cada 11. Y el paso DIVIDE los
        # 32 px de la casilla, asi que la via no da un salto al repetirse.
        for tx in range(2, W, 16):
            for y in range(6, H - 6):
                li.set(tx, y, mad_cl)
                for k in range(1, 9):
                    li.set((tx + k) % W, y, mad)
                li.set((tx + 9) % W, y, mad_os)
        # Los dos railes. Galibo 40 px sobre una banda de 64.
        for y in (12, H - 16):
            for x in range(W):
                li.set(x, y - 2, met_os)
                li.set(x, y - 1, met_cl)
                li.set(x, y, met_cl)
                li.set(x, y + 1, met)
                li.set(x, y + 2, met_os)
        return cortar(li, 1, 2)

    W, H = 2 * T, T                          # 64 x 32
    li = Lienzo(W, H)
    fondo(li)
    # Igual que la horizontal: traviesas de 10 px cada 16.
    for ty in range(2, H, 16):
        for x in range(6, W - 6):
            li.set(x, ty, mad_cl)
            for k in range(1, 9):
                li.set(x, (ty + k) % H, mad)
            li.set(x, (ty + 9) % H, mad_os)
    for x in (12, W - 16):
        for y in range(H):
            li.set(x - 2, y, met_os)
            li.set(x - 1, y, met_cl)
            li.set(x, y, met_cl)
            li.set(x + 1, y, met)
            li.set(x + 2, y, met_os)
    return cortar(li, 2, 1)


# ===========================================================================
# LA LAVA
# ===========================================================================

def _hash01(i, j, s):
    h = (int(i) * 374761393 + int(j) * 668265263 + int(s) * 2654435761) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


def _voronoi_periodico(x, y, celda, periodo, s):
    """
    Voronoi que TEJE cada `periodo` px. Devuelve (F1, F2, id de la placa).

    F1 es la distancia a la semilla mas cercana y F2 a la segunda. Donde F2-F1
    es casi cero el pixel esta a la misma distancia de dos semillas, o sea
    JUSTO EN LA JUNTA entre dos placas: eso es la grieta.
    """
    n = max(1, periodo // celda)
    ci, cj = int(math.floor(x / float(celda))), int(math.floor(y / float(celda)))
    f1 = f2 = 1e9
    placa = 0
    for dj in (-1, 0, 1):
        for di in (-1, 0, 1):
            i, j = ci + di, cj + dj
            hx = _hash01(i % n, j % n, s)
            hy = _hash01(i % n, j % n, s + 101)
            sx = (i + 0.15 + 0.70 * hx) * celda
            sy = (j + 0.15 + 0.70 * hy) * celda
            d = math.hypot(x - sx, y - sy)
            if d < f1:
                f2 = f1
                f1 = d
                placa = ((i % n) * 73 + (j % n) * 151) & 0xFFFF
            elif d < f2:
                f2 = d
    return f1, f2, placa


def _campo_grietas(x, y, periodo, fase, s=17):
    """
    Cuanto le falta a este pixel para ser grieta. 0 = esta en la junta.

    TRES INTENTOS ANTES DE ESTE, los tres dibujando MANCHAS donde hacia falta
    una RED: producto de senos (un tablero de topos), suma de cuatro senos (un
    motivo que repetido 500 veces se lee como un sello) y ruido de valor con su
    curva de nivel (goterones, porque la banda sale gorda).

    Una costra rota no es ruido: son PLACAS que se tocan. Por eso es un Voronoi
    y la grieta es F2-F1, la franja donde dos placas se disputan el pixel.
    """
    celda = max(6, periodo // 10)
    if fase:
        x += 2.4 * math.sin(fase * 2 * math.pi)
        y += 2.4 * math.cos(fase * 2 * math.pi)
    f1, f2, _ = _voronoi_periodico(x, y, celda, periodo, s)
    return f2 - f1


def _placa_de(x, y, periodo, s=17):
    celda = max(6, periodo // 10)
    return _voronoi_periodico(x, y, celda, periodo, s)[2]


def _pinta_lava(t, gx0, gy0, periodo, semilla, fase=0.0, brillo=1.0):
    """Pinta un tile leyendo el campo de grietas en coordenadas GLOBALES."""
    cl, me, os_ = PAL['liquido']
    costra_cl = mezcla(os_, A.hex_rgb('#4a2214'), 0.55)
    costra_os = mezcla(os_, A.hex_rgb('#241009'), 0.72)
    for y in range(T):
        for x in range(T):
            gx, gy = gx0 + x, gy0 + y
            v = _campo_grietas(gx, gy, periodo, fase)
            if v < 1.6:
                t.set(x, y, ajusta(cl, dv=brillo))       # el fondo de la grieta
            elif v < 3.6:
                t.set(x, y, ajusta(me, dv=brillo))       # el borde al rojo
            elif v < 6.0:
                t.set(x, y, os_)                         # costra recien cuajada
            else:
                oscura = (_placa_de(gx, gy, periodo) % 3) != 0
                t.set(x, y, costra_os if oscura else costra_cl)
    return t


def lava_tile(semilla, fase=0.0, brillo=1.0):
    return _pinta_lava(Lienzo(T, T), 0, 0, T, semilla, fase, brillo)


def lava_parche(semilla, brillo=1.0):
    """
    Los tiles de un parche de lava de PARCHE_LAVA x PARCHE_LAVA.

    POR QUE NO VALE UN SOLO TILE. Un tile se repite: un lago de 500 casillas
    serian 500 copias del mismo dibujo, y a la vista es una reja de sellos.
    No es que el dibujo sea feo —de cerca esta bien—: es que CUALQUIER dibujo
    con detalle se delata al repetirlo tantas veces.

    La solucion no es dibujar N lavas distintas, que seguirian sin encajar unas
    con otras. Es dibujar UNA lava del tamano del parche y partirla: las
    grietas cruzan de un tile al siguiente porque nunca se interrumpieron.
    """
    p = PARCHE_LAVA * T
    return [[_pinta_lava(Lienzo(T, T), i * T, j * T, p, semilla, 0.0, brillo)
             for i in range(PARCHE_LAVA)] for j in range(PARCHE_LAVA)]


def textura_flujo(w, h, cols, semilla, capas=3, estilo='grietas'):
    """Una textura que TEJE, para el tileSprite que la escena mueve encima."""
    li = Lienzo(w, h)
    cl, me, os_ = cols[0], cols[1], cols[2]
    for y in range(h):
        for x in range(w):
            if estilo == 'grietas':
                v = _campo_grietas(x, y, w, 0.0)
                if v < 1.6:
                    c = cl
                elif v < 3.6:
                    c = me
                elif v < 6.0:
                    c = os_
                else:
                    c = mezcla(os_, A.hex_rgb('#241009'), 0.72)
            else:
                v = 0.0
                for k in range(1, capas + 1):
                    v += math.sin(2 * math.pi * k * x / float(w) + k * 1.7) / k
                    v += math.sin(2 * math.pi * k * y / float(h) + k * 0.9) / k
                v /= (2.0 * capas)
                c = cl if v > 0.42 else me if v > 0.05 else os_
            li.set(x, y, (c[0], c[1], c[2], 255))
    return li


def textura_brillo(w, h, col, semilla):
    """La capa de encima: solo las vetas mas calientes, transparente el resto."""
    li = Lienzo(w, h)
    for y in range(h):
        for x in range(w):
            v = (math.sin(2 * math.pi * 2 * x / float(w) + 0.4) *
                 math.sin(2 * math.pi * 3 * y / float(h) + 2.1))
            if v > 0.62:
                a = int(200 * (v - 0.62) / 0.38)
                li.set(x, y, (col[0], col[1], col[2], min(220, 40 + a)))
            else:
                li.set(x, y, (0, 0, 0, 0))
    return li


def burbujas_lava():
    """Seis fotogramas de 32x32: la burbuja que sube, se hincha y revienta."""
    cl, me, os_ = PAL['liquido']
    tiles = []
    for f in range(6):
        t = Lienzo(T, T)
        if f < 4:
            r = 2.4 + f * 2.2
            cy = 22 - f * 2.4
            m = Mascara(T, T).disco(T * 0.5, cy, r)
            for x, y in m.puntos():
                t.set(x, y, me)
            for x, y in m.borde_interno(False).puntos():
                t.set(x, y, cl if y < cy else os_)
            t.set(int(T * 0.5 - r * 0.4), int(cy - r * 0.5), (255, 255, 230, 230))
        else:
            r = 9.0 + (f - 4) * 4.4
            m = Mascara(T, T).disco(T * 0.5, 14, r)
            m2 = Mascara(T, T).disco(T * 0.5, 14, max(1.0, r - 3.2))
            m = m.restar(m2)
            col = cl if f == 4 else me
            for x, y in m.puntos():
                t.set(x, y, col)
        tiles.append(t)
    return tiles


# ===========================================================================
# EL MURO
# ===========================================================================
#
# EL PERSONAJE MIDE 46 x 102 PX. Esa es la unica vara que importa.
#
# La primera version ponia UN tile de pared: 16 px, la sexta parte de lo que
# mide el jugador. Eso no es una pared, es un bordillo — de ahi el "las paredes
# se ven pegadas al suelo". Despues se apilaron cuatro tiles de 16 (64 px), que
# ya era una pared pero seguia DIBUJADA con detalle de 16.
#
# Ahora son TRES casillas de 32 = 96 px, casi exactamente la altura del
# personaje: le tapa entero menos la cabeza, que es lo que tiene que transmitir
# algo por lo que no se pasa. Y el detalle es de 32: las hiladas tienen canto y
# sombra propia, no dos pixeles.

def _pinta_muro(li, semilla, deco=None):
    """
    Pinta un lienzo de muro de cualquier ancho. Alto = ALTO_MURO * T.

    SE DIBUJA ANCHO Y SE PARTE DESPUES. Si cada columna se dibujara por
    separado, la hilada empezaria de cero cada 32 px y se veria la reja de
    baldosas. Con un trozo de 256 px y `periodo=256`, las hiladas corren de una
    casilla a la siguiente y el dibujo no se repite hasta los 256 px.
    """
    W = li.w
    H = ALTO_MURO * T
    cl, me, os_ = PAL['roca']

    VOL.empedrado(li, 0, 22, W - 1, H - 18, PAL['roca'], semilla,
                  alto=18, ancho=(22, 34), periodo=W)

    # ── TODO LO QUE SE DIBUJE A PARTIR DE AQUI SE PINTA TRES VECES ─────────
    # en su sitio, un ancho a la izquierda y otro a la derecha. `empedrado` ya
    # hace que sus hiladas den la vuelta, pero los cantos gordos y las grietas
    # los dibujo yo, y los que caen junto al borde quedaban CORTADOS: al pegar
    # el parche consigo mismo, media piedra desaparecia y el corte se leia como
    # una costura vertical.
    def tres(fn):
        for desp in (-W, 0, W):
            fn(desp)

    for i in range(max(2, W // 24)):
        bx = ruido(i * 11 + 1, 5, semilla) * W
        by = 40 + ruido(6, i * 7 + 2, semilla) * (H - 80)
        rx = 15.0 + ruido(i, 3, semilla) * 7.0
        ry = 10.4 + ruido(3, i, semilla) * 4.8
        tres(lambda d, bx=bx, by=by, rx=rx, ry=ry:
             VOL.guijarro(li, bx + d, by, rx, ry, PAL['roca']))

    for i in range(max(1, W // 70)):
        gx = ruido(i * 17 + 3, 9, semilla) * W
        y0 = 32 + int(ruido(4, i * 5, semilla) * 36)
        largo = int((H - y0 - 28) * (0.45 + ruido(i, 8, semilla) * 0.5))

        def grieta(d, gx=gx, y0=y0, largo=largo, i=i):
            for k in range(largo):
                y = y0 + k
                x = int(gx + d + math.sin(k * 0.22 + i) * 2.6)
                if 0 <= x < W and y < H:
                    li.set(x, y, ajusta(os_, dv=0.52))
                    if x + 1 < W:
                        li.set(x + 1, y, ajusta(li.get(x + 1, y), dv=1.14))
                    if x - 1 >= 0:
                        li.set(x - 1, y, ajusta(li.get(x - 1, y), dv=0.88))
        tres(grieta)

    # ── OCLUSION ───────────────────────────────────────────────────────────
    # La luz de una cueva entra por arriba: el pie esta mas oscuro que la
    # coronilla. Sin este degradado la pared se ve plana.
    #
    # OJO AL `range(W)`: en la version de 16 px ponia `range(T)`, que es lo que
    # quedo al pasar de dibujar una columna a dibujar el parche entero. Solo el
    # primer tile recibia el degradado y salia un 8 % mas oscuro que los otros:
    # en el mapa se veia una banda vertical cada parche, que parecia una
    # costura del tileset y no lo era.
    for y in range(H):
        f = 1.10 - 0.40 * (y / float(H - 1)) ** 1.25
        for x in range(W):
            c = li.get(x, y)
            if c[3]:
                li.set(x, y, ajusta(c, dv=f))

    # ── EL REMATE ──────────────────────────────────────────────────────────
    lomo = [ajusta(c, dv=0.52) for c in PAL['roca']]
    pf = perfil(semilla + 41, T, 2.0)
    for x in range(W):
        corte = max(8, min(30, 20 + 2 * pf[x % T]))
        for y in range(0, corte):
            li.set(x, y, lomo[1] if ruido(x, y, semilla) > 0.25 else lomo[2])
        li.set(x, corte, ajusta(cl, dv=1.25))
        if corte + 1 < H:
            li.set(x, corte + 1, cl)
        if corte + 2 < H:
            li.set(x, corte + 2, mezcla(cl, me, 0.5))

    # ── EL PIE ─────────────────────────────────────────────────────────────
    for i, y in enumerate(range(H - 18, H)):
        for x in range(W):
            c = li.get(x, y)
            if not c[3]:
                c = me
            li.set(x, y, ajusta(c, dv=0.74 - i * 0.0225))
    for i in range(max(3, W // 9)):
        cx = ruido(i * 9 + 1, 4, semilla) * W
        for desp in (-W, 0, W):
            VOL.guijarro(li, cx + desp, H - 10.0, 8.0, 5.6,
                         [ajusta(k, dv=0.62) for k in PAL['roca'][:3]])

    if deco is not None:
        li.pegar(deco, 0, T)
    return li


def muro_parche(semilla):
    """El tramo corrido: ANCHO_MURO x ALTO_MURO tiles, en [fila][columna]."""
    li = _pinta_muro(Lienzo(ANCHO_MURO * T, ALTO_MURO * T), semilla)
    return [[trozo(li, cx, fy) for cx in range(ANCHO_MURO)]
            for fy in range(ALTO_MURO)]


def muro_extremo(lado, semilla):
    """
    El canto de un muro, donde se acaba y dobla hacia atras.

    Se oscurecen TRES columnas, no se pinta una raya: una raya de un pixel en
    medio de una pared de cantos rodados se ve como un fallo de dibujo.
    """
    li = _pinta_muro(Lienzo(T, ALTO_MURO * T), semilla)
    H = ALTO_MURO * T
    for y in range(H):
        if lado == 'izq':
            li.set(0, y, ajusta(li.get(0, y), dv=0.64))
            li.set(1, y, ajusta(li.get(1, y), dv=0.78))
            li.set(2, y, ajusta(li.get(2, y), dv=0.90))
        else:
            li.set(T - 1, y, ajusta(li.get(T - 1, y), dv=0.64))
            li.set(T - 2, y, ajusta(li.get(T - 2, y), dv=0.78))
            li.set(T - 3, y, ajusta(li.get(T - 3, y), dv=0.90))
    return [trozo(li, 0, fy) for fy in range(ALTO_MURO)]


def roca_parche(semilla):
    """
    El lomo de la roca sin excavar, visto desde arriba: un parche de 2x2.

    TIENE QUE VERSE COMO ROCA, NO COMO SUELO. La primera version lo pintaba con
    la paleta de la pared bajada al 78 %: sobre el papel era mas oscuro, pero
    montado en el mapa NO SE DISTINGUIA del suelo y media caverna parecia
    pisable sin serlo. Ahora va al 52 % y ademas con otra TEXTURA —bultos
    gordos en vez de motas—, que son dos senales en vez de una.
    """
    cols = [ajusta(c, dv=0.52) for c in PAL['roca']]
    W = H = PARCHE_ROCA * T
    li = Lienzo(W, H)
    relleno(li, cols, semilla, motas=0, x1=W, y1=H)
    for i in range(10):
        bx = ruido(i * 5 + 1, 3, semilla) * W
        by = ruido(3, i * 7 + 2, semilla) * H
        rx = 5.0 + ruido(i, 2, semilla) * 3.0
        ry = 3.6 + ruido(2, i, semilla) * 2.0
        for dx in (-W, 0, W):
            for dy in (-H, 0, H):
                VOL.guijarro(li, bx + dx, by + dy, rx, ry, cols)
    return cortar(li, PARCHE_ROCA, PARCHE_ROCA)


def roca_canto(lado, base, semilla):
    """
    El canto del lomo donde toca el hueco por el norte o por los lados.

    La cara del muro solo se ve por el SUR, que es hacia donde mira la camara.
    Por los otros tres lados, sin nada, el lomo y el suelo se juntan sin linea
    y el mapa se ve plano. Esto pone el filo: claro arriba, sombra por dentro.
    """
    t = Lienzo(T, T)
    t.pegar(base)
    cl = ajusta(PAL['roca'][0], dv=1.12)
    pf = perfil(semilla, T, 1.6)
    if lado == 'N':
        for x in range(T):
            h = max(0, 2 + pf[x])
            for y in range(h):
                t.set(x, y, cl if y < 2 else PAL['roca'][1])
            for y in range(h, h + 3):
                if y < T:
                    t.set(x, y, ajusta(t.get(x, y), dv=0.78))
    elif lado == 'O':
        for y in range(T):
            w = max(0, 2 + pf[y])
            for x in range(w):
                t.set(x, y, cl if x < 2 else PAL['roca'][1])
            for x in range(w, w + 3):
                if x < T:
                    t.set(x, y, ajusta(t.get(x, y), dv=0.80))
    else:
        for y in range(T):
            w = max(0, 2 + pf[y])
            for x in range(T - w, T):
                t.set(x, y, cl if x > T - 3 else PAL['roca'][1])
            for x in range(max(0, T - w - 3), T - w):
                if 0 <= x < T:
                    t.set(x, y, ajusta(t.get(x, y), dv=0.80))
    return t


# ===========================================================================
# LA SOMBRA DEL MURO
# ===========================================================================

def sombra_muro(lado, semilla):
    """
    La sombra que el muro echa sobre el suelo.

    LAS DE LA VERSION ANTERIOR ESTABAN MAL, por tres motivos a la vez: caian
    rectas hacia abajo, con el mismo alfa en todo el ancho y con el borde
    cortado en seco. Una sombra no hace ninguna de las tres cosas.

    En este juego el sol esta ARRIBA A LA IZQUIERDA —es de donde vienen las
    luces de todo el arte, y es lo que da por hecho `gf-sombras.js`— asi que la
    sombra de una pared cae hacia ABAJO Y A LA DERECHA, se va desvaneciendo, y
    su borde sigue el mismo perfil ondulado que el pie de la piedra.

    El SESGO es lo que la convierte de banda en proyeccion: cada fila que baja,
    la sombra se corre un poco a la derecha.
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
        # Pared a la izquierda: la sombra cae hacia la derecha.
        for y in range(T):
            largo = max(1, 9 + pf[y % T])
            for x in range(largo):
                a = int(125 * (1.0 - x / float(largo)) ** 0.8)
                if a > 4:
                    c = t.get(x, y)
                    t.set(x, y, (12, 10, 14, max(c[3], a)))

    if lado in ('E', 'NE'):
        # Pared a la derecha: esta a contraluz, asi que casi no proyecta.
        # Solo la linea de contacto. Poner aqui la misma sombra que a la
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
# VETAS
# ===========================================================================

def veta(mineral, semilla, sobre=None):
    """
    Una veta de mineral incrustada en la roca.

    No es un monton de puntos sueltos: son cinco nodulos alargados siguiendo
    una diagonal, que es como se ve una veta de verdad y como estan dibujadas
    las rocas de Game/Objetos. A 32 px cada nodulo tiene su brillo y su sombra.
    """
    cols = VETAS[mineral]
    t = Lienzo(T, T)
    if sobre is not None:
        t.pegar(sobre)
    else:
        relleno(t, PAL['roca'], semilla, motas=3)
    ang = -0.9 + ruido(1, 2, semilla) * 1.8
    cx, cy = T * 0.5, T * 0.5
    for i in range(5):
        d = (i - 2.0) * 6.2
        nx = cx + math.cos(ang) * d
        ny = cy + math.sin(ang) * d
        rx = 3.2 + ruido(i * 7, 3, semilla) * 2.2
        ry = 2.4 + ruido(3, i * 5, semilla) * 1.8
        m = Mascara(T, T).elipse(nx, ny, rx, ry)
        for x, y in m.puntos():
            t.set(x, y, cols[1])
        for x, y in m.borde_interno(False).puntos():
            t.set(x, y, cols[2] if y > ny else cols[0])
        t.set(int(nx - rx * .35), int(ny - ry * .45), cols[0])
        t.set(int(nx - rx * .35) + 1, int(ny - ry * .45), ajusta(cols[0], dv=1.2))
    return t


# ===========================================================================
# PIEZAS GRANDES
# ===========================================================================
#
# En el mapa de FUERA, medido en mapa_principal.json, una piedra normal ocupa
# 74x60 px y un arbol 192x256 — entre uno y cuatro veces el personaje. Ese es
# el tamano al que esta acostumbrado el ojo aqui. Con casillas de 32, una pieza
# de 2x2 son 64x64 y una de 3x3, 96x96.
#
# NINGUNA lleva sombra pintada: se la pone gf-sombras.js en el juego.

def pena(ancho, alto, semilla, cols=None):
    """Un pedrusco de `ancho` x `alto` casillas."""
    cols = cols or PAL['roca']
    W, H = ancho * T, alto * T
    li = Lienzo(W, H)
    cx, cy = W * 0.5, H * 0.56
    rx, ry = W * 0.45, H * 0.42
    m, discos = VOL.lobulos(W, H, cx, cy, rx, ry, 6, semilla, achata=0.92)
    VOL.lobulos_sombreados(li, m, discos, cols, semilla)
    li.contornear(m, ajusta(cols[2], dv=0.58))
    # Alguna veta a la vista, que para eso es una mina.
    if semilla % 3 == 0:
        mineral = list(VETAS)[semilla % len(VETAS)]
        vc = VETAS[mineral]
        for i in range(4):
            vx = cx + (i - 1.5) * 5.0
            vy = cy + math.sin(i * 1.3 + semilla) * 6.0
            if m.get(int(vx), int(vy)):
                VOL.guijarro(li, vx, vy, 2.6, 1.9, vc)
    return li


def cristal_racimo(col, semilla, ancho=2, alto=3):
    """Un racimo de cristales de varios tamanos, con arista y destello."""
    W, H = ancho * T, alto * T
    li = Lienzo(W, H)
    base_y = H - 4
    puntas = []
    for i in range(7):
        px = 7 + ruido(i * 7 + 1, 2, semilla) * (W - 14)
        altura = H * (0.30 + ruido(3, i * 5, semilla) * 0.62)
        grueso = 3.2 + ruido(i * 3, 9, semilla) * 5.0
        puntas.append((px, altura, grueso))
    puntas.sort(key=lambda p: -p[1])
    for (px, altura, grueso) in puntas:
        cima = base_y - altura
        for y in range(int(cima), base_y):
            f = (y - cima) / float(max(1.0, altura))
            w = max(1, int(grueso * (0.22 + 0.78 * f)))
            for x in range(int(px - w), int(px + w + 1)):
                if 0 <= x < W:
                    lado = (x - (px - w)) / float(max(1, 2 * w))
                    li.set(x, y, col[0] if lado < 0.26 else
                                 (col[1] if lado < 0.72 else col[2]))
        for y in range(int(cima), base_y):
            if 0 <= int(px - 1) < W:
                li.set(int(px - 1), y, ajusta(col[0], dv=1.2))
        if 0 <= int(px) < W and int(cima) + 4 < H:
            li.set(int(px), int(cima) + 3, (255, 255, 255, 225))
            li.set(int(px) + 1, int(cima) + 4, (255, 255, 255, 150))
    return li


def vagoneta(semilla):
    """Una vagoneta de mineral: 2x2 casillas = 64x64."""
    W, H = 2 * T, 2 * T
    li = Lienzo(W, H)
    mad_cl, mad, mad_os = PAL['madera']
    met_cl, met, met_os = METAL
    x0, x1 = 6, W - 7
    y0, y1 = 12, H - 18
    for y in range(y0, y1):
        for x in range(x0, x1):
            li.set(x, y, mad if (y - y0) % 9 else mad_os)
    for x in range(x0, x1):
        li.set(x, y0, mad_cl)
        li.set(x, y0 + 1, mezcla(mad_cl, mad, 0.5))
        li.set(x, y1 - 1, mad_os)
    for y in range(y0, y1):
        li.set(x0, y, mad_os)
        li.set(x0 + 1, y, mad_cl)
        li.set(x1 - 1, y, mad_os)
    for x in (x0 + 6, x1 - 7):
        for y in range(y0, y1):
            li.set(x, y, met)
            li.set(x + 1, y, met_os)
    for i in range(14):
        gx = x0 + 5 + ruido(i * 5 + 1, 3, semilla) * (x1 - x0 - 11)
        gy = y0 + 2 + ruido(2, i * 7, semilla) * 7
        VOL.guijarro(li, gx, gy, 3.4, 2.4, VETAS['carbon'])
    for wx in (x0 + 8, x1 - 9):
        cyr = y1 + 4
        m = Mascara(W, H).disco(wx, cyr, 5.2)
        for x, y in m.puntos():
            li.set(x, y, met_os if (x - wx) > 0 else met)
        for x, y in m.borde_interno(False).puntos():
            li.set(x, y, met_os)
        li.set(int(wx - 2), int(cyr - 2), met_cl)
    return li


def puntal(semilla):
    """El arco de madera que apuntala una galeria: 3x2 casillas = 96x64."""
    W, H = 3 * T, 2 * T
    li = Lienzo(W, H)
    cl, me, os_ = PAL['madera']
    met = METAL[1]
    for y in range(4, 20):
        for x in range(4, W - 4):
            li.set(x, y, me)
    for x in range(4, W - 4):
        li.set(x, 4, cl)
        li.set(x, 5, mezcla(cl, me, 0.5))
        li.set(x, 19, os_)
    for px in (10, W - 22):
        for y in range(19, H - 3):
            for x in range(px, px + 12):
                li.set(x, y, me)
            li.set(px, y, cl)
            li.set(px + 1, y, mezcla(cl, me, 0.5))
            li.set(px + 11, y, os_)
        for y in (28, H - 14):
            for x in range(px - 2, px + 14):
                if 0 <= x < W:
                    li.set(x, y, met)
                    li.set(x, y + 1, ajusta(met, dv=0.7))
    for i in range(12):
        for k in range(3):
            if 22 + i < W:
                li.set(22 + i, 20 + i + k, os_)
            if W - 23 - i >= 0:
                li.set(W - 23 - i, 20 + i + k, os_)
    for i in range(7):
        vx = 6 + int(ruido(i * 3, 2, semilla) * (W - 20))
        vy = 7 + int(ruido(2, i * 5, semilla) * 10)
        for dx in range(8):
            li.set(vx + dx, vy, mezcla(me, cl, 0.45))
    return li


def monton_mineral(mineral, semilla):
    """Un monton de mineral picado, 2x2 casillas."""
    cols = VETAS[mineral]
    W, H = 2 * T, 2 * T
    li = Lienzo(W, H)
    for i in range(22):
        gx = 9 + ruido(i * 7 + 1, 2, semilla) * (W - 18)
        gy = H - 9 - ruido(3, i * 5, semilla) * (H * 0.46)
        VOL.guijarro(li, gx, gy, 3.6, 2.6, cols)
    return li


def estalagmita(semilla, ancho=2, alto=3):
    """Una estalagmita: conos de roca con su bandeado de caliza."""
    W, H = ancho * T, alto * T
    li = Lienzo(W, H)
    cl, me, os_ = PAL['roca']
    base_y = H - 3
    for j in range(3):
        px = W * (0.30 + 0.20 * j) + ruido(j, 1, semilla) * 6
        altura = H * (0.45 + ruido(j * 3, 2, semilla) * 0.5)
        grueso = 6.0 + ruido(j, 5, semilla) * 4.0
        cima = base_y - altura
        for y in range(int(cima), base_y):
            f = (y - cima) / float(max(1.0, altura))
            w = max(1, int(grueso * (0.12 + 0.88 * f * f)))
            for x in range(int(px - w), int(px + w + 1)):
                if 0 <= x < W:
                    lado = (x - (px - w)) / float(max(1, 2 * w))
                    li.set(x, y, cl if lado < 0.22 else
                                 (me if lado < 0.70 else os_))
        for b in range(int(cima) + 4, base_y, 7):
            f = (b - cima) / float(max(1.0, altura))
            w = max(1, int(grueso * (0.12 + 0.88 * f * f)))
            for x in range(int(px - w), int(px + w + 1)):
                if 0 <= x < W:
                    li.set(x, b, ajusta(li.get(x, b), dv=0.84))
    return li


def antorcha(semilla):
    """Una antorcha de pared: 1x2 casillas (32x64)."""
    W, H = T, 2 * T
    li = Lienzo(W, H)
    cl, me, os_ = PAL['madera']
    met = METAL[1]
    # Soporte de metal
    for y in range(H - 22, H - 10):
        for x in range(13, 19):
            li.set(x, y, met)
        li.set(13, y, METAL[0])
        li.set(18, y, METAL[2])
    # Mango
    for y in range(H - 34, H - 18):
        for x in range(14, 18):
            li.set(x, y, me)
        li.set(14, y, cl)
        li.set(17, y, os_)
    # Llama
    fuego = PAL['liquido']
    for i in range(3):
        r = 6.0 - i * 1.6
        cy = H - 40 - i * 4
        m = Mascara(W, H).elipse(16, cy, r * 0.7, r)
        for x, y in m.puntos():
            li.set(x, y, fuego[2 - i] if i < 3 else fuego[0])
    li.set(16, H - 50, (255, 255, 220, 235))
    return li


# ===========================================================================
# EL TILESET
# ===========================================================================

def construye():
    s = 41
    tiles = []
    fichas = []
    indices = {}
    grandes = {}
    lienzos = {}

    def add(t, nombre, papel):
        tiles.append(t)
        i = len(tiles) - 1
        fichas.append({'i': i, 'nombre': nombre, 'papel': papel})
        indices[nombre] = i
        return i

    def rellenar_fila():
        """Cada seccion empieza en columna 0: la hoja se lee de un vistazo."""
        while len(tiles) % COLS:
            add(None, '_hueco_%d' % len(tiles), 'hueco')

    def sobre(base, deco):
        t = Lienzo(T, T)
        t.pegar(base)
        t.pegar(deco)
        return t

    # --- SUELOS -------------------------------------------------------------
    # POCAS MOTAS. El suelo del juego es un 91 %% de un unico color (medido en
    # tiles.png): lo que no es ese color son marcas DIBUJADAS, no ruido. La
    # primera version a 32 px subio las motas a 1-4 por tile pensando que a mas
    # tamano hacia falta mas detalle, y el resultado fue un suelo sucio, lleno
    # de puntitos claros que a la vista parecen polvo de television. El detalle
    # que cabe a 32 px se aprovecha con UNA grieta bien dibujada, no con mas
    # puntos.
    base4 = []
    for i in range(4):
        t = suelo(s + i * 7, PAL['base'], motas=(0, 1, 2, 1)[i])
        base4.append(t)
        add(t, 'suelo_%d' % (i + 1), 'suelo')
    for i in range(4):
        add(sobre(base4[i], guijarros_sueltos(PAL['roca'], s + 20 + i, 1 + i // 2)),
            'suelo_deco_%d' % (i + 1), 'suelo')

    grava4 = []
    for i in range(4):
        t = suelo(s + 40 + i * 7, PAL['sec'], motas=(1, 2, 3, 2)[i])
        grava4.append(t)
        add(t, 'grava_%d' % (i + 1), 'suelo')
    for i in range(4):
        add(sobre(grava4[i], guijarros_sueltos(PAL['sec'], s + 60 + i, 3)),
            'grava_deco_%d' % (i + 1), 'suelo')
    rellenar_fila()

    # Dos variantes SIN corte y dos con uno: en el mapa las lisas salen mucho
    # mas a menudo, que es lo que hace que la tabla parezca larga.
    for i, cortes in enumerate(((), (), (0,), (2,))):
        add(tabla(s + i, cortes), 'tabla_%d' % (i + 1), 'suelo')
    rellenar_fila()

    # --- TRANSICION grava sobre suelo ---------------------------------------
    for lado in LADOS:
        add(transicion(lado, PAL['base'], PAL['sec'], s + 3, estilo='seco'),
            'trans_grava_%s' % lado, 'transicion')
    rellenar_fila()

    # --- LA VIA (2 casillas de galibo) --------------------------------------
    for k, t in enumerate(via('h', s + 11)):
        add(t, 'via_h_%d' % k, 'camino')
    for k, t in enumerate(via('v', s + 11)):
        add(t, 'via_v_%d' % k, 'camino')
    rellenar_fila()

    # --- TRANSICION lava sobre suelo ----------------------------------------
    #
    # A cada pieza del borde se le da una piel distinta del parche: si las 13
    # llevaran la misma, el contorno del lago se veria repetido.
    parche = lava_parche(s, 0.88)
    for k, lado in enumerate(LADOS):
        piel = parche[k % PARCHE_LAVA][(k // PARCHE_LAVA) % PARCHE_LAVA]
        add(transicion(lado, PAL['base'], PAL['liquido'], s + 5,
                       estilo='ondulado', piel=piel),
            'trans_lava_%s' % lado, 'transicion')
    rellenar_fila()

    # --- LAVA: el parche ----------------------------------------------------
    for j in range(PARCHE_LAVA):
        for i in range(PARCHE_LAVA):
            add(parche[j][i], 'lava_p%d%d' % (i, j), 'lava')
    for i in range(4):
        add(lava_tile(s, i / 4.0), 'lava_anim_%d' % (i + 1), 'lava')
    rellenar_fila()

    # --- AGUA ---------------------------------------------------------------
    for lado in LADOS:
        add(transicion(lado, PAL['base'], AGUA, s + 9, estilo='ondulado'),
            'trans_agua_%s' % lado, 'transicion')
    for nom, dv in (('agua_hondo', 0.82), ('agua_claro', 1.14),
                    ('agua_brillo', 1.0)):
        t = Lienzo(T, T)
        relleno(t, [ajusta(c, dv=dv) for c in AGUA], s + 2, motas=0)
        if nom == 'agua_brillo':
            # El agua no se textura con ruido: se le ponen DESTELLOS, que es
            # lo que hace el juego y lo que se lee como superficie.
            for bx, by, lg in ((5, 9, 11), (18, 20, 8), (9, 25, 6)):
                for x in range(bx, bx + lg):
                    t.set(x, by, ajusta(AGUA[0], dv=1.3))
        add(t, nom, 'agua')
    rellenar_fila()

    # --- EL MURO: 3 casillas de alto (96 px) --------------------------------
    parche_muro = muro_parche(s + 7)
    for fila in range(ALTO_MURO):
        for col in range(ANCHO_MURO):
            add(parche_muro[fila][col], 'muro_%d_%d' % (fila, col), 'muro')
    for lado in ('izq', 'der'):
        for fila, t in enumerate(muro_extremo(lado, s + 7)):
            add(t, 'muro_%s_%d' % (lado, fila), 'muro')
    rellenar_fila()

    # --- LA ROCA SIN EXCAVAR ------------------------------------------------
    roca = roca_parche(s + 13)
    for k, t in enumerate(roca):
        add(t, 'roca_top_%d%d' % (k % PARCHE_ROCA, k // PARCHE_ROCA), 'muro')
    for lado in ('N', 'O', 'E'):
        add(roca_canto(lado, roca[0], s + 21), 'roca_canto_%s' % lado, 'muro')
    # Las sombras que el muro echa sobre el suelo.
    for lado in ('N', 'NO', 'NE', 'O', 'E'):
        add(sombra_muro(lado, s + 29), 'sombra_%s' % lado, 'sombra')
    rellenar_fila()

    # --- VETAS DE MINERAL ---------------------------------------------------
    cara_muro = parche_muro[1][3]
    for m in ('piedra', 'cobre', 'hierro', 'carbon', 'oro'):
        add(veta(m, s + 17, sobre=cara_muro), 'veta_%s' % m, 'veta')
    for m in ('piedra', 'cobre', 'hierro', 'carbon', 'oro'):
        add(veta(m, s + 23, sobre=roca[0]), 'veta_macizo_%s' % m, 'veta')
    rellenar_fila()

    # =======================================================================
    # PIEZAS GRANDES
    # =======================================================================

    def pieza(nombre, lienzo, ancho, alto, alto_2d=True):
        """
        Da de alta una pieza grande.

        Se guarda DOS VECES a proposito: partida en tiles, para poder pintarla
        a mano en Tiled; y entera, para el atlas `piezas.png`, que es de donde
        la saca el juego.

        El juego usa la entera porque las piezas ALTAS tienen que ordenarse con
        el jugador: un racimo de 96 px tiene que taparlo cuando este por
        detras, y eso una capa de tiles no lo puede hacer —una capa se dibuja
        entera por encima o por debajo—. Como sprite, del orden se encarga
        `gf-profundidad.js`, que ademas mide la linea de suelo DE VERDAD (por
        el rectangulo de colision o por los pixeles) en vez de creerse la Y del
        sprite.

        `alto_2d=False` es para lo que se pisa (los montones bajos): eso se
        queda plano en la capa de tiles y no gasta un objeto de dibujo.
        """
        for k, t in enumerate(cortar(lienzo, ancho, alto)):
            add(t, '%s_%d%d' % (nombre, k % ancho, k // ancho), 'grande')
        grandes[nombre] = (ancho, alto)
        lienzos[nombre] = (lienzo, alto_2d)

    pieza('pena_pequena', pena(2, 2, s + 31), 2, 2, alto_2d=False)
    pieza('pena_mediana', pena(2, 2, s + 37), 2, 2)
    pieza('pena_grande', pena(3, 2, s + 41), 3, 2)

    for nombre, col in (('racimo_azul', PAL['acento']),
                        ('racimo_morado', PAL['acento2']),
                        ('racimo_verde', PAL['acento3'])):
        pieza(nombre, cristal_racimo(col, s + 27, 2, 3), 2, 3)

    pieza('vagoneta', vagoneta(s + 43), 2, 2)
    pieza('puntal', puntal(s + 47), 3, 2)
    pieza('antorcha', antorcha(s + 51), 1, 2)

    for m in ('piedra', 'cobre', 'hierro', 'carbon', 'oro'):
        pieza('monton_%s' % m, monton_mineral(m, s + 53), 2, 2, alto_2d=False)

    for i in range(3):
        pieza('estalagmita_g%d' % (i + 1),
              estalagmita(s + 61 + i * 7, 2, 3), 2, 3)

    rellenar_fila()

    return tiles, fichas, indices, grandes, lienzos


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
    tiles, fichas, indices, grandes, lienzos = construye()
    if not os.path.isdir(DESTINO):
        os.makedirs(DESTINO)

    sheet = hoja(tiles, COLS)
    sheet.guardar(os.path.join(DESTINO, 'tileset_mina.png'))
    ref_indice(tiles).guardar(os.path.join(DESTINO, 'ref_mina.png'))

    # ── EL ATLAS DE PIEZAS ─────────────────────────────────────────────────
    # Un solo PNG con todas las piezas grandes y un JSON diciendo donde esta
    # cada una. Phaser lo carga con `load.atlas` y despues se pide cada pieza
    # por su nombre: una textura y una peticion en vez de veinte PNG.
    #
    # El empaquetado es por estantes: se ordenan por altura y se van poniendo
    # en filas. Para veinte piezas pequenas no hace falta nada mejor.
    orden = sorted(lienzos.items(), key=lambda kv: -kv[1][0].h)
    ancho_atlas = 512
    margen = 1
    x = y = fila_alta = 0
    marcos = {}
    for nombre, (li, alto_2d) in orden:
        if x + li.w + margen > ancho_atlas:
            x = 0
            y += fila_alta + margen
            fila_alta = 0
        marcos[nombre] = (x, y, li.w, li.h, alto_2d)
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
            } for nombre, (px, py, pw, ph, _) in marcos.items()
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

    # ── TEXTURAS DEL FLUJO ─────────────────────────────────────────────────
    # El mismo periodo que el parche de tiles: asi la textura que corre por
    # encima esta hecha de placas del MISMO tamano que la costra de debajo.
    p = PARCHE_LAVA * T
    textura_flujo(p, p, PAL['liquido'], 3, estilo='grietas').guardar(
        os.path.join(DESTINO, 'lava_flujo.png'))
    textura_brillo(p, p, PAL['liquido'][0], 3).guardar(
        os.path.join(DESTINO, 'lava_brillo.png'))
    textura_flujo(64, 64, AGUA, 5, estilo='ondas').guardar(
        os.path.join(DESTINO, 'agua_flujo.png'))
    hoja(burbujas_lava(), 6).guardar(
        os.path.join(DESTINO, 'lava_burbuja.png'))

    filas = (len(tiles) + COLS - 1) // COLS
    ficha = {
        'nombre': 'Mina',
        'imagen': 'Game/MAPAS/Mina/tileset_mina.png',
        'tile': T,
        'columnas': COLS,
        'filas': filas,
        'tiles': len(tiles),
        'generado_por': 'tools/generar-mina.py',
        'nota': ('Indices BASE 0, como la hoja de referencia. En un .json de '
                 'Tiled hay que sumarles el firstgid, que para mina.json es 1.'),
        'muro': {
            'alto_tiles': ALTO_MURO,
            'alto_px': ALTO_MURO * T,
            'ancho_tiles': ANCHO_MURO,
            'nota': ('muro_<fila>_<col>: fila 0 es el remate y la ultima el pie '
                     'que toca el suelo. Los extremos son muro_izq/der_<fila>.'),
        },
        'parche_lava': {
            'lado': PARCHE_LAVA,
            'nota': ('La lava se pone con lava_p<i><j>, con i = x mod 4 y '
                     'j = y mod 4: asi las grietas cruzan de casilla a casilla.'),
        },
        'parche_roca': {
            'lado': PARCHE_ROCA,
            'nota': 'roca_top_<i><j>, con i = x mod 2 y j = y mod 2.',
        },
        'piezas_grandes': {
            'atlas': 'Game/MAPAS/Mina/piezas.png',
            'nota': ('Cada pieza son varios tiles; sus indices se llaman '
                     '<pieza>_<columna><fila>. Las `alta:true` van como sprite '
                     'para que el jugador pueda pasar por detras.'),
            'medidas': {k: {'ancho': v[0], 'alto': v[1],
                            'px': [v[0] * T, v[1] * T],
                            'alta': bool(lienzos[k][1])}
                        for k, v in grandes.items()},
        },
        'animacion': {
            'texturas': {
                'lava_flujo':   'Game/MAPAS/Mina/lava_flujo.png',
                'lava_brillo':  'Game/MAPAS/Mina/lava_brillo.png',
                'lava_burbuja': 'Game/MAPAS/Mina/lava_burbuja.png',
                'agua_flujo':   'Game/MAPAS/Mina/agua_flujo.png',
            },
            'como': ('La escena pone un tileSprite con lava_flujo sobre el '
                     'interior de cada lago y mueve tilePositionY; encima, '
                     'otro con lava_brillo a otra velocidad.'),
        },
        'indices': indices,
        'tiles_detalle': fichas,
    }
    with io.open(os.path.join(DESTINO, 'tileset_mina.json'), 'w',
                 encoding='utf-8') as fh:
        fh.write(json.dumps(ficha, ensure_ascii=False, indent=1))

    print('tileset_mina.png  %d tiles de %dx%d  %d columnas x %d filas  (%dx%d px)'
          % (len(tiles), T, T, COLS, filas, sheet.w, sheet.h))
    print('  muro: %d casillas = %d px (el personaje mide 102)'
          % (ALTO_MURO, ALTO_MURO * T))
    print('piezas.png        %d piezas (%d altas, en 2.5D)  %dx%d px'
          % (len(marcos), sum(1 for m in marcos.values() if m[4]),
             ancho_atlas, alto_atlas))
    print('escrito en', DESTINO)


if __name__ == '__main__':
    main()
