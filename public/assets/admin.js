// BÜMT — yönetim paneli
import {
  html, render, useState, useEffect, useCallback,
  sb, initSupabase, loadMe, staffEmail, errMsg, toast, Toaster, adminApi, PERMS,
  todayStr, fmtLong, fmtShort, fmtDateTime, hhmm, addMinutes, nextFridays, DAY_NAMES,
  INSTRUMENTS, KINDS, CLASS_YEARS, downloadCSV, InstructorScheduleEditor
} from './lib.js';

const parseRoute = () => (location.hash.replace(/^#\/?/, '') || '').split('/')[0] || '';

const Field = ({ label, hint, children, wide }) => html`
  <label class=${'fld ' + (wide ? 'fld-wide' : '')}><span>${label}</span>${children}${hint ? html`<small>${hint}</small>` : null}</label>`;
const Loading = () => html`<div class="loading" role="status">Yükleniyor…</div>`;
const Empty = ({ children }) => html`<div class="empty">${children}</div>`;

function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return html`
    <div class="modal-bg" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class=${'modal ' + (wide ? 'modal-wide' : '')} role="dialog" aria-modal="true" aria-label=${title}>
        <div class="modal-head">
          <h2>${title}</h2>
          <button type="button" class="icon-btn" aria-label="Kapat" onClick=${onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">${children}</div>
      </div>
    </div>`;
}

const randomPw = () => {
  const c = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint32Array(8)), (n) => c[n % c.length]).join('');
};

// ---------------------------------------------------------------------
// Giriş
// ---------------------------------------------------------------------
function Login({ denied }) {
  const [u, setU] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    const { error } = await sb.auth.signInWithPassword({ email: staffEmail(u), password: pw });
    setBusy(false);
    if (error) setErr(errMsg(error));
  };
  return html`
    <div class="login-bg">
      <form class="login" onSubmit=${submit}>
        <div class="login-brand"><img src="/assets/logo.png" alt="" /><div><b>BÜMT</b><span>Yönetim paneli</span></div></div>
        ${denied ? html`<p class="form-err" role="alert">Bu hesabın yönetim yetkisi yok.</p>` : null}
        <${Field} label="Kullanıcı adı"><input class="inp" autocomplete="username" required value=${u} onInput=${(e) => setU(e.target.value)} /><//>
        <${Field} label="Şifre"><input class="inp" type="password" autocomplete="current-password" required value=${pw} onInput=${(e) => setPw(e.target.value)} /><//>
        ${err ? html`<p class="form-err" role="alert">${err}</p>` : null}
        <button type="submit" class="btn btn-red btn-block" disabled=${busy}>${busy ? 'Giriş yapılıyor…' : 'Giriş yap'}</button>
        <p class="small muted">Yönetim rolü verilmiş üyeler öğrenci numarasıyla da girebilir.</p>
        <a class="small" href="/#/giris">← Üye girişine dön</a>
      </form>
    </div>`;
}

// ---------------------------------------------------------------------
// Kabuk
// ---------------------------------------------------------------------
const ICONS = {
  home: 'M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  shield: 'M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z',
  door: 'M4 21h16M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M14 12h.01',
  music: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3M19 10v2a7 7 0 0 1-14 0v-2M12 19v3',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
  form: 'M9 4h6M8 2h8v4H8zM6 4H5a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-1M8 11h8M8 15h5',
  key: 'M15 7a4 4 0 1 1-3.9 5H3v3h3v3h3v-3h2.1A4 4 0 0 1 15 7'
};
const Icon = ({ d }) => html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${d} /></svg>`;

const SECTIONS = [
  ['', 'Genel bakış', 'home', null],
  ['uyeler', 'Üyeler', 'users', 'uyeler'],
  ['roller', 'Roller ve yetkililer', 'shield', 'roller'],
  ['prova', 'Prova odası', 'door', 'prova'],
  ['kurslar', 'Enstrüman kursları', 'music', 'kurslar'],
  ['dinletiler', 'Dinletiler', 'mic', 'dinletiler'],
  ['etkinlikler', 'Etkinlikler', 'star', 'etkinlikler'],
  ['formlar', 'Formlar ve başvurular', 'form', 'formlar'],
  ['hesap', 'Hesabım', 'key', null]
];

function Shell({ me, route, refresh }) {
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => setNavOpen(false), [route]);
  const allowed = SECTIONS.filter((s) => !s[3] || me.can(s[3]));
  const cur = allowed.find((s) => s[0] === route) || allowed[0];
  const p = me.profile;
  const roleName = p.is_super ? 'Süper yönetici' : (p.roles && p.roles.name) || '';
  const logout = async () => { await sb.auth.signOut(); location.hash = ''; };

  let body;
  switch (cur[0]) {
    case 'uyeler': body = html`<${Uyeler} me=${me} />`; break;
    case 'roller': body = html`<${Roller} me=${me} />`; break;
    case 'prova': body = html`<${ProvaAdmin} />`; break;
    case 'kurslar': body = html`<${KurslarAdmin} />`; break;
    case 'dinletiler': body = html`<${DinletiAdmin} />`; break;
    case 'etkinlikler': body = html`<${EtkinlikAdmin} />`; break;
    case 'formlar': body = html`<${FormlarAdmin} />`; break;
    case 'hesap': body = html`<${Hesap} me=${me} />`; break;
    default: body = html`<${Dashboard} me=${me} />`;
  }

  return html`
    <div class="shell">
      <aside class=${'side ' + (navOpen ? 'side-open' : '')}>
        <div class="side-brand"><img src="/assets/logo.png" alt="" /><div><b>BÜMT</b><span>Yönetim paneli</span></div></div>
        <nav class="side-nav" aria-label="Panel bölümleri">
          ${allowed.map((s) => html`
            <a href=${'#/' + s[0]} class=${'side-a ' + (s[0] === cur[0] ? 'side-on' : '')} aria-current=${s[0] === cur[0] ? 'page' : null}>
              <${Icon} d=${ICONS[s[2]]} />${s[1]}
            </a>`)}
        </nav>
        <div class="side-foot">
          <div class="side-user"><b>${p.full_name || p.username || p.student_no}</b><span>${roleName}</span></div>
          <a class="side-link" href="/" target="_blank" rel="noopener">Siteyi aç ↗</a>
          <button type="button" class="side-link" onClick=${logout}>Çıkış yap</button>
        </div>
      </aside>
      <div class="content">
        <div class="topbar">
          <button type="button" class="icon-btn menu-btn" aria-label="Menüyü aç" aria-expanded=${navOpen} onClick=${() => setNavOpen(!navOpen)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
          <h1>${cur[1]}</h1>
        </div>
        <div class="page">${body}</div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------
// Genel bakış
// ---------------------------------------------------------------------
function Dashboard({ me }) {
  const [s, setS] = useState(null);
  useEffect(() => {
    (async () => {
      const fri = nextFridays(1)[0];
      const today = todayStr();
      const q = [];
      q.push(me.can('uyeler') ? sb.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'bekliyor').eq('is_staff', false) : Promise.resolve({ count: null }));
      q.push(me.can('uyeler') ? sb.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'onaylandi').eq('is_staff', false) : Promise.resolve({ count: null }));
      q.push(sb.from('prova_bookings').select('id', { count: 'exact', head: true }).eq('day', fri));
      q.push(sb.from('prova_slots').select('id', { count: 'exact', head: true }).eq('active', true));
      q.push(sb.from('dinletiler').select('day').eq('active', true).gte('day', today).order('day').limit(1));
      q.push(me.can('formlar') ? sb.from('form_responses').select('id', { count: 'exact', head: true }) : Promise.resolve({ count: null }));
      const [pend, appr, pv, slots, dn, fr] = await Promise.all(q);
      setS({ fri, pend: pend.count, appr: appr.count, pv: pv.count || 0, slots: slots.count || 0, dn: dn.data && dn.data[0] ? dn.data[0].day : null, fr: fr.count });
    })();
  }, []);
  if (!s) return html`<${Loading} />`;
  return html`
    <div class="stack">
      <p class="muted">Hoş geldin, ${me.profile.full_name || me.profile.username}.</p>
      <div class="stats">
        ${s.pend != null ? html`<a class="stat" href="#/uyeler"><span>Onay bekleyen üye</span><b class=${s.pend ? 'red' : ''}>${s.pend}</b></a>` : null}
        ${s.appr != null ? html`<a class="stat" href="#/uyeler"><span>Onaylı üye</span><b>${s.appr}</b></a>` : null}
        <a class="stat" href="#/prova"><span>${fmtShort(s.fri)} cuma provası</span><b>${s.pv} / ${s.slots}</b></a>
        <a class="stat" href="#/dinletiler"><span>Sıradaki dinleti</span><b class="stat-sm">${s.dn ? fmtShort(s.dn) : '—'}</b></a>
        ${s.fr != null ? html`<a class="stat" href="#/formlar"><span>Form başvurusu (toplam)</span><b>${s.fr}</b></a>` : null}
      </div>
    </div>`;
}

