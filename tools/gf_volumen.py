#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
GF VOLUMEN — las recetas con las que el juego finge las tres dimensiones
=============================================================================

El arte de Grassland Forest se ve de arriba, pero **no es plano**. Todo lo que
se dibuja tiene bulto: los cantos rodados de un acantilado, el borde de un
prado que asoma por encima de la tierra, la copa de un arbusto, la tapa de un
barril. Un tileset dibujado con colores lisos y una raya de contorno se ve de
otro juego aunque los colores sean los mismos — que es exactamente lo que
pasaba con los primeros tilesets del pack.

Aqui estan las cuatro recetas, sacadas de mirar los tilesets del propio juego
(`Game/MAPAS/montañas tiled original.png`, `tiles.png`, `Tileset_Ground.png`) y
sus objetos (`Game/Objetos/arbusto solo.png`, `barril.png`, `Fuente_de_agua.png`).

LA LUZ VIENE DE ARRIBA, UN POCO A LA IZQUIERDA
---------------------------------------------------------------------------
En todo el arte del juego. Por eso cada bulto lleva la cara de arriba clara y
una media luna oscura abajo a la derecha: son dos marcas, no un degradado.

1. EL CANTO RODADO  (`guijarro`, `empedrado`)
---------------------------------------------------------------------------
Un acantilado del juego no es una pared de sillares: es un **muro de cantos
rodados**. Elipses de unos 8x6 px, en hiladas corridas media piedra, cada una
con la coronilla clara y una media luna oscura por debajo. Las hiladas de abajo
se dibujan DESPUES, asi que solapan a las de arriba y sale la escama.

    #b18569  la coronilla     #a36543  el cuerpo     #774931  la media luna

2. EL FLECO DE HIERBA  (`fleco`)
---------------------------------------------------------------------------
Donde el prado se acaba y empieza la tierra, el juego NO pinta una raya. Pinta
tres cosas, y ese es el truco entero:

    a) el canto del terreno de dentro, casi recto (no una onda);
    b) una linea OSCURA de un pixel por el lado de fuera: la sombra que echa el
       borde del prado, que es lo que dice que la hierba esta MAS ALTA;
    c) matojos de dos o tres pixeles del tono claro de dentro, que caen POR
       ENCIMA de esa linea, sobre el terreno de fuera.

Sin (b) el borde se lee como un cambio de pintura; sin (c) se lee como un
recorte de cartulina. Con las dos, se lee como un escalon de hierba.

3. LA COPA DE BULTOS  (`domo`, `lobulos_sombreados`)
---------------------------------------------------------------------------
`arbusto solo.png` y `arbusto de flores.png` no tienen brochazos: tienen
**bultos**. La copa es un racimo de discos y CADA disco se sombrea como una
bolita —arco claro arriba a la izquierda, cuerpo, arco oscuro abajo a la
derecha—, de modo que la silueta sale festoneada y el interior parece brocoli.
Encima de eso, el conjunto entero se aclara por arriba y se oscurece por abajo.

