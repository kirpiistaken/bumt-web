// Ortak yardımcılar: Supabase bağlantısı, tarih işlemleri, ortak bileşenler.
import { html, render, useState, useEffect, useMemo, useRef, useCallback } from 'https://unpkg.com/htm@3.1.1/preact/standalone.module.js';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export { html, render, useState, useEffect, useMemo, useRef, useCallback };

export let sb = null;

export async function initSupabase() {
  const r = await fetch('/api/config');
  const c = await r.json();
  if (!r.ok) throw new Error(c.error || 'Ayarlar okunamadı');
  sb = createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true } });
  return sb;
}

// ---- Hesaplar -------------------------------------------------------
export const memberEmail = (no) => String(no || '').trim().replace(/\s+/g, '').toLowerCase() + '@uye.bumt.com.tr';
export const staffEmail = (u) => {
  const v = String(u || '').replace(/İ/g, 'i').replace(/\s+/g, '').toLowerCase().replace(/\u0307/g, '');
  if (v.includes('@')) return v;
  if (/^[0-9]+$/.test(v)) return memberEmail(v); // öğrenci numarasıyla yönetim girişi
  return v + '@yonetim.bumt.com.tr';
};

export const PERMS = [
  ['uyeler', 'Üyeler'],
  ['roller', 'Roller ve yetkililer'],
  ['prova', 'Prova odası'],
  ['kurslar', 'Enstrüman kursları'],
  ['dinletiler', 'Dinletiler'],
  ['etkinlikler', 'Etkinlikler ve afişler'],
  ['formlar', 'Formlar ve başvurular']
];

export const INSTRUMENTS = ['Gitar', 'Elektro Gitar', 'Bas Gitar', 'Davul', 'Piyano / Klavye', 'Keman', 'Viyola', 'Çello', 'Vokal', 'Yan Flüt', 'Saksafon', 'Bağlama', 'Ukulele', 'Diğer'];
export const KINDS = ['Hoca', 'Ders veren öğrenci', 'Gönüllü öğrenci'];
export const CLASS_YEARS = ['Hazırlık', '1. sınıf', '2. sınıf', '3. sınıf', '4. sınıf', '5. sınıf', '6. sınıf', 'Yüksek lisans', 'Doktora', 'Mezun', 'Akademisyen / Personel'];

export const PROFILE_COLS = 'id,student_no,username,full_name,department,class_year,member_type,instruments,status,is_staff,is_super,role_id,kvkk_at,created_at,notify_mail,avatar_url,bio';
export const INSTRUCTOR_COLS = 'id,profile_id,full_name,instrument,kind,department,class_year,bio,active,created_at,avatar_url';

// Giriş yapan kişinin profili, yetkileri ve (varsa) eğitmen kaydı
export async function loadMe() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const uid = session.user.id;
  const [{ data: profile }, { data: priv }, { data: access }, { data: instructor }] = await Promise.all([
    sb.from('profiles').select(PROFILE_COLS + ', roles(name, permissions)').eq('id', uid).maybeSingle(),
    sb.rpc('my_private'),
    sb.rpc('my_access'),
    sb.from('instructors').select(INSTRUCTOR_COLS).eq('profile_id', uid).maybeSingle()
  ]);
  if (!profile) return { session, user: session.user, profile: null, perms: [], can: () => false, instructor: null };
  const pv = priv || {};
  profile.phone = pv.phone || '';
  profile.contact_email = pv.contact_email || '';
  if (instructor) { instructor.phone = pv.instructor_phone || ''; instructor.email = pv.instructor_email || ''; }
  // 011_guvenlik.sql henüz çalıştırılmadıysa eski davranış
  const acc = access || { is_super: !!profile.is_super, perms: (profile.roles && profile.roles.permissions) || [], mfa_ok: true };
  const perms = acc.perms || [];
  const isSuper = !!acc.is_super;
  // Yetkisi olan ama iki adımlı doğrulama kodunu girmemiş hesap
  const needsMfa = acc.mfa_ok === false && (profile.is_super || !!profile.role_id);
  return {
    session, user: session.user, profile, perms, instructor: instructor || null,
    isSuper, needsMfa,
    isAdmin: isSuper || perms.length > 0 || needsMfa,
    can: (k) => isSuper || perms.includes(k)
  };
}