// ---------------------------------------------------------------------
// Üyeler
// ---------------------------------------------------------------------
const STATUS = { bekliyor: ['badge-wait', 'Bekliyor'], onaylandi: ['badge-ok', 'Onaylı'], reddedildi: ['badge-no', 'Reddedildi'] };

function Uyeler({ me }) {
  const [list, setList] = useState(null);
  const [roles, setRoles] = useState([]);
  const [filter, setFilter] = useState('bekliyor');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await sb.from('profiles').select('*, roles(name)').eq('is_staff', false).order('created_at', { ascending: false });
    if (error) toast(errMsg(error), 'err');
    setList(data || []);
    const { data: r } = await sb.from('roles').select('id,name').order('name');
    setRoles(r || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!list) return html`<${Loading} />`;
  const counts = { tumu: list.length, bekliyor: 0, onaylandi: 0, reddedildi: 0 };
  list.forEach((m) => { counts[m.status]++; });
  const term = q.trim().toLocaleLowerCase('tr');
  const shown = list.filter((m) => (filter === 'tumu' || m.status === filter) &&
    (!term || [m.full_name, m.student_no, m.phone, m.department].join(' ').toLocaleLowerCase('tr').includes(term)));

  const setStatus = async (m, status) => {
    const { error } = await sb.from('profiles').update({ status }).eq('id', m.id);
    if (error) return toast(errMsg(error), 'err');
    toast(status === 'onaylandi' ? m.full_name + ' onaylandı.' : m.full_name + ' reddedildi.');
    load();
  };
  const exportCSV = () => downloadCSV('bumt-uyeler.csv', [
    ['Ad Soyad', 'Öğrenci no', 'Telefon', 'E-posta', 'Bölüm', 'Sınıf', 'Tür', 'Enstrümanlar', 'Durum', 'Kayıt'],
    ...shown.map((m) => [m.full_name, m.student_no, m.phone, m.contact_email, m.department, m.class_year, m.member_type, (m.instruments || []).join(', '), m.status, fmtDateTime(m.created_at)])
  ]);

  return html`
    <div class="stack">
      <div class="toolbar">
        <div class="tabs" role="tablist">
          ${[['bekliyor', 'Bekleyen'], ['onaylandi', 'Onaylı'], ['reddedildi', 'Reddedilen'], ['tumu', 'Tümü']].map(([k, l]) => html`
            <button type="button" role="tab" aria-selected=${filter === k} class=${'tab ' + (filter === k ? 'tab-on' : '')} onClick=${() => setFilter(k)}>${l} <span class="count">${counts[k]}</span></button>`)}
        </div>
        <div class="row">
          <input class="inp search" type="search" placeholder="İsim, numara, telefon ara" aria-label="Üye ara" value=${q} onInput=${(e) => setQ(e.target.value)} />
          <button type="button" class="btn btn-ghost" onClick=${exportCSV}>CSV indir</button>
          <button type="button" class="btn btn-red" onClick=${() => setAdding(true)}>Yeni üye ekle</button>
        </div>
      </div>
      <div class="panel table-wrap">
        ${shown.length === 0 ? html`<${Empty}>Bu listede kimse yok.<//>` : html`
        <table class="tbl">
          <thead><tr><th>Ad Soyad</th><th>Öğrenci no</th><th>Telefon</th><th>Profil</th><th>Rol</th><th>Durum</th><th>Kayıt</th><th></th></tr></thead>
          <tbody>
            ${shown.map((m) => html`
              <tr>
                <td><b>${m.full_name || '—'}</b><div class="sub">${[m.department, m.class_year].filter(Boolean).join(' · ')}</div></td>
                <td class="mono">${m.student_no}</td>
                <td>${m.phone}</td>
                <td>${m.member_type === 'muzisyen' ? 'Müzisyen' : 'Dinleyici'}${(m.instruments || []).length ? html`<div class="sub">${m.instruments.join(', ')}</div>` : null}</td>
                <td>${m.roles ? m.roles.name : html`<span class="muted">—</span>`}</td>
                <td><span class=${'badge ' + STATUS[m.status][0]}>${STATUS[m.status][1]}</span></td>
                <td class="sub">${fmtDateTime(m.created_at)}</td>
                <td class="actions">
                  ${m.status === 'bekliyor' ? html`
                    <button type="button" class="btn btn-sm btn-dark" onClick=${() => setStatus(m, 'onaylandi')}>Onayla</button>
                    <button type="button" class="btn btn-sm btn-ghost" onClick=${() => setStatus(m, 'reddedildi')}>Reddet</button>` : null}
                  <button type="button" class="btn btn-sm btn-ghost" onClick=${() => setEdit(m)}>Düzenle</button>
                </td>
              </tr>`)}
          </tbody>
        </table>`}
      </div>
      ${edit ? html`<${MemberEdit} m=${edit} me=${me} roles=${roles} onClose=${() => setEdit(null)} onSaved=${() => { setEdit(null); load(); }} />` : null}
      ${adding ? html`<${MemberAdd} onClose=${() => setAdding(false)} onSaved=${() => { setAdding(false); setFilter('onaylandi'); load(); }} />` : null}
    </div>`;
}

function MemberForm({ f, setF }) {
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return html`
    <div class="fgrid">
      <${Field} label="Ad Soyad"><input class="inp" required value=${f.full_name} onInput=${set('full_name')} /><//>
      <${Field} label="Telefon"><input class="inp" type="tel" value=${f.phone} onInput=${set('phone')} /><//>
      <${Field} label="Bölüm"><input class="inp" value=${f.department} onInput=${set('department')} /><//>
      <${Field} label="Sınıf"><select class="inp" value=${f.class_year} onChange=${set('class_year')}><option value="">—</option>${CLASS_YEARS.map((c) => html`<option>${c}</option>`)}</select><//>
      <${Field} label="Tür"><select class="inp" value=${f.member_type} onChange=${set('member_type')}><option value="dinleyici">Dinleyici</option><option value="muzisyen">Müzisyen</option></select><//>
      <${Field} label="Enstrümanlar" hint="Virgülle ayır"><input class="inp" value=${f.instruments_text} onInput=${set('instruments_text')} placeholder="Gitar, Vokal" /><//>
    </div>`;
}
const splitList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

function MemberEdit({ m, me, roles, onClose, onSaved }) {
  const [f, setF] = useState({
    full_name: m.full_name, phone: m.phone, contact_email: m.contact_email, department: m.department, class_year: m.class_year,
    member_type: m.member_type, instruments_text: (m.instruments || []).join(', '), status: m.status, role_id: m.role_id || ''
  });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const patch = { full_name: f.full_name, phone: f.phone, contact_email: f.contact_email, department: f.department, class_year: f.class_year, member_type: f.member_type, instruments: splitList(f.instruments_text), status: f.status };
    if (me.can('roller')) patch.role_id = f.role_id || null;
    const { error } = await sb.from('profiles').update(patch).eq('id', m.id);
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    toast('Üye güncellendi.');
    onSaved();
  };
  const resetPw = async () => {
    const pw = prompt('Yeni şifre (en az 6 karakter). Üyeye bu şifreyi ilet:', randomPw());
    if (!pw) return;
    try { await adminApi('set_password', { user_id: m.id, password: pw }); toast('Şifre değiştirildi: ' + pw); } catch (err) { toast(err.message, 'err'); }
  };
  const remove = async () => {
    if (!confirm(m.full_name + ' hesabı ve tüm rezervasyonları kalıcı olarak silinsin mi? Bu geri alınamaz.')) return;
    try { await adminApi('delete_user', { user_id: m.id }); toast('Hesap silindi.'); onSaved(); } catch (err) { toast(err.message, 'err'); }
  };
  return html`
    <${Modal} title=${'Üye: ' + (m.full_name || m.student_no)} onClose=${onClose}>
      <form class="stack" onSubmit=${save}>
        <p class="muted small">Öğrenci no: <b class="mono">${m.student_no}</b> · Kayıt: ${fmtDateTime(m.created_at)}${m.kvkk_at ? ' · KVKK onaylı' : ''}</p>
        <${MemberForm} f=${f} setF=${setF} />
        <div class="fgrid">
          <${Field} label="E-posta"><input class="inp" type="email" value=${f.contact_email} onInput=${(e) => setF({ ...f, contact_email: e.target.value })} /><//>
          <${Field} label="Üyelik durumu"><select class="inp" value=${f.status} onChange=${(e) => setF({ ...f, status: e.target.value })}>
            <option value="bekliyor">Onay bekliyor</option><option value="onaylandi">Onaylı</option><option value="reddedildi">Reddedildi</option></select><//>
          ${me.can('roller') ? html`
            <${Field} label="Yönetim rolü" hint="Rol verilen üye yönetim paneline öğrenci numarasıyla girebilir"><select class="inp" value=${f.role_id} onChange=${(e) => setF({ ...f, role_id: e.target.value })}>
              <option value="">Rol yok (normal üye)</option>${roles.map((r) => html`<option value=${r.id}>${r.name}</option>`)}</select><//>` : null}
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onClick=${resetPw}>Şifre sıfırla</button>
          <button type="button" class="btn btn-danger" onClick=${remove}>Hesabı sil</button>
          <span class="grow"></span>
          <button type="submit" class="btn btn-red" disabled=${busy}>Kaydet</button>
        </div>
      </form>
    <//>`;
}

