; Отметки на наземных целях (вызовы mark_a 1291h, mark_b 12C1h, mark_dead 1248h): CPC пишет несколько байт прямо
; в экран (тёмные «проёмы» с каймой, след разбитой цели). Здесь — в очередь (OP_MARK: рисуются в flush после
; стирания спрайтов, как фон), пункты отметки [dy, dc, полубайты C|E] — build/gen/vec_marks.inc (из кода игры).
; Байт CPC с номером n = (X >> 1) + 1 + dc — полубайт n Вектора (4 точки), строка — Y + dy.
OP_MARK	equ	4

plat_mark_a:
	call	q_xy
	ld	hl,MARK_A
	ld	a,OP_MARK
	jp	q_push
plat_mark_b:
	call	q_xy
	ld	hl,MARK_B
	ld	a,OP_MARK
	jp	q_push
; mark_dead: A = X, L = Y, DE — запись цели: тип (+8) 15h/16h — след, 26h/27h — тайл C900h/C940h
plat_mark_dead:
	call	q_xy
	ex	de,hl
	ld	de,8
	add	hl,de
	ld	a,(hl)
	ld	hl,0xc900
	cp	0x26
	jp	z,.t
	ld	hl,0xc940
	cp	0x27
	jp	z,.t
	ld	hl,MARK_D
	cp	0x15
	jp	z,.m
	cp	0x16
	ret	nz
.m:	ld	a,OP_MARK
	jp	q_push
.t:	ld	a,OP_TILE
	jp	q_push

; (flush) отметка: (qx), (qy), HL — пункты, FFh — конец. Строки вне поля — мимо
mark_draw:
	ld	a,(qx)
	rrca
	and	0x7f
	inc	a
	ld	(mk_c),a
.l:	ld	a,(hl)
	cp	0xff
	ret	z
	ld	b,a
	ld	a,(qy)
	add	a,b
	ld	(mk_y),a
	ld	a,(CAM_Y)	; y = Y + dy − камера − 16: 0..223, и не выше верха поля (clip_base)
	add	a,16
	ld	c,a
	ld	a,(mk_y)
	sub	c
	cp	224
	jp	nc,.sk
	ld	c,a
	ld	a,(clip_base)
	sub	16
	ld	b,a
	ld	a,c
	cp	b
	call	c,mark_save
	jp	c,.sk
	inc	hl
	ld	a,(mk_c)
	add	a,(hl)
	ld	b,a		; номер полубайта
	inc	hl
	ld	c,(hl)		; полубайты C|E
	inc	hl
	push	hl
	call	mark_put
	pop	hl
	jp	.l
.sk:	inc	hl
	inc	hl
	inc	hl
	jp	.l

; B — номер полубайта, C — цвет C|E, mk_y — строка мира.
mark_put:
	ld	a,(mk_y)
	cpl
	ld	l,a
	ld	a,b
	rrca
	and	0x7f
	add	a,SCR_C
	ld	h,a
	ld	a,b
	and	1
	ld	b,0x0f
	jp	z,.planes
	ld	b,0xf0
	ld	a,c
	rrca
	rrca
	rrca
	rrca
	ld	c,a
.planes:
	call	.nibble
	ld	a,h
	add	a,0x20
	ld	h,a
	ld	a,c
	rrca
	rrca
	rrca
	rrca
	ld	c,a
.nibble:
	ld	a,(hl)
	and	b
	ld	d,a
	ld	a,b
	cpl
	and	c
	or	d
	ld	(hl),a
	ret

mk_c:	db	0
mk_y:	db	0
