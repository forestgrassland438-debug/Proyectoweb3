from pathlib import Path
R=Path(__file__).resolve().parent
for name in ['economia.test.cjs','recargas-y-suelo.test.cjs']:
    p=R/name;s=p.read_text(encoding='utf8')
    anchor='  // (2026-10-28) La economía, 2.ª parte:'
    pos=s.index(anchor)
    add='''  // New atomic credit path: exercise the actual transaction helper with a rollback-capable DB double.
  ctx.PlayerStats.findOneAndUpdate = async (q, u) => {
    if (u.$inc && u.$inc.oro) { stats.oro += u.$inc.oro; devueltos.push(['Ana', 'oro', u.$inc.oro]); }
    return { ...stats };
  };
  require('./economy-mock-transactions.cjs')(ctx, Object.values(M), [stats]);
  vm.runInContext(trozo(SRV, 'async function ecoTransaccion(', '\\n}\\n'), ctx);
'''
    s=s[:pos]+add+s[pos:];p.write_text(s,encoding='utf8')
p=R/'economia2.test.cjs';s=p.read_text(encoding='utf8')
# Models emulate Mongoose's defaults for the newly durable receipt state.
s=s.replace("crearCobro({ devuelto: false, ...d })", "crearCobro({ devuelto: false, estado: 'cobrado', t: new Date(), ...d })")
pos=s.index("  vm.runInContext(trozo('const TIENDA_PRECIOS")
s=s[:pos]+"  require('./economy-mock-transactions.cjs')(ctx, [...Object.values(M), Tesoro, TesoroJuego, TesoroMov, stats]);\n"+s[pos:]
s=s.replace('eco2Catalogo, eco2Config };','eco2Catalogo, eco2Config, eco2MigrarReserva, ecoQuemarSeguro, ecoTransferirCircular, ecoSaldoDisponible, ecoTransaccion };')
s=s.replace("/ 1000, 0.17, 'el valor de lo destruido (30 de 1.000) la baja'", "/ 1000, 0.2, 'destruir objetos no destruye monedas'")
s=s.replace("  assert.deepEqual(J(b.juego), [['servicios', 1250]]);", "  assert.equal(b.TesoroJuego._t[0].saldo, 10250);\n  assert.equal(b.TesoroJuego._t[0].retenidoServicios, 1250);")
a=s.index("  r = await b.llamar('POST /api/economia/servicio/devolver', { ref: 'ref-fundir-1' });")
z=s.index("\n});",a)
s=s[:a]+'''  r = await b.llamar('POST /api/economia/servicio/devolver', { ref: 'ref-fundir-1' });
  assert.equal(r.st, 202, 'el navegador solicita revisión; no se autorreembolsa');
  assert.equal(b.stats._t[0].bronce, 50);
  r = await b.llamar('POST /api/admin/economia/servicios/revisar', { id: 'Ana:ref-fundir-1', accion: 'devolver', motivo: 'Fallo confirmado en la cadena' });
  assert.equal(r.st, 200, JSON.stringify(r.out));
  assert.equal(b.stats._t[0].bronce, 1300);
  assert.equal(b.TesoroJuego._t[0].retenidoServicios, 0);
  const again = await b.llamar('POST /api/admin/economia/servicios/revisar', { id: 'Ana:ref-fundir-1', accion: 'devolver', motivo: 'Fallo confirmado en la cadena' });
  assert.equal(again.st, 409, 'solo devuelve una vez');'''+s[z:]
s=s.replace("  let r = await b.llamar('POST /api/admin/economia/quemar',", "  b.Tesoro._t[0].saldo = 150000;\n  let r = await b.llamar('POST /api/admin/economia/quemar',",1)
s=s.replace("cantidad: 20, motivo: 'prueba'", "cantidad: 20, motivo: 'prueba', ref: 'burn-test-001'")
s=s.replace('saldo, 30000','saldo, 130000')
s=s.replace("cantidad: 1, motivo: 'demasiado'", "cantidad: 1, motivo: 'demasiado', ref: 'burn-test-002'")
s=s.replace("assert.equal(r.out.error, 'saldo_insuficiente');", "assert.equal(r.out.error, 'reserva_protegida');")
s=s.replace("assert.equal(r.out.error, 'motivo_requerido');", "assert.equal(r.out.error, 'datos_invalidos');")
s=s.replace("  assert.equal(b.M.TesoroReserva._t[0].saldo, 60000);\n  assert.equal(b.M.TesoroReserva._t[0].ingresado.muerte, 60000);\n  assert.equal(b.TesoroMov._t[0].tesoro, 'reserva');", "  assert.deepEqual(J(b.juego), [['muerte', 60000]]);\n  assert.equal(b.M.TesoroReserva._t.length, 0, 'sin tercer tesoro activo');")
s+='\nmodule.exports = { bloque, modelo, J };\n';p.write_text(s,encoding='utf8')
print('Transaction-aware test doubles and revised business rules updated.')
