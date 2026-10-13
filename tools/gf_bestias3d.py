# -*- coding: utf-8 -*-
"""
=============================================================================
LAS BESTIAS DEL MAPA SALVAJE EN 2.5D                             (2026-10-11)
=============================================================================

"Los monstruos salvajes, en 2.5D y con alto detalle."

Antes eran dibujos de perfil (el lobo, un zorro recoloreado) a 2,4-2,6x: los
píxeles salían más gordos que los del personaje (que va a 2x) y al subir o
bajar se seguían viendo de lado.

AHORA cada bestia es un MODELO 3D pequeño (elipsoides, conos redondeados y
rocas facetadas) que se fotografía con la cámara del juego —ortográfica,
mirando un poco desde arriba— en tres vistas: de perfil (mirando a la
derecha; el juego la voltea para la izquierda), de frente y de espaldas. Así
las tres vistas son la MISMA bestia y la animación sale de mover sus patas.

  · Luz arriba a la izquierda, como todo el juego, en 5 bandas LISAS por
    material (sin tramado, sin ruido: el dueño tiene tripofobia). Lo de arriba
    (el lomo, los hombros) sale claro: ahí está el 2.5D.
  · Contorno del juego por fuera, y por dentro donde una pata pasa por
    delante del cuerpo (salto de profundidad), como en el pixel art a mano.
  · Se limpian los píxeles sueltos: ni una mota.
  · Se dibuja a la densidad del personaje (el juego lo pone a 2x).

USO: lo llama tools/generar-monstruos.py (bestia_frames('golem'), etc.).
Necesita numpy. Determinista: mismos bytes en cada ejecución.
=============================================================================
"""

import math

import numpy as np

from gf_arte import Lienzo, rampa, hex_rgb, contorno_de, mezcla

INCLINA = math.radians(32.0)                      # la cámara mira algo desde arriba
DIRV = np.array([0.0, -math.sin(INCLINA), -math.cos(INCLINA)])   # hacia dónde mira
ARRIBA = np.array([0.0, math.cos(INCLINA), -math.sin(INCLINA)])  # el "arriba" de la foto
DERECHA = np.array([1.0, 0.0, 0.0])
LUZ = np.array([-0.55, 0.78, 0.42])
LUZ = LUZ / np.linalg.norm(LUZ)
# Filas por debajo del punto de apoyo: de frente, lo que está más cerca (las
# patas de delante) sale MÁS ABAJO en la foto que el centro de la bestia. El
# atlas lleva este punto como `pivot` de cada fotograma (Phaser lo usa de
# origen), así que en el juego los pies caen donde siempre.
SUELO = 14


# ===========================================================================
# PRIMITIVAS (distancia con signo, en el espacio del modelo: x adelante,
# y arriba, z a su derecha)
# ===========================================================================

def elip(c, r, mat, rot=None):
    return {'t': 'e', 'c': np.array(c, float), 'r': np.array(r, float), 'mat': mat, 'rot': rot}


def cono(a, b, ra, rb, mat):
    return {'t': 'c', 'a': np.array(a, float), 'b': np.array(b, float), 'ra': float(ra), 'rb': float(rb), 'mat': mat}


def roca(c, e, mat, rot=None, bisel=0.80, arista=0.90):
    """Una caja con las esquinas y las aristas cortadas: una piedra facetada."""
    e = np.array(e, float)
    planos = []
    for i in range(3):
        for sg in (-1, 1):
            n = np.zeros(3); n[i] = sg
            planos.append((n, e[i]))
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                n = np.array([sx / e[0], sy / e[1], sz / e[2]]); n /= np.linalg.norm(n)
                planos.append((n, bisel * float(np.abs(n) @ e)))
    for i, j in ((0, 1), (0, 2), (1, 2)):
        for si in (-1, 1):
            for sj in (-1, 1):
                n = np.zeros(3); n[i] = si / e[i]; n[j] = sj / e[j]; n /= np.linalg.norm(n)
                planos.append((n, arista * float(np.abs(n) @ e)))
    N = np.array([p[0] for p in planos]); Dd = np.array([p[1] for p in planos])
    return {'t': 'r', 'c': np.array(c, float), 'N': N, 'D': Dd, 'mat': mat, 'rot': rot}


