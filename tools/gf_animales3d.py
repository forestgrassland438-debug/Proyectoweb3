# -*- coding: utf-8 -*-
"""
=============================================================================
LOS ANIMALES EN 2.5D                                             (2026-10-12)
=============================================================================

"Los animales también en 2.5D, con gráficos detallados y profesionales." El
usuario eligió remodelarlos en 3D (los personajes conservan su dibujo).

Cada especie es un modelo 3D pequeño (gf_bestias3d: elipsoides y conos
redondeados) fotografiado de perfil con la cámara del juego, en TODAS sus
poses y con el MISMO tamaño de cuadro que el PNG de siempre: gf-animales.js
mide las texturas en fracciones del cuadro, así que nada más cambia.

  · Luz arriba a la izquierda en bandas lisas; se ve un poco el lomo (la
    cámara mira algo desde arriba): ahí está el volumen.
  · Manchas grandes (la vaca), bandas (la coral) y una línea en zigzag (la
    víbora): nada de motas, puntos ni racimos.
  · Los pies, abajo del todo del cuadro (el juego los pone con origen abajo).

USO: tools/generar-animales3d.py.
=============================================================================
"""

import math

from gf_bestias3d import elip, cono, fotografiar
from gf_arte import rampa, hex_rgb, contorno_de


def tonos(hexa, arriba=0.3, abajo=0.55):
    return rampa(hex_rgb(hexa), 5, arriba=arriba, abajo=abajo)


def pata(pr, cadera, pie, r0, r1, mat, mat_pie=None, pie_r=None):
    """Una pata recta de la cadera al pie, con su pezuña o zarpa."""
    pr.append(cono(cadera, pie, r0, r1, mat))
    if mat_pie:
        rr = pie_r or (r1 * 1.15, r1 * 0.6, r1 * 1.05)
        pr.append(elip((pie[0] + rr[0] * 0.25, pie[1], pie[2]), rr, mat_pie))


def paso(accion, i, n=4):
    """Fase de la pata delantera derecha; las demás se desfasan."""
    if accion in ('camina', 'corre'):
        return (i - 1) / float(n) * math.pi * 2, True
    return 0.0, False


# ===========================================================================
# LA VACA
# ===========================================================================
VACA_MAT = {
    'blanco': {'tonos': tonos('#ece6da', 0.15, 0.42)},
    'mancha': {'tonos': tonos('#2e2a30', 0.2, 0.45)},
    'hocico': {'tonos': tonos('#e8a3a6', 0.2, 0.45)},
    'cuerno': {'tonos': tonos('#e6dcb8', 0.2, 0.4)},
    'pezuna': {'tonos': tonos('#3a3036', 0.2, 0.45)},
    'ojo': {'emite': hex_rgb('#1d1a20')},
}
VACA_MANCHAS = (((-8, 25, 6.5), (6.5, 5.5, 5.0)), ((6, 25, -6.0), (5.5, 4.6, 6.0)),
                ((-2, 18, 8.0), (4.4, 3.4, 3.0)), ((-15, 20, -6.0), (4.0, 5.0, 5.0)),
                ((9, 23, 7.5), (4.0, 4.0, 3.0)), ((-16, 25, 5.0), (3.4, 4.0, 4.0)),
                ((23.5, 29.5, 4.2), (2.6, 2.4, 2.2)))


def vaca(accion, i):
    f, anda = paso(accion, i)
    pr = []
    come = accion == 'come'
    bob = 0.4 if (accion == 'quieto' and i == 2) else 0.0
    # Cuerpo: tronco largo, la grupa y el pecho.
    pr += [elip((-2, 21 + bob, 0), (17, 8.4, 8.4), 'blanco'),
           elip((-12, 22 + bob, 0), (7, 8, 8), 'blanco'),
           elip((9, 20 + bob, 0), (8, 9, 8.2), 'blanco')]
    cuerpo = pr[:3]
    # La ubre.
    pr.append(elip((-6, 13.2 + bob, 0), (3.4, 2.3, 2.8), 'hocico'))
    # Cuello y cabeza (baja a pastar).
    if come:
        hx, hy = 24.0, 9.0 + (0.6 if i == 2 else 0.0)
        pr.append(cono((14, 22 + bob, 0), (21, 12, 0), 5.2, 4.2, 'blanco'))
    else:
        hx, hy = 23.0, 27.0 + bob
        pr.append(cono((14, 23 + bob, 0), (20, 26 + bob, 0), 5.0, 4.0, 'blanco'))
    cabeza = elip((hx, hy, 0), (5.0, 5.4, 4.6), 'blanco')
    pr.append(cabeza)
    pr.append(elip((hx + 4.8, hy - 2.0 - (0.5 if come and i == 2 else 0.0), 0), (3.6, 3.3, 3.8), 'hocico'))
    for sg in (1, -1):
        pr.append(cono((hx - 1.8, hy + 4.4, 3.0 * sg), (hx - 1.4, hy + 7.0, 4.4 * sg), 1.0, 0.4, 'cuerno'))
        pr.append(cono((hx - 2.4, hy + 2.6, 4.0 * sg), (hx - 4.0, hy + 2.0, 7.6 * sg), 1.6, 0.7, 'blanco'))
        pr.append(elip((hx + 2.0, hy + 1.6, 3.9 * sg), (0.7, 0.8, 0.5), 'ojo'))
    # Patas: delanteras y traseras, en diagonal al andar.
    for delante, x0 in ((True, 10.0), (False, -13.0)):
        for sg in (1, -1):
            fase = f + (0 if (sg > 0) == delante else math.pi)
            sw = math.sin(fase) * 3.0 if anda else 0.0
            alza = max(0.0, math.cos(fase)) * 1.6 if anda else 0.0
            z = 5.0 * sg
            pata(pr, (x0, 15 + bob, z), (x0 + sw, 1.6 + alza, z), 2.7, 2.3, 'blanco', 'pezuna', (2.5, 1.3, 2.3))
    # La cola con su borla.
    vaiven = (1.2 if i == 2 else -0.6) if accion == 'quieto' else math.sin(f) * 0.8
    pr.append(cono((-18.5, 24 + bob, 0), (-21 + vaiven * 0.4, 12.5, vaiven), 1.0, 0.8, 'blanco'))
    pr.append(elip((-21.2 + vaiven * 0.4, 11.2, vaiven), (1.4, 2.0, 1.4), 'mancha'))

    def retoque(p, Pm, nm, nw):
        if p is cabeza or any(p is q for q in cuerpo):
            for c, r in VACA_MANCHAS:
                q = [(Pm[k] - c[k]) / r[k] for k in range(3)]
                if q[0] * q[0] + q[1] * q[1] + q[2] * q[2] < 1.0:
                    return 'mancha'
        return None
    return pr, retoque


