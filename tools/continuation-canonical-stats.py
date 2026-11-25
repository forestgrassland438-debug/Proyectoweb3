from pathlib import Path
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('cutils',str(Path('tools/continuation-utils.py').resolve())).load_module()
p='Scenes/LoadingScenegame.js'
u.change(p,"        const toSend = { ...this._pending };", "        const authorityRevision = this._authorityRevision || 0;\n        const toSend = { ...this._pending };")
u.change(p,"                this._adoptServerStats(data.stats);", "                this._adoptServerStats(data.stats, authorityRevision);")
u.change(p,"    _adoptServerStats(serverStats) {", """    adoptCanonical(serverStats) {
        if(!serverStats)return;
        this._authorityRevision=(this._authorityRevision||0)+1;
        for(const key of ['oro','plata','bronce','exp'])delete this._pending[key];
        if(!window.playerStats)window.playerStats={};
        this._adoptServerStats(serverStats);
        window.GFBronce?.adoptarStats(serverStats);
    }

    _adoptServerStats(serverStats, authorityRevision = this._authorityRevision || 0) {""")
u.change(p,"            const valor = serverStats[stat];", "            if(authorityRevision!==(this._authorityRevision||0)&&['oro','plata','bronce','exp'].includes(stat))continue;\n            const valor = serverStats[stat];")
u.change(p,"    async forceRefresh() {\n        const playerName", "    async forceRefresh() {\n        const authorityRevision = this._authorityRevision || 0;\n        const playerName")
u.change(p,"                        if (data.stats[s] !== undefined) window.playerStats[s] = Number(data.stats[s]);", "                        if(authorityRevision!==(this._authorityRevision||0)&&['oro','plata','bronce','exp'].includes(s))return;\n                        if (data.stats[s] !== undefined) window.playerStats[s] = Number(data.stats[s]);")
u.change('Scenes/GameScene.js',"    if(result.stats){\n      if(!window.playerStats)","    if(result.stats){\n      this.statsSync?.adoptCanonical?.(result.stats);\n      if(!window.playerStats)")
u.change('gf-native-crops.js',"  if(data.stats){scene._adoptarVitalesDelServidor", "  if(data.stats){scene.statsSync?.adoptCanonical?.(data.stats);scene._adoptarVitalesDelServidor")
u.change('tienda_sistema.js',"        if (d.stats) {\n            if (window.GFBronce", "        if (d.stats) {\n            this._statsSync()?.adoptCanonical?.(d.stats);\n            if (window.GFBronce")
print('Delayed old stats responses cannot replace newly adopted mission, farm or shop balances')
