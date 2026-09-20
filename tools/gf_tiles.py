#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
GF TILES — motor de tilesets de 16x16
=============================================================================

Dibuja las piezas comunes a cualquier tileset del juego. Los temas (isla,
cueva, volcan...) estan en `generar-tilesets.py`; aqui solo esta la maquinaria.

EL TAMANO Y EL ESTILO SALEN DEL JUEGO
---------------------------------------------------------------------------
`Game/MAPAS/tiles.png` son 2880 tiles de **16x16** en 90 columnas, y los mapas
de `Maps/*.json` los usan con `tilewidth: 16`. El arte es PLANO: color liso con
unos pocos pixeles de acento, sin degradados ni antialias.

    hierba   #418546  (claro #62b368, oscuro #37733c)
    camino   #987656  (claro #aa8969, oscuro #745232, contorno #5b3d27)

Los tilesets nuevos respetan eso: tres tonos por material y manchas sueltas,
nunca un degradado. Un tile con degradado al lado de uno del juego canta.

POR QUE TODO ES FUNCION DE LA COORDENADA LOCAL
---------------------------------------------------------------------------
Un tile se repite. Si la textura se sortea con un dado, dos copias del mismo
tile salen distintas y el mapa se ve moteado; si la textura es funcion de la
coordenada LOCAL (0..15), todas las copias son identicas y el suelo se ve
uniforme. Por eso `ruido()` no usa `random`: es un hash de (x, y, semilla).

Y por eso las transiciones encajan. El borde entre dos terrenos se traza con
una onda de PERIODO 16 sobre la coordenada local:

    curva(x) = amp * sin(2*pi*k*x/16)

Como vale lo mismo en x=0 que en x=16, dos tiles de borde pegados continuan la
linea sin escalon, y las esquinas —que son la interseccion de dos bordes— caen
justo donde acaban los lados. Sin esa periodicidad hay que dibujar los 47 casos
del autotile a mano y aun asi no cierran.

EL JUEGO DE 13 TILES
---------------------------------------------------------------------------
Cada transicion son 13 piezas, que es el minimo con el que se puede dibujar
cualquier mancha de un terreno sobre otro:

    NO  N  NE        + 4 esquinas INTERIORES, para cuando el terreno de fuera
    O   C  E           entra en una esquina en vez de en un lado
    SO  S  SE
