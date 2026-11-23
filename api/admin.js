// Yönetim işlemleri: hesap oluşturma, şifre sıfırlama, hesap silme.
// Gizli anahtar (SUPABASE_SECRET_KEY) sadece burada, sunucuda kullanılır.

const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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

// Yeni "sb_secret_" anahtarları JWT değildir: önce sadece apikey ile dener,
// reddedilirse Authorization başlığıyla tekrar dener (eski service_role anahtarı için).
async function admin(path, opts = {}) {
  const base = { apikey: SECRET, 'Content-Type': 'application/json' };
  const doFetch = (headers) => fetch(SB_URL + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  let r = await doFetch(SECRET.startsWith('sb_') ? base : { ...base, Authorization: 'Bearer ' + SECRET });
  if (r.status === 401 && SECRET.startsWith('sb_')) r = await doFetch({ ...base, Authorization: 'Bearer ' + SECRET });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data };
}

async function getCaller(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const r = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: SECRET, Authorization: auth } });
  if (!r.ok) return null;
  const user = await r.json();
  const p = await admin('/rest/v1/profiles?select=id,is_super,role_id,roles(permissions)&id=eq.' + encodeURIComponent(user.id));
  const prof = p.ok && Array.isArray(p.data) ? p.data[0] : null;
  if (!prof) return null;
  const perms = (prof.roles && prof.roles.permissions) || [];
  return { id: user.id, isSuper: !!prof.is_super, can: (k) => !!prof.is_super || perms.includes(k) };
}

async function getProfile(id) {
  const p = await admin('/rest/v1/profiles?select=id,is_super,is_staff&id=eq.' + encodeURIComponent(id));
  return p.ok && Array.isArray(p.data) ? p.data[0] : null;
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
  if (!caller) return send(res, 401, { error: 'Oturum bulunamadı, tekrar giriş yap.' });

  const action = body.action;

  if (action === 'create_member') {
    if (!caller.can('uyeler')) return send(res, 403, { error: 'Üye ekleme yetkin yok.' });
    const no = cleanNo(body.student_no);
    if (!/^[0-9A-Za-z]{4,20}$/.test(no)) return send(res, 400, { error: 'Öğrenci numarası geçersiz.' });
    if (!body.password || String(body.password).length < 6) return send(res, 400, { error: 'Şifre en az 6 karakter olmalı.' });
    const r = await admin('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: no.toLowerCase() + '@uye.bumt.com.tr',
        password: String(body.password),
        email_confirm: true,
        user_metadata: {
          full_name: body.full_name || '', phone: body.phone || '', department: body.department || '',
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
        user_metadata: { full_name: body.full_name || '' },
        app_metadata: { approved: true, is_staff: true, role_id: body.role_id || '' }
      })
    });
    return r.ok ? send(res, 200, { ok: true, id: r.data && r.data.id }) : send(res, 400, { error: errText(r) });
  }

  if (action === 'set_password' || action === 'delete_user') {
    const target = await getProfile(body.user_id);
    if (!target) return send(res, 404, { error: 'Hesap bulunamadı.' });
    const need = target.is_staff ? 'roller' : 'uyeler';
    if (!caller.can(need)) return send(res, 403, { error: 'Bu işlem için yetkin yok.' });
    if (target.is_super && !caller.isSuper) return send(res, 403, { error: 'Süper yönetici hesabına dokunulamaz.' });

    if (action === 'set_password') {
      if (!body.password || String(body.password).length < 6) return send(res, 400, { error: 'Şifre en az 6 karakter olmalı.' });
      const r = await admin('/auth/v1/admin/users/' + encodeURIComponent(target.id), {
        method: 'PUT', body: JSON.stringify({ password: String(body.password) })
      });
      return r.ok ? send(res, 200, { ok: true }) : send(res, 400, { error: errText(r) });
    }

    if (target.id === caller.id) return send(res, 400, { error: 'Kendi hesabını silemezsin.' });
    if (target.is_super) return send(res, 400, { error: 'Süper yönetici hesabı silinemez.' });
    const r = await admin('/auth/v1/admin/users/' + encodeURIComponent(target.id), { method: 'DELETE' });
    return r.ok ? send(res, 200, { ok: true }) : send(res, 400, { error: errText(r) });
  }

  return send(res, 400, { error: 'Bilinmeyen işlem.' });
};
