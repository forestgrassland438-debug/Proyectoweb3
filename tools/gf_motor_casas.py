# -*- coding: utf-8 -*-
"""
=============================================================================
MOTOR DE CASAS 2D (pixel art) PARA EL PUERTO Y LOS REINOS DEL ESTE (2026-11-24)
=============================================================================

"En el nuevo pueblo los postes no son como GameScene ni de su tamaño, ni los
objetos de ese mapa se adaptan al tamaño correcto respetando el tamaño del
mapa y del personaje ... los árboles no son 2.5D, se ven feos al lado de los
de GameScene o del mapa salvaje, así mismo las casas."

Las casas del puerto eran modelos 3D pequeños (184 px de ancho; la puerta,
la mitad del personaje). Las de GameScene son dibujo 2D a escala 2: 367 x 447
la casa de un NPC, con la puerta casi del alto del personaje (102 px) y un
tejado hondo, visto desde arriba. Este motor dibuja casas NUEVAS (no
recolorea ninguna) en esa misma perspectiva y a esa escala:

  · VISTA 3/4 COMO GAMESCENE: la fachada de cara y el tejado visto desde
    arriba. A dos aguas con el hastial de frente = un PENTÁGONO (los dos
    faldones suben hasta la viga de la cumbrera, recta hacia atrás); con la
    cumbrera de lado = el faldón de delante, la cumbrera y por encima una
    franja del de atrás; a cuatro aguas, con sus limas.
  · CONTORNO como el de GameScene: ciruela muy oscura por fuera y en el borde
    de cada pieza (ventana, puerta, viga, zócalo...) con lo que tiene detrás.
  · PAREDES: yeso con esquinas de sillar, piedra en hiladas, ladrillo, tablas
    o entramado de madera; zócalo de losas.
  · TEJADOS: teja curva (sus canales bajan por la pendiente: verticales con
    la cumbrera de lado, horizontales en los faldones del hastial), pizarra
    en hiladas con las placas que asoman por el borde, o escamas.
  · VENTANAS con marco, cruz, alféizar, postigos de lamas y jardinera;
    PUERTAS de tablas (rectas o en arco) con su escalón; chimeneas, toldos a
    rayas, letreros colgados con su dibujo y faroles de pared.

Se dibuja a la mitad (el juego pone los objetos de las zonas a escala 2): la
puerta mide 24 x 46 y en el juego 48 x 92, como el personaje.

Determinista. Sin motas: las texturas son hiladas, tablas y tejas.

    python tools/gf_motor_casas.py <hoja.png>          hoja de contacto
=============================================================================
"""
import math
import random
import sys
import zlib

import numpy as np
from PIL import Image, ImageDraw

from gf_motor_arboles import rampa

N = 8                       # tonos por material (1 = sombra, N = luz; 0 = contorno)
CONTORNO = (46, 31, 40)     # el contorno de GameScene: ciruela muy oscura


def R(h, s0, s1, v0, v1, giro=0.0):
    return rampa(h, s0, s1, v0, v1, giro=giro, n=N, contorno=CONTORNO)


# Materiales que se repiten
MADERA = R(0.035, 0.42, 0.55, 0.16, 0.56, 0.01)          # vigas, marcos y tablas oscuras
MADERA_CLARA = R(0.075, 0.42, 0.55, 0.22, 0.74, 0.01)
PIEDRA = R(0.10, 0.05, 0.10, 0.30, 0.82)
PIEDRA_FRIA = R(0.60, 0.06, 0.12, 0.26, 0.78)
CRISTAL = R(0.56, 0.40, 0.30, 0.26, 0.92, -0.02)
CRISTAL_LUZ = R(0.11, 0.70, 0.40, 0.60, 1.0, 0.02)       # ventana encendida (emite)
HIERRO = R(0.70, 0.10, 0.16, 0.12, 0.52)
HOJA = R(0.30, 0.50, 0.66, 0.18, 0.64, -0.03)
BLANCO = R(0.10, 0.04, 0.08, 0.58, 0.98)
FUEGO = R(0.07, 0.95, 0.70, 0.62, 1.0, 0.04)              # el fuego de la fragua (emite)
BRASA = R(0.02, 0.90, 0.80, 0.35, 0.85, 0.02)
LADRILLO = R(0.025, 0.42, 0.55, 0.26, 0.72, 0.01)


class Dibujo:
    """Un lienzo de materiales y tonos (enteros) por piezas; al final, los
    contornos y el color."""

    def __init__(self, w, h, nombre):
        self.w, self.h = w, h
        self.m = np.full((h, w), -1, np.int32)
        self.t = np.zeros((h, w), np.int32)
        self.e = np.zeros((h, w), bool)
        self.p = np.zeros((h, w), np.int32)
        self.pid = 0
        self.con_borde = [False]
        self.mats = []
        self._ids = {}
        self.rng = random.Random(zlib.crc32(nombre.encode('utf-8')))
        self.yy, self.xx = np.mgrid[0:h, 0:w]

    def pieza(self, borde=True):
        """Lo que se pinte desde aquí es una pieza nueva (una ventana, una
        viga...): su borde con lo que tiene detrás lleva contorno si `borde`."""
        self.pid += 1
        self.con_borde.append(bool(borde))
        return self.pid

    def mat(self, r):
        k = id(r)
        if k not in self._ids:
            self.mats.append(r)
            self._ids[k] = len(self.mats) - 1
        return self._ids[k]

    def pon(self, mask, rmp, t, emite=False):
        k = self.mat(rmp)
        tt = np.clip(np.asarray(t), 1, N)
        self.m[mask] = k
        self.t[mask] = tt[mask] if tt.ndim else int(tt)
        self.e[mask] = emite
        self.p[mask] = self.pid

    def tono(self, mask, d):
        """Sube o baja el tono de lo ya pintado."""
        m = mask & (self.m >= 0)
        self.t[m] = np.clip(self.t[m] + (d[m] if np.ndim(d) else d), 1, N)

    def caja(self, x0, y0, x1, y1):
        return (self.xx >= x0) & (self.xx < x1) & (self.yy >= y0) & (self.yy < y1)

    def poligono(self, pts):
        im = Image.new('L', (self.w, self.h), 0)
        ImageDraw.Draw(im).polygon([(float(x), float(y)) for x, y in pts], fill=255)
        return np.array(im) > 0

    def elipse(self, cx, cy, rx, ry):
        return ((self.xx - cx) / float(rx)) ** 2 + ((self.yy - cy) / float(ry)) ** 2 <= 1.0

    def imagen(self):
        lleno = self.m >= 0
        # 1) el contorno de dentro: el borde de cada pieza con lo de detrás
        con = np.array(self.con_borde)[self.p] & lleno & ~self.e
        P = np.pad(self.p, 1, constant_values=1 << 30)
        L = np.pad(lleno, 1)
        toca = np.zeros_like(lleno)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            q = P[1 + dy:1 + dy + self.h, 1 + dx:1 + dx + self.w]
            ql = L[1 + dy:1 + dy + self.h, 1 + dx:1 + dx + self.w]
            toca |= ql & (q < self.p)
        self.t[con & toca] = 0
        # 2) el de fuera: el píxel vacío que toca algo lleno
        pad = np.pad(lleno, 1)
        fuera = ~lleno & (pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:])
        for y, x in zip(*np.nonzero(fuera)):
            for yy, xx in ((y + 1, x), (y, x + 1), (y, x - 1), (y - 1, x)):
                if 0 <= yy < self.h and 0 <= xx < self.w and self.m[yy, xx] >= 0 and not self.e[yy, xx]:
                    self.m[y, x] = self.m[yy, xx]
                    self.t[y, x] = 0
                    break
        out = np.zeros((self.h, self.w, 4), np.uint8)
        for k, r in enumerate(self.mats):
            sel = self.m == k
            if sel.any():
                pal = np.array(r, np.uint8)
                out[sel, :3] = pal[np.clip(self.t[sel], 0, N)]
                out[sel, 3] = 255
        return Image.fromarray(out, 'RGBA')


def _ruido(rng, w, h, ex, ey=None):
    """Ruido de valor suave en [-1, 1] (manchas de ex x ey px)."""
    ey = ex if ey is None else ey
    gw, gh = int(w / ex) + 3, int(h / ey) + 3
    g = np.array([[rng.random() for _ in range(gw)] for _ in range(gh)])
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    xs, ys = xx / ex, yy / ey
    x0, y0 = xs.astype(int), ys.astype(int)
    fx, fy = xs - x0, ys - y0
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = g[y0, x0] * (1 - fx) + g[y0, x0 + 1] * fx
    b = g[y0 + 1, x0] * (1 - fx) + g[y0 + 1, x0 + 1] * fx
    return (a * (1 - fy) + b * fy) * 2 - 1


def _linea(D, p, q, grueso):
    (ax, ay), (bx, by) = p, q
    dx, dy = bx - ax, by - ay
    L2 = float(dx * dx + dy * dy) or 1.0
    t = np.clip(((D.xx - ax) * dx + (D.yy - ay) * dy) / L2, 0, 1)
    return np.hypot(D.xx - (ax + t * dx), D.yy - (ay + t * dy)) <= grueso / 2.0


