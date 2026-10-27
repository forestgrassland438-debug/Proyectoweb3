/* =============================================================================
 * GF NFT — "My NFTs" del panel NFT                               (2026-10-04)
 * =============================================================================
 *
 * QUÉ ENSEÑA
 * ----------
 * Los NFT que tiene la cartera del jugador (la de MetaMask o la de su inicio
 * de sesión) de UNA colección: la que el administrador elige en admin.html por
 * su nombre y su contrato. El servidor lee la cadena (GET /api/nft/mios) y
 * devuelve los ids y la URI de cada token; los METADATOS y las IMÁGENES se
 * descargan aquí, en el navegador, para que el servidor no tenga que pedir
 * direcciones que decide un contrato ajeno.
 *
 * DÓNDE VIVE
 * ----------
 * Aquí y no en las escenas por lo mismo que gf-soulbound.js: el panel NFT es
 * DOM COMPARTIDO de la página y lo abren el mapa, la tienda, la mina y la isla.
 * Con una sola implementación todas enseñan lo mismo.
 *
 * SEGURIDAD
 * ---------
 * Todo lo que viene de un metadato es texto de un tercero: se pinta con
 * textContent, nunca con innerHTML. Las imágenes solo se aceptan de https: o
 * de un data:image/…, y las descargas llevan tope de tiempo y de tamaño.
 * ========================================================================== */
