; Логика Xevious на i8080 — перенос JS-модели src/model/ (docs/I8080.md). Сборка: node tools/i80build.js
	include "layout.asm"

	org	0x100
	include "core.asm"
	include "player.asm"
	include "shots.asm"
	include "map.asm"
	include "ground.asm"
	include "bullets.asm"
	include "tabobj.asm"
	include "sparks.asm"
	include "air.asm"
	include "zspecial.asm"
	include "flow.asm"
	include "mainloop.asm"
	include "life.asm"

; map_ptr: HL — адрес окна CPC 4000h..5FFFh (слой тайлов) -> HL — байт в памяти i8080; BC, DE сохраняются.
; Здесь карта лежит целиком; на Векторе — сжатые строки и распаковка (src/vec/platform.asm)
map_ptr:
	push	de
	ld	de,MAPOFS
	add	hl,de
	pop	de
	ret

	include "../../build/gen/plat_stub.inc"
	include "../../build/gen/cpc_tables.inc"
	include "../../build/gen/ovl.inc"
OVL_SET:	ds	OVL_NSET*3	; изменённые клетки наложения: адрес (0 — пусто), код
OVL_SET_END:
SCRATCH:	ds	64		; рабочие байты (не состояние игры)
SCRATCH_END:
