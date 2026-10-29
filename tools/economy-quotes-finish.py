from pathlib import Path
p=Path('C:/Users/pc/Desktop/server2.js');s=p.read_text(encoding='utf8')
s=s.replace('  supervisor: { type:', '  versionCotizaciones: _cero(),\n  supervisor: { type:',1)
s=s.replace('async function economiaCompradoHoy(address) {', 'async function economiaCompradoHoy(address, session) {')
s=s.replace(".select('oro oroDado estado caduca').lean();", ".select('oro oroDado estado caduca').session(session || null).lean();")
a=s.index('    return await enColaDelJugador(address, async () => {',s.index("app.post('/api/currency/oro/cotizar'"))
b=s.index('  } catch (e)',a)
s=s[:a]+'''    const pub = await economiaEstadoPublico(), hoy = await economiaHoy();
    const quote = await enColaDelJugador(address, () => ecoTransaccion(async session => {
      // A common write serializes quote quotas across processes as well as browser tabs.
      await TesoroJuego.updateOne({ _id: TESORO_JUEGO_ID }, { $inc: { versionCotizaciones: 1 } }, { upsert: true, session });
      const comprado = await economiaCompradoHoy(address, session);
      if (comprado + oro > pub.tope) return { limitada: true, comprado };
      const wei = BigInt(hoy.precioGwei) * 1000000000n * BigInt(oro), id = crypto.randomBytes(12).toString('hex');
      const [c] = await CompraOro.create([{ _id: id, playerName: gp.playerName, address, oro, wei: wei.toString(), precioGwei: hoy.precioGwei,
        destino, dia: _diaUTC(), caduca: new Date(Date.now() + ECONOMIA_COTIZACION_MS) }], { session });
      return { ok: true, id, oro, wei: c.wei, zkltc: _gwei(hoy.precioGwei) * oro, precioOro: _gwei(hoy.precioGwei), destino, chainId: CHAIN_ID, caduca: c.caduca };
    }));
    if (quote.limitada) return res.status(429).json({ error: 'tope_diario', tope: pub.tope, comprado: quote.comprado, quedan: Math.max(0, pub.tope - quote.comprado) });
    return res.json(quote);
''' +s[b:]
s=s.replace("reservado: Math.max(0, Number(tc && tc.reservado) || 0), quemado:", "disponible: ecoSaldoDisponible(tc, 'circular'), reservado: Math.max(0, Number(tc && tc.reservado) || 0), quemado:")
s=s.replace("retenido: Math.max(0, Number(tj && tj.retenidoServicios) || 0), ingresado:", "retenido: Math.max(0, Number(tj && tj.retenidoServicios) || 0), disponible: ecoSaldoDisponible(tj, 'juego'), ingresado:")
p.write_text(s,encoding='utf8',newline='\r\n')
R=Path(__file__).resolve().parent.parent
p=R/'economia2.js';s=p.read_text(encoding='utf8');s=s.replace('const pasa = q.bronce > saldo;', "const disponible = tr[q.tesoro] && tr[q.tesoro].disponible;\n    const pasa = q.bronce > (Number.isFinite(disponible) ? disponible : saldo);")
s=s.replace("$('e2-q-cantidad').value = String(Math.floor(saldo / (POR[q.moneda] || 1)));", "const disponible = tr[q.tesoro] && tr[q.tesoro].disponible;\n    $('e2-q-cantidad').value = String(Math.floor((Number.isFinite(disponible) ? disponible : saldo) / (POR[q.moneda] || 1)));")
s=s.replace("estado.textContent = e && e.code === 'saldo_insuficiente' ?", "estado.textContent = e && e.code === 'reserva_protegida' ? t('The protected reserve cannot be burned. Use only the available surplus.') : e && e.code === 'saldo_insuficiente' ?")
p.write_text(s,encoding='utf8')
