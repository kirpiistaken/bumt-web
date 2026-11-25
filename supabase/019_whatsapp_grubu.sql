-- =====================================================================
-- BÜMT — Topluluk WhatsApp grubu linki (sadece onaylı üyeler görür)
-- SQL Editor > New query > yapıştır > Run
-- =====================================================================
alter table public.settings add column if not exists whatsapp_group text not null default '';
-- Bu sütun doğrudan okunamaz; sadece aşağıdaki fonksiyonla onaylı üyelere verilir.

create or replace function public.whatsapp_group_link() returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_approved() or public.has_perm('uyeler')) then return ''; end if;
  return coalesce((select whatsapp_group from settings where id = 1), '');
end $$;
revoke all on function public.whatsapp_group_link() from public, anon;
grant execute on function public.whatsapp_group_link() to authenticated;

create or replace function public.set_whatsapp_group(p_link text) returns void
language plpgsql security definer set search_path = public as $$
declare v text := trim(coalesce(p_link, ''));
begin
  if not public.has_perm('uyeler') then raise exception 'Bu işlem için Üyeler yetkisi gerekir.'; end if;
  if v <> '' and v !~ '^https://(chat\.whatsapp\.com|whatsapp\.com/channel)/[A-Za-z0-9_-]+' then
    raise exception 'Geçerli bir WhatsApp grup linki gir (https://chat.whatsapp.com/… ile başlamalı).';
  end if;
  update settings set whatsapp_group = v, updated_at = now() where id = 1;
end $$;
revoke all on function public.set_whatsapp_group(text) from public, anon;
grant execute on function public.set_whatsapp_group(text) to authenticated;

notify pgrst, 'reload schema';
