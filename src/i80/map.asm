; Карта: правки (флаг, база Андор), наземные объекты строки наложения, шаг прокрутки. По src/model/map.js.
; Адреса карты в переменных — адреса окна CPC 4000h..7FFFh; в памяти i8080 карта с MAP (+MAPOFS).
MAPOFS	  equ	MAP - 0x4000
AREA	  equ	0x3e5a
AREA_ROW  equ	0x3e59
AREA_XOFF equ	0x3e58
MAP_ROW	  equ	0x3e53
MAP_ROW_X equ	0x3e55
CAM_Y_OLD equ	0x3f27
GND_SLOT  equ	0x3e1c
ANDOR_ON  equ	0x3f1d
ANDOR_SAVED equ	0x3f1e
ANDOR_AT  equ	0x3f19
ANDOR_POS equ	0x3f1f
ANDOR_BUF equ	0x3ef5
G_X	  equ	0x3df4
G_Y	  equ	0x3dfc
G_ARG	  equ	0x3e04
G_ST	  equ	0x3e0c
G_TYPE	  equ	0x3e14
OVL_ROW	  equ	ROWBUF + 0x10	; B590h

; Наложение (6000h..7FFFh окна) не хранится, а вычисляется. Значение клетки:
;   1) список изменённых клеток OVL_SET (адрес, код) — то, что игра записала поверх;
;   2) база Андора — прямоугольник 6×6 кодов 10h..33h (ANDOR_SAVED, ANDOR_AT);
;   3) значимые клетки из данных (OVL_IDX/OVL_ENT), иначе 40h.
; Под флагами и базами в данных всегда 40h. Каждая запись игры в карту проходит через hook_mapw
; (A — значение, DE — адрес окна): стенд сверяет её с записью Z80 в банк 6, на Векторе это RET.
OVL_NSET equ	8
OR_A0	equ	SCRATCH+61	; ovl_row: адрес первой клетки (2 байта)
OR_C0	equ	SCRATCH+63	; ovl_row: её столбец

hook_mapw: ret

; A = код базы Андора в клетке DE и CY = 0, если база стоит и клетка в ней; иначе CY = 1. Портит HL, BC
ovl_rect:
	ld	a,(ANDOR_SAVED)
	or	a
	scf
	ret	z
	ld	hl,(ANDOR_AT)		; d = адрес − начало базы: строка d>>6 < 6, столбец d&3Fh < 6
	ld	a,e
	sub	l
	ld	c,a
	ld	a,d
	sbc	a,h
	ret	c
	cp	2
	ccf
	ret	c
	ld	b,a
	or	a
	jp	z,.a0
	ld	a,c
	cp	0x80
	ccf
	ret	c
.a0:	ld	a,c
	and	0x3f
	cp	6
	ccf
	ret	c
	ld	l,a
	ld	a,c
	rlca
	rlca
	and	3
	ld	h,a
	ld	a,b
	add	a,a
	add	a,a
	or	h
	ld	h,a
	add	a,a
	add	a,h
	add	a,a
	add	a,l
	add	a,0x10		; CY = 0
	ret

; A = код клетки DE по данным (иначе 40h). Портит HL, BC
ovl_static:
	ld	a,e			; строка r = ((D & 1Fh) << 2) | (E >> 6), столбец E & 3Fh
	rlca
	rlca
	and	3
	ld	c,a
	ld	a,d
	and	0x1f
	add	a,a
	add	a,a
	or	c
	ld	l,a
	ld	h,0
	ld	bc,OVL_IDX
	add	hl,bc
	ld	c,(hl)
	inc	hl
	ld	a,(hl)
	sub	c
	jp	z,.def
	ld	b,a
	ld	hl,OVL_ENT
	ld	a,l
	add	a,c
	ld	l,a
	jp	nc,.h
	inc	h
.h:	ld	a,e
	and	0x3f
	ld	c,a
