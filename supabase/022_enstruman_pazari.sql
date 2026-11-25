-- =====================================================================
-- BÜMT — Enstrüman pazarı (ikinci el enstrüman/ekipman satış ilanları)
-- Bu tablolar gerçek sitede görünmez; sadece önizleme (preview) dalındaki kod kullanır.
-- SQL Editor > New query > yapıştır > Run
-- =====================================================================
create table if not exists public.equipment_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  category text not null default 'Diğer',
  title text not null,
  price int,                                   -- null = fiyat belirtilmemiş
  is_negotiable boolean not null default false,
  condition text not null default 'ikinci_el', -- sifir | az_kullanilmis | ikinci_el
  description text not null default '',
  photos text[] not null default '{}',
  sold boolean not null default false,
  active boolean not null default true,
  review text not null default '',             -- '' yayında | kontrol | incelemede
  review_reason text not null default '',
  review_token uuid not null default gen_random_uuid(),
  display_name text not null default '',
  avatar_url text not null default '',
  created_at timestamptz not null default now()
);
alter table public.equipment_posts enable row level security;
revoke select on public.equipment_posts from anon, authenticated;
grant select (id, user_id, category, title, price, is_negotiable, condition, description, photos,
              sold, active, created_at, review, review_reason, display_name, avatar_url)
  on public.equipment_posts to anon, authenticated;
grant insert, update, delete on public.equipment_posts to authenticated;
grant all on public.equipment_posts to service_role;

create or replace function public.check_equipment_post() returns trigger
language plpgsql security definer set search_path = public as $$
declare p profiles; n int;
  is_server boolean := coalesce(auth.jwt()->>'role', '') = 'service_role' or current_setting('role', true) = 'service_role';
begin
  select * into p from profiles where id = coalesce(new.user_id, old.user_id);
  if tg_op = 'INSERT' then
    if not is_server then
      if p.id is null or p.status <> 'onaylandi' then raise exception 'İlan vermek için üyeliğinin onaylanmış olması gerekir.'; end if;
      select count(*) into n from equipment_posts where user_id = new.user_id and active;
      if n >= 5 then raise exception 'Aynı anda en fazla 5 açık ilanın olabilir.'; end if;
      new.review := 'kontrol'; new.review_reason := '';
    end if;
    new.created_at := now();
    new.review_token := gen_random_uuid();
  else
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    new.review_token := old.review_token;
    if not is_server then
      if public.has_perm('uyeler') and old.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) then
        null; -- yönetim yayına alma/kaldırma yapabilir
      else
        new.review := old.review; new.review_reason := old.review_reason;
        if new.title is distinct from old.title or new.description is distinct from old.description
           or new.category is distinct from old.category then
          new.review := 'kontrol'; new.review_reason := '';
        end if;
      end if;
    end if;
  end if;
  if new.price is not null and new.price < 0 then new.price := 0; end if;
  if new.price is not null and new.price > 100000000 then new.price := 100000000; end if;
  new.title := left(trim(new.title), 80);
  new.description := left(coalesce(new.description, ''), 1500);
  if coalesce(array_length(new.photos, 1), 0) > 4 then new.photos := new.photos[1:4]; end if;
  new.display_name := public.short_name(p.full_name);
  new.avatar_url := coalesce(p.avatar_url, '');
  return new;
end $$;
drop trigger if exists check_equipment_post on public.equipment_posts;
create trigger check_equipment_post before insert or update on public.equipment_posts
  for each row execute function public.check_equipment_post();

drop policy if exists "ekipman okunur" on public.equipment_posts;
drop policy if exists "ekipman verilir" on public.equipment_posts;
drop policy if exists "ekipman güncellenir" on public.equipment_posts;
drop policy if exists "ekipman silinir" on public.equipment_posts;
create policy "ekipman okunur" on public.equipment_posts for select
  using ((active and review = '') or user_id = auth.uid() or public.has_perm('uyeler'));
create policy "ekipman verilir" on public.equipment_posts for insert to authenticated with check (user_id = auth.uid());
create policy "ekipman güncellenir" on public.equipment_posts for update to authenticated using (user_id = auth.uid() or public.has_perm('uyeler'));
create policy "ekipman silinir" on public.equipment_posts for delete to authenticated using (user_id = auth.uid() or public.has_perm('uyeler'));

-- İlan sahibinin telefonu sadece onaylı üyelere, yayındaki ilan için
create or replace function public.equipment_contact(p_post uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare ph text;
begin
  if not public.is_approved() then raise exception 'İletişim bilgisi sadece onaylı üyelere görünür.'; end if;
  select p.phone into ph from equipment_posts m join profiles p on p.id = m.user_id
    where m.id = p_post and m.active and m.review = '';
  return coalesce(ph, '');
end $$;
revoke all on function public.equipment_contact(uuid) from public, anon;
grant execute on function public.equipment_contact(uuid) to authenticated, service_role;

-- Fotoğraf deposu (herkese açık okunur, sahibi kendi klasörüne yükler)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('equipment', 'equipment', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "ekipman foto okunur" on storage.objects;
drop policy if exists "ekipman foto yüklenir" on storage.objects;
drop policy if exists "ekipman foto güncellenir" on storage.objects;
drop policy if exists "ekipman foto silinir" on storage.objects;
create policy "ekipman foto okunur" on storage.objects for select using (bucket_id = 'equipment');
create policy "ekipman foto yüklenir" on storage.objects for insert to authenticated with check (
  bucket_id = 'equipment' and ((storage.foldername(name))[1] = auth.uid()::text or public.has_perm('uyeler')));
create policy "ekipman foto güncellenir" on storage.objects for update to authenticated using (
  bucket_id = 'equipment' and ((storage.foldername(name))[1] = auth.uid()::text or public.has_perm('uyeler')));
create policy "ekipman foto silinir" on storage.objects for delete to authenticated using (
  bucket_id = 'equipment' and ((storage.foldername(name))[1] = auth.uid()::text or public.has_perm('uyeler')));

notify pgrst, 'reload schema';
