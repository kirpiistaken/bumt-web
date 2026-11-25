// E-postayla şifre sıfırlama: link isteme ve yeni şifre belirleme.
const crypto = require('crypto');
const { SB_URL, SECRET, sb, getCaller } = require('./_auth');
const { esc, siteUrl, sendMail, mailLayout, btn, readBody, json, page } = require('./_mail');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const GENERIC = 'Bu bilgiye kayıtlı bir e-posta adresi varsa, şifre sıfırlama linkini gönderdik. Gelen kutunu (ve spam klasörünü) kontrol et. Link 30 dakika geçerli.';

async function findProfile(ident) {
  const v = String(ident || '').trim().toLowerCase();
  if (!v || v.length > 60) return null;
  const col = /^[0-9]+$/.test(v) ? 'student_no' : 'username';
  const r = await sb('/rest/v1/profiles?select=id,full_name,contact_email,student_no,username&' + col + '=eq.' + encodeURIComponent(v));
  return r.ok && Array.isArray(r.data) ? r.data[0] : null;
}

const SCHOOL_DOMAIN = 'mail.baskent.edu.tr';

// Okul mailindeki onay linki: /api/password?verify=TOKEN
async function confirmSchool(req, res, token) {
  const back = siteUrl(req) + '/#/profil';
  const fail = (t, m) => page(res, t, `<p style="margin:0 0 16px">${m}</p><a href="${esc(siteUrl(req))}/#/onay" style="font-weight:bold;color:#B3261A">Yeni onay maili iste →</a>`);
  if (!/^[0-9a-f]{64}$/.test(token)) return fail('Link geçersiz', 'Bu onay linki geçersiz.');
  const r = await sb('/rest/v1/school_verifications?select=id,user_id,expires_at,used_at&token_hash=eq.' + sha(token));
  const row = r.ok && Array.isArray(r.data) ? r.data[0] : null;
  if (!row) return fail('Link geçersiz', 'Bu onay linki geçersiz ya da daha yeni bir link gönderildi.');
  const pr = await sb('/rest/v1/profiles?select=status,full_name&id=eq.' + row.user_id);
  const prof = pr.ok && Array.isArray(pr.data) ? pr.data[0] : null;
  if (prof && prof.status === 'onaylandi') {
    return page(res, 'Hesabın zaten onaylı 🎉', `<p style="margin:0 0 18px">Siteye dönüp kullanmaya başlayabilirsin.</p><a href="${esc(back)}" style="display:inline-block;font-weight:bold;background:#D7301F;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;border:2px solid #141414">Siteye dön</a>`, true);
  }
  if (row.used_at) return fail('Link kullanılmış', 'Bu link daha önce kullanılmış.');
  if (new Date(row.expires_at).getTime() < Date.now()) return fail('Linkin süresi dolmuş', 'Onay linkinin süresi dolmuş.');
  if (prof && prof.status === 'reddedildi') return fail('Onaylanamadı', 'Bu hesap yönetim tarafından reddedilmiş. Bir yanlışlık olduğunu düşünüyorsan yönetim kuruluna yaz.');
  const now = new Date().toISOString();
  const u = await sb('/rest/v1/profiles?id=eq.' + row.user_id + '&status=eq.bekliyor', { method: 'PATCH', body: JSON.stringify({ status: 'onaylandi', school_verified_at: now }) });
  if (!u.ok) return fail('Bir sorun oluştu', 'Hesabın şu an onaylanamadı, biraz sonra tekrar dene.');
  await sb('/rest/v1/school_verifications?user_id=eq.' + row.user_id + '&used_at=is.null', { method: 'PATCH', body: JSON.stringify({ used_at: now }) });
  return page(res, 'Hesabın onaylandı! 🎸', `<p style="margin:0 0 18px">Hoş geldin${prof && prof.full_name ? ', ' + esc(prof.full_name.split(' ')[0]) : ''}! Artık BÜMT'nin onaylı üyesisin. Müzisyen pazarında ilan verebilir, topluluk WhatsApp grubuna katılabilirsin.</p><a href="${esc(back)}" style="display:inline-block;font-weight:bold;background:#D7301F;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;border:2px solid #141414">Siteye dön</a>`, true);
}

