#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
LOS JEFES DE CADA MAPA EN 2.5D — escribe Game/Sprites/monstruos/jefe_*  (2026-10-20)
=============================================================================

"Haz 1 jefe monstruo con gráficos detallados altísimos para cada mapa, en
2.5D, con poderes de altos gráficos y sus sonidos."

Cada jefe es una de las bestias 3D (tools/gf_bestias3d.py: la misma cámara,
la misma luz en bandas y el mismo contorno) MÁS GRANDE y con piezas suyas:

  · jefe_golem      el mapa salvaje   "The Mossback Titan": gólem de roca
                    musgosa con cristales verdes que le brotan del lomo y de
                    los hombros, y las runas verdes.
  · jefe_arana      el cementerio     "The Bone Widow": araña negra con
                    púas de hueso en el abdomen y la franja de alma verde.
  · jefe_escorpion  el desierto       "The Sand Emperor": escorpión de
                    caparazón dorado con su corona de cinco puntas y la gema.
  · jefe_lobo       la tundra         "Frostfang, the Pack King": lobo de
                    escarcha con una cresta de púas de hielo por el lomo.

Las mismas poses que su bestia (camina 4, ataque 3, quieto 2) en las tres
vistas (de lado, de frente, de espaldas), con su punto de apoyo en el atlas.
Sin motas: bandas lisas, cristales y púas en cono.

