-- =====================================================================
-- BÜMT — Prova odası talep + onay sistemi
-- 003'ten SONRA, bir kez çalıştır: SQL Editor > New query > yapıştır > Run
-- =====================================================================

-- Yetkililer e-posta bildirimini açıp kapatabilsin
alter table public.profiles add column if not exists notify_mail boolean not null default true;

-- Prova rezervasyonları artık birer talep
alter table public.prova_bookings
  add column if not exists status text not null default 'bekliyor',
  add column if not exists token uuid not null default gen_random_uuid(),
  add column if not exists decided_at timestamptz,
  add column if not exists notified_at timestamptz;
update public.prova_bookings set status = 'onaylandi', decided_at = now() where decided_at is null;
alter table public.prova_bookings drop constraint if exists prova_bookings_status_check;
alter table public.prova_bookings add constraint prova_bookings_status_check check (status in ('bekliyor','onaylandi','reddedildi'));
alter table public.prova_bookings drop constraint if exists prova_bookings_slot_id_day_key;
create unique index if not exists prova_one_approved on public.prova_bookings (slot_id, day) where status = 'onaylandi';
create unique index if not exists prova_one_request_per_user on public.prova_bookings (slot_id, day, user_id) where status <> 'reddedildi';
create unique index if not exists prova_token on public.prova_bookings (token);

-- Not ve onay linki sadece yetkililere görünür
revoke select on public.prova_bookings from anon, authenticated;
grant select (id, slot_id, day, user_id, display_name, status, created_at, decided_at)
  on public.prova_bookings to anon, authenticated;
revoke update on public.prova_bookings from anon, authenticated;
grant all on public.prova_bookings to service_role;

create or replace function public.check_prova_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare s settings; t date := public.today_tr(); n int; p profiles;
begin
  select * into s from settings where id = 1;
  select * into p from profiles where id = new.user_id;
  if p.id is null or p.status <> 'onaylandi' then
    raise exception 'Rezervasyon için üyeliğinin onaylanmış olması gerekir.';
  end if;
  if extract(isodow from new.day) <> 5 then
    raise exception 'Prova odası rezervasyonu sadece cuma günleri için yapılır.';
  end if;
  if t > new.day then raise exception 'Geçmiş bir tarihe rezervasyon yapılamaz.'; end if;
  if t < new.day - s.prova_open_days then
    raise exception 'Bu cumanın rezervasyonu % tarihinde açılır.', to_char(new.day - s.prova_open_days, 'DD.MM.YYYY');
  end if;
  if not exists (select 1 from prova_slots where id = new.slot_id and active) then
    raise exception 'Bu saat artık rezervasyona açık değil.';
  end if;
  if exists (select 1 from prova_bookings where slot_id = new.slot_id and day = new.day and status = 'onaylandi') then
    raise exception 'Bu saat dolu.';
  end if;
  select count(*) into n from prova_bookings where day = new.day and user_id = new.user_id and status <> 'reddedildi';
  if n >= s.prova_max_per_week then
    raise exception 'Bu hafta için zaten bir talebin ya da rezervasyonun var.';
  end if;
  new.status := 'bekliyor';
  new.token := gen_random_uuid();
  new.decided_at := null;
  new.notified_at := null;
  new.note := left(coalesce(new.note, ''), 300);
  new.display_name := public.short_name(p.full_name);
  return new;
end $$;

create or replace function public.decide_prova_internal(p_id uuid, p_status text) returns text
language plpgsql security definer set search_path = public as $$
declare b prova_bookings;
begin
  if p_status not in ('onaylandi','reddedildi') then raise exception 'Geçersiz karar.'; end if;
  select * into b from prova_bookings where id = p_id for update;
  if b.id is null then raise exception 'Talep bulunamadı.'; end if;
  if b.status <> 'bekliyor' then return b.status; end if;
  if p_status = 'onaylandi' and exists (select 1 from prova_bookings where slot_id = b.slot_id and day = b.day and status = 'onaylandi') then
    raise exception 'Bu saat için başka bir talep zaten onaylanmış.';
  end if;
  update prova_bookings set status = p_status, decided_at = now() where id = p_id;
  if p_status = 'onaylandi' then
    update prova_bookings set status = 'reddedildi', decided_at = now()
    where slot_id = b.slot_id and day = b.day and status = 'bekliyor' and id <> p_id;
  end if;
  return p_status;
end $$;
revoke all on function public.decide_prova_internal(uuid, text) from public, anon, authenticated;
grant execute on function public.decide_prova_internal(uuid, text) to service_role;

create or replace function public.decide_prova(p_id uuid, p_status text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('prova') then raise exception 'Prova talepleri için yetkin yok.'; end if;
  return public.decide_prova_internal(p_id, p_status);
end $$;
revoke all on function public.decide_prova(uuid, text) from public, anon;
grant execute on function public.decide_prova(uuid, text) to authenticated, service_role;

-- Yetkililer için talep listesi (üyenin tüm iletişim bilgileriyle)
create or replace function public.prova_requests(p_from date)
returns table (id uuid, slot_id uuid, day date, start_time time, end_time time, status text, note text,
               created_at timestamptz, decided_at timestamptz, full_name text, student_no text, phone text,
               contact_email text, department text, class_year text, member_type text, instruments text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm('prova') then raise exception 'Prova talepleri için yetkin yok.'; end if;
  return query
    select b.id, b.slot_id, b.day, s.start_time, s.end_time, b.status, b.note, b.created_at, b.decided_at,
           p.full_name, p.student_no, p.phone, p.contact_email, p.department, p.class_year, p.member_type, p.instruments
    from prova_bookings b join profiles p on p.id = b.user_id join prova_slots s on s.id = b.slot_id
    where b.day >= p_from
    order by (b.status = 'bekliyor') desc, b.day, s.start_time, b.created_at;
end $$;
revoke all on function public.prova_requests(date) from public, anon;
grant execute on function public.prova_requests(date) to authenticated, service_role;

grant execute on all functions in schema public to service_role;
