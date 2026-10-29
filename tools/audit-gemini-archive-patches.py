from pathlib import Path
import shutil,json
R=Path.cwd().resolve();T=(R/'tools').resolve();A=Path('C:/Users/pc/.codex/reports/grassland-auditoria-20261029').resolve();D=A/'scripts-aplicados';D.mkdir(exist_ok=True)
keep={'audit-gemini-utils.py','audit-gemini-checkpoint.py','audit-gemini-report.py','audit-gemini-verify-source.py','audit-gemini-cache-versions.py','audit-gemini-archive-patches.py'}
files=[p for p in T.glob('audit-gemini-*.py') if p.name not in keep]
extract=T/'audit-gemini-extract-recipes.cjs'
if extract.exists():files.append(extract)
records=[]
for p in files:
 source=p.resolve();target=(D/p.name).resolve();assert source.parent==T and target.parent==D and not target.exists(),(source,target)
 shutil.move(str(source),str(target));records.append({'source':str(source),'archived':str(target)})
(D/'NO-REAPLICAR.txt').write_text('Parches de una sola aplicación, ya incorporados y verificados. No ejecutarlos de nuevo: algunos sustituyen bloques históricos y pueden borrar arreglos posteriores. El código actual, findings.json y changes-private.patch son la referencia. Se conservan para trazabilidad, fuera del webroot.\n',encoding='utf8')
(A/'archived-patches.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8');print('Archived',len(records),'one-time scripts outside the webroot; reusable verification tools retained')
