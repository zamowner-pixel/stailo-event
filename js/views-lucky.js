// Cabutan bertuah: page pendaftaran pembeli (QR), skrin cabutan petugas, urusan admin & QR vendor.
import {
  sb, state, render, loading, esc, icon, toast, fail, go, busy, must, topbar, nav, fmtRange, fmtDateTime,
  openSheet, closeSheet, loadSettings
} from './lib.js';
import { qrSvg, drawQr } from './qr.js';
import { Pdf, wrap } from './pdf.js';
import { downloadBlob } from './invoice-pdf.js';
import { APP_NAME } from './config.js';

const base = () => location.origin + location.pathname;
export const joinUrl = (eventId, vendorCode = '') => `${base()}#/c/${eventId}${vendorCode ? '?v=' + encodeURIComponent(vendorCode) : ''}`;
const drawUrl = () => `${base()}#/cabutan/masuk`;
const save = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const load = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const DL = icon('upload', 18).replace('M12 16V4M7 9l5-5 5 5', 'M12 4v12M7 11l5 5 5-5');
const randomPassword = () => Array.from(crypto.getRandomValues(new Uint32Array(2))).map((n) => n.toString(36)).join('').slice(0, 10);

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('Pautan disalin'); }
  catch { prompt('Salin pautan ini:', t); }
}

