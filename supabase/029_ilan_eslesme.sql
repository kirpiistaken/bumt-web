-- =====================================================================
-- BÜMT — Müzisyen pazarı: yeni ilan açılınca aranan enstrümanı çalan
-- üyelere e-posta. (Herkes için varsayılan: açık; Profilim'den kapatılabilir)
-- SQL Editor > New query > yapıştır > Run
-- =====================================================================
alter table public.profiles add column if not exists notify_match boolean not null default true;
grant select (notify_match) on public.profiles to authenticated;

alter table public.market_posts add column if not exists match_notified_at timestamptz;
grant select (match_notified_at) on public.market_posts to anon, authenticated;

notify pgrst, 'reload schema';
