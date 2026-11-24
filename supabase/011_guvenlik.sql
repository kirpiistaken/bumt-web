-- =====================================================================
-- BÜMT — Güvenlik güncellemesi
--  1) Telefon ve e-posta adreslerini sadece süper yönetici görür
--     (yetkililer WhatsApp butonuyla yazabilir ama listede numara görmez; her erişim kayda geçer)
--  2) İki adımlı doğrulama (MFA): açan yöneticinin yetkileri ancak doğrulama koduyla girince çalışır
--  3) Güvenlik kayıtları (audit log)
-- 010'dan SONRA, bir kez çalıştır: SQL Editor > New query > yapıştır > Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 2) MFA: doğrulanmış bir faktörü olan hesap, yetkilerini ancak aal2 oturumunda kullanır
-- ---------------------------------------------------------------------
create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
$$;

create or replace function public.is_super() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_super from profiles where id = auth.uid()), false) and public.mfa_ok()
$$;

create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select pr.is_super or coalesce(r.permissions @> array[p], false)
    from profiles pr left join roles r on r.id = pr.role_id
    where pr.id = auth.uid()), false) and public.mfa_ok()
$$;

create or replace function public.can_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_super or role_id is not null from profiles where id = auth.uid()), false) and public.mfa_ok()
$$;

-- Sunucu ve arayüz için: etkin yetkiler (MFA dahil)
create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'is_super', public.is_super(),
    'mfa_ok', public.mfa_ok(),
    'perms', case when public.mfa_ok() then coalesce((select to_jsonb(r.permissions) from profiles p join roles r on r.id = p.role_id where p.id = auth.uid()), '[]'::jsonb) else '[]'::jsonb end)
$$;
revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

-- ---------------------------------------------------------------------
-- 3) Güvenlik kayıtları
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_name text not null default '',
  action text not null,
  target_id uuid,
  target_name text not null default '',
  detail text not null default ''
);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
drop policy if exists "kayıtlar okunur" on public.audit_log;
create policy "kayıtlar okunur" on public.audit_log for select to authenticated using (public.is_super());

create or replace function public.audit(p_action text, p_target uuid, p_target_name text, p_detail text) returns void
language sql security definer set search_path = public as $$
  insert into audit_log (actor, actor_name, action, target_id, target_name, detail)
  values (auth.uid(), coalesce((select coalesce(nullif(full_name, ''), username, student_no) from profiles where id = auth.uid()), 'sistem'),
          p_action, p_target, coalesce(p_target_name, ''), coalesce(p_detail, ''))
$$;
revoke all on function public.audit(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.audit(text, uuid, text, text) to service_role;

create or replace function public.audit_profiles() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  if tg_op = 'DELETE' then
    perform public.audit('hesap_silindi', old.id, coalesce(nullif(old.full_name, ''), old.username, old.student_no), '');
    return old;
  end if;
  nm := coalesce(nullif(new.full_name, ''), new.username, new.student_no);
  if new.status is distinct from old.status then
    perform public.audit('uyelik_durumu', new.id, nm, old.status || ' → ' || new.status);
  end if;
  if new.role_id is distinct from old.role_id then
    perform public.audit('rol_degisti', new.id, nm,
      coalesce((select name from roles where id = old.role_id), 'rol yok') || ' → ' || coalesce((select name from roles where id = new.role_id), 'rol yok'));
  end if;
  if new.is_super is distinct from old.is_super then
    perform public.audit('super_yetki', new.id, nm, case when new.is_super then 'verildi' else 'alındı' end);
  end if;
  if (new.phone is distinct from old.phone or new.contact_email is distinct from old.contact_email) and auth.uid() is distinct from new.id then
    perform public.audit('iletisim_bilgisi_degisti', new.id, nm, '');
  end if;
  return new;
end $$;
drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles after update or delete on public.profiles for each row execute function public.audit_profiles();

create or replace function public.audit_roles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then perform public.audit('rol_silindi', null, old.name, ''); return old; end if;
  if tg_op = 'INSERT' then perform public.audit('rol_eklendi', null, new.name, array_to_string(new.permissions, ', ')); return new; end if;
  if new.permissions is distinct from old.permissions or new.name is distinct from old.name then
    perform public.audit('rol_yetkileri', null, new.name, array_to_string(old.permissions, ', ') || ' → ' || array_to_string(new.permissions, ', '));
  end if;
  return new;
end $$;
drop trigger if exists audit_roles on public.roles;
create trigger audit_roles after insert or update or delete on public.roles for each row execute function public.audit_roles();

-- ---------------------------------------------------------------------
-- 1) Telefon ve e-posta: sadece kendisi ve süper yönetici
-- ---------------------------------------------------------------------
revoke select on public.profiles from anon, authenticated;
grant select (id, student_no, username, full_name, department, class_year, member_type, instruments, status,
              is_staff, is_super, role_id, kvkk_at, created_at, notify_mail, avatar_url, bio)
  on public.profiles to authenticated;

