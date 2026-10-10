import {
  sb, state, render, loading, esc, icon, rm, fmtDate, fmtRange, fmtDateTime, toast, fail, go, busy, must,
  topbar, nav, lotMap, publicUrl, lightbox, loadSettings, fileExt, openSheet, closeSheet, confirmSheet,
  badge, STATUS_LOT, waLink, scheduleHtml
} from './lib.js';
import { DOCS, docsComplete } from './views-auth.js';
import { signaturePad, isExpired, leftText, signMsg } from './views-agreement.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const priceText = (p) => (Number(p) > 0 ? rm(p) : 'Harga belum ditetapkan');

async function activeEvents() {
  return must(sb.from('events').select('*').order('created_at', { ascending: false }));
}

// =============================================================
// A1: Utama
// =============================================================
export async function adminHomeView() {
  loading();
  const events = await activeEvents();
  let lots = [], recent = [], pendingAg = [];
  const notifs = await must(sb.from('admin_notifications').select('*').is('read_at', null).order('created_at', { ascending: false }).limit(15));
  pendingAg = await must(sb.from('agreements').select('id,deadline,status,lot_codes,event_id,vendor:profiles(vendor_code,business_name)').eq('status', 'pending').order('deadline'));
  const reqs = await must(sb.from('lot_limit_requests').select('*, vendor:profiles(vendor_code,business_name,phone), event:events(name)').eq('status', 'pending').order('created_at'));
  if (events.length) {
    [lots, recent] = await Promise.all([
      must(sb.from('lots').select('id,code,status,price,event_id,vendor:profiles(vendor_code,business_name,phone)').order('row_no').order('col_no')),
      must(sb.from('invoices').select('id,invoice_no,total,status,vendor:profiles(business_name)').order('issued_at', { ascending: false }).limit(5))
    ]);
  }
  // Susun: event dibuka dahulu, kemudian ikut tarikh mula
  events.sort((a, b) => (b.is_active - a.is_active) || String(a.start_date || '9999').localeCompare(String(b.start_date || '9999')));
  const evName = (id) => events.find((e) => e.id === id)?.name || '';
  const toLock = lots.filter((l) => l.status === 'paid');
  const evCard = (ev) => {
    const el = lots.filter((l) => l.event_id === ev.id);
    const c = (st) => el.filter((l) => l.status === st).length;
    const total = el.length || 1;
    return `<div class="card ${ev.is_active ? 'dark ' : ''}stack" style="position:relative">
      <button class="icon-btn" data-evdel="${ev.id}" aria-label="Padam atau tutup event" style="position:absolute;top:12px;right:12px;z-index:2;width:40px;height:40px;${ev.is_active ? 'background:rgba(0,0,0,.35);border-color:rgba(255,255,255,.18);' : ''}color:var(--red)">${icon('trash', 18)}</button>
      <a href="#/a/tapak?e=${ev.id}" style="color:inherit;padding-right:44px"><div class="small muted" style="font-weight:600;letter-spacing:.06em">${ev.is_active ? 'DIBUKA KEPADA VENDOR' : 'DITUTUP'}</div>
      <div style="font-family:var(--display);font-weight:700;font-size:20px">${esc(ev.name)}</div>
      <div class="small muted">${esc(fmtRange(ev.start_date, ev.end_date))}${ev.location ? ' · ' + esc(ev.location) : ''}</div></a>
      ${el.length ? `<div class="progress"${ev.is_active ? '' : ' style="background:var(--line-2)"'}>
        <div class="p-locked" style="width:${(c('locked') / total) * 100}%${ev.is_active ? '' : ';background:var(--text)'}"></div>
        <div class="p-paid" style="width:${((c('paid') + c('held') + c('signing')) / total) * 100}%"></div>
      </div>
      <div class="grid3 small">
        <div class="stat"><b>${c('locked')}</b><span class="muted">Dikunci</span></div>
        <div class="stat"><b style="color:var(--spark)">${c('paid') + c('held') + c('signing')}</b><span class="muted">Dalam proses</span></div>
        <div class="stat"><b>${c('free')}</b><span class="muted">Kosong</span></div>
      </div>` : `<a class="small" href="#/a/tapak?e=${ev.id}" style="color:inherit;text-decoration:underline">Belum ada tapak · jana tapak sekarang</a>`}
    </div>`;
  };


  render(`<div class="page">
    <header class="topbar"><img src="assets/logo.jpg" alt="Stailo Event" style="width:52px;height:52px;border-radius:14px;box-shadow:0 0 18px var(--mine-glow)"><div style="flex:1"><div class="eyebrow">ADMIN</div><h1 style="font-size:24px">Hai, ${esc(state.profile.owner_name || state.profile.business_name || 'Admin')}</h1></div></header>
    <div class="content">
      <div class="section-title">Event${events.length ? ` (${events.length})` : ''} <button class="btn sm" id="newev">${icon('plus', 16)} Event baru</button></div>
      ${events.length ? events.map(evCard).join('') : `<div class="card stack"><b>Belum ada event</b><span class="small muted">Cipta event pertama, kemudian jana tapak.</span></div>`}

      <div class="grid2">
        <a class="card stack" href="#/a/tapak" style="color:var(--text)"><span style="width:44px;height:44px;border-radius:12px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center">${icon('grid', 22)}</span><b>Urus tapak</b><span class="small muted">Gambar pelan, nombor &amp; kunci tapak</span></a>
        <a class="card stack" href="#/a/invois/baru" style="color:var(--text)"><span style="width:44px;height:44px;border-radius:12px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center">${icon('file', 22)}</span><b>Buat invois</b><span class="small muted">Hantar terus kepada vendor</span></a>
      </div>

      ${notifs.length ? `<div class="card stack" style="gap:4px">
        <div class="row between"><b>${icon('bell', 18)} Notifikasi baru (${notifs.length})</b><button class="btn ghost sm" id="readall">Tanda dibaca</button></div>
        ${notifs.map((n) => `<a class="notif-item" href="${esc(n.url || '#/a')}" data-nid="${n.id}" style="color:var(--text)">
          <span class="code-tile ${n.kind === 'payment' ? 'amber' : ''}" style="min-width:36px;height:36px">${icon(n.kind === 'payment' ? 'receipt' : n.kind === 'signed' ? 'edit' : 'bell', 16)}</span>
          <span style="flex:1;min-width:0"><b class="small" style="font-size:14px">${esc(n.title)}</b><span class="small muted" style="display:block">${esc(n.body)}</span><span class="small muted" style="display:block;font-size:11px">${esc(fmtDateTime(n.created_at))}</span></span></a>`).join('')}
      </div>` : ''}
      <a class="card row" href="#/a/perjanjian" style="color:var(--text)"><span style="width:44px;height:44px;border-radius:12px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center">${icon('edit', 22)}</span><div style="flex:1"><b>Perjanjian vendor</b><div class="small muted">Lihat &amp; muat turun perjanjian yang telah ditandatangani</div></div>${pendingAg.length ? `<span class="badge amber">${pendingAg.length} menunggu</span>` : ''}</a>

      ${reqs.length ? `<div class="section-title">Permohonan tapak tambahan</div>
      <div class="list">${reqs.map((r) => `
        <div class="list-item" style="cursor:default;align-items:flex-start">
          <span class="code-tile amber">${r.requested}</span>
          <span class="grow"><span class="title">${esc(r.vendor?.business_name || '-')} <span class="small muted">${esc(r.vendor?.vendor_code || '')}</span></span>
            <span class="small muted">Mohon ${r.requested} tapak · ${esc(r.event?.name || '')}</span>
            ${r.reason ? `<span class="small" style="margin-top:2px">“${esc(r.reason)}”</span>` : ''}</span>
          <button class="btn sm" data-req="${r.id}">Semak</button>
        </div>`).join('')}</div>` : ''}
      <div class="section-title">Perlu tindakan</div>
      <div class="list">${toLock.map((l) => `
        <div class="list-item" style="cursor:default">
          <span class="code-tile amber">${esc(l.code)}</span>
          <span class="grow"><span class="title">${esc(l.vendor?.business_name || '-')}</span><span class="small muted">${esc(l.vendor?.vendor_code || '')} · Resit deposit dihantar${events.length > 1 ? ' · ' + esc(evName(l.event_id)) : ''}</span></span>
          <a class="btn dark sm" href="#/a/tapak?e=${l.event_id}&l=${l.id}">Semak</a>
        </div>`).join('')}${pendingAg.map((g) => `
        <a class="list-item" href="#/perjanjian/${g.id}">
          <span class="code-tile${isExpired(g) ? ' amber' : ''}" style="min-width:48px">${esc(g.lot_codes)}</span>
          <span class="grow"><span class="title">${esc(g.vendor?.business_name || '-')}</span><span class="small ${isExpired(g) ? '' : 'muted'}" style="${isExpired(g) ? 'color:var(--red)' : ''}">${isExpired(g) ? 'Tamat masa tandatangan · beri masa tambahan atau buka semula' : 'Menunggu tandatangan perjanjian · tamat ' + esc(fmtDateTime(g.deadline))}${events.length > 1 ? ' · ' + esc(evName(g.event_id)) : ''}</span></span>
          <span class="badge ${isExpired(g) ? 'red' : 'amber'}">${isExpired(g) ? 'Tamat' : 'Tandatangan'}</span>
        </a>`).join('')}${!toLock.length && !pendingAg.length ? '<div class="empty">Tiada tindakan diperlukan.</div>' : ''}</div>

      ${recent.length ? `<div class="section-title">Invois terkini <a href="#/a/invois" class="small">Lihat semua</a></div>
      <div class="list">${recent.map(invoiceRow).join('')}</div>` : ''}
    </div>${nav('#/a')}</div>`);
  document.querySelectorAll('[data-req]').forEach((b) => (b.onclick = () => requestSheet(reqs.find((r) => r.id === b.dataset.req))));
  const ra = document.getElementById('readall');
  if (ra) ra.onclick = async () => {
    try { await must(sb.from('admin_notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)); window.dispatchEvent(new Event('notif-change')); go('#/a?t=' + Date.now()); } catch (err) { fail(err); }
  };
  document.querySelectorAll('[data-nid]').forEach((a) => a.addEventListener('click', () => {
    sb.from('admin_notifications').update({ read_at: new Date().toISOString() }).eq('id', a.dataset.nid).then(() => window.dispatchEvent(new Event('notif-change')));
  }));
  document.getElementById('newev').onclick = () => eventSheet();
  document.querySelectorAll('[data-evdel]').forEach((b) => (b.onclick = () => {
    const ev = events.find((e) => e.id === b.dataset.evdel);
    const el = lots.filter((l) => l.event_id === ev.id);
    eventDangerSheet(ev, el.length, el.filter((l) => l.status !== 'free').length);
  }));
}

// Lulus / tolak permohonan tapak tambahan
function requestSheet(r) {
  const s = openSheet(`<h2>Permohonan tapak tambahan</h2>
    <div class="card stack" style="background:var(--card-2);gap:4px">
      <b>${esc(r.vendor?.business_name || '-')}</b>
      <span class="small muted">${esc(r.vendor?.vendor_code || '')}${r.vendor?.phone ? ' · ' + esc(r.vendor.phone) : ''} · ${esc(r.event?.name || '')}</span>
      <span class="small">Mohon <b>${r.requested} tapak</b></span>
      ${r.reason ? `<span class="small">“${esc(r.reason)}”</span>` : ''}
    </div>
    <form id="rf" class="stack">
      <label class="field">Benarkan sehingga (jumlah tapak)<input class="input" type="number" name="n" min="1" max="100" value="${r.requested}" required></label>
      <button class="btn block" type="submit">${icon('check', 18)} Luluskan</button>
      <button class="btn danger block" type="button" id="rej">Tolak permohonan</button>
    </form>
    ${r.vendor?.phone ? `<a class="btn ghost block" href="${esc(waLink(r.vendor.phone, ''))}" target="_blank" rel="noopener">${icon('wa', 18)} WhatsApp vendor</a>` : ''}`);
  const f = s.querySelector('#rf');
  const done = (msg) => { closeSheet(); toast(msg); go('#/a?t=' + Date.now()); };
  f.onsubmit = async (e) => {
    e.preventDefault();
    await busy(f.querySelector('button[type=submit]'), async () => {
      try { await must(sb.rpc('admin_decide_limit', { p_request: r.id, p_approve: true, p_limit: +f.n.value })); done(`Diluluskan: ${r.vendor?.business_name} boleh tempah sehingga ${f.n.value} tapak`); }
      catch (err) { fail(err); }
    });
  };
  s.querySelector('#rej').onclick = async () => {
    try { await must(sb.rpc('admin_decide_limit', { p_request: r.id, p_approve: false, p_limit: null })); done('Permohonan ditolak'); }
    catch (err) { fail(err); }
  };
}

// Arkib, tutup, padam event atau padam semua tapak
function eventDangerSheet(ev, lotCount, takenCount) {
  const archived = !!ev.archived_at;
  const s = openSheet(`<h2>${esc(ev.name)}</h2>
    <p class="small muted" style="margin:0">${lotCount} tapak${takenCount ? ` · <b style="color:var(--amber-ink)">${takenCount} sudah ditempah/dikunci vendor</b>` : ''}</p>
    <div class="card stack" style="background:var(--card-2);gap:10px">
      <b>${icon('file', 18)} Simpan ke laptop & kosongkan</b>
      <span class="small muted">1. Muat turun arkib (ZIP: Excel, perjanjian, invois PDF, resit).<br>2. Buka & semak fail dalam laptop.<br>3. Bila semua lengkap, padam semua data event.</span>
      ${archived ? `<span class="badge green" style="align-self:flex-start">Arkib dimuat turun ${esc(fmtDateTime(ev.archived_at))}</span>` : ''}
      <button class="btn block" data-x="archive">${icon('upload', 18).replace('M12 16V4M7 9l5-5 5 5', 'M12 4v12M7 11l5 5 5-5')} ${archived ? 'Muat turun arkib semula' : 'Muat turun arkib (ZIP)'}</button>
      <div class="small muted" data-prog style="display:none"></div>
      <button class="btn danger block" data-x="purge"${archived ? '' : ' disabled'}>${icon('trash', 18)} Padam SEMUA data event</button>
      ${archived ? '' : '<span class="small muted">Butang padam aktif selepas arkib dimuat turun.</span>'}
    </div>
    <button class="btn ghost block" data-x="toggle">${ev.is_active ? 'Tutup event (sorok daripada vendor)' : 'Buka semula event kepada vendor'}</button>
    <button class="btn ghost block" data-x="lots"${lotCount ? '' : ' disabled'}>${icon('trash', 18)} Padam semua tapak sahaja</button>
    <button class="btn ghost block" data-x="event" style="color:var(--red)">${icon('trash', 18)} Padam event (simpan perjanjian & invois)</button>
    <p class="small muted" style="margin:0">Event dibatalkan? Pilih <b>Padam event (simpan perjanjian & invois)</b>. Tapak dan tempahan dipadam, perjanjian bertandatangan dan invois kekal dalam apps.</p>`);
  const prog = s.querySelector('[data-prog]');
  s.querySelectorAll('[data-x]').forEach((b) => (b.onclick = async () => {
    const x = b.dataset.x;
    try {
      if (x === 'archive') {
        await busy(b, async () => {
          prog.style.display = '';
          const { buildEventArchive } = await import('./archive.js');
          const { downloadBlob } = await import('./invoice-pdf.js');
          const out = await buildEventArchive(ev, (t) => { prog.textContent = t; });
          downloadBlob(out.blob, out.name);
          prog.textContent = `Siap: ${out.name}`;
          const { error } = await sb.from('events').update({ archived_at: new Date().toISOString() }).eq('id', ev.id);
          if (error) throw new Error(/archived_at/.test(error.message) ? 'Arkib dimuat turun, tetapi fail SQL 09 belum dijalankan di Supabase. Jalankan 09-arkib-event.sql dahulu untuk aktifkan butang padam.' : error.message);
          toast(out.missing ? `Arkib dimuat turun (${out.missing} resit gagal — semak BACA SAYA.txt)` : 'Arkib dimuat turun. Semak fail dalam laptop.');
          setTimeout(() => { closeSheet(); go(location.hash.split('&t=')[0] + (location.hash.includes('?') ? '&' : '?') + 't=' + Date.now()); }, 1200);
        });
        return;
      }
      if (x === 'purge') return purgeSheet(ev, lotCount);
      if (x === 'toggle') {
        await must(sb.from('events').update({ is_active: !ev.is_active }).eq('id', ev.id));
        closeSheet(); toast(ev.is_active ? 'Event ditutup' : 'Event dibuka semula'); return go('#/a?t=' + Date.now());
      }
      const warn = takenCount ? ` ${takenCount} tapak sudah ditempah atau dikunci vendor. Pemulangan wang (jika ada) perlu dibuat sendiri.` : '';
      if (x === 'lots') {
        if (!(await confirmSheet('Padam semua tapak?', `Semua ${lotCount} tapak dan tempahan untuk "${ev.name}" akan dipadam. Event dan gambar pelan kekal.` + warn, 'Padam semua tapak', true))) return;
        await must(sb.from('lots').delete().eq('event_id', ev.id));
        toast('Semua tapak dipadam'); return go('#/a/tapak?e=' + ev.id + '&t=' + Date.now());
      }
      if (x === 'event') {
        if (!(await confirmSheet('Padam event?', `"${ev.name}" bersama semua tapak, tempahan dan gambar pelan akan dipadam. Perjanjian bertandatangan dan invois kekal dalam apps. Tindakan ini tidak boleh dibatalkan.` + warn, 'Ya, padam event', true))) return;
        if (ev.layout_image_path) await sb.storage.from('layouts').remove([ev.layout_image_path]);
        await must(sb.from('events').delete().eq('id', ev.id));
        toast('Event dipadam'); return go('#/a?t=' + Date.now());
      }
    } catch (err) { prog.style.display = 'none'; fail(err); }
  }));
}

// Padam semua data event yang sudah diarkib (taip nama event untuk sahkan)
function purgeSheet(ev, lotCount) {
  const s = openSheet(`<h2 style="color:var(--red)">Padam SEMUA data event?</h2>
    <p class="small" style="margin:0">Ini akan memadam <b>kekal</b> dari apps:</p>
    <ul class="small" style="margin:0;padding-left:18px;line-height:1.7">
      <li>${lotCount} tapak, semua tempahan & jadual bayaran</li>
      <li>Semua <b>perjanjian bertandatangan</b> & invois event ini</li>
      <li>Gambar resit & gambar pelan tapak</li>
    </ul>
    <p class="small muted" style="margin:0">Arkib dimuat turun ${esc(fmtDateTime(ev.archived_at))}. Pastikan fail ZIP sudah dibuka dan disemak dalam laptop sebelum teruskan. Vendor dan akaun mereka <b>tidak</b> dipadam.</p>
    <form id="pf" class="stack">
      <label class="field">Taip nama event untuk sahkan<input class="input" name="n" autocomplete="off" placeholder="${esc(ev.name)}" required></label>
      <button class="btn danger block" type="submit" disabled>${icon('trash', 18)} Padam kekal</button>
      <button class="btn ghost block" type="button" id="pc">Batal</button>
    </form>`);
  const f = s.querySelector('#pf'), btn = f.querySelector('button[type=submit]');
  f.n.oninput = () => { btn.disabled = f.n.value.trim() !== ev.name.trim(); };
  s.querySelector('#pc').onclick = closeSheet;
  f.onsubmit = async (e) => {
    e.preventDefault();
    await busy(btn, async () => {
      try {
        const { purgeEvent } = await import('./archive.js');
        const r = await purgeEvent(ev, f.n.value.trim());
        closeSheet();
        toast(`"${ev.name}" dipadam: ${r?.lots ?? 0} tapak, ${r?.agreements ?? 0} perjanjian, ${r?.invoices ?? 0} invois, ${(r?.receipts || []).length} resit`);
        go('#/a?t=' + Date.now());
      } catch (err) { fail(err); }
    });
  };
}

function invoiceRow(i) {
  return `<a class="list-item" href="#/invois/${i.id}">
    <span class="grow"><span class="title">${esc(i.vendor?.business_name || '-')}</span><span class="small muted">${esc(i.invoice_no)}${i.issued_at ? ' · ' + esc(fmtDate(i.issued_at)) : ''}</span></span>
    <span style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><b>${rm(i.total)}</b><span class="badge ${i.status === 'paid' ? 'green' : 'red'}">${i.status === 'paid' ? 'Dibayar' : 'Belum bayar'}</span></span>
  </a>`;
}

// =============================================================
// A2: Urus tapak (event, gambar pelan, tapak, kunci)
// =============================================================
export async function adminLotsView(params, query) {
  loading();
  const events = await activeEvents();
  if (!events.length) {
    render(`<div class="page">${topbar('Urus tapak', { back: '#/a' })}<div class="content">
      <div class="card stack"><b>Cipta event dahulu</b><span class="small muted">Contoh: Bazar Hujung Tahun 2026</span><button class="btn" id="newev">${icon('plus', 18)} Event baru</button></div>
      </div>${nav('#/a/tapak')}</div>`);
    document.getElementById('newev').onclick = () => eventSheet();
    return;
  }
  const ev = events.find((e) => e.id === query.get('e')) || events.find((e) => e.is_active) || events[0];
  const lots = await must(sb.from('lots').select('*, vendor:profiles(id,vendor_code,business_name,owner_name,phone)').eq('event_id', ev.id).order('row_no').order('col_no'));
  const reload = (lotId) => go(`#/a/tapak?e=${ev.id}${lotId ? '&l=' + lotId : ''}&t=${Date.now()}`);

  render(`<div class="page">
    ${topbar('Urus tapak', { back: '#/a', sub: `${lots.length} tapak`, right: `<button class="icon-btn" id="addlot" aria-label="Tambah tapak" style="background:var(--cta);color:var(--cta-ink);border:0">${icon('plus')}</button>` })}
    <div class="content">
      <div class="row">
        <select class="input" id="evsel" aria-label="Pilih event" style="flex:1">${events.map((e) => `<option value="${e.id}"${e.id === ev.id ? ' selected' : ''}>${esc(e.name)}${e.is_active ? '' : ' (ditutup)'}</option>`).join('')}</select>
        <button class="icon-btn" id="editev" aria-label="Edit event">${icon('edit')}</button>
        <button class="icon-btn" id="delev2" aria-label="Padam event atau tapak" style="color:var(--red)">${icon('trash')}</button>
      </div>
      <button class="btn ghost block" id="newev">${icon('plus', 18)} Tambah event baru</button>
      <div class="small muted">${esc(fmtRange(ev.start_date, ev.end_date))}${ev.location ? ' · ' + esc(ev.location) : ''} · ${ev.is_active ? '<span class="badge green">Dibuka kepada vendor</span>' : '<span class="badge gray">Ditutup</span>'}</div>

      <div class="section-title">Gambar pelan tapak</div>
      ${ev.layout_image_path
        ? `<div class="layout-img"><img id="layout" src="${esc(publicUrl('layouts', ev.layout_image_path))}" alt="Pelan tapak"></div>`
        : `<div class="layout-empty">${icon('image', 26)}Belum ada gambar. Muat naik pelan / susun atur tapak.</div>`}
      <div class="grid2">
        <label class="btn dark" style="cursor:pointer">${icon('upload', 18)} ${ev.layout_image_path ? 'Tukar gambar' : 'Muat naik'}<input type="file" id="layoutfile" accept="image/*" class="hidden"></label>
        <button class="btn danger" id="rmlayout"${ev.layout_image_path ? '' : ' disabled'}>${icon('trash', 18)} Buang</button>
      </div>

      <div class="section-title">Tapak ${lots.length ? `<span class="row" style="gap:8px"><button class="btn ghost sm" id="setprice">Tetapkan harga</button><button class="btn ghost sm" id="gen">Jana tapak</button></span>` : ''}</div>
      ${lots.some((l) => !(Number(l.price) > 0)) ? `<div class="small" style="color:var(--amber-ink)">${lots.filter((l) => !(Number(l.price) > 0)).length} tapak belum ada harga. Vendor tak boleh pilih tapak tersebut sehingga harga ditetapkan.</div>` : ''}
      ${lots.length ? `
        <div class="legend">
          <span><i class="sw-free"></i>Kosong</span>
          <span><i class="sw-held"></i>Sedang bayar</span>
          <span><i class="sw-paid"></i>Dibayar, perlu sahkan</span>
          <span><i class="sw-signing"></i>Menunggu tandatangan</span>
          <span><i class="sw-locked"></i>Dikunci</span>
        </div>
        ${lotMap(lots, { mode: 'admin', selectedId: query.get('l') })}
        <div class="small muted">Klik tapak untuk edit, semak resit atau kunci.</div>
        ${vendorListHtml(lots)}`
        : `<div class="card stack"><b>Belum ada tapak</b><span class="small muted">Jana tapak bernombor 01, 02, 03 … secara automatik, atau tambah satu-satu.</span><button class="btn" id="gen">Jana tapak</button></div>`}
    </div>${nav('#/a/tapak')}</div>`);

  document.getElementById('evsel').onchange = (e) => go('#/a/tapak?e=' + e.target.value);
  document.getElementById('newev').onclick = () => eventSheet();
  document.getElementById('editev').onclick = () => eventSheet(ev);
  document.getElementById('delev2').onclick = () => eventDangerSheet(ev, lots.length, lots.filter((l) => l.status !== 'free').length);
  document.getElementById('addlot').onclick = () => lotEditSheet(ev, null, lots, reload);
  document.querySelectorAll('#gen').forEach((b) => (b.onclick = () => generateSheet(ev, lots, reload)));
  const sp = document.getElementById('setprice');
  if (sp) sp.onclick = () => priceSheet(ev, lots, reload);
  const img = document.getElementById('layout');
  if (img) img.onclick = () => lightbox(img.src);

  document.getElementById('layoutfile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    toast('Memuat naik gambar…');
    try {
      const path = `${ev.id}/${Date.now()}.${fileExt(file)}`;
      await must(sb.storage.from('layouts').upload(path, file, { contentType: file.type }));
      await must(sb.from('events').update({ layout_image_path: path }).eq('id', ev.id));
      if (ev.layout_image_path) await sb.storage.from('layouts').remove([ev.layout_image_path]);
      toast('Gambar pelan dikemas kini');
      reload();
    } catch (err) { fail(err); }
  };
  document.getElementById('rmlayout').onclick = async () => {
    if (!(await confirmSheet('Buang gambar pelan?', 'Vendor tidak akan nampak gambar pelan sehingga anda muat naik yang baru.', 'Buang', true))) return;
    try {
      await must(sb.storage.from('layouts').remove([ev.layout_image_path]));
      await must(sb.from('events').update({ layout_image_path: null }).eq('id', ev.id));
      toast('Gambar dibuang'); reload();
    } catch (err) { fail(err); }
  };

  document.querySelectorAll('.lot[data-lot]').forEach((b) => {
    b.onclick = () => lotSheet(ev, lots.find((l) => l.id === b.dataset.lot), lots, reload);
  });
  document.querySelectorAll('[data-vl]').forEach((b) => {
    b.onclick = () => lotSheet(ev, lots.find((l) => l.id === b.dataset.vl), lots, reload);
  });
  const pre = query.get('l') && lots.find((l) => l.id === query.get('l'));
  if (pre) lotSheet(ev, pre, lots, reload);
}

function eventSheet(ev) {
  const s = openSheet(`<h2>${ev ? 'Edit event' : 'Event baru'}</h2>
    <form id="evf" class="stack">
      <label class="field">Nama event<input class="input" name="name" required value="${esc(ev?.name)}" placeholder="Bazar Hujung Tahun 2026"></label>
      <div class="grid2">
        <label class="field">Tarikh mula<input class="input" type="date" name="start_date" value="${esc(ev?.start_date)}"></label>
        <label class="field">Tarikh tamat<input class="input" type="date" name="end_date" value="${esc(ev?.end_date)}"></label>
      </div>
      <label class="field">Lokasi<input class="input" name="location" value="${esc(ev?.location)}"></label>
      <div class="grid2">
        <label class="field">Tempoh program<input class="input" name="duration" value="${esc(ev?.duration)}" placeholder="Cth: 10 hari"></label>
        <label class="field">Waktu operasi<input class="input" name="op_hours" value="${esc(ev?.op_hours)}" placeholder="5.00 ptg – 12.00 mlm"></label>
      </div>
      <div class="small muted">Butiran ini dimasukkan automatik ke dalam perjanjian vendor bagi event ini.</div>
      <label class="row" style="font-weight:600;font-size:14px"><input type="checkbox" name="is_active" ${!ev || ev.is_active ? 'checked' : ''}> Buka kepada vendor (boleh pilih tapak)</label>
      <button class="btn block" type="submit">Simpan</button>
      ${ev ? '<button class="btn danger block" type="button" id="delev">Padam event</button>' : ''}
    </form>`);
  const f = s.querySelector('#evf');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const row = { name: d.name.trim(), start_date: d.start_date || null, end_date: d.end_date || null, location: d.location.trim(), duration: d.duration.trim(), op_hours: d.op_hours.trim(), is_active: !!d.is_active };
    await busy(f.querySelector('button[type=submit]'), async () => {
      try {
        const saved = ev
          ? await must(sb.from('events').update(row).eq('id', ev.id).select().single())
          : await must(sb.from('events').insert(row).select().single());
        closeSheet(); toast('Event disimpan'); go(`#/a/tapak?e=${saved.id}&t=${Date.now()}`);
      } catch (err) { fail(err); }
    });
  };
  const del = s.querySelector('#delev');
  if (del) del.onclick = async () => {
    if (!(await confirmSheet('Padam event?', `Semua tapak & tempahan untuk "${ev.name}" akan dipadam. Invois kekal.`, 'Padam', true))) return;
    try {
      if (ev.layout_image_path) await sb.storage.from('layouts').remove([ev.layout_image_path]);
      await must(sb.from('events').delete().eq('id', ev.id));
      toast('Event dipadam'); go('#/a/tapak?t=' + Date.now());
    } catch (err) { fail(err); }
  };
}

function generateSheet(ev, lots, reload) {
  const nums = lots.map((l) => parseInt(l.code, 10)).filter((n) => !isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  const s = openSheet(`<h2>Jana tapak</h2>
    <p class="small muted" style="margin:0">Tapak dinomborkan 01, 02, 03 … turun ke bawah ikut lajur. Contoh 6 baris: lajur 1 = 01–06, lajur 2 = 07–12. Nama setiap tapak boleh diedit kemudian (klik tapak → Edit).</p>
    <form id="gf" class="stack">
      <div class="grid2">
        <label class="field">Jumlah tapak<input class="input" type="number" name="total" min="1" max="500" value="40" required></label>
        <label class="field">Bilangan baris<input class="input" type="number" name="rows" min="1" max="60" value="6" required></label>
      </div>
      <label class="field">Mula dari nombor<input class="input" type="number" name="start" min="1" max="999" value="${next}" required></label>
      <div class="grid2">
        <label class="field">Saiz tapak<input class="input" name="size" value="3m x 3m" required></label>
        <label class="field">Harga (RM)<input class="input" type="number" name="price" min="0" step="0.01" placeholder="Tetapkan kemudian"></label>
      </div>
      <div class="small muted" id="preview"></div>
      <button class="btn block" type="submit">Jana</button>
    </form>`);
  const f = s.querySelector('#gf');
  const pv = s.querySelector('#preview');
  const pad = (n) => String(n).padStart(2, '0');
  const upd = () => {
    const t = +f.total.value || 0, r = +f.rows.value || 0, st = +f.start.value || 1;
    pv.textContent = t && r ? `${t} tapak: ${pad(st)} hingga ${pad(st + t - 1)} · ${Math.ceil(t / r)} lajur × ${r} baris` : '';
  };
  f.oninput = upd; upd();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const total = +f.total.value, rows = +f.rows.value, start = +f.start.value || 1;
    const existing = new Set(lots.map((l) => l.code));
    const out = [];
    for (let n = start; n < start + total; n++) {
      const code = pad(n);
      if (existing.has(code)) continue;
      out.push({ event_id: ev.id, code, row_no: ((n - 1) % rows) + 1, col_no: Math.floor((n - 1) / rows) + 1, size: f.size.value.trim(), price: +f.price.value || 0 });
    }
    if (!out.length) return toast('Semua nombor tapak itu sudah wujud', 'error');
    await busy(f.querySelector('button'), async () => {
      try { await must(sb.from('lots').insert(out)); closeSheet(); toast(`${out.length} tapak dijana`); reload(); }
      catch (err) { fail(err); }
    });
  };
}

// Senarai vendor ikut nombor tapak (admin sahaja)
const codeSort = (a, b) => {
  const na = parseInt(a.code, 10), nb = parseInt(b.code, 10);
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return String(a.code).localeCompare(String(b.code), 'ms', { numeric: true });
};
function vendorListHtml(lots) {
  const rows = lots.filter((l) => l.vendor && l.status !== 'free').sort(codeSort);
  const locked = rows.filter((l) => l.status === 'locked').length;
  return `<div class="section-title" style="margin-top:8px">Senarai vendor <span class="small muted" style="font-family:var(--body);font-weight:600">${locked} disahkan · ${rows.length - locked} menunggu</span></div>
    <div class="list">${rows.length ? rows.map((l) => `
      <button class="list-item" data-vl="${l.id}">
        <span class="code-tile${l.status === 'locked' ? '' : ' amber'}" style="min-width:48px">${esc(l.code)}</span>
        <span class="grow"><span class="title">${esc(l.vendor.business_name || '-')}</span><span class="small muted">${esc(l.vendor.vendor_code || '')}${l.vendor.owner_name ? ' · ' + esc(l.vendor.owner_name) : ''}${l.vendor.phone ? ' · ' + esc(l.vendor.phone) : ''}</span></span>
        ${badge(STATUS_LOT, l.status)}
      </button>`).join('') : '<div class="empty">Belum ada vendor yang menempah tapak.</div>'}</div>`;
}

// Tetapkan harga beberapa tapak sekaligus
function priceSheet(ev, lots, reload) {
  const s = openSheet(`<h2>Tetapkan harga</h2>
    <form id="pf" class="stack">
      <label class="field">Harga (RM)<input class="input" type="number" name="price" min="0" step="0.01" required placeholder="Cth: 150"></label>
      <fieldset style="border:0;margin:0;padding:0" class="stack">
        <legend class="small" style="font-weight:700;padding:0;margin-bottom:8px">Untuk tapak</legend>
        <label class="radio-card"><input type="radio" name="scope" value="unset" checked> <span>Yang belum ada harga sahaja</span></label>
        <label class="radio-card"><input type="radio" name="scope" value="all"> <span>Semua tapak (${lots.length})</span></label>
        <label class="radio-card"><input type="radio" name="scope" value="range"> <span>Nombor dari … hingga …</span></label>
      </fieldset>
      <div class="grid2" id="rng" style="display:none">
        <label class="field">Dari nombor<input class="input" type="number" name="from" min="1"></label>
        <label class="field">Hingga nombor<input class="input" type="number" name="to" min="1"></label>
      </div>
      <div class="small muted">Tapak yang sudah ditempah atau dikunci tidak akan berubah harga tempahannya.</div>
      <button class="btn block" type="submit">Simpan harga</button>
    </form>`);
  const f = s.querySelector('#pf');
  f.querySelectorAll('input[name=scope]').forEach((r) => (r.onchange = () => { s.querySelector('#rng').style.display = f.scope.value === 'range' ? 'grid' : 'none'; }));
  f.onsubmit = async (e) => {
    e.preventDefault();
    const price = +f.price.value;
    let pick = lots;
    if (f.scope.value === 'unset') pick = lots.filter((l) => !(Number(l.price) > 0));
    if (f.scope.value === 'range') {
      const a = +f.from.value, b = +f.to.value;
      if (!a || !b) return toast('Isi nombor dari dan hingga', 'error');
      pick = lots.filter((l) => { const n = parseInt(l.code, 10); return !isNaN(n) && n >= Math.min(a, b) && n <= Math.max(a, b); });
    }
    if (!pick.length) return toast('Tiada tapak dipilih', 'error');
    await busy(f.querySelector('button[type=submit]'), async () => {
      try {
        await must(sb.from('lots').update({ price }).in('id', pick.map((l) => l.id)));
        closeSheet(); toast(`Harga ${rm(price)} ditetapkan untuk ${pick.length} tapak`); reload();
      } catch (err) { fail(err); }
    });
  };
}

function lotEditSheet(ev, lot, lots, reload) {
  const maxRow = lots.reduce((m, l) => Math.max(m, l.row_no), 0);
  const s = openSheet(`<h2>${lot ? 'Edit tapak ' + esc(lot.code) : 'Tambah tapak'}</h2>
    <form id="lf" class="stack">
      <label class="field">Nama / nombor tapak<input class="input" name="code" required maxlength="20" value="${esc(lot?.code)}" placeholder="Cth: 01, VVIP, PA"></label>
      <div class="grid2">
        <label class="field">Baris (kedudukan atas–bawah)<input class="input" type="number" name="row_no" min="1" required value="${lot?.row_no ?? maxRow + 1}"></label>
        <label class="field">Lajur (kiri–kanan)<input class="input" type="number" name="col_no" min="1" required value="${lot?.col_no ?? 1}"></label>
      </div>
      <div class="grid2">
        <label class="field">Saiz<input class="input" name="size" required value="${esc(lot?.size ?? '3m x 3m')}"></label>
        <label class="field">Harga (RM)<input class="input" type="number" name="price" min="0" step="0.01" placeholder="Belum ditetapkan" value="${Number(lot?.price) > 0 ? lot.price : ''}"></label>
      </div>
      <button class="btn block" type="submit">Simpan</button>
    </form>`);
  const f = s.querySelector('#lf');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const row = { code: f.code.value.trim(), row_no: +f.row_no.value, col_no: +f.col_no.value, size: f.size.value.trim(), price: +f.price.value || 0 };
    await busy(f.querySelector('button'), async () => {
      try {
        if (lot) await must(sb.from('lots').update(row).eq('id', lot.id));
        else await must(sb.from('lots').insert({ ...row, event_id: ev.id }));
        closeSheet(); toast('Tapak disimpan'); reload(lot?.id);
      } catch (err) { fail(err.code === '23505' ? new Error('Nama tapak sudah wujud dalam event ini') : err); }
    });
  };
}

async function lotSheet(ev, lot, lots, reload) {
  const v = lot.vendor;
  let receiptHtml = '', ag = null;
  if (lot.status === 'signing' || lot.status === 'locked') {
    const ags = await must(sb.from('agreements').select('id,status,deadline,lot_codes,event_info').contains('lot_ids', [lot.id]).in('status', ['pending', 'signed']).order('created_at', { ascending: false }).limit(1));
    ag = ags[0] || null;
  }
  if (ag?.status === 'pending') {
    const left = new Date(ag.deadline).getTime() - Date.now();
    receiptHtml += left > 0
      ? `<div class="card small" style="background:var(--green-soft)">Bayaran disahkan. Vendor perlu <b>tandatangan perjanjian</b> dalam masa <b>${leftText(left)}</b> (sebelum ${esc(fmtDateTime(ag.deadline))}). Lot akan dikunci atas nama vendor selepas ditandatangani.</div>`
      : `<div class="card small" style="background:var(--red-soft)"><b>Masa tandatangan telah tamat.</b> Beri masa tambahan, atau buka semula tapak untuk vendor lain.</div>`;
  }
  if (lot.status !== 'free') {
    const bk = await must(sb.from('bookings').select('*').eq('lot_id', lot.id).in('status', ['pending_payment', 'pending_verification', 'approved']).order('created_at', { ascending: false }).limit(1));
    const b = bk[0];
    if (b?.group_id) {
      const grp = await must(sb.from('bookings').select('lots(code)').eq('group_id', b.group_id).in('status', ['pending_payment', 'pending_verification', 'approved']));
      const others = grp.map((g) => g.lots?.code).filter(Boolean);
      if (others.length > 1) receiptHtml += `<div class="small" style="color:var(--amber-ink)">Satu tempahan bersama tapak: <b>${esc(others.join(', '))}</b>. Semua tapak ini akan dikunci serentak.</div>`;
    }
    if (b?.group_id) {
      const sch = await must(sb.from('payment_schedules').select('*').eq('group_id', b.group_id).neq('status', 'cancelled').order('seq'));
      receiptHtml += scheduleHtml(sch, { admin: lot.status === 'locked' || lot.status === 'signing' });
    }
    if (b?.receipt_path) {
      const signed = await must(sb.storage.from('receipts').createSignedUrl(b.receipt_path, 600));
      const isPdf = /\.pdf$/i.test(b.receipt_path);
      receiptHtml += isPdf
        ? `<a class="btn ghost block" href="${esc(signed.signedUrl)}" target="_blank" rel="noopener">${icon('receipt', 18)} Buka resit (PDF)</a>`
        : `<div class="stack"><b class="small">Resit bayaran</b><img src="${esc(signed.signedUrl)}" alt="Resit bayaran" id="rcpt" style="border-radius:12px;max-height:260px;object-fit:contain;background:var(--card-2);cursor:zoom-in"></div>`;
    } else if (lot.status === 'held') {
      receiptHtml += `<div class="small muted">Vendor sedang membuat bayaran. Tahan sehingga ${esc(fmtDateTime(lot.held_until))}.</div>`;
    }
  }
  const vLabel = { locked: '✓ Vendor disahkan', paid: 'Vendor · menunggu pengesahan anda', held: 'Vendor · sedang membuat bayaran', signing: 'Vendor · menunggu tandatangan perjanjian' }[lot.status] || 'Vendor';
  const vendorHtml = v ? `<div class="card stack" style="background:var(--card-2);gap:6px">
      <span class="small" style="font-weight:700;color:${lot.status === 'locked' ? 'var(--green)' : 'var(--amber-ink)'}">${vLabel}</span>
      <b style="font-size:17px">${esc(v.business_name)}</b>
      <span class="small muted">ID ${esc(v.vendor_code || '-')}${v.owner_name ? ' · ' + esc(v.owner_name) : ''}${v.phone ? ' · ' + esc(v.phone) : ''}</span>
      ${v.phone ? `<a class="btn ghost sm" style="align-self:flex-start" href="${esc(waLink(v.phone, ''))}" target="_blank" rel="noopener">${icon('wa', 16)} WhatsApp vendor</a>` : ''}
    </div>` : '';

  const actions = {
    free: `<button class="btn block" data-a="assign">${icon('lock', 18)} Kunci tapak</button>
           <div class="grid2"><button class="btn danger" data-a="delete">${icon('trash', 18)} Buang tapak</button><button class="btn dark" data-a="edit">${icon('edit', 18)} Edit</button></div>`,
    held: `<button class="btn danger block" data-a="release">Kosongkan tapak</button>`,
    paid: `<button class="btn block" data-a="lock">${icon('check', 18)} Sahkan bayaran &amp; hantar perjanjian</button>
           <button class="btn danger block" data-a="release">Tolak &amp; kosongkan tapak</button>`,
    signing: `<a class="btn block" href="#/perjanjian/${ag?.id || ''}">${icon('file', 18)} Lihat perjanjian</a>
           <div class="grid2"><button class="btn dark" data-a="extend">${icon('clock', 18)} Beri masa lagi</button>${v?.phone && ag ? `<a class="btn ghost" target="_blank" rel="noopener" href="${esc(waLink(v.phone, signMsg({ ...ag }, v, location.origin + location.pathname + '#/perjanjian/' + ag.id)))}">${icon('wa', 18)} Ingatkan</a>` : '<span></span>'}</div>
           <button class="btn danger block" data-a="release">${icon('unlock', 18)} Buka semula tapak (tidak tandatangan / batal)</button>`,
    locked: v
      ? `${ag ? `<a class="btn block" href="#/perjanjian/${ag.id}">${icon('file', 18)} Lihat perjanjian bertandatangan</a>` : `<div class="card small" style="background:var(--amber-soft)">Tapak ini dikunci sebelum ada perjanjian. Hantar perjanjian supaya vendor boleh tandatangan.</div><button class="btn block" data-a="sendag">${icon('edit', 18)} Hantar perjanjian kepada vendor</button>`}
             <button class="btn ghost block" data-a="invoice">${icon('file', 18)} Lihat / hantar invois</button>
             <button class="btn danger block" data-a="release">${icon('unlock', 18)} Buka semula tapak (vendor batal)</button>`
      : `<div class="card small muted" style="background:var(--card-2)">Dikunci oleh admin, tiada vendor. Vendor tak boleh pilih tapak ini.</div>
             <button class="btn ghost block" data-a="unlock">${icon('unlock', 18)} Buka kunci (jadikan kosong)</button>`
  };
  const s = openSheet(`
    <div class="row between"><div><h2>Tapak ${esc(lot.code)}</h2><div class="small muted">${esc(lot.size)} · ${priceText(lot.price)}</div></div>${badge(STATUS_LOT, lot.status)}</div>
    ${vendorHtml}${receiptHtml}${actions[lot.status]}
    ${lot.status !== 'free' ? `<button class="btn ghost sm" data-a="edit">${icon('edit', 16)} Edit saiz / harga / kedudukan</button>` : ''}`);
  const r = s.querySelector('#rcpt');
  if (r) r.onclick = () => lightbox(r.src);
  s.querySelectorAll('[data-inst]').forEach((btn) => (btn.onclick = () => busy(btn, async () => {
    try {
      await must(sb.rpc('admin_mark_installment', { p_id: btn.dataset.inst, p_paid: btn.dataset.paid === '1' }));
      toast(btn.dataset.paid === '1' ? 'Bayaran ditanda diterima' : 'Tanda dibatalkan');
      lotSheet(ev, lot, lots, reload);
    } catch (err) { fail(err); }
  })));

  s.querySelectorAll('[data-a]').forEach((btn) => {
    btn.onclick = async () => {
      const a = btn.dataset.a;
      try {
        if (a === 'edit') return lotEditSheet(ev, lot, lots, reload);
        if (a === 'assign') return assignLockSheet(ev, lot, reload);
        if (a === 'delete') {
          if (!(await confirmSheet(`Buang tapak ${lot.code}?`, 'Tapak ini akan dipadam.', 'Buang', true))) return;
          await must(sb.from('lots').delete().eq('id', lot.id)); toast('Tapak dibuang'); return reload();
        }
        if (a === 'lock') {
          await busy(btn, async () => {
            const agId = await must(sb.rpc('admin_lock_lot', { p_lot_id: lot.id }));
            closeSheet();
            if (agId) return approvedSheet(agId, v, ev);
            reload();
          });
          return;
        }
        if (a === 'sendag') {
          await busy(btn, async () => { const agId = await must(sb.rpc('admin_send_agreement', { p_lot_id: lot.id })); closeSheet(); approvedSheet(agId, v, ev); });
          return;
        }
        if (a === 'extend') { await must(sb.rpc('admin_extend_agreement', { p_id: ag.id })); closeSheet(); toast('Masa tandatangan dilanjutkan'); return reload(lot.id); }
        if (a === 'unlock') { await must(sb.rpc('admin_unlock_lot', { p_lot_id: lot.id })); closeSheet(); toast('Kunci dibuka'); return reload(lot.id); }
        if (a === 'release') {
          if (!(await confirmSheet(`Buka semula tapak ${lot.code}?`, `Tempahan ${v ? v.business_name : 'vendor'} akan dibatalkan dan tapak ${lot.code}${lot.status === 'signing' ? ' (serta tapak lain dalam perjanjian yang sama)' : ''} jadi KOSONG semula, boleh dipilih vendor lain. Invois lama kekal untuk rekod. Pemulangan wang (jika ada) perlu dibuat sendiri.`, 'Ya, buka semula', true))) return;
          await must(sb.rpc('admin_release_lot', { p_lot_id: lot.id })); toast(`Tapak ${lot.code} dibuka semula`); return reload();
        }
        if (a === 'invoice') {
          const inv = await must(sb.from('invoices').select('id').eq('vendor_id', lot.vendor_id).eq('event_id', ev.id).order('issued_at', { ascending: false }).limit(1));
          closeSheet();
          go(inv[0] ? '#/invois/' + inv[0].id : `#/a/invois/baru?v=${lot.vendor_id}&e=${ev.id}&lot=${encodeURIComponent(lot.code)}&amt=${lot.price}`);
        }
      } catch (err) { fail(err); }
    };
  });
}

// Selepas admin luluskan: maklumkan vendor untuk tandatangan
async function approvedSheet(agId, v, ev) {
  const ag = await must(sb.from('agreements').select('id,deadline,lot_codes,event_info').eq('id', agId).single());
  const link = location.origin + location.pathname + '#/perjanjian/' + ag.id;
  const s = openSheet(`<div class="row" style="gap:12px"><span class="code-tile" style="min-width:44px;background:var(--green-soft);color:var(--green)">${icon('check', 20)}</span><h2>Tempahan diluluskan</h2></div>
    <p style="margin:0">Perjanjian telah dihantar kepada <b>${esc(v?.business_name || 'vendor')}</b>. Vendor perlu tandatangan sebelum <b>${esc(fmtDateTime(ag.deadline))}</b>. Lot ${esc(ag.lot_codes)} akan dikunci atas nama vendor selepas ditandatangani.</p>
    ${v?.phone ? `<a class="btn block" target="_blank" rel="noopener" href="${esc(waLink(v.phone, signMsg(ag, v, link)))}">${icon('wa', 18)} Maklumkan vendor melalui WhatsApp</a>` : ''}
    <button class="btn ghost block" data-close>Tutup</button>`);
  s.querySelector('[data-close]').onclick = () => { closeSheet(); go(`#/a/tapak?e=${ev.id}&t=${Date.now()}`); };
}

// Admin kunci tapak kosong: untuk vendor, atau simpan tanpa vendor
async function assignLockSheet(ev, lot, reload) {
  const vendors = await must(sb.from('profiles').select('id,vendor_code,business_name').eq('role', 'vendor').eq('is_active', true).order('vendor_code'));
  const s = openSheet(`<h2>Kunci tapak ${esc(lot.code)}</h2>
    <div class="small muted">${esc(lot.size)} · ${priceText(lot.price)}</div>
    <form id="af" class="stack">
      <label class="field">Untuk vendor
        <select class="input" name="vendor">
          <option value="">— Tiada vendor (simpan / tidak dijual) —</option>
          ${vendors.map((v) => `<option value="${v.id}">${esc(v.vendor_code || '')} · ${esc(v.business_name)}</option>`).join('')}
        </select></label>
      <fieldset id="invbox" style="border:0;margin:0;padding:0;display:none" class="stack">
        <legend class="small" style="font-weight:700;padding:0;margin-bottom:8px">Invois</legend>
        <label class="radio-card"><input type="radio" name="inv" value="paid" checked> <span>Dah bayar (tunai / terus) — invois "Dibayar"</span></label>
        <label class="radio-card"><input type="radio" name="inv" value="unpaid"> <span>Belum bayar — invois "Belum bayar" untuk dihantar</span></label>
        <label class="radio-card"><input type="radio" name="inv" value="none"> <span>Tiada invois</span></label>
      </fieldset>
      <button class="btn block" type="submit">${icon('lock', 18)} Kunci tapak</button>
    </form>`);
  const f = s.querySelector('#af');
  const box = s.querySelector('#invbox');
  f.vendor.onchange = () => { box.style.display = f.vendor.value ? 'flex' : 'none'; };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const vendor = f.vendor.value || null;
    const inv = vendor ? f.inv.value : 'none';
    await busy(f.querySelector('button[type=submit]'), async () => {
      try {
        const invId = await must(sb.rpc('admin_assign_lock', { p_lot_id: lot.id, p_vendor: vendor, p_invoice: inv }));
        closeSheet();
        toast(`Tapak ${lot.code} dikunci${invId ? '. Invois dicipta.' : '.'}`);
        if (invId) go('#/invois/' + invId); else reload(lot.id);
      } catch (err) { fail(err); }
    });
  };
}