// =============================================================
// Poster QR (PNG) — untuk dicetak dan dipamerkan di booth / pentas
// =============================================================
export async function posterBlob(ev, vendor = null, prizes = []) {
  const W = 1240, H = 1754; // A4 pada ~150 dpi
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#2b2110'); g.addColorStop(0.55, '#0e0c09'); g.addColorStop(1, '#000');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(245,197,66,.10)';
  for (let i = 0; i < 70; i++) { x.beginPath(); x.arc((i * 397) % W, (i * 613) % H, 2 + (i % 4), 0, Math.PI * 2); x.fill(); }
  x.strokeStyle = '#F5C542'; x.lineWidth = 6; x.strokeRect(40, 40, W - 80, H - 80);
  try {
    const img = new Image(); img.src = 'assets/logo.jpg'; await img.decode();
    x.save(); x.beginPath(); x.roundRect(W / 2 - 80, 90, 160, 160, 36); x.clip(); x.drawImage(img, W / 2 - 80, 90, 160, 160); x.restore();
  } catch {}
  x.textAlign = 'center';
  x.fillStyle = '#F5C542'; x.font = '800 40px system-ui, Arial'; x.fillText('CABUTAN BERTUAH', W / 2, 320);
  x.fillStyle = '#fff'; x.font = '900 104px system-ui, Arial'; x.fillText('IMBAS & MENANG!', W / 2, 440);
  x.fillStyle = '#e9dcc0'; x.font = '500 40px system-ui, Arial';
  x.fillText(vendor ? 'Beli di booth kami, imbas QR & sertai cabutan' : 'Imbas QR & sertai cabutan bertuah', W / 2, 510);
  const q = 660;
  x.fillStyle = '#fff'; x.beginPath(); x.roundRect(W / 2 - q / 2 - 30, 570, q + 60, q + 60, 36); x.fill();
  drawQr(x, joinUrl(ev.id, vendor?.vendor_code || ''), W / 2 - q / 2, 600, q);
  let y = 1340;
  x.fillStyle = '#fff'; x.font = '800 52px system-ui, Arial';
  for (const ln of fitLines(x, ev.name, W - 200).slice(0, 2)) { x.fillText(ln, W / 2, y); y += 62; }
  x.fillStyle = '#cbbd9c'; x.font = '500 34px system-ui, Arial';
  const sub = [fmtRange(ev.start_date, ev.end_date), ev.location].filter(Boolean).join(' · ');
  if (sub) { x.fillText(sub, W / 2, y); y += 56; }
  if (vendor) { x.fillStyle = '#F5C542'; x.font = '700 40px system-ui, Arial'; x.fillText(vendor.business_name, W / 2, y); y += 56; }
  if (prizes.length) {
    x.fillStyle = '#e9dcc0'; x.font = '600 32px system-ui, Arial';
    const t = 'Hadiah: ' + prizes.slice(0, 4).map((p) => p.name).join(' · ') + (prizes.length > 4 ? ' …' : '');
    for (const ln of fitLines(x, t, W - 200).slice(0, 2)) { x.fillText(ln, W / 2, y); y += 44; }
  }
  x.fillStyle = '#8f8064'; x.font = '500 26px system-ui, Arial';
  x.fillText(`${APP_NAME} · Seorang hanya boleh menang sekali`, W / 2, H - 80);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
function fitLines(x, text, max) {
  const words = String(text || '').split(/\s+/); const out = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (x.measureText(t).width <= max || !cur) cur = t; else { out.push(cur); cur = w; } }
  if (cur) out.push(cur);
  return out;
}
const posterName = (ev, vendor) => `Poster cabutan ${ev.name}${vendor ? ' ' + vendor.business_name : ''}`.replace(/[\\/:*?"<>|]+/g, '').trim() + '.png';

// =============================================================
// PAGE PEMBELI: #/c/:id?v=KOD  (tanpa log masuk)
// =============================================================
export async function luckyJoinView({ id }, query) {
  loading();
  const v = (query.get('v') || '').trim();
  let info;
  try { info = await must(sb.rpc('lucky_event_info', { p_event: id, p_vendor: v })); } catch (err) { info = null; }
  const key = `lucky:${id}:${v.toUpperCase()}`;
  const done = load(key);
  const shell = (inner) => render(`<div class="lucky-page"><div class="lucky-card">
    <img src="assets/logo.jpg" alt="${esc(APP_NAME)}" class="lucky-logo">
    <div class="lucky-eyebrow">CABUTAN BERTUAH</div>${inner}</div></div>`);
  if (!info) return shell('<h1>Event tidak dijumpai</h1><p class="lucky-sub">Sila imbas semula kod QR di booth atau pentas.</p>');
  const prizes = info.prizes || [];
  const head = `<h1>${esc(info.name)}</h1>
    <p class="lucky-sub">${esc([fmtRange(info.start_date, info.end_date), info.location].filter(Boolean).join(' · '))}</p>
    ${info.vendor ? `<div class="lucky-from">Didaftarkan melalui booth <b>${esc(info.vendor)}</b></div>` : ''}
    ${prizes.length ? `<div class="lucky-prizes"><b>Hadiah</b>${prizes.map((p) => `<span>${esc(p.name)}${p.qty > 1 ? ` <i>× ${p.qty}</i>` : ''}</span>`).join('')}</div>` : ''}`;
  const success = (name, dup) => shell(`${head}<div class="lucky-ok">${icon('check', 34)}
    <h2>${dup ? 'Anda sudah berdaftar' : 'Pendaftaran berjaya!'}</h2>
    <p>${dup ? 'Nombor telefon ini sudah didaftarkan melalui kod QR ini.' : `Terima kasih${name ? ', ' + esc(name) : ''}. Nama anda telah dimasukkan ke dalam cabutan bertuah.`} Pemenang akan diumumkan di pentas dan dihubungi melalui telefon. Semoga bertuah!</p></div>`);
  if (done) return success(done, false);
  if (!info.open) return shell(`${head}<div class="lucky-closed">Pendaftaran cabutan bertuah belum dibuka atau telah ditutup.</div>`);
  shell(`${head}
    <form id="lf" class="lucky-form">
      <label>Nama penuh<input name="name" id="lj-name" required minlength="2" maxlength="60" autocomplete="name" placeholder="Cth: Siti Aisyah"></label>
      <label>No. telefon<input name="phone" id="lj-phone" required inputmode="tel" autocomplete="tel" placeholder="Cth: 0123456789"></label>
      <label class="lucky-consent"><input type="checkbox" name="ok" id="lj-ok" required> Saya bersetuju nama dan nombor telefon saya digunakan oleh penganjur untuk cabutan bertuah ini dan untuk menghubungi saya jika menang. Data dipadam selepas event.</label>
      <button class="btn block" type="submit">Sertai cabutan</button>
    </form>`);
  const f = document.getElementById('lf');
  f.onsubmit = async (e) => {
    e.preventDefault();
    await busy(f.querySelector('button'), async () => {
      try {
        const r = await must(sb.rpc('lucky_join', { p_event: id, p_name: f.name.value, p_phone: f.phone.value, p_vendor: v }));
        save(key, f.name.value.trim());
        success(f.name.value.trim(), r === 'dup');
      } catch (err) { fail(err); }
    });
  };
}

// =============================================================
// LOG MASUK PETUGAS CABUTAN: #/cabutan/masuk
// =============================================================
export function drawLoginView() {
  if (state.session && ['draw', 'admin'].includes(state.profile?.role)) return go('#/cabutan');
  render(`<div class="lucky-page"><div class="lucky-card">
    <img src="assets/logo.jpg" alt="${esc(APP_NAME)}" class="lucky-logo">
    <div class="lucky-eyebrow">CABUTAN BERTUAH</div>
    <h1>Log masuk petugas</h1>
    <p class="lucky-sub">Gunakan ID dan kata laluan khas cabutan yang diberi oleh admin.</p>
    <form id="df" class="lucky-form">
      <label>ID petugas<input name="id" id="dl-id" required autocapitalize="none" autocomplete="username" placeholder="Cth: CABUTAN"></label>
      <label>Kata laluan<input name="password" id="dl-pw" type="password" required minlength="6" autocomplete="current-password"></label>
      <button class="btn block" type="submit">Masuk ke skrin cabutan</button>
    </form></div></div>`);
  const f = document.getElementById('df');
  f.onsubmit = async (e) => {
    e.preventDefault();
    await busy(f.querySelector('button'), async () => {
      try {
        const { toLoginEmail } = await import('./views-auth.js');
        save('afterLogin', '#/cabutan');
        const { error } = await sb.auth.signInWithPassword({ email: toLoginEmail(f.id.value), password: f.password.value });
        if (error) throw new Error(/invalid/i.test(error.message) ? 'ID atau kata laluan salah.' : error.message);
      } catch (err) { save('afterLogin', ''); fail(err); }
    });
  };
}

// =============================================================
// SKRIN CABUTAN (petugas / admin): #/cabutan
// =============================================================
let spinTimer;
export function clearLuckyTimers() { clearTimeout(spinTimer); }

export async function drawConsoleView(params, query) {
  loading();
  const events = await must(sb.from('events').select('id,name,start_date,end_date,location,draw_open,is_active').order('created_at', { ascending: false }));
  if (!events.length) { render('<div class="draw-stage"><div class="draw-empty">Belum ada event.</div></div>'); return; }
  const ev = events.find((e) => e.id === query.get('e')) || events.find((e) => e.id === load('drawEvent')) || events.find((e) => e.draw_open) || events[0];
  save('drawEvent', ev.id);
  const [prizes, winners, pool] = await Promise.all([
    must(sb.from('lucky_prizes').select('*').eq('event_id', ev.id).order('sort').order('created_at')),
    must(sb.rpc('lucky_winner_list', { p_event: ev.id })),
    must(sb.rpc('lucky_pool', { p_event: ev.id }))
  ]);
  const won = (pid) => winners.filter((w) => w.status === 'won' && w.prize === prizes.find((p) => p.id === pid)?.name).length;
  const left = (p) => p.qty - won(p.id);
  let sel = prizes.find((p) => p.id === load('drawPrize') && left(p) > 0) || prizes.find((p) => left(p) > 0) || null;
  const admin = state.profile.role === 'admin';

  const draw = () => {
    render(`<div class="draw-stage">
      <header class="draw-top">
        <img src="assets/logo.jpg" alt="" class="draw-logo">
        <div class="draw-title"><div class="draw-eyebrow">CABUTAN BERTUAH</div>
          <select id="dev" class="draw-select" aria-label="Pilih event">${events.map((e) => `<option value="${e.id}"${e.id === ev.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>
        <div class="draw-actions">
          <button class="draw-ghost" id="dfs" aria-label="Skrin penuh">${icon('grid', 18)} Skrin penuh</button>
          ${admin ? '<a class="draw-ghost" href="#/a/cabutan">Urus cabutan</a>' : ''}
          <button class="draw-ghost" id="dout">${icon('logout', 18)} ${admin ? 'Admin' : 'Keluar'}</button>
        </div>
      </header>
      <div class="draw-main">
        <section class="draw-center">
          <div class="draw-stats"><span><b>${pool.total}</b> penyertaan</span><span><b>${pool.eligible}</b> peserta layak</span>${ev.draw_open ? '<span class="draw-live">Pendaftaran dibuka</span>' : '<span>Pendaftaran ditutup</span>'}</div>
          <div class="draw-prize-now">${sel ? `Hadiah: <b>${esc(sel.name)}</b> <span>(${left(sel)} lagi)</span>` : prizes.length ? 'Semua hadiah telah dicabut' : 'Admin belum masukkan senarai hadiah'}</div>
          <div class="draw-slot" id="slot" aria-live="polite"><span>${pool.eligible ? 'Sedia untuk cabutan' : 'Tiada peserta layak'}</span></div>
          <button class="draw-go" id="go"${sel && pool.eligible ? '' : ' disabled'}>MULA CABUTAN</button>
          <div class="draw-prizes" role="group" aria-label="Pilih hadiah">${prizes.map((p) => `<button data-p="${p.id}" class="${sel?.id === p.id ? 'on' : ''}"${left(p) > 0 ? '' : ' disabled'}>${esc(p.name)}<i>${left(p)}/${p.qty}</i></button>`).join('')}</div>
        </section>
        <aside class="draw-side">
          <div class="draw-side-h">Pemenang (${winners.filter((w) => w.status === 'won').length})</div>
          <div class="draw-list">${winners.length ? winners.map((w) => `<div class="draw-w${w.status === 'forfeit' ? ' off' : ''}"><b>${esc(w.name)}</b><span>${esc(w.phone)} · ${esc(w.prize)}</span>${w.status === 'forfeit' ? '<em>Tidak hadir</em>' : ''}</div>`).join('') : '<div class="draw-none">Belum ada pemenang.</div>'}</div>
        </aside>
      </div>
    </div>`);
    document.getElementById('dev').onchange = (e) => { save('drawPrize', ''); go('#/cabutan?e=' + e.target.value); };
    document.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { sel = prizes.find((p) => p.id === b.dataset.p); save('drawPrize', sel.id); draw(); }));
    document.getElementById('dfs').onclick = () => { (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {}); };
    document.getElementById('dout').onclick = async () => { if (admin) return go('#/a'); await sb.auth.signOut(); go('#/cabutan/masuk'); };
    const goBtn = document.getElementById('go');
    goBtn.onclick = () => runDraw(goBtn);
  };

  async function runDraw(btn) {
    btn.disabled = true; document.querySelectorAll('[data-p],#dev').forEach((b) => (b.disabled = true));
    const slot = document.getElementById('slot');
    const names = pool.names.length ? pool.names : ['…'];
    let result = null, error = null;
    sb.rpc('lucky_draw', { p_event: ev.id, p_prize: sel.id }).then(({ data, error: e }) => { if (e) error = e; else result = data; });
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = Date.now(), total = reduce ? 600 : 5200;
    let i = Math.floor(Math.random() * names.length);
    slot.classList.add('spinning');
    const tick = () => {
      const t = Date.now() - start;
      if (t >= total && (result || error)) {
        slot.classList.remove('spinning');
        if (error) { slot.innerHTML = '<span>Cabutan gagal</span>'; fail(error); return setTimeout(() => go('#/cabutan?e=' + ev.id + '&t=' + Date.now()), 1500); }
        slot.innerHTML = `<span class="final">${esc(result.name)}</span>`;
        return setTimeout(() => winnerPopup(result), reduce ? 200 : 700);
      }
      i = (i + 1) % names.length;
      slot.innerHTML = `<span>${esc(names[i])}</span>`;
      const p = Math.min(t / total, 1);
      spinTimer = setTimeout(tick, 40 + Math.pow(p, 3) * 320);
    };
    tick();
  }

  function winnerPopup(r) {
    const bd = document.createElement('div');
    bd.className = 'draw-pop';
    bd.innerHTML = `<canvas class="draw-confetti"></canvas><div class="draw-pop-card" role="dialog" aria-modal="true" aria-label="Pemenang">
      <div class="draw-eyebrow">TAHNIAH!</div>
      <div class="draw-pop-prize">${esc(r.prize)}</div>
      <div class="draw-pop-name">${esc(r.name)}</div>
      <div class="draw-pop-meta">${esc(r.phone)}${r.vendor ? ' · ' + esc(r.vendor) : ''}</div>
      <div class="draw-pop-btns"><button class="draw-go small" id="pnext">Teruskan</button><button class="draw-ghost" id="pforfeit">Tidak hadir · cabut semula</button></div>
    </div>`;
    document.body.appendChild(bd);
    confetti(bd.querySelector('canvas'));
    const close = () => { bd.remove(); go('#/cabutan?e=' + ev.id + '&t=' + Date.now()); };
    bd.querySelector('#pnext').onclick = close;
    bd.querySelector('#pforfeit').onclick = async () => {
      try { await must(sb.rpc('lucky_forfeit', { p_winner: r.id })); toast(`${r.name} ditanda tidak hadir. Hadiah dibuka semula.`); close(); }
      catch (err) { fail(err); }
    };
    bd.querySelector('#pnext').focus();
  }
  draw();
}

function confetti(cv) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const x = cv.getContext('2d'); const W = (cv.width = innerWidth), H = (cv.height = innerHeight);
  const C = ['#F5C542', '#E8620F', '#ffffff', '#12805C', '#C0263E'];
  const ps = Array.from({ length: 180 }, () => ({ x: W / 2, y: H / 2, vx: (Math.random() - 0.5) * 18, vy: Math.random() * -18 - 4, s: 4 + Math.random() * 6, c: C[(Math.random() * C.length) | 0], r: Math.random() * 6 }));
  let n = 0;
  const step = () => {
    x.clearRect(0, 0, W, H);
    ps.forEach((p) => { p.vy += 0.45; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += 0.2; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); x.restore(); });
    if (++n < 200 && cv.isConnected) requestAnimationFrame(step);
  };
  step();
}

// =============================================================
// ADMIN: #/a/cabutan
// =============================================================
export async function adminLuckyView(params, query) {
  loading();
  const events = await must(sb.from('events').select('*').order('created_at', { ascending: false }));
  if (!events.length) {
    render(`<div class="page">${topbar('Cabutan bertuah', { back: '#/a' })}<div class="content"><div class="card">Cipta event dahulu di menu Tapak.</div></div>${nav('#/a')}</div>`);
    return;
  }
  const ev = events.find((e) => e.id === query.get('e')) || events.find((e) => e.is_active) || events[0];
  const [prizes, entries, winners, staff] = await Promise.all([
    must(sb.from('lucky_prizes').select('*').eq('event_id', ev.id).order('sort').order('created_at')),
    must(sb.from('lucky_entries').select('*').eq('event_id', ev.id).order('created_at')),
    must(sb.from('lucky_winners').select('*').eq('event_id', ev.id).order('drawn_at', { ascending: false })),
    must(sb.from('profiles').select('vendor_code,is_active').eq('role', 'draw'))
  ]);
  const vendorCodes = [...new Set(entries.map((e) => e.vendor_code).filter(Boolean))];
  const vendors = vendorCodes.length ? await must(sb.from('profiles').select('vendor_code,business_name').in('vendor_code', vendorCodes)) : [];
  const vName = (c) => (c ? vendors.find((v) => v.vendor_code === c)?.business_name || c : 'QR umum');
  const byVendor = Object.entries(entries.reduce((a, e) => { a[e.vendor_code] = (a[e.vendor_code] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const url = joinUrl(ev.id);
  let rows = prizes.map((p) => ({ ...p }));
  const reload = () => go(`#/a/cabutan?e=${ev.id}&t=${Date.now()}`);

  render(`<div class="page">${topbar('Cabutan bertuah', { back: '#/a', sub: `${entries.length} penyertaan`, right: `<a class="btn sm" href="#/cabutan">${icon('ticket', 16)} Skrin cabutan</a>` })}
    <div class="content">
      <select class="input" id="lev" aria-label="Pilih event">${events.map((e) => `<option value="${e.id}"${e.id === ev.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</select>

      <div class="card row between" style="gap:12px;flex-wrap:wrap">
        <div><b>Pendaftaran pembeli</b><div class="small muted">${ev.draw_open ? 'Dibuka. Pembeli boleh imbas QR dan daftar.' : 'Ditutup. QR tidak menerima pendaftaran baru.'}</div></div>
        <button class="btn ${ev.draw_open ? 'ghost' : ''}" id="ltoggle">${ev.draw_open ? 'Tutup pendaftaran' : 'Buka pendaftaran'}</button>
      </div>

      <div class="lucky-admin-grid">
        <div class="card stack">
          <b>QR umum event</b>
          <div class="small muted">Untuk pentas atau kaunter penganjur. Setiap vendor ada QR sendiri di menu Tempahan mereka.</div>
          <div class="qr-box">${qrSvg(url, 200)}</div>
          <div class="small" style="word-break:break-all">${esc(url)}</div>
          <div class="grid2"><button class="btn ghost" id="lcopy">Salin pautan</button><button class="btn" id="lposter">${DL} Poster PNG</button></div>
        </div>

        <div class="card stack">
          <div class="row between"><b>Senarai hadiah</b><span class="small muted">${prizes.reduce((a, p) => a + p.qty, 0)} hadiah</span></div>
          <div id="prows" class="stack" style="gap:8px"></div>
          <button class="btn ghost" id="padd">${icon('plus', 16)} Tambah hadiah</button>
          <button class="btn dark" id="psave">Simpan senarai hadiah</button>
        </div>
      </div>

      <div class="card stack">
        <b>Penyertaan ikut booth</b>
        ${byVendor.length ? `<div class="list">${byVendor.map(([c, n]) => `<div class="list-item" style="cursor:default"><span class="grow"><span class="title">${esc(vName(c))}</span><span class="small muted">${c ? 'ID ' + esc(c) : 'Pentas / kaunter'}</span></span><b>${n}</b></div>`).join('')}</div>` : '<div class="small muted">Belum ada penyertaan.</div>'}
      </div>

      <div class="card stack">
        <b>Pemenang (${winners.filter((w) => w.status === 'won').length})</b>
        ${winners.length ? `<div class="list">${winners.map((w) => `<div class="list-item" style="cursor:default;align-items:flex-start"><span class="grow"><span class="title">${esc(w.name)} <span class="small muted">${esc(w.phone)}</span></span><span class="small muted">${esc(w.prize_name)} · ${esc(vName(w.vendor_code))} · ${esc(fmtDateTime(w.drawn_at))}</span></span>${w.status === 'forfeit' ? '<span class="badge gray">Tidak hadir</span>' : '<span class="badge green">Menang</span>'}</div>`).join('')}</div>` : '<div class="small muted">Belum ada cabutan.</div>'}
      </div>

      <div class="card stack">
        <b>${icon('file', 18)} Simpan data ke laptop & kosongkan</b>
        <span class="small muted">Muat turun PDF (nama, no. telefon, booth & pemenang), kemudian padam data cabutan event ini dari apps.</span>
        <button class="btn" id="lpdf"${entries.length || winners.length ? '' : ' disabled'}>${DL} Muat turun PDF & kosongkan</button>
      </div>

      <form class="card stack" id="lstaff">
        <b>${icon('key', 18)} Akaun petugas cabutan</b>
        <span class="small muted">ID & kata laluan khas untuk buka skrin cabutan sahaja (tidak boleh lihat data lain). ${staff.length ? 'Akaun sedia ada: <b>' + staff.map((s) => esc(s.vendor_code)).join(', ') + '</b>. Simpan semula untuk tukar kata laluan.' : ''}</span>
        <div class="grid2">
          <label class="field">ID<input class="input" name="code" id="ls-code" required value="${esc(staff[0]?.vendor_code || 'CABUTAN')}" style="text-transform:uppercase;font-weight:700"></label>
          <label class="field">Kata laluan<input class="input" name="pw" id="ls-pw" required minlength="6" value="${randomPassword()}"></label>
        </div>
        <button class="btn dark" type="submit">Simpan akaun petugas</button>
        <div class="small muted">Page log masuk petugas: <span style="word-break:break-all">${esc(drawUrl())}</span> <a href="#" id="lcopy2">Salin</a></div>
      </form>
    </div>${nav('#/a')}</div>`);

  const drawRows = () => {
    document.getElementById('prows').innerHTML = rows.length ? rows.map((r, i) => `<div class="row" style="gap:8px">
      <input class="input" data-pn="${i}" id="pn-${i}" value="${esc(r.name)}" placeholder="Nama hadiah" maxlength="60" style="flex:1;min-width:0" aria-label="Nama hadiah">
      <input class="input" data-pq="${i}" id="pq-${i}" type="number" min="1" max="1000" value="${r.qty}" style="width:76px" aria-label="Kuantiti">
      <button class="icon-btn" data-pd="${i}" aria-label="Buang hadiah" style="color:var(--red)">${icon('trash', 16)}</button></div>`).join('')
      : '<div class="small muted">Belum ada hadiah. Tekan "Tambah hadiah".</div>';
    document.querySelectorAll('[data-pn]').forEach((el) => (el.oninput = () => { rows[+el.dataset.pn].name = el.value; }));
    document.querySelectorAll('[data-pq]').forEach((el) => (el.oninput = () => { rows[+el.dataset.pq].qty = Math.max(1, +el.value || 1); }));
    document.querySelectorAll('[data-pd]').forEach((el) => (el.onclick = () => { rows.splice(+el.dataset.pd, 1); drawRows(); }));
  };
  drawRows();
  document.getElementById('lev').onchange = (e) => go('#/a/cabutan?e=' + e.target.value);
  document.getElementById('padd').onclick = () => { rows.push({ name: '', qty: 1 }); drawRows(); document.getElementById('pn-' + (rows.length - 1))?.focus(); };
  document.getElementById('psave').onclick = (e) => busy(e.currentTarget, async () => {
    try {
      const clean = rows.map((r, i) => ({ ...r, name: String(r.name || '').trim(), sort: i })).filter((r) => r.name);
      const keep = clean.filter((r) => r.id).map((r) => r.id);
      const del = prizes.filter((p) => !keep.includes(p.id)).map((p) => p.id);
      if (del.length) await must(sb.from('lucky_prizes').delete().in('id', del));
      for (const r of clean) {
        const row = { event_id: ev.id, name: r.name, qty: r.qty, sort: r.sort };
        if (r.id) await must(sb.from('lucky_prizes').update(row).eq('id', r.id));
        else await must(sb.from('lucky_prizes').insert(row));
      }
      toast('Senarai hadiah disimpan'); reload();
    } catch (err) { fail(err); }
  });
  document.getElementById('ltoggle').onclick = (e) => busy(e.currentTarget, async () => {
    try { await must(sb.from('events').update({ draw_open: !ev.draw_open }).eq('id', ev.id)); toast(ev.draw_open ? 'Pendaftaran ditutup' : 'Pendaftaran dibuka'); reload(); }
    catch (err) { fail(err); }
  });
  document.getElementById('lcopy').onclick = () => copyText(url);
  document.getElementById('lcopy2').onclick = (e) => { e.preventDefault(); copyText(drawUrl()); };
  document.getElementById('lposter').onclick = (e) => busy(e.currentTarget, async () => { downloadBlob(await posterBlob(ev, null, prizes), posterName(ev)); });
  document.getElementById('lstaff').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    busy(f.querySelector('button[type=submit]'), async () => {
      try {
        const code = await must(sb.rpc('admin_set_draw_account', { p_code: f.code.value, p_password: f.pw.value }));
        openSheet(`<h2>Akaun petugas cabutan</h2>
          <div class="card stack" style="background:var(--card-2)"><div>ID: <b>${esc(code)}</b></div><div>Kata laluan: <b>${esc(f.pw.value)}</b></div><div class="small" style="word-break:break-all">Log masuk di: ${esc(drawUrl())}</div></div>
          <div class="small muted">Simpan maklumat ini. Kata laluan tidak dipaparkan lagi selepas ditutup.</div>
          <button class="btn block" id="cpy">Salin maklumat</button><button class="btn ghost block" id="cls">Tutup</button>`);
        document.getElementById('cpy').onclick = () => copyText(`Petugas cabutan ${APP_NAME}\nID: ${code}\nKata laluan: ${f.pw.value}\nLog masuk: ${drawUrl()}`);
        document.getElementById('cls').onclick = () => { closeSheet(); reload(); };
      } catch (err) { fail(err); }
    });
  };
  document.getElementById('lpdf').onclick = (e) => busy(e.currentTarget, async () => {
    try {
      const s = await loadSettings();
      const blob = luckyPdf(ev, entries, winners, vName, s);
      const name = `Cabutan bertuah ${ev.name} ${new Date().toISOString().slice(0, 10)}`.replace(/[\\/:*?"<>|]+/g, '') + '.pdf';
      downloadBlob(blob, name);
      purgeSheet(ev, entries.length, winners.length, name, reload);
    } catch (err) { fail(err); }
  });
}

function purgeSheet(ev, nE, nW, fileName, reload) {
  const s = openSheet(`<div class="card row" style="background:var(--green-soft);color:var(--green);gap:10px">${icon('check', 22)}<div class="small"><b>PDF dimuat turun</b><br>${esc(fileName)} · ${nE} penyertaan, ${nW} pemenang</div></div>
    <h2 style="color:var(--red)">Padam data cabutan event ini?</h2>
    <p class="small" style="margin:0">Semua nama, no. telefon dan senarai pemenang bagi <b>${esc(ev.name)}</b> akan dipadam kekal. Senarai hadiah kekal. Pendaftaran akan ditutup.</p>
    <form id="pf" class="stack">
      <label class="field">Taip nama event untuk sahkan<input class="input" name="n" id="lp-n" autocomplete="off" placeholder="${esc(ev.name)}" required></label>
      <button class="btn danger block" type="submit" disabled>${icon('trash', 18)} Padam data cabutan</button>
      <button class="btn ghost block" type="button" id="pc">Belum, padam kemudian</button>
    </form>`);
  const f = s.querySelector('#pf'), btn = f.querySelector('button[type=submit]');
  f.n.oninput = () => { btn.disabled = f.n.value.trim() !== ev.name.trim(); };
  s.querySelector('#pc').onclick = closeSheet;
  f.onsubmit = (e) => {
    e.preventDefault();
    busy(btn, async () => {
      try { const r = await must(sb.rpc('admin_purge_lucky', { p_event: ev.id, p_confirm: f.n.value.trim() })); closeSheet(); toast(`Dipadam: ${r.entries} penyertaan, ${r.winners} pemenang`); reload(); }
      catch (err) { fail(err); }
    });
  };
}

// PDF senarai peserta & pemenang (berbilang halaman)
export function luckyPdf(ev, entries, winners, vName, s = {}) {
  const p = new Pdf(); const L = 40, R = p.W - 40, MUTED = '#6b6b6b', ORANGE = '#B5651D';
  let y = 0, page = 1;
  const header = (title) => {
    y = 46;
    p.text(String(s.company_name || APP_NAME).toUpperCase(), L, y, { size: 9, bold: true, color: ORANGE });
    p.text('Halaman ' + page, R, y, { size: 8, color: MUTED, align: 'right' });
    y += 22; p.text(title, L, y, { size: 15, bold: true });
    y += 15; p.text(`${ev.name} · ${[fmtRange(ev.start_date, ev.end_date), ev.location].filter(Boolean).join(' · ')}`, L, y, { size: 9, color: MUTED });
    y += 12; p.text('Dijana ' + fmtDateTime(new Date().toISOString()), L, y, { size: 8, color: MUTED });
    y += 18;
  };
  const cols = [[L, 'Bil'], [L + 30, 'Nama'], [L + 230, 'No. telefon'], [L + 320, 'Booth'], [R - 70, 'Masa']];
  const tableHead = () => { p.rect(L, y - 11, R - L, 17, { fill: '#F6EFE4' }); cols.forEach(([x, t]) => p.text(t, x + 3, y, { size: 8, bold: true, color: '#444444' })); y += 16; };
  const newPage = (title) => { p.addPage(); page++; header(title); tableHead(); };
  header('Senarai peserta cabutan bertuah');
  p.text(`Jumlah penyertaan: ${entries.length} · Peserta unik (ikut no. telefon): ${new Set(entries.map((e) => e.phone)).size}`, L, y, { size: 9, bold: true }); y += 16;
  tableHead();
  entries.forEach((e, i) => {
    if (y > p.H - 50) newPage('Senarai peserta (sambungan)');
    if (i % 2) p.rect(L, y - 10, R - L, 14, { fill: '#FAFAFA' });
    p.text(String(i + 1), L + 3, y, { size: 8 });
    p.text(wrap(e.name, 8, 195)[0], L + 33, y, { size: 8 });
    p.text(e.phone, L + 233, y, { size: 8 });
    p.text(wrap(vName(e.vendor_code), 8, 140)[0], L + 323, y, { size: 8 });
    p.text(fmtDateTime(e.created_at).replace(/^\d+ \w+ \d+, /, ''), L + 3 + (R - 70 - L), y, { size: 8 });
    y += 14;
  });
  if (!entries.length) { p.text('Tiada penyertaan.', L + 3, y, { size: 9, color: MUTED }); y += 14; }
  // Pemenang
  p.addPage(); page++; header('Senarai pemenang');
  if (!winners.length) p.text('Belum ada pemenang.', L, y, { size: 9, color: MUTED });
  winners.slice().reverse().forEach((w, i) => {
    if (y > p.H - 60) { p.addPage(); page++; header('Senarai pemenang (sambungan)'); }
    p.text(`${i + 1}. ${w.prize_name}`, L, y, { size: 10, bold: true });
    p.text(w.status === 'forfeit' ? 'TIDAK HADIR' : 'MENANG', R, y, { size: 8, bold: true, align: 'right', color: w.status === 'forfeit' ? '#999999' : '#12805C' });
    y += 13; p.text(`${w.name} · ${w.phone} · ${vName(w.vendor_code)} · ${fmtDateTime(w.drawn_at)}`, L + 14, y, { size: 9, color: '#333333' });
    y += 18;
  });
  return p.output();
}

// =============================================================
// VENDOR: kad QR cabutan dalam menu Tempahan
// =============================================================
export async function vendorLuckyHtml() {
  const lots = await must(sb.from('lots').select('event_id,status').eq('vendor_id', state.profile.id).in('status', ['locked', 'signing']));
  const ids = [...new Set(lots.map((l) => l.event_id))];
  if (!ids.length || !state.profile.vendor_code) return { html: '', bind: () => {} };
  const events = await must(sb.from('events').select('id,name,start_date,end_date,location,draw_open').in('id', ids));
  const data = await Promise.all(events.map(async (ev) => {
    const [count, info] = await Promise.all([
      sb.rpc('lucky_vendor_count', { p_event: ev.id }).then((r) => r.data || 0),
      sb.rpc('lucky_event_info', { p_event: ev.id, p_vendor: '' }).then((r) => r.data || {})
    ]);
    return { ev, count, prizes: info.prizes || [] };
  }));
  const code = state.profile.vendor_code;
  const html = `<div class="section-title">QR cabutan bertuah</div>${data.map(({ ev, count, prizes }) => `
    <div class="card stack">
      <div class="row between" style="align-items:flex-start"><div><b>${esc(ev.name)}</b><div class="small muted">${ev.draw_open ? 'Pendaftaran dibuka' : 'Pendaftaran belum dibuka oleh penganjur'} · <b>${count}</b> pembeli daftar melalui QR anda</div></div></div>
      <div class="small">Cetak poster ini dan letak di booth. Pembeli yang membeli di booth anda boleh imbas QR untuk sertai cabutan bertuah${prizes.length ? ` (hadiah: ${esc(prizes.slice(0, 3).map((p) => p.name).join(', '))}${prizes.length > 3 ? ' …' : ''})` : ''}.</div>
      <div class="qr-box">${qrSvg(joinUrl(ev.id, code), 180)}</div>
      <div class="grid2"><button class="btn" data-vposter="${ev.id}">${DL} Poster PNG</button><button class="btn ghost" data-vcopy="${ev.id}">Salin pautan</button></div>
    </div>`).join('')}`;
  const bind = () => {
    document.querySelectorAll('[data-vposter]').forEach((b) => (b.onclick = () => busy(b, async () => {
      const d = data.find((x) => x.ev.id === b.dataset.vposter);
      downloadBlob(await posterBlob(d.ev, { vendor_code: code, business_name: state.profile.business_name }, d.prizes), posterName(d.ev, state.profile));
    })));
    document.querySelectorAll('[data-vcopy]').forEach((b) => (b.onclick = () => copyText(joinUrl(b.dataset.vcopy, code))));
  };
  return { html, bind };
}
