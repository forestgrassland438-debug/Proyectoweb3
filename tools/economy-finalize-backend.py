from pathlib import Path
p=Path('C:/Users/pc/Desktop/server2.js');s=p.read_text(encoding='utf8')
def rep(a,b):
    global s
    if a not in s: raise RuntimeError(a[:90])
    s=s.replace(a,b)
rep("} catch (e) { console.error('POST /api/admin/economia/quemar:', e); return res.status(500).json({ error: 'internal_error' }); }", "} catch (e) { return ecoResponderError(res, e); }")
rep('    const hoy = _diaUTC();\n    const n2', '    await eco2MigrarReserva();\n    const hoy = _diaUTC();\n    const n2')
rep('    const masa = oro * TESORO_BRONCE_POR.oro + plata * TESORO_BRONCE_POR.plata + bronce;', '    const masa = oro * TESORO_BRONCE_POR.oro + plata * TESORO_BRONCE_POR.plata + bronce;\n    if (!Number.isSafeInteger(masa)) throw ecoError(\'masa_fuera_de_rango\');')
rep('function eco2PlanPago(cuanto, s) {', "function eco2PlanPago(cuanto, s) {\n  if (!s || !Number.isSafeInteger(Number(cuanto)) || Number(cuanto) < 0 || ['oro', 'plata', 'bronce'].some(k => !Number.isSafeInteger(Number(s[k])) || Number(s[k]) < 0)) return null;")
rep('  const neta7 = activa7;', '  const neta7 = activa7;')
# A base reward in automatic mode removes the misleading "nothing happened" kill path.
rep("  if (!(Math.random() < prob)) { _tesoroRacha.set(quien, Math.min(100, racha + 1)); return null; }", "  const bonus = Math.random() < prob;\n  if (!bonus && cfg.modo !== 'auto') { _tesoroRacha.set(quien, Math.min(100, racha + 1)); return null; }")
rep('  let cantidad = tesoroCantidad(cfg, t ? t.saldo : 0, { vip, nivel, exp: def && def.exp, jefe });', '  let cantidad = !bonus ? cfg.pagoMin : tesoroCantidad(cfg, t ? t.saldo : 0, { vip, nivel, exp: def && def.exp, jefe });')
rep('  _tesoroRacha.set(quien, 0);', '  _tesoroRacha.set(quien, bonus ? 0 : Math.min(100, racha + 1));')
rep('  return { cantidad, vip, nivel, prob };', '  return { cantidad, vip, nivel, prob, bonus };')
rep("playerName: gp.playerName, vip: grupo === 'vip', nivel: b.incentivo ? b.incentivo.nivel : null }],", "playerName: gp.playerName, vip: grupo === 'vip', nivel: b.incentivo ? b.incentivo.nivel : null, detalle: b.incentivo ? String(b.incentivo.monstruo || '') : '' }],")
# Unclaimed bronze is not a legitimate supply burn. Release the hold, preserving the reward pool.
a=s.index('async function tesoroQuemarCaducado(');b=s.index('\n}\n',a)+3
s=s[:a]+'''async function tesoroQuemarCaducado(cantidad, b) {
  // Historical name retained for existing cleanup callers. Expiry returns coins to their treasury.
  const n = Number(cantidad);
  if (!Number.isSafeInteger(n) || n < 1) return;
  const ref = b && b.id ? 'caducado:' + b.id : null;
  await ecoTransaccion(async session => {
    if (ref && await TesoroMov.findOne({ ref }).session(session).lean()) return;
    const r = await Tesoro.updateOne({ _id: TESORO_ID, reservado: { $gte: n } }, { $inc: { saldo: n, reservado: -n, caducados: 1 } }, { session });
    if (!r.matchedCount) return;
    await TesoroMov.create([{ ...(ref ? { ref } : {}), tipo: 'ajuste', origen: 'botin_caducado', bronce: n,
      playerName: b && b.playerName || null, detalle: 'Unclaimed reward returned to treasury, no monetary burn' }], { session });
  });
}
''' +s[b:]
# Existing cleanup callers do not await: always handle rejection.
rep("tesoroQuemarCaducado(b.cantidad, b);", "tesoroQuemarCaducado(b.cantidad, b).catch(e => console.warn('botin caducado:', e.message));")
p.write_text(s,encoding='utf8',newline='\r\n')
# Fix the market's established language variable (retain user settings).
p=Path(__file__).resolve().parent.parent/'market.html';m=p.read_text(encoding='utf8').replace('state.lang ===', 'LANG ===');p.write_text(m,encoding='utf8')
print('Reserve conservation and funded base bronze rewards finalized.')
