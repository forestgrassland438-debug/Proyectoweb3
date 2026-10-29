from pathlib import Path
p=Path('C:/Users/pc/Desktop/server2.js');s=p.read_text(encoding='utf8')
def rep(a,b):
 global s
 if a not in s: raise RuntimeError(a[:90])
 s=s.replace(a,b)
rep("  retenidoServicios: _cero(),", "  supervisor: { type: mongoose.Schema.Types.Mixed, default: null },\n  retenidoServicios: _cero(),")
anchor="let _ecoSupervisor = { ejecutando: false, ultima: null, error: null, acciones: [] };"
rep(anchor,anchor+'''
async function ecoSupervisorPolitica() {
  const d = await TesoroJuego.findById(TESORO_JUEGO_ID).select('supervisor').lean();
  const p = d && d.supervisor || {};
  return { ...ECO_SUPERVISOR_BASE, activo: p.activo !== false, quemaAutomatica: p.quemaAutomatica !== false };
}
app.post('/api/admin/economia/supervisor/config', adminAuth, strictLimiter, async (req, res) => {
  try {
    const b = req.body || {};
    if (typeof b.activo !== 'boolean' || typeof b.quemaAutomatica !== 'boolean') return res.status(400).json({ error: 'datos_invalidos' });
    await TesoroJuego.updateOne({ _id: TESORO_JUEGO_ID }, { $set: { supervisor: { activo: b.activo, quemaAutomatica: b.quemaAutomatica } } }, { upsert: true });
    res.json({ ok: true });
  } catch (e) { ecoResponderError(res, e); }
});
''')
rep("    const [game, circular] = await Promise.all([", "    const politica = await ecoSupervisorPolitica();\n    if (!politica.activo) { _ecoSupervisor.ultima = new Date(); _ecoSupervisor.acciones = ['Politica pausada; recuperacion de pagos activa']; return; }\n    const [game, circular] = await Promise.all([")
rep('if (completa && hoy && hoy.inflacionNeta7 > ECO_SUPERVISOR_BASE.umbralInflacion)', 'if (politica.quemaAutomatica && completa && hoy && hoy.inflacionNeta7 > ECO_SUPERVISOR_BASE.umbralInflacion)')
rep('res.json({ ok: true, politica: ECO_SUPERVISOR_BASE, estado:', 'res.json({ ok: true, politica: await ecoSupervisorPolitica(), estado:')
# Diagnostics for legitimate no-drop cases, visible to the player as well as administrators.
rep("  if (!gp || !gfNombreValido(gp.Username)) return null;", "  if (!gp || !gfNombreValido(gp.Username)) return null;\n  gp._tesoroEstado = 'azar';")
rep("  if (!cfg.activo) return null;", "  if (!cfg.activo) { gp._tesoroEstado = 'pausado'; return null; }")
rep("  if (deHoy >= cfg.topeDiario) return null;", "  if (deHoy >= cfg.topeDiario) { gp._tesoroEstado = 'tope_diario'; return null; }")
rep("if (!(cantidad >= cfg.pagoMin)) { _tesoroRacha", "if (!(cantidad >= cfg.pagoMin)) { gp._tesoroEstado = 'sin_fondos'; _tesoroRacha")
rep("caducaMs: BOTIN_CADUCA_MS, sinNombre: !conNombre", "caducaMs: BOTIN_CADUCA_MS, sinNombre: !conNombre, tesoroEstado: botin.some(x => x.incentivo) ? 'reservado' : gp._tesoroEstado || 'sin_nombre'")
p.write_text(s,encoding='utf8',newline='\r\n')
# No new network service is needed: the rule engine is the automatic policy.
p=Path(__file__).resolve().parent.parent/'economia.html';s=p.read_text(encoding='utf8');s=s.replace('<div id="e3-state"', '<div style="display:flex;gap:16px;flex-wrap:wrap;margin:12px 0"><label><input id="e3-active" type="checkbox"> Supervisor automático</label><label><input id="e3-burn" type="checkbox"> Quema automática limitada</label><button id="e3-save" type="button" class="tz-btn">Guardar automatismo</button></div>\n        <div id="e3-state"');p.write_text(s,encoding='utf8')
print('Supervisor pause controls and loot diagnostics applied.')
