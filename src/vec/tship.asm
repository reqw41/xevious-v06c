; Корабль игрока и прицел: свой фон (вне POOL/DLIST), стирание старого сразу перед выводом нового — на своём
; месте очереди (OP_TPRV), а не стирание в начале flush и вывод в его середине или конце.
; Условие (t_scan): ни одна запись очереди ДО него (под ним: у корабля — тайлы и наземные цели, у прицела —
; все) не задевает его с запасом на сдвиг |dX| <= 2, |dY| <= 5; нет тайлов/отметок в очереди, надписей на поле
; и базы Андор. Записи после него (бомба, выстрелы, пули — над ним) стираются раньше и рисуются позже, как
; в обычном выводе. Не выполнено (или сдвиг больше запаса) — прошлая своя запись стирается в конце стирания
; (t_e2: она не задевала то, что под ней), новый — обычным спрайтом или своим выводом без пары.
OP_TPRV	equ	5		; 5 — прицел, 6 — корабль
T_DLY	equ	85		; t_scan в flush_hud — вместо стольких проходов задержки луча (по 24 такта)
TB_SZ	equ	4 + 2*3*16		; запись: заголовок + 3 столбца × 16 строк × 2 плоскости
	assert	(T_IMG_SHIP ^ T_IMG_SIGHT) & 0xff, "T: младшие байты картинок совпадают"
; состояние: +0 есть своя запись, +1 буфер, +5 стереть в t_e2, +6 запись очереди
s_st:	db	0
	dw	TB_S
	db	0, 0, 0
	dw	0
p_st:	db	0
	dw	TB_P
	db	0, 0, 0
	dw	0
t_xo:	db	0		; X, Y прицела в прошлом обновлении
t_yo:	db	0
t_ns:	db	0		; в очереди есть не-спрайты (тайлы, отметки, фон)

; flush_hud (вместо части задержки луча): очередь этого обновления готова
t_scan:
	ld	a,(t_ns)
	ld	hl,ANDOR_SAVED
	or	(hl)
	jp	nz,t_prep
	ld	hl,(msg_new+2)		; надписи на поле (как static_prepare)
	ld	a,h
	ld	hl,(msg_new+6)
	or	h
	ld	hl,(msg_old+2)
	or	h
	ld	hl,(msg_old+6)
	or	h
	jp	nz,t_prep
	ld	hl,(qptr)
	ld	a,l
	cp	QUEUE & 0xff
	jp	z,t_prep
	ld	de,-5
	add	hl,de			; последняя запись — прицел?
	ld	a,(hl)
	cp	OP_SPR
	jp	nz,t_prep
	ld	(s_st+6),hl
	ld	a,l
	inc	a
	ld	(.end+1),a		; конец — запись прицела (её X всегда в окне: проверка только там)
	inc	hl
	ld	c,(hl)			; X
	inc	hl
	ld	b,(hl)			; Y
	inc	hl
	ld	a,(hl)
	cp	T_IMG_SIGHT & 0xff
	jp	nz,t_prep
	inc	hl
	ld	a,(hl)
	cp	T_IMG_SIGHT >> 8
	jp	nz,t_prep
	; другой спрайт занимает X..X+19 (столбцы (X>>2)..(X>>2)+4), строки Y..Y+21; прицел — 14 строк с dy=1,
	; корабль — 16 строк, Y корабля = Y прицела + 40h, тот же X; запас — сдвиг t_prep1
	ld	hl,t_xo			; сдвиг с прошлого обновления (у корабля тот же: его X, Y — от прицела)
	ld	a,(hl)
	ld	(hl),c
	sub	c
	add	a,2
	cp	5			; |dX| <= 2
	inc	hl
	ld	a,(hl)
	ld	(hl),b
	ld	e,4			; бит 2 — сдвиг больше запаса
	jp	nc,.far
	sub	b
	add	a,5
	cp	11			; |dY| <= 5
	jp	nc,.far
	ld	e,0
.far:	ld	a,e
	ld	(.done+1),a
	ld	a,c
	sub	21
	ld	(.x+1),a
	ld	(.x2+1),a
	ld	a,b
	sub	25
	ld	(.ys+1),a
	ld	a,b
	add	a,0x40-26
	ld	(.yp+1),a
	ld	a,47
	ld	(.yp+3),a
	ld	c,1			; C: бит 0 — прицел цел, бит 1 — корабль найден, бит 6 — корабль задет
	ld	hl,QUEUE+1
	ld	de,5
.l:	ld	a,(hl)
.x:	sub	0
	cp	35
	jp	c,.hx
	add	hl,de
	ld	a,(hl)
.x2:	sub	0
	cp	35
	jp	c,.hx
.n:	add	hl,de
	jp	.l
