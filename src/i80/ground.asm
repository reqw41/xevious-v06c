; Наземные объекты (8 слотов): попадание бомбы, стрельба целей, проход по слотам. По src/model/ground.js.
B_ST	equ	0x3dd0
B_X	equ	0x3da0
B_Y	equ	0x3db8
B_DX	equ	0x3ddc
B_DY	equ	0x3de8
G_HV	equ	G_ARG		; счётчик попадания/анимации
FLAG_ST	equ	0x3f2a
FLAG_XY	equ	0x3f2b		; Y, X открывшегося флага
GI	equ	SCRATCH+8	; номер слота
GX	equ	SCRATCH+9
GY	equ	SCRATCH+10
GT	equ	SCRATCH+11	; тип
GL	equ	SCRATCH+12	; Y экрана
GH	equ	SCRATCH+13	; X вывода следа
GS	equ	SCRATCH+14	; состояние после проверки ухода
GF_J	equ	SCRATCH+16

; hit_bomb: A = X, L = Y объекта (мира); стек: байты bx, by (точка бомбы), снимает 2. A = 1 — попала.
; X: окна бомбы SM_185B, объекта 8; Y: бомбы SM_1868, объекта 10h
p_hit_bomb:
	ld	c,a
	ld	e,l
	ld	hl,2
	add	hl,sp
	ld	b,(hl)		; bx
	inc	hl
	ld	d,(hl)		; by
	push	de
	ld	a,(SM_185B)
	ld	d,a
	ld	e,8
	call	overlap
	pop	de
	jp	c,.no
	ld	b,d
	ld	c,e
	ld	a,(SM_1868)
	ld	d,a
	ld	e,0x10
	call	overlap
	jp	c,.no
	ld	a,1
	jp	.out
.no:	xor	a
.out:	pop	hl
	pop	bc
	jp	(hl)

; |A| (80h остаётся 80h)
absa:	or	a
	ret	p
	cpl
	inc	a
	ret

; A = 0 -> 0; иначе знак минус -> H, плюс -> L
sgnsel:	or	a
	ret	z
	ld	a,l
	ret	p
	ld	a,h
	ret

; ground_fire: пуля от цели (A = X, L = Y экрана) в сторону игрока; свободный из 12 слотов пуль.
; Шаг: по X ±1/2, по Y ±2/4 — по отношению расстояний (в клетках 8 по X и 16 по Y)
p_ground_fire:
	ld	c,a
	ld	a,(SM_1A21)
	cp	0xc9
	ret	z
	ld	a,c
	cp	6
	ret	c
	cp	0x79
	ret	nc
	ld	a,(CAM_OFF)
	add	a,l
	cp	0xf0
	ret	nc
	ld	b,l
	ld	hl,B_ST
	ld	e,0
.f:	ld	a,(hl)
	or	a
	jp	z,.ok
	inc	hl
	inc	e
	ld	a,e
	cp	12
	jp	c,.f
	ret
.ok:	ld	a,e
	ld	(GF_J),a
	ld	a,(BUF_FRONT)
	add	a,e
	add	a,e
	ld	e,a
	ld	hl,B_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),c
	ld	a,e
	ld	hl,B_Y
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),b
	ld	a,(BUF_FRONT)
	ld	hl,PL_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	add	a,4
	rrca
	rrca
	rrca
	and	0x1f
	ld	d,a
	ld	a,c
	rrca
	rrca
	rrca
	and	0x1f
	ld	e,a
	ld	a,d
	sub	e
	ld	d,a		; dx в клетках
	ld	a,(CAM_Y)
	ld	e,a
	ld	a,(BUF_FRONT)
	ld	hl,PL_Y
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	sub	e
	rrca
	rrca
	rrca
	rrca
	and	0x0f
	ld	h,a
	ld	a,b
	sub	e
	rrca
	rrca
	rrca
	rrca
	and	0x0f
	ld	l,a
	ld	a,h
	sub	l
	ld	e,a		; dy в клетках
	call	absa
	ld	c,a
	ld	a,d
	call	absa
	ld	b,a
	ld	a,d
	or	a
	jp	z,.ax
	ld	a,e
	or	a
	jp	z,.ax
	ld	a,b
	cp	c
	jp	z,.ax
	jp	c,.lt
	ld	hl,0xfe02
	ld	a,d
	call	sgnsel
	ld	d,a
	ld	a,e
	call	sgnsel
	ld	e,a
	jp	.set
.lt:	ld	hl,0xff01
	ld	a,d
	call	sgnsel
	ld	d,a
	ld	hl,0xfc04
	ld	a,e
	call	sgnsel
	ld	e,a
	jp	.set
.ax:	ld	hl,0xfe02
	ld	a,d
	call	sgnsel
	ld	d,a
	ld	hl,0xfc04
	ld	a,e
	call	sgnsel
	ld	e,a
.set:	ld	a,d
	or	e
	ret	z
	ld	a,(GF_J)
	ld	hl,B_ST
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	inc	(hl)
	ld	a,(GF_J)
	ld	hl,B_DX
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),d
	ld	a,(GF_J)
	ld	hl,B_DY
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),e
	ret

