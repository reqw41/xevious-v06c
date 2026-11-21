; Объекты из таблицы зоны (8 слотов k = номер записи). По src/model/tabobj.js.
; Состояние T_ST+k: 1..80h — жив, FCh..FEh — взрыв, FFh — стереть. X (в точках, 2 на байт экрана) и Y —
; пары по экранам (2k+экран); счётчик пути — слово T_TIME+2k; буферы фона T_01D3 + 4k + 2·экран.
; Волны зоны — T_02B3 + 32·зона (4 байта на запись: строка, X, тип, флаг); пути — T_01F3 (16 шагов на тип)
T_ST	equ	0x3eaf
T_TYPE	equ	0x3eb7
T_FLAG	equ	0x3ecf
T_TIME	equ	0x3ebf
T_X	equ	0x3e8f
T_Y	equ	0x3e9f
TK	equ	SCRATCH+26	; номер слота
TKB	equ	SCRATCH+27
TKF	equ	SCRATCH+28
TX	equ	SCRATCH+29
TY	equ	SCRATCH+30
TBUF	equ	SCRATCH+31	; 2 байта
TARG	equ	SCRATCH+33	; 2 байта

; spawn_tabobj: B = 8 − k, A = X, L = Y экрана; стек: слово (тип, флаг), снимает 2.
; Слот занят — ничего; иначе завести (Y + 8, счётчик 0) и сохранить фон под него
p_spawn_tabobj:
	ld	c,a
	ld	a,l
	add	a,8
	ld	e,a
	ld	a,8
	sub	b
	ld	b,a
	ld	hl,T_ST
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	or	a
	jp	nz,.out
	ld	(hl),1
	ld	hl,2
	add	hl,sp
	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	ld	(TARG),hl
	ld	a,b
	ld	hl,T_TYPE
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	a,(TARG)
	ld	(hl),a
	ld	a,b
	ld	hl,T_FLAG
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	a,(TARG+1)
	ld	(hl),a
	ld	a,b
	add	a,a
	ld	hl,T_TIME
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),0
	inc	hl
	ld	(hl),0
	ld	a,(BUF_FRONT)
	add	a,b
	add	a,b
	ld	d,a		; kf
	ld	hl,T_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),c
	ld	a,d
	ld	hl,T_Y
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),e
	ld	a,d
	push	de
	ld	hl,T_01D3
	call	word_hl_a
	pop	hl		; L = Y
	push	de		; s0 — буфер
	ld	a,c
	and	a
	rra
	call	plat_put_tile16
.out:	pop	hl
	pop	bc
	jp	(hl)

; spawn_by_row: записи волны зоны со строкой = AREA_ROW; Y = камера − 10h
p_spawn_by_row:
	xor	a
	ld	(TK),a
.lp:	ld	a,(AREA)
	rrca
	rrca
	rrca
	ld	l,a
	ld	h,0
	ld	de,T_02B3
	add	hl,de
	ld	a,(TK)
	add	a,a
	add	a,a
	call	at_hl_a
	ld	c,a
	ld	a,(AREA_ROW)
	cp	c
	jp	nz,.nx
	inc	hl
	ld	c,(hl)		; X
	inc	hl
	ld	e,(hl)		; тип
	inc	hl
	ld	d,(hl)		; флаг
	push	de
	ld	a,(TK)
	ld	b,a
	ld	a,8
	sub	b
	ld	b,a
	ld	a,(CAM_Y)
	sub	0x10
	ld	l,a
	ld	a,c
	call	p_spawn_tabobj
.nx:	ld	a,(TK)
	inc	a
	ld	(TK),a
	cp	8
	jp	c,.lp
	ret

; erase_tabobj: слоты 7..0: стереть в заднем экране; взрыв (бит 7) — счётчик +1; попадание бомбы — FCh,
; звук, 30 очков; ушёл за край (Y экрана E1h, X < 2, X >= EDh) — FFh
p_erase_tabobj:
	ld	a,7
	ld	(TK),a
.lp:	ld	a,(TK)
	ld	hl,T_ST
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	or	a
	jp	z,.nx
	ld	a,(BUF_BACK)
	ld	c,a
	ld	a,(TK)
	add	a,a
	add	a,c
	ld	b,a		; kb
	ld	hl,T_X
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	(TX),a
	ld	a,b
	ld	hl,T_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	(TY),a
	ld	a,b
	ld	hl,T_01D3
	call	word_hl_a
	push	de
	ld	a,(TY)
	ld	l,a
	ld	a,(TX)
	and	a
	rra
	call	plat_restore_16
	ld	a,(TK)
	ld	hl,T_ST
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	or	a
	jp	p,.al
	inc	(hl)
	jp	.nx
.al:	ld	a,(BOMB_ST)
	cp	0x0e
	jp	c,.edge
	ld	a,(CAM_Y)
	ld	c,a
	ld	a,(BUF_FRONT)
	ld	hl,BOMB_Y
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	sub	c
	ld	d,a		; by
	ld	a,(BUF_FRONT)
	ld	hl,BOMB_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	e,a		; bx
	push	de
	ld	a,(TY)
	sub	c
	ld	l,a
	ld	a,(TX)
	and	a
	rra
	call	p_hit_bomb
	or	a
	jp	z,.edge
	ld	a,(TK)
	ld	hl,T_ST
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),0xfc
	ld	d,2
	ld	hl,0x0f03
	ld	e,0x30
	call	plat_sfx
	ld	a,2
	ld	l,3
	call	p_add_score
