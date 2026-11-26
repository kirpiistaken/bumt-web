-- =====================================================================
-- BÜMT — Etkinlik / duyuru e-postaları (bülten)
-- * profiles.news_mail: duyuru e-postası alsın mı (mevcut herkes: evet)
-- * profiles.unsub_token: e-postadaki "abonelikten çık" linki için gizli anahtar
-- * events.mailed_at / mailed_count: ne zaman, kaç kişiye gönderildi
-- SQL Editor > New query > yapıştır > Run
-- =====================================================================
alter table public.profiles add column if not exists news_mail boolean not null default true;
alter table public.profiles add column if not exists unsub_token uuid not null default gen_random_uuid();
create unique index if not exists profiles_unsub_token_idx on public.profiles (unsub_token);
grant select (news_mail) on public.profiles to authenticated;
-- unsub_token kimseye açılmaz (sadece sunucu okur)

alter table public.events add column if not exists mailed_at timestamptz;
alter table public.events add column if not exists mailed_count int not null default 0;

-- Kayıt formundaki "duyuru e-postaları gelsin" kutusu (işaret kaldırıldıysa kapalı başlar)
create or replace function public.profile_news_from_meta() returns trigger
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  select raw_user_meta_data->>'news_mail' into v from auth.users where id = new.id;
  if v = 'false' then new.news_mail := false; end if;
  return new;
end $$;
drop trigger if exists profile_news_from_meta on public.profiles;
create trigger profile_news_from_meta before insert on public.profiles
  for each row execute function public.profile_news_from_meta();

notify pgrst, 'reload schema';
