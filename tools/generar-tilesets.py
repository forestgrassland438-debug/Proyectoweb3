#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
TILESETS — 8 tilesets de 16x16 con sus hojas de construccion
=============================================================================

QUE ESCRIBE
---------------------------------------------------------------------------
    Game/newpro/tilesets/<tema>/<tema>.png          el tileset, 96 tiles
    Game/newpro/tilesets/<tema>/ref_1..8.png        8 hojas de referencia
    Game/newpro/tilesets/<tema>/<tema>.json         que es cada tile
    Game/newpro/tilesets/tilesets.json              el indice de los 8

Los ocho temas: isla, cueva, volcan, pantano, ruinas, bosque_oscuro, desierto
y fondo_marino.

TODOS TIENEN LA MISMA PLANTILLA
---------------------------------------------------------------------------
96 tiles en 16 columnas x 6 filas, y **el mismo indice significa lo mismo en
los ocho**. Un mapa hecho con el tileset de isla se puede repintar de cueva
cambiando la imagen y sin tocar un solo dato, igual que hace el juego con
`tiles.png` y `tiles_nieve.png`.

    fila 0   0-3   suelo base (4 variantes)      4-7   base con decoracion
             8-11  suelo secundario (4)         12-15  secundario con deco
    fila 1  16-28  transicion secundario->base (13 piezas)
            29-31  camino: horizontal, vertical, cruce
    fila 2  32-44  transicion liquido->base (13 piezas)
            45-47  liquido hondo, liquido claro, brillo
    fila 3  48-56  acantilado 3x3 (filo, pared, pie)
            57-58  esquinas interiores del acantilado
            59-60  escalera (arriba, cuerpo)
            61-63  pared con detalle
    fila 4  64-79  16 objetos sueltos (fondo transparente)
    fila 5  80-95  16 objetos sueltos mas

LAS 13 PIEZAS DE UNA TRANSICION
---------------------------------------------------------------------------
    NO  N  NE      y ademas cuatro esquinas INTERIORES, para cuando el terreno
    O   C  E       de fuera entra por una esquina en lugar de por un lado.
    SO  S  SE      Con esas 13 se dibuja cualquier mancha.

El borde no se dibuja pieza a pieza: sale de una onda de periodo 16 sobre la
coordenada local, asi que dos piezas pegadas continuan la linea sin escalon y
las esquinas caen justo donde acaban los lados (ver `gf_tiles.py`).

LAS OCHO HOJAS DE REFERENCIA
---------------------------------------------------------------------------
No son adornos: son el manual de construccion del tileset.

    ref_1  indice     el tileset con la rejilla y el numero de cada tile
    ref_2  terrenos   los dos suelos y sus variantes, uno al lado del otro
    ref_3  transicion una mancha de secundario con las 13 piezas en uso
    ref_4  agua       una laguna con su orilla y su parte honda
    ref_5  acantilado una meseta con el filo, la pared y el pie
    ref_6  camino     un camino con cruce atravesando los dos terrenos
    ref_7  objetos    los 32 objetos colocados sobre el suelo
    ref_8  escena     una escena completa con todo junto a la vez

Las cinco del medio estan armadas con el MISMO codigo para los ocho temas, asi
que sirven para comparar: la misma laguna, el mismo acantilado y el mismo
camino en isla, en cueva y en volcan.

USO
---------------------------------------------------------------------------
    python tools/generar-tilesets.py
    python tools/generar-tilesets.py --solo cueva
