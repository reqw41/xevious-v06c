; Надписи (src/vec/text.asm): строки надписей на поле — за тайлами (до таблицы 8A00h)
	include "../../build/gen/vec_msgstr.inc"

; Читы. На титуле (каждый кадр): F1 + F3 — старт игры с читами: бесконечные жизни (NOP вместо DEC (HL)
; в p_death_seq). При каждом старте неуязвимость выключена. NZ — старт с читами.
title_cheat:
	ld	hl,PL_HIT
	call	god_set
	ld	a,(kb_r1)
	and	0x28
	cp	0x28
	ld	a,0x35		; DEC (HL)
	jp	nz,.l
	xor	a		; NOP
.l:	ld	(p_death_seq.livd),a
	sub	0x35
	ret
; В игре с читами: G (нажатие) — неуязвимость вкл/выкл (четыре записи попадания по кораблю — в 0037h, как у
; стендов), со звуком. Вызов — раз в обновление (pause_chk).
cheat_g:
	ld	a,(p_death_seq.livd)
	or	a
	ret	nz
	ld	a,(kb_r4)
	and	0x80
	ld	hl,g_prev
	cp	(hl)
	ret	z
	ld	(hl),a
	or	a
	ret	nz		; отпускание
	ld	hl,(p_erase_air.hitw+1)	; PL_HIT <-> 0037h
	ld	a,l
	xor	(PL_HIT ^ 0x37) & 0xff
	ld	l,a
	ld	a,h
	xor	(PL_HIT ^ 0x37) >> 8
	ld	h,a
	call	god_set
	ld	d,0
	ld	hl,0x0f06
	ld	e,0x40
	jp	plat_sfx

; Кеш строки карты (p_draw_map_row): ключ — MAP_ROW_X; сбрасывается каждой записью в карту (hook_mapw).
; При попадании ROWBUF/FLAG_MAP прежние, регистры на выходе — как после полного расчёта.
cache_map_row:
	ld	hl,(MAP_ROW_X)
cache_map_key:
	ld	de,0xffff	; FFFFh/00xxh — не адрес строки карты
	ld	a,l
	cp	e
	jp	nz,cache_map_miss
	ld	a,h
	cp	d
	jp	z,cache_map_fast
cache_map_miss:
	ld	(cache_map_key+1),hl
	jp	dmr_full
