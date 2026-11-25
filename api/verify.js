// POST /api/verify — verifies a Razorpay payment signature.
// Computes HMAC-SHA256 of `${razorpay_order_id}|${razorpay_payment_id}` with
// RAZORPAY_KEY_SECRET (Vercel env var) and compares timing-safely.
// No external dependencies: node crypto only.
const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    res.status(501).json({ ok: false, error: 'payments_not_configured' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    res.status(400).json({ ok: false, error: 'missing_fields' });
    return;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const givenBuf = Buffer.from(String(razorpay_signature), 'utf8');
  const ok =
    expectedBuf.length === givenBuf.length && crypto.timingSafeEqual(expectedBuf, givenBuf);

  res.status(200).json({ ok });
};
