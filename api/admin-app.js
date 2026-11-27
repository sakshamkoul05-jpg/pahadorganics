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
//     document (inline CSS + vanilla JS, no external assets), styled
//     like a Seller-Central console: dark sidebar, dense data tables,
//     KPI cards, and a Settings → System Health card fed by
//     /api/admin-health so a broken setup explains itself. The HTML
//     carries zero order data — everything is fetched client-side
//     from the cookie-gated /api/admin-orders and /api/admin-settings.
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
    --sb-bg:#152A20; --sb-text:#B9C8BE; --sb-dim:#7E9384;
    --page:#EAEDED; --card:#FFFFFF; --line:#D5D9D9; --line-soft:#E3E6E6;
    --ink:#0F1111; --muted:#565959; --hdr:#F0F2F2;
    --green:#2B5C45; --green-deep:#214835; --gold:#C49A3A;
    --shadow:0 1px 2px rgba(15,17,17,.08);
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:var(--page);color:var(--ink);font-size:14px;line-height:1.45}
  button{font:inherit;cursor:pointer}
  input,select,textarea{font:inherit;color:var(--ink)}
  a{color:var(--green)}

  .layout{display:flex;min-height:100vh}

  /* ---------- sidebar ---------- */
  .sidebar{width:230px;flex:0 0 230px;background:var(--sb-bg);color:var(--sb-text);position:fixed;top:0;bottom:0;left:0;display:flex;flex-direction:column;z-index:60}
  .side-brand{display:flex;gap:11px;align-items:center;padding:18px 18px 15px;border-bottom:1px solid rgba(255,255,255,.08)}
  .leaf-badge{width:38px;height:38px;border-radius:9px;background:rgba(196,154,58,.16);display:flex;align-items:center;justify-content:center;flex:0 0 auto}
  .leaf-badge svg{width:22px;height:22px}
  .sb-name{color:#fff;font-size:1.06rem;font-weight:700;letter-spacing:.02em;line-height:1.15}
  .sb-sub{font-size:.68rem;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);font-weight:600;margin-top:2px}
  .side-nav{padding:10px 0;flex:1;overflow-y:auto}
  .nav-label{font-size:.64rem;letter-spacing:.18em;text-transform:uppercase;color:var(--sb-dim);padding:12px 20px 5px;font-weight:700}
  .nav-item{display:flex;align-items:center;gap:11px;width:100%;padding:10px 20px 10px 17px;background:none;border:0;border-left:3px solid transparent;color:var(--sb-text);font-size:.93rem;font-weight:500;text-align:left}
  .nav-item svg{width:18px;height:18px;flex:0 0 auto;opacity:.85}
  .nav-item:hover{background:rgba(255,255,255,.05);color:#fff}
  .nav-item.active{background:rgba(255,255,255,.09);border-left-color:var(--gold);color:#fff}
  .nav-badge{margin-left:auto;background:var(--gold);color:#20180a;font-size:.72rem;font-weight:700;border-radius:999px;padding:1px 8px;line-height:1.5}
  .side-foot{padding:14px 18px 16px;border-top:1px solid rgba(255,255,255,.08)}
  .store-pill{display:flex;align-items:center;gap:8px;font-size:.86rem;font-weight:600;color:#fff;margin-bottom:11px}
  .store-pill .dot{width:9px;height:9px;border-radius:50%;background:#4CAF7D;flex:0 0 auto}
  .store-pill.closed .dot{background:#E05B4B}
  .store-pill .sp-sub{display:block;font-size:.72rem;color:var(--sb-dim);font-weight:500}
  .logout-btn{width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);color:#fff;padding:8px;border-radius:6px;font-weight:600;font-size:.88rem}
  .logout-btn:hover{background:rgba(255,255,255,.13)}

  /* ---------- main / topbar ---------- */
  .main{flex:1;margin-left:230px;min-width:0;display:flex;flex-direction:column}
  .topbar{position:sticky;top:0;z-index:50;background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:14px;padding:11px 24px;flex-wrap:wrap}
  .topbar h1{font-size:1.28rem;font-weight:600;margin:0}
  .global-search{margin-left:auto;display:flex;align-items:center;gap:8px;background:var(--hdr);border:1px solid var(--line);border-radius:6px;padding:0 11px;flex:0 1 400px}
  .global-search svg{width:16px;height:16px;color:var(--muted);flex:0 0 auto}
  .global-search input{border:0;background:transparent;padding:9px 0;width:100%;font-size:.92rem}
  .global-search input:focus{outline:none}
  .global-search:focus-within{border-color:var(--green);background:#fff;box-shadow:0 0 0 2px rgba(43,92,69,.16)}
  .content{padding:20px 24px 56px;width:100%;max-width:1280px;margin:0 auto}

  .btn{font-weight:600;font-size:.88rem;padding:8px 16px;border-radius:6px;border:1px solid var(--line);background:#fff;color:var(--ink);box-shadow:var(--shadow)}
  .btn:hover{background:#F7FAFA}
  .btn-primary{background:var(--green);border-color:var(--green);color:#fff}
  .btn-primary:hover{background:var(--green-deep)}
  .btn:disabled{opacity:.55;cursor:wait}
  .icon-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:6px;border:1px solid var(--line);background:#fff;color:var(--muted);padding:0}
  .icon-btn:hover{background:#F7FAFA;color:var(--ink)}
  .icon-btn svg{width:16px;height:16px}
  .icon-btn.open{color:var(--green);border-color:var(--green)}
  .wa-btn{color:#1F7A43;border-color:#BFE3CC;background:#F0FAF3;text-decoration:none}
  .wa-btn:hover{background:#E2F5E9;color:#14532D}

  .view{display:none}
  .view.active{display:block}

  /* ---------- cards & KPIs ---------- */
  .card{background:var(--card);border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow);padding:18px 20px;margin-bottom:16px}
  .card h2{font-size:1rem;font-weight:600;margin:0 0 4px}
  .card .hint{color:var(--muted);font-size:.87rem;margin:0 0 14px}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:16px}
  .kpi{background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow);padding:16px 18px}
  .kpi .k-label{font-size:.72rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
  .kpi .k-value{font-size:1.8rem;font-weight:700;line-height:1.15;margin-top:4px}
  .kpi .k-sub{font-size:.8rem;color:var(--muted);margin-top:2px}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .grid-2 .card{margin-bottom:16px}
  .attn-flex{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
  .attn-num{font-size:2.1rem;font-weight:700;line-height:1;color:#9A6A00}
  .attn-num.zero{color:var(--green)}
  .attn-text{color:var(--muted);font-size:.9rem;margin-top:4px}
  .attn-flex .btn{margin-left:auto}
  .bs-row{display:flex;align-items:center;gap:12px;padding:7px 0;border-bottom:1px solid var(--line-soft)}
  .bs-row:last-child{border-bottom:0}
  .bs-name{width:86px;font-weight:600;font-size:.88rem;flex:0 0 auto}
  .bs-bar{flex:1;height:8px;background:#EEF1F1;border-radius:99px;overflow:hidden}
  .bs-fill{height:100%;border-radius:99px}
  .bs-count{width:34px;text-align:right;font-weight:700;flex:0 0 auto}
  .view-all{margin-top:12px}

  /* ---------- tables ---------- */
  .tbl-wrap{overflow-x:auto;margin:0 -20px;padding:0 20px}
  table.tbl{width:100%;border-collapse:collapse;font-size:.9rem;min-width:780px}
  .tbl th{background:var(--hdr);text-align:left;font-size:.7rem;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);font-weight:700;padding:9px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
  .tbl td{padding:10px 12px;border-bottom:1px solid var(--line-soft);vertical-align:middle}
  .tbl tbody tr.ord-row:hover{background:#F7FAFA}
  .tbl .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:600}
  .tbl th.num{text-align:right}
  .pay-id{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:.79rem;color:#374151;word-break:break-all;max-width:170px}
  .items-cell{max-width:250px;color:#1F2937}
  .cust-name{font-weight:600;white-space:nowrap}
  .cust-phone{color:var(--muted);font-size:.82rem}
  .date-cell{white-space:nowrap;color:#374151}
  .detail-row td{background:#FAFBFB;padding:16px 20px}
  .detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px 30px;font-size:.88rem}
  .detail-grid .dk{display:block;color:var(--muted);font-size:.68rem;text-transform:uppercase;letter-spacing:.07em;font-weight:700;margin-bottom:2px}
  .detail-grid .dv{word-break:break-word}
  .status-pill{display:inline-block;border-radius:999px;padding:4px 12px;font-weight:600;font-size:.8rem;white-space:nowrap}
  .status-select{appearance:none;-webkit-appearance:none;border:0;border-radius:999px;padding:5px 26px 5px 12px;font-weight:600;font-size:.82rem;cursor:pointer;max-width:150px;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' fill='none' stroke='%23555' stroke-width='1.6' stroke-linecap='round'/></svg>");background-repeat:no-repeat;background-position:right 9px center}
  .status-select:disabled{opacity:.55;cursor:wait}
  .st-New{background-color:#FFF3CD;color:#7A5A00}
  .st-Packed{background-color:#E8DAEF;color:#5B2C6F}
  .st-Shipped{background-color:#D6EAF8;color:#1A5276}
  .st-Delivered{background-color:#D5F5E3;color:#145A32}
  .st-Cancelled{background-color:#FADBD8;color:#7B241C}
  .row-actions{display:flex;gap:6px;align-items:center}

  /* ---------- orders toolbar ---------- */
  .toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px}
  .chip{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 14px;font-size:.85rem;font-weight:600;color:#333}
  .chip:hover{background:#F7FAFA}
  .chip.active{background:var(--green);border-color:var(--green);color:#fff}
  .chip .n{opacity:.7;font-weight:500}
  .result-count{margin-left:auto;color:var(--muted);font-size:.87rem;white-space:nowrap}

  /* ---------- banners / states ---------- */
  .banner{border-radius:8px;padding:13px 16px;margin-bottom:16px;font-size:.92rem;border:1px solid}
  .banner-warn{background:#FFF8E1;border-color:#E3C565;color:#5D4A00}
  .banner-error{background:#FDECEA;border-color:#E5A19B;color:#6E1F18}
  .empty{text-align:center;color:var(--muted);padding:38px 12px;font-size:.95rem}
  .empty b{display:block;color:var(--ink);font-size:1.02rem;margin-bottom:4px}
  .skel{background:#fff;border:1px solid var(--line);border-radius:8px;padding:18px 20px;margin-bottom:14px}
  .skel-bar{height:14px;border-radius:4px;margin-bottom:12px;background:linear-gradient(90deg,#ECEFF1 25%,#F6F8F8 50%,#ECEFF1 75%);background-size:200% 100%;animation:shimmer 1.15s infinite}
  .skel-bar:last-child{margin-bottom:0}
  @keyframes shimmer{to{background-position:-200% 0}}
  .toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(20px);background:#232F3E;color:#fff;font-weight:600;font-size:.9rem;padding:11px 22px;border-radius:6px;box-shadow:0 10px 30px rgba(0,0,0,.3);opacity:0;pointer-events:none;transition:all .3s;z-index:99}
  .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}

  /* ---------- settings / health ---------- */
  .field{margin-bottom:16px}
  .field label{display:block;font-weight:600;font-size:.9rem;margin-bottom:6px}
  .field input[type="text"]{width:100%;padding:9px 12px;border:1px solid #A6A6A6;border-radius:6px;background:#fff}
  .field input[type="text"]:focus{outline:none;border-color:var(--green);box-shadow:0 0 0 2px rgba(43,92,69,.16)}
  .toggle-row{display:flex;gap:12px;align-items:flex-start;cursor:pointer;font-weight:400}
  .toggle-row input{width:19px;height:19px;margin-top:1px;accent-color:var(--green);flex:0 0 auto;cursor:pointer}
  .saved{font-size:.84rem;color:#2E7D32;font-weight:600;opacity:0;transition:opacity .25s;margin-left:10px}
  .saved.show{opacity:1}
  .health-row{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--line-soft)}
  .health-row:last-child{border-bottom:0}
  .h-ico{width:22px;height:22px;border-radius:50%;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:.78rem;font-weight:700;color:#fff;margin-top:1px}
  .h-ok{background:#2E7D32}
  .h-bad{background:#C62828}
  .h-name{font-weight:600}
  .h-status{color:var(--muted);font-size:.87rem}
  .health-head{display:flex;align-items:center;gap:10px}
  .health-head .btn{margin-left:auto}

  @media(max-width:900px){
    .layout{flex-direction:column}
    .sidebar{position:static;width:100%;flex:none}
    .side-nav{display:flex;overflow-x:auto;padding:6px 8px;align-items:center}
    .nav-label{display:none}
    .nav-item{border-left:0;border-bottom:3px solid transparent;white-space:nowrap;padding:9px 13px;border-radius:6px}
    .nav-item.active{border-bottom-color:var(--gold)}
    .nav-badge{margin-left:6px}
    .side-foot{display:flex;align-items:center;gap:16px;padding:10px 16px 14px}
    .store-pill{margin:0}
    .logout-btn{width:auto;padding:7px 18px;margin-left:auto}
    .main{margin-left:0}
    .grid-2{grid-template-columns:1fr}
    .content{padding:16px 14px 48px}
    .topbar{padding:10px 14px}
    .global-search{flex:1 1 100%;margin-left:0;order:3}
    .attn-flex .btn{margin-left:0}
  }
</style>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="side-brand">
      <span class="leaf-badge" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="#C49A3A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c-4.5-1.6-7-4.8-7-9.2C5 7.4 7.6 4.6 12 3c4.4 1.6 7 4.4 7 8.8 0 4.4-2.5 7.6-7 9.2Z"/><path d="M12 21c0-5.5 0-10.5 0-15"/><path d="M12 12c-1.8-.4-3-1.4-3.8-3M12 9c1.6-.5 2.6-1.5 3.2-3"/></svg>
      </span>
      <span>
        <span class="sb-name">PAHAD Admin</span>
        <span class="sb-sub" style="display:block">Seller Console</span>
      </span>
    </div>
    <nav class="side-nav">
      <div class="nav-label">Manage</div>
      <button class="nav-item active" data-nav="dashboard" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"/></svg>
        Dashboard
      </button>
      <button class="nav-item" data-nav="orders" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5L12 12l8.5-4.5"/><path d="M12 12v9"/></svg>
        Orders
        <span class="nav-badge" id="navNewBadge" hidden>0</span>
      </button>
      <button class="nav-item" data-nav="customers" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.2c.6-3.1 2.8-4.7 5.5-4.7s4.9 1.6 5.5 4.7"/><path d="M15.8 5.3a3.2 3.2 0 010 5.8M17.6 14.9c1.6.7 2.6 2 2.9 4.1"/></svg>
        Customers
      </button>
      <button class="nav-item" data-nav="settings" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="3.1"/><path d="M12 3v2.6M12 18.4V21M3 12h2.6M18.4 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/></svg>
        Settings
      </button>
    </nav>
    <div class="side-foot">
      <div class="store-pill" id="storePill"><span class="dot"></span><span><span id="storePillText">Store …</span><span class="sp-sub">Live website status</span></span></div>
      <button class="logout-btn" id="logoutBtn" type="button">Logout</button>
    </div>
  </aside>

  <div class="main">
    <header class="topbar">
      <h1 id="sectionTitle">Dashboard</h1>
      <div class="global-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20.5 20.5L16.6 16.6"/></svg>
        <input id="globalSearch" type="search" placeholder="Search orders — name, phone, payment ID">
      </div>
      <button class="btn" id="refreshBtn" type="button">Refresh</button>
    </header>

    <div class="content">
      <div id="alertArea"></div>

      <!-- DASHBOARD -->
      <section class="view active" id="view-dashboard">
        <div class="kpis">
          <div class="kpi"><div class="k-label">Today's Orders</div><div class="k-value" id="kTodayCount">—</div><div class="k-sub">Placed today (IST)</div></div>
          <div class="kpi"><div class="k-label">Today's Revenue</div><div class="k-value" id="kTodayRevenue">—</div><div class="k-sub">Excluding cancelled</div></div>
          <div class="kpi"><div class="k-label">Total Orders</div><div class="k-value" id="kTotalCount">—</div><div class="k-sub">All time, loaded orders</div></div>
          <div class="kpi"><div class="k-label">Total Revenue</div><div class="k-value" id="kTotalRevenue">—</div><div class="k-sub">Excluding cancelled</div></div>
        </div>
        <div class="grid-2">
          <div class="card">
            <h2>Needs attention</h2>
            <p class="hint">New orders waiting to be packed.</p>
            <div id="attentionArea"><div class="skel-bar" style="width:55%"></div><div class="skel-bar" style="width:35%"></div></div>
          </div>
          <div class="card">
            <h2>Orders by status</h2>
            <p class="hint">Where every loaded order currently sits.</p>
            <div id="byStatusArea"><div class="skel-bar" style="width:80%"></div><div class="skel-bar" style="width:65%"></div><div class="skel-bar" style="width:45%"></div></div>
          </div>
        </div>
        <div class="card">
          <h2>Recent orders</h2>
          <p class="hint">The latest 8 orders across all statuses.</p>
          <div id="recentArea"><div class="skel-bar" style="width:92%"></div><div class="skel-bar" style="width:84%"></div><div class="skel-bar" style="width:76%"></div></div>
        </div>
      </section>

      <!-- ORDERS -->
      <section class="view" id="view-orders">
        <div class="card">
          <div class="toolbar" id="ordersToolbar">
            <span id="statusChips" style="display:contents"></span>
            <span class="result-count" id="resultCount"></span>
            <button class="btn" id="csvBtn" type="button">Export CSV</button>
          </div>
          <div id="ordersArea">
            <div class="skel-bar" style="width:94%"></div><div class="skel-bar" style="width:88%"></div><div class="skel-bar" style="width:90%"></div><div class="skel-bar" style="width:70%"></div>
          </div>
        </div>
      </section>

      <!-- CUSTOMERS -->
      <section class="view" id="view-customers">
        <div class="card">
          <h2>Customers</h2>
          <p class="hint">Everyone who has ordered, grouped by phone number — built from the loaded orders.</p>
          <div id="customersArea"><div class="skel-bar" style="width:90%"></div><div class="skel-bar" style="width:78%"></div></div>
        </div>
      </section>

      <!-- SETTINGS -->
      <section class="view" id="view-settings">
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
            <button class="btn btn-primary" type="submit" id="settingsSaveBtn">Save settings</button>
            <span class="saved" id="settingsSaved">Saved</span>
          </form>
        </div>
        <div class="card">
          <div class="health-head">
            <div>
              <h2>System health</h2>
              <p class="hint" style="margin:0">Live checks on the pieces this store depends on. If something is red, the fix is written next to it.</p>
            </div>
            <button class="btn" id="healthBtn" type="button">Re-run checks</button>
          </div>
          <div id="healthArea" style="margin-top:8px"><div class="skel-bar" style="width:70%"></div><div class="skel-bar" style="width:55%"></div></div>
        </div>
      </section>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>
<script>
(function () {
  var STATUSES = ['New', 'Packed', 'Shipped', 'Delivered', 'Cancelled'];
  var STATUS_COLORS = { New: '#D9A404', Packed: '#8E44AD', Shipped: '#2E86C1', Delivered: '#229954', Cancelled: '#C0392B' };
  var TITLES = { dashboard: 'Dashboard', orders: 'Orders', customers: 'Customers', settings: 'Settings' };
  var HEALTH_LABELS = [
    ['admin_password_set', 'Admin password'],
    ['supabase_configured', 'Supabase connection'],
    ['orders_table', 'Orders table'],
    ['settings_table', 'Settings table'],
    ['razorpay_configured', 'Razorpay (payments)'],
    ['resend_configured', 'Resend (order emails)'],
    ['webhook_secret_set', 'Razorpay webhook secret']
  ];
  var state = {
    orders: [], stats: null, configured: true, dbError: '',
    settings: null, filter: 'All', query: '', expanded: {},
    view: 'dashboard', healthLoaded: false
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
  function trunc(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
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
  function statusClass(s) { return 'st-' + s; }
  function statusCounts() {
    var counts = { All: state.orders.length };
    STATUSES.forEach(function (s) { counts[s] = 0; });
    state.orders.forEach(function (o) { if (counts[o.status] !== undefined) counts[o.status] += 1; });
    if (state.stats && state.stats.by_status) {
      STATUSES.forEach(function (s) {
        if (typeof state.stats.by_status[s] === 'number') counts[s] = state.stats.by_status[s];
      });
      counts.All = state.stats.total_count;
    }
    return counts;
  }

  /* ------------------------------ views ------------------------------ */
  function setView(name) {
    state.view = name;
    var items = document.querySelectorAll('.nav-item');
    for (var i = 0; i < items.length; i++) {
      items[i].className = 'nav-item' + (items[i].getAttribute('data-nav') === name ? ' active' : '');
    }
    var views = document.querySelectorAll('.view');
    for (var j = 0; j < views.length; j++) {
      views[j].className = 'view' + (views[j].id === 'view-' + name ? ' active' : '');
    }
    $('sectionTitle').textContent = TITLES[name] || 'Dashboard';
    if (name === 'settings' && !state.healthLoaded) loadHealth();
    window.scrollTo(0, 0);
  }

  /* ------------------------------ loading ------------------------------ */
  function applyOrdersData(data) {
    if (!data || data.configured === false) {
      state.configured = false;
      state.dbError = '';
      state.orders = []; state.stats = null;
      return;
    }
    state.configured = true;
    state.dbError = typeof data.db_error === 'string' ? data.db_error : '';
    state.orders = Array.isArray(data.orders) ? data.orders : [];
    state.stats = data.stats || null;
  }
  function fetchOrders() {
    return fetch('/api/admin-orders').then(function (r) {
      if (r.status === 401) { window.location.reload(); throw new Error('auth'); }
      return r.json();
    });
  }
  function loadAll() {
    var p1 = fetchOrders();
    var p2 = fetch('/api/admin-settings').then(function (r) {
      return r.ok ? r.json() : null;
    }).catch(function () { return null; });
    return Promise.all([p1, p2]).then(function (res) {
      applyOrdersData(res[0]);
      if (res[1] && res[1].settings) { state.settings = res[1].settings; applySettings(); }
      renderAll();
    }).catch(function (err) {
      if (err && err.message === 'auth') return;
      $('alertArea').innerHTML = '<div class="banner banner-error"><b>Could not load the dashboard data.</b> Check your connection and refresh.</div>';
    });
  }
  function refreshData() {
    fetchOrders().then(function (data) {
      applyOrdersData(data);
      renderAll();
    }).catch(function () { /* keep current UI */ });
  }
  function loadHealth() {
    state.healthLoaded = true;
    $('healthArea').innerHTML = '<div class="skel-bar" style="width:70%"></div><div class="skel-bar" style="width:55%"></div><div class="skel-bar" style="width:62%"></div>';
    fetch('/api/admin-health').then(function (r) {
      if (r.status === 401) { window.location.reload(); throw new Error('auth'); }
      return r.json();
    }).then(function (data) {
      renderHealth(data && data.checks ? data.checks : null);
    }).catch(function (err) {
      if (err && err.message === 'auth') return;
      $('healthArea').innerHTML = '<p class="hint" style="margin:0">Could not run the health checks. Refresh and try again.</p>';
    });
  }
  function renderHealth(checks) {
    if (!checks) {
      $('healthArea').innerHTML = '<p class="hint" style="margin:0">Health checks are unavailable right now.</p>';
      return;
    }
    var html = '';
    HEALTH_LABELS.forEach(function (pair) {
      var c = checks[pair[0]] || { ok: false, status: 'Unknown' };
      html += '<div class="health-row"><span class="h-ico ' + (c.ok ? 'h-ok' : 'h-bad') + '">' + (c.ok ? '✓' : '✕') + '</span>' +
        '<div><div class="h-name">' + esc(pair[1]) + '</div><div class="h-status">' + esc(c.status || '') + '</div></div></div>';
    });
    $('healthArea').innerHTML = html;
  }

  /* ------------------------------ rendering ------------------------------ */
  function renderAll() {
    renderAlert(); renderDashboard(); renderOrders(); renderCustomers(); renderStorePill();
  }
  function renderAlert() {
    var html = '';
    if (state.dbError) {
      html = '<div class="banner banner-error"><b>Database problem:</b> ' + esc(state.dbError) + '</div>';
    } else if (!state.configured) {
      html = '<div class="banner banner-warn"><b>Database not connected yet.</b> The dashboard switches fully on when the site owner adds the database keys in the hosting settings. Until then, orders still appear in the Razorpay dashboard. See Settings → System health for exactly what is missing.</div>';
    }
    $('alertArea').innerHTML = html;
  }
  function renderDashboard() {
    var s = state.stats;
    $('kTodayCount').textContent = s ? String(s.today_count) : '—';
    $('kTodayRevenue').textContent = s ? inr(s.today_revenue) : '—';
    $('kTotalCount').textContent = s ? String(s.total_count) : '—';
    $('kTotalRevenue').textContent = s ? inr(s.total_revenue) : '—';

    var counts = statusCounts();
    var badge = $('navNewBadge');
    if (counts.New > 0) { badge.hidden = false; badge.textContent = String(counts.New); }
    else { badge.hidden = true; }

    /* needs attention */
    var att = $('attentionArea');
    if (!state.configured) {
      att.innerHTML = '<div class="attn-text">Connect the database to see orders that need attention.</div>';
    } else if (state.dbError) {
      att.innerHTML = '<div class="attn-text">Orders are unavailable — see the database warning above.</div>';
    } else if (counts.New > 0) {
      att.innerHTML = '<div class="attn-flex"><div><div class="attn-num">' + counts.New + '</div>' +
        '<div class="attn-text">' + (counts.New === 1 ? 'new order is' : 'new orders are') + ' waiting to be packed</div></div>' +
        '<button class="btn btn-primary" type="button" id="attnBtn">Review new orders</button></div>';
    } else {
      att.innerHTML = '<div class="attn-flex"><div><div class="attn-num zero">0</div>' +
        '<div class="attn-text">All caught up — no new orders waiting.</div></div></div>';
    }

    /* orders by status */
    var max = 1;
    STATUSES.forEach(function (st) { if (counts[st] > max) max = counts[st]; });
    var bs = '';
    STATUSES.forEach(function (st) {
      var pct = Math.round((counts[st] / max) * 100);
      bs += '<div class="bs-row"><span class="bs-name">' + st + '</span>' +
        '<span class="bs-bar"><span class="bs-fill" style="display:block;width:' + pct + '%;background:' + STATUS_COLORS[st] + '"></span></span>' +
        '<span class="bs-count">' + counts[st] + '</span></div>';
    });
    $('byStatusArea').innerHTML = bs;

    /* recent orders */
    var rec = $('recentArea');
    if (!state.configured) {
      rec.innerHTML = '<div class="empty">Connect the database to see recent orders.</div>';
    } else if (state.dbError) {
      rec.innerHTML = '<div class="empty">Orders are unavailable — see the database warning above.</div>';
    } else if (!state.orders.length) {
      rec.innerHTML = '<div class="empty"><b>No orders yet</b>The first paid order will land here automatically.</div>';
    } else {
      var rows = state.orders.slice(0, 8).map(function (o) {
        return '<tr><td class="date-cell">' + esc(fmtDT(o.created_at)) + '</td>' +
          '<td><span class="cust-name">' + esc(o.customer_name || '—') + '</span></td>' +
          '<td class="items-cell">' + esc(trunc(o.items || '', 60)) + '</td>' +
          '<td class="num">' + esc(inr(o.amount)) + '</td>' +
          '<td><span class="status-pill ' + statusClass(o.status) + '">' + esc(o.status || '') + '</span></td></tr>';
      }).join('');
      rec.innerHTML = '<div class="tbl-wrap"><table class="tbl" style="min-width:640px"><thead><tr><th>Date</th><th>Customer</th><th>Items</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody>' +
        rows + '</tbody></table></div>' +
        '<div class="view-all"><button class="btn" type="button" id="viewAllBtn">View all orders</button></div>';
    }
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
  function renderChips() {
    var counts = statusCounts();
    var names = ['All'].concat(STATUSES);
    $('statusChips').innerHTML = names.map(function (n) {
      return '<button type="button" class="chip' + (state.filter === n ? ' active' : '') + '" data-chip="' + n + '">' +
        n + ' <span class="n">' + counts[n] + '</span></button>';
    }).join('');
  }
  function statusSelect(o) {
    var sel = '<select class="status-select ' + statusClass(o.status) + '" data-status-for="' + esc(o.payment_id) + '" aria-label="Change order status">';
    STATUSES.forEach(function (s) {
      sel += '<option value="' + s + '"' + (o.status === s ? ' selected' : '') + '>' + s + '</option>';
    });
    return sel + '</select>';
  }
  function orderRows(o) {
    var wa = waLink(o);
    var open = Boolean(state.expanded[o.payment_id]);
    var html = '<tr class="ord-row">' +
      '<td class="date-cell">' + esc(fmtDT(o.created_at)) + '</td>' +
      '<td class="pay-id">' + esc(o.payment_id) + '</td>' +
      '<td class="items-cell" title="' + esc(o.items || '') + '">' + esc(trunc(o.items || '', 70)) + '</td>' +
      '<td><span class="cust-name">' + esc(o.customer_name || '—') + '</span>' +
      (o.customer_phone ? '<br><span class="cust-phone">' + esc(o.customer_phone) + '</span>' : '') + '</td>' +
      '<td class="num">' + esc(inr(o.amount)) + '</td>' +
      '<td>' + statusSelect(o) + '</td>' +
      '<td><span class="row-actions">' +
      '<button class="icon-btn' + (open ? ' open' : '') + '" type="button" data-details="' + esc(o.payment_id) + '" title="Order details" aria-label="Toggle order details">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="' + (open ? 'transform:rotate(180deg)' : '') + '"><path d="M6 9l6 6 6-6"/></svg></button>' +
      (wa ? '<a class="icon-btn wa-btn" target="_blank" rel="noopener" href="' + esc(wa) + '" title="WhatsApp customer" aria-label="WhatsApp customer">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 01-12.4 7.5L3.5 20.5l1.6-4.9A8.5 8.5 0 1121 11.5z"/></svg></a>' : '') +
      '</span></td></tr>';
    if (open) {
      html += '<tr class="detail-row"><td colspan="7"><div class="detail-grid">' +
        '<div><span class="dk">Delivery address</span><span class="dv">' + esc(o.address || '—') + (o.pincode ? ' — ' + esc(o.pincode) : '') + '</span></div>' +
        '<div><span class="dk">Email</span><span class="dv">' + esc(o.customer_email || '—') + '</span></div>' +
        '<div><span class="dk">Phone</span><span class="dv">' + esc(o.customer_phone || '—') + '</span></div>' +
        '<div><span class="dk">Items</span><span class="dv">' + esc(o.items || '—') + '</span></div>' +
        '<div><span class="dk">Razorpay order ID</span><span class="dv">' + esc(o.order_id || '—') + '</span></div>' +
        '<div><span class="dk">Source</span><span class="dv">' + esc(o.source || '—') + '</span></div>' +
        '<div><span class="dk">Placed</span><span class="dv">' + esc(fmtDT(o.created_at)) + '</span></div>' +
        '<div><span class="dk">Last updated</span><span class="dv">' + esc(fmtDT(o.updated_at)) + '</span></div>' +
        '</div></td></tr>';
    }
    return html;
  }
  function renderOrders() {
    renderChips();
    var area = $('ordersArea');
    var count = $('resultCount');
    if (!state.configured) {
      count.textContent = '';
      area.innerHTML = '<div class="empty"><b>Database not connected</b>Orders will appear here once the database is connected.</div>';
      return;
    }
    if (state.dbError) {
      count.textContent = '';
      area.innerHTML = '<div class="empty"><b>Orders unavailable</b>See the database warning above — the fix is written there.</div>';
      return;
    }
    if (!state.orders.length) {
      count.textContent = 'Showing 0 of 0 orders';
      area.innerHTML = '<div class="empty"><b>No orders yet</b>The first paid order will land here automatically.</div>';
      return;
    }
    var list = visibleOrders();
    count.textContent = 'Showing ' + list.length + ' of ' + state.orders.length + ' orders';
    if (!list.length) {
      area.innerHTML = '<div class="empty"><b>No matching orders</b>Try a different search or status filter.</div>';
      return;
    }
    area.innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th>Date</th><th>Payment ID</th><th>Items</th><th>Customer</th><th class="num">Amount</th><th>Status</th><th>Actions</th>' +
      '</tr></thead><tbody>' + list.map(orderRows).join('') + '</tbody></table></div>';
  }
  function renderCustomers() {
    var area = $('customersArea');
    if (!state.configured) {
      area.innerHTML = '<div class="empty">Connect the database to see customers.</div>';
      return;
    }
    if (state.dbError) {
      area.innerHTML = '<div class="empty">Customers are unavailable — see the database warning above.</div>';
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
      area.innerHTML = '<div class="empty"><b>No customers yet</b>They will appear here after the first orders.</div>';
      return;
    }
    var rows = list.map(function (c) {
      return '<tr><td><span class="cust-name">' + esc(c.name || '—') + '</span></td><td>' + esc(c.phone) + '</td><td>' +
        esc(c.email || '—') + '</td><td>' + c.count + '</td><td class="num">' + esc(inr(c.spent)) + '</td><td class="date-cell">' +
        esc(fmtD(c.last)) + '</td></tr>';
    }).join('');
    area.innerHTML = '<div class="tbl-wrap"><table class="tbl" style="min-width:680px"><thead><tr><th>Customer</th><th>Phone</th><th>Email</th><th>Orders</th><th class="num">Total Spent</th><th>Last Order</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>';
  }
  function renderStorePill() {
    var open = !state.settings || state.settings.store_open !== 'false';
    var pill = $('storePill');
    pill.className = 'store-pill' + (open ? '' : ' closed');
    $('storePillText').textContent = open ? 'Store Open' : 'Store Closed';
  }
  function applySettings() {
    renderStorePill();
    if (state.settings) {
      $('announcementInput').value = state.settings.announcement || '';
      $('storeOpenInput').checked = state.settings.store_open !== 'false';
    }
  }

  /* ------------------------------ events ------------------------------ */
  var navItems = document.querySelectorAll('.nav-item');
  for (var i = 0; i < navItems.length; i++) {
    navItems[i].addEventListener('click', function () { setView(this.getAttribute('data-nav')); });
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    var chip = t.closest ? t.closest('[data-chip]') : null;
    if (chip) {
      state.filter = chip.getAttribute('data-chip');
      renderOrders();
      return;
    }
    var det = t.closest ? t.closest('[data-details]') : null;
    if (det) {
      var pid = det.getAttribute('data-details');
      state.expanded[pid] = !state.expanded[pid];
      renderOrders();
      return;
    }
    if (t.closest && t.closest('#attnBtn')) {
      state.filter = 'New';
      setView('orders');
      renderOrders();
      return;
    }
    if (t.closest && t.closest('#viewAllBtn')) {
      state.filter = 'All';
      setView('orders');
      renderOrders();
    }
  });

  $('globalSearch').addEventListener('input', function () {
    state.query = this.value;
    if (state.view !== 'orders') setView('orders');
    renderOrders();
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.classList || !t.classList.contains('status-select')) return;
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
        t.className = 'status-select ' + statusClass(status);
        renderDashboard();
        renderChips();
        toast('Order marked ' + status);
        refreshData();
      } else {
        toast('Could not save that change.');
        refreshData();
      }
    }).catch(function (err) {
      t.disabled = false;
      if (err && err.message === 'auth') return;
      toast('Could not save that change.');
    });
  });

  $('refreshBtn').addEventListener('click', function () {
    if (state.view === 'settings') state.healthLoaded = false;
    loadAll();
    if (state.view === 'settings') loadHealth();
  });

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
        renderStorePill();
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

  $('healthBtn').addEventListener('click', function () { loadHealth(); });

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
