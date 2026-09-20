# -*- coding: utf-8 -*-
"""
100 stickers animados para Discord, con LOS SPRITES DEL JUEGO SIN TOCAR.

Ni un pixel del personaje esta redibujado: son los PNG de
`Game/newpro/personajes/personajeN/<direccion>/run_1..7.png` (24x50) y los 6
fotogramas de `Game/newpro/pesca_anim`. Lo mismo con los animales de
`Game/Sprites`, los cultivos de `Game/newpro/plantas` y las herramientas y props
de `utiles`, `granja`, `objetos`, `naturaleza`, `recursos`, `comidas`.

La accion no sale de deformar al personaje, sale de ANIMAR la escena con el
propio arte del juego:
  - el personaje anda con sus 7 fotogramas, pesca con los suyos, salta o tiembla
    desplazandose en pixeles enteros (nunca escalado ni rotado)
  - los cultivos crecen de verdad recorriendo sus 6 etapas
  - los animales usan sus fotogramas, las fogatas y faroles alternan _1/_2
  - y encima van las particulas: semillas, agua, chispas, polvo, hojas, confeti

Formato: lienzo logico de 80x80 escalado x4 con NEAREST -> 320x320, recortado
con contorno blanco y fondo transparente, que es lo que pide Discord.

Uso:  python tools/generar-stickers.py
"""

import json
import math
import os
import random
import sys
from collections import Counter

from PIL import Image, ImageDraw, ImageFilter

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, "Game", "newpro", "stickers")

LADO = 80
ESCALA = 4
FRAMES = 12
MS = 100
SUELO = 64          # donde apoyan los pies
PJ_X = 18           # el personaje, a la izquierda; la derecha para la escena

LINEA = (20, 21, 24, 255)
BLANCO = (250, 249, 245, 255)
AMARILLO = (232, 190, 84, 255)
AMARILLO_L = (250, 226, 150, 255)
AGUA = (120, 178, 216, 255)
AGUA_L = (186, 224, 244, 255)
ROJO = (176, 62, 58, 255)
ROSA = (226, 122, 132, 255)
VERDE = (96, 160, 78, 255)
VERDE_L = (140, 196, 108, 255)
VERDE_S = (58, 108, 52, 255)
HUESO = (238, 232, 216, 255)


# ============================================================ biblioteca ====
_c = {}


def cargar(rel):
    if rel not in _c:
        ruta = os.path.join(RAIZ, rel.replace("/", os.sep))
        if not os.path.exists(ruta):
            raise IOError("falta " + rel)
        _c[rel] = Image.open(ruta).convert("RGBA")
    return _c[rel]


def pj(nom, direccion, i):
    return cargar("Game/newpro/personajes/%s/%s/run_%d.png" % (nom, direccion, 1 + (i % 7)))


def pj_pesca(nom, direccion, i):
    return cargar("Game/newpro/pesca_anim/%s/%s/pescar_%d.png" % (nom, direccion, 1 + (i % 6)))


def mapa(tema):
    return cargar("Game/newpro/mapas/%s.png" % tema)


def planta(c, etapa):
    return cargar("Game/newpro/plantas/planta_%s/%d.png" % (c, etapa))


def item(c, n):
    return cargar("Game/newpro/plantas/planta_%s/%s.png" % (c, n))


def util(n):
    return cargar("Game/newpro/utiles/%s.png" % n)


def granja(n):
    return cargar("Game/newpro/granja/%s.png" % n)


def objeto(n):
    return cargar("Game/newpro/objetos/%s.png" % n)


def naturaleza(n):
    return cargar("Game/newpro/naturaleza/%s.png" % n)


def recurso(n):
    return cargar("Game/newpro/recursos/%s.png" % n)


def comida(n):
    return cargar("Game/newpro/comidas/%s.png" % n)


def pocion(n):
    return cargar("Game/newpro/pociones/%s.png" % n)


def animal(clave, i, n):
    return cargar("Game/Sprites/animales/%s_%d.png" % (clave, 1 + (i % n)))


def gallina(i):
    return cargar("Game/Sprites/Chiken/%d.png" % (1 + (i % 4)))


def cuervo(i):
    return cargar("Game/Sprites/cuervo/cuervo_camina_%d.png" % (1 + (i % 4)))


def perro(i):
    return cargar("Game/Sprites/mascota/derecha/run_%d.png" % (1 + (i % 4)))


CARPETAS = {"utiles": util, "granja": granja, "objetos": objeto,
            "naturaleza": naturaleza, "recursos": recurso, "comidas": comida,
            "pociones": pocion}


# =========================================== plataforma con terreno real ====
# Trozos de los mapas del juego que son terreno limpio, para la peana.
TERRENOS = {
    "hierba": ("pradera", 96, 208),
    "tierra": ("pradera", 452, 216),
    "camino": ("pradera", 232, 352),
    "nieve":  ("nieve", 96, 208),
    "otono":  ("otono", 96, 208),
    "piedra": ("cueva", 452, 216),
    "arena":  ("desierto", 452, 216),
    "jungla": ("jungla", 96, 208),
    "pantano": ("pantano", 96, 208),
    "volcan": ("volcan", 452, 216),
    "agua":   ("pradera", 690, 430),
    "orilla": ("pradera", 648, 420),
}

_peanas = {}


