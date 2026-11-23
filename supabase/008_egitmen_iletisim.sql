-- =====================================================================
-- BÜMT — Eğitmen WhatsApp numarası: eğitmen kaydında yoksa bağlı üye hesabındaki telefon kullanılır.
-- Sadece onaylı üyeler görebilir.
-- SQL Editor > New query > yapıştır > Run
-- =====================================================================
create or replace function public.instructor_contact(p_instructor uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare ph text;
begin
  if not public.is_approved() then raise exception 'İletişim bilgisi sadece onaylı üyelere görünür.'; end if;
  select coalesce(nullif(trim(i.phone), ''), p.phone, '') into ph
  from instructors i left join profiles p on p.id = i.profile_id
  where i.id = p_instructor and i.active;
  return coalesce(ph, '');
end $$;
revoke all on function public.instructor_contact(uuid) from public, anon;
grant execute on function public.instructor_contact(uuid) to authenticated, service_role;
notify pgrst, 'reload schema';
