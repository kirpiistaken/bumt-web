// Kurulum kontrolü: anahtarların türünü ve veritabanına erişimi gösterir (anahtarların kendisini göstermez).
const { SB_URL, SECRET, sb } = require('./_auth');

function kind(k) {
  if (!k) return 'yok';
  if (k.startsWith('sb_secret_')) return 'secret (doğru)';
  if (k.startsWith('sb_publishable_')) return 'publishable (YANLIŞ: buraya secret key gelmeli)';
  try {
    const role = JSON.parse(Buffer.from(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()).role;
    return 'eski JWT anahtarı, rol: ' + role + (role === 'service_role' ? ' (doğru)' : ' (YANLIŞ: service_role olmalı)');
  } catch (e) { return 'tanınmayan biçim'; }
}

module.exports = async (req, res) => {
  const out = {
    supabase_url: SB_URL ? SB_URL.replace(/^https:\/\/([a-z0-9]{4})[a-z0-9]*/, 'https://$1…') : 'yok',
    publishable_key: (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY) ? 'var' : 'yok',
    secret_key: kind((process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()),
    resend_key: process.env.RESEND_API_KEY ? 'var' : 'yok'
  };
  if (SB_URL && SECRET) {
    const p = await sb('/rest/v1/profiles?select=id&limit=1000');
    out.profiles_okuma = p.ok ? ('ok, ' + (Array.isArray(p.data) ? p.data.length : '?') + ' profil') : ('hata ' + p.status + ': ' + JSON.stringify(p.data).slice(0, 160));
    const a = await sb('/auth/v1/admin/users?per_page=1');
    out.auth_admin = a.ok ? 'ok' : ('hata ' + a.status + ': ' + JSON.stringify(a.data).slice(0, 160));
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(out, null, 2));
};
