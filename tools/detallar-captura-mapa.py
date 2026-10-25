# -*- coding: utf-8 -*-
"""
DETALLE A ESCALA DE MUNDO SOBRE LA CAPTURA DEL SUELO              (2026-10-04)

    python tools/detallar-captura-mapa.py <captura.png> <salida.png>

La captura (tools/captura-mapa.mjs) es la capa de casillas tal cual: aunque
el tileset ya lleva detalle (tools/mejorar-tiles-mapa.py), una casilla de
16 px repetida doce mil veces sigue leyéndose como papel pintado. Esto pinta
lo que una casilla NO puede tener, porque depende de dónde está en el mundo:

  1. TONO A GRAN ESCALA: zonas de hierba un poco más claras y más oscuras
     (ruido de 300 y 110 px), con TRAMADO de Bayer en tres niveles para que
     no salgan degradados suaves en un juego de pixel art.
  2. SOMBRA DE LOS CAMINOS: la piedra está un poco más alta que la hierba;
     deja una sombra de 1 a 4 px hacia abajo a la derecha, como el sol de
     gf-sombras (arriba a la izquierda).
  3. MATAS, FLORECILLAS Y GUIJARROS repartidos al azar (con semilla fija)
     solo donde hay hierba o tierra alrededor: rompen la repetición.
  4. DESTELLOS en el agua, sueltos.

Determinista: la misma captura da siempre la misma salida. No toca nada que
no sea hierba, tierra, piedra o agua (contornos, flores y bordes se quedan).

SIN PUNTOS NI TRAMAS (2026-10-05). "En el césped hay muchos puntos y sufro de
tripofobia." El tono iba con tramado de Bayer (cuadritos de un píxel en cada
cambio de zona), la sombra de los caminos acababa en otro tramado, y había
"matas" de cuatro píxeles, florecillas de UN píxel y guijarros de dos
sembrados por todo el mapa. Ahora:
  1. las zonas de tono son MANCHAS LISAS de bordes limpios (sin tramado) y un
     filtro de mayoría borra cualquier isla de pocos píxeles;
  2. la sombra de la piedra va en escalones lisos;
  3. en vez de puntos, MATAS DE BRIZNAS (trazos de 3 a 6 px), pocas y
     separadas entre sí; sin florecillas sueltas ni guijarros.
"""
import sys
import numpy as np
from PIL import Image

SEMILLA = 20261004
BAYER = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16.0


def ruido(h, w, paso, rng):
    """Ruido de valor suave en [-1, 1] con celdas de `paso` px."""
    gh, gw = h // paso + 3, w // paso + 3
    g = rng.uniform(-1, 1, (gh, gw)).astype(np.float32)
    ys = np.arange(h, dtype=np.float32) / paso
    xs = np.arange(w, dtype=np.float32) / paso
    y0 = ys.astype(int); x0 = xs.astype(int)
    fy = ys - y0; fx = xs - x0
    fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
    a = g[y0][:, x0]; b = g[y0][:, x0 + 1]; c = g[y0 + 1][:, x0]; d = g[y0 + 1][:, x0 + 1]
    top = a + (b - a) * fx[None, :]
    bot = c + (d - c) * fx[None, :]
    return top + (bot - top) * fy[:, None]


def caja(a, r):
    """Suma de `a` en una ventana de (2r+1) x (2r+1) alrededor de cada píxel."""
    p = np.pad(a.astype(np.int32), r, mode='edge')
    c = np.cumsum(np.cumsum(p, 0), 1)
    c = np.pad(c, ((1, 0), (1, 0)))
    k = 2 * r + 1
    return c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]


def mayoria(nivel, valores, lado):
    """Cada píxel toma el nivel que más abunda a su alrededor: borra las islas
    de pocos píxeles que deja un umbral sobre el ruido."""
    r = lado // 2
    cuentas = np.stack([caja(nivel == v, r) for v in valores])
    return np.array(valores, np.int8)[np.argmax(cuentas, axis=0)]


