#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
GENERAR MONSTRUOS — el arte de todos los enemigos, en PNG        (2026-10-11)
=============================================================================

"Quiero que todos los enemigos o monstruos sean imágenes, no código:
imágenes detalladas en pixel art respetando los gráficos del juego. Por
ejemplo, los fantasmas no tienen brazos pero el personaje principal sí, y eso
no es respetar los gráficos del juego."

Antes, los zombis se repintaban en el navegador (con un tramado de puntos en
el pelo y agujeros en la ropa), y los fantasmas, los magos y la serpiente se
dibujaban con rectángulos y degradados. Ahora TODO sale de aquí, en PNG, y el
juego solo los carga.

DE DÓNDE SALE CADA UNO (nada se inventa si el juego ya lo tiene):

  · HUMANOIDES — zombis, su jefe, el fantasma y la bruja de la mina, la
    bruja de la tormenta del mapa salvaje: sobre los fotogramas reales de los
    personajes Soulbound, con pelo y ropa nuevos y relieve 2.5D:
    tools/gf_humanoides2d.py + tools/gf_relieve.py. (Se probaron en 3D y el
    usuario los rechazó: no se adaptaban a los gráficos y eran muy grandes.)

  · EL LOBO SOMBRÍO, LA ARAÑA DE ESPINAS y EL GÓLEM DE PIEDRA (2026-10-11):
    modelos 3D pequeños fotografiados en tres vistas (perfil, frente y
    espalda) con la luz y el contorno del juego: tools/gf_bestias3d.py.

  · LA SERPIENTE DE MAGMA (2026-10-12): modelo 3D (cabeza, boca abierta y
    anillo) fotografiado en 16 direcciones, y su montículo de tierra:
    tools/gf_serpiente3d.py. El juego elige la foto de la dirección en vez
    de girar un dibujo plano (que giraba también su luz).

  · LOS PROYECTILES (bola de fuego, roca, espina, savia, rayo, orbe) y las
    piezas del terreno de la serpiente (montículo, agujero, grieta).

SIN MOTAS (el dueño del juego tiene tripofobia): nada de tramados, puntos,
agujeros repetidos ni racimos. Las texturas son bandas lisas y líneas.

