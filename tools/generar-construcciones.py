#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
CONSTRUCCIONES — la carpeta de casas y cosas del pueblo
=============================================================================

QUE ESCRIBE
---------------------------------------------------------------------------
    Game/newpro/construcciones/casas/*.png        los edificios
    Game/newpro/construcciones/props/*.png        vallas, carteles, barriles...
    Game/newpro/construcciones/tiles/*.png        los mismos, encajados en la
                                                  rejilla de 16 del mapa
    Game/newpro/construcciones/construcciones.json
    Game/newpro/construcciones/hoja_*.png

EL COLOR NO SE ELIGE
---------------------------------------------------------------------------
Todas las casas van con la pizarra azul (#3b4569) y la viga granate (#633946)
de `Game/Objetos/casa de npc arreglado.png`. Dos excepciones a proposito, para
que un pueblo no sea una fila de clones: la teja roja de la casa de labranza y
la paja de la cabana y del pozo.

USO
---------------------------------------------------------------------------
    python tools/generar-construcciones.py
"""

import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gf_arte as A
import gf_construcciones as C
import gf_vegetacion as V

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, 'Game', 'newpro', 'construcciones')
WEB = '/Game/newpro/construcciones'


# ===========================================================================
# EL CATALOGO — (id, ancho, alto, pintor, kwargs)
# ===========================================================================

CASAS = [
    ('casa_chica',      52, 56, 'casa', dict(pisos=1, muro='piedra',
                                             tejado='pizarra', ventanas=2)),
    ('casa_mediana',    64, 66, 'casa', dict(pisos=1, muro='piedra',
                                             tejado='pizarra', ventanas=3)),
    ('casa_grande',     78, 76, 'casa', dict(pisos=1, muro='yeso',
                                             tejado='pizarra', ventanas=3)),
    ('casa_dos_pisos',  70, 92, 'casa', dict(pisos=2, muro='yeso',
                                             tejado='pizarra', ventanas=2)),
    ('casa_labranza',   72, 68, 'casa', dict(pisos=1, muro='tabla',
                                             tejado='teja', ventanas=2)),
    ('tienda',          64, 72, 'casa', dict(pisos=1, muro='yeso',
                                             tejado='pizarra', ventanas=2,
                                             letrero='tienda')),
    ('herreria',        70, 70, 'casa', dict(pisos=1, muro='piedra',
                                             tejado='pizarra', ventanas=2,
                                             letrero='herreria')),
    ('posada',          80, 94, 'casa', dict(pisos=2, muro='yeso',
                                             tejado='pizarra', ventanas=3,
                                             letrero='posada')),
    ('boticario',       58, 70, 'casa', dict(pisos=1, muro='yeso',
                                             tejado='pizarra', ventanas=2,
                                             letrero='pociones')),
    ('granero',         84, 74, 'casa', dict(pisos=1, muro='tabla',
                                             tejado='teja', ventanas=1,
                                             chimenea=False, letrero='granja')),
    ('cobertizo',       56, 46, 'casa', dict(pisos=1, muro='tabla',
                                             tejado='pizarra', ventanas=1,
                                             chimenea=False, porche=True)),
    ('cabana',          58, 60, 'cabana', dict()),
    ('torre',           42, 96, 'torre', dict()),
    ('molino',          68, 100, 'molino', dict()),
    ('pozo',            36, 40, 'pozo', dict()),
    ('tienda_campana',  42, 36, 'tienda_campana', dict()),
]

PROPS = [
    ('valla',           48, 20, 'valla', dict()),
    ('valla_esquina',   34, 20, 'valla', dict(esquina=True)),
    ('valla_puerta',    34, 20, 'valla', dict(puerta_=True)),
    ('cartel',          24, 32, 'cartel', dict()),
    ('cartel_doble',    26, 34, 'cartel', dict(flecha=False)),
    ('farola',          18, 44, 'farola', dict()),
    ('banco',           28, 20, 'banco', dict()),
    ('barril',          16, 20, 'barril', dict()),
    ('caja',            16, 16, 'caja', dict()),
    ('caja_grande',     22, 22, 'caja', dict()),
    ('hoguera',         24, 22, 'hoguera', dict()),
    ('pila_lena',       28, 22, 'pila_lena', dict()),
    ('espantapajaros',  28, 46, 'espantapajaros', dict()),
    ('puente_h',        64, 24, 'puente', dict()),
    ('puente_v',        24, 64, 'puente', dict(vertical=True)),
]


def _tiles_de(w, h, tile=16):
    return (max(1, (w + tile - 1) // tile), max(1, (h + tile - 1) // tile))


def main():
    fichas = []
    n = 0
    m_casas, m_props = [], []
    for grupo, lista, muestras in (('casa', CASAS, m_casas),
                                   ('prop', PROPS, m_props)):
        carpeta = 'casas' if grupo == 'casa' else 'props'
        for i, (ident, w, h, fn, kw) in enumerate(lista):
            li = getattr(C, fn)(w, h, semilla=211 + i * 11, **kw)
            ruta = os.path.join(DESTINO, carpeta, '%s.png' % ident)
            li.guardar(ruta)
            cols, filas = _tiles_de(li.w, li.h)
            lt = V.en_tiles(li, cols, filas)
            rt = os.path.join(DESTINO, 'tiles',
                              '%s_%dx%d.png' % (ident, cols, filas))
            lt.guardar(rt)
            fichas.append(dict(id=ident, grupo=grupo, ancho=li.w, alto=li.h,
                               pintor=fn, tiles=[cols, filas],
                               ruta='%s/%s/%s.png' % (WEB, carpeta, ident),
                               ruta_tiles='%s/tiles/%s_%dx%d.png'
                                          % (WEB, ident, cols, filas)))
            muestras.append(ruta)
            n += 2

    A.hoja_contacto(m_casas, columnas=6, escala=3).save(
        os.path.join(DESTINO, 'hoja_casas.png'))
    A.hoja_contacto(m_props, columnas=8, escala=3).save(
        os.path.join(DESTINO, 'hoja_props.png'))

    with io.open(os.path.join(DESTINO, 'construcciones.json'), 'w',
                 encoding='utf-8') as fh:
        fh.write(json.dumps({
            'pack': 'newpro/construcciones', 'version': 1, 'base_web': WEB,
            'descripcion': ('Casas y objetos de pueblo con la paleta medida de '
                            'Game/Objetos/casa de npc arreglado.png.'),
            'total': len(fichas), 'piezas': fichas}, ensure_ascii=False, indent=1))
    print('construcciones: %d piezas, %d PNG' % (len(fichas), n))


if __name__ == '__main__':
    main()
