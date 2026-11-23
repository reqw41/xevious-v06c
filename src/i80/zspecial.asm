; Особые объекты зон. По src/model/zspecial.js.
; Зоны 2–3 (5 слотов z): неуязвимые, выстрел отражают. X/Y/задержка/кадр — пары по экранам (2z+экран),
; буферы T_01BF + 4z + 2·экран. Зоны 4 и 8 (6 слотов w): состояние до 28h, затем выстрел и уход;
; буферы T_03B3 + 4w + 2·экран.
Z_ST	equ	0x3e60
Z_X	equ	0x3e65
Z_Y	equ	0x3e6f
Z_DL	equ	0x3e79
Z_FR	equ	0x3e83
Z_N	equ	0x3e8d
Z_TM	equ	0x3e8e
W_ST	equ	0x3e3a
W_DX	equ	0x3e40
W_DY	equ	0x3e46
W_X	equ	0x3e22
W_Y	equ	0x3e2e
ZW	equ	SCRATCH+44	; номер слота
ZKB	equ	SCRATCH+45
ZKF	equ	SCRATCH+46
ZX	equ	SCRATCH+47
ZY	equ	SCRATCH+48
ZI	equ	SCRATCH+49	; номер выстрела

; вызов платформы HL с A = (ZX), L = (ZY) и уже положенными аргументами на стеке:
; адрес платформы кладётся поверх адреса возврата, RET переходит на неё
z_go:	ex	(sp),hl		; на стеке: платформа; HL — адрес возврата вызвавшего
	ex	de,hl
	pop	hl		; HL — платформа
	push	de		; адрес возврата вызвавшего
	push	hl		; платформа
	ld	a,(ZY)
	ld	l,a
	ld	a,(ZX)
	ret

; попадание в игрока объекта (ZX, ZY) с окном HL (L = w, H = h), если он ещё не задет
z_hitpl:
	ld	a,(PL_HIT)
	or	a
	ret	nz
	push	hl
	ld	a,(BUF_BACK)
	ld	hl,PL_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	d,a
	ld	a,(BUF_BACK)
	ld	hl,PL_X
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	e,a
	pop	hl
	push	de
	push	hl
	ld	a,(ZY)
	ld	l,a
	ld	a,(ZX)
	call	p_hit_player
.hitw:	ld	(PL_HIT),a	; титул Вектора (G) переводит запись на 0037h — неуязвимость
	ret

; A = 1 — выстрел ZI в состоянии 3 задевает объект (ZX, ZY) (в заднем экране)
z_shot:	ld	a,(ZI)
	ld	hl,SHOT_ST
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	cp	3
	ld	a,0
	ret	nz
	ld	a,(BUF_BACK)
	ld	b,a
	ld	a,(ZI)
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
	push	de
	ld	a,(ZY)
	ld	l,a
	ld	a,(ZX)
	call	p_hit_16
	ret

; выстрел ZI -> FEh
z_shot_off:
	ld	a,(ZI)
	ld	hl,SHOT_ST
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),0xfe
	ret

; (ZX), (ZY) = X, Y объекта таблиц DE (X) и HL (Y) по индексу ZKB
z_xy:	ld	a,(ZKB)
	call	at_hl_a
	ld	(ZY),a
	ex	de,hl
	ld	a,(ZKB)
	call	at_hl_a
	ld	(ZX),a
	ret

; spawn_z23: таймер 3E8Eh; на 0 — в свободный слот (таймер 18h): кадр = номер слота, X = 32·rnd(3) + 8,
; Y = камера — на обоих экранах; задержка: передний, задний; всего +1
p_spawn_z23:
	ld	hl,Z_TM
	ld	a,(hl)
	or	a
	jp	z,.s
	dec	(hl)
	ret
