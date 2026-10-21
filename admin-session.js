/* Shared administration transport. Credentials stay in server HttpOnly cookies. */
(function (root) {
  'use strict';
  if (root.GFAdminSession) return;
  try {
    if (root.parent !== root && root.parent.location.origin === location.origin && root.parent.GFAdminSession) {
      const parent = root.parent.GFAdminSession, owned = new Set();
      root.GFAdminSession = Object.freeze({ ...parent, shared:true,
        async request(path, options = {}) {
          const controller = new AbortController(), signal = options.signal;
          const cancel = () => controller.abort();
          if (signal?.aborted) controller.abort();
          signal?.addEventListener('abort',cancel,{once:true}); owned.add(controller);
          try { return await parent.request(path,{...options,signal:controller.signal}); }
          finally { owned.delete(controller); signal?.removeEventListener('abort',cancel); }
        },
        dispose() { owned.forEach(controller=>controller.abort()); owned.clear(); }
      });
      if (!root.ethereum && root.parent.ethereum) root.ethereum = root.parent.ethereum;
      root.addEventListener('pagehide',e => { if (!e.persisted) root.GFAdminSession.dispose(); });
      return;
    }
  } catch (_) { /* A direct page never trusts a cross-origin parent. */ }
  const base = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
    ? 'http://127.0.0.1:8080' : 'https://api.grasslandforest.com';
  let csrf = '', observedCookie = '', epoch = 0, version = 0, renewal = null, csrfWork = null;
  let loginWork = null, closing = false, destroyed = false, verifiedAddress = '', lastRefresh = null, lastRefreshAt = 0;
  const pending = new Set();
  const listeners = new Set();
  function cookie() {
    try { return decodeURIComponent((document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/) || [])[1] || ''); }
    catch (_) { return ''; }
  }
  function token() {
    const value = cookie();
    if (value && value !== observedCookie) { observedCookie = value; csrf = value; }
    return csrf || value;
  }
  function remember(data) { if (data && data.csrfToken) { observedCookie = cookie(); csrf = data.csrfToken; } }
  function abortError() { return new DOMException('Administration request cancelled', 'AbortError'); }
  function invalidate(reason) {
    const previous = { wasVerified: !!verifiedAddress, address: verifiedAddress };
    verifiedAddress = '';
    lastRefresh = null; lastRefreshAt = 0;
    epoch++; csrf = ''; observedCookie = ''; version++;
    pending.forEach(c => c.abort()); pending.clear();
    listeners.forEach(fn => { try { fn(reason || 'session_changed',previous); } catch (_) {} });
  }
  function error(response, data) {
    const e = new Error(data.message || data.error || ('HTTP ' + response.status));
    e.status = response.status; e.code = data.error;
    const retry = response.headers.get('Retry-After');
    e.retryAfterMs = Math.max(1000, Math.min(120000, Number(retry || data.retryAfterSeconds || 30) * 1000));
    return e;
  }
  async function raw(path, options = {}) {
    if (destroyed) throw abortError();
    if (typeof path !== 'string' || !path.startsWith('/api/') || path.startsWith('//')) throw new Error('Invalid API path');
    const controller = new AbortController(), signal = options.signal, expected = epoch;
    const cancel = () => controller.abort();
    if (signal?.aborted) throw abortError();
    signal?.addEventListener('abort', cancel, { once: true });
    pending.add(controller);
    const timer = setTimeout(cancel, 20000);
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (options.body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    // Ignore stale headers retained in a page after another tab rotated the cookie.
    headers.delete('X-CSRF-Token');
    if (token()) headers.set('X-CSRF-Token', token());
    try {
      const response = await fetch(base + path, { ...options, headers, credentials: 'include', mode: 'cors', cache: 'no-store', signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (expected !== epoch || controller.signal.aborted) throw abortError();
      if (!response.ok) throw error(response, data);
      if (path === '/api/admin/whoami' && /^0x[0-9a-f]{40}$/i.test(data.address || '')) verifiedAddress = data.address.toLowerCase();
      remember(data);
      return data;
    } finally {
      clearTimeout(timer); pending.delete(controller); signal?.removeEventListener('abort', cancel);
    }
  }
  async function getCsrf() {
    if (!csrfWork) csrfWork = raw('/api/auth/csrf-token').then(data => {
      if (!data.csrfToken) throw new Error('The backend did not return a CSRF token');
      remember(data); return csrf;
    }).finally(() => { csrfWork = null; });
    return csrfWork;
  }
  async function refresh() {
    if (closing) throw abortError();
    if (lastRefresh && Date.now()-lastRefreshAt < 2000) return lastRefresh;
    if (!renewal) renewal = raw('/api/auth/refresh', { method: 'POST', body: '{}' })
      .then(data => { remember(data); version++; lastRefresh = data; lastRefreshAt = Date.now(); return data; })
      .finally(() => { renewal = null; });
    return renewal;
  }
  async function request(path, options = {}) {
    const expected = epoch, generation = version;
    const protectedPath = /^\/api\/(admin\/|access(?:\?|$))/.test(path);
    const write = !/^(GET|HEAD|OPTIONS)$/.test(options.method || 'GET');
    if (protectedPath && renewal) await renewal;
    if (write && !token() && !/\/auth\/(refresh|logout)/.test(path)) await getCsrf();
    let refreshed = false, repaired = false;
    for (;;) {
      if (expected !== epoch || options.signal?.aborted) throw abortError();
      try { return await raw(path, options); }
      catch (e) {
        if (expected !== epoch) throw abortError();
        if (protectedPath && e.status === 401 && !refreshed && !closing) {
          refreshed = true;
          if (generation === version) {
            try { await refresh(); }
            catch (failure) { if ([401,403].includes(failure.status)) invalidate('session_expired'); throw failure; }
          }
          continue;
        }
        if (write && e.status === 403 && e.code === 'csrf_token_invalid' && !repaired) {
          repaired = true; await getCsrf(); continue;
        }
        if (protectedPath && (e.status === 401 || e.code === 'not_admin')) invalidate(e.code || 'session_expired');
        throw e;
      }
    }
  }
  function provider() {
    return root.ethereum?.providers?.find(p => p.isMetaMask) || root.ethereum?.providers?.[0] || root.ethereum || null;
  }
  async function signIn(progress = () => {}) {
    if (loginWork) return loginWork;
    loginWork = (async () => {
      const wallet = provider();
      if (!wallet) throw new Error('No wallet detected. Install MetaMask to continue.');
      progress('Connecting wallet…');
      const accounts = await wallet.request({ method: 'eth_requestAccounts' });
      const account = accounts?.[0]?.toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(account || '')) throw new Error('No account selected.');
      closing = false;
      // Reuse a valid matching session before asking for a signature.
      try {
        const current = await request('/api/admin/whoami');
        if (current.address?.toLowerCase() === account) { await getCsrf(); return current; }
      } catch (e) { if (![401,403].includes(e.status)) throw e; }
      for (let attempt = 0; attempt < 2; attempt++) {
        await getCsrf(); progress('Requesting nonce…');
        const nonce = await raw('/api/auth/nonce?address=' + encodeURIComponent(account));
        if (typeof nonce.nonce !== 'string' || !nonce.nonce) throw new Error('Invalid nonce');
        const authToken = nonce.nonce + ':' + Math.floor(Date.now() / 1000);
        const message = 'Signing in to Grassland Forest: ' + btoa(authToken);
        progress('Sign the message in your wallet…');
        const signature = await wallet.request({ method: 'personal_sign', params: [message, account] });
        const current = await wallet.request({ method: 'eth_accounts' });
        if (current?.[0]?.toLowerCase() !== account) throw new Error('The wallet account changed. Connect again.');
        try {
          await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ address: account, signature, token: authToken, message }) });
          break;
        } catch (e) { if (attempt || !/nonce/i.test(e.message)) throw e; }
      }
      progress('Verifying administrator access…');
      const current = await request('/api/admin/whoami');
      if (current.address?.toLowerCase() !== account) throw new Error('The session and wallet do not match.');
      return current;
    })().finally(() => { loginWork = null; });
    return loginWork;
  }
  async function logout() {
    closing = true;
    try {
      if (renewal) await renewal.catch(() => {});
      await getCsrf();
      await raw('/api/auth/logout', { method: 'POST', body: '{}' });
    } finally { invalidate('signed_out'); closing = false; }
  }
  function dispose() {
    destroyed = true; pending.forEach(c => c.abort()); pending.clear(); listeners.clear();
  }
  root.GFAdminSession = Object.freeze({ base, request, signIn, getCsrf, refresh, logout, provider, invalidate,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    diagnostics() { return { pending: pending.size, renewing: !!renewal }; }, dispose });
  root.addEventListener('pagehide', e => { if (!e.persisted) dispose(); });
})(window);
