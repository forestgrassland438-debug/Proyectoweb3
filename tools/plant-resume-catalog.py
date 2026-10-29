from pathlib import Path
import re,shutil
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('plantutils',str(Path('tools/plant-expansion-utils.py').resolve())).load_module()
s=Path('tools/plant-integrate-catalog.py').read_text(encoding='utf8');exec(s[s.index('for file in'):])
