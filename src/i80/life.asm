; Начало жизни, гибель, конец игры, таблица рекордов, экран карты. По src/model/life.js и flow.js (death_seq).
SND_TIMER equ	0x3d3b		; слово
PAUSE	equ	0x3f2f
SCR_ROWS equ	0x3e4d		; сколько строк экрана брать из карты при выводе
FLAG_POS equ	0x3f30		; место флага зоны на экране: Y, X
TEXT_PEN equ	0x3e5f
F3F29	equ	0x3f29
HI_TAB	equ	0x3d2d		; нижняя запись таблицы рекордов (5 × 16 байт вверх до 3CEDh)
DS_ROWS	equ	SCRATCH+44
DS_X	equ	SCRATCH+45
DS_Y	equ	SCRATCH+46
DS_HL	equ	SCRATCH+47	; 2 байта
DS_T	equ	SCRATCH+49	; 2 байта

; сброс регистров экрана CRTC (тонкая прокрутка, адрес)
reset_crtc:
	ld	hl,0x0808
	ld	(CRTC_R5),hl
	ld	hl,0x3000
	ld	(CRTC_MA),hl
	ret

; put_tile16 с A = 3Ch, L, буфер DE
home_tile:
	push	de
	ld	a,0x3c
	call	plat_put_tile16
	ret

; корабль в исходную точку на обоих экранах; фон под ним и под прицелом сохранить
player_home:
	ld	hl,0x3c3c
	ld	(PL_X),hl
	ld	hl,0xc0c0
	ld	(PL_Y),hl
	ld	l,0xc0
	ld	de,0xb0c0
	call	home_tile
	ld	l,0xc0
	ld	de,0xb080
	call	home_tile
	ld	l,0x80
	ld	de,0xb140
	call	home_tile
	ld	l,0x80
	ld	de,0xb100
	jp	home_tile

; B байт нулей с HL
zero_b:	ld	(hl),0
	inc	hl
	dec	b
	jp	nz,zero_b
	ret

; все слоты объектов пусты
clear_objects:
	ld	hl,SHOT_ST
	ld	b,4
	call	zero_b
	ld	hl,A_ST
	ld	b,5
	call	zero_b
	ld	hl,B_ST
	ld	b,12
	call	zero_b
	ld	hl,W_ST
	ld	b,6
	call	zero_b
	ld	hl,Z_ST
	ld	b,5
	call	zero_b
	ld	hl,T_ST
	ld	b,8
	call	zero_b
	ld	hl,S_ST
	ld	b,5
	call	zero_b
	ld	hl,G_ST
	ld	b,8
	call	zero_b
	ld	a,8
	ld	(GND_SLOT),a
	xor	a
	ld	(ALIVE),a
	ld	(BOMB_ST),a
	ld	(Z_N),a
	ld	(Z_TM),a
	ld	(SLOW),a
	ld	(ANDOR_ON),a
	ld	hl,0xffff
	ld	(ANDOR_POS),hl
	ret

; контрольная точка: в первой половине зоны (строка < 40h) — с середины (экран 15 строк из карты),
; иначе с начала зоны (из карты только нижняя строка)
checkpoint:
	ld	a,(AREA_ROW)
	cp	0x40
	jp	nc,.st
	ld	a,0x40
	ld	(AREA_ROW),a
	ld	a,0xf0
	ld	(SCR_ROWS),a
	ld	de,0xf000
	ld	hl,(MAP_ROW)
	add	hl,de
	ld	(MAP_ROW),hl
	ld	hl,(MAP_ROW_X)
	add	hl,de
	ld	(MAP_ROW_X),hl
	jp	p_andor_setup
.st:	xor	a
	ld	(AREA_ROW),a
	ld	a,0x10
	ld	(SCR_ROWS),a
	ret

; draw_screen: экран карты 15×15 тайлов (A — сколько строк по Y брать из карты, прочие пустые E940h);
; код 41h в наложении — место флага в FLAG_POS
p_draw_screen:
	ld	(DS_ROWS),a
	ld	hl,(MAP_ROW_X)
	ld	de,0x038e
	add	hl,de
	ld	(DS_HL),hl
	ld	a,0xe0
	ld	(DS_Y),a
.ly:	ld	a,0x74
	ld	(DS_X),a