.sl:	ld	a,(hl)
	inc	hl
	cp	c
	jp	z,.hit
	inc	hl
	dec	b
	dec	b
	jp	nz,.sl
.def:	ld	a,0x40
	ret
.hit:	ld	a,(hl)
	ret

; HL = запись OVL_SET с адресом DE (CY = 0) или CY = 1 — нет. Портит A, B
ovl_find:
	ld	hl,OVL_SET
	ld	b,OVL_NSET
.l:	ld	a,(hl)
	cp	e
	jp	nz,.n
	inc	hl
	ld	a,(hl)
	dec	hl
	cp	d
	ret	z
.n:	inc	hl
	inc	hl
	inc	hl
	dec	b
	jp	nz,.l
	scf
	ret

; A = код наложения в клетке HL; BC, DE сохраняются
ovl_get:
	push	bc
	push	de
	ex	de,hl
	call	ovl_find
	jp	c,.nr
	inc	hl
	inc	hl
	ld	a,(hl)
	jp	.out
.nr:	call	ovl_rect
	jp	nc,.out
	call	ovl_static
.out:	pop	de
	pop	bc
	ret

; 15 клеток наложения строки с адреса окна HL (все в одной строке карты) -> (DE..DE+14). Быстрее 15 ovl_get:
; 40h, затем значимые клетки строки из данных, база (если строка в ней), изменённые клетки — по приоритету
ovl_row:
	ld	(OR_A0),hl
	push	de
	; 40h: фиксированная строка, без счётчика на каждом байте.
	ld	a,0x40
	ld	(de),a
	inc	de
	ld	(de),a
	inc	de
	ld	(de),a
	inc	de
	ld	(de),a
	inc	de
	ld	(de),a
	inc	de
	ld	(de),a
	inc	de
	ld	(de),a
	inc	de
	ld	(de),a
	inc	de
	ld	(de),a
	inc	de
	ld	(de),a
	inc	de
	ld	(de),a
	inc	de
	ld	(de),a
	inc	de
	ld	(de),a
	inc	de
	ld	(de),a
	inc	de
	ld	(de),a
	inc	de
	pop	de
	push	de
	ld	a,l		; строка r, первый столбец c0
	and	0x3f
	ld	(OR_C0),a
	ld	a,l
	rlca
	rlca
	and	3
	ld	c,a
	ld	a,h
	and	0x1f
	add	a,a
	add	a,a
	or	c
	ld	l,a
	ld	h,0
	ld	bc,OVL_IDX
	add	hl,bc
	ld	c,(hl)
	inc	hl
	ld	a,(hl)
	sub	c
	jp	z,.nst
	ld	b,a
	ld	hl,OVL_ENT
	ld	a,l
	add	a,c
	ld	l,a
	jp	nc,.sl
	inc	h
.sl:	ld	a,(OR_C0)	; столбец − c0 < 15 -> в строку
	ld	c,a
	ld	a,(hl)
	inc	hl
	sub	c
	cp	15
	jp	nc,.sn
	pop	de
	push	de
	add	a,e
	ld	e,a
	jp	nc,.s1
	inc	d
.s1:	ld	a,(hl)
	ld	(de),a
.sn:	inc	hl
	dec	b
	dec	b
	jp	nz,.sl
.nst:	ld	a,(ANDOR_SAVED)	; база: по клеткам, только если стоит
	or	a
	jp	z,.nr
	ld	hl,(OR_A0)
	ex	de,hl
	pop	hl
	push	hl
	ld	b,15
.rl:	push	bc
	push	hl
	call	ovl_rect
	pop	hl
	pop	bc
	jp	c,.rn
	ld	(hl),a
.rn:	inc	hl
	inc	de
	dec	b
	jp	nz,.rl
.nr:	ld	hl,OVL_SET+1	; изменённые клетки: адрес − A0 < 15 (пустая запись — старший байт 0)
	ld	b,OVL_NSET
