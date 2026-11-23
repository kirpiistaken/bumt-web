-- =====================================================================
-- BÜMT web sitesi — Supabase veritabanı kurulumu
-- Supabase > SQL Editor > New query > bu dosyanın tamamını yapıştır > Run
-- Tekrar çalıştırmak için tasarlanmadı: sadece bir kez çalıştır.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Ayarlar (tek satır)
-- ---------------------------------------------------------------------
create table public.settings (
  id int primary key default 1 check (id = 1),
  prova_open_days int not null default 4,      -- cumadan kaç gün önce açılır (4 = pazartesi)
  prova_max_per_week int not null default 1,   -- üye başına haftalık slot hakkı
  dinleti_open_days int not null default 21,   -- dinletiden kaç gün önce açılır
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1);

-- ---------------------------------------------------------------------
-- Roller ve üyeler
-- Yetki anahtarları: uyeler, roller, prova, kurslar, dinletiler, etkinlikler, formlar
-- ---------------------------------------------------------------------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  permissions text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  student_no text unique,
  username text unique,
  full_name text not null default '',
  phone text not null default '',
  contact_email text not null default '',
  department text not null default '',
  class_year text not null default '',
  member_type text not null default 'dinleyici' check (member_type in ('dinleyici','muzisyen')),
  instruments text[] not null default '{}',
  status text not null default 'bekliyor' check (status in ('bekliyor','onaylandi','reddedildi')),
  is_staff boolean not null default false,
  is_super boolean not null default false,
  role_id uuid references public.roles on delete set null,
  kvkk_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Yardımcı fonksiyonlar
-- ---------------------------------------------------------------------
create or replace function public.today_tr() returns date
language sql stable as $$ select (now() at time zone 'Europe/Istanbul')::date $$;

create or replace function public.is_super() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_super from profiles where id = auth.uid()), false)
$$;

create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select pr.is_super or coalesce(r.permissions @> array[p], false)
    from profiles pr left join roles r on r.id = pr.role_id
    where pr.id = auth.uid()), false)
$$;

create or replace function public.can_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_super or role_id is not null from profiles where id = auth.uid()), false)
$$;

create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'onaylandi' from profiles where id = auth.uid()), false)
$$;

create or replace function public.short_name(n text) returns text
language sql immutable as $$
  select case
    when coalesce(trim(n), '') = '' then 'Üye'
    when position(' ' in trim(n)) = 0 then trim(n)
    else split_part(trim(n), ' ', 1) || ' ' ||
         left(regexp_replace(trim(n), '^.* ', ''), 1) || '.'
  end
$$;

-- Yeni hesap açılınca profil oluştur
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  a jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  is_root boolean := lower(new.email) = 'admin@yonetim.bumt.com.tr';
  is_member boolean := lower(new.email) like '%@uye.bumt.com.tr';
