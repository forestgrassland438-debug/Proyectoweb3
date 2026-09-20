#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
MINA — el mapa de Tiled
=============================================================================

QUE ESCRIBE
---------------------------------------------------------------------------
    Maps/mina.json          el mapa, formato Tiled 1.11 (el mismo que usa
                            mapa_principal.json)
    Maps/mina_vista.png     una vista completa del mapa en pequeno, para
                            mirarla sin abrir Tiled

MISMAS MEDIDAS QUE EL MAPA DE FUERA
---------------------------------------------------------------------------
313 x 313 tiles de 16 px = 5008 x 5008 px, exactamente como
`Maps/mapa_principal.json`. Asi la camara, el zoom y los limites del mundo se
comportan igual en los dos sitios y no hay que tocar nada de la camara.

EL TILESET VA EMBEBIDO, NO EN UN .tsx
---------------------------------------------------------------------------
`mapa_principal.json` referencia 40 tilesets externos con rutas como
`../../../../mapaffff/mapaffff/pozo.tsx`, que apuntan fuera del proyecto y no
existen: al abrirlo, Tiled pide localizar cada uno. Este mapa NO repite ese
error. Lleva UN solo tileset y va embebido dentro del propio .json, con la
imagen en una ruta relativa que si existe:

    ../Game/MAPAS/Mina/tileset_mina.png

Asi el mapa se abre en Tiled de doble clic, sin preguntar nada.

POR QUE LAS COLISIONES SE FUSIONAN
---------------------------------------------------------------------------
De los 97.969 tiles del mapa, la mayoria son roca. Un rectangulo de colision
por tile serian decenas de miles de rectangulos, y GameScene los recorre (con
su rejilla espacial, pero aun asi) para el jugador y para la mascota varias
veces por fotograma. El mapa de fuera tiene 324 y va justo.

Asi que la roca se descompone en los rectangulos MAXIMOS que la cubren, con el
algoritmo clasico de barrido: por cada fila se buscan las tiradas horizontales
y cada tirada se estira hacia abajo mientras las filas de debajo sean iguales.
Baja de decenas de miles a unos cientos sin perder un solo pixel de colision.

