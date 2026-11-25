# -*- coding: utf-8 -*-
"""
=============================================================================
MOTOR DE ÁRBOLES 2D (pixel art) PARA LOS SIETE MAPAS DEL ESTE     (2026-11-24)
=============================================================================

"Hazlo tú: crea un motor para crear árboles así" (como los del juego), "con
diferentes estilos y colores", sin copiar ni recolorear los que ya existen.

Lo que hace que los árboles del juego (tileset_nuevos, el mapa salvaje) se
vean profesionales, medido píxel a píxel con 7 y 9 aumentos:

  · LA COPA SON RACIMOS GRANDES (20 a 30 px) con el borde hecho de hojitas de
    2 a 4 px: la silueta es un festón menudo e IRREGULAR, no un arco liso.
  · LOS RACIMOS DE ABAJO TAPAN A LOS DE ARRIBA: la cima de cada racimo, a la
    luz, se recorta contra la sombra del racimo que tiene detrás (coliflor).
  · LA LUZ ES SUAVE: cerca de 250 colores en el roble del paquete; de la luz
    (arriba a la izquierda) a la sombra se pasa por muchos tonos cercanos.
  · TEXTURA DE HOJITAS: cada hojita de 3 a 4 px tiene su propia luz arriba a
    la izquierda y un filo oscuro abajo; más marcada a la luz que en la sombra.
  · GRIETAS OSCURAS entre racimo y racimo.
  · CONTORNO de 1 px casi negro solo por fuera (#050708 en el roble).
  · EL TRONCO: luz a la izquierda, vetas largas verticales, se abre en raíces
    y se ve partirse en ramas bajo la copa, con huecos de aire entre ellas.

Este motor guarda por píxel una LUZ CONTINUA (no un tono) y la reparte al
final en la rampa de cada material (16 tonos + el contorno), así que los
degradados salen suaves. Lo único que se quita al final son los píxeles
sueltos de mucho contraste y las islas de menos de 10 píxeles: sin motas
(tripofobia).

  Lienzo 160 x 200, el pie abajo en el centro (PIE = 198, el contorno en la 199). El juego los pone a
  1.3 con el origen en el pie (ZonasScenes._montarArboles): 208 x 260, la
  altura de los de GameScene (arbol 192 x 256, pinos 171 x 254).

Determinista: la semilla de cada especie sale de su nombre (crc32).

    python tools/gf_motor_arboles.py <hoja.png> [especie ...]    hoja de contacto
=============================================================================
"""
import colorsys
import math
import random
import sys
import zlib

import numpy as np
from PIL import Image

W, H = 160, 200
PIE = H - 2
CX = W // 2
YY, XX = np.mgrid[0:H, 0:W].astype(np.float64)
_L = np.array([-0.62, -0.68, 0.40])
LUZ = _L / np.linalg.norm(_L)
N_TONOS = 16


def redondo(v):
    """Mitad hacia arriba (round() de Python va al par: ver newpro-generado)."""
    return int(math.floor(v + 0.5))


# ===========================================================================
# COLOR
# ===========================================================================
def _rgb(h, s, v):
    r, g, b = colorsys.hsv_to_rgb(h % 1.0, min(1.0, max(0.0, s)), min(1.0, max(0.0, v)))
    return (redondo(r * 255), redondo(g * 255), redondo(b * 255))


def rampa(h, s0, s1, v0, v1, giro=-0.035, n=N_TONOS, curva=1.0, contorno=None):
    """Los tonos de un material, de la sombra a la luz, como el roble del
    paquete: el tono va de h - giro (sombra) a h + giro (luz) y la saturación
    de s0 a s1. [0] es el contorno (casi negro, teñido del material)."""
    out = [contorno or _rgb(h - giro * 1.5, 0.45, 0.055)]
    for i in range(n):
        t = i / float(n - 1)
        out.append(_rgb(h + giro * (2 * t - 1), s0 + (s1 - s0) * t, v0 + (v1 - v0) * t ** curva))
    return out


# ===========================================================================
# RUIDOS: manchas suaves y hojitas (nunca puntos)
# ===========================================================================
def ruido(rng, ex, ey=None):
    """Ruido de valor suave en [0, 1]; ex, ey = el tamaño de la mancha en px
    (ey grande = vetas verticales)."""
    ey = ex if ey is None else ey
    gw, gh = int(W / ex) + 3, int(H / ey) + 3
    g = np.array([[rng.random() for _ in range(gw)] for _ in range(gh)])
    xs, ys = XX / ex, YY / ey
    x0, y0 = xs.astype(int), ys.astype(int)
    fx, fy = xs - x0, ys - y0
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = g[y0, x0] * (1 - fx) + g[y0, x0 + 1] * fx
    b = g[y0 + 1, x0] * (1 - fx) + g[y0 + 1, x0 + 1] * fx
    return a * (1 - fy) + b * fy


def pinceladas(rng, paso):
    """Manchas de pincel: celdas de unos `paso` px (rejilla con temblor), cada
    una de un valor al azar en [-1, 1]. Sin dirección: un Voronoi con la luz
    de cada celda hacia arriba a la izquierda sale en escamas de pez."""
    gw, gh = int(W / paso) + 3, int(H / paso) + 3
    jx = (np.array([[rng.random() for _ in range(gw)] for _ in range(gh)]) - 0.5) * paso * 0.9
    jy = (np.array([[rng.random() for _ in range(gw)] for _ in range(gh)]) - 0.5) * paso * 0.9
    tabla = np.array([[rng.random() for _ in range(gw)] for _ in range(gh)]) * 2 - 1
    ci = np.floor(XX / paso).astype(int)
    cj = np.floor(YY / paso).astype(int)
    d1 = np.full((H, W), 1e9)
    bi = np.zeros((H, W), dtype=int)
    bj = np.zeros((H, W), dtype=int)
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            ii = np.clip(ci + di, 0, gw - 1)
            jj = np.clip(cj + dj, 0, gh - 1)
            d = np.hypot(XX - ((ii + 0.5) * paso + jx[jj, ii]), YY - ((jj + 0.5) * paso + jy[jj, ii]))
            nuevo = d < d1
            bi = np.where(nuevo, ii, bi)
            bj = np.where(nuevo, jj, bj)
            d1 = np.where(nuevo, d, d1)
    return tabla[bj, bi]


def _ventana(cx, cy, rx, ry):
    x0 = max(0, int(math.floor(cx - rx - 2)))
    x1 = min(W, int(math.ceil(cx + rx + 3)))
    y0 = max(0, int(math.floor(cy - ry - 2)))
    y1 = min(H, int(math.ceil(cy + ry + 3)))
    return slice(y0, y1), slice(x0, x1)


class Relieve:
    """Un campo de alturas hecho de esferas (z = hacia quien mira) con la
    normal de la esfera que gana en cada píxel. La copa se ilumina con esa
    normal y se oscurece donde queda más baja que lo que tiene alrededor (las
    grietas): así salen solos el filo de luz arriba de cada racimo y la sombra
    del de detrás, como en el roble del paquete."""

    def __init__(self):
        self.z = np.full((H, W), -1e9)
        self.n = np.zeros((3, H, W))
        self.n[2] = 1.0

    def esfera(self, cx, cy, r, zc, borde=None, plano=1.0, encima=False, recorte=None):
        extra = 0.0 if borde is None else 6.0
        sy, sx = _ventana(cx, cy, r + extra, (r + extra) * plano)
        X, Y = XX[sy, sx], YY[sy, sx]
        dx, dy = X - cx, (Y - cy) / plano
        d = np.hypot(dx, dy)
        R = r if borde is None else np.maximum(r + borde(np.arctan2(dy, dx)), 0.5)
        h = np.sqrt(np.clip(R * R - d * d, 0, None))
        zs = self.z[sy, sx]
        gana = (d < R) & (zc + h > zs)
        if encima:
            gana &= zs > -1e8
        if recorte is not None:
            gana &= recorte[sy, sx]
        if not gana.any():
            return False
        zs[gana] = (zc + h)[gana]
        for k, comp in enumerate((dx / R, dy / R, h / R)):
            v = self.n[k][sy, sx]
            v[gana] = comp[gana] if np.ndim(comp) else comp
        return True

    def dentro(self):
        return self.z > -1e8

    def luz(self):
        n = self.n
        return n[0] * LUZ[0] + n[1] * LUZ[1] + n[2] * LUZ[2]

    def hondura(self, radio, escala):
        """Cuánto más bajo está cada píxel que la media de la copa a su
        alrededor (0..1): las grietas y lo que queda detrás de otro racimo."""
        m = self.dentro()
        z = np.where(m, self.z, 0.0)
        suma = _caja(z, radio)
        cuenta = _caja(m.astype(float), radio)
        media = suma / np.maximum(cuenta, 1.0)
        return np.where(m, np.clip((media - self.z) / escala, 0, 1), 0.0)


