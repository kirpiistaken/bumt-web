// E-postayla şifre sıfırlama: link isteme ve yeni şifre belirleme.
const crypto = require('crypto');
const { SB_URL, SECRET, sb } = require('./_auth');
const { esc, siteUrl, sendMail, mailLayout, btn, readBody, json } = require('./_mail');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const GENERIC = 'Bu bilgiye kayıtlı bir e-posta adresi varsa, şifre sıfırlama linkini gönderdik. Gelen kutunu (ve spam klasörünü) kontrol et. Link 30 dakika geçerli.';

async function findProfile(ident) {
  const v = String(ident || '').trim().toLowerCase();
  if (!v || v.length > 60) return null;
  const col = /^[0-9]+$/.test(v) ? 'student_no' : 'username';
  const r = await sb('/rest/v1/profiles?select=id,full_name,contact_email,student_no,username&' + col + '=eq.' + encodeURIComponent(v));
  return r.ok && Array.isArray(r.data) ? r.data[0] : null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Sadece POST' });
  if (!SB_URL || !SECRET) return json(res, 500, { error: 'Sunucu ayarları eksik.' });
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