; вывод картинки HL в точке (GX, GL): вернуть фон 16 строк / картинка наземного объекта.
; Адрес возврата и картинка меняются местами — платформа снимает аргумент и возвращается к вызвавшему
g_r16:	pop	de
	push	hl
	push	de
	ld	a,(GL)
	ld	l,a
	ld	a,(GX)
	jp	plat_restore_16
g_dg:	pop	de
	push	hl
	push	de
	ld	a,(GL)
	ld	l,a
	ld	a,(GX)
	jp	plat_draw_ground

; адрес слота HL = таблица + GI
g_slot:	ld	a,(GI)
	jp	at_hl_a

; upd_ground_tiles: точка бомбы (если упала, 0Eh+); по слотам: едут с картой, уход, вывод появления,
; взрыв, попадание бомбы (ядро Андор — всё заново с большой зоной), стрельба, анимация отметок
p_upd_ground_tiles:
	ld	a,(BOMB_ST)
	cp	0x0e
	jp	c,.rs
	ld	a,(BUF_FRONT)
	ld	c,a
	ld	hl,BOMB_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(SM_1C77),a
	ld	a,c
	ld	hl,BOMB_Y
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(SM_1C78),a
.rs:	xor	a
	ld	(GI),a
.lp:	ld	hl,G_ST
	call	g_slot
	or	a
	jp	z,.nx
	ld	a,(SLOW)
	or	a
	jp	nz,.nm
	ld	a,(GI)
	ld	c,a
	ld	a,8
	sub	c
	ld	hl,SM_1B4C
	cp	(hl)
	jp	nc,.nm
	ld	hl,G_Y
	call	g_slot
	inc	(hl)
.nm:	ld	hl,G_Y
	call	g_slot
	ld	(GY),a
	ld	b,a
	ld	hl,G_X
	call	g_slot
	ld	(GX),a
	ld	(GH),a
	ld	hl,G_TYPE
	call	g_slot
	ld	(GT),a
	ld	a,(CAM_Y)
	add	a,b
	ld	(GL),a
	ld	hl,G_ST
	call	g_slot
	ld	a,b
	cp	0xe0
	jp	nz,.ne
	ld	(hl),0
.ne:	ld	a,(hl)
	ld	(GS),a
; вывод появления
	ld	a,(GT)
	cp	0x2b
	jp	c,.lo
	cp	0x41
	jp	z,.lo
	ld	a,(GY)
	cp	9
	jp	nz,.dr
	ld	a,(GT)
	ld	hl,0xfe40
	cp	0x39
	jp	z,.r9
	ld	hl,0xfe00
	cp	0x37
	jp	z,.r9
	ld	hl,0xfdc0
	cp	0x2d
	jp	z,.r9
	ld	hl,0xfd80
.r9:	call	g_r16
	jp	.dr
.lo:	ld	a,(GS)
	ld	c,a
	ld	a,(GT)
	cp	0x2b
	jp	nc,.l41
	ld	a,c
	cp	0x10
	jp	z,.m9
.l41:	ld	a,c
	cp	0xfe
	jp	nz,.dr
	ld	a,(GT)
	cp	0x28
	jp	nz,.m9
	ld	a,(GY)
	cp	9
	jp	nz,.dr
	ld	hl,0xfe80
	call	g_r16
	jp	.dr
.m9:	ld	a,(GY)
	cp	9
	jp	nz,.dr
	ld	a,(GL)
	ld	l,a
	ld	a,(GX)
	call	plat_mark_a
; взрыв: счётчик нечётный, +2; кадры 8780h, 8700h, затем след (у флага — открытие)
.dr:	ld	hl,G_HV
	call	g_slot
	rrca
	jp	nc,.nexp
	rlca
	add	a,2
	ld	(hl),a
	cp	5
	jp	nc,.e7
	ld	hl,0x8780
	call	g_dg
	jp	.ee
.e7:	cp	7
	jp	nc,.e9
	ld	hl,0x8700
	call	g_dg
	jp	.ee
.e9:	ld	a,(GT)
	cp	0x41
	jp	nz,.edead
	ld	a,1
	ld	(FLAG_ST),a
	ld	a,(GL)
	ld	(FLAG_XY),a
	ld	a,(GX)
	ld	(FLAG_XY+1),a
	ld	hl,0xbb00
	call	g_r16
	ld	a,(FLAG_XY)
	ld	(GL),a
	ld	a,(FLAG_XY+1)
	ld	(GH),a
	ld	hl,0x9a00
	push	hl
	ld	a,(GL)
	ld	l,a
	ld	a,(GH)
	call	plat_draw_ground
	jp	.ee
.edead:	ld	hl,0xc9c0
	cp	0x27
	jp	z,.ed
	ld	hl,0xffc0
	cp	0x28
	jp	z,.ed
	ld	hl,0xff80
	cp	0x39
	jp	z,.ed
	ld	hl,0xff40
	cp	0x37
	jp	z,.ed
	ld	hl,0xff00
	cp	0x2d
	jp	z,.ed
	ld	hl,0xfec0
	cp	0x2b
	jp	z,.ed
	ld	hl,0xc980
	cp	0x26
	jp	z,.ed
	ld	hl,0xc540
	cp	0x15
	jp	z,.ed
	ld	hl,0xc580
