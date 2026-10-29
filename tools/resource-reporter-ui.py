from pathlib import Path
import importlib.util
spec=importlib.util.spec_from_file_location('res_apply','tools/resource-economy-apply.py')
u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u)
s=u.read('reporter.js')
s=u.once(s,"'/api/admin/client-errors?limit='", "'/api/admin/client-errors?grouped=1&limit='")
a=s.index('    (d.items || []).forEach(function (it) {', s.index('async function cargarErrores'))
b=s.index("    pintarPaginador('E'",a)
s=s[:a]+"    renderReportRows(cuerpo, d.items || [], false);\n\n"+s[b:]
s=u.once(s,"'/api/admin/relay-failures?limit='", "'/api/admin/relay-failures?grouped=1&limit='")
s=u.once(s,"+ '&skip=' + estado.relay.skip);", "+ '&skip=' + estado.relay.skip + '&q=' + encodeURIComponent($('qRelay').value.trim()));")
a=s.index('    (d.items || []).forEach(function (it) {',s.index('async function cargarRelay'))
b=s.index("    pintarPaginador('R'",a)
s=s[:a]+"    renderReportRows(cuerpo, d.items || [], true);\n\n"+s[b:]
marker='  // ── Paginación '
i=s.index(marker)
new='''  async function copyReport(it) {
    var value = JSON.stringify({ type: it.type, contract: it.contractName, function: it.functionName,
      message: it.message || it.error, file: it.file, line: it.line, scene: it.scene, stack: it.stack,
      occurrences: it.count, lastSeen: it.lastSeen, wallets: it.actors || [], walletCount: it.actorCount,
      historicalReportedPlayer: it.historicalActor || null, sampleTransaction: it.txHash || null }, null, 2);
    try { await navigator.clipboard.writeText(value); if (!cerrado) toast('Error copiado', 'good'); }
    catch (_) {
      if (cerrado) return;
      var dialog = document.createElement('dialog'), area = document.createElement('textarea'), close = document.createElement('button');
      dialog.className = 'report-copy-dialog'; area.readOnly = true; area.value = value; close.textContent = 'Cerrar';
      close.addEventListener('click', function () { dialog.close(); }); dialog.addEventListener('close', function () { dialog.remove(); }, { once: true });
      dialog.append(area, close); document.body.append(dialog); dialog.showModal(); area.focus(); area.select();
    }
  }
  function renderReportRows(host, rows, relay) {
    rows.forEach(function (it) {
      var tr = document.createElement('tr'); tr.className = 'report-row';
      var kind = td(relay ? (it.functionName || 'relay') : (it.type || 'unknown'), 'report-kind');
      var content = document.createElement('td'); content.className = 'msg';
      var main = document.createElement('div'); main.className = 'msg-main'; main.textContent = it.message || it.error || '(sin detalle)';
      var context = document.createElement('div'); context.className = 'msg-sub';
      context.textContent = relay ? (it.contractName || '') : [it.scene, it.file, it.line].filter(Boolean).join(' · ');
      content.append(main, context);
      var details = document.createElement('details'); details.className = 'stack';
      var summary = document.createElement('summary'); summary.textContent = 'Ver detalle y carteras (' + (it.actorCount || 0) + ')';
      var pre = document.createElement('pre'); pre.textContent = [it.message || it.error, it.stack, it.txHash].filter(Boolean).join('\\n\\n');
      details.append(summary, pre);
      var actors = document.createElement('div'); actors.className = 'report-actors';
      (it.actors || []).forEach(function (actor) {
        var row = document.createElement('div'), who = document.createElement('strong'), wallet = document.createElement('code'), count = document.createElement('span');
        who.textContent = actor.playerName || 'Sin nombre'; wallet.textContent = actor.wallet || 'Sin cartera registrada'; count.textContent = '×' + actor.count;
        row.append(who, wallet, count); actors.append(row);
      });
      if (it.historicalActor) { var legacy = document.createElement('p'); legacy.className = 'muted'; legacy.textContent = 'Nombre comunicado en registros antiguos: ' + it.historicalActor + '. No acredita una cartera autenticada.'; actors.append(legacy); }
      if (it.actorCount > (it.actors || []).length) { var note = document.createElement('p'); note.textContent = 'Se muestran las primeras 20 carteras. Busca una dirección para filtrar sus registros.'; actors.append(note); }
      details.append(actors); content.append(details);
      var number = td('×' + (it.count || 1), 'report-count'), time = td(cuando(it.lastSeen || it.createdAt), 'when'), actions = document.createElement('td'); actions.className = 'report-actions';
      var copy = document.createElement('button'); copy.type = 'button'; copy.className = 'btn-ghost rowbtn'; copy.textContent = 'Copiar error'; copy.addEventListener('click', function () { copyReport(it); }); actions.append(copy);
      if (!relay) { var remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn-ghost rowbtn'; remove.textContent = (it.count || 1) > 1 ? 'Borrar muestra' : 'Borrar'; remove.addEventListener('click', function () { borrarUno(it._id, remove); }); actions.append(remove); }
      tr.append(kind, content, number, time, actions); host.append(tr);
    });
  }
  async function clearRelay() {
    if (!confirm('¿Limpiar toda la lista visible de fallos del relayer? El historial de transacciones y pagos se conserva.')) return;
    $('btnRelayClear').disabled = true;
    try {
      await pedir('/api/admin/relay-failures/clear', { method: 'POST', body: JSON.stringify({ confirm: 'CLEAR' }) });
      estado.relay.skip = 0; await cargarRelay(); toast('Lista limpiada; historial de auditoría conservado.', 'good');
    } catch (e) { toast('No se pudo limpiar: ' + e.message, 'bad'); }
    finally { $('btnRelayClear').disabled = false; }
  }

'''
s=s[:i]+new+s[i:]
s=u.once(s,"    $('btnWipe').addEventListener('click', borrarTodos);", "    $('btnWipe').addEventListener('click', borrarTodos);\n    $('btnRelayClear').addEventListener('click', clearRelay);\n    $('btnRelaySearch').addEventListener('click', function () { estado.relay.skip = 0; recargarTodo(); });\n    $('qRelay').addEventListener('keydown', function (e) { if (e.key === 'Enter') { estado.relay.skip = 0; recargarTodo(); } });")
u.save('reporter.js',s)
s=u.read('reporter.html')
a=s.index('          <thead><tr>',s.index('id="tab-errors"'));b=s.index('          <tbody id="rowsErrors"',a)
s=s[:a]+'''          <thead><tr><th style="width:100px">Tipo</th><th>Error, contexto y carteras</th><th style="width:80px">Veces</th><th style="width:120px">Última vez</th><th style="width:125px">Acciones</th></tr></thead>
'''+s[b:]
a=s.index('          <thead><tr>',s.index('id="tab-relay"'));b=s.index('          <tbody id="rowsRelay"',a)
s=s[:a]+'''          <thead><tr><th style="width:120px">Función</th><th>Error, contexto y carteras</th><th style="width:80px">Veces</th><th style="width:120px">Última vez</th><th style="width:125px">Acciones</th></tr></thead>
'''+s[b:]
i=s.index('      <div class="tablewrap card">',s.index('id="tab-relay"'))
s=s[:i]+'''      <div class="toolbar"><input id="qRelay" type="search" placeholder="Buscar error, jugador, cartera o función…"><button id="btnRelaySearch" class="btn-ghost" type="button">Buscar</button><button id="btnRelayClear" class="btn-danger" type="button">Limpiar toda la lista</button></div>
'''+s[i:]
s=u.once(s,'</style>', '''
  /* Bounded rows, readable wallet groups and a copy action on every error. */
  .tablewrap table{table-layout:fixed;min-width:0}.tablewrap td{min-width:0}.msg-main{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.5;max-height:3em;overflow-wrap:anywhere}.msg-sub{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}.stack pre{max-height:300px;overflow:auto}.report-actions{display:flex;flex-direction:column;gap:8px}.report-count{font-variant-numeric:tabular-nums;color:var(--warn);font-weight:800}.report-kind{overflow-wrap:anywhere}.report-actors>div{display:grid;grid-template-columns:minmax(80px,1fr) minmax(0,2fr) auto;gap:8px;padding:8px 0;border-top:1px solid var(--line)}.report-actors code{font-size:11px;overflow-wrap:anywhere}.report-actors p{font-size:12px}.report-copy-dialog{width:min(94vw,700px);border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--text)}.report-copy-dialog::backdrop{background:#000a}.report-copy-dialog textarea{width:100%;height:65vh;background:var(--bg);color:var(--text);border:1px solid var(--line);padding:12px}
  @media(max-width:760px){.tablewrap thead{display:none}.tablewrap tr{display:grid;grid-template-columns:1fr auto;border-bottom:1px solid var(--line);padding:12px;gap:6px}.tablewrap td{border:0;padding:3px;max-width:none}.tablewrap td.msg{grid-column:1/-1;grid-row:2;max-width:none}.report-actions{grid-column:1/-1;flex-direction:row;flex-wrap:wrap}.when{grid-column:1/-1}.report-actors>div{grid-template-columns:1fr auto}.report-actors code{grid-column:1/-1;grid-row:2}.msg-sub{white-space:normal}}
</style>''')
u.save('reporter.html',s)
print('Compact grouped reporter UI with copy actions and safe relayer inbox clearing.')
