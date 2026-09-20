#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
ANIMACION DE PESCA — los 13 personajes lanzando la cana
=============================================================================

QUE ESCRIBE
---------------------------------------------------------------------------
    Game/newpro/pesca_anim/personajeN/<direccion>/pescar_1..6.png

para N = 1..13 (los dos del juego y los once del pack) y las cuatro
direcciones. 13 x 4 x 6 = 312 fotogramas.

LOS SEIS FOTOGRAMAS
---------------------------------------------------------------------------
    1  preparado   la cana en alto, las dos manos en el puno
    2  armar       la cana echada atras por encima del hombro
    3  lanzar      el latigazo hacia delante
    4  soltar      la cana casi horizontal y el sedal saliendo
    5  esperar     la cana sostenida, el sedal colgando y el corcho puesto
    6  esperar     igual, con el corcho un pixel mas abajo (el rebote)

Los cuatro primeros se pasan una vez (el lanzamiento) y los dos ultimos se
repiten en bucle mientras se espera a que pique. Con 6 fotogramas por
direccion, un `repeat: -1` sobre los dos ultimos y un `repeat: 0` sobre los
cuatro primeros sale la animacion completa sin fotogramas de mas.

EL TAMANO DEL LIENZO, Y POR QUE NO SALTA
---------------------------------------------------------------------------
Los fotogramas de pesca son mas grandes que los de andar: **32 px mas anchos y
8 mas altos**, con el cuerpo puesto en el desplazamiento (16, 4). Hace falta
sitio: una cana que barre de -115 a +5 grados no cabe en los 24 px de ancho del
fotograma de andar, y recortarla deja un palo de 6 px que no se lee.

Y no hace falta tocar nada en el juego para que encaje. Con el origen por
defecto de Phaser (0.5, 0.5) lo que se alinea es el CENTRO del fotograma:

    andar   cuerpo en 0..23 de 24  -> centro del cuerpo 11.5, del lienzo 12.0
    pescar  cuerpo en 16..39 de 56 -> centro del cuerpo 27.5, del lienzo 28.0

Los dos tienen el cuerpo medio pixel a la izquierda del centro, asi que el
personaje se queda EXACTAMENTE donde estaba al cambiar de animacion. Lo mismo
en vertical. Por eso el margen es 16 y 4, el mismo por los dos lados.

=============================================================================
EL BRAZO: HOMBRO CLAVADO, CODO RESUELTO, MANO EN EL PUNO
=============================================================================

Las dos versiones anteriores movian el brazo entero de una pieza —primero
pintando dos barras del hombro al puno, despues CIZALLANDO el brazo recortado
del sprite— y las dos fallaban por lo mismo: **el brazo no respetaba la postura
del cuerpo**. Una cizalla mueve cada fila en proporcion a lo que baja, asi que
el brazo sale convertido en una banda diagonal uniforme: no tiene hombro (la
fila de arriba se queda donde estaba pero el resto se va), no tiene codo (no
hay ningun sitio donde cambie de direccion) y la mano acaba donde caiga, que
casi nunca es donde esta el puno de la cana. Al lado del fotograma de andar se
veia un tirante cruzado y una cana flotando.

Ahora el brazo es una CADENA DE DOS SEGMENTOS con las tres cosas clavadas:

  1. EL HOMBRO NO SE MUEVE. Las tres primeras filas del brazo —el hombro y el
     nacimiento de la manga— se quedan EXACTAMENTE donde las dibujo el artista
     y ni siquiera se borran del cuerpo. Por eso la silueta del torso sigue
     siendo la de siempre: en estos sprites los brazos SON los lados del
     tronco, y quitarlos enteros dejaba un palo de nueve pixeles de ancho con
     un contorno negro suelto flotando por fuera.

  2. EL CODO SE CALCULA, no se elige. Conocidos el hombro, la mano y las dos
     mitades del brazo, la posicion del codo es la interseccion de dos
     circunferencias: hay dos soluciones, una con el codo hacia dentro y otra
     hacia fuera, y se coge SIEMPRE la de fuera (la mas lejos del eje del
     cuerpo), que es como dobla un brazo humano al sujetar algo por delante.

  3. LA MANO CAE EN EL PUNO PORQUE SE PARTE DE AHI. Primero se decide donde
     esta el puno de la cana, despues se dobla el brazo para llegar; no al
     reves. Si el puno queda mas lejos de lo que el brazo da de si, se acerca
     hasta el limite del alcance — nunca se deja la mano en el aire.

  4. LA SEGUNDA MANO AGARRA EL TALON. Una cana se sujeta con las dos manos
     separadas, no con las dos en el mismo sitio: la mano de atras busca un
     punto del propio eje de la cana, por detras del puno, y la distancia entre
     las dos se ajusta sola hasta que el brazo de atras llegue.

Y los pixeles siguen siendo los del juego. El brazo no se repinta: se recorta
del sprite fila a fila y cada fila se vuelve a estampar PERPENDICULAR a la
direccion de la cadena en ese punto. Es doblar la manga, no dibujar otra: el
sombreado, los tonos y la mano son los del artista. El contorno se rehace,
porque un brazo doblado tiene un contorno distinto que uno colgando.

