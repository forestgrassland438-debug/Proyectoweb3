# -*- coding: utf-8 -*-
"""
=============================================================================
LAS CRIATURAS 3D DE LOS SIETE REINOS                             (2026-11-21)
=============================================================================

Los modelos (elipsoides, conos redondeados y rocas facetadas de
tools/gf_bestias3d.py, la misma cámara ortográfica que mira algo desde arriba
y la misma luz en cinco bandas lisas) de:

  · LA FAUNA (14): dos especies por mapa, en tres poses (andar 4, quieto 2,
    comer 2) y tres vistas. La escribe tools/generar-reinos-criaturas.py en
    Game/Sprites/fauna3d/ y la carga gf-fauna-zonas.js.
  · LAS BESTIAS (10): los monstruos que no son personas (andar 4, ataque 3,
    quieto 2) en Game/Sprites/monstruos/ (gf-monstruos-arte.js, BESTIAS).
  · LOS JEFES (7): uno por mapa, más grandes y con piezas suyas.

TODO ES NUEVO: ningún modelo es una copia teñida de los que ya había (el oso
de otoño no es el oso polar, el gólem de las ruinas es un centinela de
columnas con un disco de sol, el topo de la hondonada no es el de las
granjas).

SIN MOTAS (el dueño del juego tiene tripofobia): manchas grandes, bandas,
rayas y espirales lisas. Ni puntos, ni verrugas, ni rosetas, ni ocelos en las
alas, ni celdas de caparazón, ni hileras de dientes: el caparazón de la
tortuga va en anillos, el de la armadillo en bandas, la caracola en UNA
espiral, la pantera es negra y el sapo, liso con dos franjas.
=============================================================================
"""
import math

import numpy as np

from gf_bestias3d import elip, cono, roca, giro_z, _local
from gf_arte import rampa, hex_rgb


def tonos(h, arriba=0.3, abajo=0.55):
    return {'tonos': rampa(hex_rgb(h), 5, arriba=arriba, abajo=abajo)}


def emite(h):
    return {'emite': hex_rgb(h)}


def fase(accion, i, n=4):
    if accion == 'camina':
        return (i - 1) / float(n) * math.pi * 2, True
    return 0.0, False


def patas4(pr, f, anda, x_del, x_tras, alto, z, grosor, mat, mat_pie=None, y0=0.0, paso=3.0, rodilla=0.6):
    """Cuatro patas en paso cruzado (la de delante de un lado con la de atrás del otro)."""
    for delante, x0 in ((True, x_del), (False, x_tras)):
        for sg in (1, -1):
            ff = f + (0 if (sg > 0) == delante else math.pi)
            sw = math.sin(ff) * paso if anda else 0.0
            alza = max(0.0, math.cos(ff)) * paso * 0.45 if anda else 0.0
            cad = (x0, alto + y0, z * sg)
            rod = (x0 + sw * 0.5 + (0.0 if delante else -grosor * rodilla), alto * 0.5 + alza * 0.5, z * sg)
            pie = (x0 + sw, 0.9 + alza, z * sg)
            pr.append(cono(cad, rod, grosor, grosor * 0.8, mat))
            pr.append(cono(rod, pie, grosor * 0.8, grosor * 0.65, mat))
            if mat_pie:
                pr.append(elip((pie[0] + grosor * 0.3, pie[1], z * sg), (grosor * 0.95, 0.75, grosor * 0.8), mat_pie))


# ===========================================================================
# LA FAUNA
# ===========================================================================

# ── EL PUERTO: la gaviota y la nutria ───────────────────────────────────────
GAVIOTA_MAT = {
    'blanco': tonos('#f2f5f8', 0.12, 0.32),
    'gris': tonos('#a3aebb', 0.25, 0.5),
    'punta': tonos('#30343c', 0.25, 0.45),
    'pico': tonos('#f2c040', 0.25, 0.45),
    'pata': tonos('#e89a62', 0.25, 0.45),
    'ojo': emite('#1a1a1e'),
}


def gaviota(accion, i):
    f, anda = fase(accion, i)
    come = accion == 'come'
    y0 = 0.3 if (accion == 'quieto' and i == 2) else 0.0
    bote = abs(math.sin(f)) * 0.6 if anda else 0.0
    y0 += bote
    pr = [elip((0, 8.6 + y0, 0), (6.4, 4.0, 3.8), 'blanco')]
    if come:
        hx, hy = 6.8, 4.2 + (0.7 if i == 2 else 0.0)
    else:
        hx, hy = 5.4, 13.2 + y0
    pr.append(cono((3.4, 10.0 + y0, 0), (hx - 1.0, hy - 0.4, 0), 2.3, 1.9, 'blanco'))
    pr.append(elip((hx, hy, 0), (2.6, 2.3, 2.2), 'blanco'))
    pr.append(cono((hx + 2.0, hy - 0.4, 0), (hx + 5.2, hy - 1.0, 0), 0.8, 0.32, 'pico'))
    for sg in (1, -1):
        pr.append(elip((hx + 1.0, hy + 0.6, 1.6 * sg), (0.45, 0.45, 0.35), 'ojo'))
        pr.append(elip((-1.2, 10.2 + y0, 2.9 * sg), (6.0, 1.7, 1.5), 'gris'))           # el ala plegada
        pr.append(cono((-5.6, 10.0 + y0, 2.4 * sg), (-9.6, 9.4 + y0, 1.4 * sg), 1.1, 0.35, 'punta'))
        ff = f + (0 if sg > 0 else math.pi)
        sw = math.sin(ff) * 1.6 if anda else 0.0
        alza = max(0.0, math.cos(ff)) * 1.0 if anda else 0.0
        pr.append(cono((0.4, 5.6 + y0, 1.6 * sg), (0.4 + sw, 0.8 + alza, 1.8 * sg), 0.45, 0.4, 'pata'))
        pr.append(elip((1.2 + sw, 0.5 + alza, 1.8 * sg), (1.2, 0.4, 0.9), 'pata'))
    pr.append(cono((-5.4, 9.0 + y0, 0), (-8.6, 8.8 + y0, 0), 1.7, 0.7, 'blanco'))
    return pr, None


NUTRIA_MAT = {
    'pelo': tonos('#6e4c34', 0.3, 0.55),
    'claro': tonos('#d8bc98', 0.15, 0.38),
    'oscuro': tonos('#3e2a1e', 0.2, 0.45),
    'nariz': tonos('#1e1614', 0.2, 0.3),
    'ojo': emite('#120e0c'),
}


def nutria(accion, i):
    f, anda = fase(accion, i)
    come = accion == 'come'
    ond = math.sin(f) * 0.8 if anda else 0.0
    y0 = 0.3 if (accion == 'quieto' and i == 2) else 0.0
    cuerpo = elip((0, 6.6 + y0 + ond * 0.3, 0), (10.5, 4.2, 4.2), 'pelo')
    pr = [cuerpo, elip((7.0, 7.2 + y0, 0), (4.6, 4.4, 4.0), 'pelo')]
    hx, hy = (13.4, 3.6 + (0.5 if i == 2 else 0.0)) if come else (12.6, 9.4 + y0)
    pr.append(cono((9.0, 8.0 + y0, 0), (hx - 1.4, hy - 0.3, 0), 3.0, 2.6, 'pelo'))
    pr.append(elip((hx, hy, 0), (3.4, 3.0, 3.0), 'pelo'))
    pr.append(elip((hx + 2.4, hy - 0.8, 0), (1.9, 1.5, 2.2), 'claro'))
    pr.append(elip((hx + 4.0, hy - 0.4, 0), (0.75, 0.6, 0.85), 'nariz'))
    for sg in (1, -1):
        pr.append(elip((hx + 1.4, hy + 1.0, 2.0 * sg), (0.5, 0.5, 0.4), 'ojo'))
        pr.append(elip((hx - 1.4, hy + 2.4, 2.4 * sg), (0.9, 0.9, 0.5), 'oscuro'))
    patas4(pr, f, anda, 6.0, -6.0, 4.6, 3.4, 1.3, 'oscuro', 'oscuro', y0=y0, paso=2.4)
    pr.append(cono((-9.5, 6.0 + y0, 0), (-16.0, 3.4 + y0 - ond * 0.4, ond * 0.6), 2.4, 1.0, 'pelo'))
    pr.append(cono((-16.0, 3.4 + y0 - ond * 0.4, ond * 0.6), (-20.0, 2.4 + y0, ond), 1.0, 0.4, 'oscuro'))

    def retoque(p, Pm, nm, nw):
        if p['mat'] == 'pelo' and nm[1] < -0.35 and Pm[0] > -6:
            return 'claro'                                  # el pecho y la garganta, claros
        return None
    return pr, retoque


# ── EL PANTANO: la rana y la garza ──────────────────────────────────────────
RANA_MAT = {
    'piel': tonos('#5f9a3c', 0.3, 0.55),
    'franja': tonos('#3a6a28', 0.25, 0.5),
    'tripa': tonos('#e8e2a0', 0.12, 0.35),
    'ojo_b': tonos('#d9c84a', 0.2, 0.4),
    'ojo': emite('#141810'),
}


def rana(accion, i):
    # Andar = saltar: agazaparse, despegar, en el aire, caer.
    salto = {1: (0.0, -0.6), 2: (2.6, 0.2), 3: (5.0, 0.6), 4: (1.4, -0.3)}.get(i, (0.0, 0.0)) if accion == 'camina' else (0.0, 0.0)
    alto, estira = salto
    come = accion == 'come'
    y0 = alto + (0.25 if (accion == 'quieto' and i == 2) else 0.0)
    cuerpo = elip((0, 4.6 + y0, 0), (5.6, 3.4 + estira * 0.4, 4.4), 'piel')
    pr = [cuerpo]
    hx, hy = 4.8, 5.8 + y0 - (0.6 if come and i == 2 else 0.0)
    pr.append(elip((hx, hy, 0), (3.2, 2.4, 3.6), 'piel'))
    for sg in (1, -1):
        pr.append(elip((hx + 0.4, hy + 2.0, 2.0 * sg), (1.3, 1.2, 1.2), 'ojo_b'))
        pr.append(elip((hx + 1.4, hy + 2.3, 2.2 * sg), (0.55, 0.6, 0.55), 'ojo'))
        # Las patas de atrás, dobladas (y estiradas en el salto).
        pr.append(elip((-3.0, 3.2 + y0, 3.8 * sg), (3.0, 1.9, 1.6), 'piel'))
        pie_x = -3.6 - estira * 2.2
        pr.append(cono((-2.0, 1.8 + y0, 4.6 * sg), (pie_x, 0.6 + max(0.0, y0 * 0.6), 4.2 * sg), 1.0, 0.8, 'piel'))
        pr.append(elip((pie_x + 1.2, 0.5 + max(0.0, y0 * 0.6), 4.4 * sg), (1.8, 0.45, 1.1), 'franja'))
        # Las de delante, cortas.
        pr.append(cono((3.2, 3.2 + y0, 2.8 * sg), (4.0 + estira * 0.6, 0.6 + max(0.0, y0 * 0.5), 3.2 * sg), 0.7, 0.55, 'piel'))
    if come and i == 2:
        pr.append(cono((hx + 2.4, hy - 0.8, 0), (hx + 6.4, hy - 1.6, 0), 0.4, 0.3, 'tripa'))   # la lengua

    def retoque(p, Pm, nm, nw):
        if p['mat'] == 'piel' and nm[1] < -0.3:
            return 'tripa'
        if p is cuerpo and abs(Pm[2]) < 1.0 and nw[1] > 0.4:
            return 'franja'                                 # UNA franja por el lomo
        return None
    return pr, retoque


GARZA_MAT = {
    'plumas': tonos('#9fb0c2', 0.25, 0.5),
    'blanco': tonos('#eef2f4', 0.12, 0.32),
    'negro': tonos('#2c3038', 0.25, 0.45),
    'pico': tonos('#e8b440', 0.25, 0.45),
    'pata': tonos('#9a8a5a', 0.25, 0.45),
    'ojo': emite('#f2d040'),
}


def garza(accion, i):
    f, anda = fase(accion, i)
    come = accion == 'come'
    y0 = 0.3 if (accion == 'quieto' and i == 2) else 0.0
    cuerpo = elip((0, 22 + y0, 0), (7.0, 4.4, 4.0), 'plumas')
    pr = [cuerpo]
    if come:
        cuello = [(4.6, 23 + y0), (9.0, 19 + y0), (12.5, 13 + y0 - (1.6 if i == 2 else 0.0))]
    else:
        cuello = [(4.6, 23 + y0), (5.6, 30 + y0), (8.4, 35 + y0)]
    pr.append(cono((cuello[0][0], cuello[0][1], 0), (cuello[1][0], cuello[1][1], 0), 1.9, 1.5, 'blanco'))
    pr.append(cono((cuello[1][0], cuello[1][1], 0), (cuello[2][0], cuello[2][1], 0), 1.5, 1.3, 'blanco'))
    hx, hy = cuello[2]
    pr.append(elip((hx + 0.6, hy + 0.4, 0), (2.2, 1.9, 1.8), 'blanco'))
    pr.append(cono((hx - 1.0, hy + 1.6, 0), (hx - 4.4, hy + 2.6, 0), 0.6, 0.25, 'negro'))      # la cresta
    pr.append(cono((hx + 2.2, hy + 0.2, 0), (hx + 8.2, hy - (2.6 if come else 0.6), 0), 0.8, 0.2, 'pico'))
    for sg in (1, -1):
        pr.append(elip((hx + 1.4, hy + 0.8, 1.4 * sg), (0.45, 0.45, 0.35), 'ojo'))
        ff = f + (0 if sg > 0 else math.pi)
        sw = math.sin(ff) * 3.0 if anda else 0.0
        alza = max(0.0, math.cos(ff)) * 2.4 if anda else 0.0
        rod = (0.6 + sw * 0.5, 10.5 + alza * 0.6, 1.8 * sg)
        pr.append(cono((0.0, 19 + y0, 1.8 * sg), rod, 0.6, 0.5, 'pata'))
        pr.append(cono(rod, (0.4 + sw, 0.8 + alza, 1.8 * sg), 0.5, 0.45, 'pata'))
        pr.append(elip((1.6 + sw, 0.5 + alza, 1.8 * sg), (1.8, 0.35, 0.9), 'pata'))
        pr.append(cono((-3.0, 23 + y0, 3.2 * sg), (-8.4, 20.5 + y0, 2.2 * sg), 1.6, 0.6, 'negro'))  # las puntas del ala
    pr.append(cono((-6.0, 21.6 + y0, 0), (-9.6, 20.0 + y0, 0), 1.8, 0.6, 'plumas'))
    return pr, None


