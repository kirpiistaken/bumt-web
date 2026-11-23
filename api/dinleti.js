// Dinleti başvuruları: yetkililere e-posta, onay linkleri, üyeye sonuç e-postası.
const { SB_URL, SECRET, sb, getCaller } = require('./_auth');
const { esc, waLink, siteUrl, sendMail, mailLayout, row, btn, page, confirmForm, readBody, json } = require('./_mail');

const UUID = /^[0-9a-f-]{36}$/i;
const hhmm = (t) => String(t || '').slice(0, 5);
const addMin = (t, m) => { const [h, mm] = hhmm(t).split(':').map(Number); const x = h * 60 + mm + m; return String(Math.floor(x / 60) % 24).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); };
const fmtDay = (d) => { const [y, m, g] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, g)).toLocaleDateString('tr-TR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }); };
const when = (b) => { const d = b.dinletiler || {}; const st = addMin(d.start_time, b.slot_index * (d.slot_minutes || 0)); return fmtDay(d.day) + ', ' + st + '–' + addMin(st, d.slot_minutes || 0); };
const nl = (s) => esc(s).replace(/\n/g, '<br>');

async function loadBooking(filter) {
  const r = await sb('/rest/v1/dinleti_bookings?select=id,dinleti_id,slot_index,user_id,status,token,notified_at,perf_type,performer,display_name,people_count,members,repertoire,equipment,video_url,note,' +
    'dinletiler(title,day,start_time,slot_minutes,venue),profiles(full_name,student_no,phone,contact_email,department,class_year,instruments)&' + filter);
  return r.ok && Array.isArray(r.data) ? r.data[0] : null;
}

async function recipients() {
  const r = await sb('/rest/v1/profiles?select=full_name,contact_email,is_super,notify_mail,roles(permissions)&contact_email=neq.');
  if (!r.ok || !Array.isArray(r.data)) return [];
  return r.data.filter((p) => p.contact_email && p.notify_mail !== false &&
    (p.is_super || (p.roles && (p.roles.permissions || []).includes('dinletiler'))));
}

function requestMail(b, base, name) {
  const p = b.profiles || {};
  const wa = waLink(p.phone, 'Merhaba ' + (p.full_name || '') + ', BÜMT dinleti başvurun hakkında yazıyorum.');
  const link = (d) => base + '/api/dinleti?token=' + b.token + '&d=' + d;
  return mailLayout('Yeni dinleti başvurusu', `
    <p style="margin:0 0 16px">Merhaba${name ? ' ' + esc(name) : ''}, ${esc((b.dinletiler && b.dinletiler.title) || 'dinleti')} için yeni bir başvuru geldi.</p>
    <table style="border-collapse:collapse;margin-bottom:16px">
      ${row('Tarih ve saat', esc(when(b)))}
      ${row('Sahne adı', esc(b.display_name))}
      ${row('Tür', esc(b.perf_type) + (b.people_count > 1 ? ' · ' + b.people_count + ' kişi' : ''))}
      ${row('Ekip', nl(b.members))}
      ${row('Parçalar', nl(b.repertoire))}
      ${row('Video / kayıt', b.video_url ? `<a href="${esc(b.video_url)}" style="color:#B3261A">${esc(b.video_url)}</a>` : '')}
      ${row('Getirecekleri ekipman', esc((b.equipment || []).join(', ')))}
      ${row('Not', nl(b.note))}
      ${row('Başvuran', esc(p.full_name) + ' (' + esc(p.student_no) + ')')}
      ${row('Telefon', esc(p.phone))}
      ${row('E-posta', esc(p.contact_email))}
      ${row('Bölüm', esc([p.department, p.class_year].filter(Boolean).join(' · ')))}
    </table>
    ${wa ? `<div style="margin:0 0 12px">${btn(wa, "Başvurana WhatsApp'tan yaz", '#1F8A4C')}</div>` : ''}
    <p style="margin:0 0 8px">Gerekirse önce konuşup video isteyin; uygunsa onaylayın. Onaylanınca bu saat dolu görünür ve aynı saate gelen diğer başvurular reddedilir.</p>
    <div style="margin:12px 0 16px">${btn(link('onayla'), 'Başvuruyu onayla', '#D7301F')}${btn(link('reddet'), 'Reddet', '#141414')}</div>
    <p style="margin:16px 0 0;color:#5E5648;font-size:13px">Tüm başvurular yönetim panelinde: ${esc(base)}/yonetim/#/dinletiler</p>`);
}

function decisionMail(b, base) {
  const ok = b.status === 'onaylandi';
  return mailLayout(ok ? 'Dinleti başvurun onaylandı' : 'Dinleti başvurun hakkında', ok
    ? `<p style="margin:0 0 12px">Dinleti başvurun onaylandı: <b>${esc(when(b))}</b>${b.dinletiler && b.dinletiler.venue ? ' · ' + esc(b.dinletiler.venue) : ''}.</p><p style="margin:0 0 12px">Sahnede görüşmek üzere! Katılamayacaksan Profilim sayfasından iptal et: ${esc(base)}/#/profil</p>`
    : `<p style="margin:0 0 12px">${esc(when(b))} için dinleti başvurun bu sefer onaylanmadı.</p><p style="margin:0 0 12px">Başka bir dinleti ya da saat için tekrar başvurabilirsin: ${esc(base)}/#/dinletiler</p>`);
}

async function notifyMember(b, base) {
  const to = b.profiles && b.profiles.contact_email;
  if (!to || b.status === 'bekliyor') return;
  await sendMail({ to, subject: b.status === 'onaylandi' ? 'BÜMT: Dinleti başvurun onaylandı' : 'BÜMT: Dinleti başvurun hakkında', html: decisionMail(b, base) });
}

module.exports = async (req, res) => {
  if (!SB_URL || !SECRET) return json(res, 500, { error: 'Sunucu ayarları eksik.' });
  const base = siteUrl(req);

  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://x');
    const token = url.searchParams.get('token') || '';
    const d = url.searchParams.get('d') === 'reddet' ? 'reddet' : 'onayla';
    if (!UUID.test(token)) return page(res, 'Geçersiz link', '<p>Bu link geçersiz.</p>');
    const b = await loadBooking('token=eq.' + token);
    if (!b) return page(res, 'Başvuru bulunamadı', '<p>Bu başvuru silinmiş ya da geri çekilmiş olabilir.</p>');
    const info = `<p style="margin:0 0 16px"><b>${esc(b.display_name)}</b> · ${esc(b.perf_type)}<br>${esc(when(b))}</p>`;
    if (b.status !== 'bekliyor') return page(res, b.status === 'onaylandi' ? 'Bu başvuru zaten onaylanmış' : 'Bu başvuru zaten reddedilmiş', info, true);
    return page(res, d === 'onayla' ? 'Başvuruyu onaylıyor musun?' : 'Başvuruyu reddediyor musun?',
      info + confirmForm('/api/dinleti', token, d, d === 'onayla' ? 'Evet, onayla' : 'Evet, reddet', d === 'onayla' ? '#D7301F' : '#141414'), true);
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'Desteklenmeyen istek.' });
  let body;
  try { body = await readBody(req); } catch (e) { return json(res, 400, { error: 'Geçersiz istek.' }); }

  if (body.token) {
    if (!UUID.test(body.token)) return page(res, 'Geçersiz link', '<p>Bu link geçersiz.</p>');
    const b = await loadBooking('token=eq.' + body.token);
    if (!b) return page(res, 'Başvuru bulunamadı', '<p>Bu başvuru silinmiş olabilir.</p>');
    const status = body.d === 'reddet' ? 'reddedildi' : 'onaylandi';
    const r = await sb('/rest/v1/rpc/decide_dinleti_internal', { method: 'POST', body: JSON.stringify({ p_id: b.id, p_status: status }) });
    if (!r.ok) return page(res, 'İşlem yapılamadı', `<p>${esc((r.data && r.data.message) || 'Bir hata oluştu.')}</p>`);
    const fresh = await loadBooking('id=eq.' + b.id);
    if (fresh) await notifyMember(fresh, base);
    const wa = waLink(b.profiles && b.profiles.phone);
    return page(res, status === 'onaylandi' ? 'Başvuru onaylandı' : 'Başvuru reddedildi',
      `<p style="margin:0 0 12px">${status === 'onaylandi' ? esc(when(b)) + ' artık ' + esc(b.display_name) + ' için ayrıldı.' : 'Başvuran başka bir saat için tekrar başvurabilir.'}</p>${wa ? btn(wa, "Başvurana WhatsApp'tan yaz", '#1F8A4C') : ''}`, true);
  }

  const caller = await getCaller(req);
  if (caller.error) return json(res, 401, { error: caller.error });
  if (!UUID.test(body.booking_id || '')) return json(res, 400, { error: 'Geçersiz başvuru.' });
  const b = await loadBooking('id=eq.' + body.booking_id);
  if (!b) return json(res, 404, { error: 'Başvuru bulunamadı.' });

  if (body.action === 'notify_request') {
    if (b.user_id !== caller.id) return json(res, 403, { error: 'Yetkisiz.' });
    if (b.notified_at || b.status !== 'bekliyor') return json(res, 200, { ok: true, already: true });
    await sb('/rest/v1/dinleti_bookings?id=eq.' + b.id, { method: 'PATCH', body: JSON.stringify({ notified_at: new Date().toISOString() }) });
    const list = await recipients();
    let sent = 0;
    for (const r of list) {
      const m = await sendMail({ to: r.contact_email, subject: 'BÜMT: Dinleti başvurusu — ' + b.display_name + ' (' + b.perf_type + ')',
        html: requestMail(b, base, r.full_name), replyTo: (b.profiles && b.profiles.contact_email) || undefined });
      if (m.ok) sent++;
    }
    return json(res, 200, { ok: true, recipients: list.length, sent });
  }

  if (body.action === 'notify_decision') {
    if (!caller.can('dinletiler')) return json(res, 403, { error: 'Yetkisiz.' });
    await notifyMember(b, base);
    return json(res, 200, { ok: true });
  }

  return json(res, 400, { error: 'Bilinmeyen işlem.' });
};