function MemberAdd({ onClose, onSaved }) {
  const [f, setF] = useState({ student_no: '', full_name: '', phone: '', department: '', class_year: '', member_type: 'muzisyen', instruments_text: '', password: randomPw(), approved: true });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await adminApi('create_member', { ...f, instruments: splitList(f.instruments_text) });
      toast('Üye eklendi. Giriş: ' + f.student_no + ' / ' + f.password);
      onSaved();
    } catch (err) { toast(err.message, 'err'); }
    setBusy(false);
  };
  return html`
    <${Modal} title="Yeni üye ekle" onClose=${onClose}>
      <form class="stack" onSubmit=${save}>
        <div class="fgrid">
          <${Field} label="Öğrenci numarası"><input class="inp" required inputmode="numeric" value=${f.student_no} onInput=${(e) => setF({ ...f, student_no: e.target.value })} /><//>
          <${Field} label="Geçici şifre" hint="Üyeye ilet; profilinden değiştirebilir"><input class="inp mono" required minlength="6" value=${f.password} onInput=${(e) => setF({ ...f, password: e.target.value })} /><//>
        </div>
        <${MemberForm} f=${f} setF=${setF} />
        <label class="check"><input type="checkbox" checked=${f.approved} onChange=${(e) => setF({ ...f, approved: e.target.checked })} />Hesap onaylı olarak açılsın</label>
        <div class="modal-actions"><span class="grow"></span><button type="submit" class="btn btn-red" disabled=${busy}>Üyeyi ekle</button></div>
      </form>
    <//>`;
}

// ---------------------------------------------------------------------
// Roller ve yetkililer
// ---------------------------------------------------------------------
function Roller({ me }) {
  const [roles, setRoles] = useState(null);
  const [staff, setStaff] = useState([]);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const [{ data: r }, { data: s }] = await Promise.all([
      sb.from('roles').select('*').order('name'),
      sb.from('profiles').select('id,full_name,username,student_no,is_super,is_staff,role_id').or('is_super.eq.true,is_staff.eq.true,role_id.not.is.null').order('full_name')
    ]);
    setRoles(r || []);
    setStaff(s || []);
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!roles) return html`<${Loading} />`;

  const togglePerm = (role, k) => setRoles(roles.map((r) => r.id === role.id ? { ...r, permissions: r.permissions.includes(k) ? r.permissions.filter((x) => x !== k) : [...r.permissions, k], dirty: true } : r));
  const rename = (role, name) => setRoles(roles.map((r) => r.id === role.id ? { ...r, name, dirty: true } : r));
  const saveRole = async (role) => {
    const { error } = await sb.from('roles').update({ name: role.name.trim(), permissions: role.permissions }).eq('id', role.id);
    if (error) return toast(errMsg(error), 'err');
    toast(role.name + ' kaydedildi.');
    load();
  };
  const delRole = async (role) => {
    const users = staff.filter((s) => s.role_id === role.id).length;
    if (!confirm(role.name + ' rolü silinsin mi?' + (users ? ' Bu roldeki ' + users + ' kişinin yönetim yetkisi kalkar.' : ''))) return;
    const { error } = await sb.from('roles').delete().eq('id', role.id);
    if (error) return toast(errMsg(error), 'err');
    load();
  };
  const addRole = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const { error } = await sb.from('roles').insert({ name: newName.trim(), permissions: [] });
    if (error) return toast(errMsg(error), 'err');
    setNewName('');
    load();
  };
  const setRole = async (p, role_id) => {
    const { error } = await sb.from('profiles').update({ role_id: role_id || null }).eq('id', p.id);
    if (error) return toast(errMsg(error), 'err');
    toast('Rol güncellendi.');
    load();
  };
  const resetPw = async (p) => {
    const pw = prompt('Yeni şifre (en az 6 karakter):', randomPw());
    if (!pw) return;
    try { await adminApi('set_password', { user_id: p.id, password: pw }); toast('Şifre değiştirildi: ' + pw); } catch (err) { toast(err.message, 'err'); }
  };
  const remove = async (p) => {
    if (!confirm((p.full_name || p.username) + ' yönetim hesabı silinsin mi?')) return;
    try { await adminApi('delete_user', { user_id: p.id }); toast('Hesap silindi.'); load(); } catch (err) { toast(err.message, 'err'); }
  };

  return html`
    <div class="stack-lg">
      <section class="stack">
        <div class="toolbar"><h2 class="h2">Yetkililer</h2><button type="button" class="btn btn-red" onClick=${() => setAdding(true)}>Yeni yönetim hesabı</button></div>
        <p class="muted small">Yönetim hesapları kullanıcı adıyla girer. Bir üyeye rol vermek için Üyeler bölümünden üyeyi düzenle; o üye yönetim paneline öğrenci numarasıyla girer.</p>
        <div class="panel table-wrap">
          <table class="tbl">
            <thead><tr><th>Ad</th><th>Giriş adı</th><th>Rol</th><th></th></tr></thead>
            <tbody>
              ${staff.map((p) => html`
                <tr>
                  <td><b>${p.full_name || '—'}</b>${p.id === me.user.id ? html` <span class="badge badge-ok">Sen</span>` : null}</td>
                  <td class="mono">${p.username || p.student_no}</td>
                  <td>${p.is_super ? html`<span class="badge badge-red">Süper yönetici · tüm yetkiler</span>` : html`
                    <select class="inp inp-sm" aria-label="Rol" value=${p.role_id || ''} onChange=${(e) => setRole(p, e.target.value)}>
                      <option value="">Rol yok</option>${roles.map((r) => html`<option value=${r.id}>${r.name}</option>`)}
                    </select>`}</td>
                  <td class="actions">
                    ${!p.is_super || me.profile.is_super ? html`<button type="button" class="btn btn-sm btn-ghost" onClick=${() => resetPw(p)}>Şifre sıfırla</button>` : null}
                    ${p.is_staff && !p.is_super && p.id !== me.user.id ? html`<button type="button" class="btn btn-sm btn-danger" onClick=${() => remove(p)}>Sil</button>` : null}
                  </td>
                </tr>`)}
            </tbody>
          </table>
        </div>
      </section>

      <section class="stack">
        <h2 class="h2">Roller ve yetkileri</h2>
        <div class="panel table-wrap">
          <table class="tbl perm-tbl">
            <thead><tr><th>Rol</th>${PERMS.map(([, l]) => html`<th class="c">${l}</th>`)}<th></th></tr></thead>
            <tbody>
              ${roles.map((r) => html`
                <tr>
                  <td><input class="inp inp-sm" aria-label="Rol adı" value=${r.name} onInput=${(e) => rename(r, e.target.value)} /></td>
                  ${PERMS.map(([k, l]) => html`<td class="c"><input type="checkbox" class="cb" aria-label=${r.name + ': ' + l} checked=${r.permissions.includes(k)} onChange=${() => togglePerm(r, k)} /></td>`)}
                  <td class="actions">
                    <button type="button" class=${'btn btn-sm ' + (r.dirty ? 'btn-red' : 'btn-ghost')} disabled=${!r.dirty} onClick=${() => saveRole(r)}>Kaydet</button>
                    <button type="button" class="btn btn-sm btn-danger" onClick=${() => delRole(r)}>Sil</button>
                  </td>
                </tr>`)}
            </tbody>
          </table>
        </div>
        <form class="row" onSubmit=${addRole}>
          <input class="inp" placeholder="Yeni rol adı (örn. Sosyal Medya Sorumlusu)" aria-label="Yeni rol adı" value=${newName} onInput=${(e) => setNewName(e.target.value)} />
          <button type="submit" class="btn btn-dark">Rol ekle</button>
        </form>
      </section>
      ${adding ? html`<${StaffAdd} roles=${roles} onClose=${() => setAdding(false)} onSaved=${() => { setAdding(false); load(); }} />` : null}
    </div>`;
}

