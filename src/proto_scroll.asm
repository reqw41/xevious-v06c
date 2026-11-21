; ============================================================================
; Прототип прокрутки Xevious на Вектор-06Ц (docs/PORT_PLAN.md).
; Поле 240×224 из настоящей карты CPC (зона 1), видимы плоскости C000h/E000h (4 цвета).
; Раз в 2 кадра (25 к/с, как CPC): в прерывании прокрутка +1 строка (порт 03), затем в основном цикле:
;   новая верхняя строка карты -> стереть спрайты -> сдвинуть их -> сохранить фон и вывести сверху вниз
;   -> перенести панель (8 строк + стирание строки под ней).
; Спрайты — заглушки (корабль, прицел), ставятся по байтам (шаг 8 точек).
; Данные — build/gen/proto_data.inc (tools/mkproto.py).
; ============================================================================
SCR_C	equ	0xC0
SCR_E	equ	0xE0
XOFF	equ	36		; сдвиг окна по карте: зона 1 (таблица CPC 03CBh)
FIELD_H	equ	224
SHIP_Y	equ	196
CROSS_DY equ	72

	org	0x100
start:
	di
	ld	sp,0x8000
	ld	a,0xc3
	ld	(0x38),a
	ld	hl,int_h
	ld	(0x39),hl
	ld	a,0x88
	out	(0),a
	xor	a
	out	(2),a
	ld	a,0xff
	out	(3),a
	ld	(scroll),a
	ld	a,1		; палитра чёрная, пока рисуем
	ld	(pal_black),a
	ld	(pal_req),a
	ei
	; очистить экран 8000h..FFFFh
	ld	hl,0x8000
.cl:	xor	a
	ld	(hl),a
	inc	hl
	ld	a,h
	or	a
	jp	nz,.cl
	; первый экран: строка экрана y <- строка карты topy+y, строка памяти FFh-y
	ld	hl,2048-FIELD_H
	ld	(topy),hl
	ld	(curline),hl
	ld	a,0xff
	ld	(currow),a
	ld	a,FIELD_H
	ld	(cnt),a
.il:	ld	hl,(curline)
	ld	a,(currow)
	call	draw_line
	ld	hl,(curline)
	inc	hl
	ld	(curline),hl
	ld	hl,currow
	dec	(hl)
	ld	hl,cnt
	dec	(hl)
	jp	nz,.il
	call	draw_hud
	call	save_draw_cross
	call	save_draw_ship
	xor	a
	ld	(pal_black),a
	inc	a
	ld	(pal_req),a
	ld	(running),a

main:	halt
	ld	a,(go)
	or	a
	jp	z,main
prb_beg:
	; новая верхняя строка: карта topy-1 (по кругу 2048) -> строка памяти scroll
	ld	hl,(topy)
	dec	hl
	ld	a,h
	and	7
	ld	h,a
	ld	(topy),hl
	ld	a,(scroll)
	call	draw_line
prb_line:
	call	restore_ship
	call	restore_cross
	call	move_sprites
	call	save_draw_cross
	call	save_draw_ship
prb_spr:
	call	draw_hud
prb_end:
	xor	a
	ld	(go),a
	jp	main

; ---- прерывание: палитра по запросу; каждый второй кадр — прокрутка +1 и разрешение шага ------------------
int_h:	push	af
	push	hl
	ld	a,(pal_req)
	or	a
	jp	z,.np
	push	bc
	push	de
	ld	hl,PAL
	ld	a,(pal_black)
	or	a
	jp	z,.pp
	ld	hl,black
.pp:	call	set_palette
	xor	a
	ld	(pal_req),a
	pop	de
	pop	bc
.np:	ld	a,(running)
	or	a
	jp	z,.x
	ld	hl,phase
	ld	a,(hl)
	xor	1
	ld	(hl),a
	jp	z,.x
	ld	a,(go)
	or	a
	jp	z,.s
	ld	hl,(overrun)	; основной цикл не успел за 2 кадра
	inc	hl
	ld	(overrun),hl
	jp	.x
