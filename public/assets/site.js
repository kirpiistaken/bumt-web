// BÜMT — herkese açık site
import {
  html, render, useState, useEffect, useCallback,
  sb, initSupabase, loadMe, memberEmail, errMsg, toast, Toaster,
  todayStr, addDays, fmtLong, fmtShort, hhmm, addMinutes, nextFridays,
  DAY_NAMES, DAY_SHORT, GRID_DAYS, INSTRUMENTS, CLASS_YEARS, waLink, InstructorScheduleEditor, notifyLesson, notifyProva, notifyDinleti, QrScanner, yoklamaCode, timeTR, Avatar, uploadAvatar, PasswordInput, signIn, compressImage, PROFILE_COLS, UserTags, mapsHref, HAS_FACULTY, SchoolLine, FacultySelect, INSTRUCTOR_COLS
} from './lib.js';

const parseRoute = () => {
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/');
  return { page: parts[0] || '', param: parts[1] || '' };
};
const go = (path) => { location.hash = path; };

const Field = ({ label, hint, children }) => html`
  <label class="lbl"><span>${label}</span>${children}${hint ? html`<small class="muted">${hint}</small>` : null}</label>`;

const Loading = () => html`<div class="loading" role="status">Yükleniyor…</div>`;

function Pill({ on, onClick, children, label }) {
  return html`<button type="button" class=${'pill ' + (on ? 'pill-on' : '')} aria-pressed=${!!on} aria-label=${label} onClick=${onClick}>${children}</button>`;
}

// ---------------------------------------------------------------------
// Üst menü
// ---------------------------------------------------------------------
const NAV = [['', 'Ana Sayfa'], ['prova', 'Prova Odası'], ['kurslar', 'Enstrüman Kursları'], ['dinletiler', 'Dinletiler'], ['pazar', 'Müzisyen Pazarı']];

function Header({ me, route }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [route.page]);
  const name = me && me.profile ? (me.profile.full_name || me.profile.student_no || 'Hesabım') : '';
  const logout = async () => { await sb.auth.signOut(); setOpen(false); go('/'); toast('Çıkış yapıldı.'); };
  return html`
    <header class="hdr">
      <div class="wrap hdr-in">
        <a href="#/" class="brand">
          <span class="brand-logo"><img src="/assets/logo.png" alt="" /></span>
          <span class="brand-txt"><b class="h">BÜMT</b><small>Başkent Üniversitesi Müzik Topluluğu</small></span>
        </a>
        <nav class="nav" aria-label="Ana menü">
          ${NAV.map(([p, l]) => html`<a href=${'#/' + p} class=${'nav-a ' + (route.page === p ? 'nav-on' : '')}>${l}</a>`)}
        </nav>
        <div class="hdr-right">
          ${me === undefined ? null : !me ? html`
            <a class="btn btn-red btn-sm" href="#/giris">Giriş</a>
          ` : html`
            <div class="menu">
              <button type="button" class="btn btn-cream btn-sm menu-btn" aria-expanded=${open} onClick=${() => setOpen(!open)}>
                <${Avatar} url=${me.profile && me.profile.avatar_url} name=${name} size=${28} />
                <span class="menu-name">${name}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              ${open ? html`
                <div class="menu-pop">
                  <a href="#/profil">Profilim ve rezervasyonlarım</a>
                  ${me.instructor ? html`<a href="#/egitmen">Eğitmen paneli</a>` : null}
                  ${me.isAdmin ? html`<a href="/yonetim/">Yönetim paneli</a>` : null}
                  <button type="button" onClick=${logout}>Çıkış yap</button>
                </div>` : null}
            </div>
          `}
        </div>
      </div>
    </header>`;
}

const ICON = {
  home: 'M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  prova: 'M4 21h16M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M14 12h.01',
  kurslar: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  dinletiler: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3M19 10v2a7 7 0 0 1-14 0v-2M12 19v3',
  pazar: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8'
};
const BNAV = [['', 'Ana Sayfa', 'home'], ['prova', 'Prova', 'prova'], ['kurslar', 'Kurslar', 'kurslar'], ['dinletiler', 'Dinleti', 'dinletiler'], ['pazar', 'Pazar', 'pazar']];

// Numarayı sitede göstermeden doğrudan WhatsApp'ı açar.
// Pencere tıklama anında açılır (telefon tarayıcıları sonradan açılan pencereleri engeller), numara gelince WhatsApp'a yönlenir.
async function openWhatsApp(rpc, args, text, noPhoneMsg) {
  let w = null;
  try { w = window.open('', '_blank'); } catch (e) { w = null; }
  const { data: ph, error } = await sb.rpc(rpc, args);
  if (error || !ph) {
    if (w) w.close();
    return toast(error ? errMsg(error) : noPhoneMsg, 'err');
  }
  const url = waLink(ph, text);
  if (w) w.location.href = url; else location.href = url;
}

function BottomNav({ route }) {
  return html`
    <nav class="bnav" aria-label="Alt menü">
      ${BNAV.map(([p, l, ic]) => html`
        <a href=${'#/' + p} class=${'bnav-a ' + (route.page === p ? 'bnav-on' : '')} aria-current=${route.page === p ? 'page' : null}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${ICON[ic]} /></svg>
          <span>${l}</span>
        </a>`)}
    </nav>`;
}

function StatusBanner({ me }) {
  if (!me || !me.profile || me.profile.is_staff) return null;
  if (me.profile.status === 'bekliyor') return html`
    <div class="banner"><div class="wrap">Üyeliğin <b>onay bekliyor</b>. Yönetim kurulu öğrenci numaranı kontrol edince rezervasyon yapabileceksin.</div></div>`;
  if (me.profile.status === 'reddedildi') return html`
    <div class="banner banner-red"><div class="wrap">Üyelik başvurun onaylanmadı. Bir yanlışlık olduğunu düşünüyorsan yönetim kuruluna yaz.</div></div>`;
  return null;
}

// Rezervasyon yapabilir mi? Değilse ne yapmalı?
function bookingGate(me) {
  if (!me) return { ok: false, reason: 'login' };
  if (!me.profile || me.profile.status !== 'onaylandi') return { ok: false, reason: 'pending' };
  return { ok: true };
}
function gateMessage(g) {
  if (g.reason === 'login') { go('/giris'); return; }
  toast('Üyeliğin onaylanınca rezervasyon yapabilirsin.', 'err');
}

// ---------------------------------------------------------------------
// Ana sayfa
// ---------------------------------------------------------------------
function Home() {
  const [events, setEvents] = useState(null);
  useEffect(() => {
    sb.from('events').select('*').eq('published', true).order('sort').order('starts_on', { nullsFirst: false })
      .then(({ data }) => setEvents(data || []));
  }, []);
  return html`
    <section class="hero">
      <div class="hero-badge"><img src="/assets/logo.png" alt="Başkent Müzik Topluluğu logosu" /></div>
      <span class="hero-kicker">Kampüsün müzik topluluğu</span>
      <h1 class="h hero-h">Sahne hepimizin.</h1>
      <p class="hero-lead">Başkent Üniversitesi Müzik Topluluğu'na hoş geldin! Burası çalan, söyleyen, dinleyen ve müziği seven herkesin buluşma noktası. İlk akorunu yeni öğreniyor olsan da yıllardır sahnede olsan da burada sana yer var.</p>
      <p class="hero-sub">Üye ol, prova odasını ayır, enstrüman derslerine göz at ve etkinliklerimizden ilk sen haberdar ol.</p>
      <div class="hero-cta">
        <a class="btn btn-red" href="#/prova">Prova odası rezervasyonu</a>
        <a class="btn btn-cream" href="#/kurslar">Enstrüman kursları</a>
      </div>
    </section>

    <section class="sec">
      <div class="sec-head"><h2 class="h">Yaklaşan etkinlikler</h2></div>
      ${events === null ? html`<${Loading} />` : events.length === 0 ? html`
        <p class="muted">Şu an duyurulmuş bir etkinlik yok. Takipte kal!</p>` : html`
        <div class="cards">${events.map((e, i) => html`<${EventCard} e=${e} i=${i} />`)}</div>`}
    </section>

    <${Social} />`;
}

// ---------------------------------------------------------------------
// Instagram
// ---------------------------------------------------------------------
const IG_ACCOUNTS = [
  { handle: 'baskentmt', name: 'Başkent Müzik Topluluğu', sub: 'Duyurular, etkinlikler, sahne anları', logo: '/assets/logo.png' },
  { handle: 'baskent.rock', name: 'Başkent Rock & Metal Komitesi', sub: 'Topluluğumuzun rock & metal komitesi', logo: '/assets/rmk.jpg', cover: true }
];
const IG_ICON = 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM17.5 6.5h.01';
const igCode = (u) => { const m = String(u || '').match(/instagram\.com\/(?:[A-Za-z0-9._]+\/)?(?:p|reel|tv)\/([A-Za-z0-9_-]+)/); return m ? m[1] : null; };

function IgTile({ p }) {
  const [state, setState] = useState('loading');
  return html`
    <a class=${'ig-tile ig-' + state} href=${'https://www.instagram.com/' + (p.video ? 'reel' : 'p') + '/' + p.code + '/'} target="_blank" rel="noopener" aria-label="Gönderiyi Instagram'da aç">
      ${state !== 'error' ? html`<img src=${'/api/ig?code=' + p.code} alt="" loading="lazy" onLoad=${() => setState('ok')} onError=${() => setState('error')} />` : null}
      <span class="ig-fallback" aria-hidden="true">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d=${IG_ICON} /></svg>
        <span>Gönderiyi gör</span>
      </span>
      ${p.video ? html`<span class="ig-badge" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>` : null}
      <span class="ig-hover" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d=${IG_ICON} /></svg>
        Instagram'da aç
      </span>
    </a>`;
}