# ── LAS RUINAS: la tortuga y el ibis ───────────────────────────────────────
TORTUGA_MAT = {
    'concha': tonos('#8a7a48', 0.35, 0.55),
    'anillo': tonos('#5e5230', 0.25, 0.5),
    'borde': tonos('#c8b070', 0.2, 0.45),
    'piel': tonos('#9a9a6a', 0.25, 0.5),
    'ojo': emite('#141410'),
}


def tortuga(accion, i):
    f, anda = fase(accion, i)
    come = accion == 'come'
    y0 = 0.2 if (accion == 'quieto' and i == 2) else 0.0
    concha = elip((0, 6.0 + y0, 0), (9.0, 6.2, 7.4), 'concha')
    pr = [concha, elip((0, 3.2 + y0, 0), (9.6, 1.4, 7.8), 'borde')]
    hx, hy = (11.2, 2.8 + (0.4 if i == 2 else 0.0)) if come else (11.0, 5.2 + y0)
    pr.append(cono((7.0, 4.4 + y0, 0), (hx - 1.0, hy, 0), 1.9, 1.7, 'piel'))
    pr.append(elip((hx, hy + 0.3, 0), (2.4, 2.0, 2.0), 'piel'))
    for sg in (1, -1):
        pr.append(elip((hx + 1.0, hy + 0.9, 1.4 * sg), (0.45, 0.45, 0.35), 'ojo'))
    for delante, x0 in ((True, 5.2), (False, -5.2)):
        for sg in (1, -1):
            ff = f + (0 if (sg > 0) == delante else math.pi)
            sw = math.sin(ff) * 1.6 if anda else 0.0
            alza = max(0.0, math.cos(ff)) * 0.7 if anda else 0.0
            pr.append(cono((x0, 3.2 + y0, 5.4 * sg), (x0 + sw, 0.9 + alza, 6.4 * sg), 1.6, 1.4, 'piel'))
    pr.append(cono((-8.4, 3.4 + y0, 0), (-10.6, 2.2 + y0, 0), 0.9, 0.3, 'piel'))

    def retoque(p, Pm, nm, nw):
        if p is concha:
            # Los anillos de crecimiento: bandas horizontales que dan la vuelta (no celdas).
            h = (Pm[1] - y0 - 3.0) / 6.2
            return 'anillo' if (h * 2.8) % 1.0 < 0.2 else None
        return None
    return pr, retoque


IBIS_MAT = {
    'blanco': tonos('#f2f2ee', 0.12, 0.32),
    'negro': tonos('#26282e', 0.25, 0.45),
    'pico': tonos('#3a3634', 0.25, 0.45),
    'pata': tonos('#4a4440', 0.25, 0.45),
    'ojo': emite('#e8e0c8'),
}


def ibis(accion, i):
    f, anda = fase(accion, i)
    come = accion == 'come'
    y0 = 0.3 if (accion == 'quieto' and i == 2) else 0.0
    pr = [elip((0, 15 + y0, 0), (6.6, 4.4, 4.0), 'blanco')]
    if come:
        cab = (8.4, 7.4 + (0.8 if i == 2 else 0.0))
        pr.append(cono((4.0, 16 + y0, 0), (cab[0] - 1, cab[1] + 1, 0), 1.6, 1.3, 'negro'))
    else:
        cab = (6.6, 24 + y0)
        pr.append(cono((4.0, 17 + y0, 0), (cab[0] - 0.6, cab[1] - 1.5, 0), 1.6, 1.3, 'negro'))
    hx, hy = cab
    pr.append(elip((hx, hy, 0), (2.0, 1.8, 1.7), 'negro'))
    # El pico largo y curvo hacia abajo, en dos tramos.
    mid = (hx + 4.4, hy - 1.0 - (1.6 if come else 0.0), 0)
    pr.append(cono((hx + 1.6, hy, 0), mid, 0.7, 0.5, 'pico'))
    pr.append(cono(mid, (mid[0] + 3.6, mid[1] - 2.6 - (1.4 if come else 0.0), 0), 0.5, 0.2, 'pico'))
    for sg in (1, -1):
        pr.append(elip((hx + 0.8, hy + 0.6, 1.3 * sg), (0.4, 0.4, 0.3), 'ojo'))
        pr.append(cono((-3.0, 16.4 + y0, 3.0 * sg), (-8.6, 14.0 + y0, 2.0 * sg), 1.5, 0.5, 'negro'))
        ff = f + (0 if sg > 0 else math.pi)
        sw = math.sin(ff) * 2.6 if anda else 0.0
        alza = max(0.0, math.cos(ff)) * 1.8 if anda else 0.0
        rod = (0.4 + sw * 0.5, 6.4 + alza * 0.6, 1.7 * sg)
        pr.append(cono((0.0, 12 + y0, 1.7 * sg), rod, 0.55, 0.45, 'pata'))
        pr.append(cono(rod, (0.3 + sw, 0.8 + alza, 1.7 * sg), 0.45, 0.4, 'pata'))
        pr.append(elip((1.4 + sw, 0.5 + alza, 1.7 * sg), (1.6, 0.35, 0.8), 'pata'))
    return pr, None


# ── LAS COLINAS: la ardilla y el alce ──────────────────────────────────────
ARDILLA_MAT = {
    'pelo': tonos('#b8582a', 0.3, 0.55),
    'claro': tonos('#f0dcc0', 0.12, 0.35),
    'cola': tonos('#c86a34', 0.35, 0.5),
    'oscuro': tonos('#5a2a16', 0.2, 0.45),
    'ojo': emite('#120c0a'),
}


def ardilla(accion, i):
    salto = {1: 0.0, 2: 1.4, 3: 2.2, 4: 0.8}.get(i, 0.0) if accion == 'camina' else 0.0
    come = accion == 'come'
    y0 = salto + (0.25 if (accion == 'quieto' and i == 2) else 0.0)
    erguida = accion != 'camina'
    cuerpo = elip((0, 5.6 + y0 + (0.8 if erguida else 0.0), 0), (4.2, 3.6 + (0.8 if erguida else 0.0), 3.0), 'pelo')
    pr = [cuerpo]
    hx, hy = (3.4, 10.6 + y0) if erguida else (4.4, 7.6 + y0)
    pr.append(elip((hx, hy, 0), (2.4, 2.2, 2.0), 'pelo'))
    pr.append(elip((hx + 1.8, hy - 0.6, 0), (1.0, 0.9, 1.0), 'claro'))
    for sg in (1, -1):
        pr.append(elip((hx + 0.9, hy + 0.7, 1.3 * sg), (0.5, 0.5, 0.4), 'ojo'))
        pr.append(cono((hx - 0.6, hy + 1.6, 1.0 * sg), (hx - 1.0, hy + 3.4, 1.2 * sg), 0.6, 0.25, 'oscuro'))
        # Patas de atrás (grandes) y de delante (con la bellota al comer).
        pr.append(elip((-1.6, 2.4 + y0 * 0.4, 2.2 * sg), (2.2, 1.6, 1.0), 'pelo'))
        mano_y = (hy - 2.0) if come else (1.0 + y0 * 0.4)
        pr.append(cono((2.0, 5.0 + y0, 1.6 * sg), (3.0, mano_y, 1.2 * sg), 0.55, 0.45, 'oscuro'))
    if come:
        pr.append(elip((3.4, hy - 2.4, 0), (0.9, 1.0, 0.9), 'oscuro'))
    # La cola: tres masas que suben y se curvan sobre el lomo.
    pr += [elip((-4.0, 5.0 + y0, 0), (2.0, 2.6, 2.0), 'cola'), elip((-5.4, 9.0 + y0, 0), (2.4, 3.0, 2.2), 'cola'),
           elip((-4.2, 12.6 + y0, 0), (2.6, 2.2, 2.2), 'cola')]

    def retoque(p, Pm, nm, nw):
        if p is cuerpo and nm[0] > 0.3 and nm[1] < 0.3:
            return 'claro'                                  # el pecho blanco
        return None
    return pr, retoque


ALCE_MAT = {
    'pelo': tonos('#5a3e2a', 0.3, 0.55),
    'oscuro': tonos('#2e2018', 0.2, 0.45),
    'claro': tonos('#8a6a4e', 0.2, 0.45),
    'asta': tonos('#d8c49a', 0.25, 0.5),
    'nariz': tonos('#1a1210', 0.2, 0.3),
    'ojo': emite('#140e0c'),
}


def alce(accion, i):
    f, anda = fase(accion, i)
    come = accion == 'come'
    y0 = 0.35 if (accion == 'quieto' and i == 2) else 0.0
    pr = [elip((0, 20 + y0, 0), (12.5, 6.4, 6.0), 'pelo'),
          elip((7.0, 22.5 + y0, 0), (6.6, 7.8, 6.4), 'pelo')]                     # la joroba de los hombros
    if come:
        hx, hy = 15.0, 8.0 + (0.6 if i == 2 else 0.0)
        pr.append(cono((10.0, 22 + y0, 0), (hx - 2.0, hy + 2.6, 0), 3.6, 2.6, 'pelo'))
    else:
        hx, hy = 15.0, 27.0 + y0
        pr.append(cono((10.0, 24 + y0, 0), (hx - 2.0, hy - 1.0, 0), 3.6, 2.8, 'pelo'))
    pr.append(elip((hx, hy, 0), (3.6, 3.2, 3.0), 'pelo'))
    pr.append(cono((hx + 1.6, hy - 0.6, 0), (hx + 6.6, hy - 2.6, 0), 2.6, 2.2, 'claro'))   # el morro largo
    pr.append(elip((hx + 6.8, hy - 2.6, 0), (1.3, 1.3, 1.6), 'nariz'))
    pr.append(cono((hx + 1.0, hy - 2.6, 0), (hx + 0.6, hy - 6.6, 0), 1.0, 0.5, 'oscuro'))  # la barba de piel
    for sg in (1, -1):
        pr.append(elip((hx + 1.4, hy + 1.2, 2.4 * sg), (0.55, 0.55, 0.45), 'ojo'))
        pr.append(cono((hx - 1.4, hy + 2.0, 2.0 * sg), (hx - 3.0, hy + 3.4, 4.6 * sg), 1.0, 0.4, 'pelo'))
        # Las palas: un brazo, una pala ancha y lisa que se echa hacia atrás y UNA
        # punta delante (sin puntas en racimo).
        b = (hx - 1.2, hy + 2.8, 1.8 * sg)
        pr.append(cono(b, (hx - 2.2, hy + 5.0, 5.4 * sg), 0.8, 0.7, 'asta'))
        pr.append(elip((hx - 3.4, hy + 6.6, 6.8 * sg), (2.0, 3.0, 3.2), 'asta', rot=giro_z(-0.5)))
        pr.append(cono((hx - 1.6, hy + 7.6, 6.2 * sg), (hx + 0.6, hy + 9.6, 6.0 * sg), 0.7, 0.3, 'asta'))
    patas4(pr, f, anda, 8.0, -9.0, 16.0, 3.8, 1.8, 'pelo', 'oscuro', y0=y0, paso=3.8)
    pr.append(cono((-12.0, 21 + y0, 0), (-13.6, 19 + y0, 0), 1.2, 0.6, 'oscuro'))

    def retoque(p, Pm, nm, nw):
        if p['mat'] == 'pelo' and Pm[1] < 13.0:
            return 'oscuro'                                  # las patas, oscuras hasta el vientre
        return None
    return pr, retoque


# ── LA SELVA: la capibara y el tucán ───────────────────────────────────────
CAPIBARA_MAT = {
    'pelo': tonos('#9a6a42', 0.3, 0.55),
    'oscuro': tonos('#5a3a22', 0.2, 0.45),
    'nariz': tonos('#2a1c14', 0.2, 0.3),
    'ojo': emite('#120c0a'),
}


def capibara(accion, i):
    f, anda = fase(accion, i)
    come = accion == 'come'
    y0 = 0.3 if (accion == 'quieto' and i == 2) else 0.0
    pr = [elip((0, 9.4 + y0, 0), (10.0, 6.0, 5.6), 'pelo')]
    hx, hy = (11.6, 4.6 + (0.5 if i == 2 else 0.0)) if come else (11.2, 11.6 + y0)
    pr.append(cono((7.0, 11 + y0, 0), (hx - 1.6, hy, 0), 3.8, 3.4, 'pelo'))
    pr.append(roca((hx + 1.0, hy, 0), (3.8, 3.0, 2.8), 'pelo', bisel=0.86, arista=0.92))   # la cabeza, cuadrada
    pr.append(elip((hx + 4.4, hy - 0.4, 0), (0.9, 1.4, 1.8), 'nariz'))
    for sg in (1, -1):
        pr.append(elip((hx + 1.2, hy + 1.6, 2.4 * sg), (0.5, 0.5, 0.4), 'ojo'))
        pr.append(elip((hx - 1.4, hy + 3.0, 2.0 * sg), (0.8, 0.9, 0.5), 'oscuro'))
    patas4(pr, f, anda, 6.0, -6.4, 5.4, 3.8, 1.6, 'oscuro', 'oscuro', y0=y0, paso=2.4)
    return pr, None


TUCAN_MAT = {
    'negro': tonos('#22242a', 0.3, 0.45),
    'blanco': tonos('#f4ecd0', 0.12, 0.32),
    'pico': tonos('#f08a28', 0.25, 0.45),
    'punta': tonos('#c8342a', 0.25, 0.45),
    'aro': tonos('#5ac8e0', 0.2, 0.4),
    'pata': tonos('#5a6a8a', 0.25, 0.45),
    'ojo': emite('#101010'),
}


def tucan(accion, i):
    salto = {1: 0.0, 2: 1.2, 3: 1.8, 4: 0.6}.get(i, 0.0) if accion == 'camina' else 0.0
    come = accion == 'come'
    y0 = salto + (0.25 if (accion == 'quieto' and i == 2) else 0.0)
    cuerpo = elip((0, 9.0 + y0, 0), (4.6, 6.0, 4.0), 'negro', rot=giro_z(0.25))
    pr = [cuerpo]
    hx, hy = (3.8, 10.0 + y0) if come else (2.8, 14.6 + y0)
    pr.append(elip((hx, hy, 0), (2.8, 2.6, 2.4), 'negro'))
    pr.append(elip((hx + 1.4, hy - 1.8, 0), (2.0, 1.6, 2.0), 'blanco'))          # la garganta
    # El pico enorme: naranja con la punta roja.
    pr.append(cono((hx + 2.0, hy + 0.2, 0), (hx + 8.4, hy - (2.6 if come else 0.6), 0), 1.6, 0.7, 'pico'))
    pr.append(cono((hx + 7.6, hy - (2.4 if come else 0.5), 0), (hx + 9.4, hy - (3.2 if come else 0.9), 0), 0.75, 0.3, 'punta'))
    for sg in (1, -1):
        pr.append(elip((hx + 0.6, hy + 0.7, 1.9 * sg), (0.9, 0.9, 0.5), 'aro'))
        pr.append(elip((hx + 0.8, hy + 0.7, 2.2 * sg), (0.4, 0.45, 0.3), 'ojo'))
        pr.append(cono((-0.4, 4.6 + y0, 1.4 * sg), (0.6, 0.8 + y0 * 0.3, 1.4 * sg), 0.45, 0.4, 'pata'))
    pr.append(cono((-3.0, 5.0 + y0, 0), (-6.4, 1.6 + y0, 0), 1.8, 0.9, 'negro'))  # la cola

    def retoque(p, Pm, nm, nw):
        if p is cuerpo and nm[0] > 0.45 and Pm[1] > 8.0 + y0:
            return 'blanco'                                   # el babero claro
        return None
    return pr, retoque