// Yetkilinin bir talep sahibine numarayı görmeden WhatsApp'tan yazması (erişim kayda geçer)
export async function requestWhatsApp(kind, id, text) {
  let w = null;
  try { w = window.open('', '_blank'); } catch (e) { w = null; }
  const { data: ph, error } = await sb.rpc('request_contact', { p_kind: kind, p_id: id });
  if (error || !ph) { if (w) w.close(); return toast(error ? errMsg(error) : 'Bu kişi telefon numarası eklememiş.', 'err'); }
  const url = waLink(ph, text);
  if (w) w.location.href = url; else location.href = url;
}

export async function adminApi(action, body) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session ? session.access_token : '') },
    body: JSON.stringify({ action, ...body })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'İşlem başarısız');
  return d;
}

// Talep e-postaları (hata olsa bile akışı bozmaz)
export const notifyLesson = (action, booking_id) => notifyApi('/api/lesson', action, booking_id);
export const notifyProva = (action, booking_id) => notifyApi('/api/prova', action, booking_id);
export const notifyDinleti = (action, booking_id) => notifyApi('/api/dinleti', action, booking_id);
async function notifyApi(path, action, booking_id) {
  try {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session ? session.access_token : '') },
      body: JSON.stringify({ action, booking_id })
    });
    return await r.json().catch(() => ({}));
  } catch (e) { return {}; }
}

// ---- Hata mesajları -------------------------------------------------
export function errMsg(e) {
  if (!e) return 'Bir hata oluştu.';
  const m = String(e.message || e.error_description || e);
  if (e.code === '23505') return 'Bu yer az önce doldu. Sayfayı yenileyip tekrar dene.';
  if (e.code === '23503') return 'Bu saat artık müsait değil. Sayfayı yenileyip tekrar dene.';
  if (/Invalid login credentials/i.test(m)) return 'Bilgiler hatalı. Numaranı / kullanıcı adını ve şifreni kontrol et.';
  if (/already registered|already been registered/i.test(m)) return 'Bu öğrenci numarasıyla zaten bir hesap var. Giriş yapmayı dene.';
  if (/Password should be at least|weak/i.test(m)) return 'Şifre en az 6 karakter olmalı.';
  if (/rate limit/i.test(m)) return 'Çok fazla deneme yapıldı, birkaç dakika sonra tekrar dene.';
  if (/row-level security|permission denied/i.test(m)) return 'Bu işlem için yetkin yok.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Bağlantı hatası. İnternetini kontrol et.';
  return m;
}

// ---- Tarih (her şey İstanbul saatine göre, 'YYYY-MM-DD' metinleriyle) ----
export function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
const toUTC = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fromUTC = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => { const d = toUTC(s); d.setUTCDate(d.getUTCDate() + n); return fromUTC(d); };
export const isoDow = (s) => { const g = toUTC(s).getUTCDay(); return g === 0 ? 7 : g; }; // 1 = Pazartesi
export const fmtLong = (s) => s ? toUTC(s).toLocaleDateString('tr-TR', { timeZone: 'UTC', day: 'numeric', month: 'long', weekday: 'long' }) : '';
export const fmtShort = (s) => s ? toUTC(s).toLocaleDateString('tr-TR', { timeZone: 'UTC', day: 'numeric', month: 'long' }) : '';
export const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
export const hhmm = (t) => String(t || '').slice(0, 5);
export function addMinutes(t, mins) {
  const [h, m] = hhmm(t).split(':').map(Number);
  const x = h * 60 + m + mins;
  return String(Math.floor(x / 60) % 24).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0');
}
// Bu haftanın ve sonraki haftaların cumaları
export function nextFridays(count) {
  const t = todayStr();
  const dow = isoDow(t);
  let fri = addDays(t, 5 - dow);
  if (dow > 5) fri = addDays(fri, 7);
  return Array.from({ length: count }, (_, i) => addDays(fri, 7 * i));
}

export const DAY_NAMES = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
export const DAY_SHORT = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export const GRID_DAYS = [1, 2, 3, 4, 5, 6];
export const GRID_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

export function waLink(phone, text) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '9' + d;
  else if (d.length === 10 && d.startsWith('5')) d = '90' + d;
  return 'https://wa.me/' + d + (text ? '?text=' + encodeURIComponent(text) : '');
}

export function downloadCSV(filename, rows) {
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const csv = '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---- Bildirim ------------------------------------------------------
let toastSetter = null;
let toastTimer = null;
export function toast(msg, kind) {
  if (!toastSetter) return;
  toastSetter({ msg, kind: kind || 'ok' });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastSetter && toastSetter(null), 3500);
}
export function Toaster() {
  const [t, setT] = useState(null);
  useEffect(() => { toastSetter = setT; return () => { toastSetter = null; }; }, []);
  if (!t) return null;
  return html`<div class=${'toast ' + (t.kind === 'err' ? 'toast-err' : '')} role="status">${t.msg}</div>`;
}

