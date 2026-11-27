// /api/admin-orders — the CRM orders endpoint (cookie-gated).
//   GET  → latest 500 orders, newest first, plus a `stats` block
//          (today/total counts and revenue in paise, Asia/Kolkata
//          "today"; Cancelled orders count as orders but not as
//          revenue) and a `configured` block naming which integrations
//          are live — booleans only, never values:
//          { supabase, resend, razorpay }. Without a valid admin
//          cookie → 401. Supabase unset → { configured: false }.
//   POST { payment_id, status } → move an order along the pipeline
//          (New | Packed | Shipped | Delivered | Cancelled). When the
//          new status is Packed/Shipped/Delivered/Cancelled and Resend
//          is configured, the customer gets a short update email —
//          an email failure never fails the API call.
const {
  isAdmin,
  isSupabaseConfigured,
  sbSelect,
  sbUpdate,
  sendEmail,
  parseBody,
} = require('./_supabase');

const STATUSES = ['New', 'Packed', 'Shipped', 'Delivered', 'Cancelled'];
const NOTIFY_ON = ['Packed', 'Shipped', 'Delivered', 'Cancelled'];

const inr = (paise) =>
  typeof paise === 'number' ? '₹' + (paise / 100).toLocaleString('en-IN') : '₹—';

/* Calendar date (YYYY-MM-DD) in Asia/Kolkata for a Date — used to work
   out which orders count as "today" for the dashboard KPIs. */
function istDateStr(d) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function computeStats(rows) {
  const today = istDateStr(new Date());
  const byStatus = { New: 0, Packed: 0, Shipped: 0, Delivered: 0, Cancelled: 0 };
  let todayCount = 0;
  let todayRevenue = 0;
  let totalRevenue = 0;
  for (const o of rows) {
    if (o && STATUSES.includes(o.status)) byStatus[o.status] += 1;
    const amount = o && typeof o.amount === 'number' ? o.amount : 0;
    const isToday = o && o.created_at && istDateStr(new Date(o.created_at)) === today;
    if (isToday) todayCount += 1;
    if (!o || o.status !== 'Cancelled') {
      totalRevenue += amount;
      if (isToday) todayRevenue += amount;
    }
  }
  return {
    today_count: todayCount,
    today_revenue: todayRevenue,
    total_count: rows.length,
    total_revenue: totalRevenue,
    by_status: byStatus,
  };
}

async function notifyCustomer(order, status) {
  if (!order || !order.customer_email) return;
  if (!process.env.RESEND_API_KEY) return;
  await sendEmail({
    to: order.customer_email,
    subject: `Your PAHAD Organics order update: ${status}`,
    text: [
      order.customer_name ? `Namaste ${order.customer_name},` : 'Namaste,',
      '',
      `Your PAHAD Organics order is now: ${status}.`,
      '',
      `Items: ${order.items || ''}`,
      `Amount paid: ${inr(order.amount)}`,
      `Payment ID: ${order.payment_id}`,
      '',
      status === 'Delivered'
        ? 'Dhanyavaad for ordering from the hills!'
        : 'PAHAD will confirm delivery details on call/WhatsApp.',
    ].join('\n'),
  });
}

module.exports = async (req, res) => {
  if (!isAdmin(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  if (req.method === 'GET') {
    if (!isSupabaseConfigured()) {
      res.status(200).json({ configured: false, orders: [] });
      return;
    }
    const rows = await sbSelect(
      'orders',
      'select=*&order=created_at.desc&limit=500'
    );
    const orders = Array.isArray(rows) ? rows : [];
    res.status(200).json({
      configured: {
        supabase: true,
        resend: Boolean(process.env.RESEND_API_KEY),
        razorpay: Boolean(
          process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
        ),
      },
      orders,
      stats: computeStats(orders),
    });
    return;
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
    const paymentId = typeof body.payment_id === 'string' ? body.payment_id : '';
    const status = body.status;
    if (!paymentId || !STATUSES.includes(status)) {
      res.status(400).json({ ok: false, error: 'invalid_status_or_payment' });
      return;
    }
    if (!isSupabaseConfigured()) {
      res.status(200).json({ configured: false });
      return;
    }
    const updated = await sbUpdate(
      'orders',
      `payment_id=eq.${encodeURIComponent(paymentId)}`,
      { status, updated_at: new Date().toISOString() }
    );
    if (!updated) {
      res.status(502).json({ ok: false, error: 'update_failed' });
      return;
    }
    if (NOTIFY_ON.includes(status)) {
      try {
        await notifyCustomer(updated, status);
      } catch (err) {
        console.error('Order status email error:', err);
      }
    }
    res.status(200).json({ ok: true, order: updated });
    return;
  }

  res.status(405).json({ ok: false, error: 'method_not_allowed' });
};
