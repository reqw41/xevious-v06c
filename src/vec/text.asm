; Надписи своим шрифтом 6×7 (цифры и пробел — HUD_FONT, буквы — LETTERS): рекорд на титуле. Знак рисуется XOR
; в плоскостях txt_pl (бит 0 — C000h, бит 1 — E000h); на поле надпись так же и стирается (рисуется последней в flush, стирается первой — под ней спрайты целы).

; знак (HL) в столбец B, верх — строка памяти C, XOR в плоскостях txt_pl
txt_chr:
	ld	a,(hl)
	call	font_adr
	ex	de,hl		; DE — точки
	ld	a,(txt_pl)
	rrca
	push	af
	ld	a,SCR_C
	call	c,.pl
	pop	af
	rrca
	ret	nc
	ld	a,SCR_C + 0x20
.pl:	add	a,b
	ld	h,a
	ld	l,c
	push	de
	push	bc		; B — столбец: нужен второй плоскости
	ld	b,7
.lr:	ld	a,(de)
	xor	(hl)
	ld	(hl),a
	inc	de
	dec	l
	dec	b
	jp	nz,.lr
	pop	bc
	pop	de
	ret

; мелодия: HL — модуль CPC (4B00h — заставка жизни; 4C00h — конец игры, играла при вводе имени — убрана): всё стоп,
; затем мелодия
plat_music_start:
	push	af
	push	bc
	push	de
	push	hl
	ld	a,1
	ld	(snd_qstop),a
	ld	a,h
	cp	0x4b
	jp	nz,snd_ret
	ld	hl,SND_START_A
	ld	(snd_qm),hl
	ld	hl,SND_START_B
	ld	(snd_qm+2),hl
	ld	hl,SND_START_C
	ld	(snd_qm+4),hl
	jp	snd_ret

