#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
GF PLANTAV2 — el pincel de los cultivos de `Game/newpro/plantav2`
=============================================================================

No genera nada por si solo: lo usa `generar-plantav2.py`.

LA REFERENCIA ES LA ZANAHORIA DEL JUEGO
---------------------------------------------------------------------------
`Game/Objetos/Plantas/planta_zanahorias` son 9 imagenes y cada cultivo nuevo
lleva las mismas 9, con las mismas medidas:

    1.png         51x53  tierra SECA  + el brote recien sembrado
    2.png         51x53  tierra MOJADA + el mismo brote (ya regado)
    3.png         51x53  tierra mojada + la planta creciendo
    4.png         51x53  tierra mojada + la planta madura, lista para cosechar
    5.png         51x53  tierra mojada + la planta seca con el fruto podrido
    item_saco.png                16x20  la bolsa de semillas
    item_<x>_buen{o,a}.png       19x25  el fruto bueno
    item_<x>_podrid{o,a}.png     19x25  el fruto podrido
    planta_crecimiento_<x>.png   18x15  la planta corta (el brote suelto)

La tierra NO se dibuja: se copian tal cual `Game/Objetos/tierra_seca.png` y
`tierra_mojada.png`, y la planta se pinta encima. El saco tampoco: es el de la
zanahoria con el emblema cambiado (ver `saco_limpio`).

COMO SE DIBUJA (medido en la zanahoria, no elegido a ojo)
---------------------------------------------------------------------------
  * Contorno de 1 px POR FUERA de la figura y en cruz (4 vecinos), del color
    oscuro del propio objeto: hojas #223f14, hojas secas #38261b.
  * Donde una pieza tapa a otra (hoja sobre hoja, fruto sobre hoja) la pieza de
    detras lleva esa misma linea oscura: es lo que separa los foliolos de la
    zanahoria en vez de fundirlos en una mancha.
  * Rampas medidas: el verde de la zanahoria va de #90e019 (v .88, tono 84) a
    #30541b (v .33, tono 97) — las luces tiran a amarillo y las sombras a azul.
  * Luz de arriba a la izquierda. Sombra en la tierra = la silueta bajada 2 px
    (y 1 a la derecha), con la tierra oscurecida, no un gris encima.
  * La planta va SIEMPRE centrada en la parcela y nunca toca el marco: se
    centra por su caja y se comprueba que queda un margen libre.

POR QUE NO SALEN PIXELES SUELTOS
---------------------------------------------------------------------------
Cada pieza es una figura IMPLICITA (un eje con su anchura, o una bola con su
radio por angulo) que se muestrea 4x4 veces por pixel: un pixel es de una
pieza si la mayoria de sus muestras lo son. Despues se limpia: fuera pixeles
unidos solo en diagonal, fuera trocitos de 1-2 px separados de su pieza, y los
tallos finos se trazan como linea perfecta (sin esquinas en L) para que nunca
se corten. `comprobar()` rechaza cualquier imagen con mas de un trozo: una
hoja suelta no puede llegar al disco.

