from pathlib import Path
R=Path(__file__).resolve().parent.parent
p=Path('C:/Users/pc/Desktop/server2.js');s=p.read_text(encoding='utf8')
s=s.replace("  estado: { type: String, enum: ['cobrado'", "  precioBronce: { type: Number, default: 0 },\n  confirmadas: { type: Number, default: 0 },\n  estado: { type: String, enum: ['cobrado'")
anchor="// ECONOMY SAFETY POLICY v3."
assert anchor in s;s=s.replace(anchor,(R/'tools/economy-shop-authority.fragment.cjs').read_text(encoding='utf8')+'\n\n'+anchor)
# Prevent shop receipts being used as service-refund tickets.
s=s.replace("{ _id: b.id, estado: { $in: ['cobrado', 'revision'] }, devuelto: false }", "{ _id: b.id, tipo: { $in: ['craftear', 'fundir'] }, estado: { $in: ['cobrado', 'revision'] }, devuelto: false }")
# Money is authoritative in Mongo. Browser writes are acknowledgements only.
anchor="    const validKeys = STAT_TYPES_LIST.filter(k => updates[k] !== undefined);"
assert anchor in s;s=s.replace(anchor,"""    const currencyKeys = ['oro', 'plata', 'bronce'];
    const validKeys = STAT_TYPES_LIST.filter(k => updates[k] !== undefined && !currencyKeys.includes(k));
    if (!validKeys.length && currencyKeys.some(k => updates[k] !== undefined)) {
      const actual = await PlayerStats.findOne({ playerName }).lean();
      if (!actual) return res.status(404).json({ error: 'sin_stats' });
      return res.json({ stats: buildStatsResponse(actual), monedasAutoritativas: true });
    }""")
old="const STAT_INITIAL_MAP   = { vida: VITAL_MAX, agua: VITAL_MAX, comida: VITAL_MAX, oro: 1000, plata: 1000, bronce: 1000, exp: 0 };"
assert old in s;s=s.replace(old,"const STAT_INITIAL_MAP   = { vida: VITAL_MAX, agua: VITAL_MAX, comida: VITAL_MAX, oro: 0, plata: 0, bronce: 0, exp: 0 }; // Existing balances are preserved; new wallets do not create unbacked money.")
p.write_text(s,encoding='utf8',newline='\r\n')
p=R/'tienda_sistema.js';s=p.read_text(encoding='utf8')
a=s.index('        this.setBalanceByCurrency(currency, balance - totalCost);', s.index('    async processPurchase('));b=s.index('\n    // Tabla de seguimiento on-chain',a)
s=s[:a]+'''        const ref = this._nuevaRef();
        const copy = { ...item };
        this._encolarTrabajoTienda(`Shop purchase: ${quantity}x ${item.id}`, async () => {
            await this._operacionEconomicaTienda('compra', copy, quantity, ref);
        });
        this.showNotification?.(`⏳ Buying ${quantity}x ${item.name} — payment and delivery are verified by the server.`, 'info');
    }
''' +s[b:]
a=s.index('    async _ventaEnCadena(');b=s.index('\n    ',a+4)
# Find the next method rather than cutting inside the function body.
b=s.index('\n    //',s.index('✅ Sale recorded:',a))
s=s[:a]+'''    async _ventaEnCadena(item, cantidad, tabla, soltar, ref) {
        try { return await this._operacionEconomicaTienda('venta', { ...item }, cantidad, ref || this._nuevaRef()); }
        finally { soltar(); }
    }

    async _operacionEconomicaTienda(op, item, cantidad, ref) {
        if (!window.GFMascota?.api) throw new Error('The authoritative payment service is unavailable.');
        const factor = { gold: 1000000, silver: 1000, bronze: 1 }[this.getItemCurrency(item)];
        const r = await window.GFMascota.api('/api/economia/tienda', { op, itemId: item.id, cantidad,
            precioBronce: Number(op === 'compra' ? item.buyPrice : item.sellPrice) * factor, ref });
        const d = r && r.datos || {};
        if (!r || !r.ok || !d.ok) {
            if (d.error === 'precios_actualizados') await this._cargarPreciosServidor();
            const why = d.error === 'tienda_sin_liquidez' ? 'The shop needs reserve funds before it can buy items. Nothing was consumed.'
                : d.revision ? 'Your operation is recorded for chain review. Do not repeat it; the control center has the receipt.'
                : d.message || d.error || 'The server could not complete the trade.';
            this.showNotification?.(why, 'error'); throw new Error(why);
        }
        if (d.stats) {
            if (window.GFBronce?.adoptarStats) window.GFBronce.adoptarStats(d.stats);
            this.playerMoneda = Number(d.stats.oro) || 0; this.playerMonedaPlata = Number(d.stats.plata) || 0;
            if (window.playerStats) Object.assign(window.playerStats, d.stats);
        }
        this._confirmedPurchaseInvoices = [];
        await this._persistConfirmedPurchase(item.id);
        this.addToHistorial(op, item, d.confirmadas, (op === 'compra' ? item.buyPrice : item.sellPrice) * d.confirmadas, this.getItemCurrency(item));
        this.updateMonedaDisplay?.(); this._refrescarDisponibles();
        this.showNotification?.(`✓ ${d.confirmadas}x ${item.name}: payment and delivery confirmed.`, 'success');
        return d;
    }
''' +s[b:]
p.write_text(s,encoding='utf8')
print('NPC trades moved to server authority; existing player balances preserved.')