def peana(tipo, w=62, h=20):
    """Ovalo de terreno recortado del mapa real, con su linea oscura."""
    clave = (tipo, w, h)
    if clave in _peanas:
        return _peanas[clave]
    tema, x, y = TERRENOS[tipo]
    trozo = mapa(tema).crop((x, y, x + w, y + h)).convert("RGBA")
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, w - 1, h - 1], fill=255)
    out = Image.new("RGBA", (w + 2, h + 2), (0, 0, 0, 0))
    borde = Image.new("RGBA", (w + 2, h + 2), LINEA)
    bm = Image.new("L", (w + 2, h + 2), 0)
    ImageDraw.Draw(bm).ellipse([0, 0, w + 1, h + 1], fill=255)
    borde.putalpha(bm)
    out.alpha_composite(borde)
    out.paste(trozo, (1, 1), mask)
    d = ImageDraw.Draw(out)
    d.ellipse([1, h - 5, w, h], outline=(0, 0, 0, 60))
    _peanas[clave] = out
    return out


_parcelas = {}


def parcela(c, etapa):
    """La baldosa de cultivo (51x53) redondeada, para que no corte el sticker."""
    clave = (c, etapa)
    if clave not in _parcelas:
        im = planta(c, etapa)
        m = Image.new("L", im.size, 0)
        dm = ImageDraw.Draw(m)
        # esquinas redondeadas: la baldosa cuadrada cortaba el sticker en recto
        dm.rounded_rectangle([0, 0, im.width - 1, im.height - 1], radius=15, fill=255)
        out = Image.new("RGBA", im.size, (0, 0, 0, 0))
        out.paste(im, (0, 0), m)
        borde = m.filter(ImageFilter.MaxFilter(3))
        cb = Image.new("RGBA", im.size, LINEA)
        cb.putalpha(borde)
        cb.alpha_composite(out)
        _parcelas[clave] = cb
    return _parcelas[clave]


def sombra(capa, cx, cy, w):
    s = Image.new("RGBA", capa.size, (0, 0, 0, 0))
    ImageDraw.Draw(s).ellipse([cx - w, cy - 3, cx + w, cy + 3], fill=(16, 20, 16, 95))
    capa.alpha_composite(s)


