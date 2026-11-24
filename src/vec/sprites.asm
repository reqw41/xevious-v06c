; Спрайты на одном экране. Вызовы вывода из логики не рисуют, а копят очередь (QUEUE: код, X, Y, указатель).
; В начале следующего обновления (plat_wait_vsync, сразу после прерывания) — flush:
;   1) стереть нарисованное в прошлый раз (в обратном порядке, сохранённым фоном);
;   2) дорисовать строку камера + 8; 3) правки фона из очереди (тайлы, картинки целей);
;   4) спрайты из очереди — с сохранением фона (POOL, указатели — DLIST).
; Панель при обычном сдвиге переносится перед стиранием (flush_hud), полоса чистится после вывода.
; Стирания летающих объектов из логики (restore_*, put_tile16) — пустые: стирает платформа.
; Картинки — build/gen/vec_sprites.inc (tools/vecsprites.js).
QMAX	equ	44
	assert	1 - (((255 - QMAX) >> 15) & 1), "очередь: QMAX должен быть меньше 256"
DMAX	equ	32		; занято не больше 17 (замер)
OP_SPR	equ	1		; спрайт: сохранить фон, вывести
OP_TILE	equ	2		; тайл в фон
OP_GND	equ	3		; картинка в фон (без сохранения)

; в очередь: A = код, (qx), (qy), HL = указатель; очередь полна — flush
q_push:	ex	de,hl
	ld	hl,(qptr)
	ld	(hl),a
	inc	hl
	ld	a,(qx)
	ld	(hl),a
	inc	hl
	ld	a,(qy)
	ld	(hl),a
	inc	hl
	ld	(hl),e
	inc	hl
	ld	(hl),d
	inc	hl
	ld	(qptr),hl
	; Шаг записи 5 взаимно прост с 256: до QMAX < 256 младшие байты уникальны.
	ld	a,l
	cp	QUEUE_END & 0xff
	ret	nz
	call	static_prepare	; аварийный flush полной очереди идёт без wait_vsync
	call	t_prep		; t_iso не готов: свои записи корабля/прицела — стереть в t_e2
	jp	flush

; A = X, L = Y — в (qx), (qy)
q_xy:	ld	(qx),a
	ld	a,l
	ld	(qy),a
	ret

; HL = таблица слов, A = номер: HL = слово, Z — ноль
; HL = таблица номеров (байт: номер картинки + 1, 0 — нет), A = индекс: HL = картинка, Z — нет
q_tabb:	add	a,l
	ld	l,a
	jp	nc,$+4
	inc	h
	ld	a,(hl)
	or	a
	ret	z
	add	a,a
	ld	hl,IMG_TAB-2
	add	a,l
	ld	l,a
	jp	nc,$+4
	inc	h
	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	or	h
	ret

q_tab:	add	a,a
	add	a,l
	ld	l,a
	jp	nc,.n
	inc	h
.n:	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	or	h
	ret

; ---- входы платформы ----------------------------------------------------------------------------------
; draw_sprite: A = X, L = Y; стек: картинка (8000h..9FFFh), буфер — снимает 2 слова
plat_draw_sprite:
	call	q_xy
	pop	hl
	pop	de
	pop	bc
	push	hl
	ld	a,d
	sub	0x80
	cp	0x20
	ret	nc
	ld	h,a
	ld	a,e
	rla
	ld	a,h
	rla
	add	a,a
	ld	b,a
	ld	a,(qx)
	and	1
	or	b
	ld	hl,SPR_IDX
	call	q_tabb
	ret	z
	ld	a,OP_SPR
	jp	q_push

; draw_glyph: A = X, L = Y; стек: картинка (9800h..9D80h), буфер
plat_draw_glyph:
	call	q_xy
	pop	hl
	pop	de
	pop	bc
	push	hl
	ld	a,d
	sub	0x98
	cp	6
	ret	nc
	ld	h,a		; ((s0 − 9800h) >> 5)·2 + чётность: (h·8 + e>>5)·2
	ld	a,e
	rlca
	rlca
	rlca
	and	7
	ld	b,a
	ld	a,h
	add	a,a
	add	a,a
	add	a,a
	or	b
	add	a,a
	ld	b,a
	ld	a,(qx)
	and	1
	or	b
	cp	90
	ret	nc
	ld	hl,GLY_IDX
	call	q_tabb
	ret	z
	ld	a,OP_SPR
	jp	q_push

