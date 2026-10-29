from pathlib import Path
import importlib.util
spec=importlib.util.spec_from_file_location('res_apply','tools/resource-economy-apply.py')
u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u)
s=u.read(u.SERVER)
for name, marker in [('resource-economy','RESOURCE_ECONOMY'),('resource-gather','RESOURCE_GATHER'),('control-security','CONTROL_SECURITY'),('resource-market-custody','RESOURCE_MARKET')]:
 a=s.index('// '+marker+'_START'); b=s.index('// '+marker+'_END',a)+len('// '+marker+'_END')
 s=s[:a]+u.read('tools/'+name+'.fragment.cjs').rstrip()+s[b:]
u.save(u.SERVER,s)
print('Synchronized only the four new owned blocks.')
