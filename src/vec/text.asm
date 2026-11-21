; Надписи своим шрифтом 6×7 (цифры и пробел — HUD_FONT, буквы — LETTERS): на поле (PLAYER ONE / READY, GAME OVER),
; таблица рекордов на титуле, ввод имени. Знак рисуется XOR в плоскостях txt_pl (бит 0 — C000h, бит 1 — E000h):
; на поле надпись так же и стирается (рисуется последней в flush, стирается первой — под ней спрайты целы).

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

; --- ввод имени (как CPC 3647h): A — место 0–4 (запись уже вставлена, имя — пробелы). Титул с таблицей, музыка
; конца игры; вверх/вниз — буква, вправо — следующая, влево — назад, огонь — конец
plat_name_entry:
	ld	(tab_cur),a
	push	af
	ld	hl,0x4c00
	call	plat_music_start
	ld	hl,SND_MODE
	inc	(hl)
	call	vec_reset
	call	title_pic
	call	tab_screen
	pop	af
	add	a,a
	add	a,a
	add	a,a
	add	a,a
	ld	e,a
	ld	d,0
	ld	hl,HI_TAB - 16 * 4 + 3	; имя записи 1-го места
	add	hl,de
	ld	b,0		; позиция 0–7
	ld	c,'A'
.lp:	ld	(hl),c
	push	hl
	push	bc
	call	tab_cur_row	; строку ввода — заново
.rl:	call	frame_in	; отпустить всё
	or	a
	jp	nz,.rl
.k:	call	frame_in
	or	a
	jp	z,.k
	pop	bc
	pop	hl
	ld	e,a
	ld	a,(SM_3019)	; вверх — следующая буква
	and	e
	jp	z,.n1
	inc	c
.n1:	ld	a,(SM_3025)	; вниз — предыдущая
	and	e
	jp	z,.n2
	dec	c
.n2:	ld	a,c
	cp	'A'
	jp	nc,.n3
	ld	c,'Z'
.n3:	cp	'Z' + 1
	jp	c,.n4
	ld	c,'A'
.n4:	ld	a,(SM_2FFF)	; вправо — буква принята, дальше
	and	e
	jp	z,.n5
	ld	a,b
	cp	7
	jp	z,.n5
	ld	(hl),c
	inc	hl
	inc	b
.n5:	ld	a,(SM_2FF0)	; влево — назад
	and	e
	jp	z,.n6
	ld	a,b
	or	a
	jp	z,.n6
	ld	(hl),' '
	dec	hl
	dec	b
	ld	c,(hl)
.n6:	ld	a,(SM_3039)	; огонь — конец
	and	e
	jp	z,.lp
	ld	(hl),c
	inc	hl
	ld	(hl),0
	ld	hl,1		; как CPC: музыка — до следующего кадра
	ld	(SND_TIMER),hl
	ld	a,0xff
	ld	(tab_cur),a
	ret

; мелодия: HL — модуль CPC (4B00h — заставка жизни, 4C00h — конец игры): всё стоп, затем мелодия
plat_music_start:
	push	af
	push	bc
	push	de
	push	hl
	ld	a,1
	ld	(snd_qstop),a
	ld	a,h
	cp	0x4c
	jp	z,.o
	cp	0x4b
	jp	nz,snd_ret
	ld	hl,SND_START_A
	ld	(snd_qm),hl
	ld	hl,SND_START_B
	ld	(snd_qm+2),hl
	ld	hl,SND_START_C
	ld	(snd_qm+4),hl
	jp	snd_ret
.o:	ld	hl,SND_OVER_A
	ld	(snd_qm),hl
	ld	hl,SND_OVER_B
	ld	(snd_qm+2),hl
	ld	hl,SND_OVER_C
	ld	(snd_qm+4),hl
	jp	snd_ret

