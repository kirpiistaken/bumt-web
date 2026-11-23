-- =====================================================================
-- BÜMT — Profil fotoğrafı ve biyografi
-- SQL Editor > New query > yapıştır > Run
-- =====================================================================

alter table public.profiles add column if not exists avatar_url text not null default '';
alter table public.profiles add column if not exists bio text not null default '';
alter table public.instructors add column if not exists avatar_url text not null default '';
alter table public.market_posts add column if not exists avatar_url text not null default '';

-- Eğitmen fotoğrafı herkese görünsün (telefon hâlâ gizli)
grant select (avatar_url, email) on public.instructors to authenticated;
grant select (avatar_url) on public.instructors to anon;

-- Fotoğraf deposu: herkes görür; her üye sadece kendi klasörüne, kurs yetkilisi "instructors" klasörüne yükler
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "avatarlar okunur" on storage.objects;
drop policy if exists "avatar yüklenir" on storage.objects;
drop policy if exists "avatar güncellenir" on storage.objects;
drop policy if exists "avatar silinir" on storage.objects;
create policy "avatarlar okunur" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatar yüklenir" on storage.objects for insert to authenticated with check (
  bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text
    or ((storage.foldername(name))[1] = 'instructors' and public.has_perm('kurslar'))));
create policy "avatar güncellenir" on storage.objects for update to authenticated using (
  bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text
    or ((storage.foldername(name))[1] = 'instructors' and public.has_perm('kurslar'))));
create policy "avatar silinir" on storage.objects for delete to authenticated using (
  bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text
    or ((storage.foldername(name))[1] = 'instructors' and public.has_perm('kurslar'))));

-- Profil fotoğrafı değişince eğitmen kaydına ve ilanlara da yansısın
create or replace function public.sync_avatar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.avatar_url is distinct from old.avatar_url then
    update instructors set avatar_url = new.avatar_url where profile_id = new.id;
    update market_posts set avatar_url = new.avatar_url where user_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists sync_avatar on public.profiles;
create trigger sync_avatar after update on public.profiles for each row execute function public.sync_avatar();

create or replace function public.instructor_avatar_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is not null and (coalesce(new.avatar_url, '') = ''
     or (tg_op = 'UPDATE' and new.profile_id is distinct from old.profile_id)) then
    new.avatar_url := coalesce((select avatar_url from profiles where id = new.profile_id), '');
  end if;
  return new;
end $$;
drop trigger if exists instructor_avatar_default on public.instructors;
create trigger instructor_avatar_default before insert or update on public.instructors
  for each row execute function public.instructor_avatar_default();
update public.instructors i set avatar_url = p.avatar_url from public.profiles p where p.id = i.profile_id and i.avatar_url = '';

create or replace function public.check_market_post() returns trigger
language plpgsql security definer set search_path = public as $$
declare p profiles; n int;
begin
  select * into p from profiles where id = coalesce(new.user_id, old.user_id);
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
  new.avatar_url := coalesce(p.avatar_url, '');
  return new;
end $$;
update public.market_posts m set avatar_url = p.avatar_url from public.profiles p where p.id = m.user_id;

-- Üye kartı: onaylı üyeler birbirinin fotoğrafını, biyografisini ve müzik bilgisini görebilir (telefon / numara yok)
create or replace function public.member_card(p_id uuid)
returns table (id uuid, full_name text, avatar_url text, bio text, member_type text, instruments text[],
               department text, class_year text, instructor_of text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_approved() then raise exception 'Üye profillerini onaylı üyeler görebilir.'; end if;
  return query
    select p.id, p.full_name, p.avatar_url, p.bio, p.member_type, p.instruments, p.department, p.class_year,
           (select string_agg(i.instrument, ', ') from instructors i where i.profile_id = p.id and i.active)
    from profiles p where p.id = p_id and p.status = 'onaylandi' and not p.is_staff;
end $$;
revoke all on function public.member_card(uuid) from public, anon;
grant execute on function public.member_card(uuid) to authenticated;

grant execute on all functions in schema public to service_role;
notify pgrst, 'reload schema';