def _caja(a, r):
    """Suma de a en una ventana de (2r+1)^2 (imagen integral)."""
    p = np.pad(a, r + 1, mode='constant')
    s = p.cumsum(0).cumsum(1)
    k = 2 * r + 1
    return s[k:k + H, k:k + W] - s[0:H, k:k + W] - s[k:k + H, 0:W] + s[0:H, 0:W]


# ===========================================================================
# EL LIENZO: material y luz continua por píxel; los tonos salen al final
# ===========================================================================
class Lienzo:
    def __init__(self, nombre):
        self.nombre = nombre
        self.rng = random.Random(zlib.crc32(nombre.encode('utf-8')))
        self.mat = np.full((H, W), -1, dtype=np.int32)
        self.val = np.zeros((H, W))
        self.emite = np.zeros((H, W), bool)       # brasa, borde que brilla: sin contorno
        self.rampas = []

    def material(self, r):
        self.rampas.append(r)
        return len(self.rampas) - 1

    def pon(self, mascara, mat, val, emite=False):
        self.mat[mascara] = mat
        self.val[mascara] = val[mascara] if np.ndim(val) else val
        self.emite[mascara] = emite

    def oscurece(self, mascara, cuanto):
        m = mascara & (self.mat >= 0)
        self.val[m] -= cuanto[m] if np.ndim(cuanto) else cuanto

    # ── el final: tonos, limpieza, contorno ──
    def tonos(self):
        t = np.zeros((H, W), dtype=np.int32)
        for k, r in enumerate(self.rampas):
            sel = self.mat == k
            n = len(r) - 1
            t[sel] = np.clip(np.floor((self.val[sel] + 1.0) / 2.0 * (n - 1) + 0.5) + 1, 1, n).astype(np.int32)
        return t

    def imagen(self):
        t = self.tonos()
        self._sin_motas(t)
        self._sin_islas()
        self._contorno(t)
        out = np.zeros((H, W, 4), dtype=np.uint8)
        for k, r in enumerate(self.rampas):
            sel = self.mat == k
            if not sel.any():
                continue
            pal = np.array(r, dtype=np.uint8)
            out[sel, :3] = pal[np.clip(t[sel], 0, len(r) - 1)]
            out[sel, 3] = 255
        return Image.fromarray(out, 'RGBA')

    def _sin_motas(self, t, umbral=3):
        """Un píxel con más de `umbral` tonos de diferencia con TODOS sus vecinos
        del mismo material toma la mediana de ellos (las manchas se quedan)."""
        m = self.mat
        for _ in range(2):
            cambio = False
            pm = np.pad(m, 1, constant_values=-9)
            pt = np.pad(t, 1, constant_values=-99)
            vm = [pm[1 + dy:1 + dy + H, 1 + dx:1 + dx + W] for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1))]
            vt = [pt[1 + dy:1 + dy + H, 1 + dx:1 + dx + W] for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1))]
            cerca = np.zeros((H, W), bool)
            iguales = np.zeros((H, W), dtype=np.int32)
            for a, b in zip(vm, vt):
                misma = a == m
                iguales += misma
                cerca |= misma & (np.abs(b - t) <= umbral)
            suelto = (m >= 0) & ~cerca & (iguales >= 2) & ~self.emite
            for y, x in zip(*np.nonzero(suelto)):
                vec = sorted(t[yy, xx] for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1))
                             if 0 <= yy < H and 0 <= xx < W and m[yy, xx] == m[y, x])
                if vec:
                    t[y, x] = vec[len(vec) // 2]
                    cambio = True
            if not cambio:
                break

    def _sin_islas(self, minimo=10):
        lleno = self.mat >= 0
        visto = np.zeros((H, W), bool)
        for y0, x0 in zip(*np.nonzero(lleno)):
            if visto[y0, x0]:
                continue
            pila, comp = [(y0, x0)], []
            visto[y0, x0] = True
            while pila:
                y, x = pila.pop()
                comp.append((y, x))
                for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                    if 0 <= yy < H and 0 <= xx < W and lleno[yy, xx] and not visto[yy, xx]:
                        visto[yy, xx] = True
                        pila.append((yy, xx))
            if len(comp) < minimo:
                for y, x in comp:
                    self.mat[y, x] = -1

    def _contorno(self, t):
        """1 px por fuera, del tono 0 (casi negro) del material que toca."""
        lleno = self.mat >= 0
        pad = np.pad(lleno, 1)
        fuera = ~lleno & (pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:])
        for y, x in zip(*np.nonzero(fuera)):
            for yy, xx in ((y + 1, x), (y, x + 1), (y, x - 1), (y - 1, x)):
                if 0 <= yy < H and 0 <= xx < W and self.mat[yy, xx] >= 0 and not self.emite[yy, xx]:
                    self.mat[y, x] = self.mat[yy, xx]
                    t[y, x] = 0
                    break


# ===========================================================================
# PIEZAS: tronco, ramas, copa de racimos, pisos de conífera, frondas, setas
# ===========================================================================
def _segmento(ax, ay, bx, by, ra, rb):
    """(dentro, u): u es la coordenada a lo ancho del segmento, de -1 a 1,
    creciendo hacia la derecha de la pantalla."""
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy or 1.0
    t = np.clip(((XX - ax) * dx + (YY - ay) * dy) / L2, 0, 1)
    px, py = ax + t * dx, ay + t * dy
    r = ra + (rb - ra) * t
    L = math.sqrt(L2)
    nx, ny = -dy / L, dx / L
    if ny > 0:
        nx, ny = -nx, -ny
    u = ((XX - px) * nx + (YY - py) * ny) / np.maximum(r, 0.6)
    if nx < 0:
        u = -u
    d = np.hypot(XX - px, YY - py)
    return d <= r, np.clip(u, -1, 1)


def _cilindro(u):
    nz = np.sqrt(np.clip(1 - u * u, 0, 1))
    return u * LUZ[0] * 1.35 + nz * LUZ[2] * 1.2 - 0.18


def _curva(p0, p1, p2, n=12):
    """Bézier cuadrática: n + 1 puntos de p0 a p2 tirando hacia p1."""
    out = []
    for i in range(n + 1):
        t = i / float(n)
        out.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
                    (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]))
    return out


def tronco(L, mat, puntos, radios, raices=2, ensanche=1.6, alto_raiz=12, vetas=1.0, sombra_copa=None,
           nudos=1, liso=False):
    """Un tronco por una polilínea (de abajo arriba) con sus radios. Se abre al
    llegar al suelo y asoman raíces; vetas largas verticales y la sombra de la
    copa arriba. Devuelve su máscara."""
    rng = L.rng
    dentro = np.zeros((H, W), bool)
    U = np.full((H, W), 9.0)
    for i in range(len(puntos) - 1):
        (ax, ay), (bx, by) = puntos[i], puntos[i + 1]
        m, u = _segmento(ax, ay, bx, by, radios[i], radios[i + 1])
        nuevo = m & (np.abs(u) < np.abs(U))
        U[nuevo] = u[nuevo]
        dentro |= m
    bx0, by0 = puntos[0]
    r0 = radios[0]
    if alto_raiz > 1:
        for y in range(int(by0 - alto_raiz), int(by0) + 1):
            f = (y - (by0 - alto_raiz)) / float(alto_raiz)
            rr = r0 * (1 + (ensanche - 1) * f ** 2.2)
            fila = np.abs(XX[y] - bx0) <= rr
            nuevo = fila & (np.abs(U[y]) > 1.5)
            U[y][nuevo] = np.clip((XX[y][nuevo] - bx0) / rr, -1, 1)
            dentro[y] |= fila
    for k in range(raices):
        lado = -1 if k % 2 == 0 else 1
        largo = r0 * (ensanche + 0.45 + 0.35 * rng.random())
        m, u = _segmento(bx0 + lado * r0 * 0.4, by0 - alto_raiz * 0.5, bx0 + lado * largo, by0, r0 * 0.4, 1.5)
        nuevo = m & ~dentro
        U[nuevo] = np.clip(u[nuevo] * 0.5 + lado * 0.45, -1, 1)
        dentro |= m
    U = np.where(np.abs(U) > 1.5, 0, U)
    v = _cilindro(U)
    if not liso:
        veta = ruido(rng, 1.7, 9.0)
        surco = ruido(rng, 1.3, 7.0)
        v = v + vetas * 0.32 * (veta - 0.5) - vetas * 0.55 * (surco < 0.2)
    else:
        v = v + 0.12 * (ruido(rng, 5.0, 3.0) - 0.5)
    ys = [p[1] for p in puntos]
    for _ in range(nudos):
        if max(ys) - min(ys) < 30:
            break
        ny_ = rng.uniform(min(ys) + 10, max(ys) - 16)
        nx_ = np.interp(ny_, sorted(ys), [p[0] for p in sorted(puntos, key=lambda p: p[1])]) + rng.uniform(-2, 2)
        nudo = np.hypot((XX - nx_) / 2.2, (YY - ny_) / 1.6) <= 1.0
        v = np.where(nudo & dentro, v - 0.6, v)
        anillo = (np.hypot((XX - nx_) / 3.2, (YY - ny_) / 2.4) <= 1.0) & ~nudo
        v = np.where(anillo & dentro, v + 0.15, v)
    if sombra_copa is not None:
        k = np.clip((sombra_copa + 14 - YY) / 14.0, 0, 1)
        v = v - 0.75 * k
    v = v - 0.3 * (YY >= PIE - 1)
    L.pon(dentro, mat, v)
    return dentro


