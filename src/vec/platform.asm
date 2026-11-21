; Платформа Вектора: запуск, прерывание, вывод. Что не сделано — заглушки (build/gen/plat_vec_stub.inc,
; снимают свои аргументы со стека). Экран: Y мира -> строка памяти 255 − Y (круговой буфер, как у CPC);
; порт 03 = EFh − камера: верх экрана — Y = камера + 16, строка камера + 8 дорисовывается заранее.
; X логики — в полуточках CPC (2 точки): точка = 2X, как на CPC; столбец байта = X/4 (поле 240 точек — столбцы 1..30).
SCR_C	equ	0xc0
VFRAMES_PER_UPD equ 2		; обновление раз в 2 кадра, как на CPC

start:	di
	ld	sp,STACK_TOP
	ld	a,0xc3
	ld	(0x38),a
	ld	hl,isr
	ld	(0x39),hl
	ld	a,0x88
	out	(0),a
	xor	a
	out	(2),a
	ld	a,0x83			; джойстик «П» (ППА2), как в остальных портах
	out	(4),a
	ld	a,0x9f
	out	(5),a
	in	a,(6)
	ld	(joy0),a
	ei			; самоизменяемые операнды уже в образе (tools/vecbuild.js)
	call	tload_show	; загрузочный экран (в конце экрана — до его очистки)
	call	scr_clear
	call	title_show	; стартовый экран (src/vec/title.asm), до огня
	ld	a,1
	ld	(pal_req),a
	call	p_restart_life
	ld	a,1
	ld	(dnl_on),a		; строку карты дорисовывать — только когда игра уже идёт
	call	set_vscroll
	ld	(vs_cur),a
	ld	hl,(MAP_ROW_X)
	ld	(dnl_last),hl
	ld	de,0x40
	add	hl,de
	ld	(dnl_prev),hl
main:	call	p_main_loop
	ld	hl,(vupd)
	inc	hl
	ld	(vupd),hl
	jp	main

set_vscroll:
	ld	a,(CAM_Y)
	ld	b,a
	ld	a,0xef
	sub	b
	ld	(vscroll),a
	ret

; ---- прерывание: прокрутка (порт 03 — первым), палитра по запросу, счётчики, таймер звука ----------------
isr:	push	af
	push	bc
	push	de
	push	hl
	ld	a,(lb_pend)		; опоздавшее обновление оставило верхнюю строку в LB: новая прокрутка — сейчас
	or	a
	jp	z,.v
	ld	a,(lb_vs)
	ld	(vscroll),a
.v:	ld	a,(vscroll)
	out	(3),a
	ld	a,(lb_pend)
	or	a
	call	nz,lb_out		; строка — до строки 40 растра
	ld	hl,vframes		; опрос ввода (порт 03) — только в кадре, после которого вывод не начинается:
	ld	a,(hl)			; прерывание вывода короче, верхняя строка поля успевает к строке 40 растра
	inc	a
	cp	VFRAMES_PER_UPD
	call	c,isr_input
	ld	a,(pal_req)
	or	a
	jp	z,.np
	xor	a
	ld	(pal_req),a
	call	set_palette
.np:	ld	hl,0x3d3d		; счётчик кадров игры (этап 2 CPC)
	inc	(hl)
	ld	hl,vframes
	inc	(hl)
	ld	a,(paused)		; пауза, титул — звук стоит
	or	a
	jp	nz,.ns
	ld	a,(vwait)		; основной код ждёт этого прерывания, чтобы рисовать верхнюю строку:
	or	a			; шаг звука сделает он сам после неё (snd_due), прерывание — короче
	jp	z,.snd
	ld	a,(hl)
	cp	VFRAMES_PER_UPD
	jp	c,.snd
	ld	(snd_due),a
	jp	.ns
.snd:	call	isr_sound
.ns:	pop	hl
	pop	de
	pop	bc
	pop	af
	ei
	ret

; этап 4 CPC без звука: режим 3D3Ah (0 — тишина, FFh — эффекты), таймер 3D3Bh: истёк — режим −1
isr_sound:
	call	.tm
	jp	snd_frame	; шаг звука (src/vec/sound.asm)
.tm:	ld	a,(SND_MODE)
	or	a
	ret	z
	cp	0xff
	ret	z
	ld	hl,(SND_TIMER)
	ld	a,h
	or	l
	ret	z
	dec	hl
	ld	(SND_TIMER),hl
	ld	a,h
	or	l
	ret	nz
	ld	hl,SND_MODE
	dec	(hl)
	jp	snd_game	; как CPC: всё стоп, фоновая петля

