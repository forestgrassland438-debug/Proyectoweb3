const fs = require('node:fs');
for (const file of ['Scenes/LoadingScenegame.js','Scenes/GameScene.js','Scenes/tiendajuego.js']) {
  const source = fs.readFileSync(file,'utf8'), re=/^(\s*)elixir_revivir:\s*\{/m;
  if(!re.test(source)) throw Error(file);
  const updated = source.replace(re,(m,i) => i+'pocion_vida: { src: "./Game/newpro/pociones/pocion_vida.png", maxStack: 20, tipo: "pocion_vida", usos: null },'+i+'pocion_antidoto: { src: "./Game/newpro/pociones/pocion_energia.png", maxStack: 20, tipo: "pocion_antidoto", usos: null },'+m);
  fs.writeFileSync(file, updated);
}
