# -*- coding: utf-8 -*-
"""
=============================================================================
LOS GÓLEMS: CADA UNO CON SU CUERPO                               (2026-11-24)
=============================================================================

"Quiero otros gólems, no los mismos con diferentes colores."

Hasta hoy el gólem de la cripta, el de arena y el de hielo eran el gólem de
piedra del mapa salvaje teñido, y el de cristal y el de musgo, el mismo con
una fila de púas por el lomo. Ahora cada uno es un MODELO nuevo con su
silueta, sus materiales y su forma de moverse:

  golem_cripta   (cementerio) Un mausoleo que anda, encorvado: una lápida con
                 su arco a la espalda (más alta que la cabeza), el pecho de
                 costillas de piedra con el alma verde dentro, cráneo con la
                 frente que hunde los ojos, brazos largos con grilletes y
                 garras, y un farol colgado de la cadera.
  golem_arena    (desierto)   El guardián de arenisca, SIN piernas: flota sobre
                 un remolino de arena que gira. Tocado de franjas oro y
                 lapislázuli, collar ancho, barba postiza, el glifo de la
                 pirámide en el pecho y antebrazos sueltos que sostiene la
                 arena.
  golem_hielo    (tundra)     El coloso de esquirlas: pecho de dos prismas de
                 hielo con su arista, núcleo de diamante, carámbanos enormes en
                 los hombros, corona de esquirlas, puños de cristal y nieve en
                 todo lo que mira arriba.
  golem_cristal  (caverna)    La geoda bruta: anda sobre los nudillos, con
                 antebrazos enormes y la cabeza hundida entre los hombros; un
                 bosque de cristales le sale de la espalda y de los brazos, y
                 sus puntas brillan.
  golem_musgo    (pradera)    El gólem de zarza: piernas de tronco con raíces,
                 pecho de tocón con sus estrías, una enredadera en bandolera,
                 cornamenta de ramas con hojas, dedos de ramita y dos flores.
  golem_magma    (volcán)     El volcán que anda: placas de basalto con el
                 magma brillando en las juntas, un cráter encendido a la
                 espalda, rodillas y codos al rojo, puños fundidos que gotean y
                 ceniza en lo de arriba.

El gólem de piedra del mapa salvaje (tools/gf_bestias3d.py) y el centinela de
las ruinas (tools/gf_reinos_bestias.py) ya tenían cuerpo propio: no cambian.

Mismas reglas que todas las bestias: la cámara y la luz de
tools/gf_bestias3d.py, cinco bandas lisas por material, el contorno del juego
y NADA de motas (el dueño del juego tiene tripofobia): franjas, aros, líneas
y piezas grandes, nunca puntos ni agujeros.

Lo usan tools/generar-monstruos.py (los cinco primeros, que añade a
gf_bestias3d.BESTIAS3D) y tools/gf_reinos_bestias.py (el de magma, en
BESTIAS). Determinista: mismos bytes en cada ejecución.
=============================================================================
"""
import math

import numpy as np

from gf_arte import rampa, hex_rgb, contorno_de
from gf_bestias3d import elip, cono, roca, giro_z, giro_x, _local, DIRV

HACIA_CAMARA = -DIRV
ARRIBA_Y = np.array((0.0, 1.0, 0.0))


# ===========================================================================
# AYUDAS
# ===========================================================================
def tonos(h, arriba=0.3, abajo=0.55, brillo=False):
    d = {'tonos': rampa(hex_rgb(h), 5, arriba=arriba, abajo=abajo)}
    if brillo:
        d['brillo'] = True
    return d


def emite(h):
    return {'emite': hex_rgb(h)}


def giro_y(a):
    """Gira alrededor de la vertical (lleva x hacia z). Columnas = ejes locales."""
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0.0, s], [0.0, 1.0, 0.0], [-s, 0.0, c]])


def marco(eje, hacia=None):
    """Una base (columnas = ejes locales) con x a lo largo de `eje`. `hacia`
    orienta la y local (arriba si no se dice; adelante si el eje ya es casi
    vertical)."""
    x = np.asarray(eje, dtype=float)
    x = x / max(np.linalg.norm(x), 1e-9)
    if hacia is None:
        hacia = (0.0, 1.0, 0.0) if abs(x[1]) < 0.85 else (1.0, 0.0, 0.0)
    y = np.asarray(hacia, dtype=float)
    y = y - (y @ x) * x
    y = y / max(np.linalg.norm(y), 1e-9)
    return np.column_stack([x, y, np.cross(x, y)])


def medio(a, b, t=0.5):
    return tuple(a[k] + (b[k] - a[k]) * t for k in range(3))


def suma(a, b):
    return tuple(a[k] + b[k] for k in range(3))


def en(c, R, dx, dy, dz):
    """El punto (dx, dy, dz) del marco R (columnas = ejes) con origen en c."""
    v = R @ np.array((dx, dy, dz), float)
    return (c[0] + v[0], c[1] + v[1], c[2] + v[2])


def pose(accion, i, lean=0.18, lean_ataque=(0.05, -0.05, 0.42)):
    """(fase, bote, paso, inclinación, golpe) de un fotograma de gólem: andar 4,
    ataque 3 (alza, alza más y descarga) y quieto 2."""
    f = (i - 1) / 4.0 * math.pi * 2
    bob, paso, golpe = 0.0, 0.0, False
    if accion == 'camina':
        paso = math.sin(f)
        bob = 1.0 if i in (2, 4) else 0.0
    elif accion == 'quieto':
        bob = 0.8 if i == 2 else 0.0
    else:
        lean = lean_ataque[i - 1]
        golpe = i == 3
    return f, bob, paso, lean, golpe


def alza_pie(accion, f, sg, alto=3.0):
    """Cuánto sube el pie de ese lado al andar (cada pie en su medio paso)."""
    if accion != 'camina':
        return 0.0
    return max(0.0, math.cos(f + (0.0 if sg > 0 else math.pi))) * alto