.hx:	ld	a,l
.end:	cp	0
	jp	z,.done
	inc	hl
	ld	a,(hl)
	dec	hl
	ld	b,a
.ys:	sub	0
	cp	45
	jp	nc,.y2
	ld	a,c			; под прицелом
	and	0xfe
	ld	c,a
.y2:	ld	a,b
.yp:	sub	0
	cp	47			; после корабля — 0: дальше над ним
	jp	nc,.n
	inc	hl			; в окне корабля только сам корабль может быть его картинкой
	inc	hl
	ld	a,(hl)
	cp	T_IMG_SHIP & 0xff
	jp	nz,.hit2
	inc	hl
	ld	a,(hl)
	cp	T_IMG_SHIP >> 8
	jp	nz,.hit3
	ld	a,c
	or	2
	ld	c,a
	xor	a
	ld	(.yp+3),a
	dec	hl
	dec	hl
	dec	hl
	dec	hl
	ld	(p_st+6),hl
	inc	hl
	jp	.n
.hit3:	dec	hl
.hit2:	dec	hl
	dec	hl
.hit:	ld	a,c			; под кораблём
	or	0x40
	ld	c,a
	jp	.n
.done:	ld	a,0			; бит 2 — большой сдвиг
	or	c
	cp	0x40
	jp	c,t_prep2
	and	5
	jp	t_prep2

; начало flush (аварийного — сразу): записи очереди — OP_TPRV, что стереть в t_e2.
; A: бит 0 — прицел, 1 — корабль изолирован, 2 — сдвиг больше запаса (своя прошлая — в t_e2)
t_prep:	ld	a,4
t_prep2:
	ld	c,a
	ld	a,(s_st)
	ld	b,a
	ld	a,c
	rrca
	jp	nc,.sn
	ld	hl,(s_st+6)
	ld	(hl),OP_TPRV
	and	2
	jp	nz,.sn
	ld	b,a
.sn:	ld	a,b
	ld	(s_st+5),a
	ld	a,(p_st)
	ld	b,a
	ld	a,c
	rrca
	rrca
	jp	nc,.pn
	ld	hl,(p_st+6)
	ld	(hl),OP_TPRV+1
	and	1
	jp	nz,.pn
	ld	b,a
.pn:	ld	a,b
	ld	(p_st+5),a
	ret

; конец стирания (flush.e2): свои прошлые записи, которые не стираются перед выводом нового
t_e2:	ld	hl,s_st+5
	call	.one
	ld	hl,p_st+5
.one:	ld	a,(hl)
	or	a
	ret	z
	ld	(hl),0
	ld	de,-5
	add	hl,de
; HL — состояние: стереть свою запись
t_erase:
	ld	a,(hl)
	or	a
	ret	z
	ld	(hl),0
	inc	hl
	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	jp	erase_rec

; OP_TPRV (прицел) / OP_TPRV+1 (корабль) в flush: HL — картинка, A — 2 / 3 (режим draw_img)
t_draw:	push	af
	call	draw_img		; -> t_sv
	pop	bc
	ld	a,(draw_img.md+1)	; t_sv не было — вся вне поля: только стереть
	or	a
	ret	z
	ld	hl,s_st
	dec	b
	dec	b
	jp	z,t_erase
	ld	hl,p_st
	jp	t_erase

; draw_img с A=2 (прицел) / 3 (корабль) вместо сохранения фона в POOL: DE — данные первого столбца, HL — входы UNR_ENT по высоте.
; Старая своя запись стирается, новый выводится обычным циклом draw_img с фоном в свой буфер.
t_sv:	ld	c,(hl)
	inc	hl
	ld	b,(hl)
	inc	hl
	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	ld	(draw_img.ce+1),hl
	ld	h,b
	ld	l,c
	ld	(draw_img.cc+1),hl
	push	de
	ld	hl,s_st
	ld	a,(draw_img.md+1)
	cp	2
	jp	z,$+6
	ld	hl,p_st
	ld	a,(hl)
	ld	(hl),1
	inc	hl
	ld	e,(hl)
	inc	hl
	ld	d,(hl)
	push	de
	or	a
	ex	de,hl
	call	nz,erase_rec
	pop	hl
	ld	a,(di_col)
	ld	(hl),a
	inc	hl
	ld	a,(di_row)
	ld	(hl),a
	inc	hl
	ld	a,(di_nbv)
	ld	(hl),a
	inc	hl
	ld	a,(di_h)
	ld	(hl),a
	inc	hl
	ld	b,h
	ld	c,l
	xor	a
	ld	(draw_img.md+1),a	; конец draw_img: без pool_ptr; t_draw: вывод был
	pop	de
	jp	draw_img.go