// =============================================================
// A3: Senarai invois
// =============================================================
export async function adminInvoicesView(params, query) {
  loading();
  const filter = query.get('f') || 'all';
  let q = sb.from('invoices').select('id,invoice_no,total,status,issued_at,vendor:profiles(business_name)').order('issued_at', { ascending: false }).limit(200);
  if (filter !== 'all') q = q.eq('status', filter);
  const [list, totals] = await Promise.all([q, sb.from('invoices').select('total,status')].map(must));
  const sum = (s) => totals.filter((t) => t.status === s).reduce((a, t) => a + Number(t.total), 0);
  render(`<div class="page">
    ${topbar('Invois', { right: `<a class="btn sm" href="#/a/invois/baru">${icon('plus', 16)} Invois baru</a>` })}
    <div class="content">
      <div class="grid2">
        <div class="card stat"><span class="small muted" style="font-weight:600">Sudah dibayar</span><b>${rm(sum('paid'))}</b></div>
        <div class="card stat"><span class="small muted" style="font-weight:600">Belum dibayar</span><b style="color:var(--red)">${rm(sum('unpaid'))}</b></div>
      </div>
      <div class="tabs">
        ${[['all', 'Semua'], ['unpaid', 'Belum bayar'], ['paid', 'Dibayar']].map(([k, t]) => `<a href="#/a/invois?f=${k}" class="${filter === k ? 'on' : ''}">${t}</a>`).join('')}
      </div>
      <div class="list">${list.length ? list.map(invoiceRow).join('') : '<div class="empty">Tiada invois.</div>'}</div>
    </div>${nav('#/a/invois')}</div>`);
}

