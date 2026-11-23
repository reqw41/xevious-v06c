; Сбиваемые снаряды (5 слотов s). По src/model/sparks.js.
; Состояние S_ST+s: 1..3 — летит, FEh/FFh — снять; шаг по X — S_DX+s; X/Y — пары по экранам (2s+экран);
; буферы фона T_03D3 + 4s + 2·экран. Летят вниз на 8 за шаг.
S_ST	equ	0x3eeb
S_DX	equ	0x3ef0
S_X	equ	0x3ed7
S_Y	equ	0x3ee1
SK	equ	SCRATCH+36	; номер слота
SKB	equ	SCRATCH+37
SKF	equ	SCRATCH+38
SXX	equ	SCRATCH+39
SYY	equ	SCRATCH+40
SI	equ	SCRATCH+41	; номер выстрела

; spawn_sparks: только при переднем экране 1; свободный слот: Y = камера, X = 16·rnd(7) + 8, шаг −2/0/+2
p_spawn_sparks:
	ld	a,(BUF_FRONT)
	or	a
	ret	z
	ld	hl,S_ST
	ld	c,0
.f:	ld	a,(hl)
	or	a
	jp	z,.ok
	inc	hl
	inc	c
	ld	a,c
	cp	5
	jp	c,.f
	ret
.ok:	inc	(hl)
	ld	a,c
	ld	(SK),a
	add	a,a
	inc	a
	ld	(SKB),a
	ld	hl,S_Y
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	a,(CAM_Y)
	ld	(hl),a
	ld	a,7
	call	p_rnd
	add	a,a
	add	a,a
	add	a,a
	add	a,a
	add	a,8
	ld	c,a
	ld	a,(SKB)
	ld	hl,S_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),c
	ld	a,3
	call	p_rnd
	dec	a
	add	a,a
	cp	4
	jp	nz,.v
	xor	a
.v:	ld	c,a
	ld	a,(SK)
	ld	hl,S_DX
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),c
	ret

; erase_sparks: слоты 4..0: стереть (если 3+), попадание в игрока (окно 3×7), сбит выстрелом
; в состоянии 3 — оба FEh, звук, 50 очков
p_erase_sparks:
	ld	a,4
	ld	(SK),a
.lp:	ld	a,(SK)
.la:	ld	hl,S_ST
	add	a,l		; массив в одной странице
	ld	l,a
	ld	bc,0x100 + (0xff & (S_ST - 1))
	call	slot_dn	; пустые слоты пропускаются; Z — больше нет
	ret	z
	ld	a,l
	sub	S_ST & 0xff
	ld	(SK),a
	ld	a,(hl)
	ld	c,a
	ld	a,(BUF_BACK)
	ld	b,a
	ld	a,(SK)
	add	a,a
	add	a,b
	ld	(SKB),a
	ld	hl,S_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(SXX),a
	ld	a,(SKB)
	ld	hl,S_Y
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(SYY),a
	ld	a,c
	cp	3
	jp	c,.nr
	ld	a,(SKB)
	ld	hl,T_03D3
	call	word_hl_a
	push	de
	ld	a,(SYY)
	ld	l,a
	ld	a,(SXX)
	call	plat_restore_2x6
.nr:	ld	a,(PL_HIT)
	or	a
	jp	nz,.ns
	ld	a,(BUF_BACK)
	ld	hl,PL_Y
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	d,a
	ld	a,(BUF_BACK)
	ld	hl,PL_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	e,a
	push	de		; ox, oy
	ld	hl,0x0703
	push	hl		; w = 3, h = 7
	ld	a,(SYY)
	ld	l,a
	ld	a,(SXX)
	call	p_hit_player
.hitw:	ld	(PL_HIT),a	; титул Вектора (G) переводит запись на 0037h — неуязвимость
.ns:	xor	a
	ld	(SI),a
.sl:	ld	a,(SI)
	ld	hl,SHOT_ST
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	cp	3
	jp	nz,.sn
	ld	a,(SK)
	ld	hl,S_ST
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	cp	0xfd
	jp	nc,.sn
	ld	a,(BUF_BACK)
	ld	b,a
	ld	a,(SI)
	add	a,a
	add	a,b
	ld	c,a
	ld	hl,SHOT_Y
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	d,a
	ld	a,c
	ld	hl,SHOT_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	e,a
	push	de		; ox, oy — выстрел
	ld	a,(SYY)
	ld	l,a
	ld	a,(SXX)
	call	p_hit_16
	or	a
	jp	z,.sn
	ld	a,(SK)
	ld	hl,S_ST
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),0xfe
	ld	a,(SI)
	ld	hl,SHOT_ST
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),0xfe
	ld	d,2
	ld	hl,0x0f04
	ld	e,0x40
	call	plat_sfx
	ld	a,2
	ld	l,5
	call	p_add_score
	jp	.nx
.sn:	ld	a,(SI)
	inc	a
	ld	(SI),a
	cp	4
	jp	c,.sl
.nx:	ld	a,(SK)
	dec	a
	jp	.la

; upd_sparks: слоты 0..4: FEh+ — счётчик +1; ушёл за края (X < 2, X >= 7Bh, Y экрана >= E1h) — FEh;
; иначе состояние до 3, задний = передний + (dX, 8), вывод
p_upd_sparks:
	xor	a
	ld	(SK),a
.lp:	ld	a,(SK)
.la:	ld	hl,S_ST
	add	a,l		; массив в одной странице
	ld	l,a
	ld	c,0xff & (S_ST + 5)
	call	slot_up	; пустые слоты пропускаются; Z — больше нет
	ret	z
	ld	a,l
	sub	S_ST & 0xff
	ld	(SK),a
	ld	a,(hl)
	cp	0xfe
	jp	c,.al
	inc	(hl)
	jp	.nx
.al:	ld	a,(SK)
	add	a,a
	ld	c,a
	ld	a,(BUF_BACK)
	add	a,c
	ld	(SKB),a
	ld	a,(BUF_FRONT)
	add	a,c
	ld	(SKF),a
	ld	hl,S_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(SXX),a
	cp	2
	jp	c,.kill
	cp	0x7b
	jp	nc,.kill
	ld	a,(SKF)
	ld	hl,S_Y
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(SYY),a
	ld	c,a
	ld	a,(CAM_OFF)
	add	a,c
	cp	0xe1
	jp	nc,.kill
	ld	a,(SK)
	ld	hl,S_ST
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	cp	3
	jp	nc,.mv
	inc	(hl)
.mv:	ld	a,(SK)
	ld	hl,S_DX
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	c,a
	ld	a,(SXX)
	add	a,c
	ld	e,a		; X
	ld	a,(SYY)
	add	a,8
	ld	d,a		; Y
	ld	a,(SKB)
	ld	hl,S_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),e
	ld	a,(SKB)
	ld	hl,S_Y
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),d
	push	de
	ld	a,(SKB)
	ld	hl,T_03D3
	call	word_hl_a
	pop	hl		; H = Y, L = X
	push	de
	ld	a,l
	ld	l,h
	call	plat_draw_spark
	jp	.nx
.kill:	ld	a,(SK)
	ld	hl,S_ST
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),0xfe
.nx:	ld	a,(SK)
	inc	a
	jp	.la
