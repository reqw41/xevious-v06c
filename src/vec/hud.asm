; Панель в нижней чёрной полосе: одна строка шрифтом 6×7 (знак на байт), столбцы 1..30 экрана:
;   1UP^^^^^ 000030 *050000 AREA01 (* — знак рекорда)
; (подпись, запасные корабли, очки, рекорд, зона). Строится из переменных игры (рекорд 3F21h и очки 3F24h — 6 байт BCD
; подряд, жизни 3D39h, зона 3E5Ah) при их изменении; вызовы панели CPC на Векторе пустые. Полоса едет вместе с
; прокруткой: hud_draw (hud_draw.asm, перед 3C00h) переносит готовые пиксели через SP. Из шрифта рисуются
; только изменившиеся знаки; первый вывод, большие сдвиги и переход строки через страницу — целиком.
; Подписи — плоскость C (синий), значения — E (бледно-жёлтый).
HUD_Y	equ	236		; верх строки на экране (полоса — 224..255)
HUD_W	equ	30
HUD_SP	equ	10		; пробел; 0–9 — цифры, буквы — ASCII (font_adr)
HUD_SHIP equ	11

; значения изменились — собрать знаки HUD_CH и записи HUD_REC
hud_check:
	ld	hl,0x3f21	; рекорд, очки
	ld	de,hud_last
	ld	b,6
.cmp:	ld	a,(de)
	cp	(hl)
	jp	nz,.new
	inc	hl
	inc	de
	dec	b
	jp	nz,.cmp
	ld	a,(de)
	ld	hl,LIVES
	cp	(hl)
	jp	nz,.new
	inc	de
	ld	a,(de)
	ld	hl,AREA
	cp	(hl)
	ret	z
.new:	ld	hl,0x3f21
	ld	de,hud_last
	ld	b,6
.cp:	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	dec	b
	jp	nz,.cp
	ld	a,(LIVES)
	ld	(de),a
	inc	de
	ld	a,(AREA)
	ld	(de),a
	ld	hl,HUD_CH	; пробелы и подписи
	ld	b,HUD_W
.f:	ld	(hl),HUD_SP
	inc	hl
	dec	b
	jp	nz,.f
	ld	hl,HUD_CH	; 1UP
	ld	(hl),1
	inc	hl
	ld	(hl),'U'
	inc	hl
	ld	(hl),'P'
	ld	a,12		; знак рекорда
	ld	(HUD_CH+16),a
	ld	hl,HUD_CH+24	; AREA
	ld	(hl),'A'
	inc	hl
	ld	(hl),'R'
	inc	hl
	ld	(hl),'E'
	inc	hl
	ld	(hl),'A'
	ld	a,(LIVES)	; запасные корабли: жизни − 1, не больше 5
	dec	a
	jp	z,.nl
	jp	m,.nl
	cp	6
	jp	c,.l5
	ld	a,5
.l5:	ld	b,a
	ld	hl,HUD_CH+3
.ls:	ld	(hl),HUD_SHIP
	inc	hl
	dec	b
	jp	nz,.ls
.nl:	ld	hl,0x3f24	; очки
	ld	de,HUD_CH+9
	call	hud_numz
	ld	hl,0x3f21	; рекорд
	ld	de,HUD_CH+17
	call	hud_numz
	ld	a,(AREA)	; зона 01–08 (две цифры, как очки)
	inc	a
	ld	b,0
	cp	10
	jp	c,.a1
	sub	10
	ld	b,1
.a1:	ld	(HUD_CH+29),a
	ld	a,b
	ld	(HUD_CH+28),a
	ld	hl,HUD_CH	; записи: код | dirty(80h), столбец, адрес знака
	ld	de,HUD_REC
	ld	bc,HUD_COLT
.rw:	ld	a,(bc)		; нулевые столбцы всегда пусты
	or	a
	jp	z,.z
	ld	a,(de)		; запись хранит прежний код знака, бит 7 — перерисовать
	cp	(hl)
	jp	z,.same
	ld	a,(hl)
	or	0x80
	ld	(de),a
	inc	de
	ld	a,(bc)
	ld	(de),a
	inc	de
	push	hl
	ld	a,(hl)
	push	de
	call	font_adr
	pop	de
	ld	a,l
	ld	(de),a
	inc	de
	ld	a,h
	ld	(de),a
	inc	de
	pop	hl
	jp	.nx
.z:	ld	a,HUD_SP
	ld	(de),a
.same:	inc	de
	inc	de
	inc	de
	inc	de
.nx:	inc	hl
	inc	bc
	ld	a,c
	cp	(HUD_COLT + HUD_W) & 0xff
	jp	nz,.rw
	or	1		; NZ — изменилось
	ret

