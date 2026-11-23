; Непрозрачные надписи под спрайтами. Фон: записи erase_rec
; [столбец C, верх+1, ширина, 9], затем по 9 байтов C и E на знак.
MSG_BUFN equ	8 + 15 * 18
plat_clear_hud:
msg_clear:
	xor	a
	ld	(msg_new+3),a
	ld	(msg_new+7),a
	ld	(msg_old+3),a
	ld	(msg_old+7),a
	jp	msg_clr
	include	"../../build/gen/vec_msg.inc"
MSG_BUF:	ds	MSG_BUFN
