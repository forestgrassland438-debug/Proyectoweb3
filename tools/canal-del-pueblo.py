# -*- coding: utf-8 -*-
"""
EL CANAL DEL PUEBLO                                              (2026-11-24)

    python tools/canal-del-pueblo.py --ver <salida.png>   vista previa (no toca el juego)
    python tools/canal-del-pueblo.py --aplicar            lo pone
    python tools/canal-del-pueblo.py --deshacer           lo quita
    python tools/canal-del-pueblo.py --rle                la tabla de agua para server2.js

POR QUÉ
  "En el río de GameScene no existe un barco con un NPC para llevarte a los
  otros mapas ... además el río es corto: repáralo para el paso del barco."
  El río del pueblo baja pegado al borde este y no sale a ninguna parte. El
  ferri del barquero (gf-ferri.js) zarpa del muelle de la orilla oeste, cruza
  el río y sale del mapa por ESTE canal, que corta la franja de arena del este
  hasta el borde: casillas 297-312 (x 4752-5008), agua en las filas 170-177
  (y 2720-2848).

QUÉ TOCA
  1. La capa de casillas `mapa_principal` de Maps/mapa_principal.json: solo
     los números de las celdas del canal; el resto del archivo (formato de
     Tiled, CRLF) queda igual byte a byte. Con esas casillas gf-agua pone el
     agua que se mueve, gf-pesca deja pescar y gf-botes deja remar.
  2. Un rectángulo en `area_colision_general` ("canal_este"): no se anda
     sobre el agua; por la arena de encima y de debajo, sí.
  3. El suelo pintado (`recortadas/`), trozo r1_c2 (x 4096-5008, y 2048-4096):
     hd y zoom (PNG + WebP) y md y low (PNG).
  4. La versión del recorte (`recortadas/mapa.json` y el ?v= de GameScene),
     porque las imágenes se piden con force-cache.
  El servidor tiene su propia tabla del agua del pueblo (PESCA_AGUA_RLE, en
  server2.js): `--rle` la escribe con el canal y hay que pegarla allí, o el
  servidor no deja pescar ni remar en el canal.

LAS CASILLAS
  Las orillas son las del estanque del tileset (1249/1250 margen, 1339/1340
  talud, 1429/1430 agua con espuma, 1789/1790 última fila de agua, 1879/1880
  borde de arena, 1969/1970 arena) y los empalmes con el río son los que el
  propio mapa ya usa donde el río se ensancha: 899/989/1079 arriba (filas
  115-117) y 87/88 + 177/178 abajo (filas 87-88), con la misma alternancia.
  El seto del borde este se cierra con sus esquinas (2415/2505/2506/2507
  arriba, 2055..2058 abajo), en las secuencias que el mapa ya usa.

EL SUELO PINTADO
  No se puede regenerar: recortar.js ya no está y `detallar` cambió después
  de recortar (el 2026-10-07 sus manchas de tono iban al DOBLE: arena
  ±12,10,8 · agua ±8,12,14 · hierba ±10,18,8). Así que se pinta encima:
    - el nivel de la mancha (-2..2) de cada píxel se lee del propio trozo
      (trozo - casilla, por material), se rellena donde no hay material
      (contornos) y se limpia con un filtro de mayoría, como hacía detallar;
    - lo nuevo es la casilla del tileset + nivel x paso del material, con
      destellos sueltos en el agua nueva (los de detallar);
    - hd es el mundo estirado en x (912 -> 2048, bicúbico: es el filtro que
      mejor reproduce el trozo); md y low, la media de caja de hd con
      redondeo hacia arriba (tools/generar-lods.js; coincide al 100 %); zoom,
      una copia de hd. WebP con pérdida, calidad 70 y método 4, que es lo que
      reproduce el WebP que había.
  Se sustituyen CASILLAS ENTERAS: la que cambia en algo se pinta entera
  (sumar solo la diferencia dejaba el contorno del seto y la raya de la
  orilla vieja como fantasmas); las demás no se tocan. El atlas
  (`recortadas/atlas`) no lo usa el juego y ya no coincidía con hd: no se
  toca.

DESHACER
  --aplicar guarda antes los originales en tools/respaldo-canal-pueblo/
  (si ya están, no los pisa). --deshacer los vuelve a poner y devuelve las
  casillas, el choque y la versión.
  Ojo: si se vuelve a exportar el mapa desde Tiled (el .tmx no está en el
  proyecto), el canal se pierde de la capa: vuelve a pasar --aplicar.
"""
import json
import os
import re
import shutil
import sys