SALIDA (Game/Sprites/monstruos/):
  <tipo>.png + <tipo>.json   atlas de Phaser (JSON Hash), un fotograma por
                             nombre: '<dir>_<n>' o '<accion>_<n>'
  serpiente.png + .json      la serpiente: 'cabeza_<i>', 'abierta_<i>' y
                             'anillo_<i>' (i = 0..15, 22,5 grados cada una)
  serpiente/*.png            el terreno de la serpiente (montículo, agujero, grieta)
  efectos/*.png              proyectiles
  _hoja_monstruos.png        hoja de contacto para REVISAR (no se carga)

Determinista: volver a ejecutarlo escribe los mismos bytes.

USO:  python tools/generar-monstruos.py
=============================================================================
"""

import json
import math
import os
import sys

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from gf_arte import (Mascara, Lienzo, rampa, contorno_de, hex_rgb,  # noqa: E402
                     hoja_contacto)
from gf_bestias3d import bestia_frames, pivote  # noqa: E402
from gf_serpiente3d import serpiente_frames, monticulo_frame  # noqa: E402
import gf_humanoides2d as H2  # noqa: E402
from gf_relieve import relieve_lienzo  # noqa: E402

RAIZ = os.path.dirname(AQUI)
SALIDA = os.path.join(RAIZ, 'Game', 'Sprites', 'monstruos')


# ===========================================================================
# UTILIDADES
# ===========================================================================


# ===========================================================================
# LAS BESTIAS (lobo, araña, gólem): ver tools/gf_bestias3d.py (2026-10-11).
# Antes eran dibujos de perfil hechos aquí; ahora son modelos 3D pequeños
# fotografiados en tres vistas con la luz y el contorno del juego.
# ===========================================================================

# ===========================================================================
# DIBUJO PROPIO: las rampas de color con la luz arriba a la izquierda
# ===========================================================================

def tonos(hexa, n=4, **kw):
    return rampa(hex_rgb(hexa), n, **kw)


# ===========================================================================
# PROYECTILES Y TERRENO
# ===========================================================================

# (2026-10-12) "Poderes y efectos de alto detalle": los proyectiles van al
# DOBLE de resolución (el juego los pone a la mitad de escala, así que salen
# del mismo tamaño con el doble de detalle). La roca, la espina, el orbe y el
# charco de savia son 3D (gf_bestias3d); la bola de fuego y el rayo, bandas
# de luz con su halo. Nada de chispas sueltas ni partículas.

def efecto_bola_fuego():
    """La bola de fuego: núcleo casi blanco, bandas de llama y halo."""
    W = 30
    li = Lienzo(W, W)
    c = (W - 1) / 2.0
    t = [hex_rgb('#fffbe6'), hex_rgb('#ffe68a'), hex_rgb('#ffb23e'), hex_rgb('#ff7a2a'), hex_rgb('#d8461c')]
    for x, y in Mascara(W, W).disco(c, c, 11.6).puntos():
        # El centro de la luz, algo arriba a la izquierda: la bola es redonda.
        d = math.hypot(x - (c - 1.6), y - (c - 1.6))
        k = 0 if d < 3.2 else 1 if d < 5.6 else 2 if d < 8.0 else 3 if d < 10.2 else 4
        li.set(x, y, t[k])
    # Una lengua de llama en espiral (UNA banda, lisa).
    for a in range(0, 200, 6):
        r = math.radians(a)
        rr = 4.0 + a / 200.0 * 6.0
        li.set(c + math.cos(r) * rr, c + math.sin(r) * rr, t[1])
    li.contornear(color=hex_rgb('#5a1608'), diagonales=False)
    return li


def efecto_orbe(base, borde):
    """El orbe del mago: núcleo encendido, bandas de luz y UN reflejo."""
    W = 26
    li = Lienzo(W, W)
    c = (W - 1) / 2.0
    t = [mezcla_hex(base, '#ffffff', 0.75), mezcla_hex(base, '#ffffff', 0.4), hex_rgb(base),
         mezcla_hex(base, '#2a0a3a', 0.35), mezcla_hex(base, '#2a0a3a', 0.6)]
    for x, y in Mascara(W, W).disco(c, c, 10.0).puntos():
        d = math.hypot(x - c, y - c)
        k = 0 if d < 2.6 else 1 if d < 4.8 else 2 if d < 7.0 else 3 if d < 8.8 else 4
        li.set(x, y, t[k])
    for x, y in Mascara(W, W).elipse(c - 4.0, c - 4.4, 2.2, 1.2).puntos():
        li.set(x, y, hex_rgb('#ffffff'))
    li.contornear(color=hex_rgb(borde), diagonales=False)
    return li


def efecto_roca():
    """La roca del gólem: un peñasco facetado (los planos dan el volumen)."""
    from gf_bestias3d import roca, fotografiar, giro_z
    mats = {'piedra': {'tonos': tonos('#8f877a', 5, arriba=0.32, abajo=0.58)},
            'musgo': {'tonos': tonos('#6f9640', 5, arriba=0.3, abajo=0.55)}}
    p = roca((0, 8, 0), (8.6, 7.6, 7.8), 'piedra', rot=giro_z(0.35), bisel=0.62, arista=0.74)

    def retoque(q, Pm, nm, nw):
        return 'musgo' if nw[1] > 0.7 else None
    return fotografiar([p], 42, 38, 'frente', mats, retoque, contorno_de(hex_rgb('#8f877a')), k=2, suelo=3, salto=99)


def efecto_espina():
    """La espina de la araña: una púa de hueso, apuntando a la derecha."""
    from gf_bestias3d import cono, fotografiar
    mats = {'hueso': {'tonos': tonos('#ddd1a6', 5, arriba=0.18, abajo=0.5)}}
    prims = [cono((-7.0, 3.0, 0), (7.6, 3.0, 0), 1.9, 0.15, 'hueso')]
    return fotografiar(prims, 34, 14, 'lado', mats, None, contorno_de(hex_rgb('#4f4630')), k=2, suelo=3, salto=99)


def efecto_savia():
    """Un charco de savia: liso y brillante (UN reflejo), sin burbujas."""
    from gf_bestias3d import elip, fotografiar
    mats = {'savia': {'tonos': tonos('#b9862c', 5, arriba=0.3, abajo=0.5), 'brillo': True}}
    mats['reflejo'] = {'tonos': tonos('#ffe9a8', 5, arriba=0.1, abajo=0.2)}
    prims = [elip((0, 0.4, 0), (19.5, 1.6, 9.0), 'savia'), elip((-9, 0.5, 2.5), (9, 1.4, 5.5), 'savia'),
             elip((10, 0.5, -1.5), (9.5, 1.4, 5.5), 'savia'),
             elip((-3, 1.75, -2.5), (7.0, 0.35, 1.0), 'reflejo')]
    return fotografiar(prims, 88, 36, 'lado', mats, None, contorno_de(hex_rgb('#b9862c')), k=2, suelo=8, salto=99)


def efecto_rayo():
    """El rayo: un trazo quebrado con su halo en tres capas, vertical."""
    W, H = 44, 192
    li = Lienzo(W, H)
    xs = [22, 16, 26, 18, 28, 20, 25, 17, 23, 19, 24, 21, 22]
    puntos = [(xs[k], int(k * (H - 1) / (len(xs) - 1))) for k in range(len(xs))]
    capas = ((9, hex_rgb('#2f7ec8')), (6, hex_rgb('#5fc8ff')), (3, hex_rgb('#c8f4ff')), (1, hex_rgb('#ffffff')))
    for grosor, color in capas:
        m = Mascara(W, H)
        for (x0, y0), (x1, y1) in zip(puntos, puntos[1:]):
            m.unir(Mascara(W, H).linea(x0, y0, x1, y1, grosor))
        li.pintar(m, color)
    # Una rama que se abre a media altura (una sola).
    for grosor, color in capas[1:]:
        m = Mascara(W, H)
        m.linea(puntos[5][0], puntos[5][1], 36, puntos[5][1] + 26, max(1, grosor - 2))
        li.pintar(m, color)
    return li


def mezcla_hex(a, b, t):
    ca, cb = hex_rgb(a), hex_rgb(b)
    return tuple(int(round(ca[i] + (cb[i] - ca[i]) * t)) for i in range(3))


def efecto_agujero():
    W, H = 36, 18
    li = Lienzo(W, H)
    borde = tonos('#5e4632', 3)
    for x, y in Mascara(W, H).elipse(18, 9, 16, 7.5).puntos():
        d = math.hypot((x - 18) / 16.0, (y - 9) / 7.5)
        li.set(x, y, hex_rgb('#120c0a') if d < 0.62 else (borde[2] if y < 9 else borde[0]) if d < 0.85 else borde[1])
    li.contornear(color=hex_rgb('#1d1410'), diagonales=False)
    return li


def efecto_grieta():
    W, H = 56, 12
    li = Lienzo(W, H)
    pts = [(2, 6), (11, 4), (19, 7), (28, 3), (37, 7), (46, 4), (54, 6)]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        for x, y in Mascara(W, H).linea(x0, y0, x1, y1, 2).puntos():
            li.set(x, y, hex_rgb('#1a120e'))
        for x, y in Mascara(W, H).linea(x0, y0, x1, y1, 1).puntos():
            li.set(x, y, hex_rgb('#ff7a2a') if 1 < x < W - 3 else hex_rgb('#1a120e'))
    return li


def efecto_cartel():
    """El cartel de los caminos del mapa salvaje: poste y tabla de madera."""
    W, H = 30, 30
    li = Lienzo(W, H)
    total = Mascara(W, H)
    madera = tonos('#9a6b3c', 4, arriba=0.3, abajo=0.45)
    poste = Mascara(W, H).rect(13, 12, 16, 29)
    for x, y in poste.puntos():
        li.set(x, y, madera[1] if x < 15 else madera[3])
    total.unir(poste)
    tabla = Mascara(W, H).rect(1, 2, 28, 14)
    for x, y in tabla.puntos():
        k = 0 if y <= 4 else (1 if y <= 10 else 2)
        li.set(x, y, madera[k])
    for y in (6, 10):                                  # las juntas de las dos tablas
        for x in range(2, 28):
            li.set(x, y, madera[3])
    total.unir(tabla)
    li.contornear(color=contorno_de(hex_rgb('#9a6b3c')), diagonales=False)
    return li


# ===========================================================================
# ATLAS
# ===========================================================================

def atlas(nombre, frames, columnas=None, sep=2, pivote_=None):
    """
    Junta los fotogramas en una sola imagen (una textura, una petición) y
    escribe su JSON Hash para `scene.load.atlas`. Todos van en celdas del
    mismo tamaño, con los PIES en la misma fila y el centro en la misma
    columna: al cambiar de fotograma no tiembla.
    """
    nombres = list(frames.keys())
    cw = max(frames[k].w for k in nombres)
    ch = max(frames[k].h for k in nombres)
    columnas = columnas or min(len(nombres), 7)
    filas = (len(nombres) + columnas - 1) // columnas
    hoja = Image.new('RGBA', (columnas * (cw + sep), filas * (ch + sep)), (0, 0, 0, 0))
    datos = {'frames': {}, 'meta': {'app': 'tools/generar-monstruos.py', 'image': nombre + '.png',
                                     'format': 'RGBA8888', 'scale': '1'}}
    for idx, k in enumerate(nombres):
        li = frames[k]
        x0 = (idx % columnas) * (cw + sep)
        y0 = (idx // columnas) * (ch + sep)
        ox = (cw - li.w) // 2
        oy = ch - li.h
        hoja.alpha_composite(li.imagen(), (x0 + ox, y0 + oy))
        datos['frames'][k] = {
            'frame': {'x': x0, 'y': y0, 'w': cw, 'h': ch},
            'rotated': False, 'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': cw, 'h': ch},
            'sourceSize': {'w': cw, 'h': ch}
        }
        if pivote_:
            # Phaser lo usa de origen en cada fotograma: los pies, en su sitio.
            datos['frames'][k]['pivot'] = {'x': pivote_[0], 'y': round(pivote_[1], 4)}
    datos['meta']['size'] = {'w': hoja.size[0], 'h': hoja.size[1]}
    os.makedirs(SALIDA, exist_ok=True)
    hoja.save(os.path.join(SALIDA, nombre + '.png'), 'PNG', optimize=True)
    with open(os.path.join(SALIDA, nombre + '.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(datos, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write('\n')
    print('  %-14s %3d fotogramas  celda %dx%d  hoja %dx%d' % (nombre, len(nombres), cw, ch, hoja.size[0], hoja.size[1]))
    return os.path.join(SALIDA, nombre + '.png')


def guardar(li, *partes):
    ruta = os.path.join(SALIDA, *partes)
    li.guardar(ruta)
    return ruta


# ===========================================================================
# MAIN
# ===========================================================================

def main():
    print('Monstruos ->', SALIDA)
    hojas = []
    # Los humanoides (2026-10-12): sobre el cuerpo de los personajes del juego
    # (tools/gf_humanoides2d.py), con pelo y ropa nuevos y el relieve 2.5D
    # horneado (tools/gf_relieve.py). "En 3D no se adaptaban a los gráficos
    # del juego y eran muy grandes."
    def con_relieve(frames):
        return {k: relieve_lienzo(li, 0.6) for k, li in frames.items()}
    for nombre, (per, piel, ropa, pelo, estilo) in sorted(H2.ZOMBIS.items()):
        semilla = sum(ord(ch) for ch in nombre)
        hojas.append(atlas(nombre, con_relieve(H2.frames_humanoide(per, H2.receta_zombi(piel, ropa, pelo, estilo=estilo, semilla=semilla)))))
    hojas.append(atlas('zombi_jefe', con_relieve(H2.frames_humanoide('personaje8', H2.receta_zombi(
        '#8f7c9c', '#3b2552', '#b3ab9d', jefe=True, estilo='melena', semilla=7)))))
    hojas.append(atlas('espectro', con_relieve(H2.frames_humanoide('personaje5', H2.RECETA_FANTASMA))))
    hojas.append(atlas('mago', con_relieve(H2.frames_humanoide('personaje13', H2.RECETA_MAGO))))
    hojas.append(atlas('brujo', con_relieve(H2.frames_humanoide('personaje13', H2.RECETA_BRUJO))))
    for tipo in ('lobo', 'arana', 'golem'):
        hojas.append(atlas(tipo, bestia_frames(tipo), columnas=9, pivote_=pivote(tipo)))
    # La serpiente (2026-10-12): 3D en 16 direcciones, y su terreno.
    hojas.append(atlas('serpiente', serpiente_frames(), columnas=16))
    sueltas = [
        guardar(monticulo_frame(), 'serpiente', 'monticulo.png'),
        guardar(efecto_agujero(), 'serpiente', 'agujero.png'),
        guardar(efecto_grieta(), 'serpiente', 'grieta.png'),
        guardar(efecto_bola_fuego(), 'efectos', 'bola_fuego.png'),
        guardar(efecto_orbe('#c891ff', '#3a1650'), 'efectos', 'orbe_mago.png'),
        guardar(efecto_roca(), 'efectos', 'roca.png'),
        guardar(efecto_espina(), 'efectos', 'espina.png'),
        guardar(efecto_savia(), 'efectos', 'savia.png'),
        guardar(efecto_rayo(), 'efectos', 'rayo.png'),
        guardar(efecto_cartel(), 'efectos', 'cartel.png'),
    ]
    print('  piezas sueltas:', len(sueltas))
    hoja = hoja_contacto(hojas + sueltas, columnas=4, escala=2)
    if hoja:
        hoja.save(os.path.join(SALIDA, '_hoja_monstruos.png'))
    print('listo')


if __name__ == '__main__':
    main()