.edge:	ld	a,(CAM_OFF)
	ld	c,a
	ld	a,(TY)
	add	a,c
	cp	0xe1
	jp	z,.kill
	ld	a,(TX)
	cp	2
	jp	c,.kill
	cp	0xed
	jp	c,.nx
.kill:	ld	a,(TK)
	ld	hl,T_ST
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),0xff
.nx:	ld	a,(TK)
	dec	a
	ld	(TK),a
	jp	p,.lp
	ret

; upd_tabobj: слоты 0..7: взрыв — кадр 8700h/8780h; живой: стрельба (флаг ≠ 0, счётчик & 7Fh = 0),
; шаг по пути (биты: 1 — вправо, 2 — влево, 8 — вниз, 4 — вверх), вывод
p_upd_tabobj:
	xor	a
	ld	(TK),a
.lp:	ld	a,(TK)
	ld	hl,T_ST
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	or	a
	jp	z,.nx
	ld	c,a
	ld	a,(TK)
	add	a,a
	ld	b,a
	ld	a,(BUF_BACK)
	add	a,b
	ld	(TKB),a
	ld	a,(BUF_FRONT)
	add	a,b
	ld	(TKF),a
	ld	a,(TKB)
	ld	hl,T_01D3
	call	word_hl_a
	ex	de,hl
	ld	(TBUF),hl
	ld	a,c
	inc	a
	jp	p,.ne
	ld	a,c
	sub	0xfe
	ld	hl,0x8700
	jp	m,.s1
	ld	hl,0x8780
.s1:	ex	de,hl
	ld	hl,(TBUF)
	push	hl		; s1 — буфер
	push	de		; s0 — кадр
	ld	a,(TKB)
	ld	hl,T_Y
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	e,a
	ld	a,(TKB)
	ld	hl,T_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	and	a
	rra
	ld	l,e
	call	plat_draw_sprite
.ne:	ld	a,(TK)
	ld	hl,T_ST
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	dec	a
	jp	m,.nx
	ld	a,(TKF)
	ld	hl,T_X
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	(TX),a
	ld	a,(TKF)
	ld	hl,T_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	(TY),a
	ld	a,(TK)
	add	a,a
	ld	hl,T_TIME
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	and	0x7f
	jp	nz,.nf
	ld	a,(TK)
	ld	hl,T_FLAG
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	or	a
	jp	z,.nf
	ld	a,(TY)
	add	a,8
	ld	l,a
	ld	a,(TX)
	and	a
	rra
	add	a,4
	call	p_ground_fire
.nf:	ld	de,0		; E = dx, D = dy
	ld	a,(TK)
	ld	hl,T_TYPE
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	dec	a
	jp	m,.mv
	add	a,a
	add	a,a
	add	a,a
	add	a,a
	ld	c,a
	ld	a,(TK)
	add	a,a
	ld	hl,T_TIME
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	b,a
	inc	hl
	ld	a,(hl)
	or	a
	jp	nz,.nt
	ld	a,b
	cp	0xf0
	jp	nc,.nt
	dec	hl
	inc	(hl)
.nt:	ld	a,b
	rrca
	rrca
	rrca
	rrca
	and	0x0f
	add	a,c
	ld	hl,T_01F3
	add	a,l		; = call at_hl_a
	ld	l,a
	jp	nc,$+4
	inc	h
	ld	a,(hl)
	ld	b,a
	ld	de,0
	rrca
	jp	nc,.b1
	inc	e
.b1:	ld	a,b
	and	2
	jp	z,.b2
	dec	e
.b2:	ld	a,b
	and	8
	jp	z,.b3
	inc	d
.b3:	ld	a,b
	and	4
	jp	z,.mv
	dec	d
.mv:	ld	a,(TX)
	add	a,e
	ld	e,a		; X
	ld	a,(TY)
	add	a,d
	ld	d,a		; Y
	ld	a,(TKB)
	ld	hl,T_X
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	(hl),e
	ld	a,(TKB)
	ld	hl,T_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	(hl),d
	ld	b,d
	ld	c,e
	ld	a,(TK)
	ld	hl,T_FLAG
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	cp	1
	ld	hl,0x8600
	jp	z,.sx
	ld	hl,0x9080
	ld	a,b
	and	2
	jp	z,.sx
	ld	hl,0x9100
.sx:	ld	a,c
	rrca
	jp	nc,.sd
	ld	h,0x99
.sd:	ex	de,hl
	ld	hl,(TBUF)
	push	hl
	push	de
	ld	l,b
	ld	a,c
	and	a
	rra
	call	plat_draw_sprite
.nx:	ld	a,(TK)
	inc	a
	ld	(TK),a
	cp	8
	jp	c,.lp
	ret