# ===========================================================================
# EL CERDO
# ===========================================================================
CERDO_MAT = {
    'piel': {'tonos': tonos('#f1a7ad', 0.2, 0.45)},
    'morro': {'tonos': tonos('#e48c96', 0.2, 0.45)},
    'pezuna': {'tonos': tonos('#7a4a52', 0.2, 0.45)},
    'ojo': {'emite': hex_rgb('#2a1a20')},
}


def cerdo(accion, i):
    f, anda = paso(accion, i)
    pr = []
    come = accion == 'come'
    bob = 0.4 if (accion == 'quieto' and i == 2) else 0.0
    pr.append(elip((0, 13 + bob, 0), (14, 7.6, 7.6), 'piel'))
    pr.append(elip((-8, 13.5 + bob, 0), (7, 7, 7.2), 'piel'))
    hx, hy = (15.0, 8.0 + (0.5 if i == 2 else 0)) if come else (14.0, 14.0 + bob)
    pr.append(elip((hx, hy, 0), (5.0, 5.0, 4.8), 'piel'))
    pr.append(cono((hx + 3.0, hy - 1.0, 0), (hx + 6.8, hy - 1.6, 0), 2.7, 2.5, 'piel'))
    pr.append(elip((hx + 7.0, hy - 1.6, 0), (0.8, 2.3, 2.4), 'morro'))
    for sg in (1, -1):
        pr.append(cono((hx - 1.0, hy + 3.6, 3.0 * sg), (hx + 1.6, hy + 5.6, 4.0 * sg), 1.9, 0.5, 'morro'))
        pr.append(elip((hx + 2.4, hy + 1.4, 3.7 * sg), (0.6, 0.7, 0.5), 'ojo'))
    for delante, x0 in ((True, 8.0), (False, -9.0)):
        for sg in (1, -1):
            fase = f + (0 if (sg > 0) == delante else math.pi)
            sw = math.sin(fase) * 2.2 if anda else 0.0
            alza = max(0.0, math.cos(fase)) * 1.1 if anda else 0.0
            pata(pr, (x0, 8 + bob, 4.3 * sg), (x0 + sw, 1.4 + alza, 4.3 * sg), 2.3, 2.0, 'piel', 'pezuna', (2.0, 1.1, 1.9))
    # La cola en tirabuzón: tres trocitos.
    c0 = (-13.8, 15 + bob, 0)
    pr.append(cono(c0, (-15.6, 16.8 + bob, 0.6), 0.75, 0.7, 'piel'))
    pr.append(cono((-15.6, 16.8 + bob, 0.6), (-15.0, 18.2 + bob, -0.4), 0.7, 0.6, 'piel'))
    return pr, None


# ===========================================================================
# EL ZORRO Y LA ZORRA
# ===========================================================================
def zorro_mat(base, claro):
    return {
        'pelo': {'tonos': tonos(base, 0.3, 0.55)},
        'claro': {'tonos': tonos(claro, 0.12, 0.38)},
        'oscuro': {'tonos': tonos('#2a1c1a', 0.2, 0.45)},
        'nariz': {'tonos': tonos('#1a1214', 0.2, 0.3)},
        'boca': {'tonos': tonos('#7a2a30', 0.2, 0.4)},
        'ojo': {'emite': hex_rgb('#1d1416')},
    }


