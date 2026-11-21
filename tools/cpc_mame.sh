#!/bin/sh
# tools/cpc_mame.sh <script.lua> <снимки_в> — MAME cpc6128 без окна и звука
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT=${2:-$ROOT/ref/cpc/snaps}; rm -rf "$OUT"; mkdir -p "$OUT"
SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy mame cpc6128 \
  -rompath "${CPC_ROMPATH:-$HOME/projects/knightlore-research/cpc/roms}" -flop1 "$ROOT/ref/cpc/xevious.dsk" \
  -script "$1" -video none -sound none -nothrottle -skip_gameinfo -snapshot_directory "$OUT"
