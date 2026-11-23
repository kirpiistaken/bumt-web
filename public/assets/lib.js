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
  const v = String(u || '').trim().toLowerCase();
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

// Giriş yapan kişinin profili, yetkileri ve (varsa) eğitmen kaydı
export async function loadMe() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const uid = session.user.id;
  const { data: profile } = await sb.from('profiles').select('*, roles(name, permissions)').eq('id', uid).maybeSingle();
  if (!profile) return { session, user: session.user, profile: null, perms: [], can: () => false, instructor: null };
  const perms = (profile.roles && profile.roles.permissions) || [];
  const { data: instructor } = await sb.from('instructors').select('*').eq('profile_id', uid).maybeSingle();
  return {
    session, user: session.user, profile, perms, instructor: instructor || null,
    isAdmin: profile.is_super || !!profile.role_id,
    can: (k) => profile.is_super || perms.includes(k)
  };
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
export function AvailabilityGrid({ slots, bookings, onToggle, onBooked, busy }) {
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
              onClick=${() => onToggle(d, h, on)}>${on ? 'Müsait' : ''}</button>`;
          })}
        `)}
      </div>
    </div>`;
}

// Bir eğitmenin müsaitliğini yükleyip düzenleyen hazır bileşen
export function InstructorScheduleEditor({ instructor }) {
  const [slots, setSlots] = useState(new Set());
  const [bookings, setBookings] = useState({});
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: s }, { data: b }] = await Promise.all([
      sb.from('instructor_slots').select('weekday,hour').eq('instructor_id', instructor.id),
      sb.from('lesson_bookings').select('id,weekday,hour,display_name,user_id').eq('instructor_id', instructor.id)
    ]);
    setSlots(new Set((s || []).map((x) => x.weekday + '-' + x.hour)));
    const bm = {};
    (b || []).forEach((x) => { bm[x.weekday + '-' + x.hour] = x.display_name; });
    setBookings(bm);
    setRows(b || []);
  }, [instructor.id]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (d, h, on) => {
    setBusy(true);
    const q = on
      ? sb.from('instructor_slots').delete().match({ instructor_id: instructor.id, weekday: d, hour: h })
      : sb.from('instructor_slots').insert({ instructor_id: instructor.id, weekday: d, hour: h });
    const { error } = await q;
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    load();
  };
  const cancel = async (d, h, name) => {
    const row = rows.find((r) => r.weekday === d && r.hour === h);
    if (!row || !confirm(name + ' ile ' + DAY_NAMES[d] + ' ' + h + ':00 dersini iptal etmek istiyor musun?')) return;
    const { error } = await sb.from('lesson_bookings').delete().eq('id', row.id);
    if (error) return toast(errMsg(error), 'err');
    toast('Ders iptal edildi, saat tekrar müsait.');
    load();
  };

  return html`
    <div class="stack">
      <p class="muted small">Ders verebileceğin saatlere tıkla, tekrar tıklarsan kapanır. Dolu bir saate tıklarsan o dersi iptal edebilirsin.</p>
      <${AvailabilityGrid} slots=${slots} bookings=${bookings} onToggle=${toggle} onBooked=${cancel} busy=${busy} />
      <div class="legend">
        <span><i class="sw sw-on"></i>Müsait</span>
        <span><i class="sw sw-booked"></i>Dolu (öğrenci adıyla)</span>
        <span><i class="sw sw-off"></i>Kapalı</span>
      </div>
    </div>`;
}