def zorro(accion, i):
    pr = []
    f, anda = paso(accion, i)
    tumbado = accion == 'tumbado'
    come = accion == 'come'
    y0 = -6.5 if tumbado else 0.0
    avanza, agacha, abre, salta = 0.0, 0.0, 0.0, 0.0
    if accion == 'ataque':
        agacha = (2.2, 0.0, 0.8)[i - 1]
        avanza = (-1.0, 4.0, 2.0)[i - 1]
        salta = (0.0, 3.5, 0.5)[i - 1]
        abre = (0.6, 2.4, 0.4)[i - 1]
    if accion == 'quieto' and i == 2:
        y0 += 0.35
    y0 += salta - agacha
    pr.append(elip((avanza * 0.4, 13.6 + y0, 0), (10.5, 5.0, 4.7), 'pelo'))
    pr.append(elip((5.5 + avanza * 0.6, 13.2 + y0, 0), (5.4, 5.6, 4.7), 'pelo'))
    hx = 13.0 + avanza
    hy = (9.5 + (0.4 if i == 2 else 0.0)) if come else (17.6 + y0 + (0.6 if tumbado else 0.0))
    if come:
        pr.append(cono((8.5 + avanza, 15 + y0, 0), (hx - 1.5, hy + 1.5, 0), 3.6, 2.8, 'pelo'))
    else:
        pr.append(cono((8.5 + avanza, 15 + y0, 0), (hx - 1.5, hy - 0.8, 0), 3.6, 2.9, 'pelo'))
    pr.append(elip((hx, hy, 0), (4.0, 3.6, 3.7), 'pelo'))
    pr.append(cono((hx + 2.0, hy - 0.5, 0), (hx + 7.0, hy - 1.6, 0), 2.0, 0.9, 'pelo'))
    pr.append(elip((hx + 7.2, hy - 1.6, 0), (0.9, 0.8, 0.8), 'nariz'))
    pr.append(cono((hx + 2.0, hy - 2.0, 0), (hx + 6.4, hy - 2.6 - abre, 0), 1.4, 0.7, 'claro'))
    if abre > 1.5:
        pr.append(cono((hx + 2.5, hy - 1.8, 0), (hx + 6.0, hy - 2.2 - abre * 0.5, 0), 0.9, 0.6, 'boca'))
    orejas = []
    for sg in (1, -1):
        orejas.append(cono((hx - 0.8, hy + 2.6, 2.0 * sg), (hx - 1.2, hy + 7.4, 2.7 * sg), 1.9, 0.3, 'pelo'))
        pr.append(orejas[-1])
        pr.append(elip((hx + 2.0, hy + 0.9, 2.9 * sg), (0.65, 0.55, 0.5), 'ojo'))
    # Patas (tumbado: dobladas, las de delante estiradas por delante).
    for delante, x0 in ((True, 6.5), (False, -7.0)):
        for sg in (1, -1):
            z = 3.0 * sg
            if tumbado:
                if delante:
                    pata(pr, (x0 + avanza, 8.5 + y0, z), (x0 + 6.5, 1.0, z), 1.5, 1.2, 'oscuro', 'oscuro', (1.6, 0.9, 1.3))
                else:
                    pr.append(elip((x0 - 1.0, 4.0, z * 1.2), (4.4, 3.0, 2.0), 'pelo'))
                continue
            fase = f + (0 if (sg > 0) == delante else math.pi)
            sw = math.sin(fase) * 2.8 if anda else 0.0
            alza = max(0.0, math.cos(fase)) * 1.4 if anda else 0.0
            if accion == 'ataque':
                sw = ((-1.5, 4.5, 1.5) if delante else (1.5, -4.5, -1.5))[i - 1]
                alza = (0.0, 2.5, 0.3)[i - 1]
            cad = (x0 + avanza * (0.8 if delante else 0.2), 10.6 + y0, z)
            rod = ((cad[0] + x0 + sw) / 2.0 + (0 if delante else -1.6), 5.5 + alza * 0.6, z)
            pie = (x0 + sw + avanza * 0.5, 1.0 + alza, z)
            if not delante:
                pr.append(elip((cad[0], cad[1] - 1.0, z * 0.9), (3.6, 4.2, 2.2), 'pelo'))
            pr.append(cono(cad, rod, 1.7, 1.4, 'pelo'))
            pr.append(cono(rod, pie, 1.4, 1.2, 'oscuro'))
            pr.append(elip((pie[0] + 0.5, pie[1], z), (1.6, 0.9, 1.3), 'oscuro'))
    # La cola, espesa, con la punta blanca.
    sway = math.sin(f) * 0.6 if anda else (0.6 if (accion == 'quieto' and i == 2) else 0.0)
    if tumbado:
        c0, c1, c2 = (-9.0, 8.5 + y0 + 6.5, 0), (-14.0, 2.5, 2.5), (-18.5, 2.0, 4.5)
    else:
        c0, c1, c2 = (-9.5 + avanza * 0.3, 14.5 + y0, 0), (-15.5, 11.5 + y0 + sway, 0), (-19.5, 9.5 + y0 + sway * 1.4, 0)
    pr.append(cono(c0, c1, 2.6, 3.0, 'pelo'))
    pr.append(cono(c1, c2, 3.0, 1.4, 'claro'))

    def retoque(p, Pm, nm, nw):
        # Pecho, garganta y tripa, blancos.
        if p['mat'] == 'pelo' and nm[1] < -0.4 and Pm[0] > -6:
            return 'claro'
        # La punta de las orejas, oscura.
        if any(p is o for o in orejas) and Pm[1] > hy + 5.6:
            return 'oscuro'
        return None
    return pr, retoque


# ===========================================================================
# EL CONEJO
# ===========================================================================
CONEJO_MAT = {
    'pelo': {'tonos': tonos('#c8b29a', 0.25, 0.5)},
    'claro': {'tonos': tonos('#efe6da', 0.1, 0.35)},
    'rosa': {'tonos': tonos('#e6a8a8', 0.2, 0.4)},
    'ojo': {'emite': hex_rgb('#1d1416')},
    'zanahoria': {'tonos': tonos('#ef8a2a', 0.25, 0.45)},
    'hoja': {'tonos': tonos('#5caa3c', 0.25, 0.45)},
    'tierra': {'tonos': tonos('#8a6142', 0.25, 0.5)},
    'agujero': {'emite': hex_rgb('#24170f')},
}