module.exports = async (req, res) => {
  if (!SB_URL || !SECRET) return json(res, 500, { error: 'Sunucu ayarları eksik.' });
  if (req.method === 'GET') {
    const v = new URL(req.url, 'http://x').searchParams.get('verify');
    if (v !== null) return confirmSchool(req, res, v);
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Sadece POST' });
  let body;
  try { body = await readBody(req); } catch (e) { return json(res, 400, { error: 'Geçersiz istek.' }); }

  if (body.action === 'request') {
    const p = await findProfile(body.ident);
    if (!p || !p.contact_email) return json(res, 200, { ok: true, message: GENERIC });
    // Kötüye kullanımı sınırla: 2 dakikada 1, saatte en fazla 5 istek
    const since = new Date(Date.now() - 3600e3).toISOString();
    const recent = await sb('/rest/v1/password_resets?select=created_at&user_id=eq.' + p.id + '&created_at=gte.' + encodeURIComponent(since) + '&order=created_at.desc');
    const list = recent.ok && Array.isArray(recent.data) ? recent.data : [];
    if (list.length >= 5 || (list[0] && Date.now() - new Date(list[0].created_at).getTime() < 120e3)) {
      return json(res, 200, { ok: true, message: GENERIC });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const ins = await sb('/rest/v1/password_resets', {
      method: 'POST',
      body: JSON.stringify({ user_id: p.id, token_hash: sha(token), expires_at: new Date(Date.now() + 30 * 60e3).toISOString() })
    });
    if (!ins.ok) return json(res, 500, { error: 'Şifre sıfırlama şu an kullanılamıyor. Yönetim kuruluna yaz.' });
    const link = siteUrl(req) + '/#/sifre-yenile/' + token;
    const login = p.student_no ? 'Öğrenci numaran: <b>' + esc(p.student_no) + '</b>' : 'Kullanıcı adın: <b>' + esc(p.username) + '</b>';
    await sendMail({
      to: p.contact_email,
      subject: 'BÜMT: Şifre sıfırlama',
      html: mailLayout('Şifreni sıfırla', `
        <p style="margin:0 0 12px">Merhaba ${esc(p.full_name || '')}, BÜMT hesabın için şifre sıfırlama istendi. ${login}</p>
        <p style="margin:0 0 16px">Yeni şifreni belirlemek için aşağıdaki butona bas. Link <b>30 dakika</b> geçerli ve bir kez kullanılabilir.</p>
        <div style="margin:0 0 16px">${btn(link, 'Yeni şifre belirle', '#D7301F')}</div>
        <p style="margin:0;color:#5E5648;font-size:13px">Bu isteği sen yapmadıysan bu e-postayı görmezden gelebilirsin; şifren değişmez.</p>`)
    });
    return json(res, 200, { ok: true, message: GENERIC });
  }

  if (body.action === 'verify_send') {
    const caller = await getCaller(req);
    if (caller.error) return json(res, 401, { error: caller.error });
    const pr = await sb('/rest/v1/profiles?select=id,full_name,student_no,status,is_staff&id=eq.' + caller.id);
    const p = pr.ok && Array.isArray(pr.data) ? pr.data[0] : null;
    if (!p || p.is_staff) return json(res, 400, { error: 'Bu hesap için okul maili onayı kullanılamaz.' });
    if (p.status === 'onaylandi') return json(res, 200, { ok: true, already: true });
    if (p.status !== 'bekliyor') return json(res, 400, { error: 'Bu hesap için onay maili gönderilemez. Yönetim kuruluna yaz.' });
    if (!/^[0-9]{8}$/.test(p.student_no || '')) return json(res, 400, { error: 'Öğrenci numaran 8 haneli olmadığı için okul mailine gönderemiyoruz; yönetim elle onaylayacak.' });
    const since = new Date(Date.now() - 3600e3).toISOString();
    const recent = await sb('/rest/v1/school_verifications?select=created_at&user_id=eq.' + p.id + '&created_at=gte.' + encodeURIComponent(since) + '&order=created_at.desc');
    if (!recent.ok) return json(res, 500, { error: 'Okul maili onayı henüz kurulmadı. Yönetim kuruluna haber ver.' });
    const list = Array.isArray(recent.data) ? recent.data : [];
    if (list[0] && Date.now() - new Date(list[0].created_at).getTime() < 60e3) return json(res, 429, { error: 'Az önce gönderdik. Bir dakika bekleyip tekrar deneyebilirsin.' });
    if (list.length >= 5) return json(res, 429, { error: 'Çok fazla deneme oldu. Bir saat sonra tekrar dene ya da yönetim kuruluna yaz.' });
    const token = crypto.randomBytes(32).toString('hex');
    const ins = await sb('/rest/v1/school_verifications', { method: 'POST', body: JSON.stringify({ user_id: p.id, token_hash: sha(token), expires_at: new Date(Date.now() + 24 * 3600e3).toISOString() }) });
    if (!ins.ok) return json(res, 500, { error: 'Onay maili hazırlanamadı.' });
    const to = p.student_no + '@' + SCHOOL_DOMAIN;
    const link = siteUrl(req) + '/api/password?verify=' + token;
    const m = await sendMail({
      to,
      subject: 'BÜMT: Hesabını onayla',
      html: mailLayout('Hesabını onayla 🎸', `
        <p style="margin:0 0 12px">Merhaba ${esc(p.full_name || '')}, Başkent Üniversitesi Müzik Topluluğu sitesine kaydın alındı.</p>
        <p style="margin:0 0 16px">Öğrenci numaranın sana ait olduğunu doğrulamak için aşağıdaki butona bas; hesabın hemen onaylanacak. Link <b>24 saat</b> geçerli.</p>
        <div style="margin:0 0 16px">${btn(link, 'Hesabımı onayla', '#D7301F')}</div>
        <p style="margin:0;color:#5E5648;font-size:13px">Bu kaydı sen yapmadıysan bu e-postayı görmezden gel; hesap onaylanmaz.</p>`)
    });
    if (m && m.ok === false && !m.skipped) return json(res, 500, { error: 'Mail gönderilemedi, biraz sonra tekrar dene.' });
    return json(res, 200, { ok: true, to });
  }

  if (body.action === 'reset') {
    const token = String(body.token || '');
    const pw = String(body.password || '');
    if (!/^[0-9a-f]{64}$/.test(token)) return json(res, 400, { error: 'Link geçersiz.' });
    if (pw.length < 6) return json(res, 400, { error: 'Şifre en az 6 karakter olmalı.' });
    const r = await sb('/rest/v1/password_resets?select=id,user_id,expires_at,used_at&token_hash=eq.' + sha(token));
    const row = r.ok && Array.isArray(r.data) ? r.data[0] : null;
    if (!row) return json(res, 400, { error: 'Link geçersiz. Yeni bir sıfırlama linki iste.' });
    if (row.used_at) return json(res, 400, { error: 'Bu link daha önce kullanılmış. Yeni bir sıfırlama linki iste.' });
    if (new Date(row.expires_at).getTime() < Date.now()) return json(res, 400, { error: 'Linkin süresi dolmuş. Yeni bir sıfırlama linki iste.' });
    const u = await sb('/auth/v1/admin/users/' + row.user_id, { method: 'PUT', body: JSON.stringify({ password: pw }) });
    if (!u.ok) return json(res, 400, { error: 'Şifre değiştirilemedi. Biraz daha güçlü bir şifre dene.' });
    await sb('/rest/v1/password_resets?user_id=eq.' + row.user_id + '&used_at=is.null', { method: 'PATCH', body: JSON.stringify({ used_at: new Date().toISOString() }) });
    return json(res, 200, { ok: true });
  }

  return json(res, 400, { error: 'Bilinmeyen işlem.' });
};
