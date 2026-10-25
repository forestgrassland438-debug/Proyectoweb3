#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
LA FAUNA DE LOS MAPAS DE NIVEL 8, 9 Y 10 — Game/Sprites/fauna3d/  (2026-10-25)
=============================================================================

"Haz animales nuevos según esos 3 mapas." Modelos 3D pequeños (los mismos
elipsoides y conos de tools/gf_bestias3d.py, la misma cámara y la misma luz
en bandas lisas) fotografiados en tres vistas (de lado, de frente y de
espaldas) y en tres poses: andar (4), quieto (2) y comer o picotear (2).

  · GLACIAR   el pingüino (anda balanceándose), el zorro ártico y el reno.
  · CAVERNA   la salamandra de cueva (con UNA raya que brilla por el lomo),
              el escarabajo de roca y el cangrejo de la orilla del lago.
  · PRADERA   el ciervo, la oveja (lana en bandas, sin rizos en punto) y el
              conejo.

SIN MOTAS: manchas grandes, bandas y rayas; ni puntos, ni rizos, ni racimos.

Escribe por especie un atlas (<especie>.png + .json, fotogramas
'<pose>[_abajo|_arriba]_<n>' con su punto de apoyo) que carga gf-fauna-zonas.js,
y una hoja para revisar (_hoja_fauna3d.png, no se carga).

