from pathlib import Path
import json,hashlib,shutil
R=Path.cwd();A=Path('C:/Users/pc/.codex/reports/grassland-auditoria-20261029')
def backup(p):
 p=Path(p).resolve();m=json.loads((A/'before-manifest.json').read_text(encoding='utf8'))
 if any(Path(x['path'])==p for x in m):return
 rel=p.relative_to(R) if p.is_relative_to(R) else Path('desktop')/p.name;b=A/'before'/rel;b.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,b)
 m.append({'path':str(p),'backup':str(b),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size});(A/'before-manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf8')
def read(p):return Path(p).read_text(encoding='utf8')
def save(p,s):
 p=Path(p);original=p.read_bytes() if p.exists() else b'';newline='\r\n' if b'\r\n' in original else '\n';p.write_bytes(s.replace('\r\n','\n').replace('\n',newline).encode('utf8'))
def change(p,old,new,count=1):
 s=read(p);assert s.count(old)==count,(p,old[:80],s.count(old));save(p,s.replace(old,new))
def record(ids,status,evidence,action=None):
 p=A/'findings.json';m=json.loads(p.read_text(encoding='utf8'));ids=set(ids.split(','))
 for x in m:
  if x['id'] in ids:x.update(status=status,evidence=evidence if isinstance(evidence,list) else [evidence],action=action)
 p.write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf8')