"""

import math

import gf_arte as A
from gf_arte import Mascara, Lienzo, mezcla, ajusta
import gf_volumen as VOL

T = 16                      # el lado de un tile, como en el juego


# ===========================================================================
# TEXTURA
# ===========================================================================

def ruido(x, y, semilla):
    """0..1 determinista y periodico en 16: la misma copia del tile siempre."""
    h = (x * 73856093) ^ (y * 19349663) ^ (semilla * 83492791)
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


def relleno(t, cols, semilla, motas=0, x0=0, y0=0, x1=T, y1=T, mascara=None,
            largo=2):
    """
    Rellena PLANO con el tono medio y, si se piden, estampa unas pocas motas.

    EL SUELO DEL JUEGO ES LISO. Medido en `Game/MAPAS/tiles.png`: el tile de
    hierba son 5824 pixeles de #418546 sobre 6400, o sea el 91 % de un unico
    color, y lo que no es ese color son flores DIBUJADAS, no ruido. La primera
    version salpicaba un 10 % de claro y un 10 % de oscuro pixel a pixel y el
    mapa entero se veia con nieve de television — que es exactamente lo que se
    ve mal a primera vista.

    Las motas son marcas deliberadas: `motas` grupos de `largo` pixeles en
    posiciones fijas (funcion de la coordenada, no del azar, para que todas las
    copias del tile sean iguales). Con 0 el tile queda completamente liso.
    """
    if len(cols) == 5:
        cl, me, os_ = cols[0], cols[2], cols[4]
    else:
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


def mota(t, cols, semilla, n=3, r=1.2):
    """Manchas redondas sueltas: guijarros, matas, burbujas."""
    for i in range(n):
        cx = 2 + ruido(i * 7 + 1, 3, semilla) * (T - 4)
        cy = 2 + ruido(5, i * 11 + 2, semilla) * (T - 4)
        m = Mascara(T, T).disco(cx, cy, r)
        for x, y in m.puntos():
            t.set(x, y, cols[1])
        for x, y in m.borde_interno(False).puntos():
            if y > cy:
                t.set(x, y, cols[2])
        t.set(int(cx - r * .4), int(cy - r * .5), cols[0])
    return t


# ===========================================================================
# BORDES: las curvas que hacen que las piezas encajen
# ===========================================================================

def curva_h(x, semilla, amp=2.2, k=1):
    """
    Desviacion vertical del borde horizontal en la columna x.

    EL ARMONICO GRANDE MANDA. La version anterior sumaba los armonicos 2 y 3
    —dos y tres bultos por tile— con una amplitud de 1.6: eso es una onda que
    sube y baja tres veces en dieciseis pixeles, o sea un diente cada dos o tres
    columnas. Dibujado, no es una orilla: es una SIERRA, y de lejos se lee como
    ruido. Es lo que hacia que los tilesets "no se vieran de graficos".

    Ahora manda el armonico 1 (un bulto por tile, amplitud grande) y el 2 solo
    lo despeina un poco. Sale una linea que ondula de verdad, con tramos rectos
    de cinco o seis pixeles entre curva y curva, que es como se dibuja a mano el
    borde de un prado. Sigue siendo periodica en 16, asi que las piezas siguen
    encajando sin escalon.
    """
    u = 2 * math.pi * (x + 0.5) / T
    return amp * (0.78 * math.sin(u + semilla * 0.7) +
                  0.22 * math.sin(2 * u + semilla * 1.9))


def curva_v(y, semilla, amp=2.2, k=1):
    u = 2 * math.pi * (y + 0.5) / T
    return amp * (0.78 * math.sin(u + semilla * 1.3) +
                  0.22 * math.sin(2 * u + semilla * 2.7))


def perfil_roca(semilla, amp=2):
    """
    El canto de una roca: ESCALONES, no una onda.

    Una piedra no tiene el borde sinuoso; tiene planos y aristas. Si el filo de
    la meseta se traza con el mismo seno que la orilla de un prado, sale un
    festoneado regular —un bollito por tile— que repetido a lo largo de un
    acantilado se lee como el borde de un tapete.

    Aqui el filo se parte en tramos RECTOS de 3 a 6 pixeles y cada tramo esta a
    una altura distinta. Periodico en 16 por construccion (los tramos suman
    exactamente 16), asi que dos tiles seguidos siguen encajando.
    """
    alturas = []
    i = 0
    for largo in _reparto(T, semilla + 41, 4, 8):
        nivel = int(ruido(i * 19 + 7, 13, semilla) * (2 * amp + 0.99)) - amp
        alturas += [nivel] * largo
        i += 1
    return alturas[:T]


_PERFILES = {}


def perfil_h(semilla, amp=2):
    """
    El perfil del borde entre dos terrenos: ESCALONES, no una onda.

    Mirando `Game/MAPAS/montañas tiled original.png` y `Tileset_Ground.png`, el
    juego no dibuja bordes sinuosos: dibuja tramos rectos con saltos secos, y
    resuelve la transicion con el fleco de hierba que cae encima (ver
    `gf_volumen.fleco`). Una onda senoidal, por suave que sea, deja un
    festoneado regular que tile tras tile se lee como el borde de un tapete —
    y era la mitad de lo que hacia que los tilesets no parecieran del juego.

    Los tramos suman exactamente 16, asi que el perfil es periodico y dos
    piezas seguidas siguen encajando sin escalon falso.
    """
    clave = (semilla, amp)
    if clave not in _PERFILES:
        _PERFILES[clave] = VOL.escalones(T, semilla, amp, 4, 8)
    return _PERFILES[clave]


def mascara_borde(lado, semilla, dentro=5.0, amp=2.2):
    """
    Mascara del terreno de DENTRO para una pieza del juego de 13.

    `lado` es uno de: 'C', 'N', 'S', 'E', 'O', 'NO', 'NE', 'SO', 'SE',
    'iNO', 'iNE', 'iSO', 'iSE' (las cuatro esquinas interiores).
    """
    m = Mascara(T, T)

    pn = perfil_h(semilla)
    ps = perfil_h(semilla + 3)
    po = perfil_h(semilla + 5)
    pe = perfil_h(semilla + 7)

    def bajo_n(x, y):        # por debajo del borde de arriba
        return y >= dentro + pn[int(x) % T]

    def sobre_s(x, y):       # por encima del borde de abajo
        return y <= (T - 1 - dentro) + ps[int(x) % T]

    def dcha_o(x, y):        # a la derecha del borde izquierdo
        return x >= dentro + po[int(y) % T]

    def izda_e(x, y):        # a la izquierda del borde derecho
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


LADOS = ['NO', 'N', 'NE', 'O', 'C', 'E', 'SO', 'S', 'SE',
         'iNO', 'iNE', 'iSO', 'iSE']


def _complemento(m):
    c = Mascara(m.w, m.h)
    for i, v in enumerate(m.d):
        if not v:
            c.d[i] = 1
    return c


def transicion(lado, fuera, dentro, semilla, estilo='ondulado', amp=2.2,
               ancho_dentro=5.0, encima='dentro'):
    """
    Un tile del juego de 13: `dentro` sobre `fuera`.

    EL BORDE NO ES UNA RAYA: ES UN ESCALON. Lo que el juego dibuja donde se
    acaba un prado y empieza la tierra son tres cosas (ver `gf_volumen.fleco`):
    el canto casi recto del terreno de dentro, una linea OSCURA por fuera —la
    sombra que proyecta, y lo unico que dice que la hierba esta mas alta— y
    unos matojos del tono claro de dentro cayendo por encima de esa sombra.

    La version anterior pintaba solo un pixel de filo oscuro por DENTRO. Eso no
    es un escalon, es un cambio de pintura, y por eso el mapa se veia como un
    mosaico plano.

    `estilo` cambia el remate:
        ondulado  fleco de hierba (prado sobre tierra)
        espuma    espuma en bultos por fuera (orilla del agua)
        piedra    guijarros sueltos sobre el borde (camino empedrado)
        seco      sombra por fuera y un pixel de luz por dentro (roca, losa)

    `encima` dice CUAL DE LOS DOS TERRENOS ESTA MAS ALTO, y no es un detalle:
    la hierba se derrama sobre la tierra, nunca al reves. En la isla el
    secundario es la hierba sobre la arena (`dentro`), pero en la pradera el
    secundario es el camino de tierra sobre la hierba, y entonces el que asoma
    es el de fuera. Poniendolo al reves, el mapa se ve como un camino de tierra
    levantado sobre el prado, que es justo lo contrario de lo que pasa.
    """
    t = Lienzo(T, T)
    relleno(t, fuera, semilla)
    m = mascara_borde(lado, semilla, ancho_dentro, amp)
    relleno(t, dentro, semilla + 11, mascara=m)
    if lado == 'C':
        return t

    d_cl = dentro[0] if len(dentro) == 3 else dentro[0]
    d_os = dentro[-1] if len(dentro) == 3 else dentro[4]
    f_me = fuera[1] if len(fuera) == 3 else fuera[2]

    if estilo == 'espuma':
        # La espuma va SOLO por fuera, en el terreno seco, y en bultos: una
        # linea de un pixel alrededor de todo el tile dibujaba una cuadricula.
        cl = mezcla(dentro[0], (255, 255, 255), 0.60)
        VOL.fleco(t, m, cl, ajusta(f_me, dv=0.80), semilla + 19,
                  densidad=0.70, largo=1)
        for x, y in m.borde_interno(True, contar_fuera=False).puntos():
            t.set(x, y, dentro[0])
    elif estilo == 'piedra':
        VOL.fleco(t, m, d_cl, ajusta(f_me, dv=0.72), semilla + 19,
                  densidad=0.25, largo=1)
        i = 0
        for x, y in m.borde_interno(True, contar_fuera=False).puntos():
            i += 1
            t.set(x, y, d_os if i % 3 else d_cl)
    elif estilo == 'seco':
        for x, y in m.borde(False).puntos():
            t.set(x, y, ajusta(f_me, dv=0.74))
        for x, y in m.borde_interno(True, contar_fuera=False).puntos():
            t.set(x, y, mezcla(d_cl, dentro[1] if len(dentro) == 3 else dentro[2], 0.4))
    else:                                     # ondulado = el fleco de hierba
        f_cl = fuera[0]
        d_me = dentro[1] if len(dentro) == 3 else dentro[2]
        if encima == 'fuera':
            VOL.fleco(t, _complemento(m), f_cl, ajusta(d_me, dv=0.70),
                      semilla + 19, densidad=0.60, largo=2)
        else:
            VOL.fleco(t, m, d_cl, ajusta(f_me, dv=0.70), semilla + 19,
                      densidad=0.60, largo=2)
            for x, y in m.borde_interno(True, contar_fuera=False).puntos():
                if t.get(x, y) != d_cl:
                    t.set(x, y, mezcla(d_os, d_cl, 0.25))
    return t


# ===========================================================================
# ACANTILADOS
# ===========================================================================

def _reparto(total, semilla, minimo, maximo):
    """
    Parte `total` en trozos de entre `minimo` y `maximo` que suman EXACTAMENTE
    `total`. Se usa para repartir piedras sin que la ultima quede cortada.
    """
    trozos = []
    queda = total
    i = 0
    while queda > 0:
        if queda <= maximo:
            trozos.append(queda)
            break
        n = minimo + int(ruido(i * 31 + 3, 11, semilla) * (maximo - minimo + 0.99))
        n = min(n, queda - minimo)
        trozos.append(max(minimo, n))
        queda -= trozos[-1]
        i += 1
    return trozos


def acantilado(pieza, arriba, cara, semilla, alto_borde=5):
    """
    Las nueve piezas de un acantilado, a la manera del juego.

        filo_izq  filo_c  filo_der      donde acaba la meseta
        pared_izq pared_c pared_der     la pared
        pie_izq   pie_c   pie_der       donde toca el suelo

    UN ACANTILADO DEL JUEGO ES UN MURO DE CANTOS RODADOS, no una pared de
    sillares y mucho menos una valla. Basta con mirar
    `Game/MAPAS/montañas tiled original.png`: la meseta va rodeada de una banda
    de piedras redondas de unos 8x6 px, en hiladas corridas media piedra, cada
    una con la coronilla clara y una media luna oscura por debajo, y por el
    borde de arriba asoman matojos de hierba de la meseta.

    Las dos versiones anteriores fueron primero rayas verticales cada cuatro
    pixeles —que salia una empalizada— y despues sillares rectangulares —que
    salia un muro de ladrillo—. Las dos eran PLANAS: el juego no lo es.
    """
    t = Lienzo(T, T)
    fila, col = pieza
    cl, me, os_ = cara[0], cara[1], cara[2]
    ar_cl = arriba[0]
    ar_me = arriba[1] if len(arriba) == 3 else arriba[2]
    ar_os = arriba[-1] if len(arriba) == 3 else arriba[4]

    if fila == 0:
        # la meseta arriba, el canto de piedra abajo, y el fleco de la meseta
        # cayendo por encima de la primera hilada
        relleno(t, arriba, semilla)
        perfil = perfil_h(semilla + 41, 1)
        m_roca = Mascara(T, T)
        for x in range(T):
            borde = max(2, min(T - 3, T - alto_borde + perfil[x]))
            for y in range(borde, T):
                m_roca.set(x, y)
        roca = Lienzo(T, T)
        VOL.empedrado(roca, 0, 0, T - 1, T - 1, cara, semilla, alto=5,
                      ancho=(6, 9), periodo=T)
        for x, y in m_roca.puntos():
            c = roca.get(x, y)
            if c[3]:
                t.set(x, y, c)
        VOL.fleco(t, _complemento(m_roca), ar_cl, ajusta(me, dv=0.68),
                  semilla + 7, densidad=0.62, largo=2)
    elif fila == 1:
        VOL.empedrado(t, 0, 0, T - 1, T - 1, cara, semilla, alto=5,
                      ancho=(6, 9), periodo=T)
    else:
        VOL.empedrado(t, 0, 0, T - 1, T - 5, cara, semilla, alto=5,
                      ancho=(6, 9), periodo=T)
        # el pie: la sombra que la pared echa sobre el suelo que tiene delante
        for i, y in enumerate(range(T - 4, T)):
            for x in range(T):
                c = t.get(x, y - 5)
                if not c[3]:
                    c = me
                t.set(x, y, ajusta(c, dv=0.86 - i * 0.07))
        # y unos cascotes sueltos al ras
        for i in range(3):
            cx = 2 + int(ruido(i * 9 + 1, 4, semilla) * (T - 5))
            VOL.guijarro(t, cx, T - 2.5, 2.2, 1.6,
                         [ajusta(k, dv=0.86) for k in cara[:3]])

    # Los extremos del acantilado: el canto que dobla hacia atras se oscurece
    # un poco. NO se pinta una raya: una raya en el tile central seria una
    # costura cada dieciseis pixeles a lo largo de toda la pared.
    if col == 0:
        for y in range(T):
            t.set(0, y, ajusta(t.get(0, y), dv=0.74))
            t.set(1, y, ajusta(t.get(1, y), dv=0.88))
    elif col == 2:
        for y in range(T):
            t.set(T - 1, y, ajusta(t.get(T - 1, y), dv=0.74))
            t.set(T - 2, y, ajusta(t.get(T - 2, y), dv=0.88))
    return t


# ===========================================================================
# HOJAS
# ===========================================================================

def hoja(tiles, columnas):
    """Monta una lista de tiles en una imagen de `columnas` de ancho."""
    filas = (len(tiles) + columnas - 1) // columnas
    li = Lienzo(columnas * T, filas * T)
    for i, t in enumerate(tiles):
        if t is None:
            continue
        li.pegar(t, (i % columnas) * T, (i // columnas) * T)
    return li


def mapa(tileset_tiles, columnas, rejilla, fondo=None):
    """
    Pinta un mapa de ejemplo. `rejilla` es una lista de filas y cada fila una
    lista de indices de tile (None = nada). Es lo que se usa para las hojas de
    referencia de construccion.
    """
    alto = len(rejilla)
    ancho = max(len(f) for f in rejilla)
    li = Lienzo(ancho * T, alto * T)
    if fondo is not None:
        for y in range(li.h):
            for x in range(li.w):
                li.set(x, y, fondo)
    for fy, fila in enumerate(rejilla):
        for fx, idx in enumerate(fila):
            if idx is None:
                continue
            capas = idx if isinstance(idx, (list, tuple)) else [idx]
            for c in capas:
                if c is None or c >= len(tileset_tiles) or tileset_tiles[c] is None:
                    continue
                li.pegar(tileset_tiles[c], fx * T, fy * T)
    return li