// ---- Haftalık müsaitlik takvimi (eğitmen paneli ve yönetim) ----------
// slots: Set('gün-saat'), bookings: { 'gün-saat': isim }
export function AvailabilityGrid({ slots, bookings, pending, onToggle, onBooked, busy }) {
  pending = pending || {};
  return html`
    <div class="grid-scroll">
      <div class="cal" style=${'grid-template-columns: 56px repeat(' + GRID_DAYS.length + ', minmax(0, 1fr))'}>
        <span></span>
        ${GRID_DAYS.map((d) => html`<span class="cal-head">${DAY_SHORT[d]}</span>`)}
        ${GRID_HOURS.map((h) => html`
          <span class="cal-hour">${h}:00</span>
          ${GRID_DAYS.map((d) => {
            const key = d + '-' + h;
            const name = bookings[key];
            const on = slots.has(key);
            if (name) {
              return html`<button type="button" class="cell cell-booked" disabled=${busy}
                aria-label=${DAY_NAMES[d] + ' ' + h + ':00, ' + name + ' ile ders'}
                onClick=${() => onBooked && onBooked(d, h, name)}>${name}</button>`;
            }
            return html`<button type="button" class=${'cell ' + (on ? 'cell-on' : 'cell-off')} disabled=${busy}
              aria-pressed=${on} aria-label=${DAY_NAMES[d] + ' ' + h + ':00, ' + (on ? 'müsait' : 'kapalı')}
              onClick=${() => onToggle(d, h, on)}>${on ? (pending[key] ? 'Müsait · ' + pending[key] + ' talep' : 'Müsait') : ''}</button>`;
          })}
        `)}
      </div>
    </div>`;
}

