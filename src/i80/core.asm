; Мелкие процедуры: случайные числа, очки, жизни, столкновения. Написано по src/model/core.js.
CAM_Y	equ	0x3e4c
LIVES	equ	0x3d39
SCORE	equ	0x3f24		; 3 байта BCD, старший первым

; rnd: A = (следующее зерно) & A.  Зерно: t = rrc3(s) ^ 1Fh; s' = s + t + 1 − перенос(s + t)
p_rnd:	ld	c,a
	ld	a,(SM_0745)
	ld	b,a
	rrca
	rrca
	rrca
	xor	0x1f
	add	a,b
	sbc	a,0xff
	ld	(SM_0745),a
	and	c
	ret
SM_0745: db	0

; Проверка пересечения по одной оси, общая для hit_*: B = точка, C = объект, D = окно точки, E = окно объекта.
; Пересекаются, если b + d >= c и c + e >= b (байты, с переполнением). Выход: CY = 1 — нет.
overlap:
	ld	a,b
	add	a,d
	cp	c
	ret	c
	ld	a,c
	add	a,e
	cp	b
	ret

; hit_player: A, L — точка; стек: w, h, ox, oy (байты), снимает 4. A = 1 — попал.
; X: окно точки w, игрока 6; Y (экранный, от камеры): окно точки h, игрока 13
p_hit_player:
	ld	b,a
	ld	a,l
	ld	(SCRATCH+1),a	; y
	ld	hl,2
	add	hl,sp
	ld	d,(hl)		; w
	inc	hl
	ld	a,(hl)		; h
	ld	(SCRATCH),a
	inc	hl
	ld	c,(hl)		; ox
	inc	hl
	push	hl
	ld	e,6
	call	overlap
	pop	hl
	jp	c,hit_no4
	ld	a,(CAM_Y)
	ld	d,a
	ld	a,(hl)		; oy
	sub	d
	ld	c,a
	ld	a,(SCRATCH+1)	; y
	sub	d
	ld	b,a
	ld	a,(SCRATCH)
	ld	d,a
	ld	e,13
	call	overlap
	jp	c,hit_no4
	ld	a,1
	jp	hit_ret4
hit_no4: xor	a
hit_ret4:
	pop	hl
	pop	bc
	pop	bc
	jp	(hl)

; hit_16: A, L — точка; стек: ox, oy, снимает 2. A = 1 — попал. X: окна 8 и 8; Y: точки 16, объекта 8
p_hit_16:
	ld	b,a
	ld	a,l
	ld	(SCRATCH+1),a	; y
	ld	hl,2
	add	hl,sp
	ld	c,(hl)		; ox
	inc	hl
	ld	de,0x0808
	push	hl
	call	overlap
	pop	hl
	jp	c,.no
	ld	a,(CAM_Y)
	ld	d,a
	ld	a,(hl)
	sub	d
	ld	c,a
	ld	a,(SCRATCH+1)
	sub	d
	ld	b,a
	ld	de,0x1008
	call	overlap
	jp	c,.no
	ld	a,1
	jp	.out
.no:	xor	a
.out:	pop	hl
	pop	bc
	jp	(hl)

; add_score: A = 1 — L прибавить к младшему байту очков, 2 — к среднему, иначе к старшему (BCD, перенос вверх).
; Если старший байт стал 2 (20000) или дошёл до порога SM_280C — доп. жизнь, порог += 7 (70000)
p_add_score:
	ld	e,l
	ld	hl,SCORE+2
	dec	a
	jp	z,.add
	dec	hl
	dec	a
	jp	z,.add
	dec	hl
.add:	ld	a,(hl)
	add	a,e
	daa
	ld	(hl),a
	ld	e,1
	push	af
	ld	a,l
	cp	SCORE & 0xff
	jp	z,.top
	pop	af
	ret	nc
	dec	hl
	jp	.add
.top:	pop	af
	cp	2
	jp	z,p_extra_life
	ld	b,a
	ld	a,(SM_280C)
	ld	c,a
	ld	a,b
	cp	c
	ret	c
	ld	a,c
	add	a,7
	daa
	ld	(SM_280C),a
; extra_life: жизнь +1; значок на панели, если было меньше 6; звук
p_extra_life:
	ld	hl,LIVES
	ld	a,(hl)
	inc	(hl)
	cp	6
	jp	nc,.snd
	add	a,a
	add	a,8
	ld	e,a
	ld	d,0x80
	ld	a,0xaa
	call	plat_put_char
.snd:	ld	d,0
	ld	hl,0x0f06
	ld	e,0x40
	jp	plat_sfx
SM_280C: db	0