; ввод, как в Uridium: клавиатура (стрелки — движение, пробел — огонь, M — бомба, ВК — пауза, АР2 в паузе — титул) и джойстик «П» (ППА2, порт 06h:
; б0 вправо, б1 влево, б2 вверх, б3 вниз, б6 огонь, б7 бомба; состояние покоя — joy0 со старта, мусор на шине — не верим).
; Опрос — в начале прерывания: порт 03 — ещё и прокрутка, после опроса она ставится на место.
; Итог -> 3D42h по маскам игры (самоизменяемые операнды player_move, их настраивает меню CPC).
isr_input:
	ld	a,0x8a
	out	(0),a
	ld	a,0xfe			; ряд 0: б2 ВК (пауза), б4 влево, б5 вверх, б6 вправо, б7 вниз
	out	(3),a
	in	a,(2)
	cpl
	ld	b,a
	and	4
	ld	(kb_vk),a
	ld	a,b
	and	0xfb
	ld	b,a
	ld	a,0x7f			; ряд 7: б7 пробел
	out	(3),a
	in	a,(2)
	cpl
	ld	e,a
	ld	a,0xfd			; ряд 1: б2 АР2, б3 F1, б5 F3 (титул, пауза)
	out	(3),a
	in	a,(2)
	cpl
	ld	(kb_r1),a
	ld	a,0xdf			; ряд 5: б5 M — бомба
	out	(3),a
	in	a,(2)
	cpl
	and	0x20
	jp	z,.nm
	ld	a,b
	or	4
	ld	b,a
.nm:
	ld	a,0x88
	out	(0),a
	ld	a,(vscroll)
	out	(3),a			; прокрутка — на место
	xor	a
	out	(2),a
	in	a,(6)
	ld	hl,joy0
	xor	(hl)
	ld	c,a
	and	0x30
	jp	z,.kb
	ld	c,0
.kb:	ld	a,b			; клавиши -> биты джойстика
	and	0x10
	jp	z,.k1
	ld	a,c
	or	2
	ld	c,a
.k1:	ld	a,b
	and	0x40
	jp	z,.k2
	ld	a,c
	or	1
	ld	c,a
.k2:	ld	a,b
	and	0x20
	jp	z,.k3
	ld	a,c
	or	4
	ld	c,a
.k3:	ld	a,b
	and	0x80
	jp	z,.k4
	ld	a,c
	or	8
	ld	c,a
.k4:	ld	a,b
	and	4
	jp	z,.k5
	ld	a,c
	or	0x80
	ld	c,a
.k5:	ld	a,e
	and	0x80
	jp	z,.k6
	ld	a,c
	or	0x40
	ld	c,a
.k6:	ld	b,0			; биты -> маски игры
	ld	a,c
	rrca
	jp	nc,.n0
	ld	a,(SM_2FFF)
	or	b
	ld	b,a
.n0:	ld	a,c
	and	2
	jp	z,.n1
	ld	a,(SM_2FF0)
	or	b
	ld	b,a
.n1:	ld	a,c
	and	4
	jp	z,.n2
	ld	a,(SM_3019)
	or	b
	ld	b,a
.n2:	ld	a,c
	and	8
	jp	z,.n3
	ld	a,(SM_3025)
	or	b
	ld	b,a
.n3:	ld	a,c
	and	0x40
	jp	z,.n4
	ld	a,(SM_3041)
	or	b
	ld	b,a
	ld	a,(SM_3039)
	or	b
	ld	b,a
.n4:	ld	a,c
	and	0x80
	jp	z,.n5
	ld	a,(SM_3090)
	or	b
	ld	b,a
.n5:	ld	a,b
	ld	(JOY),a
	ret

set_palette:
	ld	hl,(pal_ptr)	; палитра: игры (VPAL) или титула
	ld	de,15
	add	hl,de
	ld	e,15
.l:	ld	a,e
	out	(2),a
	ld	a,(hl)
	out	(0x0c),a
	out	(0x0c),a
	dec	hl
	dec	e
	jp	p,.l
	xor	a
	out	(2),a
	ret

