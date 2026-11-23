; Воздушные враги (5 слотов a). По src/model/air.js.
; Состояние A_ST+a: 1 — летит, FBh..FEh — взрыв, FFh — стереть. X/Y — пары по экранам (2a+экран);
; буферы фона T_0177 + 4a + 2·экран; вид волны — KIND (по зоне и экрану из T_03E7), живых — ALIVE.
A_ST	equ	0x3d7b
A_DIR	equ	0x3d80		; шаг по X
A_SPD	equ	0x3d85		; шаг по Y
A_IN	equ	0x3d8a		; счётчик въезда сверху
A_SPR	equ	0x3d8f		; спрайт (слово)
A_T	equ	0x3d99		; счётчик анимации/таймер
A_X	equ	0x3d67
A_Y	equ	0x3d71
KIND	equ	0x3d9e
ALIVE	equ	0x3d9f
AA	equ	SCRATCH+44	; номер слота
AKF	equ	SCRATCH+45
AKB	equ	SCRATCH+46
AE	equ	SCRATCH+47
AXX	equ	SCRATCH+48
AYY	equ	SCRATCH+49
AKIND	equ	SCRATCH+51
AYF	equ	SCRATCH+53
ABUF	equ	SCRATCH+55	; 2 байта
ARF	equ	SCRATCH+57	; случайная стрельба разрешена
AI	equ	SCRATCH+58	; номер выстрела
ASPR	equ	SCRATCH+59	; 2 байта

; A = X слота в переднем экране (HL — его адрес)
a_xf:	ld	a,(AKF)
	ld	hl,A_X
	jp	at_hl_a
; спрайт слота = DE
a_spr_de:
	ld	a,(AA)
	add	a,a
	ld	hl,A_SPR
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	(hl),e
	inc	hl
	ld	(hl),d
	ret

; spawn_air_start: волна из 5 в начале зоны (вид — из T_03E7 по зоне и переднему экрану), живых 5
p_spawn_air_start:
	ld	a,(AREA)
	add	a,a
	ld	c,a
	ld	a,(BUF_FRONT)
	add	a,c
	ld	hl,T_03E7
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(KIND),a
	xor	a
	ld	(AA),a
.lp:	ld	a,(AA)
	add	a,a
	ld	c,a
	ld	a,(BUF_FRONT)
	add	a,c
	ld	(AKF),a
	ld	a,(KIND)
	cp	2
	jp	nc,.k2
	ld	a,3			; виды 0, 1: с края, X 68h+e или 18h−e
	call	p_rnd
	add	a,a
	add	a,a
	ld	(AE),a
	ld	a,1
	call	p_rnd
	or	a
	jp	z,.r0
	ld	a,(AE)
	add	a,0x68
	ld	c,a
	ld	b,0xff
	jp	.dx
.r0:	ld	a,(AE)
	ld	c,a
	ld	a,0x18
	sub	c
	ld	c,a
	ld	b,1
.dx:	ld	a,(AA)
	ld	hl,A_DIR
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),b
	ld	a,(AKF)
	ld	hl,A_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),c
	jp	.com
.k2:	ld	a,0x0f			; виды 2+: X случайный (вид 2 — со сдвигом 8a)
	call	p_rnd
	add	a,a
	add	a,a
	ld	c,a
	ld	a,(KIND)
	cp	2
	jp	nz,.k3
	ld	a,(AA)
	add	a,a
	add	a,a
	add	a,a
	add	a,c
	ld	c,a
	jp	.kx
.k3:	ld	a,c
	add	a,0x10
	ld	c,a
.kx:	ld	a,(AKF)
	ld	hl,A_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),c
	ld	a,(AA)			; так в коде: X игрока по номеру слота
	ld	hl,PL_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	cp	c
	ld	b,0xff
	jp	c,.kd
	ld	b,1
