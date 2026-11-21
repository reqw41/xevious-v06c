; Экран рекордов титула и ввода имени (src/vec/title.asm) — лежит перед буфером фона
; --- экран рекордов (как у CPC): логотип титула, заголовок, 5 строк «1ST  50000 TOTO»: место и имя белые, очки
; синие, строка ввода имени (tab_cur) — имя красное
TAB_HY	equ	112		; заголовок
TAB_Y	equ	130		; первая строка, шаг 12
TAB_COL	equ	6
tab_screen:
	ld	bc,160 * 256 + 255 - 96	; всё под логотипом — чёрное
	call	scr_rows
	ld	hl,S_BEST
	ld	bc,7 * 256 + 255 - TAB_HY
	call	txt_str
tab_draw:
	ld	hl,HI_TAB - 16 * 4 - 4	; запись 1-го места
	ld	bc,0x500 + 255 - TAB_Y	; B — строк осталось, C — строка памяти
.l:	push	hl
	push	bc
	ld	a,(tab_cur)	; строка ввода (tab_cur = 5 − B): имя красное
	add	a,b
	cp	5
	ld	a,0xf2
	jp	nz,.w
	inc	a
.w:	ld	(tab_nc),a
	call	tab_row
	pop	bc
	push	bc
	ld	hl,TBUF
	ld	b,TAB_COL
	call	txt_str
	pop	bc
	pop	hl
	ld	de,16
	add	hl,de
	ld	a,c
	sub	12
	ld	c,a
	dec	b
	jp	nz,.l
	ret
S_BEST:	db	0xf3,"BEST FIVE PLAYERS",0xff

; запись HL [место (3) 0, очки BCD (3), имя до 0] -> TBUF: цвет, «место очки имя», конец 0FFh
tab_row:
	ld	de,TBUF
	ld	a,0xf2
	ld	(de),a
	inc	de
	ld	b,3
.lr:	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	dec	b
	jp	nz,.lr
	inc	hl
	ld	a,' '
	ld	(de),a
	inc	de
	ld	a,0xf1		; очки — синие
	ld	(de),a
	inc	de
	call	hud_num
	ld	a,' '
	ld	(de),a
	inc	de
	ld	a,(tab_nc)
	ld	(de),a
	inc	de
	ld	b,8
.n:	ld	a,(hl)
	or	a
	jp	z,.e
	ld	(de),a
	inc	hl
	inc	de
	dec	b
	jp	nz,.n
.e:	ld	a,0xff
	ld	(de),a
	ret

; смена экрана титула: tt_mode 0 — титул, 1 — рекорды; рисуется при чёрной палитре
tt_switch:
	call	pal_black
	ld	a,(tt_mode)
	xor	1
	ld	(tt_mode),a
	jp	z,.t
	call	tab_screen
	jp	pal_title
.t:	ld	hl,TITLE_Z	; титул заново (надпись — «есть»: tt_cnt = 0)
	ld	de,0xc000
	call	lz_unpack
	jp	pal_title
pal_black:
	ld	hl,PAL_BLACK
	jp	pal_set
pal_title:
	ld	hl,TITLE_PAL
pal_set:
	ld	(pal_ptr),hl
	ld	a,1
	ld	(pal_req),a
	jp	frame_in	; палитру ставит прерывание


; LZ (tools/vectitle.js): HL — поток, DE — куда. Байт t < 80h — t+1 литералов; иначе повтор длиной (t & 3Fh) + 3
; (бит 6 — ещё байт: длина += 64·байт), смещение назад — 2 байта; смещение 0 — конец
lz_unpack:
	ld	a,(hl)
	inc	hl
	or	a
	jp	m,.m
	inc	a
	ld	b,a
.l:	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	dec	b
	jp	nz,.l
	jp	lz_unpack
.m:	ld	b,a
	and	0x3f
	add	a,3
	ld	c,a
	ld	a,b
	ld	b,0
	and	0x40
	jp	z,.s
	ld	a,(hl)		; длина += 64·байт
	inc	hl
	push	hl
	ld	l,a
	ld	h,0
	add	hl,hl
	add	hl,hl
	add	hl,hl
	add	hl,hl
	add	hl,hl
	add	hl,hl
	add	hl,bc
	ld	b,h
	ld	c,l
	pop	hl
.s:	ld	a,(hl)		; смещение
	inc	hl
	ld	(lz_o),a
	ld	a,(hl)
	inc	hl
	push	hl
	ld	h,a
	ld	a,(lz_o)
	ld	l,a
	or	h
	jp	z,.e
	ld	a,e		; источник = DE − смещение
	sub	l
	ld	l,a
	ld	a,d
	sbc	a,h
	ld	h,a
.c:	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	dec	bc
	ld	a,b
	or	c
	jp	nz,.c
	pop	hl
	jp	lz_unpack
.e:	pop	hl
	ret


