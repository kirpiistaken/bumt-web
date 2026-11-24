-- BÜMT — Etkinliklere Google Maps konum linki.  SQL Editor > New query > yapıştır > Run
alter table public.events add column if not exists maps_url text not null default '';
notify pgrst, 'reload schema';
