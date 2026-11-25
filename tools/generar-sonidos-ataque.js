#!/usr/bin/env node
/**
 * =============================================================================
 * LOS SONIDOS DE LOS ATAQUES  ->  Game/MUSIC/ataques/*.wav        (2026-11-24)
 * =============================================================================
 *
 * "Los sonidos de algunos enemigos o monstruos al atacar suenan muy básicos o
 * falsos: haz nuevos para cada ataque, profesionales."
 *
 * Antes cada ataque era UN oscilador de WebAudio (gf-salvaje.js `sonar`): una
 * onda cuadrada que baja para "roca", una de sierra para "siseo"... Y muchos
 * no tenían ninguno: el golpe cuerpo a cuerpo, la embestida, el salto del
 * espectro o la caída del rayo sonaban a nada.
 *
 * Aquí se ESCRIBEN, como los de tools/generar-sonidos.js, pero no a 8 bits:
 * WAV de 16 bits a 32 kHz, mono, hechos por capas como se hace un efecto de
 * verdad —el golpe, su cuerpo, sus escombros y su sala—:
 *
 *   · golpes     un bombo que cae de tono + ruido que se cierra + un chasquido
 *   · materiales resonancias propias (modos): la piedra es grave y corta, el
 *                hielo y el cristal agudos y largos, la madera hueca, el
 *                metal inarmónico
 *   · escombros  granos (piedrecitas, gravilla, esquirlas, hojas, chispas,
 *                burbujas) esparcidos con más densidad al principio
 *   · voces      fuente glotal con temblor (jitter), aspereza y subarmónico,
 *                filtrada por formantes que se mueven (vocales): aullidos,
 *                rugidos, gemidos, gruñidos
 *   · aire       soplidos (ruido rosa por un pasabanda que barre), viento,
 *                silbidos
 *   · sala       una reverberación (Freeverb) en lo que la pide
 *
 * Cada sonido se iguala en sonoridad (RMS de 100 ms) y se limita a −1 dBFS,
 * así un rugido y un golpe seco suenan igual de presentes. Todo lleva su
 * semilla: el mismo script da siempre los mismos bytes.
 *
 * Los poderes que llevan su propio reloj (los tres géiseres, las tres rocas
 * del derrumbe, las raíces que brotan una tras otra) se escriben con ESE
 * reloj: el sonido de cada golpe cae en el milisegundo en que gf-salvaje.js
 * lo dibuja.
 *
 * Los oye gf-sonidos-ataque.js (los carga cada mapa: solo los de sus
 * especies). Sin dependencias: ni ffmpeg ni paquetes de npm.
 *
 *     node tools/generar-sonidos-ataque.js              (todos)
 *     node tools/generar-sonidos-ataque.js rugido pisoton
 *     node tools/generar-sonidos-ataque.js --listar
 * ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const DESTINO = path.join(RAIZ, 'Game', 'MUSIC', 'ataques');
const VERSION = '20261124a';          // gf-sonidos-ataque.js V: si cambia uno, cambian los dos
const SR = 32000;

// ===========================================================================
// AZAR CON SEMILLA
// ===========================================================================
let R = null;
function semillaDe(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function azar(s) {
  let a = s >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const entre = (a, b) => a + (b - a) * R();
const signo = () => (R() < 0.5 ? -1 : 1);

// ===========================================================================
// BÁSICOS
// ===========================================================================
const muestras = (s) => Math.max(1, Math.round(s * SR));
const vacio = (s) => new Float32Array(muestras(s));
const valor = (f, t) => (typeof f === 'function' ? f(t) : f);
const db = (d) => Math.pow(10, d / 20);

/** Suma `src` en `dst` desde `t` segundos, por `g`. Si no cabe, se corta. */
function sumar(dst, src, t, g) {
  const o = Math.round((t || 0) * SR), k = g === undefined ? 1 : g;
  for (let i = 0; i < src.length; i++) { const j = i + o; if (j >= 0 && j < dst.length) dst[j] += src[i] * k; }
  return dst;
}
function pico(x) { let p = 0; for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > p) p = v; } return p; }
/** La capa a pico 1: así las ganancias de cada receta dicen lo que dicen. */
function norm(x, a) { const p = pico(x); if (p > 0) { const k = (a || 1) / p; for (let i = 0; i < x.length; i++) x[i] *= k; } return x; }
function escalar(x, g) { for (let i = 0; i < x.length; i++) x[i] *= g; return x; }

/** Puntos [[t, v, forma]]: lineal; 'exp' (v > 0) exponencial; un número, potencia. */
function curva(puntos) {
  return function (t) {
    if (t <= puntos[0][0]) return puntos[0][1];
    for (let i = 1; i < puntos.length; i++) {
      const p = puntos[i];
      if (t <= p[0]) {
        const q = puntos[i - 1], u = (t - q[0]) / Math.max(1e-9, p[0] - q[0]);
        if (p[2] === 'exp' && q[1] > 0 && p[1] > 0) return q[1] * Math.pow(p[1] / q[1], u);
        if (typeof p[2] === 'number') return q[1] + (p[1] - q[1]) * Math.pow(u, p[2]);
        return q[1] + (p[1] - q[1]) * u;
      }
    }
    return puntos[puntos.length - 1][1];
  };
}
/** Golpe: sube en `ataque` y cae 60 dB en `t60`. */
function caida(ataque, t60) {
  return (t) => (t < ataque ? t / Math.max(1e-6, ataque) : Math.pow(10, -3 * (t - ataque) / t60));
}
/** Campana: sube hasta `pico` (fracción de s) y se apaga al final. */
function campanaEnv(s, picoFr, subida, bajada) {
  const tp = s * picoFr;
  return (t) => {
    if (t <= 0 || t >= s) return 0;
    if (t < tp) return Math.pow(Math.sin((t / tp) * Math.PI / 2), subida || 1.5);
    return Math.pow(Math.cos(((t - tp) / (s - tp)) * Math.PI / 2), bajada || 1.2);
  };
}
function conEnvolvente(x, env) { for (let i = 0; i < x.length; i++) x[i] *= env(i / SR); return x; }

// ===========================================================================
// FUENTES
// ===========================================================================
function blanco(s) { const x = vacio(s); for (let i = 0; i < x.length; i++) x[i] = R() * 2 - 1; return x; }
/** Ruido rosa (filtro de Paul Kellet). */
function rosa(s) {
  const x = vacio(s);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < x.length; i++) {
    const w = R() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
    x[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return x;
}
/** Ruido marrón (pasea): el retumbo. */
function marron(s) { const x = vacio(s); let v = 0; for (let i = 0; i < x.length; i++) { v = (v + 0.02 * (R() * 2 - 1)) / 1.02; x[i] = v * 3.5; } return x; }

function polyblep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
/** Oscilador (frecuencia fija o función del tiempo), sin aliasing en sierra y cuadrada. */
function osc(s, frec, tipo, fase) {
  const x = vacio(s);
  let ph = fase || 0;
  for (let i = 0; i < x.length; i++) {
    const dt = Math.min(0.45, valor(frec, i / SR) / SR);
    let v;
    if (tipo === 'sierra') v = 2 * ph - 1 - polyblep(ph, dt);
    else if (tipo === 'cuadrada') v = (ph < 0.5 ? 1 : -1) + polyblep(ph, dt) - polyblep((ph + 0.5) % 1, dt);
    else if (tipo === 'triangulo') v = 1 - 4 * Math.abs(ph - 0.5);
    else v = Math.sin(2 * Math.PI * ph);
    x[i] = v;
    ph += dt; ph -= Math.floor(ph);
  }
  return x;
}

// ===========================================================================
// FILTROS
// ===========================================================================
/** Filtro de estado variable (TPT): `fc` y `q` pueden moverse con el tiempo.
    Salidas: 'lp', 'bp' (ganancia 1 en el centro), 'hp', 'notch'. */
function svf(x, fc, q, salida) {
  const y = new Float32Array(x.length);
  let ic1 = 0, ic2 = 0, g = 0, k = 0, a1 = 0, a2 = 0, a3 = 0;
  const mueve = typeof fc === 'function' || typeof q === 'function';
  const calc = (t) => {
    const f = Math.min(SR * 0.45, Math.max(8, valor(fc, t)));
    g = Math.tan(Math.PI * f / SR); k = 1 / Math.max(0.05, valor(q, t));
    a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
  };
  calc(0);
  const modo = salida === 'bp' ? 1 : salida === 'hp' ? 2 : salida === 'notch' ? 3 : 0;
  for (let i = 0; i < x.length; i++) {
    if (mueve && (i & 15) === 0) calc(i / SR);
    const v0 = x[i], v3 = v0 - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    y[i] = modo === 0 ? v2 : modo === 1 ? k * v1 : modo === 2 ? v0 - k * v1 - v2 : v0 - k * v1;
  }
  return y;
}
const lp = (x, fc, q) => svf(x, fc, q || 0.707, 'lp');
const hp = (x, fc, q) => svf(x, fc, q || 0.707, 'hp');
const bp = (x, fc, q) => svf(x, fc, q || 1, 'bp');

function saturar(x, drive) { const n = Math.tanh(drive); for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive) / n; return x; }

/** Freeverb (mono): la sala. Devuelve el sonido con su cola. */
function reverb(x, op) {
  const o = Object.assign({ sala: 0.6, amort: 0.45, humedo: 0.2, seco: 1, cola: 0.8, pre: 0.012 }, op || {});
  const n = x.length + muestras(o.cola), out = new Float32Array(n), k = SR / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => ({ b: new Float32Array(Math.round(d * k)), i: 0, f: 0 }));
  const aps = [556, 441, 341, 225].map((d) => ({ b: new Float32Array(Math.round(d * k)), i: 0 }));
  const fb = o.sala * 0.28 + 0.7, d1 = o.amort * 0.4, d2 = 1 - d1, pd = muestras(o.pre);
  for (let i = 0; i < n; i++) {
    const j = i - pd, xi = j >= 0 && j < x.length ? x[j] * 0.015 : 0;
    let s = 0;
    for (let c = 0; c < 8; c++) {
      const cb = combs[c], v = cb.b[cb.i];
      cb.f = v * d2 + cb.f * d1;
      cb.b[cb.i] = xi + cb.f * fb;
      if (++cb.i >= cb.b.length) cb.i = 0;
      s += v;
    }
    for (let a = 0; a < 4; a++) {
      const ap = aps[a], bo = ap.b[ap.i], v = -s + bo;
      ap.b[ap.i] = s + bo * 0.5;
      if (++ap.i >= ap.b.length) ap.i = 0;
      s = v;
    }
    out[i] = (i < x.length ? x[i] * o.seco : 0) + s * o.humedo * 3;
  }
  return out;
}

// ===========================================================================
// RESONANCIAS (MODOS) Y GRANOS
// ===========================================================================
/** Suma de senos que se apagan: {f, t60, a, fase}. */
function modal(s, modos) {
  const x = vacio(s);
  for (const m of modos) {
    const w = 2 * Math.PI * m.f / SR, ph = m.fase === undefined ? R() * Math.PI * 2 : m.fase;
    const d = Math.pow(10, -3 / (Math.max(0.002, m.t60) * SR));
    let a = m.a === undefined ? 1 : m.a;
    for (let i = 0; i < x.length; i++) { x[i] += a * Math.sin(w * i + ph); a *= d; if (a < 1e-5) break; }
  }
  for (let i = 0; i < Math.min(x.length, 12); i++) x[i] *= i / 12;       // sin chasquido de fase
  return x;
}
function chasquido(dur, fc, q) {
  const x = blanco(dur + 0.004);
  conEnvolvente(x, caida(0.0002, dur));
  return fc ? bp(x, fc, q || 0.9) : x;
}
/** Piedrecita: tres modos graves y cortos y su chasquido. */
function granoPiedra(fMin, fMax, t60) {
  const f = entre(fMin || 500, fMax || 2800), t = entre(t60 ? t60[0] : 0.025, t60 ? t60[1] : 0.08);
  const x = modal(t * 1.4, [{ f, t60: t, a: 1 }, { f: f * entre(1.4, 1.8), t60: t * 0.7, a: 0.55 }, { f: f * entre(2.3, 2.9), t60: t * 0.45, a: 0.3 }]);
  return sumar(x, chasquido(0.003, f * 1.3, 1.1), 0, 0.9);
}
function granoGrava() { const d = entre(0.003, 0.01); return bp(conEnvolvente(blanco(d + 0.008), caida(0.0004, d)), entre(1600, 5200), entre(0.8, 2)); }
function granoHielo() {
  const f = entre(2600, 8200), t = entre(0.03, 0.14);
  const x = modal(t * 1.3, [{ f, t60: t, a: 1 }, { f: f * entre(1.3, 1.6), t60: t * 0.6, a: 0.5 }]);
  return sumar(x, chasquido(0.002, 6000, 0.8), 0, 0.7);
}
function granoCristal(fMin, fMax) {
  const f = entre(fMin || 2000, fMax || 7000), t = entre(0.12, 0.5);
  const x = modal(t * 1.2, [{ f, t60: t, a: 1 }, { f: f * entre(1.32, 1.42), t60: t * 0.8, a: 0.45 }, { f: f * entre(2.05, 2.25), t60: t * 0.5, a: 0.25 }]);
  return sumar(x, chasquido(0.002, f, 1), 0, 0.5);
}
function granoMadera(fMin, fMax) {
  const f = entre(fMin || 280, fMax || 1100), t = entre(0.02, 0.06);
  const x = modal(t * 1.5, [{ f, t60: t, a: 1 }, { f: f * entre(2.2, 2.7), t60: t * 0.6, a: 0.4 }, { f: f * entre(4.1, 4.8), t60: t * 0.4, a: 0.2 }]);
  return sumar(x, chasquido(0.003, f * 2, 0.8), 0, 0.6);
}
/** Eslabón de cadena: metal inarmónico (1 : 2,76 : 5,40). */
function granoMetal(fMin, fMax) {
  const f = entre(fMin || 900, fMax || 2300), t = entre(0.08, 0.22);
  const x = modal(t * 1.2, [{ f, t60: t, a: 1 }, { f: f * 2.76, t60: t * 0.7, a: 0.55 }, { f: f * 5.40, t60: t * 0.45, a: 0.3 }]);
  return sumar(x, chasquido(0.002, 5000, 0.8), 0, 0.6);
}
/** Hoja seca: un crujido corto, con cortes. */
function granoHoja() {
  const d = entre(0.01, 0.03), x = blanco(d);
  for (let i = 0; i < x.length; i++) if (R() < 0.55) x[i] *= 0.15;
  conEnvolvente(x, campanaEnv(d, 0.2, 1, 1));
  return bp(x, entre(2500, 7000), 0.9);
}
/** Chispa: un pinchazo agudo. */
function granoChispa() { const d = entre(0.0015, 0.004); return hp(conEnvolvente(blanco(d + 0.002), caida(0.0002, d)), entre(1800, 4500)); }
/** Burbuja (van den Doel): un seno que sube mientras se apaga. */
function granoBurbuja(f0, t60) {
  const t = t60 || entre(0.025, 0.07) * Math.sqrt(300 / f0), sigma = entre(3, 9) / t, x = vacio(t * 1.2);
  let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const tt = i / SR, f = f0 * (1 + sigma * tt * 0.1);
    ph += f / SR;
    x[i] = Math.sin(2 * Math.PI * ph) * Math.pow(10, -3 * tt / t) * Math.min(1, tt / 0.002);
  }
  return x;
}
/** Esparce `n` granos en [t0, t1]; `sesgo` > 1 los junta al principio. */
function esparcir(dst, n, t0, t1, grano, ganancia, sesgo, caidaG) {
  for (let k = 0; k < n; k++) {
    const u = Math.pow(R(), sesgo || 1);
    const g = (ganancia === undefined ? 1 : ganancia) * entre(0.3, 1) * (caidaG ? 1 - u * caidaG : 1);
    sumar(dst, grano(), t0 + u * (t1 - t0), g);
  }
  return dst;
}

