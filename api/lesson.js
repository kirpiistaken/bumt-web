// Ders talepleri: eğitmene / öğrenciye e-posta ve e-postadaki onay linkleri.
const { SB_URL, SECRET, sb, getCaller } = require('./_auth');
const RESEND = process.env.RESEND_API_KEY || '';
const MAIL_FROM = process.env.MAIL_FROM || 'BÜMT <bildirim@bumt.com.tr>';
const DAYS = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slot = (b) => 'Her ' + DAYS[b.weekday] + ' ' + String(b.hour).padStart(2, '0') + ':00–' + String(b.hour + 1).padStart(2, '0') + ':00';
const waLink = (phone) => {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 10 && d.startsWith('5')) d = '90' + d;
  return d ? 'https://wa.me/' + d : '';
};
const siteUrl = (req) => (process.env.SITE_URL || ('https://' + (req.headers['x-forwarded-host'] || req.headers.host))).replace(/\/$/, '');

async function loadBooking(filter) {
  const r = await sb('/rest/v1/lesson_bookings?select=id,instructor_id,weekday,hour,user_id,status,token,notified_at,created_at,' +
    'instructors(full_name,instrument,email,phone,profile_id),profiles(full_name,student_no,phone,contact_email,department,class_year)&' + filter);
  return r.ok && Array.isArray(r.data) ? r.data[0] : null;
}

async function instructorEmail(b) {
  const ins = b.instructors || {};
  if (ins.email) return ins.email;
  if (!ins.profile_id) return '';
  const r = await sb('/rest/v1/profiles?select=contact_email&id=eq.' + ins.profile_id);
  return r.ok && r.data && r.data[0] ? r.data[0].contact_email : '';
}

async function sendMail({ to, subject, html, replyTo }) {
  if (!RESEND || !to) return { skipped: true };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) })
  });
  if (!r.ok) console.error('Resend hata', r.status, await r.text());
  return { ok: r.ok };
}

function layout(title, inner) {
  return `<!doctype html><html lang="tr"><body style="margin:0;background:#FBF6EC;font-family:Arial,Helvetica,sans-serif;color:#141414">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#141414;color:#F4EAD5;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:bold;letter-spacing:.04em">BÜMT · Başkent Üniversitesi Müzik Topluluğu</div>
    <div style="background:#fff;border:2px solid #141414;border-top:0;border-radius:0 0 12px 12px;padding:24px">
      <h1 style="margin:0 0 16px;font-size:22px">${esc(title)}</h1>${inner}
    </div>
  </div></body></html>`;
}
const row = (k, v) => v ? `<tr><td style="padding:6px 12px 6px 0;color:#5E5648;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;font-weight:bold">${v}</td></tr>` : '';
const btn = (href, label, bg) => `<a href="${esc(href)}" style="display:inline-block;background:${bg};color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px;margin:4px 8px 4px 0">${esc(label)}</a>`;

