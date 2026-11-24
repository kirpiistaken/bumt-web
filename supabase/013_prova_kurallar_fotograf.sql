-- =====================================================================
-- BÜMT — Prova odası kuralları + çıkışta 3 fotoğraf + yetkili kontrolü
-- 012'den SONRA, bir kez çalıştır: SQL Editor > New query > yapıştır > Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- Kurallar (panelden düzenlenir; her değişiklikte üyeler tekrar onaylar)
-- ---------------------------------------------------------------------
alter table public.settings add column if not exists prova_rules text not null default
'1. Prova odasına sadece onaylanmış rezervasyonunun olduğu saatte gir.
2. Odaya girerken ve çıkarken odadaki QR kodu mutlaka okut.
3. Çıkarken odanın son halinin 3 fotoğrafını çekip sisteme yükle.
4. Odayı nasıl bulduysan öyle bırak. Temiz kullan, çöpünü ve eşyalarını yanında götür.
5. Kullandığın ekipmanı (mikrofon, stand, kablo, amfi vb.) yerine koy; kabloları sarıp düzgünce bırak.
6. Ekipmanın yanında su dışında yiyecek ve içecek bulundurma.
7. Ekipmana özenle davran. Bir arıza ya da hasar görürsen çıkış notuna yaz ve yönetim kuruluna haber ver.
8. Rezervasyon saatine uy; süren dolduğunda odayı bir sonraki kişiye hazır bırak.
9. Anahtarı belirtilen kişiye / yere teslim et ve çıkışta sistemde onayla.
10. Gelemeyeceksen rezervasyonunu önceden iptal et ki başkası kullanabilsin.
11. Kurallara uymayanların prova odası hakkı kısıtlanabilir.';
alter table public.settings add column if not exists prova_rules_version int not null default 1;
grant select (prova_rules, prova_rules_version) on public.settings to anon, authenticated;

alter table public.profiles add column if not exists prova_rules_version int not null default 0;
grant select (prova_rules_version) on public.profiles to authenticated;

create or replace function public.accept_prova_rules() returns int
language sql security definer set search_path = public as $$
  update profiles set prova_rules_version = (select prova_rules_version from settings where id = 1)
  where id = auth.uid() returning prova_rules_version
$$;
revoke all on function public.accept_prova_rules() from public, anon;
grant execute on function public.accept_prova_rules() to authenticated;

create or replace function public.set_prova_rules(p_rules text) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.has_perm('prova') then raise exception 'Yetkin yok.'; end if;
  if coalesce(trim(p_rules), '') = '' then raise exception 'Kurallar boş olamaz.'; end if;
  update settings set prova_rules = left(p_rules, 8000), prova_rules_version = prova_rules_version + 1, updated_at = now()
  where id = 1 returning prova_rules_version into v;
  insert into audit_log (actor, actor_name, action, detail)
  values (auth.uid(), coalesce((select coalesce(nullif(full_name, ''), username) from profiles where id = auth.uid()), ''), 'prova_kurallari', 'sürüm ' || v);
  return v;
end $$;
revoke all on function public.set_prova_rules(text) from public, anon;
grant execute on function public.set_prova_rules(text) to authenticated;

-- Kuralları onaylamayan rezervasyon talebi gönderemez
create or replace function public.check_prova_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare s settings; t date := public.today_tr(); n int; p profiles;
begin
  select * into s from settings where id = 1;
  select * into p from profiles where id = new.user_id;
  if p.id is null or p.status <> 'onaylandi' then
    raise exception 'Rezervasyon için üyeliğinin onaylanmış olması gerekir.';
  end if;
  if p.prova_rules_version < s.prova_rules_version then
    raise exception 'Önce prova odası kurallarını okuyup onaylamalısın.';
  end if;
  if extract(isodow from new.day) <> 5 then
    raise exception 'Prova odası rezervasyonu sadece cuma günleri için yapılır.';
  end if;
  if t > new.day then raise exception 'Geçmiş bir tarihe rezervasyon yapılamaz.'; end if;
  if t < new.day - s.prova_open_days then
    raise exception 'Bu cumanın rezervasyonu % tarihinde açılır.', to_char(new.day - s.prova_open_days, 'DD.MM.YYYY');
  end if;
  if not exists (select 1 from prova_slots where id = new.slot_id and active) then
    raise exception 'Bu saat artık rezervasyona açık değil.';
  end if;
  if exists (select 1 from prova_bookings where slot_id = new.slot_id and day = new.day and status = 'onaylandi') then
    raise exception 'Bu saat dolu.';
  end if;
  select count(*) into n from prova_bookings where day = new.day and user_id = new.user_id and status <> 'reddedildi';
  if n >= s.prova_max_per_week then
    raise exception 'Bu hafta için zaten bir talebin ya da rezervasyonun var.';
  end if;
  new.status := 'bekliyor';
  new.token := gen_random_uuid();
  new.decided_at := null;
  new.notified_at := null;
  new.note := left(coalesce(new.note, ''), 300);
  new.display_name := public.short_name(p.full_name);
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Çıkış fotoğrafları ve kontrol
-- ---------------------------------------------------------------------
alter table public.prova_attendance
  add column if not exists photos text[] not null default '{}',
  add column if not exists review_status text not null default 'bekliyor',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid,
  add column if not exists review_note text not null default '',
  add column if not exists photos_deleted_at timestamptz;
