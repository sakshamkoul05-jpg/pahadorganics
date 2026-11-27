-- =====================================================================
-- PAHAD Organics — Supabase schema for the admin CRM (orders + settings)
-- =====================================================================
-- HOW TO USE: open your Supabase project → SQL Editor → paste this whole
-- file → Run. Safe to run more than once (idempotent).
--
-- The website's serverless functions (/api/*) talk to these tables ONLY
-- through the Supabase service-role key, which bypasses Row Level
-- Security. RLS is enabled below with NO public policies on purpose:
-- the anon/public API can read and write NOTHING, and the tables are
-- reachable only from the server side.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- orders: one row per paid Razorpay order (written by /api/verify and
-- /api/webhook; payment_id is unique so the two writers never duplicate)
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  payment_id    text unique,
  order_id      text,
  amount        int,                       -- paise (₹1 = 100)
  currency      text default 'INR',
  items         text,
  customer_name text,
  customer_phone text,
  customer_email text,
  address       text,
  pincode       text,
  status        text not null default 'New',  -- New | Packed | Shipped | Delivered | Cancelled
  source        text,                      -- verify | webhook
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

-- ---------------------------------------------------------------------
-- settings: simple key/value store the admin dashboard can edit and the
-- public site reads through /api/settings
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  key   text primary key,
  value text
);

insert into public.settings (key, value) values
  ('announcement', '100% natural • No chemicals • Pan-India delivery • Order on WhatsApp'),
  ('store_open', 'true')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Lock both tables down: RLS on, no policies. The service-role key used
-- by the /api functions bypasses RLS; everyone else gets nothing.
-- ---------------------------------------------------------------------
alter table public.orders   enable row level security;
alter table public.settings enable row level security;
