// Arkib event: kumpul semua data satu event ke dalam satu fail ZIP untuk disimpan dalam laptop.
import { sb, must, loadSettings, fmtDate, fmtDateTime, fmtRange, STATUS_LOT, STATUS_BOOKING, publicUrl } from './lib.js';
import { agreementDoc } from './views-agreement.js';
import { invoicePdf } from './invoice-pdf.js';

const LIBS = {
  JSZip: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  XLSX: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
};
function loadLib(name) {
  if (window[name]) return Promise.resolve(window[name]);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = LIBS[name];
    s.onload = () => (window[name] ? res(window[name]) : rej(new Error('Gagal memuatkan ' + name)));
    s.onerror = () => rej(new Error('Tiada internet atau pustaka ' + name + ' gagal dimuatkan.'));
    document.head.appendChild(s);
  });
}

const clean = (s) => String(s || '').replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'tanpa-nama';
const extOf = (p) => (String(p).match(/\.([a-z0-9]{2,5})$/i)?.[1] || 'jpg').toLowerCase();
const AG_STATUS = { signed: 'Ditandatangani', pending: 'Menunggu tandatangan', cancelled: 'Dibatalkan' };
const SCH_STATUS = { pending: 'Belum', verifying: 'Disemak', paid: 'Dibayar', cancelled: 'Dibatalkan' };
const CAT = { makanan: 'Makanan', bukan_makanan: 'Bukan Makanan' };

// Gaya ringkas untuk fail perjanjian (dibuka dalam browser & boleh dicetak sebagai PDF)
const AG_CSS = `body{margin:0;background:#eee;font-family:Arial,Helvetica,sans-serif}
.bar{max-width:760px;margin:16px auto 0;display:flex;justify-content:flex-end}.bar button{font:600 14px Arial;padding:10px 16px;border-radius:10px;border:0;background:#111;color:#fff;cursor:pointer}
.agreement{max-width:760px;margin:16px auto 40px;background:#fff;color:#1d1a16;border-radius:12px;padding:36px 40px;font-size:14px;line-height:1.6;box-shadow:0 4px 20px rgba(0,0,0,.08)}
.agreement p{margin:0 0 8px}.agreement h3{font-size:14px;letter-spacing:.03em;margin:18px 0 6px;color:#000}
.ag-title{text-align:center;font-size:18px;line-height:1.35;margin:0 0 16px;color:#000}.ag-title span{font-size:15px;color:#b5651d;letter-spacing:.12em}
.ag-blank{display:inline-block;min-width:140px;border-bottom:1px solid #999}
.ag-box{background:#f6efe4;border-radius:10px;padding:12px 14px;margin:10px 0 14px;display:flex;flex-direction:column;gap:4px}
.ag-row{display:flex;justify-content:space-between;gap:10px;font-size:13px}.ag-row>:last-child{white-space:nowrap;text-align:right}
.ag-signs{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:20px;border-top:1px solid #ddd;padding-top:6px}
.ag-sigbox{min-height:92px;border-bottom:1.5px solid #333;display:flex;align-items:flex-end;margin:6px 0 4px}.ag-sig{max-height:110px;max-width:100%}
.ag-stamp{font-size:11px;color:#555;background:#f3f3f3;border-radius:8px;padding:6px 8px}.ag-sig-hint{color:#999;font-size:12px;font-style:italic}
@media print{body{background:#fff}.bar{display:none}.agreement{box-shadow:none;margin:0;max-width:none;padding:0;font-size:11.5pt}.ag-box,.ag-stamp{-webkit-print-color-adjust:exact;print-color-adjust:exact}.ag-signs,.ag-box{break-inside:avoid}}`;

function agreementHtml(a) {
  const v = a.status === 'signed' ? { ...a.vendor_info } : {
    owner_name: a.vendor?.owner_name, business_name: a.vendor?.business_name, id_no: a.vendor?.id_no, address: a.vendor?.address,
    phone: a.vendor?.phone, products: a.vendor?.products, vendor_code: a.vendor?.vendor_code, category: a.vendor?.category, business_type: a.vendor?.business_type
  };
  const title = `Perjanjian ${a.lot_codes} ${v.business_name || ''}`;
  return `<!doctype html><html lang="ms"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${clean(title)}</title><style>${AG_CSS}</style></head>
<body><div class="bar"><button onclick="print()">Cetak / Simpan PDF</button></div>${agreementDoc(a, v)}</body></html>`;
}