.lx:	ld	hl,0xe940
	ld	(DS_T),hl
	ld	a,(DS_ROWS)
	ld	b,a
	ld	a,(DS_Y)
	cp	b
	jp	nc,.dr
	ld	hl,(DS_HL)
	ld	a,h
	or	0x20
	ld	h,a
	call	ovl_get
	cp	0x41
	jp	nz,.nf
	ld	a,(DS_Y)
	ld	(FLAG_POS),a
	ld	a,(DS_X)
	ld	(FLAG_POS+1),a
.nf:	ld	hl,(DS_HL)
	call	map_ptr
	ld	l,(hl)
	ld	h,0
	add	hl,hl
	add	hl,hl
	add	hl,hl
	add	hl,hl
	add	hl,hl
	add	hl,hl
	ld	de,0xc000
	add	hl,de
	ld	(DS_T),hl
.dr:	ld	hl,(DS_T)
	push	hl
	ld	a,(DS_Y)
	ld	l,a
	ld	a,(DS_X)
	call	plat_draw_tile16
	ld	hl,(DS_HL)
	dec	hl
	ld	(DS_HL),hl
	ld	a,(DS_X)
	sub	8
	ld	(DS_X),a
	jp	nc,.lx
	ld	hl,(DS_HL)
	ld	de,-0x31
	add	hl,de
	ld	(DS_HL),hl
	ld	a,(DS_Y)
	sub	0x10
	ld	(DS_Y),a
	jp	nc,.ly
	ret

; строка с HL (до 0) знаками по экрану панели с DE, шаг 2
print_str:
	ld	a,(hl)
	or	a
	ret	z
	push	hl
	push	de
	call	plat_put_char
	pop	de
	pop	hl
	inc	hl
	inc	de
	inc	de
	jp	print_str

; restart_life: панель, музыка, сброс, зона с контрольной точки, экран карты на обе страницы, панель
p_restart_life:
	call	plat_clear_hud
	ld	hl,0x5454
	ld	de,0x5454
	call	plat_hud_pens
	xor	a
	call	plat_raster_mode
	ld	a,0xc4
	call	plat_ga_config
	ld	hl,0x012c
	ld	(SND_TIMER),hl
	ld	hl,0x4b00
	call	plat_music_start
	ld	a,2
	ld	(SND_MODE),a
	ld	(READY),a
	xor	a
	ld	(PL_HIT),a
	call	plat_wait_vsync
	call	reset_crtc
	xor	a
	ld	(CAM_Y),a
	ld	(CAM_Y_OLD),a
	ld	(CAM_OFF),a
	ld	(FLAG_ST),a
	ld	(PAUSE),a
	ld	a,(AREA)
	ld	hl,T_03CB
	call	at_hl_a	; холодное место (< 0,1 раза за обновление)
	ld	(AREA_XOFF),a
	ld	hl,0x5fc0
	ld	(MAP_ROW),hl
	ld	e,a
	ld	d,0
	add	hl,de
	ld	(MAP_ROW_X),hl
	ld	a,0x41
	call	p_flag_mark
	call	player_home
	call	clear_objects
	call	checkpoint
	ld	hl,0
	ld	(FLAG_POS),hl
	call	.page
	call	.page
	ld	hl,(FLAG_POS)		; флаг зоны на экране — наземным объектом
	ld	a,h
	or	l
	jp	z,.nfl
	ld	de,0x0100
	push	de
	ld	c,0x41
	ld	a,h
	call	p_ground_spawn
.nfl:	call	player_home
	ld	hl,0x5756
	ld	de,0x5443
	call	plat_hud_pens
	ld	a,1
	ld	(SM_064A),a
	ld	a,3
	ld	(TEXT_PEN),a
	ld	hl,T_354E
	ld	de,0x8016
	call	print_str
	ld	hl,T_355A
	ld	de,0x8036
	call	print_str
	ld	a,1
	ld	(TEXT_PEN),a
	ld	hl,HISCORE
	ld	de,0x805a
	call	plat_print_score
	ld	a,(AREA)
	add	a,0x31
	ld	de,0x807a
	call	plat_put_char
	ld	a,(SCORE+2)
	or	a
	jp	nz,.sc
	ld	a,0x30
	ld	de,0x804c
	call	plat_put_char
.sc:	ld	a,2
	ld	(TEXT_PEN),a
	ld	hl,T_3560
	ld	de,0x8002
	call	print_str
	ld	a,1
	ld	(TEXT_PEN),a
	ld	c,1		; значки жизней: 1 .. min(жизни, 6) − 1
.lv:	ld	a,(LIVES)
	cp	c
	ret	z
	ret	c
	ld	a,c
	cp	6
	ret	nc
	add	a,a
	add	a,8
	ld	e,a
	ld	d,0x80
	ld	a,0xaa
	push	bc
	call	plat_put_char
	pop	bc
	inc	c
	jp	.lv
