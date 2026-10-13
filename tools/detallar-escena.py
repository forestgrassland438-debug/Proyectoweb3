# -*- coding: utf-8 -*-
"""
DETALLE A ESCALA DE MUNDO PARA LA ISLA, LA TIENDA Y LA MINA       (2026-10-05)

    python tools/detallar-escena.py <lands|tienda|mina> <captura.png> <salida.png>

Lo mismo que tools/detallar-captura-mapa.py hace con el pueblo, pero con lo
que cada escena tiene de suyo. La captura sale de tools/captura-escena.html y
lo que esto escribe lo trocea tools/trocear-escena.py.

  lands   · LOS ESCALONES DE LA HIERBA, REDONDEADOS: la isla está hecha de
            casillas de 32 px y la orilla de la hierba bajaba en escalera. Se
            suaviza la máscara de hierba (desenfoque + umbral) y se repinta lo
            que cambia de lado copiando la textura de la casilla de al lado
            (la hierba y la arena se repiten cada 32 px). La orilla del AGUA no
            se toca: el agua animada (gf-agua.js) sale de las casillas y no
            casaría.
          · ARENA MOJADA: lo que está a menos de 14 px del agua, más oscuro y
            más saturado, tramado.
          · la hierba un poco más alta que la arena: sombra de 1-3 px.
          · tono a gran escala LISO y matas de briznas. Desde 2026-10-11, sin
            motas: los píxeles sueltos de las casillas se igualan, sin
            tramado, y sin flores, conchas ni guijarros (tripofobia).
  tienda  · sombra de las paredes sobre el suelo (oclusión) y bajo los muebles
            empotrados, tramada; tono a gran escala en la madera; las paredes
            de yeso, más claras arriba y más oscuras abajo.
  mina    · solo tono a gran escala: el arte de la mina ya viene detallado
            (tools/gf_mina_pro.py) y aquí lo único que faltaba era romper la
            repetición del suelo.

Determinista (semilla fija): la misma captura da siempre la misma salida.
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

SEMILLA = 20261005
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


def umbral_bayer(h, w):
    return np.tile(BAYER, (h // 4 + 1, w // 4 + 1))[:h, :w]


def niveles(n, u):
    """Cinco niveles tramados (-2..2) a partir de un ruido en [-1, 1]."""
    nivel = np.zeros(n.shape, np.int8)
    nivel[n > 0.10 + 0.22 * u] = 1
    nivel[n > 0.42 + 0.22 * u] = 2
    nivel[n < -0.10 - 0.22 * u] = -1
    nivel[n < -0.42 - 0.22 * u] = -2
    return nivel


def tono(im, masc, nivel, paso):
    for k in range(3):
        im[..., k] += (nivel * paso[k] * masc).astype(np.int16)


def distancia(masc, maximo):
    """Distancia (en px, 8-vecinos) de cada píxel a `masc`, hasta `maximo`."""
    h, w = masc.shape
    d = np.full((h, w), maximo + 1, np.int16)
    d[masc] = 0
    frente = masc.copy()
    for paso in range(1, maximo + 1):
        cre = frente.copy()
        cre[1:, :] |= frente[:-1, :]; cre[:-1, :] |= frente[1:, :]
        cre[:, 1:] |= frente[:, :-1]; cre[:, :-1] |= frente[:, 1:]
        nuevo = cre & (d > paso)
        d[nuevo] = paso
        frente = cre
    return d


def copiar_textura(im, orig, destino, fuente, periodo):
    """Pinta los píxeles `destino` con el color del píxel a ±periodo (o ±2·periodo)
    que sea `fuente` en la máscara original: la textura de las casillas sigue."""
    h, w = fuente.shape
    hecho = np.zeros_like(destino)
    for k in (1, 2, 3):
        for dy, dx in ((0, periodo * k), (0, -periodo * k), (periodo * k, 0), (-periodo * k, 0)):
            ys, xs = np.nonzero(destino & ~hecho)
            if not len(ys): return
            sy, sx = ys + dy, xs + dx
            ok = (sy >= 0) & (sy < h) & (sx >= 0) & (sx < w)
            ys, xs, sy, sx = ys[ok], xs[ok], sy[ok], sx[ok]
            ok2 = fuente[sy, sx]
            ys, xs, sy, sx = ys[ok2], xs[ok2], sy[ok2], sx[ok2]
            im[ys, xs, :3] = orig[sy, sx, :3]
            hecho[ys, xs] = True


def libre(m, y, x, rad):
    return m[max(0, y - rad):y + rad + 1, max(0, x - rad):x + rad + 1].all()


def caja(a, r):
    """Suma de `a` en una ventana de (2r+1) x (2r+1) alrededor de cada píxel."""
    p = np.pad(a.astype(np.int32), r, mode='edge')
    c = np.cumsum(np.cumsum(p, 0), 1)
    c = np.pad(c, ((1, 0), (1, 0)))
    k = 2 * r + 1
    return c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]


def mayoria(nivel, valores, lado):
    """Cada píxel toma el nivel que más abunda a su alrededor: borra las islas
    de pocos píxeles que deja un umbral sobre el ruido (y que serían puntos)."""
    r = lado // 2
    cuentas = np.stack([caja(nivel == v, r) for v in valores])
    return np.array(valores, np.int8)[np.argmax(cuentas, axis=0)]


def moda(im, masc):
    """El color que más se repite dentro de `masc`."""
    c = im[masc][:, :3].astype(np.int32)
    if not len(c):
        return None
    clave = (c[:, 0] << 16) | (c[:, 1] << 8) | c[:, 2]
    v, n = np.unique(clave, return_counts=True)
    k = int(v[np.argmax(n)])
    return np.array([(k >> 16) & 255, (k >> 8) & 255, k & 255], np.int16)


MATAS = [
    [(0, 0, 'c'), (1, 0, 'o'), (0, 1, 'c2'), (-1, 1, 'c')],
    [(0, 0, 'c2'), (0, 1, 'o'), (1, -1, 'c'), (1, 0, 'o'), (-1, -1, 'c')],
    [(0, 0, 'c'), (0, 1, 'o'), (-1, 0, 'c'), (1, 1, 'c2'), (1, 2, 'o')],
    [(0, 0, 'c'), (-1, 0, 'c2'), (-2, 0, 'c'), (0, 1, 'o'), (1, 1, 'o'), (-1, 1, 'o')],
]


# ═══════════════════════════════════════════════════════════════ LA ISLA
def lands(im, rng):
    h, w = im.shape[:2]
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    mx = np.maximum(np.maximum(r, g), b)
    agua = (b > 110) & (b > r + 35) & (b > g + 10)
    hierba = (g > r + 30) & (g > b + 10) & (mx > 60) & ~agua
    arena = (r > g + 12) & (g > b + 25) & (r > 150) & ~agua
    print('hierba %.0f%%  arena %.0f%%  agua %.0f%%' % (hierba.mean() * 100, arena.mean() * 100, agua.mean() * 100))
    orig = im.copy()

    # ── 1. los escalones de la hierba, redondeados ───────────────────────
    tierra = hierba | arena
    m = Image.fromarray((hierba * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(15))
    suave = (np.array(m) > 127) & tierra
    # Lejos del agua: que la hierba nunca llegue a tocarla.
    cerca_agua = distancia(agua, 6) <= 6
    suave &= ~cerca_agua | hierba
    a_arena = hierba & ~suave
    a_hierba = arena & suave & ~cerca_agua
    # Las casillas del borde traen dibujado su perfil (una raya clara en la
    # hierba, una oscura en la arena). Si solo se repintara lo que cambia de
    # lado, ese perfil viejo se quedaría dentro, en escalera. Así que se
    # repinta también la franja de 3 px junto al borde VIEJO, y siempre con
    # textura del INTERIOR (lejos de cualquier borde).
    junto_arena = distancia(arena, 3) <= 3
    junto_hierba = distancia(hierba, 3) <= 3
    fuente_h = hierba & (distancia(~hierba, 4) >= 4)
    fuente_a = arena & (distancia(~arena, 4) >= 4)
    nueva_h = (hierba & ~a_arena) | a_hierba
    nueva_a = (arena & ~a_hierba) | a_arena
    copiar_textura(im, orig, nueva_a & (junto_hierba | a_arena), fuente_a, 32)
    copiar_textura(im, orig, nueva_h & (junto_arena | a_hierba), fuente_h, 32)
    hierba = (hierba & ~a_arena) | a_hierba
    arena = (arena & ~a_hierba) | a_arena
    print('escalones: %d px a arena, %d px a hierba' % (a_arena.sum(), a_hierba.sum()))

    # ── 1b. SIN MOTAS (2026-10-11) ───────────────────────────────────────
    # "Repara el piso de la Lands como hiciste con el de GameScene" (sufre de
    # tripofobia). Las casillas de la isla traen la hierba y la arena
    # salpicadas de píxeles sueltos de otros tonos: el 13 % de la hierba y el
    # 9 % de la arena eran motas. Se igualan al tono BASE de su material
    # (el que más se repite); la variedad la ponen el tono a gran escala (2),
    # liso, y las matas de briznas (5). El borde entre hierba y arena (3 px)
    # se deja: es el perfil de la orilla, una raya, no motas.
    # Las marquitas claras de la arena (#f6ecd6) no entran en la máscara de
    # arena por ser casi blancas: las que están rodeadas de arena, también.
    crema = (im[..., 0] > 230) & (im[..., 1] > 215) & (im[..., 2] > 190) & ~agua & (caja(arena, 2) >= 12)
    arena_y_marcas = arena | crema
    for masc in (hierba, arena_y_marcas):
        base = moda(im, masc & ~crema)
        if base is None:
            continue
        dentro = masc & (distancia(~masc, 3) >= 3)
        im[dentro, 0] = base[0]; im[dentro, 1] = base[1]; im[dentro, 2] = base[2]

    # ── 2. tono a gran escala: manchas LISAS (sin tramado) ───────────────
    # Antes los cinco niveles se cortaban con un tramado de Bayer: una
    # rejilla de puntos por toda la isla. Ahora, umbral liso y la mayoría de
    # 9 px se lleva los grupitos sueltos que deja el corte. La octava fina
    # pesa poco (0,12): es la que hacía manchitas redondas sueltas.
    n = ruido(h, w, 220, rng) * 0.88 + ruido(h, w, 90, rng) * 0.12
    nivel = np.zeros((h, w), np.int8)
    nivel[n > 0.16] = 1
    nivel[n > 0.48] = 2
    nivel[n < -0.16] = -1
    nivel[n < -0.48] = -2
    nivel = mayoria(nivel, (-2, -1, 0, 1, 2), 9)
    # Y dos pasadas anchas (21 px): fuera las manchitas redondas sueltas; las
    # manchas que quedan son grandes y de borde suave.
    nivel = mayoria(mayoria(nivel, (-2, -1, 0, 1, 2), 21), (-2, -1, 0, 1, 2), 21)
    tono(im, hierba, nivel, (5, 9, 4))
    tono(im, arena, nivel, (6, 5, 3))

    # ── 3. arena mojada junto al agua ────────────────────────────────────
    d = distancia(agua, 14)
    moja = arena & (d <= 14)
    k = np.clip(1.0 - (d - 1) / 13.0, 0, 1)
    # En tres franjas lisas paralelas al agua (antes se deshacía en puntos
    # con un tramado: justo lo que no puede haber).
    k = np.where(k > 0.66, 1.0, np.where(k > 0.33, 0.62, np.where(k > 0, 0.3, 0.0)))
    for c, f in ((0, 0.78), (1, 0.80), (2, 0.86)):
        im[..., c] = np.where(moja, (im[..., c] * (1 - (1 - f) * k)).astype(np.int16), im[..., c])

    # ── 4. la hierba un poco más alta: su sombra sobre la arena ──────────
    sombra = np.zeros((h, w), np.float32)
    for dy, dx, peso in ((1, 1, 1.0), (2, 1, 0.7), (3, 2, 0.4)):
        s = np.zeros((h, w), bool)
        s[dy:, dx:] = hierba[:-dy, :-dx]
        sombra = np.maximum(sombra, s * peso)
    osc = np.where(sombra > 0.8, 0.80, np.where(sombra > 0.5, 0.88, np.where(sombra > 0.3, 0.94, 1.0)))
    for c in range(3):
        im[..., c] = np.where(arena, (im[..., c] * osc).astype(np.int16), im[..., c])
    # Y el canto de la hierba, más claro (le da el sol).
    canto = hierba.copy(); canto[1:, :] &= ~hierba[:-1, :]
    for c, s in ((0, 10), (1, 18), (2, 8)):
        im[..., c] = np.where(canto, im[..., c] + s, im[..., c])

    # ── 5. matas de briznas (como en el pueblo) ──────────────────────────
    # Antes: matas de 4-6 píxeles, florecillas de un píxel de color, conchas
    # y guijarros de 2x2. Con la isla al doble eran PUNTOS repartidos por
    # todas partes. Ahora solo matas de 3 a 5 briznas que salen de un mismo
    # pie: RAYAS de 3 a 6 px, oscuras abajo y claras en la punta, sueltas
    # (34 px entre una y otra como poco). Ni flores, ni conchas, ni guijarros.
    def pinta_mata(y, x, rr):
        base = im[y, x, :3].copy()
        osc, med, cla = base + (-12, -20, -11), base + (8, 13, 6), base + (18, 28, 12)
        for _b in range(int(rr.integers(3, 6))):
            alto = int(rr.integers(3, 7))
            dx0 = int(rr.integers(-2, 3))
            incl = float(rr.uniform(-0.5, 0.5)) + dx0 * 0.18
            for kk in range(alto):
                yy = y - kk
                xx = x + dx0 + int(round(incl * kk))
                if not (0 <= yy < h and 0 <= xx < w) or not hierba[yy, xx]:
                    break
                im[yy, xx, :3] = osc if kk == 0 else (cla if kk >= alto - 2 else med)

    nh = int(hierba.sum())
    matas = 0
    n_matas = nh // 9000
    SEP = 34
    rejilla = {}

    def lejos_de_otras(y, x):
        cy, cx = y // SEP, x // SEP
        for jj in (cy - 1, cy, cy + 1):
            for ii in (cx - 1, cx, cx + 1):
                for (oy, ox) in rejilla.get((jj, ii), ()):
                    if (oy - y) ** 2 + (ox - x) ** 2 < SEP * SEP:
                        return False
        return True
    for y, x in zip(rng.integers(8, h - 8, n_matas * 6), rng.integers(8, w - 8, n_matas * 6)):
        if matas >= n_matas: break
        y, x = int(y), int(x)
        if not hierba[y, x] or not libre(hierba, y - 4, x, 4) or not lejos_de_otras(y, x): continue
        pinta_mata(y, x, rng)
        rejilla.setdefault((y // SEP, x // SEP), []).append((y, x))
        matas += 1
    flores = 0
    conchas = 0
    print('matas', matas, 'flores', flores, 'conchas/guijarros', conchas)


# ═══════════════════════════════════════════════════════════════ LA TIENDA
def tienda(im, rng):
    h, w = im.shape[:2]
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
    vacio = mx < 12
    suelo = (r > g + 25) & (g > b + 15) & (r > 150)              # tablas naranjas
    yeso = ((mx - mn) < 16) & (mx > 150)                          # paredes grises
    resto = ~vacio & ~suelo & ~yeso                               # vigas y marcos
    print('suelo %.0f%%  yeso %.0f%%  marcos %.0f%%' % (suelo.mean() * 100, yeso.mean() * 100, resto.mean() * 100))
    u = umbral_bayer(h, w)

    # ── 1. tono de la madera ─────────────────────────────────────────────
    n = ruido(h, w, 160, rng) * 0.6 + ruido(h, w, 48, rng) * 0.4
    tono(im, suelo, niveles(n, u), (5, 4, 2))

    # ── 2. sombra de las paredes sobre el suelo ──────────────────────────
    pared = vacio | yeso | resto
    d = distancia(pared, 18)
    k = np.clip(1.0 - (d - 1) / 17.0, 0, 1) ** 1.6
    k = np.where(k + (u - 0.5) * 0.25 > 0.35, k, k * 0.5)
    for c, f in ((0, 0.70), (1, 0.70), (2, 0.74)):
        im[..., c] = np.where(suelo, (im[..., c] * (1 - (1 - f) * k)).astype(np.int16), im[..., c])
    # Debajo de la pared (sombra hacia abajo, la luz viene de arriba): más.
    abajo = np.zeros((h, w), np.float32)
    for dy, peso in ((1, 1.0), (2, 0.8), (3, 0.6), (4, 0.45), (5, 0.3), (6, 0.18)):
        s = np.zeros((h, w), bool); s[dy:, :] = (yeso | resto)[:-dy, :]
        abajo = np.maximum(abajo, s * peso)
    for c in range(3):
        im[..., c] = np.where(suelo, (im[..., c] * (1 - 0.22 * abajo)).astype(np.int16), im[..., c])

    # ── 3. el yeso: más claro arriba, más oscuro abajo ───────────────────
    ys = np.arange(h)[:, None]
    # Altura dentro de cada pared: distancia al marco de encima.
    arriba = np.zeros((h, w), np.int16)
    run = np.zeros(w, np.int16)
    for y in range(h):
        run = np.where(yeso[y], run + 1, 0)
        arriba[y] = run
    grad = np.clip(arriba / 50.0, 0, 1)
    for c, s in ((0, 16), (1, 16), (2, 14)):
        im[..., c] = np.where(yeso, im[..., c] + (s * (0.6 - grad)).astype(np.int16), im[..., c])
    poro = (rng.random((h, w)) < 0.06) & yeso
    im[poro, :3] -= 9
    print('tienda: oclusión y yeso hechos')


# ═══════════════════════════════════════════════════════════════ LA MINA
def mina(im, rng):
    h, w = im.shape[:2]
    mx = np.maximum(np.maximum(im[..., 0], im[..., 1]), im[..., 2])
    algo = (im[..., 3] > 0) & (mx > 24)
    u = umbral_bayer(h, w)
    n = ruido(h, w, 260, rng) * 0.65 + ruido(h, w, 80, rng) * 0.35
    tono(im, algo, niveles(n, u), (4, 4, 3))
    print('mina: tono a gran escala')


def main(escena, entrada, salida):
    rng = np.random.default_rng(SEMILLA)
    im = np.array(Image.open(entrada).convert('RGBA')).astype(np.int16)
    {'lands': lands, 'tienda': tienda, 'mina': mina}[escena](im, rng)
    np.clip(im, 0, 255, out=im)
    Image.fromarray(im.astype(np.uint8), 'RGBA').save(salida, optimize=True)
    print('->', salida)


if __name__ == '__main__':
    if len(sys.argv) != 4 or sys.argv[1] not in ('lands', 'tienda', 'mina'):
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3])