def rama(L, mat, ax, ay, bx, by, ra, rb, sombra=0.0):
    m, u = _segmento(ax, ay, bx, by, ra, rb)
    v = _cilindro(u) - sombra
    L.pon(m, mat, v)
    return m


def trazo(L, mat, pts, r0, r1, sombra=0.0):
    """Una rama curva por una lista de puntos, del radio r0 al r1."""
    tot = np.zeros((H, W), bool)
    n = len(pts) - 1
    for i in range(n):
        ra = r0 + (r1 - r0) * i / float(n)
        rb = r0 + (r1 - r0) * (i + 1) / float(n)
        tot |= rama(L, mat, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], ra, rb, sombra)
    return tot


def ramas_secas(L, mat, x, y, ang, largo, r, nivel, rng, abre=0.55, encoge=0.72, out=None):
    """Ramas que se parten (para los árboles sin hoja): recursivo."""
    ex, ey = x + math.cos(ang) * largo, y + math.sin(ang) * largo
    m = rama(L, mat, x, y, ex, ey, r, max(0.8, r * 0.72))
    if out is not None:
        out.append((ex, ey, m))
    if nivel <= 0 or r < 0.95:
        return
    for s in (-1, 1):
        a2 = ang + s * abre * rng.uniform(0.6, 1.2)
        ramas_secas(L, mat, ex, ey, a2, largo * encoge * rng.uniform(0.8, 1.1), r * 0.7, nivel - 1, rng, abre, encoge, out)


def _poisson(rng, dentro, caja, sep, intentos=5000):
    x0, y0, x1, y1 = caja
    pts = []
    for _ in range(intentos):
        x, y = rng.uniform(x0, x1), rng.uniform(y0, y1)
        if dentro(x, y) and all((x - a) ** 2 + (y - b) ** 2 >= sep * sep for a, b in pts):
            pts.append((x, y))
    return pts


def en_masas(masas):
    def f(x, y):
        return any(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0 for cx, cy, rx, ry in masas)
    return f


def _feston(rng, k, hoja):
    """El borde de un racimo: k hojitas de ancho y alto distintos (un festón
    irregular; uno regular se ve falso)."""
    anchos = np.array([rng.uniform(0.65, 1.35) for _ in range(k)])
    bordes = np.concatenate([[0.0], np.cumsum(anchos) / anchos.sum()])
    altos = np.array([hoja * rng.uniform(0.4, 1.0) for _ in range(k)])
    fase = rng.random()

    def f(ang):
        s = (ang / (2 * math.pi) + fase) % 1.0
        j = np.clip(np.searchsorted(bordes, s, side='right') - 1, 0, k - 1)
        t = (s - bordes[j]) / (bordes[j + 1] - bordes[j])
        return altos[j] * np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1))
    return f


def copa(L, mat, masas, r=22.0, hoja=3.0, paso_hoja=5.0, r_bulto=None, sale_bulto=0.45, bulto_sep=1.3,
         r_hoja=2.5, paso_hojita=3.5, sale_hoja=0.35, peso_luz=1.0, peso_global=0.35, k_ao=1.1, r_ao=4,
         peso_grande=0.62,
         pincel=0.07, abajo=0.22, sep=1.05, varia=(0.85, 1.15), recorte=None, hondo=True, hondo_hasta=None,
         plano=1.0, marco=None, emite=False, base_val=0.0, centros=None, delante=1.0):
    """Una copa en tres escalas, como la del roble del paquete, hecha como un
    relieve de esferas (ver Relieve):
      * RACIMOS GRANDES de radio r (Poisson dentro de las masas, elipses
        cx, cy, rx, ry), con el borde de hojitas (festón irregular); los de
        abajo, delante (`delante`): su cima a la luz se recorta contra la
        sombra del de detrás;
      * BULTOS de radio r_bulto que asoman de ellos (y rizan la silueta);
      * HOJITAS de r_hoja px sobre todo, con su luz cada una.
    `plano` < 1 aplasta los racimos (parasoles, pisos); `marco` = (cx, cy, rx,
    ry) da la luz de conjunto cuando una copa se pinta en varias llamadas;
    `hondo` rellena de sombra el interior (hasta `hondo_hasta`) para que entre
    racimo y racimo no se vea el fondo."""
    rng = L.rng
    r_bulto = r * 0.4 if r_bulto is None else r_bulto
    x0 = min(m[0] - m[2] for m in masas)
    x1 = max(m[0] + m[2] for m in masas)
    y0 = min(m[1] - m[3] for m in masas)
    y1 = max(m[1] + m[3] for m in masas)
    if marco is None:
        marco = ((x0 + x1) / 2.0, (y0 + y1) / 2.0, max(6.0, (x1 - x0) / 2.0), max(6.0, (y1 - y0) / 2.0))
    gcx, gcy, grx, gry = marco
    f = en_masas(masas)
    lim = (XX >= 3) & (XX <= W - 4) & (YY >= 3)
    if recorte is not None:
        lim = lim & recorte

    def dentro(x, y):
        m = r * 0.75 + hoja + 3
        return f(x, y) and m <= x <= W - 1 - m and y >= m * plano
    pts = list(centros) if centros is not None else _poisson(rng, dentro, (x0, y0, x1, y1), r * sep)
    rel = Relieve()
    for (px, py) in pts:
        rr = r * rng.uniform(*varia)
        k = max(8, redondo(2 * math.pi * rr / paso_hoja))
        fes = _feston(rng, k, hoja)
        zc = (py - gcy) * delante + rng.uniform(-2.0, 2.0)
        rel.esfera(px, py, rr, zc, borde=lambda a, fes=fes: fes(a) - hoja * 0.45, plano=plano, recorte=lim)
    m0 = rel.dentro()
    luz0 = rel.luz()

    def en_copa(x, y):
        xi, yi = int(x), int(y)
        m = r_bulto * 1.2 + hoja + 3
        return m <= x <= W - 1 - m and y >= m * plano and yi < H and m0[yi, xi]
    for (bx, by) in _poisson(rng, en_copa, (x0 - r, y0 - r, x1 + r, y1 + r), r_bulto * bulto_sep, intentos=3000):
        rb = r_bulto * rng.uniform(0.8, 1.2)
        k = max(6, redondo(2 * math.pi * rb / paso_hoja))
        fes = _feston(rng, k, hoja * 0.7)
        z0 = rel.z[int(by), int(bx)]
        rel.esfera(bx, by, rb, z0 - rb * (1 - sale_bulto), borde=lambda a, fes=fes: fes(a) - hoja * 0.3,
                   plano=plano, recorte=lim)
    m1 = rel.dentro()
    gw, gh = int(W / paso_hojita) + 2, int(H / paso_hojita) + 2
    for j in range(gh):
        for i in range(gw):
            cx = (i + 0.5 + rng.uniform(-0.45, 0.45)) * paso_hojita
            cy = (j + 0.5 + rng.uniform(-0.45, 0.45)) * paso_hojita
            xi, yi = int(cx), int(cy)
            if not (0 <= xi < W and 0 <= yi < H and m1[yi, xi]):
                continue
            rh = r_hoja * rng.uniform(0.7, 1.3)
            rel.esfera(cx, cy, rh, rel.z[yi, xi] - rh * (1 - sale_hoja * rng.uniform(0.6, 1.4)), encima=True)
    copa_m = rel.dentro()
    luz = rel.luz()
    luz = np.where(m0, peso_grande * luz0 + (1 - peso_grande) * luz, luz)
    ao = rel.hondura(r_ao, max(2.0, r * 0.3))
    pin = pinceladas(rng, 2.6)
    glob = np.clip(-0.55 * (XX - gcx) / grx - 0.8 * (YY - gcy) / gry, -1.2, 1.2)
    baja = np.clip((YY - gcy) / gry - 0.2, 0, 1)
    val = (base_val + peso_luz * (luz - 0.2) + peso_global * glob - k_ao * ao + pincel * pin - abajo * baja)
    pinta = copa_m.copy()
    if hondo:
        hh = np.zeros((H, W), bool)
        for (cx, cy, rx, ry) in masas:
            hh |= ((XX - cx) / max(2.0, rx - r * 0.45)) ** 2 + ((YY - cy) / max(2.0, ry - r * 0.45 * plano)) ** 2 <= 1.0
        hh &= lim & ~copa_m
        if hondo_hasta is not None:
            hh &= YY <= hondo_hasta
        val = np.where(hh, -0.9 + 0.25 * glob + 0.08 * pin + base_val, val)
        pinta |= hh
    L.pon(pinta, mat, val, emite=emite)
    return pinta