function StaffAdd({ roles, onClose, onSaved }) {
  const [f, setF] = useState({ username: '', full_name: '', password: randomPw(), role_id: roles[0] ? roles[0].id : '' });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await adminApi('create_staff', f); toast('Hesap açıldı. Giriş: ' + f.username.toLowerCase() + ' / ' + f.password); onSaved(); } catch (err) { toast(err.message, 'err'); }
    setBusy(false);
  };
  return html`
    <${Modal} title="Yeni yönetim hesabı" onClose=${onClose}>
      <form class="stack" onSubmit=${save}>
        <div class="fgrid">
          <${Field} label="Kullanıcı adı" hint="Harf, rakam, nokta, tire"><input class="inp" required value=${f.username} onInput=${(e) => setF({ ...f, username: e.target.value })} /><//>
          <${Field} label="Ad Soyad"><input class="inp" required value=${f.full_name} onInput=${(e) => setF({ ...f, full_name: e.target.value })} /><//>
          <${Field} label="Geçici şifre"><input class="inp mono" required minlength="6" value=${f.password} onInput=${(e) => setF({ ...f, password: e.target.value })} /><//>
          <${Field} label="Rol"><select class="inp" value=${f.role_id} onChange=${(e) => setF({ ...f, role_id: e.target.value })}>
            <option value="">Rol yok</option>${roles.map((r) => html`<option value=${r.id}>${r.name}</option>`)}</select><//>
        </div>
        <div class="modal-actions"><span class="grow"></span><button type="submit" class="btn btn-red" disabled=${busy}>Hesabı aç</button></div>
      </form>
    <//>`;
}