import numpy as np
from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAPA = os.path.join(RAIZ, 'Maps', 'mapa_principal.json')
TILESET = os.path.join(RAIZ, 'Game', 'MAPAS', 'tiles.png')
RECORTE = os.path.join(RAIZ, 'recortadas')
MANIFIESTO = os.path.join(RECORTE, 'mapa.json')
ESCENA = os.path.join(RAIZ, 'Scenes', 'GameScene.js')
RESPALDO = os.path.join(RAIZ, 'tools', 'respaldo-canal-pueblo')
VERSION_NUEVA = '20261124a'

T = 16                          # casilla
W_MAPA = H_MAPA = 313           # casillas
TROZO = {'x': 4096, 'y': 2048, 'w': 912, 'h': 2048}   # r1_c2 en el mundo
ARCHIVOS = {                    # nivel -> archivos del trozo r1_c2
    'hd': ['hd/tile_r1_c2_id6_hd.png', 'hd/tile_r1_c2_id6_hd.webp'],
    'zoom': ['zoom/tile_r1_c2_id6_zoom.png', 'zoom/tile_r1_c2_id6_zoom.webp'],
    'md': ['md/tile_r1_c2_id6_md.png'],
    'low': ['low/tile_r1_c2_id6_low.png'],
}

# ─────────────────────────────────────────────────────────────── EL CANAL
R0, RS = 168, 178               # fila del margen norte y del borde sur
C_RIO, C_FIN = 297, 312         # columna de la orilla este del río y la última del mapa
CHOQUE = {'id_nombre': 'canal_este', 'x': 4780, 'y': 2690, 'w': 260, 'h': 174}


def ediciones():
    """(columna, fila) -> gid nuevo."""
    e = {}
    # Norte: margen de arena, talud y agua con espuma. Empalme con el río en
    # C_RIO+1 (899/989/1079, como en las filas 115-117 del mapa) y la orilla
    # del río sigue en C_RIO hasta el talud.
    e[(C_RIO + 1, R0)], e[(C_RIO + 1, R0 + 1)], e[(C_RIO + 1, R0 + 2)] = 899, 989, 1079
    e[(C_RIO, R0 + 2)] = 1610
    for c in range(C_RIO + 2, C_FIN + 1):
        par = (c - (C_RIO + 2)) % 2          # tras el empalme va la 1249, como en el mapa
        e[(c, R0)] = 1249 + par
        e[(c, R0 + 1)] = 1339 + par
        e[(c, R0 + 2)] = 1429 + par
    for r in range(R0 + 3, RS - 1):          # el agua
        for c in range(C_RIO, C_FIN + 1):
            e[(c, r)] = 1610
    for c in range(C_RIO, C_RIO + 3):        # última fila de agua
        e[(c, RS - 1)] = 1610
    for c in range(C_RIO + 3, C_FIN + 1):
        e[(c, RS - 1)] = 1789 + (c - (C_RIO + 3)) % 2
    # Sur: borde de arena y arena. Empalme 87/88 + 177/178 (filas 87-88 del mapa).
    e[(C_RIO + 1, RS)], e[(C_RIO + 2, RS)] = 87, 88
    e[(C_RIO + 1, RS + 1)], e[(C_RIO + 2, RS + 1)] = 177, 178
    for c in range(C_RIO + 3, C_FIN + 1):
        par = (c - (C_RIO + 3)) % 2
        e[(c, RS)] = 1879 + par
        e[(c, RS + 1)] = 1969 + par
    # El seto de hierba del borde este, que el canal corta: arriba se cierra una
    # fila antes (2145 -> 2415 -> 2505, el fondo 2506/2507) y deja arena en la
    # 167; abajo la fila 180 queda de arena y la 181 es el borde de arriba
    # (2055 2056 2057 2058 2057), que ya empezaba en la columna 308.
    e.update({(310, 165): 2415, (311, 165): 2416,
              (310, 166): 2505, (311, 166): 2506, (312, 166): 2507,
              (308, 167): 178, (309, 167): 179, (310, 167): 179, (311, 167): 179, (312, 167): 179,
              (310, 180): 179, (311, 180): 179, (312, 180): 179,
              (310, 181): 2057, (311, 181): 2058, (312, 181): 2057})
    return e


# Lo que tiene que haber antes (la orilla del río), para no pintar encima de
# un mapa que alguien ha cambiado por ahí.
def precondicion(datos):
    for r in range(R0, RS + 2):
        g = datos[r * W_MAPA + C_RIO]
        if r in (R0, R0 + 1, RS, RS + 1) and g not in (1612, 1702):
            return 'la orilla del río (columna %d, fila %d) es %d y no 1612/1702' % (C_RIO, r, g)
        if g not in (1612, 1702, 1610):
            return 'la columna %d, fila %d es %d' % (C_RIO, r, g)
    return None