# =============================================================== efectos ====
def efecto(capa, nombre, t, sem, ox=0, oy=0):
    if not nombre:
        return
    d = ImageDraw.Draw(capa)
    rnd = random.Random(sem)
    f = t * math.tau

    if nombre == "semillas":
        for i in range(5):
            p = (t * 2 + i * 0.2) % 1.0
            x = 44 + ox + (i % 3)
            y = 34 + oy + int(p * 22)
            d.point((x, y), AMARILLO)
            d.point((x, y + 1), (186, 142, 56, 255))
    elif nombre == "agua_chorro":
        for i in range(9):
            p = (t * 3 + i / 9.0) % 1.0
            x = 44 + ox + int(p * 12)
            y = 32 + oy + int(p * p * 26)
            d.point((x, y), AGUA)
            d.point((x, y + 1), AGUA_L)
    elif nombre == "gotas":
        for i in range(5):
            p = (t * 2 + i / 5.0) % 1.0
            x = 24 + (i * 11) % 34
            d.line([x, int(p * 26) + 12, x - 1, int(p * 26) + 15], fill=AGUA_L)
    elif nombre == "chispas":
        if math.sin(f * 2) > 0.5:
            for ex, ey in ((50 + ox, 40 + oy), (56 + ox, 34 + oy), (46 + ox, 32 + oy)):
                d.line([ex - 3, ey - 3, ex + 3, ey + 3], fill=AMARILLO)
                d.line([ex + 3, ey - 3, ex - 3, ey + 3], fill=AMARILLO_L)
    elif nombre == "polvo":
        for i in range(7):
            p = (t + i / 7.0) % 1.0
            r = 1 + int(p * 3)
            x = 40 + (i - 3) * 7 - int(p * 9) * (1 if i % 2 else -1)
            y = SUELO - 2 - int(p * 7)
            d.ellipse([x - r, y - r, x + r, y + r],
                      fill=(200, 180, 150, int(190 * (1 - p))))
    elif nombre == "corazones":
        for i in range(3):
            p = (t + i / 3.0) % 1.0
            x = 46 + (i - 1) * 10 + int(math.sin(p * 7 + i) * 2)
            y = int(40 - p * 32)
            if p < 0.9:
                r = 5 - int(p * 2)
                d.ellipse([x - r, y - r, x, y], fill=ROJO)
                d.ellipse([x, y - r, x + r, y], fill=ROJO)
                d.polygon([(x - r, y - 1), (x + r, y - 1), (x, y + r)], fill=ROJO)
                d.point((x - 2, y - 2), ROSA)
    elif nombre == "notas":
        for i in range(3):
            p = (t + i / 3.0) % 1.0
            x = 50 + (i * 7) % 16 + int(math.sin(p * 6 + i) * 3)
            y = int(42 - p * 34)
            c = [ROSA, AGUA, AMARILLO][i]
            d.ellipse([x - 3, y + 1, x, y + 4], fill=c)
            d.rectangle([x - 1, y - 6, x, y + 2], fill=c)
            d.polygon([(x, y - 6), (x + 5, y - 5), (x + 5, y - 2), (x, y - 3)], fill=c)
    elif nombre == "zzz":
        for i in range(3):
            p = (t + i * 0.33) % 1.0
            zx = 48 + i * 5 + int(math.sin(p * 5) * 2)
            zy = int(38 - p * 30)
            lado = 6 - i
            if p < 0.9:
                for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
                    d.line([zx + dx, zy + dy, zx + lado + dx, zy + dy], fill=LINEA)
                    d.line([zx + lado + dx, zy + dy, zx + dx, zy + lado + dy], fill=LINEA)
                    d.line([zx + dx, zy + lado + dy, zx + lado + dx, zy + lado + dy], fill=LINEA)
                d.line([zx, zy, zx + lado, zy], fill=BLANCO)
                d.line([zx + lado, zy, zx, zy + lado], fill=BLANCO)
                d.line([zx, zy + lado, zx + lado, zy + lado], fill=BLANCO)
    elif nombre == "confeti":
        for i in range(18):
            p = (t + i / 18.0) % 1.0
            x = 4 + (i * 37) % 72
            y = int(p * 78)
            col = [ROJO, AMARILLO, VERDE, AGUA, ROSA, (140, 104, 180, 255)][i % 6]
            d.rectangle([x, y, x + 1, y + 1], fill=col)
    elif nombre == "estrellas":
        for i, (ex, ey) in enumerate(((10, 18), (64, 12), (70, 34), (6, 38), (38, 6))):
            if int(t * FRAMES + i * 3) % 6 < 4:
                r = 2 + (i % 2)
                d.line([ex - r, ey, ex + r, ey], fill=AMARILLO)
                d.line([ex, ey - r, ex, ey + r], fill=AMARILLO)
                d.point((ex, ey), AMARILLO_L)
    elif nombre == "humo":
        for i in range(4):
            p = (t + i / 4.0) % 1.0
            r = 1 + int(p * 4)
            x = 50 + ox + int(math.sin(p * 5 + i) * 4)
            y = 36 + oy - int(p * 24)
            d.ellipse([x - r, y - r, x + r, y + r], fill=(202, 202, 206, int(180 * (1 - p))))
    elif nombre == "vapor":
        for i in range(3):
            p = (t + i / 3.0) % 1.0
            x = 50 + ox + int(math.sin(p * 6 + i) * 2)
            y = 40 + oy - int(p * 16)
            d.line([x, y, x, y + 2], fill=(228, 228, 232, int(200 * (1 - p))))
    elif nombre == "lluvia":
        for i in range(22):
            p = (t + rnd.random()) % 1.0
            x = rnd.randrange(2, LADO - 2)
            y = int(p * LADO)
            d.line([x, y, x - 1, y + 4], fill=(176, 212, 240, 230))
    elif nombre == "nieve":
        for i in range(22):
            p = (t + rnd.random()) % 1.0
            x = rnd.randrange(2, LADO - 2)
            y = int(p * LADO)
            d.point((x + int(math.sin(p * 6 + i) * 2), y), BLANCO)
    elif nombre == "hojas":
        for i in range(8):
            p = (t + i / 8.0) % 1.0
            x = 4 + (i * 29) % 70 + int(math.sin(p * 7 + i) * 4)
            y = int(p * LADO)
            col = [(198, 110, 46, 255), (168, 80, 40, 255), (216, 160, 62, 255)][i % 3]
            d.point((x, y), col)
            d.point((x + 1, y), col)
    elif nombre == "luciernagas":
        for i in range(8):
            p = (t + i / 8.0) % 1.0
            ang = p * math.tau + i
            x = int(10 + (i * 9) % 58 + math.cos(ang) * 5)
            y = int(14 + (i * 7) % 42 + math.sin(ang) * 5)
            if int(p * 4) % 2 == 0:
                d.point((x, y), (240, 236, 150, 255))
                d.point((x + 1, y), (190, 186, 96, 190))
    elif nombre == "velocidad":
        for i in range(4):
            y = 30 + i * 7
            largo = 6 + int(abs(math.sin(f + i)) * 6)
            d.line([8 - i, y, 8 - i + largo, y], fill=(228, 232, 240, 210))
    elif nombre == "monedas":
        for i in range(3):
            p = (t + i / 3.0) % 1.0
            x = 48 + i * 8
            y = int(44 - p * 26)
            rx = max(1, int(4 * abs(math.cos(p * math.tau * 1.5))))
            d.ellipse([x - rx, y - 4, x + rx, y + 4], fill=(186, 142, 52, 255))
            d.ellipse([x - max(0, rx - 1), y - 3, x + max(0, rx - 1), y + 3], fill=AMARILLO)
    elif nombre == "burbujas":
        for i in range(6):
            p = (t + i / 6.0) % 1.0
            x = 44 + (i * 9) % 30
            y = int(62 - p * 30)
            r = 1 + (i % 2)
            d.ellipse([x - r, y - r, x + r, y + r], outline=(200, 232, 248, 220))
    elif nombre == "plumas":
        for i in range(5):
            p = (t + i / 5.0) % 1.0
            x = 46 + (i * 7) % 22 + int(math.sin(p * 6) * 3)
            y = int(26 + p * 28)
            d.point((x, y), BLANCO)
            d.point((x + 1, y + 1), (214, 214, 210, 255))
    elif nombre == "sudor":
        cae = int((t * 2) % 1.0 * 6)
        x, y = PJ_X + 24, 22 + cae
        d.ellipse([x - 2, y, x + 2, y + 4], fill=AGUA)
        d.polygon([(x - 2, y + 1), (x + 2, y + 1), (x, y - 3)], fill=AGUA)


