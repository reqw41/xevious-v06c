; Панель: сдвиг готовых пикселей, затем только изменившиеся знакоместа.
; HUD_REC: [код знака | dirty(80h), столбец/плоскость, адрес шрифта].
hud_draw:
	ld	a,(hud_req)
	or	a
	ret	z
	xor	a
	ld	(hud_req),a
	ld	a,(dnl_on)
	or	a
	ret	z
	ld	a,(hud_last)	; FFh после vec_reset: первый вывод целиком
	inc	a
	jp	z,.full
	ld	a,(vs_cur)
	ld	hl,hud_vs
	cp	(hl)
	jp	z,.check
	sub	(hl)
	cp	1		; обычная прокрутка — +1; прочие сдвиги рисуем заново
	jp	nz,.full
	ld	a,(hl)
	sub	HUD_Y + 7	; низ старого блока (пустая строка)
	cp	247		; POP/PUSH не должны заходить в соседний столбец
	jp	nc,.full
	ld	(hud_copy.src + 1),a
	inc	a
	ld	(hud_move.row + 1),a
	add	a,8
	ld	(hud_copy.end + 1),a
	call	hud_move
.check:	call	hud_check
	jp	.draw
.full:	call	hud_check
	ld	hl,HUD_REC
	ld	b,HUD_W
.force:	ld	a,(hl)
	cp	HUD_SP
	jp	z,.next
	or	0x80
	ld	(hl),a
.next:	inc	hl
	inc	hl
	inc	hl
	inc	hl
	dec	b
	jp	nz,.force
.draw:	ld	a,(vs_cur)
	ld	(hud_vs),a
	sub	HUD_Y
	ld	c,a
	ld	hl,HUD_REC
	ld	b,HUD_W
.c:	ld	a,(hl)
	or	a
	jp	p,.sk
	and	0x7f
	ld	(hl),a
	inc	hl
	ld	a,(hl)
	inc	hl
	ld	e,(hl)
	inc	hl
	ld	d,(hl)
	inc	hl
	push	hl
	ld	h,a
	ld	l,c
	ld	a,(de)
	ld	(hl),a
	inc	de
	dec	l
	ld	a,(de)
	ld	(hl),a
	inc	de
	dec	l
	ld	a,(de)
	ld	(hl),a
	inc	de
	dec	l
	ld	a,(de)
	ld	(hl),a
	inc	de
	dec	l
	ld	a,(de)
	ld	(hl),a
	inc	de
	dec	l
	ld	a,(de)
	ld	(hl),a
	inc	de
	dec	l
	ld	a,(de)
	ld	(hl),a
	dec	l
	ld	(hl),0		; строка под знаком — след прошлого обновления
	ld	a,b		; знакоместа 0–4 (кораблики) — вторая плоскость
	cp	HUD_W - 4
	call	nc,hud_ship2
	pop	hl
	dec	b
	jp	nz,.c
	ret
.sk:	inc	hl
	inc	hl
	inc	hl
	inc	hl
	dec	b
	jp	nz,.c
	ret
; Копируются занятые кораблики и неизменные столбцы подписей/чисел.
; HL после hud_copy сохраняется: фиксированные столбцы идут без обхода HUD_REC.
hud_move:
	ld	hl,0
	add	hl,sp
	ld	de,-4		; CALL и PUSH HL в hud_copy, одинаковая глубина всех вызовов
	add	hl,de
	ld	(hud_copy.sp + 1),hl
.row:	ld	hl,(SCR_C + 1) * 256
	ld	a,(hud_last + 6)	; прежние жизни: новые знаки появятся после переноса
	dec	a
	jp	z,.fixed
	jp	m,.fixed
	cp	6
	jp	c,.count
	ld	a,5
.count:	ld	(.left + 1),a
.ship:	call	hud_copy
	ld	a,h
	add	a,0x20
	ld	h,a
	call	hud_copy
	ld	a,h
	sub	0x1f
	ld	h,a
.left:	ld	a,0
	dec	a
	ld	(.left + 1),a
	jp	nz,.ship
.fixed:
	ld	h,SCR_C + 7
	call	hud_copy
	inc	h
	call	hud_copy
	ld	h,SCR_C + 16
	call	hud_copy
	inc	h
	call	hud_copy
	ld	h,SCR_C + 25
	call	hud_copy
	inc	h
	call	hud_copy
	inc	h
	call	hud_copy
	inc	h
	call	hud_copy
	ld	h,SCR_C + 0x20 + 9
	call	hud_copy
	inc	h
	call	hud_copy
	inc	h
	call	hud_copy
	inc	h
	call	hud_copy
	inc	h
	call	hud_copy
	inc	h
	call	hud_copy
	ld	h,SCR_C + 0x20 + 18
	call	hud_copy
	inc	h
	call	hud_copy
	inc	h
	call	hud_copy
	inc	h
	call	hud_copy
	inc	h
	call	hud_copy
	inc	h
	call	hud_copy
	ld	h,SCR_C + 0x20 + 29
	call	hud_copy
	inc	h
	call	hud_copy
	ret

; HL — новая пустая строка столбца. Четыре пары POP/PUSH без PSW:
; первая пара временно сохраняется в операнде LXI (флаги i8080 не искажают пиксели).
; SP возвращается в обычный стек перед EI; DI ограничен одним столбцом.
; HL сохраняется; AF, BC, DE портятся. Все CALL — из hud_move с одной глубины стека.
hud_copy:
	push	hl
.end:	ld	l,0
	ld	(.dst + 1),hl
.src:	ld	l,0
	di
	ld	sp,hl
	pop	hl
	ld	(.pair + 1),hl
	pop	bc
	pop	de
	pop	hl
.dst:	ld	sp,0
	push	hl
	push	de
	push	bc
.pair:	ld	hl,0
	push	hl
.sp:	ld	sp,0
	pop	hl
	ei
	ret