LA LAVA TAMBIEN FRENA
---------------------------------------------------------------------------
Los lagos entran en la capa de colision ademas de en `area_lava`. Si no, se
puede cruzar la lava andando y el lago pasa de ser un obstaculo a ser una
alfombra naranja.
"""

import io
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO_MAPA = os.path.join(RAIZ, 'Maps', 'mina.json')
FICHA_TILESET = os.path.join(RAIZ, 'Game', 'MAPAS', 'Mina', 'tileset_mina.json')

# ── LAS MEDIDAS ───────────────────────────────────────────────────────────
#
# CASILLAS DE 32, NO DE 16.
#
# El personaje mide 46 x 102 px en pantalla. Con casillas de 16 ocupaba 2,9 x
# 6,4 casillas, asi que todo lo que cupiera en una casilla salia a la sexta
# parte de su altura: los railes eran hilos y las paredes bordillos. A 32 el
# jugador ocupa 1,4 x 3,2 casillas, que es la proporcion normal en una vista
# cenital de este estilo.
#
# El MUNDO no crece: 157 x 157 casillas de 32 px son 5024 px, practicamente
# los 5008 de `mapa_principal.json`. Lo que crece es la casilla. Agrandar el
# mundo no habria servido de nada, porque el personaje crece con el.
#
# De paso, el mapa pasa de 97.969 casillas a 24.649: cuatro veces menos datos
# que recorrer y que guardar.
W = H = 157                    # 157 x 32 = 5024 px, como mapa_principal
TILE = 32
PX = W * TILE                  # 5024

# Lo que hay en cada casilla mientras se construye.
ROCA, SUELO, GRAVA, TABLA, LAVA, AGUA, CARRIL = range(7)


# ===========================================================================
# RUIDO DETERMINISTA
# ===========================================================================
#
# Nada de `random`: el mapa tiene que salir IGUAL cada vez que se corre el
# script, o cada ejecucion produce un mapa distinto y el juego deja de
# coincidir con las colisiones que se subieron.

def ruido(x, y, s):
    h = (int(x) * 73856093) ^ (int(y) * 19349663) ^ (int(s) * 83492791)
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


def onda(t, s, amp, per):
    """Una ondulacion suave para que ningun borde sea una recta ni un circulo."""
    return (math.sin(t / per + s) * amp +
            math.sin(t / (per * 0.43) + s * 2.1) * amp * 0.45)


def contorno(ang, s):
    """
    Cuanto se aparta del circulo el borde de una sala, segun el angulo.

    LA PRIMERA VERSION SALIA CON FORMA DE FLOR. Usaba `onda(ang * 9, ...)`, o
    sea una decena de lobulos TODOS DEL MISMO TAMANO y repartidos a la misma
    distancia: el ojo lo lee como un petalo repetido, no como una cueva.

    Una caverna de verdad tiene dos o tres bultos grandes y desiguales, y sobre
    ellos el desconchado pequeno. Eso son tres armonicos con frecuencias que no
    son multiplos enteros unas de otras (3, 5 y 8 estan bien: 3 y 5 son primos
    entre si, asi que el dibujo no se repite al dar la vuelta) y con la
    amplitud cayendo deprisa.
    """
    return (0.20 * math.sin(3.0 * ang + s * 0.7) +
            0.11 * math.sin(5.0 * ang - s * 1.3) +
            0.05 * math.sin(8.0 * ang + s * 2.1))


# ===========================================================================
# EL PLANO DE LA MINA
# ===========================================================================
#
# Las salas y las galerias estan puestas a mano: una mina generada al azar sale
# con salas que no llevan a ningun sitio y callejones sin salida. Cada sala
# tiene su TEMA, que decide de que es la veta de sus paredes y que se
# desperdiga por el suelo.
#
#   (x, y)  centro en tiles      (rx, ry)  radios en tiles

# Las coordenadas estan en CASILLAS DE 32. Son las mismas posiciones de antes
# divididas entre dos: el plano de la mina no ha cambiado, solo la unidad.
SALAS = [
    # nombre           x    y    rx   ry   tema        suelo
    ('entrada',        78,  16,  19,  11, 'madera',   SUELO),
    ('cruce_norte',    78,  42,  15,  10, 'piedra',   SUELO),
    ('piedra_oeste',   29,  49,  20,  15, 'piedra',   SUELO),
    ('cobre_este',    126,  49,  20,  15, 'cobre',    SUELO),
    ('cristales',      78,  76,  21,  16, 'cristal',  SUELO),
    ('hierro_oeste',   28, 100,  19,  15, 'hierro',   SUELO),
    ('carbon_este',   127, 100,  19,  15, 'carbon',   SUELO),
    ('cruce_sur',      78, 112,  14,   9, 'piedra',   GRAVA),
    ('profundidades',  78, 136,  46,  17, 'oro',      SUELO),
]

# Galerias: de sala a sala, con el ancho a medio camino. La lista de puntos
# hace que la galeria doble en vez de ir en linea recta.
#
# LOS ANCHOS SE DOBLARON. EL PERSONAJE MIDE 46 PX DE ANCHO (23 de sprite a
# escala 2), o sea 2,9 casillas. Las galerias eran de 5 a 8 casillas —de 80 a
# 128 px—, asi que el jugador ocupaba mas de la mitad del tunel a lo ancho y el
# mapa se sentia una maqueta. Ahora van de 11 a 18 casillas (176 a 288 px): de
# cuatro a seis anchos de personaje, que es donde deja de sentirse apretado.
# Mismo criterio que el mapa de fuera, donde un camino da de sobra para cruzarse
# con un NPC.
# Los anchos, tambien en casillas de 32: de 6 a 9 casillas = de 192 a 288 px,
# o sea de cuatro a seis anchos de personaje. Es donde una galeria deja de
# sentirse apretada sin convertirse en una explanada.
GALERIAS = [
    (['entrada', 'cruce_norte'], 8, True),          # True = lleva railes
    (['cruce_norte', 'piedra_oeste'], 6, True),
    (['cruce_norte', 'cobre_este'], 6, True),
    (['cruce_norte', 'cristales'], 7, True),
    (['piedra_oeste', 'hierro_oeste'], 6, False),
    (['cobre_este', 'carbon_este'], 6, False),
    (['cristales', 'cruce_sur'], 7, True),
    (['hierro_oeste', 'cruce_sur'], 6, False),
    (['carbon_este', 'cruce_sur'], 6, False),
    (['cruce_sur', 'profundidades'], 9, True),
]

# Los lagos de lava de las profundidades. Se restan de la sala, y quedan
# pasarelas de roca entre ellos.
LAGOS_LAVA = [
    (54, 134, 13, 9),
    (85, 131, 15,  8),
    (116, 140, 12, 7),
    (70, 148, 11,  5),
]

# Las charcas de la sala de cristales.
CHARCAS = [
    (70, 79, 7, 5),
    (88, 73, 5, 4),
]

# La tarima de la entrada: el descansillo de madera donde se aparece.
TARIMAS = [
    (78, 13, 9, 5),
]

# Pasarelas de tablones sobre la lava. Van DESPUES de los lagos, asi que
# convierten la lava en madera: son el unico camino para cruzar al otro lado,
# porque la lava esta en la capa de colision.
PASARELAS = [
    (69, 130, 103, 133),
    (40, 132,  69, 135),
    (102, 138, 130, 141),
    (65, 146,  88, 149),
]


def ruta(a, b):
    """
    El trazado de una galeria: tramos RECTOS con esquinas, no una curva.

    LA VERSION ANTERIOR USABA UNA BEZIER CON ONDULACION. Para el hueco de la
    galeria quedaba bien —una cueva no tiene por que ser recta—, pero la VIA
    iba por encima de esa misma curva, y una via de dos casillas trazada sobre
    una curva sale a peldanos: cada paso cambia de horizontal a vertical y el
    resultado en pantalla es un monton de trozos de via cruzados, no una linea.
    Parecia chatarra amontonada.

    Una galeria de mina se excava recta y dobla en angulo, que es ademas lo
    unico por lo que puede circular una vagoneta. Asi que la ruta es una Z:
    se baja, se cruza y se vuelve a bajar. La irregularidad del hueco la pone
    el radio variable al excavar, no el trazado.
    """
    ax, ay = _pos(a)
    bx, by = _pos(b)
    puntos = []

    def recta(x0, y0, x1, y1):
        n = max(abs(x1 - x0), abs(y1 - y0))
        for i in range(n + 1):
            t = i / float(max(1, n))
            puntos.append((int(round(x0 + (x1 - x0) * t)),
                           int(round(y0 + (y1 - y0) * t))))

    if abs(by - ay) >= abs(bx - ax):
        # Domina la vertical: baja, cruza, baja.
        my = (ay + by) // 2
        recta(ax, ay, ax, my)
        recta(ax, my, bx, my)
        recta(bx, my, bx, by)
    else:
        # Domina la horizontal: cruza, baja, cruza.
        mx = (ax + bx) // 2
        recta(ax, ay, mx, ay)
        recta(mx, ay, mx, by)
        recta(mx, by, bx, by)

    # Quitar repetidos consecutivos.
    limpio = []
    for p in puntos:
        if not limpio or limpio[-1] != p:
            limpio.append(p)
    return limpio


def _pos(nombre):
    for s in SALAS:
        if s[0] == nombre:
            return s[1], s[2]
    raise KeyError(nombre)


# ===========================================================================
# EXCAVAR
# ===========================================================================

def excavar():
    """Devuelve la rejilla de materiales y el diccionario de zonas por sala."""
    g = [[ROCA] * W for _ in range(H)]
    zonas = {}

    def elipse(cx, cy, rx, ry, material, s, rugosa=True, solo_roca=False,
               solo_suelo=False):
        """
        `solo_roca` es lo que hace que las galerias no se coman el suelo de las
        salas. Sin el, la galeria que sale de la entrada volvia a poner suelo
        de piedra encima de la tarima de madera y partia la sala en dos con una
        franja gris — se veia clarisimo en la primera vista del mapa.

        `solo_suelo` es el contrario: pinta solo donde YA hay hueco. Lo usan la
        tarima y las pasarelas, que no deben excavar roca nueva.
        """
        puestos = []
        x0, x1 = max(0, int(cx - rx - 4)), min(W, int(cx + rx + 5))
        y0, y1 = max(0, int(cy - ry - 4)), min(H, int(cy + ry + 5))
        for y in range(y0, y1):
            for x in range(x0, x1):
                if solo_roca and g[y][x] != ROCA:
                    continue
                if solo_suelo and g[y][x] == ROCA:
                    continue
                dx, dy = x - cx, y - cy
                ang = math.atan2(dy, dx)
                # El radio varia con el angulo: una sala redonda perfecta se ve
                # artificial, y ademas las paredes salen todas iguales.
                wob = contorno(ang, s) if rugosa else 0.0
                if (dx / (rx * (1 + wob))) ** 2 + (dy / (ry * (1 + wob))) ** 2 <= 1.0:
                    g[y][x] = material
                    puestos.append((x, y))
        return puestos

    def galeria(a, b, ancho, s):
        """Excava el hueco a lo largo de la ruta, con el radio variando un poco."""
        pts = ruta(a, b)
        for i, (x, y) in enumerate(pts):
            r = ancho * 0.5 + onda(i, s + 9, ancho * 0.12, 9.0)
            elipse(x, y, r, r, SUELO, s + i, rugosa=False, solo_roca=True)

    # 1. Las salas
    for nombre, cx, cy, rx, ry, tema, suelo in SALAS:
        s = sum(ord(c) for c in nombre)
        zonas[nombre] = dict(tema=tema, centro=(cx, cy), radios=(rx, ry),
                             celdas=elipse(cx, cy, rx, ry, suelo, s))

    # 2. Las galerias (despues de las salas: el suelo de galeria no debe
    #    pisar la tarima de la entrada ni la grava del cruce sur)
    carriles = []
    for camino, ancho, con_rail in GALERIAS:
        for a, b in zip(camino, camino[1:]):
            s = sum(ord(c) for c in a + b)
            galeria(a, b, ancho, s)
            if con_rail:
                carriles.append((a, b, s))

    # 3. Los lagos de lava, dentro de las profundidades
    for i, (cx, cy, rx, ry) in enumerate(LAGOS_LAVA):
        elipse(cx, cy, rx, ry, LAVA, 700 + i * 13)

    # 4. Las charcas de la sala de cristales
    for i, (cx, cy, rx, ry) in enumerate(CHARCAS):
        elipse(cx, cy, rx, ry, AGUA, 800 + i * 7)

    # 4b. La tarima de la entrada y las pasarelas sobre la lava. Van las
    #     ultimas: la tarima tapa el suelo de piedra y las pasarelas tapan la
    #     lava, que es justo lo que las hace cruzables.
    for i, (cx, cy, rx, ry) in enumerate(TARIMAS):
        elipse(cx, cy, rx, ry, TABLA, 900 + i, rugosa=False, solo_suelo=True)
    for (x0, y0, x1, y1) in PASARELAS:
        for y in range(max(0, y0), min(H, y1)):
            for x in range(max(0, x0), min(W, x1)):
                if g[y][x] != ROCA:
                    g[y][x] = TABLA

    # 4c. SELLAR LAS BOLSAS.
    #
    #     Al restar los lagos de lava de la sala de las profundidades quedan
    #     lenguas de suelo rodeadas de lava por todos lados. Son huecos a los
    #     que no se puede llegar andando: no dan ningun error, se ven bien en
    #     el mapa, y encima el repartidor de minerales les pone vetas — vetas
    #     que nadie podra picar nunca porque no hay camino hasta ellas.
    #
    #     (Esto salio de tools/mina-prueba.js: 70 casillas y 3 puntos de
    #     mineral aislados. A ojo, mirando el mapa, no se ve.)
    #
    #     Se inunda desde donde aparece el jugador por las casillas que el
    #     juego deja pisar y lo que no se alcanza se devuelve a roca.
    ax, ay = _pos('entrada')
    inicio = (ax, ay - 5)
    pisable = lambda x, y: g[y][x] not in (ROCA, LAVA)
    visto = [[False] * W for _ in range(H)]
    if pisable(*inicio):
        pila = [inicio]
        visto[inicio[1]][inicio[0]] = True
        while pila:
            x, y = pila.pop()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H and not visto[ny][nx] and pisable(nx, ny):
                    visto[ny][nx] = True
                    pila.append((nx, ny))
        selladas = 0
        for y in range(H):
            for x in range(W):
                if pisable(x, y) and not visto[y][x]:
                    g[y][x] = ROCA
                    selladas += 1
        if selladas:
            print('  (selladas %d casillas en bolsas sin salida)' % selladas)

    # 5. Grava en los rincones: donde hay suelo con mucha roca alrededor se
    #    amontona el cascote que cae de las paredes.
    candidatas = []
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            if g[y][x] != SUELO:
                continue
            roca = sum(1 for dy in (-2, -1, 0, 1, 2) for dx in (-2, -1, 0, 1, 2)
                       if g[max(0, min(H - 1, y + dy))][max(0, min(W - 1, x + dx))] == ROCA)
            if roca >= 9 and ruido(x, y, 31) > 0.35:
                candidatas.append((x, y))
    for (x, y) in candidatas:
        g[y][x] = GRAVA

    # Y se quitan las que quedaron SUELTAS. Una casilla de grava aislada no es
    # un monton de cascote: es un cuadrado de otro color en medio del suelo, y
    # se ve como un parche. Hacen falta al menos dos vecinas para que la mancha
    # se lea como un monton.
    sueltas = []
    for (x, y) in candidatas:
        vecinas = sum(1 for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                      if (dx or dy) and g[y + dy][x + dx] == GRAVA)
        if vecinas < 2:
            sueltas.append((x, y))
    for (x, y) in sueltas:
        g[y][x] = SUELO

    return g, zonas, carriles


def poner_carriles(g, carriles):
    """
    Traza la via por el centro de las galerias con rail.

    Devuelve (lista de puntos, dict de via). El dict dice, para cada casilla,
    que mitad de la pieza le toca:  {(x, y): ('h' | 'v', 0 | 1)}

    LA VIA OCUPA DOS CASILLAS DE ANCHO. La version anterior marcaba UNA sola
    casilla y ponia en ella un tile con los dos railes a 6 px: en el mapa no se
    veia una via, se veian hilos sueltos. Ahora la banda mide 32 px, lo mismo
    que la vagoneta que circula por ella.
    """
    puestos = []
    via = {}

    def marca(x, y, orient):
        if orient == 'h':
            celdas = ((x, y, 0), (x, y + 1, 1))
        else:
            celdas = ((x, y, 0), (x + 1, y, 1))
        # Las dos mitades o ninguna: media via es peor que nada.
        for (cx, cy, _) in celdas:
            if not (0 <= cx < W and 0 <= cy < H):
                return False
            if g[cy][cx] not in (SUELO, GRAVA, TABLA, CARRIL):
                return False
        for (cx, cy, k) in celdas:
            g[cy][cx] = CARRIL
            via[(cx, cy)] = (orient, k)
        return True

    for a, b, s in carriles:
        pts = ruta(a, b)
        ant = None
        for (x, y) in pts:
            if ant is None:
                orient = 'v'
            elif x != ant[0]:
                orient = 'h'
            elif y != ant[1]:
                orient = 'v'
            else:
                continue
            if marca(x, y, orient):
                puestos.append((x, y, ant))
            ant = (x, y)

    return puestos, via


# ===========================================================================
# PINTAR: de materiales a indices de tile
# ===========================================================================

def _lado(g, x, y, material):
    """
    Que pieza del juego de 13 le toca a esta casilla.

    Devuelve 'C' si esta rodeada del mismo material, o el lado por donde se
    acaba: 'N' si lo de arriba es otra cosa, 'NO' si son arriba e izquierda, e
    'iNO' si solo se escapa por la esquina. Es el mismo convenio que
    `gf_tiles.mascara_borde`, que es quien dibujo las piezas: alli 'N'
    significa "el material de dentro empieza por debajo del borde de arriba".
    """
    def fuera(dx, dy):
        px, py = x + dx, y + dy
        if not (0 <= px < W and 0 <= py < H):
            return True
        return g[py][px] != material

    n, s_, o, e = fuera(0, -1), fuera(0, 1), fuera(-1, 0), fuera(1, 0)
    if n and o:
        return 'NO'
    if n and e:
        return 'NE'
    if s_ and o:
        return 'SO'
    if s_ and e:
        return 'SE'
    if n:
        return 'N'
    if s_:
        return 'S'
    if o:
        return 'O'
    if e:
        return 'E'
    if fuera(-1, -1):
        return 'iNO'
    if fuera(1, -1):
        return 'iNE'
    if fuera(-1, 1):
        return 'iSO'
    if fuera(1, 1):
        return 'iSE'
    return 'C'

def pintar(g, ix, zonas, parche, ALTO_MURO, parche_muro, parche_roca, via):
    """
    Convierte la rejilla de materiales en la capa de tiles.

    Las paredes se autoentejan con las 9 piezas del acantilado: la fila depende
    de si el hueco esta arriba o abajo de la roca, y la columna de si esta a un
    lado. Es lo mismo que hace el mapa de fuera con sus montanas.
    """
    capa = [0] * (W * H)
    solido = [[g[y][x] == ROCA for x in range(W)] for y in range(H)]

    def es_suelo(x, y):
        if not (0 <= x < W and 0 <= y < H):
            return False
        return not solido[y][x]

    # Que tema tiene cada casilla, para decidir la veta de su pared.
    tema_de = {}
    for nombre, z in zonas.items():
        for (x, y) in z['celdas']:
            tema_de[(x, y)] = z['tema']

    def tema_cerca(x, y):
        for r in (0, 2, 4, 7):
            for dy in range(-r, r + 1):
                for dx in range(-r, r + 1):
                    t = tema_de.get((x + dx, y + dy))
                    if t:
                        return t
        return 'piedra'

    for y in range(H):
        for x in range(W):
            m = g[y][x]
            i = y * W + x

            if m == ROCA:
                # ── EL MURO, AHORA DE CUATRO TILES DE ALTO ─────────────────
                # La fila de muro que le toca a esta casilla depende de CUANTO
                # FALTA HACIA ABAJO hasta el hueco:
                #
                #     d = 1  la casilla toca el suelo  -> el pie del muro
                #     d = 2  una mas arriba            -> cara baja
                #     d = 3                            -> cara alta
                #     d = 4                            -> el remate
                #     d > 4  ya es roca maciza         -> el lomo visto de arriba
                #
                # La version anterior ponia UN solo tile de pared (16 px) y por
                # eso las paredes se veian "pegadas al suelo": median la sexta
                # parte que el personaje, que mide 102 px. Con cuatro filas el
                # muro llega a 64 px y tapa al jugador hasta el pecho.
                d = None
                for k in range(1, ALTO_MURO + 2):
                    if not (0 <= y + k < H):
                        break
                    if g[y + k][x] != ROCA:
                        d = k
                        break
                arriba_hueco = (y == 0) or (g[y - 1][x] != ROCA)

                # EL ORDEN IMPORTA, y estaba al reves. La version anterior
                # miraba primero `arriba_hueco`, asi que una veta de roca de
                # UNA casilla de grosor —que tiene hueco arriba Y abajo— se
                # llevaba el remate: el trozo mas oscuro y plano del muro. En
                # el mapa eso se veia como una pared que de pronto desaparece.
                #
                # Lo que de verdad define una pared es su PIE, que es lo que
                # toca el suelo y lo que el jugador ve de frente. Asi que la
                # distancia hacia abajo manda, y el remate solo entra cuando
                # hay sitio de sobra por encima.
                if d == 1:
                    fila = ALTO_MURO - 1          # el pie
                elif d == 2:
                    fila = ALTO_MURO - 2
                elif d is not None and d <= ALTO_MURO:
                    fila = ALTO_MURO - d
                elif arriba_hueco and d is not None and d <= ALTO_MURO + 1:
                    fila = 0                      # el remate
                else:
                    fila = None

                if fila is None:
                    # Roca sin excavar. De vez en cuando, una veta a la vista.
                    t = tema_cerca(x, y)
                    clave = 'veta_macizo_%s' % t if t in (
                        'piedra', 'cobre', 'hierro', 'carbon', 'oro') else None
                    if clave and clave in ix and ruido(x, y, 77) > 0.976:
                        capa[i] = ix[clave] + 1
                    elif es_suelo(x, y - 1):
                        # Toca el hueco por arriba: se le pone el canto, o el
                        # lomo y el suelo se juntarian sin linea y el mapa se
                        # veria plano (no se ve la cara del muro por el norte).
                        capa[i] = ix['roca_canto_N'] + 1
                    elif es_suelo(x - 1, y):
                        capa[i] = ix['roca_canto_O'] + 1
                    elif es_suelo(x + 1, y):
                        capa[i] = ix['roca_canto_E'] + 1
                    else:
                        capa[i] = ix['roca_top_%d%d' % (x % parche_roca, y % parche_roca)] + 1
                    continue

                # Los cantos: donde el muro se acaba y dobla hacia atras.
                if not (0 <= x - 1 < W) or g[y][x - 1] != ROCA:
                    capa[i] = ix['muro_izq_%d' % fila] + 1
                elif not (0 <= x + 1 < W) or g[y][x + 1] != ROCA:
                    capa[i] = ix['muro_der_%d' % fila] + 1
                else:
                    # La columna sale de la POSICION en el mapa, no de un
                    # sorteo: asi las hiladas del parche de 256 px corren de
                    # una casilla a la siguiente sin cortarse.
                    col = x % parche_muro
                    r = ruido(x, y, 55)
                    t = tema_cerca(x, y)
                    if fila == 1 and r > 0.962 and ('veta_%s' % t) in ix:
                        capa[i] = ix['veta_%s' % t] + 1
                    else:
                        capa[i] = ix['muro_%d_%d' % (fila, col)] + 1

            elif m == LAVA:
                lado = _lado(g, x, y, LAVA)
                if lado == 'C':
                    # El parche: el tile depende de la POSICION, para que las
                    # grietas continuen de una casilla a la de al lado. El lado
                    # del parche lo dice el propio tileset, no se escribe aqui
                    # a mano: cuando paso de 4x4 a 8x8, este codigo no cambio.
                    capa[i] = ix['lava_p%d%d' % (x % parche, y % parche)] + 1
                else:
                    capa[i] = ix['trans_lava_%s' % lado] + 1

            elif m == AGUA:
                lado = _lado(g, x, y, AGUA)
                if lado == 'C':
                    capa[i] = ix['agua_brillo' if ruido(x, y, 93) > 0.88
                                 else 'agua_hondo'] + 1
                else:
                    capa[i] = ix['trans_agua_%s' % lado] + 1

            elif m == TABLA:
                # Pesado hacia las dos variantes lisas (1 y 2): el remate de
                # tabla solo aparece en una casilla de cada ocho.
                r = ruido(x, y, 12)
                n = 3 if r > 0.94 else 4 if r > 0.88 else (1 if r > 0.44 else 2)
                capa[i] = ix['tabla_%d' % n] + 1

            elif m == GRAVA:
                # Con las piezas de borde, no cuadrados recortados: una mancha
                # de grava suelta tiene que fundirse con el suelo, igual que la
                # lava y el agua.
                lado = _lado(g, x, y, GRAVA)
                if lado == 'C':
                    capa[i] = ix['grava_deco_%d' % (1 + int(ruido(x, y, 21) * 4) % 4)
                                 if ruido(x, y, 22) > 0.86
                                 else 'grava_%d' % (1 + int(ruido(x, y, 23) * 4) % 4)] + 1
                else:
                    capa[i] = ix['trans_grava_%s' % lado] + 1

            elif m == CARRIL:
                # La mitad de la pieza que toca la decidio `poner_carriles` al
                # trazar la via: aqui solo se lee. Deducirla mirando los
                # vecinos, como hacia la version anterior, fallaba en las
                # curvas y dejaba medio tramo con la orientacion cambiada.
                orient, k = via.get((x, y), ('h', 0))
                capa[i] = ix['via_%s_%d' % (orient, k)] + 1

            else:   # SUELO
                clave = ('suelo_deco_%d' % (1 + int(ruido(x, y, 31) * 4) % 4)
                         if ruido(x, y, 32) > 0.90
                         else 'suelo_%d' % (1 + int(ruido(x, y, 33) * 4) % 4))
                capa[i] = ix[clave] + 1

    return capa


# ===========================================================================
# LA CAPA DE SOMBRAS
# ===========================================================================

def sombrear(g, ix):
    """
    La sombra que el muro echa sobre el suelo que tiene delante.

    Es la otra mitad del arreglo de "las paredes se ven pegadas al suelo". La
    altura la da el muro de cuatro tiles; lo que SEPARA la pared del suelo a la
    vista es esta mancha oscura a sus pies. Sin ella, por alta que sea la
    pared, el suelo parece subir por ella como un calcomania.

    Va en su propia capa de tiles —encima del suelo, debajo de los cacharros—
    porque los tiles de sombra son semitransparentes y tienen que dejar ver el
    suelo de debajo.
    """
    capa = [0] * (W * H)
    for y in range(H):
        for x in range(W):
            if g[y][x] == ROCA:
                continue
            arriba = y > 0 and g[y - 1][x] == ROCA
            izq = x > 0 and g[y][x - 1] == ROCA
            der = x < W - 1 and g[y][x + 1] == ROCA
            if arriba and izq:
                clave = 'sombra_NO'
            elif arriba and der:
                clave = 'sombra_NE'
            elif arriba:
                clave = 'sombra_N'
            elif izq:
                clave = 'sombra_O'
            elif der:
                clave = 'sombra_E'
            else:
                continue
            if clave in ix:
                capa[y * W + x] = ix[clave] + 1
    return capa


# ===========================================================================
# SEGUNDA CAPA: LOS OBJETOS
# ===========================================================================

def decorar(g, ix, zonas, antorchas, vigas):
    """
    La capa `mina_objetos`: lo PLANO que va encima del suelo.

    QUE QUEDA AQUI Y QUE NO, DESPUES DE PASAR A 32 PX.
    ------------------------------------------------------------------------
    Cuando el tileset era de 16 px, aqui se ponian los cacharros sueltos:
    antorchas, puntales, estalagmitas, cristales, calaveras. Eran tiles de
    16x16 — la sexta parte de la altura del personaje— asi que no tapaban a
    nadie y daba igual que fueran tiles.

    A 32 px esas mismas cosas se han convertido en PIEZAS de 64x96, y una
    pieza de 96 px de alto SI tapa al jugador. Eso una capa de tiles no lo
    puede hacer: una capa se dibuja entera por encima o por debajo. Asi que
    todas se han ido a `poner_piezas_grandes`, que las saca como objetos para
    que la escena las ponga de sprite y `gf-profundidad.js` las ordene.

    Lo que queda en esta capa es solo lo que se PISA y por tanto nunca tiene
    que taparte: los montones de mineral bajos. La variedad del suelo ya la
    pone `pintar` con los tiles `suelo_deco_*` y `grava_deco_*`.
    """
    capa = [0] * (W * H)

    def poner(x, y, nombre):
        if 0 <= x < W and 0 <= y < H and nombre in ix:
            capa[y * W + x] = ix[nombre] + 1

    # Cascote suelto pegado a las paredes: es plano, se pisa.
    for nombre, z in sorted(zonas.items()):
        for (x, y) in z['celdas']:
            if g[y][x] not in (SUELO, GRAVA):
                continue
            if capa[y * W + x]:
                continue
            if ruido(x, y, 44) < 0.965:
                continue
            pegado = any(
                0 <= x + dx < W and 0 <= y + dy < H and g[y + dy][x + dx] == ROCA
                for dx in (-1, 0, 1) for dy in (-1, 0, 1))
            if not pegado:
                continue
            poner(x, y, 'grava_deco_%d' % (1 + int(ruido(x, y, 45) * 4) % 4))

    return capa


def poner_piezas_grandes(g, ix, ficha, zonas, capa):
    """
    Coloca las piezas de varios tiles: pedruscos, racimos de cristal,
    vagonetas, arcos de apuntalar y montones de mineral.

    POR QUE HAY QUE HACERLO APARTE. Un cacharro de 16x16 se pone en una casilla
    y ya esta. Una pieza de 4x3 ocupa doce, y hay que comprobar que las doce
    estan libres ANTES de escribir ninguna: si se escriben a medida que se
    comprueban, la primera pieza que no quepa deja media vagoneta pintada en la
    pared. Ese "medio objeto" no da ningun error y es dificil de ver en un mapa
    de 98.000 casillas.

    Y todas se apoyan pegadas a la pared o en el borde de la sala, no en mitad
    del paso: un pedrusco de 64 px en medio de una galeria de 176 px la corta.
    """
    medidas = ficha['piezas_grandes']['medidas']

    # Que piezas puede tener cada sala, segun su tema.
    POR_TEMA = {
        'piedra':  ['pena_grande', 'pena_mediana', 'pena_pequena',
                    'monton_piedra', 'estalagmita_g1'],
        'cobre':   ['pena_mediana', 'monton_cobre', 'vagoneta',
                    'estalagmita_g2', 'pena_pequena'],
        'hierro':  ['pena_grande', 'monton_hierro', 'vagoneta',
                    'estalagmita_g3', 'pena_pequena'],
        'carbon':  ['pena_mediana', 'monton_carbon', 'vagoneta',
                    'estalagmita_g1', 'pena_pequena'],
        'oro':     ['pena_grande', 'monton_oro', 'pena_mediana',
                    'estalagmita_g2'],
        'cristal': ['racimo_azul', 'racimo_morado', 'racimo_verde',
                    'pena_pequena', 'estalagmita_g3'],
        'madera':  ['vagoneta', 'pena_pequena', 'monton_piedra'],
    }

    def cabe(x, y, w, h):
        for dy in range(h):
            for dx in range(w):
                px, py = x + dx, y + dy
                if not (0 <= px < W and 0 <= py < H):
                    return False
                if g[py][px] not in (SUELO, GRAVA, TABLA):
                    return False
                if capa[py * W + px]:
                    return False
        return True

    def pared_cerca(x, y, w, h):
        """Pegada a la roca: se mira el anillo de alrededor."""
        for dx in range(-1, w + 1):
            for dy in range(-1, h + 1):
                px, py = x + dx, y + dy
                if 0 <= px < W and 0 <= py < H and g[py][px] == ROCA:
                    return True
        return False

    ocupado = set()
    objetos = []
    puestas = 0
    for nombre, z in sorted(zonas.items()):
        lista = [p for p in POR_TEMA.get(z['tema'], []) if p in medidas]
        if not lista:
            continue
        for (x, y) in z['celdas']:
            if ruido(x, y, 88) < 0.955:
                continue
            p = lista[int(ruido(x, y, 89) * len(lista)) % len(lista)]
            w, h = medidas[p]['ancho'], medidas[p]['alto']
            if any((x + dx, y + dy) in ocupado
                   for dx in range(w) for dy in range(h)):
                continue
            if not cabe(x, y, w, h) or not pared_cerca(x, y, w, h):
                continue
            for dx in range(w):
                for dy in range(h):
                    ocupado.add((x + dx, y + dy))

            if medidas[p].get('alta'):
                # ALTA: va como objeto y la escena la pone de sprite, con su
                # profundidad atada a la base. Asi el jugador pasa POR DETRAS.
                # `y` del objeto es la BASE de la pieza (su ultima fila), que
                # es lo que Phaser necesita para ordenarla.
                objetos.append(obj_punto((x + w * 0.5) * TILE,
                                         (y + h) * TILE, p, 'pieza'))
            else:
                # PLANA: se pisa por encima, asi que va en la capa de tiles y
                # no gasta un objeto de dibujo.
                for dy in range(h):
                    for dx in range(w):
                        clave = '%s_%d%d' % (p, dx, dy)
                        if clave in ix:
                            capa[(y + dy) * W + (x + dx)] = ix[clave] + 1
            puestas += 1

    return puestas, objetos, ocupado


def poner_antorchas(g, ficha, capa, antorchas, ocupado):
    """
    Las antorchas de pared, como PIEZA de 1x2 casillas (32x64 px).

    A 16 px eran un tile y no tapaban nada. A 32 px una antorcha mide 64 px de
    alto —dos tercios del personaje— asi que tiene que ordenarse con el: si
    pasas por delante la tapas, si pasas por detras te tapa. Por eso sale como
    objeto y no como tile.
    """
    medidas = ficha['piezas_grandes']['medidas']
    if 'antorcha' not in medidas:
        return 0, []
    w, h = medidas['antorcha']['ancho'], medidas['antorcha']['alto']
    objetos = []
    for o in antorchas:
        x = int(o['x']) // TILE
        y = int(o['y']) // TILE
        # La antorcha se clava en la ROCA, pero su sprite asoma hacia el hueco:
        # se coloca en la casilla de roca y su base cae en su borde de abajo.
        libre = True
        for dy in range(h):
            for dx in range(w):
                px, py = x + dx, y + dy - (h - 1)
                if not (0 <= px < W and 0 <= py < H) or (px, py) in ocupado:
                    libre = False
                    break
            if not libre:
                break
        if not libre:
            continue
        for dx in range(w):
            for dy in range(h):
                ocupado.add((x + dx, y + dy - (h - 1)))
        objetos.append(obj_punto((x + w * 0.5) * TILE, (y + 1) * TILE,
                                 'antorcha', 'pieza'))
    return len(objetos), objetos


def poner_puntales(g, ix, ficha, capa, vigas, ocupado):
    """
    Arcos de madera (4x3) cruzando las galerias con rail.

    Van SIEMPRE como objeto: un arco mide 48 px de alto y el jugador tiene que
    poder pasar por debajo del dintel viendose por delante de los postes de
    atras y por detras de los de delante. Eso es 2.5D y una capa de tiles no lo
    hace.
    """
    medidas = ficha['piezas_grandes']['medidas']
    if 'puntal' not in medidas:
        return 0, []
    w, h = medidas['puntal']['ancho'], medidas['puntal']['alto']
    puestos = 0
    objetos = []
    for o in vigas[::2]:
        x = int(o['x']) // TILE - w // 2
        y = int(o['y']) // TILE - h
        libre = True
        for dy in range(h):
            for dx in range(w):
                px, py = x + dx, y + dy
                if not (0 <= px < W and 0 <= py < H) or                    g[py][px] not in (SUELO, GRAVA, TABLA, CARRIL) or                    capa[py * W + px] or (px, py) in ocupado:
                    libre = False
                    break
            if not libre:
                break
        if not libre:
            continue
        for dx in range(w):
            for dy in range(h):
                ocupado.add((x + dx, y + dy))
        # Como OBJETO, no como tiles: el arco mide 48 px de alto y el jugador
        # tiene que poder cruzarlo viendose por delante de un poste y por
        # detras del otro. La `y` es la BASE, que es de donde sale el `depth`.
        objetos.append(obj_punto((x + w * 0.5) * TILE, (y + h) * TILE,
                                 'puntal', 'pieza'))
        puestos += 1
    return puestos, objetos


# ===========================================================================
# COLISIONES: fusionar en rectangulos maximos
# ===========================================================================

def rectangulos(marca):
    """
    `marca` es una rejilla de booleanos. Devuelve los rectangulos maximos que
    la cubren, en pixeles.

    Barrido clasico: por cada fila se toman las tiradas horizontales todavia
    sin cubrir y cada una se estira hacia abajo mientras la fila de debajo
    tenga esa misma tirada libre.
    """
    usado = [[False] * W for _ in range(H)]
    out = []
    for y in range(H):
        x = 0
        while x < W:
            if not marca[y][x] or usado[y][x]:
                x += 1
                continue
            x2 = x
            while x2 + 1 < W and marca[y][x2 + 1] and not usado[y][x2 + 1]:
                x2 += 1
            y2 = y
            while y2 + 1 < H and all(marca[y2 + 1][k] and not usado[y2 + 1][k]
                                     for k in range(x, x2 + 1)):
                y2 += 1
            for yy in range(y, y2 + 1):
                for xx in range(x, x2 + 1):
                    usado[yy][xx] = True
            out.append((x * TILE, y * TILE,
                        (x2 - x + 1) * TILE, (y2 - y + 1) * TILE))
            x = x2 + 1
    return out


# ===========================================================================
# CAPAS DE OBJETOS
# ===========================================================================

_ID = [0]


def _oid():
    _ID[0] += 1
    return _ID[0]


def obj_rect(x, y, w, h, nombre=''):
    return {'id': _oid(), 'name': nombre, 'type': '', 'visible': True,
            'rotation': 0, 'x': round(x, 2), 'y': round(y, 2),
            'width': round(w, 2), 'height': round(h, 2)}


def obj_punto(x, y, nombre='', tipo=''):
    return {'id': _oid(), 'name': nombre, 'type': tipo, 'visible': True,
            'rotation': 0, 'x': round(x, 2), 'y': round(y, 2),
            'width': 0, 'height': 0, 'point': True}


def capa_obj(nombre, objetos):
    return {'draworder': 'topdown', 'id': _oid() + 10000, 'name': nombre,
            'objects': objetos, 'opacity': 1, 'type': 'objectgroup',
            'visible': True, 'x': 0, 'y': 0}


# ===========================================================================
# VISTA PREVIA
# ===========================================================================

def vista(g, ruta):
    """Un PNG de 313x313 con un color por material. Para mirar el plano."""
    try:
        from PIL import Image
    except ImportError:
        return None
    col = {ROCA: (52, 48, 45), SUELO: (124, 117, 110), GRAVA: (150, 110, 80),
           TABLA: (165, 116, 86), LAVA: (232, 98, 28), AGUA: (86, 134, 168),
           CARRIL: (170, 176, 184)}
    im = Image.new('RGB', (W, H))
    im.putdata([col[g[y][x]] for y in range(H) for x in range(W)])
    im = im.resize((W * 2, H * 2), Image.NEAREST)
    im.save(ruta)
    return ruta


# ===========================================================================
# MAIN
# ===========================================================================

def main():
    with io.open(FICHA_TILESET, encoding='utf-8') as fh:
        ficha = json.load(fh)
    ix = ficha['indices']
    parche = ficha['parche_lava']['lado']
    alto_muro = ficha['muro']['alto_tiles']
    ancho_muro = ficha['muro']['ancho_tiles']
    parche_roca = ficha['parche_roca']['lado']
    if ficha['tile'] != TILE:
        raise SystemExit('el tileset es de %d px y el mapa de %d: corre primero '
                         'tools/generar-mina.py' % (ficha['tile'], TILE))

    g, zonas, carriles = excavar()
    puestos_rail, via = poner_carriles(g, carriles)
    capa = pintar(g, ix, zonas, parche, alto_muro, ancho_muro, parche_roca, via)

    # ── Colisiones: la roca y la lava ───────────────────────────────────────
    marca = [[g[y][x] in (ROCA, LAVA) for x in range(W)] for y in range(H)]
    rects = rectangulos(marca)
    colisiones = [obj_rect(x, y, w, h) for (x, y, w, h) in rects]

    # ── Lava y agua: rectangulos para el tileSprite animado ─────────────────
    #
    # Se sacan DOS versiones de cada liquido:
    #
    #   area_lava           todas sus casillas. Es la forma del lago.
    #   area_lava_interior  solo las casillas RODEADAS de lava.
    #
    # La segunda existe por un fallo que solo se vio con el mapa montado en
    # Phaser: la escena pone el brillo de la lava con un tileSprite recortado
    # por estos rectangulos, y los rectangulos tienen el borde RECTO. Encima de
    # las casillas del borde —que llevan las piezas de transicion, con su
    # contorno ondulado— quedaba un filo recto de brillo que cortaba la onda y
    # se veia el escalon del tile.
    #
    # Dejando el brillo una casilla adentro, el borde del lago lo dibuja solo
    # la pieza de transicion, que para eso esta.
    def _interior(material):
        return [[g[y][x] == material and all(
                    0 <= y + dy < H and 0 <= x + dx < W and
                    g[y + dy][x + dx] == material
                    for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)))
                 for x in range(W)] for y in range(H)]

    marca_lava = [[g[y][x] == LAVA for x in range(W)] for y in range(H)]
    objs_lava = [obj_rect(x, y, w, h, 'lava')
                 for (x, y, w, h) in rectangulos(marca_lava)]
    objs_lava_int = [obj_rect(x, y, w, h, 'lava')
                     for (x, y, w, h) in rectangulos(_interior(LAVA))]

    marca_agua = [[g[y][x] == AGUA for x in range(W)] for y in range(H)]
    objs_agua = [obj_rect(x, y, w, h, 'agua')
                 for (x, y, w, h) in rectangulos(marca_agua)]
    objs_agua_int = [obj_rect(x, y, w, h, 'agua')
                     for (x, y, w, h) in rectangulos(_interior(AGUA))]

    # ── La salida: al fondo de la sala de entrada ───────────────────────────
    ex, ey = _pos('entrada')
    salida = [obj_rect((ex - 2) * TILE, (ey - 9) * TILE, 4 * TILE, 2 * TILE,
                       'salida_mina')]

    # ── Donde aparece el jugador al entrar ──────────────────────────────────
    aparicion = [obj_punto(ex * TILE, (ey - 5) * TILE, 'aparicion_mina')]

    # ── Puntos de mineral: en el suelo, pegados a la pared de cada sala ─────
    minerales = []
    for nombre, z in zonas.items():
        tema = z['tema']
        if tema not in ('piedra', 'cobre', 'hierro', 'carbon', 'oro'):
            continue
        cx, cy = z['centro']
        rx, ry = z['radios']
        n = 0
        for (x, y) in z['celdas']:
            if g[y][x] not in (SUELO, GRAVA):
                continue
            # Pegado a la pared: alguna de las 8 vecinas es roca.
            if not any(g[max(0, min(H - 1, y + dy))][max(0, min(W - 1, x + dx))] == ROCA
                       for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                continue
            if ruido(x, y, 61) < 0.93:
                continue
            n += 1
            minerales.append(obj_punto(x * TILE + 8, y * TILE + 8,
                                       '%s_%s_%d' % (tema, nombre, n), tema))

    # ── Antorchas: en las paredes de las galerias, cada pocos tiles ─────────
    antorchas = []
    for (x, y, prev) in puestos_rail[::9]:
        for dx, dy in ((-2, 0), (2, 0), (0, -2), (0, 2)):
            px, py = x + dx, y + dy
            if 0 <= px < W and 0 <= py < H and g[py][px] == ROCA:
                antorchas.append(obj_punto(px * TILE + 8, py * TILE + 8,
                                           'antorcha', 'antorcha'))
                break
    for nombre, z in zonas.items():
        cx, cy = z['centro']
        rx, ry = z['radios']
        for k in range(8):
            a = k * math.pi / 4.0
            px, py = int(cx + math.cos(a) * rx * 1.02), int(cy + math.sin(a) * ry * 1.02)
            if 0 <= px < W and 0 <= py < H and g[py][px] == ROCA:
                antorchas.append(obj_punto(px * TILE + 8, py * TILE + 8,
                                           'antorcha', 'antorcha'))

    # ── Vigas de apuntalar a lo largo de las galerias con rail ──────────────
    vigas = []
    for (x, y, prev) in puestos_rail[::14]:
        vigas.append(obj_punto(x * TILE + 8, y * TILE + 8, 'viga', 'viga'))

    capa_sombras = sombrear(g, ix)
    capa_objetos = decorar(g, ix, zonas, antorchas, vigas)
    # Las piezas grandes van DESPUES de los cacharros de un tile: asi la
    # comprobacion de "esta libre" ve tambien lo que puso `decorar`.
    n_grandes, objs_piezas, ocupado = poner_piezas_grandes(
        g, ix, ficha, zonas, capa_objetos)
    n_puntales, objs_puntales = poner_puntales(
        g, ix, ficha, capa_objetos, vigas, ocupado)
    n_antorchas, objs_antorchas = poner_antorchas(
        g, ficha, capa_objetos, antorchas, ocupado)
    objs_piezas += objs_puntales + objs_antorchas

    mapa = {
        'compressionlevel': -1,
        'height': H,
        'infinite': False,
        'nextlayerid': 40,
        'nextobjectid': _ID[0] + 20000,
        'orientation': 'orthogonal',
        'renderorder': 'right-down',
        'tiledversion': '1.11.2',
        'tileheight': TILE,
        'tilewidth': TILE,
        'type': 'map',
        'version': '1.10',
        'width': W,
        'layers': [
            {'data': capa, 'height': H, 'id': 1, 'name': 'mina',
             'opacity': 1, 'type': 'tilelayer', 'visible': True,
             'width': W, 'x': 0, 'y': 0},
            {'data': capa_sombras, 'height': H, 'id': 4, 'name': 'mina_sombras',
             'opacity': 1, 'type': 'tilelayer', 'visible': True,
             'width': W, 'x': 0, 'y': 0},
            {'data': capa_objetos, 'height': H, 'id': 2, 'name': 'mina_objetos',
             'opacity': 1, 'type': 'tilelayer', 'visible': True,
             'width': W, 'x': 0, 'y': 0},
            capa_obj('area_colision_general', colisiones),
            capa_obj('area_lava', objs_lava),
            capa_obj('area_lava_interior', objs_lava_int),
            capa_obj('area_agua', objs_agua),
            capa_obj('area_agua_interior', objs_agua_int),
            capa_obj('area_salida_mina', salida),
            capa_obj('aparicion', aparicion),
            capa_obj('puntos_mineral', minerales),
            capa_obj('antorchas', antorchas),
            capa_obj('vigas', vigas),
            capa_obj('piezas', objs_piezas),
        ],
        'tilesets': [{
            'columns': ficha['columnas'],
            'firstgid': 1,
            'image': '../Game/MAPAS/Mina/tileset_mina.png',
            'imageheight': ficha['filas'] * TILE,
            'imagewidth': ficha['columnas'] * TILE,
            'margin': 0,
            'name': 'tileset_mina',
            'spacing': 0,
            'tilecount': ficha['tiles'],
            'tileheight': TILE,
            'tilewidth': TILE,
        }],
    }

    carpeta = os.path.dirname(DESTINO_MAPA)
    if not os.path.isdir(carpeta):
        os.makedirs(carpeta)
    with io.open(DESTINO_MAPA, 'w', encoding='utf-8') as fh:
        fh.write(json.dumps(mapa, ensure_ascii=False, separators=(',', ':')))

    vista(g, os.path.join(carpeta, 'mina_vista.png'))

    huecos = sum(1 for y in range(H) for x in range(W) if g[y][x] != ROCA)
    print('mina.json  %dx%d tiles (%dx%d px)' % (W, H, PX, PX))
    print('  excavado      %d casillas (%.1f %% del mapa)'
          % (huecos, 100.0 * huecos / (W * H)))
    print('  colisiones    %d rectangulos (de %d casillas de roca/lava)'
          % (len(colisiones), sum(1 for y in range(H) for x in range(W) if marca[y][x])))
    print('  lava          %d rectangulos (%d de interior)'
          % (len(objs_lava), len(objs_lava_int)))
    print('  agua          %d rectangulos (%d de interior)'
          % (len(objs_agua), len(objs_agua_int)))
    print('  minerales     %d puntos' % len(minerales))
    print('  antorchas     %d puntos' % len(antorchas))
    print('  vigas         %d puntos' % len(vigas))
    print('  capa sombras  %d tiles' % sum(1 for v in capa_sombras if v))
    print('  capa objetos  %d tiles' % sum(1 for v in capa_objetos if v))
    print('  piezas grandes %d + %d arcos + %d antorchas (%d sprites en 2.5D)'
          % (n_grandes, n_puntales, n_antorchas, len(objs_piezas)))
    print('  peso          %.0f KB' % (os.path.getsize(DESTINO_MAPA) / 1024.0))


if __name__ == '__main__':
    main()
