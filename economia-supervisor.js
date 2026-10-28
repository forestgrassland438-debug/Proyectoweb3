(function () {
  'use strict';
  const session = window.GFAdminSession;
  const $ = id => document.getElementById(id);
  if (!session || !$('e3-state')) return;
  let busy = false, ended = false;
  const number = n => Number(n || 0).toLocaleString('es-EC');
  const message = text => { if (!ended) $('e3-message').textContent = text; };
  function node(tag, text) { const e = document.createElement(tag); e.textContent = text; return e; }
  async function load() {
    if (busy || ended) return;
    busy = true;
    try {
      const [d, reviews] = await Promise.all([session.request('/api/admin/economia/supervisor'), session.request('/api/admin/economia/servicios/revisar')]);
      if (ended) return;
      $('e3-active').checked = d.politica.activo;
      $('e3-burn').checked = d.politica.quemaAutomatica;
      $('e3-state').replaceChildren(...[
        ['Disponible del juego', d.disponibleJuego], ['Disponible circular', d.disponibleCircular],
        ['Retenido para servicios', d.reservadoServicios], ['Botín reservado', d.reservadoBotin]
      ].map(([title, value]) => { const n = node('div', ''); n.className = 'ec-kpi'; n.append(node('b', number(value) + ' BR'), node('span', title)); return n; }));
      $('e3-policy').textContent = 'Supervisor por reglas · piso juego ' + number(d.politica.pisoJuego) + ' BR · piso circular ' + number(d.politica.pisoCircular) +
        ' BR · quema automática máxima 0,1 % por día UTC, solo con 7 días completos y crecimiento monetario >20 %. ' +
        (d.estado.error ? 'Requiere atención: ' + d.estado.error : 'Última ejecución: ' + (d.estado.ultima || 'pendiente'));
      const wrap = $('e3-reviews'); wrap.replaceChildren();
      if (!reviews.filas.length) wrap.append(node('p', 'No hay cobros pendientes de revisión.'));
      for (const r of reviews.filas) {
        const line = node('div', ''); line.style.cssText = 'padding:12px 0;border-bottom:1px solid #555;display:flex;gap:10px;align-items:center;flex-wrap:wrap';
        const text = node('span', r.playerName + ' · ' + r.tipo + ' ' + r.itemId + ' ×' + r.cantidad + ' · ' + number(r.bronce) + ' BR · ' + r.estado);
        text.style.cssText = 'flex:1;min-width:160px;overflow-wrap:anywhere'; line.append(text);
        if (r.tipo === 'tienda_compra' || r.tipo === 'tienda_venta') {
          const review = node('button', 'Verificar entrega / venta'); review.type = 'button'; review.className = 'tz-btn';
          review.onclick = async () => {
            if (busy) return;
            const input = window.prompt('Tras revisar la cadena, indica cuántas unidades fueron realmente entregadas o vendidas (0 a ' + r.cantidad + '):', String(r.confirmadas || 0));
            if (input === null) return;
            const confirmadas = Number(input);
            if (!Number.isSafeInteger(confirmadas) || confirmadas < 0 || confirmadas > r.cantidad) return;
            const motivo = window.prompt('Describe la comprobación de cadena e inventario (mínimo 5 caracteres):');
            if (!motivo || motivo.trim().length < 5) return;
            busy = true;
            try { await session.request('/api/admin/economia/tienda/revisar', { method: 'POST', body: JSON.stringify({ id: r._id, confirmadas, motivo }) }); message('Operación conciliada con la reserva.'); }
            catch (e) { message(e.message || 'No se pudo conciliar.'); }
            finally { busy = false; load(); }
          }; line.append(review); wrap.append(line); continue;
        }
        for (const [action, label] of [['completado', 'Entrega verificada'], ['devolver', 'Devolver tras verificar fallo']]) {
          const b = node('button', label); b.type = 'button'; b.className = 'tz-btn';
          b.onclick = async () => {
            if (busy) return;
            const reason = window.prompt('Describe qué verificaste en el inventario y en la cadena (mínimo 5 caracteres):');
            if (!reason || reason.trim().length < 5) return;
            busy = true; b.disabled = true;
            try { await session.request('/api/admin/economia/servicios/revisar', { method: 'POST', body: JSON.stringify({ id: r._id, accion: action, motivo: reason }) }); message('Revisión registrada.'); }
            catch (e) { message(e.message || 'No se pudo registrar.'); }
            finally { busy = false; b.disabled = false; load(); }
          }; line.append(b);
        }
        wrap.append(line);
      }
    } catch (e) { message(e.message || 'No se pudo consultar el supervisor.'); }
    finally { busy = false; }
  }
  $('e3-refresh').onclick = load;
  $('e3-save').onclick = async () => {
    if (busy) return; busy = true;
    try { await session.request('/api/admin/economia/supervisor/config', { method: 'POST', body: JSON.stringify({ activo: $('e3-active').checked, quemaAutomatica: $('e3-burn').checked }) }); message('Automatismo guardado.'); }
    catch (e) { message(e.message || 'No se pudo guardar.'); }
    finally { busy = false; load(); }
  };
  $('e3-transfer').onsubmit = async e => {
    e.preventDefault(); if (busy) return;
    const f = e.currentTarget, bronce = Number(f.elements.bronce.value), motivo = f.elements.motivo.value.trim();
    if (!Number.isSafeInteger(bronce) || bronce < 1 || motivo.length < 5) return;
    busy = true;
    try { await session.request('/api/admin/economia/transferir', { method: 'POST', body: JSON.stringify({ bronce, motivo, ref: crypto.randomUUID() }) }); message('Transferido sin crear monedas nuevas.'); f.reset(); }
    catch (err) { message(err.message || 'No se pudo transferir.'); }
    finally { busy = false; load(); }
  };
  document.addEventListener('gf-economia:cargada', load);
  window.addEventListener('pagehide', e => { if (!e.persisted) ended = true; });
})();