function requestMail(b, base) {
  const p = b.profiles || {}, i = b.instructors || {};
  const wa = waLink(p.phone);
  const link = (d) => base + '/api/lesson?token=' + b.token + '&d=' + d;
  return layout('Yeni ders talebi', `
    <p style="margin:0 0 16px">Merhaba ${esc(i.full_name)}, BÜMT sitesinden <b>${esc(i.instrument)}</b> dersi için bir talep geldi.</p>
    <table style="border-collapse:collapse;margin-bottom:16px">
      ${row('Öğrenci', esc(p.full_name))}
      ${row('Öğrenci no', esc(p.student_no))}
      ${row('Bölüm', esc([p.department, p.class_year].filter(Boolean).join(' · ')))}
      ${row('İstediği saat', esc(slot(b)))}
    </table>
    <p style="margin:0 0 8px">Onaylarsan bu saat takvimde dolu görünür ve aynı saate gelen diğer talepler reddedilir.</p>
    <div style="margin:12px 0 16px">${btn(link('onayla'), 'Talebi onayla', '#D7301F')}${btn(link('reddet'), 'Reddet', '#141414')}</div>
    ${wa ? `<p style="margin:0 0 8px">Öğrenciye yazmak için: <a href="${esc(wa)}" style="color:#B3261A;font-weight:bold">WhatsApp'tan yaz</a></p>` : ''}
    <p style="margin:16px 0 0;color:#5E5648;font-size:13px">Tüm taleplerini sitede Eğitmen paneli'nden de yönetebilirsin: ${esc(base)}/#/egitmen</p>`);
}

function decisionMail(b, base) {
  const i = b.instructors || {};
  const ok = b.status === 'onaylandi';
  return layout(ok ? 'Ders talebin onaylandı' : 'Ders talebin onaylanmadı', ok ? `
    <p style="margin:0 0 12px"><b>${esc(i.full_name)}</b> ile <b>${esc(i.instrument)}</b> dersi talebin onaylandı: <b>${esc(slot(b))}</b>.</p>
    <p style="margin:0 0 12px">Başlangıç tarihi, yer ve diğer detaylar için eğitmeninle mutlaka iletişime geç.</p>
    ${waLink(i.phone) ? btn(waLink(i.phone), "Eğitmene WhatsApp'tan yaz", '#D7301F') : ''}
    <p style="margin:16px 0 0;color:#5E5648;font-size:13px">Derslerini sitede Profilim sayfasından görebilirsin: ${esc(base)}/#/profil</p>` : `
    <p style="margin:0 0 12px"><b>${esc(i.full_name)}</b> ile ${esc(slot(b))} için gönderdiğin ${esc(i.instrument)} dersi talebi onaylanmadı.</p>
    <p style="margin:0 0 12px">Takvimden başka bir saat seçerek yeni talep gönderebilirsin: ${esc(base)}/#/kurslar</p>`);
}

async function notifyStudent(b, base) {
  const to = b.profiles && b.profiles.contact_email;
  if (!to || b.status === 'bekliyor') return;
  await sendMail({ to, subject: b.status === 'onaylandi' ? 'BÜMT: Ders talebin onaylandı' : 'BÜMT: Ders talebin hakkında', html: decisionMail(b, base),
    replyTo: (await instructorEmail(b)) || undefined });
}

function page(res, title, msg, ok) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
  <body style="margin:0;background:#FBF6EC;font-family:Arial,Helvetica,sans-serif;color:#141414;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px">
  <div style="max-width:460px;width:100%;background:#fff;border:2px solid #141414;border-radius:16px;box-shadow:5px 5px 0 ${ok ? '#141414' : '#D7301F'};padding:28px">
  <h1 style="margin:0 0 12px;font-size:22px">${esc(title)}</h1>${msg}</div></body></html>`);
}

async function readForm(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return Object.fromEntries(new URLSearchParams(req.body));
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if ((req.headers['content-type'] || '').includes('application/json')) return raw ? JSON.parse(raw) : {};
  return Object.fromEntries(new URLSearchParams(raw));
}

const json = (res, code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body)); };
const UUID = /^[0-9a-f-]{36}$/i;

module.exports = async (req, res) => {
  if (!SB_URL || !SECRET) return json(res, 500, { error: 'Sunucu ayarları eksik.' });
  const base = siteUrl(req);

  // E-postadaki link: önce onay sayfası gösterilir (e-posta tarayıcıları linki açınca işlem yapılmasın diye)
  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://x');
    const token = url.searchParams.get('token') || '';
    const d = url.searchParams.get('d') === 'reddet' ? 'reddet' : 'onayla';
    if (!UUID.test(token)) return page(res, 'Geçersiz link', '<p>Bu link geçersiz.</p>');
    const b = await loadBooking('token=eq.' + token);
    if (!b) return page(res, 'Talep bulunamadı', '<p>Bu talep silinmiş ya da öğrenci tarafından iptal edilmiş olabilir.</p>');
    const p = b.profiles || {};
    const info = `<p style="margin:0 0 16px"><b>${esc(p.full_name)}</b> (${esc(p.student_no)})<br>${esc(b.instructors && b.instructors.instrument)} · ${esc(slot(b))}</p>`;
    if (b.status !== 'bekliyor') return page(res, b.status === 'onaylandi' ? 'Bu talep zaten onaylanmış' : 'Bu talep zaten reddedilmiş', info, true);
    return page(res, d === 'onayla' ? 'Talebi onaylıyor musun?' : 'Talebi reddediyor musun?', info + `
      <form method="post" action="/api/lesson"><input type="hidden" name="token" value="${esc(token)}"><input type="hidden" name="d" value="${d}">
      <button type="submit" style="font:inherit;font-weight:bold;border:2px solid #141414;background:${d === 'onayla' ? '#D7301F' : '#141414'};color:#fff;padding:12px 22px;border-radius:999px;cursor:pointer">${d === 'onayla' ? 'Evet, onayla' : 'Evet, reddet'}</button></form>`, true);
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'Desteklenmeyen istek.' });
  let body;
  try { body = await readForm(req); } catch (e) { return json(res, 400, { error: 'Geçersiz istek.' }); }

  // E-postadaki onay sayfasından gelen karar
  if (body.token) {
    if (!UUID.test(body.token)) return page(res, 'Geçersiz link', '<p>Bu link geçersiz.</p>');
    const b = await loadBooking('token=eq.' + body.token);
    if (!b) return page(res, 'Talep bulunamadı', '<p>Bu talep silinmiş olabilir.</p>');
    const status = body.d === 'reddet' ? 'reddedildi' : 'onaylandi';
    const r = await sb('/rest/v1/rpc/decide_lesson_internal', { method: 'POST', body: JSON.stringify({ p_id: b.id, p_status: status }) });
    if (!r.ok) return page(res, 'İşlem yapılamadı', `<p>${esc((r.data && r.data.message) || 'Bir hata oluştu.')}</p>`);
    const fresh = await loadBooking('id=eq.' + b.id);
    if (fresh) await notifyStudent(fresh, base);
    const p = b.profiles || {};
    return page(res, status === 'onaylandi' ? 'Talep onaylandı' : 'Talep reddedildi', status === 'onaylandi'
      ? `<p style="margin:0 0 12px">${esc(slot(b))} artık takvimde dolu görünüyor.</p><p style="margin:0 0 16px">Şimdi <b>${esc(p.full_name)}</b> ile iletişime geç.</p>${waLink(p.phone) ? btn(waLink(p.phone), "WhatsApp'tan yaz", '#D7301F') : ''}`
      : '<p>Öğrenci başka bir saat seçebilir.</p>', true);
  }

  // Siteden gelen bildirim istekleri
  const caller = await getCaller(req);
  if (caller.error) return json(res, 401, { error: caller.error });
  if (!UUID.test(body.booking_id || '')) return json(res, 400, { error: 'Geçersiz talep.' });
  const b = await loadBooking('id=eq.' + body.booking_id);
  if (!b) return json(res, 404, { error: 'Talep bulunamadı.' });

  if (body.action === 'notify_request') {
    if (b.user_id !== caller.id) return json(res, 403, { error: 'Yetkisiz.' });
    if (b.notified_at || b.status !== 'bekliyor') return json(res, 200, { ok: true, already: true });
    const to = await instructorEmail(b);
    await sb('/rest/v1/lesson_bookings?id=eq.' + b.id, { method: 'PATCH', body: JSON.stringify({ notified_at: new Date().toISOString() }) });
    if (!to) return json(res, 200, { ok: true, mailed: false });
    const m = await sendMail({ to, subject: 'BÜMT: Yeni ' + ((b.instructors && b.instructors.instrument) || 'ders') + ' talebi — ' + ((b.profiles && b.profiles.full_name) || ''),
      html: requestMail(b, base), replyTo: (b.profiles && b.profiles.contact_email) || undefined });
    return json(res, 200, { ok: true, mailed: !!m.ok });
  }

  if (body.action === 'notify_decision') {
    const owner = b.instructors && b.instructors.profile_id === caller.id;
    if (!owner && !caller.can('kurslar')) return json(res, 403, { error: 'Yetkisiz.' });
    await notifyStudent(b, base);
    return json(res, 200, { ok: true });
  }

  return json(res, 400, { error: 'Bilinmeyen işlem.' });
};
