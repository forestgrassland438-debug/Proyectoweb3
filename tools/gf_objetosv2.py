#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
GF OBJETOS V2 — el pincel de Game/newpro/objetosv2                (2026-11-02)
=============================================================================

"Quiero una carpeta objetosv2 con animales para montar en 2.5D (nada de 3D),
casas nuevas con otros techos, colores, formas y decoración respetando los
ángulos del juego, árboles, mascotas y personajes, sin defectos gráficos."

LO QUE SE RESPETA (medido en el arte del juego, ver memoria newpro-generado):
  · La luz viene de ARRIBA A LA IZQUIERDA. Nunca un degradado: bandas de color.
  · El contorno NO es negro: es el color del objeto a v≈0.21 (gf_arte).
  · El ángulo de las casas de verdad (`casa de npc arreglado.png`, 183x223): se
    ven desde arriba, así que el TEJADO manda (dos tercios de la altura) y el
    muro de delante es bajo, con su puerta y sus ventanas.
  · Sin motas, sin agujeros y sin racimos de puntos (tripofobia del jugador):
    las texturas son trazos, hiladas y bandas.
  · Determinista: todo se siembra con el SHA-256 del id (gf_arte.rng_de).

CÓMO SE DA VOLUMEN (2.5D, no 3D): cada pieza es una silueta. De la silueta sale
un relieve (distancia al borde), de ahí una normal, y la luz da un tono de una
rampa corta. Es la misma cuenta que gf_relieve, sin motor 3D ni modelos.
=============================================================================
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gf_arte as A  # noqa: E402

LUZ = np.array([-0.55, -0.72, 0.42])
LUZ = LUZ / np.linalg.norm(LUZ)


# ── Colores ──────────────────────────────────────────────────────────────────
def hx(c):
    if isinstance(c, str):
        return A.hex_rgb(c)
    return tuple(int(v) for v in c[:3])


def tonos(base, n=5, arriba=0.30, abajo=0.46):
    """La rampa de un color, de claro a oscuro."""
    return [tuple(int(round(v)) for v in c[:3]) for c in A.rampa(hx(base), n=n, arriba=arriba, abajo=abajo)]


def contorno(base, fuerza=1.0):
    return tuple(int(v) for v in A.contorno_de(hx(base), fuerza)[:3])


def mezcla(a, b, t):
    a, b = hx(a), hx(b)
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


# ── Máscaras (numpy, sin antialias) ──────────────────────────────────────────
class Lamina(object):
    """Un lienzo RGBA en numpy con las primitivas que hacen falta."""

    def __init__(self, w, h):
        self.w, self.h = int(w), int(h)
        self.px = np.zeros((self.h, self.w, 4), dtype=np.uint8)
        self.yy, self.xx = np.mgrid[0:self.h, 0:self.w]

    # máscaras
    def vacia(self):
        return np.zeros((self.h, self.w), dtype=bool)

    def elipse(self, cx, cy, rx, ry, giro=0.0):
        x = self.xx - cx
        y = self.yy - cy
        if giro:
            c, s = math.cos(giro), math.sin(giro)
            x, y = x * c + y * s, -x * s + y * c
        return (x / max(rx, 0.01)) ** 2 + (y / max(ry, 0.01)) ** 2 <= 1.0

    def capsula(self, x0, y0, r0, x1, y1, r1):
        """Un miembro: segmento con el grosor de r0 a r1."""
        dx, dy = x1 - x0, y1 - y0
        L2 = dx * dx + dy * dy or 1e-6
        t = np.clip(((self.xx - x0) * dx + (self.yy - y0) * dy) / L2, 0, 1)
        d = np.hypot(self.xx - (x0 + t * dx), self.yy - (y0 + t * dy))
        return d <= r0 + (r1 - r0) * t

    def poli(self, pts):
        im = Image.new('1', (self.w, self.h), 0)
        ImageDraw.Draw(im).polygon([(float(a), float(b)) for a, b in pts], fill=1)
        return np.array(im, dtype=bool)

    def rect(self, x0, y0, x1, y1):
        m = self.vacia()
        m[max(0, int(y0)):max(0, int(y1)), max(0, int(x0)):max(0, int(x1))] = True
        return m

    def trazo(self, pts, ancho=1):
        im = Image.new('1', (self.w, self.h), 0)
        d = ImageDraw.Draw(im)
        d.line([(float(a), float(b)) for a, b in pts], fill=1, width=int(ancho))
        return np.array(im, dtype=bool)

    # pintar
    def poner(self, m, c, a=255):
        c = hx(c)
        self.px[m] = (c[0], c[1], c[2], a)

    def solo_opaco(self, m, c):
        """Pinta solo donde ya hay dibujo (rayas, vetas, sombras)."""
        self.poner(m & (self.px[..., 3] > 0), c)

    def opaco(self):
        return self.px[..., 3] > 0

    def imagen(self):
        return Image.fromarray(self.px, 'RGBA')

    def recortada(self, margen=0):
        im = self.imagen()
        caja = im.getbbox()
        if not caja:
            return im
        x0, y0, x1, y1 = caja
        return im.crop((max(0, x0 - margen), max(0, y0 - margen), min(self.w, x1 + margen), min(self.h, y1 + margen)))

    def pegar(self, otra, dx=0, dy=0):
        im = otra.imagen() if isinstance(otra, Lamina) else otra
        base = self.imagen()
        base.alpha_composite(im, (int(dx), int(dy)))
        self.px = np.array(base)


def erosiona(m):
    r = m.copy()
    r[1:, :] &= m[:-1, :]
    r[:-1, :] &= m[1:, :]
    r[:, 1:] &= m[:, :-1]
    r[:, :-1] &= m[:, 1:]
    r[0, :] = r[-1, :] = False
    r[:, 0] = r[:, -1] = False
    return r


def dilata(m):
    r = m.copy()
    r[1:, :] |= m[:-1, :]
    r[:-1, :] |= m[1:, :]
    r[:, 1:] |= m[:, :-1]
    r[:, :-1] |= m[:, 1:]
    return r


def borde(m):
    """Los píxeles de la silueta que tocan fuera."""
    return m & ~erosiona(m)


def distancia(m, tope=14):
    """Distancia (aprox.) al borde por capas de erosión; barato y sin bucles por píxel."""
    d = np.zeros(m.shape, dtype=np.float32)
    capa = m.copy()
    for i in range(1, tope + 1):
        if not capa.any():
            break
        d[capa] = i
        capa = erosiona(capa)
    return d


def ruido_suave(w, h, escala, rng):
    """Manchas grandes y suaves (bilineal sobre una rejilla al azar): nada de motas."""
    gw, gh = max(2, int(w / escala) + 2), max(2, int(h / escala) + 2)
    g = np.array([[rng.random() for _ in range(gw)] for _ in range(gh)], dtype=np.float32)
    yy, xx = np.mgrid[0:h, 0:w]
    fx = xx / max(1.0, float(escala))
    fy = yy / max(1.0, float(escala))
    x0 = np.floor(fx).astype(int)
    y0 = np.floor(fy).astype(int)
    tx = fx - x0
    ty = fy - y0
    tx = tx * tx * (3 - 2 * tx)
    ty = ty * ty * (3 - 2 * ty)
    a = g[y0, x0] * (1 - tx) + g[y0, x0 + 1] * tx
    b = g[y0 + 1, x0] * (1 - tx) + g[y0 + 1, x0 + 1] * tx
    return a * (1 - ty) + b * ty


def luz_de(m, radio=8.0, abombado=1.0):
    """De la silueta sale un relieve y de ahí cuánta luz le da a cada píxel (0..1)."""
    d = distancia(m, int(radio) + 2)
    h = np.sqrt(np.minimum(d, radio) / float(radio)) * radio * abombado
    gy, gx = np.gradient(h)
    nx, ny, nz = -gx, -gy, np.ones_like(h)
    L = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.clip((nx * LUZ[0] + ny * LUZ[1] + nz * LUZ[2]) / L, 0, 1)


def volumen(lam, m, rampa, radio=8.0, linea=None, abombado=1.0, extra=None, sesgo=0.0):
    """Pinta una pieza con bulto: bandas de la rampa según la luz; contorno si se pide."""
    if not m.any():
        return
    v = luz_de(m, radio, abombado)
    if extra is not None:
        v = v + extra
    v = v + sesgo
    n = len(rampa)
    # Umbrales alrededor de la luz media: lo iluminado arriba a la izquierda y la media luna abajo.
    idx = np.clip(((0.86 - v) / 0.56 * (n - 1)).round().astype(int), 0, n - 1)
    for i in range(n):
        lam.poner(m & (idx == i), rampa[i])
    if linea is not None:
        lam.poner(borde(m), linea)


def domo(lam, m, cx, cy, rx, ry, rampa, linea=None):
    """Una cúpula: la normal sale de la elipse, no de la distancia al borde. Bandas limpias."""
    nx = (lam.xx - cx) / float(rx)
    ny = (lam.yy - cy) / float(ry)
    nz = np.sqrt(np.clip(1 - nx * nx - ny * ny, 0, 1))
    v = np.clip(nx * LUZ[0] + ny * LUZ[1] + nz * LUZ[2], 0, 1)
    n = len(rampa)
    idx = np.clip(((0.98 - v) / 0.8 * (n - 1)).round().astype(int), 0, n - 1)
    for i in range(n):
        lam.poner(m & (idx == i), rampa[i])
    if linea is not None:
        lam.poner(borde(m), linea)


def contornear(lam, color):
    """El contorno por fuera de todo lo dibujado."""
    o = lam.opaco()
    lam.poner(dilata(o) & ~o, color)


