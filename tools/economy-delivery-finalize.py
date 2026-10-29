from pathlib import Path
import hashlib, html, json, re, difflib
R=Path(__file__).resolve().parent.parent
A=R/'audits/economia-20261028'
# Preserve the exact pre-edit version of the one-line transport timeout change too.
backup=A/'frontend/gf-mascota.js'
if not backup.exists():
    s=(R/'gf-mascota.js').read_text(encoding='utf8')
    s=s.replace("ruta === '/api/economia/tienda' ? 180000 : 15000", '15000')
    backup.write_text(s,encoding='utf8')
backup=A/'frontend/economia.js'
if not backup.exists():
    s=(R/'economia.js').read_text(encoding='utf8')
    s=s.replace("['servicios', 'Smelting & crafting', '#9085e9'], ['muerte', 'Death payments', '#a68d7c']", "['servicios', 'Smelting & crafting', '#9085e9']")
    backup.write_text(s,encoding='utf8')

def inline(s):
    s=html.escape(s)
    s=re.sub(r'\[([^]]+)\]\((https://[^)]+)\)',r'<a href="\2">\1</a>',s)
    s=re.sub(r'`([^`]+)`',r'<code>\1</code>',s)
    s=re.sub(r'\*\*([^*]+)\*\*',r'<strong>\1</strong>',s)
    return s

body=[]; paragraph=[]; in_list=False
def flush():
    if paragraph:
        body.append('<p>'+inline(' '.join(paragraph))+'</p>');paragraph.clear()
for line in (R/'GUIA-ECONOMIA.md').read_text(encoding='utf8').splitlines():
    if not line.strip():
        flush()
        if in_list: body.append('</ul>');in_list=False
    elif line.startswith('#'):
        flush();level=len(line)-len(line.lstrip('#'));body.append(f'<h{level}>'+inline(line[level:].strip())+f'</h{level}>')
    elif line.startswith('- '):
        flush()
        if not in_list: body.append('<ul>');in_list=True
        body.append('<li>'+inline(line[2:])+'</li>')
    else: paragraph.append(line)
flush()
if in_list:body.append('</ul>')
guide='''<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Guía de economía · Grassland Forest</title><link rel="icon" href="./favicon.png"><style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0c191d;color:#dde9e3;font:16px/1.8 system-ui,Segoe UI,sans-serif}header{padding:24px max(22px,calc((100% - 860px)/2));border-bottom:1px solid #28443c;background:#112821}header a{color:#a9d6c6;text-decoration:none;font-size:13px}main{max-width:900px;margin:auto;padding:35px 24px 90px}h1{font-size:clamp(32px,6vw,50px);line-height:1.15;letter-spacing:-.04em;color:#f1e4b5;margin:0 0 25px}h2{font-size:24px;line-height:1.35;margin:48px 0 18px;padding-top:24px;border-top:1px solid #28443c;color:#a4dfc3}p{margin:0 0 18px}li{margin-bottom:12px}code{font-size:.88em;color:#e3ce93;background:#1a302a;padding:2px 5px;border-radius:5px;overflow-wrap:anywhere}strong{color:#ecf5ef}a{color:#82c5ff}footer{font-size:13px;color:#8fa99e;margin-top:40px}@media print{body{background:white;color:#17241f}h1,h2,strong{color:#17241f}code{color:#17241f;background:#eee}header{display:none}main{max-width:none;padding:0}}
</style></head><body><header><a href="./control-center.html">← Grassland Forest · Centro de control</a></header><main>'''+''.join(body)+'''<footer>Reglas auditables, fondos protegidos y revisión de las excepciones. Evidencia local: audits/economia-20261028/.</footer></main></body></html>'''
(R/'GUIA-ECONOMIA.html').write_text(guide,encoding='utf8')
# Add a direct route from the hub to the supervisor and the operating guide.
p=R/'control-center.html';s=p.read_text(encoding='utf8')
anchor='        <section aria-labelledby="cc-tools-title">'
card='''        <section class="cc-chart-panel" style="margin-bottom:28px" aria-label="Economy operations"><div class="cc-section-title"><div><span class="cc-eyebrow">Economy operations</span><h2>Two treasuries. Protected working capital.</h2></div></div><p class="cc-small">Review automatic treasury policy, reward funding, top-ups and payments awaiting chain reconciliation.</p><div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:16px"><button class="cc-button" type="button" data-open-tool="economia">Open economy supervisor ↗</button><a class="cc-button" href="./GUIA-ECONOMIA.html" target="_blank" rel="noopener">Economy operations guide ↗</a></div></section>
'''
if 'Two treasuries. Protected working capital.' not in s:
    assert anchor in s;s=s.replace(anchor,card+anchor)
p.write_text(s,encoding='utf8')
# Update only URLs for assets changed in this task. Preserve all other versions and manual entries.
changed=['gf-mascota.js','gf-servicios.js','gf-economia.js','gf-graficos.js','gf-precio-panel.js','CraftingHub.js','Scenes/GameScene.js','tienda_sistema.js','styless.css','gf-salvaje.js','economia2.js','economia.js','economia-supervisor.js','control-center.js']
for page in ['index.html','market.html','economia.html','control-center.html','precios.html','tesoro.html']:
    p=R/page;s=p.read_text(encoding='utf8');before=s
    for asset in changed:
        digest=hashlib.sha256((R/asset).read_bytes()).hexdigest()[:12]
        s=re.sub(r'((?:src|href)="(?:\./)?'+re.escape(asset)+r')\?v=[^"\s]+',r'\1?v=20261028.'+digest,s)
    if s!=before:
        target=A/'frontend'/page
        if not target.exists(): target.write_text(before,encoding='utf8')
        p.write_text(s,encoding='utf8')

manifest=[];diff=[]
for before in sorted((A/'frontend').rglob('*')):
    if not before.is_file():continue
    rel=before.relative_to(A/'frontend');after=R/rel
    if after.exists() and before.read_bytes()!=after.read_bytes():
        manifest.append({'file':str(rel),'before_sha256':hashlib.sha256(before.read_bytes()).hexdigest(),'after_sha256':hashlib.sha256(after.read_bytes()).hexdigest()})
        diff.extend(difflib.unified_diff(before.read_text(encoding='utf8').splitlines(True),after.read_text(encoding='utf8').splitlines(True),fromfile='before/'+str(rel),tofile='after/'+str(rel)))
server=Path('C:/Users/pc/Desktop/server2.js')
for rel in ['GUIA-ECONOMIA.md','GUIA-ECONOMIA.html','economia-supervisor.js','market-experience.css']:
    manifest.append({'file':rel,'before_sha256':None,'after_sha256':hashlib.sha256((R/rel).read_bytes()).hexdigest()})
manifest.append({'file':str(server),'before_sha256':hashlib.sha256((A/'server2.before.js').read_bytes()).hexdigest(),'after_sha256':hashlib.sha256(server.read_bytes()).hexdigest()})
(A/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False),encoding='utf8')
(A/'frontend.patch').write_text(''.join(diff),encoding='utf8')
diff=difflib.unified_diff((A/'server2.before.js').read_text(encoding='utf8').splitlines(True),server.read_text(encoding='utf8').splitlines(True),fromfile='before/Desktop/server2.js',tofile='after/Desktop/server2.js')
(A/'server2.patch').write_text(''.join(diff),encoding='utf8')
print('Guide, cache versions and exact before/after manifest generated.')
