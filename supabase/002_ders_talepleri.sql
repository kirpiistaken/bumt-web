-- =====================================================================
-- BÜMT — Ders talebi + eğitmen onayı güncellemesi
-- schema.sql'den SONRA, bir kez çalıştır: SQL Editor > New query > yapıştır > Run
-- =====================================================================

-- Eğitmen e-postası (talep bildirimleri buraya gider)
alter table public.instructors add column if not exists email text not null default '';

-- Ders kayıtları artık birer "talep": bekliyor / onaylandi / reddedildi
alter table public.lesson_bookings
  add column if not exists status text not null default 'bekliyor',
  add column if not exists token uuid not null default gen_random_uuid(),
  add column if not exists decided_at timestamptz,
  add column if not exists notified_at timestamptz;
update public.lesson_bookings set status = 'onaylandi', decided_at = now() where decided_at is null;
alter table public.lesson_bookings drop constraint if exists lesson_bookings_status_check;
alter table public.lesson_bookings add constraint lesson_bookings_status_check check (status in ('bekliyor','onaylandi','reddedildi'));
alter table public.lesson_bookings drop constraint if exists lesson_bookings_instructor_id_weekday_hour_key;
create unique index if not exists lesson_one_approved on public.lesson_bookings (instructor_id, weekday, hour) where status = 'onaylandi';
create unique index if not exists lesson_one_request_per_user on public.lesson_bookings (instructor_id, weekday, hour, user_id) where status <> 'reddedildi';
create unique index if not exists lesson_token on public.lesson_bookings (token);

-- Onay linki (token) ve bildirim alanları kimseye görünmesin
revoke select on public.lesson_bookings from anon, authenticated;
grant select (id, instructor_id, weekday, hour, user_id, display_name, status, created_at, decided_at)
  on public.lesson_bookings to anon, authenticated;
revoke update on public.lesson_bookings from anon, authenticated;

-- Talep kontrolü
create or replace function public.check_lesson_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare p profiles; n int;
begin
  select * into p from profiles where id = new.user_id;
  if p.id is null or p.status <> 'onaylandi' then
    raise exception 'Ders talebi için üyeliğinin onaylanmış olması gerekir.';
  end if;
  if exists (select 1 from instructors where id = new.instructor_id and profile_id = new.user_id) then
    raise exception 'Kendi dersine talep gönderemezsin.';
  end if;
  if not exists (select 1 from instructors where id = new.instructor_id and active) then
    raise exception 'Bu eğitmen şu an ders almıyor.';
  end if;
  if exists (select 1 from lesson_bookings where instructor_id = new.instructor_id and weekday = new.weekday
             and hour = new.hour and status = 'onaylandi') then
    raise exception 'Bu saat dolu.';
  end if;
  if exists (select 1 from lesson_bookings where instructor_id = new.instructor_id and weekday = new.weekday
             and hour = new.hour and user_id = new.user_id and status <> 'reddedildi') then
    raise exception 'Bu saat için zaten bir talebin var.';
  end if;
  select count(*) into n from lesson_bookings where user_id = new.user_id and status = 'bekliyor';
  if n >= 5 then raise exception 'Aynı anda en fazla 5 bekleyen talebin olabilir.'; end if;
  new.status := 'bekliyor';
  new.token := gen_random_uuid();
  new.decided_at := null;
  new.notified_at := null;
  new.display_name := public.short_name(p.full_name);
  return new;
end $$;

-- Onay / ret (asıl işlem; sadece sunucu ve aşağıdaki fonksiyon çağırır)
create or replace function public.decide_lesson_internal(p_id uuid, p_status text) returns text
language plpgsql security definer set search_path = public as $$
declare b lesson_bookings;
begin
  if p_status not in ('onaylandi','reddedildi') then raise exception 'Geçersiz karar.'; end if;
  select * into b from lesson_bookings where id = p_id for update;
  if b.id is null then raise exception 'Talep bulunamadı.'; end if;
  if b.status <> 'bekliyor' then return b.status; end if;
  if p_status = 'onaylandi' and exists (select 1 from lesson_bookings where instructor_id = b.instructor_id
      and weekday = b.weekday and hour = b.hour and status = 'onaylandi') then
    raise exception 'Bu saat için başka bir talep zaten onaylanmış.';
  end if;
  update lesson_bookings set status = p_status, decided_at = now() where id = p_id;
  if p_status = 'onaylandi' then
    update lesson_bookings set status = 'reddedildi', decided_at = now()
    where instructor_id = b.instructor_id and weekday = b.weekday and hour = b.hour
      and status = 'bekliyor' and id <> p_id;
  end if;
  return p_status;
end $$;
revoke all on function public.decide_lesson_internal(uuid, text) from public, anon, authenticated;
grant execute on function public.decide_lesson_internal(uuid, text) to service_role;

-- Eğitmen ya da kurs yetkilisi panelden karar verir
create or replace function public.decide_lesson(p_id uuid, p_status text) returns text
language plpgsql security definer set search_path = public as $$
declare iid uuid;
begin
  select instructor_id into iid from lesson_bookings where id = p_id;
  if iid is null then raise exception 'Talep bulunamadı.'; end if;
  if not (public.has_perm('kurslar') or public.is_instructor_owner(iid)) then
    raise exception 'Bu talep için yetkin yok.';
  end if;
  return public.decide_lesson_internal(p_id, p_status);
end $$;
revoke all on function public.decide_lesson(uuid, text) from public, anon;
grant execute on function public.decide_lesson(uuid, text) to authenticated;

-- Eğitmenin taleplerini öğrenci iletişim bilgileriyle listeler
create or replace function public.lesson_requests(p_instructor uuid)
returns table (id uuid, weekday int, hour int, status text, created_at timestamptz, decided_at timestamptz,
               full_name text, student_no text, phone text, contact_email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_perm('kurslar') or public.is_instructor_owner(p_instructor)) then
    raise exception 'Bu eğitmenin taleplerini görme yetkin yok.';
  end if;
  return query
    select b.id, b.weekday, b.hour, b.status, b.created_at, b.decided_at,
           p.full_name, p.student_no, p.phone, p.contact_email
    from lesson_bookings b join profiles p on p.id = b.user_id
    where b.instructor_id = p_instructor
    order by (b.status = 'bekliyor') desc, b.weekday, b.hour, b.created_at;
end $$;
revoke all on function public.lesson_requests(uuid) from public, anon;
grant execute on function public.lesson_requests(uuid) to authenticated;
