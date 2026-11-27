// POST /api/admin-login — admin sign-in for the CRM dashboard.
// Body: { password }. Compared timing-safely with ADMIN_PASSWORD
// (Vercel env var). On success, sets an httpOnly cookie `pahad_admin`
// holding an HMAC-signed token (payload {exp: now + 7 days}, signed
// with ADMIN_PASSWORD) that the other /api/admin-* functions verify.
// ADMIN_PASSWORD unset → 501 (admin is dormant, like everything else).
const { checkPassword, signToken, parseBody } = require('./_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  if (!process.env.ADMIN_PASSWORD) {
    res.status(501).json({ ok: false, error: 'admin_not_configured' });
    return;
  }

  const body = parseBody(req);
  if (!checkPassword(body.password)) {
    res.status(401).json({ ok: false, error: 'wrong_password' });
    return;
  }

  const token = signToken();
  const maxAge = 7 * 24 * 3600;
  res.setHeader(
    'Set-Cookie',
    `pahad_admin=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`
  );
  res.status(200).json({ ok: true });
};