def giro_z(a):
    """Inclina hacia delante (gira x hacia y). Columnas = ejes locales."""
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])


def _local(p, P):
    Q = P - p['c']
    if p.get('rot') is not None:
        Q = Q @ p['rot']
    return Q


def distancia(p, P):
    d = _distancia(p, P)
    corte = p.get('corte')
    if corte is not None:
        # Recortada por un plano (el flequillo del pelo): lo de fuera, fuera.
        d = np.maximum(d, (P - corte['c']) @ corte['n'] - corte['o'])
    return d


def _distancia(p, P):
    t = p['t']
    if t == 'e':
        q = _local(p, P) / p['r']
        k0 = np.sqrt((q * q).sum(1))
        k1 = np.sqrt(((q / p['r']) ** 2).sum(1))
        return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)
    if t == 'c':
        pa = P - p['a']
        ba = p['b'] - p['a']
        bb = float(ba @ ba) or 1e-9
        h = np.clip((pa @ ba) / bb, 0.0, 1.0)
        d = np.sqrt(((pa - h[:, None] * ba) ** 2).sum(1))
        return d - (p['ra'] + (p['rb'] - p['ra']) * h)
    Q = _local(p, P)
    return (Q @ p['N'].T - p['D']).max(1)


# ===========================================================================
# LA CÁMARA
# ===========================================================================
# Del mundo al modelo según la vista: de perfil mira a +x (derecha); 'izq'
# mira a la izquierda (girado, no en espejo: la luz sigue arriba a la
# izquierda); de frente mira a quien juega (+z del mundo); de espaldas, al
# fondo.

# (2026-10-12) `vista` también puede ser un ÁNGULO (radianes, el de la
# pantalla: 0 = derecha, pi/2 = hacia abajo/quien juega): el modelo se gira
# sobre la vertical y la luz sigue arriba a la izquierda. Lo usa la serpiente
# de la mina (16 direcciones en vez de girar un dibujo plano).

def al_modelo(P, vista):
    if not isinstance(vista, str):
        c, s = math.cos(vista), math.sin(vista)
        M = P.copy()
        M[:, 0] = P[:, 0] * c + P[:, 2] * s
        M[:, 2] = -P[:, 0] * s + P[:, 2] * c
        return M
    if vista == 'lado':
        return P
    M = P.copy()
    if vista == 'frente':
        M[:, 0] = P[:, 2]; M[:, 2] = -P[:, 0]
    elif vista == 'izq':
        M[:, 0] = -P[:, 0]; M[:, 2] = -P[:, 2]
    else:
        M[:, 0] = -P[:, 2]; M[:, 2] = P[:, 0]
    return M


def al_mundo(N, vista):
    if not isinstance(vista, str):
        c, s = math.cos(vista), math.sin(vista)
        W = N.copy()
        W[:, 0] = N[:, 0] * c - N[:, 2] * s
        W[:, 2] = N[:, 0] * s + N[:, 2] * c
        return W
    if vista == 'lado':
        return N
    W = N.copy()
    if vista == 'frente':
        W[:, 0] = -N[:, 2]; W[:, 2] = N[:, 0]
    elif vista == 'izq':
        W[:, 0] = -N[:, 0]; W[:, 2] = -N[:, 2]
    else:
        W[:, 0] = N[:, 2]; W[:, 2] = -N[:, 0]
    return W


def escena(prims, P):
    ds = np.stack([distancia(p, P) for p in prims])
    return ds.min(0), ds.argmin(0)