// Bir eğitmenin müsaitliğini ve ders taleplerini yöneten hazır bileşen
export function InstructorScheduleEditor({ instructor }) {
  const [slots, setSlots] = useState(new Set());
  const [reqs, setReqs] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: s }, { data: r, error }] = await Promise.all([
      sb.from('instructor_slots').select('weekday,hour').eq('instructor_id', instructor.id),
      sb.rpc('lesson_requests', { p_instructor: instructor.id })
    ]);
    if (error) toast(errMsg(error), 'err');
    setSlots(new Set((s || []).map((x) => x.weekday + '-' + x.hour)));
    setReqs(r || []);
  }, [instructor.id]);
  useEffect(() => { load(); }, [load]);

  const approved = reqs.filter((r) => r.status === 'onaylandi');
  const waiting = reqs.filter((r) => r.status === 'bekliyor');
  const bookings = {};
  approved.forEach((r) => { bookings[r.weekday + '-' + r.hour] = shortName(r.full_name); });
  const pending = {};
  waiting.forEach((r) => { const k = r.weekday + '-' + r.hour; pending[k] = (pending[k] || 0) + 1; });

  const toggle = async (d, h, on) => {
    const k = d + '-' + h;
    if (on && pending[k] && !confirm('Bu saatte bekleyen ' + pending[k] + ' talep var. Saati kapatırsan talepler de silinir. Devam edilsin mi?')) return;
    setBusy(true);
    const q = on
      ? sb.from('instructor_slots').delete().match({ instructor_id: instructor.id, weekday: d, hour: h })
      : sb.from('instructor_slots').insert({ instructor_id: instructor.id, weekday: d, hour: h });
    const { error } = await q;
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    load();
  };
  const decide = async (r, status) => {
    if (status === 'reddedildi' && !confirm(r.full_name + ' adlı öğrencinin talebi reddedilsin mi?')) return;
    setBusy(true);
    const { error } = await sb.rpc('decide_lesson', { p_id: r.id, p_status: status });
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    notifyLesson('notify_decision', r.id);
    toast(status === 'onaylandi' ? 'Onaylandı. Şimdi ' + r.full_name + ' ile iletişime geç.' : 'Talep reddedildi.');
    load();
  };
  const cancel = async (r) => {
    if (!confirm(r.full_name + ' ile ' + DAY_NAMES[r.weekday] + ' ' + r.hour + ':00 dersi iptal edilsin mi?')) return;
    const { error } = await sb.from('lesson_bookings').delete().eq('id', r.id);
    if (error) return toast(errMsg(error), 'err');
    toast('Ders iptal edildi, saat tekrar müsait.');
    load();
  };
  const onBooked = (d, h) => { const r = approved.find((x) => x.weekday === d && x.hour === h); if (r) cancel(r); };
  const when = (r) => DAY_NAMES[r.weekday] + ' ' + r.hour + ':00';
  const contact = (r) => html`
    <span class="req-contact">
      <span class="mono">${r.student_no}</span>
      ${r.phone ? html` · <a href=${'tel:' + r.phone}>${r.phone}</a>` : null}
      · <button type="button" class="link-btn" onClick=${() => requestWhatsApp('ders', r.id, 'Merhaba ' + r.full_name + ', BÜMT ders talebin hakkında yazıyorum.')}>WhatsApp'tan yaz</button>
      ${r.contact_email ? html` · <a href=${'mailto:' + r.contact_email}>${r.contact_email}</a>` : null}
    </span>`;

  return html`
    <div class="stack">
      <div class="req-box">
        <b>Bekleyen talepler (${waiting.length})</b>
        ${waiting.length === 0 ? html`<p class="muted small">Bekleyen talep yok.</p>` : html`
          <ul class="req-list">
            ${waiting.map((r) => html`
              <li>
                <div class="stack-xs"><span><b>${r.full_name}</b> · ${when(r)}</span>${contact(r)}</div>
                <div class="req-actions">
                  <button type="button" class="btn btn-sm btn-red" disabled=${busy} onClick=${() => decide(r, 'onaylandi')}>Onayla</button>
                  <button type="button" class="btn btn-sm btn-ghost" disabled=${busy} onClick=${() => decide(r, 'reddedildi')}>Reddet</button>
                </div>
              </li>`)}
          </ul>`}
      </div>
      ${approved.length ? html`
        <div class="req-box">
          <b>Onaylı dersler (${approved.length})</b>
          <ul class="req-list">
            ${approved.map((r) => html`
              <li>
                <div class="stack-xs"><span><b>${r.full_name}</b> · her ${when(r)}</span>${contact(r)}</div>
                <div class="req-actions"><button type="button" class="btn btn-sm btn-ghost" onClick=${() => cancel(r)}>Dersi iptal et</button></div>
              </li>`)}
          </ul>
        </div>` : null}
      <p class="muted small">Ders verebileceğin saatlere tıkla, tekrar tıklarsan kapanır. Bir talebi onayladığında o saat sitede dolu görünür ve aynı saate gelen diğer talepler reddedilir.</p>
      <${AvailabilityGrid} slots=${slots} bookings=${bookings} pending=${pending} onToggle=${toggle} onBooked=${onBooked} busy=${busy} />
      <div class="legend">
        <span><i class="sw sw-on"></i>Müsait</span>
        <span><i class="sw sw-booked"></i>Onaylı ders</span>
        <span><i class="sw sw-off"></i>Kapalı</span>
      </div>
    </div>`;
}