# ───────────────────────────────────────────────────────────── EL ARCHIVO
def leer_mapa():
    crudo = open(MAPA, 'rb').read()
    i = crudo.find(b'"layers":[')
    j = crudo.find(b'"data":[', i)
    k = crudo.find(b']', j)
    if i < 0 or j < 0 or k < 0:
        raise SystemExit('no encuentro la capa de casillas en ' + MAPA)
    trozos = re.split(rb'(\d+)', crudo[j + len(b'"data":['):k])
    numeros = [int(t) for t in trozos[1::2]]
    if len(numeros) != W_MAPA * H_MAPA:
        raise SystemExit('la capa tiene %d casillas y no %d' % (len(numeros), W_MAPA * H_MAPA))
    capa = next(l for l in json.loads(crudo.decode('utf-8'))['layers'] if l['name'] == 'mapa_principal')
    if [g for g in capa['data']] != numeros:
        raise SystemExit('la primera capa de datos no es mapa_principal')
    return crudo, j + len(b'"data":['), k, trozos, numeros


def escribir_capa(crudo, ini, fin, trozos, numeros):
    trozos = list(trozos)
    trozos[1::2] = [str(n).encode() for n in numeros]
    return crudo[:ini] + b''.join(trozos) + crudo[fin:]


def objeto_choque(id_):
    c = CHOQUE
    campos = [('height', c['h']), ('id', id_), ('name', '"%s"' % c['id_nombre']), ('opacity', 1),
              ('rotation', 0), ('type', '""'), ('visible', 'true'), ('width', c['w']), ('x', c['x']), ('y', c['y'])]
    lineas = ['                {'] + ['                 "%s":%s%s' % (k, v, ',' if n < len(campos) - 1 else '')
                                       for n, (k, v) in enumerate(campos)] + ['                }, ']
    return ('\r\n'.join(lineas) + '\r\n').encode()


def poner_choque(crudo):
    if b'"name":"%s"' % CHOQUE['id_nombre'].encode() in crudo:
        return crudo, None
    m = re.search(rb'"nextobjectid":(\d+)', crudo)
    nuevo = int(m.group(1))
    a = crudo.find(b'"name":"area_colision_general"')
    b = crudo.find(b'"id":139,', a)              # tras el del río
    if a < 0 or b < 0:
        raise SystemExit('no encuentro el choque del río (id 139) en area_colision_general')
    fin = crudo.find(b'}, \r\n', b) + len(b'}, \r\n')
    if b'"x":4421,' not in crudo[b:fin]:
        raise SystemExit('el objeto 139 de area_colision_general ya no es el del río (x 4421)')
    crudo = crudo[:fin] + objeto_choque(nuevo) + crudo[fin:]
    crudo = crudo.replace(m.group(0), b'"nextobjectid":%d' % (nuevo + 1), 1)
    return crudo, nuevo


def quitar_choque(crudo, id_):
    patron = re.compile(rb'                \{\r\n(?:                 "[a-z]+":[^\r\n]*\r\n){10}                \}, \r\n')
    for m in patron.finditer(crudo):
        if b'"name":"%s"' % CHOQUE['id_nombre'].encode() in m.group(0):
            crudo = crudo[:m.start()] + crudo[m.end():]
            n = re.search(rb'"nextobjectid":(\d+)', crudo)
            if id_ is not None and int(n.group(1)) == id_ + 1:
                crudo = crudo.replace(n.group(0), b'"nextobjectid":%d' % id_, 1)
            return crudo
    return crudo


# ─────────────────────────────────────────────────────────────── EL DIBUJO
PASO = {'hierba': (10, 18, 8), 'tierra': (12, 10, 8), 'agua': (8, 12, 14)}


def materiales(im):
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    return {'hierba': (g > r + 30) & (g > b + 25) & (mx > 80),
            'agua': (b > r + 45) & (b > g + 10) & (mx > 110),
            'tierra': (r > g + 25) & (g > b + 10) & (mx > 120),
            'piedra': ((mx - mn) < 22) & (mx > 70) & (mx < 170)}


