import {
  sb, state, render, loading, esc, icon, rm, fmtRange, fmtDateTime, toast, fail, go, busy, must,
  topbar, nav, lotMap, publicUrl, lightbox, loadSettings, fileExt, confirmSheet, badge, STATUS_BOOKING, openSheet, closeSheet
} from './lib.js';
import { isExpired, leftText } from './views-agreement.js';

let countdownTimer;
export function clearTimers() { clearInterval(countdownTimer); }

// ---------- V1: Pilih tapak (boleh pilih beberapa tapak) ----------
const LIMIT_MSG = (n) => `Untuk memastikan peluang yang adil kepada semua peniaga, setiap vendor hanya boleh menempah maksimum ${n} tapak bagi satu event. Jika anda memerlukan lebih daripada ${n} tapak, sila hantar permohonan kepada penganjur. Penganjur akan menyemak permohonan anda dan memaklumkan keputusannya.`;

export async function pickLotView(params, query) {
  loading();
  const events = await must(sb.from('events').select('*').eq('is_active', true).order('start_date', { ascending: true }));
  if (!events.length) {
    render(`<div class="page">${topbar('Pilih tapak')}<div class="content"><div class="card empty">Tiada event dibuka buat masa ini.<br>Sila semak semula nanti.</div></div>${nav('#/v')}</div>`);
    return;
  }
  const ev = events.find((e) => e.id === query.get('e')) || events[0];
  const [lots, myBookings, statusRows, requests, myAgs] = await Promise.all([
    must(sb.rpc('lots_for_event', { p_event_id: ev.id })),
    must(sb.from('bookings').select('*, lots(code)').eq('event_id', ev.id).eq('vendor_id', state.profile.id)
      .in('status', ['pending_payment', 'pending_verification', 'approved']).order('created_at', { ascending: false })),
    must(sb.rpc('my_lot_status', { p_event: ev.id })),
    must(sb.from('lot_limit_requests').select('*').eq('event_id', ev.id).eq('vendor_id', state.profile.id).order('created_at', { ascending: false }).limit(1)),
    must(sb.from('agreements').select('id,status,deadline,lot_codes').eq('event_id', ev.id).eq('vendor_id', state.profile.id).eq('status', 'pending'))
  ]);
  const st = statusRows[0] || { lot_limit: 3, used: 0, docs_ok: false };
  const limit = st.lot_limit, used = st.used, remaining = Math.max(0, limit - used);
  const req = requests[0];
  const selected = new Set();
  const prices = [...new Set(lots.map((l) => Number(l.price)).filter((p) => p > 0))];
  const priceText = prices.length === 1 ? rm(prices[0]) : prices.length ? `${rm(Math.min(...prices))} – ${rm(Math.max(...prices))}` : '';
  const sizeText = [...new Set(lots.map((l) => l.size))].join(', ');

  // Kumpulkan tempahan aktif ikut status
  const codes = (s) => myBookings.filter((b) => b.status === s).map((b) => esc(b.lots?.code)).join(', ');
  const pendingGroup = myBookings.find((b) => b.status === 'pending_payment');
  let cards = '';
  if (!st.docs_ok) cards += `<a class="card row" href="#/akaun" style="background:var(--accent-soft, var(--red-soft));color:var(--text)">${icon('file', 22)}<div style="flex:1"><b>Dokumen wajib belum lengkap</b><div class="small">Sila muat naik ${state.profile.category === 'makanan' ? 'SSM, kad typhoid dan sijil pengendalian makanan' : 'SSM'} di menu Akaun. Anda masih boleh menempah tapak, tetapi penganjur akan menghubungi anda untuk nasihat jika dokumen tidak dilengkapkan.</div></div></a>`;
  if (pendingGroup) cards += `<div class="card row" style="background:var(--amber-soft)"><div style="flex:1"><b>Tapak ${codes('pending_payment')} ditahan untuk anda</b><div class="small">Sila buat bayaran sebelum masa tamat.</div></div><a class="btn sm" href="#/v/bayar/${pendingGroup.group_id || pendingGroup.id}">Bayar</a></div>`;
  if (codes('pending_verification')) cards += `<div class="card" style="background:var(--amber-soft)"><b>Tapak ${codes('pending_verification')} — menunggu pengesahan</b><div class="small">Resit anda telah diterima. Penganjur akan mengesahkan tempahan selepas semakan.</div></div>`;
  for (const g of myAgs) {
    cards += isExpired(g)
      ? `<a class="card" href="#/perjanjian/${g.id}" style="background:var(--red-soft);color:var(--text)"><b>Masa tandatangan perjanjian lot ${esc(g.lot_codes)} telah tamat</b><div class="small">Sila hubungi penganjur untuk masa tambahan.</div></a>`
      : `<div class="card stack" style="background:var(--green-soft)"><b style="color:var(--green)">Tahniah! Tempahan lot ${esc(g.lot_codes)} diluluskan</b><div class="small">Sila tandatangan perjanjian dalam masa <b data-deadline="${esc(g.deadline)}">${leftText(new Date(g.deadline) - Date.now())}</b> untuk mengesahkan lot atas nama anda.</div><a class="btn" href="#/perjanjian/${g.id}">${icon('edit', 18)} Baca &amp; tandatangan perjanjian</a></div>`;
  }
  const lockedMine = lots.filter((l) => l.is_mine && l.status === 'locked').map((l) => esc(l.code)).join(', ');
  if (lockedMine) cards += `<div class="card row" style="background:var(--green-soft);color:var(--green)">${icon('check', 24)}<div><b>Tapak ${lockedMine} sah atas nama anda</b><div class="small">Perjanjian telah ditandatangani. Jumpa di event nanti!</div></div></div>`;
  if (req?.status === 'pending') cards += `<div class="card small" style="background:var(--card-2)">Permohonan ${req.requested} tapak sedang disemak oleh penganjur.</div>`;
  if (req?.status === 'approved') cards += `<div class="card small" style="background:var(--green-soft);color:var(--green)">Penganjur meluluskan sehingga ${req.approved_limit} tapak untuk anda.</div>`;
  if (req?.status === 'rejected') cards += `<div class="card small" style="background:var(--card-2)">Permohonan tapak tambahan tidak diluluskan. Had anda kekal ${limit} tapak.</div>`;

  const canPick = remaining > 0;

  const draw = () => {
    const sel = lots.filter((l) => selected.has(l.id));
    const total = sel.reduce((a, l) => a + Number(l.price), 0);
    render(`<div class="page">
      ${topbar(ev.name, { sub: `${esc(fmtRange(ev.start_date, ev.end_date))}${ev.location ? ' · ' + esc(ev.location) : ''}`, right: `<button class="icon-btn" id="refresh" aria-label="Muat semula">${icon('refresh')}</button>` })}
      <div class="content" style="padding-bottom:${canPick ? 120 : 20}px">
        ${events.length > 1 ? `<select class="input" id="evsel" aria-label="Pilih event">${events.map((e) => `<option value="${e.id}"${e.id === ev.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</select>` : ''}
        ${cards}
        ${ev.layout_image_path
          ? `<div class="layout-img"><img src="${esc(publicUrl('layouts', ev.layout_image_path))}" alt="Pelan tapak ${esc(ev.name)}" id="layout"></div>`
          : '<div class="layout-empty">' + icon('image', 26) + 'Pelan tapak belum dimuat naik</div>'}
        <div class="row between small"><span class="muted">${sizeText ? 'Saiz ' + esc(sizeText) + ' · ' : ''}${priceText}</span><span><b>${used}</b> / ${limit} tapak digunakan</span></div>
        <div class="legend">
          <span><i class="sw-free"></i>Kosong</span>
          <span><i class="sw-sel"></i>Pilihan / tapak anda</span>
          <span><i class="sw-taken"></i>Tidak tersedia</span>
        </div>
        ${lotMap(lots, { mode: 'vendor', selectedIds: selected })}
        <div class="small muted">Anda boleh pilih sehingga <b>${limit} tapak</b> untuk event ini. <a href="#" id="askmore">Perlukan lebih?</a></div>
      </div>
      ${canPick ? `<div class="action-bar">
        ${sel.length
          ? `<div style="flex:1;min-width:0"><div class="small muted">${sel.length} tapak dipilih</div><div style="font-family:var(--display);font-size:18px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sel.map((l) => esc(l.code)).join(', ')} · ${rm(total)}</div></div><button class="btn" id="go">Teruskan bayar</button>`
          : `<div class="muted" style="flex:1;min-height:50px;display:flex;align-items:center">Klik tapak kosong untuk pilih (baki ${remaining} tapak).</div>`}
      </div>` : nav('#/v')}
    </div>`);
    const img = document.getElementById('layout');
    if (img) img.onclick = () => lightbox(img.src);
    clearInterval(countdownTimer);
    if (document.querySelector('[data-deadline]')) countdownTimer = setInterval(() => {
      document.querySelectorAll('[data-deadline]').forEach((el) => { el.textContent = leftText(new Date(el.dataset.deadline) - Date.now()); });
    }, 1000);
    document.getElementById('refresh').onclick = () => go(location.hash);
    const evsel = document.getElementById('evsel');
    if (evsel) evsel.onchange = () => go('#/v?e=' + evsel.value);
    document.getElementById('askmore').onclick = (e) => { e.preventDefault(); limitSheet(ev, limit, req); };
    document.querySelectorAll('.lot[data-lot]').forEach((b) => {
      b.onclick = () => {
        const l = lots.find((x) => x.id === b.dataset.lot);
        if (!l || l.status !== 'free' || !(Number(l.price) > 0)) return;
        if (selected.has(l.id)) { selected.delete(l.id); return draw(); }
        if (selected.size >= remaining) return limitSheet(ev, limit, req);
        selected.add(l.id); draw();
      };
    });
    const btn = document.getElementById('go');
    if (btn) btn.onclick = () => busy(btn, async () => {
      try {
        const groupId = await must(sb.rpc('reserve_lots', { p_lot_ids: [...selected] }));
        go('#/v/bayar/' + groupId);
      } catch (err) { fail(err); setTimeout(() => go(location.hash), 1500); }
    });
  };
  draw();
}

// Notis had tapak + borang mohon kebenaran penganjur
function limitSheet(ev, limit, req) {
  const pending = req?.status === 'pending';
  const s = openSheet(`<div class="row" style="gap:12px"><span class="code-tile amber" style="min-width:44px">${icon('lock', 20)}</span><h2>Had maksimum ${limit} tapak</h2></div>
    <p style="margin:0;line-height:1.55">${LIMIT_MSG(limit)}</p>
    ${pending ? `<div class="card small" style="background:var(--card-2)">Permohonan anda untuk ${req.requested} tapak sedang disemak oleh penganjur. Sila tunggu makluman.</div>
      <button class="btn ghost block" data-close>Faham</button>` : `
    <form id="lf" class="stack">
      <label class="field">Jumlah tapak yang diperlukan<input class="input" type="number" name="n" min="${limit + 1}" max="50" value="${limit + 1}" required></label>
      <label class="field">Sebab / keterangan<textarea class="input" name="reason" rows="3" placeholder="Cth: Gerai kami besar dan memerlukan 4 tapak bersebelahan (12–15)." required></textarea></label>
      <button class="btn block" type="submit">Hantar permohonan kepada penganjur</button>
      <button class="btn ghost block" type="button" data-close>Tutup</button>
    </form>`}`);
  s.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeSheet));
  const f = s.querySelector('#lf');
  if (f) f.onsubmit = async (e) => {
    e.preventDefault();
    await busy(f.querySelector('button[type=submit]'), async () => {
      try {
        await must(sb.rpc('request_lot_limit', { p_event: ev.id, p_count: +f.n.value, p_reason: f.reason.value }));
        closeSheet(); toast('Permohonan dihantar. Penganjur akan memaklumkan keputusan.'); go('#/v?e=' + ev.id + '&t=' + Date.now());
      } catch (err) { fail(err); }
    });
  };
}

