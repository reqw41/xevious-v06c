; Рекорд на титуле (src/vec/title.asm) — лежит перед буфером фона: «HIGH SCORE» красным и 6 цифр рекорда 3F21h
; без ведущих нулей белым, под логотипом (место — TT_HICOL, TT_HIY из tools/vectitle.js).
tt_hi:	ld	hl,S_HI
	ld	bc,TT_HICOL * 256 + 255 - TT_HIY
	call	txt_str
	ld	hl,TT_HIBUF
	ld	(hl),0xf2	; белый
	inc	hl
	ex	de,hl
	ld	hl,0x3f21
	call	hud_num
	ld	a,0xff
	ld	(de),a
	ld	hl,TT_HIBUF
	ld	bc,(TT_HICOL + 11) * 256 + 255 - TT_HIY
	jp	txt_str
S_HI:	db	0xf3,CH_H,CH_I,CH_G,CH_H,HUD_SP,CH_S,CH_C,CH_O,CH_R,CH_E,0xff


; LZB (tools/vec/lz.js, длины до 255): HL — поток, DE — куда. Байт t: 00xxxxxx — t+1 литералов; 01llhhhh O —
; длина l+3, смещение hhhh·256+O+1; 10llllll O — длина l+2, смещение O+1; 11llllll [доб.] O0 O1 — длина l+3 (l = 63 —
; ещё байт к длине), смещение O1·256+O0; смещение 0 — конец (смещения < 8000h)
lzb_unpack:
	ld	a,(hl)
	inc	hl
	cp	0x40
	jp	nc,.rp
	inc	a
	ld	c,a
.l:	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	dec	c
	jp	nz,.l
	jp	lzb_unpack
.rp:	cp	0x80
	jp	nc,.r2
	ld	b,a
	rrca
	rrca
	rrca
	rrca
	and	3
	add	a,3
	ld	c,a
	ld	a,b
	and	15
	ld	b,a
	ld	a,(hl)		; B:A — смещение − 1
	inc	hl
	jp	.cp
.r2:	cp	0xc0
	jp	nc,.r3
	and	63
	add	a,2
	ld	c,a
	ld	b,0
	ld	a,(hl)
	inc	hl
	jp	.cp
.r3:	and	63
	cp	63
	jp	nz,.s
	add	a,(hl)
	inc	hl
.s:	add	a,3
	ld	c,a
	ld	a,(hl)
	inc	hl
	ld	b,(hl)
	inc	hl
	sub	1		; B:A = смещение − 1; было 0 — конец
	jp	nc,.cp
	dec	b
	ret	m
.cp:	push	hl		; HL = DE − (B:A + 1) = DE + ~B:A
	cpl
	add	a,e
	ld	l,a
	ld	a,b
	cpl
	adc	a,d
	ld	h,a
.c:	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	dec	c
	jp	nz,.c
	pop	hl
	jp	lzb_unpack


; Конец полного расчёта строки карты: запомнить AF/BC выхода (DE/HL постоянны).
cache_map_save:
	push	af
	pop	hl
	ld	(cache_map_af+1),hl
	ld	h,b
	ld	l,c
	ld	(cache_map_bc+1),hl
cache_map_fast:
cache_map_bc:
	ld	bc,0
	ld	de,ROWBUF+17
cache_map_af:
	ld	hl,0
	push	hl
	pop	af
	ld	hl,ROWBUF+32
	ret
cache_map_dirty:		; запись в карту: ключ недействителен (AF сохраняется)
	push	af
	xor	a
	ld	(cache_map_key+2),a
	pop	af
	ret

; читы (src/vec/text_tl.asm): HL — адрес записи попадания по кораблю (PL_HIT или 0037h — неуязвимость)
god_set:
	ld	(p_erase_air.hitw+1),hl
	ld	(p_erase_bullets.hitw+1),hl
	ld	(p_erase_sparks.hitw+1),hl
	ld	(z_hitpl.hitw+1),hl
	ret
