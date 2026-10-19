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
  function client() {
    if (!clientPromise) {
      clientPromise = Promise.resolve().then(() => createEVMClient({
        dapp: { name: 'Grassland Forest', url: host.location.origin },
        analytics: { enabled: false },
        api: { supportedNetworks: { '0x1159': 'https://liteforge.rpc.caldera.xyz/http' } }
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