// ---------- V2: Pembayaran untuk satu tempahan (boleh beberapa tapak) ----------
export async function payView({ id }) {
  loading();
  const [byGroup, s] = await Promise.all([
    must(sb.from('bookings').select('*, lots(code,size,price,held_until,status), events(name,start_date,end_date)').or(`group_id.eq.${id},id.eq.${id}`).eq('vendor_id', state.profile.id)),
    loadSettings(true)
  ]);
  const items = byGroup.filter((b) => b.status === 'pending_payment').sort((a, b) => String(a.lots.code).localeCompare(String(b.lots.code), 'ms', { numeric: true }));
  if (!items.length) { go('#/v/tempahan'); return; }
  const groupId = items[0].group_id;
  const ev = items[0].events;
  const total = items.reduce((a, b) => a + Number(b.amount), 0);
  const codes = items.map((b) => b.lots.code).join(', ');
  const qr = s.qr_image_path ? publicUrl('public-assets', s.qr_image_path) : '';

  render(`<div class="page" style="padding-bottom:20px">
    ${topbar('Pembayaran', { back: '#/v' })}
    <div class="content">
      <div class="row" id="timer" style="background:var(--amber-soft);color:var(--amber-ink);border-radius:12px;padding:12px 14px;font-size:13px;font-weight:600">${icon('clock', 18)}<span></span></div>
      <div class="card stack">
        <div><b>${esc(ev.name)}</b><div class="small muted">${esc(fmtRange(ev.start_date, ev.end_date))}</div></div>
        ${items.map((b) => `<div class="row" style="gap:12px"><span class="code-tile">${esc(b.lots.code)}</span><span style="flex:1" class="small">Tapak ${esc(b.lots.code)} · ${esc(b.lots.size)}</span><b>${rm(b.amount)}</b></div>`).join('')}
        <div class="row between" style="border-top:1px solid var(--line-2);padding-top:12px"><b>Jumlah (${items.length} tapak)</b><b style="font-family:var(--display);font-size:22px">${rm(total)}</b></div>
      </div>

      <div class="card stack">
        <b>1. Buat bayaran</b>
        ${qr ? `<img src="${esc(qr)}" alt="Kod DuitNow QR" style="width:220px;margin:0 auto;border-radius:12px">
               <div class="small muted" style="text-align:center">Imbas DuitNow QR dengan apps bank anda</div>` : ''}
        ${s.account_no ? `<div class="stack small" style="background:var(--card-2);border-radius:12px;padding:12px">
            <div class="row between"><span class="muted">Bank</span><b>${esc(s.bank_name)}</b></div>
            <div class="row between"><span class="muted">No. akaun</span><b>${esc(s.account_no)}</b></div>
            <div class="row between"><span class="muted">Nama</span><b>${esc(s.account_name)}</b></div>
            <button class="btn ghost sm" id="copy">Salin no. akaun</button>
          </div>` : ''}
        ${!qr && !s.account_no ? '<div class="small muted">Admin belum tetapkan maklumat bayaran. Sila hubungi admin.</div>' : ''}
        <div class="small muted">Rujukan bayaran: <b>${esc(codes)} ${esc(state.profile.business_name)}</b></div>
      </div>

      <form class="card stack" id="f">
        <b>2. Muat naik resit</b>
        <label class="field">Gambar / PDF resit bayaran (satu resit untuk semua tapak)<input class="input" type="file" name="r" accept="image/*,application/pdf" required style="padding-top:12px"></label>
        <button class="btn block" type="submit">${icon('upload', 18)} Hantar resit</button>
        <div class="small muted">Selepas resit disemak, penganjur akan mengesahkan tapak ${esc(codes)} dan invois akan dihantar.</div>
      </form>
      <button class="btn danger block" id="cancel">Batal &amp; lepaskan tapak</button>
    </div></div>`);

  const end = Math.min(...items.map((b) => new Date(b.lots.held_until).getTime()));
  const span = document.querySelector('#timer span');
  const tick = () => {
    const left = Math.max(0, end - Date.now());
    const h = Math.floor(left / 3600000), m = Math.floor((left % 3600000) / 60000), sec = Math.floor((left % 60000) / 1000);
    const t = (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0');
    span.textContent = left > 0 ? `Tapak ditahan untuk anda selama ${t}` : 'Masa tahan sudah tamat. Sila pilih tapak semula.';
    if (left <= 0) clearInterval(countdownTimer);
  };
  clearInterval(countdownTimer);
  tick(); countdownTimer = setInterval(tick, 1000);

  const copy = document.getElementById('copy');
  if (copy) copy.onclick = () => navigator.clipboard?.writeText(s.account_no).then(() => toast('No. akaun disalin'));

  const f = document.getElementById('f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const file = f.r.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return toast('Fail terlalu besar (maks 8MB)', 'error');
    await busy(f.querySelector('button'), async () => {
      try {
        const path = `${state.profile.id}/${groupId || items[0].id}-${Date.now()}.${fileExt(file)}`;
        await must(sb.storage.from('receipts').upload(path, file, { contentType: file.type }));
        if (groupId) await must(sb.rpc('submit_receipt_group', { p_group: groupId, p_receipt_path: path }));
        else await must(sb.rpc('submit_receipt', { p_booking_id: items[0].id, p_receipt_path: path }));
        clearInterval(countdownTimer);
        toast('Resit dihantar. Menunggu pengesahan penganjur.');
        go('#/v/tempahan');
      } catch (err) { fail(err); }
    });
  };
  document.getElementById('cancel').onclick = async () => {
    if (!(await confirmSheet('Batal tempahan?', `Tapak ${codes} akan dilepaskan untuk vendor lain.`, 'Ya, batal', true))) return;
    try {
      if (groupId) await must(sb.rpc('cancel_group', { p_group: groupId }));
      else await must(sb.rpc('cancel_booking', { p_booking_id: items[0].id }));
      clearInterval(countdownTimer); toast('Tempahan dibatalkan'); go('#/v');
    } catch (err) { fail(err); }
  };
}

// ---------- V3: Tempahan & invois saya ----------
export async function myBookingsView() {
  loading();
  const [bookings, invoices, ags] = await Promise.all([
    must(sb.from('bookings').select('*, lots(id,code,status), events(name,start_date,end_date)').eq('vendor_id', state.profile.id).order('created_at', { ascending: false }).limit(30)),
    must(sb.from('invoices').select('*').eq('vendor_id', state.profile.id).order('issued_at', { ascending: false }).limit(30)),
    must(sb.from('agreements').select('id,status,lot_ids').eq('vendor_id', state.profile.id).in('status', ['pending', 'signed']))
  ]);
  const agFor = (b) => ags.find((a) => (a.lot_ids || []).includes(b.lot_id));
  const bHref = (b) => {
    if (b.status === 'pending_payment') return '#/v/bayar/' + (b.group_id || b.id);
    const a = b.status === 'approved' && agFor(b);
    return a ? '#/perjanjian/' + a.id : '#/v?e=' + b.event_id;
  };
  const bBadge = (b) => {
    if (b.status !== 'approved') return badge(STATUS_BOOKING, b.status);
    if (b.lots?.status === 'signing') return '<span class="badge amber">Perlu tandatangan</span>';
    if (b.lots?.status === 'locked') return '<span class="badge green">Sah · dikunci</span>';
    return badge(STATUS_BOOKING, b.status);
  };
  render(`<div class="page">${topbar('Tempahan saya')}
    <div class="content">
      <div class="section-title">Tempahan tapak</div>
      <div class="list">${bookings.length ? bookings.map((b) => `
        <a class="list-item" href="${bHref(b)}">
          <span class="code-tile">${esc(b.lots?.code)}</span>
          <span class="grow"><span class="title">${esc(b.events?.name)}</span><span class="small muted">${esc(fmtRange(b.events?.start_date, b.events?.end_date))} · ${rm(b.amount)}</span></span>
          ${bBadge(b)}
        </a>`).join('') : '<div class="empty">Belum ada tempahan. <a href="#/v">Pilih tapak</a></div>'}</div>
      <div class="section-title">Invois</div>
      <div class="list">${invoices.length ? invoices.map((i) => `
        <a class="list-item" href="#/invois/${i.id}">
          <span class="grow"><span class="title">${esc(i.invoice_no)}</span><span class="small muted">${esc(fmtDateTime(i.issued_at))}</span></span>
          <span style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><b>${rm(i.total)}</b><span class="badge ${i.status === 'paid' ? 'green' : 'red'}">${i.status === 'paid' ? 'Dibayar' : 'Belum bayar'}</span></span>
        </a>`).join('') : '<div class="empty">Belum ada invois.</div>'}</div>
    </div>${nav('#/v/tempahan')}</div>`);
}
