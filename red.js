/* red.js — "Red y RPC" del centro de control (2026-11-10).
   Lee la red en marcha (GET /api/admin/red), prueba una red sin guardarla
   (POST /api/admin/red/probar) y la guarda (POST /api/admin/red). Ninguna red se guarda
   sin pasar antes la prueba, y una migración (otra cadena u otros contratos) pide escribir
   MIGRAR. Todo lo que viene del servidor se pinta con textContent. */
(function () {
  'use strict';
  const op = window.GFOperations, { $, el } = op;
  let estado = null, tocado = false;

  op.onReset(() => {
    estado = null; tocado = false;
    ['red-marcha', 'red-prueba-rpcs', 'red-prueba-extra', 'red-prueba-avisos', 'red-historial'].forEach((id) => $(id).replaceChildren());
    $('red-prueba-card').hidden = true;
  });

  const fecha = (v) => v ? new Date(v).toLocaleString('es-EC') : '—';
  const lineas = (v) => String(v || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  const host = (u) => { try { return new URL(u).host; } catch (_) { return String(u || ''); } };
  const FUENTES = { defecto: 'por defecto', entorno: 'variable del servidor', panel: 'centro de control' };

  function leerFormulario() {
    return {
      nombre: $('red-nombre').value.trim(),
      entorno: $('red-entorno').value,
      chainId: Number($('red-chain').value.trim()),
      rpcServidor: lineas($('red-rpc-servidor').value),
      rpcPublico: lineas($('red-rpc-publico').value),
      explorerUrl: $('red-explorer').value.trim(),
      moneda: { simbolo: $('red-mon-simbolo').value.trim(), nombre: $('red-mon-nombre').value.trim(), decimales: Number($('red-mon-dec').value.trim()) },
      contratoItems: $('red-items').value.trim(),
      contratoMensajes: $('red-mensajes').value.trim()
    };
  }
  function rellenar(c) {
    if (!c) return;
    $('red-nombre').value = c.nombre || '';
    $('red-entorno').value = ['testnet', 'mainnet', 'devnet'].includes(c.entorno) ? c.entorno : 'testnet';
    $('red-chain').value = c.chainId != null ? String(c.chainId) : '';
    $('red-rpc-servidor').value = (c.rpcServidor || []).join('\n');
    $('red-rpc-publico').value = (c.rpcPublico || []).join('\n');
    $('red-explorer').value = c.explorerUrl || '';
    $('red-mon-simbolo').value = (c.moneda && c.moneda.simbolo) || '';
    $('red-mon-nombre').value = (c.moneda && c.moneda.nombre) || '';
    $('red-mon-dec').value = c.moneda && c.moneda.decimales != null ? String(c.moneda.decimales) : '';
    $('red-items').value = c.contratoItems || '';
    $('red-mensajes').value = c.contratoMensajes || '';
    $('red-confirmar').value = '';
    tocado = false;
    revisarMigracion();
  }
  /** ¿El formulario cambia la cadena o algún contrato respecto a la red en marcha? */
  function esMigracion(c) {
    const m = estado && estado.enMarcha;
    if (!m) return false;
    return Number(c.chainId) !== Number(m.chainId) ||
      String(c.contratoItems).toLowerCase() !== String(m.contratoItems).toLowerCase() ||
      String(c.contratoMensajes).toLowerCase() !== String(m.contratoMensajes).toLowerCase();
  }
  function revisarMigracion() { $('red-migracion').hidden = !esMigracion(leerFormulario()); }

  function dato(titulo, valor, nota) {
    const d = el('div', null, 'red-dato');
    d.append(el('span', titulo), el('strong', valor == null || valor === '' ? '—' : valor));
    if (nota) d.append(el('small', nota));
    return d;
  }
  function pintarEstado() {
    const m = estado.enMarcha, host2 = $('red-marcha');
    host2.replaceChildren(
      dato('Red', m.nombre + ' · ' + m.entorno, 'Cadena ' + m.chainId + ' (0x' + Number(m.chainId).toString(16) + ')'),
      dato('RPC en uso', host(m.rpcActivo), m.rpcActivo !== m.rpcServidor[0] ? 'De respaldo: el principal falló' : 'El principal'),
      dato('RPC del servidor', m.rpcServidor.map(host).join(' → ')),
      dato('RPC públicos', m.rpcPublico.map(host).join(', ')),
      dato('Explorador', host(m.explorerUrl)),
      dato('Moneda', m.moneda.simbolo + ' · ' + m.moneda.nombre, m.moneda.decimales + ' decimales'),
      dato('Contrato de objetos', m.contratoItems),
      dato('Contrato de mensajes', m.contratoMensajes),
      dato('Relayer', estado.relayer || 'sin configurar'),
      dato('Revisión', String(m.revision || 0), estado.guardada ? 'Guardada por ' + (estado.guardada.actualizadoPor || '—') + ' · ' + fecha(estado.guardada.actualizadoEn) : 'Nunca se guardó desde aquí')
    );
    if (m.ultimoFallo) host2.append(dato('Último fallo de un RPC', host(m.ultimoFallo.url), m.ultimoFallo.motivo + ' · ' + fecha(m.ultimoFallo.en)));
    const f = estado.fuentes || {};
    $('red-fuentes').textContent = 'De dónde sale cada valor al arrancar: ' +
      ['chainId', 'rpcServidor', 'rpcPublico', 'explorerUrl', 'contratoItems'].map((k) => k + ': ' + (FUENTES[f[k]] || f[k] || '—')).join(' · ') +
      (estado.fija ? ' · GF_RED_FIJA=1: lo guardado aquí no se aplica al arrancar.' : '') +
      (estado.lecturaAlArrancar && estado.lecturaAlArrancar !== 'ok' ? ' · Al arrancar no se pudo leer lo guardado (' + estado.lecturaAlArrancar + ').' : '');
    const p = estado.pendienteReinicio, aviso = $('red-pendiente');
    aviso.hidden = !p;
    aviso.replaceChildren();
    if (p) {
      aviso.append(el('strong', 'Migración guardada, pendiente de reinicio. '),
        document.createTextNode('La revisión ' + (p.revision || '') + ' cambia a la cadena ' + p.chainId + ' con el contrato ' + p.contratoItems +
          '. Entra al reiniciar el servidor (Railway → Restart). Hasta entonces todo sigue en la red de arriba.'));
    }
  }
  function pintarHistorial() {
    const h = estado.historial || [], host2 = $('red-historial');
    host2.replaceChildren();
    $('red-historial-vacio').hidden = h.length > 0;
    for (const fila of h) {
      const c = fila.cfg || {};
      const d = el('div', null, 'red-hist'), t = el('div');
      t.append(el('strong', 'Revisión ' + fila.revision + (fila.migra ? ' · migración' : '')),
        el('small', fecha(fila.en) + ' · ' + (fila.por || '—')),
        el('small', (c.nombre || '') + ' · cadena ' + c.chainId + ' · RPC ' + (c.rpcServidor || []).map(host).join(' → ') + ' · ' + host(c.explorerUrl)));
      const b = el('button', 'Cargar'); b.type = 'button';
      b.addEventListener('click', () => { rellenar(c); op.notice('Revisión ' + fila.revision + ' cargada en el formulario. Revisa y pulsa “Probar y guardar”.'); });
      d.append(t, b); host2.append(d);
    }
  }
  function pintarPrueba(p) {
    $('red-prueba-card').hidden = false;
    $('red-prueba-cuando').textContent = (p.ok ? '✔ La red responde bien' : '✖ La red NO pasa la prueba') + ' · ' + fecha(p.en);
    $('red-prueba-cuando').className = p.ok ? 'red-ok' : 'red-mal';
    const tb = $('red-prueba-rpcs'); tb.replaceChildren();
    for (const r of p.rpcs || []) {
      const tr = el('tr');
      tr.append(el('td', r.url, 'red-mono'), el('td', [r.servidor ? 'servidor' : '', r.publico ? 'público' : ''].filter(Boolean).join(' + ')),
        el('td', r.chainId != null ? String(r.chainId) : '—'), el('td', r.bloque != null ? r.bloque.toLocaleString('es-EC') : '—'),
        el('td', r.ms != null ? r.ms + ' ms' : '—'), el('td', r.ok ? '✔ bien' : '✖ ' + (r.error || 'falla'), r.ok ? 'red-ok' : 'red-mal'));
      tb.append(tr);
    }
    const ex = $('red-prueba-extra'); ex.replaceChildren();
    const c = p.contratos || {};
    const contrato = (x) => !x ? '—' : x.ok ? '✔ ' + x.bytes + ' bytes de código' : '✖ ' + (x.error || 'no responde');
    ex.append(dato('Contrato de objetos', contrato(c.items)), dato('Contrato de mensajes', contrato(c.mensajes)));
    if (p.relayer) ex.append(dato('Relayer en esa red', p.relayer.error ? '✖ ' + p.relayer.error : p.relayer.saldo + ' de saldo', 'Nonce ' + (p.relayer.nonce != null ? p.relayer.nonce : '—') + ' · ' + p.relayer.address));
    if (p.explorador) ex.append(dato('Explorador', p.explorador.ok ? '✔ responde (' + p.explorador.estado + ')' : '✖ ' + (p.explorador.error || 'HTTP ' + p.explorador.estado), p.explorador.ms != null ? p.explorador.ms + ' ms' : ''));
    const av = $('red-prueba-avisos'); av.replaceChildren();
    for (const a of p.avisos || []) av.append(el('li', a));
  }

  async function load() {
    const data = await op.request('/api/admin/red');
    if (!op.active) return;
    estado = data;
    pintarEstado();
    pintarHistorial();
    if (!tocado) rellenar(estado.guardada && !estado.pendienteReinicio ? { ...estado.enMarcha, ...estado.guardada.cfg } : estado.enMarcha);
    op.notice('');
  }
  async function probar(cfg) {
    const r = await op.request('/api/admin/red/probar', { method: 'POST', body: JSON.stringify({ cfg }) });
    pintarPrueba(r.prueba);
    return r;
  }
  function validarLocal(c) {
    const fallos = [];
    if (!c.nombre) fallos.push('el nombre');
    if (!Number.isSafeInteger(c.chainId) || c.chainId < 1) fallos.push('el id de la cadena');
    if (!c.rpcServidor.length) fallos.push('un RPC del servidor');
    if (!c.rpcPublico.length) fallos.push('un RPC público');
    if (!/^https:\/\//i.test(c.explorerUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(c.explorerUrl)) fallos.push('el explorador (https)');
    for (const u of c.rpcServidor.concat(c.rpcPublico)) if (!/^https:\/\//i.test(u) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(u)) fallos.push('un RPC con https: ' + u);
    if (!Number.isSafeInteger(c.moneda.decimales) || c.moneda.decimales < 0 || c.moneda.decimales > 36) fallos.push('los decimales');
    for (const k of ['contratoItems', 'contratoMensajes']) if (!/^0x[0-9a-fA-F]{40}$/.test(c[k])) fallos.push(k === 'contratoItems' ? 'el contrato de objetos' : 'el contrato de mensajes');
    if (fallos.length) throw new Error('Revisa: ' + fallos.join(', ') + '.');
  }

  $('red-form').addEventListener('input', () => { tocado = true; revisarMigracion(); });
  $('red-form').addEventListener('submit', (e) => e.preventDefault());
  $('red-probar').addEventListener('click', () => op.run(async () => {
    const c = leerFormulario(); validarLocal(c);
    const r = await probar(c);
    op.notice(r.prueba.ok ? 'La red responde bien.' + (r.migra ? ' Es una migración: para guardarla hay que escribir MIGRAR.' : '') : 'La red no pasa la prueba: mira la tabla.', !r.prueba.ok);
  }, $('red-probar')));
  $('red-probar-marcha').addEventListener('click', () => op.run(async () => {
    if (!estado) return;
    const r = await probar(estado.enMarcha);
    op.notice(r.prueba.ok ? 'La red en marcha responde bien.' : 'La red en marcha tiene problemas: mira la tabla.', !r.prueba.ok);
  }, $('red-probar-marcha')));
  $('red-guardar').addEventListener('click', () => op.run(async () => {
    const c = leerFormulario(); validarLocal(c);
    const migra = esMigracion(c);
    if (migra && $('red-confirmar').value.trim().toUpperCase() !== 'MIGRAR') throw new Error('Cambia la cadena o los contratos: escribe MIGRAR para confirmarlo.');
    const r = await probar(c);
    if (!r.prueba.ok) throw new Error('La red no pasa la prueba: no se guarda. Mira la tabla.');
    const pregunta = migra
      ? '¿Guardar la MIGRACIÓN a la cadena ' + c.chainId + '? Entrará al reiniciar el servidor.'
      : '¿Guardar y aplicar ya esta red? El servidor cambia de RPC al momento.';
    if (!window.confirm(pregunta)) return;
    const res = await op.request('/api/admin/red', { method: 'POST', body: JSON.stringify({ cfg: c, confirmar: migra ? 'MIGRAR' : undefined,
      revisionBase: estado && estado.guardada ? estado.guardada.revision : 0 }) });
    tocado = false;
    estado = res.estado || estado;
    pintarEstado(); pintarHistorial(); pintarPrueba(res.prueba);
    op.notice(res.aplicado === 'ahora'
      ? 'Guardada la revisión ' + res.revision + ' y aplicada: el servidor ya usa esta red. El juego, la tienda, el login y las carteras la toman en su próxima carga.'
      : 'Guardada la revisión ' + res.revision + ' (migración). Reinicia el servidor en Railway para que entre.');
  }, $('red-guardar')));
  $('red-cargar-marcha').addEventListener('click', () => { if (estado) { rellenar(estado.enMarcha); op.notice('Formulario con la red en marcha.'); } });
  $('red-cargar-defecto').addEventListener('click', () => { if (estado && estado.porDefecto) { rellenar(estado.porDefecto); op.notice('Formulario con la red por defecto (LitVM LiteForge en Zeeve). No se guarda hasta pulsar “Probar y guardar”.'); } });

  window.startOperations(load);
})();