# ── EL VOLCÁN: la cabra de ceniza y el armadillo ───────────────────────────
CABRA_MAT = {
    'pelo': tonos('#8e8a88', 0.32, 0.55),
    'oscuro': tonos('#4a4442', 0.2, 0.45),
    'claro': tonos('#d6d0cc', 0.15, 0.38),
    'cuerno': tonos('#6a5444', 0.3, 0.5),
    'ojo': emite('#f2b04a'),
}


def cabra(accion, i):
    f, anda = fase(accion, i)
    come = accion == 'come'
    y0 = 0.3 if (accion == 'quieto' and i == 2) else 0.0
    pr = [elip((0, 15 + y0, 0), (9.2, 5.2, 4.8), 'pelo'), elip((5.0, 16 + y0, 0), (4.6, 5.6, 4.6), 'pelo')]
    if come:
        hx, hy = 11.4, 5.6 + (0.5 if i == 2 else 0.0)
        pr.append(cono((7.0, 17 + y0, 0), (hx - 1.0, hy + 1.6, 0), 2.4, 2.0, 'pelo'))
    else:
        hx, hy = 10.4, 23 + y0
        pr.append(cono((7.0, 18 + y0, 0), (hx - 1.0, hy - 1.6, 0), 2.4, 2.0, 'pelo'))
    pr.append(elip((hx, hy, 0), (3.0, 2.4, 2.2), 'pelo'))
    pr.append(cono((hx + 1.4, hy - 0.6, 0), (hx + 4.4, hy - 1.6, 0), 1.6, 1.1, 'claro'))
    pr.append(cono((hx + 2.4, hy - 2.0, 0), (hx + 2.6, hy - 5.0, 0), 0.8, 0.3, 'claro'))   # la barba
    for sg in (1, -1):
        pr.append(elip((hx + 1.0, hy + 0.8, 1.7 * sg), (0.5, 0.5, 0.4), 'ojo'))
        # Los cuernos: dos tramos que se curvan hacia atrás.
        c0 = (hx - 0.4, hy + 2.0, 1.2 * sg)
        c1 = (hx - 3.4, hy + 4.6, 1.8 * sg)
        pr.append(cono(c0, c1, 0.9, 0.7, 'cuerno'))
        pr.append(cono(c1, (hx - 5.8, hy + 2.8, 2.2 * sg), 0.7, 0.3, 'cuerno'))
        pr.append(cono((hx - 1.0, hy + 1.0, 2.0 * sg), (hx - 2.0, hy + 0.2, 3.8 * sg), 0.7, 0.3, 'pelo'))
    patas4(pr, f, anda, 5.6, -6.4, 11.0, 2.8, 1.3, 'pelo', 'oscuro', y0=y0, paso=3.0)
    pr.append(cono((-9.0, 17 + y0, 0), (-10.6, 18.6 + y0, 0), 1.0, 0.4, 'oscuro'))

    def retoque(p, Pm, nm, nw):
        if p['mat'] == 'pelo' and Pm[1] < 9.0:
            return 'oscuro'                                    # calcetines oscuros
        if p['mat'] == 'pelo' and nw[1] > 0.75:
            return 'claro'                                     # ceniza clara en el lomo
        return None
    return pr, retoque


ARMADILLO_MAT = {
    'placa': tonos('#9a8670', 0.35, 0.55),
    'banda': tonos('#6a5a48', 0.25, 0.5),
    'piel': tonos('#c8a890', 0.2, 0.45),
    'ojo': emite('#120c0a'),
}


def armadillo(accion, i):
    f, anda = fase(accion, i)
    come = accion == 'come'
    y0 = 0.2 if (accion == 'quieto' and i == 2) else 0.0
    concha = elip((0, 5.8 + y0, 0), (8.4, 4.8, 5.0), 'placa')
    pr = [concha]
    hx, hy = (10.2, 2.6 + (0.4 if i == 2 else 0.0)) if come else (9.6, 4.2 + y0)
    pr.append(cono((6.0, 4.6 + y0, 0), (hx, hy, 0), 2.6, 1.2, 'placa'))
    pr.append(cono((hx, hy, 0), (hx + 2.4, hy - 0.8, 0), 1.1, 0.5, 'piel'))
    for sg in (1, -1):
        pr.append(elip((hx - 0.6, hy + 0.9, 1.4 * sg), (0.4, 0.4, 0.3), 'ojo'))
        pr.append(cono((hx - 2.0, hy + 1.6, 1.0 * sg), (hx - 2.6, hy + 3.4, 1.4 * sg), 0.7, 0.3, 'piel'))
    patas4(pr, f, anda, 4.6, -4.6, 3.6, 3.4, 1.1, 'piel', None, y0=y0, paso=1.8)
    pr.append(cono((-8.0, 4.0 + y0, 0), (-13.0, 2.0 + y0, 0), 1.4, 0.4, 'placa'))

    def retoque(p, Pm, nm, nw):
        if p is concha and -4.6 < Pm[0] < 4.6 and (Pm[0] + 4.6) % 2.3 < 0.55:
            return 'banda'                                     # las bandas que dan la vuelta
        if p['mat'] == 'placa' and len(pr) and p is not concha and (Pm[0] % 1.6) < 0.4:
            return 'banda'                                     # los anillos de la cola
        return None
    return pr, retoque


# ── LA HONDONADA: el caracol y el topo luminoso ────────────────────────────
CARACOL_MAT = {
    'concha': tonos('#8a5ab0', 0.35, 0.5),
    'espiral': tonos('#9ff0e8', 0.2, 0.42),
    'cuerpo': tonos('#d6c8b8', 0.15, 0.4),
    'ojo': emite('#2a1a3a'),
}


def caracol(accion, i):
    f, anda = fase(accion, i)
    come = accion == 'come'
    estira = math.sin(f) * 1.2 if anda else 0.0
    y0 = 0.15 if (accion == 'quieto' and i == 2) else 0.0
    pie = elip((1.0 + estira * 0.3, 1.6, 0), (10.0 + estira, 1.6, 3.0), 'cuerpo')
    concha = elip((-1.6, 8.2 + y0, 0), (6.2, 6.4, 4.0), 'concha')
    pr = [pie, concha]
    hx = 9.0 + estira
    hy = 3.4 - (0.8 if come and i == 2 else 0.0)
    pr.append(elip((hx, hy, 0), (2.0, 2.0, 1.8), 'cuerpo'))
    for sg in (1, -1):
        t = (hx + 1.6, hy + 5.0, 1.0 * sg)
        pr.append(cono((hx + 0.4, hy + 1.2, 0.6 * sg), t, 0.4, 0.3, 'cuerpo'))
        pr.append(elip(t, (0.6, 0.6, 0.6), 'ojo'))

    def retoque(p, Pm, nm, nw):
        if p is concha:
            # UNA espiral ancha y clara (vuelta y media): fina se rompía en puntos.
            dx, dy = Pm[0] + 1.6, Pm[1] - 8.2 - y0
            r = math.hypot(dx / 6.2, dy / 6.4)
            ang = math.atan2(dy, dx) / (2 * math.pi)
            return 'espiral' if (r * 1.5 - ang) % 1.0 < 0.34 and 0.12 < r < 0.92 else None
        return None
    return pr, retoque


TOPO_MAT = {
    'pelo': tonos('#4a3a64', 0.32, 0.5),
    'mano': tonos('#e8a0b8', 0.2, 0.45),
    'raya': emite('#8ff0ff'),
    'ojo': emite('#f0f8ff'),
}


def topo_luz(accion, i):
    f, anda = fase(accion, i)
    come = accion == 'come'
    bote = math.sin(f * 2) * 0.3 if anda else 0.0
    y0 = bote + (0.2 if (accion == 'quieto' and i == 2) else 0.0)
    cuerpo = elip((0, 4.6 + y0, 0), (7.6, 4.2, 4.4), 'pelo')
    pr = [cuerpo]
    hx, hy = (8.4, 2.4 + (0.4 if i == 2 else 0.0)) if come else (7.8, 4.2 + y0)
    pr.append(cono((5.4, 4.4 + y0, 0), (hx + 1.6, hy - 0.4, 0), 3.0, 1.0, 'pelo'))
    pr.append(elip((hx + 2.2, hy - 0.5, 0), (1.0, 0.9, 1.0), 'mano'))                 # la nariz rosa
    for sg in (1, -1):
        pr.append(elip((hx - 0.2, hy + 1.2, 1.9 * sg), (0.4, 0.35, 0.3), 'ojo'))
        # Las manos de cavar: palas anchas, una delante y otra atrás según el paso.
        ff = f + (0 if sg > 0 else math.pi)
        sw = math.sin(ff) * 1.8 if anda else (1.4 if come else 0.0)
        pr.append(elip((4.0 + sw, 1.0, 3.8 * sg), (1.9, 0.7, 1.5), 'mano'))
        pr.append(elip((-4.0 - sw * 0.6, 1.0, 3.4 * sg), (1.4, 0.6, 1.1), 'mano'))
    pr.append(cono((-7.0, 4.0 + y0, 0), (-9.4, 3.2 + y0, 0), 0.7, 0.3, 'mano'))

    def retoque(p, Pm, nm, nw):
        if p is cuerpo and abs(Pm[2]) < 0.8 and nw[1] > 0.45:
            return 'raya'                                     # UNA raya que brilla por el lomo
        return None
    return pr, retoque


FAUNA = {
    # especie: (modelo, materiales, ancho, alto, filas bajo el apoyo, acorta de frente)
    'gaviota': (gaviota, GAVIOTA_MAT, 30, 24, 2, 0.75),
    'nutria': (nutria, NUTRIA_MAT, 48, 22, 2, 0.6),
    'rana': (rana, RANA_MAT, 24, 18, 2, 0.9),
    'garza': (garza, GARZA_MAT, 34, 48, 2, 0.8),
    'tortuga': (tortuga, TORTUGA_MAT, 30, 20, 2, 0.85),
    'ibis': (ibis, IBIS_MAT, 32, 36, 2, 0.8),
    'ardilla': (ardilla, ARDILLA_MAT, 24, 24, 2, 0.85),
    'alce': (alce, ALCE_MAT, 64, 58, 3, 0.6),
    'capibara': (capibara, CAPIBARA_MAT, 40, 24, 2, 0.7),
    'tucan': (tucan, TUCAN_MAT, 28, 26, 2, 0.85),
    'cabra_ceniza': (cabra, CABRA_MAT, 40, 40, 3, 0.7),
    'armadillo': (armadillo, ARMADILLO_MAT, 34, 18, 2, 0.8),
    'caracol': (caracol, CARACOL_MAT, 30, 22, 2, 0.8),
    'topo': (topo_luz, TOPO_MAT, 30, 16, 2, 0.8),
}


# ===========================================================================
# LAS BESTIAS: los monstruos que no son personas (andar 4, ataque 3, quieto 2)
# ===========================================================================
# Misma cámara y misma luz que los de siempre (tools/gf_bestias3d.py), pero
# cada cuerpo es nuevo: ninguno sale de girar o teñir un modelo que ya había.

from gf_bestias3d import DIRV  # noqa: E402
from gf_arte import contorno_de  # noqa: E402

HACIA_CAMARA = -DIRV


def giro_x(a):
    """Alabea: gira alrededor del eje x (lleva y hacia z). Columnas = ejes locales."""
    c, s = math.cos(a), math.sin(a)
    return np.array([[1.0, 0.0, 0.0], [0.0, c, -s], [0.0, s, c]])


def giro_y(a):
    """Gira alrededor de la vertical (lleva x hacia z)."""
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0.0, s], [0.0, 1.0, 0.0], [-s, 0.0, c]])


def alzar(p, piv, th):
    """El punto p girado en el plano x-y alrededor de piv: th > 0 levanta lo de delante."""
    x, y, z = p
    dx, dy = x - piv[0], y - piv[1]
    c, s = math.cos(th), math.sin(th)
    return (piv[0] + dx * c - dy * s, piv[1] + dx * s + dy * c, z)


def marco(eje, hacia):
    """Una base (columnas = ejes locales): x a lo largo de `eje` e y hacia
    `hacia` (sin su parte a lo largo de x); z, la que falta."""
    x = np.asarray(eje, dtype=float)
    x = x / np.linalg.norm(x)
    y = np.asarray(hacia, dtype=float)
    y = y - (y @ x) * x
    y = y / np.linalg.norm(y)
    return np.column_stack([x, y, np.cross(x, y)])


def medio(a, b, t=0.5):
    return tuple(a[k] + (b[k] - a[k]) * t for k in range(3))


def nucleo_que_brilla(nombre_borde, nombre_centro, umbral=0.72):
    """Retoque de una pieza que emite luz: el centro (lo que mira a la cámara)
    más claro que el borde. Así una bola de luz tiene volumen y no es un disco."""
    def f(p, nw):
        if p['mat'] == nombre_borde and float(nw @ HACIA_CAMARA) > umbral:
            return nombre_centro
        return None
    return f


# ── EL PUERTO: el cangrejo coloso ──────────────────────────────────────────
CANGREJO_MAT = {
    'concha': {'tonos': rampa(hex_rgb('#c4553c'), 5, arriba=0.34, abajo=0.58), 'brillo': True},
    'borde': tonos('#8a3226', 0.28, 0.55),
    'vientre': tonos('#ecd6ae', 0.15, 0.42),
    'pinza': tonos('#d2654a', 0.32, 0.56),
    'punta': tonos('#3a2420', 0.25, 0.45),
    'pata': tonos('#b24c36', 0.3, 0.56),
    'tallo': tonos('#9a3a2a', 0.28, 0.5),
    'boca': tonos('#5a2018', 0.2, 0.4),
    'ojo': emite('#ffe27a'),
}


