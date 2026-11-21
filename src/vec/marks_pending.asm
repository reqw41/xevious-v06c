; Восемь слотов целей, до двух полубайтов верхней строки на слот. Дополнительная
; mark_a при GY=9 затрагивает dy=7; mark_dead того же слота имеет dy=6/8/10,
; поэтому в этой строке второй отметки от него нет. Максимум 16 пар.
; Прерывание буфер не трогает.
mk_end:	db	MK_BUF & 0xff
MK_BUF:	ds	16*2
MK_BUF_END:
	assert	1 - (((MK_BUF_END - 1) >> 8) - (MK_BUF >> 8)), "буфер отметок через страницу"

; После pend_line: верхняя строка и её постоянные тайлы уже готовы.
mark_pending:
	ld	a,(pl_y)
	ld	(mk_y),a
	ld	hl,MK_BUF
.l:	ld	a,(mk_end)
	cp	l
	jp	z,.done
	ld	b,(hl)
	inc	hl
	ld	c,(hl)
	inc	hl
	push	hl
	call	mark_put
	pop	hl
	jp	.l
.done:	ld	a,MK_BUF & 0xff
	ld	(mk_end),a
	ret