def fotografiar(prims, W, H, vista, materiales, retoque=None, contorno=(20, 18, 16), k=1.0,
                suelo=None, salto=3.0, fx=1.0):
    """
    Lanza un rayo por píxel contra el modelo (marcha por la distancia con
    signo) y pinta lo que toca con la luz en bandas. Devuelve un Lienzo.

    `materiales`: nombre -> {'tonos': [5 colores], 'brillo': bool} o
    {'emite': color}. `retoque(prim, P_modelo, n_modelo, n_mundo)` puede
    cambiar el material de un punto (musgo arriba, la franja, las runas).
    `k` agranda el modelo entero (la distancia se escala con él). `suelo`:
    filas por debajo del punto de apoyo (SUELO si no se dice). `salto`: la
    diferencia de profundidad que dibuja una línea por dentro. `fx` (< 1)
    acorta el modelo a lo largo de SU eje x (de frente, un animal largo no
    cabe en su cuadro); el modelo y sus regiones no cambian.
    """
    if suelo is None:
        suelo = SUELO
    def al_modelo_k(Pw):
        M = al_modelo(Pw, vista) / k
        if fx != 1.0:
            M = M.copy()
            M[:, 0] /= fx
        return M

    def campo(Pw):
        d, q = escena(prims, al_modelo_k(Pw))
        return d * k * min(1.0, fx), q
    jj, ii = np.mgrid[0:H, 0:W]
    sx = (ii + 0.5 - W / 2.0).ravel()
    sy = ((H - suelo) - (jj + 0.5)).ravel()
    plano = sx[:, None] * DERECHA + sy[:, None] * ARRIBA
    O = plano - DIRV * 400.0
    n = O.shape[0]
    t = np.zeros(n)
    toca = np.zeros(n, bool)
    # Solo se siguen los rayos vivos (ni tocaron ni se fueron): así la foto
    # tarda segundos y no minutos.
    vivo = np.ones(n, bool)
    for _ in range(170):
        a = np.nonzero(vivo)[0]
        if not len(a):
            break
        d, _q = campo(O[a] + t[a, None] * DIRV)
        dio = d < 0.04
        toca[a[dio]] = True
        sigue = a[~dio]
        t[sigue] += np.maximum(d[~dio], 0.02) * 0.8
        vivo[a[dio]] = False
        vivo[sigue[t[sigue] > 800]] = False
    toca &= t < 800
    P = O + t[:, None] * DIRV
    Pm = al_modelo_k(P)
    _d, cual = escena(prims, Pm)
    # Normales por diferencias centrales (en el modelo) y al mundo para la luz.
    e = 0.2
    grad = np.zeros_like(Pm)
    for eje in range(3):
        dv = np.zeros(3); dv[eje] = e
        grad[:, eje] = escena(prims, Pm + dv)[0] - escena(prims, Pm - dv)[0]
    nm = grad / np.maximum(np.linalg.norm(grad, axis=1)[:, None], 1e-9)
    if fx != 1.0:
        # La normal del modelo acortado (inversa de la escala).
        nm = nm.copy()
        nm[:, 0] /= fx
        nm /= np.maximum(np.linalg.norm(nm, axis=1)[:, None], 1e-9)
    nw = al_mundo(nm, vista)
    luz = 0.24 + 0.76 * np.clip(nw @ LUZ, 0.0, 1.0)
    refl = 2 * (nw @ LUZ)[:, None] * nw - LUZ
    espec = refl @ (-DIRV)

    tono = np.full(n, -1)
    mat = [None] * n
    color = [None] * n
    for i in np.nonzero(toca)[0]:
        p = prims[cual[i]]
        m = p['mat']
        if retoque:
            m = retoque(p, Pm[i], nm[i], nw[i]) or m
        mat[i] = m
        info = materiales[m]
        if 'emite' in info:
            color[i] = info['emite']
            continue
        L = luz[i]
        b = 0 if L > 0.80 else (1 if L > 0.62 else (2 if L > 0.45 else (3 if L > 0.30 else 4)))
        if P[i, 1] < 1.2:                   # pegado al suelo: un tono más oscuro
            b = min(4, b + 1)
        tono[i] = b
        if info.get('brillo') and espec[i] > 0.94 and k <= 1:
            tono[i] = -2                     # el reflejo: uno solo por pieza
    # Limpieza: un píxel cuyo tono no comparte ningún vecino de su material
    # y tres de ellos coinciden, toma el de ellos (fuera motas).
    tono2 = tono.reshape(H, W).copy()
    matg = np.array([mm or '' for mm in mat], dtype=object).reshape(H, W)
    for y in range(H):
        for x in range(W):
            b = tono2[y, x]
            if b < 0:
                continue
            vec = []
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < W and 0 <= yy < H and matg[yy, xx] == matg[y, x] and tono2[yy, xx] >= 0:
                    vec.append(tono2[yy, xx])
            if len(vec) >= 3 and b not in vec:
                mejor = max(set(vec), key=vec.count)
                if vec.count(mejor) >= 3:
                    tono[y * W + x] = mejor
    # Al lienzo.
    li = Lienzo(W, H)
    prof = np.where(toca, t, np.inf).reshape(H, W)
    for i in np.nonzero(toca)[0]:
        y, x = divmod(int(i), W)
        info = materiales[mat[i]]
        if color[i] is not None:
            li.set(x, y, color[i])
        elif tono[i] == -2:
            li.set(x, y, mezcla(info['tonos'][0], (255, 255, 255), 0.45))
        else:
            li.set(x, y, info['tonos'][int(tono[i])])
    # Contorno por dentro: el píxel de detrás junto a algo que pasa por
    # delante (una pata delante del cuerpo) se vuelve línea.
    lineas = []
    for y in range(H):
        for x in range(W):
            if not np.isfinite(prof[y, x]) or color[y * W + x] is not None:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < W and 0 <= yy < H and prof[yy, xx] < prof[y, x] - salto:
                    lineas.append((x, y))
                    break
    for x, y in lineas:
        li.set(x, y, contorno)
    # Y por fuera.
    li.contornear(color=contorno, diagonales=False)
    return li


