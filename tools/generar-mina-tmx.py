#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
MINA — el .tmx para abrir el mapa en Tiled
=============================================================================

QUE ESCRIBE
---------------------------------------------------------------------------
    Game/MAPAS/Mina/mina.tmx    el mismo mapa que Maps/mina.json, en el
                                formato nativo de Tiled

POR QUE HAY DOS FICHEROS DEL MISMO MAPA
---------------------------------------------------------------------------
    Maps/mina.json     lo que CARGA EL JUEGO. Phaser lee JSON, no TMX.
    Mina/mina.tmx      lo que se ABRE EN TILED para retocar a mano.

El .tmx se genera A PARTIR del .json, nunca al reves: el mapa lo construye
`generar-mina-mapa.py`, y este script solo lo traduce. Asi no hay dos fuentes
de verdad que se puedan desincronizar.

SI RETOCAS EL MAPA EN TILED
---------------------------------------------------------------------------
Guarda DESDE Tiled como JSON encima de `Maps/mina.json` (Archivo > Exportar
como > JSON). Si vuelves a correr `generar-mina-mapa.py`, tus retoques se
pierden: ese script reconstruye el mapa entero desde cero.

EL TILESET VA EMBEBIDO Y EN LA MISMA CARPETA
---------------------------------------------------------------------------
El .tmx se guarda JUNTO al PNG del tileset, asi que la ruta de la imagen es
solo `tileset_mina.png`. Y el tileset va DENTRO del .tmx, no en un `.tsx`
aparte.

Eso ultimo es a proposito: `Maps/mapa_principal.json` referencia 40 tilesets
externos con rutas como `../../../../mapaffff/mapaffff/pozo.tsx`, que apuntan
fuera del proyecto y no existen — al abrirlo, Tiled pide localizar cada uno,
cuarenta veces. Este mapa se abre de doble clic y no pregunta nada.

Corre con:  python tools/generar-mina-tmx.py
"""

import io
import json
import os
import sys
from xml.sax.saxutils import escape, quoteattr

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGEN = os.path.join(RAIZ, 'Maps', 'mina.json')
DESTINO = os.path.join(RAIZ, 'Game', 'MAPAS', 'Mina', 'mina.tmx')


def at(nombre, valor):
    return '%s=%s' % (nombre, quoteattr(str(valor)))


def capa_tiles(l, ancho):
    """
    Una capa de tiles en CSV, que es el formato que Tiled escribe por defecto
    y el unico que se puede leer a ojo si algo sale mal.
    """
    filas = []
    d = l['data']
    for y in range(l['height']):
        fila = d[y * ancho:(y + 1) * ancho]
        filas.append(','.join(str(v) for v in fila))
    cuerpo = ',\n'.join(filas)
    return (
        ' <layer %s %s %s %s>\n'
        '  <data encoding="csv">\n%s\n</data>\n'
        ' </layer>\n' % (
            at('id', l['id']), at('name', l['name']),
            at('width', l['width']), at('height', l['height']), cuerpo))


def capa_objetos(l):
    partes = [' <objectgroup %s %s>\n' % (at('id', l['id']), at('name', l['name']))]
    for o in l.get('objects', []):
        atributos = [at('id', o['id'])]
        if o.get('name'):
            atributos.append(at('name', o['name']))
        if o.get('type'):
            atributos.append(at('type', o['type']))
        atributos.append(at('x', round(o['x'], 2)))
        atributos.append(at('y', round(o['y'], 2)))
        if o.get('width'):
            atributos.append(at('width', round(o['width'], 2)))
        if o.get('height'):
            atributos.append(at('height', round(o['height'], 2)))
        if o.get('point'):
            partes.append('  <object %s>\n   <point/>\n  </object>\n'
                          % ' '.join(atributos))
        else:
            partes.append('  <object %s/>\n' % ' '.join(atributos))
    partes.append(' </objectgroup>\n')
    return ''.join(partes)


def main():
    if not os.path.isfile(ORIGEN):
        print('no encuentro', ORIGEN, '- corre antes generar-mina-mapa.py')
        return 1

    with io.open(ORIGEN, encoding='utf-8') as fh:
        m = json.load(fh)

    ts = m['tilesets'][0]
    # El .tmx vive JUNTO al PNG, asi que la ruta es solo el nombre.
    imagen = os.path.basename(ts['image'])

    out = ['<?xml version="1.0" encoding="UTF-8"?>\n']
    out.append('<!-- Generado por tools/generar-mina-tmx.py a partir de '
               'Maps/mina.json. No se edita a mano: se regenera. -->\n')
    out.append('<map %s>\n' % ' '.join([
        at('version', '1.10'), at('tiledversion', '1.11.2'),
        at('orientation', 'orthogonal'), at('renderorder', 'right-down'),
        at('width', m['width']), at('height', m['height']),
        at('tilewidth', m['tilewidth']), at('tileheight', m['tileheight']),
        at('infinite', '0'),
        at('nextlayerid', m.get('nextlayerid', 50)),
        at('nextobjectid', m.get('nextobjectid', 90000)),
    ]))

    out.append(' <tileset %s>\n' % ' '.join([
        at('firstgid', ts['firstgid']), at('name', ts['name']),
        at('tilewidth', ts['tilewidth']), at('tileheight', ts['tileheight']),
        at('tilecount', ts['tilecount']), at('columns', ts['columns']),
    ]))
    out.append('  <image %s %s %s/>\n' % (
        at('source', imagen),
        at('width', ts['imagewidth']), at('height', ts['imageheight'])))
    out.append(' </tileset>\n')

    for l in m['layers']:
        if l['type'] == 'tilelayer':
            out.append(capa_tiles(l, m['width']))
        elif l['type'] == 'objectgroup':
            out.append(capa_objetos(l))

    out.append('</map>\n')

    carpeta = os.path.dirname(DESTINO)
    if not os.path.isdir(carpeta):
        os.makedirs(carpeta)
    with io.open(DESTINO, 'w', encoding='utf-8') as fh:
        fh.write(''.join(out))

    capas_t = sum(1 for l in m['layers'] if l['type'] == 'tilelayer')
    capas_o = sum(1 for l in m['layers'] if l['type'] == 'objectgroup')
    print('mina.tmx  %dx%d de %d px  ·  %d capas de tiles + %d de objetos  ·  %.0f KB'
          % (m['width'], m['height'], m['tilewidth'], capas_t, capas_o,
             os.path.getsize(DESTINO) / 1024.0))
    print('escrito en', DESTINO)
    print('  el tileset va EMBEBIDO y la imagen es', imagen, '(misma carpeta):')
    print('  se abre de doble clic sin que Tiled pregunte nada')
    return 0


if __name__ == '__main__':
    sys.exit(main())