def main(entrada, salida, matas=True):
    rng = np.random.default_rng(SEMILLA)
    im = np.array(Image.open(entrada).convert('RGBA')).astype(np.int16)
    h, w = im.shape[:2]
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
    sat = (mx - mn)

    hierba = (g > r + 30) & (g > b + 25) & (mx > 80)
    agua = (b > r + 45) & (b > g + 10) & (mx > 110)
    tierra = (r > g + 25) & (g > b + 10) & (mx > 120)
    piedra = (sat < 22) & (mx > 70) & (mx < 170)
    print('hierba %.0f%%  agua %.0f%%  tierra %.0f%%  piedra %.0f%%' % (
        hierba.mean() * 100, agua.mean() * 100, tierra.mean() * 100, piedra.mean() * 100))

    # ── 1. tono a gran escala: manchas lisas, sin tramado ─────────────────
    n = ruido(h, w, 300, rng) * 0.7 + ruido(h, w, 110, rng) * 0.3
    nivel = np.zeros((h, w), np.int8)
    nivel[n > 0.16] = 1
    nivel[n > 0.48] = 2
    nivel[n < -0.16] = -1
    nivel[n < -0.48] = -2
    nivel = mayoria(nivel, (-2, -1, 0, 1, 2), 9)
    for masc, paso in ((hierba, (5, 9, 4)), (tierra, (6, 5, 4)), (agua, (4, 6, 7))):
        for k in range(3):
            im[..., k] += (nivel * paso[k] * masc).astype(np.int16)

    # ── 2. sombra de la piedra sobre la hierba y la tierra ────────────────
    sombra = np.zeros((h, w), np.float32)
    for dy, dx, peso in ((1, 1, 1.0), (2, 1, 0.75), (3, 2, 0.5), (4, 2, 0.28)):
        s = np.zeros((h, w), bool)
        s[dy:, dx:] = piedra[:-dy, :-dx]
        sombra = np.maximum(sombra, s * peso)
    suelo = hierba | tierra
    # Escalones lisos (el último, muy suave): sin tramado.
    oscurece = np.where(sombra > 0.6, 0.72, np.where(sombra > 0.35, 0.82, np.where(sombra > 0.2, 0.93, 1.0)))
    for k in range(3):
        im[..., k] = np.where(suelo, (im[..., k] * oscurece).astype(np.int16), im[..., k])

    # ── 3. matas, florecillas y guijarros ────────────────────────────────
    def libre(m, y, x, rad):
        return m[max(0, y - rad):y + rad + 1, max(0, x - rad):x + rad + 1].all()

    # Una mata: de 3 a 5 briznas que salen de un mismo pie, cada una un
    # trazo de 3 a 6 px un poco inclinado, oscuro abajo y claro en la punta.
    # Son RAYAS, no puntos, y van sueltas: nunca en grupos apretados.
    def pinta_mata(y, x, rr):
        base = im[y, x, :3].copy()
        osc, med, cla = base + (-12, -20, -11), base + (8, 13, 6), base + (18, 28, 12)
        for b in range(int(rr.integers(3, 6))):
            alto = int(rr.integers(3, 7))
            dx0 = int(rr.integers(-2, 3))
            incl = float(rr.uniform(-0.5, 0.5)) + dx0 * 0.18
            for k in range(alto):
                yy = y - k
                xx = x + dx0 + int(round(incl * k))
                if not (0 <= yy < h and 0 <= xx < w) or not hierba[yy, xx]:
                    break
                im[yy, xx, :3] = osc if k == 0 else (cla if k >= alto - 2 else med)

    n_hierba, n_tierra, n_agua = int(hierba.sum()), int(tierra.sum()), int(agua.sum())
    total = 0
    # (2026-10-25) `--sin-matas`: en el suelo de roca de la caverna las briznas
    # recoloreadas parecían huellas de pata (grupitos de manchas): fuera.
    n_matas = n_hierba // 9000 if matas else 0
    SEP = 34                                   # px entre mata y mata, como poco
    rejilla = {}
    def lejos_de_otras(y, x):
        cy, cx = y // SEP, x // SEP
        for j in (cy - 1, cy, cy + 1):
            for i in (cx - 1, cx, cx + 1):
                for (oy, ox) in rejilla.get((j, i), ()):
                    if (oy - y) ** 2 + (ox - x) ** 2 < SEP * SEP:
                        return False
        return True
    ys = rng.integers(8, h - 8, n_matas * 6); xs = rng.integers(8, w - 8, n_matas * 6)
    for y, x in zip(ys, xs):
        if total >= n_matas: break
        y, x = int(y), int(x)
        if not hierba[y, x] or not libre(hierba, y - 4, x, 4) or not lejos_de_otras(y, x): continue
        pinta_mata(y, x, rng)
        rejilla.setdefault((y // SEP, x // SEP), []).append((y, x))
        total += 1
    flores = 0
    piedras = 0

    # ── 4. destellos en el agua ───────────────────────────────────────────
    brillos = 0
    for y, x in zip(rng.integers(2, h - 2, 20000), rng.integers(2, w - 4, 20000)):
        if brillos >= n_agua // 1800: break
        if not agua[y, x] or not libre(agua, y, x, 2): continue
        im[y, x, :3] += (34, 34, 28); im[y, x + 1, :3] += (20, 20, 16)
        brillos += 1

    print('matas', total, 'flores', flores, 'guijarros', piedras, 'destellos', brillos)
    np.clip(im, 0, 255, out=im)
    Image.fromarray(im.astype(np.uint8), 'RGBA').save(salida, optimize=True)
    print('->', salida)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if a != '--sin-matas']
    if len(args) != 2:
        raise SystemExit(__doc__)
    main(args[0], args[1], matas='--sin-matas' not in sys.argv)
