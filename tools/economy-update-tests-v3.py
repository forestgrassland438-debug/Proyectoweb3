from pathlib import Path
R=Path(__file__).resolve().parent
for name in ['economia.test.cjs','recargas-y-suelo.test.cjs']:
 p=R/name;s=p.read_text(encoding='utf8');s=s.replace("eco2TrasFoto: async () => {},", "eco2MigrarReserva: async () => {}, eco2TrasFoto: async () => {},");p.write_text(s,encoding='utf8')
p=R/'economia2.test.cjs';s=p.read_text(encoding='utf8')
s=s.replace("assert.equal(b.Tesoro._t[0].quemado, 300); assert.equal(b.Tesoro._t[0].saldo, 50000, 'no vuelve al saldo');", "assert.equal(b.Tesoro._t[0].quemado || 0, 0); assert.equal(b.Tesoro._t[0].saldo, 50300, 'la recompensa no recogida vuelve al tesoro');")
s=s.replace("const q = b.M.EconomiaQuema._t.find((x) => x.origen === 'monedas_caducadas');\n  assert.equal(q.bronce, 300);", "assert.equal(b.M.EconomiaQuema._t.length, 0, 'caducar el botín no destruye la reserva');")
s=s.replace("/if \\(b\\.incentivo && !b\\.recogiendo\\) tesoroQuemarCaducado\\(b\\.cantidad, b\\);\\n  \\}\\n  for \\(const \\[k, t\\] of _monstruoUltimo\\)/", "/if \\(b\\.incentivo && !b\\.recogiendo\\) tesoroQuemarCaducado\\(b\\.cantidad, b\\)/")
p.write_text(s,encoding='utf8')
p=R/'tesoro.test.cjs';s=p.read_text(encoding='utf8')
s=s.replace('const q = { select() { return q; },', 'const q = { session() { return q; }, select() { return q; },')
s=s.replace('aplicar(u); return { modifiedCount: 1 };', 'aplicar(u); return { modifiedCount: 1, matchedCount: 1 };')
s=s.replace("filas.push(clone(d)); return d;", "if (Array.isArray(d)) { for (const row of d) filas.push(clone(row)); return d; }\n    filas.push(clone(d)); return d;")
s=s.replace("console: quiet, Tesoro, TesoroMov,", """console: quiet, Tesoro, TesoroMov,
    ecoError: (code, status) => Object.assign(new Error(code), { code, status }),
    ecoTransaccion: async fn => {
      const before = clone(Tesoro.doc), paidBefore = pagados.length;
      try { return await fn({}); }
      catch (e) { if (before && Tesoro.doc) { for (const k of Object.keys(Tesoro.doc)) delete Tesoro.doc[k]; Object.assign(Tesoro.doc, before); } pagados.splice(paidBefore); throw e; }
    },""")
s=s.replace("PlayerStats: { findOne: f => consulta(() => (stats[f.playerName] != null ? { exp: stats[f.playerName] } : null)) },", """PlayerStats: { findOne: f => consulta(() => (stats[f.playerName] != null ? { exp: stats[f.playerName] } : null)),
      findOneAndUpdate: async (f, u) => { if (!devolver) return null; pagados.push({ playerName: f.playerName, stat: 'bronce', n: u.$inc.bronce }); return { playerName: f.playerName, bronce: u.$inc.bronce }; } },""")
s=s.replace("assert.equal(await s.tesoroIncentivo(ana, def, 'lobo', 5), null);\n  assert.equal(await s.tesoroIncentivo(ana, def, 'lobo', 5), null);", "assert.equal((await s.tesoroIncentivo(ana, def, 'lobo', 5)).cantidad, 100, 'recompensa base automática');\n  assert.equal((await s.tesoroIncentivo(ana, def, 'lobo', 5)).cantidad, 100);")
s=s.replace('assert.equal(s.Tesoro.doc.reservado, b.cantidad);','assert.equal(s.Tesoro.doc.reservado, b.cantidad + 200);')
s=s.replace("s.Tesoro.doc.config = { topeDiario: 2 };", "s.Tesoro.doc.config = { topeDiario: 4 };")
s=s.replace("assert.equal(await sinStats.tesoroPagar(gp, { cantidad: 300, incentivo: { vip: false } }), null);\n  assert.equal(sinStats.Tesoro.doc.saldo, 300); assert.equal(sinStats.Tesoro.doc.reservado, 0);", "await assert.rejects(() => sinStats.tesoroPagar(gp, { cantidad: 300, incentivo: { vip: false } }), /sin_stats/);\n  assert.equal(sinStats.Tesoro.doc.saldo, 0); assert.equal(sinStats.Tesoro.doc.reservado, 300, 'el fallo revierte y conserva la reserva para reintentar');")
p.write_text(s,encoding='utf8')
print('Reward conservation and transactional failure assertions updated.')
