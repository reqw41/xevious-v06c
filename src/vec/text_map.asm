; Надписи (src/vec/text.asm): часть в окне карты
; знак A -> HL — его 7 байт: код 0–9 (цифра), 10 (пробел), 11 (корабль), 12 (знак рекорда), 13.. — буква (CH_x)
font_adr:
	ld	de,HUD_FONT
	cp	13
	jp	c,.m
	ld	de,LETTERS - 7 * 13
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

