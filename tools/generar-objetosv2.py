#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
OBJETOS V2 — Game/newpro/objetosv2                                (2026-11-02)
=============================================================================

    python tools/generar-objetosv2.py                 todo
    python tools/generar-objetosv2.py casas arboles   solo esas carpetas

Escribe en Game/newpro/objetosv2/<carpeta>/ y un catalogo.json con los nombres
en inglés, y hojas de contacto en _hojas/ para revisarlas de un vistazo. Es
idempotente: el azar se siembra con el id de cada pieza. Los PNG no se retocan a
mano: el cambio va aquí (memoria newpro-generado).
=============================================================================
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gf_arte as A  # noqa: E402
import gf_objetosv2 as O  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(RAIZ, 'Game', 'newpro', 'objetosv2')


def carpeta(*p):
    r = os.path.join(SALIDA, *p)
    os.makedirs(r, exist_ok=True)
    return r


def guardar(im, *p):
    ruta = os.path.join(SALIDA, *p)
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    im.save(ruta, optimize=True)
    return ruta


def hoja(nombre, imagenes, **kw):
    guardar(O.hoja_contacto(imagenes, **kw), '_hojas', nombre + '.png')


# ── LAS CASAS ────────────────────────────────────────────────────────────────
TECHOS = ['frente', 'lado', 'cuatro', 'mansarda', 'granero', 'pagoda', 'plano', 'chapitel', 'cupula', 'triangulo']
NOMBRE_TECHO = {'frente': 'Gabled', 'lado': 'Long', 'cuatro': 'Hipped', 'mansarda': 'Mansard', 'granero': 'Barn',
                'pagoda': 'Pagoda', 'plano': 'Terrace', 'chapitel': 'Tower', 'cupula': 'Domed', 'triangulo': 'A-Frame'}
# Lo que pega con cada forma: (muros, tejados).
ESTILO_TECHO = {
    'frente':   (['ladrillo', 'estuco_azul', 'estuco_verde', 'tablas_rojo', 'tablas_verde', 'marmol'], ['pizarra_verde', 'teja_naranja', 'teja_turquesa', 'pizarra_morada', 'teja_rosa']),
    'lado':     (['estuco', 'entramado', 'tablas_azul', 'ladrillo_oscuro', 'estuco_rosa', 'troncos'], ['paja', 'paja_vieja', 'teja_roja', 'musgo', 'madera', 'negro']),
    'cuatro':   (['estuco_rosa', 'marmol', 'ladrillo', 'entramado', 'estuco_azul', 'tablas'], ['teja_azul', 'teja_roja', 'zinc', 'pizarra_morada', 'teja_turquesa']),
    'mansarda': (['ladrillo_oscuro', 'estuco', 'marmol', 'estuco_verde', 'ladrillo'], ['negro', 'zinc', 'cobre', 'pizarra_morada', 'teja_azul']),
    'granero':  (['tablas_rojo', 'tablas_verde', 'tablas_azul', 'tablas', 'troncos'], ['zinc', 'madera', 'negro', 'musgo', 'teja_roja']),
    'pagoda':   (['estuco', 'bambu', 'marmol', 'estuco_rosa', 'tablas_rojo'], ['teja_turquesa', 'teja_roja', 'negro', 'cobre', 'oro']),
    'plano':    (['adobe', 'estuco', 'estuco_rosa', 'marmol', 'estuco_azul'], ['teja_turquesa', 'oro', 'cobre', 'teja_azul', 'teja_naranja']),
    'chapitel': (['piedra', 'marmol', 'ladrillo', 'estuco_azul', 'entramado'], ['pizarra_morada', 'cobre', 'teja_azul', 'teja_roja', 'negro']),
    'cupula':   (['marmol', 'adobe', 'estuco_azul', 'estuco', 'estuco_rosa'], ['cobre', 'oro', 'teja_turquesa', 'teja_azul', 'pizarra_morada']),
    'triangulo': (['tablas', 'tablas_azul', 'bambu', 'troncos', 'tablas_verde'], ['madera', 'nieve', 'musgo', 'zinc', 'paja']),
}
TAM_TECHO = {'frente': (186, 226), 'lado': (232, 190), 'cuatro': (220, 196), 'mansarda': (214, 214), 'granero': (214, 220),
             'pagoda': (210, 232), 'plano': (214, 172), 'chapitel': (236, 232), 'cupula': (208, 214), 'triangulo': (196, 214)}
ADJ_MURO = {'piedra': 'Stone', 'ladrillo': 'Brick', 'ladrillo_oscuro': 'Dark Brick', 'estuco': 'Cream', 'estuco_rosa': 'Rose', 'estuco_azul': 'Sky',
            'estuco_verde': 'Sage', 'entramado': 'Timber', 'troncos': 'Log', 'tablas': 'Plank', 'tablas_azul': 'Harbor', 'tablas_rojo': 'Crimson',
            'tablas_verde': 'Forest', 'adobe': 'Adobe', 'bambu': 'Bamboo', 'marmol': 'Marble'}
SUFIJO = ['Cottage', 'House', 'Lodge', 'Manor', 'Retreat', 'Hall', 'Home', 'Villa', 'Cabin', 'Dwelling']


