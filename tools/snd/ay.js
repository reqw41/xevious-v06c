'use strict';
// Свой AY-3-8912: 1 МГц, 3 тона, общий 17-битный шум, 16 форм огибающей, микшер R7.
// Периоды: тон /8 на полуволну, шум /16, шаг огибающей /16 (16 шагов /256).
// Проверено по описанию и таймерам MAME, src/devices/sound/ay8910.{cpp,h}.
const { clocked } = require('./audio');
// Приближённая логарифмическая шкала из локального tools/vendor/vector06js/ay.js.
const LEVEL = [0, .0137, .0205, .0291, .0423, .0618, .0847, .1369,
  .1691, .2647, .3527, .4499, .5704, .6873, .8482, 1];
const MASK = [255, 15, 255, 15, 255, 15, 31, 255, 31, 31, 31, 255, 255, 15];

class AY {
  constructor() {
    this.r = new Uint8Array(14);
    this.toneCount = [0, 0, 0]; this.tone = [0, 0, 0];
    this.noiseCount = 0; this.lfsr = 1;
    this.envCount = 0; this.envStep = 15; this.attack = 0;
    this.hold = true; this.alternate = false; this.holding = false;
  }
  write(reg, value) {
    this.r[reg] = value & MASK[reg];
    if (reg === 13) {
      const shape = value & 15;
      this.attack = shape & 4 ? 15 : 0;
      this.hold = !(shape & 8) || !!(shape & 1);
      this.alternate = shape & 8 ? !!(shape & 2) : !!(shape & 4);
      this.envCount = 0; this.envStep = 15; this.holding = false;
    }
  }
  tick() { // один такт master/8
    for (let ch = 0; ch < 3; ch++) {
      const period = Math.max(1, this.r[2 * ch] | (this.r[2 * ch + 1] << 8));
      // Счётчики считают вверх: смена периода не сбрасывает фазу.
      if (++this.toneCount[ch] >= period) {
        this.toneCount[ch] = 0; this.tone[ch] ^= 1;
      }
    }
    if (++this.noiseCount >= 2 * Math.max(1, this.r[6])) {
      this.noiseCount = 0;
      const feedback = (this.lfsr ^ (this.lfsr >> 3)) & 1;
      this.lfsr = (this.lfsr >> 1) | (feedback << 16);
    }
    const envPeriod = Math.max(1, 2 * (this.r[11] | (this.r[12] << 8)));
    if (!this.holding && ++this.envCount >= envPeriod) {
      this.envCount = 0;
      if (--this.envStep < 0) {
        if (this.hold) {
          if (this.alternate) this.attack ^= 15;
          this.holding = true; this.envStep = 0;
        } else {
          if (this.alternate) this.attack ^= 15;
          this.envStep = 15;
        }
      }
    }
  }
  output() {
    let out = 0;
    for (let ch = 0; ch < 3; ch++) {
      const gate = ((this.r[7] >> ch) & 1 || this.tone[ch]) &&
        ((this.r[7] >> (ch + 3)) & 1 || (this.lfsr & 1));
      if (gate) out += LEVEL[this.r[8 + ch] & 16 ? this.envStep ^ this.attack : this.r[8 + ch] & 15];
    }
    return out / 3;
  }
}

function renderAY(cap, tailFrames = 0) {
  const ay = new AY(), ticksPerFrame = 125000 / cap.hz;
  let frame = -1;
  return clocked(125000, (cap.frames.length + tailFrames) / cap.hz, tick => {
    if (tick) ay.tick();
    const f = Math.floor(tick / ticksPerFrame);
    if (f !== frame && f < cap.frames.length) {
      const fr = cap.frames[f], r = fr.renderR || fr.r;
      for (let reg = 0; reg < 13; reg++) ay.write(reg, r[reg]);
      // Одного снимка R13 недостаточно: сохраняем все реальные записи, даже одинаковые.
      for (const [reg, value] of fr.writes) if (reg === 13) ay.write(reg, value);
      frame = f;
    } else if (f >= cap.frames.length) {
      // Хвост после конца эффекта: гашение источника до фильтров, без обрыва PCM.
      ay.write(8, 0); ay.write(9, 0); ay.write(10, 0);
    }
    return ay.output();
  });
}
module.exports = { AY, LEVEL, renderAY };
