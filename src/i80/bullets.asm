; Пули врагов (12 слотов) и бомба игрока. По src/model/bullets.js.
; Состояние B_ST+j: 0 — свободен, 1..3 — летит, FFh — стереть; X/Y — пары по экранам (2j+экран),
; буферы фона T_018B + 4j + 2·экран
BJ	equ	SCRATCH+20	; номер слота
BKF	equ	SCRATCH+21	; 2j + передний
BKB	equ	SCRATCH+22	; 2j + задний
BYY	equ	SCRATCH+23
BXX	equ	SCRATCH+24

; erase_bullets: слоты 11..0 с состоянием 3+: стереть в заднем экране, попадание в игрока (окно пули 2×4,
; игрок со сдвигом +1, +1), FFh -> 0
p_erase_bullets:
	ld	a,11
	ld	(BJ),a
.lp:	ld	a,(BJ)
.la:	ld	hl,B_ST
	add	a,l		; массив в одной странице
	ld	l,a
	ld	bc,0x300 + (0xff & (B_ST - 1))
	call	slot_dn		; слоты с состоянием < 3 пропускаются; Z — больше нет
	ret	z
	ld	a,l
	sub	B_ST & 0xff
	ld	(BJ),a
	ld	a,(hl)
	ld	a,(BUF_BACK)
	ld	c,a
	ld	a,(BJ)
	add	a,a
	add	a,c
	ld	(BKB),a
	ld	hl,T_018B
	call	word_hl_a
	push	de		; s0 — буфер
	ld	a,(BKB)
	ld	hl,B_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	(BYY),a
	ld	a,(BKB)
	ld	hl,B_X
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	(BXX),a
	ld	a,(BYY)
	ld	l,a
	ld	a,(BXX)
	call	plat_restore_small
	ld	a,(BUF_BACK)
	ld	hl,PL_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	inc	a
	ld	d,a
	ld	a,(BUF_BACK)
	ld	hl,PL_X
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	inc	a
	ld	e,a
	push	de		; ox, oy
	ld	hl,0x0402
	push	hl		; w = 2, h = 4
	ld	a,(BYY)
	ld	l,a
	ld	a,(BXX)
	call	p_hit_player
	or	a
	jp	z,.nh
	ld	a,(PL_HIT)
	or	a
	jp	nz,.nh
	inc	a
.hitw:	ld	(PL_HIT),a	; титул Вектора (G) переводит запись на 0037h — неуязвимость
.nh:	ld	a,(BJ)
	ld	hl,B_ST
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	inc	a
	jp	nz,.nx
	ld	(hl),a
.nx:	ld	a,(BJ)
	dec	a
	jp	.la

; upd_bullets: слоты 0..11: ушла за края (X < 6, X >= 79h, Y экрана >= E1h) -> FFh; иначе состояние до 3,
; задний = передний + шаг, вывод
p_upd_bullets:
	xor	a
	ld	(BJ),a
.lp:	ld	a,(BJ)
.la:	ld	hl,B_ST
	add	a,l		; массив в одной странице
	ld	l,a
	ld	c,0xff & (B_ST + 12)
	call	slot_up	; пустые слоты пропускаются; Z — больше нет
	ret	z
	ld	a,l
	sub	B_ST & 0xff
	ld	(BJ),a
	ld	a,(hl)
	ld	a,(BJ)
	add	a,a
	ld	c,a
	ld	a,(BUF_FRONT)
	add	a,c
	ld	(BKF),a
	ld	a,(BUF_BACK)
	add	a,c
	ld	(BKB),a
	ld	a,(BKF)
	ld	hl,B_X
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	cp	6
	jp	c,.kill
	cp	0x79
	jp	nc,.kill
	ld	a,(CAM_Y)
	ld	c,a
	ld	a,(BKF)
	ld	hl,B_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	sub	c
	cp	0xe1
	jp	nc,.kill
	ld	a,(BJ)
	ld	hl,B_ST
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	cp	3
	jp	nc,.mv
	inc	(hl)
.mv:	ld	a,(BJ)
	ld	hl,B_DY
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	c,a
	ld	a,(BKF)
	ld	hl,B_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	add	a,c
	ld	d,a		; Y
	ld	a,(BKB)
	ld	hl,B_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	(hl),d
	ld	a,(BJ)
	ld	hl,B_DX
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	c,a
	ld	a,(BKF)
	ld	hl,B_X
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	add	a,c
	ld	e,a		; X
	ld	a,(BKB)
	ld	hl,B_X
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	(hl),e
	push	de
	ld	a,(BKB)
	ld	hl,T_018B
	call	word_hl_a
	pop	hl		; H = Y, L = X
	push	de
	ld	a,l
	ld	l,h
	call	plat_draw_bullet
	jp	.nx
.kill:	ld	a,(BJ)
	ld	hl,B_ST
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),0xff
.nx:	ld	a,(BJ)
	inc	a
	jp	.la

; upd_bomb: полёт 15 шагов (Y −5 за шаг, при остановке прокрутки −4), на 10h — FFh (стереть)
p_upd_bomb:
	ld	a,(BOMB_ST)
	or	a
	ret	z
	cp	0x10
	jp	nz,.go
	ld	a,0xff
	ld	(BOMB_ST),a
	ret
.go:	inc	a
	ld	(BOMB_ST),a
	ld	a,(BUF_FRONT)
	ld	hl,BOMB_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	b,a
	ld	a,(SLOW)
	add	a,b
	sub	5
	ld	b,a		; Y
	ld	a,(BUF_BACK)
	ld	hl,BOMB_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	(hl),b
	ld	a,(BUF_FRONT)
	ld	hl,BOMB_X
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	c,a		; X
	ld	a,(BUF_BACK)
	ld	hl,BOMB_X
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	(hl),c
	ld	a,(BUF_BACK)
	ld	hl,T_01BB
	call	word_hl_a
	push	de
	ld	a,c
	ld	l,b
	call	plat_draw_bomb
	ret
