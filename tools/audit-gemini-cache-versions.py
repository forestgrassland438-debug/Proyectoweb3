from pathlib import Path
import json,re,hashlib,sys
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('auditutils',str(Path('tools/audit-gemini-utils.py').resolve())).load_module()
R=Path.cwd();A=Path('C:/Users/pc/.codex/reports/grassland-auditoria-20261029');m=json.loads((A/'before-manifest.json').read_text(encoding='utf8'))
changed=[]
for row in m:
 p=Path(row['path'])
 if p.is_relative_to(R) and p.suffix=='.js' and hashlib.sha256(p.read_bytes()).hexdigest()!=row['sha256']:changed.append(p.relative_to(R).as_posix())
patterns=[(name,re.compile(r'((?:\./|/)?'+re.escape(name)+r'\?v=)[a-zA-Z0-9._-]+')) for name in changed]
updates=[]
for p in [*R.glob('*.html'),*R.glob('*.js')]:
 s=u.read(p);n=s
 if '?v=' not in s:continue
 for name,pattern in patterns:
  if name+'?v=' in s:n=pattern.sub(lambda match:match[1]+'20261029.auditoria2',n)
 if n!=s:updates.append((p,s,n))
if '--apply' in sys.argv:
 for p,s,n in updates:u.backup(p);u.save(p,n)
 (A/'cache-version-files.json').write_text(json.dumps([str(p) for p,s,n in updates],ensure_ascii=False,indent=2),encoding='utf8')
 print('Updated',len(updates),'existing cache-version reference files')
else:
 for p,s,n in updates:print(p.name, sum(1 for a,b in zip(s.splitlines(),n.splitlines()) if a!=b),'changed lines')
