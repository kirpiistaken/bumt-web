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
  const r = await fetch(SB_URL + '/rest/v1/profiles?select=id,is_super,role_id,roles(permissions)&id=eq.' + sub, {
    headers: { apikey: key, Authorization: 'Bearer ' + token }
  });
  const data = await parse(r);
  if (!r.ok) return { error: 'Oturum doğrulanamadı (' + r.status + '). Çıkış yapıp tekrar gir.' };
  const prof = Array.isArray(data) ? data[0] : null;
  if (!prof || prof.id !== sub) return { error: 'Profil bulunamadı.' };
  const perms = (prof.roles && prof.roles.permissions) || [];
  return { id: sub, isSuper: !!prof.is_super, can: (k) => !!prof.is_super || perms.includes(k) };
}

module.exports = { SB_URL, SECRET, sb, getCaller };
