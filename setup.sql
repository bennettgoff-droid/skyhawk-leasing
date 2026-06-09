-- Skyhawk Leasing v6: aircraft + file database + pricing tiers + customer database
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists public.aircraft (
  id uuid primary key default gen_random_uuid(),
  tail_number text not null unique,
  status text default 'Available',
  category text default 'Glass Panel',
  year text,
  model text default 'Cessna 172S Skyhawk',
  panel text,
  total_time text,
  engine_time text,
  lease_terms text default 'Monthly minimum + hourly overage',
  summary text,
  is_public boolean default true,
  display_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.aircraft_pricing_tiers (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references public.aircraft(id) on delete cascade,
  tier_name text not null,
  tier_type text not null default 'minimum' check (tier_type in ('minimum','unlimited','custom')),
  monthly_price numeric,
  included_hours int,
  overage_rate numeric,
  notes text,
  is_public boolean default true,
  display_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.aircraft_files (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references public.aircraft(id) on delete cascade,
  bucket_id text not null default 'aircraft-files',
  file_path text not null unique,
  file_name text,
  file_category text not null default 'photo' check (file_category in ('photo','video','logbook','maintenance','document')),
  mime_type text,
  size_bytes bigint,
  caption text,
  is_primary boolean default false,
  is_public boolean default false,
  display_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_name text,
  contact_name text,
  email text not null,
  phone text,
  website text,
  city text,
  state text,
  country text default 'United States',
  customer_type text,
  monthly_hours text,
  preferred_avionics text,
  aircraft_interest text,
  notes text,
  source text default 'website',
  marketing_consent boolean default false,
  mailchimp_status text,
  mailchimp_last_synced_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists aircraft_pricing_aircraft_idx on public.aircraft_pricing_tiers(aircraft_id);
create index if not exists aircraft_files_aircraft_idx on public.aircraft_files(aircraft_id);
create index if not exists customers_email_idx on public.customers(lower(email));

alter table public.admin_users enable row level security;
alter table public.aircraft enable row level security;
alter table public.aircraft_pricing_tiers enable row level security;
alter table public.aircraft_files enable row level security;
alter table public.customers enable row level security;

drop policy if exists "Admins can read admin users" on public.admin_users;
drop policy if exists "Public can read public aircraft" on public.aircraft;
drop policy if exists "Admins can manage aircraft" on public.aircraft;
drop policy if exists "Public can read public pricing" on public.aircraft_pricing_tiers;
drop policy if exists "Admins can manage pricing" on public.aircraft_pricing_tiers;
drop policy if exists "Public can read public aircraft files" on public.aircraft_files;
drop policy if exists "Admins can manage aircraft files" on public.aircraft_files;
drop policy if exists "Public can insert customers" on public.customers;
drop policy if exists "Admins can manage customers" on public.customers;

create policy "Admins can read admin users" on public.admin_users
for select to authenticated using (user_id = auth.uid());

create policy "Public can read public aircraft" on public.aircraft
for select using (is_public = true);

create policy "Admins can manage aircraft" on public.aircraft
for all to authenticated
using (exists (select 1 from public.admin_users where user_id = auth.uid()))
with check (exists (select 1 from public.admin_users where user_id = auth.uid()));

create policy "Public can read public pricing" on public.aircraft_pricing_tiers
for select using (
  is_public = true and exists (
    select 1 from public.aircraft a where a.id = aircraft_pricing_tiers.aircraft_id and a.is_public = true
  )
);

create policy "Admins can manage pricing" on public.aircraft_pricing_tiers
for all to authenticated
using (exists (select 1 from public.admin_users where user_id = auth.uid()))
with check (exists (select 1 from public.admin_users where user_id = auth.uid()));

create policy "Public can read public aircraft files" on public.aircraft_files
for select using (
  is_public = true and exists (
    select 1 from public.aircraft a where a.id = aircraft_files.aircraft_id and a.is_public = true
  )
);

create policy "Admins can manage aircraft files" on public.aircraft_files
for all to authenticated
using (exists (select 1 from public.admin_users where user_id = auth.uid()))
with check (exists (select 1 from public.admin_users where user_id = auth.uid()));

create policy "Public can insert customers" on public.customers
for insert with check (true);

create policy "Admins can manage customers" on public.customers
for all to authenticated
using (exists (select 1 from public.admin_users where user_id = auth.uid()))
with check (exists (select 1 from public.admin_users where user_id = auth.uid()));

insert into storage.buckets (id, name, public)
values ('aircraft-files', 'aircraft-files', false)
on conflict (id) do update set public = false;

drop policy if exists "Public can read public aircraft storage files" on storage.objects;
drop policy if exists "Admins can read all aircraft storage files" on storage.objects;
drop policy if exists "Admins can upload aircraft storage files" on storage.objects;
drop policy if exists "Admins can update aircraft storage files" on storage.objects;
drop policy if exists "Admins can delete aircraft storage files" on storage.objects;

create policy "Public can read public aircraft storage files" on storage.objects
for select using (
  bucket_id = 'aircraft-files' and exists (
    select 1 from public.aircraft_files f
    join public.aircraft a on a.id = f.aircraft_id
    where f.file_path = storage.objects.name
      and f.bucket_id = storage.objects.bucket_id
      and f.is_public = true
      and a.is_public = true
  )
);

create policy "Admins can read all aircraft storage files" on storage.objects
for select to authenticated using (
  bucket_id = 'aircraft-files' and exists (select 1 from public.admin_users where user_id = auth.uid())
);

create policy "Admins can upload aircraft storage files" on storage.objects
for insert to authenticated with check (
  bucket_id = 'aircraft-files' and exists (select 1 from public.admin_users where user_id = auth.uid())
);

create policy "Admins can update aircraft storage files" on storage.objects
for update to authenticated
using (bucket_id = 'aircraft-files' and exists (select 1 from public.admin_users where user_id = auth.uid()))
with check (bucket_id = 'aircraft-files' and exists (select 1 from public.admin_users where user_id = auth.uid()));

create policy "Admins can delete aircraft storage files" on storage.objects
for delete to authenticated using (
  bucket_id = 'aircraft-files' and exists (select 1 from public.admin_users where user_id = auth.uid())
);

insert into public.aircraft
  (tail_number, status, category, year, model, panel, total_time, engine_time, lease_terms, summary, is_public, display_order)
values
  ('N36JR','Available','Glass Panel','2012','Cessna 172S Skyhawk','Garmin G1000 / GFC700 Autopilot / ADS-B In & Out','5,600 TT','400 SMOH','Monthly minimum + hourly overage','2012 Cessna 172S Skyhawk with Garmin G1000, GFC700 autopilot, and ADS-B In & Out. Well-suited for flight schools and university aviation programs seeking a modern glass-panel trainer.',true,1),
  ('N745B','Available','Glass Panel',null,'Cessna 172S Skyhawk','Garmin G1000 / IFR / ADS-B','2,200 TT','0 SMOH','Monthly minimum + hourly overage','Cessna 172S Skyhawk with 2,200 TT and 0 SMOH, available for lease to flight schools, universities, and commercial training operators.',true,2)
on conflict (tail_number) do update set
  status = excluded.status, category = excluded.category, year = excluded.year, model = excluded.model,
  panel = excluded.panel, total_time = excluded.total_time, engine_time = excluded.engine_time,
  lease_terms = excluded.lease_terms, summary = excluded.summary, is_public = excluded.is_public,
  display_order = excluded.display_order, updated_at = now();

insert into public.aircraft_pricing_tiers
  (aircraft_id, tier_name, tier_type, monthly_price, included_hours, overage_rate, notes, is_public, display_order)
select id, '50 Hour Minimum', 'minimum', 6500, 50, 115, 'Example pricing tier. Edit in admin.', true, 1
from public.aircraft
where tail_number in ('N36JR','N745B')
on conflict do nothing;

-- After creating your Supabase Auth user, copy its UUID and run:
-- insert into public.admin_users (user_id) values ('PASTE-YOUR-AUTH-USER-UUID-HERE');
