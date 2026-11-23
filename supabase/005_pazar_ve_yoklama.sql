-- =====================================================================
-- BÜMT — Müzisyen pazarı + prova odası QR yoklaması
-- 004'ten SONRA, bir kez çalıştır: SQL Editor > New query > yapıştır > Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- Müzisyen pazarı
-- ---------------------------------------------------------------------
create table if not exists public.market_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  kind text not null default 'Grup kuruyorum',
  title text not null,
  my_role text not null default '',
  looking_for text[] not null default '{}',
  genre text not null default '',
  description text not null default '',
  display_name text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.market_posts enable row level security;
grant select on public.market_posts to anon, authenticated;
grant insert, update, delete on public.market_posts to authenticated;
grant all on public.market_posts to service_role;

create or replace function public.check_market_post() returns trigger
language plpgsql security definer set search_path = public as $$
declare p profiles; n int;
begin
  select * into p from profiles where id = new.user_id;
  if tg_op = 'INSERT' then
    if p.id is null or p.status <> 'onaylandi' then raise exception 'İlan vermek için üyeliğinin onaylanmış olması gerekir.'; end if;
    if p.member_type <> 'muzisyen' then raise exception 'İlanı sadece müzisyen üyeler verebilir. Profilinden "Müzisyen" seçebilirsin.'; end if;
    select count(*) into n from market_posts where user_id = new.user_id and active;
    if n >= 3 then raise exception 'Aynı anda en fazla 3 açık ilanın olabilir.'; end if;
    new.created_at := now();
  else
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  new.title := left(trim(new.title), 80);
  new.description := left(coalesce(new.description, ''), 1000);
  new.display_name := public.short_name(p.full_name);
  return new;
end $$;
drop trigger if exists check_market_post on public.market_posts;
create trigger check_market_post before insert or update on public.market_posts
  for each row execute function public.check_market_post();

drop policy if exists "ilanlar okunur" on public.market_posts;
drop policy if exists "ilan verilir" on public.market_posts;
drop policy if exists "ilan güncellenir" on public.market_posts;
drop policy if exists "ilan silinir" on public.market_posts;
create policy "ilanlar okunur" on public.market_posts for select using (active or user_id = auth.uid() or public.has_perm('uyeler'));
create policy "ilan verilir" on public.market_posts for insert to authenticated with check (user_id = auth.uid());
create policy "ilan güncellenir" on public.market_posts for update to authenticated using (user_id = auth.uid() or public.has_perm('uyeler'));
create policy "ilan silinir" on public.market_posts for delete to authenticated using (user_id = auth.uid() or public.has_perm('uyeler'));