def a_lo_largo(p, P):
    """0 en el arranque de un cono, 1 en su punta: dónde cae P a lo largo."""
    a, b = p['a'], p['b']
    ba = b - a
    return float(np.clip(((P - a) @ ba) / max(float(ba @ ba), 1e-9), 0.0, 1.0))


def prisma(a, b, ancho, mat, bisel=0.78, arista=0.88, alto=None, vuelta=0.0, extra=0.0):
    """Una roca alargada de `a` a `b`: un prisma facetado (la pierna de hielo,
    el antebrazo de arenisca). `vuelta` la gira sobre su eje (enseña una arista
    en vez de una cara)."""
    a = np.asarray(a, float)
    b = np.asarray(b, float)
    d = b - a
    L = float(np.linalg.norm(d)) or 1e-6
    R = marco(d)
    if vuelta:
        R = R @ giro_x(vuelta)
    return roca(tuple((a + b) / 2.0), (L / 2.0 + extra, alto or ancho, ancho), mat, rot=R, bisel=bisel, arista=arista)


def brillo_central(p, nw, mat_borde, mat_centro, umbral=0.72):
    """Una pieza que emite luz, con el centro (lo que mira a la cámara) más
    claro que el borde: así una bola de luz tiene volumen y no es un disco."""
    if p['mat'] == mat_borde and float(nw @ HACIA_CAMARA) > umbral:
        return mat_centro
    return None


def brazos_golpe(accion, i, paso, bob, reposo, anda=8.0):
    """Codo y puño (lado +z) del gólem que alza los dos brazos y descarga:
    `reposo` = (codo, puño) quieto; al andar los brazos se balancean."""
    if accion == 'ataque':
        return ({1: (5, 60, 18), 2: (0, 65, 17), 3: (19, 27, 17)}[i],
                {1: (6, 73, 11), 2: (-2, 79, 10), 3: (26, 9, 9)}[i])
    (cx, cy, cz), (px, py, pz) = reposo
    if accion == 'camina':
        return (cx - paso * anda * 0.5, cy, cz), (px - paso * anda, py, pz)
    return (cx, cy + bob, cz), (px, py + bob, pz)


def lado(p, sg):
    return (p[0], p[1], p[2] * sg)


# ===========================================================================
# EL GÓLEM DE LA CRIPTA (cementerio): un mausoleo que anda
# ===========================================================================
CRIPTA_MAT = {
    'losa': tonos('#a7aab3', 0.3, 0.58),
    'losa_o': tonos('#6e7380', 0.28, 0.58),
    'hierro': tonos('#424654', 0.36, 0.5, brillo=True),
    'liquen': tonos('#7f9a68', 0.26, 0.52),
    'alma': emite('#4fe39a'),
    'alma2': emite('#d2ffe6'),
    'ojo': emite('#c8ffe0'),
}


def golem_cripta(accion, i):
    f, bob, paso, lean, golpe = pose(accion, i, lean=0.24, lean_ataque=(0.1, -0.04, 0.56))
    pr = []
    # Piernas cortas y arqueadas, con pies de losa.
    for sg in (1, -1):
        av = paso * 5.5 * sg
        alza = alza_pie(accion, f, sg)
        cad = (0.0, 19.5 + bob, 6.0 * sg)
        rod = (2.4 + av * 0.5, 10.8 + alza * 0.6, 8.4 * sg)
        tob = (av + 0.6, 4.4 + alza, 7.4 * sg)
        pr.append(cono(cad, rod, 4.4, 4.0, 'losa_o'))
        pr.append(cono(rod, tob, 4.0, 3.4, 'losa_o'))
        pr.append(roca((av + 1.8, 2.5 + alza, 7.4 * sg), (5.8, 2.5, 4.4), 'losa'))
    pr.append(roca((0.0, 21.5 + bob, 0.0), (5.6, 3.6, 9.2), 'losa_o'))                  # la cadera
    tor = (2.0 + (5 if golpe else 0), 35.0 + bob - (4 if golpe else 0), 0.0)
    R = giro_z(-lean)
    # La espalda: una lápida con su remate en arco, más alta que la cabeza.
    lapida = roca(en(tor, R, -5.0, 2.5, 0.0), (2.8, 12.5, 10.6), 'losa', rot=R, bisel=0.86, arista=0.92)
    arco = elip(en(tor, R, -5.0, 14.6, 0.0), (2.8, 5.2, 10.6), 'losa', rot=R)
    pr += [lapida, arco]
    # El pecho, una jaula: dos montantes, tres pares de costillas que bajan
    # hacia el esternón y, dentro, el alma.
    alma = elip(en(tor, R, 1.2, 0.2, 0.0), (4.6, 8.0, 8.2), 'alma', rot=R)
    pr.append(alma)
    for sg in (1, -1):
        pr.append(cono(en(tor, R, 1.0, -8.5, 8.8 * sg), en(tor, R, 1.4, 9.0, 9.4 * sg), 2.2, 2.4, 'losa'))
    for yy in (-5.4, 0.0, 5.4):
        for sg in (1, -1):
            pr.append(cono(en(tor, R, 1.8, yy + 1.4, 8.9 * sg), en(tor, R, 5.6, yy - 0.8, 0.0), 1.1, 1.1, 'losa'))
    pr.append(cono(en(tor, R, 5.6, -7.6, 0.0), en(tor, R, 5.8, 7.2, 0.0), 1.3, 1.5, 'losa'))    # el esternón
    pr.append(roca(en(tor, R, 0.0, 9.6, 0.0), (6.2, 2.4, 11.6), 'losa', rot=R))                  # la clavícula
    pr.append(roca(en(tor, R, 0.0, -9.4, 0.0), (5.6, 2.6, 9.4), 'losa_o', rot=R))                # el vientre
    # La cabeza, más baja que los hombros: un cráneo con la frente que hunde
    # los ojos y la mandíbula.
    cab = en(tor, R, 8.2, 8.4, 0.0)
    pr.append(cono(en(tor, R, 2.0, 8.0, 0.0), cab, 2.6, 2.3, 'losa_o'))
    pr.append(elip(cab, (4.8, 4.6, 4.4), 'losa'))
    pr.append(roca(suma(cab, (2.4, -3.7, 0.0)), (2.8, 1.5, 3.2), 'losa_o'))
    pr.append(roca(suma(cab, (3.4, 1.9, 0.0)), (1.6, 1.0, 4.1), 'losa'))
    for sg in (1, -1):
        pr.append(elip(suma(cab, (4.1, 0.1, 1.9 * sg)), (0.9, 1.2, 1.1), 'ojo'))
    # Brazos largos (las garras casi rozan el suelo), con grillete de hierro.
    for sg in (1, -1):
        hombro = en(tor, R, -0.6, 8.6, 12.6 * sg)
        pr.append(elip(hombro, (4.6, 4.0, 4.4), 'losa'))
        codo, puno = brazos_golpe(accion, i, paso, bob, ((5.0, 27.0, 16.0), (9.5, 12.0, 15.0)), anda=9.0)
        codo, puno = lado(codo, sg), lado(puno, sg)
        pr.append(cono(hombro, codo, 2.8, 2.5, 'losa_o'))
        pr.append(elip(codo, (3.0, 3.0, 3.0), 'losa'))
        pr.append(cono(codo, puno, 2.5, 2.2, 'losa_o'))
        d = np.subtract(puno, codo)
        u = d / max(np.linalg.norm(d), 1e-9)
        pr.append(elip(medio(codo, puno, 0.7), (1.5, 3.5, 3.5), 'hierro', rot=marco(d)))
        palma = tuple(np.add(puno, u * 1.6))
        pr.append(elip(palma, (2.6, 2.2, 2.8), 'losa', rot=marco(d)))
        lat = marco(d)[:, 2]
        for k in (-1, 0, 1):
            base = np.add(palma, lat * 1.5 * k + u * 1.2)
            punta = np.add(base, u * 4.6 + lat * 0.9 * k - ARRIBA_Y * 1.2)
            pr.append(cono(tuple(base), tuple(punta), 1.0, 0.35, 'losa'))
    # El farol, colgado del cinto, delante del muslo del lado que se ve.
    sw = paso * 1.6 if accion == 'camina' else 0.0
    farol = (6.4 + sw, 12.6 + bob, 6.4)
    pr.append(cono((5.0, 21.6 + bob, 5.4), suma(farol, (0.0, 4.0, 0.0)), 0.6, 0.6, 'hierro'))
    pr.append(roca(suma(farol, (0.0, 3.5, 0.0)), (2.4, 0.9, 2.4), 'hierro'))
    luz = elip(farol, (2.0, 2.9, 2.0), 'alma')
    pr.append(luz)
    pr.append(roca(suma(farol, (0.0, -3.2, 0.0)), (2.2, 0.7, 2.2), 'hierro'))

    def retoque(p, Pm, nm, nw):
        if p is alma or p is luz:
            return brillo_central(p, nw, 'alma', 'alma2', 0.7)
        if (p is arco or p is lapida) and nw[1] > 0.8:
            return 'liquen'                           # el liquen, encima de la lápida
        return None
    return pr, retoque