// ---------------------------------------------------------------------
// Prova odası
// ---------------------------------------------------------------------
function ProvaAdmin() {
  const [st, setSt] = useState(null);
  const [slots, setSlots] = useState(null);
  const [bookings, setBookings] = useState([]);
  const fridays = nextFridays(3);

  const load = useCallback(async () => {
    const [{ data: s }, { data: sl }, { data: b }] = await Promise.all([
      sb.from('settings').select('*').eq('id', 1).single(),
      sb.from('prova_slots').select('*').order('sort').order('start_time'),
      sb.from('prova_bookings').select('*, profiles(full_name, student_no, phone)').in('day', fridays).order('day')
    ]);
    setSt(s); setSlots((sl || []).map((x) => ({ ...x, start_time: hhmm(x.start_time), end_time: hhmm(x.end_time) }))); setBookings(b || []);
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!st || !slots) return html`<${Loading} />`;

  const saveSettings = async (e) => {
    e.preventDefault();
    const { error } = await sb.from('settings').update({ prova_open_days: +st.prova_open_days, prova_max_per_week: +st.prova_max_per_week, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) return toast(errMsg(error), 'err');
    toast('Kurallar kaydedildi.');
  };
  const upd = (i, k, v) => setSlots(slots.map((s, j) => j === i ? { ...s, [k]: v, dirty: true } : s));
  const saveSlot = async (s) => {
    const row = { start_time: s.start_time, end_time: s.end_time, sort: +s.sort || 0, active: !!s.active };
    const { error } = s.id ? await sb.from('prova_slots').update(row).eq('id', s.id) : await sb.from('prova_slots').insert(row);
    if (error) return toast(errMsg(error), 'err');
    toast('Saat kaydedildi.');
    load();
  };
  const delSlot = async (s) => {
    if (!s.id) return setSlots(slots.filter((x) => x !== s));
    if (!confirm(s.start_time + '–' + s.end_time + ' saati ve bu saatteki tüm rezervasyonlar silinsin mi?')) return;
    const { error } = await sb.from('prova_slots').delete().eq('id', s.id);
    if (error) return toast(errMsg(error), 'err');
    load();
  };
  const delBooking = async (b) => {
    if (!confirm('Bu rezervasyon iptal edilsin mi?')) return;
    const { error } = await sb.from('prova_bookings').delete().eq('id', b.id);
    if (error) return toast(errMsg(error), 'err');
    load();
  };
  const slotLabel = (id) => { const s = slots.find((x) => x.id === id); return s ? s.start_time + '–' + s.end_time : '?'; };

  return html`
    <div class="stack-lg">
      <form class="panel pad stack" onSubmit=${saveSettings}>
        <h2 class="h2">Rezervasyon kuralları</h2>
        <div class="fgrid">
          <${Field} label="Kaç gün önceden açılsın?" hint="Cumadan geriye: 4 = o haftanın pazartesi"><input class="inp" type="number" min="0" max="60" value=${st.prova_open_days} onInput=${(e) => setSt({ ...st, prova_open_days: e.target.value })} /><//>
          <${Field} label="Üye başına haftalık slot hakkı"><input class="inp" type="number" min="1" max="10" value=${st.prova_max_per_week} onInput=${(e) => setSt({ ...st, prova_max_per_week: e.target.value })} /><//>
        </div>
        <button type="submit" class="btn btn-dark self-start">Kuralları kaydet</button>
      </form>

      <section class="panel pad stack">
        <h2 class="h2">Cuma prova saatleri</h2>
        <div class="table-wrap">
          <table class="tbl">
            <thead><tr><th>Başlangıç</th><th>Bitiş</th><th>Sıra</th><th>Aktif</th><th></th></tr></thead>
            <tbody>
              ${slots.map((s, i) => html`
                <tr>
                  <td><input class="inp inp-sm" type="time" aria-label="Başlangıç" value=${s.start_time} onInput=${(e) => upd(i, 'start_time', e.target.value)} /></td>
                  <td><input class="inp inp-sm" type="time" aria-label="Bitiş" value=${s.end_time} onInput=${(e) => upd(i, 'end_time', e.target.value)} /></td>
                  <td><input class="inp inp-sm w-num" type="number" aria-label="Sıra" value=${s.sort} onInput=${(e) => upd(i, 'sort', e.target.value)} /></td>
                  <td><input type="checkbox" class="cb" aria-label="Aktif" checked=${s.active} onChange=${(e) => upd(i, 'active', e.target.checked)} /></td>
                  <td class="actions">
                    <button type="button" class=${'btn btn-sm ' + (s.dirty ? 'btn-red' : 'btn-ghost')} disabled=${!s.dirty} onClick=${() => saveSlot(s)}>Kaydet</button>
                    <button type="button" class="btn btn-sm btn-danger" onClick=${() => delSlot(s)}>Sil</button>
                  </td>
                </tr>`)}
            </tbody>
          </table>
        </div>
        <button type="button" class="btn btn-ghost self-start" onClick=${() => setSlots([...slots, { start_time: '18:00', end_time: '19:00', sort: slots.length + 1, active: true, dirty: true }])}>+ Saat ekle</button>
      </section>

      <section class="panel pad stack">
        <h2 class="h2">Yaklaşan rezervasyonlar</h2>
        ${bookings.length === 0 ? html`<${Empty}>Önümüzdeki 3 cuma için rezervasyon yok.<//>` : html`
          <div class="table-wrap"><table class="tbl">
            <thead><tr><th>Tarih</th><th>Saat</th><th>Üye</th><th>Telefon</th><th></th></tr></thead>
            <tbody>${bookings.map((b) => html`
              <tr>
                <td>${fmtLong(b.day)}</td><td>${slotLabel(b.slot_id)}</td>
                <td><b>${b.profiles ? b.profiles.full_name : b.display_name}</b>${b.profiles ? html`<div class="sub mono">${b.profiles.student_no}</div>` : null}</td>
                <td>${b.profiles ? b.profiles.phone : ''}</td>
                <td class="actions"><button type="button" class="btn btn-sm btn-danger" onClick=${() => delBooking(b)}>İptal et</button></td>
              </tr>`)}</tbody>
          </table></div>`}
      </section>
    </div>`;
}

// ---------------------------------------------------------------------
// Enstrüman kursları
// ---------------------------------------------------------------------
function KurslarAdmin() {
  const [list, setList] = useState(null);
  const [stats, setStats] = useState({});
  const [edit, setEdit] = useState(null);
  const [cal, setCal] = useState(null);

  const load = useCallback(async () => {
    const [{ data: ins }, { data: sl }, { data: bk }] = await Promise.all([
      sb.from('instructors').select('*, profiles(student_no)').order('instrument').order('full_name'),
      sb.from('instructor_slots').select('instructor_id'),
      sb.from('lesson_bookings').select('instructor_id,status').neq('status', 'reddedildi')
    ]);
    const s = {};
    const get = (id) => (s[id] = s[id] || { slots: 0, booked: 0, waiting: 0 });
    (sl || []).forEach((x) => { get(x.instructor_id).slots++; });
    (bk || []).forEach((x) => { if (x.status === 'onaylandi') get(x.instructor_id).booked++; else get(x.instructor_id).waiting++; });
    setList(ins || []); setStats(s);
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!list) return html`<${Loading} />`;

  return html`
    <div class="stack">
      <div class="toolbar">
        <p class="muted small">Eğitmeni bir üye hesabına bağlarsan, o üye sitede "Eğitmen paneli"nden kendi müsaitliğini işaretleyebilir.</p>
        <button type="button" class="btn btn-red" onClick=${() => setEdit({})}>Yeni eğitmen</button>
      </div>
      <div class="panel table-wrap">
        ${list.length === 0 ? html`<${Empty}>Henüz eğitmen yok.<//>` : html`
        <table class="tbl">
          <thead><tr><th>Eğitmen</th><th>Enstrüman</th><th>Tür</th><th>Bağlı hesap</th><th>Saatler</th><th>Durum</th><th></th></tr></thead>
          <tbody>${list.map((t) => {
            const s = stats[t.id] || { slots: 0, booked: 0, waiting: 0 };
            return html`
              <tr>
                <td><b>${t.full_name}</b><div class="sub">${[t.department, t.class_year].filter(Boolean).join(' · ')}</div></td>
                <td>${t.instrument}</td><td>${t.kind}</td>
                <td class="mono">${t.profiles ? t.profiles.student_no : html`<span class="muted">—</span>`}</td>
                <td>${s.slots} müsait · ${s.booked} dolu${s.waiting ? html` · <span class="badge badge-wait">${s.waiting} talep</span>` : null}${!t.email && !t.profile_id ? html`<div class="sub red">E-posta yok, bildirim gitmez</div>` : null}</td>
                <td><span class=${'badge ' + (t.active ? 'badge-ok' : 'badge-no')}>${t.active ? 'Sitede' : 'Gizli'}</span></td>
                <td class="actions">
                  <button type="button" class="btn btn-sm btn-ghost" onClick=${() => setCal(t)}>Takvim ve talepler</button>
                  <button type="button" class="btn btn-sm btn-ghost" onClick=${() => setEdit(t)}>Düzenle</button>
                </td>
              </tr>`;
          })}</tbody>
        </table>`}
      </div>
      ${edit ? html`<${InstructorEdit} t=${edit} onClose=${() => setEdit(null)} onSaved=${() => { setEdit(null); load(); }} />` : null}
      ${cal ? html`<${Modal} title=${cal.full_name + ' · takvim ve talepler'} wide=${true} onClose=${() => { setCal(null); load(); }}><${InstructorScheduleEditor} instructor=${cal} /><//>` : null}
    </div>`;
}

function InstructorEdit({ t, onClose, onSaved }) {
  const [f, setF] = useState({
    full_name: t.full_name || '', instrument: t.instrument || 'Gitar', kind: t.kind || KINDS[1], department: t.department || '',
    class_year: t.class_year || '', phone: t.phone || '', email: t.email || '', bio: t.bio || '', active: t.id ? t.active : true,
    student_no: t.profiles ? t.profiles.student_no : '', profile_id: t.profile_id || null
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const lookup = async () => {
    const no = f.student_no.trim();
    if (!no) return setF({ ...f, profile_id: null });
    const { data } = await sb.from('profiles').select('id,full_name,department,class_year,phone,contact_email,status').eq('student_no', no).maybeSingle();
    if (!data) return toast('Bu öğrenci numarasıyla üye bulunamadı.', 'err');
    setF({ ...f, profile_id: data.id, full_name: f.full_name || data.full_name, department: f.department || data.department, class_year: f.class_year || data.class_year, phone: f.phone || data.phone, email: f.email || data.contact_email || '' });
    toast(data.full_name + ' hesabı bağlandı' + (data.status !== 'onaylandi' ? ' (üyeliği henüz onaylı değil)' : '') + '.');
  };
  const save = async (e) => {
    e.preventDefault();
    if (f.student_no.trim() && !f.profile_id) return toast('Önce "Bul ve bağla" ile hesabı bağla ya da numarayı sil.', 'err');
    setBusy(true);
    const row = { full_name: f.full_name, instrument: f.instrument, kind: f.kind, department: f.department, class_year: f.class_year, phone: f.phone, email: f.email.trim(), bio: f.bio, active: f.active, profile_id: f.student_no.trim() ? f.profile_id : null };
    const { error } = t.id ? await sb.from('instructors').update(row).eq('id', t.id) : await sb.from('instructors').insert(row);
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    toast('Eğitmen kaydedildi.');
    onSaved();
  };
  const remove = async () => {
    if (!confirm(t.full_name + ' ve tüm ders kayıtları silinsin mi?')) return;
    const { error } = await sb.from('instructors').delete().eq('id', t.id);
    if (error) return toast(errMsg(error), 'err');
    onSaved();
  };
  return html`
    <${Modal} title=${t.id ? 'Eğitmeni düzenle' : 'Yeni eğitmen'} onClose=${onClose}>
      <form class="stack" onSubmit=${save}>
        <div class="row align-end">
          <${Field} label="Üye hesabına bağla (öğrenci no)" hint="İsteğe bağlı; bağlanan üye kendi takvimini yönetir"><input class="inp" value=${f.student_no} onInput=${(e) => setF({ ...f, student_no: e.target.value, profile_id: null })} /><//>
          <button type="button" class="btn btn-ghost" onClick=${lookup}>${f.profile_id ? 'Bağlandı ✓' : 'Bul ve bağla'}</button>
        </div>
        <div class="fgrid">
          <${Field} label="Ad Soyad"><input class="inp" required value=${f.full_name} onInput=${set('full_name')} /><//>
          <${Field} label="Enstrüman"><input class="inp" required list="ins-list" value=${f.instrument} onInput=${set('instrument')} /><datalist id="ins-list">${INSTRUMENTS.map((i) => html`<option value=${i}></option>`)}</datalist><//>
          <${Field} label="Tür"><select class="inp" value=${f.kind} onChange=${set('kind')}>${KINDS.map((k) => html`<option>${k}</option>`)}</select><//>
          <${Field} label="Bölüm"><input class="inp" value=${f.department} onInput=${set('department')} /><//>
          <${Field} label="Sınıf"><select class="inp" value=${f.class_year} onChange=${set('class_year')}><option value="">—</option>${CLASS_YEARS.map((c) => html`<option>${c}</option>`)}</select><//>
          <${Field} label="WhatsApp numarası" hint="Sadece giriş yapan üyeler görür"><input class="inp" type="tel" value=${f.phone} onInput=${set('phone')} /><//>
          <${Field} label="E-posta" hint="Ders talepleri buraya gönderilir"><input class="inp" type="email" value=${f.email} onInput=${set('email')} /><//>
        </div>
        <${Field} label="Kısa tanıtım"><textarea class="inp" rows="2" value=${f.bio} onInput=${set('bio')}></textarea><//>
        <label class="check"><input type="checkbox" checked=${f.active} onChange=${set('active')} />Sitede göster</label>
        <div class="modal-actions">
          ${t.id ? html`<button type="button" class="btn btn-danger" onClick=${remove}>Sil</button>` : null}
          <span class="grow"></span>
          <button type="submit" class="btn btn-red" disabled=${busy}>Kaydet</button>
        </div>
      </form>
    <//>`;
}

// ---------------------------------------------------------------------
// Dinletiler
// ---------------------------------------------------------------------
function DinletiAdmin() {
  const [list, setList] = useState(null);
  const [counts, setCounts] = useState({});
  const [st, setSt] = useState(null);
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null);
  const [showPast, setShowPast] = useState(false);
  const today = todayStr();

  const load = useCallback(async () => {
    const [{ data: d }, { data: b }, { data: s }] = await Promise.all([
      sb.from('dinletiler').select('*').order('day'),
      sb.from('dinleti_bookings').select('dinleti_id'),
      sb.from('settings').select('*').eq('id', 1).single()
    ]);
    const c = {};
    (b || []).forEach((x) => { c[x.dinleti_id] = (c[x.dinleti_id] || 0) + 1; });
    setList(d || []); setCounts(c); setSt(s);
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!list || !st) return html`<${Loading} />`;
  const shown = list.filter((d) => showPast || d.day >= today);

  const saveSettings = async (e) => {
    e.preventDefault();
    const { error } = await sb.from('settings').update({ dinleti_open_days: +st.dinleti_open_days, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) return toast(errMsg(error), 'err');
    toast('Kural kaydedildi.');
  };

  return html`
    <div class="stack-lg">
      <form class="panel pad row align-end" onSubmit=${saveSettings}>
        <${Field} label="Rezervasyon kaç gün önceden açılsın?"><input class="inp" type="number" min="0" max="90" value=${st.dinleti_open_days} onInput=${(e) => setSt({ ...st, dinleti_open_days: e.target.value })} /><//>
        <button type="submit" class="btn btn-dark">Kaydet</button>
      </form>
      <div class="toolbar">
        <label class="check"><input type="checkbox" checked=${showPast} onChange=${(e) => setShowPast(e.target.checked)} />Geçmiş dinletileri de göster</label>
        <button type="button" class="btn btn-red" onClick=${() => setEdit({})}>Yeni dinleti</button>
      </div>
      <div class="panel table-wrap">
        ${shown.length === 0 ? html`<${Empty}>Yaklaşan dinleti yok. "Yeni dinleti" ile ekle.<//>` : html`
        <table class="tbl">
          <thead><tr><th>Tarih</th><th>Başlık</th><th>Saat</th><th>Doluluk</th><th>Rezervasyon açılışı</th><th>Durum</th><th></th></tr></thead>
          <tbody>${shown.map((d) => html`
            <tr>
              <td><b>${fmtLong(d.day)}</b></td><td>${d.title}${d.venue ? html`<div class="sub">${d.venue}</div>` : null}</td>
              <td>${hhmm(d.start_time)} · ${d.slot_count} × ${d.slot_minutes} dk</td>
              <td>${counts[d.id] || 0} / ${d.slot_count}</td>
              <td>${fmtShort(addDaysLocal(d.day, -st.dinleti_open_days))}</td>
              <td><span class=${'badge ' + (d.active ? 'badge-ok' : 'badge-no')}>${d.active ? 'Yayında' : 'Gizli'}</span></td>
              <td class="actions">
                <button type="button" class="btn btn-sm btn-ghost" onClick=${() => setView(d)}>Katılımcılar</button>
                <button type="button" class="btn btn-sm btn-ghost" onClick=${() => setEdit(d)}>Düzenle</button>
              </td>
            </tr>`)}</tbody>
        </table>`}
      </div>
      ${edit ? html`<${DinletiEdit} d=${edit} onClose=${() => setEdit(null)} onSaved=${() => { setEdit(null); load(); }} />` : null}
      ${view ? html`<${DinletiBookings} d=${view} onClose=${() => { setView(null); load(); }} />` : null}
    </div>`;
}
const addDaysLocal = (s, n) => { const [y, m, d] = s.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, d + n)); return x.toISOString().slice(0, 10); };

function DinletiEdit({ d, onClose, onSaved }) {
  const [f, setF] = useState({ title: d.title || 'Dinleti', day: d.day || '', start_time: hhmm(d.start_time) || '19:00', slot_minutes: d.slot_minutes || 20, slot_count: d.slot_count || 6, venue: d.venue || '', note: d.note || '', active: d.id ? d.active : true });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async (e) => {
    e.preventDefault();
    const row = { ...f, slot_minutes: +f.slot_minutes, slot_count: +f.slot_count };
    const { error } = d.id ? await sb.from('dinletiler').update(row).eq('id', d.id) : await sb.from('dinletiler').insert(row);
    if (error) return toast(errMsg(error), 'err');
    toast('Dinleti kaydedildi.');
    onSaved();
  };
  const remove = async () => {
    if (!confirm('Bu dinleti ve tüm rezervasyonları silinsin mi?')) return;
    const { error } = await sb.from('dinletiler').delete().eq('id', d.id);
    if (error) return toast(errMsg(error), 'err');
    onSaved();
  };
  return html`
    <${Modal} title=${d.id ? 'Dinletiyi düzenle' : 'Yeni dinleti'} onClose=${onClose}>
      <form class="stack" onSubmit=${save}>
        <div class="fgrid">
          <${Field} label="Başlık"><input class="inp" required value=${f.title} onInput=${set('title')} /><//>
          <${Field} label="Tarih"><input class="inp" type="date" required value=${f.day} onInput=${set('day')} /><//>
          <${Field} label="Başlangıç saati"><input class="inp" type="time" required value=${f.start_time} onInput=${set('start_time')} /><//>
          <${Field} label="Yer"><input class="inp" value=${f.venue} onInput=${set('venue')} /><//>
          <${Field} label="Performans süresi (dk)"><input class="inp" type="number" min="5" max="180" value=${f.slot_minutes} onInput=${set('slot_minutes')} /><//>
          <${Field} label="Performans sayısı"><input class="inp" type="number" min="1" max="40" value=${f.slot_count} onInput=${set('slot_count')} /><//>
        </div>
        <${Field} label="Not (sitede görünür)"><textarea class="inp" rows="2" value=${f.note} onInput=${set('note')}></textarea><//>
        <label class="check"><input type="checkbox" checked=${f.active} onChange=${set('active')} />Sitede yayında</label>
        <div class="modal-actions">
          ${d.id ? html`<button type="button" class="btn btn-danger" onClick=${remove}>Sil</button>` : null}
          <span class="grow"></span><button type="submit" class="btn btn-red">Kaydet</button>
        </div>
      </form>
    <//>`;
}

function DinletiBookings({ d, onClose }) {
  const [rows, setRows] = useState(null);
  const load = useCallback(async () => {
    const { data } = await sb.from('dinleti_bookings').select('*, profiles(full_name, student_no, phone)').eq('dinleti_id', d.id).order('slot_index');
    setRows(data || []);
  }, [d.id]);
  useEffect(() => { load(); }, [load]);
  const del = async (b) => {
    if (!confirm('Bu kayıt silinsin mi?')) return;
    const { error } = await sb.from('dinleti_bookings').delete().eq('id', b.id);
    if (error) return toast(errMsg(error), 'err');
    load();
  };
  const exp = () => downloadCSV('dinleti-' + d.day + '.csv', [['Saat', 'Sahne adı', 'Tür', 'Ad Soyad', 'Öğrenci no', 'Telefon'],
    ...rows.map((b) => [addMinutes(d.start_time, b.slot_index * d.slot_minutes), b.display_name, b.perf_type, b.profiles ? b.profiles.full_name : '', b.profiles ? b.profiles.student_no : '', b.profiles ? b.profiles.phone : ''])]);
  return html`
    <${Modal} title=${fmtLong(d.day) + ' · katılımcılar'} wide=${true} onClose=${onClose}>
      ${!rows ? html`<${Loading} />` : rows.length === 0 ? html`<${Empty}>Henüz kayıt yok.<//>` : html`
        <div class="stack">
          <button type="button" class="btn btn-ghost self-start" onClick=${exp}>CSV indir</button>
          <div class="table-wrap"><table class="tbl">
            <thead><tr><th>Saat</th><th>Sahne adı</th><th>Tür</th><th>Üye</th><th>Telefon</th><th></th></tr></thead>
            <tbody>${rows.map((b) => html`<tr>
              <td>${addMinutes(d.start_time, b.slot_index * d.slot_minutes)}</td><td><b>${b.display_name}</b></td><td>${b.perf_type}</td>
              <td>${b.profiles ? b.profiles.full_name : ''}<div class="sub mono">${b.profiles ? b.profiles.student_no : ''}</div></td>
              <td>${b.profiles ? b.profiles.phone : ''}</td>
              <td class="actions"><button type="button" class="btn btn-sm btn-danger" onClick=${() => del(b)}>Sil</button></td>
            </tr>`)}</tbody>
          </table></div>
        </div>`}
    <//>`;
}

// ---------------------------------------------------------------------
// Etkinlikler
// ---------------------------------------------------------------------
function EtkinlikAdmin() {
  const [list, setList] = useState(null);
  const [forms, setForms] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = useCallback(async () => {
    const [{ data: e }, { data: f }] = await Promise.all([
      sb.from('events').select('*').order('sort').order('starts_on'),
      sb.from('forms').select('id,title').order('created_at', { ascending: false })
    ]);
    setList(e || []); setForms(f || []);
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!list) return html`<${Loading} />`;
  return html`
    <div class="stack">
      <div class="toolbar"><p class="muted small">Yayındaki etkinlikler ana sayfada "Sıra" numarasına göre listelenir.</p><button type="button" class="btn btn-red" onClick=${() => setEdit({})}>Yeni etkinlik</button></div>
      ${list.length === 0 ? html`<${Empty}>Henüz etkinlik yok.<//>` : html`
        <div class="ev-list">
          ${list.map((e) => html`
            <div class="panel ev-row">
              ${e.poster_url ? html`<img class="ev-thumb" src=${e.poster_url} alt="" />` : html`<span class="ev-thumb ev-thumb-empty">Afiş yok</span>`}
              <div class="grow stack-xs">
                <b>${e.title}</b>
                <span class="sub">${[e.tag, e.starts_on ? fmtLong(e.starts_on) : e.date_text, e.venue].filter(Boolean).join(' · ')}</span>
                <span class="sub">${e.form_id ? 'Buton: forma yönlendirir' : e.cta_url ? 'Buton: ' + e.cta_url : 'Buton yok'}</span>
              </div>
              <span class=${'badge ' + (e.published ? 'badge-ok' : 'badge-no')}>${e.published ? 'Yayında' : 'Taslak'}</span>
              <button type="button" class="btn btn-sm btn-ghost" onClick=${() => setEdit(e)}>Düzenle</button>
            </div>`)}
        </div>`}
      ${edit ? html`<${EventEdit} e=${edit} forms=${forms} onClose=${() => setEdit(null)} onSaved=${() => { setEdit(null); load(); }} />` : null}
    </div>`;
}

function EventEdit({ e, forms, onClose, onSaved }) {
  const [f, setF] = useState({
    title: e.title || '', tag: e.tag || 'Etkinlik', starts_on: e.starts_on || '', date_text: e.date_text || '', venue: e.venue || '',
    description: e.description || '', poster_url: e.poster_url || '', cta_label: e.cta_label || '', cta_url: e.cta_url || '',
    form_id: e.form_id || '', published: e.id ? e.published : true, sort: e.sort || 0
  });
  const [uploading, setUploading] = useState(false);
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value });

  const upload = async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return toast('Afiş en fazla 8 MB olmalı.', 'err');
    setUploading(true);
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = new Date().toISOString().slice(0, 10) + '-' + crypto.randomUUID() + '.' + ext;
    const { error } = await sb.storage.from('posters').upload(path, file, { contentType: file.type, upsert: false });
    setUploading(false);
    if (error) return toast(errMsg(error), 'err');
    const { data } = sb.storage.from('posters').getPublicUrl(path);
    setF((x) => ({ ...x, poster_url: data.publicUrl }));
    toast('Afiş yüklendi. Kaydetmeyi unutma.');
  };
  const save = async (ev) => {
    ev.preventDefault();
    const row = { ...f, starts_on: f.starts_on || null, form_id: f.form_id || null, sort: +f.sort || 0 };
    const { error } = e.id ? await sb.from('events').update(row).eq('id', e.id) : await sb.from('events').insert(row);
    if (error) return toast(errMsg(error), 'err');
    toast('Etkinlik kaydedildi.');
    onSaved();
  };
  const remove = async () => {
    if (!confirm(e.title + ' silinsin mi?')) return;
    const { error } = await sb.from('events').delete().eq('id', e.id);
    if (error) return toast(errMsg(error), 'err');
    onSaved();
  };
  return html`
    <${Modal} title=${e.id ? 'Etkinliği düzenle' : 'Yeni etkinlik'} wide=${true} onClose=${onClose}>
      <form class="stack" onSubmit=${save}>
        <div class="poster-row">
          <div class="poster-prev">${f.poster_url ? html`<img src=${f.poster_url} alt="Afiş önizleme" />` : html`<span>Afiş yok</span>`}</div>
          <div class="stack">
            <label class="btn btn-ghost self-start file-btn">${uploading ? 'Yükleniyor…' : f.poster_url ? 'Afişi değiştir' : 'Afiş yükle'}<input type="file" accept="image/*" onChange=${upload} disabled=${uploading} /></label>
            ${f.poster_url ? html`<button type="button" class="btn btn-sm btn-ghost self-start" onClick=${() => setF({ ...f, poster_url: '' })}>Afişi kaldır</button>` : null}
            <p class="muted small">Dikey afiş (4:5 ya da A4) en iyi görünür. Afiş yoksa sitede renkli bir kart gösterilir.</p>
          </div>
        </div>
        <div class="fgrid">
          <${Field} label="Başlık"><input class="inp" required value=${f.title} onInput=${set('title')} /><//>
          <${Field} label="Etiket" hint="Festival, Open Mic, Konser…"><input class="inp" value=${f.tag} onInput=${set('tag')} /><//>
          <${Field} label="Tarih" hint="Boş bırakırsan aşağıdaki metin görünür"><input class="inp" type="date" value=${f.starts_on} onInput=${set('starts_on')} /><//>
          <${Field} label="Tarih metni"><input class="inp" value=${f.date_text} onInput=${set('date_text')} placeholder="Örn. 14 Mart, 20:00" /><//>
          <${Field} label="Yer"><input class="inp" value=${f.venue} onInput=${set('venue')} /><//>
          <${Field} label="Sıra" hint="Küçük numara önce görünür"><input class="inp" type="number" value=${f.sort} onInput=${set('sort')} /><//>
        </div>
        <${Field} label="Açıklama"><textarea class="inp" rows="3" value=${f.description} onInput=${set('description')}></textarea><//>
        <div class="fgrid">
          <${Field} label="Buton yazısı"><input class="inp" value=${f.cta_label} onInput=${set('cta_label')} placeholder="Bilet al / Başvur" /><//>
          <${Field} label="Buton bir forma gitsin"><select class="inp" value=${f.form_id} onChange=${set('form_id')}><option value="">Form yok</option>${forms.map((x) => html`<option value=${x.id}>${x.title}</option>`)}</select><//>
          <${Field} label="…ya da bir linke (bilet sayfası vb.)" wide=${true}><input class="inp" type="url" value=${f.cta_url} onInput=${set('cta_url')} placeholder="https://" disabled=${!!f.form_id} /><//>
        </div>
        <label class="check"><input type="checkbox" checked=${f.published} onChange=${set('published')} />Ana sayfada yayında</label>
        <div class="modal-actions">
          ${e.id ? html`<button type="button" class="btn btn-danger" onClick=${remove}>Sil</button>` : null}
          <span class="grow"></span><button type="submit" class="btn btn-red" disabled=${uploading}>Kaydet</button>
        </div>
      </form>
    <//>`;
}

