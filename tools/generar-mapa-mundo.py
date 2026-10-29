# -*- coding: utf-8 -*-
"""
=============================================================================
EL MAPA DEL MUNDO                                                (2026-10-26)
=============================================================================

"Al presionar la letra M, un panel con un mapa 2D pixel art de los mundos o
entradas a minas, como Drakensang o WoW, para viajar entre mundos. Que salgan
todos los mapas dibujados. Al tocar, que pregunte en inglés si deseo viajar
por tantas monedas, según lo lejos que esté el personaje. Que reconozca si no
cumple los niveles y si está bloqueado. Con gráficos altamente detallados.
Incluye minas, tienda y más para explorar cómodamente."

NO SE DIBUJA NADA A MANO (memoria "arte nuevo se compone"): el mapa se monta
con el SUELO REAL de cada mapa (recortadas_<zona>, el nivel de detalle bajo),
los edificios del pueblo (Game/Objetos, en su sitio de Maps/mapa_principal.json),
los objetos grandes de cada zona (su atlas) y la casa de la bruja. Todo a la
misma escala: cada mapa de 5000 px ocupa una casilla de CELDA px.

LA GEOGRAFÍA ES LA DEL JUEGO: las salidas de los mapas casan (la oeste del
pueblo y la este del salvaje están las dos en y≈2224, etc.), así que poniendo
los suelos uno junto a otro los caminos se continúan solos.

         col 0        col 1        col 2        col 3
fila 0                glaciar
fila 1                tundra       [mina]
fila 2   cementerio   salvaje      pueblo       [isla]
fila 3   [caverna]    desierto     pradera

La mina y la caverna (bajo tierra) y la isla van en RECUADROS, unidos con una
línea a su entrada. El pueblo y la pradera se tocan pero no se comunican: los
separa un canal de mar.

Sin motas (el dueño tiene tripofobia): ni árboles sueltos en miniatura (un
bosque de puntitos), ni texturas de ruido, ni líneas de puntos. Los bosques se
sugieren oscureciendo el suelo con su densidad muy difuminada.

Sale:
  Game/MAPAS/mundo/mapa_mundo.png y .webp   el dibujo (ANCHO x ALTO)
  Game/MAPAS/mundo/mapa_mundo.json          regiones, destinos y nombres

La misma tabla (regiones y destinos) va copiada en server2.js
(GF_MAPA_MUNDO): con ella el servidor sabe dónde estás en el mapa y cobra el
viaje según la distancia. tools/mapa-mundo.test.cjs vigila que no se separen.
=============================================================================
"""
import json, math, os, sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

AQUI = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.dirname(AQUI)
SALIDA = os.path.join(BIN, 'Game', 'MAPAS', 'mundo')
VERSION = '20261026a'

CELDA = 448
ANCHO, ALTO = 2240, 1888
OX, OY = (ANCHO - 4 * CELDA) // 2, (ALTO - 4 * CELDA) // 2


def celda(c, f):
    return (OX + c * CELDA, OY + f * CELDA, CELDA, CELDA)


