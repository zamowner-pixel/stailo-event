// Pendaftaran kehadiran (check-in QR) & serahan barang.
//  #/a/kehadiran            admin: senarai program
//  #/a/kehadiran/:id        admin: butiran, barang, peserta, WhatsApp, Excel, akaun krew
//  #/t/:token               peserta: tiket QR (tanpa log masuk)
//  #/kaunter/masuk          krew: log masuk
//  #/kaunter                krew / admin: imbas QR, sahkan hadir, serah barang
import {
  sb, state, render, loading, esc, icon, toast, fail, go, busy, must, topbar, nav, fmtDate, fmtDateTime,
  openSheet, closeSheet, waLink, confirmSheet
} from './lib.js';
import { qrSvg, drawQr } from './qr.js';
import { downloadBlob } from './invoice-pdf.js';
import { loadLib } from './archive.js';
import { APP_NAME } from './config.js';

const base = () => location.origin + location.pathname;
export const ticketUrl = (token) => `${base()}#/t/${token}`;
const crewUrl = () => `${base()}#/kaunter/masuk`;
const save = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const load = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const DL = icon('upload', 18).replace('M12 16V4M7 9l5-5 5 5', 'M12 4v12M7 11l5 5 5-5');
const randomPassword = () => Array.from(crypto.getRandomValues(new Uint32Array(2))).map((n) => n.toString(36)).join('').slice(0, 10);
const hhmm = (d) => { if (!d) return ''; const x = new Date(d); return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };
const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '').trim();
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function copyText(t, msg = 'Pautan disalin') {
  try { await navigator.clipboard.writeText(t); toast(msg); }
  catch { prompt('Salin teks ini:', t); }
}

// =============================================================
// Mesej WhatsApp
// =============================================================
export const DEFAULT_TEMPLATE = `Salam {nama},

Anda telah berdaftar untuk *{program}*.
Tarikh: {tarikh} {masa}
Lokasi: {lokasi}

ID peserta: *{kod}*
No. plat: {plat}
Saiz baju: {saiz}

Sila tunjukkan kod QR anda di kaunter pendaftaran. Buka pautan ini dan simpan gambar tiket (screenshot) sebelum sampai:
{pautan}

{pasangan}

{info}

Terima kasih.`;

const detailsMissing = (g) => [!g.name?.trim() && 'nama program', !g.event_date && 'tarikh', !g.venue?.trim() && 'lokasi'].filter(Boolean);

export function waMessage(g, p, partners = []) {
  const vals = {
    nama: p.name, program: g.name, tarikh: g.event_date ? fmtDate(g.event_date) : '', masa: g.event_time || '',
    lokasi: g.venue || '', kod: p.code, plat: p.plate || '', saiz: p.size || '', kategori: p.category || '',
    pautan: ticketUrl(p.token), info: g.info || '',
    pasangan: partners.map((x) => `Tiket pasangan: *${x.name}* (${x.code})\n${ticketUrl(x.token)}`).join('\n\n')
  };
  let tpl = (g.wa_template || '').trim() || DEFAULT_TEMPLATE;
  if (partners.length && !tpl.includes('{pasangan}')) tpl += '\n\n{pasangan}';
  // Baris yang semua medannya kosong dibuang (cth tiada no. plat)
  const lines = tpl.split('\n').filter((line) => {
    const keys = [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => k in vals);
    return !keys.length || keys.some((k) => String(vals[k]).trim());
  });
  return lines.join('\n').replace(/\{(\w+)\}/g, (m, k) => (k in vals ? vals[k] : m)).replace(/\n{3,}/g, '\n\n').trim();
}
const phoneOk = (p) => /^01[0-9]{8,9}$/.test(String(p || ''));

// =============================================================
// ADMIN: senarai program  #/a/kehadiran
// =============================================================
export async function adminGatheringsView() {
  loading();
  const [list, people, events] = await Promise.all([
    must(sb.from('gatherings').select('*').order('created_at', { ascending: false })),
    fetchAll(sb.from('gathering_people').select('gathering_id,checked_in_at')),
    must(sb.from('events').select('id,name,start_date,end_date,location').order('created_at', { ascending: false }))
  ]);
  const evName = (g) => events.find((e) => e.id === g.event_id)?.name;
  const count = (id) => people.filter((p) => p.gathering_id === id);
  render(`<div class="page">${topbar('Pendaftaran kehadiran', { back: '#/a', sub: 'Check-in QR & serahan barang', right: `<a class="btn sm ghost" href="#/kaunter">${icon('ticket', 16)} Skrin kaunter</a>` })}
    <div class="content">
      <div class="section-title">Program${list.length ? ` (${list.length})` : ''} <button class="btn sm" id="newg">${icon('plus', 16)} Program baru</button></div>
      ${list.length ? `<div class="ev-grid stack" style="gap:12px">${list.map((g) => {
        const ps = count(g.id), hadir = ps.filter((p) => p.checked_in_at).length;
        return `<a class="card stack" href="#/a/kehadiran/${g.id}" style="color:var(--text);gap:6px">
          <div class="row between" style="align-items:flex-start"><b style="font-size:16px">${esc(g.name)}</b>${g.is_open ? '<span class="badge green">Kaunter dibuka</span>' : '<span class="badge gray">Kaunter ditutup</span>'}</div>
          <span class="small muted">${esc([g.event_date ? fmtDate(g.event_date) : 'Tarikh belum ditetapkan', g.venue].filter(Boolean).join(' · '))}</span>
          <span>${evName(g) ? `<span class="badge amber">Event: ${esc(evName(g))}</span>` : '<span class="badge dark">Private event</span>'}</span>
          <div class="row" style="gap:18px;margin-top:4px"><span class="stat"><b>${ps.length}</b><span class="small muted">peserta</span></span><span class="stat"><b>${hadir}</b><span class="small muted">hadir</span></span></div>
        </a>`;
      }).join('')}</div>` : `<div class="card stack"><b>Belum ada program</b><span class="small muted">Cipta program (cth gathering), kemudian masukkan senarai peserta. Setiap peserta akan dapat ID dan QR sendiri untuk check-in di kaunter.</span></div>`}
    </div>${nav('#/a')}</div>`);
  document.getElementById('newg').onclick = () => {
    let kind = events.length ? 'event' : 'private';
    const s = openSheet(`<h2>Program baru</h2>
      <div class="ci-kind" role="radiogroup" aria-label="Jenis program">
        <button type="button" data-kind="event" role="radio"${events.length ? '' : ' disabled'}><b>${icon('grid', 18)} Event sedia ada</b><span>Pendaftaran untuk event yang sudah ada dalam apps (menu Tapak)</span></button>
        <button type="button" data-kind="private" role="radio"><b>${icon('lock', 18)} Private event</b><span>Program sendiri tanpa vendor, cth gathering, majlis atau jamuan tertutup</span></button>
      </div>
      <form id="gf" class="stack">
        <label class="field" id="g-evwrap">Pilih event<select class="input" name="ev" id="g-ev">${events.map((e) => `<option value="${e.id}">${esc(e.name)}${e.start_date ? ' · ' + esc(fmtDate(e.start_date)) : ''}</option>`).join('')}</select></label>
        <label class="field">Nama program<input class="input" name="name" id="g-name" required maxlength="120" placeholder="Cth: Gathering Superbike 2027"></label>
        <div class="small muted" id="g-hint"></div>
        <button class="btn block" type="submit">Cipta program</button>
      </form>`);
    const f = s.querySelector('#gf');
    const setKind = (k) => {
      kind = k;
      s.querySelectorAll('[data-kind]').forEach((b) => { b.classList.toggle('on', b.dataset.kind === k); b.setAttribute('aria-checked', b.dataset.kind === k); });
      s.querySelector('#g-evwrap').classList.toggle('hidden', k !== 'event');
      if (k === 'event') { const ev = events.find((e) => e.id === f.ev.value); f.name.value = ev ? ev.name : ''; }
      else if (events.some((e) => e.name === f.name.value)) f.name.value = '';
      s.querySelector('#g-hint').textContent = k === 'event'
        ? 'Tarikh dan lokasi diambil dari event. Barang dan maklumat lain boleh diisi kemudian.'
        : 'Tarikh, lokasi, barang dan maklumat lain boleh diisi kemudian.';
    };
    s.querySelectorAll('[data-kind]').forEach((b) => (b.onclick = () => setKind(b.dataset.kind)));
    f.ev.onchange = () => setKind('event');
    setKind(kind);
    f.onsubmit = (e) => {
      e.preventDefault();
      busy(f.querySelector('button[type=submit]'), async () => {
        try {
          const row = { name: f.name.value.trim() };
          if (kind === 'event') {
            const ev = events.find((x) => x.id === f.ev.value);
            Object.assign(row, { event_id: ev.id, event_date: ev.start_date || null, venue: ev.location || '' });
          }
          const g = await must(sb.from('gatherings').insert(row).select().single());
          closeSheet(); go('#/a/kehadiran/' + g.id);
        } catch (err) { fail(err); }
      });
    };
  };
}

