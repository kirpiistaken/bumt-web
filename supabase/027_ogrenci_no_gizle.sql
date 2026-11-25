-- =====================================================================
-- BÜMT — Eğitmenler, ders talebi gönderen öğrencilerin öğrenci
-- numarasını görmesin. (Sadece "kurslar" yetkili yöneticiler görür.)
-- SQL Editor > New query > yapıştır > Run
-- =====================================================================
create or replace function public.lesson_requests(p_instructor uuid)
returns table (id uuid, weekday int, hour int, status text, created_at timestamptz, decided_at timestamptz,
               full_name text, student_no text, phone text, contact_email text)
language plpgsql stable security definer set search_path = public as $$
declare sup boolean := public.is_super(); adm boolean := public.has_perm('kurslar');
begin
  if not (adm or public.is_instructor_owner(p_instructor)) then
    raise exception 'Bu eğitmenin taleplerini görme yetkin yok.';
  end if;
  return query
    select b.id, b.weekday, b.hour, b.status, b.created_at, b.decided_at,
           p.full_name, case when adm then p.student_no else '' end,
           case when sup then p.phone else '' end, case when sup then p.contact_email else '' end
    from lesson_bookings b join profiles p on p.id = b.user_id
    where b.instructor_id = p_instructor
    order by (b.status = 'bekliyor') desc, b.weekday, b.hour, b.created_at;
end $$;
notify pgrst, 'reload schema';
