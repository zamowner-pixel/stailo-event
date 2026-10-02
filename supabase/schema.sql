-- =============================================================
-- Stailo Event — skema Supabase
-- Jalankan SEKALI dalam Supabase Dashboard > SQL Editor > New query
-- =============================================================

-- ---------- PROFIL PENGGUNA ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'vendor' check (role in ('admin','vendor')),
  business_name text not null default '',
  owner_name text not null default '',
  phone text not null default '',
  email text not null default '',
  created_at timestamptz not null default now()
);
-- ID vendor (contoh V001) — hanya admin boleh cipta
alter table public.profiles add column if not exists vendor_code text unique;
alter table public.profiles add column if not exists is_active boolean not null default true;

-- Profil dicipta automatik bila akaun dicipta
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, business_name, owner_name, phone)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'business_name', ''),
    coalesce(new.raw_user_meta_data->>'owner_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', '')
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Vendor tak boleh tukar role, ID vendor atau status aktif sendiri
create or replace function public.protect_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() kosong = dijalankan dari SQL Editor (dibenarkan)
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.vendor_code := old.vendor_code;
    new.is_active := old.is_active;
  end if;
  return new;
end $$;

drop trigger if exists protect_role on public.profiles;
create trigger protect_role before update on public.profiles
  for each row execute function public.protect_role();

-- ---------- EVENT ----------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date,
  end_date date,
  location text not null default '',
  layout_image_path text,           -- gambar pelan tapak (bucket: layouts)
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- TAPAK ----------
-- status: free (kosong) | held (vendor sedang bayar) | paid (resit dihantar, perlu kunci) | locked (dikunci admin)
create table if not exists public.lots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  code text not null,
  row_no int not null default 1,
  col_no int not null default 1,
  size text not null default '3m x 3m',
  price numeric(10,2) not null default 0,
  status text not null default 'free' check (status in ('free','held','paid','locked')),
  vendor_id uuid references public.profiles(id) on delete set null,
  held_until timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, code)
);

-- ---------- TEMPAHAN ----------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  lot_id uuid not null references public.lots(id) on delete cascade,
  vendor_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10,2) not null default 0,
  status text not null default 'pending_payment'
    check (status in ('pending_payment','pending_verification','approved','rejected','expired','cancelled')),
  receipt_path text,                -- bucket: receipts
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

-- ---------- INVOIS ----------
create sequence if not exists public.invoice_seq;

create or replace function public.next_invoice_no()
returns text language sql as $$
  select 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_seq')::text, 4, '0');
$$;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique default public.next_invoice_no(),
  event_id uuid references public.events(id) on delete set null,
  vendor_id uuid not null references public.profiles(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  items jsonb not null default '[]'::jsonb,   -- [{ "desc": "...", "amount": 150 }]
  total numeric(10,2) not null default 0,
  status text not null default 'unpaid' check (status in ('unpaid','paid')),
  notes text not null default '',
  issued_at timestamptz not null default now(),
  paid_at timestamptz
);

-- ---------- TETAPAN (satu baris sahaja) ----------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  company_name text not null default 'Stailo Event',
  address text not null default '',
  phone text not null default '',
  bank_name text not null default '',
  account_no text not null default '',
  account_name text not null default '',
  qr_image_path text,               -- DuitNow QR (bucket: public-assets)
  hold_minutes int not null default 15
);
insert into public.settings (id) values (1) on conflict do nothing;

-- =============================================================
-- KESELAMATAN (Row Level Security)
-- =============================================================
alter table public.profiles enable row level security;
alter table public.events   enable row level security;
alter table public.lots     enable row level security;
alter table public.bookings enable row level security;
alter table public.invoices enable row level security;
alter table public.settings enable row level security;

drop policy if exists "profil sendiri atau admin" on public.profiles;
create policy "profil sendiri atau admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
drop policy if exists "kemaskini profil sendiri" on public.profiles;
create policy "kemaskini profil sendiri" on public.profiles
  for update using (id = auth.uid() or public.is_admin());

drop policy if exists "semua boleh lihat event" on public.events;
create policy "semua boleh lihat event" on public.events
  for select using (auth.uid() is not null);
drop policy if exists "admin urus event" on public.events;
create policy "admin urus event" on public.events
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "semua boleh lihat tapak" on public.lots;
create policy "semua boleh lihat tapak" on public.lots
  for select using (auth.uid() is not null);
drop policy if exists "admin urus tapak" on public.lots;
create policy "admin urus tapak" on public.lots
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "tempahan sendiri atau admin" on public.bookings;
create policy "tempahan sendiri atau admin" on public.bookings
  for select using (vendor_id = auth.uid() or public.is_admin());
