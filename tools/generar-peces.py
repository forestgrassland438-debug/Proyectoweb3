#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
PECES — generador del banco de peces de `Game/newpro/peces/`
=============================================================================

QUE ESCRIBE
---------------------------------------------------------------------------
    Game/newpro/peces/<bioma>/pez_<id>.png     una imagen por especie
    Game/newpro/peces/peces.json               el catalogo entero en JSON

Una sola imagen por pez, sin animacion: son iconos de inventario y de lo que
pica en el anzuelo, no sprites que anden por el mapa.

    rio lago pantano costa mar arrecife abismo hielo caverna magico
    malos/  -> los que no valen para comer: podridos, enfermos y venenosos

DE DONDE SALE CADA PEZ
---------------------------------------------------------------------------
De cruzar dos tablas que estan en `gf_peces_catalogo.py`:

    la FICHA    id, nombre, grupo, rareza y lo que se quiera fijar a mano
    el GRUPO    arquetipo, rango de tamano, paletas y patrones posibles

y de pasarlo por el pincel de `gf_peces_arte.py`.

La paleta y el patron que la ficha no fija se REPARTEN por el puesto que ocupa
la especie dentro de su grupo (la primera trucha se lleva la primera paleta, la
segunda la segunda...), no se sortean: sorteandolos, en un grupo de diez con
doce libreas posibles se repetian casi seguro. El tamano si sale de un dado,
pero sembrado con el SHA-256 del id, asi que:

  * el mismo pez sale IGUAL en cada ejecucion — el generador es idempotente y
    se puede volver a lanzar sin ensuciar el repositorio;
  * dos peces del mismo grupo salen DISTINTOS entre si sin tener que elegirles
    la librea a mano uno por uno.

EL TAMANO LO MANDA LA RAREZA
---------------------------------------------------------------------------
Dentro del rango de su grupo, un pez comun tira a pequeno y uno legendario a
grande. No es decoracion: es la unica pista de valor que el jugador ve en el
inventario antes de leer el nombre.

USO
---------------------------------------------------------------------------
    python tools/generar-peces.py                genera todo
    python tools/generar-peces.py --hoja         ademas, hojas de contacto x4
                                                 en la carpeta temporal
    python tools/generar-peces.py --solo rio     solo un bioma
