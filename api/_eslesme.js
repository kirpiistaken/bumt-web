// Müzisyen pazarı: yeni ilan yayına girince, aranan enstrümanı çalan üyelere e-posta.
const { sb } = require('./_auth');
const { esc } = require('./_mail');

const RESEND = (process.env.RESEND_API_KEY || '').trim();
const MAIL_FROM = process.env.MAIL_FROM || 'BÜMT <bildirim@bumt.com.tr>';

// Aranan rol → bu enstrümanları çalanlar uygun sayılır
const SAME = { 'Gitar': ['Gitar', 'Elektro Gitar'], 'Elektro Gitar': ['Elektro Gitar', 'Gitar'] };
const EMOJI = { 'Gitar': '🎸', 'Elektro Gitar': '🎸', 'Bas Gitar': '🎸', 'Davul': '🥁', 'Piyano / Klavye': '🎹', 'Keman': '🎻', 'Viyola': '🎻', 'Çello': '🎻', 'Vokal': '🎤', 'Flüt': '🪈', 'Saksafon': '🎷', 'Bağlama': '🪕', 'Ukulele': '🪕' };
// "Piyano / Klavye" → "piyanist / klavyeci" gibi insan diliyle
const PERSON = { 'Gitar': 'gitarist', 'Elektro Gitar': 'elektro gitarist', 'Bas Gitar': 'basçı', 'Davul': 'davulcu', 'Piyano / Klavye': 'piyanist / klavyeci', 'Keman': 'kemancı', 'Viyola': 'viyolacı', 'Çello': 'çellist', 'Vokal': 'vokalist', 'Flüt': 'flütçü', 'Saksafon': 'saksafoncu', 'Bağlama': 'bağlamacı', 'Ukulele': 'ukulele çalan' };

function wantedFor(post, instruments) {
  const mine = new Set(instruments || []);
  return (post.looking_for || []).filter((w) => w !== 'Diğer' && (SAME[w] || [w]).some((i) => mine.has(i)));
}

async function recipients(post) {
  const r = await sb('/rest/v1/profiles?select=id,full_name,contact_email,instruments,unsub_token,notify_match&status=eq.onaylandi&member_type=eq.muzisyen&is_staff=eq.false&contact_email=neq.');
  if (!r.ok || !Array.isArray(r.data)) return { error: 'Üyeler okunamadı. 029 numaralı SQL çalıştırıldı mı?' };
  const seen = new Set();
  const list = [];
  for (const p of r.data) {
    if (p.id === post.user_id || p.notify_match === false) continue;
    const m = String(p.contact_email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m) || seen.has(m)) continue;
    const wanted = wantedFor(post, p.instruments);
    if (!wanted.length) continue;
    seen.add(m);
    list.push({ ...p, wanted });
  }
  return { list };
}

