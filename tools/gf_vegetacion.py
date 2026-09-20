#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
GF VEGETACION — arboles, arbustos y matas a la manera del juego
=============================================================================

No genera archivos: la usan `generar-vegetacion.py` (la carpeta suelta) y
`generar-tilesets.py` (las piezas de 2x2 tiles de cada tema).

LA PALETA NO ES INVENTADA: ESTA MEDIDA
---------------------------------------------------------------------------
Contando pixeles de los arboles que ya tiene el juego, `Game/Objetos/arbol.png`
y `arbol_pinos.png`, sale exactamente esto:

    copa de frondosa   #458134 claro / #25572f medio / #0e391d oscuro
    copa de pino       #498a38 . #327430 . #276028 . #194419 . #123510
    contorno de copa   #02110a  (casi negro, con verde dentro)
    tronco             #8a5c37 claro / #674529 medio / #583921 . #3a2516
    flores del arbusto #f98897 claro / #bc4360   (arbusto de flores.png)

Los arboles nuevos usan esos mismos numeros, asi que uno del pack puesto al
lado de `arbol.png` es del mismo bosque y no de otro juego.

COMO SE DIBUJA UNA COPA
---------------------------------------------------------------------------
Una copa no es una elipse rellena: es un RACIMO. Se juntan de ocho a catorce
discos de radios distintos dentro de una elipse y la union de todos es la
silueta — por eso el borde sale abollado, con entrantes y salientes, y no
parece un globo.

Y el sombreado NO es un degradado ni son brochazos: son BULTOS. Mirando
`Game/Objetos/arbusto solo.png` y `arbusto de flores.png` con lupa, cada
mechon de hoja es una bolita con su arco claro arriba y su media luna oscura
abajo. La copa entera es un racimo de esas bolitas, y por eso la silueta sale
festoneada y el interior parece brocoli.

Es lo que el juego llama tener volumen, y es lo que distingue su arte de un
tileset plano. Las dos versiones anteriores de la copa fueron primero tres
masas lisas —una pelota de goma— y despues brochazos en diagonal —mejor, pero
todavia plano—. Lo que hace falta es `gf_volumen.lobulos_sombreados`.

Encima van dos cosas mas, y son las que hacen que se lea como un arbol y no como
un arbusto grande:

  * los HUECOS. Tres o cuatro mordiscos de tono oscuro por dentro de la copa,
    que son los claros por donde se ve la rama.
  * el CANTO DE ABAJO. Las dos filas de abajo de la copa, en el tono mas
    oscuro: es la parte que no ve el sol y la que apoya la copa sobre el tronco.

EL TRONCO SALE DE UN PERFIL, NO DE UN RECTANGULO
---------------------------------------------------------------------------
El ancho del tronco se saca de `gf_arte.perfil()`, la interpolacion PCHIP que
ya usan los peces: estrecho arriba, ensanchando abajo y abriendose de golpe en
las raices. Un tronco de ancho constante se lee como un poste.

