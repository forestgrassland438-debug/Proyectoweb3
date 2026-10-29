/* =============================================================================
 * LA ECONOMÍA DE LA TIENDA DEL JUEGO Y DEL P2P — herramienta del centro de
 * control (precios.html)                                            (2026-10-28)
 * -----------------------------------------------------------------------------
 * "Un apartado económico de la tienda del juego y P2P: sus gráficos de cuánto
 * subió o bajó el precio según la inflación, el ítem y el sistema económico; no
 * los quiero simples. Y opciones para cambiar el precio por defecto de algún
 * ítem publicado en la tienda del juego (no en la P2P) en cualquiera de los
 * tres tipos de monedas, y que su gráfico se actualice."
 *
 * Lo que cuenta server2.js en "LA ECONOMÍA, 2.ª PARTE":
 *   GET  /api/admin/precios            todos los objetos: hoy, por defecto, cambios, P2P y demanda
 *   GET  /api/economia/precio/:itemId  el historial de uno (el mismo que ve el jugador)
 *   POST /api/admin/precios/item       { itemId, compra, venta, moneda, sigueIndice } | { itemId, quitar:true }
 *
 * Todo con textContent; gráficos de gf-graficos.js (hora del servidor, UTC).
 * ========================================================================== */
(function (root) {
  'use strict';
  const ui = root.GFAdminUI, session = root.GFAdminSession, G = root.GFGraficos || null;
  const $ = id => document.getElementById(id);
  const t = s => (ui ? ui.t(s) : String(s));
  if (!ui || !session) {
    const m = $('pr-gate-msg');
    if (m) { m.textContent = 'The administration suite did not load. Reload the page.'; m.dataset.error = 'true'; }
    return;
  }

  // Los nombres y dibujos (los del catálogo de la tienda; lo demás, desde el id).
  const NOMBRES = {
    ...(root.GFPlantCatalog?.names || {}),
    Semillax: ['Carrot Seed', './Game/Objetos/Plantas/planta_zanahorias/item_saco.png'], Semillax1: ['Tomato Seed', './Game/Objetos/Plantas/planta_tomates/semillas_tomate.png'],
    Semillax2: ['Wheat Seed', './Game/Objetos/Plantas/planta_trigo/item_semilla_trigo.png'], Semillax3: ['Pumpkin Seed', './Game/Objetos/Plantas/planta_calabaza/item_semilla_calabaza.png'],
    Semillax4: ['Strawberry Seed', './Game/Objetos/Plantas/planta_fresa/item_semilla_fresa.png'], Regaderax: ['Watering Can', './Game/Source/recurso2.png'],
    Tijerasx: ['Shears', './Game/Source/tijeras.png'], hacha_de_madera: ['Wood Axe', './Game/Source/pico_y_hacha/hacha_de_madera.png'],
    pico_de_madera: ['Wood Pickaxe', './Game/Source/pico_y_hacha/pico_de_madera.png'], zanahoria_buena: ['Fresh Carrot', './Game/Objetos/Plantas/planta_zanahorias/item_zanahoria_buena.png'],
    tomate_buena: ['Fresh Tomato', './Game/Objetos/Plantas/planta_tomates/item_tomate_bueno.png'], trigo_buena: ['Fresh Wheat', './Game/Objetos/Plantas/planta_trigo/item_trigo_bueno.png'],
    fresa_buena: ['Fresh Strawberry', './Game/Objetos/Plantas/planta_fresa/item_fresa_buena.png'], calabaza_buena: ['Fresh Pumpkin', './Game/Objetos/Plantas/planta_calabaza/item_calabaza_buena.png'],
    balde_con_agua: ['Bucket of Water', './Game/Source/item_pozo2.png'], pes1: ['Brown Trout', './Game/Objetos/pesca/pes1.png'], pes2: ['Common Carp', './Game/Objetos/pesca/pes2.png'],
    pes3: ['Golden Trout', './Game/Objetos/pesca/pes3.png'], pes4: ['River Perch', './Game/Objetos/pesca/pes4.png'], pes5: ['Bream', './Game/Objetos/pesca/pes5.png'],
    pes6: ['Sturgeon', './Game/Objetos/pesca/pes6.png'], pes7: ['Poison Eel', './Game/Objetos/pesca/pes7.png'], pes8: ['Lionfish', './Game/Objetos/pesca/pes8.png'],
    pes9: ['Silver Pike', './Game/Objetos/pesca/pes9.png'], pes10: ['Zander', './Game/Objetos/pesca/pes10.png'], pes11: ['Ice Trout', './Game/Objetos/pesca/pes11.png'],
    pes12: ['Rainbow Fish', './Game/Objetos/pesca/pes12.png'], pes13: ['King Salmon', './Game/Objetos/pesca/pes13.png'], pes14: ['Pufferfish', './Game/Objetos/pesca/pes14.png'],
    parcela: ['Land Plot', './Game/Objetos/construccion/parcela.png'], pala_construccion: ['Construction Shovel', './Game/Objetos/construccion/pala_construccion.png'],
    espantapajaros: ['Scarecrow', './Game/Objetos/granja/espantapajaros.png'], antorcha: ['Torch', './Game/Objetos/antorcha/antorcha.png'], basura: ['Trash Can', './Game/Objetos/cofres/basura.png'],
    cofre1: ['Wooden Chest', './Game/Objetos/cofres/cofre1.png'], cofre2: ['Reinforced Chest', './Game/Objetos/cofres/cofre2.png'], cofre3: ['Magic Chest', './Game/Objetos/cofres/cofre3.png'],
    cofre4: ['Legendary Chest', './Game/Objetos/cofres/cofre4.png'], espada_madera: ['Wooden Sword', './Game/Objetos/armas/espada_madera.png'],
    espada_cobre: ['Copper Sword', './Game/Objetos/armas/espada_cobre.png'], espada_hierro: ['Iron Sword', './Game/Objetos/armas/espada_hierro.png'],
    cana_pescar: ['Fishing Rod', './Game/Objetos/pesca/cana_pescar.png'], arco: ['Bow', './Game/Objetos/armas/arco.png'], baston_mago: ['Wizard Staff', './Game/Objetos/armas/baston_mago.png'],
    bote: ['Boat', './Game/Objetos/bote/bote.png'], mineral_piedra: ['Stone', './Game/Source/piedra.png'], mineral_cobre: ['Copper Ingot', './Game/Source/cobre.png'],
    mineral_hierro: ['Iron Ingot', './Game/Source/hierro.png'], pocion_vida: ['Health Potion', './Game/Source/pocion_vida.png'],
    mineral_piedra_cobre: ['Copper Ore', ''], mineral_piedra_hierro: ['Iron Ore', ''], mineral_carbon: ['Coal Ore', ''], carbon: ['Coal', ''],
    palo: ['Stick', ''], tablon_de_madera: ['Wooden Plank', ''], madera_pinos: ['Pine Wood', ''], madera_seca: ['Dry Wood', ''], madera_con_hojas: ['Leafy Wood', ''],
    balde_vacio: ['Empty Bucket', ''], hacha_de_piedra: ['Stone Axe', ''], hacha_de_cobre: ['Copper Axe', ''], hacha_de_hierro: ['Iron Axe', ''],
    pico_de_piedra: ['Stone Pickaxe', ''], pico_de_cobre: ['Copper Pickaxe', ''], pico_de_hierro: ['Iron Pickaxe', './Game/Source/pico_y_hacha/pico_de_hierro.png'],
    pocion_antidoto: ['Antidote Potion', ''], pocion_mascota: ['Pet Potion', ''], pocion_mascota_grande: ['Big Pet Potion', ''], elixir_revivir: ['Revive Elixir', '']
  };
  const MONEDA = { oro: 'Gold', plata: 'Silver', bronce: 'Bronze' };
  const POR = { oro: 1000000, plata: 1000, bronce: 1 };
  const bonito = id => String(id || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const nombre = id => (NOMBRES[id] ? NOMBRES[id][0] : bonito(id));
  const imagen = id => (NOMBRES[id] && NOMBRES[id][1]) || '';

  let verificado = false, cerrado = false, cargando = false, ocupado = false, sucio = false;
  let datos = null, elegido = null, detalle = null, reloj = 0;
  root.GFTreasuryLifecycle = Object.freeze({ status: () => (ocupado ? 'busy' : sucio ? 'dirty' : '') });

  const loc = () => (ui.language === 'es' ? 'es-EC' : 'en-US');
  const fmt = (n, d = 0) => new Intl.NumberFormat(loc(), { maximumFractionDigits: d }).format(Number(n) || 0);
  const pct = v => (v === null || v === undefined || !isFinite(v) ? '—' : (v > 0 ? '▲ +' : v < 0 ? '▼ ' : '■ ') + (v * 100).toFixed(1) + '%');
  const clasePct = v => (v === null || v === undefined || !isFinite(v) || Math.abs(v) < 0.0005 ? 'pr-igual' : v > 0 ? 'pr-sube' : 'pr-baja');
  const precio = (v, m) => (v > 0 ? fmt(v) + ' ' + t(MONEDA[m] || '') : '—');
  function el(tag, clase, texto) { const e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = String(texto); return e; }
  const kpi = (v, k) => { const d = el('div', 'ec-kpi'); d.append(el('b', '', v), el('span', '', t(k))); return d; };

  // ── LA PUERTA ─────────────────────────────────────────────────────────────
  function mensajePuerta(texto, error) { const m = $('pr-gate-msg'); m.textContent = t(texto); m.dataset.error = String(!!error); }
  function errorDeAcceso(e) {
    if (e && e.code === 4001) return 'Signature rejected.';
    if (e && (e.code === 'not_admin' || e.status === 403)) return 'Your wallet is not an administrator.';
    if (e && e.status === 401) return 'Your session expired. Connect again.';
    if (e instanceof TypeError) return 'Connection unavailable. Check that your backend is running.';
    return (e && e.message) || 'Session could not be verified.';
  }
  function aPuerta(motivo, error) {
    verificado = false; clearInterval(reloj); reloj = 0;
    $('pr-app').hidden = true; $('pr-gate').hidden = false; $('pr-connect').disabled = false;
    if (motivo) mensajePuerta(motivo, error);
  }
  async function verificar(interactivo) {
    if (cerrado) return;
    $('pr-connect').disabled = true;
    try {
      const yo = interactivo ? await session.signIn(m => mensajePuerta(m)) : await session.request('/api/admin/whoami');
      if (!/^0x[0-9a-f]{40}$/i.test((yo && yo.address) || '')) throw new Error('This account has no administrator permission.');
      if (cerrado) return;
      verificado = true;
      $('pr-gate').hidden = true; $('pr-app').hidden = false;
      if (!reloj) reloj = setInterval(() => { if (document.visibilityState !== 'hidden' && !ocupado && !sucio) cargar(); }, 90000);
      await cargar();
    } catch (e) {
      if (cerrado) return;
      if (!interactivo && e && e.status === 401) aPuerta('Connect your administrator wallet to continue.', false);
      else aPuerta(errorDeAcceso(e), true);
    } finally { if (!cerrado) $('pr-connect').disabled = false; }
  }

  // ── CARGAR Y PINTAR LA LISTA ──────────────────────────────────────────────
  function aviso(texto) { const n = $('pr-notice'); n.hidden = !texto; n.textContent = texto ? t(texto) : ''; }
  async function cargar() {
    if (!verificado || cargando || cerrado) return;
    cargando = true; $('pr-refresh').disabled = true;
    try {
      const d = await session.request('/api/admin/precios');
      if (!d || !Array.isArray(d.items)) throw new Error('The server answered without prices.');
      datos = d; aviso('');
      if (G && d.ahora) G.reloj.ajustar(d.ahora);
      pintarResumen(); pintarTabla();
      if (!elegido) { const requested = new URLSearchParams(root.location.search).get('itemId'); if (requested && d.items.some(x => x.itemId === requested)) elegido = requested; }
      if (elegido) await abrir(elegido, true);
      $('pr-updated').textContent = t('Last updated · ') + (G ? G.fechaHora(d.ahora || Date.now(), ui.language === 'es' ? 'es' : 'en') : new Date().toUTCString());
    } catch (e) {
      aviso(e && e.status === 404 ? 'This backend does not have the price routes yet. Update server2.js.' : (e && e.message) || 'Could not load the prices.');
    } finally { cargando = false; if (!cerrado) $('pr-refresh').disabled = false; }
  }
  function pintarResumen() {
    const l = datos.items;
    const tienda = l.filter(x => x.tienda);
    const cambiados = l.filter(x => x.cambiado).length;
    const c30 = tienda.map(x => x.cambio30).filter(v => v !== null && isFinite(v));
    const media = c30.length ? c30.reduce((s, v) => s + v, 0) / c30.length : null;
    const p2p = l.reduce((s, x) => s + (x.p2p ? x.p2p.n : 0), 0);
    const comprado = l.reduce((s, x) => s + (x.tienda7 ? x.tienda7.compras : 0), 0);
    $('pr-kpis').replaceChildren(kpi('×' + fmt(datos.indice, 4), 'Price index today'), kpi(fmt(tienda.length), 'Items in the game shop'),
      kpi(fmt(cambiados), 'Default prices changed by admins'), kpi(pct(media), 'Average change, 30 days'),
      kpi(fmt(comprado), 'Units bought in the shop, 7 days'), kpi(fmt(p2p), 'P2P sales, 14 days'));
  }
  function filtrados() {
    const q = $('pr-q').value.trim().toLowerCase(), f = $('pr-f').value, o = $('pr-o').value;
    let l = datos.items.filter(x => !q || x.itemId.toLowerCase().includes(q) || nombre(x.itemId).toLowerCase().includes(q));
    if (f === 'tienda') l = l.filter(x => x.tienda);
    else if (f === 'ref') l = l.filter(x => !x.tienda);
    else if (f === 'cambiado') l = l.filter(x => x.cambiado);
    else if (f === 'mueve') l = l.filter(x => x.cambio30 !== null && Math.abs(x.cambio30) > 0.05);
    else if (f === 'p2p') l = l.filter(x => x.p2p && x.p2p.n);
    const v = x => (x.cambio30 === null || !isFinite(x.cambio30) ? 0 : x.cambio30);
    if (o === 'sube') l.sort((a, b) => v(b) - v(a));
    else if (o === 'baja') l.sort((a, b) => v(a) - v(b));
    else if (o === 'p2p') l.sort((a, b) => ((b.p2p && b.p2p.volumen) || 0) - ((a.p2p && a.p2p.volumen) || 0));
    else if (o === 'demanda') l.sort((a, b) => ((b.tienda7 && b.tienda7.compras) || 0) - ((a.tienda7 && a.tienda7.compras) || 0));
    else l.sort((a, b) => nombre(a.itemId).localeCompare(nombre(b.itemId)));
    return l;
  }
  /** Una línea pequeña con los últimos 60 puntos (sin puntos sueltos: una línea de 2 px). */
  function sparkline(spark, sube) {
    const SVGNS = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 110 28'); s.setAttribute('class', 'pr-spark'); s.setAttribute('aria-hidden', 'true');
    const v = (spark || []).map(p => Number(p.v)).filter(n => n > 0);
    if (v.length < 2) return s;
    const min = Math.min(...v), max = Math.max(...v), r = max - min || 1;
    let d = '';
    v.forEach((n, i) => { const x = 2 + i * (106 / (v.length - 1)), y = 24 - (n - min) / r * 20; d += (i ? 'H' + x.toFixed(1) + 'V' : 'M' + x.toFixed(1) + ' ') + y.toFixed(1); });
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke-width', '2'); p.setAttribute('stroke-linejoin', 'round');
    p.setAttribute('stroke', sube === null ? '#8a8a8a' : sube ? '#d95926' : '#3987e5');
    s.append(p);
    return s;
  }
  function pintarTabla() {
    const l = filtrados();
    if (!l.length) { $('pr-tabla').replaceChildren(el('div', 'tz-empty', t('No items match.'))); return; }
    const tb = el('table', 'tz-table'), cab = el('thead'), tr = el('tr');
    [['Item'], ['Level', 1], ['Buy today', 1], ['Sell / value today', 1], ['24 h', 1], ['7 days', 1], ['30 days', 1], ['Trend (60 days)'], ['P2P median (14 d)', 1], ['Shop 7 d: bought / sold', 1]]
      .forEach(([c, num]) => { const th = el('th', num ? 'num' : '', t(c)); th.scope = 'col'; tr.append(th); });
    cab.append(tr); tb.append(cab);
    const cuerpo = el('tbody');
    l.forEach(x => {
      const r = el('tr', 'pr-fila');
      r.tabIndex = 0; r.setAttribute('aria-selected', String(elegido === x.itemId));
      const celda = el('td'), item = el('span', 'pr-item');
      if (imagen(x.itemId)) { const im = el('img'); im.src = imagen(x.itemId); im.alt = ''; im.onerror = () => im.remove(); item.append(im); }
      const tx = el('span'); const b = el('b', '', nombre(x.itemId));
      if (x.cambiado) b.append(el('span', 'pr-insignia', t('custom')));
      if (!x.sigueIndice) b.append(el('span', 'pr-insignia', t('fixed')));
      tx.append(b, el('small', '', x.tienda ? x.itemId : x.itemId + ' · ' + t('reference value')));
      item.append(tx); celda.append(item); r.append(celda);
      r.append(el('td', 'num', String(x.nivel || 1)), el('td', 'num', x.tienda && x.compra > 0 ? precio(x.compra, x.moneda) : '—'), el('td', 'num', precio(x.venta, x.moneda)));
      [x.cambio1, x.cambio7, x.cambio30].forEach(v => r.append(el('td', 'num ' + clasePct(v), pct(v))));
      const cs = el('td'); cs.append(sparkline(x.spark, x.cambio30 === null ? null : x.cambio30 >= 0)); r.append(cs);
      r.append(el('td', 'num', x.p2p && x.p2p.n ? fmt(x.p2p.mediana / (POR[x.moneda] || 1), 2) + ' ' + t(MONEDA[x.moneda]) + ' · ' + fmt(x.p2p.n) : '—'));
      r.append(el('td', 'num', x.tienda7 ? fmt(x.tienda7.compras) + ' / ' + fmt(x.tienda7.ventas) : '—'));
      const ir = () => abrir(x.itemId);
      r.addEventListener('click', ir);
      r.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); } });
      cuerpo.append(r);
    });
    tb.append(cuerpo);
    $('pr-tabla').replaceChildren(tb);
  }
  $('pr-filtros').addEventListener('submit', e => e.preventDefault());
  ['pr-q', 'pr-f', 'pr-o'].forEach(id => $(id).addEventListener('input', () => { if (datos) pintarTabla(); }));

  // ── EL DETALLE DE UN OBJETO ───────────────────────────────────────────────
  const vivos = {};
  function grafico(id, op) {
    const caja = $(id);
    if (!caja || !G) return;
    if (vivos[id]) { vivos[id].destruir(); delete vivos[id]; }
    vivos[id] = G.crear(caja, Object.assign({ idioma: ui.language === 'es' ? 'es' : 'en', alto: 240, rango: '90d', rangos: ['7d', '30d', '90d', 'todo'] }, op));
  }
  async function abrir(itemId, silencioso) {
    const x = datos && datos.items.find(i => i.itemId === itemId);
    if (!x) return;
    if (elegido !== itemId) sucio = false;
    elegido = itemId;
    document.querySelectorAll('.pr-fila').forEach(f => f.setAttribute('aria-selected', 'false'));
    $('pr-detalle').hidden = false;
    $('pr-d-title').textContent = nombre(itemId);
    $('pr-d-tipo').textContent = x.tienda ? t('Game shop item') : t('Not sold in the shop · reference value');
    $('pr-d-sub').textContent = itemId + ' · ' + t('level') + ' ' + (x.nivel || 1) + ' · ' + t('demand ×') + fmt(x.demanda, 3) + ' · ' + t('price index ×') + fmt(datos.indice, 4);
    const im = $('pr-d-img'); if (imagen(itemId)) { im.src = imagen(itemId); im.hidden = false; } else im.hidden = true;
    if (!silencioso) $('pr-detalle').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!sucio) rellenarEditor(x);
    try {
      detalle = await session.request('/api/economia/precio/' + encodeURIComponent(itemId) + '?dias=365');
    } catch (e) { detalle = null; }
    if (elegido !== itemId) return;
    pintarDetalle(x);
  }
  function pintarDetalle(x) {
    const d = detalle || {}, moneda = x.moneda;
    const conv = (v, m) => Number(v) * (POR[m] || 1) / (POR[moneda] || 1);
    const hist = (d.historial || []).map(h => ({ t: Date.parse(h.t), compra: conv(h.compra, h.moneda), venta: conv(h.venta, h.moneda) }));
    const p2p = d.p2p && d.p2p.resumen;
    $('pr-d-kpis').replaceChildren(
      kpi(x.tienda && x.compra > 0 ? precio(x.compra, moneda) : '—', 'Buy price today'), kpi(precio(x.venta, moneda), x.tienda ? 'Sell price today' : 'Reference value today'),
      kpi(precio(x.base.compra > 0 ? x.base.compra : x.base.venta, x.base.moneda), 'Default price'), kpi(pct(x.cambio30), 'Change, 30 days'),
      kpi(fmt(d.valorBronce || x.valorBronce) + ' ' + t('bronze'), 'Market value (burns, services)'),
      kpi(p2p && p2p.n ? fmt(conv(p2p.mediana, 'bronce'), 2) + ' ' + t(MONEDA[moneda]) : '—', 'P2P median, 14 days'));
    if (!G) return;
    const fmtP = v => fmt(v, v < 10 ? 2 : 0) + ' ' + t(MONEDA[moneda]);
    const series = [];
    if (hist.some(h => h.compra > 0)) series.push({ id: 'compra', nombre: t('Buy'), color: '#3987e5', escalon: true, area: true });
    if (hist.some(h => h.venta > 0)) series.push({ id: 'venta', nombre: x.tienda ? t('Sell') : t('Value'), color: '#d95926', escalon: true });
    const defecto = x.base.compra > 0 ? x.base.compra : x.base.venta;
    grafico('pr-g-precio', { etiqueta: t('Price history'), hastaAhora: true, series,
      datos: { compra: hist.filter(h => h.compra > 0).map(h => [h.t, h.compra]), venta: hist.filter(h => h.venta > 0).map(h => [h.t, h.venta]) },
      referencia: defecto > 0 ? { valor: conv(defecto, x.base.moneda), nombre: t('default') } : null,
      formato: fmtP, vacio: t('No price history yet: the first point is written with the next daily snapshot.') });
    const porDia = {};
    ((d.p2p && d.p2p.ventas) || []).forEach(v => {
      const tt = Date.parse(v.t); if (!isFinite(tt)) return;
      const dia = Math.floor(tt / 86400000) * 86400000;
      (porDia[dia] = porDia[dia] || []).push(conv(v.precio, v.moneda));
    });
    const dias = Object.keys(porDia).map(Number).sort((a, b) => a - b);
    grafico('pr-g-p2p', { etiqueta: t('P2P daily median'), rango: 'todo', rangos: ['30d', '90d', 'todo'], alto: 200,
      series: [{ id: 'm', nombre: t('P2P median'), color: '#199e70' }],
      datos: { m: dias.map(tt => { const p = porDia[tt].slice().sort((a, b) => a - b); return [tt, p[Math.floor(p.length / 2)]]; }) },
      formato: fmtP, vacio: t('No P2P sales in the last 90 days.') });
    grafico('pr-g-tienda', { tipo: 'barras', etiqueta: t('Shop units per day'), rango: 'todo', rangos: [], alto: 180,
      series: [{ id: 'c', nombre: t('Bought'), color: '#3987e5' }, { id: 'v', nombre: t('Sold'), color: '#d95926' }],
      datos: { c: (d.tienda || []).map(r => [r.dia, r.compras]), v: (d.tienda || []).map(r => [r.dia, r.ventas]) },
      formato: v => fmt(v), vacio: t('Nobody bought or sold it in the shop in the last 30 days.') });
  }

  // ── EL EDITOR DEL PRECIO POR DEFECTO ──────────────────────────────────────
  function rellenarEditor(x) {
    $('pr-e-moneda').value = x.base.moneda || x.moneda;
    $('pr-e-compra').value = x.tienda ? String(x.base.compra || 0) : '0';
    $('pr-e-venta').value = String(x.base.venta || 0);
    $('pr-e-indice').checked = x.sigueIndice !== false;
    $('pr-e-compra-l').hidden = !x.tienda;
    $('pr-e-venta-t').textContent = x.tienda ? t('Sell price (what the shop pays)') : t('Reference value (per unit)');
    $('pr-e-quitar').disabled = !x.cambiado;
    $('pr-e-nota').textContent = x.tienda
      ? t('The price players see today = default price × price index × demand (unless it does not follow the economy). Players see a change the next time they open the shop.')
      : t('The shop does not sell this item. Its reference value is what it is worth when it is burned, smelted or crafted.');
    $('pr-e-estado').textContent = '';
    vistaPrevia();
  }
  function vistaPrevia() {
    const x = datos && datos.items.find(i => i.itemId === elegido);
    if (!x) return;
    const m = $('pr-e-moneda').value, c = Math.max(0, Math.floor(Number($('pr-e-compra').value) || 0)), v = Math.max(0, Math.floor(Number($('pr-e-venta').value) || 0));
    const sigue = $('pr-e-indice').checked, f = sigue ? (datos.indice || 1) * (x.demanda || 1) : 1;
    const hoyC = c > 0 ? Math.max(1, Math.round(c * f)) : 0;
    let hoyV = v > 0 ? Math.max(1, Math.round(v * f)) : 0;
    if (hoyC > 0 && hoyV >= hoyC) hoyV = Math.max(0, hoyC - 1);
    const caja = $('pr-e-vista');
    caja.replaceChildren();
    const linea = (k, val) => { const p = el('div'); p.append(document.createTextNode(t(k) + ' '), el('b', '', val)); caja.append(p); };
    if (x.tienda && c > 0) linea('Players will pay today:', fmt(hoyC) + ' ' + t(MONEDA[m]) + ' (' + fmt(hoyC * POR[m]) + ' ' + t('bronze') + ')');
    linea(x.tienda ? 'The shop will pay today:' : 'Worth today:', fmt(hoyV) + ' ' + t(MONEDA[m]) + ' (' + fmt(hoyV * POR[m]) + ' ' + t('bronze') + ')');
    if (sigue) linea('Factor (index × demand):', '×' + fmt(f, 4));
    const mal = x.tienda && c > 0 && v >= c;
    if (mal) caja.append(el('div', 'pr-baja', t('The sell price must be lower than the buy price.')));
    $('pr-e-guardar').disabled = ocupado || mal || (!c && !v) || (x.tienda && x.base.compra > 0 && !c);
  }
  $('pr-editor').addEventListener('input', () => { sucio = true; vistaPrevia(); });
  $('pr-editor').addEventListener('submit', async ev => {
    ev.preventDefault();
    if (ocupado || !elegido) return;
    const x = datos.items.find(i => i.itemId === elegido);
    const cuerpo = { itemId: elegido, moneda: $('pr-e-moneda').value, compra: Math.floor(Number($('pr-e-compra').value) || 0),
                     venta: Math.floor(Number($('pr-e-venta').value) || 0), sigueIndice: $('pr-e-indice').checked };
    if (!x.tienda) cuerpo.compra = 0;
    const estado = $('pr-e-estado');
    ocupado = true; estado.textContent = t('Saving…');
    try {
      await session.request('/api/admin/precios/item', { method: 'POST', body: JSON.stringify(cuerpo) });
      sucio = false; estado.textContent = t('Saved. The chart shows the new point.');
      ocupado = false; await cargar();
    } catch (e) {
      estado.textContent = e && e.code === 'venta_mayor' ? t('The sell price must be lower than the buy price.') : (e && (e.message || e.code)) || t('Could not save.');
    } finally { ocupado = false; vistaPrevia(); }
  });
  $('pr-e-quitar').addEventListener('click', async () => {
    if (ocupado || !elegido) return;
    if (!root.confirm(t('Go back to the original default price of this item?'))) return;
    const estado = $('pr-e-estado');
    ocupado = true; estado.textContent = t('Restoring…');
    try {
      await session.request('/api/admin/precios/item', { method: 'POST', body: JSON.stringify({ itemId: elegido, quitar: true }) });
      sucio = false; estado.textContent = t('Restored.');
      ocupado = false; await cargar();
    } catch (e) { estado.textContent = (e && e.message) || t('Could not restore.'); }
    finally { ocupado = false; }
  });
  $('pr-d-cerrar').addEventListener('click', () => {
    elegido = null; detalle = null; sucio = false; $('pr-detalle').hidden = true;
    Object.keys(vivos).forEach(k => { vivos[k].destruir(); delete vivos[k]; });
    document.querySelectorAll('.pr-fila').forEach(f => f.setAttribute('aria-selected', 'false'));
  });

  $('pr-connect').addEventListener('click', () => verificar(true));
  $('pr-refresh').addEventListener('click', () => cargar());
  root.addEventListener('pagehide', ev => { if (ev.persisted) return; cerrado = true; clearInterval(reloj); });
  verificar(false);
})(window);