revoke select on public.instructors from anon, authenticated;
grant select (id, profile_id, full_name, instrument, kind, department, class_year, bio, active, created_at, avatar_url)
  on public.instructors to anon, authenticated;

-- Başkasının telefonunu / e-postasını sadece süper yönetici değiştirebilir
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;  -- SQL Editor / sunucu tarafı
  if not public.is_super() then
    if old.is_super and auth.uid() <> old.id then
      raise exception 'Süper yönetici hesabını sadece süper yönetici değiştirebilir.';
    end if;
    new.is_super := old.is_super;
    if auth.uid() <> old.id then
      new.phone := old.phone;
      new.contact_email := old.contact_email;
    end if;
    if not public.has_perm('roller') then
      new.role_id := old.role_id;
      new.is_staff := old.is_staff;
    end if;
    if not public.has_perm('uyeler') then
      new.status := old.status;
      new.student_no := old.student_no;
      new.username := old.username;
    end if;
  end if;
  new.id := old.id;
  return new;
end $$;

create or replace function public.protect_instructor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_super() then return new; end if;
  if not exists (select 1 from instructors where id = old.id and profile_id = auth.uid()) then
    new.phone := old.phone;
    new.email := old.email;
  end if;
  return new;
end $$;
drop trigger if exists protect_instructor on public.instructors;
create trigger protect_instructor before update on public.instructors for each row execute function public.protect_instructor();

-- Kendi iletişim bilgilerim (profil sayfası ve eğitmen paneli için)
create or replace function public.my_private() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'phone', p.phone, 'contact_email', p.contact_email,
    'instructor_phone', (select i.phone from instructors i where i.profile_id = p.id limit 1),
    'instructor_email', (select i.email from instructors i where i.profile_id = p.id limit 1))
  from profiles p where p.id = auth.uid()
$$;
revoke all on function public.my_private() from public, anon;
grant execute on function public.my_private() to authenticated;