# ===========================================================================
# EL GÓLEM DE PIEDRA: roca facetada, musgo en lo de arriba, runas que brillan
# ===========================================================================
GOLEM_MAT = {
    'piedra': {'tonos': rampa(hex_rgb('#8f877a'), 5, arriba=0.32, abajo=0.58)},
    'piedra_o': {'tonos': rampa(hex_rgb('#77705f'), 5, arriba=0.28, abajo=0.6)},
    'musgo': {'tonos': rampa(hex_rgb('#6f9640'), 5, arriba=0.3, abajo=0.55)},
    'runa': {'emite': hex_rgb('#ffb84a')},
    'runa2': {'emite': hex_rgb('#fff0b0')},
    'ojo': {'emite': hex_rgb('#ffd27a')},
}
GOLEM_GRIETA = [(9.0, -2.5), (4.0, 1.5), (0.5, -1.5), (-4.0, 2.0), (-8.5, 0.0)]


def _dist_polilinea(y, z, pts):
    mejor = 1e9
    for (y0, z0), (y1, z1) in zip(pts, pts[1:]):
        dy, dz = y1 - y0, z1 - z0
        L2 = dy * dy + dz * dz
        u = max(0.0, min(1.0, ((y - y0) * dy + (z - z0) * dz) / L2))
        mejor = min(mejor, math.hypot(y - (y0 + u * dy), z - (z0 + u * dz)))
    return mejor


