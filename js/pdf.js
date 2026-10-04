// Penjana PDF ringkas (tanpa pustaka luar): teks Helvetica, garisan, kotak dan gambar JPEG.
const HW = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

// Tukar teks kepada kod WinAnsi (huruf Melayu = ASCII)
function ansi(s) {
  const map = { '—': 0x97, '–': 0x96, '·': 0xb7, '“': 0x93, '”': 0x94, '‘': 0x91, '’': 0x92, '•': 0x95, '×': 0xd7, '…': 0x85 };
  let out = '';
  for (const ch of String(s ?? '')) {
    const c = ch.codePointAt(0);
    if (c >= 32 && c <= 126) out += ch;
    else if (map[ch]) out += String.fromCharCode(map[ch]);
    else if (c >= 0xa0 && c <= 0xff) out += ch;
    else if (c === 10 || c === 13 || c === 9) out += ' ';
    else out += '?';
  }
  return out;
}
const escPdf = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const hex = (c) => { const n = parseInt(c.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => (x / 255).toFixed(3)).join(' '); };

export function textWidth(s, size, bold = false) {
  const t = ansi(s); let w = 0;
  for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); w += (c >= 32 && c <= 126 ? (bold ? HB : HW)[c - 32] : 556); }
  return (w * size) / 1000;
}
export function wrap(s, size, maxW, bold = false) {
  const words = String(s ?? '').split(/\s+/).filter(Boolean); const lines = []; let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (textWidth(t, size, bold) <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function jpegSize(bytes) {
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const m = bytes[i + 1], len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (bytes[i + 5] << 8) | bytes[i + 6], w: (bytes[i + 7] << 8) | bytes[i + 8], n: bytes[i + 9] };
    i += 2 + len;
  }
  return null;
}

export class Pdf {
  constructor() { this.W = 595.28; this.H = 841.89; this.ops = []; this.images = []; }
  // y diukur dari atas halaman
  text(s, x, y, { size = 10, bold = false, color = '#111111', align = 'left' } = {}) {
    let tx = x;
    if (align !== 'left') { const w = textWidth(s, size, bold); tx = align === 'right' ? x - w : x - w / 2; }
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${hex(color)} rg ${tx.toFixed(2)} ${(this.H - y).toFixed(2)} Td (${escPdf(ansi(s))}) Tj ET`);
  }
  line(x1, y1, x2, y2, { color = '#dddddd', width = 0.8 } = {}) {
    this.ops.push(`${hex(color)} RG ${width} w ${x1.toFixed(2)} ${(this.H - y1).toFixed(2)} m ${x2.toFixed(2)} ${(this.H - y2).toFixed(2)} l S`);
  }
  rect(x, y, w, h, { fill = '#f5f5f5' } = {}) {
    this.ops.push(`${hex(fill)} rg ${x.toFixed(2)} ${(this.H - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }
  // bytes = Uint8Array JPEG
  image(bytes, x, y, w, h) {
    const sz = jpegSize(bytes); if (!sz) return;
    const name = 'Im' + (this.images.length + 1);
    this.images.push({ name, bytes, w: sz.w, h: sz.h, cs: sz.n === 1 ? '/DeviceGray' : sz.n === 4 ? '/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]' : '/DeviceRGB' });
    this.ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${(this.H - y - h).toFixed(2)} cm /${name} Do Q`);
  }
  output() {
    const enc = (s) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
    const chunks = []; const offsets = []; let pos = 0;
    const push = (b) => { chunks.push(b); pos += b.length; };
    push(enc('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'));
    const objs = [];
    const content = this.ops.join('\n');
    const imgRefs = this.images.map((im, i) => `/${im.name} ${7 + i} 0 R`).join(' ');
    objs.push('<< /Type /Catalog /Pages 2 0 R >>');
    objs.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << ${imgRefs} >> >> /Contents 6 0 R >>`);
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    objs.push({ dict: `<< /Length ${content.length} >>`, data: enc(content) });
    for (const im of this.images) objs.push({ dict: `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace ${im.cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>`, data: im.bytes });
    objs.forEach((o, i) => {
      offsets.push(pos);
      if (typeof o === 'string') push(enc(`${i + 1} 0 obj\n${o}\nendobj\n`));
      else { push(enc(`${i + 1} 0 obj\n${o.dict}\nstream\n`)); push(o.data); push(enc('\nendstream\nendobj\n')); }
    });
    const xref = pos;
    let x = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach((o) => { x += String(o).padStart(10, '0') + ' 00000 n \n'; });
    x += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    push(enc(x));
    return new Blob(chunks, { type: 'application/pdf' });
  }
}
