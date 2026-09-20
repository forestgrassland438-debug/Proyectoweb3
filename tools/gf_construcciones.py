#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
GF CONSTRUCCIONES — casas y cosas hechas por alguien
=============================================================================

La usa `generar-construcciones.py`. Aqui esta el cómo; el catalogo de qué se
dibuja esta alli.

LA PALETA ES LA DE LAS CASAS DEL JUEGO, CONTADA PIXEL A PIXEL
---------------------------------------------------------------------------
De `Game/Objetos/casa de npc arreglado.png` y `casa de granja cabaña.png`:

    tejado    #263053 . #364061 . #3b4569 . #3e486c . #4a537c   (pizarra azul)
    madera    #4d2d44 . #633946 . #804949                       (vigas y marcos)
    piedra    #5a5353 . #8b8181                                 (el muro)
    cristal   #507a9a                                           (las ventanas)
    contorno  #302c2e

Ese azul de pizarra con la viga granate es la firma visual del pueblo del
juego: una casa nueva con tejado rojo o marron se ve de otro juego aunque este
bien dibujada. Por eso los edificios del pack no eligen color: usan estos.

UNA CASA SE MONTA DE ABAJO A ARRIBA
---------------------------------------------------------------------------
    zocalo    tres o cuatro filas de sillares grandes: la casa se apoya en algo
    muro      piedra aparejada, o yeso con entramado de vigas
    alero     la tabla horizontal que separa muro y tejado, y que VUELA dos
              pixeles por cada lado — sin ese vuelo el tejado parece pegado con
              cinta
    tejado    hiladas de pizarra de dos filas, cada una corrida media teja
              respecto a la de abajo, y el caballete mas claro arriba del todo

Y el detalle que las hace parecer casas y no cajas: **la sombra del alero**.
Una fila oscura justo debajo del tejado, sobre el muro. Es lo que dice que el
tejado esta DELANTE del muro y no pintado encima.