.s:	ld	hl,Z_ST
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
.ok:	ld	(hl),1
	ld	a,0x18
	ld	(Z_TM),a
	ld	a,c
	ld	(ZW),a
	add	a,a
	ld	(ZKB),a
	ld	hl,Z_FR
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	a,(ZW)
	ld	(hl),a
	inc	hl
	ld	(hl),a
	ld	a,3
	call	p_rnd
	rrca
	rrca
	rrca
	add	a,8
	ld	c,a
	ld	a,(ZKB)
	ld	hl,Z_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),c
	inc	hl
	ld	(hl),c
	ld	a,(ZKB)
	ld	hl,Z_Y
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	a,(CAM_Y)
	ld	(hl),a
	inc	hl
	ld	(hl),a
	ld	a,(ZKB)
	ld	hl,Z_DL
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	a,(BUF_FRONT)
	ld	(hl),a
	inc	hl
	ld	a,(BUF_BACK)
	ld	(hl),a
	ld	hl,Z_N
	inc	(hl)
	ret

; erase_z23: слоты 0..4: таран игрока (11×15), отражение выстрелов (все задевшие — FEh, звук);
; задержка 0 — +1 и дальше; иначе стереть по кадру; FFh — снять (всего −1); ушёл вниз — FFh
p_erase_z23:
	xor	a
	ld	(ZW),a
.lp:	ld	a,(ZW)
.la:	ld	hl,Z_ST
	add	a,l		; массив в одной странице
	ld	l,a
	ld	c,0xff & (Z_ST + 5)
	call	slot_up	; пустые слоты пропускаются; Z — больше нет
	ret	z
	ld	a,l
	sub	Z_ST & 0xff
	ld	(ZW),a
	ld	a,(hl)
	ld	a,(BUF_BACK)
	ld	c,a
	ld	a,(ZW)
	add	a,a
	add	a,c
	ld	(ZKB),a
	ld	de,Z_X
	ld	hl,Z_Y
	call	z_xy
	ld	hl,0x0f0b
	call	z_hitpl
	xor	a
	ld	(ZI),a
.sl:	call	z_shot
	or	a
	jp	z,.sn
	call	z_shot_off
	ld	d,2
	ld	hl,0x0f05
	ld	e,0x48
	call	plat_sfx
.sn:	ld	a,(ZI)
	inc	a
	ld	(ZI),a
	cp	4
	jp	c,.sl
	ld	a,(ZKB)
	ld	hl,Z_DL
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	or	a
	jp	nz,.er
	inc	(hl)
	jp	.nx
.er:	ld	a,(ZKB)
	ld	hl,T_01BF
	call	word_hl_a
	push	de		; s0 — буфер
	ld	a,(ZKB)
	ld	hl,Z_FR
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	rlca			; SRA: знак в CY, затем сдвиг вправо
	rrca
	rra
	ld	hl,plat_restore_z23a
	or	a
	jp	z,.rc
	ld	hl,plat_restore_z23b
	cp	2
	jp	z,.rc
	ld	hl,plat_restore_z23c
.rc:	call	z_go
.st:	ld	a,(ZW)
	ld	hl,Z_ST
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	inc	a
	jp	nz,.dn
	ld	(hl),a
	ld	hl,Z_N
	dec	(hl)
	jp	.nx
.dn:	ld	a,(CAM_Y)
	ld	c,a
	ld	a,(ZY)
	sub	c
	cp	0xe8
	jp	c,.nx
	ld	a,(ZW)
	ld	hl,Z_ST
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),0xff
.nx:	ld	a,(ZW)
	inc	a
	jp	.la

; upd_z23: слоты 0..4: Y заднего = Y переднего + 1, кадр +1 (из 8), вывод по кадру (буфер — по экрану,
; обратному переднему; третий вид — с картинкой 8580h/85C0h)
p_upd_z23:
	xor	a
	ld	(ZW),a
