# -*- coding: utf-8 -*-
"""
=============================================================================
LOS MONSTRUOS HUMANOIDES EN 2.5D (zombis, guardián, fantasma, brujas)
                                                                 (2026-10-12)
=============================================================================

"Las brujas y los zombis no se adaptan a los gráficos del juego: deberían ser
2.5D y son 3D sin ser altamente detallados, y son muy grandes."

Por eso NO son modelos 3D: se hacen SOBRE los fotogramas reales de los
personajes Soulbound (los 7 de andar en las 4 direcciones), con el mismo
cuerpo, brazos, contorno y tamaño que el jugador. El personaje 1 es el
ESQUELETO: dice qué píxel es piel, ojo, pelo, camisa o pantalón, y eso se
aplica a los demás. Encima:

  · PELO Y ROPA NUEVOS: la cabeza se rehace con un peinado por dirección
    (lacio, calvo, rapado, salvaje, la melena del guardián, la del fantasma
    y la de las brujas con su sombrero de pico); los zombis llevan la ropa
    hecha jirones, el fantasma un kimono y las brujas capa y túnica.
  · EL 2.5D: el mismo relieve que el juego pone a los personajes
    (tools/gf_relieve.py = gf-relieve.js), horneado en el PNG.

Lo usa tools/generar-monstruos.py.
=============================================================================
"""

import math
import os

from PIL import Image

from gf_arte import (Mascara, Lienzo, rampa, contorno_de, hex_rgb, a_hsv,  # noqa: F401
                     de_hsv, mezcla)

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
SOULBOUND = os.path.join(RAIZ, 'Game', 'Sprites', 'Soulbound')
DIRS = ['abajo', 'arriba', 'derecha', 'izquierda']
FOTOS = 7
LUZ = (-0.62, -0.78)

# ===========================================================================
# UTILIDADES
# ===========================================================================

def lum(c):
    return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255.0


def cargar(ruta):
    return Image.open(ruta).convert('RGBA')


def a_lienzo(im):
    li = Lienzo(im.size[0], im.size[1])
    li.px = list(im.getdata())
    return li


def mapa_por_rango(colores, tonos):
    """
    Reparte los colores de una parte (ordenados de claro a oscuro) entre los
    tonos de una rampa (también de claro a oscuro). Así se conserva el
    sombreado del original sin copiar su color.
    """
    orden = sorted(set(colores), key=lambda c: -lum(c))
    n = len(orden)
    out = {}
    for i, c in enumerate(orden):
        k = 0 if n == 1 else int(round(i * (len(tonos) - 1) / float(n - 1)))
        out[c] = tonos[k]
    return out


# ===========================================================================
# EL ESQUELETO: qué es cada píxel del personaje 1
# ===========================================================================
# Colores EXACTOS del personaje 1 (medidos en sus PNG).
P1_PELO = {hex_rgb(h) for h in ('#251e1d', '#3f3432', '#554340', '#7d6864', '#9b8784')}
P1_PIEL = {hex_rgb(h) for h in ('#cf8d7c', '#f7beb6')}
P1_OJO = {hex_rgb(h) for h in ('#8491a1', '#213467', '#704e3d', '#eceae4', '#3f62be', '#2e488d')}
P1_CAMISA = {hex_rgb(h) for h in ('#1e1e1e', '#282828', '#333333', '#4e4e4e')}
P1_PANTALON = {hex_rgb(h) for h in ('#3c2451', '#573476', '#8451b3', '#7747a3')}


def esqueleto(dir_, n):
    """Etiquetas del personaje 1 en ese fotograma: dict (x, y) -> parte."""
    im = cargar(os.path.join(SOULBOUND, 'personaje1', dir_, 'run_%d.png' % n))
    px = im.load()
    w, h = im.size
    et = {}
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if c[3] < 128:
                continue
            k = c[:3]
            if lum(k) < 0.07:
                et[(x, y)] = 'contorno'
            elif k in P1_PIEL:
                et[(x, y)] = 'piel'
            elif k in P1_OJO:
                et[(x, y)] = 'ojo'
            elif k in P1_PELO:
                et[(x, y)] = 'pelo'
            elif k in P1_CAMISA:
                et[(x, y)] = 'camisa'
            elif k in P1_PANTALON:
                et[(x, y)] = 'pantalon'
            else:
                et[(x, y)] = 'otro'
    # Filas clave: dónde empieza la camisa y dónde el pantalón.
    filas_camisa = [y for (x, y), v in et.items() if v == 'camisa']
    filas_pant = [y for (x, y), v in et.items() if v == 'pantalon']
    cuello = min(filas_camisa) if filas_camisa else 22
    cintura = min(filas_pant) if filas_pant else 38
    # La piel por debajo del cuello son manos; por debajo del pantalón, pies.
    for (x, y), v in list(et.items()):
        if v == 'piel' and y >= cintura:
            et[(x, y)] = 'pies'
        elif v == 'piel' and y >= cuello:
            et[(x, y)] = 'mano'
    return et, (w, h), cuello, cintura


def alinear(et, im, cintura):
    """
    El desplazamiento (dx, dy) que pone el cuerpo de `im` sobre el esqueleto.

    Se comparan SOLO las piernas (de la cintura abajo), que son iguales en los
    13 personajes, y se puntúa aciertos MENOS fallos. Contando solo aciertos,
    una capucha opaca como la del personaje 13 "ganaba" subiendo el cuerpo dos
    filas y todas las partes quedaban corridas.
    """
    px = im.load()
    w, h = im.size
    piernas = {(x, y) for (x, y) in et if y >= cintura}
    mejor, mejor_n = (0, 0), None
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            n = 0
            for (x, y) in piernas:
                xx, yy = x + dx, y + dy
                n += 1 if (0 <= xx < w and 0 <= yy < h and px[xx, yy][3] >= 128) else -1
            # Lo opaco de `im` en esa franja que el esqueleto no cubre, también resta.
            for yy in range(max(0, cintura + dy), h):
                for xx in range(w):
                    if px[xx, yy][3] >= 128 and (xx - dx, yy - dy) not in piernas:
                        n -= 1
            if mejor_n is None or n > mejor_n or (n == mejor_n and abs(dx) + abs(dy) < abs(mejor[0]) + abs(mejor[1])):
                mejor, mejor_n = (dx, dy), n
    return mejor


def es_piel(c):
    h, s, v = a_hsv(c)
    return (h < 0.13 or h > 0.95) and 0.08 < s < 0.62 and v > 0.5


def etiquetar(per, dir_, n):
    """Las partes del personaje `per` en ese fotograma, con el esqueleto del 1."""
    et1, _, cuello, cintura = esqueleto(dir_, n)
    im = cargar(os.path.join(SOULBOUND, per, dir_, 'run_%d.png' % n))
    dx, dy = alinear(et1, im, cintura)
    px = im.load()
    w, h = im.size
    partes = {}
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if c[3] < 128:
                continue
            k = c[:3]
            base = et1.get((x - dx, y - dy))
            yb = y - dy
            if lum(k) < 0.075:
                p = 'contorno'
            elif base in ('piel', 'mano', 'pies') and es_piel(k):
                p = base
            elif base == 'ojo' and yb < cuello:
                p = 'ojo'
            elif yb < cuello:
                p = 'pelo'
            elif yb >= cintura:
                p = 'pantalon'
            else:
                p = 'camisa'
            partes[(x, y)] = (p, k)
    return im, partes, cuello + dy, cintura + dy


# ===========================================================================
# RECOLOR DE HUMANOIDES
# ===========================================================================

def recolorear(partes, w, h, paletas, contorno):
    """
    `paletas`: parte -> lista de tonos (de claro a oscuro) o una función
    (color original) -> color. Lo que no tenga paleta conserva su color.
    """
    por_parte = {}
    for (x, y), (p, c) in partes.items():
        por_parte.setdefault(p, []).append(c)
    mapas = {}
    for p, cols in por_parte.items():
        pal = paletas.get(p)
        if isinstance(pal, list):
            mapas[p] = mapa_por_rango(cols, pal)
    li = Lienzo(w, h)
    for (x, y), (p, c) in partes.items():
        if p == 'contorno':
            li.set(x, y, contorno)
            continue
        pal = paletas.get(p)
        if isinstance(pal, list):
            li.set(x, y, mapas[p][c])
        elif callable(pal):
            li.set(x, y, pal(c))
        else:
            li.set(x, y, c)
    return li


def tonos(hexa, n=4, **kw):
    return rampa(hex_rgb(hexa), n, **kw)


def ojos_brillantes(claro, oscuro):
    """Los ojos: lo claro brilla, lo oscuro queda como pupila."""
    return lambda c: claro if lum(c) > 0.42 else oscuro


def pegar_centrado(li, ancho, alto, ox, oy):
    """Lienzo nuevo de ancho x alto con `li` pegado en (ox, oy)."""
    n = Lienzo(ancho, alto)
    n.pegar(li, ox, oy)
    return n


def silueta_con_contorno(li, color):
    """Rehace el contorno exterior (para lo que cambió de forma: colas, túnicas)."""
    m = li.mascara_opaca()
    # Lo que ya era contorno se queda; se añade el que falte por fuera.
    for x, y in m.borde(diagonales=False).puntos():
        li.set(x, y, color)
    return li


def cola_fantasma(li, partes, cintura, n, rampa_cola, color_contorno, alto_extra=4):
    """
    Quita piernas y pies y pone en su sitio una cola que se estrecha y ondea
    (la fase cambia con el fotograma). Es una forma LISA: tres bandas de luz
    a lo largo, ningún punto.
    """
    w, h = li.w, li.h
    for (x, y), (p, c) in partes.items():
        if y >= cintura - 1 and p in ('pantalon', 'pies', 'contorno'):
            li.set(x, y, (0, 0, 0, 0))
    # El ancho de la CADERA (los píxeles de pantalón de la primera fila): con
    # la fila entera entraban también las manos y la cola salía anchísima.
    fila = cintura
    xs = [x for (x, y), (p, c) in partes.items() if y == cintura and p == 'pantalon']
    if not xs:
        xs = [x for x in range(w) if li.get(x, cintura - 2)[3]]
    if not xs:
        return li
    x0, x1 = min(xs), max(xs)
    cx = (x0 + x1) / 2.0
    medio = (x1 - x0) / 2.0
    largo = h - fila + alto_extra
    fase = n / float(FOTOS) * math.pi * 2
    m = Mascara(w, h + alto_extra)
    for i in range(largo):
        t = i / float(max(1, largo - 1))
        ancho = medio * (1.0 - t) ** 1.25 + 0.6
        vaiven = math.sin(fase + t * 2.4) * 2.2 * t
        y = fila + i
        m.fila(y, cx + vaiven - ancho, cx + vaiven + ancho)
    nuevo = Lienzo(w, h + alto_extra)
    nuevo.pegar(li)
    for x, y in m.puntos():
        if nuevo.get(x, y)[3]:
            continue
        rel = (x - (cx - medio)) / max(1.0, 2 * medio)
        k = 0 if rel < 0.34 else (1 if rel < 0.67 else 2)
        k = min(len(rampa_cola) - 1, k + (1 if y > fila + largo * 0.6 else 0))
        nuevo.set(x, y, rampa_cola[k])
    silueta_con_contorno(nuevo, color_contorno)
    return nuevo


