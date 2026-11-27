// /api/admin-app — the gated admin CRM dashboard.
//
// This serverless function IS the dashboard page; there is no public
// admin page anymore (the old /admin.html is now a plain 404 stub).
//
//   - ADMIN_PASSWORD unset → plain 404 (the dashboard does not exist).
//   - No valid `pahad_admin` cookie → ONLY a bare sign-in page: one
//     password field, neutral styling, no PAHAD branding, no dashboard
//     markup, no hints about what sits behind it. Its form POSTs to
//     /api/admin-login and reloads this URL on success.
//   - Valid cookie → the full dashboard as ONE self-contained HTML
//     document (inline CSS + vanilla JS, no external assets). The HTML
//     carries zero order data — everything is fetched client-side from
//     the cookie-gated /api/admin-orders and /api/admin-settings.
const { isAdmin } = require('./_supabase');

const NOT_FOUND_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>404 — Page not found</title>
<style>
  body{margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f6f6f4;color:#333;display:flex;min-height:100vh;align-items:center;justify-content:center}
  main{text-align:center;padding:24px}
  h1{font-size:1.6rem;font-weight:600;margin:0 0 8px}
  p{margin:0;color:#777}
</style>
</head>
<body>
<main>
  <h1>404 — Page not found</h1>
  <p>The page you are looking for does not exist.</p>
</main>
</body>
</html>`;

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sign in</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f4f4f2;color:#222;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px}
  .card{background:#fff;border:1px solid #e3e3de;border-radius:12px;padding:32px 30px;width:100%;max-width:340px;box-shadow:0 6px 24px rgba(0,0,0,.05)}
  h1{font-size:1.25rem;font-weight:600;margin:0 0 20px}
  label{display:block;font-size:.85rem;font-weight:500;color:#555;margin-bottom:6px}
  input{width:100%;font:inherit;padding:11px 12px;border:1.5px solid #d8d8d2;border-radius:8px;background:#fff;color:#222}
  input:focus{outline:2px solid #9a9a92;outline-offset:1px;border-color:#9a9a92}
  button{width:100%;font:inherit;font-weight:600;margin-top:16px;padding:11px 12px;border:0;border-radius:8px;background:#333;color:#fff;cursor:pointer}
  button:disabled{opacity:.55;cursor:wait}
  .err{display:none;color:#b3261e;font-size:.88rem;margin-top:12px}
</style>
</head>
<body>
<main class="card">
  <h1>Sign in</h1>
  <form id="f">
    <label for="pw">Password</label>
    <input id="pw" type="password" autocomplete="current-password" required>
    <button id="btn" type="submit">Sign in</button>
    <p class="err" id="err"></p>
  </form>
</main>
<script>
  var form = document.getElementById('f');
  var err = document.getElementById('err');
  var btn = document.getElementById('btn');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    err.style.display = 'none';
    btn.disabled = true;
    fetch('/api/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: document.getElementById('pw').value })
    }).then(function (r) {
      if (r.ok) { window.location.reload(); return; }
      btn.disabled = false;
      err.textContent = r.status === 401 ? 'Incorrect password.' : 'Something went wrong. Please try again.';
      err.style.display = 'block';
    }).catch(function () {
      btn.disabled = false;
      err.textContent = 'Something went wrong. Please try again.';
      err.style.display = 'block';
    });
  });
</script>
</body>
</html>`;

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PAHAD Admin</title>
<meta name="robots" content="noindex, nofollow">
<style>
  :root{
    --green:#2B5C45; --green-deep:#1E4634; --green-soft:#EAF1EC;
    --gold:#C49A3A; --gold-soft:#F6EDD8;
    --cream:#FAF6EE; --panel:#FFFDF8; --ink:#22302A; --muted:#6E7D74;
    --border:#E4DCC9; --red:#B4443C; --red-soft:#F9E9E7;
    --shadow:0 8px 28px rgba(30,70,52,.08);
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{font-family:'Outfit',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:var(--cream);color:var(--ink);font-size:15px;line-height:1.5}
  h1,h2,h3,.serif{font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif}
  button{font:inherit;cursor:pointer}
  input,select,textarea{font:inherit;color:var(--ink)}
  a{color:var(--green)}

  /* ---------- top bar ---------- */
  .topbar{position:sticky;top:0;z-index:50;background:var(--panel);border-bottom:1px solid var(--border);box-shadow:0 2px 14px rgba(30,70,52,.05)}
  .topbar-in{max-width:1180px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
  .brand{display:flex;align-items:center;gap:11px;margin-right:auto}
  .leaf-badge{width:38px;height:38px;border-radius:50%;background:var(--green);display:flex;align-items:center;justify-content:center;flex:0 0 auto}
  .leaf-badge svg{width:21px;height:21px}
  .brand-name{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.45rem;font-weight:700;letter-spacing:.04em;color:var(--green-deep);line-height:1}
  .brand-sub{font-size:.68rem;letter-spacing:.22em;text-transform:uppercase;color:var(--gold);font-weight:600;margin-top:2px}
  .pill{display:inline-flex;align-items:center;gap:7px;font-size:.8rem;font-weight:600;padding:6px 12px;border-radius:999px;border:1px solid var(--border);background:var(--cream)}
  .pill .dot{width:8px;height:8px;border-radius:50%;background:#3E9B6B}
  .pill.closed .dot{background:var(--red)}
  .btn{border:1.5px solid var(--green);background:var(--green);color:#fff;font-weight:600;padding:8px 16px;border-radius:10px;font-size:.9rem}
  .btn:hover{background:var(--green-deep)}
  .btn-ghost{background:transparent;color:var(--green)}
  .btn-ghost:hover{background:var(--green-soft);color:var(--green-deep)}
  .btn-gold{background:var(--gold);border-color:var(--gold);color:#fff}
  .btn-gold:hover{background:#AC8530}
  .btn-sm{padding:6px 12px;font-size:.84rem;border-radius:8px}
  .btn:disabled{opacity:.55;cursor:wait}

  .wrap{max-width:1180px;margin:0 auto;padding:22px 20px 60px}

  /* ---------- KPI cards ---------- */
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:14px}
  .kpi{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:16px 18px;box-shadow:var(--shadow)}
  .kpi .k-label{font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:600}
  .kpi .k-value{font-family:'Cormorant Garamond',Georgia,serif;font-size:2rem;font-weight:700;color:var(--green-deep);line-height:1.15;margin-top:2px}
  .status-strip{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px}
  .scount{font-size:.82rem;font-weight:600;padding:5px 12px;border-radius:999px;background:var(--panel);border:1px solid var(--border);color:var(--muted)}
  .scount b{color:var(--green-deep)}

  /* ---------- tabs ---------- */
  .tabs{display:flex;gap:4px;border-bottom:2px solid var(--border);margin-bottom:20px}
  .tab{border:0;background:transparent;padding:10px 18px;font-weight:600;font-size:.98rem;color:var(--muted);border-bottom:3px solid transparent;margin-bottom:-2px}
  .tab.active{color:var(--green-deep);border-bottom-color:var(--gold)}
  .panel{display:none}
  .panel.active{display:block}

  /* ---------- orders toolbar ---------- */
  .toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
  .search{flex:1 1 240px;padding:10px 14px;border:1.5px solid var(--border);border-radius:10px;background:var(--panel)}
  .search:focus{outline:2px solid var(--green);outline-offset:1px}
  .chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
  .chip{border:1.5px solid var(--border);background:var(--panel);color:var(--muted);font-weight:600;font-size:.86rem;padding:6px 14px;border-radius:999px}
  .chip.active{background:var(--green);border-color:var(--green);color:#fff}
  .chip .n{opacity:.75;font-weight:500}

  /* ---------- order cards ---------- */
  .order{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:16px 18px;margin-bottom:12px;box-shadow:var(--shadow)}
  .o-head{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap}
  .o-when{font-weight:600;color:var(--green-deep);white-space:nowrap}
  .o-pay{font-size:.8rem;color:var(--muted);word-break:break-all}
  .o-amount{margin-left:auto;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.5rem;font-weight:700;color:var(--green-deep);white-space:nowrap}
  .o-items{margin:8px 0 4px;font-size:.98rem}
  .o-cust{color:var(--muted);font-size:.92rem}
  .o-cust b{color:var(--ink)}
  .o-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px}
  .o-status{padding:8px 10px;border:1.5px solid var(--green);border-radius:9px;background:var(--cream);font-weight:600;color:var(--green-deep);cursor:pointer}
  .saved{font-size:.82rem;color:#3E9B6B;font-weight:600;opacity:0;transition:opacity .25s}
  .saved.show{opacity:1}
  .wa-btn{display:inline-flex;align-items:center;gap:6px;text-decoration:none;border:1.5px solid #3E9B6B;color:#2C7A52;background:#EFF7F1;font-weight:600;font-size:.86rem;padding:7px 13px;border-radius:9px}
  .wa-btn:hover{background:#E2F1E6}
  .details{display:none;margin-top:14px;border-top:1px dashed var(--border);padding-top:12px;font-size:.92rem}
  .details.open{display:block}
  .details dl{display:grid;grid-template-columns:110px 1fr;gap:5px 14px;margin:0}
  .details dt{color:var(--muted);font-weight:600}
  .details dd{margin:0;word-break:break-word}
  .badge-cancelled{color:var(--red);font-weight:700}

  /* ---------- generic panels / tables ---------- */
  .card{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:22px;box-shadow:var(--shadow);margin-bottom:16px}
  .card h2{margin:0 0 6px;font-size:1.5rem;color:var(--green-deep)}
  .card .hint{color:var(--muted);font-size:.92rem;margin:0 0 16px}
  table{width:100%;border-collapse:collapse;font-size:.94rem}
  th{text-align:left;font-size:.72rem;letter-spacing:.13em;text-transform:uppercase;color:var(--gold);padding:10px 10px;border-bottom:2px solid var(--gold)}
  td{padding:11px 10px;border-bottom:1px solid var(--border);vertical-align:top}
  tr:last-child td{border-bottom:0}
  .table-wrap{overflow-x:auto}
  .field{margin-bottom:16px}
  .field label{display:block;font-weight:600;font-size:.92rem;color:var(--green-deep);margin-bottom:6px}
  .field input[type="text"],.field textarea{width:100%;padding:11px 13px;border:1.5px solid var(--border);border-radius:10px;background:var(--cream)}
  .field input[type="text"]:focus,.field textarea:focus{outline:2px solid var(--green);outline-offset:1px}
  .toggle-row{display:flex;gap:12px;align-items:flex-start;cursor:pointer}
  .toggle-row input{width:20px;height:20px;margin-top:2px;accent-color:var(--green);flex:0 0 auto;cursor:pointer}
  .conn-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)}
  .conn-row:last-child{border-bottom:0}
  .conn-name{font-weight:600}
  .conn-state{margin-left:auto;font-size:.82rem;font-weight:700;padding:4px 11px;border-radius:999px}
  .conn-on{background:var(--green-soft);color:var(--green-deep)}
  .conn-off{background:var(--red-soft);color:var(--red)}

  .notice{background:var(--gold-soft);border:1px solid var(--gold);border-radius:12px;padding:13px 16px;margin-bottom:16px;font-size:.95rem}
  .error-box{background:var(--red-soft);border:1px solid var(--red);border-radius:12px;padding:13px 16px;margin-bottom:16px}
  .empty{color:var(--muted);text-align:center;padding:34px 10px;font-size:1rem}
  .loading{color:var(--muted);text-align:center;padding:40px 10px}
  .toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(20px);background:var(--green-deep);color:#fff;font-weight:600;padding:11px 20px;border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.25);opacity:0;pointer-events:none;transition:all .3s;z-index:99}
  .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
  @media(max-width:640px){
    .o-amount{margin-left:0}
    .details dl{grid-template-columns:88px 1fr}
    .topbar-in{padding:10px 14px}
    .wrap{padding:16px 14px 50px}
  }
</style>
</head>
<body>
<header class="topbar">
  <div class="topbar-in">
    <div class="brand">
      <span class="leaf-badge" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="#F3E9CF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c-4.5-1.6-7-4.8-7-9.2C5 7.4 7.6 4.6 12 3c4.4 1.6 7 4.4 7 8.8 0 4.4-2.5 7.6-7 9.2Z"/><path d="M12 21c0-5.5 0-10.5 0-15"/><path d="M12 12c-1.8-.4-3-1.4-3.8-3M12 9c1.6-.5 2.6-1.5 3.2-3"/></svg>
      </span>
      <span>
        <span class="brand-name">PAHAD Admin</span>
        <span class="brand-sub" style="display:block">Orders &amp; Store</span>
      </span>
    </div>
    <span class="pill" id="storePill"><span class="dot"></span><span id="storePillText">Store …</span></span>
    <button class="btn btn-ghost btn-sm" id="refreshBtn" type="button">Refresh</button>
    <button class="btn btn-sm" id="logoutBtn" type="button">Logout</button>
  </div>
</header>

<div class="wrap">
  <div id="alertArea"></div>

  <section class="kpis" id="kpis">
    <div class="kpi"><div class="k-label">Today's orders</div><div class="k-value" id="kTodayCount">—</div></div>
    <div class="kpi"><div class="k-label">Today's revenue</div><div class="k-value" id="kTodayRevenue">—</div></div>
    <div class="kpi"><div class="k-label">Total orders</div><div class="k-value" id="kTotalCount">—</div></div>
    <div class="kpi"><div class="k-label">Total revenue</div><div class="k-value" id="kTotalRevenue">—</div></div>
  </section>
  <div class="status-strip" id="statusStrip"></div>

  <nav class="tabs">
    <button class="tab active" data-tab="orders" type="button">Orders</button>
    <button class="tab" data-tab="customers" type="button">Customers</button>
    <button class="tab" data-tab="settings" type="button">Settings</button>
  </nav>

  <!-- ORDERS -->
  <section class="panel active" id="panel-orders">
    <div class="toolbar">
      <input class="search" id="searchBox" type="search" placeholder="Search name, phone or payment ID…">
      <button class="btn btn-gold btn-sm" id="csvBtn" type="button">Export CSV</button>
    </div>
    <div class="chips" id="statusChips"></div>
    <div id="ordersArea"><div class="loading">Loading orders…</div></div>
  </section>

  <!-- CUSTOMERS -->
  <section class="panel" id="panel-customers">
    <div class="card">
      <h2>Customers</h2>
      <p class="hint">Everyone who has ordered, grouped by phone number — built from the loaded orders.</p>
      <div class="table-wrap" id="customersArea"><div class="loading">Loading…</div></div>
    </div>
  </section>

  <!-- SETTINGS -->
  <section class="panel" id="panel-settings">
    <div class="card">
      <h2>Store settings</h2>
      <p class="hint">These apply to the live website as soon as you save.</p>
      <form id="settingsForm">
        <div class="field">
          <label for="announcementInput">Announcement bar text</label>
          <input type="text" id="announcementInput" maxlength="300">
        </div>
        <div class="field">
          <label class="toggle-row">
            <input type="checkbox" id="storeOpenInput">
            <span><b>Store open</b><br><span style="color:var(--muted)">When off, the site shows “not accepting orders” and ordering buttons are disabled.</span></span>
          </label>
        </div>
        <button class="btn" type="submit" id="settingsSaveBtn">Save settings</button>
        <span class="saved" id="settingsSaved" style="margin-left:10px">Saved</span>
      </form>
    </div>
    <div class="card">
      <h2>Connections</h2>
      <p class="hint">Which integrations this website is wired to. Managed by the site owner in the hosting settings — this view is read-only.</p>
      <div id="connectionsArea"><div class="loading">Loading…</div></div>
    </div>
  </section>
</div>

<div class="toast" id="toast"></div>
<script>
(function () {
  var STATUSES = ['New', 'Packed', 'Shipped', 'Delivered', 'Cancelled'];
  var state = {
    orders: [], stats: null, connections: null, configured: true,
    settings: null, filter: 'All', query: '', expanded: {}
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function inr(paise) {
    if (typeof paise !== 'number') return '₹—';
    return '₹' + (paise / 100).toLocaleString('en-IN', {
      minimumFractionDigits: paise % 100 === 0 ? 0 : 2, maximumFractionDigits: 2
    });
  }
  function fmtDT(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }
  function fmtD(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
  }
  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast show';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 2600);
  }
  function waLink(o) {
    var digits = String(o.customer_phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10) digits = '91' + digits;
    else if (digits.length === 11 && digits.charAt(0) === '0') digits = '91' + digits.slice(1);
    var msg = 'Namaste ' + (o.customer_name || '') + ', this is PAHAD Organics. Update on your order (' +
      (o.items || '') + '): it is now ' + (o.status || '') + '. Payment ID: ' + (o.payment_id || '') + '. Dhanyavaad!';
    return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(msg);
  }

  /* ------------------------------ loading ------------------------------ */
  function loadAll() {
    $('ordersArea').innerHTML = '<div class="loading">Loading orders…</div>';
    var p1 = fetch('/api/admin-orders').then(function (r) {
      if (r.status === 401) { window.location.reload(); throw new Error('auth'); }
      return r.json();
    });
    var p2 = fetch('/api/admin-settings').then(function (r) {
      return r.ok ? r.json() : null;
    }).catch(function () { return null; });
    return Promise.all([p1, p2]).then(function (res) {
      var data = res[0] || {};
      if (data.configured === false) {
        state.configured = false;
        state.orders = []; state.stats = null; state.connections = null;
      } else {
        state.configured = true;
        state.orders = Array.isArray(data.orders) ? data.orders : [];
        state.stats = data.stats || null;
        state.connections = (data.configured && typeof data.configured === 'object') ? data.configured : null;
      }
      if (res[1] && res[1].settings) state.settings = res[1].settings;
      renderAll();
    }).catch(function (err) {
      if (err && err.message === 'auth') return;
      $('alertArea').innerHTML = '<div class="error-box">Could not load the dashboard data. Check your connection and refresh.</div>';
      $('ordersArea').innerHTML = '<div class="empty">Nothing to show right now.</div>';
    });
  }
  function quietRefreshStats() {
    fetch('/api/admin-orders').then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
      if (!data || data.configured === false) return;
      state.orders = Array.isArray(data.orders) ? data.orders : state.orders;
      state.stats = data.stats || state.stats;
      state.connections = (data.configured && typeof data.configured === 'object') ? data.configured : state.connections;
      renderKpis(); renderStrip(); renderChips(); renderCustomers(); renderConnections();
    }).catch(function () { /* keep current UI */ });
  }

  /* ------------------------------ rendering ------------------------------ */
  function renderAll() {
    renderAlert(); renderKpis(); renderStrip(); renderChips();
    renderOrders(); renderCustomers(); renderSettings(); renderConnections();
  }
  function renderAlert() {
    $('alertArea').innerHTML = state.configured ? '' :
      '<div class="notice"><b>Database not connected yet.</b> The dashboard switches fully on when the site owner adds the database keys in the hosting settings. Until then, orders still appear in the Razorpay dashboard.</div>';
  }
  function renderKpis() {
    var s = state.stats;
    $('kTodayCount').textContent = s ? String(s.today_count) : '—';
    $('kTodayRevenue').textContent = s ? inr(s.today_revenue) : '—';
    $('kTotalCount').textContent = s ? String(s.total_count) : '—';
    $('kTotalRevenue').textContent = s ? inr(s.total_revenue) : '—';
  }
  function statusCounts() {
    var counts = { All: state.orders.length };
    STATUSES.forEach(function (s) { counts[s] = 0; });
    state.orders.forEach(function (o) { if (counts[o.status] !== undefined) counts[o.status] += 1; });
    return counts;
  }
  function renderStrip() {
    var counts = statusCounts();
    var html = '';
    STATUSES.forEach(function (s) {
      html += '<span class="scount">' + s + ' <b>' + counts[s] + '</b></span>';
    });
    $('statusStrip').innerHTML = html;
  }
  function renderChips() {
    var counts = statusCounts();
    var names = ['All'].concat(STATUSES);
    var html = '';
    names.forEach(function (n) {
      html += '<button type="button" class="chip' + (state.filter === n ? ' active' : '') + '" data-chip="' + n + '">' +
        n + ' <span class="n">' + counts[n] + '</span></button>';
    });
    $('statusChips').innerHTML = html;
  }
  function visibleOrders() {
    var q = state.query.trim().toLowerCase();
    return state.orders.filter(function (o) {
      if (state.filter !== 'All' && o.status !== state.filter) return false;
      if (!q) return true;
      var hay = ((o.customer_name || '') + ' ' + (o.customer_phone || '') + ' ' + (o.payment_id || '')).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }
  function orderCard(o) {
    var sel = '<select class="o-status" data-status-for="' + esc(o.payment_id) + '">';
    STATUSES.forEach(function (s) {
      sel += '<option value="' + s + '"' + (o.status === s ? ' selected' : '') + '>' + s + '</option>';
    });
    sel += '</select>';
    var wa = waLink(o);
    var open = state.expanded[o.payment_id] ? ' open' : '';
    return '<article class="order">'
      + '<div class="o-head"><div><div class="o-when">' + esc(fmtDT(o.created_at)) + '</div>'
      + '<div class="o-pay">' + esc(o.payment_id) + '</div></div>'
      + '<div class="o-amount">' + esc(inr(o.amount)) + '</div></div>'
      + '<p class="o-items">' + esc(o.items || '') + '</p>'
      + '<p class="o-cust"><b>' + esc(o.customer_name || '—') + '</b>' + (o.customer_phone ? ' · ' + esc(o.customer_phone) : '') + '</p>'
      + '<div class="o-actions">' + sel
      + '<span class="saved" data-saved-for="' + esc(o.payment_id) + '">Saved</span>'
      + '<button class="btn btn-ghost btn-sm" type="button" data-details="' + esc(o.payment_id) + '">' + (state.expanded[o.payment_id] ? 'Hide details' : 'Details') + '</button>'
      + (wa ? '<a class="wa-btn" target="_blank" rel="noopener" href="' + esc(wa) + '">WhatsApp customer</a>' : '')
      + '</div>'
      + '<div class="details' + open + '"><dl>'
      + '<dt>Address</dt><dd>' + esc(o.address || '—') + (o.pincode ? ' — ' + esc(o.pincode) : '') + '</dd>'
      + '<dt>Email</dt><dd>' + esc(o.customer_email || '—') + '</dd>'
      + '<dt>Phone</dt><dd>' + esc(o.customer_phone || '—') + '</dd>'
      + '<dt>Order ID</dt><dd>' + esc(o.order_id || '—') + '</dd>'
      + '<dt>Source</dt><dd>' + esc(o.source || '—') + '</dd>'
      + '<dt>Placed</dt><dd>' + esc(fmtDT(o.created_at)) + '</dd>'
      + '<dt>Updated</dt><dd>' + esc(fmtDT(o.updated_at)) + '</dd>'
      + '</dl></div></article>';
  }
  function renderOrders() {
    var area = $('ordersArea');
    if (!state.configured) {
      area.innerHTML = '<div class="empty">Orders will appear here once the database is connected.</div>';
      return;
    }
    if (!state.orders.length) {
      area.innerHTML = '<div class="empty">No orders yet — the first paid order will land here automatically.</div>';
      return;
    }
    var list = visibleOrders();
    if (!list.length) {
      area.innerHTML = '<div class="empty">No orders match this search or filter.</div>';
      return;
    }
    area.innerHTML = list.map(orderCard).join('');
  }
  function renderCustomers() {
    var area = $('customersArea');
    if (!state.configured) {
      area.innerHTML = '<div class="empty">Connect the database to see customers.</div>';
      return;
    }
    var byPhone = {};
    state.orders.forEach(function (o) {
      var phone = String(o.customer_phone || '').replace(/\s+/g, '');
      if (!phone) return;
      var c = byPhone[phone];
      if (!c) { c = byPhone[phone] = { name: '', phone: phone, email: '', count: 0, spent: 0, last: '' }; }
      c.count += 1;
      if (o.status !== 'Cancelled' && typeof o.amount === 'number') c.spent += o.amount;
      if (!c.last || (o.created_at && o.created_at > c.last)) {
        c.last = o.created_at || c.last;
        c.name = o.customer_name || c.name;
        c.email = o.customer_email || c.email;
      }
    });
    var list = Object.keys(byPhone).map(function (k) { return byPhone[k]; });
    list.sort(function (a, b) {
      if ((a.last || '') === (b.last || '')) return 0;
      return (a.last || '') < (b.last || '') ? 1 : -1;
    });
    if (!list.length) {
      area.innerHTML = '<div class="empty">No customers yet — they will appear here after the first orders.</div>';
      return;
    }
    var html = '<table><thead><tr><th>Customer</th><th>Phone</th><th>Email</th><th>Orders</th><th>Total spent</th><th>Last order</th></tr></thead><tbody>';
    list.forEach(function (c) {
      html += '<tr><td><b>' + esc(c.name || '—') + '</b></td><td>' + esc(c.phone) + '</td><td>' +
        esc(c.email || '—') + '</td><td>' + c.count + '</td><td>' + esc(inr(c.spent)) + '</td><td>' +
        esc(fmtD(c.last)) + '</td></tr>';
    });
    area.innerHTML = html + '</tbody></table>';
  }
  function renderSettings() {
    var open = !state.settings || state.settings.store_open !== 'false';
    var pill = $('storePill');
    pill.className = 'pill' + (open ? '' : ' closed');
    $('storePillText').textContent = open ? 'Store Open' : 'Store Closed';
    if (state.settings) {
      $('announcementInput').value = state.settings.announcement || '';
      $('storeOpenInput').checked = open;
    }
  }
  function renderConnections() {
    var area = $('connectionsArea');
    if (!state.configured || !state.connections) {
      area.innerHTML = '<p class="hint" style="margin:0">Connection status is available once the database is connected.</p>';
      return;
    }
    var rows = [
      ['Razorpay (payments)', state.connections.razorpay],
      ['Supabase (database)', state.connections.supabase],
      ['Resend (order emails)', state.connections.resend]
    ];
    area.innerHTML = rows.map(function (r) {
      return '<div class="conn-row"><span class="conn-name">' + esc(r[0]) + '</span>' +
        '<span class="conn-state ' + (r[1] ? 'conn-on' : 'conn-off') + '">' + (r[1] ? 'Connected' : 'Not connected') + '</span></div>';
    }).join('');
  }

  /* ------------------------------ events ------------------------------ */
  var tabs = document.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function () {
      var name = this.getAttribute('data-tab');
      for (var j = 0; j < tabs.length; j++) tabs[j].className = 'tab' + (tabs[j] === this ? ' active' : '');
      var panels = document.querySelectorAll('.panel');
      for (var k = 0; k < panels.length; k++) {
        panels[k].className = 'panel' + (panels[k].id === 'panel-' + name ? ' active' : '');
      }
    });
  }

  document.addEventListener('click', function (e) {
    var chip = e.target.closest ? e.target.closest('[data-chip]') : null;
    if (chip) {
      state.filter = chip.getAttribute('data-chip');
      renderChips(); renderOrders();
      return;
    }
    var det = e.target.closest ? e.target.closest('[data-details]') : null;
    if (det) {
      var pid = det.getAttribute('data-details');
      state.expanded[pid] = !state.expanded[pid];
      renderOrders();
    }
  });

  $('searchBox').addEventListener('input', function () {
    state.query = this.value;
    renderOrders();
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.classList || !t.classList.contains('o-status')) return;
    var pid = t.getAttribute('data-status-for');
    var status = t.value;
    t.disabled = true;
    fetch('/api/admin-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_id: pid, status: status })
    }).then(function (r) {
      if (r.status === 401) { window.location.reload(); throw new Error('auth'); }
      return r.json();
    }).then(function (data) {
      t.disabled = false;
      if (data && data.ok) {
        state.orders.forEach(function (o) { if (o.payment_id === pid) o.status = status; });
        var saved = document.querySelectorAll('.saved');
        for (var i = 0; i < saved.length; i++) {
          if (saved[i].getAttribute('data-saved-for') === pid) {
            saved[i].className = 'saved show';
            (function (el) { setTimeout(function () { el.className = 'saved'; }, 2200); })(saved[i]);
          }
        }
        renderStrip(); renderChips();
        toast('Order marked ' + status);
        quietRefreshStats();
      } else {
        toast('Could not save that change.');
        loadAll();
      }
    }).catch(function (err) {
      t.disabled = false;
      if (err && err.message === 'auth') return;
      toast('Could not save that change.');
    });
  });

  $('refreshBtn').addEventListener('click', function () { loadAll(); });

  $('logoutBtn').addEventListener('click', function () {
    fetch('/api/admin-logout', { method: 'POST' }).then(function () {
      window.location.reload();
    }).catch(function () { window.location.reload(); });
  });

  $('csvBtn').addEventListener('click', function () {
    if (!state.orders.length) { toast('No orders to export yet.'); return; }
    var rows = [['Date', 'Payment ID', 'Order ID', 'Items', 'Amount (INR)', 'Status', 'Customer', 'Phone', 'Email', 'Address', 'Pincode', 'Source']];
    state.orders.forEach(function (o) {
      rows.push([
        fmtDT(o.created_at), o.payment_id || '', o.order_id || '', o.items || '',
        typeof o.amount === 'number' ? (o.amount / 100).toFixed(2) : '',
        o.status || '', o.customer_name || '', o.customer_phone || '', o.customer_email || '',
        o.address || '', o.pincode || '', o.source || ''
      ]);
    });
    var csv = rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'pahad-orders.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  });

  $('settingsForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('settingsSaveBtn');
    btn.disabled = true;
    fetch('/api/admin-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        announcement: $('announcementInput').value,
        store_open: $('storeOpenInput').checked
      })
    }).then(function (r) {
      if (r.status === 401) { window.location.reload(); throw new Error('auth'); }
      return r.json();
    }).then(function (data) {
      btn.disabled = false;
      if (data && data.ok) {
        if (data.settings) state.settings = data.settings;
        renderSettings();
        var sv = $('settingsSaved');
        sv.className = 'saved show';
        setTimeout(function () { sv.className = 'saved'; }, 2200);
        toast('Settings saved');
      } else if (data && data.configured === false) {
        toast('Database not connected — settings cannot be saved yet.');
      } else {
        toast('Could not save settings.');
      }
    }).catch(function (err) {
      btn.disabled = false;
      if (err && err.message === 'auth') return;
      toast('Could not save settings.');
    });
  });

  loadAll();
})();
</script>
</body>
</html>`;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!process.env.ADMIN_PASSWORD) {
    res.status(404).send(NOT_FOUND_HTML);
    return;
  }
  if (!isAdmin(req)) {
    res.status(200).send(LOGIN_HTML);
    return;
  }
  res.status(200).send(DASHBOARD_HTML);
};