(function (global) {
  'use strict';

  var doc = global.document;
  var IPFS = 'https://ipfs.io/ipfs/';
  var TOPE_MS = 9000;
  var TOPE_BYTES = 200 * 1024;          // un JSON de metadatos no pesa más
  var PARALELO = 4;

  var metaCache = new Map();            // contrato:id:uri -> {nombre, imagen}
  var TOPE_CACHE = 500;
  var bytesCache = 0;
  var TOPE_BYTES_CACHE = 8 * 1024 * 1024;
  var cargando = null;                  // promesa en vuelo del panel
  var propietario = '';
  var revision = 0;
  var descargas = new Set();

  function cancelarDescargas() {
    descargas.forEach(function (ctl) { ctl.abort(); });
    descargas.clear();
  }

  function $(id) { return doc.getElementById(id); }

  function urlSegura(u) {
    var s = String(u || '').trim();
    if (/^ipfs:\/\//i.test(s)) s = IPFS + s.replace(/^ipfs:\/\/(ipfs\/)?/i, '');
    if (/^https:\/\//i.test(s)) return s;
    return '';
  }

  function imagenSegura(u) {
    var s = String(u || '').trim();
    if (/^data:image\/(png|gif|jpe?g|webp|svg\+xml);/i.test(s)) return s;
    return urlSegura(s);
  }

  async function descargarJson(url, opciones, run, limite) {
    limite = limite || TOPE_BYTES;
    if (run !== revision) throw new Error('cancelled');
    var ctl = new AbortController();
    descargas.add(ctl);
    var reloj = setTimeout(function () { ctl.abort(); }, TOPE_MS);
    var reader;
    try {
      var r = await global.fetch(url, Object.assign({}, opciones, { signal: ctl.signal }));
      if (ctl.signal.aborted || run !== revision) throw new Error('cancelled');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      if (Number(r.headers && r.headers.get('content-length') || 0) > limite) throw new Error('demasiado grande');
      var txt;
      if (r.body && typeof r.body.getReader === 'function') {
        reader = r.body.getReader();
        var partes = [], largo = 0;
        while (true) {
          var bloque = await reader.read();
          if (ctl.signal.aborted || run !== revision) throw new Error('cancelled');
          if (bloque.done) break;
          largo += bloque.value.byteLength;
          if (largo > limite) throw new Error('demasiado grande');
          partes.push(bloque.value);
        }
        var bytes = new Uint8Array(largo), posicion = 0;
        partes.forEach(function (p) { bytes.set(p, posicion); posicion += p.byteLength; });
        txt = new TextDecoder().decode(bytes);
      } else {
        txt = await r.text();
        if (txt.length > limite || ctl.signal.aborted || run !== revision) throw new Error('demasiado grande');
      }
      return JSON.parse(txt);
    } catch (e) {
      ctl.abort();
      if (reader) { try { await reader.cancel(); } catch (_) {} }
      throw e;
    } finally {
      clearTimeout(reloj); descargas.delete(ctl);
      if (reader) { try { reader.releaseLock(); } catch (_) {} }
    }
  }

  /** Los metadatos de un token: data:application/json (en la cadena) o una URL. */
  function metadatos(contrato, token, run) {
    var uri = String(token.uri || '');
    if (uri.length > TOPE_BYTES * 1.4) return Promise.resolve({ nombre: '#' + token.id, imagen: '' });
    var hash = 2166136261;
    for (var h = 0; h < uri.length; h++) hash = Math.imul(hash ^ uri.charCodeAt(h), 16777619);
    var clave = contrato + ':' + token.id + ':' + uri.length + ':' + (hash >>> 0);
    if (metaCache.has(clave)) return Promise.resolve(metaCache.get(clave).datos);
    var p;
    var m = /^data:application\/json(;base64)?,(.*)$/i.exec(uri);
    if (m) {
      p = Promise.resolve().then(function () {
        var txt = m[1] ? global.atob(m[2]) : decodeURIComponent(m[2]);
        if (txt.length > TOPE_BYTES) throw new Error('demasiado grande');
        return JSON.parse(txt);
      });
    } else {
      var url = urlSegura(uri);
      if (!url) return Promise.resolve({ nombre: '#' + token.id, imagen: '' });
      p = descargarJson(url, { credentials: 'omit', mode: 'cors', referrerPolicy: 'no-referrer' }, run);
    }
    return p.then(function (j) {
      var res = {
        nombre: String((j && (j.name || j.title)) || ('#' + token.id)).slice(0, 80),
        imagen: imagenSegura(j && (j.image || j.image_url || j.imageUrl))
      };
      if (run === revision) {
        if (metaCache.has(clave)) bytesCache -= metaCache.get(clave).bytes;
        var peso = 2 * (clave.length + res.nombre.length + res.imagen.length);
        metaCache.set(clave, { datos: res, bytes: peso }); bytesCache += peso;
        while (metaCache.size > TOPE_CACHE || bytesCache > TOPE_BYTES_CACHE) {
          var primero = metaCache.keys().next().value;
          bytesCache -= metaCache.get(primero).bytes; metaCache.delete(primero);
        }
      }
      return res;
    }).catch(function () {
      return { nombre: '#' + token.id, imagen: '' };
    });
  }

  function escenaConSesion(scene) {
    if (scene && scene.serverBase) return scene;
    try {
      var juego = global.game;
      var escenas = (juego && juego.scene && juego.scene.getScenes(true)) || [];
      for (var i = 0; i < escenas.length; i++) if (escenas[i] && escenas[i].serverBase) return escenas[i];
    } catch (e) {}
    return null;
  }

  function corto(a) { a = String(a || ''); return a.length > 12 ? a.slice(0, 6) + '…' + a.slice(-4) : a; }

  /* ═══ LAS COLECCIONES DEL ESTUDIO                              (2026-10-26)
     "El juego no lee automáticamente la colección que creé, y en el panel no
     sale ni la imagen del NFT ni el nombre de la colección."
     El servidor manda en `colecciones` las PÚBLICAS de colecciones.html, cada
     una con las piezas de esta cartera. Sus imágenes las sirve el propio
     backend (/api/collections/images/<id>): solo se aceptan esas rutas, en el
     origen del servidor del juego. */
  function imagenDelEstudio(base, ruta) {
    var r = String(ruta || '');
    if (!/^\/api\/collections\/images\/[A-Za-z0-9_-]{1,80}$/.test(r)) return '';
    return String(base || '').replace(/\/$/, '') + r;
  }

  function estiloColecciones() {
    if ($('gf-nft-col-estilo')) return;
    var s = doc.createElement('style');
    s.id = 'gf-nft-col-estilo';
    s.textContent =
      '.nft-col{grid-column:1/-1;border:1.5px solid rgba(64,160,255,.22);border-radius:12px;overflow:hidden;background:rgba(0,16,40,.45);margin-bottom:6px}' +
      '.nft-col-portada{height:64px;background:linear-gradient(135deg,rgba(40,90,160,.55),rgba(20,40,80,.8));background-size:cover;background-position:center}' +
      '.nft-col-cab{display:flex;align-items:center;gap:10px;padding:0 10px 8px;margin-top:-22px}' +
      '.nft-col-avatar{width:46px;height:46px;border-radius:50%;flex:0 0 auto;border:2px solid rgba(126,200,255,.7);background:rgba(0,20,50,.9);overflow:hidden;display:flex;align-items:center;justify-content:center;color:#d8ecff;font-weight:800;font-size:15px}' +
      '.nft-col-avatar img{width:100%;height:100%;object-fit:cover;image-rendering:pixelated}' +
      '.nft-col-txt{min-width:0;padding-top:20px}' +
      '.nft-col-nombre{font-size:13px;font-weight:800;color:#e8f4ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.nft-col-sub{font-size:10px;color:rgba(126,200,255,.7)}' +
      '.nft-col .nft-grid{padding:0 10px 10px}' +
      '.nft-col-externa{grid-column:1/-1;font-size:11px;font-weight:700;color:#bfe0ff;margin:6px 2px 0}';
    doc.head.appendChild(s);
  }

  function seccionColeccion(base, c) {
    estiloColecciones();
    var sec = doc.createElement('section');
    sec.className = 'nft-col';
    var portada = doc.createElement('div');
    portada.className = 'nft-col-portada';
    var urlPortada = imagenDelEstudio(base, c.portadaUrl);
    if (urlPortada) portada.style.backgroundImage = 'url("' + urlPortada.replace(/"/g, '%22') + '")';
    sec.appendChild(portada);
    var cab = doc.createElement('div');
    cab.className = 'nft-col-cab';
    var av = doc.createElement('div');
    av.className = 'nft-col-avatar';
    var urlAvatar = imagenDelEstudio(base, c.avatarUrl);
    if (urlAvatar) {
      var ia = doc.createElement('img');
      ia.alt = ''; ia.decoding = 'async'; ia.referrerPolicy = 'no-referrer'; ia.src = urlAvatar;
      av.appendChild(ia);
    } else {
      av.textContent = String(c.simbolo || c.nombre || 'NFT').slice(0, 2).toUpperCase();
    }
    var txt = doc.createElement('div');
    txt.className = 'nft-col-txt';
    var nom = doc.createElement('div');
    nom.className = 'nft-col-nombre';
    nom.textContent = String(c.nombre || 'Collection');
    var sub = doc.createElement('div');
    sub.className = 'nft-col-sub';
    var n = Array.isArray(c.tokens) ? c.tokens.length : 0;
    sub.textContent = n ? 'You own ' + n + ' NFT' + (n === 1 ? '' : 's') + ' of this collection' : 'You don’t own any NFT of this collection yet';
    txt.appendChild(nom); txt.appendChild(sub);
    cab.appendChild(av); cab.appendChild(txt);
    sec.appendChild(cab);
    if (n) {
      var rejilla = doc.createElement('div');
      rejilla.className = 'nft-grid';
      c.tokens.slice(0, 500).forEach(function (t) {
        var tarjetaT = tarjeta({ id: t.numero });
        var p = tarjetaT.__partes;
        var nombre = String(t.nombre || (c.nombre + ' #' + t.numero)).slice(0, 80);
        p.nombre.textContent = nombre;
        tarjetaT.title = nombre + ' · ' + (c.nombre || '') + ' (#' + t.numero + ')';
        var url = imagenDelEstudio(base, t.imagenUrl);
        if (url) {
          p.img.onerror = function () { p.marco.classList.add('nft-sin-imagen'); tarjetaT.classList.remove('nft-card--cargando'); };
          p.img.onload = function () { tarjetaT.classList.remove('nft-card--cargando'); };
          p.img.src = url;
        } else {
          p.marco.classList.add('nft-sin-imagen');
          tarjetaT.classList.remove('nft-card--cargando');
        }
        rejilla.appendChild(tarjetaT);
      });
      sec.appendChild(rejilla);
    }
    return sec;
  }

  function estado(texto, clase) {
    var lista = $('nft-list');
    if (!lista) return;
    lista.textContent = '';
    var p = doc.createElement('div');
    p.className = 'nft-empty-state' + (clase ? ' ' + clase : '');
    p.textContent = texto;
    lista.appendChild(p);
  }

  function tarjeta(token) {
    var a = doc.createElement('div');
    a.className = 'nft-card nft-card--cargando';
    var marco = doc.createElement('div');
    marco.className = 'nft-card-img';
    var img = doc.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    marco.appendChild(img);
    var nombre = doc.createElement('div');
    nombre.className = 'nft-card-name';
    nombre.textContent = '#' + token.id;
    var id = doc.createElement('div');
    id.className = 'nft-card-id';
    id.textContent = '#' + (String(token.id).length > 10 ? String(token.id).slice(0, 8) + '…' : token.id);
    a.appendChild(marco);
    a.appendChild(nombre);
    a.appendChild(id);
    a.__partes = { img: img, nombre: nombre, marco: marco };
    return a;
  }

  /**
   * Pinta la sección. Idempotente; con `refrescar` pide al servidor que vuelva
   * a leer la cadena (si no, usa la lectura de hace menos de dos minutos).
   */
  function montarPanel(scene, refrescar) {
    var lista = $('nft-list');
    if (!lista) return Promise.resolve(false);
    var esc = escenaConSesion(scene);
    if (!esc) { estado('Sign in to see your NFTs.'); return Promise.resolve(false); }
    var cuenta = String(esc.serverBase) + ':' + String(esc.currentAccount || esc.walletAddress || esc.playerName || '');
    if (cargando && !refrescar && propietario === cuenta) return cargando;
    propietario = cuenta;
    var run = ++revision;
    cancelarDescargas();

    var cab = $('nft-collection-name');
    var dir = $('nft-wallet');
    estado('Reading your wallet…', 'nft-cargando');

    // El listado admite más bytes que un metadato; el backend lo limita.
    cargando = descargarJson(esc.serverBase + '/api/nft/mios' + (refrescar ? '?refrescar=1' : ''),
                             { credentials: 'include', mode: 'cors' }, run, 4 * 1024 * 1024)
      .then(function (d) {
        if (run !== revision) return false;
        var col = d.coleccion || {};
        // (2026-10-26) Las colecciones públicas del estudio, delante de la externa.
        var registro = Array.isArray(d.colecciones) ? d.colecciones.slice(0, 30) : [];
        var propias = registro.reduce(function (n, c) { return n + (Array.isArray(c.tokens) ? c.tokens.length : 0); }, 0);
        if (cab) cab.textContent = d.configurada ? (col.nombre || '—') : (registro.length ? 'Collections' : '—');
        if (dir) dir.textContent = d.address ? corto(d.address) : '';
        if (!d.configurada && !registro.length) { estado('No NFT collection has been set up yet.'); return true; }
        var tokens = d.configurada && Array.isArray(d.tokens) ? d.tokens.slice(0, 500) : [];

        lista.textContent = '';
        var cuenta = $('nft-count');
        if (cuenta) cuenta.textContent = String((d.configurada ? (d.total || tokens.length) : 0) + propias);
        registro.forEach(function (c) { lista.appendChild(seccionColeccion(esc.serverBase, c)); });
        if (!d.configurada) return true;
        if (registro.length) {
          var titulo = doc.createElement('div');
          titulo.className = 'nft-col-externa';
          titulo.textContent = col.nombre || 'Collection';
          lista.appendChild(titulo);
        }
        if (d.errorCadena) {
          var aviso = doc.createElement('div');
          aviso.className = 'nft-empty-state nft-error';
          aviso.textContent = 'Could not read “' + (col.nombre || 'collection') + '” on-chain right now.';
          lista.appendChild(aviso);
          return true;
        }
        if (!tokens.length) {
          var nada = doc.createElement('div');
          nada.className = 'nft-empty-state';
          nada.textContent = 'You don’t own any “' + (col.nombre || 'collection') + '” NFT in this wallet yet.';
          lista.appendChild(nada);
          return true;
        }
        var tarjetas = tokens.map(function (t) {
          var c = tarjeta(t);
          lista.appendChild(c);
          return { t: t, c: c };
        });
        if (d.truncado) {
          var mas = doc.createElement('div');
          mas.className = 'nft-empty-state';
          mas.textContent = 'Showing ' + tokens.length + ' of ' + d.total + '.';
          lista.appendChild(mas);
        }
        // Los metadatos, de PARALELO en PARALELO.
        var i = 0;
        function siguiente() {
          if (run !== revision || i >= tarjetas.length) return Promise.resolve();
          var x = tarjetas[i++];
          return metadatos(col.contrato, x.t, run).then(function (m) {
            if (run !== revision || !doc.body.contains(x.c)) return;
            var p = x.c.__partes;
            p.nombre.textContent = m.nombre;
            x.c.title = m.nombre + ' (#' + x.t.id + ')';
            if (m.imagen) {
              p.img.onerror = function () { p.marco.classList.add('nft-sin-imagen'); };
              p.img.src = m.imagen;
            } else {
              p.marco.classList.add('nft-sin-imagen');
            }
            x.c.classList.remove('nft-card--cargando');
          }).then(siguiente);
        }
        var hilos = [];
        for (var k = 0; k < PARALELO; k++) hilos.push(siguiente());
        return Promise.all(hilos).then(function () { return true; });
      })
      .catch(function () {
        if (run === revision) estado('Could not reach the server. Try again in a moment.', 'nft-error');
        return false;
      })
      .then(function (ok) { if (run === revision) cargando = null; return ok; });
    return cargando;
  }

  /** El botón de volver a mirar. Se engancha con onclick (no se acumula). */
  function cablear(scene) {
    var b = $('nft-refresh');
    if (b) b.onclick = function () { montarPanel(null, true); };
  }

  global.GFNft = { montarPanel: montarPanel, cablear: cablear,
    cancelar: function () { ++revision; cancelarDescargas(); cargando = null; },
    _interno: { cache: metaCache, descargas: descargas } };
})(window);