DE PERFIL HAY UN BRAZO ESCONDIDO
---------------------------------------------------------------------------
En las vistas de frente y de espaldas los dos brazos estan separados del torso
por una linea negra, asi que se encuentran solos inundando desde los lados. De
perfil solo uno la tiene: el otro esta PEGADO al tronco y lo unico que lo
delata es su mano, una mancha de piel en el borde del torso. Cuando pasa eso el
brazo se recompone quedandose con las columnas de fuera de cada fila, las que
caen sobre la mano. Sin eso, de perfil la mano de ese brazo se quedaba colgando
en la cadera mientras la cana flotaba sin nadie que la agarrase.
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
SOULBOUND = os.path.join(RAIZ, 'Game', 'Sprites', 'Soulbound')
PACK = os.path.join(RAIZ, 'Game', 'newpro', 'personajes')
DESTINO = os.path.join(RAIZ, 'Game', 'newpro', 'pesca_anim')
WEB = '/Game/newpro/pesca_anim'

DIRS = ['abajo', 'arriba', 'derecha', 'izquierda']
NEG = (0, 0, 0, 255)
MARGEN_X, MARGEN_Y = 16, 4

# Filas del brazo que NO se mueven: el hombro. Con dos se veia el corte al
# doblar hacia arriba; con tres la manga nace del tronco como en el sprite.
HOMBRO_FIJO = 3

# la cana: madera con el puno forrado, los mismos tonos que pesca/canas/
MADERA = [A.hex_rgb(c) for c in ('#c08f52', '#a3763f', '#8a5f30', '#6b4724', '#4e3319')]
PUNO = [A.hex_rgb(c) for c in ('#d8c496', '#bca170', '#99845b', '#75643f')]
SEDAL = A.hex_rgb('#e4ecef')
CORCHO_A = A.hex_rgb('#c8352f')
CORCHO_B = A.hex_rgb('#efe9e0')


# ===========================================================================
# DE DONDE SALE CADA PERSONAJE
# ===========================================================================

def personajes():
    """[(id, carpeta_origen, cuerpo_base)] para los 13."""
    fuera = [('personaje1', os.path.join(SOULBOUND, 'personaje1'), 'personaje1'),
             ('personaje2', os.path.join(SOULBOUND, 'personaje2'), 'personaje2')]
    for n in range(3, 14):
        carpeta = os.path.join(PACK, 'personaje%d' % n)
        if not os.path.isdir(carpeta):
            continue
        fuera.append(('personaje%d' % n, carpeta, _cuerpo_base(carpeta)))
    return fuera


def _cuerpo_base(carpeta):
    """
    De que cuerpo del juego sale un personaje del pack: se compara el ALFA de
    su fotograma de frente con el de los dos originales. El alfa no cambia al
    recolorear, asi que identifica el cuerpo sin fiarse de ningun catalogo.
    """
    mio = Lienzo.desde(os.path.join(carpeta, 'abajo', 'run_1.png'))
    alfa_mio = [1 if c[3] else 0 for c in mio.px]
    mejor, mejor_n = 'personaje1', -1
    for b in ('personaje1', 'personaje2'):
        base = Lienzo.desde(os.path.join(SOULBOUND, b, 'abajo', 'run_1.png'))
        if (base.w, base.h) != (mio.w, mio.h):
            continue
        alfa = [1 if c[3] else 0 for c in base.px]
        iguales = sum(1 for a, b2 in zip(alfa_mio, alfa) if a == b2)
        if iguales > mejor_n:
            mejor, mejor_n = b, iguales
    return mejor


# ===========================================================================
# ANATOMIA — donde estan el cuello, los hombros y los brazos
# ===========================================================================

_CACHE = {}


def _colores_cara(li, y_hombro):
    """
    Los colores de la franja de la cara. Sirven para reconocer la PIEL: la piel
    del brazo es la unica parte del brazo que tambien esta en la cara. La franja
    va de y_hombro-9 a y_hombro-3: lo bastante arriba para no pillar el cuello
    de la camisa y lo bastante abajo para no pillar el mechon de la coronilla,
    que en personaje2 es del mismo verde que las mangas.
    """
    cara = set()
    for y in range(max(0, y_hombro - 9), max(1, y_hombro - 2)):
        for x in range(li.w):
            c = li.get(x, y)
            if c[3] and c[:3] != (0, 0, 0):
                cara.add(c[:3])
    return cara


