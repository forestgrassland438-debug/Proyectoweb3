# -*- coding: utf-8 -*-
"""
=============================================================================
LAS CABEZAS ORIGINALES EN CUALQUIER CUERPO                       (2026-10-21)
=============================================================================

"Los NPC y los personajes (botón male o female) tienen un boliche en la
frente, las frentes oscuras y mal conformadas que hasta afectan los ojos al
mirar de lado; un contorno negro ancho y no ancho; sin detalle; caras como
quemadas y cabellos de los 80. Los soulbound por defecto están bien."

El fallo era REDIBUJAR la cabeza (gf_humanoides2d.peinar: un cráneo en
elipse y pelo hecho a máscaras). Aquí no se dibuja nada: se usan las cabezas
del ARTE ORIGINAL de los 13 Soulbound.

  · Los 13 comparten dos plantillas de cuerpo: el 1 (hombre: 1 3 5 7 8 10 12)
    y el 2 (mujer: 2 4 6 9 11 13). Dentro de cada plantilla las cabezas son
    las MISMAS píxel a píxel (solo cambian los colores) y el cuello está en
    la misma fila. Entre plantillas, los ojos están a un píxel: se alinean
    por los ojos.
  · Formas de cabeza distintas: 8 (CABEZAS). Por encima del cuello no cuelga
    pelo (salvo el cuello de la capucha del 13, que va con su cabeza).
  · componer(cuerpo, cabeza, d, n): el cuerpo del uno (del cuello abajo) y
    la cabeza del otro (del cuello arriba), en CÓDIGOS de partes (ver
    generar-soulbound-partes.py) y con su mapa de partes por píxel.

Lo usan tools/generar-soulbound-partes.py (personalizar) y
tools/generar-npcs.py (los NPC).
=============================================================================
"""
import colorsys
import os
from collections import Counter

import gf_humanoides2d as H2
from gf_arte import Lienzo

SOULBOUND = H2.SOULBOUND
MX, MY = 5, 9                     # el margen de los fotogramas (como H2.humanoide)

HOMBRE = ['personaje1', 'personaje3', 'personaje5', 'personaje7', 'personaje8', 'personaje10', 'personaje12']
MUJER = ['personaje2', 'personaje4', 'personaje6', 'personaje9', 'personaje11', 'personaje13']
# Las 8 formas de cabeza (el resto son la misma con otros colores).
CABEZAS = ['personaje1', 'personaje2', 'personaje8', 'personaje9', 'personaje10', 'personaje11', 'personaje12', 'personaje13']
FORMA = {'personaje3': 'personaje1', 'personaje5': 'personaje1', 'personaje7': 'personaje1',
         'personaje4': 'personaje2', 'personaje6': 'personaje2'}

# Los códigos (los mismos que lee gf-soulbound-custom.js).
PIEL, MANO, BARBA, PIES, PELO, CAMISA, PANTALON, CINTA, CONTORNO = 10, 11, 15, 20, 40, 50, 60, 70, 250
OJO = {'blanco': 30, 'iris': 31, 'iris_claro': 32, 'pupila': 33, 'brillo': 34, 'parpado': 35}

# Lo que en la cabeza NO es pelo: el sombrero de cada personaje que lo lleva.
GORRO = {
    'personaje8': lambda h, s, v: v >= 0.5,                 # sombrero de paja
    'personaje9': lambda h, s, v: s >= 0.6,                 # sombrero amarillo
    'personaje10': lambda h, s, v: s >= 0.4,                # gorro azul
    'personaje11': lambda h, s, v: 0.18 < h < 0.3,          # gorro verde
    'personaje12': lambda h, s, v: s >= 0.5,                # pañuelo rojo
    'personaje13': lambda h, s, v: 0.5 < h < 0.65,          # capucha
}


def tipo(per):
    return 'f' if per in MUJER else 'm'


def forma(per):
    return FORMA.get(per, per)


def cod(parte, tono=0, flag=0):
    return (parte, tono * 40, 200 + flag)


def real(c):
    """Un color de verdad que no se confunda con un código (B 200-209)."""
    r, g, b = c[:3]
    if 200 <= b <= 209:
        b = 199 if b < 205 else 210
    return (r, g, b)


def hsv(c):
    return colorsys.rgb_to_hsv(c[0] / 255.0, c[1] / 255.0, c[2] / 255.0)


def fotos():
    for d in H2.DIRS:
        for n in range(1, H2.FOTOS + 1):
            yield d, n


_INFO = {}


def info(per):
    """Los colores de cada personaje: piel, pelo (y sus tonos), sombrero,
    adornos, ropa y los papeles de sus ojos."""
    if per in _INFO:
        return _INFO[per]
    cols = {}
    for d, n in fotos():
        _, partes, _, _ = H2.etiquetar(per, d, n)
        for (x, y), (p, c) in partes.items():
            cols.setdefault(p, Counter())[c] += 1
    pieles = set(cols.get('piel', {})) | set(cols.get('mano', {}))
    gorro = GORRO.get(per)
    pelo_cnt, sombrero = Counter(), set()
    for c, k in cols.get('pelo', {}).items():
        if c in pieles:
            continue
        if gorro and gorro(*hsv(c)):
            sombrero.add(c)
        else:
            pelo_cnt[c] += k
    # Los adornos (horquillas, el brote): muy saturados o de otro color que el pelo.
    adornos = set()
    if pelo_cnt:
        h0 = hsv(pelo_cnt.most_common(1)[0][0])[0]
        for c in list(pelo_cnt):
            h, s, v = hsv(c)
            dh = min(abs(h - h0), 1 - abs(h - h0))
            if s >= 0.9 or (dh > 0.15 and s > 0.4):
                adornos.add(c)
                del pelo_cnt[c]
    tonos = lambda colores, n: H2.mapa_por_rango(list(colores), list(range(n))) if colores else {}
    _INFO[per] = {
        'pieles': pieles, 'sombrero': sombrero, 'adornos': adornos, 'pelo': set(pelo_cnt),
        't_piel': tonos(pieles, 3), 't_pelo': tonos(pelo_cnt, 4), 't_gorro': tonos(sombrero, 4),
        't_camisa': tonos(cols.get('camisa', {}), 4), 't_pantalon': tonos(cols.get('pantalon', {}), 4),
        't_pies': tonos(cols.get('pies', {}), 3), 'ojo': H2.papeles_ojo(per),
    }
    return _INFO[per]


