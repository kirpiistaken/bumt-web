// Yönetim işlemleri: hesap oluşturma, şifre sıfırlama, hesap silme.
// Gizli anahtar (SUPABASE_SECRET_KEY) sadece burada, sunucuda kullanılır.

const { SB_URL, SECRET, sb: admin, getCaller } = require('./_auth');

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function getProfile(id) {
  const p = await admin('/rest/v1/profiles?select=id,is_super,is_staff&id=eq.' + encodeURIComponent(id));
  if (!p.ok) return { error: 'Sunucu veritabanını okuyamadı (' + p.status + '). Vercel\'deki SUPABASE_SECRET_KEY değerini kontrol et; /api/health adresinden durumu görebilirsin.' };
  const row = Array.isArray(p.data) ? p.data[0] : null;
  return row || { error: 'Hesap bulunamadı. Sunucu anahtarı yanlış olabilir; /api/health adresini kontrol et.' };
}

function errText(r) {
  const d = r.data || {};
  const msg = d.msg || d.message || d.error_description || d.error || '';
  if (/already been registered|already registered|email_exists/i.test(msg + (d.error_code || ''))) return 'Bu öğrenci numarası / kullanıcı adı zaten kayıtlı.';
  if (/password/i.test(msg)) return 'Şifre en az 6 karakter olmalı.';
  return msg || ('İşlem başarısız (' + r.status + ')');
}

const cleanNo = (s) => String(s || '').trim().replace(/\s+/g, '');
const cleanUser = (s) => String(s || '').trim().toLowerCase();

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Sadece POST' });
  if (!SB_URL || !SECRET) return send(res, 500, { error: 'Sunucu ayarları eksik (SUPABASE_URL / SUPABASE_SECRET_KEY).' });

  let body;
  try { body = await readBody(req); } catch (e) { return send(res, 400, { error: 'Geçersiz istek.' }); }

  const caller = await getCaller(req);
  if (caller.error) return send(res, 401, { error: caller.error });

  const action = body.action;

  if (action === 'create_member') {
    if (!caller.can('uyeler')) return send(res, 403, { error: 'Üye ekleme yetkin yok.' });
    const no = cleanNo(body.student_no);
    if (!/^[0-9]{8}$/.test(no)) return send(res, 400, { error: 'Öğrenci numarası 8 haneli olmalı.' });
    if (!body.password || String(body.password).length < 6) return send(res, 400, { error: 'Şifre en az 6 karakter olmalı.' });
    const r = await admin('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: no.toLowerCase() + '@uye.bumt.com.tr',
        password: String(body.password),
        email_confirm: true,
        user_metadata: {
          full_name: body.full_name || '', phone: body.phone || '', faculty: String(body.faculty || '').slice(0, 120), department: body.department || '',
          class_year: body.class_year || '', member_type: body.member_type === 'muzisyen' ? 'muzisyen' : 'dinleyici',
          instruments: Array.isArray(body.instruments) ? body.instruments : [], kvkk: true
        },
        app_metadata: { approved: body.approved !== false }
      })
    });
    return r.ok ? send(res, 200, { ok: true, id: r.data && r.data.id }) : send(res, 400, { error: errText(r) });
  }

  if (action === 'create_staff') {
    if (!caller.can('roller')) return send(res, 403, { error: 'Yönetim hesabı açma yetkin yok.' });
    const u = cleanUser(body.username);
    if (!/^[a-z0-9._-]{3,30}$/.test(u)) return send(res, 400, { error: 'Kullanıcı adı 3-30 karakter olmalı; harf, rakam, nokta, tire.' });
    if (u === 'admin') return send(res, 400, { error: 'Bu kullanıcı adı ayrılmış.' });
    if (!body.password || String(body.password).length < 6) return send(res, 400, { error: 'Şifre en az 6 karakter olmalı.' });
    const r = await admin('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: u + '@yonetim.bumt.com.tr',
        password: String(body.password),
        email_confirm: true,
        user_metadata: { full_name: body.full_name || '', contact_email: body.contact_email || '' },
        app_metadata: { approved: true, is_staff: true, role_id: body.role_id || '' }
      })
    });
    return r.ok ? send(res, 200, { ok: true, id: r.data && r.data.id }) : send(res, 400, { error: errText(r) });
  }

  if (action === 'set_password' || action === 'delete_user') {
    const target = await getProfile(body.user_id);
    if (target.error) return send(res, 404, { error: target.error });
    const need = target.is_staff ? 'roller' : 'uyeler';
    if (!caller.can(need)) return send(res, 403, { error: 'Bu işlem için yetkin yok.' });
    if (target.is_super && !caller.isSuper) return send(res, 403, { error: 'Süper yönetici hesabına dokunulamaz.' });

    if (action === 'set_password') {
      return send(res, 403, { error: 'Panelden elle şifre belirleme kapatıldı. Üyeye "Sıfırlama linki gönder" kullan.' });
    }

    if (target.id === caller.id) return send(res, 400, { error: 'Kendi hesabını silemezsin.' });
    if (target.is_super) return send(res, 400, { error: 'Süper yönetici hesabı silinemez.' });
    const r = await admin('/auth/v1/admin/users/' + encodeURIComponent(target.id), { method: 'DELETE' });
    if (r.ok) await admin('/rest/v1/audit_log', { method: 'POST', body: JSON.stringify({ actor: caller.id, action: 'hesap_silindi', target_id: target.id, detail: 'panelden' }) });
    return r.ok ? send(res, 200, { ok: true }) : send(res, 400, { error: errText(r) });
  }

  return send(res, 400, { error: 'Bilinmeyen işlem.' });
};