// ===========================================================================
// CAPAS
// ===========================================================================
/** El golpe: un bombo que cae de f0 a f1, el ruido que se cierra y el chasquido. */
function capaGolpe(o) {
  const op = Object.assign({ f0: 150, f1: 45, t60: 0.35, chasquido: 0.5, cuerpo: 1, ruido: 0.6, corte: 1800 }, o || {});
  const s = op.t60 * 1.4 + 0.04, x = vacio(s);
  let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR, f = op.f1 + (op.f0 - op.f1) * Math.exp(-t / 0.035);
    ph += f / SR;
    x[i] = Math.sin(2 * Math.PI * ph) * Math.min(1, t / 0.0015) * Math.pow(10, -3 * t / op.t60) * op.cuerpo;
  }
  const r = lp(blanco(s), curva([[0, op.corte], [op.t60 * 0.5, 200, 'exp']]), 0.7);
  sumar(x, norm(conEnvolvente(r, caida(0.001, op.t60 * 0.45))), 0, op.ruido);
  if (op.chasquido > 0) sumar(x, norm(hp(chasquido(0.005), 2200)), 0, op.chasquido);
  return norm(x);
}
/** Escombros: piedrecitas y gravilla, más al principio. */
function capaEscombros(s, n, o) {
  const op = Object.assign({ fMin: 500, fMax: 3000, t60: [0.025, 0.08], grava: 0.5, desde: 0 }, o || {});
  const x = vacio(s);
  esparcir(x, n, op.desde, s * 0.85, () => granoPiedra(op.fMin, op.fMax, op.t60), 1, 1.8, 0.7);
  esparcir(x, Math.round(n * op.grava * 2), op.desde, s * 0.7, granoGrava, 0.45, 1.6, 0.6);
  return norm(x);
}
/** Soplido: ruido rosa por un pasabanda que va de f0 a fm (en `picoFr`) y a f1. */
function capaSoplido(s, f0, fm, f1, o) {
  const op = Object.assign({ q: 1.2, picoFr: 0.45, aire: 0.25 }, o || {});
  const fc = curva([[0, f0], [s * op.picoFr, fm, 'exp'], [s, f1, 'exp']]);
  let y = bp(bp(rosa(s), fc, op.q), fc, op.q);
  const env = campanaEnv(s, op.picoFr, 1.6, 1.1);
  conEnvolvente(y, env);
  norm(y);
  if (op.aire) sumar(y, norm(conEnvolvente(hp(blanco(s), 4200), env)), 0, op.aire);
  return norm(y);
}
/** Retumbo grave que rueda. */
function capaRetumbo(s, fc, env, rueda) {
  const x = lp(lp(marron(s), fc, 0.6), fc, 0.6);
  let ph = R(), fr = rueda || 6;
  for (let i = 0; i < x.length; i++) {
    ph += fr * (1 + 0.4 * (R() - 0.5)) / SR;
    x[i] *= valor(env, i / SR) * (0.75 + 0.25 * Math.sin(2 * Math.PI * ph));
  }
  return norm(x);
}
/** Chisporroteo: chispas sueltas con densidad (por segundo) que cambia. */
function capaChispas(s, densidad, ganancia) {
  const x = vacio(s);
  let t = 0;
  while (t < s) {
    const d = Math.max(1, valor(densidad, t));
    t += -Math.log(1 - R() * 0.999) / d;
    if (t >= s) break;
    sumar(x, granoChispa(), t, entre(0.25, 1) * (ganancia ? valor(ganancia, t) : 1));
  }
  return norm(x);
}
/** Brillo mágico: parciales agudos que tiemblan. */
function capaBrillo(s, frecs, env, trem) {
  const x = vacio(s);
  for (const f of frecs) {
    const det = entre(0.995, 1.005), tr = entre(trem ? trem[0] : 8, trem ? trem[1] : 18), fa = R() * 6;
    let ph = R();
    for (let i = 0; i < x.length; i++) {
      const t = i / SR;
      ph += valor(f, t) * det / SR;
      x[i] += Math.sin(2 * Math.PI * ph) * (0.65 + 0.35 * Math.sin(2 * Math.PI * tr * t + fa));
    }
  }
  return norm(conEnvolvente(x, env));
}
/** Campana / nota mágica: parciales casi armónicos que se apagan. */
function campana(f, t60, parciales) {
  const p = parciales || [[1, 1], [2.0, 0.45], [3.01, 0.22], [4.2, 0.1]];
  return norm(modal(t60 * 1.2, p.map(([r, a], k) => ({ f: f * r, t60: t60 / (1 + k * 0.6), a, fase: 0 }))));
}
/** Crujido de madera (o de hielo): roce que se pega y se suelta. */
function capaCrujido(s, fPulso, resonancias, env, jitter) {
  const x = vacio(s);
  let prox = 0;
  for (let i = 0; i < x.length; i++) {
    if (i >= prox) {
      x[i] = (0.5 + 0.5 * R()) * signo();
      prox = i + Math.max(1, Math.round(SR / valor(fPulso, i / SR) * (1 + (R() * 2 - 1) * (jitter || 0.3))));
    }
  }
  const y = vacio(s);
  for (const [fr, q, g] of resonancias) sumar(y, bp(x, fr, q), 0, g);
  return norm(conEnvolvente(y, env));
}
/** Cuerda pulsada (Karplus-Strong): el arco. */
function pulsar(f, s, perdida) {
  const n = muestras(s), x = new Float32Array(n), L = Math.max(2, Math.round(SR / f)), b = new Float32Array(L);
  for (let i = 0; i < L; i++) b[i] = R() * 2 - 1;
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const v = b[idx], nx = b[(idx + 1) % L];
    x[i] = v;
    b[idx] = (perdida || 0.996) * 0.5 * (v + nx);
    idx = (idx + 1) % L;
  }
  return norm(x);
}

// ── LAS VOCES ──────────────────────────────────────────────────────────────
/* Formantes [frecuencia, ganancia, ancho] de cada vocal (voz adulta); las
   bestias las bajan con `tracto` (un tracto vocal más largo). */
const VOCAL = {
  a: [[730, 1.0, 90], [1090, 0.5, 110], [2440, 0.22, 160]],
  o: [[570, 1.0, 80], [840, 0.45, 100], [2410, 0.15, 160]],
  u: [[300, 1.0, 70], [870, 0.3, 100], [2240, 0.1, 160]],
  e: [[530, 1.0, 80], [1840, 0.45, 110], [2480, 0.25, 160]],
  i: [[270, 1.0, 60], [2290, 0.35, 120], [3010, 0.25, 180]],
  r: [[640, 1.0, 150], [1190, 0.55, 170], [2390, 0.25, 220]]
};
function formanteEn(vocales, t, j, campo) {
  if (t <= vocales[0][0]) return VOCAL[vocales[0][1]][j][campo];
  for (let i = 1; i < vocales.length; i++) {
    if (t <= vocales[i][0]) {
      const a = VOCAL[vocales[i - 1][1]][j][campo], b = VOCAL[vocales[i][1]][j][campo];
      const u = (t - vocales[i - 1][0]) / Math.max(1e-6, vocales[i][0] - vocales[i - 1][0]);
      return a + (b - a) * (u * u * (3 - 2 * u));
    }
  }
  return VOCAL[vocales[vocales.length - 1][1]][j][campo];
}
/** Una voz: fuente glotal (sierra) con temblor, aspereza y subarmónico, más su
    aliento, por los formantes de las vocales que se van diciendo. */
function capaVoz(o) {
  const s = o.s, n = muestras(s), src = new Float32Array(n), aire = new Float32Array(n);
  let ph = 0, phs = 0, jit = 0, obj = 0, prox = 0, asp = R();
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (i >= prox) { obj = (R() * 2 - 1) * (o.jitter || 0.01); prox = i + muestras(entre(0.008, 0.022)); }
    jit += (obj - jit) * 0.003;
    const vib = o.vibrato ? o.vibrato[1] * Math.sin(2 * Math.PI * o.vibrato[0] * t) : 0;
    const f = valor(o.f0, t) * (1 + jit + vib), dt = Math.min(0.45, f / SR);
    let v = 2 * ph - 1 - polyblep(ph, dt);
    if (o.sub) { const dts = dt * 0.5; v = v * (1 - o.sub * 0.4) + (2 * phs - 1 - polyblep(phs, dts)) * o.sub; phs += dts; phs -= Math.floor(phs); }
    ph += dt; ph -= Math.floor(ph);
    asp += (o.aspFrec || 32) * (1 + 0.2 * (R() - 0.5)) / SR;
    const am = 1 - (o.aspereza || 0) * (0.5 + 0.5 * Math.sin(2 * Math.PI * asp));
    const e = valor(o.env, t);
    src[i] = v * e * am;
    aire[i] = (R() * 2 - 1) * e;
  }
  const fuente = lp(src, o.brillo || 3000, 0.6);
  sumar(fuente, norm(bp(aire, 1600, 0.45)), 0, (o.aliento || 0) * pico(fuente));
  const tracto = o.tracto || 1, voc = o.vocales || [[0, 'a']], anchoK = o.ancho || 1.5;
  const out = vacio(s);
  for (let j = 0; j < 3; j++) {
    const fj = (t) => formanteEn(voc, t, j, 0) * tracto;
    const qj = (t) => Math.max(1.2, formanteEn(voc, t, j, 0) / (formanteEn(voc, t, j, 2) * anchoK));
    sumar(out, bp(fuente, fj, qj), 0, formanteEn(voc, 0, j, 1));
  }
  sumar(out, lp(fuente, 380 * tracto, 0.7), 0, o.pecho === undefined ? 0.4 : o.pecho);
  norm(out);
  if (o.saturacion) saturar(out, o.saturacion);
  return norm(out);
}

// ===========================================================================
// LAS RECETAS
// ===========================================================================
/* Cada una devuelve el sonido en crudo; `terminar` lo iguala. `nivel` es la
   sonoridad (RMS de 100 ms) en dBFS: los golpes gordos un poco más arriba. */
function mezcla(s) { return vacio(s); }

const golpeConEscombros = (o) => {
  const x = mezcla(o.s);
  sumar(x, capaGolpe(o.golpe), 0, 1);
  if (o.escombros) sumar(x, capaEscombros(o.s * 0.9, o.escombros, o.esc), 0.008, o.gEsc === undefined ? 0.5 : o.gEsc);
  return x;
};

/** El gruñido corto de una bestia (lo usan varios). */
function grunido(s, f0, f1, tracto, aspereza) {
  return capaVoz({ s, f0: curva([[0, f0], [s, f1, 'exp']]), env: campanaEnv(s, 0.2, 1, 1), jitter: 0.03, aspereza: aspereza || 0.55,
                   aspFrec: 40, sub: 0.3, aliento: 0.5, tracto: tracto || 0.75, vocales: [[0, 'r'], [s, 'o']], saturacion: 2, brillo: 3200 });
}
/** Un tajo: el silbido de la zarpa y el desgarro. */
function tajo(fBase) {
  const x = mezcla(0.22), f = fBase || 1;
  sumar(x, capaSoplido(0.12, 1300 * f, 4200 * f, 2200 * f, { q: 1.6, picoFr: 0.6, aire: 0.4 }), 0, 0.8);
  const rasga = bp(blanco(0.05), 1900 * f, 0.9);
  for (let i = 0; i < rasga.length; i++) rasga[i] *= (0.5 + 0.5 * Math.sin(2 * Math.PI * 130 * i / SR)) * Math.pow(10, -3 * (i / SR) / 0.045);
  sumar(x, norm(rasga), 0.075, 0.7);
  return x;
}
/** El tajo que suena EN el golpe (cuerpo a cuerpo): el silbido es corto y el
    desgarro va a los 4 ms, porque el sonido sale cuando la zarpa ya da. */
