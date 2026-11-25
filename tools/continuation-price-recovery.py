from pathlib import Path
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('cutils',str(Path('tools/continuation-utils.py').resolve())).load_module()
p='C:/Users/pc/Desktop/server2.js'
u.change(p,"        stats: buildStatsResponse(await PlayerStats.findOne({playerName}).lean()),", "        stats: await PlayerStats.findOne({playerName}).lean().then(doc=>doc?buildStatsResponse(doc):null),")
u.change(p,"    message: e.status ? e.code : 'The operation could not be committed safely. Try again later.'", """    message: ({precios_actualizados:'The price changed. Review the updated price and try again.',tienda_sin_liquidez:'The shop needs reserve funds before it can buy items. Nothing was consumed.',
      saldo_insuficiente:'You do not have enough coins, including the shop fee.',nivel_bajo:'Your character has not reached the required level.',tope_diario_tienda:'You have reached the daily purchase limit for this item.',
      objeto_no_disponible:'This item is not available for this trade.',resource_capacity_exhausted:'This resource table is full. Nothing was charged. Try again when capacity is available.',
      crop_table_unavailable:'This crop table could not be prepared. Nothing was charged. Please try again later.',referencia_no_reutilizable:'This reference belongs to a different trade. Check your pending operations.',
      fantasma:'Revive your character before trading.',saldo_ocupado:'Your balance is being updated. Please try again.',datos_invalidos:'The trade request is invalid.',no_autorizado:'Please sign in again.'})[e.code] || 'The operation could not be committed safely. Check pending operations before trying again.'""")
p='tienda_sistema.js'
u.change(p,"        const factor = { gold: 1000000, silver: 1000, bronze: 1 }[this.getItemCurrency(item)];\n        const r = await window.GFMascota.api('/api/economia/tienda', { op, itemId: item.id, cantidad,\n            precioBronce: Number(op === 'compra' ? item.buyPrice : item.sellPrice) * factor, ref });\n        const d = r && r.datos || {};", """        const bronzeQuote = value => Number(op === 'compra' ? value.buyPrice : value.sellPrice) * ({ gold: 1000000, silver: 1000, bronze: 1 }[this.getItemCurrency(value)] || 0);
        const agreed = bronzeQuote(item);
        const send = value => window.GFMascota.api('/api/economia/tienda', { op, itemId: value.id, cantidad, precioBronce: bronzeQuote(value), ref });
        let r = await send(item), d = r && r.datos || {};
        if (d.error === 'precios_actualizados' && !d.revision) {
            const loaded = await this._cargarPreciosServidor();
            const current = Object.values(this.itemsTienda || {}).flat().find(value => value.id === item.id);
            const next = current && bronzeQuote(current);
            // Reuse the reference only after an explicit rejection before payment,
            // and only when the new quote is at least as favorable to the player.
            if (loaded && Number.isSafeInteger(next) && next > 0 && (op === 'compra' ? next <= agreed : next >= agreed)) {
                item = { ...current }; r = await send(item); d = r && r.datos || {};
            }
        }""")
u.change(p,"            if (d.error === 'precios_actualizados') await this._cargarPreciosServidor();\n            const why =", "            const why = d.error === 'precios_actualizados' ? 'The price changed. Review the updated price and try again.'\n                :")
u.change(p,": d.message || d.error || 'The server could not complete the trade.';", ": ({saldo_insuficiente:'You do not have enough coins, including the shop fee.',nivel_bajo:'Your character has not reached the required level.',tope_diario_tienda:'You have reached the daily purchase limit.',objeto_no_disponible:'This item is not available for this trade.',crop_table_unavailable:'The crop table is unavailable. Nothing was charged.',resource_capacity_exhausted:'The resource table is full. Nothing was charged.'})[d.error] || (/^[A-Za-z0-9 _.,:;!?()'−–—-]+$/.test(d.message || '') && /[ .]/.test(d.message || '') ? d.message : 'The server could not complete the trade. Check pending operations before retrying.');")
u.change(p,"this.showNotification?.(why, 'error'); throw new Error(why);", "this.showNotification?.(why, 'error'); throw Object.assign(new Error(why), { code: d.error });")
print('Price conflict preserves consent and reference; player-facing trade errors in English')