.lp:	ld	a,(ZW)
.la:	ld	hl,Z_ST
	add	a,l		; массив в одной странице
	ld	l,a
	ld	c,0xff & (Z_ST + 5)
	call	slot_up	; пустые слоты пропускаются; Z — больше нет
	ret	z
	ld	a,l
	sub	Z_ST & 0xff
	ld	(ZW),a
	ld	a,(hl)
	ld	a,(ZW)
	add	a,a
	ld	c,a
	ld	a,(BUF_BACK)
	add	a,c
	ld	(ZKB),a
	ld	a,(BUF_FRONT)
	add	a,c
	ld	hl,Z_Y
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	inc	a
	ld	b,a
	ld	(ZY),a
	ld	a,(ZKB)
	ld	hl,Z_Y
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),b
	ld	a,(ZKB)
	ld	hl,Z_FR
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	inc	a
	and	7
	ld	(hl),a
	ld	b,a		; кадр
	ld	a,(ZKB)
	ld	hl,Z_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(ZX),a
	ld	a,(BUF_FRONT)
	xor	1
	ld	c,a
	ld	a,(ZW)
	add	a,a
	add	a,c
	ld	hl,T_01BF
	call	word_hl_a
	ld	a,b
	rrca
	and	3		; h = кадр >> 1
	ld	hl,plat_draw_z23a
	jp	z,.one
	cp	2
	ld	hl,plat_draw_z23b
	jp	z,.one
	ld	hl,0x8580
	cp	3
	jp	nz,.c
	ld	hl,0x85c0
.c:	push	hl		; s1 — картинка
	ld	hl,plat_draw_z23c
.one:	push	de		; s0 — буфер
	call	z_go
.nx:	ld	a,(ZW)
	inc	a
	jp	.la

; spawn_z48: на строке камеры, кратной 16, — в свободный из 6: чётные справа (X 70h, dX −1),
; нечётные слева (X 10h, dX +1); dY 1, Y = камера + w + 20h (в переднем экране)
p_spawn_z48:
	ld	a,(CAM_Y)
	and	0x0f
	ret	nz
	ld	hl,W_ST
	ld	c,0
.f:	ld	a,(hl)
	or	a
	jp	z,.ok
	inc	hl
	inc	c
	ld	a,c
	cp	6
	jp	c,.f
	ret
.ok:	ld	(hl),1
	ld	a,c
	and	1
	ld	de,0x70ff	; D = X, E = dX
	jp	z,.ev
	ld	de,0x1001
.ev:	ld	a,c
	ld	hl,W_DX
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),e
	ld	a,c
	ld	hl,W_DY
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),1
	ld	a,(BUF_FRONT)
	add	a,c
	add	a,c
	ld	b,a
	ld	hl,W_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),d
	ld	a,(CAM_Y)
	add	a,c
	add	a,0x20
	ld	d,a
	ld	a,b
	ld	hl,W_Y
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),d
	ret

; erase_z48: слоты 5..0 с состоянием 3+: стереть, таран игрока (3×7), сбит выстрелом (до FCh) — FCh,
; звук, 50 очков; FFh — снять
p_erase_z48:
	ld	a,5
	ld	(ZW),a
.lp:	ld	a,(ZW)
	ld	hl,W_ST
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	cp	3
	jp	c,.ff
	ld	a,(BUF_BACK)
	ld	c,a
	ld	a,(ZW)
	add	a,a
	add	a,c
	ld	(ZKB),a
	ld	de,W_X
	ld	hl,W_Y
	call	z_xy
	ld	a,(ZKB)
	ld	hl,T_03B3
	call	word_hl_a
	push	de
	ld	a,(ZY)
	ld	l,a
	ld	a,(ZX)
	call	plat_restore_z48
	ld	hl,0x0703
	call	z_hitpl
	xor	a
	ld	(ZI),a
