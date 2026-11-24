-- =====================================================================
-- BÜMT — Hesaba bağlı eğitmenlerde fakülte / bölüm / sınıf üyenin kendi profilinden gelir
-- (önce 015_fakulte.sql çalışmış olmalı)  SQL Editor > New query > yapıştır > Run
-- =====================================================================
create or replace function public.instructor_from_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if new.profile_id is not null then
    select faculty, department, class_year into p from profiles where id = new.profile_id;
    if found then
      new.faculty := coalesce(p.faculty, ''); new.department := coalesce(p.department, ''); new.class_year := coalesce(p.class_year, '');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists instructor_from_profile on public.instructors;
create trigger instructor_from_profile before insert or update on public.instructors
  for each row execute function public.instructor_from_profile();

create or replace function public.profile_to_instructor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.faculty is distinct from old.faculty or new.department is distinct from old.department or new.class_year is distinct from old.class_year then
    update instructors set faculty = new.faculty, department = new.department, class_year = new.class_year where profile_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists profile_to_instructor on public.profiles;
create trigger profile_to_instructor after update on public.profiles
  for each row execute function public.profile_to_instructor();

-- Mevcut bağlı eğitmenleri bir kez eşitle
update public.instructors i set faculty = p.faculty, department = p.department, class_year = p.class_year
  from public.profiles p where i.profile_id = p.id;

notify pgrst, 'reload schema';