.ll:	ld	a,(hl)
	or	a
	jp	z,.le
	dec	hl
	push	bc
	ld	a,(OR_A0)
	ld	c,a
	ld	a,(hl)
	inc	hl
	sub	c
	ld	e,a
	ld	a,(OR_A0+1)
	ld	c,a
	ld	a,(hl)
	inc	hl
	sbc	a,c
	jp	nz,.ln
	ld	a,e
	cp	15
	jp	nc,.ln
	pop	bc
	pop	de
	push	de
	push	bc
	add	a,e
	ld	e,a
	jp	nc,.l1
	inc	d
.l1:	ld	a,(hl)
	ld	(de),a
.ln:	inc	hl
	inc	hl
	pop	bc
	dec	b
	jp	nz,.ll
	pop	de
	ret
.le:	inc	hl
	inc	hl
	inc	hl
	dec	b
	jp	nz,.ll
	pop	de
	ret

; убрать клетку DE из списка (если есть). BC, DE, HL сохраняются
ovl_del:
	push	hl
	push	bc
	call	ovl_find
	jp	c,.out
	xor	a
	ld	(hl),a
	inc	hl
	ld	(hl),a
.out:	pop	bc
	pop	hl
	ret

; клетка DE := A в списке (заменить или добавить). BC, DE, HL сохраняются
ovl_put:
	push	hl
	push	bc
	push	af
	call	ovl_find
	jp	nc,.set
	push	de
	ld	de,0
	call	ovl_find
	pop	de
	jp	c,.out		; список полон
	ld	(hl),e
	inc	hl
	ld	(hl),d
	dec	hl
.set:	inc	hl
	inc	hl
	pop	af
	push	af
	ld	(hl),a
.out:	pop	af
	pop	bc
	pop	hl
	ret

; запись игры в клетку DE := A: в список, если отличается от того, что дали бы база и данные; иначе — из списка.
; С = 1 — базу не учитывать (её сейчас убирают). A, BC, DE сохраняются
ovl_write:
	call	hook_mapw
	push	bc
	push	af
	ld	a,c
	or	a
	jp	nz,.st
	push	hl
	call	ovl_rect
	pop	hl
	jp	nc,.cmp
.st:	push	hl
	call	ovl_static
	pop	hl
.cmp:	ld	b,a
	pop	af
	push	af
	cp	b
	jp	z,.del
	call	ovl_put
	jp	.out
.del:	call	ovl_del
.out:	pop	af
	pop	bc
	ret

; map_put: байт A в наложение по адресу окна DE (игра пишет 41h — флаг, 40h — снять); A сохраняется
p_map_put:
	push	bc
	ld	c,0
	call	ovl_write
	pop	bc
	ret

; flag_mark: код A в наложение на место флага зоны (T_03F7 + 2·зона: младший, старший; младший + SM_267A)
p_flag_mark:
	ld	c,a
	ld	a,(AREA)
	ld	hl,T_03F7
	call	word_hl_a
	ld	a,d
	or	a
	ret	z
	ld	a,(SM_267A)
	add	a,e
	ld	e,a
	ld	a,c
	jp	p_map_put

; andor_place: база 6×6 по адресу окна HL: старые коды — в буфер DE, на их место 10h..33h
; (пока база не поставлена, клетка уходит из списка изменённых — её покажет прямоугольник базы)
p_andor_place:
	ld	c,0x10
.row:	push	hl
	ld	b,6
.col:	push	hl
	call	ovl_get
	pop	hl
	ld	(de),a
	inc	de
	ld	a,c
	ex	de,hl
	call	hook_mapw
	call	ovl_del
	ex	de,hl
	inc	c
	inc	hl
	dec	b
	jp	nz,.col
	pop	hl
	call	row_down
	ld	a,c
	cp	0x10 + 36
	jp	c,.row
	ld	a,1
andor_flags:
	ld	(ANDOR_ON),a
	ld	(ANDOR_SAVED),a
	ret

