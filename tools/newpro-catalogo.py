#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
CATALOGO MAESTRO — refresca Game/newpro/newpro.json
=============================================================================

`newpro.json` es el indice de todo el pack: lo que lee quien quiere saber que
hay sin recorrer mil quinientos archivos. Se quedaba desfasado en cuanto un
generador anadia una carpeta, y un indice que miente es peor que no tenerlo.

Esto lo vuelve a calcular DESDE EL DISCO y desde los catalogos de cada carpeta,
sin tocar nada de lo que ya hay escrito a mano (`estilo`, `cultivos`, `items`,
`personajes`): solo refresca los recuentos y anade la seccion del lote nuevo.

    python tools/newpro-catalogo.py
"""

import io
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEWPRO = os.path.join(RAIZ, 'Game', 'newpro')


def _lee(rel):
    ruta = os.path.join(NEWPRO, rel.replace('/', os.sep))
    if not os.path.isfile(ruta):
        return None
    with io.open(ruta, encoding='utf-8') as fh:
        return json.load(fh)


def _cuenta_png(carpeta):
    n = 0
    for _, _, archivos in os.walk(os.path.join(NEWPRO, carpeta)):
        n += sum(1 for a in archivos if a.lower().endswith('.png'))
    return n


def main():
    ruta = os.path.join(NEWPRO, 'newpro.json')
    with io.open(ruta, encoding='utf-8') as fh:
        d = json.load(fh)

    tilesets = _lee('tilesets/tilesets.json') or {}
    veg = _lee('vegetacion/vegetacion.json') or {}
    con = _lee('construcciones/construcciones.json') or {}
    mapas = _lee('mapas/mapas.json') or {}
    pesca = _lee('pesca_anim/pesca_anim.json') or {}

    # --- el lote 4 se queda, pero los tilesets han cambiado de plantilla -----
    if 'lote4' in d and tilesets:
        d['lote4']['tilesets'] = {
            'total': len(tilesets.get('tilesets', [])),
            'tile': tilesets.get('tile', 16),
            'columnas': tilesets.get('columnas', 16),
            'filas': tilesets.get('filas', 9),
            'referencias_por_tema': 8,
            'temas': [t['tema'] for t in tilesets.get('tilesets', [])],
            'nota': ('los %d comparten plantilla: el mismo indice significa lo '
                     'mismo en todos, asi que un mapa se repinta de tema '
                     'cambiando la imagen. Las filas 6, 7 y 8 son ocho piezas '
                     'de 2x3 tiles (arboles, arbustos, rocas) por tema.'
                     % len(tilesets.get('tilesets', []))),
        }
    if 'lote4' in d and pesca:
        d['lote4'].setdefault('animacion_de_pesca', {})
        d['lote4']['animacion_de_pesca'].update({
            'personajes': len(pesca.get('personajes', [])),
            'fotogramas': pesca.get('total', 0),
            'por_direccion': 6,
            'margen': pesca.get('margen', {}),
            'bucle': pesca.get('bucle', {}),
            'brazo': pesca.get('brazo', {}),
            'nota': ('el brazo se dobla por cinematica inversa: el hombro no se '
                     'mueve, el codo se resuelve y la mano cae en el puno de la '
                     'cana'),
        })

    # --- el lote 5 -----------------------------------------------------------
    d['lote5'] = {
        'descripcion': 'Bosque, pueblo y mapas enteros.',
        'catalogos': {
            'vegetacion': 'vegetacion/vegetacion.json',
            'construcciones': 'construcciones/construcciones.json',
            'mapas': 'mapas/mapas.json',
        },
        'vegetacion': {
            'piezas': veg.get('total', 0),
            'arboles': sum(1 for p in veg.get('piezas', []) if p['grupo'] == 'arbol'),
            'arbustos': sum(1 for p in veg.get('piezas', []) if p['grupo'] == 'arbusto'),
            'nota': ('cada pieza va dos veces: a su tamano en arboles/ o arbustos/ '
                     'y encajada en la rejilla de 16 en tiles/. Sin sombra pegada.'),
        },
        'construcciones': {
            'piezas': con.get('total', 0),
            'casas': sum(1 for p in con.get('piezas', []) if p['grupo'] == 'casa'),
            'props': sum(1 for p in con.get('piezas', []) if p['grupo'] == 'prop'),
            'nota': ('pizarra azul #3b4569 y viga granate #633946, las de '
                     'Game/Objetos/casa de npc arreglado.png'),
        },
        'mapas': {
            'total': len(mapas.get('mapas', [])),
            'tiles': [mapas.get('ancho_tiles', 0), mapas.get('alto_tiles', 0)],
            'px': [mapas.get('ancho_tiles', 0) * 16, mapas.get('alto_tiles', 0) * 16],
            'nota': ('un mapa COMPLETO por tema, en PNG para mirarlo y en JSON de '
                     'Tiled para usarlo. No es un recorte: lleva relieve, rio, '
                     'lago, acantilado, caminos, pueblo y bosque.'),
        },
    }

    d['version'] = '7.0.0'
    d['descripcion'] = (
        d['descripcion'].split(' Lote 5:')[0] +
        ' Lote 5: %d piezas de vegetacion (arboles, arbustos, flores y matas), '
        '%d de construccion (casas, molino, torre, pozo, vallas y props), los '
        'tilesets ampliados a %d temas con tres filas de arboles de 2x3 tiles, '
        'y %d mapas completos con su JSON de Tiled.'
        % (veg.get('total', 0), con.get('total', 0),
           len(tilesets.get('tilesets', [])), len(mapas.get('mapas', []))))

    tot = d.setdefault('totales', {})
    tot['png_en_disco'] = _cuenta_png('')
    tot['png_del_lote_5'] = (_cuenta_png('vegetacion') + _cuenta_png('construcciones') +
                             _cuenta_png('mapas'))

    with io.open(ruta, 'w', encoding='utf-8') as fh:
        fh.write(json.dumps(d, ensure_ascii=False, indent=1))
    print('newpro.json v%s — %d PNG en disco, %d del lote 5'
          % (d['version'], tot['png_en_disco'], tot['png_del_lote_5']))


if __name__ == '__main__':
    main()
