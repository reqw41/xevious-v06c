'use strict';
// Read-only attribution of queued sprites. Footprints are opaque image bits in
// physical C-plane coordinates, so hardware scrolling cannot move an identity.
function attachSpriteTrace(m, L) {
  const procs = Object.entries(L).filter(([n]) => /^p_[^.]+$/.test(n)).sort((a, b) => a[1] - b[1]);
  const queued = new Map(), ordinal = new Map();
  let current = [];
  const caller = pc => procs.filter(([, a]) => a <= pc).at(-1)?.[0] || 'startup';
  m.addBreak(L.p_main_loop, () => { ordinal.clear(); return false; });
  m.addBreak(L.q_push, () => {
    const r = m.regs, source = caller(m.read16(r.sp) - 3);
    const slot = { p_upd_tabobj: 'TK', p_upd_ground_tiles: 'GI', p_upd_z23: 'ZW', p_upd_z48: 'ZW' }[source];
    const id = `${source}:${slot ? m.peek(L[slot]) : m.read16(r.sp)}:${r.a}`, n = ordinal.get(id) || 0;
    ordinal.set(id, n + 1);
    queued.set(m.read16(L.qptr), { source, id: `${id}:${n}` });
    return false;
  });
  m.addBreak(L.flush, () => {
    current = [];
    for (let q = L.QUEUE; q < m.read16(L.qptr); q += 5) {
      const op = m.peek(q);
      if (op !== 1 && op !== 3) continue;
      const x = m.peek(q + 1), y = m.peek(q + 2), img = m.read16(q + 3);
      const dy = m.peek(img), height = m.peek(img + 1), variant = m.read16(img + 2 + (x & 2));
      const col = (x >> 2) + m.peek(variant) - 1, nb = Math.min(m.peek(variant + 1), 32 - col);
      const clip = m.peek(L.clip_base), y0 = ((y + dy) - m.peek(L.CAM_Y) - clip) & 255;
      const k = y0 >= 240 - clip ? (256 - y0) : 0;
      const h = k ? height - k : Math.min(height, 240 - clip - y0);
      if (col < 0 || col >= 32 || h <= 0 || k >= height) continue;
      const row = (255 - y - dy - k) & 255, bits = new Map();
      for (let c = 0; c < nb; c++) for (let r = 0; r < h; r++) {
        const mask = m.peek(variant + 2 + 3 * (c * height + r + k));
        if (mask !== 255) bits.set((col + c) * 256 + ((row - r) & 255), mask ^ 255);
      }
      current.push({ ...queued.get(q), img, x, y, col, row, nb, h, k, clip, bits,
        sig: [img, x, y, col, row, nb, h, k, clip].join(':') });
    }
    return false;
  });
  return () => current;
}
module.exports = { attachSpriteTrace };