def conejo(accion, i):
    pr = []
    if accion == 'madriguera':
        # La madriguera: un montón de tierra con la boca oscura (UNA).
        pr.append(elip((0, 0.6, 0), (9.5, 3.0, 6.4), 'tierra'))
        pr.append(elip((3.0, 2.9, 0.5), (3.2, 0.7, 2.6), 'agujero'))
        if i == 2:
            pr.append(elip((-6.0, 1.2, 3.0), (2.6, 1.5, 2.0), 'tierra'))
        return pr, None
    f, anda = paso(accion, i)
    duerme = accion == 'duerme'
    come = accion == 'come'
    corre = accion == 'corre'
    cava = accion == 'cava'
    estira = 0.0
    alto = 0.0
    if corre:
        estira = (2.5, 0.5, -1.0, 1.0)[i - 1]
        alto = (2.0, 3.0, 0.5, 0.0)[i - 1]
    elif accion in ('camina', 'lleva'):
        alto = (0.0, 1.0, 1.5, 0.5)[(i - 1) % 4]
    bob = 0.3 if (accion == 'quieto' and i == 2) else 0.0
    y0 = alto + bob - (1.6 if duerme else 0.0)
    pr.append(elip((-1.0, 6.6 + y0, 0), (5.4 + estira * 0.4, 4.5, 4.0), 'pelo'))
    pr.append(elip((-3.0, 6.0 + y0, 0), (4.4, 4.6, 4.2), 'pelo'))
    if duerme:
        hx, hy = 3.0, 6.4 + y0
    elif come or cava:
        hx, hy = 5.0, 4.0 + (0.4 if i == 2 else 0.0)
    else:
        hx, hy = 4.6 + estira * 0.5, 9.0 + y0
    pr.append(elip((hx, hy, 0), (3.2, 3.0, 2.8), 'pelo'))
    pr.append(elip((hx + 2.4, hy - 0.8, 0), (1.2, 1.2, 1.4), 'claro'))
    for sg in (1, -1):
        if duerme:
            pr.append(cono((hx - 1.2, hy + 1.6, 1.0 * sg), (hx - 6.0, hy + 2.2, 1.6 * sg), 1.1, 0.6, 'pelo'))
        else:
            caida = 2.4 if (accion == 'quieto' and i == 2 and sg > 0) else 0.0
            pr.append(cono((hx - 0.6, hy + 2.2, 1.2 * sg), (hx - 2.0 - caida, hy + 7.4 - caida * 0.8, 1.6 * sg), 1.1, 0.6, 'pelo'))
        if not duerme:
            pr.append(elip((hx + 1.2, hy + 0.7, 2.4 * sg), (0.55, 0.6, 0.45), 'ojo'))
    pr.append(elip((-6.6, 7.4 + y0, 0), (1.7, 1.7, 1.6), 'claro'))
    # Patas: las de atrás, grandes; las de delante, finas (cavan).
    for sg in (1, -1):
        z = 2.4 * sg
        atr = (-3.0 - estira * 0.6, 1.0 + max(0.0, alto - 1.2), z)
        pr.append(elip(atr, (3.0, 1.0, 1.2), 'pelo'))
        if cava:
            dx = (1.5, 3.0, 0.5)[i - 1] * (1 if sg > 0 else -1) * 0.6
            pie = (5.0 + dx, 0.8 + (1.2 if (i == 2) == (sg > 0) else 0.0), z * 0.8)
        else:
            pie = (3.6 + estira, 0.6 + max(0.0, alto - 1.5), z * 0.8)
        pr.append(cono((2.2, 4.6 + y0, z * 0.8), pie, 0.9, 0.8, 'pelo'))
    if accion == 'lleva':
        # La zanahoria en la boca, cruzada.
        pr.append(cono((hx + 2.4, hy - 1.4, 2.6), (hx + 3.4, hy - 1.8, -2.4), 0.9, 0.4, 'zanahoria'))
        pr.append(cono((hx + 2.4, hy - 1.4, 2.6), (hx + 2.0, hy + 0.2, 4.4), 0.5, 0.3, 'hoja'))
    if cava:
        # La tierra que salta: UN terrón grande, no una lluvia de motas.
        pr.append(elip((-6.0 - i, 2.0 + i * 0.6, 1.0), (1.8, 1.4, 1.6), 'tierra'))
    return pr, None


# ===========================================================================
# EL COCODRILO
# ===========================================================================
COCO_MAT = {
    'piel': {'tonos': tonos('#45723a', 0.2, 0.55)},
    'lomo': {'tonos': tonos('#335a2c', 0.25, 0.55)},
    'tripa': {'tonos': tonos('#b9c27e', 0.15, 0.4)},
    'diente': {'tonos': tonos('#f1eedc', 0.05, 0.25)},
    'boca': {'tonos': tonos('#a63a3a', 0.2, 0.4)},
    'ojo': {'tonos': tonos('#e8c44a', 0.2, 0.35)},
}


