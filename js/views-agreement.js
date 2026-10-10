import {
  sb, state, render, loading, esc, icon, rm, fmtDate, fmtRange, fmtDateTime, toast, fail, go, busy, must,
  topbar, nav, waLink, loadSettings, confirmSheet, planPct, planAmounts
} from './lib.js';

let timer;
export function clearAgreementTimers() { clearInterval(timer); }

const TEXT_V2_FROM = '2026-10-04T19:13:12Z'; // butiran penganjur diringkaskan
const BLANK = '<span class="ag-blank">&nbsp;</span>';
const val = (v) => (v && String(v).trim() ? `<b>${esc(v)}</b>` : BLANK);
const CATEGORY = { makanan: 'Makanan & minuman', bukan_makanan: 'Bukan makanan (barangan kering)' };

function days(a, b) {
  if (!a) return '';
  const d = Math.round((new Date(b || a) - new Date(a)) / 86400000) + 1;
  return d > 0 ? `${d} hari` : '';
}
export function leftText(ms) {
  if (ms <= 0) return '0:00';
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}
export const isExpired = (a) => a.status === 'pending' && new Date(a.deadline).getTime() < Date.now();
export function agStatus(a) {
  if (a.status === 'signed') return '<span class="badge green">Ditandatangani</span>';
  if (a.status === 'cancelled') return '<span class="badge gray">Dibatalkan</span>';
  return isExpired(a) ? '<span class="badge red">Tamat masa</span>' : '<span class="badge amber">Menunggu tandatangan</span>';
}

// ---------- Teks perjanjian (diisi automatik) ----------
const isOld = (a) => !!(a?.created_at && a.created_at < TEXT_V2_FROM);
const vendorSign = (v, a) => isOld(a)
  ? `Nama: ${val(v.owner_name)}<br>Jawatan: ${val(v.rep_title)}<br>Nama Perniagaan: ${val(v.business_name)}`
  : `Nama Perniagaan: ${val(v.business_name)}<br>No. Pendaftaran SSM: ${val(v.id_no)}`;
function vendorBlock(v, a) {
  return `<p>Nama Pemilik atau Entiti: ${val(v.owner_name)}<br>
    Nama Perniagaan atau Booth: ${val(v.business_name)}<br>
    No. Pendaftaran SSM: ${val(v.id_no)}<br>
    Alamat: ${val(v.address)}<br>
    ${isOld(a) ? `Nama Wakil: ${val(v.rep_name)}<br>` : ''}
    No. Telefon: ${val(v.phone)}<br>
    Nombor Lot: ${val(a.lot_codes)}<br>
    Kategori Perniagaan: ${val(CATEGORY[v.category] || v.category)}<br>
    ${v.business_type ? `Jenis Perniagaan (ditetapkan penganjur): ${val(v.business_type)}<br>` : ''}
    Produk atau Menu Diluluskan: ${val(v.products)}</p>`;
}

