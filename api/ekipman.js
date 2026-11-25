// Müzisyen pazarı: yeni/düzenlenen ilanı denetle, yöneticilere e-posta; e-postadaki "yayına al / kaldır" linkleri.
const { SB_URL, SECRET, sb, getCaller } = require('./_auth');
const { esc, siteUrl, page, confirmForm, readBody, json } = require('./_mail');
const { moderateEquipment, loadEquipment } = require('./_moderate');

const UUID = /^[0-9a-f-]{36}$/i;

module.exports = async (req, res) => {
  if (!SB_URL || !SECRET) return json(res, 500, { error: 'Sunucu ayarları eksik.' });
  const base = siteUrl(req);

  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://x');
    const token = url.searchParams.get('token') || '';
    const d = url.searchParams.get('d') === 'yayinla' ? 'yayinla' : 'kaldir';
    if (!UUID.test(token)) return page(res, 'Geçersiz link', '<p>Bu link geçersiz.</p>');
    const p = await loadEquipment('review_token=eq.' + token);
    if (!p) return page(res, 'İlan bulunamadı', '<p>İlan silinmiş olabilir.</p>');
    const info = `<p style="margin:0 0 16px"><b>${esc(p.title)}</b><br>${esc((p.profiles || {}).full_name || '')}</p>`;
    if (!p.active) return page(res, 'Bu ilan zaten kaldırılmış', info, true);
    if (d === 'yayinla' && p.review === '') return page(res, 'Bu ilan zaten yayında', info, true);
    return page(res, d === 'yayinla' ? 'İlan yayına alınsın mı?' : 'İlan kaldırılsın mı?',
      info + confirmForm('/api/ekipman', token, d, d === 'yayinla' ? 'Evet, yayına al' : 'Evet, kaldır', d === 'yayinla' ? '#1F8A4C' : '#D7301F'), true);
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'Desteklenmeyen istek.' });
  let body;
  try { body = await readBody(req); } catch (e) { return json(res, 400, { error: 'Geçersiz istek.' }); }

  if (body.token) {
    if (!UUID.test(body.token)) return page(res, 'Geçersiz link', '<p>Bu link geçersiz.</p>');
    const p = await loadEquipment('review_token=eq.' + body.token);
    if (!p) return page(res, 'İlan bulunamadı', '<p>İlan silinmiş olabilir.</p>');
    const patch = body.d === 'yayinla' ? { review: '', review_reason: '' } : { active: false };
    const r = await sb('/rest/v1/equipment_posts?id=eq.' + p.id, { method: 'PATCH', body: JSON.stringify(patch) });
    if (!r.ok) return page(res, 'İşlem yapılamadı', '<p>Bir hata oluştu, yönetim panelinden dene.</p>');
    await sb('/rest/v1/audit_log', { method: 'POST', body: JSON.stringify({ actor_name: 'E-posta linki', action: body.d === 'yayinla' ? 'Enstrüman ilanını yayına aldı' : 'Enstrüman ilanını kaldırdı', target_id: p.id, target_name: p.title }) });
    return page(res, body.d === 'yayinla' ? 'İlan yayına alındı' : 'İlan kaldırıldı',
      `<p style="margin:0">${esc(p.title)}</p>`, true);
  }

  const caller = await getCaller(req);
  if (caller.error) return json(res, 401, { error: caller.error });
  if (!UUID.test(body.id || '')) return json(res, 400, { error: 'Geçersiz ilan.' });
  const p = await loadEquipment('id=eq.' + body.id);
  if (!p) return json(res, 404, { error: 'İlan bulunamadı.' });
  if (p.user_id !== caller.id && !caller.can('uyeler')) return json(res, 403, { error: 'Yetkisiz.' });
  const out = await moderateEquipment(p.id, base, !!body.is_new);
  return json(res, out.error ? 400 : 200, out);
};
