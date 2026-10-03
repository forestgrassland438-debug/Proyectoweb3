// Redirección de game.html a index.html.
// Va en un archivo aparte porque la CSP del sitio prohíbe scripts en línea.
// Conserva address/wallet y el fragmento; el destino siempre es index.html.
// Con `replace` la página vieja no queda en el historial, así que el botón
// "atrás" del navegador no devuelve al jugador aquí una y otra vez.
(function () {
  'use strict';
  var destino = './index.html' + window.location.search + window.location.hash;
  try {
    window.location.replace(destino);
  } catch (e) {
    window.location.href = destino;
  }
})();
