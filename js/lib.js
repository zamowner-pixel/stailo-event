import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

export const state = { session: null, profile: null, settings: null };

// ---------- Tema: 'auto' (ikut phone) | 'light' (oren & putih) | 'dark' (emas & hitam) ----------
export function getThemePref() { try { return localStorage.getItem('theme') || 'auto'; } catch { return 'auto'; } }
export function applyTheme(pref = getThemePref()) {
  const root = document.documentElement;
  if (pref === 'light' || pref === 'dark') root.setAttribute('data-theme', pref);
  else root.removeAttribute('data-theme');
  const dark = pref === 'dark' || (pref === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0A0A0B' : '#FFF8F1');
}
export function setThemePref(pref) { try { localStorage.setItem('theme', pref); } catch {} applyTheme(pref); }
applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const rm = (n) => 'RM ' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BULAN = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
export function fmtDate(d) {
  if (!d) return '';
  const x = new Date(d.length === 10 ? d + 'T00:00:00' : d);
  return `${x.getDate()} ${BULAN[x.getMonth()]} ${x.getFullYear()}`;
}
export function fmtDateTime(d) {
  if (!d) return '';
  const x = new Date(d);
  return `${fmtDate(d)}, ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
}
export function fmtRange(a, b) {
  if (!a) return '';
  if (!b || a === b) return fmtDate(a);
  return `${fmtDate(a)} – ${fmtDate(b)}`;
}

export function render(html) {
  $('#app').innerHTML = html;
  window.scrollTo(0, 0);
}
export function loading() { render('<div class="spinner" role="status" aria-label="Memuatkan"></div>'); }

export function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

let toastTimer;
export function toast(msg, type = '') {
  $$('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 3500);
}
export const errMsg = (e) => (e && (e.message || e.error_description)) || String(e);
export const fail = (e) => { console.error(e); toast(errMsg(e), 'error'); };

export async function must(q) {
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export function publicUrl(bucket, path) {
  if (!path) return '';
  return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export function fileExt(file) {
  const m = /\.([a-z0-9]+)$/i.exec(file.name || '');
  return (m ? m[1] : 'jpg').toLowerCase();
}

export function waLink(phone, text) {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.startsWith('0')) p = '6' + p;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

export async function loadSettings(force = false) {
  if (state.settings && !force) return state.settings;
  state.settings = await must(sb.from('settings').select('*').eq('id', 1).single());
  return state.settings;
}

// ---------- Ikon (SVG garis) ----------
const P = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  file: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h7M9 17h5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.5 3.5 5.2"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v8a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2z"/><path d="M13 6v12" stroke-dasharray="2 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wa: '<path d="M21 11.5a8.4 8.4 0 0 1-12.5 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  print: '<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  logout: '<path d="M15 4h4v16h-4M10 17l5-5-5-5M15 12H3"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  sound: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
  mute: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>'
};
export function icon(name, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

// ---------- Bar navigasi bawah ----------
export function nav(active) {
  const admin = state.profile?.role === 'admin';
  const items = admin
    ? [['#/a', 'home', 'Utama'], ['#/a/tapak', 'grid', 'Tapak'], ['#/a/vendor', 'users', 'Vendor'], ['#/a/invois', 'file', 'Invois'], ['#/a/tetapan', 'gear', 'Tetapan']]
    : [['#/v', 'grid', 'Pilih tapak'], ['#/v/tempahan', 'ticket', 'Tempahan'], ['#/akaun', 'user', 'Akaun']];
  return `<nav class="bottom-nav" aria-label="Navigasi utama">${items
    .map(([h, i, t]) => `<a href="${h}" class="${active === h ? 'active' : ''}"${active === h ? ' aria-current="page"' : ''}>${icon(i, 22)}${t}</a>`)
    .join('')}</nav>`;
}

export function topbar(title, { back, sub, right = '' } = {}) {
  return `<header class="topbar">
    ${back ? `<a class="icon-btn" href="${back}" aria-label="Kembali">${icon('back')}</a>` : ''}
    <div style="flex:1;min-width:0"><h1>${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
    ${right}
  </header>`;
}

// ---------- Helaian bawah ----------
export function openSheet(html) {
  closeSheet();
  const bd = document.createElement('div');
  bd.className = 'sheet-backdrop';
  bd.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  bd.addEventListener('click', (e) => { if (e.target === bd) closeSheet(); });
  document.body.appendChild(bd);
  const first = bd.querySelector('input, select, textarea, button');
  if (first) setTimeout(() => first.focus(), 50);
  return bd.querySelector('.sheet');
}
export function closeSheet() { $$('.sheet-backdrop').forEach((s) => s.remove()); }

export function lightbox(src) {
  const d = document.createElement('div');
  d.className = 'lightbox';
  d.innerHTML = `<img src="${esc(src)}" alt="Gambar besar">`;
  d.addEventListener('click', () => d.remove());
  document.body.appendChild(d);
}

export function confirmSheet(title, text, okLabel = 'Ya', danger = false) {
  return new Promise((resolve) => {
    const s = openSheet(`<h2>${esc(title)}</h2><p class="muted" style="margin:0">${esc(text)}</p>
      <div class="grid2"><button class="btn ghost" data-no>Batal</button><button class="btn ${danger ? 'dark' : ''}" data-yes>${esc(okLabel)}</button></div>`);
    s.querySelector('[data-no]').onclick = () => { closeSheet(); resolve(false); };
    s.querySelector('[data-yes]').onclick = () => { closeSheet(); resolve(true); };
  });
}

// Butang sibuk semasa proses
export async function busy(btn, fn) {
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = 'Sila tunggu…';
  try { return await fn(); }
  finally { btn.disabled = false; btn.innerHTML = old; }
}

// ---------- Peta tapak ----------
// mode 'vendor': lots dari lots_for_event (status, is_mine)
// mode 'admin' : lots penuh
export function lotMap(lots, { mode, selectedId } = {}) {
  if (!lots.length) return '<div class="empty">Belum ada tapak.</div>';
  const cols = Math.max(...lots.map((l) => l.col_no));
  const cells = lots.map((l) => {
    let cls, label = esc(l.code), aria, disabled = '';
    if (mode === 'vendor') {
      if (l.is_mine) { cls = 'mine'; aria = 'tapak anda'; }
      else if (l.status !== 'free') { cls = 'taken'; aria = 'sudah diambil'; disabled = ' disabled'; label = icon('lock', 11) + label; }
      else if (!(Number(l.price) > 0)) { cls = 'taken'; aria = 'harga belum ditetapkan'; disabled = ' disabled'; }
      else if (l.id === selectedId) { cls = 'v-sel'; aria = 'dipilih'; }
      else { cls = 'free'; aria = 'kosong'; }
    } else {
      cls = l.status;
      aria = STATUS_LOT[l.status]?.label || l.status;
      if (l.status === 'locked') label = icon('lock', 11) + label;
      if (l.id === selectedId) cls += ' sel';
    }
    return `<button class="lot ${cls}" data-lot="${l.id}" style="grid-row:${l.row_no};grid-column:${l.col_no}" aria-label="Tapak ${esc(l.code)}, ${aria}"${disabled}>${label}</button>`;
  }).join('');
  return `<div class="map-wrap"><div class="lotmap" style="grid-template-columns:repeat(${cols}, minmax(52px, 1fr))">${cells}</div></div>`;
}

export const STATUS_LOT = {
  free: { label: 'Kosong', badge: 'gray' },
  held: { label: 'Sedang dibayar', badge: 'amber' },
  paid: { label: 'Dibayar · perlu kunci', badge: 'amber' },
  locked: { label: 'Dikunci', badge: 'dark' }
};
export const STATUS_BOOKING = {
  pending_payment: { label: 'Belum bayar', badge: 'amber' },
  pending_verification: { label: 'Menunggu pengesahan', badge: 'amber' },
  approved: { label: 'Disahkan · dikunci', badge: 'green' },
  rejected: { label: 'Ditolak', badge: 'red' },
  expired: { label: 'Tamat masa', badge: 'gray' },
  cancelled: { label: 'Dibatalkan', badge: 'gray' }
};
export const badge = (map, s) => `<span class="badge ${map[s]?.badge || 'gray'}">${esc(map[s]?.label || s)}</span>`;
