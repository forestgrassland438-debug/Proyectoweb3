'use strict';
const fs = require('node:fs');
for (const file of ['tienda_sistema.js', 'Scenes/GameScene.js', 'Scenes/tiendajuego.js']) {
  let source = fs.readFileSync(file, 'utf8');
  source = source.replace(/this\.relayClient\.showError\('❌ Debes estar autenticado\.[^']*', 5000\);/g,
    "this.relayClient.showError(this.relayClient.authErrorMessage(auth), 5000);");
  source = source.replace(/if \(!this\.relayClient\) \{/g,
    "if (!this.relayClient || this.relayClient._destroyed) {");
  if (file === 'tienda_sistema.js') {
    source = source.replace(/    \/\/ debugBackendConnection[\s\S]*?    \/\/ Auth\n/, '    // Verificar la sesión una vez antes de comprar.\n');
    source = source.replace(/    const debugInfo = await this\.relayClient\.debugBackendConnection\(\);\r?\n    console\.log\([^\n]+\);\r?\n/g, '');
  }
  fs.writeFileSync(file, source);
}
const component = '../../login-sonmia/src/components/ConnectRoninWalletButton.jsx';
let source = fs.readFileSync(component, 'utf8');
source = source.replaceAll("nativeLink.kind === 'desktop'", "(nativeLink.kind === 'desktop' || nativeLink.kind === 'android-pair')")
  .replaceAll("nativeLink.kind !== 'desktop'", "nativeLink.kind !== 'desktop' && nativeLink.kind !== 'android-pair'");
source = source.replace("        return;\n      }\n      const gameUrl = new URL(GAME_URL);",
  "        if (nativeLink.kind !== 'android-pair') return;\n      }\n      const gameUrl = new URL(GAME_URL);");
source = source.replace("if (nativeLink.kind === 'android') gameUrl", "if (nativeLink.kind === 'android' || nativeLink.kind === 'android-pair') gameUrl");
fs.writeFileSync(component, source);
for (const file of ['GrasslandBuild/package.json', 'GrasslandBuild/package-lock.json']) {
  source = fs.readFileSync(file, 'utf8').replaceAll('"version": "1.1.1"', '"version": "1.1.2"');
  fs.writeFileSync(file, source);
}
source = fs.readFileSync('GrasslandBuild/android/app/build.gradle', 'utf8')
  .replace('versionCode 4', 'versionCode 5').replace("versionName '1.1.1'", "versionName '1.1.2'");
fs.writeFileSync('GrasslandBuild/android/app/build.gradle', source);
source = fs.readFileSync('index.html', 'utf8')
  .replace(/(phaser-relay-library\.js\?v=)[\d.]+/, '$122.3')
  .replace(/(tienda_sistema\.js\?v=)[\d.]+/, '$122.3')
  .replace(/(gf-cuervo\.js\?v=)[\d.]+/, '$122.3')
  .replace(/(gf-animales\.js\?v=)[\d.]+/, '$122.3')
  .replace(/(Scenes\/(?:GameScene|tiendajuego)\.js\?v=)[\d.]+/g, '$122.3');
fs.writeFileSync('index.html', source);
console.log('Clientes y login actualizados a 1.1.2; caché web renovada.');