function tajoCorto(fBase) {
  const x = mezcla(0.16), f = fBase || 1;
  sumar(x, capaSoplido(0.07, 2200 * f, 4800 * f, 2600 * f, { q: 1.6, picoFr: 0.3, aire: 0.4 }), 0, 0.6);
  const rasga = bp(blanco(0.05), 1900 * f, 0.9);
  for (let i = 0; i < rasga.length; i++) rasga[i] *= (0.5 + 0.5 * Math.sin(2 * Math.PI * 130 * i / SR)) * Math.pow(10, -3 * (i / SR) / 0.045);
  sumar(x, norm(rasga), 0.004, 0.8);
  return x;
}
function golpeRoca(t60) {
  const x = mezcla(1.0);
  sumar(x, capaGolpe({ f0: 130, f1: 38, t60: t60 || 0.4, chasquido: 0.7, ruido: 0.9, corte: 2600 }), 0, 1);
  const choque = lp(blanco(0.5), curva([[0, 4200], [0.4, 380, 'exp']]), 0.7);
  sumar(x, norm(conEnvolvente(choque, caida(0.002, 0.35))), 0, 0.5);
  sumar(x, capaEscombros(0.8, 10), 0.01, 0.45);
  return x;
}
function estallidoCristal(n, dur) {
  const x = mezcla((dur || 0.15) + 0.6);
  esparcir(x, n, 0, dur || 0.15, () => granoCristal(2000, 7500), 1, 1.7, 0.5);
  return norm(x);
}
function nota(f, t60, parciales) { return campana(f, t60, parciales); }