# ================================================================ globos ====
def globo_emote(capa, tipo, t, x=48, y=6):
    """Bocadillo pequeno, solo cuando el sticker lo pide."""
    if not tipo:
        return
    d = ImageDraw.Draw(capa)
    sub = -int(round(abs(math.sin(t * math.tau)) * 1.5))
    y += sub
    w, h = 22, 20
    d.rounded_rectangle([x - 1, y - 1, x + w + 1, y + h + 1], radius=5, fill=LINEA)
    d.rounded_rectangle([x, y, x + w, y + h], radius=4, fill=HUESO)
    d.polygon([(x + 2, y + h - 1), (x + 9, y + h - 1), (x - 3, y + h + 8)], fill=LINEA)
    d.polygon([(x + 3, y + h - 2), (x + 7, y + h - 2), (x, y + h + 4)], fill=HUESO)
    cx, cy = x + w // 2, y + h // 2
    if tipo == "pregunta":
        d.arc([cx - 5, cy - 7, cx + 5, cy + 2], 150, 20, fill=LINEA, width=2)
        d.line([cx + 4, cy - 2, cx, cy + 2], fill=LINEA, width=2)
        d.rectangle([cx - 1, cy + 5, cx + 1, cy + 7], fill=LINEA)
    elif tipo == "exclamacion":
        d.rectangle([cx - 1, cy - 7, cx + 1, cy + 2], fill=LINEA)
        d.rectangle([cx - 1, cy + 5, cx + 1, cy + 7], fill=LINEA)
    elif tipo == "corazon":
        r = 6
        d.ellipse([cx - r, cy - r + 1, cx, cy + 1], fill=ROJO)
        d.ellipse([cx, cy - r + 1, cx + r, cy + 1], fill=ROJO)
        d.polygon([(cx - r, cy), (cx + r, cy), (cx, cy + r)], fill=ROJO)
    elif tipo == "nota":
        d.ellipse([cx - 5, cy + 1, cx - 1, cy + 5], fill=LINEA)
        d.rectangle([cx - 2, cy - 6, cx - 1, cy + 3], fill=LINEA)
        d.polygon([(cx - 1, cy - 6), (cx + 4, cy - 5), (cx + 4, cy - 2), (cx - 1, cy - 3)],
                  fill=LINEA)
    elif tipo == "enfado":
        c = ROJO if int(t * FRAMES) % 4 < 2 else (140, 46, 44, 255)
        d.line([cx - 5, cy - 3, cx + 5, cy + 3], fill=c, width=2)
        d.line([cx + 5, cy - 3, cx - 5, cy + 3], fill=c, width=2)
        d.line([cx, cy - 6, cx, cy + 6], fill=c, width=2)
        d.line([cx - 6, cy, cx + 6, cy], fill=c, width=2)
    elif tipo == "gota":
        d.ellipse([cx - 3, cy - 1, cx + 3, cy + 5], fill=AGUA)
        d.polygon([(cx - 3, cy + 1), (cx + 3, cy + 1), (cx, cy - 6)], fill=AGUA)
    elif tipo == "ok":
        d.line([cx - 5, cy, cx - 1, cy + 4], fill=VERDE, width=2)
        d.line([cx - 1, cy + 4, cx + 5, cy - 5], fill=VERDE, width=2)
    elif tipo == "no":
        d.line([cx - 5, cy - 5, cx + 5, cy + 5], fill=ROJO, width=2)
        d.line([cx + 5, cy - 5, cx - 5, cy + 5], fill=ROJO, width=2)
    elif tipo == "estrella":
        pts = []
        for i in range(10):
            a = -math.pi / 2 + i * math.pi / 5
            rr = 7 if i % 2 == 0 else 3
            pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
        d.polygon(pts, fill=AMARILLO)


# ============================================================== recorte ====
def recortar(capa):
    a = capa.getchannel("A").point(lambda v: 255 if v > 100 else 0)
    osc = a.filter(ImageFilter.MaxFilter(3))
    bla = osc.filter(ImageFilter.MaxFilter(5))
    out = Image.new("RGBA", capa.size, (0, 0, 0, 0))
    cb = Image.new("RGBA", capa.size, BLANCO)
    cb.putalpha(bla)
    co = Image.new("RGBA", capa.size, LINEA)
    co.putalpha(osc)
    out.alpha_composite(cb)
    out.alpha_composite(co)
    out.alpha_composite(capa)
    return out


# ============================================================ movimiento ====
def meneo(tipo, t):
    """Como se mueve el personaje. Siempre en pixeles enteros."""
    f = t * math.tau
    if tipo == "respira":
        return 0, (-1 if 0.25 < (t % 1.0) < 0.75 else 0)
    if tipo == "salta":
        return 0, -int(round(max(0.0, math.sin(f)) * 7))
    if tipo == "bote":
        return 0, -int(round(abs(math.sin(f)) * 3))
    if tipo == "tiembla":
        i = int(t * FRAMES)
        return (1, 0, -1, 0, 1, -1, 0, 1, -1, 0, 1, -1)[i % 12], (0, -1, 0, 1)[i % 4]
    if tipo == "anda":
        return int(round(math.sin(f) * 5)), 0
    if tipo == "asiente":
        return 0, int(round(max(0.0, math.sin(f * 2)) * 3))
    if tipo == "niega":
        return int(round(math.sin(f * 2) * 3)), 0
    return 0, 0


