-- =====================================================================
-- BÜMT — Ana sayfada gösterilecek Instagram gönderileri
-- SQL Editor > New query > yapıştır > Run
-- =====================================================================
alter table public.settings add column if not exists instagram_posts text[] not null default '{}';
grant select (instagram_posts) on public.settings to anon, authenticated;
drop policy if exists "settings etkinlik" on public.settings;
create policy "settings etkinlik" on public.settings for update to authenticated using (public.has_perm('etkinlikler'));
notify pgrst, 'reload schema';
