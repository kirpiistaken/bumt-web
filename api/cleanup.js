// Günlük temizlik (Vercel Cron): onaylanmasının üzerinden 7 gün geçen prova çıkış fotoğraflarını siler.
const { SB_URL, SECRET, sb } = require('./_auth');

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
  res.end(JSON.stringify({ ok: true, cleaned: deleted }));
};
