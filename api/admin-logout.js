// POST /api/admin-logout — signs the admin out of the gated dashboard
// (/api/admin-app) by expiring the `pahad_admin` cookie. Harmless to
// call without a session, so it is not itself cookie-gated.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  res.setHeader(
    'Set-Cookie',
    'pahad_admin=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'
  );
  res.status(200).json({ ok: true });
};
