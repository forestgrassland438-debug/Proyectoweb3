(function () {
  'use strict';
  const op = window.GFOperations, { $, el } = op;
  let cursor = '', next = null, rows = [], query = '';
  const history = [];
  op.onReset(()=>{rows=[];cursor='';next=null;history.length=0;$('account-rows').replaceChildren();});
  const date = v => v ? new Date(v).toLocaleString('es-EC') : 'Sin registro';
  function render() {
    const host = $('account-rows'); host.replaceChildren();
    for (const r of rows) {
      const tr = el('tr'), player = el('td'), wallet = el('div', r.wallet || 'Sin cartera', 'op-wallet');
      player.append(el('strong', r.username && r.username !== '---' ? r.username : 'Sin nombre elegido'), el('small', r.playerName), wallet);
      if (r.wallet) { const copy = el('button', 'Copiar cartera', 'op-copy'); copy.type = 'button'; copy.addEventListener('click', () => op.copy(r.wallet)); player.append(copy); }
      const contact = el('td'); contact.append(el('div', r.email || 'Correo no registrado'), el('span', r.email ? r.emailVerified ? 'Verificado por el proveedor' : 'Sin verificación registrada' : 'No se deduce de la cartera', 'op-badge ' + (r.emailVerified ? '' : 'off')),
        el('small', 'Acceso: ' + (r.loginProvider || 'wallet_signature')));
      const activity = el('td'); activity.append(el('div', 'Último acceso: ' + date(r.lastLogin)), el('small', 'Última partida: ' + date(r.lastGameplay)), el('small', 'Accesos registrados: ' + r.loginCount));
      const status = el('td'); status.append(el('span', r.online ? 'En el juego · esta instancia' : 'Sin conexión en esta instancia', 'op-badge ' + (r.online ? '' : 'off')),
        el('small', 'Nivel ' + r.level + ' · Mundo ' + r.world), el('small', 'Alta: ' + date(r.createdAt)), el('small', r.discord ? 'Discord: ' + r.discord : 'Discord no registrado'));
      const details = el('details'), summary = el('summary', 'Más información'); details.append(summary, el('p', 'Tutorial: ' + r.tutorial + ' · Estado: ' + (r.isGhost ? 'fantasma' : 'vivo')), el('p', 'Identidad social comprobada: ' + date(r.identityVerifiedAt))); status.append(details);
      tr.append(player, contact, activity, status); host.append(tr);
    }
    $('accounts-empty').hidden = rows.length > 0; $('account-count').textContent = rows.length + ' cuentas en esta página';
    $('account-next').disabled = !next; $('account-prev').disabled = history.length === 0;
  }
  async function load() {
    const params = new URLSearchParams({ q: query }); if (cursor) params.set('after', cursor);
    const data = await op.request('/api/admin/cuentas?' + params);
    if (!op.active) return;
    rows = data.rows || []; next = data.next; render();
    $('op-updated').textContent = 'Consulta: ' + date(data.observedAt); op.notice('Datos privados del administrador. Los correos antiguos que nunca se guardaron aparecen como no registrados.');
  }
  $('account-search-form').addEventListener('submit', e => { e.preventDefault(); query = $('account-search').value.trim(); cursor = ''; history.length = 0; op.run(load, $('account-search-button')); });
  $('account-next').addEventListener('click', () => op.run(async () => { if (!next) return; const previous = cursor; cursor = next; try { await load(); history.push(previous); render(); } catch (e) { cursor = previous; throw e; } }, $('account-next')));
  $('account-prev').addEventListener('click', () => op.run(async () => { if (!history.length) return; const previous = cursor; cursor = history.at(-1); try { await load(); history.pop(); render(); } catch (e) { cursor = previous; throw e; } }, $('account-prev')));
  window.startOperations(load);
})();
