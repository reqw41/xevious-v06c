; Восстановление использует развёрнутый штатный erase_rec.
msg_restore:
	ld	hl,MSG_BUF
.rec:
	ex	de,hl
	ld	hl,(msg_bufp)
	ld	a,l
	cp	e
	jp	nz,.go
	ld	a,h
	cp	d
	jp	z,msg_clr
.go:
	ex	de,hl
	call	erase_rec
	ex	de,hl
	jp	.rec
; Девять строк: HL — маски, DE — экран, BC — сохранение фона.
; Первые четыре здесь; последние пять перед POOL, чтобы уложиться в окна.
msg_mask9:
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
	jp	msg_mask_tail