function shortName(n) {
  const parts = String(n || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || 'Öğrenci';
  return parts[0] + ' ' + parts[parts.length - 1][0] + '.';
}

// ---- QR okuyucu (telefon kamerası) -----------------------------------
export const yoklamaCode = (text) => { const m = String(text || '').match(/#\/yoklama\/([A-Za-z0-9]+)/); return m ? m[1] : null; };
export const timeTR = (iso) => iso ? new Date(iso).toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }) : '';

export function QrScanner({ onResult, onClose }) {
  const videoRef = useRef(null);
  const [err, setErr] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let stream = null, stopped = false, timer = null, detector = null, jsQR = null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    (async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setErr('Bu tarayıcı kamerayı açamıyor. QR kodu telefonunun kamera uygulamasıyla okut; site kendiliğinden açılır.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch (e) {
        setErr('Kameraya izin verilmedi. Tarayıcı ayarlarından kamera iznini aç ya da QR kodu telefonunun kamera uygulamasıyla okut.');
        return;
      }
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      const v = videoRef.current;
      v.srcObject = stream;
      await v.play().catch(() => {});
      setReady(true);
      if ('BarcodeDetector' in window) { try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; } }
      if (!detector) {
        try { jsQR = (await import('https://esm.sh/jsqr@1.4.0')).default; } catch (e) { setErr('QR okuyucu yüklenemedi. QR kodu telefonunun kamera uygulamasıyla okut.'); return; }
      }
      const tick = async () => {
        if (stopped) return;
        try {
          if (v.readyState >= 2 && v.videoWidth) {
            let text = null;
            if (detector) {
              const codes = await detector.detect(v);
              if (codes && codes[0]) text = codes[0].rawValue;
            } else if (jsQR) {
              const s = Math.min(1, 640 / v.videoWidth);
              canvas.width = Math.round(v.videoWidth * s);
              canvas.height = Math.round(v.videoHeight * s);
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
              if (r) text = r.data;
            }
            if (text) { stopped = true; onResult(text); return; }
          }
        } catch (e) { /* bir sonraki karede tekrar dene */ }
        timer = setTimeout(tick, 200);
      };
      tick();
    })();
    return () => { stopped = true; clearTimeout(timer); if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, []);
  return html`
    <div class="scan-bg" role="dialog" aria-modal="true" aria-label="QR kod okut">
      <div class="scan">
        <div class="scan-head"><b>Prova odası QR kodunu okut</b><button type="button" class="btn btn-sm btn-ghost" onClick=${onClose}>Kapat</button></div>
        ${err ? html`<p class="form-err">${err}</p>` : html`
          <div class="scan-view">
            <video ref=${videoRef} muted playsinline autoplay></video>
            <span class="scan-frame" aria-hidden="true"></span>
            ${!ready ? html`<span class="scan-wait">Kamera açılıyor…</span>` : null}
          </div>
          <p class="muted small">QR kodu çerçevenin içine getir. Okununca giriş/çıkış ekranı kendiliğinden açılır.</p>`}
      </div>
    </div>`;
}

// ---- Profil fotoğrafı --------------------------------------------------
export function Avatar({ url, name, size, cls }) {
  const s = size || 48;
  const initials = String(name || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toLocaleUpperCase('tr');
  const style = 'width:' + s + 'px;height:' + s + 'px;font-size:' + Math.round(s * 0.38) + 'px';
  return url
    ? html`<img class=${'avatar-img ' + (cls || '')} src=${url} alt=${name ? name + ' fotoğrafı' : ''} style=${style} loading="lazy" />`
    : html`<span class=${'avatar-ph ' + (cls || '')} style=${style} aria-hidden="true">${initials}</span>`;
}

// Fotoğrafı kare kırpıp küçültür (512 px JPEG) ve avatars deposuna yükler; herkese açık adresi döner.
export async function uploadAvatar(file, folder) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Lütfen bir fotoğraf seç.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Fotoğraf çok büyük (en fazla 15 MB).');
  const bmp = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Fotoğraf okunamadı. JPG ya da PNG dene.'));
    img.src = URL.createObjectURL(file);
  });
  const side = Math.min(bmp.naturalWidth, bmp.naturalHeight);
  const out = 512;
  const canvas = document.createElement('canvas');
  canvas.width = out; canvas.height = out;
  canvas.getContext('2d').drawImage(bmp, (bmp.naturalWidth - side) / 2, (bmp.naturalHeight - side) / 2, side, side, 0, 0, out, out);
  URL.revokeObjectURL(bmp.src);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  const path = folder + '/avatar.jpg';
  const { error } = await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' });
  if (error) throw error;
  const { data } = sb.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl + '?v=' + Date.now();
}


// ---- Giriş yardımcıları (telefon klavyeleri ve otomatik doldurma için) ----
export function PasswordInput({ value, onInput, autocomplete, name, required }) {
  const [show, setShow] = useState(false);
  return html`
    <span class="pw-wrap">
      <input class="inp" name=${name || 'password'} type=${show ? 'text' : 'password'} autocomplete=${autocomplete || 'current-password'}
        autocapitalize="none" autocorrect="off" spellcheck="false" required=${required !== false} value=${value} onInput=${onInput} />
      <button type="button" class="pw-eye" aria-label=${show ? 'Şifreyi gizle' : 'Şifreyi göster'} aria-pressed=${show} onClick=${() => setShow(!show)}>${show ? 'Gizle' : 'Göster'}</button>
    </span>`;
}

// Formdaki gerçek değerleri okur (tarayıcının otomatik doldurduğu değerler dahil) ve giriş yapar.
// Telefon klavyesinin eklediği baştaki/sondaki boşlukları da dener.
export async function signIn(email, password) {
  let r = await sb.auth.signInWithPassword({ email, password });
  const t = password.replace(/^\s+|\s+$/g, '');
  if (r.error && t !== password && t.length >= 6) r = await sb.auth.signInWithPassword({ email, password: t });
  return r;
}