// ---------------------------------------------------------------------
// Formlar ve başvurular
// ---------------------------------------------------------------------
const FIELD_TYPES = [['text', 'Kısa metin'], ['textarea', 'Uzun metin'], ['tel', 'Telefon'], ['number', 'Sayı'], ['radio', 'Tek seçim'], ['checkbox', 'Çoklu seçim'], ['select', 'Açılır liste']];

function FormlarAdmin() {
  const [list, setList] = useState(null);
  const [counts, setCounts] = useState({});
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null);
  const load = useCallback(async () => {
    const [{ data: f }, { data: r }] = await Promise.all([
      sb.from('forms').select('*').order('created_at', { ascending: false }),
      sb.from('form_responses').select('form_id')
    ]);
    const c = {};
    (r || []).forEach((x) => { c[x.form_id] = (c[x.form_id] || 0) + 1; });
    setList(f || []); setCounts(c);
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!list) return html`<${Loading} />`;
  const copy = (f) => {
    const url = location.origin + '/#/form/' + f.id;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Link kopyalandı: ' + url), () => prompt('Form linki:', url));
  };
  return html`
    <div class="stack">
      <div class="toolbar"><p class="muted small">Formu bir etkinliğe bağlayabilir ya da linkini paylaşabilirsin.</p><button type="button" class="btn btn-red" onClick=${() => setEdit({ title: '', description: '', fields: [], is_open: true })}>Yeni form</button></div>
      <div class="panel table-wrap">
        ${list.length === 0 ? html`<${Empty}>Henüz form yok.<//>` : html`
        <table class="tbl">
          <thead><tr><th>Form</th><th>Alan</th><th>Başvuru</th><th>Durum</th><th></th></tr></thead>
          <tbody>${list.map((f) => html`
            <tr>
              <td><b>${f.title}</b><div class="sub">${fmtDateTime(f.created_at)}</div></td>
              <td>${f.fields.length}</td><td><b>${counts[f.id] || 0}</b></td>
              <td><span class=${'badge ' + (f.is_open ? 'badge-ok' : 'badge-no')}>${f.is_open ? 'Açık' : 'Kapalı'}</span></td>
              <td class="actions">
                <button type="button" class="btn btn-sm btn-dark" onClick=${() => setView(f)}>Başvurular</button>
                <button type="button" class="btn btn-sm btn-ghost" onClick=${() => copy(f)}>Link</button>
                <button type="button" class="btn btn-sm btn-ghost" onClick=${() => setEdit(f)}>Düzenle</button>
              </td>
            </tr>`)}</tbody>
        </table>`}
      </div>
      ${edit ? html`<${FormEdit} f0=${edit} onClose=${() => setEdit(null)} onSaved=${() => { setEdit(null); load(); }} />` : null}
      ${view ? html`<${Responses} form=${view} onClose=${() => { setView(null); load(); }} />` : null}
    </div>`;
}