def golem(accion, i):
    S = 1.12
    bob = 0.0
    lean = 0.18
    paso = 0.0
    brilla = False
    if accion == 'camina':
        f = (i - 1) / 4.0 * math.pi * 2
        paso = math.sin(f)
        bob = 1.0 if i in (2, 4) else 0.0
    elif accion == 'quieto':
        bob = 1.0 if i == 2 else 0.0
        brilla = i == 2
    else:
        brilla = True
        lean = (0.05, -0.05, 0.42)[i - 1]
    P = lambda x, y, z: (x * S, (y + bob) * S, z * S)
    pr = []
    # Piernas: pilares, y sus pies, bloques.
    for lado, sg in ((1, 1), (-1, -1)):
        av = paso * 7 * sg
        alza = max(0.0, math.cos((i - 1) / 4.0 * math.pi * 2 + (0 if sg > 0 else math.pi))) * 3 if accion == 'camina' else 0
        if accion == 'ataque' and i == 3:
            av = 4 * sg
        pr.append(cono(P(0, 25, 7 * sg), P(av, 6 + alza, 7.5 * sg), 6.2 * S, 6.8 * S, 'piedra_o'))
        pr.append(roca(P(av + 2, 3.2 + alza - bob, 7.5 * sg), (7.5 * S, 3.4 * S, 5.6 * S), 'piedra_o'))
    # Cadera y torso: un peñasco inclinado hacia delante.
    pr.append(roca(P(0, 27, 0), (8 * S, 6 * S, 11 * S), 'piedra_o'))
    tor_c = P(3 + (6 if accion == 'ataque' and i == 3 else 0), 43 - (5 if accion == 'ataque' and i == 3 else 0), 0)
    torso = roca(tor_c, (13.5 * S, 15 * S, 16 * S), 'piedra', rot=giro_z(-lean), bisel=0.78, arista=0.88)
    pr.append(torso)
    # La cabeza, hundida entre los hombros, con su rendija de ojo.
    cab = (tor_c[0] + 9 * S, tor_c[1] + 13 * S, 0.0)
    pr.append(roca(cab, (6 * S, 5.5 * S, 6 * S), 'piedra'))
    pr.append(roca((cab[0] + 5.6 * S, cab[1] + 0.5 * S, 0.0), (0.9, 0.8 * S, 3.6 * S), 'ojo', bisel=0.95, arista=0.97))
    # Hombros y brazos (mazas de piedra).
    for sg in (1, -1):
        hombro = (tor_c[0] - 1 * S, tor_c[1] + 7 * S, 17.5 * S * sg)
        pr.append(roca(hombro, (7.5 * S, 7 * S, 7 * S), 'piedra'))
        if accion == 'ataque':
            puno = {1: (6, 74, 11), 2: (-2, 80, 10), 3: (25, 9, 9)}[i]
            codo = {1: (6, 62, 19), 2: (0, 66, 18), 3: (18, 28, 18)}[i]
        elif accion == 'camina':
            puno = (4 - paso * 8 * sg, 20, 20)
            codo = (2 - paso * 4 * sg, 34, 20)
        else:
            puno = (5, 20 + bob, 20)
            codo = (3, 34, 20)
        codo = P(codo[0], codo[1], codo[2] * sg)
        puno = P(puno[0], puno[1], puno[2] * sg)
        pr.append(cono(hombro, codo, 5.4 * S, 5.0 * S, 'piedra'))
        pr.append(cono(codo, puno, 5.0 * S, 5.6 * S, 'piedra'))
        pr.append(roca(puno, (6.5 * S, 6 * S, 6 * S), 'piedra'))

    def retoque(p, Pm, nm, nw):
        if p is torso:
            # Las runas: una grieta quebrada en la cara de delante.
            q = _local(p, Pm[None, :])[0] / S
            if q[0] > 10.5 and _dist_polilinea(q[1], q[2], GOLEM_GRIETA) < 0.95:
                return 'runa2' if brilla else 'runa'
        if p['mat'] == 'piedra' and nw[1] > 0.66:
            return 'musgo'
        return None
    return pr, retoque