"""

import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gf_arte as A
from gf_arte import Lienzo, Mascara, ajusta, mezcla
import gf_tiles as GT
from gf_tiles import T, LADOS, relleno, transicion, acantilado, ruido
import gf_tiles_deco as DECO
import gf_vegetacion as VEG

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, 'Game', 'newpro', 'tilesets')
WEB = '/Game/newpro/tilesets'

COLS = 16
FILAS = 9


def R(*hexes):
    return [A.hex_rgb(h) for h in hexes]


# ===========================================================================
# LOS OCHO TEMAS
# ===========================================================================

TEMAS = {
    'isla': dict(
        nombre='Isla',
        pal=dict(base=R('#f0dcaa', '#dcc188', '#b89b66'),
                 sec=R('#62b368', '#418546', '#37733c'),
                 liquido=R('#8fd8e8', '#4aa8cf', '#2a6f9a'),
                 roca=R('#b8b0a0', '#8d8578', '#665f55'),
                 planta=R('#7ec46a', '#4f9a4a', '#356c36'),
                 madera=R('#c08f52', '#8a5f30', '#5b3d27'),
                 hueso=R('#f2ecd8', '#ded6bc', '#a89a80'),
                 acento=R('#f0d868', '#e0b83a', '#a8842a'),
                 acento2=R('#f2a0b0', '#d8607a', '#a03a50'),
                 acento3=R('#8fd8c8', '#48a894', '#2a7060')),
        borde_sec='ondulado', borde_liq='espuma',
        deco=['palmera', 'palmera', 'arbusto', 'hierba', 'hierba_alta', 'flor',
              'flor:acento2', 'roca', 'roca_grande', 'guijarros', 'tronco',
              'tocon', 'concha', 'concha:acento2', 'estrella_mar', 'coral',
              'coral:acento3', 'alga', 'charco', 'burbujas', 'duna', 'hueso',
              'calavera', 'vasija', 'raiz', 'junco', 'nenufar', 'seta',
              'cristal:acento3', 'mineral', 'losa_rota', 'escalon']),
    'cueva': dict(
        nombre='Cueva',
        pal=dict(base=R('#6a6560', '#4e4a46', '#38352f'),
                 sec=R('#8a8378', '#6b6459', '#4a453d'),
                 liquido=R('#7fc8e0', '#4a8fb8', '#2a5a78'),
                 roca=R('#9a938a', '#756e66', '#4f4a44'),
                 planta=R('#6a9a4a', '#4a7233', '#2f4d22'),
                 madera=R('#8a6f4a', '#63502f', '#3d3120'),
                 hueso=R('#e8e2cc', '#c8c0a8', '#8f8770'),
                 acento=R('#a8e0f0', '#5fb0d8', '#3a7ba8'),
                 acento2=R('#d8a0f0', '#a05fd8', '#6b3a9a'),
                 acento3=R('#a0f0b8', '#4ac878', '#28804a')),
        borde_sec='seco', borde_liq='ondulado',
        deco=['estalagmita', 'estalagmita', 'estalactita', 'estalactita',
              'cristal', 'cristal:acento2', 'cristal:acento3', 'mineral',
              'mineral:acento2', 'roca', 'roca_grande', 'guijarros', 'grieta',
              'seta:acento3', 'hongo_luz', 'hongo_luz:acento2', 'hueso',
              'calavera', 'telarana', 'charco', 'burbujas', 'antorcha',
              'columna', 'losa_rota', 'vasija', 'escalon', 'raiz', 'hierba',
              'alga', 'ceniza', 'tronco', 'coral:acento']),
    'volcan': dict(
        nombre='Volcan',
        pal=dict(base=R('#544a46', '#3a3331', '#241f1e'),
                 sec=R('#8a7f74', '#645c53', '#443d37'),
                 liquido=R('#f8d24a', '#e8621c', '#a8280c'),
                 roca=R('#6a5f5a', '#483f3c', '#2b2523'),
                 planta=R('#8a7a3a', '#5f5226', '#3a3117'),
                 madera=R('#5a4a40', '#3d322b', '#241d19'),
                 hueso=R('#d8d0c0', '#b0a898', '#7a7264'),
                 acento=R('#f8c04a', '#e8621c', '#a8280c'),
                 acento2=R('#f0806a', '#c04030', '#7a2018'),
                 acento3=R('#c0c8d8', '#8a94a8', '#5a6172')),
        borde_sec='seco', borde_liq='ondulado',
        deco=['roca', 'roca_grande', 'guijarros', 'grieta:acento',
              'grieta:acento2', 'estalagmita', 'estalactita', 'mineral:acento',
              'cristal:acento', 'cristal:acento2', 'ceniza', 'ceniza',
              'charco', 'burbujas', 'hueso', 'calavera', 'tronco', 'tocon',
              'raiz', 'columna', 'losa_rota', 'escalon', 'antorcha',
              'vasija', 'telarana', 'hierba', 'duna', 'hongo_luz:acento',
              'seta:acento2', 'coral:acento2', 'alga', 'mineral:acento3']),
    'pantano': dict(
        nombre='Pantano',
        pal=dict(base=R('#8a7a52', '#6b5c3a', '#4a3f26'),
                 sec=R('#6a9a52', '#4a7238', '#2f4d24'),
                 liquido=R('#8aab72', '#57784a', '#374f2e'),
                 roca=R('#7a7a6a', '#5a5a4c', '#3d3d33'),
                 planta=R('#7ab05a', '#548a3c', '#376026'),
                 madera=R('#7a5f3f', '#54402a', '#33261a'),
                 hueso=R('#e0dcc0', '#bab494', '#847e64'),
                 acento=R('#c8d84a', '#9ab02c', '#6b7a1c'),
                 acento2=R('#d8a0c8', '#a05f8a', '#6b3a5a'),
                 acento3=R('#a0e0d8', '#4aa898', '#2a7068')),
        borde_sec='ondulado', borde_liq='ondulado',
        deco=['junco', 'junco', 'nenufar', 'hierba_alta', 'hierba', 'helecho',
              'arbusto', 'seta', 'seta:acento2', 'hongo_luz:acento',
              'tronco', 'tocon', 'raiz', 'raiz', 'roca', 'guijarros',
              'charco', 'burbujas', 'hueso', 'calavera', 'telarana',
              'flor:acento2', 'flor:acento', 'alga', 'vasija', 'losa_rota',
              'columna', 'escalon', 'antorcha', 'cristal:acento3', 'mineral',
              'ceniza']),
    'ruinas': dict(
        nombre='Ruinas',
        pal=dict(base=R('#c0b8a4', '#9a9184', '#726b60'),
                 sec=R('#62b368', '#418546', '#37733c'),
                 liquido=R('#9ac0b0', '#5f8f7c', '#3b5f52'),
                 roca=R('#d0c8b4', '#a89f8c', '#7a7264'),
                 planta=R('#7ec46a', '#4f9a4a', '#356c36'),
                 madera=R('#a3763f', '#6b4724', '#402a15'),
                 hueso=R('#f2ecd8', '#ded6bc', '#a89a80'),
                 acento=R('#f0d868', '#c9a24a', '#8f6f22'),
                 acento2=R('#a8c8e0', '#5f8fb8', '#3a5f80'),
                 acento3=R('#d8a0a0', '#a85f5f', '#703a3a')),
        borde_sec='ondulado', borde_liq='seco',
        deco=['columna', 'columna', 'losa_rota', 'losa_rota', 'escalon',
              'vasija', 'vasija:acento', 'antorcha', 'roca', 'roca_grande',
              'guijarros', 'grieta', 'hierba', 'hierba_alta', 'arbusto',
              'flor', 'flor:acento2', 'helecho', 'raiz', 'tronco', 'tocon',
              'hueso', 'calavera', 'telarana', 'charco', 'seta',
              'mineral:acento', 'cristal:acento2', 'estatua_hueco',
              'concha', 'ceniza', 'burbujas']),
    'bosque_oscuro': dict(
        nombre='Bosque oscuro',
        pal=dict(base=R('#6a5a3a', '#4d4028', '#332a1a'),
                 sec=R('#4a7a3a', '#356028', '#22401a'),
                 liquido=R('#8ac0d0', '#4a7f96', '#2f5464'),
                 roca=R('#7a7468', '#585349', '#3a3630'),
                 planta=R('#6aa04a', '#457a33', '#2c5220'),
                 madera=R('#8a6a42', '#5f4728', '#3a2b18'),
                 hueso=R('#e8e2cc', '#c0b8a0', '#8a8270'),
                 acento=R('#c8a0d8', '#9a5fb0', '#6b3a80'),
                 acento2=R('#e0b84a', '#b88a2a', '#7a5a18'),
                 acento3=R('#a0e0c8', '#4ab090', '#2a7060')),
        borde_sec='ondulado', borde_liq='ondulado',
        deco=['seta', 'seta:acento', 'seta:acento2', 'hongo_luz',
              'hongo_luz:acento3', 'helecho', 'helecho', 'hierba_alta',
              'hierba', 'arbusto', 'tronco', 'tocon', 'raiz', 'raiz',
              'roca', 'roca_grande', 'guijarros', 'telarana', 'hueso',
              'calavera', 'charco', 'burbujas', 'flor:acento', 'flor:acento3',
              'antorcha', 'columna', 'losa_rota', 'vasija', 'grieta',
              'cristal:acento', 'mineral', 'ceniza']),
    'desierto': dict(
        nombre='Desierto',
        pal=dict(base=R('#f0dcaa', '#dcc188', '#b89b66'),
                 sec=R('#d8a070', '#b87848', '#8a5230'),
                 liquido=R('#8fe0d8', '#4ab0a8', '#2a7870'),
                 roca=R('#c8a880', '#a08258', '#725a3a'),
                 planta=R('#8aa84a', '#5f7a2c', '#3d5218'),
                 madera=R('#c09858', '#8a6a34', '#5a441f'),
                 hueso=R('#f2ecd8', '#ded6bc', '#a89a80'),
                 acento=R('#e8c848', '#d8983a', '#a06a1c'),
                 acento2=R('#e08a6a', '#b85030', '#7a301a'),
                 acento3=R('#a0d8e8', '#4aa0c8', '#2a6888')),
        borde_sec='seco', borde_liq='espuma',
        deco=['cactus', 'cactus', 'duna', 'duna', 'palmera', 'arbusto',
              'hierba', 'roca', 'roca_grande', 'guijarros', 'grieta',
              'hueso', 'hueso', 'calavera', 'vasija', 'losa_rota', 'columna',
              'escalon', 'tronco', 'tocon', 'raiz', 'charco', 'flor:acento',
              'flor:acento2', 'mineral:acento', 'cristal:acento3',
              'telarana', 'antorcha', 'ceniza', 'concha', 'seta:acento2',
              'alga']),
    'pradera': dict(
        nombre='Pradera',
        pal=dict(base=R('#62b368', '#418546', '#37733c'),
                 sec=R('#aa8969', '#987656', '#745232'),
                 liquido=R('#8fd8e8', '#4aa8cf', '#2a6f9a'),
                 roca=R('#b8b0a0', '#8d8578', '#665f55'),
                 planta=R('#7ec46a', '#4f9a4a', '#356c36'),
                 madera=R('#c09858', '#8a6a34', '#5a441f'),
                 hueso=R('#f2ecd8', '#ded6bc', '#a89a80'),
                 acento=R('#f0d868', '#e0b83a', '#a8842a'),
                 acento2=R('#f2a0b0', '#d8607a', '#a03a50'),
                 acento3=R('#a0d8f0', '#4a9fd8', '#2a6a9a')),
        borde_sec='ondulado', borde_liq='espuma', sec_encima=False,
        deco=['hierba', 'hierba_alta', 'arbusto', 'flor', 'flor:acento2',
              'flor:acento3', 'helecho', 'trigo', 'girasol', 'calabaza',
              'zarza', 'seta', 'tocon', 'tronco', 'raiz', 'roca',
              'roca_grande', 'guijarros', 'charco', 'nenufar', 'junco',
              'valla', 'poste', 'cartel', 'barril', 'caja', 'hoguera',
              'farol', 'camino_losa', 'huellas', 'vasija', 'hueso'],
        grandes=[('arbol', dict(paleta='frondosa', forma='redonda')),
                 ('arbol', dict(paleta='frondosa', forma='redonda')),
                 ('arbol', dict(paleta='frondosa', forma='columna')),
                 ('arbol', dict(paleta='pino', forma='pino')),
                 ('arbol', dict(paleta='cerezo', forma='redonda', flores='rosa')),
                 ('arbusto', dict(paleta='frondosa', flores='rosa')),
                 ('tocon', dict(paleta='frondosa', setas=True)),
                 ('roca', dict(musgo=True))]),
    'nieve': dict(
        nombre='Nieve',
        pal=dict(base=R('#f2f6fa', '#dde5ee', '#b4c0cf'),
                 sec=R('#d0e4f0', '#a8c8dc', '#7fa0b8'),
                 liquido=R('#9fd4ec', '#5a9ec8', '#356e94'),
                 roca=R('#bcc4cc', '#8f979f', '#5f666e'),
                 planta=R('#6a9a5a', '#457038', '#2c4a24'),
                 madera=R('#9a7a58', '#6f553a', '#443423'),
                 hueso=R('#ffffff', '#e0e4e8', '#9aa4ac'),
                 acento=R('#a8e0f8', '#5fb0e0', '#2f7aa8'),
                 acento2=R('#f0c0d0', '#d07898', '#9a4a68'),
                 acento3=R('#d8d0f0', '#a89ad8', '#6b5f9a')),
        borde_sec='seco', borde_liq='espuma', sec_encima=False,
        deco=['monton_nieve', 'monton_nieve', 'carambano', 'carambano',
              'hierba', 'arbusto', 'tocon', 'tronco', 'raiz', 'roca',
              'roca_grande', 'guijarros', 'grieta', 'huellas', 'valla',
              'poste', 'cartel', 'hoguera', 'farol', 'caja', 'barril',
              'seta:acento2', 'cristal:acento', 'mineral', 'hueso',
              'calavera', 'charco', 'camino_losa', 'losa_rota', 'columna',
              'escalon', 'vasija'],
        grandes=[('arbol', dict(paleta='nieve', forma='pino')),
                 ('arbol', dict(paleta='nieve', forma='pino')),
                 ('arbol', dict(paleta='nieve', forma='redonda')),
                 ('arbol', dict(paleta='muerto', forma='seco')),
                 ('arbusto', dict(paleta='nieve')),
                 ('roca', dict()),
                 ('tocon', dict(paleta='muerto')),
                 ('mata', dict(paleta='seco', altas=True))]),
    'otono': dict(
        nombre='Otono',
        pal=dict(base=R('#c8ac6c', '#a88f4c', '#7a6630'),
                 sec=R('#d88c48', '#b06428', '#7f4318'),
                 liquido=R('#8fc8d8', '#4a94b8', '#2a5f7c'),
                 roca=R('#b0a894', '#87806e', '#5c564a'),
                 planta=R('#a8a83a', '#7a7a24', '#525216'),
                 madera=R('#b08050', '#7f5830', '#4f361c'),
                 hueso=R('#f2ecd8', '#ded6bc', '#a89a80'),
                 acento=R('#f0b040', '#d07818', '#96500c'),
                 acento2=R('#e07050', '#b83c28', '#7a2014'),
                 acento3=R('#c8d878', '#98a840', '#67741e')),
        borde_sec='ondulado', borde_liq='espuma', sec_encima=False,
        deco=['hierba', 'hierba_alta', 'arbusto', 'seta', 'seta:acento2',
              'hongo_luz:acento', 'tocon', 'tronco', 'raiz', 'zarza',
              'calabaza', 'trigo', 'flor:acento', 'flor:acento2', 'helecho',
              'roca', 'roca_grande', 'guijarros', 'charco', 'valla', 'poste',
              'cartel', 'barril', 'caja', 'hoguera', 'farol', 'camino_losa',
              'huellas', 'hueso', 'vasija', 'losa_rota', 'ceniza'],
        grandes=[('arbol', dict(paleta='otono', forma='redonda')),
                 ('arbol', dict(paleta='otono', forma='redonda')),
                 ('arbol', dict(paleta='otono', forma='columna')),
                 ('arbol', dict(paleta='seco', forma='seco')),
                 ('arbusto', dict(paleta='otono')),
                 ('tocon', dict(paleta='frondosa', setas=True)),
                 ('roca', dict(musgo=True)),
                 ('seta_gigante', dict(color='roja'))]),
    'jungla': dict(
        nombre='Jungla',
        pal=dict(base=R('#8a7a46', '#6b5c30', '#4a3f20'),
                 sec=R('#4f9a3a', '#357028', '#204a1c'),
                 liquido=R('#7fc8a8', '#3f9078', '#245e4c'),
                 roca=R('#8a8f7a', '#666b58', '#43483a'),
                 planta=R('#6ec04a', '#438f30', '#28601f'),
                 madera=R('#96693f', '#6f4c2c', '#3f2a18'),
                 hueso=R('#f0ecd8', '#ccc8b0', '#94907a'),
                 acento=R('#f0d048', '#d09818', '#96690c'),
                 acento2=R('#f07098', '#c03868', '#801f42'),
                 acento3=R('#88e0d0', '#38a894', '#1c6f60')),
        borde_sec='ondulado', borde_liq='ondulado',
        deco=['helecho', 'helecho', 'hierba_alta', 'hierba', 'arbusto',
              'flor:acento2', 'flor:acento', 'zarza', 'junco', 'nenufar',
              'raiz', 'raiz', 'tronco', 'tocon', 'seta:acento3', 'hongo_luz',
              'roca', 'roca_grande', 'guijarros', 'telarana', 'charco',
              'burbujas', 'hueso', 'calavera', 'vasija', 'columna',
              'losa_rota', 'escalon', 'antorcha', 'camino_losa', 'alga',
              'cristal:acento3'],
        grandes=[('arbol', dict(paleta='jungla', forma='redonda')),
                 ('arbol', dict(paleta='jungla', forma='redonda')),
                 ('arbol', dict(paleta='palmera', forma='palmera')),
                 ('bambu', dict(paleta='jungla')),
                 ('arbusto', dict(paleta='jungla')),
                 ('helecho', dict(paleta='jungla')),
                 ('seta_gigante', dict(color='lila')),
                 ('roca', dict(musgo=True))]),
    'fondo_marino': dict(
        nombre='Fondo marino',
        pal=dict(base=R('#d8dcc0', '#b8bfa0', '#8f9678'),
                 sec=R('#8aa8a8', '#5f7f80', '#3f5658'),
                 liquido=R('#5fb0e0', '#2f7fb8', '#1c5080'),
                 roca=R('#9ab0b0', '#6f8a8a', '#4a5f60'),
                 planta=R('#5fb08a', '#3f8060', '#28553f'),
                 madera=R('#8a7a5a', '#5f5238', '#3a3222'),
                 hueso=R('#f0ecd8', '#ccc8b0', '#94907a'),
                 acento=R('#f08a9a', '#d8506a', '#a02f48'),
                 acento2=R('#f0c86a', '#d89a2a', '#a06a18'),
                 acento3=R('#a0e8f0', '#4ac0d8', '#2a80a0')),
        borde_sec='ondulado', borde_liq='espuma',
        deco=['coral', 'coral:acento2', 'coral:acento3', 'alga', 'alga',
              'nenufar', 'estrella_mar', 'estrella_mar:acento2', 'concha',
              'concha:acento', 'burbujas', 'burbujas', 'roca', 'roca_grande',
              'guijarros', 'hueso', 'calavera', 'vasija', 'columna',
              'losa_rota', 'escalon', 'grieta', 'hongo_luz:acento3',
              'cristal:acento3', 'mineral:acento', 'tronco', 'raiz',
              'charco', 'hierba', 'telarana', 'ceniza', 'seta:acento']),
}



# ===========================================================================
# LAS PIEZAS GRANDES (2 x 3 TILES)
# ===========================================================================

GRANDES_POR_DEFECTO = [
    ('arbol', dict(paleta='frondosa', forma='redonda')),
    ('arbol', dict(paleta='pino', forma='pino')),
    ('arbusto', dict(paleta='frondosa')),
    ('tocon', dict(paleta='frondosa')),
    ('roca', dict(musgo=True)),
    ('roca', dict()),
    ('seta_gigante', dict(color='roja')),
    ('mata', dict(paleta='frondosa', altas=True)),
]

TAM_GRANDE = {
    'arbol': (30, 46), 'arbusto': (30, 24), 'tocon': (24, 22),
    'roca': (28, 22), 'seta_gigante': (28, 32), 'mata': (24, 22),
    'helecho': (28, 24), 'bambu': (28, 44), 'cactus': (26, 40),
}


def _pieza_grande(spec, semilla):
    """
    Un arbol (o lo que sea) de 2x3 tiles, o sea 32x48.

    POR QUE 2x3 Y NO 2x2. Un arbol en 32x32 es un arbusto: la copa se come el
    tronco y no queda sitio para que se lea que hay un tronco. Con tres filas
    de alto —48 px— hay copa, tronco y sombra de la copa sobre el tronco, que
    es lo minimo para que se lea como arbol al lado de los de `Game/Objetos`.
    Y sigue cuadrando en la rejilla de 16 del mapa.
    """
    fn, kw = spec
    w, h = TAM_GRANDE.get(fn, (30, 46))
    li = getattr(VEG, fn)(w, h, semilla=semilla, **kw)
    return VEG.en_tiles(li, 2, 3)


def _parte(grande, col, fila):
    """Recorta el tile (col, fila) de una pieza de 2x3."""
    t = Lienzo(T, T)
    for y in range(T):
        for x in range(T):
            c = grande.get(col * T + x, fila * T + y)
            if c[3]:
                t.set(x, y, c)
    return t

# ===========================================================================
# LOS 144 TILES
# ===========================================================================

def _deco_sobre(suelo_tile, deco_tile):
    t = Lienzo(T, T)
    t.pegar(suelo_tile)
    t.pegar(deco_tile)
    return t


def construye(tema):
    d = TEMAS[tema]
    pal = d['pal']
    s = sum(ord(c) for c in tema) % 97
    tiles = []
    fichas = []

    def add(t, nombre, papel):
        tiles.append(t)
        fichas.append({'i': len(tiles) - 1, 'nombre': nombre, 'papel': papel})

    # --- fila 0: suelos -----------------------------------------------------
    # Cuatro variantes del suelo: la primera LISA del todo y las otras con unas
    # pocas motas. Es como se ve el suelo del juego, y ademas asi las cuatro se
    # pueden alternar en un mapa grande sin que se note el patron.
    base4 = []
    for i in range(4):
        t = Lienzo(T, T)
        relleno(t, pal['base'], s + i * 7, motas=(0, 1, 2, 1)[i])
        base4.append(t)
        add(t, 'base_%d' % (i + 1), 'suelo')
    deco_suelo = ['guijarros', 'hierba', 'grieta', 'roca']
    for i in range(4):
        p = DECO.PINTORES[deco_suelo[i]](pal, s + 20 + i)
        add(_deco_sobre(base4[i], p), 'base_deco_%d' % (i + 1), 'suelo')
    sec4 = []
    for i in range(4):
        t = Lienzo(T, T)
        relleno(t, pal['sec'], s + 40 + i * 7, motas=(0, 1, 2, 1)[i])
        sec4.append(t)
        add(t, 'secundario_%d' % (i + 1), 'suelo')
    for i in range(4):
        p = DECO.PINTORES[deco_suelo[(i + 2) % 4]](pal, s + 60 + i)
        add(_deco_sobre(sec4[i], p), 'secundario_deco_%d' % (i + 1), 'suelo')

    # --- fila 1: transicion secundario sobre base ---------------------------
    for lado in LADOS:
        add(transicion(lado, pal['base'], pal['sec'], s, d['borde_sec'],
                       encima='dentro' if d.get('sec_encima', True) else 'fuera'),
            'sec_%s' % lado, 'transicion_secundario')
    cam = pal['roca']
    for nombre, horiz in (('camino_h', True), ('camino_v', False), ('camino_cruce', None)):
        t = Lienzo(T, T)
        relleno(t, pal['base'], s)
        m = Mascara(T, T)
        if horiz is not False:
            m.rect(0, 4, T - 1, 11)
        if horiz is not True:
            m.rect(4, 0, 11, T - 1)
        relleno(t, cam, s + 5, mascara=m)
        for x, y in m.borde_interno(False).puntos():
            t.set(x, y, cam[2])
        add(t, nombre, 'camino')

    # --- fila 2: liquido ----------------------------------------------------
    for lado in LADOS:
        add(transicion(lado, pal['base'], pal['liquido'], s + 2, d['borde_liq']),
            'liquido_%s' % lado, 'transicion_liquido')
    t = Lienzo(T, T)
    relleno(t, [ajusta(c, dv=0.72) for c in pal['liquido']], s + 3)
    add(t, 'liquido_hondo', 'liquido')
    t = Lienzo(T, T)
    relleno(t, [ajusta(c, dv=1.18) for c in pal['liquido']], s + 4)
    add(t, 'liquido_claro', 'liquido')
    # El agua no se textura con ruido: se le ponen DESTELLOS, dos rayas cortas
    # claras. Es lo que hace el juego y es lo que se lee como superficie.
    t = Lienzo(T, T)
    relleno(t, pal['liquido'], s + 6)
    for i, (bx, by, lg) in enumerate(((2, 4, 5), (9, 10, 4))):
        for x in range(bx, bx + lg):
            t.set(x, by, ajusta(pal['liquido'][0], dv=1.22))
    add(t, 'liquido_brillo', 'liquido')

    # --- fila 3: acantilado -------------------------------------------------
    for fila in range(3):
        for col in range(3):
            add(acantilado((fila, col), pal['base'], pal['roca'], s + 7),
                'acantilado_%d%d' % (fila, col), 'acantilado')
    for col, nombre in ((0, 'acantilado_int_izq'), (2, 'acantilado_int_der')):
        t = acantilado((1, 1), pal['base'], pal['roca'], s + 7)
        for y in range(T):
            for x in range(T):
                if (x < 4 and col == 0) or (x > T - 5 and col == 2):
                    t.set(x, y, pal['base'][1])
        add(t, nombre, 'acantilado')
    for i, nombre in enumerate(('escalera_arriba', 'escalera_cuerpo')):
        t = acantilado((0 if i == 0 else 1, 1), pal['base'], pal['roca'], s + 7)
        for j in range(0, T, 4):
            for x in range(3, T - 3):
                t.set(x, j + (0 if i else 8), ajusta(pal['roca'][0], dv=1.1))
                t.set(x, j + 1 + (0 if i else 8), pal['roca'][2])
        add(t, nombre, 'acantilado')
    for i in range(3):
        t = acantilado((1, 1), pal['base'], pal['roca'], s + 7)
        p = DECO.PINTORES[['grieta', 'raiz', 'mineral'][i]](pal, s + 30 + i)
        t.pegar(p)
        add(t, 'pared_deco_%d' % (i + 1), 'acantilado')

    # --- filas 4 y 5: objetos ------------------------------------------------
    # Varios temas repiten pintor a proposito (dos rocas, dos setas), pero
    # algunos pintores no miran la semilla y devuelven el MISMO dibujo. Al
    # segundo se le da la vuelta y, si aun asi coincide, se le corre un pixel:
    # dos tiles identicos en la misma hoja son dos ranuras desperdiciadas.
    vistos = set()
    for i, nombre in enumerate(d['deco'][:32]):
        pintor, _, clave = nombre.partition(':')
        if pintor not in DECO.PINTORES:
            pintor = 'roca'
        kw = {}
        if clave:
            kw['col'] = pal.get(clave, pal['acento'])
        try:
            t = DECO.PINTORES[pintor](pal, s + 100 + i, **kw)
        except TypeError:
            t = DECO.PINTORES[pintor](pal, s + 100 + i)
        if t.imagen().tobytes() in vistos:
            t = t.espejo_h()
        if t.imagen().tobytes() in vistos:
            n2 = Lienzo(t.w, t.h)
            n2.pegar(t, 1, 0)
            t = n2
        vistos.add(t.imagen().tobytes())
        add(t, '%s_%d' % (pintor, i + 1), 'objeto')

    # --- filas 6, 7 y 8: ocho piezas de 2x3 tiles ---------------------------
    # Se dibujan enteras y despues se parten, no al reves: un arbol partido en
    # seis trozos que se dibujan por separado no casa por las costuras.
    grandes = []
    specs = d.get('grandes') or GRANDES_POR_DEFECTO
    for i in range(8):
        spec = specs[i % len(specs)]
        grandes.append(_pieza_grande(spec, s + 500 + i * 17))
    for fila in range(3):
        for k in range(8):
            for col in range(2):
                add(_parte(grandes[k], col, fila),
                    'grande_%d_%d%d' % (k, fila, col), 'objeto_grande')

    while len(tiles) < COLS * FILAS:
        add(Lienzo(T, T), 'vacio_%d' % len(tiles), 'vacio')
    return tiles, fichas


# ===========================================================================
# INDICES FIJOS DE LA PLANTILLA
# ===========================================================================

BASE = [0, 1, 2, 3]
BASE_DECO = [4, 5, 6, 7]
SEC = [8, 9, 10, 11]
SEC_DECO = [12, 13, 14, 15]
TR_SEC = 16                                  # 16..28 en el orden de LADOS
CAMINO_H, CAMINO_V, CAMINO_X = 29, 30, 31
TR_LIQ = 32
LIQ_HONDO, LIQ_CLARO, LIQ_BRILLO = 45, 46, 47
ACA = 48                                     # 48..56 (3x3)
GRANDE0 = 96                                 # 96..143: 8 piezas de 2x3
ESCALERA = 59
DECO0 = 64

_ORDEN = dict((l, i) for i, l in enumerate(LADOS))


def pieza(dentro, n, s, e, o, ne, no, se, so, base_idx):
    """Elige la pieza de las 13 que toca segun los vecinos."""
    if not dentro:
        return None
    if not n and not o:
        k = 'NO'
    elif not n and not e:
        k = 'NE'
    elif not s and not o:
        k = 'SO'
    elif not s and not e:
        k = 'SE'
    elif not n:
        k = 'N'
    elif not s:
        k = 'S'
    elif not o:
        k = 'O'
    elif not e:
        k = 'E'
    elif not no:
        k = 'iNO'
    elif not ne:
        k = 'iNE'
    elif not so:
        k = 'iSO'
    elif not se:
        k = 'iSE'
    else:
        k = 'C'
    return base_idx + _ORDEN[k]


def pinta_mancha(forma, base_idx):
    """`forma` es una rejilla de 0/1. Devuelve la rejilla de indices."""
    al, an = len(forma), len(forma[0])

    def d(x, y):
        return 0 <= x < an and 0 <= y < al and forma[y][x]

    fuera = []
    for y in range(al):
        fila = []
        for x in range(an):
            fila.append(pieza(d(x, y), d(x, y - 1), d(x, y + 1), d(x + 1, y),
                              d(x - 1, y), d(x + 1, y - 1), d(x - 1, y - 1),
                              d(x + 1, y + 1), d(x - 1, y + 1), base_idx))
        fuera.append(fila)
    return fuera


def _forma(an, al, fn):
    return [[1 if fn(x, y) else 0 for x in range(an)] for y in range(al)]


def _fondo(an, al, idx=0):
    return [[idx for _ in range(an)] for _ in range(al)]


def _mezcla(fondo, capa):
    fuera = []
    for y in range(len(fondo)):
        fila = []
        for x in range(len(fondo[0])):
            c = capa[y][x] if y < len(capa) and x < len(capa[0]) else None
            fila.append([fondo[y][x]] if c is None else [fondo[y][x], c])
        fuera.append(fila)
    return fuera


# ===========================================================================
# LAS OCHO REFERENCIAS
# ===========================================================================

def ref_indice(tiles, tema):
    """El tileset con rejilla y numeros."""
    esc = 2
    li = Lienzo(COLS * T * esc + 2, FILAS * T * esc + 2)
    rejilla = A.hex_rgb('#2b3038')
    for y in range(li.h):
        for x in range(li.w):
            li.set(x, y, rejilla)
    for i, t in enumerate(tiles):
        cx = (i % COLS) * T * esc + 1
        cy = (i // COLS) * T * esc + 1
        for y in range(T):
            for x in range(T):
                c = t.get(x, y)
                if c[3]:
                    for dy in range(esc):
                        for dx in range(esc):
                            li.set(cx + x * esc + dx, cy + y * esc + dy, c)
        A.texto_pixel(li, cx + 1, cy + 1, str(i), (255, 255, 255))
        A.texto_pixel(li, cx + 2, cy + 2, str(i), (20, 20, 24))
        A.texto_pixel(li, cx + 1, cy + 1, str(i), (245, 245, 250))
    return li


def ref_terrenos(tiles):
    rej = []
    for y in range(8):
        fila = []
        for x in range(16):
            if x < 4:
                fila.append(BASE[(x + y) % 4])
            elif x < 6:
                fila.append(BASE_DECO[(x + y) % 4])
            elif x < 10:
                fila.append(SEC[(x + y) % 4])
            elif x < 12:
                fila.append(SEC_DECO[(x + y) % 4])
            elif x < 14:
                fila.append(LIQ_HONDO)
            else:
                fila.append(LIQ_CLARO)
        rej.append(fila)
    return rej


def ref_transicion(tiles):
    an, al = 16, 11
    forma = _forma(an, al, lambda x, y: (
        (x - 7.5) ** 2 / 30.0 + (y - 5) ** 2 / 12.0 < 1.0) or (2 <= x <= 5 and 1 <= y <= 3))
    capa = pinta_mancha(forma, TR_SEC)
    return _mezcla(_fondo(an, al, BASE[0]), capa)


def ref_agua(tiles):
    an, al = 16, 11
    forma = _forma(an, al, lambda x, y: (x - 8) ** 2 / 36.0 + (y - 5.5) ** 2 / 14.0 < 1.0)
    capa = pinta_mancha(forma, TR_LIQ)
    rej = _mezcla(_fondo(an, al, BASE[1]), capa)
    for y in range(al):
        for x in range(an):
            if forma[y][x] and all(forma[y + dy][x + dx]
                                   for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                                   if 0 <= y + dy < al and 0 <= x + dx < an):
                rej[y][x] = [BASE[1], LIQ_HONDO]
    rej[5][11] = [BASE[1], LIQ_BRILLO]
    return rej


def ref_acantilado(tiles):
    an, al = 16, 11
    rej = _fondo(an, al, BASE[0])
    for y in range(al):
        for x in range(an):
            rej[y][x] = [BASE[(x + y) % 4]]
    # meseta de la fila 0 a la 3, acantilado en las filas 4,5,6
    for x in range(2, 14):
        col = 0 if x == 2 else (2 if x == 13 else 1)
        rej[4][x] = [ACA + 0 * 3 + col]
        rej[5][x] = [ACA + 1 * 3 + col]
        rej[6][x] = [ACA + 2 * 3 + col]
    for y in range(0, 4):
        for x in range(2, 14):
            rej[y][x] = [SEC[(x + y) % 4]]
    rej[4][7] = [ESCALERA]
    rej[5][7] = [ESCALERA + 1]
    rej[6][7] = [ESCALERA + 1]
    return rej


def ref_camino(tiles):
    an, al = 16, 11
    rej = _fondo(an, al, BASE[0])
    for y in range(al):
        for x in range(an):
            rej[y][x] = [BASE[(x * 3 + y) % 4]]
    forma = _forma(an, al, lambda x, y: y >= 6)
    capa = pinta_mancha(forma, TR_SEC)
    rej = _mezcla([[r[0] for r in fila] for fila in rej], capa)
    for x in range(an):
        rej[3][x] = [BASE[0], CAMINO_H]
    for y in range(al):
        rej[y][10] = [BASE[0], CAMINO_V]
    rej[3][10] = [BASE[0], CAMINO_X]
    return rej


def ref_objetos(tiles):
    an, al = 16, 11
    rej = []
    for y in range(al):
        fila = []
        for x in range(an):
            fila.append([BASE[(x + y) % 4]])
        rej.append(fila)
    i = 0
    for fy in range(1, 9, 3):
        for fx in range(1, 15, 2):
            if i >= 32:
                break
            rej[fy][fx].append(DECO0 + i)
            i += 1
    return rej


def ref_escena(tiles):
    an, al = 20, 14
    rej = [[[BASE[(x * 5 + y * 3) % 4]] for x in range(an)] for y in range(al)]
    # una lengua de terreno secundario arriba a la izquierda
    forma = _forma(an, al, lambda x, y: x + y < 11)
    for y, fila in enumerate(pinta_mancha(forma, TR_SEC)):
        for x, v in enumerate(fila):
            if v is not None:
                rej[y][x].append(v)
    # laguna abajo a la derecha
    forma2 = _forma(an, al, lambda x, y: (x - 14) ** 2 / 20.0 + (y - 10) ** 2 / 8.0 < 1.0)
    for y, fila in enumerate(pinta_mancha(forma2, TR_LIQ)):
        for x, v in enumerate(fila):
            if v is not None:
                rej[y][x].append(v)
    # acantilado a media altura
    for x in range(2, 12):
        col = 0 if x == 2 else (2 if x == 11 else 1)
        rej[6][x] = [rej[6][x][0], ACA + col]
        rej[7][x] = [rej[7][x][0], ACA + 3 + col]
    # camino
    for y in range(8, al):
        rej[y][4] = [rej[y][4][0], CAMINO_V]
    # objetos repartidos
    for k, (x, y) in enumerate([(15, 2), (17, 4), (13, 3), (2, 11), (6, 12),
                                (8, 10), (18, 8), (1, 9), (10, 12), (16, 6)]):
        rej[y][x].append(DECO0 + (k * 3) % 32)
    return rej


REFS = [('ref_1_indice', None), ('ref_2_terrenos', ref_terrenos),
        ('ref_3_transicion', ref_transicion), ('ref_4_agua', ref_agua),
        ('ref_5_acantilado', ref_acantilado), ('ref_6_camino', ref_camino),
        ('ref_7_objetos', ref_objetos), ('ref_8_escena', ref_escena)]


# ===========================================================================

def main():
    solo = None
    if '--solo' in sys.argv:
        solo = sys.argv[sys.argv.index('--solo') + 1]
    indice = []
    for tema in sorted(TEMAS):
        if solo and tema != solo:
            continue
        tiles, fichas = construye(tema)
        carpeta = os.path.join(DESTINO, tema)
        hoja = GT.hoja(tiles, COLS)
        hoja.guardar(os.path.join(carpeta, '%s.png' % tema))
        for nombre, fn in REFS:
            if fn is None:
                li = ref_indice(tiles, tema)
            else:
                li = GT.mapa(tiles, COLS, fn(tiles))
            li.guardar(os.path.join(carpeta, '%s.png' % nombre))
        d = TEMAS[tema]
        ficha = {
            'tema': tema, 'nombre': d['nombre'],
            'imagen': '%s/%s/%s.png' % (WEB, tema, tema),
            'tile': T, 'columnas': COLS, 'filas': FILAS, 'tiles': len(tiles),
            'plantilla': {
                'suelo_base': BASE, 'suelo_base_deco': BASE_DECO,
                'suelo_secundario': SEC, 'suelo_secundario_deco': SEC_DECO,
                'transicion_secundario': {'desde': TR_SEC, 'orden': LADOS},
                'camino': {'h': CAMINO_H, 'v': CAMINO_V, 'cruce': CAMINO_X},
                'transicion_liquido': {'desde': TR_LIQ, 'orden': LADOS},
                'liquido': {'hondo': LIQ_HONDO, 'claro': LIQ_CLARO,
                            'brillo': LIQ_BRILLO},
                'acantilado': {'desde': ACA, 'forma': '3x3 filo/pared/pie',
                               'escalera': [ESCALERA, ESCALERA + 1]},
                'objetos': {'desde': DECO0, 'cuantos': 32,
                            'nota': 'fondo transparente, van en una capa por encima'},
                'objetos_grandes': {
                    'desde': GRANDE0, 'cuantas': 8, 'tiles': [2, 3],
                    'nota': ('ocho piezas de 2x3 tiles (arboles, arbustos, rocas). '
                             'La pieza k ocupa las columnas 2k y 2k+1 de las filas '
                             '6, 7 y 8: sus indices son 96+2k, 97+2k, 112+2k, '
                             '113+2k, 128+2k y 129+2k.')},
            },
            'referencias': ['%s/%s/%s.png' % (WEB, tema, n) for n, _ in REFS],
            'tiles_detalle': fichas,
        }
        with io.open(os.path.join(carpeta, '%s.json' % tema), 'w', encoding='utf-8') as fh:
            fh.write(json.dumps(ficha, ensure_ascii=False, indent=1))
        indice.append({'tema': tema, 'nombre': d['nombre'],
                       'carpeta': '%s/%s' % (WEB, tema),
                       'imagen': ficha['imagen'], 'json': '%s/%s/%s.json' % (WEB, tema, tema)})
        print('  %-14s %d tiles + 8 referencias' % (tema, len(tiles)))

    if not solo:
        with io.open(os.path.join(DESTINO, 'tilesets.json'), 'w', encoding='utf-8') as fh:
            fh.write(json.dumps({
                'pack': 'newpro/tilesets', 'version': 1, 'base_web': WEB,
                'tile': T, 'columnas': COLS, 'filas': FILAS,
                'descripcion': ('12 tilesets de 16x16 con la MISMA plantilla: el '
                                'mismo indice significa lo mismo en los doce, asi que un '
                                'mapa se repinta de tema cambiando solo la imagen. Las '
                                'filas 6, 7 y 8 son ocho piezas de 2x3 tiles (arboles y '
                                'arbustos) por tema.'),
                'tilesets': indice}, ensure_ascii=False, indent=1))
    print('%d tilesets en %s' % (len(indice), DESTINO))


if __name__ == '__main__':
    main()
