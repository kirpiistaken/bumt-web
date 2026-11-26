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

async function diagSinif() {
  // Geçici test: üye gibi sınıf kaydet, geri oku, test kullanıcısını sil
  const PUBLIC_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  const email = '99999998@uye.bumt.com.tr', pw = 'Tst-' + Math.random().toString(36).slice(2) + 'A1';
  const out = {};
  const c = await sb('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: pw, email_confirm: true, user_metadata: { full_name: 'Sinif Test', class_year: '2. sınıf', department: 'Test' } }) });
  if (!c.ok) return { olusturma: c.status + ' ' + JSON.stringify(c.data).slice(0, 200) };
  const id = c.data.id || (c.data.user && c.data.user.id);
  try {
    const p0 = await sb('/rest/v1/profiles?select=class_year,department&id=eq.' + id); out.kayit_sonrasi = p0.data;
    const t = await fetch(SB_URL + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: PUBLIC_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw }) });
    const tj = await t.json(); const tok = tj.access_token;
    out.giris = !!tok;
    const u = await fetch(SB_URL + '/rest/v1/profiles?id=eq.' + id, { method: 'PATCH', headers: { apikey: PUBLIC_KEY, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ class_year: 'Hazırlık', department: 'Test2' }) });
    out.guncelle = u.status + ' ' + (await u.text()).slice(0, 300);
    const p1 = await sb('/rest/v1/profiles?select=class_year,department&id=eq.' + id); out.guncelleme_sonrasi = p1.data;
  } finally {
    const d = await sb('/auth/v1/admin/users/' + id, { method: 'DELETE' }); out.silindi = d.ok;
  }
  return out;
}

module.exports = async (req, res) => {
  if (/[?&]diag=sinif/.test(req.url || '')) { res.setHeader('Content-Type', 'application/json; charset=utf-8'); return res.end(JSON.stringify(await diagSinif(), null, 1)); }
  const out = {
    supabase_url: SB_URL ? SB_URL.replace(/^https:\/\/([a-z0-9]{4})[a-z0-9]*/, 'https://$1…') : 'yok',
    publishable_key: (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY) ? 'var' : 'yok',
    secret_key: kind((process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()),
    resend_key: process.env.RESEND_API_KEY ? 'var' : 'yok'
  };
  if (SB_URL && SECRET) {
    const p = await sb('/rest/v1/profiles?select=id&limit=1');
    out.profiles_okuma = p.ok ? 'ok' : ('hata ' + p.status + ': ' + JSON.stringify(p.data).slice(0, 160));
    const chk = async (path) => { const r = await sb(path); return r.ok ? 'kurulu' : 'EKSİK'; };
    out.sql_002_ders_talepleri = await chk('/rest/v1/lesson_bookings?select=status&limit=1');
    out.sql_004_prova_talepleri = await chk('/rest/v1/prova_bookings?select=status&limit=1');
    out.sql_005_pazar_yoklama = await chk('/rest/v1/market_posts?select=id&limit=1');
    out.sql_006_dinleti_basvurulari = await chk('/rest/v1/dinleti_bookings?select=status&limit=1');
    out.sql_009_profil_fotografi = await chk('/rest/v1/profiles?select=avatar_url&limit=1');
    out.sql_010_sifre_sifirlama = await chk('/rest/v1/password_resets?select=id&limit=1');
    out.sql_011_guvenlik = await chk('/rest/v1/audit_log?select=id&limit=1');
    out.sql_012_instagram = await chk('/rest/v1/settings?select=instagram_posts&limit=1');
    out.sql_013_prova_kurallar = await chk('/rest/v1/settings?select=prova_rules&limit=1');
    out.sql_014_etiketler = await chk('/rest/v1/tags?select=id&limit=1');
    out.sql_015_fakulte = await chk('/rest/v1/instructors?select=faculty&limit=1');
    out.sql_017_etkinlik_konum = await chk('/rest/v1/events?select=maps_url&limit=1');
    out.sql_018_pazar_denetim = await chk('/rest/v1/market_posts?select=review&limit=1');
    out.sql_019_whatsapp_grubu = await chk('/rest/v1/settings?select=whatsapp_group&limit=1');
    out.sql_021_okul_maili = await chk('/rest/v1/school_verifications?select=id&limit=1');
    out.sql_022_enstruman_pazari = await chk('/rest/v1/equipment_posts?select=id&limit=1');
    out.sql_025_mesajlasma = await chk('/rest/v1/dm_threads?select=id&limit=1');
    out.sql_026_mesaj_bildirim = await chk('/rest/v1/profiles?select=notify_dm&limit=1');
    out.sql_028_duyuru_epostasi = await chk('/rest/v1/profiles?select=news_mail,unsub_token&limit=1');
    out.ai_denetim = process.env.ANTHROPIC_API_KEY ? 'açık' : 'kapalı (ANTHROPIC_API_KEY yok — sadece kelime listesi)';
    out.sql_016_egitmen_hesaptan = '(SQL Editor\'de çalıştırıldıysa tamam — buradan kontrol edilemiyor)';
    const a = await sb('/auth/v1/admin/users?per_page=1');
    { const c = await sb('/rest/v1/profiles?select=class_year,department&is_staff=eq.false'); if (c.ok && Array.isArray(c.data)) out.uye_sinif_dolu = c.data.filter((x) => x.class_year).length + ' / ' + c.data.length + ' (bölüm dolu: ' + c.data.filter((x) => x.department).length + ')'; }
    { const u = await sb('/auth/v1/admin/users?per_page=200'); const list = u.ok && u.data && Array.isArray(u.data.users) ? u.data.users : []; const vals = {}; list.forEach((x) => { const v = x.user_metadata && x.user_metadata.class_year; const k = v === undefined ? '(yok)' : (v === '' ? '(boş)' : 'dolu'); vals[k] = (vals[k] || 0) + 1; }); out.kayit_sinif_meta = JSON.stringify(vals); }
    out.auth_admin = a.ok ? 'ok' : ('hata ' + a.status + ': ' + JSON.stringify(a.data).slice(0, 160));
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(out, null, 2));
};