.page:	call	p_flip_screens
	ld	a,(SCR_ROWS)
	call	p_draw_screen
	jp	p_msg_ready

; hiscore_rank: вставить очки в таблицу рекордов; A = место (0 — первое) или 5, если не выше нижнего
p_hiscore_rank:
	ld	hl,HI_TAB
	ld	b,5
.lp:	push	hl		; сравнить очки с записью HL
	ld	de,SCORE
	ld	c,3
.cmp:	ld	a,(de)
	cp	(hl)
	jp	nz,.ne
	inc	hl
	inc	de
	dec	c
	jp	nz,.cmp
	pop	hl
	jp	.end		; равны — не выше
.ne:	pop	hl
	jp	c,.end		; ниже
	ld	a,b
	cp	5
	jp	nc,.nm
	push	hl		; запись вниз на 16 (12 байт)
	ld	de,16
	ex	de,hl
	add	hl,de
	ex	de,hl
	ld	c,12
.mv:	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	dec	c
	jp	nz,.mv
	pop	hl
.nm:	ld	(SCRATCH+2),hl	; место
	ld	de,-16
	add	hl,de
	dec	b
	jp	nz,.lp
.end:	ld	a,b
	cp	5
	ret	z
	ld	hl,(SCRATCH+2)
	ld	de,SCORE
	ld	c,3
.w:	ld	a,(de)
	ld	(hl),a
	inc	hl
	inc	de
	dec	c
	jp	nz,.w
	ld	c,8
.sp:	ld	(hl),0x20
	inc	hl
	dec	c
	jp	nz,.sp
	ld	(hl),0
	ld	a,b
	ret

; game_over: экран, таблица рекордов (ввод имени), титул и меню; затем новая игра с зоны 1
p_game_over:
	ld	hl,0x5454
	ld	de,0x5454
	call	plat_hud_pens
	xor	a
	ld	(OVER_MSG),a
	ld	(BUF_BACK),a
	ld	(F3F29),a
	ld	(AREA),a
	ld	a,0xc3
	call	plat_ga_config
	call	plat_clear_4000
	call	plat_clear_hud
	ld	a,0xc1
	call	plat_ga_config
	call	plat_clear_4000
	call	reset_crtc
	call	plat_wait_vsync
	xor	a
	ld	(SM_064A),a
	ld	hl,0x5754
	ld	de,0x4c4b
	call	plat_hud_pens
	ld	a,1
	call	plat_raster_mode
	call	plat_draw_logo
	call	p_hiscore_rank
	cp	5
	call	c,plat_name_entry
	call	plat_hiscore_table
	call	plat_title_menu
	ld	a,(ANDOR_SAVED)
	or	a
	jp	z,.na
	ld	hl,(ANDOR_AT)
	ld	de,ANDOR_BUF
	call	p_andor_restore
.na:	ld	hl,0
	ld	(SCORE),hl
	ld	(SCORE+1),hl
	ld	a,0x78
	ld	(AREA_ROW),a
	ld	a,0x40
	call	p_flag_mark
	ld	a,3
	call	p_rnd
	ld	(SM_267A),a
	jp	p_restart_life

; death_seq: счётчик гибели PL_HIT растёт до 40h (на 1 — звук, на 0Ch — музыка гибели); затем на
; нечётном заднем экране жизнь −1: начало жизни или конец игры
p_death_seq:
	ld	a,(PL_HIT)
	or	a
	ret	z
	cp	1
	jp	nz,.n1
	ld	d,2
	ld	hl,0x0f03
	ld	e,0x30
	call	plat_sfx
	ld	a,(PL_HIT)
.n1:	cp	0x0c
	jp	nz,.n2
	ld	a,1
	ld	(SND_MODE),a
	ld	hl,1
	ld	(SND_TIMER),hl
	ld	a,0x0c
.n2:	inc	a
	ld	(PL_HIT),a
	and	0x40
	ret	z
	ld	a,(BUF_BACK)
	or	a
	jp	nz,.dead
	ld	hl,PL_HIT
	dec	(hl)
	ret
.dead:	ld	hl,LIVES
.livd:	dec	(hl)		; .livd — титул Вектора ставит сюда NOP при старте с F1+F3 (бесконечные жизни)
	jp	nz,p_restart_life
	jp	p_game_over

SM_064A: db	0		; панель и пауза в прерывании включены
