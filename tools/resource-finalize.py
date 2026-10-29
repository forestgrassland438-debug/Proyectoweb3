from pathlib import Path
import json, hashlib, re, difflib, importlib.util
R=Path(__file__).resolve().parent.parent;A=R/'audits/recursos-20261028'
spec=importlib.util.spec_from_file_location('res_apply',R/'tools/resource-economy-apply.py');u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u)
hashof=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
before=json.loads((A/'before-manifest.json').read_text(encoding='utf8'))
extra=R/'tools/economia2.test.cjs';back=A/'before/tools/economia2.test.cjs'
if not any(Path(x['path'])==extra for x in before):before.append({'path':str(extra),'before':str(back),'sha256':hashof(back),'bytes':back.stat().st_size})
assets=['Scenes/GameScene.js','control-center.js','reporter.js','admin-suite-i18n.js','market-experience.css','operations-panels.css','operations-panels.js','recursos.js','cuentas.js']
for page in ['index.html','game.html','control-center.html','reporter.html','market.html','recursos.html','cuentas.html']:
 p=R/page;s=u.read(p);old=s
 for asset in assets:
  s=re.sub(r'((?:src|href)="(?:\./)?'+re.escape(asset)+r')(?:\?v=[^"\s]*)?(?=")',lambda m:m[1]+'?v=20261029.'+hashof(R/asset)[:12],s)
 if s!=old:u.save(p,s)
(A/'before-manifest.json').write_text(json.dumps(before,ensure_ascii=False,indent=2),encoding='utf8')
changes=[];diff=[]
for entry in before:
 p=Path(entry['path']);backup=Path(entry['before']);backup=backup if backup.is_absolute() else R/backup
 assert hashof(backup)==entry['sha256'],str(backup)
 current=hashof(p)
 if current==entry['sha256']:continue
 role='backend' if not p.is_relative_to(R) or p.name=='marketplace-routes.js' else 'test' if p.is_relative_to(R/'tools') else 'frontend'
 changes.append({'path':str(p),'role':role,'new':False,'before':entry['sha256'],'after':current,'bytes':p.stat().st_size})
 diff.extend(difflib.unified_diff(u.read(backup).splitlines(True),u.read(p).splitlines(True),fromfile='before/'+str(p.relative_to(R) if p.is_relative_to(R) else p.name),tofile='after/'+str(p.relative_to(R) if p.is_relative_to(R) else p.name)))
new=['operations-panels.css','operations-panels.js','recursos.html','recursos.js','cuentas.html','cuentas.js','assets/market/forest-outpost-20261028.png','assets/economia/circuito-recursos.svg','assets/economia/curva-recursos.png','assets/economia/simulacion-365-dias.png']
new+=['tools/'+p.name for p in (R/'tools').glob('resource-*') if p.is_file()]
for rel in sorted(set(new)):
 p=R/rel;changes.append({'path':str(p),'role':'test_tool' if rel.startswith('tools/') else 'frontend','new':True,'before':None,'after':hashof(p),'bytes':p.stat().st_size})
