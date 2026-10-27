/* ===========================================================================
 * gf-economia.js — LA ECONOMÍA EN EL PANEL DE MONEDAS             (2026-10-26)
 * ===========================================================================
 *
 * "Quiero que la gente tenga un precio de la moneda para comprar el oro que no
 * sea al dólar, sino algo estable que suba y baje según la inflación y los
 * datos de la economía; dale en ese panel un gráfico para que vean si la
 * economía de las tres monedas va bien o mal, el de la inflación y demás; y un
 * botón con un input para elegir cuánto oro comprar, que cobre en la moneda de
 * LitVM testnet, compre esa cantidad sin errores y se integre a la economía."
 *
 * QUIÉN MANDA: el servidor (server2.js, "LA ECONOMÍA"). Aquí:
 *   · GET  /api/economia/estado       precio, salud, gráficos, comisiones, tesoros
 *   · GET  /api/currency/oro/estado   lo mío: cuánto llevo hoy, tope, pendientes
 *   · POST /api/currency/oro/cotizar  {oro}  → id, wei, destino (15 min)
 *   · el PAGO lo firma el jugador: MetaMask (eth_sendTransaction) o la cartera
 *     del juego (gfWallet.sendNative, que pide su clave);
 *   · POST /api/currency/oro/confirmar {id, txHash} → el servidor mira la
 *     cadena y da el oro. Si aún no está confirmado (202), se vuelve a mirar.
 *   El hash se guarda en el navegador NADA MÁS firmarlo: si se cierra la página
 *   a medias, el panel lo ofrece como pendiente ("Check again").
 *
 * También: GFEconomia.comisionCambio(direccion, cantidad) — la comisión de los
 * cambios de moneda, la MISMA cuenta que gfComisionCambio del servidor (para
 * enseñarla antes de cambiar). Con un servidor viejo (sin /api/economia) es 0.
 * ======================================================================== */
