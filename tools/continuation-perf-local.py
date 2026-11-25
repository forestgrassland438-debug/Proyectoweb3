from pathlib import Path
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('cutils',str(Path('tools/continuation-utils.py').resolve())).load_module()
# Cache the actual DOM nodes per scene; detached nodes are never reused.
for p in ['Scenes/GameScene.js','Scenes/tiendajuego.js']:
 u.change(p,'initInventory() {','initInventory() {\n  this._domInvSlots=[];this._domQuickSlots=[];')
 for kind,prefix,cap in [('inv','Inv',40),('quick','Quick',7)]:
  old='  const '+('invDiv' if kind=='inv' else 'quickDiv')+' = document.querySelector(`.'+('inv-slot' if kind=='inv' else 'quick-slot')+'[data-slot-index="${index}"]`);'
  # Other methods can contain the same selector: update only the renderSlot method.
  s=u.read(p);start=s.index('renderSlot(index) {');pos=s.index(old,start);end=pos+len(old)
  node='invDiv' if kind=='inv' else 'quickDiv';sel='inv-slot' if kind=='inv' else 'quick-slot'
  new=f"  const cache{prefix}=this._dom{prefix}Slots ||= [];\n  let {node}=Number.isInteger(index)&&index>=0&&index<{cap}?cache{prefix}[index]:null;\n  if({node}?.isConnected===false){node}=null;\n  if(!{node}&&Number.isInteger(index)&&index>=0&&index<{cap}){node}=cache{prefix}[index]=document.querySelector(`.{sel}[data-slot-index=\"${{index}}\"]`);"
  u.backup(p);u.save(p,s[:pos]+new+s[end:])
# Direct NPC references retain the original positions, sprites and interactions.
u.change('Scenes/tiendajuego.js',"    // (2026-10-20) El tendero con su aspecto nuevo encima", "    this.npcTienda1=boton3;this.npcTienda2=boton4;\n    // (2026-10-20) El tendero con su aspecto nuevo encima")
u.change('gf-npcs-pueblo.js',"        scene.children.list.forEach(function (o) {", "        [scene.npcTienda1,scene.npcTienda2].forEach(function (o) {")
# Climate stages use exactly the original drawing when first requested.
u.change('gf-clima.js',"  function dibujarCharco(scene, clave, semilla, helado, etapa) {", "  function etapaCharco(scene,tam,helado,etapa){\n    var base=(helado?HIELOS_DIBUJADOS:CHARCOS_DIBUJADOS)[tam];\n    return dibujarCharco(scene,base,tam+1,helado,etapa)||claveEtapa(base,0);\n  }\n\n  function dibujarCharco(scene, clave, semilla, helado, etapa) {")
u.change('gf-clima.js',"st.scene.add.image(0, 0, CHARCOS_DIBUJADOS[0])", "st.scene.add.image(0, 0, etapaCharco(st.scene,0,false,0))")
for old,new in [
 ("claveEtapa(CHARCOS_DIBUJADOS[libre.tam], 0)","etapaCharco(st.scene,libre.tam,false,0)"),
 ("claveEtapa(HIELOS_DIBUJADOS[c.tam], Math.max(0, c.etapa))","etapaCharco(st.scene,c.tam,true,Math.max(0,c.etapa))"),
 ("claveEtapa(CHARCOS_DIBUJADOS[c.tam], Math.max(0, c.etapa))","etapaCharco(st.scene,c.tam,false,Math.max(0,c.etapa))"),
 ("claveEtapa(c.helado ? HIELOS_DIBUJADOS[c.tam] : CHARCOS_DIBUJADOS[c.tam], e)","etapaCharco(st.scene,c.tam,c.helado,e)")]:u.change('gf-clima.js',old,new)
u.change('gf-clima.js','for (var et = 0; et < ETAPAS_CHARCO; et++) {','for (var et = 0; et < 1; et++) {')
# Repeated tree choices use weakly-held bounds; transform changes invalidate them.
u.change('gf-buho.js','  function copaDe(spr) {','  var cacheCopas=new WeakMap();\n  function copaDe(spr) {')
u.change('gf-buho.js',"    var b;\n    try { b = spr.getBounds(); } catch (x) { b = null; }\n    if (b) return { x: b.centerX, y: b.top + b.height * 0.26 };", """    var signature=[spr.x,spr.y,spr.scaleX,spr.scaleY,spr.rotation,spr.originX,spr.originY,spr.displayWidth,spr.displayHeight,spr.flipX,spr.flipY,spr.texture?.key,spr.frame?.name,spr.parentContainer?.x,spr.parentContainer?.y,spr.parentContainer?.rotation].join('|');
    var cached=cacheCopas.get(spr);if(cached?.signature===signature)return cached.point;
    var b;try { b = spr.getBounds(); } catch (x) { b = null; }
    if(b){var point={x:b.centerX,y:b.top+b.height*.26};cacheCopas.set(spr,{signature:signature,point:point});return point;}""")
# The legacy large track is only needed when the game's audio module is absent.
u.change('Scenes/GameScene.js',"    this.load.audio('main-theme', './Game/MUSIC/Principal.ogg');", "    if(!window.GFAudio)this.load.audio('main-theme', './Game/MUSIC/Principal.ogg');")
print('Localized audit improvements: inventory DOM cache, direct NPC references, lazy puddle stages, weak tree-bound cache and redundant audio load')
