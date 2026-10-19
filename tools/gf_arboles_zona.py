# -*- coding: utf-8 -*-
"""
=============================================================================
LOS ÁRBOLES DE LOS MAPAS NUEVOS                                  (2026-10-18)
=============================================================================

Los árboles salen del paquete de siempre (tileset_nuevos/arboles, 128x160,
el juego los pone a 1.3 como en el mapa salvaje): sus originales no se tocan,
se escriben COPIAS en la carpeta de cada mapa.

  · CEMENTERIO: el árbol seco, más oscuro y frío (corteza gris de ceniza).
  · DESIERTO: las dos palmeras del paquete, tal cual, en los oasis.
  · TUNDRA: abeto, pino y árbol seco NEVADOS: la nieve se posa en lo de
    arriba de cada piso de ramas (el borde de arriba de cada parte, de dos o
    tres píxeles de grueso: una banda, no motas) y el verde se enfría.
=============================================================================
"""
import colorsys
import os

from PIL import Image

NIEVE = [(246, 250, 255), (226, 236, 248), (198, 214, 234)]


def _hsv(c):
    return colorsys.rgb_to_hsv(c[0] / 255.0, c[1] / 255.0, c[2] / 255.0)


def _rgb(h, s, v):
    r, g, b = colorsys.hsv_to_rgb(h % 1.0, max(0, min(1, s)), max(0, min(1, v)))
    return (int(round(r * 255)), int(round(g * 255)), int(round(b * 255)))


def oscurecer_seco(im):
    """Corteza gris de ceniza para el cementerio."""
    im = im.convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            h, s, v = _hsv((r, g, b))
            px[x, y] = _rgb(0.07 + (h - 0.07) * 0.3, s * 0.38, v * 0.8) + (a,)
    return im


def nevar(im, grueso=3):
    """La nieve encima de cada piso de ramas y el verde, más frío."""
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    orig = [[px[x, y] for x in range(w)] for y in range(h)]

    def es_hoja(c):
        if c[3] < 128:
            return False
        hh, s, v = _hsv(c[:3])
        return 0.17 < hh < 0.5 and s > 0.22 and v > 0.18

    def es_rama(c):
        if c[3] < 128:
            return False
        hh, s, v = _hsv(c[:3])
        return (hh < 0.12 or hh > 0.95) and v > 0.2

    def lum(c):
        return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255.0

    # 1) Dónde caería: el borde de arriba de cada parte (lo de encima es aire
    #    o la línea oscura del dibujo), `grueso` píxeles hacia abajo.
    capa = {}
    for x in range(w):
        y = 0
        while y < h:
            c = orig[y][x]
            arriba = orig[y - 1][x] if y > 0 else (0, 0, 0, 0)
            borde = arriba[3] < 128 or lum(arriba) < 0.16
            if borde and (es_hoja(c) or es_rama(c)):
                for k in range(grueso):
                    yy = y + k
                    if yy >= h:
                        break
                    cc = orig[yy][x]
                    if not (es_hoja(cc) or es_rama(cc)):
                        break
                    capa[(x, yy)] = k
                y += grueso
                continue
            y += 1
    # 2) Solo las bandas de verdad: un trozo de nieve de menos de 10 píxeles
    #    sería una mota blanca suelta (tripofobia). Fuera.
    vistos = set()
    for p0 in list(capa):
        if p0 in vistos:
            continue
        grupo, pila = [], [p0]
        vistos.add(p0)
        while pila:
            q = pila.pop()
            grupo.append(q)
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                r = (q[0] + dx, q[1] + dy)
                if r in capa and r not in vistos:
                    vistos.add(r)
                    pila.append(r)
        if len(grupo) >= 10:
            for q in grupo:
                px[q[0], q[1]] = NIEVE[min(2, capa[q])] + (255,)
    # El verde de lo que queda, más frío y algo apagado.
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if c[3] and es_hoja(c) and c[:3] not in NIEVE:
                hh, s, v = _hsv(c[:3])
                px[x, y] = _rgb(hh + 0.06, s * 0.8, v * 0.92) + (c[3],)
    return im


def arboles(zona, paquete, destino):
    """Escribe los árboles de `zona` en `destino` y devuelve sus nombres."""
    os.makedirs(destino, exist_ok=True)
    def abre(n):
        return Image.open(os.path.join(paquete, 'arboles', n + '.png')).convert('RGBA')
    hechos = {}
    if zona == 'cementerio':
        hechos['seco_ceniza'] = oscurecer_seco(abre('arbol_seco'))
        hechos['seco'] = abre('arbol_seco')
    elif zona == 'desierto':
        hechos['palmera_cocotera'] = abre('palmera_cocotera')
        hechos['palmera_abanico'] = abre('palmera_abanico')
    elif zona == 'tundra':
        hechos['abeto_nevado'] = nevar(abre('abeto'))
        hechos['pino_nevado'] = nevar(abre('pino'))
        hechos['seco_nevado'] = nevar(abre('arbol_seco'), grueso=2)
    for n, im in hechos.items():
        im.save(os.path.join(destino, n + '.png'))
    return sorted(hechos)