; HL += 40h (строка карты), DE сохраняется
row_down:
	push	de
	ld	de,0x40
	add	hl,de
	pop	de
	ret

; andor_restore: вернуть 6×6 из буфера DE в карту по адресу окна HL
p_andor_restore:
	ld	b,6
.row:	push	hl
	push	bc
	ld	b,6
.col:	ld	a,(de)
	inc	de
	ex	de,hl
	ld	c,1
	call	ovl_write
	ex	de,hl
	inc	hl
	dec	b
	jp	nz,.col
	pop	bc
	pop	hl
	call	row_down
	dec	b
	jp	nz,.row
	xor	a
	jp	andor_flags

; andor_setup: убрать прежнюю базу; в зонах 4 и 8 (номер 3 и 7) врезать новую
p_andor_setup:
	ld	a,(ANDOR_SAVED)
	or	a
	jp	z,.n
	ld	hl,(ANDOR_AT)
	ld	de,ANDOR_BUF
	call	p_andor_restore
.n:	ld	a,(AREA)
	cp	3
	jp	z,.a3
	cp	7
	ret	nz
	ld	hl,0x1807
	ld	de,0x669f
	jp	.put
.a3:	ld	hl,0x1e03
	ld	de,0x6831
.put:	ld	(ANDOR_POS),hl
	ex	de,hl
	ld	(ANDOR_AT),hl
	ld	de,ANDOR_BUF
	jp	p_andor_place

; ground_spawn: A = X, C = тип, L = Y; стек: слово (младший — аргумент, старший — состояние), снимает 2.
; Первый свободный из 8 слотов (G_ST = 0); номер + 1 -> GND_SLOT
p_ground_spawn:
	ld	b,a
	ld	e,l
	ld	hl,G_ST
	ld	d,0
.lp:	ld	a,(hl)
	or	a
	jp	z,.f
	inc	hl
	inc	d
	ld	a,d
	cp	8
	jp	c,.lp
	jp	.out
.f:	ld	a,d
	inc	a
	ld	(GND_SLOT),a
	ld	a,d
	ld	hl,G_TYPE
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),c
	ld	a,d
	ld	hl,G_X
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),b
	ld	a,d
	ld	hl,G_Y
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),e
	ld	hl,2
	add	hl,sp
	ld	c,(hl)
	inc	hl
	ld	b,(hl)
	ld	a,d
	ld	hl,G_ARG
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),c
	ld	a,d
	ld	hl,G_ST
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(hl),b
.out:	pop	hl
	pop	bc
	jp	(hl)

; map_row_objects: столбцы 14..0 строки наложения -> наземные объекты; затем хвост прокрутки.
; Ветви задают C = тип, DE = слово аргумента, H = сдвиг X, L = Y; X = 8·столбец + H + 4
p_map_row_objects:
	ld	a,14
	ld	(SCRATCH+2),a
.lp:	ld	a,(SCRATCH+2)
	ld	hl,OVL_ROW + 1
	add	a,l		; = call at_hl_a
	ld	l,a
	jp	nc,$+4
	inc	h
	ld	a,(hl)
	ld	hl,0
	cp	0x17
	jp	z,.tile
	cp	0x19
	jp	z,.tile
	cp	0x23
	jp	z,.tile
	cp	0x25
	jp	z,.tile
	cp	0x02
	jp	z,.c02
	or	a
	jp	z,.c00
	cp	0x07
	jp	z,.c07
	cp	0x41
	jp	z,.c41
	cp	0x08
	jp	z,.c15
	cp	0x0a
	jp	z,.c15
	cp	0x09
	jp	z,.c16
	cp	0x01
	jp	z,.c16
	ld	hl,0x0408
	cp	0x1e
	jp	z,.c1e
	cp	0x34
	jp	z,.c34
	cp	0x38
	jp	z,.c34
	cp	0x03
	jp	nz,.nx
	ld	c,0x26
	ld	de,0xff00
	jp	.sp
