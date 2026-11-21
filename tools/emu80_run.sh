#!/bin/sh
# Запуск образа в Emu80 (Вектор-06Ц) с окном: tools/emu80_run.sh [build/proto.rom]
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ROM="${1:-$ROOT/build/proto.rom}"
APP="${EMU80_APP:-$HOME/Applications/Emu80/Emu80qt_40559_macos/Emu80qt.app/Contents/MacOS}"
TMP="${TMPDIR:-/tmp}/xevious_emu80"; mkdir -p "$TMP"
pkill -f "xevious_emu80" 2>/dev/null || true
cp "$ROM" "$TMP/"
cd "$APP"
nohup ./Emu80qt --platform vector --run "$TMP/$(basename "$ROM")" >"$TMP/emu80.log" 2>&1 &
echo "Emu80 запущен: $(basename "$ROM")"