def pintar_casillas(datos, x0, y0, x1, y1, ts):
    out = np.zeros((y1 - y0, x1 - x0, 4), np.int16)
    cols = ts.shape[1] // T
    for ty in range(y0 // T, (y1 + T - 1) // T):
        for tx in range(x0 // T, (x1 + T - 1) // T):
            i = (datos[ty * W_MAPA + tx] & 0x1FFFFFFF) - 1
            casilla = ts[(i // cols) * T:(i // cols) * T + T, (i % cols) * T:(i % cols) * T + T]
            ya, xa = ty * T - y0, tx * T - x0
            sy0, sx0 = max(0, -ya), max(0, -xa)
            sy1, sx1 = min(T, y1 - y0 - ya), min(T, x1 - x0 - xa)
            out[ya + sy0:ya + sy1, xa + sx0:xa + sx1] = casilla[sy0:sy1, sx0:sx1]
    return out


def caja(a, r):
    p = np.pad(a.astype(np.int32), r, mode='edge')
    c = np.cumsum(np.cumsum(p, 0), 1)
    c = np.pad(c, ((1, 0), (1, 0)))
    k = 2 * r + 1
    return c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]


def niveles(trozo_mundo, viejo):
    """El nivel de mancha de cada píxel, leído del trozo: (trozo - casilla) / paso."""
    D = trozo_mundo[..., :3].astype(np.float64) - viejo[..., :3]
    L = np.full(D.shape[:2], 99, np.int16)
    for nom, msk in materiales(viejo).items():
        if nom == 'piedra':
            continue
        p = np.array(PASO[nom], float)
        v = np.clip(np.rint((D * p).sum(-1) / (p * p).sum()), -2, 2)
        L[msk] = v[msk]
    # Relleno de los contornos (sin material) con lo que más hay alrededor.
    valores = (-2, -1, 0, 1, 2)
    for _ in range(12):
        hueco = L == 99
        if not hueco.any():
            break
        cuentas = np.stack([caja(L == v, 3) for v in valores])
        relleno = np.array(valores, np.int16)[np.argmax(cuentas, axis=0)]
        hay = cuentas.max(0) > 0
        L = np.where(hueco & hay, relleno, L)
    L[L == 99] = 0
    # Mayoría 9x9: borra lo que no era mancha (matas, destellos, bordes).
    cuentas = np.stack([caja(L == v, 4) for v in valores])
    return np.array(valores, np.int16)[np.argmax(cuentas, axis=0)]


def detallar(casillas, L, nuevo_agua=None, semilla=20261124):
    """Lo que hacía detallar el 2026-10-07: tono por material, sombra de la piedra
    y (solo en `nuevo_agua`) destellos sueltos."""
    im = casillas.astype(np.int16).copy()
    mats = materiales(casillas)
    for nom in ('hierba', 'tierra', 'agua'):
        for k in range(3):
            im[..., k] += (L * PASO[nom][k] * mats[nom]).astype(np.int16)
    h, w = im.shape[:2]
    sombra = np.zeros((h, w), np.float32)
    for dy, dx, peso in ((1, 1, 1.0), (2, 1, 0.75), (3, 2, 0.5), (4, 2, 0.28)):
        s = np.zeros((h, w), bool)
        s[dy:, dx:] = mats['piedra'][:-dy, :-dx]
        sombra = np.maximum(sombra, s * peso)
    oscurece = np.where(sombra > 0.6, 0.72, np.where(sombra > 0.35, 0.82, np.where(sombra > 0.2, 0.93, 1.0)))
    suelo = mats['hierba'] | mats['tierra']
    for k in range(3):
        im[..., k] = np.where(suelo, (im[..., k] * oscurece).astype(np.int16), im[..., k])
    if nuevo_agua is not None:
        agua = mats['agua'] & nuevo_agua
        rng = np.random.default_rng(semilla)
        n = int(agua.sum()) // 1800
        libre = caja(agua, 2) == 25
        puestos = 0
        for y, x in zip(rng.integers(2, h - 2, 20000), rng.integers(2, w - 4, 20000)):
            if puestos >= n:
                break
            if not libre[y, x]:
                continue
            im[y, x, :3] += (34, 34, 28)
            im[y, x + 1, :3] += (20, 20, 16)
            puestos += 1
    return np.clip(im, 0, 255)


def estirar(im, ancho):
    """Del mundo al archivo hd: solo en x (912 -> 2048), bicúbico."""
    return np.array(Image.fromarray(im.astype(np.uint8), 'RGBA').resize((ancho, im.shape[0]), Image.BICUBIC)).astype(np.int16)


def media_caja(im, f):
    """Como tools/generar-lods.js: media de caja con Math.round (mitades hacia arriba)."""
    h, w, c = im.shape
    s = im.astype(np.int64).reshape(h // f, f, w // f, f, c).sum((1, 3))
    n = f * f
    return ((s + n // 2) // n).astype(np.uint8)


def suelo_nuevo(datos_viejos, datos_nuevos):
    """El trozo hd nuevo (2048x2048 RGBA) y la zona que cambia, en el mundo."""
    ts = np.array(Image.open(TILESET).convert('RGBA')).astype(np.int16)
    hd_png = os.path.join(RECORTE, ARCHIVOS['hd'][0])
    hd = np.array(Image.open(hd_png).convert('RGBA')).astype(np.int16)
    xs = [c for c, _ in ediciones()]
    ys = [r for _, r in ediciones()]
    y0 = (min(ys) - 3) * T
    y1 = (max(ys) + 4) * T
    x0, x1 = TROZO['x'], TROZO['x'] + TROZO['w']
    viejo = pintar_casillas(datos_viejos, x0, y0, x1, y1, ts)
    nuevo = pintar_casillas(datos_nuevos, x0, y0, x1, y1, ts)
    # CASILLAS ENTERAS: la que cambia en algo se pinta entera desde el tileset.
    # Sumar solo la diferencia dejaba fantasmas (el contorno del seto, la raya
    # de la orilla del río) donde el trozo viejo no coincide al píxel con su
    # reconstrucción; con la casilla entera no queda nada de lo de antes, y la
    # costura cae entre casillas, donde el dibujo ya empalma.
    hy, hx = (y1 - y0) // T, (x1 - x0) // T
    celdas = (viejo != nuevo).any(-1).reshape(hy, T, hx, T).any(axis=(1, 3))
    cambia = np.repeat(np.repeat(celdas, T, axis=0), T, axis=1)
    # El trozo en el mundo (para leer el tono): media de caja de hd a 912.
    mundo = np.array(Image.fromarray(hd.astype(np.uint8), 'RGBA').resize((TROZO['w'], TROZO['h']), Image.BOX)).astype(np.int16)
    mundo = mundo[y0 - TROZO['y']:y1 - TROZO['y']]
    L = niveles(mundo, viejo)
    U_nuevo = estirar(detallar(nuevo, L, nuevo_agua=cambia), hd.shape[1])
    col = np.minimum(((np.arange(hd.shape[1]) + 0.5) * TROZO['w'] / hd.shape[1]).astype(int), TROZO['w'] - 1)
    fy0, fy1 = y0 - TROZO['y'], y1 - TROZO['y']
    franja = np.where(cambia[:, col][..., None], U_nuevo, hd[fy0:fy1])
    franja[..., 3] = 255
    hd_nuevo = hd.copy()
    hd_nuevo[fy0:fy1] = np.clip(franja, 0, 255)
    return hd_nuevo.astype(np.uint8), (x0, y0, x1, y1), cambia


# ───────────────────────────────────────────────────────────── LA VERSIÓN
def version_actual():
    m = re.search(rb'"version": "([^"]+)"', open(MANIFIESTO, 'rb').read())
    return m.group(1).decode() if m else None


def poner_version(antes, despues):
    for ruta, viejo, nuevo in ((MANIFIESTO, '"version": "%s"' % antes, '"version": "%s"' % despues),
                               (ESCENA, "recortadas/mapa.json?v=%s'" % antes, "recortadas/mapa.json?v=%s'" % despues)):
        txt = open(ruta, 'rb').read()
        if txt.count(viejo.encode()) != 1:
            raise SystemExit('%s: esperaba una vez %r' % (ruta, viejo))
        tmp = ruta + '.tmp'
        open(tmp, 'wb').write(txt.replace(viejo.encode(), nuevo.encode(), 1))
        os.replace(tmp, ruta)


# ──────────────────────────────────────────────────────────────── EL AGUA
def agua_cliente(datos):
    """Las casillas con agua como las ve gf-agua (0 tierra, 1 orilla, 2 agua):
    un 12 % de azul es orilla y un 90 %, agua entera. Es lo que usa gf-botes
    para remar; la pesca (gf-pesca) pide un 35 % para la orilla, así que esto
    la cubre."""
    ts = np.array(Image.open(TILESET).convert('RGBA')).astype(np.int16)
    cols = ts.shape[1] // T
    cache = {}
    clase = np.zeros(W_MAPA * H_MAPA, np.uint8)
    for i, g in enumerate(datos):
        g &= 0x1FFFFFFF
        if g <= 0:
            continue
        if g not in cache:
            t = g - 1
            c = ts[(t // cols) * T:(t // cols) * T + T, (t % cols) * T:(t % cols) * T + T]
            r, gg, b, a = c[..., 0], c[..., 1], c[..., 2], c[..., 3]
            ratio = ((a > 40) & (b > 110) & (b > r + 35) & (b > gg + 10)).mean()
            cache[g] = 0 if ratio < 0.12 else (2 if ratio >= 0.9 else 1)
        clase[i] = cache[g]
    return clase


def rle_servidor(datos, servidor=None):
    """PESCA_AGUA_RLE con el canal: lo que ya tenía el servidor + el agua nueva."""
    marca = agua_cliente(datos) > 0
    if servidor:
        src = open(servidor, encoding='utf-8', errors='surrogatepass').read()
        m = re.search(r"const PESCA_AGUA_RLE = \(\s*((?:'[^']*'\s*\+?\s*)+)\)", src)
        viejo = ''.join(re.findall(r"'([^']*)'", m.group(1))).split(';')
        for y, fila in enumerate(viejo):
            for r in filter(None, fila.split(',')):
                a, b = map(int, r.split('-'))
                marca[y * W_MAPA + a:y * W_MAPA + b + 1] = True
    filas = []
    for y in range(H_MAPA):
        tramos, x = [], 0
        while x < W_MAPA:
            if marca[y * W_MAPA + x]:
                a = x
                while x + 1 < W_MAPA and marca[y * W_MAPA + x + 1]:
                    x += 1
                tramos.append('%d-%d' % (a, x))
            x += 1
        filas.append(','.join(tramos))
    texto = ';'.join(filas)
    trozos = [texto[i:i + 110] for i in range(0, len(texto), 110)]
    return 'const PESCA_AGUA_RLE = (\n' + ' +\n'.join("  '%s'" % t for t in trozos) + '\n);'


# ────────────────────────────────────────────────────────────── ÓRDENES
def datos_con_canal(numeros):
    nuevos = list(numeros)
    for (c, r), g in ediciones().items():
        nuevos[r * W_MAPA + c] = g
    return nuevos


def estado(numeros):
    e = ediciones()
    puestas = sum(1 for (c, r), g in e.items() if numeros[r * W_MAPA + c] == g)
    return 'puesto' if puestas == len(e) else ('quitado' if puestas < len(e) // 2 else 'a medias')


def ver(salida):
    _, _, _, _, numeros = leer_mapa()
    viejos = numeros
    if estado(numeros) == 'puesto':
        viejos = json.load(open(os.path.join(RESPALDO, 'casillas.json')))['antes']
        viejos = [int(g) for g in viejos]
    nuevos = datos_con_canal(viejos)
    hd_nuevo, (x0, y0, x1, y1), _ = suelo_nuevo(viejos, nuevos)
    ts = np.array(Image.open(TILESET).convert('RGBA')).astype(np.int16)
    hd_viejo = Image.open(os.path.join(RECORTE, ARCHIVOS['hd'][0])).convert('RGBA')
    def mundo(img):
        return img.resize((TROZO['w'], TROZO['h']), Image.BICUBIC).crop((4640 - x0 + 0, y0 - TROZO['y'], TROZO['w'], y1 - TROZO['y']))
    a = mundo(hd_viejo)
    b = mundo(Image.fromarray(hd_nuevo, 'RGBA'))
    c = Image.fromarray(pintar_casillas(nuevos, 4640, y0, x1, y1, ts).astype(np.uint8), 'RGBA')
    esc = 3
    lienzo = Image.new('RGB', ((a.width * 3 + 16) * esc, a.height * esc), (255, 0, 255))
    for n, im in enumerate((a, b, c)):
        lienzo.paste(im.resize((im.width * esc, im.height * esc), Image.NEAREST).convert('RGB'), (n * (a.width + 8) * esc, 0))
    lienzo.save(salida)
    print('vista:', salida, lienzo.size, '(antes | después | casillas)')


def aplicar():
    crudo, ini, fin, trozos, numeros = leer_mapa()
    est = estado(numeros)
    if est == 'puesto':
        print('el canal ya está en la capa; no hago nada')
        return
    if est == 'a medias':
        raise SystemExit('la capa tiene el canal a medias: revisa a mano antes de seguir')
    fallo = precondicion(numeros)
    if fallo:
        raise SystemExit('no aplico: ' + fallo)
    ver_antes = version_actual()
    if ver_antes == VERSION_NUEVA:
        raise SystemExit('la versión del recorte ya es %s: súbela en el script' % VERSION_NUEVA)
    # Respaldo (si ya existe, es el original de verdad: no se pisa).
    os.makedirs(RESPALDO, exist_ok=True)
    for lista in ARCHIVOS.values():
        for rel in lista:
            dst = os.path.join(RESPALDO, rel.replace('/', '__'))
            if not os.path.exists(dst):
                shutil.copy2(os.path.join(RECORTE, rel), dst)
    meta = os.path.join(RESPALDO, 'casillas.json')
    if not os.path.exists(meta):
        json.dump({'antes': numeros, 'version': ver_antes}, open(meta, 'w'))
    nuevos = datos_con_canal(numeros)
    # 1 y 2: la capa y el choque, en un solo archivo nuevo.
    crudo2 = escribir_capa(crudo, ini, fin, trozos, nuevos)
    crudo2, id_choque = poner_choque(crudo2)
    json.loads(crudo2.decode('utf-8'))                     # que siga siendo JSON
    datos_meta = json.load(open(meta))
    datos_meta['choque'] = id_choque
    json.dump(datos_meta, open(meta, 'w'))
    # 3: el suelo.
    hd_nuevo, _, _ = suelo_nuevo(numeros, nuevos)
    im = Image.fromarray(hd_nuevo, 'RGBA')
    tmp = {}
    def guardar(rel, f):
        ruta = os.path.join(RECORTE, rel)
        tmp[ruta] = ruta + '.tmp'
        f(tmp[ruta])
    guardar(ARCHIVOS['hd'][0], lambda p: im.save(p, 'PNG', optimize=True))
    guardar(ARCHIVOS['hd'][1], lambda p: im.convert('RGB').save(p, 'WEBP', quality=70, method=4))
    guardar(ARCHIVOS['md'][0], lambda p: Image.fromarray(media_caja(hd_nuevo, 2), 'RGBA').save(p, 'PNG', optimize=True))
    guardar(ARCHIVOS['low'][0], lambda p: Image.fromarray(media_caja(hd_nuevo, 4), 'RGBA').save(p, 'PNG', optimize=True))
    guardar(ARCHIVOS['zoom'][0], lambda p: shutil.copyfile(tmp[os.path.join(RECORTE, ARCHIVOS['hd'][0])], p))
    guardar(ARCHIVOS['zoom'][1], lambda p: shutil.copyfile(tmp[os.path.join(RECORTE, ARCHIVOS['hd'][1])], p))
    for ruta, t in tmp.items():
        os.replace(t, ruta)
    t = MAPA + '.tmp'
    open(t, 'wb').write(crudo2)
    os.replace(t, MAPA)
    # 4: la versión.
    poner_version(ver_antes, VERSION_NUEVA)
    print('canal puesto: %d casillas, choque id %s, versión %s -> %s' % (len(ediciones()), id_choque, ver_antes, VERSION_NUEVA))
    print('falta el servidor: python tools/canal-del-pueblo.py --rle <server2.js>')


def deshacer():
    meta = os.path.join(RESPALDO, 'casillas.json')
    if not os.path.exists(meta):
        raise SystemExit('no hay respaldo en ' + RESPALDO)
    info = json.load(open(meta))
    crudo, ini, fin, trozos, numeros = leer_mapa()
    antes = [int(g) for g in info['antes']]
    for (c, r) in ediciones():
        numeros[r * W_MAPA + c] = antes[r * W_MAPA + c]
    crudo2 = quitar_choque(escribir_capa(crudo, ini, fin, trozos, numeros), info.get('choque'))
    json.loads(crudo2.decode('utf-8'))
    t = MAPA + '.tmp'
    open(t, 'wb').write(crudo2)
    os.replace(t, MAPA)
    for lista in ARCHIVOS.values():
        for rel in lista:
            shutil.copy2(os.path.join(RESPALDO, rel.replace('/', '__')), os.path.join(RECORTE, rel))
    if version_actual() == VERSION_NUEVA and info.get('version'):
        poner_version(VERSION_NUEVA, info['version'])
    print('canal quitado (casillas, choque, suelo y versión)')


# ─────────────────────────────────────────────────────────────── EL MUELLE
# (2026-11-24) El muelle de madera del ferri (gf-ferri.js) sale de la orilla
# oeste hacia la boca del canal y SE PISA: el choque del río (objeto 139 de
# area_colision_general) se parte en dos, por encima y por debajo de la
# pasarela, y la punta (donde amarra el ferri) sigue cerrada con su propio
# rectángulo. Las cotas son las del dibujo (Game/Objetos/ferri/muelle.png a
# escala 2 con su esquina en 4406,2760): la tabla que se pisa va de y 2770 a
# 2834, y el muelle acaba en x 4598, donde empieza el timón del ferri.
MUELLE = {'y0': 2770, 'y1': 2834, 'x_punta': 4598}
NOMBRES_MUELLE = ('muelle_sur', 'muelle_punta')


def objeto(id_, nombre, x, y, w, h):
    campos = [('height', h), ('id', id_), ('name', '"%s"' % nombre), ('opacity', 1),
              ('rotation', 0), ('type', '""'), ('visible', 'true'), ('width', w), ('x', x), ('y', y)]
    lineas = ['                {'] + ['                 "%s":%s%s' % (k, v, ',' if n < len(campos) - 1 else '')
                                       for n, (k, v) in enumerate(campos)] + ['                }, ']
    return ('\r\n'.join(lineas) + '\r\n').encode()


def _rio(crudo):
    """El objeto 139 (el río): su trozo de bytes y sus números."""
    a = crudo.find(b'"name":"area_colision_general"')
    b = crudo.find(b'"id":139,', a)
    if a < 0 or b < 0:
        raise SystemExit('no encuentro el choque del río (id 139) en area_colision_general')
    ini = crudo.rfind(b'                {\r\n', 0, b)
    fin = crudo.find(b'}, \r\n', b) + len(b'}, \r\n')
    trozo = crudo[ini:fin]
    num = {k.decode(): float(v) for k, v in re.findall(rb'"(height|width|x|y)":([0-9.]+)', trozo)}
    if num.get('x') != 4421:
        raise SystemExit('el objeto 139 ya no es el del río (x %s)' % num.get('x'))
    return ini, fin, trozo, num


def poner_muelle():
    crudo = open(MAPA, 'rb').read()
    if b'"name":"muelle_punta"' in crudo:
        print('el muelle ya está puesto; no hago nada')
        return
    ini, fin, trozo, num = _rio(crudo)
    alto_txt = re.search(rb'"height":([0-9.]+)', trozo).group(1).decode()
    y0, y1 = MUELLE['y0'], MUELLE['y1']
    if not (num['y'] < y0 < y1 < num['y'] + num['height']):
        raise SystemExit('la pasarela no cae dentro del río: revisa MUELLE')
    os.makedirs(RESPALDO, exist_ok=True)
    meta = os.path.join(RESPALDO, 'muelle.json')
    if not os.path.exists(meta):
        json.dump({'alto_139': alto_txt}, open(meta, 'w'))
    fondo = num['y'] + num['height']
    derecha = num['x'] + num['width']
    nuevo_alto = y0 - num['y']
    trozo2 = trozo.replace(b'"height":' + alto_txt.encode() + b',', b'"height":%s,' % str(int(nuevo_alto)).encode(), 1)
    m = re.search(rb'"nextobjectid":(\d+)', crudo)
    n = int(m.group(1))
    def r2(v):
        return ('%.3f' % v).rstrip('0').rstrip('.')
    extra = (objeto(n, 'muelle_sur', 4421, y1, r2(num['width']), r2(fondo - y1)) +
             objeto(n + 1, 'muelle_punta', MUELLE['x_punta'], y0, r2(derecha - MUELLE['x_punta']), y1 - y0))
    crudo2 = crudo[:ini] + trozo2 + extra + crudo[fin:]
    crudo2 = crudo2.replace(m.group(0), b'"nextobjectid":%d' % (n + 2), 1)
    json.loads(crudo2.decode('utf-8'))
    t = MAPA + '.tmp'
    open(t, 'wb').write(crudo2)
    os.replace(t, MAPA)
    print('muelle puesto: río 139 hasta y %d, muelle_sur (id %d) desde y %d, muelle_punta (id %d) desde x %d'
          % (y0, n, y1, n + 1, MUELLE['x_punta']))


def quitar_muelle():
    meta = os.path.join(RESPALDO, 'muelle.json')
    if not os.path.exists(meta):
        raise SystemExit('no hay respaldo del muelle en ' + RESPALDO)
    alto = json.load(open(meta))['alto_139']
    crudo = open(MAPA, 'rb').read()
    patron = re.compile(rb'                \{\r\n(?:                 "[a-z]+":[^\r\n]*\r\n){10}                \}, \r\n')
    quitados = []
    for nombre in NOMBRES_MUELLE:
        for m in patron.finditer(crudo):
            if b'"name":"%s"' % nombre.encode() in m.group(0):
                quitados.append(int(re.search(rb'"id":(\d+)', m.group(0)).group(1)))
                crudo = crudo[:m.start()] + crudo[m.end():]
                break
    ini, fin, trozo, num = _rio(crudo)
    trozo2 = re.sub(rb'"height":[0-9.]+,', b'"height":' + alto.encode() + b',', trozo, count=1)
    crudo = crudo[:ini] + trozo2 + crudo[fin:]
    n = re.search(rb'"nextobjectid":(\d+)', crudo)
    if quitados and int(n.group(1)) == max(quitados) + 1:
        crudo = crudo.replace(n.group(0), b'"nextobjectid":%d' % min(quitados), 1)
    json.loads(crudo.decode('utf-8'))
    t = MAPA + '.tmp'
    open(t, 'wb').write(crudo)
    os.replace(t, MAPA)
    print('muelle quitado: el río vuelve a medir %s' % alto)


if __name__ == '__main__':
    args = sys.argv[1:]
    if args[:1] == ['--ver'] and len(args) == 2:
        ver(args[1])
    elif args == ['--aplicar']:
        aplicar()
    elif args == ['--deshacer']:
        deshacer()
    elif args == ['--muelle']:
        poner_muelle()
    elif args == ['--sin-muelle']:
        quitar_muelle()
    elif args[:1] == ['--rle']:
        _, _, _, _, numeros = leer_mapa()
        print(rle_servidor(numeros, args[1] if len(args) > 1 else None))
    else:
        raise SystemExit(__doc__)
