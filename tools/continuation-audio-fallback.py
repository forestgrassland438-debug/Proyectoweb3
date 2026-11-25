from pathlib import Path
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('cutils',str(Path('tools/continuation-utils.py').resolve())).load_module()
u.change('Scenes/GameScene.js','playMusic(key, config = {}) {','''playMusic(key, config = {}) {
  if(key==='main-theme'&&this.cache?.audio?.exists&& !this.cache.audio.exists(key)){
    if(this._legacyMusicPending||!this.load?.audio)return null;
    this._legacyMusicPending=true;const run=this._sceneRunId,loader=this.load;
    let deadline;const event='filecomplete-audio-'+key;
    const clear=()=>{clearTimeout(deadline);loader.off(event,ready);loader.off('loaderror',failed);this._legacyMusicPending=false;};
    const ready=()=>{clear();if(!this._sceneStopped&&this._sceneRunId===run)this.playMusic(key,config);};
    const failed=file=>{if(file?.key===key)clear();};
    loader.once(event,ready);loader.on('loaderror',failed);this._onceSceneEnd?.(clear);
    deadline=setTimeout(clear,20000);
    loader.audio(key,'./Game/MUSIC/Principal.ogg');if(!loader.isLoading?.())loader.start();return null;
  }
''')
print('Original music stays available as a lazy fallback with scoped completion, failure and shutdown cleanup')
