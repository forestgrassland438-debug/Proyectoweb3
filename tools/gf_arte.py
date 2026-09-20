#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
GF ARTE — libreria de dibujo compartida para el pack `newpro`
=============================================================================

No genera nada por si sola: la usan `generar-peces.py`, `generar-pociones.py`,
`generar-pesca.py` y `generar-pescadores.py`.

QUE RESUELVE
---------------------------------------------------------------------------
Las cuatro cosas que se repetian en todos los generadores y que, hechas a ojo,
salen distintas en cada archivo:

  1. EL CONTORNO. En este juego el contorno NO es negro: es el propio color
     del objeto bajado a v~0.22 y con la saturacion algo subida. Medido en los
     sprites que ya existen:

         cuerpo  #9a8060 -> contorno #33281a   (cocina/pescado_ahumado)
         cuerpo  #c8352f -> contorno #2a0d0c   (naturaleza/hongo_rojo)
         cuerpo  #d3798e -> contorno #3a1c26   (utiles/cebo_pesca)
         cristal #dfe9ee -> contorno #20303a   (utiles/pocion_vida)

     `contorno_de()` reproduce esa relacion, asi que un objeto nuevo se recorta
     igual que uno del juego sin tener que elegir el color a mano.

  2. LA LUZ. Viene de arriba a la izquierda en todo el arte del juego (se ve en
     `Source/piedra.png`, de #d1 arriba-izquierda a #57 abajo-derecha). `rampa()`
     construye los tonos de un color respetando esa escalera: las luces
     desaturan y tiran a calido, las sombras saturan y tiran a frio.

  3. LA PODREDUMBRE. `pudrir()` no es un filtro sepia: aplica la regla medida
     en las parejas bueno/podrido del propio juego (`item_tomate_bueno` vs
     `item_tomate_malo`, las dos zanahorias) — el tono se acerca a oliva SOLO a
     medio camino, la saturacion casi no se toca y el brillo baja DESIGUAL. Por
     eso una zanahoria podrida del juego sigue siendo naranja.

  4. LAS SILUETAS CURVAS A RESOLUCION NATIVA. Nada se dibuja grande y se
     reduce: `perfil()` interpola los puntos de control con PCHIP (monotono, no
     se pasa de largo como Catmull-Rom) y devuelve la altura columna a columna
     ya redondeada a pixel. Un lomo de pez sale limpio, sin escalones ni
     antialias, que es lo que pide `pixelArt: true` en Phaser.

DETERMINISTA
---------------------------------------------------------------------------
`rng_de(nombre)` siembra desde un SHA-256 del nombre, no desde el reloj ni desde
el hash de Python (que cambia entre procesos). Volver a ejecutar cualquier
generador escribe exactamente los mismos bytes.
"""

import colorsys
import hashlib
import math
import os
import random

from PIL import Image

TRANSP = (0, 0, 0, 0)


def _redondea(v):
    """
    Redondeo a pixel MITAD ARRIBA, no el de Python.

    `round()` en Python 3 redondea al par: round(10.5) da 10 y round(11.5) da
    12. Dibujando, eso es un desastre — una figura centrada en x = 25.5 recorre
    columnas 25.5, 26.5, 27.5... y al redondear salen 26, 26, 28, 28: **una
    columna de cada dos se queda vacia**. Los cultivos salian con rayas
    verticales y el contorno metido por dentro, y no era el dibujo: era esto.
    """
    return int(math.floor(v + 0.5)) if not isinstance(v, int) else v


# ===========================================================================
# COLOR
# ===========================================================================

def hex_rgb(h):
    """'#a1b2c3' o 'a1b2c3' -> (161, 178, 195)."""
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def rgb_hex(c):
    return '#%02x%02x%02x' % (c[0], c[1], c[2])


def a_hsv(c):
    return colorsys.rgb_to_hsv(c[0] / 255.0, c[1] / 255.0, c[2] / 255.0)


def de_hsv(h, s, v):
    h = h % 1.0
    s = min(1.0, max(0.0, s))
    v = min(1.0, max(0.0, v))
    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    return (int(round(r * 255)), int(round(g * 255)), int(round(b * 255)))


def mezcla(a, b, t):
    """Interpola dos colores RGB."""
    t = min(1.0, max(0.0, t))
    return (int(round(a[0] + (b[0] - a[0]) * t)),
            int(round(a[1] + (b[1] - a[1]) * t)),
            int(round(a[2] + (b[2] - a[2]) * t)))


def ajusta(c, dh=0.0, ds=1.0, dv=1.0, s_abs=None, v_abs=None):
    """Mueve un color en HSV. `ds`/`dv` multiplican; `s_abs`/`v_abs` fijan."""
    h, s, v = a_hsv(c)
    h += dh
    s = s * ds if s_abs is None else s_abs
    v = v * dv if v_abs is None else v_abs
    return de_hsv(h, s, v)


def contorno_de(c, fuerza=1.0):
    """
    El contorno del juego: mismo tono, saturacion un poco mas alta, brillo
    hundido a ~0.22. `fuerza` < 1 lo deja mas suave (contornos internos).
    """
    # Ajustado a los cuatro pares medidos arriba: el brillo del contorno es
    # casi CONSTANTE (~0.21) sea cual sea el del cuerpo — no un porcentaje de
    # el —, y la saturacion se acerca a 0.5 desde donde este.
    h, s, v = a_hsv(c)
    v_out = 0.185 + 0.035 * v
    s_out = min(0.80, max(0.30, 0.30 + 0.45 * s))
    if s < 0.03:                      # gris puro: se le da un frio minimo
        h = 0.56
    out = de_hsv(h, s_out, v_out)
    return out if fuerza >= 1.0 else mezcla(c, out, fuerza)


def rampa(base, n=5, arriba=0.34, abajo=0.42, saturar_sombra=1.14):
    """
    `n` tonos de un color, del mas claro (indice 0, cara a la luz) al mas
    oscuro (indice n-1, cara en sombra).

    Las sombras se saturan y las luces se desaturan un poco: es lo que hace que
    un degradado pixelado no parezca la misma pintura con gris encima.
    """
    h, s, v = a_hsv(base)
    medio = (n - 1) // 2
    fuera = []
    for i in range(n):
        if i <= medio:                              # mas claro que la base
            k = (medio - i) / float(max(1, medio))
            vv = v + (1.0 - v) * arriba * k
            ss = s * (1.0 - 0.22 * k)
            hh = h + 0.010 * k                      # las luces tiran a calido
        else:                                       # mas oscuro
            d = (i - medio) / float(max(1, n - 1 - medio))
            vv = v * (1.0 - abajo * d)
            ss = min(1.0, s * (1.0 + (saturar_sombra - 1.0) * d))
            hh = h - 0.014 * d                      # las sombras tiran a frio
        fuera.append(de_hsv(hh, ss, vv))
    return fuera


def pudrir(c, ruido=0.0):
    """
    La regla de podredumbre del juego, medida en sus propios sprites:

        verde   H 0.25->0.14   S 0.70->0.66   V 0.45->0.25
        naranja H 0.01->0.10   S 0.84->0.73   V 0.89->0.45 y 0.94->0.86

    El tono se acerca a oliva (0.13) a MEDIO camino, la saturacion baja poco y
    el brillo cae de forma desigual — ese desigual es el moteado.
    """
    h, s, v = a_hsv(c)
    oliva = 0.13
    d = ((oliva - h + 0.5) % 1.0) - 0.5             # camino corto en el circulo
    h = h + d * 0.5
    s = s * 0.90
    v = v * (0.62 - 0.22 * ruido)
    return de_hsv(h, s, v)


def enfermar(c, grado=1.0):
    """Un pez enfermo (no podrido): palido, lavado y algo verdoso."""
    h, s, v = a_hsv(c)
    d = ((0.28 - h + 0.5) % 1.0) - 0.5
    h = h + d * 0.25 * grado
    s = s * (1.0 - 0.45 * grado)
    v = v * (1.0 - 0.10 * grado) + 0.10 * grado
    return de_hsv(h, s, v)


# ===========================================================================
# AZAR REPRODUCIBLE
# ===========================================================================

def rng_de(*partes):
    """RNG sembrado con el SHA-256 del nombre: mismos bytes en cada ejecucion."""
    semilla = hashlib.sha256('|'.join(str(p) for p in partes).encode('utf-8'))
    return random.Random(int(semilla.hexdigest()[:16], 16))


# ===========================================================================
# PERFILES (siluetas curvas a resolucion nativa)
# ===========================================================================

def _pchip(xs, ys):
    """
    Derivadas de Fritsch-Carlson: la curva pasa por todos los puntos y NUNCA
    se sale del rango entre dos puntos consecutivos. Catmull-Rom si lo hace, y
    en un lomo de 10 px de alto un rebote de 1 px ya es un bulto visible.
    """
    n = len(xs)
    if n == 2:
        d = (ys[1] - ys[0]) / (xs[1] - xs[0])
        return [d, d]
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    delta = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    m[0] = delta[0]
    m[-1] = delta[-1]
    for i in range(1, n - 1):
        if delta[i - 1] * delta[i] <= 0:
            m[i] = 0.0
        else:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i])
    return m


def perfil(puntos):
    """`puntos` = [(t, alto), ...] con t de 0 a 1. Devuelve f(t) -> alto."""
    puntos = sorted(puntos)
    xs = [p[0] for p in puntos]
    ys = [p[1] for p in puntos]
    m = _pchip(xs, ys)

    def f(t):
        if t <= xs[0]:
            return ys[0]
        if t >= xs[-1]:
            return ys[-1]
        i = 0
        while i < len(xs) - 2 and t > xs[i + 1]:
            i += 1
        h = xs[i + 1] - xs[i]
        s = (t - xs[i]) / h
        s2, s3 = s * s, s * s * s
        return (ys[i] * (2 * s3 - 3 * s2 + 1) + h * m[i] * (s3 - 2 * s2 + s) +
                ys[i + 1] * (-2 * s3 + 3 * s2) + h * m[i + 1] * (s3 - s2))
    return f


# ===========================================================================
# MASCARAS
# ===========================================================================

class Mascara(object):
    """Un booleano por pixel. Todo lo que se dibuja empieza siendo una de estas."""

    __slots__ = ('w', 'h', 'd')

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.d = bytearray(w * h)

    def __contains__(self, xy):
        x, y = xy
        return bool(self.get(x, y))

    def get(self, x, y):
        # Se aceptan floats a proposito: casi todo el dibujo viene de senos,
        # cosenos y fracciones del tamano, y obligar a redondear en cada sitio
        # de llamada llenaba los pintores de int(round(...)).
        x = _redondea(x); y = _redondea(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.d[y * self.w + x]
        return 0

    def set(self, x, y, v=1):
        x = _redondea(x); y = _redondea(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            self.d[y * self.w + x] = 1 if v else 0

    def puntos(self):
        w = self.w
        d = self.d
        for i in range(len(d)):
            if d[i]:
                yield (i % w, i // w)

    def cuenta(self):
        return sum(self.d)

    def copia(self):
        m = Mascara(self.w, self.h)
        m.d = bytearray(self.d)
        return m

    def unir(self, otra):
        for i, v in enumerate(otra.d):
            if v:
                self.d[i] = 1
        return self

    def restar(self, otra):
        for i, v in enumerate(otra.d):
            if v:
                self.d[i] = 0
        return self

    def intersecar(self, otra):
        for i in range(len(self.d)):
            if not otra.d[i]:
                self.d[i] = 0
        return self

    def columna(self, x, y0, y1):
        """Rellena la columna x entre y0 e y1 (ambos incluidos)."""
        if y1 < y0:
            y0, y1 = y1, y0
        for y in range(int(math.floor(y0)), int(math.ceil(y1)) + 1):
            self.set(x, y)
        return self

    def fila(self, y, x0, x1):
        if x1 < x0:
            x0, x1 = x1, x0
        for x in range(int(math.floor(x0)), int(math.ceil(x1)) + 1):
            self.set(x, y)
        return self

    def elipse(self, cx, cy, rx, ry):
        if rx <= 0 or ry <= 0:
            return self
        for y in range(int(math.floor(cy - ry)) - 1, int(math.ceil(cy + ry)) + 2):
            for x in range(int(math.floor(cx - rx)) - 1, int(math.ceil(cx + rx)) + 2):
                dx = (x - cx) / float(rx)
                dy = (y - cy) / float(ry)
                if dx * dx + dy * dy <= 1.0:
                    self.set(x, y)
        return self

    def disco(self, cx, cy, r):
        return self.elipse(cx, cy, r, r)

    def rect(self, x0, y0, x1, y1):
        for y in range(int(round(y0)), int(round(y1)) + 1):
            for x in range(int(round(x0)), int(round(x1)) + 1):
                self.set(x, y)
        return self

    def linea(self, x0, y0, x1, y1, grosor=1):
        """Bresenham; con grosor > 1 estampa un disco en cada paso."""
        x0, y0 = int(round(x0)), int(round(y0))
        x1, y1 = int(round(x1)), int(round(y1))
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx + dy
        while True:
            if grosor <= 1:
                self.set(x0, y0)
            else:
                self.disco(x0, y0, (grosor - 1) / 2.0)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy
        return self

    def poligono(self, pts):
        """Relleno por barrido de lineas (regla par-impar)."""
        if len(pts) < 3:
            return self
        ys = [p[1] for p in pts]
        for y in range(int(math.floor(min(ys))), int(math.ceil(max(ys))) + 1):
            yc = y + 0.5
            cortes = []
            for i in range(len(pts)):
                x0, y0 = pts[i]
                x1, y1 = pts[(i + 1) % len(pts)]
                if (y0 <= yc < y1) or (y1 <= yc < y0):
                    cortes.append(x0 + (yc - y0) * (x1 - x0) / float(y1 - y0))
            cortes.sort()
            for i in range(0, len(cortes) - 1, 2):
                a = int(math.ceil(cortes[i] - 0.5))
                b = int(math.floor(cortes[i + 1] - 0.5))
                if b >= a:
                    self.fila(y, a, b)
        return self

    def dilatar(self, diagonales=False):
        m = Mascara(self.w, self.h)
        vec = [(-1, 0), (1, 0), (0, -1), (0, 1)]
        if diagonales:
            vec += [(-1, -1), (1, -1), (-1, 1), (1, 1)]
        for x, y in self.puntos():
            m.set(x, y)
            for dx, dy in vec:
                m.set(x + dx, y + dy)
        return m

    def borde(self, diagonales=False):
        """Anillo de 1 px POR FUERA de la mascara: el contorno."""
        return self.dilatar(diagonales).restar(self)

    def borde_interno(self, diagonales=False, contar_fuera=True):
        """
        Anillo de 1 px POR DENTRO.

        `contar_fuera` decide que pasa en el borde del lienzo. Con True (lo de
        siempre) un pixel pegado al borde cuenta como borde de la figura: es lo
        que quiere un icono recortado. Con False no, y eso es imprescindible en
        un TILE: la mascara de un tile de transicion llega hasta el borde
        porque sigue en el tile de al lado, y contarlo dibujaba una linea
        oscura en los cuatro lados de cada tile — una cuadricula perfecta sobre
        todo el mapa.
        """
        vec = [(-1, 0), (1, 0), (0, -1), (0, 1)]
        if diagonales:
            vec += [(-1, -1), (1, -1), (-1, 1), (1, 1)]
        m = Mascara(self.w, self.h)
        for x, y in self.puntos():
            for dx, dy in vec:
                nx, ny = x + dx, y + dy
                if not (0 <= nx < self.w and 0 <= ny < self.h):
                    if contar_fuera:
                        m.set(x, y)
                        break
                    continue
                if not self.d[ny * self.w + nx]:
                    m.set(x, y)
                    break
        return m

    def desplazar(self, dx, dy):
        m = Mascara(self.w, self.h)
        for x, y in self.puntos():
            m.set(x + dx, y + dy)
        return m

    def espejo_h(self):
        m = Mascara(self.w, self.h)
        for x, y in self.puntos():
            m.set(self.w - 1 - x, y)
        return m

    def limpiar_sueltos(self):
        """Quita pixeles sin ningun vecino en cruz: ruido, no dibujo."""
        fuera = []
        for x, y in self.puntos():
            if not (self.get(x - 1, y) or self.get(x + 1, y) or
                    self.get(x, y - 1) or self.get(x, y + 1)):
                fuera.append((x, y))
        for x, y in fuera:
            self.set(x, y, 0)
        return self

    def caja(self):
        x0 = y0 = 10 ** 9
        x1 = y1 = -1
        for x, y in self.puntos():
            if x < x0: x0 = x
            if y < y0: y0 = y
            if x > x1: x1 = x
            if y > y1: y1 = y
        return None if x1 < 0 else (x0, y0, x1, y1)


# ===========================================================================
# LIENZO
# ===========================================================================

class Lienzo(object):
    """RGBA en crudo. Se guarda tal cual: ni escalado ni interpolacion."""

    __slots__ = ('w', 'h', 'px')

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [TRANSP] * (w * h)

    def get(self, x, y):
        x = _redondea(x); y = _redondea(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[y * self.w + x]
        return TRANSP

    def set(self, x, y, c):
        x = _redondea(x); y = _redondea(y)
        if 0 <= x < self.w and 0 <= y < self.h and c is not None:
            if len(c) == 3:
                c = (c[0], c[1], c[2], 255)
            self.px[y * self.w + x] = c

    def encima(self, x, y, c):
        """Pinta solo si hay algo debajo (no crea silueta nueva)."""
        if self.get(x, y)[3]:
            self.set(x, y, c)

    def pintar(self, mascara, color):
        for x, y in mascara.puntos():
            self.set(x, y, color)
        return self

    def pintar_fn(self, mascara, fn):
        """fn(x, y) -> color o None."""
        for x, y in mascara.puntos():
            c = fn(x, y)
            if c is not None:
                self.set(x, y, c)
        return self

    def mascara_opaca(self):
        m = Mascara(self.w, self.h)
        for i, c in enumerate(self.px):
            if c[3]:
                m.d[i] = 1
        return m

    def contornear(self, mascara=None, color=None, diagonales=True, base=None):
        """
        Recorta la figura con el contorno del juego. Sin `color`, se calcula a
        partir de `base` (o del color medio de lo pintado).
        """
        m = mascara if mascara is not None else self.mascara_opaca()
        if color is None:
            color = contorno_de(base if base is not None else self.color_medio(m))
        for x, y in m.borde(diagonales).puntos():
            self.set(x, y, color)
        return self

    def color_medio(self, mascara=None):
        m = mascara if mascara is not None else self.mascara_opaca()
        n = r = g = b = 0
        for x, y in m.puntos():
            c = self.get(x, y)
            if c[3]:
                r += c[0]; g += c[1]; b += c[2]; n += 1
        if not n:
            return (128, 128, 128)
        return (r // n, g // n, b // n)

    def pegar(self, otro, dx=0, dy=0):
        for y in range(otro.h):
            for x in range(otro.w):
                c = otro.get(x, y)
                if c[3]:
                    self.set(x + dx, y + dy, c)
        return self

    def recortado(self, margen=0):
        """Devuelve un lienzo nuevo sin filas ni columnas vacias alrededor."""
        caja = self.mascara_opaca().caja()
        if caja is None:
            return Lienzo(1, 1)
        x0, y0, x1, y1 = caja
        x0 = max(0, x0 - margen); y0 = max(0, y0 - margen)
        x1 = min(self.w - 1, x1 + margen); y1 = min(self.h - 1, y1 + margen)
        nuevo = Lienzo(x1 - x0 + 1, y1 - y0 + 1)
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                nuevo.set(x - x0, y - y0, self.get(x, y))
        return nuevo

    def espejo_h(self):
        n = Lienzo(self.w, self.h)
        for y in range(self.h):
            for x in range(self.w):
                n.set(self.w - 1 - x, y, self.get(x, y))
        return n

    def imagen(self):
        im = Image.new('RGBA', (self.w, self.h))
        im.putdata(self.px)
        return im

    def guardar(self, ruta, escala=1):
        im = self.imagen()
        if escala != 1:
            im = im.resize((self.w * escala, self.h * escala), Image.NEAREST)
        carpeta = os.path.dirname(ruta)
        if carpeta and not os.path.isdir(carpeta):
            os.makedirs(carpeta)
        im.save(ruta, 'PNG', optimize=True)
        return ruta

    @staticmethod
    def desde(ruta):
        im = Image.open(ruta).convert('RGBA')
        l = Lienzo(im.size[0], im.size[1])
        l.px = list(im.getdata())
        return l


# ===========================================================================
# UTILIDADES DE DIBUJO
# ===========================================================================

def sombrear(lienzo, mascara, base, tono_fn, n=5, **kw):
    """
    Pinta `mascara` con la rampa de `base`; `tono_fn(x, y) -> 0..1` dice cuanto
    de iluminado esta cada pixel (0 = luz, 1 = sombra).
    """
    r = rampa(base, n, **kw)
    for x, y in mascara.puntos():
        t = tono_fn(x, y)
        i = int(min(n - 1, max(0, round(t * (n - 1)))))
        lienzo.set(x, y, r[i])
    return lienzo


def texto_pixel(lienzo, x, y, texto, color):
    """Digitos minimos de 3x5, solo para hojas de contacto y depuracion."""
    for i, ch in enumerate(texto):
        g = _FUENTE.get(ch.upper())
        if not g:
            continue
        for fy in range(5):
            for fx in range(3):
                if g[fy][fx] == '#':
                    lienzo.set(x + i * 4 + fx, y + fy, color)


_FUENTE = {
    '0': ['###', '# #', '# #', '# #', '###'], '1': [' # ', '## ', ' # ', ' # ', '###'],
    '2': ['###', '  #', '###', '#  ', '###'], '3': ['###', '  #', '###', '  #', '###'],
    '4': ['# #', '# #', '###', '  #', '  #'], '5': ['###', '#  ', '###', '  #', '###'],
    '6': ['###', '#  ', '###', '# #', '###'], '7': ['###', '  #', '  #', '  #', '  #'],
    '8': ['###', '# #', '###', '# #', '###'], '9': ['###', '# #', '###', '  #', '###'],
    ' ': ['   ', '   ', '   ', '   ', '   '], '-': ['   ', '   ', '###', '   ', '   '],
}


def hoja_contacto(rutas, columnas=20, escala=4, fondo=(40, 44, 52, 255), sep=2):
    """
    Junta muchos PNG en una sola imagen para poder MIRARLOS. No forma parte del
    pack: es la herramienta de revision.
    """
    ims = [Image.open(r).convert('RGBA') for r in rutas]
    if not ims:
        return None
    cw = max(i.size[0] for i in ims) + sep
    ch = max(i.size[1] for i in ims) + sep
    filas = (len(ims) + columnas - 1) // columnas
    hoja = Image.new('RGBA', (cw * columnas, ch * filas), fondo)
    for i, im in enumerate(ims):
        cx = (i % columnas) * cw + (cw - sep - im.size[0]) // 2
        cy = (i // columnas) * ch + (ch - sep - im.size[1]) // 2
        hoja.alpha_composite(im, (cx, cy))
    if escala != 1:
        hoja = hoja.resize((hoja.size[0] * escala, hoja.size[1] * escala), Image.NEAREST)
    return hoja
