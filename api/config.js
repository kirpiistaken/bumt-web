// Tarayıcıya sadece herkese açık (publishable/anon) anahtarı verir.
module.exports = (req, res) => {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = url && key ? 200 : 500;
  res.end(JSON.stringify(url && key ? { url, key } : { error: 'Vercel ortam değişkenleri eksik: SUPABASE_URL ve SUPABASE_PUBLISHABLE_KEY' }));
};
