'use strict';
// То же игровое состояние, которое сверяет lockvec (без байтов прерывания).
const ISR = new Set([0x3d3a, 0x3d3b, 0x3d3c, 0x3d3d, 0x3d3f, 0x3f2f]);
for (let a = 0x3d42; a <= 0x3d4c; a++) ISR.add(a);
function logicHash(m, L) {
  const b = [], peek = a => m.peek(a);
  for (let a = 0x3ce9; a < 0x3f34; a++) if (!ISR.has(a)) b.push(peek(a));
  for (const [k, a] of Object.entries(L).filter(([k]) => /^SM_[0-9A-F]{4}$/i.test(k)).sort(([a], [b]) => a.localeCompare(b))) b.push(peek(a));
  for (let i = 2; i < 0x20; i++) b.push(peek(L.ROWBUF + i));
  const OVL = require('../cpc/ovl80');
  for (let i = 0; i < 0x2000; i++) b.push(OVL.value(peek, L, 0x6000 + i));
  return require('crypto').createHash('sha256').update(Buffer.from(b)).digest('hex');
}
module.exports = { logicHash, ISR };