(function () {
  'use strict';
  if (window.GFEconomia) return;

  var CHAIN_ID = 4441;
  var RED = {
    chainId: '0x1159', chainName: 'LitVM LiteForge',
    rpcUrls: ['https://liteforge.rpc.caldera.xyz/http'],
    nativeCurrency: { name: 'zkLTC', symbol: 'zkLTC', decimals: 18 },
    blockExplorerUrls: ['https://liteforge.explorer.caldera.xyz']
  };
  var SALUD = {
    sin_datos: { txt: 'Collecting data', ico: '◌', color: '#9fb3c8', nota: 'The index needs a few days of history.' },
    deflacion: { txt: 'Deflation', ico: '▼', color: '#7cc4f2', nota: 'Fewer coins than last week: Gold gets cheaper.' },
    estable: { txt: 'Stable', ico: '✓', color: '#6fcf97', nota: 'Coins grow at a healthy pace.' },
    caliente: { txt: 'Warming up', ico: '!', color: '#f2c94c', nota: 'Many new coins: Gold gets pricier and the daily limit is lower.' },
    recalentada: { txt: 'Overheated', ico: '▲', color: '#ff8a7a', nota: 'Too many new coins: Gold costs more and purchases are limited.' }
  };
  var CAMBIO_BPS = null;                  // del servidor; null = servidor viejo (sin comisión)
  var estado = null, pidiendo = null, destruido = false;
  var LS = 'gf-compra-oro:';

  function api(ruta, cuerpo) {
    if (window.GFMascota && typeof window.GFMascota.api === 'function') return window.GFMascota.api(ruta, cuerpo);
    return Promise.resolve({ ok: false, status: 0, datos: null });
  }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n, dec) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: dec === undefined ? 0 : dec, minimumFractionDigits: 0 }); }
  function zk(n) { var v = Number(n || 0); return v >= 1 ? num(v, 4) : num(v, 8); }
  function pct(v) { return v === null || v === undefined || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + (v * 100).toFixed(2) + '%'; }
  function guardar(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) {} }
  function leer(k) { try { return JSON.parse(localStorage.getItem(LS + k) || 'null'); } catch (e) { return null; } }
  function borrar(k) { try { localStorage.removeItem(LS + k); } catch (e) {} }

  /** La comisión de un cambio (la misma cuenta que el servidor). */
  function comisionCambio(direction, qty) {
    var q = Math.max(0, Math.floor(Number(qty) || 0));
    var entrega = { goldToSilver: 'oro', silverToGold: 'plata', silverToBronze: 'plata', bronzeToSilver: 'bronce' }[direction];
    var pequena = { goldToSilver: 'plata', silverToGold: 'plata', silverToBronze: 'bronce', bronzeToSilver: 'bronce' }[direction];
    if (!CAMBIO_BPS || !entrega || !q) return { moneda: pequena || null, cantidad: 0, bps: 0 };
    var bps = Number(CAMBIO_BPS[entrega]) || 0;
    return { moneda: pequena, cantidad: bps ? Math.max(1, Math.ceil(q * 1000 * bps / 10000)) : 0, bps: bps };
  }

  function cargar(forzar) {
    if (destruido) return Promise.resolve(null);
    if (estado && !forzar && Date.now() - estado.en < 60000) return Promise.resolve(estado.datos);
    if (pidiendo) return pidiendo;
    pidiendo = api('/api/economia/estado').then(function (r) {
      if (r && r.ok && r.datos && r.datos.ok) {
        estado = { en: Date.now(), datos: r.datos };
        CAMBIO_BPS = r.datos.comisiones && r.datos.comisiones.cambioBps || null;
        return r.datos;
      }
      if (r && r.status === 404) { estado = { en: Date.now(), datos: { viejo: true } }; CAMBIO_BPS = null; return estado.datos; }
      return estado ? estado.datos : null;
    }).catch(function () { return estado ? estado.datos : null; }).finally(function () { pidiendo = null; });
    return pidiendo;
  }

  // ── LOS GRÁFICOS (SVG, un eje cada uno) ───────────────────────────────────
  var ANCHO = 360, ALTO = 112, IZQ = 34, DER = 8, ARR = 10, ABA = 18;
  function ejeX(n) { return function (i) { return IZQ + (n <= 1 ? (ANCHO - IZQ - DER) / 2 : i * (ANCHO - IZQ - DER) / (n - 1)); }; }
  function marco(cuerpo, etiqueta) {
    return '<svg viewBox="0 0 ' + ANCHO + ' ' + ALTO + '" class="gfe-svg" role="img" aria-label="' + esc(etiqueta) + '">' + cuerpo + '</svg>';
  }
  function fechaCorta(d) { var p = String(d || '').split('-'); return p.length === 3 ? Number(p[2]) + '/' + Number(p[1]) : d; }
  function graficoPrecio(serie) {
    var v = serie.map(function (d) { return Number(d.precio) || 0; });
    if (!v.length) return '<div class="gfe-vacio">No price history yet.</div>';
    var min = Math.min.apply(null, v), max = Math.max.apply(null, v);
    if (max - min < max * 0.02) { max *= 1.02; min *= 0.98; }
    var x = ejeX(v.length), y = function (p) { return ARR + (max - p) / (max - min || 1) * (ALTO - ARR - ABA); };
    var linea = v.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p).toFixed(1); }).join(' ');
    var area = linea + ' L' + x(v.length - 1).toFixed(1) + ' ' + (ALTO - ABA) + ' L' + x(0).toFixed(1) + ' ' + (ALTO - ABA) + ' Z';
    var puntos = v.map(function (p, i) {
      return '<g class="gfe-pt"><rect x="' + (x(i) - 6).toFixed(1) + '" y="' + ARR + '" width="12" height="' + (ALTO - ARR - ABA) + '" fill="transparent"></rect>' +
        '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p).toFixed(1) + '" r="' + (i === v.length - 1 ? 4 : 0) + '" fill="#f2c94c" stroke="#08211a" stroke-width="2"></circle>' +
        '<title>' + esc(fechaCorta(serie[i].dia)) + ': 1 Gold = ' + zk(p) + ' zkLTC</title></g>';
    }).join('');
    return marco('<line x1="' + IZQ + '" y1="' + (ALTO - ABA) + '" x2="' + (ANCHO - DER) + '" y2="' + (ALTO - ABA) + '" class="gfe-eje"></line>' +
      '<text x="2" y="' + (ARR + 8) + '" class="gfe-t">' + esc(zk(max)) + '</text><text x="2" y="' + (ALTO - ABA) + '" class="gfe-t">' + esc(zk(min)) + '</text>' +
      '<path d="' + area + '" fill="rgba(242,201,76,.12)"></path><path d="' + linea + '" fill="none" stroke="#f2c94c" stroke-width="2" stroke-linejoin="round"></path>' + puntos +
      etiquetasX(serie, x), 'Gold price in zkLTC, last 30 days');
  }
  function etiquetasX(serie, x) {
    // Cada 7 días contando desde HOY (el último siempre sale); el primero solo si
    // queda lejos del siguiente, para que dos fechas no se monten.
    var n = serie.length, out = '';
    for (var i = 0; i < n; i++) {
      var resto = (n - 1 - i) % 7;
      if (resto !== 0 && !(i === 0 && resto >= 3)) continue;
      var ancla = i === n - 1 && n > 1 ? 'end' : (i === 0 ? 'start' : 'middle');
      out += '<text x="' + x(i).toFixed(1) + '" y="' + (ALTO - 4) + '" text-anchor="' + ancla + '" class="gfe-t">' + esc(fechaCorta(serie[i].dia)) + '</text>';
    }
    return out;
  }
  function graficoInflacion(serie) {
    var v = serie.map(function (d) { return d.inflacion1 === null || d.inflacion1 === undefined ? null : Number(d.inflacion1); });
    if (!v.some(function (a) { return a !== null; })) return '<div class="gfe-vacio">Inflation appears after the second day of data.</div>';
    var tope = Math.max(0.01, Math.max.apply(null, v.map(function (a) { return Math.abs(a || 0); })));
    var cero = ARR + (ALTO - ARR - ABA) / 2, alto = (ALTO - ARR - ABA) / 2, x = ejeX(v.length);
    var ancho = Math.max(3, (ANCHO - IZQ - DER) / v.length - 3);
    var barras = v.map(function (a, i) {
      if (a === null) return '';
      var h = Math.abs(a) / tope * alto, yy = a >= 0 ? cero - h : cero;
      return '<g class="gfe-pt"><rect x="' + (x(i) - ancho / 2).toFixed(1) + '" y="' + yy.toFixed(1) + '" width="' + ancho.toFixed(1) + '" height="' + Math.max(1, h).toFixed(1) +
        '" rx="2" fill="' + (a >= 0 ? '#e07a5f' : '#5fa8d3') + '"></rect><title>' + esc(fechaCorta(serie[i].dia)) + ': ' + pct(a) + ' coins in circulation</title></g>';
    }).join('');
    return marco('<line x1="' + IZQ + '" y1="' + cero + '" x2="' + (ANCHO - DER) + '" y2="' + cero + '" class="gfe-eje"></line>' +
      '<text x="2" y="' + (ARR + 8) + '" class="gfe-t">' + esc(pct(tope)) + '</text><text x="2" y="' + (cero + 3) + '" class="gfe-t">0%</text>' +
      '<text x="2" y="' + (ALTO - ABA) + '" class="gfe-t">' + esc(pct(-tope)) + '</text>' + barras + etiquetasX(serie, x), 'Daily inflation, last 30 days');
  }
  /* Las tres monedas en circulación, en ÍNDICE (el primer día = 100): tienen
     escalas muy distintas y un solo eje no puede enseñarlas en unidades. */
  function graficoMasa(serie) {
    // Líneas continuas (nada de trazos ni puntos); cada una lleva su nombre al final.
    var monedas = [['oro', 'Gold', '#f2c94c'], ['plata', 'Silver', '#b8c4d6'], ['bronce', 'Bronze', '#d08a4e']];
    var series = monedas.map(function (m) {
      var base = 0;
      for (var i = 0; i < serie.length && !base; i++) base = Number(serie[i][m[0]]) || 0;
      return serie.map(function (d) { var v = Number(d[m[0]]) || 0; return base ? v / base * 100 : null; });
    });
    var todos = [].concat.apply([], series).filter(function (a) { return a !== null; });
    if (!todos.length) return '<div class="gfe-vacio">No coins in circulation yet.</div>';
    var min = Math.min.apply(null, todos.concat([100])), max = Math.max.apply(null, todos.concat([100]));
    if (max - min < 2) { max += 1; min -= 1; }
    var x = ejeX(serie.length), y = function (p) { return ARR + (max - p) / (max - min) * (ALTO - ARR - ABA); };
    var finales = [];
    var lineas = series.map(function (s, k) {
      var d = '', ult = null;
      s.forEach(function (p, i) { if (p === null) return; d += (d ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p).toFixed(1) + ' '; ult = i; });
      if (!d) return '';
      var m = monedas[k];
      // Encima del final de la línea; si no cabe arriba, debajo.
      finales.push({ nombre: m[1], y: y(s[ult]) - 5 < 9 ? y(s[ult]) + 11 : y(s[ult]) - 5 });
      return '<path d="' + d + '" fill="none" stroke="' + m[2] + '" stroke-width="2" stroke-linejoin="round"><title>' + m[1] + ': ' +
        num(s[ult], 1) + ' (day 1 = 100)</title></path>';
    }).join('');
    // Los nombres al final de cada línea, separados si caen juntos.
    finales.sort(function (a, b) { return a.y - b.y; });
    finales.forEach(function (f, k) {
      if (k && f.y - finales[k - 1].y < 10) f.y = finales[k - 1].y + 10;
      lineas += '<text x="' + (ANCHO - DER - 2) + '" y="' + f.y.toFixed(1) + '" text-anchor="end" class="gfe-t">' + esc(f.nombre) + '</text>';
    });
    return marco('<line x1="' + IZQ + '" y1="' + y(100).toFixed(1) + '" x2="' + (ANCHO - DER) + '" y2="' + y(100).toFixed(1) + '" class="gfe-eje"></line>' +
      '<text x="2" y="' + (ARR + 8) + '" class="gfe-t">' + num(max, 0) + '</text><text x="2" y="' + (ALTO - ABA) + '" class="gfe-t">' + num(min, 0) + '</text>' +
      lineas + etiquetasX(serie, x), 'Coins in circulation, index (day 1 = 100)') +
      '<div class="gfe-leyenda">' + monedas.map(function (m) {
        var ultimo = serie.length ? Number(serie[serie.length - 1][m[0]]) || 0 : 0;
        return '<span><svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke="' + m[2] + '" stroke-width="2"></line></svg> ' +
          m[1] + ' <b>' + num(ultimo) + '</b></span>';
      }).join('') + '</div>';
  }

  function estilo() {
    if (document.getElementById('gfe-estilo')) return;
    var s = document.createElement('style');
    s.id = 'gfe-estilo';
    s.textContent = [
      '.gfe-caja{background:#08211a;border:1px solid #24503f;border-radius:12px;padding:10px 12px;margin-bottom:10px;font-size:12px;line-height:1.5;color:#e8f3ee}',
      '.gfe-precio{display:flex;align-items:center;gap:10px}',
      '.gfe-precio img{width:30px;height:30px;image-rendering:pixelated}',
      '.gfe-precio b{font-size:clamp(16px,4.4vw,20px);color:#ffd23f}',
      '.gfe-sub{color:#8fb8ff;font-size:11px}',
      '.gfe-salud{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:2px 10px;font-weight:bold;font-size:12px;border:1px solid currentColor}',
      '.gfe-fila{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}',
      '.gfe-tit{color:#bcd6c9;font-weight:bold;margin:2px 0 4px;display:flex;justify-content:space-between;gap:6px}',
      '.gfe-svg{width:100%;height:auto;display:block}',
      '.gfe-eje{stroke:rgba(188,214,201,.28);stroke-width:1}',
      '.gfe-t{fill:#8aa89c;font:10px Arial,sans-serif}',
      '.gfe-pt:hover circle{r:4}',
      '.gfe-vacio{color:#8aa89c;font-size:11px;padding:16px 0;text-align:center}',
      '.gfe-leyenda{display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:#bcd6c9;margin-top:4px}',
      '.gfe-leyenda span{display:inline-flex;align-items:center;gap:4px}',
      '.gfe-input{display:flex;align-items:center;gap:8px;margin:8px 0}',
      '.gfe-input input{flex:1;height:44px;text-align:center;font-size:18px;font-weight:bold;border-radius:10px;border:2px solid #ffd23f;background:#0b2b22;color:#fff;min-width:0}',
      '.gfe-input button{width:44px;height:44px;font-size:22px;border:none;border-radius:10px;background:#1b3d31;color:#fff;cursor:pointer}',
      '.gfe-clave{width:100%;box-sizing:border-box;height:40px;border-radius:10px;border:1px solid #2b5c4a;background:#0b2b22;color:#fff;padding:0 10px;margin:4px 0 8px}',
      '.gfe-comprar{width:100%;min-height:48px;border:none;border-radius:12px;background:#2e7d32;color:#fff;font-weight:bold;font-size:16px;cursor:pointer}',
      '.gfe-comprar[disabled]{opacity:.55;cursor:default}',
      '.gfe-msg{margin-top:8px;font-size:12px;text-align:center;min-height:16px}',
      '.gfe-pend{display:flex;justify-content:space-between;align-items:center;gap:8px;border-top:1px dashed #24503f;padding-top:6px;margin-top:6px}',
      '.gfe-pend button{border:none;border-radius:8px;background:#4a3d6a;color:#fff;padding:6px 10px;cursor:pointer;min-height:34px}',
      '.gfe-tabs{display:flex;gap:6px;margin:6px 0}',
      '.gfe-tabs button{flex:1;min-height:32px;border:none;border-radius:8px;background:#1b3d31;color:#cfe3da;font-size:11px;font-weight:bold;cursor:pointer}',
      '.gfe-tabs button[aria-pressed="true"]{background:#ffd23f;color:#20160a}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── EL PAGO ───────────────────────────────────────────────────────────────
  function aEther(weiStr) {
    var w = BigInt(weiStr), e = 1000000000000000000n;
    var entero = w / e, resto = (w % e).toString().padStart(18, '0').replace(/0+$/, '');
    return entero.toString() + (resto ? '.' + resto : '');
  }
  /** ¿Con qué paga este jugador? 'juego' (cartera embebida), 'metamask' o null. */
  function metodoDePago(direccion) {
    try {
      var w = window.gfWallet;
      if (w && typeof w.getAddress === 'function' && typeof w.sendNative === 'function') {
        var a = String(w.getAddress() || '').toLowerCase();
        if (a && a === String(direccion || '').toLowerCase()) return 'juego';
      }
    } catch (e) {}
    var p = window.ethereum;
    if (p && p.request && !p.isGFWallet) return 'metamask';
    return null;
  }
  async function pagarConMetamask(cot, direccion) {
    var p = window.ethereum;
    var cuentas = await p.request({ method: 'eth_requestAccounts' });
    var cuenta = String(cuentas && cuentas[0] || '').toLowerCase();
    if (cuenta !== String(direccion).toLowerCase()) throw new Error('Switch your browser wallet to your game account (' + direccion.slice(0, 6) + '…' + direccion.slice(-4) + ').');
    var red = await p.request({ method: 'eth_chainId' });
    if (parseInt(red, 16) !== CHAIN_ID) {
      try { await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: RED.chainId }] }); }
      catch (e) {
        if (e && (e.code === 4902 || /unrecognized|not added/i.test(e.message || ''))) await p.request({ method: 'wallet_addEthereumChain', params: [RED] });
        else throw new Error('Switch your wallet to LitVM LiteForge to pay.');
      }
    }
    return p.request({ method: 'eth_sendTransaction', params: [{ from: cuenta, to: cot.destino, value: '0x' + BigInt(cot.wei).toString(16) }] });
  }
  async function pagarConCartera(cot, secreto) {
    var r = await window.gfWallet.sendNative(cot.destino, aEther(cot.wei), secreto);
    return r && r.hash;
  }

  // ── EL PANEL ──────────────────────────────────────────────────────────────
  function montarCompra(cont, scene, walletInfo) {
    if (!cont) return;
    estilo();
    var vivo = function () { return !destruido && cont.isConnected; };
    var direccion = String((walletInfo && walletInfo.address) || (scene && (scene.address || scene.playerName)) || '');
    var mio = null, ocupado = false, grafico = 'precio';
    cont.innerHTML = '<div class="gfe-vacio">Loading the economy…</div>';

    function pintar(d) {
      if (!vivo()) return;
      if (!d) { cont.innerHTML = '<div class="gfe-caja">The economy data could not be loaded. Close and open this panel again.</div>'; return; }
      if (d.viejo) {
        cont.innerHTML = '<div class="gfe-caja">Gold purchases with zkLTC open with the next game server update.</div>';
        return;
      }
      var s = SALUD[d.salud] || SALUD.sin_datos;
      var serie = Array.isArray(d.serie) ? d.serie : [];
      var ayer = serie.length > 1 ? Number(serie[serie.length - 2].precio) || 0 : 0;
      var cambio = ayer ? (d.precioOro.zkltc - ayer) / ayer : null;
      var com = d.comisiones || {}, cb = com.cambioBps || {};
      var metodo = metodoDePago(direccion);
      var quedan = mio ? mio.quedan : d.tope;
      cont.innerHTML =
        '<div class="gfe-caja"><div class="gfe-precio"><img src="./Game/Source/moneda de oro.png" alt="">' +
          '<div style="flex:1;min-width:0"><div class="gfe-sub">Gold price today · Grassland index</div><b>1 Gold = ' + esc(zk(d.precioOro.zkltc)) + ' zkLTC</b>' +
          '<div class="gfe-sub">' + (cambio === null ? 'Base ' + esc(zk(d.precioOro.base)) + ' zkLTC' : 'vs yesterday ' + esc(pct(cambio))) + '</div></div>' +
          '<span class="gfe-salud" style="color:' + s.color + '" title="' + esc(s.nota) + '">' + s.ico + ' ' + esc(s.txt) + '</span></div>' +
          '<div class="gfe-sub" style="margin-top:6px">' + esc(s.nota) + ' Not tied to the dollar: it follows the game’s own inflation (7 days: <b>' + esc(pct(d.inflacion7)) + '</b>).</div></div>' +
        '<div class="gfe-caja"><div class="gfe-tabs" role="group" aria-label="Economy charts">' +
          '<button type="button" data-g="precio" aria-pressed="' + (grafico === 'precio') + '">Gold price</button>' +
          '<button type="button" data-g="inflacion" aria-pressed="' + (grafico === 'inflacion') + '">Inflation</button>' +
          '<button type="button" data-g="masa" aria-pressed="' + (grafico === 'masa') + '">3 coins</button></div>' +
          '<div class="gfe-grafico">' + (grafico === 'inflacion' ? graficoInflacion(serie) : grafico === 'masa' ? graficoMasa(serie) : graficoPrecio(serie)) + '</div></div>' +
        '<div class="gfe-caja"><div class="gfe-tit"><span>Buy Gold with zkLTC</span><span class="gfe-sub">LitVM testnet</span></div>' +
          (d.compra && d.compra.activa ? (
          '<div class="gfe-sub">You can buy <b>' + num(quedan) + '</b> more Gold today (daily limit ' + num(d.tope) + ', lower when inflation is high).</div>' +
          '<div class="gfe-input"><button type="button" data-q="-1" aria-label="Less">−</button><input type="number" inputmode="numeric" min="1" value="' + Math.max(1, Math.min(10, quedan || 1)) + '" aria-label="How much Gold" class="gfe-oro"><button type="button" data-q="1" aria-label="More">+</button></div>' +
          '<div class="gfe-total" style="text-align:center;color:#ffd23f;margin-bottom:8px;font-size:13px"></div>' +
          (metodo === 'juego' ? '<input type="password" class="gfe-clave" autocomplete="current-password" placeholder="Your wallet key (to sign the payment)" aria-label="Wallet key">' : '') +
          (metodo ? '' : '<div class="gfe-sub" style="color:#ffb86b">No wallet that can pay was found. Sign in with your game wallet or open the game with MetaMask.</div>') +
          '<button type="button" class="gfe-comprar"' + (metodo && quedan > 0 ? '' : ' disabled') + '>Buy Gold</button>' +
          '<div class="gfe-msg" role="status" aria-live="polite"></div>' +
          '<div class="gfe-sub">You pay from your game wallet to the game treasury (' + esc(String(d.compra.destino).slice(0, 6) + '…' + String(d.compra.destino).slice(-4)) + '). Gold is credited when the payment is confirmed on-chain.</div>' +
          '<div class="gfe-pendientes"></div>'
          ) : '<div class="gfe-sub" style="color:#ffb86b">Gold purchases are paused right now.</div>') + '</div>' +
        '<div class="gfe-caja"><div class="gfe-tit"><span>Where the fees go</span></div>' +
          '<div class="gfe-fila"><span>Shop &amp; P2P market</span><b>' + num(com.mercadoBps / 100, 2) + '%</b></div>' +
          '<div class="gfe-sub">' + num(com.circularBps / 100, 2) + '% to the circular-economy treasury (monster coin drops) · ' + num(com.juegoBps / 100, 2) + '% to the game treasury</div>' +
          '<div class="gfe-fila" style="margin-top:4px"><span>Exchange fees → circular treasury</span><b>Gold ' + num(cb.oro / 100, 2) + '% · Silver ' + num(cb.plata / 100, 2) + '% · Bronze ' + num(cb.bronce / 100, 2) + '%</b></div>' +
          '<div class="gfe-fila" style="margin-top:4px"><span>Treasuries now</span><span>Circular <b>' + num(d.tesoros.circular) + '</b> · Game <b>' + num(d.tesoros.juego) + '</b> Bronze</span></div>' +
          '<div class="gfe-sub">Map travel, VIP and revive potions go to the game treasury.</div></div>';
      cablear(d);
    }

    function cablear(d) {
      Array.prototype.forEach.call(cont.querySelectorAll('[data-g]'), function (b) {
        b.onclick = function () { grafico = b.getAttribute('data-g'); pintar(d); };
      });
      var inp = cont.querySelector('.gfe-oro');
      if (!inp) { pintarPendientes(); return; }
      var total = cont.querySelector('.gfe-total');
      var quedan = function () { return mio ? mio.quedan : d.tope; };
      var actualizar = function () {
        var q = Math.max(1, Math.min(Math.max(1, quedan()), Math.floor(Number(inp.value) || 1)));
        if (String(q) !== inp.value) inp.value = q;
        total.textContent = q + ' Gold = ' + zk(q * d.precioOro.zkltc) + ' zkLTC';
      };
      Array.prototype.forEach.call(cont.querySelectorAll('[data-q]'), function (b) {
        b.onclick = function () { inp.value = (Math.floor(Number(inp.value) || 1) + Number(b.getAttribute('data-q'))); actualizar(); };
      });
      inp.oninput = actualizar;
      actualizar();
      cont.querySelector('.gfe-comprar').onclick = function () { comprar(Math.floor(Number(inp.value) || 0), d); };
      pintarPendientes();
    }

    function mensaje(txt, color) {
      var m = cont.querySelector('.gfe-msg');
      if (m) { m.style.color = color || '#ffd23f'; m.textContent = txt; }
    }

    function pintarPendientes() {
      var caja = cont.querySelector('.gfe-pendientes');
      if (!caja || !mio) return;
      var lista = (mio.pendientes || []).filter(function (p) { return p.txHash || leer(p.id); });
      caja.innerHTML = lista.map(function (p) {
        return '<div class="gfe-pend"><span>' + num(p.oro) + ' Gold · ' + esc(zk(p.zkltc)) + ' zkLTC <span class="gfe-sub">(waiting for the chain)</span></span>' +
          '<button type="button" data-revisar="' + esc(p.id) + '">Check again</button></div>';
      }).join('');
      Array.prototype.forEach.call(caja.querySelectorAll('[data-revisar]'), function (b) {
        b.onclick = function () {
          var id = b.getAttribute('data-revisar'), p = (mio.pendientes || []).filter(function (x) { return x.id === id; })[0];
          var hash = (p && p.txHash) || (leer(id) || {}).hash;
          if (hash) confirmar(id, hash, 0);
        };
      });
    }

    function refrescarMio() {
      return api('/api/currency/oro/estado').then(function (r) {
        if (r && r.ok && r.datos && r.datos.ok) mio = r.datos;
        return mio;
      }).catch(function () { return mio; });
    }

    async function comprar(oro, d) {
      if (ocupado || !vivo()) return;
      var metodo = metodoDePago(direccion);
      if (!metodo) { mensaje('No wallet that can pay was found.', '#ff8a8a'); return; }
      var secreto = '';
      if (metodo === 'juego') {
        var c = cont.querySelector('.gfe-clave');
        secreto = c ? c.value : '';
        if (!secreto) { mensaje('Type your wallet key to sign the payment.', '#ff8a8a'); return; }
      }
      if (!(oro >= 1)) { mensaje('Choose how much Gold to buy.', '#ff8a8a'); return; }
      ocupado = true;
      var boton = cont.querySelector('.gfe-comprar');
      if (boton) { boton.disabled = true; boton.textContent = '⏳ Preparing…'; }
      try {
        var r = await api('/api/currency/oro/cotizar', { oro: oro });
        var cot = r && r.datos;
        if (!(r && r.ok && cot && cot.ok)) {
          var e = cot && cot.error;
          mensaje(e === 'tope_diario' ? 'Daily limit reached: you can buy ' + num(cot.quedan) + ' more today.' :
                  e === 'compra_cerrada' ? 'Gold purchases are paused right now.' :
                  e === 'cantidad_invalida' ? 'The minimum is ' + num(cot.minimo) + ' Gold.' : 'Could not prepare the purchase. Try again.', '#ff8a8a');
          return;
        }
        if (!window.confirm('Buy ' + num(cot.oro) + ' Gold for ' + zk(cot.zkltc) + ' zkLTC?\nIt will be paid from your game wallet to the game treasury.')) { mensaje(''); return; }
        if (boton) boton.textContent = '⏳ Sign the payment…';
        mensaje('Confirm the payment in your wallet…');
        var hash = metodo === 'juego' ? await pagarConCartera(cot, secreto) : await pagarConMetamask(cot, direccion);
        if (!hash) throw new Error('The wallet did not return the payment.');
        // Antes de nada más: si la página se cierra ahora, el pago no se pierde.
        guardar(cot.id, { hash: hash, oro: cot.oro, en: Date.now() });
        var clave = cont.querySelector('.gfe-clave');
        if (clave) clave.value = '';
        await confirmar(cot.id, hash, 0);
      } catch (e2) {
        var txt = String(e2 && (e2.message || e2) || '');
        mensaje(/denied|rejected|cancel/i.test(txt) ? 'Payment cancelled.' : /insufficient/i.test(txt) ? 'Not enough zkLTC (remember the gas).' : txt.slice(0, 160) || 'The payment failed.', '#ff8a8a');
      } finally {
        ocupado = false;
        if (vivo() && boton) { boton.disabled = false; boton.textContent = 'Buy Gold'; }
      }
    }

    async function confirmar(id, hash, intento) {
      if (!vivo()) return;
      mensaje('⏳ Waiting for the payment to confirm on-chain…');
      var r = await api('/api/currency/oro/confirmar', { id: id, txHash: hash });
      var d = r && r.datos || {};
      if (r && r.ok && d.ok) {
        borrar(id);
        if (window.GFBronce && d.stats) window.GFBronce.adoptarStats(d.stats);
        try { if (scene && d.stats && typeof d.stats.oro === 'number') scene.moneda = d.stats.oro; } catch (e) {}
        mensaje('✓ +' + num(d.oro) + ' Gold' + (d.tarde ? ' (paid after the quote expired: credited at today’s price)' : '') + '.', '#6fcf97');
        try { if (scene && scene.notifications) scene.notifications.show('+' + num(d.oro) + ' Gold bought with zkLTC', 'success'); } catch (e) {}
        await refrescarMio();
        cargar(true).then(function (x) { if (vivo()) { pintar(x); mensaje('✓ +' + num(d.oro) + ' Gold.', '#6fcf97'); } });
        return;
      }
      if (r && r.status === 202 && intento < 25) {
        setTimeout(function () { confirmar(id, hash, intento + 1); }, 4000);
        return;
      }
      if (r && r.status === 202) { mensaje('The payment is still pending. Use “Check again” in a minute.', '#ffb86b'); refrescarMio().then(pintarPendientes); return; }
      mensaje(d.message || ({ otra_cartera: 'The payment came from another wallet.', otro_destino: 'The payment went to another address.',
        hash_ya_usado: 'That payment was already used.', revertida: 'The payment transaction failed on-chain.' }[d.error]) || 'Could not confirm the payment. Try “Check again”.', '#ff8a8a');
    }

    Promise.all([cargar(false), refrescarMio()]).then(function (x) {
      pintar(x[0]);
      // La comisión de los cambios ya se conoce: que las vistas previas la enseñen.
      ['gfc-e-qty', 'gfb-qty'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) { try { el.dispatchEvent(new Event('input')); } catch (e) {} }
      });
    });
  }

  function destruir(e) { if (e && e.persisted) return; destruido = true; }
  window.addEventListener('pagehide', destruir);
  // La comisión de los cambios tiene que estar antes de abrir el panel.
  setTimeout(function () { cargar(false); }, 4000);

  window.GFEconomia = { montarCompra: montarCompra, comisionCambio: comisionCambio, cargar: cargar,
                        _interno: { graficoPrecio: graficoPrecio, graficoInflacion: graficoInflacion, graficoMasa: graficoMasa, aEther: aEther } };
})();