assert hashof('C:/Users/pc/Desktop/rr.txt.txt')==next(e['sha256'] for e in before if Path(e['path']).name=='rr.txt.txt')
assert hashof('C:/Users/pc/Desktop/marketplace-routes.js')==hashof(R/'marketplace-routes.js')
report={'deployed':False,'productionWrites':False,'contractModified':False,'subagentsUsed':False,'files':changes}
(A/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
(A/'changes.patch').write_text(''.join(diff),encoding='utf8')
(A/'.gitignore').write_text('before/\n*.patch\n',encoding='utf8')
frontend=[str(Path(x['path']).relative_to(R)).replace('\\','/') for x in changes if x['role']=='frontend']
(A/'DEPLOY.txt').write_text('PUBLICAR WEB (solo estos archivos de esta ampliación):\n'+'\n'.join(frontend)+'\n\nBACKEND (en su servicio, juntos):\nC:/Users/pc/Desktop/server2.js\nC:/Users/pc/Desktop/marketplace-routes.js\nC:/Users/pc/Desktop/gf-wallet-sdk/server/gf-wallet-routes.js\n\nNo publiques carpetas before/, parches, herramientas de prueba ni copias del backend en el hosting web.\nNo reemplaces rr.txt.txt ni redespliegues el contrato por estos cambios.\n',encoding='utf8')
(A/'README.md').write_text('''# Ampliación de recursos · 29 de octubre de 2026

Trabajo local, sin agentes, sin desplegar y sin usar claves o saldos de producción. El contrato entregado se conserva byte por byte. Las copias previas y el parche permiten revisar solo los cambios de esta tarea sin restablecer Git.

- `manifest.json`: rutas, tamaños, hashes anteriores y actuales; distingue backend, web y pruebas.
- `DEPLOY.txt`: lista concreta para desplegar juntos backend y web. Las copias `before/` y el parche son privados y no se publican con la web.
- `unit-results.txt`: 67 pruebas aprobadas de cobros, recursos, precios, idempotencia, permisos y atomicidad.
- `compatibility-results.txt`: 57 pruebas aprobadas de árboles, inventario entre escenas, administración, sesiones y recargas.
- `chain-integration.json` / `chain-results.txt`: nueve escenarios con MongoDB 7.0.14 en replica set local y el contrato original compilado con solc 0.8.20, OpenZeppelin 5.0.2 y EVM local. Incluye 100 reclamaciones concurrentes, conservación a tabla llena y el bypass privilegiado de migración. Ganache usa su alternativa JS porque el módulo nativo µWS no coincide con Node 24; los escenarios finalizaron y se cerraron el cliente, Mongo y EVM.
- `simulation.json`: un millón de consultas de política por lotes y cuatro escenarios de 365 días. Las cantidades nunca exceden el cap bajo las hipótesis. No es una prueba de capacidad de un millón de jugadores conectados.
- `browser-results.json` y capturas: 1280, 390 y 320 px, botones de compra/estadísticas, ausencia de desbordamiento, errores como texto, limpieza de datos al invalidar sesión, limpieza de bandeja relayer y treinta ciclos de retirada de iframe.
- `image-asset.json`: herramienta, descripción y hash de la ilustración nueva. Las figuras económicas se generan con Matplotlib; el diagrama es SVG.

## Reproducir

Ejecutar desde la carpeta del proyecto:

```
node --test tools/economia.test.cjs tools/economia2.test.cjs tools/tesoro.test.cjs tools/economy-authority.test.cjs tools/resource-economy.test.cjs tools/txt-marketplace-atomic.test.cjs
node --test tools/arboles.test.cjs tools/environment-resources.test.cjs tools/admin-suite-backend.test.cjs tools/admin-session.test.cjs tools/recargas-y-suelo.test.cjs tools/inventory-transitions.test.cjs
node tools/resource-chain-integration.cjs
node tools/resource-simulation.cjs
node tools/resource-browser-verification.cjs
```

La integración usa dependencias temporales en `C:/Users/pc/.codex/tmp/grassland-resource-tests-20261028/node_modules`; no se añadieron al package del juego. El navegador usa el Chromium headless instalado para pruebas, con datos sintéticos y un servidor local efímero. Las herramientas `resource-*-apply/integrate/finishing/final-backend.py` son transformaciones de una sola ejecución: no deben ejecutarse de nuevo sobre los archivos ya modificados. `resource-sync.py` solo actualiza los cuatro bloques nuevos delimitados por marcadores.

## Límites operativos

Migración abierta y cambios de límite por el propietario pueden superar la política. Las publicaciones anteriores sin prueba de custodia necesitan revisión; no se compensan inventando facturas. Un envío sin hash verificable requiere revisar la cadena. La presencia mide la instancia actual. Las pruebas no certifican cero defectos, todas las rutas del proyecto ni la capacidad real de Railway/RPC ante millones de jugadores.
''',encoding='utf8')
print('Cache versions, exact change manifest, deployment list and local audit generated:',len(changes),'files.')