def anatomia(base, direccion):
    """
    Mascaras de los brazos y medidas del torso del cuerpo base. Se calcula una
    vez por (cuerpo, direccion) y se reutiliza para todos los personajes que
    salgan de ese cuerpo: los once del pack son recoloreados de los dos del
    juego y tienen el alfa identico, asi que la misma anatomia vale para todos.
    """
    clave = (base, direccion)
    if clave in _CACHE:
        return _CACHE[clave]
    li = Lienzo.desde(os.path.join(SOULBOUND, base, direccion, 'run_1.png'))

    def separador(x, y):
        if li.get(x, y) != NEG:
            return False
        a, b = li.get(x - 1, y), li.get(x + 1, y)
        return a[3] and a != NEG and b[3] and b != NEG

    # EL HOMBRO SE ENCUENTRA POR EL CUELLO. Estos sprites son cabezones: la
    # cabeza mide veinte de los veinticuatro pixeles de ancho, asi que "la
    # primera fila ancha" cae dentro del pelo y "la primera fila con color de
    # camisa" tambien (personaje2 lleva un mechon verde del mismo verde de la
    # camisa). Lo unico que no engana es la SILUETA: entre la cabeza y los
    # hombros hay un estrechamiento —el cuello— y es el minimo del perfil de
    # anchura. El hombro es la fila siguiente.
    ancho = [sum(1 for x in range(li.w) if li.get(x, y)[3]) for y in range(li.h)]
    lo, hi = int(li.h * 0.30), int(li.h * 0.62)
    cuello = min(range(lo, hi), key=lambda y: ancho[y])
    y_hombro = cuello + 1
    y_sep = None
    for y in range(y_hombro + 1, li.h):
        if any(separador(x, y) for x in range(2, li.w - 2)):
            y_sep = y
            break

    def inunda(x0):
        m = Mascara(li.w, li.h)
        pila = [(x0, y_sep)]
        while pila:
            x, y = pila.pop()
            if m.get(x, y) or y < y_sep or y >= li.h:
                continue
            c = li.get(x, y)
            if not c[3] or c == NEG:
                continue
            m.set(x, y)
            pila += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
        return m

    xs = [x for x in range(li.w) if li.get(x, y_sep)[3] and li.get(x, y_sep) != NEG]
    total = li.mascara_opaca().cuenta()
    brazos = []
    for x0 in (xs[0], xs[-1]):
        m = inunda(x0)
        caja = m.caja()
        if caja and m.cuenta() < total * 0.22 and (caja[2] - caja[0] + 1) < li.w * 0.40:
            brazos.append(m)

    # el torso: lo que queda entre los brazos en la fila del separador
    quitar = Mascara(li.w, li.h)
    for m in brazos:
        quitar.unir(m)
    tx = [x for x in range(li.w)
          if li.get(x, y_sep)[3] and not quitar.get(x, y_sep)]
    tx0, tx1 = min(tx), max(tx)

    # DE PERFIL FALTA UN BRAZO: el que esta pegado al tronco sin linea que lo
    # separe. Se reconstruye desde su mano.
    if len(brazos) < 2 and brazos:
        m = _brazo_fundido(li, y_sep, brazos[0].caja()[3], quitar,
                           _colores_cara(li, y_hombro), tx0, tx1)
        if m is not None:
            brazos.append(m)

    brazos.sort(key=lambda m: m.caja()[0])
    dato = dict(w=li.w, h=li.h, y_hombro=y_hombro, y_sep=y_sep, brazos=brazos,
                tx0=tx0, tx1=tx1)
    _CACHE[clave] = dato
    return dato


def _brazo_fundido(li, y_sep, y_fin, ya, cara, tx0, tx1):
    """
    El brazo que no tiene linea negra que lo separe del torso.

    Lo unico que lo delata es la MANO: una mancha de color de piel pegada al
    borde del tronco, por debajo de la mitad. Encontrada la mano, el brazo son
    las columnas de FUERA de cada fila —tantas como ancha es la mano— desde el
    hombro hasta abajo de la mano. No es una suposicion: es exactamente lo que
    se ve en el sprite, la manga bajando por el canto del tronco.
    """
    # SOLO dentro de las filas del brazo que si se encontro: mas abajo estan
    # los pies, que tambien son piel, y el brazo acababa bajando por el
    # pantalon hasta los tobillos.
    piel = []
    for y in range(y_sep, y_fin + 1):
        for x in range(li.w):
            c = li.get(x, y)
            if c[3] and c[:3] != (0, 0, 0) and c[:3] in cara and not ya.get(x, y):
                piel.append((x, y))
    if not piel:
        return None
    # la mano es la mancha de piel mas pegada a un canto del torso
    cx = (tx0 + tx1) / 2.0
    lado = 1 if max(p[0] for p in piel) - cx > cx - min(p[0] for p in piel) else -1
    if lado > 0:
        hx1 = max(p[0] for p in piel)
        mano = [p for p in piel if p[0] >= hx1 - 3]
    else:
        hx0 = min(p[0] for p in piel)
        mano = [p for p in piel if p[0] <= hx0 + 3]
    ancho = max(2, max(p[0] for p in mano) - min(p[0] for p in mano) + 1)
    y1 = max(p[1] for p in mano)

    m = Mascara(li.w, li.h)
    for y in range(y_sep, y1 + 1):
        fila = [x for x in range(li.w)
                if li.get(x, y)[3] and li.get(x, y)[:3] != (0, 0, 0)
                and not ya.get(x, y)]
        if not fila:
            continue
        fila.sort(reverse=lado > 0)
        for x in fila[:ancho]:
            m.set(x, y)
    return m if m.cuenta() > 8 else None