function matchMail(base, post, name, wanted, unsubUrl) {
  const link = base + '/#/pazar/' + post.id;
  const em = EMOJI[wanted[0]] || '🎶';
  const who = wanted.map((w) => PERSON[w] || w).join(' / ');
  let desc = String(post.description || '').trim();
  if (desc.length > 500) desc = desc.slice(0, 480).replace(/\s+\S*$/, '') + '…';
  const info = (label, val) => val ? `<tr><td width="1%" style="padding:7px 18px 7px 0;color:#8A8070;font-size:12px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:7px 0;font-size:15px;font-weight:bold;color:#141414">${val}</td></tr>` : '';
  const pills = (post.looking_for || []).map((w) => {
    const hit = wanted.includes(w);
    return `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 12px;border-radius:999px;font-size:13px;font-weight:bold;border:2px solid #141414;background:${hit ? '#D7301F' : '#F4EAD5'};color:${hit ? '#fff' : '#141414'}">${esc(w)}</span>`;
  }).join('');
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(post.title)}</title></head>
<body style="margin:0;padding:0;background:#F4EAD5;font-family:Arial,Helvetica,sans-serif;color:#141414">
<div style="display:none;max-height:0;overflow:hidden">${esc(post.display_name || 'Bir üye')} ${esc(who)} arıyor: ${esc(post.title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4EAD5"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
    <tr><td style="background:#141414;border-radius:18px 18px 0 0;padding:16px 22px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="70"><img src="${esc(base)}/assets/logo.png" width="67" height="46" alt="BÜMT" style="display:block;border:0"></td>
        <td style="padding-left:12px"><div style="color:#F4EAD5;font-size:22px;font-weight:bold;letter-spacing:.04em">BÜMT</div><div style="color:#CFC6B4;font-size:12px">Müzisyen pazarı</div></td>
        <td align="right"><span style="display:inline-block;background:#D7301F;color:#fff;font-size:12px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;padding:5px 12px;border-radius:999px">Yeni ilan</span></td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#D7301F;padding:22px 26px;border-left:3px solid #141414;border-right:3px solid #141414">
      <div style="font-size:40px;line-height:1">${em}</div>
      <div style="color:#fff;font-size:24px;font-weight:bold;line-height:1.25;margin-top:8px">${esc(cap(who))} arıyorlar!</div>
      <div style="color:#FFE3DD;font-size:15px;margin-top:6px">Profilinde ${esc(wanted.join(', '))} çaldığını yazdığın için sana haber veriyoruz.</div>
    </td></tr>
    <tr><td style="background:#ffffff;border:3px solid #141414;border-top:0;border-radius:0 0 18px 18px;padding:26px">
      <div style="font-size:15px;color:#5E5648;margin:0 0 6px">Merhaba${name ? ' ' + esc(name.split(' ')[0]) : ''} 👋</div>
      <div style="display:inline-block;background:#141414;color:#F4EAD5;font-size:12px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase;padding:4px 10px;border-radius:6px;margin:6px 0 10px">${esc(post.kind)}</div>
      <h1 style="margin:0 0 16px;font-size:26px;line-height:1.2;color:#141414">${esc(post.title)}</h1>
      <div style="margin:0 0 14px">${pills}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="background:#FBF6EC;border-radius:14px;padding:8px 16px;margin:0 0 18px;width:100%">
        ${info('İlan sahibi', esc(post.display_name || ''))}
        ${info('Kendisi', esc(post.my_role || ''))}
        ${info('Tarz', esc(post.genre || ''))}
      </table>
      ${desc ? `<p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:#2A2620;white-space:pre-line">${esc(desc)}</p>` : ''}
      <a href="${esc(link)}" style="display:inline-block;background:#D7301F;color:#fff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 26px;border-radius:999px;border:2px solid #141414">İlanı gör ve yaz →</a>
      <p style="margin:22px 0 0;font-size:14px;color:#5E5648">İlgini çekmediyse sorun değil, bir sonrakinde görüşürüz 🤘<br><b style="color:#141414">BÜMT</b></p>
    </td></tr>
    <tr><td style="height:70px;line-height:70px">&nbsp;</td></tr>
    <tr><td align="right" style="padding:0 6px;font-size:11px;color:#A79E8D">Bu e-postayı çaldığın enstrümana uygun bir ilan açıldığı için aldın. <a href="${esc(unsubUrl)}" style="color:#A79E8D">Bu bildirimleri kapat</a></td></tr>
  </table>
</td></tr></table></body></html>`;
  const subject = em + ' ' + cap(who) + ' arıyorlar: ' + post.title;
  return { subject, html };
}
function cap(s) { return s ? s.charAt(0).toLocaleUpperCase('tr') + s.slice(1) : s; }

async function sendBatch(list) {
  let sent = 0, failed = 0;
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    const r = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST', headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk.map((m) => ({ from: MAIL_FROM, to: [m.to], subject: m.subject, html: m.html,
        headers: { 'List-Unsubscribe': '<' + m.unsub + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } })))
    });
    if (r.ok) sent += chunk.length; else { failed += chunk.length; console.error('Resend batch hata', r.status, await r.text()); }
  }
  return { sent, failed };
}

async function loadMarket(id) {
  const r = await sb('/rest/v1/market_posts?select=*&id=eq.' + id);
  return r.ok && Array.isArray(r.data) ? r.data[0] : null;
}

// force=false: sadece daha önce bildirilmemiş, yayında ve açık ilanlar için gönderir.
async function notifyMatches(id, base, opts = {}) {
  const post = await loadMarket(id);
  if (!post) return { error: 'İlan bulunamadı.' };
  if (!post.active || post.review !== '') return { skipped: 'ilan yayında değil' };
  if (post.match_notified_at && !opts.force) return { skipped: 'zaten bildirildi', at: post.match_notified_at };
  const rc = await recipients(post);
  if (rc.error) return rc;
  if (opts.countOnly) return { count: rc.list.length, notified_at: post.match_notified_at || null, wanted: post.looking_for || [] };
  if (opts.preview) {
    const w = post.looking_for && post.looking_for[0] ? [post.looking_for[0]] : ['Gitar'];
    return matchMail(base, post, 'Atalay', w, base + '/api/duyuru?u=00000000-0000-0000-0000-000000000000&t=ilan');
  }
  if (!RESEND) return { error: 'E-posta servisi tanımlı değil.' };
  // Önce işaretle (aynı anda iki istek gelirse iki kez gitmesin)
  await sb('/rest/v1/market_posts?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ match_notified_at: new Date().toISOString() }) });
  if (!rc.list.length) return { sent: 0 };
  const mails = rc.list.map((p) => {
    const unsub = base + '/api/duyuru?u=' + p.unsub_token + '&t=ilan';
    const m = matchMail(base, post, p.full_name, p.wanted, unsub);
    return { to: p.contact_email, subject: m.subject, html: m.html, unsub };
  });
  const out = await sendBatch(mails);
  console.log('ilan eşleşme bildirimi', id, out);
  return out;
}

module.exports = { notifyMatches, matchMail, wantedFor };
