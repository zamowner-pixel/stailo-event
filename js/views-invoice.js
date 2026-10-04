import { sb, state, render, loading, esc, icon, rm, fmtDate, fmtDateTime, toast, fail, go, must, busy, topbar, waLink, loadSettings, confirmSheet } from './lib.js';
import { invoicePdf, invoiceFileName, sharePdfBlob, downloadBlob } from './invoice-pdf.js';

export async function invoiceView({ id }) {
  loading();
  const [inv, s] = await Promise.all([
    must(sb.from('invoices').select('*, vendor:profiles(vendor_code,business_name,owner_name,phone,email), event:events(name,start_date,end_date,location)').eq('id', id).single()),
    loadSettings(true)
  ]);
  const admin = state.profile.role === 'admin';
  const v = inv.vendor || {};
  const paid = inv.status === 'paid';
  const msg = `Salam ${v.owner_name || v.business_name || ''},\n\nIni invois ${inv.invoice_no} daripada ${s.company_name}.\n` +
    inv.items.map((x) => `• ${x.desc}: ${rm(x.amount)}`).join('\n') +
    `\nJumlah: ${rm(inv.total)}\nStatus: ${paid ? 'DIBAYAR' : 'BELUM DIBAYAR'}\n` +
    (!paid && s.account_no ? `\nBayaran ke: ${s.bank_name} ${s.account_no} (${s.account_name})\n` : '') +
    `\nInvois PDF dilampirkan.\n\nTerima kasih!`;

  render(`<div class="page" style="padding-bottom:20px">
    ${topbar('Invois', { back: admin ? '#/a/invois' : '#/v/tempahan', right: admin ? `<a class="btn ghost sm" href="#/a/invois/${inv.id}/edit">${icon('edit', 16)} Edit</a>` : '' })}
    <div class="content">
      <div class="invoice">
        <div class="row between" style="align-items:flex-start">
          <div><div style="font-family:var(--display);font-weight:700;font-size:17px;color:var(--gold);letter-spacing:.03em">${esc(s.company_name).toUpperCase()}</div>
          <div class="small muted" style="white-space:pre-line">${esc(s.address)}${s.phone ? '\n' + esc(s.phone) : ''}</div></div>
          <span class="badge ${paid ? 'green' : 'red'}">${paid ? 'Dibayar' : 'Belum bayar'}</span>
        </div>
        <div class="grid2 small">
          <div><div class="muted">No. invois</div><b>${esc(inv.invoice_no)}</b></div>
          <div><div class="muted">Tarikh</div><b>${esc(fmtDate(inv.issued_at))}</b></div>
          <div style="grid-column:span 2"><div class="muted">Kepada</div><b>${esc(v.business_name)}</b><div class="muted">ID ${esc(v.vendor_code || '-')} · ${esc(v.owner_name)}${v.phone ? ' · ' + esc(v.phone) : ''}</div></div>
          ${inv.event ? `<div style="grid-column:span 2"><div class="muted">Event</div><b>${esc(inv.event.name)}</b></div>` : ''}
        </div>
        <table><thead><tr><th>PERKARA</th><th class="num">JUMLAH</th></tr></thead>
          <tbody>${inv.items.map((x) => `<tr><td>${esc(x.desc)}</td><td class="num">${rm(x.amount)}</td></tr>`).join('')}</tbody></table>
        <div class="row between"><b>Jumlah</b><b style="font-family:var(--display);font-size:24px">${rm(inv.total)}</b></div>
        ${paid && inv.paid_at ? `<div class="small muted">Dibayar pada ${esc(fmtDateTime(inv.paid_at))}</div>` : ''}
        ${!paid && s.account_no ? `<div class="small" style="background:var(--card-2);border-radius:12px;padding:12px">Bayaran ke <b>${esc(s.bank_name)} ${esc(s.account_no)}</b> (${esc(s.account_name)})</div>` : ''}
        ${inv.notes ? `<div class="small muted" style="white-space:pre-line">${esc(inv.notes)}</div>` : ''}
      </div>

      <div class="stack no-print">
        ${admin ? `<button class="btn wa block" id="sharepdf">${icon('wa', 18)} Hantar PDF (WhatsApp / emel)</button>` : ''}
        <button class="btn ghost block" id="dlpdf">${icon('file', 18)} Muat turun PDF</button>
        ${admin ? '<div class="small muted" style="text-align:center">Pilih WhatsApp dan nama vendor dalam menu kongsi. PDF akan dilampirkan terus.</div>' : ''}
        ${admin ? `<div class="grid2">
          <button class="btn ghost" id="toggle">${paid ? 'Tanda belum bayar' : 'Tanda dibayar'}</button>
          <button class="btn danger" id="del">${icon('trash', 18)} Padam</button></div>` : ''}
      </div>
    </div></div>`);

  // Sediakan PDF sebaik halaman dibuka
  let pdfBlob = null;
  const pdfReady = invoicePdf(inv, s).then((b) => (pdfBlob = b)).catch((err) => { console.error(err); });
  const name = invoiceFileName(inv);
  const dl = document.getElementById('dlpdf');
  dl.onclick = async () => { await pdfReady; if (pdfBlob) downloadBlob(pdfBlob, name); else toast('PDF gagal dijana', 'error'); };
  const sh = document.getElementById('sharepdf');
  if (sh) sh.onclick = async () => {
    if (!pdfBlob) { toast('Menyediakan PDF… cuba lagi sebentar'); await pdfReady; return; }
    const r = await sharePdfBlob(pdfBlob, name, inv.invoice_no, msg);
    if (r === 'downloaded') {
      toast('PDF dimuat turun. Lampirkan PDF tersebut dalam WhatsApp vendor.');
      if (v.phone) window.open(waLink(v.phone, msg), '_blank', 'noopener');
    }
  };
  if (!admin) return;
  document.getElementById('toggle').onclick = async () => {
    try {
      await must(sb.from('invoices').update({ status: paid ? 'unpaid' : 'paid', paid_at: paid ? null : new Date().toISOString() }).eq('id', inv.id));
      toast('Status dikemas kini'); go('#/invois/' + inv.id + '?t=' + Date.now());
    } catch (err) { fail(err); }
  };
  document.getElementById('del').onclick = async () => {
    if (!(await confirmSheet('Padam invois?', `${inv.invoice_no} akan dipadam terus.`, 'Padam', true))) return;
    try { await must(sb.from('invoices').delete().eq('id', inv.id)); toast('Invois dipadam'); go('#/a/invois'); }
    catch (err) { fail(err); }
  };
}