def cocodrilo(accion, i):
    pr = []
    f, anda = paso(accion, i)
    abre = 0.0
    if accion == 'ataque':
        abre = (1.5, 4.5, 1.0)[i - 1]
    elif accion == 'come':
        abre = (1.2, 0.3)[i - 1]
    sway = math.sin(f) * 1.6 if anda else (0.5 if (accion == 'quieto' and i == 2) else 0.0)
    pr.append(elip((-2, 5.6, 0), (15, 3.8, 6.4), 'piel'))
    # La cola: tres tramos que se afinan y se mecen.
    pts = [(-15, 5.0, 0), (-23, 4.2, sway * 0.5), (-30, 3.4, sway), (-35, 2.8, sway * 1.4)]
    rr = [4.6, 3.4, 2.2, 0.8]
    for k in range(3):
        pr.append(cono(pts[k], pts[k + 1], rr[k], rr[k + 1], 'piel'))
    # La cabeza: el hocico largo y la mandíbula, que se abre.
    pr.append(elip((14, 5.6, 0), (5.0, 3.2, 4.8), 'piel'))
    # La cresta del lomo y de la cola: UNA arista continua, más oscura.
    pr.append(cono((-13, 8.6, 0), (10, 8.8, 0), 0.9, 0.9, 'lomo'))
    pr.append(cono((-15, 8.0, 0), (-30, 4.6, sway), 0.8, 0.4, 'lomo'))
    pr.append(cono((16, 6.2 + abre * 0.5, 0), (29, 5.6 + abre * 1.5, 0), 3.4, 1.8, 'piel'))
    pr.append(cono((16, 3.8, 0), (28.5, 3.0 - abre * 0.5, 0), 2.6, 1.4, 'tripa'))
    if abre > 1.6:
        pr.append(cono((17, 4.6, 0), (27.5, 4.4 + abre * 0.45, 0), 2.2, 1.2, 'boca'))
    for sg in (1, -1):
        pr.append(elip((15.5, 8.8 + abre * 0.4, 2.4 * sg), (1.1, 0.9, 0.9), 'ojo'))
        # Las patas, cortas y abiertas hacia fuera.
        for delante, x0 in ((True, 8.0), (False, -10.0)):
            fase = f + (0 if (sg > 0) == delante else math.pi)
            sw = math.sin(fase) * 2.6 if anda else 0.0
            pr.append(cono((x0, 4.4, 5.2 * sg), (x0 + sw, 1.0, 8.4 * sg), 1.7, 1.4, 'piel'))
            pr.append(elip((x0 + sw + 0.8, 0.9, 8.6 * sg), (2.0, 0.8, 1.6), 'piel'))
    lomo = pr[0]

    def retoque(p, Pm, nm, nw):
        # El lomo, una franja más oscura; la tripa, clara.
        if p['mat'] == 'piel' and nm[1] > 0.55 and abs(Pm[2]) < 2.4:
            return 'lomo'
        if p['mat'] == 'piel' and nm[1] < -0.45:
            return 'tripa'
        # Los dientes: UNA línea clara en el borde de la boca.
        if p['t'] == 'c' and p['mat'] == 'piel' and Pm[0] > 18 and abs(Pm[1] - (4.5 + abre * 0.3)) < 0.45:
            return 'diente'
        return None
    return pr, retoque


# ===========================================================================
# EL TOPO
# ===========================================================================
TOPO_MAT = {
    'pelo': {'tonos': tonos('#4a3a34', 0.3, 0.5)},
    'rosa': {'tonos': tonos('#e6a0a0', 0.2, 0.4)},
    'tierra': {'tonos': tonos('#7a5638', 0.25, 0.5)},
    'agujero': {'emite': hex_rgb('#1c120c')},
    'hoja': {'tonos': tonos('#5caa3c', 0.25, 0.45)},
}


def topo(accion, i):
    pr = []
    if accion == 'monticulo':
        pr.append(elip((0, 0.4, 0), (8.5 + i * 0.6, 3.6 + i * 0.4, 6.0), 'tierra'))
        return pr, None
    if accion == 'hoyo':
        r = (1.0, 0.75, 0.45)[i - 1]
        pr.append(elip((0, 0.3, 0), (8.0 * (0.7 + r * 0.3), 1.6, 5.6 * (0.7 + r * 0.3)), 'tierra'))
        pr.append(elip((0.4, 1.5, 0), (5.0 * r, 0.5, 3.4 * r), 'agujero'))
        return pr, None
    if accion == 'asoma':
        pr.append(elip((0, 0.4, 0), (8.0, 1.8, 5.6), 'tierra'))
        pr.append(elip((0.4, 1.7, 0), (4.8, 0.5, 3.2), 'agujero'))
        hy = 3.6 + (0.8 if i == 2 else 0.0)
        pr.append(elip((0.6, hy, 0), (3.6, 3.4, 3.4), 'pelo'))
        pr.append(cono((2.6, hy - 0.2, 0), (6.0, hy - 0.6, 0), 1.4, 0.7, 'rosa'))
        for sg in (1, -1):
            pr.append(elip((1.8, 2.2, 2.6 * sg), (1.6, 0.8, 1.4), 'rosa'))
        return pr, None
    f, anda = paso(accion, i)
    come = accion == 'come'
    cava = accion == 'cava'
    bob = 0.3 if (accion == 'quieto' and i == 2) else 0.0
    pr.append(elip((0, 5.6 + bob, 0), (8.2, 5.2, 5.4), 'pelo'))
    hx, hy = (7.0, 4.0) if (come or cava) else (7.0, 5.6 + bob)
    pr.append(cono((hx, hy, 0), (hx + 4.6, hy - 0.8, 0), 1.7, 0.7, 'rosa'))
    for sg in (1, -1):
        fase = f + (0 if sg > 0 else math.pi)
        sw = math.sin(fase) * 1.6 if anda else 0.0
        if cava:
            sw = (2.0, -1.0, 2.5)[i - 1] * (1 if sg > 0 else -1)
        pr.append(elip((4.5 + sw * 0.5, 1.2, 4.2 * sg), (2.2, 1.0, 2.0), 'rosa'))
        pr.append(elip((-5.0 - sw * 0.5, 1.0, 3.4 * sg), (1.6, 0.8, 1.3), 'rosa'))
    pr.append(cono((-8.0, 5.0 + bob, 0), (-10.4, 4.0 + bob, 0), 0.8, 0.5, 'rosa'))
    if come:
        pr.append(cono((hx + 4.2, hy - 1.2, -1.2), (hx + 5.4, hy + 1.2, 1.4), 0.7, 0.3, 'hoja'))
    if cava:
        pr.append(elip((-9.0 - i, 1.4 + i * 0.4, 1.5), (2.4, 1.4, 1.8), 'tierra'))
    return pr, None


# ===========================================================================
# LAS SERPIENTES
# ===========================================================================
def serp_mat(base, tripa, extra):
    m = {
        'piel': {'tonos': tonos(base, 0.3, 0.55)},
        'tripa': {'tonos': tonos(tripa, 0.12, 0.4)},
        'lengua': {'tonos': tonos('#d0303a', 0.2, 0.4)},
        'ojo': {'emite': hex_rgb('#1a1214')},
    }
    m.update(extra)
    return m


