; bootmus.asm — музыка на заставке загрузчика (tools/vecboot.js кладёт модуль в 8000h, данные — tools/vecmusic.js).
;
; Пока висит заставка, игра ещё сжата, видимы только плоскости C000h–FFFFh (заставка в 4 цвета), а 8000h–BFFFh
; свободны: здесь плеер, сжатый поток и кольцо распаковки B000h–BFFFh. Палитра заставки повторяет 4 цвета на
; все 16 индексов, поэтому содержимое плоскостей 8000h/A000h на экране не видно. После клавиши игра
; распаковывается поверх всего этого.
;
; Поток — регистры AY по кадрам (формат — tools/vecmusic.js). Есть AY — пишем в AY. Нет — регистры идут в тень
; и пересчитываются на ВИ53 (тон) и динамик (шум, барабаны): тот же приём, что в джукбоксе scubadive-i8080
; (src_jukebox/juke_vi53.asm), оттуда и код ВИ53/шума.
;
; Входы (загрузчик): 8000h — mus_init (DI; заполняет кольцо, ставит прерывание), 8003h — mus_wait (вместо
; EI/HALT/DI: до следующего кадра распаковывает поток и стучит шумом, выходит с DI), 8006h — mus_stop (тишина,
; RST 7 снова EI/RET).

RING	equ	0xb0			; кольцо B000h–BFFFh (старший байт)
RINGE	equ	0xc0
FILLHI	equ	6			; распаковывать, пока в кольце меньше 600h Б (+ команда до 321 Б < 2048 - окна)
VI_VTHR	equ	6			; порог громкости тона на ВИ53, из 15
NOISE_VTHR equ	3			; порог громкости шума

	org	0x8000
	jp	mus_init
	jp	mus_wait
	jp	mus_stop

mus_init:
	di
	call	ay_detect
	call	hush
	ld	hl,mus_s0
	ld	(srcp),hl
	ld	hl,mus_s0e
	ld	(srce),hl
	ld	hl,RING << 8
	ld	(wp),hl
	ld	(rp),hl
	xor	a
	ld	(hold),a
	ld	(mflag),a
.pf:	call	fill1			; кольцо — до порога
	jp	nz,.pf
	ld	a,0xc3			; RST 7: JP mus_isr
	ld	(0x38),a
	ld	hl,mus_isr
	ld	(0x39),hl
	ret

mus_stop:
	di
	ld	hl,0xc9fb		; RST 7: EI; RET
	ld	(0x38),hl
hush:	xor	a
	ld	(vi_nact),a
	out	(1),a			; динамик
	ld	hl,vi_last		; ВИ53: забыть делители
	ld	b,6
.z:	ld	(hl),a
	inc	hl
	dec	b
	jp	nz,.z
	ld	a,0x30			; ВИ53: режим 0, выход в ноль
	out	(8),a
	xor	a
	out	(0x0b),a
	out	(0x0b),a
	ld	a,0x70
	out	(8),a
	xor	a
	out	(0x0a),a
	out	(0x0a),a
	ld	a,0xb0
	out	(8),a
	xor	a
	out	(0x09),a
	out	(0x09),a
	ld	a,(has_ay)
	or	a
	ret	z
	ld	b,8			; AY: громкости 8..10 = 0, микшер — всё выключено
.ay:	ld	a,b
	out	(0x15),a
	xor	a
	out	(0x14),a
	inc	b
	ld	a,b
	cp	11
	jp	nz,.ay
	ld	a,7
	out	(0x15),a
	ld	a,0x3f
	out	(0x14),a
	ret

; Проба AY: два узора, читаем оба порта (на железе данные с 15h, в vector06js — с 14h).
ay_detect:
	xor	a
	ld	(has_ay),a
	ld	b,0x55
	call	.try
	ret	nz
	ld	b,0xaa
	call	.try
	ret	nz
	ld	a,1
	ld	(has_ay),a
	ret
.try:	xor	a			; регистр 0 (тон A, его всё равно перепишет первый кадр)
	out	(0x15),a
	ld	a,b
	out	(0x14),a
	in	a,(0x15)
	cp	b
	ret	z
	in	a,(0x14)
	cp	b
	ret

; До следующего кадра: распаковка в кольцо, в простое — шум на динамик (если звучит). Выход с DI.
mus_wait:
	ei
.l:	ld	a,(mflag)
	or	a
	jp	nz,.done
	call	fill1
	jp	nz,.l
	ld	a,(vi_nact)
	or	a
	jp	z,.l
	ld	a,(vi_rnd)
	add	a,a			; LFSR, x^8+x^4+x^3+x^2
	jp	nc,.nb
	xor	0x1d
.nb:	ld	(vi_rnd),a
	and	1
	out	(1),a			; бит 0 порта C ВВ55 — динамик
	jp	.l
.done:	di
	xor	a
	ld	(mflag),a
	ret