.ed:	call	g_r16
.ee:	ld	hl,G_HV
	call	g_slot
	cp	0x0b
	jp	nz,.nx
	ld	hl,G_ST
	call	g_slot
	ld	(hl),0
	ex	de,hl		; DE — адрес состояния слота (IX+8 у Z80)
	ld	a,(GL)
	ld	l,a
	ld	a,(GH)
	call	plat_mark_dead
	jp	.nx
; попадание бомбы
.nexp:	ld	a,(BOMB_ST)
	cp	0x0e
	jp	c,.nohit
	ld	a,(SM_1C7B)
	ld	b,a
	ld	a,(CAM_Y)
	add	a,b
	ld	b,a
	ld	a,(SM_1C78)
	sub	b
	ld	d,a		; by
	ld	a,(SM_1C84)
	ld	b,a
	ld	a,(SM_1C77)
	sub	b
	ld	e,a		; bx
	push	de
	ld	a,(GY)
	ld	l,a
	ld	a,(GX)
	call	p_hit_bomb
	or	a
	jp	z,.nohit
	ld	a,(GS)
	cp	0xfe
	jp	nz,.hit
	ld	a,(GY)
	cp	0x18
	jp	c,.nohit
	ld	hl,G_ST			; ядро базы Андор
	call	g_slot
	ld	(hl),1
	ld	a,8
	ld	(SM_1C84),a
	ld	a,0x10
	ld	(SM_1C7B),a
	ld	a,0x12
	ld	(SM_185B),a
	ld	a,0x24
	ld	(SM_1868),a
	ld	a,(GI)
	ld	c,a
	ld	a,8
	sub	c
	ld	(SM_1B4C),a
	jp	.rs
.hit:	ld	d,2
	ld	hl,0x0f03
	ld	e,0x30
	call	plat_sfx
	ld	a,(GT)
	and	0x40
	jp	z,.hg
	ld	hl,0xbb00
	push	hl
	ld	hl,0x8780
	push	hl
	ld	a,(GL)
	ld	l,a
	ld	a,(GX)
	call	plat_draw_sprite
	jp	.hs
.hg:	ld	hl,0x8780
	call	g_dg
.hs:	ld	hl,G_HV
	call	g_slot
	ld	(hl),1
	ld	l,1
	ld	a,(GS)
	cp	1
	jp	nz,.pt
	ld	a,(GT)
	cp	0x41
	jp	z,.p10
	cp	0x28
	jp	nz,.pt
	xor	a
	ld	(ANDOR_ON),a
	ld	(SLOW),a
.p10:	ld	l,0x10
.pt:	ld	a,2
	call	p_add_score
	jp	.nx
; не задета: стрельба, анимация
.nohit:	ld	hl,G_HV
	call	g_slot
	or	a
	jp	nz,.nf
	ld	a,(GS)
	cp	0x10
	jp	z,.fire
	cp	8
	jp	z,.fire
	cp	4
	jp	nz,.nf
.fire:	ld	a,(CAM_Y)
	ld	b,a
	ld	a,(GY)
	add	a,b
	add	a,8
	ld	l,a
	ld	a,(GX)
	add	a,4
	call	p_ground_fire
.nf:	ld	a,(GS)
	sub	2
	jp	m,.nx
	ld	hl,G_HV
	call	g_slot
	ld	c,a
	ld	a,(GS)
	add	a,c
	ld	(hl),a
	ld	d,a
	ld	a,(GS)
	cp	4
	jp	nz,.nx
	ld	a,(CAM_Y)
	ld	b,a
	ld	a,(GY)
	add	a,b
	ld	l,a
	ld	a,d
	cp	0xf8
	jp	z,.ma
	cp	0xfc
	jp	z,.ma
	cp	4
	jp	z,.mb
	cp	8
	jp	nz,.nx
.mb:	ld	a,(GX)
	call	plat_mark_b
	jp	.nx
.ma:	ld	a,(GX)
	call	plat_mark_a
.nx:	ld	a,(GI)
	inc	a
	ld	(GI),a
	cp	8
	jp	c,.lp
; вернуть малую зону поражения
	ld	a,(SM_1B4C)
	cp	9
	ret	z
	ld	a,9
	ld	(SM_1B4C),a
	ld	a,2
	ld	(SM_185B),a
	ld	a,4
	ld	(SM_1868),a
	xor	a
	ld	(SM_1C84),a
	ld	(SM_1C7B),a
	ret

SM_1A21: db	0		; C9h — стрельба целей выключена
SM_1B4C: db	0		; предел слотов, что едут с картой
SM_185B: db	0		; окно бомбы по X
SM_1868: db	0		; окно бомбы по Y
SM_1C77: db	0		; точка бомбы X
SM_1C78: db	0		; точка бомбы Y
SM_1C7B: db	0		; смещение точки по Y
SM_1C84: db	0		; смещение точки по X
