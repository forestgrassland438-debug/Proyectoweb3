from pathlib import Path
import importlib.util
spec=importlib.util.spec_from_file_location('res_apply','tools/resource-economy-apply.py')
u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u)
p=Path('C:/Users/pc/Desktop/gf-wallet-sdk/server/gf-wallet-routes.js');s=u.read(p)
s=u.once(s,"    address:  { type: String, required: true, lowercase: true, index: true },", """    address:  { type: String, required: true, lowercase: true, index: true },
    // Only provider-verified contact data, never accepted from the browser.
    email: { type: String, maxlength: 254, select: false },
    emailVerified: { type: Boolean, default: false },
    identityVerifiedAt: { type: Date, default: null },""")
s=u.once(s,"    return { sub: p.sub, emailVerified: !!p.email_verified };", """    const verified = p.email_verified === true || p.email_verified === 'true';
    const email = verified && typeof p.email === 'string' && /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(p.email) && p.email.length <= 254 ? p.email : null;
    return { sub: p.sub, emailVerified: !!email, email };""")
s=u.once(s,"    return { sub: p.sub, emailVerified: p.email_verified === true || p.email_verified === 'true' };", """    const verified = p.email_verified === true || p.email_verified === 'true';
    const email = verified && typeof p.email === 'string' && /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(p.email) && p.email.length <= 254 ? p.email : null;
    return { sub: p.sub, emailVerified: !!email, email };""")
old="      const ticket = firmarTicket({ t: 'vault', s: subHash, p: provider }, TICKET_TTL_SEC);"
new="""      // The short-lived ticket carries an encrypted contact envelope, so an
      // email address is not exposed in vault request URLs or access logs.
      const emailEnvelope = identidad.emailVerified && identidad.email
        ? cifrarEnReposo(Buffer.from(identidad.email, 'utf8'), 'gf-wallet-email:' + subHash) : null;
      if (existente) {
        await SocialWallet.updateOne({ subHash, address: existente.address }, { $set: {
          identityVerifiedAt: new Date(), ...(identidad.emailVerified && identidad.email ? { email: identidad.email, emailVerified: true } : {})
        } });
      }
      const ticket = firmarTicket({ t: 'vault', s: subHash, p: provider, ...(emailEnvelope ? { e: emailEnvelope } : {}) }, TICKET_TTL_SEC);"""
s=u.once(s,old,new)
old="""        provider: t.p,
        address: String(address).toLowerCase(),"""
new="""        provider: t.p,
        address: String(address).toLowerCase(),
        ...(t.e ? { email: descifrarEnReposo(t.e, 'gf-wallet-email:' + t.s).toString('utf8'), emailVerified: true } : {}),
        identityVerifiedAt: new Date(),"""
s=u.once(s,old,new)
u.save(p,s)
print('Verified provider emails added; vault cryptography and key fields preserved.')
