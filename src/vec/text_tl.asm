; Надписи (src/vec/text.asm): строки надписей на поле — за тайлами (до таблицы 8A00h)
S_PL1:	db	"PLAYER ONE",0xff
S_RDY:	db	"READY",0xff
S_OVER:	db	"GAME OVER",0xff

; загрузочный экран CPC (xeviload.scr) при старте: лежит сжатым в конце экрана (TLOAD_Z, в образе), распаковка на
; месте при чёрной палитре; 3 с или огонь, затем титул. title_skip — без него (стенд)
tload_show:
	ld	a,(title_skip)
	or	a
	ret	nz
	call	pal_black
	ld	a,0xff
	ld	(vscroll),a
	ld	hl,TLOAD_Z
	ld	de,0xc000
	call	lz_unpack
	xor	a		; последние 3 байта экрана — там был конец потока
	ld	(0xfffd),a
	ld	(0xfffe),a
	ld	(0xffff),a
	ld	hl,TLOAD_PAL
	call	pal_set
	ld	b,150
.w:	push	bc
	call	frame_in
	pop	bc
	ld	hl,SM_3041	; огонь — дальше
	and	(hl)
	ret	nz
	dec	b
	jp	nz,.w
	ret