def cangrejo_coloso(accion, i, jefe=False):
    """Un cangrejo enorme: caparazón ancho con UN ribete oscuro, ojos en sus
    tallos, dos pinzas que se abren (la del jefe, una mucho mayor) y tres
    patas por lado que andan a trípodes alternos."""
    f, anda = fase(accion, i)
    y0, abre, garra = 0.0, 0.0, (0.0, 0.0)
    if accion == 'camina':
        y0 = 0.6 if i in (2, 4) else 0.0
        abre = 0.6
    elif accion == 'quieto':
        y0 = 0.4 if i == 2 else 0.0
        abre = 0.4 if i == 1 else 1.4
    else:
        abre = (2.6, 0.0, 1.0)[i - 1]
        garra = ((-3.0, 12.0), (7.0, 2.0), (6.0, -6.0))[i - 1]
        y0 = (1.0, 0.0, -1.0)[i - 1]
    concha = elip((0, 15 + y0, 0), (13, 6.2, 17), 'concha')
    pr = [concha, elip((0, 11.6 + y0, 0), (11.4, 3.6, 14.6), 'vientre'),
          elip((9.6, 15.2 + y0, 0), (4.2, 3.6, 12.0), 'concha')]                  # la frente del caparazón
    pr.append(elip((12.6, 12.4 + y0, 0), (1.6, 2.2, 4.0), 'boca'))
    for sg in (1, -1):
        base = (10.4, 17.8 + y0, 3.4 * sg)
        ojo = (12.0, 24.0 + y0, 4.4 * sg)
        pr.append(cono(base, ojo, 0.9, 0.7, 'tallo'))
        pr.append(elip(ojo, (1.5, 1.5, 1.5), 'ojo'))
        g = 1.45 if (jefe and sg > 0) else 1.0
        hombro = (8.0, 13.6 + y0, 12.5 * sg)
        codo = (13.0 + garra[0] * 0.4, 12.0 + y0 + garra[1] * 0.5, 19.5 * sg)
        mun = (18.0 + garra[0], 13.0 + y0 + garra[1], 17.5 * sg)
        pr.append(cono(hombro, codo, 2.9, 2.7, 'pinza'))
        pr.append(cono(codo, mun, 2.7, 3.1, 'pinza'))
        palma = (mun[0] + 4.4 * g, mun[1] + 0.8 * g, mun[2] - 0.6 * sg)
        pr.append(elip(palma, (6.4 * g, 4.8 * g, 4.4 * g), 'pinza'))
        # El dedo fijo (abajo) y el que se abre (arriba), con la punta oscura.
        f0 = (palma[0] + 4.2 * g, palma[1] - 1.4 * g, palma[2])
        f1 = (palma[0] + 10.6 * g, palma[1] - 2.4 * g, palma[2] - 0.4 * sg)
        d0 = (palma[0] + 3.8 * g, palma[1] + 2.0 * g, palma[2])
        d1 = (palma[0] + 10.4 * g, palma[1] + (0.8 + abre * 1.7) * g, palma[2] - 0.4 * sg)
        pr.append(cono(f0, f1, 2.3 * g, 0.6 * g, 'pinza'))
        pr.append(cono(d0, d1, 2.0 * g, 0.6 * g, 'pinza'))
        pr.append(cono(medio(f0, f1, 0.72), f1, 1.0 * g, 0.45 * g, 'punta'))
        pr.append(cono(medio(d0, d1, 0.72), d1, 0.9 * g, 0.45 * g, 'punta'))
        for k, (x0, abre_x) in enumerate(((4.5, 3.0), (-1.5, 0.0), (-7.5, -3.4))):
            ff = f + (0 if (k % 2 == 0) == (sg > 0) else math.pi)
            sw = math.sin(ff) * 2.4 if anda else 0.0
            alza = max(0.0, math.cos(ff)) * 2.0 if anda else 0.0
            cad = (x0, 12.6 + y0, 14.0 * sg)
            rod = (x0 + sw * 0.5 + abre_x * 0.6, 15.4 + y0 + alza * 0.5, 23.0 * sg)
            pie = (x0 + sw + abre_x, 0.8 + alza, 27.5 * sg)
            pr.append(cono(cad, rod, 2.1, 1.8, 'pata'))
            pr.append(cono(rod, pie, 1.8, 0.7, 'pata'))

    def retoque(p, Pm, nm, nw):
        if p is concha and abs(nw[1]) < 0.42:
            return 'borde'                                      # el ribete: UNA banda alrededor
        return None
    return pr, retoque


# ── EL PANTANO: el sapo tóxico ─────────────────────────────────────────────
SAPO_MAT = {
    'piel': {'tonos': rampa(hex_rgb('#5e8c34'), 5, arriba=0.34, abajo=0.58), 'brillo': True},
    'franja': tonos('#d8d23a', 0.22, 0.48),
    'tripa': tonos('#e6e2ae', 0.12, 0.4),
    'saco': tonos('#b8e05a', 0.25, 0.45),
    'ojo_b': tonos('#e0b83a', 0.25, 0.45),
    'ojo': emite('#1c1408'),
    'boca': tonos('#3a1a20', 0.2, 0.4),
    'lengua': tonos('#d0506a', 0.25, 0.45),
}


def sapo_toxico(accion, i):
    """Un sapo grande y liso (sin verrugas): dos franjas amarillas por el lomo,
    el saco de la garganta que se hincha antes de escupir y anda a saltos."""
    salto, estira, saco, alza_cab, abre = 0.0, 0.0, 0.0, 0.0, 0.0
    if accion == 'camina':
        salto, estira = {1: (0.0, -0.6), 2: (3.0, 0.3), 3: (5.4, 0.8), 4: (1.6, -0.3)}[i]
    elif accion == 'quieto':
        saco = 0.6 if i == 2 else 0.0
    else:
        saco = (2.2, 3.4, 0.4)[i - 1]
        alza_cab = (1.0, 2.2, -0.6)[i - 1]
        abre = (0.0, 0.6, 2.4)[i - 1]
    y0 = salto
    cuerpo = elip((0, 10 + y0, 0), (12, 7.6 + estira * 0.6, 10.4), 'piel')
    hx, hy = 9.6, 11.4 + y0 + alza_cab
    cabeza = elip((hx, hy, 0), (7.0, 5.4, 8.6), 'piel')
    pr = [cuerpo, cabeza]
    pr.append(elip((hx + 5.8, hy - 1.6, 0), (0.9, 0.7 + abre * 0.5, 6.6), 'boca'))     # la boca, de lado a lado
    if abre > 1.5:
        pr.append(elip((hx + 6.0, hy - 2.2, 0), (1.2, 1.0, 2.0), 'lengua'))
    pr.append(elip((hx + 2.4, hy - 4.4 - saco * 0.3, 0), (3.6 + saco, 2.6 + saco * 0.8, 4.6 + saco), 'saco'))
    for sg in (1, -1):
        pr.append(elip((hx + 0.6, hy + 4.6, 4.2 * sg), (2.6, 2.5, 2.5), 'ojo_b'))
        pr.append(elip((hx + 2.6, hy + 5.0, 4.6 * sg), (0.8, 1.2, 1.0), 'ojo'))
        pr.append(elip((-5.6, 7.0 + y0, 8.6 * sg), (6.0, 4.0, 3.4), 'piel'))          # el muslo, doblado
        pie_x = -4.0 - estira * 4.0
        py = 0.7 + max(0.0, y0 * 0.6)
        pr.append(cono((-2.4, 4.2 + y0, 10.0 * sg), (pie_x, py + 0.6, 9.6 * sg), 1.8, 1.4, 'piel'))
        pr.append(elip((pie_x + 2.4, py, 10.0 * sg), (3.6, 0.7, 2.4), 'piel'))         # el pie palmeado, UNA pala
        mano = (10.4 + estira * 1.2, 0.8 + max(0.0, y0 * 0.5), 7.6 * sg)
        pr.append(cono((7.0, 7.0 + y0, 6.4 * sg), mano, 1.6, 1.2, 'piel'))
        pr.append(elip((mano[0] + 1.0, mano[1], mano[2]), (2.0, 0.6, 1.6), 'piel'))

    def retoque(p, Pm, nm, nw):
        if p['mat'] == 'piel' and nm[1] < -0.3:
            return 'tripa'
        if (p is cuerpo or p is cabeza) and nw[1] > 0.3 and 3.0 < abs(Pm[2]) < 5.4:
            return 'franja'                                     # DOS franjas a lo largo del lomo
        return None
    return pr, retoque


# ── LAS RUINAS: el centinela del sol y el escarabajo solar ────────────────
CENTINELA_MAT = {
    'piedra': tonos('#cdb88e', 0.3, 0.58),
    'piedra_o': tonos('#a08a66', 0.28, 0.58),
    'bronce': {'tonos': rampa(hex_rgb('#b8823a'), 5, arriba=0.38, abajo=0.55), 'brillo': True},
    'voluta': tonos('#e2d2aa', 0.25, 0.5),
    'sol': emite('#ffc844'),
    'sol2': emite('#fff0b0'),
    'ojo': emite('#ffe6a0'),
}


def centinela(accion, i, jefe=False):
    """El centinela de las ruinas: piernas de tambores de columna con su aro de
    bronce, el pecho de sillar con un disco de sol que brilla, la cabeza con
    un capitel y sus dos volutas (dos rollos lisos, sin espiral) y hombreras
    de bronce.
    El del jefe lleva además el halo de sol detrás de la cabeza."""
    bob, paso, lean = 0.0, 0.0, 0.12
    f = (i - 1) / 4.0 * math.pi * 2
    if accion == 'camina':
        paso = math.sin(f)
        bob = 1.0 if i in (2, 4) else 0.0
    elif accion == 'quieto':
        bob = 0.8 if i == 2 else 0.0
    else:
        lean = (0.0, -0.12, 0.36)[i - 1]
    pr = []
    tambores = []
    for sg in (1, -1):
        av = paso * 6 * sg if accion == 'camina' else (3 * sg if accion == 'ataque' and i == 3 else 0.0)
        alza = max(0.0, math.cos(f + (0 if sg > 0 else math.pi))) * 3 if accion == 'camina' else 0.0
        arriba, abajo = (0.0, 30.0 + bob, 7.5 * sg), (av, 4.6 + alza, 7.8 * sg)
        for k in range(3):
            d = roca(medio(arriba, abajo, (k + 0.5) / 3.0), (4.6, 3.9, 4.6), 'piedra', rot=giro_y(0.39),
                     bisel=0.9, arista=0.84)
            tambores.append(d)
            pr.append(d)
        pr.append(roca((av + 1.2, 2.2 + alza, 7.8 * sg), (6.6, 2.2, 5.6), 'piedra_o'))       # el plinto
    pr.append(roca((0, 31.5 + bob, 0), (7.0, 3.2, 11.0), 'piedra_o'))
    pr.append(roca((1.0, 37.0 + bob, 0), (7.0, 4.4, 9.0), 'piedra', rot=giro_z(-lean * 0.5)))
    golpe = accion == 'ataque' and i == 3
    tor = (3.0 + (5 if golpe else 0), 49.0 + bob - (4 if golpe else 0), 0.0)
    pecho = roca(tor, (12.0, 10.0, 13.5), 'piedra', rot=giro_z(-lean), bisel=0.8, arista=0.9)
    pr.append(pecho)
    # El disco de sol, en la cara de delante del pecho (inclinado con él).
    ex = (math.cos(lean), -math.sin(lean), 0.0)
    disco = elip(tuple(tor[k] + ex[k] * 12.4 for k in range(3)), (1.0, 6.4, 6.4), 'sol', rot=giro_z(-lean))
    pr.append(disco)
    # La cabeza: la cara (con dos ojos) bajo un capitel con sus volutas.
    cab = (tor[0] + 3.5 + ex[0] * 1.5, tor[1] + 15.0, 0.0)
    pr.append(roca((cab[0] - 0.5, cab[1] - 5.6, 0.0), (3.6, 2.4, 3.8), 'piedra_o'))       # el cuello
    pr.append(roca(cab, (5.6, 5.0, 5.6), 'piedra'))
    for sg in (1, -1):
        pr.append(elip((cab[0] + 5.3, cab[1] + 0.4, 2.2 * sg), (0.7, 1.2, 1.1), 'ojo'))
    # El capitel: una losa ancha y, en sus dos puntas, los rollos de las volutas.
    pr.append(roca((cab[0] - 0.2, cab[1] + 6.2, 0.0), (7.4, 1.8, 7.6), 'piedra', bisel=0.9, arista=0.92))
    for sg in (1, -1):
        pr.append(cono((cab[0] - 5.4, cab[1] + 4.0, 7.2 * sg), (cab[0] + 5.6, cab[1] + 4.0, 7.2 * sg), 2.7, 2.7, 'voluta'))
    halo = None
    if jefe:
        halo = elip((cab[0] - 5.4, cab[1] + 2.0, 0.0), (0.8, 13.0, 13.0), 'sol')
        pr.append(halo)
    for sg in (1, -1):
        hombro = (tor[0] - 1.0, tor[1] + 6.0, 15.5 * sg)
        pr.append(roca(hombro, (7.4, 5.6, 6.0), 'bronce', bisel=0.86, arista=0.9))
        if accion == 'ataque':
            puno = {1: (6, 74, 11), 2: (-1, 80, 10), 3: (25, 14, 9)}[i]
            codo = {1: (6, 63, 18), 2: (1, 67, 17), 3: (19, 31, 17)}[i]
        elif accion == 'camina':
            puno = (4 - paso * 7 * sg, 24, 18)
            codo = (2 - paso * 3.5 * sg, 37, 18.5)
        else:
            puno = (5, 24 + bob, 18)
            codo = (3, 37, 18.5)
        codo = (codo[0], codo[1], codo[2] * sg)
        puno = (puno[0], puno[1], puno[2] * sg)
        pr.append(cono(hombro, codo, 4.2, 4.0, 'piedra'))
        pr.append(elip(codo, (4.5, 4.5, 4.5), 'bronce'))
        pr.append(cono(codo, puno, 4.0, 4.2, 'piedra'))
        pr.append(roca(puno, (5.6, 5.4, 5.4), 'piedra_o'))

    def retoque(p, Pm, nm, nw):
        if any(p is t for t in tambores):
            q = _local(p, Pm[None, :])[0]
            return 'bronce' if q[1] > 2.2 else None             # el aro de bronce de cada tambor
        if p is disco or (halo is not None and p is halo):
            q = _local(p, Pm[None, :])[0]
            r = math.hypot(q[1], q[2]) / p['r'][1]
            return 'sol2' if r < 0.58 else None                 # el centro claro y UN aro de luz
        return None
    return pr, retoque


ESCARABAJO_SOL_MAT = {
    'caparazon': {'tonos': rampa(hex_rgb('#1f8a86'), 5, arriba=0.4, abajo=0.58), 'brillo': True},
    'oscuro': tonos('#123c40', 0.2, 0.45),
    'oro': {'tonos': rampa(hex_rgb('#c89a34'), 5, arriba=0.38, abajo=0.55), 'brillo': True},
    'pata': tonos('#2a4a4c', 0.28, 0.5),
    'sol': emite('#ffc844'),
    'sol2': emite('#fff2b8'),
    'ojo': emite('#ffe680'),
}


