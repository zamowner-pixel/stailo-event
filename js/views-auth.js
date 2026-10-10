import { sb, state, render, esc, icon, toast, fail, go, busy, must, loadSettings, topbar, nav, getThemePref, setThemePref } from './lib.js';
import { APP_NAME, VENDOR_EMAIL_DOMAIN } from './config.js';

// ---------- Video intro + muzik ----------
// Video: assets/intro.mp4 (bunyi video = muzik latar). Poster: assets/intro-poster.jpg
// Phone hanya benarkan video main sendiri tanpa bunyi — bunyi dihidupkan selepas sentuhan pertama.
let video;
let unlocked = false; // bunyi dah dibenarkan oleh browser (selepas sentuhan pertama)
// Pilihan muzik hanya untuk sesi ini — setiap kali apps dibuka semula, muzik bermula ON
function soundPref() { try { return sessionStorage.getItem('music') !== 'off'; } catch { return true; } }
function setSoundPref(on) { try { sessionStorage.setItem('music', on ? 'on' : 'off'); } catch {} }
try { localStorage.removeItem('music'); } catch {}

function unmuteSafely(v) {
  v.muted = false;
  const p = v.play();
  if (p) p.catch(() => { v.muted = true; v.play().catch(() => {}); });
}

function getVideo() {
  if (!video) {
    video = document.createElement('video');
    video.className = 'intro-video';
    video.src = 'assets/intro.mp4';
    video.poster = 'assets/intro-poster.jpg';
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.preload = 'auto';
    // Sentuhan pertama di mana-mana = hidupkan bunyi (muzik bermula ON).
    // Guna 'click'/'touchend' kerana hanya event ini dikira "sentuhan sebenar" oleh phone.
    const unlock = (e) => {
      if (unlocked) return;
      if (e && e.target && e.target.closest && e.target.closest('#music')) return; // butang muzik urus sendiri
      unlocked = true;
      ['click', 'touchend', 'keydown'].forEach((t) => document.removeEventListener(t, unlock, true));
      if (soundPref() && video.isConnected) unmuteSafely(video);
      document.querySelector('.tap-start')?.remove();
    };
    ['click', 'touchend', 'keydown'].forEach((t) => document.addEventListener(t, unlock, true));
  }
  return video;
}