# ===========================================================================
# EL GÓLEM DE ARENA (desierto): el guardián que flota sobre un remolino
# ===========================================================================
ARENA_MAT = {
    'arenisca': tonos('#d8b078', 0.3, 0.56),
    'arenisca_o': tonos('#ae8250', 0.28, 0.56),
    'arena': tonos('#ead39e', 0.22, 0.48),
    'arena_o': tonos('#c39c62', 0.24, 0.5),
    'oro': tonos('#e4b23a', 0.42, 0.55, brillo=True),
    'lapis': tonos('#2f5cb4', 0.3, 0.5),
    'ojo': emite('#ffc45a'),
    'glifo': emite('#ff9a3a'),
    'glifo2': emite('#ffe6a8'),
}


def golem_arena(accion, i):
    f, _bob, paso, lean, golpe = pose(accion, i, lean=0.08, lean_ataque=(-0.06, -0.14, 0.4))
    # Flota: sube y baja despacio (no da pasos).
    if accion == 'camina':
        bob = (0.0, 1.0, 1.6, 0.8)[i - 1]
    elif accion == 'quieto':
        bob = (0.0, 1.2)[i - 1]
    else:
        bob = (0.8, 2.0, -0.8)[i - 1]
    giro = {'camina': (i - 1) * 0.25, 'quieto': (i - 1) * 0.12}.get(accion, i * 0.2)
    pr = []
    # El remolino: un cono de arena con tres franjas en espiral que giran.
    cola = -2.6 if accion == 'camina' else 0.0
    remolino = cono((cola, 1.4, 0.0), (0.6, 25.0 + bob, 0.0), 2.4, 10.6, 'arena')
    pr.append(remolino)
    pr.append(elip((cola * 0.6, 0.9, 0.0), (7.4, 1.2, 7.4), 'arena_o'))                 # la arena del suelo
    # Dos piedras que giran con el remolino.
    piedras = []
    for k, (alto, rad) in enumerate(((10.0, 11.5), (17.5, 13.0))):
        a = giro * math.pi * 2 + k * math.pi
        c = (cola * 0.5 + math.cos(a) * rad, alto + bob, math.sin(a) * rad)
        piedras.append(roca(c, (2.2, 1.8, 2.2), 'arenisca_o', rot=giro_y(a)))
    pr += piedras
    tor = (1.0 + (5 if golpe else 0), 40.0 + bob - (3 if golpe else 0), 0.0)
    R = giro_z(-lean)
    pr.append(roca(en(tor, R, 0.0, -11.8, 0.0), (6.0, 2.0, 8.6), 'oro', rot=R))           # el cinturón
    vientre = roca(en(tor, R, 0.0, -7.6, 0.0), (6.8, 4.4, 9.6), 'arenisca', rot=R)
    pecho = roca(tor, (8.4, 8.0, 14.2), 'arenisca', rot=R, bisel=0.82, arista=0.9)
    pr += [vientre, pecho]
    # El collar ancho, en aros de oro y lapislázuli.
    collar = elip(en(tor, R, 1.4, 8.0, 0.0), (8.0, 2.1, 12.2), 'oro', rot=R)
    pr.append(collar)
    # La cabeza: la cara de arenisca enmarcada por el tocado de franjas, con
    # sus dos caídas por delante de los hombros y la barba postiza.
    cab = en(tor, R, 3.6, 13.6, 0.0)
    pr.append(roca(cab, (4.2, 4.4, 4.0), 'arenisca'))
    toca = roca(suma(cab, (-1.4, 1.7, 0.0)), (4.6, 4.2, 5.5), 'oro', bisel=0.84, arista=0.9)
    pr.append(toca)
    caidas = []
    for sg in (1, -1):
        caidas.append(roca(suma(cab, (0.6, -5.4, 5.1 * sg)), (1.8, 5.0, 1.6), 'oro'))
        pr.append(elip(suma(cab, (4.1, 0.6, 1.7 * sg)), (0.7, 0.8, 1.2), 'ojo'))
    pr += caidas
    barba = cono(suma(cab, (3.0, -4.0, 0.0)), suma(cab, (3.8, -8.4, 0.0)), 1.2, 0.9, 'lapis')
    pr.append(barba)
    # Hombros con su capa de oro, y antebrazos SUELTOS: los une la arena.
    for sg in (1, -1):
        hombro = en(tor, R, -0.6, 5.8, 15.4 * sg)
        pr.append(roca(hombro, (5.0, 4.8, 5.0), 'arenisca'))
        pr.append(roca(suma(hombro, (0.0, 4.0, 0.0)), (5.4, 1.4, 5.4), 'oro'))
        codo, puno = brazos_golpe(accion, i, paso, bob, ((5.0, 26.0, 19.0), (8.0, 15.0, 19.0)), anda=6.0)
        codo, puno = lado(codo, sg), lado(puno, sg)
        d = np.subtract(puno, codo)
        u = d / max(np.linalg.norm(d), 1e-9)
        ini = tuple(np.subtract(codo, u * 1.5))
        pr.append(cono(suma(hombro, (0.0, -3.0, 0.0)), ini, 1.4, 1.1, 'arena'))
        pr.append(prisma(ini, tuple(np.subtract(puno, u * 3.0)), 3.8, 'arenisca'))
        pr.append(elip(tuple(np.subtract(puno, u * 3.4)), (1.3, 4.4, 4.4), 'oro', rot=marco(d)))
        pr.append(roca(puno, (4.6, 4.4, 4.4), 'arenisca_o', rot=marco(d)))

    def retoque(p, Pm, nm, nw):
        if p is remolino:
            if Pm[1] < 5.0:
                return None
            a = math.atan2(Pm[2], Pm[0] - cola) / (2 * math.pi)
            return 'arena_o' if (a * 3.0 + Pm[1] / 11.0 + giro) % 1.0 < 0.38 else None
        if p is pecho:
            q = _local(p, Pm[None, :])[0]
            if q[0] > 7.4 and -4.2 < q[1] < 5.4:
                medio_ancho = (5.4 - q[1]) * 0.56
                if abs(q[2]) < medio_ancho:
                    return 'glifo2' if (abs(q[2]) < medio_ancho - 1.7 and q[1] > -2.4) else 'glifo'
            return 'arenisca_o' if (q[1] + 40.0) % 4.6 < 1.15 else None   # las capas de la arenisca
        if p is vientre:
            q = _local(p, Pm[None, :])[0]
            return 'arenisca_o' if (q[1] + 40.0) % 4.6 < 1.15 else None
        if p is collar:
            q = _local(p, Pm[None, :])[0]
            r = math.hypot(q[0] / 8.0, q[2] / 12.2)
            return 'lapis' if (0.52 < r < 0.66 or 0.82 < r < 0.94) else None
        if p is toca or any(p is c for c in caidas) or p is barba:
            q = _local(p, Pm[None, :])[0] if p is not barba else (0.0, Pm[1], 0.0)
            return ('lapis' if p is not barba else 'oro') if (q[1] + 40.0) % 2.8 < 1.2 else None
        return None
    return pr, retoque