.kd:	ld	a,(AA)
	ld	hl,A_DIR
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),b
.com:	ld	a,(AKF)
	ld	hl,A_Y
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	a,(CAM_Y)
	ld	(hl),a
	ld	a,(AA)
	add	a,a
	add	a,a
	add	a,a
	ld	c,a
	ld	a,(AA)
	ld	hl,A_IN
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),c
	ld	a,(AA)
	ld	hl,A_ST
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),1
	ld	b,2
	ld	a,(KIND)
	or	a
	ld	hl,0x8900
	jp	z,.sp
	cp	1
	jp	nz,.s2
	ld	a,1
	call	p_rnd
	inc	a
	ld	b,a
	ld	hl,0x8100
	jp	.sp
.s2:	cp	2
	ld	hl,0x8a00
	jp	z,.sp
	ld	a,(AA)
	ld	hl,A_T
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),0
	ld	hl,0x9200
.sp:	ex	de,hl
	call	a_spr_de
	ld	a,(AA)
	ld	hl,A_SPD
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),b
	ld	a,(AKF)
	ld	hl,T_0177
	call	word_hl_a
	push	de
	ld	a,(AKF)
	ld	hl,A_Y
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	e,a
	ld	a,(AKF)
	ld	hl,A_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	l,e
	call	plat_put_tile16
	ld	a,(AA)
	inc	a
	ld	(AA),a
	cp	5
	jp	c,.lp
	ld	a,5
	ld	(ALIVE),a
	ret

; erase_air: слоты 4..0: стереть, таран игрока (7×15); взрыв — счётчик +1 (на 0 — живых −1);
; выстрелы (индекс без экрана — так в коде) — FBh, 300 очков; ушёл за край — FFh
p_erase_air:
	ld	a,4
	ld	(AA),a
.lp:	ld	a,(AA)
	ld	hl,A_ST
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	or	a
	jp	z,.nx
	ld	a,(BUF_BACK)
	ld	c,a
	ld	a,(AA)
	add	a,a
	add	a,c
	ld	(AKB),a
	ld	hl,A_X
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	(AXX),a
	ld	a,(AKB)
	ld	hl,A_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	(AYY),a
	ld	a,(AKB)
	ld	hl,T_0177
	call	word_hl_a
	push	de
	ld	a,(AYY)
	ld	l,a
	ld	a,(AXX)
	call	plat_restore_16
	ld	a,(PL_HIT)
	or	a
	jp	nz,.ns
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
	push	de
	ld	hl,0x0f07
	push	hl
	ld	a,(AYY)
	ld	l,a
	ld	a,(AXX)
	call	p_hit_player
.hitw:	ld	(PL_HIT),a	; титул Вектора (G) переводит запись на 0037h — неуязвимость
.ns:	ld	a,(AA)
	ld	hl,A_ST
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	or	a
	jp	p,.al
	inc	a
	ld	(hl),a
	jp	nz,.nx
	ld	hl,ALIVE
	dec	(hl)
	jp	.nx
.al:	ld	hl,SHOT_ST	; поиск выстрела в состоянии 3 указателем (SHOT_ST..+3 в одной странице)
.sc:	ld	a,(hl)
	cp	3
	jp	z,.sf
.sc1:	inc	l
	ld	a,l
	cp	(SHOT_ST + 4) & 0xff
	jp	c,.sc
	jp	.edge
.sf:	ld	a,l
	sub	SHOT_ST & 0xff
	ld	(AI),a
	ld	a,(AA)
	ld	hl,A_ST
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	cp	0xfd
	jp	z,.sn
	ld	a,(AI)
	add	a,a
	ld	c,a
	ld	hl,SHOT_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	d,a
	ld	a,c
	ld	hl,SHOT_X
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	e,a
	push	de
	ld	a,(AYY)
	ld	l,a
	ld	a,(AXX)
	call	p_hit_16
	or	a
	jp	z,.sn
	ld	a,(AA)
	ld	hl,A_ST
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),0xfb
	ld	a,(AI)
	ld	hl,SHOT_ST
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),0xfe
	ld	d,2
	ld	hl,0x0f04
	ld	e,0x40
	call	plat_sfx
	ld	a,1
	ld	l,0x30
	call	p_add_score
	jp	.edge
