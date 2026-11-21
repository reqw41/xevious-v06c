'use strict';
// Загрузчик JS-модели логики Xevious: все файлы папки, экспортирующие procs (кроме platform.js).
// Процедура: { at, name, fn(m) -> {регистры-выходы}, out: ['a', 'hl', ...], pop: байт стековых аргументов }.
const fs = require('fs');
const path = require('path');
const procs = [];
const seen = new Map();
for (const f of fs.readdirSync(__dirname).sort()) {
  if (!f.endsWith('.js') || f === 'index.js' || f === 'platform.js') continue;
  const mod = require(path.join(__dirname, f));
  for (const p of mod.procs || []) {
    if (seen.has(p.at)) throw new Error(`${p.name}: адрес ${p.at.toString(16)} уже занят ${seen.get(p.at)}`);
    seen.set(p.at, p.name); procs.push(p);
  }
}
module.exports = { procs };
