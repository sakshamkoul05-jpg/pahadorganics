// /api/admin-health — system health checks for the admin dashboard
// (cookie-gated GET). Returns plain booleans + short, safe status
// strings so a broken setup explains ITSELF in the Settings → System
// Health card instead of failing silently:
//   admin_password_set · supabase_configured · orders_table ·
//   settings_table · resend_configured · razorpay_configured ·
//   webhook_secret_set
// Table checks run a `select limit 1` against Supabase and interpret
// the error: HTTP 404 / PGRST205 / a "relation …" message means the
// table was never created (the owner has not run supabase-schema.sql).
// Keys and raw error payloads are NEVER exposed — statuses only.
const {
  isAdmin,
  isSupabaseConfigured,
  sbRawSelect,
  isTableMissing,
} = require('./_supabase');

function check(ok, status) {
  return { ok: Boolean(ok), status };
}

async function tableCheck(table) {
  if (!isSupabaseConfigured()) return check(false, 'Database not configured');
  const raw = await sbRawSelect(table, 'select=*&limit=1');
  if (raw.ok) return check(true, 'OK — table exists and is readable');
  if (isTableMissing(raw)) {
    return check(false, 'Table missing — run supabase-schema.sql in Supabase → SQL Editor');
  }
  if (!raw.status) return check(false, 'Could not reach the database');
  return check(false, `Query failed (HTTP ${raw.status}) — check the Supabase keys`);
}

module.exports = async (req, res) => {
  if (!isAdmin(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const supa = isSupabaseConfigured();
  const razorpay = Boolean(
    process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  );

  const checks = {
    admin_password_set: check(
      Boolean(process.env.ADMIN_PASSWORD),
      process.env.ADMIN_PASSWORD ? 'Set' : 'ADMIN_PASSWORD is not set'
    ),
    supabase_configured: check(
      supa,
      supa ? 'Configured' : 'SUPABASE_URL / SUPABASE_SERVICE_KEY missing in hosting settings'
    ),
    orders_table: await tableCheck('orders'),
    settings_table: await tableCheck('settings'),
    resend_configured: check(
      Boolean(process.env.RESEND_API_KEY),
      process.env.RESEND_API_KEY
        ? 'Configured'
        : 'RESEND_API_KEY missing — order emails are off'
    ),
    razorpay_configured: check(
      razorpay,
      razorpay ? 'Configured' : 'Razorpay keys missing — payments are off'
    ),
    webhook_secret_set: check(
      Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
      process.env.RAZORPAY_WEBHOOK_SECRET
        ? 'Set'
        : 'Not set — orders are captured at checkout only, not by webhook'
    ),
  };

  res.status(200).json({ ok: true, checks });
};
