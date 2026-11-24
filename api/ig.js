// Instagram gönderisinin kapak görselini getirir (sitede düzgün kare kutucuk olarak göstermek için).
// GET /api/ig?code=XXXX  → görselin kendisi (1 gün önbellekte tutulur)
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const dec = (s) => s.replace(/&amp;/g, '&').replace(/\\u0026/g, '&').replace(/\\\//g, '/');

async function findImage(code) {
  for (const kind of ['p', 'reel']) {
    const r = await fetch('https://www.instagram.com/' + kind + '/' + code + '/embed/captioned/', { headers: { 'User-Agent': UA, 'Accept-Language': 'tr-TR,tr;q=0.9' } });
    if (!r.ok) continue;
    const h = await r.text();
    const tag = h.match(/<img[^>]+class="[^"]*EmbeddedMediaImage[^"]*"[^>]*>/);
    if (tag) { const m = tag[0].match(/src="([^"]+)"/); if (m) return dec(m[1]); }
    const j = h.match(/"display_url"\s*:\s*"([^"]+)"/) || h.match(/"thumbnail_src"\s*:\s*"([^"]+)"/);
    if (j) return dec(j[1]);
  }
  return null;
}

module.exports = async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const code = String(u.searchParams.get('code') || '');
  if (u.searchParams.get('debug') === '1' && /^[A-Za-z0-9_-]{5,40}$/.test(code)) {
    const out = [];
    const tries = [
      ['embed', 'https://www.instagram.com/p/' + code + '/embed/captioned/', UA],
      ['fb', 'https://www.instagram.com/p/' + code + '/', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'],
      ['google', 'https://www.instagram.com/p/' + code + '/', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)']
    ];
    for (const [k, url, ua] of tries) {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': ua } });
        const h = await r.text();
        out.push({ k, status: r.status, final: r.url, len: h.length,
          og: (h.match(/<meta[^>]+og:image[^>]+>/) || [''])[0].slice(0, 400),
          sc: (h.match(/scontent[^"'\s<]{0,250}/g) || []).slice(0, 3) });
      } catch (e) { out.push({ k, error: String(e) }); }
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify(out, null, 1));
  }
  if (!/^[A-Za-z0-9_-]{5,40}$/.test(code)) { res.statusCode = 400; return res.end('geçersiz'); }
  try {
    const src = await findImage(code);
    if (!src || !/^https:\/\/[a-z0-9.-]+\.(cdninstagram\.com|fbcdn\.net)\//.test(src)) throw new Error('görsel bulunamadı');
    const img = await fetch(src, { headers: { 'User-Agent': UA } });
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
