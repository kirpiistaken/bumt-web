-- =====================================================================
-- BÜMT — Üye profil fotoğrafı/adı değişince eski ilanlardaki kopyaları da güncelle
-- (önce 018 ve 022 çalışmış olmalı)  SQL Editor > New query > yapıştır > Run
-- =====================================================================
create or replace function public.profile_to_posts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.avatar_url is distinct from old.avatar_url or new.full_name is distinct from old.full_name then
    update market_posts set avatar_url = coalesce(new.avatar_url, ''), display_name = public.short_name(new.full_name) where user_id = new.id;
    update equipment_posts set avatar_url = coalesce(new.avatar_url, ''), display_name = public.short_name(new.full_name) where user_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists profile_to_posts on public.profiles;
create trigger profile_to_posts after update on public.profiles
  for each row execute function public.profile_to_posts();

-- Mevcut ilanları bir kez güncelle (eski ilanlardaki eksik fotoğraflar düzelsin)
update public.market_posts m set avatar_url = coalesce(p.avatar_url, ''), display_name = public.short_name(p.full_name)
  from public.profiles p where p.id = m.user_id;
update public.equipment_posts m set avatar_url = coalesce(p.avatar_url, ''), display_name = public.short_name(p.full_name)
  from public.profiles p where p.id = m.user_id;

notify pgrst, 'reload schema';