def tunica(li, partes, cintura, rampa_tunica, ribete, color_contorno):
    """
    Une las dos piernas en una túnica hasta los tobillos: cada fila se rellena
    de su píxel más a la izquierda al más a la derecha. El bajo lleva un ribete.
    Los pies asoman debajo, oscuros (botas).
    """
    w, h = li.w, li.h
    # Solo los píxeles de PANTALÓN: con el contorno entraba también el de la
    # mano que cuelga a la altura de la cadera y la túnica se tragaba el hueco.
    filas = {}
    for (x, y), (p, c) in partes.items():
        if y >= cintura and p == 'pantalon':
            filas.setdefault(y, []).append(x)
    pies_top = min([y for (x, y), (p, c) in partes.items() if p == 'pies'] or [h - 3])
    ultima = pies_top - 1
    for y in sorted(filas):
        if y > ultima:
            break
        xs = filas[y]
        a, b = min(xs) - 1, max(xs) + 1
        for x in range(a + 1, b):
            rel = (x - a) / float(max(1, b - a))
            k = 0 if rel < 0.3 else (1 if rel < 0.62 else 2)
            if y >= ultima:
                li.set(x, y, ribete)
            else:
                li.set(x, y, rampa_tunica[k])
        li.set(a, y, color_contorno)
        li.set(b, y, color_contorno)
    return li


def baculo(li, x, y_mano, largo_arriba, largo_abajo, madera, cristal, contorno_c):
    """Un báculo vertical que pasa por la mano, con su cristal arriba."""
    top = y_mano - largo_arriba
    for y in range(top, y_mano + largo_abajo + 1):
        if not li.get(x, y)[3] or y < y_mano - 1 or y > y_mano + 1:
            li.set(x, y, madera[0] if y % 7 else madera[1])
        if not li.get(x - 1, y)[3]:
            li.set(x - 1, y, contorno_c)
        if not li.get(x + 1, y)[3]:
            li.set(x + 1, y, contorno_c)
    li.set(x, y_mano + largo_abajo + 1, contorno_c)
    # El cristal: rombo de 5 de alto, claro arriba a la izquierda.
    cy = top - 3
    rombo = [(0, -2), (-1, -1), (0, -1), (1, -1), (-1, 0), (0, 0), (1, 0), (-1, 1), (0, 1), (1, 1), (0, 2)]
    for ddx, ddy in rombo:
        tono = cristal[0] if (ddx < 0 or ddy < 0) else (cristal[1] if ddx == 0 and ddy <= 0 else cristal[2])
        li.set(x + ddx, cy + ddy, tono)
    m = Mascara(li.w, li.h)
    for ddx, ddy in rombo:
        m.set(x + ddx, cy + ddy)
    for xx, yy in m.borde(diagonales=False).puntos():
        if not li.get(xx, yy)[3]:
            li.set(xx, yy, contorno_c)
    return li


def mano_delantera(partes, dir_):
    """Dónde coger el báculo: la mano que queda delante en esa dirección."""
    manos = [(x, y) for (x, y), (p, c) in partes.items() if p == 'mano']
    if not manos:
        return None
    if dir_ == 'derecha':
        x = max(m[0] for m in manos)
    elif dir_ == 'izquierda':
        x = min(m[0] for m in manos)
    elif dir_ == 'abajo':
        x = max(m[0] for m in manos)        # la mano derecha del dibujo
    else:
        x = min(m[0] for m in manos)        # de espaldas: la otra
    ys = [m[1] for m in manos if abs(m[0] - x) <= 1]
    return x, int(round(sum(ys) / float(len(ys))))


# ===========================================================================
# PELO Y ROPA NUEVOS                                              (2026-10-11)
# ===========================================================================
# "Cambia el cabello de los fantasmas y de los zombis, que la ropa de los
# zombis se vea rasgada, y pon pelo y ropa nuevos a los fantasmas y a las
# brujas."
#
# LA CABEZA SE REHACE. Se guarda la cara (piel, ojos y las líneas que los
# dibujan), se borra todo lo demás por encima del cuello (el pelo de punta,
# las gorras, la capucha) y se pinta un cráneo liso; encima va el peinado
# nuevo, una máscara pensada para cada dirección. La cabeza de los 13
# personajes es la misma en los 7 fotogramas de andar (no bota), así que un
# peinado por dirección vale para toda la animación.
#
# LA ROPA SE RASGA con cortes grandes y pocos: una manga arrancada por el
# codo, una raja en diagonal por el pecho, el bajo de la camisa con dos
# jirones y las perneras deshilachadas. Nada de agujeritos repetidos.
#
# Todo con bandas lisas y mechones en línea: ni puntos ni motas.

def vista_de(dir_):
    return 'frente' if dir_ == 'abajo' else ('espalda' if dir_ == 'arriba' else 'lado')


def geometria_cabeza(partes, cuello, dir_):
    """El cráneo (una elipse), la cara y hacia dónde mira, en el lienzo."""
    fila = [x for (x, y), (p, c) in partes.items() if y == cuello and p == 'camisa']
    if not fila:
        fila = [x for (x, y), (p, c) in partes.items() if y == cuello]
    cxb = (min(fila) + max(fila)) / 2.0
    s = 1 if dir_ == 'derecha' else (-1 if dir_ == 'izquierda' else 0)
    rx, ry = 9.0, 9.5
    g = {'cxb': cxb, 'cx': cxb + 0.5 * s, 'cy': cuello - 1 - ry, 'rx': rx, 'ry': ry,
         'cuello': cuello, 's': s, 'vista': vista_de(dir_)}
    # La cara: piel y ojos por encima de la barbilla y las líneas de contorno
    # que quedan ENTRE ellos en la misma fila (cejas, el borde de los ojos).
    filas = {}
    for (x, y), (p, c) in partes.items():
        if y < cuello - 1 and p in ('piel', 'ojo'):
            filas.setdefault(y, []).append(x)
    cara = set()
    for (x, y), (p, c) in partes.items():
        xs = filas.get(y)
        if y >= cuello - 1 or not xs:
            continue
        if p in ('piel', 'ojo') or (p == 'contorno' and min(xs) < x < max(xs)):
            cara.add((x, y))
    g['cara'] = cara
    return g


def craneo(g, w, h):
    return Mascara(w, h).elipse(g['cx'], g['cy'], g['rx'], g['ry'])


def columnas_colgando(m, x0, x1, y0, finales):
    """Mechones que cuelgan: columna a columna, cada una hasta su final."""
    for i, x in enumerate(range(int(round(x0)), int(round(x1)) + 1)):
        m.columna(x, y0, finales[i % len(finales)])
    return m


def flequillo_de(g, desde, offsets, base):
    """Dónde acaba el pelo sobre la cara, columna a columna: {x: y}."""
    out = {}
    for i, dy in enumerate(offsets):
        out[int(round(desde)) + i] = base + dy
    return out