function FormEdit({ f0, onClose, onSaved }) {
  const [f, setF] = useState({ title: f0.title, description: f0.description, is_open: f0.is_open, fields: (f0.fields || []).map((x) => ({ ...x, options_text: (x.options || []).join(', ') })) });
  const updField = (i, k, v) => setF({ ...f, fields: f.fields.map((x, j) => j === i ? { ...x, [k]: v } : x) });
  const move = (i, d) => { const a = [...f.fields]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setF({ ...f, fields: a }); };
  const add = () => setF({ ...f, fields: [...f.fields, { id: 'f' + Math.random().toString(36).slice(2, 8), label: '', type: 'text', required: false, options_text: '' }] });
  const save = async (e) => {
    e.preventDefault();
    if (f.fields.some((x) => !x.label.trim())) return toast('Her alanın bir başlığı olmalı.', 'err');
    const fields = f.fields.map(({ options_text, ...x }) => ({ ...x, label: x.label.trim(), options: ['radio', 'checkbox', 'select'].includes(x.type) ? options_text.split(',').map((o) => o.trim()).filter(Boolean) : undefined }));
    const row = { title: f.title, description: f.description, is_open: f.is_open, fields };
    const { error } = f0.id ? await sb.from('forms').update(row).eq('id', f0.id) : await sb.from('forms').insert(row);
    if (error) return toast(errMsg(error), 'err');
    toast('Form kaydedildi.');
    onSaved();
  };
  const remove = async () => {
    if (!confirm(f0.title + ' ve tüm başvuruları silinsin mi?')) return;
    const { error } = await sb.from('forms').delete().eq('id', f0.id);
    if (error) return toast(errMsg(error), 'err');
    onSaved();
  };
  return html`
    <${Modal} title=${f0.id ? 'Formu düzenle' : 'Yeni form'} wide=${true} onClose=${onClose}>
      <form class="stack" onSubmit=${save}>
        <${Field} label="Form başlığı"><input class="inp" required value=${f.title} onInput=${(e) => setF({ ...f, title: e.target.value })} /><//>
        <${Field} label="Açıklama"><textarea class="inp" rows="2" value=${f.description} onInput=${(e) => setF({ ...f, description: e.target.value })}></textarea><//>
        <label class="check"><input type="checkbox" checked=${f.is_open} onChange=${(e) => setF({ ...f, is_open: e.target.checked })} />Başvuru kabul ediyor</label>
        <h3 class="h3">Alanlar</h3>
        <div class="stack-sm">
          ${f.fields.map((x, i) => html`
            <div class="field-row">
              <input class="inp" aria-label="Alan başlığı" placeholder="Soru / alan başlığı" value=${x.label} onInput=${(e) => updField(i, 'label', e.target.value)} />
              <select class="inp" aria-label="Alan türü" value=${x.type} onChange=${(e) => updField(i, 'type', e.target.value)}>${FIELD_TYPES.map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select>
              ${['radio', 'checkbox', 'select'].includes(x.type) ? html`<input class="inp" aria-label="Seçenekler" placeholder="Seçenekler, virgülle" value=${x.options_text} onInput=${(e) => updField(i, 'options_text', e.target.value)} />` : html`<span></span>`}
              <label class="check"><input type="checkbox" checked=${!!x.required} onChange=${(e) => updField(i, 'required', e.target.checked)} />Zorunlu</label>
              <div class="row-xs">
                <button type="button" class="icon-btn" aria-label="Yukarı taşı" onClick=${() => move(i, -1)}>↑</button>
                <button type="button" class="icon-btn" aria-label="Aşağı taşı" onClick=${() => move(i, 1)}>↓</button>
                <button type="button" class="icon-btn danger" aria-label="Alanı sil" onClick=${() => setF({ ...f, fields: f.fields.filter((_, j) => j !== i) })}>✕</button>
              </div>
            </div>`)}
        </div>
        <button type="button" class="btn btn-ghost self-start" onClick=${add}>+ Alan ekle</button>
        <div class="modal-actions">
          ${f0.id ? html`<button type="button" class="btn btn-danger" onClick=${remove}>Formu sil</button>` : null}
          <span class="grow"></span><button type="submit" class="btn btn-red">Kaydet</button>
        </div>
      </form>
    <//>`;
}

function Responses({ form, onClose }) {
  const [rows, setRows] = useState(null);
  const load = useCallback(async () => {
    const { data, error } = await sb.from('form_responses').select('*').eq('form_id', form.id).order('created_at', { ascending: false });
    if (error) toast(errMsg(error), 'err');
    setRows(data || []);
  }, [form.id]);
  useEffect(() => { load(); }, [load]);
  const val = (v) => Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v);
  const del = async (r) => {
    if (!confirm('Bu başvuru silinsin mi?')) return;
    const { error } = await sb.from('form_responses').delete().eq('id', r.id);
    if (error) return toast(errMsg(error), 'err');
    load();
  };
  const exp = () => downloadCSV(form.title.replace(/[^\wğüşıöçĞÜŞİÖÇ-]+/g, '-') + '.csv', [['Tarih', ...form.fields.map((x) => x.label)],
    ...rows.map((r) => [fmtDateTime(r.created_at), ...form.fields.map((x) => val(r.data[x.id]))])]);
  return html`
    <${Modal} title=${form.title + ' · başvurular'} wide=${true} onClose=${onClose}>
      ${!rows ? html`<${Loading} />` : rows.length === 0 ? html`<${Empty}>Henüz başvuru yok.<//>` : html`
        <div class="stack">
          <div class="row"><b>${rows.length} başvuru</b><button type="button" class="btn btn-ghost" onClick=${exp}>CSV indir (Excel)</button></div>
          <div class="table-wrap"><table class="tbl">
            <thead><tr><th>Tarih</th>${form.fields.map((x) => html`<th>${x.label}</th>`)}<th></th></tr></thead>
            <tbody>${rows.map((r) => html`<tr>
              <td class="sub">${fmtDateTime(r.created_at)}</td>
              ${form.fields.map((x) => html`<td>${val(r.data[x.id])}</td>`)}
              <td class="actions"><button type="button" class="btn btn-sm btn-danger" onClick=${() => del(r)}>Sil</button></td>
            </tr>`)}</tbody>
          </table></div>
        </div>`}
    <//>`;
}