.sn:	ld	a,(AI)
	ld	hl,SHOT_ST
	add	a,l
	ld	l,a
	jp	.sc1
.edge:	ld	a,(AXX)
	cp	3
	jp	c,.kill
	cp	0x76
	jp	nc,.kill
	ld	a,(CAM_OFF)
	ld	c,a
	ld	a,(AYY)
	add	a,c
	cp	0xd9
	jp	c,.nx
.kill:	ld	a,(AA)
	ld	hl,A_ST
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),0xff
.nx:	ld	a,(AA)
	dec	a
	ld	(AA),a
	jp	p,.lp
	ret

; upd_air: слоты 0..4 в состоянии 1 — поведение по виду, стрельба, въезд сверху или полёт, вывод;
; взрыв (FBh..FEh) — кадр. Буфер фона — по экрану, обратному переднему
p_upd_air:
	xor	a
	ld	(AA),a
.lp:	ld	a,(AA)		; пустой слот (не 1 и не FBh..FEh) — сразу к следующему: AKB/ABUF ему не нужны
	ld	hl,A_ST
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	cp	1
	jp	z,.on
	cp	0xfb
	jp	c,.nx
	cp	0xff
	jp	z,.nx
.on:	ld	a,(AA)
	add	a,a
	ld	c,a
	ld	a,(BUF_BACK)
	add	a,c
	ld	(AKB),a
	ld	a,(BUF_FRONT)
	add	a,c
	ld	(AKF),a
	ld	a,(BUF_FRONT)
	xor	1
	add	a,c
	ld	hl,T_0177
	call	word_hl_a
	ex	de,hl
	ld	(ABUF),hl
	ld	a,(AA)
	ld	hl,A_ST
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	cp	1
	jp	nz,.boom
	ld	a,(KIND)
	ld	(AKIND),a
	ld	a,(AKF)
	ld	hl,A_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	(AYF),a
	ld	a,1
	ld	(ARF),a
	ld	a,(AKIND)
	or	a
	jp	z,.k0
	cp	1
	jp	z,.k1
	cp	2
	jp	z,.k2
	cp	3
	jp	z,.k3
	jp	.fire
.k0:	ld	a,(BUF_FRONT)		; вид 0: разворот над игроком
	ld	hl,PL_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	c,a
	call	a_xf
	cp	c
	jp	nz,.fire
	ld	a,(AA)
	ld	hl,A_DIR
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	cpl
	inc	a
	ld	(hl),a
	jp	.fire
.k1:	call	a_xf			; вид 1: на середине — разгон вдвое и обратно, анимация
	cp	0x40
	jp	nz,.k1b
	ld	a,(AA)
	ld	hl,A_DIR
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	cpl
	inc	a
	add	a,a
	ld	(hl),a
.k1b:	ld	a,(AA)
	ld	hl,A_DIR
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	cp	2
	jp	z,.k1c
	cp	0xfe
	jp	nz,.fire
.k1c:	ld	a,(AA)
	ld	hl,A_T
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	inc	(hl)
	rrca
	and	3
	ld	c,a		; v: спрайт 8280h + 100h·(v>>1) + 80h·(v&1)
	rrca
	and	1
	ld	b,a
	ld	a,c
	and	1
	ld	e,0x80
	jp	z,.k1d
	ld	e,0
.k1d:	add	a,b
	add	a,0x82
	ld	d,a
	call	a_spr_de
	jp	.fire
.k2:	ld	a,(AA)			; вид 2: анимация; через 64 шага — вверх и в сторону игрока
	ld	hl,A_T
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	inc	(hl)
	rrca
	and	3
	add	a,0x8a
	ld	d,a
	ld	e,0
	call	a_spr_de
	ld	a,(AA)
	ld	hl,A_T
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	cp	0x40
	jp	nz,.fire
	ld	a,(AA)
	ld	hl,A_SPD
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),0xfe
	ld	a,(BUF_FRONT)
	ld	hl,PL_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	c,a
	call	a_xf
	ld	b,a
	ld	a,c
	cp	b
	ld	c,1
	jp	nc,.k2d
	ld	c,0xff