def peinado(estilo, g, w, h):
    """
    Las máscaras de un peinado en una vista. Devuelve un dict:
      pelo        la máscara del pelo
      flequillo   {x: y}: por debajo de y, en la cara, se ve la cara
      extras      [(mascara, color o 'clave')] lo que va encima (cicatriz,
                  diadema, el triángulo del fantasma)
    """
    cx, cy, rx, ry, cuello, s, vista = g['cx'], g['cy'], g['rx'], g['ry'], g['cuello'], g['s'], g['vista']
    M = lambda: Mascara(w, h)
    cr = craneo(g, w, h)
    pelo = M()
    fleq = {}
    extras = []
    lado = s if s else 1

    if estilo in ('lacio', 'melena', 'yurei', 'larga'):
        # Pelo largo y liso, con raya en medio. `largo`: hasta dónde cae.
        largo = {'lacio': 5, 'melena': 8, 'yurei': 12, 'larga': 8}[estilo]
        ancho = {'lacio': 4, 'melena': 5, 'yurei': 5, 'larga': 3}[estilo]
        finales = [cuello + largo + d for d in (2, 0, 3, 1, 2, 0)]
        if estilo != 'larga':
            pelo.unir(Mascara(w, h).elipse(cx, cy, rx + 0.5, ry + 0.3))
        else:
            pelo.unir(cr.copia())
        if vista == 'frente':
            columnas_colgando(pelo, cx - rx - 1, cx - rx - 1 + ancho, cy - 2, finales)
            columnas_colgando(pelo, cx + rx + 1 - ancho, cx + rx + 1, cy - 2, finales[::-1])
            ofs = {'lacio':  [1, 2, 2, 1, 0, -1, -2, -1, 1, 3, 6, 7, 6, 3, 1],
                   'melena': [1, 1, 2, 1, 0, -1, -1, 0, 1, 2, 1, 1, 2, 1, 1],
                   'yurei':  [3, 4, 5, 6, 6, 5, 2, -2, -2, 2, 3, 3, 2, 1, 1],
                   'larga':  [3, 3, 2, 2, 1, 1, 0, 0, 1, 2, 3, 4, 4, 3, 2]}[estilo]
            fleq = flequillo_de(g, cx - 7, ofs, cy - 1)
            if estilo != 'larga':
                extras.append((M().columna(int(round(cx)), cy - ry + 2, cy - 2.5), 'raya_pelo'))
        elif vista == 'espalda':
            columnas_colgando(pelo, cx - rx - 1, cx + rx + 1, cy, finales)
            # Las esquinas de abajo, redondeadas.
            for x in (int(round(cx - rx - 1)), int(round(cx + rx + 1))):
                pelo.set(x, max(finales) + 1, 0)
        else:
            atras0 = cx - lado * (rx + 1)
            atras1 = cx - lado * 2
            columnas_colgando(pelo, min(atras0, atras1), max(atras0, atras1), cy - 2, finales)
            ofs = {'lacio':  [0, 1, 3, 5, 6, 4, 2, 1, 0, 0],
                   'melena': [0, 0, 1, 2, 1, 1, 0, 0, 0, 0],
                   'yurei':  [2, 3, 4, 5, 5, 4, 3, 2, 1, 1],
                   'larga':  [1, 1, 2, 3, 3, 2, 1, 1, 0, 0]}[estilo]
            if lado < 0:
                ofs = ofs[::-1]
                fleq = flequillo_de(g, cx - len(ofs), ofs, cy - 1)
            else:
                fleq = flequillo_de(g, cx, ofs, cy - 1)
            if estilo == 'yurei':
                # Un mechón que cae por delante del hombro, del lado de la cara.
                xm = cx + lado * (rx - 1.5)
                columnas_colgando(pelo, min(xm, xm + lado), max(xm, xm + lado), cy, [cuello + 8, cuello + 9])

    elif estilo == 'calvo':
        # Coronilla pelada: dos mechones sobre las orejas, el pelo de la nuca
        # y un mechón largo peinado por encima. Y una cicatriz.
        def nuca(desde_x, hasta_x):
            # La franja de la nuca, con el borde de arriba ondulado (liso).
            m = M()
            for x in range(int(desde_x), int(hasta_x) + 1):
                m.columna(x, cy + 1.6 + 1.1 * math.sin(x * 0.9), cy + 8)
            return m.intersecar(cr)
        if vista == 'frente':
            for sg in (-1, 1):
                pelo.poligono([(cx + sg * (rx + 0.4), cy - 2.5), (cx + sg * (rx - 2.4), cy - 3.5),
                               (cx + sg * (rx - 2.8), cy + 0.5), (cx + sg * (rx - 1.6), cy + 4.5),
                               (cx + sg * (rx + 0.9), cy + 6.5), (cx + sg * (rx + 0.6), cy + 2)])
        elif vista == 'espalda':
            pelo.unir(nuca(0, w - 1))
        else:
            atras = (0, cx - lado) if lado > 0 else (cx - lado, w - 1)
            pelo.unir(nuca(atras[0], atras[1]))
            ox = cx - lado * 1
            pelo.poligono([(ox - 1.5, cy - 2.5), (ox + 1.5, cy - 3), (ox + 1.2, cy + 2), (ox - 0.5, cy + 4.5)])
        # El mechón peinado por encima: un arco de dos píxeles.
        arco = M()
        a0, a1 = (200, 320) if vista != 'lado' else ((215, 330) if lado > 0 else (210, 325))
        prev = None
        for a in range(a0, a1 + 1, 8):
            r = math.radians(a)
            p = (cx + (rx - 0.8) * math.cos(r), cy + (ry - 0.8) * math.sin(r))
            if prev:
                arco.linea(prev[0], prev[1], p[0], p[1], 2)
            prev = p
        pelo.unir(arco.intersecar(cr))
        if vista != 'espalda':
            cic = M().linea(cx - 2 * lado, cy - 8, cx + 3 * lado, cy - 4)
            extras.append((cic, 'cicatriz'))

    elif estilo == 'rapado':
        # Pelo al cero, con la frente recta, patillas y una cicatriz que lo
        # cruza (una línea sin pelo, no puntos de sutura).
        if vista == 'frente':
            lim = M()
            for x in range(w):
                tope = cy - 2.5 if abs(x - cx) <= rx - 3 else cy + 3
                lim.columna(x, 0, tope)
            pelo.unir(cr.copia().intersecar(lim))
        elif vista == 'espalda':
            pelo.unir(cr.copia().intersecar(M().rect(0, 0, w - 1, cy + 6.5)))
        else:
            lim = M()
            for x in range(w):
                atras = (x - cx) * lado <= 0
                tope = cy + 6.5 if atras else (cy + 3 if (x - cx) * lado <= 2 else cy - 2.5)
                lim.columna(x, 0, tope)
            pelo.unir(cr.copia().intersecar(lim))
        pts = [(cx - 5 * lado, cy - 8), (cx - 2 * lado, cy - 6), (cx - 3 * lado, cy - 4), (cx + 1 * lado, cy - 2.5)]
        cic = M()
        for a, b in zip(pts, pts[1:]):
            cic.linea(a[0], a[1], b[0], b[1])
        extras.append((cic.intersecar(pelo), 'raya'))

    elif estilo == 'salvaje':
        # Una mata enmarañada con tres greñas grandes que se salen.
        pelo.unir(Mascara(w, h).elipse(cx, cy - 0.5, rx + 2.5, ry + 1.2).intersecar(M().rect(0, 0, w - 1, cuello + 2)))
        if vista == 'lado':
            gr = [[(cx - lado * (rx - 1), cy - 6), (cx - lado * (rx + 5), cy - 4.5), (cx - lado * rx, cy - 1)],
                  [(cx - lado * 1, cy - 9.5), (cx + lado * 3, cy - 12), (cx + lado * 2.5, cy - 8)],
                  [(cx - lado * (rx + 1), cy + 2), (cx - lado * (rx + 6), cy + 9), (cx - lado * (rx - 1), cy + 8)]]
            ofs = [1, 2, 4, 6, 5, 3, 1, 0, 0, 0]
            fleq = flequillo_de(g, cx if lado > 0 else cx - len(ofs), ofs if lado > 0 else ofs[::-1], cy - 1)
        else:
            gr = [[(cx - rx + 1, cy - 5), (cx - rx - 5, cy - 3), (cx - rx - 1, cy + 1)],
                  [(cx + rx - 1, cy - 6), (cx + rx + 5, cy - 5.5), (cx + rx + 1, cy - 1)],
                  [(cx - 2, cy - 9.5), (cx + 3, cy - 12), (cx + 2, cy - 8)],
                  [(cx - rx - 1, cy + 3), (cx - rx - 5, cy + 9), (cx - rx + 1, cy + 7)],
                  [(cx + rx + 1, cy + 1), (cx + rx + 4, cy + 6), (cx + rx, cy + 8)]]
            if vista == 'frente':
                fleq = flequillo_de(g, cx - 7, [2, 4, 6, 5, 3, 1, 0, 1, 2, 1, 0, 1, 3, 2, 1], cy - 1)
        for tri in gr:
            pelo.poligono(tri)

    elif estilo in ('corto', 'cola', 'mono', 'trenzas', 'pincho', 'flequillo'):
        # (2026-10-19) LOS PEINADOS DE LOS NPC: pelo sano, sin cicatrices ni
        # greñas. Un casquete que sigue al cráneo (con un pelo de volumen, a
        # la medida de la cabeza del juego) y la línea de la frente propia de
        # cada peinado; encima, lo de cada uno: la coleta, el moño, las dos
        # trenzas, las puntas o el flequillo recto.
        vol = Mascara(w, h).elipse(cx, cy - 0.4, rx + 0.9, ry + 0.7)
        if vista == 'frente':
            lim = M()
            for x in range(w):
                lim.columna(x, 0, cy + 3.5 if abs(x - cx) > rx - 2.5 else cy + 1)
            pelo.unir(vol.intersecar(lim))
            linea = {'corto':     [0, -1, -1, -2, -2, -3, -3, -3, -3, -3, -2, -2, -1, -1, 0],
                     'cola':      [-1, -2, -2, -3, -3, -3, -3, -3, -3, -3, -3, -2, -2, -1, -1],
                     'mono':      [-1, -2, -3, -3, -3, -4, -4, -4, -4, -4, -3, -3, -3, -2, -1],
                     'trenzas':   [1, 0, -1, -2, -2, -3, -3, -4, -3, -3, -2, -2, -1, 0, 1],
                     'pincho':    [0, -1, -2, -2, -2, -3, -2, -3, -2, -3, -2, -2, -1, -1, 0],
                     'flequillo': [2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2]}[estilo]
            fleq = flequillo_de(g, cx - 7, linea, cy - 1)
        elif vista == 'espalda':
            pelo.unir(vol.intersecar(M().rect(0, 0, w - 1, cy + 6.5)))
        else:
            lim = M()
            for x in range(w):
                atras = (x - cx) * lado <= -1
                lim.columna(x, 0, cy + 6.5 if atras else (cy + 3 if (x - cx) * lado <= 2 else cy + 1))
            pelo.unir(vol.intersecar(lim))
            linea = {'corto':     [-1, -1, -2, -2, -3, -3, -3, -2, -2, -1],
                     'cola':      [-2, -2, -3, -3, -3, -3, -3, -3, -2, -2],
                     'mono':      [-2, -3, -3, -4, -4, -4, -4, -3, -3, -2],
                     'trenzas':   [-1, -2, -2, -3, -3, -3, -3, -2, -2, -1],
                     'pincho':    [-1, -2, -2, -3, -2, -3, -2, -2, -1, -1],
                     'flequillo': [1, 1, 1, 1, 1, 1, 2, 2, 2, 2]}[estilo]
            if lado < 0:
                fleq = flequillo_de(g, cx - len(linea), linea[::-1], cy - 1)
            else:
                fleq = flequillo_de(g, cx, linea, cy - 1)
        if estilo == 'corto' and vista == 'frente':
            # La raya al lado.
            extras.append((M().linea(cx - 3, cy - ry + 1.5, cx - 2, cy - 3.5), 'raya_pelo'))
        elif estilo == 'cola':
            # La coleta: atada en la nuca con una cinta, cae hasta los hombros.
            if vista == 'espalda':
                pelo.poligono([(cx - 2.5, cy + 1), (cx + 2.5, cy + 1), (cx + 2, cuello + 5),
                               (cx + 0.5, cuello + 9), (cx - 1, cuello + 8), (cx - 2, cuello + 4)])
                extras.append((M().rect(cx - 2.5, cy + 1, cx + 2.5, cy + 2), 'cinta'))
            elif vista == 'lado':
                tx = cx - lado * (rx - 0.5)
                pelo.poligono([(tx, cy - 2), (tx - lado * 3, cy), (tx - lado * 4, cuello + 3),
                               (tx - lado * 2.5, cuello + 7), (tx - lado * 0.5, cuello + 2), (tx + lado * 0.5, cy + 2)])
                extras.append((M().linea(tx - lado * 0.5, cy - 1.5, tx - lado * 2.5, cy + 1.5, 2), 'cinta'))
        elif estilo == 'mono':
            # El moño: un ovillo arriba y atrás, con su vuelta marcada.
            if vista == 'frente':
                by = cy - ry - 0.5
                bun = M().elipse(cx, by, 3.8, 2.8)
            elif vista == 'espalda':
                by = cy - ry + 2.5
                bun = M().elipse(cx, by, 4.2, 3.6)
            else:
                by = cy - ry + 1
                bun = M().elipse(cx - lado * (rx - 3), by, 3.8, 3.6)
            pelo.unir(bun)
            extras.append((M().fila(int(round(by)), 0, w - 1).intersecar(bun), 'raya_pelo'))
        elif estilo == 'trenzas':
            # Dos trenzas por delante de los hombros (de lado se ve la de este
            # lado; de espaldas, no se ven). Cada vuelta de la trenza es una
            # raya, y abajo, la cinta y la punta.
            if vista == 'frente':
                xs = [cx - (rx - 0.5), cx + (rx - 0.5)]
                extras.append((M().columna(int(round(cx)), cy - ry + 2, cy - 3.5), 'raya_pelo'))
            elif vista == 'lado':
                xs = [cx - lado * 1.5]
            else:
                xs = []
                extras.append((M().columna(int(round(cx)), cy - ry + 2, cy + 6), 'raya_pelo'))
            for bx in xs:
                fin = cuello + 9
                pelo.poligono([(bx - 1.5, cy + 1), (bx + 1.5, cy + 1), (bx + 1.5, fin), (bx - 1.5, fin)])
                pelo.poligono([(bx - 2, fin + 1), (bx + 2, fin + 1), (bx, fin + 3)])
                for y in range(int(cy + 3), int(fin), 3):
                    extras.append((M().fila(y, bx - 1.5, bx + 1.5), 'raya_pelo'))
                extras.append((M().rect(bx - 1.5, fin, bx + 1.5, fin), 'cinta'))
        elif estilo == 'pincho':
            # Puntas cortas hacia arriba (de lado, peinadas hacia atrás).
            for k in (-6, -3, 0, 3, 6):
                bx = cx + k
                by = cy - math.sqrt(max(0.0, 1 - (k / (rx + 1.0)) ** 2)) * (ry + 0.6) + 1.5
                inclina = (-lado * 2.5) if vista == 'lado' else k * 0.35
                pelo.poligono([(bx - 2, by), (bx + 2, by), (bx + inclina, by - 4.5)])

    # La diadema del guardián: una banda de metal con una piedra en medio.
    if estilo == 'melena':
        banda = pelo.copia().unir(cr).intersecar(M().rect(0, cy - 2.5, w - 1, cy - 1.5))
        extras.append((banda, 'diadema'))
        if vista != 'espalda':
            px = cx if vista == 'frente' else cx + lado * (rx - 2.5)
            extras.append((M().rect(px - 0.5, cy - 2.5, px + 0.5, cy - 1.5), 'gema'))
    # El triángulo blanco del fantasma en la frente, y el cordón que lo ata.
    if estilo == 'yurei':
        cordon = M().fila(int(math.floor(cy - 1.5)), cx - rx - 1, cx + rx + 1).intersecar(pelo.copia().unir(cr))
        extras.append((cordon, 'cordon'))
        if vista == 'frente':
            extras.append((M().poligono([(cx - 3, cy - 1.5), (cx + 3, cy - 1.5), (cx, cy - 7)]), 'triangulo'))
        elif vista == 'lado':
            fx = cx + lado * 5
            extras.append((M().poligono([(fx - 2.5, cy - 1.5), (fx + 2.5, cy - 1.5), (fx, cy - 6)]), 'triangulo'))
    # Los peinados largos enmarcan la cara (por debajo del flequillo se ve la
    # cara); el rapado y el calvo se pintan tal cual.
    cortar = estilo not in ('calvo', 'rapado') and vista != 'espalda'
    return {'pelo': pelo, 'flequillo': fleq, 'extras': extras, 'cortar_cara': cortar}