; ---- платформа ----------------------------------------------------------------------------------------
; ждать начала обновления: прошло VFRAMES_PER_UPD кадров с прошлого; затем вывести накопленное (sprites.asm)
plat_wait_vsync:
	call	pause_chk
	call	static_prepare	; тяжёлая проверка — до ожидания, вне начала вывода по лучу
	ld	a,(vframes)
	cp	VFRAMES_PER_UPD
	ld	a,0
	jp	nc,.late	; опоздали: прерывание было давно — прокрутку менять со следующего кадра
	inc	a
	ld	(vwait),a
.w:	ld	a,(vframes)
	cp	VFRAMES_PER_UPD
	jp	c,.w
	xor	a
	ld	(vwait),a
	inc	a
.late:	ld	(su_now),a
	xor	a
	ld	(vframes),a
	ld	a,1
	ld	(hud_req),a
	call	scroll_upd
	ld	a,(snd_due)		; шаг звука этого кадра — после верхней строки
	or	a
	jp	z,flush_hud
	xor	a
	ld	(snd_due),a
	call	isr_sound
	jp	flush_hud

; Экран — кольцо 256 строк: поле 224 (Y камера+16 .. +239), под ним чёрная полоса 32 строки (панель). Новая строка
; поля рисуется ровно тогда, когда въезжает сверху: прокрутка (порт 03) меняется здесь, сразу после прерывания,
; до строки 40 растра; затем — строка Y = камера + 16 из карты и отложенные тайлы. Строку, ушедшую в полосу,
; чистит flush после вывода спрайтов (band_n).
scroll_upd:
	ld	a,(dnl_on)
	or	a
	ret	z
	call	.go
	ld	hl,ROWBUF+17	; коды наложения строки MAP_ROW_X (draw_map_row логики) — после рисования
	ld	de,ovl_cur
	ld	bc,15		; B — признак: есть код < 40h
.oc:	ld	a,(hl)
	ld	(de),a
	cp	0x40
	jp	nc,.on
	inc	b
.on:	inc	hl
	inc	de
	dec	c
	jp	nz,.oc
	ld	a,b
	ld	(de),a
	ret
.go:	ld	a,(CAM_Y)
	ld	b,a
	ld	a,0xef
	sub	b
	ld	c,a		; новая прокрутка
	ld	a,(vs_cur)
	ld	b,a
	ld	a,c
	sub	b
	ret	z
	ld	b,a		; на сколько строк
	ld	(su_d),a
	ld	a,c
	ld	(vs_cur),a
	ld	a,(su_now)
	or	a
	jp	z,.ld
	ld	a,c		; сразу после прерывания — до строки 40 растра
	ld	(vscroll),a
	out	(3),a
.ld:	ld	hl,(dnl_last)	; строка карты сменилась — прежняя в dnl_prev
	ex	de,hl
	ld	hl,(MAP_ROW_X)
	ld	a,l
	cp	e
	jp	nz,.ch
	ld	a,h
	cp	d
	jp	z,.same
.ch:	ld	(dnl_last),hl
	ex	de,hl
	ld	(dnl_prev),hl
	ld	hl,ovl_cur	; коды прежней строки (с признаком)
	ld	de,ovl_prev
	call	cp15
	ld	a,(hl)
	ld	(de),a
	ld	a,(su_d)
	ld	b,a
.same:	dec	b
	jp	nz,.big
	ld	a,(su_now)
	ld	(top_now),a
	call	draw_top_line
	ld	a,(CAM_Y)
	add	a,16
	ld	(pl_y),a
	ld	a,(su_now)
	or	a
	jp	z,lb_save
	call	pend_def
	ld	a,(CAM_Y)
	add	a,16
	ld	(pl_y),a
	call	pend_line
	ld	a,1
	ld	(band_n),a
.vs:	ld	a,(vs_cur)	; опоздали — прокрутка с прерывания, когда строка уже нарисована
	ld	(vscroll),a
	ret
.big:	ld	hl,(MAP_ROW_X)	; скачок камеры (начало жизни): поле рисует логика, полоса — вся
	ld	(dnl_last),hl
	ld	de,0x40
	add	hl,de
	ld	(dnl_prev),hl
	xor	a
	ld	(ovl_prev+15),a
	ld	a,32
	ld	(band_n),a
	jp	.vs

; очистить band_n строк полосы с Y = камера + 240 (оба экрана, все 32 столбца)
band_clear:
	ld	a,(band_n)
	or	a
	ret	z
	ld	b,a
	xor	a
	ld	(band_n),a
	ld	a,(CAM_Y)
	add	a,240
	ld	c,a
.rw:	ld	a,c
	cpl
	ld	l,a
	ld	h,SCR_C
	xor	a