function Social() {
  const [posts, setPosts] = useState([]);
  useEffect(() => {
    sb.from('settings').select('instagram_posts').eq('id', 1).maybeSingle().then(({ data }) => {
      setPosts(((data && data.instagram_posts) || []).map((u) => ({ code: igCode(u), video: /\/(reel|tv)\//.test(u), url: u })).filter((x) => x.code).slice(0, 6));
    });
  }, []);
  return html`
    <section class="sec">
      <div class="sec-head"><h2 class="h">Bizi takip edin</h2></div>
      <div class="ig-accounts">
        ${IG_ACCOUNTS.map((a) => html`
          <a class="ig-card" href=${'https://www.instagram.com/' + a.handle + '/'} target="_blank" rel="noopener">
            <span class="ig-ring">${a.logo ? html`<img src=${a.logo} alt="" class=${a.cover ? 'ig-cover' : ''} />` : html`<span class="h ig-mono">RM</span>`}</span>
            <span class="ig-txt">
              <b>@${a.handle}</b>
              <span>${a.name}</span>
              <small>${a.sub}</small>
            </span>
            <span class="ig-follow">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d=${IG_ICON} /></svg>
              Takip et
            </span>
          </a>`)}
      </div>
      ${posts.length ? html`
        <div class="ig-grid">
          ${posts.map((p) => html`<${IgTile} p=${p} />`)}
        </div>` : null}
    </section>`;
}

const POSTER_COLORS = [['#D7301F', '#fff'], ['#141414', '#F4EAD5'], ['#F4EAD5', '#141414']];
function EventCard({ e, i }) {
  const [bg, fg] = POSTER_COLORS[i % 3];
  const when = e.starts_on ? fmtLong(e.starts_on) : e.date_text;
  return html`
    <a class="card ev ev-link" href=${'#/etkinlik/' + e.id} aria-label=${e.title + ' etkinlik sayfası'}>
      ${e.poster_url ? html`
        <div class="ev-media">
          <img class="ev-media-bg" src=${e.poster_url} alt="" aria-hidden="true" loading="lazy" />
          <img class="ev-media-img" src=${e.poster_url} alt=${e.title + ' afişi'} loading="lazy" />
        </div>` : html`
        <div class="ev-gen" style=${'background:' + bg + ';color:' + fg}>
          <span class="ev-gen-top">Başkent Müzik Topluluğu</span>
          <span class="h ev-gen-title">${e.title}</span>
          <span class="ev-gen-top">${e.tag}</span>
        </div>`}
      <div class="ev-body">
        <div class="row-sm"><span class="tag tag-dark">${e.tag}</span>${e.maps_url ? html`<span class="ev-pin">📍 Konum var</span>` : null}</div>
        <h3>${e.title}</h3>
        ${when || e.venue ? html`<div class="ev-meta">
          ${when ? html`<span><b>${when}</b>${e.date_text && e.starts_on ? ' · ' + e.date_text : ''}</span>` : null}
          ${e.venue ? html`<span class="muted">${e.venue}</span>` : null}
        </div>` : null}
        ${e.description ? html`<p class="muted ev-excerpt">${e.description}</p>` : null}
        <span class="ev-more">Etkinlik sayfası →</span>
      </div>
    </a>`;
}

// Açıklamadaki linkleri ve @kullanıcı adlarını tıklanabilir yap
function richText(t) {
  const out = [];
  const re = /(https?:\/\/[^\s]+)|(@[A-Za-z0-9._]{2,30})/g;
  let last = 0, m;
  while ((m = re.exec(t))) {
    if (m.index > last) out.push(t.slice(last, m.index));
    if (m[1]) out.push(html`<a href=${m[1]} target="_blank" rel="noopener">${m[1].replace(/^https?:\/\//, '').slice(0, 40)}</a>`);
    else out.push(html`<a href=${'https://www.instagram.com/' + m[2].slice(1).replace(/\.$/, '') + '/'} target="_blank" rel="noopener">${m[2]}</a>`);
    last = m.index + m[0].length;
  }
  out.push(t.slice(last));
  return out;
}

function EventPage({ id }) {
  const [e, setE] = useState(undefined);
  useEffect(() => {
    sb.from('events').select('*').eq('id', id).eq('published', true).maybeSingle().then(({ data }) => {
      setE(data || null);
      if (data) document.title = data.title + ' — BÜMT';
    });
    return () => { document.title = 'BÜMT — Başkent Üniversitesi Müzik Topluluğu'; };
  }, [id]);
  if (e === undefined) return html`<${Loading} />`;
  if (!e) return html`<div class="stack"><h1 class="h page-h">Etkinlik bulunamadı</h1><p class="muted">Kaldırılmış ya da yayından alınmış olabilir.</p><a class="btn btn-ghost self-start" href="#/">Ana sayfa</a></div>`;

  const href = e.form_id ? '#/form/' + e.form_id : e.cta_url;
  const ext = !e.form_id && e.cta_url;
  const map = mapsHref(e.maps_url);
  const d = e.starts_on ? new Date(e.starts_on + 'T12:00:00') : null;
  const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const WDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const gcal = d ? (() => {
    const ymd = (x) => x.toISOString().slice(0, 10).replace(/-/g, '');
    const next = new Date(d.getTime() + 86400000);
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(e.title) + '&dates=' + ymd(d) + '/' + ymd(next) +
      '&details=' + encodeURIComponent((e.date_text ? e.date_text + '\n' : '') + location.href) + '&location=' + encodeURIComponent(e.venue || '');
  })() : '';
  const share = async () => {
    const url = location.origin + '/#/etkinlik/' + e.id;
    try {
      if (navigator.share) await navigator.share({ title: e.title, text: e.title + ' — BÜMT', url });
      else { await navigator.clipboard.writeText(url); toast('Link kopyalandı.'); }
    } catch (err) { /* vazgeçildi */ }
  };

  return html`
    <div class="evp">
      <section class="evp-hero">
        ${e.poster_url ? html`<img class="evp-bg" src=${e.poster_url} alt="" aria-hidden="true" />` : null}
        <div class="evp-shade"></div>
        <div class="wrap evp-in">
          <a class="evp-back" href="#/">← Tüm etkinlikler</a>
          <div class="evp-grid">
            <div class="evp-poster">
              ${e.poster_url ? html`<a href=${e.poster_url} target="_blank" rel="noopener" title="Afişi büyüt"><img src=${e.poster_url} alt=${e.title + ' afişi'} /></a>` : html`
                <div class="ev-gen evp-gen"><span class="ev-gen-top">Başkent Müzik Topluluğu</span><span class="h ev-gen-title">${e.title}</span><span class="ev-gen-top">${e.tag}</span></div>`}
            </div>
            <div class="evp-info">
              <span class="tag tag-red self-start">${e.tag}</span>
              <h1 class="h evp-title">${e.title}</h1>
              <div class="evp-facts">
                ${d ? html`<div class="evp-date"><span class="evp-day">${d.getDate()}</span><span class="evp-mon">${MONTHS[d.getMonth()]}<br /><small>${WDAYS[d.getDay()]}</small></span></div>` : null}
                <div class="stack-xs">
                  ${e.date_text ? html`<span class="evp-fact">🕒 ${e.date_text}</span>` : null}
                  ${e.venue ? html`<span class="evp-fact">📍 ${e.venue}</span>` : null}
                </div>
              </div>
              <div class="evp-actions">
                ${href ? html`<a class="btn btn-red btn-lg" href=${href} target=${ext ? '_blank' : null} rel=${ext ? 'noopener' : null}>${e.cta_label || (e.form_id ? 'Başvur' : 'Detaylar')}</a>` : null}
                ${map ? html`<a class="btn btn-lg evp-btn" href=${map} target="_blank" rel="noopener">
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#D7301F" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>Konumu aç</a>` : null}
              </div>
              <div class="row-sm">
                ${gcal ? html`<a class="evp-link" href=${gcal} target="_blank" rel="noopener">＋ Takvime ekle</a>` : null}
                <button type="button" class="evp-link" onClick=${share}>↗ Paylaş</button>
              </div>
            </div>
          </div>
        </div>
      </section>
      ${e.description ? html`
        <section class="evp-about">
          <h2 class="h evp-h2">Etkinlik hakkında</h2>
          <p class="evp-desc">${richText(e.description)}</p>
          <div class="row-sm">
            ${href ? html`<a class="btn btn-red" href=${href} target=${ext ? '_blank' : null} rel=${ext ? 'noopener' : null}>${e.cta_label || (e.form_id ? 'Başvur' : 'Detaylar')}</a>` : null}
            ${map ? html`<a class="btn btn-ghost" href=${map} target="_blank" rel="noopener">📍 Konum</a>` : null}
          </div>
        </section>` : null}
    </div>`;
}

// ---------------------------------------------------------------------
// Prova odası
// ---------------------------------------------------------------------
function Prova({ me }) {
  const [myRules, setMyRules] = useState(null);
  const [guestOk, setGuestOk] = useState(false);
  const [data, setData] = useState(null);
  const [week, setWeek] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const fridays = nextFridays(3);

  const load = useCallback(async () => {
    const [{ data: settings }, { data: slots }, { data: bookings }] = await Promise.all([
      sb.from('settings').select('id,prova_open_days,prova_max_per_week,dinleti_open_days,prova_rules,prova_rules_version').eq('id', 1).single(),
      sb.from('prova_slots').select('*').eq('active', true).order('sort').order('start_time'),
      sb.from('prova_bookings').select('id,slot_id,day,user_id,display_name,status').in('day', fridays).neq('status', 'reddedildi')
    ]);
    setData({ settings: settings || { prova_open_days: 4, prova_max_per_week: 1, prova_rules: '', prova_rules_version: 0 }, slots: slots || [], bookings: bookings || [] });
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!me) { setMyRules(null); return; }
    sb.from('profiles').select('prova_rules_version').eq('id', me.user.id).maybeSingle()
      .then(({ data: d, error }) => setMyRules(error ? 999999 : ((d && d.prova_rules_version) || 0)));
  }, [me && me.user.id]);

  if (!data) return html`<${Loading} />`;
  const today = todayStr();
  const weeks = fridays.map((f) => {
    const opens = addDays(f, -data.settings.prova_open_days);
    return { f, opens, open: today >= opens && today <= f };
  });
  const w = weeks[week];
  const uid = me && me.user.id;
  const gate = bookingGate(me);

  const request = async (slot) => {
    if (!gate.ok) return gateMessage(gate);
    setBusy(true);
    const { data: row, error } = await sb.from('prova_bookings').insert({ slot_id: slot.id, day: w.f, note: note.trim() }).select('id').single();
    if (error) { setBusy(false); toast(errMsg(error), 'err'); return load(); }
    await notifyProva('notify_request', row.id);
    setBusy(false);
    setNote('');
    toast('Talebin yönetim kuruluna iletildi: ' + fmtShort(w.f) + ', ' + hhmm(slot.start_time) + '–' + hhmm(slot.end_time) + '. Onaylanınca kesinleşecek.');
    load();
  };
  const cancel = async (b) => {
    if (!confirm(b.status === 'onaylandi' ? 'Rezervasyonunu iptal etmek istiyor musun?' : 'Talebini geri çekmek istiyor musun?')) return;
    setBusy(true);
    const { error } = await sb.from('prova_bookings').delete().eq('id', b.id);
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    toast(b.status === 'onaylandi' ? 'Rezervasyonun iptal edildi.' : 'Talebin geri çekildi.');
    load();
  };
  const hasMineThisWeek = data.bookings.some((b) => b.day === w.f && b.user_id === uid);
  const rulesText = data.settings.prova_rules || '';
  const rulesVer = data.settings.prova_rules_version || 0;
  if (me && myRules === null && rulesText) return html`<${Loading} />`;
  const mustAccept = rulesText && (me ? myRules < rulesVer : !guestOk);
  const accept = async () => {
    if (!me) { setGuestOk(true); return; }
    const { data: v, error } = await sb.rpc('accept_prova_rules');
    if (error) return toast(errMsg(error), 'err');
    setMyRules(v || rulesVer);
    toast('Kuralları onayladın. Artık prova odası talebi gönderebilirsin.');
    window.scrollTo(0, 0);
  };
  if (mustAccept) return html`<${ProvaRulesGate} text=${rulesText} me=${me} updated=${me && myRules > 0} onAccept=${accept} />`;

  return html`
    <div class="stack-lg">
      <div class="stack">
        <h1 class="h page-h">Prova odası</h1>
        <p class="muted measure">Topluluğun her cuma prova odası hakkı var. Bir cumanın talepleri ${data.settings.prova_open_days === 4 ? html`o haftanın <b class="ink">pazartesi</b> günü` : html`<b class="ink">${data.settings.prova_open_days} gün önceden</b>`} açılır. Boş bir saate talep gönder; yönetim kurulu onaylayınca rezervasyonun kesinleşir. Her üye haftada en fazla ${data.settings.prova_max_per_week} saat alabilir.</p>
      </div>
      ${me ? html`<${ScanCard} />` : null}
      <div class="row chips">
        ${weeks.map((x, i) => html`
          <button type="button" class=${'week ' + (i === week ? 'week-on' : '')} aria-pressed=${i === week} onClick=${() => setWeek(i)}>
            <b>${fmtShort(x.f)} Cuma</b>
            <span class="small">${x.open ? 'Talepler açık' : today > x.f ? 'Geçti' : fmtShort(x.opens) + ' açılır'}</span>
          </button>`)}
      </div>
      ${data.slots.length === 0 ? html`<p class="muted">Prova saatleri henüz tanımlanmadı.</p>` : w.open ? html`
        <div class="card pad stack">
          <h2 class="h2">${fmtLong(w.f)}</h2>
          ${!hasMineThisWeek && gate.ok ? html`
            <label class="lbl"><span>Not (isteğe bağlı)</span>
              <input class="inp" maxlength="300" value=${note} onInput=${(e) => setNote(e.target.value)} placeholder="Örn. 4 kişilik grubumuzla konser provası, kendi enstrümanlarımızı getireceğiz" />
            </label>` : null}
          ${data.slots.map((s) => {
            const approved = data.bookings.find((x) => x.slot_id === s.id && x.day === w.f && x.status === 'onaylandi');
            const mine = data.bookings.find((x) => x.slot_id === s.id && x.day === w.f && x.user_id === uid);
            let status, cls, action;
            if (mine && mine.status === 'onaylandi') { status = 'Senin rezervasyonun (onaylandı)'; cls = 'slot-mine'; action = html`<button type="button" class="btn btn-ghost" disabled=${busy} onClick=${() => cancel(mine)}>İptal et</button>`; }
            else if (approved) { status = 'Dolu · ' + approved.display_name; cls = 'slot-taken'; action = html`<span class="btn btn-disabled" aria-hidden="true">Dolu</span>`; }
            else if (mine) { status = 'Talebin onay bekliyor'; cls = 'slot-pending'; action = html`<button type="button" class="btn btn-ghost" disabled=${busy} onClick=${() => cancel(mine)}>Talebi geri çek</button>`; }
            else { status = 'Boş'; cls = ''; action = html`<button type="button" class="btn btn-red" disabled=${busy || (hasMineThisWeek && gate.ok)} onClick=${() => request(s)}>${gate.reason === 'login' ? 'Giriş yap ve talep gönder' : 'Talep gönder'}</button>`; }
            return html`
              <div class=${'slot ' + cls}>
                <div class="stack-xs">
                  <span class="h slot-time">${hhmm(s.start_time)} – ${hhmm(s.end_time)}</span>
                  <span class="small strong">${status} ${approved && !mine ? html`<${UserTags} uid=${approved.user_id} />` : null}</span>
                </div>
                ${action}
              </div>`;
          })}
          ${hasMineThisWeek ? html`<p class="muted small">Bu hafta için talebin var. Başka bir saat istiyorsan önce mevcut talebini geri çek.</p>` : null}
        </div>` : html`
        <div class="locked">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
          <h2 class="h2">${fmtLong(w.f)} henüz kilitli</h2>
          <p class="muted">Bu haftanın talepleri <b class="ink">${fmtLong(w.opens)}</b> açılır.</p>
        </div>`}
      ${rulesText ? html`
        <section class="card pad stack rules-card" id="kurallar">
          <h2 class="h2">Prova odası kuralları</h2>
          <ol class="rules-list">${rulesLines(rulesText).map((l) => html`<li>${l}</li>`)}</ol>
        </section>` : null}
    </div>`;
}

const rulesLines = (t) => String(t || '').split(/\n+/).map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);

function ProvaRulesGate({ text, me, updated, onAccept }) {
  const [ok, setOk] = useState(false);
  return html`
    <div class="card pad-lg stack narrow rules-gate">
      <span class="tag tag-red self-start">${updated ? 'Kurallar güncellendi' : 'Önce kuralları oku'}</span>
      <h1 class="h page-h">Prova odası kuralları</h1>
      <p class="muted">${updated ? 'Prova odası kuralları değişti. Devam etmeden önce yeni kuralları okuyup onaylaman gerekiyor.' : 'Prova odası hepimizin. Rezervasyon yapmadan önce lütfen aşağıdaki kuralları dikkatlice oku.'}</p>
      <ol class="rules-list">${rulesLines(text).map((l) => html`<li>${l}</li>`)}</ol>
      ${me ? html`
        <label class="check check-top key-check"><input type="checkbox" checked=${ok} onChange=${(e) => setOk(e.target.checked)} /><span><b>Kuralları okudum, anladım ve uyacağımı kabul ediyorum.</b> Kurallara uymazsam prova odası hakkımın kısıtlanabileceğini biliyorum.</span></label>
        <button type="button" class="btn btn-red self-start" disabled=${!ok} onClick=${onAccept}>Onaylıyorum, devam et</button>`
      : html`<button type="button" class="btn btn-red self-start" onClick=${onAccept}>Okudum, devam et</button>`}
    </div>`;
}

// ---------------------------------------------------------------------
// Enstrüman kursları
// ---------------------------------------------------------------------
function Kurslar({ me }) {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('Tümü');
  const [selId, setSelId] = useState(null);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: ins }, { data: slots }, { data: bookings }] = await Promise.all([
      sb.from('instructors').select('id,full_name,instrument,kind,department,class_year,bio,profile_id,avatar_url' + (HAS_FACULTY ? ',faculty' : '')).eq('active', true).order('instrument').order('full_name'),
      sb.from('instructor_slots').select('instructor_id,weekday,hour'),
      sb.from('lesson_bookings').select('id,instructor_id,weekday,hour,user_id,display_name,status').neq('status', 'reddedildi')
    ]);
    setData({ ins: ins || [], slots: slots || [], bookings: bookings || [] });
  }, []);
  useEffect(() => { load(); }, [load]);

  const approvedMember = me && me.profile && me.profile.status === 'onaylandi';

  if (!data) return html`<${Loading} />`;
  const instruments = ['Tümü', ...Array.from(new Set(data.ins.map((i) => i.instrument)))];
  const list = data.ins.filter((i) => filter === 'Tümü' || i.instrument === filter);
  const sel = data.ins.find((i) => i.id === selId);
  const uid = me && me.user.id;
  const gate = bookingGate(me);

  const approvedAt = (id, d, h) => data.bookings.find((b) => b.instructor_id === id && b.weekday === d && b.hour === h && b.status === 'onaylandi');
  const mineAt = (id, d, h) => uid && data.bookings.find((b) => b.instructor_id === id && b.weekday === d && b.hour === h && b.user_id === uid);
  const freeCount = (id) => data.slots.filter((s) => s.instructor_id === id && !approvedAt(id, s.weekday, s.hour)).length;
  const open = (id) => { setSelId(id); setPicked(null); setTimeout(() => { const el = document.getElementById('takvim'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50); };

  const waText = (t) => 'Merhaba ' + t.full_name + ', BÜMT sitesinden ' + t.instrument + ' dersi için yazıyorum.';
  const Contact = ({ t, small }) => {
    const cls = 'btn ' + (small ? 'btn-sm ' : '');
    if (!me) return html`<a class=${cls + 'btn-ghost'} href="#/giris">İletişim için giriş yap</a>`;
    if (!approvedMember) return html`<span class="muted small">İletişim bilgisi üyeliğin onaylanınca görünür.</span>`;
    return html`<button type="button" class=${cls + 'btn-wa'} onClick=${() => openWhatsApp('instructor_contact', { p_instructor: t.id }, waText(t), 'Eğitmen henüz telefon eklememiş.')}>WhatsApp'tan yaz</button>`;
  };

  let grid = null;
  if (sel) {
    const mySlots = data.slots.filter((s) => s.instructor_id === sel.id);
    const hours = mySlots.map((s) => s.hour);
    const hRange = hours.length ? Array.from({ length: Math.max(...hours) - Math.min(...hours) + 1 }, (_, i) => Math.min(...hours) + i) : [];
    const days = GRID_DAYS.concat(mySlots.some((s) => s.weekday === 7) ? [7] : []);
    grid = { mySlots, hRange, days };
  }

  const enroll = async () => {
    if (!gate.ok) return gateMessage(gate);
    const [d, h] = picked.split('-').map(Number);
    setBusy(true);
    const { data: row, error } = await sb.from('lesson_bookings').insert({ instructor_id: sel.id, weekday: d, hour: h }).select('id').single();
    if (error) { setBusy(false); toast(errMsg(error), 'err'); return load(); }
    await notifyLesson('notify_request', row.id);
    setBusy(false);
    setPicked(null);
    toast('Talebin ' + sel.full_name + ' adlı eğitmene iletildi. Onaylanınca bu saat senin olur; bu arada WhatsApp\'tan da yazabilirsin.');
    load();
  };
  const cancelMine = async (b) => {
    const what = b.status === 'onaylandi' ? 'dersini' : 'ders talebini';
    if (!confirm(DAY_NAMES[b.weekday] + ' ' + b.hour + ':00 ' + what + ' iptal etmek istiyor musun?')) return;
    const { error } = await sb.from('lesson_bookings').delete().eq('id', b.id);
    if (error) return toast(errMsg(error), 'err');
    toast('İptal edildi.');
    load();
  };

  return html`
    <div class="stack-lg">
      <div class="stack">
        <h1 class="h page-h">Enstrüman kursları</h1>
        <p class="muted measure">Hocalarımız, ders veren ve gönüllü öğrencilerimiz müsait saatlerini kendileri işaretler. Bir eğitmen seç, takviminden boş bir saate talep gönder; eğitmen onaylayınca ders senin.</p>
      </div>
      ${data.ins.length === 0 ? html`<p class="muted">Henüz eğitmen eklenmedi.</p>` : html`
        <div class="row chips" role="group" aria-label="Enstrümana göre filtrele">
          ${instruments.map((i) => html`<${Pill} on=${filter === i} onClick=${() => setFilter(i)}>${i}<//>`)}
        </div>
        <div class="cards">
          ${list.map((t) => {
            const n = freeCount(t.id);
            return html`
              <div class=${'card pad stack teacher ' + (t.id === selId ? 'teacher-on' : '')}>
                <div class="row nowrap">
                  <${Avatar} url=${t.avatar_url} name=${t.full_name} size=${64} />
                  <div class="stack-xs"><b class="t-name">${t.full_name}</b><${SchoolLine} p=${t} cls="muted" /></div>
                </div>
                <div class="row-sm"><span class="tag tag-dark">${t.instrument}</span>${t.kind ? html`<span class="tag tag-cream">${t.kind}</span>` : null}${t.profile_id ? html`<${UserTags} uid=${t.profile_id} />` : null}</div>
                ${t.bio ? html`<p class="muted small">${t.bio}</p>` : null}
                <span class="small strong">${n > 0 ? n + ' boş saat' : 'Şu an boş saat yok'}</span>
                <div class="row">
                  <button type="button" class="btn btn-sm btn-dark" onClick=${() => open(t.id)}>Takvimi gör</button>
                  <${Contact} t=${t} small=${true} />
                </div>
              </div>`;
          })}
        </div>`}

      ${sel ? html`
        <div id="takvim" class="card pad stack">
          <div class="row between">
            <div class="row nowrap">
            <${Avatar} url=${sel.avatar_url} name=${sel.full_name} size=${72} />
            <div class="stack-xs">
              <span class="muted small strong">Haftalık takvim</span>
              <h2 class="h2">${sel.full_name} · ${sel.instrument}</h2>
              ${sel.kind ? html`<span class="muted small">${sel.kind}</span>` : null}
              <${SchoolLine} p=${sel} cls="muted" />
              ${sel.profile_id ? html`<${UserTags} uid=${sel.profile_id} />` : null}
            </div>
            </div>
            <div class="row">
              <${Contact} t=${sel} />
              <button type="button" class="btn btn-ghost" onClick=${() => setSelId(null)}>Kapat</button>
            </div>
          </div>
          ${grid.hRange.length === 0 ? html`<p class="muted">Bu eğitmen henüz müsait saat girmemiş.</p>` : html`
            <div class="grid-scroll">
              <div class="cal" style=${'grid-template-columns: 56px repeat(' + grid.days.length + ', minmax(0, 1fr))'}>
                <span></span>
                ${grid.days.map((d) => html`<span class="cal-head">${DAY_SHORT[d]}</span>`)}
                ${grid.hRange.map((h) => html`
                  <span class="cal-hour">${h}:00</span>
                  ${grid.days.map((d) => {
                    const key = d + '-' + h;
                    const avail = grid.mySlots.some((s) => s.weekday === d && s.hour === h);
                    const b = approvedAt(sel.id, d, h);
                    const mine = mineAt(sel.id, d, h);
                    const when = DAY_NAMES[d] + ' ' + h + ':00';
                    if (mine && mine.status === 'onaylandi') return html`<button type="button" class="cell cell-booked" aria-label=${when + ', senin dersin, iptal etmek için tıkla'} onClick=${() => cancelMine(mine)}>Senin dersin</button>`;
                    if (b) return html`<span class="cell cell-taken" aria-label=${when + ', dolu'}>Dolu</span>`;
                    if (mine) return html`<button type="button" class="cell cell-pending" aria-label=${when + ', talebin onay bekliyor, iptal etmek için tıkla'} onClick=${() => cancelMine(mine)}>Talebin beklemede</button>`;
                    if (avail) return html`<button type="button" class=${'cell ' + (picked === key ? 'cell-picked' : 'cell-avail')} aria-pressed=${picked === key} aria-label=${when + ', müsait'} onClick=${() => setPicked(picked === key ? null : key)}>${picked === key ? 'Seçildi' : 'Müsait'}</button>`;
                    return html`<span class="cell cell-none" aria-hidden="true"></span>`;
                  })}
                `)}
              </div>
            </div>`}
          <div class="row between">
            <div class="legend">
              <span><i class="sw sw-avail"></i>Müsait</span>
              <span><i class="sw sw-taken"></i>Dolu</span>
              <span><i class="sw sw-pending"></i>Talebin beklemede</span>
              <span><i class="sw sw-booked"></i>Senin dersin</span>
            </div>
            ${picked ? html`
              <div class="row">
                <b>Seçilen: ${DAY_NAMES[+picked.split('-')[0]]} ${picked.split('-')[1]}:00</b>
                <button type="button" class="btn btn-red" disabled=${busy} onClick=${enroll}>${gate.reason === 'login' ? 'Giriş yap ve talep gönder' : 'Talep gönder'}</button>
              </div>` : null}
          </div>
          <p class="muted small">Talebin eğitmene e-postayla iletilir. Eğitmen onaylayınca o saat her hafta senin için ayrılır ve takvimde dolu görünür. Ders yeri ve başlangıç tarihini eğitmenle konuşarak netleştir.</p>
        </div>` : null}
    </div>`;
}

// ---------------------------------------------------------------------
// Dinletiler
// ---------------------------------------------------------------------
function Dinletiler({ me }) {
  const [data, setData] = useState(null);
  const [apply, setApply] = useState(null); // { d, i, ...form }
  const [busy, setBusy] = useState(false);
  const today = todayStr();

  const load = useCallback(async () => {
    const [{ data: settings }, { data: list }] = await Promise.all([
      sb.from('settings').select('id,prova_open_days,prova_max_per_week,dinleti_open_days').eq('id', 1).single(),
      sb.from('dinletiler').select('*').eq('active', true).gte('day', today).order('day').limit(6)
    ]);
    const ids = (list || []).map((d) => d.id);
    const { data: bookings } = ids.length
      ? await sb.from('dinleti_bookings').select('id,dinleti_id,slot_index,user_id,display_name,perf_type,status').in('dinleti_id', ids).neq('status', 'reddedildi')
      : { data: [] };
    setData({ settings: settings || { dinleti_open_days: 21 }, list: list || [], bookings: bookings || [] });
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!data) return html`<${Loading} />`;
  const uid = me && me.user.id;
  const gate = bookingGate(me);

  const open = (d, i) => {
    if (!gate.ok) return gateMessage(gate);
    setApply({ d, i, perf_type: 'Solo', performer: '', people_count: 1, members: '', repertoire: '', video_url: '', equipment: '', note: '' });
    setTimeout(() => { const el = document.getElementById('basvuru'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
  };
  const set = (k) => (e) => setApply({ ...apply, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!apply.repertoire.trim()) return toast('Çalacağın / söyleyeceğin parçaları yaz.', 'err');
    let video = apply.video_url.trim();
    if (video && !/^https?:\/\//i.test(video)) video = 'https://' + video;
    setBusy(true);
    const { data: row, error } = await sb.from('dinleti_bookings').insert({
      dinleti_id: apply.d.id, slot_index: apply.i, perf_type: apply.perf_type, performer: apply.performer.trim(),
      people_count: apply.perf_type === 'Grup' ? Math.max(2, +apply.people_count || 2) : (+apply.people_count || 1),
      members: apply.members.trim(), repertoire: apply.repertoire.trim(), video_url: video, equipment: apply.equipment.split(',').map((x) => x.trim()).filter(Boolean), note: apply.note.trim()
    }).select('id').single();
    if (error) { setBusy(false); toast(errMsg(error), 'err'); return load(); }
    await notifyDinleti('notify_request', row.id);
    setBusy(false);
    setApply(null);
    toast('Başvurun alındı! Yönetim kurulu seninle iletişime geçip değerlendirecek.');
    load();
  };
  const cancel = async (b) => {
    if (!confirm(b.status === 'onaylandi' ? 'Dinleti yerini iptal etmek istiyor musun?' : 'Başvurunu geri çekmek istiyor musun?')) return;
    const { error } = await sb.from('dinleti_bookings').delete().eq('id', b.id);
    if (error) return toast(errMsg(error), 'err');
    toast('İptal edildi.');
    load();
  };

  return html`
    <div class="stack-lg">
      <div class="stack">
        <h1 class="h page-h">Dinletiler</h1>
        <p class="muted measure">Sahneye çıkmak mı istiyorsun? Bir dinleti ve saat seç, başvuru formunu doldur. Başvurular <b class="ink">${data.settings.dinleti_open_days} gün önceden</b> açılır. Yönetim kurulu seninle iletişime geçip gerekirse bir video ister; onaylanınca yerin kesinleşir.</p>
      </div>

      ${apply ? html`
        <form id="basvuru" class="card pad-lg stack" onSubmit=${submit}>
          <div class="stack-xs">
            <span class="tag tag-red self-start">Dinleti başvurusu</span>
            <h2 class="h2">${fmtLong(apply.d.day)} · ${addMinutes(apply.d.start_time, apply.i * apply.d.slot_minutes)}</h2>
            <span class="muted small">${[apply.d.title, apply.d.venue].filter(Boolean).join(' · ')} · ${apply.d.slot_minutes} dakikalık performans</span>
          </div>
          <fieldset class="fs"><legend>Performans türü</legend>
            <div class="row">${['Solo', 'Grup', 'Akustik'].map((o) => html`<${Pill} on=${apply.perf_type === o} onClick=${() => setApply({ ...apply, perf_type: o, people_count: o === 'Grup' ? Math.max(2, +apply.people_count || 2) : apply.people_count })}>${o}<//>`)}</div>
          </fieldset>
          <div class="fgrid">
            <${Field} label="Sahne / grup adı" hint="Boş bırakırsan adın görünür"><input class="inp" maxlength="80" value=${apply.performer} onInput=${set('performer')} /><//>
            <${Field} label="Kaç kişisiniz?"><input class="inp" type="number" min="1" max="30" value=${apply.people_count} onInput=${set('people_count')} /><//>
          </div>
          ${+apply.people_count > 1 ? html`
            <${Field} label="Ekipte kimler var, kim ne çalıyor?"><textarea class="inp" rows="2" maxlength="500" value=${apply.members} onInput=${set('members')} placeholder="Örn. Ali – gitar, Ayşe – vokal, Can – davul"></textarea><//>` : null}
          <${Field} label="Çalacağın / söyleyeceğin parçalar *"><textarea class="inp" rows="3" maxlength="1000" required value=${apply.repertoire} onInput=${set('repertoire')} placeholder="Sanatçı – Şarkı adı (her satıra bir parça)"></textarea><//>
          <${Field} label="Video ya da kayıt linki" hint="Seni ya da grubunu çalarken gösteren bir YouTube, Instagram ya da Drive linki. Değerlendirmeyi hızlandırır."><input class="inp" type="url" inputmode="url" maxlength="500" value=${apply.video_url} onInput=${set('video_url')} placeholder="https://" /><//>
          <${Field} label="Kendi getireceğin ekipmanlar" hint="Topluluk ekipman sağlayamıyor; performans için gereken her şeyi kendin getirmelisin. Virgülle ayır."><input class="inp" maxlength="300" value=${apply.equipment} onInput=${set('equipment')} placeholder="Örn. akustik gitar, kendi mikrofonumuz, kablolar" /><//>
          <${Field} label="Eklemek istediğin bir şey var mı?"><textarea class="inp" rows="2" maxlength="1000" value=${apply.note} onInput=${set('note')}></textarea><//>
          <div class="row">
            <button type="submit" class="btn btn-red" disabled=${busy}>${busy ? 'Gönderiliyor…' : 'Başvuruyu gönder'}</button>
            <button type="button" class="btn btn-ghost" onClick=${() => setApply(null)}>Vazgeç</button>
          </div>
        </form>` : null}

      ${data.list.length === 0 ? html`<p class="muted">Yaklaşan dinleti tarihi henüz eklenmedi.</p>` : html`
        <div class="cards cards-wide">
          ${data.list.map((d) => {
            const opens = addDays(d.day, -data.settings.dinleti_open_days);
            const isOpen = today >= opens;
            const mineHere = data.bookings.find((x) => x.dinleti_id === d.id && x.user_id === uid);
            return html`
              <div class="card pad stack">
                <div class="row between"><h2 class="h2">${fmtLong(d.day)}</h2><span class=${'tag ' + (isOpen ? 'tag-red' : 'tag-cream')}>${isOpen ? 'Başvurular açık' : 'Henüz kapalı'}</span></div>
                <span class="muted small">${[d.title, d.venue, hhmm(d.start_time) + ' başlangıç', d.slot_minutes + ' dk / performans'].filter(Boolean).join(' · ')}</span>
                ${d.note ? html`<p class="muted small">${d.note}</p>` : null}
                ${isOpen ? html`
                  <div class="stack-sm">
                    ${Array.from({ length: d.slot_count }, (_, i) => {
                      const approved = data.bookings.find((x) => x.dinleti_id === d.id && x.slot_index === i && x.status === 'onaylandi');
                      const mine = mineHere && mineHere.slot_index === i ? mineHere : null;
                      const t = addMinutes(d.start_time, i * d.slot_minutes);
                      if (mine && mine.status === 'onaylandi') return html`<button type="button" class="dslot dslot-mine" onClick=${() => cancel(mine)}><b>${t}</b><span>Sen · ${mine.perf_type} · onaylandı</span></button>`;
                      if (approved) return html`<div class="dslot dslot-taken"><b>${t}</b><span>${approved.display_name} · ${approved.perf_type} <${UserTags} uid=${approved.user_id} /></span></div>`;
                      if (mine) return html`<button type="button" class="dslot dslot-pending" onClick=${() => cancel(mine)}><b>${t}</b><span>Başvurun değerlendiriliyor · geri çek</span></button>`;
                      if (mineHere) return html`<div class="dslot dslot-free"><b>${t}</b><span>Boş</span></div>`;
                      return html`<button type="button" class="dslot" onClick=${() => open(d, i)}><b>${t}</b><span>${gate.reason === 'login' ? 'Giriş yap ve başvur' : 'Boş · başvur'}</span></button>`;
                    })}
                  </div>` : html`<div class="locked locked-sm"><span class="strong">Başvurular ${fmtLong(opens)} açılır</span></div>`}
              </div>`;
          })}
        </div>`}
    </div>`;
}

// ---------------------------------------------------------------------
// Form (Open Mic vb.)
// ---------------------------------------------------------------------
function FormPage({ id, me }) {
  const [form, setForm] = useState(undefined);
  const [vals, setVals] = useState({});
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    sb.from('forms').select('*').eq('id', id).maybeSingle().then(({ data }) => setForm(data || null));
  }, [id]);
  useEffect(() => {
    if (!form || !me || !me.profile) return;
    const pre = {};
    form.fields.forEach((f) => {
      if (/ogrenci/.test(f.id) && me.profile.student_no) pre[f.id] = me.profile.student_no;
      if (/telefon/.test(f.id) && me.profile.phone) pre[f.id] = me.profile.phone;
      if (f.id === 'ad' && me.profile.full_name) pre[f.id] = me.profile.full_name;
    });
    setVals((v) => ({ ...pre, ...v }));
  }, [form, me && me.user.id]);

  if (form === undefined) return html`<${Loading} />`;
  if (!form) return html`<p class="muted">Form bulunamadı.</p>`;

  const set = (k, v) => setVals((x) => ({ ...x, [k]: v }));
  const toggleMulti = (k, o) => setVals((x) => { const a = new Set(x[k] || []); a.has(o) ? a.delete(o) : a.add(o); return { ...x, [k]: Array.from(a) }; });

  const submit = async (e) => {
    e.preventDefault();
    for (const f of form.fields) {
      const v = vals[f.id];
      if (f.required && (v == null || v === '' || (Array.isArray(v) && v.length === 0))) return toast('"' + f.label + '" alanını doldur.', 'err');
    }
    setBusy(true);
    const { error } = await sb.from('form_responses').insert({ form_id: form.id, data: vals });
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    setSent(true);
    window.scrollTo(0, 0);
  };

  return html`
    <div class="split">
      <div class="stack split-side">
        <span class="tag tag-dark self-start">Başvuru formu</span>
        <h1 class="h page-h">${form.title}</h1>
        ${form.description ? html`<p class="muted">${form.description}</p>` : null}
      </div>
      <div class="card pad-lg split-main">
        ${!form.is_open ? html`<div class="stack"><h2 class="h2">Başvurular kapandı</h2><p class="muted">Bu form şu an başvuru kabul etmiyor.</p></div>`
        : sent ? html`
          <div class="stack">
            <h2 class="h2">Başvurun alındı</h2>
            <p class="muted">Teşekkürler! Gerekirse seninle iletişime geçeceğiz.</p>
            <button type="button" class="btn btn-ghost self-start" onClick=${() => { setVals({}); setSent(false); }}>Yeni başvuru</button>
          </div>` : html`
          <form class="stack" onSubmit=${submit}>
            ${form.fields.map((f) => {
              const v = vals[f.id];
              const label = f.label + (f.required ? ' *' : '');
              if (f.type === 'radio') return html`
                <fieldset class="fs"><legend>${label}</legend>
                  <div class="row">${(f.options || []).map((o) => html`<${Pill} on=${v === o} onClick=${() => set(f.id, o)}>${o}<//>`)}</div>
                </fieldset>`;
              if (f.type === 'checkbox') return html`
                <fieldset class="fs"><legend>${label}</legend>
                  <div class="row">${(f.options || []).map((o) => html`
                    <label class="check"><input type="checkbox" checked=${(v || []).includes(o)} onChange=${() => toggleMulti(f.id, o)} />${o}</label>`)}
                  </div>
                </fieldset>`;
              if (f.type === 'select') return html`
                <${Field} label=${label}><select class="inp" value=${v || ''} onChange=${(e) => set(f.id, e.target.value)}>
                  <option value="">Seç…</option>${(f.options || []).map((o) => html`<option value=${o}>${o}</option>`)}
                </select><//>`;
              if (f.type === 'textarea') return html`<${Field} label=${label}><textarea class="inp" rows="3" value=${v || ''} onInput=${(e) => set(f.id, e.target.value)}></textarea><//>`;
              return html`<${Field} label=${label}><input class="inp" type=${f.type === 'number' ? 'number' : f.type === 'tel' ? 'tel' : 'text'} value=${v || ''} onInput=${(e) => set(f.id, e.target.value)} /><//>`;
            })}
            <button type="submit" class="btn btn-red self-start" disabled=${busy}>Başvuruyu gönder</button>
          </form>`}
      </div>
    </div>`;
}

// ---------------------------------------------------------------------
// Giriş ve kayıt
// ---------------------------------------------------------------------
function Giris({ me }) {
  const [no, setNo] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const next = () => { let n = null; try { n = sessionStorage.getItem('bumt_after_login'); sessionStorage.removeItem('bumt_after_login'); } catch (e) {} go(n || '/'); };
  useEffect(() => { if (me) next(); }, [me]);
  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    const fd = new FormData(e.currentTarget);
    const num = String(fd.get('username') || no).replace(/\D/g, '');
    const pass = String(fd.get('password') || pw);
    const { error } = await signIn(memberEmail(num), pass);
    setBusy(false);
    if (error) return setErr(errMsg(error));
    toast('Hoş geldin!');
    next();
  };
  return html`
    <div class="login-wrap">
      <form class="card pad-lg stack login-card" onSubmit=${submit}>
        <h1 class="h page-h">Giriş yap</h1>
        <p class="muted">Öğrenci numaran ve şifrenle giriş yap.</p>
        <${Field} label="Öğrenci numarası"><input class="inp" name="username" inputmode="numeric" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required value=${no} onInput=${(e) => setNo(e.target.value)} /><//>
        <${Field} label="Şifre"><${PasswordInput} value=${pw} onInput=${(e) => setPw(e.target.value)} /><//>
        ${err ? html`<p class="form-err" role="alert">${err}</p>` : null}
        <button type="submit" class="btn btn-red" disabled=${busy}>${busy ? 'Giriş yapılıyor…' : 'Giriş yap'}</button>
        <p class="small">Hesabın yok mu? <a href="#/kayit">Üye ol</a></p>
        <p class="small"><a href="#/sifre">Şifremi unuttum</a></p>
      </form>
      <aside class="admin-entry">
        <span class="h admin-entry-h">Yönetim</span>
        <p>Yönetim kurulu üyeleri ve yetkililer için ayrı giriş.</p>
        <a class="btn btn-cream" href="/yonetim/">Yönetim girişi →</a>
      </aside>
    </div>`;
}

function Kayit({ me }) {
  const [f, setF] = useState({ full_name: '', student_no: '', phone: '', contact_email: '', faculty: '', department: '', class_year: '1. sınıf', member_type: 'muzisyen', instruments: [], password: '', password2: '', kvkk: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const toggleInst = (i) => setF({ ...f, instruments: f.instruments.includes(i) ? f.instruments.filter((x) => x !== i) : [...f.instruments, i] });

  if (me && !done) return html`<div class="stack"><h1 class="h page-h">Zaten giriş yaptın</h1><a class="btn btn-ghost self-start" href="#/profil">Profilime git</a></div>`;
  if (done) return html`
    <div class="card pad-lg stack narrow">
      <span class="tag tag-cream self-start">Onay bekliyor</span>
      <h1 class="h2">Kaydın alındı</h1>
      <p class="muted">Yönetim kurulu öğrenci numaranı kontrol edip hesabını onaylayacak. Onaylanınca prova, kurs ve dinleti rezervasyonu yapabilirsin.</p>
      <a class="btn btn-ghost self-start" href="#/">Ana sayfaya dön</a>
    </div>`;

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const no = f.student_no.trim().replace(/\s+/g, '');
    if (!/^[0-9]{4,20}$/.test(no)) return setErr('Öğrenci numarası sadece rakamlardan oluşmalı.');
    if (!f.faculty) return setErr('Fakülteni listeden seç.');
    if (f.password.length < 6) return setErr('Şifre en az 6 karakter olmalı.');
    if (f.password !== f.password2) return setErr('Şifreler aynı değil.');
    if (f.member_type === 'muzisyen' && f.instruments.length === 0) return setErr('Ne çaldığını / söylediğini seç.');
    if (!f.kvkk) return setErr('Devam etmek için KVKK metnini onaylamalısın.');
    setBusy(true);
    const { data, error } = await sb.auth.signUp({
      email: memberEmail(no), password: f.password,
      options: { data: {
        full_name: f.full_name.trim(), phone: f.phone.trim(), contact_email: f.contact_email.trim(),
        faculty: f.faculty, department: f.department.trim(), class_year: f.class_year, member_type: f.member_type,
        instruments: f.member_type === 'muzisyen' ? f.instruments : [], kvkk: true
      } }
    });
    setBusy(false);
    if (error) return setErr(errMsg(error));
    if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return setErr('Bu öğrenci numarasıyla zaten bir hesap var. Giriş yapmayı dene.');
    setDone(true);
    window.scrollTo(0, 0);
  };

  return html`
    <div class="split">
      <div class="stack split-side">
        <h1 class="h page-h">Üye ol</h1>
        <p class="muted">Kısa bir form. Öğrenci numaranı topluluk üye listesiyle karşılaştırıp hesabını onaylıyoruz; onaydan sonra prova, kurs ve dinleti rezervasyonu yapabilirsin.</p>
        <p class="small">Zaten hesabın var mı? <a href="#/giris">Giriş yap</a></p>
      </div>
      <form class="card pad-lg stack split-main" onSubmit=${submit}>
        <div class="fgrid">
          <${Field} label="Ad Soyad"><input class="inp" required autocomplete="name" value=${f.full_name} onInput=${set('full_name')} /><//>
          <${Field} label="Öğrenci numarası" hint="Giriş yaparken bunu kullanacaksın"><input class="inp" required inputmode="numeric" value=${f.student_no} onInput=${set('student_no')} /><//>
          <${Field} label="Telefon (WhatsApp)"><input class="inp" type="tel" required autocomplete="tel" value=${f.phone} onInput=${set('phone')} placeholder="05xx xxx xx xx" /><//>
          <${Field} label="E-posta" hint="Şifreni unutursan sıfırlama linki buraya gelir"><input class="inp" type="email" required autocomplete="email" value=${f.contact_email} onInput=${set('contact_email')} /><//>
          <${Field} label="Fakülte"><${FacultySelect} required value=${f.faculty} onChange=${(v) => setF({ ...f, faculty: v })} /><//>
          <${Field} label="Bölüm"><input class="inp" required value=${f.department} onInput=${set('department')} placeholder="ör. Bilgisayar Mühendisliği" /><//>
          <${Field} label="Sınıf"><select class="inp" value=${f.class_year} onChange=${set('class_year')}>${CLASS_YEARS.map((c) => html`<option>${c}</option>`)}</select><//>
        </div>
        <fieldset class="fs"><legend>Toplulukta ne olarak varsın?</legend>
          <div class="row">
            <${Pill} on=${f.member_type === 'dinleyici'} onClick=${() => setF({ ...f, member_type: 'dinleyici' })}>Dinleyici<//>
            <${Pill} on=${f.member_type === 'muzisyen'} onClick=${() => setF({ ...f, member_type: 'muzisyen' })}>Müzisyen<//>
          </div>
        </fieldset>
        ${f.member_type === 'muzisyen' ? html`
          <fieldset class="fs"><legend>Ne çalıyor / söylüyorsun? (birden fazla seçebilirsin)</legend>
            <div class="row">${INSTRUMENTS.map((i) => html`<${Pill} on=${f.instruments.includes(i)} onClick=${() => toggleInst(i)}>${i}<//>`)}</div>
          </fieldset>` : null}
        <div class="fgrid">
          <${Field} label="Şifre" hint="En az 6 karakter"><input class="inp" type="password" required autocomplete="new-password" value=${f.password} onInput=${set('password')} /><//>
          <${Field} label="Şifre (tekrar)"><input class="inp" type="password" required autocomplete="new-password" value=${f.password2} onInput=${set('password2')} /><//>
        </div>
        <label class="check check-top"><input type="checkbox" checked=${f.kvkk} onChange=${set('kvkk')} /><span>Kişisel verilerimin <a href="#/kvkk" target="_blank">KVKK aydınlatma metni</a> kapsamında topluluk üyeliği için işlenmesini kabul ediyorum.</span></label>
        ${err ? html`<p class="form-err" role="alert">${err}</p>` : null}
        <button type="submit" class="btn btn-red self-start" disabled=${busy}>${busy ? 'Gönderiliyor…' : 'Kaydı gönder'}</button>
      </form>
    </div>`;
}

// ---------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------
function Profil({ me, refresh }) {
  const [f, setF] = useState(null);
  const [mine, setMine] = useState(null);
  const [pw, setPw] = useState({ a: '', b: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (me === null) go('/giris');
    if (!me || !me.profile) return;
    const p = me.profile;
    setF({ full_name: p.full_name, phone: p.phone, contact_email: p.contact_email, ...(HAS_FACULTY ? { faculty: p.faculty || '' } : {}), department: p.department, class_year: p.class_year || '1. sınıf', member_type: p.member_type, instruments: p.instruments || [], bio: p.bio || '' });
    loadMine();
  }, [me && me.user.id]);

  const loadMine = async () => {
    const uid = me.user.id;
    const today = todayStr();
    const [{ data: pv }, { data: ls }, { data: dn }] = await Promise.all([
      sb.from('prova_bookings').select('id,day,status,prova_slots(start_time,end_time)').eq('user_id', uid).gte('day', today).neq('status', 'reddedildi').order('day'),
      sb.from('lesson_bookings').select('id,weekday,hour,status,instructors(full_name,instrument)').eq('user_id', uid).neq('status', 'reddedildi'),
      sb.from('dinleti_bookings').select('id,slot_index,perf_type,status,dinletiler(day,start_time,slot_minutes)').eq('user_id', uid).neq('status', 'reddedildi')
    ]);
    setMine({ pv: pv || [], ls: ls || [], dn: (dn || []).filter((d) => d.dinletiler && d.dinletiler.day >= today) });
  };

  if (!me || !f) return html`<${Loading} />`;
  const p = me.profile;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleInst = (i) => setF({ ...f, instruments: f.instruments.includes(i) ? f.instruments.filter((x) => x !== i) : [...f.instruments, i] });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await sb.from('profiles').update({ ...f, instruments: f.member_type === 'muzisyen' ? f.instruments : [] }).eq('id', me.user.id);
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    toast('Profilin güncellendi.');
    refresh();
  };
  const [photoBusy, setPhotoBusy] = useState(false);
  const onPhoto = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    try {
      const url = await uploadAvatar(file, me.user.id);
      const { error } = await sb.from('profiles').update({ avatar_url: url }).eq('id', me.user.id);
      if (error) throw error;
      toast('Profil fotoğrafın güncellendi.');
      refresh();
    } catch (err) { toast(errMsg(err), 'err'); }
    setPhotoBusy(false);
  };
  const removePhoto = async () => {
    if (!confirm('Profil fotoğrafın kaldırılsın mı?')) return;
    await sb.storage.from('avatars').remove([me.user.id + '/avatar.jpg']);
    const { error } = await sb.from('profiles').update({ avatar_url: '' }).eq('id', me.user.id);
    if (error) return toast(errMsg(error), 'err');
    toast('Fotoğraf kaldırıldı.');
    refresh();
  };
  const changePw = async (e) => {
    e.preventDefault();
    if (pw.a.length < 6) return toast('Şifre en az 6 karakter olmalı.', 'err');
    if (pw.a !== pw.b) return toast('Şifreler aynı değil.', 'err');
    const { error } = await sb.auth.updateUser({ password: pw.a });
    if (error) return toast(errMsg(error), 'err');
    setPw({ a: '', b: '' });
    toast('Şifren değiştirildi.');
  };
  const del = async (table, id) => {
    if (!confirm('Bu kaydı iptal etmek istiyor musun?')) return;
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) return toast(errMsg(error), 'err');
    toast('İptal edildi.');
    loadMine();
  };
  const statusTag = { bekliyor: ['tag-cream', 'Onay bekliyor'], onaylandi: ['tag-dark', 'Onaylı üye'], reddedildi: ['tag-red', 'Onaylanmadı'] }[p.status];

  return html`
    <div class="stack-lg">
      <div class="row between">
        <div class="stack-xs">
          <h1 class="h page-h">Profilim</h1>
          <span class="muted">${p.student_no ? 'Öğrenci no: ' + p.student_no : 'Kullanıcı adı: ' + (p.username || '')}</span>
          <${SchoolLine} p=${p} />
        </div>
        <div class="row-sm"><${UserTags} uid=${p.id} /><span class=${'tag ' + statusTag[0]}>${statusTag[1]}</span></div>
      </div>

      <div class="card pad row photo-card">
        <${Avatar} url=${p.avatar_url} name=${p.full_name} size=${112} />
        <div class="stack">
          <div class="stack-xs">
            <b>Profil fotoğrafın</b>
            <span class="muted small">Eğitmenler, öğrenciler ve grup arkadaşların buluştuğunuzda seni tanısın. Yüzünün net göründüğü bir fotoğraf seç.</span>
          </div>
          <div class="row">
            <label class="btn btn-dark file-btn">${photoBusy ? 'Yükleniyor…' : p.avatar_url ? 'Fotoğrafı değiştir' : 'Fotoğraf yükle'}<input type="file" accept="image/*" onChange=${onPhoto} disabled=${photoBusy} /></label>
            ${p.avatar_url ? html`<button type="button" class="btn btn-ghost" onClick=${removePhoto}>Kaldır</button>` : null}
            ${p.status === 'onaylandi' && !p.is_staff ? html`<a class="btn btn-ghost" href=${'#/uye/' + p.id}>Profilimi gör</a>` : null}
          </div>
        </div>
      </div>
      <${ScanCard} />
      <div class="card pad stack">
        <h2 class="h2">Rezervasyonlarım</h2>
        ${!mine ? html`<${Loading} />` : (mine.pv.length + mine.ls.length + mine.dn.length) === 0 ? html`<p class="muted">Aktif rezervasyonun yok.</p>` : html`
          <ul class="list">
            ${mine.pv.map((r) => html`<li><span><b>Prova odası</b> · ${fmtLong(r.day)} · ${hhmm(r.prova_slots && r.prova_slots.start_time)}–${hhmm(r.prova_slots && r.prova_slots.end_time)} · ${r.status === 'onaylandi' ? html`<span class="tag tag-dark">Onaylandı</span>` : html`<span class="tag tag-cream">Onay bekliyor</span>`}</span><button type="button" class="link-btn" onClick=${() => del('prova_bookings', r.id)}>İptal</button></li>`)}
            ${mine.ls.map((r) => html`<li><span><b>${r.instructors ? r.instructors.instrument + ' dersi' : 'Ders'}</b> · ${r.instructors ? r.instructors.full_name : ''} · her ${DAY_NAMES[r.weekday]} ${r.hour}:00 · ${r.status === 'onaylandi' ? html`<span class="tag tag-dark">Onaylandı</span>` : html`<span class="tag tag-cream">Onay bekliyor</span>`}</span><button type="button" class="link-btn" onClick=${() => del('lesson_bookings', r.id)}>İptal</button></li>`)}
            ${mine.dn.map((r) => html`<li><span><b>Dinleti</b> · ${fmtLong(r.dinletiler.day)} · ${addMinutes(r.dinletiler.start_time, r.slot_index * r.dinletiler.slot_minutes)} · ${r.perf_type} · ${r.status === 'onaylandi' ? html`<span class="tag tag-dark">Onaylandı</span>` : html`<span class="tag tag-cream">Değerlendiriliyor</span>`}</span><button type="button" class="link-btn" onClick=${() => del('dinleti_bookings', r.id)}>İptal</button></li>`)}
          </ul>`}
      </div>

      <form class="card pad stack" onSubmit=${save}>
        <h2 class="h2">Bilgilerim</h2>
        <div class="fgrid">
          <${Field} label="Ad Soyad"><input class="inp" required value=${f.full_name} onInput=${set('full_name')} /><//>
          <${Field} label="Telefon (WhatsApp)"><input class="inp" type="tel" value=${f.phone} onInput=${set('phone')} /><//>
          <${Field} label="E-posta" hint=${f.contact_email ? 'Şifre sıfırlama linki buraya gelir' : 'E-posta eklemezsen şifreni unuttuğunda sıfırlayamazsın'}><input class="inp" type="email" value=${f.contact_email} onInput=${set('contact_email')} /><//>
          ${HAS_FACULTY ? html`<${Field} label="Fakülte"><${FacultySelect} value=${f.faculty} onChange=${(v) => setF({ ...f, faculty: v })} /><//>` : null}
          <${Field} label="Bölüm"><input class="inp" value=${f.department} onInput=${set('department')} /><//>
          <${Field} label="Sınıf"><select class="inp" value=${f.class_year} onChange=${set('class_year')}>${CLASS_YEARS.map((c) => html`<option>${c}</option>`)}</select><//>
        </div>
        <${Field} label="Hakkımda" hint="Kısa bir tanıtım: ne çalıyorsun, hangi tarzları seviyorsun, neler yapmak istiyorsun…"><textarea class="inp" rows="3" maxlength="500" value=${f.bio} onInput=${set('bio')}></textarea><//>
        <fieldset class="fs"><legend>Toplulukta</legend>
          <div class="row">
            <${Pill} on=${f.member_type === 'dinleyici'} onClick=${() => setF({ ...f, member_type: 'dinleyici' })}>Dinleyici<//>
            <${Pill} on=${f.member_type === 'muzisyen'} onClick=${() => setF({ ...f, member_type: 'muzisyen' })}>Müzisyen<//>
          </div>
        </fieldset>
        ${f.member_type === 'muzisyen' ? html`
          <fieldset class="fs"><legend>Enstrüman / vokal</legend>
            <div class="row">${INSTRUMENTS.map((i) => html`<${Pill} on=${f.instruments.includes(i)} onClick=${() => toggleInst(i)}>${i}<//>`)}</div>
          </fieldset>` : null}
        <button type="submit" class="btn btn-dark self-start" disabled=${busy}>Kaydet</button>
      </form>

      <form class="card pad stack" onSubmit=${changePw}>
        <h2 class="h2">Şifre değiştir</h2>
        <div class="fgrid">
          <${Field} label="Yeni şifre"><input class="inp" type="password" autocomplete="new-password" value=${pw.a} onInput=${(e) => setPw({ ...pw, a: e.target.value })} /><//>
          <${Field} label="Yeni şifre (tekrar)"><input class="inp" type="password" autocomplete="new-password" value=${pw.b} onInput=${(e) => setPw({ ...pw, b: e.target.value })} /><//>
        </div>
        <button type="submit" class="btn btn-ghost self-start">Şifreyi değiştir</button>
      </form>
    </div>`;
}

// ---------------------------------------------------------------------
// Eğitmen paneli
// ---------------------------------------------------------------------
function Egitmen({ me, refresh }) {
  const [f, setF] = useState(null);
  useEffect(() => {
    if (me === null) go('/giris');
    if (me && me.instructor) setF({ phone: me.instructor.phone, email: me.instructor.email || '', bio: me.instructor.bio });
  }, [me && me.user.id, me && me.instructor && me.instructor.id]);
  if (me === undefined) return html`<${Loading} />`;
  if (!me || !me.instructor) return html`<div class="locked"><h1 class="h2">Eğitmen paneli</h1><p class="muted">Bu sayfa eğitmen olarak eklenmiş üyeler içindir. Eğitmen olmak istiyorsan yönetim kuruluna yaz.</p></div>`;
  const ins = me.instructor;
  const toggleActive = async () => {
    const { error } = await sb.from('instructors').update({ active: !ins.active }).eq('id', ins.id);
    if (error) return toast(errMsg(error), 'err');
    toast(ins.active ? 'Kurslar sayfasından gizlendin.' : 'Artık Kurslar sayfasında görünüyorsun.');
    refresh();
  };
  const save = async (e) => {
    e.preventDefault();
    const { error } = await sb.from('instructors').update({ phone: f.phone, email: f.email.trim(), bio: f.bio }).eq('id', ins.id);
    if (error) return toast(errMsg(error), 'err');
    toast('Bilgilerin güncellendi.');
    refresh();
  };
  return html`
    <div class="stack-lg">
      <div class="stack-xs">
        <span class="tag tag-dark self-start">Eğitmen paneli</span>
        <h1 class="h page-h">Takvimim ve taleplerim</h1>
        <div class="row nowrap"><${Avatar} url=${ins.avatar_url} name=${ins.full_name} size=${56} /><span class="muted">${ins.full_name} · ${ins.instrument} · ${ins.kind}${!ins.avatar_url ? html` · <a href="#/profil">Profil fotoğrafı ekle</a>, öğrenciler seni tanısın` : ''}</span></div>
      </div>
      <div class=${'card pad row between ' + (ins.active ? '' : 'card-off')}>
        <div class="stack-xs">
          <b>${ins.active ? 'Kurslar sayfasında listeleniyorsun' : 'Şu an listede gizlisin'}</b>
          <span class="muted small">${ins.active ? 'Öğrenciler seni görüp takviminden talep gönderebilir.' : 'Öğrenciler seni Kurslar sayfasında görmez, yeni talep gelmez. Mevcut derslerin etkilenmez.'}</span>
        </div>
        <button type="button" class=${'btn ' + (ins.active ? 'btn-ghost' : 'btn-red')} onClick=${toggleActive}>${ins.active ? 'Listeden gizle' : 'Listede görün'}</button>
      </div>
      <div class="card pad"><${InstructorScheduleEditor} instructor=${ins} /></div>
      ${f ? html`
        <form class="card pad stack" onSubmit=${save}>
          <h2 class="h2">Öğrencilerin göreceği bilgiler</h2>
          <${Field} label="Talep bildirimleri için e-postan" hint="Yeni ders talepleri bu adrese gelir"><input class="inp" type="email" value=${f.email} onInput=${(e) => setF({ ...f, email: e.target.value })} /><//>
          <${Field} label="WhatsApp numaran" hint="Sadece giriş yapmış üyeler görür"><input class="inp" type="tel" value=${f.phone} onInput=${(e) => setF({ ...f, phone: e.target.value })} /><//>
          <${Field} label="Kısa tanıtım"><textarea class="inp" rows="3" maxlength="300" value=${f.bio} onInput=${(e) => setF({ ...f, bio: e.target.value })} placeholder="Örn. 8 yıldır keman çalıyorum, başlangıç seviyesine ders veriyorum."></textarea><//>
          <button type="submit" class="btn btn-dark self-start">Kaydet</button>
        </form>` : null}
    </div>`;
}

// ---------------------------------------------------------------------
// Prova yoklaması (QR)
// ---------------------------------------------------------------------
function ScanCard() {
  const [open, setOpen] = useState(false);
  const onResult = (text) => {
    setOpen(false);
    const code = yoklamaCode(text);
    if (!code) return toast('Bu bir BÜMT prova odası QR kodu değil.', 'err');
    go('/yoklama/' + code);
  };
  return html`
    <div class="card pad row between scan-card">
      <div class="stack-xs">
        <b>Provaya geldin mi?</b>
        <span class="muted small">Prova odasındaki QR kodu girerken ve çıkarken okut. Telefonunun kamera uygulamasıyla da okutabilirsin.</span>
      </div>
      <button type="button" class="btn btn-dark" onClick=${() => setOpen(true)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/></svg>
        QR okut
      </button>
      ${open ? html`<${QrScanner} onResult=${onResult} onClose=${() => setOpen(false)} />` : null}
    </div>`;
}

function Yoklama({ code, me }) {
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [key, setKey] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState([null, null, null]);
  const setPhoto = (i) => (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const next = photos.slice(); next[i] = { file: f, url: URL.createObjectURL(f) }; setPhotos(next);
  };
  useEffect(() => {
    if (me === undefined) return;
    if (!me) {
      try { sessionStorage.setItem('bumt_after_login', '/yoklama/' + code); } catch (e) {}
      toast('Yoklama için önce giriş yap.');
      go('/giris');
      return;
    }
    setErr(''); setRes(null);
    sb.rpc('prova_scan', { p_code: code }).then(({ data, error }) => { if (error) setErr(errMsg(error)); else setRes(data); });
  }, [me && me.user.id, code]);

  const checkout = async (e) => {
    e.preventDefault();
    if (photos.some((x) => !x)) return toast('Odanın 3 fotoğrafını da çekmelisin.', 'err');
    if (!key) return toast('Çıkış için anahtarı bıraktığını onaylamalısın.', 'err');
    setBusy(true);
    try {
      const folder = me.user.id + '/' + todayStr() + '-' + Math.random().toString(36).slice(2, 10);
      const paths = [];
      for (let i = 0; i < 3; i++) {
        const blob = await compressImage(photos[i].file, 1600);
        const path = folder + '/' + (i + 1) + '.jpg';
        const { error: ue } = await sb.storage.from('prova-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (ue) throw ue;
        paths.push(path);
      }
      const { data, error } = await sb.rpc('prova_checkout', { p_code: code, p_key_returned: key, p_note: note.trim(), p_photos: paths });
      if (error) throw error;
      setRes(data);
    } catch (x) { toast(errMsg(x), 'err'); }
    setBusy(false);
  };

  const slot = res && res.start_time ? hhmm(res.start_time) + '–' + hhmm(res.end_time) : '';
  return html`
    <div class="card pad-lg stack narrow yoklama">
      <span class="tag tag-dark self-start">Prova odası yoklaması</span>
      ${err ? html`
        <h1 class="h2">Kayıt yapılamadı</h1>
        <p class="form-err">${err}</p>
        <a class="btn btn-ghost self-start" href="#/prova">Prova odası sayfası</a>`
      : !res ? html`<${Loading} />`
      : res.state === 'checked_in' ? html`
        <div class="big-ok" aria-hidden="true">✓</div>
        <h1 class="h2">Giriş kaydedildi · ${timeTR(res.check_in_at)}</h1>
        <p class="muted">Rezervasyonun: bugün ${slot}. İyi provalar! Çıkarken aynı QR kodu tekrar okutmayı unutma.</p>`
      : res.state === 'needs_checkout' ? html`
        <h1 class="h2">Çıkış yapıyorsun</h1>
        <p class="muted">Giriş saatin: <b class="ink">${timeTR(res.check_in_at)}</b> · Rezervasyonun: ${slot}</p>
        <form class="stack" onSubmit=${checkout}>
          <div class="stack-sm">
            <b>1. Odanın 3 fotoğrafını çek</b>
            <span class="muted small">Odanın genel görünümü, ekipmanların durumu ve zemin görünsün. Fotoğraflar yönetim kurulunun kontrolünden sonra silinir.</span>
            <div class="photo-grid">
              ${[0, 1, 2].map((i) => html`
                <label class=${'photo-slot ' + (photos[i] ? 'photo-on' : '')}>
                  ${photos[i] ? html`<img src=${photos[i].url} alt=${(i + 1) + '. fotoğraf'} />` : html`<span><b>+</b>${i + 1}. fotoğraf</span>`}
                  <input type="file" accept="image/*" capture="environment" onChange=${setPhoto(i)} />
                </label>`)}
            </div>
          </div>
          <b>2. Anahtarı teslim et</b>
          <label class="check check-top key-check"><input type="checkbox" checked=${key} onChange=${(e) => setKey(e.target.checked)} /><span><b>Anahtarı bıraktım / teslim ettim.</b></span></label>
          <label class="lbl"><span>Not (isteğe bağlı)</span><textarea class="inp" rows="2" maxlength="300" value=${note} onInput=${(e) => setNote(e.target.value)} placeholder="Örn. Anahtarı güvenlik görevlisine bıraktım. Odada bir sorun varsa buraya yaz."></textarea></label>
          <button type="submit" class="btn btn-red self-start" disabled=${busy || !key || photos.some((x) => !x)}>${busy ? 'Fotoğraflar yükleniyor…' : 'Çıkışı kaydet'}</button>
        </form>`
      : html`
        <div class="big-ok" aria-hidden="true">✓</div>
        <h1 class="h2">Çıkış kaydedildi${res.check_out_at ? ' · ' + timeTR(res.check_out_at) : ''}</h1>
        <p class="muted">Giriş: ${timeTR(res.check_in_at)} · Çıkış: ${timeTR(res.check_out_at)}. Teşekkürler, görüşmek üzere!</p>`}
    </div>`;
}

// ---------------------------------------------------------------------
// Müzisyen pazarı
// ---------------------------------------------------------------------
const POST_KINDS = ['Grup kuruyorum', 'Gruba katılmak istiyorum', 'Müzisyen arıyorum', 'Diğer'];

function Pazar({ me }) {
  const [posts, setPosts] = useState(null);
  const [filter, setFilter] = useState('Tümü');
  const [form, setForm] = useState(null);
  const uid = me && me.user.id;
  const approved = me && me.profile && me.profile.status === 'onaylandi';
  const isMusician = me && me.profile && me.profile.member_type === 'muzisyen';
  const canModerate = me && me.can && me.can('uyeler');

  const load = useCallback(async () => {
    let { data, error } = await sb.from('market_posts').select(MARKET_COLS + ',review,review_reason').eq('active', true).order('created_at', { ascending: false });
    if (error && /review/.test(error.message || '')) ({ data, error } = await sb.from('market_posts').select(MARKET_COLS).eq('active', true).order('created_at', { ascending: false }));
    if (error) toast(errMsg(error), 'err');
    setPosts(data || []);
    // Kontrolü yarım kalmış kendi ilanların varsa tekrar kontrol ettir
    (data || []).filter((p) => p.review === 'kontrol' && p.user_id === uid).forEach((p) => checkPost(p.id, false).then(() => setTimeout(load, 300)));
  }, [uid]);
  useEffect(() => { load(); }, [load]);
  if (!posts) return html`<${Loading} />`;

  const roles = ['Tümü', ...Array.from(new Set(posts.flatMap((p) => p.looking_for || [])))];
  const shown = posts.filter((p) => filter === 'Tümü' || (p.looking_for || []).includes(filter));

  const newPost = () => {
    if (!me) return go('/giris');
    if (!approved) return toast('İlan vermek için üyeliğinin onaylanması gerekiyor.', 'err');
    if (!isMusician) return toast('İlanı müzisyen üyeler verebilir. Profilinden "Müzisyen" seçebilirsin.', 'err');
    setForm({ kind: POST_KINDS[0], title: '', my_role: (me.profile.instruments || []).join(', '), looking_for: [], genre: '', description: '' });
    setTimeout(() => { const el = document.getElementById('ilan-form'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
  };
  const save = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast('İlana bir başlık yaz.', 'err');
    const row = { kind: form.kind, title: form.title.trim(), my_role: form.my_role.trim(), looking_for: form.looking_for, genre: form.genre.trim(), description: form.description.trim() };
    const { data, error } = form.id ? await sb.from('market_posts').update(row).eq('id', form.id).select('id').single() : await sb.from('market_posts').insert(row).select('id').single();
    if (error) return toast(errMsg(error), 'err');
    setForm(null);
    toast('İlanın kontrol ediliyor…');
    const r = await checkPost(data.id, !form.id);
    if (r && r.status === 'incelemede') toast('İlanın uygunsuz ifade içeriyor olabilir; yönetim kontrol ettikten sonra yayınlanacak.', 'err');
    else toast(form.id ? 'İlanın güncellendi.' : 'İlanın yayında!');
    load();
  };
  const close = async (p, moderate) => {
    if (!confirm(moderate ? 'Bu ilan kaldırılsın mı?' : 'İlanını kapatmak istiyor musun? Artık listede görünmez.')) return;
    const { error } = await sb.from('market_posts').update({ active: false }).eq('id', p.id);
    if (error) return toast(errMsg(error), 'err');
    toast('İlan kaldırıldı.');
    load();
  };
  const publish = async (p) => {
    const { error } = await sb.from('market_posts').update({ review: '', review_reason: '' }).eq('id', p.id);
    if (error) return toast(errMsg(error), 'err');
    toast('İlan yayına alındı.');
    load();
  };
  const toggleRole = (r) => setForm({ ...form, looking_for: form.looking_for.includes(r) ? form.looking_for.filter((x) => x !== r) : [...form.looking_for, r] });

  return html`
    <div class="stack-lg">
      <div class="row between">
        <div class="stack">
          <h1 class="h page-h">Müzisyen pazarı</h1>
          <p class="muted measure">Grup mu kuruyorsun, gruba mı katılmak istiyorsun? İlanını ver, aradığın müzisyenleri bul. İletişim bilgileri sadece onaylı üyelere görünür.</p>
        </div>
        <button type="button" class="btn btn-red" onClick=${newPost}>+ İlan ver</button>
      </div>

      ${form ? html`
        <form id="ilan-form" class="card pad-lg stack" onSubmit=${save}>
          <h2 class="h2">${form.id ? 'İlanı düzenle' : 'Yeni ilan'}</h2>
          <fieldset class="fs"><legend>İlan türü</legend>
            <div class="row">${POST_KINDS.map((k) => html`<${Pill} on=${form.kind === k} onClick=${() => setForm({ ...form, kind: k })}>${k}<//>`)}</div>
          </fieldset>
          <div class="fgrid">
            <${Field} label="Başlık"><input class="inp" required maxlength="80" value=${form.title} onInput=${(e) => setForm({ ...form, title: e.target.value })} placeholder="Örn. Alternatif rock grubu kuruyoruz" /><//>
            <${Field} label="Ben…" hint="Ne çalıyor / söylüyorsun?"><input class="inp" maxlength="80" value=${form.my_role} onInput=${(e) => setForm({ ...form, my_role: e.target.value })} placeholder="Vokal" /><//>
            <${Field} label="Tarz (isteğe bağlı)"><input class="inp" maxlength="80" value=${form.genre} onInput=${(e) => setForm({ ...form, genre: e.target.value })} placeholder="Rock, caz, Türkçe pop…" /><//>
          </div>
          <fieldset class="fs"><legend>Aradığın müzisyenler</legend>
            <div class="row">${INSTRUMENTS.map((r) => html`<${Pill} on=${form.looking_for.includes(r)} onClick=${() => toggleRole(r)}>${r}<//>`)}</div>
          </fieldset>
          <${Field} label="Açıklama"><textarea class="inp" rows="4" maxlength="1000" value=${form.description} onInput=${(e) => setForm({ ...form, description: e.target.value })} placeholder="Ne tür müzik yapmak istiyorsun, ne sıklıkla prova, hedefin ne (konser, eğlence, kayıt)…"></textarea><//>
          <div class="row">
            <button type="submit" class="btn btn-red">${form.id ? 'Kaydet' : 'İlanı yayınla'}</button>
            <button type="button" class="btn btn-ghost" onClick=${() => setForm(null)}>Vazgeç</button>
          </div>
        </form>` : null}

      ${posts.length > 0 ? html`
        <div class="row chips" role="group" aria-label="Aranan role göre filtrele">
          <span class="strong small">Aranan:</span>
          ${roles.map((r) => html`<${Pill} on=${filter === r} onClick=${() => setFilter(r)}>${r}<//>`)}
        </div>` : null}

      ${shown.length === 0 ? html`<div class="locked"><h2 class="h2">Henüz ilan yok</h2><p class="muted">İlk ilanı sen ver!</p></div>` : html`
        <div class="cards">
          ${shown.map((p) => {
            const mine = p.user_id === uid;
            const hidden = p.review === 'incelemede' || p.review === 'kontrol';
            return html`
              <article class=${'card pad stack post' + (hidden ? ' post-hidden' : '')}>
                ${hidden ? html`<div class="post-flag">${p.review === 'kontrol' ? 'Kontrol ediliyor…' : mine ? 'İncelemede — yönetim onaylayınca yayınlanacak' : '⚠️ Gizlendi: ' + (p.review_reason || 'uygunsuz olabilir')}
                  ${canModerate && !mine && p.review === 'incelemede' ? html` <button type="button" class="link-btn" onClick=${() => publish(p)}>Yayına al</button>` : null}</div>` : null}
                <div class="row between"><span class="tag tag-red">${p.kind}</span><span class="muted small">${fmtShort(String(p.created_at).slice(0, 10))}</span></div>
                <h3 class="post-title">${p.title}</h3>
                <div class="row nowrap">
                  <${Avatar} url=${p.avatar_url} name=${p.display_name} size=${44} />
                  <span class="small">${approved ? html`<a href=${'#/uye/' + p.user_id}><b>${p.display_name}</b></a>` : html`<b>${p.display_name}</b>`}${p.my_role ? ' · ' + p.my_role : ''}${p.genre ? ' · ' + p.genre : ''} <${UserTags} uid=${p.user_id} /></span>
                </div>
                ${(p.looking_for || []).length ? html`
                  <div class="stack-xs"><span class="muted small strong">Aranıyor</span>
                    <div class="row-sm">${p.looking_for.map((r) => html`<span class="tag tag-cream">${r}</span>`)}</div>
                  </div>` : null}
                ${p.description ? html`<p class="post-desc">${p.description}</p>` : null}
                <div class="row post-actions">
                  ${mine ? html`
                    <button type="button" class="btn btn-sm btn-ghost" onClick=${() => setForm({ ...p })}>Düzenle</button>
                    <button type="button" class="btn btn-sm btn-ghost" onClick=${() => close(p, false)}>İlanı kapat</button>`
                  : !me ? html`<a class="btn btn-sm btn-ghost" href="#/giris">İletişim için giriş yap</a>`
                  : !approved ? html`<span class="muted small">İletişim bilgisi üyeliğin onaylanınca görünür.</span>`
                  : html`<button type="button" class="btn btn-sm btn-wa" onClick=${() => openWhatsApp('market_contact', { p_post: p.id }, 'Merhaba, BÜMT Müzisyen Pazarı\'ndaki "' + p.title + '" ilanın için yazıyorum.', 'Bu üye telefon numarası eklememiş.')}>WhatsApp'tan yaz</button>`}
                  ${canModerate && !mine ? html`<button type="button" class="link-btn" onClick=${() => close(p, true)}>Kaldır</button>` : null}
                </div>
              </article>`;
          })}
        </div>`}
    </div>`;
}

const MARKET_COLS = 'id,user_id,kind,title,my_role,looking_for,genre,description,display_name,avatar_url,active,created_at';
async function checkPost(id, isNew) {
  try {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch('/api/pazar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session && session.access_token) }, body: JSON.stringify({ id, is_new: isNew }) });
    return await r.json().catch(() => null);
  } catch (e) { return null; }
}

function Uye({ id, me }) {
  const [m, setM] = useState(undefined);
  useEffect(() => {
    if (!me) { if (me === null) go('/giris'); return; }
    sb.rpc('member_card', { p_id: id }).then(({ data, error }) => {
      if (error) { toast(errMsg(error), 'err'); setM(null); return; }
      setM((data && data[0]) || null);
    });
  }, [id, me && me.user.id]);
  if (m === undefined) return html`<${Loading} />`;
  if (!m) return html`<div class="locked"><h1 class="h2">Profil görüntülenemiyor</h1><p class="muted">Üye profillerini onaylı üyeler görebilir.</p></div>`;
  return html`
    <div class="card pad-lg narrow member-card">
      <${Avatar} url=${m.avatar_url} name=${m.full_name} size=${160} />
      <div class="stack">
        <h1 class="h2 member-name">${m.full_name}</h1>
        <div class="row-sm">
          <span class="tag tag-dark">${m.member_type === 'muzisyen' ? 'Müzisyen' : 'Dinleyici'}</span>
          ${m.instructor_of ? html`<span class="tag tag-red">${m.instructor_of} eğitmeni</span>` : null}
          <${UserTags} uid=${m.id} />
        </div>
        ${(m.instruments || []).length ? html`<span><b>Çaldıkları:</b> ${m.instruments.join(', ')}</span>` : null}
        <${SchoolLine} p=${m} />
        ${m.bio ? html`<p class="post-desc">${m.bio}</p>` : html`<p class="muted small">Henüz bir tanıtım yazmamış.</p>`}
      </div>
    </div>`;
}

function SifreUnuttum() {
  const [ident, setIdent] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch('/api/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'request', ident: ident.trim() }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Bir hata oluştu.');
      setMsg(d.message);
    } catch (err) { toast(errMsg(err), 'err'); }
    setBusy(false);
  };
  return html`
    <div class="card pad-lg stack narrow login-card" style="margin: 0 auto">
      <h1 class="h page-h">Şifremi unuttum</h1>
      ${msg ? html`
        <p>${msg}</p>
        <p class="muted small">Hesabına hiç e-posta eklemediysen link gelmez; o durumda yönetim kuruluna yaz.</p>
        <a class="btn btn-ghost self-start" href="#/giris">Giriş sayfasına dön</a>` : html`
        <p class="muted">Öğrenci numaranı yaz; hesabına kayıtlı e-posta adresine şifre sıfırlama linki gönderelim.</p>
        <form class="stack" onSubmit=${submit}>
          <${Field} label="Öğrenci numarası" hint="Yönetim hesabıysan kullanıcı adını yaz"><input class="inp" required autocomplete="username" value=${ident} onInput=${(e) => setIdent(e.target.value)} /><//>
          <button type="submit" class="btn btn-red self-start" disabled=${busy}>${busy ? 'Gönderiliyor…' : 'Sıfırlama linki gönder'}</button>
        </form>
        <a class="small" href="#/giris">← Giriş sayfasına dön</a>`}
    </div>`;
}

function SifreYenile({ token }) {
  const [pw, setPw] = useState({ a: '', b: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (pw.a.length < 6) return setErr('Şifre en az 6 karakter olmalı.');
    if (pw.a !== pw.b) return setErr('Şifreler aynı değil.');
    setBusy(true);
    try {
      const r = await fetch('/api/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset', token, password: pw.a }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Bir hata oluştu.');
      try { await sb.auth.signOut(); } catch (x) {}
      setDone(true);
    } catch (e2) { setErr(errMsg(e2)); }
    setBusy(false);
  };
  return html`
    <div class="card pad-lg stack narrow login-card" style="margin: 0 auto">
      <h1 class="h page-h">Yeni şifre</h1>
      ${done ? html`
        <p>Şifren değiştirildi. Artık yeni şifrenle giriş yapabilirsin.</p>
        <a class="btn btn-red self-start" href="#/giris">Giriş yap</a>` : html`
        <form class="stack" onSubmit=${submit}>
          <${Field} label="Yeni şifre" hint="En az 6 karakter"><input class="inp" type="password" required autocomplete="new-password" value=${pw.a} onInput=${(e) => setPw({ ...pw, a: e.target.value })} /><//>
          <${Field} label="Yeni şifre (tekrar)"><input class="inp" type="password" required autocomplete="new-password" value=${pw.b} onInput=${(e) => setPw({ ...pw, b: e.target.value })} /><//>
          ${err ? html`<p class="form-err" role="alert">${err}</p>` : null}
          <button type="submit" class="btn btn-red self-start" disabled=${busy}>${busy ? 'Kaydediliyor…' : 'Şifremi değiştir'}</button>
        </form>
        ${err && /link/i.test(err) ? html`<a class="small" href="#/sifre">Yeni sıfırlama linki iste</a>` : null}`}
    </div>`;
}

function Kvkk() {
  return html`
    <div class="card pad-lg stack narrow prose">
      <h1 class="h2">KVKK Aydınlatma Metni</h1>
      <p>Başkent Üniversitesi Müzik Topluluğu (BÜMT) olarak, üyelik ve etkinlik başvuruları sırasında paylaştığın ad soyad, öğrenci numarası, telefon, e-posta, bölüm, sınıf ve müzik bilgilerini; üyeliğini doğrulamak, prova odası, enstrüman kursu ve dinleti rezervasyonlarını yürütmek ve seninle iletişime geçmek amacıyla işliyoruz.</p>
      <p>Bu bilgiler yalnızca topluluk yönetim kurulunun yetkili üyeleri tarafından görülebilir; eğitmenlerin telefon numaraları yalnızca giriş yapmış üyelere gösterilir. Verilerin, sitenin altyapı hizmetini sağlayan Supabase (veritabanı) ve Vercel (barındırma) sunucularında saklanır.</p>
      <p>6698 sayılı Kanun'un 11. maddesi kapsamındaki haklarını kullanmak, bilgilerini güncellemek ya da hesabının silinmesini istemek için yönetim kuruluna başvurabilirsin.</p>
    </div>`;
}

// ---------------------------------------------------------------------
// Uygulama
// ---------------------------------------------------------------------
function App() {
  const [me, setMe] = useState(undefined);
  const [route, setRoute] = useState(parseRoute());
  const refresh = useCallback(async () => { try { setMe(await loadMe()); } catch (e) { setMe(null); } }, []);
  useEffect(() => {
    refresh();
    const { data: { subscription } } = sb.auth.onAuthStateChange((ev) => {
      if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT' || ev === 'USER_UPDATED') setTimeout(refresh, 0);
    });
    const onHash = () => { setRoute(parseRoute()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    return () => { subscription.unsubscribe(); window.removeEventListener('hashchange', onHash); };
  }, []);

  const p = route.page;
  let page;
  if (p === '') page = html`<${Home} />`;
  else if (p === 'prova') page = html`<${Prova} me=${me} />`;
  else if (p === 'kurslar') page = html`<${Kurslar} me=${me} />`;
  else if (p === 'dinletiler') page = html`<${Dinletiler} me=${me} />`;
  else if (p === 'etkinlik') page = html`<${EventPage} id=${route.param} />`;
  else if (p === 'form') page = html`<${FormPage} id=${route.param} me=${me} />`;
  else if (p === 'giris') page = html`<${Giris} me=${me} />`;
  else if (p === 'kayit') page = html`<${Kayit} me=${me} />`;
  else if (p === 'profil') page = html`<${Profil} me=${me} refresh=${refresh} />`;
  else if (p === 'egitmen') page = html`<${Egitmen} me=${me} refresh=${refresh} />`;
  else if (p === 'kvkk') page = html`<${Kvkk} />`;
  else if (p === 'pazar') page = html`<${Pazar} me=${me} />`;
  else if (p === 'yoklama') page = html`<${Yoklama} code=${route.param} me=${me} />`;
  else if (p === 'uye') page = html`<${Uye} id=${route.param} me=${me} />`;
  else if (p === 'sifre') page = html`<${SifreUnuttum} />`;
  else if (p === 'sifre-yenile') page = html`<${SifreYenile} token=${route.param} />`;
  else page = html`<div class="stack"><h1 class="h page-h">Sayfa bulunamadı</h1><a class="btn btn-ghost self-start" href="#/">Ana sayfa</a></div>`;

  return html`
    <${Header} me=${me} route=${route} />
    <${StatusBanner} me=${me} />
    <main class="wrap main" id="icerik">${me === undefined && ['prova', 'kurslar', 'dinletiler', 'profil', 'egitmen', 'pazar', 'yoklama', 'uye'].includes(p) ? html`<${Loading} />` : page}</main>
    <footer class="ftr">
      <div class="wrap ftr-in">
        <div class="row nowrap"><span class="ftr-logo"><img src="/assets/logo.png" alt="" /></span><b>Başkent Üniversitesi Müzik Topluluğu</b></div>
        <div class="row small"><a href="#/kvkk">KVKK</a><a href="/yonetim/">Yönetim</a></div>
      </div>
    </footer>
    <${BottomNav} route=${route} />
    <${Toaster} />`;
}

initSupabase()
  .then(() => { const el = document.getElementById('app'); el.textContent = ''; render(html`<${App} />`, el); })
  .catch((e) => {
    document.getElementById('app').innerHTML = '<div style="padding:40px;font-family:sans-serif">Site ayarları yüklenemedi: ' + String(e.message || e).replace(/</g, '&lt;') + '</div>';
  });