USO:  python tools/generar-fauna-zonas.py [especie ...]
=============================================================================
"""
import json
import math
import os
import sys

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from gf_bestias3d import elip, cono, roca, fotografiar, SUELO  # noqa: E402
from gf_arte import rampa, hex_rgb, contorno_de, hoja_contacto  # noqa: E402
import gf_animales3d as A  # noqa: E402

RAIZ = os.path.dirname(AQUI)
SALIDA = os.path.join(RAIZ, 'Game', 'Sprites', 'fauna3d')


def tonos(h, arriba=0.3, abajo=0.55):
    return rampa(hex_rgb(h), 5, arriba=arriba, abajo=abajo)


def fase(accion, i):
    if accion == 'camina':
        return (i - 1) / 4.0 * math.pi * 2, True
    return 0.0, False


# ── EL PINGÜINO ─────────────────────────────────────────────────────────────
PINGUINO_MAT = {
    'negro': {'tonos': tonos('#2a3040', 0.35, 0.45)},
    'blanco': {'tonos': tonos('#f2f4f6', 0.12, 0.3)},
    'pico': {'tonos': tonos('#f0a030', 0.25, 0.45)},
    'ojo': {'emite': hex_rgb('#14181e')},
}


def pinguino(accion, i):
    f, anda = fase(accion, i)
    vaiven = math.sin(f) * 0.18 if anda else 0.0
    come = accion == 'come'
    y0 = 0.4 if (accion == 'quieto' and i == 2) else 0.0
    inclina = 0.5 if come else 0.0
    cuerpo = elip((0, 10 + y0, 0), (5.2, 9.0, 5.0), 'negro')
    pr = [cuerpo]
    hx, hy = (3.5, 14 + y0) if come else (0.6, 20 + y0)
    pr.append(elip((hx, hy, 0), (3.6, 3.4, 3.4), 'negro'))
    pr.append(cono((hx + 2.6, hy - 0.6, 0), (hx + 5.6, hy - 1.4 - (0.6 if come and i == 2 else 0), 0), 1.0, 0.3, 'pico'))
    for sg in (1, -1):
        pr.append(elip((hx + 2.0, hy + 0.8, 2.2 * sg), (0.5, 0.55, 0.45), 'ojo'))
        aleta = (0.0, 13 + y0, 5.0 * sg)
        pr.append(cono(aleta, (-1.0 + vaiven * 6 * sg, 6 + y0, 6.4 * sg), 1.4, 0.7, 'negro'))
        paso_ = math.sin(f + (0 if sg > 0 else math.pi)) * 1.6 if anda else 0.0
        pr.append(elip((1.6 + paso_, 0.7, 2.4 * sg), (2.4, 0.8, 1.6), 'pico'))
    pr.append(cono((-4.5, 4 + y0, 0), (-7.0, 2.0, 0), 1.6, 0.6, 'negro'))

    def retoque(p, Pm, nm, nw):
        # La pechera blanca: todo lo que mira hacia delante.
        if p is cuerpo and nm[0] > 0.25:
            return 'blanco'
        return None
    return pr, retoque


# ── EL RENO Y EL CIERVO ─────────────────────────────────────────────────────
def ciervo_mat(base, claro, asta):
    return {
        'pelo': {'tonos': tonos(base, 0.3, 0.55)},
        'claro': {'tonos': tonos(claro, 0.12, 0.38)},
        'oscuro': {'tonos': tonos('#2a1c14', 0.2, 0.45)},
        'asta': {'tonos': tonos(asta, 0.25, 0.5)},
        'nariz': {'tonos': tonos('#1a1214', 0.2, 0.3)},
        'ojo': {'emite': hex_rgb('#1d1416')},
    }


def ciervo(accion, i, grande=False):
    f, anda = fase(accion, i)
    come = accion == 'come'
    k = 1.15 if grande else 1.0
    y0 = 0.35 if (accion == 'quieto' and i == 2) else 0.0
    pr = [elip((0, 17 * k + y0, 0), (11 * k, 5.6 * k, 5.0 * k), 'pelo'),
          elip((6 * k, 17.4 * k + y0, 0), (5.6 * k, 6.2 * k, 5.2 * k), 'pelo')]
    if come:
        hx, hy = 13 * k, 7 * k + (0.6 if i == 2 else 0.0)
        pr.append(cono((8 * k, 19 * k + y0, 0), (hx - 1.5, hy + 2, 0), 2.6 * k, 2.0 * k, 'pelo'))
    else:
        hx, hy = 11 * k, 28 * k + y0
        pr.append(cono((8 * k, 20 * k + y0, 0), (hx - 1, hy - 2, 0), 2.6 * k, 2.0 * k, 'pelo'))
    pr.append(elip((hx, hy, 0), (3.6 * k, 2.8 * k, 2.6 * k), 'pelo'))
    pr.append(cono((hx + 2, hy - 0.6, 0), (hx + 5.6 * k, hy - 1.6, 0), 1.7 * k, 1.1 * k, 'claro'))
    pr.append(elip((hx + 5.8 * k, hy - 1.6, 0), (0.8, 0.8, 0.9), 'nariz'))
    for sg in (1, -1):
        pr.append(elip((hx + 1.4, hy + 0.8, 2.1 * k * sg), (0.55, 0.55, 0.45), 'ojo'))
        pr.append(cono((hx - 1.2, hy + 1.6, 2.0 * sg), (hx - 3.4, hy + 3.2, 3.6 * k * sg), 0.9, 0.3, 'pelo'))
        # La cornamenta: un tronco y dos puntas por lado (líneas, no un racimo).
        b = (hx - 0.8, hy + 2.6, 1.4 * sg)
        t = (hx - 3.0, hy + 9.0 * k, 4.0 * k * sg)
        pr.append(cono(b, t, 0.8, 0.45, 'asta'))
        pr.append(cono((b[0] - 1.0, b[1] + 3.5 * k, b[2] + 1.0 * sg), (b[0] + 1.6, b[1] + 7.6 * k, b[2] + 1.6 * sg), 0.55, 0.3, 'asta'))
        pr.append(cono((t[0] + 0.4, t[1] - 1.6, t[2]), (t[0] - 2.4, t[1] + 2.0 * k, t[2] + 0.8 * sg), 0.5, 0.25, 'asta'))
    for delante, x0 in ((True, 6.5 * k), (False, -7.5 * k)):
        for sg in (1, -1):
            z = 3.2 * k * sg
            ff = f + (0 if (sg > 0) == delante else math.pi)
            sw = math.sin(ff) * 3.4 if anda else 0.0
            alza = max(0.0, math.cos(ff)) * 1.6 if anda else 0.0
            cad = (x0, 14 * k + y0, z)
            rod = (x0 + sw * 0.5 + (0 if delante else -1.4), 7 * k + alza * 0.5, z)
            pie = (x0 + sw, 1.0 + alza, z)
            pr.append(cono(cad, rod, 1.4 * k, 1.0 * k, 'pelo'))
            pr.append(cono(rod, pie, 1.0 * k, 0.8 * k, 'pelo'))
            pr.append(elip((pie[0] + 0.4, pie[1], z), (1.0 * k, 0.7, 0.9 * k), 'oscuro'))
    pr.append(cono((-10 * k, 18 * k + y0, 0), (-12.5 * k, 16 * k + y0, 0), 1.4, 0.8, 'claro'))

    def retoque(p, Pm, nm, nw):
        if p['mat'] == 'pelo' and nm[1] < -0.45:
            return 'claro'                         # la tripa y la garganta, claras
        return None
    return pr, retoque


# ── LA OVEJA ─────────────────────────────────────────────────────────────────
OVEJA_MAT = {
    'lana': {'tonos': tonos('#f0ece2', 0.18, 0.4)},
    'lana_o': {'tonos': tonos('#d8d0c0', 0.2, 0.45)},
    'cara': {'tonos': tonos('#3a3230', 0.25, 0.45)},
    'ojo': {'emite': hex_rgb('#e8d8a0')},
}


def oveja(accion, i):
    f, anda = fase(accion, i)
    come = accion == 'come'
    y0 = 0.3 if (accion == 'quieto' and i == 2) else 0.0
    lana = elip((0, 12 + y0, 0), (10, 7.4, 7.0), 'lana')
    pr = [lana]
    hx, hy = (11, 5.6 + (0.4 if i == 2 else 0.0)) if come else (10.5, 14 + y0)
    pr.append(elip((hx, hy, 0), (3.6, 3.0, 2.6), 'cara'))
    pr.append(elip((hx - 2.0, hy + 1.6, 0), (2.8, 2.0, 3.4), 'lana'))
    for sg in (1, -1):
        pr.append(elip((hx - 1.0, hy + 0.6, 3.2 * sg), (1.4, 0.6, 1.2), 'cara'))
        pr.append(elip((hx + 1.4, hy + 0.7, 1.9 * sg), (0.45, 0.45, 0.35), 'ojo'))
    for delante, x0 in ((True, 5.5), (False, -6.0)):
        for sg in (1, -1):
            ff = f + (0 if (sg > 0) == delante else math.pi)
            sw = math.sin(ff) * 2.4 if anda else 0.0
            alza = max(0.0, math.cos(ff)) * 1.2 if anda else 0.0
            pr.append(cono((x0, 7 + y0, 3.4 * sg), (x0 + sw, 0.8 + alza, 3.6 * sg), 1.0, 0.8, 'cara'))

    def retoque(p, Pm, nm, nw):
        # La lana en BANDAS que rodean el cuerpo (no rizos en punto).
        if p is lana and (Pm[0] % 4.0) < 0.9:
            return 'lana_o'
        return None
    return pr, retoque


# ── LA SALAMANDRA DE CUEVA ──────────────────────────────────────────────────
SALAMANDRA_MAT = {
    'piel': {'tonos': tonos('#3a3248', 0.3, 0.5)},
    'tripa': {'tonos': tonos('#6a5a78', 0.2, 0.45)},
    'raya': {'emite': hex_rgb('#7fffe6')},
    'ojo': {'emite': hex_rgb('#c8fff4')},
}


def salamandra(accion, i):
    f, anda = fase(accion, i)
    come = accion == 'come'
    ond = math.sin(f) * 1.6 if anda else 0.0
    cuerpo = elip((0, 3.0, ond * 0.3), (9, 2.6, 3.0), 'piel')
    pr = [cuerpo]
    hx = 10.5
    pr.append(elip((hx, 3.0 - (0.8 if come and i == 2 else 0), ond * 0.6), (3.4, 2.0, 2.6), 'piel'))
    for sg in (1, -1):
        pr.append(elip((hx + 1.2, 4.2, (ond * 0.6) + 1.6 * sg), (0.55, 0.5, 0.45), 'ojo'))
    pr.append(cono((-8, 3.0, -ond * 0.3), (-15, 2.0, -ond), 2.0, 0.6, 'piel'))
    pr.append(cono((-15, 2.0, -ond), (-20, 1.6, ond * 0.6), 0.6, 0.2, 'piel'))
    for delante, x0 in ((True, 5.0), (False, -5.0)):
        for sg in (1, -1):
            ff = f + (0 if (sg > 0) == delante else math.pi)
            sw = math.sin(ff) * 1.8 if anda else 0.0
            pr.append(cono((x0, 2.6, 2.4 * sg), (x0 + 1.5 + sw, 0.6, 5.0 * sg), 0.8, 0.6, 'piel'))

    def retoque(p, Pm, nm, nw):
        if p is cuerpo and abs(Pm[2] - ond * 0.3) < 0.7 and nw[1] > 0.5:
            return 'raya'                          # UNA raya que brilla por el lomo
        if p['mat'] == 'piel' and nm[1] < -0.4:
            return 'tripa'
        return None
    return pr, retoque


# ── EL ESCARABAJO DE ROCA ───────────────────────────────────────────────────
ESCARABAJO_MAT = {
    'caparazon': {'tonos': tonos('#4a4458', 0.4, 0.5), 'brillo': True},
    'pata': {'tonos': tonos('#2a2632', 0.25, 0.45)},
    'raya': {'emite': hex_rgb('#c79cff')},
}


def escarabajo(accion, i):
    f, anda = fase(accion, i)
    y0 = 0.3 if (accion == 'quieto' and i == 2) else 0.0
    cap = elip((0, 3.6 + y0, 0), (6.4, 3.4, 4.6), 'caparazon')
    pr = [cap, elip((6.0, 3.0 + y0 - (0.8 if accion == 'come' and i == 2 else 0), 0), (2.2, 1.8, 2.4), 'pata')]
    for k, x0 in enumerate((3.0, 0.0, -3.0)):
        for sg in (1, -1):
            ff = f + (0 if (k % 2 == 0) == (sg > 0) else math.pi)
            sw = math.sin(ff) * 1.4 if anda else 0.0
            pr.append(cono((x0, 2.6, 3.4 * sg), (x0 + sw + (1 if k == 0 else -1 if k == 2 else 0), 0.5, 6.0 * sg), 0.6, 0.4, 'pata'))
    for sg in (1, -1):
        pr.append(cono((7.4, 3.6, 1.0 * sg), (10.0, 5.6, 2.4 * sg), 0.4, 0.2, 'pata'))

    def retoque(p, Pm, nm, nw):
        if p is cap and abs(Pm[2]) < 0.5:
            return 'raya'                          # la juntura de las alas, encendida: UNA raya
        return None
    return pr, retoque


# ── EL CANGREJO DE LA CUEVA ─────────────────────────────────────────────────
CANGREJO_MAT = {
    'caparazon': {'tonos': tonos('#b4583a', 0.35, 0.5)},
    'pinza': {'tonos': tonos('#d07a50', 0.3, 0.5)},
    'pata': {'tonos': tonos('#8a3a26', 0.25, 0.45)},
    'ojo': {'emite': hex_rgb('#14100c')},
}


def cangrejo(accion, i):
    f, anda = fase(accion, i)
    come = accion == 'come'
    # El cangrejo anda de lado: el modelo mira a la cámara y se desplaza en x.
    cap = elip((0, 4.0, 0), (5.0, 2.8, 7.0), 'caparazon')
    pr = [cap]
    abre = 1.0 if (come and i == 2) else 0.0
    for sg in (1, -1):
        pr.append(cono((3.6, 4.4, 4.0 * sg), (6.6, 6.0, 7.0 * sg), 0.9, 0.7, 'pinza'))
        pr.append(elip((8.0, 6.6 + abre, 7.6 * sg), (2.4, 1.6, 1.8), 'pinza'))
        pr.append(cono((4.0, 5.6, 1.6 * sg), (4.6, 8.0, 1.8 * sg), 0.35, 0.3, 'pata'))
        pr.append(elip((4.7, 8.3, 1.8 * sg), (0.6, 0.6, 0.6), 'ojo'))
        for k, x0 in enumerate((1.5, -1.0, -3.5)):
            ff = f + (0 if (k % 2 == 0) == (sg > 0) else math.pi)
            sw = math.sin(ff) * 1.0 if anda else 0.0
            pr.append(cono((x0, 3.4, 5.6 * sg), (x0 - 1 + sw, 0.5, 10.5 * sg), 0.6, 0.4, 'pata'))
    return pr, None


# ── EL CATÁLOGO ─────────────────────────────────────────────────────────────
ESPECIES = {
    # especie: (modelo, materiales, ancho, alto, filas bajo el apoyo, acorta de frente)
    'pinguino': (pinguino, PINGUINO_MAT, 24, 30, 3, 1.0),
    'zorro_artico': (A.zorro, A.zorro_mat('#e8eef4', '#ffffff'), 44, 30, 2, 0.7),
    'reno': (lambda a, i: ciervo(a, i, True), ciervo_mat('#8a7058', '#efe6d6', '#d8c8a8'), 56, 56, 3, 0.62),
    'salamandra': (salamandra, SALAMANDRA_MAT, 46, 16, 2, 0.5),
    'escarabajo': (escarabajo, ESCARABAJO_MAT, 26, 16, 2, 0.8),
    'cangrejo': (cangrejo, CANGREJO_MAT, 34, 18, 2, 0.9),
    'ciervo': (ciervo, ciervo_mat('#9a6a3e', '#f2e6d0', '#c8b088'), 50, 50, 3, 0.62),
    'oveja': (oveja, OVEJA_MAT, 34, 26, 2, 0.75),
    'conejo': (A.conejo, A.CONEJO_MAT, 26, 20, 2, 0.8),
}
POSES = (('camina', 4), ('quieto', 2), ('come', 2))
VISTAS = (('lado', ''), ('abajo', '_abajo'), ('arriba', '_arriba'))


def fotos(especie):
    fn, mats, W, H, suelo, acorta = ESPECIES[especie]
    base = next(iter(mats.values()))
    cont = contorno_de(base['tonos'][2]) if 'tonos' in base else (20, 18, 16)
    out = {}
    for vista, suf in VISTAS:
        for pose, n in POSES:
            for i in range(1, n + 1):
                prims, ret = fn(pose, i)
                if vista == 'lado' and especie == 'cangrejo':
                    # El cangrejo anda DE LADO: cuando va a izquierda o derecha se le ve de frente.
                    li = fotografiar(prims, W, H, 'frente', mats, ret, cont, suelo=suelo, salto=2.0, fx=acorta)
                elif vista == 'lado':
                    li = fotografiar(prims, W, H, 'lado', mats, ret, cont, suelo=suelo, salto=2.0)
                else:
                    li = fotografiar(prims, W, H, 'frente' if vista == 'abajo' else 'espalda', mats, ret, cont,
                                     suelo=suelo, salto=2.0, fx=acorta)
                out['%s%s_%d' % (pose, suf, i)] = li
    return out, (0.5, round((H - suelo) / float(H), 4))


def atlas(nombre, frames, pivote, columnas=8, sep=2):
    nombres = list(frames)
    cw = max(frames[k].w for k in nombres)
    ch = max(frames[k].h for k in nombres)
    filas = (len(nombres) + columnas - 1) // columnas
    hoja = Image.new('RGBA', (columnas * (cw + sep), filas * (ch + sep)), (0, 0, 0, 0))
    datos = {'frames': {}, 'meta': {'app': 'tools/generar-fauna-zonas.py', 'image': nombre + '.png', 'format': 'RGBA8888', 'scale': '1'}}
    for idx, k in enumerate(nombres):
        li = frames[k]
        x0, y0 = (idx % columnas) * (cw + sep), (idx // columnas) * (ch + sep)
        hoja.alpha_composite(li.imagen(), (x0 + (cw - li.w) // 2, y0 + ch - li.h))
        datos['frames'][k] = {'frame': {'x': x0, 'y': y0, 'w': cw, 'h': ch}, 'rotated': False, 'trimmed': False,
                              'spriteSourceSize': {'x': 0, 'y': 0, 'w': cw, 'h': ch}, 'sourceSize': {'w': cw, 'h': ch},
                              'pivot': {'x': pivote[0], 'y': pivote[1]}}
    datos['meta']['size'] = {'w': hoja.size[0], 'h': hoja.size[1]}
    os.makedirs(SALIDA, exist_ok=True)
    ruta = os.path.join(SALIDA, nombre + '.png')
    hoja.save(ruta, 'PNG', optimize=True)
    with open(os.path.join(SALIDA, nombre + '.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(datos, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write('\n')
    print('  %-14s %3d fotogramas  celda %dx%d' % (nombre, len(nombres), cw, ch))
    return ruta


def main():
    nombres = [a for a in sys.argv[1:] if a in ESPECIES] or list(ESPECIES)
    print('Fauna ->', SALIDA)
    hojas = []
    for n in nombres:
        fr, piv = fotos(n)
        hojas.append(atlas(n, fr, piv))
    hoja = hoja_contacto(hojas, columnas=3, escala=2)
    if hoja:
        hoja.save(os.path.join(SALIDA, '_hoja_fauna3d.png'))
    print('listo')


if __name__ == '__main__':
    main()
