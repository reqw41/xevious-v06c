'use strict';
// Наложение карты i8080 (src/i80/map.asm) для стендов: значение клетки = список изменённых OVL_SET (адрес, код),
// иначе база Андора (3F1Eh — стоит, 3F19h — адрес), иначе данные OVL_IDX/OVL_ENT, иначе 40h.
// rd(a) — чтение памяти i8080, L — метки.
function rect(rd, a) {
  if (!rd(0x3f1e)) return -1;
  const d = (a - (rd(0x3f19) | (rd(0x3f1a) << 8))) & 0xffff;
  return d < 0x180 && (d & 0x3f) < 6 ? 0x10 + 6 * (d >> 6) + (d & 0x3f) : -1;
}
function stat(rd, L, a) {
  const r = ((a - 0x6000) >> 6) & 0x7f, c = a & 0x3f;
  for (let i = rd(L.OVL_IDX + r); i < rd(L.OVL_IDX + r + 1); i += 2) if (rd(L.OVL_ENT + i) === c) return rd(L.OVL_ENT + i + 1);
  return 0x40;
}
function value(rd, L, a) {
  for (let k = L.OVL_SET; k < L.OVL_SET_END; k += 3) if ((rd(k) | (rd(k + 1) << 8)) === a) return rd(k + 2);
  const v = rect(rd, a);
  return v >= 0 ? v : stat(rd, L, a);
}
// значимые клетки данных (неизменны) — один раз на набор меток
const statCache = new WeakMap();
function statMap(rd, L) {
  let s = statCache.get(L);
  if (!s) { s = new Map(); for (let i = 0; i < 0x2000; i++) { const v = stat(rd, L, 0x6000 + i); if (v !== 0x40) s.set(i, v); } statCache.set(L, s); }
  return s;
}
// список изменённых клеток по наложению CPC (cell(i) — байт 6000h+i): [[адрес, код]...]
function initSet(rd, L, cell) {
  const out = [], sm = statMap(rd, L);
  for (let i = 0; i < 0x2000; i++) {
    const v = cell(i), a = 0x6000 + i;
    const r = rect(rd, a), e = r >= 0 ? r : sm.has(i) ? sm.get(i) : 0x40;
    if (v !== e) out.push([a, v]);
  }
  return out;
}
module.exports = { value, initSet };
