from pathlib import Path
p=Path('C:/Users/pc/Desktop/server2.js');s=p.read_text(encoding='utf8')
anchor="  chainPending:      { type: [String], default: [] },"
assert anchor in s;s=s.replace(anchor,"  botinCupo: { dia: { type: String, default: '' }, n: { type: Number, default: 0 } },\n"+anchor,1)
a=s.index('  const r = await Tesoro.findOneAndUpdate(',s.index('async function tesoroIncentivo('));b=s.index("  _tesoroRacha.set(quien, bonus",a)
s=s[:a]+'''  const reserva = await ecoTransaccion(async session => {
    const st = await PlayerStats.findOne({ playerName: quien }).select('_id botinCupo').session(session).lean();
    if (!st) { gp._tesoroEstado = 'sin_stats'; return null; }
    const usados = st.botinCupo && st.botinCupo.dia === hoy ? Math.max(0, Number(st.botinCupo.n) || 0) : 0;
    if (usados >= cfg.topeDiario) { gp._tesoroEstado = 'tope_diario'; return null; }
    const r = await Tesoro.findOneAndUpdate({ _id: TESORO_ID, saldo: { $gte: cantidad } },
      { $inc: { saldo: -cantidad, reservado: cantidad } }, { new: true, session, projection: { saldo: 1 } }).lean();
    if (!r) return null;
    const cupo = await PlayerStats.updateOne({ _id: st._id }, { $set: { botinCupo: { dia: hoy, n: usados + 1 } } }, { session });
    if (!cupo.matchedCount) throw ecoError('sin_stats', 409);
    return { usados: usados + 1 };
  });
  if (!reserva) return null;
''' +s[b:]
s=s.replace("_tesoroDia.set(quien, { dia: hoy, n: deHoy + 1 });", "_tesoroDia.set(quien, { dia: hoy, n: reserva.usados });")
p.write_text(s,encoding='utf8',newline='\r\n')
p=Path(__file__).resolve().parent/'tesoro.test.cjs';s=p.read_text(encoding='utf8')
s=s.replace('const rutas = new Map(), pagados = [], juego = [];', 'const rutas = new Map(), pagados = [], juego = [], cupos = new Map();\n  let transactionTail = Promise.resolve();')
s=s.replace("const before = clone(Tesoro.doc), paidBefore = pagados.length;", "const previous = transactionTail; let release; transactionTail = new Promise(r => { release = r; }); await previous;\n      const before = clone(Tesoro.doc), paidBefore = pagados.length;")
s=s.replace("pagados.splice(paidBefore); throw e; }\n    },", "pagados.splice(paidBefore); throw e; } finally { release(); }\n    },")
s=s.replace("findOne: f => consulta(() => (stats[f.playerName] != null ? { exp: stats[f.playerName] } : null)),", "findOne: f => consulta(() => ({ _id: f.playerName, exp: stats[f.playerName] || 0, botinCupo: cupos.get(f.playerName) })),\n      updateOne: async (q, u) => { cupos.set(q._id, u.$set.botinCupo); return { matchedCount: 1 }; },")
s=s.replace("  // Apagado.\n", "  s._tesoroDia.clear();\n  assert.equal(await s.tesoroIncentivo(ana, def, 'lobo', 5), null, 'vaciar la caché no borra el cupo persistido');\n  // Apagado.\n")
p.write_text(s,encoding='utf8')
