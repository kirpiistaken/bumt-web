-- =====================================================================
-- BÜMT — Müzisyen pazarı "nasıl kullanılır" kutusu (yönetimden aç/kapat)
-- SQL Editor > New query > yapıştır > Run
-- =====================================================================
alter table public.settings add column if not exists pazar_guide boolean not null default true;
grant select (pazar_guide) on public.settings to anon, authenticated;

create or replace function public.set_pazar_guide(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('uyeler') then raise exception 'Bu işlem için Üyeler yetkisi gerekir.'; end if;
  update settings set pazar_guide = coalesce(p_on, true), updated_at = now() where id = 1;
end $$;
revoke all on function public.set_pazar_guide(boolean) from public, anon;
grant execute on function public.set_pazar_guide(boolean) to authenticated;
notify pgrst, 'reload schema';