def sombrero_bruja(g, w, h):
    """El sombrero de pico con ala ancha; la punta se dobla. (máscaras)"""
    cx, cy, rx, s, vista = g['cx'], g['cy'], g['rx'], g['s'], g['vista']
    lado = s if s else 1
    M = lambda: Mascara(w, h)
    if vista == 'lado':
        ala = M().elipse(cx + lado * 0.5, cy - 3, rx + 3.5, 2.2)
        k = -lado          # la punta cae hacia atrás
        copa = M().poligono([(cx - lado * 6, cy - 4), (cx + lado * 6, cy - 4), (cx + lado * 2.5, cy - 11),
                             (cx + k * 0.5, cy - 15.5), (cx + k * 6.5, cy - 18.5), (cx + k * 2, cy - 13),
                             (cx - lado * 3.5, cy - 9)])
        gema = None
    else:
        ala = M().elipse(cx, cy - 3, rx + 3, 2.2)
        k = 1 if vista == 'frente' else -1
        copa = M().poligono([(cx - 6.5, cy - 4), (cx + 6, cy - 4), (cx + k * 3.5, cy - 11),
                             (cx + k * 5.5, cy - 16), (cx + k * 9, cy - 18.5), (cx + k * 2.5, cy - 15),
                             (cx - k * 0.5, cy - 11)])
        gema = M().poligono([(cx - 1.5, cy - 6), (cx, cy - 7.5), (cx + 1.5, cy - 6), (cx, cy - 4.5)]) if vista == 'frente' else None
    banda = copa.copia().intersecar(M().rect(0, cy - 6.5, w - 1, cy - 5))
    return ala, copa, banda, gema


def pintar_pelo(li, m, t4, g):
    """
    Bandas lisas: sobre el cráneo según su cara a la luz; lo que cuelga, más
    oscuro hacia fuera. Mechones: una línea más oscura cada tres columnas.
    Y el brillo: un arco claro arriba a la izquierda.
    """
    cx, cy, rx, ry = g['cx'], g['cy'], g['rx'], g['ry']
    n = len(t4)
    for x, y in m.puntos():
        nx = (x - cx) / (rx + 1.0)
        ny = (y - cy) / (ry + 1.0)
        if y <= cy + ry * 0.25 and math.hypot(nx, ny) <= 1.2:
            d = nx * LUZ[0] + ny * LUZ[1]
            t = 0.5 - 0.42 * d
        else:
            t = 0.45 + 0.32 * min(1.0, abs(x - cx) / (rx + 3.0)) + 0.12 * min(1.0, (y - cy) / 22.0)
        k = int(max(0, min(n - 1, math.floor(t * n))))
        # Los mechones empiezan en la coronilla (si no, arriba parecía un casco).
        if y > cy - 6 and x % 3 == 0:
            k = min(n - 1, k + 1)
        li.set(x, y, t4[k])
    for x, y in m.puntos():
        nx = (x - cx) / rx
        ny = (y - cy) / ry
        r = math.hypot(nx, ny)
        if 0.52 <= r <= 0.74 and nx < 0.2 and ny < -0.3:
            li.set(x, y, t4[0])