# ===========================================================================
# EL GÓLEM DE HIELO (tundra): el coloso de esquirlas
# ===========================================================================
HIELO_MAT = {
    'hielo': tonos('#a8d9f1', 0.42, 0.5, brillo=True),
    'hielo_o': tonos('#6aa0cd', 0.35, 0.55),
    'nieve': tonos('#f4f8fc', 0.16, 0.3),
    'caramb': tonos('#d2f0fb', 0.36, 0.45, brillo=True),
    'nucleo': emite('#7fe2ff'),
    'nucleo2': emite('#f2feff'),
    'ojo': emite('#e8fcff'),
}


def golem_hielo(accion, i):
    f, bob, paso, lean, golpe = pose(accion, i, lean=0.14)
    pr = []
    for sg in (1, -1):
        av = paso * 6.5 * sg
        alza = alza_pie(accion, f, sg)
        cad = (0.0, 25.0 + bob, 7.6 * sg)
        rod = (1.6 + av * 0.5, 14.0 + alza * 0.6, 8.6 * sg)
        tob = (av + 0.4, 5.4 + alza, 8.0 * sg)
        pr.append(prisma(cad, rod, 5.0, 'hielo_o', vuelta=0.5, extra=1.2))
        pr.append(prisma(rod, tob, 4.6, 'hielo_o', vuelta=0.5, extra=1.0))
        pr.append(roca((av + 1.6, 2.8 + alza, 8.0 * sg), (6.4, 2.8, 5.2), 'hielo', bisel=0.72, arista=0.84))
    pr.append(roca((0.0, 27.0 + bob, 0.0), (7.2, 4.6, 10.4), 'hielo_o', bisel=0.74, arista=0.86))
    tor = (3.0 + (6 if golpe else 0), 44.0 + bob - (5 if golpe else 0), 0.0)
    R = giro_z(-lean)
    # El pecho: dos prismas fundidos que dejan una arista en el centro.
    for sg in (1, -1):
        pr.append(roca(en(tor, R, 0.0, 0.0, 4.6 * sg), (10.6, 12.6, 9.4), 'hielo',
                       rot=R @ giro_x(-0.24 * sg), bisel=0.7, arista=0.82))
    # El núcleo: un diamante que asoma por delante.
    nucleo = roca(en(tor, R, 10.4, 2.0, 0.0), (2.6, 4.2, 4.2), 'nucleo', rot=R @ giro_x(math.pi / 4),
                  bisel=0.9, arista=0.95)
    pr.append(nucleo)
    # La cabeza angulosa, con su visera de luz y su corona de tres esquirlas.
    cab = en(tor, R, 7.0, 14.8, 0.0)
    pr.append(roca(cab, (4.6, 4.2, 4.6), 'hielo', bisel=0.72, arista=0.84))
    pr.append(roca(suma(cab, (4.4, 0.2, 0.0)), (0.6, 0.7, 3.2), 'ojo', bisel=0.95, arista=0.97))
    for dz, alto, inc in ((0.0, 8.0, -1.6), (2.8, 5.6, -1.0), (-2.8, 5.6, -1.0)):
        b = suma(cab, (-0.6, 3.0, dz))
        pr.append(cono(b, suma(b, (inc, alto, dz * 0.3)), 1.5, 0.25, 'caramb'))
    # Hombros con sus carámbanos enormes (la silueta erizada).
    for sg in (1, -1):
        hombro = en(tor, R, -1.0, 8.0, 17.0 * sg)
        pr.append(roca(hombro, (6.6, 6.2, 6.2), 'hielo', bisel=0.72, arista=0.84))
        for (dx, dy, dz), (tx, ty, tz), ra in (((-1.0, 4.0, 0.0), (-4.5, 17.0, 4.0), 3.2),
                                               ((-3.5, 3.0, -2.0), (-9.0, 12.0, 0.5), 2.6),
                                               ((1.6, 3.0, 2.6), (2.4, 10.0, 7.5), 2.1)):
            b = suma(hombro, (dx, dy, dz * sg))
            pr.append(cono(b, suma(b, (tx, ty, tz * sg)), ra, 0.3, 'caramb'))
        codo, puno = brazos_golpe(accion, i, paso, bob, ((4.0, 33.0, 20.0), (6.0, 18.0, 20.5)))
        codo, puno = lado(codo, sg), lado(puno, sg)
        pr.append(prisma(hombro, codo, 3.8, 'hielo_o', vuelta=0.5))
        pr.append(prisma(codo, puno, 4.6, 'hielo', vuelta=0.5, extra=1.0))
        d = np.subtract(puno, codo)
        u = d / max(np.linalg.norm(d), 1e-9)
        pr.append(roca(tuple(np.add(puno, u * 2.0)), (5.4, 5.4, 5.4), 'hielo', rot=marco(d) @ giro_x(math.pi / 4),
                       bisel=0.74, arista=0.86))
        # Dos carámbanos que cuelgan del antebrazo (siempre hacia el suelo).
        for t, largo in ((0.35, 5.5), (0.62, 4.2)):
            b = medio(codo, puno, t)
            b = (b[0], b[1] - 3.2, b[2])
            pr.append(cono(b, (b[0], b[1] - largo, b[2]), 1.3, 0.2, 'caramb'))

    def retoque(p, Pm, nm, nw):
        if p is nucleo:
            return brillo_central(p, nw, 'nucleo', 'nucleo2', 0.8)
        if p['mat'] in ('hielo', 'hielo_o') and nw[1] > 0.74:
            return 'nieve'                            # la nieve, en todo lo que mira arriba
        return None
    return pr, retoque