# ============================================================== montaje ====
def prop(spec, idx):
    """('carpeta', 'nombre', x, y) -> imagen del juego. Sufijos: !2 alterna _1/_2."""
    carpeta, nombre = spec[0], spec[1]
    if carpeta == "animal":
        return animal(nombre, idx, spec[4] if len(spec) > 4 else 2)
    if carpeta == "gallina":
        return gallina(idx)
    if carpeta == "cuervo":
        return cuervo(idx)
    if carpeta == "perro":
        return perro(idx)
    if carpeta == "item":
        return item(*nombre.split(":"))
    if carpeta.endswith("!2"):                 # props con dos fotogramas
        return CARPETAS[carpeta[:-2]]("%s_%d" % (nombre, 1 + (idx // 3) % 2))
    return CARPETAS[carpeta](nombre)


def montar(s, idx):
    t = idx / float(FRAMES)
    capa = Image.new("RGBA", (LADO, LADO), (0, 0, 0, 0))

    # --- peana de terreno real
    if s.get("suelo"):
        pe = peana(s["suelo"])
        capa.alpha_composite(pe, ((LADO - pe.width) // 2, SUELO - 8))

    # --- parcela de cultivo, que crece de verdad recorriendo sus etapas
    cul = s.get("cultivo")
    if cul:
        nombre, e0, e1 = cul
        etapa = e0 + int((t * (e1 - e0 + 1))) if e1 > e0 else e0
        capa.alpha_composite(parcela(nombre, min(etapa, e1)), (27, SUELO - 45))

    for spec in s.get("detras", []):
        capa.alpha_composite(prop(spec, idx), (spec[2], spec[3]))

    # --- animal con sus propios fotogramas
    an = s.get("animal")
    if an:
        img = prop(an, idx)
        ax = an[2] + int(s.get("animal_paso", 0) * math.sin(t * math.tau) * 5)
        ay = an[3] + (int(-abs(math.sin(t * math.tau)) * 4) if s.get("animal_vuela") else 0)
        sombra(capa, ax + img.width // 2, ay + img.height, max(4, img.width // 3))
        capa.alpha_composite(img, (ax, ay))

    # --- el personaje: sprite del juego, sin tocar
    if s.get("pj"):
        nom, direccion, modo = s["pj"]
        if modo == "pesca":
            img = pj_pesca(nom, direccion, int(t * 6))
        elif modo == "anda":
            img = pj(nom, direccion, int(t * 8))
        else:
            img = pj(nom, direccion, 0)
        dx, dy = meneo(s.get("meneo", "respira"), t)
        px = s.get("pj_x", PJ_X) + dx
        py = SUELO - img.height + dy
        sombra(capa, px + img.width // 2, SUELO - 1, 9)
        capa.alpha_composite(img, (px, py))

        # herramienta a la altura de la mano
        her = s.get("util")
        if her:
            hi = util(her[0])
            osc = int(math.sin(t * math.tau * her[3]) * her[4]) if len(her) > 4 else 0
            capa.alpha_composite(hi, (px + her[1], py + her[2] + osc))

    for spec in s.get("delante", []):
        capa.alpha_composite(prop(spec, idx), (spec[2], spec[3]))

    efecto(capa, s.get("efecto"), t, s["sem"], s.get("ef_x", 0), s.get("ef_y", 0))
    efecto(capa, s.get("efecto2"), t, s["sem"] + 9, s.get("ef2_x", 0), s.get("ef2_y", 0))
    globo_emote(capa, s.get("emote"), t, s.get("emote_x", 48), s.get("emote_y", 4))
    return recortar(capa).resize((LADO * ESCALA, LADO * ESCALA), Image.NEAREST)


def guardar(frames, ruta):
    frames[0].save(ruta, save_all=True, append_images=frames[1:], duration=MS,
                   loop=0, disposal=2, blend=0)


# ============================================================== catalogo ====
def A(nombre, cat, **kw):
    d = dict(nombre=nombre, cat=cat, pj=("personaje10", "abajo", "quieto"))
    d.update(kw)
    return d


def PJ(n, d="abajo", m="quieto"):
    return ("personaje%d" % n, d, m)


CATALOGO = [
    # =================================================== la granja (30) ====
    A("sembrar", "granja", pj_x=4, pj=PJ(10, "arriba"), meneo="asiente", suelo="tierra",
      cultivo=("cebolla", 1, 2), util=("pala", 20, 27, 2, 3), efecto="semillas"),
    A("crece_maiz", "granja", pj_x=4, pj=PJ(6), suelo="tierra", cultivo=("maiz", 1, 5),
      efecto="estrellas", emote="estrella"),
    A("crece_col", "granja", pj_x=4, pj=PJ(4), suelo="tierra", cultivo=("col", 1, 5),
      efecto="estrellas"),
    A("crece_girasol", "granja", pj_x=4, pj=PJ(9), suelo="tierra", cultivo=("girasol", 1, 5),
      efecto="estrellas"),
    A("crece_sandia", "granja", pj_x=4, pj=PJ(11), suelo="tierra", cultivo=("sandia", 1, 5),
      efecto="estrellas"),
    A("regar", "granja", pj_x=4, pj=PJ(6, "derecha"), suelo="tierra", cultivo=("lechuga", 3, 5),
      util=("cubo_agua", 22, 27, 1, 2), efecto="agua_chorro"),
    A("segar", "granja", pj_x=4, pj=PJ(4, "derecha"), meneo="tiembla", suelo="tierra",
      cultivo=("maiz", 5, 5), util=("hoz", 22, 27, 2, 4), efecto="polvo"),
    A("cavar", "granja", pj=PJ(12, "derecha"), meneo="tiembla", suelo="tierra",
      util=("pala", 22, 27, 2, 5), efecto="polvo"),
    A("cosecha_col", "granja", pj=PJ(9), meneo="salta", suelo="tierra",
      delante=[("item", "col:item_col_buena", 52, 42)], efecto="estrellas",
      emote="estrella"),
    A("cosecha_maiz", "granja", pj=PJ(8), meneo="salta", suelo="tierra",
      delante=[("item", "maiz:item_maiz_bueno", 52, 40)], efecto="estrellas"),
    A("cosecha_podrida", "granja", pj_x=4, pj=PJ(3), suelo="tierra", cultivo=("maiz", 6, 6),
      emote="gota", efecto="humo"),
    A("abonar", "granja", pj_x=4, pj=PJ(3, "arriba"), meneo="asiente", suelo="tierra",
      delante=[("granja", "saco_abono", 50, 46)], efecto="semillas", cultivo=("patata", 2, 3)),
    A("gallinas", "granja", pj=PJ(5), suelo="hierba", animal=("gallina", "", 48, 40),
      animal_paso=1, efecto="semillas", ef_y=4, efecto2="plumas"),
    A("huevos", "granja", pj=PJ(5), meneo="salta", suelo="hierba",
      delante=[("granja", "huevo", 48, 52), ("granja", "huevo", 58, 54)],
      animal=("gallina", "", 62, 36), emote="estrella"),
    A("vaca", "granja", pj=PJ(6), pj_x=6, suelo="hierba",
      animal=("animal", "vaca_come", 24, 26, 2), efecto="corazones", ef_x=6),
    A("leche", "granja", pj=PJ(6), suelo="hierba",
      delante=[("granja", "jarra_leche", 52, 44)], efecto="vapor", emote="ok"),
    A("cerdo", "granja", pj=PJ(8), pj_x=8, suelo="tierra",
      animal=("animal", "cerdo_come", 32, 38, 2), efecto="polvo"),
    A("lana", "granja", pj=PJ(11), suelo="hierba",
      delante=[("granja", "lana", 52, 46)], efecto="plumas", emote="corazon"),
    A("miel", "granja", pj=PJ(9), suelo="hierba",
      delante=[("granja", "tarro_miel", 52, 44)],
      animal=("animal", "mariposa_azul_vuela", 60, 24, 4), animal_paso=1, animal_vuela=1,
      efecto="estrellas"),
    A("espantar_cuervos", "granja", pj_x=4, pj=PJ(12, "derecha"), meneo="tiembla", suelo="tierra",
      cultivo=("maiz", 5, 5), animal=("cuervo", "", 46, 16), animal_paso=1, animal_vuela=1,
      emote="enfado", efecto="plumas"),
    A("espantapajaros", "granja", pj=PJ(4), suelo="tierra",
      detras=[("granja", "espantapajaros_viento", 50, 8)], efecto="hojas"),
    A("pescar", "granja", pj=("personaje10", "derecha", "pesca"), pj_x=8, suelo="orilla",
      meneo="quieto", efecto="burbujas", ef_x=8),
    A("pesca_picada", "granja", pj=("personaje5", "derecha", "pesca"), pj_x=8, suelo="orilla",
      meneo="tiembla", emote="exclamacion", efecto="burbujas"),
    A("minar", "granja", pj=PJ(13, "derecha"), meneo="tiembla", suelo="piedra",
      util=("martillo", 22, 27, 2, 5), delante=[("recursos", "amatista", 54, 48)],
      efecto="chispas"),
    A("carbon", "granja", pj=PJ(13), suelo="piedra",
      delante=[("recursos", "carbon_vegetal", 52, 48)], efecto="humo", emote="ok"),
    A("lingote", "granja", pj=PJ(12), meneo="salta", suelo="piedra",
      delante=[("recursos", "lingote_acero", 52, 48)], efecto="chispas", emote="estrella"),
    A("hoguera", "granja", pj=PJ(6), suelo="tierra",
      delante=[("objetos!2", "fogata", 48, 40)], efecto="humo", ef_x=2),
    A("cocinar", "granja", pj=PJ(6), suelo="madera" if False else "camino",
      delante=[("objetos!2", "caldero_fuego", 44, 38)], efecto="vapor", ef_x=2),
    A("comida", "granja", pj=PJ(8), meneo="bote", suelo="camino",
      delante=[("comidas", "estofado", 52, 46)], efecto="vapor", emote="corazon"),
    A("mercado", "granja", pj=PJ(4), suelo="camino",
      delante=[("objetos", "cajon", 48, 42), ("objetos", "barril", 64, 38)],
      efecto="monedas", emote="ok"),

    # ================================================== los animales (14) ==
    A("conejo", "animales", pj=PJ(5), suelo="hierba",
      animal=("animal", "conejo_camina", 48, 46, 4), animal_paso=1, efecto="corazones"),
    A("conejo_duerme", "animales", pj=PJ(5), suelo="hierba",
      animal=("animal", "conejo_duerme", 50, 48, 2), efecto="zzz", ef_x=4),
    A("perro", "animales", pj=PJ(10), suelo="hierba", animal=("perro", "", 46, 36),
      animal_paso=1, efecto="corazones"),
    A("zorro", "animales", pj=PJ(7), suelo="otono",
      animal=("animal", "zorro_quieto", 44, 38, 2), efecto="hojas"),
    A("topo", "animales", pj=PJ(8), suelo="tierra",
      animal=("animal", "topo_asoma", 50, 44, 2), efecto="polvo", emote="exclamacion"),
    A("pajaro", "animales", pj=PJ(5), suelo="hierba",
      animal=("animal", "pajaro_vuela", 50, 26, 4), animal_paso=1, animal_vuela=1,
      efecto="notas"),
    A("paloma", "animales", pj=PJ(9), suelo="camino",
      animal=("animal", "paloma_camina", 48, 44, 2), animal_paso=1, efecto="plumas"),
    A("mariposas", "animales", pj=PJ(9), suelo="hierba",
      animal=("animal", "mariposa_monarca_vuela", 50, 24, 4), animal_paso=1,
      animal_vuela=1, efecto="estrellas"),
    A("cuervo", "animales", pj=PJ(12), suelo="tierra", animal=("cuervo", "", 48, 30),
      animal_paso=1, animal_vuela=1, emote="enfado"),
    A("serpiente", "animales", pj=PJ(4), meneo="tiembla", suelo="jungla",
      animal=("animal", "serpiente_verde_repta", 46, 50, 4), animal_paso=1,
      emote="exclamacion"),
    A("cocodrilo", "animales", pj=PJ(8), pj_x=6, meneo="tiembla", suelo="pantano",
      animal=("animal", "cocodrilo_quieto", 30, 40, 2), emote="exclamacion"),
    A("nido", "animales", pj=PJ(5), suelo="hierba",
      delante=[("animal", "nido", 52, 46, 2)], efecto="plumas", emote="corazon"),
    A("zorra_tumbada", "animales", pj=PJ(7), suelo="hierba",
      animal=("animal", "zorra_tumbado", 46, 44, 2), efecto="zzz", ef_x=6),
    A("vaca_pasea", "animales", pj=PJ(11), pj_x=6, suelo="hierba",
      animal=("animal", "vaca_camina", 24, 26, 4), animal_paso=1, efecto="notas"),

    # ================================================== la comunidad (26) ==
    A("hola", "comunidad", pj=PJ(10), meneo="bote", suelo="hierba", emote="estrella",
      efecto="estrellas"),
    A("adios", "comunidad", pj=PJ(5, "arriba"), meneo="anda", suelo="camino",
      efecto="hojas", emote="gota"),
    A("bienvenido", "comunidad", pj=PJ(9), meneo="salta", suelo="hierba",
      efecto="confeti", emote="estrella"),
    A("gg", "comunidad", pj=PJ(4), meneo="salta", suelo="hierba", emote="ok",
      efecto="estrellas"),
    A("ok", "comunidad", pj=PJ(8), meneo="asiente", suelo="hierba", emote="ok"),
    A("no", "comunidad", pj=PJ(12), meneo="niega", suelo="tierra", emote="no"),
    A("pregunta", "comunidad", pj=PJ(11), suelo="camino", emote="pregunta"),
    A("no_entiendo", "comunidad", pj=PJ(3), meneo="niega", suelo="camino",
      emote="pregunta", efecto="sudor"),
    A("idea", "comunidad", pj=PJ(6), meneo="salta", suelo="hierba", emote="estrella",
      efecto="estrellas"),
    A("espera", "comunidad", pj=PJ(3), suelo="camino", emote="gota", efecto="humo"),
    A("afk", "comunidad", pj=PJ(3), suelo="hierba", emote="nota", efecto="zzz"),
    A("dormido", "comunidad", pj=PJ(10), suelo="hierba", efecto="zzz",
      delante=[("objetos", "saco_dormir", 44, 56)]),
    A("ocupado", "comunidad", pj=PJ(6, "derecha"), meneo="tiembla", suelo="camino",
      util=("martillo", 22, 27, 2, 5), efecto="chispas"),
    A("musica", "comunidad", pj=PJ(7), meneo="bote", suelo="camino", efecto="notas",
      emote="nota"),
    A("cafe", "comunidad", pj=PJ(10), suelo="camino",
      delante=[("comidas", "gachas_calientes", 52, 46)], efecto="vapor"),
    A("brindis", "comunidad", pj=PJ(4), meneo="bote", suelo="camino",
      delante=[("pociones", "ambrosia", 52, 44)], efecto="notas", emote="corazon"),
    A("regalo", "comunidad", pj=PJ(9), meneo="salta", suelo="hierba",
      delante=[("objetos", "cajon", 50, 44)], efecto="confeti", emote="corazon"),
    A("ayuda", "comunidad", pj=PJ(8), meneo="tiembla", suelo="tierra",
      emote="exclamacion", efecto="sudor"),
    A("atencion", "comunidad", pj=PJ(12), meneo="bote", suelo="camino",
      emote="exclamacion", efecto="estrellas"),
    A("silencio", "comunidad", pj=PJ(13), suelo="piedra", efecto="humo", emote="no"),
    A("trato", "comunidad", pj=PJ(11), suelo="camino",
      delante=[("recursos", "lingote_plata", 52, 48)], efecto="monedas"),
    A("monedas", "comunidad", pj=PJ(4), meneo="salta", suelo="camino", efecto="monedas",
      emote="estrella"),
    A("llave", "comunidad", pj=PJ(5), suelo="piedra",
      delante=[("utiles", "llave", 52, 48)], efecto="estrellas", emote="ok"),
    A("pocion", "comunidad", pj=PJ(13), suelo="piedra",
      delante=[("pociones", "elixir_estelar", 52, 44)], efecto="burbujas", ef_x=4),
    A("farol", "comunidad", pj=PJ(13), suelo="piedra",
      delante=[("objetos!2", "farol", 56, 18)], efecto="luciernagas"),
    A("leer", "comunidad", pj=PJ(5), suelo="camino",
      delante=[("recursos", "papel", 52, 48)], emote="pregunta"),

    # =================================================== emociones (18) ====
    A("feliz", "emociones", pj=PJ(10), meneo="salta", suelo="hierba", efecto="confeti",
      emote="estrella"),
    A("risa", "emociones", pj=PJ(9), meneo="tiembla", suelo="hierba", efecto="notas",
      emote="nota"),
    A("triste", "emociones", pj=PJ(7, "arriba"), suelo="tierra", efecto="lluvia",
      emote="gota"),
    A("llorar", "emociones", pj=PJ(3), meneo="tiembla", suelo="tierra", efecto="lluvia",
      efecto2="gotas", emote="gota"),
    A("enfado", "emociones", pj=PJ(12), meneo="tiembla", suelo="tierra", emote="enfado",
      efecto="chispas", ef_x=-6, ef_y=-8),
    A("sorpresa", "emociones", pj=PJ(8), meneo="salta", suelo="hierba",
      emote="exclamacion", efecto="polvo"),
    A("amor", "emociones", pj=PJ(9), meneo="bote", suelo="hierba", efecto="corazones",
      emote="corazon"),
    A("timido", "emociones", pj=PJ(5), meneo="tiembla", suelo="hierba",
      efecto="corazones", emote="corazon"),
    A("orgullo", "emociones", pj=PJ(4), meneo="bote", suelo="hierba", efecto="estrellas",
      emote="estrella"),
    A("cansado", "emociones", pj=PJ(6), suelo="tierra", efecto="sudor", emote="gota"),
    A("miedo", "emociones", pj=PJ(5), meneo="tiembla", suelo="pantano",
      animal=("animal", "serpiente_coral_ataque", 48, 50, 2), emote="exclamacion"),
    A("celebrar", "emociones", pj=PJ(10), meneo="salta", suelo="hierba", efecto="confeti",
      efecto2="estrellas"),
    A("victoria", "emociones", pj=PJ(4), meneo="salta", suelo="hierba", efecto="estrellas",
      emote="ok"),
    A("derrota", "emociones", pj=PJ(12), suelo="piedra", efecto="humo", emote="no"),
    A("gracias", "emociones", pj=PJ(6), meneo="asiente", suelo="hierba",
      efecto="corazones", emote="corazon"),
    A("correr", "emociones", pj=("personaje10", "derecha", "anda"), meneo="anda",
      suelo="camino", efecto="velocidad", efecto2="polvo"),
    A("bailar", "emociones", pj=PJ(11), meneo="anda", suelo="camino", efecto="notas",
      emote="nota"),
    A("saltar", "emociones", pj=PJ(9), meneo="salta", suelo="hierba", efecto="polvo",
      emote="estrella"),

    # ================================================== estaciones (12) ====
    A("lluvia", "estaciones", pj=PJ(10), suelo="tierra", efecto="lluvia", emote="gota"),
    A("nieve", "estaciones", pj=PJ(5), meneo="tiembla", suelo="nieve", efecto="nieve"),
    A("otono", "estaciones", pj=PJ(4), suelo="otono", efecto="hojas"),
    A("primavera", "estaciones", pj=PJ(11), suelo="hierba",
      delante=[("naturaleza", "flor_roja", 52, 50), ("naturaleza", "flor_azul", 62, 52)],
      animal=("animal", "mariposa_blanca_vuela", 56, 26, 4), animal_paso=1,
      animal_vuela=1, efecto="estrellas"),
    A("verano", "estaciones", pj=PJ(9), suelo="arena", efecto="vapor", emote="gota"),
    A("noche", "estaciones", pj=PJ(7), suelo="hierba", efecto="luciernagas",
      delante=[("objetos!2", "farol", 58, 16)]),
    A("tormenta", "estaciones", pj=("personaje8", "derecha", "anda"), meneo="anda",
      suelo="tierra", efecto="lluvia", efecto2="velocidad"),
    A("setas", "estaciones", pj=PJ(7), suelo="otono",
      delante=[("naturaleza", "hongo_rojo", 52, 48), ("naturaleza", "hongo_azul", 64, 50)],
      efecto="luciernagas"),
    A("bellotas", "estaciones", pj=PJ(3), suelo="otono",
      delante=[("naturaleza", "bellota", 52, 50)], efecto="hojas"),
    A("volcan", "estaciones", pj=PJ(13), meneo="tiembla", suelo="volcan",
      efecto="chispas", ef_x=-8, emote="exclamacion"),
    A("jungla", "estaciones", pj=PJ(11), suelo="jungla",
      delante=[("naturaleza", "hierba_medicinal", 54, 48)], efecto="luciernagas"),
    A("pantano", "estaciones", pj=PJ(8), suelo="pantano",
      delante=[("naturaleza", "hongo_marron", 54, 48)], efecto="burbujas", ef_x=4),
]


# ================================================================= main ====
def main():
    assert len(CATALOGO) == 100, "el catalogo tiene %d, deben ser 100" % len(CATALOGO)
    os.makedirs(DESTINO, exist_ok=True)
    est = os.path.join(DESTINO, "estaticos")
    os.makedirs(est, exist_ok=True)

    indice, minis, pesados, fallos = [], [], [], []
    for i, s in enumerate(CATALOGO, 1):
        s["sem"] = 400 + i
        b = "%03d_%s" % (i, s["nombre"])
        try:
            frames = [montar(s, f) for f in range(FRAMES)]
        except (IOError, KeyError) as e:
            fallos.append((b, str(e)))
            continue
        ruta = os.path.join(DESTINO, b + ".png")
        guardar(frames, ruta)
        frames[0].save(os.path.join(est, b + ".png"))
        kb = os.path.getsize(ruta) / 1024.0
        if kb > 500:
            pesados.append((b, round(kb, 1)))
        minis.append(frames[0].resize((96, 96), Image.NEAREST))
        indice.append({"id": b, "archivo": b + ".png", "categoria": s["cat"],
                       "personaje": s["pj"][0], "mira": s["pj"][1],
                       "movimiento": s.get("meneo", "respira"), "suelo": s.get("suelo"),
                       "cultivo": s["cultivo"][0] if s.get("cultivo") else None,
                       "herramienta": s["util"][0] if s.get("util") else None,
                       "efecto": s.get("efecto"), "globo": s.get("emote"),
                       "frames": FRAMES, "ms": MS, "kb": round(kb, 1)})
        print("  %-28s %6.1f KB" % (b, kb))

    if minis:
        hoja = Image.new("RGBA", (960, 96 * ((len(minis) + 9) // 10)), (28, 30, 34, 255))
        for n, m in enumerate(minis):
            hoja.paste(m, ((n % 10) * 96, (n // 10) * 96), m)
        hoja.save(os.path.join(DESTINO, "contacto.png"))

    with open(os.path.join(DESTINO, "stickers.json"), "w", encoding="utf-8") as fh:
        json.dump({"total": len(indice), "formato": "APNG 320x320 recortado",
                   "fuente": "sprites del juego sin modificar",
                   "categorias": dict(Counter(x["categoria"] for x in indice)),
                   "stickers": indice}, fh, ensure_ascii=False, indent=2)

    print("\n%d stickers en %s" % (len(indice), DESTINO))
    for b, e in fallos:
        print("   FALLO %-26s %s" % (b, e))
    print("AVISO >500 KB: %s" % pesados if pesados else
          "Todos por debajo del limite de 512 KB de Discord.")


if __name__ == "__main__":
    main()
