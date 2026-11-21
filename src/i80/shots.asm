; Выстрелы игрока: 4 слота. По src/model/shots.js.
; Состояние SHOT_ST+i: 0 — свободен, 1..3 — летит, FEh — снять, FFh — стереть и освободить.
; X/Y — пары по экранам (индекс 2i+экран), буферы фона — T_0167 + 4i + 2·экран.
SLOW	equ	0x3f1c

; erase_shots: в заднем экране стереть слоты 3..0 с состоянием 3+; FFh -> 0
p_erase_shots:
	ld	c,3
.lp:	ld	a,c
	ld	hl,SHOT_ST
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	cp	3
	jp	c,.nx
	ld	a,(BUF_BACK)
	add	a,c
	add	a,c
	ld	b,a		; k = 2i + задний
	push	bc
	ld	hl,T_0167
	call	word_hl_a	; DE = буфер
	push	de		; s0
	ld	a,b
	ld	hl,SHOT_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	d,a
	ld	a,b
	ld	hl,SHOT_X
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	l,d
	call	plat_restore_shot
	pop	bc
	ld	a,c
	ld	hl,SHOT_ST
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	inc	a
	jp	nz,.nx
	ld	(hl),a
.nx:	dec	c
	jp	p,.lp
	ret

; upd_shots: скорость 9 (8 при SLOW=1) в операнд SM_2454; слоты 0..3: FEh или ушёл за верх поля -> FFh,
; иначе состояние до 3, Y заднего = Y переднего − скорость, X заднего = X переднего, вывод
p_upd_shots:
	ld	a,(SLOW)
	cpl
	add	a,0x0a
	ld	(SM_2454),a
	ld	c,0
.lp:	ld	a,c
	ld	hl,SHOT_ST
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	or	a
	jp	z,.nx
	cp	0xfe
	jp	z,.kill
	ld	a,c
	add	a,a
	ld	e,a
	ld	a,(BUF_FRONT)
	add	a,e
	ld	(SCRATCH),a	; kf
	ld	a,(BUF_BACK)
	add	a,e
	ld	(SCRATCH+1),a	; kb
	ld	a,(SCRATCH)
	ld	hl,SHOT_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	d,a		; Y переднего
	ld	a,(CAM_Y)
	ld	e,a
	ld	a,d
	sub	e
	cp	0x10
	jp	c,.kill
	ld	a,c
	ld	hl,SHOT_ST
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	cp	3
	jp	nc,.mv
	inc	(hl)
.mv:	ld	a,(SM_2454)
	ld	e,a
	ld	a,d
	sub	e
	ld	d,a		; новый Y
	ld	a,(SCRATCH+1)
	ld	hl,SHOT_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	(hl),d
	ld	a,(SCRATCH)
	ld	hl,SHOT_X
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	e,a		; X
	ld	a,(SCRATCH+1)
	ld	hl,SHOT_X
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	(hl),e
	push	bc
	push	de
	ld	a,(SCRATCH+1)
	ld	hl,T_0167
	call	word_hl_a
	pop	hl		; H = Y, L = X
	push	de		; s0 — буфер
	ld	a,l
	ld	l,h
	call	plat_draw_shot
	pop	bc
	jp	.nx
.kill:	ld	a,c
	ld	hl,SHOT_ST
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),0xff
.nx:	inc	c
	ld	a,c
	cp	4
	jp	c,.lp
	ret
SM_2454: db	0