const SONIDOS = {
  // ── GOLPES CUERPO A CUERPO ─────────────────────────────────────────────────
  golpe_piedra: { nivel: -14, fn: () => reverb(golpeConEscombros({ s: 0.7, golpe: { f0: 150, f1: 48, t60: 0.32, chasquido: 0.6, ruido: 0.7, corte: 2200 }, escombros: 9 }), { sala: 0.5, humedo: 0.1, cola: 0.35 }) },
  golpe_hielo: { nivel: -14, fn: () => {
    const x = mezcla(0.85);
    sumar(x, capaGolpe({ f0: 160, f1: 52, t60: 0.26, chasquido: 0.9, ruido: 0.5 }), 0, 0.9);
    sumar(x, norm(hp(chasquido(0.008), 3000)), 0.002, 0.6);
    sumar(x, norm(modal(0.5, [{ f: 2650, t60: 0.32, a: 1 }, { f: 4110, t60: 0.22, a: 0.6 }, { f: 6020, t60: 0.15, a: 0.35 }])), 0.004, 0.3);
    esparcir(x, 8, 0.01, 0.3, granoHielo, 0.45, 1.5);
    return reverb(x, { sala: 0.6, humedo: 0.14, cola: 0.5 });
  } },
  golpe_cristal: { nivel: -14, fn: () => {
    const x = mezcla(1.0);
    sumar(x, capaGolpe({ f0: 140, f1: 46, t60: 0.3, chasquido: 0.7, ruido: 0.6 }), 0, 0.9);
    sumar(x, estallidoCristal(14, 0.14), 0.004, 0.55);
    sumar(x, norm(modal(0.9, [{ f: 1760, t60: 0.75, a: 1, fase: 0 }, { f: 2637, t60: 0.6, a: 0.7, fase: 0 }, { f: 3520, t60: 0.45, a: 0.4, fase: 0 }])), 0.01, 0.18);
    return reverb(x, { sala: 0.78, humedo: 0.2, cola: 0.8 });
  } },
  golpe_madera: { nivel: -15, fn: () => {
    const x = mezcla(0.75);
    sumar(x, capaGolpe({ f0: 120, f1: 55, t60: 0.24, chasquido: 0.3, ruido: 0.5, corte: 1400 }), 0, 0.85);
    sumar(x, norm(modal(0.25, [{ f: 210, t60: 0.1, a: 1 }, { f: 470, t60: 0.07, a: 0.7 }, { f: 830, t60: 0.05, a: 0.45 }, { f: 1290, t60: 0.03, a: 0.25 }])), 0.002, 0.65);
    for (let k = 0; k < 3; k++) sumar(x, norm(modal(0.04, [{ f: entre(2000, 3400), t60: 0.016 }])), entre(0.02, 0.12), 0.25);
    esparcir(x, 7, 0.05, 0.55, granoHoja, 0.18);
    return reverb(x, { sala: 0.45, humedo: 0.08, cola: 0.3 });
  } },
  golpe_magma: { nivel: -14, fn: () => {
    const x = mezcla(1.0);
    sumar(x, capaGolpe({ f0: 140, f1: 42, t60: 0.32, chasquido: 0.6, ruido: 0.7 }), 0, 0.9);
    const chis = hp(blanco(0.9), 2600);
    for (let i = 0; i < chis.length; i++) chis[i] *= (R() < 0.3 ? 1 : 0.35) * Math.min(1, i / (SR * 0.01)) * Math.pow(10, -3 * (i / SR) / 0.7);
    sumar(x, norm(chis), 0.01, 0.3);
    esparcir(x, 6, 0.05, 0.6, () => granoBurbuja(entre(80, 170)), 0.3);
    sumar(x, capaChispas(0.7, curva([[0, 90], [0.7, 15]])), 0.01, 0.3);
    return reverb(x, { sala: 0.5, humedo: 0.1, cola: 0.4 });
  } },
  golpe_arena: { nivel: -14, fn: () => {
    const x = mezcla(0.85);
    sumar(x, capaGolpe({ f0: 140, f1: 46, t60: 0.3, chasquido: 0.5, ruido: 0.7 }), 0, 0.9);
    const arena = bp(rosa(0.7), 3600, 0.6);
    let gate = 1, prox = 0;
    for (let i = 0; i < arena.length; i++) { if (i >= prox) { gate = R() < 0.6 ? 1 : 0.2; prox = i + muestras(entre(0.002, 0.006)); } arena[i] *= gate * Math.min(1, i / (SR * 0.006)) * Math.pow(10, -3 * (i / SR) / 0.5); }
    sumar(x, norm(arena), 0.004, 0.42);
    sumar(x, capaEscombros(0.5, 5, { fMin: 350, fMax: 1400 }), 0.01, 0.25);
    return reverb(x, { sala: 0.45, humedo: 0.08, cola: 0.3 });
  } },
  golpe_bestia: { nivel: -14, fn: () => {
    const x = mezcla(0.6);
    sumar(x, capaGolpe({ f0: 110, f1: 55, t60: 0.18, chasquido: 0.25, ruido: 0.9, corte: 900 }), 0, 1);
    sumar(x, norm(conEnvolvente(bp(blanco(0.03), 1400, 0.8), caida(0.001, 0.02))), 0, 0.5);
    sumar(x, grunido(0.24, 105, 80, 0.75), 0.02, 0.45);
    return x;
  } },
  mordisco: { nivel: -15, fn: () => {
    const x = mezcla(0.55);
    const diente = () => sumar(norm(modal(0.05, [{ f: 1150, t60: 0.025 }, { f: 2600, t60: 0.015, a: 0.6 }, { f: 4100, t60: 0.01, a: 0.4 }])), chasquido(0.002, 3500, 0.8), 0, 0.8);
    sumar(x, diente(), 0, 0.8);
    sumar(x, diente(), 0.035, 0.6);
    sumar(x, norm(conEnvolvente(lp(blanco(0.05), 700), caida(0.002, 0.04))), 0.03, 0.45);
    sumar(x, grunido(0.36, 140, 100, 0.8, 0.6), 0.03, 0.55);
    return x;
  } },
  zarpa: { nivel: -15, fn: () => {
    // Suena en el instante del golpe (cuerpoACuerpo): el desgarro, en los primeros ms.
    const x = mezcla(0.5);
    sumar(x, tajoCorto(1), 0, 0.9);
    sumar(x, capaGolpe({ f0: 95, f1: 55, t60: 0.12, chasquido: 0.1, ruido: 0.6, corte: 800 }), 0.008, 0.5);
    sumar(x, grunido(0.3, 120, 95, 0.75), 0, 0.3);
    return x;
  } },
  golpe_muerto: { nivel: -15, fn: () => {
    const x = mezcla(0.8);
    sumar(x, capaGolpe({ f0: 100, f1: 50, t60: 0.16, chasquido: 0.15, ruido: 1, corte: 700 }), 0, 0.9);
    for (let k = 0; k < 3; k++) sumar(x, granoBurbuja(entre(160, 300), 0.04), entre(0.005, 0.05), 0.3);
    sumar(x, norm(bp(conEnvolvente(blanco(0.06), caida(0.002, 0.05)), curva([[0, 700], [0.05, 350, 'exp']]), 2)), 0.004, 0.35);
    sumar(x, capaVoz({ s: 0.5, f0: curva([[0, 92], [0.5, 74, 'exp']]), env: campanaEnv(0.5, 0.25, 1, 1), jitter: 0.05, aspereza: 0.4, aspFrec: 28,
                       sub: 0.25, aliento: 0.55, tracto: 0.85, vocales: [[0, 'u'], [0.5, 'o']], saturacion: 1.6, brillo: 2400 }), 0.05, 0.5);
    return x;
  } },
  golpe_hueso: { nivel: -15, limite: 6, fn: () => {
    const x = mezcla(0.55);
    const hueso = () => norm(modal(0.08, [{ f: entre(900, 1000), t60: 0.04 }, { f: entre(1750, 1900), t60: 0.03, a: 0.6 }, { f: entre(3000, 3200), t60: 0.02, a: 0.35 }]));
    sumar(x, hueso(), 0, 0.9);
    sumar(x, hueso(), 0.035, 0.6);
    sumar(x, capaGolpe({ f0: 120, f1: 60, t60: 0.1, chasquido: 0.2, ruido: 0.4, corte: 1200 }), 0, 0.35);
    esparcir(x, 8, 0.04, 0.32, () => granoMadera(1200, 2600), 0.2);
    return x;
  } },
  tajo_sable: { nivel: -15, fn: () => {
    const x = mezcla(0.65);
    sumar(x, capaSoplido(0.09, 2600, 6500, 3200, { q: 2, picoFr: 0.35, aire: 0.35 }), 0, 0.7);
    sumar(x, norm(conEnvolvente(bp(blanco(0.04), 2500, 0.8), caida(0.001, 0.03))), 0.02, 0.6);
    sumar(x, capaGolpe({ f0: 120, f1: 60, t60: 0.1, chasquido: 0.2, ruido: 0.5, corte: 1200 }), 0.02, 0.4);
    sumar(x, norm(modal(0.55, [{ f: 2150, t60: 0.4, fase: 0 }, { f: 3720, t60: 0.3, a: 0.6, fase: 0 }, { f: 5900, t60: 0.2, a: 0.35, fase: 0 }])), 0.02, 0.16);
    return reverb(x, { sala: 0.4, humedo: 0.08, cola: 0.3 });
  } },
  picadura: { nivel: -16, limite: 6, fn: () => {
    // El aguijón primero (suena al dar) y luego las mandíbulas.
    const x = mezcla(0.4);
    sumar(x, norm(hp(chasquido(0.006), 1500)), 0, 0.8);
    sumar(x, norm(conEnvolvente(lp(blanco(0.04), 1000), caida(0.002, 0.03))), 0.004, 0.5);
    const clic = () => norm(modal(0.03, [{ f: entre(3000, 3400), t60: 0.01 }, { f: entre(4600, 5000), t60: 0.007, a: 0.6 }]));
    sumar(x, clic(), 0.05, 0.5); sumar(x, clic(), 0.085, 0.4); sumar(x, clic(), 0.11, 0.45);
    sumar(x, norm(conEnvolvente(hp(blanco(0.2), 5000), campanaEnv(0.2, 0.2, 1, 1))), 0.01, 0.12);
    return x;
  } },
  pinza: { nivel: -14, limite: 5, fn: () => {
    const x = mezcla(0.6);
    const concha = (k) => norm(modal(0.12, [{ f: 680 * k, t60: 0.07 }, { f: 1550 * k, t60: 0.05, a: 0.7 }, { f: 2650 * k, t60: 0.03, a: 0.45 }, { f: 4100 * k, t60: 0.02, a: 0.3 }]));
    sumar(x, concha(1), 0, 0.9);
    sumar(x, concha(1.06), 0.045, 0.75);
    esparcir(x, 12, 0.045, 0.13, granoGrava, 0.35);
    sumar(x, capaGolpe({ f0: 120, f1: 60, t60: 0.12, chasquido: 0.3, ruido: 0.3 }), 0.045, 0.5);
    return x;
  } },
  golpe_blando: { nivel: -16, fn: () => {
    const x = mezcla(0.55);
    sumar(x, capaGolpe({ f0: 110, f1: 60, t60: 0.14, chasquido: 0.05, ruido: 0.8, corte: 600 }), 0, 1);
    for (let k = 0; k < 3; k++) sumar(x, granoBurbuja(entre(250, 600), 0.05), entre(0.01, 0.08), 0.35);
    const bamboleo = osc(0.25, 180, 'seno');
    for (let i = 0; i < bamboleo.length; i++) bamboleo[i] *= (0.6 + 0.4 * Math.sin(2 * Math.PI * 25 * i / SR)) * Math.pow(10, -3 * (i / SR) / 0.2);
    sumar(x, norm(bamboleo), 0.01, 0.25);
    return x;
  } },
  baston: { nivel: -15, fn: () => {
    const x = mezcla(0.8);
    sumar(x, norm(modal(0.2, [{ f: 320, t60: 0.07 }, { f: 690, t60: 0.05, a: 0.7 }, { f: 1240, t60: 0.03, a: 0.4 }])), 0, 0.8);
    sumar(x, chasquido(0.003, 2500, 0.8), 0, 0.5);
    sumar(x, capaGolpe({ f0: 130, f1: 70, t60: 0.1, chasquido: 0, ruido: 0.4 }), 0, 0.45);
    sumar(x, nota(2093, 0.5), 0.03, 0.14); sumar(x, nota(2637, 0.45), 0.05, 0.1); sumar(x, nota(3136, 0.4), 0.07, 0.08);
    return reverb(x, { sala: 0.55, humedo: 0.14, cola: 0.4 });
  } },

  // ── EL GÓLEM ───────────────────────────────────────────────────────────────
  roca_arranca: { nivel: -14, fn: () => {
    const x = mezcla(1.0);
    sumar(x, norm(hp(chasquido(0.02), 1500)), 0, 0.5);
    sumar(x, norm(modal(0.1, [{ f: 300, t60: 0.05 }, { f: 650, t60: 0.04, a: 0.6 }])), 0, 0.5);
    sumar(x, capaRetumbo(0.75, 260, campanaEnv(0.75, 0.35, 1, 1.3), 9), 0, 0.6);
    esparcir(x, 60, 0, 0.6, granoGrava, 0.3);
    sumar(x, capaVoz({ s: 0.45, f0: curva([[0, 60], [0.2, 76], [0.45, 55]]), env: campanaEnv(0.45, 0.35, 1, 1), jitter: 0.04, aspereza: 0.7, aspFrec: 24,
                       sub: 0.6, aliento: 0.3, tracto: 0.6, vocales: [[0, 'o'], [0.45, 'u']], saturacion: 2.4, brillo: 1800 }), 0.12, 0.5);
    sumar(x, capaEscombros(0.5, 6), 0.1, 0.3);
    sumar(x, capaSoplido(0.4, 300, 1100, 500, { q: 1.1, picoFr: 0.3, aire: 0.15 }), 0.35, 0.45);   // la lanza a los 350 ms (golemRoca)
    return reverb(x, { sala: 0.5, humedo: 0.1, cola: 0.4 });
  } },
  roca_impacto: { nivel: -13, fn: () => reverb(golpeRoca(0.45), { sala: 0.65, humedo: 0.14, cola: 0.6 }) },
  pisoton: { nivel: -12, fn: () => {
    const x = mezcla(1.5);
    const sub = osc(1.2, curva([[0, 75], [0.5, 30, 'exp'], [1.2, 28]]), 'seno');
    conEnvolvente(sub, caida(0.002, 0.9));
    sumar(x, saturar(norm(sub), 1.8), 0, 0.85);
    sumar(x, capaGolpe({ f0: 150, f1: 40, t60: 0.5, chasquido: 0.8, ruido: 0.9, corte: 3000 }), 0, 0.8);
    sumar(x, capaRetumbo(1.4, 140, caida(0.02, 1.1), 7), 0, 0.45);
    sumar(x, capaEscombros(1.3, 22), 0.02, 0.4);
    return reverb(x, { sala: 0.8, humedo: 0.18, cola: 0.8 });
  } },

  // ── LOS GRITOS (al empezar a cazar) ────────────────────────────────────────
  grito_golem: { nivel: -14, fn: () => {
    const x = mezcla(1.5);
    sumar(x, capaVoz({ s: 1.35, f0: curva([[0, 52], [0.3, 72, 'exp'], [1.35, 46, 'exp']]), env: campanaEnv(1.35, 0.25, 1.2, 1.3), jitter: 0.04,
                       aspereza: 0.72, aspFrec: 22, sub: 0.7, aliento: 0.25, tracto: 0.58, vocales: [[0, 'o'], [0.5, 'a'], [1.35, 'u']], saturacion: 2.6, brillo: 2000 }), 0, 0.8);
    const roce = vacio(1.3);
    esparcir(roce, 160, 0, 1.25, granoGrava, 1);
    sumar(x, norm(conEnvolvente(bp(roce, 1500, 0.5), campanaEnv(1.3, 0.3, 1, 1))), 0, 0.3);
    sumar(x, capaRetumbo(1.4, 120, campanaEnv(1.4, 0.3, 1, 1.4), 5), 0, 0.35);
    return reverb(x, { sala: 0.7, humedo: 0.16, cola: 0.7 });
  } },
  aullido: { nivel: -15, fn: () => {
    const lobo = (s, k) => capaVoz({ s, f0: curva([[0, 420 * k], [0.45, 760 * k, 'exp'], [s * 0.65, 720 * k], [s, 520 * k, 'exp']]), env: campanaEnv(s, 0.2, 1.3, 1.4),
                                       vibrato: [5.5, 0.012], jitter: 0.004, aliento: 0.08, brillo: 1700, tracto: 1, vocales: [[0, 'u'], [0.4, 'o'], [s * 0.75, 'o'], [s, 'u']], pecho: 0.15, ancho: 1.3 });
    const x = mezcla(2.6);
    sumar(x, lobo(2.0, 1), 0, 0.9);
    sumar(x, lobo(1.5, 1.335), 0.55, 0.35);            // otro de la manada, una cuarta arriba
    return reverb(x, { sala: 0.88, humedo: 0.32, amort: 0.35, cola: 1.4, pre: 0.03 });
  } },
  gemido: { nivel: -15, fn: () => reverb(capaVoz({ s: 1.6, f0: curva([[0, 95], [0.5, 112], [1.6, 76, 'exp']]), env: campanaEnv(1.6, 0.3, 1.2, 1.2), jitter: 0.05,
                                                     aspereza: 0.35, aspFrec: 28, sub: 0.25, aliento: 0.45, tracto: 0.85,
                                                     vocales: [[0, 'u'], [0.5, 'a'], [1.2, 'o'], [1.6, 'u']], saturacion: 1.6, brillo: 2500 }),
                                           { sala: 0.55, humedo: 0.14, cola: 0.6 }) },
  chillido: { nivel: -16, fn: () => {
    const x = mezcla(0.8);
    for (const t0 of [0, 0.14, 0.28]) {             // los tres arcos de pxChillido: 0, 140 y 280 ms
      const s = 0.17, c = curva([[0, 2700], [0.07, 4300, 'exp'], [s, 3200, 'exp']]), y = vacio(s);
      let ph = 0, pm = 0;
      for (let i = 0; i < y.length; i++) {
        const t = i / SR;
        pm += 220 / SR;
        const f = c(t) * (1 + 0.1 * Math.sin(2 * Math.PI * pm));
        ph += f / SR;
        y[i] = (Math.sin(2 * Math.PI * ph) + 0.3 * Math.sin(4 * Math.PI * ph)) * campanaEnv(s, 0.15, 0.8, 1.2)(t);
      }
      sumar(x, norm(y), t0, t0 ? 0.75 : 1);
    }
    sumar(x, norm(conEnvolvente(hp(blanco(0.7), 5500), campanaEnv(0.7, 0.1, 1, 1))), 0, 0.08);
    return reverb(x, { sala: 0.75, humedo: 0.2, cola: 0.6 });
  } },
  rugido: { nivel: -14, fn: () => {
    const x = mezcla(1.45);
    sumar(x, capaVoz({ s: 1.4, f0: curva([[0, 90], [0.2, 140, 'exp'], [0.7, 120], [1.4, 70, 'exp']]), env: campanaEnv(1.4, 0.18, 1.1, 1.2), jitter: 0.03,
                       aspereza: 0.5, aspFrec: 38, sub: 0.45, aliento: 0.5, tracto: 0.72, vocales: [[0, 'o'], [0.25, 'a'], [1.0, 'a'], [1.4, 'o']], saturacion: 2.2, brillo: 3500 }), 0, 1);
    sumar(x, norm(conEnvolvente(bp(rosa(1.4), curva([[0, 500], [0.3, 1300, 'exp'], [1.4, 600, 'exp']]), 0.8), campanaEnv(1.4, 0.2, 1, 1.2))), 0, 0.25);
    return reverb(x, { sala: 0.75, humedo: 0.18, cola: 0.8 });
  } },
  rugido_dragon: { nivel: -13, fn: () => {
    const x = mezcla(2.4);
    sumar(x, capaVoz({ s: 2.2, f0: curva([[0, 70], [0.3, 105, 'exp'], [1.2, 95], [2.2, 50, 'exp']]), env: campanaEnv(2.2, 0.15, 1.1, 1.3), jitter: 0.035,
                       aspereza: 0.6, aspFrec: 30, sub: 0.6, aliento: 0.45, tracto: 0.55, vocales: [[0, 'o'], [0.35, 'a'], [1.6, 'a'], [2.2, 'o']], saturacion: 3, brillo: 3000 }), 0, 1);
    sumar(x, norm(conEnvolvente(lp(rosa(1.9), 1500), campanaEnv(1.9, 0.4, 1.2, 1))), 0.35, 0.4);
    sumar(x, capaChispas(1.8, 110), 0.4, 0.25);
    return reverb(x, { sala: 0.9, humedo: 0.24, cola: 1.4, pre: 0.025 });
  } },
  croar: { nivel: -16, fn: () => {
    const x = mezcla(0.8);
    const croac = (k) => {
      const y = vacio(0.3);
      for (let p = 0; p < 7; p++) {
        const t = p * 0.036 * (1 + 0.08 * (R() - 0.5));
        sumar(y, norm(modal(0.05, [{ f: 360 * k, t60: 0.03, fase: 0 }, { f: 820 * k, t60: 0.02, a: 0.6, fase: 0 }, { f: 1500 * k, t60: 0.012, a: 0.3, fase: 0 }])), t, 0.6 + 0.4 * Math.sin(Math.PI * p / 6));
      }
      return norm(y);
    };
    sumar(x, croac(1), 0, 1);
    sumar(x, croac(0.85), 0.32, 0.85);
    return reverb(x, { sala: 0.5, humedo: 0.12, cola: 0.4 });
  } },
  zumbido: { nivel: -17, fn: () => {
    const s = 1.1, y = osc(s, curva([[0, 205], [0.5, 232], [s, 195]]), 'sierra');
    for (let i = 0; i < y.length; i++) y[i] *= 0.55 + 0.45 * Math.abs(Math.sin(2 * Math.PI * 96 * i / SR));
    const x = mezcla(s);
    sumar(x, bp(y, 700, 2), 0, 1); sumar(x, bp(y, 1900, 3), 0, 0.6); sumar(x, bp(y, 3200, 4), 0, 0.3);
    conEnvolvente(x, (t) => campanaEnv(s, 0.45, 1.4, 1.2)(t));
    return x;
  } },
  siseo_lava: { nivel: -16, fn: () => {
    const x = mezcla(1.15);
    sumar(x, norm(conEnvolvente(hp(bp(blanco(1.0), 5500, 1.2), 3000), campanaEnv(1.0, 0.25, 1, 1.2))), 0, 0.7);
    esparcir(x, 9, 0.05, 1.0, () => granoBurbuja(entre(70, 190)), 0.5);
    sumar(x, capaChispas(1.0, 25), 0, 0.2);
    return x;
  } },
  puf_esporas: { nivel: -17, fn: () => {
    const x = mezcla(0.9);
    sumar(x, norm(conEnvolvente(lp(rosa(0.3), 900), caida(0.004, 0.25))), 0, 0.9);
    sumar(x, norm(conEnvolvente(hp(blanco(0.7), 5000), caida(0.01, 0.6))), 0, 0.35);
    esparcir(x, 8, 0.03, 0.5, () => granoBurbuja(entre(1200, 2500), 0.02), 0.25);
    return x;
  } },
  grito_arana: { nivel: -17, fn: () => {
    const x = mezcla(0.9);
    let t = 0;
    while (t < 0.75) {
      sumar(x, norm(modal(0.02, [{ f: entre(2200, 4500), t60: entre(0.006, 0.012) }])), t, entre(0.4, 1) * campanaEnv(0.75, 0.3, 1, 1)(t));
      t += 1 / entre(40, 70) + (R() < 0.1 ? 0.04 : 0);
    }
    sumar(x, norm(conEnvolvente(bp(blanco(0.8), 6000, 1.5), campanaEnv(0.8, 0.4, 1, 1))), 0, 0.15);
    return x;
  } },
  grito_espectro: { nivel: -16, fn: () => {
    const x = mezcla(1.8);
    for (const k of [1, 1.012, 0.988]) {
      sumar(x, capaVoz({ s: 1.7, f0: curva([[0, 480 * k], [0.4, 640 * k, 'exp'], [1.0, 600 * k], [1.7, 380 * k, 'exp']]), env: campanaEnv(1.7, 0.3, 1.4, 1.2),
                         vibrato: [6 * k, 0.02], jitter: 0.006, aliento: 0.2, brillo: 1300, tracto: 1.1, vocales: [[0, 'u'], [0.6, 'o'], [1.7, 'u']], pecho: 0.1 }), 0, 0.5);
    }
    const aire = bp(rosa(1.6), 1300, 0.6);
    for (let i = 0; i < aire.length; i++) aire[i] *= (0.6 + 0.4 * Math.sin(2 * Math.PI * 3.3 * i / SR)) * campanaEnv(1.6, 0.4, 1, 1)(i / SR);
    sumar(x, norm(aire), 0, 0.25);
    return reverb(x, { sala: 0.9, humedo: 0.4, amort: 0.3, cola: 1.3, pre: 0.04 });
  } },
  grito_bruja: { nivel: -16, fn: () => {
    const x = mezcla(1.5);
    const coro = vacio(1.4);
    for (const f of [98, 103.5, 146.8]) sumar(coro, osc(1.4, f, 'sierra'), 0, 0.33);
    sumar(x, capaVoz({ s: 1.4, f0: 98, env: campanaEnv(1.4, 0.5, 1.2, 1), jitter: 0.004, aliento: 0.1, tracto: 1, vocales: [[0, 'a'], [1.4, 'o']], pecho: 0.3, brillo: 2200 }), 0, 0.45);
    sumar(x, norm(conEnvolvente(lp(coro, 1400), campanaEnv(1.4, 0.55, 1.4, 1))), 0, 0.35);
    const susurro = bp(blanco(1.3), curva([[0, 1500], [1.3, 3800, 'exp']]), 0.7);
    let gate = 0, prox = 0;
    for (let i = 0; i < susurro.length; i++) { if (i >= prox) { gate = R() < 0.65 ? entre(0.5, 1) : 0.05; prox = i + muestras(1 / entre(6, 9)); } susurro[i] *= gate; }
    sumar(x, norm(conEnvolvente(lp(susurro, 5000), campanaEnv(1.3, 0.5, 1, 1))), 0.05, 0.3);
    sumar(x, capaBrillo(1.2, [curva([[0, 900], [1.2, 1400, 'exp']])], campanaEnv(1.2, 0.6, 1.5, 1), [5, 7]), 0.2, 0.12);
    return reverb(x, { sala: 0.8, humedo: 0.3, cola: 1.0 });
  } },
  grito_madera: { nivel: -16, fn: () => {
    const x = mezcla(1.3);
    sumar(x, capaCrujido(1.1, curva([[0, 20], [0.6, 55], [1.1, 30]]), [[520, 12, 1], [1150, 10, 0.6], [2300, 8, 0.25]], campanaEnv(1.1, 0.4, 1, 1)), 0, 0.8);
    sumar(x, capaVoz({ s: 1.0, f0: curva([[0, 70], [0.4, 82], [1.0, 62]]), env: campanaEnv(1.0, 0.35, 1, 1), jitter: 0.03, aspereza: 0.5, aspFrec: 26, sub: 0.3,
                       aliento: 0.3, tracto: 0.65, vocales: [[0, 'o'], [1.0, 'u']], saturacion: 1.8, brillo: 1800 }), 0.1, 0.45);
    esparcir(x, 25, 0.3, 1.2, granoHoja, 0.25);
    return reverb(x, { sala: 0.6, humedo: 0.12, cola: 0.5 });
  } },
  grito_hueso: { nivel: -16, fn: () => {
    const x = mezcla(1.0);
    for (const [a, b] of [[0, 0.15], [0.25, 0.4], [0.5, 0.75]]) esparcir(x, 14, a, b, () => norm(modal(0.06, [{ f: entre(950, 2600), t60: entre(0.02, 0.05) }, { f: entre(2800, 3600), t60: 0.015, a: 0.4 }])), 0.8);
    sumar(x, norm(conEnvolvente(bp(rosa(0.9), 420, 4), campanaEnv(0.9, 0.5, 1.2, 1))), 0, 0.3);
    return reverb(x, { sala: 0.6, humedo: 0.16, cola: 0.5 });
  } },
  grito_driada: { nivel: -17, fn: () => {
    const x = mezcla(1.3);
    sumar(x, capaSoplido(1.0, 500, 1600, 700, { q: 0.8, picoFr: 0.4, aire: 0.4 }), 0, 0.45);
    esparcir(x, 55, 0, 1.0, granoHoja, 0.5);
    [1047, 1319, 1568, 1760, 2093].forEach((f, k) => sumar(x, nota(f, 0.8, [[1, 1], [2, 0.3], [3, 0.1]]), 0.08 + k * 0.11, 0.22));
    return reverb(x, { sala: 0.75, humedo: 0.25, cola: 0.8 });
  } },
  grunido_jabali: { nivel: -15, fn: () => {
    const x = mezcla(1.0);
    sumar(x, capaVoz({ s: 0.45, f0: curva([[0, 180], [0.15, 520, 'exp'], [0.35, 420], [0.45, 200, 'exp']]), env: campanaEnv(0.45, 0.25, 1, 1), jitter: 0.02,
                       aspereza: 0.25, aspFrec: 50, aliento: 0.3, tracto: 0.9, vocales: [[0, 'i'], [0.45, 'e']], saturacion: 2, brillo: 4000 }), 0, 0.8);
    for (const t0 of [0.5, 0.65, 0.8]) sumar(x, grunido(0.13, 130, 95, 0.75, 0.65), t0, 0.6);
    return x;
  } },

  // ── LA ARAÑA (y los que disparan) ──────────────────────────────────────────
  espinas: { nivel: -16, fn: () => {
    // Se cargan 280 ms (aranaEspinas suelta a los 300; los dardos, a los 260) y salen tres.
    const x = mezcla(0.95);
    const carga = bp(blanco(0.28), curva([[0, 2500], [0.28, 6000, 'exp']]), 1.5);
    for (let i = 0; i < carga.length; i++) carga[i] *= (R() < 0.25 ? 1 : 0.3);
    sumar(x, norm(conEnvolvente(carga, curva([[0, 0], [0.26, 1, 1.5], [0.28, 0.2]]))), 0, 0.3);
    sumar(x, norm(modal(0.03, [{ f: 2800, t60: 0.012 }, { f: 4400, t60: 0.008, a: 0.6 }])), 0.28, 0.6);
    [0, 0.05, 0.1].forEach((t0, k) => sumar(x, capaSoplido(0.13, 1600, 5200 * (1 + k * 0.06), 3200, { q: 2.2, picoFr: 0.35, aire: 0.3 }), 0.28 + t0, 0.75));
    esparcir(x, 5, 0.43, 0.78, () => norm(modal(0.02, [{ f: entre(2500, 4000), t60: 0.008 }])), 0.2);
    return x;
  } },
  flechas: { nivel: -16, fn: () => {
    // Tensa el arco 280 ms, suelta y salen tres flechas.
    const x = mezcla(1.1);
    sumar(x, capaCrujido(0.26, curva([[0, 25], [0.26, 60]]), [[900, 8, 1], [2100, 6, 0.5]], curva([[0, 0], [0.2, 1], [0.26, 0.6]]), 0.4), 0.02, 0.22);
    // La cuerda: un chasquido seco que se apaga en 0,2 s (sin la cola de bajo eléctrico) y el golpe en la madera.
    sumar(x, norm(lp(conEnvolvente(pulsar(110, 0.3, 0.975), caida(0.001, 0.22)), 2600)), 0.28, 0.5);
    sumar(x, capaGolpe({ f0: 160, f1: 90, t60: 0.06, chasquido: 0.2, ruido: 0.3, corte: 1500 }), 0.28, 0.35);
    sumar(x, chasquido(0.003, 1800, 0.8), 0.28, 0.5);
    [0.03, 0.07, 0.11].forEach((t0) => sumar(x, capaSoplido(0.2, 2500, 7000, 4000, { q: 3, picoFr: 0.3, aire: 0.3 }), 0.28 + t0, 0.5));
    return x;
  } },
  esquirlas: { nivel: -15, fn: () => {
    // El cristal zumba 280 ms, se parte y salen las esquirlas.
    const x = mezcla(1.3);
    sumar(x, capaBrillo(0.28, [curva([[0, 1800], [0.28, 3400, 'exp']]), curva([[0, 2700], [0.28, 5100, 'exp']])], curva([[0, 0], [0.26, 1, 1.6], [0.28, 0.3]]), [14, 22]), 0, 0.25);
    sumar(x, norm(hp(chasquido(0.01), 3000)), 0.28, 0.6);
    sumar(x, norm(modal(0.15, [{ f: 2600, t60: 0.08 }, { f: 4100, t60: 0.06, a: 0.6 }])), 0.28, 0.5);
    [0.03, 0.08, 0.13].forEach((t0) => {
      sumar(x, capaSoplido(0.16, 3000, 8000, 5000, { q: 3, picoFr: 0.3 }), 0.28 + t0, 0.45);
      sumar(x, granoCristal(3000, 6000), 0.3 + t0, 0.3);
    });
    return reverb(x, { sala: 0.75, humedo: 0.2, cola: 0.6 });
  } },
  orbes: { nivel: -16, fn: () => {
    const x = mezcla(1.2);
    sumar(x, capaBrillo(0.3, [curva([[0, 1200], [0.3, 2400, 'exp']]), curva([[0, 1800], [0.3, 3200, 'exp']])], campanaEnv(0.3, 0.85, 1.6, 0.6), [12, 16]), 0, 0.35);
    [784, 988, 1175, 1319, 1568].forEach((f, k) => {
      const t0 = 0.28 + k * 0.035;                // salen a los 280 ms, como las espinas
      sumar(x, capaSoplido(0.18, 800, 2200, 1200, { q: 1.5, picoFr: 0.3, aire: 0.2 }), t0, 0.35);
      sumar(x, nota(f, 0.6, [[1, 1], [2, 0.35], [3, 0.12]]), t0, 0.3);
    });
    return reverb(x, { sala: 0.72, humedo: 0.26, cola: 0.8 });
  } },
  savia: { nivel: -16, fn: () => {
    const x = mezcla(1.25);
    sumar(x, norm(conEnvolvente(lp(blanco(0.03), 1200), caida(0.001, 0.025))), 0, 0.6);
    sumar(x, norm(conEnvolvente(osc(0.05, curva([[0, 400], [0.05, 150, 'exp']]), 'seno'), caida(0.002, 0.04))), 0, 0.6);
    const vuelo = osc(0.35, (t) => 160 * (1 + 0.08 * Math.sin(2 * Math.PI * 18 * t)), 'seno');
    sumar(x, norm(conEnvolvente(vuelo, campanaEnv(0.35, 0.2, 1, 1))), 0.05, 0.12);
    sumar(x, norm(conEnvolvente(lp(blanco(0.08), 1500), caida(0.002, 0.06))), 0.8, 0.7);
    for (let k = 0; k < 5; k++) sumar(x, granoBurbuja(entre(200, 500), 0.05), 0.8 + entre(0, 0.08), 0.3);
    sumar(x, norm(conEnvolvente(hp(blanco(0.4), 3000), caida(0.01, 0.35))), 0.81, 0.25);
    return x;
  } },

  // ── EL ESPECTRO (brujo) ────────────────────────────────────────────────────
  rayos_carga: { nivel: -16, fn: () => {
    const s = 1.0, x = mezcla(s);
    sumar(x, capaChispas(s, curva([[0, 30], [0.9, 220, 'exp'], [s, 220]]), curva([[0, 0.3], [0.9, 1]])), 0, 0.55);
    const zumb = osc(s, curva([[0, 70], [0.9, 140, 'exp']]), 'sierra');
    let g = 1, prox = 0;
    for (let i = 0; i < zumb.length; i++) { if (i >= prox) { g = R() < 0.7 ? 1 : 0.3; prox = i + muestras(1 / entre(40, 80)); } zumb[i] *= g; }
    sumar(x, norm(conEnvolvente(bp(hp(zumb, 300), 1200, 0.7), curva([[0, 0], [0.9, 1, 1.5], [s, 0]]))), 0, 0.45);
    sumar(x, norm(conEnvolvente(osc(s, curva([[0, 500], [0.9, 1800, 'exp']]), 'seno'), curva([[0, 0], [0.9, 1, 2], [s, 0]]))), 0, 0.12);
    return x;
  } },
  rayos_golpe: { nivel: -13, limite: 8, fn: () => {          // el chasquido es un pico de 4 ms: se deja aplastar
    const x = mezcla(1.6);
    const n = vacio(0.004);
    for (let i = 0; i < n.length; i++) n[i] = 1 - 2 * i / n.length;           // la onda en N del chasquido
    sumar(x, n, 0, 0.9);
    sumar(x, norm(hp(chasquido(0.006), 2000)), 0, 0.8);
    esparcir(x, 40, 0.002, 0.12, granoChispa, 0.6, 1.5);
    sumar(x, capaRetumbo(1.5, curva([[0, 300], [1.5, 120, 'exp']]), caida(0.05, 1.4), 7), 0.04, 0.75);
    return reverb(x, { sala: 0.85, humedo: 0.18, cola: 0.9 });
  } },
  salto: { nivel: -16, fn: () => {
    // Se desvanece en 240 ms y aparece en otro sitio (brujoSalto).
    const x = mezcla(0.8);
    const sube = bp(rosa(0.25), curva([[0, 300], [0.25, 3500, 'exp']]), 1.4);
    sumar(x, norm(conEnvolvente(sube, curva([[0, 0], [0.23, 1, 2], [0.25, 0]]))), 0, 0.7);
    sumar(x, norm(conEnvolvente(osc(0.04, curva([[0, 900], [0.04, 300, 'exp']]), 'seno'), caida(0.001, 0.035))), 0.24, 0.5);
    sumar(x, chasquido(0.002, 3000, 1), 0.24, 0.3);
    sumar(x, capaBrillo(0.4, [2200, 2900, 3500], caida(0.005, 0.35), [10, 16]), 0.24, 0.3);
    return reverb(x, { sala: 0.7, humedo: 0.22, cola: 0.6 });
  } },

  // ── LOS PODERES ────────────────────────────────────────────────────────────
  bola_nieve: { nivel: -16, fn: () => {
    const s = 2.6, x = mezcla(s);
    sumar(x, grunido(0.3, 90, 70, 0.7), 0, 0.4);
    let t = 0.2;
    while (t < 2.5) {
      const u = (t - 0.2) / 2.3, d = entre(0.008, 0.025);
      sumar(x, norm(bp(conEnvolvente(blanco(d), campanaEnv(d, 0.2, 1, 1)), entre(1200, 3500), 0.7)), t, (0.3 + 0.7 * u) * entre(0.5, 1));
      t += 1 / (25 + 35 * u);
    }
    sumar(x, capaRetumbo(2.3, 160, curva([[0, 0], [2.0, 1, 1.2], [2.3, 0]]), 4), 0.2, 0.5);
    return x;
  } },
  nieve_impacto: { nivel: -15, fn: () => {
    const x = mezcla(0.85);
    sumar(x, capaGolpe({ f0: 110, f1: 50, t60: 0.2, chasquido: 0.1, ruido: 1, corte: 1200 }), 0, 0.8);
    sumar(x, norm(conEnvolvente(lp(hp(rosa(0.6), 900), 6000), caida(0.003, 0.45))), 0, 0.6);
    esparcir(x, 10, 0, 0.15, () => norm(bp(conEnvolvente(blanco(0.015), campanaEnv(0.015, 0.2, 1, 1)), entre(1200, 3000), 0.7)), 0.4);
    return x;
  } },
  rugido_helado: { nivel: -14, fn: () => {
    const x = mezcla(1.7);
    sumar(x, capaVoz({ s: 0.6, f0: curva([[0, 110], [0.15, 160, 'exp'], [0.6, 90, 'exp']]), env: campanaEnv(0.6, 0.2, 1, 1.2), jitter: 0.03, aspereza: 0.5, aspFrec: 40,
                       sub: 0.45, aliento: 0.5, tracto: 0.75, vocales: [[0, 'o'], [0.2, 'a'], [0.6, 'u']], saturacion: 2.2, brillo: 3500 }), 0, 0.9);
    sumar(x, capaSoplido(0.55, 600, 3000, 1500, { q: 0.9, picoFr: 0.3 }), 0.5, 0.45);
    esparcir(x, 25, 0.5, 1.2, granoHielo, 0.4);
    sumar(x, capaBrillo(0.7, [3100, 4200, 5300], caida(0.01, 0.6), [12, 20]), 0.5, 0.15);
    return reverb(x, { sala: 0.7, humedo: 0.16, cola: 0.7 });
  } },
  prision: { nivel: -15, fn: () => {
    const x = mezcla(1.7);
    sumar(x, capaBrillo(0.9, [curva([[0, 2400], [0.9, 3600, 'exp']]), curva([[0, 3300], [0.9, 4800, 'exp']])], curva([[0, 0], [0.88, 1, 1.6], [0.9, 0.2]]), [14, 22]), 0, 0.25);
    esparcir(x, 10, 0.2, 0.88, granoHielo, 0.15);
    for (let k = 0; k < 6; k++) {
      const t0 = 0.9 + k * 0.03;
      sumar(x, norm(hp(chasquido(0.004), 2500)), t0, 0.6);
      sumar(x, granoHielo(), t0, 0.7);
      sumar(x, capaGolpe({ f0: 160, f1: 70, t60: 0.08, chasquido: 0, ruido: 0.4 }), t0, 0.25);
    }
    sumar(x, norm(modal(0.9, [{ f: 3300, t60: 0.8, fase: 0 }, { f: 4900, t60: 0.6, a: 0.6, fase: 0 }])), 0.92, 0.15);
    return reverb(x, { sala: 0.7, humedo: 0.16, cola: 0.6 });
  } },
  derrumbe: { nivel: -13, fn: () => {
    const x = mezcla(2.0);
    sumar(x, capaRetumbo(1.9, 150, curva([[0, 0], [0.6, 1, 1.3], [1.3, 0.8], [1.9, 0]]), 5), 0, 0.5);
    for (const t0 of [0.1, 0.25, 0.4]) {
      sumar(x, norm(modal(0.12, [{ f: entre(200, 600), t60: 0.08 }, { f: entre(700, 1200), t60: 0.05, a: 0.5 }])), t0, 0.35);
      sumar(x, capaChispas(0.12, 120), t0, 0.15);
    }
    // Las tres rocas caen a los 950, 1070 y 1190 ms (pxDerrumbe: 450 + k·120 y 500 de caída).
    for (let k = 0; k < 3; k++) sumar(x, golpeRoca(0.3), 0.95 + k * 0.12, 0.7 - k * 0.1);
    return reverb(x, { sala: 0.75, humedo: 0.15, cola: 0.6 });
  } },
  emerger: { nivel: -15, fn: () => {
    const x = mezcla(0.95);
    sumar(x, norm(modal(0.1, [{ f: 260, t60: 0.06 }, { f: 590, t60: 0.04, a: 0.5 }])), 0, 0.5);
    esparcir(x, 85, 0, 0.6, granoGrava, 0.45);
    sumar(x, capaRetumbo(0.7, 200, campanaEnv(0.7, 0.3, 1, 1), 8), 0, 0.55);
    sumar(x, capaSoplido(0.3, 1500, 900, 300, { q: 0.8, picoFr: 0.2 }), 0.05, 0.3);
    return x;
  } },
  emerger_sale: { nivel: -13, fn: () => {
    const x = mezcla(1.2);
    sumar(x, capaGolpe({ f0: 140, f1: 40, t60: 0.4, chasquido: 0.8, ruido: 0.8 }), 0, 0.9);
    sumar(x, estallidoCristal(16, 0.15), 0.004, 0.5);
    sumar(x, capaEscombros(0.8, 10), 0.01, 0.35);
    return reverb(x, { sala: 0.78, humedo: 0.18, cola: 0.7 });
  } },
  raices: { nivel: -15, fn: () => {
    const x = mezcla(1.45);
    sumar(x, capaSoplido(0.32, 400, 1200, 600, { q: 0.8, picoFr: 0.6, aire: 0.4 }), 0, 0.3);
    // Ocho raíces: brotan a los 320 + k·90 ms (pxRaices).
    for (let k = 0; k < 8; k++) {
      const t0 = 0.32 + k * 0.09;
      esparcir(x, 6, t0, t0 + 0.03, granoGrava, 0.35);
      sumar(x, capaGolpe({ f0: 90, f1: 60, t60: 0.08, chasquido: 0.1, ruido: 0.5, corte: 900 }), t0, 0.35);
      sumar(x, capaCrujido(0.06, 70, [[500, 10, 1], [1100, 8, 0.6]], campanaEnv(0.06, 0.3, 1, 1)), t0 + 0.01, 0.3);
      esparcir(x, 3, t0, t0 + 0.08, granoHoja, 0.15);
    }
    return x;
  } },
  petalos: { nivel: -17, fn: () => {
    const s = 2.35, x = mezcla(s);
    const remo = bp(rosa(2.25), curva([[0, 700], [1.1, 1600, 'exp'], [2.25, 900, 'exp']]), 1.6);
    for (let i = 0; i < remo.length; i++) {
      const t = i / SR;
      remo[i] *= (0.55 + 0.45 * Math.sin(2 * Math.PI * 0.65 * t * 2.6)) * (0.8 + 0.2 * Math.sin(2 * Math.PI * 12 * t)) * campanaEnv(2.25, 0.4, 1.3, 1)(t);
    }
    sumar(x, norm(remo), 0, 0.8);
    esparcir(x, 70, 0.1, 2.1, granoHoja, 0.2);
    [1568, 1760, 2093, 2349, 2637].forEach((f, k) => sumar(x, nota(f, 0.9, [[1, 1], [2, 0.3]]), 0.1 + k * 0.4, 0.12));
    return reverb(x, { sala: 0.7, humedo: 0.2, cola: 0.6 });
  } },
  marea: { nivel: -14, fn: () => {
    const x = mezcla(1.85);
    sumar(x, norm(conEnvolvente(lp(rosa(0.5), curva([[0, 250], [0.45, 2500, 'exp']])), curva([[0, 0], [0.45, 1, 1.6], [0.5, 0.8]]))), 0, 0.6);
    sumar(x, norm(conEnvolvente(lp(blanco(0.6), curva([[0, 5000], [0.5, 1000, 'exp']])), caida(0.005, 0.5))), 0.45, 0.75);
    sumar(x, capaGolpe({ f0: 90, f1: 45, t60: 0.3, chasquido: 0, ruido: 0.6, corte: 800 }), 0.45, 0.4);
    const lava = lp(rosa(1.3), 1200);
    for (let i = 0; i < lava.length; i++) lava[i] *= Math.pow(10, -3 * (i / SR) / 1.1) * (0.75 + 0.25 * Math.sin(2 * Math.PI * 2.3 * i / SR));
    sumar(x, norm(lava), 0.5, 0.45);
    esparcir(x, 15, 0.5, 1.4, () => granoBurbuja(entre(300, 900), 0.04), 0.25);
    esparcir(x, 40, 0.5, 1.5, granoGrava, 0.1);
    return x;
  } },
  ancla: { nivel: -14, fn: () => {
    const x = mezcla(1.4);
    esparcir(x, 16, 0, 0.62, () => granoMetal(1400, 3200), 0.45);
    sumar(x, capaSoplido(0.6, 400, 1200, 600, { q: 1.2 }), 0.02, 0.25);
    // El ancla llega a los 650 ms (el vuelo de pxAncla).
    sumar(x, norm(modal(0.8, [{ f: 170, t60: 0.5 }, { f: 415, t60: 0.35, a: 0.7 }, { f: 880, t60: 0.25, a: 0.45 }, { f: 1530, t60: 0.15, a: 0.3 }])), 0.65, 0.6);
    sumar(x, capaGolpe({ f0: 110, f1: 40, t60: 0.35, chasquido: 0.6, ruido: 0.8 }), 0.65, 0.75);
    sumar(x, capaEscombros(0.4, 6), 0.66, 0.3);
    esparcir(x, 14, 0.87, 1.25, () => granoMetal(1400, 3200), 0.35, 1, 0.6);
    return x;
  } },
  nube_toxica: { nivel: -16, fn: () => {
    const x = mezcla(1.6);
    sumar(x, (() => { const y = vacio(0.22); for (let p = 0; p < 6; p++) sumar(y, norm(modal(0.05, [{ f: 330, t60: 0.03, fase: 0 }, { f: 760, t60: 0.02, a: 0.6, fase: 0 }])), p * 0.034, 1); return norm(y); })(), 0, 0.6);
    const vuelo = osc(0.45, (t) => 200 * (1 + 0.1 * Math.sin(2 * Math.PI * 20 * t)), 'seno');
    sumar(x, norm(conEnvolvente(vuelo, campanaEnv(0.45, 0.3, 1, 1))), 0.22, 0.1);
    // Se posa a los 700 ms.
    sumar(x, norm(conEnvolvente(lp(blanco(0.08), 1400), caida(0.002, 0.07))), 0.7, 0.6);
    for (let k = 0; k < 6; k++) sumar(x, granoBurbuja(entre(180, 450), 0.06), 0.7 + entre(0, 0.15), 0.3);
    const gas = bp(blanco(0.9), 2000, 0.7);
    let g = 1, prox = 0;
    for (let i = 0; i < gas.length; i++) { if (i >= prox) { g = entre(0.4, 1); prox = i + muestras(1 / entre(6, 14)); } gas[i] *= g * Math.min(1, i / (SR * 0.05)) * Math.pow(10, -3 * (i / SR) / 0.9); }
    sumar(x, norm(gas), 0.7, 0.45);
    return x;
  } },
  maldicion: { nivel: -15, fn: () => {
    const x = mezcla(1.95);
    const dron = vacio(1.2);
    for (const f of [55, 58.3, 82.4]) sumar(dron, osc(1.2, f, 'sierra'), 0, 0.33);
    for (let i = 0; i < dron.length; i++) dron[i] *= (0.8 + 0.2 * Math.sin(2 * Math.PI * 5 * i / SR));
    sumar(x, norm(conEnvolvente(lp(dron, 500), curva([[0, 0], [1.1, 1, 1.4], [1.16, 0]]))), 0, 0.5);
    const sus = bp(blanco(1.1), 2500, 0.6);
    let g = 0, prox = 0;
    for (let i = 0; i < sus.length; i++) { if (i >= prox) { g = R() < 0.6 ? entre(0.4, 1) : 0.05; prox = i + muestras(1 / entre(6, 9)); } sus[i] *= g; }
    sumar(x, norm(conEnvolvente(sus, campanaEnv(1.1, 0.6, 1, 1))), 0, 0.18);
    sumar(x, norm(conEnvolvente(bp(rosa(0.25), curva([[0, 400], [0.25, 2600, 'exp']]), 1.2), curva([[0, 0], [0.24, 1, 2], [0.25, 0]]))), 0.9, 0.35);
    // El sello se cierra a los 1150 ms.
    sumar(x, capaGolpe({ f0: 90, f1: 35, t60: 0.3, chasquido: 0.5, ruido: 0.6 }), 1.15, 0.7);
    sumar(x, capaBrillo(0.65, [curva([[0, 600], [0.65, 1800, 'exp']]), curva([[0, 760], [0.65, 2200, 'exp']])], caida(0.02, 0.6), [5, 8]), 1.15, 0.2);
    return reverb(x, { sala: 0.8, humedo: 0.26, cola: 0.9 });
  } },
  rayo_solar: { nivel: -14, fn: () => {
    const x = mezcla(1.75);
    sumar(x, capaBrillo(0.65, [880, 1320, 1760, 2640], curva([[0, 0], [0.63, 1, 1.5], [0.65, 0.3]]), [16, 22]), 0, 0.3);
    // Las tres columnas: 650, 850 y 1050 ms (pxRayoSolar).
    for (let k = 0; k < 3; k++) {
      const t0 = 0.65 + k * 0.2, z = vacio(0.4);
      sumar(z, osc(0.4, 180, 'sierra'), 0, 0.6); sumar(z, osc(0.4, 362, 'sierra'), 0, 0.3);
      sumar(x, norm(conEnvolvente(bp(z, 1500, 0.7), caida(0.002, 0.3))), t0, 0.5);
      sumar(x, norm(conEnvolvente(hp(blanco(0.05), 3000), caida(0.001, 0.04))), t0, 0.45);
      sumar(x, capaGolpe({ f0: 130, f1: 60, t60: 0.15, chasquido: 0.2, ruido: 0.4 }), t0, 0.45);
      sumar(x, norm(conEnvolvente(hp(blanco(0.45), 5000), caida(0.01, 0.4))), t0 + 0.02, 0.15);
    }
    return reverb(x, { sala: 0.6, humedo: 0.14, cola: 0.6 });
  } },
  zarpazo: { nivel: -14, fn: () => {
    const x = mezcla(1.0);
    sumar(x, grunido(0.36, 130, 100, 0.75, 0.6), 0, 0.6);
    sumar(x, capaSoplido(0.22, 500, 1500, 900, { q: 1, picoFr: 0.6 }), 0.16, 0.3);
    // Los tres tajos, a los 380 ms (pxZarpazo).
    for (let k = 0; k < 3; k++) sumar(x, tajo(1 + k * 0.08), 0.38 + k * 0.04, 0.8);
    sumar(x, capaGolpe({ f0: 100, f1: 55, t60: 0.14, chasquido: 0.1, ruido: 0.6, corte: 900 }), 0.42, 0.45);
    return x;
  } },
  tajos: { nivel: -14, fn: () => {
    const x = mezcla(0.6);
    sumar(x, grunido(0.25, 150, 110, 0.75, 0.6), 0, 0.5);
    for (let k = 0; k < 3; k++) sumar(x, tajo(1 + k * 0.08), 0.03 + k * 0.04, 0.8);
    return x;
  } },
  emboscada: { nivel: -17, fn: () => {
    const x = mezcla(0.7);
    esparcir(x, 40, 0, 0.5, granoHoja, 0.7, 1.4);
    sumar(x, capaSoplido(0.4, 800, 2500, 1200, { q: 1, picoFr: 0.3 }), 0, 0.4);
    return x;
  } },
  vendaval: { nivel: -15, fn: () => {
    const s = 2.0, x = mezcla(s), r = rosa(s);
    const f1 = curva([[0, 380], [0.6, 650], [1.2, 420], [2.0, 560]]), f2 = curva([[0, 1000], [0.5, 1500], [1.3, 950], [2.0, 1300]]);
    sumar(x, bp(r, f1, 3), 0, 1); sumar(x, bp(r, f2, 3), 0, 0.6);
    sumar(x, bp(blanco(s), curva([[0, 1300], [1.0, 1700], [2.0, 1400]]), 15), 0, 0.25);
    for (let i = 0; i < x.length; i++) {
      const t = i / SR;
      x[i] *= (0.65 + 0.35 * Math.sin(2 * Math.PI * 2.2 * t)) * curva([[0, 0], [0.15, 1, 0.8], [1.65, 0.9], [2.0, 0]])(t);
    }
    sumar(x, capaRetumbo(s, 120, curva([[0, 0], [0.3, 1], [1.7, 0.8], [2.0, 0]]), 3), 0, 0.2);
    return x;
  } },
  erupcion: { nivel: -13, fn: () => {
    const x = mezcla(2.2);
    sumar(x, capaRetumbo(2.1, 140, curva([[0, 0], [0.8, 1, 1.3], [1.5, 0.7], [2.1, 0]]), 6), 0, 0.55);
    esparcir(x, 25, 0, 2.0, () => granoBurbuja(entre(60, 220)), 0.35);
    // Los tres géiseres: 800, 960 y 1120 ms (pxErupcion).
    for (let k = 0; k < 3; k++) {
      const t0 = 0.8 + k * 0.16;
      sumar(x, norm(conEnvolvente(lp(blanco(0.6), 2500), caida(0.005, 0.5))), t0, 0.6);
      sumar(x, capaGolpe({ f0: 100, f1: 40, t60: 0.25, chasquido: 0.4, ruido: 0.5 }), t0, 0.45);
      sumar(x, capaChispas(0.4, 60), t0 + 0.05, 0.3);
      sumar(x, norm(conEnvolvente(hp(blanco(0.6), 3000), caida(0.02, 0.6))), t0 + 0.05, 0.18);
    }
    return reverb(x, { sala: 0.7, humedo: 0.14, cola: 0.6 });
  } },
  meteoro: { nivel: -12, fn: () => {
    const x = mezcla(2.2);
    const viene = bp(rosa(1.15), curva([[0, 3000], [1.15, 500, 'exp']]), 1.2);
    sumar(x, norm(conEnvolvente(viene, curva([[0, 0.05], [1.12, 1, 'exp'], [1.15, 0.3]]))), 0, 0.5);
    sumar(x, capaChispas(1.15, curva([[0, 20], [1.15, 160, 'exp']]), curva([[0, 0.2], [1.15, 1]])), 0, 0.25);
    sumar(x, capaRetumbo(1.15, 200, curva([[0, 0], [1.1, 1, 2], [1.15, 0.5]]), 5), 0, 0.35);
    // Cae a los 1150 ms (pxMeteoro).
    const t0 = 1.15;
    sumar(x, capaGolpe({ f0: 120, f1: 30, t60: 0.6, chasquido: 1, ruido: 1, corte: 4000 }), t0, 0.9);
    sumar(x, norm(conEnvolvente(lp(blanco(0.8), curva([[0, 6000], [0.7, 300, 'exp']])), caida(0.002, 0.7))), t0, 0.55);
    sumar(x, capaEscombros(0.9, 14), t0 + 0.01, 0.35);
    sumar(x, capaChispas(0.7, curva([[0, 120], [0.7, 10]])), t0 + 0.02, 0.2);
    return reverb(x, { sala: 0.85, humedo: 0.18, cola: 0.9 });
  } },
  esporas: { nivel: -16, fn: () => {
    const x = mezcla(1.5);
    sumar(x, norm(conEnvolvente(bp(rosa(0.46), curva([[0, 600], [0.45, 1800, 'exp']]), 1), curva([[0, 0], [0.44, 1, 2], [0.46, 0]]))), 0, 0.3);
    // Revienta a los 480 ms (pxEsporas).
    sumar(x, norm(conEnvolvente(lp(rosa(0.45), 1000), caida(0.004, 0.35))), 0.48, 0.9);
    sumar(x, capaGolpe({ f0: 90, f1: 50, t60: 0.12, chasquido: 0, ruido: 0.5, corte: 600 }), 0.48, 0.4);
    sumar(x, norm(conEnvolvente(hp(blanco(0.95), 4500), caida(0.02, 0.9))), 0.49, 0.25);
    esparcir(x, 6, 0.5, 1.0, () => granoBurbuja(entre(1100, 2200), 0.02), 0.2);
    return x;
  } },
  brote: { nivel: -16, fn: () => {
    const x = mezcla(1.1);
    // Tres setas: a los 420, 550 y 680 ms (pxBrote).
    for (let k = 0; k < 3; k++) {
      const t0 = 0.42 + k * 0.13;
      sumar(x, capaGolpe({ f0: 120, f1: 70, t60: 0.06, chasquido: 0.1, ruido: 0.5, corte: 800 }), t0, 0.6);
      esparcir(x, 4, t0, t0 + 0.03, granoGrava, 0.3);
      sumar(x, norm(conEnvolvente(osc(0.09, curva([[0, 220], [0.09, 700, 'exp']]), 'seno'), campanaEnv(0.09, 0.3, 1, 1))), t0 + 0.01, 0.45);
      sumar(x, norm(conEnvolvente(bp(blanco(0.09), curva([[0, 400], [0.09, 1400, 'exp']]), 3), campanaEnv(0.09, 0.3, 1, 1))), t0 + 0.01, 0.2);
    }
    return x;
  } },

  // ── LOS JEFES (gf-jefes.js) ────────────────────────────────────────────────
  jefe_rugido: { nivel: -12, fn: () => {
    const x = mezcla(2.3);
    sumar(x, capaVoz({ s: 2.1, f0: curva([[0, 75], [0.3, 112, 'exp'], [1.2, 100], [2.1, 55, 'exp']]), env: campanaEnv(2.1, 0.15, 1.1, 1.3), jitter: 0.035,
                       aspereza: 0.55, aspFrec: 32, sub: 0.65, aliento: 0.45, tracto: 0.6, vocales: [[0, 'o'], [0.3, 'a'], [1.5, 'a'], [2.1, 'o']], saturacion: 2.8, brillo: 3200 }), 0, 1);
    sumar(x, capaRetumbo(2.1, 110, campanaEnv(2.1, 0.2, 1, 1.3), 5), 0, 0.35);
    return reverb(x, { sala: 0.9, humedo: 0.22, cola: 1.3, pre: 0.025 });
  } },
  jefe_nova: { nivel: -12, fn: () => {
    // Dos anillos: a los 0 y a los 160 ms (gf-jefes.js, nova).
    const x = mezcla(1.5);
    const sub = osc(1.0, curva([[0, 85], [0.5, 30, 'exp'], [1.0, 28]]), 'seno');
    sumar(x, saturar(norm(conEnvolvente(sub, caida(0.002, 0.8))), 1.8), 0, 0.8);
    sumar(x, capaGolpe({ f0: 140, f1: 40, t60: 0.4, chasquido: 0.7, ruido: 0.7 }), 0, 0.6);
    sumar(x, capaSoplido(0.75, 300, 2500, 800, { q: 0.9, picoFr: 0.15 }), 0, 0.4);
    sumar(x, capaSoplido(0.6, 400, 2200, 700, { q: 0.9, picoFr: 0.15 }), 0.16, 0.3);
    sumar(x, capaBrillo(0.8, [1800, 2700, 3600], caida(0.01, 0.8), [10, 18]), 0, 0.15);
    return reverb(x, { sala: 0.85, humedo: 0.2, cola: 1.0 });
  } },
  jefe_pincho: { nivel: -14, fn: () => {
    const x = mezcla(0.8);
    sumar(x, capaEscombros(0.4, 6), 0, 0.35);
    sumar(x, norm(conEnvolvente(hp(blanco(0.015), 2000), caida(0.0005, 0.012))), 0.01, 0.7);
    sumar(x, norm(modal(0.3, [{ f: 1300, t60: 0.12 }, { f: 2200, t60: 0.09, a: 0.6 }, { f: 3700, t60: 0.06, a: 0.35 }])), 0.01, 0.5);
    sumar(x, capaGolpe({ f0: 130, f1: 60, t60: 0.12, chasquido: 0.3, ruido: 0.5 }), 0.01, 0.6);
    return reverb(x, { sala: 0.6, humedo: 0.12, cola: 0.4 });
  } },
  jefe_impacto: { nivel: -12, fn: () => {
    const x = mezcla(1.4);
    const sub = osc(1.1, curva([[0, 70], [0.5, 28, 'exp'], [1.1, 26]]), 'seno');
    sumar(x, saturar(norm(conEnvolvente(sub, caida(0.002, 0.9))), 2), 0, 0.85);
    sumar(x, golpeRoca(0.5), 0, 0.8);
    sumar(x, capaEscombros(1.2, 20), 0.02, 0.35);
    return reverb(x, { sala: 0.85, humedo: 0.18, cola: 0.9 });
  } },
  jefe_orbes: { nivel: -15, fn: () => {
    const x = mezcla(1.3);
    sumar(x, capaBrillo(0.35, [curva([[0, 700], [0.35, 1400, 'exp']]), curva([[0, 1050], [0.35, 2100, 'exp']])], campanaEnv(0.35, 0.85, 1.6, 0.6), [10, 14]), 0, 0.35);
    [523, 622, 698, 784, 932, 1047].forEach((f, k) => {
      const t0 = 0.3 + k * 0.04;
      sumar(x, capaSoplido(0.2, 600, 1800, 900, { q: 1.4, picoFr: 0.3 }), t0, 0.3);
      sumar(x, nota(f, 0.7, [[1, 1], [2, 0.4], [3, 0.15]]), t0, 0.3);
    });
    return reverb(x, { sala: 0.8, humedo: 0.28, cola: 0.9 });
  } },

  // ── LA SERPIENTE DE MAGMA DE LA MINA (gf-mina-serpiente.js) ────────────────
  serpiente_grito: { nivel: -13, fn: () => {
    const x = mezcla(1.9);
    sumar(x, capaVoz({ s: 1.75, f0: curva([[0, 85], [0.25, 120, 'exp'], [1.0, 100], [1.75, 55, 'exp']]), env: campanaEnv(1.75, 0.15, 1.1, 1.3), jitter: 0.03,
                       aspereza: 0.55, aspFrec: 34, sub: 0.5, aliento: 0.5, tracto: 0.6, vocales: [[0, 'o'], [0.3, 'a'], [1.3, 'o'], [1.75, 'u']], saturacion: 2.5, brillo: 3000 }), 0, 0.9);
    sumar(x, norm(conEnvolvente(hp(bp(blanco(1.6), 4500, 1), 2500), campanaEnv(1.6, 0.3, 1, 1.2))), 0.05, 0.3);
    return reverb(x, { sala: 0.78, humedo: 0.22, cola: 1.0 });
  } },
  serpiente_aliento: { nivel: -14, fn: () => {
    const s = 1.2, x = mezcla(s);
    sumar(x, norm(conEnvolvente(bp(rosa(s), curva([[0, 300], [0.5, 1800, 'exp'], [s, 500, 'exp']]), 0.6), campanaEnv(s, 0.12, 1, 1.2))), 0, 0.8);
    sumar(x, norm(conEnvolvente(lp(rosa(s), 700), campanaEnv(s, 0.15, 1, 1.1))), 0, 0.5);
    sumar(x, capaChispas(s, curva([[0, 40], [0.4, 140], [s, 30]])), 0, 0.25);
    return x;
  } },
  serpiente_golpe: { nivel: -13, fn: () => {
    // El mordisco de la serpiente de magma: mandíbulas de roca, siseo y el golpe.
    const x = mezcla(1.0);
    const mandibula = (k) => norm(modal(0.09, [{ f: 520 * k, t60: 0.05 }, { f: 1270 * k, t60: 0.035, a: 0.6 }, { f: 2300 * k, t60: 0.02, a: 0.35 }]));
    sumar(x, mandibula(1), 0, 0.8);
    sumar(x, mandibula(0.92), 0.05, 0.6);
    sumar(x, capaGolpe({ f0: 120, f1: 45, t60: 0.3, chasquido: 0.5, ruido: 0.7 }), 0, 0.7);
    sumar(x, norm(conEnvolvente(hp(bp(blanco(0.6), 4500, 1), 2500), caida(0.01, 0.5))), 0.03, 0.3);
    sumar(x, capaEscombros(0.5, 6, { fMin: 400, fMax: 1600 }), 0.01, 0.25);
    return reverb(x, { sala: 0.7, humedo: 0.14, cola: 0.6 });
  } },

  // ── LO QUE FALTABA ─────────────────────────────────────────────────────────
  nieve_lanza: { nivel: -15, fn: () => {
    // El yeti coge nieve, la aprieta y la lanza a los 350 ms (golemRoca).
    const x = mezcla(1.0);
    sumar(x, grunido(0.32, 95, 72, 0.7), 0, 0.45);
    let t = 0.02;
    while (t < 0.3) { sumar(x, norm(bp(conEnvolvente(blanco(0.012), campanaEnv(0.012, 0.2, 1, 1)), entre(1300, 3200), 0.7)), t, entre(0.4, 1)); t += entre(0.025, 0.05); }
    sumar(x, capaGolpe({ f0: 90, f1: 55, t60: 0.08, chasquido: 0, ruido: 0.7, corte: 900 }), 0.3, 0.3);
    sumar(x, capaSoplido(0.4, 300, 1200, 500, { q: 1.1, picoFr: 0.3, aire: 0.2 }), 0.35, 0.55);
    return x;
  } },
  aleteo: { nivel: -16, fn: () => {
    // Alas de cuero (murciélagos, polillas, el dragón): cuatro batidas.
    const x = mezcla(0.6);
    for (let k = 0; k < 4; k++) {
      const t0 = k * 0.11 * entre(0.95, 1.05), d = 0.09;
      const w = lp(rosa(d), curva([[0, 500], [d * 0.4, 1400, 'exp'], [d, 400, 'exp']]), 0.8);
      sumar(x, norm(conEnvolvente(w, campanaEnv(d, 0.35, 1.2, 1.4))), t0, 1 - k * 0.12);
      sumar(x, norm(conEnvolvente(bp(blanco(d), 2600, 1.2), campanaEnv(d, 0.5, 1, 1))), t0 + 0.01, 0.15);
      sumar(x, capaGolpe({ f0: 100, f1: 60, t60: 0.05, chasquido: 0, ruido: 0.4, corte: 600 }), t0 + d * 0.4, 0.3);
    }
    return x;
  } },
  alma_carga: { nivel: -16, fn: () => {
    // Los rayos de alma (espectro, nigromante): 900 ms que suben.
    const s = 1.0, x = mezcla(s);
    sumar(x, capaSoplido(0.95, 300, 1600, 2400, { q: 1.4, picoFr: 0.9, aire: 0.3 }), 0, 0.45);
    for (const f of [220, 277, 330]) sumar(x, norm(conEnvolvente(osc(s, curva([[0, f * 0.9], [0.9, f * 1.06, 'exp']]), 'triangulo'), curva([[0, 0], [0.88, 1, 1.5], [s, 0]]))), 0, 0.13);
    const sus = bp(blanco(0.9), 2600, 0.6);
    let g = 0, prox = 0;
    for (let i = 0; i < sus.length; i++) { if (i >= prox) { g = R() < 0.6 ? entre(0.4, 1) : 0.05; prox = i + muestras(1 / entre(7, 11)); } sus[i] *= g; }
    sumar(x, norm(conEnvolvente(sus, curva([[0, 0], [0.85, 1, 1.4], [0.9, 0]]))), 0, 0.18);
    return reverb(x, { sala: 0.8, humedo: 0.25, cola: 0.5 });
  } },
  alma_golpe: { nivel: -14, fn: () => {
    const x = mezcla(1.6);
    sumar(x, capaGolpe({ f0: 110, f1: 38, t60: 0.45, chasquido: 0.4, ruido: 0.5, corte: 1500 }), 0, 0.8);
    sumar(x, norm(conEnvolvente(bp(rosa(0.25), curva([[0, 3000], [0.25, 500, 'exp']]), 1.2), caida(0.003, 0.22))), 0, 0.5);
    sumar(x, capaVoz({ s: 1.1, f0: curva([[0, 620], [0.3, 480, 'exp'], [1.1, 300, 'exp']]), env: caida(0.02, 1.0), vibrato: [7, 0.025], jitter: 0.006,
                       aliento: 0.25, brillo: 1300, tracto: 1.1, vocales: [[0, 'o'], [1.1, 'u']], pecho: 0.1 }), 0.02, 0.35);
    return reverb(x, { sala: 0.88, humedo: 0.35, amort: 0.3, cola: 1.0 });
  } },
  hielo_carga: { nivel: -16, fn: () => {
    // Los rayos de hielo: escarcha que cruje y se cierra en 900 ms.
    const s = 1.0, x = mezcla(s);
    let t = 0;
    while (t < 0.9) { const u = t / 0.9; sumar(x, granoHielo(), t, 0.25 + 0.75 * u); t += 1 / (12 + 60 * u * u); }
    sumar(x, capaBrillo(0.9, [curva([[0, 2400], [0.9, 3800, 'exp']]), curva([[0, 3300], [0.9, 5200, 'exp']])], curva([[0, 0], [0.88, 1, 1.6], [0.9, 0.2]]), [14, 22]), 0, 0.22);
    sumar(x, capaSoplido(0.9, 1500, 4000, 6000, { q: 1.5, picoFr: 0.9, aire: 0.3 }), 0, 0.25);
    return x;
  } },
  hielo_golpe: { nivel: -14, fn: () => {
    const x = mezcla(1.4);
    sumar(x, capaGolpe({ f0: 150, f1: 50, t60: 0.3, chasquido: 0.9, ruido: 0.5 }), 0, 0.8);
    sumar(x, norm(hp(chasquido(0.008), 3000)), 0, 0.6);
    esparcir(x, 22, 0, 0.35, granoHielo, 0.6, 1.6);
    sumar(x, norm(modal(0.9, [{ f: 3100, t60: 0.7, fase: 0 }, { f: 4700, t60: 0.5, a: 0.6, fase: 0 }])), 0.01, 0.12);
    return reverb(x, { sala: 0.7, humedo: 0.18, cola: 0.7 });
  } },
  hoja_carga: { nivel: -17, fn: () => {
    // Los rayos de hojas (dríada, bruja de la ciénaga, espantapájaros).
    const s = 1.0, x = mezcla(s);
    const remo = bp(rosa(0.92), curva([[0, 500], [0.9, 1800, 'exp']]), 1.4);
    const env = curva([[0, 0], [0.88, 1, 1.4], [0.92, 0]]);
    for (let i = 0; i < remo.length; i++) { const tt = i / SR; remo[i] *= (0.6 + 0.4 * Math.sin(2 * Math.PI * (2 + 8 * tt) * tt)) * env(tt); }
    sumar(x, norm(remo), 0, 0.7);
    let t = 0.05;
    while (t < 0.9) { sumar(x, granoHoja(), t, 0.2 + 0.6 * t); t += 1 / (20 + 60 * t); }
    sumar(x, capaCrujido(0.5, curva([[0, 15], [0.5, 40]]), [[480, 10, 1], [1050, 8, 0.6]], curva([[0, 0], [0.45, 1], [0.5, 0]])), 0.4, 0.2);
    return x;
  } },
  hoja_golpe: { nivel: -15, fn: () => {
    const x = mezcla(1.0);
    sumar(x, norm(conEnvolvente(hp(blanco(0.02), 1500), caida(0.0005, 0.015))), 0, 0.7);      // el latigazo de la rama
    sumar(x, capaGolpe({ f0: 110, f1: 55, t60: 0.22, chasquido: 0.3, ruido: 0.6, corte: 1100 }), 0.005, 0.7);
    sumar(x, norm(modal(0.25, [{ f: 210, t60: 0.1, a: 1 }, { f: 470, t60: 0.07, a: 0.7 }, { f: 830, t60: 0.05, a: 0.45 }])), 0.005, 0.4);
    esparcir(x, 30, 0.01, 0.6, granoHoja, 0.45, 1.5);
    return reverb(x, { sala: 0.55, humedo: 0.12, cola: 0.4 });
  } },
  geiser: { nivel: -13, fn: () => {
    // Un géiser de magma de la serpiente: revienta, sube y cae en gotas.
    const x = mezcla(1.6);
    sumar(x, capaGolpe({ f0: 100, f1: 40, t60: 0.3, chasquido: 0.4, ruido: 0.5 }), 0, 0.6);
    sumar(x, norm(conEnvolvente(lp(blanco(1.0), curva([[0, 3200], [1.0, 600, 'exp']])), caida(0.008, 0.9))), 0, 0.65);
    sumar(x, capaChispas(1.0, curva([[0, 140], [1.0, 20]])), 0.02, 0.3);
    esparcir(x, 14, 0.1, 1.3, () => granoBurbuja(entre(70, 200)), 0.35);
    sumar(x, norm(conEnvolvente(hp(blanco(1.2), 3000), caida(0.02, 1.1))), 0.05, 0.15);
    return reverb(x, { sala: 0.6, humedo: 0.12, cola: 0.5 });
  } },

  // ── LOS DEMÁS DEL MOLDE ────────────────────────────────────────────────────
  embestida: { nivel: -16, fn: () => {
    const x = mezcla(0.6);
    sumar(x, capaSoplido(0.4, 400, 1600, 700, { q: 1.1, picoFr: 0.35 }), 0, 0.7);
    esparcir(x, 14, 0, 0.3, granoGrava, 0.3);
    sumar(x, grunido(0.2, 150, 120, 0.8, 0.5), 0, 0.35);
    return x;
  } }
};

