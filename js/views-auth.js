import { sb, state, render, esc, icon, toast, fail, go, busy, must, topbar, nav, getThemePref, setThemePref } from './lib.js';
import { APP_NAME, VENDOR_EMAIL_DOMAIN } from './config.js';

// ---------- Video intro + muzik ----------
// Video: assets/intro.mp4 (bunyi video = muzik latar). Poster: assets/intro-poster.jpg
// Phone hanya benarkan video main sendiri tanpa bunyi — bunyi dihidupkan selepas sentuhan pertama.
let video;
function soundPref() { try { return localStorage.getItem('music') !== 'off'; } catch { return true; } }
function setSoundPref(on) { try { localStorage.setItem('music', on ? 'on' : 'off'); } catch {} }

function getVideo() {
  if (!video) {
    video = document.createElement('video');
    video.className = 'intro-video';
    video.src = 'assets/intro.mp4';
    video.poster = 'assets/intro-poster.jpg';
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.preload = 'auto';
    // Bunyi hidup selepas sentuhan pertama (jika pengguna tak matikan)
    const unlock = () => {
      if (soundPref() && video.isConnected) { video.muted = false; video.play().catch(() => {}); }
    };
    document.addEventListener('pointerdown', unlock, { once: true });
  }
  return video;
}

function setupIntro(container, btn) {
  const v = getVideo();
  container.prepend(v);
  v.play().catch(() => {});
  const paint = () => {
    const on = !v.muted && !v.paused;
    btn.innerHTML = `${icon(on ? 'sound' : 'mute', 18)}<span>Muzik: ${on ? 'ON' : 'OFF'}</span>`;
    btn.setAttribute('aria-label', on ? 'Matikan muzik' : 'Hidupkan muzik');
  };
  v.onvolumechange = paint; v.onplay = paint; v.onpause = paint;
  btn.onclick = (e) => {
    e.stopPropagation();
    if (v.muted) { v.muted = false; v.play().catch(() => {}); setSoundPref(true); }
    else { v.muted = true; setSoundPref(false); }
  };
  paint();
}
export function stopMusic() { if (video) { video.muted = true; video.pause(); } }

// ---------- Selamat datang + log masuk ----------
// Vendor log masuk dengan ID vendor (cth V001). Admin log masuk dengan emel.
export function toLoginEmail(id) {
  const v = String(id || '').trim();
  return v.includes('@') ? v.toLowerCase() : v.toLowerCase() + '@' + VENDOR_EMAIL_DOMAIN;
}

export function welcomeView(mode = 'start') {
  const forms = {
    start: `
      <a class="btn light block" href="#/masuk">Log masuk</a>
      <div class="small" style="color:#C9CAD3;text-align:center;line-height:1.5">Vendor baru? Hubungi admin untuk dapatkan ID vendor &amp; kata laluan.</div>`,
    login: `
      <form id="f" class="stack" autocomplete="on">
        <label class="field">ID<input class="input" name="id" required autocomplete="username" autocapitalize="none" placeholder="Cth: V001"></label>
        <label class="field">Kata laluan<input class="input" type="password" name="password" required autocomplete="current-password" minlength="6"></label>
        <button class="btn light block" type="submit">Log masuk</button>
        <div class="small" style="color:#C9CAD3;line-height:1.5">Lupa kata laluan? Hubungi admin untuk set semula.</div>
      </form>`
  };
  const tagline = {
    start: 'Sewa tapak event dengan mudah. Pilih nombor tapak, bayar, siap.',
    login: 'Log masuk dengan ID dan kata laluan anda.'
  };
  render(`<div class="welcome ${mode}">
    <div class="intro-shade"></div>
    <div class="row" style="justify-content:flex-end;position:relative"><button class="music" id="music"></button></div>
    <div style="flex:1;min-height:40px"></div>
    <div style="position:relative;display:flex;flex-direction:column;gap:8px">
      <div style="font-size:13px;font-weight:700;letter-spacing:.1em;color:var(--brand-orange)">SELAMAT DATANG KE ${esc(APP_NAME).toUpperCase()}</div>
      <div style="font-size:16px;line-height:1.5;color:#E4E5EA;max-width:340px">${tagline[mode]}</div>
    </div>
    <div style="position:relative;display:flex;flex-direction:column;gap:12px;margin-top:20px">${forms[mode]}</div>
  </div>`);
  setupIntro(document.querySelector('.welcome'), document.getElementById('music'));

  const f = document.getElementById('f');
  if (!f) return;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    await busy(f.querySelector('button[type=submit]'), async () => {
      try {
        const { error } = await sb.auth.signInWithPassword({ email: toLoginEmail(d.id), password: d.password });
        if (error) {
          if (/banned/i.test(error.message)) throw new Error('Akaun anda tidak aktif. Sila hubungi admin.');
          if (/invalid/i.test(error.message)) throw new Error('ID atau kata laluan salah.');
          throw error;
        }
        // onAuthStateChange dalam app.js akan halakan ke halaman betul
      } catch (err) { fail(err); }
    });
  };
  const forgot = document.getElementById('forgot');
  if (forgot) forgot.onclick = async (e) => {
    e.preventDefault();
    const email = f.id.value.trim();
    if (!email.includes('@')) return toast('Isi emel admin dalam ruangan di atas dahulu', 'error');
    try {
      await must(sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + '#/kata-laluan' }));
      toast('Pautan tukar kata laluan telah dihantar ke emel anda.');
    } catch (err) { fail(err); }
  };
}