.k2d:	ld	a,(AA)
	ld	hl,A_DIR
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),c
	jp	.fire
.k3:	xor	a			; вид 3: стоп на Y экрана 70h, раскрытие, выстрел, уход вверх
	ld	(ARF),a
	ld	a,(CAM_OFF)
	ld	c,a
	ld	a,(AYF)
	add	a,c
	cp	0x70
	jp	nz,.k3t
	ld	a,(AA)
	ld	hl,A_T
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	or	a
	jp	nz,.k3t
	ld	(hl),1
	ld	a,(AA)
	ld	hl,A_SPD
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),0
	ld	a,(AA)
	ld	hl,A_DIR
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),0
	call	a_xf
	and	0xfe
	ld	(hl),a
	ld	de,0x9300
	call	a_spr_de
.k3t:	ld	a,(AA)
	ld	hl,A_T
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	or	a
	jp	z,.fire
	inc	a
	ld	(hl),a
	cp	8
	jp	nz,.fire
	ld	a,(AA)
	ld	hl,A_SPD
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),0xfc
	ld	de,0x9380
	call	a_spr_de
	call	a_xf
	ld	c,a
	ld	a,(AYF)
	ld	l,a
	ld	a,c
	call	p_ground_fire
.fire:	ld	a,(ARF)
	or	a
	jp	z,.mv
	ld	a,0xff
	call	p_rnd
	cp	3
	jp	nz,.mv
	call	a_xf
	ld	c,a
	ld	a,(AYF)
	ld	l,a
	ld	a,c
	call	p_ground_fire
.mv:	ld	a,(AA)
	ld	hl,A_DIR
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	c,a
	call	a_xf
	add	a,c
	ld	c,a		; X
	ld	a,(AKB)
	ld	hl,A_X
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	(hl),c
	ld	a,(AA)
	ld	hl,A_IN
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	or	a
	jp	z,.fly
	dec	(hl)			; въезд: 1 точка за шаг, фон — заново
	ld	a,(AYF)
	dec	a
	ld	b,a
	ld	a,(AKB)
	ld	hl,A_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	(hl),b
	ld	hl,(ABUF)
	push	hl
	ld	l,b
	ld	a,c
	call	plat_put_tile16
	jp	.boom
.fly:	ld	a,(AA)
	ld	hl,A_SPD
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	b,a
	ld	a,(SLOW)
	add	a,b
	ld	b,a
	ld	a,(AKIND)
	cp	1
	jp	nz,.fy
	ld	a,b			; вид 1: нечётный шаг — номер переднего экрана, иначе половина
	rrca
	jp	nc,.sar
	ld	a,(BUF_FRONT)
	ld	b,a
	jp	.fy
.sar:	ld	a,b
	rlca
	ld	a,b
	rra
	ld	b,a
.fy:	ld	a,(AYF)
	add	a,b
	ld	b,a		; Y
	ld	a,(AKB)
	ld	hl,A_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	(hl),b
	ld	hl,(ABUF)
	push	hl
	ld	a,(AA)
	ld	hl,A_SPR
	call	word_hl_a
	push	de
	ld	l,b
	ld	a,c
	call	plat_draw_sprite
.boom:	ld	a,(AA)
	ld	hl,A_ST
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	cp	0xfb		; живой (1) и пустой — без взрыва
	jp	c,.nx
	ld	hl,0x8480
	jp	z,.bd
	ld	hl,0x8500
	cp	0xfc
	jp	z,.bd
	ld	hl,0x8880
	cp	0xfd
	jp	z,.bd
	ld	hl,0x9a80
	cp	0xfe
	jp	nz,.nx
.bd:	ex	de,hl
	ld	hl,(ABUF)
	push	hl
	push	de
	ld	a,(AKB)
	ld	hl,A_Y
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	e,a
	ld	a,(AKB)
	ld	hl,A_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	and	0xfe
	ld	l,e
	call	plat_draw_sprite
.nx:	ld	a,(AA)
	inc	a
	ld	(AA),a
	cp	5
	jp	c,.lp
	ret