// ---------------------------------------------------------------------
// Hesabım
// ---------------------------------------------------------------------
function Hesap({ me }) {
  const [pw, setPw] = useState({ a: '', b: '' });
  const submit = async (e) => {
    e.preventDefault();
    if (pw.a.length < 8) return toast('Yönetim hesabı şifresi en az 8 karakter olmalı.', 'err');
    if (pw.a !== pw.b) return toast('Şifreler aynı değil.', 'err');
    const { error } = await sb.auth.updateUser({ password: pw.a });
    if (error) return toast(errMsg(error), 'err');
    setPw({ a: '', b: '' });
    toast('Şifren değiştirildi.');
  };
  return html`
    <form class="panel pad stack narrow" onSubmit=${submit}>
      <h2 class="h2">Şifre değiştir</h2>
      <p class="muted small">Giriş adın: <b class="mono">${me.profile.username || me.profile.student_no}</b></p>
      <${Field} label="Yeni şifre"><input class="inp" type="password" autocomplete="new-password" value=${pw.a} onInput=${(e) => setPw({ ...pw, a: e.target.value })} /><//>
      <${Field} label="Yeni şifre (tekrar)"><input class="inp" type="password" autocomplete="new-password" value=${pw.b} onInput=${(e) => setPw({ ...pw, b: e.target.value })} /><//>
      <button type="submit" class="btn btn-red self-start">Şifreyi değiştir</button>
    </form>`;
}

// ---------------------------------------------------------------------
// Uygulama
// ---------------------------------------------------------------------
function AdminApp() {
  const [me, setMe] = useState(undefined);
  const [route, setRoute] = useState(parseRoute());
  const refresh = useCallback(async () => { try { setMe(await loadMe()); } catch (e) { setMe(null); } }, []);
  useEffect(() => {
    refresh();
    const { data: { subscription } } = sb.auth.onAuthStateChange((ev) => {
      if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') setTimeout(refresh, 0);
    });
    const onHash = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHash);
    return () => { subscription.unsubscribe(); window.removeEventListener('hashchange', onHash); };
  }, []);

  let body;
  if (me === undefined) body = html`<div class="login-bg"><${Loading} /></div>`;
  else if (!me) body = html`<${Login} />`;
  else if (!me.isAdmin) body = html`<${NoAccess} />`;
  else body = html`<${Shell} me=${me} route=${route} refresh=${refresh} />`;
  return html`${body}<${Toaster} />`;
}

function NoAccess() {
  const out = async () => { await sb.auth.signOut(); };
  return html`
    <div class="login-bg">
      <div class="login">
        <div class="login-brand"><img src="/assets/logo.png" alt="" /><div><b>BÜMT</b><span>Yönetim paneli</span></div></div>
        <p class="form-err" role="alert">Bu hesabın yönetim yetkisi yok.</p>
        <button type="button" class="btn btn-red btn-block" onClick=${out}>Başka hesapla giriş yap</button>
        <a class="small" href="/">← Siteye dön</a>
      </div>
    </div>`;
}

initSupabase()
  .then(() => render(html`<${AdminApp} />`, document.getElementById('app')))
  .catch((e) => {
    document.getElementById('app').innerHTML = '<div style="padding:40px;font-family:sans-serif;color:#fff">Panel ayarları yüklenemedi: ' + String(e.message || e).replace(/</g, '&lt;') + '</div>';
  });
