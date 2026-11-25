// POST /api/create-order — creates a Razorpay order.
// Keys come ONLY from Vercel environment variables (RAZORPAY_KEY_ID /
// RAZORPAY_KEY_SECRET), set by the site owner in the Vercel dashboard.
// Never hardcode keys here. No external dependencies: global fetch only.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    res.status(501).json({ error: 'payments_not_configured' });
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

  const amount = Math.round(Number(body.amount) || 0);
  if (!amount || amount < 100) {
    res.status(400).json({ error: 'invalid_amount' });
    return;
  }

  const customer = body.customer || {};
  const notes = {
    customer_name: String(customer.name || ''),
    phone: String(customer.phone || ''),
    address: String(customer.address || ''),
    pincode: String(customer.pincode || ''),
    items: String(body.items || ''),
  };

  try {
    const resp = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64'),
      },
      body: JSON.stringify({
        amount,
        currency: 'INR',
        receipt: 'pahad_' + Date.now(),
        notes,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.id) {
      // Log details server-side only; the client gets a generic message.
      console.error('Razorpay order creation failed:', resp.status, JSON.stringify(data));
      res.status(502).json({ error: 'payment_gateway_error' });
      return;
    }
    res.status(200).json({ order_id: data.id, key_id: keyId, amount: data.amount });
  } catch (err) {
    console.error('Razorpay order creation error:', err);
    res.status(502).json({ error: 'payment_gateway_error' });
  }
};