"""

import hashlib
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gf_arte as A
import gf_peces_arte as PA
import gf_peces_catalogo as CAT

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, 'Game', 'newpro', 'peces')
WEB = '/Game/newpro/peces'


def especie_a_spec(f, orden):
    """
    Ficha del catalogo -> lo que entiende el pincel.

    `orden` es el puesto que ocupa la especie DENTRO de su grupo, y sirve para
    repartir paletas y patrones en vez de sortearlos. Sorteandolos se repetian:
    con 4 paletas y 3 patrones hay 12 libreas, y en un grupo de 10 truchas la
    probabilidad de que dos caigan en la misma es casi del 100% (el problema
    del cumpleanos). Repartiendo por indice, las 10 truchas usan 10 libreas
    distintas y solo se repite si el grupo tiene mas especies que cruces.
    """
    g = CAT.GRUPOS[f['grupo']]
    rnd = A.rng_de('pez', f['id'])
    ex = f['extras']

    spec = dict(g['extra'])
    spec['id'] = f['id']
    spec['arq'] = ex.get('arq', g['arq'])
    spec['pal'] = ex.get('pal') or g['pal'][orden % len(g['pal'])]
    if ex.get('patron'):
        spec['patron'] = ex['patron']
    else:
        spec['patron'] = g['patron'][(orden // len(g['pal'])) % len(g['patron'])]

    if 'largo' in ex:
        largo = int(ex['largo'])
    else:
        lo, hi = g['tam']
        # el dado pesa la mitad y la rareza la otra mitad
        t = 0.55 * rnd.random() + 0.55 * CAT.RAREZA_TAM[f['rareza']]
        largo = int(round(lo + (hi - lo) * min(1.0, t)))
    spec['largo'] = largo

    if 'mal' in ex:
        spec['mal'] = ex['mal']
    for k in ('boca', 'escamas', 'ojo_ciego', 'brazos', 'patas'):
        if k in ex:
            spec[k] = ex[k] if k in ('boca',) else int(ex[k]) if ex[k].isdigit() else True
    return spec


def precio(f, ancho, alto):
    base = CAT.RAREZA_PRECIO[f['rareza']]
    tamano = 0.6 + (ancho * alto) / 420.0
    mal = f['extras'].get('mal')
    if mal in ('podrido', 'enfermo'):
        return 1
    if mal == 'venenoso':
        return max(3, int(base * 0.8))
    return max(1, int(round(base * tamano)))


def main():
    solo = None
    if '--solo' in sys.argv:
        solo = sys.argv[sys.argv.index('--solo') + 1]
    hoja = '--hoja' in sys.argv

    fichas = CAT.fichas()
    catalogo = []
    por_carpeta = {}
    vistas = {}
    orden_grupo = {}
    n = 0
    for f in fichas:
        if solo and f['carpeta'] != solo:
            continue
        orden = orden_grupo.get(f['grupo'], 0)
        orden_grupo[f['grupo']] = orden + 1
        spec = especie_a_spec(f, orden)
        li = PA.dibujar(spec)
        # Ultimo cerrojo: si aun asi salen dos peces IGUALES byte a byte (dos
        # fichas que fijan la misma paleta a mano y caen en el mismo tamano),
        # se le mueve el tamano a la segunda hasta que se separen. Comprobado
        # sobre los pixeles, no sobre la configuracion: es lo unico que
        # garantiza que no hay dos especies con la misma imagen.
        for intento in range(1, 9):
            huella = hashlib.sha1(li.imagen().tobytes()).hexdigest()
            if huella not in vistas:
                break
            spec['largo'] = spec['largo'] + (intento if intento % 2 else -intento)
            li = PA.dibujar(spec)
        vistas[huella] = f['id']
        carpeta = os.path.join(DESTINO, f['carpeta'])
        ruta = os.path.join(carpeta, 'pez_%s.png' % f['id'])
        li.guardar(ruta)
        por_carpeta.setdefault(f['carpeta'], []).append(ruta)
        n += 1

        mal = f['extras'].get('mal')
        catalogo.append({
            'id': 'pez_' + f['id'],
            'nombre': f['nombre'],
            'bioma': f['bioma'],
            'rareza': f['rareza'],
            'calidad': 'malo' if mal else 'bueno',
            'estado': mal or 'fresco',
            'arquetipo': spec['arq'],
            'paleta': spec['pal'],
            'patron': spec['patron'],
            'largo_cuerpo': spec['largo'],
            'ancho': li.w,
            'alto': li.h,
            'precio': precio(f, li.w, li.h),
            'maxStack': 20 if not mal else 10,
            'ruta': '%s/%s/pez_%s.png' % (WEB, f['carpeta'], f['id']),
            'clave_phaser': 'pez_%s' % f['id'],
        })
        if n % 50 == 0:
            sys.stdout.write('  %d...\n' % n)
            sys.stdout.flush()

    if not solo:
        resumen = {}
        for c in catalogo:
            resumen[c['bioma']] = resumen.get(c['bioma'], 0) + 1
        with io.open(os.path.join(DESTINO, 'peces.json'), 'w', encoding='utf-8') as fh:
            fh.write(json.dumps({
                'pack': 'newpro/peces',
                'version': 1,
                'descripcion': 'Banco de peces de Grassland Forest: una imagen por especie, sin animacion.',
                'base_web': WEB,
                'total': len(catalogo),
                'buenos': sum(1 for c in catalogo if c['calidad'] == 'bueno'),
                'malos': sum(1 for c in catalogo if c['calidad'] == 'malo'),
                'por_bioma': resumen,
                'rarezas': list(CAT.RAREZA_PRECIO.keys()),
                'peces': catalogo,
            }, ensure_ascii=False, indent=1))

    print('%d peces escritos en %s' % (n, DESTINO))

    if hoja:
        tmp = os.environ.get('TEMP', '.')
        for carpeta, rutas in sorted(por_carpeta.items()):
            h = A.hoja_contacto(sorted(rutas), columnas=12, escala=4)
            d = os.path.join(tmp, 'gf_hojas')
            if not os.path.isdir(d):
                os.makedirs(d)
            h.save(os.path.join(d, 'peces_%s.png' % carpeta))
        print('hojas de contacto en %s' % os.path.join(tmp, 'gf_hojas'))


if __name__ == '__main__':
    main()
