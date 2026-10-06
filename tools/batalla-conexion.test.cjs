'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function scene() {
  let now = 10000;
  const window = { setTimeout, clearTimeout };
  const context = { window, Phaser: { Scene: class {} }, console, performance: { now: () => now },
    document: {}, localStorage: { getItem: () => null } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../Scenes/BattleScene.js'), 'utf8'), context);
  const s = new window.BattleScene();
  const listeners = new Map();
  const sent = [];
  s.socket = { connected: true, on: (ev, fn) => listeners.set(ev, fn), emit: (ev, d) => sent.push([ev, d]) };
  s.socket.volatile = { emit: (ev, d) => sent.push([ev, d, 'volatile']) };
  Object.assign(s, { _listeners: [], _battleRun: 1, _cleaned: false, estado: 'buscando', modo: 'pvp',
    matchId: null, el: {}, _hud: {}, _intentoPeticion: 0, _busquedaDesde: 0 });
  const clocks = [];
  s._reloj = (ms, fn) => clocks.push({ ms, fn });
  s.estadoBusqueda = () => {};
  s.volverEnBreve = () => {};
  s._cancelarConfirmacion = () => {};
  s.aviso = () => {};
  s.registrarSocket();
  return { s, listeners, sent, clocks, advance: ms => { now += ms; } };
}
test('reconectar durante la búsqueda vuelve a pedir la cola', () => {
  const { s, listeners, sent } = scene();
  s._pedirPartida(); s._respuestaCola = true;
  listeners.get('disconnect')();
  assert.equal(s._respuestaCola, false);
  listeners.get('connect')();
  assert.equal(sent.filter(([ev]) => ev === 'brawl:cola').length, 2);
});
test('el plazo de una solicitud anterior no cancela un reintento nuevo', () => {
  const { s, sent, clocks } = scene();
  s._pedirPartida(); clocks[0].fn();
  const deadline = clocks.find(c => c.ms === 20000);
  s._pedirPartida(); deadline.fn();
  assert.equal(s.estado, 'buscando');
  assert.equal(sent.some(([ev]) => ev === 'brawl:salir'), false);
});
test('si realmente vence el plazo se cancela también la admisión pendiente', () => {
  const { s, sent, clocks } = scene();
  s._pedirPartida(); clocks[0].fn(); clocks.find(c => c.ms === 20000).fn();
  assert.equal(s.estado, 'fin');
  assert.equal(sent.some(([ev]) => ev === 'brawl:salir'), true);
});
test('una cuenta atrás sin datos pide resincronización', () => {
  const { s, sent } = scene();
  s.estado = 'cuenta'; s.matchId = 'm1'; s._ultimoSnap = 5000;
  s._vigilarConexion(10000);
  assert.equal(sent.some(([ev]) => ev === 'brawl:volver'), true);
  assert.equal(s.estado, 'cuenta');
});
test('las posiciones son volátiles y no se acumulan sin conexión', () => {
  const { s, sent } = scene();
  Object.assign(s, { pred: { x: 10, y: 20 }, apunte: { ang: 0 }, seq: 0, cAplicada: 0,
    envioX: NaN, envioY: NaN, ultimoEnvio: 0, ultimoLatido: 0 });
  s._enviarPosicion(10000);
  assert.equal(sent[0][0], 'brawl:mover'); assert.equal(sent[0][2], 'volatile');
  s.socket.connected = false; s.pred.x++;
  s._enviarPosicion(11000);
  assert.equal(sent.length, 1);
});
test('reintentar la búsqueda no acumula plazos PvP y practicar invalida el anterior', () => {
  const { s, sent, clocks } = scene();
  s._pedirPartida(); s._pedirPartida();
  assert.equal(clocks.filter(c => c.ms === 240000).length, 1);
  s.modo = 'practica'; clocks.find(c => c.ms === 240000).fn();
  assert.equal(sent.some(([ev]) => ev === 'brawl:salirCola'), false);
});