export function agreementDoc(a, v, { signSlot = '' } = {}) {
  const e = a.event_info || {}, o = a.org_info || {};
  const t = Number(a.total) || 0;
  const P = planPct(a.plan), A = planAmounts(a.plan, t);
  const agDate = a.signed_at || a.created_at;
  // Perjanjian yang dicipta sebelum teks dikemas kini kekal dengan teks asal
  const oldText = a.created_at && a.created_at < TEXT_V2_FROM;
  const sig = (src) => (src ? `<img class="ag-sig" src="${esc(src)}" alt="Tandatangan">` : BLANK);
  return `<article class="agreement" id="agdoc">
    <h2 class="ag-title">PERJANJIAN PENYERTAAN VENDOR<br><span>STAILO EVENT</span></h2>
    <p>Perjanjian ini dibuat antara pihak Penganjur dengan Vendor bagi menetapkan terma penyertaan, bayaran tapak serta tanggungjawab sepanjang program berlangsung.</p>

    <h3>BUTIRAN PROGRAM</h3>
    <p>Nama Program: ${val(e.name)}<br>
      Lokasi Program: ${val(e.location)}<br>
      Tarikh Program: ${val(fmtRange(e.start_date, e.end_date))}<br>
      Tempoh Program: ${val(e.duration || days(e.start_date, e.end_date))}<br>
      Waktu Operasi: ${val(e.op_hours)}<br>
      Tarikh Perjanjian: ${val(fmtDate(agDate))}</p>

    ${oldText ? `<h3>BUTIRAN PENGANJUR</h3>
    <p>Nama Entiti Berdaftar: ${val(o.entity)}<br>
      Nama Dagangan: <b>STAILO EVENT</b><br>
      No. Pendaftaran Perniagaan: ${val(o.reg_no)}<br>
      Alamat: ${val(o.address)}<br>
      Nama Wakil: ${val(o.rep_name)}<br>
      Jawatan: ${val(o.rep_title)}<br>
      No. Telefon: ${val(o.phone)}</p>
    <p>Selepas ini dirujuk sebagai “Penganjur”.</p>` : `<p>Nama Penganjur: <b>STAILO EVENT</b><br>
      No. Pendaftaran Perniagaan: ${val(o.reg_no)}</p>
    <p>Selepas ini dirujuk sebagai “Penganjur”.</p>`}

    <h3>BUTIRAN VENDOR</h3>
    <div id="agvendor">${vendorBlock(v, a)}</div>
    <p>Selepas ini dirujuk sebagai “Vendor”.</p>

    <div class="ag-box">
      <b>Ringkasan sewa tapak (lot ${esc(a.lot_codes)}) · pelan ${esc(P.join('/'))}</b>
      <div class="ag-row"><span>Jumlah sewa tapak</span><b>${rm(t)}</b></div>
      <div class="ag-row"><span>Deposit ${P[0]}% (pengesahan tempahan)</span><span>${rm(A[0])}</span></div>
      <div class="ag-row"><span>Ansuran kedua ${P[1]}% (pertengahan program)</span><span>${rm(A[1])}</span></div>
      <div class="ag-row"><span>Baki akhir ${P[2]}% (hari terakhir program)</span><span>${rm(A[2])}</span></div>
    </div>

    <p>Kedua-dua pihak bersetuju dengan terma berikut:</p>

    <h3>1. BAYARAN TAPAK DAN PENGESAHAN TEMPAHAN</h3>
    <p>1.1 Jumlah sewa tapak adalah mengikut harga semasa yang dipaparkan dalam aplikasi bagi program dan lot yang dipilih ketika tempahan dibuat.</p>
    <p>1.2 Bayaran hendaklah dijelaskan mengikut pecahan berikut:<br>
      (a) Bayaran deposit sebanyak ${P[0]}% daripada jumlah sewa tapak bagi mengesahkan tempahan lot;<br>
      (b) Bayaran ansuran kedua sebanyak ${P[1]}% daripada jumlah sewa tapak pada pertengahan tempoh program; dan<br>
      (c) Bayaran baki akhir sebanyak ${P[2]}% daripada jumlah sewa tapak pada hari terakhir program.</p>
    <p>1.3 Tempahan lot hanya disahkan selepas Penganjur menerima deposit ${P[0]}%. Deposit tersebut merupakan sebahagian daripada jumlah sewa tapak.</p>
    <p>1.4 Tarikh kutipan bayaran ansuran kedua dan bayaran baki akhir hendaklah dimaklumkan oleh Penganjur kepada Vendor berdasarkan tempoh program. Vendor hendaklah menyediakan bayaran tersebut secara tunai untuk kutipan oleh wakil Penganjur di booth masing-masing.</p>
    <p>1.5 Vendor hendaklah menjelaskan semua bayaran mengikut jadual yang ditetapkan. Sekiranya Vendor tidak dapat menjelaskan bayaran pada tarikh yang ditetapkan, Vendor wajib memaklumkan dan berbincang dengan Penganjur sebelum tarikh bayaran tersebut bagi mendapatkan pertimbangan untuk penjadualan semula bayaran.</p>
    <p>1.6 Sebarang jadual bayaran baharu adalah tertakluk kepada persetujuan bertulis Penganjur. Permohonan penjadualan semula tidak secara automatik menangguhkan kewajipan bayaran. Selagi persetujuan bertulis belum diberikan, jadual bayaran asal kekal berkuat kuasa.</p>
    <p>1.7 Jumlah sewa tapak yang disahkan semasa tempahan merupakan kos tetap yang dipersetujui. Vendor tidak dibenarkan meminta pengurangan sewa selepas program atas alasan jualan kurang memberangsangkan.</p>
    <p>1.8 Vendor yang meninggalkan tapak, menghentikan operasi atau menarik diri daripada program tanpa menyelesaikan bayaran tetap bertanggungjawab menjelaskan baki sewa tapak yang dipersetujui, melainkan dipersetujui sebaliknya secara bertulis oleh Penganjur.</p>
    <p>1.9 Sekiranya Vendor meninggalkan tapak tanpa memaklumkan Penganjur dan masih mempunyai tunggakan, Penganjur berhak mengeluarkan notis tuntutan bayaran serta mengambil tindakan tuntutan melalui saluran undang-undang yang bersesuaian.</p>
    <p>1.10 Penganjur berhak menangguhkan atau menolak penyertaan Vendor dalam program akan datang sehingga tunggakan diselesaikan atau jadual bayaran baharu dipersetujui secara bertulis.</p>

    <h3>2. KEMUDAHAN DAN KELENGKAPAN</h3>
    <p>2.1 Penganjur hanya menyediakan khemah dan soket elektrik (plug point) mengikut pakej yang dipersetujui.</p>
    <p>2.2 Vendor hendaklah membawa sendiri meja, kerusi, lampu, kipas serta semua kelengkapan tambahan yang diperlukan untuk menjalankan perniagaan.</p>
    <p>2.3 Vendor dilarang mengambil atau menggunakan meja dan kerusi yang disediakan untuk pelanggan bagi kegunaan booth sendiri.</p>

    <h3>3. WAKTU OPERASI DAN DISIPLIN</h3>
    <p>3.1 Vendor wajib bersedia, membuka booth dan beroperasi mengikut waktu operasi yang dinyatakan dalam Butiran Program sepanjang tempoh program berlangsung.</p>
    <p>3.2 Kelewatan membuka booth selepas waktu mula operasi yang ditetapkan dikenakan denda RM20 bagi setiap kejadian.</p>
    <p>3.3 Kutipan denda kelewatan digunakan untuk membeli hadiah cabutan bertuah vendor pada hari terakhir program.</p>
    <p>3.4 Vendor Muslim hendaklah mengatur urusan perniagaan supaya dapat menunaikan solat pada awal waktu.</p>

    <h3>4. KONSEP DAN KEKEMASAN BOOTH</h3>
    <p>4.1 Booth hendaklah mengikut konsep Melayu Klasik. Penggunaan kain batik serta banner kain atau menu berkonsep Melayu Klasik adalah digalakkan.</p>
    <p>4.2 Bagi lot khemah berukuran 9 kaki × 10 kaki, penggunaan windflag setinggi 3.4 meter atau 5 meter merupakan salah satu keperluan bagi vendor yang ingin meneruskan penyertaan dalam program Stailo Event akan datang.</p>
    <p>4.3 Khemah tambahan hanya dibenarkan dalam warna putih, hitam atau khaki, tertakluk kepada ruang dan kebenaran Penganjur.</p>
    <p>4.4 Penggunaan kanvas atau tarpaulin berwarna biru atau oren adalah dilarang.</p>
    <p>4.5 Vendor digalakkan menyediakan bidai khemah lutsinar untuk mengurangkan tempias hujan.</p>
    <p>4.6 Vendor makanan hanya dibenarkan menggunakan lampu warm white dan digalakkan memasangnya pada waktu siang. Vendor barangan kering dibenarkan menggunakan lampu putih.</p>

    <h3>5. AWNING DAN RUANG HADAPAN BOOTH</h3>
    <p>5.1 Pemasangan awning tambahan memerlukan kebenaran Penganjur dan hendaklah menggunakan struktur atau besi yang kukuh.</p>
    <p>5.2 Warna awning yang dibenarkan ialah putih atau khaki sahaja.</p>
    <p>5.3 Vendor dilarang menarik atau mengikat tali, termasuk tali rafia, pada booth vendor lain.</p>
    <p>5.4 Penggunaan payung, meja atau kerusi di hadapan booth hanya dibenarkan dengan kebenaran Penganjur, tertakluk kepada ruang yang tersedia dan tidak mengganggu laluan pengunjung.</p>

    <h3>6. PAKAIAN DAN PENGENDALIAN MAKANAN</h3>
    <p>6.1 Vendor dan pekerja digalakkan memakai pakaian berunsur Melayu Klasik.</p>
    <p>6.2 Pemakaian selipar dan seluar pendek tidak dibenarkan. Kuku hendaklah dipotong kemas dan penutup kepala yang sesuai hendaklah digunakan.</p>
    <p>6.3 Vendor makanan hendaklah menyediakan dokumen berikut:<br>
      (a) SSM atau sijil perniagaan;<br>
      (b) Sijil pengendalian makanan; dan<br>
      (c) Bukti suntikan tifoid (typhoid) yang masih sah.</p>
    <p>6.4 Semua pekerja yang mengendalikan makanan wajib mempunyai suntikan tifoid yang masih sah.</p>
    <p>6.5 Pengendali makanan hendaklah memakai uniform atau apron, penutup kepala, kasut bertutup serta sarung tangan hitam pakai buang atau sarung tangan plastik putih.</p>
    <p>6.6 Vendor hendaklah memastikan penampilan, kebersihan diri dan kebersihan pekerja sentiasa terjaga.</p>

    <h3>7. KATEGORI PRODUK DAN PERUBAHAN MENU</h3>
    <p>7.1 Vendor tidak dibenarkan mencampurkan kategori makanan, minuman dan barangan kering dalam satu booth tanpa kebenaran Penganjur.</p>
    <p>7.2 Sebarang pertukaran menu hendaklah dibincangkan dengan Penganjur terlebih dahulu dan mendapatkan kelulusan sebelum dilaksanakan.</p>
    <p>7.3 Jika sambutan jualan kurang memberangsangkan, Vendor hendaklah berbincang dengan Penganjur sebelum membuat keputusan untuk menutup booth atau meninggalkan program lebih awal.</p>
    <p>7.4 Perbincangan boleh meliputi penambahbaikan susun atur produk, persediaan booth, promosi atau penyesuaian menu.</p>

    <h3>8. KEBERSIHAN DAN PENGURUSAN SAMPAH</h3>
    <p>8.1 Vendor hendaklah membawa:<br>
      (a) Plastik sampah hitam yang tebal;<br>
      (b) Penyapu dan penyodok sampah;<br>
      (c) Peralatan asas membersihkan booth; dan<br>
      (d) Tong atau bekas air sendiri.</p>
    <p>8.2 Vendor bertanggungjawab menjaga kebersihan bahagian hadapan, belakang, kiri dan kanan booth sepanjang program sehingga selesai hari terakhir.</p>
    <p>8.3 Semua sampah hendaklah dikumpulkan dan dibuang sendiri oleh Vendor ke tempat pembuangan yang ditetapkan.</p>
    <p>8.4 Sampah tidak boleh ditinggalkan di tepi booth, di laluan pengunjung atau dibuang merata-rata.</p>
    <p>8.5 Vendor hendaklah mengelakkan penggunaan plastik sampah yang terlalu nipis. Jika beg sampah terlalu berat, muatannya hendaklah dikurangkan atau diangkat oleh dua orang bagi mengelakkan beg pecah.</p>
    <p>8.6 Kawasan booth hendaklah dibersihkan sebelum Vendor meninggalkan tapak setiap malam.</p>
    <p>8.7 Vendor digalakkan membantu membersihkan meja makan pelanggan berhampiran booth serta menyusun kerusi yang berselerak apabila berkesempatan.</p>

    <h3>9. BEKALAN AIR DAN PENGURUSAN CUCIAN</h3>
    <p>9.1 Penganjur tidak menyediakan tempat basuhan atau sinki di tapak program.</p>
    <p>9.2 Vendor makanan dan minuman wajib membawa tong atau bekas air sendiri serta menyediakan bekalan air bersih yang mencukupi sepanjang waktu operasi.</p>
    <p>9.3 Vendor digalakkan membawa bekas tambahan untuk menyimpan air bersih.</p>
    <p>9.4 Vendor hendaklah menyediakan bekas khas bagi menampung air basuhan terpakai.</p>
    <p>9.5 Air basuhan dan sisa makanan tidak boleh dibuang ke dalam longkang, ke atas jalan atau di kawasan booth.</p>
    <p>9.6 Vendor dilarang mencuci ayam atau ikan mentah, kawah, periuk belanga atau peralatan lain di kawasan yang tidak dibenarkan.</p>
    <p>9.7 Vendor bertanggungjawab menguruskan sendiri keperluan bekalan air dan cucian masing-masing.</p>

    <h3>10. TONG AIS DAN BEKALAN AIS</h3>
    <p>10.1 Semua tempahan tong ais dan bekalan ais sepanjang program hendaklah dibuat melalui pembekal ais rasmi yang dilantik oleh Penganjur sahaja.</p>
    <p>10.2 Vendor dilarang membuat tempahan atau membawa masuk bekalan ais daripada pembekal luar sepanjang tempoh program.</p>
    <p>10.3 Larangan tersebut termasuk:<br>
      (a) Membuat tempahan sendiri daripada pembekal ais lain;<br>
      (b) Memanggil lori atau van pembekal ais luar masuk ke tapak program; dan<br>
      (c) Mengatur penghantaran ais terus ke booth tanpa melalui pembekal rasmi.</p>
    <p>10.4 Vendor hendaklah menganggarkan keperluan ais lebih awal bagi memudahkan penyelarasan bekalan, penghantaran dan pergerakan kenderaan di tapak program.</p>

    <h3>11. SEMPADAN LOT DAN SUSUNAN TAPAK</h3>
    <p>11.1 Semua meja, peralatan dan persediaan booth hendaklah berada dalam sempadan lot yang ditetapkan.</p>
    <p>11.2 Persetujuan vendor bersebelahan tidak membenarkan Vendor menggunakan ruang laluan pengunjung atau meletakkan peralatan di luar sempadan lot.</p>
    <p>11.3 Sebarang perpindahan booth, termasuk ke lot kosong, memerlukan perbincangan dan kelulusan Penganjur. Vendor tidak dibenarkan berpindah sendiri.</p>
    <p>11.4 Vendor yang mendaftar lebih awal diberi peluang memilih tapak terlebih dahulu.</p>
    <p>11.5 Kadar sewa bagi setiap lot adalah sebagaimana dipaparkan dalam aplikasi dan disahkan semasa tempahan dibuat, selaras dengan klausa 1.1.</p>
    <p>11.6 Penganjur berhak menyesuaikan susunan tapak apabila terdapat kekosongan booth atau keperluan operasi.</p>
    <p>11.7 Sebarang perubahan kedudukan akan dimaklumkan kepada Vendor yang terlibat. Vendor hendaklah memberikan kerjasama bagi memastikan susunan booth, laluan pengunjung dan perjalanan program lebih teratur.</p>

    <h3>12. KEHARMONIAN DAN PENYELESAIAN ISU</h3>
    <p>12.1 Vendor hendaklah menjaga hubungan baik sesama vendor dan dengan Penganjur.</p>
    <p>12.2 Vendor tidak boleh sengaja mencetuskan pergaduhan, menyebarkan cerita yang merosakkan keharmonian atau berulang kali menimbulkan masalah sepanjang program.</p>
    <p>12.3 Sebarang masalah atau aduan berhubung Penganjur atau perjalanan program hendaklah dikemukakan terus kepada Penganjur untuk dibincangkan dan diselesaikan dengan baik.</p>
    <p>12.4 Jika Vendor didapati melakukan perbuatan yang dinyatakan dalam klausa 12.2, Penganjur berhak mengambil tindakan berikut:<br>
      (a) Mengeluarkan Vendor daripada kumpulan komunikasi vendor; dan/atau<br>
      (b) Tidak menawarkan penyertaan dalam program Stailo Event akan datang.</p>

    <h3>13. PENGAKUAN DAN PERSETUJUAN</h3>
    <p>13.1 Penganjur dan Vendor mengakui bahawa mereka telah membaca, memahami dan bersetuju dengan terma dalam perjanjian ini.</p>
    <p>13.2 Vendor bertanggungjawab memaklumkan peraturan yang berkaitan kepada semua pekerjanya serta memastikan pematuhan sepanjang penyertaan.</p>
    <p>13.3 Sebarang perubahan kepada terma perjanjian ini hendaklah dipersetujui secara bertulis oleh kedua-dua pihak, tertakluk kepada peruntukan penjadualan semula bayaran dalam klausa 1.5 dan 1.6 serta kuasa penyesuaian susunan tapak dalam klausa 11.6.</p>

    <div class="ag-signs">
      <div class="ag-sign">
        <h3>PENGESAHAN PIHAK PENGANJUR</h3>
        <p>${oldText ? `Nama Wakil: ${val(o.rep_name)}<br>Jawatan: ${val(o.rep_title)}<br>Bagi Pihak Entiti: ${val(o.entity)}` : `Nama Penganjur: <b>STAILO EVENT</b><br>No. Pendaftaran Perniagaan: ${val(o.reg_no)}`}</p>
        <div class="ag-sigbox">${sig(a.org_signature)}</div>
        <p>Tandatangan<br>Tarikh: ${val(fmtDate(a.created_at))}</p>
      </div>
      <div class="ag-sign">
        <h3>PENGESAHAN PIHAK VENDOR</h3>
        <p id="agvsign">${vendorSign(v, a)}</p>
        <div class="ag-sigbox">${signSlot || sig(a.signature)}</div>
        <p>Tandatangan<br>Tarikh: ${val(a.signed_at ? fmtDateTime(a.signed_at) : '')}</p>
        ${a.signed_at ? `<p class="ag-stamp">Ditandatangani secara digital melalui ID vendor <b>${esc(v.vendor_code || '')}</b> dalam aplikasi Stailo Event pada ${esc(fmtDateTime(a.signed_at))}.<br>Rujukan: ${esc(a.id)}</p>` : ''}
      </div>
    </div>
  </article>`;
}

