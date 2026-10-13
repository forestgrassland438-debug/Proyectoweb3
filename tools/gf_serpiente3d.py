# -*- coding: utf-8 -*-
"""
=============================================================================
LA SERPIENTE DE MAGMA EN 2.5D                                    (2026-10-12)
=============================================================================

"La serpiente de la mina no es 2.5D y no tiene gráficos altamente detallados."

Antes: una cabeza y un anillo dibujados de perfil que el juego GIRABA hacia
donde iba. Al girar un dibujo plano gira también su luz (de cara a la
izquierda la sombra quedaba arriba) y de frente seguía viéndose de lado.

AHORA es un MODELO 3D (tools/gf_bestias3d.py: la misma cámara, la misma luz
y el mismo contorno que el lobo o el gólem) fotografiado en DIECISÉIS
direcciones. El juego elige la foto de la dirección en la que va y solo gira
lo que falta hasta su ángulo (como mucho 11 grados): la luz siempre arriba a
la izquierda, y de frente se le ve la cara.

  · CABEZA: cráneo de obsidiana con su placa, hocico en cuña, cejas en
    cresta con los ojos de brasa debajo, dos cuernos hacia atrás y uno
    pequeño a cada lado, la mandíbula (que se abre: garganta encendida y
    cuatro colmillos) y una línea de magma por la boca y los costados.
  · ANILLO: un segmento acorazado con su escudo en el lomo, una púa hacia
    atrás y la línea de magma de los costados (la misma de la cabeza: de
    lado se ve correr por todo el cuerpo). La tripa, al rojo.
  · MONTÍCULO: la tierra que levanta al cavar, con tres piedras.

SIN MOTAS (tripofobia): bandas lisas y líneas; nada de puntos, poros ni
racimos. Sin reflejo especular (dieciséis anillos con un punto blanco cada
uno serían una fila de puntos).

Cada foto lleva su centro (el del cráneo o el del anillo) en el centro del
cuadro: en el juego, origen (0.5, 0.5) y ya.

USO: lo llama tools/generar-monstruos.py (serpiente_frames()).
=============================================================================
"""

import math

import numpy as np

from gf_arte import Lienzo, rampa, hex_rgb, contorno_de
from gf_bestias3d import elip, cono, roca, fotografiar, INCLINA

DIRECCIONES = 16

SERP_MAT = {
    'piel': {'tonos': rampa(hex_rgb('#5c3652'), 5, arriba=0.4, abajo=0.62)},
    'piel2': {'tonos': rampa(hex_rgb('#4a2c40'), 5, arriba=0.36, abajo=0.62)},
    'placa': {'tonos': rampa(hex_rgb('#3c2536'), 5, arriba=0.36, abajo=0.55)},
    'cuerno': {'tonos': rampa(hex_rgb('#8c6c6c'), 5, arriba=0.3, abajo=0.55)},
    'colmillo': {'tonos': rampa(hex_rgb('#f2e6c8'), 5, arriba=0.12, abajo=0.4)},
    'magma': {'emite': hex_rgb('#ff8a3a')},
    'tripa': {'emite': hex_rgb('#d8561e')},
    'garganta': {'emite': hex_rgb('#ffc45a')},
    'ojo': {'emite': hex_rgb('#ffd27a')},
    'tierra': {'tonos': rampa(hex_rgb('#6e5236'), 5, arriba=0.34, abajo=0.58)},
    'piedra': {'tonos': rampa(hex_rgb('#7d7468'), 5, arriba=0.3, abajo=0.58)},
}
CONTORNO = contorno_de(hex_rgb('#4a2c40'))

# El centro (alto del modelo) que va en el centro del cuadro.
Y_CABEZA, Y_ANILLO = 9.0, 8.0
CABEZA_W = CABEZA_H = 50
ANILLO_W = ANILLO_H = 30


def _suelo(H, y):
    """Las filas bajo el punto de apoyo para que (0, y, 0) caiga en el centro."""
    return H / 2.0 - y * math.cos(INCLINA)


