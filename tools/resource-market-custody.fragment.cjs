// RESOURCE_MARKET_START — existing items move; normal P2P never mints or burns.
const marketAssetEscrowSchema = new mongoose.Schema({
  _id: String, owner: String, itemId: String, qty: Number, sourceInvoiceId: Number, sourceManualId: String,
  status: { type: String, default: 'awaiting_escrow' }, escrowInvoiceId: Number, escrowManualId: String,
  leaseToken: String, leaseUntil: Date, createdAt: { type: Date, default: Date.now }
}, { collection: 'market_asset_escrows', versionKey: false });
const MarketAssetEscrow = mongoose.models.MarketAssetEscrow || mongoose.model('MarketAssetEscrow', marketAssetEscrowSchema);
const marketAssetClaimSchema = new mongoose.Schema({
  _id: String, listingId: { type: String, index: true }, wallet: { type: String, index: true }, itemId: String,
  qty: Number, op: String, sourceInvoiceId: Number, sourceManualId: String, destinationManualId: String,
  status: { type: String, default: 'pending', index: true }, txHash: String, nonce: Number,
  rawTx: { type: String, select: false },
  invoiceId: Number, manualId: String, error: String, createdAt: { type: Date, default: Date.now }, updatedAt: Date
}, { collection: 'market_asset_claims', versionKey: false });
marketAssetClaimSchema.index({ wallet: 1, status: 1, createdAt: -1 });
const MarketAssetClaim = mongoose.models.MarketAssetClaim || mongoose.model('MarketAssetClaim', marketAssetClaimSchema);
const MARKET_TRANSFER_ABI = [
  'function getInvoice(uint256) view returns(tuple(uint256 id,string manualId,address owner,string tipo,uint256 cantidad,bool active,uint256 createdAt))',
  'function getInvoiceByManualId(string) view returns(tuple(uint256 id,string manualId,address owner,string tipo,uint256 cantidad,bool active,uint256 createdAt))',
  'function transferInvoice(address,address,uint256,uint256,string) returns(uint256)',
  'event InvoiceTransferred(uint256 indexed originalId,uint256 newId,address indexed from,address indexed to,uint256 amount)'
];
function marketTransferKey(op, listingId, wallet, ref) { return 'mt_' + crypto.createHash('sha256').update([op,listingId,wallet,ref].join(':')).digest('hex'); }
function marketTransferError(code) { return Object.assign(new Error(code), { code, status: 409 }); }
function marketRequireSession(session) { if (!session) throw new Error('market_asset_session_required'); }
const resourceMarketAdapter = {
  async prepareListing({ listing, owner, itemId, qty, slot }, session) {
    marketRequireSession(session); if (!itemTipoOnChain(itemId)) return;
    if (!slot || !Number.isSafeInteger(Number(slot.IDX)) || Number(slot.IDX) < 1 || !slot.Manualid) throw marketTransferError('canonical_invoice_required');
    await MarketAssetEscrow.create([{ _id: String(listing._id), owner, itemId, qty,
      sourceInvoiceId: Number(slot.IDX), sourceManualId: String(slot.Manualid), status: 'awaiting_escrow' }], { session });
  },
  async ready(listing, session) {
    marketRequireSession(session); if (!itemTipoOnChain(listing.itemId)) return true;
    const escrow = await MarketAssetEscrow.findById(String(listing._id)).session(session).lean();
    return !!(escrow && escrow.status === 'held' && escrow.itemId === listing.itemId && escrow.owner === listing.owner);
  },
  async claim({ listing, wallet, qty, op, ref }, session) {
    marketRequireSession(session); if (!itemTipoOnChain(listing.itemId)) return null;
    const escrow = await MarketAssetEscrow.findById(String(listing._id)).session(session).lean();
    if (!escrow) throw marketTransferError('legacy_listing_requires_review');
    if (op === 'refund' && escrow.status === 'awaiting_escrow') {
      const updated=await MarketAssetEscrow.updateOne({ _id: escrow._id, status: 'awaiting_escrow' }, { $set: { status:'cancelled' } }, { session });
      if(updated.matchedCount!==1)throw marketTransferError('market_escrow_changed');
      return null;
    }
    if (escrow.status !== 'held') throw marketTransferError('market_escrow_pending');
    const id = marketTransferKey(op, String(listing._id), wallet, ref);
    await MarketAssetClaim.create([{ _id:id, listingId:String(listing._id), wallet, itemId:listing.itemId, qty, op,
      sourceInvoiceId:escrow.escrowInvoiceId, sourceManualId:escrow.escrowManualId,
      destinationManualId:'mt:' + id.slice(3,43), createdAt:new Date() }], { session });
    return id;
  },
  async replay({ listingId, wallet, ref, op }, session) {
    marketRequireSession(session);
    const id = marketTransferKey(op, String(listingId), wallet, ref);
    const claim = await MarketAssetClaim.findById(id).session(session).lean();
    if (!claim) return null;
    const gp = await GamePlayer.findOne({ address:wallet }).session(session).lean();
    const stats = gp && await PlayerStats.findOne({ playerName:gp.playerName }).session(session).lean();
    return { success:true, alreadyProcessed:true, receiptId:id, oro:stats?.oro, plata:stats?.plata,
      inventory:gp ? [...(gp.inventory || []).map(s=>({...s, source:'inventory'})),...(gp.chest || []).map(s=>({...s,source:'chest'}))] : [] };
  },
  async describe(listings) {
    const docs = await MarketAssetEscrow.find({ _id: { $in:listings.map(l=>String(l.id)) } }).select('_id status').lean();
    const byId = new Map(docs.map(d=>[d._id,d.status]));
    return listings.map(l=>({ ...l, chainReady: !itemTipoOnChain(l.itemId) || byId.get(String(l.id)) === 'held',
      chainStatus:byId.get(String(l.id)) || 'legacy_review' }));
  }
};
async function executeMarketAssetClaim(id) {
  let claim = await MarketAssetClaim.findById(id).select('+rawTx').lean();
  if (!claim) throw marketTransferError('market_receipt_not_found');
  if (claim.status === 'confirmed' || claim.status === 'failed') return claim;
  if (!relayerWallet) throw marketTransferError('relayer_unavailable');
  const token = crypto.randomUUID(), now = new Date();
  const escrow = await MarketAssetEscrow.findOneAndUpdate({ _id:claim.listingId,
    $or:[{leaseUntil:{$lte:now}},{leaseUntil:null}] }, { $set:{leaseToken:token,leaseUntil:new Date(Date.now()+180000)} }, {new:true}).lean();
  if (!escrow) return claim;
  try {
    claim = await MarketAssetClaim.findById(id).select('+rawTx').lean();
    if (claim.status === 'confirmed') return claim;
    const c = new ethers.Contract(CONTRACTS.ITEMS_CONTRACT.address, MARKET_TRANSFER_ABI, relayerWallet);
    const from = claim.op === 'escrow' ? escrow.owner : relayerWallet.address.toLowerCase();
    const to = claim.op === 'escrow' ? relayerWallet.address.toLowerCase() : claim.wallet;
    let receipt = null, destination = null;
    if (claim.txHash) {
      receipt = await relayerWallet.provider.getTransactionReceipt(claim.txHash);
      if (!receipt && claim.rawTx) {
        const signed=ethers.Transaction.from(claim.rawTx);
        const expected=c.interface.encodeFunctionData('transferInvoice',[from,to,claim.sourceInvoiceId,claim.qty,claim.destinationManualId]);
        if(signed.hash!==claim.txHash || signed.from.toLowerCase()!==relayerWallet.address.toLowerCase() ||
            signed.to.toLowerCase()!==String(CONTRACTS.ITEMS_CONTRACT.address).toLowerCase() || signed.data!==expected || signed.value!==0n)throw marketTransferError('market_signed_intent_mismatch');
        try{await relayerWallet.provider.broadcastTransaction(claim.rawTx);}catch(_){}
        receipt=await relayerWallet.provider.waitForTransaction(claim.txHash,1,120000);
      }
      if (!receipt) return claim;
      if (Number(receipt.status) !== 1) {
        await MarketAssetClaim.updateOne({_id:id},{$set:{status:'failed',error:'confirmed_chain_revert',updatedAt:new Date()}});
        return { ...claim,status:'failed',error:'confirmed_chain_revert' };
      }
    } else if (claim.status === 'processing' || claim.status === 'review') {
      // No tx hash after a process/network interruption: do not guess that it
      // failed. A human can reconcile the ledger and contract events.
      return claim;
    } else {
      if (claim.op !== 'escrow' && escrow.status !== 'held') throw marketTransferError('market_escrow_pending');
      if (claim.op === 'escrow' && escrow.status !== 'awaiting_escrow' && escrow.status !== 'processing') throw marketTransferError('market_escrow_changed');
      const inv = await c.getInvoice(claim.sourceInvoiceId);
      if (!inv.active || String(inv.owner).toLowerCase() !== from || String(inv.tipo) !== itemTipoOnChain(claim.itemId) ||
          String(inv.manualId) !== claim.sourceManualId || BigInt(inv.cantidad) < BigInt(claim.qty)) throw marketTransferError('market_source_invoice_changed');
      const unsigned=await c.transferInvoice.populateTransaction(from,to,claim.sourceInvoiceId,claim.qty,claim.destinationManualId);
      unsigned.gasPrice=gatherGasPrice();
      unsigned.gasLimit=(await relayerWallet.provider.estimateGas({...unsigned,from:relayerWallet.address}))*120n/100n;
      unsigned.chainId=(await relayerWallet.provider.getNetwork()).chainId;
      await ecoTransaccion(async session=>{
        const updated=await MarketAssetClaim.updateOne({_id:id,status:'pending'},{$set:{status:'processing',updatedAt:new Date()}},{session});
        if(updated.matchedCount!==1)throw marketTransferError('market_claim_changed');
        if(claim.op==='escrow'){
          const locked=await MarketAssetEscrow.updateOne({_id:escrow._id,leaseToken:token,status:'awaiting_escrow'},{$set:{status:'processing'}},{session});
          if(locked.matchedCount!==1)throw marketTransferError('market_escrow_changed');
        }
      });
      const nonce = await relayerNonceManager.getNextNonce();
      const rawTx=await relayerWallet.signTransaction({...unsigned,nonce});
      const txHash=ethers.keccak256(rawTx);
      await MarketAssetClaim.updateOne({_id:id},{$set:{nonce,txHash,rawTx,updatedAt:new Date()}});
      const tx = await relayerWallet.provider.broadcastTransaction(rawTx);
      receipt = await tx.wait(1,120000);
    }
    for (const log of receipt.logs || []) {
      if (String(log.address).toLowerCase() !== String(CONTRACTS.ITEMS_CONTRACT.address).toLowerCase()) continue;
      try {
        const parsed=c.interface.parseLog(log);
        if (parsed?.name==='InvoiceTransferred' && Number(parsed.args.originalId)===claim.sourceInvoiceId &&
            String(parsed.args.to).toLowerCase()===to && BigInt(parsed.args.amount)===BigInt(claim.qty)) destination=Number(parsed.args.newId);
      } catch (_) {}
    }
    if (!Number.isSafeInteger(destination) || destination<1) throw marketTransferError('market_transfer_receipt_needs_review');
    // Persist the escrow receipt before exposing the listing to buyers.
    if (claim.op==='escrow') await MarketAssetEscrow.updateOne({_id:escrow._id,leaseToken:token},{$set:{status:'held',escrowInvoiceId:destination,escrowManualId:claim.destinationManualId}});
    await MarketAssetClaim.updateOne({_id:id},{$set:{status:'confirmed',invoiceId:destination,manualId:claim.destinationManualId,
      txHash:receipt.hash || receipt.transactionHash || claim.txHash,updatedAt:new Date(),error:''}});
    try { await enColaDelJugador('inventory:'+claim.wallet,()=>resourcePersistInventory(claim.wallet)); } catch (_) {}
    return await MarketAssetClaim.findById(id).lean();
  } catch (e) {
    await MarketAssetClaim.updateOne({_id:id,status:{$ne:'confirmed'}},{$set:{status:'review',error:String(e.code || e.message).slice(0,250),updatedAt:new Date()}}).catch(()=>{});
    return await MarketAssetClaim.findById(id).lean();
  } finally {
    await MarketAssetEscrow.updateOne({_id:escrow._id,leaseToken:token},{$set:{leaseUntil:new Date(0)},$unset:{leaseToken:1}}).catch(()=>{});
  }
}
app.post('/api/marketplace/onchain/settle', strictLimiter, authMiddleware, csrfProtection, async (req,res)=>{
  try {
    const wallet=String(req.user.address || '').toLowerCase(), {op,listingId,receiptId}=req.body || {};
    if (!['escrow','deliver','refund'].includes(op) || typeof listingId!=='string' || !mongoose.Types.ObjectId.isValid(listingId)) return res.status(400).json({error:'invalid_settlement'});
    let id=receiptId;
    if (op==='escrow') {
      const deposit=await MarketAssetEscrow.findById(listingId).lean();
      if (!deposit) return res.status(409).json({error:'legacy_listing_requires_review'});
      if (deposit.owner!==wallet) return res.status(403).json({error:'not_listing_owner'});
      id=marketTransferKey('escrow',listingId,wallet,'deposit');
      if (!await MarketAssetClaim.exists({_id:id})) {
        if (deposit.status!=='awaiting_escrow') return res.status(409).json({error:'market_escrow_changed'});
        try { await MarketAssetClaim.create({_id:id,listingId,wallet,itemId:deposit.itemId,qty:deposit.qty,op:'escrow',
          sourceInvoiceId:deposit.sourceInvoiceId,sourceManualId:deposit.sourceManualId,destinationManualId:'me:'+listingId,createdAt:new Date()}); }
        catch(e){if(e.code!==11000)throw e;}
      }
    }
    if (typeof id!=='string' || !/^mt_[a-f0-9]{64}$/.test(id)) return res.status(409).json({error:'market_receipt_required'});
    const claim=await MarketAssetClaim.findById(id).lean();
    if (!claim || claim.wallet!==wallet || claim.op!==op || claim.listingId!==listingId) return res.status(403).json({error:'not_settlement_owner'});
    const done=await executeMarketAssetClaim(id);
    res.set('Cache-Control','no-store');
    return res.status(done.status==='confirmed'?200:202).json({ok:done.status==='confirmed',onchain:true,receiptId:id,status:done.status,
      txHash:done.txHash || null,invoiceId:done.invoiceId,manualId:done.manualId,error:done.status==='confirmed'?undefined:'market_transfer_pending'});
  } catch(e){return res.status(503).json({error:e.code || 'market_transfer_unavailable'});}
});
app.get('/api/marketplace/onchain/pending',apiLimiter,authMiddleware,async(req,res)=>{
  try {
    const wallet=String(req.user.address || '').toLowerCase();
    const rows=await MarketAssetClaim.find({wallet,status:{$ne:'confirmed'}}).select('_id listingId itemId qty op status txHash error createdAt').sort({createdAt:1}).limit(30).lean();
    res.set('Cache-Control','no-store');return res.json({ok:true,rows:rows.map(r=>({...r,receiptId:r._id}))});
  }catch(_){return res.status(503).json({error:'market_pending_unavailable'});}
});
app.get('/api/marketplace/onchain/:listingId',apiLimiter,authMiddleware,async(req,res)=>{
  try {
    const deposit=await MarketAssetEscrow.findById(String(req.params.listingId)).lean();
    if(!deposit)return res.status(409).json({error:'legacy_listing_requires_review'});
    return res.json({ok:true,protocol:'transfer',status:deposit.status,itemId:deposit.itemId,qty:deposit.qty});
  }catch(_){return res.status(503).json({error:'market_transfer_unavailable'});}
});
app.get('/api/admin/recursos/entregas',adminAuth,apiLimiter,async(req,res)=>{
  try {
    const after=String(req.query.after || ''),filter={status:{$ne:'confirmed'}};
    if(after && !/^mt_[a-f0-9]{64}$/.test(after))return res.status(400).json({error:'invalid_cursor'});
    if(after)filter._id={$gt:after};
    const rows=await MarketAssetClaim.find(filter).select('_id listingId wallet itemId qty op status txHash error createdAt').sort({_id:1}).limit(51).maxTimeMS(5000).lean();
    const hasMore=rows.length>50;if(hasMore)rows.pop();
    // Historic burn/remint records have no provable native escrow. Show a sample,
    // never manufacture a transfer entitlement from the old request payload.
    const legacy=await Listing.aggregate([{$set:{listingKey:{$toString:'$_id'}}},{$lookup:{from:MarketAssetEscrow.collection.name,localField:'listingKey',foreignField:'_id',as:'escrow'}},
      {$match:{'escrow.0':{$exists:false}}},{$sort:{_id:1}},{$limit:20},{$project:{_id:1,owner:1,itemId:1,qty:1}}]).option({maxTimeMS:5000});
    res.set('Cache-Control','no-store');return res.json({ok:true,rows,hasMore,next:hasMore?rows.at(-1)._id:null,legacy});
  }catch(_){return res.status(503).json({error:'market_review_unavailable'});}
});
app.post('/api/admin/recursos/entregas/revisar',adminAuth,strictLimiter,csrfProtection,async(req,res)=>{
  try {
    const id=String(req.body.receiptId || '');if(!/^mt_[a-f0-9]{64}$/.test(id))return res.status(400).json({error:'invalid_receipt'});
    const claim=await MarketAssetClaim.findById(id).lean();
    if(!claim)return res.status(404).json({error:'receipt_not_found'});
    if(!['pending','confirmed'].includes(claim.status) && !claim.txHash)return res.status(409).json({error:'manual_review_required',message:'No hay un hash verificable. No se repite la transferencia ni se devuelve dinero sin revisar la cadena.'});
    const result=await executeMarketAssetClaim(id);
    res.set('Cache-Control','no-store');return res.json({ok:true,status:result.status,txHash:result.txHash || null});
  }catch(_){return res.status(503).json({error:'market_review_unavailable'});}
});
let _marketTransferSweepBusy=false;
async function resourceMarketSweep(){
  if(_marketTransferSweepBusy || !relayerWallet || mongoose.connection.readyState!==1)return;
  _marketTransferSweepBusy=true;
  try{
    const rows=await MarketAssetClaim.find({$or:[{status:'pending'},{status:{$in:['processing','review']},txHash:{$type:'string',$ne:''}}]}).sort({createdAt:1}).limit(10).select('_id').lean();
    for(const row of rows)await executeMarketAssetClaim(row._id);
  }catch(e){console.warn('market transfer sweep:',e.code || e.message);}
  finally{_marketTransferSweepBusy=false;}
}
setTimeout(()=>resourceMarketSweep(),40000).unref?.();
setInterval(()=>resourceMarketSweep(),60000).unref?.();
// RESOURCE_MARKET_END