# ===========================================================================
# EL LOBO SOMBRÍO: pizarra con el pecho claro, gorguera y ojos encendidos
# ===========================================================================
LOBO_MAT = {
    'pelo': {'tonos': rampa(hex_rgb('#5a6480'), 5, arriba=0.3, abajo=0.58)},
    'claro': {'tonos': rampa(hex_rgb('#b3bccd'), 5, arriba=0.22, abajo=0.45)},
    'oscuro': {'tonos': rampa(hex_rgb('#2e3448'), 5, arriba=0.2, abajo=0.5)},
    'nariz': {'tonos': rampa(hex_rgb('#1d2030'), 5, arriba=0.25, abajo=0.3)},
    'diente': {'tonos': rampa(hex_rgb('#efe8d6'), 5, arriba=0.1, abajo=0.3)},
    'boca': {'tonos': rampa(hex_rgb('#7a2a30'), 5, arriba=0.2, abajo=0.4)},
    'ojo': {'emite': hex_rgb('#ffd23f')},
}


def lobo(accion, i):
    agacha, avanza, abre, cola = 0.0, 0.0, 0.0, 0.0
    f = (i - 1) / 4.0 * math.pi * 2
    if accion == 'camina':
        bob = 0.7 if i in (2, 4) else 0.0
    elif accion == 'quieto':
        bob = 0.5 if i == 2 else 0.0
        cola = 1.0 if i == 2 else -0.5
    else:
        bob = 0.0
        agacha = (3.0, 0.5, 1.0)[i - 1]
        avanza = (-1.0, 6.0, 3.0)[i - 1]
        abre = (1.0, 3.2, 0.6)[i - 1]
    y0 = -agacha + bob
    pr = []
    # Cuerpo: lomo largo y pecho hondo, y la gorguera del cuello.
    pr.append(elip((avanza * 0.5, 20 + y0, 0), (15, 7.8, 8.6), 'pelo'))
    pr.append(elip((7 + avanza * 0.7, 19 + y0, 0), (8.5, 8.8, 9.0), 'pelo'))
    pr.append(elip((13 + avanza, 24 + y0, 0), (5.5, 7.4, 8.6), 'pelo'))
    # Cabeza y hocico (con la mandíbula, que se abre al morder).
    hx, hy = 20 + avanza * 1.2, 29 + y0 + (1.5 if accion == 'ataque' and i == 2 else 0)
    pr.append(cono((13 + avanza, 23 + y0, 0), (hx - 2, hy - 1, 0), 5.6, 4.6, 'pelo'))
    pr.append(elip((hx, hy, 0), (6, 5.4, 6.0), 'pelo'))
    pr.append(cono((hx + 2, hy - 0.5, 0), (hx + 9, hy - 2, 0), 3.1, 2.1, 'pelo'))
    pr.append(elip((hx + 9.4, hy - 1.6, 0), (1.4, 1.2, 1.4), 'nariz'))
    pr.append(cono((hx + 2, hy - 3, 0), (hx + 8, hy - 4.5 - abre, 0), 2.3, 1.5, 'claro'))
    if abre > 1.5:
        pr.append(cono((hx + 3, hy - 3, 0), (hx + 7.5, hy - 3.3 - abre * 0.5, 0), 1.3, 0.9, 'boca'))
        pr.append(cono((hx + 7.6, hy - 2.4, 1.0), (hx + 7.6, hy - 3.6, 1.0), 0.6, 0.2, 'diente'))
        pr.append(cono((hx + 7.6, hy - 2.4, -1.0), (hx + 7.6, hy - 3.6, -1.0), 0.6, 0.2, 'diente'))
    # Orejas de punta y ojos.
    for sg in (1, -1):
        pr.append(cono((hx - 1, hy + 4, 3.4 * sg), (hx - 2, hy + 9.5, 4.4 * sg), 2.4, 0.4, 'oscuro'))
        pr.append(elip((hx + 4.4, hy + 1.5, 3.7 * sg), (0.95, 0.7, 0.8), 'ojo'))
    # Patas: delanteras bajo el pecho, traseras con su muslo. Paso en diagonal.
    for delante, base_x in ((True, 9), (False, -10)):
        for sg in (1, -1):
            fase = f + (0 if (sg > 0) == delante else math.pi)
            sw = math.sin(fase) * 4.5 if accion == 'camina' else 0.0
            lift = max(0.0, math.cos(fase)) * 2.0 if accion == 'camina' else 0.0
            if accion == 'ataque':
                sw = (-2.0, 6.0, 2.0)[i - 1] if delante else (2.0, -6.0, -2.0)[i - 1]
            hx0 = base_x + avanza * (0.8 if delante else 0.2)
            hy0 = (16 if delante else 17) + y0
            z = 5.6 * sg
            if not delante:
                pr.append(elip((hx0, hy0 - 1, z * 0.9), (5.2, 6.2, 3.4), 'pelo'))
            rod = (hx0 + sw * 0.5 + (0 if delante else -2.5), 8.5 + lift + y0 * 0.4, z)
            pata = (hx0 + sw, 1.3 + lift, z * 1.04)
            pr.append(cono((hx0, hy0 - 2, z), rod, 2.8, 2.2, 'pelo'))
            pr.append(cono(rod, pata, 2.2, 1.8, 'oscuro'))
            pr.append(elip((pata[0] + 0.8, pata[1], z * 1.04), (2.6, 1.4, 2.0), 'oscuro'))
    # La cola, espesa, que cuelga y se mece.
    c0 = (-14 + avanza * 0.3, 21 + y0, 0)
    c1 = (-21, 17 + y0 + cola, 0)
    c2 = (-26, 13 + y0 + cola * 1.5, 0)
    pr.append(cono(c0, c1, 3.8, 3.4, 'pelo'))
    pr.append(cono(c1, c2, 3.4, 1.6, 'oscuro'))

    def retoque(p, Pm, nm, nw):
        # La tripa, el pecho y la garganta, claros (el lobo de siempre).
        if p['mat'] == 'pelo' and nm[1] < -0.35 and Pm[0] > -12:
            return 'claro'
        return None
    return pr, retoque


