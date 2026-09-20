#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
PRUEBA DEL PACK NEWPRO — lo que no da error pero sale mal
=============================================================================

Los generadores nunca fallan: escriben un PNG pase lo que pase. Lo que hay que
cazar son los fallos MUDOS, que en un pack de mas de mil imagenes no se ven
mirando.

    1. IMAGEN VACIA          un pintor que no pinta nada deja un PNG casi
                             transparente y el inventario muestra un hueco.
    2. IMAGENES IDENTICAS    si dos fichas salen byte a byte iguales es que el
                             catalogo les dio la misma forma, la misma paleta y
                             el mismo patron: son la misma cosa con dos nombres.
    3. CATALOGO DESCUADRADO  un JSON que promete una ruta que no existe (o al
                             reves: un PNG que no esta en el JSON) rompe el
                             enganche silenciosamente.
    4. TAMANO IMPOSIBLE      un icono de 60 px no cabe en la casilla del
                             inventario del juego.
    5. FOTOGRAMA DESALINEADO los fotogramas de una animacion TIENEN que medir
                             todos lo mismo: si uno cambia de tamano, el sprite
                             pega un salto al pasar por el.
    6. SOMBRERO RECORTADO    relleno de sombrero llegando a la fila 0 sin nada
                             por encima: la copa esta cortada por el lienzo.
    7. RGBA                  el juego los carga con transparencia; un PNG en
                             modo P o RGB sale con el fondo en negro.
    8. TILESET DESCUADRADO   un tileset que no mida columnas*16 x filas*16, o
                             al que le falte una de las ocho referencias, no se
                             puede cargar con la plantilla comun.
    9. BALDOSA DE CULTIVO    tienen que ser 51x53 y OPACAS: una baldosa con
                             transparencias deja ver el suelo por debajo.

USO
---------------------------------------------------------------------------
    python tools/newpro-prueba.py