SERP = {
    'serpiente_verde': serp_mat('#4f9a46', '#c8d690', {}),
    'serpiente_coral': serp_mat('#c8382e', '#d8c070', {'negro': {'tonos': tonos('#262024', 0.2, 0.4)},
                                                       'amarillo': {'tonos': tonos('#e8c84a', 0.2, 0.4)}}),
    'serpiente_vibora': serp_mat('#b49a74', '#e2d6b8', {'zigzag': {'tonos': tonos('#5c4632', 0.2, 0.45)}}),
}


def serpiente(especie, accion, i):
    pr = []
    fase = (i - 1) / 4.0 * math.pi * 2 if accion == 'repta' else (0.4 if i == 2 else 0.0)
    erguida = 0.0
    adelante = 0.0
    if accion == 'ataque':
        erguida = (3.5, 5.0, 1.0)[i - 1]
        adelante = (-2.0, -1.0, 4.0)[i - 1]
    # El cuerpo: una cadena de tramos que ondula de lado.
    n = 9
    pts = []
    for k in range(n + 1):
        t = k / float(n)
        x = -15.5 + 29.0 * t + adelante * t * t
        z = math.sin(t * math.pi * 2.2 - fase) * 5.4 * (0.45 + 0.55 * t)
        y = 1.6 + (erguida * max(0.0, (t - 0.65) / 0.35) ** 1.5)
        pts.append((x, y, z))
    for k in range(n):
        r0 = 0.7 + 1.1 * min(1.0, (k / float(n)) * 3.0)
        r1 = 0.7 + 1.1 * min(1.0, ((k + 1) / float(n)) * 3.0)
        pr.append(cono(pts[k], pts[k + 1], r0, r1, 'piel'))
    hx, hy, hz = pts[-1]
    pr.append(elip((hx + 1.4, hy + 0.3, hz), (3.0, 1.9, 2.4), 'piel'))
    for sg in (1, -1):
        pr.append(elip((hx + 2.2, hy + 1.0, hz + 1.5 * sg), (0.5, 0.5, 0.4), 'ojo'))
    if accion == 'quieto' and i == 2 or accion == 'ataque' and i >= 2:
        pr.append(cono((hx + 4.0, hy - 0.2, hz), (hx + 6.4, hy - 0.4, hz), 0.35, 0.25, 'lengua'))

    def retoque(p, Pm, nm, nw):
        if p['mat'] != 'piel':
            return None
        if nm[1] < -0.5:
            return 'tripa'
        if especie == 'serpiente_coral':
            # Anillos: rojo, negro, amarillo, negro… (bandas, no motas).
            b = int(math.floor((Pm[0] + 40.0) / 2.2)) % 4
            return {0: None, 1: 'negro', 2: 'amarillo', 3: 'negro'}[b]
        if especie == 'serpiente_vibora' and nm[1] > 0.0:
            # Bandas anchas y oscuras por el lomo (nada de motas).
            if int(math.floor((Pm[0] + 40.0) / 2.6)) % 2 == 1:
                return 'zigzag'
        return None
    return pr, retoque


# ===========================================================================
# LAS AVES
# ===========================================================================
AVE_MAT = {
    'paloma': {
        'pluma': {'tonos': tonos('#8f9ab0', 0.25, 0.5)},
        'claro': {'tonos': tonos('#c8cfdc', 0.12, 0.35)},
        'cuello': {'tonos': tonos('#5e8f86', 0.25, 0.45)},
        'ala': {'tonos': tonos('#7a849a', 0.22, 0.52)},
        'pico': {'tonos': tonos('#3a3438', 0.2, 0.35)},
        'pata': {'tonos': tonos('#d77a86', 0.2, 0.4)},
        'ojo': {'emite': hex_rgb('#e86a2a')},
        'agua': {'tonos': tonos('#5aa6d8', 0.25, 0.4)},
        'espuma': {'tonos': tonos('#d6eef8', 0.05, 0.2)},
    },
    'pajaro': {
        'pluma': {'tonos': tonos('#9a6a3c', 0.28, 0.5)},
        'claro': {'tonos': tonos('#e6c79a', 0.12, 0.35)},
        'cuello': {'tonos': tonos('#9a6a3c', 0.28, 0.5)},
        'ala': {'tonos': tonos('#6e4a2a', 0.22, 0.52)},
        'pico': {'tonos': tonos('#e8a83a', 0.2, 0.35)},
        'pata': {'tonos': tonos('#8a6a4a', 0.2, 0.4)},
        'ojo': {'emite': hex_rgb('#1a1214')},
        'agua': {'tonos': tonos('#5aa6d8', 0.25, 0.4)},
        'espuma': {'tonos': tonos('#d6eef8', 0.05, 0.2)},
    },
    # El cuervo: negro azulado con brillo frío en lo alto (sin motas).
    'cuervo': {
        'pluma': {'tonos': tonos('#1e2032', 0.22, 0.5)},
        'claro': {'tonos': tonos('#191a2a', 0.18, 0.5)},
        'cuello': {'tonos': tonos('#1e2032', 0.22, 0.5)},
        'ala': {'tonos': tonos('#171828', 0.22, 0.5)},
        'pico': {'tonos': tonos('#3a3a44', 0.25, 0.4)},
        'pata': {'tonos': tonos('#2a2a32', 0.2, 0.4)},
        'ojo': {'emite': hex_rgb('#c8d2ff')},
        'agua': {'tonos': tonos('#5aa6d8', 0.25, 0.4)},
        'espuma': {'tonos': tonos('#d6eef8', 0.05, 0.2)},
    },
}