function sheet(XLSX, rows, widths) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map((w) => ({ wch: w }));
  return ws;
}

// onStep(teks) dipanggil untuk tunjuk kemajuan
export async function buildEventArchive(ev, onStep = () => {}) {
  onStep('Memuatkan pustaka…');
  const [JSZip, XLSX] = await Promise.all([loadLib('JSZip'), loadLib('XLSX')]);
  const VEND = 'vendor:profiles(id,vendor_code,business_name,owner_name,phone,email,category,business_type,id_no,address,products)';

  onStep('Mengumpul data…');
  const [lots, bookings, agreements, s] = await Promise.all([
    must(sb.from('lots').select('*, ' + VEND).eq('event_id', ev.id).order('row_no').order('col_no')),
    must(sb.from('bookings').select('*, lots(code,size), ' + VEND).eq('event_id', ev.id).order('created_at')),
    must(sb.from('agreements').select('*, ' + VEND).eq('event_id', ev.id).order('created_at')),
    loadSettings(true)
  ]);
  const groups = [...new Set(bookings.map((b) => b.group_id).filter(Boolean))];
  const sch1 = await must(sb.from('payment_schedules').select('*, ' + VEND).eq('event_id', ev.id));
  const sch2 = groups.length ? await must(sb.from('payment_schedules').select('*, ' + VEND).in('group_id', groups)) : [];
  const schedules = [...new Map([...sch1, ...sch2].map((r) => [r.id, r])).values()]
    .sort((a, b) => String(a.vendor?.business_name).localeCompare(String(b.vendor?.business_name)) || a.seq - b.seq);
  const invoices = await must(sb.from('invoices').select('*, ' + VEND).eq('event_id', ev.id).order('issued_at'));

  // Vendor yang terlibat
  const vendors = new Map();
  for (const r of [...lots, ...bookings, ...agreements, ...invoices]) if (r.vendor?.id) vendors.set(r.vendor.id, r.vendor);

  const zip = new JSZip();
  const root = zip.folder(clean(`Arkib ${ev.name}`));

  // ---------- Gambar resit ----------
  const receiptFile = new Map();
  const paths = [...new Set(bookings.map((b) => b.receipt_path).filter(Boolean))];
  let i = 0, missing = 0;
  for (const p of paths) {
    i++; onStep(`Muat turun resit ${i}/${paths.length}…`);
    const bs = bookings.filter((b) => b.receipt_path === p);
    const name = `resit/${clean(bs.map((b) => b.lots?.code).filter(Boolean).join('-'))} ${clean(bs[0].vendor?.business_name)}.${extOf(p)}`;
    try {
      const { data, error } = await sb.storage.from('receipts').download(p);
      if (error) throw error;
      root.file(name, data); receiptFile.set(p, name);
    } catch { missing++; receiptFile.set(p, '(gagal dimuat turun)'); }
  }

  // ---------- Gambar pelan tapak ----------
  if (ev.layout_image_path) {
    onStep('Muat turun pelan tapak…');
    try { const r = await fetch(publicUrl('layouts', ev.layout_image_path)); if (r.ok) root.file('pelan-tapak.' + extOf(ev.layout_image_path), await r.blob()); } catch {}
  }

  // ---------- Perjanjian ----------
  const agFile = new Map();
  agreements.forEach((a) => {
    const biz = a.status === 'signed' ? a.vendor_info?.business_name : a.vendor?.business_name;
    const prefix = a.status === 'signed' ? '' : `(${AG_STATUS[a.status] || a.status}) `;
    const name = `perjanjian/${prefix}Lot ${clean(a.lot_codes)} ${clean(biz)}.html`;
    root.file(name, agreementHtml(a)); agFile.set(a.id, name);
  });

  // ---------- Invois PDF ----------
  const invFile = new Map(); i = 0;
  for (const inv of invoices) {
    i++; onStep(`Menjana invois ${i}/${invoices.length}…`);
    const name = `invois/${clean(inv.invoice_no)} ${clean(inv.vendor?.business_name)}.pdf`;
    root.file(name, await invoicePdf({ ...inv, event: ev }, s)); invFile.set(inv.id, name);
  }

  // ---------- Excel ----------
  onStep('Menyediakan Excel…');
  const wb = XLSX.utils.book_new();
  const count = (st) => lots.filter((l) => l.status === st).length;
  const nilai = lots.filter((l) => l.status === 'locked').reduce((a, l) => a + Number(l.price || 0), 0);
  const dibayar = schedules.filter((r) => r.status === 'paid').reduce((a, r) => a + Number(r.amount || 0), 0);
  const baki = schedules.filter((r) => r.status !== 'paid' && r.status !== 'cancelled').reduce((a, r) => a + Number(r.amount || 0), 0);
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, [
    ['ARKIB EVENT — ' + (s.company_name || 'Stailo Event')], [],
    ['Nama event', ev.name], ['Tarikh', fmtRange(ev.start_date, ev.end_date)], ['Lokasi', ev.location || ''],
    ['Tempoh', ev.duration || ''], ['Waktu operasi', ev.op_hours || ''], [],
    ['Jumlah tapak', lots.length], ['Tapak dikunci', count('locked')], ['Tapak kosong', count('free')],
    ['Bilangan vendor', vendors.size], ['Nilai tapak dikunci (RM)', nilai],
    ['Jumlah diterima ikut jadual (RM)', dibayar], ['Baki belum diterima (RM)', baki],
    ['Perjanjian ditandatangani', agreements.filter((a) => a.status === 'signed').length], ['Invois', invoices.length], [],
    ['Arkib dimuat turun', fmtDateTime(new Date().toISOString())]
  ], [34, 50]), 'Ringkasan');
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, [['Kod tapak', 'Saiz', 'Harga (RM)', 'Status', 'ID vendor', 'Perniagaan', 'Pemilik', 'Telefon'],
    ...lots.map((l) => [l.code, l.size, Number(l.price || 0), STATUS_LOT[l.status]?.label || l.status, l.vendor?.vendor_code || '', l.vendor?.business_name || '', l.vendor?.owner_name || '', l.vendor?.phone || ''])
  ], [10, 12, 11, 22, 10, 28, 22, 15]), 'Tapak');
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, [['ID', 'Perniagaan', 'Jenis perniagaan', 'Pemilik', 'Telefon', 'Emel', 'Kategori', 'No. SSM', 'Alamat', 'Produk / menu'],
    ...[...vendors.values()].sort((a, b) => String(a.vendor_code).localeCompare(String(b.vendor_code)))
      .map((v) => [v.vendor_code || '', v.business_name || '', v.business_type || '', v.owner_name || '', v.phone || '', v.email || '', CAT[v.category] || v.category || '', v.id_no || '', v.address || '', v.products || ''])
  ], [8, 28, 18, 22, 15, 26, 14, 22, 36, 30]), 'Vendor');
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, [['Tarikh tempah', 'Kod tapak', 'ID vendor', 'Perniagaan', 'Jumlah (RM)', 'Status', 'Disahkan', 'Fail resit'],
    ...bookings.map((b) => [fmtDateTime(b.created_at), b.lots?.code || '', b.vendor?.vendor_code || '', b.vendor?.business_name || '', Number(b.amount || 0), STATUS_BOOKING[b.status]?.label || b.status, b.verified_at ? fmtDateTime(b.verified_at) : '', b.receipt_path ? receiptFile.get(b.receipt_path) || '' : ''])
  ], [18, 10, 10, 28, 12, 20, 18, 40]), 'Tempahan');
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, [['ID vendor', 'Perniagaan', 'Pelan', 'Bil.', 'Perkara', 'Peratus', 'Jumlah (RM)', 'Tarikh akhir', 'Status', 'Dibayar pada'],
    ...schedules.map((r) => [r.vendor?.vendor_code || '', r.vendor?.business_name || '', r.plan, r.seq, r.label, r.percent + '%', Number(r.amount || 0), r.due_date ? fmtDate(r.due_date) : '', SCH_STATUS[r.status] || r.status, r.paid_at ? fmtDateTime(r.paid_at) : ''])
  ], [10, 28, 10, 5, 34, 8, 12, 14, 12, 18]), 'Jadual Bayaran');
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, [['Lot', 'Perniagaan', 'Status', 'Jumlah (RM)', 'Pelan', 'Ditandatangani', 'Fail'],
    ...agreements.map((a) => [a.lot_codes, (a.status === 'signed' ? a.vendor_info?.business_name : a.vendor?.business_name) || '', AG_STATUS[a.status] || a.status, Number(a.total || 0), a.plan || '', a.signed_at ? fmtDateTime(a.signed_at) : '', agFile.get(a.id) || ''])
  ], [12, 28, 22, 12, 10, 18, 50]), 'Perjanjian');
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, [['No. invois', 'Tarikh', 'ID vendor', 'Perniagaan', 'Perkara', 'Jumlah (RM)', 'Status', 'Dibayar pada', 'Fail'],
    ...invoices.map((v) => [v.invoice_no, fmtDate(v.issued_at), v.vendor?.vendor_code || '', v.vendor?.business_name || '', (v.items || []).map((it) => it.desc).join('; '), Number(v.total || 0), v.status === 'paid' ? 'Dibayar' : 'Belum bayar', v.paid_at ? fmtDateTime(v.paid_at) : '', invFile.get(v.id) || ''])
  ], [16, 12, 10, 28, 40, 12, 12, 18, 45]), 'Invois');
  root.file(clean(`Laporan ${ev.name}`) + '.xlsx', XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));

  // ---------- Data mentah (untuk rujukan / pulih) & panduan ----------
  root.file('data-mentah.json', JSON.stringify({ dijana: new Date().toISOString(), event: ev, lots, bookings, payment_schedules: schedules, agreements, invoices, vendors: [...vendors.values()] }, null, 2));
  root.file('BACA SAYA.txt', [
    `ARKIB EVENT: ${ev.name}`, `Dimuat turun: ${fmtDateTime(new Date().toISOString())}`, '',
    'Kandungan:',
    `- Laporan ${clean(ev.name)}.xlsx : ringkasan, tapak, vendor, tempahan, jadual bayaran, perjanjian & invois (buka dengan Excel)`,
    `- perjanjian/ : ${agreements.length} perjanjian. Buka dengan Chrome/Edge, tekan "Cetak / Simpan PDF" untuk jadikan PDF.`,
    `- invois/ : ${invoices.length} invois PDF`,
    `- resit/ : ${paths.length - missing} gambar resit${missing ? ` (${missing} gagal dimuat turun)` : ''}`,
    ev.layout_image_path ? '- pelan-tapak : gambar pelan tapak' : '',
    '- data-mentah.json : salinan penuh data (simpan untuk rujukan)', '',
    'Simpan folder ini di tempat selamat (contoh: laptop + Google Drive / pendrive) sebelum memadam data event dalam apps.'
  ].filter((l) => l !== '').join('\r\n'));

  onStep('Memampatkan fail ZIP…');
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { blob, name: clean(`Arkib ${ev.name} ${new Date().toISOString().slice(0, 10)}`) + '.zip', missing, counts: { lots: lots.length, bookings: bookings.length, agreements: agreements.length, invoices: invoices.length, receipts: paths.length } };
}

// Padam semua data event (selepas arkib). Pulangkan ringkasan.
export async function purgeEvent(ev, typedName) {
  const r = await must(sb.rpc('admin_purge_event', { p_event: ev.id, p_confirm: typedName }));
  const files = (r?.receipts || []).filter(Boolean);
  for (let k = 0; k < files.length; k += 100) {
    await sb.storage.from('receipts').remove(files.slice(k, k + 100));
  }
  if (r?.layout) await sb.storage.from('layouts').remove([r.layout]);
  return r;
}
