from pathlib import Path
import json,hashlib,shutil,datetime
R=Path.cwd();A=Path('C:/Users/pc/.codex/reports/grassland-auditoria-20261029')
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');out=A/'checkpoints'/stamp;out.mkdir(parents=True,exist_ok=False)
original=json.loads((A/'before-manifest.json').read_text(encoding='utf8'));result=[]
paths=[Path(r['path']) for r in original]
paths.extend([Path('backend-gameplay/crafting-authority.cjs'),Path('backend-gameplay/recipes.json'),Path('backend-gameplay/consumables.json'),Path('C:/Users/pc/Desktop/crafting-authority.js'),Path('C:/Users/pc/Desktop/craft-recipes.json'),Path('C:/Users/pc/Desktop/consumables.json')])
for path in paths:
 p=path.resolve()
 if not p.is_file():continue
 relative=p.relative_to(R) if p.is_relative_to(R) else Path('desktop')/p.name
 target=out/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
 result.append({'path':str(p),'snapshot':str(target),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
(out/'manifest.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(str(out));print(len(result),'source files checkpointed; initial backups preserved.')
