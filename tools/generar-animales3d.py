#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
LOS ANIMALES EN 2.5D — escribe Game/Sprites/animales3d/          (2026-10-12)
=============================================================================

Recorre Game/Sprites/animales/ (que NO se toca) y, por cada PNG:
  · si es de una especie remodelada (tools/gf_animales3d.py), lo fotografía
    en 3D con el MISMO tamaño de cuadro y el mismo nombre;
  · si no (las mariposas, que se ven desde arriba; el nido; las "zzz"), lo
    copia tal cual.
gf-animales.js y BattleScene.js leen de animales3d/.

Las especies de A.CUATRO_LADOS llevan además sus vistas de frente y de
espaldas: '<especie>_<pose>_abajo_<n>.png' y '_arriba_<n>.png'.

Y lo mismo con el cuervo (Game/Sprites/cuervo -> cuervo3d, lo leen
gf-cuervo.js, GameScene y la arena) y con el gallo (Game/Sprites/Chiken/N.png
-> gallo3d/N.png, lo lee GameScene).

Determinista: volver a ejecutarlo escribe los mismos bytes. Al final deja una
hoja de contacto (_hoja_animales3d.png, no se carga) para revisar.

USO:  python tools/generar-animales3d.py
=============================================================================
"""
import os
import shutil
import sys

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import gf_animales3d as A  # noqa: E402

RAIZ = os.path.dirname(AQUI)
ORIGEN = os.path.join(RAIZ, 'Game', 'Sprites', 'animales')
SALIDA = os.path.join(RAIZ, 'Game', 'Sprites', 'animales3d')
CUERVO = (os.path.join(RAIZ, 'Game', 'Sprites', 'cuervo'), os.path.join(RAIZ, 'Game', 'Sprites', 'cuervo3d'))
GALLO = (os.path.join(RAIZ, 'Game', 'Sprites', 'Chiken'), os.path.join(RAIZ, 'Game', 'Sprites', 'gallo3d'))


def partes(nombre):
    """'serpiente_coral_repta_3.png' -> ('serpiente_coral', 'repta', 3) o None."""
    base = nombre[:-4]
    for esp in sorted(A.ESPECIES, key=len, reverse=True):
        if base.startswith(esp + '_'):
            resto = base[len(esp) + 1:]
            if '_' in resto:
                accion, n = resto.rsplit('_', 1)
                if n.isdigit():
                    return esp, accion, int(n)
    return None


def main():
    os.makedirs(SALIDA, exist_ok=True)
    hechos, copiados = 0, 0
    hoja = []
    for nombre in sorted(os.listdir(ORIGEN)):
        if not nombre.endswith('.png'):
            continue
        src = os.path.join(ORIGEN, nombre)
        dst = os.path.join(SALIDA, nombre)
        p = partes(nombre)
        if not p:
            shutil.copyfile(src, dst)
            copiados += 1
            continue
        esp, accion, n = p
        li = A.foto(esp, accion, n)
        w0, h0 = Image.open(src).size
        assert (li.w, li.h) == (w0, h0), (nombre, (li.w, li.h), (w0, h0))
        li.guardar(dst)
        hoja.append(dst)
        hechos += 1
        # (2026-10-12) Las cuatro direcciones: de frente y de espaldas, con el
        # mismo tamaño y el mismo nombre más '_abajo' / '_arriba'.
        if accion in A.CUATRO_LADOS.get(esp, ()):
            for vista in ('abajo', 'arriba'):
                lv = A.foto(esp, accion, n, vista)
                dv = os.path.join(SALIDA, '%s_%s_%s_%d.png' % (esp, accion, vista, n))
                lv.guardar(dv)
                hechos += 1
    # El cuervo y el gallo, cada uno en su carpeta nueva.
    for (origen, salida), especie in ((CUERVO, 'cuervo'), (GALLO, 'gallo')):
        os.makedirs(salida, exist_ok=True)
        for nombre in sorted(os.listdir(origen)):
            if not nombre.endswith('.png'):
                continue
            base = nombre[:-4]
            if especie == 'gallo':
                accion, n = 'pica', int(base)
            else:
                accion, n = base[len('cuervo_'):].rsplit('_', 1)
                n = int(n)
            li = A.foto(especie, accion, n)
            w0, h0 = Image.open(os.path.join(origen, nombre)).size
            assert (li.w, li.h) == (w0, h0), (nombre, (li.w, li.h), (w0, h0))
            dst = os.path.join(salida, nombre)
            li.guardar(dst)
            hoja.append(dst)
            hechos += 1
    print('  remodelados: %d   copiados tal cual: %d' % (hechos, copiados))
    try:
        from gf_arte import hoja_contacto
        h = hoja_contacto(hoja, columnas=12, escala=3)
        if h:
            h.save(os.path.join(SALIDA, '_hoja_animales3d.png'))
    except Exception as e:  # la hoja es solo para revisar
        print('  (sin hoja de contacto: %s)' % e)
    print('listo ->', SALIDA)


if __name__ == '__main__':
    main()
