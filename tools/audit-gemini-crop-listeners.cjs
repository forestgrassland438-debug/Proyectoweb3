'use strict';const fs=require('node:fs'),acorn=require('acorn');const file='Scenes/GameScene.js',source=fs.readFileSync(file,'utf8'),ast=acorn.parse(source,{ecmaVersion:'latest'}),cls=ast.body.find(n=>n.type==='ClassDeclaration'&&n.id.name==='GameScene'),m=cls.body.body.find(n=>n.key.name==='setupCropSocketEvents');let part=source.slice(m.start,m.end);
const a=part.indexOf('  const eventosCultivo = ['),b=part.indexOf("  this.socket.on('cropConfig'",a);if(a<0||b<0)throw Error('Missing owned crop setup anchors');
part=part.slice(0,a)+`  this._cropSocketDispose?.();
  const socket=this.socket,bindings=[],run=this._sceneRunId;
  const onCrop=(event,fn)=>{const wrapped=(...args)=>{if(!this._sceneStopped&&this._sceneRunId===run)return fn(...args);};bindings.push([event,wrapped]);socket.on(event,wrapped);};
  const dispose=()=>{for(const [event,fn]of bindings)socket.off(event,fn);bindings.length=0;if(this._cropSocketDispose===dispose)this._cropSocketDispose=null;};
  this._cropSocketDispose=dispose;this._onceSceneEnd(dispose);

`+part.slice(b);part=part.replaceAll('this.socket.on(','onCrop(');
let result=source.slice(0,m.start)+part+source.slice(m.end);for(const event of ['cropConfig','plantSuccess','plantError'])result=result.replace("  this.socket.off('"+event+"');",'  // Crop subscriptions release only their owned handlers.');fs.writeFileSync(file,result);
