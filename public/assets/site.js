// BÜMT — herkese açık site
import {
  html, render, useState, useEffect, useCallback,
  sb, initSupabase, loadMe, memberEmail, errMsg, toast, Toaster,
  todayStr, addDays, fmtLong, fmtShort, hhmm, addMinutes, nextFridays,
  DAY_NAMES, DAY_SHORT, GRID_DAYS, INSTRUMENTS, CLASS_YEARS, waLink, InstructorScheduleEditor
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
const NAV = [['', 'Ana Sayfa'], ['prova', 'Prova Odası'], ['kurslar', 'Enstrüman Kursları'], ['dinletiler', 'Dinletiler']];

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
              <button type="button" class="btn btn-cream btn-sm" aria-expanded=${open} onClick=${() => setOpen(!open)}>
                ${name}
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
      <div class="hero-txt">
        <span class="tag tag-red">Başkent Üniversitesi</span>
        <h1 class="h hero-h">Sahne senin.<br />Ses bizim.</h1>
        <p class="muted lead">Başkent Üniversitesi Müzik Topluluğu: her cuma prova odası, ayda iki dinleti, enstrüman kursları ve BÜMT Fest. Üye ol, rezervasyonunu yap, sahneye çık.</p>
        <div class="row">
          <a class="btn btn-red" href="#/prova">Prova odası rezervasyonu</a>
          <a class="btn btn-ghost" href="#/kurslar">Enstrüman kursları</a>
        </div>
      </div>
      <div class="hero-logo"><div class="logo-card"><img src="/assets/logo.png" alt="Başkent Müzik Topluluğu logosu" /></div></div>
    </section>

    <section class="sec">
      <div class="sec-head"><h2 class="h">Yaklaşan etkinlikler</h2></div>
      ${events === null ? html`<${Loading} />` : events.length === 0 ? html`
        <p class="muted">Şu an duyurulmuş bir etkinlik yok. Takipte kal!</p>` : html`
        <div class="cards">${events.map((e, i) => html`<${EventCard} e=${e} i=${i} />`)}</div>`}
    </section>

    <section class="tiles">
      <a class="tile" href="#/prova"><span class="h tile-big">Her cuma</span><b>Prova odası</b><span class="muted small">Haftanın rezervasyonu pazartesi açılır.</span></a>
      <a class="tile" href="#/dinletiler"><span class="h tile-big">Ayda 2</span><b>Dinleti günü</b><span class="muted small">Solo, grup, akustik: önceden sahne ayır.</span></a>
      <a class="tile" href="#/kurslar"><span class="h tile-big">Kurslar</span><b>Enstrüman dersleri</b><span class="muted small">Eğitmenin takviminden boş saati seç.</span></a>
    </section>`;
}

const POSTER_COLORS = [['#D7301F', '#fff'], ['#141414', '#F4EAD5'], ['#F4EAD5', '#141414']];
function EventCard({ e, i }) {
  const [bg, fg] = POSTER_COLORS[i % 3];
  const href = e.form_id ? '#/form/' + e.form_id : e.cta_url;
  const ext = !e.form_id && e.cta_url;
  const when = [e.starts_on ? fmtLong(e.starts_on) : e.date_text, e.venue].filter(Boolean).join(' · ');
  return html`
    <article class="card ev">
      ${e.poster_url ? html`<img class="ev-poster" src=${e.poster_url} alt=${e.title + ' afişi'} loading="lazy" />` : html`
        <div class="ev-gen" style=${'background:' + bg + ';color:' + fg}>
          <span class="ev-gen-top">Başkent Müzik Topluluğu</span>
          <span class="h ev-gen-title">${e.title}</span>
          <span class="ev-gen-top">${e.tag}</span>
        </div>`}
      <div class="ev-body">
        <span class="tag tag-dark">${e.tag}</span>
        <h3>${e.title}</h3>
        ${when ? html`<span class="ev-when">${when}</span>` : null}
        ${e.description ? html`<p class="muted">${e.description}</p>` : null}
        ${href ? html`<a class="btn btn-dark" href=${href} target=${ext ? '_blank' : null} rel=${ext ? 'noopener' : null}>${e.cta_label || (e.form_id ? 'Başvur' : 'Detaylar')}</a>` : null}
      </div>
    </article>`;
}

// ---------------------------------------------------------------------
// Prova odası
// ---------------------------------------------------------------------
function Prova({ me }) {
  const [data, setData] = useState(null);
  const [week, setWeek] = useState(0);
  const [busy, setBusy] = useState(false);
  const fridays = nextFridays(3);

  const load = useCallback(async () => {
    const [{ data: settings }, { data: slots }, { data: bookings }] = await Promise.all([
      sb.from('settings').select('*').eq('id', 1).single(),
      sb.from('prova_slots').select('*').eq('active', true).order('sort').order('start_time'),
      sb.from('prova_bookings').select('id,slot_id,day,user_id,display_name').in('day', fridays)
    ]);
    setData({ settings: settings || { prova_open_days: 4, prova_max_per_week: 1 }, slots: slots || [], bookings: bookings || [] });
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!data) return html`<${Loading} />`;
  const today = todayStr();
  const weeks = fridays.map((f) => {
    const opens = addDays(f, -data.settings.prova_open_days);
    return { f, opens, open: today >= opens && today <= f };
  });
  const w = weeks[week];
  const uid = me && me.user.id;
  const gate = bookingGate(me);

  const book = async (slot) => {
    if (!gate.ok) return gateMessage(gate);
    setBusy(true);
    const { error } = await sb.from('prova_bookings').insert({ slot_id: slot.id, day: w.f });
    setBusy(false);
    if (error) { toast(errMsg(error), 'err'); return load(); }
    toast('Rezervasyonun alındı: ' + fmtShort(w.f) + ', ' + hhmm(slot.start_time) + '–' + hhmm(slot.end_time));
    load();
  };
  const cancel = async (b) => {
    if (!confirm('Rezervasyonunu iptal etmek istiyor musun?')) return;
    setBusy(true);
    const { error } = await sb.from('prova_bookings').delete().eq('id', b.id);
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    toast('Rezervasyonun iptal edildi.');
    load();
  };

  return html`
    <div class="stack-lg">
      <div class="stack">
        <h1 class="h page-h">Prova odası</h1>
        <p class="muted measure">Topluluğun her cuma prova odası hakkı var. Bir cumanın rezervasyonu ${data.settings.prova_open_days === 4 ? html`o haftanın <b class="ink">pazartesi</b> günü` : html`<b class="ink">${data.settings.prova_open_days} gün önceden</b>`} açılır. Her üye haftada en fazla ${data.settings.prova_max_per_week} slot alabilir.</p>
      </div>
      <div class="row">
        ${weeks.map((x, i) => html`
          <button type="button" class=${'week ' + (i === week ? 'week-on' : '')} aria-pressed=${i === week} onClick=${() => setWeek(i)}>
            <b>${fmtShort(x.f)} Cuma</b>
            <span class="small">${x.open ? 'Rezervasyon açık' : today > x.f ? 'Geçti' : fmtShort(x.opens) + ' açılır'}</span>
          </button>`)}
      </div>
      ${data.slots.length === 0 ? html`<p class="muted">Prova saatleri henüz tanımlanmadı.</p>` : w.open ? html`
        <div class="card pad stack">
          <h2 class="h2">${fmtLong(w.f)}</h2>
          ${data.slots.map((s) => {
            const b = data.bookings.find((x) => x.slot_id === s.id && x.day === w.f);
            const mine = b && b.user_id === uid;
            return html`
              <div class=${'slot ' + (mine ? 'slot-mine' : b ? 'slot-taken' : '')}>
                <div class="stack-xs">
                  <span class="h slot-time">${hhmm(s.start_time)} – ${hhmm(s.end_time)}</span>
                  <span class="small strong">${mine ? 'Senin rezervasyonun' : b ? 'Dolu · ' + b.display_name : 'Boş'}</span>
                </div>
                ${mine ? html`<button type="button" class="btn btn-ghost" disabled=${busy} onClick=${() => cancel(b)}>İptal et</button>`
                  : b ? html`<span class="btn btn-disabled" aria-hidden="true">Dolu</span>`
                  : html`<button type="button" class="btn btn-red" disabled=${busy} onClick=${() => book(s)}>${gate.reason === 'login' ? 'Giriş yap ve rezerve et' : 'Rezerve et'}</button>`}
              </div>`;
          })}
        </div>` : html`
        <div class="locked">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
          <h2 class="h2">${fmtLong(w.f)} henüz kilitli</h2>
          <p class="muted">Bu haftanın rezervasyonu <b class="ink">${fmtLong(w.opens)}</b> açılır.</p>
        </div>`}
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
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: ins }, { data: slots }, { data: bookings }] = await Promise.all([
      sb.from('instructors').select('id,full_name,instrument,kind,department,class_year,bio,profile_id').eq('active', true).order('instrument').order('full_name'),
      sb.from('instructor_slots').select('instructor_id,weekday,hour'),
      sb.from('lesson_bookings').select('id,instructor_id,weekday,hour,user_id,display_name')
    ]);
    setData({ ins: ins || [], slots: slots || [], bookings: bookings || [] });
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setPhone('');
    if (!selId || !me) return;
    sb.from('instructors').select('phone').eq('id', selId).maybeSingle().then(({ data: d }) => setPhone((d && d.phone) || ''));
  }, [selId, me && me.user.id]);

  if (!data) return html`<${Loading} />`;
  const instruments = ['Tümü', ...Array.from(new Set(data.ins.map((i) => i.instrument)))];
  const list = data.ins.filter((i) => filter === 'Tümü' || i.instrument === filter);
  const sel = data.ins.find((i) => i.id === selId);
  const uid = me && me.user.id;
  const gate = bookingGate(me);

  const freeCount = (id) => data.slots.filter((s) => s.instructor_id === id && !data.bookings.some((b) => b.instructor_id === id && b.weekday === s.weekday && b.hour === s.hour)).length;
  const open = (id) => { setSelId(id); setPicked(null); setTimeout(() => { const el = document.getElementById('takvim'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50); };

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
    const { error } = await sb.from('lesson_bookings').insert({ instructor_id: sel.id, weekday: d, hour: h });
    setBusy(false);
    if (error) { toast(errMsg(error), 'err'); return load(); }
    setPicked(null);
    toast('Kaydın alındı! Şimdi ' + sel.full_name + ' ile WhatsApp\'tan iletişime geç.');
    load();
  };
  const cancelMine = async (b) => {
    if (!confirm(DAY_NAMES[b.weekday] + ' ' + b.hour + ':00 dersini iptal etmek istiyor musun?')) return;
    const { error } = await sb.from('lesson_bookings').delete().eq('id', b.id);
    if (error) return toast(errMsg(error), 'err');
    toast('Ders kaydın iptal edildi.');
    load();
  };

  return html`
    <div class="stack-lg">
      <div class="stack">
        <h1 class="h page-h">Enstrüman kursları</h1>
        <p class="muted measure">Hocalarımız, ders veren ve gönüllü öğrencilerimiz müsait saatlerini kendileri işaretler. Bir eğitmen seç, takviminden boş saate kayıt ol, sonra WhatsApp'tan iletişime geç.</p>
      </div>
      ${data.ins.length === 0 ? html`<p class="muted">Henüz eğitmen eklenmedi.</p>` : html`
        <div class="row" role="group" aria-label="Enstrümana göre filtrele">
          ${instruments.map((i) => html`<${Pill} on=${filter === i} onClick=${() => setFilter(i)}>${i}<//>`)}
        </div>
        <div class="cards">
          ${list.map((t) => {
            const n = freeCount(t.id);
            return html`
              <div class=${'card pad stack teacher ' + (t.id === selId ? 'teacher-on' : '')}>
                <div class="row nowrap">
                  <span class="h avatar">${t.full_name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('')}</span>
                  <div class="stack-xs"><b class="t-name">${t.full_name}</b><span class="muted small">${[t.department, t.class_year].filter(Boolean).join(' · ')}</span></div>
                </div>
                <div class="row-sm"><span class="tag tag-dark">${t.instrument}</span><span class="tag tag-cream">${t.kind}</span></div>
                ${t.bio ? html`<p class="muted small">${t.bio}</p>` : null}
                <span class="small strong">${n > 0 ? n + ' boş saat' : 'Şu an boş saat yok'}</span>
                <button type="button" class="btn btn-ghost self-start" onClick=${() => open(t.id)}>Takvimi gör</button>
              </div>`;
          })}
        </div>`}

      ${sel ? html`
        <div id="takvim" class="card pad stack">
          <div class="row between">
            <div class="stack-xs">
              <span class="muted small strong">Haftalık takvim</span>
              <h2 class="h2">${sel.full_name} · ${sel.instrument}</h2>
              <span class="muted small">${[sel.kind, sel.department, sel.class_year].filter(Boolean).join(' · ')}</span>
            </div>
            <div class="row">
              ${me ? (phone ? html`<a class="btn btn-red" href=${waLink(phone, 'Merhaba, BÜMT sitesinden ' + sel.instrument + ' dersi için yazıyorum.')} target="_blank" rel="noopener">WhatsApp'tan yaz</a>` : null)
                : html`<a class="btn btn-ghost" href="#/giris">İletişim için giriş yap</a>`}
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
                    const b = data.bookings.find((x) => x.instructor_id === sel.id && x.weekday === d && x.hour === h);
                    const when = DAY_NAMES[d] + ' ' + h + ':00';
                    if (b && b.user_id === uid) return html`<button type="button" class="cell cell-booked" aria-label=${when + ', senin dersin, iptal etmek için tıkla'} onClick=${() => cancelMine(b)}>Senin dersin</button>`;
                    if (b) return html`<span class="cell cell-taken" aria-label=${when + ', dolu'}>Dolu</span>`;
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
              <span><i class="sw sw-booked"></i>Senin dersin</span>
            </div>
            ${picked ? html`
              <div class="row">
                <b>Seçilen: ${DAY_NAMES[+picked.split('-')[0]]} ${picked.split('-')[1]}:00</b>
                <button type="button" class="btn btn-red" disabled=${busy} onClick=${enroll}>${gate.reason === 'login' ? 'Giriş yap ve kayıt ol' : 'Kayıt ol'}</button>
              </div>` : null}
          </div>
          <p class="muted small">Kayıt olduğun saat her hafta senin için ayrılır. Ders ücreti, yeri ve başlangıç tarihini eğitmenle konuşarak netleştir.</p>
        </div>` : null}
    </div>`;
}