def casas():
    cat, imgs = [], []
    n = 0
    for techo in TECHOS:
        muros, tejados = ESTILO_TECHO[techo]
        for k in range(10):
            n += 1
            idc = 'casa_%03d' % n
            rng = A.rng_de('objetosv2', idc)
            muro = muros[k % len(muros)]
            tejado = tejados[(k * 2 + k // 5) % len(tejados)]
            viga = O.VIGAS[(k * 3 + TECHOS.index(techo)) % len(O.VIGAS)]
            w, h = TAM_TECHO[techo]
            w += (k % 4) * 16
            decor = {
                'chimenea': k % 3 != 1, 'chim_color': ['#8b5a4a', '#6f6a62', '#a4553f'][k % 3],
                'postigos': ['#3f6f9b', None, '#7a2f2f', '#3f7a4a', None, '#c9a23f', '#6a4a8a'][k % 7],
                'flores': ['#d94f6a', None, '#e8c34a', '#c26ad9', None][k % 5],
                'toldo': [None, '#b8423a', None, '#2f6f8f', None, None, '#d9822b'][k % 7],
                'letrero': ['#e8c35a', None, None, '#e8e4da', None][k % 5],
                'farol': k % 2 == 0, 'hiedra': k % 4 == 1, 'veleta': k % 5 == 3,
                'arco': k % 3 != 2, 'doble': k % 4 == 3, 'esquinas': k % 3 == 0, 'claraboya': k % 4 == 0,
                'puerta_color': ['#7a4a2e', '#3f6f9b', '#7a2f2f', '#3f7a4a', '#d9c9a0', '#2c2c34'][k % 6],
                'puerta_dx': [0, 0, -28, 0, 28][k % 5] if techo not in ('triangulo', 'cupula') else 0,
                'ventana': [(26, 18), (22, 20), (30, 18), (24, 16)][k % 4],
                'puerta_w': 26 + (k % 3) * 2, 'puerta_h': 44,
                'muro': int(h * (0.27 + 0.02 * (k % 2))),
                'hastial_muro': ['tablas', 'estuco', 'tablas_azul', 'entramado', 'tablas_rojo'][k % 5],
                'buhardillas': 2 + k % 2,
                'zocalo': ['#6f6a62', '#7a6a58', '#5f6670'][k % 3],
            }
            lam = O.casa_v2(idc, w, h, techo, muro, tejado, viga, decor, rng)
            im = lam.recortada()
            guardar(im, 'casas', idc + '.png')
            nombre = '%s %s %s' % (ADJ_MURO[muro], NOMBRE_TECHO[techo], SUFIJO[k % len(SUFIJO)])
            cat.append(dict(id=idc, nombre=nombre, techo=techo, muro=muro, tejado=tejado, ancho=im.width, alto=im.height, ruta='casas/%s.png' % idc))
            imgs.append(im)
    hoja('casas', imgs, columnas=10, escala=1)
    return cat


# ── LOS ÁRBOLES ──────────────────────────────────────────────────────────────
# (nombre inglés, forma, tronco, ancho, alto, [(apellido, copa), ...]): 20 especies x 5 variantes.
ARBOLES = [
    ('Oak', 'redondo', 'marron', 112, 142, [('Summer', 'bosque'), ('Spring', 'lima'), ('Autumn', 'otono'), ('Deep', 'oscuro'), ('Golden', 'oro')]),
    ('Beech', 'grande', 'gris', 122, 150, [('Green', 'bosque'), ('Copper', 'arce'), ('Young', 'lima'), ('Shade', 'oscuro'), ('Amber', 'otono')]),
    ('Poplar', 'ovalado', 'gris', 74, 158, [('Green', 'bosque'), ('Silver', 'menta'), ('Yellow', 'oro'), ('Dark', 'oscuro'), ('Fresh', 'lima')]),
    ('Maple', 'redondo', 'rojizo', 108, 138, [('Crimson', 'arce'), ('Fire', 'otono'), ('Gold', 'oro'), ('Green', 'bosque'), ('Royal', 'magenta')]),
    ('Cherry', 'grande', 'oscuro', 110, 130, [('Blossom', 'cerezo'), ('Rose', 'magenta'), ('Pale', 'escarcha'), ('Lilac', 'lila'), ('Leafy', 'lima')]),
    ('Jacaranda', 'sombrilla', 'oscuro', 124, 136, [('Violet', 'lila'), ('Pink', 'cerezo'), ('Blue', 'turquesa'), ('Dusk', 'magenta'), ('Pale', 'escarcha')]),
    ('Acacia', 'sombrilla', 'marron', 132, 128, [('Savanna', 'lima'), ('Dry', 'oro'), ('Green', 'bosque'), ('Dusty', 'otono'), ('Deep', 'oscuro')]),
    ('Willow', 'lloron', 'marron', 118, 140, [('Green', 'bosque'), ('Pale', 'menta'), ('Spring', 'lima'), ('Golden', 'oro'), ('Night', 'oscuro')]),
    ('Weeping Cherry', 'lloron', 'oscuro', 112, 134, [('Rose', 'cerezo'), ('Violet', 'lila'), ('Ember', 'arce'), ('Frost', 'escarcha'), ('Coral', 'magenta')]),
    ('Pine', 'pino', 'marron', 96, 148, [('Green', 'bosque'), ('Blue', 'menta'), ('Dark', 'oscuro'), ('Young', 'lima'), ('Sea', 'turquesa')]),
    ('Fir', 'abeto', 'oscuro', 92, 162, [('Forest', 'oscuro'), ('Green', 'bosque'), ('Silver', 'menta'), ('Teal', 'turquesa'), ('Larch', 'oro')]),
    ('Snow Fir', 'nevado', 'oscuro', 96, 158, [('Winter', 'oscuro'), ('Ice', 'menta'), ('Polar', 'bosque'), ('Glacier', 'turquesa'), ('Pale', 'escarcha')]),
    ('Cypress', 'cipres', 'oscuro', 46, 150, [('Green', 'oscuro'), ('Olive', 'bosque'), ('Sea', 'turquesa'), ('Sun', 'lima'), ('Mint', 'menta')]),
    ('Palm', 'palmera', 'palma', 116, 150, [('Island', 'bosque'), ('Coast', 'lima'), ('Sea', 'menta'), ('Sunset', 'otono'), ('Oasis', 'oscuro')]),
    ('Date Palm', 'palmera', 'marron', 126, 168, [('Green', 'oscuro'), ('Dry', 'oro'), ('Blue', 'turquesa'), ('Young', 'lima'), ('Red', 'arce')]),
    ('Baobab', 'baobab', 'gris', 124, 136, [('Old', 'bosque'), ('Dry', 'oro'), ('Rain', 'lima'), ('Red', 'otono'), ('Dusk', 'lila')]),
    ('Birch', 'abedul', 'blanco', 86, 148, [('White', 'lima'), ('Autumn', 'oro'), ('Green', 'bosque'), ('Silver', 'menta'), ('Copper', 'otono')]),
    ('Dead Tree', 'seco', 'gris', 96, 126, [('Ash', None), ('Dry', None), ('Burnt', None), ('Hollow', None), ('Pale', None)]),
    ('Fairy Tree', 'grande', 'blanco', 112, 142, [('Teal', 'turquesa'), ('Pink', 'magenta'), ('Moon', 'escarcha'), ('Dream', 'lila'), ('Sun', 'oro')]),
    ('Round Bush Tree', 'redondo', 'oscuro', 86, 106, [('Green', 'bosque'), ('Bright', 'lima'), ('Fire', 'arce'), ('Rose', 'cerezo'), ('Sea', 'turquesa')]),
]
TRONCO_SECO = ['gris', 'marron', 'oscuro', 'rojizo', 'blanco']


def arboles():
    cat, imgs = [], []
    n = 0
    for nombre, forma, tronco, w, h, variantes in ARBOLES:
        for k, (ape, copa) in enumerate(variantes):
            n += 1
            idc = 'arbol_%03d' % n
            rng = A.rng_de('objetosv2', idc)
            t = TRONCO_SECO[k] if forma == 'seco' else tronco
            ww = w + (k % 3) * 6
            hh = h + (k % 2) * 8
            lam = O.arbol_v2(forma, copa or 'bosque', t, ww, hh, rng)
            im = lam.recortada()
            guardar(im, 'arboles', idc + '.png')
            cat.append(dict(id=idc, nombre='%s %s' % (ape, nombre), forma=forma, ancho=im.width, alto=im.height, ruta='arboles/%s.png' % idc))
            imgs.append(im)
    hoja('arboles', imgs, columnas=10, escala=1)
    return cat


# ── LAS MONTURAS ─────────────────────────────────────────────────────────────
# Un atlas por montura: 3 filas (de lado mirando a la derecha, de frente, de espaldas) y 4 columnas
# (el paso). El juego voltea el de lado para ir a la izquierda. `silla` dice a qué altura va el jinete.
NOMBRES_MONTURA = {'horse': 'Horse', 'pony': 'Pony', 'donkey': 'Donkey', 'zebra': 'Zebra', 'camel': 'Camel', 'llama': 'Llama',
                   'reindeer': 'Reindeer', 'elk': 'Elk', 'ox': 'Ox', 'yak': 'Yak', 'boar': 'Boar', 'ram': 'Ram', 'wolf': 'Wolf', 'bear': 'Bear',
                   'lion': 'Lion', 'tiger': 'Tiger', 'panther': 'Panther', 'rhino': 'Rhino', 'ostrich': 'Ostrich', 'raptor': 'Raptor'}
# Nivel y velocidad por especie: lo grande cuesta más nivel y corre más.
TIER_MONTURA = {'donkey': (5, 1.2), 'pony': (6, 1.22), 'llama': (8, 1.25), 'ram': (9, 1.26), 'boar': (10, 1.28), 'ox': (11, 1.25), 'camel': (12, 1.3),
                'horse': (14, 1.4), 'zebra': (15, 1.4), 'reindeer': (16, 1.42), 'yak': (17, 1.3), 'elk': (19, 1.44), 'ostrich': (20, 1.5), 'wolf': (22, 1.5),
                'bear': (24, 1.38), 'panther': (26, 1.56), 'tiger': (28, 1.56), 'lion': (30, 1.56), 'raptor': (33, 1.62), 'rhino': (36, 1.46)}


def monturas():
    from PIL import Image
    cat, imgs, iconos = [], [], []
    n = 0
    W, H = 84, 68
    for esp in NOMBRES_MONTURA:
        for k, (ape, coat, marca) in enumerate(O.PELAJES[esp]):
            n += 1
            idc = 'montura_%03d' % n
            manta = O.MANTAS[(n * 3 + k) % len(O.MANTAS)]
            atlas = Image.new('RGBA', (W * 4, H * 3), (0, 0, 0, 0))
            silla = {}
            for fila, vista in enumerate(('lado', 'abajo', 'arriba')):
                for col in range(4):
                    lam, info = O.montura_cuadro(esp, coat, marca, manta, vista, col / 4.0, W, H)
                    O.contornear(lam, O.contorno(coat)) if False else None
                    atlas.alpha_composite(lam.imagen(), (col * W, fila * H))
                    if col == 0:
                        silla[vista] = round(H - info['silla_y'], 1)
            guardar(atlas, 'monturas', idc + '.png')
            icono = atlas.crop((0, 0, W, H))
            guardar(icono.crop(icono.getbbox()), 'monturas', 'iconos', idc + '.png')
            imgs.append(icono)
            nivel, vel = TIER_MONTURA[esp]
            cat.append(dict(id=idc, especie=esp, nombre='%s %s' % (ape, NOMBRES_MONTURA[esp]), nivel=nivel + k // 2, velocidad=vel, cuadro=[W, H],
                            silla=silla, ruta='monturas/%s.png' % idc))
    hoja('monturas', imgs, columnas=10, escala=2)
    return cat


# ── LA COMIDA ────────────────────────────────────────────────────────────────
# Los panes de Martha y las tortas de Tobias. Las recetas y los precios están en gf-items-v2.js:
# aquí solo el dibujo. id → (forma, color de la corteza, adorno).
PANES = [
    ('pan_hogaza', 'Country Loaf', 'hogaza', '#b97a3c', None), ('pan_molde', 'Sandwich Loaf', 'molde', '#c88f4c', None),
    ('pan_baguette', 'Baguette', 'baguette', '#c98a3e', None), ('pan_bollo', 'Milk Bun', 'bollo', '#d9a55e', None),
    ('pan_integral', 'Whole Wheat Loaf', 'molde', '#8a5a30', None), ('pan_plano', 'Flatbread', 'plana', '#d6ab68', None),
    ('pan_croissant', 'Butter Croissant', 'croissant', '#d39a45', None), ('pan_trenza', 'Egg Braid', 'trenza', '#c98836', None),
    ('pan_pretzel', 'Pretzel', 'pretzel', '#b06a2c', None), ('pan_ajo', 'Garlic Bread', 'ciabatta', '#c79a55', '#7fa24a'),
    ('pan_cebolla', 'Onion Roll', 'bollo', '#c08c4c', '#8a5a9a'), ('pan_zanahoria', 'Carrot Loaf', 'molde', '#c8752f', '#e9a04a'),
    ('pan_tomate', 'Tomato Focaccia', 'focaccia', '#d2a257', '#c8452f'), ('pan_espinaca', 'Spinach Twist', 'trenza', '#7f9a4a', None),
    ('pan_calabaza', 'Pumpkin Loaf', 'hogaza', '#c9792b', None), ('pan_patata', 'Potato Ring', 'rosca', '#cfa866', None),
    ('pan_romero', 'Rosemary Focaccia', 'focaccia', '#c79a52', '#5f8f55'), ('pan_platano', 'Banana Bread', 'molde', '#a9803a', '#e8d27a'),
    ('pan_manzana', 'Apple Spiral', 'espiral', '#c9954a', '#b5402f'), ('pan_chocolate', 'Chocolate Brioche', 'bollo', '#6b4128', '#3f2415'),
]
TORTAS = [
    ('torta_vainilla', 'Vanilla Sponge', 'redonda', '#e0c282', '#fbf3df', None), ('torta_cupcake', 'Cream Cupcake', 'magdalena', '#d9a0b0', '#fbf3df', '#c8352f'),
    ('torta_fresa', 'Strawberry Cake', 'redonda', '#efd9a8', '#f3b6c4', '#c8352f'), ('torta_chocolate', 'Chocolate Cake', 'redonda', '#5e3620', '#7c4a2b', None),
    ('torta_zanahoria', 'Carrot Cake', 'cuadrada', '#c8752f', '#fbf3df', '#e9862f'), ('torta_calabaza', 'Pumpkin Pie', 'pastel', '#c99a5a', '#d97a2b', None),
    ('torta_rollo', 'Cream Roll', 'rollo', '#c98f4e', '#fbf3df', None), ('torta_manzana', 'Apple Pie', 'pastel', '#c99a5a', '#b5613a', None),
    ('torta_limon', 'Lemon Tart', 'pastel', '#d8b070', '#f0d94f', None), ('torta_naranja', 'Orange Bundt', 'corona', '#d98c35', '#fbe7b8', None),
    ('torta_melocoton', 'Peach Slice', 'porcion', '#efcf95', '#f6b27a', '#e9862f'), ('torta_pera', 'Pear Tart', 'pastel', '#c99a5a', '#c9cf6a', None),
    ('torta_ciruela', 'Plum Cake', 'cuadrada', '#6e3f6b', '#c79ac4', '#7a3a7a'), ('torta_higo', 'Fig Slice', 'porcion', '#c9a06a', '#8a5a88', '#6a3f70'),
    ('torta_platano', 'Banana Cream Cake', 'redonda', '#e9cf8c', '#f6e7a0', None), ('torta_mango', 'Mango Cheesecake', 'porcion', '#f0e2b8', '#f2a93b', '#e9862f'),
    ('torta_melon', 'Melon Chiffon', 'redonda', '#c9dd9a', '#e6f2c0', None), ('torta_sandia', 'Watermelon Cake', 'redonda', '#e8707a', '#7fbf6a', '#c8352f'),
    ('torta_jengibre', 'Ginger Bundt', 'corona', '#8a5a2c', '#fbf3df', None), ('torta_boda', 'Royal Tier Cake', 'pisos', '#efd9a8', '#fdf6e6', '#c8352f'),
]
INGREDIENTES = [('harina', 'Flour'), ('azucar', 'Sugar'), ('huevo', 'Eggs'), ('mantequilla', 'Butter'), ('crema', 'Cream'), ('levadura', 'Yeast'), ('chocolate', 'Chocolate')]


def comida():
    from PIL import Image
    cat, imgs = [], []
    for idc, nombre, forma, corteza, adorno in PANES:
        im = O.pan_icono(forma, corteza, adorno=adorno)
        guardar(im, 'comida', idc + '.png')
        imgs.append(im)
        cat.append(dict(id=idc, nombre=nombre, ruta='comida/%s.png' % idc))
    for idc, nombre, forma, biz, crema, fruta in TORTAS:
        im = O.torta_icono(forma, biz, crema, fruta)
        guardar(im, 'comida', idc + '.png')
        imgs.append(im)
        cat.append(dict(id=idc, nombre=nombre, ruta='comida/%s.png' % idc))
    for idc, nombre in INGREDIENTES:
        im = O.ingrediente_icono(idc)
        guardar(im, 'comida', idc + '.png')
        imgs.append(im)
        cat.append(dict(id=idc, nombre=nombre, ruta='comida/%s.png' % idc))
    # La leche: el MISMO cubo del juego (item_pozo2) con la leche en lugar del agua.
    cubo = Image.open(os.path.join(RAIZ, 'Game', 'Source', 'item_pozo2.png')).convert('RGBA')
    px = cubo.load()
    cubo_seco = Image.open(os.path.join(RAIZ, 'Game', 'Source', 'item_pozo1.png')).convert('RGBA').load()
    # Lo que cambia entre el cubo vacío y el lleno es el agua: esos píxeles pasan a leche.
    for y in range(cubo.height):
        for x in range(cubo.width):
            if px[x, y] != cubo_seco[x, y] and px[x, y][3]:
                r, g_, b_, a_ = px[x, y]
                v = (r + g_ + b_) / 3.0
                claro = min(255, int(226 + (v - 150) * 0.2))
                px[x, y] = (claro, claro - 2, max(0, claro - 14), a_)
    guardar(cubo, 'comida', 'balde_leche.png')
    imgs.append(cubo)
    cat.append(dict(id='balde_leche', nombre='Bucket of Milk', ruta='comida/balde_leche.png'))
    hoja('comida', imgs, columnas=12, escala=4, ancho_celda=24, alto_celda=24)
    return cat


# ── LAS ARMAS Y LAS CAÑAS ────────────────────────────────────────────────────
# Daño, alcance, nivel y precio están en gf-items-v2.js: aquí solo el dibujo.
ESPADAS_V2 = [
    ('espada_piedra', 'Stone Sword', 'ancha', '#9a9a94', '#6b5a48', '#5a4028', None),
    ('espada_acero', 'Steel Sword', 'recta', '#b6c4d2', '#7d8a98', '#3d3036', None),
    ('espada_plata', 'Silver Rapier', 'estoque', '#e4eaf0', '#c9c9d6', '#2f3a5a', None),
    ('espada_oro', 'Golden Sword', 'recta', '#f0cf4a', '#c98a2c', '#7a2f2f', None),
    ('espada_hielo', 'Frost Blade', 'llama', '#a6e4f2', '#5f9fc9', '#2f4a6a', '#f0fcff'),
    ('espada_fuego', 'Fire Scimitar', 'curva', '#ef7a2f', '#a8352a', '#3a1f1f', '#ffd76a'),
    ('espada_sombra', 'Shadow Blade', 'llama', '#6a4f96', '#3a2f4a', '#20202c', '#b79aea'),
    ('espada_dragon', 'Dragon Greatsword', 'grande', '#c8423a', '#e0b04a', '#2f2020', '#ffc9a0'),
]
ARCOS_V2 = [
    ('arco_corto', 'Short Bow', '#a9794a', '#efe6cf', '#6b5a3a', None, 6.0),
    ('arco_cazador', 'Hunter Bow', '#7f5a35', '#efe6cf', '#3f6b3f', None, 7.0),
    ('arco_largo', 'Long Bow', '#c9a06a', '#efe6cf', '#8a2f2f', None, 8.0),
    ('arco_hielo', 'Frost Bow', '#8fd0e6', '#f0fcff', '#2f5f8f', '#e8fbff', 7.5),
    ('arco_elfico', 'Elven Bow', '#9fc06a', '#fff6d0', '#c9a23f', '#f0dc7a', 8.5),
    ('arco_dragon', 'Dragon Bow', '#a8352a', '#ffd9a0', '#e0a03a', '#ffcf5a', 8.5),
]
CANAS_V2 = [
    ('cana_bambu', 'Bamboo Rod', '#b9b05a', '#8a7a4a', '#a9a9a9', None),
    ('cana_roble', 'Oak Rod', '#7f5a35', '#c9a06a', '#b9b9b9', None),
    ('cana_acero', 'Steel Rod', '#8a98a6', '#3d3036', '#d0d6dc', None),
    ('cana_plata', 'Silver Rod', '#dfe6ee', '#2f3a5a', '#f0f0f6', '#7f9fc9'),
    ('cana_oro', 'Golden Rod', '#e6c040', '#7a2f2f', '#f4e08a', '#fff0a8'),
    ('cana_leyenda', 'Legend Rod', '#7a4fb0', '#e0b04a', '#7ad8e6', '#7ad8e6'),
]


def armas():
    cat, imgs = [], []
    for idc, nombre, forma, hoja_, guarda, puno, brillo in ESPADAS_V2:
        im = O.espada_icono(hoja_, guarda, puno, forma, brillo)
        guardar(im, 'armas', idc + '.png')
        imgs.append(im)
        cat.append(dict(id=idc, nombre=nombre, ruta='armas/%s.png' % idc))
    for idc, nombre, madera, cuerda, env, puntas, panza in ARCOS_V2:
        im = O.arco_icono(madera, cuerda, env, puntas, panza)
        guardar(im, 'armas', idc + '.png')
        imgs.append(im)
        cat.append(dict(id=idc, nombre=nombre, ruta='armas/%s.png' % idc))
    for idc, nombre, vara, mango, carrete, anillas in CANAS_V2:
        im = O.cana_icono(vara, mango, carrete, anillas=anillas)
        guardar(im, 'armas', idc + '.png')
        imgs.append(im)
        cat.append(dict(id=idc, nombre=nombre, ruta='armas/%s.png' % idc))
    hoja('armas', imgs, columnas=10, escala=6, ancho_celda=24, alto_celda=24)
    return cat


# ── LO QUE SE CONSTRUYE EN LAS LANDS ─────────────────────────────────────────
# id de objeto = obra_<tipo>. ancho x alto en casillas de 32 px; `base` en px es el ancho de lo que frena
# (si falta, casi todo el dibujo). Precio y nivel están en gf-items-v2.js.
OBRAS = [
    ('pozo', 'Stone Well', 3, 3, None), ('fuente', 'Garden Fountain', 4, 4, None), ('banco', 'Park Bench', 3, 2, None), ('parterre', 'Flower Bed', 3, 2, None),
    ('farol', 'Street Lamp', 2, 2, 14), ('heno', 'Hay Stack', 3, 3, None), ('caseta', 'Dog House', 3, 3, None), ('pajarera', 'Bird House', 2, 2, 14),
    ('colmena', 'Bee Hive', 2, 2, None), ('puesto', 'Market Stall', 4, 3, None), ('cenador', 'Garden Gazebo', 5, 5, None), ('estatua', 'Hero Statue', 2, 2, None),
    ('buzon', 'Mailbox', 2, 2, 12), ('valla', 'Picket Fence', 2, 1, None), ('muro', 'Stone Wall', 2, 1, None), ('abrevadero', 'Water Trough', 3, 2, None),
    ('hoguera', 'Campfire', 2, 2, None), ('lena', 'Wood Pile', 3, 2, None), ('poste_senal', 'Signpost', 2, 2, 12), ('invernadero', 'Greenhouse', 6, 5, None),
]


def obras():
    cat, imgs = [], []
    for tipo, nombre, ancho, alto, base in OBRAS:
        idc = 'obra_' + tipo
        im = O.obra(tipo, A.rng_de('objetosv2', idc))
        guardar(im, 'construcciones', idc + '.png')
        imgs.append(im)
        c = dict(id=idc, nombre=nombre, ancho=ancho, alto=alto, ruta='construcciones/%s.png' % idc)
        if base:
            c['base'] = base
        cat.append(c)
    hoja('construcciones', imgs, columnas=7, escala=3, ancho_celda=94, alto_celda=92)
    return cat


# ── LAS MASCOTAS ─────────────────────────────────────────────────────────────
def mascotas():
    from PIL import Image
    cat, imgs = [], []
    W, H = 48, 44
    n = 0
    for esp, nombre in O.NOMBRES_MASCOTA.items():
        for ape, pelo, marca in O.COLORES_MASCOTA[esp]:
            n += 1
            idc = 'mascota_%03d' % n
            # Fila 0: anda (4 cuadros). Fila 1: quieta (2 cuadros, respira).
            atlas = Image.new('RGBA', (W * 4, H * 2), (0, 0, 0, 0))
            for col in range(4):
                atlas.alpha_composite(O.mascota_cuadro(esp, pelo, marca, col / 4.0, W, H), (col * W, 0))
            for col in range(2):
                atlas.alpha_composite(O.mascota_cuadro(esp, pelo, marca, col / 4.0, W, H, quieto=True), (col * W, H))
            guardar(atlas, 'mascotas', idc + '.png')
            icono = atlas.crop((0, H, W, H * 2))
            guardar(icono.crop(icono.getbbox()), 'mascotas', 'iconos', idc + '.png')
            imgs.append(icono)
            cat.append(dict(id=idc, especie=esp, nombre='%s %s' % (ape, nombre), cuadro=[W, H], filas={'anda': 4, 'quieta': 2}, ruta='mascotas/%s.png' % idc))
    hoja('mascotas', imgs, columnas=10, escala=3, ancho_celda=W, alto_celda=H)
    return cat


# ── LOS MUEBLES ──────────────────────────────────────────────────────────────
NOMBRES_MUEBLE = {'cama': 'Bed', 'armario': 'Wardrobe', 'comoda': 'Dresser', 'mesa_redonda': 'Round Table', 'mesa_larga': 'Long Table', 'silla': 'Chair', 'sofa': 'Sofa', 'sillon': 'Armchair',
                  'alfombra': 'Rug', 'librero': 'Bookcase', 'lampara': 'Floor Lamp', 'maceta': 'Potted Plant', 'cuadro': 'Painting', 'chimenea': 'Fireplace', 'horno': 'Stove', 'pila': 'Washstand',
                  'escritorio': 'Writing Desk', 'espejo': 'Standing Mirror', 'banera': 'Bathtub', 'piano': 'Piano'}
# Cinco juegos de madera y tela: (nombre, madera, tela).
JUEGOS = [('Walnut', '#6e4a30', '#a8473a'), ('Oak', '#a2763f', '#3f6f9b'), ('Birch', '#d8bd8a', '#5f8f55'), ('Ebony', '#3a3034', '#b58a3f'), ('Cherry', '#8c3f36', '#7a4a8c')]
# La maceta usa la tela como barro: que parezca barro.
BARROS = ['#c97f4e', '#d9d4c8', '#4f7fa8', '#8a5a9a', '#6a8a5a']


def muebles():
    cat, imgs = [], []
    n = 0
    for tipo, nombre in NOMBRES_MUEBLE.items():
        for k, (ape, madera, tela) in enumerate(JUEGOS):
            n += 1
            idc = 'mueble_%03d' % n
            im = O.mueble(tipo, madera, BARROS[k] if tipo == 'maceta' else tela, A.rng_de('objetosv2', idc))
            guardar(im, 'muebles', idc + '.png')
            imgs.append(im)
            cat.append(dict(id=idc, tipo=tipo, nombre='%s %s' % (ape, nombre), ruta='muebles/%s.png' % idc))
    hoja('muebles', imgs, columnas=10, escala=2, ancho_celda=68, alto_celda=66)
    return cat


# ── LOS PERSONAJES ───────────────────────────────────────────────────────────
# Lo que no está en la paleta del panel Soulbound: pelos y trajes nuevos. Las pieles son las del juego.
PELOS_V2 = [('Teal', '#2a8a8a'), ('Mint', '#7fd0b0'), ('Coral', '#e87a6a'), ('Lilac', '#b79ae6'), ('Platinum', '#efe9d8'), ('Ash', '#8a8a90'), ('Navy', '#26305f'), ('Wine', '#6a2036'),
            ('Sunset', '#e8902a'), ('Moss', '#5f7a3a'), ('Rose', '#e8a0b8'), ('Copper', '#b8602a'), ('Raven', '#1e1c26'), ('Sand', '#d8bc8a'), ('Sky', '#6fb4e0'), ('Plum', '#5a2a6a')]
PIELES_V2 = ['#f2d3b8', '#e8c3a0', '#d2a07a', '#b8865e', '#a8714e', '#7a4a30']
OJOS_V2 = ['#2a8a6a', '#c9862a', '#7a4fb0', '#c8423a', '#3d6fa8', '#5a3a1e', '#4f93c4', '#3e7a4c', '#d9a441', '#6a5a8a']
# (nombre, camisa, pantalón, zapatos): cada uno pensado para que no chille.
TRAJES_V2 = [('Ranger', '#3f6a3a', '#5a4630', '#3a2a1e'), ('Sailor', '#2f5f8f', '#e8e4d8', '#2a2a30'), ('Noble', '#6a2036', '#2a2a30', '#c9a23f'), ('Baker', '#efe9dc', '#8a6a4a', '#5a3a24'),
             ('Miner', '#8a5a2a', '#3e3a3c', '#2a2420'), ('Scholar', '#34406a', '#4a4656', '#2a2a30'), ('Farmer', '#c9a23f', '#3c5a8a', '#5a3a24'), ('Knight', '#8a8e96', '#4a4e56', '#2a2a30'),
             ('Bard', '#a8473a', '#c9a23f', '#5a3a24'), ('Druid', '#5f7a3a', '#3e4a2a', '#4a3a24'), ('Hunter', '#6a4a30', '#3a3024', '#2a2018'), ('Merchant', '#7a4a8c', '#e3c46a', '#4a3020'),
             ('Fisher', '#2f7a7a', '#d9c6a0', '#3a3a30'), ('Mage', '#3a2a6a', '#2a2040', '#c9a23f'), ('Rogue', '#2a2a30', '#3a3440', '#1e1c20'), ('Gardener', '#7fa84a', '#8a6a4a', '#4a3a24'),
             ('Dancer', '#e8a0b8', '#6a3a5a', '#3a2a30'), ('Smith', '#5a4a44', '#3a3034', '#2a2420'), ('Winter', '#e8e8ee', '#5f7fa8', '#3a4050'), ('Desert', '#d8bc8a', '#a8703e', '#5a3a24')]
ROLES_M = ['personaje1', 'personaje3', 'personaje5', 'personaje7', 'personaje8', 'personaje10', 'personaje12']
ROLES_F = ['personaje2', 'personaje4', 'personaje6', 'personaje9', 'personaje11', 'personaje13']
CABEZAS_M = ['orig', 'personaje1', 'personaje8', 'personaje10', 'personaje12']
CABEZAS_F = ['orig', 'personaje2', 'personaje9', 'personaje11', 'personaje13']


def personajes():
    from PIL import Image
    partes = os.path.join(RAIZ, 'Game', 'Sprites', 'Soulbound', 'partes')
    cat, imgs = [], []
    n = 0
    for i in range(100):
        n += 1
        idc = 'personaje_%03d' % n
        rng = A.rng_de('objetosv2', idc)
        fem = i % 2 == 1
        cuerpos, cabezas = (ROLES_F, CABEZAS_F) if fem else (ROLES_M, CABEZAS_M)
        cuerpo = cuerpos[(i // 2) % len(cuerpos)]
        cabeza = cabezas[(i // 2 + i // 14) % len(cabezas)]
        ruta = os.path.join(partes, '%s_%s' % (cuerpo, cabeza))
        if not os.path.exists(ruta + '.png'):
            ruta = os.path.join(partes, '%s_orig' % cuerpo)
        atlas = Image.open(ruta + '.png')
        meta = json.load(open(ruta + '.json', encoding='utf-8'))
        falda = None
        lleva_falda = fem and i % 4 == 1
        if lleva_falda:
            fal = os.path.join(partes, '%s_falda' % cuerpo)
            if os.path.exists(fal + '.png'):
                falda_im = Image.open(fal + '.png').convert('RGBA')
                falda_meta = json.load(open(fal + '.json', encoding='utf-8'))['frames']
                falda = Image.new('RGBA', atlas.size, (0, 0, 0, 0))
                for k, f in meta['frames'].items():
                    g = falda_meta.get(k)
                    if g:
                        trozo = falda_im.crop((g['x'], g['y'], g['x'] + min(g['w'], f['w']), g['y'] + min(g['h'], f['h'])))
                        falda.alpha_composite(trozo, (f['x'], f['y']))
        ape_pelo, pelo = PELOS_V2[(i * 5 + i // 16) % len(PELOS_V2)]
        piel = PIELES_V2[(i * 7 + 2) % len(PIELES_V2)]
        ojos = OJOS_V2[(i * 3 + 1) % len(OJOS_V2)]
        traje, camisa, pantalon, zapatos = TRAJES_V2[(i * 9 + i // 20) % len(TRAJES_V2)]
        im = O.colorear_partes(atlas, falda, pelo, piel, ojos, camisa, pantalon, zapatos, fem)
        guardar(im, 'personajes', idc + '.png')
        with open(os.path.join(carpeta('personajes'), idc + '.json'), 'w', encoding='utf-8', newline='\n') as fj:
            json.dump({'frames': meta['frames']}, fj, separators=(',', ':'))
        f1 = meta['frames'].get('abajo_1')
        muestra = im.crop((f1['x'], f1['y'], f1['x'] + f1['w'], f1['y'] + f1['h']))
        imgs.append(muestra)
        cat.append(dict(id=idc, nombre='%s-haired %s' % (ape_pelo, traje), genero='f' if fem else 'm', cuerpo=cuerpo, cabeza=os.path.basename(ruta).split('_')[1], falda=bool(falda),
                        pelo=pelo, piel=piel, ojos=ojos, camisa=camisa, pantalon=pantalon, zapatos=zapatos, ruta='personajes/%s.png' % idc))
    hoja('personajes', imgs, columnas=20, escala=2, ancho_celda=36, alto_celda=72, fondo=(70, 96, 76))
    return cat


CATEGORIAS = {'casas': casas, 'arboles': arboles, 'monturas': monturas, 'comida': comida, 'armas': armas, 'obras': obras, 'mascotas': mascotas, 'muebles': muebles, 'personajes': personajes}


def main():
    pedidas = sys.argv[1:] or list(CATEGORIAS)
    ruta_cat = os.path.join(SALIDA, 'catalogo.json')
    cat = {}
    if os.path.exists(ruta_cat):
        cat = json.load(open(ruta_cat, encoding='utf-8'))
    for c in pedidas:
        cat[c] = CATEGORIAS[c]()
        print(c, len(cat[c]))
    os.makedirs(SALIDA, exist_ok=True)
    with open(ruta_cat, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(cat, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