def pisos(L, mat, cx, cima, base, ancho, n, dedo=9.0, caida=9.0, textura=0.2, peso_global=0.5,
          ceniza=None, grosor=1.3, curva_ancho=0.85, hojas_k=0.22, peso_dedo=0.45):
    """Una conífera por pisos; cada piso acaba abajo en DEDOS que cuelgan. Los
    de arriba tapan la base de los de abajo. `grosor` < 1 deja ver el tronco
    entre piso y piso. `ceniza` = (material, grueso): capa clara encima."""
    rng = L.rng
    tex = ruido(rng, 2.6) - 0.5
    pin = pinceladas(rng, 2.6)
    alto = (base - cima) / float(n)
    todo = np.zeros((H, W), bool)
    gcy = (cima + base) / 2.0
    for i in range(n - 1, -1, -1):
        yb = cima + alto * (i + 1)
        yt = cima if i == 0 else yb - alto * grosor
        wb = 6 + (ancho - 6) * ((i + 1) / float(n)) ** curva_ancho
        fase = rng.uniform(0, 6.28)
        rel = np.clip((YY - yt) / max(1.0, yb - yt), 0, 1)
        w = 2.5 + (wb - 2.5) * rel ** 0.9
        dentro_x = np.abs(XX - cx) <= w
        lobulo = ((XX - cx) / dedo + fase / 6.28) % 1.0
        uu = lobulo * 2 - 1
        fondo = yb + caida * np.sqrt(np.clip(1 - uu * uu, 0, 1)) * (0.75 + 0.25 * np.cos((XX - cx) * 0.21 + fase))
        m = dentro_x & (YY >= yt) & (YY <= fondo) & (XX >= 3) & (XX <= W - 4)
        nyl = np.clip((YY - yb) / max(1.0, caida), -1, 1)
        domo = uu * LUZ[0] + nyl * LUZ[1] + np.sqrt(np.clip(1 - uu * uu, 0, 1)) * LUZ[2] * 0.6
        glob = np.clip(-0.6 * (XX - cx) / max(8.0, wb) - 0.55 * (YY - gcy) / max(10.0, (base - cima) / 2.0), -1.1, 1.1)
        v = peso_dedo * domo * (YY > yb - alto * 0.5) + peso_global * glob + textura * tex
        v = v + hojas_k * pin
        v = v - 0.85 * np.clip((np.abs(uu) - 0.8) / 0.2, 0, 1) * (YY > yb - 2)
        v = v - 0.45 * np.clip((YY - yb) / max(1.0, caida), 0, 1)
        L.pon(m, mat, v)
        if ceniza is not None:
            cm, grueso = ceniza
            onda = ruido(rng, 5.0)[0]
            c = np.cumsum(m, axis=0)
            capa = m & (c <= grueso + np.floor(onda * 3)[None, :])
            L.pon(capa, cm, 0.35 + 0.45 * glob - 0.2 * (np.abs(XX - cx) > w - 2))
        todo |= m
    return todo


