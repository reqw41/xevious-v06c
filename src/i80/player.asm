; Корабль игрока: вывод, стирание (с бомбой), движение, выстрел и бомба. По src/model/player.js.
; Координаты — пары по экранам: [BUF_BACK] — задний (рисуем), [BUF_FRONT] — передний.
BUF_BACK  equ	0x3e51
BUF_FRONT equ	0x3e52
JOY	  equ	0x3d42
PL_HIT	  equ	0x3f1b
PL_X	  equ	0x3d4d
PL_Y	  equ	0x3d4f
PL_DX	  equ	0x3d51
PL_DY	  equ	0x3d52
CAM_OFF	  equ	0x3f28
FIRE_HELD equ	0x3e57
SHOT_X	  equ	0x3d53
SHOT_Y	  equ	0x3d5b
SHOT_ST	  equ	0x3d63
BOMB_X	  equ	0x3e1d
BOMB_Y	  equ	0x3e1f
BOMB_ST	  equ	0x3e21

; Встроенная адресация массивов без переноса: PL — индекс до 4 (оригинальная особенность
; spawn_air), SHOT — до 7, A/Z/S — до 9, W — до 11, B — до 23, T — до 15, G — до 7.
; Для них base.low + индекс < 256; G_Y (3DFCh..3E03h) требует полного расчёта.
; Общий at_hl_a остаётся для остальных обращений, включая таблицы и произвольные индексы.
; A = (HL + A); HL указывает на байт
at_hl_a:
	add	a,l
	ld	l,a
	jp	nc,.n
	inc	h
.n:	ld	a,(hl)
	ret

; DE = слово (HL + 2*A)
word_hl_a:
	add	a,a
	add	a,l
	ld	l,a
	jp	nc,.n
	inc	h
.n:	ld	e,(hl)
	inc	hl
	ld	d,(hl)
	ret

; A = X, L = Y корабля на экране A (0/1)
pl_xy:	ld	c,a
	ld	hl,PL_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	b,a
	ld	a,c
	ld	hl,PL_X
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	l,b
	ret

; draw_player: состояние 3F1Bh 0 — корабль, 1/2 — кадры гибели, 3+ — не рисовать
p_draw_player:
	ld	a,(PL_HIT)
	cp	3
	ret	nc
	ld	hl,0x8080
	or	a
	jp	z,.s
	ld	hl,0x8700
	dec	a
	jp	z,.s
	ld	hl,0x8780
.s:	push	hl
	ld	a,(BUF_BACK)
	ld	hl,T_015F
	call	word_hl_a
	pop	hl
	push	de		; s1 — буфер фона
	push	hl		; s0 — спрайт
	ld	a,(BUF_BACK)
	call	pl_xy
	call	plat_draw_sprite	; аргументы на стеке — только CALL (адрес возврата сверху)
	ret

; erase_player: бомба (если летит, 3+) и корабль (если 3F1Bh < 5) в заднем экране; бомба FFh -> 0
p_erase_player:
	ld	a,(BOMB_ST)
	cp	3
	jp	c,.nb
	ld	a,(BUF_BACK)
	ld	hl,T_01BB
	call	word_hl_a
	push	de
	ld	a,(BUF_BACK)
	ld	c,a
	ld	hl,BOMB_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	b,a
	ld	a,c
	ld	hl,BOMB_X
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	l,b
	call	plat_restore_small
.nb:	ld	hl,BOMB_ST
	ld	a,(hl)
	inc	a
	jp	nz,.ns
	ld	(hl),a
.ns:	ld	a,(PL_HIT)
	cp	5
	ret	nc
	ld	a,(BUF_BACK)
	ld	hl,T_015F
	call	word_hl_a
	push	de
	ld	a,(BUF_BACK)
	call	pl_xy
	call	plat_restore_16
	ret

; player_move: джойстик (маски — SM_*, их ставит выбор управления) -> скорость 3D51h/3D52h; огонь, бомба
p_player_move:
	ld	a,(PL_HIT)
	or	a
	ret	nz
	ld	a,(BUF_FRONT)
	ld	hl,PL_X
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	c,a		; X на переднем экране
	ld	a,(JOY)
	ld	b,a
	ld	a,(SM_2FF0)	; влево
	and	b
	jp	z,.nl
	ld	a,c
	cp	0x04
	jp	z,.nl
	ld	a,0xfe
	ld	(PL_DX),a
.nl:	ld	a,(SM_2FFF)	; вправо
	and	b
	jp	z,.nr
	ld	a,c
	cp	0x74
	jp	z,.nr
	ld	a,0x02
	ld	(PL_DX),a
.nr:	ld	a,(BUF_FRONT)
	ld	hl,PL_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	hl,CAM_OFF
	add	a,(hl)
	ld	c,a		; Y на экране
	cp	0x49
	jp	c,.nu
	ld	a,(SM_3019)	; вверх
	and	b
	jp	z,.nu
	ld	hl,PL_DY
	ld	a,(hl)
	sub	4
	ld	(hl),a
.nu:	ld	a,(SM_3025)	; вниз
	and	b
	jp	z,.nd
	ld	a,c
	cp	0xd8
	jp	nc,.nd
	ld	hl,PL_DY
	ld	a,(hl)
	add	a,4
	ld	(hl),a
.nd:	ld	a,(SM_3039)	; огонь отпущен — можно снова
	and	b
	jp	nz,.held
	ld	(FIRE_HELD),a
.held:	ld	a,(SM_3041)	; огонь
	and	b
	jp	z,.bomb
	ld	hl,FIRE_HELD
	ld	a,(hl)
	or	a
	jp	nz,.bomb
	inc	(hl)
	ld	hl,SHOT_ST	; первый свободный из 4 выстрелов
	ld	c,0
.fs:	ld	a,(hl)
	or	a
	jp	z,.free
	inc	hl
	inc	c
	ld	a,c
	cp	4
	jp	nz,.fs
	jp	.bomb
.free:	ld	(hl),1
	ld	a,(BUF_FRONT)
	add	a,c
	add	a,c		; смещение: экран + 2*выстрел
	ld	e,a
	ld	d,0
	ld	a,(BUF_BACK)
	call	pl_xy		; A = X, L = Y заднего экрана
	ld	h,a
	ld	a,l
	ld	bc,SHOT_Y
	push	hl
	ld	hl,0
	add	hl,de
	add	hl,bc
	ld	(hl),a
	ld	bc,SHOT_X-SHOT_Y
	add	hl,bc
	pop	bc
	ld	(hl),b
	ld	a,(JOY)
	push	af
	ld	d,0x01
	ld	hl,0x0f02
	ld	e,0x40
	call	plat_sfx
	pop	af
	ld	b,a
.bomb:	ld	a,(SM_3090)	; бомба
	and	b
	ret	z
	ld	hl,BOMB_ST
	ld	a,(hl)
	or	a
	ret	nz
	inc	(hl)
	ld	a,(BUF_BACK)
	call	pl_xy
	ld	b,a		; X
	ld	a,(BUF_FRONT)
	ld	e,a
	ld	d,0
	ld	a,l
	ld	hl,BOMB_Y
	add	hl,de
	ld	(hl),a
	ld	hl,BOMB_X
	add	hl,de
	ld	a,b
	add	a,3
	ld	(hl),a
	ld	d,0x01
	ld	hl,0x0f01
	ld	e,0x43
	jp	plat_sfx

; маски кнопок (операнды AND в коде CPC)
SM_2FF0: db	0
SM_2FFF: db	0
SM_3019: db	0
SM_3025: db	0
SM_3039: db	0
SM_3041: db	0
SM_3090: db	0
