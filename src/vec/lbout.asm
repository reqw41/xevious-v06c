; (прерывание, сразу после новой прокрутки) опоздавшая верхняя строка: тайлы, наложение; строка, ушедшая в
; полосу, — в чёрное; панель. См. src/vec/lbline.asm.
lb_out:	ld	a,(ol_row)
	ld	e,a
	ld	a,(ol_off)
	ld	b,a
	call	TOPL_RUN
	ld	hl,OV_PRIV
	call	ovl_line
	ld	a,(lb_q)
	ld	l,a
	ld	h,SCR_C
	xor	a
.z:	ld	(hl),a
	inc	h
	ld	(hl),a
	inc	h
	jp	nz,.z
	ld	(lb_pend),a
	ld	a,1
	ld	(hud_req),a
	jp	hud_draw
