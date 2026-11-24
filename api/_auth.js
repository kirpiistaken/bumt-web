// Ortak: Supabase sunucu çağrıları ve isteği yapan kullanıcıyı doğrulama.
const SB_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const SECRET = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const PUBLIC_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

async function parse(r) {
  const t = await r.text();
  try { return t ? JSON.parse(t) : null; } catch (e) { return t; }
}

// Gizli anahtarla (RLS'siz) sunucu çağrısı. supabase-js ile aynı başlıkları gönderir.
async function sb(path, opts = {}) {
  const doFetch = (h) => fetch(SB_URL + path, { ...opts, headers: { ...h, ...(opts.headers || {}) } });
  let r = await doFetch({ apikey: SECRET, Authorization: 'Bearer ' + SECRET, 'Content-Type': 'application/json' });
  if (r.status === 401) r = await doFetch({ apikey: SECRET, 'Content-Type': 'application/json' });
  return { ok: r.ok, status: r.status, data: await parse(r) };
}

function jwtSub(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(part, 'base64').toString('utf8')).sub || null;
  } catch (e) { return null; }
}

// Kullanıcının kendi oturum anahtarıyla kendi profilini okur.
// Anahtar sahteyse Supabase isteği reddeder; böylece kimlik doğrulanmış olur.
async function getCaller(req) {
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) return { error: 'Oturum bilgisi gönderilmedi.' };
  const token = auth.slice(7).trim();
  const sub = jwtSub(token);
  if (!sub || !/^[0-9a-f-]{36}$/i.test(sub)) return { error: 'Oturum geçersiz.' };
  const key = PUBLIC_KEY || SECRET;
  // Kullanıcının kendi oturumuyla etkin yetkilerini sorar (iki adımlı doğrulama dahil). Sahte oturumu Supabase reddeder.
  const r = await fetch(SB_URL + '/rest/v1/rpc/my_access', {
    method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}'
  });
  const data = await parse(r);
  if (!r.ok || !data || typeof data !== 'object') return { error: 'Oturum doğrulanamadı (' + r.status + '). Çıkış yapıp tekrar gir.' };
  const perms = Array.isArray(data.perms) ? data.perms : [];
  return { id: sub, isSuper: !!data.is_super, mfaOk: !!data.mfa_ok, can: (k) => !!data.is_super || perms.includes(k) };
}

module.exports = { SB_URL, SECRET, sb, getCaller };
