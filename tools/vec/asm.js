#!/usr/bin/env node
'use strict';
/**
 * Сборка i8080 (синтаксис Z80, только команды i8080) ассемблером tools/vendor/asm.js в двоичный образ.
 *   node tools/vec/asm.js src.asm out.rom [--base 0x100] [-D ИМЯ=выр]
 * Образ — байты с адреса base до конца последнего участка, дыры нулями (.rom Вектора грузится с 0100h).
 * Рядом пишется out.lst и out.json (метки).
 */
const fs = require('fs');
const path = require('path');
const { assemble, AsmError, Assembler } = require('../vendor/asm.js');

function build(src, { base = 0x100, defs = {} } = {}) {
  const r = assemble(src, defs);
  let end = base;
  for (const c of r.chunks) {
    if (c.org < base) throw new Error(`${src}: участок 0x${c.org.toString(16)} ниже base 0x${base.toString(16)}`);
    end = Math.max(end, c.org + c.hex.length / 2);
  }
  const img = Buffer.alloc(end - base);
  for (const c of r.chunks) Buffer.from(c.hex, 'hex').copy(img, c.org - base);
  return { img, labels: r.labels, list: r.list };
}

module.exports = { build };

if (require.main === module) {
  const argv = process.argv.slice(2), pos = [], defs = {};
  let base = 0x100;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') base = Number(argv[++i]);
    else if (argv[i] === '-D') { const [k, v] = argv[++i].split('='); defs[k] = new Assembler().eval(v); } else pos.push(argv[i]);
  }
  if (pos.length < 2) { console.error('usage: asm.js src.asm out.rom [--base 0x100] [-D NAME=expr]'); process.exit(2); }
  try {
    const { img, labels, list } = build(pos[0], { base, defs });
    fs.writeFileSync(pos[1], img);
    const stem = pos[1].replace(/\.[^.\/]+$/, '');
    fs.writeFileSync(stem + '.lst', list + '\n');
    fs.writeFileSync(stem + '.json', JSON.stringify(labels, null, 1));
    console.log(`${path.basename(pos[0])}: ${img.length} Б с 0x${base.toString(16)} -> ${pos[1]}`);
  } catch (e) {
    if (e instanceof AsmError) { console.error(`${pos[0]}: ${e.message}`); process.exit(1); }
    throw e;
  }
}