// ---------- Kotak tandatangan (jari / tetikus) ----------
function signaturePad(canvas) {
  const ctx = canvas.getContext('2d');
  let drawing = false, last = null, length = 0;
  const fit = () => {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
    length = 0;
  };
  fit();
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointerdown', (e) => { drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId); e.preventDefault(); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    length += Math.hypot(p.x - last.x, p.y - last.y); last = p; e.preventDefault();
  });
  const end = () => { drawing = false; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  return {
    clear: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); length = 0; },
    isEmpty: () => length < 40,
    toPng: () => {
      // Kecilkan ke saiz tetap supaya ringan
      const out = document.createElement('canvas');
      out.width = 600; out.height = Math.round(600 * canvas.height / canvas.width);
      out.getContext('2d').drawImage(canvas, 0, 0, out.width, out.height);
      return out.toDataURL('image/png');
    }
  };
}
export { signaturePad };

// Muat turun = simpan sebagai PDF melalui menu cetak telefon / komputer
export function downloadPdf(name) {
  const old = document.title;
  document.title = name.replace(/[^\w\- ]+/g, '').trim() || 'Perjanjian';
  document.body.classList.add('print-agreement');
  const done = () => { document.title = old; document.body.classList.remove('print-agreement'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 3000);
}

// =============================================================
// Paparan satu perjanjian: /perjanjian/:id
// =============================================================
export async function agreementView({ id }) {
  loading();
  const admin = state.profile.role === 'admin';
  const [a, s] = await Promise.all([
    must(sb.from('agreements').select('*, vendor:profiles(vendor_code,business_name,owner_name,phone,id_no,address,rep_name,products,category,business_type)').eq('id', id).single()),
    loadSettings(true)
  ]);
  const p = a.vendor || {};
  const signable = !admin && a.status === 'pending' && !isExpired(a);
  // Butiran vendor: salinan semasa tandatangan, atau profil semasa jika belum
  const v = a.status === 'signed' ? { ...a.vendor_info } : {
    owner_name: p.owner_name, business_name: p.business_name, id_no: p.id_no, address: p.address,
    rep_name: p.rep_name || p.owner_name, rep_title: 'Pemilik', phone: p.phone, products: p.products,
    vendor_code: p.vendor_code, category: p.category, business_type: p.business_type
  };
  const fileName = `Perjanjian ${a.lot_codes} ${v.business_name || ''}`;
  const back = admin ? '#/a/perjanjian' : '#/perjanjian';
  const link = location.origin + location.pathname + '#/perjanjian/' + a.id;

  let banner = '';
  if (a.status === 'signed') banner = `<div class="card row no-print" style="background:var(--green-soft);color:var(--green)">${icon('check', 24)}<div><b>Perjanjian telah ditandatangani</b><div class="small">Lot ${esc(a.lot_codes)} dikunci atas nama ${esc(v.business_name)}. Perjanjian ini disimpan kekal dan tidak boleh dipadam.</div></div></div>`;
  else if (a.status === 'cancelled') banner = `<div class="card no-print" style="background:var(--card-2)"><b>Perjanjian dibatalkan</b><div class="small muted">Tempahan lot ${esc(a.lot_codes)} telah dibatalkan oleh penganjur.</div></div>`;
  else if (isExpired(a)) banner = `<div class="card stack no-print" style="background:var(--red-soft)"><b>Masa untuk menandatangani telah tamat</b><div class="small">${admin ? 'Vendor tidak menandatangani dalam masa yang ditetapkan. Anda boleh beri masa tambahan atau buka semula lot.' : 'Sila hubungi penganjur untuk mendapatkan masa tambahan.'}</div>
      ${!admin && s.phone ? `<a class="btn ghost sm" style="align-self:flex-start" target="_blank" rel="noopener" href="${esc(waLink(s.phone, `Salam, saya ${v.business_name} (ID ${v.vendor_code}). Masa tandatangan perjanjian lot ${a.lot_codes} telah tamat. Boleh beri masa tambahan?`))}">${icon('wa', 16)} WhatsApp penganjur</a>` : ''}</div>`;
  else banner = `<div class="row no-print ag-timer" id="timer">${icon('clock', 18)}<span></span></div>`;

  const signSlot = signable ? `<span class="ag-sig-hint" id="sigpreview">Tandatangan anda akan dipaparkan di sini</span>` : '';

  render(`<div class="page" style="padding-bottom:24px">
    ${topbar('Perjanjian', { back, sub: `Lot ${esc(a.lot_codes)} · ${esc(a.event_info?.name || '')}`, right: agStatus(a) })}
    <div class="content">
      ${banner}
      ${a.status === 'signed' ? `<button class="btn block no-print" id="pdf">${icon('upload', 18).replace('M12 16V4M7 9l5-5 5 5', 'M12 4v12M7 11l5 5 5-5')} Muat turun PDF</button>` : ''}
      ${signable ? `<div class="card stack no-print" style="background:var(--accent-soft)"><div class="small">Tempahan anda telah <b>diluluskan</b>. Sila baca perjanjian, semak butiran anda dan tandatangan di bahagian bawah untuk mengesahkan lot.</div><a class="btn" href="#" id="tosign">${icon('edit', 18)} Pergi ke tempat tandatangan</a></div>` : ''}
      ${agreementDoc(a, v, { signSlot })}
      ${signable ? `
      <form class="card stack no-print" id="sf">
        <b>Butiran vendor (untuk perjanjian)</b>
        <label class="field">Nama pemilik atau entiti<input class="input" name="owner_name" required value="${esc(v.owner_name)}"></label>
        <label class="field">Nama perniagaan atau booth<input class="input" name="business_name" required value="${esc(v.business_name)}"></label>
        <label class="field">No. pendaftaran SSM<input class="input" name="id_no" required value="${esc(v.id_no)}"></label>
        <label class="field">Alamat<textarea class="input" name="address" rows="2" required>${esc(v.address)}</textarea></label>
        
        <label class="field">No. telefon<input class="input" name="phone" type="tel" required value="${esc(v.phone)}"></label>
        <label class="field">Produk atau menu<textarea class="input" name="products" rows="2" required placeholder="Cth: Nasi lemak, air kelapa">${esc(v.products)}</textarea></label>
        <div class="sign-area" id="signarea">
          <div class="row between"><b>Tandatangan di sini ${icon('edit', 16)}</b><button type="button" class="btn ghost sm" id="clear">Padam</button></div>
          <canvas id="pad" class="sig-pad" aria-label="Kotak tandatangan vendor"></canvas>
          <div class="small muted">Gunakan jari (atau tetikus) untuk menandatangani di dalam kotak putih di atas.</div>
        </div>
        <label class="row" style="align-items:flex-start;gap:10px;font-size:14px"><input type="checkbox" name="agree" required style="margin-top:3px"> Saya telah membaca, memahami dan bersetuju dengan semua terma dalam perjanjian ini.</label>
        <label class="field">Taip ID vendor anda untuk mengesahkan tandatangan<input class="input" name="code" required autocomplete="off" autocapitalize="characters" placeholder="${esc(v.vendor_code || 'V001')}"></label>
        <button class="btn block" type="submit">${icon('edit', 18)} Tandatangan &amp; sahkan lot</button>
      </form>` : ''}
      ${admin && a.status === 'pending' ? `<div class="grid2 no-print">
          <button class="btn" id="extend">${icon('clock', 18)} Beri ${s.sign_minutes || 60} minit lagi</button>
          ${p.phone ? `<a class="btn ghost" target="_blank" rel="noopener" href="${esc(waLink(p.phone, signMsg(a, p, link)))}">${icon('wa', 18)} Ingatkan vendor</a>` : '<span></span>'}
        </div>` : ''}
      ${a.invoice_id ? `<a class="btn ghost block no-print" href="#/invois/${a.invoice_id}">${icon('file', 18)} Lihat invois</a>` : ''}
    </div>${admin ? '' : nav('#/perjanjian')}</div>`);

  // Kiraan masa
  const span = document.querySelector('#timer span');
  if (span) {
    const end = new Date(a.deadline).getTime();
    const tick = () => {
      const left = end - Date.now();
      span.textContent = left > 0 ? `${admin ? 'Vendor perlu tandatangan dalam' : 'Sila tandatangan dalam masa'} ${leftText(left)}` : 'Masa tamat';
      if (left <= 0) { clearInterval(timer); setTimeout(() => go(location.hash), 800); }
    };
    clearInterval(timer); tick(); timer = setInterval(tick, 1000);
  }
  const pdf = document.getElementById('pdf');
  if (pdf) pdf.onclick = () => downloadPdf(fileName);
  const ext = document.getElementById('extend');
  if (ext) ext.onclick = () => busy(ext, async () => {
    try { await must(sb.rpc('admin_extend_agreement', { p_id: a.id })); toast('Masa tandatangan dilanjutkan'); go('#/perjanjian/' + a.id + '?t=' + Date.now()); }
    catch (err) { fail(err); }
  });

  if (!signable) return;
  const padEl = document.getElementById('pad');
  const pad = signaturePad(padEl);
  const preview = () => {
    const box = document.getElementById('sigpreview');
    if (!box) return;
    box.outerHTML = pad.isEmpty()
      ? '<span class="ag-sig-hint" id="sigpreview">Tandatangan anda akan dipaparkan di sini</span>'
      : `<img class="ag-sig" id="sigpreview" src="${pad.toPng()}" alt="Tandatangan anda">`;
  };
  padEl.addEventListener('pointerup', preview);
  document.getElementById('clear').onclick = () => { pad.clear(); preview(); };
  document.getElementById('tosign').onclick = (e) => { e.preventDefault(); document.getElementById('signarea').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  const f = document.getElementById('sf');
  // Kemas kini butiran dalam perjanjian semasa menaip
  f.addEventListener('input', () => {
    const d = Object.fromEntries(new FormData(f));
    Object.assign(v, d);
    document.getElementById('agvendor').innerHTML = vendorBlock(v, a);
    document.getElementById('agvsign').innerHTML = vendorSign(v, a);
  });
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (pad.isEmpty()) { document.getElementById('signarea').scrollIntoView({ behavior: 'smooth', block: 'center' }); return toast('Sila turunkan tandatangan di dalam kotak tandatangan', 'error'); }
    const d = Object.fromEntries(new FormData(f));
    if (d.code.trim().toUpperCase() !== String(v.vendor_code || '').toUpperCase()) return toast('ID vendor tidak sepadan', 'error');
    delete d.agree;
    const code = d.code; delete d.code;
    await busy(f.querySelector('button[type=submit]'), async () => {
      try {
        await must(sb.rpc('vendor_sign_agreement', { p_id: a.id, p_signature: pad.toPng(), p_info: d, p_vendor_code: code }));
        state.profile = null; // muat semula profil (butiran dikemas kini)
        clearInterval(timer);
        toast(`Tahniah! Lot ${a.lot_codes} kini sah atas nama ${d.business_name}.`);
        go('#/perjanjian/' + a.id + '?t=' + Date.now());
      } catch (err) { fail(err); }
    });
  };
}

export function signMsg(a, p, link) {
  return `Salam ${p.owner_name || p.business_name || ''},\n\nTempahan lot ${a.lot_codes} (${a.event_info?.name || ''}) telah DILULUSKAN.\n\nSila log masuk ke apps Stailo Event dan tandatangan Perjanjian Penyertaan Vendor sebelum ${fmtDateTime(a.deadline)} untuk mengesahkan lot anda:\n${link}\n\nLot akan dikunci atas nama anda selepas perjanjian ditandatangani. Terima kasih!`;
}

// =============================================================
// Senarai perjanjian: vendor (/perjanjian) & admin (/a/perjanjian)
// =============================================================
export async function agreementsListView(params, query) {
  loading();
  const admin = state.profile.role === 'admin';
  let q = sb.from('agreements').select('id,status,deadline,lot_codes,total,signed_at,created_at,event_info,vendor_info,vendor:profiles(vendor_code,business_name)').order('created_at', { ascending: false }).limit(500);
  if (!admin) q = q.eq('vendor_id', state.profile.id);
  const all = await must(q);
  const tab = query.get('t') || (admin ? 'signed' : 'all');
  const term = (query.get('q') || '').toLowerCase();
  const evName = (a) => a.event_info?.name || '-';
  const bizName = (a) => a.vendor_info?.business_name || a.vendor?.business_name || '-';
  const events = [...new Set(all.map(evName))];
  const evSel = query.get('e') || '';
  let list = all.filter((a) => tab === 'all' || (tab === 'signed' ? a.status === 'signed' : a.status === 'pending'));
  if (evSel) list = list.filter((a) => evName(a) === evSel);
  if (term) list = list.filter((a) => [bizName(a), a.lot_codes, a.vendor_info?.vendor_code, a.vendor?.vendor_code].join(' ').toLowerCase().includes(term));
  const qs = (o) => '#' + (admin ? '/a/perjanjian' : '/perjanjian') + '?' + new URLSearchParams({ t: tab, e: evSel, q: term, ...o }).toString();
  const count = (s) => all.filter((a) => s === 'all' || a.status === s).length;

  render(`<div class="page">${topbar('Perjanjian', { back: admin ? '#/a' : '', sub: admin ? `${count('signed')} ditandatangani` : '' })}
    <div class="content">
      ${admin ? `<div class="tabs" role="tablist">
          <a href="${qs({ t: 'signed' })}" class="${tab === 'signed' ? 'on' : ''}">Ditandatangani (${count('signed')})</a>
          <a href="${qs({ t: 'pending' })}" class="${tab === 'pending' ? 'on' : ''}">Menunggu (${count('pending')})</a>
          <a href="${qs({ t: 'all' })}" class="${tab === 'all' ? 'on' : ''}">Semua</a>
        </div>
        <div class="row">
          ${events.length > 1 ? `<select class="input" id="ev" style="flex:1"><option value="">Semua event</option>${events.map((e) => `<option${e === evSel ? ' selected' : ''}>${esc(e)}</option>`).join('')}</select>` : ''}
          <input class="input" id="q" type="search" placeholder="Cari nama / lot / ID" value="${esc(term)}" style="flex:1">
        </div>` : '<div class="small muted">Perjanjian yang telah ditandatangani disimpan kekal di sini.</div>'}
      <div class="list">${list.length ? list.map((a) => `
        <a class="list-item" href="#/perjanjian/${a.id}">
          <span class="code-tile${a.status === 'signed' ? '' : ' amber'}" style="min-width:48px">${esc(a.lot_codes)}</span>
          <span class="grow"><span class="title">${esc(bizName(a))}</span>
            <span class="small muted">${esc(evName(a))} · ${a.status === 'signed' ? 'Ditandatangani ' + esc(fmtDateTime(a.signed_at)) : a.status === 'pending' ? 'Tamat ' + esc(fmtDateTime(a.deadline)) : 'Dibatalkan'}</span></span>
          ${agStatus(a)}
        </a>`).join('') : '<div class="empty">Tiada perjanjian.</div>'}</div>
    </div>${admin ? nav('') : nav('#/perjanjian')}</div>`);
  const ev = document.getElementById('ev');
  if (ev) ev.onchange = () => go(qs({ e: ev.value }));
  const qi = document.getElementById('q');
  if (qi) qi.onchange = () => go(qs({ q: qi.value }));
}
