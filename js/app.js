import { sb, state, render, esc, go, errMsg, must, closeSheet } from './lib.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { welcomeView, newPasswordView, accountView, stopMusic } from './views-auth.js';
import { pickLotView, payView, myBookingsView, clearTimers } from './views-vendor.js';
import { adminHomeView, adminLotsView, adminInvoicesView, invoiceFormView, settingsView, vendorsView } from './views-admin.js';
import { invoiceView } from './views-invoice.js';

// [corak, paparan, siapa boleh akses: 'guest' | 'any' | 'vendor' | 'admin']
const routes = [
  [/^\/?$/, () => welcomeView('start'), 'guest'],
  [/^\/masuk$/, () => welcomeView('login'), 'guest'],
  [/^\/daftar$/, () => go('#/masuk'), 'guest'],
  [/^\/kata-laluan$/, newPasswordView, 'any'],
  [/^\/akaun$/, accountView, 'any'],
  [/^\/invois\/(?<id>[0-9a-f-]{36})$/, invoiceView, 'any'],
  [/^\/v$/, pickLotView, 'vendor'],
  [/^\/v\/bayar\/(?<id>[0-9a-f-]{36})$/, payView, 'vendor'],
  [/^\/v\/tempahan$/, myBookingsView, 'vendor'],
  [/^\/a$/, adminHomeView, 'admin'],
  [/^\/a\/tapak$/, adminLotsView, 'admin'],
  [/^\/a\/invois$/, adminInvoicesView, 'admin'],
  [/^\/a\/invois\/baru$/, (p, q) => invoiceFormView({}, q), 'admin'],
  [/^\/a\/invois\/(?<id>[0-9a-f-]{36})\/edit$/, invoiceFormView, 'admin'],
  [/^\/a\/vendor$/, vendorsView, 'admin'],
  [/^\/a\/tetapan$/, settingsView, 'admin']
];

const homeFor = () => (state.profile?.role === 'admin' ? '#/a' : '#/v');

async function loadProfile() {
  if (!state.session) { state.profile = null; return; }
  if (state.profile?.id === state.session.user.id) return;
  state.profile = await must(sb.from('profiles').select('*').eq('id', state.session.user.id).single());
}

let routing = 0;
async function router() {
  const my = ++routing;
  closeSheet();
  clearTimers();
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const query = new URLSearchParams(qs || '');
  const match = routes.map(([re, view, who]) => [re.exec(path), view, who]).find(([m]) => m);

  try {
    await loadProfile();
    if (my !== routing) return;
    if (!match) return go(state.session ? homeFor() : '#/');
    const [m, view, who] = match;
    if (who === 'guest' && state.session) return go(homeFor());
    if (who !== 'guest' && !state.session) return go('#/masuk');
    if (who === 'admin' && state.profile.role !== 'admin') return go('#/v');
    if (who === 'vendor' && state.profile.role === 'admin') return go('#/a');
    if (who !== 'guest' && state.profile.role === 'vendor' && !state.profile.is_active) {
      render(`<div class="page"><div class="content" style="padding-top:60px"><div class="card stack">
        <b>Akaun tidak aktif</b><span class="small muted">Akaun ${esc(state.profile.vendor_code || '')} telah dinyahaktifkan. Sila hubungi admin.</span>
        <button class="btn ghost" id="lo">Log keluar</button></div></div></div>`);
      document.getElementById('lo').onclick = async () => { await sb.auth.signOut(); go('#/'); };
      return;
    }
    if (who !== 'guest') stopMusic();
    await view(m.groups || {}, query);
  } catch (err) {
    console.error(err);
    if (my !== routing) return;
    render(`<div class="page"><div class="content" style="padding-top:60px">
      <div class="card stack"><b>Ada masalah</b><span class="small muted">${esc(errMsg(err))}</span>
      <button class="btn" onclick="location.reload()">Cuba lagi</button>
      ${state.session ? '<button class="btn ghost" id="lo">Log keluar</button>' : ''}</div></div></div>`);
    const lo = document.getElementById('lo');
    if (lo) lo.onclick = async () => { await sb.auth.signOut(); go('#/'); };
  }
}

async function start() {
  if (SUPABASE_URL.includes('XXXXXXXX') || SUPABASE_ANON_KEY.startsWith('TUKAR')) {
    render(`<div class="page"><div class="content" style="padding-top:60px"><div class="card stack">
      <b>Sambungan Supabase belum ditetapkan</b>
      <span class="small muted">Buka fail <code>js/config.js</code> dan isi SUPABASE_URL serta SUPABASE_ANON_KEY projek anda. Lihat README.md.</span>
    </div></div></div>`);
    return;
  }
  const { data } = await sb.auth.getSession();
  state.session = data.session;
  sb.auth.onAuthStateChange((event, session) => {
    const was = state.session?.user?.id;
    state.session = session;
    if (event === 'PASSWORD_RECOVERY') return go('#/kata-laluan');
    if ((session?.user?.id || null) !== (was || null)) {
      state.profile = null;
      state.settings = null;
      // '#/' → router muatkan profil, kemudian halakan ke halaman admin / vendor
      go('#/');
    }
  });
  window.addEventListener('hashchange', router);
  router();
}

start();

// Daftar service worker (supaya boleh "Add to Home screen")
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