def papel_ojo(inf, c):
    rol = inf['ojo'].get(c)
    if rol is None:
        rol = 'blanco' if H2.lum(c) > 0.7 else ('iris_claro' if H2.lum(c) > 0.42 else 'iris')
    return OJO[rol]


_ORIG = {}


def original(per, d, n):
    """El fotograma ORIGINAL en códigos, con su mapa de partes:
    (Lienzo sin márgenes, {(x, y): parte}, cuello, cintura).

    Partes: contorno, ojo, piel, oreja, pelo, gorro, adorno, mano, pies,
    camisa, pantalon. El sombrero y los adornos van con su color de verdad."""
    clave = (per, d, n)
    if clave in _ORIG:
        return _ORIG[clave]
    inf = info(per)
    im, partes, cuello, cintura = H2.etiquetar(per, d, n)
    w, h = im.size
    li, que = Lienzo(w, h), {}
    for (x, y), (p, c) in partes.items():
        if p == 'contorno':
            col, q = cod(CONTORNO), 'contorno'
        elif p == 'ojo':
            col, q = cod(papel_ojo(inf, c)), 'ojo'
        elif p == 'pelo' or (y >= cuello and c in inf['sombrero']):
            # Por debajo del cuello solo cuenta como cabeza el cuello de la
            # capucha (colores del sombrero); lo demás es ropa.
            if c in inf['sombrero']:
                col, q = real(c), 'gorro'
            elif c in inf['adornos']:
                col, q = real(c), 'adorno'
            elif c in inf['pieles']:
                col, q = cod(PIEL, inf['t_piel'].get(c, 0)), 'oreja'
            else:
                col, q = cod(PELO, inf['t_pelo'].get(c, 1)), 'pelo'
        elif p in ('piel', 'mano'):
            col, q = cod(PIEL if p == 'piel' else MANO, inf['t_piel'].get(c, 1)), p
        elif p == 'pies':
            col, q = cod(PIES, inf['t_pies'].get(c, 1)), 'pies'
        elif p == 'camisa':
            col, q = cod(CAMISA, inf['t_camisa'].get(c, 1)), 'camisa'
        elif p == 'pantalon':
            col, q = cod(PANTALON, inf['t_pantalon'].get(c, 1)), 'pantalon'
        else:
            col, q = real(c), 'otro'
        li.set(x, y, col)
        que[(x, y)] = (q, c)
    _ORIG[clave] = (li, que, cuello, cintura)
    return _ORIG[clave]


def ojos_centro(que):
    ojos = [(x, y) for (x, y), (q, c) in que.items() if q == 'ojo']
    if not ojos:
        return None
    xs = [x for x, y in ojos]
    ys = [y for x, y in ojos]
    return ((min(xs) + max(xs)) / 2.0, min(ys))


def componer(cuerpo, cabeza, d, n):
    """El cuerpo de `cuerpo` (del cuello abajo) con la cabeza de `cabeza`.

    Devuelve (Lienzo CON márgenes MX/MY, {(x, y): (parte, color original)} en
    esas coordenadas, cuello, cintura). Sin redibujar nada: son píxeles del
    arte original, en códigos."""
    lb, qb, cuello, cintura = original(cuerpo, d, n)
    w, h = lb.w, lb.h
    out = Lienzo(w + MX * 2, h + MY)
    partes = {}
    if cabeza == cuerpo:
        fuente = [(lb, qb, 0, 0, None)]
    else:
        lk, qk, cuello_k, _ = original(cabeza, d, n)
        cb, ck = ojos_centro(qb), ojos_centro(qk)
        sx = int(round(cb[0] - ck[0])) if cb and ck else 0
        sy = int(round(cb[1] - ck[1])) if cb and ck else 0
        fuente = [(lb, qb, 0, 0, 'cuerpo'), (lk, qk, sx, sy, 'cabeza')]
    for li, que, sx, sy, papel in fuente:
        for (x, y), (q, c) in que.items():
            if papel == 'cuerpo' and y < cuello:
                continue                                  # su cabeza no
            if papel == 'cuerpo' and y >= cuello and q in ('adorno', 'oreja', 'pelo'):
                continue                                  # (ni lo que asomara de ella; el
                                                          # cuello de la capucha del 13 sí: es su capa)
            if papel == 'cabeza' and not (y < cuello or q in ('gorro', 'pelo')):
                continue                                  # su cuerpo no
            X, Y = x + sx + MX, y + sy + MY
            if 0 <= X < out.w and 0 <= Y < out.h:
                out.set(X, Y, li.get(x, y))
                partes[(X, Y)] = (q, c)
    return out, partes, cuello + MY, cintura + MY