# ===========================================================================
# EL GÓLEM DE CRISTAL (caverna): la geoda que anda sobre los nudillos
# ===========================================================================
CRISTAL_MAT = {
    'roca': tonos('#645c74', 0.32, 0.58),
    'roca_o': tonos('#48415a', 0.28, 0.58),
    'cristal': tonos('#b892ff', 0.45, 0.5, brillo=True),
    'luz': emite('#e6d4ff'),
    'luz2': emite('#ffffff'),
    'ojo': emite('#f6e8ff'),
}


def _cristal(pr, puntas, base, punta, ancho, vuelta=0.0):
    """Un cristal: prisma facetado y su punta, que brilla."""
    base = np.asarray(base, float)
    punta = np.asarray(punta, float)
    cuello = base + (punta - base) * 0.66
    pr.append(prisma(tuple(base), tuple(cuello), ancho, 'cristal', bisel=0.7, arista=0.8, vuelta=vuelta + 0.4))
    c = cono(tuple(cuello - (punta - base) * 0.04), tuple(punta), ancho * 1.08, 0.25, 'cristal')
    pr.append(c)
    puntas.append(c)


def golem_cristal(accion, i):
    f, bob, paso, lean, golpe = pose(accion, i, lean=0.6, lean_ataque=(-0.18, -0.3, 0.86))
    pr = []
    puntas = []
    tor = (2.0 + (6 if golpe else 0), 31.0 + bob + (10 if accion == 'ataque' and not golpe else 0) - (3 if golpe else 0), 0.0)
    R = giro_z(-lean)
    # Piernas cortas y gruesas.
    for sg in (1, -1):
        av = paso * 5.0 * sg
        alza = alza_pie(accion, f, sg, 2.6)
        cad = (-5.5, 20.0 + bob, 8.0 * sg)
        rod = (-3.0 + av * 0.5, 11.5 + alza * 0.6, 10.0 * sg)
        tob = (-5.0 + av, 4.4 + alza, 9.0 * sg)
        pr.append(cono(cad, rod, 4.8, 4.4, 'roca_o'))
        pr.append(cono(rod, tob, 4.4, 4.0, 'roca_o'))
        pr.append(roca((-3.6 + av, 2.6 + alza, 9.0 * sg), (5.4, 2.6, 4.8), 'roca'))
    pr.append(roca((-4.0, 22.0 + bob, 0.0), (6.0, 4.6, 10.0), 'roca_o'))
    # El cuerpo: un peñasco encorvado y la joroba.
    pr.append(roca(tor, (11.6, 10.6, 14.6), 'roca', rot=R, bisel=0.72, arista=0.84))
    pr.append(elip(en(tor, R, -4.0, 6.0, 0.0), (9.0, 7.6, 11.6), 'roca', rot=R))
    # La cabeza, hundida entre los hombros, con su cuerno de cristal.
    cab = en(tor, R, 12.6, 6.0, 0.0)
    pr.append(roca(cab, (4.8, 4.2, 5.0), 'roca', bisel=0.76, arista=0.88))
    pr.append(roca(suma(cab, (2.6, -3.2, 0.0)), (2.8, 1.6, 3.8), 'roca_o'))
    for sg in (1, -1):
        pr.append(elip(suma(cab, (4.5, 0.8, 2.1 * sg)), (0.9, 1.2, 1.3), 'ojo'))
    _cristal(pr, puntas, suma(cab, (0.0, 3.4, 0.0)), suma(cab, (3.0, 10.0, 0.0)), 1.5)
    # El bosque de cristales de la espalda (las puntas brillan).
    for (dx, dy, dz), largo, ancho, inc in (((-3.0, 9.0, 0.0), 20.0, 3.2, -0.32), ((-1.0, 8.4, -6.4), 15.0, 2.7, -0.2),
                                            ((-1.6, 8.6, 6.4), 16.0, 2.8, -0.24), ((-6.6, 7.0, -3.4), 12.0, 2.4, -0.5),
                                            ((-6.0, 7.2, 3.8), 13.0, 2.4, -0.46), ((3.4, 9.0, 0.0), 10.0, 2.2, 0.0)):
        b = en(tor, R, dx, dy, dz)
        _cristal(pr, puntas, b, suma(b, (largo * inc, largo, dz * 0.16)), ancho, vuelta=dz * 0.05)
    # Brazos enormes: anda sobre los nudillos.
    for sg in (1, -1):
        hombro = en(tor, R, 4.0, 7.0, 14.6 * sg)
        pr.append(roca(hombro, (6.4, 6.0, 6.0), 'roca', bisel=0.76, arista=0.88))
        ff = f + (math.pi if sg > 0 else 0.0)
        if accion == 'ataque':
            codo = {1: (6, 50, 19), 2: (3, 56, 18), 3: (20, 22, 18)}[i]
            puno = {1: (8, 64, 12), 2: (2, 71, 11), 3: (27, 6, 10)}[i]
        else:
            alzam = max(0.0, math.cos(ff)) * 3.2 if accion == 'camina' else 0.0
            sw = math.sin(ff) * 6.0 if accion == 'camina' else 0.0
            codo = (hombro[0] + 3.0 + sw * 0.4, 18.0 + bob * 0.5 + alzam * 0.5, 18.0)
            puno = (hombro[0] + 6.0 + sw, 5.0 + alzam, 16.0)
        codo, puno = lado(codo, sg), lado(puno, sg)
        pr.append(cono(hombro, codo, 5.0, 4.6, 'roca_o'))
        pr.append(cono(codo, puno, 5.0, 6.6, 'roca'))
        pr.append(roca(puno, (6.2, 4.8, 6.4), 'roca_o', bisel=0.74, arista=0.86))
        for t, largo, ancho in ((0.3, 11.0, 2.6), (0.62, 8.6, 2.2)):
            b = medio(codo, puno, t)
            b = (b[0] - 1.0, b[1] + 2.0, b[2] + 3.0 * sg)
            _cristal(pr, puntas, b, (b[0] - largo * 0.5, b[1] + largo * 0.8, b[2] + largo * 0.4 * sg), ancho)

    def retoque(p, Pm, nm, nw):
        if any(p is c for c in puntas):
            h = a_lo_largo(p, Pm)
            if h > 0.72:
                return 'luz2'
            return 'luz' if h > 0.36 else None
        return None
    return pr, retoque


