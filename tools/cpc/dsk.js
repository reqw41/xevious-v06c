// Чтение файлов из образа CPC (MV - CPC / EXTENDED, формат DATA, сектора C1..C9).
// Возвращает { имя: { name, data, load, entry, type } } (заголовок AMSDOS снят).
'use strict';
const fs = require('fs');
function readDsk(file, img = fs.readFileSync(file)) {
  const ext = img.slice(0, 8).toString() === 'EXTENDED';
  const ntr = img[0x30], nsd = img[0x31];
  const sizes = [];
  for (let i = 0; i < ntr * nsd; i++) sizes.push(ext ? img[0x34 + i] * 256 : img.readUInt16LE(0x32));
  const sec = new Map(); let off = 0x100;
  for (let t = 0; t < ntr * nsd; t++) {
    if (!sizes[t]) continue;
    const ti = img.slice(off, off + sizes[t]);
    const n = ti[0x15]; let p = 0x100;
    for (let s = 0; s < n; s++) {
      const e = 0x18 + 8 * s, tr = ti[e], sid = ti[e + 2], sz = ti[e + 3];
      const len = ext ? ti.readUInt16LE(e + 6) : 128 << sz;
      sec.set(tr * 256 + sid, ti.slice(p, p + len)); p += len;
    }
    off += sizes[t];
  }
  const block = (b) => Buffer.concat([0, 1].map((k) => { const ls = b * 2 + k; return sec.get(Math.floor(ls / 9) * 256 + 0xc1 + ls % 9); }));
  const dir = Buffer.concat([0, 1, 2, 3].map((i) => sec.get(0xc1 + i)));
  const ents = {};
  for (let i = 0; i < 64; i++) {
    const e = dir.slice(i * 32, i * 32 + 32);
    if (e[0] === 0xe5) continue;
    const nm = (e.slice(1, 9).toString('latin1').trimEnd() + '.' + Buffer.from([...e.slice(9, 12)].map((c) => c & 0x7f)).toString().trimEnd()).toLowerCase();
    (ents[nm] = ents[nm] || []).push({ ex: e[12], rc: e[15], bl: [...e.slice(16, 32)].filter((x) => x) });
  }
  const out = {};
  for (const [name, list] of Object.entries(ents)) {
    list.sort((a, b) => a.ex - b.ex);
    let data = Buffer.concat(list.map((x) => Buffer.concat(x.bl.map(block)).slice(0, x.rc * 128)));
    let sum = 0; for (let i = 0; i < 67; i++) sum += data[i];
    let load = 0, entry = 0, type = 2;
    if ((sum & 0xffff) === data.readUInt16LE(67)) {
      type = data[18]; load = data.readUInt16LE(21); entry = data.readUInt16LE(26);
      const len = data.readUInt16LE(64) | (data[66] << 16);
      data = data.slice(128, 128 + len);
    }
    // окна секторов файла по порядку (Buffer.slice — вид в img): правка через них меняет сам образ
    const secs = list.flatMap((x) => x.bl.flatMap((b) => [0, 1].map((k) => { const ls = b * 2 + k; return sec.get(Math.floor(ls / 9) * 256 + 0xc1 + ls % 9); })));
    out[name] = { name, data: new Uint8Array(data), load, entry, type, secs };
  }
  return out;
}
module.exports = { readDsk };
