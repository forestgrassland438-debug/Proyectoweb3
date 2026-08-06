/**
 * GF Wallet — arranque dentro del juego
 * ============================================================================
 * El juego (game.html / index.html) carga este fichero DESPUÉS de ethers y
 * ANTES de las escenas. Su único trabajo es dejar la wallet embebida
 * disponible para el código que espera `window.ethereum`.
 *
 * POR QUÉ HACE FALTA TAN POCO
 *   En Grassland Forest ninguna acción del juego firma nada: TODAS las
 *   transacciones las manda el relayer del backend (que además paga el gas), y
 *   la sesión viaja en la cookie httpOnly. La wallet solo hizo falta una vez,
 *   en el login, para demostrar quién eres.
 *
 *   Así que aquí basta con que `eth_accounts`, `eth_chainId` y `personal_sign`
 *   respondan bien para las pocas partes del juego que los consultan (el panel
 *   de compra de oro, el logout, el hub de moneda).
 *
 * REGLA IMPORTANTE
 *   Si el jugador tiene MetaMask instalado, MANDA METAMASK. Este arranque
 *   nunca pisa una wallet inyectada; solo rellena el hueco cuando no hay
 *   ninguna (que es justo el caso del jugador que entró con Google, Facebook
 *   o Apple).
 */
(function () {
  'use strict';

  var LISTO = 'gfWalletReady';

  function log() {
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[gf-wallet-boot]');
    console.log.apply(console, a);
  }

  function resolverApiBase() {
    // Mismo criterio que usan las escenas del juego.
    //
    // OJO con la cadena VACÍA: '' significa "mismo origen", que es una
    // configuración válida y muy común. Comprobarlo con `if (window.serverBase)`
    // la descartaba por ser un valor falsy y se acababa llamando a
    // http://127.0.0.1:3001, que en ese montaje no existe.
    if (typeof window.serverBase === 'string')  return window.serverBase;
    if (typeof window.GF_API_BASE === 'string') return window.GF_API_BASE;
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:3001';
    return 'https://api.grasslandforest.com';
  }

  function arrancar() {
    if (typeof window.GFWallet === 'undefined') {
      log('SDK no cargado (falta gf-wallet-sdk/gf-wallet.js) — se sigue sin wallet embebida');
      return;
    }
    if (typeof window.ethers === 'undefined') {
      log('ethers no está cargado todavía — se reintenta cuando termine de cargar');
      return;
    }

    var wallet = window.GFWallet.create({
      apiBase: resolverApiBase(),
      appName: 'Grassland Forest'
    });

    window.gfWallet = wallet;

    wallet.init().then(function () {
      // Solo si NO hay wallet inyectada (MetaMask u otra).
      var instalada = window.GFWallet.installAsWindowEthereum(wallet);
      log(instalada
        ? 'wallet embebida instalada como window.ethereum'
        : 'ya había una wallet inyectada: no se toca');

      // Reabrir la bóveda en silencio si este dispositivo tiene su mitad.
      // Si falla (dispositivo nuevo, sesión caducada) no se molesta al jugador:
      // el juego funciona igual, porque nada de la partida necesita firmar.
      return wallet.unlock().then(function (r) {
        log('wallet lista:', r && r.address);
      }).catch(function (e) {
        log('la wallet no se pudo desbloquear (normal si entraste con MetaMask):', e && e.message);
      });
    }).catch(function (e) {
      log('no se pudo inicializar:', e && e.message);
    }).then(function () {
      try { window.dispatchEvent(new Event(LISTO)); } catch (e) {}
    });
  }

  // ethers y el SDK van con `defer`, así que puede que aún no estén al ejecutar
  // esto. Se espera a que el documento termine de cargar y, si acaso, se
  // reintenta un par de veces.
  function intentar(restantes) {
    if (typeof window.ethers !== 'undefined' && typeof window.GFWallet !== 'undefined') {
      arrancar();
      return;
    }
    if (restantes <= 0) { arrancar(); return; }   // deja el mensaje de diagnóstico
    setTimeout(function () { intentar(restantes - 1); }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { intentar(12); });
  } else {
    intentar(12);
  }
})();