# ===========================================================================
# EL GÓLEM DE ZARZA (pradera): troncos, raíces, cornamenta y dos flores
# ===========================================================================
ZARZA_MAT = {
    'corteza': tonos('#80603e', 0.3, 0.56),
    'corteza_o': tonos('#58412a', 0.28, 0.55),
    'musgo': tonos('#64a23c', 0.32, 0.55),
    'hoja': tonos('#8cc650', 0.32, 0.5),
    'flor': tonos('#f08cb4', 0.26, 0.45),
    'flor_c': tonos('#ffe07a', 0.2, 0.4),
    'ojo': emite('#dcff8a'),
}


def golem_musgo(accion, i):
    f, bob, paso, lean, golpe = pose(accion, i, lean=0.12)
    pr = []
    # Piernas de tronco con tres raíces por pie.
    for sg in (1, -1):
        av = paso * 6.0 * sg
        alza = alza_pie(accion, f, sg)
        cad = (0.0, 23.0 + bob, 6.8 * sg)
        rod = (1.6 + av * 0.5, 12.5 + alza * 0.6, 8.0 * sg)
        tob = (av + 0.4, 4.6 + alza, 7.8 * sg)
        pr.append(cono(cad, rod, 4.2, 3.8, 'corteza'))
        pr.append(cono(rod, tob, 3.8, 3.4, 'corteza'))
        for (tx, tz) in ((6.8, 0.6), (0.6, 4.8), (-5.0, -1.2)):
            pr.append(cono((av + 0.4, 4.0 + alza, 7.8 * sg), (av + tx, 1.0 + alza * 0.4, (7.8 + tz) * sg),
                           2.4, 0.8, 'corteza_o'))
    pr.append(elip((0.0, 25.0 + bob, 0.0), (6.6, 4.6, 9.2), 'corteza'))
    tor = (2.0 + (5 if golpe else 0), 37.0 + bob - (4 if golpe else 0), 0.0)
    R = giro_z(-lean)
    # El pecho: un tocón con sus estrías, musgo arriba y una enredadera en
    # bandolera.
    tocon = cono(en(tor, R, 0.0, -9.0, 0.0), en(tor, R, 0.0, 8.0, 0.0), 10.0, 11.4, 'corteza')
    pr.append(tocon)
    enreda = cono(en(tor, R, 4.0, 10.4, 10.6), en(tor, R, 9.6, -8.0, -9.0), 1.4, 1.4, 'hoja')
    pr.append(enreda)
    # La cabeza: un nudo de madera con su gorro de musgo, la frente y la
    # cornamenta de ramas.
    cab = en(tor, R, 4.0, 18.4, 0.0)
    pr.append(cono(en(tor, R, 1.0, 14.0, 0.0), cab, 3.6, 3.2, 'corteza_o'))
    pr.append(elip(cab, (5.0, 5.2, 5.0), 'corteza'))
    pr.append(elip(suma(cab, (-0.9, 2.9, 0.0)), (5.3, 2.6, 5.5), 'musgo'))
    pr.append(roca(suma(cab, (3.8, 1.2, 0.0)), (1.4, 1.0, 4.2), 'corteza_o'))
    for sg in (1, -1):
        pr.append(elip(suma(cab, (4.2, -0.6, 1.9 * sg)), (0.8, 1.1, 1.1), 'ojo'))
    hojas = []
    for sg in (1, -1):
        r0 = suma(cab, (-1.0, 3.6, 3.0 * sg))
        r1 = suma(cab, (-4.0, 13.0, 8.6 * sg))
        r2 = suma(cab, (-9.0, 17.6, 11.6 * sg))
        rm = medio(r0, r1, 0.55)
        pr.append(cono(r0, r1, 2.0, 1.4, 'corteza_o'))
        pr.append(cono(r1, r2, 1.4, 0.5, 'corteza_o'))
        pr.append(cono(rm, suma(rm, (2.8, 7.0, 0.8 * sg)), 1.3, 0.5, 'corteza_o'))
        hojas.append(elip(suma(r1, (-0.6, 1.6, 0.8 * sg)), (3.6, 1.4, 2.8), 'hoja', rot=giro_z(0.4)))
    # Hombros, brazos de rama y dedos de ramita.
    for sg in (1, -1):
        hombro = en(tor, R, -0.6, 8.6, 12.4 * sg)
        pr.append(elip(hombro, (4.6, 4.2, 4.6), 'corteza'))
        hojas.append(elip(suma(hombro, (-0.6, 3.6, 0.4 * sg)), (4.0, 1.3, 3.2), 'hoja', rot=giro_z(0.2)))
        codo, puno = brazos_golpe(accion, i, paso, bob, ((4.0, 28.0, 16.6), (7.6, 14.0, 16.0)))
        codo, puno = lado(codo, sg), lado(puno, sg)
        pr.append(cono(hombro, codo, 3.2, 2.8, 'corteza'))
        pr.append(elip(codo, (3.2, 3.2, 3.2), 'corteza_o'))
        pr.append(cono(codo, puno, 2.8, 2.4, 'corteza'))
        d = np.subtract(puno, codo)
        u = d / max(np.linalg.norm(d), 1e-9)
        lat = marco(d)[:, 2]
        for k in (-1, 0, 1):
            b = np.add(puno, lat * 1.2 * k)
            pr.append(cono(tuple(b), tuple(b + u * 5.4 + lat * 1.6 * k), 1.2, 0.4, 'corteza_o'))
    pr += hojas
    # Dos flores: en el hombro que se ve y en el musgo de la cabeza.
    flores = []
    for c, r in ((en(tor, R, -0.6, 13.6, 12.0), 3.2), (suma(cab, (-2.4, 5.4, -2.6)), 2.6)):
        flores.append(elip(c, (r, 0.7, r), 'flor'))
        pr.append(elip(suma(c, (0.0, 0.5, 0.0)), (r * 0.38, 0.6, r * 0.38), 'flor_c'))
    pr += flores

    def retoque(p, Pm, nm, nw):
        if p is tocon:
            if nw[1] > 0.6:
                return 'musgo'                        # el musgo, encima del tocón
            q = (Pm - np.array(tor)) @ R
            a = math.atan2(q[2], q[0]) / (2 * math.pi)
            return 'corteza_o' if (a * 9.0 + q[1] * 0.035) % 1.0 < 0.2 else None   # las estrías
        if p['mat'] == 'corteza' and nw[1] > 0.78:
            return 'musgo'
        return None
    return pr, retoque