.c:	ld	(hl),a
	inc	h
	ld	(hl),a
	inc	h
	ld	(hl),a
	inc	h
	ld	(hl),a
	inc	h
	jp	nz,.c
	inc	c
	dec	b
	jp	nz,.rw
	ret

; отложенные тайлы (строки в полосе над полем): PEND — записи [тайл (2), столбец, Y верха]; строка Y = камера + 16
pend_line:
	ld	hl,PEND
.l:	ex	de,hl
	ld	hl,(pend_end)
	ld	a,l
	cp	e
	ret	z
	ex	de,hl
	ld	(pl_p),hl
	ld	a,(pl_y)
	ld	c,a		; Y
	inc	hl
	inc	hl
	inc	hl
	ld	a,(hl)
	add	a,15
	sub	c		; Y верха + 15 − Y: 0..15 — строка тайла въезжает; 16..127 — прошла; 128.. — впереди
	cp	16
	jp	c,.dr
	cp	128
	jp	c,.del
.nx:	ld	hl,(pl_p)
	inc	hl
	inc	hl
	inc	hl
	inc	hl
	jp	.l
.dr:	ld	b,a
	dec	hl
	ld	a,(hl)		; столбец
	dec	hl
	ld	d,(hl)
	dec	hl
	ld	e,(hl)
	ld	h,a
	ld	a,c
	cpl
	ld	l,a
	ld	a,15
	sub	b
	add	a,a
	add	a,a
	add	a,e
	ld	e,a
	jp	nc,$+4
	inc	d
	ld	a,(de)
	ld	(hl),a
	inc	de
	inc	h
	ld	a,(de)
	ld	(hl),a
	inc	de
	ld	a,h
	add	a,0x1f
	ld	h,a
	ld	a,(de)
	ld	(hl),a
	inc	de
	inc	h
	ld	a,(de)
	ld	(hl),a
	ld	a,b
	cp	15		; верхняя строка тайла — запись больше не нужна
	jp	nz,.nx
.del:	ld	hl,(pend_end)	; последняя запись — на место этой (одна клетка — одна запись, порядок не важен)
	dec	hl
	dec	hl
	dec	hl
	dec	hl
	ld	(pend_end),hl
	ex	de,hl
	ld	hl,(pl_p)
	ld	b,4
.mv:	ld	a,(de)
	ld	(hl),a
	inc	de
	inc	hl
	dec	b
	jp	nz,.mv
	ld	hl,(pl_p)
	jp	.l

; отложить тайл: DE — данные, (tp_col), (vt_y); та же клетка — заменить
pend_add:
	ld	hl,PEND
.f:	ld	a,(pend_end)
	cp	l
	jp	z,.new
	inc	hl
	inc	hl
	ld	a,(tp_col)
	cp	(hl)
	inc	hl
	jp	nz,.n1
	ld	a,(vt_y)
	cp	(hl)
	jp	nz,.n1
	dec	hl
	dec	hl
	ld	(hl),d
	dec	hl
	ld	(hl),e
	ret
.n1:	inc	hl
	jp	.f
.new:	ld	a,l
	cp	PEND_END & 0xff
	ret	z
	ld	(hl),e
	inc	hl
	ld	(hl),d
	inc	hl
	ld	a,(tp_col)
	ld	(hl),a
	inc	hl
	ld	a,(vt_y)
	ld	(hl),a
	inc	hl
	ld	(pend_end),hl
	ret

; DE = картинка тайла, (vt_x), (vt_y)
tile_pic:
	ld	a,e
	rlca
	rlca
	and	3
	ld	c,a
	ld	a,d
	and	0x3f
	add	a,a
	add	a,a
	or	c
	ld	l,a
	ld	h,TILEMAP_AT >> 8
	ld	a,(hl)
	cp	0xff
	ret	z
	ld	l,a
	ld	h,0
	add	hl,hl
	add	hl,hl
	add	hl,hl
	add	hl,hl
	add	hl,hl
	add	hl,hl
	ld	de,TILES_AT
	add	hl,de
	ex	de,hl
	ld	a,(vt_x)
	rrca
	rrca
	and	0x3f
	cp	30
	ret	nc		; за правым краем поля
	add	a,SCR_C		; столбец = X/4 (тайлы поля — X = 4 + 8k: столбцы 1..30)
	ld	(tp_col),a
	ld	h,a
	ld	a,(clip_base)	; y0 = Y − камера − 16 (17 — пока опоздавшая строка в LB)
	ld	c,a
	ld	a,240
	sub	c
	ld	(.tl+1),a
	sub	15
	ld	(.tf+1),a
	ld	a,(CAM_Y)
	add	a,c
	ld	c,a
	ld	a,(vt_y)
	sub	c
	ld	c,a
	ld	a,(vt_y)
	cpl
	ld	l,a
	ld	a,c
