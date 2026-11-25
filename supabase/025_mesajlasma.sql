-- =====================================================================
-- BÜMT — Site içi mesajlaşma (WhatsApp paylaşmak istemeyenler için)
-- + ilanlarda/eğitmende iletişim tercihi (whatsapp / chat / both)
-- SQL Editor > New query > yapıştır > Run
-- =====================================================================

-- İletişim tercihi: 'whatsapp' (numara/WhatsApp), 'chat' (site mesajı), 'both'
alter table public.market_posts    add column if not exists contact_pref text not null default 'whatsapp';
alter table public.equipment_posts add column if not exists contact_pref text not null default 'whatsapp';
alter table public.instructors     add column if not exists contact_pref text not null default 'whatsapp';
grant select (contact_pref) on public.market_posts    to anon, authenticated;
grant select (contact_pref) on public.equipment_posts to anon, authenticated;
grant select (contact_pref) on public.instructors     to anon, authenticated;

-- ---- Konuşmalar ----------------------------------------------------
create table if not exists public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  u_lo uuid not null references public.profiles on delete cascade,
  u_hi uuid not null references public.profiles on delete cascade,
  context_type text not null default 'direct',   -- market | equipment | instructor | direct
  context_id uuid not null default '00000000-0000-0000-0000-000000000000',
  context_title text not null default '',
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check (u_lo < u_hi)
);
create unique index if not exists dm_threads_uniq on public.dm_threads (u_lo, u_hi, context_type, context_id);

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dm_threads on delete cascade,
  sender_id uuid not null references public.profiles on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists dm_messages_thread on public.dm_messages (thread_id, created_at);

alter table public.dm_threads enable row level security;
alter table public.dm_messages enable row level security;
grant select on public.dm_threads to authenticated;
grant select on public.dm_messages to authenticated;
grant all on public.dm_threads, public.dm_messages to service_role;

drop policy if exists "konusmalarim" on public.dm_threads;
create policy "konusmalarim" on public.dm_threads for select to authenticated
  using (auth.uid() in (u_lo, u_hi) or public.has_perm('uyeler'));
drop policy if exists "mesajlarim" on public.dm_messages;
create policy "mesajlarim" on public.dm_messages for select to authenticated
  using (exists (select 1 from public.dm_threads t where t.id = thread_id
    and (auth.uid() in (t.u_lo, t.u_hi) or public.has_perm('uyeler'))));

-- ---- Konuşma başlat ------------------------------------------------
create or replace function public.dm_start(p_other uuid, p_ctype text default 'direct', p_cid uuid default null, p_title text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare lo uuid; hi uuid; tid uuid; st text;
begin
  if not public.is_approved() then raise exception 'Mesaj göndermek için üyeliğinin onaylı olması gerekir.'; end if;
  if p_other = auth.uid() then raise exception 'Kendine mesaj gönderemezsin.'; end if;
  select status into st from profiles where id = p_other;
  if st is distinct from 'onaylandi' then raise exception 'Bu üyeye şu an mesaj gönderilemiyor.'; end if;
  if auth.uid() < p_other then lo := auth.uid(); hi := p_other; else lo := p_other; hi := auth.uid(); end if;
  insert into dm_threads (u_lo, u_hi, context_type, context_id, context_title)
    values (lo, hi, coalesce(p_ctype, 'direct'), coalesce(p_cid, '00000000-0000-0000-0000-000000000000'), left(coalesce(p_title, ''), 120))
    on conflict (u_lo, u_hi, context_type, context_id) do update set context_title = excluded.context_title
    returning id into tid;
  return tid;
end $$;

-- ---- Mesaj gönder --------------------------------------------------
create or replace function public.dm_send(p_thread uuid, p_body text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare t dm_threads; ts timestamptz := now();
begin
  select * into t from dm_threads where id = p_thread;
  if t.id is null then raise exception 'Konuşma bulunamadı.'; end if;
  if auth.uid() not in (t.u_lo, t.u_hi) then raise exception 'Bu konuşmaya erişimin yok.'; end if;
  if not public.is_approved() then raise exception 'Üyeliğin onaylı olmalı.'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception 'Boş mesaj gönderilemez.'; end if;
  insert into dm_messages (thread_id, sender_id, body) values (p_thread, auth.uid(), left(trim(p_body), 2000));
  update dm_threads set last_message_at = ts where id = p_thread;
  return ts;
end $$;

-- ---- Okundu işaretle ----------------------------------------------
create or replace function public.dm_mark_read(p_thread uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from dm_threads where id = p_thread and auth.uid() in (u_lo, u_hi)) then
    update dm_messages set read_at = now() where thread_id = p_thread and sender_id <> auth.uid() and read_at is null;
  end if;
end $$;

-- ---- Okunmamış mesaj sayısı ---------------------------------------
create or replace function public.dm_unread()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from dm_messages m join dm_threads t on t.id = m.thread_id
    where auth.uid() in (t.u_lo, t.u_hi) and m.sender_id <> auth.uid() and m.read_at is null;
$$;

-- ---- Konuşma listem (karşı taraf + son mesaj + okunmamış) ----------
create or replace function public.my_threads()
returns table (thread_id uuid, other_id uuid, other_name text, other_avatar text,
               context_type text, context_title text, last_message_at timestamptz,
               last_body text, last_sender uuid, unread int)
language sql stable security definer set search_path = public as $$
  select t.id,
    (case when t.u_lo = auth.uid() then t.u_hi else t.u_lo end),
    public.short_name(op.full_name), coalesce(op.avatar_url, ''),
    t.context_type, t.context_title, t.last_message_at,
    lm.body, lm.sender_id,
    (select count(*)::int from dm_messages m where m.thread_id = t.id and m.sender_id <> auth.uid() and m.read_at is null)
  from dm_threads t
  join profiles op on op.id = (case when t.u_lo = auth.uid() then t.u_hi else t.u_lo end)
  left join lateral (select body, sender_id from dm_messages m where m.thread_id = t.id order by m.created_at desc limit 1) lm on true
  where auth.uid() in (t.u_lo, t.u_hi)
  order by t.last_message_at desc;
$$;

revoke all on function public.dm_start(uuid, text, uuid, text) from public, anon;
revoke all on function public.dm_send(uuid, text) from public, anon;
revoke all on function public.dm_mark_read(uuid) from public, anon;
revoke all on function public.dm_unread() from public, anon;
revoke all on function public.my_threads() from public, anon;
grant execute on function public.dm_start(uuid, text, uuid, text), public.dm_send(uuid, text), public.dm_mark_read(uuid), public.dm_unread(), public.my_threads() to authenticated;

notify pgrst, 'reload schema';