begin
  insert into profiles (id, student_no, username, full_name, phone, contact_email, department,
                        class_year, member_type, instruments, status, is_staff, is_super, role_id, kvkk_at)
  values (
    new.id,
    case when is_member then split_part(lower(new.email), '@', 1) end,
    case when is_root then 'admin'
         when lower(new.email) like '%@yonetim.bumt.com.tr' then split_part(lower(new.email), '@', 1) end,
    coalesce(nullif(m->>'full_name', ''), case when is_root then 'Yönetici' else '' end),
    coalesce(m->>'phone', ''),
    coalesce(m->>'contact_email', ''),
    coalesce(m->>'department', ''),
    coalesce(m->>'class_year', ''),
    case when m->>'member_type' = 'muzisyen' then 'muzisyen' else 'dinleyici' end,
    coalesce((select array_agg(x) from jsonb_array_elements_text(
      case when jsonb_typeof(m->'instruments') = 'array' then m->'instruments' else '[]'::jsonb end) x), '{}'),
    case when is_root or (a->>'approved') = 'true' then 'onaylandi' else 'bekliyor' end,
    is_root or coalesce((a->>'is_staff') = 'true', false),
    is_root,
    nullif(a->>'role_id', '')::uuid,
    case when (m->>'kvkk') = 'true' then now() end
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Profillerde yetkisiz alan değişikliğini engelle
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;  -- SQL Editor / sunucu tarafı
  if not public.is_super() then
    if old.is_super and auth.uid() <> old.id then
      raise exception 'Süper yönetici hesabını sadece süper yönetici değiştirebilir.';
    end if;
    new.is_super := old.is_super;
    if not public.has_perm('roller') then
      new.role_id := old.role_id;
      new.is_staff := old.is_staff;
    end if;
    if not public.has_perm('uyeler') then
      new.status := old.status;
      new.student_no := old.student_no;
      new.username := old.username;
    end if;
  end if;
  new.id := old.id;
  return new;
end $$;

create trigger protect_profile
  before update on public.profiles for each row execute function public.protect_profile();

-- ---------------------------------------------------------------------
-- Prova odası
-- ---------------------------------------------------------------------
create table public.prova_slots (
  id uuid primary key default gen_random_uuid(),
  start_time time not null,
  end_time time not null,
  sort int not null default 0,
  active boolean not null default true
);
insert into public.prova_slots (start_time, end_time, sort) values ('16:00', '17:00', 1), ('17:00', '18:00', 2);

create table public.prova_bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.prova_slots on delete cascade,
  day date not null,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  display_name text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (slot_id, day)
);

create or replace function public.check_prova_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare s settings; t date := public.today_tr(); n int; p profiles;
begin
  select * into s from settings where id = 1;
  select * into p from profiles where id = new.user_id;
  if p.id is null or p.status <> 'onaylandi' then
    raise exception 'Rezervasyon için üyeliğinin onaylanmış olması gerekir.';
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
  select count(*) into n from prova_bookings where day = new.day and user_id = new.user_id;
  if n >= s.prova_max_per_week then
    raise exception 'Bu hafta için prova odası hakkını kullandın.';
  end if;
  new.display_name := public.short_name(p.full_name);
  return new;
end $$;

create trigger check_prova_booking
  before insert on public.prova_bookings for each row execute function public.check_prova_booking();

-- ---------------------------------------------------------------------
-- Enstrüman kursları
-- ---------------------------------------------------------------------
create table public.instructors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles on delete set null,
  full_name text not null,
  instrument text not null,
  kind text not null default 'Ders veren öğrenci',
  department text not null default '',
  class_year text not null default '',
  phone text not null default '',
  bio text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.instructor_slots (
  instructor_id uuid not null references public.instructors on delete cascade,
  weekday int not null check (weekday between 1 and 7),
  hour int not null check (hour between 0 and 23),
  primary key (instructor_id, weekday, hour)
);

create table public.lesson_bookings (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.instructors on delete cascade,
  weekday int not null,
  hour int not null,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  unique (instructor_id, weekday, hour),
  foreign key (instructor_id, weekday, hour)
    references public.instructor_slots (instructor_id, weekday, hour) on delete cascade
);

create or replace function public.check_lesson_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare p profiles;
begin
  select * into p from profiles where id = new.user_id;
  if p.id is null or p.status <> 'onaylandi' then
    raise exception 'Ders kaydı için üyeliğinin onaylanmış olması gerekir.';
  end if;
  if exists (select 1 from instructors where id = new.instructor_id and profile_id = new.user_id) then
    raise exception 'Kendi dersine kayıt olamazsın.';
  end if;
  if not exists (select 1 from instructors where id = new.instructor_id and active) then
    raise exception 'Bu eğitmen şu an ders almıyor.';
  end if;
  new.display_name := public.short_name(p.full_name);
  return new;
end $$;

create trigger check_lesson_booking
  before insert on public.lesson_bookings for each row execute function public.check_lesson_booking();

create or replace function public.is_instructor_owner(iid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from instructors where id = iid and profile_id = auth.uid())
$$;

