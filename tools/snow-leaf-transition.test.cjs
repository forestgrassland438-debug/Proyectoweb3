'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('leaves remain hidden while old snowflakes fade after switching the weather',()=>{
  const source=fs.readFileSync('gf-viento.js','utf8');
  const start=source.indexOf('    var climaActual = window.GFClima');
  const update=source.slice(start,source.indexOf('    moverRafagas(',start));
  let moves=0;const sprite={alpha:1,setAlpha(n){this.alpha=n;}};
  const st={scene:{__gfClima:{fuerzaNieve:0.4}},hojas:[{spr:sprite}]};
  const context={st,window:{GFClima:{estado:()=>({activo:true,nieve:false})}},moverHojas:()=>{moves++;sprite.alpha=1;},dt:0.016,w:800,h:600,ahora:1000};
  vm.runInNewContext(update,context);assert.equal(sprite.alpha,0);assert.equal(moves,0);
  st.scene.__gfClima.fuerzaNieve=0;vm.runInNewContext(update,context);assert.equal(moves,1);assert.equal(sprite.alpha,1);
});
