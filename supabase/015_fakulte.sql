-- =====================================================================
-- BÜMT — Üyelere ve eğitmenlere "Fakülte" alanı
-- SQL Editor > New query > yapıştır > Run
-- =====================================================================
alter table public.profiles add column if not exists faculty text not null default '';
alter table public.instructors add column if not exists faculty text not null default '';

grant select (faculty) on public.profiles to authenticated;
grant select (faculty) on public.instructors to anon, authenticated;

-- Kayıt olurken seçilen fakülteyi profile yaz
create or replace function public.set_faculty_from_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set faculty = left(coalesce(new.raw_user_meta_data->>'faculty', ''), 120) where id = new.id;
  return new;
end $$;
drop trigger if exists on_auth_user_faculty on auth.users;
create trigger on_auth_user_faculty
  after insert on auth.users for each row execute function public.set_faculty_from_signup();

-- Üye kartında fakülte de görünsün
drop function if exists public.member_card(uuid);
create function public.member_card(p_id uuid)
returns table (id uuid, full_name text, avatar_url text, bio text, member_type text, instruments text[],
               department text, class_year text, instructor_of text, faculty text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_approved() then raise exception 'Üye profillerini onaylı üyeler görebilir.'; end if;
  return query
    select p.id, p.full_name, p.avatar_url, p.bio, p.member_type, p.instruments, p.department, p.class_year,
           (select string_agg(i.instrument, ', ') from instructors i where i.profile_id = p.id and i.active),
           p.faculty
    from profiles p where p.id = p_id and p.status = 'onaylandi' and not p.is_staff;
end $$;
revoke all on function public.member_card(uuid) from public, anon;
grant execute on function public.member_card(uuid) to authenticated;

notify pgrst, 'reload schema';