def peinar(li, partes, cuello, dir_, n, receta):
    """Rehace la cabeza con el peinado (y el sombrero) de la receta."""
    w, h = li.w, li.h
    g = geometria_cabeza(partes, cuello, dir_)
    contorno = receta['contorno']
    t_pelo = receta['pelo_tonos']
    t_piel = receta['paletas']['piel'] if isinstance(receta['paletas'].get('piel'), list) else tonos('#c8a890', 3)
    # 1. La cara, guardada; lo demás por encima de la barbilla, fuera.
    cara = {(x, y): li.get(x, y) for (x, y) in g['cara']}
    for y in range(0, cuello - 1):
        for x in range(w):
            li.set(x, y, (0, 0, 0, 0))
    tipo = {}
    for (x, y), (p, c) in partes.items():
        if y >= cuello - 1:
            tipo[(x, y)] = p
    # 2. El cráneo, de piel (lo que no tape el pelo es frente o calva). Con
    #    sombrero, por encima del ala no queda nada: lo tapa la copa.
    sombrero = receta.get('sombrero')
    alto = g['cy'] - 4 if sombrero else 0
    cr = craneo(g, w, h).intersecar(Mascara(w, h).rect(0, alto, w - 1, cuello - 2))
    for x, y in cr.puntos():
        nx = (x - g['cx']) / g['rx']
        ny = (y - g['cy']) / g['ry']
        d = nx * LUZ[0] + ny * LUZ[1]
        k = 0 if d > 0.35 else (1 if d > -0.45 else 2)
        li.set(x, y, t_piel[min(len(t_piel) - 1, k)])
        tipo[(x, y)] = 'craneo'
    for (x, y), c in cara.items():
        li.set(x, y, c)
        tipo[(x, y)] = 'cara'
    # 3. El peinado. Lo que caiga sobre la cara por debajo del flequillo, fuera.
    pz = peinado(receta['pelo_estilo'], g, w, h)
    pelo = pz['pelo']
    if receta['pelo_estilo'] == 'rapado':
        t_pelo = [mezcla(c, t_piel[1], 0.38) for c in t_pelo]
    if pz['cortar_cara']:
        for (x, y) in g['cara']:
            tope = pz['flequillo'].get(x)
            if tope is None or y > tope:
                pelo.set(x, y, 0)
    if sombrero:
        ala, copa, banda, gema = sombrero_bruja(g, w, h)
        # Por encima del ala no asoma pelo: lo tapa la copa.
        pelo.restar(copa).restar(Mascara(w, h).rect(0, 0, w - 1, alto - 1))
    pintar_pelo(li, pelo, t_pelo, g)
    for x, y in pelo.puntos():
        tipo[(x, y)] = 'pelo'
    # 4. Los bordes de dentro: contra la ropa, contorno; contra la piel, el
    #    tono más oscuro del pelo (como el flequillo del juego).
    for x, y in pelo.puntos():
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if pelo.get(*q) or not li.get(*q)[3]:
                continue
            tq = tipo.get(q)
            if tq in ('camisa', 'pantalon', 'mano', 'otro', 'contorno'):
                li.set(x, y, contorno)
                break
            if tq in ('cara', 'craneo', 'piel'):
                li.set(x, y, t_pelo[-1])
    # 5. Lo de encima: cicatrices, diadema, el triángulo.
    for m, que in pz['extras']:
        for x, y in m.puntos():
            if not li.get(x, y)[3]:
                continue
            if que == 'cicatriz':
                li.set(x, y, hex_rgb('#5a2c2c'))
                if li.get(x, y + 1)[3] and tipo.get((x, y + 1)) in ('craneo', 'cara'):
                    li.set(x, y + 1, t_piel[0])
            elif que == 'raya':
                li.set(x, y, t_piel[0])
            elif que == 'raya_pelo':
                if tipo.get((x, y)) == 'pelo':
                    li.set(x, y, t_pelo[-1])
            elif que == 'diadema':
                li.set(x, y, hex_rgb('#c9b37a') if y < g['cy'] - 2 else hex_rgb('#8a7448'))
            elif que == 'gema':
                li.set(x, y, hex_rgb('#e0483a'))
            elif que == 'cordon':
                li.set(x, y, hex_rgb('#e8f4f2'))
            elif que == 'cinta':
                # (2026-10-19) La cinta de la coleta y de las trenzas.
                li.set(x, y, hex_rgb(receta.get('cinta') or '#b8403a'))
    for m, que in pz['extras']:
        if que == 'triangulo':
            for x, y in m.puntos():
                li.set(x, y, hex_rgb('#f6fbfa') if y < g['cy'] - 3 else hex_rgb('#d6e6e4'))
            for x, y in m.borde().puntos():
                if tipo.get((x, y)) == 'pelo' or not li.get(x, y)[3]:
                    li.set(x, y, contorno)
    # 6. El sombrero, encima de todo lo de la cabeza.
    if sombrero:
        t_ala, t_copa, t_banda, t_gema = receta['sombrero']
        cxh = g['cx']
        for x, y in copa.puntos():
            k = 0 if x < cxh - 2 else (1 if x < cxh + 2 else 2)
            li.set(x, y, t_copa[k])
        for x, y in banda.puntos():
            li.set(x, y, t_banda[0] if y <= g['cy'] - 6 else t_banda[1])
        for x, y in ala.puntos():
            # El ala: clara por arriba, oscura en el canto de delante.
            li.set(x, y, t_ala[0] if y < g['cy'] - 3.5 else (t_ala[1] if y < g['cy'] - 2 else t_ala[2]))
        if gema:
            for x, y in gema.puntos():
                li.set(x, y, t_gema[0] if (x <= cxh and y <= g['cy'] - 6) else t_gema[1])
        todo = copa.copia().unir(ala)
        # La línea entre el ala y la copa, y la del ala contra el pelo/cara.
        for x, y in todo.borde().puntos():
            if li.get(x, y)[3]:
                li.set(x, y, contorno)
        for x, y in copa.puntos():
            if ala.get(x, y + 1) and not ala.get(x, y):
                li.set(x, y, contorno)
    silueta_con_contorno(li, contorno)
    return li


# ── La ropa ──────────────────────────────────────────────────────────────────

def segmentos_fila(partes, y, que='camisa'):
    xs = sorted(x for (x, yy), (p, c) in partes.items() if yy == y and p == que)
    segs, cur = [], []
    for x in xs:
        if cur and x != cur[-1] + 1:
            segs.append(cur)
            cur = []
        cur.append(x)
    if cur:
        segs.append(cur)
    return segs


def brazo_y_torso(partes, cuello, cintura, dir_, lado_manga):
    """Por fila: (segmento del brazo que se rasga o None, segmento del torso)."""
    vista = vista_de(dir_)
    out = {}
    for y in range(cuello + 2, cintura + 1):
        segs = segmentos_fila(partes, y)
        if not segs:
            continue
        torso = max(segs, key=len)
        brazo = None
        if vista in ('frente', 'espalda') and len(segs) >= 3:
            izq = (lado_manga == 'izq') == (vista == 'frente')
            brazo = segs[0] if izq else segs[-1]
        elif vista == 'lado' and len(segs) >= 2:
            brazo = segs[0] if dir_ == 'derecha' else segs[-1]
        if brazo is not None and (len(brazo) > 5 or brazo is torso):
            brazo = None
        out[y] = (brazo, torso)
    return out


