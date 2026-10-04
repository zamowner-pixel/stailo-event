import { Pdf, wrap } from './pdf.js';
import { rm, fmtDate, fmtDateTime } from './lib.js';

let logoBytes;
async function logo() {
  if (logoBytes !== undefined) return logoBytes;
  try { logoBytes = new Uint8Array(await (await fetch('assets/logo.jpg')).arrayBuffer()); } catch { logoBytes = null; }
  return logoBytes;
}

export const invoiceFileName = (inv) => `${inv.invoice_no} ${inv.vendor?.business_name || ''}`.replace(/[\\/:*?"<>|]+/g, '').trim() + '.pdf';

export async function invoicePdf(inv, s) {
  const p = new Pdf(); const L = 50, R = p.W - 50; const ORANGE = '#E8650A', MUTED = '#6b6b6b';
  const v = inv.vendor || {}; const paid = inv.status === 'paid';
  let y = 50;
  const lg = await logo();
  if (lg) p.image(lg, L, y - 6, 54, 54);
  const tx = lg ? L + 66 : L;
  p.text(String(s.company_name || 'Stailo Event').toUpperCase(), tx, y + 10, { size: 15, bold: true, color: ORANGE });
  let ay = y + 26;
  for (const ln of String(s.address || '').split('\n').filter(Boolean)) { p.text(ln, tx, ay, { size: 9, color: MUTED }); ay += 12; }
  if (s.phone) { p.text('Tel: ' + s.phone, tx, ay, { size: 9, color: MUTED }); ay += 12; }
  if (s.org_reg_no) { p.text('No. Pendaftaran: ' + s.org_reg_no, tx, ay, { size: 9, color: MUTED }); ay += 12; }
  p.text('INVOIS', R, y + 12, { size: 24, bold: true, align: 'right' });
  p.text(paid ? 'DIBAYAR' : 'BELUM DIBAYAR', R, y + 30, { size: 10, bold: true, align: 'right', color: paid ? '#12805C' : '#C0263E' });

  y = Math.max(ay, y + 60) + 18;
  p.line(L, y, R, y, { color: '#e5e5e5' }); y += 22;
  p.text('No. invois', L, y, { size: 9, color: MUTED }); p.text('Tarikh', 330, y, { size: 9, color: MUTED });
  y += 14;
  p.text(inv.invoice_no, L, y, { size: 11, bold: true }); p.text(fmtDate(inv.issued_at), 330, y, { size: 11, bold: true });
  y += 24;
  p.text('Kepada', L, y, { size: 9, color: MUTED });
  if (inv.event) p.text('Event', 330, y, { size: 9, color: MUTED });
  y += 14;
  p.text(v.business_name || '-', L, y, { size: 11, bold: true });
  let ey = y;
  if (inv.event) { for (const ln of wrap(inv.event.name, 11, R - 330, true)) { p.text(ln, 330, ey, { size: 11, bold: true }); ey += 14; } }
  y += 14;
  const who = [v.vendor_code ? 'ID ' + v.vendor_code : '', v.owner_name, v.phone].filter(Boolean).join(' · ');
  if (who) { p.text(who, L, y, { size: 9, color: MUTED }); }
  if (inv.event?.location) p.text(inv.event.location, 330, ey, { size: 9, color: MUTED });
  y = Math.max(y, ey) + 30;

  p.rect(L, y - 14, R - L, 22, { fill: '#F6EFE4' });
  p.text('PERKARA', L + 10, y, { size: 9, bold: true, color: '#444444' });
  p.text('JUMLAH', R - 10, y, { size: 9, bold: true, color: '#444444', align: 'right' });
  y += 24;
  for (const it of inv.items || []) {
    const lines = wrap(it.desc, 10, R - L - 130);
    lines.forEach((ln, i) => p.text(ln, L + 10, y + i * 13, { size: 10 }));
    p.text(rm(it.amount), R - 10, y, { size: 10, align: 'right' });
    y += lines.length * 13 + 8;
    p.line(L, y - 4, R, y - 4, { color: '#eeeeee' }); y += 8;
  }
  y += 6;
  p.text('Jumlah', R - 150, y, { size: 11, bold: true, align: 'right' });
  p.text(rm(inv.total), R - 10, y, { size: 15, bold: true, align: 'right' });
  y += 30;
  if (paid && inv.paid_at) { p.text('Dibayar pada ' + fmtDateTime(inv.paid_at), L, y, { size: 9, color: '#12805C' }); y += 16; }
  if (!paid && s.account_no) {
    p.rect(L, y - 12, R - L, 34, { fill: '#F5F5F5' });
    p.text('Bayaran ke:', L + 10, y + 2, { size: 9, color: MUTED });
    p.text(`${s.bank_name || ''} ${s.account_no} (${s.account_name || ''})`, L + 10, y + 15, { size: 10, bold: true });
    y += 40;
  }
  if (inv.notes) {
    y += 6;
    for (const para of String(inv.notes).split('\n')) for (const ln of wrap(para, 9, R - L)) { p.text(ln, L, y, { size: 9, color: MUTED }); y += 12; }
  }
  p.line(L, p.H - 50, R, p.H - 50, { color: '#eeeeee' });
  p.text('Terima kasih kerana menyertai ' + (s.company_name || 'Stailo Event') + '.', L, p.H - 36, { size: 8, color: MUTED });
  return p.output();
}

// Kongsi PDF (WhatsApp / emel melalui menu kongsi telefon). Jika tidak disokong, muat turun.
// blob perlu disediakan lebih awal supaya navigator.share dipanggil terus selepas sentuhan (syarat iPhone).
export function sharePdfBlob(blob, name, title, text) {
  const file = new File([blob], name, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    return navigator.share({ files: [file], title, text }).then(() => 'shared').catch((e) => {
      if (e?.name === 'AbortError') return 'cancelled';
      downloadBlob(blob, name); return 'downloaded';
    });
  }
  downloadBlob(blob, name);
  return Promise.resolve('downloaded');
}
export async function downloadInvoicePdf(inv, s) {
  const blob = await invoicePdf(inv, s);
  downloadBlob(blob, invoiceFileName(inv));
}
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