# ===========================================================================
# LA ARAÑA DE ESPINAS: dos ojos (nunca un racimo), espinas en fila, franja
# ===========================================================================
ARANA_MAT = {
    'cuerpo': {'tonos': rampa(hex_rgb('#574d34'), 5, arriba=0.3, abajo=0.6), 'brillo': True},
    'pata': {'tonos': rampa(hex_rgb('#62573a'), 5, arriba=0.28, abajo=0.58)},
    'espina': {'tonos': rampa(hex_rgb('#ddd1a6'), 5, arriba=0.18, abajo=0.45)},
    'franja': {'tonos': rampa(hex_rgb('#cf8d2c'), 5, arriba=0.25, abajo=0.45)},
    'colmillo': {'tonos': rampa(hex_rgb('#ebe3c4'), 5, arriba=0.12, abajo=0.4)},
    'ojo': {'emite': hex_rgb('#ff6a3d')},
}


def arana(accion, i):
    alza, avanza, abre = 0.0, 0.0, 0.0
    f = (i - 1) / 4.0 * math.pi * 2
    if accion == 'quieto':
        bob = 0.6 if i == 2 else 0.0
    elif accion == 'camina':
        bob = 0.5 if i in (1, 3) else 0.0
    else:
        bob = 0.0
        alza = (3.0, 5.0, -1.0)[i - 1]
        avanza = (0.0, 1.0, 5.0)[i - 1]
        abre = (0.5, 1.5, 0.0)[i - 1]
    pr = []
    ab = (-9 + avanza * 0.4, 12 + bob, 0)
    ce = (6 + avanza, 10 + bob + alza * 0.5, 0)
    pr.append(elip(ab, (11.5, 8.5, 9.8), 'cuerpo'))
    pr.append(elip(ce, (7.5, 5.6, 6.6), 'cuerpo'))
    # Espinas: cuatro en fila por el lomo (y nada de racimos).
    for k, (dx, alto) in enumerate(((-6.5, 6.5), (-3, 7.5), (0.5, 7.5), (4, 6))):
        bx = ab[0] + dx
        by = ab[1] + 8.5 * math.sqrt(max(0.0, 1 - (dx / 11.5) ** 2)) - 1.0
        pr.append(cono((bx, by, 0), (bx - 2.5, by + alto, 0), 1.7, 0.15, 'espina'))
    # Dos ojos grandes y los colmillos.
    for sg in (1, -1):
        pr.append(elip((ce[0] + 6.4, ce[1] + 1.8, 2.3 * sg), (1.0, 1.1, 1.0), 'ojo'))
        pr.append(cono((ce[0] + 6, ce[1] - 2, 1.8 * sg), (ce[0] + 8.5, ce[1] - 5.5 + abre, (1.4 + abre) * sg), 1.4, 0.35, 'colmillo'))
    # Ocho patas: fémur hacia arriba y fuera, y la tibia al suelo. Al andar,
    # en dos grupos que se alternan.
    anclas = (2.5, 0.5, -1.5, -3.5)
    dk = (5.0, 2.0, -2.0, -5.0)
    dpie = (12.0, 5.0, -5.0, -12.0)
    for k in range(4):
        for sg in (1, -1):
            grupo = (k + (0 if sg > 0 else 1)) % 2
            fase = f + (0 if grupo else math.pi)
            sw = math.sin(fase) * 2.8 if accion == 'camina' else 0.0
            lift = max(0.0, math.cos(fase)) * 2.2 if accion == 'camina' else 0.0
            base = (ce[0] + anclas[k], ce[1] - 0.5, 4.2 * sg)
            rod = (base[0] + dk[k] + sw * 0.5, 17.5 + bob, 12.5 * sg)
            pie = (base[0] + dpie[k] + sw, 0.7 + lift, 19.0 * sg)
            if accion == 'ataque' and k < 2:
                rod = (base[0] + 4 + k, 18 + alza * 1.6, 9 * sg)
                pie = {1: (base[0] + 11 - k * 2, 17 + alza, 13 * sg),
                       2: (base[0] + 13 - k * 2, 21 + alza, 12 * sg),
                       3: (base[0] + 17 - k * 3, 0.8, 15 * sg)}[i]
            pr.append(cono(base, rod, 1.6, 1.3, 'pata'))
            pr.append(cono(rod, pie, 1.3, 0.6, 'pata'))
    abdomen = pr[0]

    def retoque(p, Pm, nm, nw):
        # La franja: UNA banda por el lomo del abdomen.
        if p is abdomen and abs(Pm[2]) < 1.7 and Pm[1] > ab[1] + 3:
            return 'franja'
        return None
    return pr, retoque