4. LA TAPA  (`tapa`, `cilindro`)
---------------------------------------------------------------------------
Barriles, pozos, vasijas y macetas del juego enseñan **la cara de arriba**: una
elipse aplastada con su borde. Es lo que convierte un rectangulo en un objeto.
"""

import math

import gf_arte as A
from gf_arte import Mascara, Lienzo, mezcla, ajusta, rng_de


# ===========================================================================
# 1. BULTOS
# ===========================================================================

def domo(li, m, cols, luz=(-0.45, -1.0)):
    """
    Sombrea una mascara como si fuera una bolita: arco claro por donde entra la
    luz, cuerpo, arco oscuro por el lado contrario.

    No es un degradado. Son TRES tonos y dos arcos de un pixel, que es lo que
    hace el arte del juego; un degradado de verdad a este tamano se ve sucio y
    ademas mete colores que no estan en la paleta.
    """
    cl, me, os_ = cols[0], cols[1], cols[2]
    li.pintar(m, me)
    lx, ly = luz
    for x, y in m.puntos():
        fuera_luz = not m.get(x + (1 if lx > 0 else -1), y) or not m.get(x, y + (1 if ly > 0 else -1))
        fuera_som = not m.get(x - (1 if lx > 0 else -1), y) or not m.get(x, y - (1 if ly > 0 else -1))
        if fuera_luz:
            li.set(x, y, cl)
        elif fuera_som:
            li.set(x, y, os_)
    return li


def guijarro(li, cx, cy, rx, ry, cols, media_luna=True):
    """
    Un canto rodado: elipse, coronilla clara y media luna oscura por debajo.

    Es la pieza con la que se construye un acantilado entero. Se dibuja SIN
    contorno negro: lo que separa una piedra de la siguiente es la media luna
    oscura de la de arriba, igual que en `montañas tiled original.png`.
    """
    cl, me, os_ = cols[0], cols[1], cols[2]
    m = Mascara(li.w, li.h).elipse(cx, cy, rx, ry)
    li.pintar(m, me)
    for x, y in m.puntos():
        if not m.get(x, y - 1) or not m.get(x - 1, y - 1):
            li.set(x, y, cl)
    if media_luna:
        for x, y in m.puntos():
            if not m.get(x, y + 1) or not m.get(x + 1, y + 1):
                li.set(x, y, os_)
    return m


def empedrado(li, x0, y0, x1, y1, cols, semilla, mascara=None, alto=5,
              ancho=(7, 10), periodo=None):
    """
    Un muro de cantos rodados: hiladas corridas media piedra.

    Las de abajo se pintan DESPUES para que solapen a las de arriba; asi la
    media luna oscura de cada piedra queda tapada justo donde empieza la de
    debajo, y sale la escama. Pintandolas al reves salen anillos sueltos.

    `periodo` ES LO QUE HACE QUE UN TILESET NO TENGA COSTURAS. Un tile de pared
    se repite pegado a si mismo, asi que una piedra que empieza en el pixel 13
    tiene que continuar en el 0 del tile siguiente. Repartiendo los anchos de
    cada hilada para que sumen EXACTAMENTE `periodo` y dibujando cada piedra
    tres veces —en su sitio, un periodo a la izquierda y otro a la derecha— la
    piedra cortada por el canto aparece entera al juntar dos tiles. Sin esto,
    un acantilado sale con una raya oscura cada dieciseis pixeles, que es lo
    que delata al ojo que aquello son baldosas y no una pared.

    La altura de hilada tambien tiene que dividir al periodo (con `alto`=5 el
    paso es 4, y 4 divide a 16) para que la pared encaje tambien hacia abajo.
    """
    rng = rng_de('empedrado', semilla)
    per = periodo
    paso = max(2, alto - 1)
    # EL RELLENO DE FONDO NO SE PUEDE QUITAR. Entre dos elipses pegadas por el
    # costado queda un rombo sin pintar: puestas en hiladas, esos rombos son
    # una rejilla de agujeros por la que se ve el suelo, y la pared sale
    # calada. Se rellena antes con el tono medio y las piedras se solapan dos
    # pixeles, asi que no queda hueco por ningun lado.
    for y in range(max(0, y0), min(li.h, y1 + 1)):
        for x in range(max(0, x0), min(li.w, x1 + 1)):
            if mascara is None or mascara.get(x, y):
                li.set(x, y, cols[1])
    y = y0 - 1
    fila = 0
    while y <= y1 + alto:
        if per:
            anchos = _reparte(per, semilla + fila * 7, ancho[0], ancho[1])
        else:
            anchos = [ancho[0] + int(rng.random() * (ancho[1] - ancho[0] + 1))
                      for _ in range(int((x1 - x0) / ancho[0]) + 3)]
        corr = (fila % 2) * (anchos[0] // 2)
        piedras = []
        x = x0 - corr
        for k, an in enumerate(anchos):
            piedras.append((x, an, 0.96 + rng.random() * 0.08,
                            (rng.random() - 0.5) * 1.1))
            x += an
        repes = [0] if not per else range(-per, li.w + per + 1, per)
        for desp in repes:
            for (px, an, tono, dy) in piedras:
                rx = (an + 2.0) / 2.0          # se solapan dos pixeles
                # el alto de la piedra sale del PASO de hilada, no del alto
                # nominal: con piedras mas altas que el paso, cada hilada
                # se come la de arriba y solo sobreviven los arcos, que a
                # distancia es un moteado y no un muro
                ry = paso / 2.0 + 0.6
                cx = px + desp + an / 2.0
                if cx < -an or cx > li.w + an:
                    continue
                c = [ajusta(k, dv=tono) for k in cols[:3]]
                m = Mascara(li.w, li.h).elipse(cx, y + ry + dy, rx, ry)
                if mascara is not None:
                    m.intersecar(mascara)
                if not m.cuenta():
                    continue
                _piedra(li, m, cx, y + ry + dy, rx, ry, c)
        y += paso
        fila += 1
    return li


def _piedra(li, m, cx, cy, rx, ry, cols):
    """
    Sombrea un canto rodado POR GEOMETRIA, no mirando a los vecinos.

    Parece un detalle y no lo es. Mirando si el pixel de al lado esta dentro de
    la mascara, un canto cortado por el canto del lienzo —que es lo que le pasa
    a media piedra en cada tile de una pared— se cree que ahi tiene borde y se
    pinta el arco claro o el oscuro contra el aire. Repetido tile tras tile,
    eso dibuja una raya vertical cada dieciseis pixeles: la costura que delata
    que la pared son baldosas.

    Calculando la posicion del pixel DENTRO de la elipse (y no en la mascara),
    la piedra se sombrea igual este cortada o no, y las dos mitades casan al
    juntar los dos tiles.
    """
    cl, me, os_ = cols[0], cols[1], cols[2]
    coron = mezcla(cl, me, 0.40)
    sombra = mezcla(os_, me, 0.30)
    for x, y in m.puntos():
        u = (x + 0.5 - cx) / max(0.5, rx)
        v = (y + 0.5 - cy) / max(0.5, ry)
        # MANDA LA VERTICAL. La luz del juego viene de arriba, asi que lo que
        # marca un canto rodado es una banda clara ARRIBA y una media luna
        # oscura ABAJO: dos arcos horizontales. Dejando que pesara tambien la
        # horizontal salian rayas claras verticales por el costado de cada
        # piedra, que se leen como aranazos y no como bulto.
        if v < -0.34:
            li.set(x, y, coron if u > -0.55 else mezcla(coron, cl, 0.5))
        elif v > 0.30:
            li.set(x, y, os_ if v > 0.58 else sombra)
        else:
            li.set(x, y, me if u < 0.45 else sombra)
        # LA JUNTA. Sin una linea oscura en el costado izquierdo de cada
        # piedra, dos piedras seguidas de la misma hilada —que se solapan a
        # proposito para que no queden huecos— se funden en una banda larga y
        # la pared se lee como listones horizontales, no como cantos.
        if u < -0.70:
            li.set(x, y, os_)


def _reparte(total, semilla, minimo, maximo):
    """Trozos de entre `minimo` y `maximo` que suman EXACTAMENTE `total`."""
    trozos = []
    queda = total
    i = 0
    while queda > 0:
        if queda <= maximo:
            trozos.append(queda)
            break
        n = minimo + int(rng_de('rep', semilla, i).random() * (maximo - minimo + 1))
        n = min(n, queda - minimo)
        trozos.append(max(minimo, n))
        queda -= trozos[-1]
        i += 1
    return trozos


def lobulos(w, h, cx, cy, rx, ry, n, semilla, achata=1.0):
    """
    Un racimo de discos repartidos por una elipse: la silueta de una copa.

    Los centros van por el ANGULO DE ORO (2.39996 rad por paso), como las
    semillas de un girasol: reparte sin dejar huecos ni apelotonarlos, que es
    lo que pasaba sorteandolos con un dado.
    """
    m = Mascara(w, h)
    discos = []
    rng = rng_de('lobulos', semilla)
    for i in range(n):
        t = (i + 0.5) / float(n)
        ang = i * 2.39996 + semilla * 0.37
        d = math.sqrt(t)
        dx = math.cos(ang) * rx * d * 0.66
        dy = math.sin(ang) * ry * d * 0.66 * achata
        r = (0.50 - 0.16 * d) * min(rx, ry) * (0.86 + rng.random() * 0.34)
        r = max(2.4, r)
        m.disco(cx + dx, cy + dy, r)
        discos.append((cx + dx, cy + dy, r))
    m.elipse(cx, cy, rx * 0.70, ry * 0.70 * achata)
    return m, discos


def lobulos_sombreados(li, m, discos, cols, semilla, luz=(-0.45, -1.0)):
    """
    El follaje del juego: bultos, pero SOLO donde se notan.

    Primer intento: sombrear cada disco del racimo con su arco claro arriba y
    su media luna oscura abajo. Sale mal, y de una manera muy concreta: como
    los centros se reparten por el angulo de oro (una espiral), los arcos de
    los discos de dentro encadenan unos con otros y dibujan una ESPIRAL sobre
    la copa. De lejos parece una huella dactilar, no una hoja.

    Lo que hace el arte del juego (`Game/Objetos/arbusto solo.png`) es otra
    cosa: el bulto se ve en el CANTO —la silueta festoneada, cada lobulo con su
    arco— y el interior es mata suelta, manchas de dos o tres pixeles de verde
    claro y verde oscuro. Asi que:

        * a los discos que TOCAN la silueta se les pinta el arco entero;
        * a los de dentro, solo una manchita clara arriba a la izquierda o una
          oscura abajo a la derecha, segun donde caigan;
        * y encima, la coronilla de toda la copa clara y el bajo oscuro, que es
          donde se apoya en el tronco.
    """
    cl, me, os_ = cols[0], cols[1], cols[2]
    medio_claro = mezcla(cl, me, 0.45)
    medio_oscuro = mezcla(os_, me, 0.40)
    li.pintar(m, me)
    caja = m.caja()
    if caja is None:
        return li
    x0, y0, x1, y1 = caja
    an = float(max(1, x1 - x0))
    al = float(max(1, y1 - y0))
    canto = m.borde_interno(True)
    rng = rng_de('bultos', semilla)

    for (dx, dy, r) in discos:
        d = Mascara(li.w, li.h).disco(dx, dy, r)
        d.intersecar(m)
        if d.cuenta() < 3:
            continue
        toca = any(canto.get(x, y) for x, y in d.puntos())
        u = (dx - x0) / an
        v = (dy - y0) / al
        if toca:
            for x, y in d.puntos():
                if not d.get(x, y - 1) or not d.get(x - 1, y - 1):
                    li.set(x, y, medio_claro if v > 0.34 else cl)
                elif not d.get(x, y + 1) or not d.get(x + 1, y + 1):
                    li.set(x, y, os_ if v > 0.30 else medio_oscuro)
        else:
            claro = (1.0 - u) * 0.42 + (1.0 - v) * 0.58 > 0.52
            col = medio_claro if claro else medio_oscuro
            off = -r * 0.34 if claro else r * 0.34
            p = Mascara(li.w, li.h).disco(dx + off * 0.8, dy + off, r * 0.46)
            p.intersecar(m)
            li.pintar(p, col)

    for x in range(li.w):
        ys = [y for y in range(li.h) if m.get(x, y)]
        if not ys:
            continue
        if (ys[0] - y0) / al < 0.30:
            li.set(x, ys[0], cl)
        li.set(x, ys[-1], os_)
        if len(ys) > 4 and (ys[-1] - y0) / al > 0.72:
            li.set(x, ys[-1] - 1, mezcla(os_, me, 0.35))
    return li


# ===========================================================================
# 2. EL FLECO DE HIERBA
# ===========================================================================

def escalones(largo, semilla, amp=1, minimo=3, maximo=7):
    """
    Un perfil de borde a ESCALONES, no una onda.

    El juego dibuja los bordes de terreno casi rectos, con saltos secos. Una
    onda senoidal deja un festoneado regular que, repetido tile tras tile, se
    lee como el borde de un tapete. Los tramos suman exactamente `largo`, asi
    que el perfil es periodico y dos tiles seguidos siguen encajando.
    """
    alturas = []
    i = 0
    queda = largo
    while queda > 0:
        n = minimo + int(A.rng_de('esc', semilla, i).random() * (maximo - minimo + 1))
        n = min(n, queda) if queda <= maximo else max(minimo, min(n, queda - minimo))
        nivel = int(A.rng_de('niv', semilla, i).random() * (2 * amp + 1)) - amp
        alturas += [nivel] * n
        queda -= n
        i += 1
    return alturas[:largo]


def fleco(li, m_dentro, claro, oscuro, semilla, densidad=0.5, largo=2):
    """
    Los matojos que la hierba echa por encima de la tierra.

    Sobre el borde de `m_dentro` se hacen dos cosas, y las dos hacen falta:

      * una linea OSCURA de un pixel POR FUERA — la sombra que proyecta el
        borde del prado. Es lo unico que dice que la hierba esta mas alta que
        la tierra. Sin ella, el limite es un cambio de pintura.
      * matojos de dos o tres pixeles del tono CLARO de dentro, caidos por
        encima de esa sombra, hacia fuera. Sin ellos, el borde es un recorte
        de cartulina.

    Medido en `montañas tiled original.png`: la sombra es `#774931` sobre
    tierra `#a36543`, y los matojos son `#4d9d53` sobre hierba `#418546`.
    """
    anillo = m_dentro.borde(False)
    rng = rng_de('fleco', semilla)
    puntos = list(anillo.puntos())
    for x, y in puntos:
        li.set(x, y, oscuro)
    for x, y in puntos:
        if rng.random() > densidad:
            continue
        # hacia donde cae el matojo: al reves de donde esta el terreno de dentro
        dx = (1 if not m_dentro.get(x + 1, y) else 0) - (1 if not m_dentro.get(x - 1, y) else 0)
        dy = (1 if not m_dentro.get(x, y + 1) else 0) - (1 if not m_dentro.get(x, y - 1) else 0)
        li.set(x, y, claro)
        n = 1 + int(rng.random() * largo)
        for k in range(1, n + 1):
            li.set(x + dx * k, y + dy * k, claro if k < n else mezcla(claro, oscuro, 0.35))
        if rng.random() < 0.4:
            li.set(x + (dy != 0 and (1 if rng.random() < 0.5 else -1) or 0),
                   y + (dx != 0 and (1 if rng.random() < 0.5 else -1) or 0), claro)
    return li


# ===========================================================================
# 3. TAPAS Y CILINDROS
# ===========================================================================

def tapa(li, cx, cy, rx, ry, cols, hueco=None):
    """
    La cara de arriba de un cilindro: una elipse aplastada con su borde.

    Es lo que convierte un rectangulo en un barril, un pozo o una vasija. Sin
    tapa, un barril visto desde arriba-delante es una caja con rayas.
    """
    cl, me, os_ = cols[0], cols[1], cols[2]
    m = Mascara(li.w, li.h).elipse(cx, cy, rx, ry)
    li.pintar(m, mezcla(cl, (255, 255, 255), 0.12))
    for x, y in m.puntos():
        if not m.get(x, y + 1):
            li.set(x, y, me)
    for x, y in m.borde_interno(False).puntos():
        li.set(x, y, os_)
    if hueco is not None:
        d = Mascara(li.w, li.h).elipse(cx, cy, rx * 0.66, ry * 0.66)
        li.pintar(d, hueco)
        for x, y in d.borde(False).puntos():
            li.set(x, y, os_)
    return m


def cilindro(li, cx, y0, y1, rx, cols, semilla=0, duelas=True):
    """Un cuerpo cilindrico visto de frente: claro a la izquierda, oscuro a la derecha."""
    cl, me, os_ = cols[0], cols[1], cols[2]
    for y in range(y0, y1 + 1):
        for x in range(int(round(cx - rx)), int(round(cx + rx)) + 1):
            u = (x - (cx - rx)) / max(1.0, 2.0 * rx)
            c = me
            if u < 0.22:
                c = cl
            elif u > 0.78:
                c = os_
            if duelas and int(round(x)) % 4 == 0:
                c = ajusta(c, dv=0.88)
            li.set(x, y, c)
    return li