.tile:	add	a,0x14
	ld	(SCRATCH+3),a
	ld	a,0x0f
	call	p_rnd
	add	a,a
	add	a,a
	add	a,a
	add	a,a
	ld	e,a
	ld	a,(SM_1F8E)
	ld	d,a
	ld	a,(SCRATCH+3)
	ld	c,a
	ld	hl,0x0408
	jp	.sp
.c02:	ld	c,0x16
	ld	de,0xfe00
	jp	.sp
.c00:	ld	c,0x16
	jp	.c0x
.c07:	ld	c,0x15
.c0x:	ld	a,(GND_SLOT)
	inc	a
	add	a,a
	add	a,a
	ld	e,a
	ld	d,4
	jp	.sp
.c41:	ld	c,0x41
	jp	.c100
.c15:	ld	c,0x15
	jp	.c100
.c16:	ld	c,0x16
.c100:	ld	de,0x0100
	jp	.sp
.c1e:	ld	c,0x28
	ld	de,0xfe00
	jp	.sp
.c34:	ld	c,0x27
	ld	de,0x1000
.sp:	ld	a,(SCRATCH+2)
	add	a,a
	add	a,a
	add	a,a
	add	a,h
	add	a,4
	push	de
	call	p_ground_spawn
.nx:	ld	a,(SCRATCH+2)
	dec	a
	ld	(SCRATCH+2),a
	jp	p,.lp
scroll_tail:
	ld	a,(CAM_Y)
	cpl
	inc	a
	ld	(CAM_OFF),a
	ret

; scroll_step: камера −1 (если не стоим); на строке 15 из 16 — объекты строки, на 7 — переход строки карты
p_scroll_step:
	ld	a,(CAM_Y)
	ld	(CAM_Y_OLD),a
	ld	b,a
	ld	a,(SLOW)
	or	a
	jp	nz,scroll_tail
	ld	a,b
	dec	a
	ld	(CAM_Y),a
	and	0x0f
	cp	0x0f
	jp	z,p_map_row_objects
	cp	7
	jp	nz,scroll_tail
	ld	a,(AREA_ROW)
	cp	0x7f
	call	z,p_andor_setup
	ld	a,(AREA_ROW)
	or	a
	jp	nz,.d
	ld	a,0x80
.d:	dec	a
	ld	(AREA_ROW),a
; строка карты на 40h вверх; дошли до 3FC0h — следующая зона
	ld	hl,(MAP_ROW)
	ld	de,-0x40
	add	hl,de
	ld	a,h
	cp	0x3f
	jp	nz,.st
	ld	a,l
	cp	0xc0
	jp	nz,.st
	ld	a,0x40
	call	p_flag_mark
	ld	a,(AREA)
	inc	a
	and	7
	ld	b,a
	jp	nz,.ar
	ld	a,0x10			; второй круг
	ld	(SM_1F8E),a
	ld	a,0x3f
	ld	(SM_2999),a
	ld	a,(SM_389F)
	sub	0x19
	jp	c,.ar
	ld	(SM_389F),a
.ar:	ld	a,b
	ld	(AREA),a
	ld	hl,T_03CB
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(AREA_XOFF),a
	ld	a,(AREA)
	add	a,0x31
	ld	de,0x807a
	call	plat_put_digit
	ld	a,3
	call	p_rnd
	ld	(SM_267A),a
	ld	a,0x41
	call	p_flag_mark
	ld	hl,0x5fc0
.st:	ld	(MAP_ROW),hl
	ld	a,(AREA_XOFF)
	add	a,l
	ld	l,a
	ld	(MAP_ROW_X),hl
	jp	scroll_tail

SM_267A: db	0		; случайный сдвиг флага зоны
SM_1F8E: db	0		; состояние наземной цели из тайла
SM_2999: db	0
SM_389F: db	0		; длительность паузы (на втором круге короче)