-- ---------------------------------------------------------------------
-- Dinletiler
-- ---------------------------------------------------------------------
create table public.dinletiler (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Dinleti',
  day date not null,
  start_time time not null default '19:00',
  slot_minutes int not null default 20 check (slot_minutes between 5 and 180),
  slot_count int not null default 6 check (slot_count between 1 and 40),
  venue text not null default '',
  note text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.dinleti_bookings (
  id uuid primary key default gen_random_uuid(),
  dinleti_id uuid not null references public.dinletiler on delete cascade,
  slot_index int not null,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  perf_type text not null default 'Solo' check (perf_type in ('Solo','Grup','Akustik')),
  performer text not null default '',
  display_name text not null default '',
  created_at timestamptz not null default now(),
  unique (dinleti_id, slot_index)
);

create or replace function public.check_dinleti_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare s settings; d dinletiler; p profiles; t date := public.today_tr();
begin
  select * into s from settings where id = 1;
  select * into d from dinletiler where id = new.dinleti_id;
  select * into p from profiles where id = new.user_id;
  if p.id is null or p.status <> 'onaylandi' then
    raise exception 'Rezervasyon için üyeliğinin onaylanmış olması gerekir.';
  end if;
  if d.id is null or not d.active then raise exception 'Bu dinleti rezervasyona açık değil.'; end if;
  if t > d.day then raise exception 'Bu dinleti geçmişte kaldı.'; end if;
  if t < d.day - s.dinleti_open_days then
    raise exception 'Bu dinletinin rezervasyonu % tarihinde açılır.', to_char(d.day - s.dinleti_open_days, 'DD.MM.YYYY');
  end if;
  if new.slot_index < 0 or new.slot_index >= d.slot_count then raise exception 'Geçersiz slot.'; end if;
  if exists (select 1 from dinleti_bookings where dinleti_id = new.dinleti_id and user_id = new.user_id) then
    raise exception 'Bu dinletide zaten bir slotun var.';
  end if;
  new.display_name := coalesce(nullif(trim(new.performer), ''), public.short_name(p.full_name));
  return new;
end $$;

create trigger check_dinleti_booking
  before insert on public.dinleti_bookings for each row execute function public.check_dinleti_booking();

-- ---------------------------------------------------------------------
-- Formlar (Open Mic vb.) ve etkinlikler
-- ---------------------------------------------------------------------
create table public.forms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  fields jsonb not null default '[]'::jsonb,
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms on delete cascade,
  user_id uuid default auth.uid() references public.profiles on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  tag text not null default 'Etkinlik',
  date_text text not null default '',
  venue text not null default '',
  description text not null default '',
  poster_url text not null default '',
  cta_label text not null default '',
  cta_url text not null default '',
  form_id uuid references public.forms on delete set null,
  starts_on date,
  published boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Yetkiler (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.settings enable row level security;
alter table public.roles enable row level security;
alter table public.profiles enable row level security;
alter table public.prova_slots enable row level security;
alter table public.prova_bookings enable row level security;
alter table public.instructors enable row level security;
alter table public.instructor_slots enable row level security;
alter table public.lesson_bookings enable row level security;
alter table public.dinletiler enable row level security;
alter table public.dinleti_bookings enable row level security;
alter table public.forms enable row level security;
alter table public.form_responses enable row level security;
alter table public.events enable row level security;

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant insert on public.form_responses to anon;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
-- Eğitmen telefonları sadece giriş yapanlara görünür
revoke select on public.instructors from anon;
grant select (id, profile_id, full_name, instrument, kind, department, class_year, bio, active, created_at)
  on public.instructors to anon;

-- settings
create policy "settings okunur" on public.settings for select using (true);
create policy "settings yazılır" on public.settings for update to authenticated
  using (public.has_perm('prova') or public.has_perm('dinletiler'));

-- roles
create policy "roller okunur" on public.roles for select to authenticated using (true);
create policy "roller eklenir" on public.roles for insert to authenticated with check (public.has_perm('roller'));
create policy "roller güncellenir" on public.roles for update to authenticated using (public.has_perm('roller'));
create policy "roller silinir" on public.roles for delete to authenticated using (public.has_perm('roller'));

-- profiles
create policy "profil okunur" on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_perm('uyeler') or public.has_perm('roller') or public.has_perm('kurslar'));
create policy "profil güncellenir" on public.profiles for update to authenticated
  using (id = auth.uid() or public.has_perm('uyeler') or public.has_perm('roller'));
create policy "profil silinir" on public.profiles for delete to authenticated
  using (public.has_perm('uyeler') and not is_super);

-- prova
create policy "prova saatleri okunur" on public.prova_slots for select using (true);
create policy "prova saatleri eklenir" on public.prova_slots for insert to authenticated with check (public.has_perm('prova'));
create policy "prova saatleri güncellenir" on public.prova_slots for update to authenticated using (public.has_perm('prova'));
create policy "prova saatleri silinir" on public.prova_slots for delete to authenticated using (public.has_perm('prova'));

create policy "prova rezervasyonları okunur" on public.prova_bookings for select using (true);
create policy "prova rezervasyonu yapılır" on public.prova_bookings for insert to authenticated
  with check (user_id = auth.uid());
create policy "prova rezervasyonu iptal" on public.prova_bookings for delete to authenticated
  using (user_id = auth.uid() or public.has_perm('prova'));

-- kurslar
create policy "eğitmenler okunur" on public.instructors for select using (active or public.has_perm('kurslar') or profile_id = auth.uid());
create policy "eğitmen eklenir" on public.instructors for insert to authenticated with check (public.has_perm('kurslar'));
create policy "eğitmen güncellenir" on public.instructors for update to authenticated
  using (public.has_perm('kurslar') or profile_id = auth.uid());
create policy "eğitmen silinir" on public.instructors for delete to authenticated using (public.has_perm('kurslar'));

create policy "müsaitlik okunur" on public.instructor_slots for select using (true);
create policy "müsaitlik eklenir" on public.instructor_slots for insert to authenticated
  with check (public.has_perm('kurslar') or public.is_instructor_owner(instructor_id));
create policy "müsaitlik silinir" on public.instructor_slots for delete to authenticated
  using (public.has_perm('kurslar') or public.is_instructor_owner(instructor_id));

create policy "ders kayıtları okunur" on public.lesson_bookings for select using (true);
create policy "ders kaydı yapılır" on public.lesson_bookings for insert to authenticated with check (user_id = auth.uid());
create policy "ders kaydı silinir" on public.lesson_bookings for delete to authenticated
  using (user_id = auth.uid() or public.has_perm('kurslar') or public.is_instructor_owner(instructor_id));

-- dinletiler
create policy "dinletiler okunur" on public.dinletiler for select using (active or public.has_perm('dinletiler'));
create policy "dinleti eklenir" on public.dinletiler for insert to authenticated with check (public.has_perm('dinletiler'));
create policy "dinleti güncellenir" on public.dinletiler for update to authenticated using (public.has_perm('dinletiler'));
create policy "dinleti silinir" on public.dinletiler for delete to authenticated using (public.has_perm('dinletiler'));

create policy "dinleti kayıtları okunur" on public.dinleti_bookings for select using (true);
create policy "dinleti kaydı yapılır" on public.dinleti_bookings for insert to authenticated with check (user_id = auth.uid());
create policy "dinleti kaydı silinir" on public.dinleti_bookings for delete to authenticated
  using (user_id = auth.uid() or public.has_perm('dinletiler'));

-- formlar
create policy "formlar okunur" on public.forms for select using (true);
create policy "form eklenir" on public.forms for insert to authenticated with check (public.has_perm('formlar'));
create policy "form güncellenir" on public.forms for update to authenticated using (public.has_perm('formlar'));
create policy "form silinir" on public.forms for delete to authenticated using (public.has_perm('formlar'));

create policy "başvuru gönderilir" on public.form_responses for insert to anon, authenticated
  with check ((user_id is null or user_id = auth.uid())
              and exists (select 1 from public.forms f where f.id = form_id and f.is_open));
create policy "başvurular okunur" on public.form_responses for select to authenticated using (public.has_perm('formlar'));
create policy "başvuru silinir" on public.form_responses for delete to authenticated using (public.has_perm('formlar'));

-- etkinlikler
create policy "etkinlikler okunur" on public.events for select using (published or public.has_perm('etkinlikler'));
create policy "etkinlik eklenir" on public.events for insert to authenticated with check (public.has_perm('etkinlikler'));
create policy "etkinlik güncellenir" on public.events for update to authenticated using (public.has_perm('etkinlikler'));
create policy "etkinlik silinir" on public.events for delete to authenticated using (public.has_perm('etkinlikler'));

-- ---------------------------------------------------------------------
-- Afiş depolama alanı
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('posters', 'posters', true)
  on conflict (id) do nothing;

create policy "afişler okunur" on storage.objects for select using (bucket_id = 'posters');
create policy "afiş yüklenir" on storage.objects for insert to authenticated
  with check (bucket_id = 'posters' and public.has_perm('etkinlikler'));
create policy "afiş güncellenir" on storage.objects for update to authenticated
  using (bucket_id = 'posters' and public.has_perm('etkinlikler'));
create policy "afiş silinir" on storage.objects for delete to authenticated
  using (bucket_id = 'posters' and public.has_perm('etkinlikler'));

-- ---------------------------------------------------------------------
-- Başlangıç verileri (panelden değiştirilebilir)
-- ---------------------------------------------------------------------
insert into public.roles (name, permissions) values
  ('Başkan Yardımcısı', array['uyeler','prova','kurslar','dinletiler','etkinlikler','formlar']),
  ('Etkinlik Sorumlusu', array['etkinlikler','formlar','dinletiler']),
  ('Kurs Koordinatörü', array['kurslar']),
  ('Üye İşleri', array['uyeler','prova']);

with f as (
  insert into public.forms (title, description, fields) values (
    'Open Mic Başvurusu',
    'Tek başına, grubunla ya da elinde gitarla akustik: formu doldur, sahne sırası belli olunca sana haber verelim.',
    '[
      {"id":"tur","label":"Nasıl katılacaksın?","type":"radio","options":["Bireysel","Grup","Akustik"],"required":true},
      {"id":"ad","label":"Ad Soyad / Grup adı","type":"text","required":true},
      {"id":"ogrenci_no","label":"Öğrenci numarası","type":"text","required":true},
      {"id":"telefon","label":"Telefon (WhatsApp)","type":"tel","required":true},
      {"id":"kisi","label":"Grupsa kaç kişisiniz?","type":"number","required":false},
      {"id":"parcalar","label":"Çalacağın / söyleyeceğin parça(lar)","type":"text","required":true},
      {"id":"ekipman","label":"Kendi getireceğin ekipmanlar (topluluk ekipman sağlayamıyor)","type":"text","required":false},
      {"id":"not","label":"Eklemek istediğin bir şey var mı?","type":"textarea","required":false}
    ]'::jsonb)
  returning id
)
insert into public.events (title, tag, date_text, description, cta_label, form_id, sort)
select 'Open Mic Gecesi', 'Open Mic', 'Tarih yakında', 'Bireysel, grup ya da akustik: başvur, sahneye çık.', 'Başvur', f.id, 2 from f;

insert into public.events (title, tag, date_text, description, cta_label, sort) values
  ('BÜMT Fest', 'Festival', 'Tarih yakında', 'Topluluğun büyük festivali. Afiş ve bilet linki çok yakında.', 'Bilet al', 1);

-- Admin hesabı bu dosyadan ÖNCE eklendiyse onu da süper yönetici yap
insert into public.profiles (id, username, full_name, status, is_staff, is_super)
select id, 'admin', 'Yönetici', 'onaylandi', true, true from auth.users
where lower(email) = 'admin@yonetim.bumt.com.tr'
on conflict (id) do update set is_super = true, is_staff = true, status = 'onaylandi', username = 'admin';