-- Süper yönetici: tüm iletişim bilgileri
create or replace function public.admin_contacts()
returns table (id uuid, phone text, contact_email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'İletişim bilgilerini sadece süper yönetici görebilir.'; end if;
  return query select p.id, p.phone, p.contact_email from profiles p;
end $$;
revoke all on function public.admin_contacts() from public, anon;
grant execute on function public.admin_contacts() to authenticated;

create or replace function public.admin_instructor_contacts()
returns table (id uuid, phone text, email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'İletişim bilgilerini sadece süper yönetici görebilir.'; end if;
  return query select i.id, i.phone, i.email from instructors i;
end $$;
revoke all on function public.admin_instructor_contacts() from public, anon;
grant execute on function public.admin_instructor_contacts() to authenticated;

-- Yetkili, ilgilendiği talebin sahibine WhatsApp'tan yazabilsin (numara listede görünmez, erişim kayda geçer)
create or replace function public.request_contact(p_kind text, p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid; iid uuid; ph text; nm text;
begin
  if p_kind = 'prova' then
    if not public.has_perm('prova') then raise exception 'Yetkin yok.'; end if;
    select user_id into uid from prova_bookings where id = p_id;
  elsif p_kind = 'dinleti' then
    if not public.has_perm('dinletiler') then raise exception 'Yetkin yok.'; end if;
    select user_id into uid from dinleti_bookings where id = p_id;
  elsif p_kind = 'ders' then
    select user_id, instructor_id into uid, iid from lesson_bookings where id = p_id;
    if not (public.has_perm('kurslar') or public.is_instructor_owner(iid)) then raise exception 'Yetkin yok.'; end if;
  else
    raise exception 'Geçersiz istek.';
  end if;
  if uid is null then raise exception 'Kayıt bulunamadı.'; end if;
  select phone, coalesce(nullif(full_name, ''), student_no) into ph, nm from profiles where id = uid;
  insert into audit_log (actor, actor_name, action, target_id, target_name, detail)
  values (auth.uid(), coalesce((select coalesce(nullif(full_name, ''), username, student_no) from profiles where id = auth.uid()), ''),
          'iletisim_acildi', uid, nm, p_kind);
  return coalesce(ph, '');
end $$;
revoke all on function public.request_contact(text, uuid) from public, anon;
grant execute on function public.request_contact(text, uuid) to authenticated;

-- Talep listelerinde telefon / e-posta sadece süper yöneticiye dolu gelir
create or replace function public.lesson_requests(p_instructor uuid)
returns table (id uuid, weekday int, hour int, status text, created_at timestamptz, decided_at timestamptz,
               full_name text, student_no text, phone text, contact_email text)
language plpgsql stable security definer set search_path = public as $$
declare sup boolean := public.is_super();
begin
  if not (public.has_perm('kurslar') or public.is_instructor_owner(p_instructor)) then
    raise exception 'Bu eğitmenin taleplerini görme yetkin yok.';
  end if;
  return query
    select b.id, b.weekday, b.hour, b.status, b.created_at, b.decided_at,
           p.full_name, p.student_no, case when sup then p.phone else '' end, case when sup then p.contact_email else '' end
    from lesson_bookings b join profiles p on p.id = b.user_id
    where b.instructor_id = p_instructor
    order by (b.status = 'bekliyor') desc, b.weekday, b.hour, b.created_at;
end $$;

create or replace function public.prova_requests(p_from date)
returns table (id uuid, slot_id uuid, day date, start_time time, end_time time, status text, note text,
               created_at timestamptz, decided_at timestamptz, full_name text, student_no text, phone text,
               contact_email text, department text, class_year text, member_type text, instruments text[])
language plpgsql stable security definer set search_path = public as $$
declare sup boolean := public.is_super();
begin
  if not public.has_perm('prova') then raise exception 'Prova talepleri için yetkin yok.'; end if;
  return query
    select b.id, b.slot_id, b.day, s.start_time, s.end_time, b.status, b.note, b.created_at, b.decided_at,
           p.full_name, p.student_no, case when sup then p.phone else '' end, case when sup then p.contact_email else '' end,
           p.department, p.class_year, p.member_type, p.instruments
    from prova_bookings b join profiles p on p.id = b.user_id join prova_slots s on s.id = b.slot_id
    where b.day >= p_from
    order by (b.status = 'bekliyor') desc, b.day, s.start_time, b.created_at;
end $$;

create or replace function public.dinleti_requests(p_from date)
returns table (id uuid, dinleti_id uuid, day date, title text, start_time time, slot_minutes int, slot_index int,
               status text, perf_type text, performer text, display_name text, people_count int, members text,
               repertoire text, equipment text[], video_url text, note text, created_at timestamptz, decided_at timestamptz,
               full_name text, student_no text, phone text, contact_email text, department text, class_year text, instruments text[])
language plpgsql stable security definer set search_path = public as $$
declare sup boolean := public.is_super();
begin
  if not public.has_perm('dinletiler') then raise exception 'Dinleti başvuruları için yetkin yok.'; end if;
  return query
    select b.id, b.dinleti_id, d.day, d.title, d.start_time, d.slot_minutes, b.slot_index,
           b.status, b.perf_type, b.performer, b.display_name, b.people_count, b.members,
           b.repertoire, b.equipment, b.video_url, b.note, b.created_at, b.decided_at,
           p.full_name, p.student_no, case when sup then p.phone else '' end, case when sup then p.contact_email else '' end,
           p.department, p.class_year, p.instruments
    from dinleti_bookings b join dinletiler d on d.id = b.dinleti_id join profiles p on p.id = b.user_id
    where d.day >= p_from
    order by (b.status = 'bekliyor') desc, d.day, b.slot_index, b.created_at;
end $$;

create or replace function public.prova_attendance_list(p_from date, p_to date)
returns table (booking_id uuid, day date, start_time time, end_time time, full_name text, student_no text, phone text,
               check_in_at timestamptz, check_out_at timestamptz, key_returned boolean, key_note text)
language plpgsql stable security definer set search_path = public as $$
declare sup boolean := public.is_super();
begin
  if not public.has_perm('prova') then raise exception 'Yetkin yok.'; end if;
  return query
    select pb.id, pb.day, s.start_time, s.end_time, p.full_name, p.student_no, case when sup then p.phone else '' end,
           pa.check_in_at, pa.check_out_at, coalesce(pa.key_returned, false), coalesce(pa.key_note, '')
    from prova_bookings pb join prova_slots s on s.id = pb.slot_id join profiles p on p.id = pb.user_id
    left join prova_attendance pa on pa.booking_id = pb.id
    where pb.status = 'onaylandi' and pb.day between p_from and p_to
    order by pb.day desc, s.start_time;
end $$;

grant execute on all functions in schema public to service_role;
notify pgrst, 'reload schema';