USO:  python tools/generar-jefes.py [jefe_golem ...]
=============================================================================
"""
import importlib.util
import os
import sys

import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import gf_bestias3d as B  # noqa: E402
from gf_arte import rampa, hex_rgb, contorno_de  # noqa: E402

_spec = importlib.util.spec_from_file_location('gf_generar_monstruos', os.path.join(AQUI, 'generar-monstruos.py'))
GM = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(GM)


def tonos(hexa, arriba=0.32, abajo=0.58):
    return rampa(hex_rgb(hexa), 5, arriba=arriba, abajo=abajo)


def _v(p):
    return np.array(p, float)


# ── EL TITÁN MUSGOSO (mapa salvaje) ─────────────────────────────────────────
GOLEM_REY_MAT = {
    'piedra': {'tonos': tonos('#7d7768', 0.3, 0.58)},
    'piedra_o': {'tonos': tonos('#5f5a4e', 0.28, 0.6)},
    'musgo': {'tonos': tonos('#4f8a3a', 0.32, 0.55)},
    'runa': {'emite': hex_rgb('#7dffb0')},
    'runa2': {'emite': hex_rgb('#e6fff0')},
    'ojo': {'emite': hex_rgb('#a8ffcf')},
    'cristal': {'tonos': tonos('#5fe0a0', 0.45, 0.5), 'brillo': True},
}


def golem_rey(accion, i):
    pr, ret = B.golem(accion, i)
    torso = pr[5]
    c = torso['c']
    # Cristales del lomo y los hombros: conos que salen hacia arriba y atrás.
    for dx, dy, dz, alto, ra in ((-8, 9, 7, 15, 3.4), (-9, 8, -7, 13, 3.2), (-4, 12, 2, 18, 3.8),
                                 (-11, 4, 0, 11, 2.8), (-1, 7, 16, 10, 2.6), (-1, 7, -16, 10, 2.6)):
        base = c + _v((dx, dy, dz))
        punta = base + _v((-alto * 0.3, alto, dz * 0.12))
        pr.append(B.cono(base, punta, ra, 0.35, 'cristal'))
    return pr, ret


# ── LA VIUDA DE HUESO (cementerio) ──────────────────────────────────────────
ARANA_REINA_MAT = {
    'cuerpo': {'tonos': tonos('#2e2a33', 0.34, 0.6), 'brillo': True},
    'pata': {'tonos': tonos('#3a3540', 0.3, 0.58)},
    'espina': {'tonos': tonos('#efe6cf', 0.18, 0.45)},
    'franja': {'emite': hex_rgb('#7dffb0')},
    'colmillo': {'tonos': tonos('#efe6cf', 0.12, 0.4)},
    'ojo': {'emite': hex_rgb('#7dffb8')},
    'hueso': {'tonos': tonos('#e8dfc8', 0.2, 0.45)},
}


def arana_reina(accion, i):
    pr, ret = B.arana(accion, i)
    ab = pr[0]['c']
    for x in (-6.5, -2.0, 2.5):
        for z in (-4.2, 4.2):
            base = ab + _v((x, 6.6 - abs(x) * 0.08, z))
            punta = base + _v((-2.4, 6.5 + (1.2 if x == -2.0 else 0.0), z * 0.35))
            pr.append(B.cono(base, punta, 1.6, 0.18, 'hueso'))
    pr.append(B.cono(ab + _v((-11, 5, 0)), ab + _v((-15.5, 10, 0)), 1.8, 0.2, 'hueso'))
    return pr, ret


# ── EL EMPERADOR DE LA ARENA (desierto) ─────────────────────────────────────
ESCORPION_REY_MAT = {
    'placa': {'tonos': tonos('#c9962e', 0.36, 0.58), 'brillo': True},
    'placa_osc': {'tonos': tonos('#8a5a1e', 0.3, 0.55)},
    'pata': {'tonos': tonos('#a8742a', 0.3, 0.58)},
    'aguijon': {'tonos': tonos('#3a2414', 0.3, 0.45)},
    'ojo': {'emite': hex_rgb('#ff5a3a')},
    'veneno': {'emite': hex_rgb('#b6ff5a')},
    'oro': {'tonos': tonos('#ffd25a', 0.4, 0.5), 'brillo': True},
    'gema': {'emite': hex_rgb('#ff3a5a')},
}


def escorpion_rey(accion, i):
    pr, ret = B.escorpion(accion, i)
    c = pr[0]['c']
    for z in (-4.0, -2.0, 0.0, 2.0, 4.0):
        base = c + _v((3.0, 3.6, z))
        punta = base + _v((-0.6, 4.2 if z == 0.0 else (3.4 if abs(z) == 2.0 else 2.6), z * 0.1))
        pr.append(B.cono(base, punta, 1.15, 0.15, 'oro'))
    pr.append(B.elip(c + _v((4.2, 3.7, 0)), (1.6, 0.6, 3.6), 'oro'))       # el aro de la corona
    pr.append(B.elip(c + _v((5.6, 4.1, 0)), (0.9, 0.9, 0.9), 'gema'))
    return pr, ret


# ── COLMILLO HELADO, REY DE LA MANADA (tundra) ──────────────────────────────
LOBO_REY_MAT = dict(B.LOBO_ESCARCHA_MAT)
LOBO_REY_MAT.update({
    'ojo': {'emite': hex_rgb('#5fd8ff')},
    'hielo': {'tonos': tonos('#bfefff', 0.42, 0.5), 'brillo': True},
})


def lobo_rey(accion, i):
    pr, ret = B.lobo(accion, i)
    cuerpo = pr[0]['c']
    for k, x in enumerate((-10.0, -5.5, -1.0, 3.5, 8.0)):
        base = cuerpo + _v((x, 6.8, 0))
        alto = 5.5 + (2.5 if k in (1, 2, 3) else 0.0)
        pr.append(B.cono(base, base + _v((-3.0, alto, 0)), 2.2, 0.2, 'hielo'))
        for sg in (1, -1):
            lado = cuerpo + _v((x + 1, 5.2, 4.2 * sg))
            pr.append(B.cono(lado, lado + _v((-2.2, 3.6, 2.0 * sg)), 1.3, 0.15, 'hielo'))
    return pr, ret


JEFES = {
    # nombre: (modelo, materiales, ancho, alto, contorno, tamaño)
    'jefe_golem': (golem_rey, GOLEM_REY_MAT, 124, 160, contorno_de(hex_rgb('#5f5a4e')), 1.45),
    'jefe_arana': (arana_reina, ARANA_REINA_MAT, 124, 104, hex_rgb('#0d0b10'), 1.75),
    'jefe_escorpion': (escorpion_rey, ESCORPION_REY_MAT, 128, 100, contorno_de(hex_rgb('#8a5a1e')), 1.65),
    'jefe_lobo': (lobo_rey, LOBO_REY_MAT, 112, 100, hex_rgb('#1a2236'), 1.6),
}


def frames(nombre):
    modelo, mats, W, H, cont, k = JEFES[nombre]
    out = {}
    for vista, suf in B.VISTAS:
        for acc, n in B.ACCIONES:
            for i in range(1, n + 1):
                prims, retoque = modelo(acc, i)
                out['%s%s_%d' % (acc, suf, i)] = B.fotografiar(prims, W, H, vista, mats, retoque, cont, k)
    return out


def pivote(nombre):
    _m, _mats, W, H, _c, _k = JEFES[nombre]
    return 0.5, (H - B.SUELO + 3) / float(H)


def main():
    nombres = sys.argv[1:] or list(JEFES)
    hojas = []
    for n in nombres:
        print('  jefe', n, '…')
        hojas.append(GM.atlas(n, frames(n), columnas=9, pivote_=pivote(n)))
    print('listo')


if __name__ == '__main__':
    main()