def rasgar(li, partes, cuello, cintura, dir_, semilla, t_piel, t_ropa, contorno):
    """La ropa del zombi, hecha jirones (pocos cortes, grandes y lisos)."""
    oscuro = mezcla(t_ropa[-1], contorno, 0.55)
    filas = brazo_y_torso(partes, cuello, cintura, dir_, 'izq' if semilla % 2 else 'der')
    vista = vista_de(dir_)
    # 1. La manga arrancada por el codo: el antebrazo, al aire.
    con_brazo = sorted(y for y, (b, t) in filas.items() if b)
    if len(con_brazo) >= 5:
        y_codo = con_brazo[0] + int((con_brazo[-1] - con_brazo[0]) * 0.42)
        for y in con_brazo:
            b = filas[y][0]
            for i, x in enumerate(b):
                corte = y_codo + ((x + semilla) % 2)
                if y == corte:
                    li.set(x, y, oscuro)
                elif y > corte:
                    li.set(x, y, t_piel[0] if i == 0 else (t_piel[1] if i < len(b) - 1 else t_piel[2]))
    # 2. La raja del pecho (o de la espalda): una diagonal larga.
    tors = {y: t for y, (b, t) in filas.items() if t and y < cintura - 2}
    if len(tors) >= 8:
        ys = sorted(tors)
        ya, yb = ys[1], ys[-3] if vista != 'lado' else ys[len(ys) // 2 + 2]
        ta, tb = tors[ya], tors[yb]
        baja_derecha = (semilla % 3 != 0) == (vista != 'espalda')
        if baja_derecha:
            ax, bx = ta[0] + 1, tb[-1] - 1
        else:
            ax, bx = ta[-1] - 1, tb[0] + 1
        L = math.hypot(bx - ax, yb - ya) or 1.0
        nxp, nyp = -(yb - ya) / L, (bx - ax) / L
        lado_a, lado_b = [], []
        pasos = 6
        for i in range(pasos + 1):
            u = i / float(pasos)
            px_, py_ = ax + (bx - ax) * u, ya + (yb - ya) * u
            a = (1.5 if i % 2 else 0.8) * (0.35 if i in (0, pasos) else 1.0)
            lado_a.append((px_ + nxp * a, py_ + nyp * a))
            lado_b.append((px_ - nxp * a * 0.9, py_ - nyp * a * 0.9))
        tajo = Mascara(li.w, li.h).poligono(lado_a + lado_b[::-1])
        es_tela = lambda x, y: partes.get((x, y), ('',))[0] == 'camisa'
        for x, y in tajo.puntos():
            if es_tela(x, y):
                li.set(x, y, t_piel[2] if not tajo.get(x, y - 1) else t_piel[1])
        for x, y in tajo.borde().puntos():
            if es_tela(x, y):
                li.set(x, y, oscuro)
    # 3. El bajo de la camisa: dos jirones en pico.
    fila_bajo = cintura - 1
    t = filas.get(fila_bajo, (None, None))[1]
    if t and len(t) >= 7:
        es_tela = lambda x, y: partes.get((x, y), ('',))[0] == 'camisa'
        for xc in (t[0] + 1 + semilla % 2, t[-1] - 3 - semilla % 2):
            for x in (xc - 1, xc, xc + 1, xc + 2):
                if es_tela(x, fila_bajo):
                    li.set(x, fila_bajo, t_piel[1])
            for x in (xc, xc + 1):
                if es_tela(x, fila_bajo - 1):
                    li.set(x, fila_bajo - 1, t_piel[1])
                if es_tela(x, fila_bajo - 2):
                    li.set(x, fila_bajo - 2, oscuro)
            for x in (xc - 1, xc + 2):
                if es_tela(x, fila_bajo - 1):
                    li.set(x, fila_bajo - 1, oscuro)
    # 4. Las perneras, deshilachadas: la espinilla asoma en pico.
    for (x, y), (p, c) in partes.items():
        if p == 'pantalon' and partes.get((x, y + 1), ('',))[0] == 'pies':
            if (x + semilla) % 3 != 0:
                li.set(x, y, t_piel[1])
            if (x + semilla) % 3 == 1 and partes.get((x, y - 1), ('',))[0] == 'pantalon':
                li.set(x, y - 1, t_piel[2])
    return li


def kimono(li, partes, cuello, cintura, dir_, t_ropa, t_obi, contorno):
    """
    La ropa del fantasma: un kimono blanco cruzado (la solapa izquierda
    sobre la derecha), un fajín y mangas anchas que cuelgan.
    """
    vista = vista_de(dir_)
    filas = brazo_y_torso(partes, cuello, cintura, dir_, 'izq')
    camisa = {(x, y) for (x, y), (p, c) in partes.items() if p == 'camisa'}
    cxb = geometria_cabeza(partes, cuello, dir_)['cxb']
    # La solapa: dos líneas desde el cuello que se cruzan en el pecho.
    if vista == 'frente':
        for (x0, y0, x1, y1) in ((cxb - 3, cuello, cxb + 3, cuello + 9), (cxb + 3, cuello, cxb + 0.5, cuello + 4)):
            for x, y in Mascara(li.w, li.h).linea(x0, y0, x1, y1).puntos():
                if (x, y) in camisa:
                    li.set(x, y, t_ropa[-1])
                    if (x, y - 1) in camisa:
                        li.set(x, y - 1, t_ropa[0])
    elif vista == 'lado':
        s = 1 if dir_ == 'derecha' else -1
        for x, y in Mascara(li.w, li.h).linea(cxb + s * 2, cuello, cxb + s * 4, cuello + 7).puntos():
            if (x, y) in camisa:
                li.set(x, y, t_ropa[-1])
    # El fajín.
    for y in (cintura - 3, cintura - 2):
        t = filas.get(y, (None, None))[1]
        for x in (t or []):
            li.set(x, y, t_obi[0] if y == cintura - 3 else t_obi[1])
    # Las mangas: cuelgan del codo al bajo de la mano, por fuera del brazo.
    con_brazo = sorted(y for y, (b, t) in filas.items() if b)
    lados = []
    if vista in ('frente', 'espalda'):
        for y in range(cuello + 2, cintura + 1):
            segs = segmentos_fila(partes, y)
            if len(segs) >= 3:
                lados.append((y, segs[0][0], -1))
                lados.append((y, segs[-1][-1], 1))
    elif con_brazo:
        s = 1 if dir_ == 'derecha' else -1
        for y in con_brazo:
            b = filas[y][0]
            lados.append((y, b[0] if s > 0 else b[-1], -s))
    manga = Mascara(li.w, li.h)
    if lados:
        ys = sorted(set(y for y, x, sg in lados))
        y_codo = ys[0] + (ys[-1] - ys[0]) // 2
        for y, x, sg in lados:
            if y < y_codo:
                continue
            caida = 1 + min(2, (y - y_codo) // 3)
            for k in range(1, caida + 1):
                manga.set(x + sg * k, y)
        # Y el bajo de la manga cae un poco más que la mano.
        for y, x, sg in lados:
            if y >= ys[-1] - 1:
                for k in range(0, 3):
                    manga.set(x + sg * k, y + 1)
                    manga.set(x + sg * k, y + 2)
    # La manga: lisa, con el canto de fuera en sombra.
    fuera = manga.borde_interno()
    for x, y in manga.puntos():
        if not li.get(x, y)[3]:
            li.set(x, y, t_ropa[2] if fuera.get(x, y) else t_ropa[1])
    silueta_con_contorno(li, contorno)
    return li


def capa(li, partes, cuello, cintura, dir_, t_capa, ribete, contorno):
    """La capa de la bruja: detrás del cuerpo (por delante solo asoman los
    bordes); de espaldas la tapa entera, con dos pliegues y su ribete."""
    vista = vista_de(dir_)
    w, h = li.w, li.h
    # (2026-10-12) Más corta y con menos vuelo: tan ancha y hasta los pies,
    # en el juego se veía un rectángulo oscuro detrás de la bruja.
    fondo = cintura + 6
    opaco = li.mascara_opaca()
    m = Mascara(w, h)
    # El ancho de los hombros (unas filas por debajo del cuello) y desde ahí
    # se abre poco a poco.
    # Solo la camisa (torso y mangas): con todo lo opaco entraba el pelo largo
    # del personaje base y la capa salía de borde a borde del cuadro.
    hombro = [x for (x, y), (p, _c) in partes.items() if p == 'camisa' and cuello + 2 <= y < cuello + 5]
    if not hombro:
        hombro = [x for x in range(w) for y in range(cuello + 2, cuello + 5) if opaco.get(x, y)]
    if not hombro:
        return li
    h0, h1 = min(hombro), max(hombro)
    s = 1 if dir_ == 'derecha' else -1
    for y in range(cuello + 1, fondo + 1):
        vuelo = (y - cuello) / 14.0
        if vista == 'lado':
            atras = h0 if s > 0 else h1
            borde = atras - s * (1.5 + vuelo)
            a, b = (borde, atras) if s > 0 else (atras, borde)
            m.fila(y, a, b)
        else:
            m.fila(y, h0 - 0.5 - vuelo, h1 + 0.5 + vuelo)
    if vista == 'espalda':
        # Por detrás, la capa va ENCIMA del cuerpo (menos los pies), con dos
        # pliegues: dos líneas largas, no un tramado.
        cx = sum(x for x, y in m.puntos()) / float(max(1, m.cuenta()))
        for x, y in m.puntos():
            p = partes.get((x, y), ('',))[0]
            if y >= fondo:
                li.set(x, y, ribete)
            elif p != 'pies':
                pliegue = abs(x - (cx - 3)) < 0.5 or abs(x - (cx + 3)) < 0.5
                li.set(x, y, t_capa[2] if pliegue else (t_capa[0] if x < cx else t_capa[1]))
    else:
        for x, y in m.puntos():
            if not li.get(x, y)[3]:
                li.set(x, y, ribete if y >= fondo else t_capa[1])
    silueta_con_contorno(li, contorno)
    return li


# ── Los humanoides ───────────────────────────────────────────────────────────
ZOMBIS = {
    # variante: (personaje base, piel, ropa, pelo, peinado)
    #   lacio    largo y lacio, con raya en medio y un mechón sobre un ojo
    #   calvo    coronilla pelada, mechones sobre las orejas y una cicatriz
    #   rapado   al cero, con una cicatriz que lo cruza
    #   salvaje  una mata enmarañada con greñas que se salen
    'zombi_a': ('personaje1', '#8fa476', '#5a4d3c', '#3f3a33', 'lacio'),
    'zombi_b': ('personaje5', '#93a688', '#3c5566', '#9aa3a6', 'calvo'),
    'zombi_c': ('personaje10', '#86a07a', '#3a4a5e', '#2f3d55', 'rapado'),
    'zombi_d': ('personaje12', '#9aa97f', '#5e3b3b', '#7a3030', 'salvaje'),
}


def humanoide(per, dir_, n, receta):
    im, partes, cuello, cintura = etiquetar(per, dir_, n)
    w, h = im.size
    li = recolorear(partes, w, h, receta['paletas'], receta['contorno'])
    if receta.get('tunica'):
        li = tunica(li, partes, cintura, receta['tunica'], receta['ribete'], receta['contorno'])
    if receta.get('cola'):
        li = cola_fantasma(li, partes, cintura, n, receta['cola'], receta['contorno'])
    # Margen alrededor: el báculo y la cola se salen del cuadro del personaje.
    MX, MY = 5, 9
    li = pegar_centrado(li, li.w + MX * 2, li.h + MY, MX, MY)
    # (2026-10-11) La ropa (rasgada, kimono, capa) y luego la cabeza nueva.
    if receta.get('ropa') or receta.get('pelo_estilo') or receta.get('despues'):
        desp = {(x + MX, y + MY): v for (x, y), v in partes.items()}
        if receta.get('ropa'):
            li = receta['ropa'](li, desp, cuello + MY, cintura + MY, dir_, n)
        if receta.get('pelo_estilo'):
            li = peinar(li, desp, cuello + MY, dir_, n, receta)
        # (2026-10-19) Lo que va encima de todo (la calavera del esqueleto).
        if receta.get('despues'):
            li = receta['despues'](li, desp, cuello + MY, cintura + MY, dir_, n)
    if receta.get('baculo'):
        mano = mano_delantera(partes, dir_)
        if mano:
            mx, my = mano[0] + MX + (1 if dir_ in ('derecha', 'abajo') else -1), mano[1] + MY
            delante = dir_ in ('derecha', 'izquierda', 'abajo')
            capa = Lienzo(li.w, li.h)
            baculo(capa, mx, my, receta['baculo_arriba'], 10, receta['madera'], receta['cristal'], receta['contorno'])
            if delante:
                # Delante del cuerpo, pero la mano que lo agarra va encima.
                li.pegar(capa)
                tono_mano = receta['paletas']['mano'][1] if isinstance(receta['paletas'].get('mano'), list) else None
                for (x, y), (p, c) in partes.items():
                    if p == 'mano' and abs(x + MX - mx) <= 1 and abs(y + MY - my) <= 1:
                        li.set(x + MX, y + MY, tono_mano or c)
            else:
                # De espaldas: el báculo asoma por detrás del cuerpo.
                capa.pegar(li)
                li = capa
    return li


def receta_zombi(piel, ropa, pelo, jefe=False, estilo='lacio', semilla=0):
    contorno = (20, 18, 16)
    tonos_piel = tonos(piel, 3, arriba=0.18, abajo=0.36)
    tonos_ropa = tonos(ropa, 4, arriba=0.2, abajo=0.5)

    def jirones(li, partes, cuello, cintura, dir_, n):
        return rasgar(li, partes, cuello, cintura, dir_, semilla, tonos_piel, tonos_ropa, contorno)
    return {
        'contorno': contorno,
        'paletas': {
            'piel': tonos_piel, 'mano': tonos_piel, 'pies': tonos(piel, 3, arriba=0.1, abajo=0.45),
            'ojo': ojos_brillantes(hex_rgb('#ff6a4d') if jefe else hex_rgb('#e6dc78'), hex_rgb('#3b1410')),
            'pelo': tonos(pelo, 4, arriba=0.22, abajo=0.5),
            'camisa': tonos_ropa,
            'pantalon': tonos(ropa, 4, arriba=0.12, abajo=0.58),
        },
        'pelo_estilo': estilo,
        'pelo_tonos': tonos(pelo, 4, arriba=0.3, abajo=0.5),
        'ropa': jirones,
    }


def _kimono_fantasma(li, partes, cuello, cintura, dir_, n):
    return kimono(li, partes, cuello, cintura, dir_, tonos('#dcefec', 4, arriba=0.3, abajo=0.4),
                  tonos('#6f9aa6', 2, arriba=0.2), hex_rgb('#163a40'))


# (2026-10-11) Pelo y ropa nuevos: la melena larga y oscura de los fantasmas
# de siempre, con raya en medio y el triángulo blanco en la frente; y un
# kimono blanco cruzado con fajín y mangas que cuelgan.
RECETA_FANTASMA = {
    'contorno': hex_rgb('#163a40'),
    'paletas': {
        'piel': tonos('#b9ece4', 3, arriba=0.3), 'mano': tonos('#b9ece4', 3, arriba=0.3),
        'ojo': ojos_brillantes(hex_rgb('#f2fffd'), hex_rgb('#2d6e70')),
        'pelo': tonos('#8fd2cb', 4, arriba=0.4, abajo=0.4),
        'camisa': tonos('#dcefec', 4, arriba=0.3, abajo=0.4),
        'pantalon': tonos('#cfe7e3', 3),
    },
    'cola': tonos('#cfe7e3', 3, arriba=0.3, abajo=0.4),
    'pelo_estilo': 'yurei',
    'pelo_tonos': tonos('#24434d', 4, arriba=0.45, abajo=0.45),
    'ropa': _kimono_fantasma,
}

def tela_con_brillos(base, brillo):
    """La ropa del personaje 13 lleva detalles que brillan: esos van a `brillo`,
    el resto a la rampa de `base` según lo oscuro que fuera."""
    r = rampa(hex_rgb(base), 4, abajo=0.5)
    b = rampa(hex_rgb(brillo), 3)[0]

    def f(c):
        if a_hsv(c)[1] > 0.45 and lum(c) > 0.45:
            return b
        k = int((1 - lum(c) * 2.2) * 3.4)
        return r[max(0, min(3, k))]
    return f


def _capa_de(base, ribete, contorno):
    t = tonos(base, 3, arriba=0.25, abajo=0.45)

    def f(li, partes, cuello, cintura, dir_, n):
        return capa(li, partes, cuello, cintura, dir_, t, hex_rgb(ribete), hex_rgb(contorno))
    return f


def _sombrero(copa, banda, gema):
    return (tonos(copa, 3, arriba=0.3, abajo=0.5), tonos(copa, 3, arriba=0.22, abajo=0.45),
            tonos(banda, 2, arriba=0.2), tonos(gema, 2, arriba=0.4))


# (2026-10-11) La bruja de la ceniza (la de la mina): sombrero de pico con la
# punta doblada y cinta naranja, melena gris ceniza y capa con ribete dorado.
RECETA_MAGO = {
    'pelo_estilo': 'larga',
    'pelo_tonos': tonos('#b9b2c4', 4, arriba=0.35, abajo=0.5),
    'sombrero': _sombrero('#3a2140', '#e07a2e', '#ffc46a'),
    'ropa': _capa_de('#2a1530', '#c9a14a', '#1a0f17'),
    'contorno': hex_rgb('#1a0f17'),
    'paletas': {
        'piel': tonos('#b8a7a0', 3, arriba=0.15, abajo=0.4), 'mano': tonos('#b8a7a0', 3, arriba=0.15, abajo=0.4),
        'pies': tonos('#3a2530', 3),
        'ojo': ojos_brillantes(hex_rgb('#ffb347'), hex_rgb('#5a1d08')),
        'pelo': tonos('#5b3352', 4, arriba=0.28, abajo=0.5),
        'camisa': tela_con_brillos('#4a2a4f', '#ff9b4a'),
        'pantalon': tonos('#3e2342', 3, abajo=0.5),
    },
    'tunica': tonos('#4a2a4f', 3, arriba=0.25, abajo=0.45),
    'ribete': hex_rgb('#c9a14a'),
    'baculo': True, 'baculo_arriba': 22,
    'madera': [hex_rgb('#7a4f2c'), hex_rgb('#5c3a1f')],
    'cristal': [hex_rgb('#fff1b8'), hex_rgb('#ffb347'), hex_rgb('#e0602a')],
}

# (2026-10-11) La bruja de la tormenta (la del mapa salvaje): sombrero azul
# noche con cinta celeste, melena azul pálido y capa.
RECETA_BRUJO = {
    'pelo_estilo': 'larga',
    'pelo_tonos': tonos('#a8dcf0', 4, arriba=0.35, abajo=0.5),
    'sombrero': _sombrero('#1e2a44', '#6fe3ff', '#bff6ff'),
    'ropa': _capa_de('#16203a', '#6fe3ff', '#0d1420'),
    'contorno': hex_rgb('#0d1420'),
    'paletas': {
        'piel': tonos('#c9d4e2', 3, arriba=0.2, abajo=0.38), 'mano': tonos('#c9d4e2', 3, arriba=0.2, abajo=0.38),
        'ojo': ojos_brillantes(hex_rgb('#aaf6ff'), hex_rgb('#14435a')),
        'pelo': tonos('#3e506d', 4, arriba=0.3, abajo=0.5),
        'camisa': tela_con_brillos('#2f3e5a', '#7fe6ff'),
        'pantalon': tonos('#2f3e5a', 3),
    },
    'cola': tonos('#3a4c6c', 3, arriba=0.3, abajo=0.45),
    'baculo': True, 'baculo_arriba': 24,
    'madera': [hex_rgb('#5d6676'), hex_rgb('#434a57')],
    'cristal': [hex_rgb('#effdff'), hex_rgb('#8ce9ff'), hex_rgb('#3b8fd6')],
}


# ── LOS DE LOS MAPAS NUEVOS (2026-10-18) ──────────────────────────────────
# El ESQUELETO del cementerio: hueso donde el zombi tiene piel, la calavera
# rapada (sin pelo), harapos oscuros rasgados que dejan ver el hueso y los
# ojos encendidos en rojo.
# ===========================================================================
# EL ESQUELETO DE VERDAD                                          (2026-10-19)
# ===========================================================================
# "Quiero que en el cementerio existan esqueletos." Había uno, pero era un
# zombi teñido de color hueso con ropa oscura: de lejos, una persona gris.
# Ahora es HUESO: sobre el mismo cuerpo del personaje (mismo tamaño, mismo
# paso), la ropa y la piel se borran y en su sitio van la columna, las
# costillas con el aire entre ellas, la pelvis, brazos y piernas de un hueso
# (con la rodilla), las manos y los pies; y la cabeza es una calavera: bóveda,
# mandíbula, cuencas negras con una brasa roja, la nariz y los dientes.
#
# SIN AGUJEROS EN RACIMO (tripofobia): las costillas son RAYAS con hueco
# entre ellas, los dientes una fila, y en la cara solo las dos cuencas.

HUESO = tonos('#ece4cc', 3, arriba=0.12, abajo=0.44)     # claro, medio, sombra
C_HUESO = (34, 28, 24)
CUENCA = (24, 18, 16)
BRASA = (255, 92, 58)


def _tono_luz(x, y, cx, cy, rx, ry, t):
    nx, ny = (x - cx) / max(1.0, rx), (y - cy) / max(1.0, ry)
    d = nx * LUZ[0] + ny * LUZ[1]
    return t[0] if d > 0.3 else (t[1] if d > -0.45 else t[2])


def _segmentos(xs):
    xs = sorted(xs)
    segs, cur = [], []
    for x in xs:
        if cur and x != cur[-1] + 1:
            segs.append(cur)
            cur = []
        cur.append(x)
    if cur:
        segs.append(cur)
    return segs


def _huesos(li, partes, cuello, cintura, dir_, n):
    """El cuerpo, de hueso: columna, costillas, pelvis, brazos, piernas."""
    t = HUESO
    vista = vista_de(dir_)
    # 1. Fuera la ropa y la piel del cuerpo (la cabeza se rehace después).
    filas_arriba, filas_abajo, manos, pies = {}, {}, [], []
    for (x, y), (p, cc) in partes.items():
        if y < cuello:
            continue
        li.set(x, y, (0, 0, 0, 0))
        if p == 'mano':
            manos.append((x, y))
        elif p == 'pies':
            pies.append((x, y))
        if p in ('camisa', 'piel', 'mano') and y < cintura:
            filas_arriba.setdefault(y, []).append(x)
        elif p in ('pantalon', 'pies', 'piel') and y >= cintura:
            filas_abajo.setdefault(y, []).append(x)
    hueso = {}                                   # (x, y) -> tono

    def pon(x, y, k):
        hueso[(x, y)] = t[k]

    # 2. El tronco: por fila, el segmento más ancho; el resto son brazos.
    alto = max(1, cintura - cuello)
    caja_y0 = cuello + 3
    caja_y1 = cuello + 3 + int(alto * 0.56)
    for y in range(cuello, cintura + 1):
        xs = filas_arriba.get(y) or filas_arriba.get(y - 1)
        if not xs:
            continue
        segs = _segmentos(xs)
        torso = max(segs, key=len)
        t0, t1 = torso[0], torso[-1]
        if vista == 'lado':
            sx = t0 + 2 if dir_ == 'derecha' else t1 - 2       # la columna, a la espalda
            frente = t1 - 1 if dir_ == 'derecha' else t0 + 1
        else:
            sx = (t0 + t1) // 2
        # La columna (y el cuello): dos píxeles, vértebra a vértebra.
        for xx in ((sx, sx + 1) if vista != 'lado' else (sx,)):
            pon(xx, y, 1 if (y - cuello) % 3 else 2)
        if y == cuello + 1:
            # Las clavículas, de hombro a hombro.
            for xx in range(t0, t1 + 1):
                pon(xx, y, 0 if xx < sx else 1)
        elif caja_y0 <= y <= caja_y1 and (y - caja_y0) % 3 == 0:
            # Una costilla: raya de lado a lado (de frente) o de la columna
            # al pecho (de lado), un poco más corta cuanto más abajo.
            enc = int(round((y - caja_y0) / float(max(1, caja_y1 - caja_y0)) * 2))
            if vista == 'lado':
                a, b = sorted((sx, frente))
                rango = range(a, b + 1)
            else:
                rango = range(t0 + 1 + enc, t1 - enc)
            for xx in rango:
                pon(xx, y, 0 if (vista != 'lado' and xx < sx) else 1)
            # La curva de la costilla hacia abajo en los extremos.
            if vista != 'lado':
                pon(t0 + 1 + enc, y + 1, 2)
                pon(t1 - 1 - enc, y + 1, 2)
        elif y == cintura - 1:
            # La pelvis: la cresta de cadera a cadera...
            for xx in range(t0 + 1, t1):
                pon(xx, y, 0 if xx < sx else 1)
        elif y == cintura:
            # ...y debajo solo las dos caderas y el sacro (no un bloque).
            for xx in (t0 + 1, t0 + 2, t1 - 2, t1 - 1):
                pon(xx, y, 1)
        # Los brazos: un hueso por el centro de cada segmento que no es tronco.
        for sg in segs:
            if sg is torso:
                continue
            m = (sg[0] + sg[-1]) // 2
            pon(m, y, 1)
            if len(sg) >= 4:
                pon(m + 1, y, 2)
    # 3. Las manos: la mano entera, de hueso.
    for (x, y) in manos:
        pon(x, y, 1 if (x + y) % 2 else 0)
    # 4. Las piernas: un hueso por pierna, con la rodilla, y los pies.
    ys = sorted(filas_abajo)
    if ys:
        rodilla = ys[0] + (ys[-1] - ys[0]) * 0.45
        for y in ys:
            if y < cintura + 1:
                continue
            for sg in _segmentos(filas_abajo[y]):
                m = (sg[0] + sg[-1]) // 2
                pon(m, y, 1)
                if len(sg) >= 4:
                    pon(m + 1, y, 2)
                if abs(y - rodilla) < 1.0:
                    pon(m - 1, y, 0)
                    pon(m + 2, y, 2)
    for (x, y) in pies:
        pon(x, y, 1 if y % 2 else 2)
    # 5. Pintar y contornear SOLO los huesos (la cabeza ya lleva su borde).
    for (x, y), col in hueso.items():
        li.set(x, y, col)
    for (x, y) in list(hueso):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in hueso and not li.get(q[0], q[1])[3]:
                li.set(q[0], q[1], C_HUESO)
    return li


def _craneo_esqueleto(li, partes, cuello, cintura, dir_, n):
    """La calavera: bóveda y mandíbula de hueso, cuencas con brasa, nariz, dientes."""
    t = HUESO
    g = geometria_cabeza(partes, cuello, dir_)
    cx, cy, rx, ry, s, vista = g['cx'], g['cy'], g['rx'], g['ry'], g['s'], g['vista']
    w, h = li.w, li.h
    for y in range(0, cuello):
        for x in range(w):
            li.set(x, y, (0, 0, 0, 0))
    boveda = Mascara(w, h).elipse(cx, cy - 0.2, rx - 1.1, ry - 1.6)
    jx = cx + 1.6 * s
    ancho = 4.6 if vista != 'lado' else 4.2
    mandibula = Mascara(w, h).poligono([(jx - ancho - 0.6, cy + 2.5), (jx + ancho + 0.6, cy + 2.5),
                                         (jx + ancho - 0.6, cuello - 1.2), (jx - ancho + 0.6, cuello - 1.2)])
    cabeza = boveda.copia().unir(mandibula)
    for x, y in cabeza.puntos():
        li.set(x, y, _tono_luz(x, y, cx, cy, rx, ry, t))
    # El pómulo bajo la bóveda: una raya de sombra, no un hueco.
    for x, y in mandibula.puntos():
        if not boveda.get(x, y) and y == int(round(cy + 2.5)):
            li.set(x, y, t[2])
    if vista == 'frente':
        for ox in (-3.4, 2.4):
            for dx in range(0, 3):
                for dy in range(0, 3):
                    if (dx, dy) in ((0, 0), (2, 0)):
                        continue                      # cuenca redondeada arriba
                    li.set(int(round(cx + ox)) + dx, int(round(cy + 0.4)) + dy, CUENCA)
            li.set(int(round(cx + ox)) + 1, int(round(cy + 0.4)) + 1, BRASA)
        li.set(int(round(cx)), int(round(cy + 4.0)), CUENCA)            # la nariz
        li.set(int(round(cx)) - 1, int(round(cy + 4.6)), CUENCA)
        li.set(int(round(cx)), int(round(cy + 4.6)), CUENCA)
        yb = int(round(cy + 6.6))                                       # la boca y los dientes
        for x in range(int(round(jx - 3)), int(round(jx + 3)) + 1):
            li.set(x, yb, CUENCA)
            li.set(x, yb - 1, t[0] if (x - int(round(jx))) % 2 == 0 else t[1])
            li.set(x, yb + 1, t[1] if (x - int(round(jx))) % 2 == 0 else t[2])
    elif vista == 'lado':
        ox = int(round(cx + 3.0 * s))
        for dx in range(0, 3):
            for dy in range(0, 3):
                if (dx, dy) in ((0, 0), (2, 0)):
                    continue
                li.set(ox + dx - 1, int(round(cy + 0.4)) + dy, CUENCA)
        li.set(ox, int(round(cy + 0.4)) + 1, BRASA)
        nz = int(round(cx + (rx - 1.2) * s))
        li.set(nz, int(round(cy + 4.0)), CUENCA)                       # la nariz, en el perfil
        yb = int(round(cy + 6.6))
        for i in range(0, 4):
            x = int(round(jx + s * (ancho - 0.6 - i)))
            li.set(x, yb, CUENCA)
            li.set(x, yb - 1, t[0] if i % 2 == 0 else t[1])
    else:
        # De espaldas: la bóveda lisa, con la línea de la nuca.
        for x in range(int(round(cx - 4)), int(round(cx + 4)) + 1):
            if cabeza.get(x, int(round(cy + 2.5))):
                li.set(x, int(round(cy + 2.5)), t[2])
    for x, y in cabeza.borde(diagonales=False).puntos():
        if not li.get(x, y)[3] or y >= cuello - 1:
            li.set(x, y, C_HUESO)
    return li


def _espada_oxidada(li, partes, cuello, cintura, dir_, n):
    """El guerrero: los huesos, la calavera y una espada vieja en la mano."""
    li = _craneo_esqueleto(li, partes, cuello, cintura, dir_, n)
    manos = [(x, y) for (x, y), (p, cc) in partes.items() if p == 'mano']
    if not manos:
        return li
    if dir_ == 'derecha':
        mx = max(m[0] for m in manos)
    elif dir_ == 'izquierda':
        mx = min(m[0] for m in manos)
    else:
        mx = max(m[0] for m in manos) if dir_ == 'abajo' else min(m[0] for m in manos)
    my = int(round(sum(m[1] for m in manos if abs(m[0] - mx) <= 1) / float(len([m for m in manos if abs(m[0] - mx) <= 1]))))
    acero = [(214, 220, 228), (156, 164, 174), (104, 110, 120)]
    oxido = (150, 92, 54)
    capa = Lienzo(li.w, li.h)
    hoja = Mascara(li.w, li.h).rect(mx, my - 17, mx + 1, my - 2)
    punta = Mascara(li.w, li.h).poligono([(mx - 0.4, my - 17), (mx + 1.4, my - 17), (mx + 0.5, my - 19.5)])
    hoja.unir(punta)
    for x, y in hoja.puntos():
        k = 0 if x == mx else 1
        if (y + mx) % 6 == 0:
            k = 2
        col = acero[k]
        if y > my - 6 and x == mx + 1:
            col = oxido                                   # el óxido junto a la guarda
        capa.set(x, y, col)
    for x in range(mx - 2, mx + 4):
        capa.set(x, my - 1, (120, 92, 60))                # la guarda
    capa.set(mx, my + 1, (70, 50, 34))                    # el puño
    capa.set(mx + 1, my + 1, (70, 50, 34))
    capa.set(mx, my + 2, (190, 160, 90))                  # el pomo
    m = capa.mascara_opaca()
    for x, y in m.borde(diagonales=False).puntos():
        capa.set(x, y, C_HUESO)
    if dir_ == 'arriba':
        capa.pegar(li)                                    # de espaldas, por detrás
        return capa
    li.pegar(capa)
    return li


def receta_esqueleto(semilla=31, espada=False):
    """El esqueleto: huesos (`_huesos`) y calavera (`_craneo_esqueleto`)."""
    return {
        'contorno': C_HUESO,
        'paletas': {
            'piel': HUESO, 'mano': HUESO, 'pies': HUESO,
            'ojo': ojos_brillantes(BRASA, CUENCA),
            'pelo': HUESO, 'camisa': HUESO, 'pantalon': HUESO,
        },
        'ropa': _huesos,
        'despues': _espada_oxidada if espada else _craneo_esqueleto,
    }


# El NIGROMANTE: la bruja de la mina vuelta a teñir, con capucha negra (sin
# sombrero), melena negra, capa con ribete verde de alma y báculo verde.
RECETA_NIGROMANTE = {
    'pelo_estilo': 'larga',
    'pelo_tonos': tonos('#2a2a33', 4, arriba=0.3, abajo=0.5),
    'ropa': _capa_de('#16161e', '#7dffb8', '#08090c'),
    'contorno': hex_rgb('#08090c'),
    'paletas': {
        'piel': tonos('#a9b3a6', 3, arriba=0.15, abajo=0.4), 'mano': tonos('#a9b3a6', 3, arriba=0.15, abajo=0.4),
        'pies': tonos('#22222a', 3),
        'ojo': ojos_brillantes(hex_rgb('#9dffcf'), hex_rgb('#0e3a26')),
        'pelo': tonos('#2a2a33', 4, arriba=0.28, abajo=0.5),
        'camisa': tela_con_brillos('#26262f', '#7dffb8'),
        'pantalon': tonos('#1f1f27', 3, abajo=0.5),
    },
    'tunica': tonos('#26262f', 3, arriba=0.25, abajo=0.45),
    'ribete': hex_rgb('#5fd99a'),
    'baculo': True, 'baculo_arriba': 24,
    'madera': [hex_rgb('#4a4038'), hex_rgb('#332b25')],
    'cristal': [hex_rgb('#e8fff2'), hex_rgb('#7dffb8'), hex_rgb('#2f9a66')],
}


def _vendas(li, partes, cuello, cintura, dir_, n):
    """Las vendas de la momia: cada tres filas una raya más oscura (la vuelta
    de la venda), desplazada en zigzag; rayas, nunca puntos."""
    for (x, y), (p, c) in partes.items():
        if p not in ('camisa', 'pantalon', 'piel', 'mano', 'pies'):
            continue
        if (y + (x // 6) % 2) % 3 == 0:
            cc = li.get(x, y)
            if cc[3] and lum(cc[:3]) > 0.2:
                li.set(x, y, (int(cc[0] * 0.76), int(cc[1] * 0.74), int(cc[2] * 0.7), 255))
    return li


# La MOMIA del desierto: todo vendas color hueso viejo y los ojos de ascua.
RECETA_MOMIA = {
    'contorno': (34, 26, 18),
    'paletas': {
        'piel': tonos('#d6c8a0', 3, arriba=0.15, abajo=0.38), 'mano': tonos('#d6c8a0', 3, arriba=0.15, abajo=0.38),
        'pies': tonos('#b9a97f', 3, arriba=0.1, abajo=0.45),
        'ojo': ojos_brillantes(hex_rgb('#ffd04a'), hex_rgb('#2a1606')),
        'pelo': tonos('#cbbd94', 4, arriba=0.2, abajo=0.45),
        'camisa': tonos('#cfc199', 4, arriba=0.18, abajo=0.48),
        'pantalon': tonos('#c4b58c', 4, arriba=0.12, abajo=0.5),
    },
    'pelo_estilo': 'rapado',
    'pelo_tonos': tonos('#cfc199', 4, arriba=0.2, abajo=0.45),
    'ropa': _vendas,
}


def frames_humanoide(per, receta, extra=None):
    out = {}
    for d in DIRS:
        for n in range(1, FOTOS + 1):
            li = humanoide(per, d, n, receta)
            if extra:
                li = extra(li, per, d, n)
            out['%s_%d' % (d, n)] = li
    return out
