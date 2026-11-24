// Günlük temizlik (Vercel Cron): onaylanmasının üzerinden 7 gün geçen prova çıkış fotoğraflarını siler.
const { SB_URL, SECRET, sb } = require('./_auth');
const { moderatePost } = require('./_moderate');
const { siteUrl } = require('./_mail');

module.exports = async (req, res) => {
  const cron = process.env.CRON_SECRET;
  if (cron && req.headers.authorization !== 'Bearer ' + cron) { res.statusCode = 401; return res.end('yetkisiz'); }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!SB_URL || !SECRET) { res.statusCode = 500; return res.end('{"error":"ayar eksik"}'); }
  const cutoff = new Date(Date.now() - 7 * 864e5).toISOString();
  const q = await sb('/rest/v1/prova_attendance?select=id,photos&review_status=eq.onaylandi&photos_deleted_at=is.null&reviewed_at=lt.' + encodeURIComponent(cutoff) + '&limit=200');
  const rows = q.ok && Array.isArray(q.data) ? q.data : [];
  let deleted = 0;
  for (const r of rows) {
    const paths = (r.photos || []).filter(Boolean);
    if (paths.length) {
      const d = await sb('/storage/v1/object/prova-photos', { method: 'DELETE', body: JSON.stringify({ prefixes: paths }) });
      if (!d.ok) continue;
    }
    await sb('/rest/v1/prova_attendance?id=eq.' + r.id, { method: 'PATCH', body: JSON.stringify({ photos: [], photos_deleted_at: new Date().toISOString() }) });
    deleted++;
  }
  // Enstrüman adı düzeltmesi: "Yan Flüt" → "Flüt" (kayıtlı verilerde)
  let renamed = 0;
  const OLD = 'Yan Flüt', NEW = 'Flüt';
  const fix = (arr) => Array.from(new Set((arr || []).map((x) => (x === OLD ? NEW : x))));
  const pr = await sb('/rest/v1/profiles?select=id,instruments&instruments=cs.' + encodeURIComponent('{"' + OLD + '"}'));
  for (const r of (pr.ok && Array.isArray(pr.data) ? pr.data : [])) {
    const u = await sb('/rest/v1/profiles?id=eq.' + r.id, { method: 'PATCH', body: JSON.stringify({ instruments: fix(r.instruments) }) }); if (u.ok) renamed++;
  }
  const mp = await sb('/rest/v1/market_posts?select=id,looking_for,my_role&or=(looking_for.cs.' + encodeURIComponent('{"' + OLD + '"}') + ',my_role.ilike.*' + encodeURIComponent(OLD) + '*)');
  for (const r of (mp.ok && Array.isArray(mp.data) ? mp.data : [])) {
    const u = await sb('/rest/v1/market_posts?id=eq.' + r.id, { method: 'PATCH', body: JSON.stringify({ looking_for: fix(r.looking_for), my_role: String(r.my_role || '').split(OLD).join(NEW) }) }); if (u.ok) renamed++;
  }
  const ins = await sb('/rest/v1/instructors?instrument=eq.' + encodeURIComponent(OLD), { method: 'PATCH', body: JSON.stringify({ instrument: NEW }), headers: { Prefer: 'return=representation' } });
  if (ins.ok && Array.isArray(ins.data)) renamed += ins.data.length;

  // Kontrolü yarım kalmış pazar ilanlarını denetle
  let checked = 0;
  const old = new Date(Date.now() - 10 * 60e3).toISOString();
  const k = await sb('/rest/v1/market_posts?select=id&active=eq.true&review=eq.kontrol&created_at=lt.' + encodeURIComponent(old) + '&limit=50');
  for (const p of (k.ok && Array.isArray(k.data) ? k.data : [])) { await moderatePost(p.id, siteUrl(req), true); checked++; }
  res.end(JSON.stringify({ ok: true, cleaned: deleted, pazar_checked: checked, renamed }));
};