alter table public.prova_attendance drop constraint if exists prova_attendance_review_check;
alter table public.prova_attendance add constraint prova_attendance_review_check check (review_status in ('bekliyor','onaylandi','sorunlu'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prova-photos', 'prova-photos', false, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false;

drop policy if exists "prova foto yüklenir" on storage.objects;
drop policy if exists "prova foto okunur" on storage.objects;
drop policy if exists "prova foto silinir" on storage.objects;
create policy "prova foto yüklenir" on storage.objects for insert to authenticated
  with check (bucket_id = 'prova-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "prova foto okunur" on storage.objects for select to authenticated
  using (bucket_id = 'prova-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.has_perm('prova')));
create policy "prova foto silinir" on storage.objects for delete to authenticated
  using (bucket_id = 'prova-photos' and public.has_perm('prova'));

drop function if exists public.prova_checkout(text, boolean, text);
create or replace function public.prova_checkout(p_code text, p_key_returned boolean, p_note text, p_photos text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a prova_attendance; ph text;
begin
  if auth.uid() is null then raise exception 'Önce giriş yapmalısın.'; end if;
  if p_code is null or p_code <> (select qr_code from settings where id = 1) then
    raise exception 'Bu QR kod geçerli değil.';
  end if;
  if not coalesce(p_key_returned, false) then raise exception 'Çıkış için anahtarı bıraktığını onaylamalısın.'; end if;
  if coalesce(array_length(p_photos, 1), 0) <> 3 then raise exception 'Çıkış için odanın 3 fotoğrafını yüklemelisin.'; end if;
  foreach ph in array p_photos loop
    if ph is null or split_part(ph, '/', 1) <> auth.uid()::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'prova-photos' and o.name = ph) then
      raise exception 'Fotoğraflar yüklenemedi, tekrar dene.';
    end if;
  end loop;
  select pa.* into a from prova_attendance pa join prova_bookings pb on pb.id = pa.booking_id
  where pa.user_id = auth.uid() and pb.day = public.today_tr() and pa.check_out_at is null
  order by pa.check_in_at limit 1;
  if a.id is null then raise exception 'Açık bir prova girişin bulunamadı. Önce giriş için QR okut.'; end if;
  update prova_attendance set check_out_at = now(), key_returned = true, key_note = left(coalesce(p_note, ''), 300), photos = p_photos
  where id = a.id returning * into a;
  return jsonb_build_object('state', 'checked_out', 'check_in_at', a.check_in_at, 'check_out_at', a.check_out_at);
end $$;
revoke all on function public.prova_checkout(text, boolean, text, text[]) from public, anon;
grant execute on function public.prova_checkout(text, boolean, text, text[]) to authenticated;

create or replace function public.review_attendance(p_booking uuid, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('prova') then raise exception 'Yetkin yok.'; end if;
  if p_status not in ('onaylandi', 'sorunlu') then raise exception 'Geçersiz karar.'; end if;
  update prova_attendance set review_status = p_status, reviewed_at = now(), reviewed_by = auth.uid(), review_note = left(coalesce(p_note, ''), 500)
  where booking_id = p_booking;
  if not found then raise exception 'Yoklama kaydı bulunamadı.'; end if;
end $$;
revoke all on function public.review_attendance(uuid, text, text) from public, anon;
grant execute on function public.review_attendance(uuid, text, text) to authenticated;

drop function if exists public.prova_attendance_list(date, date);
create or replace function public.prova_attendance_list(p_from date, p_to date)
returns table (booking_id uuid, day date, start_time time, end_time time, full_name text, student_no text, phone text,
               check_in_at timestamptz, check_out_at timestamptz, key_returned boolean, key_note text,
               photos text[], review_status text, reviewed_at timestamptz, reviewer text, review_note text, photos_deleted_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare sup boolean := public.is_super();
begin
  if not public.has_perm('prova') then raise exception 'Yetkin yok.'; end if;
  return query
    select pb.id, pb.day, s.start_time, s.end_time, p.full_name, p.student_no, case when sup then p.phone else '' end,
           pa.check_in_at, pa.check_out_at, coalesce(pa.key_returned, false), coalesce(pa.key_note, ''),
           coalesce(pa.photos, '{}'), coalesce(pa.review_status, ''), pa.reviewed_at,
           (select coalesce(nullif(r.full_name, ''), r.username) from profiles r where r.id = pa.reviewed_by),
           coalesce(pa.review_note, ''), pa.photos_deleted_at
    from prova_bookings pb join prova_slots s on s.id = pb.slot_id join profiles p on p.id = pb.user_id
    left join prova_attendance pa on pa.booking_id = pb.id
    where pb.status = 'onaylandi' and pb.day between p_from and p_to
    order by pb.day desc, s.start_time;
end $$;
revoke all on function public.prova_attendance_list(date, date) from public, anon;
grant execute on function public.prova_attendance_list(date, date) to authenticated;

grant all on public.prova_attendance to service_role;
grant execute on all functions in schema public to service_role;
notify pgrst, 'reload schema';
