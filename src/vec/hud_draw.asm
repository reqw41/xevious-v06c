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
	sub	HUD_Y + 6	; первая строка над пустой (низ старого блока + 1); перенос по кругу в столбце
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
	; C-плоскость значков всегда нулевая: поле сюда не попадает.
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
;; Перенос занятых корабликов и неизменных столбцов подписей/чисел на строку вверх.
; A — младший байт строки над старой пустой (src+1). Без SP и DI: цикл по столбцам, вращение B/C.
hud_move:
	ld	e,a
	ld	a,(hud_last + 6)	; прежние жизни: новые знаки появятся после переноса
	dec	a
	jp	z,.fixed
	jp	m,.fixed
	cp	6
	jp	c,.count
	ld	a,5
.count:	ld	d,a
	; Значки жизни одноцветные; плоскость C этой части полосы всегда нулевая.
	; Новая строка приходит из чёрной полосы, спрайты туда не выводятся.
	ld	h,SCR_C + 0x20 + 4
	call	hm_cols
.fixed:	ld	h,SCR_C + 1		; 1UP
	ld	d,3
	call	hm_cols
	ld	h,SCR_C + 17		; знак рекорда
	ld	d,1
	call	hm_cols
	ld	h,SCR_C + 25
	ld	d,4
	call	hm_cols
	ld	h,SCR_C + 0x20 + 10
	ld	d,6
	call	hm_cols
	ld	h,SCR_C + 0x20 + 18
	ld	d,6
	call	hm_cols
	ld	h,SCR_C + 0x20 + 29
	ld	d,2
	jp	hm_cols

; H — первый столбец, D — число столбцов, E — src+1. Новый блок: src+1 = 0 (пустая строка),
; src+2..src+8 = старые src+1..src+7. A не портится.
hm_cols:
	ld	l,e
	ld	c,(hl)
	ld	(hl),0
	inc	l
	ld	b,(hl)
	ld	(hl),c
	inc	l
	ld	c,(hl)
	ld	(hl),b
	inc	l
	ld	b,(hl)
	ld	(hl),c
	inc	l
	ld	c,(hl)
	ld	(hl),b
	inc	l
	ld	b,(hl)
	ld	(hl),c
	inc	l
	ld	c,(hl)
	ld	(hl),b
	inc	l
	ld	(hl),c
	inc	h
	dec	d
	jp	nz,hm_cols
	ret