def escarabajo_sol(accion, i):
    """El escarabajo solar: élitros turquesa con UNA línea en medio, cabeza y
    patas de oro, y entre sus dos cuernos una bola de sol que crece al atacar."""
    f, anda = fase(accion, i)
    y0, orbe_y, orbe_r, avanza = 0.0, 0.0, 4.2, 0.0
    if accion == 'camina':
        y0 = 0.4 if i in (2, 4) else 0.0
    elif accion == 'quieto':
        y0 = 0.3 if i == 2 else 0.0
        orbe_r = 4.2 if i == 1 else 4.6
    else:
        orbe_y = (5.0, 3.0, 0.0)[i - 1]
        orbe_r = (5.0, 5.8, 3.6)[i - 1]
        avanza = (-1.5, 3.0, 2.0)[i - 1]
    elitros = elip((-2 + avanza * 0.5, 11 + y0, 0), (11.5, 7.6, 9.6), 'caparazon')
    pr = [elitros, elip((8.4 + avanza * 0.7, 10.4 + y0, 0), (5.2, 5.4, 7.6), 'caparazon')]
    hx = 13.6 + avanza
    pr.append(elip((hx, 8.6 + y0, 0), (3.4, 3.0, 4.8), 'oro'))
    for sg in (1, -1):
        pr.append(elip((hx + 1.4, 9.8 + y0, 3.4 * sg), (1.0, 1.0, 0.9), 'ojo'))
        pr.append(cono((hx + 1.6, 10.4 + y0, 2.0 * sg), (hx + 4.0, 15.0 + y0 + orbe_y * 0.6, 3.0 * sg), 1.1, 0.45, 'oro'))
        for k, x0 in enumerate((7.0, 1.0, -5.0)):
            ff = f + (0 if (k % 2 == 0) == (sg > 0) else math.pi)
            sw = math.sin(ff) * 2.2 if anda else 0.0
            alza = max(0.0, math.cos(ff)) * 1.6 if anda else 0.0
            cad = (x0 + avanza * 0.5, 7.4 + y0, 6.6 * sg)
            rod = (x0 + sw * 0.5 + (1.2 if k == 0 else -0.6), 9.6 + alza * 0.5, 12.0 * sg)
            pie = (x0 + sw + (2.4 if k == 0 else -1.6), 0.8 + alza, 14.4 * sg)
            pr.append(cono(cad, rod, 1.2, 1.0, 'pata'))
            pr.append(cono(rod, pie, 1.0, 0.5, 'oro'))
    orbe = elip((hx + 6.2, 17.0 + y0 + orbe_y, 0), (orbe_r, orbe_r, orbe_r), 'sol')
    pr.append(orbe)
    brilla = nucleo_que_brilla('sol', 'sol2')

    def retoque(p, Pm, nm, nw):
        if p is elitros and abs(Pm[2]) < 0.6 and nw[1] > 0.15:
            return 'oscuro'                                     # la junta de los élitros: UNA línea
        if p is orbe:
            return brilla(p, nw)
        return None
    return pr, retoque


# ── LAS COLINAS: el oso de otoño ───────────────────────────────────────────
OSO_OTONO_MAT = {
    'pelo': tonos('#7a4a2c', 0.32, 0.56),
    'oscuro': tonos('#4a2c1c', 0.22, 0.48),
    'otono': tonos('#c06a2c', 0.32, 0.52),
    'claro': tonos('#c8a074', 0.2, 0.45),
    'luna': tonos('#f0e2bc', 0.12, 0.38),
    'nariz': tonos('#1c1412', 0.2, 0.3),
    'boca': tonos('#6a2a2a', 0.2, 0.4),
    'diente': tonos('#efe8d6', 0.1, 0.3),
    'garra': tonos('#e8dcc0', 0.15, 0.4),
    'ojo': emite('#ffb03a'),
}


def oso_otono(accion, i):
    """El oso de las colinas: pardo con la joroba de los hombros, el lomo
    color de otoño y UNA media luna clara en el pecho. Ataca de pie: se alza
    sobre las patas de atrás y da el zarpazo."""
    f = (i - 1) / 4.0 * math.pi * 2
    bob, th, abre = 0.0, 0.0, 0.0
    if accion == 'camina':
        bob = 0.8 if i in (2, 4) else 0.0
    elif accion == 'quieto':
        bob = 0.6 if i == 2 else 0.0
    else:
        th = (0.95, 1.1, 0.35)[i - 1]
        abre = (1.0, 3.0, 2.0)[i - 1]
    piv = (-10.0, 19.0)
    A = (lambda p: alzar(p, piv, th)) if th else (lambda p: p)
    R = giro_z(th) if th else None
    y0 = bob
    cuerpo = elip(A((0, 22 + y0, 0)), (16, 10, 10.5), 'pelo', rot=R)
    joroba = elip(A((8, 28 + y0, 0)), (8, 8, 9), 'pelo', rot=R)
    pecho = elip(A((11, 21 + y0, 0)), (7, 8.4, 8.6), 'pelo', rot=R)
    grupa = elip((-11, 21 + y0, 0), (9, 9.5, 9.5), 'pelo')
    pr = [cuerpo, joroba, pecho, grupa]
    hx, hy = 22.0, 25.0 + y0
    cabeza = A((hx, hy, 0))
    pr.append(cono(A((14, 25 + y0, 0)), A((hx - 3, hy, 0)), 6.0, 5.2, 'pelo'))
    pr.append(elip(cabeza, (6.4, 6.0, 6.4), 'pelo'))
    pr.append(cono(A((hx + 3, hy - 1.2, 0)), A((hx + 8.6, hy - 2.6, 0)), 3.2, 2.6, 'claro'))
    pr.append(elip(A((hx + 9.0, hy - 2.2, 0)), (1.4, 1.2, 1.5), 'nariz'))
    pr.append(cono(A((hx + 3, hy - 3.8, 0)), A((hx + 7.6, hy - 4.8 - abre, 0)), 2.2, 1.5, 'claro'))
    if abre > 1.5:
        pr.append(cono(A((hx + 3.4, hy - 3.8, 0)), A((hx + 7.2, hy - 4.0 - abre * 0.5, 0)), 1.3, 0.9, 'boca'))
        for sg in (1, -1):
            pr.append(cono(A((hx + 7.0, hy - 2.9, 1.0 * sg)), A((hx + 7.0, hy - 4.1, 1.0 * sg)), 0.55, 0.15, 'diente'))
    for sg in (1, -1):
        pr.append(elip(A((hx - 1.6, hy + 5.0, 3.8 * sg)), (1.9, 1.9, 1.2), 'oscuro'))      # orejas redondas
        pr.append(elip(A((hx + 3.4, hy + 1.6, 3.4 * sg)), (0.9, 0.7, 0.8), 'ojo'))
    # Patas de atrás: siempre en el suelo.
    for sg in (1, -1):
        fa = f + (0 if sg < 0 else math.pi)
        sw = math.sin(fa) * 3.6 if accion == 'camina' else 0.0
        lift = max(0.0, math.cos(fa)) * 2.0 if accion == 'camina' else 0.0
        pata = (-10 + sw, 2.0 + lift, 7.4 * sg)
        pr.append(cono((-10, 17 + y0, 7.0 * sg), pata, 4.6, 3.8, 'pelo'))
        pr.append(elip((pata[0] + 1.4, pata[1], pata[2]), (3.9, 2.0, 3.0), 'oscuro'))
    # Patas de delante: andan, o se alzan y dan el zarpazo (con tres garras).
    for sg in (1, -1):
        hombro = A((10, 18 + y0, 7.0 * sg))
        if accion == 'ataque':
            pata = {1: (19, 29, 7.4), 2: ((14, 46, 8.0) if sg > 0 else (19, 29, 7.4)),
                    3: ((28, 7, 6.0) if sg > 0 else (17, 12, 7.4))}[i]
            pata = (pata[0], pata[1], pata[2] * sg)
        else:
            fa = f + (0 if sg > 0 else math.pi)
            sw = math.sin(fa) * 4.0 if accion == 'camina' else 0.0
            lift = max(0.0, math.cos(fa)) * 2.0 if accion == 'camina' else 0.0
            pata = (10 + sw, 2.0 + lift, 7.4 * sg)
        pr.append(cono(hombro, pata, 4.4, 3.6, 'pelo'))
        pr.append(elip((pata[0] + 1.2, pata[1], pata[2]), (3.8, 2.2, 3.0), 'oscuro'))
        if accion == 'ataque' and i >= 2 and sg > 0:
            for k in (-1, 0, 1):
                a = (pata[0] + 2.6, pata[1] + k * 1.2, pata[2] + k * 0.8)
                pr.append(cono(a, (a[0] + 3.6, a[1] - 0.8 + k * 0.6, a[2]), 0.6, 0.2, 'garra'))
    pr.append(elip((-20.5, 23 + y0, 0), (2.4, 2.2, 2.4), 'pelo'))                    # la cola corta
    erguidas = [cuerpo, joroba, pecho]

    def retoque(p, Pm, nm, nw):
        if p['mat'] != 'pelo':
            return None
        # La normal en el cuerpo (deshecho el giro de cuando se alza).
        if th and any(p is q for q in erguidas):
            c, s = math.cos(th), math.sin(th)
            nb = (nm[0] * c + nm[1] * s, -nm[0] * s + nm[1] * c, nm[2])
        else:
            nb = nm
        if p is pecho and nb[0] > 0.5 and -0.28 < nb[1] < 0.16:
            return 'luna'                                       # la media luna del pecho: UNA banda
        if nb[1] > 0.72:
            return 'otono'                                      # el lomo, color de otoño
        if nb[1] < -0.45:
            return 'oscuro'
        return None
    return pr, retoque


# ── LA SELVA: la pantera ───────────────────────────────────────────────────
PANTERA_MAT = {
    'pelo': {'tonos': rampa(hex_rgb('#282a3c'), 5, arriba=0.5, abajo=0.5), 'brillo': True},
    'oscuro': tonos('#14151e', 0.25, 0.45),
    'nariz': tonos('#3a2a34', 0.2, 0.35),
    'boca': tonos('#5a1e2a', 0.2, 0.4),
    'diente': tonos('#efe8d6', 0.1, 0.3),
    'ojo': emite('#9aff5a'),
}


def pantera(accion, i):
    """La pantera negra de la selva (lisa: ni una mancha), larga y baja, con
    los ojos verdes y la cola que acaba en rizo. Ataca agazapándose y saltando."""
    f = (i - 1) / 4.0 * math.pi * 2
    y0, avanza, estira, abre, cola = 0.0, 0.0, 0.0, 0.0, 0.0
    if accion == 'camina':
        y0 = 0.6 if i in (2, 4) else 0.0
        cola = math.sin(f) * 0.8
    elif accion == 'quieto':
        y0 = 0.4 if i == 2 else 0.0
        cola = 1.2 if i == 2 else -0.4
    else:
        y0 = (-3.0, 5.0, 0.5)[i - 1]
        avanza = (-2.0, 6.0, 9.0)[i - 1]
        estira = (-1.0, 1.0, 0.0)[i - 1]
        abre = (0.6, 1.6, 3.0)[i - 1]
    pr = [elip((avanza * 0.5, 16 + y0, 0), (16 + estira * 2, 6.0, 6.2), 'pelo'),
          elip((9 + avanza * 0.7, 16.6 + y0, 0), (7.0, 7.0, 6.6), 'pelo'),
          elip((-10 + avanza * 0.3, 16.2 + y0, 0), (7.0, 6.6, 6.4), 'pelo')]
    hx, hy = 19.5 + avanza, 20.5 + y0
    pr.append(cono((12 + avanza * 0.8, 18.5 + y0, 0), (hx - 2.0, hy - 0.6, 0), 4.0, 3.4, 'pelo'))
    pr.append(elip((hx, hy, 0), (5.0, 4.4, 4.8), 'pelo'))
    pr.append(cono((hx + 2.4, hy - 1.0, 0), (hx + 6.2, hy - 1.8, 0), 2.4, 1.8, 'pelo'))
    pr.append(elip((hx + 6.4, hy - 1.4, 0), (0.9, 0.8, 1.1), 'nariz'))
    pr.append(cono((hx + 2.0, hy - 2.8, 0), (hx + 5.6, hy - 3.6 - abre, 0), 1.6, 1.1, 'pelo'))
    if abre > 1.5:
        pr.append(cono((hx + 2.6, hy - 2.6, 0), (hx + 5.4, hy - 3.0 - abre * 0.5, 0), 1.0, 0.7, 'boca'))
        for sg in (1, -1):
            pr.append(cono((hx + 5.6, hy - 1.9, 0.9 * sg), (hx + 5.6, hy - 3.1, 0.9 * sg), 0.5, 0.15, 'diente'))
    for sg in (1, -1):
        pr.append(cono((hx - 1.4, hy + 3.0, 2.6 * sg), (hx - 2.0, hy + 5.8, 3.0 * sg), 1.4, 0.4, 'pelo'))
        pr.append(elip((hx + 3.0, hy + 1.0, 2.6 * sg), (0.9, 0.6, 0.7), 'ojo'))
    for delante, base_x in ((True, 9.0), (False, -10.0)):
        for sg in (1, -1):
            fase_ = f + (0 if (sg > 0) == delante else math.pi)
            sw = math.sin(fase_) * 4.2 if accion == 'camina' else 0.0
            lift = max(0.0, math.cos(fase_)) * 2.0 if accion == 'camina' else 0.0
            x0 = base_x + avanza * (0.8 if delante else 0.3)
            hy0 = 13.5 + y0
            z = 4.2 * sg
            if accion == 'ataque':
                if i == 1:
                    pata, rod = (x0 + (3.0 if delante else -1.0), 0.9, z * 1.05), (x0 + (1.0 if delante else -4.0), 5.0, z)
                elif i == 2:
                    pata, rod = (x0 + (9.0 if delante else -9.0), hy0 - 5.0, z * 1.05), (x0 + (5.0 if delante else -5.0), hy0 - 3.5, z)
                else:
                    pata, rod = (x0 + (6.0 if delante else -2.0), 0.9, z * 1.05), (x0 + (4.0 if delante else -4.0), 7.0, z)
            else:
                pata = (x0 + sw, 0.9 + lift, z * 1.05)
                rod = (x0 + sw * 0.5 + (0.0 if delante else -2.4), 7.4 + lift * 0.6 + y0 * 0.3, z)
            if not delante:
                pr.append(elip((x0, hy0 + 0.5, z * 0.9), (4.6, 5.4, 2.8), 'pelo'))
            pr.append(cono((x0, hy0, z), rod, 2.2, 1.7, 'pelo'))
            pr.append(cono(rod, pata, 1.7, 1.4, 'pelo'))
            pr.append(elip((pata[0] + 0.8, pata[1], pata[2]), (2.0, 1.0, 1.5), 'oscuro'))
    c0 = (-15 + avanza * 0.3, 17.5 + y0, 0)
    c1 = (-23 + avanza * 0.2, 13.0 + y0 + cola, cola * 0.6)
    c2 = (-30, 13.5 + y0 + cola * 1.4, cola)
    c3 = (-33.5, 18.5 + y0 + cola * 1.6, cola * 1.2)
    pr += [cono(c0, c1, 2.0, 1.6, 'pelo'), cono(c1, c2, 1.6, 1.4, 'pelo'), cono(c2, c3, 1.4, 1.1, 'oscuro')]
    return pr, None


