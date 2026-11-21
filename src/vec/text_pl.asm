; Надписи (src/vec/text.asm): часть перед буфером фона спрайтов
; две записи [столбец, строка, строка (0 — нет)] с HL — XOR
msg_xor:
	ld	a,MSG_PL
	ld	(txt_pl),a
	call	.one
.one:	ld	b,(hl)
	inc	hl
	ld	c,(hl)
	inc	hl
	ld	e,(hl)
	inc	hl
	ld	d,(hl)
	inc	hl
	ld	a,d
	or	a
	ret	z
	push	hl
	ex	de,hl
	call	txt_str
	pop	hl
	ret

; --- надписи на поле: заявка логики (print_text CPC) -> msg_new; flush стирает msg_old, рисует и запоминает новые
; A — X, L — Y (как у спрайтов: столбец X/4, строка памяти 255 − Y), на стеке — строка CPC и атрибут (снимаются)
plat_print_text:
	ld	b,a
	ld	c,l
	pop	hl
	pop	de
	ex	(sp),hl
	ld	a,e
	ld	de,S_PL1
	ld	hl,msg_new
	cp	TXT_READY1 & 0xff
	jp	z,.st
	ld	de,S_OVER
	cp	TXT_OVER & 0xff
	jp	z,.st
	ld	de,S_RDY
	ld	hl,msg_new + 4
.st:	ld	a,b
	rrca
	rrca
	and	0x3f
	ld	(hl),a
	inc	hl
	ld	a,c
	cpl
	add	a,MSG_DY
	ld	(hl),a
	inc	hl
	ld	(hl),e
	inc	hl
	ld	(hl),d
	ret

; строка HL (до 0FFh) с столбца B, верх — строка памяти C; байт F0h–F3h — цвет дальше (txt_pl = младшие 2 бита:
; на титуле 1 — синий, 2 — белый, 3 — красный), столбец не сдвигает
txt_str:
	ld	a,(hl)
	inc	a
	ret	z
	cp	0xf1
	jp	c,.ch
	dec	a
	and	3
	ld	(txt_pl),a
	inc	hl
	jp	txt_str
.ch:	push	hl
	push	bc
	call	txt_chr
	pop	bc
	pop	hl
	inc	hl
	inc	b
	jp	txt_str

; 6 цифр BCD (HL, 3 байта) -> знаки DE..DE+5, ведущие нули — пробелы (последняя цифра — всегда)
hud_numz:			; то же с ведущими нулями (панель)
	ld	a,1
	jp	hud_n
hud_num:
	xor	a
hud_n:	ld	c,a		; 0 — значащая цифра ещё не встретилась (ведущие нули — пробелы)
	ld	b,3
.b:	ld	a,(hl)
	rrca
	rrca
	rrca
	rrca
	call	.d
	ld	a,b
	cp	1
	jp	nz,.nl
	ld	c,1		; последняя цифра выводится всегда
.nl:	ld	a,(hl)
	call	.d
	inc	hl
	dec	b
	jp	nz,.b
	ret
.d:	and	15
	jp	nz,.on
	or	c
	jp	nz,.on0
	ld	a,HUD_SP
	ld	(de),a
	inc	de
	ret
.on0:	xor	a
.on:	ld	(de),a
	inc	de
	ld	c,1
	ret

; панель: вторая плоскость (C) знакомест 0–4 — кабина и крылья корабликов (или пусто). Из hud_draw: H — столбец
; плоскости E, C — строка памяти верха, DE — последний байт нарисованного знака (B, C сохраняются; HL портится)
hud_ship2:
	ld	a,e
	cp	(HUD_FONT + 7 * HUD_SHIP + 6) & 0xff
	ld	de,HUD_FONT + 7 * HUD_SP
	jp	nz,.s
	ld	de,HUD_SHIPC
.s:	ld	a,h
	sub	0x20
	ld	h,a
	ld	l,c
; Семь строк без счётчика: hud_draw сразу восстанавливает HL из стека.
	ld	a,(de)
	ld	(hl),a
	inc	de
	dec	l
	ld	a,(de)
	ld	(hl),a
	inc	de
	dec	l
	ld	a,(de)
	ld	(hl),a
	inc	de
	dec	l
	ld	a,(de)
	ld	(hl),a
	inc	de
	dec	l
	ld	a,(de)
	ld	(hl),a
	inc	de
	dec	l
	ld	a,(de)
	ld	(hl),a
	inc	de
	dec	l
	ld	a,(de)
	ld	(hl),a
	dec	l
	ld	(hl),0
	ret
HUD_SHIPC:	db	0x00,0x00,0x18,0x18,0x42,0x66,0x42	; кабина и крылья кораблика (свой рисунок)