drop policy if exists "admin urus tempahan" on public.bookings;
create policy "admin urus tempahan" on public.bookings
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "invois sendiri atau admin" on public.invoices;
create policy "invois sendiri atau admin" on public.invoices
  for select using (vendor_id = auth.uid() or public.is_admin());
drop policy if exists "admin urus invois" on public.invoices;
create policy "admin urus invois" on public.invoices
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "semua boleh lihat tetapan" on public.settings;
create policy "semua boleh lihat tetapan" on public.settings
  for select using (auth.uid() is not null);
drop policy if exists "admin urus tetapan" on public.settings;
create policy "admin urus tetapan" on public.settings
  for update using (public.is_admin()) with check (public.is_admin());

-- =============================================================
-- FUNGSI (vendor tak boleh ubah jadual terus — semua melalui fungsi ini)
-- =============================================================

-- Lepaskan tapak yang masa tahannya dah tamat
create or replace function public.release_expired_holds()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.bookings b set status = 'expired'
    from public.lots l
   where b.lot_id = l.id and b.status = 'pending_payment'
     and l.status = 'held' and l.held_until < now();
  update public.lots set status = 'free', vendor_id = null, held_until = null
   where status = 'held' and held_until < now();
end $$;

-- Vendor pilih tapak → tapak ditahan untuk dia
create or replace function public.reserve_lot(p_lot_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_lot public.lots%rowtype;
  v_mins int;
  v_booking uuid;
begin
  if v_uid is null then raise exception 'Sila log masuk dahulu'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and is_active) then
    raise exception 'Akaun anda tidak aktif. Sila hubungi admin.';
  end if;
  perform public.release_expired_holds();

  select * into v_lot from public.lots where id = p_lot_id for update;
  if not found then raise exception 'Tapak tidak dijumpai'; end if;

  if exists (select 1 from public.bookings
              where vendor_id = v_uid and event_id = v_lot.event_id
                and status in ('pending_payment','pending_verification','approved')) then
    raise exception 'Anda sudah ada tempahan untuk event ini';
  end if;

  if v_lot.status <> 'free' then raise exception 'Maaf, tapak % sudah diambil', v_lot.code; end if;

  select hold_minutes into v_mins from public.settings where id = 1;
  update public.lots
     set status = 'held', vendor_id = v_uid, held_until = now() + make_interval(mins => coalesce(v_mins, 15))
   where id = p_lot_id;

  insert into public.bookings (event_id, lot_id, vendor_id, amount)
  values (v_lot.event_id, p_lot_id, v_uid, v_lot.price)
  returning id into v_booking;
  return v_booking;
end $$;

