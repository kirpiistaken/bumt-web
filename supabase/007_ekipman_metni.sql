-- =====================================================================
-- BÜMT — Open Mic formunda "Ekipman ihtiyacı" sorusu yerine
-- "Kendi getireceğin ekipmanlar" sorusu (topluluk ekipman sağlamıyor)
-- SQL Editor > New query > yapıştır > Run
-- =====================================================================
update public.forms
set fields = (
  select jsonb_agg(
    case when f->>'id' = 'ekipman'
      then jsonb_build_object('id', 'ekipman', 'label', 'Kendi getireceğin ekipmanlar (topluluk ekipman sağlayamıyor)', 'type', 'text', 'required', false)
      else f end
    order by ord)
  from jsonb_array_elements(fields) with ordinality as x(f, ord)
)
where fields @> '[{"id":"ekipman"}]';