# ── EL VOLCÁN: la salamandra y el gólem de magma ───────────────────────────
SALAMANDRA_MAGMA_MAT = {
    'piel': tonos('#2e2628', 0.36, 0.5),
    'vientre': tonos('#8a3a1e', 0.25, 0.48),
    'lava': emite('#ff8a2a'),
    'ojo': emite('#ffe066'),
    'boca': emite('#ff5a1a'),
}


def salamandra_magma(accion, i):
    """La salamandra de magma: negra de basalto, UNA raya de lava por el lomo
    hasta la cola, el vientre rojo oscuro; al atacar abre la boca encendida."""
    f, anda = fase(accion, i)
    y0, cab_y, abre, avanza = 0.0, 0.0, 0.0, 0.0
    if accion == 'quieto':
        y0 = 0.25 if i == 2 else 0.0
    elif accion == 'ataque':
        cab_y = (3.0, 4.0, 0.5)[i - 1]
        abre = (0.0, 2.2, 1.4)[i - 1]
        avanza = (-1.0, 0.0, 3.0)[i - 1]

    def zof(x):
        return math.sin(x / 9.0 + f) * 2.2 if anda else 0.0
    cuerpo = elip((avanza * 0.3, 6.0 + y0, zof(0)), (11.0, 3.8, 4.6), 'piel')
    hombros = elip((8.0 + avanza * 0.6, 6.4 + y0, zof(8)), (5.0, 3.8, 4.4), 'piel')
    hx = 15.0 + avanza
    hz = zof(15)
    cabeza = elip((hx, 6.6 + y0 + cab_y, hz), (5.2, 3.0, 4.6), 'piel')
    pr = [cuerpo, hombros, cabeza]
    if abre > 0.5:
        pr.append(cono((hx + 1.0, 5.0 + y0 + cab_y, hz), (hx + 5.0, 4.6 + y0 + cab_y - abre, hz), 1.6, 1.0, 'piel'))
        pr.append(elip((hx + 3.0, 5.4 + y0 + cab_y - abre * 0.4, hz), (2.0, 0.6 + abre * 0.3, 2.4), 'boca'))
    for sg in (1, -1):
        pr.append(elip((hx + 2.2, 8.4 + y0 + cab_y, hz + 2.6 * sg), (0.9, 0.8, 0.8), 'ojo'))
    for delante, x0 in ((True, 8.0), (False, -7.0)):
        for sg in (1, -1):
            ff = f + (0 if (sg > 0) == delante else math.pi)
            sw = math.sin(ff) * 3.0 if anda else 0.0
            alza = max(0.0, math.cos(ff)) * 1.4 if anda else 0.0
            cad = (x0, 5.6 + y0, zof(x0) + 3.4 * sg)
            rod = (x0 + sw * 0.4, 6.4 + alza, zof(x0) + 7.4 * sg)
            pie = (x0 + sw + 1.0, 0.8 + alza, zof(x0) + 8.6 * sg)
            pr.append(cono(cad, rod, 1.5, 1.3, 'piel'))
            pr.append(cono(rod, pie, 1.3, 1.1, 'piel'))
            pr.append(elip((pie[0] + 1.0, pie[1], pie[2]), (1.8, 0.6, 1.5), 'piel'))
    xs, rs = [-10.0, -17.0, -23.0, -28.0], [3.2, 2.4, 1.6, 0.7]
    cola = []
    for a, b, ra, rb in zip(xs, xs[1:], rs, rs[1:]):
        c = cono((a, 5.6 + y0 - (a + 10) * 0.05, zof(a)), (b, 5.0 + y0 - (b + 10) * 0.08, zof(b)), ra, rb, 'piel')
        cola.append(c)
        pr.append(c)
    lomo = [cuerpo, hombros] + cola

    def retoque(p, Pm, nm, nw):
        if p['mat'] != 'piel':
            return None
        if nm[1] < -0.35:
            return 'vientre'
        if any(p is q for q in lomo) and nw[1] > 0.55 and abs(Pm[2] - zof(Pm[0])) < 1.3:
            return 'lava'                                       # UNA raya de lava por el lomo
        return None
    return pr, retoque


# (2026-11-24) El gólem de magma es ahora "el volcán que anda" (placas de
# basalto con el magma en las juntas, un cráter a la espalda y puños
# fundidos): vive con los demás gólems en tools/gf_golems.py.
from gf_golems import GOLEM_MAGMA  # noqa: E402


# ── LA HONDONADA: el hongo andante y la polilla de luz ─────────────────────
HONGO_MAT = {
    'sombrero': {'tonos': rampa(hex_rgb('#8448ae'), 5, arriba=0.36, abajo=0.55), 'brillo': True},
    'borde': tonos('#dcbcf4', 0.2, 0.45),
    'laminas': tonos('#4e3260', 0.2, 0.45),
    'tallo': tonos('#ece0cc', 0.15, 0.42),
    'anillo': tonos('#c0b29a', 0.2, 0.45),
    'raiz': tonos('#8a7a64', 0.25, 0.5),
    'ojo': emite('#8ff0ff'),
    'boca': tonos('#3a2a30', 0.2, 0.4),
}


def hongo_andante(accion, i):
    """El hongo que anda: sombrero violeta LISO con UN ribete claro (sin una
    mota), las láminas oscuras debajo, la cara en el pie, brazos y piernas de
    raíz. Al atacar levanta los brazos y golpea el suelo (de ahí salen brotes)."""
    bob, paso, aplasta, abre = 0.0, 0.0, 0.0, 0.0
    f = (i - 1) / 4.0 * math.pi * 2
    if accion == 'camina':
        paso = math.sin(f)
        bob = 1.0 if i in (2, 4) else 0.0
    elif accion == 'quieto':
        bob = 0.8 if i == 2 else 0.0
    else:
        aplasta = (-1.0, 2.0, 0.6)[i - 1]
        abre = (0.6, 1.6, 0.8)[i - 1]
    pr = []
    for sg in (1, -1):
        av = paso * 4.5 * sg if accion == 'camina' else 0.0
        alza = max(0.0, math.cos(f + (0 if sg > 0 else math.pi))) * 2.4 if accion == 'camina' else 0.0
        pr.append(cono((0, 9 + bob, 4.6 * sg), (av, 3.0 + alza, 5.6 * sg), 3.6, 3.0, 'raiz'))
        pr.append(elip((av + 1.4, 1.6 + alza, 5.8 * sg), (4.2, 1.6, 3.2), 'raiz'))
    pr.append(cono((0, 8 + bob, 0), (0, 30 + bob - aplasta, 0), 8.6, 7.2, 'tallo'))
    pr.append(elip((0, 25 + bob - aplasta, 0), (9.8, 1.3, 9.8), 'anillo'))
    cy = 36 + bob - aplasta * 1.6
    sombrero = elip((0, cy, 0), (17.5, 9.0 - aplasta, 17.5), 'sombrero')
    pr.append(sombrero)
    pr.append(elip((0, cy - 3.6 + aplasta * 0.3, 0), (16.0, 2.4, 16.0), 'laminas'))
    for sg in (1, -1):
        pr.append(elip((7.8, 19.5 + bob - aplasta * 0.6, 2.6 * sg), (0.8, 1.5, 1.0), 'ojo'))
    pr.append(elip((8.0, 14.5 + bob - aplasta * 0.5, 0), (0.7, 0.8 + abre, 2.4), 'boca'))
    for sg in (1, -1):
        hombro = (1.5, 22 + bob - aplasta, 7.4 * sg)
        if accion == 'ataque':
            mano = {1: (4, 38, 14), 2: (10, 5, 13), 3: (8, 12, 13)}[i]
        elif accion == 'camina':
            mano = (4 - paso * 5 * sg, 11 + bob, 12.5)
        else:
            mano = (4.5, 11 + bob, 12.5)
        mano = (mano[0], mano[1], mano[2] * sg)
        codo = ((hombro[0] + mano[0]) / 2 + 1.0, (hombro[1] + mano[1]) / 2 + 1.0, 11.0 * sg)
        pr.append(cono(hombro, codo, 2.0, 1.7, 'raiz'))
        pr.append(cono(codo, mano, 1.7, 1.2, 'raiz'))
        pr.append(elip(mano, (2.2, 2.0, 2.0), 'raiz'))

    def retoque(p, Pm, nm, nw):
        if p is sombrero and abs(nw[1]) < 0.32:
            return 'borde'                                      # UN ribete claro alrededor del ala
        return None
    return pr, retoque


POLILLA_MAT = {
    'pelo': tonos('#e6dcc4', 0.2, 0.45),
    'ala': tonos('#7a86d6', 0.3, 0.5),
    'ala_borde': tonos('#c6ccfa', 0.15, 0.4),
    'antena': tonos('#6a5a46', 0.25, 0.45),
    'luz': emite('#bff2ff'),
    'ojo': tonos('#2a2a3e', 0.3, 0.4),
}


def polilla_luz(accion, i):
    """La polilla de luz: cuerpo peludo claro, el abdomen con tres anillos que
    brillan, antenas de pluma (una hoja lisa cada una) y cuatro alas que
    BATEN, lisas con UNA banda clara en el borde (ni ocelos ni motas)."""
    if accion == 'camina':
        batir = (0.9, 0.25, -0.5, 0.25)[i - 1]
        y0 = (1.6, 0.0, -1.2, 0.0)[i - 1]
    elif accion == 'quieto':
        batir = (0.55, 0.15)[i - 1]
        y0 = (0.8, 0.0)[i - 1]
    else:
        batir = (1.1, -0.3, -0.8)[i - 1]
        y0 = (2.4, -1.6, -3.0)[i - 1]
    alto = 24 + y0
    abdomen = elip((-7.6, alto - 1.6, 0), (6.4, 3.8, 3.8), 'pelo')
    pr = [elip((0, alto, 0), (4.6, 4.8, 4.4), 'pelo'), abdomen, elip((5.6, alto + 0.6, 0), (3.0, 3.0, 3.2), 'pelo')]
    alas = []
    for sg in (1, -1):
        pr.append(elip((7.2, alto + 1.2, 2.0 * sg), (1.3, 1.5, 1.2), 'ojo'))
        a0 = (7.0, alto + 3.2, 1.2 * sg)
        a1 = (8.6, alto + 9.4, 4.6 * sg)
        pr.append(cono(a0, a1, 0.45, 0.3, 'antena'))
        pr.append(elip(medio(a0, a1, 0.6), (0.8, 2.6, 1.2), 'antena'))
        # El ala de delante, larga y en flecha hacia delante; la de detrás, más
        # corta y echada atrás: así se lee polilla y no globo.
        for dx, largo, ancho, k, flecha in ((-0.6, 20.0, 6.2, 1.0, 0.42), (-4.6, 14.0, 5.8, 0.85, -0.55)):
            ang = batir * k
            R = giro_x(-ang * sg) @ giro_y(flecha * sg)
            L = largo * 0.55
            c = np.array([dx, alto + 1.2, 2.6 * sg]) + sg * R[:, 2] * L
            w = elip(tuple(c), (ancho, 0.9, L), 'ala', rot=R)
            alas.append(w)
            pr.append(w)
        for k in (0, 1):
            pr.append(cono((1.0 - k * 2.4, alto - 3.0, 1.8 * sg), (1.6 - k * 2.4, alto - 8.0, 2.6 * sg), 0.5, 0.3, 'antena'))

    def retoque(p, Pm, nm, nw):
        if any(p is w for w in alas):
            q = _local(p, Pm[None, :])[0] / p['r']
            return 'ala_borde' if math.hypot(q[0], q[2]) > 0.66 else None     # UNA banda en el borde
        if p is abdomen and (Pm[0] + 12.6) % 4.2 < 1.8 and Pm[0] < -4.0:
            return 'luz'                                        # tres anillos que brillan
        return None
    return pr, retoque


BESTIAS = {
    # tipo: (modelo, materiales, ancho, alto, contorno, tamaño, ángulo del perfil o None)
    'cangrejo_coloso': (cangrejo_coloso, CANGREJO_MAT, 100, 72, contorno_de(hex_rgb('#8a3226')), 1.15, 0.75),
    'sapo_toxico': (sapo_toxico, SAPO_MAT, 80, 60, contorno_de(hex_rgb('#3a5a20')), 1.55, None),
    'golem_ruinas': (centinela, CENTINELA_MAT, 104, 120, contorno_de(hex_rgb('#8a7454')), 1.0, 0.55),
    'escarabajo_sol': (escarabajo_sol, ESCARABAJO_SOL_MAT, 76, 60, contorno_de(hex_rgb('#123c40')), 1.5, 0.35),
    'oso_otono': (oso_otono, OSO_OTONO_MAT, 96, 92, contorno_de(hex_rgb('#4a2c1c')), 1.05, None),
    'pantera_selva': (pantera, PANTERA_MAT, 92, 60, (12, 12, 18), 1.15, None),
    'salamandra_magma': (salamandra_magma, SALAMANDRA_MAGMA_MAT, 88, 44, (20, 14, 14), 1.4, None),
    'golem_magma': GOLEM_MAGMA,
    'hongo_andante': (hongo_andante, HONGO_MAT, 84, 84, contorno_de(hex_rgb('#5a3a6a')), 1.25, None),
    'polilla_luz': (polilla_luz, POLILLA_MAT, 104, 92, contorno_de(hex_rgb('#3a3a6a')), 1.5, 0.85),
}


# ===========================================================================
# LOS JEFES: uno por mapa, más grandes y con piezas suyas
# ===========================================================================

# KRAKENCLAW, EL TIRANO DE LA MAREA (el puerto): el cangrejo coloso, más
# oscuro, con UNA pinza enorme y una corona de cinco púas de coral.
CANGREJO_REY_MAT = dict(CANGREJO_MAT)
CANGREJO_REY_MAT.update({
    'concha': {'tonos': rampa(hex_rgb('#a8402e'), 5, arriba=0.36, abajo=0.58), 'brillo': True},
    'coral': tonos('#f2a0b0', 0.28, 0.5),
    'ojo': emite('#7dffe0'),
})


