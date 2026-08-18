/**
 * PANEL DE CARTERA DEL DASHBOARD                              (2026-08-05)
 * ============================================================================
 * Vive aquí y no dentro de una escena de Phaser a propósito: el dashboard
 * (#hub-panel_101) es DOM de la página, compartido por GameScene y por
 * tiendajuego. Si el código estuviera en una escena habría que duplicarlo y
 * volver a enlazarlo en cada cambio de escena; aquí se enlaza UNA vez.
 *
 * Dos casos, como pidió el juego:
 *   · Jugador con MetaMask → mensaje en inglés diciendo que esta categoría no
 *     le hace falta (su cartera la gestiona la extensión).
 *   · Jugador con wallet integrada (entró con Google/Facebook/Apple) →
 *     dirección completa, saldo zkLTC, red, enviar, recibir, actividad y un
 *     apartado de seguridad con la clave privada y el sistema código⇄clave.
 *
 * Sobre el valor en dólares: zkLTC es un token de RED DE PRUEBAS. No cotiza en
 * ningún sitio, así que enseñar un "$" inventado sería mentir. Se dice
 * claramente que no tiene valor monetario.
 */
(function () {
  'use strict';

  var ENLAZADO = false;
  var PINTADO  = false;

  function $(id) { return document.getElementById(id); }

  function esc(v) {
    var d = document.createElement('div');
    d.textContent = v == null ? '' : String(v);
    return d.innerHTML;
  }

  function corta(a) {
    a = String(a || '');
    return a.length > 14 ? a.slice(0, 8) + '…' + a.slice(-6) : a;
  }

  function cuando(ms) {
    if (!ms) return '';
    var s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60)    return s + 's';
    if (s < 3600)  return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    return Math.floor(s / 86400) + 'd';
  }

  /**
   * Devuelve la wallet embebida del jugador, esté abierta o no.
   *
   * OJO CON EL ORIGEN (arreglado 2026-08-05): la mitad del dispositivo se
   * guarda en IndexedDB del LOGIN (app.grasslandforest.com), e IndexedDB no se
   * comparte entre dominios. En el JUEGO (game.grasslandforest.com) esa mitad
   * no existe, así que la wallet nunca llega a "abrirse" — y antes eso se
   * confundía con "no tiene wallet embebida" y se enseñaba el mensaje de
   * MetaMask a quien había entrado con Google.
   *
   * Basta con que tenga DIRECCIÓN: saldo, red, actividad y recibir funcionan
   * sin la clave. Enviar o ver la clave privada la piden aparte (código/clave),
   * y eso sí funciona desde cualquier origen.
   */
  function walletEmbebida() {
    try {
      var w = window.gfWallet;
      if (w && typeof w.getAddress === 'function' && w.getAddress()) return w;
    } catch (e) {}
    return null;
  }

  /**
   * Se asegura de que la wallet haya intentado adoptar la sesión antes de
   * decidir qué pintar. Sin esto, abrir el dashboard demasiado pronto (antes de
   * que termine /api/wallet/whoami) enseñaba el mensaje de MetaMask por error.
   */
  function prepararWallet() {
    var w = window.gfWallet;
    if (!w) return Promise.resolve(null);
    if (typeof w.getAddress === 'function' && w.getAddress()) return Promise.resolve(w);
    if (typeof w.adoptSession !== 'function') return Promise.resolve(null);
    return w.adoptSession()
      .then(function (r) { return (r && r.embedded) ? w : null; })
      .catch(function () { return null; });
  }

  function mensaje(texto, clase) {
    var m = $('gfw-w-msg');
    if (!m) return;
    m.className = 'gfw-w-msg ' + (clase || '');
    m.textContent = texto || '';
  }

  // ── Vista para quien usa MetaMask ──────────────────────────────────────
  function pintarMetaMask(cuerpo) {
    cuerpo.innerHTML =
      '<div class="gfw-w-card">' +
        '<div class="gfw-w-label">Browser wallet</div>' +
        '<div style="font-size:13px;line-height:1.7;color:#a9b4e6;">' +
          'You are signed in with MetaMask, so this section is not needed for you. ' +
          'Your address, balance, transfers and recovery are all handled by the ' +
          'MetaMask extension itself — open it from your browser toolbar.' +
        '</div>' +
      '</div>';
  }

  // ── Vista para la wallet integrada ─────────────────────────────────────
  function plantilla() {
    return '' +
      '<div class="gfw-w-card">' +
        '<div class="gfw-w-label">Your wallet address</div>' +
        '<div class="gfw-w-addr" id="gfw-w-addr">—</div>' +
        '<div class="gfw-w-actions" style="margin:10px 0 0;">' +
          '<button type="button" class="gfw-w-btn ghost" id="gfw-w-copy">Copy address</button>' +
        '</div>' +
      '</div>' +

      '<div class="gfw-w-card">' +
        '<div class="gfw-w-label">Balance</div>' +
        '<div class="gfw-w-balance"><span id="gfw-w-bal">—</span> <small id="gfw-w-sym">zkLTC</small></div>' +
        '<div class="gfw-w-fiat">Test network — these tokens have no monetary value</div>' +
        '<div class="gfw-w-net" id="gfw-w-net">—</div>' +
      '</div>' +

      '<div class="gfw-w-actions">' +
        '<button type="button" class="gfw-w-btn" id="gfw-w-send-tab">Send</button>' +
        '<button type="button" class="gfw-w-btn ghost" id="gfw-w-recv-tab">Receive</button>' +
        '<button type="button" class="gfw-w-btn ghost" id="gfw-w-cfg-tab">Settings</button>' +
      '</div>' +

      '<div class="gfw-w-msg" id="gfw-w-msg"></div>' +

      '<div id="gfw-w-send" style="display:none;">' +
        '<div class="gfw-w-card">' +
          '<div class="gfw-w-label">Send zkLTC</div>' +
          '<input class="gfw-w-input" id="gfw-w-to" placeholder="Destination address (0x...)" autocomplete="off" spellcheck="false">' +
          '<input class="gfw-w-input" id="gfw-w-amt" type="number" step="0.0001" min="0" placeholder="Amount">' +
          '<input class="gfw-w-input" id="gfw-w-secret" type="password" placeholder="Your key (or recovery code)" autocomplete="off">' +
          '<div class="gfw-w-sub" style="margin:0 0 8px;">Every transfer asks for your key. If you have not set one yet, use your recovery code.</div>' +
          '<button type="button" class="gfw-w-btn" id="gfw-w-send-go" style="width:100%;">Send</button>' +
        '</div>' +
      '</div>' +

      '<div id="gfw-w-recv" style="display:none;">' +
        '<div class="gfw-w-card">' +
          '<div class="gfw-w-label">Receive</div>' +
          '<div class="gfw-w-sub" style="margin:0 0 8px;">Send only <b>LitVM LiteForge</b> assets to this address. Anything sent on another network is lost.</div>' +
          '<div class="gfw-w-secret" id="gfw-w-recv-addr">—</div>' +
        '</div>' +
      '</div>' +

      '<div id="gfw-w-cfg" style="display:none;">' +
        '<div class="gfw-w-warn">Never share your private key or your recovery code. Anyone who has them owns your wallet, and nobody at Grassland Forest can undo that.</div>' +

        '<div class="gfw-w-card">' +
          '<div class="gfw-w-label">Code to Key</div>' +
          '<div class="gfw-w-sub" style="margin:0 0 8px;">Turn your long recovery code into a short key you can remember. The code keeps working too.</div>' +
          '<input class="gfw-w-input" id="gfw-w-code-in" placeholder="Recovery code" autocomplete="off">' +
          '<input class="gfw-w-input" id="gfw-w-key-new" type="password" placeholder="New key (min. 6 characters)" autocomplete="new-password">' +
          '<button type="button" class="gfw-w-btn" id="gfw-w-setkey" style="width:100%;">Save key</button>' +
        '</div>' +

        '<div class="gfw-w-card">' +
          '<div class="gfw-w-label">Key to Code</div>' +
          '<div class="gfw-w-sub" style="margin:0 0 8px;">Forgot the code? Type your key and get it back.</div>' +
          '<input class="gfw-w-input" id="gfw-w-key-in" type="password" placeholder="Your key" autocomplete="off">' +
          '<button type="button" class="gfw-w-btn ghost" id="gfw-w-getcode" style="width:100%;">Show my recovery code</button>' +
          '<div class="gfw-w-secret" id="gfw-w-code-out" style="display:none;margin-top:10px;"></div>' +
        '</div>' +

        '<div class="gfw-w-card">' +
          '<div class="gfw-w-label">Private key</div>' +
          '<div class="gfw-w-sub" style="margin:0 0 8px;">This wallet has no seed phrase: it is a single random private key, not a 12-word BIP-39 wallet. Import it anywhere with this value.</div>' +
          '<input class="gfw-w-input" id="gfw-w-pk-secret" type="password" placeholder="Your key (or recovery code)" autocomplete="off">' +
          '<button type="button" class="gfw-w-btn danger" id="gfw-w-showpk" style="width:100%;">Reveal private key</button>' +
          '<div class="gfw-w-secret" id="gfw-w-pk-out" style="display:none;margin-top:10px;"></div>' +
        '</div>' +
      '</div>' +

      '<div class="gfw-w-card">' +
        '<div class="gfw-w-label">Recent activity</div>' +
        '<div id="gfw-w-acts"><div class="gfw-w-sub" style="margin:0;">Loading...</div></div>' +
      '</div>';
  }

  function pintarIntegrada(cuerpo, wallet) {
    cuerpo.innerHTML = plantilla();

    var dir = wallet.getAddress();
    $('gfw-w-addr').textContent = dir;
    $('gfw-w-recv-addr').textContent = dir;

    $('gfw-w-copy').onclick = function () {
      try { navigator.clipboard.writeText(dir); mensaje('Address copied', 'ok'); }
      catch (e) { mensaje('Could not copy', 'err'); }
    };

    // Las tres secciones se abren y cierran como un acordeón: en el móvil el
    // panel es estrecho y tenerlas todas desplegadas obligaba a hacer scroll
    // sin fin.
    function alternar(cual) {
      var abierta = $('gfw-w-' + cual).style.display === 'block';
      ['send', 'recv', 'cfg'].forEach(function (k) {
        var el = $('gfw-w-' + k);
        if (el) el.style.display = (!abierta && k === cual) ? 'block' : 'none';
      });
      mensaje('');
    }
    $('gfw-w-send-tab').onclick = function () { alternar('send'); };
    $('gfw-w-recv-tab').onclick = function () { alternar('recv'); };
    $('gfw-w-cfg-tab').onclick  = function () { alternar('cfg'); };

    function refrescarSaldo() {
      return wallet.getBalance().then(function (b) {
        $('gfw-w-bal').textContent = Number(b.formatted).toFixed(4);
        $('gfw-w-sym').textContent = b.symbol;
        $('gfw-w-net').textContent = b.chainName + ' (id ' + b.chainId + ')';
      }).catch(function () {
        $('gfw-w-bal').textContent = '—';
        $('gfw-w-net').textContent = 'Network unavailable';
      });
    }
    refrescarSaldo();

    wallet.getActivity(12).then(function (r) {
      var caja = $('gfw-w-acts');
      if (!caja) return;
      if (!r.txs.length) {
        caja.innerHTML = '<div class="gfw-w-sub" style="margin:0;">' +
          (r.error ? 'Could not read the explorer right now.' : 'No movements yet.') + '</div>';
        return;
      }
      caja.innerHTML = r.txs.map(function (tx) {
        return '<div class="gfw-w-act">' +
          '<span class="dir">' + (tx.incoming ? '⬇️' : '⬆️') + '</span>' +
          '<span class="who">' + esc(corta(tx.incoming ? tx.from : tx.to)) + '</span>' +
          '<span class="amt ' + (tx.incoming ? 'in' : 'out') + '">' +
            (tx.incoming ? '+' : '−') + Number(tx.value).toFixed(4) +
          '</span>' +
          '<span class="gfw-w-sub" style="margin:0;">' + cuando(tx.timestamp) + '</span>' +
        '</div>';
      }).join('');
    }).catch(function () {});

    // ── Enviar ──
    $('gfw-w-send-go').onclick = function () {
      var btn = this;
      var destino  = ($('gfw-w-to').value || '').trim();
      var cantidad = ($('gfw-w-amt').value || '').trim();
      var secreto  = $('gfw-w-secret').value || '';

      if (!destino || !cantidad) { mensaje('Fill in the address and the amount', 'err'); return; }
      if (!secreto)              { mensaje('Type your key to confirm the transfer', 'err'); return; }

      btn.disabled = true;
      mensaje('Checking your key...');
      wallet.sendNative(destino, cantidad, secreto).then(function (r) {
        mensaje('Sent. Transaction: ' + corta(r.hash), 'ok');
        $('gfw-w-secret').value = '';
        $('gfw-w-amt').value = '';
        return refrescarSaldo();
      }).catch(function (e) {
        mensaje(e && e.message ? e.message : 'Could not send', 'err');
      }).then(function () { btn.disabled = false; });
    };

    // ── Código → Clave ──
    $('gfw-w-setkey').onclick = function () {
      var btn = this;
      var codigo = ($('gfw-w-code-in').value || '').trim();
      var clave  = $('gfw-w-key-new').value || '';
      if (!codigo || !clave) { mensaje('Enter your recovery code and the new key', 'err'); return; }

      btn.disabled = true;
      mensaje('Saving...');
      wallet.setPassphrase(codigo, clave).then(function () {
        mensaje('Key saved. From now on you can use it instead of the code.', 'ok');
        $('gfw-w-code-in').value = '';
        $('gfw-w-key-new').value = '';
      }).catch(function (e) {
        mensaje(e && e.message ? e.message : 'Could not save the key', 'err');
      }).then(function () { btn.disabled = false; });
    };

    // ── Clave → Código ──
    $('gfw-w-getcode').onclick = function () {
      var btn = this;
      var clave = $('gfw-w-key-in').value || '';
      if (!clave) { mensaje('Type your key', 'err'); return; }

      btn.disabled = true;
      mensaje('Checking...');
      wallet.revealCodeWithPassphrase(clave).then(function (codigo) {
        var out = $('gfw-w-code-out');
        out.style.display = 'block';
        out.textContent = codigo;
        mensaje('This is your recovery code. Keep it somewhere safe.', 'ok');
        $('gfw-w-key-in').value = '';
      }).catch(function (e) {
        mensaje(e && e.message ? e.message : 'Wrong key', 'err');
      }).then(function () { btn.disabled = false; });
    };

    // ── Clave privada ──
    $('gfw-w-showpk').onclick = function () {
      var btn = this;
      var secreto = $('gfw-w-pk-secret').value || '';
      if (!secreto) { mensaje('Type your key or your recovery code', 'err'); return; }

      btn.disabled = true;
      mensaje('Checking...');
      wallet.exportPrivateKey(secreto).then(function (r) {
        var out = $('gfw-w-pk-out');
        out.style.display = 'block';
        out.textContent = r.privateKey;
        mensaje('Anyone with this key owns your wallet. Never paste it anywhere.', 'err');
        $('gfw-w-pk-secret').value = '';
      }).catch(function (e) {
        mensaje(e && e.message ? e.message : 'Wrong key or code', 'err');
      }).then(function () { btn.disabled = false; });
    };
  }

  function pintar() {
    var cuerpo = $('gfw-wallet-body');
    if (!cuerpo || PINTADO) return;
    PINTADO = true;

    cuerpo.innerHTML = '<div class="gfw-w-card"><div class="gfw-w-sub">Loading wallet...</div></div>';

    prepararWallet().then(function (w) {
      try {
        if (w) pintarIntegrada(cuerpo, w);
        else   pintarMetaMask(cuerpo);
      } catch (e) {
        console.error('[gf-wallet-dashboard] error pintando la cartera:', e);
        cuerpo.innerHTML = '<div class="gfw-w-card"><div class="gfw-w-sub">Could not load the wallet panel.</div></div>';
      }
    });
  }

  // ── Enlazado de las pestañas del dashboard ─────────────────────────────
  function enlazar() {
    if (ENLAZADO) return;
    var tabs = document.querySelectorAll('.hub-cat_101');
    if (!tabs.length) return;
    ENLAZADO = true;

    // El conmutador es GENÉRICO: cada pestaña `data-cat="x"` muestra la sección
    // `#gfw-cat-x` y esconde las demás. Antes estaban escritas a mano las dos
    // que había (general y wallet), así que añadir una tercera —Channels— no
    // habría hecho nada: se marcaba la pestaña pero no aparecía su contenido.
    function seccionDe(cat) { return $('gfw-cat-' + cat); }

    var categorias = Array.prototype.map.call(tabs, function (b) {
      return b.getAttribute('data-cat');
    });

    function abrir(cat) {
      Array.prototype.forEach.call(tabs, function (b) {
        b.classList.toggle('active', b.getAttribute('data-cat') === cat);
      });
      categorias.forEach(function (c) {
        var sec = seccionDe(c);
        if (sec) sec.style.display = (c === cat) ? '' : 'none';
      });
      if (cat === 'wallet') pintar();
      // La pestaña de canales la pinta su propio módulo, que es quien conoce
      // el estado del socket.
      if (cat === 'canales' && window.GFCanales && window.GFCanales.montarPanel) {
        window.GFCanales.montarPanel();
      }
    }

    Array.prototype.forEach.call(tabs, function (b) {
      b.addEventListener('click', function () { abrir(b.getAttribute('data-cat')); });
    });

    console.log('[gf-wallet-dashboard] categorías del dashboard enlazadas');
  }

  // El dashboard es DOM persistente, pero puede montarse después que este
  // script. Se reintenta un rato y luego se deja de insistir.
  var intentos = 0;
  var reloj = setInterval(function () {
    enlazar();
    if (ENLAZADO || ++intentos > 40) clearInterval(reloj);
  }, 300);

  if (document.readyState !== 'loading') enlazar();
  else document.addEventListener('DOMContentLoaded', enlazar);

  // Si la wallet se desbloquea más tarde (el login social termina después de
  // que se abriera el panel), se vuelve a pintar con los datos buenos.
  window.addEventListener('gfWalletReady', function () { PINTADO = false; });
})();