def hoja_contacto(imagenes, columnas=10, escala=2, fondo=(58, 98, 66), sep=6, ancho_celda=None, alto_celda=None):
    w = ancho_celda or max(i.width for i in imagenes)
    h = alto_celda or max(i.height for i in imagenes)
    filas = int(math.ceil(len(imagenes) / float(columnas)))
    hoja = Image.new('RGBA', ((w + sep) * columnas * escala, (h + sep) * filas * escala), fondo + (255,))
    for k, im in enumerate(imagenes):
        x = (k % columnas) * (w + sep) * escala + (w * escala - im.width * escala) // 2
        y = (k // columnas) * (h + sep) * escala + (h * escala - im.height * escala)
        grande = im.resize((im.width * escala, im.height * escala), Image.NEAREST)
        hoja.alpha_composite(grande, (x, y))
    return hoja


# ═══════════════════════════════════════════════════════════════════════════
#  LAS CASAS
# ═══════════════════════════════════════════════════════════════════════════
MUROS = {
    'piedra':   dict(base='#8b8181', tipo='sillar'),
    'ladrillo': dict(base='#a4553f', tipo='ladrillo'),
    'ladrillo_oscuro': dict(base='#6d3d35', tipo='ladrillo'),
    'estuco':   dict(base='#d8cdb4', tipo='liso'),
    'estuco_rosa': dict(base='#d7a79a', tipo='liso'),
    'estuco_azul': dict(base='#9db6c4', tipo='liso'),
    'estuco_verde': dict(base='#a9bd98', tipo='liso'),
    'entramado': dict(base='#e0d6bc', tipo='entramado'),
    'troncos':  dict(base='#7a5335', tipo='troncos'),
    'tablas':   dict(base='#8f6a44', tipo='tablas'),
    'tablas_azul': dict(base='#54707f', tipo='tablas'),
    'tablas_rojo': dict(base='#8c3f36', tipo='tablas'),
    'tablas_verde': dict(base='#4f6b4a', tipo='tablas'),
    'adobe':    dict(base='#c49a6c', tipo='liso'),
    'bambu':    dict(base='#a9a35a', tipo='bambu'),
    'marmol':   dict(base='#d9d9de', tipo='sillar'),
}
TEJADOS = {
    'pizarra_verde': dict(base='#4c6b58', tipo='tejas'),
    'pizarra_morada': dict(base='#5d4a78', tipo='tejas'),
    'teja_roja': dict(base='#a8473a', tipo='tejas'),
    'teja_naranja': dict(base='#c0713a', tipo='tejas'),
    'teja_azul': dict(base='#3f6f9b', tipo='tejas'),
    'teja_turquesa': dict(base='#3f8f8a', tipo='tejas'),
    'teja_rosa': dict(base='#b5697f', tipo='tejas'),
    'negro': dict(base='#3a3a44', tipo='tejas'),
    'paja': dict(base='#c8a14e', tipo='paja'),
    'paja_vieja': dict(base='#8f7a4a', tipo='paja'),
    'madera': dict(base='#7d5a3a', tipo='tablillas'),
    'cobre': dict(base='#5f9c86', tipo='chapa'),
    'zinc': dict(base='#7e8a94', tipo='chapa'),
    'oro': dict(base='#c9a23f', tipo='chapa'),
    'musgo': dict(base='#5f7f42', tipo='paja'),
    'nieve': dict(base='#dfe9f0', tipo='nieve'),
}
VIGAS = ['#633946', '#4a3220', '#2f3a4f', '#3f4a2e', '#7a2f2f', '#2c2c34', '#6b4a22', '#3a5a5a']


def _tejas(lam, m, base, rng, alto=6, ancho=11, sombra=0.0):
    """Hiladas de tejas: cada una con la cabeza clara y el pie oscuro. Bloques desiguales."""
    r = tonos(base, 6, 0.26, 0.44)
    k = max(0, min(3, int(round(sombra))))
    ys = np.where(m.any(axis=1))[0]
    if not len(ys):
        return
    y = int(ys[0])
    fila = 0
    while y <= ys[-1]:
        h = alto + (1 if fila % 3 == 2 else 0)
        x = -int(rng.random() * ancho) - (ancho // 2 if fila % 2 else 0)
        while x < lam.w:
            w = ancho + rng.randint(-2, 2)
            t = lam.rect(x, y, x + w, y + h) & m
            if t.any():
                tono = k + rng.choice([0, 0, 1, 1, 1, 2])
                lam.poner(t, r[min(tono, len(r) - 1)])
                lam.poner(lam.rect(x, y + h - 1, x + w, y + h) & m, r[min(k + 3, len(r) - 1)])
                lam.poner(lam.rect(x + w - 1, y, x + w, y + h) & m, r[min(k + 3, len(r) - 1)])
                lam.poner(lam.rect(x, y, x + w - 1, y + 1) & m, r[max(0, k - 1)] if rng.random() < 0.7 else r[k])
            x += w
        y += h
        fila += 1


def _paja(lam, m, base, rng, sombra=0.0):
    """La paja: mechones verticales de largo desigual, sin rejilla."""
    r = tonos(base, 6, 0.3, 0.46)
    k = max(0, min(3, int(round(sombra))))
    lam.poner(m, r[k + 1])
    ys, xs = np.where(m)
    if not len(ys):
        return
    n = int(m.sum() / 16)
    for _ in range(n):
        i = rng.randrange(len(ys))
        x, y = int(xs[i]), int(ys[i])
        l = rng.randint(5, 13)
        tono = r[min(k + rng.choice([0, 0, 2, 2, 3]), len(r) - 1)]
        lam.poner(lam.rect(x, y, x + 1, y + l) & m, tono)


def _tablillas(lam, m, base, rng, sombra=0.0):
    """Tablillas de madera: tiras verticales por hiladas anchas."""
    _tejas(lam, m, base, rng, alto=9, ancho=7, sombra=sombra)


def _chapa(lam, m, base, rng, sombra=0.0):
    """Chapa con juntas alzadas: bandas verticales lisas."""
    r = tonos(base, 6, 0.26, 0.42)
    k = max(0, min(3, int(round(sombra))))
    lam.poner(m, r[k + 1])
    x = 3
    while x < lam.w:
        lam.poner(lam.rect(x, 0, x + 1, lam.h) & m, r[k])
        lam.poner(lam.rect(x + 1, 0, x + 2, lam.h) & m, r[min(k + 3, len(r) - 1)])
        x += 12


def _nieve(lam, m, base, rng, sombra=0.0):
    r = tonos(base, 5, 0.1, 0.22)
    k = max(0, min(2, int(round(sombra))))
    lam.poner(m, r[k])
    lam.poner(m & (ruido_suave(lam.w, lam.h, 26, rng) > 0.56), r[min(k + 1, 4)])


def faldon(lam, m, cfg, rng, sombra=0.0):
    t, b = cfg['tipo'], cfg['base']
    if t == 'tejas':
        _tejas(lam, m, b, rng, sombra=sombra)
    elif t == 'paja':
        _paja(lam, m, b, rng, sombra=sombra)
    elif t == 'tablillas':
        _tablillas(lam, m, b, rng, sombra=sombra)
    elif t == 'chapa':
        _chapa(lam, m, b, rng, sombra=sombra)
    else:
        _nieve(lam, m, b, rng, sombra=sombra)


def pared(lam, m, cfg, rng, viga):
    t, b = cfg['tipo'], cfg['base']
    r = tonos(b, 5, 0.22, 0.4)
    lam.poner(m, r[1])
    ys, xs = np.where(m)
    if not len(ys):
        return
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
    if t in ('sillar', 'ladrillo'):
        alto = 7 if t == 'sillar' else 4
        y = y0
        fila = 0
        while y < y1:
            x = x0 - (rng.randint(2, 8) if fila % 2 else 0)
            while x < x1:
                w = rng.randint(9, 16) if t == 'sillar' else rng.randint(7, 10)
                pz = lam.rect(x, y, x + w - 1, y + alto - 1) & m
                lam.poner(pz, r[rng.choice([0, 1, 1, 1, 2])])
                lam.poner(lam.rect(x + w - 1, y, x + w, y + alto) & m, r[3])
                x += w
            lam.poner(lam.rect(x0, y + alto - 1, x1, y + alto) & m, r[3])
            y += alto
            fila += 1
    elif t == 'tablas':
        x = x0
        while x < x1:
            w = rng.randint(6, 9)
            lam.poner(lam.rect(x, y0, x + w, y1) & m, r[rng.choice([0, 1, 1, 2])])
            lam.poner(lam.rect(x + w - 1, y0, x + w, y1) & m, r[3])
            x += w
    elif t == 'bambu':
        x = x0
        while x < x1:
            w = rng.randint(4, 5)
            lam.poner(lam.rect(x, y0, x + w, y1) & m, r[rng.choice([0, 1, 1])])
            lam.poner(lam.rect(x + w - 1, y0, x + w, y1) & m, r[3])
            y = y0 + rng.randint(3, 10)
            while y < y1:
                lam.poner(lam.rect(x, y, x + w, y + 1) & m, r[2])
                y += rng.randint(11, 17)
            x += w
    elif t == 'troncos':
        y = y0
        while y < y1:
            h = rng.randint(6, 8)
            lam.poner(lam.rect(x0, y, x1, y + 1) & m, r[0])
            lam.poner(lam.rect(x0, y + 1, x1, y + h - 2) & m, r[1])
            lam.poner(lam.rect(x0, y + h - 2, x1, y + h) & m, r[3])
            y += h
    elif t == 'entramado':
        lam.poner(m, r[0])
        c = tonos(viga, 4, 0.2, 0.4)
        an = max(3, (x1 - x0) // 22)
        for xx in (x0, x1 - an, (x0 + x1) // 2 - an // 2):
            lam.poner(lam.rect(xx, y0, xx + an, y1) & m, c[1])
        medio = (y0 + y1) // 2
        lam.poner(lam.rect(x0, medio, x1, medio + an) & m, c[1])
        lam.poner(lam.trazo([(x0, y1), ((x0 + x1) // 2, medio)], an) & m, c[1])
        lam.poner(lam.trazo([(x1, y1), ((x0 + x1) // 2, medio)], an) & m, c[1])


def ventana(lam, x, y, w, h, viga, rng, redonda=False, postigos=None, jardinera=None, cristal='#507a9a'):
    marco = tonos(viga, 4, 0.22, 0.4)
    crist = tonos(cristal, 4, 0.34, 0.3)
    if redonda:
        cx, cy, r = x + w / 2.0, y + h / 2.0, w / 2.0
        lam.poner(lam.elipse(cx, cy, r + 1.5, r + 1.5), marco[1])
        m = lam.elipse(cx, cy, r - 0.5, r - 0.5)
        lam.poner(m, crist[1])
        lam.poner(m & (lam.xx + lam.yy < x + y + w * 0.8), crist[0])
        lam.poner(lam.rect(cx - 0.5, y, cx + 0.5, y + h) & m, marco[2])
        lam.poner(lam.rect(x, cy - 0.5, x + w, cy + 0.5) & m, marco[2])
        return
    lam.poner(lam.rect(x - 2, y - 2, x + w + 2, y + h + 2), marco[1])
    lam.poner(lam.rect(x - 2, y - 2, x + w + 2, y - 1), marco[0])
    m = lam.rect(x, y, x + w, y + h)
    lam.poner(m, crist[2])
    lam.poner(m & ((lam.xx - x) + (lam.yy - y) < (w + h) * 0.36), crist[0])
    lam.poner(lam.rect(x, y + h - 2, x + w, y + h), crist[3])
    lam.poner(lam.rect(x + w // 2 - 1, y, x + w // 2 + 1, y + h), marco[2])
    lam.poner(lam.rect(x, y + h // 2 - 1, x + w, y + h // 2), marco[2])
    if postigos:
        p = tonos(postigos, 4, 0.2, 0.42)
        for xx in (x - 2 - max(4, w // 3), x + w + 2):
            pw = max(4, w // 3)
            lam.poner(lam.rect(xx, y - 2, xx + pw, y + h + 2), p[1])
            lam.poner(lam.rect(xx, y - 2, xx + 1, y + h + 2), p[0])
            lam.poner(lam.rect(xx + pw - 1, y - 2, xx + pw, y + h + 2), p[3])
            yy = y
            while yy < y + h:
                lam.poner(lam.rect(xx, yy, xx + pw, yy + 1), p[2])
                yy += 4
    if jardinera:
        c = tonos('#6b4a2a', 4, 0.2, 0.4)
        lam.poner(lam.rect(x - 3, y + h + 2, x + w + 3, y + h + 6), c[1])
        lam.poner(lam.rect(x - 3, y + h + 5, x + w + 3, y + h + 6), c[3])
        hoja = tonos('#4f8a3f', 3, 0.2, 0.34)
        flor = tonos(jardinera, 3, 0.26, 0.3)
        lam.poner(lam.rect(x - 3, y + h, x + w + 3, y + h + 2), hoja[1])
        xx = x - 2
        while xx < x + w + 1:
            fw = rng.randint(2, 4)
            lam.poner(lam.rect(xx, y + h - 2, xx + fw, y + h + 1), flor[rng.choice([0, 1])])
            xx += fw + rng.randint(2, 3)


def puerta(lam, cx, base_y, w, h, color, viga, arco=True, doble=False, escalones=True):
    c = tonos(color, 5, 0.22, 0.42)
    marco = tonos(viga, 4, 0.22, 0.4)
    x0, x1 = int(cx - w / 2), int(cx + w / 2)
    y0 = int(base_y - h)
    if arco:
        fuera = lam.rect(x0 - 2, y0 + w // 2, x1 + 2, base_y) | lam.elipse(cx, y0 + w / 2.0, w / 2.0 + 2, w / 2.0 + 2)
        dentro = lam.rect(x0, y0 + w // 2, x1, base_y) | lam.elipse(cx, y0 + w / 2.0, w / 2.0, w / 2.0)
    else:
        fuera = lam.rect(x0 - 2, y0 - 2, x1 + 2, base_y)
        dentro = lam.rect(x0, y0, x1, base_y)
    lam.poner(fuera, marco[1])
    lam.poner(dentro, c[1])
    x = x0
    while x < x1:
        lam.poner(lam.rect(x, y0, x + 1, base_y) & dentro, c[3])
        lam.poner(lam.rect(x + 1, y0, x + 2, base_y) & dentro, c[0])
        x += max(4, w // 4)
    if doble:
        lam.poner(lam.rect(int(cx) - 1, y0, int(cx) + 1, base_y) & dentro, marco[2])
    herr = tonos('#2a2a30', 3, 0.3, 0.2)
    for f in (0.34, 0.72):
        yy = int(y0 + h * f)
        lam.poner(lam.rect(x0, yy, x1, yy + 2) & dentro, herr[1])
    hx_ = int(cx) + (2 if doble else w // 4)
    lam.poner(lam.rect(hx_, int(y0 + h * 0.52), hx_ + 2, int(y0 + h * 0.52) + 2), '#e8c35a')
    if escalones:
        p = tonos('#8f8a80', 4, 0.2, 0.36)
        lam.poner(lam.rect(x0 - 5, base_y, x1 + 5, base_y + 3), p[0])
        lam.poner(lam.rect(x0 - 5, base_y + 3, x1 + 5, base_y + 5), p[2])


def chimenea(lam, x, y, w, h, base='#8b5a4a'):
    r = tonos(base, 5, 0.22, 0.4)
    lam.poner(lam.rect(x, y, x + w, y + h), r[1])
    lam.poner(lam.rect(x, y, x + 2, y + h), r[0])
    lam.poner(lam.rect(x + w - 2, y, x + w, y + h), r[3])
    yy = y + 3
    fila = 0
    while yy < y + h:
        lam.poner(lam.rect(x, yy, x + w, yy + 1), r[2])
        xx = x + (3 if fila % 2 else 6)
        while xx < x + w:
            lam.poner(lam.rect(xx, yy - 3, xx + 1, yy), r[2])
            xx += 6
        yy += 4
        fila += 1
    lam.poner(lam.rect(x - 2, y - 3, x + w + 2, y), r[0])
    lam.poner(lam.rect(x - 2, y - 1, x + w + 2, y), r[3])
    lam.poner(lam.rect(x + 2, y - 5, x + w - 2, y - 3), r[4])


def viga_linea(lam, pts, color, ancho=4):
    """Una viga: el cuerpo, un filo de luz encima y otro de sombra debajo."""
    c = tonos(color, 4, 0.24, 0.42)
    cuerpo = lam.trazo(pts, ancho)
    lam.poner(cuerpo, c[1])
    arriba = cuerpo & ~np.roll(cuerpo, -1, axis=0)
    abajo = cuerpo & ~np.roll(cuerpo, 1, axis=0)
    lam.poner(abajo, c[3])
    lam.poner(arriba, c[0])


def casa_v2(idc, w, h, techo, muro, tejado, viga, decor, rng):
    """Una casa en el ángulo del juego. `techo` decide la forma. w x h a tamaño final."""
    lam = Lamina(w, h)
    cf = TEJADOS[tejado]
    cm = MUROS[muro]
    borde_ = contorno(cf['base'])
    margen = 4
    alto_muro = decor.get('muro', int(h * 0.27))
    suelo = h - 8
    y_muro = suelo - alto_muro
    x0, x1 = margen + decor.get('alero', 6), w - margen - decor.get('alero', 6)
    cx = (x0 + x1) // 2
    ancho = x1 - x0
    vuelo = decor.get('alero', 6)

    # ── EL MURO DE DELANTE (bajo, como en el juego) ──
    m_muro = lam.rect(x0, y_muro, x1, suelo)
    if techo != 'triangulo':
        pared(lam, m_muro, cm, rng, viga)
        # zócalo
        z = tonos(decor.get('zocalo', '#6f6a62'), 4, 0.2, 0.36)
        lam.poner(lam.rect(x0, suelo - 7, x1, suelo), z[1])
        lam.poner(lam.rect(x0, suelo - 7, x1, suelo - 6), z[0])
        lam.poner(lam.rect(x0, suelo - 1, x1, suelo), z[3])
        xx = x0 + 7
        while xx < x1:
            lam.poner(lam.rect(xx, suelo - 6, xx + 1, suelo - 1), z[2])
            xx += rng.randint(8, 13)
        # la sombra del alero sobre el muro
        lam.solo_opaco(lam.rect(x0, y_muro, x1, y_muro + 4) & m_muro, tonos(cm['base'], 5, 0.2, 0.4)[3])
    # esquinas
    if decor.get('esquinas') and techo != 'triangulo':
        ez = tonos(viga, 4, 0.2, 0.4)
        lam.poner(lam.rect(x0, y_muro, x0 + 4, suelo - 7), ez[1])
        lam.poner(lam.rect(x1 - 4, y_muro, x1, suelo - 7), ez[2])

    # ── EL TEJADO ──
    y_tope = decor.get('tope', 10)
    forma = techo
    if forma == 'frente':       # dos aguas con el hastial delante (como la casa de npc)
        cumbre = (cx, y_tope)
        izq = lam.poli([cumbre, (cx, y_muro - decor.get('hastial', 30)), (x0 - vuelo, y_muro + 2), (x0 - vuelo, y_muro - 14)])
        izq = lam.poli([(cx, y_tope), (cx, y_muro - 26), (x0 - vuelo, y_muro + 1), (x0 - vuelo, y_muro - int((y_muro - y_tope) * 0.32))])
        der = lam.poli([(cx, y_tope), (cx, y_muro - 26), (x1 + vuelo, y_muro + 1), (x1 + vuelo, y_muro - int((y_muro - y_tope) * 0.32))])
        faldon(lam, izq, cf, rng, 0)
        faldon(lam, der, cf, rng, 1.4)
        # el hastial: triángulo de pared con vigas
        hast = lam.poli([(cx, y_muro - 26), (x0 - 1, y_muro + 1), (x1 + 1, y_muro + 1)])
        pared(lam, hast, MUROS[decor.get('hastial_muro', 'tablas')], rng, viga)
        lam.solo_opaco(lam.rect(x0, y_muro - 2, x1, y_muro + 1) & hast, tonos(viga, 4, 0.2, 0.4)[2])
        viga_linea(lam, [(cx, y_tope), (cx, y_muro - 26)], viga, 4)
        viga_linea(lam, [(cx, y_muro - 26), (x0 - vuelo, y_muro + 1)], viga, 4)
        viga_linea(lam, [(cx, y_muro - 26), (x1 + vuelo, y_muro + 1)], viga, 4)
        viga_linea(lam, [(cx, y_muro - 26), (cx, y_muro)], viga, 3)
        viga_linea(lam, [(x0 + ancho * 0.22, y_muro), (cx, y_muro - 15)], viga, 3)
        viga_linea(lam, [(x1 - ancho * 0.22, y_muro), (cx, y_muro - 15)], viga, 3)
        viga_linea(lam, [(x0 - vuelo, y_muro + 1), (x1 + vuelo, y_muro + 1)], viga, 3)
        if decor.get('claraboya'):
            ventana(lam, cx + 14, y_tope + 28, 15, 15, viga, rng)
    elif forma == 'lado':      # dos aguas con la cumbrera de lado a lado
        m = lam.poli([(x0 - vuelo + 6, y_tope + 4), (x1 + vuelo - 6, y_tope + 4), (x1 + vuelo, y_muro + 1), (x0 - vuelo, y_muro + 1)])
        faldon(lam, m, cf, rng, 0.4)
        viga_linea(lam, [(x0 - vuelo + 6, y_tope + 4), (x1 + vuelo - 6, y_tope + 4)], viga, 4)
        viga_linea(lam, [(x0 - vuelo + 6, y_tope + 4), (x0 - vuelo, y_muro + 1)], viga, 3)
        viga_linea(lam, [(x1 + vuelo - 6, y_tope + 4), (x1 + vuelo, y_muro + 1)], viga, 3)
        viga_linea(lam, [(x0 - vuelo, y_muro + 1), (x1 + vuelo, y_muro + 1)], viga, 3)
    elif forma == 'cuatro':    # a cuatro aguas: frente en trapecio y dos lados en triángulo
        d = int(ancho * 0.24)
        fr = lam.poli([(x0 - vuelo + d, y_tope + 6), (x1 + vuelo - d, y_tope + 6), (x1 + vuelo, y_muro + 1), (x0 - vuelo, y_muro + 1)])
        li = lam.poli([(x0 - vuelo + d, y_tope + 6), (x0 - vuelo, y_muro + 1), (x0 - vuelo, y_muro - 16)])
        ld = lam.poli([(x1 + vuelo - d, y_tope + 6), (x1 + vuelo, y_muro + 1), (x1 + vuelo, y_muro - 16)])
        faldon(lam, li, cf, rng, 0)
        faldon(lam, ld, cf, rng, 2.2)
        faldon(lam, fr, cf, rng, 0.8)
        viga_linea(lam, [(x0 - vuelo + d, y_tope + 6), (x1 + vuelo - d, y_tope + 6)], viga, 4)
        viga_linea(lam, [(x0 - vuelo + d, y_tope + 6), (x0 - vuelo, y_muro + 1)], viga, 3)
        viga_linea(lam, [(x1 + vuelo - d, y_tope + 6), (x1 + vuelo, y_muro + 1)], viga, 3)
        viga_linea(lam, [(x0 - vuelo, y_muro + 1), (x1 + vuelo, y_muro + 1)], viga, 3)
    elif forma == 'mansarda':  # dos pendientes: arriba casi plana, abajo muy empinada
        d = int(ancho * 0.1)
        rot = y_muro - int((y_muro - y_tope) * 0.5)
        ar = lam.poli([(x0 + d + 6, y_tope + 2), (x1 - d - 6, y_tope + 2), (x1 - d + 4, rot), (x0 + d - 4, rot)])
        ab = lam.poli([(x0 + d - 4, rot), (x1 - d + 4, rot), (x1 + vuelo, y_muro + 1), (x0 - vuelo, y_muro + 1)])
        faldon(lam, ar, cf, rng, 1.6)
        faldon(lam, ab, cf, rng, 0.2)
        viga_linea(lam, [(x0 + d - 4, rot), (x1 - d + 4, rot)], viga, 4)
        viga_linea(lam, [(x0 + d + 6, y_tope + 2), (x1 - d - 6, y_tope + 2)], viga, 3)
        viga_linea(lam, [(x0 - vuelo, y_muro + 1), (x1 + vuelo, y_muro + 1)], viga, 3)
        for k in range(decor.get('buhardillas', 2)):
            bx = x0 + int(ancho * (k + 1) / (decor.get('buhardillas', 2) + 1)) - 8
            by = rot + 6
            ventana(lam, bx, by, 15, 16, viga, rng, redonda=False)
            viga_linea(lam, [(bx - 4, by - 2), (bx + 8, by - 10), (bx + 20, by - 2)], viga, 3)
    elif forma == 'granero':   # granero: gambrel de frente, con su pliegue
        rot = y_muro - int((y_muro - y_tope) * 0.42)
        izq = lam.poli([(cx, y_tope), (cx - ancho * 0.28, y_tope + 10), (x0 - vuelo, rot), (x0 - vuelo, y_muro + 1), (cx, y_muro + 1)])
        der = lam.poli([(cx, y_tope), (cx + ancho * 0.28, y_tope + 10), (x1 + vuelo, rot), (x1 + vuelo, y_muro + 1), (cx, y_muro + 1)])
        faldon(lam, izq, cf, rng, 0)
        faldon(lam, der, cf, rng, 1.4)
        interior = lam.poli([(cx, y_tope + 24), (cx - ancho * 0.26, y_tope + 34), (x0 + 2, rot + 12), (x0 + 2, y_muro + 2), (x1 - 2, y_muro + 2), (x1 - 2, rot + 12), (cx + ancho * 0.26, y_tope + 34)])
        pared(lam, interior, cm, rng, viga)
        for pts in ([(cx, y_tope + 24), (cx - ancho * 0.26, y_tope + 34), (x0 + 2, rot + 12), (x0 + 2, y_muro + 2)],
                    [(cx, y_tope + 24), (cx + ancho * 0.26, y_tope + 34), (x1 - 2, rot + 12), (x1 - 2, y_muro + 2)]):
            viga_linea(lam, pts, viga, 3)
        ventana(lam, cx - 9, rot + 2, 18, 16, viga, rng, redonda=decor.get('redonda', False))
    elif forma == 'pagoda':    # aleros curvados en dos pisos
        pisos = 2
        tope = y_tope + 2
        cuerpo_alto = (y_muro - tope) // pisos
        for p in range(pisos):
            f = (pisos - p) / float(pisos)
            a = int(ancho * (0.56 + 0.44 * (1 - f))) if p else int(ancho * 0.6)
            yt = tope + p * cuerpo_alto
            yb = yt + cuerpo_alto - 8
            xa, xb = cx - a // 2, cx + a // 2
            m = lam.poli([(cx - a * 0.2, yt), (cx + a * 0.2, yt), (xb + vuelo + 5, yb - 2), (xb + vuelo + 9, yb - 7), (xb + vuelo + 7, yb + 4), (xa - vuelo - 7, yb + 4), (xa - vuelo - 9, yb - 7), (xa - vuelo - 5, yb - 2)])
            faldon(lam, m, cf, rng, 0.5)
            viga_linea(lam, [(xa - vuelo - 7, yb + 4), (xb + vuelo + 7, yb + 4)], viga, 3)
            if p < pisos - 1:
                pm = lam.rect(xa + 8, yb + 4, xb - 8, yb + 16)
                pared(lam, pm, cm, rng, viga)
                ventana(lam, cx - 6, yb + 6, 12, 8, viga, rng)
        viga_linea(lam, [(x0 - vuelo, y_muro + 1), (x1 + vuelo, y_muro + 1)], viga, 3)
        punta = tonos('#c9a23f', 3, 0.3, 0.3)
        lam.poner(lam.rect(cx - 1, y_tope - 8, cx + 1, tope + 4), punta[1])
    elif forma == 'plano':     # azotea con pretil (adobe)
        ter = lam.rect(x0 - 2, y_tope + 10, x1 + 2, y_muro + 1)
        pared(lam, ter, MUROS[muro], rng, viga)
        lam.poner(lam.rect(x0 + 8, y_tope + 18, x1 - 8, y_muro - 10), tonos(cf['base'], 5, 0.2, 0.34)[2])
        k = tonos(MUROS[muro]['base'], 5, 0.2, 0.4)
        lam.poner(lam.rect(x0 - 2, y_tope + 10, x1 + 2, y_tope + 15), k[0])
        lam.poner(lam.rect(x0 - 2, y_tope + 14, x1 + 2, y_tope + 16), k[3])
        lam.poner(lam.rect(x0 - 2, y_muro - 4, x1 + 2, y_muro + 1), k[0])
        lam.poner(lam.rect(x0 - 2, y_muro, x1 + 2, y_muro + 1), k[3])
        cy_c = y_tope + 18 + (y_muro - y_tope - 30) * 0.42
        cup = lam.elipse(cx, cy_c, ancho * 0.22, ancho * 0.2)
        domo(lam, cup, cx, cy_c, ancho * 0.22, ancho * 0.2, tonos(cf['base'], 6, 0.34, 0.42), linea=contorno(cf['base']))
    elif forma == 'chapitel':  # torre redonda con cono al lado de un cuerpo a dos aguas
        tx = x1 - int(ancho * 0.22)
        tw = int(ancho * 0.24)
        m = lam.poli([(x0 - vuelo + 6, y_tope + 28), (tx - tw + 2, y_tope + 28), (tx - tw + 2, y_muro + 1), (x0 - vuelo, y_muro + 1)])
        faldon(lam, m, cf, rng, 0.5)
        viga_linea(lam, [(x0 - vuelo + 6, y_tope + 28), (tx - tw + 2, y_tope + 28)], viga, 4)
        viga_linea(lam, [(x0 - vuelo + 6, y_tope + 28), (x0 - vuelo, y_muro + 1)], viga, 3)
        viga_linea(lam, [(x0 - vuelo, y_muro + 1), (tx - tw + 2, y_muro + 1)], viga, 3)
        cuerpo_t = lam.rect(tx - tw, y_tope + 42, tx + tw, suelo)
        pared(lam, cuerpo_t, cm, rng, viga)
        k = tonos(cm['base'], 5, 0.2, 0.4)
        lam.solo_opaco(cuerpo_t & (lam.xx > tx + tw * 0.45), k[3])
        lam.solo_opaco(cuerpo_t & (lam.xx < tx - tw * 0.7), k[0])
        cono = lam.poli([(tx, y_tope - 6), (tx + tw + 6, y_tope + 46), (tx - tw - 6, y_tope + 46)])
        izq_c = cono & (lam.xx <= tx)
        der_c = cono & (lam.xx > tx)
        faldon(lam, izq_c, cf, rng, 0)
        faldon(lam, der_c, cf, rng, 1.6)
        viga_linea(lam, [(tx - tw - 6, y_tope + 46), (tx + tw + 6, y_tope + 46)], viga, 3)
        ventana(lam, tx - 6, y_tope + 56, 13, 13, viga, rng, redonda=True)
        ventana(lam, tx - 9, y_tope + 82, 18, 22, viga, rng)
        z2 = tonos(decor.get('zocalo', '#6f6a62'), 4, 0.2, 0.36)
        lam.poner(lam.rect(tx - tw, suelo - 7, tx + tw, suelo), z2[1])
        x1 = tx - tw               # el resto de lo de delante, en el cuerpo
        cx = (x0 + x1) // 2
        ancho = x1 - x0
    elif forma == 'cupula':    # cúpula sobre un tambor (oriental)
        tam = lam.rect(cx - ancho * 0.36, y_muro - 26, cx + ancho * 0.36, y_muro + 1)
        pared(lam, tam, cm, rng, viga)
        ry_d = (y_muro - 26 - y_tope) * 0.95
        d = lam.elipse(cx, y_muro - 26, ancho * 0.34, ry_d) & (lam.yy <= y_muro - 26)
        domo(lam, d, cx, y_muro - 26, ancho * 0.34, ry_d, tonos(cf['base'], 6, 0.34, 0.42), linea=contorno(cf['base']))
        lam.poner(lam.rect(cx - 1, y_tope - 10, cx + 1, y_tope + 8), tonos('#c9a23f', 3, 0.3, 0.3)[1])
        lam.poner(lam.elipse(cx, y_tope - 10, 3, 3), tonos('#c9a23f', 3, 0.3, 0.3)[0])
        viga_linea(lam, [(cx - ancho * 0.38, y_muro - 26), (cx + ancho * 0.38, y_muro - 26)], viga, 3)
        ter = lam.rect(x0 - 2, y_muro - 3, x1 + 2, y_muro + 1)
        lam.poner(ter, tonos(viga, 4, 0.22, 0.4)[1])
    elif forma == 'triangulo':  # A-frame: el tejado llega casi al suelo
        izq = lam.poli([(cx, y_tope), (cx, suelo), (x0 - vuelo, suelo)])
        der = lam.poli([(cx, y_tope), (cx, suelo), (x1 + vuelo, suelo)])
        faldon(lam, izq, cf, rng, 0)
        faldon(lam, der, cf, rng, 1.6)
        fr = lam.poli([(cx, y_tope + (suelo - y_tope) * 0.42), (cx - ancho * 0.34, suelo), (cx + ancho * 0.34, suelo)])
        pared(lam, fr, cm, rng, viga)
        viga_linea(lam, [(cx, y_tope + (suelo - y_tope) * 0.42), (cx - ancho * 0.34, suelo)], viga, 3)
        viga_linea(lam, [(cx, y_tope + (suelo - y_tope) * 0.42), (cx + ancho * 0.34, suelo)], viga, 3)
        viga_linea(lam, [(cx, y_tope), (cx, y_tope + (suelo - y_tope) * 0.42)], viga, 4)
    else:
        raise ValueError(forma)

    # ── LO DE DELANTE ──
    puerta_w = decor.get('puerta_w', 20)
    puerta_h = min(alto_muro - 8, decor.get('puerta_h', 34))
    px = cx + decor.get('puerta_dx', 0)
    puerta(lam, px, suelo, puerta_w, puerta_h, decor.get('puerta_color', '#7a4a2e'), viga,
           arco=decor.get('arco', True), doble=decor.get('doble', False))
    if forma != 'triangulo':
        vw, vh = decor.get('ventana', (20, 14))
        yv = y_muro + 9
        pw = max(4, vw // 3) + 3 if decor.get('postigos') else 3
        # Lo que cabe a cada lado de la puerta, repartido sin tocar puerta ni esquinas.
        for a0, a1 in ((x0 + 8, px - puerta_w // 2 - 8), (px + puerta_w // 2 + 8, x1 - 8)):
            hueco = a1 - a0
            cuantas = min(2, int(hueco // (vw + 2 * pw + 8)))
            for k_ in range(cuantas):
                vx = a0 + int((k_ + 0.5) * hueco / float(cuantas)) - vw // 2
                ventana(lam, vx, yv, vw, vh, viga, rng, postigos=decor.get('postigos'), jardinera=decor.get('flores'))
    else:
        ventana(lam, cx - 8, y_tope + int((suelo - y_tope) * 0.5), 16, 14, viga, rng, redonda=True)

    # toldo sobre la puerta
    if decor.get('toldo'):
        t = tonos(decor['toldo'], 4, 0.24, 0.38)
        ty = suelo - puerta_h - 7
        tx0, tx1 = px - puerta_w // 2 - 10, px + puerta_w // 2 + 10
        m = lam.poli([(tx0 + 3, ty), (tx1 - 3, ty), (tx1, ty + 8), (tx0, ty + 8)])
        lam.poner(m, t[1])
        xx = tx0
        k = 0
        while xx < tx1:
            lam.poner(lam.rect(xx, ty, xx + 5, ty + 9) & m, t[0] if k % 2 else t[2])
            xx += 5
            k += 1
        lam.poner(lam.rect(tx0, ty + 8, tx1, ty + 10), t[3])
    # letrero colgado
    if decor.get('letrero'):
        s = tonos('#7d5a3a', 4, 0.22, 0.4)
        sx = px + puerta_w // 2 + 8
        sy = y_muro + 6
        lam.poner(lam.rect(sx, sy, sx + 18, sy + 2), tonos(viga, 3, 0.2, 0.3)[1])
        lam.poner(lam.rect(sx + 2, sy + 4, sx + 18, sy + 14), s[1])
        lam.poner(lam.rect(sx + 2, sy + 4, sx + 18, sy + 5), s[0])
        lam.poner(lam.rect(sx + 2, sy + 13, sx + 18, sy + 14), s[3])
        lam.poner(lam.rect(sx + 5, sy + 8, sx + 15, sy + 10), decor['letrero'])
    # farol
    if decor.get('farol'):
        f = tonos('#2a2a30', 3, 0.3, 0.2)
        fx = px - puerta_w // 2 - 7
        fy = suelo - puerta_h + 2
        lam.poner(lam.rect(fx - 1, fy - 2, fx + 2, fy), f[1])
        lam.poner(lam.rect(fx - 2, fy, fx + 3, fy + 7), '#ffd98a')
        lam.poner(lam.rect(fx - 2, fy, fx - 1, fy + 7), f[1])
        lam.poner(lam.rect(fx + 2, fy, fx + 3, fy + 7), f[1])
        lam.poner(lam.rect(fx - 3, fy + 7, fx + 4, fy + 8), f[1])
    # enredadera: trazos de hoja subiendo por una esquina (sin motas)
    if decor.get('hiedra'):
        h_ = tonos('#3f7a3a', 4, 0.24, 0.36)
        lado = x0 + 3 if rng.random() < 0.5 else x1 - 4
        y = suelo - 8
        x = lado
        while y > y_muro + 3:
            nx_ = x + rng.randint(-3, 3)
            ny_ = y - rng.randint(3, 6)
            lam.poner(lam.trazo([(x, y), (nx_, ny_)], 2) & m_muro, h_[rng.choice([0, 1, 2])])
            x, y = nx_, ny_
    # chimenea (encima del tejado)
    if decor.get('chimenea') and forma not in ('cupula', 'plano'):
        # Apoyada en el tejado: su pie cae DENTRO del faldón (si no, flota en el aire).
        cxc = cx + int(ancho * (0.2 if forma in ('frente', 'granero', 'triangulo') else 0.3))
        col = lam.opaco()[:, min(lam.w - 1, cxc + 7)]
        arriba = int(np.argmax(col)) if col.any() else y_tope
        alto_c = decor.get('chim_h', 22)
        chimenea(lam, cxc, arriba + 12 - alto_c, 15, alto_c, decor.get('chim_color', '#8b5a4a'))
    # veleta
    if decor.get('veleta') and forma not in ('cupula', 'pagoda'):
        c = tonos('#2a2a30', 3, 0.3, 0.2)
        lam.poner(lam.rect(cx, 0, cx + 1, y_tope + 2), c[1])
        lam.poner(lam.rect(cx - 5, 3, cx + 7, 4), c[1])
        lam.poner(lam.poli([(cx + 7, 1), (cx + 11, 3), (cx + 7, 6)]), c[1])
    contornear(lam, borde_)
    return lam


# ═══════════════════════════════════════════════════════════════════════════
#  LOS ÁRBOLES
# ═══════════════════════════════════════════════════════════════════════════
COPAS = {
    # medido de Game/Objetos/arbol.png: copa #458134/#25572f/#0e391d, contorno #02110a
    'bosque':  ['#6fae55', '#458134', '#25572f', '#0e391d', '#082816'],
    'oscuro':  ['#4f8a55', '#2f6a44', '#1c4c36', '#0f3428', '#08201a'],
    'lima':    ['#b6d765', '#86b64a', '#5a8c3a', '#37632c', '#1f4120'],
    'menta':   ['#8fd6a8', '#57ad86', '#35846c', '#205f55', '#113a38'],
    'otono':   ['#f2b552', '#d98a33', '#ad5f26', '#7a3d1e', '#4a2416'],
    'arce':    ['#e8664a', '#c43f36', '#90282f', '#5f1a28', '#3a0f1c'],
    'oro':     ['#f4d868', '#dcb23e', '#ae8527', '#7c5c1c', '#4d3812'],
    'cerezo':  ['#fbd2dc', '#f2a7bd', '#d67c9c', '#a8567c', '#6e3558'],
    'lila':    ['#d7b6f0', '#ad86d8', '#8460b4', '#5c4288', '#382858'],
    'escarcha': ['#f2f8fb', '#cfe2ec', '#a4c4d6', '#7699b2', '#4a6a86'],
    'turquesa': ['#7fe0d6', '#3fb8b0', '#268a8c', '#17616a', '#0d3c48'],
    'magenta': ['#f08ac0', '#cf5a9e', '#a03c82', '#6e2862', '#431840'],
}
TRONCOS = {
    'marron': ['#a8784a', '#8a5c37', '#674529', '#3a2516', '#1e120a'],
    'oscuro': ['#6e5240', '#54392a', '#3d2a20', '#261a14', '#120c08'],
    'gris':   ['#a79c90', '#857b70', '#655c54', '#443d38', '#231f1c'],
    'blanco': ['#f2efe6', '#d9d4c6', '#b3ad9e', '#7c7668', '#3c3830'],
    'rojizo': ['#b0684a', '#8f4e38', '#6b3828', '#44221a', '#22100c'],
    'palma':  ['#b89a6a', '#957a50', '#70593a', '#4a3a26', '#241c12'],
}


def _copa(lam, discos, cols, rng, ruido=0.22, escala=22):
    """Copa de bultos: un campo de alturas (esferas) y la luz sobre él, con manchas grandes."""
    z = np.full((lam.h, lam.w), -1e6, dtype=np.float32)
    for (cx, cy, rx, ry) in discos:
        d = 1 - ((lam.xx - cx) / float(rx)) ** 2 - ((lam.yy - cy) / float(ry)) ** 2
        h = np.where(d > 0, np.sqrt(np.clip(d, 0, 1)) * min(rx, ry), -1e6)
        z = np.maximum(z, h)
    m = z > -1e5
    if not m.any():
        return m
    zs = np.where(m, z, 0)
    gy, gx = np.gradient(zs)
    nz = np.ones_like(zs)
    L = np.sqrt(gx * gx + gy * gy + nz * nz)
    v = (-gx * LUZ[0] - gy * LUZ[1] + nz * LUZ[2]) / L
    # arriba más claro que abajo, en conjunto
    ys = np.where(m)[0]
    alto = max(1, ys.max() - ys.min())
    v = v + 0.20 * (1 - (lam.yy - ys.min()) / float(alto)) - 0.1
    v = v + (ruido_suave(lam.w, lam.h, escala, rng) - 0.5) * ruido * 2
    v = v + (ruido_suave(lam.w, lam.h, max(5, escala // 3), rng) - 0.5) * ruido
    n = len(cols) - 1
    idx = np.clip(((0.92 - v) / 0.72 * (n - 1)).round().astype(int), 0, n - 1)
    r = [hx(c) for c in cols]
    for i in range(n):
        lam.poner(m & (idx == i), r[i])
    lam.poner(borde(m), r[n])
    return m


def _tronco(lam, x, y0, y1, r0, r1, cols, inclina=0.0, raices=True, rng=None):
    """Un tronco con su veta: de abajo (y0, ancho r0) a arriba (y1, ancho r1)."""
    r = [hx(c) for c in cols]
    m = lam.capsula(x, y0, r0, x + inclina, y1, r1)
    if raices and rng:
        for sg in (-1, 1):
            m |= lam.capsula(x + sg * r0 * 0.6, y0 - 3, r0 * 0.45, x + sg * (r0 + rng.randint(3, 6)), y0 + 1, 1.2)
    m &= lam.yy <= y0 + 3
    volumen(lam, m, r[:4], radio=max(3.0, r0), linea=r[4])
    if rng:
        for _ in range(int((y0 - y1) / 7)):
            yy = rng.randint(int(y1), int(y0))
            xx = x + (inclina * (y0 - yy) / max(1.0, float(y0 - y1))) + rng.uniform(-r0 * 0.5, r0 * 0.5)
            lam.poner(lam.trazo([(xx, yy), (xx + rng.uniform(-1, 1), yy + rng.randint(3, 7))], 1) & m & ~borde(m), r[2])
    return m


def _rama(lam, x0, y0, x1, y1, a0, a1, cols):
    r = [hx(c) for c in cols]
    m = lam.capsula(x0, y0, a0, x1, y1, a1)
    volumen(lam, m, r[:4], radio=max(2.0, a0), linea=r[4])


def arbol_v2(especie, copa, tronco, w, h, rng, nieve=False):
    lam = Lamina(w, h)
    cx = w / 2.0
    pie = h - 3
    C = COPAS[copa]
    T = TRONCOS[tronco]
    e = especie
    if e in ('redondo', 'ovalado', 'grande'):
        alto_t = h * (0.36 if e != 'ovalado' else 0.3)
        _tronco(lam, cx, pie, pie - alto_t * 1.3, w * 0.075, w * 0.05, T, inclina=rng.uniform(-3, 3), rng=rng)
        for sg in (-1, 1):
            _rama(lam, cx, pie - alto_t * 0.8, cx + sg * w * 0.22, pie - alto_t * 1.35, 2.6, 1.2, T)
        cy = (pie - alto_t) * 0.54
        rx, ry = w * 0.46, (pie - alto_t) * 0.52
        if e == 'ovalado':
            rx *= 0.78
        discos = [(cx, cy, rx * 0.72, ry * 0.76)]
        n = rng.randint(9, 13)
        for i in range(n):
            a = i / float(n) * math.pi * 2 + rng.uniform(-0.2, 0.2)
            r_ = rng.uniform(0.2, 0.3) * rx + rx * 0.08
            discos.append((cx + math.cos(a) * (rx - r_), cy + math.sin(a) * (ry - r_) * 0.95, r_, r_ * rng.uniform(0.8, 1.05)))
        _copa(lam, discos, C, rng, escala=int(w * 0.24))
    elif e == 'sombrilla':
        alto_t = h * 0.58
        _tronco(lam, cx, pie, pie - alto_t, w * 0.05, w * 0.03, T, inclina=rng.uniform(-5, 5), rng=rng)
        for sg, dy, l in ((-1, 0.72, 0.34), (1, 0.8, 0.36), (-1, 0.98, 0.2), (1, 1.02, 0.18)):
            _rama(lam, cx, pie - alto_t * dy, cx + sg * w * l, pie - alto_t * 1.08, 2.2, 1.0, T)
        cy = pie - alto_t * 1.2
        rx, ry = w * 0.48, h * 0.17
        discos = [(cx + rng.uniform(-rx * 0.6, rx * 0.6), cy + rng.uniform(-ry * 0.3, ry * 0.3), rx * rng.uniform(0.3, 0.42), ry * rng.uniform(0.7, 1.0)) for _ in range(9)]
        discos += [(cx, cy, rx * 0.7, ry * 0.86)]
        _copa(lam, discos, C, rng, escala=int(w * 0.2))
    elif e == 'lloron':
        alto_t = h * 0.44
        _tronco(lam, cx, pie, pie - alto_t * 1.3, w * 0.075, w * 0.05, T, inclina=rng.uniform(-3, 3), rng=rng)
        cy = h * 0.32
        rx, ry = w * 0.45, h * 0.28
        discos = [(cx, cy, rx * 0.76, ry * 0.8)]
        for i in range(9):
            a = math.pi + i / 8.0 * math.pi
            discos.append((cx + math.cos(a) * rx * 0.72, cy + math.sin(a) * ry * 0.7, rx * 0.3, ry * 0.42))
        m = _copa(lam, discos, C, rng, escala=int(w * 0.2))
        # Las cortinas: trazos largos que cuelgan, nunca puntos.
        r = [hx(c) for c in C]
        x = cx - rx
        while x < cx + rx:
            col = m[:, min(w - 1, max(0, int(x)))]
            if col.any():
                y_ini = np.where(col)[0][-1] - rng.randint(4, 12)
                largo = rng.randint(int(h * 0.16), int(h * 0.38))
                pts = [(x, y_ini), (x + rng.uniform(-1.5, 1.5), y_ini + largo)]
                ancho = rng.choice([2, 2, 3])
                t = lam.trazo(pts, ancho)
                lam.poner(dilata(t) & ~lam.opaco(), r[4])
                lam.poner(t, r[rng.choice([0, 1, 1, 2, 2, 3])])
            x += rng.uniform(3.5, 6)
    elif e in ('pino', 'abeto', 'nevado'):
        pisos = {'pino': 3, 'abeto': 4, 'nevado': 4}[e]
        alto_t = h * 0.16
        _tronco(lam, cx, pie, pie - alto_t * 1.6, w * 0.075, w * 0.06, T, raices=True, rng=rng)
        base = pie - alto_t
        cima = 3
        paso = (base - cima) / float(pisos) * 1.28
        r = [hx(c) for c in C]
        for p in range(pisos):
            f = 1 - p / float(pisos) * 0.72
            ya = base - paso - p * paso * 0.72
            yb = ya + paso
            rx = w * 0.48 * f
            tri = lam.poli([(cx, ya), (cx + rx, yb - 3), (cx + rx * 0.72, yb + 1), (cx + rx * 0.3, yb - 2), (cx, yb + 2), (cx - rx * 0.3, yb - 2), (cx - rx * 0.72, yb + 1), (cx - rx, yb - 3)])
            v = (0.62 - (lam.xx - cx) / (rx * 2.0) - 0.1 + (ruido_suave(w, h, 20, rng) - 0.5) * 0.18) - (lam.yy - ya) / (yb - ya) * 0.3
            idx = np.clip(((0.84 - v) / 0.6 * 3).round().astype(int), 0, 3)
            for i in range(4):
                lam.poner(tri & (idx == i), r[i])
            lam.poner(borde(tri), r[4])
            if nieve or e == 'nevado':
                nv = tri & (lam.yy < ya + (yb - ya) * (0.42 + 0.16 * ruido_suave(w, h, 9, rng)))
                lam.poner(nv, '#eef5fa')
                lam.poner(nv & (lam.xx > cx + rx * 0.12), '#cfdee9')
                lam.poner(borde(tri) & nv, r[4])
    elif e == 'cipres':
        alto_t = h * 0.08
        _tronco(lam, cx, pie, pie - alto_t * 1.6, w * 0.1, w * 0.08, T, raices=False, rng=rng)
        f = A.perfil([(0, 0.05), (0.24, 0.7), (0.5, 1.0), (0.8, 0.92), (1, 0.58)])
        y0, y1 = 3, pie - alto_t
        mitad = w * 0.44
        pts_i, pts_d = [], []
        for k in range(26):
            t = k / 25.0
            y = y0 + (y1 - y0) * t
            a = f(t) * mitad
            pts_i.append((cx - a, y))
            pts_d.append((cx + a, y))
        m = lam.poli(pts_i + pts_d[::-1])
        r = [hx(c) for c in C]
        v = 0.62 - (lam.xx - cx) / (mitad * 1.7) + (ruido_suave(w, h, 16, rng) - 0.5) * 0.16
        idx = np.clip(((0.84 - v) / 0.6 * 3).round().astype(int), 0, 3)
        for i in range(4):
            lam.poner(m & (idx == i), r[i])
        lam.poner(borde(m), r[4])
    elif e == 'palmera':
        r = [hx(c) for c in T]
        incl = rng.choice([-1, 1]) * rng.uniform(8, 16)
        n = 22
        puntos = []
        for k in range(n + 1):
            t = k / float(n)
            puntos.append((cx + incl * t * t, pie - (pie - h * 0.28) * t))
        m = lam.vacia()
        for k in range(n):
            ra = w * 0.055 * (1 - k / float(n) * 0.4)
            m |= lam.capsula(puntos[k][0], puntos[k][1], ra, puntos[k + 1][0], puntos[k + 1][1], ra)
        volumen(lam, m, r[:4], radio=4, linea=r[4])
        for k in range(1, n, 2):
            lam.poner(lam.trazo([(puntos[k][0] - 6, puntos[k][1]), (puntos[k][0] + 6, puntos[k][1])], 1) & m, r[3])
        cabo = puntos[-1]
        c = [hx(q) for q in C]
        # Las hojas: suben, se arquean y cuelgan. Cada una con su nervio y su fleco de trazos.
        for i in range(-4, 5):
            d = i / 4.0
            largo = w * rng.uniform(0.4, 0.48)
            med = (cabo[0] + d * largo * 0.55, cabo[1] - 5 - (1 - abs(d)) * 12)
            tips = (cabo[0] + d * largo, cabo[1] + 4 + abs(d) * 16 + rng.uniform(0, 5))
            if i == 0:
                tips = (cabo[0] + rng.uniform(-4, 4), cabo[1] - 22)
                med = (cabo[0], cabo[1] - 12)
            f1 = lam.capsula(cabo[0], cabo[1], 2.2, med[0], med[1], 3.4) | lam.capsula(med[0], med[1], 3.4, tips[0], tips[1], 0.7)
            f1 &= ~lam.opaco() | True
            lam.poner(dilata(f1) & ~lam.opaco(), c[4])
            lam.poner(f1, c[rng.choice([1, 1, 2])])
            lam.poner(lam.trazo([cabo, med, tips], 1) & f1, c[0])
            for q in range(1, 7):
                tq = q / 7.0
                bx = med[0] + (tips[0] - med[0]) * tq
                by = med[1] + (tips[1] - med[1]) * tq
                lam.poner(lam.trazo([(bx, by), (bx + d * 2.0, by + 5 - tq * 2)], 1) & ~lam.opaco(), c[2])
    elif e == 'baobab':
        ancho_t = w * 0.2
        m = lam.capsula(cx, pie - 8, ancho_t, cx, h * 0.42, ancho_t * 0.74)
        m |= lam.elipse(cx, pie - 10, ancho_t * 1.14, 12)
        m &= lam.yy <= pie + 3
        volumen(lam, m, [hx(c) for c in T[:4]], radio=ancho_t * 0.8, linea=hx(T[4]))
        for x_ in (-0.5, 0, 0.45):
            lam.poner(lam.trazo([(cx + ancho_t * x_, pie - 2), (cx + ancho_t * x_ * 0.8, h * 0.5)], 1) & m & ~borde(m), hx(T[2]))
        discos = []
        for sg, xx, yy, l in ((-1, 0.36, 0.3, 0.2), (1, 0.38, 0.28, 0.2), (0, 0, 0.2, 0.2), (-1, 0.18, 0.2, 0.17), (1, 0.2, 0.2, 0.17)):
            _rama(lam, cx + sg * ancho_t * 0.4, h * 0.46, cx + sg * w * xx, h * yy, 3.4, 1.4, T)
            discos.append((cx + sg * w * xx, h * yy - h * 0.03, w * l, h * 0.09))
        _copa(lam, discos, C, rng, escala=int(w * 0.2))
    elif e == 'abedul':
        alto_t = h * 0.5
        r = [hx(c) for c in TRONCOS['blanco']]
        m = _tronco(lam, cx, pie, pie - alto_t * 1.25, w * 0.055, w * 0.035, TRONCOS['blanco'], rng=None, raices=False)
        y = pie - 8
        while y > pie - alto_t * 1.25:
            ax = rng.randint(4, 9)
            sx = rng.choice([-1, 1])
            lam.poner(lam.trazo([(cx + sx * ax * 0.5 - 1, y), (cx + sx * ax * 0.5 + 2, y)], 2) & m, r[3])
            y -= rng.randint(8, 14)
        cy = (pie - alto_t) * 0.56
        rx, ry = w * 0.4, (pie - alto_t) * 0.54
        discos = [(cx, cy, rx * 0.8, ry * 0.8)]
        for i in range(10):
            a = i / 10.0 * math.pi * 2
            discos.append((cx + math.cos(a) * rx * 0.68, cy + math.sin(a) * ry * 0.72, rx * 0.34, ry * 0.3))
        _copa(lam, discos, C, rng, escala=int(w * 0.2))
    elif e == 'seco':
        r = [hx(c) for c in T]
        _tronco(lam, cx, pie, pie - h * 0.42, w * 0.075, w * 0.05, T, inclina=rng.uniform(-5, 5), rng=rng)

        def rama(x, y, ang, largo, grosor, nivel):
            x2, y2 = x + math.cos(ang) * largo, y + math.sin(ang) * largo
            if x2 < 2 or x2 > w - 2 or y2 < 2:
                return
            m = lam.capsula(x, y, grosor, x2, y2, max(0.6, grosor * 0.62))
            lam.poner(m, r[1])
            lam.poner(borde(m), r[4])
            if nivel:
                for d in (-rng.uniform(0.3, 0.7), rng.uniform(0.3, 0.7)):
                    rama(x2, y2, ang + d, largo * rng.uniform(0.62, 0.8), max(0.6, grosor * 0.62), nivel - 1)
        for a in (-math.pi / 2 - 0.55, -math.pi / 2, -math.pi / 2 + 0.6):
            rama(cx, pie - h * 0.4, a, h * 0.2, w * 0.035, 3)
    else:
        raise ValueError(e)
    return lam


# ═══════════════════════════════════════════════════════════════════════════
#  LOS ANIMALES: MONTURAS Y MASCOTAS (2.5D: siluetas con relieve, sin 3D)
# ═══════════════════════════════════════════════════════════════════════════
# Una especie es un puñado de medidas. Lo que hace que no parezcan clones no es el color: son el
# largo del cuerpo, de las patas y del cuello, la cabeza, las orejas y lo que llevan encima.
ESPECIES = {
    #                 largo alto  pata  grosor cuello     morro      orejas    cola     extra
    'horse':   dict(l=21, a=10.5, p=17, g=2.7, cu=(13, 13), mo=(9, 3.4), o='punta', c='larga', crin=True),
    'pony':    dict(l=17, a=10, p=12, g=2.8, cu=(10, 10), mo=(7, 3.4), o='punta', c='larga', crin=True, crin_gorda=True),
    'donkey':  dict(l=18, a=10, p=14, g=2.5, cu=(10, 10), mo=(8, 3.6), o='larga', c='borla'),
    'zebra':   dict(l=20, a=10.5, p=16, g=2.6, cu=(12, 12), mo=(8.5, 3.3), o='punta', c='borla', crin=True, rayas='anchas'),
    'camel':   dict(l=21, a=10, p=20, g=2.3, cu=(15, 16), mo=(7, 3), o='chica', c='borla', joroba=True),
    'llama':   dict(l=16, a=9, p=17, g=2.2, cu=(9, 20), mo=(6, 2.8), o='larga', c='corta', lana=True),
    'reindeer': dict(l=19, a=10, p=16, g=2.3, cu=(12, 13), mo=(7, 3), o='punta', c='corta', cuerno='astas'),
    'elk':     dict(l=22, a=11.5, p=18, g=2.8, cu=(13, 14), mo=(8, 3.4), o='punta', c='corta', cuerno='astas_grandes', collar=True),
    'ox':      dict(l=22, a=13, p=13, g=3.5, cu=(9, 5), mo=(6, 4.6), o='chica', c='borla', cuerno='curvo'),
    'yak':     dict(l=21, a=13, p=11, g=3.2, cu=(8, 5), mo=(6, 4.2), o='chica', c='borla', cuerno='curvo', lana=True, faldon=True),
    'boar':    dict(l=19, a=11, p=9, g=3, cu=(7, 3), mo=(8, 4), o='chica', c='corta', colmillo=True, crin=True),
    'ram':     dict(l=18, a=11.5, p=11, g=2.6, cu=(8, 8), mo=(5.5, 3), o='chica', c='corta', cuerno='espiral', lana=True),
    'wolf':    dict(l=20, a=8.5, p=14, g=2.4, cu=(11, 9), mo=(8, 2.8), o='punta', c='peluda', canino=True),
    'bear':    dict(l=21, a=13, p=11, g=4, cu=(8, 6), mo=(6, 4), o='redonda', c='corta', recio=True),
    'lion':    dict(l=21, a=10, p=13, g=3.2, cu=(9, 7), mo=(6, 4), o='redonda', c='borla', felino=True, melena=True),
    'tiger':   dict(l=22, a=9.5, p=13, g=3.2, cu=(9, 6), mo=(5.5, 3.8), o='redonda', c='felina', felino=True, rayas='finas'),
    'panther': dict(l=22, a=8.5, p=13, g=2.8, cu=(9, 6), mo=(5, 3.4), o='redonda', c='felina', felino=True),
    'rhino':   dict(l=23, a=13, p=10, g=4.2, cu=(7, 3), mo=(10, 5), o='chica', c='corta', cuerno='nariz', recio=True),
    'ostrich': dict(ave=True, l=14, a=11, p=24, g=1.5, cu=(6, 24), mo=(5, 1.8), c='plumas'),
    'raptor':  dict(raptor=True, l=17, a=8, p=19, g=2.4, cu=(13, 9), mo=(9, 3.2), c='reptil'),
}
PELAJES = {
    'horse': [('Chestnut', '#8a5230', '#2a1a12'), ('Black', '#3a3238', '#141014'), ('White', '#e6e2d8', '#c4bdb0'), ('Palomino', '#d4a657', '#f0e4c0'), ('Dapple Grey', '#8b8d94', '#3e4046')],
    'pony': [('Bay', '#9a6238', '#231610'), ('Cream', '#e4d2a6', '#a8876a'), ('Blue Roan', '#6a7388', '#272a36'), ('Rose', '#d7a3a3', '#8c4f5e'), ('Sooty', '#574a48', '#c9c1b4')],
    'donkey': [('Grey', '#8e8678', '#3a3430'), ('Brown', '#7a5a42', '#2e221a'), ('Silver', '#b4b2ac', '#5c5a56'), ('Dusty', '#a58f70', '#5a4a38'), ('Dark', '#544a44', '#1e1a18')],
    'zebra': [('Plains', '#ebe8df', '#26242a'), ('Mountain', '#d9d2bf', '#3a2e2a'), ('Golden', '#ead08a', '#5a3a1a'), ('Azure', '#cfe0ea', '#23465f'), ('Crimson', '#ecd9d2', '#6e2230')],
    'camel': [('Desert', '#c9a26a', '#6a4a2a'), ('Dune', '#dcc08c', '#8a6a40'), ('Mocha', '#8f6a4a', '#3e2a1c'), ('Pale', '#e8dcc0', '#9c8a64'), ('Rust', '#a8623a', '#4a2614')],
    'llama': [('Cream', '#ece2cc', '#a88a6a'), ('Cocoa', '#7a5540', '#30201a'), ('Spotless Grey', '#a9a6a0', '#55524e'), ('Rose', '#dcb0a4', '#8a5048'), ('Ebony', '#403a3c', '#191618')],
    'reindeer': [('Northern', '#8a6a4c', '#e4dcc8'), ('Snow', '#e6e6e0', '#b0aca0'), ('Bark', '#5e4634', '#c4b090'), ('Frost', '#b6c6d0', '#6a7c8c'), ('Ember', '#a65a3a', '#e8cfa8')],
    'elk': [('Bull', '#7a5a3e', '#3a2618'), ('Pale', '#c0a27c', '#6a4e36'), ('Dark', '#4e3a2c', '#1e140e'), ('Silver', '#a4a29c', '#4e4c48'), ('Royal', '#6a3e3e', '#26120f')],
    'ox': [('Field', '#7a4e30', '#2a1a10'), ('White', '#e2dccd', '#a8a08c'), ('Black', '#3a3234', '#141012'), ('Red', '#9a4c32', '#3e1a10'), ('Dun', '#b09468', '#584630')],
    'yak': [('Mountain', '#4a3c34', '#17120e'), ('Snow', '#e6e4dc', '#aeaaa0'), ('Rust', '#8a5234', '#34190e'), ('Slate', '#65686e', '#26282c'), ('Honey', '#b58c52', '#5c4426')],
    'boar': [('Wild', '#6a5444', '#231a14'), ('Bristle', '#4a3e38', '#17120f'), ('Ginger', '#a0693e', '#3e2412'), ('Ash', '#8a8880', '#3e3c38'), ('Night', '#3c3a44', '#121116')],
    'ram': [('Wool', '#ece6d6', '#a89e88'), ('Black', '#3c3638', '#d8d0bc'), ('Honey', '#d2a868', '#6a4c26'), ('Blue', '#a6b6c8', '#4a5c70'), ('Rust', '#a2623e', '#44240f')],
    'wolf': [('Timber', '#7c7468', '#d8d0c0'), ('Arctic', '#e6e8ea', '#a8b0b8'), ('Black', '#35343a', '#7c7a84'), ('Red', '#a2603c', '#e4cfa8'), ('Storm', '#59616e', '#b6bec8')],
    'bear': [('Brown', '#6e4a30', '#2a1a10'), ('Polar', '#ece9e0', '#b2aea2'), ('Black', '#2e2c30', '#a68e6a'), ('Cinnamon', '#a2643a', '#40240f'), ('Moon', '#5a5a64', '#e4e2da')],
    'lion': [('Savanna', '#d2a55e', '#6a3e1a'), ('White', '#ece6d2', '#c4b28c'), ('Dusk', '#b0703e', '#2e1c12'), ('Ash', '#a8a294', '#3e3a34'), ('Royal', '#e0b84a', '#8a2e1e')],
    'tiger': [('Bengal', '#d98a3a', '#231810'), ('White', '#ece6da', '#2c2a32'), ('Golden', '#e6c264', '#7a4a1e'), ('Blue', '#7c8ea8', '#1c2436'), ('Red', '#b84a32', '#1e1014')],
    'panther': [('Night', '#2e2c36', '#6a5f8a'), ('Cougar', '#b08a60', '#e8d8b8'), ('Grey', '#6e6e78', '#b6b6c0'), ('Violet', '#4a3a68', '#a48cd0'), ('Teal', '#2f5a60', '#7cc8c0')],
    'rhino': [('Stone', '#878680', '#4a4a46'), ('Dark', '#55534f', '#26241f'), ('Clay', '#a68a6c', '#5a4632'), ('Iron', '#5f6a78', '#2a313c'), ('Moss', '#6f7a58', '#333a24')],
    'ostrich': [('Black', '#34323a', '#e8e0d0'), ('Sand', '#b89a6a', '#f0e4c8'), ('Blue', '#5a7a9c', '#e8eef2'), ('Rose', '#c07a8a', '#f4dde0'), ('Emerald', '#3e7a5e', '#dcebd8')],
    'raptor': [('Jungle', '#4f7a42', '#d8d29a'), ('Desert', '#b08a50', '#ecdcae'), ('Night', '#3e3f58', '#b4b6d8'), ('Crimson', '#9a3e36', '#ecc8a8'), ('Teal', '#2e7a7a', '#c8ece0')],
}
MANTAS = ['#8c2f39', '#2f5d8c', '#3f7a4a', '#7a4a8c', '#c98a2b', '#2a2a30', '#b85a2a', '#2c7a7a']


def _cuadrupedo_lado(lam, sp, coat, marca, manta, fase, cx=None, base=None, silla=True, escala=1.0):
    """De lado, mirando a la derecha. fase 0..1 del paso."""
    w, h = lam.w, lam.h
    S = dict(sp)
    k = escala
    L, Al, P, G = S['l'] * k, S['a'] * k, S['p'] * k, S['g'] * k
    suelo = (base if base is not None else h - 2)
    cx = cx if cx is not None else w * 0.46
    bob = math.sin(fase * math.pi * 4) * 0.6
    cy = suelo - P - Al * 0.62 + bob
    r = tonos(coat, 5, 0.26, 0.46)
    osc = tonos(mezcla(coat, '#141014', 0.34), 5, 0.2, 0.42)
    linea = contorno(coat)
    amp = 0.42
    fases = {'di': 0.0, 'dd': 0.5, 'ti': 0.5, 'td': 0.0}   # delantera/trasera, izquierda (lejana)/derecha (cerca)
    x_del, x_tra = cx + L * 0.62, cx - L * 0.66

    def pata(x, f, cerca):
        a = math.sin((fase + f) * math.pi * 2) * amp
        alza = max(0.0, math.cos((fase + f) * math.pi * 2)) * P * 0.16
        y0 = cy + Al * 0.42
        rod = (x + math.sin(a) * P * 0.5, y0 + (P * 0.5))
        pie = (x + math.sin(a * 1.15) * P * 0.86, suelo - alza)
        m = lam.capsula(x, y0, G * 1.32, rod[0], rod[1], G * 0.9) | lam.capsula(rod[0], rod[1], G * 0.9, pie[0], pie[1] - 1, G * 0.72)
        return m, pie

    # patas lejanas
    for x, f in ((x_del - 2, fases['di']), (x_tra + 2, fases['ti'])):
        m, pie = pata(x, f, False)
        volumen(lam, m, osc, radio=3, linea=linea)
        lam.poner(lam.rect(pie[0] - G, pie[1] - 2.5, pie[0] + G + 1, pie[1] + 1) & m, S.get('casco', tonos('#2a2420', 3, 0.2, 0.2)[1]))

    # cola
    ct = S['c']
    xc, yc = cx - L * 0.98, cy - Al * 0.22
    oscila = math.sin(fase * math.pi * 2) * 1.6
    if ct == 'larga':
        m = lam.capsula(xc, yc, 1.8 * k, xc - 5 * k, yc + 7 * k, 2.6 * k) | lam.capsula(xc - 5 * k, yc + 7 * k, 2.6 * k, xc - 6 * k + oscila, yc + 18 * k, 0.8)
        volumen(lam, m, tonos(marca, 5, 0.26, 0.42), radio=2.6, linea=contorno(marca))
    elif ct == 'borla':
        m = lam.capsula(xc, yc, 1.1 * k, xc - 4 * k + oscila, yc + 11 * k, 0.8)
        lam.poner(m, r[2])
        lam.poner(borde(m), linea)
        b = lam.elipse(xc - 4 * k + oscila, yc + 13 * k, 1.9 * k, 3.4 * k)
        volumen(lam, b, tonos(marca, 4, 0.2, 0.36), radio=2, linea=contorno(marca))
    elif ct == 'corta':
        m = lam.capsula(xc + 1, yc, 1.6 * k, xc - 3 * k, yc + 3.5 * k, 1.0)
        volumen(lam, m, r, radio=2, linea=linea)
    elif ct == 'peluda':
        m = lam.capsula(xc, yc, 2 * k, xc - 6 * k, yc + 6 * k, 3.2 * k) | lam.capsula(xc - 6 * k, yc + 6 * k, 3.2 * k, xc - 10 * k + oscila, yc + 11 * k, 0.9)
        volumen(lam, m, r, radio=3, linea=linea)
        lam.poner(lam.elipse(xc - 10 * k + oscila, yc + 11 * k, 2 * k, 1.6 * k) & m, tonos(marca, 3, 0.2, 0.3)[0])
    elif ct == 'felina':
        m = lam.capsula(xc, yc, 1.6 * k, xc - 8 * k, yc + 2 * k, 1.5 * k) | lam.capsula(xc - 8 * k, yc + 2 * k, 1.5 * k, xc - 13 * k + oscila, yc - 4 * k, 1.1 * k)
        volumen(lam, m, r, radio=2, linea=linea)
    elif ct == 'reptil':
        m = lam.capsula(xc + 2, yc, 3.2 * k, xc - 9 * k, yc + 1 * k, 2 * k) | lam.capsula(xc - 9 * k, yc + 1 * k, 2 * k, xc - 19 * k + oscila, yc - 2 * k, 0.8)
        volumen(lam, m, r, radio=3, linea=linea)

    # el cuerpo, una sola pieza con el cuello y las patas cercanas para que el bulto sea continuo
    cuerpo = lam.elipse(cx, cy, L, Al)
    cuerpo |= lam.elipse(cx + L * 0.46, cy - Al * 0.05, L * 0.54, Al * 1.03)
    cuerpo |= lam.elipse(cx - L * 0.5, cy - Al * 0.08, L * 0.5, Al * 1.0)
    if S.get('recio'):
        cuerpo |= lam.elipse(cx + L * 0.28, cy - Al * 0.52, L * 0.5, Al * 0.72)
    cuN, cuA = S['cu'][0] * k, S['cu'][1] * k
    hx0, hy0 = cx + L * 0.8, cy - Al * 0.32
    cab = (hx0 + cuN * 0.72, hy0 - cuA + bob * 0.4)
    cuello = lam.capsula(hx0 - 1, hy0, max(G * 1.95, Al * 0.6), cab[0] - 1, cab[1] + 1, max(G * 1.1, 3.0 * k))
    pelaje = cuerpo | cuello
    pcerca = []
    for x, f in ((x_del + 1, fases['dd']), (x_tra - 1, fases['td'])):
        m, pie = pata(x, f, True)
        pelaje |= m
        pcerca.append((m, pie))
    if S.get('joroba'):
        pelaje |= lam.elipse(cx - L * 0.06, cy - Al * 1.08, L * 0.42, Al * 0.72)
    if S.get('faldon'):
        pelaje |= lam.rect(cx - L * 0.92, cy, cx + L * 0.9, cy + Al + 3) & lam.elipse(cx, cy + 2, L * 1.02, Al * 1.28)
    mo_l, mo_a = S['mo'][0] * k, S['mo'][1] * k
    cra_r = max(3.6 * k, mo_a * 1.12)
    if S.get('recio') or S.get('felino'):
        cra_r = max(5.2 * k, mo_a * 1.2)
    craneo = lam.elipse(cab[0], cab[1], cra_r * 1.06, cra_r)
    morro = lam.capsula(cab[0] + cra_r * 0.4, cab[1] + 0.8, cra_r * 0.86, cab[0] + cra_r * 0.3 + mo_l, cab[1] + mo_a * 0.55, mo_a * 0.82)
    pelaje |= craneo | morro
    volumen(lam, pelaje, r, radio=max(6.0, Al * 0.9), linea=linea)

    # la barriga y el morro, más claros cuando la especie lo pide
    if S.get('rayas'):
        n_ray = 7 if S['rayas'] == 'anchas' else 9
        for i in range(n_ray):
            x_r = cx - L * 0.9 + i * (L * 1.85 / n_ray)
            t = lam.trazo([(x_r, cy - Al * 1.05), (x_r + 1.8, cy + Al * 0.15 + (i % 2) * 2.5)], 2 if S['rayas'] == 'anchas' else 1)
            lam.poner(t & pelaje & ~borde(pelaje), marca)
        for i in range(3):
            t = lam.trazo([(cab[0] - 3 - i * 3, hy0 - cuA * 0.2 - i * 3), (cab[0] + 1 - i * 3, hy0 - cuA * 0.1 - i * 3 + 3)], 1)
            lam.poner(t & pelaje & ~borde(pelaje), marca)
    panza = lam.elipse(cx + 1, cy + Al * 0.86, L * 0.72, Al * 0.28) & pelaje & ~borde(pelaje)
    if not S.get('rayas') and marca:
        lam.poner(panza, mezcla(r[1], marca, 0.28))
    # cascos de las patas cercanas
    for m, pie in pcerca:
        lam.poner(lam.rect(pie[0] - G, pie[1] - 2.5, pie[0] + G + 1, pie[1] + 1) & m, tonos('#2a2420', 3, 0.2, 0.2)[1])

    # lana (trazos cortos que siguen el lomo, nunca puntos)
    if S.get('lana'):
        lr = tonos(coat, 5, 0.2, 0.3)
        for i in range(int(L * 1.2)):
            x_l = cx - L * 0.9 + i * 1.6
            y_top = cy - Al * 0.86 + (i % 3)
            lam.poner(lam.trazo([(x_l, y_top), (x_l + 1.2, y_top + 4)], 1) & cuerpo & ~borde(pelaje), lr[0 if i % 2 else 3])
    if S.get('melena'):
        mel = lam.elipse(cab[0] - 1, cab[1] + 1.5, 9.2 * k, 9.8 * k)
        volumen(lam, mel, tonos(marca, 5, 0.3, 0.42), radio=5, linea=contorno(marca))
        ra = tonos(marca, 5, 0.26, 0.4)
        for i in range(8):
            a = i / 8.0 * math.pi * 2
            lam.poner(lam.trazo([(cab[0] - 1 + math.cos(a) * 4, cab[1] + 1.5 + math.sin(a) * 4), (cab[0] - 1 + math.cos(a) * 8, cab[1] + 1.5 + math.sin(a) * 8)], 1) & mel & ~borde(mel), ra[3])
        cara = lam.elipse(cab[0] + 1, cab[1] + 1, cra_r * 1.0, cra_r * 0.95) | lam.capsula(cab[0] + 2, cab[1] + 1, cra_r * 0.8, cab[0] + mo_l, cab[1] + mo_a * 0.5, mo_a * 0.8)
        volumen(lam, cara, r, radio=4, linea=linea)
    if S.get('crin'):
        cr = tonos(marca, 5, 0.26, 0.44)
        ancho = 3 if S.get('crin_gorda') else 2
        pts = []
        for i in range(8):
            t = i / 7.0
            pts.append((hx0 - 3 + (cab[0] - hx0 + 1) * t - 2.2 * (1 - t), hy0 - Al * 0.52 + (cab[1] - hy0 + Al * 0.52 - cra_r) * t))
        cri = lam.trazo(pts, ancho + 2)
        lam.poner(cri, cr[1])
        lam.poner(lam.trazo(pts, 1), cr[0])
        lam.poner(dilata(cri) & ~lam.opaco(), contorno(marca))
    # cara
    ojo = (cab[0] + cra_r * 0.42, cab[1] - cra_r * 0.24)
    lam.poner(lam.rect(ojo[0], ojo[1], ojo[0] + 2, ojo[1] + 2), '#14100e')
    lam.poner(lam.rect(ojo[0], ojo[1], ojo[0] + 1, ojo[1] + 1), '#f4f0e6')
    punta = (cab[0] + cra_r * 0.3 + mo_l, cab[1] + mo_a * 0.55)
    lam.poner(lam.rect(punta[0], punta[1] - 1, punta[0] + 2, punta[1] + 1) & pelaje, linea)
    lam.poner(lam.trazo([(punta[0] - mo_l * 0.5, punta[1] + mo_a * 0.5), (punta[0] + 1, punta[1] + mo_a * 0.42)], 1) & pelaje, r[4])
    if S.get('colmillo'):
        lam.poner(lam.poli([(punta[0] - 2, punta[1] + 2), (punta[0] + 1, punta[1] - 3), (punta[0], punta[1] + 2)]), '#f0e8d4')
    # orejas
    ot = S.get('o')
    oy = cab[1] - cra_r * 0.8
    ox = cab[0] - cra_r * 0.3
    if ot == 'punta':
        m = lam.poli([(ox - 1.6 * k, oy + 1.6), (ox + 0.8 * k, oy - 5.6 * k), (ox + 2.8 * k, oy + 1.6)])
    elif ot == 'larga':
        m = lam.capsula(ox, oy + 1, 1.7 * k, ox - 2 * k, oy - 8.6 * k, 1.3 * k)
    elif ot == 'chica':
        m = lam.elipse(ox - 1.2 * k, oy + 0.6, 2.8 * k, 1.6 * k)
    elif ot == 'redonda':
        m = lam.elipse(ox - 0.6, oy, 2.5 * k, 2.5 * k)
    else:
        m = lam.vacia()
    if m.any():
        lam.poner(m, r[2])
        lam.poner(erosiona(m), r[1])
        lam.poner(borde(m), linea)
    # cuernos
    cu_t = S.get('cuerno')
    cue = tonos('#d9c6a0', 4, 0.22, 0.4)
    li_c = contorno('#d9c6a0')
    if cu_t == 'curvo':
        m = lam.capsula(ox + 1, oy, 1.6 * k, ox - 5 * k, oy - 2 * k, 1.1 * k) | lam.capsula(ox - 5 * k, oy - 2 * k, 1.1 * k, ox - 4 * k, oy - 7 * k, 0.5)
        volumen(lam, m, cue, radio=2, linea=li_c)
    elif cu_t == 'espiral':
        m = lam.elipse(ox - 1, oy + 3 * k, 5.2 * k, 5.2 * k) & ~lam.elipse(ox - 0.4, oy + 3 * k, 2.1 * k, 2.1 * k)
        volumen(lam, m, cue, radio=2, linea=li_c)
    elif cu_t in ('astas', 'astas_grandes'):
        gr = 1.0 if cu_t == 'astas' else 1.35
        pts = [(ox + 1, oy), (ox - 3 * k * gr, oy - 7 * k * gr), (ox - 8 * k * gr, oy - 12 * k * gr)]
        m = lam.trazo(pts, 2)
        for i, (dx_, dy_) in enumerate(((-6, -2), (3, -6), (-2, -7))):
            pb = pts[1] if i != 2 else pts[2]
            m |= lam.trazo([pb, (pb[0] + dx_ * k * gr, pb[1] + dy_ * k * gr)], 2 if cu_t != 'astas' else 1)
        lam.poner(dilata(m) & ~lam.opaco(), li_c)
        lam.poner(m, cue[1])
    elif cu_t == 'nariz':
        m = lam.poli([(punta[0] - 5 * k, cab[1] - 1), (punta[0] - 0.5, cab[1] - 12 * k), (punta[0] + 0.5, cab[1] + 1)])
        volumen(lam, m, cue, radio=2, linea=li_c)
    if S.get('collar'):
        pl = tonos(marca, 4, 0.2, 0.3)
        lam.poner(lam.capsula(hx0 + 1, hy0 + 2, 3 * k, cab[0] - 3, cab[1] + 5, 2.2 * k) & pelaje, pl[1])
    # la manta y la silla: es una montura, y se tiene que ver
    if silla:
        sx = cx - L * 0.02
        top = cy - Al * (1.0 if not S.get('joroba') else 1.5)
        mt = tonos(manta, 4, 0.24, 0.4)
        manta_m = lam.poli([(sx - L * 0.5, top + 2), (sx + L * 0.44, top + 2), (sx + L * 0.5, top + Al * 1.06), (sx - L * 0.56, top + Al * 1.06)]) & dilata(pelaje)
        lam.poner(manta_m, mt[1])
        lam.poner(manta_m & (lam.yy < top + 5), mt[0])
        lam.poner(borde(manta_m), mt[3])
        lam.poner(lam.rect(sx - L * 0.56, top + Al * 0.86, sx + L * 0.5, top + Al * 0.86 + 1) & manta_m, '#e8c35a')
        cu = tonos('#6b4326', 4, 0.26, 0.42)
        asiento = lam.elipse(sx, top + 1, L * 0.34, 3.4 * k)
        lam.poner(asiento, cu[1])
        lam.poner(asiento & (lam.yy < top), cu[0])
        lam.poner(borde(asiento), cu[3])
        lam.poner(lam.rect(sx - 1, top + 3, sx + 2, top + Al * 0.9) & manta_m, cu[2])
    return {'silla_y': cy - Al - 1, 'x': cx}


def _ave_lado(lam, sp, coat, marca, manta, fase):
    w, h = lam.w, lam.h
    suelo = h - 2
    cx = w * 0.46
    P, L, Al = sp['p'], sp['l'], sp['a']
    cy = suelo - P - Al * 0.3 + math.sin(fase * math.pi * 4) * 0.6
    r = tonos(coat, 5, 0.28, 0.46)
    li = contorno(coat)
    pat = tonos('#c9a26a', 4, 0.22, 0.4)
    for sg, f in ((-1, 0.5), (1, 0.0)):
        a = math.sin((fase + f) * math.pi * 2) * 0.48
        rod = (cx + sg * 1 + math.sin(a) * P * 0.5, cy + Al * 0.6 + P * 0.42)
        pie = (cx + sg * 1 + math.sin(a * 1.3) * P * 0.82, suelo - max(0, math.cos((fase + f) * math.pi * 2)) * 3)
        m = lam.capsula(cx + sg, cy + Al * 0.5, 2.0, rod[0], rod[1], 1.2) | lam.capsula(rod[0], rod[1], 1.2, pie[0], pie[1], 1.1)
        m |= lam.capsula(pie[0], pie[1], 1.1, pie[0] + 5, pie[1], 0.9)
        volumen(lam, m, pat if sg > 0 else tonos(mezcla('#c9a26a', '#141014', 0.3), 4, 0.2, 0.4), radio=2, linea=contorno('#c9a26a'))
    # cola de plumas
    cl = tonos(marca, 4, 0.2, 0.36)
    for i in range(4):
        m = lam.capsula(cx - L * 0.7, cy - 1 + i, 2.6, cx - L * 1.34 - i, cy - 7 + i * 4, 1.4)
        lam.poner(m, cl[i % 3])
        lam.poner(borde(m), contorno(marca))
    cuerpo = lam.elipse(cx, cy, L, Al)
    cab = (cx + L * 0.5 + sp['cu'][0], cy - sp['cu'][1] - 2)
    cuello = lam.capsula(cx + L * 0.6, cy - Al * 0.4, 3.8, cab[0], cab[1], 2.0)
    craneo = lam.elipse(cab[0], cab[1], 3.8, 3.4)
    pico = lam.poli([(cab[0] + 2, cab[1] - 1.6), (cab[0] + 8, cab[1] + 0.8), (cab[0] + 2, cab[1] + 2)])
    volumen(lam, cuerpo, r, radio=7, linea=li)
    p2 = cuello | craneo
    volumen(lam, p2, tonos(mezcla(coat, marca, 0.55), 5, 0.26, 0.42), radio=3, linea=contorno(marca))
    lam.poner(pico, '#e0a040')
    lam.poner(borde(pico), contorno('#e0a040'))
    lam.poner(lam.rect(cab[0] + 1, cab[1] - 2, cab[0] + 3, cab[1]), '#14100e')
    lam.poner(lam.rect(cab[0] + 1, cab[1] - 2, cab[0] + 2, cab[1] - 1), '#f4f0e6')
    ala = lam.elipse(cx - L * 0.14, cy + 1, L * 0.62, Al * 0.56, 0.2)
    volumen(lam, ala, tonos(mezcla(coat, '#141014', 0.2), 5, 0.3, 0.42), radio=4, linea=li)
    mt = tonos(manta, 4, 0.24, 0.4)
    top = cy - Al
    m = lam.rect(cx - L * 0.42, top - 1, cx + L * 0.36, top + Al * 0.72) & dilata(cuerpo)
    lam.poner(m, mt[1])
    lam.poner(borde(m), mt[3])
    cu = tonos('#6b4326', 4, 0.26, 0.42)
    a = lam.elipse(cx - 1, top + 0.5, L * 0.36, 2.8)
    lam.poner(a, cu[1])
    lam.poner(borde(a), cu[3])
    return {'silla_y': top - 1, 'x': cx}


def _raptor_lado(lam, sp, coat, marca, manta, fase):
    w, h = lam.w, lam.h
    suelo = h - 2
    cx = w * 0.45
    P, L, Al = sp['p'], sp['l'], sp['a']
    cy = suelo - P - Al * 0.36 + math.sin(fase * math.pi * 4) * 0.7
    r = tonos(coat, 5, 0.28, 0.46)
    osc = tonos(mezcla(coat, '#141014', 0.34), 5, 0.2, 0.42)
    li = contorno(coat)
    xc, yc = cx - L * 0.98, cy - 1
    osc_c = math.sin(fase * math.pi * 2) * 2
    cola = lam.capsula(xc + 5, yc, 5, xc - 8, yc + 1, 3) | lam.capsula(xc - 8, yc + 1, 3, xc - 22 + 0, yc - 2 + osc_c, 0.8)
    volumen(lam, cola, r, radio=4, linea=li)
    for sg, f, cols in ((-1, 0.5, osc), (1, 0.0, r)):
        a = math.sin((fase + f) * math.pi * 2) * 0.5
        mus = (cx - L * 0.1 + math.sin(a) * P * 0.5, cy + Al * 0.4 + P * 0.42)
        pie = (cx - L * 0.1 + math.sin(a * 1.2) * P * 0.9, suelo - max(0, math.cos((fase + f) * math.pi * 2)) * 3.5)
        m = lam.capsula(cx - L * 0.2, cy + 2, 4.6, mus[0], mus[1], 2.4) | lam.capsula(mus[0], mus[1], 2.4, pie[0], pie[1], 1.5)
        m |= lam.capsula(pie[0], pie[1], 1.5, pie[0] + 6, pie[1], 1.0)
        volumen(lam, m, cols, radio=3, linea=li)
    cuerpo = lam.elipse(cx, cy, L, Al)
    cab = (cx + L * 0.7 + sp['cu'][0] * 0.74, cy - sp['cu'][1] - 2)
    cuello = lam.capsula(cx + L * 0.62, cy - 2, 5, cab[0] - 1, cab[1] + 1, 3)
    craneo = lam.elipse(cab[0], cab[1], 5, 4)
    morro = lam.capsula(cab[0] + 2, cab[1] + 1, 3.4, cab[0] + sp['mo'][0], cab[1] + 2, 2)
    p = cuerpo | cuello | craneo | morro
    volumen(lam, p, r, radio=7, linea=li)
    for i in range(6):
        xx = cx - L * 0.7 + i * L * 0.3
        lam.poner(lam.trazo([(xx, cy - Al * 0.9), (xx + 2, cy + Al * 0.1)], 1) & p & ~borde(p), marca)
    lam.poner(lam.rect(cab[0] + 1, cab[1] - 2, cab[0] + 3, cab[1]), '#14100e')
    lam.poner(lam.rect(cab[0] + 1, cab[1] - 2, cab[0] + 2, cab[1] - 1), '#f4e87a')
    lam.poner(lam.trazo([(cab[0] + 1, cab[1] + 3), (cab[0] + sp['mo'][0] + 1, cab[1] + 3)], 1) & p, r[4])
    bra = lam.capsula(cx + L * 0.6, cy + 3, 1.8, cx + L * 0.86, cy + 8, 1.0)
    lam.poner(bra, r[2])
    lam.poner(borde(bra), li)
    mt = tonos(manta, 4, 0.24, 0.4)
    top = cy - Al
    m = lam.rect(cx - L * 0.42, top - 1, cx + L * 0.36, top + Al * 0.9) & dilata(p)
    lam.poner(m, mt[1])
    lam.poner(borde(m), mt[3])
    cu = tonos('#6b4326', 4, 0.26, 0.42)
    a = lam.elipse(cx - 1, top + 0.5, L * 0.36, 2.8)
    lam.poner(a, cu[1])
    lam.poner(borde(a), cu[3])
    return {'silla_y': top - 1, 'x': cx}


def _de_frente(lam, sp, coat, marca, manta, fase, espalda=False):
    """De frente (abajo) o de espaldas (arriba): el cuerpo se acorta y manda el pecho o la grupa."""
    w, h = lam.w, lam.h
    S = sp
    suelo = h - 2
    cx = w / 2.0
    ave = S.get('ave') or S.get('raptor')
    P, Al = S['p'], S['a']
    an = max(Al * 1.42, 10.0) if not ave else Al * 1.12
    G = S['g']
    bob = math.sin(fase * math.pi * 4) * 0.6
    cy = suelo - P - Al * 0.62 + bob
    r = tonos(coat, 5, 0.26, 0.46)
    osc = tonos(mezcla(coat, '#141014', 0.34), 5, 0.2, 0.42)
    li = contorno(coat)

    def pata(x, f, cols):
        lift = max(0.0, math.sin((fase + f) * math.pi * 2)) * P * 0.2
        m = lam.capsula(x, cy + Al * 0.3, G * 1.3, x, suelo - lift - 1, G * 0.8)
        volumen(lam, m, cols, radio=2.5, linea=li)
        lam.poner(lam.rect(x - G, suelo - lift - 3, x + G + 1, suelo - lift + 1) & m, tonos('#2a2420', 3, 0.2, 0.2)[1])

    if not ave:
        pata(cx - an * 0.52, 0.5, osc)
        pata(cx + an * 0.52, 0.0, osc)
    cuerpo = lam.elipse(cx, cy, an, Al * 1.02)
    if S.get('joroba'):
        cuerpo |= lam.elipse(cx, cy - Al * 1.0, an * 0.6, Al * 0.6)
    if not espalda:
        cuN = S['cu'][1]
        cab = (cx, cy - Al * 0.4 - cuN * 0.7 + bob * 0.3)
        volumen(lam, cuerpo, r, radio=max(6.0, Al * 0.9), linea=li)
        if ave:
            pata(cx - 3, 0.5, tonos('#c9a26a', 4, 0.22, 0.4))
            pata(cx + 3, 0.0, tonos('#c9a26a', 4, 0.22, 0.4))
        else:
            pata(cx - an * 0.26, 0.0, r)
            pata(cx + an * 0.26, 0.5, r)
        # manta por encima, a los lados
        mt = tonos(manta, 4, 0.24, 0.4)
        mm = lam.rect(cx - an, cy - Al * 1.02, cx + an, cy - Al * 0.2) & dilata(cuerpo)
        lam.poner(mm, mt[1])
        lam.poner(borde(mm), mt[3])
        cu = tonos('#6b4326', 4, 0.26, 0.42)
        asi = lam.elipse(cx, cy - Al * 1.02, an * 0.62, 3)
        lam.poner(asi, cu[1])
        lam.poner(borde(asi), cu[3])
        if cuN > 4:
            cue = lam.capsula(cx, cy - Al * 0.3, max(G * 1.9, 3.8), cab[0], cab[1] + 2, max(G * 1.1, 2.6))
            volumen(lam, cue, r, radio=4, linea=li)
        ra = max(4.2, S['mo'][1] * 1.15)
        if S.get('melena'):
            mel = lam.elipse(cab[0], cab[1] + 1, 9.5, 9.5)
            volumen(lam, mel, tonos(marca, 5, 0.3, 0.42), radio=5, linea=contorno(marca))
        cabeza = lam.elipse(cab[0], cab[1], ra * 1.05, ra)
        morro = lam.elipse(cab[0], cab[1] + ra * 0.72, S['mo'][1] * 0.86, S['mo'][1] * 0.72)
        volumen(lam, cabeza | morro, r, radio=4, linea=li)
        if S.get('rayas'):
            for dx_ in (-2.5, 0, 2.5):
                lam.poner(lam.trazo([(cab[0] + dx_, cab[1] - ra + 1), (cab[0] + dx_ * 0.7, cab[1] - ra * 0.2)], 1) & cabeza, marca)
        for sg in (-1, 1):
            ox, oy = cab[0] + sg * ra * 0.5, cab[1] - ra * 0.18
            lam.poner(lam.rect(ox - 1, oy, ox + 1, oy + 2), '#14100e')
            lam.poner(lam.rect(ox - 1, oy, ox, oy + 1), '#f4f0e6')
            ot = S.get('o')
            ex, ey = cab[0] + sg * ra * 0.82, cab[1] - ra * 0.84
            if ot == 'punta':
                e_ = lam.poli([(ex - 1.8, ey + 2), (ex + sg * 0.8, ey - 5), (ex + 1.8, ey + 2)])
            elif ot == 'larga':
                e_ = lam.capsula(ex, ey + 1, 1.6, ex + sg * 2, ey - 8, 1.2)
            elif ot == 'chica':
                e_ = lam.elipse(ex + sg * 1.4, ey + 1.6, 2.8, 1.6)
            elif ot == 'redonda':
                e_ = lam.elipse(ex, ey, 2.4, 2.4)
            else:
                e_ = lam.vacia()
            if e_.any():
                lam.poner(e_, r[2])
                lam.poner(borde(e_), li)
            cu_t = S.get('cuerno')
            cue_c = tonos('#d9c6a0', 4, 0.22, 0.4)
            if cu_t == 'curvo':
                m = lam.capsula(cab[0] + sg * ra * 0.6, cab[1] - ra * 0.7, 1.5, cab[0] + sg * (ra + 4), cab[1] - ra * 0.9, 1.0) | lam.capsula(cab[0] + sg * (ra + 4), cab[1] - ra * 0.9, 1.0, cab[0] + sg * (ra + 3), cab[1] - ra - 5, 0.5)
                volumen(lam, m, cue_c, radio=2, linea=contorno('#d9c6a0'))
            elif cu_t == 'espiral':
                m = lam.elipse(cab[0] + sg * (ra + 1.5), cab[1] - 0.5, 4, 4.6) & ~lam.elipse(cab[0] + sg * (ra + 1.5), cab[1] - 0.5, 1.5, 1.8)
                volumen(lam, m, cue_c, radio=2, linea=contorno('#d9c6a0'))
            elif cu_t in ('astas', 'astas_grandes'):
                gr = 1 if cu_t == 'astas' else 1.3
                pb = (cab[0] + sg * ra * 0.5, cab[1] - ra * 0.9)
                t1 = (pb[0] + sg * 4 * gr, pb[1] - 6 * gr)
                t2 = (pb[0] + sg * 8 * gr, pb[1] - 10 * gr)
                m = lam.trazo([pb, t1, t2], 2) | lam.trazo([t1, (t1[0] - sg * 2 * gr, t1[1] - 5 * gr)], 1) | lam.trazo([t1, (t1[0] + sg * 5 * gr, t1[1] - 1 * gr)], 1)
                lam.poner(dilata(m) & ~lam.opaco(), contorno('#d9c6a0'))
                lam.poner(m, cue_c[1])
        lam.poner(lam.rect(cab[0] - 1.4, cab[1] + ra * 0.72, cab[0] + 1.6, cab[1] + ra * 0.72 + 2), li)
        if S.get('cuerno') == 'nariz':
            m = lam.poli([(cab[0] - 2.4, cab[1] + ra * 0.5), (cab[0], cab[1] - 5), (cab[0] + 2.4, cab[1] + ra * 0.5)])
            volumen(lam, m, tonos('#d9c6a0', 4, 0.22, 0.4), radio=2, linea=contorno('#d9c6a0'))
        if S.get('colmillo'):
            for sg in (-1, 1):
                lam.poner(lam.poli([(cab[0] + sg * 3, cab[1] + ra * 0.9), (cab[0] + sg * 4.4, cab[1] + ra * 0.1), (cab[0] + sg * 2, cab[1] + ra * 0.9)]), '#f0e8d4')
        if ave:
            lam.poner(lam.poli([(cab[0] - 2, cab[1] + ra * 0.2), (cab[0] + 2, cab[1] + ra * 0.2), (cab[0], cab[1] + ra + 2)]), '#e0a040')
    else:
        cuN = S['cu'][1]
        cab = (cx, cy - Al * 0.46 - cuN * 0.62 + bob * 0.3)
        if cuN > 4:
            cue = lam.capsula(cx, cy - Al * 0.3, max(G * 1.9, 3.8), cab[0], cab[1] + 2, max(G * 1.1, 2.6))
            volumen(lam, cue, r, radio=4, linea=li)
        ra = max(4.2, S['mo'][1] * 1.15)
        cabeza = lam.elipse(cab[0], cab[1], ra * 1.05, ra)
        if S.get('melena'):
            mel = lam.elipse(cab[0], cab[1] + 1, 9.5, 9.5)
            volumen(lam, mel, tonos(marca, 5, 0.3, 0.42), radio=5, linea=contorno(marca))
        volumen(lam, cabeza, r, radio=4, linea=li)
        for sg in (-1, 1):
            ot = S.get('o')
            ex, ey = cab[0] + sg * ra * 0.8, cab[1] - ra * 0.8
            if ot == 'punta':
                e_ = lam.poli([(ex - 1.8, ey + 2), (ex + sg * 0.8, ey - 5), (ex + 1.8, ey + 2)])
            elif ot == 'larga':
                e_ = lam.capsula(ex, ey + 1, 1.6, ex + sg * 2, ey - 8, 1.2)
            elif ot == 'chica':
                e_ = lam.elipse(ex + sg * 1.4, ey + 1.6, 2.8, 1.6)
            elif ot == 'redonda':
                e_ = lam.elipse(ex, ey, 2.4, 2.4)
            else:
                e_ = lam.vacia()
            if e_.any():
                lam.poner(e_, r[2])
                lam.poner(borde(e_), li)
        volumen(lam, cuerpo, r, radio=max(6.0, Al * 0.9), linea=li)
        if S.get('rayas'):
            for i in range(5):
                xx = cx - an * 0.8 + i * an * 0.4
                lam.poner(lam.trazo([(xx, cy - Al * 0.8), (xx + (i - 2) * 0.6, cy + Al * 0.6)], 1) & cuerpo & ~borde(cuerpo), marca)
        pata(cx - an * 0.46, 0.0, r if not ave else tonos('#c9a26a', 4, 0.22, 0.4))
        pata(cx + an * 0.46, 0.5, r if not ave else tonos('#c9a26a', 4, 0.22, 0.4))
        # cola
        c = S['c']
        os_ = math.sin(fase * math.pi * 2) * 1.5
        if c in ('larga', 'peluda', 'reptil', 'plumas'):
            m = lam.capsula(cx, cy - Al * 0.2, 2.2, cx + os_, cy + Al * 1.1, 1.6)
            volumen(lam, m, tonos(marca if c in ('larga', 'plumas') else coat, 5, 0.26, 0.42), radio=2.5, linea=li)
        else:
            m = lam.capsula(cx, cy - Al * 0.2, 1.2, cx + os_, cy + Al * 0.7, 1.0)
            lam.poner(m, r[2])
            lam.poner(borde(m), li)
        mt = tonos(manta, 4, 0.24, 0.4)
        mm = lam.rect(cx - an, cy - Al * 1.02, cx + an, cy - Al * 0.1) & dilata(cuerpo)
        lam.poner(mm, mt[1])
        lam.poner(borde(mm), mt[3])
        cu = tonos('#6b4326', 4, 0.26, 0.42)
        asi = lam.elipse(cx, cy - Al * 1.02, an * 0.62, 3)
        lam.poner(asi, cu[1])
        lam.poner(borde(asi), cu[3])
    return {'silla_y': cy - Al - 1, 'x': cx}


def montura_cuadro(especie, coat, marca, manta, vista, fase, w=84, h=68):
    sp = ESPECIES[especie]
    lam = Lamina(w, h)
    if vista == 'lado':
        if sp.get('ave'):
            info = _ave_lado(lam, sp, coat, marca, manta, fase)
        elif sp.get('raptor'):
            info = _raptor_lado(lam, sp, coat, marca, manta, fase)
        else:
            info = _cuadrupedo_lado(lam, sp, coat, marca, manta, fase)
    else:
        info = _de_frente(lam, sp, coat, marca, manta, fase, espalda=(vista == 'arriba'))
    return lam, info


# ══════════════════════════════════════════════
#  LA COMIDA: panes, tortas e ingredientes (iconos de 24x24)
# ══════════════════════════════════════════════
# Como el resto de iconos de cosecha del juego (21x24): una pieza con bulto, luz
# arriba a la izquierda y contorno del color del objeto. Sin semillas ni granos
# de azúcar, que serían puntitos: lo que adorna son trazos y bandas.
def _e(L, cx, cy, rx, ry, giro=0.0):
    """Una elipse sin el píxel suelto que deja en cada punta un radio entero."""
    return L.elipse(cx, cy, rx - 0.28, ry - 0.28, giro)


def _trazos(L, m, listas, color, ancho=1):
    for pts in listas:
        L.poner(L.trazo(pts, ancho) & m, color)


def _corte(L, m, x0, y0, x1, y1, miga, sombra):
    """Un corte de panadero: la miga y, debajo, la sombra del labio."""
    L.poner(L.trazo([(x0 + 1, y0 + 1), (x1 + 1, y1 + 1)], 1) & m, sombra)
    L.poner(L.trazo([(x0, y0), (x1, y1)], 1) & m, miga)


def pan_icono(forma, corteza, miga='#f4e4bd', adorno=None, adorno2=None):
    L = Lamina(24, 24)
    r = tonos(corteza, 6, 0.34, 0.46)
    osc = r[5]
    if forma == 'hogaza':
        m = _e(L, 12, 13, 10, 8.5) & (L.yy <= 20)
        volumen(L, m, r, radio=6.0)
        dentro = erosiona(m)
        for dx in (-5, 0, 5):
            _corte(L, dentro, 9 + dx, 16, 14 + dx, 8, miga, osc)
    elif forma == 'molde':
        cuerpo = L.rect(4, 10, 20, 21)
        copa = _e(L, 12, 9.5, 9.5, 6)
        m = cuerpo | copa
        volumen(L, m, r, radio=5.0)
        # Debajo de la copa, el molde deja una sombra recta.
        L.poner(L.rect(5, 15, 19, 16) & m, r[3])
        L.poner(L.rect(4, 19, 20, 21) & m, r[4])
        _corte(L, erosiona(copa), 7, 10, 17, 7, miga, osc)
    elif forma == 'bollo':
        m = _e(L, 12, 13.5, 9.5, 8) & (L.yy <= 20)
        volumen(L, m, r, radio=6.5)
        L.poner(_e(L, 9, 9.5, 3.4, 1.4, -0.35) & m, r[0])
    elif forma == 'baguette':
        m = L.capsula(4, 19, 3.2, 19.5, 4.5, 3.6)
        volumen(L, m, r, radio=4.0)
        dentro = erosiona(m)
        for t in (0.22, 0.5, 0.78):
            cx, cy = 4 + 15.5 * t, 19 - 14.5 * t
            _corte(L, dentro, cx - 3, cy - 1, cx + 1, cy + 3, miga, osc)
    elif forma == 'croissant':
        m = _e(L, 12, 15, 10.5, 9) & ~_e(L, 12, 21, 6.5, 6.5)
        volumen(L, m, r, radio=5.0)
        dentro = erosiona(m)
        for x0, y0, x1, y1 in ((5, 8, 8, 17), (10, 5, 11, 15), (14, 5, 13, 15), (19, 8, 16, 17)):
            L.poner(L.trazo([(x0, y0), (x1, y1)], 1) & dentro, r[4])
    elif forma == 'trenza':
        m = L.vacia()
        for i, (cx, g) in enumerate(((5.5, -0.7), (10, 0.7), (14.5, -0.7), (19, 0.7))):
            t = _e(L, cx, 12.5, 4.0, 6.6, g)
            volumen(L, t, r, radio=3.2, linea=r[4])
            m |= t
    elif forma == 'plana':
        m = _e(L, 12, 14, 10.5, 6.5)
        volumen(L, m, r, radio=3.0, sesgo=0.1)
        dentro = erosiona(erosiona(m))
        for x0, y0, x1, y1 in ((6, 11, 9, 17), (11, 10, 14, 18), (16, 11, 18, 16)):
            L.poner(L.trazo([(x0, y0), (x1, y1)], 2) & dentro, r[3])
    elif forma == 'rosca':
        m = _e(L, 12, 13, 10, 8.5) & ~_e(L, 12, 12.5, 3.5, 2.6)
        volumen(L, m, r, radio=4.0)
        L.poner(L.trazo([(6, 8), (10, 6)], 1) & m, r[0])
    elif forma == 'espiral':
        m = _e(L, 12, 13, 10, 9)
        volumen(L, m, r, radio=5.0, sesgo=0.05)
        pts = []
        for k in range(60):
            a = k * 0.28
            rad = 0.8 + k * 0.135
            pts.append((12 + math.cos(a) * rad, 13 + math.sin(a) * rad * 0.9))
        L.poner(L.trazo(pts, 1) & erosiona(m), hx(adorno) if adorno else r[5])
    elif forma == 'pretzel':
        m = L.vacia()
        tramos = [((12, 21), (4, 15)), ((4, 15), (3, 8)), ((3, 8), (7, 4)), ((7, 4), (11, 7)), ((11, 7), (15, 16)),
                  ((12, 21), (20, 15)), ((20, 15), (21, 8)), ((21, 8), (17, 4)), ((17, 4), (13, 7)), ((13, 7), (9, 16))]
        for (p, q) in tramos:
            m |= L.capsula(p[0], p[1], 1.25, q[0], q[1], 1.25)
        volumen(L, m, r, radio=1.6, sesgo=0.06)
    elif forma == 'ciabatta':
        m = (L.rect(4, 9, 20, 19) | _e(L, 4.5, 14, 2.6, 5) | _e(L, 19.5, 14, 2.6, 5) | _e(L, 12, 9, 8, 2.6) | _e(L, 12, 19, 8, 2.2))
        volumen(L, m, r, radio=4.0)
        dentro = erosiona(m)
        L.poner(L.trazo([(6, 10), (12, 8)], 2) & dentro, miga)
        L.poner(L.trazo([(13, 16), (18, 14)], 2) & dentro, miga)
    elif forma == 'focaccia':
        tapa = L.rect(3, 7, 21, 16) | _e(L, 3.5, 11, 2, 4) | _e(L, 20.5, 11, 2, 4)
        lado = L.rect(3, 14, 21, 20) | _e(L, 12, 19.5, 9, 1.5)
        L.poner(lado, r[4])
        volumen(L, tapa, r, radio=3.0, sesgo=0.1)
        m = tapa | lado
        L.poner(L.rect(3, 19, 21, 20) & m, r[5])
    else:
        raise ValueError(forma)
    # Lo que lleva encima o dentro: trazos sueltos del color del ingrediente.
    if adorno and forma != 'espiral':
        dentro = erosiona(m)
        c = tonos(adorno, 3, 0.2, 0.3)
        if forma in ('focaccia', 'ciabatta'):
            for i, (x0, y0, x1, y1) in enumerate(((5, 9, 8, 11), (10, 13, 13, 11), (15, 9, 18, 11), (6, 14, 9, 13), (15, 14, 18, 13))):
                L.poner(L.trazo([(x0, y0), (x1, y1)], 1) & dentro, c[i % 2])
        elif forma == 'bollo':
            for i, (x0, y0, x1, y1) in enumerate(((7, 12, 11, 8), (11, 13, 15, 9), (14, 15, 17, 12))):
                L.poner(L.trazo([(x0, y0), (x1, y1)], 2) & dentro, c[i % 2])
        elif forma == 'molde':
            L.poner(L.rect(5, 16, 19, 18) & dentro, c[0])
            L.poner(L.rect(5, 18, 19, 19) & dentro, c[1])
        else:
            L.poner(L.trazo([(6, 11), (11, 8), (18, 10)], 1) & dentro, c[0])
    contornear(L, contorno(corteza))
    return L.imagen()


def _bizcocho(L, cx, top, rx, ry, alto, bizcocho, crema, capas=1):
    """Una tarta redonda vista desde arriba: el lado con sus capas y la tapa con su crema."""
    r_b = tonos(bizcocho, 5, 0.22, 0.44)
    r_c = tonos(crema, 5, 0.16, 0.36)
    lado = L.rect(cx - rx, top, cx + rx + 1, top + alto) | _e(L, cx, top + alto, rx, ry)
    # Luz por columnas: el lado izquierdo recibe más.
    paso = (2 * rx + 1) / 4.0
    for i in range(4):
        col = L.rect(cx - rx + int(i * paso), top, cx - rx + int((i + 1) * paso) + 1, top + alto + int(ry) + 2)
        L.poner(lado & col, r_b[min(i, 3)])
    for k in range(1, capas + 1):
        y = int(top + ry + (alto - ry + 1) * k / float(capas + 1))
        L.poner(L.rect(cx - rx, y, cx + rx + 1, y + 1) & lado, r_c[1])
    tapa = _e(L, cx, top, rx, ry)
    # La crema que cae por el lado: ondas anchas y cortas, no gotitas.
    cae = L.vacia()
    for x in range(cx - rx, cx + rx + 1):
        largo = 1 + (2 if math.sin(x * 0.9) > 0.1 else 0)
        col = np.where(tapa[:, x])[0]
        if len(col):
            cae[col[-1]:col[-1] + largo + 1, x] = True
    L.poner(cae & lado & ~tapa, r_c[2])
    L.poner(tapa, r_c[1])
    L.poner(_e(L, cx - rx * 0.22, top - ry * 0.22, rx * 0.66, ry * 0.56) & tapa, r_c[0])
    return lado | tapa


def _fresas(L, puntos, color, tallo='#5f8f3f'):
    r = tonos(color, 4, 0.24, 0.36)
    for x, y in puntos:
        c = _e(L, x, y, 1.9, 2.3)
        volumen(L, c, r, radio=2.0)
        L.poner(L.rect(x - 1, y - 3, x + 1, y - 2), tallo)


def torta_icono(forma, bizcocho, crema, fruta=None):
    L = Lamina(24, 24)
    if forma == 'redonda':
        m = _bizcocho(L, 12, 8, 9, 4, 9, bizcocho, crema)
        if fruta:
            _fresas(L, [(8, 7), (12, 6), (16, 7)], fruta)
    elif forma == 'pisos':
        m = _bizcocho(L, 12, 15, 10, 3, 4, bizcocho, crema, capas=0)
        m |= _bizcocho(L, 12, 10, 7, 2.4, 3, bizcocho, crema, capas=0)
        m |= _bizcocho(L, 12, 5, 4, 1.8, 3, bizcocho, crema, capas=0)
        if fruta:
            _fresas(L, [(12, 3)], fruta)
    elif forma == 'cuadrada':
        rb, rc = tonos(bizcocho, 5, 0.26, 0.42), tonos(crema, 5, 0.2, 0.36)
        frente = L.rect(3, 13, 21, 21)
        L.poner(frente, rb[2])
        L.poner(L.rect(3, 19, 21, 21), rb[4])
        L.poner(L.rect(3, 16, 21, 17), rc[2])
        tapa = L.poli([(5, 6), (19, 6), (21, 13), (3, 13)])
        L.poner(tapa, rc[1])
        L.poner(L.poli([(6, 7), (14, 7), (13, 10), (6, 10)]), rc[0])
        for i, x in enumerate(range(4, 20, 4)):
            L.poner(L.rect(x, 13, x + 2, 15 + (i % 2)), rc[2])
        m = frente | tapa
        if fruta:
            _fresas(L, [(8, 9), (12, 9), (16, 9)], fruta)
    elif forma == 'porcion':
        rb, rc = tonos(bizcocho, 5, 0.26, 0.42), tonos(crema, 5, 0.2, 0.36)
        tapa = L.poli([(3, 11), (19, 5), (21, 11)])
        frente = L.poli([(3, 11), (21, 11), (21, 20), (3, 20)])
        L.poner(frente, rb[1])
        L.poner(L.rect(3, 14, 22, 16), rc[1])
        L.poner(L.rect(3, 18, 22, 21), rb[3])
        L.poner(tapa, rc[0])
        L.poner(L.trazo([(4, 11), (20, 11)], 1), rc[2])
        m = tapa | frente
        if fruta:
            _fresas(L, [(16, 8)], fruta)
    elif forma == 'pastel':
        # El pastel de fruta: borde de masa y el relleno a la vista, con tiras (no rejilla).
        rb, rc = tonos(bizcocho, 5, 0.3, 0.42), tonos(crema, 5, 0.22, 0.36)
        lado = _e(L, 12, 15, 10, 6) | L.rect(2, 13, 23, 16)
        volumen(L, lado, rb, radio=3.0, sesgo=-0.12)
        tapa = _e(L, 12, 12.5, 10, 6)
        L.poner(tapa, rb[1])
        relleno = _e(L, 12, 12.5, 7.5, 4.2)
        L.poner(relleno, rc[2])
        L.poner(_e(L, 10, 11.5, 4.6, 2.2), rc[1])
        for x0, x1 in ((6, 10), (11, 15), (15, 19)):
            L.poner(L.trazo([(x0, 16), (x1, 9)], 2) & relleno, rb[0])
        m = lado | tapa
    elif forma == 'magdalena':
        rb, rc = tonos(bizcocho, 5, 0.26, 0.42), tonos(crema, 5, 0.2, 0.36)
        papel = L.poli([(6, 13), (18, 13), (16, 21), (8, 21)])
        L.poner(papel, rb[2])
        for x in (8, 11, 14):
            L.poner(L.trazo([(x, 13), (x + 1 if x < 12 else x - 1 + 1, 21)], 1) & papel, rb[3])
        copa = _e(L, 12, 11, 8.5, 4) | _e(L, 12, 7.5, 6, 3) | _e(L, 12, 4.5, 3, 2)
        volumen(L, copa, rc, radio=3.0)
        m = papel | copa
        if fruta:
            _fresas(L, [(12, 3)], fruta)
    elif forma == 'rollo':
        rb, rc = tonos(bizcocho, 5, 0.26, 0.42), tonos(crema, 5, 0.2, 0.36)
        cuerpo = L.capsula(7, 12.5, 6.5, 19, 12.5, 6.5)
        volumen(L, cuerpo, rb, radio=4.0)
        cara = _e(L, 7, 12.5, 5.5, 6.5)
        L.poner(cara, rc[1])
        pts = []
        for k in range(36):
            a = k * 0.36
            rad = 0.5 + k * 0.125
            pts.append((7 + math.cos(a) * rad * 0.82, 12.5 + math.sin(a) * rad))
        L.poner(L.trazo(pts, 1) & cara, rb[3])
        m = cuerpo | cara
    elif forma == 'corona':
        rb, rc = tonos(bizcocho, 5, 0.28, 0.42), tonos(crema, 5, 0.2, 0.36)
        m = _e(L, 12, 14, 10, 7.5) & ~_e(L, 12, 12, 3, 1.8)
        volumen(L, m, rb, radio=4.0)
        cae = _e(L, 12, 12, 9, 5) & ~_e(L, 12, 12, 3, 1.8)
        for x in range(4, 21, 4):
            cae |= L.rect(x, 12, x + 2, 16 + (x % 3)) & m
        L.poner(cae & m, rc[1])
        L.poner(_e(L, 9, 10, 4.2, 1.3) & m & ~_e(L, 12, 12, 3, 1.8), rc[0])
        if fruta:
            _fresas(L, [(6, 11), (18, 11)], fruta)
    else:
        raise ValueError(forma)
    contornear(L, contorno(bizcocho))
    return L.imagen()


def ingrediente_icono(tipo):
    L = Lamina(24, 24)
    if tipo in ('harina', 'azucar'):
        base = '#e6dcc4' if tipo == 'harina' else '#c9d8e6'
        r = tonos(base, 5, 0.12, 0.34)
        m = _e(L, 12, 15, 8.5, 7) | L.rect(5, 14, 20, 21) | L.poli([(9, 3), (15, 3), (14, 8), (10, 8)])
        volumen(L, m, r, radio=6.0)
        L.poner(L.rect(9, 7, 15, 9), '#8b5f36')
        et = L.rect(7, 13, 17, 19)
        L.poner(et, '#b38745' if tipo == 'harina' else '#4f7fa8')
        L.poner(L.rect(9, 15, 15, 16), '#efe6cf')
        L.poner(L.rect(9, 17, 13, 18), '#efe6cf')
        contornear(L, contorno(base))
    elif tipo == 'huevo':
        r = tonos('#e9d3ad', 5, 0.14, 0.34)
        a = _e(L, 9, 14, 5.8, 7)
        b = _e(L, 16, 16, 5, 6)
        volumen(L, b, r, radio=5.0)
        volumen(L, a, tonos('#f2e3c6', 5, 0.08, 0.32), radio=5.0)
        contornear(L, contorno('#c9a878'))
    elif tipo == 'mantequilla':
        pl = tonos('#c8d6dc', 4, 0.12, 0.3)
        plato = _e(L, 12, 18, 10.5, 3.6)
        L.poner(plato, pl[2])
        L.poner(_e(L, 12, 17, 10.5, 3.2), pl[0])
        am = tonos('#f0cf5c', 5, 0.14, 0.34)
        frente = L.rect(5, 12, 19, 18)
        L.poner(frente, am[2])
        tapa = L.poli([(7, 7), (20, 7), (19, 12), (5, 12)])
        L.poner(tapa, am[0])
        lado = L.poli([(19, 12), (20, 7), (21, 7), (21, 14), (19, 18)])
        L.poner(lado, am[3])
        L.poner(L.trazo([(5, 15), (18, 15)], 1), am[1])
        contornear(L, contorno('#a8894a'))
    elif tipo == 'crema':
        vid = tonos('#b9d3dc', 5, 0.12, 0.36)
        m = L.rect(6, 6, 18, 21) | _e(L, 12, 21, 6, 1.5)
        L.poner(m, vid[1])
        L.poner(L.rect(7, 9, 17, 20), '#f6efdb')
        L.poner(L.rect(14, 9, 17, 20), '#e2d7bd')
        L.poner(L.rect(7, 9, 9, 18), '#fffaf0')
        tapa = L.rect(5, 3, 19, 7)
        L.poner(tapa, '#9a6a3f')
        L.poner(L.rect(5, 3, 19, 4), '#b98a58')
        L.poner(L.rect(15, 3, 19, 7), '#7c5230')
        contornear(L, contorno('#7a8c96'))
    elif tipo == 'levadura':
        r = tonos('#d8b45a', 5, 0.18, 0.36)
        m = L.rect(5, 8, 19, 20) | _e(L, 12, 20, 7, 2.4)
        volumen(L, m, r, radio=5.0)
        L.poner(_e(L, 12, 8, 7, 3), '#e9d9a9')
        L.poner(_e(L, 11, 7.5, 4.6, 1.6), '#f7eecb')
        L.poner(L.rect(5, 13, 19, 16), '#8a5f2a')
        L.poner(L.rect(8, 14, 16, 15), '#f0dfae')
        contornear(L, contorno('#9a7a3a'))
    elif tipo == 'chocolate':
        r = tonos('#6b3f25', 5, 0.24, 0.42)
        m = L.poli([(4, 7), (18, 3), (21, 16), (7, 21)])
        L.poner(m, r[2])
        # Dos surcos en cada sentido: tabletas anchas.
        for a, b in (((8.7, 5.7), (11.7, 19.7)), ((13.3, 4.3), (16.3, 18.3))):
            L.poner(L.trazo([a, b], 1) & m, r[4])
        for a, b in (((5.5, 12), (19.5, 8.5)),):
            L.poner(L.trazo([a, b], 1) & m, r[4])
        L.poner(L.trazo([(5, 8), (17, 4.6)], 1) & m, r[0])
        contornear(L, contorno('#6b3f25'))
    else:
        raise ValueError(tipo)
    return L.imagen()


# ══════════════════════════════════════════════
#  LAS ARMAS Y LAS CAÑAS
# ══════════════════════════════════════════════
# Mismo tamaño y mismo ángulo que las del juego (Game/Objetos/armas: 20x20, la espada con
# la punta arriba a la derecha y el arco con la panza arriba a la izquierda; caña de 24x24),
# porque gf-espada.js las gira y las coloca en la mano contando con eso. El contorno de esas
# piezas es casi negro: se respeta.
LINEA_ARMA = (24, 16, 18)


def _a_diagonal(u, v, x0=2.2, y0=17.8):
    """De (a lo largo de la hoja, de través) al lienzo: la hoja sube a la derecha a 45 grados."""
    k = 0.7071
    return (x0 + (u + v) * k, y0 + (-u + v) * k)


def espada_icono(hoja, guarda, puno, forma='recta', brillo=None):
    L = Lamina(20, 20)
    H = tonos(hoja, 5, 0.3, 0.42)
    G = tonos(guarda, 3, 0.2, 0.34)
    P = tonos(puno, 3, 0.18, 0.3)
    # Perfil de la hoja: (u, media anchura arriba, media anchura abajo).
    perfiles = {
        'recta': [(6.0, 1.7, 1.7), (20.0, 1.5, 1.5), (23.0, 0.1, 0.1)],
        'ancha': [(6.0, 2.5, 2.5), (18.0, 2.5, 2.5), (23.0, 0.1, 0.1)],
        'estoque': [(6.0, 1.1, 1.1), (21.0, 0.8, 0.8), (24.0, 0.1, 0.1)],
        'curva': [(6.0, 1.4, 1.8), (13.0, 0.5, 3.0), (19.0, -0.8, 3.0), (23.0, -1.8, -0.8)],
        'llama': [(6.0, 1.8, 1.8), (9.0, 2.7, 1.3), (12.0, 1.4, 2.7), (15.0, 2.7, 1.3), (18.0, 1.4, 2.4), (23.0, 0.1, 0.1)],
        'grande': [(6.0, 3.0, 2.2), (14.0, 3.2, 2.4), (19.0, 2.4, 2.4), (23.0, 0.1, 0.1)],
    }
    p = perfiles[forma]
    pts_arriba = [_a_diagonal(u, -a) for u, a, b in p]
    pts_abajo = [_a_diagonal(u, b) for u, a, b in reversed(p)]
    eje = [_a_diagonal(u, (b - a) / 2.0) for u, a, b in p]
    silueta = L.poli(pts_arriba + pts_abajo)
    L.poner(silueta, H[2])
    # La mitad de arriba a la izquierda recibe la luz; la de abajo a la derecha, no.
    luz = L.poli(pts_arriba + list(reversed(eje)))
    L.poner(silueta & luz, H[0])
    L.poner(silueta & L.trazo(eje, 1), H[1])
    L.poner(borde(silueta) & ~luz, H[3])
    if brillo:
        c = hx(brillo)
        L.poner(L.trazo([_a_diagonal(9, 0), _a_diagonal(17, (p[1][2] - p[1][1]) / 2.0)], 1) & silueta, c)
    # Guarda, puño y pomo.
    g = L.capsula(*_a_diagonal(5.2, -4.2), 0.9, *_a_diagonal(5.2, 4.2), 0.9)
    pu = L.capsula(*_a_diagonal(1.4, 0), 1.2, *_a_diagonal(4.8, 0), 1.2)
    pomo = L.elipse(*_a_diagonal(0.4, 0), 1.6, 1.6)
    L.poner(pu, P[1])
    L.poner(L.trazo([_a_diagonal(1.4, -0.8), _a_diagonal(4.8, -0.8)], 1) & pu, P[0])
    L.poner(g, G[1])
    L.poner(L.trazo([_a_diagonal(5.2, -4.0), _a_diagonal(5.2, 0)], 1) & g, G[0])
    L.poner(pomo, G[1])
    contornear(L, LINEA_ARMA)
    return L.imagen()


def arco_icono(madera, cuerda='#efe6cf', envoltura='#8a2f2f', puntas=None, panza=8.0):
    L = Lamina(20, 20)
    M = tonos(madera, 4, 0.28, 0.36)
    a, b = (17.0, 2.0), (2.0, 17.0)
    # La panza sale hacia arriba a la izquierda de la cuerda.
    mx, my = (a[0] + b[0]) / 2.0 - panza * 0.7071, (a[1] + b[1]) / 2.0 - panza * 0.7071
    def bez(t):
        return ((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * mx + t ** 2 * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * my + t ** 2 * b[1])
    pts = [bez(k / 24.0) for k in range(25)]
    L.poner(L.trazo([a, b], 1), cuerda)
    arco = L.vacia()
    for k in range(24):
        arco |= L.capsula(pts[k][0], pts[k][1], 1.05, pts[k + 1][0], pts[k + 1][1], 1.05)
    L.poner(arco, M[2])
    # Filo claro del lado de la luz: el mismo arco, medio píxel arriba a la izquierda.
    L.poner(L.trazo([(x - 0.7, y - 0.7) for x, y in pts], 1) & arco, M[0])
    # El agarre en medio.
    env = L.vacia()
    for k in range(10, 15):
        env |= L.capsula(pts[k][0], pts[k][1], 1.5, pts[k + 1][0], pts[k + 1][1], 1.5)
    E = tonos(envoltura, 3, 0.2, 0.3)
    L.poner(env, E[1])
    L.poner(L.trazo([(x - 0.8, y - 0.8) for x, y in pts[10:16]], 1) & env, E[0])
    if puntas:
        P = tonos(puntas, 3, 0.2, 0.3)
        for (x, y) in (a, b):
            L.poner(L.elipse(x, y, 1.6, 1.6), P[1])
    contornear(L, LINEA_ARMA)
    return L.imagen()


def cana_icono(vara, mango='#b59a6a', carrete='#c9c9c9', hilo='#e8e8e8', anillas=None):
    L = Lamina(24, 24)
    V = tonos(vara, 4, 0.26, 0.34)
    M = tonos(mango, 3, 0.2, 0.3)
    C = tonos(carrete, 3, 0.16, 0.34)
    # El hilo cae desde la punta, con su anzuelo a la derecha.
    L.poner(L.trazo([(21, 3), (21, 13)], 1), hilo)
    L.poner(L.trazo([(21, 13), (21, 15), (19, 15)], 1), C[1])
    v = L.capsula(3, 21, 1.15, 21, 3, 0.65)
    L.poner(v, V[1])
    L.poner(L.trazo([(2.6, 20.4), (20.6, 2.6)], 1) & v, V[0])
    m = L.capsula(2.6, 21.4, 1.9, 7.5, 16.5, 1.9)
    L.poner(m, M[1])
    L.poner(L.trazo([(2, 20.6), (7, 15.6)], 1) & m, M[0])
    r = L.elipse(9, 17.2, 2.6, 2.6)
    L.poner(r, C[1])
    L.poner(L.elipse(8.4, 16.6, 1.3, 1.3), C[0])
    if anillas:
        for t in (0.5, 0.75):
            x, y = 3 + 18 * t, 21 - 18 * t
            L.poner(L.capsula(x - 0.8, y - 0.8, 0.5, x + 0.8, y + 0.8, 0.5), anillas)
    contornear(L, LINEA_ARMA)
    return L.imagen()


# ══════════════════════════════════════════════
#  LO QUE SE CONSTRUYE EN LAS LANDS
# ══════════════════════════════════════════════
# Como los cofres (Game/Objetos/cofres): el juego los pinta al DOBLE, con la base en el borde
# de abajo de su sitio, y se ven desde arriba (cara de arriba + frente). Tamaño nativo: ancho
# de casillas x 16 como mucho. Nada de anillos en los troncos ni racimos de flores redondas:
# trazos y bandas.
MADERA = '#8f6a44'
PIEDRA = '#8f8a84'
HIERRO = '#4a4a55'
AGUA_OBRA = '#4f97c9'


def _tablones(L, m, base, verticales=False, paso=5):
    """Madera a tablas: las juntas oscuras y una veta larga, sin motas."""
    r = tonos(base, 5, 0.24, 0.42)
    L.poner(m, r[1])
    ys, xs = np.where(m)
    if not len(ys):
        return
    if verticales:
        for x in range(int(xs.min()) + paso - 1, int(xs.max()) + 1, paso):
            L.poner(L.rect(x, ys.min(), x + 1, ys.max() + 1) & m, r[3])
            L.poner(L.rect(x + 1, ys.min(), x + 2, ys.max() + 1) & m, r[0])
    else:
        for y in range(int(ys.min()) + paso - 1, int(ys.max()) + 1, paso):
            L.poner(L.rect(xs.min(), y, xs.max() + 1, y + 1) & m, r[3])
            L.poner(L.rect(xs.min(), y + 1, xs.max() + 1, y + 2) & m, r[0])


def _sillares(L, m, base, rng, alto=6, ancho=9):
    """Piedra en hiladas: bloques desiguales con la cabeza clara y el pie oscuro."""
    r = tonos(base, 6, 0.2, 0.4)
    ys, xs = np.where(m)
    if not len(ys):
        return
    y = int(ys.min())
    fila = 0
    while y <= ys.max():
        x = int(xs.min()) - (ancho // 2 if fila % 2 else 0)
        while x <= xs.max():
            w = ancho + rng.randint(-2, 2)
            b = L.rect(x, y, x + w, y + alto) & m
            tono = rng.choice([1, 1, 2, 2, 3])
            L.poner(b, r[tono])
            L.poner(L.rect(x, y, x + w - 1, y + 1) & m, r[max(0, tono - 1)])
            L.poner(L.rect(x, y + alto - 1, x + w, y + alto) & m, r[5])
            L.poner(L.rect(x + w - 1, y, x + w, y + alto) & m, r[5])
            x += w
        y += alto
        fila += 1


def _tejadillo(L, x0, x1, cima, base_y, cfg, rng, alero=2):
    """Un tejado de dos aguas pequeño visto de frente."""
    cx = (x0 + x1) / 2.0
    m = L.poli([(x0 - alero, base_y), (cx, cima), (x1 + alero, base_y)])
    faldon(L, m, TEJADOS[cfg], rng)
    return m


def obra(tipo, rng):
    if tipo == 'pozo':
        L = Lamina(42, 52)
        cuerpo = L.rect(6, 32, 36, 46) | _e(L, 21, 45, 15, 5)
        _sillares(L, cuerpo, PIEDRA, rng, alto=5, ancho=8)
        L.poner(_e(L, 21, 32, 15.5, 6.5), tonos(PIEDRA)[0])
        L.poner(_e(L, 21, 32, 11.5, 4.3), tonos(AGUA_OBRA)[3])
        L.poner(_e(L, 19, 31.5, 7, 2.2), tonos(AGUA_OBRA)[1])
        for x in (6, 33):
            _tablones(L, L.rect(x, 12, x + 3, 34), MADERA, verticales=True, paso=9)
        L.poner(L.rect(7, 19, 35, 21), tonos(MADERA)[3])
        L.poner(L.rect(20, 20, 21, 26), '#d9cfae')
        L.pegar(_cubo_chico(), 16, 25)
        _tejadillo(L, 4, 38, 2, 15, 'teja_roja', rng)
    elif tipo == 'fuente':
        L = Lamina(62, 56)
        P = tonos('#b6b1a8', 5, 0.18, 0.36)
        lado = L.rect(3, 38, 59, 46) | _e(L, 31, 46, 28, 9)
        L.poner(lado, P[2])
        L.poner(lado & L.rect(3, 38, 18, 56), P[1])
        L.poner(lado & L.rect(44, 38, 59, 56), P[3])
        L.poner(_e(L, 31, 38, 28, 11), P[0])
        agua = _e(L, 31, 38, 23.5, 8.2)
        A_ = tonos(AGUA_OBRA, 4, 0.22, 0.3)
        L.poner(agua, A_[1])
        L.poner(_e(L, 26, 36, 14, 3.6) & agua, A_[0])
        L.poner(L.trazo([(38, 42), (48, 40)], 1) & agua, A_[0])
        L.poner(L.rect(27, 18, 35, 38), P[2])
        L.poner(L.rect(27, 18, 30, 38), P[0])
        L.poner(L.rect(33, 18, 35, 38), P[3])
        L.poner(_e(L, 31, 38, 6.5, 2.6), A_[2])
        L.poner(_e(L, 31, 21, 13, 4), P[3])
        L.poner(_e(L, 31, 19, 13, 4), P[0])
        L.poner(_e(L, 31, 19, 10, 2.7), A_[1])
        L.poner(L.rect(29, 7, 33, 19), P[1])
        L.poner(_e(L, 31, 6, 3.5, 3.5), P[0])
        # El agua que cae: dos cortinas anchas, no gotas.
        for x0, x1 in ((19, 12), (43, 50)):
            L.poner(L.trazo([(x0, 20), (x1, 26), (x1 + (1 if x1 > 31 else -1), 37)], 2), A_[0])
    elif tipo == 'banco':
        L = Lamina(44, 26)
        for x in (5, 36):
            L.poner(L.rect(x, 3, x + 3, 25), HIERRO)
        _tablones(L, L.rect(2, 4, 42, 13), MADERA, paso=4)
        asiento = L.rect(2, 14, 42, 19)
        L.poner(asiento, tonos(MADERA)[0])
        L.poner(L.rect(2, 18, 42, 21), tonos(MADERA)[3])
        L.poner(L.trazo([(2, 16), (41, 16)], 1), tonos(MADERA)[2])
    elif tipo == 'parterre':
        L = Lamina(46, 26)
        marco = L.rect(2, 8, 44, 24)
        _tablones(L, marco, '#7a5a3a', verticales=False, paso=16)
        L.poner(L.rect(4, 8, 42, 18), '#4a3423')
        L.poner(L.rect(4, 8, 42, 10), '#5b412c')
        cols = ['#d9475f', '#f0c040', '#e87f3a', '#c95fb0', '#f4f0e6', '#d9475f', '#f0c040']
        for i, x in enumerate(range(6, 42, 5)):
            alto_ = 9 + (i % 2) * 3
            L.poner(L.rect(x, 17 - alto_, x + 1, 18), '#4f8f45')
            L.poner(L.poli([(x, 16), (x - 2, 12), (x, 14)]), '#5f9f50')
            L.poner(L.poli([(x + 1, 16), (x + 3, 12), (x + 1, 14)]), '#4f8f45')
            c = tonos(cols[i % len(cols)], 3, 0.2, 0.3)
            y = 17 - alto_
            L.poner(L.poli([(x - 2, y - 3), (x, y - 1), (x + 1, y - 4), (x + 2, y - 1), (x + 3, y - 3), (x + 3, y + 1), (x - 2, y + 1)]), c[1])
            L.poner(L.rect(x - 1, y - 1, x + 1, y + 1), c[0])
    elif tipo == 'farol':
        L = Lamina(20, 58)
        H_ = tonos(HIERRO, 4, 0.3, 0.3)
        L.poner(L.rect(9, 14, 12, 52), H_[1])
        L.poner(L.rect(9, 14, 10, 52), H_[0])
        L.poner(L.rect(6, 52, 15, 56), H_[2])
        L.poner(L.rect(7, 50, 14, 52), H_[1])
        L.poner(L.rect(7, 24, 14, 25), H_[2])
        vidrio = L.poli([(6, 6), (15, 6), (16, 15), (5, 15)])
        L.poner(vidrio, '#f4d470')
        L.poner(L.poli([(7, 7), (10, 7), (9, 14), (6, 14)]), '#fff2b8')
        L.poner(L.rect(10, 6, 11, 15), H_[1])
        L.poner(L.rect(4, 15, 17, 16), H_[1])
        L.poner(L.poli([(4, 6), (10.5, 1), (17, 6)]), H_[1])
    elif tipo == 'heno':
        L = Lamina(42, 38)
        m = _e(L, 21, 22, 19, 15) | L.rect(2, 22, 41, 34) | _e(L, 21, 33, 19, 3)
        _paja(L, m, '#c8a14e', rng)
        v = np.clip(luz_de(m, 12.0), 0, 1)
        L.poner(m & (v < 0.42), tonos('#c8a14e')[3])
        for y in (17, 27):
            L.poner(L.trazo([(3, y + 3), (21, y), (40, y + 3)], 1) & m, '#7a5a2f')
    elif tipo == 'caseta':
        L = Lamina(42, 40)
        frente = L.rect(5, 18, 37, 38)
        pared(L, frente, MUROS['tablas_rojo'], rng, VIGAS[1])
        hueco = L.rect(14, 26, 28, 38) | _e(L, 21, 26, 7, 6)
        L.poner(hueco, '#241915')
        L.poner(borde(hueco) & (L.yy < 37), '#6b2f27')
        _tejadillo(L, 5, 37, 4, 20, 'pizarra_morada', rng, alero=3)
        L.poner(L.rect(16, 14, 26, 18), '#e7d8b2')
        L.poner(L.rect(18, 15, 24, 16), '#7a5a3a')
    elif tipo == 'pajarera':
        L = Lamina(22, 52)
        L.poner(L.rect(9, 24, 13, 51), tonos(MADERA)[2])
        L.poner(L.rect(9, 24, 10, 51), tonos(MADERA)[0])
        L.poner(L.rect(6, 49, 16, 51), tonos(MADERA)[3])
        caja = L.rect(4, 11, 18, 26)
        pared(L, caja, MUROS['tablas_azul'], rng, VIGAS[1])
        L.poner(_e(L, 11, 17, 3, 3), '#1d1a1e')
        L.poner(L.rect(9, 22, 13, 23), tonos(MADERA)[0])
        _tejadillo(L, 4, 18, 2, 13, 'teja_naranja', rng, alero=2)
    elif tipo == 'colmena':
        L = Lamina(28, 34)
        pata = L.rect(4, 26, 7, 33) | L.rect(21, 26, 24, 33)
        L.poner(pata, tonos(MADERA)[3])
        L.poner(L.rect(2, 24, 26, 28), tonos(MADERA)[1])
        L.poner(L.rect(2, 27, 26, 28), tonos(MADERA)[3])
        m = _e(L, 14, 14, 11, 11) & (L.yy < 25)
        P_ = tonos('#d0a34a', 5, 0.24, 0.42)
        v = luz_de(m, 9.0)
        for k, y in enumerate(range(3, 25, 4)):
            b = L.rect(0, y, 28, y + 4) & m
            for j in range(5):
                L.poner(b & ((v * 5).astype(int) == (4 - j)), P_[j])
            L.poner(L.rect(0, y + 3, 28, y + 4) & m, P_[4])
        L.poner(_e(L, 14, 21, 3.4, 3), '#2a1d12')
    elif tipo == 'puesto':
        L = Lamina(64, 56)
        for x in (5, 56):
            L.poner(L.rect(x, 12, x + 3, 54), tonos(MADERA)[2])
            L.poner(L.rect(x, 12, x + 1, 54), tonos(MADERA)[0])
        mostrador = L.rect(4, 36, 60, 54)
        _tablones(L, mostrador, MADERA, verticales=True, paso=7)
        L.poner(L.rect(2, 32, 62, 37), tonos(MADERA)[0])
        L.poner(L.rect(2, 36, 62, 38), tonos(MADERA)[3])
        # Lo que se vende, en cajas: formas grandes.
        for i, (x, c) in enumerate(((9, '#d9543f'), (24, '#e8a23a'), (39, '#7fa84a'))):
            L.poner(L.rect(x, 24, x + 13, 32), tonos(MADERA)[2])
            L.poner(L.rect(x, 24, x + 13, 25), tonos(MADERA)[0])
            monton = _e(L, x + 6.5, 24, 6.5, 4)
            volumen(L, monton, tonos(c, 4, 0.24, 0.3), radio=4.0)
        # El toldo a rayas: la lona cae hacia delante.
        toldo = L.poli([(10, 2), (54, 2), (62, 16), (2, 16)])
        ancho_raya = 9.0
        for k in range(7):
            xa, xb = 2 + k * 60 / 7.0, 2 + (k + 1) * 60 / 7.0
            ta, tb = 10 + k * 44 / 7.0, 10 + (k + 1) * 44 / 7.0
            raya = L.poli([(ta, 2), (tb, 2), (xb, 16), (xa, 16)])
            L.poner(raya & toldo, '#c8423a' if k % 2 == 0 else '#f0e6cf')
        for k in range(7):
            xa, xb = 2 + k * 60 / 7.0, 2 + (k + 1) * 60 / 7.0
            c = '#9a2f2a' if k % 2 == 0 else '#d0c4a6'
            L.poner(L.poli([(xa, 16), (xb, 16), (xb, 18), ((xa + xb) / 2.0, 20), (xa, 18)]), c)
        ancho_raya = None
    elif tipo == 'cenador':
        L = Lamina(80, 88)
        P = tonos('#d8d2c2', 5, 0.14, 0.34)
        suelo = _e(L, 40, 72, 37, 13)
        L.poner(L.rect(3, 72, 77, 77) | _e(L, 40, 77, 37, 10), P[3])
        L.poner(suelo, P[1])
        L.poner(_e(L, 34, 68, 22, 6), P[0])
        # Columnas de atrás, barandilla y columnas de delante.
        for x in (18, 62):
            L.poner(L.rect(x, 34, x + 4, 62), P[3])
        L.poner(L.rect(19, 56, 62, 58), P[2])
        for x, y in ((7, 76), (34, 83), (46, 83), (73, 76)):
            L.poner(L.rect(x - 2, 30, x + 3, y), P[2])
            L.poner(L.rect(x - 2, 30, x, y), P[0])
            L.poner(L.rect(x + 2, 30, x + 3, y), P[3])
        for (a, b) in (((7, 64), (34, 72)), ((46, 72), (73, 64))):
            L.poner(L.trazo([a, b], 2), P[1])
        # El tejado de ocho aguas: tres paños y el remate.
        izq = L.poli([(1, 34), (28, 40), (40, 8), (20, 18)])
        cen = L.poli([(28, 40), (52, 40), (40, 8)])
        der = L.poli([(79, 34), (52, 40), (40, 8), (60, 18)])
        faldon(L, izq, TEJADOS['teja_turquesa'], rng)
        faldon(L, cen, TEJADOS['teja_turquesa'], rng, sombra=1)
        faldon(L, der, TEJADOS['teja_turquesa'], rng, sombra=2)
        L.poner(L.trazo([(1, 34), (28, 40), (52, 40), (79, 34)], 2), tonos(TEJADOS['teja_turquesa']['base'])[4])
        L.poner(L.rect(38, 3, 42, 10), P[1])
        L.poner(_e(L, 40, 3, 3, 3), '#c9a23f')
    elif tipo == 'estatua':
        L = Lamina(32, 64)
        pie = L.rect(4, 46, 28, 62)
        _sillares(L, pie, PIEDRA, rng, alto=8, ancho=12)
        L.poner(L.rect(2, 44, 30, 47), tonos(PIEDRA)[0])
        L.poner(L.rect(2, 46, 30, 47), tonos(PIEDRA)[3])
        S = tonos('#a9b0a4', 5, 0.2, 0.4)
        fig = (L.capsula(16, 22, 5.2, 16, 36, 4.2) | L.poli([(10, 32), (22, 32), (24, 44), (8, 44)]) | _e(L, 16, 12, 4.4, 5) |
               L.capsula(11, 20, 1.8, 7, 28, 1.6) | L.capsula(21, 20, 1.8, 24, 12, 1.6))
        volumen(L, fig, S, radio=4.0)
        espada = L.poli([(23.5, 13), (25.5, 13), (25.5, 2), (24.5, 0), (23.5, 2)])
        L.poner(espada, S[0])
        L.poner(L.rect(22, 12, 27, 13), S[3])
    elif tipo == 'buzon':
        L = Lamina(20, 34)
        L.poner(L.rect(8, 14, 12, 33), tonos(MADERA)[2])
        L.poner(L.rect(8, 14, 9, 33), tonos(MADERA)[0])
        m = L.rect(2, 7, 16, 16) | _e(L, 9, 7, 7, 4)
        volumen(L, m, tonos('#4f7fa8', 5, 0.24, 0.36), radio=3.0)
        L.poner(L.rect(4, 11, 11, 12), '#223a52')
        L.poner(L.rect(16, 4, 18, 13), '#c8423a')
        L.poner(L.rect(16, 4, 19, 8), '#e0574a')
    elif tipo == 'valla':
        L = Lamina(34, 24)
        B_ = tonos('#e8e2d2', 5, 0.08, 0.34)
        L.poner(L.rect(1, 9, 33, 12), B_[2])
        L.poner(L.rect(1, 16, 33, 19), B_[2])
        for x in range(2, 31, 8):
            pk = L.poli([(x, 5), (x + 2.5, 1), (x + 5, 5), (x + 5, 23), (x, 23)])
            L.poner(pk, B_[1])
            L.poner(L.rect(x, 3, x + 2, 23) & pk, B_[0])
            L.poner(L.rect(x + 4, 3, x + 5, 23) & pk, B_[3])
    elif tipo == 'muro':
        L = Lamina(34, 28)
        m = L.rect(1, 8, 33, 27)
        _sillares(L, m, PIEDRA, rng, alto=6, ancho=9)
        tapa = L.rect(1, 2, 33, 8)
        L.poner(tapa, tonos(PIEDRA)[0])
        L.poner(L.rect(1, 7, 33, 9), tonos(PIEDRA)[3])
        L.poner(L.trazo([(12, 3), (12, 7)], 1), tonos(PIEDRA)[2])
        L.poner(L.trazo([(24, 3), (24, 7)], 1), tonos(PIEDRA)[2])
    elif tipo == 'abrevadero':
        L = Lamina(46, 26)
        frente = L.rect(3, 12, 43, 22)
        _tablones(L, frente, MADERA, paso=5)
        tapa = L.rect(3, 4, 43, 13)
        L.poner(tapa, tonos(MADERA)[1])
        agua = L.rect(6, 6, 40, 12)
        A_ = tonos(AGUA_OBRA, 4, 0.22, 0.3)
        L.poner(agua, A_[1])
        L.poner(L.rect(6, 6, 24, 8), A_[0])
        L.poner(L.trazo([(26, 10), (37, 10)], 1), A_[0])
        for x in (5, 37):
            L.poner(L.rect(x, 21, x + 4, 25), tonos(MADERA)[3])
    elif tipo == 'hoguera':
        L = Lamina(30, 28)
        for a, b in (((5, 24), (25, 17)), ((5, 17), (25, 24))):
            m = L.capsula(a[0], a[1], 2.2, b[0], b[1], 2.2)
            volumen(L, m, tonos('#6b4a30', 4, 0.26, 0.36), radio=2.0)
        llama = L.poli([(15, 1), (20, 8), (23, 13), (22, 19), (15, 22), (8, 19), (7, 13), (11, 9)])
        volumen(L, llama, tonos('#ee7a2a', 4, 0.26, 0.26), radio=4.0)
        L.poner(L.poli([(15, 8), (18, 13), (18, 18), (15, 21), (12, 18), (12, 13)]), '#ffd166')
        L.poner(L.poli([(15, 13), (16.5, 16), (15, 20), (13.5, 16)]), '#fff2b8')
        P = tonos(PIEDRA, 4, 0.2, 0.3)
        for x, y, rx in ((4, 22, 3.4), (10, 25, 3.4), (20, 25, 3.4), (26, 22, 3.4)):
            volumen(L, _e(L, x, y, rx, 2.6), P, radio=2.0)
    elif tipo == 'lena':
        L = Lamina(42, 28)
        C = tonos('#7a5335', 5, 0.24, 0.4)
        Cara = tonos('#c9a26a', 3, 0.14, 0.24)
        def tronco(x0, x1, y, r=4.4):
            m = L.capsula(x0, y, r, x1, y, r)
            volumen(L, m, C, radio=3.0)
            L.poner(L.trazo([(x0 + 2, y - 1), (x1 - 4, y - 1)], 1) & m, C[0])
            L.poner(_e(L, x1 + 1, y, r - 1.2, r), Cara[1])
            L.poner(_e(L, x1 + 0.6, y - 0.6, r - 2.2, r - 1.6), Cara[0])
        for fila in ((4, 22), (4, 13.5)):
            pass
        tronco(6, 33, 22.5)
        tronco(10, 29, 14.5)
        tronco(14, 25, 6.5)
    elif tipo == 'poste_senal':
        L = Lamina(28, 44)
        L.poner(L.rect(12, 4, 16, 43), tonos(MADERA)[2])
        L.poner(L.rect(12, 4, 13, 43), tonos(MADERA)[0])
        L.poner(L.rect(10, 41, 18, 43), tonos(MADERA)[3])
        a = L.poli([(5, 7), (22, 7), (27, 11), (22, 15), (5, 15)])
        L.poner(a, tonos('#b98a58')[1])
        L.poner(L.rect(5, 7, 22, 9) & a, tonos('#b98a58')[0])
        L.poner(L.rect(8, 11, 20, 12), tonos('#b98a58')[4])
        b = L.poli([(23, 19), (6, 19), (1, 23), (6, 27), (23, 27)])
        L.poner(b, tonos('#a97a4a')[1])
        L.poner(L.rect(6, 19, 23, 21) & b, tonos('#a97a4a')[0])
        L.poner(L.rect(8, 23, 20, 24), tonos('#a97a4a')[4])
    elif tipo == 'invernadero':
        L = Lamina(94, 92)
        marco = '#eef0ea'
        marco2 = '#b9bfb8'
        V = tonos('#a8dbe6', 4, 0.12, 0.26)
        # El muro bajo de ladrillo y el frente de cristal.
        pared(L, L.rect(6, 74, 88, 90), MUROS['ladrillo'], rng, VIGAS[1])
        frente = L.rect(6, 46, 88, 74)
        L.poner(frente, V[1])
        # Dentro se ven las plantas: bandas de verde, sin hojas sueltas.
        L.poner(L.rect(6, 64, 88, 74), '#5f9450')
        L.poner(L.rect(6, 60, 88, 64), '#7fb065')
        for x in range(12, 84, 16):
            L.poner(_e(L, x, 60, 7, 5), '#7fb065')
        for x0, x1 in ((14, 30), (50, 62)):
            L.poner(L.poli([(x0, 46), (x0 + 6, 46), (x1 + 6, 74), (x1, 74)]) & frente, V[0])
        for x in range(6, 89, 16):
            L.poner(L.rect(x, 46, x + 2, 74), marco)
        L.poner(L.rect(6, 72, 88, 75), marco)
        # La puerta.
        puerta_ = L.rect(39, 54, 55, 90)
        L.poner(puerta_, V[2])
        L.poner(L.poli([(41, 54), (45, 54), (51, 88), (47, 88)]) & puerta_, V[0])
        L.poner(borde(puerta_), marco)
        L.poner(L.rect(39, 54, 55, 56), marco)
        L.poner(L.rect(47, 54, 48, 90), marco)
        L.poner(L.rect(50, 72, 53, 74), '#c9a23f')
        # El tejado de cristal, dos aguas, con su caballete.
        techo = L.poli([(2, 48), (47, 4), (92, 48)])
        L.poner(techo, V[1])
        L.poner(L.poli([(14, 36), (30, 20), (42, 20), (28, 36)]) & techo, V[0])
        L.poner(L.poli([(58, 36), (66, 28), (74, 36)]) & techo, V[0])
        L.poner(L.poli([(47, 4), (92, 48), (70, 48)]) & techo, V[2])
        L.poner(L.poli([(50, 16), (56, 24), (56, 32)]) & techo, V[1])
        for t in (0.25, 0.5, 0.75):
            xa, ya = 2 + 45 * t, 48 - 44 * t
            xb, yb = 92 - 45 * t, 48 - 44 * t
            L.poner(L.trazo([(xa, ya), (xb, yb)], 2) & techo, marco)
        for x in range(10, 90, 14):
            L.poner(L.trazo([(x, 48), (47 + (x - 47) * 0.1, 8)], 1) & techo, marco)
        L.poner(L.trazo([(2, 48), (47, 4), (92, 48)], 3), marco)
        L.poner(L.trazo([(47, 4), (92, 48)], 1), marco2)
        L.poner(L.rect(2, 47, 92, 50), marco)
        L.poner(L.rect(2, 49, 92, 50), marco2)
    else:
        raise ValueError(tipo)
    contornear(L, (48, 36, 34))
    return L.imagen()


def _cubo_chico():
    L = Lamina(10, 10)
    m = L.poli([(1, 1), (9, 1), (8, 9), (2, 9)])
    _tablones(L, m, '#7a5a3a', verticales=True, paso=3)
    L.poner(L.rect(1, 3, 9, 4), HIERRO)
    L.poner(L.rect(2, 7, 8, 8), HIERRO)
    return L


# ══════════════════════════════════════════════
#  LAS MASCOTAS
# ══════════════════════════════════════════════
# Del tamaño del perro del juego (38x32 de cuerpo): cabeza grande, patas cortas. De lado, mirando a
# la derecha (el juego voltea el dibujo para la izquierda). Las marcas son bandas y antifaces, sin motas.
MASCOTAS = {
    #               largo alto pata cabeza orejas    cola      extra
    'puppy':     dict(l=8.5, a=6.5, p=5, r=7.0, o='caida', c='corta'),
    'kitten':    dict(l=8.0, a=5.5, p=5, r=6.8, o='punta', c='larga'),
    'bunny':     dict(l=7.5, a=6.5, p=4, r=6.5, o='conejo', c='bola'),
    'fox':       dict(l=8.5, a=5.5, p=5, r=6.6, o='punta', c='peluda', mascara='zorro'),
    'raccoon':   dict(l=8.5, a=6.0, p=4, r=6.8, o='redonda', c='anillos', mascara='antifaz'),
    'redpanda':  dict(l=8.5, a=6.0, p=4, r=6.8, o='redonda', c='anillos', mascara='mejillas'),
    'otter':     dict(l=11.0, a=5.0, p=3, r=5.8, o='chica', c='larga', mascara='hocico'),
    'ferret':    dict(l=11.5, a=4.5, p=3, r=5.2, o='chica', c='larga', mascara='antifaz'),
    'piglet':    dict(l=8.5, a=6.5, p=3, r=6.5, o='punta', c='rizada', hocico='cerdo'),
    'lamb':      dict(l=8.0, a=7.0, p=5, r=5.8, o='caida', c='bola', lana=True),
    'kid':       dict(l=8.0, a=6.0, p=6, r=5.8, o='caida', c='corta', cuernos=True),
    'fawn':      dict(l=8.5, a=5.5, p=7, r=5.8, o='punta', c='corta', franja=True),
    'tigercub':  dict(l=8.5, a=6.0, p=4, r=6.8, o='redonda', c='larga', rayas=True),
    'wolfpup':   dict(l=8.5, a=5.5, p=5, r=6.5, o='punta', c='peluda', mascara='hocico'),
    'bearcub':   dict(l=8.5, a=7.0, p=4, r=7.0, o='redonda', c='corta', mascara='hocico'),
    'pandacub':  dict(l=8.5, a=7.0, p=4, r=7.0, o='redonda', c='corta', mascara='ojeras'),
    'hamster':   dict(l=7.0, a=6.5, p=2, r=6.2, o='redonda', c='corta', mascara='hocico'),
    'chick':     dict(l=6.0, a=6.5, p=4, r=5.2, o=None, c='ala', ave=True),
    'penguin':   dict(l=5.5, a=8.5, p=3, r=5.2, o=None, c='ala', ave=True, mascara='pechera'),
    'dragonling': dict(l=9.0, a=5.5, p=4, r=6.2, o='punta', c='reptil', alas=True, cuernos=True),
}
# Cinco pelajes por especie: (nombre, pelo, marca).
COLORES_MASCOTA = {
    'puppy': [('Golden', '#d4a657', '#8a5a2a'), ('Choco', '#6e4630', '#2e1c12'), ('Snowy', '#e8e4da', '#b5a890'), ('Spotless Black', '#3a3638', '#17151a'), ('Ginger', '#c87a3a', '#f0dcc0')],
    'kitten': [('Ginger', '#d58a3e', '#a55a20'), ('Grey', '#8b8d94', '#55575f'), ('Cream', '#e6d6b8', '#b09468'), ('Midnight', '#3a3640', '#6a6470'), ('Lilac', '#b9a8c9', '#7f6a96')],
    'bunny': [('White', '#ece8e0', '#d9a0a8'), ('Cocoa', '#8a6448', '#d9b49a'), ('Grey', '#9a9aa0', '#d8d8dc'), ('Honey', '#d4ad6a', '#f0e0bc'), ('Blue', '#8fa6c4', '#dbe4f0')],
    'fox': [('Red', '#d0682a', '#f4ead8'), ('Arctic', '#e4e8ec', '#a8b4c0'), ('Silver', '#7c7f88', '#d8dade'), ('Desert', '#dcae6a', '#f6ead0'), ('Shadow', '#4a3f46', '#c9c0c4')],
    'raccoon': [('Forest', '#8a8378', '#2e2a28'), ('Silver', '#a6a6aa', '#3a3a40'), ('Rust', '#a2704a', '#3a241a'), ('Sand', '#c4ae88', '#4a3a28'), ('Dusk', '#6a6478', '#26222e')],
    'redpanda': [('Ember', '#c0562a', '#f2e6d4'), ('Maple', '#a2452a', '#ecdcc4'), ('Amber', '#d48a3a', '#f6ecd8'), ('Berry', '#963a4a', '#f0d8d8'), ('Moss', '#7a7a3a', '#ece8c8')],
    'otter': [('River', '#7a5a40', '#d9c0a0'), ('Dark', '#4e3c30', '#b5a08a'), ('Sea', '#6a6a70', '#d0d0d4'), ('Gold', '#b08a50', '#ecdcb4'), ('Rust', '#8e5a38', '#e0c4a4')],
    'ferret': [('Sable', '#7a6450', '#2e241c'), ('Albino', '#ece4d4', '#c4b49c'), ('Silver', '#9c9ca2', '#4a4a50'), ('Cinnamon', '#a8703e', '#4a2c18'), ('Champagne', '#d4bc94', '#8e7450')],
    'piglet': [('Pink', '#eab0a8', '#c97f7a'), ('Spotless Tan', '#d4a67a', '#a8784c'), ('Black', '#4a4246', '#7a6a70'), ('Rose', '#d98a94', '#a85a68'), ('Cream', '#ecdcc0', '#c4a680')],
    'lamb': [('White', '#efece4', '#5a4a44'), ('Cream', '#e6d8b8', '#6a543e'), ('Black', '#4c4648', '#2a2628'), ('Rose', '#e8c8c8', '#7a5a5e'), ('Sky', '#c8d8e6', '#4e5e72')],
    'kid': [('White', '#e8e4d8', '#b5a890'), ('Brown', '#8a6448', '#3e2a1e'), ('Black', '#3e3a3c', '#8a8488'), ('Tan', '#c49a68', '#7a5a38'), ('Grey', '#94928c', '#4e4c48')],
    'fawn': [('Spring', '#c08a50', '#f0e0c0'), ('Autumn', '#a0562e', '#ecd4b4'), ('Snow', '#e4e0d8', '#a89a86'), ('Dusk', '#8a6a7a', '#e4d4dc'), ('Ash', '#8e8a84', '#dcd8d0')],
    'tigercub': [('Amber', '#e0902e', '#2e2420'), ('White', '#ece8e0', '#3a3640'), ('Gold', '#e6c04e', '#6a4620'), ('Smoke', '#9a9aa2', '#26262e'), ('Crimson', '#c8502e', '#2a1814')],
    'wolfpup': [('Grey', '#8c8e96', '#e4e4e8'), ('Snow', '#e4e8ec', '#a0aab4'), ('Black', '#3c3a40', '#a8a6ac'), ('Timber', '#8a6c4e', '#dcc8ac'), ('Dusk', '#6a6a86', '#d0d0e0')],
    'bearcub': [('Brown', '#7a5236', '#d4b48c'), ('Honey', '#c0863e', '#f0dcb4'), ('Black', '#35312f', '#a8947c'), ('Polar', '#ece9e0', '#c8c2b4'), ('Cinnamon', '#a2582e', '#e8c8a0')],
    'pandacub': [('Classic', '#f0ece4', '#2c2a2e'), ('Brown', '#ecdcc8', '#6a4a34'), ('Rosy', '#f4e0e0', '#7a3a4a'), ('Moon', '#e0e4ec', '#34405a'), ('Sage', '#e8ecdc', '#3e5238')],
    'hamster': [('Honey', '#dcae6a', '#f6ead0'), ('Grey', '#a0a0a6', '#e4e4e8'), ('Rose', '#e4b4a8', '#f8e8e0'), ('Cocoa', '#8e6446', '#d8c0a4'), ('Snowy', '#ece8e0', '#d0c8b8')],
    'chick': [('Yellow', '#f2d04e', '#e08a2e'), ('Cream', '#efe2b4', '#d8963a'), ('Rusty', '#c8843a', '#8a5a2a'), ('Mint', '#a8dcc0', '#e0963a'), ('Rose', '#efb4c0', '#e08a4a')],
    'penguin': [('Emperor', '#39404e', '#efe9dc'), ('Blue', '#3e5a80', '#efe9dc'), ('Brown', '#5e4a3c', '#efe0c8'), ('Ice', '#8ea6bc', '#f6f4ee'), ('Royal', '#4a3a6e', '#f0e8d8')],
    'dragonling': [('Emerald', '#4f9a5a', '#e8c86a'), ('Ruby', '#c8423a', '#f0c060'), ('Sapphire', '#3e74b4', '#d8e4f0'), ('Amethyst', '#7a4fa8', '#f0d0f0'), ('Obsidian', '#3a3640', '#ee7a3a')],
}
NOMBRES_MASCOTA = {'puppy': 'Puppy', 'kitten': 'Kitten', 'bunny': 'Bunny', 'fox': 'Fox Kit', 'raccoon': 'Raccoon', 'redpanda': 'Red Panda', 'otter': 'Otter', 'ferret': 'Ferret',
                   'piglet': 'Piglet', 'lamb': 'Lamb', 'kid': 'Goat Kid', 'fawn': 'Fawn', 'tigercub': 'Tiger Cub', 'wolfpup': 'Wolf Pup', 'bearcub': 'Bear Cub', 'pandacub': 'Panda Cub',
                   'hamster': 'Hamster', 'chick': 'Chick', 'penguin': 'Penguin Chick', 'dragonling': 'Dragonling'}


def _oreja(L, tipo, x, y, r_, cols, linea, interior=None):
    if tipo == 'punta':
        m = L.poli([(x - 2.6, y + 2), (x + 0.8, y - 5.5), (x + 3.0, y + 2)])
    elif tipo == 'redonda':
        m = _e(L, x, y - 1, 2.8, 2.8)
    elif tipo == 'chica':
        m = _e(L, x, y, 2.0, 1.8)
    elif tipo == 'caida':
        m = L.capsula(x, y, 2.2, x - 2.2, y + 5.5, 2.4)
    elif tipo == 'conejo':
        m = L.capsula(x, y, 1.7, x - 1.4, y - 9.5, 2.2)
    else:
        return
    volumen(L, m, cols, radio=2.0, linea=linea)
    if interior and tipo in ('punta', 'conejo'):
        L.poner(erosiona(erosiona(m)), interior)


def mascota_cuadro(especie, pelo, marca, fase, w=48, h=44, quieto=False):
    """De lado, mirando a la derecha. fase 0..1 del paso; `quieto`, sentado y respirando."""
    S = MASCOTAS[especie]
    L = Lamina(w, h)
    r = tonos(pelo, 5, 0.26, 0.44)
    osc = tonos(mezcla(pelo, '#141014', 0.3), 5, 0.2, 0.4)
    Mk = tonos(marca, 4, 0.2, 0.34)
    li = contorno(pelo)
    suelo = h - 2
    bob = math.sin(fase * math.pi * 4) * (0.25 if quieto else 0.5)
    cy = suelo - S['p'] - S['a'] * 0.72 + bob
    cx = w * 0.45
    Lc, Al, P = S['l'], S['a'], S['p']

    def pata(x, f, cols):
        a = 0.0 if quieto else math.sin((fase + f) * math.pi * 2) * 0.55
        alza = 0.0 if quieto else max(0.0, math.cos((fase + f) * math.pi * 2)) * P * 0.25
        m = L.capsula(x, cy + Al * 0.45, 2.3, x + math.sin(a) * P * 0.9, suelo - alza - 1, 1.8)
        volumen(L, m, cols, radio=2.0, linea=contorno(cols[2]))

    if S.get('ave'):
        # Las aves: dos patitas finas, cuerpo de pera y ala pegada.
        pat = tonos('#e0963a', 3, 0.2, 0.3)
        for x, f in ((cx - 2, 0.5), (cx + 2.5, 0.0)):
            a = 0.0 if quieto else math.sin((fase + f) * math.pi * 2) * 0.6
            pie = (x + math.sin(a) * 3, suelo - 1)
            L.poner(L.trazo([(x, cy + Al * 0.7), pie], 2), pat[1])
            L.poner(L.trazo([(pie[0] - 1, suelo - 1), (pie[0] + 3, suelo - 1)], 2), pat[1])
        cuerpo = _e(L, cx, cy, Lc + 1, Al)
        volumen(L, cuerpo, r, radio=5.0, linea=li)
        if S.get('mascara') == 'pechera':
            pe = _e(L, cx + 2.2, cy + 1.5, Lc * 0.68, Al * 0.72) & erosiona(cuerpo)
            L.poner(pe, Mk[0])
        ala = _e(L, cx - 2, cy + 0.5, 3.0, Al * 0.55, 0.25)
        volumen(L, ala, osc, radio=2.0, linea=li)
        hx_, hy_ = cx + 3.5, cy - Al - S['r'] * 0.45
    else:
        pata(cx + Lc * 0.62, 0.0, osc)
        pata(cx - Lc * 0.62, 0.5, osc)
        # la cola
        xc, yc = cx - Lc * 0.92, cy - Al * 0.25
        osc_c = math.sin(fase * math.pi * 2) * 1.2
        t = S['c']
        if t == 'corta':
            m = L.capsula(xc + 1, yc, 1.7, xc - 3, yc - 2.5 + osc_c * 0.4, 1.3)
            volumen(L, m, r, radio=2.0, linea=li)
        elif t == 'larga':
            m = L.capsula(xc + 1, yc, 1.6, xc - 5, yc - 1, 1.3) | L.capsula(xc - 5, yc - 1, 1.3, xc - 8, yc - 6 + osc_c, 1.2)
            volumen(L, m, r, radio=1.8, linea=li)
        elif t == 'peluda':
            m = L.capsula(xc + 1, yc, 1.8, xc - 5, yc - 1.5, 3.0) | L.capsula(xc - 5, yc - 1.5, 3.0, xc - 9.5, yc - 4 + osc_c, 1.5)
            volumen(L, m, r, radio=2.5, linea=li)
            L.poner(_e(L, xc - 9, yc - 4 + osc_c, 2.4, 2.0) & m, Mk[0])
        elif t == 'anillos':
            m = L.capsula(xc + 1, yc, 2.2, xc - 5, yc - 2, 2.9) | L.capsula(xc - 5, yc - 2, 2.9, xc - 9, yc - 6 + osc_c, 2.2)
            volumen(L, m, r, radio=2.5, linea=li)
            for dx_ in (2.5, 6.0):
                L.poner(L.trazo([(xc - dx_ - 1, yc - dx_ - 1), (xc - dx_ + 2, yc - dx_ + 3)], 2) & erosiona(m), Mk[1])
        elif t == 'bola':
            m = _e(L, xc - 0.5, yc - 1, 3.0, 3.0)
            volumen(L, m, Mk, radio=2.5, linea=contorno(marca))
        elif t == 'rizada':
            m = L.trazo([(xc + 1, yc), (xc - 2, yc - 3), (xc - 4, yc - 1), (xc - 2.5, yc + 1)], 2)
            L.poner(dilata(m) & ~L.opaco(), li)
            L.poner(m, r[1])
        elif t == 'reptil':
            m = L.capsula(xc + 2, yc + 1, 2.6, xc - 6, yc + 2.5, 1.7) | L.capsula(xc - 6, yc + 2.5, 1.7, xc - 11, yc + osc_c, 0.8)
            volumen(L, m, r, radio=2.0, linea=li)
        if S.get('alas'):
            al = L.poli([(cx - 2, cy - Al * 0.5), (cx - 9, cy - Al - 6), (cx - 11, cy - Al - 1), (cx - 8, cy - Al + 2), (cx - 5, cy - Al + 3)])
            volumen(L, al, Mk, radio=2.0, linea=contorno(marca))
        cuerpo = _e(L, cx, cy, Lc, Al)
        if S.get('lana'):
            for dx_, dy_ in ((-5, -2), (0, -3.5), (5, -2), (-5.5, 2), (5.5, 2)):
                cuerpo |= _e(L, cx + dx_, cy + dy_, 3.8, 3.4)
        volumen(L, cuerpo, r, radio=5.0, linea=li)
        if not S.get('lana'):
            vi = _e(L, cx + 1, cy + Al * 0.72, Lc * 0.72, Al * 0.36) & erosiona(cuerpo)
            L.poner(vi, mezcla(r[0], marca, 0.3) if S.get('mascara') in ('zorro', 'hocico', 'mejillas') else r[0])
        if S.get('rayas'):
            for i, x in enumerate((cx - 6, cx - 2, cx + 2, cx + 6)):
                L.poner(L.trazo([(x, cy - Al + 1), (x - 1, cy + (0 if i % 2 else 1.5))], 2) & erosiona(cuerpo), Mk[1])
        if S.get('franja'):
            L.poner(L.trazo([(cx - Lc + 2, cy - Al * 0.4), (cx + Lc - 3, cy - Al * 0.4)], 1) & erosiona(cuerpo), Mk[0])
        pata(cx + Lc * 0.45, 0.5, r)
        pata(cx - Lc * 0.78, 0.0, r)
        hx_, hy_ = cx + Lc * 0.85, cy - Al * 0.55 - S['r'] * 0.55

    # La cabeza: grande y redonda, un poco por delante del cuerpo.
    Rc = S['r']
    hy_ += bob * 0.3
    if S.get('o'):
        _oreja(L, S['o'], hx_ - Rc * 0.72, hy_ - Rc * 0.62, Rc, osc, li, Mk[0] if S['o'] == 'conejo' else None)
    cabeza = _e(L, hx_, hy_, Rc * 1.05, Rc)
    if S.get('lana'):
        cabeza = _e(L, hx_, hy_ + 0.5, Rc * 0.92, Rc * 0.95)
        lanas = _e(L, hx_ - 1, hy_ - Rc * 0.8, Rc * 0.7, Rc * 0.45)
    volumen(L, cabeza, r, radio=4.0, linea=li)
    if S.get('lana'):
        volumen(L, lanas, r, radio=2.5, linea=li)
    if S.get('o'):
        _oreja(L, S['o'], hx_ + Rc * 0.18, hy_ - Rc * 0.82, Rc, r, li, Mk[0] if S['o'] == 'conejo' else None)
    dentro = erosiona(cabeza)
    masc = S.get('mascara')
    if masc == 'zorro':
        L.poner(_e(L, hx_ + Rc * 0.45, hy_ + Rc * 0.5, Rc * 0.75, Rc * 0.55) & dentro, Mk[0])
    elif masc == 'antifaz':
        L.poner(L.trazo([(hx_ - Rc * 0.7, hy_ - 1), (hx_ + Rc * 0.8, hy_ - 1)], 3) & dentro, Mk[1])
        L.poner(_e(L, hx_ + Rc * 0.45, hy_ + Rc * 0.55, Rc * 0.55, Rc * 0.38) & dentro, r[0])
    elif masc == 'mejillas':
        L.poner(_e(L, hx_ + Rc * 0.45, hy_ + Rc * 0.45, Rc * 0.62, Rc * 0.5) & dentro, Mk[0])
        L.poner(_e(L, hx_ + Rc * 0.45, hy_ - Rc * 0.5, Rc * 0.38, Rc * 0.26) & dentro, Mk[0])
    elif masc == 'hocico':
        L.poner(_e(L, hx_ + Rc * 0.5, hy_ + Rc * 0.45, Rc * 0.6, Rc * 0.45) & dentro, Mk[0])
    elif masc == 'ojeras':
        L.poner(_e(L, hx_ + Rc * 0.32, hy_ - Rc * 0.05, Rc * 0.42, Rc * 0.42, -0.5) & dentro, Mk[1])
    if S.get('hocico') == 'cerdo':
        ho = _e(L, hx_ + Rc * 0.82, hy_ + Rc * 0.28, Rc * 0.42, Rc * 0.36)
        volumen(L, ho, tonos(marca, 4, 0.2, 0.3), radio=2.0, linea=contorno(marca))
    if S.get('cuernos'):
        cu = tonos('#d9c6a0', 3, 0.2, 0.3)
        m = L.capsula(hx_ - 1, hy_ - Rc * 0.75, 1.1, hx_ - 3, hy_ - Rc - 3.5, 0.6)
        L.poner(dilata(m) & ~L.opaco(), contorno('#d9c6a0'))
        L.poner(m, cu[1])
    # El ojo: un solo bloque oscuro con su brillo. La nariz, en la punta.
    ox, oy = hx_ + Rc * 0.42, hy_ - Rc * 0.1
    L.poner(L.rect(ox - 1, oy - 1, ox + 1, oy + 2), '#16110f')
    L.poner(L.rect(ox - 1, oy - 1, ox, oy), '#f6f2ea')
    if S.get('ave'):
        L.poner(L.poli([(hx_ + Rc * 0.85, hy_ - 1), (hx_ + Rc + 3.5, hy_ + 0.5), (hx_ + Rc * 0.85, hy_ + 2)]), '#e0963a')
    elif S.get('hocico') != 'cerdo':
        L.poner(L.rect(hx_ + Rc * 0.86, hy_ + Rc * 0.2, hx_ + Rc * 1.06, hy_ + Rc * 0.42), '#2a1e1c')
    return L.imagen()


# ══════════════════════════════════════════════
#  LOS MUEBLES PARA LAS CASAS
# ══════════════════════════════════════════════
# Como los objetos de newpro (`mesa` 41x22, `taburete` 21x19): vistos desde arriba, cara de arriba y
# frente, a la mitad del tamaño con el que se ven (el juego los pinta al doble). Libros, tablas y
# cojines son bandas; ninguna textura de puntos.
def _bloque(L, x0, y0, x1, y1, tapa, base):
    r = tonos(base, 5, 0.22, 0.42)
    L.poner(L.rect(x0, y0, x1, y0 + tapa), r[0])
    L.poner(L.rect(x0, y0 + tapa, x1, y1), r[2])
    L.poner(L.rect(x0, y0 + tapa, x1, y0 + tapa + 1), r[1])
    L.poner(L.rect(x1 - 2, y0 + tapa, x1, y1), r[3])
    L.poner(L.rect(x0, y1 - 2, x1, y1), r[3])
    return r


def _patas(L, xs, y0, y1, cols, g=3):
    for x in xs:
        L.poner(L.rect(x, y0, x + g, y1), cols[3])
        L.poner(L.rect(x, y0, x + 1, y1), cols[2])


def _cojin(L, m, tela):
    volumen(L, m, tonos(tela, 5, 0.22, 0.4), radio=3.0)


def mueble(tipo, madera, tela, rng):
    M = tonos(madera, 5, 0.22, 0.42)
    T = tonos(tela, 5, 0.22, 0.42)
    if tipo == 'cama':
        L = Lamina(46, 66)
        _bloque(L, 3, 2, 43, 14, 5, madera)
        L.poner(L.rect(3, 12, 43, 62), M[2])
        L.poner(L.rect(5, 12, 41, 58), '#efe8d8')
        _cojin(L, L.rect(8, 15, 22, 24) | _e(L, 15, 15, 7, 2.2) | _e(L, 15, 24, 7, 2.2), '#f6f0e4')
        _cojin(L, L.rect(24, 15, 38, 24) | _e(L, 31, 15, 7, 2.2) | _e(L, 31, 24, 7, 2.2), '#f6f0e4')
        L.poner(L.rect(5, 28, 41, 58), T[1])
        L.poner(L.rect(5, 28, 41, 32), T[0])
        L.poner(L.rect(5, 32, 41, 33), T[3])
        L.poner(L.rect(33, 33, 41, 58), T[2])
        for y in (40, 48):
            L.poner(L.rect(5, y, 41, y + 1), T[2])
        L.poner(L.rect(3, 58, 43, 64), M[3])
        L.poner(L.rect(3, 58, 43, 59), M[1])
    elif tipo == 'armario':
        L = Lamina(42, 58)
        _bloque(L, 3, 2, 39, 56, 5, madera)
        L.poner(L.rect(20, 8, 22, 54), M[4])
        for x0, x1 in ((6, 19), (23, 36)):
            L.poner(L.rect(x0, 10, x1, 52), M[1])
            L.poner(L.rect(x0 + 2, 12, x1 - 2, 50), M[2])
            L.poner(L.rect(x0 + 2, 12, x1 - 2, 13), M[3])
        L.poner(L.rect(16, 28, 18, 34), '#d9b84e')
        L.poner(L.rect(24, 28, 26, 34), '#d9b84e')
    elif tipo == 'comoda':
        L = Lamina(46, 36)
        _bloque(L, 3, 2, 43, 32, 6, madera)
        for y in (10, 17, 24):
            L.poner(L.rect(6, y, 40, y + 6), M[1])
            L.poner(L.rect(6, y + 5, 40, y + 6), M[3])
            L.poner(L.rect(20, y + 2, 26, y + 3), '#d9b84e')
        _patas(L, (5, 37), 32, 35, M)
    elif tipo == 'mesa_redonda':
        L = Lamina(48, 40)
        tapa = _e(L, 24, 14, 21, 10)
        L.poner(L.rect(21, 18, 27, 34), M[3])
        L.poner(L.rect(21, 18, 23, 34), M[2])
        L.poner(_e(L, 24, 35, 10, 3), M[3])
        falda = _e(L, 24, 18, 21, 10) & (L.yy >= 14)
        L.poner(falda, T[2])
        L.poner(tapa, T[0])
        L.poner(_e(L, 22, 13, 14, 6), T[0])
        L.poner(borde(tapa) & (L.yy > 14), T[3])
        for x in (9, 18, 30, 39):
            L.poner(L.rect(x, 22, x + 2, 26) & falda, T[3])
    elif tipo == 'mesa_larga':
        L = Lamina(64, 36)
        r = _bloque(L, 3, 4, 61, 22, 12, madera)
        for y in (8, 12):
            L.poner(L.rect(3, y, 61, y + 1), r[1])
        L.poner(L.rect(8, 7, 56, 13), T[1])
        L.poner(L.rect(8, 12, 56, 13), T[3])
        _patas(L, (6, 55), 22, 34, M)
    elif tipo == 'silla':
        L = Lamina(24, 36)
        r = M
        L.poner(L.rect(4, 2, 7, 24), r[2])
        L.poner(L.rect(17, 2, 20, 24), r[3])
        L.poner(L.rect(4, 2, 20, 5), r[0])
        L.poner(L.rect(4, 9, 20, 11), r[1])
        L.poner(L.rect(4, 15, 20, 17), r[1])
        L.poner(L.rect(3, 19, 21, 25), T[1])
        L.poner(L.rect(3, 19, 21, 21), T[0])
        L.poner(L.rect(3, 25, 21, 27), r[3])
        _patas(L, (4, 17), 27, 34, r)
    elif tipo == 'sofa':
        L = Lamina(58, 38)
        _cojin(L, L.rect(4, 4, 54, 22) | _e(L, 29, 4, 25, 3), tela)
        L.poner(L.rect(28, 6, 30, 20), T[3])
        _cojin(L, L.rect(4, 19, 28, 30), tela)
        _cojin(L, L.rect(30, 19, 54, 30), tela)
        for x0, x1 in ((1, 7), (51, 57)):
            _cojin(L, L.rect(x0, 13, x1, 32) | _e(L, (x0 + x1) / 2.0, 13, (x1 - x0) / 2.0, 3), mezcla(tela, '#000000', 0.12))
        L.poner(L.rect(1, 32, 57, 34), M[3])
        _patas(L, (5, 50), 34, 37, M)
    elif tipo == 'sillon':
        L = Lamina(36, 36)
        _cojin(L, L.rect(6, 3, 30, 20) | _e(L, 18, 3, 12, 3), tela)
        _cojin(L, L.rect(7, 18, 29, 29), mezcla(tela, '#ffffff', 0.08))
        for x0, x1 in ((2, 8), (28, 34)):
            _cojin(L, L.rect(x0, 13, x1, 30) | _e(L, (x0 + x1) / 2.0, 13, (x1 - x0) / 2.0, 3), mezcla(tela, '#000000', 0.12))
        L.poner(L.rect(2, 30, 34, 32), M[3])
        _patas(L, (4, 29), 32, 35, M)
    elif tipo == 'alfombra':
        L = Lamina(68, 42)
        m = L.rect(5, 3, 63, 39)
        L.poner(m, T[1])
        L.poner(L.rect(9, 7, 59, 35), T[3])
        L.poner(L.rect(12, 10, 56, 32), mezcla(tela, madera, 0.35))
        L.poner(L.rect(12, 19, 56, 23), T[0])
        L.poner(L.rect(30, 10, 38, 32), T[0])
        # El fleco: trazos largos, no puntos.
        for y in range(4, 39, 3):
            L.poner(L.rect(1, y, 5, y + 1), '#e6dcc4')
            L.poner(L.rect(63, y, 67, y + 1), '#e6dcc4')
    elif tipo == 'librero':
        L = Lamina(46, 60)
        _bloque(L, 3, 2, 43, 58, 5, madera)
        L.poner(L.rect(6, 9, 40, 55), M[4])
        LIB = ['#a8473a', '#3f6f9b', '#5f8f55', '#c9a23f', '#7a4a8c', '#3a3a44', '#b85a2a', '#2c7a7a']
        for k, y in enumerate((10, 26, 42)):
            x = 7
            while x < 38:
                w = rng.randint(2, 4)
                alto = rng.randint(9, 12)
                c = tonos(rng.choice(LIB), 3, 0.2, 0.3)
                L.poner(L.rect(x, y + 13 - alto, x + w, y + 13), c[1])
                L.poner(L.rect(x, y + 13 - alto, x + 1, y + 13), c[0])
                x += w + (1 if rng.random() < 0.15 else 0)
            L.poner(L.rect(6, y + 13, 40, y + 16), M[1])
            L.poner(L.rect(6, y + 15, 40, y + 16), M[3])
    elif tipo == 'lampara':
        L = Lamina(24, 54)
        L.poner(L.rect(11, 18, 13, 48), M[3])
        L.poner(L.rect(11, 18, 12, 48), M[1])
        L.poner(_e(L, 12, 49, 7, 3), M[2])
        L.poner(_e(L, 12, 48, 7, 2.6), M[1])
        pant = L.poli([(7, 3), (17, 3), (21, 19), (3, 19)])
        L.poner(pant, T[1])
        L.poner(L.poli([(8, 4), (12, 4), (10, 18), (5, 18)]), T[0])
        L.poner(L.rect(3, 18, 21, 20), T[3])
    elif tipo == 'maceta':
        L = Lamina(30, 42)
        V = tonos('#4f8a45', 5, 0.24, 0.42) if tela != '#c97f4e' else tonos('#6a9a4a', 5, 0.24, 0.42)
        for (x0, y0, x1, y1, g) in ((15, 28, 6, 6, 2.6), (15, 28, 24, 5, 2.6), (15, 28, 15, 2, 3.0), (15, 28, 3, 16, 2.4), (15, 28, 27, 15, 2.4)):
            m = L.capsula(x0, y0, 1.0, (x0 + x1) / 2.0 + (x1 - x0) * 0.1, (y0 + y1) / 2.0, g + 1) | L.capsula((x0 + x1) / 2.0 + (x1 - x0) * 0.1, (y0 + y1) / 2.0, g + 1, x1, y1, 0.7)
            volumen(L, m, V, radio=2.5, linea=contorno('#4f8a45'))
        P_ = tonos(tela, 5, 0.22, 0.4)
        L.poner(L.poli([(8, 28), (22, 28), (20, 40), (10, 40)]), P_[2])
        L.poner(L.poli([(9, 28), (13, 28), (13, 40), (11, 40)]), P_[1])
        L.poner(L.rect(7, 26, 23, 30), P_[0])
        L.poner(L.rect(7, 29, 23, 30), P_[3])
    elif tipo == 'cuadro':
        L = Lamina(36, 30)
        L.poner(L.rect(2, 2, 34, 28), M[2])
        L.poner(L.rect(2, 2, 34, 3), M[0])
        L.poner(L.rect(2, 26, 34, 28), M[3])
        cielo = T[0]
        L.poner(L.rect(5, 5, 31, 25), cielo)
        L.poner(L.poli([(5, 18), (13, 9), (20, 17), (25, 12), (31, 18), (31, 25), (5, 25)]), T[2])
        L.poner(L.rect(5, 20, 31, 25), mezcla(tela, '#3f6a3a', 0.6))
        L.poner(_e(L, 26, 9, 2.4, 2.4), '#f4e6a8')
    elif tipo == 'chimenea':
        L = Lamina(56, 58)
        _sillares(L, L.rect(4, 8, 52, 56), '#8f8a84', rng, alto=7, ancho=10)
        L.poner(L.rect(2, 3, 54, 10), M[1])
        L.poner(L.rect(2, 3, 54, 5), M[0])
        L.poner(L.rect(2, 9, 54, 10), M[3])
        hueco = L.rect(14, 24, 42, 56) | _e(L, 28, 24, 14, 8)
        L.poner(hueco, '#1c1412')
        L.poner(L.capsula(19, 51, 2, 37, 49, 2), '#5a3d28')
        L.poner(L.capsula(19, 49, 2, 37, 51, 2), '#6e4c32')
        llama = L.poli([(28, 26), (33, 34), (36, 41), (34, 48), (28, 50), (22, 48), (20, 41), (24, 35)])
        L.poner(llama, '#ee7a2a')
        L.poner(L.poli([(28, 33), (31, 40), (31, 47), (28, 49), (25, 47), (25, 40)]), '#ffd166')
    elif tipo == 'horno':
        L = Lamina(44, 48)
        H_ = tonos(mezcla(madera, '#3a3a44', 0.8), 5, 0.22, 0.42)
        L.poner(L.rect(3, 2, 41, 12), H_[0])
        L.poner(L.rect(3, 11, 41, 46), H_[2])
        L.poner(L.rect(39, 12, 41, 46), H_[3])
        L.poner(_e(L, 13, 6.5, 6, 2.6), H_[3])
        L.poner(_e(L, 31, 6.5, 6, 2.6), H_[3])
        L.poner(L.rect(7, 18, 37, 42), H_[3])
        L.poner(L.rect(10, 24, 34, 39), '#3a2018')
        L.poner(L.rect(10, 33, 34, 39), '#c9602a')
        L.poner(L.rect(10, 36, 34, 39), '#f0a040')
        L.poner(L.rect(10, 20, 34, 22), T[1])
    elif tipo == 'pila':
        L = Lamina(44, 38)
        _bloque(L, 3, 2, 41, 36, 12, madera)
        L.poner(L.rect(7, 16, 37, 33), M[1])
        L.poner(L.rect(21, 16, 23, 33), M[3])
        L.poner(_e(L, 22, 8, 15, 4.6), '#e6e4dc')
        L.poner(_e(L, 22, 8, 12, 3.2), '#7fbad6')
        L.poner(_e(L, 19, 7.4, 6, 1.4), '#b6dcec')
        L.poner(L.rect(21, 1, 23, 6), '#a8a8b0')
    elif tipo == 'escritorio':
        L = Lamina(54, 38)
        r = _bloque(L, 3, 3, 51, 20, 11, madera)
        L.poner(L.rect(8, 6, 22, 12), '#efe8d8')
        L.poner(L.rect(10, 8, 20, 9), '#8a8378')
        L.poner(L.rect(10, 10, 17, 11), '#8a8378')
        L.poner(L.rect(40, 3, 43, 10), '#efe8d8')
        L.poner(L.rect(41, 1, 42, 3), '#f0a040')
        L.poner(L.rect(38, 9, 45, 11), '#c9a23f')
        L.poner(L.rect(5, 15, 18, 20), M[1])
        L.poner(L.rect(10, 17, 13, 18), '#d9b84e')
        L.poner(L.rect(36, 15, 49, 20), M[1])
        L.poner(L.rect(41, 17, 44, 18), '#d9b84e')
        _patas(L, (5, 46), 20, 36, M)
    elif tipo == 'espejo':
        L = Lamina(28, 56)
        L.poner(_e(L, 14, 21, 11, 18) , M[2])
        L.poner(_e(L, 14, 21, 11, 18) & (L.xx < 14), M[1])
        cr = _e(L, 14, 21, 8, 15)
        L.poner(cr, '#a8cfe0')
        L.poner(L.poli([(9, 34), (17, 8), (20, 8), (12, 34)]) & cr, '#dcf0f8')
        L.poner(L.rect(13, 38, 15, 50), M[3])
        L.poner(_e(L, 14, 51, 9, 3), M[2])
        L.poner(_e(L, 14, 50, 9, 2.6), M[1])
    elif tipo == 'banera':
        L = Lamina(60, 36)
        B_ = tonos('#e9e6de', 5, 0.08, 0.32)
        L.poner(L.rect(4, 12, 56, 30), B_[2])
        L.poner(L.rect(52, 12, 56, 30), B_[3])
        L.poner(_e(L, 30, 12, 26, 9), B_[0])
        L.poner(_e(L, 30, 12, 22, 7), '#7fbad6')
        L.poner(_e(L, 26, 11, 13, 3), '#b6dcec')
        L.poner(L.rect(46, 2, 49, 9), M[2])
        L.poner(L.rect(40, 2, 49, 4), M[1])
        _patas(L, (8, 48), 30, 34, M)
        L.poner(L.rect(4, 22, 56, 24), T[1])
    elif tipo == 'piano':
        L = Lamina(58, 48)
        r = _bloque(L, 3, 2, 55, 46, 7, madera)
        L.poner(L.rect(6, 12, 52, 22), r[1])
        L.poner(L.rect(22, 13, 36, 20), '#efe8d8')
        L.poner(L.rect(24, 15, 34, 16), '#8a8378')
        L.poner(L.rect(3, 24, 55, 31), '#f4f0e6')
        L.poner(L.rect(3, 24, 55, 25), r[0])
        # Teclas negras por grupos: bloques largos.
        for g, x in enumerate(range(6, 52, 6)):
            L.poner(L.rect(x, 25, x + 3, 29), '#23201f')
        L.poner(L.rect(3, 31, 55, 33), r[3])
        L.poner(L.rect(9, 33, 49, 44), r[2])
        L.poner(L.rect(26, 40, 32, 44), '#d9b84e')
    else:
        raise ValueError(tipo)
    contornear(L, contorno(madera, 1.1))
    return L.imagen()


# ══════════════════════════════════════════════
#  LOS PERSONAJES (colores nuevos sobre los mapas de Soulbound)
# ══════════════════════════════════════════════
# Nunca se redibuja una cabeza: se pintan los mapas de partes del juego (Game/Sprites/Soulbound/partes,
# tools/generar-soulbound-partes.py). Cada píxel dice su parte (R), su tono (G) y si tiene parte (B 200-202).
# Es la misma cuenta que gf-soulbound-custom.js, en numpy.
def _rampa_js(hexa, n, arriba, abajo):
    c = hx(hexa)
    out = []
    for k in range(n):
        t = 0 if n == 1 else k / float(n - 1)
        luz = arriba * (1 - t) - abajo * t
        out.append(tuple(int(round(v + (255 - v) * luz)) if luz >= 0 else int(round(v * (1 + luz))) for v in c))
    return out


def colorear_partes(atlas, falda, pelo, piel, ojos, camisa, pantalon, zapatos, fem):
    """atlas: RGBA del mapa de partes (con la falda ya encima, si la lleva). Devuelve RGBA pintado."""
    d = np.array(atlas.convert('RGBA'))
    if falda is not None:
        d2 = np.array(falda.convert('RGBA'))
        o = d2[..., 3] > 0
        d[o] = d2[o]
    ojo = np.array(hx(ojos), dtype=np.float32)
    blanco = np.array((255, 255, 255), dtype=np.float32)
    mez = lambda a, b, t: tuple(int(round(float(a[i]) + (float(b[i]) - float(a[i])) * t)) for i in range(3))
    tpiel = _rampa_js(piel, 3, 0.12, 0.2)
    pal = {
        10: tpiel, 11: tpiel, 15: tpiel,
        20: _rampa_js(zapatos, 3, 0.18, 0.5),
        30: [(244, 240, 232)], 31: [tuple(int(v) for v in ojo)], 32: [mez(ojo, blanco, 0.3)], 33: [mez(ojo, (14, 10, 18), 0.6)],
        34: [mez(ojo, blanco, 0.62)], 35: [mez(tpiel[2], (52, 30, 26), 0.6)],
        40: _rampa_js(pelo, 4, 0.3, 0.5), 50: _rampa_js(camisa, 4, 0.2, 0.5), 60: _rampa_js(pantalon, 4, 0.14, 0.55),
        70: [(184, 64, 58)], 250: [(22, 18, 16)],
    }
    labio = [mez(tpiel[1], (196, 84, 96), 0.55), mez(tpiel[1], (150, 54, 70), 0.6)]
    R, G, B, Al = d[..., 0].copy(), d[..., 1].copy(), d[..., 2].copy(), d[..., 3]
    conparte = (Al > 0) & (B >= 200) & (B <= 202)
    for parte, tonos_ in pal.items():
        for k, c in enumerate(tonos_):
            lim = (np.round(G / 40.0).astype(int).clip(0, len(tonos_) - 1) == k)
            m = conparte & (R == parte) & lim
            d[m, 0], d[m, 1], d[m, 2] = c
    if fem:
        d[conparte & (B == 201), :3] = (22, 18, 16)
        d[conparte & (B == 202) & (G >= 80), :3] = labio[1]
        d[conparte & (B == 202) & (G < 80), :3] = labio[0]
    return Image.fromarray(d, 'RGBA')