def cangrejo_rey(accion, i):
    """Tres ramas de coral gruesas (cada una con UN brote), no una fila de
    púas: cinco púas finas en fila se leían como dientes."""
    pr, ret = cangrejo_coloso(accion, i, jefe=True)
    c = pr[0]['c']
    for dx, dz, alto, lado in ((-4.0, -6.0, 8.0, -1), (-2.0, 0.0, 11.0, 1), (-4.0, 6.0, 8.0, 1)):
        base = (c[0] + dx, c[1] + 5.0, c[2] + dz)
        punta = (base[0] - 1.2, base[1] + alto, base[2] + dz * 0.35)
        pr.append(cono(base, punta, 2.0, 1.0, 'coral'))
        m = medio(base, punta, 0.55)
        pr.append(cono(m, (m[0] + 2.6, m[1] + 3.2, m[2] + lado * 1.8), 1.0, 0.55, 'coral'))
    return pr, ret


# GROGMAW, EL SOBERANO DEL CIÉNAGO (el pantano): el sapo tóxico con una
# corona de juncos y el saco de la garganta que BRILLA.
SAPO_REY_MAT = dict(SAPO_MAT)
SAPO_REY_MAT.update({
    'piel': {'tonos': rampa(hex_rgb('#4a7a2e'), 5, arriba=0.36, abajo=0.58), 'brillo': True},
    'saco': emite('#c8ff5a'),
    'saco2': emite('#f2ffc0'),
    'nenufar': {'tonos': rampa(hex_rgb('#5aa84a'), 5, arriba=0.32, abajo=0.5), 'brillo': True},
    'flor': tonos('#f2a8c8', 0.25, 0.48),
})


def sapo_rey(accion, i):
    """Por corona, UNA hoja de nenúfar ladeada con UN capullo (los juncos en
    fila se leían como un peine)."""
    pr, ret = sapo_toxico(accion, i)
    cab = pr[1]['c']
    pr.append(elip((cab[0] - 1.0, cab[1] + 5.0, cab[2]), (6.8, 0.8, 6.8), 'nenufar', rot=giro_z(0.22)))
    pr.append(cono((cab[0] - 1.8, cab[1] + 5.6, cab[2] + 1.8), (cab[0] - 2.1, cab[1] + 8.8, cab[2] + 1.9),
                   1.6, 0.7, 'flor'))
    brilla = nucleo_que_brilla('saco', 'saco2', 0.6)

    def retoque(p, Pm, nm, nw):
        if p['mat'] == 'saco':
            return brilla(p, nw)
        return ret(p, Pm, nm, nw)
    return pr, retoque


# SOLARION, EL COLOSO DEL SOL (las ruinas): el centinela con el halo de sol
# detrás de la cabeza (un disco con UN aro de luz) y bronce en lugar de piedra
# en hombros y codos.
COLOSO_MAT = dict(CENTINELA_MAT)
COLOSO_MAT.update({
    'piedra': tonos('#d8c29a', 0.3, 0.58),
    'bronce': {'tonos': rampa(hex_rgb('#d0943a'), 5, arriba=0.4, abajo=0.55), 'brillo': True},
})


def coloso_rey(accion, i):
    return centinela(accion, i, jefe=True)


# EMBERHORN, EL CIERVO DE OTOÑO (las colinas): alto y esbelto, la gorguera
# del cuello color de fuego y una cornamenta de cuatro puntas por lado. Ataca
# alzándose de manos y embistiendo con la cornamenta baja.
CIERVO_REY_MAT = {
    'pelo': tonos('#8a4a26', 0.32, 0.56),
    'oscuro': tonos('#4a2614', 0.22, 0.48),
    'claro': tonos('#ead2a8', 0.15, 0.42),
    'melena': tonos('#d8742a', 0.3, 0.52),
    'asta': tonos('#e2c08a', 0.28, 0.55),
    'pezuna': tonos('#2a1a12', 0.2, 0.4),
    'nariz': tonos('#1a1210', 0.2, 0.3),
    'ojo': emite('#ffcf5a'),
}


def ciervo_rey(accion, i):
    f, anda = fase(accion, i)
    y0, th, baja, avanza = 0.0, 0.0, 0.0, 0.0
    if accion == 'camina':
        y0 = 0.6 if i in (2, 4) else 0.0
    elif accion == 'quieto':
        y0 = 0.4 if i == 2 else 0.0
    else:
        th = (0.45, 0.0, 0.0)[i - 1]
        baja = (0.0, 1.0, 0.8)[i - 1]
        avanza = (0.0, 3.0, 7.0)[i - 1]
    piv = (-9.0, 21.0)
    A = (lambda p: alzar(p, piv, th)) if th else (lambda p: p)
    R = giro_z(th) if th else None
    cuerpo = elip(A((avanza * 0.5, 23 + y0, 0)), (13, 6.8, 6.4), 'pelo', rot=R)
    pecho = elip(A((8 + avanza * 0.7, 24 + y0, 0)), (6.8, 7.8, 6.6), 'pelo', rot=R)
    grupa = elip((-10 + avanza * 0.3, 24 + y0, 0), (6.6, 7.0, 6.2), 'pelo')
    pr = [cuerpo, pecho, grupa]
    cuello0 = A((10 + avanza * 0.8, 27 + y0, 0))
    if baja:
        hc = A((22 + avanza, 24 + y0 - baja * 3, 0))
        pitch = -1.0 * baja
    else:
        hc = A((17 + avanza, 37 + y0, 0))
        pitch = th * 0.3
    cp, sp = math.cos(pitch), math.sin(pitch)

    def H(p):
        return (hc[0] + p[0] * cp - p[1] * sp, hc[1] + p[0] * sp + p[1] * cp, p[2])
    pr.append(cono(cuello0, hc, 3.8, 2.6, 'pelo'))
    pr.append(elip(A((11 + avanza * 0.8, 29.5 + y0, 0)), (5.2, 6.4, 6.0), 'melena'))     # la gorguera
    pr.append(elip(hc, (3.8, 3.2, 3.0), 'pelo'))
    pr.append(cono(H((2.0, -0.8, 0)), H((6.2, -2.4, 0)), 2.2, 1.6, 'pelo'))
    pr.append(elip(H((6.4, -2.2, 0)), (1.0, 1.0, 1.2), 'nariz'))
    pr.append(cono(H((2.0, -2.4, 0)), H((5.0, -3.6, 0)), 1.4, 1.0, 'claro'))
    for sg in (1, -1):
        pr.append(elip(H((1.6, 0.8, 2.4 * sg)), (0.7, 0.6, 0.6), 'ojo'))
        pr.append(cono(H((-1.0, 1.6, 2.2 * sg)), H((-2.6, 2.6, 5.6 * sg)), 1.0, 0.4, 'pelo'))
        # La cornamenta: el tronco que sube hacia atrás y tres puntas hacia delante.
        b0, b1 = H((-0.6, 2.6, 1.6 * sg)), H((-2.4, 7.6, 4.8 * sg))
        b2, b3 = H((-4.4, 12.6, 7.0 * sg)), H((-5.0, 17.0, 7.6 * sg))
        pr += [cono(b0, b1, 1.1, 0.9, 'asta'), cono(b1, b2, 0.9, 0.75, 'asta'), cono(b2, b3, 0.75, 0.45, 'asta')]
        pr.append(cono(H((-0.9, 3.8, 2.4 * sg)), H((3.6, 6.4, 3.6 * sg)), 0.8, 0.3, 'asta'))
        pr.append(cono(b1, H((0.6, 11.6, 5.4 * sg)), 0.75, 0.3, 'asta'))
        pr.append(cono(b2, H((-1.4, 16.4, 8.6 * sg)), 0.7, 0.3, 'asta'))
    if accion == 'ataque' and i == 1:
        # Alzado de manos: las patas de delante dobladas en el aire.
        for sg in (1, -1):
            hombro = A((8, 20, 3.6 * sg))
            rod = A((14, 15, 3.6 * sg))
            casco = A((12, 9, 3.8 * sg))
            pr += [cono(hombro, rod, 1.7, 1.4, 'pelo'), cono(rod, casco, 1.4, 1.2, 'pelo'),
                   elip(casco, (1.4, 1.1, 1.2), 'pezuna')]
            fa = (0, 1)[sg > 0]
            pr += [cono((-10, 20 + y0, 3.6 * sg), (-11 + fa, 1.0, 3.8 * sg), 1.8, 1.2, 'pelo'),
                   elip((-10.4 + fa, 0.8, 3.8 * sg), (1.5, 0.9, 1.2), 'pezuna')]
    else:
        patas4(pr, f, anda, 8.0 + avanza * 0.8, -10.0, 19.0, 3.6, 1.6, 'pelo', 'pezuna', y0=y0, paso=4.0)
    pr.append(elip((-15.6 + avanza * 0.3, 26.5 + y0, 0), (1.6, 2.2, 1.4), 'claro'))   # la cola, blanca

    def retoque(p, Pm, nm, nw):
        if p['mat'] == 'pelo' and Pm[1] < 12.0:
            return 'oscuro'                                     # las patas, oscuras
        if (p is cuerpo or p is grupa) and nm[1] < -0.55:
            return 'claro'                                      # la tripa clara
        return None
    return pr, retoque


# IRONPALM, EL REY DE LA COPA (la selva): un gorila enorme que anda sobre los
# nudillos, con la silla de plata del lomo (UNA banda) y una corona de
# enredadera con dos hojas. Ataca golpeándose el pecho y aplastando el suelo.
GORILA_MAT = {
    'pelo': tonos('#3a3634', 0.34, 0.55),
    'plata': tonos('#aeb0b6', 0.25, 0.5),
    'piel': tonos('#8a766c', 0.22, 0.46),
    'oscuro': tonos('#1e1c1c', 0.2, 0.45),
    'enredadera': tonos('#4f8a3a', 0.3, 0.52),
    'hoja': tonos('#78b850', 0.28, 0.5),
    'ojo': emite('#ffcf5a'),
    'boca': tonos('#4a1e20', 0.2, 0.4),
}


def gorila_rey(accion, i):
    f = (i - 1) / 4.0 * math.pi * 2
    bob, th = 0.0, 0.30
    if accion == 'camina':
        bob = 1.0 if i in (2, 4) else 0.0
    elif accion == 'quieto':
        bob = 0.7 if i == 2 else 0.0
    else:
        th = (0.95, 1.0, 0.25)[i - 1]
    piv = (-8.0, 20.0)

    def A(p):
        return alzar(p, piv, th)
    R = giro_z(th)
    torso = elip(A((4, 28 + bob, 0)), (15, 12, 14), 'pelo', rot=R)
    caderas = elip((-8, 21 + bob, 0), (8.5, 8.5, 11), 'pelo')
    pr = [torso, caderas]
    pr.append(elip(A((18, 32 + bob, 0)), (6.2, 6.0, 6.2), 'pelo'))
    pr.append(elip(A((15.5, 36.5 + bob, 0)), (4.2, 4.0, 3.6), 'pelo'))                 # la cresta
    pr.append(elip(A((21.5, 31 + bob, 0)), (3.4, 4.2, 4.6), 'piel'))                  # la cara
    pr.append(elip(A((22.4, 34.2 + bob, 0)), (2.4, 1.2, 5.0), 'oscuro'))              # la frente
    for sg in (1, -1):
        pr.append(elip(A((23.6, 32.8 + bob, 2.0 * sg)), (0.8, 0.8, 0.9), 'ojo'))
    abre = 1.8 if (accion == 'ataque' and i in (2, 3)) else 0.0
    pr.append(elip(A((24.4, 28.4 + bob - abre * 0.3, 0)), (0.9, 0.6 + abre * 0.5, 2.4), 'boca'))
    # La corona: una vuelta de enredadera y TRES hojas anchas de pie (las cinco
    # púas finas se leían como un racimo).
    pr.append(elip(A((16.4, 39.4 + bob, 0)), (3.8, 1.1, 4.8), 'enredadera'))
    for dz, ladeo, alto in ((-3.4, -0.5, 3.0), (0.0, 0.0, 4.2), (3.4, 0.5, 3.0)):
        pr.append(elip(A((16.2, 40.2 + bob + alto * 0.5, dz)), (1.0, alto, 2.0), 'hoja', rot=giro_x(ladeo)))
    # Brazos largos: andan sobre los nudillos, se golpean el pecho o aplastan.
    for sg in (1, -1):
        hombro = A((12, 30 + bob, 13 * sg))
        if accion == 'ataque' and i in (1, 2):
            sube = (i == 1) == (sg > 0)
            mano = A((23 if sube else 20, 33 if sube else 25, 4.0 * sg))
            codo = A((16, 22, 16 * sg))
        elif accion == 'ataque':
            mano = (31, 3.2, 10 * sg)
            codo = (24, 14, 16 * sg)
        else:
            fa = f + (0 if sg > 0 else math.pi)
            sw = math.sin(fa) * 4.6 if accion == 'camina' else 0.0
            lift = max(0.0, math.cos(fa)) * 2.4 if accion == 'camina' else 0.0
            mano = (17 + sw, 3.2 + lift, 16 * sg)
            codo = (16 + sw * 0.5, 17, 18 * sg)
        pr.append(cono(hombro, codo, 5.0, 4.4, 'pelo'))
        pr.append(cono(codo, mano, 4.4, 4.0, 'pelo'))
        pr.append(elip(mano, (4.2, 3.6, 4.0), 'piel'))
    for sg in (1, -1):
        fa = f + (0 if sg < 0 else math.pi)
        sw = math.sin(fa) * 3.4 if accion == 'camina' else 0.0
        lift = max(0.0, math.cos(fa)) * 2.0 if accion == 'camina' else 0.0
        pie = (-6 + sw, 2.2 + lift, 9.4 * sg)
        pr.append(cono((-8, 16 + bob, 8.5 * sg), pie, 4.6, 3.6, 'pelo'))
        pr.append(elip((pie[0] + 2.0, pie[1], pie[2]), (4.4, 2.2, 3.2), 'piel'))

    def retoque(p, Pm, nm, nw):
        if p is torso or p is caderas:
            q = _local(p, Pm[None, :])[0] / p['r']
            # La silla de plata: UNA banda en la parte baja del lomo (toda la
            # espalda de plata lo volvía una bola gris vista desde arriba).
            if (p is torso and q[1] > 0.6 and -0.75 < q[0] < -0.2) or (p is caderas and q[1] > 0.55 and q[0] > -0.3):
                return 'plata'
        return None
    return pr, retoque


# CINDERMAW, LA SIERPE DE LA CALDERA (el volcán): un dragón de cuatro patas,
# negro de obsidiana con el vientre rojo, cuernos claros, placas en fila por
# el lomo, alas plegadas y la cola acabada en pala. Echa la cabeza atrás y
# suelta el fuego (la boca encendida).
DRAGON_MAT = {
    'escama': {'tonos': rampa(hex_rgb('#3e3038'), 5, arriba=0.44, abajo=0.55), 'brillo': True},
    'placa': tonos('#7a4a46', 0.32, 0.52),
    'vientre': tonos('#c8582a', 0.3, 0.5),
    'cuerno': tonos('#dccab0', 0.2, 0.48),
    'ala': tonos('#9a3a30', 0.3, 0.5),
    'hueso': tonos('#2a2024', 0.25, 0.45),
    'ojo': emite('#ffe066'),
    'boca': emite('#ff6a1a'),
    'diente': tonos('#efe8d6', 0.1, 0.3),
}


