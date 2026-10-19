'use strict';
const crypto = require('node:crypto');
const API = 'https://api.grasslandforest.com';
const LOGIN = 'https://app.grasslandforest.com/';
const GAME = 'https://game.grasslandforest.com/';
function gameURL(data) {
  if (!data?.authenticated || !/^0x[a-fA-F0-9]{40}$/.test(data.address || '')) throw Error('Invalid authenticated account');
  const url = new URL(GAME); url.searchParams.set('address', data.address);
  if (typeof data.playerName === 'string') url.searchParams.set('playerName', data.playerName.slice(0,80));
  if (data.walletKind === 'metamask') url.searchParams.set('wallet','metamask');
  return url.href;
}
function createNativeSession({ fetch, platform, openBrowser, state, play,
  getWalletKind = () => "session", saveWalletKind = () => {}, clearSession = async () => {},
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let generation = 0, timer, pair, controller, busy = false;
  function publish(kind, message, extra = {}) { state({ kind, message, ...extra }); }
  function cancel() { generation++; clearTimer(timer); timer = undefined; pair = undefined; controller?.abort(); controller = undefined; busy = false; }
  async function request(route, body, extraHeaders = {}) {
    const abort = new AbortController(); controller = abort;
    const timeout = setTimer(() => abort.abort(), 12000);
    try {
      const response = await fetch(API + route, { method: body ? 'POST' : 'GET', credentials: 'include', cache: 'no-store',
        redirect: 'error', signal: abort.signal, headers: { ...(body ? { 'Content-Type':'application/json' } : {}), ...extraHeaders },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      let data = {}; try { data = await response.json(); } catch {}
      return { status: response.status, data };
    } finally { clearTimer(timeout); if (controller === abort) controller = undefined; }
  }
  async function resume(browserId) {
    cancel(); const current = generation; busy = true;
    publish('checking','Checking your saved session…');
    try {
      let result = await request('/api/auth/me');
      if (current !== generation) return;
      if (result.status === 401) {
        const refresh = await request('/api/auth/refresh', {});
        if (current !== generation) return;
        if (refresh.status === 200) result = await request('/api/auth/me');
      }
      if (current !== generation) return;
      if (result.status === 200 && result.data.authenticated) {
        await play(gameURL({...result.data,walletKind:getWalletKind()}));
        if (current === generation) publish('playing','Playing in Grassland Forest.');
      } else if ([401,404].includes(result.status) && browserId) {
        busy = false;
        return await start(browserId);
      } else if ([401,403,404].includes(result.status)) publish('signed-out','Sign in once to start playing inside this app.');
      else publish('error','The game service is unavailable. Check your connection and try again.');
    } catch { if (current === generation) publish('error','Could not verify your session. Check your connection and retry.'); }
    finally { if (current === generation) busy = false; }
  }
  async function poll(current) {
    if (current !== generation || !pair) return;
    if (now() >= pair.expires) { pair = undefined; publish('expired','Sign-in timed out. Start again when you are ready.'); return; }
    try {
      const result = await request('/api/native/poll', { id:pair.id, verifier:pair.verifier });
      if (current !== generation || !pair) return;
      if (result.status === 202) { timer = setTimer(() => poll(current),2000); return; }
      if (result.status === 200 && result.data.authenticated) {
        const expected = result.data.address?.toLowerCase();
        pair = undefined;
        const verified = await request('/api/auth/me');
        if (current !== generation) return;
        if (verified.status !== 200 || !verified.data.authenticated || verified.data.address?.toLowerCase() !== expected) throw Error('Session cookie was not stored');
        saveWalletKind(result.data.walletKind);
        await play(gameURL({ ...verified.data, walletKind:result.data.walletKind }));
        if (current === generation) publish('playing','Playing in Grassland Forest.');
        return;
      }
      pair = undefined;
      publish(result.status===410?'expired':'error', result.status===410 ? 'This sign-in expired. Start again.' : 'Sign-in could not complete. Please try again.');
    } catch {
      if (current !== generation) return;
      if (!pair) { publish("error","Session received but the game could not open. Check the saved session to retry."); return; }
      publish('waiting','Connection interrupted. Still waiting for sign-in…', { code:pair.code });
      timer = setTimer(() => poll(current),4000);
    }
  }
  async function signOut() {
    cancel(); const current = generation; busy = true;
    publish('signing-out','Signing out…');
    let revoked = false;
    try {
      const csrf = await request('/api/auth/csrf-token');
      if (current !== generation) return {ok:false};
      if (csrf.status === 200 && typeof csrf.data.csrfToken === 'string') {
        const result = await request('/api/auth/logout', {}, {'X-CSRF-Token':csrf.data.csrfToken});
        revoked = result.status === 200;
      }
    } catch { /* Sin red también se elimina la sesión de este cliente. */ }
    try {
      if (current !== generation) return {ok:false};
      await clearSession(); saveWalletKind('session');
      if (current !== generation) return {ok:false};
      publish('signed-out',revoked ? 'Signed out. You can sign in with another account.' : 'Signed out on this device. The server could not confirm revocation.');
      return {ok:true};
    } catch { if (current===generation) publish('error','Could not clear the saved session. Close the app and retry.');return {ok:false}; }
    finally { if (current===generation) busy=false; }
  }
  async function start(browserId, chooseAccount = false) {
    if (busy || pair) return { ok:false, message:'A sign-in is already in progress. Finish it or cancel first.' };
    cancel(); const current = generation; busy = true;
    publish('opening','Preparing secure sign-in…');
    try {
      const verifier = crypto.randomBytes(32).toString('base64url');
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
      const result = await request('/api/native/start', { challenge,platform });
      if (current !== generation) return { ok:false };
      if (result.status===404) throw Error('backend-update');
      if (result.status!==200 || !/^[a-f0-9]{32}$/.test(result.data.id || '') || !/^\d{6}$/.test(result.data.code || '')) throw Error('service');
      pair = { id:result.data.id, code:result.data.code, verifier, expires:now()+Math.min(600,result.data.expiresIn || 600)*1000 };
      const url = new URL(LOGIN); url.hash = new URLSearchParams({ native_pair:pair.id }).toString();
      if (chooseAccount) url.searchParams.set('native_action','choose_account');
      await openBrowser(browserId,url.href);
      if (current !== generation) return { ok:false };
      publish('waiting','Complete sign-in in your browser, then confirm the matching code. The game will open here automatically.', { code:pair.code });
      timer = setTimer(() => poll(current),1000);
      return { ok:true };
    } catch (error) {
      if (current === generation) { pair = undefined; publish('error', error.message==='backend-update' ? 'Native sign-in is not available on the server yet. The server and login update must be published.' : 'Could not start sign-in. Select another browser or retry.'); }
      return { ok:false };
    } finally { if (current===generation) busy=false; }
  }
  return { resume,start,signOut,cancel,dispose:cancel };
}
function trustedGameURL(value) {
  try { const u=new URL(value); return !u.username && !u.password && !u.port && u.protocol==='https:' && u.origin===new URL(GAME).origin; } catch { return false; }
}
function safeExternalURL(value) {
  try { const u=new URL(value); return u.protocol==='https:' && !u.username && !u.password && !u.port; } catch { return false; }
}
module.exports = { createNativeSession,gameURL,trustedGameURL,safeExternalURL,API,LOGIN,GAME };
