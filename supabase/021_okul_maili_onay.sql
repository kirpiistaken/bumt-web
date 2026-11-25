-- =====================================================================
-- BÜMT — Okul maili (@mail.baskent.edu.tr) ile otomatik üyelik onayı
-- SQL Editor > New query > yapıştır > Run
-- =====================================================================
create table if not exists public.school_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.school_verifications enable row level security;
revoke all on public.school_verifications from anon, authenticated;
grant all on public.school_verifications to service_role;

alter table public.profiles add column if not exists school_verified_at timestamptz;
grant select (school_verified_at) on public.profiles to authenticated;
notify pgrst, 'reload schema';