; Одна команда LZB в кольцо, если в нём меньше FILLHI·256 Б. NZ — распаковано, Z — кольцо полно.
fill1:	ld	hl,(rp)
	ld	a,(wp)
	sub	l
	ld	a,(wp+1)
	sbc	a,h
	and	0x0f
	cp	FILLHI
	jp	c,.go
	xor	a
	ret
.go:	ld	hl,(srcp)
	ex	de,hl
	ld	hl,(srce)
	ld	a,l
	cp	e
	jp	nz,.tok
	ld	a,h
	cp	d
	jp	nz,.tok
	ld	de,mus_s1		; конец куска — дальше петля
	ld	hl,mus_s1e
	ld	(srce),hl
.tok:	ld	hl,(wp)
	ex	de,hl			; HL — поток, DE — запись
	ld	a,(hl)
	inc	hl
	cp	0x40
	jp	nc,.rep
	inc	a			; t+1 литералов
	ld	b,a
.lit:	ld	a,(hl)
	inc	hl
	ld	(de),a
	inc	e
	jp	nz,.l1
	call	wrapd
.l1:	dec	b
	jp	nz,.lit
	jp	.fin
.rep:	cp	0x80
	jp	nc,.r2
	ld	b,a			; 01llhhhh O: длина l+3, смещение h·256+O+1
	rrca
	rrca
	rrca
	rrca
	and	3
	add	a,3
	ld	(mlen),a
	ld	a,b
	and	15
	ld	b,a
	ld	c,(hl)
	inc	hl
	inc	bc
	xor	a
	jp	.cpy
.r2:	cp	0xc0
	jp	nc,.r3
	and	63			; 10llllll O: длина l+2, смещение O+1
	add	a,2
	ld	(mlen),a
	ld	c,(hl)
	inc	hl
	ld	b,0
	inc	bc
	xor	a
	jp	.cpy
.r3:	and	63			; 11llllll [доп] O0 O1: длина l+3 (+доп), смещение 16 бит
	ld	b,0
	cp	63
	jp	nz,.r4
	add	a,3
	add	a,(hl)
	inc	hl
	jp	nc,.r5
	inc	b
	jp	.r5
.r4:	add	a,3
.r5:	ld	(mlen),a
	ld	a,b
	ld	c,(hl)
	inc	hl
	ld	b,(hl)
	inc	hl
.cpy:	ld	(mlen+1),a		; BC — смещение, mlen — длина
	ld	(srcp),hl
	ld	a,e			; HL = DE − смещение, в кольце
	sub	c
	ld	l,a
	ld	a,d
	sbc	a,b
	cp	RING
	jp	nc,.c0
	add	a,0x10
.c0:	ld	h,a
	push	hl
	ld	hl,(mlen)
	ld	b,h
	ld	c,l
	pop	hl
.cl:	ld	a,(hl)
	ld	(de),a
	inc	l
	jp	nz,.c1
	inc	h
	ld	a,h
	cp	RINGE
	jp	nz,.c1
	ld	h,RING
.c1:	inc	e
	jp	nz,.c2
	call	wrapd
.c2:	dec	bc
	ld	a,b
	or	c
	jp	nz,.cl
	ex	de,hl
	ld	(wp),hl
	or	1
	ret
.fin:	ld	(srcp),hl
	ex	de,hl
	ld	(wp),hl
	or	1
	ret
wrapd:	inc	d
	ld	a,d
	cp	RINGE
	ret	nz
	ld	d,RING
	ret

; Байт из кольца по HL с переходом через конец.
get:	ld	a,(hl)
	inc	l
	ret	nz
	inc	h
	push	af
	ld	a,h
	cp	RINGE
	jp	nz,.g
	ld	h,RING
.g:	pop	af
	ret

; Прерывание: один кадр потока.
mus_isr:
	push	af
	push	bc
	push	de
	push	hl
	ld	a,1
	ld	(mflag),a
	ld	a,(hold)
	or	a
	jp	z,.fr
	dec	a
	ld	(hold),a
	jp	.out
.fr:	ld	hl,(rp)
.nx:	call	get
	ld	e,a
	call	get
	ld	d,a
	and	e
	inc	a
	jp	z,.nx			; FFFFh — граница куска
	ld	a,d
	or	e
	jp	nz,.wr
	call	get			; держать кадры
	dec	a
	ld	(hold),a
	jp	.done
.wr:	ld	c,0
.bit:	and	a
	ld	a,d
	rra
	ld	d,a
	ld	a,e
	rra
	ld	e,a
	jp	nc,.sk
	call	get
	push	hl
	ld	b,0
	ld	hl,psg_regs
	add	hl,bc
	ld	(hl),a
	ld	b,a
	ld	a,(has_ay)
	or	a
	jp	z,.na
	ld	a,c
	out	(0x15),a
	ld	a,b
	out	(0x14),a
.na:	pop	hl
.sk:	inc	c
	ld	a,c
	cp	14
	jp	nz,.bit
