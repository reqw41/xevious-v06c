; Надписи (src/vec/text.asm): часть в окне карты
; знак A -> HL — его 7 байт: ASCII-буква, ASCII-цифра или пробел, код 0–9 (цифра), 10 (пробел), 11 (корабль)
font_adr:
	ld	de,LETTERS - 7 * 0x41
	cp	0x41
	jp	nc,.m
	cp	0x30		; ASCII-цифра -> 0–9
	jp	c,.c
	sub	0x30
.c:	cp	0x20		; пробел -> 10; коды меньше 20h — как есть
	jp	nz,.d
	ld	a,10
.d:	ld	de,HUD_FONT
.m:	push	bc		; HL = DE + 7·знак
	ld	c,a
	ld	b,0
	ld	h,b
	ld	l,c
	add	hl,hl
	add	hl,hl
	add	hl,hl
	add	hl,de
	ld	a,l
	sub	c
	ld	l,a
	ld	a,h
	sbc	a,b
	ld	h,a
	pop	bc
	ret

