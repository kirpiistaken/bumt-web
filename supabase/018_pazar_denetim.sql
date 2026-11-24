-- =====================================================================
-- BÜMT — Müzisyen pazarı ilan denetimi (küfür/müstehcenlik kontrolü + yönetime e-posta)
-- SQL Editor > New query > yapıştır > Run
-- =====================================================================
-- review: ''            → yayında
--         'kontrol'     → otomatik kontrol bekliyor (birkaç saniye)
--         'incelemede'  → uygunsuz olabilir, yönetim onayı bekliyor
alter table public.market_posts add column if not exists review text not null default '';
alter table public.market_posts add column if not exists review_reason text not null default '';
alter table public.market_posts add column if not exists review_token uuid not null default gen_random_uuid();
revoke select (review_token) on public.market_posts from anon, authenticated;
-- (tablo düzeyinde select verildiği için sütun bazında yeniden düzenle)
revoke select on public.market_posts from anon, authenticated;
grant select (id, user_id, kind, title, my_role, looking_for, genre, description, display_name, avatar_url, active, created_at, review, review_reason)
  on public.market_posts to anon, authenticated;

create or replace function public.check_market_post() returns trigger
language plpgsql security definer set search_path = public as $$
declare p profiles; n int;
  is_server boolean := coalesce(auth.jwt()->>'role', '') = 'service_role' or current_setting('role', true) = 'service_role';
begin
  select * into p from profiles where id = coalesce(new.user_id, old.user_id);
  if tg_op = 'INSERT' then
    if not is_server then
      if p.id is null or p.status <> 'onaylandi' then raise exception 'İlan vermek için üyeliğinin onaylanmış olması gerekir.'; end if;
      if p.member_type <> 'muzisyen' then raise exception 'İlanı sadece müzisyen üyeler verebilir. Profilinden "Müzisyen" seçebilirsin.'; end if;
      select count(*) into n from market_posts where user_id = new.user_id and active;
      if n >= 3 then raise exception 'Aynı anda en fazla 3 açık ilanın olabilir.'; end if;
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
        null; -- yönetim review alanını değiştirebilir (ör. yayına alma)
      else
        new.review := old.review; new.review_reason := old.review_reason;
        if new.title is distinct from old.title or new.description is distinct from old.description or new.my_role is distinct from old.my_role
           or new.genre is distinct from old.genre or new.looking_for is distinct from old.looking_for or new.kind is distinct from old.kind then
          new.review := 'kontrol'; new.review_reason := '';
        end if;
      end if;
    end if;
  end if;
  new.title := left(trim(new.title), 80);
  new.description := left(coalesce(new.description, ''), 1000);
  new.display_name := public.short_name(p.full_name);
  new.avatar_url := coalesce(p.avatar_url, '');
  return new;
end $$;

drop policy if exists "ilanlar okunur" on public.market_posts;
create policy "ilanlar okunur" on public.market_posts for select
  using ((active and review = '') or user_id = auth.uid() or public.has_perm('uyeler'));

-- Kontrol edilmeden önce iletişim bilgisi de verilmesin
create or replace function public.market_contact(p_post uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare ph text;
begin
  if not public.is_approved() then raise exception 'İletişim bilgisi sadece onaylı üyelere görünür.'; end if;
  select p.phone into ph from market_posts m join profiles p on p.id = m.user_id where m.id = p_post and m.active and m.review = '';
  return coalesce(ph, '');
end $$;

-- Mevcut ilanlar yayında kalsın
update public.market_posts set review = '' where review is null;
notify pgrst, 'reload schema';
