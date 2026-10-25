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


def escarcha(im, k=0.35):
    """(2026-10-25) El glaciar: lo que no es nieve, más frío y pálido (la
    escarcha), sin tocar las bandas de nieve que puso nevar()."""
    im = im.convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a or (r, g, b) in NIEVE:
                continue
            h, s, v = _hsv((r, g, b))
            h2 = h + (0.58 - h) * k if 0.12 < h < 0.5 else h
            px[x, y] = _rgb(h2, s * (1 - k * 0.6), min(1.0, v * (1 + k * 0.25))) + (a,)
    return im


def _limpiar_halo(im):
    """Los bordes del paquete traen píxeles magenta sueltos (el fondo de
    recorte, mal quitado): se vuelven del color del contorno."""
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and r > 150 and b > 150 and g < 110:
                px[x, y] = (34, 22, 30, a)
    return im


def quitar_morados(im, todos=False):
    """Los acentos morados del paquete (sombras de las hojas) se veían como
    puntitos rosas entre lo verde: pasan a sombra de hoja, verde oscuro."""
    im = im.convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            hh, s, v = _hsv((r, g, b))
            rosa = (hh > 0.72 or hh < 0.02) and s > 0.25 and v > 0.18
            if (todos and rosa) or (0.72 < hh < 0.985 and s > 0.45 and 0.18 < v < 0.6):
                px[x, y] = _rgb(0.27, 0.55, v * 0.9) + (a,)
    return im


def alisar_sombreros(im, banda=(0.40, 0.92)):
    """(2026-10-25) LOS SOMBREROS DE LOS HONGOS GIGANTES, LISOS.

    El paquete los trae con un moteado de escamas (manchitas claras y
    oscuras): para la tripofobia, nada de motas. Se toma la luz de cada
    píxel del sombrero, se suaviza (media en 7x7, solo entre píxeles del
    sombrero) y se reparte en cuatro BANDAS del mismo tono: queda el volumen
    (claro arriba a la izquierda) sin una sola mancha. El tronco y el
    contorno no se tocan."""
    im = _limpiar_halo(im.convert('RGBA'))
    px = im.load()
    w, h = im.size
    gorro = {}
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 128:
                continue
            hh, s, v = _hsv((r, g, b))
            if banda[0] < hh < banda[1] and s > 0.22 and v > 0.22:
                gorro[(x, y)] = (hh, s, v)
    if not gorro:
        return im
    # Las motas OSCURAS de las escamas no entran por color (poca luz): se
    # recogen por estar rodeadas de sombrero (dos pasadas, como un cierre).
    for _ in range(4):
        nuevos = {}
        for y in range(h):
            for x in range(w):
                if (x, y) in gorro or px[x, y][3] < 128:
                    continue
                vec = [gorro[(x + dx, y + dy)] for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                       if (dx or dy) and (x + dx, y + dy) in gorro]
                if len(vec) >= 4:
                    nuevos[(x, y)] = (vec[0][0], vec[0][1], sum(c[2] for c in vec) / len(vec))
        if not nuevos:
            break
        gorro.update(nuevos)
    hs = sorted(c[0] for c in gorro.values())
    ss = sorted(c[1] for c in gorro.values())
    tono, sat = hs[len(hs) // 2], ss[len(ss) // 2]
    lisa = {}
    for (x, y) in gorro:
        suma = n = 0
        for dy in range(-3, 4):
            for dx in range(-3, 4):
                c = gorro.get((x + dx, y + dy))
                if c:
                    suma += c[2]; n += 1
        lisa[(x, y)] = suma / n
    vs = sorted(lisa.values())
    cortes = [vs[int(len(vs) * q)] for q in (0.25, 0.5, 0.78)]
    tonos_v = [0.42, 0.56, 0.70, 0.84]
    for (x, y), v in lisa.items():
        k = sum(1 for c in cortes if v > c)
        px[x, y] = _rgb(tono, sat * (1.05 - k * 0.07), tonos_v[k]) + (px[x, y][3],)
    return im


def recolor_hongo(im, tono):
    """Un hongo gigante de otro color (el ámbar): mismo dibujo, otro tono."""
    im = im.convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            hh, s, v = _hsv((r, g, b))
            if 0.40 < hh < 0.92 and s > 0.22:
                px[x, y] = _rgb(tono, s, v) + (a,)
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
    elif zona == 'glaciar':
        # (2026-10-25) Más nieve que en la tundra (bandas de 4) y escarcha.
        hechos['abeto_glaciar'] = escarcha(nevar(abre('abeto'), grueso=4))
        hechos['pino_glaciar'] = escarcha(nevar(abre('pino'), grueso=4))
        hechos['abedul_helado'] = escarcha(nevar(abre('abedul'), grueso=3), k=0.45)
        hechos['seco_helado'] = escarcha(nevar(abre('arbol_seco'), grueso=2), k=0.5)
    elif zona == 'caverna':
        # Los hongos gigantes, con el sombrero liso; y uno ámbar.
        hechos['hongo_turquesa'] = alisar_sombreros(abre('hongo_turquesa'))
        hechos['hongo_violeta'] = alisar_sombreros(abre('hongo_violeta'))
        hechos['hongo_ambar'] = alisar_sombreros(recolor_hongo(abre('hongo_turquesa'), 0.10), banda=(0.02, 0.18))
    elif zona == 'pradera':
        for n in ('cerezo', 'abedul', 'roble_redondo', 'roble_ancho', 'roble_curvado', 'arbol_ancestral'):
            hechos[n] = abre(n)
    # (2026-10-25) Fuera los píxeles magenta del recorte (en el abedul se veían
    # como puntitos rosas entre las hojas).
    if zona in ('glaciar', 'pradera'):
        # En el cerezo el rosa ES la flor: ahí solo las sombras moradas.
        hechos = {n: quitar_morados(_limpiar_halo(im), todos=(n != 'cerezo')) for n, im in hechos.items()}
    for n, im in hechos.items():
        im.save(os.path.join(destino, n + '.png'))
    return sorted(hechos)