"""

import hashlib
import io
import json
import os
import sys

from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEWPRO = os.path.join(RAIZ, 'Game', 'newpro')
ORIGEN = os.path.join(RAIZ, 'Game', 'Sprites', 'Soulbound')

MAX_ICONO = 48
fallos = []
avisos = []


def falla(msg):
    fallos.append(msg)


def avisa(msg):
    avisos.append(msg)


def png_de(carpeta):
    fuera = []
    for raiz, _, archivos in os.walk(carpeta):
        for a in sorted(archivos):
            if a.lower().endswith('.png'):
                fuera.append(os.path.join(raiz, a))
    return fuera


def rel(p):
    return os.path.relpath(p, RAIZ).replace('\\', '/')


def datos(im):
    return list(im.get_flattened_data() if hasattr(im, 'get_flattened_data')
                else im.getdata())


# ---------------------------------------------------------------------------
# 1, 4, 7 — cada imagen por separado
# ---------------------------------------------------------------------------

def revisa_imagenes(carpeta, max_lado=MAX_ICONO, minimo=12):
    huellas = {}
    n = 0
    for ruta in png_de(carpeta):
        n += 1
        im = Image.open(ruta)
        if im.mode != 'RGBA':
            falla('%s no es RGBA (es %s)' % (rel(ruta), im.mode))
            continue
        opacos = sum(1 for c in datos(im) if c[3])
        if opacos == 0:
            falla('%s no tiene un solo pixel opaco' % rel(ruta))
        elif opacos < minimo:
            avisa('%s tiene solo %d pixeles opacos' % (rel(ruta), opacos))
        if max_lado and max(im.size) > max_lado:
            falla('%s mide %dx%d, pasa de %d' % (rel(ruta), im.size[0], im.size[1], max_lado))
        h = hashlib.sha1(im.tobytes()).hexdigest()
        huellas.setdefault(h, []).append(rel(ruta))
    return n, huellas


# ---------------------------------------------------------------------------
# 3 — el catalogo contra el disco
# ---------------------------------------------------------------------------

def revisa_catalogo(json_rel, clave, carpeta, campo='ruta'):
    ruta = os.path.join(NEWPRO, json_rel)
    if not os.path.isfile(ruta):
        falla('falta el catalogo %s' % json_rel)
        return
    with io.open(ruta, encoding='utf-8') as fh:
        d = json.load(fh)
    listadas = set()
    for it in d[clave]:
        web = it[campo]
        disco = os.path.join(RAIZ, web.lstrip('/').replace('/', os.sep))
        listadas.add(os.path.normcase(disco))
        if not os.path.isfile(disco):
            falla('%s promete %s y no existe' % (json_rel, web))
            continue
        im = Image.open(disco)
        if 'ancho' in it and (im.size[0], im.size[1]) != (it['ancho'], it['alto']):
            falla('%s dice que %s mide %dx%d y mide %dx%d'
                  % (json_rel, web, it['ancho'], it['alto'], im.size[0], im.size[1]))
    for p in png_de(carpeta):
        if os.path.normcase(p) not in listadas:
            falla('%s esta en el disco y no en %s' % (rel(p), json_rel))
    print('  %-26s %d fichas' % (json_rel, len(d[clave])))


# ---------------------------------------------------------------------------
# 5, 6 — los personajes andando
# ---------------------------------------------------------------------------

def revisa_personajes():
    cat = os.path.join(NEWPRO, 'personajes', 'pescadores.json')
    with io.open(cat, encoding='utf-8') as fh:
        d = json.load(fh)
    for pj in d['personajes']:
        carpeta = os.path.join(NEWPRO, 'personajes', pj['carpeta'])
        n = 0
        for dd in ('abajo', 'arriba', 'derecha', 'izquierda'):
            for i in range(1, 8):
                mio = os.path.join(carpeta, dd, 'run_%d.png' % i)
                base = os.path.join(ORIGEN, pj['base'], dd, 'run_%d.png' % i)
                if not os.path.isfile(mio):
                    falla('falta %s' % rel(mio))
                    continue
                n += 1
                a, b = Image.open(mio), Image.open(base)
                if a.size != b.size:
                    falla('%s mide %s y el cuerpo base %s: la animacion pegaria un salto'
                          % (rel(mio), a.size, b.size))
                pa, pb = a.convert('RGBA').load(), b.convert('RGBA').load()
                mio_0 = sum(1 for x in range(a.size[0])
                            if pa[x, 0][3] and pa[x, 0][:3] != (0, 0, 0))
                base_0 = sum(1 for x in range(b.size[0])
                             if pb[x, 0][3] and pb[x, 0][:3] != (0, 0, 0))
                if mio_0 > base_0 + 4:
                    avisa('%s llena %d pixeles de la fila 0 y el base solo %d: '
                          'sombrero recortado' % (rel(mio), mio_0, base_0))
        perfil = os.path.join(carpeta, 'Perfil', 'Perfil.png')
        if not os.path.isfile(perfil):
            falla('falta %s' % rel(perfil))
        else:
            n += 1
            bp = Image.open(os.path.join(ORIGEN, pj['base'], 'Perfil', 'Perfil.png'))
            if Image.open(perfil).size != bp.size:
                falla('%s no mide lo que el retrato base' % rel(perfil))
        if n != 29:
            falla('%s tiene %d archivos, deberian ser 29' % (pj['carpeta'], n))
    print('  %-26s %d personajes' % ('personajes/', len(d['personajes'])))


# ---------------------------------------------------------------------------
# 5 — la animacion de pesca
# ---------------------------------------------------------------------------

def revisa_pesca_anim():
    cat = os.path.join(NEWPRO, 'pesca_anim', 'pesca_anim.json')
    if not os.path.isfile(cat):
        falla('falta pesca_anim/pesca_anim.json')
        return
    with io.open(cat, encoding='utf-8') as fh:
        d = json.load(fh)
    total = 0
    for pj in d['personajes']:
        carpeta = os.path.join(NEWPRO, 'pesca_anim', pj['id'])
        tam = None
        for dd in ('abajo', 'arriba', 'derecha', 'izquierda'):
            tam_dir = None
            for i in range(1, 7):
                ruta = os.path.join(carpeta, dd, 'pescar_%d.png' % i)
                if not os.path.isfile(ruta):
                    falla('falta %s' % rel(ruta))
                    continue
                total += 1
                im = Image.open(ruta)
                if im.mode != 'RGBA':
                    falla('%s no es RGBA' % rel(ruta))
                if tam_dir is None:
                    tam_dir = im.size
                elif im.size != tam_dir:
                    falla('%s mide %s y los otros de %s miden %s: la animacion '
                          'pegaria un salto' % (rel(ruta), im.size, dd, tam_dir))
                if sum(1 for c in datos(im.convert('RGBA')) if c[3]) < 100:
                    falla('%s esta practicamente vacio' % rel(ruta))
        # el cuerpo tiene que caber con el margen declarado
        m = d['margen']
        base = os.path.join(ORIGEN, pj['cuerpo_base'], 'abajo', 'run_1.png')
        b = Image.open(base)
        esperado = (b.size[0] + m['x'] * 2, b.size[1] + m['y'] * 2)
        real = Image.open(os.path.join(carpeta, 'abajo', 'pescar_1.png')).size
        if real != esperado:
            falla('%s/abajo mide %s y con el margen declarado deberia medir %s'
                  % (pj['id'], real, esperado))
    print('  %-26s %d fotogramas' % ('pesca_anim/', total))


# ---------------------------------------------------------------------------
# 8 — los tilesets
# ---------------------------------------------------------------------------

def _vacio(px, ficha, i):
    cx = (i % ficha['columnas']) * ficha['tile']
    cy = (i // ficha['columnas']) * ficha['tile']
    tile = px.crop((cx, cy, cx + ficha['tile'], cy + ficha['tile']))
    return sum(1 for c in datos(tile) if c[3]) == 0


def revisa_tilesets():
    idx = os.path.join(NEWPRO, 'tilesets', 'tilesets.json')
    if not os.path.isfile(idx):
        falla('falta tilesets/tilesets.json')
        return
    with io.open(idx, encoding='utf-8') as fh:
        d = json.load(fh)
    for t in d['tilesets']:
        j = os.path.join(RAIZ, t['json'].lstrip('/').replace('/', os.sep))
        if not os.path.isfile(j):
            falla('falta %s' % t['json'])
            continue
        with io.open(j, encoding='utf-8') as fh:
            ficha = json.load(fh)
        img = os.path.join(RAIZ, ficha['imagen'].lstrip('/').replace('/', os.sep))
        if not os.path.isfile(img):
            falla('falta la imagen de %s' % t['tema'])
            continue
        im = Image.open(img)
        esperado = (ficha['columnas'] * ficha['tile'], ficha['filas'] * ficha['tile'])
        if im.size != esperado:
            falla('el tileset %s mide %s y deberia medir %s' % (t['tema'], im.size, esperado))
        if ficha['tiles'] != ficha['columnas'] * ficha['filas']:
            falla('%s dice tener %d tiles y la rejilla da %d'
                  % (t['tema'], ficha['tiles'], ficha['columnas'] * ficha['filas']))
        if len(ficha['referencias']) != 8:
            falla('%s tiene %d referencias, deberian ser 8'
                  % (t['tema'], len(ficha['referencias'])))
        for r in ficha['referencias']:
            rr = os.path.join(RAIZ, r.lstrip('/').replace('/', os.sep))
            if not os.path.isfile(rr):
                falla('falta la referencia %s' % r)
        # los tiles no pueden ser todos iguales
        px = im.convert('RGBA')
        vistos = set()
        vacios = 0
        llenos = {}
        g0 = (ficha.get('plantilla', {}).get('objetos_grandes') or {}).get('desde')
        for i in range(ficha['tiles']):
            cx = (i % ficha['columnas']) * ficha['tile']
            cy = (i // ficha['columnas']) * ficha['tile']
            tile = px.crop((cx, cy, cx + ficha['tile'], cy + ficha['tile']))
            opacos = sum(1 for c in datos(tile) if c[3])
            if opacos == 0:
                vacios += 1
            vistos.add(tile.tobytes())
            if g0 is not None and i >= g0:
                # la pieza k son las columnas 2k y 2k+1 de tres filas seguidas
                k = ((i - g0) % ficha['columnas']) // 2
                llenos[k] = llenos.get(k, 0) + opacos
        vacios_grandes = sum(1 for k, n in llenos.items() if n == 0)
        vacios_sueltos = vacios - sum(
            1 for i in range(ficha['tiles'])
            if g0 is not None and i >= g0 and _vacio(px, ficha, i))
        # Los tiles vacios de las filas de piezas grandes NO son un fallo: una
        # pieza de 2x3 que no es rectangular —un arbol, por ejemplo— deja las
        # esquinas de su recuadro en blanco a proposito. Lo que si seria un
        # fallo es una pieza ENTERA vacia, y eso lo caza `vacios_grandes`.
        desde = (ficha.get('plantilla', {}).get('objetos_grandes') or {}).get('desde')
        if desde is not None and vacios_grandes:
            falla('%s tiene %d piezas grandes enteras vacias'
                  % (t['tema'], vacios_grandes))
        if vacios_sueltos:
            avisa('%s tiene %d tiles vacios fuera de las piezas grandes'
                  % (t['tema'], vacios_sueltos))
        # El centro de la transicion (indice 20) ES el suelo secundario liso
        # (indice 8): esa pareja tiene que repetirse, porque el autotile
        # devuelve el 20 para las casillas de dentro de la mancha. Se descuenta.
        esperadas = 1
        repetidas = ficha['tiles'] - vacios - len(vistos) + (1 if vacios else 0)
        if repetidas > esperadas:
            avisa('%s tiene %d tiles repetidos' % (t['tema'], repetidas - esperadas))
    print('  %-26s %d temas' % ('tilesets/', len(d['tilesets'])))


# ---------------------------------------------------------------------------
# 9 — los cultivos
# ---------------------------------------------------------------------------

def revisa_siembras():
    j = os.path.join(NEWPRO, 'plantas', 'siembras.json')
    if not os.path.isfile(j):
        falla('falta plantas/siembras.json')
        return
    with io.open(j, encoding='utf-8') as fh:
        d = json.load(fh)
    for c in d['cultivos']:
        carpeta = os.path.join(NEWPRO, 'plantas', 'planta_%s' % c['id'])
        for i in range(1, 7):
            ruta = os.path.join(carpeta, '%d.png' % i)
            if not os.path.isfile(ruta):
                falla('falta %s' % rel(ruta))
                continue
            im = Image.open(ruta).convert('RGBA')
            if im.size != tuple(c['tam_baldosa']):
                falla('%s mide %s y deberia medir %s'
                      % (rel(ruta), im.size, tuple(c['tam_baldosa'])))
            transp = sum(1 for p in datos(im) if p[3] != 255)
            if transp:
                falla('%s tiene %d pixeles no opacos: una baldosa de cultivo se '
                      'dibuja como suelo y tiene que ser opaca' % (rel(ruta), transp))
        for nombre in c['items']:
            ruta = os.path.join(carpeta, '%s.png' % nombre)
            if not os.path.isfile(ruta):
                falla('falta %s' % rel(ruta))
    print('  %-26s %d cultivos nuevos' % ('plantas/', len(d['cultivos'])))



# ---------------------------------------------------------------------------
# 10 — vegetacion y construcciones
# ---------------------------------------------------------------------------

def revisa_piezas(json_rel, carpeta, max_lado=120):
    """
    Cada pieza suelta (arbol, casa, valla) va dos veces: a su tamano y
    encajada en la rejilla de 16. Se comprueban las dos.
    """
    ruta = os.path.join(NEWPRO, json_rel)
    if not os.path.isfile(ruta):
        falla('falta el catalogo %s' % json_rel)
        return
    with io.open(ruta, encoding='utf-8') as fh:
        d = json.load(fh)
    vistas = set()
    for f in d['piezas']:
        disco = os.path.join(RAIZ, f['ruta'].lstrip('/').replace('/', os.sep))
        if not os.path.isfile(disco):
            falla('%s promete %s y no existe' % (json_rel, f['ruta']))
            continue
        vistas.add(os.path.normcase(disco))
        im = Image.open(disco)
        if im.mode != 'RGBA':
            falla('%s no es RGBA' % rel(disco))
        if (im.size[0], im.size[1]) != (f['ancho'], f['alto']):
            falla('%s dice medir %dx%d y mide %dx%d'
                  % (f['id'], f['ancho'], f['alto'], im.size[0], im.size[1]))
        if max(im.size) > max_lado:
            falla('%s mide %dx%d, pasa de %d' % (f['id'], im.size[0], im.size[1], max_lado))
        px = im.convert('RGBA')
        opacos = sum(1 for c in datos(px) if c[3])
        if opacos < 30:
            falla('%s tiene solo %d pixeles opacos' % (f['id'], opacos))

        # la version encajada en la rejilla
        tdisco = os.path.join(RAIZ, f['ruta_tiles'].lstrip('/').replace('/', os.sep))
        if not os.path.isfile(tdisco):
            falla('%s no tiene version de tiles (%s)' % (f['id'], f['ruta_tiles']))
            continue
        vistas.add(os.path.normcase(tdisco))
        ti = Image.open(tdisco).convert('RGBA')
        cols, filas = f['tiles']
        if ti.size != (cols * 16, filas * 16):
            falla('%s en tiles mide %s y deberia medir %dx%d'
                  % (f['id'], ti.size, cols * 16, filas * 16))
            continue
        # TIENE QUE APOYAR ABAJO: un arbol que no toca el borde inferior de su
        # rejilla sale flotando un pixel por encima del suelo
        w, h = ti.size
        pt = ti.load()
        ultima = max((y for y in range(h) for x in range(w) if pt[x, y][3]),
                     default=-1)
        if ultima != h - 1:
            falla('%s en tiles no apoya en el borde de abajo (acaba en %d de %d)'
                  % (f['id'], ultima, h - 1))
    for r in png_de(os.path.join(NEWPRO, carpeta)):
        if os.path.normcase(r) in vistas:
            continue
        if os.path.basename(r).startswith('hoja_'):
            continue
        falla('%s esta en el disco y no en %s' % (rel(r), json_rel))
    print('  %-26s %d piezas' % (json_rel, len(d['piezas'])))


# ---------------------------------------------------------------------------
# 11 — los mapas completos
# ---------------------------------------------------------------------------

def revisa_mapas():
    j = os.path.join(NEWPRO, 'mapas', 'mapas.json')
    if not os.path.isfile(j):
        falla('falta mapas/mapas.json')
        return
    with io.open(j, encoding='utf-8') as fh:
        d = json.load(fh)
    an, al, tile = d['ancho_tiles'], d['alto_tiles'], d['tile']
    for m in d['mapas']:
        png = os.path.join(RAIZ, m['png'].lstrip('/').replace('/', os.sep))
        if not os.path.isfile(png):
            falla('falta el mapa %s' % m['png'])
            continue
        im = Image.open(png)
        if im.size != (an * tile, al * tile):
            falla('el mapa %s mide %s y deberia medir %dx%d'
                  % (m['tema'], im.size, an * tile, al * tile))
        # un mapa entero NO puede tener un solo pixel transparente: es un mapa
        if im.convert('RGBA').getextrema()[3][0] != 255:
            falla('el mapa %s tiene pixeles transparentes' % m['tema'])
        t = os.path.join(RAIZ, m['tiled'].lstrip('/').replace('/', os.sep))
        if not os.path.isfile(t):
            falla('falta el JSON de Tiled de %s' % m['tema'])
            continue
        with io.open(t, encoding='utf-8') as fh:
            td = json.load(fh)
        if (td['width'], td['height']) != (an, al):
            falla('el Tiled de %s dice %dx%d tiles' % (m['tema'], td['width'], td['height']))
        for capa in td['layers']:
            if capa['type'] != 'tilelayer':
                continue
            if len(capa['data']) != an * al:
                falla('la capa %s de %s tiene %d casillas y deberia tener %d'
                      % (capa['name'], m['tema'], len(capa['data']), an * al))
    print('  %-26s %d mapas completos' % ('mapas/', len(d['mapas'])))

# ---------------------------------------------------------------------------

def main():
    print('IMAGENES')
    total = 0
    huellas = {}
    for carpeta, max_lado, minimo in (('peces', MAX_ICONO, 12),
                                      ('pociones', 40, 12),
                                      ('pesca', MAX_ICONO, 12),
                                      ('comidas', 34, 12),
                                      ('objetos', 60, 20)):
        n, h = revisa_imagenes(os.path.join(NEWPRO, carpeta), max_lado, minimo)
        total += n
        for k, v in h.items():
            huellas.setdefault(k, []).extend(v)
        print('  %-12s %d PNG' % (carpeta, n))

    print('REPETIDAS')
    repes = [v for v in huellas.values() if len(v) > 1]
    for v in repes:
        falla('imagenes identicas: %s' % ', '.join(v))
    if not repes:
        print('  ninguna de %d imagenes se repite' % total)

    print('CATALOGOS')
    revisa_catalogo('peces/peces.json', 'peces', os.path.join(NEWPRO, 'peces'))
    revisa_catalogo('pociones/pociones.json', 'pociones', os.path.join(NEWPRO, 'pociones'))
    revisa_catalogo('pesca/pesca.json', 'items', os.path.join(NEWPRO, 'pesca'))
    revisa_catalogo('comidas/comidas.json', 'comidas', os.path.join(NEWPRO, 'comidas'))
    revisa_catalogo('objetos/objetos.json', 'objetos', os.path.join(NEWPRO, 'objetos'))

    print('SPRITES Y MAPAS')
    revisa_personajes()
    revisa_pesca_anim()
    revisa_tilesets()
    revisa_siembras()
    revisa_piezas('vegetacion/vegetacion.json', 'vegetacion', 120)
    revisa_piezas('construcciones/construcciones.json', 'construcciones', 120)
    revisa_mapas()

    print('')
    for a in avisos:
        print('AVISO  ' + a)
    for f in fallos:
        print('FALLO  ' + f)
    print('')
    if fallos:
        print('%d FALLOS, %d avisos' % (len(fallos), len(avisos)))
        return 1
    print('todo correcto (%d avisos)' % len(avisos))
    return 0


if __name__ == '__main__':
    sys.exit(main())