-- Vendor hantar resit bayaran
create or replace function public.submit_receipt(p_booking_id uuid, p_receipt_path text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_b public.bookings%rowtype;
  v_lot public.lots%rowtype;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if not found or v_b.vendor_id <> auth.uid() then raise exception 'Tempahan tidak dijumpai'; end if;
  if v_b.status <> 'pending_payment' then raise exception 'Tempahan ini sudah diproses'; end if;

  select * into v_lot from public.lots where id = v_b.lot_id for update;
  if v_lot.status <> 'held' or v_lot.vendor_id <> auth.uid() or v_lot.held_until < now() then
    update public.bookings set status = 'expired' where id = p_booking_id;
    if v_lot.status = 'held' and v_lot.vendor_id = auth.uid() then
      update public.lots set status = 'free', vendor_id = null, held_until = null where id = v_lot.id;
    end if;
    raise exception 'Masa tahan tapak sudah tamat. Sila pilih semula.';
  end if;

  update public.bookings set status = 'pending_verification', receipt_path = p_receipt_path where id = p_booking_id;
  update public.lots set status = 'paid', held_until = null where id = v_lot.id;
end $$;

-- Vendor batal sebelum bayar
create or replace function public.cancel_booking(p_booking_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_b public.bookings%rowtype;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if not found or v_b.vendor_id <> auth.uid() then raise exception 'Tempahan tidak dijumpai'; end if;
  if v_b.status <> 'pending_payment' then raise exception 'Tempahan ini tidak boleh dibatalkan'; end if;
  update public.bookings set status = 'cancelled' where id = p_booking_id;
  update public.lots set status = 'free', vendor_id = null, held_until = null
   where id = v_b.lot_id and status = 'held' and vendor_id = auth.uid();
end $$;

-- Admin kunci tapak (sahkan bayaran) → invois "Dibayar" dicipta automatik
create or replace function public.admin_lock_lot(p_lot_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_lot public.lots%rowtype;
  v_ev public.events%rowtype;
  v_b public.bookings%rowtype;
  v_inv uuid;
begin
  if not public.is_admin() then raise exception 'Admin sahaja'; end if;
  select * into v_lot from public.lots where id = p_lot_id for update;
  if not found then raise exception 'Tapak tidak dijumpai'; end if;
  if v_lot.vendor_id is null then raise exception 'Tapak ini belum ada vendor'; end if;
  if v_lot.status = 'locked' then return null; end if;

  select * into v_ev from public.events where id = v_lot.event_id;
  select * into v_b from public.bookings
   where lot_id = p_lot_id and vendor_id = v_lot.vendor_id
     and status in ('pending_payment','pending_verification')
   order by created_at desc limit 1;

  update public.lots set status = 'locked', held_until = null where id = p_lot_id;

  if v_b.id is not null then
    update public.bookings set status = 'approved', verified_at = now() where id = v_b.id;
  end if;

  insert into public.invoices (event_id, vendor_id, booking_id, items, total, status, paid_at)
  values (
    v_lot.event_id, v_lot.vendor_id, v_b.id,
    jsonb_build_array(jsonb_build_object(
      'desc', 'Sewa tapak ' || v_lot.code || ' (' || v_lot.size || ') — ' || coalesce(v_ev.name, ''),
      'amount', v_lot.price)),
    v_lot.price, 'paid', now()
  ) returning id into v_inv;
  return v_inv;
end $$;

-- Admin buka kunci (tapak kembali ke "perlu kunci")
create or replace function public.admin_unlock_lot(p_lot_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin sahaja'; end if;
  update public.lots set status = 'paid' where id = p_lot_id and status = 'locked';
end $$;

-- Admin kosongkan tapak (tolak bayaran / batal sewa)
create or replace function public.admin_release_lot(p_lot_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin sahaja'; end if;
  update public.bookings set status = 'rejected', verified_at = now()
   where lot_id = p_lot_id and status in ('pending_payment','pending_verification','approved');
  update public.lots set status = 'free', vendor_id = null, held_until = null where id = p_lot_id;
end $$;

-- Senarai tapak untuk vendor (tanpa dedahkan vendor lain)
create or replace function public.lots_for_event(p_event_id uuid)
returns table (id uuid, code text, row_no int, col_no int, size text, price numeric, status text, is_mine boolean)
language plpgsql security definer set search_path = public as $$
begin
  perform public.release_expired_holds();
  return query
    select l.id, l.code, l.row_no, l.col_no, l.size, l.price, l.status, (l.vendor_id = auth.uid())
      from public.lots l where l.event_id = p_event_id
     order by l.row_no, l.col_no;
end $$;

revoke execute on function public.release_expired_holds() from anon;
revoke execute on function public.reserve_lot(uuid) from anon;
revoke execute on function public.submit_receipt(uuid, text) from anon;
revoke execute on function public.cancel_booking(uuid) from anon;
revoke execute on function public.admin_lock_lot(uuid) from anon;
revoke execute on function public.admin_unlock_lot(uuid) from anon;
revoke execute on function public.admin_release_lot(uuid) from anon;
revoke execute on function public.lots_for_event(uuid) from anon;

-- =============================================================
-- AKAUN VENDOR (dicipta oleh admin sahaja)
-- Vendor log masuk dengan ID vendor + kata laluan.
-- Di belakang tabir, ID ditukar kepada emel dalaman: v001@vendor.stailoevent.app
-- (tiada emel sebenar dihantar ke alamat ini)
-- =============================================================
create extension if not exists pgcrypto with schema extensions;

create or replace function public.vendor_email(p_code text)
returns text language sql immutable as $$
  select lower(trim(p_code)) || '@vendor.stailoevent.app';
$$;

-- Fungsi dalaman: cipta akaun log masuk (ID + kata laluan)
create or replace function public._create_login(p_code text, p_password text, p_meta jsonb)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := public.vendor_email(p_code);
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, coalesce(p_meta, '{}'::jsonb),
    now(), now(), '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now());
  return v_id;
end $$;
revoke execute on function public._create_login(text, text, jsonb) from anon, authenticated, public;

create or replace function public.admin_create_vendor(
  p_code text, p_password text, p_business_name text, p_owner_name text default '', p_phone text default '')
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
  v_code text := upper(trim(p_code));
begin
  if not public.is_admin() then raise exception 'Admin sahaja'; end if;
  if v_code !~ '^[A-Z0-9-]{2,20}$' then raise exception 'ID vendor hanya boleh huruf, nombor atau tanda - (2 hingga 20 aksara)'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'Kata laluan sekurang-kurangnya 6 aksara'; end if;
  if coalesce(trim(p_business_name), '') = '' then raise exception 'Isi nama perniagaan'; end if;
  if exists (select 1 from public.profiles where vendor_code = v_code)
     or exists (select 1 from auth.users where email = public.vendor_email(v_code)) then
    raise exception 'ID % sudah digunakan', v_code;
  end if;

  v_id := public._create_login(v_code, p_password,
    jsonb_build_object('business_name', trim(p_business_name), 'owner_name', trim(coalesce(p_owner_name, '')), 'phone', trim(coalesce(p_phone, ''))));
  update public.profiles set vendor_code = v_code, role = 'vendor', is_active = true where id = v_id;
  return v_id;
end $$;

-- Cipta / set semula akaun ADMIN. Jalankan dari SQL Editor sahaja, contoh:
--   select public.setup_admin('admin', 'kata-laluan-anda');
-- Kalau ID itu sudah wujud, kata laluannya akan ditukar.
create or replace function public.setup_admin(p_code text, p_password text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_code text := upper(trim(p_code));
  v_id uuid;
begin
  if auth.uid() is not null then raise exception 'Jalankan dari SQL Editor sahaja'; end if;
  if v_code !~ '^[A-Z0-9-]{2,20}$' then raise exception 'ID hanya boleh huruf, nombor atau tanda -'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Kata laluan admin sekurang-kurangnya 8 aksara'; end if;
  select id into v_id from auth.users where email = public.vendor_email(v_code);
  if v_id is null then
    v_id := public._create_login(v_code, p_password, jsonb_build_object('business_name', 'Admin'));
  else
    update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), banned_until = null, updated_at = now() where id = v_id;
  end if;
  update public.profiles set role = 'admin', vendor_code = v_code, is_active = true where id = v_id;
  return 'Akaun admin ' || v_code || ' sedia. Log masuk dengan ID ' || lower(v_code) || '.';
end $$;
revoke execute on function public.setup_admin(text, text) from anon, authenticated, public;

-- Admin tetapkan kata laluan baru untuk vendor (vendor lupa kata laluan)
create or replace function public.admin_set_vendor_password(p_vendor uuid, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'Admin sahaja'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'Kata laluan sekurang-kurangnya 6 aksara'; end if;
  if not exists (select 1 from public.profiles where id = p_vendor and role = 'vendor') then raise exception 'Vendor tidak dijumpai'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_vendor;
end $$;

-- Admin aktif / nyahaktif akaun vendor (vendor tak aktif tak boleh log masuk)
create or replace function public.admin_set_vendor_active(p_vendor uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin sahaja'; end if;
  if not exists (select 1 from public.profiles where id = p_vendor and role = 'vendor') then raise exception 'Vendor tidak dijumpai'; end if;
  update public.profiles set is_active = p_active where id = p_vendor;
  update auth.users set banned_until = case when p_active then null else '2999-12-31'::timestamptz end, updated_at = now()
   where id = p_vendor;
end $$;

revoke execute on function public.admin_create_vendor(text, text, text, text, text) from anon, public;
revoke execute on function public.admin_set_vendor_password(uuid, text) from anon, public;
revoke execute on function public.admin_set_vendor_active(uuid, boolean) from anon, public;
grant execute on function public.admin_create_vendor(text, text, text, text, text) to authenticated;
grant execute on function public.admin_set_vendor_password(uuid, text) to authenticated;
grant execute on function public.admin_set_vendor_active(uuid, boolean) to authenticated;

-- =============================================================
-- STORAN FAIL
-- layouts       : gambar pelan tapak (semua boleh lihat, admin sahaja upload/buang)
-- public-assets : DuitNow QR (semua boleh lihat, admin sahaja upload)
-- receipts      : resit vendor (peribadi — vendor sendiri & admin)
-- =============================================================
insert into storage.buckets (id, name, public) values ('layouts', 'layouts', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('public-assets', 'public-assets', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false) on conflict (id) do nothing;

drop policy if exists "admin upload gambar awam" on storage.objects;
create policy "admin upload gambar awam" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('layouts','public-assets') and public.is_admin());
drop policy if exists "admin kemaskini gambar awam" on storage.objects;
create policy "admin kemaskini gambar awam" on storage.objects
  for update to authenticated
  using (bucket_id in ('layouts','public-assets') and public.is_admin());
drop policy if exists "admin buang gambar awam" on storage.objects;
create policy "admin buang gambar awam" on storage.objects
  for delete to authenticated
  using (bucket_id in ('layouts','public-assets') and public.is_admin());

drop policy if exists "vendor upload resit sendiri" on storage.objects;
create policy "vendor upload resit sendiri" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "lihat resit sendiri atau admin" on storage.objects;
create policy "lihat resit sendiri atau admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
