; Главный цикл (одно обновление) и служебные части: строка карты в буфер, смена экранов, шаг прокрутки
; экрана, надпись «готов». По src/model/mainloop.js.
CRTC_R5	 equ	0x3d3e		; тонкая прокрутка (строки внутри знака)
CRTC_MA	 equ	0x3d40		; адрес начала экрана (слово)
SND_MODE equ	0x3d3a
DX	 equ	0x3d51
DY	 equ	0x3d52
TXT_READY1 equ	0x0407		; строки надписи в коде CPC — значения для платформы
TXT_READY2 equ	0x0412
DM_HI	 equ	SCRATCH+60

; draw_map_row: строка карты (15 тайлов, затем 15 кодов наложения) в ROWBUF+2..; место флага
; (код с битами 41h) — в FLAG_MAP. Вывод строки на экран — забота платформы.
p_draw_map_row:
	ld	hl,(MAP_ROW_X)
	push	hl
	call	map_ptr
	ld	de,ROWBUF+2
	; 15 байт за пять проходов. ROWBUF+2..+17 — внутри одной страницы.
	ld	b,5
.c1:	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	e
	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	e
	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	e
	dec	b
	jp	nz,.c1
	pop	hl
	ld	a,h
	or	0x20
	ld	(DM_HI),a
	ld	c,l
	ld	a,l
	add	a,14
	ld	a,h
	adc	a,0
	or	0x20
	ld	h,a		; наложение: старший байт от адреса + 14, младший — тот же
	ld	de,ROWBUF+17
	push	bc
	call	ovl_row
	pop	bc
	ld	hl,ROWBUF+17
	ld	b,15		; C — текущий младший адрес клетки, как начальный C + индекс
.c2:	ld	a,(hl)
	and	0x41
	cp	0x41
	jp	nz,.n
	ld	a,c
	ld	(FLAG_MAP),a
	ld	a,(DM_HI)
	ld	(FLAG_MAP+1),a
.n:	inc	hl
	inc	c
	dec	b
	jp	nz,.c2
	ret
; flip_screens: задний и передний меняются; бит 5 старшего байта адреса экрана — по новому заднему
p_flip_screens:
	ld	a,(BUF_BACK)
	ld	(BUF_FRONT),a
	inc	a
	and	1
	ld	(BUF_BACK),a
	ld	a,(CRTC_MA+1)
	jp	z,.s
	and	0xdf
	jp	.w
.s:	or	0x20
.w:	ld	(CRTC_MA+1),a
	ret

; wait_frame: при движении — тонкая прокрутка +1; каждые 16 — адрес экрана на строку знаков выше
p_wait_frame:
	ld	a,(SLOW)
	or	a
	ret	nz
	ld	a,(CRTC_R5)
	inc	a
	ld	e,a
	and	0x0f
	jp	z,.w
	ld	(CRTC_R5),a
	ret
.w:	ld	hl,(CRTC_MA)
	ld	a,h
	and	3
	ld	h,a
	ld	bc,-0x20
	add	hl,bc
	ld	a,h
	and	3
	ld	b,a
	ld	a,(CRTC_MA+1)
	and	0xfc
	or	b
	ld	h,a
	ld	(CRTC_MA),hl
	ld	a,e
	and	a
	rra
	ld	(CRTC_R5),a
	ret

; msg_ready: надпись начала жизни, стрельба целей выключена
p_msg_ready:
	ld	a,0xc9
	ld	(SM_1A21),a
	ld	a,(CAM_Y)
	add	a,0x50
	ld	l,a
	push	hl		; Y — под аргументами
	ld	de,0xa900
	push	de
	ld	de,TXT_READY1
	push	de
	ld	a,0x2c
	call	plat_print_text
	pop	hl
	ld	a,l
	add	a,0x10
	ld	l,a
	ld	de,0xa990
	push	de
	ld	de,TXT_READY2
	push	de
	ld	a,0x34
	call	plat_print_text
	ret

; прицел: A = X, L = Y корабля в заднем экране, Y прицела = Y + C0h
sight_xy:
	ld	a,(BUF_BACK)
	call	pl_xy
	ld	b,a
	ld	a,l
	add	a,0xc0
	ld	l,a
	ld	a,b
	ret

