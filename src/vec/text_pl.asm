; Надпись: готовая кромка, две плоскости отдельными проходами.
msg_one:
	ld	b,(hl)
	inc	hl
	ld	c,(hl)
	inc	c
	inc	hl
	ld	e,(hl)
	inc	hl
	ld	d,(hl)
	ld	a,d
	or	a
	ret	z
	ld	hl,(msg_bufp)
	ld	a,b
	add	a,SCR_C
	ld	b,a
	ld	(hl),b
	inc	hl
	ld	(hl),c
	inc	hl
	ld	(hl),0
	push	hl
	inc	hl
	ld	(hl),9
	inc	hl
	ld	(msg_bufp),hl
.chr:
	ld	a,(de)
	cp	0xff
	jp	z,.fin
	inc	de
	push	de
	push	bc
	ld	e,a
	ld	d,0
	ld	hl,MSG_MASKS
	add	hl,de
	ld	e,(hl)
	inc	hl
	ld	d,(hl)
	inc	hl
	push	de
	push	hl
	ld	d,b
	ld	e,c
	push	hl
	ld	hl,(msg_bufp)
	ld	b,h
	ld	c,l
	pop	hl
	call	msg_mask9
	pop	hl
	ld	a,d
	add	a,0x20
	ld	d,a
	ld	a,e
	add	a,9
	ld	e,a
	call	msg_mask9
	ld	h,b
	ld	l,c
	ld	(msg_bufp),hl
	pop	hl
	ld	a,e
	add	a,8
	ld	e,a
	ld	b,7
.ink:
	ld	a,(de)
	or	(hl)
	ld	(de),a
	inc	hl
	dec	e
	dec	b
	jp	nz,.ink
	pop	bc
	inc	b
	pop	de
	pop	hl
	inc	(hl)
	push	hl
	jp	.chr
.fin:
	pop	hl
	ret

msg_mask_tail:
	ld	a,(de)
	ld	(bc),a
	inc	bc
	and	(hl)
	inc	hl
	ld	(de),a
	dec	e
	ld	a,(de)
	ld	(bc),a
	inc	bc
	and	(hl)
	inc	hl
	ld	(de),a
	dec	e
	ld	a,(de)
	ld	(bc),a
	inc	bc
	and	(hl)
	inc	hl
	ld	(de),a
	dec	e
	ld	a,(de)
	ld	(bc),a
	inc	bc
	and	(hl)
	inc	hl
	ld	(de),a
	dec	e
	ld	a,(de)
	ld	(bc),a
	inc	bc
	and	(hl)
	inc	hl
	ld	(de),a
	dec	e
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

; Одноцветный значок: нулевая C-плоскость (эталон панели).
HUD_SHIPC equ HUD_FONT + 7 * HUD_SP