# ===========================================================================
# EL GÓLEM DE MAGMA (volcán): el volcán que anda
# ===========================================================================
GOLEM_MAGMA_MAT = {
    'basalto': tonos('#40363a', 0.42, 0.55, brillo=True),
    'basalto_o': tonos('#282124', 0.3, 0.5),
    'ceniza': tonos('#74686c', 0.3, 0.5),
    'cuerno': tonos('#5a4a44', 0.3, 0.5),
    'magma': emite('#ff7a22'),
    'magma2': emite('#ffc85a'),
    'ojo': emite('#fff0a0'),
}


def golem_magma(accion, i):
    f, bob, paso, lean, golpe = pose(accion, i, lean=0.2, lean_ataque=(0.05, -0.1, 0.46))
    pr = []
    fundido = []
    for sg in (1, -1):
        av = paso * 6.0 * sg
        alza = alza_pie(accion, f, sg)
        cad = (0.0, 22.0 + bob, 8.2 * sg)
        rod = (2.0 + av * 0.5, 12.6 + alza * 0.6, 9.2 * sg)
        tob = (av + 0.4, 5.2 + alza, 8.6 * sg)
        pr.append(cono(cad, rod, 5.6, 5.2, 'basalto_o'))
        pr.append(elip(rod, (5.9, 1.9, 5.9), 'magma', rot=marco(np.subtract(rod, cad), (1.0, 0.0, 0.0))))
        pr.append(cono(rod, tob, 5.2, 5.0, 'basalto'))
        pr.append(roca((av + 2.0, 3.0 + alza, 8.6 * sg), (7.2, 3.2, 6.0), 'basalto_o'))
    pr.append(roca((1.0, 25.0 + bob, 0.0), (8.6, 5.0, 11.6), 'basalto_o'))
    tor = (4.0 + (6 if golpe else 0), 42.0 + bob - (5 if golpe else 0), 0.0)
    R = giro_z(-lean)
    # El núcleo fundido y, encima, las placas: el magma asoma por las juntas.
    nucleo = elip(en(tor, R, 0.4, -1.0, 0.0), (10.8, 12.6, 14.0), 'magma', rot=R)
    pr.append(nucleo)
    for sg in (1, -1):
        pr.append(roca(en(tor, R, 1.0, 3.4, 7.1 * sg), (10.8, 8.8, 6.1), 'basalto', rot=R, bisel=0.8, arista=0.88))
    pr.append(roca(en(tor, R, 1.6, -10.6, 0.0), (8.8, 3.4, 10.8), 'basalto', rot=R))
    # El cráter de la espalda, con su lava y dos regueros.
    b0, b1 = en(tor, R, -8.4, 4.0, 0.0), en(tor, R, -11.4, 14.0, 0.0)
    pr.append(cono(b0, b1, 7.6, 4.6, 'basalto_o'))
    eje = np.subtract(b1, b0)
    eje = eje / np.linalg.norm(eje)
    lava = elip(tuple(np.add(b1, eje * 3.9)), (1.3, 3.8, 3.8), 'magma2', rot=marco(eje, (1.0, 0.0, 0.0)))
    pr.append(lava)
    for dz in (-2.2, 2.6):
        a = tuple(np.add(b1, eje * 3.2) + np.array((1.6, 0.0, dz)))
        pr.append(cono(a, (a[0] + 2.6, a[1] - 6.0, a[2] * 1.3), 0.9, 0.7, 'magma'))
    # La cabeza: pequeña, cornuda, con la boca encendida.
    cab = en(tor, R, 10.6, 9.6, 0.0)
    pr.append(roca(cab, (5.4, 4.8, 5.6), 'basalto'))
    pr.append(roca(suma(cab, (5.0, -2.2, 0.0)), (0.6, 0.6, 2.8), 'magma', bisel=0.95, arista=0.97))
    for sg in (1, -1):
        pr.append(elip(suma(cab, (5.1, 1.0, 2.3 * sg)), (0.9, 1.1, 1.2), 'ojo'))
        h0 = suma(cab, (0.8, 3.4, 3.4 * sg))
        h1 = suma(cab, (-2.4, 8.4, 6.6 * sg))
        pr.append(cono(h0, h1, 1.7, 1.1, 'cuerno'))
        pr.append(cono(h1, suma(cab, (-6.6, 9.6, 7.6 * sg)), 1.1, 0.3, 'cuerno'))
    # Hombros de peñasco, codos al rojo y puños fundidos que gotean.
    for sg in (1, -1):
        hombro = en(tor, R, -1.0, 6.4, 18.0 * sg)
        pr.append(elip(hombro, (7.2, 6.6, 6.8), 'basalto'))
        pr.append(elip(suma(hombro, (-1.4, 4.6, 1.6 * sg)), (3.8, 3.0, 3.6), 'basalto'))
        codo, puno = brazos_golpe(accion, i, paso, bob, ((4.0, 29.0, 22.0), (6.0, 14.0, 22.0)))
        codo, puno = lado(codo, sg), lado(puno, sg)
        d = np.subtract(puno, codo)
        u = d / max(np.linalg.norm(d), 1e-9)
        pr.append(cono(hombro, codo, 5.6, 5.0, 'basalto_o'))
        pr.append(elip(codo, (5.4, 5.4, 5.4), 'magma'))
        pr.append(cono(codo, tuple(np.subtract(puno, u * 4.0)), 5.0, 5.6, 'basalto'))
        pr.append(elip(tuple(np.subtract(puno, u * 4.2)), (1.6, 6.0, 6.0), 'basalto_o', rot=marco(d)))
        fuego = elip(puno, (6.2, 6.0, 6.2), 'magma')
        fundido.append(fuego)
        pr.append(fuego)
        if accion != 'ataque':
            pr.append(cono((puno[0], puno[1] - 4.8, puno[2]), (puno[0] + 0.4, puno[1] - 9.0, puno[2]), 1.4, 0.5, 'magma'))

    def retoque(p, Pm, nm, nw):
        if any(p is q for q in fundido) or p is nucleo:
            return brillo_central(p, nw, 'magma', 'magma2', 0.8)
        if p['mat'] in ('basalto', 'basalto_o') and nw[1] > 0.8:
            return 'ceniza'                           # la ceniza, en lo de arriba
        return None
    return pr, retoque