// =============================================================
// ADMIN: satu program  #/a/kehadiran/:id
// =============================================================
export async function adminGatheringView({ id }, query) {
  loading();
  const [g, people, handovers, crew, events] = await Promise.all([
    must(sb.from('gatherings').select('*').eq('id', id).single()),
    fetchAll(sb.from('gathering_people').select('*').eq('gathering_id', id).order('code')),
    fetchAll(sb.from('gathering_handovers').select('*').eq('gathering_id', id).order('given_at')),
    must(sb.from('profiles').select('vendor_code,is_active').eq('role', 'crew')),
    must(sb.from('events').select('id,name,start_date,end_date,location').order('created_at', { ascending: false }))
  ]);
  const linked = events.find((e) => e.id === g.event_id);
  const reload = () => go(`#/a/kehadiran/${id}?t=${Date.now()}`);
  const items = g.items || [];
  const byPerson = handovers.reduce((a, h) => { (a[h.person_id] ||= []).push(h); return a; }, {});
  const hadir = people.filter((p) => p.checked_in_at).length;
  const waSent = people.filter((p) => p.wa_sent_at).length;
  const missing = detailsMissing(g);
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const partnersOf = (p) => people.filter((x) => x.parent_id === p.id);
  const msgFor = (p) => waMessage(g, p, partnersOf(p));
  // Pasangan dihantar bersama mesej peserta utama
  const pendingWa = () => people.filter((p) => !p.wa_sent_at && phoneOk(p.phone) && !(p.parent_id && byId[p.parent_id]));
  const stampSent = (p) => {
    const at = new Date().toISOString();
    const ids = [p, ...partnersOf(p)].filter((x) => !x.wa_sent_at).map((x) => { x.wa_sent_at = at; return x.id; });
    if (ids.length) sb.from('gathering_people').update({ wa_sent_at: at }).in('id', ids).then(({ error }) => error && fail(error));
  };
  let filter = query.get('f') || 'all', q = '', shown = 60;

  render(`<div class="page">${topbar(g.name, { back: '#/a/kehadiran', sub: esc([g.event_date ? fmtDate(g.event_date) : '', g.venue].filter(Boolean).join(' · ') || 'Butiran belum lengkap'), right: `<a class="btn sm" href="#/kaunter?g=${g.id}">${icon('ticket', 16)} Kaunter</a>` })}
    <div class="content">
      <div class="ci-stats">
        <div class="card stat"><b>${people.length}</b><span class="small muted">Peserta</span></div>
        <div class="card stat"><b>${hadir}</b><span class="small muted">Hadir${people.length ? ` · ${Math.round((hadir / people.length) * 100)}%` : ''}</span></div>
        <div class="card stat"><b>${waSent}</b><span class="small muted">WhatsApp dihantar</span></div>
        ${items.map((it) => `<div class="card stat"><b>${handovers.filter((h) => h.item === it).length}<span class="small muted" style="font-size:13px"> / ${people.length}</span></b><span class="small muted">${esc(it)} diserah</span></div>`).join('')}
      </div>

      <div class="ci-grid">
        <div class="card stack">
          <div class="row between"><b>Butiran program</b><button class="btn ghost sm" id="gedit">${icon('edit', 16)} Edit</button></div>
          ${missing.length ? `<div class="ci-warn">${icon('bell', 16)} Belum diisi: ${esc(missing.join(', '))}. Lengkapkan dahulu sebelum hantar WhatsApp.</div>` : ''}
          <div class="ci-kv"><span>Jenis</span><b>${linked ? 'Event: ' + esc(linked.name) : 'Private event'}</b></div>
          <div class="ci-kv"><span>Tarikh</span><b>${esc(g.event_date ? fmtDate(g.event_date) : '—')} ${esc(g.event_time || '')}</b></div>
          <div class="ci-kv"><span>Lokasi</span><b>${esc(g.venue || '—')}</b></div>
          <div class="ci-kv"><span>Maklumat</span><b style="white-space:pre-line">${esc(g.info || '—')}</b></div>
          <div class="ci-kv"><span>Kaunter</span><b>${g.is_open ? 'Dibuka' : 'Ditutup'}</b></div>
          <button class="btn ${g.is_open ? 'ghost' : ''} sm" id="gopen">${g.is_open ? 'Tutup kaunter' : 'Buka kaunter'}</button>
        </div>

        <div class="card stack">
          <div class="row between"><b>Barang diserahkan</b><span class="small muted">${items.length} jenis</span></div>
          <span class="small muted">Cth: Baju, Beg, Sticker, Wristband. Setiap barang hanya boleh diambil sekali oleh setiap peserta.</span>
          <div class="ci-chips" id="ichips"></div>
          <form class="row" id="iadd" style="gap:8px"><input class="input" name="it" id="i-new" maxlength="40" placeholder="Nama barang" style="flex:1;min-width:0"><button class="btn sm dark" type="submit">${icon('plus', 16)} Tambah</button></form>
          <button class="btn sm" id="isave" disabled>Simpan senarai barang</button>
        </div>
      </div>

      <div class="section-title">Peserta (${people.length})</div>
      <div class="ci-tools">
        <button class="btn" id="wasend"${pendingWa().length ? '' : ' disabled'}>${icon('wa', 18)} Hantar WhatsApp (${pendingWa().length})</button>
        <button class="btn ghost" id="padd">${icon('plus', 16)} Peserta</button>
        <button class="btn ghost" id="pimport">${icon('upload', 16)} Import Excel</button>
        <button class="btn ghost" id="ptpl">${DL} Templat Excel</button>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <input class="input" id="psearch" placeholder="Cari nama, ID, no. plat atau telefon" style="flex:1;min-width:200px" autocomplete="off">
        <select class="input" id="pfilter" style="width:auto;min-width:170px" aria-label="Tapis">
          ${[['all', 'Semua'], ['nowa', 'Belum WhatsApp'], ['absent', 'Belum hadir'], ['present', 'Sudah hadir'], ['walkin', 'Walk-in']].map(([v, t]) => `<option value="${v}"${filter === v ? ' selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div id="plist"></div>

      <div class="ci-grid">
        <div class="card stack">
          <b>${icon('file', 18)} Simpan rekod ke laptop & kosongkan</b>
          <span class="small muted">Muat turun Excel (senarai peserta, kehadiran, barang diambil dan log kaunter), kemudian padam program ini dari apps.</span>
          <button class="btn" id="gexport"${people.length ? '' : ' disabled'}>${DL} Muat turun Excel</button>
          <button class="btn danger" id="gpurge">${icon('trash', 16)} Padam program</button>
        </div>
        <form class="card stack" id="cstaff">
          <b>${icon('key', 18)} Akaun krew kaunter</b>
          <span class="small muted">ID & kata laluan khas untuk skrin kaunter sahaja. Satu akaun boleh digunakan di banyak telefon serentak. ${crew.length ? 'Sedia ada: <b>' + crew.map((s) => esc(s.vendor_code)).join(', ') + '</b>.' : ''}</span>
          <div class="grid2">
            <label class="field">ID<input class="input" name="code" id="cs-code" required value="${esc(crew[0]?.vendor_code || 'KAUNTER')}" style="text-transform:uppercase;font-weight:700"></label>
            <label class="field">Kata laluan<input class="input" name="pw" id="cs-pw" required minlength="6" value="${randomPassword()}"></label>
          </div>
          <button class="btn dark" type="submit">Simpan akaun krew</button>
          <div class="small muted">Log masuk krew: <span style="word-break:break-all">${esc(crewUrl())}</span> <a href="#" id="ccopy">Salin</a></div>
        </form>
      </div>
    </div>${nav('#/a')}</div>`);

  // ---------- Senarai peserta ----------
  const matches = (p) => {
    if (filter === 'nowa' && p.wa_sent_at) return false;
    if (filter === 'absent' && p.checked_in_at) return false;
    if (filter === 'present' && !p.checked_in_at) return false;
    if (filter === 'walkin' && !p.walkin) return false;
    if (!q) return true;
    const t = q.toLowerCase(), plate = t.replace(/\s+/g, '').toUpperCase(), digits = t.replace(/\D/g, '');
    return p.name.toLowerCase().includes(t) || p.code.toLowerCase() === t || (plate && p.plate.includes(plate)) || (digits.length >= 4 && p.phone.includes(digits));
  };
  const drawList = () => {
    const rows = people.filter(matches);
    const el = document.getElementById('plist');
    if (!people.length) { el.innerHTML = '<div class="card empty">Belum ada peserta. Tekan "Import Excel" untuk masukkan senarai, atau "+ Peserta" untuk tambah seorang.</div>'; return; }
    if (!rows.length) { el.innerHTML = '<div class="card empty">Tiada padanan.</div>'; return; }
    el.innerHTML = `<div class="list">${rows.slice(0, shown).map((p) => {
      const got = (byPerson[p.id] || []).length;
      return `<div class="list-item" data-pid="${p.id}" role="button" tabindex="0">
        <span class="code-tile" style="min-width:64px;font-size:13px">${esc(p.code)}</span>
        <span class="grow"><span class="title">${esc(p.name)}</span>
          <span class="small muted">${esc([p.plate, p.size && 'Saiz ' + p.size, p.category, p.phone].filter(Boolean).join(' · ') || '—')}</span>
          <span class="row" style="gap:6px;flex-wrap:wrap">${p.checked_in_at ? `<span class="badge green">Hadir ${hhmm(p.checked_in_at)}</span>` : '<span class="badge gray">Belum hadir</span>'}${items.length ? `<span class="badge ${got >= items.length ? 'green' : got ? 'amber' : 'gray'}">Barang ${got}/${items.length}</span>` : ''}${p.wa_sent_at ? '<span class="badge green">WA ✓</span>' : ''}${p.walkin ? '<span class="badge amber">Walk-in</span>' : ''}${p.parent_id && byId[p.parent_id] ? `<span class="badge gray">Pasangan ${esc(byId[p.parent_id].code)}</span>` : ''}${partnersOf(p).length ? `<span class="badge gray">+ ${partnersOf(p).map((x) => esc(x.code)).join(', ')}</span>` : ''}</span></span>
        ${phoneOk(p.phone) ? `<a class="icon-btn ci-wa" href="${esc(waLink(p.phone, msgFor(p)))}" target="_blank" rel="noopener" data-wa="${p.id}" aria-label="Hantar WhatsApp kepada ${esc(p.name)}">${icon('wa', 18)}</a>` : ''}
      </div>`;
    }).join('')}</div>${rows.length > shown ? `<button class="btn ghost block" id="pmore" style="margin-top:10px">Tunjuk lagi (${rows.length - shown})</button>` : ''}`;
    el.querySelectorAll('[data-pid]').forEach((r) => {
      const open = (e) => { if (e.target.closest('[data-wa]')) return; personSheet(people.find((p) => p.id === r.dataset.pid)); };
      r.onclick = open; r.onkeydown = (e) => { if (e.key === 'Enter') open(e); };
    });
    el.querySelectorAll('[data-wa]').forEach((a) => (a.onclick = (e) => {
      if (missing.length) { e.preventDefault(); toast('Lengkapkan butiran program dahulu (' + missing.join(', ') + ')', 'error'); return; }
      markSent(a.dataset.wa);
    }));
    document.getElementById('pmore')?.addEventListener('click', () => { shown += 200; drawList(); });
  };
  const markSent = (pid) => { const p = byId[pid]; if (!p) return; stampSent(p); setTimeout(drawList, 300); };
  drawList();
  let tmr;
  document.getElementById('psearch').oninput = (e) => { clearTimeout(tmr); tmr = setTimeout(() => { q = e.target.value.trim(); shown = 60; drawList(); }, 150); };
  document.getElementById('pfilter').onchange = (e) => { filter = e.target.value; shown = 60; drawList(); };

  // ---------- Barang ----------
  let its = [...items];
  const drawChips = () => {
    document.getElementById('ichips').innerHTML = its.length ? its.map((it, i) => `<span class="ci-chip">${esc(it)}<button data-ix="${i}" aria-label="Buang ${esc(it)}">${icon('x', 14)}</button></span>`).join('') : '<span class="small muted">Belum ada barang.</span>';
    document.querySelectorAll('[data-ix]').forEach((b) => (b.onclick = () => {
      const it = its[+b.dataset.ix];
      if (handovers.some((h) => h.item === it)) return toast(`"${it}" sudah diserah kepada peserta. Tidak boleh dibuang.`, 'error');
      its.splice(+b.dataset.ix, 1); drawChips();
    }));
    document.getElementById('isave').disabled = JSON.stringify(its) === JSON.stringify(items);
  };
  drawChips();
  document.getElementById('iadd').onsubmit = (e) => {
    e.preventDefault();
    const v = e.target.it.value.trim().replace(/\s+/g, ' ');
    if (!v) return;
    if (its.some((x) => x.toLowerCase() === v.toLowerCase())) return toast('Barang sudah ada');
    its.push(v); e.target.it.value = ''; drawChips(); e.target.it.focus();
  };
  document.getElementById('isave').onclick = (e) => busy(e.currentTarget, async () => {
    try { await must(sb.from('gatherings').update({ items: its }).eq('id', id)); toast('Senarai barang disimpan'); reload(); } catch (err) { fail(err); }
  });

  // ---------- Butiran ----------
  document.getElementById('gedit').onclick = () => {
    const s = openSheet(`<h2>Butiran program</h2>
      <form id="gdf" class="stack">
        <label class="field">Jenis program<select class="input" name="ev" id="gd-ev">
          <option value="">Private event (tanpa vendor)</option>
          ${events.map((e) => `<option value="${e.id}"${e.id === g.event_id ? ' selected' : ''}>Event: ${esc(e.name)}</option>`).join('')}
        </select></label>
        <label class="field">Nama program<input class="input" name="name" id="gd-name" required maxlength="120" value="${esc(g.name)}"></label>
        <div class="grid2">
          <label class="field">Tarikh<input class="input" type="date" name="d" id="gd-date" value="${esc(g.event_date || '')}"></label>
          <label class="field">Masa<input class="input" name="t" id="gd-time" maxlength="40" value="${esc(g.event_time || '')}" placeholder="Cth: 8.00 pagi"></label>
        </div>
        <label class="field">Lokasi<input class="input" name="v" id="gd-venue" maxlength="160" value="${esc(g.venue || '')}" placeholder="Cth: Dewan Besar, Bukit Mertajam"></label>
        <label class="field">Maklumat untuk peserta<textarea class="input" name="info" id="gd-info" rows="3" maxlength="800" placeholder="Cth: Parkir motor di Zon B. Sila hadir 30 minit awal.">${esc(g.info || '')}</textarea></label>
        <label class="field">Awalan ID peserta<input class="input" name="pre" id="gd-pre" maxlength="6" value="${esc(g.code_prefix || 'P')}" style="text-transform:uppercase;width:120px"${people.length ? ' disabled title="Tidak boleh ditukar selepas peserta dimasukkan"' : ''}></label>
        <details class="ci-details"><summary>Mesej WhatsApp (pilihan)</summary>
          <div class="small muted" style="margin:6px 0">Kosongkan untuk guna mesej asal. Kod yang boleh digunakan: {nama} {kod} {plat} {saiz} {kategori} {program} {tarikh} {masa} {lokasi} {info} {pautan} {pasangan}</div>
          <textarea class="input" name="tpl" id="gd-tpl" rows="10" maxlength="2000" placeholder="${esc(DEFAULT_TEMPLATE)}">${esc(g.wa_template || '')}</textarea>
        </details>
        <button class="btn block" type="submit">Simpan butiran</button>
      </form>`);
    const df = s.querySelector('#gdf');
    df.ev.onchange = () => {
      const ev = events.find((x) => x.id === df.ev.value);
      if (!ev) return;
      if (!df.d.value && ev.start_date) df.d.value = ev.start_date;
      if (!df.v.value.trim() && ev.location) df.v.value = ev.location;
    };
    s.querySelector('#gdf').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      busy(f.querySelector('button[type=submit]'), async () => {
        try {
          const row = { event_id: f.ev.value || null, name: f.name.value.trim(), event_date: f.d.value || null, event_time: f.t.value.trim(), venue: f.v.value.trim(), info: f.info.value.trim(), wa_template: f.tpl.value.trim() };
          if (!people.length) row.code_prefix = (f.pre.value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'P');
          await must(sb.from('gatherings').update(row).eq('id', id));
          closeSheet(); toast('Butiran disimpan'); reload();
        } catch (err) { fail(err); }
      });
    };
  };
  document.getElementById('gopen').onclick = (e) => busy(e.currentTarget, async () => {
    try { await must(sb.from('gatherings').update({ is_open: !g.is_open }).eq('id', id)); toast(g.is_open ? 'Kaunter ditutup' : 'Kaunter dibuka'); reload(); } catch (err) { fail(err); }
  });

  // ---------- Peserta: tambah / edit ----------
  const personForm = (p = {}) => `
    <label class="field">Nama penuh<input class="input" name="name" id="pf-name" required maxlength="80" value="${esc(p.name || '')}"></label>
    <div class="grid2">
      <label class="field">No. telefon<input class="input" name="phone" id="pf-phone" inputmode="tel" maxlength="20" value="${esc(p.phone || '')}" placeholder="0123456789"></label>
      <label class="field">No. plat<input class="input" name="plate" id="pf-plate" maxlength="16" value="${esc(p.plate || '')}" style="text-transform:uppercase"></label>
      <label class="field">Saiz baju<input class="input" name="size" id="pf-size" maxlength="10" value="${esc(p.size || '')}" placeholder="S / M / L / XL" style="text-transform:uppercase"></label>
      <label class="field">Kategori<input class="input" name="category" id="pf-cat" maxlength="30" value="${esc(p.category || '')}" placeholder="Rider / Pillion"></label>
    </div>
    <label class="field">Nota<input class="input" name="note" id="pf-note" maxlength="200" value="${esc(p.note || '')}"></label>`;
  const formRow = (f) => ({ name: f.name.value.trim(), phone: f.phone.value, plate: f.plate.value, size: f.size.value.trim().toUpperCase(), category: f.category.value.trim(), note: f.note.value.trim() });

  document.getElementById('padd').onclick = () => {
    const s = openSheet(`<h2>Tambah peserta</h2><form id="paf" class="stack">${personForm()}<button class="btn block" type="submit">Tambah</button></form>`);
    s.querySelector('#paf').onsubmit = (e) => {
      e.preventDefault();
      busy(e.target.querySelector('button'), async () => {
        try { const r = await must(sb.from('gathering_people').insert({ gathering_id: id, code: '', ...formRow(e.target) }).select().single()); closeSheet(); toast(`${r.name} ditambah · ${r.code}`); reload(); }
        catch (err) { fail(err); }
      });
    };
  };

  function personSheet(p) {
    const hs = byPerson[p.id] || [];
    const url = ticketUrl(p.token);
    const s = openSheet(`<div class="row" style="gap:12px;align-items:flex-start">
        <div style="flex:1;min-width:0"><div class="eyebrow">${esc(p.code)}${p.walkin ? ' · WALK-IN' : ''}</div><h2 style="margin:2px 0 0">${esc(p.name)}</h2>
          <div class="small muted">${p.checked_in_at ? `Hadir ${esc(fmtDateTime(p.checked_in_at))} · ${esc(p.checked_in_by || '')}` : 'Belum hadir'}</div></div>
        <div class="qr-box" style="padding:6px">${qrSvg(url, 96).replace('<svg', '<svg style="width:96px"')}</div>
      </div>
      ${items.length ? `<div class="stack" style="gap:6px">${items.map((it) => { const h = hs.find((x) => x.item === it); return `<div class="row between small" style="padding:8px 12px;border-radius:10px;background:var(--card-2)"><b>${esc(it)}</b>${h ? `<span class="row" style="gap:8px"><span class="badge green">${esc(hhmm(h.given_at))} · ${esc(h.given_by)}</span><button class="btn ghost sm" data-undo="${esc(it)}" style="height:30px">Batal</button></span>` : '<span class="badge gray">Belum ambil</span>'}</div>`; }).join('')}</div>` : ''}
      <div class="grid2">
        ${p.parent_id && byId[p.parent_id] ? `<div class="small muted" style="grid-column:1/-1">Pasangan kepada <b>${esc(byId[p.parent_id].name)}</b> (${esc(byId[p.parent_id].code)}). Tiket ini dihantar bersama mesej WhatsApp ${esc(byId[p.parent_id].name.split(' ')[0])}.</div>` : ''}
        ${partnersOf(p).length ? `<div class="small muted" style="grid-column:1/-1">Datang bersama: <b>${partnersOf(p).map((x) => esc(x.name) + ' (' + esc(x.code) + ')').join(', ')}</b>. Tiket pasangan disertakan dalam mesej WhatsApp.</div>` : ''}
        ${phoneOk(p.phone) ? `<a class="btn" id="pwa" href="${esc(waLink(p.phone, msgFor(p)))}" target="_blank" rel="noopener">${icon('wa', 18)} WhatsApp</a>` : '<button class="btn" disabled>Tiada no. telefon</button>'}
        <button class="btn ghost" id="pcopy">Salin pautan tiket</button>
      </div>
      <form id="pef" class="stack">${personForm(p)}<button class="btn dark block" type="submit">Simpan perubahan</button></form>
      <div class="grid2">
        <button class="btn ghost" id="preset"${p.checked_in_at || hs.length ? '' : ' disabled'}>Batal check-in</button>
        <button class="btn danger" id="pdel">${icon('trash', 16)} Padam peserta</button>
      </div>`);
    s.querySelector('#pcopy').onclick = () => copyText(url);
    s.querySelector('#pwa')?.addEventListener('click', (e) => {
      if (missing.length) { e.preventDefault(); toast('Lengkapkan butiran program dahulu (' + missing.join(', ') + ')', 'error'); return; }
      stampSent(p);
    });
    s.querySelectorAll('[data-undo]').forEach((b) => (b.onclick = () => busy(b, async () => {
      try { await must(sb.rpc('gt_undo', { p_person: p.id, p_item: b.dataset.undo })); toast(`${b.dataset.undo} dibatalkan`); reload(); } catch (err) { fail(err); }
    })));
    s.querySelector('#preset').onclick = async () => {
      if (!(await confirmSheet('Batal check-in?', `Rekod hadir dan semua barang yang diambil oleh ${p.name} akan dibatalkan.`, 'Batal check-in', true))) return;
      try { await must(sb.rpc('gt_undo', { p_person: p.id, p_item: null })); toast('Check-in dibatalkan'); reload(); } catch (err) { fail(err); }
    };
    s.querySelector('#pdel').onclick = async () => {
      if (!(await confirmSheet('Padam peserta?', `${p.name} (${p.code}) dan rekodnya akan dipadam. Pautan QR peserta ini tidak lagi sah.`, 'Padam', true))) return;
      try { await must(sb.from('gathering_people').delete().eq('id', p.id)); toast('Peserta dipadam'); reload(); } catch (err) { fail(err); }
    };
    s.querySelector('#pef').onsubmit = (e) => {
      e.preventDefault();
      busy(e.target.querySelector('button'), async () => {
        try { await must(sb.from('gathering_people').update(formRow(e.target)).eq('id', p.id)); closeSheet(); toast('Disimpan'); reload(); } catch (err) { fail(err); }
      });
    };
  }

  // ---------- WhatsApp satu persatu ----------
  document.getElementById('wasend').onclick = () => {
    if (missing.length) {
      openSheet(`<h2>Butiran belum lengkap</h2><p class="muted" style="margin:0">Sila isi ${esc(missing.join(', '))} dahulu supaya mesej kepada peserta lengkap.</p><button class="btn block" id="goedit">Isi butiran</button>`);
      document.getElementById('goedit').onclick = () => { closeSheet(); document.getElementById('gedit').click(); };
      return;
    }
    const queue = pendingWa();
    let i = 0;
    const step = () => {
      if (i >= queue.length) {
        openSheet(`<div class="card row" style="background:var(--green-soft);color:var(--green);gap:10px">${icon('check', 22)}<b>Selesai. Semua peserta dalam senarai telah dihantar.</b></div><button class="btn block" id="wdone">Tutup</button>`);
        document.getElementById('wdone').onclick = () => { closeSheet(); reload(); };
        return;
      }
      const p = queue[i];
      const msg = msgFor(p);
      const s = openSheet(`<div class="row between"><h2 style="margin:0">Hantar WhatsApp</h2><span class="badge gray">${i + 1} / ${queue.length}</span></div>
        <div class="ci-progress"><i style="width:${Math.round((i / queue.length) * 100)}%"></i></div>
        <div class="card stack" style="background:var(--card-2);gap:4px"><b style="font-size:18px">${esc(p.name)}</b><span class="small muted">${esc(p.code)} · ${esc(p.phone)}${p.plate ? ' · ' + esc(p.plate) : ''}${partnersOf(p).length ? ' · + pasangan ' + partnersOf(p).map((x) => esc(x.name)).join(', ') : ''}</span></div>
        <div class="ci-msg">${esc(msg)}</div>
        <a class="btn block" id="wgo" href="${esc(waLink(p.phone, msg))}" target="_blank" rel="noopener">${icon('wa', 18)} Buka WhatsApp ${esc(p.name.split(' ')[0])}</a>
        <div class="grid2"><button class="btn ghost" id="wskip">Langkau</button><button class="btn ghost" id="wstop">Berhenti</button></div>
        <div class="small muted">Tekan butang hijau, tekan <b>Send</b> dalam WhatsApp, kemudian kembali ke apps ini untuk peserta seterusnya.</div>`);
      s.querySelector('#wgo').onclick = () => { stampSent(p); i++; setTimeout(step, 600); };
      s.querySelector('#wskip').onclick = () => { i++; step(); };
      s.querySelector('#wstop').onclick = () => { closeSheet(); reload(); };
    };
    step();
  };

  // ---------- Excel ----------
  document.getElementById('ptpl').onclick = (e) => busy(e.currentTarget, async () => {
    try {
      const XLSX = await loadLib('XLSX');
      const ws = XLSX.utils.aoa_to_sheet([
        ['Nama', 'No. Telefon', 'No. Plat', 'Saiz Baju', 'Kategori', 'Nama Pasangan', 'Saiz Baju Pasangan', 'Nota'],
        ['Ahmad bin Ali', '0123456789', 'PKA 1234', 'L', 'RT1300', 'Siti binti Abu', 'M', ''],
        ['Lim Wei Jie', '0198765432', 'PKB 88', 'XL', 'RTAC', 'Solo', '', '']
      ]);
      ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 28 }, { wch: 18 }, { wch: 24 }];
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Peserta');
      downloadBlob(new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'Templat peserta.xlsx');
    } catch (err) { fail(err); }
  });
  document.getElementById('pimport').onclick = () => importSheet(g, people, reload);
  document.getElementById('gexport').onclick = (e) => busy(e.currentTarget, async () => {
    try { const name = await exportExcel(g, people, handovers); toast('Excel dimuat turun: ' + name); } catch (err) { fail(err); }
  });
  document.getElementById('gpurge').onclick = () => purgeSheet(g, people.length, handovers.length);

  // ---------- Akaun krew ----------
  document.getElementById('ccopy').onclick = (e) => { e.preventDefault(); copyText(crewUrl()); };
  document.getElementById('cstaff').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    busy(f.querySelector('button[type=submit]'), async () => {
      try {
        const code = await must(sb.rpc('admin_set_crew_account', { p_code: f.code.value, p_password: f.pw.value }));
        const text = `Krew kaunter ${APP_NAME}\nID: ${code}\nKata laluan: ${f.pw.value}\nLog masuk: ${crewUrl()}`;
        openSheet(`<h2>Akaun krew kaunter</h2>
          <div class="card stack" style="background:var(--card-2)"><div>ID: <b>${esc(code)}</b></div><div>Kata laluan: <b>${esc(f.pw.value)}</b></div><div class="small" style="word-break:break-all">Log masuk di: ${esc(crewUrl())}</div></div>
          <div class="small muted">Simpan maklumat ini. Kata laluan tidak dipaparkan lagi selepas ditutup.</div>
          <button class="btn block" id="cpy">Salin maklumat</button><button class="btn ghost block" id="cls">Tutup</button>`);
        document.getElementById('cpy').onclick = () => copyText(text, 'Maklumat disalin');
        document.getElementById('cls').onclick = () => { closeSheet(); reload(); };
      } catch (err) { fail(err); }
    });
  };
}

// Supabase hadkan 1000 baris setiap permintaan: ambil berperingkat
async function fetchAll(q) {
  const out = []; const size = 1000;
  for (let from = 0; ; from += size) {
    const rows = await must(q.range(from, from + size - 1));
    out.push(...rows);
    if (rows.length < size) return out;
  }
}

// ---------- Import Excel / CSV ----------
// Kenal pasti lajur ikut tajuk (BM / English). Lajur lain yang berguna (cth Nickname, Bayaran)
// disimpan dalam Nota supaya krew kaunter nampak.
const normHead = (h) => String(h || '').toLowerCase().replace(/[:\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
const HEAD = {
  partner: /pasangan|partner|spouse|isteri|suami/,
  phone: /tel|phone|hp|fon|whatsapp|mobile/,
  plate: /plat|plet|plate|registration|pendaftaran|kenderaan|vehicle/,
  size: /saiz|size|baju|shirt|jersi|jersey/,
  category: /kategori|category|jenis|peranan|rider|pillion|role|model/,
  note: /^(nota|catatan|note|remark)/,
  name: /^(nama|name)\b|nama penuh|full name/
};
const SKIP = /^(bil|no|no\.|#)$|e-?mail|e-?mel|tarikh|date|masa|timestamp|status kehadiran|attendance|^column\s*\d+$/;
const KEYS = ['partner', 'phone', 'plate', 'size', 'category', 'note', 'name'];

function mapHeaders(headers) {
  const map = {}; const sizes = []; const extra = [];
  headers.forEach((h, i) => {
    const t = normHead(h);
    if (!t) return;
    if (HEAD.size.test(t) && !HEAD.partner.test(t)) { sizes.push(i); return; }
    const k = KEYS.find((key) => key !== 'size' && !(key in map) && HEAD[key].test(t));
    if (k) map[k] = i;
    else if (!SKIP.test(t)) extra.push([i, String(h).replace(/[:\n\r]+/g, ' ').replace(/\s+/g, ' ').trim()]);
  });
  // Dua lajur saiz: yang selepas lajur "Nama Pasangan" ialah saiz pasangan
  if (sizes.length) {
    const ps = 'partner' in map && sizes.length > 1 ? sizes.find((i) => i > map.partner) : undefined;
    if (ps !== undefined) map.partner_size = ps;
    map.size = sizes.find((i) => i !== ps);
    sizes.filter((i) => i !== map.size && i !== ps).forEach((i) => extra.push([i, String(headers[i]).trim()]));
  }
  return { map, extra };
}
// Baris tajuk = baris (dalam 15 baris pertama) yang paling banyak tajuk dikenali & ada lajur Nama
function findHeaderRow(aoa) {
  let best = -1, score = 0;
  aoa.slice(0, 15).forEach((r, i) => {
    const heads = r.map(normHead);
    if (!heads.some((t) => HEAD.name.test(t))) return;
    const n = heads.filter((t) => t && Object.values(HEAD).some((re) => re.test(t))).length;
    if (n > score) { score = n; best = i; }
  });
  return best;
}
// No. telefon dari Excel selalu hilang 0 di depan (cth 193572621 → 0193572621)
function cleanPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('60')) d = '0' + d.slice(2);
  if (/^1\d{7,9}$/.test(d)) d = '0' + d;
  return d;
}
const noPartner = (s) => !s || /^(solo|tiada|tidak|none|nil|no|-+|n\/?a)$/i.test(s.trim());

function importSheet(g, existing, reload) {
  const s = openSheet(`<h2>Import senarai peserta</h2>
    <p class="small muted" style="margin:0">Pilih fail Excel (.xlsx) atau CSV. Sistem cari baris tajuk sendiri (boleh ada tajuk program di atas). Lajur dikenali: <b>Nama, No. Telefon, No. Plat, Saiz Baju, Nama Pasangan, Saiz Baju Pasangan, Kategori / Model</b>. Lajur lain (cth Nickname, Bayaran) disimpan dalam Nota. Hanya lajur Nama yang wajib.</p>
    <label class="btn ghost block" style="cursor:pointer">${icon('upload', 18)} Pilih fail<input type="file" id="ifile" accept=".xlsx,.xls,.csv" hidden></label>
    <div id="iprev"></div>`);
  s.querySelector('#ifile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const prev = s.querySelector('#iprev');
    prev.innerHTML = '<div class="small muted">Membaca fail…</div>';
    try {
      const XLSX = await loadLib('XLSX');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      // Helaian pertama yang ada lajur Nama
      let aoa = [], hi = -1;
      for (const n of wb.SheetNames) {
        aoa = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: false });
        hi = findHeaderRow(aoa);
        if (hi >= 0) break;
      }
      if (hi < 0) throw new Error('Lajur "Nama" tidak dijumpai. Pastikan ada baris tajuk dengan perkataan "Nama".');
      const { map, extra } = mapHeaders(aoa[hi]);
      const seen = new Set(existing.map((p) => (p.name.toLowerCase() + '|' + p.phone)));
      let dup = 0, nPartner = 0;
      const out = [];   // senarai rata: rider diikuti pasangan (supaya ID berturutan)
      const cell = (r, i) => (i === undefined ? '' : String(r[i] ?? '').replace(/\s+/g, ' ').trim());
      for (const r of aoa.slice(hi + 1)) {
        const name = cell(r, map.name);
        if (name.length < 2 || /^(jumlah|total)\b/i.test(name)) continue;
        const phone = cleanPhone(cell(r, map.phone));
        const k = name.toLowerCase() + '|' + phone;
        if (seen.has(k)) { dup++; continue; }
        seen.add(k);
        const notes = [cell(r, map.note), ...extra.map(([i, h]) => { const v = cell(r, i); return v ? `${h}: ${v}` : ''; })].filter(Boolean);
        const main = { id: crypto.randomUUID(), name, phone, plate: cell(r, map.plate), size: cell(r, map.size).toUpperCase(), category: cell(r, map.category), note: notes.join(' · ').slice(0, 300), parent_id: null };
        out.push(main);
        const pn = cell(r, map.partner);
        if (!noPartner(pn) && pn.length >= 2) {
          out.push({ id: crypto.randomUUID(), name: pn, phone, plate: main.plate, size: cell(r, map.partner_size).toUpperCase(), category: 'Pasangan', note: `Pasangan kepada ${name}`, parent_id: main.id });
          nPartner++;
        }
      }
      const nMain = out.length - nPartner;
      const label = { name: 'Nama', phone: 'Telefon', plate: 'No. plat', size: 'Saiz baju', partner: 'Nama pasangan', partner_size: 'Saiz pasangan', category: 'Kategori / model' };
      prev.innerHTML = `<div class="card stack" style="background:var(--card-2)">
          <b>${nMain} peserta${nPartner ? ` + ${nPartner} pasangan = ${out.length} orang` : ''}${dup ? ` <span class="small muted">· ${dup} sudah ada / berulang (dilangkau)</span>` : ''}</b>
          <div class="small" style="line-height:2">Baris tajuk: baris ${hi + 1}. Lajur dikesan: ${Object.keys(label).filter((k) => map[k] !== undefined).map((k) => `<span class="badge green">${label[k]}</span>`).join(' ')} ${['phone', 'plate', 'size'].filter((k) => map[k] === undefined).map((k) => `<span class="badge gray">${label[k]} tiada</span>`).join(' ')}${extra.length ? `<br>Masuk ke Nota: ${extra.map(([, h]) => `<span class="badge gray">${esc(h)}</span>`).join(' ')}` : ''}</div>
          <div class="ci-table"><table><tr><th>Nama</th><th>Telefon</th><th>Plat</th><th>Saiz</th><th>Kategori</th></tr>${out.slice(0, 8).map((r) => `<tr${r.parent_id ? ' style="color:var(--muted)"' : ''}><td>${r.parent_id ? '↳ ' : ''}${esc(r.name)}</td><td>${esc(r.phone)}</td><td>${esc(r.plate)}</td><td>${esc(r.size)}</td><td>${esc(r.category)}</td></tr>`).join('')}</table></div>
          ${out.length > 8 ? `<span class="small muted">… dan ${out.length - 8} lagi</span>` : ''}
          ${nPartner ? '<span class="small muted">Setiap pasangan dapat ID & QR sendiri. Mesej WhatsApp dihantar ke no. telefon rider, siap dengan tiket pasangan.</span>' : ''}
        </div>
        <button class="btn block" id="igo"${out.length ? '' : ' disabled'}>Masukkan ${out.length} orang</button>`;
      prev.querySelector('#igo').onclick = (ev) => { const btn = ev.currentTarget; busy(btn, async () => {
        try {
          for (let i = 0; i < out.length; i += 100) {
            let chunk = out.slice(i, i + 100);
            // Pastikan rider & pasangan dalam kumpulan yang sama
            if (chunk.length && i + 100 < out.length && out[i + 100].parent_id) chunk = out.slice(i, i + 101);
            await must(sb.from('gathering_people').insert(chunk.map((r) => ({ gathering_id: g.id, code: '', ...r }))));
            if (chunk.length === 101) i++;
            btn.textContent = `Memasukkan… ${Math.min(i + 100, out.length)} / ${out.length}`;
          }
          closeSheet(); toast(`${out.length} orang dimasukkan`); reload();
        } catch (err) { fail(err); }
      }); };
    } catch (err) { prev.innerHTML = ''; fail(err); }
  };
}

async function exportExcel(g, people, handovers) {
  const XLSX = await loadLib('XLSX');
  const items = g.items || [];
  const byP = handovers.reduce((a, h) => { (a[h.person_id] ||= {})[h.item] = h; return a; }, {});
  const pById = Object.fromEntries(people.map((p) => [p.id, p]));
  const rows = people.map((p) => {
    const r = {
      ID: p.code, Nama: p.name, 'No. Telefon': p.phone, 'No. Plat': p.plate, Saiz: p.size, Kategori: p.category, Nota: p.note,
      'Pasangan kepada': p.parent_id && pById[p.parent_id] ? `${pById[p.parent_id].code} ${pById[p.parent_id].name}` : '',
      'Walk-in': p.walkin ? 'Ya' : '', 'WhatsApp dihantar': p.wa_sent_at ? fmtDateTime(p.wa_sent_at) : '',
      Hadir: p.checked_in_at ? fmtDateTime(p.checked_in_at) : '', Kaunter: p.checked_in_by || ''
    };
    items.forEach((it) => { const h = byP[p.id]?.[it]; r[it] = h ? `${hhmm(h.given_at)} · ${h.given_by}` : ''; });
    return r;
  });
  const log = handovers.map((h) => ({ Masa: fmtDateTime(h.given_at), ID: pById[h.person_id]?.code || '', Nama: pById[h.person_id]?.name || '', Barang: h.item, Kaunter: h.given_by }));
  const hadir = people.filter((p) => p.checked_in_at).length;
  const sum = [
    ['Program', g.name], ['Tarikh', g.event_date ? fmtDate(g.event_date) : ''], ['Lokasi', g.venue], ['Dijana', fmtDateTime(new Date().toISOString())], [],
    ['Jumlah peserta', people.length], ['Hadir', hadir], ['Tidak hadir', people.length - hadir], ['Walk-in', people.filter((p) => p.walkin).length], [],
    ['Barang', 'Diserah', 'Baki belum ambil'], ...items.map((it) => [it, handovers.filter((h) => h.item === it).length, people.length - handovers.filter((h) => h.item === it).length]), [],
    ['Saiz baju', 'Peserta', 'Hadir'], ...Object.entries(people.reduce((a, p) => { const k = p.size || '(tiada)'; (a[k] ||= [0, 0])[0]++; if (p.checked_in_at) a[k][1]++; return a; }, {})).sort().map(([k, [n, h]]) => [k, n, h])
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), 'Ringkasan');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Peserta');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(log.length ? log : [{ Masa: '', ID: '', Nama: '', Barang: '', Kaunter: '' }]), 'Log serahan');
  const name = safeName(`Kehadiran ${g.name} ${new Date().toISOString().slice(0, 10)}`) + '.xlsx';
  downloadBlob(new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
  return name;
}

function purgeSheet(g, nP, nH) {
  const s = openSheet(`<h2 style="color:var(--red)">Padam program ini?</h2>
    <p class="small" style="margin:0"><b>${esc(g.name)}</b>, ${nP} peserta dan ${nH} rekod serahan akan dipadam kekal. Pautan QR peserta tidak lagi sah. Pastikan Excel sudah dimuat turun.</p>
    <form id="pf" class="stack">
      <label class="field">Taip nama program untuk sahkan<input class="input" name="n" id="gp-n" autocomplete="off" placeholder="${esc(g.name)}" required></label>
      <button class="btn danger block" type="submit" disabled>${icon('trash', 18)} Padam semua</button>
      <button class="btn ghost block" type="button" id="pc">Batal</button>
    </form>`);
  const f = s.querySelector('#pf'), btn = f.querySelector('button[type=submit]');
  f.n.oninput = () => { btn.disabled = f.n.value.trim() !== g.name.trim(); };
  s.querySelector('#pc').onclick = closeSheet;
  f.onsubmit = (e) => {
    e.preventDefault();
    busy(btn, async () => {
      try { const r = await must(sb.rpc('admin_purge_gathering', { p_gathering: g.id, p_confirm: f.n.value.trim() })); closeSheet(); toast(`Dipadam: ${r.people} peserta, ${r.handovers} rekod serahan`); go('#/a/kehadiran'); }
      catch (err) { fail(err); }
    });
  };
}

// =============================================================
// PESERTA: tiket QR  #/t/:token
// =============================================================
export async function ticketView({ token }) {
  loading();
  let t = null;
  try { t = await must(sb.rpc('gt_ticket', { p_token: token })); } catch { t = null; }
  const shell = (inner) => render(`<div class="lucky-page"><div class="lucky-card">
    <img src="assets/logo.jpg" alt="${esc(APP_NAME)}" class="lucky-logo">
    <div class="lucky-eyebrow">TIKET PESERTA</div>${inner}</div></div>`);
  if (!t) return shell('<h1>Tiket tidak dijumpai</h1><p class="lucky-sub">Pautan ini tidak sah atau program telah tamat. Sila hubungi penganjur.</p>');
  const url = ticketUrl(token);
  const when = [t.event_date ? fmtDate(t.event_date) : '', t.event_time].filter(Boolean).join(' · ');
  shell(`<h1>${esc(t.program)}</h1>
    <p class="lucky-sub">${esc([when, t.venue].filter(Boolean).join(' · '))}</p>
    <div class="tk-card">
      <div class="tk-qr">${qrSvg(url, 260)}</div>
      <div class="tk-code">${esc(t.code)}</div>
      <div class="tk-name">${esc(t.name)}</div>
      <div class="tk-meta">${[t.plate && `<span>No. plat <b>${esc(t.plate)}</b></span>`, t.size && `<span>Saiz baju <b>${esc(t.size)}</b></span>`, t.category && `<span><b>${esc(t.category)}</b></span>`].filter(Boolean).join('')}</div>
      ${(t.with || []).length ? `<div class="tk-with">Datang bersama: <b>${t.with.map((w) => esc(w.name) + ' (' + esc(w.code) + ')').join(', ')}</b></div>` : ''}
      ${t.checked_in_at ? `<div class="tk-done">${icon('check', 18)} Sudah check-in · ${esc(fmtDateTime(t.checked_in_at))}</div>` : ''}
    </div>
    <button class="btn block" id="tsave" style="background:linear-gradient(135deg,#F5C542,#D99A1E);color:#1a1205;border:0">${DL} Simpan gambar tiket</button>
    <p class="lucky-sub" style="text-align:center">Tunjukkan QR ini di kaunter pendaftaran. Simpan gambar tiket sekarang kerana liputan internet dalam dewan mungkin lemah.</p>
    ${t.info ? `<div class="lucky-from" style="white-space:pre-line">${esc(t.info)}</div>` : ''}`);
  document.getElementById('tsave').onclick = (e) => busy(e.currentTarget, async () => {
    downloadBlob(await ticketPng(t, url), safeName(`Tiket ${t.code} ${t.name}`) + '.png');
  });
}

async function ticketPng(t, url) {
  const W = 900, H = 1400;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2b2110'); g.addColorStop(1, '#000');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.textAlign = 'center';
  x.fillStyle = '#F5C542'; x.font = '800 30px system-ui, Arial'; x.fillText('TIKET PESERTA', W / 2, 90);
  x.fillStyle = '#fff'; x.font = '800 50px system-ui, Arial';
  let y = 160; for (const l of fitLines(x, t.program, W - 120).slice(0, 2)) { x.fillText(l, W / 2, y); y += 60; }
  x.fillStyle = '#cbbd9c'; x.font = '500 28px system-ui, Arial';
  x.fillText([t.event_date ? fmtDate(t.event_date) : '', t.event_time, t.venue].filter(Boolean).join(' · ').slice(0, 60), W / 2, y + 4);
  const qs = 540, qx = (W - qs) / 2, qy = y + 70;
  x.fillStyle = '#fff'; roundRect(x, qx - 30, qy - 30, qs + 60, qs + 60, 28); x.fill();
  drawQr(x, url, qx, qy, qs);
  y = qy + qs + 110;
  x.fillStyle = '#F5C542'; x.font = '800 76px system-ui, Arial'; x.fillText(t.code, W / 2, y);
  x.fillStyle = '#fff'; x.font = '700 44px system-ui, Arial'; y += 70;
  for (const l of fitLines(x, t.name, W - 100).slice(0, 2)) { x.fillText(l, W / 2, y); y += 54; }
  x.fillStyle = '#e9dcc0'; x.font = '600 32px system-ui, Arial';
  x.fillText([t.plate && 'No. plat ' + t.plate, t.size && 'Saiz ' + t.size].filter(Boolean).join('   ·   '), W / 2, y + 10);
  x.fillStyle = '#8f8064'; x.font = '500 24px system-ui, Arial'; x.fillText(`${APP_NAME} · Tunjukkan di kaunter pendaftaran`, W / 2, H - 50);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
function roundRect(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
function fitLines(x, text, max) {
  const words = String(text || '').split(/\s+/); const out = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (x.measureText(t).width <= max || !cur) cur = t; else { out.push(cur); cur = w; } }
  if (cur) out.push(cur);
  return out;
}

// =============================================================
// KREW: log masuk  #/kaunter/masuk
// =============================================================
export function crewLoginView() {
  if (state.session && ['crew', 'admin'].includes(state.profile?.role)) return go('#/kaunter');
  render(`<div class="lucky-page"><div class="lucky-card">
    <img src="assets/logo.jpg" alt="${esc(APP_NAME)}" class="lucky-logo">
    <div class="lucky-eyebrow">KAUNTER PENDAFTARAN</div>
    <h1>Log masuk krew</h1>
    <p class="lucky-sub">Gunakan ID dan kata laluan krew kaunter yang diberi oleh admin.</p>
    <form id="kf" class="lucky-form">
      <label>ID krew<input name="id" id="kl-id" required autocapitalize="none" autocomplete="username" placeholder="Cth: KAUNTER"></label>
      <label>Kata laluan<input name="password" id="kl-pw" type="password" required minlength="6" autocomplete="current-password"></label>
      <button class="btn block" type="submit">Masuk ke kaunter</button>
    </form></div></div>`);
  const f = document.getElementById('kf');
  f.onsubmit = async (e) => {
    e.preventDefault();
    await busy(f.querySelector('button'), async () => {
      try {
        const { toLoginEmail } = await import('./views-auth.js');
        save('afterLogin', '#/kaunter');
        const { error } = await sb.auth.signInWithPassword({ email: toLoginEmail(f.id.value), password: f.password.value });
        if (error) throw new Error(/invalid/i.test(error.message) ? 'ID atau kata laluan salah.' : error.message);
      } catch (err) { save('afterLogin', ''); fail(err); }
    });
  };
}

// =============================================================
// KREW / ADMIN: skrin kaunter  #/kaunter
// =============================================================
let scan = null;
export function clearCheckinTimers() { stopScan(); }
function stopScan() {
  if (!scan) return;
  scan.stopped = true;
  clearTimeout(scan.timer);
  scan.stream?.getTracks().forEach((t) => t.stop());
  scan.el?.remove();
  scan = null;
}

function feedback(ok) {
  navigator.vibrate?.(ok ? 60 : [200, 80, 200]);
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    (ok ? [1046, 1568] : [220, 180]).forEach((f, i) => {
      const o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = ok ? 'sine' : 'square'; o.frequency.value = f; o.connect(gn); gn.connect(ctx.destination);
      const t = ctx.currentTime + i * (ok ? 0.1 : 0.22);
      gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(ok ? 0.2 : 0.12, t + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t + (ok ? 0.12 : 0.2));
      o.start(t); o.stop(t + 0.25);
    });
  } catch {}
}

async function openScanner(onText) {
  stopScan();
  const el = document.createElement('div');
  el.className = 'kt-scan';
  el.innerHTML = `<video playsinline muted autoplay></video><div class="kt-frame"></div>
    <div class="kt-scan-top"><b>Halakan kamera ke kod QR peserta</b><button class="kt-x" aria-label="Tutup kamera">${icon('x', 24)}</button></div>
    <div class="kt-scan-msg" aria-live="polite">Membuka kamera…</div>`;
  document.body.appendChild(el);
  scan = { el, stopped: false };
  const me = scan;
  el.querySelector('.kt-x').onclick = stopScan;
  const msg = (t) => { const m = el.querySelector('.kt-scan-msg'); if (m) m.textContent = t; };
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Kamera tidak disokong pada browser ini. Gunakan carian nama / no. plat.');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    if (me.stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
    me.stream = stream;
    const video = el.querySelector('video');
    video.srcObject = stream;
    await video.play().catch(() => {});
    let detect;
    if ('BarcodeDetector' in window && (await window.BarcodeDetector.getSupportedFormats?.().catch(() => []) || []).includes('qr_code')) {
      const bd = new window.BarcodeDetector({ formats: ['qr_code'] });
      detect = async () => (await bd.detect(video))[0]?.rawValue || '';
    } else {
      msg('Memuatkan pengimbas…');
      const jsQR = await loadScanLib();
      const cv = document.createElement('canvas'); const cx = cv.getContext('2d', { willReadFrequently: true });
      detect = async () => {
        const w = video.videoWidth, h = video.videoHeight;
        if (!w) return '';
        const s = Math.min(1, 640 / Math.max(w, h)); cv.width = Math.round(w * s); cv.height = Math.round(h * s);
        cx.drawImage(video, 0, 0, cv.width, cv.height);
        const img = cx.getImageData(0, 0, cv.width, cv.height);
        return jsQR(img.data, cv.width, cv.height, { inversionAttempts: 'dontInvert' })?.data || '';
      };
    }
    msg('Mengimbas…');
    const loop = async () => {
      if (me.stopped) return;
      let text = '';
      try { text = await detect(); } catch {}
      if (me.stopped) return;
      if (text) { stopScan(); onText(text); return; }
      me.timer = setTimeout(loop, 120);
    };
    loop();
  } catch (err) {
    msg(/Permission|NotAllowed/i.test(err.name + err.message) ? 'Akses kamera ditolak. Benarkan kamera dalam tetapan browser, atau gunakan carian.' : errMsgSafe(err));
  }
}
const errMsgSafe = (e) => (e && e.message) || String(e);
function loadScanLib() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
    s.onload = () => (window.jsQR ? res(window.jsQR) : rej(new Error('Pengimbas gagal dimuatkan')));
    s.onerror = () => rej(new Error('Tiada internet: pengimbas QR gagal dimuatkan. Gunakan carian.'));
    document.head.appendChild(s);
  });
}

export async function crewConsoleView(params, query) {
  loading();
  const list = await must(sb.from('gatherings').select('*').order('created_at', { ascending: false }));
  const admin = state.profile.role === 'admin';
  const out = async () => { stopScan(); if (admin) return go('#/a/kehadiran'); await sb.auth.signOut(); go('#/kaunter/masuk'); };
  if (!list.length) {
    render(`<div class="kt-page"><div class="kt-empty"><b>Belum ada program</b><span>Admin perlu cipta program dahulu.</span><button class="btn ghost" id="kout">${admin ? 'Kembali' : 'Log keluar'}</button></div></div>`);
    document.getElementById('kout').onclick = out;
    return;
  }
  let g = list.find((x) => x.id === query.get('g')) || list.find((x) => x.id === load('ktGathering')) || list.find((x) => x.is_open) || list[0];
  save('ktGathering', g.id);
  let counter = load('ktCounter') || '';
  let current = null;     // peserta yang sedang dipaparkan
  let notice = null;      // { kind: 'ok'|'warn'|'err', text }
  const items = g.items || [];

  const stats = async () => {
    const [{ count: total }, { count: hadir }] = await Promise.all([
      sb.from('gathering_people').select('id', { count: 'exact', head: true }).eq('gathering_id', g.id),
      sb.from('gathering_people').select('id', { count: 'exact', head: true }).eq('gathering_id', g.id).not('checked_in_at', 'is', null)
    ]);
    const el = document.getElementById('kstat');
    if (el) el.innerHTML = `<b>${hadir || 0}</b> / ${total || 0} hadir`;
  };

  const shell = () => {
    render(`<div class="kt-page">
      <header class="kt-top">
        <img src="assets/logo.jpg" alt="" class="kt-logo">
        <div class="kt-title">
          ${list.length > 1 ? `<select id="kg" class="kt-select" aria-label="Pilih program">${list.map((x) => `<option value="${x.id}"${x.id === g.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : `<b>${esc(g.name)}</b>`}
          <span class="kt-stat" id="kstat">…</span>
        </div>
        <button class="kt-ghost" id="kout" aria-label="${admin ? 'Kembali ke admin' : 'Log keluar'}">${icon(admin ? 'back' : 'logout', 20)}</button>
      </header>
      ${g.is_open ? '' : '<div class="kt-closed">Kaunter program ini DITUTUP oleh admin. Rekod baru tidak diterima.</div>'}
      <div class="kt-counter"><label for="kc">Kaunter</label><input id="kc" value="${esc(counter)}" placeholder="Cth: Kaunter 1" maxlength="30"></div>
      <button class="kt-scan-btn" id="kscan">${icon('grid', 28)}<span>IMBAS QR</span></button>
      <form class="kt-search" id="ksf"><input id="kq" name="q" placeholder="Cari nama / ID / no. plat / telefon" autocomplete="off" enterkeyhint="search"><button aria-label="Cari">${icon('check', 20)}</button></form>
      <div id="kres" aria-live="polite"></div>
      <button class="kt-walkin" id="kwalk">${icon('plus', 16)} Peserta walk-in (tiada dalam senarai)</button>
    </div>`);
    document.getElementById('kg')?.addEventListener('change', (e) => go('#/kaunter?g=' + e.target.value));
    document.getElementById('kout').onclick = out;
    document.getElementById('kc').oninput = (e) => { counter = e.target.value.trim(); save('ktCounter', counter); };
    document.getElementById('kscan').onclick = () => openScanner(onScan);
    document.getElementById('ksf').onsubmit = (e) => { e.preventDefault(); search(e.target.q.value); };
    document.getElementById('kwalk').onclick = walkin;
    stats();
  };

  const draw = async () => {
    const el = document.getElementById('kres');
    if (!el) return;
    if (!current) { el.innerHTML = notice ? `<div class="kt-note ${notice.kind}">${esc(notice.text)}</div>` : ''; return; }
    const p = current;
    const [hs, mateRows] = await Promise.all([
      must(sb.from('gathering_handovers').select('*').eq('person_id', p.id)),
      must(sb.from('gathering_people').select('*').eq('gathering_id', g.id).or(`parent_id.eq.${p.id}${p.parent_id ? `,id.eq.${p.parent_id},parent_id.eq.${p.parent_id}` : ''}`).neq('id', p.id).order('code'))
    ]);
    const mates = mateRows.filter((m) => m.id !== p.id && (m.parent_id === p.id || m.id === p.parent_id || (p.parent_id && m.parent_id === p.parent_id)));
    const left = items.filter((it) => !hs.some((h) => h.item === it));
    const status = p.checked_in_at
      ? `<div class="kt-status in">${icon('check', 22)} SUDAH CHECK-IN · ${esc(hhmm(p.checked_in_at))} · ${esc(p.checked_in_by || '')}</div>`
      : `<div class="kt-status ok">${icon('user', 22)} BERDAFTAR · BELUM CHECK-IN</div>`;
    el.innerHTML = `${notice ? `<div class="kt-note ${notice.kind}">${esc(notice.text)}</div>` : ''}
      <div class="kt-person">
        ${status}
        <div class="kt-pcode">${esc(p.code)}${p.walkin ? ' <span class="badge amber">Walk-in</span>' : ''}</div>
        <div class="kt-pname">${esc(p.name)}</div>
        <div class="kt-pmeta">
          ${p.size ? `<span class="kt-size"><small>SAIZ</small>${esc(p.size)}</span>` : ''}
          <span class="kt-info">${[p.plate && `<b>${esc(p.plate)}</b>`, p.category && esc(p.category), p.phone && esc(p.phone)].filter(Boolean).join('<br>') || '—'}</span>
        </div>
        ${p.note ? `<div class="kt-pnote">${esc(p.note)}</div>` : ''}
        ${mates.length ? `<div class="kt-mates"><small>DATANG BERSAMA</small>${mates.map((m) => `<button class="kt-mate" data-mate="${m.id}"><b>${esc(m.code)}</b><span>${esc(m.name)}${m.size ? ' · Saiz ' + esc(m.size) : ''}</span><em>${m.checked_in_at ? icon('check', 14) + ' Hadir' : 'Buka →'}</em></button>`).join('')}</div>` : ''}
        ${items.length ? `<div class="kt-items">${items.map((it) => {
          const h = hs.find((x) => x.item === it);
          return h ? `<div class="kt-item done"><span>${icon('check', 18)} ${esc(it)}</span><small>Diambil ${esc(hhmm(h.given_at))} · ${esc(h.given_by)}</small></div>`
            : `<button class="kt-item" data-give="${esc(it)}"><span>${esc(it)}</span><small>Tekan untuk serah</small></button>`;
        }).join('')}</div>` : ''}
        ${!p.checked_in_at || left.length
          ? `<button class="kt-go" id="kall">${items.length ? (left.length === items.length ? 'SAHKAN HADIR & SERAH SEMUA' : `SERAH BAKI (${left.length})`) : 'SAHKAN KEHADIRAN'}</button>`
          : '<div class="kt-complete">Lengkap. Semua barang telah diambil.</div>'}
        <button class="kt-next" id="knext">${icon('grid', 18)} Imbas peserta seterusnya</button>
      </div>`;
    el.querySelectorAll('[data-give]').forEach((b) => (b.onclick = () => give([b.dataset.give], b)));
    el.querySelectorAll('[data-mate]').forEach((b) => (b.onclick = () => show(mates.find((m) => m.id === b.dataset.mate), false)));
    document.getElementById('kall')?.addEventListener('click', (e) => give(left, e.currentTarget));
    document.getElementById('knext').onclick = () => { current = null; notice = null; const kq = document.getElementById('kq'); if (kq) kq.value = ''; draw(); openScanner(onScan); };
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  async function give(list, btn) {
    btn.disabled = true;
    try {
      const done = [], already = [];
      if (!current.checked_in_at || !list.length) {
        const r = await must(sb.rpc('gt_checkin', { p_person: current.id, p_counter: counter }));
        if (r.status === 'already' && !list.length) already.push(`check-in (${hhmm(r.at)} · ${r.by})`);
      }
      for (const it of list) {
        const r = await must(sb.rpc('gt_give', { p_person: current.id, p_item: it, p_counter: counter }));
        (r.status === 'ok' ? done : already).push(r.status === 'ok' ? it : `${it} (${hhmm(r.at)} · ${r.by})`);
      }
      current = await must(sb.from('gathering_people').select('*').eq('id', current.id).single());
      if (already.length) { notice = { kind: 'err', text: `SUDAH DIAMBIL SEBELUM INI: ${already.join(', ')}. Jangan serah lagi.` }; feedback(false); }
      else { notice = { kind: 'ok', text: done.length ? `Berjaya diserah: ${done.join(', ')}` : 'Kehadiran disahkan' }; feedback(true); }
      await draw(); stats();
    } catch (err) { feedback(false); fail(err); btn.disabled = false; }
  }

  async function show(p, firstScan) {
    current = p;
    notice = null;
    if (firstScan && p.checked_in_at) { notice = { kind: 'warn', text: `Peserta ini sudah check-in pada ${fmtDateTime(p.checked_in_at)} di ${p.checked_in_by || 'kaunter'}. Semak barang di bawah.` }; feedback(false); }
    else if (firstScan) feedback(true);
    await draw();
  }

  async function onScan(text) {
    const tok = (String(text).match(UUID) || [])[0];
    if (!tok) { notice = { kind: 'err', text: 'Kod QR ini bukan tiket peserta.' }; current = null; feedback(false); return draw(); }
    try {
      const rows = await must(sb.from('gathering_people').select('*').eq('token', tok.toLowerCase()).limit(1));
      if (!rows.length) { current = null; notice = { kind: 'err', text: 'TIDAK BERDAFTAR. Tiket ini tidak wujud atau telah dipadam.' }; feedback(false); return draw(); }
      if (rows[0].gathering_id !== g.id) {
        const other = list.find((x) => x.id === rows[0].gathering_id);
        current = null; notice = { kind: 'err', text: `Tiket ini untuk program lain${other ? ': ' + other.name : ''}.` }; feedback(false); return draw();
      }
      show(rows[0], true);
    } catch (err) { fail(err); }
  }

  async function search(raw) {
    const qv = String(raw || '').trim();
    if (UUID.test(qv)) return onScan(qv);
    const t = qv.replace(/[,()%*\\]/g, ' ').trim();
    if (t.length < 2) return toast('Taip sekurang-kurangnya 2 aksara');
    const plate = t.replace(/\s+/g, '').toUpperCase(), digits = t.replace(/\D/g, '');
    const ors = [`code.eq.${plate}`, `name.ilike.%${t}%`, `plate.ilike.%${plate}%`];
    if (digits.length >= 4) ors.push(`phone.ilike.%${digits.replace(/^60/, '0')}%`);
    try {
      const rows = await must(sb.from('gathering_people').select('*').eq('gathering_id', g.id).or(ors.join(',')).order('code').limit(30));
      if (rows.length === 1) return show(rows[0], true);
      current = null; notice = null;
      const el = document.getElementById('kres');
      if (!rows.length) { notice = { kind: 'err', text: `Tiada peserta "${qv}". Semak ejaan, atau daftar sebagai walk-in.` }; feedback(false); return draw(); }
      el.innerHTML = `<div class="kt-list"><div class="kt-list-h">${rows.length}${rows.length === 30 ? '+' : ''} padanan · pilih peserta</div>${rows.map((p) => `<button class="kt-row" data-k="${p.id}"><b>${esc(p.code)}</b><span><span class="kt-rname">${esc(p.name)}</span><small>${esc([p.plate, p.size && 'Saiz ' + p.size, p.category].filter(Boolean).join(' · '))}</small></span>${p.checked_in_at ? `<em>${icon('check', 14)} ${hhmm(p.checked_in_at)}</em>` : ''}</button>`).join('')}</div>`;
      el.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => show(rows.find((p) => p.id === b.dataset.k), true)));
    } catch (err) { fail(err); }
  }

  function walkin() {
    const s = openSheet(`<h2>Peserta walk-in</h2><p class="small muted" style="margin:0">Untuk peserta yang tiada dalam senarai. Rekod ditanda "Walk-in" untuk semakan admin.</p>
      <form id="wf" class="stack">
        <label class="field">Nama penuh<input class="input" name="name" id="wk-name" required minlength="2" maxlength="80"></label>
        <div class="grid2">
          <label class="field">No. telefon<input class="input" name="phone" id="wk-phone" inputmode="tel" maxlength="20"></label>
          <label class="field">No. plat<input class="input" name="plate" id="wk-plate" maxlength="16" style="text-transform:uppercase"></label>
        </div>
        <label class="field">Saiz baju<input class="input" name="size" id="wk-size" maxlength="10" style="text-transform:uppercase" placeholder="S / M / L / XL"></label>
        <button class="btn block" type="submit">Daftar walk-in</button>
      </form>`);
    s.querySelector('#wf').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      busy(f.querySelector('button'), async () => {
        try {
          const pid = await must(sb.rpc('gt_walkin', { p_gathering: g.id, p_name: f.name.value, p_phone: f.phone.value, p_plate: f.plate.value, p_size: f.size.value.trim().toUpperCase(), p_counter: counter }));
          closeSheet();
          show(await must(sb.from('gathering_people').select('*').eq('id', pid).single()), false);
          notice = { kind: 'ok', text: 'Walk-in didaftarkan. Sahkan kehadiran dan serah barang.' }; draw(); stats();
        } catch (err) { fail(err); }
      });
    };
  }

  shell();
}
