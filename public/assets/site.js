// BÜMT — herkese açık site
import {
  html, render, useState, useEffect, useCallback, useRef,
  sb, initSupabase, loadMe, memberEmail, errMsg, toast, Toaster,
  todayStr, addDays, fmtLong, fmtShort, hhmm, addMinutes, nextFridays,
  DAY_NAMES, DAY_SHORT, GRID_DAYS, INSTRUMENTS, CLASS_YEARS, waLink, InstructorScheduleEditor, notifyLesson, notifyProva, notifyDinleti, QrScanner, yoklamaCode, timeTR, Avatar, uploadAvatar, PasswordInput, signIn, compressImage, PROFILE_COLS, UserTags, mapsHref, HAS_FACULTY, SchoolLine, FacultySelect, INSTRUCTOR_COLS
} from './lib.js';

const parseRoute = () => {
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/');
  return { page: parts[0] || '', param: parts[1] || '' };
};
const go = (path) => { location.hash = path; };

const MSG_ICON = 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z';
const MAIL_NOTES = { sent: '📧 Bildirim e-postası gönderildi.', throttled: '📧 E-posta atlandı: bu konuşmada son 10 dk içinde gönderdiğin ve karşı tarafın henüz okumadığı bir mesaj var (spam olmasın diye).', no_email: '📧 E-posta gitmedi: karşı tarafın profilinde e-posta adresi yok.', off: '📧 E-posta gitmedi: karşı taraf bildirimleri kapatmış.', no_key: '📧 E-posta gitmedi: bu ortamda e-posta servisi (RESEND_API_KEY) tanımlı değil.', error: '📧 E-posta servisi hata verdi (Resend reddetti).' };
function mailNote(m) {
  // Test sitesinde her gönderimde e-posta durumunu göster; canlıda sadece servis kapalıysa
  const preview = /vercel\.app$/.test(location.hostname);
  if (!m) { if (preview) toast('📧 Sunucu e-posta durumu döndürmedi (eski sürüm?).', 'err'); return; }
  if (preview || m === 'no_key') toast(MAIL_NOTES[m] || ('📧 ' + m), m === 'sent' || m === 'throttled' ? undefined : 'err');
}
async function sendMessage(thread_id, body) {
  // Mesaj doğrudan veritabanına yazılır (hızlı); e-posta bildirimi arkada ayrıca tetiklenir, bekletmez.
  const { error } = await sb.rpc('dm_send', { p_thread: thread_id, p_body: body });
  if (error) return { error: errMsg(error) };
  (async () => {
    try {
      const { data: { session } } = await sb.auth.getSession();
      const r = await fetch('/api/mesaj', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session && session.access_token) }, body: JSON.stringify({ thread_id, notify_only: true }) });
      const d = await r.json().catch(() => ({}));
      mailNote(d.mail);
    } catch (e) { /* bildirim gitmese de mesaj gitti */ }
  })();
  return { ok: true };
}
async function startChat(other, ctype, cid, title) {
  if (!other) return toast('Bu kişiyle site üzerinden mesajlaşma şu an yapılamıyor.', 'err');
  const { data, error } = await sb.rpc('dm_start', { p_other: other, p_ctype: ctype || 'direct', p_cid: cid || null, p_title: title || '' });
  if (error) return toast(errMsg(error), 'err');
  go('/mesajlar/' + data);
}
function waForCtx(ctx) {
  if (ctx.kind === 'market') return openWhatsApp('market_contact', { p_post: ctx.id }, 'Merhaba, BÜMT Müzisyen Pazarı\'ndaki "' + ctx.title + '" ilanın için yazıyorum.', 'Bu üye telefon numarası eklememiş.');
  if (ctx.kind === 'equipment') return openWhatsApp('equipment_contact', { p_post: ctx.id }, 'Merhaba, BÜMT Enstrüman Pazarı\'ndaki "' + ctx.title + '" ilanın hâlâ duruyor mu?', 'Bu üye telefon numarası eklememiş.');
  return openWhatsApp('instructor_contact', { p_instructor: ctx.id }, 'Merhaba, BÜMT sitesinden ' + ctx.title + ' için yazıyorum.', 'Eğitmen henüz telefon eklememiş.');
}
function ContactButtons({ me, approved, pref, ctx, size }) {
  const sm = size === 'sm' ? ' btn-sm' : '';
  if (!me) return html`<a class=${'btn btn-ghost' + sm} href="#/giris">İletişim için giriş yap</a>`;
  if (!approved) return html`<span class="muted small">İletişim üyeliğin onaylanınca görünür.</span>`;
  const canChat = !!ctx.otherId;
  const pr = pref || 'whatsapp';
  const showWa = pr !== 'chat' || !canChat;
  const showChat = pr !== 'whatsapp' && canChat;
  return html`
    ${showWa ? html`<button type="button" class=${'btn btn-wa' + sm} onClick=${() => waForCtx(ctx)}>WhatsApp'tan yaz</button>` : null}
    ${showChat ? html`<button type="button" class=${'btn btn-dark' + sm} onClick=${() => startChat(ctx.otherId, ctx.kind, ctx.id, ctx.title)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d=${MSG_ICON}/></svg> Mesaj gönder</button>` : null}`;
}
function ContactPrefField({ value, onChange }) {
  const opts = [['whatsapp', 'WhatsApp numaram'], ['chat', 'Site üzerinden mesaj'], ['both', 'İkisi de olsun']];
  return html`
    <div class="stack-xs">
      <span class="fld"><span>İletişim yöntemi</span></span>
      <div class="row chips">${opts.map(([v, l]) => html`<${Pill} on=${(value || 'whatsapp') === v} onClick=${() => onChange(v)}>${l}<//>`)}</div>
      <span class="muted small">"WhatsApp numaram"da numaran yine gizli kalır, sadece WhatsApp butonu çıkar. "Site üzerinden mesaj"da numaran hiç paylaşılmaz; ilgilenenler seninle site içindeki mesajlaşmadan konuşur.</span>
    </div>`;
}

const msgTime = (ts) => {
  const d = new Date(ts); const now = new Date();
  const hm = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return hm;
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) + ' ' + hm;
};

function ChatWidget({ me, unread, onRead }) {
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState(null);
  const [active, setActive] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const uid = me && me.user.id;
  const endRef = useRef(null);
  if (!me || !me.profile || me.profile.is_staff || me.profile.status !== 'onaylandi') return null;

  const loadThreads = useCallback(async () => { const { data } = await sb.rpc('my_threads'); setThreads(data || []); }, []);
  const loadMsgs = useCallback(async (tid) => {
    if (!tid) return;
    const { data } = await sb.from('dm_messages').select('id,sender_id,body,created_at').eq('thread_id', tid).order('created_at');
    setMsgs(data || []);
    await sb.rpc('dm_mark_read', { p_thread: tid }); onRead && onRead(); loadThreads();
  }, [loadThreads, onRead]);
  useEffect(() => { if (open) loadThreads(); }, [open, loadThreads]);
  useEffect(() => { if (open && active) loadMsgs(active); }, [open, active]);
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => { active ? loadMsgs(active) : loadThreads(); }, 5000);
    return () => clearInterval(t);
  }, [open, active, loadMsgs, loadThreads]);
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView(); }, [msgs.length]);

  const cur = (threads || []).find((t) => t.thread_id === active);
  const send = async (e) => {
    e.preventDefault(); const b = text.trim(); if (!b || !active) return;
    setText(''); const tmp = { id: 'tmp' + Date.now(), sender_id: uid, body: b, created_at: new Date().toISOString(), pending: true };
    setMsgs((m) => [...m, tmp]);
    const r = await sendMessage(active, b);
    if (r.error) { setMsgs((m) => m.filter((x) => x !== tmp)); setText(b); return toast(r.error, 'err'); }
    loadMsgs(active);
  };

  return html`
    <div class="cw">
      ${open ? html`
        <div class="cw-panel">
          <div class="cw-head">
            ${active ? html`<button type="button" class="cw-back" aria-label="Geri" onClick=${() => setActive(null)}>‹</button>` : null}
            <b>${active && cur ? cur.other_name : 'Mesajlar'}</b>
            <div class="cw-head-r">
              <a class="cw-expand" href=${active ? '#/mesajlar/' + active : '#/mesajlar'} onClick=${() => setOpen(false)} aria-label="Tam ekran">⤢</a>
              <button type="button" class="cw-x" aria-label="Kapat" onClick=${() => setOpen(false)}>✕</button>
            </div>
          </div>
          ${!active ? html`
            <div class="cw-threads">
              ${threads === null ? html`<div class="pad muted small">Yükleniyor…</div>`
                : threads.length === 0 ? html`<div class="pad muted small">Henüz mesajın yok. Bir ilandaki "Mesaj gönder" ile başlayabilirsin.</div>`
                : threads.map((t) => html`
                  <button type="button" class="cw-thread" onClick=${() => setActive(t.thread_id)}>
                    <${Avatar} url=${t.other_avatar} name=${t.other_name} size=${38} />
                    <span class="cw-thread-txt"><span class="cw-thread-top"><b>${t.other_name}</b>${t.unread ? html`<span class="msg-badge">${t.unread}</span>` : null}</span><span class="msg-thread-last">${t.last_sender === uid ? 'Sen: ' : ''}${t.last_body || '—'}</span></span>
                  </button>`)}
            </div>`
          : html`
            <div class="cw-body">
              ${msgs.map((m) => html`<div key=${m.id} class=${'msg-bubble ' + (m.sender_id === uid ? 'mine' : 'theirs') + (m.pending ? ' pending' : '')}><span>${m.body}</span><time>${msgTime(m.created_at)}</time></div>`)}
              <div ref=${endRef}></div>
            </div>
            <form class="cw-input" onSubmit=${send}>
              <input class="inp inp-sm" placeholder="Mesaj yaz…" value=${text} onInput=${(e) => setText(e.target.value)} maxlength="2000" />
              <button type="submit" class="btn btn-red btn-sm" disabled=${sending || !text.trim()}>Gönder</button>
            </form>`}
        </div>` : null}
      <button type="button" class="cw-fab" aria-label="Mesajlar" onClick=${() => setOpen(!open)}>
        ${open ? html`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`
          : html`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d=${MSG_ICON}/></svg>`}
        ${!open && unread ? html`<span class="cw-badge">${unread > 9 ? '9+' : unread}</span>` : null}
      </button>
    </div>`;
}

function Mesajlar({ me, threadId, onRead }) {
  const [threads, setThreads] = useState(null);
  const [active, setActive] = useState(threadId || null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const uid = me && me.user.id;
  const endRef = useRef(null);

  const loadThreads = useCallback(async () => {
    const { data } = await sb.rpc('my_threads');
    setThreads(data || []);
  }, []);
  const loadMsgs = useCallback(async (tid) => {
    if (!tid) return;
    const { data } = await sb.from('dm_messages').select('id,sender_id,body,created_at').eq('thread_id', tid).order('created_at');
    setMsgs(data || []);
    await sb.rpc('dm_mark_read', { p_thread: tid });
    onRead && onRead();
    loadThreads();
  }, [loadThreads, onRead]);

  useEffect(() => { if (me) loadThreads(); }, [me, loadThreads]);
  useEffect(() => { setActive(threadId || null); }, [threadId]);
  useEffect(() => { if (active) loadMsgs(active); else setMsgs([]); }, [active]);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => loadMsgs(active), 5000);
    return () => clearInterval(t);
  }, [active, loadMsgs]);
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView(); }, [msgs.length]);

  if (me === undefined) return html`<${Loading} />`;
  if (!me) return html`<div class="stack"><h1 class="h page-h">Mesajlar</h1><p class="muted">Mesajlarını görmek için giriş yap.</p><a class="btn btn-red self-start" href="#/giris">Giriş yap</a></div>`;
  if (me.profile.status !== 'onaylandi') return html`<div class="stack"><h1 class="h page-h">Mesajlar</h1><p class="muted">Mesajlaşma, üyeliğin onaylandıktan sonra açılır.</p><a class="btn btn-red self-start" href="#/onay">Hesabımı onayla</a></div>`;

  const cur = (threads || []).find((t) => t.thread_id === active);
  const send = async (e) => {
    e.preventDefault();
    const b = text.trim();
    if (!b || !active) return;
    setText(''); const tmp = { id: 'tmp' + Date.now(), sender_id: uid, body: b, created_at: new Date().toISOString(), pending: true };
    setMsgs((m) => [...m, tmp]);
    const r = await sendMessage(active, b);
    if (r.error) { setMsgs((m) => m.filter((x) => x !== tmp)); setText(b); return toast(r.error, 'err'); }
    loadMsgs(active);
  };

  return html`
    <div class=${'msgs' + (active ? ' msgs-open' : '')}>
      <aside class="msg-list">
        <h1 class="h2 msg-list-h">Mesajlar</h1>
        <${NotifyToggle} me=${me} compact=${true} />
        ${threads === null ? html`<${Loading} />` : threads.length === 0 ? html`<p class="muted pad">Henüz mesajın yok. Bir ilandaki "Mesaj gönder" ile konuşma başlatabilirsin.</p>` : html`
          <div class="msg-threads">
            ${threads.map((t) => html`
              <button type="button" class=${'msg-thread' + (t.thread_id === active ? ' on' : '')} onClick=${() => { setActive(t.thread_id); location.hash = '#/mesajlar/' + t.thread_id; }}>
                <${Avatar} url=${t.other_avatar} name=${t.other_name} size=${44} />
                <span class="msg-thread-txt">
                  <span class="msg-thread-top"><b>${t.other_name}</b><span class="msg-thread-time">${msgTime(t.last_message_at)}</span></span>
                  ${t.context_title ? html`<span class="msg-ctx">${t.context_title}</span>` : null}
                  <span class="msg-thread-last">${t.last_sender === uid ? 'Sen: ' : ''}${t.last_body || '—'}</span>
                </span>
                ${t.unread ? html`<span class="msg-badge">${t.unread}</span>` : null}
              </button>`)}
          </div>`}
      </aside>
      <section class="msg-pane">
        ${!active ? html`<div class="msg-empty"><p class="muted">Soldan bir konuşma seç.</p></div>` : html`
          <div class="msg-head">
            <button type="button" class="msg-back" aria-label="Geri" onClick=${() => { setActive(null); location.hash = '#/mesajlar'; }}>‹</button>
            ${cur ? html`<a class="msg-head-who" href=${'#/uye/' + cur.other_id}><${Avatar} url=${cur.other_avatar} name=${cur.other_name} size=${36} /><div class="stack-0"><b>${cur.other_name}</b>${cur.context_title ? html`<span class="muted small">${cur.context_title}</span>` : null}</div></a>` : null}
          </div>
          <div class="msg-body">
            ${msgs.map((m) => html`<div key=${m.id} class=${'msg-bubble ' + (m.sender_id === uid ? 'mine' : 'theirs') + (m.pending ? ' pending' : '')}><span>${m.body}</span><time>${msgTime(m.created_at)}</time></div>`)}
            <div ref=${endRef}></div>
          </div>
          <form class="msg-input" onSubmit=${send}>
            <input class="inp" placeholder="Mesaj yaz…" value=${text} onInput=${(e) => setText(e.target.value)} maxlength="2000" />
            <button type="submit" class="btn btn-red" disabled=${sending || !text.trim()}>Gönder</button>
          </form>`}
      </section>
    </div>`;
}



const Field = ({ label, hint, children }) => html`
  <label class="lbl"><span>${label}</span>${children}${hint ? html`<small class="muted">${hint}</small>` : null}</label>`;

const Loading = () => html`<div class="loading" role="status">Yükleniyor…</div>`;

function Pill({ on, onClick, children, label }) {
  return html`<button type="button" class=${'pill ' + (on ? 'pill-on' : '')} aria-pressed=${!!on} aria-label=${label} onClick=${onClick}>${children}</button>`;
}

// ---------------------------------------------------------------------
// Üst menü
// ---------------------------------------------------------------------
const NAV = [['', 'Ana Sayfa'], ['pazar', 'Müzisyen Pazarı'], ['ekipman', 'Enstrüman Pazarı'], ['prova', 'Prova Odası'], ['kurslar', 'Kurslar'], ['dinletiler', 'Dinletiler']];
const SOON = { prova: 1, kurslar: 1, dinletiler: 1 };

function Header({ me, route, unread }) {
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
          ${NAV.map(([p, l]) => html`<a href=${'#/' + p} class=${'nav-a ' + (route.page === p ? 'nav-on ' : '') + (p === 'pazar' ? 'nav-hot ' : '') + (SOON[p] ? 'nav-soon' : '')}>${l}${SOON[p] ? html`<small class="nav-tag">yakında</small>` : null}</a>`)}
        </nav>
        <div class="hdr-right">
          ${me && me.profile && !me.profile.is_staff ? html`<a class="msg-btn" href="#/mesajlar" aria-label="Mesajlar"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d=${MSG_ICON}/></svg>${unread ? html`<span class="msg-dot">${unread > 9 ? '9+' : unread}</span>` : null}</a>` : null}
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
                  <a href="#/mesajlar">Mesajlarım${unread ? ' (' + unread + ')' : ''}</a>
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
  pazar: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  ekipman: 'M20 7h-3V5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v2H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1zM9 5h6v2H9z'
};
const BNAV = [['', 'Ana Sayfa', 'home'], ['pazar', 'Müzisyen', 'pazar'], ['ekipman', 'Enstrüman', 'ekipman'], ['prova', 'Prova', 'prova'], ['kurslar', 'Kurslar', 'kurslar'], ['dinletiler', 'Dinleti', 'dinletiler']];

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
  const ref = useRef(null);
  useEffect(() => { const el = ref.current && ref.current.querySelector('.bnav-on'); if (el) el.scrollIntoView({ inline: 'nearest', block: 'nearest' }); }, [route.page]);
  return html`
    <nav class="bnav" aria-label="Alt menü" ref=${ref}>
      ${BNAV.map(([p, l, ic]) => html`
        <a href=${'#/' + p} class=${'bnav-a ' + (route.page === p ? 'bnav-on ' : '') + (SOON[p] ? 'bnav-soon' : '')} aria-current=${route.page === p ? 'page' : null}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${ICON[ic]} /></svg>
          <span>${l}</span>
        </a>`)}
    </nav>`;
}

// ---------------------------------------------------------------------
// Okul maili ile hesap onayı
// ---------------------------------------------------------------------
const WEBMAIL = 'https://webmail.baskent.edu.tr/';
async function sendSchoolMail() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return { error: 'Önce giriş yapmalısın.' };
  const r = await fetch('/api/password', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ action: 'verify_send' }) });
  const d = await r.json().catch(() => ({}));
  return r.ok ? d : { error: d.error || 'Mail gönderilemedi.' };
}

function SchoolVerify({ studentNo, autoSend, onCheck }) {
  const [state, setState] = useState(autoSend ? 'sending' : 'idle');
  const [msg, setMsg] = useState('');
  const send = async () => {
    setState('sending'); setMsg('');
    const r = await sendSchoolMail();
    if (r.already) { setState('sent'); onCheck && onCheck(); return; }
    if (r.error) { setState('error'); setMsg(r.error); return; }
    setState('sent');
  };
  useEffect(() => { if (autoSend) send(); }, []);
  // Onaylanana kadar her 15 sn'de bir kendini kontrol et; kullanıcı telefonda linke bassa bile bu sekme kendiliğinden ilerler
  useEffect(() => {
    if (!onCheck) return;
    let alive = true;
    const t = setInterval(async () => {
      try { const me = await loadMe(); if (alive && me && me.profile && me.profile.status === 'onaylandi') { clearInterval(t); onCheck(); } } catch (e) {}
    }, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const addr = (studentNo || 'öğrencino') + '@mail.baskent.edu.tr';
  return html`
    <section class="verify">
      <div class="verify-head">
        <span class="guide-badge">Son adım</span>
        <h2 class="h verify-h">Okul mailinle hesabını onayla</h2>
        <p>Öğrenci numaranın sana ait olduğunu doğrulamak için okul mail adresine <b class="mono">${addr}</b> bir onay linki ${state === 'sent' ? 'gönderdik' : 'gönderiyoruz'}. Linke tıkladığın an hesabın onaylanır.</p>
        ${state === 'sending' ? html`<p class="verify-status">📨 Onay maili gönderiliyor…</p>` : null}
        ${state === 'sent' ? html`<p class="verify-status verify-ok">✅ Onay maili yola çıktı! Okulun spam filtresi yüzünden gelmesi <b>birkaç dakika</b> sürebilir — bu normal. Hesabın oluşturuldu; istersen bu sayfayı kapatıp mail gelince linke tıklayabilirsin, ya da burada bekle, linke basınca bu ekran kendiliğinden ilerler.</p>` : null}
        ${state === 'error' ? html`<p class="verify-status verify-err">⚠️ ${msg}</p>` : null}
      </div>
      <ol class="verify-steps">
        <li><b>Okul mailine gir</b><span><a href=${WEBMAIL} target="_blank" rel="noopener">webmail.baskent.edu.tr</a> adresini aç.</span></li>
        <li><b>"Öğrenci"yi seç</b><span>Giriş ekranının altındaki kutuda <b>"Akademik ve İdari"</b> yazıyor; onu <b>"Öğrenci"</b> olarak değiştir.</span></li>
        <li><b>Giriş yap</b><span>Kullanıcı adına <b>öğrenci numaranı</b> (sadece rakamlar, @ olmadan), şifre kısmına <b>okul mail şifreni</b> yaz ve Login'e bas.</span></li>
        <li><b>Linke tıkla</b><span>"BÜMT: Hesabını onayla" mailini aç ve <b>"Hesabımı onayla"</b> butonuna bas. Mail gelen kutusunda yoksa <b>Spam / Junk</b> klasörüne bak.</span></li>
      </ol>
      <div class="verify-foot">
        <a class="btn btn-red" href=${WEBMAIL} target="_blank" rel="noopener">Okul mailini aç ↗</a>
        <button type="button" class="btn btn-ghost" disabled=${state === 'sending'} onClick=${send}>${state === 'idle' ? 'Onay mailini gönder' : 'Maili tekrar gönder'}</button>
        ${onCheck ? html`<button type="button" class="btn btn-ghost" onClick=${onCheck}>Onayladım, kontrol et</button>` : null}
      </div>
      <p class="verify-note">Mail gelene kadar <a href="#/pazar">müzisyen pazarındaki ilanlara göz atabilirsin</a>. İlan verebilmen için hesabının onaylanması yeterli.</p>
      <p class="verify-note">Okul mail şifreni bilmiyorsan <a href="https://bidb.baskent.edu.tr/sifre.php" target="_blank" rel="noopener">buradan</a> şifre işlemlerini yapabilirsin. Okul mailine hiç ulaşamıyorsan dert etme: yönetim kurulu başvurunu elle de onaylayabilir.</p>
    </section>`;
}

function OnayPage({ me, refresh }) {
  if (me === undefined) return html`<${Loading} />`;
  if (!me) return html`<div class="stack"><h1 class="h page-h">Hesap onayı</h1><p class="muted">Önce giriş yap.</p><a class="btn btn-red self-start" href="#/giris">Giriş yap</a></div>`;
  if (me.profile.status === 'onaylandi') return html`
    <div class="card pad-lg stack narrow"><span class="tag tag-dark self-start">Onaylı üye</span><h1 class="h2">Hesabın onaylı 🎉</h1><p class="muted">Müzisyen pazarında ilan verebilir, topluluk WhatsApp grubuna katılabilirsin.</p><a class="btn btn-red self-start" href="#/pazar">Müzisyen pazarına git</a></div>`;
  return html`<div class="narrow-wide"><${SchoolVerify} studentNo=${me.profile.student_no} onCheck=${refresh} /></div>`;
}

function StatusBanner({ me }) {
  if (!me || !me.profile || me.profile.is_staff) return null;
  if (me.profile.status === 'bekliyor') return html`
    <div class="banner"><div class="wrap">Üyeliğin <b>onay bekliyor</b>. Okul mailinle hemen onaylayabilirsin: <a href="#/onay"><b>Nasıl yapılır? →</b></a></div></div>`;
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
const WA_ICON = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z';
// E-posta bildirimi aç/kapa — dokununca anında kaydedilir (Kaydet gerekmez)
function NotifyToggle({ me, compact }) {
  const p = me && me.profile;
  const [on, setOn] = useState(p ? p.notify_dm !== false : true);
  const [busy, setBusy] = useState(false);
  if (!p || !('notify_dm' in p)) return null;
  const flip = async () => {
    const v = !on; setOn(v); setBusy(true);
    const { error } = await sb.from('profiles').update({ notify_dm: v }).eq('id', p.id);
    setBusy(false);
    if (error) { setOn(!v); return toast('Kaydedilemedi: ' + error.message, 'err'); }
    p.notify_dm = v;
    toast(v ? 'Yeni mesajlarda e-posta alacaksın.' : 'Mesaj e-postaları kapatıldı.');
  };
  const sw = html`<button type="button" role="switch" aria-checked=${on} disabled=${busy} class=${'sw' + (on ? ' sw-on' : '')} onClick=${flip}><span></span></button>`;
  if (compact) return html`<div class="notify-mini">${sw}<span>E-posta bildirimi ${on ? 'açık' : 'kapalı'}</span></div>`;
  return html`
    <div class="card pad notify-card">
      <div class="stack-xs">
        <b>🔔 Mesaj bildirimleri</b>
        <span class="muted small">Biri sana site üzerinden mesaj yazınca ${p.contact_email ? html`<b>${p.contact_email}</b>` : 'e-posta adresine'} haber verelim.${!p.contact_email ? ' (Önce aşağıdan bir e-posta adresi ekle.)' : ''}</span>
      </div>
      ${sw}
    </div>`;
}

function WaGroupCard({ me, compact }) {
  const [link, setLink] = useState(null);
  const approved = me && me.profile && me.profile.status === 'onaylandi';
  useEffect(() => {
    if (!approved) return;
    sb.rpc('whatsapp_group_link').then(({ data, error }) => setLink(error ? '' : (data || '')));
  }, [approved]);
  if (!me || !me.profile || me.profile.is_staff) return null;
  if (!approved) return compact ? null : html`
    <div class="wa-card wa-card-wait">
      <span class="wa-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d=${WA_ICON} /></svg></span>
      <div><b>Topluluk WhatsApp grubu</b><span>Üyeliğin onaylandığında grubun katılım linki burada görünecek.</span></div>
    </div>`;
  if (!link) return null;
  return html`
    <a class=${'wa-card' + (compact ? ' wa-card-compact' : '')} href=${link} target="_blank" rel="noopener">
      <span class="wa-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d=${WA_ICON} /></svg></span>
      <div><b>Topluluk WhatsApp grubuna katıl</b><span>Duyurular, prova ve etkinlik haberleri ilk burada. Sadece üyelere özel.</span></div>
      <span class="wa-go">Katıl →</span>
    </a>`;
}

const isAnnouncement = (e) => /^duyuru$/i.test(String(e.tag || '').trim());

function Home({ me }) {
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
      <p class="hero-sub"><b>Müzisyen pazarı açıldı!</b> Grubuna davulcu mu arıyorsun, ya da çalacak bir grup mu? İlanını ver, kampüsteki müzisyenlerle tanış.</p>
      <p class="hero-sub"><b>Enstrüman pazarı da açıldı!</b> Kullanmadığın enstrümanını ya da ekipmanını sat, aradığın ikinci el parçayı kampüste bul.</p>
      <div class="hero-cta">
        <a class="btn btn-red btn-lg hero-pazar" href="#/pazar">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8" /></svg>
          Müzisyen pazarı</a>
        <a class="btn btn-red btn-lg hero-pazar" href="#/ekipman">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d=${ICON.ekipman} /></svg>
          Enstrüman pazarı</a>
        ${me ? null : html`<a class="btn btn-cream btn-lg" href="#/kayit">Hemen üye ol</a>`}
      </div>
      <div class="hero-soon"><span>Yakında</span>Prova odası · Enstrüman kursları · Dinletiler</div>
    </section>

    <${WaGroupCard} me=${me} compact=${true} />

    <section class="sec">
      <div class="sec-head"><h2 class="h">Yaklaşan etkinlikler ve duyurular</h2></div>
      ${events === null ? html`<${Loading} />` : events.length === 0 ? html`
        <p class="muted">Şu an duyurulmuş bir etkinlik yok. Takipte kal!</p>` : html`
        ${events.filter(isAnnouncement).length ? html`<div class="notes">${events.filter(isAnnouncement).map((e) => html`<${NoticeCard} e=${e} />`)}</div>` : null}
        ${events.filter((e) => !isAnnouncement(e)).length ? html`<div class="cards">${events.filter((e) => !isAnnouncement(e)).map((e, i) => html`<${EventCard} e=${e} i=${i} />`)}</div>` : null}`}
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
function NoticeCard({ e }) {
  const href = e.form_id ? '#/form/' + e.form_id : e.cta_url;
  const ext = !e.form_id && e.cta_url;
  const when = e.starts_on ? fmtLong(e.starts_on) : (e.date_text || fmtLong(String(e.created_at || '').slice(0, 10)));
  return html`
    <article class="notice">
      <div class="notice-side" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="26" height="26"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15 9a3 3 0 0 1 0 6M18 6a7 7 0 0 1 0 12" /></svg>
      </div>
      <div class="notice-body">
        <div class="row-sm"><span class="tag tag-red">Duyuru</span><span class="muted small">${when}</span></div>
        <h3 class="notice-title">${e.title}</h3>
        ${e.description ? html`<p class="notice-text">${richText(e.description)}</p>` : null}
        ${href || e.poster_url ? html`<div class="row-sm">
          ${href ? html`<a class="btn btn-dark btn-sm" href=${href} target=${ext ? '_blank' : null} rel=${ext ? 'noopener' : null}>${e.cta_label || 'Detaylar'}</a>` : null}
          ${e.poster_url ? html`<a class="btn btn-ghost btn-sm" href=${'#/etkinlik/' + e.id}>Görseli gör</a>` : null}
        </div>` : null}
      </div>
    </article>`;
}

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
// Prova odası henüz açılmadı: üyelere "yakında" ekranı; prova yetkilileri gerçek sayfayı görür.
const PROVA_SOON = true;
function Prova({ me }) {
  const staff = me && me.can && me.can('prova');
  if (PROVA_SOON && !staff) return html`<${ProvaSoon} me=${me} />`;
  return html`
    ${PROVA_SOON ? html`<div class="admin-note">👀 Üyeler bu sayfada "Yakında" ekranını görüyor. Sen prova yetkin olduğu için asıl sayfayı görüyorsun.</div>` : null}
    <${ProvaReal} me=${me} />`;
}

function ProvaSoon({ me }) {
  return html`
    <section class="soon">
      <div class="soon-eq" aria-hidden="true">${Array.from({ length: 24 }, (_, i) => html`<span style=${'animation-delay:' + ((i * 137) % 900) / 1000 + 's'}></span>`)}</div>
      <div class="soon-in">
        <span class="soon-kicker">Çok yakında</span>
        <h1 class="h soon-h">Prova odası<br /><span>kapılarını açıyor.</span></h1>
        <p class="soon-lead">Grubunla çalacak bir yer mi arıyorsun? BÜMT prova odası çok yakında topluluk üyelerinin hizmetinde.</p>
        <div class="soon-facts">
          <div class="soon-fact"><b>Her hafta</b><span>Cuma günleri</span></div>
          <div class="soon-fact"><b>2 saat</b><span>Grubuna özel prova</span></div>
          <div class="soon-fact"><b>Üyelere</b><span>özel rezervasyon</span></div>
        </div>
        <p class="soon-note">Rezervasyon sistemi, kurallar ve tüm detaylar yakında burada ve Instagram'da duyurulacak.</p>
        <div class="soon-cta">
          ${me ? null : html`<a class="btn btn-red btn-lg" href="#/kayit">Şimdiden üye ol</a>`}
          <a class="btn btn-lg soon-ig" href="https://www.instagram.com/baskentmt/" target="_blank" rel="noopener">@baskentmt'yi takip et</a>
        </div>
      </div>
    </section>`;
}

function ProvaReal({ me }) {
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
      sb.from('instructors').select('id,full_name,instrument,kind,department,class_year,bio,profile_id,avatar_url,contact_pref' + (HAS_FACULTY ? ',faculty' : '')).eq('active', true).order('instrument').order('full_name'),
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
  const Contact = ({ t, small }) => html`<${ContactButtons} me=${me} approved=${approvedMember} pref=${t.contact_pref} size=${small ? 'sm' : ''} ctx=${{ kind: 'instructor', title: t.instrument + ' dersi', otherId: t.profile_id, id: t.id }} />`;

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
        <p class="muted measure">Topluluğumuzda enstrüman çalan gönüllü öğrencilerimiz, diğer üyelere ücretsiz ders veriyor. Her gönüllü müsait saatlerini kendisi işaretler; bir gönüllü seç, takviminden boş bir saate talep gönder, onaylanınca ders senin.</p>
      </div>
      ${data.ins.length === 0 ? html`
        <section class="guide guide-light" aria-label="Enstrüman kursları nasıl işleyecek">
          <div class="guide-head">
            <span class="guide-badge">Çok yakında</span>
            <h2 class="h guide-h">Öğrenciden öğrenciye, ücretsiz dersler</h2>
            <p class="guide-lead">Gitar, piyano, davul, keman, vokal… Enstrüman çalan gönüllü üyelerimiz burada listelenecek. Gönüllüler yakında eklenecek, takipte kal!</p>
          </div>
          <ol class="guide-steps">
            <li><b>Gönüllünü seç</b><span>Öğrenmek istediğin enstrümana göre gönüllüleri filtrele.</span></li>
            <li><b>Saatini iste</b><span>Takviminden sana uyan boş bir saate ders talebi gönder.</span></li>
            <li><b>Çalmaya başla</b><span>Gönüllü onaylayınca ders senin. Tamamen ücretsiz!</span></li>
          </ol>
          <div class="guide-foot"><span>Sen de ders vermek ister misin? Yönetim kuruluna ya da @baskentmt'ye yaz, gönüllülerimiz arasına katıl.</span></div>
        </section>` : html`
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
        <p class="muted measure">Dinleti programı henüz kesinleşmedi. <b class="ink">Detaylar çok yakında</b> burada ve Instagram hesabımızda duyurulacak, takipte kal!</p>
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
    <div class="narrow-wide stack">
      <div class="stack-xs"><span class="tag tag-cream self-start">Kaydın alındı 🎉</span><h1 class="h page-h">Neredeyse tamam!</h1></div>
      <${SchoolVerify} studentNo=${done} autoSend=${true} onCheck=${() => { location.hash = '#/onay'; }} />
    </div>`;

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const no = f.student_no.trim().replace(/\s+/g, '');
    if (!/^[0-9]{8}$/.test(no)) return setErr('Öğrenci numarası 8 haneli olmalı. Lütfen 8 haneli öğrenci numaranı yaz.');
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
    setDone(no);
    window.scrollTo(0, 0);
  };

  return html`
    <div class="split">
      <div class="stack split-side">
        <h1 class="h page-h">Üye ol</h1>
        <p class="muted">Kısa bir form. Öğrenci numaranı topluluk üye listesiyle karşılaştırıp hesabını onaylıyoruz; onaydan sonra müzisyen pazarında ilan verebilir, ilanlardaki müzisyenlere yazabilirsin. Prova odası, kurslar ve dinletiler de yakında!</p>
        <p class="small">Zaten hesabın var mı? <a href="#/giris">Giriş yap</a></p>
      </div>
      <form class="card pad-lg stack split-main" onSubmit=${submit}>
        <div class="fgrid">
          <${Field} label="Ad Soyad"><input class="inp" required autocomplete="name" value=${f.full_name} onInput=${set('full_name')} /><//>
          <${Field} label="Öğrenci numarası" hint=${f.student_no && !/^[0-9]{8}$/.test(f.student_no.replace(/\s+/g, '')) ? '⚠️ Öğrenci numarası 8 haneli olmalı (' + f.student_no.replace(/\D/g, '').length + '/8)' : '8 haneli öğrenci numaran · Giriş yaparken bunu kullanacaksın'}><input class=${'inp' + (f.student_no && !/^[0-9]{8}$/.test(f.student_no.replace(/\s+/g, '')) ? ' inp-bad' : '')} required inputmode="numeric" pattern="[0-9]{8}" maxlength="8" title="8 haneli öğrenci numaranı yaz" placeholder="ör. 22012345" value=${f.student_no} onInput=${(e) => setF({ ...f, student_no: e.target.value.replace(/\D/g, '').slice(0, 8) })} /><//>
          <${Field} label="Telefon (WhatsApp)"><input class="inp" type="tel" required autocomplete="tel" value=${f.phone} onInput=${set('phone')} placeholder="05xx xxx xx xx" /><//>
          <${Field} label="Kişisel e-posta" hint="Gmail, Outlook gibi kişisel bir adres yaz; okul e-postanı DEĞİL. Şifre sıfırlama ve yeni mesaj bildirimleri buraya gelir."><input class="inp" type="email" required autocomplete="email" value=${f.contact_email} onInput=${set('contact_email')} placeholder="ornek@gmail.com" /><//>
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

      <${WaGroupCard} me=${me} />
      <${NotifyToggle} me=${me} />
      ${p.status === 'bekliyor' && !p.is_staff ? html`<${SchoolVerify} studentNo=${p.student_no} onCheck=${refresh} />` : null}

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
    if (me && me.instructor) setF({ phone: me.instructor.phone, email: me.instructor.email || '', bio: me.instructor.bio, contact_pref: me.instructor.contact_pref || 'whatsapp' });
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
    const { error } = await sb.from('instructors').update({ phone: f.phone, email: f.email.trim(), bio: f.bio, contact_pref: f.contact_pref || 'whatsapp' }).eq('id', ins.id);
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
          <${ContactPrefField} value=${f.contact_pref} onChange=${(v) => setF({ ...f, contact_pref: v })} />
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
  const [guide, setGuide] = useState(false);
  useEffect(() => {
    // 020 çalıştırılmadıysa kutu varsayılan olarak görünür
    sb.from('settings').select('pazar_guide').eq('id', 1).maybeSingle().then(({ data, error }) => setGuide(error || !data ? true : data.pazar_guide !== false));
  }, []);

  const load = useCallback(async () => {
    let { data, error } = await sb.from('market_posts').select(MARKET_COLS + ',review,review_reason').eq('active', true).order('created_at', { ascending: false });
    if (error) ({ data, error } = await sb.from('market_posts').select('id,user_id,kind,title,my_role,looking_for,genre,description,display_name,avatar_url,active,created_at').eq('active', true).order('created_at', { ascending: false }));
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
    setForm({ kind: POST_KINDS[0], title: '', my_role: (me.profile.instruments || []).join(', '), looking_for: [], genre: '', description: '', contact_pref: 'whatsapp' });
    setTimeout(() => { const el = document.getElementById('ilan-form'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
  };
  const save = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast('İlana bir başlık yaz.', 'err');
    const row = { kind: form.kind, title: form.title.trim(), my_role: form.my_role.trim(), looking_for: form.looking_for, genre: form.genre.trim(), description: form.description.trim(), contact_pref: form.contact_pref || 'whatsapp' };
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

      ${guide && !form ? html`
        <section class="guide" aria-label="Müzisyen pazarı nasıl kullanılır">
          <div class="guide-head">
            <span class="guide-badge">Yeni</span>
            <h2 class="h guide-h">Grubunu burada kur! 🎸</h2>
            <p class="guide-lead">Davulcu mu arıyorsun, basçısı eksik bir grup mu? Müzisyen pazarı, kampüsteki müzisyenlerin birbirini bulduğu yer. 3 adımda kullanımı:</p>
          </div>
          <ol class="guide-steps">
            <li><b>İlanını ver</b><span>"+ İlan ver"e bas. Grup mu kuruyorsun, gruba mı katılmak istiyorsun seç; ne çaldığını, kimi aradığını ve tarzını yaz.</span></li>
            <li><b>Keşfet</b><span>"Aranan" filtresinden kendi enstrümanını seç, seni arayan grupları anında gör.</span></li>
            <li><b>Tek tıkla yaz</b><span>Beğendiğin ilanda "Mesaj gönder" ile site üzerinden özelden yaz ya da WhatsApp butonuna bas. Numaran sitede kimseye gösterilmez.</span></li>
          </ol>
          <div class="guide-foot">
            <span>İlan vermek için onaylı ve müzisyen üye olman gerekir · Aynı anda en fazla 3 ilan · İlanlar yayınlanmadan önce kontrol edilir</span>
            <button type="button" class="btn btn-red btn-sm" onClick=${newPost}>${posts && posts.length ? 'Sen de ilanını ver →' : 'İlk ilanı sen ver →'}</button>
          </div>
        </section>` : null}

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
          <${ContactPrefField} value=${form.contact_pref} onChange=${(v) => setForm({ ...form, contact_pref: v })} />
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
                  : html`<${ContactButtons} me=${me} approved=${approved} pref=${p.contact_pref} size="sm" ctx=${{ kind: 'market', title: p.title, otherId: p.user_id, id: p.id }} />`}
                  ${canModerate && !mine ? html`<button type="button" class="link-btn" onClick=${() => close(p, true)}>Kaldır</button>` : null}
                </div>
              </article>`;
          })}
        </div>`}
    </div>`;
}

const MARKET_COLS = 'id,user_id,kind,title,my_role,looking_for,genre,description,display_name,avatar_url,active,created_at,contact_pref';
async function checkPost(id, isNew) {
  try {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch('/api/pazar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session && session.access_token) }, body: JSON.stringify({ id, is_new: isNew }) });
    return await r.json().catch(() => null);
  } catch (e) { return null; }
}

// ---------------------------------------------------------------------
// Enstrüman pazarı (ikinci el satış ilanları)
// ---------------------------------------------------------------------
const EQ_CATS = ['Gitar', 'Bas Gitar', 'Davul & Perküsyon', 'Klavye & Piyano', 'Yaylı', 'Nefesli', 'Amfi & Efekt', 'Mikrofon & Ses', 'Aksesuar', 'Diğer'];
const EQ_CONDS = [['sifir', 'Sıfır'], ['az_kullanilmis', 'Az kullanılmış'], ['ikinci_el', 'İkinci el']];
const EQ_COLS = 'id,user_id,category,title,price,is_negotiable,condition,description,photos,sold,active,created_at,display_name,avatar_url,contact_pref';
const condLabel = (c) => (EQ_CONDS.find((x) => x[0] === c) || [, 'İkinci el'])[1];
const priceLabel = (p) => p.price == null ? 'Fiyat yok' : Number(p.price).toLocaleString('tr-TR') + ' TL';

async function checkEquip(id, isNew) {
  try {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch('/api/ekipman', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session && session.access_token) }, body: JSON.stringify({ id, is_new: isNew }) });
    return await r.json().catch(() => null);
  } catch (e) { return null; }
}

async function uploadEquipPhoto(file, uid) {
  const blob = await compressImage(file, 1400);
  const path = uid + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
  const { error } = await sb.storage.from('equipment').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '3600' });
  if (error) throw error;
  return sb.storage.from('equipment').getPublicUrl(path).data.publicUrl;
}

function Ekipman({ me }) {
  const [posts, setPosts] = useState(null);
  const [cat, setCat] = useState('Tümü');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [detail, setDetail] = useState(null);
  const [guide, setGuide] = useState(false);
  useEffect(() => { sb.from('settings').select('ekipman_guide').eq('id', 1).maybeSingle().then(({ data, error }) => setGuide(error || !data ? true : data.ekipman_guide !== false)); }, []);
  const uid = me && me.user.id;
  const approved = me && me.profile && me.profile.status === 'onaylandi';
  const canModerate = me && me.can && me.can('uyeler');

  const load = useCallback(async () => {
    let { data, error } = await sb.from('equipment_posts').select(EQ_COLS + ',review,review_reason').eq('active', true).order('created_at', { ascending: false });
    if (error) ({ data, error } = await sb.from('equipment_posts').select('id,user_id,category,title,price,is_negotiable,condition,description,photos,sold,active,created_at,display_name,avatar_url').eq('active', true).order('created_at', { ascending: false }));
    if (error) toast(errMsg(error), 'err');
    setPosts(data || []);
    (data || []).filter((p) => p.review === 'kontrol' && p.user_id === uid).forEach((p) => checkEquip(p.id, false).then(() => setTimeout(load, 400)));
  }, [uid]);
  useEffect(() => { load(); }, [load]);
  if (!posts) return html`<${Loading} />`;

  const shown = posts.filter((p) => cat === 'Tümü' || p.category === cat);
  const cats = ['Tümü', ...EQ_CATS.filter((c) => posts.some((p) => p.category === c))];

  const newPost = () => {
    if (!me) return go('/giris');
    if (!approved) return toast('İlan vermek için üyeliğinin onaylanması gerekiyor.', 'err');
    setForm({ category: EQ_CATS[0], title: '', price: '', is_negotiable: false, condition: 'ikinci_el', description: '', photos: [], contact_pref: 'whatsapp' });
    setTimeout(() => { const el = document.getElementById('eq-form'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
  };
  const onPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const room = 4 - form.photos.length;
    if (room <= 0) return toast('En fazla 4 fotoğraf ekleyebilirsin.', 'err');
    setBusy(true);
    try {
      const urls = [];
      for (const f of files.slice(0, room)) urls.push(await uploadEquipPhoto(f, uid));
      setForm((cur) => ({ ...cur, photos: [...cur.photos, ...urls] }));
    } catch (err) { toast(errMsg(err), 'err'); }
    setBusy(false);
  };
  const save = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast('İlana bir başlık yaz.', 'err');
    if (!form.photos.length) return toast('En az bir fotoğraf ekle.', 'err');
    const price = form.price === '' ? null : Math.max(0, Math.round(Number(String(form.price).replace(/[^\d]/g, '')) || 0));
    const row = { category: form.category || EQ_CATS[0], title: form.title.trim(), price, is_negotiable: !!form.is_negotiable, condition: form.condition, description: form.description.trim(), photos: form.photos, contact_pref: form.contact_pref || 'whatsapp' };
    const { data, error } = form.id ? await sb.from('equipment_posts').update(row).eq('id', form.id).select('id').single() : await sb.from('equipment_posts').insert(row).select('id').single();
    if (error) return toast(errMsg(error), 'err');
    setForm(null);
    toast('İlanın kontrol ediliyor…');
    const r = await checkEquip(data.id, !form.id);
    if (r && r.status === 'incelemede') toast('İlanın uygunsuz ifade içeriyor olabilir; yönetim kontrol ettikten sonra yayınlanacak.', 'err');
    else toast(form.id ? 'İlanın güncellendi.' : 'İlanın yayında!');
    load();
  };
  const toggleSold = async (p) => {
    const { error } = await sb.from('equipment_posts').update({ sold: !p.sold }).eq('id', p.id);
    if (error) return toast(errMsg(error), 'err');
    load();
  };
  const close = async (p, moderate) => {
    if (!confirm(moderate ? 'Bu ilan kaldırılsın mı?' : 'İlanını kaldırmak istiyor musun? Artık listede görünmez.')) return;
    const { error } = await sb.from('equipment_posts').update({ active: false }).eq('id', p.id);
    if (error) return toast(errMsg(error), 'err');
    toast('İlan kaldırıldı.'); load();
  };
  const publish = async (p) => {
    const { error } = await sb.from('equipment_posts').update({ review: '', review_reason: '' }).eq('id', p.id);
    if (error) return toast(errMsg(error), 'err');
    toast('İlan yayına alındı.'); load();
  };

  return html`
    <div class="stack-lg">
      <div class="row between">
        <div class="stack">
          <h1 class="h page-h">Enstrüman pazarı</h1>
          <p class="muted measure">Enstrümanını ya da ekipmanını mı satıyorsun? İlan ver, fotoğrafını ve fiyatını koy. İlgilenen onaylı üyeler sana WhatsApp'tan ulaşır; numaran kimseye gösterilmez.</p>
        </div>
        <button type="button" class="btn btn-red" onClick=${newPost}>+ İlan ver</button>
      </div>

      ${guide && !form ? html`
        <section class="guide guide-light guide-compact" aria-label="Enstrüman pazarı nasıl kullanılır">
          <div class="guide-head">
            <span class="guide-badge">Nasıl çalışır?</span>
            <h2 class="h guide-h">Enstrümanını sat, ekipmanını değerlendir</h2>
            <p class="guide-lead">Kullanmadığın enstrüman ya da ekipmanı kampüsteki müzisyenlere sat.</p>
          </div>
          <ol class="guide-steps">
            <li><b>Fotoğraf + fiyat</b><span>"+ İlan ver"e bas; fotoğraflarını, fiyatını ve durumunu gir.</span></li>
            <li><b>Keşfet</b><span>İlanlara göz at, kategoriye göre süz, detayına gir.</span></li>
            <li><b>Tek tıkla yaz</b><span>Satıcıya site üzerinden özelden mesaj at ya da WhatsApp'tan ulaş.</span></li>
          </ol>
          <div class="guide-foot">
            <span>Onaylı üyeler ilan verebilir · En fazla 5 ilan · İlanlar yayından önce kontrol edilir</span>
            <button type="button" class="btn btn-red btn-sm" onClick=${newPost}>${posts.length ? 'Sen de ilanını ver →' : 'İlk ilanı sen ver →'}</button>
          </div>
        </section>` : null}

      ${form ? html`
        <form id="eq-form" class="card pad-lg stack" onSubmit=${save}>
          <h2 class="h2">${form.id ? 'İlanı düzenle' : 'Yeni ilan'}</h2>
          <div class="fgrid">
            <${Field} label="Başlık"><input class="inp" required maxlength="80" value=${form.title} onInput=${(e) => setForm({ ...form, title: e.target.value })} placeholder="Örn. Yamaha Pacifica 112V Elektro Gitar" /><//>
            <${Field} label="Kategori"><select class="inp" value=${form.category || EQ_CATS[0]} onChange=${(e) => setForm({ ...form, category: e.target.value })}>${EQ_CATS.map((c) => html`<option value=${c}>${c}</option>`)}</select><//>
            <${Field} label="Fiyat (TL)" hint="Boş bırakırsan 'fiyat yok' görünür"><input class="inp" inputmode="numeric" value=${form.price} onInput=${(e) => setForm({ ...form, price: e.target.value.replace(/[^\d]/g, '') })} placeholder="Örn. 7500" /><//>
          </div>
          <div class="row chips">
            <span class="strong small">Durum:</span>
            ${EQ_CONDS.map(([v, l]) => html`<${Pill} on=${form.condition === v} onClick=${() => setForm({ ...form, condition: v })}>${l}<//>`)}
            <label class="check"><input type="checkbox" checked=${form.is_negotiable} onChange=${(e) => setForm({ ...form, is_negotiable: e.target.checked })} /> Pazarlık payı var</label>
          </div>
          <${Field} label="Açıklama"><textarea class="inp" rows="4" maxlength="1500" value=${form.description} onInput=${(e) => setForm({ ...form, description: e.target.value })} placeholder="Markası, modeli, yaşı, kullanım durumu, varsa kusurları, kutusu/aksesuarları, görüşülecek yer…"></textarea><//>
          <div class="stack-xs">
            <span class="fld"><span>Fotoğraflar (en fazla 4)</span></span>
            <div class="eq-upload">
              ${form.photos.map((u, i) => html`<div class="eq-thumb"><img src=${u} alt="" /><button type="button" aria-label="Fotoğrafı sil" onClick=${() => setForm({ ...form, photos: form.photos.filter((_, j) => j !== i) })}>✕</button></div>`)}
              ${form.photos.length < 4 ? html`<label class=${'eq-add' + (busy ? ' eq-add-busy' : '')}>${busy ? '…' : '+ Fotoğraf'}<input type="file" accept="image/*" multiple hidden onChange=${onPhotos} /></label>` : null}
            </div>
          </div>
          <${ContactPrefField} value=${form.contact_pref} onChange=${(v) => setForm({ ...form, contact_pref: v })} />
          <div class="row">
            <button type="submit" class="btn btn-red" disabled=${busy}>${form.id ? 'Kaydet' : 'İlanı yayınla'}</button>
            <button type="button" class="btn btn-ghost" onClick=${() => setForm(null)}>Vazgeç</button>
          </div>
        </form>` : null}

      ${posts.length > 0 ? html`
        <div class="row chips" role="group" aria-label="Kategoriye göre filtrele">
          ${cats.map((c) => html`<${Pill} on=${cat === c} onClick=${() => setCat(c)}>${c}<//>`)}
        </div>` : null}

      ${shown.length === 0 ? html`<div class="locked"><h2 class="h2">Henüz ilan yok</h2><p class="muted">İlk ilanı sen ver!</p></div>` : html`
        <div class="eq-grid">
          ${shown.map((p) => {
            const mine = p.user_id === uid;
            const hidden = p.review === 'incelemede' || p.review === 'kontrol';
            const cover = (p.photos || [])[0];
            return html`
              <article class=${'eq-card eq-click' + (hidden ? ' post-hidden' : '') + (p.sold ? ' eq-sold' : '')} onClick=${(e) => { if (e.target.closest('.post-actions') || e.target.closest('a') || e.target.closest('button')) return; setDetail(p); }}>
                <div class="eq-cover" role="button" tabindex="0" onClick=${() => setDetail(p)} onKeyDown=${(e) => { if (e.key === 'Enter') setDetail(p); }} aria-label=${p.title + ' ilanını aç'}>
                  ${cover ? html`<img src=${cover} alt=${p.title} loading="lazy" />` : html`<span class="eq-noimg">Fotoğraf yok</span>`}
                  ${p.sold ? html`<span class="eq-sold-tag">Satıldı</span>` : null}
                  ${(p.photos || []).length > 1 ? html`<span class="eq-count">📷 ${p.photos.length}</span>` : null}
                </div>
                <div class="eq-body">
                  ${hidden ? html`<div class="post-flag">${p.review === 'kontrol' ? 'Kontrol ediliyor…' : mine ? 'İncelemede — yönetim onaylayınca yayınlanacak' : '⚠️ Gizlendi: ' + (p.review_reason || 'uygunsuz olabilir')}
                    ${canModerate && !mine && p.review === 'incelemede' ? html` <button type="button" class="link-btn" onClick=${() => publish(p)}>Yayına al</button>` : null}</div>` : null}
                  <div class="row between"><span class="eq-price">${priceLabel(p)}</span><span class="tag tag-cream">${condLabel(p.condition)}</span></div>
                  <h3 class="eq-title">${p.title}</h3>
                  <div class="row-sm">${p.category ? html`<span class="tag tag-dark">${p.category}</span>` : null}${p.is_negotiable ? html`<span class="muted small">Pazarlık payı var</span>` : null}</div>
                  ${p.description ? html`<p class="eq-desc">${p.description}</p>` : null}
                  <div class="row nowrap eq-seller">
                    <${Avatar} url=${p.avatar_url} name=${p.display_name} size=${34} />
                    <span class="small">${approved ? html`<a href=${'#/uye/' + p.user_id}><b>${p.display_name}</b></a>` : html`<b>${p.display_name}</b>`} <${UserTags} uid=${p.user_id} /></span>
                  </div>
                  <div class="row post-actions">
                    ${mine ? html`
                      <button type="button" class="btn btn-sm btn-dark" onClick=${() => toggleSold(p)}>${p.sold ? 'Satışta' : 'Satıldı'}</button>
                      <button type="button" class="btn btn-sm btn-ghost" onClick=${() => setForm({ ...p, price: p.price == null ? '' : String(p.price) })}>Düzenle</button>
                      <button type="button" class="btn btn-sm btn-ghost" onClick=${() => close(p, false)}>Kaldır</button>`
                    : html`<${ContactButtons} me=${me} approved=${approved} pref=${p.contact_pref} size="sm" ctx=${{ kind: 'equipment', title: p.title, otherId: p.user_id, id: p.id }} />`}
                    ${canModerate && !mine ? html`<button type="button" class="link-btn" onClick=${() => close(p, true)}>Kaldır</button>` : null}
                  </div>
                </div>
              </article>`;
          })}
        </div>`}
      ${detail ? html`<${EqDetail} p=${detail} me=${me} approved=${approved} canModerate=${canModerate} onClose=${() => setDetail(null)} onEdit=${(pp) => { setDetail(null); setForm({ ...pp, price: pp.price == null ? '' : String(pp.price) }); setTimeout(() => { const el = document.getElementById('eq-form'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 50); }} onSold=${async (pp) => { await toggleSold(pp); setDetail((d) => d && { ...d, sold: !pp.sold }); }} onRemove=${async (pp) => { await close(pp, pp.user_id !== uid); setDetail(null); }} onPublish=${async (pp) => { await publish(pp); setDetail((d) => d && { ...d, review: '' }); }} />` : null}
      ${viewer ? html`<${EqViewer} photos=${viewer.photos} start=${viewer.i} onClose=${() => setViewer(null)} />` : null}
    </div>`;
}

function EqDetail({ p, me, approved, canModerate, onClose, onEdit, onSold, onRemove, onPublish }) {
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [school, setSchool] = useState(null);
  useEffect(() => { if (!approved) return; sb.rpc('member_card', { p_id: p.user_id }).then(({ data }) => { if (data && data[0]) setSchool(data[0]); }).catch(() => {}); }, [p.user_id]);
  const photos = (p.photos || []).filter(Boolean);
  const mine = me && p.user_id === me.user.id;
  const hidden = p.review === 'incelemede' || p.review === 'kontrol';
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') { zoom ? setZoom(false) : onClose(); }
      if (photos.length > 1 && e.key === 'ArrowRight') setI((x) => (x + 1) % photos.length);
      if (photos.length > 1 && e.key === 'ArrowLeft') setI((x) => (x - 1 + photos.length) % photos.length); };
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [zoom]);
  return html`
    <div class="sheet" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet-card" role="dialog" aria-modal="true" aria-label=${p.title}>
        <button class="sheet-close" aria-label="Kapat" onClick=${onClose}>✕</button>
        <div class="sheet-grid">
          <div class="sheet-gallery">
            <div class="sheet-main" onClick=${() => photos.length && setZoom(true)}>
              ${photos.length ? html`<img src=${photos[i]} alt=${p.title} />` : html`<span class="eq-noimg">Fotoğraf yok</span>`}
              ${p.sold ? html`<span class="eq-sold-tag">Satıldı</span>` : null}
              ${photos.length > 1 ? html`
                <button class="lb-nav lb-prev" aria-label="Önceki" onClick=${(e) => { e.stopPropagation(); setI((i - 1 + photos.length) % photos.length); }}>‹</button>
                <button class="lb-nav lb-next" aria-label="Sonraki" onClick=${(e) => { e.stopPropagation(); setI((i + 1) % photos.length); }}>›</button>
                <span class="eq-count">${i + 1} / ${photos.length}</span>` : null}
              ${photos.length ? html`<span class="sheet-zoomhint">🔍 Büyütmek için dokun</span>` : null}
            </div>
            ${photos.length > 1 ? html`<div class="sheet-thumbs">${photos.map((u, j) => html`<button class=${'sheet-thumb' + (j === i ? ' on' : '')} onClick=${() => setI(j)}><img src=${u} alt="" /></button>`)}</div>` : null}
          </div>
          <div class="sheet-info">
            ${hidden ? html`<div class="post-flag">${p.review === 'kontrol' ? 'Kontrol ediliyor…' : mine ? 'İncelemede — yönetim onaylayınca yayınlanacak' : '⚠️ Gizlendi: ' + (p.review_reason || 'uygunsuz olabilir')}</div>` : null}
            <span class="sheet-price">${priceLabel(p)}</span>
            ${p.is_negotiable ? html`<span class="muted small">Pazarlık payı var</span>` : null}
            <h2 class="h sheet-title">${p.title}</h2>
            <div class="row-sm">${p.category ? html`<span class="tag tag-dark">${p.category}</span>` : null}<span class="tag tag-cream">${condLabel(p.condition)}</span>${p.sold ? html`<span class="tag tag-red">Satıldı</span>` : null}</div>
            <div class="row nowrap eq-seller">
              <${Avatar} url=${p.avatar_url} name=${p.display_name} size=${40} />
              <span class="small stack-xs"><span>${approved ? html`<a href=${'#/uye/' + p.user_id} onClick=${onClose}><b>${p.display_name}</b></a>` : html`<b>${p.display_name}</b>`} <${UserTags} uid=${p.user_id} /></span>${school ? html`<${SchoolLine} p=${school} cls="muted" />` : null}<span class="muted">${fmtLong(String(p.created_at).slice(0, 10))}</span></span>
            </div>
            ${p.description ? html`<div class="sheet-desc">${p.description}</div>` : html`<p class="muted">Açıklama eklenmemiş.</p>`}
            <div class="sheet-actions">
              ${mine ? html`
                <button type="button" class="btn btn-dark" onClick=${() => onSold(p)}>${p.sold ? 'Tekrar satışa al' : 'Satıldı olarak işaretle'}</button>
                <button type="button" class="btn btn-ghost" onClick=${() => onEdit(p)}>Düzenle</button>
                <button type="button" class="btn btn-ghost" onClick=${() => onRemove(p)}>İlanı kaldır</button>`
              : html`<${ContactButtons} me=${me} approved=${approved} pref=${p.contact_pref} ctx=${{ kind: 'equipment', title: p.title, otherId: p.user_id, id: p.id }} />`}
              ${canModerate && !mine ? html`<button type="button" class="btn btn-ghost" onClick=${() => onRemove(p)}>Kaldır</button>${p.review === 'incelemede' ? html`<button type="button" class="btn btn-ghost" onClick=${() => onPublish(p)}>Yayına al</button>` : null}` : null}
            </div>
          </div>
        </div>
      </div>
      ${zoom ? html`<${EqViewer} photos=${photos} start=${i} onClose=${() => setZoom(false)} />` : null}
    </div>`;
}

function EqViewer({ photos, start, onClose }) {
  const [i, setI] = useState(start || 0);
  const list = photos || [];
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') setI((x) => (x + 1) % list.length); if (e.key === 'ArrowLeft') setI((x) => (x - 1 + list.length) % list.length); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);
  return html`
    <div class="lightbox" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <button class="lb-close" aria-label="Kapat" onClick=${onClose}>✕</button>
      ${list.length > 1 ? html`<button class="lb-nav lb-prev" aria-label="Önceki" onClick=${() => setI((i - 1 + list.length) % list.length)}>‹</button>` : null}
      <img class="lb-img" src=${list[i]} alt="" />
      ${list.length > 1 ? html`<button class="lb-nav lb-next" aria-label="Sonraki" onClick=${() => setI((i + 1) % list.length)}>›</button>` : null}
      ${list.length > 1 ? html`<span class="lb-count">${i + 1} / ${list.length}</span>` : null}
    </div>`;
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
      <p>Başkent Üniversitesi Müzik Topluluğu (BÜMT) olarak, siteye üye olurken ve siteyi kullanırken paylaştığın ad soyad, öğrenci numarası, telefon, e-posta, fakülte, bölüm, sınıf, müzik bilgileri, profil fotoğrafı ve "Hakkımda" yazını; üyeliğini doğrulamak, topluluk faaliyetlerini (müzisyen pazarı, prova odası, enstrüman kursları, dinleti ve etkinlik başvuruları) yürütmek ve seninle iletişime geçmek amacıyla işliyoruz.</p>
      <p><b>Kim neyi görür?</b> Telefon numaran ve e-posta adresin sitede hiçbir üyeye gösterilmez; yalnızca topluluğun süper yöneticisi görebilir. Müzisyen pazarındaki "WhatsApp'tan yaz" butonu, numaranı göstermeden yalnızca onaylı üyelerin sana WhatsApp'tan yazabilmesini sağlar. Onaylı üyeler; adını soyadını (ilanlarda soyadının yalnızca baş harfi görünür), profil fotoğrafını, fakülte/bölüm bilgini, enstrümanlarını ve ilanlarını görebilir. Üyelik başvurularını ve talepleri yalnızca ilgili yetkiye sahip yönetim kurulu üyeleri görür.</p>
      <p><b>Prova odası fotoğrafları:</b> Prova odası kullanımı sonrası yüklenen oda fotoğrafları yalnızca kontrol amacıyla tutulur ve yönetim onayından 7 gün sonra otomatik olarak silinir.</p>
      <p><b>Hizmet sağlayıcılar:</b> Verilerin; sitenin veritabanı (Supabase), barındırma (Vercel) ve e-posta gönderimi (Resend) hizmetlerini sağlayan şirketlerin, yurt dışında da bulunabilen sunucularında saklanır ve işlenir. Müzisyen pazarı ilanlarının metni, uygunsuz içerik kontrolü için otomatik bir denetim hizmetinden geçirilebilir. Verilerin bu hizmetler dışında üçüncü kişilerle paylaşılmaz ve ticari amaçla kullanılmaz.</p>
      <p><b>Saklama süresi:</b> Bilgilerin üyeliğin devam ettiği sürece saklanır; hesabının silinmesini istediğinde silinir.</p>
      <p>6698 sayılı Kişisel Verilerin Korunması Kanunu'nun 11. maddesi kapsamındaki haklarını kullanmak, bilgilerini güncellemek ya da hesabının silinmesini istemek için yönetim kuruluna ya da Instagram'da @baskentmt hesabına yazabilirsin. Bilgilerinin çoğunu Profilim sayfasından kendin de güncelleyebilirsin.</p>
    </div>`;
}

// ---------------------------------------------------------------------
// Uygulama
// ---------------------------------------------------------------------
function App() {
  const [me, setMe] = useState(undefined);
  const [route, setRoute] = useState(parseRoute());
  const refresh = useCallback(async () => { try { setMe(await loadMe()); } catch (e) { setMe(null); } }, []);
  const [unread, setUnread] = useState(0);
  const pollUnread = useCallback(async () => { if (!me || !me.profile || me.profile.status !== 'onaylandi') { setUnread(0); return; } try { const { data } = await sb.rpc('dm_unread'); setUnread(data || 0); } catch (e) {} }, [me]);
  useEffect(() => { pollUnread(); const t = setInterval(pollUnread, 15000); return () => clearInterval(t); }, [pollUnread]);
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
  if (p === '') page = html`<${Home} me=${me} />`;
  else if (p === 'prova') page = html`<${Prova} me=${me} />`;
  else if (p === 'kurslar') page = html`<${Kurslar} me=${me} />`;
  else if (p === 'dinletiler') page = html`<${Dinletiler} me=${me} />`;
  else if (p === 'onay') page = html`<${OnayPage} me=${me} refresh=${refresh} />`;
  else if (p === 'ekipman') page = html`<${Ekipman} me=${me} />`;
  else if (p === 'mesajlar') page = html`<${Mesajlar} me=${me} threadId=${route.param} onRead=${pollUnread} />`;
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
    <${Header} me=${me} route=${route} unread=${unread} />
    <${StatusBanner} me=${me} />
    <main class="wrap main" id="icerik">${me === undefined && ['prova', 'kurslar', 'dinletiler', 'profil', 'egitmen', 'pazar', 'ekipman', 'mesajlar', 'yoklama', 'uye'].includes(p) ? html`<${Loading} />` : page}</main>
    <footer class="ftr">
      <div class="wrap ftr-in">
        <div class="row nowrap"><span class="ftr-logo"><img src="/assets/logo.png" alt="" /></span><b>Başkent Üniversitesi Müzik Topluluğu</b></div>
        <div class="row small"><a href="#/kvkk">KVKK</a><a href="/yonetim/">Yönetim</a></div>
      </div>
    </footer>
    <${BottomNav} route=${route} />
    ${route.page !== 'mesajlar' ? html`<${ChatWidget} me=${me} unread=${unread} onRead=${pollUnread} />` : null}
    <${Toaster} />`;
}

initSupabase()
  .then(() => { const el = document.getElementById('app'); el.textContent = ''; render(html`<${App} />`, el); })
  .catch((e) => {
    document.getElementById('app').innerHTML = '<div style="padding:40px;font-family:sans-serif">Site ayarları yüklenemedi: ' + String(e.message || e).replace(/</g, '&lt;') + '</div>';
  });
