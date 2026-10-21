#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
EL MAPA DE PARTES DE LOS SOULBOUND — Game/Sprites/Soulbound/partes/  (2026-10-20)
=============================================================================

"En el botón redondo de NFT, para los Soulbound: poder elegir un personaje y
cambiarle el cabello según sea mujer u hombre, la ropa, el color, la cara,
los ojos y más; con ropa sencilla, como son los Soulbound (no como los NPC)."

TERCERA VUELTA (2026-10-21): "con el botón male o female el personaje se
cambia por uno feo, con menos gráficos que el soulbound: un boliche en la
frente, la frente oscura, contorno ancho y no ancho, cabellos de los 80. Los
soulbound por defecto están bien." Ya NO se redibuja ninguna cabeza: cada
peinado es una de las 8 cabezas del ARTE ORIGINAL (tools/gf_cabezas.py) sobre
el cuerpo del personaje (o, si se elige el otro cuerpo, sobre el del 1 —
hombre— o el del 2 —mujer—). Todo son píxeles del original, en códigos.

No se pintan todas las combinaciones de colores (serían millones): se pinta,
por CUERPO y CABEZA, un MAPA DE PARTES de sus 28 fotogramas. Cada píxel dice
QUÉ ES y su TONO, y el juego (gf-soulbound-custom.js) lo colorea al momento:

    R = la parte    10 piel · 11 mano · 15 barbilla · 20 zapatos · 30-35 el
                    ojo por papel (blanco, iris, iris claro, pupila, brillo,
                    párpado) · 40 pelo · 50 camisa · 60 pantalón (y falda)
                    · 250 contorno
    G = el tono × 40 (0 el más claro)
    B = 200 (píxel con parte), 201 (pestaña: en mujer, contorno), 202 (labios:
        en mujer, color de labios).
    Lo que no lleva B 200-202 va con su color de verdad (los sombreros, la
    capucha, el brote del pelo): no se colorea.

Sale, por cuerpo (los 13 personajes):
  <cuerpo>_orig.png + .json                 su cabeza de siempre
  <cuerpo>_<cabeza>.png + .json             cada una de las 8 cabezas
  <cuerpo>_falda.png + .json                la FALDA (encima del mapa: la
       falda en código de pantalón y las piernas en código de piel)

EL RETRATO no es un archivo: el juego lo compone (gf-soulbound-custom.js) con
la TARJETA del Perfil.png de siempre (51 x 55, el marco y el fondo azul, sin
el personaje) y el fotograma derecha_1 en su sitio (14, 10). Esa tarjeta va
en datos dentro del JS (TARJETA: paleta + RLE); `tarjeta()` de aquí abajo es
de donde sale, por si cambia el marco (y para revisar retratos a mano).