.s:	ld	a,(scroll)
	inc	a
	ld	(scroll),a
	out	(3),a
	ld	a,1
	ld	(go),a
.x:	ld	hl,(frames)
	inc	hl
	ld	(frames),hl
	pop	hl
	pop	af
	ei
	ret

; ---- палитра: 16 байт из (HL), в начале кадра --------------------------------------------------------
set_palette:
	ld	de,15
	add	hl,de
	ld	e,15
.l:	ld	a,e
	out	(2),a
	ld	a,(hl)
	out	(0x0c),a
	out	(0x0c),a
	dec	hl
	dec	e
	jp	p,.l
	xor	a
	out	(2),a
	ret

; ---- строка карты: HL = строка карты в точках (0..2047), A = строка памяти ---------------------------
; 15 тайлов -> столбцы 1..30 плоскостей C и E
draw_line:
	ld	(dl_row),a
	ld	a,l
	and	15
	add	a,a
	add	a,a
	ld	(.tb+1),a	; TILES кратен 256: младший байт = номер строки в тайле × 4
	ld	a,l
	and	0xf0
	ld	l,a
	add	hl,hl
	add	hl,hl		; (Y >> 4) * 64
	ld	de,MAP+XOFF
	add	hl,de
	ld	(dl_map),hl
	ld	a,(dl_row)
	ld	l,a
	ld	h,SCR_C+1
	ld	a,15
	ld	(dl_cnt),a
.t:	push	hl
	ld	hl,(dl_map)
	ld	a,(hl)
	inc	hl
	ld	(dl_map),hl
	ld	l,a
	ld	h,0
	add	hl,hl
	add	hl,hl
	add	hl,hl
	add	hl,hl
	add	hl,hl
	add	hl,hl
.tb:	ld	de,TILES
	add	hl,de
	ex	de,hl
	pop	hl
	ld	a,(de)		; C левый
	ld	(hl),a
	inc	de
	inc	h
	ld	a,(de)		; C правый
	ld	(hl),a
	inc	de
	ld	a,h
	add	a,0x1f
	ld	h,a
	ld	a,(de)		; E левый
	ld	(hl),a
	inc	de
	inc	h
	ld	a,(de)		; E правый
	ld	(hl),a
	ld	a,h
	sub	0x1f
	ld	h,a
	ld	a,(dl_cnt)
	dec	a
	ld	(dl_cnt),a
	jp	nz,.t
	ret

; ---- панель — build/gen/hud_draw.inc (прямой код из tools/mkproto.py) ----------------------------------
	include	"../build/gen/hud_draw.inc"

; ---- спрайты ---------------------------------------------------------------------------------------------
move_sprites:
	ld	hl,mv_t
	inc	(hl)
	ld	a,(hl)
	and	7
	ret	nz
	ld	hl,mv_d
	ld	a,(ship_col)
	add	a,(hl)
	ld	(ship_col),a
	ld	(cross_col),a
	cp	20
	jp	z,.flip
	cp	8
	ret	nz
.flip:	ld	a,(hl)
	xor	0xfe
	ld	(hl),a
	ret

save_draw_ship:
	ld	a,(ship_col)
	ld	(sp_col),a
	ld	a,SHIP_Y
	ld	hl,SPR_SHIP
	ld	de,ship_buf
	call	spr_save_draw
	ld	a,(sp_col)
	ld	(ship_scol),a
	ld	a,(sp_row)
	ld	(ship_srow),a
	ret
save_draw_cross:
	ld	a,(cross_col)
	ld	(sp_col),a
	ld	a,SHIP_Y-CROSS_DY
	ld	hl,SPR_CROSS
	ld	de,cross_buf
	call	spr_save_draw
	ld	a,(sp_col)
	ld	(cross_scol),a
	ld	a,(sp_row)
	ld	(cross_srow),a
	ret
restore_ship:
	ld	a,(ship_scol)
	ld	(sp_col),a
	ld	a,(ship_srow)
	ld	(sp_row),a
	ld	de,ship_buf
	jp	spr_restore