SIN SOMBRA PEGADA
---------------------------------------------------------------------------
Los PNG salen SIN la elipse de sombra debajo. El juego ya tiene su sistema de
sombras (`gf-sombras`, que las hornea con cizalla en un canvas aparte), y una
sombra pintada dentro del PNG no se puede quitar ni girar cuando cambia la hora.
El mapa de ejemplo si la pinta, pero la pinta el, no el arbol.
"""

import math

import gf_arte as A
from gf_arte import Mascara, Lienzo, mezcla, ajusta, rng_de
import gf_volumen as VOL


def R(*hexes):
    return [A.hex_rgb(h) for h in hexes]


# ===========================================================================
# PALETAS — las del juego y las que hacen falta para los temas nuevos
# ===========================================================================

PALETAS = {
    'frondosa': dict(copa=R('#458134', '#25572f', '#0e391d'), borde='#02110a',
                     tronco=R('#8a5c37', '#674529', '#3a2516'), borde_tronco='#1d1109'),
    'pino': dict(copa=R('#498a38', '#327430', '#194419'), borde='#091807',
                 tronco=R('#8a5c37', '#674529', '#3a2516'), borde_tronco='#1d1109'),
    'otono': dict(copa=R('#e0a03a', '#c06a24', '#8a4116'), borde='#2a1206',
                  tronco=R('#8a5c37', '#674529', '#3a2516'), borde_tronco='#1d1109'),
    'cerezo': dict(copa=R('#f9b0c8', '#e07898', '#a84a68'), borde='#3a1420',
                   tronco=R('#7a5a44', '#5a4030', '#33231a'), borde_tronco='#180f09'),
    'seco': dict(copa=R('#6b5a42', '#4d4030', '#332a1e'), borde='#140f08',
                 tronco=R('#7a6046', '#584430', '#332616'), borde_tronco='#170e07'),
    'jungla': dict(copa=R('#5aa83f', '#2f7a30', '#14481e'), borde='#03140a',
                   tronco=R('#96693f', '#6f4c2c', '#3f2a18'), borde_tronco='#1d1109'),
    'nieve': dict(copa=R('#e8f0f4', '#a8c4d0', '#5f7f8f'), borde='#26343c',
                  tronco=R('#7a6047', '#584431', '#332618'), borde_tronco='#170e07'),
    'palmera': dict(copa=R('#6fbf52', '#3f9137', '#215c25'), borde='#05170c',
                    tronco=R('#c09858', '#8a6a34', '#5a441f'), borde_tronco='#2a1e0c'),
    'pantano': dict(copa=R('#7fa03a', '#4f7028', '#2c441a'), borde='#0c1406',
                    tronco=R('#6f5a40', '#4d3e2a', '#2b2216'), borde_tronco='#140f08'),
    'muerto': dict(copa=R('#5a4a38', '#3f3428', '#29211a'), borde='#100c07',
                   tronco=R('#6a5540', '#4a3a2a', '#2a2016'), borde_tronco='#130c07'),
}

FLORES = {
    'rosa': R('#f98897', '#bc4360', '#7a2438'),
    'blanca': R('#ffffff', '#e0e4e8', '#9aa4ac'),
    'amarilla': R('#f8e27a', '#e0b83a', '#9a7a18'),
    'lila': R('#d8b0f0', '#a05fd8', '#6b3a9a'),
    'roja': R('#f07a5a', '#c83828', '#7a1c14'),
}

FRUTAS = {
    'manzana': R('#f07a5a', '#c83828', '#7a1c14'),
    'naranja': R('#f8b04a', '#e0761c', '#9a4a0c'),
    'baya': R('#b0a0f0', '#6a5fd8', '#3a2f9a'),
}


# ===========================================================================
# PIEZAS
# ===========================================================================

def _racimo(w, h, cx, cy, rx, ry, n, semilla, achata=1.0):
    """La silueta de una copa: un racimo de discos (ver `gf_volumen.lobulos`)."""
    return VOL.lobulos(w, h, cx, cy, rx, ry, n, semilla, achata)


def _pinta_copa(li, m, discos, pal, semilla, cy):
    """
    El follaje, a bultos.

    Cada disco del racimo se sombrea como una bolita —arco claro arriba, cuerpo,
    media luna oscura abajo— y encima el conjunto entero se aclara por la
    coronilla y se oscurece por el bajo, que es donde la copa se apoya sobre el
    tronco. Todo el trabajo esta en `gf_volumen.lobulos_sombreados`; aqui solo
    se elige la paleta.
    """
    VOL.lobulos_sombreados(li, m, discos, pal['copa'], semilla)


def _tronco(li, pal, base_x, base_y, alto, ancho, semilla, inclina=0.0,
            raices=True):
    """
    El tronco. El ancho sale de un perfil PCHIP —estrecho arriba, ancho abajo y
    abierto de golpe en las raices—, no de un rectangulo.
    """
    cl, me, os_ = pal['tronco']
    f = A.perfil([(0.0, 0.42), (0.55, 0.62), (0.85, 0.86), (1.0, 1.0)])
    m = Mascara(li.w, li.h)
    for i in range(alto):
        t = i / float(max(1, alto - 1))
        w = max(1.0, ancho * f(t) * (1.32 if (raices and t > 0.92) else 1.0))
        x = base_x + inclina * (1.0 - t) * alto * 0.12
        y = base_y - alto + 1 + i
        for xx in range(int(round(x - w / 2.0)), int(round(x + w / 2.0)) + 1):
            m.set(xx, y)
    if raices:
        for lado in (-1, 1):
            for j in range(3):
                m.linea(base_x, base_y - 2 - j, base_x + lado * (2 + j * 1.6),
                        base_y, 1)
    li.pintar(m, me)
    # la cara izquierda al sol, la derecha en sombra, y unas vetas
    for x, y in m.puntos():
        izq = not m.get(x - 1, y)
        der = not m.get(x + 1, y)
        if izq:
            li.set(x, y, cl)
        elif der:
            li.set(x, y, os_)
    rng = rng_de('veta', semilla)
    for _ in range(max(1, alto // 7)):
        vx = base_x - 1 + int(rng.random() * 3) - 1
        vy = base_y - 2 - int(rng.random() * (alto - 4))
        for k in range(2 + int(rng.random() * 3)):
            if m.get(vx, vy + k):
                li.set(vx, vy + k, os_)
    return m


def _contornea(li, color):
    m = li.mascara_opaca()
    for x, y in m.borde(True).puntos():
        li.set(x, y, color)
    return li


def _adorna(li, m, colores, n, semilla, arriba=True):
    """Flores o frutas repartidas por la copa, siempre pegadas al borde."""
    rng = rng_de('adorno', semilla)
    caja = m.caja()
    if caja is None:
        return
    puestos = []
    borde = m.borde_interno(True)
    cand = [p for p in borde.puntos() if p[1] < caja[3] - 1]
    if not cand:
        cand = list(m.puntos())
    for _ in range(n * 8):
        if len(puestos) >= n:
            break
        x, y = cand[int(rng.random() * len(cand)) % len(cand)]
        if any(abs(x - px) < 3 and abs(y - py) < 3 for px, py in puestos):
            continue
        puestos.append((x, y))
        li.set(x, y, colores[1])
        li.set(x - 1, y, colores[1])
        li.set(x, y + 1, colores[1])
        li.set(x - 1, y + 1, colores[2])
        li.set(x - 1, y - 0, colores[0] if not arriba else colores[1])
        li.set(x, y - 1, colores[0])


# ===========================================================================
# ARBOLES
# ===========================================================================

def _ramas_laterales(li, pal, cx, y, w, semilla, n=2):
    """
    Las ramas bajas con su matita de hojas en la punta.

    `arbol.png` las tiene y son la mitad de su silueta: sin ellas un arbol es
    un chupa-chups —un palo con una bola encima— y con ellas tiene copa, tronco
    y ramas, que son tres cosas y no una.
    """
    ctr, cme, cos = pal['copa']
    tcl, tme, tos = pal['tronco']
    rng = rng_de('rama', semilla)
    for i in range(n):
        lado = -1 if i % 2 == 0 else 1
        largo = w * (0.20 + rng.random() * 0.14)
        # a distinta altura cada una: dos ramas a la misma altura y del mismo
        # largo son una percha, no un arbol
        yy = y + i * 4 + int(rng.random() * 4)
        m = Mascara(li.w, li.h)
        px, py = float(cx), float(yy)
        for k in range(int(largo)):
            t = k / max(1.0, largo)
            px += lado
            py -= 0.55 - t * 0.9
            m.disco(px, py, 0.9 if t < 0.5 else 0.6)
        li.pintar(m, tme)
        for x2, y2 in m.puntos():
            if not m.get(x2, y2 - 1):
                li.set(x2, y2, tcl)
        hoja = Mascara(li.w, li.h)
        r = w * 0.10
        hoja.elipse(px + lado * r * 0.6, py, r * 1.25, r * 0.78)
        li.pintar(hoja, cme)
        for x2, y2 in hoja.puntos():
            if not hoja.get(x2, y2 - 1):
                li.set(x2, y2, ctr)
            elif not hoja.get(x2, y2 + 1):
                li.set(x2, y2, cos)


def arbol(w, h, paleta='frondosa', semilla=0, forma='redonda', flores=None,
          frutas=None, tronco_alto=0.42, inclina=0.0, ramas=True):
    """
    Un arbol entero. `forma` es 'redonda', 'pino', 'columna', 'sauce' o
    'palmera'; 'seco' no lleva copa, solo ramas.
    """
    pal = PALETAS[paleta]
    li = Lienzo(w, h)
    base_y = h - 1
    alto_tronco = max(4, int(h * tronco_alto))
    ancho_tronco = max(3, int(w * 0.16))
    cx = w // 2

    if forma == 'seco':
        _ramas_secas(li, pal, cx, base_y, int(h * 0.92), semilla)
        _contornea(li, A.hex_rgb(pal['borde_tronco']))
        return li

    if forma == 'palmera':
        m_tr = _tronco(li, pal, cx, base_y, int(h * 0.74), ancho_tronco,
                       semilla, inclina=0.9, raices=False)
        _hojas_palmera(li, pal, cx + int(h * 0.74 * 0.12 * 0.9), h - int(h * 0.74),
                       w, semilla)
        _contornea(li, A.hex_rgb(pal['borde']))
        return li

    # LA COPA BAJA HASTA EL 80 % DE LA ALTURA y el tronco sube por dentro de
    # ella. Midiendo `arbol.png`: la copa acaba en el pixel 100 de 125 y el
    # tronco solo se ve desnudo en el ultimo quinto. Dejando el tronco al aire
    # media altura sale un chupa-chups, que es lo que salia antes.
    copa_alto = int(h * 0.80)
    alto_tronco = h - int(h * 0.42)
    m_tr = _tronco(li, pal, cx, base_y, alto_tronco, ancho_tronco, semilla,
                   inclina)
    if ramas and forma in ('redonda', 'sauce') and w >= 40:
        _ramas_laterales(li, pal, cx, int(h * 0.74), w, semilla)
    cy = copa_alto * 0.50
    rx = w * 0.46
    ry = copa_alto * 0.48

    # CUANTOS BULTOS: uno por cada 60 px de copa. Con un numero fijo, una copa
    # de 70 px sale con seis pelotas enormes y una de 30 con seis canicas; el
    # grano de la hoja tiene que ser el mismo en los dos, que es lo que hace
    # que un arbol chico y uno grande parezcan del mismo bosque.
    n_bultos = max(8, min(30, int(rx * ry * 3.14 / 58.0)))

    if forma == 'pino':
        m, faldas = _copa_pino(w, h, cx, copa_alto, semilla)
        discos = None
    elif forma == 'columna':
        m, discos = _racimo(w, h, cx, cy, rx * 0.62, ry * 1.18, n_bultos, semilla,
                            achata=1.0)
    elif forma == 'sauce':
        m, discos = _racimo(w, h, cx, cy * 0.9, rx, ry * 0.8, n_bultos, semilla)
        _cortina(m, w, h, cx, copa_alto, semilla)
    else:
        m, discos = _racimo(w, h, cx, cy, rx, ry, n_bultos, semilla)

    if discos is None:
        _pinta_pino(li, m, pal, semilla, faldas)
    else:
        _pinta_copa(li, m, discos, pal, semilla, cy)
    if flores:
        _adorna(li, m, FLORES[flores], max(4, w // 7), semilla + 3)
    if frutas:
        _adorna(li, m, FRUTAS[frutas], max(3, w // 10), semilla + 9)
    _contornea(li, A.hex_rgb(pal['borde']))
    # el tronco recupera su contorno propio donde asoma por debajo de la copa
    for x, y in m_tr.puntos():
        if not m.get(x, y) and (not m_tr.get(x - 1, y) or not m_tr.get(x + 1, y)
                                or not m_tr.get(x, y + 1)):
            if li.get(x, y)[:3] == A.hex_rgb(pal['borde']):
                li.set(x, y, A.hex_rgb(pal['borde_tronco']))
    return li


def _pinta_pino(li, m, pal, semilla, faldas=None):
    """
    Un pino no tiene bultos redondos: tiene FALDAS.

    Cada piso proyecta su sombra sobre el de abajo, asi que lo que se ve es una
    banda clara en el canto de arriba de cada falda y una oscura en el de
    abajo, mas el costado derecho entero en sombra. Sombreandolo con las
    bolitas de una frondosa salian tres circulos claros pegados encima del
    pino, que es justo lo que no es.
    """
    cl, me, os_ = pal['copa']
    medio = mezcla(cl, me, 0.45)
    li.pintar(m, me)
    rng = rng_de('pino', semilla)
    for k, falda in enumerate(faldas or []):
        for x in range(li.w):
            ys = [y for y in range(li.h) if falda.get(x, y)]
            if not ys:
                continue
            li.set(x, ys[0], medio)
            if len(ys) > 2:
                li.set(x, ys[0] + 1, mezcla(medio, me, 0.55))
            li.set(x, ys[-1], os_)
            if len(ys) > 3:
                li.set(x, ys[-1] - 1, mezcla(os_, me, 0.45))
        # unas pinceladas de aguja dentro de la falda
        pts = list(falda.puntos())
        for _ in range(max(3, len(pts) // 26)):
            px, py = pts[int(rng.random() * len(pts)) % len(pts)]
            li.encima(px, py, medio if rng.random() < 0.5 else os_)
            li.encima(px + 1, py, medio if rng.random() < 0.5 else os_)
    for y in range(li.h):
        xs = [x for x in range(li.w) if m.get(x, y)]
        if xs:
            li.set(xs[-1], y, os_)
            li.set(xs[0], y, medio)
    return li


def _copa_pino(w, h, cx, copa_alto, semilla):
    """
    Las faldas de un pino: tres o cuatro triangulos encajados, cada uno un poco
    mas ancho que el de encima, con el borde picado.
    """
    m = Mascara(w, h)
    faldas = []
    pisos = 3 if copa_alto < 34 else 4
    for p in range(pisos):
        t0 = p / float(pisos)
        t1 = (p + 1.3) / float(pisos)
        y0 = int(copa_alto * t0 * 0.92)
        y1 = min(copa_alto, int(copa_alto * t1 * 0.92))
        ancho = w * (0.20 + 0.30 * (p + 1) / float(pisos))
        falda = Mascara(w, h)
        for y in range(y0, y1 + 1):
            u = (y - y0) / float(max(1, y1 - y0))
            hw = ancho * (0.18 + 0.82 * u)
            pico = 1 if int(y + p) % 3 == 0 else 0
            for x in range(int(round(cx - hw)) - pico, int(round(cx + hw)) + 1 + pico):
                m.set(x, y)
                falda.set(x, y)
        faldas.append(falda)
    return m, faldas


def _cortina(m, w, h, cx, copa_alto, semilla):
    """Las ramas colgantes de un sauce."""
    rng = rng_de('sauce', semilla)
    for i in range(7):
        x = int(cx - w * 0.44 + i * (w * 0.88 / 6.0))
        largo = int(copa_alto * (0.28 + rng.random() * 0.42))
        ys = [y for y in range(h) if m.get(x, y)]
        if not ys:
            continue
        for k in range(largo):
            m.set(x + (1 if k > largo * 0.6 else 0), ys[-1] + k)


def _ramas_secas(li, pal, cx, base_y, alto, semilla):
    """Un arbol muerto: tronco y ramas que se van partiendo en dos."""
    cl, me, os_ = pal['tronco']
    m = Mascara(li.w, li.h)
    rng = rng_de('seco', semilla)

    def rama(x, y, ang, largo, grosor):
        if largo < 2.5:
            return
        x2 = x + math.cos(ang) * largo
        y2 = y + math.sin(ang) * largo
        m.linea(x, y, x2, y2, max(1, int(round(grosor))))
        if grosor <= 1.2 and largo < 5:
            return
        abre = 0.45 + rng.random() * 0.42
        rama(x2, y2, ang - abre, largo * (0.58 + rng.random() * 0.16), grosor * 0.62)
        rama(x2, y2, ang + abre, largo * (0.58 + rng.random() * 0.16), grosor * 0.62)

    rama(cx, base_y, -math.pi / 2, alto * 0.42, max(3, li.w * 0.13))
    for lado in (-1, 1):
        for j in range(3):
            m.linea(cx, base_y - 1 - j, cx + lado * (2 + j * 1.4), base_y, 1)
    li.pintar(m, me)
    for x, y in m.puntos():
        if not m.get(x - 1, y):
            li.set(x, y, cl)
        elif not m.get(x + 1, y):
            li.set(x, y, os_)


def _hojas_palmera(li, pal, cx, cy, w, semilla):
    """Las hojas de una palmera: pencas que salen de un punto y se curvan."""
    cl, me, os_ = pal['copa']
    m = Mascara(li.w, li.h)
    n = 9
    for i in range(n):
        ang = math.pi + i * (math.pi / float(n - 1))
        largo = w * 0.46
        px, py = cx, cy
        camino = []
        for k in range(int(largo)):
            t = k / largo
            a = ang + t * (0.62 if math.cos(ang) > 0 else -0.62)
            px += math.cos(a)
            py += math.sin(a) + t * 0.85
            # LA PENCA ES ANCHA, NO UN PELO. Con un pixel de grosor las nueve
            # hojas salian nueve rayas y la palmera parecia una arana.
            gr = 3.6 * (1.0 - t * 0.62)
            m.disco(px, py, max(0.7, gr / 2.0))
            camino.append((px, py, a, t))
        # los foliolos: marcas cortas perpendiculares a la penca
        for j, (px2, py2, a2, t2) in enumerate(camino):
            if j % 2 or t2 < 0.15:
                continue
            lg = 2.4 * (1.0 - t2 * 0.5)
            for lado in (-1, 1):
                m.linea(px2, py2, px2 + math.cos(a2 + lado * 1.35) * lg,
                        py2 + math.sin(a2 + lado * 1.35) * lg, 1)
    li.pintar(m, me)
    for x, y in m.puntos():
        if not m.get(x, y - 1):
            li.set(x, y, cl)
        elif not m.get(x, y + 1):
            li.set(x, y, os_)
    # los cocos
    for dx in (-2, 1):
        li.set(cx + dx, cy + 1, A.hex_rgb('#6b4724'))
        li.set(cx + dx + 1, cy + 1, A.hex_rgb('#8a5f30'))
        li.set(cx + dx, cy + 2, A.hex_rgb('#4e3319'))


# ===========================================================================
# MATAS, ARBUSTOS Y DEMAS
# ===========================================================================

def arbusto(w, h, paleta='frondosa', semilla=0, flores=None, bayas=None):
    """Un arbusto: un racimo bajo, sin tronco a la vista."""
    pal = PALETAS[paleta]
    li = Lienzo(w, h)
    m, discos = _racimo(w, h, w / 2.0, h * 0.54, w * 0.46, h * 0.44, 9, semilla)
    _pinta_copa(li, m, discos, pal, semilla, h * 0.54)
    if flores:
        _adorna(li, m, FLORES[flores], max(3, w // 5), semilla + 5)
    if bayas:
        _adorna(li, m, FRUTAS[bayas], max(3, w // 6), semilla + 7)
    _contornea(li, A.hex_rgb(pal['borde']))
    return li


def mata(w, h, paleta='frondosa', semilla=0, altas=False):
    """
    Un manojo de hierba.

    Las briznas tienen DOS pixeles de ancho en la base y uno en la punta. Con
    uno solo en todo el largo salen pelos sueltos, no hierba: a este tamano un
    trazo de un pixel es lo mismo que una raya de suciedad.
    """
    pal = PALETAS[paleta]
    cl, me, os_ = pal['copa']
    li = Lienzo(w, h)
    rng = rng_de('mata', semilla)
    n = max(5, w // 4)
    for i in range(n):
        x0 = w * 0.5 + (i - (n - 1) / 2.0) * (w * 0.82 / max(1, n - 1))
        alto = h * (0.62 + rng.random() * 0.38) * (1.0 if altas else 0.78)
        curva = (rng.random() - 0.5) * w * 0.42
        m = Mascara(w, h)
        for k in range(int(alto)):
            t = k / max(1.0, alto)
            x = x0 + curva * t * t
            y = h - 1 - k
            m.set(x, y)
            if t < 0.62:
                m.set(x + (1 if curva > 0 else -1), y)
        col = (cl, me, os_)[i % 3]
        li.pintar(m, col)
        for x, y in m.puntos():
            if not m.get(x - 1, y):
                li.set(x, y, cl if col is not cl else mezcla(cl, (255, 255, 255), .2))
    for x in range(w):
        if li.get(x, h - 1)[3]:
            li.set(x, h - 1, os_)
    return li
def flores_grupo(w, h, color='rosa', semilla=0, paleta='frondosa'):
    """Un corro de flores: tallo con hoja y una cabeza de tres por tres."""
    pal = PALETAS[paleta]
    fl = FLORES[color]
    vc, vm, vo = pal['copa']
    li = Lienzo(w, h)
    rng = rng_de('flores', semilla)
    for i in range(max(4, w // 4)):
        x = 2 + int(rng.random() * (w - 4))
        alto = int(h * (0.50 + rng.random() * 0.42))
        for k in range(alto):
            li.set(x, h - 1 - k, vm if k % 3 else vc)
        hoja = h - 1 - int(alto * 0.45)
        lado = 1 if rng.random() > 0.5 else -1
        li.set(x + lado, hoja, vm)
        li.set(x + lado * 2, hoja - 1, vc)
        cy = h - 1 - alto
        li.set(x, cy, fl[0])
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            li.set(x + dx, cy + dy, fl[1])
        for dx, dy in ((-1, 1), (1, 1)):
            li.set(x + dx, cy + dy, fl[2])
    return li
def tocon(w, h, paleta='frondosa', semilla=0, setas=False):
    """
    Un tocon: el corte de arriba visto en escorzo, con sus anillos, y la
    corteza acanalada por los lados.
    """
    pal = PALETAS[paleta]
    cl, me, os_ = pal['tronco']
    li = Lienzo(w, h)
    cx, ry = w / 2.0, max(2.5, h * 0.17)
    cy = h * 0.28
    m = Mascara(w, h)
    m.rect(int(w * 0.17), int(cy), int(w * 0.83), h - 2)
    m.elipse(cx, cy, w * 0.33, ry)
    m.elipse(cx, h - 3, w * 0.33, ry * 0.9)
    li.pintar(m, me)
    # la corteza: acanaladuras verticales
    for x, y in m.puntos():
        if y <= cy + ry:
            continue
        if (x * 5 // 4) % 3 == 0:
            li.set(x, y, os_)
        elif (x * 5 // 4) % 3 == 1:
            li.set(x, y, cl)
    for x, y in m.puntos():
        if not m.get(x - 1, y):
            li.set(x, y, cl)
        elif not m.get(x + 1, y):
            li.set(x, y, os_)
    # el corte: madera clara con dos anillos
    corte = Mascara(w, h).elipse(cx, cy, w * 0.31, ry * 0.92)
    madera = mezcla(cl, (255, 238, 205), 0.45)
    li.pintar(corte, madera)
    for k, f in ((0.66, 0.66), (0.34, 0.34)):
        anillo = Mascara(w, h).elipse(cx, cy, w * 0.31 * k, ry * 0.92 * f)
        for x, y in anillo.borde_interno(False).puntos():
            li.set(x, y, mezcla(madera, os_, 0.45))
    for x, y in corte.borde_interno(False).puntos():
        li.set(x, y, os_)
    if setas:
        for dx, dy in ((-1.05, 0.66), (1.15, 0.80)):
            bx = int(cx + dx * w * 0.30)
            by = int(h * dy)
            li.set(bx, by, A.hex_rgb('#e0d0b0'))
            li.set(bx, by + 1, A.hex_rgb('#c0b090'))
            for k in (-1, 0, 1):
                li.set(bx + k, by - 1, A.hex_rgb('#c8352f'))
            li.set(bx, by - 2, A.hex_rgb('#e0605a'))
            li.set(bx - 1, by - 2, A.hex_rgb('#c8352f'))
    _contornea(li, A.hex_rgb(pal['borde_tronco']))
    return li
def helecho(w, h, paleta='frondosa', semilla=0):
    """
    Un helecho: cuatro o cinco frondas con su nervio y sus foliolos.

    El nervio solo no se ve: hay que colgarle los foliolos a los lados, que son
    las marquitas cortas en diagonal. Sin ellos un helecho son cuatro rayas.
    """
    pal = PALETAS[paleta]
    cl, me, os_ = pal['copa']
    li = Lienzo(w, h)
    n = 5
    m = Mascara(w, h)
    for i in range(n):
        ang = math.radians(-152 + i * (124.0 / (n - 1)))
        largo = h * (0.66 + 0.32 * (1.0 - abs(i - (n - 1) / 2.0) / float(n)))
        px, py = w / 2.0, h - 1.0
        for k in range(int(largo)):
            t = k / largo
            a = ang + t * (0.55 if math.cos(ang) > 0 else -0.55)
            px += math.cos(a)
            py += math.sin(a)
            m.disco(px, py, 0.7)
            if k % 2 == 0 and t > 0.12:
                lg = 2.6 * (1.0 - t * 0.55)
                for lado in (-1, 1):
                    m.linea(px, py, px + math.cos(a + lado * 1.3) * lg,
                            py + math.sin(a + lado * 1.3) * lg, 1)
    li.pintar(m, me)
    for x, y in m.puntos():
        if not m.get(x, y - 1):
            li.set(x, y, cl)
        elif not m.get(x, y + 1):
            li.set(x, y, os_)
    return li
def bambu(w, h, paleta='jungla', semilla=0):
    """Canas de bambu: tallos con nudos."""
    pal = PALETAS[paleta]
    cl, me, os_ = pal['copa']
    li = Lienzo(w, h)
    rng = rng_de('bambu', semilla)
    for i in range(max(2, w // 6)):
        x = 2 + int(rng.random() * (w - 4))
        alto = int(h * (0.7 + rng.random() * 0.3))
        for k in range(alto):
            y = h - 1 - k
            li.set(x, y, me)
            li.set(x - 1, y, cl)
            li.set(x + 1, y, os_)
            if k % 6 == 5:
                li.set(x - 1, y, os_); li.set(x, y, os_); li.set(x + 1, y, os_)
        for lado in (-1, 1):
            hy = h - 1 - int(alto * 0.8)
            for k in range(3):
                li.set(x + lado * (2 + k), hy - k, cl)
    return li


def cactus(w, h, semilla=0):
    """Un cacto de brazos, con sus costillas y sus espinas."""
    verde = R('#6fa84a', '#4a7a30', '#2e4f1e')
    li = Lienzo(w, h)
    m = Mascara(w, h)
    cx = w / 2.0
    gr = max(3, int(w * 0.22))
    m.linea(cx, h - 1, cx, h * 0.12, gr)
    for lado, alt in ((-1, 0.48), (1, 0.62)):
        bx = cx + lado * w * 0.3
        m.linea(cx, h * alt, bx, h * alt, max(2, gr - 1))
        m.linea(bx, h * alt, bx, h * (alt - 0.26), max(2, gr - 1))
    li.pintar(m, verde[1])
    for x, y in m.puntos():
        if not m.get(x - 1, y):
            li.set(x, y, verde[0])
        elif not m.get(x + 1, y):
            li.set(x, y, verde[2])
    for x, y in m.puntos():
        if y % 4 == 0 and m.get(x - 1, y) and m.get(x + 1, y):
            li.set(x, y, mezcla(verde[1], verde[2], 0.5))
    _contornea(li, A.hex_rgb('#14260e'))
    return li


def seta_gigante(w, h, semilla=0, color='roja'):
    """Una seta de las grandes: sombrero con lunares y pie con faldita."""
    c = FLORES[color] if color in FLORES else FLORES['roja']
    pie = R('#f0e6cc', '#d0c4a6', '#8f8570')
    li = Lienzo(w, h)
    pm = Mascara(w, h)
    pm.rect(int(w * 0.40), int(h * 0.38), int(w * 0.60), h - 1)
    pm.elipse(w / 2.0, h - 2, w * 0.22, h * 0.10)
    li.pintar(pm, pie[1])
    for x, y in pm.puntos():
        if not pm.get(x - 1, y):
            li.set(x, y, pie[0])
        elif not pm.get(x + 1, y):
            li.set(x, y, pie[2])
    sm = Mascara(w, h).elipse(w / 2.0, h * 0.34, w * 0.46, h * 0.28)
    for y in range(int(h * 0.36), h):
        for x in range(w):
            sm.set(x, y, 0)
    li.pintar(sm, c[1])
    for x, y in sm.puntos():
        if not sm.get(x, y - 1):
            li.set(x, y, c[0])
    for x, y in sm.borde_interno(False).puntos():
        if y > h * 0.28:
            li.set(x, y, c[2])
    rng = rng_de('lunar', semilla)
    for _ in range(4):
        lx = int(w * 0.2 + rng.random() * w * 0.6)
        ly = int(h * 0.18 + rng.random() * h * 0.14)
        if sm.get(lx, ly):
            li.set(lx, ly, pie[0]); li.set(lx + 1, ly, pie[0])
            li.set(lx, ly + 1, pie[1])
    _contornea(li, A.hex_rgb('#1a0c0c'))
    return li


def roca(w, h, semilla=0, musgo=False):
    """Un pedrusco, con su cara al sol y su musgo si toca."""
    gris = R('#c0bcb0', '#8d8578', '#5a5449')
    li = Lienzo(w, h)
    m = Mascara(w, h)
    rng = rng_de('roca', semilla)
    pts = []
    n = 7
    for i in range(n):
        a = 2 * math.pi * i / n
        r = (0.34 + rng.random() * 0.16)
        pts.append((w / 2.0 + math.cos(a) * w * r,
                    h * 0.58 + math.sin(a) * h * r * 1.15))
    m.poligono(pts)
    li.pintar(m, gris[1])
    for x, y in m.puntos():
        if not m.get(x - 1, y - 1):
            li.set(x, y, gris[0])
        elif not m.get(x + 1, y + 1):
            li.set(x, y, gris[2])
    for _ in range(2):
        gx = int(w * 0.3 + rng.random() * w * 0.4)
        gy = int(h * 0.4 + rng.random() * h * 0.3)
        for k in range(3):
            li.encima(gx + k, gy + k // 2, gris[2])
    if musgo:
        verde = PALETAS['frondosa']['copa']
        for x, y in m.puntos():
            if not m.get(x, y - 1) and (x + y) % 3:
                li.set(x, y, verde[1] if (x % 2) else verde[0])
    _contornea(li, A.hex_rgb('#2a2620'))
    return li


# ===========================================================================
# PARA METERLOS EN UN TILESET
# ===========================================================================

def en_tiles(li, cols, filas, tile=16):
    """
    Centra una pieza en una rejilla de `cols` x `filas` tiles, apoyada abajo.

    Un arbol de 2x2 tiles NO se dibuja de 32x32 y ya: se dibuja a su tamano y
    se centra, porque lo que tiene que caer en el centro de la casilla es el
    TRONCO, no el rectangulo que lo envuelve.
    """
    W, H = cols * tile, filas * tile
    fuera = Lienzo(W, H)
    caja = li.mascara_opaca().caja()
    if caja is None:
        return fuera
    x0, y0, x1, y1 = caja
    dx = (W - (x1 - x0 + 1)) // 2 - x0
    dy = (H - 1) - y1
    fuera.pegar(li, dx, dy)
    return fuera