DETERMINISTA
---------------------------------------------------------------------------
No hay azar sin semilla: `GA.rng_de` (SHA-256 del nombre). Volver a ejecutar
escribe los mismos bytes.
"""

import math
import os
import sys
from collections import Counter, deque

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gf_arte as GA  # noqa: E402

SS = 4                      # muestras por lado de pixel
LUZ2 = np.array([-0.62, -0.78])          # hacia la luz, en pantalla (y abajo)
LUZ3 = np.array([-0.52, -0.62, 0.59])    # hacia la luz, (x, y abajo, fuera)
LUZ3 = LUZ3 / np.linalg.norm(LUZ3)


# ===========================================================================
# COLOR
# ===========================================================================

def C(h):
    return GA.hex_rgb(h) if isinstance(h, str) else tuple(int(v) for v in h[:3])


def rampa_hsv(h0, h1, s0, s1, v0, v1, n):
    """
    n tonos de claro (0) a oscuro (n-1), interpolando en HSV. El tono va por el
    camino CORTO del circulo (de 8 a 350 son -18 grados, no +342: si no, un
    rojo pasa por verde y azul y sale un arcoiris).
    """
    dh = ((h1 - h0 + 180.0) % 360.0) - 180.0
    out = []
    for i in range(n):
        k = i / float(max(1, n - 1))
        out.append(GA.de_hsv(((h0 + dh * k) % 360) / 360.0,
                             s0 + (s1 - s0) * k, v0 + (v1 - v0) * k))
    return out


def oscuro(c, v=0.25, s=None):
    """El contorno de una pieza: su tono, brillo hundido (la zanahoria: v .25)."""
    h, ss, _ = GA.a_hsv(C(c))
    return GA.de_hsv(h, ss if s is None else s, v)


class Material(object):
    """Una rampa (claro -> oscuro) y el color de su contorno."""

    __slots__ = ('rampa', 'contorno', 'nombre')

    def __init__(self, rampa, contorno, nombre=''):
        self.rampa = [C(c) for c in rampa]
        self.contorno = C(contorno)
        self.nombre = nombre

    def n(self):
        return len(self.rampa)

    def mezclado(self, otro, t):
        """Material intermedio (para hojas que amarillean, frutos que maduran)."""
        n = max(self.n(), otro.n())
        ra = _estira(self.rampa, n)
        rb = _estira(otro.rampa, n)
        return Material([GA.mezcla(a, b, t) for a, b in zip(ra, rb)],
                        GA.mezcla(self.contorno, otro.contorno, t))


def _estira(rampa, n):
    if len(rampa) == n:
        return list(rampa)
    out = []
    for i in range(n):
        u = i * (len(rampa) - 1) / float(max(1, n - 1))
        a = int(math.floor(u))
        b = min(len(rampa) - 1, a + 1)
        out.append(GA.mezcla(rampa[a], rampa[b], u - a))
    return out


def desplaza(mat, k=1):
    """La misma rampa corrida `k` tonos hacia lo oscuro (rayas, costillas)."""
    r = list(mat.rampa)
    r = r[k:] + [r[-1]] * k if k > 0 else [r[0]] * (-k) + r[:len(r) + k]
    return Material(r, mat.contorno)


def podrido(mat, fuerza=1.0):
    """La regla del juego (gf_arte.pudrir) aplicada a toda una rampa."""
    r = [GA.mezcla(c, GA.pudrir(c, 0.3), fuerza) for c in mat.rampa]
    return Material(r, GA.mezcla(mat.contorno, (0x29, 0x24, 0x0e), fuerza))


# Verdes medidos en el juego (ver cabecera). Cada uno con 8 tonos.
VERDE = {
    # zanahoria: amarillo verdoso muy saturado
    'zanahoria': Material(rampa_hsv(83, 98, .86, .72, .91, .36, 8), '#223f14'),
    # tomate: algo menos amarillo
    'tomate': Material(rampa_hsv(86, 97, .82, .80, .84, .33, 8), '#264710'),
    # calabaza: oliva apagado
    'oliva': Material(rampa_hsv(78, 104, .60, .48, .78, .34, 8), '#244326'),
    # hoja oscura y brillante (espinaca, albahaca, pimiento)
    'oscuro': Material(rampa_hsv(92, 112, .74, .80, .76, .27, 8), '#163312'),
    # verde azulado (col, puerro, cebolla, col rizada)
    'azulado': Material(rampa_hsv(112, 150, .38, .52, .80, .30, 8), '#16332a'),
    # verde lima claro (lechuga, apio)
    'lima': Material(rampa_hsv(76, 94, .66, .82, .95, .42, 8), '#26450f'),
    # verde grisaceo (berenjena, colinabo)
    'gris': Material(rampa_hsv(96, 128, .40, .50, .74, .30, 8), '#1d3322'),
}

# Hoja seca, medida en la etapa 5 de la zanahoria: #cd874f -> #7b4a2b, contorno #38261b
SECO = Material(rampa_hsv(28, 21, .56, .68, .84, .40, 7), '#38261b')
SECO_OSCURO = Material(rampa_hsv(25, 18, .58, .66, .66, .30, 7), '#2e1f16')


# ===========================================================================
# GEOMETRIA
# ===========================================================================

def remuestrear(P, n):
    P = np.asarray(P, float)
    seg = np.sqrt(((P[1:] - P[:-1]) ** 2).sum(1))
    L = np.concatenate([[0.0], np.cumsum(seg)])
    if L[-1] <= 1e-9:
        return np.repeat(P[:1], n, 0)
    u = np.linspace(0, L[-1], n)
    return np.stack([np.interp(u, L, P[:, 0]), np.interp(u, L, P[:, 1])], 1)


def curva(ctrl, n=40):
    """Catmull-Rom uniforme por los puntos de control, remuestreada por arco."""
    P = np.asarray(ctrl, float)
    if len(P) < 3:
        return remuestrear(P, n)
    ext = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    out = []
    for i in range(len(P) - 1):
        p0, p1, p2, p3 = ext[i], ext[i + 1], ext[i + 2], ext[i + 3]
        for k in range(24):
            t = k / 24.0
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t +
                              (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                              (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-1])
    return remuestrear(np.array(out), n)


def arco(base, ang, largo, curv=0.0, n=40, giro_final=None):
    """
    Eje de una hoja/tallo que sale de `base` con angulo `ang` (grados, 0 = a
    la derecha, -90 = arriba) y se va doblando `curv` grados en total.
    """
    pts = [np.array(base, float)]
    a = math.radians(ang)
    da = math.radians(curv) / (n - 1)
    paso = largo / float(n - 1)
    p = np.array(base, float)
    for i in range(n - 1):
        aa = a + da * (i + 0.5)
        p = p + paso * np.array([math.cos(aa), math.sin(aa)])
        pts.append(p.copy())
    return np.array(pts)


# ---------------------------------------------------------------------------
# 3D LIGERO: la planta se piensa en el mundo y se proyecta como el juego
# (vista oblicua: el suelo se ve desde arriba y la altura sube en pantalla).
#     X a la derecha, Y hacia arriba (altura), Z hacia el que mira (abajo en
#     pantalla). Azimut 0 = derecha, 90 = hacia el que mira, 180 = izquierda,
#     270 = hacia el fondo.
# ---------------------------------------------------------------------------
KZ = 0.78        # el suelo se acorta un poco al alejarse (camara a ~45 grados)
KY = 0.96        # la altura casi a escala
VISTA = np.array([0.0, math.sin(math.radians(42)), math.cos(math.radians(42))])


def proyecta(base, P3):
    """base = (x, y) en pantalla del pie de la planta; P3 = (n, 3) mundo."""
    P3 = np.asarray(P3, float)
    return np.stack([base[0] + P3[:, 0], base[1] + P3[:, 2] * KZ - P3[:, 1] * KY], 1)


def espina3d(az, el0, el1, largo, n=40, origen=(0.0, 0.0, 0.0), curva_el=1.25, giro=0.0):
    """
    Eje en 3D que sale de `origen` con azimut `az` y elevacion que pasa de
    `el0` a `el1` (grados): una hoja que nace erguida y se va abriendo.
    `giro` tuerce el azimut a lo largo (grados en total).
    """
    p = np.array(origen, float)
    pts = [p.copy()]
    paso = largo / float(n - 1)
    for i in range(n - 1):
        u = (i + 0.5) / float(n - 1)
        el = math.radians(el0 + (el1 - el0) * (u ** curva_el))
        a = math.radians(az + giro * u)
        d = np.array([math.cos(el) * math.cos(a), math.sin(el), math.cos(el) * math.sin(a)])
        p = p + d * paso
        pts.append(p.copy())
    return np.array(pts)


def curva3d(ctrl, n=32):
    """Catmull-Rom en 3D por los puntos de control, remuestreada por arco."""
    Pc = np.asarray(ctrl, float)
    if len(Pc) < 2:
        return np.repeat(Pc[:1], n, 0)
    if len(Pc) == 2:
        out = np.array([Pc[0] + (Pc[1] - Pc[0]) * k / 24.0 for k in range(25)])
    else:
        ext = np.vstack([2 * Pc[0] - Pc[1], Pc, 2 * Pc[-1] - Pc[-2]])
        pts = []
        for i in range(len(Pc) - 1):
            p0, p1, p2, p3 = ext[i], ext[i + 1], ext[i + 2], ext[i + 3]
            for k in range(24):
                t = k / 24.0
                t2, t3 = t * t, t * t * t
                pts.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                                  (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
        pts.append(Pc[-1])
        out = np.array(pts)
    seg = np.sqrt(((out[1:] - out[:-1]) ** 2).sum(1))
    L = np.concatenate([[0.0], np.cumsum(seg)])
    u = np.linspace(0, L[-1], n)
    return np.stack([np.interp(u, L, out[:, k]) for k in range(3)], 1)


def en_curva3d(C3, t):
    """Punto y direccion (3D) a la fraccion t de una curva remuestreada."""
    k = min(len(C3) - 2, max(0, int(t * (len(C3) - 1))))
    p = C3[min(len(C3) - 1, int(round(t * (len(C3) - 1))))]
    d = C3[k + 1] - C3[k]
    d = d / max(1e-9, np.linalg.norm(d))
    return p, d


def az_el(d):
    """Azimut y elevacion (grados) de una direccion 3D."""
    el = math.degrees(math.asin(max(-1.0, min(1.0, d[1]))))
    az = math.degrees(math.atan2(d[2], d[0]))
    return az, el


def ancho_visible(az, el):
    """Cuanto se ve de cara una hoja (0.5 de canto .. 1 de frente)."""
    a = math.radians(az)
    e = math.radians(el)
    d = np.array([math.cos(e) * math.cos(a), math.sin(e), math.cos(e) * math.sin(a)])
    h = np.array([-math.sin(a), 0.0, math.cos(a)])
    nrm = np.cross(d, h)
    nrm /= max(1e-9, np.linalg.norm(nrm))
    return 0.52 + 0.48 * abs(float(nrm @ VISTA))


def tangentes(S):
    T = np.gradient(S, axis=0)
    return T / np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-9)


def coords_espina(S, Q):
    """Para cada punto de Q: (t 0..1 a lo largo del eje, distancia CON SIGNO)."""
    A = S[:-1]
    B = S[1:]
    AB = B - A
    L2 = np.maximum((AB ** 2).sum(1), 1e-12)
    AQ = Q[:, None, :] - A[None, :, :]
    u = np.clip((AQ * AB[None]).sum(2) / L2[None], 0.0, 1.0)
    P = A[None] + u[..., None] * AB[None]
    d2 = ((Q[:, None, :] - P) ** 2).sum(2)
    k = np.argmin(d2, 1)
    i = np.arange(len(Q))
    uu = u[i, k]
    t = (k + uu) / float(len(S) - 1)
    cruz = AB[k, 0] * AQ[i, k, 1] - AB[k, 1] * AQ[i, k, 0]
    d = np.sqrt(d2[i, k]) * np.where(cruz >= 0, 1.0, -1.0)
    return t, d, k


def _interp_t(t, n):
    return np.clip(t, 0, 1) * (n - 1)


def suave(ts, vs):
    """Perfil monotono por tramos (PCHIP de gf_arte) vectorizado."""
    f = GA.perfil(list(zip(ts, vs)))
    tabla_t = np.linspace(0, 1, 201)
    tabla_v = np.array([f(x) for x in tabla_t])

    def g(t):
        return np.interp(np.clip(t, 0, 1), tabla_t, tabla_v)
    return g


# ===========================================================================
# PIEZAS
# ===========================================================================

class Pieza(object):
    """Base: z (delante = mayor), material, grupo (sin linea interna dentro)."""

    orden_global = [0]

    def __init__(self, z, mat, grupo=None, lineas=True):
        self.z = float(z)
        self.mat = mat
        self.grupo = grupo if grupo is not None else id(self)
        self.lineas = lineas
        Pieza.orden_global[0] += 1
        self.orden = Pieza.orden_global[0]
        self.fino = None          # polilinea para trazar como linea perfecta
        self.recorte = None       # f(X, Y) -> bool que se queda

    def caja(self):
        raise NotImplementedError

    def dentro(self, Q):
        raise NotImplementedError

    def pintar(self, Q, sombra):
        raise NotImplementedError

    def _indice(self, brillo, sombra, n=None):
        """brillo 0..1 (1 = luz) -> indice de rampa (0 = el mas claro)."""
        n = n or self.mat.n()
        i = np.rint((1.0 - np.clip(brillo, 0, 1)) * (n - 1)).astype(int)
        return np.clip(i + sombra, 0, n - 1)


class Eje(Pieza):
    """
    Una figura alrededor de un eje: hojas, tallos, vainas, raices largas.

    `ancho(t)` es la media anchura en px (o dos funciones, izquierda/derecha
    segun el lado de la normal). `borde(t, lado)` multiplica la anchura para
    hacer lobulos y dientes. `modelo` decide la luz:
        'hoja'   superficie plegada por el nervio y algo cóncava
        'tubo'   cilindro (tallo, pepino, puerro)
    """

    def __init__(self, espina, ancho, mat, z, modelo='hoja', borde=None,
                 grupo=None, lineas=True, pliegue=0.22, copa=0.10,
                 punta_clara=0.22, base_oscura=0.25, nervio=None,
                 nervio_t=(0.04, 0.82), nervios=None, brillo0=0.56,
                 tapas=True, extra=None, fino=None):
        Pieza.__init__(self, z, mat, grupo, lineas)
        self.S = np.asarray(espina, float)
        self.T = tangentes(self.S)
        self.N = np.stack([-self.T[:, 1], self.T[:, 0]], 1)
        if callable(ancho):
            self.wI = self.wD = ancho
        else:
            self.wI, self.wD = ancho
        self.borde = borde
        self.modelo = modelo
        self.pliegue = pliegue
        self.copa = copa
        self.punta_clara = punta_clara
        self.base_oscura = base_oscura
        self.nervio = nervio          # None | int (pasos mas oscuro) | RGB
        self.nervio_t = nervio_t
        self.nervios = nervios        # None | (separacion px, angulo, pasos)
        self.brillo0 = brillo0
        self.tapas = tapas
        self.extra = extra            # f(t, s, d, Q) -> (indices, colores|None)
        if fino:
            self.fino = self.S

    def _anchura(self, t, lado):
        w = np.where(lado > 0, self.wI(t), self.wD(t))
        if self.borde is not None:
            w = w * self.borde(t, lado)
        return w

    def caja(self):
        tt = np.linspace(0, 1, len(self.S))
        w = np.maximum(self.wI(tt), self.wD(tt)).max() * 1.4 + 1.5
        return (self.S[:, 0].min() - w, self.S[:, 1].min() - w,
                self.S[:, 0].max() + w, self.S[:, 1].max() + w)

    def dentro(self, Q):
        t, d, _ = coords_espina(self.S, Q)
        lado = np.where(d >= 0, 1.0, -1.0)
        w = self._anchura(t, lado)
        ok = np.abs(d) <= w
        if not self.tapas:
            # sin tapas redondas: corta lo que cae mas alla de los extremos
            A0, T0 = self.S[0], self.T[0]
            A1, T1 = self.S[-1], self.T[-1]
            ok &= ((Q - A0) @ T0) >= -0.05
            ok &= ((Q - A1) @ T1) <= 0.05
        return ok

    def pintar(self, Q, sombra):
        t, d, k = coords_espina(self.S, Q)
        lado = np.where(d >= 0, 1.0, -1.0)
        w = np.maximum(self._anchura(t, lado), 0.55)
        s = np.clip(d / w, -1, 1)
        Nk = self.N[k]
        ndl = Nk @ LUZ2                           # cuanto mira la normal a la luz
        if self.modelo == 'tubo':
            nz = np.sqrt(np.maximum(0.0, 1 - s * s))
            n3 = np.stack([Nk[:, 0] * s, Nk[:, 1] * s, nz], 1)
            b = 0.5 + 0.5 * (n3 @ LUZ3)
            b = 0.10 + 0.95 * b
            b = b + self.punta_clara * (t - 0.5) * 0.4
        else:
            b = (self.brillo0
                 + self.pliegue * lado * ndl
                 + self.copa * s * ndl
                 + self.punta_clara * (t - 0.45)
                 - self.base_oscura * np.clip((0.22 - t) / 0.22, 0, 1))
        idx = self._indice(b, sombra)
        cols = np.array(self.mat.rampa)[idx]
        # nervio central
        if self.nervio is not None:
            m = (np.abs(d) < 0.62) & (t > self.nervio_t[0]) & (t < self.nervio_t[1])
            m &= w > 1.6
            if isinstance(self.nervio, int):
                ii = np.clip(idx + self.nervio, 0, self.mat.n() - 1)
                cols[m] = np.array(self.mat.rampa)[ii[m]]
            else:
                cols[m] = np.array(C(self.nervio))
        if self.nervios is not None:
            sep, ang, pasos = self.nervios
            # nervios secundarios: rayas que salen del central hacia la punta
            L = self.largo()
            u = t * L - np.abs(d) * math.tan(math.radians(ang))
            fase = np.mod(u, sep)
            m = (fase < 0.9) & (np.abs(d) > 0.9) & (np.abs(s) < 0.82) & (t > 0.12) & (t < 0.9)
            ii = np.clip(idx + pasos, 0, self.mat.n() - 1)
            cols[m] = np.array(self.mat.rampa)[ii[m]]
        if self.extra is not None:
            cols = self.extra(t, s, d, Q, idx, cols)
        return cols

    def largo(self):
        return float(np.sqrt(((self.S[1:] - self.S[:-1]) ** 2).sum(1)).sum())


class Bola(Pieza):
    """
    Figura alrededor de un centro: frutos, bulbos, cabezas de col.
    `radio(th)` multiplica rx/ry por angulo (lobulos, costillas, forma de pera).
    La luz es la de una esfera: brillo arriba a la izquierda.
    """

    def __init__(self, centro, rx, ry, mat, z, radio=None, giro=0.0,
                 grupo=None, lineas=True, brillo_extra=0.0, especular=0.93,
                 extra=None, plano=0.0):
        Pieza.__init__(self, z, mat, grupo, lineas)
        self.c = np.array(centro, float)
        self.rx = float(rx)
        self.ry = float(ry)
        self.radio = radio
        self.giro = math.radians(giro)
        self.brillo_extra = brillo_extra
        self.especular = especular
        self.extra = extra
        self.plano = plano   # 0 = esfera, 1 = disco plano (menos volumen)

    def _local(self, Q):
        d = Q - self.c
        cg, sg = math.cos(-self.giro), math.sin(-self.giro)
        x = d[:, 0] * cg - d[:, 1] * sg
        y = d[:, 0] * sg + d[:, 1] * cg
        th = np.arctan2(y / self.ry, x / self.rx)
        f = self.radio(th) if self.radio is not None else 1.0
        u = x / (self.rx * f)
        v = y / (self.ry * f)
        return u, v, th

    def caja(self):
        r = max(self.rx, self.ry) * 1.6 + 1.5
        return (self.c[0] - r, self.c[1] - r, self.c[0] + r, self.c[1] + r)

    def dentro(self, Q):
        u, v, _ = self._local(Q)
        return u * u + v * v <= 1.0

    def normal(self, Q):
        u, v, th = self._local(Q)
        r2 = np.clip(u * u + v * v, 0, 1)
        nz = np.sqrt(1 - r2) * (1 - self.plano) + self.plano
        cg, sg = math.cos(self.giro), math.sin(self.giro)
        nx = u * cg - v * sg
        ny = u * sg + v * cg
        n = np.stack([nx, ny, nz], 1)
        return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9), u, v, th

    def pintar(self, Q, sombra):
        n, u, v, th = self.normal(Q)
        ldot = n @ LUZ3
        b = 0.5 + 0.5 * ldot + self.brillo_extra
        n_r = self.mat.n()
        # el tono mas claro queda para el brillo especular
        i = np.rint((1.0 - np.clip(b, 0, 1)) * (n_r - 2)).astype(int) + 1
        i = np.where(ldot > self.especular, 0, i)
        i = np.clip(i + sombra, 0, n_r - 1)
        cols = np.array(self.mat.rampa)[i]
        if self.extra is not None:
            cols = self.extra(u, v, th, n, i, cols, Q)
        return cols


class Tallo(Eje):
    """Un tallo: tubo fino. Si mide menos de 1.5 px se traza como linea."""

    def __init__(self, espina, grosor0, grosor1, mat, z, grupo=None, lineas=True, **kw):
        g0 = grosor0 / 2.0
        g1 = grosor1 / 2.0
        anch = (lambda t: g0 + (g1 - g0) * t)
        Eje.__init__(self, espina, anch, mat, z, modelo='tubo', grupo=grupo,
                     lineas=lineas, punta_clara=0.0, **kw)
        if max(grosor0, grosor1) < 1.6:
            self.fino = self.S


# ---------------------------------------------------------------------------
# FORMAS DE HOJA (media anchura relativa a lo largo del eje, 0 base .. 1 punta)
# ---------------------------------------------------------------------------
FORMAS = {
    'ovada': ([0, .18, .42, .68, .88, 1], [.30, .78, 1.0, .82, .45, 0]),
    'eliptica': ([0, .14, .5, .86, 1], [.30, .84, 1.0, .84, 0]),
    'redonda': ([0, .10, .38, .66, .86, 1], [.42, .88, 1.0, .96, .70, 0]),
    'lanceolada': ([0, .14, .32, .62, .86, 1], [.30, .80, 1.0, .66, .30, 0]),
    'obovada': ([0, .2, .5, .72, .9, 1], [.22, .52, .82, 1.0, .82, 0]),
    'cinta': ([0, .1, .7, .92, 1], [.85, 1.0, .92, .55, 0]),
    'corazon': ([0, .08, .26, .55, .82, 1], [.55, .96, 1.0, .74, .34, 0]),
    # cotiledon: base ESTRECHA, para que las dos hojitas del brote se lean como
    # dos y no se fundan en un corazon
    'cotiledon': ([0, .16, .46, .78, .93, 1], [.12, .72, 1.0, .86, .5, 0]),
}


def forma(nombre, ancho):
    ts, vs = FORMAS[nombre]
    return suave(ts, [v * ancho for v in vs])


def dientes(n, prof=0.35, fase=0.0, t0=0.12, t1=0.95):
    """
    Dientes de sierra que miran a la punta (n por lado). La rampa es LINEAL:
    con una curva (1-fr)^2 la muesca solo era honda en un punto y el muestreo
    4x4 la borraba entera (la col rizada salia lisa).
    """
    def f(t, lado):
        u = (t - t0) / (t1 - t0) * n + fase + np.where(lado > 0, 0.0, 0.5)
        fr = u - np.floor(u)
        m = (t > t0) & (t < t1)
        return np.where(m, 1 - prof * (1 - fr), 1.0)
    return f


def ondas(n, prof=0.18, fase=0.0, t0=0.10, t1=0.96, irregular=0.35):
    """Borde ondulado con dos armonicos (un ritmo fijo se ve como una sierra)."""
    def f(t, lado):
        ph = fase + np.where(lado > 0, 0.0, 1.7)
        u = (t - t0) / (t1 - t0)
        o = (0.5 + 0.5 * np.cos(2 * np.pi * n * u + ph)) * (1 - irregular) + \
            irregular * (0.5 + 0.5 * np.cos(2 * np.pi * (n * 0.53) * u + ph * 1.9))
        m = (t > t0) & (t < t1)
        return np.where(m, 1 - prof * o, 1.0)
    return f


def gira(v, grados):
    a = math.radians(grados)
    c, s = math.cos(a), math.sin(a)
    return np.array([v[0] * c - v[1] * s, v[0] * s + v[1] * c])


def ang_de(v):
    return math.degrees(math.atan2(v[1], v[0]))


def const(v):
    def f(t):
        return np.full_like(np.asarray(t, float), v)
    return f


def hoja3d(base, az, el0, el1, largo, ancho, fm, mat, grupo, peciolo=0.0,
           grosor_peciolo=1.0, borde=None, nervio=2, zextra=0.0, brillo=0.0,
           pliegue=0.22, giro=0.0, origen=(0.0, 0.0, 0.0), mat_peciolo=None,
           curva_el=1.25, nervios=None, copa=0.10, extra=None, ancho_fijo=False):
    """
    Hoja simple pensada en 3D: nace en `origen` (mundo, relativo al pie
    `base` en pantalla), sube con elevacion el0 y se abre hasta el1. Si lleva
    `peciolo` (fraccion del largo) ese tramo es un rabito fino del mismo grupo
    y la lamina ocupa el resto. Devuelve la lista de piezas.
    """
    P3 = espina3d(az, el0, el1, largo, origen=origen, giro=giro, curva_el=curva_el)
    S = proyecta(base, P3)
    vis = 1.0 if ancho_fijo else ancho_visible(az, (el0 + el1) / 2.0)
    z = float(P3[:, 2].mean()) + zextra
    piezas = []
    n = len(S)
    if peciolo > 0:
        k = max(1, int(round(peciolo * (n - 1))))
        Sp = S[:k + 1]
        Sl = S[k:]
        pec = Eje(remuestrear(Sp, max(4, k + 1)), const(grosor_peciolo / 2.0),
                  mat_peciolo or mat, z + 0.01, modelo='tubo', grupo=grupo,
                  punta_clara=0.0)
        if grosor_peciolo < 1.6:
            pec.fino = pec.S
        piezas.append(pec)
    else:
        Sl = S
    lam = Eje(remuestrear(Sl, 32), forma(fm, ancho * vis), mat, z, grupo=grupo,
              borde=borde, nervio=nervio, pliegue=pliegue, nervios=nervios,
              copa=copa, extra=extra)
    lam.brillo0 += brillo
    piezas.append(lam)
    return piezas


def tallo3d(base, puntos3d, grosor0, grosor1, mat, grupo, zextra=0.0, lineas=True):
    """Un tallo que pasa por puntos del mundo (lista de (x, y, z))."""
    P3 = np.asarray(puntos3d, float)
    S = curva(proyecta(base, P3), 32)
    z = float(P3[:, 2].mean()) + zextra
    return Tallo(S, grosor0, grosor1, mat, z, grupo=grupo, lineas=lineas)


def hoja_compuesta(espina, mat, z, grupo, foliolos, raquis=0.7, raquis_mat=None,
                   nervio=1, brillo=0.0, pliegue=0.22):
    """
    Una hoja hecha de piezas del MISMO grupo (sin lineas entre ellas): el raquis
    (eje fino) y sus foliolos/lobulos. Asi se dibujan la zanahoria, el rabano,
    la patata o la judia: cada lobulo recibe su propia luz y la hoja sale con
    el moteado de la del juego en vez de una mancha lisa.

    foliolos: lista de (t, lado, angulo, largo, ancho, forma[, curva, borde])
        t      donde nace en el raquis (0..1)
        lado   +1 / -1 (a cada lado) o 0 (el terminal, sigue al raquis)
        angulo grados respecto al raquis
    """
    S = np.asarray(espina, float)
    T = tangentes(S)
    piezas = []
    if raquis and raquis > 0:
        # el raquis va DEBAJO de sus foliolos: solo asoma donde no hay lamina
        # (encima pintaba una raya clara por cada lobulo: ruido)
        r = Eje(S, const(raquis / 2.0), raquis_mat or mat, z - 0.01, modelo='tubo',
                grupo=grupo, punta_clara=0.0)
        if raquis < 1.6:
            r.fino = S
        piezas.append(r)
    for f in foliolos:
        t, lado, ang, largo, ancho, fm = f[:6]
        curv = f[6] if len(f) > 6 else 0.0
        borde = f[7] if len(f) > 7 else None
        k = min(len(S) - 1, max(0, int(round(t * (len(S) - 1)))))
        base = S[k]
        dirv = T[k] if lado == 0 else gira(T[k], lado * ang)
        if lado == 0:
            dirv = gira(T[k], ang)
        e = arco(base, ang_de(dirv), largo, curv * (lado if lado else 1), n=24)
        h = Eje(e, forma(fm, ancho), mat, z, grupo=grupo, borde=borde,
                nervio=nervio if ancho >= 2.2 else None, pliegue=pliegue,
                nervio_t=(0.05, 0.8))
        h.brillo0 += brillo
        piezas.append(h)
    return piezas


# ---------------------------------------------------------------------------
# DETALLES PINTADOS: manchas de podrido, meridianos, rayas
# (siempre manchas GRANDES e irregulares, nunca motas: tripofobia)
# ---------------------------------------------------------------------------

def _mancha_forma(rng_id, k):
    r = GA.rng_de('mancha', rng_id, k)
    return r.uniform(0, 6.28), r.uniform(0.10, 0.22), r.uniform(0, 6.28), r.uniform(0.05, 0.12)


def manchas_bola(lista, mat_mancha, rng_id='m'):
    """lista de (u0, v0, a, b): elipses deformadas en coords locales (-1..1)."""
    def extra(u, v, th, n, i, cols, Q):
        m = np.zeros(len(u), bool)
        for k, (u0, v0, a, b) in enumerate(lista):
            f1, a1, f2, a2 = _mancha_forma(rng_id, k)
            ang = np.arctan2(v - v0, u - u0)
            rr = 1 + a1 * np.cos(2 * ang + f1) + a2 * np.cos(3 * ang + f2)
            m |= ((u - u0) / a) ** 2 + ((v - v0) / b) ** 2 <= rr * rr
        ii = np.clip(i, 0, mat_mancha.n() - 1)
        cols[m] = np.array(mat_mancha.rampa)[ii[m]]
        return cols
    return extra


def manchas_eje(lista, mat_mancha, rng_id='m'):
    """lista de (t0, s0, at, as) en coords del eje (t 0..1, s -1..1)."""
    def extra(t, s, d, Q, idx, cols):
        m = np.zeros(len(t), bool)
        for k, (t0, s0, at, as_) in enumerate(lista):
            f1, a1, f2, a2 = _mancha_forma(rng_id, k)
            ang = np.arctan2(s - s0, t - t0)
            rr = 1 + a1 * np.cos(2 * ang + f1) + a2 * np.cos(3 * ang + f2)
            m |= ((t - t0) / at) ** 2 + ((s - s0) / as_) ** 2 <= rr * rr
        ii = np.clip(idx, 0, mat_mancha.n() - 1)
        cols[m] = np.array(mat_mancha.rampa)[ii[m]]
        return cols
    return extra


def encadena(*fs):
    """Varios `extra` de Bola en fila."""
    fs = [f for f in fs if f is not None]

    def extra(u, v, th, n, i, cols, Q):
        for f in fs:
            cols = f(u, v, th, n, i, cols, Q)
        return cols
    return extra if fs else None


def encadena_eje(*fs):
    fs = [f for f in fs if f is not None]

    def extra(t, s, d, Q, idx, cols):
        for f in fs:
            cols = f(t, s, d, Q, idx, cols)
        return cols
    return extra if fs else None


def meridianos(longitudes, mat, pasos=2, grosor=0.09, v_lim=(-0.92, 0.92)):
    """Lineas de polo a polo (dientes de ajo, gajos de cebolla, costillas)."""
    rampa = np.array(mat.rampa)

    def extra(u, v, th, n, i, cols, Q):
        m = np.zeros(len(u), bool)
        for lon in longitudes:
            x = math.sin(math.radians(lon)) * np.sqrt(np.clip(1 - v * v, 0, 1))
            m |= (np.abs(u - x) < grosor + 0.04 * (1 - np.abs(v))) & (v > v_lim[0]) & (v < v_lim[1])
        ii = np.clip(i + pasos, 0, len(rampa) - 1)
        cols[m] = rampa[ii[m]]
        return cols
    return extra


def rayas_bola(n, ancho=0.32, mat_raya=None, giro=0.0, ondula=0.10):
    """Bandas de polo a polo (sandia): se ven anchas en el centro y se cierran."""
    def extra(u, v, th, nrm, i, cols, Q):
        # longitud sobre la esfera, eje vertical
        lon = np.arctan2(nrm[:, 0], np.maximum(nrm[:, 2], 1e-3))
        lon = lon + ondula * np.sin(v * 7.0) + math.radians(giro)
        fase = (lon / (2 * np.pi) * n) % 1.0
        m = fase < ancho
        ii = np.clip(i, 0, mat_raya.n() - 1)
        cols[m] = np.array(mat_raya.rampa)[ii[m]]
        return cols
    return extra


def rayas_eje(n, ancho=0.3, mat_raya=None, ondula=0.0, t0=0.0, t1=1.0):
    """Rayas a lo largo de un tubo (pepino, calabacin)."""
    def extra(t, s, d, Q, idx, cols):
        lon = np.arcsin(np.clip(s, -1, 1))
        fase = ((lon / np.pi + 0.5) * n + ondula * np.sin(t * 9.0)) % 1.0
        m = (fase < ancho) & (t > t0) & (t < t1)
        ii = np.clip(idx, 0, mat_raya.n() - 1)
        cols[m] = np.array(mat_raya.rampa)[ii[m]]
        return cols
    return extra


def dos_tonos_bola(mat_abajo, corte=0.0, onda=0.10, suave_k=3):
    """Arriba el material de la pieza, abajo otro (nabo: morado y blanco)."""
    def extra(u, v, th, n, i, cols, Q):
        lim = corte + onda * np.sin(u * 5.0 + 0.7)
        m = v > lim
        ii = np.clip(i, 0, mat_abajo.n() - 1)
        cols[m] = np.array(mat_abajo.rampa)[ii[m]]
        return cols
    return extra


# ===========================================================================
# ESCENA: rasterizado, limpieza, contornos
# ===========================================================================

def linea_perfecta(S):
    """Pixeles de una polilinea, 8-conexos y sin esquinas en L."""
    pts = []
    for i in range(len(S) - 1):
        a, b = S[i], S[i + 1]
        n = max(2, int(math.ceil(np.linalg.norm(b - a) / 0.2)))
        for k in range(n):
            p = a + (b - a) * (k / float(n))
            q = (int(math.floor(p[0])), int(math.floor(p[1])))
            if not pts or pts[-1] != q:
                pts.append(q)
    q = (int(math.floor(S[-1][0])), int(math.floor(S[-1][1])))
    if not pts or pts[-1] != q:
        pts.append(q)
    # pasos de dos en dos en un solo eje -> rellenar (no deberia pasar)
    limpio = []
    i = 0
    while i < len(pts):
        if (len(limpio) >= 1 and i + 1 < len(pts)):
            a = limpio[-1]
            b = pts[i]
            c = pts[i + 1]
            if (abs(a[0] - c[0]) == 1 and abs(a[1] - c[1]) == 1 and
                    abs(a[0] - b[0]) + abs(a[1] - b[1]) == 1):
                i += 1          # esquina en L: se salta
                continue
        limpio.append(pts[i])
        i += 1
    return limpio


def _vecinos4(a, fill=-1):
    """Devuelve los 4 desplazados de `a` (el valor del vecino en cada pixel)."""
    H, W = a.shape
    out = []
    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        b = np.full_like(a, fill)
        ys = slice(max(0, -dy), H - max(0, dy))
        yd = slice(max(0, dy), H - max(0, -dy))
        xs = slice(max(0, -dx), W - max(0, dx))
        xd = slice(max(0, dx), W - max(0, -dx))
        # b[y, x] = a[y + dy, x + dx]
        b[ys, xs] = a[yd, xd]
        out.append(b)
    return out


def _desplaza(a, dx, dy, fill):
    H, W = a.shape
    b = np.full_like(a, fill)
    ys = slice(max(0, -dy), H - max(0, dy))
    yd = slice(max(0, dy), H - max(0, -dy))
    xs = slice(max(0, -dx), W - max(0, dx))
    xd = slice(max(0, dx), W - max(0, -dx))
    b[ys, xs] = a[yd, xd]
    return b


def componentes(mask, ocho=True):
    """Etiquetas de componentes conexas (BFS; las imagenes son pequenas)."""
    H, W = mask.shape
    lab = np.full((H, W), -1, int)
    comps = []
    vec = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    if ocho:
        vec += [(-1, -1), (1, -1), (-1, 1), (1, 1)]
    for y0 in range(H):
        for x0 in range(W):
            if mask[y0, x0] and lab[y0, x0] < 0:
                k = len(comps)
                cola = deque([(x0, y0)])
                lab[y0, x0] = k
                pix = []
                while cola:
                    x, y = cola.popleft()
                    pix.append((x, y))
                    for dx, dy in vec:
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < W and 0 <= ny < H and mask[ny, nx] and lab[ny, nx] < 0:
                            lab[ny, nx] = k
                            cola.append((nx, ny))
                comps.append(pix)
    return lab, comps


class Escena(object):
    def __init__(self, W, H):
        self.W, self.H = W, H
        self.piezas = []

    def pon(self, *piezas):
        for p in piezas:
            if p is not None:
                self.piezas.append(p)
        return self

    # ------------------------------------------------------------------
    def render(self, sombra_interna=True):
        W, H = self.W, self.H
        pz = sorted(self.piezas, key=lambda p: (p.z, p.orden))
        n = len(pz)
        sub = np.full((H * SS, W * SS), -1, np.int32)
        off = (np.arange(SS) + 0.5) / SS
        for i, p in enumerate(pz):
            x0, y0, x1, y1 = p.caja()
            x0 = max(0, int(math.floor(x0)))
            y0 = max(0, int(math.floor(y0)))
            x1 = min(W - 1, int(math.ceil(x1)))
            y1 = min(H - 1, int(math.ceil(y1)))
            if x1 < x0 or y1 < y0:
                continue
            xs = (np.arange(x0, x1 + 1)[:, None] + off[None, :]).reshape(-1)
            ys = (np.arange(y0, y1 + 1)[:, None] + off[None, :]).reshape(-1)
            X, Y = np.meshgrid(xs, ys)
            Q = np.stack([X.reshape(-1), Y.reshape(-1)], 1)
            ok = p.dentro(Q)
            if p.recorte is not None:
                ok &= p.recorte(Q[:, 0], Q[:, 1])
            ok = ok.reshape(X.shape)
            bloque = sub[y0 * SS:(y1 + 1) * SS, x0 * SS:(x1 + 1) * SS]
            bloque[ok] = i
        b = sub.reshape(H, SS, W, SS).transpose(0, 2, 1, 3).reshape(H, W, SS * SS)
        lleno = (b >= 0).sum(-1)
        if n:
            cuentas = np.stack([(b == i).sum(-1) for i in range(n)], 0).astype(float)
            cuentas += np.arange(n)[:, None, None] * 1e-3
            ids = np.argmax(cuentas, 0)
        else:
            ids = np.zeros((H, W), int)
        ids[lleno * 2 < SS * SS] = -1
        # tallos finos: linea perfecta, sin cortes (y a salvo de la limpieza:
        # una linea en diagonal solo se toca por las esquinas a proposito)
        prot = np.zeros((H, W), bool)
        for i, p in enumerate(pz):
            if p.fino is None:
                continue
            for (x, y) in linea_perfecta(p.fino):
                if 0 <= x < W and 0 <= y < H and ids[y, x] <= i:
                    if p.recorte is None or p.recorte(np.array([x + .5]), np.array([y + .5]))[0]:
                        ids[y, x] = i
                        prot[y, x] = True
        ids = self._limpiar(ids, pz, prot)
        return self._colorear(ids, pz, sombra_interna)

    def _limpiar(self, ids, pz, prot):
        for _ in range(6):
            cambio = False
            lleno = ids >= 0
            v4 = sum((v >= 0).astype(int) for v in _vecinos4(ids))
            sueltos = lleno & (v4 == 0) & ~prot
            if sueltos.any():
                ids[sueltos] = -1
                cambio = True
            # trocitos de una pieza separados de su cuerpo
            for i in np.unique(ids[ids >= 0]):
                lab, comps = componentes(ids == i, ocho=True)
                if len(comps) <= 1:
                    continue
                mayor = max(range(len(comps)), key=lambda k: len(comps[k]))
                for k, pix in enumerate(comps):
                    if k == mayor or len(pix) > 2:
                        continue
                    if any(prot[y, x] for (x, y) in pix):
                        continue
                    for (x, y) in pix:
                        cnt = Counter()
                        for dx in (-1, 0, 1):
                            for dy in (-1, 0, 1):
                                nx, ny = x + dx, y + dy
                                if (dx or dy) and 0 <= nx < self.W and 0 <= ny < self.H:
                                    v = ids[ny, nx]
                                    if v >= 0 and v != i:
                                        cnt[v] += 1
                        ids[y, x] = cnt.most_common(1)[0][0] if cnt else -1
                        cambio = True
            # pixel de una pieza encerrado por otra en 3 de sus 4 lados: ruido
            for i in np.unique(ids[ids >= 0]):
                m = ids == i
                if m.sum() <= 3:
                    continue
                vs = _vecinos4(ids)
                propios = sum((v == i).astype(int) for v in vs)
                fuera = m & (propios == 0) & ~prot
                if fuera.any():
                    ys, xs = np.nonzero(fuera)
                    for x, y in zip(xs, ys):
                        cnt = Counter(int(v[y, x]) for v in vs if v[y, x] >= 0 and v[y, x] != i)
                        if cnt:
                            ids[y, x] = cnt.most_common(1)[0][0]
                            cambio = True
            if not cambio:
                break
        return ids

    def _colorear(self, ids, pz, sombra_interna):
        H, W = ids.shape
        n = len(pz)
        z = np.array([p.z for p in pz] + [-1e9])
        grupo = np.array([hash(p.grupo) for p in pz] + [0])
        lineas = np.array([p.lineas for p in pz] + [False])
        lleno = ids >= 0
        idsx = np.where(lleno, ids, n)
        # sombra arrojada por lo que esta delante (luz arriba-izquierda)
        sombra = np.zeros((H, W), int)
        if sombra_interna:
            for dx, dy, peso in ((-1, -1, 1), (-2, -2, 1), (-1, -2, 1), (-2, -1, 1), (0, -2, 1), (-2, 0, 1)):
                v = _desplaza(idsx, dx, dy, n)
                delante = (v != n) & lleno & (z[v] > z[idsx]) & (grupo[v] != grupo[idsx]) & lineas[v]
                sombra += delante.astype(int) * peso
            sombra = np.where(sombra >= 4, 2, np.where(sombra >= 1, 1, 0))
        rgba = np.zeros((H, W, 4), np.uint8)
        for i, p in enumerate(pz):
            sel = ids == i
            if not sel.any():
                continue
            ys, xs = np.nonzero(sel)
            Q = np.stack([xs + 0.5, ys + 0.5], 1)
            cols = np.asarray(p.pintar(Q, sombra[ys, xs]), float)
            rgba[ys, xs, :3] = np.clip(np.rint(cols), 0, 255).astype(np.uint8)
            rgba[ys, xs, 3] = 255
        # lineas internas: la pieza de detras lleva el contorno de la de delante
        linea = np.full((H, W), n)
        for v in _vecinos4(idsx, n):
            c = lleno & (v != n) & (z[v] > z[idsx]) & (grupo[v] != grupo[idsx]) & lineas[v]
            mejor = c & ((linea == n) | (z[v] > z[np.minimum(linea, n)]))
            linea = np.where(mejor, v, linea)
        for i, p in enumerate(pz):
            sel = linea == i
            if sel.any():
                rgba[sel, :3] = p.mat.contorno
        # contorno exterior: 4 vecinos
        borde = np.full((H, W), n)
        for v in _vecinos4(idsx, n):
            c = (~lleno) & (v != n)
            mejor = c & ((borde == n) | (z[v] > z[np.minimum(borde, n)]))
            borde = np.where(mejor, v, borde)
        for i, p in enumerate(pz):
            sel = borde == i
            if sel.any():
                rgba[sel, :3] = p.mat.contorno
                rgba[sel, 3] = 255
        self.ids = ids
        self.pz = pz
        return rgba


# ===========================================================================
# MONTAJE: sobre la parcela, en el lienzo de un objeto
# ===========================================================================

def caja_alfa(rgba):
    ys, xs = np.nonzero(rgba[..., 3] > 0)
    if not len(xs):
        return None
    return xs.min(), ys.min(), xs.max(), ys.max()


def recortar(rgba):
    c = caja_alfa(rgba)
    x0, y0, x1, y1 = c
    return rgba[y0:y1 + 1, x0:x1 + 1].copy()


def sobre_parcela(planta, parcela, seca, margen=3, sombra=(1, 2)):
    """
    Centra la planta en la parcela (por su caja, el medio exacto del interior)
    y pinta la sombra oscureciendo la tierra. Devuelve RGBA uint8.
    Lanza ValueError si la planta no cabe con `margen` px libres hasta el marco.
    """
    base = np.array(parcela, np.uint8).copy()
    H, W = base.shape[:2]
    spr = recortar(planta)
    h, w = spr.shape[:2]
    if margen < 0 and (w > W - 2 or h > H - 2):
        # solo para poder MIRAR una planta que no cabe (el error ya se apunto)
        y0 = max(0, (h - (H - 2)) // 2)
        x0 = max(0, (w - (W - 2)) // 2)
        spr = spr[y0:y0 + H - 2, x0:x0 + W - 2]
        h, w = spr.shape[:2]
    # interior: el marco es la fila/columna 0 y la ultima
    ix0, iy0, ix1, iy1 = 1, 1, W - 2, H - 2
    cx = (ix0 + ix1) / 2.0
    cy = (iy0 + iy1) / 2.0
    ox = int(math.floor(cx - (w - 1) / 2.0 + 0.5))
    oy = int(math.floor(cy - (h - 1) / 2.0 + 0.5))
    if (ox < ix0 - 1 + margen or oy < iy0 - 1 + margen or
            ox + w - 1 > ix1 + 1 - margen or oy + h - 1 > iy1 + 1 - margen):
        raise ValueError('la planta (%dx%d) no cabe en la parcela con margen %d' % (w, h, margen))
    sil = np.zeros((H, W), bool)
    sil[oy:oy + h, ox:ox + w] = spr[..., 3] > 0
    sx, sy = sombra
    som = np.zeros_like(sil)
    som[sy:, sx:] = sil[:H - sy, :W - sx]
    som &= ~sil
    interior = np.zeros_like(sil)
    interior[iy0:iy1 + 1, ix0:ix1 + 1] = True
    som &= interior
    f = 0.76 if seca else 0.80
    base[som, :3] = np.clip(np.rint(base[som, :3].astype(float) * f), 0, 255).astype(np.uint8)
    a = spr[..., 3] > 0
    reg = base[oy:oy + h, ox:ox + w]
    reg[a] = spr[a]
    return base, (ox, oy, w, h)


def en_lienzo(spr, W, H):
    """Centra un objeto recortado en un lienzo WxH transparente."""
    spr = recortar(spr)
    h, w = spr.shape[:2]
    if w > W or h > H:
        raise ValueError('el objeto (%dx%d) no cabe en %dx%d' % (w, h, W, H))
    out = np.zeros((H, W, 4), np.uint8)
    ox = (W - w) // 2
    oy = (H - h) // 2
    out[oy:oy + h, ox:ox + w] = spr
    return out


# ===========================================================================
# EL SACO
# ===========================================================================

CUERPO_SACO = {(0x8f, 0x57, 0x2f), (0x82, 0x4a, 0x24), (0x62, 0x39, 0x1f),
               (0x52, 0x2d, 0x19), (0x3a, 0x22, 0x15)}


# El saco limpio, FIJADO aqui (2026-10-29). Salio de _reconstruir_saco() sobre
# los sacos originales del juego; desde que el usuario pidio rehacer tambien sus
# plantas viejas (tools/reparar-plantas-juego.py) esos sacos llevan emblema
# nuevo, y reconstruir de ellos cambiaria el saco de los 30 cultivos.
SACO_PALETA = {'a': '#2c1a10', 'b': '#8f572f', 'c': '#613c21', 'd': '#824a24',
               'e': '#362015', 'f': '#522d19', 'g': '#62391f', 'h': '#3a2215'}
SACO_FILAS = [
    '.....aaaa.......',
    '....abcddaa.....',
    '....acbdcdda....',
    '.....adcbcea....',
    '.....aeecea.....',
    '......afea......',
    '....aadedda.....',
    '...abdddddda....',
    '...adddbbdbga...',
    '..adddbbdbdga...',
    '..abdbbddddgga..',
    '.adddbddddbdga..',
    '.addbdddddddgfa.',
    '.adddddddbdggfa.',
    '.adddddddddgffa.',
    'adddbdddddggfha.',
    'adgdbbdddggffha.',
    'agggddddggffhffa',
    'aaaffffffffhhhha',
    '...aaaaaaaaaaaa.',
]


def saco_limpio(dir_plantas=None):
    """El saco de semillas del juego sin emblema (16x20), ver SACO_FILAS."""
    out = np.zeros((len(SACO_FILAS), len(SACO_FILAS[0]), 4), np.uint8)
    for y, fila in enumerate(SACO_FILAS):
        for x, ch in enumerate(fila):
            if ch != '.':
                out[y, x, :3] = C(SACO_PALETA[ch])
                out[y, x, 3] = 255
    return out


def _reconstruir_saco(dir_plantas):
    """
    El saco de la zanahoria SIN su emblema. Los cuatro sacos originales llevan
    el mismo saco y el emblema en el mismo sitio, asi que lo de debajo se
    reconstruye: el color de saco que tengan los otros sacos en ese pixel y,
    donde todos tienen emblema, el tono de su fila (claro a la izquierda,
    sombra a la derecha) copiado del propio saco. (Solo sirve con los sacos
    ORIGINALES: ver SACO_FILAS.)
    """
    nombres = ['planta_zanahorias/item_saco.png', 'planta_tomates/semillas_tomate.png',
               'planta_calabaza/item_semilla_calabaza.png', 'planta_trigo/item_semilla_trigo.png']
    A = [np.array(Image.open(os.path.join(dir_plantas, n)).convert('RGBA')) for n in nombres]
    ref = A[0].copy()
    H, W = ref.shape[:2]
    emblema = np.zeros((H, W), bool)
    for y in range(H):
        for x in range(W):
            if ref[y, x, 3] and tuple(ref[y, x, :3]) not in CUERPO_SACO and tuple(ref[y, x, :3]) not in (
                    (0x2c, 0x1a, 0x10), (0x61, 0x3c, 0x21), (0x36, 0x20, 0x15)):
                emblema[y, x] = True
    for y in range(H):
        for x in range(W):
            if not emblema[y, x]:
                continue
            cand = [tuple(a[y, x, :3]) for a in A[1:] if tuple(a[y, x, :3]) in CUERPO_SACO]
            if cand:
                ref[y, x, :3] = Counter(cand).most_common(1)[0][0]
            else:
                ref[y, x, :3] = (0x82, 0x4a, 0x24)
    return ref


ZONA_EMBLEMA = (3, 8, 12, 17)   # x0, y0, x1, y1 dentro del cuerpo del saco


def poner_emblema(saco, emblema):
    """
    Pega el emblema (recortado) centrado en la zona del saco. Ningun pixel del
    emblema puede caer sobre el contorno del saco ni fuera de el.
    """
    out = saco.copy()
    e = recortar(emblema)
    h, w = e.shape[:2]
    x0, y0, x1, y1 = ZONA_EMBLEMA
    zw, zh = x1 - x0 + 1, y1 - y0 + 1
    if w > zw or h > zh:
        raise ValueError('emblema %dx%d mayor que la zona %dx%d' % (w, h, zw, zh))
    a = e[..., 3] > 0
    # el saco se estrecha arriba: se prueba el centro y, si pisa el contorno,
    # el sitio libre mas cercano (como mucho 1 px)
    cx = x0 + (zw - w) / 2.0
    cy = y0 + (zh - h) / 2.0
    cands = sorted(((ox, oy) for ox in range(x0 - 1, x1 + 2) for oy in range(y0 - 1, y1 + 2)
                    if abs(ox - cx) <= 1.01 and abs(oy - cy) <= 1.01),
                   key=lambda p: ((p[0] - cx) ** 2 + (p[1] - cy) ** 2, p[1], p[0]))
    for ox, oy in cands:
        if ox < 0 or oy < 0 or ox + w > out.shape[1] or oy + h > out.shape[0]:
            continue
        reg = out[oy:oy + h, ox:ox + w]
        debajo = reg[a]
        if (debajo[:, 3] == 0).any() or any(tuple(c[:3]) == (0x2c, 0x1a, 0x10) for c in debajo):
            continue
        reg[a] = e[a]
        return out
    raise ValueError('el emblema pisa el contorno del saco')


# ===========================================================================
# COMPROBACIONES (lo que no da error y se ve mal)
# ===========================================================================

def trozos(rgba):
    """Numero de trozos 8-conexos de lo opaco. Una planta = 1 trozo."""
    _, comps = componentes(rgba[..., 3] > 0, ocho=True)
    return len(comps)


def guardar(rgba, ruta):
    carpeta = os.path.dirname(ruta)
    if carpeta and not os.path.isdir(carpeta):
        os.makedirs(carpeta)
    Image.fromarray(np.asarray(rgba, np.uint8), 'RGBA').save(ruta, 'PNG', optimize=True)
    return ruta
