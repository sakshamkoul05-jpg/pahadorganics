// POST /api/webhook — Razorpay webhook receiver.
// On payment.captured / order.paid, saves the order into Supabase
// (source 'webhook') as a backstop to the /api/verify save: the two
// writers upsert on payment_id, so an order is never duplicated.
//
// When RAZORPAY_WEBHOOK_SECRET (Vercel env var) is set, the
// x-razorpay-signature header is verified as HMAC-SHA256 of the RAW
// request body — hence bodyParser is disabled and the stream is read
// manually. When Supabase is not configured this is a 200 no-op.
// Valid requests always get a fast 200 so Razorpay doesn't retry-storm.
// No external dependencies: node crypto + global fetch only.
const crypto = require('crypto');
const { upsertOrder } = require('./_supabase');

function signatureValid(rawBody, signature, secret) {
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  // Read the raw body (needed verbatim for signature verification).
  let raw;
  try {
    if (typeof req.body === 'string') raw = Buffer.from(req.body, 'utf8');
    else if (Buffer.isBuffer(req.body)) raw = req.body;
    else if (req.body && typeof req.body === 'object')
      raw = Buffer.from(JSON.stringify(req.body), 'utf8');
    else {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      raw = Buffer.concat(chunks);
    }
  } catch (err) {
    console.error('Webhook body read error:', err);
    res.status(400).json({ ok: false, error: 'bad_body' });
    return;
  }

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (webhookSecret) {
    const signature = req.headers && req.headers['x-razorpay-signature'];
    if (!signatureValid(raw, signature, webhookSecret)) {
      res.status(400).json({ ok: false, error: 'invalid_signature' });
      return;
    }
  }

  let event = null;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    res.status(400).json({ ok: false, error: 'bad_json' });
    return;
  }

  try {
    if (event && (event.event === 'payment.captured' || event.event === 'order.paid')) {
      const entity =
        event.payload && event.payload.payment && event.payload.payment.entity;
      if (entity && entity.id) {
        const notes = entity.notes || {};
        await upsertOrder({
          payment_id: entity.id,
          order_id: entity.order_id || null,
          amount: typeof entity.amount === 'number' ? entity.amount : null,
          currency: entity.currency || 'INR',
          items: notes.items || '',
          customer_name: notes.customer_name || '',
          customer_phone: entity.contact || notes.phone || '',
          customer_email: entity.email || notes.email || '',
          address: notes.address || '',
          pincode: notes.pincode || '',
          status: 'New',
          source: 'webhook',
        });
      }
    }
  } catch (err) {
    // Never fail the webhook because of a save problem — log and 200.
    console.error('Webhook order save error:', err);
  }

  res.status(200).json({ ok: true });
};

// Razorpay signs the raw body, so Vercel must not pre-parse it.
module.exports.config = { api: { bodyParser: false } };
