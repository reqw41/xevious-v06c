'use strict';
// LZB — сжатие загрузчика (tools/vecboot.js). Байт t:
//   00xxxxxx         — t+1 литералов (1..64)
//   01llhhhh O       — повтор длиной l+3 (3..6), смещение (h·256 + O) + 1 (1..4096)
//   10llllll O       — повтор длиной l+2 (2..65), смещение O + 1 (1..256)
//   11llllll O0 O1   — повтор длиной l+3 (3..65); l = 63 — перед смещением ещё байт: длина += байт; смещение 1..65535
// Метки конца нет: распаковщик останавливается по адресу. Разбор оптимальный по цене в байтах.
function cands(src) {
  const N = src.length, MAXL = 66 + 255, head = new Map(), cand = new Array(N);
  for (let i = 0; i < N; i++) {
    const c = [], key = src[i] | (src[i + 1] << 8), list = head.get(key) || [];
    let best = 1;
    for (let q = list.length - 1, n = 0; q >= 0 && n < 500; q--, n++) {
      const p = list[q]; if (i - p > 65535) break;
      let l = 0; while (i + l < N && src[p + l] === src[i + l] && l < MAXL) l++;
      if (l >= 2 && (l > best || i - p <= 4096)) { c.push([l, i - p]); if (l > best) best = l; }
    }
    cand[i] = c; if (!head.has(key)) head.set(key, []); head.get(key).push(i);
  }
  return cand;
}
function tokCost(l, o) {             // [цена, вид] лучшего токена повтора длины l со смещением o
  let b = [Infinity, 0];
  if (l >= 3 && l <= 66 + 255) b = [l <= 65 ? 3 : 4, 3];
  if (o <= 256 && l <= 65 && 2 < b[0]) b = [2, 2];
  if (o <= 4096 && l >= 3 && l <= 6 && 2 < b[0]) b = [2, 1];
  return b;
}
function pack(src) {
  const N = src.length, cand = cands(src);
  const cost = new Float64Array(N + 1).fill(Infinity), how = new Array(N + 1);
  cost[N] = 0;
  for (let i = N - 1; i >= 0; i--) {
    for (let n = 1; n <= 64 && i + n <= N; n++) { const c = 1 + n + cost[i + n]; if (c < cost[i]) { cost[i] = c; how[i] = [0, n]; } }
    for (const [L, o] of cand[i]) for (let l = 2; l <= L; l++) {
      const [tc, kind] = tokCost(l, o); if (!kind) continue;
      const c = tc + cost[i + l]; if (c < cost[i]) { cost[i] = c; how[i] = [kind, l, o]; }
    }
  }
  const out = [];
  for (let i = 0; i < N;) {
    const h = how[i];
    if (h[0] === 0) out.push(h[1] - 1, ...src.subarray(i, i + h[1]));
    else if (h[0] === 1) out.push(0x40 | ((h[1] - 3) << 4) | ((h[2] - 1) >> 8), (h[2] - 1) & 255);
    else if (h[0] === 2) out.push(0x80 | (h[1] - 2), h[2] - 1);
    else { const n = h[1] - 3; if (n < 63) out.push(0xc0 | n); else out.push(0xff, n - 63); out.push(h[2] & 255, h[2] >> 8); }
    i += h[1];
  }
  return Buffer.from(out);
}
// разбор потока: для каждой команды — (байтов прочитано до записи, записей); для проверки распаковки на месте
function walk(p, n, onWrite) {
  let i = 0, o = 0;
  while (o < n) {
    const t = p[i++];
    if (t < 0x40) { for (let k = 0; k <= t; k++) { i++; onWrite(i, o++); } continue; }
    let l;
    if (t < 0x80) { l = ((t >> 4) & 3) + 3; i++; }
    else if (t < 0xc0) { l = (t & 63) + 2; i++; }
    else { l = (t & 63) + 3; if ((t & 63) === 63) l += p[i++]; i += 2; }
    for (let k = 0; k < l; k++) onWrite(i, o++);
  }
  return i;
}
function unpack(p, n) {
  const o = []; let i = 0;
  while (o.length < n) {
    const t = p[i++];
    if (t < 0x40) { for (let k = 0; k <= t; k++) o.push(p[i++]); continue; }
    let l, off;
    if (t < 0x80) { l = ((t >> 4) & 3) + 3; off = ((t & 15) << 8 | p[i++]) + 1; }
    else if (t < 0xc0) { l = (t & 63) + 2; off = p[i++] + 1; }
    else { l = (t & 63) + 3; if ((t & 63) === 63) l += p[i++]; off = p[i] | (p[i + 1] << 8); i += 2; }
    for (let k = 0; k < l; k++) o.push(o[o.length - off]);
  }
  return Buffer.from(o);
}
module.exports = { pack, unpack, walk };
