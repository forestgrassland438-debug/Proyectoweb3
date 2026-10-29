from pathlib import Path
p=Path('C:/Users/pc/Desktop/server2.js');s=p.read_text(encoding='utf8');s=s.replace("TABLA_CONS_PARCELAS, 'vip', ...GF_ALLOC_KEYS", "TABLA_CONS_PARCELAS, 'vip', 'oro', 'plata', 'bronce', ...GF_ALLOC_KEYS");p.write_text(s,encoding='utf8',newline='\r\n')
R=Path(__file__).resolve().parent.parent
p=R/'tools/vitales-y-monedas.test.cjs';s=p.read_text(encoding='utf8').replace('bronce: 1000/', 'bronce: 0/');p.write_text(s,encoding='utf8')
p=R/'gf-mascota.js';s=p.read_text(encoding='utf8');a='setTimeout(function () { controller.abort(); }, 15000)';assert a in s;s=s.replace(a,"setTimeout(function () { controller.abort(); }, ruta === '/api/economia/tienda' ? 180000 : 15000)");p.write_text(s,encoding='utf8')
