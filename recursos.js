(function () {
  'use strict';
  const op = window.GFOperations, { $, el } = op;
  const fields = ['startPercent', 'baseRespawn', 'maxRespawn', 'priceMax'];
  let version = null, snapshot = null, dirty = false;
  op.onReset(()=>{snapshot=null;version=null;$('resource-rows').replaceChildren();});
  const date = v => new Date(v).toLocaleString('es-EC');
  function values() { return { enabled: $('resource-enabled').checked, ...Object.fromEntries(fields.map(k => [k, Number($('resource-' + k).value)])) }; }
  function draw(curve) {
    const svg = $('resource-chart'), ns = 'http://www.w3.org/2000/svg'; svg.replaceChildren();
    const make = (tag, attrs, text) => { const n = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([k,v]) => n.setAttribute(k,v)); if (text) n.textContent = text; svg.append(n); return n; };
    make('path', { d: 'M40 20V210H600', stroke: '#547068', fill: 'none' });
    [0,25,50,75,100].forEach(n => make('text', { x: 40 + n * 5.6, y: 232, fill: '#9bb2b1', 'font-size': 11 }, n + '%'));
    const max = Math.max(...curve.map(p => p.respawnSeconds), 1);
    const points = curve.map(p => (40 + p.occupancy * 5.6) + ',' + (210 - p.respawnSeconds / max * 185)).join(' ');
    make('polyline', { points, fill: 'none', stroke: '#b8dbab', 'stroke-width': 3 });
    make('text', { x: 50, y: 20, fill: '#d7e9dc', 'font-size': 12 }, 'Reaparición · hasta ' + max + ' s');
  }
  function render(data) {
    const host = $('resource-rows'); host.replaceChildren();
    for (const r of data.rows) {
      const tr = el('tr'), name = el('td'); name.append(el('strong', r.itemId), el('small', 'Tabla: ' + r.tipo));
      if(r.available){
        const details=el('details'),summary=el('summary','Ampliar límite manualmente'),form=el('form'),global=el('input'),invoice=el('input'),button=el('button','Firmar cambio del contrato');
        form.className='op-cap-editor';global.value=r.limit;invoice.value=r.perInvoiceLimit;global.inputMode=invoice.inputMode='numeric';global.maxLength=invoice.maxLength=78;
        global.setAttribute('aria-label','Nuevo límite global');invoice.setAttribute('aria-label','Nuevo límite por factura');button.type='submit';form.append(global,invoice,button);details.append(summary,el('p','Solo se amplían límites mediante una firma explícita de tu cartera. Este cambio admite más emisión y consume gas.'),form);name.append(details);
        form.addEventListener('submit',e=>{e.preventDefault();op.run(async()=>{
          if(!/^\d{1,78}$/.test(global.value) || !/^\d{1,78}$/.test(invoice.value))throw new Error('Escribe enteros positivos.');
          const limit=BigInt(global.value),perInvoice=BigInt(invoice.value),max=(1n<<256n)-1n;
          if(limit<1n || perInvoice<1n || limit>max || perInvoice>max || perInvoice>limit || limit<BigInt(r.limit) || perInvoice<BigInt(r.perInvoiceLimit))throw new Error('No se reducen límites desde este panel: primero habría que auditar las facturas existentes.');
          const wallet=window.GFAdminSession.provider();if(!wallet || !window.ethers)throw new Error('Conecta la cartera administradora.');
          const who=await op.request('/api/admin/whoami'),accounts=await wallet.request({method:'eth_accounts'});
          if(accounts?.[0]?.toLowerCase()!==who.address.toLowerCase())throw new Error('La cartera seleccionada no coincide con la sesión administradora.');
          if(Number(BigInt(await wallet.request({method:'eth_chainId'})))!==snapshot.chainId)throw new Error('Selecciona en tu cartera la red del juego antes de firmar.');
          if(!window.confirm('¿Ampliar '+r.tipo+' de '+r.limit+' a '+limit+' unidades y de '+r.perInvoiceLimit+' a '+perInvoice+' por factura? Esto permite más emisión.'))return;
          const provider=new window.ethers.BrowserProvider(wallet);
          try{
            const signer=await provider.getSigner(who.address),contract=new window.ethers.Contract(snapshot.contract,['function setLimit(string,uint256,uint256)'],signer);
            const tx=await contract.setLimit(r.tipo,limit,perInvoice);op.notice('Transacción enviada: '+tx.hash+'. Conserva este hash; no repitas el envío.');
            try{await tx.wait(1,120000);}catch(_){throw new Error('Confirmación pendiente: '+tx.hash+'. Comprueba el hash antes de volver a enviar.');}
            if(!op.active)return;
            try { await op.request('/api/admin/recursos/limites/confirmar',{method:'POST',body:JSON.stringify({txHash:tx.hash})}); } catch (_) { throw new Error('El envío ya se confirmó: '+tx.hash+'. Actualiza las lecturas; no vuelvas a firmar el mismo cambio.'); } await load();
            op.notice('Cambio confirmado en el contrato: '+tx.hash);
          }finally{provider.destroy();}
        },button);});
      }
      const supply = el('td'); supply.append(el('div', r.available ? r.totalQuantity + ' / ' + r.limit : 'Lectura no disponible', 'op-numeric'), el('small', r.available ? 'Capacidad libre: ' + r.remaining : 'No se interpreta como cero'));
      const pressure = el('td'); pressure.append(el('span', r.available && r.configured ? r.occupancy.toFixed(2) + '%' : 'Sin configuración', 'op-badge ' + (!r.configured || r.exhausted ? 'warn' : '')));
      const meter = el('div', null, 'op-meter'), fill = el('i'); fill.style.width = Math.min(100, r.occupancy || 0) + '%'; meter.append(fill); pressure.append(meter);
      const timing = el('td', r.available ? r.respawnSeconds + ' s' : '—', 'op-numeric'); timing.append(el('small', r.available ? 'Referencia ×' + r.priceFactor : ''));
      const invoice = el('td', r.available ? r.perInvoiceLimit : '—', 'op-numeric'); invoice.append(el('small', r.available ? r.invoiceCount + ' facturas activas' : ''));
      const burned = el('td', r.available ? r.totalBurned : '—', 'op-numeric');
      tr.append(name, supply, pressure, timing, invoice, burned); host.append(tr);
    }
  }
  async function load() {
    const data = await op.request('/api/admin/recursos'); if (!op.active) return;
    snapshot = data; version = data.version; render(data);
    $('resource-migration').textContent = data.migrationSealed === true ? 'Migración sellada en el contrato.' : data.migrationSealed === false ? 'Migración ABIERTA: el propietario puede importar facturas por encima de los límites. Revisa la guía antes de dar por cerrado el control de emisión.' : 'No se pudo verificar si la migración está sellada. No se supone que los límites cubran importaciones administrativas.';
    try { await loadDeliveries(false); } catch (_) { if(op.active)$('resource-deliveries').replaceChildren(el('p','La conciliación no está disponible. Las lecturas y la política de recursos siguen visibles; vuelve a actualizar para revisar entregas.')); }
    if (!dirty) { fields.forEach(k => { $('resource-' + k).value = data.settings[k]; }); $('resource-enabled').checked = data.settings.enabled; }
    $('op-updated').textContent = 'Consulta: ' + date(data.observedAt) + ' · caché máxima: ' + data.cacheSeconds + ' s';
    op.notice(data.rows.some(r => !r.available || !r.configured) ? 'Hay tablas sin configurar o sin lectura. No se simula capacidad libre ni se amplían límites automáticamente.' : 'Lecturas del contrato. La factura individual limita cada pila; la ocupación global controla la emisión.');
    $('resource-save').disabled = version == null;
  }
  $('resource-form').addEventListener('input', () => { dirty = true; window.GFAdminUI?.markDirty?.(true); });
  $('resource-preview').addEventListener('click', () => op.run(async () => {
    const data = await op.request('/api/admin/recursos/simular', { method: 'POST', body: JSON.stringify({ settings: values() }) });
    if (!op.active) return; draw(data.curve); render(data); op.notice('SIMULACIÓN: esta vista todavía no se ha guardado.');
  }, $('resource-preview')));
  $('resource-form').addEventListener('submit', e => { e.preventDefault(); op.run(async () => {
    const data = await op.request('/api/admin/recursos/config', { method: 'POST', body: JSON.stringify({ version, settings: values() }) });
    if (!op.active) return; dirty = false; window.GFAdminUI?.markDirty?.(false); await load();
    op.notice(data.pricesRecalculated ? 'Política guardada y precios recalculados dentro de sus límites diarios.' : 'Política guardada. La actualización de precios está pendiente; actualiza para comprobarla.', !data.pricesRecalculated);
  }, $('resource-save')); });
  $('resource-reset-preview').addEventListener('click', () => { if (snapshot) render(snapshot); $('resource-chart').replaceChildren(); op.notice('Vista del último estado consultado.'); });
  let deliveryCursor = null;
  op.onReset(()=>{deliveryCursor=null;$('resource-deliveries').replaceChildren();$('resource-legacy').replaceChildren();});
  async function loadDeliveries(next) {
    const data=await op.request('/api/admin/recursos/entregas'+(next && deliveryCursor?'?after='+encodeURIComponent(deliveryCursor):''));
    if(!op.active)return;
    deliveryCursor=data.next;const host=$('resource-deliveries');host.replaceChildren();
    for(const row of data.rows){
      const box=el('div',null,'op-receipt'),info=el('p',row.op+' · '+row.itemId+' × '+row.qty+' · '+row.status),button=el('button','Revisar mismo envío'),copy=el('button','Copiar recibo');
      box.append(info,el('small',row.wallet),el('small',row.txHash || 'Sin hash verificable'),el('small',row.error || ''),copy,button);
      copy.onclick=()=>op.copy(JSON.stringify(row,null,2));button.disabled=!row.txHash && row.status!=='pending';
      button.onclick=()=>op.run(async()=>{const result=await op.request('/api/admin/recursos/entregas/revisar',{method:'POST',body:JSON.stringify({receiptId:row._id})});await loadDeliveries(false);op.notice('Resultado: '+result.status);},button);host.append(box);
    }
    if(!data.rows.length)host.append(el('p','Sin entregas pendientes en esta página.'));
    $('resource-deliveries-next').hidden=!data.hasMore;
    const legacy=$('resource-legacy');legacy.replaceChildren();
    for(const row of data.legacy)legacy.append(el('p',String(row._id)+' · '+row.itemId+' × '+row.qty+' · '+row.owner));
    if(!data.legacy.length)legacy.append(el('p','Sin publicaciones anteriores en esta muestra.'));
  }
  $('resource-deliveries-next').onclick=()=>op.run(()=>loadDeliveries(true));
  $('resource-deliveries-first').onclick=()=>op.run(()=>loadDeliveries(false));
  window.startOperations(load);
})();