# ===========================================================================
# EL GALLO (cinco fotogramas: mira, y picotea)
# ===========================================================================
GALLO_MAT = {
    'pluma': {'tonos': tonos('#9a2a2a', 0.28, 0.55)},
    'blanco': {'tonos': tonos('#f2ece2', 0.1, 0.38)},
    'cola': {'tonos': tonos('#2c2a34', 0.3, 0.5)},
    'cresta': {'tonos': tonos('#e2382e', 0.25, 0.4)},
    'pico': {'tonos': tonos('#f0b23a', 0.2, 0.35)},
    'pata': {'tonos': tonos('#e0a83a', 0.2, 0.4)},
    'ojo': {'emite': hex_rgb('#1a1214')},
}


def gallo(accion, i):
    pr = []
    pica = (0.0, 0.3, 0.6, 1.0, 1.6)[i - 1]          # 0 = cabeza alta; 1.6 = en el suelo
    # El cuerpo, erguido (la pechuga adelante y arriba).
    pr.append(elip((0, 10.4, 0), (5.0, 4.0, 3.6), 'pluma'))
    pr.append(elip((2.6, 11.6, 0), (3.0, 3.4, 3.2), 'pluma'))
    # El cuello y la cabeza, blancos (bajan al picotear).
    hx, hy = 4.4 + pica * 1.8, 17.6 - pica * 7.2
    pr.append(cono((3.0, 13.0, 0), (hx - 0.4, hy - 1.0, 0), 2.6, 1.9, 'blanco'))
    pr.append(elip((hx, hy, 0), (2.3, 2.4, 2.1), 'blanco'))
    pr.append(cono((hx + 1.8, hy - 0.2, 0), (hx + 3.8, hy - 0.9, 0), 0.8, 0.3, 'pico'))
    pr.append(elip((hx - 0.4, hy + 3.0, 0), (2.6, 2.0, 0.8), 'cresta'))
    pr.append(elip((hx + 1.6, hy - 2.2, 0), (0.7, 1.4, 0.55), 'cresta'))
    for sg in (1, -1):
        pr.append(elip((hx + 1.0, hy + 0.6, 1.7 * sg), (0.45, 0.45, 0.4), 'ojo'))
        pr.append(elip((-0.8, 10.8, 3.1 * sg), (3.6, 2.6, 0.9), 'pluma'))
        pr.append(cono((0.4, 7.0, 1.4 * sg), (0.6, 0.8, 1.4 * sg), 0.6, 0.45, 'pata'))
        pr.append(elip((1.4, 0.5, 1.4 * sg), (1.5, 0.4, 0.7), 'pata'))
    # La cola: tres plumas grandes en arco, oscuras.
    for k, (dx, dy) in enumerate(((-6.8, 19.0), (-8.6, 16.6), (-9.2, 13.4))):
        pr.append(cono((-4.0, 12.0, 0), (dx, dy, (k - 1) * 0.8), 1.8, 0.6, 'cola'))
    return pr, None


def ave(especie, accion, i):
    k = {'paloma': 1.0, 'pajaro': 0.82, 'cuervo': 1.32}[especie]
    pr = []
    vuela = accion == 'vuela'
    bana = accion == 'bana'
    duerme = accion == 'duerme'
    come = accion == 'come'
    y_pata = 0.0 if (vuela or bana or duerme) else 3.2
    # Volando, el ave va algo más alta en su cuadro (la altura de verdad la
    # pone el juego): que las alas arriba no se salgan del dibujo.
    y0 = (2.0 if vuela else 0.0) + y_pata + (0.3 if (accion == 'quieto' and i == 2) else 0.0) - (0.8 if duerme else 0.0)
    if bana:
        # El agua: una lámina con UN anillo de espuma alrededor.
        pr.append(elip((0, 0.3, 0), (9.5, 0.5, 6.0), 'agua'))
        pr.append(elip((0, 0.45, 0), (7.0, 0.5, 4.6), 'espuma'))
        y0 = 1.0
    cuerpo_r = (5.4, 4.0, 3.8) if not duerme else (5.0, 4.6, 4.4)
    pr.append(elip((0, 4.2 + y0, 0), cuerpo_r, 'pluma'))
    if duerme:
        hx, hy = 2.6, 7.0 + y0
    elif come:
        hx, hy = 5.2, 3.6 + y0 + (0.0 if i == 1 else 1.4)
    else:
        hx, hy = 4.0 + (0.4 if (accion == 'camina' and i == 2) else 0.0), 8.2 + y0
    pr.append(elip((hx, hy, 0), (2.6, 2.6, 2.5), 'cuello' if especie == 'paloma' and not duerme else 'pluma'))
    pr.append(elip((hx + 0.6, hy + 0.6, 0), (2.3, 2.2, 2.2), 'pluma'))
    if not duerme:
        pr.append(cono((hx + 2.0, hy + 0.2, 0), (hx + 4.2, hy - 0.4, 0), 0.8, 0.25, 'pico'))
        for sg in (1, -1):
            pr.append(elip((hx + 1.4, hy + 1.0, 1.9 * sg), (0.45, 0.45, 0.4), 'ojo'))
    # La cola: una cuña plana hacia atrás.
    pr.append(elip((-6.4, 5.2 + y0, 0), (3.6, 0.9, 2.2), 'ala'))
    # Las alas.
    if vuela:
        # Batir arriba y abajo: de perfil se lee el aleteo (hacia la cámara
        # solo se veía una bola).
        fase_ala = ('arriba', 'medio', 'abajo', 'medio')[i - 1]
        for sg in (1, -1):
            if fase_ala == 'arriba':
                pr.append(elip((-0.8, 9.4 + y0, 2.6 * sg), (3.6, 4.6, 1.2), 'ala'))
            elif fase_ala == 'abajo':
                pr.append(elip((-0.6, 1.8 + y0, 3.0 * sg), (3.6, 4.0, 1.2), 'ala'))
            else:
                pr.append(elip((-0.6, 5.6 + y0, 4.4 * sg), (4.2, 1.1, 4.2), 'ala'))
    elif bana:
        for sg in (1, -1):
            pr.append(elip((-0.5, 6.0 + y0 + (1.2 if i == 2 else 0.4), 4.0 * sg), (3.6, 1.2, 2.6), 'ala'))
    else:
        for sg in (1, -1):
            pr.append(elip((-1.0, 4.8 + y0, 3.2 * sg), (4.2, 2.4, 1.0), 'ala'))
    # Las patas.
    if y_pata > 0:
        for sg in (1, -1):
            av = (0.8 if (accion == 'camina') and ((i == 1) == (sg > 0)) else 0.0)
            pr.append(cono((0.4, 1.4 + y0, 1.2 * sg), (0.6 + av, 0.6, 1.2 * sg), 0.45, 0.4, 'pata'))
            pr.append(elip((1.2 + av, 0.4, 1.2 * sg), (1.2, 0.35, 0.6), 'pata'))
    if k != 1.0:
        # El pájaro es más pequeño: todo escalado.
        for p in pr:
            for key in ('c', 'a', 'b'):
                if key in p:
                    p[key] = p[key] * k
            if 'r' in p:
                p['r'] = p['r'] * k
            for key in ('ra', 'rb'):
                if key in p:
                    p[key] = p[key] * k

    def retoque(p, Pm, nm, nw):
        if p['mat'] == 'pluma' and nm[1] < -0.35:
            return 'claro'
        return None
    return pr, retoque