def tonos_del_brazo(li, ana):
    """
    Manga y piel del personaje concreto, muestreadas de sus propios brazos.

    La manga es facil: el color mas repetido del brazo. La MANO no, porque en
    unos personajes la manga es corta y en otros llega hasta los dedos, asi que
    "los pixeles de abajo del brazo" acierta en unos y en otros devuelve verde
    de camisa. Lo que si distingue la piel de la ropa es que la piel esta
    TAMBIEN en la cara.
    """
    manga = {}
    for m in ana['brazos']:
        for x, y in m.puntos():
            c = li.get(x, y)[:3]
            manga[c] = manga.get(c, 0) + 1
    if not manga:
        manga = {(60, 60, 60): 1}

    cara = _colores_cara(li, ana['y_hombro'])
    piel = dict((c, n) for c, n in manga.items() if c in cara)
    c_manga = max(manga.items(), key=lambda kv: kv[1])[0]
    if piel:
        c_piel = max(piel.items(), key=lambda kv: kv[1])[0]
    else:
        c_piel = (207, 141, 124)
    return A.rampa(c_manga, 5), A.rampa(c_piel, 3)


# ===========================================================================
# LA POSE
# ===========================================================================

NOMBRES = ['preparado', 'armar', 'lanzar', 'soltar', 'esperar', 'esperar']

# Un fotograma es: donde estan las manos y hacia donde apunta la cana.
#
#   pu_x, pu_y   el puno, en pixeles desde el centro del torso a la altura de
#                los hombros. pu_x positivo es HACIA DELANTE (a la derecha;
#                la vista de izquierda sale de espejar la de derecha).
#   ang          la cana en grados: 0 a la derecha, -90 hacia arriba.
#   largo        lo que mide la cana desde el puno hasta la punta.
#   manos        separacion entre las dos manos sobre el eje de la cana.
POSE = [
    # pu_x  pu_y   ang  largo  manos
    (3.6,   5.2,   -58,   19,   4.0),     # 1 preparado
    (4.0,   3.4,  -145,   20,   4.0),     # 2 armar
    (5.2,   4.2,   -28,   20,   3.5),     # 3 lanzar
    (5.6,   5.8,     2,   21,   3.5),     # 4 soltar
    (4.6,   5.6,   -46,   20,   4.0),     # 5 esperar
    (4.6,   5.6,   -43,   20,   4.0),     # 6 esperar (rebote del corcho)
]


def tira_de_brazo(li, m):
    """
    Parte el brazo en la parte que se queda y la que se dobla.

    Devuelve:
        fijo    mascara de las filas de arriba (el hombro), que no se tocan
        tira    una fila por paso: [(desplazamiento respecto al eje, color)]
        junta   (x, y) del hombro donde empieza a doblarse

    La primera fila de `tira` es la ULTIMA fila fija: se estampa encima otra
    vez para que no quede una costura entre el hombro y el resto al doblar.
    """
    caja = m.caja()
    if caja is None:
        return None, [], (0, 0)
    x0, y0, x1, y1 = caja
    fijo = Mascara(m.w, m.h)
    for x, y in m.puntos():
        if y < y0 + HOMBRO_FIJO:
            fijo.set(x, y)

    tira = []
    for y in range(y0 + HOMBRO_FIJO - 1, y1 + 1):
        xs = [x for x in range(x0, x1 + 1) if m.get(x, y)]
        if not xs:
            continue
        cx = sum(xs) / float(len(xs))
        tira.append([(x - cx, li.get(x, y)) for x in xs])
    junta = None
    for y in range(y0 + HOMBRO_FIJO - 1, y1 + 1):
        xs = [x for x in range(x0, x1 + 1) if m.get(x, y)]
        if xs:
            junta = (sum(xs) / float(len(xs)), float(y))
            break
    return fijo, tira, (junta or ((x0 + x1) / 2.0, float(y0)))


