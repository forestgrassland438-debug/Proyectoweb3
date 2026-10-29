import importlib.util
spec=importlib.util.spec_from_file_location('res_apply','tools/resource-economy-apply.py');u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u)
s=u.read(u.SERVER)
a=s.rfind('// =============================================================================',0,s.index('// tabla no está dada de alta'))
b=s.index('let _tiposItemPermitidos',a)
assert a>=0
s=s[:a]+'''// =============================================================================
// ITEM TABLE CAPACITY: owner-configured limits are checked before minting.
// Missing or full tables reject issuance; gameplay never increases their caps.
// =============================================================================
'''+s[b:]
a=s.index('// LIQUIDACIÓN ON-CHAIN DEL MERCADO P2P')
b=s.index('const marketSettlementSchema',a)
s=s[:a]+'''// Historic P2P burn/remint ledger retained for audit and reconciliation.
// New listings use native transfer custody in RESOURCE_MARKET above.

'''+s[b:]
anchor="      await ecoTransaccion(async session => {\n        const st = await PlayerStats.findOne({ playerName: gp.playerName }).session(session).lean();"
assert s.count(anchor)==1
s=s.replace(anchor,"      const resourceBatch = op === 'compra' ? await resourcePurchaseBatch(b.itemId,q) : null;\n"+anchor)
s=s.replace('const batch = Math.min(stack, q - confirmed);','const batch = Math.min(stack, resourceBatch || stack, q - confirmed);')
u.save(u.SERVER,s)
p='tools/economia2.test.cjs';s=u.read(p);anchor='    resourceSnapshot: async () => ({rows: op.resourceRows || []}),';assert s.count(anchor)==1;s=s.replace(anchor,anchor+'\n    resourcePurchaseBatch: async () => null,');u.save(p,s)
print('Capacity preflight now precedes new NPC resource charges; historical ledgers retained.')
