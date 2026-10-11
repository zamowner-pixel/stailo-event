// Penjana QR code ringkas (tanpa pustaka luar). Mod byte, aras pembetulan ralat M, versi 1–40.
const ECC_CW = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const ECC_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];

function rawModules(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) { const n = Math.floor(ver / 7) + 2; r -= (25 * n - 10) * n - 55; if (ver >= 7) r -= 36; }
  return r;
}
const dataCodewords = (ver) => Math.floor(rawModules(ver) / 8) - ECC_CW[ver] * ECC_BLOCKS[ver];

function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z & 0xff;
}
function rsDivisor(deg) {
  const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1;
  for (let i = 0; i < deg; i++) {
    for (let j = 0; j < deg; j++) { r[j] = gfMul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; }
    root = gfMul(root, 2);
  }
  return r;
}
function rsRemainder(data, div) {
  const r = new Array(div.length).fill(0);
  for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gfMul(c, f); }); }
  return r;
}

export function qrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text)));
  let ver = 1;
  for (; ver <= 40; ver++) {
    const cc = ver < 10 ? 8 : 16;
    if (4 + cc + bytes.length * 8 <= dataCodewords(ver) * 8) break;
  }
  if (ver > 40) throw new Error('Teks terlalu panjang untuk QR');
  // ---- bit data ----
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach((b) => put(b, 8));
  const cap = dataCodewords(ver) * 8;
  put(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let p = 0xec; bits.length < cap; p ^= 0xec ^ 0x11) put(p, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  // ---- ECC & susunan blok ----
  const nb = ECC_BLOCKS[ver], ecl = ECC_CW[ver], raw = Math.floor(rawModules(ver) / 8);
  const nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb), div = rsDivisor(ecl);
  const blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - ecl + (i < nShort ? 0 : 1)); k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < nShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const cw = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecl || j >= nShort) cw.push(b[i]); });

  // ---- lukis modul ----
  const size = ver * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const setF = (x, y, v) => { m[y][x] = v; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) setF(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  if (ver > 1) {
    const n = Math.floor(ver / 7) + 2;
    const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
    const pos = [6];
    for (let p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p);
    pos.forEach((y, i) => pos.forEach((x, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setF(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
  }
  const format = (mask) => {
    const d = (0 << 3) | mask; // aras M = 00
    let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412, bit = (i) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) setF(8, i, bit(i));
    setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8));
    for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) setF(8, size - 15 + i, bit(i));
    setF(8, size - 8, true);
  };
  format(0);
  if (ver >= 7) {
    let r = ver; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (ver << 12) | r;
    for (let i = 0; i < 18; i++) { const v = ((b >>> i) & 1) === 1, a = size - 11 + (i % 3), c = Math.floor(i / 3); setF(a, c, v); setF(c, a, v); }
  }
  // kod data (zigzag)
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
      if (!fn[y][x] && k < cw.length * 8) { m[y][x] = ((cw[k >>> 3] >>> (7 - (k & 7))) & 1) === 1; k++; }
    }
  }
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  const applyMask = (mk) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mk](x, y)) m[y][x] = !m[y][x]; };
  const penalty = () => {
    let p = 0, dark = 0;
    for (let y = 0; y < size; y++) {
      let rx = 1, ry = 1;
      for (let x = 0; x < size; x++) {
        if (m[y][x]) dark++;
        if (x > 0) {
          if (m[y][x] === m[y][x - 1]) { rx++; if (rx === 5) p += 3; else if (rx > 5) p++; } else rx = 1;
          if (m[x][y] === m[x - 1][y]) { ry++; if (ry === 5) p += 3; else if (ry > 5) p++; } else ry = 1;
        }
        if (x < size - 1 && y < size - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
      }
    }
    // corak menyerupai penanda sudut
    const count = (str) => (str.match(/(?=10111010000|00001011101)/g) || []).length;
    for (let i = 0; i < size; i++) {
      p += 40 * count(m[i].map((b) => (b ? 1 : 0)).join(''));
      p += 40 * count(m.map((r) => (r[i] ? 1 : 0)).join(''));
    }
    return p + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  };
  let best = 0, bestP = Infinity;
  for (let mk = 0; mk < 8; mk++) {
    applyMask(mk); format(mk);
    const p = penalty(); if (p < bestP) { bestP = p; best = mk; }
    applyMask(mk);
  }
  applyMask(best); format(best);
  return m;
}

// Lukis QR ke dalam canvas (modul hitam di atas latar putih, dengan margin 4 modul)
export function drawQr(ctx, text, x, y, px, { dark = '#000', light = '#fff' } = {}) {
  const m = qrMatrix(text), n = m.length, cell = px / (n + 8);
  ctx.fillStyle = light; ctx.fillRect(x, y, px, px);
  ctx.fillStyle = dark;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) ctx.fillRect(Math.floor(x + (c + 4) * cell), Math.floor(y + (r + 4) * cell), Math.ceil(cell), Math.ceil(cell));
}
export function qrSvg(text, size = 220) {
  const m = qrMatrix(text), n = m.length, t = n + 8;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) d += `M${c + 4},${r + 4}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="Kod QR"><rect width="${t}" height="${t}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