; main_loop: одно обновление от ожидания кадра до смены экранов
p_main_loop:
	call	plat_wait_vsync
	call	p_ready_msg
	call	p_over_msg_erase
	ld	a,(BUF_BACK)
	ld	hl,T_0163
	call	word_hl_a
	push	de
	call	sight_xy
	call	plat_restore_16
	call	p_erase_sparks
	call	p_erase_z23
	call	p_erase_bullets
	call	p_erase_z48
	call	p_erase_shots
	call	p_erase_air
	call	p_timer_3d9f
	call	p_erase_player
	call	p_erase_tabobj
	ld	a,(FLAG_ST)
	cp	2
	jp	nz,.nf
	ld	hl,0xbb00
	push	hl
	ld	a,(FLAG_XY)
	ld	l,a
	ld	a,(FLAG_XY+1)
	call	plat_restore_16
	xor	a
	ld	(FLAG_ST),a
.nf:	call	p_draw_map_row
; новые враги: не во время надписи, не при стоящей карте, без живой волны и при Z_N < 5
	ld	a,(READY)
	ld	hl,SLOW
	or	(hl)
	ld	hl,ALIVE
	or	(hl)
	jp	nz,.ns
	ld	a,(Z_N)
	cp	5
	jp	nc,.ns
	ld	a,(AREA_ROW)	; строка со знаком: 25h..7Fh — волна
	or	a
	jp	m,.n1
	cp	0x25
	jp	c,.n1
	call	p_spawn_air_start
	jp	.ns
.n1:	ld	a,(AREA)
	cp	3
	jp	z,.z48
	cp	7
	jp	z,.z48
	cp	1
	jp	z,.z23
	cp	2
	jp	z,.z23
	or	a
	jp	z,.ns
	ld	a,(AREA_ROW)
	and	7
	jp	nz,.ns
	call	p_spawn_sparks
	jp	.ns
.z48:	call	p_spawn_z48
	jp	.ns
.z23:	call	p_spawn_z23
.ns:	call	p_spawn_by_row
; база Андор на месте — карта стоит
	ld	a,(ANDOR_POS)
	ld	b,a
	ld	a,(AREA)
	cp	b
	jp	nz,.na
	ld	a,(AREA_ROW)
	or	a
	jp	m,.na
	ld	b,a
	ld	a,(ANDOR_POS+1)
	cp	b
	jp	nz,.na
	ld	a,(ANDOR_ON)
	or	a
	jp	z,.na
	ld	a,1
	ld	(SLOW),a
	xor	a
	ld	(ANDOR_ON),a
.na:	xor	a
	ld	(DX),a
	ld	a,(SLOW)
	dec	a
	ld	(DY),a
	call	p_player_move
	call	p_scroll_step
	call	p_draw_map_row
	ld	a,(BUF_FRONT)
	ld	hl,PL_X
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	b,a
	ld	a,(DX)
	add	a,b
	ld	b,a
	ld	a,(BUF_BACK)
	ld	hl,PL_X
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	(hl),b
	ld	a,(BUF_FRONT)
	ld	hl,PL_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	b,a
	ld	a,(DY)
	add	a,b
	ld	b,a
	ld	a,(BUF_BACK)
	ld	hl,PL_Y
	add	a,l		; массив CPC целиком в одной странице: перенос в H не нужен
	ld	l,a
	ld	a,(hl)
	ld	(hl),b
	call	p_upd_ground_tiles
	call	p_special_flag
	call	p_upd_tabobj
	call	p_draw_player
	call	p_upd_bomb
	call	p_upd_air
	call	p_upd_shots
	call	p_upd_z48
	call	p_upd_bullets
	call	p_upd_z23
	call	p_upd_sparks
	ld	a,(BUF_BACK)
	ld	hl,T_0163
	call	word_hl_a
	push	de		; s1 — буфер прицела
	ld	hl,0x8200
	push	hl		; s0 — прицел
	call	sight_xy
	call	plat_draw_sprite
	ld	a,(CAM_Y)
	cp	7
	call	nz,p_hiscore
	ld	a,(READY)
	cp	2
	jp	nz,.nr
	ld	a,(SND_MODE)
	cp	2
	jp	nz,.r1
	call	p_msg_ready
	jp	.nr
.r1:	ld	a,1
	ld	(READY),a
.nr:	call	p_over_msg
	call	p_wait_frame
	call	p_death_seq
	jp	p_flip_screens