USO:  python tools/generar-soulbound-partes.py [personaje1 ...]
=============================================================================
"""
import json
import os
import sys
from collections import Counter

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import gf_humanoides2d as H2  # noqa: E402
import gf_cabezas as CB  # noqa: E402
from gf_arte import Lienzo  # noqa: E402

RAIZ = os.path.dirname(AQUI)
SOULBOUND = os.path.join(RAIZ, 'Game', 'Sprites', 'Soulbound')
SALIDA = os.path.join(SOULBOUND, 'partes')
MX, MY = CB.MX, CB.MY
PERFIL_XY = (14, 10)              # dónde va derecha_1 en el Perfil.png (51 x 55) de siempre

PIEL, MANO, BARBA, PANTALON, CONTORNO = CB.PIEL, CB.MANO, CB.BARBA, CB.PANTALON, CB.CONTORNO
F_PESTANA, F_LABIOS = 1, 2
cod, real = CB.cod, CB.real


def fotos(per=None):
    return CB.fotos()


def con_bandera(li, x, y, flag):
    px = li.get(x, y)
    if px[3] and px[2] == 200:
        li.set(x, y, (px[0], px[1], 200 + flag))


def fotograma(cuerpo, cabeza, d, n):
    """El fotograma en códigos: el cuerpo con esa cabeza (del arte original),
    con la barbilla y las banderas de mujer (pestañas y labios)."""
    li, partes, cuello, cintura = CB.componer(cuerpo, cabeza, d, n)
    vista = H2.vista_de(d)
    if vista != 'espalda':
        # La BARBILLA: la última fila de cara.
        cara = [(x, y) for (x, y), (q, c) in partes.items() if q == 'piel' and y < cuello]
        if cara:
            yb = max(y for x, y in cara)
            for (x, y) in cara:
                px = li.get(x, y)
                if y >= yb and px[3] and px[2] == 200 and px[0] in (PIEL, MANO):
                    li.set(x, y, (BARBA, px[1], 200))
        # LO QUE DISTINGUE A LA MUJER (banderas que el juego lee según el cuerpo).
        ojos = sorted((x, y) for (x, y), (q, c) in partes.items() if q == 'ojo')
        if ojos:
            y_pest = min(y for x, y in ojos) - 1
            xs = sorted(set(x for x, y in ojos))
            grupos, cur = [], [xs[0]]
            for x in xs[1:]:
                if x - cur[-1] > 1:
                    grupos.append(cur)
                    cur = []
                cur.append(x)
            grupos.append(cur)
            # Las pestañas: un trazo hacia fuera y arriba en el rabillo de cada ojo.
            for i, gx in enumerate(grupos):
                if vista == 'frente':
                    fuera = min(gx) - 1 if i == 0 else max(gx) + 1
                    lado = -1 if i == 0 else 1
                else:
                    lado = -1 if d == 'derecha' else 1           # el rabillo mira hacia la nuca
                    fuera = min(gx) - 1 if lado < 0 else max(gx) + 1
                con_bandera(li, fuera, y_pest, F_PESTANA)
                con_bandera(li, fuera + lado, y_pest - 1, F_PESTANA)
            # Los labios (de frente): la boca, el píxel oscuro más bajo del centro.
            if vista == 'frente':
                cx = int(round((xs[0] + xs[-1]) / 2.0))
                y_ojo = max(y for x, y in ojos)
                boca = None
                for y in range(cuello - 2, y_ojo + 1, -1):
                    for x in (cx, cx - 1, cx + 1):
                        px = li.get(x, y)
                        if px[3] and px[2] == 200 and px[0] in (PIEL, BARBA) and px[1] >= 80:
                            boca = (x, y)
                            break
                    if boca:
                        break
                if boca:
                    for x in (boca[0] - 1, boca[0], boca[0] + 1):
                        con_bandera(li, x, boca[1], F_LABIOS)
    im = li.imagen()
    # El mismo margen abajo que arriba (MY): el centro del cuadro coincide con
    # el del PNG original.
    w, h = im.size
    salida = Image.new('RGBA', (w, h + MY), (0, 0, 0, 0))
    salida.paste(im, (0, 0))
    return salida


def falda(per, d, n):
    """La falda de un fotograma: del talle a medio muslo, con vuelo abajo y su
    dobladillo; por debajo, las piernas en piel. Las manos, por encima."""
    im, partes, cuello, cintura = H2.etiquetar(per, d, n)
    w, h = im.size
    li = Lienzo(w + MX * 2, h + MY * 2)
    pant = {(x, y) for (x, y), (p, c) in partes.items() if p == 'pantalon'}
    manos = {(x, y) for (x, y), (p, c) in partes.items() if p == 'mano'}
    if not pant:
        return li.imagen()
    LARGO = 6
    y0 = min(y for x, y in pant)
    filas = {}
    for y in range(y0, y0 + LARGO + 1):
        xs = [x for (x, yy) in pant if yy == y]
        if not xs:
            continue
        vuelo = 0 if y - y0 < 3 else (1 if y - y0 < 5 else 2)
        filas[y] = (min(xs) - 1 - vuelo, max(xs) + 1 + vuelo)
    for y, (a, b) in filas.items():
        for x in range(a, b + 1):
            if (x, y) in manos:
                continue
            if x in (a, b) or y == y0 + LARGO:
                col = cod(CONTORNO)
            else:
                t = (x - a) / float(max(1, b - a))
                k = 0 if t < 0.34 else (1 if t < 0.67 else 2)
                if y == y0 + LARGO - 1:
                    k = min(3, k + 1)                         # el dobladillo, más oscuro
                col = cod(PANTALON, k)
            li.set(x + MX, y + MY, col)
    # Las piernas por debajo de la falda: piel (el contorno se queda).
    for (x, y) in pant:
        if y > y0 + LARGO:
            li.set(x + MX, y + MY, cod(MANO, 1))
    return li.imagen()


# ===========================================================================
# LA TARJETA DEL RETRATO (de aquí sale TARJETA de gf-soulbound-custom.js)
# ===========================================================================
_TARJETA = {}


def tarjeta(per):
    """El Perfil.png de siempre (51 x 55) SIN el personaje: el marco y el fondo
    azul, y dónde se puede pintar (el fondo y lo que era el personaje)."""
    if per in _TARJETA:
        return _TARJETA[per]
    p = Image.open(os.path.join(SOULBOUND, per, 'Perfil', 'Perfil.png')).convert('RGBA')
    if p.size != (51, 55):
        p = p.resize((51, 55), Image.NEAREST)
    spr = Image.open(os.path.join(SOULBOUND, per, 'derecha', 'run_1.png')).convert('RGBA')
    pp, sp = p.load(), spr.load()
    ox, oy = PERFIL_XY
    azul = lambda c: c[3] > 200 and c[2] > 150 and c[0] < 130 and c[1] < 130
    era = set()
    for y in range(spr.size[1]):
        for x in range(spr.size[0]):
            X, Y = x + ox, y + oy
            if sp[x, y][3] >= 128 and 0 <= X < 51 and 0 <= Y < 55 and pp[X, Y][:3] == sp[x, y][:3]:
                era.add((X, Y))
    fondo_fila = {}
    for y in range(55):
        cnt = Counter(pp[x, y][:3] for x in range(51) if (x, y) not in era and azul(pp[x, y]))
        if cnt:
            fondo_fila[y] = cnt.most_common(1)[0][0]
    dibujable = set(era)
    for y in range(55):
        for x in range(51):
            if azul(pp[x, y]):
                dibujable.add((x, y))
    base = Image.new('RGBA', (51, 55), (0, 0, 0, 0))
    bp = base.load()
    for y in range(55):
        for x in range(51):
            c = pp[x, y]
            if (x, y) in era:
                f = fondo_fila.get(y) or fondo_fila.get(y - 1) or (47, 57, 187)
                c = f + (255,)
            if c[3]:
                bp[x, y] = real(c) + (c[3],)
    _TARJETA[per] = (base, dibujable)
    return _TARJETA[per]


def retrato(per, cuadro_derecha):
    base, dibujable = tarjeta(per)
    out = base.copy()
    op, cp = out.load(), cuadro_derecha.load()
    ox, oy = PERFIL_XY[0] - MX, PERFIL_XY[1] - MY
    for y in range(cuadro_derecha.size[1]):
        for x in range(cuadro_derecha.size[0]):
            c = cp[x, y]
            X, Y = x + ox, y + oy
            if c[3] and (X, Y) in dibujable:
                op[X, Y] = c
    return out


# ===========================================================================
# LOS ATLAS
# ===========================================================================
def guardar_atlas(nombre, frames):
    cw = max(f.size[0] for f in frames.values())
    ch = max(f.size[1] for f in frames.values())
    hoja = Image.new('RGBA', (7 * cw, 4 * ch), (0, 0, 0, 0))
    datos = {'frames': {}, 'meta': {'app': 'tools/generar-soulbound-partes.py', 'image': nombre + '.png'}}
    for i, k in enumerate(frames):
        f = frames[k]
        x0, y0 = (i % 7) * cw, (i // 7) * ch
        hoja.paste(f, (x0, y0))
        datos['frames'][k] = {'x': x0, 'y': y0, 'w': f.size[0], 'h': f.size[1]}
    os.makedirs(SALIDA, exist_ok=True)
    hoja.save(os.path.join(SALIDA, nombre + '.png'))      # sin optimizar: los colores son datos
    with open(os.path.join(SALIDA, nombre + '.json'), 'w', encoding='utf-8') as fh:
        json.dump(datos, fh, separators=(',', ':'))


def personajes():
    out = []
    for n in sorted(os.listdir(SOULBOUND)):
        if n.startswith('personaje') and os.path.isdir(os.path.join(SOULBOUND, n, 'abajo')):
            out.append(n)
    return sorted(out, key=lambda s: int(''.join(c for c in s if c.isdigit()) or 0))


def main():
    pers = sys.argv[1:] or personajes()
    for per in pers:
        for cab in ['orig'] + CB.CABEZAS:
            k = per if cab == 'orig' else cab
            frames = {'%s_%d' % (d, n): fotograma(per, k, d, n) for d, n in fotos()}
            guardar_atlas('%s_%s' % (per, cab), frames)
        guardar_atlas('%s_falda' % per, {'%s_%d' % (d, n): falda(per, d, n) for d, n in fotos()})
        print('  %-12s su cabeza + %d cabezas + falda' % (per, len(CB.CABEZAS)))
    print('listo ->', SALIDA)


if __name__ == '__main__':
    main()