// =============================================================
// A4: Invois baru / edit
// =============================================================
export async function invoiceFormView({ id }, query) {
  loading();
  const [vendors, events, inv] = await Promise.all([
    must(sb.from('profiles').select('id,vendor_code,business_name,owner_name,phone').eq('role', 'vendor').order('vendor_code')),
    activeEvents(),
    id ? must(sb.from('invoices').select('*').eq('id', id).single()) : Promise.resolve(null)
  ]);
  let items = inv?.items?.length ? inv.items.map((x) => ({ ...x }))
    : query.get('lot') ? [{ desc: `Sewa tapak ${query.get('lot')}`, amount: +query.get('amt') || 0 }]
    : [{ desc: '', amount: 0 }];
  const vSel = inv?.vendor_id || query.get('v') || '';
  const eSel = inv?.event_id || query.get('e') || '';

  render(`<div class="page" style="padding-bottom:20px">
    ${topbar(inv ? 'Edit ' + inv.invoice_no : 'Invois baru', { back: inv ? '#/invois/' + inv.id : '#/a/invois' })}
    <form class="content" id="f">
      <div class="card stack">
        <label class="field">Kepada vendor
          <select class="input" name="vendor_id" required><option value="">— Pilih vendor —</option>
          ${vendors.map((v) => `<option value="${v.id}"${v.id === vSel ? ' selected' : ''}>${esc(v.vendor_code || '')} · ${esc(v.business_name || v.owner_name)}</option>`).join('')}</select></label>
        <label class="field">Event (pilihan)
          <select class="input" name="event_id"><option value="">— Tiada —</option>
          ${events.map((e) => `<option value="${e.id}"${e.id === eSel ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>
      </div>
      <div class="card stack">
        <b>Perkara</b>
        <div id="items" class="stack"></div>
        <button type="button" class="btn ghost sm" id="additem">${icon('plus', 16)} Tambah perkara</button>
        <div class="row between" style="border-top:1px solid var(--line-2);padding-top:12px"><b>Jumlah</b><b id="total" style="font-family:var(--display);font-size:22px"></b></div>
      </div>
      <div class="card stack">
        <label class="field">Nota (pilihan)<textarea class="input" name="notes" rows="2" placeholder="Cth: Sila bayar sebelum 1 Dis">${esc(inv?.notes)}</textarea></label>
        <label class="field">Status
          <select class="input" name="status"><option value="unpaid"${inv?.status !== 'paid' ? ' selected' : ''}>Belum bayar</option><option value="paid"${inv?.status === 'paid' ? ' selected' : ''}>Dibayar</option></select></label>
      </div>
      <button class="btn block" type="submit">Simpan invois</button>
    </form></div>`);

  const box = document.getElementById('items');
  const totalEl = document.getElementById('total');
  const calc = () => { totalEl.textContent = rm(items.reduce((a, x) => a + (Number(x.amount) || 0), 0)); };
  const drawItems = () => {
    box.innerHTML = items.map((x, i) => `<div class="item-row">
      <input class="input" data-i="${i}" data-k="desc" value="${esc(x.desc)}" placeholder="Perkara (cth: Caj elektrik)" aria-label="Perkara ${i + 1}" required>
      <input class="input" data-i="${i}" data-k="amount" type="number" step="0.01" min="0" value="${x.amount}" aria-label="Jumlah (RM)" placeholder="Jumlah (RM)" required>
      <button type="button" class="icon-btn" data-rm="${i}" aria-label="Buang perkara"${items.length === 1 ? ' disabled' : ''}>${icon('x', 18)}</button></div>`).join('');
    box.querySelectorAll('input').forEach((inp) => (inp.oninput = () => { items[+inp.dataset.i][inp.dataset.k] = inp.dataset.k === 'amount' ? Number(inp.value) : inp.value; calc(); }));
    box.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { items.splice(+b.dataset.rm, 1); drawItems(); }));
    calc();
  };
  drawItems();
  document.getElementById('additem').onclick = () => { items.push({ desc: '', amount: 0 }); drawItems(); };

  const f = document.getElementById('f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const clean = items.filter((x) => x.desc.trim()).map((x) => ({ desc: x.desc.trim(), amount: Number(x.amount) || 0 }));
    if (!clean.length) return toast('Tambah sekurang-kurangnya satu perkara', 'error');
    const row = {
      vendor_id: d.vendor_id, event_id: d.event_id || null, items: clean,
      total: clean.reduce((a, x) => a + x.amount, 0), notes: d.notes.trim(), status: d.status,
      paid_at: d.status === 'paid' ? (inv?.paid_at || new Date().toISOString()) : null
    };
    await busy(f.querySelector('button[type=submit]'), async () => {
      try {
        const saved = inv
          ? await must(sb.from('invoices').update(row).eq('id', inv.id).select().single())
          : await must(sb.from('invoices').insert(row).select().single());
        toast('Invois disimpan'); go('#/invois/' + saved.id);
      } catch (err) { fail(err); }
    });
  };
}

// =============================================================
// A5: Tetapan (syarikat, bayaran, QR, vendor)
// =============================================================
export async function settingsView() {
  loading();
  const [s, vendors, priv] = await Promise.all([
    loadSettings(true),
    must(sb.from('profiles').select('id').eq('role', 'vendor')),
    must(sb.from('org_private').select('signature').eq('id', 1).maybeSingle())
  ]);
  const orgSig = priv?.signature || '';
  const qr = s.qr_image_path ? publicUrl('public-assets', s.qr_image_path) : '';
  render(`<div class="page">${topbar('Tetapan', { right: `<a class="icon-btn" href="#/akaun" aria-label="Akaun saya">${icon('user')}</a>` })}
    <div class="content">
      <form class="card stack" id="f">
        <b>Maklumat syarikat (untuk invois)</b>
        <label class="field">Nama syarikat<input class="input" name="company_name" value="${esc(s.company_name)}"></label>
        <label class="field">Alamat<textarea class="input" name="address" rows="2">${esc(s.address)}</textarea></label>
        <label class="field">No. telefon<input class="input" name="phone" value="${esc(s.phone)}"></label>
        <b style="margin-top:8px">Maklumat bayaran (dipapar kepada vendor)</b>
        <label class="field">Nama bank<input class="input" name="bank_name" value="${esc(s.bank_name)}" placeholder="Maybank"></label>
        <label class="field">No. akaun<input class="input" name="account_no" value="${esc(s.account_no)}"></label>
        <label class="field">Nama pemegang akaun<input class="input" name="account_name" value="${esc(s.account_name)}"></label>
        <label class="field">Had tapak setiap vendor (tanpa kebenaran khas)<input class="input" type="number" name="max_lots" min="1" max="50" value="${esc(s.max_lots ?? 3)}"></label>
        <label class="field">Masa tahan tapak semasa vendor bayar (minit)<input class="input" type="number" name="hold_minutes" min="5" max="1440" value="${esc(s.hold_minutes)}"></label>
        <b style="margin-top:8px">Perjanjian vendor</b>
        <label class="field">Masa untuk vendor tandatangan perjanjian (minit)<input class="input" type="number" name="sign_minutes" min="5" max="10080" value="${esc(s.sign_minutes ?? 60)}"></label>
        <div class="small muted">No. pendaftaran perniagaan penganjur boleh dikemas kini di menu Akaun.</div>
        <button class="btn block" type="submit">Simpan tetapan</button>
      </form>

      <div class="card stack" id="types">
        <b>Jenis perniagaan vendor</b>
        <div class="small muted">Senarai pilihan untuk admin tetapkan jenis perniagaan setiap vendor (menu Vendor). Vendor tidak boleh mengubahnya.</div>
        <div class="row" style="flex-wrap:wrap;gap:8px" id="typelist"></div>
        <form class="row" id="typeadd" style="gap:8px"><input class="input" name="t" placeholder="Cth: Air, Lauk panas, Kuih-muih" maxlength="40" style="flex:1"><button class="btn sm" type="submit">${icon('plus', 16)} Tambah</button></form>
        <button class="btn dark block" id="typesave">Simpan senarai</button>
      </div>

      <div class="card stack">
        <b>Tandatangan penganjur</b>
        <div class="small muted">Dipaparkan pada setiap perjanjian vendor yang baru diluluskan.</div>
        ${orgSig ? `<div style="background:#fff;border-radius:12px;padding:8px"><img src="${esc(orgSig)}" alt="Tandatangan penganjur" style="max-height:90px"></div>` : ''}
        <canvas id="orgpad" class="sig-pad" aria-label="Kotak tandatangan penganjur"></canvas>
        <div class="grid2"><button class="btn ghost" id="orgclear">Padam</button><button class="btn" id="orgsave">${orgSig ? 'Tukar tandatangan' : 'Simpan tandatangan'}</button></div>
      </div>

      <div class="card stack">
        <b>DuitNow QR</b>
        ${qr ? `<img src="${esc(qr)}" alt="DuitNow QR" style="width:180px;border-radius:12px">` : '<div class="small muted">Belum dimuat naik.</div>'}
        <div class="grid2">
          <label class="btn dark" style="cursor:pointer">${icon('upload', 18)} ${qr ? 'Tukar' : 'Muat naik'}<input type="file" id="qrfile" accept="image/*" class="hidden"></label>
          <button class="btn danger" id="rmqr"${qr ? '' : ' disabled'}>${icon('trash', 18)} Buang</button>
        </div>
      </div>

      <a class="card row" href="#/a/vendor" style="color:var(--text)">${icon('users', 22)}<div style="flex:1"><b>Urus vendor</b><div class="small muted">${vendors.length} vendor · cipta ID vendor &amp; kata laluan</div></div>${icon('back', 18).replace('M15 18l-6-6 6-6', 'M9 18l6-6-6-6')}</a>
    </div>${nav('#/a/tetapan')}</div>`);

  const f = document.getElementById('f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    d.hold_minutes = +d.hold_minutes || 15;
    d.max_lots = +d.max_lots || 3;
    d.sign_minutes = Math.max(5, +d.sign_minutes || 60);
    await busy(f.querySelector('button'), async () => {
      try { state.settings = await must(sb.from('settings').update(d).eq('id', 1).select().single()); toast('Tetapan disimpan'); }
      catch (err) { fail(err); }
    });
  };
  // Senarai jenis perniagaan
  let types = [...(s.business_types || [])];
  const drawTypes = () => {
    document.getElementById('typelist').innerHTML = types.length
      ? types.map((t, i) => `<span class="badge" style="background:var(--accent-soft);color:var(--accent);font-size:13px;padding:6px 6px 6px 12px;display:inline-flex;align-items:center;gap:6px">${esc(t)}<button type="button" data-rmt="${i}" aria-label="Buang ${esc(t)}" style="border:0;background:transparent;color:inherit;cursor:pointer;display:flex">${icon('x', 14)}</button></span>`).join('')
      : '<span class="small muted">Belum ada jenis perniagaan.</span>';
    document.querySelectorAll('[data-rmt]').forEach((b) => (b.onclick = () => { types.splice(+b.dataset.rmt, 1); drawTypes(); }));
  };
  drawTypes();
  document.getElementById('typeadd').onsubmit = (e) => {
    e.preventDefault();
    const t = e.target.t.value.trim();
    if (!t) return;
    if (types.some((x) => x.toLowerCase() === t.toLowerCase())) return toast('Jenis ini sudah ada', 'error');
    types.push(t); e.target.t.value = ''; drawTypes();
  };
  const tsave = document.getElementById('typesave');
  tsave.onclick = () => busy(tsave, async () => {
    try { state.settings = await must(sb.from('settings').update({ business_types: types }).eq('id', 1).select().single()); toast('Senarai jenis perniagaan disimpan'); }
    catch (err) { fail(/business_types/.test(err.message || '') ? new Error('Jalankan fail 10-jenis-perniagaan.sql di Supabase dahulu.') : err); }
  });

  const opad = signaturePad(document.getElementById('orgpad'));
  document.getElementById('orgclear').onclick = () => opad.clear();
  const osave = document.getElementById('orgsave');
  osave.onclick = () => {
    if (opad.isEmpty()) return toast('Sila tandatangan di dalam kotak dahulu', 'error');
    busy(osave, async () => {
      try { await must(sb.from('org_private').upsert({ id: 1, signature: opad.toPng() })); toast('Tandatangan penganjur disimpan'); go('#/a/tetapan?t=' + Date.now()); }
      catch (err) { fail(err); }
    });
  };
  document.getElementById('qrfile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const path = `qr-${Date.now()}.${fileExt(file)}`;
      await must(sb.storage.from('public-assets').upload(path, file, { contentType: file.type }));
      await must(sb.from('settings').update({ qr_image_path: path }).eq('id', 1));
      if (s.qr_image_path) await sb.storage.from('public-assets').remove([s.qr_image_path]);
      toast('QR dikemas kini'); go('#/a/tetapan?t=' + Date.now());
    } catch (err) { fail(err); }
  };
  document.getElementById('rmqr').onclick = async () => {
    try {
      await must(sb.storage.from('public-assets').remove([s.qr_image_path]));
      await must(sb.from('settings').update({ qr_image_path: null }).eq('id', 1));
      toast('QR dibuang'); go('#/a/tetapan?t=' + Date.now());
    } catch (err) { fail(err); }
  };
}

// =============================================================
// A6: Vendor — cipta ID vendor, set semula kata laluan, aktif/nyahaktif
// =============================================================
function randomPassword() {
  const c = 'abcdefghjkmnpqrstuvwxyz23456789';
  const a = new Uint32Array(8);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => c[x % c.length]).join('');
}
function nextCode(vendors) {
  const nums = vendors.map((v) => /^V(\d+)$/.exec(v.vendor_code || '')).filter(Boolean).map((m) => +m[1]);
  return 'V' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
}
function credsMessage(v, password) {
  return `Assalamualaikum & Salam Sejahtera ${v.owner_name || v.business_name},

Selamat datang ke *Stailo Event*! Akaun vendor anda telah didaftarkan.

*Maklumat Log Masuk*
ID Vendor : *${v.vendor_code}*
Kata Laluan : *${password}*

Sebarang pertanyaan, hubungi kami di talian ini.

Terima kasih,
*Pasukan Stailo Event*`;
}
function credsSheet(v, password, title) {
  const s = openSheet(`<h2>${esc(title)}</h2>
    <div class="card stack" style="background:var(--card-2)">
      <div class="row between"><span class="muted">ID vendor</span><b style="font-family:var(--display);font-size:20px">${esc(v.vendor_code)}</b></div>
      <div class="row between"><span class="muted">Kata laluan</span><b style="font-family:var(--display);font-size:20px;letter-spacing:.04em">${esc(password)}</b></div>
    </div>
    <p class="small muted" style="margin:0">Kata laluan ini hanya dipaparkan sekali. Hantar kepada vendor sekarang.</p>
    ${v.phone ? `<a class="btn wa block" href="${esc(waLink(v.phone, credsMessage(v, password)))}" target="_blank" rel="noopener">${icon('wa', 18)} Hantar melalui WhatsApp</a>` : ''}
    <button class="btn ghost block" id="copy">Salin maklumat</button>
    <button class="btn dark block" id="done">Selesai</button>`);
  s.querySelector('#copy').onclick = () => navigator.clipboard?.writeText(credsMessage(v, password)).then(() => toast('Disalin'));
  s.querySelector('#done').onclick = () => { closeSheet(); go('#/a/vendor?t=' + Date.now()); };
}

export async function vendorsView(params, query) {
  loading();
  const [vendors, st] = await Promise.all([must(sb.from('profiles').select('*').eq('role', 'vendor').order('vendor_code')), loadSettings(true)]);
  const types = st.business_types || [];
  const term = (query.get('q') || '').toLowerCase();
  const list = term ? vendors.filter((v) => [v.vendor_code, v.business_name, v.owner_name, v.phone, v.business_type].join(' ').toLowerCase().includes(term)) : vendors;
  render(`<div class="page">
    ${topbar('Vendor', { sub: `${vendors.length} vendor`, right: `<button class="btn sm" id="add">${icon('plus', 16)} Vendor baru</button>` })}
    <div class="content">
      <form id="search"><input class="input" type="search" name="q" value="${esc(query.get('q') || '')}" placeholder="Cari ID, nama atau telefon" aria-label="Cari vendor"></form>
      <div class="list">${list.length ? list.map((v) => `
        <button class="list-item" data-v="${v.id}">
          <span style="min-width:52px;height:44px;padding:0 8px;border-radius:10px;background:${v.is_active ? 'var(--accent-soft)' : 'var(--line-2)'};color:${v.is_active ? 'var(--accent)' : 'var(--muted)'};font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;flex:none">${esc(v.vendor_code || '—')}</span>
          <span class="grow"><span class="title">${esc(v.business_name || '-')}</span><span class="small muted">${v.business_type ? `<b style="color:var(--accent)">${esc(v.business_type)}</b> · ` : '<span style="color:var(--amber-ink)">Jenis belum ditetapkan</span> · '}${esc(v.owner_name)}${v.phone ? ' · ' + esc(v.phone) : ''}</span></span>
          ${v.is_active ? (docsComplete(v) ? '' : '<span class="badge red">Dokumen</span>') : '<span class="badge gray">Tidak aktif</span>'}
        </button>`).join('') : `<div class="empty">${term ? 'Tiada padanan.' : 'Belum ada vendor. Tekan "Vendor baru" untuk cipta ID vendor pertama.'}</div>`}</div>
      <div class="small muted">Hanya admin boleh cipta akaun vendor. Vendor log masuk dengan ID vendor &amp; kata laluan yang anda beri.</div>
    </div>${nav('#/a/vendor')}</div>`);

  const sf = document.getElementById('search');
  sf.onsubmit = (e) => { e.preventDefault(); go('#/a/vendor?q=' + encodeURIComponent(sf.q.value.trim())); };
  document.getElementById('add').onclick = () => newVendorSheet(vendors, types);
  document.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => vendorSheet(vendors.find((v) => v.id === b.dataset.v), types)));
}

// Pilihan jenis perniagaan (senarai ditetapkan admin dalam Tetapan)
function typeSelect(types, current = '') {
  const list = current && !types.includes(current) ? [...types, current] : types;
  return `<label class="field">Jenis perniagaan <span class="small muted">(hanya admin boleh tetapkan)</span>
    <select class="input" name="business_type"><option value="">— Belum ditetapkan —</option>${list.map((t) => `<option${t === current ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    ${types.length ? '' : '<div class="small" style="color:var(--amber-ink)">Senarai jenis perniagaan kosong. Tambah di menu Tetapan.</div>'}`;
}

function newVendorSheet(vendors, types = []) {
  const s = openSheet(`<h2>Vendor baru</h2>
    <form id="nf" class="stack">
      <label class="field">ID vendor<input class="input" name="code" required value="${nextCode(vendors)}" pattern="[A-Za-z0-9\\-]{2,20}" style="text-transform:uppercase;font-weight:700"></label>
      <label class="field">Nama perniagaan<input class="input" name="business_name" required></label>
      <label class="field">Nama pemilik<input class="input" name="owner_name"></label>
      <label class="field">No. telefon (WhatsApp)<input class="input" type="tel" name="phone" placeholder="0123456789"></label>
      <label class="field">Kategori
        <select class="input" name="category"><option value="makanan">Makanan &amp; minuman</option><option value="bukan_makanan">Bukan makanan</option></select></label>
      ${typeSelect(types)}
      <label class="field">Kata laluan sementara<input class="input" name="password" required minlength="6" value="${randomPassword()}"></label>
      <button class="btn block" type="submit">Cipta akaun vendor</button>
    </form>`);
  const f = s.querySelector('#nf');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    await busy(f.querySelector('button'), async () => {
      try {
        const newId = await must(sb.rpc('admin_create_vendor', {
          p_code: d.code.trim().toUpperCase(), p_password: d.password, p_business_name: d.business_name.trim(),
          p_owner_name: d.owner_name.trim(), p_phone: d.phone.trim()
        }));
        if (newId) await must(sb.from('profiles').update({ category: d.category, business_type: d.business_type || '' }).eq('id', newId));
        credsSheet({ vendor_code: d.code.trim().toUpperCase(), business_name: d.business_name.trim(), owner_name: d.owner_name.trim(), phone: d.phone.trim() }, d.password, 'Akaun vendor dicipta');
      } catch (err) { fail(err); }
    });
  };
}

function vendorSheet(v, types = []) {
  const s = openSheet(`<div class="row between"><div><h2>${esc(v.business_name || '-')}</h2><div class="small muted">ID vendor: <b>${esc(v.vendor_code || '-')}</b></div></div>${v.is_active ? '<span class="badge green">Aktif</span>' : '<span class="badge gray">Tidak aktif</span>'}</div>
    <form id="ef" class="stack">
      <label class="field">Nama perniagaan<input class="input" name="business_name" required value="${esc(v.business_name)}"></label>
      <label class="field">Nama pemilik<input class="input" name="owner_name" value="${esc(v.owner_name)}"></label>
      <label class="field">No. telefon (WhatsApp)<input class="input" type="tel" name="phone" value="${esc(v.phone)}"></label>
      <label class="field">Kategori
        <select class="input" name="category"><option value="makanan"${v.category === 'makanan' ? ' selected' : ''}>Makanan &amp; minuman</option><option value="bukan_makanan"${v.category !== 'makanan' ? ' selected' : ''}>Bukan makanan</option></select></label>
      ${typeSelect(types, v.business_type || '')}
      <button class="btn dark block" type="submit">Simpan</button>
    </form>
    <div class="card stack" style="background:var(--card-2)">
      <div class="row between"><b>Dokumen</b>${docsComplete(v) ? '<span class="badge green">Lengkap</span>' : '<span class="badge red">Belum lengkap</span>'}</div>
      ${DOCS.filter((d) => !d.foodOnly || v.category === 'makanan').map((d) => `<div class="row between small" style="gap:8px"><span>${d.name}${d.need(v) ? ' <span class="badge red">Wajib</span>' : ''}</span>${v[d.key] ? `<button class="btn ghost sm" data-vdoc="${esc(v[d.key])}">Lihat</button>` : '<span class="muted">Belum dimuat naik</span>'}</div>`).join('')}
    </div>
    ${v.phone ? `<a class="btn ghost block" href="${esc(waLink(v.phone, ''))}" target="_blank" rel="noopener">${icon('wa', 18)} WhatsApp vendor</a>` : ''}
    <div class="grid2">
      <button class="btn ghost" id="reset">${icon('key', 18)} Set semula kata laluan</button>
      <button class="btn ${v.is_active ? 'danger' : ''}" id="toggle">${v.is_active ? 'Nyahaktif' : 'Aktifkan'}</button>
    </div>`);
  const f = s.querySelector('#ef');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    await busy(f.querySelector('button'), async () => {
      try { await must(sb.from('profiles').update(d).eq('id', v.id)); closeSheet(); toast('Disimpan'); go('#/a/vendor?t=' + Date.now()); }
      catch (err) { fail(err); }
    });
  };
  s.querySelectorAll('[data-vdoc]').forEach((b) => (b.onclick = async () => {
    try { const r = await must(sb.storage.from('vendor-docs').createSignedUrl(b.dataset.vdoc, 600)); window.open(r.signedUrl, '_blank', 'noopener'); }
    catch (err) { fail(err); }
  }));
  s.querySelector('#reset').onclick = async () => {
    if (!(await confirmSheet('Set semula kata laluan?', `Kata laluan baru akan dijana untuk ${v.vendor_code}. Kata laluan lama tidak boleh digunakan lagi.`, 'Set semula'))) return;
    const pw = randomPassword();
    try { await must(sb.rpc('admin_set_vendor_password', { p_vendor: v.id, p_password: pw })); credsSheet(v, pw, 'Kata laluan baru'); }
    catch (err) { fail(err); }
  };
  s.querySelector('#toggle').onclick = async () => {
    if (v.is_active && !(await confirmSheet(`Nyahaktif ${v.vendor_code}?`, 'Vendor ini tidak boleh log masuk atau tempah tapak sehingga diaktifkan semula. Tempahan & invois sedia ada kekal.', 'Nyahaktif', true))) return;
    try { await must(sb.rpc('admin_set_vendor_active', { p_vendor: v.id, p_active: !v.is_active })); closeSheet(); toast(v.is_active ? 'Vendor dinyahaktif' : 'Vendor diaktifkan'); go('#/a/vendor?t=' + Date.now()); }
    catch (err) { fail(err); }
  };
}
