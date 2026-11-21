; Звук на ВИ53 (docs/SOUND.md): серии build/gen/vec_sound.inc (tools/vecsound.js) — сразу делители ВИ53,
; пересчёта в коде нет. Каналы AY A, B, C -> счётчики 0, 1, 2 (данные — порты 0Bh, 0Ah, 09h, управление — 08h:
; тон — режим 3, тишина — режим 0). На канале два потока — музыка и эффект; эффект перекрывает музыку, музыка
; под ним идёт дальше (как у проигрывателя CPC). Шаг — раз в кадр из прерывания (isr_sound).
; Поток: [указатель (2), осталось кадров, шум (бит 7; бит 6 — после серии кадр тишины), делитель (2)]; запись канала: музыка, эффект, выведенное (2).
SND_REC	equ	14

; Запуск из основного кода — заявкой (адрес одной записью LD (nn),HL: прерывание не увидит половину адреса;
; запрещать прерывания нельзя — на Векторе так теряется кадровое), поток заводит snd_frame.

; эффект игры: D — канал (0 A, 1 B, 2 C), L — номер 1–6 (ослабление H и нота E у игры постоянны для номера)
plat_sfx:
	push	af
	push	bc
	push	de
	push	hl
	ld	a,l
	dec	a
	cp	6
	jp	nc,snd_ret
	add	a,a
	ld	c,a
	ld	b,0
	ld	hl,SND_FX_TAB
	add	hl,bc
	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a		; HL — серии эффекта
	ld	a,d
	or	a
	jp	z,.a
	dec	a
	jp	z,.b
	ld	(snd_qe+4),hl
	jp	snd_ret
.b:	ld	(snd_qe+2),hl
	jp	snd_ret
.a:	ld	(snd_qe),hl
snd_ret:
	ld	a,1		; есть заявка (прерывание смотрит очереди, только если флаг стоит)
	ld	(snd_qany),a
	pop	hl
	pop	de
	pop	bc
	pop	af
	ret

; заявки -> потоки (в начале шага прерывания; основной код его не прерывает)
snd_queue:
	ld	a,(snd_qany)	; заявок не было — ничего
	or	a
	ret	z
	xor	a
	ld	(snd_qany),a
	ld	a,(snd_qstop)
	or	a
	jp	z,.q
	xor	a
	ld	(snd_qstop),a
	call	snd_stop
.q:	ld	hl,snd_qm
	ld	de,snd_rec0
	call	.one
	ld	hl,snd_qm+2
	ld	de,snd_rec0+SND_REC
	call	.one
	ld	hl,snd_qm+4
	ld	de,snd_rec0+2*SND_REC
	call	.one
	ld	hl,snd_qe
	ld	de,snd_rec0+6
	call	.one
	ld	hl,snd_qe+2
	ld	de,snd_rec0+SND_REC+6
	call	.one
	ld	hl,snd_qe+4
	ld	de,snd_rec0+2*SND_REC+6
.one:	ld	a,(hl)		; HL — заявка, DE — поток
	inc	hl
	ld	b,(hl)
	or	b
	ret	z
	ld	(hl),0
	dec	hl
	ld	c,(hl)
	ld	(hl),0
	ex	de,hl
	ld	(hl),c
	inc	hl
	ld	(hl),b
	inc	hl
	ld	(hl),1
	ret

; поток HL <- серии DE, с первого кадра
snd_go:	ld	(hl),e
	inc	hl
	ld	(hl),d
	inc	hl
	ld	(hl),1
	ret

; остановить все потоки (музыку и эффекты)
snd_stop:
	ld	hl,snd_rec0
	ld	b,3
.l:	xor	a
	ld	(hl),a
	inc	hl
	ld	(hl),a
	inc	hl
	inc	hl
	inc	hl
	inc	hl
	inc	hl
	ld	(hl),a
	inc	hl
	ld	(hl),a
	ld	de,SND_REC-7
	add	hl,de
	dec	b
	jp	nz,.l
	ret

; конец заставки жизни (режим 2 -> 1 по счётчику, isr_sound): как CPC — всё стоп; режим не FFh — фоновая петля
snd_game:
	call	snd_stop
	ld	a,(SND_MODE)
	inc	a
	ret	z
	ld	hl,snd_rec0
	ld	de,SND_GAME_A
	jp	snd_go

; шаг раз в кадр (из прерывания)
snd_frame:
	call	snd_queue
	ld	a,(SND_MODE)
	or	a
	jp	z,snd_mute
	ld	hl,snd_rec0
	ld	c,0
	call	snd_ch
	ld	hl,snd_rec0+SND_REC
	ld	c,1
	call	snd_ch
	ld	hl,snd_rec0+2*SND_REC
	ld	c,2
	jp	snd_ch
snd_mute:
	ld	hl,0		; режим 0 — тишина на всех каналах
	ld	c,0
	ld	de,snd_rec0+12
	call	snd_out
	ld	hl,0
	ld	c,1
	ld	de,snd_rec0+SND_REC+12
	call	snd_out
	ld	hl,0
	ld	c,2
	ld	de,snd_rec0+2*SND_REC+12
	jp	snd_out

; канал C, запись HL: шаг музыки и эффекта, вывод (номер канала — в snd_c: snd_step портит C)
snd_ch:	ld	a,c
	ld	(snd_c),a
	push	hl
	call	snd_step	; музыка
	ld	hl,0
	ld	b,0
	jp	z,.m
	ex	de,hl
	ld	b,a