LAS TEJAS NO SE DIBUJAN UNA A UNA
---------------------------------------------------------------------------
Se dibuja la hilada entera de un tono y luego se marca el canto de cada teja.
Dibujarlas una a una a 16 px de alto da una cuadricula; marcando solo el canto
inferior y una junta cada cuatro pixeles sale lo mismo que en el juego.
"""

import math

import gf_arte as A
from gf_arte import Mascara, Lienzo, mezcla, ajusta, rng_de
import gf_volumen as VOL


def R(*hexes):
    return [A.hex_rgb(h) for h in hexes]


# ===========================================================================
# LOS MATERIALES
# ===========================================================================

PIZARRA = R('#4a537c', '#3e486c', '#3b4569', '#364061', '#263053')
PAJA = R('#e0c070', '#c09a40', '#94722a', '#6b501a', '#4a3612')
TEJA_ROJA = R('#c86a4a', '#a8482f', '#8a3521', '#6b2616', '#48180e')
MADERA = R('#804949', '#633946', '#4d2d44')
MADERA_CLARA = R('#c09858', '#8a6a34', '#5a441f')
PIEDRA = R('#a39a9a', '#8b8181', '#5a5353')
YESO = R('#ded6c4', '#c4bba6', '#948b78')
CRISTAL = R('#7fa8c8', '#507a9a', '#2f4f68')
NEGRO = A.hex_rgb('#302c2e')
METAL = R('#b0b8c0', '#7f8790', '#4a5058')

TEJADOS = {'pizarra': PIZARRA, 'paja': PAJA, 'teja': TEJA_ROJA}
MUROS = {'piedra': PIEDRA, 'yeso': YESO, 'tabla': MADERA_CLARA}


# ===========================================================================
# PIEZAS SUELTAS
# ===========================================================================

def _sillares(li, x0, y0, x1, y1, cols, semilla, alto=4, ancho=(5, 9),
              mascara=None):
    """
    Muro de piedra con BISEL: cada sillar sobresale.

    Un bloque plano con una raya clara arriba y otra oscura abajo se lee como
    una baldosa pintada. Lo que hace el arte del juego —mirando el zocalo de
    `Game/Objetos/casa de npc arreglado.png`— es biselar los CUATRO cantos: la
    cara de arriba y la de la izquierda cogen luz, la de abajo y la de la
    derecha quedan en sombra, y las esquinas se matan. Son cuatro lineas de un
    pixel y con eso la piedra sale del muro.
    """
    cl, me, os_ = cols[0], cols[1], cols[2]
    junta = ajusta(os_, dv=0.74)
    rng = rng_de('muro', semilla)
    y = y0
    while y <= y1:
        h = min(alto, y1 - y + 1)
        corr = int(rng.random() * 6)
        x = x0 - corr
        while x <= x1:
            an = ancho[0] + int(rng.random() * (ancho[1] - ancho[0] + 1))
            tono = 0.96 + rng.random() * 0.08
            bx0, bx1 = max(x0, x + 1), min(x1, x + an - 1)
            by0, by1 = y + 1, y + h - 1
            for yy in range(y, y + h):
                for xx in range(max(x0, x), min(x1, x + an - 1) + 1):
                    if mascara is not None and not mascara.get(xx, yy):
                        continue
                    esquina = ((xx == bx0 or xx == bx1) and (yy == by0 or yy == by1))
                    if yy < by0 or xx < bx0:
                        c = junta                 # la junta entre piedras
                    elif esquina:
                        c = me
                    elif yy == by0 or xx == bx0:
                        c = cl                    # cantos al sol
                    elif yy == by1 or xx == bx1:
                        c = os_                   # cantos en sombra
                    else:
                        c = me
                    li.set(xx, yy, ajusta(c, dv=tono))
            x += an
        y += h


def _tablas(li, x0, y0, x1, y1, cols, vertical=True):
    """Pared de tablas: una junta oscura cada tres o cuatro."""
    cl, me, os_ = cols[0], cols[1], cols[2]
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            k = (x if vertical else y)
            c = me
            if k % 4 == 0:
                c = os_
            elif k % 4 == 1:
                c = cl
            li.set(x, y, c)


def _entramado(li, x0, y0, x1, y1, semilla):
    """Yeso con entramado de vigas: los postes, la solera y una cruz de San Andres."""
    cl, me, os_ = YESO
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            li.set(x, y, me if (x + y) % 7 else cl)
    vc, vm, vo = MADERA
    def viga(a, b, c, d, gr=2):
        m = Mascara(li.w, li.h)
        m.linea(a, b, c, d, gr)
        li.pintar(m, vm)
        for x, y in m.puntos():
            if not m.get(x, y - 1):
                li.set(x, y, vc)
            elif not m.get(x, y + 1):
                li.set(x, y, vo)
    viga(x0, y0, x1, y0)
    viga(x0, y1, x1, y1)
    viga(x0, y0, x0, y1)
    viga(x1, y0, x1, y1)
    mitad = (x0 + x1) // 2
    viga(mitad, y0, mitad, y1)
    viga(x0 + 2, y1 - 1, mitad - 2, y0 + 2, 1)
    viga(mitad + 2, y0 + 2, x1 - 2, y1 - 1, 1)


def ventana(li, x, y, w=9, h=9, semilla=0, redonda=False):
    """Ventana: marco de madera, cristal azul y el brillo en la esquina alta."""
    vc, vm, vo = MADERA
    m = Mascara(li.w, li.h)
    if redonda:
        m.elipse(x + w / 2.0 - 0.5, y + h / 2.0 - 0.5, w / 2.0, h / 2.0)
    else:
        m.rect(x, y, x + w - 1, y + h - 1)
    li.pintar(m, CRISTAL[1])
    for xx, yy in m.puntos():
        if (xx - x) + (yy - y) < max(2, (w + h) // 4):
            li.set(xx, yy, CRISTAL[0])
    for xx, yy in m.borde_interno(False).puntos():
        li.set(xx, yy, CRISTAL[2])
    for xx, yy in m.borde(True).puntos():
        li.set(xx, yy, vm)
    for xx in range(x - 1, x + w + 1):
        li.set(xx, y - 1, vc)
        li.set(xx, y + h, vo)
    if not redonda and w >= 7:
        for yy in range(y, y + h):
            li.set(x + w // 2, yy, vm)
    if not redonda and h >= 7:
        for xx in range(x, x + w):
            li.set(xx, y + h // 2, vm)


def puerta(li, x, y, w=9, h=14, arco=True):
    """Puerta de tablas con marco, dintel y pomo."""
    cl, me, os_ = MADERA_CLARA
    m = Mascara(li.w, li.h)
    m.rect(x, y, x + w - 1, y + h - 1)
    if arco:
        m.elipse(x + w / 2.0 - 0.5, y, w / 2.0, w / 2.0)
        for yy in range(y - w, y):
            for xx in range(x, x + w):
                if not m.get(xx, yy):
                    continue
    li.pintar(m, me)
    for xx, yy in m.puntos():
        k = xx - x
        if k % 3 == 0:
            li.set(xx, yy, os_)
        elif k % 3 == 1:
            li.set(xx, yy, cl)
    for xx, yy in m.borde(True).puntos():
        li.set(xx, yy, MADERA[1])
    li.set(x + w - 3, y + h // 2, A.hex_rgb('#e0c060'))
    li.set(x + w - 3, y + h // 2 + 1, A.hex_rgb('#9a7a20'))


def _tejas(li, m, y_alero, alto, cols, semilla):
    """
    Las tejas, en ESCAMAS.

    Las dos versiones anteriores pintaron el tejado por filas de color —primero
    hiladas de dos, despues de tres— y las dos salieron planas: un tejado a
    rayas. Una teja es una pieza curva que sobresale sobre la de abajo, asi que
    lo que hay que dibujar es una escama con su canto de arriba iluminado y su
    sombra por debajo, y las hiladas corridas media teja. Es el mismo empedrado
    que un acantilado, con la paleta del tejado y piezas mas pequenas.
    """
    cl, c2, me, c4, os_ = cols
    VOL.empedrado(li, 0, y_alero - alto + 1, li.w - 1, y_alero,
                  [c2, me, os_], semilla + 5, mascara=m, alto=4, ancho=(5, 7))
    # el caballete, un pelin mas claro
    caja = m.caja()
    if caja:
        for x in range(li.w):
            ys = [y for y in range(li.h) if m.get(x, y)]
            if ys:
                li.set(x, ys[0], cl)
    return li


def _teja(x, fila, me, c2, c4, os_):
    """
    El color de un pixel de tejado. Las tejas van en HILADAS DE TRES FILAS:

        fila de abajo   oscura  — la sombra del solape con la hilada de abajo
        fila de en medio         — el cuerpo de la teja
        fila de arriba  clara   — el lomo, que es lo que ve el sol

    y la junta vertical solo se marca en las dos de arriba, corrida dos pixeles
    por hilada. Marcandola en las tres, y con hiladas de dos, salia un damero
    que a distancia se lee como tela metalica, no como pizarra.
    """
    hilada = fila // 3
    dentro = fila % 3
    if dentro == 0:
        return os_
    c = c2 if dentro == 2 else me
    if (x + hilada * 2) % 5 == 0:
        c = c4
    return c


def _tejado_dos_aguas(li, x0, x1, y_alero, alto, cols, semilla, vuelo=2):
    """
    Tejado a dos aguas visto de frente: un triangulo de hiladas de pizarra.

    Las hiladas van de dos filas y cada una se corre media teja respecto a la de
    abajo; la junta se marca solo cada cuatro pixeles. Dibujar teja a teja a
    esta escala da una cuadricula de mosquitera.
    """
    cl, c2, me, c4, os_ = cols
    cx = (x0 + x1) / 2.0
    ancho = (x1 - x0) / 2.0 + vuelo
    m = Mascara(li.w, li.h)
    for i in range(alto):
        t = i / float(max(1, alto - 1))
        hw = ancho * t
        for x in range(int(round(cx - hw)), int(round(cx + hw)) + 1):
            m.set(x, y_alero - alto + 1 + i)
    _tejas(li, m, y_alero, alto, cols, semilla)
    # el caballete y los dos faldones
    for x, y in m.borde_interno(False).puntos():
        li.set(x, y, os_)
    for i in range(alto):
        y = y_alero - alto + 1 + i
        xs = [x for x in range(li.w) if m.get(x, y)]
        if not xs:
            continue
        li.set(xs[0], y, MADERA[1])
        li.set(xs[0] + 1, y, cl)
        li.set(xs[-1], y, MADERA[2])
    li.set(int(cx), y_alero - alto + 1, cl)
    return m


def _tejado_plano(li, x0, x1, y_alero, alto, cols, semilla, vuelo=2):
    """Tejado de un agua (cobertizo): hiladas rectas y el canto por delante."""
    cl, c2, me, c4, os_ = cols
    m = Mascara(li.w, li.h)
    m.rect(x0 - vuelo, y_alero - alto + 1, x1 + vuelo, y_alero)
    _tejas(li, m, y_alero, alto, cols, semilla)
    for x in range(x0 - vuelo, x1 + vuelo + 1):
        li.set(x, y_alero - alto + 1, cl)
        li.set(x, y_alero, MADERA[1])


def _alero(li, x0, x1, y, vuelo=2):
    """La tabla que separa muro y tejado, con su sombra debajo."""
    vc, vm, vo = MADERA
    for x in range(x0 - vuelo, x1 + vuelo + 1):
        li.set(x, y, vm)
        li.set(x, y - 1, vc)
        if li.get(x, y + 1)[3]:
            li.set(x, y + 1, ajusta(li.get(x, y + 1), dv=0.62))
        if li.get(x, y + 2)[3]:
            li.set(x, y + 2, ajusta(li.get(x, y + 2), dv=0.80))


def _chimenea(li, cx, ancho_tejado, y_alero, alto_tejado, semilla):
    """
    La chimenea, APOYADA EN EL FALDON.

    Antes se colocaba a una altura fija y quedaba flotando en el aire al lado
    del tejado, como un ladrillo suelto. Ahora se calcula donde esta la
    superficie del tejado a esa distancia del caballete —el faldon baja en linea
    recta— y el tubo arranca de ahi.
    """
    d = 0.46                                   # fraccion del faldon, del centro
    x = int(cx + ancho_tejado * d) - 3
    base = int(y_alero - alto_tejado * (1.0 - d)) + 1
    tope = base - max(5, int(alto_tejado * 0.55))
    _sillares(li, x, tope, x + 6, base, PIEDRA, semilla, alto=3, ancho=(3, 4))
    for xx in range(x - 1, x + 8):
        li.set(xx, tope - 1, PIEDRA[2])
        li.set(xx, tope, PIEDRA[0])
    for xx in range(x + 1, x + 6):
        li.set(xx, tope - 1, A.hex_rgb('#1a1a1e'))


def _contornea(li, color=NEGRO):
    m = li.mascara_opaca()
    for x, y in m.borde(True).puntos():
        li.set(x, y, color)
    return li


# ===========================================================================
# CASAS
# ===========================================================================

def casa(w, h, semilla=0, pisos=1, muro='piedra', tejado='pizarra',
         ventanas=2, chimenea=True, letrero=None, porche=False):
    """
    Una casa entera: zocalo, muro, alero, tejado y los huecos.

    `w` y `h` son el lienzo; la casa se dibuja apoyada abajo y centrada.
    """
    li = Lienzo(w, h)
    cols_t = TEJADOS[tejado]
    x0, x1 = 3, w - 4
    suelo = h - 1
    alto_tejado = max(8, int(h * (0.34 if pisos == 1 else 0.26)))
    y_alero = suelo - (h - alto_tejado - 3)
    alto_muro = suelo - y_alero
    zocalo = max(3, alto_muro // 6)

    # --- muro ---------------------------------------------------------------
    if muro == 'yeso':
        _entramado(li, x0, y_alero + 1, x1, suelo - zocalo, semilla)
    elif muro == 'tabla':
        _tablas(li, x0, y_alero + 1, x1, suelo - zocalo, MADERA_CLARA)
    else:
        _sillares(li, x0, y_alero + 1, x1, suelo - zocalo, PIEDRA, semilla)
    _sillares(li, x0, suelo - zocalo + 1, x1, suelo, PIEDRA, semilla + 3,
              alto=max(3, zocalo), ancho=(6, 10))

    # --- huecos --------------------------------------------------------------
    ph = min(16, max(11, alto_muro - zocalo - 4))
    pw = max(7, min(11, (x1 - x0) // 4))
    px = (x0 + x1) // 2 - pw // 2
    puerta(li, px, suelo - zocalo - ph + 1, pw, ph)
    vh = min(10, max(7, ph - 4))
    vw = vh
    sitios = []
    hueco = (x1 - x0 + 1)
    if ventanas >= 1:
        sitios.append(x0 + max(2, hueco // 8))
    if ventanas >= 2:
        sitios.append(x1 - max(2, hueco // 8) - vw + 1)
    if ventanas >= 3:
        sitios.append((x0 + x1) // 2 - vw // 2)
    for i, vx in enumerate(sitios[:2]):
        ventana(li, vx, suelo - zocalo - ph + 2, vw, vh, semilla + i)
    if pisos == 2:
        # el piso de arriba: una franja mas con sus ventanas
        y2 = y_alero + 1
        for i, vx in enumerate(sitios[:2]):
            ventana(li, vx, y2 + 3, vw, vh, semilla + 10 + i)
        media = suelo - zocalo - ph - 3
        for x in range(x0, x1 + 1):
            li.set(x, media, MADERA[1])
            li.set(x, media - 1, MADERA[0])

    # --- alero y tejado -------------------------------------------------------
    _alero(li, x0, x1, y_alero)
    if porche:
        _tejado_plano(li, x0, x1, y_alero, alto_tejado, cols_t, semilla)
    else:
        _tejado_dos_aguas(li, x0, x1, y_alero, alto_tejado, cols_t, semilla)
        if ventanas >= 3:
            ventana(li, (x0 + x1) // 2 - 3, y_alero - alto_tejado // 2 - 2, 6, 6,
                    semilla, redonda=False)
    if chimenea:
        _chimenea(li, (x0 + x1) / 2.0, (x1 - x0) / 2.0 + 2, y_alero,
                  alto_tejado, semilla)
    if letrero:
        _letrero(li, (x0 + x1) // 2, y_alero + 3, letrero)
    _contornea(li)
    return li


def _letrero(li, cx, y, clave):
    """Un cartel colgado del alero con un simbolo, no con letras."""
    cl, me, os_ = MADERA_CLARA
    w, hh = 16, 9
    x = cx - w // 2
    for yy in range(y, y + hh):
        for xx in range(x, x + w):
            li.set(xx, yy, me if (yy - y) % 3 else cl)
    for xx in range(x, x + w):
        li.set(xx, y + hh - 1, os_)
    for yy in range(y - 2, y):
        li.set(x + 2, yy, MADERA[2])
        li.set(x + w - 3, yy, MADERA[2])
    simbolos = {
        'tienda': [(4, 3), (5, 2), (6, 3), (7, 2), (8, 3), (9, 4), (6, 5), (7, 5)],
        'herreria': [(4, 5), (5, 4), (6, 3), (7, 3), (8, 4), (9, 5), (10, 5), (5, 6)],
        'posada': [(5, 2), (6, 2), (7, 2), (8, 2), (5, 3), (5, 4), (5, 5), (9, 3),
                   (9, 4), (9, 5), (6, 4), (7, 4), (8, 4)],
        'pociones': [(6, 2), (7, 2), (6, 3), (7, 3), (5, 4), (8, 4), (5, 5), (8, 5),
                     (6, 6), (7, 6)],
        'granja': [(4, 5), (5, 4), (6, 3), (7, 2), (8, 3), (9, 4), (10, 5), (7, 4),
                   (7, 5)],
    }
    tinta = A.hex_rgb('#2a1a12')
    for dx, dy in simbolos.get(clave, simbolos['tienda']):
        li.set(x + dx, y + dy, tinta)


def cabana(w, h, semilla=0):
    """Cabana de troncos con tejado de paja."""
    li = Lienzo(w, h)
    x0, x1 = 3, w - 4
    suelo = h - 1
    alto_tejado = max(9, int(h * 0.42))
    y_alero = suelo - (h - alto_tejado - 2)
    cl, me, os_ = MADERA_CLARA
    for y in range(y_alero + 1, suelo + 1):
        for x in range(x0, x1 + 1):
            k = (y - y_alero) % 4
            c = me if k else os_
            if k == 1:
                c = cl
            li.set(x, y, c)
        li.set(x0, y, os_)
        li.set(x1, y, os_)
    ph = min(15, suelo - y_alero - 2)
    pw = 9
    puerta(li, (x0 + x1) // 2 - pw // 2, suelo - ph + 1, pw, ph)
    ventana(li, x0 + 3, y_alero + 4, 7, 7, semilla)
    ventana(li, x1 - 9, y_alero + 4, 7, 7, semilla + 1)
    _alero(li, x0, x1, y_alero)
    _tejado_dos_aguas(li, x0, x1, y_alero, alto_tejado, PAJA, semilla, vuelo=3)
    _contornea(li)
    return li


def torre(w, h, semilla=0):
    """Una torre de piedra con almenas y tejado conico."""
    li = Lienzo(w, h)
    x0, x1 = 2, w - 3
    suelo = h - 1
    cuerpo = int(h * 0.72)
    _sillares(li, x0, h - cuerpo, x1, suelo, PIEDRA, semilla, alto=4, ancho=(5, 8))
    ventana(li, (x0 + x1) // 2 - 3, h - cuerpo + 6, 6, 8, semilla, redonda=True)
    ventana(li, (x0 + x1) // 2 - 3, h - cuerpo + 20, 6, 8, semilla + 1, redonda=True)
    ph = 13
    puerta(li, (x0 + x1) // 2 - 4, suelo - ph + 1, 8, ph)
    # almenas
    y = h - cuerpo - 1
    for x in range(x0 - 1, x1 + 2):
        li.set(x, y, PIEDRA[0])
        li.set(x, y + 1, PIEDRA[2])
    for x in range(x0 - 1, x1 + 2):
        if ((x - x0 + 1) // 3) % 2 == 0:
            li.set(x, y - 1, PIEDRA[1])
            li.set(x, y - 2, PIEDRA[0])
    _tejado_dos_aguas(li, x0 + 1, x1 - 1, y - 3, max(8, int(h * 0.20)), PIZARRA,
                      semilla, vuelo=1)
    _contornea(li)
    return li


def molino(w, h, semilla=0):
    """Molino: torre troncoconica de piedra y cuatro aspas."""
    li = Lienzo(w, h)
    suelo = h - 1
    cuerpo = int(h * 0.62)
    cx = w // 2
    tronco = Mascara(w, h)
    for i in range(cuerpo):
        t = i / float(cuerpo - 1)
        hw = w * (0.36 - 0.14 * t)      # ANCHO ABAJO: es un tronco de cono
        y = suelo - i
        for x in range(int(cx - hw), int(cx + hw) + 1):
            tronco.set(x, y)
    _sillares(li, 0, suelo - cuerpo, w - 1, suelo, PIEDRA, semilla, alto=4,
              ancho=(4, 7), mascara=tronco)
    for x, y in tronco.puntos():
        if not tronco.get(x - 1, y):
            li.set(x, y, PIEDRA[0])
        elif not tronco.get(x + 1, y):
            li.set(x, y, PIEDRA[2])
    ph = 12
    puerta(li, cx - 4, suelo - ph + 1, 8, ph)
    ventana(li, cx - 3, suelo - cuerpo + 8, 6, 6, semilla, redonda=True)
    y_alero = suelo - cuerpo
    _tejado_dos_aguas(li, int(cx - w * 0.24), int(cx + w * 0.24), y_alero,
                      max(7, int(h * 0.16)), PIZARRA, semilla, vuelo=2)
    # las aspas, con el eje justo debajo del caballete
    cyy = y_alero - int(h * 0.10)
    cl, me, os_ = MADERA_CLARA
    m = Mascara(w, h)
    for k in range(4):
        a = math.radians(30 + k * 90)
        m.linea(cx, cyy, cx + math.cos(a) * w * 0.44, cyy + math.sin(a) * w * 0.44, 2)
    li.pintar(m, me)
    for x, y in m.puntos():
        if not m.get(x, y - 1):
            li.set(x, y, cl)
    li.pintar(Mascara(w, h).disco(cx, cyy, 2.0), MADERA[1])
    _contornea(li)
    return li


def pozo(w, h, semilla=0):
    """Un pozo con su brocal, sus postes y su techadillo."""
    li = Lienzo(w, h)
    suelo = h - 1
    x0, x1 = 2, w - 3
    brocal = int(h * 0.36)
    _sillares(li, x0 + 2, suelo - brocal, x1 - 2, suelo, PIEDRA, semilla,
              alto=3, ancho=(4, 6))
    agua = Mascara(w, h).elipse(w / 2.0, suelo - brocal + 1, (x1 - x0) * 0.32, 2.2)
    li.pintar(agua, A.hex_rgb('#2f6f9a'))
    for x, y in agua.borde_interno(False).puntos():
        li.set(x, y, A.hex_rgb('#1c4a6b'))
    cl, me, os_ = MADERA_CLARA
    for lado in (x0 + 3, x1 - 4):
        for y in range(int(h * 0.22), suelo - brocal + 1):
            li.set(lado, y, me)
            li.set(lado + 1, y, os_)
    _tejado_dos_aguas(li, x0 + 1, x1 - 1, int(h * 0.24), max(6, int(h * 0.26)),
                      PAJA, semilla, vuelo=2)
    for x in range(x0 + 4, x1 - 3):
        li.set(x, int(h * 0.30), MADERA[1])
    li.set(w // 2, int(h * 0.30) + 1, METAL[1])
    li.set(w // 2, int(h * 0.30) + 2, METAL[1])
    li.set(w // 2, int(h * 0.30) + 3, MADERA_CLARA[1])
    _contornea(li)
    return li


# ===========================================================================
# COSAS PEQUENAS
# ===========================================================================

def valla(w, h, semilla=0, esquina=False, puerta_=False):
    """Valla de madera: dos travesanos y los postes."""
    li = Lienzo(w, h)
    cl, me, os_ = MADERA_CLARA
    y1, y2 = int(h * 0.42), int(h * 0.70)
    for x in range(w):
        li.set(x, y1, me); li.set(x, y1 + 1, os_)
        li.set(x, y2, me); li.set(x, y2 + 1, os_)
    for x in range(1, w, 7):
        for y in range(int(h * 0.28), h - 1):
            li.set(x, y, me)
            li.set(x + 1, y, cl)
            li.set(x + 2, y, os_)
        li.set(x + 1, int(h * 0.28) - 1, cl)
    if esquina:
        for y in range(int(h * 0.28), h - 1):
            li.set(w // 2, y, me); li.set(w // 2 + 1, y, cl)
    if puerta_:
        for i in range(6):
            li.set(w // 2 - 3 + i, y1 + 2 + i, cl)
    _contornea(li, A.hex_rgb('#2a1e0c'))
    return li


def cartel(w, h, semilla=0, flecha=True):
    """Un cartel de camino."""
    li = Lienzo(w, h)
    cl, me, os_ = MADERA_CLARA
    for y in range(int(h * 0.42), h - 1):
        li.set(w // 2, y, me); li.set(w // 2 + 1, y, cl); li.set(w // 2 - 1, y, os_)
    tw, th = w - 4, max(7, int(h * 0.32))
    x, y = 2, 2
    for yy in range(y, y + th):
        for xx in range(x, x + tw):
            li.set(xx, yy, me if (yy - y) % 3 else cl)
    for xx in range(x, x + tw):
        li.set(xx, y + th - 1, os_)
    if flecha:
        for i in range(4):
            li.set(x + tw - 1 - i, y + th // 2 - i, os_)
            li.set(x + tw - 1 - i, y + th // 2 + i, os_)
    for yy in range(y + 2, y + th - 2, 2):
        for xx in range(x + 2, x + tw - 5):
            li.set(xx, yy, A.hex_rgb('#3a2a18'))
    _contornea(li, A.hex_rgb('#2a1e0c'))
    return li


def barril(w, h, semilla=0):
    li = Lienzo(w, h)
    cl, me, os_ = MADERA_CLARA
    m = Mascara(w, h)
    for y in range(h):
        t = y / float(h - 1)
        hw = w * (0.34 + 0.12 * math.sin(math.pi * t))
        for x in range(int(w / 2.0 - hw), int(w / 2.0 + hw) + 1):
            m.set(x, y)
    li.pintar(m, me)
    for x, y in m.puntos():
        if not m.get(x - 1, y):
            li.set(x, y, cl)
        elif not m.get(x + 1, y):
            li.set(x, y, os_)
        elif (x + 1) % 4 == 0:
            li.set(x, y, ajusta(me, dv=0.9))
    for y in (int(h * 0.18), int(h * 0.76)):
        for x in range(w):
            if m.get(x, y):
                li.set(x, y, METAL[1])
                li.set(x, y + 1, METAL[2])
    tapa = Mascara(w, h).elipse(w / 2.0, 1.5, w * 0.34, 1.8)
    li.pintar(tapa, mezcla(cl, (255, 240, 210), 0.3))
    _contornea(li, A.hex_rgb('#2a1e0c'))
    return li


def caja(w, h, semilla=0):
    li = Lienzo(w, h)
    cl, me, os_ = MADERA_CLARA
    for y in range(h):
        for x in range(w):
            li.set(x, y, me if (y % 4) else cl)
    for x in range(w):
        li.set(x, 0, cl); li.set(x, h - 1, os_)
    for y in range(h):
        li.set(0, y, cl); li.set(w - 1, y, os_)
    for i in range(min(w, h)):
        li.set(i * (w - 1) // max(1, min(w, h) - 1), i * (h - 1) // max(1, min(w, h) - 1), os_)
    _contornea(li, A.hex_rgb('#2a1e0c'))
    return li


def farola(w, h, semilla=0):
    li = Lienzo(w, h)
    cx = w // 2
    for y in range(int(h * 0.26), h - 1):
        li.set(cx, y, METAL[1]); li.set(cx - 1, y, METAL[0]); li.set(cx + 1, y, METAL[2])
    for x in range(cx - 3, cx + 4):
        li.set(x, h - 2, METAL[2]); li.set(x, h - 1, METAL[2])
    m = Mascara(w, h)
    m.rect(cx - 3, int(h * 0.10), cx + 3, int(h * 0.26))
    li.pintar(m, A.hex_rgb('#f0d06a'))
    for x, y in m.borde_interno(False).puntos():
        li.set(x, y, METAL[2])
    li.pintar(Mascara(w, h).disco(cx, int(h * 0.18), 1.6), A.hex_rgb('#fff6c0'))
    for x in range(cx - 4, cx + 5):
        li.set(x, int(h * 0.10) - 1, METAL[2])
    li.set(cx, int(h * 0.10) - 2, METAL[1])
    _contornea(li)
    return li


def banco(w, h, semilla=0):
    li = Lienzo(w, h)
    cl, me, os_ = MADERA_CLARA
    asiento = int(h * 0.52)
    for x in range(w):
        li.set(x, asiento, cl); li.set(x, asiento + 1, me); li.set(x, asiento + 2, os_)
    for x in range(w):
        li.set(x, int(h * 0.16), cl); li.set(x, int(h * 0.16) + 1, os_)
        li.set(x, int(h * 0.30), me); li.set(x, int(h * 0.30) + 1, os_)
    for x in (1, w - 3):
        for y in range(int(h * 0.14), h - 1):
            li.set(x, y, me); li.set(x + 1, y, os_)
    _contornea(li, A.hex_rgb('#2a1e0c'))
    return li


def hoguera(w, h, semilla=0):
    li = Lienzo(w, h)
    cl, me, os_ = MADERA_CLARA
    for k, (dx, dy) in enumerate(((-1, 0), (1, 0), (0, 1))):
        m = Mascara(w, h)
        m.linea(w / 2.0 - 4 * (1 if k % 2 else -1), h - 2,
                w / 2.0 + 3 * (1 if k % 2 else -1), h - 6, 2)
        li.pintar(m, me)
        for x, y in m.puntos():
            if not m.get(x, y - 1):
                li.set(x, y, cl)
    fuego = Mascara(w, h)
    for i in range(3):
        fuego.disco(w / 2.0 + (i - 1) * 2.2, h - 7 - i * 1.6, 2.6 - i * 0.5)
    li.pintar(fuego, A.hex_rgb('#e8621c'))
    for x, y in fuego.borde_interno(False).puntos():
        li.set(x, y, A.hex_rgb('#a8280c'))
    li.pintar(Mascara(w, h).disco(w / 2.0, h - 9, 1.4), A.hex_rgb('#f8d24a'))
    for i in range(3):
        li.set(w / 2.0 - 3 + i * 3, h - 12 - i, A.hex_rgb('#f8d24a'))
    piedras = PIEDRA
    for i in range(5):
        x = 1 + i * (w - 3) // 4
        li.set(x, h - 1, piedras[1]); li.set(x + 1, h - 1, piedras[2])
        li.set(x, h - 2, piedras[0])
    _contornea(li)
    return li


def puente(w, h, semilla=0, vertical=False):
    """Un puente de tablas con barandilla."""
    li = Lienzo(w, h)
    cl, me, os_ = MADERA_CLARA
    if vertical:
        for y in range(h):
            for x in range(3, w - 3):
                li.set(x, y, me if y % 4 else cl)
                if y % 4 == 3:
                    li.set(x, y, os_)
        for x in (2, w - 3):
            for y in range(h):
                li.set(x, y, me)
                li.set(x + 1 if x == 2 else x - 1, y, cl)
        for y in range(0, h, 6):
            for x in (1, w - 2):
                li.set(x, y, os_); li.set(x, y + 1, os_)
    else:
        for y in range(3, h - 3):
            for x in range(w):
                li.set(x, y, me if x % 4 else cl)
                if x % 4 == 3:
                    li.set(x, y, os_)
        for y in (2, h - 3):
            for x in range(w):
                li.set(x, y, me)
                li.set(x, y + 1 if y == 2 else y - 1, cl)
        for x in range(0, w, 6):
            for y in (1, h - 2):
                li.set(x, y, os_); li.set(x + 1, y, os_)
    _contornea(li, A.hex_rgb('#2a1e0c'))
    return li


def espantapajaros(w, h, semilla=0):
    li = Lienzo(w, h)
    cl, me, os_ = MADERA_CLARA
    cx = w // 2
    for y in range(int(h * 0.22), h - 1):
        li.set(cx, y, me); li.set(cx + 1, y, os_)
    for x in range(2, w - 2):
        li.set(x, int(h * 0.44), me); li.set(x, int(h * 0.44) + 1, os_)
    ropa = R('#7a5a8a', '#59406a', '#3a2a48')
    m = Mascara(w, h)
    m.rect(cx - 5, int(h * 0.40), cx + 5, int(h * 0.74))
    li.pintar(m, ropa[1])
    for x, y in m.puntos():
        if not m.get(x - 1, y):
            li.set(x, y, ropa[0])
        elif not m.get(x + 1, y):
            li.set(x, y, ropa[2])
    cab = Mascara(w, h).disco(cx, int(h * 0.30), 4.2)
    li.pintar(cab, A.hex_rgb('#d8bc70'))
    for x, y in cab.borde_interno(False).puntos():
        li.set(x, y, A.hex_rgb('#9a7c30'))
    li.set(cx - 2, int(h * 0.29), NEGRO); li.set(cx + 2, int(h * 0.29), NEGRO)
    for x in range(cx - 6, cx + 7):
        li.set(x, int(h * 0.30) - 5, A.hex_rgb('#9a7c30'))
        li.set(x, int(h * 0.30) - 4, A.hex_rgb('#c0a050'))
    for x in range(cx - 4, cx + 5):
        li.set(x, int(h * 0.30) - 8, A.hex_rgb('#c0a050'))
    for lado in (-1, 1):
        for k in range(3):
            li.set(cx + lado * (6 + k), int(h * 0.44) + 2 + k, A.hex_rgb('#d8bc70'))
    _contornea(li)
    return li


def pila_lena(w, h, semilla=0):
    li = Lienzo(w, h)
    cl, me, os_ = MADERA_CLARA
    rng = rng_de('lena', semilla)
    filas = max(2, h // 5)
    for f in range(filas):
        y = h - 2 - f * 4
        n = max(2, (w - 2) // 5 - f // 2)
        for i in range(n):
            x = 1 + i * 5 + f
            m = Mascara(w, h).elipse(x + 2, y - 1, 2.4, 1.8)
            li.pintar(m, mezcla(cl, (255, 240, 210), 0.25))
            for xx, yy in m.borde_interno(False).puntos():
                li.set(xx, yy, os_)
            li.set(x + 2, y - 1, me)
    _contornea(li, A.hex_rgb('#2a1e0c'))
    return li


def tienda_campana(w, h, semilla=0):
    """Una tienda de campana de lona."""
    li = Lienzo(w, h)
    lona = R('#d8c8a0', '#b0a078', '#7a6c50')
    cx = w / 2.0
    m = Mascara(w, h)
    for y in range(int(h * 0.18), h - 1):
        t = (y - h * 0.18) / float(h * 0.82)
        hw = w * 0.46 * t
        for x in range(int(cx - hw), int(cx + hw) + 1):
            m.set(x, y)
    li.pintar(m, lona[1])
    for x, y in m.puntos():
        if x < cx:
            li.set(x, y, lona[0] if (x + y) % 6 else lona[1])
        else:
            li.set(x, y, lona[2] if (x + y) % 6 == 0 else lona[1])
    boca = Mascara(w, h)
    for y in range(int(h * 0.48), h - 1):
        t = (y - h * 0.48) / float(h * 0.52)
        hw = w * 0.14 * t
        for x in range(int(cx - hw), int(cx + hw) + 1):
            boca.set(x, y)
    li.pintar(boca, A.hex_rgb('#3a3026'))
    for x, y in m.borde_interno(False).puntos():
        li.set(x, y, lona[2])
    li.set(int(cx), int(h * 0.16), MADERA_CLARA[1])
    li.set(int(cx), int(h * 0.14), MADERA_CLARA[0])
    _contornea(li, A.hex_rgb('#2a241a'))
    return li