.tf:	cp	209
	jp	nc,.clip
	ld	b,16
.row:	ld	a,(de)
	ld	(hl),a
	inc	de
	inc	h
	ld	a,(de)
	ld	(hl),a
	inc	de
	ld	a,h
	add	a,0x1f
	ld	h,a
	ld	a,(de)
	ld	(hl),a
	inc	de
	inc	h
	ld	a,(de)
	ld	(hl),a
	inc	de
	ld	a,h
	sub	0x21
	ld	h,a
	dec	l
	dec	b
	jp	nz,.row
	ret
.clip:	cp	217		; строки в полосе снизу (въедут сверху) — отложить
	jp	c,.nop
	push	hl
	call	pend_add
	pop	hl
.nop:	ld	b,16
.cl:	ld	a,c
.tl:	cp	224
	jp	nc,.sk
	ld	a,(de)
	ld	(hl),a
	inc	de
	inc	h
	ld	a,(de)
	ld	(hl),a
	inc	de
	ld	a,h
	add	a,0x1f
	ld	h,a
	ld	a,(de)
	ld	(hl),a
	inc	de
	inc	h
	ld	a,(de)
	ld	(hl),a
	inc	de
	ld	a,h
	sub	0x21
	ld	h,a
	jp	.cn
.sk:
.s4:	inc	de
	inc	de
	inc	de
	inc	de
.cn:	dec	l
	inc	c
	dec	b
	jp	nz,.cl
	ret

; верхняя строка поля Y = камера + 16: 15 тайлов строки карты, строка тайла Y & 15
draw_top_line:
	ld	a,(CAM_Y)
	add	a,8
	and	15
	cp	8
	ld	hl,(MAP_ROW_X)	; строка камера + 8 — в MAP_ROW_X; камера + 16 — в ней же или в прежней
	ld	de,ovl_cur
	jp	c,.cur
	ld	hl,(dnl_prev)
	ld	de,ovl_prev
.cur:	ex	de,hl
	ld	(top_codes),hl
	ex	de,hl
	call	map_ptr		; HL — 15 номеров тайлов
	ld	a,(CAM_Y)
	add	a,16
	ld	c,a
	cpl
	ld	e,a		; строка памяти
	ld	(ol_row),a
	ld	a,c
	and	15
	add	a,a
	add	a,a
	ld	b,a		; строка тайла × 4
	ld	(ol_off),a
	ld	a,(top_now)	; опоздали — только подготовка (выведет прерывание, lb_out)
	or	a
	ret	z
	call	TOPL
	ld	hl,(top_codes)
	jp	ovl_line

; ---- переменные платформы ------------------------------------------------------------------------------
vscroll:	db	0xef
pal_ptr:	dw	VPAL
pal_req:	db	0
vframes:	db	0
vupd:		dw	0		; обновлений с запуска (для стенда)
vt_x:		db	0
vt_y:		db	0
dnl_on:		db	0
vs_cur:		db	0
su_now:		db	0
kb_vk:		db	0
vk_prev:	db	0
paused:		db	0
kb_r1:		db	0
vwait:		db	0
snd_due:	db	0
top_now:	db	1
top_codes:	dw	ovl_cur
pl_y:		db	0
pl_dy:		db	0
pl_dyv:		db	0
lb_pend:	db	0
lb_vs:		db	0
lb_r:		db	0
lb_q:		db	0
clip_base:	db	16
su_d:		db	0
band_n:		db	0
tp_col:		db	0
dnl_last:	dw	0
dnl_prev:	dw	0
pl_p:		dw	0
pend_end:	dw	PEND
PEND:		ds	24*4
PEND_END:		; граница записей, до переменных наложения и кеша карты
ol_row:		db	0
ol_off:		db	0
ol_t:		ds	4
ovl_cur:	ds	16
ovl_prev:	ds	16
mc_tag0:	db	0xff
mc_tag1:	db	0xff
mc_vict:	db	0
MC_BUF0:	ds	64
MC_BUF1:	ds	64
joy0:		db	0
