#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
VEGETACION — la carpeta de arboles, arbustos y plantas
=============================================================================

QUE ESCRIBE
---------------------------------------------------------------------------
    Game/newpro/vegetacion/arboles/*.png      los arboles, a su tamano
    Game/newpro/vegetacion/arbustos/*.png     arbustos, matas y flores
    Game/newpro/vegetacion/tiles/*.png        LOS MISMOS, encajados en 2x2 o
                                              3x3 tiles de 16, para un mapa
    Game/newpro/vegetacion/vegetacion.json    el catalogo
    Game/newpro/vegetacion/hoja_*.png         hojas de contacto para mirarlo

POR QUE CADA PIEZA VA DOS VECES
---------------------------------------------------------------------------
Un arbol de 72x104 NO cabe en un tile de 16 y no tiene por que: en el juego los
arboles son objetos sueltos (`Game/Objetos/arbol.png` mide 95x125) que se
colocan encima del mapa con su profundidad para el y-sort. Pero para pintar un
mapa en Tiled hace falta que la pieza este encajada en la rejilla.

Asi que cada pieza sale dos veces: a su tamano de verdad en `arboles/`, y
encajada en una rejilla de 16 en `tiles/`, apoyada en el borde de abajo y
centrada en horizontal, que es donde tiene que caer el tronco.

USO
---------------------------------------------------------------------------
    python tools/generar-vegetacion.py
"""

import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gf_arte as A
import gf_vegetacion as V

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, 'Game', 'newpro', 'vegetacion')
WEB = '/Game/newpro/vegetacion'


# ===========================================================================
# EL CATALOGO
#   (id, grupo, ancho, alto, funcion, kwargs)
# ===========================================================================

ARBOLES = [
    ('roble_chico',    38, 56,  dict(paleta='frondosa', forma='redonda')),
    ('roble',          56, 84,  dict(paleta='frondosa', forma='redonda')),
    ('roble_grande',   74, 106, dict(paleta='frondosa', forma='redonda')),
    ('haya',           62, 92,  dict(paleta='frondosa', forma='redonda')),
    ('abedul',         34, 74,  dict(paleta='frondosa', forma='columna')),
    ('sauce',          62, 88,  dict(paleta='frondosa', forma='sauce')),
    ('manzano',        56, 82,  dict(paleta='frondosa', forma='redonda',
                                     frutas='manzana')),
    ('naranjo',        54, 80,  dict(paleta='frondosa', forma='redonda',
                                     frutas='naranja')),
    ('cerezo',         58, 86,  dict(paleta='cerezo', forma='redonda',
                                     flores='rosa')),
    ('almendro',       52, 78,  dict(paleta='cerezo', forma='redonda',
                                     flores='blanca')),
    ('pino_chico',     36, 72,  dict(paleta='pino', forma='pino')),
    ('pino',           52, 104, dict(paleta='pino', forma='pino')),
    ('abeto',          46, 96,  dict(paleta='pino', forma='pino')),
    ('otono_rojo',     56, 82,  dict(paleta='otono', forma='redonda')),
    ('otono_dorado',   58, 84,  dict(paleta='otono', forma='redonda',
                                     frutas='manzana')),
    ('arbol_nevado',   54, 82,  dict(paleta='nieve', forma='redonda')),
    ('pino_nevado',    46, 94,  dict(paleta='nieve', forma='pino')),
    ('ceiba',          70, 104, dict(paleta='jungla', forma='redonda')),
    ('arbol_jungla',   60, 96,  dict(paleta='jungla', forma='redonda')),
    ('sauce_pantano',  62, 86,  dict(paleta='pantano', forma='sauce')),
    ('arbol_pantano',  56, 84,  dict(paleta='pantano', forma='redonda')),
    ('palmera',        58, 92,  dict(paleta='palmera', forma='palmera')),
    ('palmera_chica',  42, 68,  dict(paleta='palmera', forma='palmera')),
    ('arbol_seco',     54, 82,  dict(paleta='seco', forma='seco')),
    ('arbol_muerto',   44, 66,  dict(paleta='muerto', forma='seco')),
]

ARBUSTOS = [
    ('arbusto',            28, 22, 'arbusto', dict(paleta='frondosa')),
    ('arbusto_grande',     40, 30, 'arbusto', dict(paleta='frondosa')),
    ('arbusto_flor_rosa',  30, 24, 'arbusto', dict(paleta='frondosa', flores='rosa')),
    ('arbusto_flor_blanca', 30, 24, 'arbusto', dict(paleta='frondosa', flores='blanca')),
    ('arbusto_flor_lila',  30, 24, 'arbusto', dict(paleta='frondosa', flores='lila')),
    ('arbusto_bayas',      28, 22, 'arbusto', dict(paleta='frondosa', bayas='baya')),
    ('arbusto_otono',      30, 24, 'arbusto', dict(paleta='otono')),
    ('arbusto_nevado',     30, 24, 'arbusto', dict(paleta='nieve')),
    ('arbusto_jungla',     34, 26, 'arbusto', dict(paleta='jungla')),
    ('mata_hierba',        20, 14, 'mata',    dict(paleta='frondosa')),
    ('mata_alta',          22, 22, 'mata',    dict(paleta='frondosa', altas=True)),
    ('mata_seca',          20, 16, 'mata',    dict(paleta='seco', altas=True)),
    ('helecho',            26, 22, 'helecho', dict(paleta='frondosa')),
    ('helecho_grande',     36, 30, 'helecho', dict(paleta='jungla')),
    ('flores_rosa',        22, 16, 'flores_grupo', dict(color='rosa')),
    ('flores_amarillas',   22, 16, 'flores_grupo', dict(color='amarilla')),
    ('flores_blancas',     22, 16, 'flores_grupo', dict(color='blanca')),
    ('flores_lilas',       22, 16, 'flores_grupo', dict(color='lila')),
    ('flores_rojas',       22, 16, 'flores_grupo', dict(color='roja')),
    ('tocon',              22, 18, 'tocon',   dict(paleta='frondosa')),
    ('tocon_setas',        24, 20, 'tocon',   dict(paleta='frondosa', setas=True)),
    ('tronco_partido',     26, 34, 'tocon',   dict(paleta='muerto')),
    ('bambu',              30, 56, 'bambu',   dict(paleta='jungla')),
    ('cana_pantano',       26, 40, 'bambu',   dict(paleta='pantano')),
    ('cactus',             30, 46, 'cactus',  dict()),
    ('cactus_chico',       20, 30, 'cactus',  dict()),
    ('seta_gigante_roja',  30, 34, 'seta_gigante', dict(color='roja')),
    ('seta_gigante_lila',  30, 34, 'seta_gigante', dict(color='lila')),
    ('roca_musgo',         28, 22, 'roca',    dict(musgo=True)),
    ('pedrusco',           24, 18, 'roca',    dict()),
]


def _tiles_de(w, h, tile=16):
    return (max(1, (w + tile - 1) // tile), max(1, (h + tile - 1) // tile))


def main():
    fichas = []
    n = 0
    muestras_arb, muestras_mat = [], []

    for i, (ident, w, h, kw) in enumerate(ARBOLES):
        li = V.arbol(w, h, semilla=101 + i * 7, **kw)
        ruta = os.path.join(DESTINO, 'arboles', '%s.png' % ident)
        li.guardar(ruta)
        cols, filas = _tiles_de(li.w, li.h)
        lt = V.en_tiles(li, cols, filas)
        rt = os.path.join(DESTINO, 'tiles', '%s_%dx%d.png' % (ident, cols, filas))
        lt.guardar(rt)
        fichas.append(dict(id=ident, grupo='arbol', ancho=li.w, alto=li.h,
                           ruta='%s/arboles/%s.png' % (WEB, ident),
                           tiles=[cols, filas],
                           ruta_tiles='%s/tiles/%s_%dx%d.png' % (WEB, ident, cols, filas),
                           **dict((k, str(v)) for k, v in kw.items())))
        n += 2
        muestras_arb.append(ruta)

    for i, (ident, w, h, fn, kw) in enumerate(ARBUSTOS):
        li = getattr(V, fn)(w, h, semilla=307 + i * 13, **kw)
        ruta = os.path.join(DESTINO, 'arbustos', '%s.png' % ident)
        li.guardar(ruta)
        cols, filas = _tiles_de(li.w, li.h)
        lt = V.en_tiles(li, cols, filas)
        rt = os.path.join(DESTINO, 'tiles', '%s_%dx%d.png' % (ident, cols, filas))
        lt.guardar(rt)
        fichas.append(dict(id=ident, grupo='arbusto', ancho=li.w, alto=li.h,
                           ruta='%s/arbustos/%s.png' % (WEB, ident),
                           tiles=[cols, filas],
                           ruta_tiles='%s/tiles/%s_%dx%d.png' % (WEB, ident, cols, filas),
                           pintor=fn))
        n += 2
        muestras_mat.append(ruta)

    A.hoja_contacto(muestras_arb, columnas=9, escala=2).save(
        os.path.join(DESTINO, 'hoja_arboles.png'))
    A.hoja_contacto(muestras_mat, columnas=10, escala=3).save(
        os.path.join(DESTINO, 'hoja_arbustos.png'))

    with io.open(os.path.join(DESTINO, 'vegetacion.json'), 'w', encoding='utf-8') as fh:
        fh.write(json.dumps({
            'pack': 'newpro/vegetacion', 'version': 1, 'base_web': WEB,
            'descripcion': ('Arboles, arbustos y plantas con la paleta medida de '
                            'Game/Objetos/arbol.png. Cada pieza va dos veces: a su '
                            'tamano en arboles/ o arbustos/, y encajada en una '
                            'rejilla de 16 en tiles/.'),
            'sombra': ('los PNG salen SIN sombra pegada: el juego pone la suya '
                       'con gf-sombras'),
            'total': len(fichas),
            'piezas': fichas}, ensure_ascii=False, indent=1))
    print('vegetacion: %d piezas, %d PNG' % (len(fichas), n))


if __name__ == '__main__':
    main()
