-- =====================================================================
-- BÜMT — Dinleti başvuru + onay sistemi
-- 005'ten SONRA, bir kez çalıştır: SQL Editor > New query > yapıştır > Run
-- =====================================================================

alter table public.dinleti_bookings
  add column if not exists status text not null default 'bekliyor',
  add column if not exists token uuid not null default gen_random_uuid(),
  add column if not exists decided_at timestamptz,
  add column if not exists notified_at timestamptz,
  add column if not exists people_count int not null default 1,
  add column if not exists members text not null default '',
  add column if not exists repertoire text not null default '',
  add column if not exists equipment text[] not null default '{}',
  add column if not exists video_url text not null default '',
  add column if not exists note text not null default '';
update public.dinleti_bookings set status = 'onaylandi', decided_at = now() where decided_at is null;
alter table public.dinleti_bookings drop constraint if exists dinleti_bookings_status_check;
alter table public.dinleti_bookings add constraint dinleti_bookings_status_check check (status in ('bekliyor','onaylandi','reddedildi'));
alter table public.dinleti_bookings drop constraint if exists dinleti_bookings_dinleti_id_slot_index_key;
create unique index if not exists dinleti_one_approved on public.dinleti_bookings (dinleti_id, slot_index) where status = 'onaylandi';
create unique index if not exists dinleti_one_request_per_user on public.dinleti_bookings (dinleti_id, user_id) where status <> 'reddedildi';
create unique index if not exists dinleti_token on public.dinleti_bookings (token);

-- Başvuru detayları ve onay linki sadece yetkililere
revoke select on public.dinleti_bookings from anon, authenticated;
grant select (id, dinleti_id, slot_index, user_id, display_name, perf_type, status, created_at, decided_at)
  on public.dinleti_bookings to anon, authenticated;
revoke update on public.dinleti_bookings from anon, authenticated;
grant all on public.dinleti_bookings to service_role;

create or replace function public.check_dinleti_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare s settings; d dinletiler; p profiles; t date := public.today_tr();
begin
  select * into s from settings where id = 1;
  select * into d from dinletiler where id = new.dinleti_id;
  select * into p from profiles where id = new.user_id;
  if p.id is null or p.status <> 'onaylandi' then
    raise exception 'Başvuru için üyeliğinin onaylanmış olması gerekir.';
  end if;
  if d.id is null or not d.active then raise exception 'Bu dinleti başvuruya açık değil.'; end if;
  if t > d.day then raise exception 'Bu dinleti geçmişte kaldı.'; end if;
  if t < d.day - s.dinleti_open_days then
    raise exception 'Bu dinletinin başvuruları % tarihinde açılır.', to_char(d.day - s.dinleti_open_days, 'DD.MM.YYYY');
  end if;
  if new.slot_index < 0 or new.slot_index >= d.slot_count then raise exception 'Geçersiz saat.'; end if;
  if exists (select 1 from dinleti_bookings where dinleti_id = new.dinleti_id and slot_index = new.slot_index and status = 'onaylandi') then
    raise exception 'Bu saat dolu.';
  end if;
  if exists (select 1 from dinleti_bookings where dinleti_id = new.dinleti_id and user_id = new.user_id and status <> 'reddedildi') then
    raise exception 'Bu dinleti için zaten bir başvurun var.';
  end if;
  if coalesce(trim(new.repertoire), '') = '' then raise exception 'Çalacağın / söyleyeceğin parçaları yaz.'; end if;
  if coalesce(new.video_url, '') <> '' and new.video_url !~* '^https?://' then
    raise exception 'Video linki http:// ya da https:// ile başlamalı.';
  end if;
  new.status := 'bekliyor';
  new.token := gen_random_uuid();
  new.decided_at := null;
  new.notified_at := null;
  new.people_count := greatest(1, least(coalesce(new.people_count, 1), 30));
  new.performer := left(coalesce(new.performer, ''), 80);
  new.members := left(coalesce(new.members, ''), 500);
  new.repertoire := left(new.repertoire, 1000);
  new.video_url := left(coalesce(new.video_url, ''), 500);
  new.note := left(coalesce(new.note, ''), 1000);
  new.display_name := coalesce(nullif(trim(new.performer), ''), public.short_name(p.full_name));
  return new;
end $$;

create or replace function public.decide_dinleti_internal(p_id uuid, p_status text) returns text
language plpgsql security definer set search_path = public as $$
declare b dinleti_bookings;
begin
  if p_status not in ('onaylandi','reddedildi') then raise exception 'Geçersiz karar.'; end if;
  select * into b from dinleti_bookings where id = p_id for update;
  if b.id is null then raise exception 'Başvuru bulunamadı.'; end if;
  if b.status <> 'bekliyor' then return b.status; end if;
  if p_status = 'onaylandi' and exists (select 1 from dinleti_bookings where dinleti_id = b.dinleti_id and slot_index = b.slot_index and status = 'onaylandi') then
    raise exception 'Bu saat için başka bir başvuru zaten onaylanmış.';
  end if;
  update dinleti_bookings set status = p_status, decided_at = now() where id = p_id;
  if p_status = 'onaylandi' then
    update dinleti_bookings set status = 'reddedildi', decided_at = now()
    where dinleti_id = b.dinleti_id and slot_index = b.slot_index and status = 'bekliyor' and id <> p_id;
  end if;
  return p_status;
end $$;
revoke all on function public.decide_dinleti_internal(uuid, text) from public, anon, authenticated;
grant execute on function public.decide_dinleti_internal(uuid, text) to service_role;

create or replace function public.decide_dinleti(p_id uuid, p_status text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('dinletiler') then raise exception 'Dinleti başvuruları için yetkin yok.'; end if;
  return public.decide_dinleti_internal(p_id, p_status);
end $$;
revoke all on function public.decide_dinleti(uuid, text) from public, anon;
grant execute on function public.decide_dinleti(uuid, text) to authenticated, service_role;

create or replace function public.dinleti_requests(p_from date)
returns table (id uuid, dinleti_id uuid, day date, title text, start_time time, slot_minutes int, slot_index int,
               status text, perf_type text, performer text, display_name text, people_count int, members text,
               repertoire text, equipment text[], video_url text, note text, created_at timestamptz, decided_at timestamptz,
               full_name text, student_no text, phone text, contact_email text, department text, class_year text, instruments text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm('dinletiler') then raise exception 'Dinleti başvuruları için yetkin yok.'; end if;
  return query
    select b.id, b.dinleti_id, d.day, d.title, d.start_time, d.slot_minutes, b.slot_index,
           b.status, b.perf_type, b.performer, b.display_name, b.people_count, b.members,
           b.repertoire, b.equipment, b.video_url, b.note, b.created_at, b.decided_at,
           p.full_name, p.student_no, p.phone, p.contact_email, p.department, p.class_year, p.instruments
    from dinleti_bookings b join dinletiler d on d.id = b.dinleti_id join profiles p on p.id = b.user_id
    where d.day >= p_from
    order by (b.status = 'bekliyor') desc, d.day, b.slot_index, b.created_at;
end $$;
revoke all on function public.dinleti_requests(date) from public, anon;
grant execute on function public.dinleti_requests(date) to authenticated, service_role;

grant execute on all functions in schema public to service_role;
notify pgrst, 'reload schema';
