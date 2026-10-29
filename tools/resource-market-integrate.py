from pathlib import Path
import importlib.util
spec=importlib.util.spec_from_file_location('res_apply','tools/resource-economy-apply.py');u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u)

def edit_module(s):
 s=u.once(s,'return { transaction, model, handler };','return { transaction, model, handler, session: () => scope.getStore() };')
 s=u.once(s,'    itemId:           String,','    listingId:        { type: String, index: true },\n    itemId:           String,')
 s=u.once(s,"      // Se anota la PUBLICACIÓN en el historial.","      // Se anota la PUBLICACIÓN en el historial.") if False else s
 i=s.index('      // Se anota la PUBLICACIÓN en el historial.')
 s=s[:i]+'''      if (ctx.assetTransfer) await ctx.assetTransfer.prepareListing({ listing, owner:address, itemId, qty,
        slot:(gp[srcField] || []).find(slot=>slot.id===slotId && slot.objeto===itemId) }, atomic.session());

'''+s[i:]
 # Refunded/cancelled listings carry their own immutable delivery entitlement.
 start=s.index("  app.post('/api/marketplace/cancel/:id'")
 i=s.index('      const listing = await Listing.findById(id).exec();',start)
 s=s[:i]+'''      if (ctx.assetTransfer) {
        const previous=await ctx.assetTransfer.replay({ listingId:id,wallet:address,op:'refund',ref:'cancel' },atomic.session());
        if(previous)return res.json({...previous,inventory:serializeInventory(await getGamePlayerByAddress(address))});
      }
'''+s[i:]
 i=s.index('      await Listing.deleteOne({ _id: listing._id }).exec();',start)
 s=s[:i]+'''      const receiptId=ctx.assetTransfer ? await ctx.assetTransfer.claim({listing,wallet:address,qty:listing.qty,op:'refund',ref:'cancel'},atomic.session()) : null;
'''+s[i:]
 end=s.index("  // ── POST /api/marketplace/buy/:id",start)
 chunk=s[start:end].replace('return res.json({ success: true, inventory: serializeInventory(fresh) });','return res.json({ success: true, receiptId, inventory: serializeInventory(fresh) });')
 s=s[:start]+chunk+s[end:]
 # New purchases use a stable request reference, even after a lost response.
 start=s.index("  app.post('/api/marketplace/buy/:id'")
 i=s.index('      const listing = await Listing.findById(id).exec();',start)
 s=s[:i]+'''      const buyRef=String(req.body?.ref || '');
      if(ctx.assetTransfer){
        if(!/^[A-Za-z0-9_-]{8,64}$/.test(buyRef))return res.status(400).json({error:'market_reference_required'});
        const previous=await ctx.assetTransfer.replay({listingId:id,wallet:address,op:'deliver',ref:buyRef},atomic.session());
        if(previous)return res.json({...previous,inventory:serializeInventory(await getGamePlayerByAddress(address))});
      }
'''+s[i:]
 i=s.index('      let qty = req.body',start)
 s=s[:i]+'''      if(ctx.assetTransfer && !await ctx.assetTransfer.ready(listing,atomic.session()))return res.status(409).json({error:'market_escrow_pending',message:'El depósito del vendedor aún no está confirmado en el contrato.'});
'''+s[i:]
 i=s.index('      // 5) Entregar el ítem al comprador',start)
 s=s[:i]+'''      const receiptId=ctx.assetTransfer ? await ctx.assetTransfer.claim({listing,wallet:address,qty,op:'deliver',ref:buyRef},atomic.session()) : null;
'''+s[i:]
 end=s.index('  // ── GET /api/marketplace/history',start)
 chunk=s[start:end].replace('        paid: totalPrice,','        paid: totalPrice,\n        receiptId,')
 # Both buy/sell history rows retain the original listing ID.
 chunk=chunk.replace('            itemId: listing.itemId,','            listingId: String(listing._id),\n            itemId: listing.itemId,')
 s=s[:start]+chunk+s[end:]
 # An accepted offer creates an entitlement for the actual buyer, not for
 # the seller who happened to call the accept endpoint.
 start=s.index("  app.post('/api/marketplace/offer/:id/accept'")
 i=s.index('      const meta = catalogMeta(offer.itemId);',start)
 s=s[:i]+'''      if(ctx.assetTransfer && !await ctx.assetTransfer.ready(listing,atomic.session()))return res.status(409).json({error:'market_escrow_pending'});
'''+s[i:]
 i=s.index('      await applyInsertPlan(offer.buyer, offer.itemId, plan);',start)
 s=s[:i]+'''      const receiptId=ctx.assetTransfer ? await ctx.assetTransfer.claim({listing,wallet:offer.buyer,qty:offer.qty,op:'deliver',ref:'offer_'+String(offer._id)},atomic.session()) : null;
'''+s[i:]
 end=s.index('  // ── POST /api/marketplace/offer/:id/reject',start)
 chunk=s[start:end].replace('success: true, received: sellerReceives, fee,','success: true, received: sellerReceives, fee, receiptId,')
 chunk=chunk.replace('            itemId: offer.itemId,','            listingId: String(listing._id), itemId: offer.itemId,')
 s=s[:start]+chunk+s[end:]
 # No money is retained for an offer on an unconfirmed listing.
 start=s.index("  app.post('/api/marketplace/offer/:listingId'")
 i=s.index("      if (!listing) return res.status(404).json",start)
 i=s.index('\n',i)+1
 s=s[:i]+"      if(ctx.assetTransfer && !await ctx.assetTransfer.ready(listing,atomic.session()))return res.status(409).json({error:'market_escrow_pending'});\n"+s[i:]
 old='      return res.json({ listings: listings.map(l => serializeListing(l, address)) });'
 assert s.count(old)==2
 s=s.replace(old,'      const serialized=listings.map(l=>serializeListing(l,address));\n      return res.json({listings:ctx.assetTransfer ? await ctx.assetTransfer.describe(serialized) : serialized});',1)
 # Current listings are annotated so the owner can resume the escrow transfer.
 start=s.index("  app.get('/api/marketplace/my-listings'")
 i=s.index('      return res.json({ listings: listings.map(l => serializeListing(l, address)) });',start)
 old='      return res.json({ listings: listings.map(l => serializeListing(l, address)) });'
 s=s[:i]+s[i:].replace(old,'      const serialized=listings.map(l=>serializeListing(l,address));\n      return res.json({listings:ctx.assetTransfer ? await ctx.assetTransfer.describe(serialized) : serialized});',1)
 for label in ['list','buy/:id','cancel/:id','offer/accept']:
  marker="      console.error('❌ POST /api/marketplace/"+label+":', err);"
  if marker in s:s=u.once(s,marker,"      if(err.status===409 && err.code)return res.status(409).json({error:err.code});\n"+marker)
 return s

for p in [Path('marketplace-routes.js'),Path('C:/Users/pc/Desktop/marketplace-routes.js')]:u.save(p,edit_module(u.read(p)))
s=u.read(u.SERVER)
s=u.once(s,'  auditarMercado: gfAuditarMercado,','  auditarMercado: gfAuditarMercado,\n  assetTransfer: resourceMarketAdapter,')
# The old generic burn/remint route is removed, not left as an alternate path.
a=s.index("// POST /api/marketplace/onchain/settle\n");b=s.index("console.log('✅ Liquidación on-chain del mercado:",a);b=s.index('\n',b)+1
s=s[:a]+"// P2P custody and settlement routes are registered in RESOURCE_MARKET.\n"+s[b:]
i=s.index('// RESOURCE_ECONOMY_START')
s=s[:i]+u.read('tools/resource-market-custody.fragment.cjs')+'\n\n'+s[i:]
u.save(u.SERVER,s)
print('Native market custody and delivery entitlements integrated into both identical market modules.')