def filas_de_mano(tira, piel):
    """
    Que filas de la tira son la MANO y no la manga.

    Hace falta saberlo porque la mano no se puede tratar como el resto del
    brazo: la manga se puede estirar, doblar y volver a muestrear, pero una
    mano de tres por tres pixeles muestreada tres veces por fila se convierte en
    una mancha de piel embarrada a lo largo del antebrazo. La mano se mueve
    ENTERA y de una pieza.
    """
    quiero = set(piel)
    fuera = []
    for i, fila in enumerate(tira):
        if sum(1 for _, c in fila if c[:3] in quiero) >= max(1, len(fila) // 2):
            fuera.append(i)
    # solo cuentan las de abajo del todo: un pixel de piel suelto a media manga
    # (una muneca asomando) no es la mano
    seguidas = []
    for i in reversed(range(len(tira))):
        if i in fuera:
            seguidas.append(i)
        elif seguidas:
            break
    return sorted(seguidas)


def codo(hombro, mano, l1, l2, fuera_de):
    """
    Donde cae el codo.

    Es la interseccion de dos circunferencias: una de radio `l1` centrada en el
    hombro y otra de radio `l2` centrada en la mano. Hay dos puntos —el codo
    doblado hacia un lado o hacia el otro— y se queda el que este mas lejos de
    `fuera_de` (el eje del cuerpo), que es como se dobla un brazo de verdad
    cuando sujeta algo por delante: el codo sale HACIA FUERA, no se mete en el
    pecho.
    """
    sx, sy = hombro
    hx, hy = mano
    dx, dy = hx - sx, hy - sy
    d = math.hypot(dx, dy)
    if d < 1e-6:
        return (sx, sy + l1)
    if d >= l1 + l2:                       # estirado: el codo va en la recta
        return (sx + dx / d * l1, sy + dy / d * l1)
    a = (d * d + l1 * l1 - l2 * l2) / (2 * d)
    a = max(-l1, min(l1, a))
    alto = math.sqrt(max(0.0, l1 * l1 - a * a))
    ux, uy = dx / d, dy / d
    nx, ny = uy, -ux
    c1 = (sx + ux * a + nx * alto, sy + uy * a + ny * alto)
    c2 = (sx + ux * a - nx * alto, sy + uy * a - ny * alto)
    return c1 if abs(c1[0] - fuera_de) > abs(c2[0] - fuera_de) else c2


def _camino(pts, n):
    """
    `n` puntos repartidos por igual a lo largo de la polilinea, con la
    direccion en cada uno. Es lo que convierte la cadena hombro-codo-mano en
    una sucesion de sitios donde estampar las filas del brazo.
    """
    largos = [math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
              for i in range(len(pts) - 1)]
    total = sum(largos) or 1e-6
    fuera = []
    for i in range(n):
        s = total * (i / float(max(1, n - 1)))
        j, acc = 0, 0.0
        while j < len(largos) - 1 and acc + largos[j] < s:
            acc += largos[j]
            j += 1
        t = (s - acc) / (largos[j] or 1e-6)
        ax, ay = pts[j]
        bx, by = pts[j + 1]
        p = (ax + (bx - ax) * t, ay + (by - ay) * t)
        lg = largos[j] or 1e-6
        fuera.append((p, ((bx - ax) / lg, (by - ay) / lg)))
    return fuera


def articula(tira, junta, objetivo, eje_cuerpo, manos):
    """
    Dobla el brazo para que la mano llegue a `objetivo`.

    Devuelve DOS listas, y esa separacion es el arreglo:

        manga   los pixeles de la manga, estampados a lo largo de la cadena.
                Se recorre a tercios de fila y no a filas enteras porque en
                diagonal, saltando de fila en fila, el brazo sale agujereado
                como una escalera y el contorno se cuela por dentro.

        mano    la mano, estampada UNA sola vez y de una pieza en el extremo.

    Estampar la mano por el camino como una fila mas del brazo era el fallo
    que quedaba: al muestrearla tres veces por fila, los tres o cuatro pixeles
    de piel salian repetidos y corridos, y de frente y de espaldas —donde el
    antebrazo casi apunta al que mira, asi que el camino recorre pocos pixeles
    en mucha longitud— la mano se veia como una mancha de piel embarrada por
    todo el antebrazo, con el contorno negro metido por dentro. Movida de una
    pieza, la mano sigue siendo la que dibujo el artista.
    """
    n = len(tira)
    if n < 2:
        return [], []
    alcance = float(n - 1)
    l1 = alcance * 0.5
    l2 = alcance - l1
    cd = codo(junta, objetivo, l1, l2, eje_cuerpo)
    pasos = max(2, int((n - 1) * 3) + 1)
    camino = _camino([junta, cd, objetivo], pasos)

    primera_mano = min(manos) if manos else n
    manga = []
    for i, (p, u) in enumerate(camino):
        r = min(n - 1, int(round(i * (n - 1) / float(pasos - 1))))
        if r >= primera_mano:
            continue
        nx, ny = u[1], -u[0]
        for off, c in tira[r]:
            manga.append((p[0] + nx * off, p[1] + ny * off, off, c))

    mano = []
    if manos:
        puntos = [(off, float(r), c) for r in manos for off, c in tira[r]]
        ox = sum(q[0] for q in puntos) / float(len(puntos))
        oy = sum(q[1] for q in puntos) / float(len(puntos))
        px, py = objetivo
        for off, r, c in puntos:
            mano.append((px + (off - ox), py + (r - oy), c))
    return manga, mano


def alcance_de(tira):
    return max(0.0, float(len(tira) - 1))


def acerca(origen, destino, alcance):
    """Acerca `destino` a `origen` hasta que quede dentro del alcance."""
    dx, dy = destino[0] - origen[0], destino[1] - origen[1]
    d = math.hypot(dx, dy)
    if d <= alcance or d < 1e-6:
        return destino
    k = alcance / d
    return (origen[0] + dx * k, origen[1] + dy * k)


# ===========================================================================
# EL DIBUJO
# ===========================================================================

def _linea_gruesa(m, x0, y0, x1, y1, gr0, gr1):
    pasos = max(2, int(math.hypot(x1 - x0, y1 - y0)))
    for i in range(pasos + 1):
        t = i / float(pasos)
        m.disco(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t,
                max(0.6, (gr0 + (gr1 - gr0) * t) / 2.0))
    return m


def aclara(c, d=0.13):
    """Sube el brillo en ABSOLUTO, no en porcentaje."""
    h, sa, v = A.a_hsv(c)
    return A.de_hsv(h, sa * 0.94, min(1.0, v + d))


def dibuja(li_base, ana, direccion, frame, rampa_manga, rampa_piel):
    """Un fotograma de pesca."""
    W = ana['w'] + MARGEN_X * 2
    H = ana['h'] + MARGEN_Y * 2
    pu_x, pu_y, ang_g, largo, sep_manos = POSE[frame]
    espejo = direccion == 'izquierda'

    cx_cuerpo = (ana['tx0'] + ana['tx1']) / 2.0 + MARGEN_X
    y_hombros = ana['y_sep'] + MARGEN_Y

    # --- los brazos, partidos en hombro fijo + tira que se dobla -------------
    piel = set(rampa_piel[:3])
    piezas = []
    for m in ana['brazos']:
        fijo, tira, junta = tira_de_brazo(li_base, m)
        if not tira:
            continue
        piezas.append(dict(mascara=m, fijo=fijo, tira=tira,
                           manos=filas_de_mano(tira, piel),
                           junta=(junta[0] + MARGEN_X, junta[1] + MARGEN_Y)))
    # el brazo de delante es el del lado hacia el que apunta la cana
    piezas.sort(key=lambda p: p['junta'][0])
    if piezas:
        piezas[-1]['delante'] = True
        for p in piezas[:-1]:
            p['delante'] = False

    # --- capa 1: el cuerpo, sin la parte movil de los brazos -----------------
    movil = Mascara(ana['w'], ana['h'])
    for p in piezas:
        m2 = p['mascara'].copia()
        m2.restar(p['fijo'])
        movil.unir(m2)
    cuerpo = _cuerpo_sin(li_base, movil, W, H)

    # --- donde estan las manos y la cana -------------------------------------
    delante = piezas[-1] if piezas else None
    atras = piezas[0] if len(piezas) > 1 else None

    puno = (cx_cuerpo + pu_x, y_hombros + pu_y)
    if delante:
        puno = acerca(delante['junta'], puno, alcance_de(delante['tira']))

    ang = math.radians(ang_g)
    ex, ey = math.cos(ang), math.sin(ang)
    # la mano de atras agarra el talon: un punto del eje de la cana por detras
    # del puno. Si no llega, se busca la separacion mas grande que alcance.
    mano_atras = None
    if atras:
        for s in (sep_manos, sep_manos - 1, sep_manos - 2, 0.0):
            cand = (puno[0] - ex * s, puno[1] - ey * s)
            if math.hypot(cand[0] - atras['junta'][0],
                          cand[1] - atras['junta'][1]) <= alcance_de(atras['tira']):
                mano_atras = cand
                break
        if mano_atras is None:
            mano_atras = acerca(atras['junta'], puno, alcance_de(atras['tira']))

    # --- la cana --------------------------------------------------------------
    talon_ref = mano_atras or puno
    talon = (talon_ref[0] - ex * 2.2, talon_ref[1] - ey * 2.2)
    lg = float(largo)
    while lg > 9 and not (1 <= puno[0] + ex * lg < W - 1 and 1 <= puno[1] + ey * lg < H - 1):
        lg -= 1
    punta = (puno[0] + ex * lg, puno[1] + ey * lg)

    capa_cana = Lienzo(W, H)
    m_cana = Mascara(W, H)
    _linea_gruesa(m_cana, talon[0], talon[1], punta[0], punta[1], 2.4, 1.0)
    m_forro = Mascara(W, H)
    _linea_gruesa(m_forro, talon[0], talon[1],
                  talon[0] + ex * (sep_manos + 2), talon[1] + ey * (sep_manos + 2), 2.6, 2.2)
    for x, y in m_cana.borde(True).puntos():
        capa_cana.set(x, y, (0, 0, 0))
    caja = m_cana.caja()
    for x, y in m_cana.puntos():
        t = (x - caja[0]) / float(max(1, caja[2] - caja[0]))
        capa_cana.set(x, y, MADERA[min(4, 1 + int(t * 2.4))])
    for x, y in m_forro.puntos():
        capa_cana.set(x, y, PUNO[1] if (x + y) % 2 else PUNO[2])
    _sedal(capa_cana, punta, frame, W, H, 1)

    # --- montaje: cuerpo, cana, brazos ---------------------------------------
    li = Lienzo(W, H)
    li.pegar(cuerpo)
    li.pegar(capa_cana)
    fijos = Mascara(W, H)
    for p in piezas:
        for x, y in p['fijo'].puntos():
            fijos.set(x + MARGEN_X, y + MARGEN_Y)
    for p in piezas:
        objetivo = puno if p['delante'] else (mano_atras or puno)
        manga, mano = articula(p['tira'], p['junta'], objetivo, cx_cuerpo,
                               p['manos'])
        _pega_brazo(li, manga, mano, fijos, rampa_manga, p['delante'])

    _limpia_contorno(li)
    if espejo:
        li = li.espejo_h()
    return li


def _cuerpo_sin(li_base, movil, W, H):
    """
    El cuerpo con el hueco del brazo TAPADO, no recortado.

    Es lo que hace que la silueta siga siendo la del personaje. En estos
    sprites los brazos SON los cantos del tronco: si al llevarlos hacia delante
    se deja el hueco vacio, el torso se queda en nueve pixeles de ancho con una
    cintura de avispa entre unos hombros anchos y unas caderas anchas, y ademas
    el contorno negro que iba por fuera del brazo se queda flotando en el aire.
    Se veia mordido.

    Un brazo que se mueve hacia delante no se lleva el cuerpo con el: por
    detras sigue habiendo torso. Asi que el hueco se rellena con el color de la
    camisa de esa misma fila y la LINEA NEGRA que separaba el brazo del tronco
    —que ya no separa nada— se rellena tambien. El contorno de fuera se queda,
    que ese si es el borde del personaje.
    """
    cuerpo = Lienzo(W, H)
    w, h = movil.w, movil.h

    def es_cuerpo(x, y):
        c = li_base.get(x, y)
        return c[3] and c[:3] != (0, 0, 0) and not movil.get(x, y)

    def color_fila(x, y):
        """El color de camisa mas cercano en la misma fila."""
        for d in range(1, w):
            for xx in (x - d, x + d):
                if 0 <= xx < w and es_cuerpo(xx, y):
                    return li_base.get(xx, y)
        return None

    for y in range(h):
        for x in range(w):
            c = li_base.get(x, y)
            if not c[3]:
                continue
            tapa = movil.get(x, y)
            if not tapa and c[:3] == (0, 0, 0):
                # la juntura brazo/torso: negro con brazo a un lado y cuerpo al
                # otro. Sin brazo delante ya no pinta nada.
                izq, der = (x - 1, y), (x + 1, y)
                tapa = ((movil.get(*izq) and es_cuerpo(*der)) or
                        (movil.get(*der) and es_cuerpo(*izq)))
            if tapa:
                c = color_fila(x, y) or c
            cuerpo.set(x + MARGEN_X, y + MARGEN_Y, c)
    return cuerpo


def _pega_brazo(li, manga, mano, fijos, rampa, delante):
    """
    Pega el brazo doblado, lo vuelve a sombrear y le rehace el contorno.

    LA MANGA SE REPINTA, NO SE COPIA. Arrastrando el color de cada pixel del
    sprite, el sombreado del brazo original —que tenia el canto izquierdo claro
    y el derecho oscuro— se remuestrea tres veces por fila sobre una direccion
    distinta, y sale un moteado de claros y oscuros que parece nieve. Ahora el
    tono se decide por DONDE CAE el pixel a lo ancho del brazo: el lado de la
    luz claro, el centro medio, el otro lado en sombra. Es un tubo, que es lo
    que es un brazo, y usa la rampa del propio personaje.

    El contorno se traza de nuevo porque un brazo doblado no tiene el mismo
    contorno que uno colgando. Sin el, el brazo se funde con la camisa —que es
    del mismo color— y el personaje parece manco con una cana flotando delante.

    Y la MANO va encima de todo, la ultima: es lo que agarra la cana.
    """
    if not manga and not mano:
        return
    m = Mascara(li.w, li.h)
    for x, y, _, _ in manga:
        m.set(x, y)
    for x, y, _ in mano:
        m.set(x, y)
    for x, y in m.borde(True).puntos():
        if not fijos.get(x, y):
            li.set(x, y, (0, 0, 0))

    luz, medio, sombra = rampa[1], rampa[2], rampa[3]
    if delante:
        luz, medio, sombra = rampa[0], rampa[1], rampa[2]
    for x, y, off, c in manga:
        if c[:3] == (0, 0, 0):
            continue
        li.set(x, y, luz if off < -0.4 else (sombra if off > 0.6 else medio))
    for x, y, c in mano:
        if c[3]:
            li.set(x, y, c)


def _sedal(li, punta, frame, W, H, lado):
    """
    El sedal. En el latigazo sale disparado hacia delante y casi recto; en la
    espera cuelga de la punta con el corcho al final. Se dibuja hasta donde
    llegue el lienzo: un sedal cortado por el borde se lee como que sigue, un
    sedal de tres pixeles no se lee como nada.
    """
    px, py = punta
    if frame == 2:
        pts = [(px + lado * i * 1.5, py + i * 0.55) for i in range(1, 10)]
    elif frame == 3:
        pts = [(px + lado * i * 1.7, py + i * 0.30) for i in range(1, 13)]
    else:
        caida = 12 + (1 if frame == 5 else 0)
        pts = [(px + lado * i * 0.30, py + i) for i in range(1, caida)]
    pts = [(x, y) for x, y in pts if 0 <= x < W and 0 <= y < H]
    if len(pts) < 3:
        # un sedal de uno o dos pixeles no se lee como sedal: se lee como
        # suciedad suelta al lado de la cana
        return
    for i, (x, y) in enumerate(pts):
        li.set(x, y, SEDAL if i % 3 else ajusta(SEDAL, dv=0.82))
    if frame >= 4 and pts:
        cx, cy = pts[-1]
        for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (1, 1), (-1, 1)):
            li.set(cx + dx, cy + dy, CORCHO_A if dy == 0 else CORCHO_B)
        li.set(cx - 1, cy - 1, ajusta(CORCHO_A, dv=1.2))
        for dx, dy in ((-2, 0), (2, 0), (-2, 1), (2, 1), (-1, 2), (0, 2), (1, 2),
                       (-1, -1), (0, -1), (1, -1)):
            if not li.get(cx + dx, cy + dy)[3]:
                li.set(cx + dx, cy + dy, (0, 0, 0))


