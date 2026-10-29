from pathlib import Path
import json,hashlib,shutil
R=Path.cwd().resolve();A=Path('C:/Users/pc/.codex/reports/grassland-plantas-20261029');A.mkdir(parents=True,exist_ok=True)
def read(p):return Path(p).read_text(encoding='utf8')
def save(p,text):
 p=Path(p);old=p.read_bytes() if p.exists() else b'';p.write_bytes(text.replace('\r\n','\n').replace('\n','\r\n' if b'\r\n' in old else '\n').encode('utf8'))
def backup(p):
 p=Path(p).resolve();file=A/'before-manifest.json';rows=json.loads(read(file)) if file.exists() else []
 if any(x['path']==str(p) for x in rows):return
 rel=p.relative_to(R) if p.is_relative_to(R) else Path('desktop')/p.name;b=A/'before'/rel;b.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,b)
 rows.append({'path':str(p),'backup':str(b),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()});file.write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
def change(p,old,new,count=1):
 backup(p);s=read(p);assert s.count(old)==count,(str(p),old[:80],s.count(old));save(p,s.replace(old,new))
