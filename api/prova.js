// Prova odası talepleri: yetkililere e-posta, onay linkleri, üyeye sonuç e-postası.
const { SB_URL, SECRET, sb, getCaller } = require('./_auth');
const { esc, waLink, siteUrl, sendMail, mailLayout, row, btn, page, confirmForm, readBody, json } = require('./_mail');

const UUID = /^[0-9a-f-]{36}$/i;
const hhmm = (t) => String(t || '').slice(0, 5);
const fmtDay = (d) => { const [y, m, g] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, g)).toLocaleDateString('tr-TR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }); };
const when = (b) => fmtDay(b.day) + ', ' + hhmm(b.prova_slots && b.prova_slots.start_time) + '–' + hhmm(b.prova_slots && b.prova_slots.end_time);

async function loadBooking(filter) {
  const r = await sb('/rest/v1/prova_bookings?select=id,slot_id,day,user_id,status,token,note,notified_at,prova_slots(start_time,end_time),' +
    'profiles(full_name,student_no,phone,contact_email,department,class_year,member_type,instruments)&' + filter);
  return r.ok && Array.isArray(r.data) ? r.data[0] : null;
}

async function recipients() {
  const r = await sb('/rest/v1/profiles?select=full_name,contact_email,is_super,notify_mail,roles(permissions)&contact_email=neq.');
  if (!r.ok || !Array.isArray(r.data)) return [];
  return r.data.filter((p) => p.contact_email && p.notify_mail !== false &&
    (p.is_super || (p.roles && (p.roles.permissions || []).includes('prova'))));
}

function requestMail(b, base, name) {
  const p = b.profiles || {};
  const wa = waLink(p.phone, 'Merhaba ' + (p.full_name || '') + ', BÜMT prova odası talebin hakkında yazıyorum.');
  const link = (d) => base + '/api/prova?token=' + b.token + '&d=' + d;
  const music = p.member_type === 'muzisyen' ? 'Müzisyen' + ((p.instruments || []).length ? ' · ' + p.instruments.join(', ') : '') : 'Dinleyici';
  return mailLayout('Yeni prova odası talebi', `
    <p style="margin:0 0 16px">Merhaba${name ? ' ' + esc(name) : ''}, prova odası için yeni bir talep geldi.</p>
    <table style="border-collapse:collapse;margin-bottom:16px">
      ${row('Tarih ve saat', esc(when(b)))}
      ${row('Üye', esc(p.full_name))}
      ${row('Öğrenci no', esc(p.student_no))}
      ${row('Telefon', esc(p.phone))}
      ${row('E-posta', esc(p.contact_email))}
      ${row('Bölüm', esc([p.department, p.class_year].filter(Boolean).join(' · ')))}
      ${row('Profil', esc(music))}
      ${row('Not', esc(b.note))}
    </table>
    ${wa ? `<div style="margin:0 0 12px">${btn(wa, "Üyeye WhatsApp'tan yaz", '#1F8A4C')}</div>` : ''}
    <p style="margin:0 0 8px">Onaylarsan bu saat dolu görünür ve aynı saate gelen diğer talepler reddedilir.</p>
    <div style="margin:12px 0 16px">${btn(link('onayla'), 'Talebi onayla', '#D7301F')}${btn(link('reddet'), 'Reddet', '#141414')}</div>
    <p style="margin:16px 0 0;color:#5E5648;font-size:13px">Tüm talepler yönetim panelinde: ${esc(base)}/yonetim/#/prova</p>`);
}

function decisionMail(b, base) {
  const ok = b.status === 'onaylandi';
  return mailLayout(ok ? 'Prova odası rezervasyonun onaylandı' : 'Prova odası talebin onaylanmadı', ok
    ? `<p style="margin:0 0 12px">Prova odası rezervasyonun onaylandı: <b>${esc(when(b))}</b>.</p><p style="margin:0 0 12px">İyi provalar! Gelemeyeceksen sitede Profilim sayfasından iptal et ki başkası kullanabilsin: ${esc(base)}/#/profil</p>`
    : `<p style="margin:0 0 12px">${esc(when(b))} için prova odası talebin onaylanmadı.</p><p style="margin:0 0 12px">Başka bir saat için yeni talep gönderebilirsin: ${esc(base)}/#/prova</p>`);
}

async function notifyMember(b, base) {
  const to = b.profiles && b.profiles.contact_email;
  if (!to || b.status === 'bekliyor') return;
  await sendMail({ to, subject: b.status === 'onaylandi' ? 'BÜMT: Prova odası rezervasyonun onaylandı' : 'BÜMT: Prova odası talebin hakkında', html: decisionMail(b, base) });
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
    if (!b) return page(res, 'Talep bulunamadı', '<p>Bu talep silinmiş ya da üye tarafından iptal edilmiş olabilir.</p>');
    const p = b.profiles || {};
    const info = `<p style="margin:0 0 16px"><b>${esc(p.full_name)}</b> (${esc(p.student_no)})<br>${esc(when(b))}${b.note ? '<br>Not: ' + esc(b.note) : ''}</p>`;
    if (b.status !== 'bekliyor') return page(res, b.status === 'onaylandi' ? 'Bu talep zaten onaylanmış' : 'Bu talep zaten reddedilmiş', info, true);
    return page(res, d === 'onayla' ? 'Talebi onaylıyor musun?' : 'Talebi reddediyor musun?',
      info + confirmForm('/api/prova', token, d, d === 'onayla' ? 'Evet, onayla' : 'Evet, reddet', d === 'onayla' ? '#D7301F' : '#141414'), true);
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'Desteklenmeyen istek.' });
  let body;
  try { body = await readBody(req); } catch (e) { return json(res, 400, { error: 'Geçersiz istek.' }); }

  if (body.token) {
    if (!UUID.test(body.token)) return page(res, 'Geçersiz link', '<p>Bu link geçersiz.</p>');
    const b = await loadBooking('token=eq.' + body.token);
    if (!b) return page(res, 'Talep bulunamadı', '<p>Bu talep silinmiş olabilir.</p>');
    const status = body.d === 'reddet' ? 'reddedildi' : 'onaylandi';
    const r = await sb('/rest/v1/rpc/decide_prova_internal', { method: 'POST', body: JSON.stringify({ p_id: b.id, p_status: status }) });
    if (!r.ok) return page(res, 'İşlem yapılamadı', `<p>${esc((r.data && r.data.message) || 'Bir hata oluştu.')}</p>`);
    const fresh = await loadBooking('id=eq.' + b.id);
    if (fresh) await notifyMember(fresh, base);
    const p = b.profiles || {};
    const wa = waLink(p.phone);
    return page(res, status === 'onaylandi' ? 'Rezervasyon onaylandı' : 'Talep reddedildi', status === 'onaylandi'
      ? `<p style="margin:0 0 12px">${esc(when(b))} artık ${esc(p.full_name)} adına ayrıldı.</p>${wa ? btn(wa, "Üyeye WhatsApp'tan yaz", '#1F8A4C') : ''}`
      : `<p style="margin:0 0 12px">Üye başka bir saat için yeni talep gönderebilir.</p>${wa ? btn(wa, "Üyeye WhatsApp'tan yaz", '#1F8A4C') : ''}`, true);
  }

  const caller = await getCaller(req);
  if (caller.error) return json(res, 401, { error: caller.error });
  if (!UUID.test(body.booking_id || '')) return json(res, 400, { error: 'Geçersiz talep.' });
  const b = await loadBooking('id=eq.' + body.booking_id);
  if (!b) return json(res, 404, { error: 'Talep bulunamadı.' });

  if (body.action === 'notify_request') {
    if (b.user_id !== caller.id) return json(res, 403, { error: 'Yetkisiz.' });
    if (b.notified_at || b.status !== 'bekliyor') return json(res, 200, { ok: true, already: true });
    await sb('/rest/v1/prova_bookings?id=eq.' + b.id, { method: 'PATCH', body: JSON.stringify({ notified_at: new Date().toISOString() }) });
    const list = await recipients();
    let sent = 0;
    for (const r of list) {
      const m = await sendMail({ to: r.contact_email, subject: 'BÜMT: Prova odası talebi — ' + ((b.profiles && b.profiles.full_name) || '') + ', ' + when(b),
        html: requestMail(b, base, r.full_name), replyTo: (b.profiles && b.profiles.contact_email) || undefined });
      if (m.ok) sent++;
    }
    return json(res, 200, { ok: true, recipients: list.length, sent });
  }

  if (body.action === 'notify_decision') {
    if (!caller.can('prova')) return json(res, 403, { error: 'Yetkisiz.' });
    await notifyMember(b, base);
    return json(res, 200, { ok: true });
  }

  return json(res, 400, { error: 'Bilinmeyen işlem.' });
};
