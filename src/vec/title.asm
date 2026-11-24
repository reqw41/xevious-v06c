; Стартовый экран: логотип CPC (прямоугольник, сжатый LZB, tools/vectitle.js -> build/gen/vec_title.inc) со своей
; палитрой, надписи — своим шрифтом (TT_TXT); «PRESS FIRE TO START» мигает (рисуется XOR раз в 32 кадра).
; Таблицы рекордов нет: под логотипом «HIGH SCORE» и рекорд 3F21h. Огонь — игра. Лежит перед буфером фона (game.asm).
; title_skip = 1 — без титула (стенд сверки tools/vec/lockvec.js).
title_show:
	ld	a,(title_skip)
	or	a
	ret	nz
	call	title_pic
	call	tt_hi		; рекорд под «HIGH SCORE»
	call	tt_press
	xor	a
	ld	(tt_cnt),a
.w:	call	frame_in	; каждый кадр — опрос ввода
	call	title_cheat	; F1 + F3 — бесконечные жизни, G — неуязвимость: сразу игра
	jp	nz,.go
	ld	a,(0x3d42)
	ld	hl,SM_3041	; огонь
	and	(hl)
	jp	nz,.go
	ld	hl,tt_cnt
	inc	(hl)
	ld	a,(hl)
	and	31
	call	z,tt_press	; раз в 32 кадра: надпись — нет / есть
	jp	.w
.go:	call	scr_clear
	ld	hl,VPAL
	ld	(pal_ptr),hl
	ld	a,1
	ld	(pal_req),a
	xor	a
	ld	(vframes),a
	ret

; картинка титула и его палитра (прокрутка FFh): экран чистый, логотип LZB -> буфер TL_BUF (свободные столбцы
; экрана) -> на место по столбцам, буфер стереть; надписи
title_pic:
	call	scr_clear
	ld	hl,TITLE_PAL
	ld	(pal_ptr),hl
	ld	a,0xff
	ld	(vscroll),a
	ld	a,1
	ld	(pal_req),a
	ld	hl,TITLE_Z
	ld	de,TL_BUF
	call	lzb_unpack
	ld	hl,TL_BUF
	ld	d,0xc0 + TL_C0
	ld	b,2		; плоскости C000h, E000h
.p:	ld	c,TL_W
.c:	push	bc
	ld	e,TL_R0
	ld	b,TL_H
.rw:	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	e
	dec	b
	jp	nz,.rw
	inc	d
	pop	bc
	dec	c
	jp	nz,.c
	ld	a,d
	add	a,32 - TL_W
	ld	d,a
	dec	b
	jp	nz,.p
	ld	hl,TL_BUF
	ld	bc,TL_LEN
.z:	ld	(hl),0
	inc	hl
	dec	bc
	ld	a,b
	or	c
	jp	nz,.z
	ld	hl,TT_TXT	; надписи: столбец (0 — конец), строка памяти, строка знаков
.t:	ld	a,(hl)
	or	a
	ret	z
	call	tt_str
	inc	hl
	jp	.t
; мигающая надпись (XOR: второй вывод стирает)
tt_press:
	ld	hl,TT_PRESS
; HL — столбец, строка памяти, знаки до 0FFh (HL остаётся на 0FFh)
tt_str:	ld	b,(hl)
	inc	hl
	ld	c,(hl)
	inc	hl
	jp	txt_str

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