// ---------- Tukar kata laluan (dari pautan emel) ----------
export function newPasswordView() {
  render(`<div class="page">${topbar('Kata laluan baru')}
    <div class="content"><form id="f" class="card stack">
      <label class="field">Kata laluan baru<input class="input" type="password" name="p" minlength="6" required autocomplete="new-password"></label>
      <button class="btn block">Simpan</button></form></div></div>`);
  const f = document.getElementById('f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    await busy(f.querySelector('button'), async () => {
      try { await must(sb.auth.updateUser({ password: f.p.value })); toast('Kata laluan dikemas kini'); go('#/'); }
      catch (err) { fail(err); }
    });
  };
}

// ---------- Akaun (vendor & admin) ----------
export function accountView() {
  const p = state.profile;
  const admin = p.role === 'admin';
  render(`<div class="page">${topbar('Akaun', { back: admin ? '#/a/tetapan' : '' })}
    <div class="content">
      <div class="card row" style="gap:14px">
        <span style="min-width:56px;height:56px;padding:0 10px;border-radius:14px;background:var(--mine-bg);color:var(--mine-ink);font-family:var(--display);font-weight:700;font-size:18px;display:flex;align-items:center;justify-content:center">${esc(admin ? 'ADMIN' : p.vendor_code || '—')}</span>
        <div><b>${esc(p.business_name || '-')}</b><div class="small muted">${admin ? 'ID admin: <b>' + esc((p.vendor_code || p.email || '').toLowerCase()) + '</b>' : 'ID vendor anda: <b>' + esc(p.vendor_code || '-') + '</b>'}</div></div>
      </div>
      <form id="f" class="card stack">
        <b>Maklumat</b>
        <label class="field">Nama perniagaan<input class="input" name="business_name" value="${esc(p.business_name)}" required></label>
        <label class="field">Nama pemilik<input class="input" name="owner_name" value="${esc(p.owner_name)}"></label>
        <label class="field">No. telefon (WhatsApp)<input class="input" type="tel" name="phone" value="${esc(p.phone)}"></label>
        <button class="btn block" type="submit">Simpan</button>
      </form>
      <form id="pw" class="card stack">
        <b>Tukar kata laluan</b>
        <label class="field">Kata laluan baru (min. 6 aksara)<input class="input" type="password" name="p1" minlength="6" required autocomplete="new-password"></label>
        <label class="field">Taip semula<input class="input" type="password" name="p2" minlength="6" required autocomplete="new-password"></label>
        <button class="btn dark block" type="submit">Tukar kata laluan</button>
      </form>
      <div class="card stack">
        <b>Tema</b>
        <div class="seg" role="group" aria-label="Tema">
          ${[['auto', 'Ikut phone'], ['light', 'Cerah'], ['dark', 'Gelap']].map(([k, t]) => `<button type="button" data-theme-pick="${k}" aria-pressed="${getThemePref() === k}">${t}</button>`).join('')}
        </div>
        <div class="small muted">Cerah: oren &amp; putih · Gelap: emas &amp; hitam</div>
      </div>
      <button class="btn ghost block" id="logout">${icon('logout')} Log keluar</button>
    </div>${admin ? '' : nav('#/akaun')}</div>`);
  const f = document.getElementById('f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    await busy(f.querySelector('button'), async () => {
      try {
        state.profile = await must(sb.from('profiles').update(d).eq('id', p.id).select().single());
        toast('Disimpan');
      } catch (err) { fail(err); }
    });
  };
  const pw = document.getElementById('pw');
  pw.onsubmit = async (e) => {
    e.preventDefault();
    if (pw.p1.value !== pw.p2.value) return toast('Kata laluan tidak sama', 'error');
    await busy(pw.querySelector('button'), async () => {
      try { await must(sb.auth.updateUser({ password: pw.p1.value })); pw.reset(); toast('Kata laluan ditukar'); }
      catch (err) { fail(err); }
    });
  };
  document.querySelectorAll('[data-theme-pick]').forEach((b) => (b.onclick = () => {
    setThemePref(b.dataset.themePick);
    document.querySelectorAll('[data-theme-pick]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  document.getElementById('logout').onclick = async () => { await sb.auth.signOut(); go('#/'); };
}