BESTIAS3D = {
    # tipo: (modelo, materiales, ancho, alto, contorno, tamaño)
    'golem': (golem, GOLEM_MAT, 84, 108, contorno_de(hex_rgb('#8f877a')), 1.0),
    'lobo': (lobo, LOBO_MAT, 68, 58, hex_rgb('#0d0f16'), 1.0),
    'arana': (arana, ARANA_MAT, 76, 64, contorno_de(hex_rgb('#574d34')), 1.15),
}
VISTAS = (('lado', ''), ('frente', '_abajo'), ('espalda', '_arriba'))
ACCIONES = (('camina', 4), ('ataque', 3), ('quieto', 2))


def pivote(tipo):
    """El punto de apoyo (0-1) dentro de cada fotograma de la bestia."""
    _m, _mats, W, H, _c, _k = BESTIAS3D[tipo]
    # Tres filas por debajo del centro de la bestia: el centro de lo que
    # pisa (de perfil, la pata de este lado cae algo más abajo).
    return 0.5, (H - SUELO + 3) / float(H)


def bestia_frames(tipo):
    """Todos los fotogramas de una bestia: '<accion>[_abajo|_arriba]_<n>'."""
    modelo, mats, W, H, cont, k = BESTIAS3D[tipo]
    out = {}
    for vista, suf in VISTAS:
        for acc, n in ACCIONES:
            for i in range(1, n + 1):
                prims, retoque = modelo(acc, i)
                out['%s%s_%d' % (acc, suf, i)] = fotografiar(prims, W, H, vista, mats, retoque, cont, k)
    return out
