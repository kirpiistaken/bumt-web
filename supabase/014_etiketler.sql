-- =====================================================================
-- BÜMT — Üye etiketleri (ör. Rock & Metal Komitesi, Caz Komitesi), renkleriyle
-- SQL Editor > New query > yapıştır > Run
-- =====================================================================
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#D7301F' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.profile_tags (
  profile_id uuid not null references public.profiles on delete cascade,
  tag_id uuid not null references public.tags on delete cascade,
  primary key (profile_id, tag_id)
);
alter table public.tags enable row level security;
alter table public.profile_tags enable row level security;
grant select on public.tags, public.profile_tags to anon, authenticated;
grant insert, update, delete on public.tags, public.profile_tags to authenticated;
grant all on public.tags, public.profile_tags to service_role;

drop policy if exists "etiketler okunur" on public.tags;
drop policy if exists "etiket yönetimi" on public.tags;
drop policy if exists "üye etiketleri okunur" on public.profile_tags;
drop policy if exists "üye etiketi yönetimi" on public.profile_tags;
create policy "etiketler okunur" on public.tags for select using (true);
create policy "etiket yönetimi" on public.tags for all to authenticated using (public.has_perm('uyeler')) with check (public.has_perm('uyeler'));
create policy "üye etiketleri okunur" on public.profile_tags for select using (true);
create policy "üye etiketi yönetimi" on public.profile_tags for all to authenticated using (public.has_perm('uyeler')) with check (public.has_perm('uyeler'));

insert into public.tags (name, color, sort) values ('Rock & Metal Komitesi', '#141414', 1) on conflict (name) do nothing;
notify pgrst, 'reload schema';
