'use strict';
// La misma función se incrusta en server2.js: el backend sigue siendo un archivo.
function createNativePairing({ crypto, now = Date.now, limit = 1000, issueSession, checkAccess }) {
  const pending = new Map();
  const ttl = 10 * 60 * 1000;
  const idPattern = /^[a-f0-9]{32}$/;
  function prune() { for (const [id, value] of pending) if (value.expires <= now()) pending.delete(id); }
  function find(id) { prune(); return typeof id === 'string' && idPattern.test(id) ? pending.get(id) : null; }
  function start({ challenge, platform }) {
    prune();
    if (typeof challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(challenge) || !['win32','linux','darwin'].includes(platform)) return { status: 400, error: 'invalid_request' };
    if (pending.size >= limit) return { status: 503, error: 'pairing_capacity' };
    const id = crypto.randomBytes(16).toString('hex');
    const code = String(crypto.randomInt(100000, 1000000));
    pending.set(id, { challenge, platform, code, expires: now() + ttl });
    return { status: 200, id, code, expiresIn: ttl / 1000 };
  }
  function info(id) {
    const entry = find(id);
    return entry ? { status: 200, platform: entry.platform, code: entry.code, expiresIn: Math.max(0, Math.ceil((entry.expires-now())/1000)) } : { status: 410, error: 'pairing_expired' };
  }
  function approve({ id, address, walletKind }) {
    const entry = find(id);
    if (!entry) return { status: 410, error: 'pairing_expired' };
    if (!/^0x[a-fA-F0-9]{40}$/.test(address || '') || !['social','metamask','session'].includes(walletKind)) return { status: 400, error: 'invalid_request' };
    // Una aprobación no se puede sustituir por otra cuenta mientras el nativo espera.
    if (entry.address) return { status: 409, error: 'pairing_already_approved' };
    entry.address = address.toLowerCase(); entry.walletKind = walletKind;
    entry.expires = Math.min(entry.expires, now() + 120000);
    return { status: 200, approved: true };
  }
  async function poll({ id, verifier }, req, res) {
    const entry = find(id);
    if (!entry) return { status: 410, error: 'pairing_expired' };
    if (typeof verifier !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) return { status: 400, error: 'invalid_request' };
    const actual = crypto.createHash('sha256').update(verifier).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(entry.challenge))) return { status: 403, error: 'invalid_proof' };
    if (!entry.address) return { status: 202, pending: true };
    // Consumo atómico ANTES de cualquier await: jamás emitir dos sesiones.
    pending.delete(id);
    const access = await checkAccess(entry.address);
    if (!access.allowed) return { status: 403, error: access.error || 'access_denied' };
    const player = await issueSession(entry.address, req, res);
    return { status: 200, authenticated: true, address: entry.address, playerName: player.playerName || entry.address, walletKind: entry.walletKind };
  }
  return { start, info, approve, poll, clear: () => pending.clear(), size: () => { prune(); return pending.size; } };
}
module.exports = { createNativePairing };