def fronda(L, mat, x0, y0, ang, largo, ancho, caida=0.35, tipo='pluma', sombra=0.0, rasgos=3, paso=3.2):
    """Una hoja larga desde (x0, y0): 'pluma' (palmera, helecho: foliolos a los
    dos lados del nervio, cada `paso` px) o 'pala' (platanera: hoja ancha con
    venas paralelas y rasgaduras). La mitad de arriba, a la luz."""
    rng = L.rng
    n = max(8, int(largo * 1.5))
    pts = []
    for s in range(n + 1):
        t = s / float(n)
        pts.append((x0 + math.cos(ang) * largo * t, y0 + math.sin(ang) * largo * t + caida * largo * t * t, t))
    rotas = {-1: [], 1: []}
    if tipo == 'pala':
        for lado in (-1, 1):
            for _ in range(rasgos):
                rotas[lado].append(rng.uniform(0.2, 0.9))
    m_tot = np.zeros((H, W), bool)
    val = np.zeros((H, W))
    acum = paso
    for i in range(n):
        (xa, ya, ta), (xb, yb, tb) = pts[i], pts[i + 1]
        dx, dy = xb - xa, yb - ya
        ln = math.hypot(dx, dy) or 1.0
        tx, ty = dx / ln, dy / ln
        nx, ny = -ty, tx
        if ny > 0:
            nx, ny = -nx, -ny
        if tipo == 'pala':
            w = ancho * math.sin(math.pi * min(1.0, 0.08 + ta * 0.97)) ** 0.55
            for lado in (-1, 1):
                if any(abs(ta - tr) < 2.2 / largo for tr in rotas[lado]):
                    continue
                ex, ey = xa + nx * lado * w + tx * w * 0.3, ya + ny * lado * w + ty * w * 0.3
                m, _ = _segmento(xa, ya, ex, ey, 1.25, 1.0)
                vena = 0.07 if (i // 2) % 2 else -0.04
                v = (0.32 if lado > 0 else -0.28) + 0.2 * (1 - ta) - sombra + vena
                m_tot |= m
                val = np.where(m, v, val)
        else:
            acum += ln
            if acum >= paso:
                acum = 0.0
                w = ancho * (1 - ta) ** 0.5 + 1.5
                for lado in (-1, 1):
                    fx = nx * lado * w + tx * w * 0.65
                    fy = ny * lado * w + ty * w * 0.65 + w * 0.25
                    m, _ = _segmento(xa, ya, xa + fx, ya + fy, 1.5, 0.6)
                    v = (0.38 if lado > 0 else -0.2) + 0.2 * (1 - ta) - sombra
                    m_tot |= m
                    val = np.where(m, v, val)
        nerv, _ = _segmento(xa, ya, xb, yb, 1.0, 0.9)
        m_tot |= nerv
        val = np.where(nerv, (0.05 if tipo == 'pala' else -0.15) - sombra, val)
    sel = m_tot & (XX >= 2) & (XX <= W - 3) & (YY >= 2)
    L.pon(sel, mat, val)
    return sel


def sombrero(L, mat, cx, cy, rx, ry, forma='paraguas', laminas=None, borde=None, alto_borde=4, grano=2.4,
             sale=0.35):
    """El sombrero de una seta como relieve: una cúpula (elipsoide) con la piel
    en grano menudo de `grano` px (cada grano con su luz, como la copa), por
    debajo las láminas que van hacia el pie y un borde que brilla (`borde` =
    (material,), emite luz y no lleva contorno)."""
    rng = L.rng
    corte = 0.35 if forma == 'campana' else 0.1
    fondo = cy + ry * corte
    rel = Relieve()
    rel.esfera(cx, cy, rx, 0.0, plano=ry / float(rx), recorte=YY <= fondo)
    m0 = rel.dentro()
    if not m0.any():
        return m0
    luz0 = rel.luz()
    paso = grano * 1.45
    gw, gh = int(W / paso) + 2, int(H / paso) + 2
    for j in range(gh):
        for i in range(gw):
            gx = (i + 0.5 + rng.uniform(-0.4, 0.4)) * paso
            gy = (j + 0.5 + rng.uniform(-0.4, 0.4)) * paso
            xi, yi = int(gx), int(gy)
            if not (0 <= xi < W and 0 <= yi < H and m0[yi, xi]):
                continue
            rg = grano * rng.uniform(0.75, 1.25)
            rel.esfera(gx, gy, rg, rel.z[yi, xi] - rg * (1 - sale), encima=True)
    luz = 0.6 * luz0 + 0.4 * rel.luz()
    ao = rel.hondura(3, 2.5)
    pin = pinceladas(rng, 3.0)
    q = np.clip(((XX - cx) / rx) ** 2 + ((YY - cy) / ry) ** 2, 0, 1)
    v = 0.95 * (luz - 0.12) - 0.55 * ao + 0.06 * pin - 0.25 * np.clip((q - 0.8) / 0.2, 0, 1) * (YY > cy)
    brillo = np.hypot((XX - (cx - rx * 0.38)) / (rx * 0.3), (YY - (cy - ry * 0.55)) / (ry * 0.22)) <= 1.0
    v = v + 0.28 * brillo
    L.pon(m0, mat, v)
    if laminas is not None:
        lm, = laminas
        dx = (XX - cx) / rx
        alto = alto_borde * np.sqrt(np.clip(1 - dx * dx, 0, 1)) + 1.0
        lam = (np.abs(dx) <= 0.97) & (YY > fondo - 0.5) & (YY <= fondo + alto)
        pie_y = fondo + alto_borde + 6.0
        a = np.arctan2(XX - cx, pie_y - YY + 1e-3)
        raya = np.sin(a * (10 + rx * 0.35)) > 0.55
        L.pon(lam, lm, np.where(raya, -0.55, -0.05) - 0.35 * np.abs(dx) - 0.2 * (YY - fondo) / (alto_borde + 1))
    if borde is not None:
        bm, = borde
        dx = (XX - cx) / rx
        aro = m0 & (YY > fondo - 2.4) & (np.abs(dx) <= 1.0)
        L.pon(aro, bm, 0.4 - 0.5 * dx, emite=True)
    return m0


def pie_seta(L, mat, cx, y0, y1, r0, r1, curva=0.0, anillo=None):
    """El pie: un cilindro que se estrecha, algo inclinado, con fibras largas
    y su anillo con el borde rizado."""
    rng = L.rng
    m, u = _segmento(cx, y0, cx + curva, y1, r0, r1)
    fibra = ruido(rng, 1.6, 12.0)
    v = _cilindro(u) + 0.2 + 0.22 * (fibra - 0.5) - 0.25 * (YY >= y0 - 1)
    L.pon(m, mat, v)
    if r0 >= 4:
        bul = np.hypot((XX - cx) / (r0 * 1.45), (YY - (y0 - 3)) / 4.5) <= 1.0
        L.pon(bul & (YY <= y0), mat, _cilindro(np.clip((XX - cx) / (r0 * 1.45), -1, 1)) + 0.1 - 0.3 * (YY >= y0 - 1))
    if anillo is not None:
        ya, ra = anillo
        xa = cx + curva * (y0 - ya) / max(1.0, y0 - y1)
        rizo = 1.2 * (np.sin((XX - xa) * 1.3) > 0.3)
        aro = (YY >= ya - 1.6) & (YY <= ya + 1.6 + rizo) & (np.abs(XX - xa) <= ra)
        L.pon(aro, mat, 0.1 - 0.55 * (XX - xa) / ra - 0.35 * (YY > ya + 1))
    return m


def colgantes(L, mat, xs, y_de, largo, ancho=2, valor=0.1):
    """Lo que cuelga (musgo, raíces aéreas, lianas): trazos largos, nunca puntos."""
    rng = L.rng
    for x in xs:
        y0 = y_de(x)
        if y0 is None:
            continue
        l = rng.uniform(*largo)
        onda = rng.uniform(0, 6.28)
        a = ancho if not isinstance(ancho, tuple) else rng.choice(ancho)
        for y in range(int(y0), int(min(PIE, y0 + l))):
            xc = x + 1.1 * math.sin(y * 0.16 + onda)
            for k in range(a):
                xi = redondo(xc) + k
                if 2 <= xi < W - 2:
                    L.mat[y, xi] = mat
                    L.emite[y, xi] = False
                    L.val[y, xi] = valor + (0.35 if k == 0 else -0.25) - 0.5 * (y - y0) / max(1.0, l)


def fondo_de(mascara):
    """Para colgar: la última fila de la máscara en cada columna."""
    def f(x):
        x = int(x)
        if not 0 <= x < W:
            return None
        ys = np.nonzero(mascara[:, x])[0]
        return int(ys.max()) - 2 if len(ys) else None
    return f


# ===========================================================================
# LAS ESPECIES (los nombres los usan ReinosScenes.CFG y generar-reinos)
# ===========================================================================
ESPECIES = {}


def especie(f):
    ESPECIES[f.__name__] = f
    return f


def P(h, s0, s1, v0, v1, giro=-0.035, curva=1.0):
    return rampa(h, s0, s1, v0, v1, giro=giro, curva=curva)


# ── Puerto ──────────────────────────────────────────────────────────────────
@especie
def tilo_costero(L):
    """Tilo: copa alta y redonda con la cima en corazón, verde lima."""
    cor = L.material(P(0.075, 0.38, 0.52, 0.13, 0.58, giro=0.01))
    hoj = L.material(P(0.24, 0.46, 0.74, 0.14, 0.76))
    tronco(L, cor, [(80, PIE), (80, 160), (80, 136)], [8.5, 7.0, 6.0], raices=3, ensanche=1.75, alto_raiz=14,
           sombra_copa=134)
    rama(L, cor, 80, 142, 58, 112, 4.2, 2.4, sombra=0.4)
    rama(L, cor, 80, 140, 103, 108, 4.0, 2.4, sombra=0.4)
    rama(L, cor, 80, 138, 82, 100, 3.6, 2.2, sombra=0.4)
    copa(L, hoj, [(80, 100, 50, 42), (80, 64, 40, 32), (72, 36, 24, 16), (92, 38, 22, 15)], r=21, hondo_hasta=122)


@especie
def pino_costero(L):
    """Pino piñonero: tronco alto, rojizo y algo torcido, copa en PARASOL."""
    cor = L.material(P(0.035, 0.50, 0.66, 0.14, 0.66, giro=0.015))
    hoj = L.material(P(0.40, 0.36, 0.56, 0.10, 0.58, giro=-0.04))
    tronco(L, cor, [(77, PIE), (79, 172), (83, 146), (88, 120), (92, 98)], [7.4, 6.4, 5.6, 4.8, 4.0],
           raices=2, ensanche=1.55, alto_raiz=10, vetas=1.3, sombra_copa=84)
    for (bx, by) in ((46, 80), (68, 72), (112, 70), (132, 80)):
        rama(L, cor, 92, 100, bx, by, 3.4, 1.8, sombra=0.4)
    copa(L, hoj, [(84, 62, 60, 20), (56, 72, 28, 12), (114, 70, 28, 12)], r=17, plano=0.72, hondo_hasta=76,
         abajo=0.5)


@especie
def jacaranda(L):
    """Jacaranda: copa ancha en jarrón, racimos violeta con el verde asomando
    entre ellos y las ramas a la vista por debajo."""
    cor = L.material(P(0.08, 0.16, 0.26, 0.15, 0.62, giro=0.0))
    ver = L.material(P(0.30, 0.45, 0.62, 0.10, 0.52))
    flo = L.material(P(0.735, 0.36, 0.50, 0.26, 0.94, giro=0.02))
    tronco(L, cor, [(80, PIE), (80, 166), (81, 148)], [6.4, 5.6, 5.0], raices=2, ensanche=1.65, alto_raiz=12,
           sombra_copa=112)
    for (ax, ay, bx, by, ra) in ((81, 152, 50, 104, 4.0), (81, 150, 79, 96, 3.6), (81, 152, 112, 102, 3.8),
                                 (62, 122, 34, 100, 2.4), (102, 120, 128, 98, 2.4)):
        rama(L, cor, ax, ay, bx, by, ra, ra * 0.55, sombra=0.25)
    masas = [(80, 76, 58, 28), (44, 94, 22, 13), (116, 92, 22, 13)]
    marco = (80, 80, 64, 34)
    copa(L, ver, masas, r=14, hondo=True, hondo_hasta=94, marco=marco, base_val=-0.1)
    copa(L, flo, masas, r=12, sep=1.5, hondo=False, marco=marco, hoja=3.2, paso_hoja=4.0, r_bulto=5.5)


# ── Pantano ─────────────────────────────────────────────────────────────────
@especie
def manglar(L):
    """Mangle: cúpula oscura y brillante sobre raíces en zancos que se arquean."""
    cor = L.material(P(0.075, 0.28, 0.40, 0.12, 0.58, giro=0.01))
    hoj = L.material(P(0.30, 0.50, 0.70, 0.10, 0.66))
    for x_suelo, y_sale, r0 in ((20, 146, 3.0), (34, 152, 2.6), (50, 156, 3.2), (66, 162, 2.6),
                                (96, 162, 2.6), (110, 156, 3.2), (126, 152, 2.6), (140, 146, 3.0)):
        p0 = (80 + (x_suelo - 80) * 0.1, y_sale)
        p1 = (80 + (x_suelo - 80) * 0.75, y_sale - 16)
        trazo(L, cor, _curva(p0, p1, (x_suelo, PIE), 14), r0, r0 * 0.7, sombra=0.1)
    tronco(L, cor, [(80, 170), (80, 140), (80, 116)], [7.0, 6.2, 5.2], raices=0, ensanche=1.0, alto_raiz=0,
           sombra_copa=112)
    copa(L, hoj, [(80, 80, 60, 38), (40, 100, 20, 13), (120, 98, 20, 13)], r=21, hondo_hasta=108)


@especie
def cipres_calvo(L):
    """Ciprés calvo: base muy abierta, tronco recto, ramas cortas con mechones
    planos en pagoda y barbas de musgo aquí y allá."""
    cor = L.material(P(0.06, 0.32, 0.45, 0.12, 0.60, giro=0.01))
    hoj = L.material(P(0.17, 0.40, 0.56, 0.13, 0.64, giro=-0.03))
    mus = L.material(P(0.20, 0.08, 0.16, 0.28, 0.66, giro=0.0))
    tronco(L, cor, [(80, PIE), (80, 150), (80, 90), (80, 28)], [8.5, 5.8, 4.4, 2.2], raices=4, ensanche=2.5,
           alto_raiz=30, vetas=1.4)
    tufts = []
    for y in range(40, 150, 17):
        ancho = 14 + (y - 40) * 0.36
        for lado in (-1, 1):
            rama(L, cor, 80, y, 80 + lado * ancho, y + 5, 2.2, 1.3)
            tufts.append((80 + lado * ancho * 0.6, y + 2, ancho * 0.55 + 4, 7))
    marco = (80, 92, 60, 64)
    c = copa(L, hoj, tufts, r=10, plano=0.62, hondo=False, marco=marco, hoja=2.2, paso_hoja=4.0)
    rng = L.rng
    xs = [x + rng.uniform(-3, 3) for x in range(20, 142, 9) if rng.random() < 0.5]
    colgantes(L, mus, xs, fondo_de(c), largo=(12, 40), ancho=2, valor=0.0)


@especie
def aliso_negro(L):
    """Aliso negro: corteza casi negra y la copa en TRES pisos separados."""
    cor = L.material(P(0.60, 0.05, 0.10, 0.08, 0.46, giro=0.0))
    hoj = L.material(P(0.38, 0.45, 0.62, 0.08, 0.52))
    tronco(L, cor, [(80, PIE), (80, 120), (80, 40)], [6.8, 5.2, 2.8], raices=2, ensanche=1.6, alto_raiz=12,
           vetas=1.2)
    for y, w in ((60, 28), (100, 40), (142, 50)):
        rama(L, cor, 80, y + 6, 80 - w * 0.85, y, 2.6, 1.4)
        rama(L, cor, 80, y + 6, 80 + w * 0.85, y - 2, 2.6, 1.4)
    marco = (80, 96, 56, 70)
    copa(L, hoj, [(80, 50, 28, 14)], r=15, plano=0.8, marco=marco)
    copa(L, hoj, [(80, 92, 42, 15)], r=16, plano=0.8, marco=marco)
    copa(L, hoj, [(80, 136, 52, 15)], r=17, plano=0.8, marco=marco)


# ── Aldor ───────────────────────────────────────────────────────────────────
@especie
def olivo_antiguo(L):
    """Olivo milenario: dos troncos retorcidos con un hueco, copa plateada y
    abierta en mechones."""
    cor = L.material(P(0.10, 0.14, 0.24, 0.14, 0.64, giro=0.0))
    hoj = L.material(P(0.21, 0.16, 0.30, 0.22, 0.80, giro=-0.04))
    tronco(L, cor, [(70, PIE), (66, 178), (72, 156), (64, 132), (56, 114)], [9, 7, 6, 5, 3.6], raices=2,
           ensanche=1.5, alto_raiz=12, vetas=1.5, nudos=2)
    tronco(L, cor, [(92, PIE), (96, 176), (88, 154), (98, 130), (108, 112)], [8, 6.5, 5.6, 4.6, 3.4],
           raices=1, ensanche=1.5, alto_raiz=12, vetas=1.5, nudos=2)
    hueco = np.hypot((XX - 81) / 4.0, (YY - 182) / 8.0) <= 1.0
    L.oscurece(hueco, 1.3)
    rama(L, cor, 58, 118, 40, 100, 2.6, 1.6, sombra=0.3)
    rama(L, cor, 104, 116, 124, 98, 2.6, 1.6, sombra=0.3)
    rama(L, cor, 66, 130, 80, 86, 2.4, 1.6, sombra=0.3)
    copa(L, hoj, [(50, 96, 32, 20), (110, 92, 32, 22), (82, 74, 40, 22)], r=14, sep=1.2, hondo=False,
         hoja=2.4, paso_hoja=4.0, marco=(80, 86, 64, 32))


@especie
def higuera_raices(L):
    """Higuera de raíces aéreas: copa muy ancha de hoja grande; de las ramas
    bajan raíces finas, unas hasta el suelo y otras a medio camino."""
    cor = L.material(P(0.09, 0.18, 0.30, 0.15, 0.66, giro=0.0))
    rai = L.material(P(0.09, 0.20, 0.32, 0.20, 0.72, giro=0.0))
    hoj = L.material(P(0.31, 0.52, 0.72, 0.11, 0.66))
    tronco(L, cor, [(80, PIE), (80, 150), (80, 112)], [9.5, 7.8, 6.2], raices=4, ensanche=1.8, alto_raiz=16,
           sombra_copa=104)
    rama(L, cor, 80, 120, 34, 100, 4.4, 2.8, sombra=0.5)
    rama(L, cor, 80, 120, 126, 98, 4.4, 2.8, sombra=0.5)
    for x, dx, fin in ((36, 2, PIE), (46, -2, 168), (58, 1, PIE), (102, -1, PIE), (114, 2, 160), (124, -2, PIE)):
        pts = [(x, 96), (x + dx * 0.4 + 1, 120), (x + dx * 0.8 - 1, 146), (x + dx, fin)]
        trazo(L, rai, pts, 1.3, 2.2 if fin == PIE else 1.1, sombra=0.1)
    copa(L, hoj, [(80, 70, 62, 30), (42, 90, 26, 13), (118, 88, 26, 13)], r=21, paso_hoja=6.0, hoja=3.4,
         hondo_hasta=94, r_bulto=10)


@especie
def laurel(L):
    """Laurel: tronco corto que se abre en tres y copa densa en huevo, verde
    oscuro brillante."""
    cor = L.material(P(0.08, 0.30, 0.42, 0.14, 0.58, giro=0.01))
    hoj = L.material(P(0.34, 0.45, 0.62, 0.09, 0.58))
    tronco(L, cor, [(80, PIE), (80, 166)], [6.4, 5.4], raices=2, ensanche=1.6, alto_raiz=10)
    for (tx, ty) in ((68, 140), (82, 132), (94, 142)):
        rama(L, cor, 80, 168, tx, ty, 3.6, 2.2, sombra=0.3)
    copa(L, hoj, [(80, 118, 44, 40), (80, 78, 36, 38), (80, 44, 22, 24)], r=18, hondo_hasta=140)


# ── Colinas ─────────────────────────────────────────────────────────────────
@especie
def arce_rojo(L):
    """Arce rojo: copa redonda carmesí que tira a naranja en la luz."""
    cor = L.material(P(0.07, 0.12, 0.20, 0.13, 0.58, giro=0.0))
    hoj = L.material(P(0.995, 0.66, 0.80, 0.18, 0.88, giro=0.025))
    tronco(L, cor, [(80, PIE), (80, 152), (80, 130)], [7.6, 6.2, 5.2], raices=3, ensanche=1.7, alto_raiz=13,
           sombra_copa=126)
    rama(L, cor, 80, 136, 58, 108, 3.8, 2.2, sombra=0.45)
    rama(L, cor, 80, 134, 103, 106, 3.8, 2.2, sombra=0.45)
    copa(L, hoj, [(80, 80, 54, 48), (52, 108, 22, 16), (110, 106, 22, 16)], r=20, hondo_hasta=118)


@especie
def ginkgo(L):
    """Ginkgo: tronco columna con ramas que suben, abanicos dorados en mechones
    sueltos que dejan ver las ramas."""
    cor = L.material(P(0.08, 0.18, 0.30, 0.14, 0.60, giro=0.0))
    hoj = L.material(P(0.135, 0.70, 0.85, 0.30, 0.97, giro=0.012))
    tronco(L, cor, [(80, PIE), (80, 120), (80, 26)], [6.6, 5.0, 2.2], raices=2, ensanche=1.55, alto_raiz=11)
    masas = []
    for i, y in enumerate(range(152, 40, -20)):
        lado = -1 if i % 2 == 0 else 1
        largo = 40 - i * 3.2
        ex, ey = 80 + lado * largo * 0.72, y - largo * 0.7
        rama(L, cor, 80, y, ex, ey, 2.8, 1.4)
        masas.append((80 + lado * largo * 0.5, y - largo * 0.5, 12, 9))
        masas.append((ex, ey, 13, 10))
    masas.append((80, 34, 12, 12))
    copa(L, hoj, masas, r=10, sep=1.0, hondo=False, hoja=2.2, paso_hoja=3.8, marco=(80, 96, 50, 72))


@especie
def roble_ambar(L):
    """Roble ámbar: tronco corto y grueso con brazos pesados, copa ancha y
    baja en ámbar, la sombra hacia el rojo."""
    cor = L.material(P(0.07, 0.40, 0.55, 0.12, 0.58, giro=0.01))
    hoj = L.material(P(0.075, 0.70, 0.85, 0.17, 0.92, giro=0.02))
    tronco(L, cor, [(80, PIE), (80, 158), (80, 140)], [9.5, 8.0, 7.0], raices=4, ensanche=1.8, alto_raiz=14,
           sombra_copa=128)
    rama(L, cor, 80, 146, 34, 118, 5.0, 3.0, sombra=0.45)
    rama(L, cor, 80, 144, 126, 116, 5.0, 3.0, sombra=0.45)
    rama(L, cor, 80, 142, 76, 102, 4.6, 3.0, sombra=0.45)
    copa(L, hoj, [(80, 90, 62, 36), (40, 116, 22, 12), (120, 114, 22, 12)], r=22, hondo_hasta=122)


@especie
def haya_cobre(L):
    """Haya roja: tronco gris plata casi liso, cúpula alta púrpura con luz
    cobriza."""
    cor = L.material(P(0.09, 0.05, 0.10, 0.16, 0.58, giro=0.0))
    hoj = L.material(P(0.985, 0.42, 0.55, 0.12, 0.60, giro=0.04))
    tronco(L, cor, [(80, PIE), (80, 140), (80, 118)], [8.0, 6.4, 5.2], raices=3, ensanche=1.7, alto_raiz=14,
           vetas=0.35, sombra_copa=118)
    rama(L, cor, 80, 124, 60, 96, 3.8, 2.2, sombra=0.45)
    rama(L, cor, 80, 122, 100, 94, 3.8, 2.2, sombra=0.45)
    copa(L, hoj, [(80, 72, 56, 56), (56, 112, 20, 11), (104, 110, 20, 11)], r=21, hondo_hasta=112)


# ── Selva ───────────────────────────────────────────────────────────────────
def contrafuerte(L, mat, x_t, y_top, x_g, cara):
    """Una aleta (tabla) del pie de la ceiba, del tronco (x_t, y_top) al suelo
    (x_g, PIE), con el borde de fuera cóncavo. `cara` = la luz de su cara."""
    lado = 1 if x_g > x_t else -1
    f = np.clip((YY - y_top) / float(PIE - y_top), 0, 1)
    borde = x_t + (x_g - x_t) * f ** 2.2
    m = (YY >= y_top) & (YY <= PIE) & ((XX - x_t) * lado >= -1) & ((XX - borde) * lado <= 0)
    filo = (XX - borde) * lado > -2.0
    v = cara + 0.2 * (1 - f) + np.where(filo, 0.25 if cara > 0 else -0.2, 0.0) - 0.3 * (YY >= PIE - 1)
    L.pon(m, mat, v)
    return m


def arista(L, mat, x, y_top, ancho):
    """Una aleta que sale hacia quien mira: una arista con una cara a la luz y
    otra en sombra, más ancha abajo."""
    f = np.clip((YY - y_top) / float(PIE - y_top), 0, 1)
    w = 1.0 + (ancho - 1.0) * f ** 1.8
    m = (YY >= y_top) & (YY <= PIE) & (np.abs(XX - x) <= w)
    v = np.where(XX < x, 0.4, -0.35) + 0.15 * (1 - f) - 0.3 * (YY >= PIE - 1)
    L.pon(m, mat, v)
    return m


@especie
def ceiba(L):
    """Ceiba: contrafuertes como tablas, tronco liso altísimo y copa plana en
    dos capas, con lianas."""
    cor = L.material(P(0.16, 0.08, 0.16, 0.14, 0.66, giro=0.0))
    hoj = L.material(P(0.29, 0.50, 0.70, 0.12, 0.68))
    lia = L.material(P(0.27, 0.42, 0.58, 0.14, 0.52))
    contrafuerte(L, cor, 74, 136, 34, 0.45)
    contrafuerte(L, cor, 86, 140, 128, -0.35)
    contrafuerte(L, cor, 75, 156, 50, 0.3)
    contrafuerte(L, cor, 85, 158, 112, -0.45)
    tronco(L, cor, [(80, PIE), (80, 120), (80, 66)], [8.0, 6.6, 5.4], raices=0, ensanche=1.25, alto_raiz=10,
           liso=True, sombra_copa=70)
    arista(L, cor, 70, 160, 6)
    arista(L, cor, 92, 166, 5)
    for (bx, by) in ((22, 56), (138, 56), (56, 52), (106, 50)):
        rama(L, cor, 80, 72, bx, by, 3.6, 2.0, sombra=0.4)
    marco = (80, 46, 72, 26)
    copa(L, hoj, [(80, 28, 40, 12)], r=15, plano=0.7, marco=marco)
    c = copa(L, hoj, [(80, 52, 66, 15), (34, 60, 24, 9), (126, 60, 24, 9)], r=16, plano=0.7, hondo_hasta=56,
             marco=marco)
    colgantes(L, lia, [26, 39, 61, 99, 117, 133], fondo_de(c), largo=(26, 66), ancho=2)


@especie
def platanera(L):
    """Platanera: falso tallo de vainas, hojas enormes en pala que se arquean,
    una hoja seca colgando, el racimo verde y la bellota morada."""
    tal = L.material(P(0.19, 0.30, 0.45, 0.22, 0.72, giro=0.0))
    hoj = L.material(P(0.25, 0.55, 0.75, 0.18, 0.82))
    sec = L.material(P(0.10, 0.40, 0.55, 0.18, 0.66, giro=0.01))
    rac = L.material(P(0.21, 0.55, 0.70, 0.22, 0.80))
    flo = L.material(P(0.93, 0.45, 0.60, 0.14, 0.55, giro=0.0))
    for ang, largo, caida in ((-1.70, 56, 0.22), (-1.30, 56, 0.25)):
        fronda(L, hoj, 80, 98, ang, largo, 12, caida=caida, tipo='pala', rasgos=3, sombra=0.2)
    fronda(L, sec, 84, 112, 1.48, 50, 7, caida=0.02, tipo='pala', rasgos=5)
    tronco(L, tal, [(80, PIE), (80, 150), (80, 96)], [7.4, 6.6, 5.6], raices=0, ensanche=1.3, alto_raiz=10,
           vetas=0.9)
    for ang, largo, caida in ((-2.30, 64, 0.40), (-0.80, 64, 0.40), (-2.80, 66, 0.55), (-0.32, 66, 0.55)):
        fronda(L, hoj, 80, 98, ang, largo, 12, caida=caida, tipo='pala', rasgos=3)
    trazo(L, tal, _curva((86, 100), (99, 104), (100, 134), 10), 1.8, 1.5)
    for i in range(6):
        y = 108 + i * 4.2
        for k in (-1.5, -0.5, 0.5, 1.5):
            x = 99.5 + k * 3.1
            rama(L, rac, x, y + 3, x + k * 1.3 + 0.8, y - 4, 1.8, 1.3)
    gota = np.hypot((XX - 100.5) / 4.6, (YY - 143) / 7.5) <= 1.0
    L.pon(gota, flo, 0.45 - 0.55 * (XX - 100.5) / 4.6 - 0.3 * (YY - 143) / 7.5)


@especie
def helecho_arboreo(L):
    """Helecho arborescente: tronco fino y peludo, corona de frondas en pluma
    que caen como una fuente."""
    tr = L.material(P(0.06, 0.45, 0.55, 0.08, 0.42, giro=0.0))
    hoj = L.material(P(0.29, 0.55, 0.75, 0.14, 0.75))
    m = tronco(L, tr, [(80, PIE), (79, 140), (81, 90), (80, 66)], [6.0, 5.0, 4.6, 4.8], raices=2, ensanche=1.6,
               vetas=1.6)
    cicatriz = m & (((YY - 66) % 7) < 1.2) & (YY < 130)
    L.oscurece(cicatriz, 0.4)
    for ang, largo, caida, sombra in ((-1.45, 50, 0.28, 0.3), (-1.85, 52, 0.32, 0.3), (-1.05, 54, 0.34, 0.25),
                                      (-2.35, 60, 0.45, 0.1), (-0.75, 60, 0.45, 0.1), (-2.80, 62, 0.55, 0.0),
                                      (-0.30, 62, 0.55, 0.0), (-3.05, 56, 0.70, -0.1), (-0.05, 56, 0.70, -0.1)):
        fronda(L, hoj, 80, 64, ang, largo, 8, caida=caida, tipo='pluma', sombra=sombra)


# ── Volcán ──────────────────────────────────────────────────────────────────
@especie
def arbol_carbonizado(L):
    """Árbol carbonizado: carbón con grietas de brasa que brillan."""
    car = L.material(P(0.05, 0.12, 0.20, 0.05, 0.36, giro=0.0))
    bra = L.material(P(0.065, 0.95, 0.85, 0.62, 1.0, giro=0.03))
    t = tronco(L, car, [(80, PIE), (80, 150), (78, 112), (80, 92)], [8.6, 6.8, 5.4, 4.2], raices=3, ensanche=1.7,
               alto_raiz=14, vetas=1.5)
    rng = L.rng
    ramas_secas(L, car, 78, 116, -2.5, 30, 3.6, 3, rng)
    ramas_secas(L, car, 80, 98, -0.75, 32, 3.2, 3, rng)
    ramas_secas(L, car, 80, 94, -1.62, 24, 3.0, 2, rng)
    grieta = np.abs(ruido(rng, 2.2, 10.0) - 0.5) < 0.035
    L.pon(t & grieta & (YY > 112), bra, 0.45 - 0.4 * (YY < 140), emite=True)


@especie
def pino_ceniza(L):
    """Pino de ceniza: pisos separados (se ve el tronco entre ellos), gris
    verdoso con ceniza gris encima de cada piso."""
    cor = L.material(P(0.06, 0.20, 0.30, 0.10, 0.46, giro=0.0))
    hoj = L.material(P(0.33, 0.12, 0.22, 0.12, 0.52, giro=-0.02))
    ash = L.material(P(0.07, 0.04, 0.08, 0.32, 0.70, giro=0.0))
    tronco(L, cor, [(80, PIE), (80, 120), (80, 30)], [6.6, 5.0, 2.2], raices=2, ensanche=1.5, alto_raiz=10)
    pisos(L, hoj, 80, 20, 168, 62, 5, dedo=10.0, caida=10.0, ceniza=(ash, 2), grosor=0.8)


@especie
def arbusto_brasa(L):
    """Arbusto de brasa: mata baja de hoja granate con racimos que arden."""
    tal = L.material(P(0.05, 0.25, 0.35, 0.08, 0.36, giro=0.0))
    hoj = L.material(P(0.99, 0.55, 0.70, 0.14, 0.58, giro=0.02))
    bra = L.material(P(0.075, 0.95, 0.85, 0.62, 1.0, giro=0.03))
    for (bx, tx, ty) in ((74, 66, 172), (82, 84, 166), (88, 98, 172)):
        rama(L, tal, bx, PIE, tx, ty, 2.6, 1.8)
    masas = [(80, 164, 46, 24), (54, 176, 20, 13), (106, 174, 22, 13)]
    c = copa(L, hoj, masas, r=16, hondo=True)
    copa(L, bra, masas, r=7, sep=2.6, hondo=False, recorte=c & (YY < 168), emite=True, base_val=0.15,
         peso_global=0.25)


# ── Bosque de hongos ────────────────────────────────────────────────────────
def _setas_mats(L, h, s, borde_h):
    pie = L.material(P(0.10, 0.10, 0.24, 0.30, 0.90, giro=0.0))
    som = L.material(P(h, s * 0.8, s, 0.16, 0.86, giro=0.015))
    lam = L.material(P(h + 0.02, 0.12, 0.22, 0.30, 0.74, giro=0.0))
    bri = L.material(P(borde_h, 0.65, 0.45, 0.62, 1.0, giro=0.0))
    return pie, som, lam, bri


@especie
def seta_paraguas(L):
    """Seta parasol: pie alto y fino con anillo, sombrero ancho y plano añil
    con el borde que brilla turquesa."""
    pie, som, lam, bri = _setas_mats(L, 0.67, 0.6, 0.50)
    pie_seta(L, pie, 50, PIE, 178, 3.2, 2.6)
    sombrero(L, som, 50, 176, 12, 8, laminas=(lam,), borde=(bri,), alto_borde=2, grano=1.8)
    pie_seta(L, pie, 80, PIE, 82, 7.0, 5.0, curva=4, anillo=(104, 9))
    sombrero(L, som, 84, 76, 58, 26, laminas=(lam,), borde=(bri,), alto_borde=5)


@especie
def seta_campana(L):
    """Setas campana: tres sombreros acampanados coral, el borde ámbar."""
    pie, som, lam, bri = _setas_mats(L, 0.025, 0.62, 0.12)
    for (cx, alto, rx, ry, curva) in ((50, 62, 22, 26, -3), (122, 34, 14, 16, 2), (88, 98, 36, 40, 3)):
        pie_seta(L, pie, cx, PIE, PIE - alto, 4.4 + rx * 0.06, 3.2 + rx * 0.05, curva=curva)
        sombrero(L, som, cx + curva, PIE - alto - ry * 0.25, rx, ry, forma='campana', laminas=(lam,),
                 borde=(bri,), alto_borde=3)


@especie
def seta_torre(L):
    """Seta torre: un pie alto con cuatro sombreros en pagoda, dorados, que
    brillan por debajo."""
    pie, som, lam, bri = _setas_mats(L, 0.09, 0.75, 0.15)
    pie_seta(L, pie, 80, PIE, 30, 7.6, 3.8)
    for (y, rx, ry) in ((40, 16, 14), (76, 26, 13), (112, 36, 14), (150, 46, 15)):
        sombrero(L, som, 80, y, rx, ry, laminas=(lam,), borde=(bri,), alto_borde=4)


# ===========================================================================
def dibujar(nombre):
    """La imagen RGBA (160 x 200) de una especie."""
    L = Lienzo(nombre)
    ESPECIES[nombre](L)
    return L.imagen()


if __name__ == '__main__':
    salida = sys.argv[1]
    nombres = sys.argv[2:] or list(ESPECIES)
    K = 2
    por_fila = 6
    filas = (len(nombres) + por_fila - 1) // por_fila
    hoja = Image.new('RGBA', (por_fila * W * K, filas * H * K), (104, 142, 88, 255))
    for i, n in enumerate(nombres):
        im = dibujar(n).resize((W * K, H * K), Image.NEAREST)
        hoja.alpha_composite(im, ((i % por_fila) * W * K, (i // por_fila) * H * K))
    hoja.save(salida)
    print(hoja.size, len(nombres))
