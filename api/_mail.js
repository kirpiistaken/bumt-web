// Ortak: e-posta gönderme ve basit HTML sayfa şablonları.
const RESEND = (process.env.RESEND_API_KEY || '').trim();
const MAIL_FROM = process.env.MAIL_FROM || 'BÜMT <bildirim@bumt.com.tr>';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const waLink = (phone, text) => {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 10 && d.startsWith('5')) d = '90' + d;
  return d ? 'https://wa.me/' + d + (text ? '?text=' + encodeURIComponent(text) : '') : '';
};
const siteUrl = (req) => (process.env.SITE_URL || ('https://' + (req.headers['x-forwarded-host'] || req.headers.host))).replace(/\/$/, '');

async function sendMail({ to, subject, html, replyTo }) {
  if (!RESEND || !to) return { ok: false, skipped: true };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) })
  });
  if (!r.ok) console.error('Resend hata', r.status, await r.text());
  return { ok: r.ok };
}

function mailLayout(title, inner) {
  return `<!doctype html><html lang="tr"><body style="margin:0;background:#FBF6EC;font-family:Arial,Helvetica,sans-serif;color:#141414">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#141414;color:#F4EAD5;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:bold;letter-spacing:.04em">BÜMT · Başkent Üniversitesi Müzik Topluluğu</div>
    <div style="background:#fff;border:2px solid #141414;border-top:0;border-radius:0 0 12px 12px;padding:24px">
      <h1 style="margin:0 0 16px;font-size:22px">${esc(title)}</h1>${inner}
    </div>
  </div></body></html>`;
}
const row = (k, v) => v ? `<tr><td style="padding:6px 12px 6px 0;color:#5E5648;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-weight:bold">${v}</td></tr>` : '';
const btn = (href, label, bg) => `<a href="${esc(href)}" style="display:inline-block;background:${bg};color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px;margin:4px 8px 4px 0">${esc(label)}</a>`;

function page(res, title, msg, ok) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
  <body style="margin:0;background:#FBF6EC;font-family:Arial,Helvetica,sans-serif;color:#141414;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px">
  <div style="max-width:460px;width:100%;background:#fff;border:2px solid #141414;border-radius:16px;box-shadow:5px 5px 0 ${ok ? '#141414' : '#D7301F'};padding:28px">
  <h1 style="margin:0 0 12px;font-size:22px">${esc(title)}</h1>${msg}</div></body></html>`);
}
function confirmForm(action, token, d, label, bg) {
  return `<form method="post" action="${esc(action)}"><input type="hidden" name="token" value="${esc(token)}"><input type="hidden" name="d" value="${esc(d)}">
  <button type="submit" style="font:inherit;font-weight:bold;border:2px solid #141414;background:${bg};color:#fff;padding:12px 22px;border-radius:999px;cursor:pointer">${esc(label)}</button></form>`;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { return Object.fromEntries(new URLSearchParams(req.body)); }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if ((req.headers['content-type'] || '').includes('application/json')) return raw ? JSON.parse(raw) : {};
  return Object.fromEntries(new URLSearchParams(raw));
}
const json = (res, code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body)); };

module.exports = { esc, waLink, siteUrl, sendMail, mailLayout, row, btn, page, confirmForm, readBody, json };