# ===========================================================================
# CATÁLOGO: especie -> (función, materiales, ancho, alto, filas bajo los pies)
# ===========================================================================
def _con(fn, *pre):
    return lambda accion, i: fn(*(pre + (accion, i)))


ESPECIES = {
    'vaca': (vaca, VACA_MAT, 62, 44, 4),
    'cerdo': (cerdo, CERDO_MAT, 46, 32, 3),
    'zorro': (zorro, zorro_mat('#d8642a', '#f4ead8'), 44, 30, 2),
    'zorra': (zorro, zorro_mat('#e0843c', '#f6eedf'), 44, 30, 2),
    'conejo': (conejo, CONEJO_MAT, 26, 20, 2),
    'cocodrilo': (cocodrilo, COCO_MAT, 70, 24, 5),
    'topo': (topo, TOPO_MAT, 30, 22, 3),
    'serpiente_verde': (_con(serpiente, 'serpiente_verde'), SERP['serpiente_verde'], 38, 18, 3),
    'serpiente_coral': (_con(serpiente, 'serpiente_coral'), SERP['serpiente_coral'], 38, 18, 3),
    'serpiente_vibora': (_con(serpiente, 'serpiente_vibora'), SERP['serpiente_vibora'], 38, 18, 3),
    'paloma': (_con(ave, 'paloma'), AVE_MAT['paloma'], 26, 22, 2),
    'pajaro': (_con(ave, 'pajaro'), AVE_MAT['pajaro'], 22, 19, 2),
    'cuervo': (_con(ave, 'cuervo'), AVE_MAT['cuervo'], 30, 24, 2),
    'gallo': (gallo, GALLO_MAT, 23, 22, 2),
}


# LAS CUATRO DIRECCIONES (2026-10-12): "los animales no se mueven para sus 4
# lados, solo para dos". De estos, también de frente ('abajo') y de espaldas
# ('arriba'), en las poses de moverse, estar quieto, comer y atacar. Las aves
# andan de lado a lado y las mariposas se ven desde arriba: no lo necesitan.
CUATRO_LADOS = {
    'vaca': ('camina', 'quieto', 'come'),
    'cerdo': ('camina', 'quieto', 'come'),
    'zorro': ('camina', 'quieto', 'come', 'ataque'),
    'zorra': ('camina', 'quieto', 'come', 'ataque'),
    'cocodrilo': ('camina', 'quieto', 'come', 'ataque'),
    'conejo': ('camina', 'corre', 'quieto', 'come', 'lleva'),
    'topo': ('camina', 'quieto', 'come'),
    'serpiente_verde': ('repta', 'quieto', 'ataque'),
    'serpiente_coral': ('repta', 'quieto', 'ataque'),
    'serpiente_vibora': ('repta', 'quieto', 'ataque'),
}
# De frente, un animal largo se ve de punta: se le acorta el largo para que
# quepa en su MISMO cuadro con el punto de apoyo en la misma fila (al girarse
# no da un salto).
ACORTA = {'vaca': 0.62, 'cerdo': 0.7, 'zorro': 0.7, 'zorra': 0.7, 'cocodrilo': 0.42, 'conejo': 0.8,
          'topo': 0.8, 'serpiente_verde': 0.5, 'serpiente_coral': 0.5, 'serpiente_vibora': 0.5}


def foto(especie, accion, i, vista='lado'):
    """`vista`: 'lado' (la de siempre), 'abajo' (de frente) o 'arriba'."""
    fn, mats, W, H, suelo = ESPECIES[especie]
    prims, retoque = fn(accion, i)
    base = next(iter(mats.values()))
    cont = contorno_de(base['tonos'][2]) if 'tonos' in base else (20, 18, 16)
    if vista == 'lado':
        return fotografiar(prims, W, H, 'lado', mats, retoque, cont, suelo=suelo, salto=2.0)
    camara = 'frente' if vista == 'abajo' else 'espalda'
    return fotografiar(prims, W, H, camara, mats, retoque, cont, suelo=suelo, salto=2.0,
                       fx=ACORTA.get(especie, 0.7))