; draw_z23c: A = X, L = Y; стек: буфер, картинка (ABx0h..AEx0h, BAx0h)
plat_draw_z23c:
	call	q_xy
	pop	hl
	pop	bc
	pop	de
	push	hl
	ld	a,d
	sub	0xab
	and	0x0f
	add	a,a
	ld	b,a
	ld	a,e
	rlca
	rlca
	and	1
	or	b
	add	a,a
	ld	b,a
	ld	a,(qx)
	and	1
	or	b
	ld	hl,Z23C_IDX
	call	q_tabb
	ret	z
	ld	a,OP_SPR
	jp	q_push

; одна картинка на процедуру: A = X, L = Y; стек: буфер. HL = FIX_<имя>
fix_spr:
	ld	a,(qx)
	and	1
	call	q_tab
	ret	z
	ld	a,OP_SPR
	jp	q_push
plat_draw_shot:
	ld	de,FIX_draw_shot
	jp	fix_common
plat_draw_bullet:
	ld	de,FIX_draw_bullet
	jp	fix_common
plat_draw_bomb:
	ld	de,FIX_draw_bomb
	jp	fix_common
plat_draw_spark:
	ld	de,FIX_draw_spark
	jp	fix_common
plat_draw_z23a:
	ld	de,FIX_draw_z23a
	jp	fix_common
plat_draw_z23b:
	ld	de,FIX_draw_z23b
	jp	fix_common
plat_draw_z48:
	ld	de,FIX_draw_z48
fix_common:
	call	q_xy
	pop	hl
	pop	bc
	push	hl
	ex	de,hl
	jp	fix_spr

; draw_ground: картинка (8700h/8780h/9A00h) в фон: A = X, L = Y; стек: картинка
plat_draw_ground:
	call	q_xy
	pop	hl
	pop	de
	push	hl
	ld	a,(qx)
	and	1
	ld	c,a
	ld	hl,GND_LIST		; записи: dw картинка; db чётность; dw IMG
.l:	ld	a,(hl)
	inc	hl
	or	(hl)
	dec	hl
	ret	z
	ld	a,(hl)
	cp	e
	jp	nz,.n4
	inc	hl
	ld	a,(hl)
	cp	d
	jp	nz,.n3
	inc	hl
	ld	a,(hl)
	cp	c
	jp	nz,.n2
	inc	hl
	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	or	h
	ret	z
	ld	a,OP_GND
	ld	(t_ns),a
	jp	q_push
.n4:	inc	hl
.n3:	inc	hl
.n2:	inc	hl
	inc	hl
	inc	hl
	jp	.l

; тайл в фон: draw_tile16, restore_16 с картинкой тайла (C000h+); с буфером (ниже) — стирание, пустое
plat_draw_tile16:
plat_restore_16:
	call	q_xy
	pop	hl
	pop	de
	push	hl
	ld	a,d
	cp	0xc0
	ret	c
	ex	de,hl
	ld	a,OP_TILE
	ld	(t_ns),a
	jp	q_push

; ---- исполнение очереди --------------------------------------------------------------------------------
; Обычный вход после scroll_upd и шага звука: панель до стирания спрайтов.
; При +1 старые спрайты заходят лишь на y=224, до HUD_Y=236 не доходят.
; При скачке (band_n=32) панель рисуется после очистки всей полосы в конце flush.
; Аварийный q_push входит сразу в flush, без раннего переноса панели.
flush_hud:
	ld	a,(band_n)
	cp	32
	call	nz,hud_draw
	call	t_scan		; корабль и прицел (src/vec/tship.asm): ~2k тактов — в счёт задержки ниже
	ld	a,(su_now)	; ждали кадр — луч наверху поля: стирание позже (~5,8k тактов), чтобы не догонять луч;
	or	a		; опоздали — без задержки (темп не теряется)
	jp	z,.go
	ld	b,240-T_DLY
.dly:	dec	b
	jp	nz,.dly
.go:
; static_prepare заменяет первый LXI на CALL static_check только для готового кандидата.
flush:	ld	hl,msg_old		; 0) место подмены static_prepare (LXI -> CALL static_check)
	ld	hl,(dl_ptr)		; 1) стереть прошлое (DLIST с конца)
.e1:	ld	a,l
.bound:	cp	DLIST & 0xff
	jp	z,.e2
	dec	hl
	ld	d,(hl)
	dec	hl
	ld	e,(hl)
	push	hl
	ex	de,hl
	call	erase_rec
	pop	hl
	jp	.e1
.e2:	push	hl			; граница DLIST — для andor_flush (он же ставит dl_ptr)
	call	t_e2			; свои записи корабля/прицела, не выводимые парой
	call	msg_restore		; надписи — под спрайтами: фон старой вернуть и сразу вывести новую
	pop	hl
	call	andor_flush
	call	msg_flip
	ld	a,(clip_base)	; обрезка по полю для draw_img: y0 = Y − камера − 16 (0..223); 17 — опоздавшая строка
	ld	c,a		; в LB. clip_base в flush не меняется (lb_out его не снимает)
	ld	a,240
	sub	c
	ld	(draw_img.lim+1),a
	ld	(draw_img.lim2+1),a
	inc	a
	ld	(draw_img.lim1+1),a
	ld	a,(CAM_Y)
	add	a,c
	ld	(draw_img.cam+1),a
