#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
LOS CAMELLOS DEL DESIERTO — escribe Game/Sprites/camello3d/      (2026-10-19)
=============================================================================

"En el mapa del desierto deben haber camellos." Dromedarios (una joroba) en
3D, con el mismo renderizador que los animales (gf_bestias3d: elipsoides y
conos redondeados, luz arriba a la izquierda en bandas lisas). Dos pelajes:

  · camello        el salvaje, pardo arena;
  · camello_manta  el de caravana: manta roja con una franja y dos alforjas.

Poses (frames):  camina 4 · quieto 2 · come 2 · echado 2 (de lado).
Vistas:          de lado ('<esp>_<pose>_<n>.png'), de frente ('_abajo_') y de
                 espaldas ('_arriba_'); el echado solo de lado.

El cuadro es de 72 x 66 con los pies a 4 filas del borde de abajo; el juego
lo pone a escala 2 (un camello algo más alto que el personaje, como debe).
Nada de motas ni puntos: el pelo es liso, la franja de la manta es UNA banda.

Lo lee gf-camellos.js. Determinista: volver a ejecutarlo da los mismos bytes.

USO:  python tools/generar-camellos.py
=============================================================================
"""
import math
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from gf_bestias3d import elip, cono, fotografiar  # noqa: E402
from gf_arte import rampa, hex_rgb, contorno_de  # noqa: E402

RAIZ = os.path.dirname(AQUI)
SALIDA = os.path.join(RAIZ, 'Game', 'Sprites', 'camello3d')
W, H, SUELO = 72, 66, 4
POSES = {'camina': 4, 'quieto': 2, 'come': 2, 'echado': 2}
CUATRO_LADOS = ('camina', 'quieto', 'come')
ACORTA = 0.58


def tonos(hexa, arriba=0.3, abajo=0.55):
    return rampa(hex_rgb(hexa), 5, arriba=arriba, abajo=abajo)


def materiales(manta):
    m = {
        'pelo': {'tonos': tonos('#c8955a', 0.24, 0.5)},
        'claro': {'tonos': tonos('#e6c996', 0.12, 0.38)},
        'oscuro': {'tonos': tonos('#7a5434', 0.2, 0.45)},
        'hocico': {'tonos': tonos('#a77a4c', 0.2, 0.45)},
        'pata': {'tonos': tonos('#5c4430', 0.2, 0.45)},
        'ojo': {'emite': hex_rgb('#1d1410')},
    }
    if manta:
        m['manta'] = {'tonos': tonos('#b8322c', 0.22, 0.5)}
        m['franja'] = {'tonos': tonos('#f0c24a', 0.15, 0.4)}
        m['cuero'] = {'tonos': tonos('#7a4a26', 0.2, 0.45)}
        m['cuerda'] = {'tonos': tonos('#d9c08a', 0.15, 0.4)}
    return m


def camello(manta, accion, i):
    pr = []
    anda = accion == 'camina'
    come = accion == 'come'
    echado = accion == 'echado'
    f = (i - 1) / 4.0 * math.pi * 2 if anda else 0.0
    # Respira (quieto/echado) o cabecea al andar.
    bob = (0.5 if i == 2 else 0.0) if accion in ('quieto', 'echado') else (abs(math.sin(f)) * 0.8 if anda else 0.0)
    baja = 20.0 if echado else 0.0           # echado, el cuerpo casi en el suelo
    cy = 33.0 - baja + bob
    # El tronco: la grupa, el vientre y el pecho; encima, la joroba.
    cuerpo = [elip((0, cy, 0), (15.5, 7.6, 7.2), 'pelo'),
              elip((-11.5, cy + 0.6, 0), (6.4, 7.2, 6.8), 'pelo'),
              elip((10.0, cy - 0.6, 0), (7.0, 8.0, 6.8), 'pelo')]
    pr += cuerpo
    joroba = elip((-1.0, cy + 7.6, 0), (8.2, 6.8, 5.8), 'pelo')
    pr.append(joroba)
    if manta:
        # La manta cae por los dos lados de la joroba; la franja, una banda.
        pr.append(elip((-0.5, cy + 4.6, 0), (9.6, 5.4, 7.7), 'manta'))
        pr.append(elip((-0.5, cy + 1.4, 0), (9.9, 1.3, 7.95), 'franja'))
        for sg in (1, -1):
            # Las alforjas a los lados, con su correa.
            pr.append(elip((-6.5, cy - 2.0, 8.6 * sg), (3.6, 3.8, 1.9), 'cuero'))
            pr.append(cono((-6.5, cy + 3.0, 7.4 * sg), (-6.5, cy - 0.4, 8.8 * sg), 0.5, 0.5, 'cuerda'))
    # El cuello: hacia delante y abajo, y luego arriba (la curva del camello).
    if come:
        cuello = [cono((13, cy + 1, 0), (21, cy - 10, 0), 4.2, 3.2, 'pelo'),
                  cono((21, cy - 10, 0), (25, 7.5 + (0.6 if i == 2 else 0.0), 0), 3.2, 2.7, 'pelo')]
        hx, hy = 28.0, 5.5 + (0.6 if i == 2 else 0.0)
    elif echado:
        cuello = [cono((12, cy + 1, 0), (19, cy + 3, 0), 4.0, 3.3, 'pelo'),
                  cono((19, cy + 3, 0), (22, cy + 14, 0), 3.3, 2.8, 'pelo')]
        hx, hy = 24.5, cy + 16.0
    else:
        cab = math.sin(f) * 0.8 if anda else 0.0
        cuello = [cono((13, cy + 1, 0), (20.5, cy + 3 + cab * 0.4, 0), 4.4, 3.5, 'pelo'),
                  cono((20.5, cy + 3 + cab * 0.4, 0), (23.5, cy + 14.5 + cab, 0), 3.5, 2.9, 'pelo')]
        hx, hy = 26.0, cy + 16.5 + cab
    pr += cuello
    cabeza = elip((hx, hy, 0), (4.6, 3.2, 2.9), 'pelo')
    pr.append(cabeza)
    pr.append(elip((hx + 4.0, hy - 0.9, 0), (2.7, 2.3, 2.4), 'hocico'))
    pr.append(elip((hx + 5.2, hy - 2.1, 0), (1.6, 0.6, 1.6), 'oscuro'))       # la boca
    for sg in (1, -1):
        pr.append(cono((hx - 2.4, hy + 2.0, 1.9 * sg), (hx - 3.0, hy + 4.0, 2.4 * sg), 0.9, 0.35, 'pelo'))
        pr.append(elip((hx + 1.0, hy + 1.0, 2.5 * sg), (0.7, 0.6, 0.45), 'ojo'))
        # La ceja: el camello mira entornado.
        pr.append(elip((hx + 0.9, hy + 1.8, 2.45 * sg), (1.1, 0.35, 0.4), 'oscuro'))
    if manta:
        # El ronzal: UNA cuerda del hocico a la nuca.
        pr.append(cono((hx + 3.4, hy - 0.4, 0), (hx - 2.6, hy + 1.2, 0), 0.45, 0.45, 'cuerda'))
    # Las patas: largas, con rodilla. El camello anda "de lado" (mueve a la
    # vez las dos patas del mismo costado).
    for delante, x0 in ((True, 10.5), (False, -12.0)):
        for sg in (1, -1):
            z = 4.6 * sg
            if echado:
                # Dobladas bajo el cuerpo: solo asoman las rodillas.
                pr.append(elip((x0 + (3 if delante else -2), 3.2, z * 1.15), (5.2, 2.6, 2.2), 'pelo'))
                pr.append(elip((x0 + (6.5 if delante else 1.5), 2.0, z * 1.2), (2.4, 1.6, 2.0), 'pata'))
                continue
            fase = f + (0 if sg > 0 else math.pi)
            sw = math.sin(fase) * 4.0 if anda else 0.0
            alza = max(0.0, math.cos(fase)) * 2.2 if anda else 0.0
            cadera = (x0, cy - 4.0, z)
            rodilla = (x0 + sw * 0.55, 15.0 + alza * 0.6, z)
            pie = (x0 + sw, 1.8 + alza, z)
            pr.append(cono(cadera, rodilla, 3.4 if not delante else 3.0, 1.9, 'pelo'))
            pr.append(elip(rodilla, (2.0, 1.9, 1.9), 'claro'))
            pr.append(cono(rodilla, pie, 1.8, 1.5, 'pelo'))
            pr.append(elip((pie[0] + 0.7, pie[1] - 0.4, z), (2.8, 1.2, 2.5), 'pata'))
    # La cola, colgando, con su mechón oscuro.
    vaiven = (1.0 if i == 2 else -0.5) if accion == 'quieto' else math.sin(f) * 0.9
    pr.append(cono((-17.5, cy + 2.0, 0), (-19.2, cy - 9.0, vaiven), 1.0, 0.7, 'pelo'))
    pr.append(elip((-19.4, cy - 10.4, vaiven), (1.2, 2.2, 1.2), 'oscuro'))

    def retoque(p, Pm, nm, nw):
        # La tripa y el pecho, más claros (la luz rebota en la arena).
        if (p is cabeza or any(p is q for q in cuerpo) or any(p is q for q in cuello)) and nm[1] < -0.4:
            return 'claro'
        if p is joroba and nm[1] > 0.75:
            return 'oscuro' if not manta else None
        return None
    return pr, retoque


def foto(especie, accion, i, vista='lado'):
    manta = especie == 'camello_manta'
    mats = materiales(manta)
    prims, retoque = camello(manta, accion, i)
    cont = contorno_de(mats['pelo']['tonos'][2])
    if vista == 'lado':
        return fotografiar(prims, W, H, 'lado', mats, retoque, cont, suelo=SUELO, salto=2.0)
    camara = 'frente' if vista == 'abajo' else 'espalda'
    return fotografiar(prims, W, H, camara, mats, retoque, cont, suelo=SUELO, salto=2.0, fx=ACORTA)


def main():
    os.makedirs(SALIDA, exist_ok=True)
    hechas = []
    for esp in ('camello', 'camello_manta'):
        for pose, n in POSES.items():
            for i in range(1, n + 1):
                d = os.path.join(SALIDA, '%s_%s_%d.png' % (esp, pose, i))
                foto(esp, pose, i).guardar(d)
                hechas.append(d)
                if pose in CUATRO_LADOS:
                    for vista in ('abajo', 'arriba'):
                        d = os.path.join(SALIDA, '%s_%s_%s_%d.png' % (esp, pose, vista, i))
                        foto(esp, pose, i, vista).guardar(d)
                        hechas.append(d)
    print('  fotos: %d' % len(hechas))
    try:
        from gf_arte import hoja_contacto
        h = hoja_contacto(hechas, columnas=10, escala=3)
        if h:
            h.save(os.path.join(SALIDA, '_hoja_camellos.png'))
    except Exception as e:  # la hoja es solo para revisar
        print('  (sin hoja de contacto: %s)' % e)
    print('listo ->', SALIDA)


if __name__ == '__main__':
    main()