-- İlan sahibinin telefonu sadece onaylı üyelere
create or replace function public.market_contact(p_post uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare ph text;
begin
  if not public.is_approved() then raise exception 'İletişim bilgisi sadece onaylı üyelere görünür.'; end if;
  select p.phone into ph from market_posts m join profiles p on p.id = m.user_id where m.id = p_post and m.active;
  return coalesce(ph, '');
end $$;
revoke all on function public.market_contact(uuid) from public, anon;
grant execute on function public.market_contact(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Prova odası QR yoklaması
-- ---------------------------------------------------------------------
alter table public.settings add column if not exists qr_code text not null default replace(gen_random_uuid()::text, '-', '');
revoke select on public.settings from anon, authenticated;
grant select (id, prova_open_days, prova_max_per_week, dinleti_open_days, updated_at) on public.settings to anon, authenticated;

create or replace function public.prova_qr_code() returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm('prova') then raise exception 'Yetkin yok.'; end if;
  return (select qr_code from settings where id = 1);
end $$;
revoke all on function public.prova_qr_code() from public, anon;
grant execute on function public.prova_qr_code() to authenticated;

create or replace function public.prova_qr_reset() returns text
language plpgsql security definer set search_path = public as $$
declare c text := replace(gen_random_uuid()::text, '-', '');
begin
  if not public.has_perm('prova') then raise exception 'Yetkin yok.'; end if;
  update settings set qr_code = c where id = 1;
  return c;
end $$;
revoke all on function public.prova_qr_reset() from public, anon;
grant execute on function public.prova_qr_reset() to authenticated;

create table if not exists public.prova_attendance (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.prova_bookings on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  key_returned boolean not null default false,
  key_note text not null default ''
);
alter table public.prova_attendance enable row level security;
revoke all on public.prova_attendance from anon, authenticated;
grant select on public.prova_attendance to authenticated;
grant all on public.prova_attendance to service_role;
drop policy if exists "yoklama okunur" on public.prova_attendance;
create policy "yoklama okunur" on public.prova_attendance for select to authenticated
  using (user_id = auth.uid() or public.has_perm('prova'));

-- QR okutulunca: ilk okutma giriş, ikinci okutma çıkış formunu açar
create or replace function public.prova_scan(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b record; a prova_attendance; t date := public.today_tr();
begin
  if auth.uid() is null then raise exception 'Önce giriş yapmalısın.'; end if;
  if p_code is null or p_code <> (select qr_code from settings where id = 1) then
    raise exception 'Bu QR kod geçerli değil. Prova odasındaki güncel kodu okut.';
  end if;
  select pb.id, pb.day, s.start_time, s.end_time into b
  from prova_bookings pb join prova_slots s on s.id = pb.slot_id
  left join prova_attendance pa on pa.booking_id = pb.id
  where pb.user_id = auth.uid() and pb.day = t and pb.status = 'onaylandi'
  order by (pa.check_out_at is null) desc, s.start_time
  limit 1;
  if b.id is null then raise exception 'Bugün için onaylı bir prova rezervasyonun yok.'; end if;
  select * into a from prova_attendance where booking_id = b.id;
  if a.id is null then
    insert into prova_attendance (booking_id, user_id) values (b.id, auth.uid()) returning * into a;
    return jsonb_build_object('state', 'checked_in', 'check_in_at', a.check_in_at, 'start_time', b.start_time, 'end_time', b.end_time);
  elsif a.check_out_at is null then
    return jsonb_build_object('state', 'needs_checkout', 'check_in_at', a.check_in_at, 'start_time', b.start_time, 'end_time', b.end_time);
  end if;
  return jsonb_build_object('state', 'done', 'check_in_at', a.check_in_at, 'check_out_at', a.check_out_at, 'start_time', b.start_time, 'end_time', b.end_time);
end $$;
revoke all on function public.prova_scan(text) from public, anon;
grant execute on function public.prova_scan(text) to authenticated;

create or replace function public.prova_checkout(p_code text, p_key_returned boolean, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a prova_attendance;
begin
  if auth.uid() is null then raise exception 'Önce giriş yapmalısın.'; end if;
  if p_code is null or p_code <> (select qr_code from settings where id = 1) then
    raise exception 'Bu QR kod geçerli değil.';
  end if;
  if not coalesce(p_key_returned, false) then raise exception 'Çıkış için anahtarı bıraktığını onaylamalısın.'; end if;
  select pa.* into a from prova_attendance pa join prova_bookings pb on pb.id = pa.booking_id
  where pa.user_id = auth.uid() and pb.day = public.today_tr() and pa.check_out_at is null
  order by pa.check_in_at limit 1;
  if a.id is null then raise exception 'Açık bir prova girişin bulunamadı. Önce giriş için QR okut.'; end if;
  update prova_attendance set check_out_at = now(), key_returned = true, key_note = left(coalesce(p_note, ''), 300)
  where id = a.id returning * into a;
  return jsonb_build_object('state', 'checked_out', 'check_in_at', a.check_in_at, 'check_out_at', a.check_out_at);
end $$;
revoke all on function public.prova_checkout(text, boolean, text) from public, anon;
grant execute on function public.prova_checkout(text, boolean, text) to authenticated;

-- Yetkililer için yoklama listesi
create or replace function public.prova_attendance_list(p_from date, p_to date)
returns table (booking_id uuid, day date, start_time time, end_time time, full_name text, student_no text, phone text,
               check_in_at timestamptz, check_out_at timestamptz, key_returned boolean, key_note text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm('prova') then raise exception 'Yetkin yok.'; end if;
  return query
    select pb.id, pb.day, s.start_time, s.end_time, p.full_name, p.student_no, p.phone,
           pa.check_in_at, pa.check_out_at, coalesce(pa.key_returned, false), coalesce(pa.key_note, '')
    from prova_bookings pb join prova_slots s on s.id = pb.slot_id join profiles p on p.id = pb.user_id
    left join prova_attendance pa on pa.booking_id = pb.id
    where pb.status = 'onaylandi' and pb.day between p_from and p_to
    order by pb.day desc, s.start_time;
end $$;
revoke all on function public.prova_attendance_list(date, date) from public, anon;
grant execute on function public.prova_attendance_list(date, date) to authenticated;

grant execute on all functions in schema public to service_role;
