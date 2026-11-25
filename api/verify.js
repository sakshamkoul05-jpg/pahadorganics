// POST /api/verify — verifies a Razorpay payment signature.
// Computes HMAC-SHA256 of `${razorpay_order_id}|${razorpay_payment_id}` with
// RAZORPAY_KEY_SECRET (Vercel env var) and compares timing-safely.
// No external dependencies: node crypto + global fetch only.
//
// Order emails: when a signature verifies AND both RESEND_API_KEY and
// ORDERS_EMAIL (Vercel env vars) are set, two emails go out via Resend —
// an order alert to ORDERS_EMAIL and a confirmation to the customer.
// The order/customer details in the request body are DISPLAY-ONLY for
// those emails; the signature check is the only trust decision.
// Email failures are logged server-side and never change the response.
const crypto = require('crypto');

async function sendOrderEmails(body, paymentId, orderId) {
  const apiKey = process.env.RESEND_API_KEY;
  const ordersEmail = process.env.ORDERS_EMAIL;
  if (!apiKey || !ordersEmail) return;

  const from = process.env.ORDERS_FROM || 'PAHAD Organics <onboarding@resend.dev>';
  const customer = body.customer || {};
  const amountPaise = Math.round(Number(body.amount) || 0);
  const amount = amountPaise
    ? '₹' + (amountPaise / 100).toLocaleString('en-IN')
    : '₹—';
  const items = String(body.items || '');
  const custName = String(customer.name || '');
  const custPhone = String(customer.phone || '');
  const custEmail = String(customer.email || '');
  const custAddress = String(customer.address || '');
  const custPincode = String(customer.pincode || '');

  const send = (payload) =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, ...payload }),
    }).then(async (r) => {
      if (!r.ok) {
        console.error('Resend send failed:', r.status, await r.text().catch(() => ''));
      }
    });

  const jobs = [
    send({
      to: ordersEmail,
      subject: `New PAHAD order — ${amount} — ${paymentId}`,
      text: [
        'A new order has been placed and paid on the PAHAD Organics website.',
        '',
        `Payment ID: ${paymentId}`,
        `Order ID: ${orderId}`,
        `Amount: ${amount}`,
        `Items: ${items}`,
        '',
        'Customer:',
        `Name: ${custName}`,
        `Phone: ${custPhone}`,
        `Email: ${custEmail}`,
        `Address: ${custAddress}`,
        `Pincode: ${custPincode}`,
      ].join('\n'),
    }),
  ];

  if (custEmail) {
    jobs.push(
      send({
        to: custEmail,
        subject: 'Your PAHAD Organics order is confirmed',
        text: [
          'Dhanyavaad! Your PAHAD Organics order is confirmed.',
          '',
          `Payment ID: ${paymentId}`,
          `Items: ${items}`,
          `Amount paid: ${amount}`,
          '',
          'PAHAD will pack your order in Dharamshala and confirm delivery on call/WhatsApp.',
        ].join('\n'),
      })
    );
  }

  await Promise.all(jobs);
}

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

  if (ok) {
    try {
      await sendOrderEmails(body, razorpay_payment_id, razorpay_order_id);
    } catch (err) {
      console.error('Order email error:', err);
    }
  }

  res.status(200).json({ ok });
};
