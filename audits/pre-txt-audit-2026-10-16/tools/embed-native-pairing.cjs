'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createNativePairing } = require('./native-pairing-server.cjs');
const file = path.join(process.env.USERPROFILE, 'Desktop/server2.js');
const original = fs.readFileSync(file);
const old = original.toString('latin1');
const start = '// GF_NATIVE_PAIRING_BEGIN';
const end = '// GF_NATIVE_PAIRING_END';
const block = `${start}
// Autorización PKCE de un solo uso: sesión nueva para el cliente nativo,
// sin copiar cookies del navegador, refresh tokens, claves ni frases semilla.
const gfCreateNativePairing = ${createNativePairing.toString()};
const gfNativePairing = gfCreateNativePairing({ crypto, checkAccess: checkGameAccess,
  getPlayer: async address => (await GamePlayer.findOne({ address }).lean().exec()) || {},
  issueSession: async (address, req, res) => {
    const accessToken = jwt.sign({ address, type: 'access', jti: uuidv4() }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES });
    const refresh = jwt.sign({ address, type: 'refresh', jti: uuidv4() }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_TTL_DAYS + 'd' });
    await RefreshToken.create({ token: crypto.createHash('sha256').update(refresh).digest('hex'), address,
      expiresAt: new Date(jwt.decode(refresh).exp * 1000), userAgent: req.headers['user-agent'], ip: req.clientIp });
    const player = await GamePlayer.findOne({ address }).lean().exec();
    const csrfToken = generateCSRFToken();
    res.cookie('session', accessToken, setCookieOptions(15 * 60));
    res.cookie('refresh', refresh, setCookieOptions(REFRESH_TOKEN_TTL_DAYS * 86400));
    res.cookie('csrf-token', csrfToken, setCookieOptions(3600, true));
    res.setHeader('X-CSRF-Token', csrfToken);
    return { playerName: player && player.playerName };
  }
});
const gfNativeStartLimiter = createCustomRateLimiter(15 * 60 * 1000, 30, 'too_many_pairing_requests');
const gfNativePollLimiter = createCustomRateLimiter(60 * 1000, 70, 'too_many_pairing_polls');
function gfNativeResult(res, result) {
  const { status, ...body } = result;
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}
app.post('/api/native/start', gfNativeStartLimiter, (req, res) => gfNativeResult(res, gfNativePairing.start(req.body || {})));
app.get('/api/native/info/:id', gfNativeStartLimiter, (req, res) => gfNativeResult(res, gfNativePairing.info(req.params.id)));
app.post('/api/native/approve', gfNativeStartLimiter, csrfProtection, authMiddleware, (req, res) => {
  if (req.headers.origin !== 'https://app.grasslandforest.com') return gfNativeResult(res, { status: 403, error: 'invalid_origin' });
  return gfNativeResult(res, gfNativePairing.approve({ id: req.body && req.body.id, address: req.user.address, walletKind: req.body && req.body.walletKind }));
});
app.post('/api/native/poll', gfNativePollLimiter, async (req, res) => {
  try { return gfNativeResult(res, await gfNativePairing.poll(req.body || {}, req, res)); }
  catch { return gfNativeResult(res, { status: 503, error: 'pairing_service_unavailable' }); }
});
${end}
`;
let next;
if (old.includes(start)) { const from = old.indexOf(start), to = old.indexOf(end, from) + end.length; next = old.slice(0, from) + block + old.slice(to); }
else { const marker = '// Logout\r\napp.post'; const pos = old.indexOf(marker); if (pos < 0) throw Error('No se encontró anclaje de auth'); next = old.slice(0,pos) + block + '\r\n' + old.slice(pos); }
if (!fs.existsSync(file + '.bak-native-1.1.2')) fs.copyFileSync(file, file + '.bak-native-1.1.2');
// Conserva exactamente los bytes del backend fuera del bloque sustituido.
const from = old.indexOf(start), to = old.indexOf(end, from) + end.length;
if (from < 0 || to < end.length) throw Error('No se encontró el bloque nativo existente');
fs.writeFileSync(file, Buffer.concat([original.subarray(0, from), Buffer.from(block, 'utf8'), original.subarray(to)]));
console.log('server2.js: autorización nativa incorporada, sin archivo extra de runtime.');
