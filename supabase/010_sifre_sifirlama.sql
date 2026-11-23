-- =====================================================================
-- BÜMT — E-postayla şifre sıfırlama
-- SQL Editor > New query > yapıştır > Run
-- =====================================================================
create table if not exists public.password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists password_resets_user on public.password_resets (user_id, created_at desc);
alter table public.password_resets enable row level security;
-- Sadece sunucu erişir: anon/authenticated için hiçbir izin yok
revoke all on public.password_resets from anon, authenticated;
grant all on public.password_resets to service_role;
notify pgrst, 'reload schema';
