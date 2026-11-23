; Надписи (src/vec/text.asm): часть в 3C00h
; конец flush: новые надписи -> показанные, сохранить фон и нарисовать
msg_flip:
	ld	hl,msg_new
	ld	de,msg_old
	ld	b,8
.c:	ld	a,(hl)
	ld	(de),a
	ld	(hl),0
	inc	hl
	inc	de
	dec	b
	jp	nz,.c
	ld	hl,msg_old
	call	msg_one
	ld	hl,msg_old+4
	jp	msg_one

; кадр: дождаться прерывания (ввод опрашивается каждый кадр: vframes = 0) -> A — ввод игры (3D42h)
frame_in:
	xor	a
	ld	(vframes),a
.f:	ld	a,(vframes)
	or	a
	jp	z,.f
	ld	a,(0x3d42)
	ret