// ---------------------------------------------------------------------
// Dinletiler
// ---------------------------------------------------------------------
function Dinletiler({ me }) {
  const [data, setData] = useState(null);
  const [type, setType] = useState('Solo');
  const [performer, setPerformer] = useState('');
  const [busy, setBusy] = useState(false);
  const today = todayStr();

  const load = useCallback(async () => {
    const [{ data: settings }, { data: list }] = await Promise.all([
      sb.from('settings').select('*').eq('id', 1).single(),
      sb.from('dinletiler').select('*').eq('active', true).gte('day', today).order('day').limit(6)
    ]);
    const ids = (list || []).map((d) => d.id);
    const { data: bookings } = ids.length ? await sb.from('dinleti_bookings').select('id,dinleti_id,slot_index,user_id,display_name,perf_type').in('dinleti_id', ids) : { data: [] };
    setData({ settings: settings || { dinleti_open_days: 21 }, list: list || [], bookings: bookings || [] });
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!data) return html`<${Loading} />`;
  const uid = me && me.user.id;
  const gate = bookingGate(me);

  const book = async (d, i) => {
    if (!gate.ok) return gateMessage(gate);
    setBusy(true);
    const { error } = await sb.from('dinleti_bookings').insert({ dinleti_id: d.id, slot_index: i, perf_type: type, performer: performer.trim() });
    setBusy(false);
    if (error) { toast(errMsg(error), 'err'); return load(); }
    toast('Slotun ayrıldı: ' + fmtShort(d.day) + ', ' + addMinutes(d.start_time, i * d.slot_minutes) + ' (' + type + ')');
    load();
  };
  const cancel = async (b) => {
    if (!confirm('Dinleti slotunu iptal etmek istiyor musun?')) return;
    const { error } = await sb.from('dinleti_bookings').delete().eq('id', b.id);
    if (error) return toast(errMsg(error), 'err');
    toast('Slotun iptal edildi.');
    load();
  };

  return html`
    <div class="stack-lg">
      <div class="stack">
        <h1 class="h page-h">Dinletiler</h1>
        <p class="muted measure">Ayda iki dinleti günü. Çalmak isteyenler performans slotunu <b class="ink">${data.settings.dinleti_open_days} gün önceden</b> ayırabilir. Önce performans türünü seç, sonra boş bir slota tıkla.</p>
      </div>
      <div class="card pad row">
        <span class="strong">Performans türü:</span>
        ${['Solo', 'Grup', 'Akustik'].map((o) => html`<${Pill} on=${type === o} onClick=${() => setType(o)}>${o}<//>`)}
        <label class="lbl grow"><span>Sahne / grup adı (isteğe bağlı)</span><input class="inp" value=${performer} onInput=${(e) => setPerformer(e.target.value)} maxlength="60" placeholder="Boş bırakırsan adın görünür" /></label>
      </div>
      ${data.list.length === 0 ? html`<p class="muted">Yaklaşan dinleti tarihi henüz eklenmedi.</p>` : html`
        <div class="cards cards-wide">
          ${data.list.map((d) => {
            const opens = addDays(d.day, -data.settings.dinleti_open_days);
            const open = today >= opens;
            return html`
              <div class="card pad stack">
                <div class="row between"><h2 class="h2">${fmtLong(d.day)}</h2><span class=${'tag ' + (open ? 'tag-red' : 'tag-cream')}>${open ? 'Rezervasyon açık' : 'Henüz kapalı'}</span></div>
                <span class="muted small">${[d.title, d.venue, hhmm(d.start_time) + ' başlangıç'].filter(Boolean).join(' · ')}</span>
                ${d.note ? html`<p class="muted small">${d.note}</p>` : null}
                ${open ? html`
                  <div class="stack-sm">
                    ${Array.from({ length: d.slot_count }, (_, i) => {
                      const b = data.bookings.find((x) => x.dinleti_id === d.id && x.slot_index === i);
                      const mine = b && b.user_id === uid;
                      const t = addMinutes(d.start_time, i * d.slot_minutes);
                      if (mine) return html`<button type="button" class="dslot dslot-mine" onClick=${() => cancel(b)}><b>${t}</b><span>Sen · ${b.perf_type} · iptal için tıkla</span></button>`;
                      if (b) return html`<div class="dslot dslot-taken"><b>${t}</b><span>${b.display_name} · ${b.perf_type}</span></div>`;
                      return html`<button type="button" class="dslot" disabled=${busy} onClick=${() => book(d, i)}><b>${t}</b><span>Boş · tıkla, ayır</span></button>`;
                    })}
                  </div>` : html`<div class="locked locked-sm"><span class="strong">Rezervasyon ${fmtLong(opens)} açılır</span></div>`}
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
  useEffect(() => { if (me) go('/'); }, [me]);
  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    const { error } = await sb.auth.signInWithPassword({ email: memberEmail(no), password: pw });
    setBusy(false);
    if (error) return setErr(errMsg(error));
    toast('Hoş geldin!');
    go('/');
  };
  return html`
    <div class="login-wrap">
      <form class="card pad-lg stack login-card" onSubmit=${submit}>
        <h1 class="h page-h">Giriş yap</h1>
        <p class="muted">Öğrenci numaran ve şifrenle giriş yap.</p>
        <${Field} label="Öğrenci numarası"><input class="inp" inputmode="numeric" autocomplete="username" required value=${no} onInput=${(e) => setNo(e.target.value)} /><//>
        <${Field} label="Şifre"><input class="inp" type="password" autocomplete="current-password" required value=${pw} onInput=${(e) => setPw(e.target.value)} /><//>
        ${err ? html`<p class="form-err" role="alert">${err}</p>` : null}
        <button type="submit" class="btn btn-red" disabled=${busy}>${busy ? 'Giriş yapılıyor…' : 'Giriş yap'}</button>
        <p class="small">Hesabın yok mu? <a href="#/kayit">Üye ol</a></p>
        <p class="muted small">Şifreni unuttuysan yönetim kuruluna yaz; şifreni sıfırlayabilirler.</p>
      </form>
      <aside class="admin-entry">
        <span class="h admin-entry-h">Yönetim</span>
        <p>Yönetim kurulu üyeleri ve yetkililer için ayrı giriş.</p>
        <a class="btn btn-cream" href="/yonetim/">Yönetim girişi →</a>
      </aside>
    </div>`;
}

function Kayit({ me }) {
  const [f, setF] = useState({ full_name: '', student_no: '', phone: '', contact_email: '', department: '', class_year: '1. sınıf', member_type: 'muzisyen', instruments: [], password: '', password2: '', kvkk: false });
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
    if (f.password.length < 6) return setErr('Şifre en az 6 karakter olmalı.');
    if (f.password !== f.password2) return setErr('Şifreler aynı değil.');
    if (f.member_type === 'muzisyen' && f.instruments.length === 0) return setErr('Ne çaldığını / söylediğini seç.');
    if (!f.kvkk) return setErr('Devam etmek için KVKK metnini onaylamalısın.');
    setBusy(true);
    const { data, error } = await sb.auth.signUp({
      email: memberEmail(no), password: f.password,
      options: { data: {
        full_name: f.full_name.trim(), phone: f.phone.trim(), contact_email: f.contact_email.trim(),
        department: f.department.trim(), class_year: f.class_year, member_type: f.member_type,
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
          <${Field} label="E-posta (isteğe bağlı)"><input class="inp" type="email" autocomplete="email" value=${f.contact_email} onInput=${set('contact_email')} /><//>
          <${Field} label="Bölüm"><input class="inp" value=${f.department} onInput=${set('department')} /><//>
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
    setF({ full_name: p.full_name, phone: p.phone, contact_email: p.contact_email, department: p.department, class_year: p.class_year || '1. sınıf', member_type: p.member_type, instruments: p.instruments || [] });
    loadMine();
  }, [me && me.user.id]);

  const loadMine = async () => {
    const uid = me.user.id;
    const today = todayStr();
    const [{ data: pv }, { data: ls }, { data: dn }] = await Promise.all([
      sb.from('prova_bookings').select('id,day,prova_slots(start_time,end_time)').eq('user_id', uid).gte('day', today).order('day'),
      sb.from('lesson_bookings').select('id,weekday,hour,instructors(full_name,instrument)').eq('user_id', uid),
      sb.from('dinleti_bookings').select('id,slot_index,perf_type,dinletiler(day,start_time,slot_minutes)').eq('user_id', uid)
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
        </div>
        <span class=${'tag ' + statusTag[0]}>${statusTag[1]}</span>
      </div>

      <div class="card pad stack">
        <h2 class="h2">Rezervasyonlarım</h2>
        ${!mine ? html`<${Loading} />` : (mine.pv.length + mine.ls.length + mine.dn.length) === 0 ? html`<p class="muted">Aktif rezervasyonun yok.</p>` : html`
          <ul class="list">
            ${mine.pv.map((r) => html`<li><span><b>Prova odası</b> · ${fmtLong(r.day)} · ${hhmm(r.prova_slots && r.prova_slots.start_time)}–${hhmm(r.prova_slots && r.prova_slots.end_time)}</span><button type="button" class="link-btn" onClick=${() => del('prova_bookings', r.id)}>İptal</button></li>`)}
            ${mine.ls.map((r) => html`<li><span><b>${r.instructors ? r.instructors.instrument + ' dersi' : 'Ders'}</b> · ${r.instructors ? r.instructors.full_name : ''} · her ${DAY_NAMES[r.weekday]} ${r.hour}:00</span><button type="button" class="link-btn" onClick=${() => del('lesson_bookings', r.id)}>İptal</button></li>`)}
            ${mine.dn.map((r) => html`<li><span><b>Dinleti</b> · ${fmtLong(r.dinletiler.day)} · ${addMinutes(r.dinletiler.start_time, r.slot_index * r.dinletiler.slot_minutes)} · ${r.perf_type}</span><button type="button" class="link-btn" onClick=${() => del('dinleti_bookings', r.id)}>İptal</button></li>`)}
          </ul>`}
      </div>

      <form class="card pad stack" onSubmit=${save}>
        <h2 class="h2">Bilgilerim</h2>
        <div class="fgrid">
          <${Field} label="Ad Soyad"><input class="inp" required value=${f.full_name} onInput=${set('full_name')} /><//>
          <${Field} label="Telefon (WhatsApp)"><input class="inp" type="tel" value=${f.phone} onInput=${set('phone')} /><//>
          <${Field} label="E-posta"><input class="inp" type="email" value=${f.contact_email} onInput=${set('contact_email')} /><//>
          <${Field} label="Bölüm"><input class="inp" value=${f.department} onInput=${set('department')} /><//>
          <${Field} label="Sınıf"><select class="inp" value=${f.class_year} onChange=${set('class_year')}>${CLASS_YEARS.map((c) => html`<option>${c}</option>`)}</select><//>
        </div>
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
    if (me && me.instructor) setF({ phone: me.instructor.phone, bio: me.instructor.bio });
  }, [me && me.user.id, me && me.instructor && me.instructor.id]);
  if (me === undefined) return html`<${Loading} />`;
  if (!me || !me.instructor) return html`<div class="locked"><h1 class="h2">Eğitmen paneli</h1><p class="muted">Bu sayfa eğitmen olarak eklenmiş üyeler içindir. Eğitmen olmak istiyorsan yönetim kuruluna yaz.</p></div>`;
  const ins = me.instructor;
  const save = async (e) => {
    e.preventDefault();
    const { error } = await sb.from('instructors').update({ phone: f.phone, bio: f.bio }).eq('id', ins.id);
    if (error) return toast(errMsg(error), 'err');
    toast('Bilgilerin güncellendi.');
    refresh();
  };
  return html`
    <div class="stack-lg">
      <div class="stack-xs">
        <span class="tag tag-dark self-start">Eğitmen paneli</span>
        <h1 class="h page-h">Müsaitlik takvimim</h1>
        <span class="muted">${ins.full_name} · ${ins.instrument} · ${ins.kind}</span>
        ${!ins.active ? html`<span class="form-err">Profilin şu an sitede gizli. Yönetim kurulu aktif edince görünür.</span>` : null}
      </div>
      <div class="card pad"><${InstructorScheduleEditor} instructor=${ins} /></div>
      ${f ? html`
        <form class="card pad stack" onSubmit=${save}>
          <h2 class="h2">Öğrencilerin göreceği bilgiler</h2>
          <${Field} label="WhatsApp numaran" hint="Sadece giriş yapmış üyeler görür"><input class="inp" type="tel" value=${f.phone} onInput=${(e) => setF({ ...f, phone: e.target.value })} /><//>
          <${Field} label="Kısa tanıtım"><textarea class="inp" rows="3" maxlength="300" value=${f.bio} onInput=${(e) => setF({ ...f, bio: e.target.value })} placeholder="Örn. 8 yıldır keman çalıyorum, başlangıç seviyesine ders veriyorum."></textarea><//>
          <button type="submit" class="btn btn-dark self-start">Kaydet</button>
        </form>` : null}
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
  else if (p === 'form') page = html`<${FormPage} id=${route.param} me=${me} />`;
  else if (p === 'giris') page = html`<${Giris} me=${me} />`;
  else if (p === 'kayit') page = html`<${Kayit} me=${me} />`;
  else if (p === 'profil') page = html`<${Profil} me=${me} refresh=${refresh} />`;
  else if (p === 'egitmen') page = html`<${Egitmen} me=${me} refresh=${refresh} />`;
  else if (p === 'kvkk') page = html`<${Kvkk} />`;
  else page = html`<div class="stack"><h1 class="h page-h">Sayfa bulunamadı</h1><a class="btn btn-ghost self-start" href="#/">Ana sayfa</a></div>`;

  return html`
    <${Header} me=${me} route=${route} />
    <${StatusBanner} me=${me} />
    <main class="wrap main" id="icerik">${me === undefined && ['prova', 'kurslar', 'dinletiler', 'profil', 'egitmen'].includes(p) ? html`<${Loading} />` : page}</main>
    <footer class="ftr">
      <div class="wrap ftr-in">
        <div class="row nowrap"><span class="ftr-logo"><img src="/assets/logo.png" alt="" /></span><b>Başkent Üniversitesi Müzik Topluluğu</b></div>
        <div class="row small"><a href="#/kvkk">KVKK</a><a href="/yonetim/">Yönetim</a></div>
      </div>
    </footer>
    <${Toaster} />`;
}

initSupabase()
  .then(() => render(html`<${App} />`, document.getElementById('app')))
  .catch((e) => {
    document.getElementById('app').innerHTML = '<div style="padding:40px;font-family:sans-serif">Site ayarları yüklenemedi: ' + String(e.message || e).replace(/</g, '&lt;') + '</div>';
  });