# ===========================================================================
# LAS TABLAS
# ===========================================================================
# Los del mapa salvaje y sus mapas vecinos, en el formato de
# gf_bestias3d.BESTIAS3D: tipo -> (modelo, materiales, ancho, alto, contorno, tamaño).
BESTIAS3D = {
    'golem_cripta': (golem_cripta, CRIPTA_MAT, 130, 150, contorno_de(hex_rgb('#5c606c')), 1.3),
    'golem_arena': (golem_arena, ARENA_MAT, 140, 150, contorno_de(hex_rgb('#a07448')), 1.3),
    'golem_hielo': (golem_hielo, HIELO_MAT, 140, 158, contorno_de(hex_rgb('#3f6f9c')), 1.3),
    'golem_cristal': (golem_cristal, CRISTAL_MAT, 140, 146, contorno_de(hex_rgb('#3c3550')), 1.3),
    'golem_musgo': (golem_musgo, ZARZA_MAT, 136, 158, contorno_de(hex_rgb('#4a3620')), 1.3),
}
# Su perfil se fotografía girado hacia quien mira (enseña la cara y el pecho):
# como el centinela y el gólem de magma de los reinos.
ANGULO_LADO = {t: 0.55 for t in BESTIAS3D}
# El del volcán, en el formato de gf_reinos_bestias.BESTIAS (con el ángulo).
GOLEM_MAGMA = (golem_magma, GOLEM_MAGMA_MAT, 136, 150, (18, 14, 16), 1.3, 0.55)
