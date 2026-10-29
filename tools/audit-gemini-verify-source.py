from pathlib import Path
import json,hashlib,difflib,subprocess,datetime
R=Path.cwd();A=Path('C:/Users/pc/.codex/reports/grassland-auditoria-20261029');before=json.loads((A/'before-manifest.json').read_text(encoding='utf8'))
newnames={'backend-gameplay/crafting-authority.cjs','backend-gameplay/recipes.json','backend-gameplay/consumables.json','backend-gameplay/stat-chain-journal.cjs','desktop/crafting-authority.js','desktop/craft-recipes.json','desktop/consumables.json','desktop/stat-chain-journal.js'}
entries=[];patch=[];checked=[]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
for item in before:
 p=Path(item['path']);b=Path(item['backup']);assert b.is_file(),b;assert sha(b)==item['sha256'],('backup changed',b)
 assert p.is_file(),('source missing',p);relative=p.relative_to(R).as_posix() if p.is_relative_to(R) else 'desktop/'+p.name
 assert not relative.startswith(('Maps/','Game/Maps/','Game/MAPAS/','Game/Sprites/')),('unexpected manual art/map edit',relative)
 digest=sha(p);entries.append({'path':str(p),'relative':relative,'createdInAudit':relative in newnames,'backup':str(b),'beforeSha256':item['sha256'],'afterSha256':digest,'changed':digest!=item['sha256']})
 if digest!=item['sha256'] and p.suffix in {'.js','.cjs','.html','.md','.json'}:
  patch.extend(difflib.unified_diff(b.read_text(encoding='utf8').splitlines(True),p.read_text(encoding='utf8').splitlines(True),fromfile='backup/'+relative,tofile='working/'+relative))
for relative in newnames:
 p=(Path('C:/Users/pc/Desktop')/relative.split('/',1)[1]) if relative.startswith('desktop/') else R/relative
 assert p.is_file(),p
 if not any(Path(x['path'])==p for x in entries):entries.append({'path':str(p),'relative':relative,'createdInAudit':True,'afterSha256':sha(p)})
for entry in entries:
 p=Path(entry['path'])
 if p.suffix in {'.js','.cjs'}:
  result=subprocess.run(['node','--check',str(p)],capture_output=True,text=True,encoding='utf8');assert result.returncode==0,(p,result.stderr);checked.append(str(p))
for source,destination in [('crafting-authority.cjs','crafting-authority.js'),('stat-chain-journal.cjs','stat-chain-journal.js'),('recipes.json','craft-recipes.json'),('consumables.json','consumables.json')]:
 assert sha(R/'backend-gameplay'/source)==sha(Path('C:/Users/pc/Desktop')/destination),('deployment module differs',source)
current=subprocess.run(['git','status','--porcelain=v1'],cwd=R,capture_output=True,text=True,encoding='utf8',errors='replace',check=True).stdout
initial=(A/'git-status-before.txt').read_text(encoding='utf-8-sig')
protected=lambda text:{line[3:]:line[:2] for line in text.splitlines() if any(part in line.lower() for part in ['maps/','mapas/','sprites/','recortadas_'])}
old,new=protected(initial),protected(current);statusChanges=[{'path':p,'before':v,'after':new.get(p)} for p,v in old.items() if new.get(p)!=v]
assert not statusChanges,('manual asset status changed',statusChanges)
result={'ok':True,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':entries,'syntaxChecked':checked,'allRecordedBackupsIntact':True,'moduleCopiesEqual':True,'protectedGitStatusChanges':statusChanges,
 'contractReadOnlyCurrentSha256':sha(Path('C:/Users/pc/Desktop/rr.txt.txt')),
 'limits':'Protected Git status is compared with the initial status. It is not a content hash comparison of every manual asset; those files were not written by this audit.'}
(A/'after-manifest.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');(A/'changes-private.patch').write_text(''.join(patch),encoding='utf8');(A/'git-status-after.txt').write_text(current,encoding='utf8')
print(len(entries),'source files recorded;',len(checked),'JavaScript syntax checks; backups intact; deployment modules equal; manual asset statuses preserved')