restore_cross:
	ld	a,(cross_scol)
	ld	(sp_col),a
	ld	a,(cross_srow)
	ld	(sp_row),a
	ld	de,cross_buf
	jp	spr_restore

; вход: (sp_col), A = Y на экране, HL = данные спрайта, DE = буфер 64 байта; выход: (sp_row)
spr_save_draw:
	ld	(sp_data),hl
	ld	b,a
	ld	a,(scroll)
	sub	b		; строка памяти = прокрутка - Y
	ld	(sp_row),a
	ld	a,(sp_col)
	add	a,SCR_C
	ld	h,a
	call	.save2
	ld	a,(sp_col)
	add	a,SCR_E
	ld	h,a
	call	.save2
	ld	hl,(sp_data)
	ex	de,hl
	ld	a,(sp_row)
	ld	l,a
	ld	a,(sp_col)
	add	a,SCR_C
	ld	h,a
	ld	a,16
	ld	(sp_cnt),a
.dr:	ld	a,(de)		; маска левая
	ld	b,a
	inc	de
	ld	a,(hl)		; C левый
	and	b
	ld	c,a
	ld	a,(de)
	or	c
	ld	(hl),a
	inc	de
	ld	a,h
	add	a,0x20
	ld	h,a
	ld	a,(hl)		; E левый
	and	b
	ld	c,a
	ld	a,(de)
	or	c
	ld	(hl),a
	inc	de
	inc	h
	ld	a,(de)		; маска правая
	ld	b,a
	inc	de
	ld	a,(hl)		; E правый
	and	b
	ld	c,a
	ld	a,(de)
	or	c
	ld	(hl),a
	inc	de
	ld	a,h
	sub	0x20
	ld	h,a
	ld	a,(hl)		; C правый
	and	b
	ld	c,a
	ld	a,(de)
	or	c
	ld	(hl),a
	inc	de
	dec	h
	dec	l
	ld	a,(sp_cnt)
	dec	a
	ld	(sp_cnt),a
	jp	nz,.dr
	ret
; H = плоскость+столбец; копирует 2 столбца × 16 строк с (sp_row) в (DE)
.save2:	ld	a,(sp_row)
	ld	l,a
	ld	b,16
.s1:	ld	a,(hl)
	ld	(de),a
	inc	de
	dec	l
	dec	b
	jp	nz,.s1
	inc	h
	ld	a,(sp_row)
	ld	l,a
	ld	b,16
.s2:	ld	a,(hl)
	ld	(de),a
	inc	de
	dec	l
	dec	b
	jp	nz,.s2
	ret

; вход: (sp_col), (sp_row), DE = буфер — вернуть фон
spr_restore:
	ld	a,(sp_col)
	add	a,SCR_C
	ld	h,a
	call	.put2
	ld	a,(sp_col)
	add	a,SCR_E
	ld	h,a
.put2:	ld	c,2
.c:	ld	a,(sp_row)
	ld	l,a
	ld	b,16
.p:	ld	a,(de)
	ld	(hl),a
	inc	de
	dec	l
	dec	b
	jp	nz,.p
	inc	h
	dec	c
	jp	nz,.c
	ret

; ---- переменные ------------------------------------------------------------------------------------------
scroll:		db	0
topy:		dw	0
curline:	dw	0
currow:		db	0
cnt:		db	0
go:		db	0
phase:		db	0
running:	db	0
frames:		dw	0
overrun:	dw	0
pal_req:	db	0
pal_black:	db	0
black:		ds	16
dl_row:		db	0
dl_map:		dw	0
dl_cnt:		db	0
hd_l:		db	0
mv_t:		db	0
mv_d:		db	1
sp_col:		db	0
sp_row:		db	0
sp_data:	dw	0
sp_cnt:		db	0
ship_col:	db	14
cross_col:	db	14
ship_scol:	db	0
ship_srow:	db	0
cross_scol:	db	0
cross_srow:	db	0
ship_buf:	ds	64
cross_buf:	ds	64
code_end:
	assert	1 - (((0x1000 - code_end) >> 15) & 1), "код залез на тайлы"

	include	"../build/gen/proto_data.inc"
