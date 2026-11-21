'use strict';
/**
 * Неуязвимость для прогонов на модели (как tools/cpc/godpatch.js у CPC): записи попадания по кораблю в PL_HIT (3F1Bh)
 * после проверки столкновения p_hit_player переводятся на 3F34h (байт не используется). Ищется по байтам образа:
 *   CALL p_hit_player; LD (3F1Bh),A          — air, sparks, zspecial
 *   INC A; LD (3F1Bh),A после LD A,(3F1Bh)    — bullets
 * Возвращает число правок (ожидается 4).
 */
function godPatch(m, L) {
  const lo = L.p_hit_player & 0xff, hi = L.p_hit_player >> 8;
  let n = 0;
  for (let a = 0x100; a < 0x3c00; a++) {
    const b = (k) => m.read(a + k);
    if (b(0) === 0xcd && b(1) === lo && b(2) === hi && b(3) === 0x32 && b(4) === 0x1b && b(5) === 0x3f) { m.write(a + 4, 0x34); n++; }
    else if (b(0) === 0x3a && b(1) === 0x1b && b(2) === 0x3f && b(3) === 0xb7 && b(4) === 0xc2 && b(7) === 0x3c && b(8) === 0x32 && b(9) === 0x1b && b(10) === 0x3f) { m.write(a + 9, 0x34); n++; }
  }
  return n;
}
module.exports = { godPatch };
