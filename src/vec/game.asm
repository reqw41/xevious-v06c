; Xevious для Вектора-06Ц: логика (src/i80, перенос JS-модели) + платформа (src/vec). Сборка: node tools/vecbuild.js
	include "vlayout.asm"

	org	0x100
	jp	start
	include "../i80/core.asm"
	include "../i80/player.asm"
	include "../i80/shots.asm"
	include "../i80/map.asm"
	include "../i80/ground.asm"
	include "../i80/bullets.asm"
	include "../i80/tabobj.asm"
	include "../i80/sparks.asm"
	include "../i80/air.asm"
	include "../i80/zspecial.asm"
	include "../i80/flow.asm"
	include "../i80/mainloop.asm"
	include "../i80/life.asm"
	include "platform.asm"
	include "sprites.asm"
	include "static.asm"
	include "text.asm"
	include "lbout.asm"
	include "title.asm"
	include "pause.asm"
	include "marks.asm"
	include "../../build/gen/vec_marks.inc"
	include "hud_draw.asm"
hud_req:	db	0		; переменные панели (src/vec/hud.asm)
hud_vs:		db	0		; прокрутка, при которой панель нарисована
hud_last:	ds	8,0xff
HUD_CH:		ds	30
HUD_REC:	ds	30*4,0xff
	include "../../build/gen/vec_unroll.inc"
	include "../../build/gen/plat_vec_stub.inc"
	include "../../build/gen/cpc_tables.inc"
	include "../../build/gen/ovl.inc"
	include "../../build/gen/vec_pal.inc"
OVL_SET:	ds	OVL_NSET*3
OVL_SET_END:
SCRATCH:	ds	64
SCRATCH_END:
	include "../../build/gen/init_state.inc"
	include "msgfast_lo.asm"
msgfast_end:
	assert	1 - (((0x3c00 - msgfast_end) >> 15) & 1), "код залез на переменные"
	org	0x3c00			; свободное в переменных CPC (tools/cpc/initstate.js): 3C00h–3CE8h
	include "font.asm"
	include "text_lo.asm"
lo_end:
	assert	1 - (((0x3ce9 - lo_end) >> 15) & 1), "3C00h: залезли на таблицу рекордов"
	include "../../build/gen/init_vars.inc"
	org	0x3f34			; 3F34h–3FFFh
	include "hud_data.asm"
MSG_DY	equ	0		; надписи на поле: сдвиг строки и плоскости (бит 1 — E000h)
MSG_PL	equ	2
txt_pl:		db	0
msg_new:	ds	8		; надписи на поле [столбец, строка, строка текста] × 2 — эта и прошлая подряд
msg_old:	ds	8
tab_cur:	db	0xff		; строка ввода имени в таблице (0FFh — нет)
TAB_BUF:		ds	24		; строка таблицы рекордов (цвета, место, очки, имя)
; Отложить одну точку верхней строки; HL — пункт отметки. Carry сохраняет путь отсечения.
mark_save:
	push	hl
	inc	hl
	ld	a,(mk_c)
	add	a,(hl)
	ld	b,a
	inc	hl
	ld	c,(hl)
	ld	a,(mk_end)
	ld	l,a
	ld	h,MK_BUF >> 8
	ld	(hl),b
	inc	hl
	ld	(hl),c
	inc	hl
	ld	a,l
	ld	(mk_end),a
	pop	hl
	scf
	ret
msg_clr:
	ld	hl,MSG_BUF
	ld	(msg_bufp),hl
	ret
msg_bufp:	dw	MSG_BUF
hi_end:
	assert	1 - (((0x4000 - hi_end) >> 15) & 1), "3F34h: залезли на окно карты"

	org	MAP
	include "../../build/gen/vec_map.inc"
	include "../../build/gen/vec_ovlt.inc"
	include "mapdraw.asm"
	include "../../build/gen/vec_topl.inc"
	include "hud.asm"
	include "lbline.asm"
	include "text_map.asm"
	include "marks_pending.asm"
	include "andor.asm"
	include "msgbox.asm"
map_end:
	assert	1 - (((TILES_AT - map_end) >> 15) & 1), "карта и наложение залезли на тайлы"
	org	TILES_AT
	include "../../build/gen/vec_tiles.inc"
tiles_end:
	include "text_tl.asm"
hud_end:
	assert	1 - (((TILEMAP_AT - hud_end) >> 15) & 1), "надписи залезли на таблицу тайлов"
	org	TILEMAP_AT
	include "../../build/gen/vec_tilemap.inc"
	org	ROWBUF + 0x20
	include "../../build/gen/vec_sprites.inc"
QUEUE:	ds	QMAX*5
QUEUE_END:
TL_PRIV:	ds	15		; опоздавшая верхняя строка: номера тайлов и коды наложения (src/vec/lbline.asm)
OV_PRIV:	ds	16
	ds	(((($ + DMAX*2 - 1) >> 8) - ($ >> 8)) * ((($ + 255) & 0xff00) - $))	; DLIST — в одной странице
DLIST:	ds	DMAX*2
DLIST_END:
	include "sound.asm"
	include "text_pl.asm"
	include "title_tab.asm"
	include "../../build/gen/vec_sound.inc"
	include "../../build/gen/vec_title.inc"
	assert	1 - (((DLIST_END - 1) >> 8) - (DLIST >> 8)) * (((DLIST_END - 1) >> 8) - (DLIST >> 8)), "DLIST через границу страницы"
POOL:
POOL_END equ	STACK_TOP - 0x60	; стек 96 Б; контроль стека — build/codex/mem/REPORT.md
	assert	1 - (((POOL_END - POOL - 840) >> 15) & 1), "мало места под фон спрайтов (игра занимает до ~840 Б)"
