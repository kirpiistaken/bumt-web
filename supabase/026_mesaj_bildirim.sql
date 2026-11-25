-- =====================================================================
-- BÜMT — Yeni mesaj geldiğinde e-posta bildirimi tercihi
-- SQL Editor > New query > yapıştır > Run
-- =====================================================================
alter table public.profiles add column if not exists notify_dm boolean not null default true;
grant select (notify_dm) on public.profiles to authenticated;
-- (güncellemeyi üye kendi profilinden yapar; mevcut profil update kuralı yeterli)
notify pgrst, 'reload schema';
