from pathlib import Path
from importlib.machinery import SourceFileLoader
u=SourceFileLoader('plantutils',str(Path('tools/plant-expansion-utils.py').resolve())).load_module();p='C:/Users/pc/Desktop/server2.js'
u.change(p,'  stats._gatherLastByPlayer = purgarMapaDeTiempos(_gatherLastByPlayer, ahora, PURGA_EDAD_MS);','  // Gather cooldowns belong to the durable gather records; the former\n  // process-local _gatherLastByPlayer map no longer exists.')
u.change(p,'`| vivos: siembra=${plantSpamTracker.size} recolecta=${_gatherLastByPlayer.size} ` +','`| vivos: siembra=${plantSpamTracker.size} ` +')
print('Removed both stale references from the real maintenance timer')
