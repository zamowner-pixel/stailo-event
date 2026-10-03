import {
  sb, state, render, loading, esc, icon, rm, fmtRange, fmtDateTime, toast, fail, go, busy, must,
  topbar, nav, lotMap, publicUrl, lightbox, loadSettings, fileExt, confirmSheet, badge, STATUS_BOOKING
} from './lib.js';

let countdownTimer;
export function clearTimers() { clearInterval(countdownTimer); }

// ---------- V1: Pilih tapak ----------
export async function pickLotView(params, query) {
  loading();
  const events = await must(sb.from('events').select('*').eq('is_active', true).order('start_date', { ascending: true }));
  if (!events.length) {
    render(`<div class="page">${topbar('Pilih tapak')}<div class="content"><div class="card empty">Tiada event dibuka buat masa ini.<br>Sila semak semula nanti.</div></div>${nav('#/v')}</div>`);
    return;
  }
  const ev = events.find((e) => e.id === query.get('e')) || events[0];
  const [lots, myBookings] = await Promise.all([
    must(sb.rpc('lots_for_event', { p_event_id: ev.id })),
    must(sb.from('bookings').select('*, lots(code)').eq('event_id', ev.id).eq('vendor_id', state.profile.id)
      .in('status', ['pending_payment', 'pending_verification', 'approved']).order('created_at', { ascending: false }))
  ]);
  const active = myBookings[0];
  let selected = null;
  const prices = [...new Set(lots.map((l) => Number(l.price)).filter((p) => p > 0))];
  const priceText = prices.length === 1 ? rm(prices[0]) : prices.length ? `${rm(Math.min(...prices))} – ${rm(Math.max(...prices))}` : '';
  const sizeText = [...new Set(lots.map((l) => l.size))].join(', ');

  let statusCard = '';
  if (active) {
    const code = esc(active.lots?.code);
    if (active.status === 'pending_payment') statusCard = `<div class="card row" style="background:var(--amber-soft)"><div style="flex:1"><b>Tapak ${code} ditahan untuk anda</b><div class="small">Sila buat bayaran sebelum masa tamat.</div></div><a class="btn sm" href="#/v/bayar/${active.id}">Bayar</a></div>`;
    if (active.status === 'pending_verification') statusCard = `<div class="card" style="background:var(--amber-soft)"><b>Tapak ${code} — menunggu pengesahan admin</b><div class="small">Resit anda telah diterima. Admin akan kunci tapak selepas semakan.</div></div>`;
    if (active.status === 'approved') statusCard = `<div class="card row" style="background:var(--green-soft);color:var(--green)">${icon('check', 24)}<div><b>Tapak ${code} dikunci untuk anda</b><div class="small">Jumpa di event nanti!</div></div></div>`;
  }

  const draw = () => {
    render(`<div class="page">
      ${topbar(ev.name, { sub: `${esc(fmtRange(ev.start_date, ev.end_date))}${ev.location ? ' · ' + esc(ev.location) : ''}`, right: `<button class="icon-btn" id="refresh" aria-label="Muat semula">${icon('refresh')}</button>` })}
      <div class="content" style="padding-bottom:${active ? 20 : 110}px">
        ${events.length > 1 ? `<select class="input" id="evsel" aria-label="Pilih event">${events.map((e) => `<option value="${e.id}"${e.id === ev.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</select>` : ''}
        ${statusCard}
        ${ev.layout_image_path
          ? `<div class="layout-img"><img src="${esc(publicUrl('layouts', ev.layout_image_path))}" alt="Pelan tapak ${esc(ev.name)}" id="layout"></div>`
          : '<div class="layout-empty">' + icon('image', 26) + 'Pelan tapak belum dimuat naik</div>'}
        <div class="small muted">${sizeText ? 'Saiz ' + esc(sizeText) + ' · ' : ''}${priceText}</div>
        <div class="legend">
          <span><i class="sw-free"></i>Kosong</span>
          <span><i class="sw-sel"></i>${active ? 'Tapak anda' : 'Pilihan anda'}</span>
          <span><i class="sw-taken"></i>Sudah diambil</span>
        </div>
        ${lotMap(lots, { mode: 'vendor', selectedId: selected?.id })}
      </div>
      ${active ? nav('#/v') : `<div class="action-bar">
        ${selected
          ? `<div style="flex:1"><div class="small muted">Tapak dipilih</div><div style="font-family:var(--display);font-size:20px;font-weight:700">${esc(selected.code)} · ${rm(selected.price)}</div></div><button class="btn" id="go">Teruskan bayar</button>`
          : '<div class="muted" style="flex:1;height:50px;display:flex;align-items:center">Klik satu tapak kosong untuk pilih.</div>'}
      </div>`}
    </div>`);
    const img = document.getElementById('layout');
    if (img) img.onclick = () => lightbox(img.src);
    document.getElementById('refresh').onclick = () => go(location.hash);
    const sel = document.getElementById('evsel');
    if (sel) sel.onchange = () => go('#/v?e=' + sel.value);
    if (!active) {
      document.querySelectorAll('.lot[data-lot]').forEach((b) => {
        b.onclick = () => {
          const l = lots.find((x) => x.id === b.dataset.lot);
          if (!l || l.status !== 'free' || !(Number(l.price) > 0)) return;
          selected = selected?.id === l.id ? null : l;
          draw();
        };
      });
    }
    const btn = document.getElementById('go');
    if (btn) btn.onclick = () => busy(btn, async () => {
      try {
        const bookingId = await must(sb.rpc('reserve_lot', { p_lot_id: selected.id }));
        go('#/v/bayar/' + bookingId);
      } catch (err) { fail(err); go(location.hash); }
    });
  };
  draw();
}

// ---------- V2: Pembayaran (manual: DuitNow QR / pindahan bank + resit) ----------
export async function payView({ id }) {
  loading();
  const [b, s] = await Promise.all([
    must(sb.from('bookings').select('*, lots(code,size,price,held_until,status), events(name,start_date,end_date)').eq('id', id).single()),
    loadSettings(true)
  ]);
  if (b.status !== 'pending_payment') { go('#/v/tempahan'); return; }
  const qr = s.qr_image_path ? publicUrl('public-assets', s.qr_image_path) : '';

  render(`<div class="page" style="padding-bottom:20px">
    ${topbar('Pembayaran', { back: '#/v' })}
    <div class="content">
      <div class="row" id="timer" style="background:var(--amber-soft);color:var(--amber-ink);border-radius:12px;padding:12px 14px;font-size:13px;font-weight:600">${icon('clock', 18)}<span></span></div>
      <div class="card stack">
        <div class="row" style="gap:14px">
          <span class="code-tile big">${esc(b.lots.code)}</span>
          <div><b>Tapak ${esc(b.lots.code)}</b><div class="small muted">${esc(b.events.name)}</div></div>
        </div>
        <div class="row between small"><span class="muted">Tarikh</span><b>${esc(fmtRange(b.events.start_date, b.events.end_date))}</b></div>
        <div class="row between small"><span class="muted">Saiz</span><b>${esc(b.lots.size)}</b></div>
        <div class="row between" style="border-top:1px solid var(--line-2);padding-top:12px"><b>Jumlah</b><b style="font-family:var(--display);font-size:22px">${rm(b.amount)}</b></div>
      </div>

      <div class="card stack">
        <b>1. Buat bayaran</b>
        ${qr ? `<img src="${esc(qr)}" alt="Kod DuitNow QR" style="width:220px;margin:0 auto;border-radius:12px">
               <div class="small muted" style="text-align:center">Imbas DuitNow QR dengan apps bank anda</div>` : ''}
        ${s.account_no ? `<div class="stack small" style="background:var(--card-2);border-radius:12px;padding:12px">
            <div class="row between"><span class="muted">Bank</span><b>${esc(s.bank_name)}</b></div>
            <div class="row between"><span class="muted">No. akaun</span><b id="accno">${esc(s.account_no)}</b></div>
            <div class="row between"><span class="muted">Nama</span><b>${esc(s.account_name)}</b></div>
            <button class="btn ghost sm" id="copy">Salin no. akaun</button>
          </div>` : ''}
        ${!qr && !s.account_no ? '<div class="small muted">Admin belum tetapkan maklumat bayaran. Sila hubungi admin.</div>' : ''}
        <div class="small muted">Rujukan bayaran: <b>${esc(b.lots.code)} ${esc(state.profile.business_name)}</b></div>
      </div>

      <form class="card stack" id="f">
        <b>2. Muat naik resit</b>
        <label class="field">Gambar / PDF resit bayaran<input class="input" type="file" name="r" accept="image/*,application/pdf" required style="padding-top:12px"></label>
        <button class="btn block" type="submit">${icon('upload', 18)} Hantar resit</button>
        <div class="small muted">Selepas resit disemak, admin akan kunci tapak ${esc(b.lots.code)} untuk anda dan invois akan dihantar.</div>
      </form>
      <button class="btn danger block" id="cancel">Batal &amp; lepaskan tapak</button>
    </div></div>`);

  const end = new Date(b.lots.held_until).getTime();
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
        const path = `${state.profile.id}/${b.id}-${Date.now()}.${fileExt(file)}`;
        await must(sb.storage.from('receipts').upload(path, file, { contentType: file.type }));
        await must(sb.rpc('submit_receipt', { p_booking_id: b.id, p_receipt_path: path }));
        clearInterval(countdownTimer);
        toast('Resit dihantar. Menunggu pengesahan admin.');
        go('#/v/tempahan');
      } catch (err) { fail(err); }
    });
  };
  document.getElementById('cancel').onclick = async () => {
    if (!(await confirmSheet('Batal tempahan?', `Tapak ${b.lots.code} akan dilepaskan untuk vendor lain.`, 'Ya, batal', true))) return;
    try { await must(sb.rpc('cancel_booking', { p_booking_id: b.id })); clearInterval(countdownTimer); toast('Tempahan dibatalkan'); go('#/v'); }
    catch (err) { fail(err); }
  };
}

// ---------- V3: Tempahan & invois saya ----------
export async function myBookingsView() {
  loading();
  const [bookings, invoices] = await Promise.all([
    must(sb.from('bookings').select('*, lots(code), events(name,start_date,end_date)').eq('vendor_id', state.profile.id).order('created_at', { ascending: false }).limit(30)),
    must(sb.from('invoices').select('*').eq('vendor_id', state.profile.id).order('issued_at', { ascending: false }).limit(30))
  ]);
  render(`<div class="page">${topbar('Tempahan saya')}
    <div class="content">
      <div class="section-title">Tempahan tapak</div>
      <div class="list">${bookings.length ? bookings.map((b) => `
        <a class="list-item" href="${b.status === 'pending_payment' ? '#/v/bayar/' + b.id : '#/v?e=' + b.event_id}">
          <span class="code-tile">${esc(b.lots?.code)}</span>
          <span class="grow"><span class="title">${esc(b.events?.name)}</span><span class="small muted">${esc(fmtRange(b.events?.start_date, b.events?.end_date))} · ${rm(b.amount)}</span></span>
          ${badge(STATUS_BOOKING, b.status)}
        </a>`).join('') : '<div class="empty">Belum ada tempahan. <a href="#/v">Pilih tapak</a></div>'}</div>
      <div class="section-title">Invois</div>
      <div class="list">${invoices.length ? invoices.map((i) => `
        <a class="list-item" href="#/invois/${i.id}">
          <span class="grow"><span class="title">${esc(i.invoice_no)}</span><span class="small muted">${esc(fmtDateTime(i.issued_at))}</span></span>
          <span style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><b>${rm(i.total)}</b><span class="badge ${i.status === 'paid' ? 'green' : 'red'}">${i.status === 'paid' ? 'Dibayar' : 'Belum bayar'}</span></span>
        </a>`).join('') : '<div class="empty">Belum ada invois.</div>'}</div>
    </div>${nav('#/v/tempahan')}</div>`);
}