def cabeza(abierta):
    Y = Y_CABEZA
    pr = []
    cuello = elip((-10.0, Y - 1.0, 0.0), (7.5, 5.6, 6.6), 'piel')
    craneo = elip((-1.0, Y + 0.5, 0.0), (10.5, 6.0, 8.0), 'piel')
    hocico = cono((4.0, Y + 0.5, 0.0), (15.5, Y - 0.6, 0.0), 5.6, 3.2, 'piel')
    pr += [cuello, craneo, hocico]
    # La placa del cráneo: un escudo alargado sobre la frente.
    pr.append(elip((-3.0, Y + 5.3, 0.0), (7.0, 1.6, 2.6), 'placa'))
    for sg in (1, -1):
        # Cejas en cresta, con el ojo de brasa debajo (una rendija, no un punto).
        pr.append(cono((-4.0, Y + 5.0, 4.2 * sg), (6.0, Y + 3.6, 3.9 * sg), 2.0, 1.2, 'placa'))
        pr.append(elip((4.6, Y + 2.5, 4.7 * sg), (2.2, 0.9, 1.0), 'ojo'))
        # Dos cuernos hacia atrás y uno pequeño a cada lado de la quijada.
        pr.append(cono((-6.0, Y + 4.5, 4.5 * sg), (-15.5, Y + 9.0, 7.2 * sg), 2.4, 0.5, 'cuerno'))
        pr.append(cono((-3.0, Y + 0.5, 7.0 * sg), (-10.0, Y + 1.5, 10.0 * sg), 1.5, 0.4, 'cuerno'))
    # La mandíbula: cuelga de la bisagra; abierta, baja 24 grados.
    ang = math.radians(24.0) if abierta else 0.0
    bis = (-5.0, Y - 2.6, 0.0)
    L = 18.5
    punta = (bis[0] + L * math.cos(ang), bis[1] - L * math.sin(ang), 0.0)
    pr.append(cono(bis, punta, 5.0, 2.6, 'piel2'))
    if abierta:
        # La garganta encendida entre las dos mandíbulas, y cuatro colmillos.
        pr.append(elip((4.0, Y - 3.4, 0.0), (9.5, 2.6, 4.2), 'garganta'))
        for sg in (1, -1):
            pr.append(cono((12.6, Y - 2.0, 2.3 * sg), (12.2, Y - 5.4, 2.1 * sg), 0.95, 0.2, 'colmillo'))
            pr.append(cono((punta[0] - 2.6, punta[1] + 1.6, 1.8 * sg), (punta[0] - 3.0, punta[1] + 4.4, 1.7 * sg), 0.85, 0.2, 'colmillo'))
    else:
        # La boca cerrada: una línea de brasa entre el hocico y la mandíbula.
        pr.append(elip((5.0, Y - 2.3, 0.0), (10.5, 0.75, 5.1), 'magma'))

    def retoque(p, Pm, nm, nw):
        # La línea de magma de los costados (sigue por los anillos).
        if p is cuello and abs(Pm[1] - (Y - 2.0)) < 1.2 and abs(nm[2]) > 0.5:
            return 'magma'
        return None
    return pr, retoque


def anillo():
    Y = Y_ANILLO
    cuerpo = elip((0.0, Y, 0.0), (9.0, 6.6, 8.2), 'piel')
    pr = [cuerpo,
          # El escudo del lomo (una losa ancha) y su púa, baja y hacia atrás.
          elip((-0.5, Y + 4.6, 0.0), (7.6, 2.4, 5.4), 'placa'),
          cono((0.5, Y + 6.2, 0.0), (-4.6, Y + 9.6, 0.0), 1.9, 0.3, 'cuerno')]

    def retoque(p, Pm, nm, nw):
        # La línea de magma de los costados: una banda lisa, sin motas.
        if p is cuerpo and abs(Pm[1] - (Y - 1.8)) < 1.3 and abs(nm[2]) > 0.5:
            return 'magma'
        return None
    return pr, retoque


def monticulo():
    pr = [elip((0.0, 0.0, 0.0), (13.0, 6.4, 7.5), 'tierra'),
          elip((-6.5, 0.0, 2.5), (5.5, 4.0, 4.5), 'tierra'),
          roca((3.5, 4.0, 1.5), (2.6, 2.0, 2.2), 'piedra'),
          roca((-3.0, 3.6, -2.5), (2.0, 1.6, 1.8), 'piedra'),
          roca((8.5, 2.2, -1.0), (1.8, 1.4, 1.6), 'piedra')]
    # Lo de bajo el suelo, fuera (la tierra asoma; no es una bola).
    for p in pr[:2]:
        p['corte'] = {'c': np.zeros(3), 'n': np.array([0.0, -1.0, 0.0]), 'o': 0.0}
    return pr, None


def centrar(li, W, H):
    """El fotograma en un cuadro W x H, centrado (en el atlas todas las celdas
    son iguales y se alinean abajo: así el centro del anillo es el del cuadro)."""
    out = Lienzo(W, H)
    ox, oy = (W - li.w) // 2, (H - li.h) // 2
    for y in range(li.h):
        for x in range(li.w):
            out.px[(y + oy) * W + x + ox] = li.px[y * li.w + x]
    return out


def angulo(i):
    return i * 2 * math.pi / DIRECCIONES


def serpiente_frames():
    """Todos los fotogramas: 'cabeza_<i>', 'abierta_<i>', 'anillo_<i>' (i = 0..15,
    i * 22.5 grados desde la derecha, hacia abajo) y 'monticulo'."""
    out = {}
    for i in range(DIRECCIONES):
        a = angulo(i)
        for nombre, abierta in (('cabeza', False), ('abierta', True)):
            prims, ret = cabeza(abierta)
            out['%s_%d' % (nombre, i)] = fotografiar(prims, CABEZA_W, CABEZA_H, a, SERP_MAT, ret, CONTORNO,
                                                     suelo=_suelo(CABEZA_H, Y_CABEZA), salto=2.5)
    for i in range(DIRECCIONES):
        prims, ret = anillo()
        out['anillo_%d' % i] = centrar(fotografiar(prims, ANILLO_W, ANILLO_H, angulo(i), SERP_MAT, ret, CONTORNO,
                                                   suelo=_suelo(ANILLO_H, Y_ANILLO), salto=2.5), CABEZA_W, CABEZA_H)
    return out


def monticulo_frame():
    prims, ret = monticulo()
    return fotografiar(prims, 36, 22, 0.35, SERP_MAT, ret, contorno_de(hex_rgb('#8a6a4a')), suelo=6)
