; Удерживается только первый спрайт очереди: его фон всегда первый в POOL.
; Остальные восстанавливаются с конца DLIST, затем пишутся после этого фона.
; Никакой копии POOL и нового буфера нет. При сбросе .bound первая запись
; снова стирается обычным erase_rec: исчезновение/взрыв не оставляют следа.
;
; Два последовательных изолированных повтора перед первым пропуском.
; Зона кандидата заведомо целая, далеко от верхней строки и нижней полосы.
; Все остальные команды должны быть SPR и не пересекать расширенный прямоугольник:
; |dX| >= 24 полупикселя ИЛИ |dY| >= 22 строки (кольцевые разности).
; Границы dy/dx/h/w проверяет генератор vecsprites.js; учитываются и прозрачные
; части байтов, поскольку восстановление фона пишет прямоугольник целиком.
static_prepare:
.old:
	ld	a,0
	ld	(.prev+1),a
	xor	a
	ld	(.old+1),a
	ld	a,(flush)
	cp	0x21
	call	nz,static_restore
	; Актуальный clip_base проверит flush ПОСЛЕ scroll_upd/pend_def.
	ld	a,(QUEUE)
	cp	OP_SPR
	ret	nz
	; Корабль/прицел стоят раньше STATIC_MIN_IMG (первая tabobj 8600h) в таблице
	; генератора и обычно двигаются вместе с камерой. Не тратить на них ключ.
	ld	a,(QUEUE+4)
	cp	STATIC_MIN_IMG >> 8
	ret	c
	; При уже опоздавшем сдвиге scroll_upd поставит clip_base=17:
	; нет смысла считать ключ и перекрытия, которые flush всё равно отвергнет.
	ld	a,(vframes)
	cp	VFRAMES_PER_UPD
	jp	c,.time
	ld	a,(CAM_Y)
	ld	b,a
	ld	a,0xef
	sub	b
	ld	hl,vs_cur
	cp	(hl)
	ret	nz
.time:
	ld	hl,(qptr)
	ld	a,l
	cp	QUEUE & 0xff
	ret	z
	ld	a,(QUEUE+1)
	sub	4
	cp	108
	ret	nc
	ld	a,(CAM_Y)
	ld	b,a
	ld	a,(QUEUE+2)
	sub	b
	sub	24
	cp	184
	ret	nc
	; Ключ обновляется даже при несовпадении, но такой спрайт пока не удерживаем.
	ld	hl,(static_key)
	ex	de,hl
	ld	hl,(QUEUE+1)
	ld	(static_key),hl
	ld	a,h
	xor	d
	ld	b,a
	ld	a,l
	xor	e
	or	b
	ld	b,a
	ld	hl,(static_key+2)
	ex	de,hl
	ld	hl,(QUEUE+3)
	ld	(static_key+2),hl
	ld	a,h
	xor	d
	or	b
	ld	b,a
	ld	a,l
	xor	e
	or	b
	ret	nz
	; XOR-надписи могут затронуть цель, даже без команды в QUEUE.
	ld	hl,(msg_new+2)
	ld	a,h
	ld	hl,(msg_new+6)
	or	h
	ld	hl,(msg_old+2)
	or	h
	ld	hl,(msg_old+6)
	or	h
	ret	nz
	ld	a,(qptr)
	ld	(.end+1),a
	ld	a,(QUEUE+1)
	sub	24
	ld	(.x+1),a
	ld	a,(QUEUE+2)
	sub	22
	ld	(.y+1),a
	ld	de,4
	ld	hl,QUEUE+5
.scan:
	ld	a,l
.end:
	cp	0
	jp	z,.safe
	ld	a,(hl)
	cp	OP_SPR
	ret	nz		; тайл, отметка или фон: полный вывод
	inc	hl
	ld	a,(hl)
.x:
	sub	0
	cp	48
	jp	nc,.next
	inc	hl
	ld	a,(hl)
.y:
	sub	0
	cp	44
	ret	c
	dec	hl
.next:
	add	hl,de
	jp	.scan
.safe:
	ld	a,1
	ld	(.old+1),a
	; Проверяется и первый изолированный вывод: если ожидание опоздает,
	; clip_base=17 не должен стать допустимым «прошлым» на следующем шаге.
	ld	hl,static_check
	ld	(flush+1),hl
	ld	a,0xcd		; CALL вместо LXI H
	ld	(flush),a
.prev:
	ld	a,0
	or	a
	ret	z
	ld	a,(dl_ptr)
	cp	(DLIST+2) & 0xff
	ret	z		; нужен указатель начала второй записи (конец первой)
	ld	a,(DLIST+1)
	cp	POOL >> 8
	ret	nz
	ld	a,(DLIST)
	cp	POOL & 0xff
	ret	nz
	ld	a,0 + ((DLIST+2) & 0xff)
	ld	(flush.bound+1),a
	ld	hl,DLIST+2
	ld	(flush.reset+1),hl
	ld	a,0x2a		; LHLD вместо LXI H
	ld	(flush.reset),a
	ld	hl,QUEUE+5
	ld	(flush.start+1),hl
	ret
static_key:
	ds	4

; В обычном flush нет ветвлений удержания. Самомодифицируемые входы
; восстанавливаются один раз после удержания; прерывание flush не вызывает.
static_restore:
	ld	a,DLIST & 0xff
	ld	(flush.bound+1),a
	ld	hl,POOL
	ld	(flush.reset+1),hl
	ld	a,0x21
	ld	(flush.reset),a
	ld	hl,QUEUE
	ld	(flush.start+1),hl
	ld	hl,msg_old
	ld	(flush+1),hl
	ld	(flush),a
	ret

; scroll_upd мог поставить clip_base=17 уже после подготовки. Возврат
; обязательно с HL=msg_old, как после первоначального LXI в начале flush.
static_check:
	ld	a,(clip_base)
	cp	16
	jp	z,.ok
	call	static_restore
	xor	a
	ld	(static_prepare.old+1),a
.ok:	ld	hl,msg_old
	ret