function setupIntro(container, btn) {
  const v = getVideo();
  container.prepend(v);
  const paint = () => {
    // Muzik dikira ON jika sedang berbunyi, atau jika pilihan ON dan masih menunggu sentuhan pertama
    const on = (!v.muted && !v.paused) || (!unlocked && soundPref());
    btn.innerHTML = `${icon(on ? 'sound' : 'mute', 18)}<span>Muzik: ${on ? 'ON' : 'OFF'}</span>`;
    btn.setAttribute('aria-label', on ? 'Matikan muzik' : 'Hidupkan muzik');
  };
  v.onvolumechange = paint; v.onplay = paint; v.onpause = paint;
  btn.onclick = (e) => {
    e.stopPropagation();
    const playing = !v.muted && !v.paused;
    const pendingOn = !unlocked && soundPref();
    unlocked = true;
    document.querySelector('.tap-start')?.remove();
    if (playing) { v.muted = true; setSoundPref(false); }
    else if (pendingOn) { unmuteSafely(v); setSoundPref(true); } // tekan pertama pada butang = hidupkan
    else { unmuteSafely(v); setSoundPref(true); }
    paint();
  };

  if (soundPref() && !unlocked) {
    // Cuba main terus dengan bunyi (sesetengah phone/apps yang dipasang benarkan)
    v.muted = false;
    v.play().then(() => { unlocked = true; paint(); }).catch(() => {
      // Browser halang bunyi automatik: main tanpa bunyi dahulu, tunjuk "Ketik untuk mula"
      v.muted = true;
      v.play().catch(() => {});
      if (!container.querySelector('.tap-start')) {
        const t = document.createElement('div');
        t.className = 'tap-start';
        t.innerHTML = `<span>${icon('sound', 18)} Ketik di mana-mana untuk mula</span>`;
        container.appendChild(t);
      }
      paint();
    });
  } else {
    v.muted = !soundPref() || !unlocked;
    v.play().catch(() => {});
  }
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
export async function accountView() {
  const p = state.profile;
  const admin = p.role === 'admin';
  const st = admin ? await loadSettings(true) : null;
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
        ${admin ? '' : `<div class="field">Jenis perniagaan
          <div class="input" style="display:flex;align-items:center;gap:8px;background:var(--card-2);cursor:default" aria-readonly="true">${icon('lock', 16)}<b style="flex:1">${p.business_type ? esc(p.business_type) : '<span class="muted" style="font-weight:400">Belum ditetapkan</span>'}</b></div>
          <span class="small muted" style="font-weight:400">Ditetapkan oleh penganjur. Hubungi penganjur jika perlu ditukar.</span></div>`}
        <button class="btn block" type="submit">Simpan</button>
      </form>
      ${admin ? `<form id="org" class="card stack">
        <b>Penganjur (dalam perjanjian vendor)</b>
        <div class="small muted">Nama penganjur: <b>STAILO EVENT</b></div>
        <label class="field">No. pendaftaran perniagaan<input class="input" name="org_reg_no" value="${esc(st.org_reg_no || '')}" placeholder="Cth: 202403123456 (SA0123456-X)"></label>
        <button class="btn block" type="submit">Simpan</button>
        <div class="small muted">Dimasukkan ke perjanjian yang diluluskan selepas ini.</div>
      </form>` : docsCardHtml(p)}
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
      <div class="small muted" style="text-align:center;font-size:11px">© ${new Date().getFullYear()} Stailo Event. Hak cipta terpelihara.</div>
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
  if (!admin) bindDocs(p);
  const org = document.getElementById('org');
  if (org) org.onsubmit = async (e) => {
    e.preventDefault();
    await busy(org.querySelector('button'), async () => {
      try { state.settings = await must(sb.from('settings').update({ org_reg_no: org.org_reg_no.value.trim() }).eq('id', 1).select().single()); toast('No. pendaftaran disimpan'); }
      catch (err) { fail(err); }
    });
  };
  document.querySelectorAll('[data-theme-pick]').forEach((b) => (b.onclick = () => {
    setThemePref(b.dataset.themePick);
    document.querySelectorAll('[data-theme-pick]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  document.getElementById('logout').onclick = async () => { await sb.auth.signOut(); go('#/'); };
}

// ---------- Dokumen vendor ----------
export const DOCS = [
  { key: 'ssm_path', name: 'Sijil SSM', hint: 'Pendaftaran perniagaan', need: () => true },
  { key: 'typhoid_path', name: 'Kad suntikan typhoid', hint: 'Untuk peniaga makanan', need: (p) => p.category === 'makanan', foodOnly: true },
  { key: 'food_cert_path', name: 'Sijil pengendalian makanan', hint: 'Kursus pengendali makanan', need: (p) => p.category === 'makanan', foodOnly: true }
];
export const docsComplete = (p) => DOCS.every((d) => !d.need(p) || p[d.key]);

function docsCardHtml(p) {
  const food = p.category === 'makanan';
  const list = DOCS.filter((d) => !d.foodOnly || food);
  return `<div class="card stack">
    <div class="row between"><b>Dokumen perniagaan</b>${docsComplete(p) ? '<span class="badge green">Lengkap</span>' : '<span class="badge red">Belum lengkap</span>'}</div>
    <div class="field" style="gap:6px">Kategori perniagaan
      <div class="seg" role="group" aria-label="Kategori perniagaan" style="grid-template-columns:1fr 1fr">
        <button type="button" data-cat="makanan" aria-pressed="${food}">Makanan</button>
        <button type="button" data-cat="bukan_makanan" aria-pressed="${!food}">Bukan Makanan</button>
      </div>
    </div>
    <div class="small muted">${food ? 'Makanan: SSM, kad typhoid dan sijil pengendalian makanan wajib.' : 'Bukan makanan: SSM wajib.'} Muat naik <b>gambar</b> sahaja (ambil gambar dokumen dengan jelas).</div>
    ${list.map((d) => `
      <div class="row" style="gap:12px;padding:10px 0;border-top:1px solid var(--line-2)">
        <span class="code-tile${p[d.key] ? '' : ' amber'}" style="min-width:40px;height:40px">${icon(p[d.key] ? 'check' : 'file', 18)}</span>
        <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">
          <b class="small" style="font-size:14px">${d.name} ${d.need(p) ? '<span class="badge red" style="margin-left:4px">Wajib</span>' : '<span class="badge gray" style="margin-left:4px">Pilihan</span>'}</b>
          <span class="small muted">${p[d.key] ? 'Sudah dimuat naik' : d.hint}</span>
        </span>
        ${p[d.key] ? `<button class="btn ghost sm" data-doc-view="${d.key}">Lihat</button>` : ''}
        <label class="btn ${p[d.key] ? 'ghost' : ''} sm" style="cursor:pointer">${p[d.key] ? 'Tukar' : 'Muat naik'}<input type="file" accept="image/*" class="hidden" data-doc-up="${d.key}"></label>
      </div>${d.key === 'ssm_path' ? `
      <form id="ssmno" class="stack" style="gap:6px;padding-bottom:6px">
        <label class="field">No. pendaftaran SSM
          <div class="row" style="gap:8px"><input class="input" name="id_no" value="${esc(p.id_no || '')}" placeholder="Cth: 202303123456" style="flex:1" autocomplete="off"><button class="btn sm" type="submit">Simpan</button></div></label>
        <span class="small muted" id="ssmstat">${p.id_no ? 'Sila pastikan nombor ini sama seperti dalam sijil SSM anda.' : 'Nombor akan dibaca automatik daripada gambar SSM yang anda muat naik.'}</span>
      </form>` : ''}`).join('')}
  </div>`;
}

function bindDocs(p) {
  document.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = async () => {
    if (b.dataset.cat === p.category) return;
    try {
      state.profile = await must(sb.from('profiles').update({ category: b.dataset.cat }).eq('id', p.id).select().single());
      toast(b.dataset.cat === 'makanan' ? 'Kategori: Makanan' : 'Kategori: Bukan Makanan');
      accountView();
    } catch (err) { fail(err); }
  }));
  const ssmf = document.getElementById('ssmno');
  if (ssmf) ssmf.onsubmit = async (e) => {
    e.preventDefault();
    await busy(ssmf.querySelector('button'), async () => {
      try { state.profile = await must(sb.from('profiles').update({ id_no: ssmf.id_no.value.trim() }).eq('id', p.id).select().single()); toast('No. pendaftaran SSM disimpan'); }
      catch (err) { fail(err); }
    });
  };
  document.querySelectorAll('[data-doc-up]').forEach((inp) => (inp.onchange = async () => {
    const file = inp.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) return toast('Sila muat naik gambar sahaja (JPG / PNG)', 'error');
    const key = inp.dataset.docUp;
    toast('Memuat naik…');
    try {
      const img = await shrinkImage(file);
      const path = `${p.id}/${key.replace('_path', '')}-${Date.now()}.jpg`;
      await must(sb.storage.from('vendor-docs').upload(path, img, { contentType: 'image/jpeg' }));
      const old = p[key];
      state.profile = await must(sb.from('profiles').update({ [key]: path }).eq('id', p.id).select().single());
      if (old) sb.storage.from('vendor-docs').remove([old]);
      toast('Dokumen disimpan');
      await accountView();
      if (key === 'ssm_path') readSsmNumber(img);
    } catch (err) { fail(err); }
  }));
  document.querySelectorAll('[data-doc-view]').forEach((b) => (b.onclick = async () => {
    try {
      const r = await must(sb.storage.from('vendor-docs').createSignedUrl(p[b.dataset.docView], 600));
      window.open(r.signedUrl, '_blank', 'noopener');
    } catch (err) { fail(err); }
  }));
}

// ---------- Baca no. pendaftaran SSM daripada gambar (OCR di phone vendor) ----------
// Format baru: 12 digit, cth 202303123456 (tahun + jenis entiti 01–06 + 6 digit)
// Format lama: cth SA0123456-X, 001234567-K, 1234567-T
export function findSsmNumber(text) {
  const t = String(text || '').toUpperCase().replace(/[–—_]/g, '-');
  const fixDigits = (x) => x.replace(/[OQD]/g, '0').replace(/[IL|]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2');
  let modern = null, old = null;
  // Cari jujukan 12 digit (boleh ada ruang / sengkang), betulkan huruf yang tersilap baca
  const cand = t.match(/[0-9OQDILSBZ|][0-9OQDILSBZ|\s-]{10,20}[0-9OQDILSBZ|]/g) || [];
  for (const c of cand) {
    const d = fixDigits(c).replace(/[\s-]/g, '');
    const m = d.match(/(19[5-9]\d|20[0-4]\d)(0[1-6])(\d{6})/);
    if (m && /\d/.test(c)) { modern = m[0]; break; }
  }
  const o = t.match(/\b([A-Z]{2}\s?\d{7}|\d{6,9})\s?-\s?([A-Z])\b/);
  if (o) old = (o[1].replace(/\s/g, '') + '-' + o[2]);
  if (modern && old) return `${modern} (${old})`;
  return modern || old || '';
}

let ocrLib;
async function readSsmNumber(blob) {
  const stat = document.getElementById('ssmstat');
  const input = document.querySelector('#ssmno input[name=id_no]');
  const say = (m) => { if (stat) stat.textContent = m; };
  try {
    say('Membaca nombor pendaftaran daripada gambar… (kali pertama mungkin ambil masa 10–20 saat)');
    ocrLib = ocrLib || (await import('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js')).default;
    const { data } = await ocrLib.recognize(blob, 'eng');
    const no = findSsmNumber(data?.text);
    if (!no) { say('Nombor pendaftaran tidak dapat dibaca daripada gambar. Sila taip sendiri dan tekan Simpan.'); input?.focus(); return; }
    state.profile = await must(sb.from('profiles').update({ id_no: no }).eq('id', state.profile.id).select().single());
    if (input) input.value = no;
    say('Nombor dikesan daripada gambar. Sila semak — jika salah, betulkan dan tekan Simpan.');
    toast('No. pendaftaran SSM dikesan: ' + no);
  } catch (err) {
    console.error(err);
    say('Gagal membaca gambar secara automatik. Sila taip nombor pendaftaran dan tekan Simpan.');
  }
}

// Kecilkan gambar (maks 1600px, JPEG) supaya cepat dimuat naik
function shrinkImage(file, max = 1600) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.width, im.height));
      const c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => resolve(b || file), 'image/jpeg', 0.85);
    };
    im.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    im.src = url;
  });
}
