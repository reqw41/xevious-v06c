; (прерывание, сразу после новой прокрутки) опоздавшая верхняя строка: тайлы, наложение; строка, ушедшая в
; полосу, чистит band_clear после стирания спрайтов; панель. См. src/vec/lbline.asm.
lb_out:	ld	a,(ol_row)
	ld	e,a
	ld	a,(ol_off)
	ld	b,a
	call	TOPL_RUN
	ld	hl,OV_PRIV
	call	ovl_line
	xor	a
	ld	(lb_pend),a
	ld	a,1
	ld	(hud_req),a
	jp	hud_draw