.reset:	ld	hl,POOL		; при удержании — LHLD (DLIST+2), конец первой записи
	ld	(pool_ptr),hl
	; Обработчики очереди не добавляют записей. Как в q_push, младшие байты
	; границ уникальны при QMAX < 256 и шаге 5; конец фиксируем один раз.
	ld	a,(qptr)
	ld	(.end+1),a
.start:	ld	hl,QUEUE		; при удержании — QUEUE+5
.q:	ld	a,l
.end:	cp	0
	jp	z,.done
	ld	b,(hl)
	inc	hl
	ld	a,(hl)
	inc	hl
	ld	(qx),a
	ld	a,(hl)
	inc	hl
	ld	(qy),a
	ld	e,(hl)
	inc	hl
	ld	d,(hl)
	inc	hl
	push	hl
	ld	a,b
	cp	OP_TILE		; тайлы при восстановлении жизни — прежний быстрый путь
	jp	nz,.ng
	ld	a,(qx)
	ld	(vt_x),a
	ld	a,(qy)
	ld	(vt_y),a
	call	tile_pic
	jp	.nx
.ng:	ex	de,hl
	dec	a		; SPR — не проходить MARK/GND
	jp	z,.spr
	cp	OP_MARK-1
	jp	nz,.nm
	call	mark_draw
	jp	.nx
.nm:	cp	OP_GND-1
	jp	nz,.nt
	xor	a		; OP_GND
	jp	.dr
.nt:	sub	OP_TPRV-1-2	; OP_TPRV (+1): корабль/прицел — свой вывод (src/vec/tship.asm), A = 2/3
	call	t_draw
	jp	.nx
.spr:	inc	a		; после DEC кода OP_SPR A=0
.dr:	call	draw_img
.nx:	pop	hl
	jp	.q
.done:	xor	a
	ld	(t_ns),a
	call	band_clear		; все спрайты уже обрезаны по полю
	call	hud_draw		; после большого скачка панель рисуется заново
	ld	hl,QUEUE
	ld	(qptr),hl
	ret

; стереть запись POOL (HL): столбец (старший байт адреса C), строка, байтов в строке, строк; затем по столбцам:
; h байтов C, h байтов E
erase_rec:
	ld	b,(hl)		; столбец
	inc	hl
	ld	a,(hl)
	inc	hl
	ld	(.r1+1),a
	ld	(.r2+1),a
	ld	c,(hl)		; число столбцов; UNR_ER сохраняет BC
	inc	hl
	ld	a,16		; вход в развёрнутый цикл: UNR_ER + (16 − h)·4
	sub	(hl)
	inc	hl
	ex	de,hl		; DE — сохранённое
	add	a,a
	add	a,a
	add	a,UNR_ER & 0xff
	ld	l,a
	ld	a,0
	adc	a,UNR_ER >> 8
	ld	h,a
	ld	(.c1+1),hl
	ld	(.c2+1),hl
	ld	h,b		; H — столбец (UNR_ER меняет только L, DE)
	ld	b,c
.col:
.r1:	ld	l,0
.c1:	call	0
	ld	a,h
	add	a,0x20
	ld	h,a
.r2:	ld	l,0
.c2:	call	0
	ld	a,h
	sub	0x1f
	ld	h,a
	dec	b
	jp	nz,.col
	ret

; вывести картинку HL (IMG_n) в (qx), (qy); A = 1 — сохранить фон (запись в POOL + DLIST), 0 — в фон
draw_img:
	ld	(.md+1),a
	ld	a,(qy)
	add	a,(hl)		; Y + dy
	inc	hl
	ld	e,a		; до выбора варианта DE свободны: E = Y, D = полная высота
	ld	b,(hl)		; h
	ld	d,b
	inc	hl
.cam:	ld	c,0		; камера + clip_base и пределы .lim* — один раз в flush (перед очередью)
	ld	a,e
	sub	c
.lim:	cp	224
	jp	c,.inf
	cpl			; верх выше поля: пропустить k = −y0 строк
	inc	a
	cp	b
	ret	nc		; вся выше поля (или в полосе)
	ld	(di_k),a
	ld	c,a
	ld	a,b
	sub	c
	ld	b,a
	ld	a,e
	add	a,c
	ld	e,a
	jp	.hk