def dragon_rey(accion, i):
    f, anda = fase(accion, i)
    y0, cab_th, abre, avanza, alas_up = 0.0, 0.0, 0.0, 0.0, 0.0
    vuela, aleteo = accion == 'vuela', 0.0
    if accion == 'camina':
        y0 = 0.7 if i in (2, 4) else 0.0
    elif accion == 'quieto':
        y0 = 0.5 if i == 2 else 0.0
        abre = 0.0 if i == 1 else 0.6
    elif vuela:
        # (2026-11-23) "El dragón del volcán debería volar." Bate las alas
        # EXTENDIDAS (arriba, a medias, abajo, a medias), con las patas recogidas
        # bajo el vientre y la cola tendida que se mece; el cuerpo sube un poco
        # en cada bajada del ala. El juego lo pinta en el aire (gf-salvaje, `vuela`).
        aleteo = (1.0, 0.3, -0.75, 0.3)[i - 1]
        y0 = (0.0, 0.8, 1.6, 0.8)[i - 1]
        cab_th = 0.1
        f = (i - 1) / 4.0 * math.pi * 2
    else:
        cab_th = (0.5, -0.15, -0.35)[i - 1]
        abre = (0.8, 3.2, 1.6)[i - 1]
        avanza = (-1.5, 1.5, 5.0)[i - 1]
        alas_up = (1.0, 0.6, 0.2)[i - 1]
    cuerpo = elip((avanza * 0.4, 22 + y0, 0), (16, 8.5, 9), 'escama')
    pecho = elip((10 + avanza * 0.7, 24 + y0, 0), (8, 9, 8.6), 'escama')
    caderas = elip((-12 + avanza * 0.2, 22 + y0, 0), (8, 8, 8.4), 'escama')
    pr = [cuerpo, pecho, caderas]
    c0 = (14 + avanza * 0.8, 28 + y0, 0)
    c1 = (19 + avanza, 35 + y0, 0)
    hc = alzar((24 + avanza, 41 + y0, 0), (c1[0], c1[1]), cab_th)
    cuello = [cono(c0, c1, 5.0, 4.0, 'escama'), cono(c1, hc, 4.0, 3.6, 'escama')]
    pr += cuello

    def Hd(p):
        return alzar((hc[0] + p[0], hc[1] + p[1], p[2]), (hc[0], hc[1]), cab_th * 0.6)
    pr.append(elip(hc, (6.2, 4.6, 5.0), 'escama'))
    pr.append(cono(Hd((3, 0.4, 0)), Hd((10.4, -0.6, 0)), 3.4, 2.3, 'escama'))
    pr.append(cono(Hd((2.4, -2.6, 0)), Hd((9.8, -3.4 - abre, 0)), 2.5, 1.6, 'escama'))
    if abre > 1.0:
        pr.append(cono(Hd((3.2, -1.6, 0)), Hd((8.8, -1.8 - abre * 0.5, 0)), 1.6, 1.0, 'boca'))
        for sg in (1, -1):
            pr.append(cono(Hd((8.8, -0.9, 1.2 * sg)), Hd((8.8, -2.2, 1.2 * sg)), 0.55, 0.15, 'diente'))
    for sg in (1, -1):
        pr.append(elip(Hd((2.6, 1.8, 2.6 * sg)), (1.0, 0.7, 0.8), 'ojo'))
        h0, h1, h2 = Hd((-1.0, 2.6, 2.4 * sg)), Hd((-5.4, 5.6, 3.6 * sg)), Hd((-9.0, 5.0, 4.2 * sg))
        pr += [cono(h0, h1, 1.5, 1.0, 'cuerno'), cono(h1, h2, 1.0, 0.3, 'cuerno')]
    # La cresta del lomo: UNA aleta continua (2026-11-21). Eran cinco placas en
    # fila y, vistas de espaldas, quedaban como una columna de bultos sueltos.
    pr.append(elip((-2.0 + avanza * 0.4, 29.2 + y0, 0), (11.0, 2.4, 0.9), 'placa'))
    # Las alas: el hueso del borde (hombro, codo, punta) y la membrana que
    # cuelga de él, plegada sobre el costado; al echar el fuego se abren hacia
    # arriba y la membrana cae hacia el cuerpo. (Una elipse pequeña bajo el
    # hueso se leía como una silla de montar.)
    for sg in (1, -1):
        if vuela:
            # El ala abierta: el hueso del hombro a la punta, hacia fuera, y la
            # membrana colgando hacia atrás de cada tramo (el borde de salida).
            hombro = (8.0, 29 + y0, 6.0 * sg)
            codo = (3.0, 33 + y0 + aleteo * 7.0, (17.0 - abs(aleteo) * 2.0) * sg)
            punta = (-6.0, 31 + y0 + aleteo * 16.0, (31.0 - abs(aleteo) * 6.0) * sg)
            pr += [cono(hombro, codo, 1.5, 1.2, 'hueso'), cono(codo, punta, 1.2, 0.85, 'hueso')]
            for a0, a1 in ((hombro, codo), (codo, punta)):
                eje = np.subtract(a1, a0)
                R = marco(eje, (-1.0, -0.15, 0.0))
                c = np.add(medio(a0, a1), R[:, 1] * 5.0)
                pr.append(elip(tuple(c), (float(np.linalg.norm(eje)) * 0.56, 6.2, 1.2), 'ala', rot=R))
            continue
        hombro = (8 + avanza * 0.6, 29 + y0, 6.0 * sg)
        codo = (1, 36 + y0 + alas_up * 9, (9.5 + alas_up * 6) * sg)
        punta = (-15, 32 + y0 + alas_up * 16, (9.0 + alas_up * 10) * sg)
        # (2026-11-21) La punta del hueso y la membrana, algo más gruesas: de
        # canto (de frente o de espaldas) quedaban motas rojas y negras sueltas.
        pr += [cono(hombro, codo, 1.5, 1.2, 'hueso'), cono(codo, punta, 1.2, 0.85, 'hueso')]
        eje = np.subtract(punta, hombro)
        cae = (1 - alas_up) * np.array([-0.35, -1.0, 0.25 * sg]) + alas_up * np.array([-0.2, -0.6, -0.8 * sg])
        R = marco(eje, cae)
        c = np.add(medio(hombro, punta), R[:, 1] * 4.2)
        pr.append(elip(tuple(c), (float(np.linalg.norm(eje)) * 0.52, 5.6, 1.5), 'ala', rot=R))
    # Patas fuertes, con muslos atrás.
    for delante, x0 in ((True, 10.0), (False, -12.0)):
        for sg in (1, -1):
            if vuela:
                # Recogidas bajo el vientre, con los pies hacia atrás.
                if not delante:
                    pr.append(elip((x0, 19 + y0, 6.8 * sg), (5.4, 6.2, 3.4), 'escama'))
                rod = (x0 - 2.0, 13.0 + y0, 6.8 * sg)
                pie = (x0 - 7.5, 12.5 + y0, 6.6 * sg)
                pr += [cono((x0, 17 + y0, 6.6 * sg), rod, 3.0, 2.6, 'escama'), cono(rod, pie, 2.6, 2.2, 'escama'),
                       elip((pie[0] - 1.0, pie[1], pie[2]), (3.0, 1.5, 2.4), 'hueso')]
                continue
            ff = f + (0 if (sg > 0) == delante else math.pi)
            sw = math.sin(ff) * 3.6 if anda else 0.0
            alza = max(0.0, math.cos(ff)) * 2.0 if anda else 0.0
            xb = x0 + avanza * (0.7 if delante else 0.2)
            if not delante:
                pr.append(elip((xb, 19 + y0, 6.8 * sg), (5.4, 6.2, 3.4), 'escama'))
            rod = (xb + sw * 0.5 + (0.0 if delante else -2.2), 9.0 + alza * 0.6, 7.0 * sg)
            pie = (xb + sw, 1.4 + alza, 7.4 * sg)
            pr += [cono((xb, 17 + y0, 6.6 * sg), rod, 3.0, 2.6, 'escama'), cono(rod, pie, 2.6, 2.2, 'escama'),
                   elip((pie[0] + 1.4, pie[1], pie[2]), (3.2, 1.6, 2.6), 'hueso')]
    # La cola larga que se mece y su pala.
    xs, ys, rs = [-19.0, -27.0, -35.0, -41.0], [22.0, 18.0, 14.0, 12.0], [4.2, 3.0, 2.0, 1.0]
    if vuela:
        ys = [22.0, 20.0, 18.5, 18.0]                   # tendida detrás, no arrastrando
    zc = [math.sin(f + k * 0.9) * ((1.6 + k) if anda else (0.8 + k * 0.6)) if (anda or vuela) else k * 0.4 for k in range(4)]
    for k in range(3):
        pr.append(cono((xs[k] + avanza * 0.2, ys[k] + y0, zc[k]), (xs[k + 1] + avanza * 0.2, ys[k + 1] + y0, zc[k + 1]),
                       rs[k], rs[k + 1], 'escama'))
    pr.append(elip((-43.6 + avanza * 0.2, 12.2 + y0, zc[3]), (3.0, 2.6, 0.8), 'placa'))
    barriga = [cuerpo, pecho, caderas] + cuello

    def retoque(p, Pm, nm, nw):
        if any(p is q for q in barriga) and nm[1] < -0.35:
            return 'vientre'
        return None
    return pr, retoque


# LA REINA DEL MICELIO (la hondonada): una seta enorme con el sombrero
# violeta LISO y UN ribete que brilla, las láminas que BRILLAN debajo, un
# velo en campana hasta el suelo, la cara en el pie y dos brazos de raíz.
MICELIO_MAT = {
    'sombrero': {'tonos': rampa(hex_rgb('#6a3a9a'), 5, arriba=0.38, abajo=0.55), 'brillo': True},
    'borde': emite('#9ff0ff'),
    'laminas': emite('#7ff0e0'),
    'tallo': tonos('#e6dccb', 0.15, 0.42),
    'velo': tonos('#d6caf0', 0.18, 0.45),
    'raiz': tonos('#7a6a5a', 0.25, 0.5),
    'ojo': emite('#bff8ff'),
    'boca': tonos('#3a2a40', 0.2, 0.4),
}


def micelio_reina(accion, i):
    bob, paso, aplasta, abre = 0.0, 0.0, 0.0, 0.0
    f = (i - 1) / 4.0 * math.pi * 2
    if accion == 'camina':
        paso = math.sin(f)
        bob = 1.0 if i in (2, 4) else 0.0
    elif accion == 'quieto':
        bob = 0.8 if i == 2 else 0.0
    else:
        aplasta = (-1.2, -0.6, 1.6)[i - 1]
        abre = (0.8, 2.0, 1.0)[i - 1]
    # El velo, en CAMPANA (ancho abajo, estrecho arriba): una bola se leía
    # como un huevo bajo la seta.
    falda = cono((paso * 0.8, 6 + bob * 0.3, 0), (paso * 0.3, 21 + bob * 0.5, 0), 15.0, 9.6, 'velo')
    pr = [falda, cono((0, 18 + bob, 0), (0, 44 + bob - aplasta, 0), 9.0, 7.4, 'tallo')]
    cy = 53 + bob - aplasta * 1.5
    sombrero = elip((0, cy, 0), (24, 12 - aplasta * 0.6, 24), 'sombrero')
    pr += [sombrero, elip((0, cy - 4.6, 0), (22.5, 3.0, 22.5), 'laminas')]
    for sg in (1, -1):
        pr.append(elip((8.2, 36 + bob - aplasta * 0.6, 2.8 * sg), (0.9, 1.7, 1.1), 'ojo'))
    pr.append(elip((8.4, 30.5 + bob - aplasta * 0.5, 0), (0.8, 0.9 + abre, 2.6), 'boca'))
    for sg in (1, -1):
        hombro = (1.5, 38 + bob - aplasta, 8.0 * sg)
        if accion == 'ataque':
            mano = {1: (6, 62, 18), 2: (12, 56, 20), 3: (18, 3, 15)}[i]
        elif accion == 'camina':
            mano = (6 - paso * 6 * sg, 16 + bob, 19)
        else:
            mano = (7, 16 + bob, 19)
        mano = (mano[0], mano[1], mano[2] * sg)
        codo = ((hombro[0] + mano[0]) / 2 + 2.0, (hombro[1] + mano[1]) / 2 + 3.0, 16.5 * sg)
        pr += [cono(hombro, codo, 2.6, 2.2, 'raiz'), cono(codo, mano, 2.2, 1.4, 'raiz'),
               elip(mano, (2.8, 2.4, 2.6), 'raiz'),
               cono(mano, (mano[0] + 3.2, mano[1] - 2.6, mano[2]), 1.2, 0.4, 'raiz')]

    def retoque(p, Pm, nm, nw):
        if p is sombrero and abs(nw[1]) < 0.3:
            return 'borde'                                      # UN ribete claro
        return None
    return pr, retoque


# (2026-11-23) Las acciones que un modelo tiene además de camina/ataque/quieto
# (tools/generar-reinos-criaturas.py las fotografía en sus tres vistas).
dragon_rey.ACCIONES_EXTRA = (('vuela', 4),)

JEFES = {
    # nombre: (modelo, materiales, ancho, alto, contorno, tamaño, ángulo del perfil o None)
    'jefe_cangrejo': (cangrejo_rey, CANGREJO_REY_MAT, 150, 112, contorno_de(hex_rgb('#7a2a1e')), 1.55, 0.75),
    'jefe_sapo': (sapo_rey, SAPO_REY_MAT, 132, 104, contorno_de(hex_rgb('#2f4a1a')), 2.3, None),
    'jefe_coloso': (coloso_rey, COLOSO_MAT, 156, 184, contorno_de(hex_rgb('#8a7454')), 1.45, 0.55),
    'jefe_ciervo': (ciervo_rey, CIERVO_REY_MAT, 124, 132, contorno_de(hex_rgb('#4a2614')), 1.5, None),
    'jefe_gorila': (gorila_rey, GORILA_MAT, 132, 132, (14, 12, 12), 1.5, None),
    'jefe_dragon': (dragon_rey, DRAGON_MAT, 156, 124, (16, 12, 14), 1.45, None),   # (+ 'vuela': ACCIONES_EXTRA)
    'jefe_micelio': (micelio_reina, MICELIO_MAT, 140, 160, contorno_de(hex_rgb('#3a2a5a')), 1.4, None),
}
