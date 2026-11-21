; Ход игры вокруг объектов: особый флаг, пауза между волнами, надписи, рекорд. По src/model/flow.js.
; (death_seq — вместе с жизнью и концом игры, life.asm)
FLAG_MAP equ	0x3f2d		; адрес флага в карте (окно CPC)
OVER_MSG equ	0x3f33
READY	equ	0x3f32
HISCORE	equ	0x3f21		; 3 байта BCD
TXT_OVER equ	0x0419		; строка надписи в коде CPC — значение для платформы

; special_flag: открытый флаг (FLAG_ST = 1) подобран игроком (окно 8×16) — стереть, FLAG_ST = 2,
; на карту код 40h, доп. жизнь (если жизни ещё есть)
p_special_flag:
	ld	a,(FLAG_ST)
	cp	1
	ret	nz
	ld	a,(BUF_BACK)
	ld	hl,PL_Y
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	d,a
	ld	a,(BUF_BACK)
	ld	hl,PL_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	e,a
	push	de
	ld	hl,0x1008
	push	hl
	ld	a,(FLAG_XY)
	ld	l,a
	ld	a,(FLAG_XY+1)
	call	p_hit_player
	or	a
	ret	z
	ld	hl,0xbb00
	push	hl
	ld	a,(FLAG_XY)
	ld	l,a
	ld	a,(FLAG_XY+1)
	call	plat_restore_16
	ld	a,2
	ld	(FLAG_ST),a
	ld	hl,(FLAG_MAP)
	ex	de,hl
	ld	a,0x40
	call	p_map_put
	ld	a,(LIVES)
	or	a
	ret	z
	jp	p_extra_life

; timer_3d9f: волна выбита — пауза SM_389F шагов с видом волны FFh, затем 0
p_timer_3d9f:
	ld	a,(ALIVE)
	or	a
	jp	nz,.c
	ld	a,(KIND)
	cp	0xff
	jp	z,.c
	ld	a,(SM_389F)
	ld	(ALIVE),a
	ld	a,0xff
	ld	(KIND),a
.c:	ld	a,(KIND)
	cp	0xff
	ret	nz
	ld	hl,ALIVE
	ld	a,(hl)
	or	a
	ret	z
	dec	(hl)
	ret

; over_msg: гибель на последней жизни — надпись (OVER_MSG = 1), вывод
p_over_msg:
	ld	a,(OVER_MSG)
	or	a
	jp	nz,.show
	ld	a,(PL_HIT)
	or	a
	ret	z
	ld	a,(LIVES)
	cp	1
	ret	nz
	ld	(OVER_MSG),a
.show:	ld	hl,0xbb40
	push	hl
	ld	hl,TXT_OVER
	push	hl
	ld	a,(CAM_Y)
	add	a,0x50
	ld	l,a
	ld	a,0x30
	call	plat_print_text
	ret

; put_blocks с A = X, L = Y, DE = блоки, C = их число (байт на стеке, снимает 3)
blocks:	ld	b,a
	ld	a,c
	push	af
	inc	sp
	push	de
	ld	a,b
	call	plat_put_blocks
	ret

; over_msg_erase: стереть надпись (со второго раза)
p_over_msg_erase:
	ld	hl,OVER_MSG
	ld	a,(hl)
	or	a
	ret	z
	dec	a
	jp	nz,.er
	inc	(hl)
	ret
.er:	ld	a,(CAM_Y_OLD)
	add	a,0x50
	ld	l,a
	push	hl
	ld	de,0xbb40
	ld	c,4
	ld	a,0x30
	call	blocks
	pop	hl
	ld	de,0xbb80
	ld	c,4
	ld	a,0x44
	jp	blocks

; ready_msg: надпись начала жизни; на последнем шаге (READY = 1) включить стрельбу целей
p_ready_msg:
	ld	a,(READY)
	or	a
	ret	z
	dec	a
	jp	nz,.sh
	ld	(READY),a
	ld	(SM_1A21),a
.sh:	ld	a,(CAM_Y_OLD)
	add	a,0x50
	ld	l,a
	push	hl
	ld	de,0xa900
	ld	c,6
	ld	a,0x2c
	call	blocks
	pop	hl
	push	hl
	ld	de,0xa960
	ld	c,3
	ld	a,0x48
	call	blocks
	pop	hl
	ld	a,l
	add	a,0x10
	ld	l,a
	ld	de,0xa990
	ld	c,6
	ld	a,0x34
	jp	blocks

; hiscore: рекорд := очки, если больше (SM_285D = 1, иначе 0); вывод очков
p_hiscore:
	ld	hl,HISCORE
	ld	de,SCORE
	ld	b,3
.cmp:	ld	a,(de)
	cp	(hl)
	jp	nz,.ne
	inc	hl
	inc	de
	dec	b
	jp	nz,.cmp
	jp	.no
.ne:	jp	c,.no		; очки меньше
	ld	hl,SCORE
	ld	de,HISCORE
	ld	b,3
.cp:	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	dec	b
	jp	nz,.cp
	ld	a,1
	jp	.f
.no:	xor	a
.f:	ld	(SM_285D),a
	ld	hl,SCORE
	ld	de,0x8044
	jp	plat_print_score
SM_285D: db	0		; признак нового рекорда
