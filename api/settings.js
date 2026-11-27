// GET /api/settings — PUBLIC. Returns the site settings the admin
// dashboard can edit: { announcement, store_open }.
// When Supabase is not configured (env vars unset), it returns the
// built-in defaults, so the public site behaves exactly as before.
const { isSupabaseConfigured, sbSelect } = require('./_supabase');

const DEFAULTS = {
  announcement: '100% natural • No chemicals • Pan-India delivery • Order on WhatsApp',
  store_open: true,
};

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

  if (!isSupabaseConfigured()) {
    res.status(200).json(DEFAULTS);
    return;
  }

  const rows = await sbSelect('settings', 'select=key,value');
  if (!Array.isArray(rows)) {
    res.status(200).json(DEFAULTS);
    return;
  }
  const map = {};
  rows.forEach((r) => {
    if (r && typeof r.key === 'string') map[r.key] = r.value;
  });
  res.status(200).json({
    announcement:
      typeof map.announcement === 'string' && map.announcement
        ? map.announcement
        : DEFAULTS.announcement,
    store_open: map.store_open !== 'false',
  });
};