// ===========================================================================
// TERMINAR Y ESCRIBIR
// ===========================================================================
/** Sonoridad: el RMS más alto en ventanas de 100 ms (sin graves de < 80 Hz). */
function sonoridad(x) {
  const y = hp(x, 80, 0.7), w = muestras(0.1), paso = muestras(0.025);
  let max = 0;
  for (let i = 0; i + w <= y.length || i === 0; i += paso) {
    let s = 0;
    const fin = Math.min(y.length, i + w);
    for (let j = i; j < fin; j++) s += y[j] * y[j];
    max = Math.max(max, Math.sqrt(s / Math.max(1, fin - i)));
    if (fin >= y.length) break;
  }
  return 20 * Math.log10(max + 1e-12);
}
function terminar(x, nivel, limite) {
  x = hp(hp(x, 30, 0.6), 30, 0.6);                      // nada por debajo de 30 Hz (ni continua)
  const techo = db(-1);
  const p = pico(x) || 1;
  const gSon = db(nivel - sonoridad(x)), gPico = (techo / p) * db(limite || 4); // como mucho 4 dB de limitador (o lo que diga la receta)
  escalar(x, Math.min(gSon, gPico));
  const umbral = techo * 0.8, resto = techo - umbral;
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i]);
    if (v > umbral) x[i] = Math.sign(x[i]) * (umbral + resto * Math.tanh((v - umbral) / resto));
  }
  let fin = x.length;
  const silencio = db(-62);
  while (fin > 1 && Math.abs(x[fin - 1]) < silencio) fin--;
  fin = Math.min(x.length, fin + muestras(0.02));
  x = x.slice(0, fin);
  const fi = Math.min(x.length, muestras(0.001)), fo = Math.min(x.length, muestras(0.02));
  for (let i = 0; i < fi; i++) x[i] *= i / fi;
  for (let i = 0; i < fo; i++) x[x.length - 1 - i] *= i / fo;
  return x;
}
function wav16(x) {
  const n = x.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const d = (R() - R()) / 32768;                       // dither triangular
    b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((x[i] + d) * 32767))), 44 + i * 2);
  }
  return b;
}
function generar(id) {
  R = azar(semillaDe('ataque:' + id));
  const def = SONIDOS[id];
  const crudo = def.fn();
  for (let i = 0; i < crudo.length; i++) if (!Number.isFinite(crudo[i])) throw new Error(id + ': muestra no finita en ' + i);
  const x = terminar(crudo, def.nivel, def.limite);
  return { id, x, nivel: def.nivel, seg: x.length / SR, son: sonoridad(x), pico: 20 * Math.log10(pico(x) || 1e-9) };
}