.m:	ld	(snd_v),hl
	ld	a,b
	ld	(snd_vz),a
	pop	hl
	push	hl
	ld	de,6
	add	hl,de
	call	snd_step	; эффект — поверх
	jp	z,.e
	ex	de,hl
	ld	(snd_v),hl
	ld	(snd_vz),a
.e:	ld	hl,(snd_v)
	ld	a,(snd_vz)
	or	a
	jp	z,.o
	ld	a,(snd_rnd)	; шум: случайное (x := 5x + 1)
	ld	b,a
	add	a,a
	add	a,a
	add	a,b
	inc	a
	ld	(snd_rnd),a
	ld	b,a
	ld	a,h		; делитель 1 — только шум: случайный 0100h..0FFFh
	or	a
	jp	nz,.tn
	ld	a,b
	and	0x0f
	or	1
	ld	h,a
	ld	l,b
	jp	.o
.tn:	ld	a,l		; тон с шумом: младший байт дрожит
	xor	b
	ld	l,a
.o:	pop	de
	push	hl
	ld	hl,12
	add	hl,de
	ex	de,hl		; DE — выведенное
	pop	hl
	ld	a,(snd_c)
	ld	c,a
	jp	snd_out

; поток HL: шаг на кадр. Z — потока нет; иначе A — шум (80h/0), DE — делитель (0 — тишина)
snd_step:
	ld	e,(hl)
	inc	hl
	ld	d,(hl)
	ld	a,d
	or	e
	ret	z
	inc	hl
	dec	(hl)
	jp	nz,.cur
	inc	hl		; серия кончилась: флаг «ещё кадр тишины» (бит 6 байта шума)
	ld	a,(hl)
	and	0x40
	jp	z,.ng
	xor	a
	ld	(hl),a		; шума нет, делитель 0, кадр 1
	inc	hl
	ld	(hl),a
	inc	hl
	ld	(hl),a
	dec	hl
	dec	hl
	dec	hl
	inc	(hl)
	jp	.cur
.ng:	dec	hl
	push	hl		; адрес счётчика
.rd:	ld	a,(de)
	inc	de
	or	a
	jp	nz,.run
	ld	a,(de)		; конец: продолжение (петля) или 0
	ld	c,a
	inc	de
	ld	a,(de)
	ld	d,a
	ld	e,c
	or	c
	jp	nz,.rd
	pop	hl		; потока больше нет
	dec	hl
	ld	(hl),a
	dec	hl
	ld	(hl),a
	ret
.run:	pop	hl
	ld	b,a
	and	0x3f
	ld	(hl),a		; кадров
	ld	a,b
	and	0xc0
	inc	hl
	ld	(hl),a		; шум
	inc	hl
	ld	a,(de)
	ld	(hl),a
	inc	de
	inc	hl
	ld	a,(de)
	ld	(hl),a
	inc	de
	dec	hl
	dec	hl
	dec	hl
	dec	hl
	dec	hl
	ld	(hl),e		; указатель — на следующую серию
	inc	hl
	ld	(hl),d
	inc	hl
.cur:	inc	hl		; шум, делитель
	ld	a,(hl)
	and	0x80
	inc	hl
	ld	e,(hl)
	inc	hl
	ld	d,(hl)
	ld	b,a
	or	1		; NZ — поток есть
	ld	a,b
	ret

; вывод в счётчик C: HL — делитель (0 — тишина), DE — выведенное прошлым кадром; пишется только при изменении
snd_out:
	ex	de,hl
	ld	a,(hl)
	cp	e
	jp	nz,.ch
	inc	hl
	ld	a,(hl)
	cp	d
	ret	z
	dec	hl
.ch:	ld	b,(hl)		; прошлое: 0 — счётчик молчал (нужно управляющее слово)
	inc	hl
	ld	a,(hl)
	or	b
	ld	b,a
	ld	(hl),d
	dec	hl
	ld	(hl),e
	ld	a,d
	or	e
	jp	z,.off
	ld	a,c
	or	a
	jp	z,.c0
	dec	a
	jp	z,.c1
	ld	a,b		; счётчик 2
	or	a
	ld	a,0xb6
	jp	nz,.d2
	out	(0x08),a
.d2:	ld	a,e
	out	(0x09),a
	ld	a,d
	out	(0x09),a
	ret
.c1:	ld	a,b
	or	a
	ld	a,0x76
	jp	nz,.d1
	out	(0x08),a
.d1:	ld	a,e
	out	(0x0a),a
	ld	a,d
	out	(0x0a),a
	ret
.c0:	ld	a,b
	or	a
	ld	a,0x36
	jp	nz,.d0
	out	(0x08),a
.d0:	ld	a,e
	out	(0x0b),a
	ld	a,d
	out	(0x0b),a
	ret
.off:	ld	a,c		; тишина: режим 0 (выход в 0 до счёта)
	rrca
	rrca
	or	0x30
	out	(0x08),a
	ret

snd_rnd:	db	0x5a
snd_c:		db	0
snd_vz:		db	0
snd_v:		dw	0
snd_rec0:	ds	3*SND_REC
snd_qm:		dw	0,0,0		; заявки: музыка A, B, C
snd_qe:		dw	0,0,0		; эффекты A, B, C
snd_qstop:	db	0
snd_qany:	db	0		; 1 — в очередях есть заявка
