// Shared server helpers for the /api functions (NOT a route — the leading
// underscore keeps Vercel from exposing this file as an endpoint).
//
// Everything here is ENV-GATED and fails safe:
//   - Supabase helpers no-op (return null/false) when SUPABASE_URL or
//     SUPABASE_SERVICE_KEY is unset, so the site behaves exactly as it did
//     before the CRM existed.
//   - Admin auth helpers work only when ADMIN_PASSWORD is set.
// No external dependencies: node crypto + global fetch only.
const crypto = require('crypto');

/* ------------------------------ Supabase ------------------------------ */

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY || '';
  if (!url || !key) return null;
  return { url, key };
}

function isSupabaseConfigured() {
  return supabaseConfig() !== null;
}

async function sbFetch(path, options = {}) {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  try {
    const resp = await fetch(`${cfg.url}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (!resp.ok) {
      console.error('Supabase request failed:', resp.status, await resp.text().catch(() => ''));
      return null;
    }
    const text = await resp.text();
    if (!text) return true;
    try {
      return JSON.parse(text);
    } catch {
      return true;
    }
  } catch (err) {
    console.error('Supabase request error:', err);
    return null;
  }
}

/* Insert a row; with onConflict + ignore, an existing row is left as-is
   (used for orders: the first writer wins, duplicates never overwrite). */
async function sbInsert(table, row, { onConflict = null, ignore = false } = {}) {
  const qs = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
  const prefer = ignore
    ? 'resolution=ignore-duplicates,return=representation'
    : 'return=representation';
  const out = await sbFetch(`${table}${qs}`, {
    method: 'POST',
    headers: { Prefer: prefer },
    body: JSON.stringify(row),
  });
  return Array.isArray(out) ? out[0] || null : out;
}

/* Upsert rows, merging on the conflict key (used for settings). */
async function sbUpsert(table, rows, onConflict) {
  const qs = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
  const out = await sbFetch(`${table}${qs}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(rows),
  });
  return out;
}

async function sbSelect(table, query = '') {
  return sbFetch(query ? `${table}?${query}` : table, { method: 'GET' });
}

/* Raw GET that PRESERVES the failure details sbFetch swallows:
   { ok, configured, status, data, code, message }. Used where the
   caller needs to diagnose WHY a query failed (admin health checks,
   the orders endpoint's db_error) instead of guessing. Never throws. */
async function sbRawSelect(table, query = '') {
  const cfg = supabaseConfig();
  if (!cfg) {
    return { ok: false, configured: false, status: 0, data: null, code: '', message: '' };
  }
  try {
    const resp = await fetch(`${cfg.url}/rest/v1/${table}${query ? `?${query}` : ''}`, {
      method: 'GET',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
      },
    });
    const text = await resp.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (resp.ok) {
      return { ok: true, configured: true, status: resp.status, data, code: '', message: '' };
    }
    return {
      ok: false,
      configured: true,
      status: resp.status,
      data: null,
      code: data && typeof data.code === 'string' ? data.code : '',
      message: data && typeof data.message === 'string' ? data.message : '',
    };
  } catch {
    return { ok: false, configured: true, status: 0, data: null, code: '', message: '' };
  }
}

/* True when a raw query failed because the TABLE does not exist yet
   (PostgREST: HTTP 404, code PGRST205, or a "relation ..." message) —
   i.e. the owner has not run supabase-schema.sql. */
function isTableMissing(raw) {
  if (!raw || raw.ok) return false;
  if (raw.status === 404) return true;
  if (raw.code === 'PGRST205' || raw.code === '42P01') return true;
  return typeof raw.message === 'string' && raw.message.toLowerCase().includes('relation');
}

async function sbUpdate(table, query, patch) {
  const out = await sbFetch(`${table}?${query}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
  return Array.isArray(out) ? out[0] || null : out;
}

/* Save an order row (insert-or-ignore on payment_id). Returns the row or
   null. Never throws. */
async function upsertOrder(order) {
  if (!isSupabaseConfigured()) return null;
  if (!order || !order.payment_id) return null;
  try {
    return await sbInsert('orders', order, { onConflict: 'payment_id', ignore: true });
  } catch (err) {
    console.error('Order save error:', err);
    return null;
  }
}

/* ---------------------------- Admin auth ------------------------------ */
/* Cookie token: base64url(JSON payload) + "." + base64url(HMAC-SHA256),
   signed with ADMIN_PASSWORD. Payload: { exp } (unix seconds, +7 days). */

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function signToken() {
  const secret = process.env.ADMIN_PASSWORD || '';
  const payload = b64url(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 }));
  const sig = b64url(crypto.createHmac('sha256', secret).update(payload).digest());
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret || !token || typeof token !== 'string') return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = b64url(crypto.createHmac('sha256', secret).update(payload).digest());
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(sig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof data.exp === 'number' && data.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function getCookie(req, name) {
  const header = (req.headers && (req.headers.cookie || req.headers.Cookie)) || '';
  const parts = String(header).split(';');
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function isAdmin(req) {
  return verifyToken(getCookie(req, 'pahad_admin'));
}

/* Timing-safe password check (hash first so lengths always match). */
function checkPassword(candidate) {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret || typeof candidate !== 'string') return false;
  const a = crypto.createHash('sha256').update(candidate).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

/* ------------------------------ Email --------------------------------- */
/* Same Resend pattern as verify.js. Returns true/false, never throws. */

async function sendEmail({ to, subject, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return false;
  const from = process.env.ORDERS_FROM || 'PAHAD Organics <onboarding@resend.dev>';
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to, subject, text }),
    });
    if (!resp.ok) {
      console.error('Resend send failed:', resp.status, await resp.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err) {
    console.error('Resend send error:', err);
    return false;
  }
}

/* Parse a JSON request body the same way the other /api functions do. */
function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  return body || {};
}

module.exports = {
  isSupabaseConfigured,
  sbInsert,
  sbUpsert,
  sbSelect,
  sbRawSelect,
  isTableMissing,
  sbUpdate,
  upsertOrder,
  signToken,
  verifyToken,
  getCookie,
  isAdmin,
  checkPassword,
  sendEmail,
  parseBody,
};