.inf:	ld	c,a		; низ ниже поля: h = 224 − y0
	add	a,b
.lim1:	cp	225
	jp	c,.k0
.lim2:	ld	a,224
	sub	c
	ld	b,a
.k0:	xor	a
	ld	(di_k),a
.hk:	ld	a,d		; пропуск в конце столбца: 3·(h − h')
	sub	b
	ld	c,a
	add	a,a
	add	a,c
	ld	(.sk+1),a
	ld	a,e
	cpl
	ld	(.rc+1),a
	ld	(.re+1),a
	ld	(di_row),a
	ld	a,b
	ld	(di_h),a
	add	a,a
	add	a,a
	ld	c,a		; 4h — вход в UNR_ENT
	ld	a,(qx)
	ld	b,a
	and	2
	jp	z,.v0
	inc	hl
	inc	hl
.v0:	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a		; HL — вариант: столбец, nb, данные
	ld	a,b
	rrca
	rrca
	and	0x3f
	add	a,(hl)
	inc	hl
	dec	a		; точка 2·(X & FEh) + dx (как у CPC): столбец X/4 + cofs − 1
	cp	32
	ret	nc
	ld	b,a
	add	a,SCR_C
	ld	(di_col),a
	ld	a,32		; видимых столбцов: min(nb, 32 − столбец)
	sub	b
	cp	(hl)
	jp	c,.cl
	ld	a,(hl)
.cl:	inc	hl
	ld	(di_nbv),a
	add	a,b		; конец столбцов — адрес C следующего за последним (совет 16 №1, clip-count)
	add	a,SCR_C
	ld	(.cnt+1),a
	ld	a,(di_k)	; DE — данные первого столбца (+3k при обрезке сверху)
	ld	b,a
	add	a,a
	add	a,b
	add	a,l
	ld	e,a
	ld	a,0
	adc	a,h
	ld	d,a
	ld	hl,UNR_ENT
	ld	b,0
	add	hl,bc
.md:	ld	a,0
	or	a
	jp	z,.bg
	dec	a
	jp	nz,t_sv			; 2 — корабль/прицел: свой фон (src/vec/tship.asm)
	; Входы уже найдены по высоте: сохранить их до использования HL под DLIST/POOL.
	; BC свободен до выделения фона: два адреса циклов загружаются словами.
	; Единственный прежний вызов .ent встроен (нет CALL/RET и четырёх STA).
	ld	c,(hl)
	inc	hl
	ld	b,(hl)
	inc	hl
	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	ld	(.ce+1),hl
	ld	h,b
	ld	l,c
	ld	(.cc+1),hl
.sv:	ld	hl,(dl_ptr)		; место в DLIST и POOL?
	ld	a,l
	cp	DLIST_END & 0xff
	ret	z
	push	de
	ex	de,hl
	ld	hl,(pool_ptr)
	ld	a,l
	sub	(POOL_END - 4 - 2*4*16) & 0xff
	ld	a,h
	sbc	a,(POOL_END - 4 - 2*4*16) >> 8
	jp	nc,.full
	ex	de,hl		; DLIST += указатель POOL
	ld	(hl),e
	inc	hl
	ld	(hl),d
	inc	hl
	ld	(dl_ptr),hl
	ex	de,hl		; запись: столбец, строка, столбцов, строк
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
	ld	c,l		; BC — куда сохранять
	pop	de
.go:	ld	a,(di_col)
	ex	de,hl		; HL — данные
	ld	d,a
.col:	push	hl
.rc:	ld	e,0		; плоскость C; после неё HL — данные следующего столбца (3h байт)
.cc:	call	0
	ex	(sp),hl
	ld	a,d		; плоскость E
	add	a,0x20
	ld	d,a
.re:	ld	e,0
.ce:	call	0
	pop	hl
.sk:	ld	a,0		; обрезанные строки столбца
	add	a,l
	ld	l,a
	jp	nc,$+4
	inc	h
	ld	a,d
	sub	0x1f
	ld	d,a
.cnt:	cp	0
	jp	nz,.col
	ld	a,(.md+1)
	or	a
	ret	z
	ld	h,b
	ld	l,c
	ld	(pool_ptr),hl
	ret
.full:	pop	de
	ret
.bg:	ld	hl,UNR_GC
	ld	(.cc+1),hl
	ld	hl,UNR_GE
	ld	(.ce+1),hl
	jp	.go
qptr:		dw	QUEUE
qx:		db	0
qy:		db	0
dl_ptr:		dw	DLIST
pool_ptr:	dw	POOL
di_row:		db	0
di_h:		db	0
di_k:		db	0
di_col:		db	0
di_nbv:		db	0
