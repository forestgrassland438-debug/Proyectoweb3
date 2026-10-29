from pathlib import Path
R=Path(__file__).resolve().parent.parent
def edit(file, edits):
    p=R/file; s=p.read_text(encoding='utf8')
    for old,new in edits:
        if old not in s: raise RuntimeError(file+': '+old[:90])
        s=s.replace(old,new)
    p.write_text(s,encoding='utf8',newline='\n')
edit('gf-servicios.js',[(" * `tipo`: 'fundir' | 'craftear'. Con un servidor de antes (404) no se cobra\n * nada y no se bloquea nada. Si la respuesta se pierde, se pide la devolución\n * con la misma referencia (el servidor solo devuelve lo que de verdad cobró).", " * Un servicio sin cobro confirmado se bloquea. Un fallo pide revisión del\n * recibo: el navegador nunca puede autorizar su propia devolución.")])
edit('tienda_sistema.js',[
('        this._cargandoPrecios = (async () => {\n            try {\n                const ctl = typeof AbortController', '        this._cargandoPrecios = (async () => {\n            let corte = null;\n            try {\n                const ctl = typeof AbortController'),
('                const corte = ctl ? setTimeout(() => ctl.abort(), 8000) : null;', '                corte = ctl ? setTimeout(() => ctl.abort(), 8000) : null;'),
('            } finally {\n                this._cargandoPrecios = null;', '            } finally {\n                if (corte) clearTimeout(corte);\n                this._cargandoPrecios = null;'),
('                if (!p || !moneda) continue;', '                if (!p || !moneda || !Number.isSafeInteger(p.compra) || !Number.isSafeInteger(p.venta) || p.compra < 0 || p.venta < 0) continue;')])
edit('control-center.js',[("Three treasuries, burns, the price index, inflation, death and crafting prices, the three coins and Gold purchases with zkLTC.", "Two treasuries, protected reserves, the automatic supervisor, payment review, price limits and Gold top-ups.")])
p=R/'economia.html';s=p.read_text(encoding='utf8')
a=s.index('        <!-- (2026-10-28) El fondo de reserva:');b=s.index('      </div>',a)
s=s[:a]+s[b:]
s=s.replace('<option value="reserva">Reserve fund</option>','')
a=s.index('        <section class="tz-card" aria-labelledby="e2-r-title">');b=s.index('        </section>',a)+len('        </section>')
s=s[:a]+s[b:]
s=s.replace('id="e2-c-peso" class="tz-input" type="number"','id="e2-c-peso" class="tz-input" type="number" disabled title="Item destruction does not destroy coins"')
s=s.replace('Death (paid to the reserve fund)','Death (paid to the game treasury)')
s=s.replace('Weight of destroyed items (%)','Effect of item destruction on monetary inflation (disabled)')
section='''
      <section class="tz-card" style="margin:14px 0" aria-labelledby="e3-title">
        <div class="ec-titulo"><div><span class="tz-eyebrow">Automatic treasury policy</span><h2 id="e3-title">Economy supervisor</h2></div>
          <button id="e3-refresh" type="button" class="tz-btn">Refresh supervisor</button></div>
        <p class="tz-card-sub">Two active treasuries. The game treasury also holds the protected reserve. Pending service refunds and reserved monster drops cannot be burned.</p>
        <div id="e3-state" class="ec-kpis" role="status"></div>
        <p id="e3-policy" class="tz-card-sub"></p>
        <form id="e3-transfer" class="tz-form"><h3>Fund monster rewards from game surplus</h3>
          <div class="tz-fields"><label class="tz-field">Bronze<input class="tz-input" name="bronce" type="number" min="1" step="1" required></label>
          <label class="tz-field">Reason<input class="tz-input" name="motivo" minlength="5" maxlength="200" required></label></div>
          <button class="tz-btn" type="submit">Transfer to circular treasury</button></form>
        <p id="e3-message" role="status"></p>
        <h3>Service payments awaiting confirmation or review</h3>
        <p class="tz-card-sub">Verify the item delivery and chain history before approving a refund. A browser failure report alone is insufficient.</p>
        <div id="e3-reviews" class="tz-table-wrap"></div>
        <p><a href="./GUIA-ECONOMIA.html" target="_blank" rel="noopener">Read the economy operations guide ↗</a></p>
      </section>
'''
s=s.replace('    <div id="ec-body">','    <div id="ec-body">'+section)
s=s.replace('</head>','  <script defer src="./economia-supervisor.js?v=20261028-v3"></script>\n</head>')
p.write_text(s,encoding='utf8')
p=R/'economia2.js';s=p.read_text(encoding='utf8')
s=s.replace(", reserva: 'Reserve fund'",'')
a=s.index("    $('e2-res-saldo').textContent");b=s.index('    const h = d.hoy',a);s=s[:a]+s[b:]
s=s.replace('tr.circular.quemado + tr.juego.quemado + tr.reserva.quemado','tr.circular.quemado + tr.juego.quemado')
s=s.replace("q.tesoro === 'juego' ? tr.juego.saldo : tr.reserva.saldo",'tr.juego.saldo')
a=s.index('  // ── EL FONDO DE RESERVA: meter o sacar');b=s.index('  // ── LOS GRÁFICOS',a);s=s[:a]+s[b:]
s=s.replace("cantidad: q.cantidad, motivo })", "cantidad: q.cantidad, motivo, ref: root.crypto.randomUUID() })")
s=s.replace('Game and reserve funds are already out of circulation:', 'Game treasury funds are already out of circulation:')
s=s.replace('Deaths → reserve','Deaths → game treasury')
s=s.replace("const quemaObj = a7 !== null && a7 !== undefined && n7 !== null && n7 !== undefined ? a7 - n7 : 0;",'const quemaObj = 0;')
p.write_text(s,encoding='utf8')
print('Targeted shop and admin UI changes applied.')
