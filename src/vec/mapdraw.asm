; Карта на Векторе: распаковка строк слоя тайлов (map_ptr) и наложение верхней строки поля.
; Лежит в окне карты после данных (src/vec/game.asm): в основном коде места нет.

; 15 байт HL -> DE
cp15:	ld	b,1
	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	dec	b		; B = 0 и флаги как после последней итерации прежнего цикла
	ret

; наложение верхней строки: HL — 15 кодов (< 40h — тайл наложения OVLT), (ol_row) — строка памяти,
; (ol_off) — строка тайла × 4. Полубайт F в обеих плоскостях — прозрачно
ovl_line:
	push	hl
	ld	de,15
	add	hl,de
	ld	a,(hl)		; признак: наложения в строке нет — выйти
	pop	hl
	or	a
	ret	z
	ld	c,SCR_C+1
	ld	b,15
.lp:	ld	a,(hl)
	inc	hl
	cp	0x40
	jp	nc,.nx
	push	hl
	push	bc
	ld	c,a		; код -> номер картинки (одинаковые — одна)
	ld	b,0
	ld	hl,OVLT_IX
	add	hl,bc
	ld	l,(hl)
	ld	h,0
	add	hl,hl
	add	hl,hl
	add	hl,hl
	add	hl,hl
	add	hl,hl
	add	hl,hl
	ld	de,OVLT
	add	hl,de
	ld	a,(ol_off)
	add	a,l
	ld	l,a
	jp	nc,$+4
	inc	h
	ld	de,ol_t
	ld	b,4
.cp:	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	dec	b
	jp	nz,.cp
	pop	bc
	push	bc
	ld	h,c
	ld	a,(ol_row)
	ld	l,a
	ld	a,(ol_t)
	ld	b,a
	ld	a,(ol_t+2)
	ld	c,a
	call	ovl_put2
	inc	h
	ld	a,(ol_t+1)
	ld	b,a
	ld	a,(ol_t+3)
	ld	c,a
	call	ovl_put2
	pop	bc
	pop	hl
.nx:	inc	c
	inc	c
	dec	b
	jp	nz,.lp
	ret

; байт наложения: B — плоскость C, C — плоскость E, HL — экран (C; E — +20h). HL сохраняется
ovl_put2:
	ld	a,b
	and	c
	ld	e,a
	ld	d,0		; D — что оставить от экрана
	and	0xf0
	cp	0xf0
	jp	nz,.h
	ld	d,0xf0
.h:	ld	a,e
	and	0x0f
	cp	0x0f
	jp	nz,.l
	ld	a,d
	or	0x0f
	ld	d,a
.l:	ld	a,d
	or	a
	jp	nz,.mix
	ld	(hl),b
	ld	a,h
	add	a,0x20
	ld	h,a
	ld	(hl),c
	sub	0x20
	ld	h,a
	ret
.mix:	inc	a
	ret	z		; всё прозрачно
	ld	a,d
	cpl
	ld	e,a
	ld	a,b
	and	e
	ld	b,a
	ld	a,(hl)
	and	d
	or	b
	ld	(hl),a
	ld	a,h
	add	a,0x20
	ld	h,a
	ld	a,c
	and	e
	ld	c,a
	ld	a,(hl)
	and	d
	or	c
	ld	(hl),a
	ld	a,h
	sub	0x20
	ld	h,a
	ret

; map_ptr: HL — адрес окна CPC 4000h..5FFFh (слой тайлов) -> HL — байт в распакованной строке; BC, DE сохраняются.
; Две распакованные строки (MC_BUF0/1), вытесняется не тронутая последней
map_ptr:
	push	de
	push	bc
	ld	a,l
	and	0x3f
	ld	c,a		; столбец
	ld	a,h
	sub	0x40
	add	a,a
	add	a,a
	ld	b,a
	ld	a,l
	rlca
	rlca
	and	3
	or	b
	ld	b,a		; строка 0..127
	ld	a,(mc_tag0)
	cp	b
	jp	z,.h0
	ld	a,(mc_tag1)
	cp	b
	jp	z,.h1
	ld	a,(mc_vict)	; промах
	or	a
	jp	nz,.m1
	ld	a,b
	ld	(mc_tag0),a
	ld	hl,MC_BUF0
	call	map_unpack
.h0:	ld	a,1
	ld	(mc_vict),a
	ld	hl,MC_BUF0
	jp	.at
.m1:	ld	a,b
	ld	(mc_tag1),a
	ld	hl,MC_BUF1
	call	map_unpack
.h1:	xor	a
	ld	(mc_vict),a
	ld	hl,MC_BUF1
.at:	ld	a,l
	add	a,c
	ld	l,a
	jp	nc,$+4
	inc	h
	pop	bc
	pop	de
	ret

; распаковать строку B в HL (64 байта). C сохраняется
map_unpack:
	push	bc
	ex	de,hl
	ld	l,b
	ld	h,0
	add	hl,hl
	ld	bc,MAPIDX
	add	hl,bc
	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	ld	a,e
	add	a,64
	ld	(.end+1),a
.lp:	ld	a,(hl)
	inc	hl
	call	mz_emit
	ld	a,e
.end:	cp	0
	jp	nz,.lp
	pop	bc
	ret
mz_emit:
	cp	0xb5
	jp	nc,.pr
	ld	(de),a
	inc	de
	ret
.pr:	push	hl
	sub	0xb5
	add	a,a
	ld	l,a
	ld	h,0
	ld	bc,MAPPAIR
	add	hl,bc
	ld	a,(hl)
	inc	hl
	push	hl
	call	mz_emit
	pop	hl
	ld	a,(hl)
	call	mz_emit
	pop	hl
	ret