.sl:	ld	a,(ZW)
	ld	hl,W_ST
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	cp	0xfc
	jp	nc,.sn
	call	z_shot
	or	a
	jp	z,.sn
	ld	a,(ZW)
	ld	hl,W_ST
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),0xfc
	call	z_shot_off
	ld	d,2
	ld	hl,0x0f04
	ld	e,0x40
	call	plat_sfx
	ld	a,2
	ld	l,5
	call	p_add_score
	jp	.ff
.sn:	ld	a,(ZI)
	inc	a
	ld	(ZI),a
	cp	4
	jp	c,.sl
.ff:	ld	a,(ZW)
	ld	hl,W_ST
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	inc	a
	jp	nz,.nx
	ld	(hl),a
.nx:	ld	a,(ZW)
	dec	a
	ld	(ZW),a
	jp	p,.lp
	ret

; upd_z48: слоты 0..5: FEh или ушёл за края — FFh; на 28h — FFh и выстрел; иначе состояние +1, шаг,
; при FDh+ X чётный; вывод: FDh/FEh — кадр 9880h/98A0h, иначе сам объект
p_upd_z48:
	xor	a
	ld	(ZW),a
.lp:	ld	a,(ZW)
.la:	ld	hl,W_ST
	add	a,l		; массив в одной странице
	ld	l,a
	ld	c,0xff & (W_ST + 6)
	call	slot_up	; пустые слоты пропускаются; Z — больше нет
	ret	z
	ld	a,l
	sub	W_ST & 0xff
	ld	(ZW),a
	ld	a,(hl)
	ld	b,a		; st
	ld	a,(ZW)
	add	a,a
	ld	c,a
	ld	a,(BUF_BACK)
	add	a,c
	ld	(ZKB),a
	ld	a,(BUF_FRONT)
	add	a,c
	ld	(ZKF),a
	ld	hl,W_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(ZX),a
	ld	a,(ZKF)
	ld	hl,W_Y
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(ZY),a
	ld	a,b
	cp	0xfe
	jp	z,.kill
	ld	a,(ZX)
	cp	3
	jp	c,.kill
	cp	0x7d
	jp	nc,.kill
	ld	a,(CAM_Y)
	ld	c,a
	ld	a,(ZY)
	sub	c
	cp	0xe1
	jp	nc,.kill
	ld	a,b
	cp	0x28
	jp	nz,.go
	ld	a,(ZW)
	ld	hl,W_ST
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),0xff
	ld	a,(ZY)
	ld	l,a
	ld	a,(ZX)
	call	p_ground_fire
	jp	.nx
.go:	ld	a,(ZW)
	ld	hl,W_ST
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	inc	a
	ld	(hl),a
	ld	b,a		; новое состояние
	ld	a,(ZW)
	ld	hl,W_DX
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	c,a
	ld	a,(ZX)
	add	a,c
	ld	c,a
	ld	a,b
	cp	0xfd
	jp	c,.ev
	ld	a,c
	and	0xfe
	ld	c,a
.ev:	ld	a,(ZKB)
	ld	hl,W_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),c
	ld	a,c
	ld	(ZX),a
	ld	a,(ZW)
	ld	hl,W_DY
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	c,a
	ld	a,(ZY)
	add	a,c
	ld	(ZY),a
	ld	c,a
	ld	a,(ZKB)
	ld	hl,W_Y
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),c
	ld	a,(ZKB)
	ld	hl,T_03B3
	call	word_hl_a
	ld	a,b
	cp	0xfd
	ld	hl,0x9880
	jp	z,.gl
	cp	0xfe
	ld	hl,0x98a0
	jp	z,.gl
	push	de
	ld	hl,plat_draw_z48
	call	z_go
	jp	.nx
.gl:	push	de		; s1 — буфер
	push	hl		; s0 — кадр
	ld	hl,plat_draw_glyph
	call	z_go
	jp	.nx
.kill:	ld	a,(ZW)
	ld	hl,W_ST
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),0xff
.nx:	ld	a,(ZW)
	inc	a
	jp	.la
