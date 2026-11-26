// Etkinlik / duyuru e-postaları (bülten) ve "abonelikten çık" sayfası.
//  GET  /api/duyuru?u=<token>          → abonelikten çıkma onay sayfası
//  POST /api/duyuru (form token,d)     → çık / tekrar abone ol
//  POST /api/duyuru?u=<token>          → e-posta istemcisinin tek tıkla çıkışı (List-Unsubscribe-Post)
//  POST /api/duyuru (JSON, yetkili)    → { action: 'count' | 'preview' | 'test' | 'send', event_id }
const { sb, getCaller } = require('./_auth');
const { esc, siteUrl, page, readBody, json } = require('./_mail');

const RESEND = (process.env.RESEND_API_KEY || '').trim();
const MAIL_FROM = process.env.MAIL_FROM || 'BÜMT <bildirim@bumt.com.tr>';
const UUID = /^[0-9a-f-]{36}$/i;

const trDate = (d) => {
  if (!d) return '';
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('tr-TR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
};
const abs = (base, u) => !u ? '' : /^https?:\/\//i.test(u) ? u : base + (u.startsWith('/') ? '' : '/') + u;
const nl2br = (s) => esc(s).replace(/\r?\n/g, '<br>');

function eventMail(base, e, name, unsubUrl) {
  const link = base + '/#/etkinlik/' + e.id;
  const isDuyuru = (e.tag || '') === 'Duyuru';
  const when = [trDate(e.starts_on), e.date_text].filter(Boolean).join(' · ');
  let desc = String(e.description || '').trim();
  if (desc.length > 700) desc = desc.slice(0, 680).replace(/\s+\S*$/, '') + '…';
  const poster = abs(base, e.poster_url);
  const pill = (t, bg, fg) => `<span style="display:inline-block;background:${bg};color:${fg};font-size:12px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;padding:5px 12px;border-radius:999px">${esc(t)}</span>`;
  const bigBtn = (href, label, bg, fg) => `<a href="${esc(href)}" style="display:inline-block;background:${bg};color:${fg};text-decoration:none;font-weight:bold;font-size:16px;padding:14px 26px;border-radius:999px;border:2px solid #141414;margin:6px 8px 6px 0">${esc(label)}</a>`;
  const info = (icon, label, val) => val ? `<tr><td style="padding:8px 12px 8px 0;font-size:20px;vertical-align:top;width:28px">${icon}</td><td style="padding:8px 0;vertical-align:top"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8A8070;font-weight:bold">${label}</div><div style="font-size:16px;font-weight:bold;color:#141414;margin-top:2px">${val}</div></td></tr>` : '';
  const ctaHref = e.form_id ? link : e.cta_url;
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(e.title)}</title></head>
<body style="margin:0;padding:0;background:#F4EAD5;font-family:Arial,Helvetica,sans-serif;color:#141414">
<div style="display:none;max-height:0;overflow:hidden">${esc((when ? when + ' · ' : '') + (e.venue || '') + ' — ' + desc.slice(0, 120))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4EAD5"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
    <tr><td style="background:#141414;border-radius:18px 18px 0 0;padding:16px 22px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="52"><img src="${esc(base)}/assets/logo.png" width="44" height="44" alt="BÜMT" style="display:block;border-radius:50%;background:#fff"></td>
        <td style="padding-left:12px"><div style="color:#F4EAD5;font-size:22px;font-weight:bold;letter-spacing:.04em">BÜMT</div><div style="color:#CFC6B4;font-size:12px">Başkent Üniversitesi Müzik Topluluğu</div></td>
        <td align="right">${pill(isDuyuru ? 'Duyuru' : (e.tag || 'Etkinlik'), '#D7301F', '#fff')}</td>
      </tr></table>
    </td></tr>
    ${poster ? `<tr><td style="background:#141414;padding:0"><a href="${esc(link)}"><img src="${esc(poster)}" width="600" alt="${esc(e.title)} afişi" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a></td></tr>` : ''}
    <tr><td style="background:#ffffff;border:3px solid #141414;border-top:0;border-radius:0 0 18px 18px;padding:28px 26px 26px">
      <div style="font-size:15px;color:#5E5648;margin:0 0 6px">Merhaba${name ? ' ' + esc(name.split(' ')[0]) : ''} 👋</div>
      <h1 style="margin:0 0 18px;font-size:30px;line-height:1.15;text-transform:uppercase;letter-spacing:.01em;color:#141414">${esc(e.title)}</h1>
      ${when || e.venue ? `<table role="presentation" cellpadding="0" cellspacing="0" style="background:#FBF6EC;border-radius:14px;padding:6px 16px;margin:0 0 20px;width:100%">${info('📅', 'Ne zaman', esc(when))}${info('📍', 'Nerede', e.venue ? (e.maps_url ? `<a href="${esc(e.maps_url)}" style="color:#141414">${esc(e.venue)}</a>` : esc(e.venue)) : '')}</table>` : ''}
      ${desc ? `<p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:#2A2620">${nl2br(desc)}</p>` : ''}
      <div>
        ${ctaHref && e.cta_label ? bigBtn(ctaHref, e.cta_label, '#D7301F', '#ffffff') : ''}
        ${bigBtn(link, 'Etkinlik sayfasını aç', ctaHref && e.cta_label ? '#F4EAD5' : '#D7301F', ctaHref && e.cta_label ? '#141414' : '#ffffff')}
        ${e.maps_url ? bigBtn(e.maps_url, '📍 Konum', '#ffffff', '#141414') : ''}
      </div>
      <p style="margin:24px 0 0;font-size:14px;color:#5E5648">Görüşmek üzere,<br><b style="color:#141414">BÜMT Yönetim Kurulu</b></p>
    </td></tr>
    <tr><td align="center" style="padding:22px 10px 6px;font-size:12px;color:#8A8070">
      <a href="${esc(base)}" style="color:#5E5648;font-weight:bold;text-decoration:none">bumt.com.tr</a> · <a href="https://www.instagram.com/baskentmt" style="color:#5E5648;text-decoration:none">Instagram</a>
    </td></tr>
    <tr><td style="height:70px;line-height:70px">&nbsp;</td></tr>
    <tr><td align="right" style="padding:0 6px;font-size:11px;color:#A79E8D">Bu e-postayı BÜMT üyesi olduğun için aldın. <a href="${esc(unsubUrl)}" style="color:#A79E8D">Abonelikten çık</a></td></tr>
  </table>
</td></tr></table></body></html>`;
  const subject = (isDuyuru ? '📢 ' : '🎸 ') + e.title + (when ? ' · ' + trDate(e.starts_on).split(' ').slice(0, 2).join(' ') : '');
  return { subject: subject.replace(/ · $/, ''), html };
}

async function sendBatch(list) {
  // Resend toplu gönderim: en fazla 100 e-posta / istek
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

const unsubPage = (res, base, token, done) => {
  if (done === 'cik') return page(res, 'Abonelikten çıktın', `<p style="line-height:1.55">Artık BÜMT etkinlik ve duyuru e-postaları almayacaksın. Mesaj bildirimleri ve hesapla ilgili e-postalar etkilenmez.</p>
    <p style="line-height:1.55;color:#5E5648;font-size:14px">Fikrini değiştirirsen sitede <b>Profilim</b> sayfasından tekrar açabilirsin.</p>
    <form method="post" action="/api/duyuru"><input type="hidden" name="token" value="${esc(token)}"><input type="hidden" name="d" value="gir"><button type="submit" style="font:inherit;border:0;background:none;color:#D7301F;text-decoration:underline;cursor:pointer;padding:0">Yanlışlıkla mı bastın? Tekrar abone ol</button></form>`, true);
  if (done === 'gir') return page(res, 'Tekrar abonesin 🎉', `<p style="line-height:1.55">BÜMT etkinlik ve duyurularını yine e-postayla alacaksın.</p><p><a href="${esc(base)}" style="color:#D7301F;font-weight:bold">Siteye dön →</a></p>`, true);
  return page(res, 'Duyuru e-postalarından çık', `<p style="line-height:1.55">BÜMT etkinlik ve duyuru e-postalarını artık almak istemiyor musun?</p>
    <form method="post" action="/api/duyuru"><input type="hidden" name="token" value="${esc(token)}"><input type="hidden" name="d" value="cik">
    <button type="submit" style="font:inherit;font-weight:bold;border:2px solid #141414;background:#141414;color:#fff;padding:12px 22px;border-radius:999px;cursor:pointer">Evet, abonelikten çık</button></form>`, true);
};

async function setNews(token, on) {
  if (!UUID.test(token || '')) return false;
  const r = await sb('/rest/v1/profiles?unsub_token=eq.' + token, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ news_mail: on }) });
  return r.ok && Array.isArray(r.data) && r.data.length > 0;
}

module.exports = async (req, res) => {
  const base = siteUrl(req);
  const q = new URL(req.url, 'http://x').searchParams;

  if (req.method === 'GET') {
    const t = q.get('u') || '';
    if (!UUID.test(t)) return page(res, 'Bağlantı geçersiz', '<p>Bu abonelik bağlantısı geçersiz görünüyor.</p>', false);
    return unsubPage(res, base, t);
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Desteklenmiyor' });

  // E-posta istemcisinin "tek tıkla abonelikten çık" isteği
  if (q.get('u')) { await setNews(q.get('u'), false); return json(res, 200, { ok: true }); }

  let body;
  try { body = await readBody(req); } catch (e) { return json(res, 400, { error: 'Geçersiz istek.' }); }

  // Abonelik sayfasındaki form
  if (body.token && (body.d === 'cik' || body.d === 'gir')) {
    const ok = await setNews(body.token, body.d === 'gir');
    if (!ok) return page(res, 'Bağlantı geçersiz', '<p>Bu abonelik bağlantısı geçersiz görünüyor.</p>', false);
    return unsubPage(res, base, body.token, body.d);
  }

  // Yönetim: gönderim
  const caller = await getCaller(req);
  if (caller.error) return json(res, 401, { error: caller.error });
  if (!caller.can('etkinlikler')) return json(res, 403, { error: 'Etkinlik e-postası göndermek için yetkin yok.' });
  const id = String(body.event_id || '');
  if (!UUID.test(id)) return json(res, 400, { error: 'Etkinlik bulunamadı.' });
  const er = await sb('/rest/v1/events?select=*&id=eq.' + id);
  const e = er.ok && Array.isArray(er.data) ? er.data[0] : null;
  if (!e) return json(res, 404, { error: 'Etkinlik bulunamadı.' });

  const rr = await sb('/rest/v1/profiles?select=id,full_name,contact_email,unsub_token&status=eq.onaylandi&news_mail=eq.true&is_staff=eq.false&contact_email=neq.');
  if (!rr.ok) return json(res, 500, { error: 'Üye listesi okunamadı. 028 numaralı SQL çalıştırıldı mı?' });
  const seen = new Set();
  const recips = (rr.data || []).filter((p) => {
    const m = String(p.contact_email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m) || seen.has(m)) return false;
    seen.add(m); return true;
  });
  const totalR = await sb('/rest/v1/profiles?select=id&status=eq.onaylandi&is_staff=eq.false');
  const total = totalR.ok && Array.isArray(totalR.data) ? totalR.data.length : null;

  const action = body.action;
  if (action === 'count') return json(res, 200, { count: recips.length, total, mailed_at: e.mailed_at, mailed_count: e.mailed_count });

  if (action === 'preview') {
    const m = eventMail(base, e, 'Atalay', base + '/api/duyuru?u=00000000-0000-0000-0000-000000000000');
    return json(res, 200, { subject: m.subject, html: m.html });
  }

  if (!RESEND) return json(res, 500, { error: 'E-posta servisi (RESEND_API_KEY) tanımlı değil.' });

  if (action === 'test') {
    const me = await sb('/rest/v1/profiles?select=full_name,contact_email,unsub_token&id=eq.' + caller.id);
    const p = me.ok && Array.isArray(me.data) ? me.data[0] : null;
    if (!p || !p.contact_email) return json(res, 400, { error: 'Profilinde e-posta adresi yok; test e-postası gönderilemedi.' });
    const unsub = base + '/api/duyuru?u=' + p.unsub_token;
    const m = eventMail(base, e, p.full_name, unsub);
    const r = await sendBatch([{ to: p.contact_email, subject: '[TEST] ' + m.subject, html: m.html, unsub }]);
    return r.sent ? json(res, 200, { ok: true, to: p.contact_email }) : json(res, 502, { error: 'E-posta servisi gönderimi reddetti.' });
  }

  if (action === 'send') {
    if (!recips.length) return json(res, 400, { error: 'Duyuru e-postası alacak üye yok.' });
    const list = recips.map((p) => {
      const unsub = base + '/api/duyuru?u=' + p.unsub_token;
      const m = eventMail(base, e, p.full_name, unsub);
      return { to: p.contact_email, subject: m.subject, html: m.html, unsub };
    });
    const r = await sendBatch(list);
    await sb('/rest/v1/events?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ mailed_at: new Date().toISOString(), mailed_count: (e.mailed_count || 0) + r.sent }) });
    return json(res, 200, { ok: true, sent: r.sent, failed: r.failed });
  }

  return json(res, 400, { error: 'Bilinmeyen işlem.' });
};
