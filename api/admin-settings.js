// /api/admin-settings — read/write the site settings (cookie-gated).
//   GET  → { configured, settings: { announcement, store_open } }
//   POST { announcement?, store_open? } → upserts into the settings
//          table; the public site picks changes up via /api/settings.
const {
  isAdmin,
  isSupabaseConfigured,
  sbSelect,
  sbUpsert,
  parseBody,
} = require('./_supabase');

const DEFAULTS = {
  announcement: '100% natural • No chemicals • Pan-India delivery • Order on WhatsApp',
  store_open: 'true',
};

async function readSettings() {
  const rows = await sbSelect('settings', 'select=key,value');
  const map = { ...DEFAULTS };
  if (Array.isArray(rows)) {
    rows.forEach((r) => {
      if (r && typeof r.key === 'string') map[r.key] = r.value;
    });
  }
  return map;
}

module.exports = async (req, res) => {
  if (!isAdmin(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  if (req.method === 'GET') {
    if (!isSupabaseConfigured()) {
      res.status(200).json({ configured: false, settings: { ...DEFAULTS } });
      return;
    }
    res.status(200).json({ configured: true, settings: await readSettings() });
    return;
  }

  if (req.method === 'POST') {
    if (!isSupabaseConfigured()) {
      res.status(200).json({ configured: false });
      return;
    }
    const body = parseBody(req);
    const rows = [];
    if (typeof body.announcement === 'string') {
      rows.push({ key: 'announcement', value: body.announcement.slice(0, 300) });
    }
    if (typeof body.store_open !== 'undefined') {
      rows.push({
        key: 'store_open',
        value: body.store_open === true || body.store_open === 'true' ? 'true' : 'false',
      });
    }
    if (rows.length === 0) {
      res.status(400).json({ ok: false, error: 'nothing_to_save' });
      return;
    }
    const out = await sbUpsert('settings', rows, 'key');
    if (!out) {
      res.status(502).json({ ok: false, error: 'save_failed' });
      return;
    }
    res.status(200).json({ ok: true, settings: await readSettings() });
    return;
  }

  res.status(405).json({ ok: false, error: 'method_not_allowed' });
};
