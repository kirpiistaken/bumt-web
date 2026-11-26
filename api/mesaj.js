// Site içi mesaj gönderme + (tercih açıksa) alıcıya "yeni mesajın var" e-postası.
const { SB_URL, SECRET, sb, getCaller } = require('./_auth');
const { esc, siteUrl, sendMail, mailLayout, btn, readBody, json } = require('./_mail');

const UUID = /^[0-9a-f-]{36}$/i;

const duyuru = require('./_duyuru');
module.exports = async (req, res) => {
  // /api/duyuru → (vercel.json rewrite) bu fonksiyon; Vercel ücretsiz planda 12 fonksiyon sınırı var
  const u = String(req.url || '');
  if (u.startsWith('/api/duyuru') || /[?&]_r=duyuru/.test(u)) return duyuru(req, res);
  if (req.method !== 'POST') return json(res, 405, { error: 'Sadece POST' });
  if (!SB_URL || !SECRET) return json(res, 500, { error: 'Sunucu ayarları eksik.' });
  let body;
  try { body = await readBody(req); } catch (e) { return json(res, 400, { error: 'Geçersiz istek.' }); }

  const caller = await getCaller(req);
  if (caller.error) return json(res, 401, { error: caller.error });
  const thread_id = String(body.thread_id || '');
  const notifyOnly = !!body.notify_only; // mesaj zaten dm_send ile yazıldı, sadece bildirim
  const text = String(body.body || '').trim();
  if (!UUID.test(thread_id)) return json(res, 400, { error: 'Konuşma bulunamadı.' });
  if (!notifyOnly && !text) return json(res, 400, { error: 'Boş mesaj gönderilemez.' });

  const tr = await sb('/rest/v1/dm_threads?select=id,u_lo,u_hi,context_title&id=eq.' + thread_id);
  const t = tr.ok && Array.isArray(tr.data) ? tr.data[0] : null;
  if (!t) return json(res, 404, { error: 'Konuşma bulunamadı.' });
  if (caller.id !== t.u_lo && caller.id !== t.u_hi) return json(res, 403, { error: 'Bu konuşmaya erişimin yok.' });

  const me = await sb('/rest/v1/profiles?select=status,full_name&id=eq.' + caller.id);
  const mp = me.ok && Array.isArray(me.data) ? me.data[0] : null;
  if (!mp || mp.status !== 'onaylandi') return json(res, 403, { error: 'Mesaj göndermek için üyeliğin onaylı olmalı.' });
  const other = caller.id === t.u_lo ? t.u_hi : t.u_lo;

  // Bildirim kısıtı: (az önce yazılan hariç) benden okunmamış mesaj yoksa VEYA en yenisi 10 dk'dan eskiyse bildir
  const lastUnread = await sb('/rest/v1/dm_messages?select=created_at&thread_id=eq.' + thread_id + '&sender_id=eq.' + caller.id + '&read_at=is.null&order=created_at.desc&limit=2');
  const rows = lastUnread.ok && Array.isArray(lastUnread.data) ? lastUnread.data : [];
  const lu = notifyOnly ? rows[1] : rows[0];
  const shouldNotify = !lu || (Date.now() - new Date(lu.created_at).getTime()) > 10 * 60 * 1000;

  let created = null;
  if (!notifyOnly) {
    const ins = await sb('/rest/v1/dm_messages', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ thread_id, sender_id: caller.id, body: text.slice(0, 2000) }) });
    if (!ins.ok) return json(res, 500, { error: 'Mesaj gönderilemedi.' });
    created = Array.isArray(ins.data) ? ins.data[0] : null;
    await sb('/rest/v1/dm_threads?id=eq.' + thread_id, { method: 'PATCH', body: JSON.stringify({ last_message_at: new Date().toISOString() }) });
  }

  let mail = 'throttled';
  if (shouldNotify) {
    const op = await sb('/rest/v1/profiles?select=full_name,contact_email,notify_dm&id=eq.' + other);
    const o = op.ok && Array.isArray(op.data) ? op.data[0] : null;
    if (!o || !o.contact_email) mail = 'no_email';
    else if (o.notify_dm === false) mail = 'off';
    else if (!process.env.RESEND_API_KEY) mail = 'no_key';
    else {
      const link = siteUrl(req) + '/#/mesajlar/' + thread_id;
      const r = await sendMail({
        to: o.contact_email,
        subject: 'BÜMT: ' + (mp.full_name ? mp.full_name.split(' ')[0] : 'Bir üye') + ' sana mesaj gönderdi',
        html: mailLayout('Yeni mesajın var 💬', `
          <p style="margin:0 0 12px">Merhaba ${esc(o.full_name || '')}, BÜMT sitesinde sana yeni bir mesaj geldi${t.context_title ? ' (<b>' + esc(t.context_title) + '</b>)' : ''}.</p>
          <p style="margin:0 0 16px">Okumak ve cevaplamak için:</p>
          <div style="margin:0 0 16px">${btn(link, 'Mesajı aç', '#D7301F')}</div>
          <p style="margin:0;color:#5E5648;font-size:13px">Bu bildirimleri istemiyorsan Profilim sayfasındaki "Mesaj bildirimleri" anahtarından kapatabilirsin.</p>`)
      });
      mail = r && r.ok ? 'sent' : 'error';
    }
  }
  console.log('mesaj bildirim', thread_id, mail);
  return json(res, 200, { ok: true, created_at: created && created.created_at, mail });
};
