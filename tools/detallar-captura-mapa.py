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


def main(entrada, salida):
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

    # ── 1. tono a gran escala, tramado ────────────────────────────────────
    n = ruido(h, w, 300, rng) * 0.7 + ruido(h, w, 110, rng) * 0.3
    umbral = np.tile(BAYER, (h // 4 + 1, w // 4 + 1))[:h, :w]
    # Cinco niveles (-2..2): con tres no se llegaba a ver la variación.
    nivel = np.zeros((h, w), np.int8)
    nivel[n > 0.10 + 0.22 * umbral] = 1
    nivel[n > 0.42 + 0.22 * umbral] = 2
    nivel[n < -0.10 - 0.22 * umbral] = -1
    nivel[n < -0.42 - 0.22 * umbral] = -2
    for masc, paso in ((hierba, (6, 11, 5)), (tierra, (7, 6, 5)), (agua, (4, 6, 7))):
        for k in range(3):
            im[..., k] += (nivel * paso[k] * masc).astype(np.int16)

    # ── 2. sombra de la piedra sobre la hierba y la tierra ────────────────
    sombra = np.zeros((h, w), np.float32)
    for dy, dx, peso in ((1, 1, 1.0), (2, 1, 0.75), (3, 2, 0.5), (4, 2, 0.28)):
        s = np.zeros((h, w), bool)
        s[dy:, dx:] = piedra[:-dy, :-dx]
        sombra = np.maximum(sombra, s * peso)
    suelo = hierba | tierra
    oscurece = np.where(sombra > 0.6, 0.72, np.where(sombra > 0.35, 0.82, np.where(sombra > 0.2, 0.91, 1.0)))
    # El último escalón, tramado: así la sombra se deshace sin franja.
    tramo = (sombra > 0.2) & (sombra <= 0.35) & (umbral > 0.5)
    oscurece = np.where(tramo, 1.0, oscurece)
    for k in range(3):
        im[..., k] = np.where(suelo, (im[..., k] * oscurece).astype(np.int16), im[..., k])

    # ── 3. matas, florecillas y guijarros ────────────────────────────────
    def libre(m, y, x, rad):
        return m[max(0, y - rad):y + rad + 1, max(0, x - rad):x + rad + 1].all()

    MATAS = [
        [(0, 0, 'c'), (1, 0, 'o'), (0, 1, 'c2'), (-1, 1, 'c')],
        [(0, 0, 'c2'), (0, 1, 'o'), (1, -1, 'c'), (1, 0, 'o'), (-1, -1, 'c')],
        [(0, 0, 'c'), (0, 1, 'o'), (-1, 0, 'c'), (1, 1, 'c2'), (1, 2, 'o')],
    ]
    def pinta_mata(y, x, forma):
        base = im[y, x, :3].copy()
        tonos = {'c': base + (14, 22, 10), 'c2': base + (26, 38, 18), 'o': base + (-12, -20, -11)}
        for dy, dx, t in forma:
            yy, xx = y + dy, x + dx
            if 0 <= yy < h and 0 <= xx < w and hierba[yy, xx]:
                im[yy, xx, :3] = tonos[t]

    n_hierba, n_tierra, n_agua = int(hierba.sum()), int(tierra.sum()), int(agua.sum())
    total = 0
    n_matas = n_hierba // 1400
    ys = rng.integers(3, h - 3, n_matas * 3); xs = rng.integers(3, w - 3, n_matas * 3)
    for y, x in zip(ys, xs):
        if total >= n_matas: break
        if not hierba[y, x] or not libre(hierba, y, x, 3): continue
        pinta_mata(y, x, MATAS[int(rng.integers(0, len(MATAS)))])
        total += 1
    flores = 0
    COLORES = [(250, 250, 240), (245, 225, 70), (232, 140, 210), (160, 200, 255)]
    for y, x in zip(rng.integers(3, h - 3, 4000), rng.integers(3, w - 3, 4000)):
        if flores >= n_hierba // 26000: break
        if not hierba[y, x] or not libre(hierba, y, x, 3): continue
        c = COLORES[int(rng.integers(0, len(COLORES)))]
        im[y, x, :3] = c
        im[y + 1, x, :3] = im[y + 1, x, :3] + (-14, -22, -12)
        flores += 1
    piedras = 0
    for y, x in zip(rng.integers(3, h - 3, 9000), rng.integers(3, w - 3, 9000)):
        if piedras >= n_tierra // 2600: break
        if not tierra[y, x] or not libre(tierra, y, x, 2): continue
        im[y, x, :3] = (214, 190, 168); im[y, x + 1, :3] = (190, 162, 140)
        im[y + 1, x, :3] = (132, 98, 78); im[y + 1, x + 1, :3] = (118, 88, 70)
        piedras += 1

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
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
