export function createMetaMaskAdapter(createEVMClient, host) {
  let clientPromise;
  let remoteProvider;
  let announcedProvider;
  let listening = false;
  function announcement(event) {
    const info = event?.detail;
    if (info?.info?.rdns === 'io.metamask' && info.provider?.request) announcedProvider = info.provider;
  }
  function discover() {
    if (!host.addEventListener || !host.dispatchEvent) return;
    if (!listening) { host.addEventListener('eip6963:announceProvider', announcement); listening = true; }
    host.dispatchEvent(new Event('eip6963:requestProvider'));
  }
  function injected() {
    if (announcedProvider) return announcedProvider;
    const eth = host.ethereum;
    if (eth?.isMetaMask && !eth.isGFWallet && !eth.isBraveWallet) return eth;
    return eth?.providers?.find(p => p.isMetaMask && !p.isGFWallet && !p.isBraveWallet) || null;
  }
  /* (2026-11-12) El RPC de las lecturas del móvil iba escrito a mano (Caldera, que ya contesta
     404). Ahora es el de la red en marcha: GFRed en el juego, GF_RED_ACTUAL en el login (los dos
     la piden a /api/red) y, si no hay ninguno, el de Zeeve. */
  function redes() {
    let r = null;
    try { r = host.GFRed && typeof host.GFRed.actual === 'function' ? host.GFRed.actual() : host.GF_RED_ACTUAL; } catch (_) {}
    const id = r && /^0x[0-9a-f]+$/i.test(String(r.chainIdHex || '')) ? String(r.chainIdHex).toLowerCase() : '0x1159';
    const rpc = r && Array.isArray(r.rpcUrls) ? r.rpcUrls.find(u => /^https:\/\//i.test(String(u))) : null;
    return { [id]: rpc || 'https://rpc.testnet.liteforge.zeeve.net/' };
  }
  function client() {
    if (!clientPromise) {
      clientPromise = Promise.resolve().then(() => createEVMClient({
        dapp: { name: 'Grassland Forest', url: host.location.origin },
        analytics: { enabled: false },
        api: { supportedNetworks: redes() }
      })).then(c => { remoteProvider = c.getProvider(); return c; }).catch(e => { clientPromise = undefined; throw e; });
    }
    return clientPromise;
  }
  return {
    getProvider: () => injected() || remoteProvider || null,
    async connect() {
      discover();
      const local = injected();
      if (local) { await local.request({ method: 'eth_requestAccounts' }); return local; }
      const c = await client();
      await c.connect();
      return remoteProvider;
    },
    async prepare() {
      discover();
      const local = injected();
      if (local) return local;
      await client();
      return remoteProvider;
    },
    async disconnect() {
      try { if (clientPromise) { const c = await clientPromise; await c.disconnect(); } }
      finally {
        remoteProvider = undefined; clientPromise = undefined; announcedProvider = undefined;
        if (listening) host.removeEventListener('eip6963:announceProvider', announcement);
        listening = false;
      }
    }
  };
}