def _limpia_contorno(li):
    """Quita los pixeles negros que se han quedado sin nada a lo que rodear."""
    for _ in range(3):
        fuera = []
        for x, y in li.mascara_opaca().puntos():
            if li.get(x, y)[:3] != (0, 0, 0):
                continue
            if not any(li.get(x + dx, y + dy)[3] and li.get(x + dx, y + dy)[:3] != (0, 0, 0)
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1),
                                      (1, 1), (-1, -1), (1, -1), (-1, 1))):
                fuera.append((x, y))
        if not fuera:
            break
        for x, y in fuera:
            li.set(x, y, A.TRANSP)


# ===========================================================================

def main():
    hoja = '--hoja' in sys.argv
    cat = []
    muestras = []
    for ident, carpeta, base in personajes():
        n = 0
        for d in DIRS:
            # izquierda es el espejo exacto de derecha en los dos cuerpos base
            # (comprobado pixel a pixel), asi que se dibuja una vez
            fuente_d = 'derecha' if d == 'izquierda' else d
            ana = anatomia(base, fuente_d)
            li_base = Lienzo.desde(os.path.join(carpeta, fuente_d, 'run_1.png'))
            rampa_manga, rampa_piel = tonos_del_brazo(li_base, ana)
            for f in range(6):
                li = dibuja(li_base, ana, d, f, rampa_manga, rampa_piel)
                ruta = os.path.join(DESTINO, ident, d, 'pescar_%d.png' % (f + 1))
                li.guardar(ruta)
                n += 1
                if f in (0, 3, 4) and d in ('abajo', 'derecha'):
                    muestras.append(ruta)
        cat.append({'id': ident, 'cuerpo_base': base, 'fotogramas': n,
                    'tam': [Lienzo.desde(os.path.join(DESTINO, ident, 'abajo',
                                                      'pescar_1.png')).w,
                            Lienzo.desde(os.path.join(DESTINO, ident, 'abajo',
                                                      'pescar_1.png')).h],
                    'ruta': '%s/%s' % (WEB, ident)})
        print('  %-12s (%s) %d fotogramas' % (ident, base, n))

    with io.open(os.path.join(DESTINO, 'pesca_anim.json'), 'w', encoding='utf-8') as fh:
        fh.write(json.dumps({
            'pack': 'newpro/pesca_anim', 'version': 2, 'base_web': WEB,
            'descripcion': 'Animacion de lanzar la cana, 6 fotogramas x 4 direcciones.',
            'fotogramas': [{'n': i + 1, 'nombre': NOMBRES[i],
                            'angulo_cana': POSE[i][2]} for i in range(6)],
            'bucle': {'lanzamiento': [1, 2, 3, 4], 'espera': [5, 6]},
            'brazo': {'hombro_fijo': HOMBRO_FIJO,
                      'nota': ('el hombro no se mueve y el codo se resuelve para '
                               'que la mano caiga en el puno de la cana')},
            'margen': {'x': MARGEN_X, 'y': MARGEN_Y,
                       'nota': ('el cuerpo va desplazado (16, 4) dentro de un lienzo '
                                '32x8 mas grande; con el origen 0.5/0.5 de Phaser el '
                                'personaje NO se mueve al cambiar de animacion')},
            'total': sum(c['fotogramas'] for c in cat),
            'personajes': cat}, ensure_ascii=False, indent=1))
    # la hoja de contacto vive DENTRO del pack, no en el TEMP: una animacion de
    # 312 fotogramas no se juzga abriendo PNG de uno en uno
    hoja_pj = []
    for d in DIRS:
        hoja_pj += [os.path.join(DESTINO, 'personaje1', d, 'pescar_%d.png' % (i + 1))
                    for i in range(6)]
    A.hoja_contacto(hoja_pj, columnas=6, escala=4).save(
        os.path.join(DESTINO, 'hoja_pesca_anim.png'))
    print('%d personajes, %d fotogramas' % (len(cat), sum(c['fotogramas'] for c in cat)))

    if hoja:
        d = os.path.join(os.environ.get('TEMP', '.'), 'gf_hojas')
        if not os.path.isdir(d):
            os.makedirs(d)
        A.hoja_contacto(muestras, columnas=6, escala=5).save(
            os.path.join(d, 'pesca_anim.png'))
        uno = []
        for dd in DIRS:
            uno += [os.path.join(DESTINO, 'personaje8', dd, 'pescar_%d.png' % (i + 1))
                    for i in range(6)]
        A.hoja_contacto(uno, columnas=6, escala=5).save(
            os.path.join(d, 'pesca_anim_uno.png'))
        print('hoja en', d)


if __name__ == '__main__':
    main()
