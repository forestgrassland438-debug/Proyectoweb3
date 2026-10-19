'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
process.argv[2]=require('node:path').resolve(__dirname,'..');
const {crearEscena,ctx,clima}=require('./fauna-banco.js');
vm.runInContext(fs.readFileSync('gf-cuervo.js','utf8'),ctx);
const api=ctx.GFAnimales._interno;
const originalRandom=vm.runInContext('Math.random',ctx);
function random(value){ctx.__rnd=value;vm.runInContext('Math.random = () => __rnd',ctx);}
function restore(){ctx.GFProfundidad=undefined;ctx.__charcos=[];vm.runInContext('Math.random = __restore',Object.assign(ctx,{__restore:originalRandom}));}
function bird(scene,especie='paloma'){
  const a={especie,grupo:'ave',ficha:ctx.GFAnimales.FICHA[especie],hw:8,hh:5,miedo:1,
    spr:scene.add.sprite(2000,2000,'gfa_'+especie+'_quieto_1'),fase:'posado',soporte:'sprite_arbolx1',hasta:0,
    _anim:null,banoDisponibleEn:0};a.spr.scene=scene;return a;
}
test('el baño tiene descanso por ave, una plaza por fuente y dos plazas por mapa',()=>{
  const scene=crearEscena();scene.player=null;scene.sprite_fuente=scene.add.sprite(2100,2100,'pozo');
  const st={scene,animales:[bird(scene),bird(scene),bird(scene)]};
  try{random(0.01);api.decidirAve(st,st.animales[0]);assert.equal(st.animales[0].alFinal,'bana');assert.ok(st.animales[0].banoDisponibleEn>=90000);
    api.decidirAve(st,st.animales[1]);assert.notEqual(st.animales[1].alFinal,'bana');
    st.animales[0].fase='posado';st.animales[0].soporte='sprite_arbolx1';st.animales[0].alFinal=null;
    api.decidirAve(st,st.animales[0]);assert.notEqual(st.animales[0].alFinal,'bana');
    st.animales[0].fase='bana';st.animales[1].fase='bana';st.animales[2].banoDisponibleEn=0;
    api.decidirAve(st,st.animales[2]);assert.notEqual(st.animales[2].alFinal,'bana');
  }finally{restore();}
});
test('observar, acicalarse, explorar y saltar producen acciones sin nuevos temporizadores',()=>{
  const scene=crearEscena();scene.player=null;const a=bird(scene),st={scene,animales:[a]};
  try{
    random(.35);api.decidirAve(st,a);assert.equal(a.actividad,'acicala');assert.equal(a.fase,'posado');
    a.accionEn=0;api.actualizarAve(st,a,500,.016);assert.equal(a._anim,'come');
    random(.45);api.decidirAve(st,a);assert.equal(a.actividad,'observa');
    a.fase='salta';a.accionEn=0;a.rumbo=1;a.hasta=10000;const oldX=a.spr.x;
    random(.5);api.actualizarAve(st,a,1000,.016);assert.ok(a.spr.x>oldX);assert.ok(a.accionEn>1000);
    a.fase='explora';a.accionEn=9000;a.rumbo=1;const before=a.spr.x;
    api.actualizarAve(st,a,1100,.1);assert.ok(a.spr.x>before);
  }finally{restore();}
});
function flowerFixture(){
  const scene=crearEscena();scene.player=null;
  for(const key of Object.keys(scene))if(/sprite_(flor_|arbust|piedras_|tronco_acostado_)/.test(key))delete scene[key];
  const flower=scene.add.sprite(1010,1020,'flor');flower.depth=200;flower.getBounds=()=>({x:1000,y:1000,top:1000,bottom:1020,centerX:1010,width:20,height:20});
  scene.sprite_flor_formado1_ect1=flower;scene.children={list:[flower]};
  const superior=[-1,-1,7,5,3,3,5,7,-1,-1],perfil=[-1,-1,8,8,8,8,8,8,-1,-1];
  ctx.GFProfundidad={medir:(_sc,key)=>key==='flor'?{leida:true,ancho:10,alto:10,izq:2,der:7,arriba:3,abajo:8,superior,perfil}:
    {leida:true,ancho:10,alto:10,izq:0,der:9,arriba:0,abajo:9,superior:Array(10).fill(0),perfil:Array(10).fill(9)}};
  return {scene,flower,superior,perfil};
}
test('las mariposas se apoyan sobre píxeles visibles, también con sprites espejados',()=>{
  const {scene,flower,superior,perfil}=flowerFixture();
  try{const sitio=api.floresYPiedras(scene)[0];
    for(const flip of [false,true])for(const value of [.01,.2,.4,.6,.8,.99]){
      flower.flipX=flip;random(value);const point=api.puntoFlor(sitio);assert.ok(point);
      let col=Math.floor((point.x-1000)/2);if(flip)col=9-col;
      // (2026-10-12) "Las mariposas se paran más arriba de las flores": ya no
      // en el borde de arriba de la columna, sino DENTRO del dibujo, en su
      // parte de arriba (el pétalo). Siempre sobre píxeles visibles.
      const fila=(point.y-1000)/2-.5;
      assert.ok(superior[col]>=0&&fila>=superior[col]-1e-9&&fila<=perfil[col]+1e-9,'sobre píxeles visibles: col '+col+' fila '+fila);
      assert.ok(fila<=superior[col]+(perfil[col]-superior[col])*.42+1e-9,'en la parte de arriba de la flor: fila '+fila);
      if(perfil[col]>superior[col])assert.ok(fila>superior[col],'no en el mismo borde de arriba: fila '+fila);
    }
  }finally{restore();}
});
test('una casa que cubre la flor impide aterrizar; un soporte eliminado tampoco retiene a la mariposa',()=>{
  const {scene,flower}=flowerFixture();
  const m={especie:'mariposa_monarca',grupo:'mariposa',ficha:ctx.GFAnimales.FICHA.mariposa_monarca,
    spr:scene.add.sprite(1000,1000,'gfa_mariposa_monarca_vuela_1'),fase:'revolotea',_anim:null};
  const st={scene,animales:[m]};const casa=scene.add.sprite(1000,1000,'casa');casa.depth=500;casa.getBounds=flower.getBounds;
  try{random(.5);scene.children.list.push(casa);api.decidirMariposa(st,m);assert.equal(m.soporte,null);
    casa.visible=false;api.decidirMariposa(st,m);assert.equal(m.soporte,'sprite_flor_formado1_ect1');
    m.spr.setPosition(m.destino.x,m.destino.y);flower.active=false;api.actualizarMariposa(st,m,1000,.2);assert.equal(m.soporte,null);
  }finally{restore();}
});
test('la sombra del cuervo en Lands sigue sus patas en el mismo frame y refleja el giro',()=>{
  const scene=crearEscena();scene.player=null;const exists=scene.textures.exists;scene.textures.exists=k=>exists(k)||k.startsWith('cuervo_');
  const st=ctx.GFCuervo.montar(scene,{cantidad:1}),c=st.cuervos[0];c.spr.scene=scene;
  ctx.GFProfundidad={medir:()=>({leida:true,ancho:30,alto:24,abajo:21,pieX:10})};
  try{c.fase='camina';c.hasta=1e9;c.rumbo=1;c.huyeEn=1e9;c.spr.setPosition(2000,1800);
    ctx.GFCuervo._interno.actualizarCuervo(st,c,.1);assert.ok(c.spr.x>2000);assert.equal(c.sombra.x,c.spr.x-10);assert.equal(c.sombra.y,c.spr.y-4);
    c.rumbo=-1;ctx.GFCuervo._interno.actualizarCuervo(st,c,.1);assert.equal(c.sombra.x,c.spr.x+10);assert.equal(c.sombra.depth,c.sombra.y-1);
  }finally{ctx.GFCuervo.desmontar(scene);restore();}
});