function main() {
  const args = process.argv.slice(2);
  const ids = Object.keys(SONIDOS);
  if (args.includes('--listar')) { ids.forEach((id) => console.log(id)); return; }
  const pedidos = args.filter((a) => !a.startsWith('--'));
  const lista = pedidos.length ? ids.filter((id) => pedidos.some((p) => id.includes(p))) : ids;
  if (!lista.length) { console.error('nada casa con', pedidos.join(' ')); process.exit(1); }
  fs.mkdirSync(DESTINO, { recursive: true });
  const t0 = Date.now(), manifiesto = { version: VERSION, sr: SR, bits: 16, canales: 1, sonidos: {} };
  const rutaM = path.join(DESTINO, 'ataques.json');
  if (pedidos.length && fs.existsSync(rutaM)) Object.assign(manifiesto.sonidos, JSON.parse(fs.readFileSync(rutaM, 'utf8')).sonidos || {});
  let bytes = 0, seg = 0;
  for (const id of lista) {
    const r = generar(id);
    const b = wav16(r.x);
    fs.writeFileSync(path.join(DESTINO, id + '.wav'), b);
    manifiesto.sonidos[id] = { seg: Math.round(r.seg * 1000) / 1000, nivel: r.nivel };
    bytes += b.length; seg += r.seg;
    console.log('  %s %s s  sonoridad %s dB  pico %s dB  %s KB', id.padEnd(18), r.seg.toFixed(2), r.son.toFixed(1), r.pico.toFixed(1), (b.length / 1024).toFixed(0));
  }
  const orden = {};
  Object.keys(manifiesto.sonidos).sort().forEach((k) => { orden[k] = manifiesto.sonidos[k]; });
  manifiesto.sonidos = orden;
  fs.writeFileSync(rutaM, JSON.stringify(manifiesto, null, 1) + '\n');
  console.log('%d sonidos, %s s, %s KB en %s (%s s)', lista.length, seg.toFixed(1), (bytes / 1024).toFixed(0), path.relative(RAIZ, DESTINO), ((Date.now() - t0) / 1000).toFixed(1));
}

if (require.main === module) main();
// wav16 va justo después de generar (sigue el mismo azar: el dither): así lo
// hace main y así puede tools/sonidos-ataque.test.cjs rehacer un WAV byte a byte.
module.exports = { SONIDOS, VERSION, SR, generar, wav16 };
