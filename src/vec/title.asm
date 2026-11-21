; Стартовый экран: экран CPC перед игрой (логотип, надписи), сжатый своим LZ (tools/vectitle.js ->
; build/gen/vec_title.inc), распаковывается прямо в экран (C000h–FFFFh) со своей палитрой; надпись в строках
; TITLE_BY0..BY1 мигает (на время титула она сохраняется в буфере фона спрайтов — он ещё свободен).
; Раз в 256 кадров титул сменяется экраном рекордов (как у CPC: логотип, BEST FIVE PLAYERS, пять
; строк) и обратно; на время смены палитра чёрная. Огонь — игра. Лежит перед буфером фона (game.asm).
; title_skip = 1 — без титула (стенд сверки tools/vec/lockvec.js).
title_show:
	ld	a,(title_skip)
	or	a
	ret	nz
	call	title_pic
	ld	a,1		; сохранить надпись
	call	tt_copy
	xor	a
	ld	(tt_mode),a
	ld	(tt_cnt),a
.w:	call	frame_in	; каждый кадр — опрос ввода
	ld	a,(kb_r1)	; F1 + F3 — бесконечные жизни
	and	0x28
	cp	0x28
	ld	a,0		; NOP
	jp	z,.lv
	ld	a,(0x3d42)
	ld	hl,SM_3041	; огонь
	and	(hl)
	jp	z,.nf
	ld	a,0x35		; DEC (HL) — обычная игра
.lv:	ld	(p_death_seq.livd),a
	jp	.go
.nf:
	ld	hl,tt_cnt
	inc	(hl)
	jp	nz,.bl
	call	tt_switch	; раз в 256 кадров: титул <-> рекорды
	jp	.w
.bl:	ld	a,(tt_mode)	; на экране рекордов надпись не мигает
	or	a
	jp	nz,.w
	ld	a,(hl)
	and	31
	jp	nz,.w
	ld	a,(hl)		; раз в 32 кадра: надпись — нет / есть
	and	32
	jp	z,.on
	call	tt_off
	jp	.w
.on:	xor	a
	call	tt_copy
	jp	.w
.go:	call	scr_clear
	ld	hl,VPAL
	ld	(pal_ptr),hl
	ld	a,1
	ld	(pal_req),a
	xor	a
	ld	(vframes),a
	ret

; строка ввода имени (tab_cur) — заново: 8 строк экрана чёрные, затем строка таблицы с красным именем
tab_cur_row:
	ld	a,(tab_cur)
	ld	b,a
	add	a,a
	add	a,b
	add	a,a
	add	a,a		; 12·место
	ld	b,a
	ld	a,255 - TAB_Y
	sub	b
	ld	c,a		; строка памяти верха
	ld	a,(tab_cur)
	add	a,a
	add	a,a
	add	a,a
	add	a,a
	ld	e,a
	ld	d,0
	ld	hl,HI_TAB - 16 * 4 - 4
	add	hl,de		; запись
	push	hl
	push	bc
	ld	b,8
	call	scr_rows
	ld	a,0xf3
	ld	(tab_nc),a
	pop	bc
	pop	hl
	push	bc
	call	tab_row
	pop	bc
	ld	hl,TBUF
	ld	b,TAB_COL
	jp	txt_str

; картинка титула и его палитра (прокрутка FFh)
title_pic:
	ld	hl,TITLE_PAL
	ld	(pal_ptr),hl
	ld	a,0xff
	ld	(vscroll),a
	ld	a,1
	ld	(pal_req),a
	ld	hl,TITLE_Z
	ld	de,0xc000
	jp	lz_unpack

; строки надписи: A = 1 — экран -> буфер, 0 — буфер -> экран
tt_copy:
	ld	(.d+1),a
	ld	de,POOL
	ld	b,TITLE_BY1 - TITLE_BY0 + 1
	ld	c,255 - TITLE_BY0
.rw:	ld	h,0xc0
	ld	l,c
.c:
.d:	ld	a,0
	or	a
	jp	z,.ld
	ld	a,(hl)
	ld	(de),a
	jp	.n
.ld:	ld	a,(de)
	ld	(hl),a
.n:	inc	de
	inc	h
	jp	nz,.c
	dec	c
	dec	b
	jp	nz,.rw
	ret
; надпись стереть
tt_off:	ld	b,TITLE_BY1 - TITLE_BY0 + 1
	ld	c,255 - TITLE_BY0
; B строк экрана (обе плоскости) с строки памяти C вниз — чёрные
scr_rows:
.rw:	ld	h,0xc0
	ld	l,c
	xor	a
.c:	ld	(hl),a
	inc	h
	jp	nz,.c
	dec	c
	dec	b
	jp	nz,.rw
	ret

; очистить экран C000h–FFFFh
scr_clear:
	ld	hl,0xc000
.cl:	ld	(hl),0
	inc	hl
	ld	a,h
	or	l
	jp	nz,.cl
	ret

title_skip:	db	0
tt_cnt:		db	0
tt_mode:	db	0		; 0 — титул, 1 — рекорды
tab_nc:		db	0xf2		; цвет имени в строке таблицы
PAL_BLACK:	ds	16		; палитра на время смены экрана
lz_o:		db	0