.done:	ld	(rp),hl
	ld	a,(has_ay)
	or	a
	call	z,vi_render
.out:	pop	hl
	pop	de
	pop	bc
	pop	af
	ei
	ret

; ---- ВИ53 и динамик по тени регистров (juke_vi53.asm джукбокса scubadive-i8080) ----
; Тон: N = 13,75·P (AY Вектора 1,745 МГц -> ВИ53 1,5 МГц), канал звучит, если тон разрешён и громкость не ниже
; порога (огибающая — «звучит»). Делитель 0 не выдаётся (на MiSTer счётчик с нулём не стартует). Канал
; перепрограммируется только при смене делителя: управляющее слово перезапускает счётчик.
; Шум: флаг vi_nact, сам шум стучит mus_wait в простое.
vi_render:
	xor	a
	call	vi_one
	ld	a,1
	call	vi_one
	ld	a,2
	call	vi_one
; шум: наибольшая громкость среди каналов с разрешённым шумом
	ld	a,(psg_regs+7)
	rrca
	rrca
	rrca
	ld	b,a
	ld	c,0
	ld	d,3
	ld	hl,psg_regs+8
.nl:	ld	a,b
	rrca
	ld	b,a
	jp	c,.nn
	ld	a,(hl)
	and	0x0f
	cp	c
	jp	c,.nn
	ld	c,a
.nn:	inc	hl
	dec	d
	jp	nz,.nl
	ld	a,c
	cp	NOISE_VTHR
	ld	a,0
	jp	c,.ns
	inc	a
.ns:	ld	(vi_nact),a
	or	a
	ret	nz
	out	(1),a
	ret

vi_one:	ld	(vi_c),a
	ld	c,a
	ld	b,0
	ld	hl,psg_regs+8
	add	hl,bc
	ld	a,(hl)
	and	0x1f
	ld	(vi_v),a
	ld	a,(psg_regs+7)		; тон разрешён, когда бит канала = 0
	inc	c
.sh:	dec	c
	jp	z,.sd
	rrca
	jp	.sh
.sd:	and	1
	jp	nz,.mute
	ld	a,(vi_v)
	and	0x10
	jp	nz,.env
	ld	a,(vi_v)
	cp	VI_VTHR
	jp	c,.mute
.env:	ld	a,(vi_c)
	ld	c,a
	ld	hl,psg_regs
	add	hl,bc
	add	hl,bc
	ld	e,(hl)
	inc	hl
	ld	a,(hl)
	and	0x0f
	ld	d,a
	or	e
	jp	z,.mute
	ld	h,d			; N = 13P + P/2 + P/4
	ld	l,e
	add	hl,hl
	add	hl,hl
	push	hl
	add	hl,hl
	pop	bc
	add	hl,bc
	ld	b,d
	ld	c,e
	add	hl,bc
	and	a
	ld	a,d
	rra
	ld	d,a
	ld	a,e
	rra
	ld	e,a
	add	hl,de
	and	a
	ld	a,d
	rra
	ld	d,a
	ld	a,e
	rra
	ld	e,a
	add	hl,de
	ld	a,h
	or	a
	jp	nz,.prog
	ld	a,l
	cp	2
	jp	nc,.prog
	ld	hl,2
	jp	.prog
.mute:	ld	hl,0
.prog:	ex	de,hl			; DE — новый делитель
	ld	a,(vi_c)
	ld	c,a
	ld	b,0
	ld	hl,vi_last
	add	hl,bc
	add	hl,bc
	ld	a,(hl)
	cp	e
	jp	nz,.diff
	inc	hl
	ld	a,(hl)
	cp	d
	ret	z
	dec	hl
.diff:	ld	(hl),e
	inc	hl
	ld	(hl),d
	ld	hl,vi_port
	add	hl,bc
	ld	a,(hl)
	ld	(.o1+1),a
	ld	(.o2+1),a
	ld	a,d
	or	e
	ld	hl,vi_m3
	jp	nz,.snd
	ld	hl,vi_m0
.snd:	add	hl,bc
	ld	a,(hl)
	out	(8),a
	ld	a,e
.o1:	out	(0),a
	ld	a,d
.o2:	out	(0),a
	ret

vi_port: db	0x0b,0x0a,0x09
vi_m3:	db	0x36,0x76,0xb6
vi_m0:	db	0x30,0x70,0xb0

	include	"../../build/gen/bootmus_data.inc"

; переменные
has_ay:	db	0
mflag:	db	0
hold:	db	0
srcp:	dw	0
srce:	dw	0
wp:	dw	0
rp:	dw	0
mlen:	dw	0
vi_last: dw	0,0,0
vi_c:	db	0
vi_v:	db	0
vi_nact: db	0
vi_rnd:	db	0xa5
psg_regs: ds	14
mus_end:
	assert	1 - ((((RING << 8) - mus_end) >> 15) & 1), "музыка заставки заходит в кольцо"
