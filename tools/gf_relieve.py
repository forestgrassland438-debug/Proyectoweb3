# -*- coding: utf-8 -*-
"""
EL RELIEVE 2.5D en Python (2026-10-12): la MISMA regla que gf-relieve.js
(altura por partes separadas por el contorno, luz arriba a la izquierda en
tres bandas, sin motas, sombra de contacto abajo y, con `piel_ok`, nunca
sombra en la piel). Lo usa generar-monstruos.py para hornearlo en los
humanoides. Si se cambia uno, se cambia el otro.
"""
import numpy as np, colorsys
from PIL import Image
L = np.array([-0.55, -0.72, 0.42]); L = L / np.linalg.norm(L)
def distancia(mask):
    h, w = mask.shape; INF = 10**6
    d = np.where(mask, INF, 0).astype(np.int64)
    for y in range(h):
        for x in range(w):
            if d[y, x]:
                v = d[y, x]
                if x > 0: v = min(v, d[y, x-1] + 3)
                if y > 0:
                    v = min(v, d[y-1, x] + 3)
                    if x > 0: v = min(v, d[y-1, x-1] + 4)
                    if x < w-1: v = min(v, d[y-1, x+1] + 4)
                d[y, x] = v
    for y in range(h-1, -1, -1):
        for x in range(w-1, -1, -1):
            if d[y, x]:
                v = d[y, x]
                if x < w-1: v = min(v, d[y, x+1] + 3)
                if y < h-1:
                    v = min(v, d[y+1, x] + 3)
                    if x < w-1: v = min(v, d[y+1, x+1] + 4)
                    if x > 0: v = min(v, d[y+1, x-1] + 4)
                d[y, x] = v
    return np.where(d >= INF, 0, d) / 3.0
def es_piel(r, g, b):
    h, s, v = colorsys.rgb_to_hsv(r/255, g/255, b/255)
    return v >= 0.42 and (h < 0.13 or h > 0.95) and 0.08 < s < 0.65 and max(r,g,b) != min(r,g,b)
def relieve(im, fuerza=1.0, radio_max=0, piel_ok=False):
    a = np.array(im.convert('RGBA')).astype(np.float64)
    h, w = a.shape[:2]
    rgb, al = a[..., :3], a[..., 3]
    op = al >= 128
    lum = (0.299*rgb[...,0] + 0.587*rgb[...,1] + 0.114*rgb[...,2]) / 255
    parte = op & (lum >= 0.13)
    piel = np.zeros_like(op)
    if piel_ok:
        for y in range(h):
            for x in range(w):
                if op[y, x] and es_piel(*rgb[y, x]): piel[y, x] = True
    R = max(2.5, min(w, h) / 7)
    if radio_max: R = min(R, max(2.5, radio_max))
    dp, dt = distancia(parte), distancia(op)
    alt = 0.65*np.sqrt(np.minimum(1, dp/R)) + 0.35*np.sqrt(np.minimum(1, dt/(R*2.2)))
    p = np.pad(alt, 1, mode='edge')
    su = sum(p[1+dy:1+dy+h, 1+dx:1+dx+w] for dy in (-1,0,1) for dx in (-1,0,1)) / 9
    gy, gx = np.gradient(su)
    n = np.dstack([-gx*2.4, -gy*2.4, np.full_like(su, 0.55)]); n /= np.linalg.norm(n, axis=2)[..., None]
    d = n @ L
    banda = np.where(d > 0.78, 1, np.where(d < 0.42, -1, 0))
    fin = banda.copy()
    for y in range(h):
        for x in range(w):
            if not parte[y, x]: continue
            vec = [banda[yy, xx] for yy, xx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)) if 0<=yy<h and 0<=xx<w and parte[yy,xx]]
            if len(vec) >= 3 and banda[y, x] not in vec:
                fin[y, x] = max(set(vec), key=vec.count)
    filas = np.nonzero(op.any(1))[0]; fondo = filas[-1] if len(filas) else -1
    aL, aS, aF = 0.22*fuerza, 0.26*fuerza, 1 - 0.14*fuerza
    out = rgb.copy()
    for y in range(h):
        for x in range(w):
            if not parte[y, x]: continue
            b = fin[y, x]
            if piel[y, x] and b == -1: b = 0
            if b == 1: out[y, x] = out[y, x]*(1-aL) + np.array([255,246,220])*aL
            elif b == -1: out[y, x] = out[y, x]*(1-aS) + np.array([40,44,78])*aS
            if fondo >= 0 and y >= fondo - 2 and not piel[y, x]: out[y, x] *= aF
    return Image.fromarray(np.dstack([np.clip(out,0,255), al]).astype(np.uint8), 'RGBA')


def relieve_lienzo(li, fuerza=0.6):
    """Lo mismo sobre un Lienzo de gf_arte (devuelve uno nuevo)."""
    from gf_arte import Lienzo
    im = relieve(li.imagen(), fuerza=fuerza, radio_max=0, piel_ok=True)
    out = Lienzo(li.w, li.h)
    out.px = list(im.getdata())
    return out
