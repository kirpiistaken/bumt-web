// Instagram gönderisinin kapak görselini getirir (sitede düzgün kare kutucuk olarak göstermek için).
// GET /api/ig?code=XXXX  → görselin kendisi (1 gün önbellekte tutulur)
const BOT = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const dec = (s) => s.replace(/&amp;/g, '&');

async function findImage(code) {
  for (const kind of ['p', 'reel']) {
    const r = await fetch('https://www.instagram.com/' + kind + '/' + code + '/', { headers: { 'User-Agent': BOT } });
    if (!r.ok) continue;
    const h = await r.text();
    const m = h.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/) || h.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/);
    if (m) return dec(m[1]);
  }
  return null;
}

module.exports = async (req, res) => {
  const code = String(new URL(req.url, 'http://x').searchParams.get('code') || '');
  if (!/^[A-Za-z0-9_-]{5,40}$/.test(code)) { res.statusCode = 400; return res.end('geçersiz'); }
  try {
    const src = await findImage(code);
    if (!src || !/^https:\/\/[a-z0-9.-]+\.(cdninstagram\.com|fbcdn\.net)\//.test(src)) throw new Error('görsel bulunamadı');
    const img = await fetch(src);
    if (!img.ok) throw new Error('indirilemedi');
    const buf = Buffer.from(await img.arrayBuffer());
    res.setHeader('Content-Type', img.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
    res.end(buf);
  } catch (e) {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'public, s-maxage=600');
    res.end('yok');
  }
};