def recuadro(c, f, w, h):
    x, y, _, _ = celda(c, f)
    return (x + (CELDA - w) // 2, y + (CELDA - h) // 2, w, h)


# ── LAS REGIONES ─────────────────────────────────────────────────────────────
# mapa = tamaño del mapa del juego (px); rect = dónde va en el dibujo.
REGIONES = [
    dict(id='glaciar', sala='glaciar', mundo=10, nombre='The Shattered Glacier', carpeta='recortadas_glaciar', mapa=(5024, 5024), rect=celda(1, 0)),
    dict(id='tundra', sala='tundra', mundo=9, nombre='Frostfang Tundra', carpeta='recortadas_tundra', mapa=(5024, 5024), rect=celda(1, 1)),
    dict(id='cementerio', sala='cementerio', mundo=7, nombre='Cemetery of Lost Souls', carpeta='recortadas_cementerio', mapa=(5024, 5024), rect=celda(0, 2)),
    dict(id='salvaje', sala='salvaje', mundo=6, nombre='The Wild Lands', carpeta='recortadas_salvaje', mapa=(5024, 5024), rect=celda(1, 2)),
    dict(id='pueblo', sala='game', mundo=1, nombre='Grassland Village', carpeta='recortadas', mapa=(5008, 5008), rect=celda(2, 2)),
    dict(id='desierto', sala='desierto', mundo=8, nombre='Scorching Desert', carpeta='recortadas_desierto', mapa=(5024, 5024), rect=celda(1, 3)),
    dict(id='pradera', sala='pradera', mundo=12, nombre='Blossom Meadow', carpeta='recortadas_pradera', mapa=(5024, 5024), rect=celda(2, 3)),
    # Los recuadros: bajo tierra (mina, caverna) y la isla.
    dict(id='mina', sala='mina', mundo=3, nombre='The Mine', carpeta='recortadas_mina', mapa=(5008, 5008), rect=recuadro(2, 1, 300, 300), recuadro='piedra'),
    dict(id='caverna', sala='caverna', mundo=11, nombre='The Crystal Caverns', carpeta='recortadas_caverna', mapa=(5024, 5024), rect=recuadro(0, 3, 300, 300), recuadro='piedra'),
    dict(id='isla', sala='isla', mundo=4, nombre='Your Island', carpeta='recortadas_lands', mapa=(4096, 3072), rect=recuadro(3, 2, 340, 255), recuadro='arena'),
]
POR_ID = {r['id']: r for r in REGIONES}


def a_mapa(region_id, x, y):
    """Un punto del mapa del juego → px del dibujo."""
    r = POR_ID[region_id]
    rx, ry, rw, rh = r['rect']
    mw, mh = r['mapa']
    return (round(rx + x / mw * rw), round(ry + y / mh * rh))


# ── LOS DESTINOS ─────────────────────────────────────────────────────────────
# tipo: mapa (entrada de una región) · lugar (un sitio dentro) · tienda ·
# mina · casa · isla · arena. `destino` = donde se aparece (coordenadas del
# juego); None = la entrada que ya tiene esa escena (la mina, la isla, la tienda).
CASAS_PUEBLO = [  # (id, nombre, puerta) — las de gf-casas.js
    ('casa_L', "Farmer Joe's House", (1488, 3253)),
    ('casa_comida', 'The Inn', (2444, 3230)),
    ('casa_comida2', 'The Tavern', (2928, 3247)),
    ('casa_posiones', 'Potion Shop', (2452, 1492)),
    ('casa_herreria', 'Smithy', (3137, 1975)),
    ('casa_npc1', "Martha's Bakery", (1472, 612)),
    ('casa_npc2', "Elias' Workshop", (1962, 607)),
    ('cabana', 'Farm Cabin', (715, 463)),
]
# Los carteles con nombre de cada zona (Maps/<zona>.json, capa `carteles`).
LUGARES = {
    'cementerio': ['cripta'], 'desierto': ['ruinas'], 'tundra': ['santuario', 'lago'],
    'glaciar': ['ruinas', 'lago'], 'caverna': ['mina', 'lago'], 'pradera': ['circulo', 'granja'],
}
# La entrada de cada región (las de ENTRADA_DE_MUNDO en gf-lands.js).
ENTRADAS = {
    'pueblo': (2097, 2359), 'salvaje': (4896, 2208), 'cementerio': (4790, 2208), 'desierto': (3552, 230),
    'tundra': (3552, 4740), 'glaciar': (3552, 4740), 'caverna': (4040, 2250), 'pradera': (234, 2456),
}


def colisiones(nombre):
    m = json.load(open(os.path.join(BIN, 'Maps', nombre + '.json'), encoding='utf-8'))
    capa = next((l for l in m['layers'] if l.get('name') == 'colisiones'), None)
    salidas = next((l for l in m['layers'] if l.get('name') == 'salidas'), None)
    rects = [(o['x'], o['y'], o['width'], o['height']) for o in (capa['objects'] if capa else []) if not o.get('polygon')]
    rects += [(o['x'] - 120, o['y'] - 120, o['width'] + 240, o['height'] + 240) for o in (salidas['objects'] if salidas else [])]
    return m, rects


def libre_cerca(nombre, x, y):
    """El sitio libre más cercano a (x, y) para aparecer: los pies (30 x 26,
    de y+25 a y+51) fuera de muros, agua y salidas, y lejos de los bordes."""
    m, rects = colisiones(nombre)
    W, H = m['width'] * m['tilewidth'], m['height'] * m['tileheight']

    def ok(px, py):
        if px < 120 or py < 120 or px > W - 120 or py > H - 120:
            return False
        for (rx, ry, rw, rh) in rects:
            if px - 15 < rx + rw and px + 15 > rx and py + 25 < ry + rh and py + 51 > ry:
                return False
        return True
    for radio in range(0, 400, 16):
        pasos = max(1, int(2 * math.pi * radio / 16))
        for k in range(pasos):
            a = 2 * math.pi * k / pasos + math.pi / 2
            px, py = round(x + math.cos(a) * radio), round(y + 30 + math.sin(a) * radio)
            if ok(px, py):
                return (px, py)
    raise SystemExit('sin sitio libre cerca de %s (%d, %d)' % (nombre, x, y))


def destinos():
    P = []
    nombres = {r['id']: r['nombre'] for r in REGIONES}
    for rid, (x, y) in ENTRADAS.items():
        r = POR_ID[rid]
        P.append(dict(id=rid, tipo='mapa', nombre=nombres[rid], region=rid, mundo=r['mundo'], sala=r['sala'],
                      destino=[x, y], px=list(a_mapa(rid, x, y))))
    # El pueblo: la tienda, la mina, las casas y la puerta de la arena.
    P.append(dict(id='pueblo_tienda', tipo='tienda', nombre='General Store', region='pueblo', mundo=2, sala='tienda',
                  destino=None, px=list(a_mapa('pueblo', 1553, 1440))))
    P.append(dict(id='pueblo_mina', tipo='mina', nombre='Mine Entrance', region='mina', mundo=3, sala='mina',
                  destino=None, px=list(a_mapa('pueblo', 3334, 830))))
    for cid, nombre, (x, y) in CASAS_PUEBLO:
        P.append(dict(id='pueblo_' + cid, tipo='casa', nombre=nombre, region='pueblo', mundo=1, sala='game',
                      destino=[x, y + 60], px=list(a_mapa('pueblo', x, y))))
    P.append(dict(id='pueblo_arena', tipo='arena', nombre='Arena Gate', region='pueblo', mundo=1, sala='game',
                  destino=[2832, 170], px=list(a_mapa('pueblo', 2832, 120))))
    # El salvaje: la cabaña del cazador.
    P.append(dict(id='salvaje_cabana', tipo='casa', nombre="Hunter's Lodge", region='salvaje', mundo=6, sala='salvaje',
                  destino=[2804, 1728], px=list(a_mapa('salvaje', 2804, 1668))))
    # El cementerio: la casa de la bruja (su puerta baja a la caverna).
    P.append(dict(id='cementerio_bruja', tipo='lugar', nombre="The Witch's Hut", region='cementerio', mundo=7, sala='cementerio',
                  destino=[250, 2250], px=list(a_mapa('cementerio', 250, 2104))))
    # Los sitios con nombre de cada zona.
    for rid, claves in LUGARES.items():
        m = json.load(open(os.path.join(BIN, 'Maps', rid + '.json'), encoding='utf-8'))
        carteles = {o['name']: o for o in next(l for l in m['layers'] if l.get('name') == 'carteles')['objects']}
        for k in claves:
            o = carteles[k]
            texto = next(p['value'] for p in o.get('properties', []) if p['name'] == 'texto')
            sx, sy = libre_cerca(rid, o['x'], o['y'])
            r = POR_ID[rid]
            P.append(dict(id=rid + '_' + k, tipo='lugar', nombre=texto, region=rid, mundo=r['mundo'], sala=r['sala'],
                          destino=[sx, sy], px=list(a_mapa(rid, o['x'], o['y']))))
    # La isla (la tuya; sin VIP no se entra).
    ix, iy, iw, ih = POR_ID['isla']['rect']
    P.append(dict(id='isla', tipo='isla', nombre='Your Island', region='isla', mundo=4, sala='isla', destino=None,
                  px=[ix + iw // 2, iy + ih // 2], vip=True))
    # La mina: su recuadro (se entra por la puerta del pueblo).
    mx, my, mw, mh = POR_ID['mina']['rect']
    for p in P:
        if p['id'] == 'pueblo_mina':
            p['entrada_px'] = p['px']
            p['px'] = [mx + mw // 2, my + mh // 2]
    return P


# ── EL DIBUJO ────────────────────────────────────────────────────────────────
def suelo_bajo(carpeta):
    """El suelo entero de un mapa al nivel de detalle bajo (sus trozos juntos)."""
    d = os.path.join(BIN, carpeta)
    m = json.load(open(os.path.join(d, 'mapa.json'), encoding='utf-8'))
    lod = next(l for l in m['lods'] if l['name'] == 'low')
    s = lod['scale']
    img = Image.new('RGBA', (round(m['width'] * s), round(m['height'] * s)), (0, 0, 0, 0))
    for t in m['tiles']:
        e = t['lods']['low']
        f = os.path.join(d, 'low', e.get('fallback') or e['filename'])
        if not os.path.exists(f):
            f = os.path.join(d, 'low', e['filename'])
        pieza = Image.open(f).convert('RGBA')
        w, h = round(t['width'] * s), round(t['height'] * s)
        if pieza.size != (w, h):
            pieza = pieza.crop((0, 0, min(pieza.size[0], w), min(pieza.size[1], h)))
            if pieza.size != (w, h):
                pieza = pieza.resize((w, h), Image.LANCZOS)
        img.alpha_composite(pieza, (round(t['x'] * s), round(t['y'] * s)))
    return img


def edificios_pueblo(img, escala):
    """Los edificios del pueblo, en su sitio (objetos de Tiled: x,y abajo-izquierda)."""
    m = json.load(open(os.path.join(BIN, 'Maps', 'mapa_principal.json'), encoding='utf-8'))
    imagenes = {
        'casa_tienda1': 'casa de tienda mejorada.png', 'casa_de_herreria': 'casa de herreria arreglada.png',
        'casa_dos_pisos1': 'casa dos pisos.png', 'casa_dos_pisos2': 'casa de 2 pisos arreglado.png',
        'casa_dos_pisos3': 'casa de 2 pisos arreglado.png', 'casa_npc1': 'casa de npc arreglado.png',
        'casa_npc2': 'casa de npc arreglado.png', 'casa_L': 'casa L arreglado.png',
        'casa_de_granja_cabaña_1': 'casa de granja cabaña.png', 'fuente_estatua': 'estatua de gato.png',
        'puerta_mina': 'puerta_mina.png'}
    objetos = []

    def recorrer(capas):
        for l in capas:
            if l.get('layers'):
                recorrer(l['layers'])
            for o in l.get('objects', []) or []:
                if o.get('name') in imagenes and o.get('width'):
                    objetos.append(o)
    recorrer(m['layers'])
    objetos.sort(key=lambda o: o['y'])
    for o in objetos:
        f = os.path.join(BIN, 'Game', 'Objetos', imagenes[o['name']])
        if not os.path.exists(f):
            continue
        sp = Image.open(f).convert('RGBA')
        w, h = max(2, round(o['width'] * escala)), max(2, round(o['height'] * escala))
        sp = sp.resize((w, h), Image.LANCZOS)
        img.alpha_composite(sp, (round(o['x'] * escala), round((o['y'] - o['height']) * escala)))


def objetos_grandes(img, zona, escala):
    """Los objetos grandes de una zona (ruinas, tiendas, arcos, cristales…):
    los pequeños a esta escala serían puntitos y no se ponen."""
    m = json.load(open(os.path.join(BIN, 'Maps', zona + '.json'), encoding='utf-8'))
    capa = next((l for l in m['layers'] if l.get('name') == 'objetos'), None)
    atlas_json = os.path.join(BIN, 'Game', 'MAPAS', zona, 'objetos.json')
    if not capa or not os.path.exists(atlas_json):
        return
    atlas = json.load(open(atlas_json, encoding='utf-8'))
    hoja = Image.open(os.path.join(BIN, 'Game', 'MAPAS', zona, 'objetos.png')).convert('RGBA')
    frames = atlas['frames']
    for o in sorted(capa['objects'], key=lambda o: o['y']):
        fr = frames.get(o['name'])
        if not fr:
            continue
        f = fr['frame']
        if max(f['w'], f['h']) < 200:
            continue
        sp = hoja.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
        w, h = max(2, round(f['w'] * escala)), max(2, round(f['h'] * escala))
        sp = sp.resize((w, h), Image.LANCZOS)
        piv = fr.get('pivot') or {'x': 0.5, 'y': 1.0}
        img.alpha_composite(sp, (round(o['x'] * escala - w * piv['x']), round(o['y'] * escala - h * piv['y'])))


def bosque(zona, tam):
    """La densidad de árboles muy difuminada: una sombra verde lisa, nunca puntos."""
    m = json.load(open(os.path.join(BIN, 'Maps', zona + '.json'), encoding='utf-8'))
    capa = next((l for l in m['layers'] if l.get('name') == 'arboles'), None)
    W = m['width'] * m['tilewidth']
    d = np.zeros((tam, tam), np.float32)
    for o in (capa['objects'] if capa else []):
        x, y = int(o['x'] / W * tam), int(o['y'] / W * tam)
        if 0 <= x < tam and 0 <= y < tam:
            d[y, x] += 1
    im = Image.fromarray(np.clip(d * 60, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(tam / 28))
    a = np.asarray(im).astype(np.float32)
    return a / max(1.0, a.max())


def ruido_suave(w, h, semilla, celdas=6):
    rng = np.random.RandomState(semilla)
    base = rng.rand(celdas + 2, celdas + 2).astype(np.float32)
    im = Image.fromarray((base * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(max(w, h) / 40))
    return np.asarray(im).astype(np.float32) / 255.0


def dibujar(P):
    lienzo = Image.new('RGBA', (ANCHO, ALTO), (0, 0, 0, 255))

    # 1. El mar: azul hondo con manchas grandes y lisas (sin ruido fino).
    yy, xx = np.mgrid[0:ALTO, 0:ANCHO].astype(np.float32)
    n = ruido_suave(ANCHO, ALTO, 7, 8)
    hondo = np.array([22, 58, 104], np.float32)
    claro = np.array([42, 96, 150], np.float32)
    t = np.clip(0.35 + 0.5 * n - 0.15 * (yy / ALTO), 0, 1)[..., None]
    mar = hondo * (1 - t) + claro * t
    lienzo = Image.fromarray(np.dstack([mar, np.full((ALTO, ANCHO), 255, np.float32)]).astype(np.uint8), 'RGBA')

    # 2. La tierra: las siete regiones, con la costa un poco irregular.
    tierra = Image.new('L', (ANCHO, ALTO), 0)
    dt = ImageDraw.Draw(tierra)
    for r in REGIONES:
        if r.get('recuadro'):
            continue
        x, y, w, h = r['rect']
        dt.rectangle((x, y, x + w - 1, y + h - 1), fill=255)
    # Costa: se redondea la máscara y se le da una ondulación grande y suave.
    m = np.asarray(tierra.filter(ImageFilter.GaussianBlur(22))).astype(np.float32) / 255.0
    ond = ruido_suave(ANCHO, ALTO, 11, 14)
    m = m + (ond - 0.5) * 0.35
    # El canal entre el pueblo y la pradera (se tocan, no se comunican): se
    # abre DESPUÉS de redondear la costa, o el difuminado lo tapa.
    px_, py_, _, _ = celda(2, 3)
    canal = Image.new('L', (ANCHO, ALTO), 0)
    ImageDraw.Draw(canal).rectangle((px_ + 34, py_ - 20, px_ + CELDA + 80, py_ + 20), fill=255)
    canal = np.asarray(canal.filter(ImageFilter.GaussianBlur(9))).astype(np.float32) / 255.0
    m = m * (1 - canal * 0.95)
    costa_tierra = m > 0.5
    playa = (m > 0.40) & ~costa_tierra
    espuma = (m > 0.33) & (m <= 0.40)

    arr = np.asarray(lienzo).copy()
    arr[espuma] = (150, 196, 222, 255)
    arr[playa] = (214, 196, 148, 255)

    # 3. El suelo real de cada región, con su sombra de bosque.
    capa = Image.new('RGBA', (ANCHO, ALTO), (0, 0, 0, 0))
    for r in REGIONES:
        if r.get('recuadro'):
            continue
        x, y, w, h = r['rect']
        s = suelo_bajo(r['carpeta']).resize((w, h), Image.LANCZOS)
        if r['id'] != 'pueblo':
            dens = bosque(r['id'], w)
            a = np.asarray(s).astype(np.float32)
            k = (dens * 0.45)[..., None]
            verde = np.array([34, 70, 40], np.float32) if r['id'] not in ('glaciar', 'tundra') else np.array([60, 88, 96], np.float32)
            a[..., :3] = a[..., :3] * (1 - k) + verde * k
            s = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')
            objetos_grandes(s, r['id'], w / r['mapa'][0])
        else:
            edificios_pueblo(s, w / r['mapa'][0])
        if r['id'] == 'cementerio':
            casa = os.path.join(BIN, 'Game', 'MAPAS', 'cementerio', 'casa_bruja.png')
            if os.path.exists(casa):
                sp = Image.open(casa).convert('RGBA')
                esc = w / r['mapa'][0]
                sp = sp.resize((max(2, round(sp.size[0] * esc)), max(2, round(sp.size[1] * esc))), Image.LANCZOS)
                cx, cy = 250 * esc, 2104 * esc
                s.alpha_composite(sp, (round(cx - sp.size[0] / 2), round(cy - sp.size[1] * 0.85)))
        capa.alpha_composite(s, (x, y))
    # Las fronteras entre regiones: un corte limpio con una raya fina y
    # oscura, como las de los mapas de WoW (el fundido dejaba una banda borrosa).
    rayas = ImageDraw.Draw(capa)
    tierras = [r for r in REGIONES if not r.get('recuadro')]
    for a in tierras:
        ax, ay, aw, ah = a['rect']
        for b in tierras:
            bx, by, bw, bh = b['rect']
            if bx == ax + aw and by == ay:
                rayas.line([(bx, by), (bx, by + bh)], fill=(38, 30, 22, 255), width=3)
            if by == ay + ah and bx == ax:
                rayas.line([(bx, by), (bx + bw, by)], fill=(38, 30, 22, 255), width=3)
    suelo = np.asarray(capa).astype(np.float32)
    sel = costa_tierra & (suelo[..., 3] > 10)
    arr[sel] = np.clip(suelo[sel], 0, 255).astype(np.uint8)
    arr[..., 3] = 255
    lienzo = Image.fromarray(arr, 'RGBA')

    # 4. Los recuadros (mina y caverna bajo tierra, la isla).
    d = ImageDraw.Draw(lienzo)
    for r in REGIONES:
        if not r.get('recuadro'):
            continue
        x, y, w, h = r['rect']
        s = suelo_bajo(r['carpeta']).resize((w, h), Image.LANCZOS)
        mascara = Image.new('L', (w, h), 0)
        ImageDraw.Draw(mascara).rounded_rectangle((0, 0, w - 1, h - 1), radius=26, fill=255)
        if r['recuadro'] == 'piedra':
            d.rounded_rectangle((x - 14, y - 14, x + w + 13, y + h + 13), radius=36, fill=(58, 54, 60, 255))
            d.rounded_rectangle((x - 9, y - 9, x + w + 8, y + h + 8), radius=32, fill=(104, 98, 104, 255))
            d.rounded_rectangle((x - 4, y - 4, x + w + 3, y + h + 3), radius=28, fill=(30, 28, 34, 255))
        else:
            d.rounded_rectangle((x - 16, y - 16, x + w + 15, y + h + 15), radius=40, fill=(150, 196, 222, 255))
            d.rounded_rectangle((x - 10, y - 10, x + w + 9, y + h + 9), radius=34, fill=(214, 196, 148, 255))
        lienzo.paste(s, (x, y), mascara)

    # 5. Las uniones: de la puerta de la mina a su recuadro, de la casa de la
    #    bruja a la caverna y del muelle del pueblo a la isla (líneas lisas).
    def unir(a, b, color):
        d.line([a, b], fill=(20, 16, 12, 255), width=9)
        d.line([a, b], fill=color, width=5)
    pm = next(p for p in P if p['id'] == 'pueblo_mina')
    mx, my, mw, mh = POR_ID['mina']['rect']
    unir(tuple(pm['entrada_px']), (mx + mw // 2, my + mh), (170, 150, 120, 255))
    bru = next(p for p in P if p['id'] == 'cementerio_bruja')
    cx, cy, cw, ch = POR_ID['caverna']['rect']
    unir(tuple(bru['px']), (cx + cw // 2, cy), (150, 110, 190, 255))
    ix, iy, iw, ih = POR_ID['isla']['rect']
    px0, py0, pw0, ph0 = POR_ID['pueblo']['rect']
    unir((px0 + pw0 - 8, py0 + ph0 // 2 + 20), (ix - 10, iy + ih // 2), (226, 214, 180, 255))
    return lienzo


def main():
    P = destinos()
    img = dibujar(P)
    os.makedirs(SALIDA, exist_ok=True)
    # El acabado pixel art: bloques de 2 x 2 (se notan al acercar el mapa).
    img = img.convert('RGB')
    img = img.resize((ANCHO // 2, ALTO // 2), Image.BOX).resize((ANCHO, ALTO), Image.NEAREST)
    img.save(os.path.join(SALIDA, 'mapa_mundo.png'), optimize=True)
    img.save(os.path.join(SALIDA, 'mapa_mundo.webp'), quality=90, method=6)
    datos = {
        'version': VERSION, 'tam': [ANCHO, ALTO], 'celda': CELDA,
        'regiones': [dict(id=r['id'], sala=r['sala'], mundo=r['mundo'], nombre=r['nombre'], mapa=list(r['mapa']),
                          rect=list(r['rect']), recuadro=r.get('recuadro')) for r in REGIONES],
        'destinos': [{k: v for k, v in p.items() if k != 'entrada_px'} for p in P],
    }
    with open(os.path.join(SALIDA, 'mapa_mundo.json'), 'w', encoding='utf-8') as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    print('mapa del mundo: %dx%d, %d regiones, %d destinos' % (ANCHO, ALTO, len(REGIONES), len(P)))


if __name__ == '__main__':
    main()