# ===========================================================================
# PAREDES
# ===========================================================================
def bloques(D, region, x0, y0, rmp, base=5, alto=7, ancho=(10, 18), junta=None, junta_t=3, luz=1, semilla=0):
    """Hiladas de sillares (o ladrillos): cada pieza con su luz arriba a la
    izquierda, su sombra abajo a la derecha y la junta entre medias."""
    rng = random.Random(semilla or D.rng.random())
    t = np.zeros((D.h, D.w), np.int32)
    es_junta = np.zeros((D.h, D.w), bool)
    ys = np.nonzero(region.any(axis=1))[0]
    xs = np.nonzero(region.any(axis=0))[0]
    if not len(ys):
        return
    ya, yb, xa, xb = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    fila = 0
    y = ya
    while y < yb:
        h = alto
        x = xa - rng.randint(0, ancho[1] // 2) if fila % 2 else xa - rng.randint(ancho[0] // 2, ancho[1])
        while x < xb:
            w = rng.randint(*ancho)
            bt = base + rng.choice((-1, 0, 0, 0, 0, 1))
            t[D.caja(x, y, x + w, y + h)] = bt
            t[D.caja(x, y, x + w, y + 1)] = bt + luz                    # arriba, a la luz
            t[D.caja(x, y, x + 1, y + h)] = bt + luz
            t[D.caja(x, y + h - 2, x + w, y + h - 1)] = bt - 1           # abajo, en sombra
            t[D.caja(x + w - 2, y + 1, x + w - 1, y + h - 1)] = bt - 1
            es_junta |= D.caja(x + w - 1, y, x + w, y + h) | D.caja(x, y + h - 1, x + w, y + h)
            x += w
        y += h
        fila += 1
    D.pon(region & ~es_junta, rmp, t)
    D.pon(region & es_junta, junta or rmp, junta_t)


def yeso(D, region, rmp, base=6):
    """Yeso o cal: un color con manchas muy suaves, más sucio abajo."""
    n = _ruido(D.rng, D.w, D.h, 14, 9)
    t = base + np.round(n * 0.55).astype(int)
    ys = np.nonzero(region.any(axis=1))[0]
    if len(ys):
        t = t - (D.yy > ys.max() - 5).astype(int)
    D.pon(region, rmp, t)


def tablas(D, region, rmp, base=5, alto=6, vertical=False):
    """Tablas de madera con su veta y la raja oscura entre una y otra."""
    rng = D.rng
    veta = _ruido(rng, D.w, D.h, 2.0, 14.0) if vertical else _ruido(rng, D.w, D.h, 14.0, 2.0)
    pos = D.xx if vertical else D.yy
    k = (pos + rng.randint(0, alto - 1)) % alto
    t = base + np.round(veta * 0.6).astype(int)
    t = np.where(k == 0, base - 3, t)
    t = np.where(k == 1, t + 1, t)
    t = np.where(k == alto - 1, t - 1, t)
    D.pon(region, rmp, t)


def troncos(D, x0, x1, y0, y1, rmp, testa, alto=7):
    """Pared de troncos tumbados: cada tronco es un cilindro (la luz arriba),
    con su veta larga, la raja oscura entre uno y otro y, en las esquinas, las
    testas que asoman con sus anillos."""
    region = D.caja(x0, y0, x1, y1)
    k = (D.yy - y0) % alto
    perfil = np.array([1, 2, 2, 1, 0, -1, -2, -2, -3][:alto])
    veta = _ruido(D.rng, D.w, D.h, 18.0, 1.6)
    t = 5 + perfil[np.clip(k, 0, len(perfil) - 1)] + np.round(veta * 0.6).astype(int)
    t = np.where(k == alto - 1, 1, t)
    D.pon(region, rmp, t)
    D.pieza()
    for i, y in enumerate(range(y0, y1 - alto + 2, alto)):
        cy = y + (alto - 1) / 2.0
        for xc in (x0 - 1 - (i % 2), x1 + (i % 2)):
            e = D.elipse(xc, cy, 3.8, (alto - 1) / 2.0 + 0.3)
            r = np.hypot((D.xx - xc) / 3.8, (D.yy - cy) / ((alto - 1) / 2.0 + 0.3))
            D.pon(e, testa, np.where(r < 0.45, 6, np.where(r < 0.75, 5, 4)) + (D.xx < xc).astype(int))


def bambu(D, x0, x1, y0, y1, rmp, ancho=5):
    """Pared de cañas de bambú de pie: cada caña con su luz a la izquierda y
    sus nudos (un anillo oscuro con su brillo encima), a alturas distintas."""
    region = D.caja(x0, y0, x1, y1)
    u = (D.xx - x0) % ancho
    perfil = np.array([1, 2, 1, 0, -2, -2, -3][:ancho])
    t = 5 + perfil[np.clip(u, 0, len(perfil) - 1)]
    t = np.where(u == ancho - 1, 1, t)
    caña = (D.xx - x0) // ancho
    for c in np.unique(caña[region]):
        fase = (int(c) * 7 + 3) % 13
        nudo = region & (caña == c) & (((D.yy - y0 + fase) % 15) == 0) & (u < ancho - 1)
        t = np.where(nudo, 2, t)
        t = np.where(np.roll(nudo, -1, axis=0) & region & (caña == c) & (u < ancho - 1), t + 1, t)
    D.pon(region, rmp, t)


def esquinas(D, x0, x1, y0, y1, rmp, base=6, alto=8):
    """Las esquinas de sillar de una pared de yeso: piezas largas y cortas."""
    for i, y in enumerate(range(y0, y1, alto)):
        for (xa, lado) in ((x0, 1), (x1, -1)):
            w = 11 if i % 2 == 0 else 7
            xb = xa + lado * w
            c = D.caja(min(xa, xb), y, max(xa, xb), min(y1, y + alto))
            D.pon(c, rmp, base)
            D.pon(c & (D.yy == y), rmp, base + 1)
            D.pon(c & (D.yy == min(y1, y + alto) - 1), rmp, base - 2)
            D.pon(c & (D.xx == (max(xa, xb) - 1 if lado > 0 else min(xa, xb))), rmp, base - 2)


def entramado(D, x0, x1, y0, y1, rmp, postes, cruces=(), base=4, grueso=4):
    """Vigas de madera sobre el yeso: postes en x, una viga arriba y otra
    abajo, y cruces de San Andrés en los paneles de `cruces`."""
    m = D.caja(x0, y0, x1, y0 + grueso) | D.caja(x0, y1 - grueso, x1, y1)
    for x in postes:
        m |= D.caja(x, y0, x + grueso, y1)
    for (xa, xb) in cruces:
        for (p, q) in (((xa, y0), (xb, y1)), ((xb, y0), (xa, y1))):
            m |= _linea(D, p, q, grueso) & D.caja(xa, y0, xb, y1)
    D.pon(m, rmp, base)
    D.pon(m & ~np.roll(m, 1, axis=0), rmp, base + 2)          # el canto de arriba, a la luz


def zocalo(D, x0, x1, y0, y1, rmp=PIEDRA):
    bloques(D, D.caja(x0 - 1, y0, x1 + 1, y1), x0, y0, rmp, base=4, alto=max(4, y1 - y0), ancho=(14, 24), junta_t=2)
    D.pon(D.caja(x0 - 1, y0, x1 + 1, y0 + 1), rmp, 6)


# ===========================================================================
# TEJADOS
# ===========================================================================
def _tejas(D, region, rmp, tipo, base, x0, y0, columna=7, fila=8, eje='y', cx=None, extra=None):
    """La textura de un faldón. eje 'y': hiladas horizontales y canales
    verticales (la cumbrera de lado); eje 'x': los canales van en horizontal,
    de la cumbrera (cx) hacia fuera (los faldones de un hastial de frente)."""
    rng = D.rng
    t = np.full((D.h, D.w), base, np.int32)
    sal = rng.randint(1, 1 << 20)

    def _celda(ci, ri):
        # cada teja con su tono (sin repetir un dibujo regular)
        hsh = ((ci * 73856093) ^ (ri * 19349663) ^ sal) % 9
        return np.choose(hsh, (-1, 0, 0, 0, 0, 0, 0, 1, -1))
    if eje == 'x':
        u = (D.yy - y0) % columna
        ci = (D.yy - y0) // columna
        v = np.abs(D.xx - cx).astype(int)
    else:
        u = (D.xx - x0) % columna
        ci = (D.xx - x0) // columna
        v = (D.yy - y0)
    if tipo == 'teja':
        perfil = np.array([2, 2, 1, 0, -1, -1, -3])
        t = t + perfil[np.clip(u, 0, len(perfil) - 1)]
        f = v % fila
        c = (u - (columna - 2) / 2.0) / (columna / 2.0)
        labio = np.round(1.4 * (1 - c * c)).astype(int)
        t = t + _celda(ci, (v - labio) // fila)
        t = np.where(f == labio % fila, t + 2, t)
        t = np.where(f == (labio + 1) % fila, t - 2, t)
    elif tipo == 'pizarra':
        fila = 6
        f = v % fila
        n_fila = v // fila
        varia = np.zeros_like(t)
        corte = np.zeros_like(t, bool)
        luz = np.zeros_like(t, bool)
        for k in np.unique(n_fila[region]):
            enfila = region & (n_fila == k)
            xs = np.nonzero(enfila.any(axis=0))[0]
            if not len(xs):
                continue
            x = xs.min() - rng.randint(0, 9)
            while x <= xs.max():
                w = rng.randint(8, 11)
                varia[enfila & (D.xx >= x) & (D.xx < x + w)] = rng.choice((-1, 0, 0, 0, 0, 1))
                corte |= enfila & (D.xx == x + w - 1)
                luz |= enfila & (D.xx == x)
                x += w
        t = t + varia
        t = np.where(f == 0, t - 2, t)
        t = np.where(f == 1, t + 1, t)
        t = np.where(corte & (f > 0), t - 2, t)
        t = np.where(luz & (f > 1), t + 1, t)
    elif tipo == 'tablilla':
        # tablillas de madera: hiladas estrechas, cada tabla con su tono y su raja
        fila = 5
        f = v % fila
        n_fila = v // fila
        off = (n_fila * 3) % 6
        cc = (D.xx - x0 + off) // 6
        t = t + _celda(cc, n_fila)
        t = np.where(((D.xx - x0 + off) % 6) == 5, t - 2, t)
        t = np.where(f == 0, t - 2, t)
        t = np.where(f == 1, t + 1, t)
    elif tipo == 'paja':
        # paja o caña: hebras finas que bajan, en hiladas que se montan
        veta = _ruido(rng, D.w, D.h, 1.3, 6.0)
        t = t + np.round(veta * 1.3).astype(int)
        f = v % 9
        t = np.where(f == 0, t - 2, t)
        t = np.where(f == 1, t + 1, t)
        t = t + _celda((D.xx - x0) // 11, v // 9)
    elif tipo == 'escama':
        fila = 6
        n_fila = v // fila
        off = np.where(n_fila % 2 == 1, 4, 0)
        uu = (D.xx - x0 + off) % 8
        f = v % fila
        dentro = ((uu - 3.5) / 4.2) ** 2 + ((f - 1.0) / 5.0) ** 2 <= 1.0
        t = t + _celda((D.xx - x0 + off) // 8, n_fila)
        t = np.where(dentro, t, t - 2)
        t = np.where(dentro & (uu <= 2) & (f <= 2), t + 1, t)
        t = np.where(dentro & (uu >= 6), t - 1, t)
    if extra is not None:
        t = t + extra
    D.pon(region, rmp, t)


def _dientes(D, rmp, xl, xr, y0, y1, fila=6, base=5):
    """Las placas que asoman por los bordes del faldón, una hilada sí y otra no."""
    for k, y in enumerate(range(int(y0) + 1, int(y1) - fila, fila)):
        if k % 2:
            continue
        D.pon(D.caja(xl - 2, y + 1, xl, y + fila - 1), rmp, base + 1)
        D.pon(D.caja(xr, y + 1, xr + 2, y + fila - 1), rmp, base - 1)


def tejado_lado(D, x0, x1, y_alero, alto, rmp, tipo='teja', vuelo=6, cadera=0, madera=MADERA, atras=None):
    """La cumbrera paralela a la fachada, visto desde arriba: el faldón de
    delante, la cumbrera, por encima una franja del faldón de atrás y las
    tablas de los lados; a cuatro aguas (`cadera`) con las limas y los
    faldones de los lados. Devuelve la y de la cumbrera."""
    xl, xr = x0 - vuelo, x1 + vuelo
    yr = y_alero - alto
    fa = atras if atras is not None else max(8, alto // 5)
    ytop = yr - fa
    D.pieza()
    if cadera:
        delante = D.poligono([(xl, y_alero), (xr, y_alero), (xr - cadera, yr), (xl + cadera, yr)])
        izq = D.poligono([(xl, y_alero), (xl + cadera, yr), (xl, ytop)]) & ~delante
        der = D.poligono([(xr, y_alero), (xr - cadera, yr), (xr, ytop)]) & ~delante
        detras = D.poligono([(xl, ytop), (xr, ytop), (xr - cadera, yr), (xl + cadera, yr)]) & ~delante & ~izq & ~der
    else:
        delante = D.caja(xl, yr, xr + 1, y_alero)
        izq = der = np.zeros_like(delante)
        detras = D.caja(xl, ytop, xr + 1, yr)
    arriba = (D.yy < yr + alto // 3).astype(int)
    _tejas(D, delante, rmp, tipo, 5, xl, yr, extra=arriba)
    _tejas(D, detras, rmp, tipo, 3, xl, ytop, fila=5)
    if cadera:
        _tejas(D, izq, rmp, tipo, 6, xl, ytop, fila=6)
        _tejas(D, der, rmp, tipo, 3, xl, ytop, fila=6)
        D.pieza()
        lima = np.zeros_like(delante)
        for (a, b) in (((xl, y_alero), (xl + cadera, yr)), ((xr, y_alero), (xr - cadera, yr)),
                       ((xl, ytop), (xl + cadera, yr)), ((xr, ytop), (xr - cadera, yr))):
            lima |= _linea(D, a, b, 3.2)
        D.pon(lima, rmp, 6)
    # la cumbrera, con sus tejas redondas (cada una, su luz a la izquierda)
    D.pieza()
    c = D.caja(xl + cadera - 1, yr - 3, xr - cadera + 2, yr + 3)
    k = (D.xx - xl) % 10
    D.pon(c, rmp, np.where(k < 3, 7, np.where(k < 7, 6, 4)))
    D.pon(c & (D.yy == yr - 2), rmp, 8)
    D.pon(c & (D.yy >= yr + 1), rmp, 3)
    D.pon(c & (k == 9), rmp, 2)
    if not cadera and tipo != 'paja':
        # las tablas de los hastiales, de canto
        D.pieza()
        for xa in (xl - 2, xr - 1):
            b = D.caja(xa, ytop - 1, xa + 4, y_alero + 1)
            D.pon(b, madera, 5)
            D.pon(b & (D.xx == xa + 1), madera, 7)
    if tipo == 'paja':
        flecos(D, xl, xr, y_alero, rmp)
        return yr
    # el alero
    D.pieza()
    a = D.caja(xl - 3, y_alero - 1, xr + 4, y_alero + 4)
    D.pon(a, madera, 4)
    D.pon(a & (D.yy == y_alero), madera, 6)
    return yr


def flecos(D, xl, xr, y_alero, rmp):
    """El borde de un tejado de paja: las hebras cuelgan desiguales, sin tabla."""
    rng = D.rng
    D.pieza()
    for x in range(int(xl) - 2, int(xr) + 3):
        largo = 3 + rng.choice((0, 1, 1, 2, 2, 3, 4))
        m = D.caja(x, y_alero - 2, x + 1, y_alero + largo)
        D.pon(m, rmp, 3 + (x % 3 == 0) + (x % 5 == 0) - (D.yy >= y_alero + largo - 1).astype(int))
    D.pon(D.caja(int(xl) - 2, y_alero - 3, int(xr) + 3, y_alero - 1), rmp, 6)


def tejado_frente(D, x0, x1, y_alero, alto_hastial, fondo, rmp, tipo='pizarra', vuelo=7, relleno='tablas',
                  pared=None, pared_t=6, madera=MADERA, cruz=False):
    """El hastial de frente, como la casa del NPC de GameScene: un pentágono.
    Los dos faldones (paralelogramos) suben hasta la viga de la cumbrera,
    recta hacia atrás; abajo, el triángulo del hastial con sus tablas de
    canto. Devuelve el triángulo."""
    cx = (x0 + x1) / 2.0
    ya = y_alero - alto_hastial
    xl, xr = x0 - vuelo, x1 + vuelo
    D.pieza()
    izq = D.poligono([(xl, y_alero), (cx, ya), (cx, ya - fondo), (xl, y_alero - fondo)])
    der = D.poligono([(cx, ya), (xr, y_alero), (xr, y_alero - fondo), (cx, ya - fondo)]) & ~izq
    if tipo == 'teja':
        _tejas(D, izq, rmp, tipo, 5, xl, ya - fondo, eje='x', cx=cx)
        _tejas(D, der, rmp, tipo, 4, xl, ya - fondo, eje='x', cx=cx)
    else:
        _tejas(D, izq, rmp, tipo, 5, xl, ya - fondo)
        _tejas(D, der, rmp, tipo, 4, xl, ya - fondo)
        _dientes(D, rmp, xl, xr + 1, y_alero - fondo, y_alero - 2, 6, 5)
    # la viga de la cumbrera
    D.pieza()
    cum = D.caja(int(cx) - 2, int(ya - fondo) - 2, int(cx) + 3, int(ya) + 2)
    D.pon(cum, madera, 5)
    D.pon(cum & (D.xx == int(cx) - 1), madera, 7)
    D.pon(cum & (D.xx == int(cx) + 1), madera, 3)
    # el hastial
    D.pieza(borde=False)
    tri = D.poligono([(x0, y_alero), (x1, y_alero), (cx, ya + 2)])
    if relleno == 'tablas':
        tablas(D, tri, pared or MADERA_CLARA, base=pared_t, alto=5, vertical=True)
    elif relleno == 'ladrillo':
        bloques(D, tri, x0, int(ya), pared, base=pared_t, alto=4, ancho=(8, 10), junta=PIEDRA, junta_t=5, luz=0)
    else:
        yeso(D, tri, pared, base=pared_t)
    if cruz:
        # el pendolón y las tornapuntas, como el hastial de GameScene
        D.pieza()
        m = D.caja(int(cx) - 1, int(ya), int(cx) + 2, y_alero)
        hm = alto_hastial * 0.42
        m |= _linea(D, (x0 + 10, y_alero - 1), (cx, y_alero - hm), 3.2)
        m |= _linea(D, (x1 - 10, y_alero - 1), (cx, y_alero - hm), 3.2)
        D.pon(m & tri, madera, 5)
    # las tablas de canto: delante (gruesas) y detrás (finas)
    D.pieza()
    m = _linea(D, (xl - 1, y_alero + 1), (cx, ya - 1), 5.0) | _linea(D, (xr + 1, y_alero + 1), (cx, ya - 1), 5.0)
    D.pon(m, madera, 5)
    D.pon(m & ~np.roll(m, 1, axis=0), madera, 7)
    D.pieza()
    m = _linea(D, (xl, y_alero - fondo), (cx, ya - fondo - 1), 3.0) | _linea(D, (xr, y_alero - fondo), (cx, ya - fondo - 1), 3.0)
    D.pon(m, madera, 4)
    # el alero
    D.pieza()
    a = D.caja(xl - 3, y_alero - 1, xr + 4, y_alero + 4)
    D.pon(a, madera, 4)
    D.pon(a & (D.yy == y_alero), madera, 6)
    return tri


def sombra_alero(D, x0, x1, y_alero, alto=5):
    for k in range(alto):
        D.tono(D.caja(x0, y_alero + k, x1, y_alero + k + 1), -(2 if k < 2 else 1))


# ===========================================================================
# PIEZAS DE LA FACHADA
# ===========================================================================
def ventana(D, x, y, w, h, marco=BLANCO, persiana=None, jardinera=None, flor=None, arco=False, cruz=True,
            encendida=False, alfeizar=PIEDRA, g=3):
    """Una ventana con su marco, la cruz, el reflejo del cristal, el alféizar y,
    si se pide, postigos de lamas y una jardinera con flores."""
    caja = D.caja(x, y, x + w, y + h)
    if arco:
        caja = caja | (D.elipse(x + w / 2.0 - 0.5, y, w / 2.0, w / 2.6) & (D.yy < y) & (D.xx >= x) & (D.xx < x + w))
    D.pon(caja, marco, 6)
    D.pon(caja & ((D.xx == x + w - 2) | (D.yy == y + h - 2)), marco, 4)
    dentro = D.caja(x + g, y + g, x + w - g, y + h - g)
    if arco:
        dentro = dentro | (D.elipse(x + w / 2.0 - 0.5, y + g - 1, w / 2.0 - g, w / 2.6 - g + 1) & (D.yy < y + g)
                           & (D.xx >= x + g) & (D.xx < x + w - g))
    if encendida:
        D.pon(dentro, CRISTAL_LUZ, 7 - np.clip((D.yy - y) // max(1, h // 4), 0, 2), emite=True)
    else:
        D.pon(dentro, CRISTAL, 3 + np.clip((D.yy - y) * 3 // max(1, h), 0, 2))
        D.tono(dentro & ((D.yy - y) == (h * 2) // 3), 2)                       # la raya de luz
        D.tono(dentro & ((((D.xx - x) + (D.yy - y)) % 13) < 2) & ((D.xx - x) + (D.yy - y) < w), 2)
        D.tono(dentro & (D.yy <= y + g), -1)
    if cruz:
        D.pon(dentro & ((D.xx == x + w // 2 - 1) | (D.xx == x + w // 2)), marco, 5)
        D.pon(dentro & (D.yy == y + h // 2), marco, 5)
    a = D.caja(x - 2, y + h - 1, x + w + 2, y + h + 3)
    D.pon(a, alfeizar, 5)
    D.pon(a & (D.yy == y + h - 1), alfeizar, 7)
    D.pon(a & (D.yy == y + h + 2), alfeizar, 3)
    if persiana is not None:
        pw = max(6, w // 2 - 1)
        for (xa, lado) in ((x - pw - 1, -1), (x + w + 1, 1)):
            p = D.caja(xa, y, xa + pw, y + h)
            D.pon(p, persiana, 5)
            D.pon(p & (((D.yy - y) % 3) == 2), persiana, 3)
            D.pon(p & (((D.yy - y) % 3) == 0), persiana, 6)
            D.pon(p & ((D.xx == xa + 1) | (D.xx == xa + pw - 2)), persiana, 4)
    if jardinera is not None:
        jy = y + h + 3
        caja_j = D.caja(x - 1, jy, x + w + 1, jy + 5)
        D.pon(caja_j, jardinera, 4)
        D.pon(caja_j & (D.yy == jy), jardinera, 6)
        D.pon(caja_j & (D.yy == jy + 4), jardinera, 2)
        mata = np.zeros((D.h, D.w), bool)
        nm = max(2, w // 6)
        for k in range(nm):
            mata |= D.elipse(x + 2 + k * (w - 3) / max(1, nm - 1), jy - 1, 4.2, 3.4)
        mata &= (D.yy < jy + 1) & (D.xx >= x - 2) & (D.xx < x + w + 2)
        D.pon(mata, HOJA, 4 + (D.yy < jy - 2).astype(int) - (D.xx > x + w * 0.6).astype(int))
        if flor is not None:
            nf = max(2, w // 7)
            for k in range(nf):
                fx = x + 3 + k * (w - 5) / max(1, nf - 1) + D.rng.uniform(-1, 1)
                fy = jy - 3 + D.rng.choice((0, 1))
                f = D.elipse(fx, fy, 1.6, 1.4)
                D.pon(f, flor, 6)
                D.pon(f & (D.xx < fx) & (D.yy < fy), flor, 8)


def puerta(D, x, y_suelo, w, h, madera=MADERA_CLARA, marco=MADERA, arco=False, ventanuco=False, escalon=PIEDRA,
           color=None):
    """Una puerta de tablas con marco, herrajes, pomo y escalón; en arco si se pide."""
    y = y_suelo - h
    hueco = D.caja(x, y, x + w, y_suelo)
    if arco:
        hueco = hueco | (D.elipse(x + w / 2.0 - 0.5, y, w / 2.0, w / 2.4) & (D.yy < y) & (D.xx >= x) & (D.xx < x + w))
    marco_m = hueco | D.caja(x - 3, y - 3, x + w + 3, y_suelo)
    if arco:
        marco_m = marco_m | (D.elipse(x + w / 2.0 - 0.5, y, w / 2.0 + 3, w / 2.4 + 3) & (D.yy < y) & (D.xx >= x - 3) & (D.xx < x + w + 3))
    D.pon(marco_m, marco, 4)
    D.pon(marco_m & (D.xx < x) & (D.xx >= x - 2), marco, 6)
    tablas(D, hueco, color or madera, base=5, alto=4, vertical=True)
    D.tono(hueco & (D.yy < y + 3) & ~(D.yy < y), -1)
    D.pon(hueco & D.caja(x, y_suelo - 1, x + w, y_suelo), color or madera, 2)
    for yy in (y + 6, y_suelo - 10):
        D.pon(D.caja(x + 1, yy, x + w - 1, yy + 2), HIERRO, 3)
        D.pon(D.caja(x + 1, yy, x + w - 1, yy + 1), HIERRO, 5)
    D.pon(D.caja(x + w - 6, y + h // 2, x + w - 4, y + h // 2 + 3), HIERRO, 7)
    D.pon(D.caja(x + w - 6, y + h // 2 + 2, x + w - 4, y + h // 2 + 3), HIERRO, 4)
    if ventanuco:
        v = D.caja(x + w // 2 - 3, y + 4, x + w // 2 + 3, y + 10)
        D.pon(v, CRISTAL, 4)
        D.pon(v & (D.xx == x + w // 2), marco, 4)
    if escalon is not None:
        e = D.caja(x - 6, y_suelo, x + w + 6, y_suelo + 4)
        D.pon(e, escalon, 5)
        D.pon(e & (D.yy == y_suelo), escalon, 7)
        D.pon(e & (D.yy == y_suelo + 3), escalon, 3)


def chimenea(D, x, y_base, w, h, rmp=PIEDRA_FRIA, ladrillo=False):
    c = D.caja(x, y_base - h, x + w, y_base)
    if ladrillo:
        bloques(D, c, x, y_base - h, rmp, base=4, alto=4, ancho=(6, 8), junta=PIEDRA, junta_t=6, semilla=7)
    else:
        bloques(D, c, x, y_base - h, rmp, base=5, alto=5, ancho=(6, 10), junta_t=3, semilla=11)
    D.tono(c & (D.xx >= x + w - 3), -1)
    tapa = D.caja(x - 2, y_base - h - 4, x + w + 2, y_base - h)
    D.pon(tapa, PIEDRA, 6)
    D.pon(tapa & (D.yy == y_base - h - 4), PIEDRA, 7)
    D.pon(tapa & (D.yy == y_base - h - 1), PIEDRA, 3)
    D.pon(D.caja(x + 2, y_base - h - 6, x + w - 2, y_base - h - 4), HIERRO, 2)


def toldo(D, x0, x1, y, alto, c1, c2, ancho_raya=6):
    """Toldo a rayas, con el borde en ondas y su sombra en la pared."""
    m = D.caja(x0, y, x1, y + alto)
    raya = ((D.xx - x0) // ancho_raya) % 2 == 0
    t = 7 - ((D.yy - y) * 3 // max(1, alto))
    D.pon(m & raya, c1, t)
    D.pon(m & ~raya, c2, t)
    onda = D.caja(x0, y + alto, x1, y + alto + 3) & (
        (((D.xx - x0) % ancho_raya) - ancho_raya / 2.0) ** 2 / (ancho_raya / 2.0) ** 2 + ((D.yy - (y + alto)) / 3.0) ** 2 <= 1.0)
    D.pon(onda & raya, c1, 4)
    D.pon(onda & ~raya, c2, 4)
    D.pon(D.caja(x0, y, x1, y + 1), c1, 8)
    otros = (D.m >= 0) & (D.p != D.pid)
    for k in range(4):
        D.tono(D.caja(x0 + 1, y + alto + 3 + k, x1 - 1, y + alto + 4 + k) & otros, -1 if k else -2)


def farol_pared(D, x, y, encendido=True):
    """Un farol de pared con su brazo."""
    D.pon(D.caja(x - 1, y - 2, x + 7, y + 1), HIERRO, 4)
    c = D.caja(x + 2, y, x + 10, y + 10)
    D.pon(c, HIERRO, 3)
    vid = D.caja(x + 3, y + 2, x + 9, y + 9)
    D.pon(vid, CRISTAL_LUZ if encendido else CRISTAL, 6, emite=encendido)
    D.pon(D.caja(x + 1, y - 1, x + 11, y + 1), HIERRO, 5)
    D.pon(D.caja(x + 4, y + 10, x + 8, y + 12), HIERRO, 2)


def letrero(D, x, y, w, h, icono, madera=MADERA_CLARA, cadena=HIERRO):
    """Letrero colgado de un brazo de hierro, con su dibujo."""
    D.pon(D.caja(x - 4, y - 7, x + w + 2, y - 4), cadena, 4)
    D.pon(D.caja(x - 4, y - 7, x + w + 2, y - 6), cadena, 6)
    for cx in (x + 3, x + w - 4):
        D.pon(D.caja(cx, y - 4, cx + 1, y), cadena, 5)
    b = D.caja(x, y, x + w, y + h)
    tablas(D, b, madera, base=5, alto=5)
    D.pon(b & ((D.xx == x + 1) | (D.yy == y + 1)), madera, 7)
    D.pon(b & ((D.xx == x + w - 2) | (D.yy == y + h - 2)), madera, 3)
    icono(D, x + w / 2.0, y + h / 2.0)


def icono_pez(D, cx, cy):
    pez = R(0.55, 0.35, 0.45, 0.30, 0.90)
    cuerpo = D.elipse(cx - 1, cy, 6.5, 3.2)
    cola = D.poligono([(cx + 5, cy), (cx + 9, cy - 4), (cx + 9, cy + 4)])
    D.pon(cuerpo | cola, pez, 6)
    D.pon((cuerpo | cola) & (D.yy > cy), pez, 4)
    D.pon(D.caja(int(cx) - 5, int(cy) - 1, int(cx) - 3, int(cy) + 1), HIERRO, 1)


def icono_jarra(D, cx, cy):
    cerveza = R(0.11, 0.75, 0.85, 0.35, 0.95, 0.02)
    vaso = D.caja(int(cx) - 5, int(cy) - 4, int(cx) + 3, int(cy) + 6)
    asa = D.caja(int(cx) + 3, int(cy) - 2, int(cx) + 6, int(cy) + 4) & ~D.caja(int(cx) + 3, int(cy), int(cx) + 5, int(cy) + 2)
    D.pon(vaso, cerveza, 6)
    D.pon(vaso & (D.xx >= int(cx)), cerveza, 4)
    D.pon(asa, cerveza, 5)
    D.pon(D.elipse(cx - 1, cy - 5, 5.2, 2.4), BLANCO, 7)


def icono_bolsa(D, cx, cy):
    tela = R(0.09, 0.45, 0.55, 0.30, 0.82)
    bolsa = D.elipse(cx, cy + 1.5, 6, 5)
    cuello = D.caja(int(cx) - 2, int(cy) - 6, int(cx) + 3, int(cy) - 2)
    D.pon(bolsa | cuello, tela, 6)
    D.pon((bolsa | cuello) & (D.xx > cx + 1), tela, 4)
    D.pon(D.caja(int(cx) - 3, int(cy) - 3, int(cx) + 4, int(cy) - 2), HIERRO, 3)
    D.pon(D.elipse(cx, cy + 2, 2.2, 2.2), R(0.13, 0.75, 0.85, 0.40, 1.0, 0.01), 7)


# ===========================================================================
# LA CASA
# ===========================================================================
def casa(nombre, pared, tejado, tipo_tejado='teja', forma='lado', ancho=176, pisos=1, alto_piso=60,
         muro='yeso', persiana=None, jardinera=None, flor=None, chimenea_x=None, toldo_=None,
         balcon=False, entramado_=False, puerta_arco=False, puerta_color=None, ventanas=2, cadera=0,
         farol=True, marco=BLANCO, alto_tejado=None, fondo=None, ventana_hastial=True, extra=None,
         relleno=None, cruz=False, pared_hastial=None, zancos=0, testa=None, vuelo=None, zocalo_=PIEDRA,
         chimenea_fuego=False):
    """Una casa de `pisos` plantas, de frente (en zancos de `zancos` px si se
    pide). Devuelve (Dibujo, pie_x, pie_y)."""
    if forma == 'frente':
        alto_tejado = alto_tejado or int(ancho * 0.34)
        fondo = fondo or int(ancho * 0.46)
    else:
        alto_tejado = alto_tejado or int(ancho * 0.46)
        fondo = fondo or max(8, alto_tejado // 5)
    alto_muro = pisos * alto_piso + 8
    margen = 12 + (vuelo or 0)
    arriba = alto_tejado + fondo + 8 + (30 if chimenea_x is not None else 0)
    Hh = alto_muro + arriba + margen + zancos
    Ww = ancho + 2 * margen + 8
    D = Dibujo(Ww, Hh, nombre)
    x0 = margen + 4
    x1 = x0 + ancho
    suelo = Hh - 6
    base = suelo - zancos                 # el pie de la pared (el suelo, o la plataforma de los zancos)
    y_alero = base - alto_muro
    cx = (x0 + x1) // 2
    pw, ph = 24, 46
    if zancos:
        # los zancos: postes hincados en el barro (detrás de todo), con un travesaño
        D.pieza()
        for xp in [x0 + 4, x0 + ancho // 3, x1 - ancho // 3, x1 - 8]:
            p = D.caja(xp, base - 4, xp + 5, suelo)
            D.pon(p, MADERA, 4)
            D.pon(p & (D.xx == xp + 1), MADERA, 6)
            D.pon(p & (D.yy >= suelo - 3), MADERA, 2)
        D.pon(_linea(D, (x0 + 6, base + 2), (x1 - 6, suelo - 6), 2.6) & (D.yy < suelo - 4), MADERA, 3)
    # ── la pared ──
    D.pieza(borde=False)
    pared_m = D.caja(x0, y_alero, x1, base - 8)
    if muro == 'yeso':
        yeso(D, pared_m, pared, base=6)
        esquinas(D, x0, x1, y_alero, base - 8, PIEDRA, base=6)
    elif muro == 'piedra':
        bloques(D, pared_m, x0, y_alero, pared, base=5, alto=8, ancho=(12, 22), junta_t=2)
    elif muro == 'ladrillo':
        bloques(D, pared_m, x0, y_alero, pared, base=5, alto=4, ancho=(8, 10), junta=PIEDRA, junta_t=5, luz=0)
    elif muro == 'tablas':
        tablas(D, pared_m, pared, base=5, alto=6)
    elif muro == 'troncos':
        troncos(D, x0, x1, y_alero, base - 8, pared, testa or MADERA_CLARA)
    elif muro == 'bambu':
        bambu(D, x0, x1, y_alero, base - 8, pared)
    D.pieza()
    if zancos:
        # la plataforma: tablas de canto sobre los zancos
        pl = D.caja(x0 - 6, base - 8, x1 + 6, base)
        tablas(D, pl, MADERA, base=5, alto=4)
        D.pon(pl & (D.yy == base - 8), MADERA, 7)
    else:
        zocalo(D, x0, x1, base - 8, base, zocalo_)
    if entramado_:
        D.pieza()
        postes = [x0] + [x0 + int(ancho * f) for f in (0.33, 0.66)] + [x1 - 4]
        for p in range(pisos):
            ya = y_alero + p * alto_piso
            entramado(D, x0, x1, ya, ya + alto_piso, MADERA, postes,
                      cruces=[(postes[0] + 4, postes[1]), (postes[2] + 4, postes[3])] if p == 0 and pisos > 1 else [])
    if pisos > 1:
        D.pieza()
        for p in range(1, pisos):
            yv = y_alero + p * alto_piso
            v = D.caja(x0 - 3, yv - 2, x1 + 3, yv + 3)
            D.pon(v, MADERA, 4)
            D.pon(v & (D.yy == yv - 1), MADERA, 6)
        for p in range(1, pisos):
            sombra_alero(D, x0, x1, y_alero + p * alto_piso + 3, alto=2)
    # ── el tejado ──
    v = 6 if vuelo is None else vuelo
    if forma == 'frente':
        tejado_frente(D, x0, x1, y_alero, alto_tejado, fondo, tejado, tipo=tipo_tejado,
                      relleno=relleno or ('yeso' if muro == 'yeso' else 'tablas'),
                      pared=pared_hastial or (pared if muro == 'yeso' else MADERA_CLARA),
                      pared_t=6 if muro == 'yeso' else 5, cruz=cruz, vuelo=v + 1)
        if ventana_hastial:
            D.pieza()
            ventana(D, cx - 7, y_alero - alto_tejado // 2 - 5, 14, 15, marco=marco, arco=True, alfeizar=PIEDRA)
    else:
        yr = tejado_lado(D, x0, x1, y_alero, alto_tejado, tejado, tipo=tipo_tejado, cadera=cadera, atras=fondo, vuelo=v)
    sombra_alero(D, x0, x1, y_alero + 4)
    if chimenea_x is not None:
        D.pieza()
        xc = x0 + int(ancho * chimenea_x)
        if forma == 'frente':
            # sobre el faldón, cerca de su borde de atrás
            d = abs(xc + 6 - cx) / float(cx - x0 + 7)
            yb = y_alero - fondo - alto_tejado * (1 - d) + 24
            chimenea(D, xc, int(yb), 12, 34)
        elif chimenea_fuego:
            # la de una fragua: de ladrillo, ancha, con el resplandor del fuego en la boca
            chimenea(D, xc - 4, yr + 18, 20, 46, LADRILLO, ladrillo=True)
            D.pieza(borde=False)
            D.pon(D.caja(xc - 2, yr + 18 - 46 - 6, xc + 14, yr + 18 - 46 - 3), FUEGO, 6, emite=True)
        else:
            chimenea(D, xc, yr + 16, 12, 42)
    # ── la planta baja: puerta y ventanas ──
    D.pieza()
    puerta(D, cx - pw // 2, base - 8, pw, ph, arco=puerta_arco, color=puerta_color,
           escalon=None if zancos else PIEDRA)
    if zancos:
        # la escalera de mano, de la puerta al suelo
        D.pieza()
        for xa in (cx - 9, cx + 6):
            D.pon(D.caja(xa, base - 9, xa + 3, suelo), MADERA_CLARA, 5)
            D.pon(D.caja(xa, base - 9, xa + 1, suelo), MADERA_CLARA, 7)
        for yy in range(base - 2, suelo - 2, 6):
            D.pon(D.caja(cx - 6, yy, cx + 6, yy + 2), MADERA_CLARA, 6)
    vw, vh = 22, 22
    ya_v = base - 8 - alto_piso + 14
    huecos = []
    if ventanas >= 2:
        huecos = [x0 + int(ancho * 0.2) - vw // 2, x1 - int(ancho * 0.2) - vw // 2]
    if ventanas >= 4:
        huecos = [x0 + int(ancho * 0.13) - vw // 2, x0 + int(ancho * 0.32) - vw // 2,
                  x1 - int(ancho * 0.32) - vw // 2, x1 - int(ancho * 0.13) - vw // 2]
    for hx in huecos:
        if abs((hx + vw / 2.0) - cx) < pw / 2.0 + vw / 2.0 + 10:
            continue
        D.pieza()
        ventana(D, hx, ya_v, vw, vh, marco=marco, persiana=persiana, jardinera=jardinera, flor=flor)
    if farol:
        D.pieza()
        farol_pared(D, cx + pw // 2 + 6, base - 8 - ph - 4)
    if toldo_ is not None:
        D.pieza()
        c1, c2 = toldo_
        toldo(D, cx - pw // 2 - 9, cx + pw // 2 + 9, base - 8 - ph - 12, 7, c1, c2)
    # ── los pisos de arriba ──
    for p in range(1, pisos):
        yv = base - 8 - alto_piso * (p + 1) + 14
        for f in (0.2, 0.5, 0.8):
            D.pieza()
            ventana(D, x0 + int(ancho * f) - vw // 2, yv, vw, vh + 2, marco=marco, persiana=persiana,
                    jardinera=None if balcon else jardinera, flor=flor, arco=puerta_arco)
        if balcon:
            D.pieza()
            yb = yv + vh + 8
            suelo_b = D.caja(x0 + 6, yb, x1 - 6, yb + 4)
            D.pon(suelo_b, MADERA, 5)
            D.pon(suelo_b & (D.yy == yb), MADERA, 7)
            D.pon(D.caja(x0 + 6, yb - 12, x1 - 6, yb - 9), MADERA, 6)
            D.pon(D.caja(x0 + 6, yb - 9, x1 - 6, yb) & (((D.xx - x0) % 6) == 0), MADERA, 4)
            for k in range(3):
                D.tono(D.caja(x0 + 6, yb + 4 + k, x1 - 6, yb + 5 + k) & (D.p != D.pid), -1)
    if extra is not None:
        extra(D, x0, x1, y_alero, base)
    return D, cx, suelo


def recorta(im, px, py):
    bb = im.getbbox()
    if not bb:
        return im, px, py
    x0, y0, x1, y1 = max(0, bb[0] - 1), max(0, bb[1] - 1), min(im.width, bb[2] + 1), min(im.height, bb[3] + 1)
    return im.crop((x0, y0, x1, y1)), px - x0, py - y0


# ===========================================================================
# EL PUERTO
# ===========================================================================
TEJA_ROJA = R(0.025, 0.58, 0.72, 0.24, 0.80, 0.01)
TEJA_NARANJA = R(0.055, 0.62, 0.78, 0.26, 0.88, 0.01)
TEJA_PARDA = R(0.065, 0.38, 0.52, 0.18, 0.62, 0.01)
PIZARRA_AZUL = R(0.63, 0.30, 0.40, 0.18, 0.60, -0.01)
PIZARRA_NEGRA = R(0.66, 0.10, 0.16, 0.14, 0.50)
TEJA_VERDE = R(0.42, 0.36, 0.48, 0.20, 0.64, -0.01)
TEJA_AZUL = R(0.57, 0.46, 0.58, 0.22, 0.74, -0.01)


def _pared(h, s, v1=0.97, v0=0.50):
    return R(h, s * 0.8, s, v0, v1)


CASAS = {
    'casa_azul': dict(pared=_pared(0.57, 0.24), tejado=TEJA_ROJA, tipo_tejado='teja', forma='lado',
                      persiana=R(0.60, 0.45, 0.55, 0.24, 0.70), jardinera=R(0.04, 0.50, 0.60, 0.26, 0.66),
                      flor=R(0.99, 0.65, 0.78, 0.45, 0.98), chimenea_x=0.78),
    'casa_coral': dict(pared=_pared(0.025, 0.32), tejado=PIZARRA_AZUL, tipo_tejado='pizarra', forma='frente',
                       persiana=R(0.58, 0.42, 0.52, 0.24, 0.70), ancho=168, puerta_arco=True, chimenea_x=0.74),
    'casa_ocre': dict(pared=_pared(0.11, 0.46, 0.95), tejado=TEJA_ROJA, tipo_tejado='teja', forma='lado', pisos=2,
                      persiana=R(0.36, 0.38, 0.48, 0.20, 0.62), balcon=True, chimenea_x=0.2, alto_tejado=74),
    'casa_menta': dict(pared=_pared(0.42, 0.22), tejado=TEJA_VERDE, tipo_tejado='escama', forma='lado', cadera=30,
                       jardinera=R(0.06, 0.42, 0.52, 0.24, 0.60), flor=R(0.92, 0.42, 0.56, 0.55, 1.0),
                       toldo_=(R(0.42, 0.38, 0.48, 0.32, 0.80), BLANCO), ancho=172),
    'casa_pizarra': dict(pared=PIEDRA_FRIA, muro='piedra', tejado=PIZARRA_NEGRA, tipo_tejado='pizarra', forma='lado',
                         persiana=R(0.0, 0.52, 0.62, 0.22, 0.66), marco=MADERA_CLARA, chimenea_x=0.25),
    'casa_terracota': dict(pared=_pared(0.05, 0.46, 0.92, 0.44), tejado=TEJA_NARANJA, tipo_tejado='teja',
                           forma='frente', pisos=2, persiana=R(0.13, 0.52, 0.62, 0.32, 0.86), ancho=168,
                           jardinera=R(0.06, 0.42, 0.52, 0.24, 0.60), flor=R(0.13, 0.65, 0.78, 0.55, 1.0),
                           relleno='ladrillo', pared_hastial=LADRILLO, cruz=True, ventana_hastial=False,
                           alto_tejado=52, fondo=66),
    'casa_lila': dict(pared=_pared(0.75, 0.18), tejado=TEJA_AZUL, tipo_tejado='escama', forma='lado',
                      jardinera=R(0.06, 0.42, 0.52, 0.24, 0.60), flor=R(0.14, 0.70, 0.82, 0.58, 1.0),
                      toldo_=(R(0.58, 0.46, 0.56, 0.32, 0.80), BLANCO), chimenea_x=0.8),
    'casa_marfil': dict(pared=_pared(0.12, 0.13, 0.98, 0.58), tejado=TEJA_PARDA, tipo_tejado='pizarra',
                        forma='frente', pisos=2, entramado_=True, jardinera=MADERA, flor=R(0.80, 0.38, 0.52, 0.55, 1.0),
                        ancho=176, ventana_hastial=False, relleno='tablas', cruz=True, alto_tejado=56, fondo=70),
}


def dibujar_casa(nombre):
    D, px, py = casa(nombre, **CASAS[nombre])
    return recorta(D.imagen(), px, py)


def _tienda_extra(D, x0, x1, y_alero, suelo):
    # el escaparate: dos ventanas grandes bajo el toldo y cajas de mercancía
    for xa in (x0 + 14, x1 - 62):
        D.pieza()
        ventana(D, xa, suelo - 46, 48, 28, marco=MADERA_CLARA, cruz=True)
    D.pieza()
    toldo(D, x0 + 6, x1 - 6, suelo - 62, 9, R(0.0, 0.52, 0.62, 0.32, 0.86), BLANCO, ancho_raya=8)
    D.pieza()
    letrero(D, (x0 + x1) // 2 + 20, y_alero + 12, 30, 18, icono_bolsa)
    for (xa, w, h) in ((x0 + 4, 16, 12), (x0 + 20, 12, 10), (x1 - 22, 16, 12)):
        D.pieza()
        c = D.caja(xa, suelo - h - 1, xa + w, suelo - 1)
        tablas(D, c, MADERA_CLARA, base=5, alto=4, vertical=True)
        D.pon(c & ((D.yy == suelo - h) | (D.xx == xa + 1)), MADERA_CLARA, 7)


def _taberna_extra(D, x0, x1, y_alero, suelo):
    D.pieza()
    letrero(D, x1 - 54, y_alero + 8, 30, 20, icono_jarra)
    for xb in (x0 + 6, x0 + 20, x1 - 22):
        D.pieza()
        b = D.elipse(xb + 6, suelo - 9, 6.5, 8.5) & (D.yy < suelo)
        tablas(D, b, MADERA_CLARA, base=5, alto=6, vertical=True)
        for yy in (suelo - 15, suelo - 4):
            D.pon(b & (D.yy == yy), HIERRO, 4)
        D.tono(b & (D.xx > xb + 8), -1)
    D.pieza()
    farol_pared(D, x0 + 40, y_alero + 18)


EDIFICIOS = {
    'tienda_puerto': dict(pared=LADRILLO, muro='ladrillo', tejado=TEJA_ROJA, tipo_tejado='teja', forma='lado',
                          ancho=236, ventanas=0, marco=MADERA_CLARA, chimenea_x=0.86, alto_tejado=92,
                          extra=_tienda_extra, farol=False),
    'taberna_puerto': dict(pared=MADERA_CLARA, muro='tablas', tejado=TEJA_PARDA, tipo_tejado='pizarra',
                           forma='frente', pisos=2, ancho=212, ventanas=4, marco=MADERA, puerta_arco=True,
                           alto_tejado=66, fondo=84, extra=_taberna_extra, chimenea_x=0.16, relleno='tablas',
                           ventana_hastial=True),
}


def dibujar_edificio(nombre):
    D, px, py = casa(nombre, **EDIFICIOS[nombre])
    return recorta(D.imagen(), px, py)


# ===========================================================================
# LOS OTROS REINOS: la cabaña del cazador, la choza en zancos, la cabaña de
# bambú, la fragua y la casa seta (cada una con su estilo, no un recoloreado)
# ===========================================================================
TRONCO = R(0.06, 0.45, 0.56, 0.18, 0.62, 0.01)
TESTA = R(0.09, 0.32, 0.44, 0.40, 0.86, 0.01)
TABLILLA = R(0.07, 0.28, 0.40, 0.20, 0.62, 0.01)
CANA_GRIS = R(0.20, 0.16, 0.24, 0.22, 0.62)
JUNCO = R(0.13, 0.34, 0.46, 0.22, 0.68, 0.01)
CANA = R(0.16, 0.45, 0.58, 0.30, 0.82, -0.01)
PALMA = R(0.11, 0.44, 0.56, 0.24, 0.74, 0.01)
BASALTO = R(0.64, 0.08, 0.14, 0.14, 0.54)
CUERNO = R(0.10, 0.18, 0.28, 0.45, 0.92)


def _cazador_extra(D, x0, x1, y_alero, suelo):
    """La cornamenta sobre la puerta y la leña apilada contra la pared."""
    cx = (x0 + x1) // 2
    D.pieza()
    y = suelo - 8 - 46 - 13
    m = D.caja(cx - 4, y, cx + 4, y + 6)
    for lado in (-1, 1):
        m |= _linea(D, (cx + lado * 3, y + 2), (cx + lado * 14, y - 9), 2.4)
        m |= _linea(D, (cx + lado * 9, y - 4), (cx + lado * 8, y - 12), 2.0)
        m |= _linea(D, (cx + lado * 14, y - 9), (cx + lado * 18, y - 15), 2.0)
    D.pon(m, CUERNO, 6)
    D.pon(m & (D.yy > y - 2), CUERNO, 4)
    D.pieza()
    for fila in range(3):
        for k in range(4 - fila % 2):
            xc = x1 - 30 + k * 7 + (fila % 2) * 3
            yc = suelo - 5 - fila * 6
            e = D.elipse(xc, yc, 3.6, 3.2)
            r = np.hypot((D.xx - xc) / 3.6, (D.yy - yc) / 3.2)
            D.pon(e, TESTA, np.where(r < 0.5, 6, 5) - (D.xx > xc + 1).astype(int))


def _forja_extra(D, x0, x1, y_alero, suelo):
    """La boca de la fragua (un arco de ladrillo con el fuego dentro, que emite
    luz) y las herramientas colgadas: las tenazas y el martillo."""
    bx, bw, bh = x0 + 12, 44, 28
    yb = suelo - 8
    D.pieza()
    arco = D.caja(bx - 5, yb - bh, bx + bw + 5, yb) | (D.elipse(bx + bw / 2.0, yb - bh, bw / 2.0 + 5, 14) & (D.yy < yb - bh))
    bloques(D, arco, bx - 5, yb - bh - 14, LADRILLO, base=4, alto=4, ancho=(6, 8), junta=PIEDRA, junta_t=3, luz=0, semilla=5)
    D.pieza(borde=False)
    boca = D.caja(bx, yb - bh + 2, bx + bw, yb) | (D.elipse(bx + bw / 2.0, yb - bh + 2, bw / 2.0, 10) & (D.yy < yb - bh + 2))
    dy = (yb - D.yy) / float(bh + 10)
    dx = np.abs(D.xx - (bx + bw / 2.0)) / (bw / 2.0)
    D.pon(boca, FUEGO, 8 - np.round(dy * 4 + dx * 2.2).astype(int), emite=True)
    lecho = boca & (D.yy >= yb - 6)
    D.pon(lecho, BRASA, 5 + (((D.xx * 3 + D.yy * 5) % 7) < 2).astype(int) * 2, emite=True)
    D.pieza()
    for k in range(5):
        D.pon(D.caja(bx + 5 + k * 8, yb - 9, bx + 7 + k * 8, yb), HIERRO, 3)
    D.pon(D.caja(bx + 2, yb - 10, bx + bw - 2, yb - 8), HIERRO, 4)
    D.pieza()
    tx, ty = x1 - 42, y_alero + 14
    D.pon(D.caja(tx - 3, ty, tx + 28, ty + 2), HIERRO, 5)
    D.pon(_linea(D, (tx + 4, ty + 2), (tx + 1, ty + 26), 2.0) | _linea(D, (tx + 8, ty + 2), (tx + 11, ty + 26), 2.0), HIERRO, 4)
    D.pon(_linea(D, (tx + 20, ty + 2), (tx + 20, ty + 22), 2.2), MADERA_CLARA, 5)
    D.pon(D.caja(tx + 14, ty + 20, tx + 27, ty + 27), HIERRO, 4)
    D.pon(D.caja(tx + 14, ty + 20, tx + 27, ty + 21), HIERRO, 6)


REINOS = {
    'colinas': {'cabana_cazador': dict(pared=TRONCO, muro='troncos', testa=TESTA, tejado=TABLILLA, tipo_tejado='tablilla',
                                       forma='lado', ancho=152, alto_piso=58, alto_tejado=66, chimenea_x=0.12,
                                       persiana=R(0.33, 0.34, 0.44, 0.20, 0.56), marco=MADERA_CLARA,
                                       extra=_cazador_extra, zocalo_=PIEDRA_FRIA)},
    'pantano': {'choza_zancos': dict(pared=CANA_GRIS, muro='tablas', tejado=JUNCO, tipo_tejado='paja', forma='lado',
                                     ancho=124, alto_piso=50, alto_tejado=58, zancos=26, marco=MADERA, vuelo=8,
                                     ventanas=2)},
    'selva': {'cabana_selva': dict(pared=CANA, muro='bambu', tejado=PALMA, tipo_tejado='paja', forma='lado', cadera=34,
                                   ancho=136, alto_piso=52, alto_tejado=64, zancos=14, marco=MADERA_CLARA, vuelo=11)},
    'volcan': {'forja': dict(pared=BASALTO, muro='piedra', tejado=PIZARRA_NEGRA, tipo_tejado='pizarra', forma='lado',
                             ancho=156, alto_piso=62, alto_tejado=68, chimenea_x=0.78, chimenea_fuego=True, ventanas=0,
                             farol=False, marco=MADERA, extra=_forja_extra, zocalo_=BASALTO)},
}


def dibujar_reino(zona, nombre):
    D, px, py = casa(nombre, **REINOS[zona][nombre])
    return recorta(D.imagen(), px, py)


SETA_SOMBRERO = R(0.84, 0.40, 0.54, 0.22, 0.80, 0.02)
SETA_MOTA = R(0.12, 0.10, 0.20, 0.64, 0.98)
SETA_PIE = R(0.11, 0.12, 0.22, 0.46, 0.95)
SETA_LAMINAS = R(0.86, 0.20, 0.30, 0.30, 0.72)


def casa_seta():
    """La casa seta: el pie es la casa (puerta en arco, ventanas redondas que
    alumbran) y el sombrero, el tejado: una cúpula violeta vista desde arriba,
    con pocas manchas grandes y las láminas asomando bajo el borde."""
    Ww, Hh = 168, 190
    D = Dibujo(Ww, Hh, 'casa_seta')
    cx = Ww / 2.0
    suelo = Hh - 6
    alto_pie = 70
    y_top = suelo - alto_pie
    D.pieza(borde=False)
    f = np.clip((D.yy - y_top) / float(alto_pie), 0, 1)
    hw = 38 + 4 * f * f + np.where(D.yy > suelo - 10, (D.yy - (suelo - 10)) * 0.9, 0)
    pie = (np.abs(D.xx - cx) <= hw) & (D.yy >= y_top) & (D.yy < suelo)
    u = np.clip((D.xx - cx) / hw, -1, 1)
    fibra = _ruido(D.rng, Ww, Hh, 1.8, 14.0)
    D.pon(pie, SETA_PIE, 6 + np.round(-u * 1.8 + fibra * 0.6).astype(int) - (D.yy > suelo - 6).astype(int))
    D.pieza()
    puerta(D, int(cx) - 12, suelo - 2, 24, 40, arco=True, color=MADERA_CLARA, escalon=PIEDRA)
    for wx in (cx - 26, cx + 26):
        D.pieza()
        wy = y_top + 24
        D.pon(D.elipse(wx, wy, 8, 8), MADERA, 5)
        vid = D.elipse(wx, wy, 5.5, 5.5)
        D.pon(vid, CRISTAL_LUZ, 7 - ((D.yy - wy) > 1).astype(int), emite=True)
        D.pon(vid & ((np.abs(D.xx - wx) < 0.6) | (np.abs(D.yy - wy) < 0.6)), MADERA, 4)
    # el sombrero
    rx, ry = 78, 62
    cyc = y_top + 4
    D.pieza()
    lam = D.elipse(cx, cyc + 2, rx - 8, 11) & (D.yy >= cyc)
    raya = (np.round(np.arctan2(D.xx - cx, 40.0) * 22).astype(int) % 2) == 0
    D.pon(lam, SETA_LAMINAS, np.where(raya, 4, 3) - (np.abs(D.xx - cx) > rx * 0.6).astype(int))
    D.pieza()
    domo = (D.elipse(cx, cyc, rx, ry) & (D.yy <= cyc)) | D.elipse(cx, cyc, rx, 7)
    nx = np.clip((D.xx - cx) / rx, -1, 1)
    ny = np.clip((D.yy - cyc) / ry, -1, 0.15)
    nz = np.sqrt(np.clip(1 - nx * nx - ny * ny, 0, 1))
    luz = -0.55 * nx - 0.62 * ny * 0.6 + 0.58 * nz
    t = 2 + np.round(luz * 5.2).astype(int) + np.round(_ruido(D.rng, Ww, Hh, 9, 7) * 0.5).astype(int)
    t = np.where(D.yy >= cyc + 3, t - 2, t)
    D.pon(domo, SETA_SOMBRERO, t)
    D.pon(domo & (D.yy == cyc + 2), SETA_SOMBRERO, 7)
    D.pieza()
    for (mx, my, a, b) in ((-38, -30, 12, 8), (-4, -50, 13, 8), (34, -36, 10, 7), (-60, -10, 7, 5),
                           (58, -14, 8, 5), (12, -20, 9, 6), (-24, -52, 7, 4)):
        px_, py_ = cx + mx, cyc + my
        e = D.elipse(px_, py_, a, b) & domo
        D.pon(e, SETA_MOTA, 6 + (D.yy < py_ - b * 0.3).astype(int) - ((D.xx - px_) > a * 0.4).astype(int))
    D.pieza()
    chx = int(cx) + 30
    chimenea(D, chx, cyc - 44, 10, 18, PIEDRA_FRIA)
    return recorta(D.imagen(), int(cx), suelo)


# ── el faro y la farola ──
def faro():
    """El faro: torre que se estrecha, a bandas blanca y roja, con su puerta,
    ventanucos, la galería con barandilla, la linterna que brilla y la cúpula
    roja. Devuelve (imagen, pie_x, pie_y, altura de la luz sobre el pie)."""
    w0, w1, alto = 50, 34, 196
    Ww, Hh = 90, alto + 72
    D = Dibujo(Ww, Hh, 'faro')
    cx = Ww / 2.0
    suelo = Hh - 6
    rojo = R(0.995, 0.58, 0.70, 0.24, 0.80)
    yt = suelo - alto
    D.pieza(borde=False)
    torre = np.zeros((Hh, Ww), bool)
    for y in range(int(yt), int(suelo)):
        f = (suelo - y) / float(alto)
        torre[y] |= np.abs(D.xx[y] - cx + 0.5) <= (w0 + (w1 - w0) * f) / 2.0
    hw = (w0 + (w1 - w0) * np.clip((suelo - D.yy) / float(alto), 0, 1)) / 2.0
    u = np.clip((D.xx - cx + 0.5) / hw, -1, 1)
    luz = np.round(-u * 2.2 + 0.4 * np.sqrt(np.clip(1 - u * u, 0, 1))).astype(int)
    banda = (((suelo - D.yy) // 34) % 2) == 1
    D.pon(torre & ~banda, BLANCO, 6 + luz)
    D.pon(torre & banda, rojo, 5 + luz)
    D.tono(torre & (((suelo - D.yy) % 8) == 0), -1)
    D.pieza()
    base = D.caja(int(cx - w0 / 2 - 5), suelo - 14, int(cx + w0 / 2 + 6), suelo)
    bloques(D, base, int(cx - w0 / 2 - 5), suelo - 14, PIEDRA, base=4, alto=7, ancho=(10, 16), junta_t=2)
    D.pieza()
    puerta(D, int(cx) - 9, suelo - 14, 18, 34, arco=True, color=R(0.58, 0.38, 0.48, 0.22, 0.66), escalon=None)
    for k, y in enumerate((suelo - 84, suelo - 132, suelo - 172)):
        D.pieza()
        ventana(D, int(cx) - 6, y, 12, 15, marco=BLANCO, cruz=False, arco=True, alfeizar=BLANCO)
    gy = yt
    D.pieza()
    g = D.caja(int(cx - w1 / 2 - 9), gy - 4, int(cx + w1 / 2 + 10), gy + 3)
    D.pon(g, HIERRO, 4)
    D.pon(g & (D.yy == gy - 3), HIERRO, 6)
    D.pon(D.caja(int(cx - w1 / 2 - 9), gy - 17, int(cx + w1 / 2 + 10), gy - 14), HIERRO, 5)
    D.pon(D.caja(int(cx - w1 / 2 - 9), gy - 14, int(cx + w1 / 2 + 10), gy - 4) & (((D.xx - int(cx)) % 5) == 0), HIERRO, 3)
    D.pieza()
    lw = w1 - 8
    lin = D.caja(int(cx - lw / 2), gy - 38, int(cx + lw / 2) + 1, gy - 4)
    D.pon(lin, CRISTAL_LUZ, 7 - np.clip((D.yy - (gy - 38)) // 12, 0, 2), emite=True)
    D.pon(lin & (((D.xx - int(cx - lw / 2)) % 7) == 0), HIERRO, 3)
    D.pon(D.caja(int(cx - lw / 2) - 1, gy - 40, int(cx + lw / 2) + 2, gy - 37), HIERRO, 4)
    D.pieza()
    cup = D.elipse(cx - 0.5, gy - 39, lw / 2.0 + 4, 16) & (D.yy < gy - 39)
    du = np.clip((D.xx - cx + 0.5) / (lw / 2.0 + 4), -1, 1)
    D.pon(cup, rojo, np.round(5 - du * 2).astype(int))
    D.pon(D.caja(int(cx) - 1, gy - 62, int(cx) + 2, gy - 54), HIERRO, 5)
    D.pon(D.elipse(cx, gy - 63, 2.5, 2.5), HIERRO, 6)
    im, px, py = recorta(D.imagen(), int(cx), suelo)
    return im, px, py, suelo - (gy - 21)


def farola():
    """La farola del puerto, del tamaño de la de GameScene (48 x 231 en el
    juego): pie con escalones, fuste de hierro con anillos y el farol de
    cristal con su tejadillo. Devuelve (imagen, pie_x, pie_y, altura de la luz)."""
    Ww, Hh = 30, 122
    D = Dibujo(Ww, Hh, 'farola')
    cx = Ww // 2
    suelo = Hh - 4
    D.pieza()
    for (w, h, y) in ((16, 4, suelo - 4), (12, 5, suelo - 9), (8, 6, suelo - 15)):
        c = D.caja(cx - w // 2, y, cx + w // 2, y + h)
        D.pon(c, HIERRO, 4)
        D.pon(c & (D.xx < cx - w // 2 + 2), HIERRO, 6)
        D.pon(c & (D.xx >= cx + w // 2 - 2), HIERRO, 2)
        D.pon(c & (D.yy == y), HIERRO, 6)
    f = D.caja(cx - 2, 26, cx + 2, suelo - 15)
    D.pon(f, HIERRO, 4)
    D.pon(f & (D.xx == cx - 2), HIERRO, 6)
    D.pon(f & (D.xx == cx + 1), HIERRO, 2)
    for y in (64, 40):
        a = D.caja(cx - 4, y, cx + 4, y + 3)
        D.pon(a, HIERRO, 5)
        D.pon(a & (D.yy == y), HIERRO, 7)
    D.pieza()
    cap = D.poligono([(cx - 8, 13), (cx + 8, 13), (cx + 4, 6), (cx - 4, 6)])
    D.pon(cap, HIERRO, 4)
    D.pon(cap & (D.xx < cx), HIERRO, 6)
    D.pon(D.elipse(cx - 0.5, 4, 2, 2), HIERRO, 6)
    D.pon(D.caja(cx - 7, 25, cx + 7, 28), HIERRO, 4)
    D.pieza(borde=False)
    vid = D.caja(cx - 6, 13, cx + 6, 25)
    D.pon(vid, CRISTAL_LUZ, 7 - np.clip((D.yy - 13) // 4, 0, 2), emite=True)
    D.pon(vid & ((D.xx == cx - 6) | (D.xx == cx + 5) | (D.xx == cx)), HIERRO, 3)
    im, px, py = recorta(D.imagen(), cx, suelo)
    return im, px, py, suelo - 19


# ===========================================================================
# LOS FAROLES DE LOS MAPAS (2026-11-25)
# ===========================================================================
# "Los postes en el mapa cementerio son pequeños, en Blossom Meadow también,
# Glowcap también, Mirefen también." Eran modelos 3D de 33-39 px (66-78 en el
# juego): un tercio del poste de GameScene (231). Estos son dibujo 2D a su
# altura (220-250 px en el juego) y cada mapa con el suyo, no el del puerto
# con otro color: hierro forjado en cayado con el farol colgado (cementerio),
# poste de jardín pintado con tejadillo y rosal (pradera), una seta alta que
# alumbra por las láminas con su tarro de luciérnagas (hongos) y madera de
# deriva con el brazo atado y un fuego fatuo (pantano). Cada uno devuelve
# (imagen, pie_x, pie_y, (alto de la luz sobre el pie, desvío x de la luz)).
FATUO_CEMENTERIO = R(0.36, 0.42, 0.20, 0.62, 1.0, 0.02)     # la luz pálida del cementerio (emite)
PINTURA = R(0.11, 0.07, 0.14, 0.55, 0.97)                     # madera pintada de blanco roto
TEJA_COBRE = R(0.44, 0.34, 0.46, 0.26, 0.74, -0.01)           # tejadillo de cobre viejo
ROSA = R(0.95, 0.50, 0.40, 0.46, 0.98, 0.01)
FLOR_AMARILLA = R(0.13, 0.70, 0.55, 0.55, 1.0)
FLOR_LILA = R(0.76, 0.40, 0.30, 0.50, 0.95)
SETA_LUZ = R(0.50, 0.55, 0.40, 0.24, 0.86, 0.02)              # el sombrero de Glowcap
LAMINA_LUZ = R(0.48, 0.55, 0.30, 0.62, 1.0, 0.02)             # láminas y motas que alumbran (emite)
LUCIERNAGA = R(0.17, 0.85, 0.55, 0.70, 1.0)                   # (emite)
TALLO_SETA = R(0.78, 0.10, 0.20, 0.42, 0.92)
TIERRA_OSCURA = R(0.07, 0.35, 0.45, 0.12, 0.40)
DERIVA = R(0.08, 0.14, 0.24, 0.24, 0.70, 0.01)                # madera de deriva, gris
MUSGO = R(0.22, 0.28, 0.40, 0.24, 0.62, -0.01)
CUERDA = R(0.10, 0.36, 0.46, 0.34, 0.76)
OXIDO = R(0.05, 0.42, 0.54, 0.18, 0.60, 0.01)
FATUO = R(0.42, 0.50, 0.28, 0.60, 1.0, 0.03)                  # el fuego fatuo (emite)
BARRO = R(0.08, 0.30, 0.40, 0.14, 0.42)
JUNCO_VERDE = R(0.24, 0.40, 0.52, 0.22, 0.62, -0.01)
ANEA = R(0.06, 0.50, 0.60, 0.20, 0.50)


def _arco(D, cx, cy, r, grueso, desde, hasta):
    """Un trozo de anillo (grados: 0 = derecha, 90 = arriba; puede pasar de 360)."""
    d = np.hypot(D.xx - cx, D.yy - cy)
    a = (np.degrees(np.arctan2(-(D.yy - cy), D.xx - cx)) + 360) % 360
    lo, hi = desde % 360, hasta % 360
    dentro = (a >= lo) & (a <= hi) if lo <= hi else (a >= lo) | (a <= hi)
    return (d <= r + grueso / 2.0) & (d >= r - grueso / 2.0) & dentro


def _hierro_redondo(D, mask, eje_x=None, base=4):
    """Hierro redondo: luz a la izquierda, sombra a la derecha."""
    if eje_x is None:
        xs = np.nonzero(mask.any(axis=0))[0]
        eje_x = (xs.min() + xs.max()) / 2.0 if len(xs) else 0
    D.pon(mask, HIERRO, base + np.where(D.xx < eje_x - 0.6, 2, np.where(D.xx > eje_x + 0.6, -1, 0)))


def farola_cementerio():
    """Hierro forjado: pedestal de piedra con una cruz grabada, fuste retorcido
    con nudos y volutas, el cayado con su punta de lanza y el farol de seis
    caras colgado de una cadena, con la luz pálida del cementerio."""
    Ww, Hh = 46, 130
    D = Dibujo(Ww, Hh, 'farola_cementerio')
    cx = 13
    suelo = Hh - 4
    D.pieza()
    for (w, h, y, t) in ((20, 4, suelo - 4, 4), (14, 15, suelo - 19, 5), (18, 3, suelo - 22, 6)):
        c = D.caja(cx - w // 2, y, cx - w // 2 + w, y + h)
        D.pon(c, PIEDRA_FRIA, t)
        D.pon(c & (D.xx < cx - w // 2 + 2), PIEDRA_FRIA, t + 2)
        D.pon(c & (D.xx >= cx - w // 2 + w - 2), PIEDRA_FRIA, t - 2)
        D.pon(c & (D.yy == y), PIEDRA_FRIA, t + 2)
    n = _ruido(D.rng, Ww, Hh, 3, 3)
    D.tono(D.caja(cx - 7, suelo - 19, cx + 7, suelo - 4) & (n > 0.55), -1)
    cruz = D.caja(cx - 1, suelo - 17, cx + 1, suelo - 7) | D.caja(cx - 3, suelo - 15, cx + 3, suelo - 13)
    D.pon(cruz, PIEDRA_FRIA, 2)
    D.pon(cruz & (D.xx == cx - 1) & (D.yy > suelo - 17), PIEDRA_FRIA, 3)
    top = 24
    D.pieza()
    f = D.caja(cx - 2, top, cx + 2, suelo - 22)
    giro = ((D.yy + D.xx * 2) // 3) % 3
    D.pon(f, HIERRO, 3 + giro + np.where(D.xx == cx - 2, 1, 0) - np.where(D.xx == cx + 1, 1, 0))
    for y in (suelo - 34, 70, 44):
        D.pieza()
        a = D.caja(cx - 3, y, cx + 3, y + 3)
        D.pon(a, HIERRO, 5)
        D.pon(a & (D.yy == y), HIERRO, 7)
        D.pon(a & (D.yy == y + 2), HIERRO, 3)
    D.pieza()
    for s in (-1, 1):
        v = _arco(D, cx + s * 5, suelo - 30, 3.2, 1.6, 90 if s < 0 else 270, 270 if s < 0 else 90) & (D.yy <= suelo - 26)
        _hierro_redondo(D, v, eje_x=cx + s * 5)
    r = 9
    acx = cx + r
    D.pieza()
    cay = _arco(D, acx, top, r, 2.4, 0, 180) & (D.yy <= top + 1)
    D.pon(cay, HIERRO, 4)
    D.pon(cay & (np.hypot(D.xx - acx, D.yy - top) > r + 0.2), HIERRO, 6)
    D.pieza()
    _hierro_redondo(D, _arco(D, acx - 1, top - 3, 3.0, 1.4, 200, 520))
    D.pieza()
    pun = D.poligono([(acx - 2.5, top - r - 1), (acx + 2.5, top - r - 1), (acx + 0.5, top - r - 8), (acx - 0.5, top - r - 8)])
    D.pon(pun, HIERRO, 5)
    D.pon(pun & (D.xx < acx), HIERRO, 7)
    gx = cx + 2 * r
    D.pieza()
    for k, y in enumerate(range(top + 1, top + 8, 2)):
        D.pon(D.caja(gx - (k % 2), y, gx + 1 + (k % 2), y + 2), HIERRO, 5 if k % 2 else 3)
    lx = gx + 0.5
    y0 = top + 8
    D.pieza()
    cap = D.poligono([(lx - 7, y0 + 8), (lx + 7, y0 + 8), (lx + 1.5, y0), (lx - 1.5, y0)])
    D.pon(cap, HIERRO, 4)
    D.pon(cap & (D.xx < lx), HIERRO, 6)
    D.pon(D.caja(int(lx - 8), y0 + 8, int(lx + 9), y0 + 10), HIERRO, 5)
    D.pieza(borde=False)
    vid = D.poligono([(lx - 6, y0 + 10), (lx + 6, y0 + 10), (lx + 6, y0 + 24), (lx - 6, y0 + 24)])
    D.pon(vid, FATUO_CEMENTERIO, 7 - np.clip((D.yy - (y0 + 10)) // 5, 0, 2), emite=True)
    D.pon(D.elipse(lx, y0 + 18, 1.6, 3.2), FATUO_CEMENTERIO, 8, emite=True)
    D.pieza()
    for bx in (lx - 6, lx - 2, lx + 2, lx + 5):
        D.pon(vid & (np.abs(D.xx - bx) < 0.5), HIERRO, 3)
    D.pon(D.caja(int(lx - 7), y0 + 24, int(lx + 8), y0 + 26), HIERRO, 5)
    D.pon(D.poligono([(lx - 5, y0 + 26), (lx + 5, y0 + 26), (lx + 1, y0 + 30), (lx - 1, y0 + 30)]), HIERRO, 3)
    D.pon(D.elipse(lx, y0 + 31.5, 1.2, 1.5), HIERRO, 4)
    im, px, py = recorta(D.imagen(), cx, suelo)
    return im, px, py, (suelo - (y0 + 17), lx - cx)


def farol_jardin():
    """Poste de jardín cuadrado y pintado (una cara a la luz y otra en sombra),
    capitel con ménsulas, farol de cuatro cristales bajo un tejadillo de cobre
    con su bola, un rosal que trepa por el poste y un macizo de flores al pie."""
    Ww, Hh = 36, 124
    D = Dibujo(Ww, Hh, 'farol_jardin')
    cx = 18
    suelo = Hh - 4
    rng = D.rng
    D.pieza()
    pe = D.caja(cx - 6, suelo - 6, cx + 6, suelo)
    D.pon(pe, PIEDRA, 5)
    D.pon(pe & (D.xx < cx - 4), PIEDRA, 7)
    D.pon(pe & (D.xx >= cx + 4), PIEDRA, 3)
    D.pon(pe & (D.yy == suelo - 6), PIEDRA, 7)
    D.pieza()
    po = D.caja(cx - 3, 38, cx + 3, suelo - 6)
    D.pon(po, PINTURA, np.where(D.xx < cx, 7, 5))
    D.pon(po & (D.xx == cx - 3), PINTURA, 8)
    D.pon(po & (D.xx == cx), PINTURA, 6)
    D.pon(po & (D.xx == cx + 2), PINTURA, 4)
    D.tono(po & (D.yy > suelo - 22), -1)
    D.pieza()
    ca = D.caja(cx - 5, 35, cx + 5, 39)
    D.pon(ca, PINTURA, 6)
    D.pon(ca & (D.yy == 35), PINTURA, 8)
    D.pon(ca & (D.yy == 38), PINTURA, 4)
    for s in (-1, 1):
        D.pon(D.poligono([(cx + s * 3, 39), (cx + s * 5, 39), (cx + s * 3, 44)]), PINTURA, 5 if s > 0 else 7)
    D.pieza()
    D.pon(D.caja(cx - 6, 20, cx + 6, 35), PINTURA, 5)
    D.pieza(borde=False)
    vid = D.caja(cx - 5, 21, cx + 5, 34)
    D.pon(vid, CRISTAL_LUZ, 7 - np.clip((D.yy - 21) // 5, 0, 2), emite=True)
    D.pon(D.elipse(cx, 28, 1.5, 2.6), CRISTAL_LUZ, 8, emite=True)
    D.pieza()
    D.pon(vid & ((np.abs(D.xx - (cx - 0.5)) < 0.6) | (D.yy == 27)), PINTURA, 6)
    D.pon(D.caja(cx - 7, 34, cx + 7, 36), PINTURA, 7)
    D.pieza()
    te = D.poligono([(cx - 10, 21), (cx + 10, 21), (cx + 1, 10), (cx - 1, 10)])
    D.pon(te, TEJA_COBRE, 5 + np.where(D.xx < cx, 1, -1) - ((D.yy - 10) % 3 == 0))
    D.pon(te & (D.yy >= 20), TEJA_COBRE, 3)
    D.pon(D.elipse(cx - 0.5, 8.5, 1.8, 1.8), PINTURA, 7)
    D.pieza()
    y_ini, y_fin = suelo - 6, 46
    puntos = [(cx + 3.6 * math.sin((y - y_fin) / 5.5), y) for y in range(y_fin, y_ini + 1)]
    tallo = np.zeros((Hh, Ww), bool)
    for (x, y) in puntos:
        tallo |= (np.abs(D.xx - x) < 0.8) & (D.yy == y)
    D.pon(tallo, HOJA, 3)
    for k, (x, y) in enumerate(puntos[::4]):
        s = 1 if k % 2 else -1
        D.pon(D.elipse(x + s * 1.6, y, 1.4, 1.0), HOJA, 5 + (s < 0))
    for (x, y) in puntos[3::9]:
        flor = D.elipse(x, y, 1.6, 1.4)
        D.pon(flor, ROSA, 6)
        D.pon(flor & (D.yy < y) & (D.xx < x), ROSA, 8)
        D.pon(D.caja(int(round(x)), int(y), int(round(x)) + 1, int(y) + 1), ROSA, 3)
    D.pieza()
    mata = D.elipse(cx, suelo - 1, 12, 4.5) & (D.yy <= suelo + 1)
    nn = _ruido(rng, Ww, Hh, 2.5, 2.0)
    D.pon(mata, HOJA, 4 + np.round(nn * 1.4).astype(int) + (D.yy < suelo - 2))
    for (dx, dy, mat) in ((-9, -3, ROSA), (-5, -5, FLOR_AMARILLA), (-1, -2, FLOR_LILA), (5, -4, ROSA),
                          (9, -2, FLOR_AMARILLA), (2, -5, ROSA), (-7, 0, FLOR_LILA), (7, 0, ROSA)):
        D.pon(D.elipse(cx + dx, suelo + dy, 1.2, 1.0), mat, 7)
    im, px, py = recorta(D.imagen(), cx, suelo)
    return im, px, py, (suelo - 27, 0)


def farol_luciernaga():
    """Una seta alta que alumbra: pie curvo con fibras y su anillo, sombrero
    en campana con motas que brillan y las láminas encendidas, un tarro de
    luciérnagas colgado del borde, luciérnagas sueltas y dos setas al pie."""
    Ww, Hh = 50, 124
    D = Dibujo(Ww, Hh, 'farol_luciernaga')
    cx = 22
    suelo = Hh - 4
    rng = D.rng
    D.pieza()
    D.pon(D.elipse(cx, suelo, 11, 4) & (D.yy <= suelo + 1), TIERRA_OSCURA, 4 + (D.yy < suelo - 1))
    top = 30
    D.pieza()
    f = np.clip((D.yy - top) / float(suelo - top), 0, 1)
    eje = cx + 2.2 * np.sin(f * math.pi * 1.1) + 1.0
    hw = 2.2 + 1.6 * f * f
    pie = (np.abs(D.xx - eje) <= hw) & (D.yy >= top) & (D.yy < suelo - 1)
    u = np.clip((D.xx - eje) / hw, -1, 1)
    fib = _ruido(rng, Ww, Hh, 1.4, 9.0)
    D.pon(pie, TALLO_SETA, 6 + np.round(-u * 1.6 + fib * 0.6).astype(int))
    D.pieza()
    ay = 50
    ex = cx + 2.2 * math.sin((ay - top) / float(suelo - top) * math.pi * 1.1) + 1.0
    fal = D.poligono([(ex - 3, ay), (ex + 3, ay), (ex + 5, ay + 4), (ex - 5, ay + 4)])
    D.pon(fal, TALLO_SETA, 7)
    D.pon(fal & (D.yy == ay + 3), TALLO_SETA, 4)
    tx = cx + 1.0
    cy = 26
    D.pieza(borde=False)
    lam = D.elipse(tx, cy + 1, 17, 5) & (D.yy >= cy)
    raya = (np.round(np.arctan2(D.xx - tx, 9.0) * 9).astype(int) % 2) == 0
    D.pon(lam, LAMINA_LUZ, np.where(raya, 7, 6) - (np.abs(D.xx - tx) > 11), emite=True)
    D.pieza()
    rx, ry = 19, 15
    domo = (D.elipse(tx, cy, rx, ry) & (D.yy <= cy)) | D.elipse(tx, cy, rx, 2.5)
    nx = np.clip((D.xx - tx) / rx, -1, 1)
    ny = np.clip((D.yy - cy) / ry, -1, 0.2)
    nz = np.sqrt(np.clip(1 - nx * nx - ny * ny, 0, 1))
    luz = -0.5 * nx - 0.4 * ny + 0.5 * nz
    D.pon(domo, SETA_LUZ, 2 + np.round(luz * 4.0).astype(int) + np.round(_ruido(rng, Ww, Hh, 6, 5) * 0.5).astype(int))
    D.pon(domo & (D.yy >= cy), SETA_LUZ, 7)
    D.pieza(borde=False)
    for (mx, my, a, b) in ((-9, -8, 2.6, 1.8), (2, -12, 2.8, 1.8), (10, -6, 2.2, 1.5), (-3, -4, 1.8, 1.3), (-14, -2, 1.5, 1.2)):
        e = D.elipse(tx + mx, cy + my, a, b) & domo
        D.pon(e, LAMINA_LUZ, 7 + (D.yy < cy + my), emite=True)
    jx = tx + 13
    D.pieza()
    D.pon(D.caja(int(jx), cy + 2, int(jx) + 1, cy + 9), CUERDA, 5)
    D.pieza()
    D.pon(D.caja(int(jx) - 3, cy + 9, int(jx) + 4, cy + 11), MADERA_CLARA, 6)
    D.pieza()
    tarro = D.elipse(jx + 0.5, cy + 16, 4.6, 5.4) & (D.yy >= cy + 11)
    D.pon(tarro, CRISTAL, 4)
    D.pon(tarro & (D.xx < jx - 2), CRISTAL, 6)
    D.pieza(borde=False)
    for (dx, dy) in ((-1, 14), (2, 17), (0, 19), (-2, 18), (1, 13)):
        D.pon(D.caja(int(jx) + dx, cy + dy, int(jx) + dx + 1, cy + dy + 1), LUCIERNAGA, 8, emite=True)
    for (dx, dy) in ((-22, 6), (-17, 24), (19, -6), (-11, 38), (14, 40)):
        x0, y0 = int(tx + dx), int(cy + dy)
        D.pon(D.caja(x0, y0, x0 + 2, y0 + 1), LUCIERNAGA, 7, emite=True)
        D.pon(D.caja(x0, y0 + 1, x0 + 1, y0 + 2), LUCIERNAGA, 5, emite=True)
    for (sx, h, r_) in ((-8, 7, 3.6), (8, 5, 3.0)):
        D.pieza()
        D.pon(D.caja(cx + sx - 1, suelo - h, cx + sx + 1, suelo), TALLO_SETA, 6)
        D.pieza()
        D.pon(D.elipse(cx + sx, suelo - h, r_, r_ * 0.8) & (D.yy <= suelo - h + 0.5), SETA_LUZ, 5)
        D.pieza(borde=False)
        D.pon(D.elipse(cx + sx, suelo - h + 0.5, r_ - 0.6, 1.0), LAMINA_LUZ, 7, emite=True)
    im, px, py = recorta(D.imagen(), cx, suelo)
    return im, px, py, (suelo - (cy + 4), tx - cx)


def farol_fatuo():
    """Madera de deriva torcida clavada en el barro (dos piedras y aneas al
    pie), un brazo atado con cuerda y su tornapuntas, musgo colgando y un farol
    oxidado con el fuego fatuo dentro y sus chispas."""
    Ww, Hh = 48, 128
    D = Dibujo(Ww, Hh, 'farol_fatuo')
    cx = 14
    suelo = Hh - 4
    rng = D.rng
    D.pieza()
    D.pon(D.elipse(cx + 2, suelo, 13, 4) & (D.yy <= suelo + 1), BARRO, 4 + (D.yy < suelo - 1))
    for (dx, rx_, ry_) in ((-8, 3.5, 2.6), (9, 2.8, 2.2)):
        D.pieza()
        p = D.elipse(cx + dx, suelo - 1, rx_, ry_)
        D.pon(p, PIEDRA, 5)
        D.pon(p & (D.yy < suelo - 2) & (D.xx < cx + dx), PIEDRA, 7)
    D.pieza()
    for (dx, h, inc) in ((-6, 22, -0.12), (-4, 28, -0.04), (-2, 18, 0.05)):
        x0 = cx + dx
        tallo = np.zeros((Hh, Ww), bool)
        for y in range(suelo - h, suelo):
            tallo |= (np.abs(D.xx - (x0 + inc * (suelo - y))) < 0.55) & (D.yy == y)
        D.pon(tallo, JUNCO_VERDE, 5)
        D.pon(D.elipse(x0 + inc * h, suelo - h + 3, 1.3, 3.0), ANEA, 5)
    D.pieza()
    palo = np.zeros((Hh, Ww), bool)
    pts = [(cx, suelo - 1), (cx - 2, 86), (cx + 1, 52), (cx - 1, 22), (cx + 1, 10)]
    for i in range(len(pts) - 1):
        palo |= _linea(D, pts[i], pts[i + 1], 5.0 - i * 0.5)
    D.pon(palo, DERIVA, 5 + np.round(_ruido(rng, Ww, Hh, 1.6, 10.0) * 1.2).astype(int))
    for y in range(Hh):
        fila = np.nonzero(palo[y])[0]
        if len(fila):
            D.pon(palo & (D.yy == y) & (D.xx == fila.min()), DERIVA, 7)
            D.pon(palo & (D.yy == y) & (D.xx == fila.max()), DERIVA, 3)
    for (kx, ky) in ((cx - 1, 70), (cx, 38)):
        D.pon(D.elipse(kx, ky, 1.2, 1.6), DERIVA, 2)
    D.pieza()
    brazo = _linea(D, (cx - 1, 20), (cx + 25, 23), 3.0)
    D.pon(brazo, DERIVA, 5 + np.round(_ruido(rng, Ww, Hh, 8, 1.5) * 1.0).astype(int))
    D.pon(brazo & (D.yy <= 19 + (D.xx - cx) * 3.0 / 26), DERIVA, 7)
    D.pieza()
    D.pon(_linea(D, (cx + 1, 36), (cx + 10, 22), 2.0), DERIVA, 4)
    D.pieza()
    for k in range(3):
        D.pon(_linea(D, (cx - 2, 18 + k * 2), (cx + 3, 21 + k * 2), 1.0), CUERDA, 6 - k)
    D.pieza()
    for (mx, largo) in ((cx + 5, 9), (cx + 8, 14), (cx + 12, 7), (cx + 15, 11), (cx + 19, 6)):
        y0 = int(20 + (mx - cx) * 3.0 / 26) + 2
        hilo = np.zeros((Hh, Ww), bool)
        for y in range(y0, y0 + largo):
            hilo |= (np.abs(D.xx - (mx + 0.8 * math.sin((y - y0) / 2.2))) < 0.6) & (D.yy == y)
        D.pon(hilo, MUSGO, 5 - (D.yy > y0 + largo * 0.6))
    lx = cx + 24
    D.pieza()
    D.pon(D.caja(lx, 24, lx + 1, 30), CUERDA, 5)
    D.pieza()
    D.pon(_arco(D, lx + 0.5, 32, 2.5, 1.2, 0, 180), OXIDO, 5)
    D.pieza()
    cap = D.poligono([(lx - 6, 38), (lx + 7, 38), (lx + 2, 32), (lx - 1, 32)])
    D.pon(cap, OXIDO, 4)
    D.pon(cap & (D.xx < lx), OXIDO, 6)
    D.pieza()
    D.pon(D.caja(lx - 5, 38, lx + 6, 52), OXIDO, 3)
    D.pieza(borde=False)
    vid = D.caja(lx - 4, 39, lx + 5, 51)
    D.pon(vid, FATUO, 4, emite=True)
    D.pon(D.poligono([(lx - 2.5, 49), (lx + 3.5, 49), (lx + 2, 43), (lx + 0.5, 40), (lx - 1, 43)]), FATUO, 7, emite=True)
    D.pon(D.elipse(lx + 0.5, 46, 1.2, 2.0), FATUO, 8, emite=True)
    D.pieza()
    D.pon(vid & ((np.abs(D.xx - (lx + 0.5)) < 0.5) | (D.yy == 45)), OXIDO, 2)
    D.pon(D.caja(lx - 6, 52, lx + 7, 54), OXIDO, 4)
    D.pieza(borde=False)
    for (dx, dy) in ((-9, 44), (9, 36), (-6, 60), (7, 62)):
        D.pon(D.caja(lx + dx, dy, lx + dx + 1, dy + 1), FATUO, 7, emite=True)
    im, px, py = recorta(D.imagen(), cx, suelo)
    return im, px, py, (suelo - 45, lx + 0.5 - cx)


# ===========================================================================
# EL MERCADO DEL PUERTO (2026-11-25)
# ===========================================================================
# "La tienda del nuevo mapa ... y sus carpas están pequeñas." Los puestos eran
# un modelo 3D de 72 x 88 px en el juego: más bajos que el personaje (102).
# Este es dibujo 2D a la escala de GameScene: 168 x 176, el mostrador a la
# cintura del personaje y el toldo por encima de su cabeza.
TOLDO_AZUL = R(0.58, 0.55, 0.64, 0.30, 0.84, -0.01)
HIELO = R(0.54, 0.14, 0.26, 0.68, 1.0)
PEZ_PLATA = R(0.57, 0.16, 0.30, 0.38, 0.94)
PEZ_ROJO = R(0.02, 0.52, 0.62, 0.40, 0.92, 0.01)
PEZ_DORADO = R(0.11, 0.55, 0.62, 0.42, 0.95)


def pez(D, x, y, largo, mat, a_la_derecha=True):
    """Un pez visto de lado: cuerpo con luz arriba, cola y ojo."""
    s = 1 if a_la_derecha else -1
    cuerpo = D.elipse(x, y, largo / 2.0, max(1.6, largo / 4.2))
    D.pon(cuerpo, mat, 6)
    D.pon(cuerpo & (D.yy < y), mat, 8)
    D.pon(cuerpo & (D.yy > y + 0.6), mat, 4)
    D.pon(D.poligono([(x - s * (largo / 2.0 - 0.5), y), (x - s * (largo / 2.0 + 3), y - 2.2),
                      (x - s * (largo / 2.0 + 3), y + 2.2)]), mat, 5)
    ox = int(round(x + s * (largo / 2.0 - 2)))
    D.pon(D.caja(ox, int(y) - 1, ox + 1, int(y)), mat, 1)


def puesto_pescado():
    """El puesto del mercado: toldo a rayas visto desde arriba (más ancho
    delante, las rayas de atrás a delante) con su faldón en ondas, cuatro
    postes, el mostrador de tablas con su tapa de hielo y el pescado encima,
    la tablilla con un pez pintado, una caja de pescado y una cesta al pie."""
    Ww, Hh = 84, 90
    D = Dibujo(Ww, Hh, 'puesto_pescado')
    cx = Ww // 2
    suelo = Hh - 4
    rng = D.rng
    for x in (cx - 29, cx + 27):                                  # los postes de atrás
        D.pieza()
        p = D.caja(x, 20, x + 3, suelo - 26)
        D.pon(p, MADERA, 4)
        D.pon(p & (D.xx == x), MADERA, 6)
    x0, x1 = cx - 30, cx + 30
    tapa_y0, tapa_y1 = suelo - 34, suelo - 26
    D.pieza()
    borde = D.caja(x0, tapa_y0 - 1, x1, tapa_y1 + 1)
    D.pon(borde, MADERA_CLARA, 6)
    D.pon(borde & (D.yy == tapa_y0 - 1), MADERA_CLARA, 8)
    D.pieza(borde=False)
    D.pon(D.caja(x0 + 2, tapa_y0, x1 - 2, tapa_y1), HIELO, 6 + np.round(_ruido(rng, Ww, Hh, 1.6, 1.4) * 1.4).astype(int))
    D.pieza()
    frente = D.caja(x0, tapa_y1 + 1, x1, suelo - 2)
    tablas(D, frente, MADERA_CLARA, base=5, alto=5, vertical=True)
    D.pon(frente & (D.yy == tapa_y1 + 1), MADERA_CLARA, 7)
    D.tono(frente & (D.xx >= x1 - 3), -1)
    D.pieza()
    zoc = D.caja(x0 - 1, suelo - 3, x1 + 1, suelo)
    D.pon(zoc, MADERA, 4)
    D.pon(zoc & (D.yy == suelo - 3), MADERA, 6)
    for (px_, py_, largo, mat, der) in ((cx - 22, tapa_y0 + 2.5, 11, PEZ_PLATA, True), (cx - 8, tapa_y0 + 2.5, 12, PEZ_ROJO, False),
                                        (cx + 8, tapa_y0 + 2.5, 11, PEZ_PLATA, True), (cx + 21, tapa_y0 + 2.5, 9, PEZ_DORADO, False),
                                        (cx - 15, tapa_y0 + 5.5, 12, PEZ_DORADO, False), (cx + 1, tapa_y0 + 5.5, 11, PEZ_PLATA, True),
                                        (cx + 16, tapa_y0 + 5.5, 12, PEZ_ROJO, True)):
        D.pieza()
        pez(D, px_, py_, largo, mat, der)
    D.pieza()
    ty = tapa_y1 + 7
    tab = D.caja(cx - 10, ty, cx + 10, ty + 9)
    D.pon(tab, BLANCO, 6)
    D.pon(tab & ((D.yy == ty) | (D.xx == cx - 10)), BLANCO, 8)
    D.pieza(borde=False)
    pez(D, cx + 0.5, ty + 4.5, 11, TOLDO_AZUL, True)
    for x in (cx - 33, cx + 31):                                  # los postes de delante
        D.pieza()
        p = D.caja(x, 22, x + 3, suelo)
        D.pon(p, MADERA, 5)
        D.pon(p & (D.xx == x), MADERA, 7)
        D.pon(p & (D.xx == x + 2), MADERA, 3)
    D.pieza()
    atras, delante = 4, 22
    lona = D.poligono([(cx - 33, atras), (cx + 33, atras), (cx + 38, delante), (cx - 38, delante)])
    f = np.clip((D.yy - atras) / float(delante - atras), 0, 1)
    u = (D.xx - cx) / (33 + 5 * f)
    raya = (np.floor((u + 1) * 5.5).astype(int) % 2) == 0
    t = 7 - np.round(f * 2).astype(int) + np.round(-u * 0.6).astype(int)
    D.pon(lona & raya, TOLDO_AZUL, t)
    D.pon(lona & ~raya, BLANCO, t)
    D.pon(lona & (D.yy == atras), BLANCO, 8)
    D.pieza()
    ancho_raya = 76 / 11.0
    fald = D.caja(cx - 38, delante, cx + 38, delante + 5)
    uu = np.floor((D.xx - (cx - 38)) / ancho_raya).astype(int)
    xc = (cx - 38) + (uu + 0.5) * ancho_raya
    onda = D.caja(cx - 38, delante + 5, cx + 38, delante + 9) & (
        ((D.xx - xc) / (ancho_raya / 2.0)) ** 2 + ((D.yy - (delante + 5)) / 3.5) ** 2 <= 1.0)
    D.pon((fald | onda) & (uu % 2 == 0), TOLDO_AZUL, 5)
    D.pon((fald | onda) & (uu % 2 == 1), BLANCO, 5)
    D.pon(fald & (D.yy == delante), BLANCO, 7)
    otros = (D.m >= 0) & (D.p != D.pid) & (D.p != D.pid - 1)
    for k in range(3):                                            # la sombra del toldo
        D.tono(D.caja(cx - 36, delante + 9 + k, cx + 36, delante + 10 + k) & otros, -1)
    D.pieza()
    caja_ = D.caja(cx - 41, suelo - 9, cx - 27, suelo)
    tablas(D, caja_, MADERA_CLARA, base=5, alto=4, vertical=False)
    D.pon(caja_ & (D.yy == suelo - 9), MADERA_CLARA, 7)
    D.pieza(borde=False)
    D.pon(D.caja(cx - 40, suelo - 11, cx - 28, suelo - 9), HIELO, 7)
    for (px_, py_, mat) in ((cx - 37, suelo - 11, PEZ_PLATA), (cx - 31, suelo - 11.5, PEZ_ROJO)):
        D.pieza()
        pez(D, px_, py_, 7, mat, px_ < cx - 34)
    D.pieza()
    ces = D.elipse(cx + 34, suelo - 4, 7, 5) & (D.yy >= suelo - 7)
    D.pon(ces, CUERDA, 5 + ((D.yy - (suelo - 7)) % 2 == 0) - (D.xx > cx + 36))
    D.pon(D.caja(cx + 27, suelo - 8, cx + 42, suelo - 6), CUERDA, 7)
    for (px_, py_, mat, der) in ((cx + 31, suelo - 9, PEZ_DORADO, True), (cx + 37, suelo - 9.5, PEZ_PLATA, False)):
        D.pieza()
        pez(D, px_, py_, 7, mat, der)
    return recorta(D.imagen(), cx, suelo)


# {zona: {nombre: (dibujo, huella (ancho, fondo) en px del juego, ancho de la sombra)}}: la huella es el
# pie que choca (el dado del pedestal, la peana, el pie de la seta, el palo), no el macizo ni el barro.
FAROLES = {
    'cementerio': {'farola': (farola_cementerio, (28, 12), 46)},
    'pradera': {'farol_jardin': (farol_jardin, (22, 10), 36)},
    'hongos': {'farol_luciernaga': (farol_luciernaga, (16, 10), 40)},
    'pantano': {'farol_fatuo': (farol_fatuo, (14, 10), 30)},
}


# ===========================================================================
# LO QUE EL MAPA USA: fotos para el atlas (generar-reinos)
# ===========================================================================
class Foto(object):
    """Lo que atlas_objetos espera de una foto: w, h e imagen()."""

    def __init__(self, im):
        self.im = im
        self.w, self.h = im.size

    def imagen(self):
        return self.im


ESCALA = 2           # el juego pone los objetos de las zonas a escala 2


def _ficha(im, px, py, huella_w, huella_h, sombra):
    return {'foto': Foto(im), 'apoyo': (px, py), 'huella': (int(huella_w), int(huella_h)), 'sombra': int(sombra),
            'bajo': max(0, im.height - 1 - py) * ESCALA}


def fotos(zona):
    """{nombre: ficha} de lo que este motor dibuja para `zona`: sustituye a las
    fotos de los modelos 3D del mismo nombre (generar-reinos, construir)."""
    out = {}
    if zona == 'puerto':
        for n in CASAS:
            im, px, py = dibujar_casa(n)
            out[n] = _ficha(im, px, py, (im.width - 34) * ESCALA, 120, (im.width - 40) * ESCALA * 0.62)
        for n in EDIFICIOS:
            im, px, py = dibujar_edificio(n)
            out[n] = _ficha(im, px, py, (im.width - 34) * ESCALA, 130, (im.width - 40) * ESCALA * 0.62)
        im, px, py, _ = faro()
        out['faro'] = _ficha(im, px, py, 96, 44, 104)
        im, px, py, _ = farola()
        out['farol_puerto'] = _ficha(im, px, py, 16, 10, 22)
        im, px, py = puesto_pescado()                       # (2026-11-25) el mostrador choca; el toldo no
        out['puesto_pescado'] = _ficha(im, px, py, 132, 20, 150)
    for n in REINOS.get(zona, {}):
        im, px, py = dibujar_reino(zona, n)
        out[n] = _ficha(im, px, py, (im.width - 40) * ESCALA, 100, (im.width - 44) * ESCALA * 0.62)
    if zona == 'hongos':
        im, px, py = casa_seta()
        out['casa_seta'] = _ficha(im, px, py, 168, 64, 190)
    # (2026-11-25) Los faroles 2D de cada mapa (también para generar-zonas: cementerio y pradera).
    for n, (dibujo, huella, sombra) in FAROLES.get(zona, {}).items():
        im, px, py, _ = dibujo()
        out[n] = _ficha(im, px, py, huella[0], huella[1], sombra)
    return out


def _farol_de(nombre):
    for faroles in FAROLES.values():
        if nombre in faroles:
            return faroles[nombre][0]
    return None


def altura_luz(nombre):
    """A cuántos px del juego sobre el pie está la luz (gf-zonas LUCES, el faro)."""
    if nombre == 'faro':
        return faro()[3] * ESCALA
    if nombre == 'farol_puerto':
        return farola()[3] * ESCALA
    dibujo = _farol_de(nombre)
    if dibujo:
        return dibujo()[3][0] * ESCALA
    return None


def desvio_luz(nombre):
    """Cuántos px del juego a la derecha del pie cuelga la luz (gf-zonas LUCES, 4.º valor)."""
    dibujo = _farol_de(nombre)
    return round(dibujo()[3][1] * ESCALA) if dibujo else 0


if __name__ == '__main__':
    salida = sys.argv[1]
    ims = [(n, dibujar_casa(n)[0]) for n in CASAS] + [(n, dibujar_edificio(n)[0]) for n in EDIFICIOS]
    ims += [('faro', faro()[0]), ('farol_puerto', farola()[0])]
    ims += [(n, ficha[0]()[0]) for faroles in FAROLES.values() for n, ficha in faroles.items()]
    ims += [('puesto_pescado', puesto_pescado()[0])]
    ims += [(n, dibujar_reino(z, n)[0]) for z in REINOS for n in REINOS[z]] + [('casa_seta', casa_seta()[0])]
    if len(sys.argv) > 2:
        ims = [it for it in ims if it[0] in sys.argv[2].split(',')]
    K = 2
    Wd = 2600
    filas, fila, x = [], [], 0
    for n, im in ims:
        if x + im.width * K + 20 > Wd and fila:
            filas.append(fila)
            fila, x = [], 0
        fila.append((n, im))
        x += im.width * K + 20
    filas.append(fila)
    Hd = sum(max(i.height for _, i in f) * K + 30 for f in filas)
    hoja = Image.new('RGBA', (Wd, Hd), (104, 142, 88, 255))
    y = 0
    for f in filas:
        alto = max(i.height for _, i in f) * K
        x = 10
        for n, im in f:
            g = im.resize((im.width * K, im.height * K), Image.NEAREST)
            hoja.alpha_composite(g, (x, y + alto - g.height))
            x += g.width + 20
        y += alto + 30
    hoja.save(salida)
    print(hoja.size)
