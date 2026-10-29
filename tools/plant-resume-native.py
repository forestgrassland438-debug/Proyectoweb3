from pathlib import Path
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('plantutils',str(Path('tools/plant-expansion-utils.py').resolve())).load_module();p='C:/Users/pc/Desktop/server2.js'
s=Path('tools/plant-mount-native.py').read_text(encoding='utf8');exec(s[s.index("u.change(p,'        ...crop.toObject()"):])
