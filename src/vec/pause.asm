; Пауза и выход в титул (как в Bruce Lee): ВК — пауза, ВК — дальше; АР2 в паузе — в титул.
; Титул после конца игры и по АР2 — plat_title_menu: меню CPC (31A8h) ставит жизни 3 и 3E5Fh = 2 (маски клавиш
; у нас уже стоят); дальше новую игру начинает логика (p_game_over после title_menu: очки, зона, рестарт).

; ВК нажата сейчас и не была нажата в прошлый раз
vk_edge:
	ld	a,(kb_vk)
	ld	hl,vk_prev
	ld	b,(hl)
	ld	(hl),a
	or	a
	ret	z
	ld	a,b
	cpl
	and	4
	ret

; в начале обновления
pause_chk:
	call	cheat_g
	call	vk_edge
	ret	z
	ld	a,1
	ld	(paused),a
	call	snd_mute
.w:	xor	a
	ld	(vframes),a	; ввод — каждый кадр
.f:	ld	a,(vframes)
	or	a
	jp	z,.f
	ld	a,(kb_r1)	; АР2 — в титул
	and	4
	jp	nz,game_exit
	call	vk_edge
	jp	z,.w
	xor	a
	ld	(paused),a
	ret
; бросить игру: тем же путём, что конец игры (p_game_over: титул, новая игра)
game_exit:
	ld	sp,STACK_TOP
	ld	hl,main
	push	hl
	jp	p_game_over

; меню CPC: состояние вывода — заново, титул (тишина), жизни
plat_title_menu:
	call	vec_reset
	ld	a,1
	ld	(snd_qstop),a
	ld	(snd_qany),a
	ld	(paused),a
	call	snd_mute
	call	title_show
	xor	a
	ld	(paused),a
	ld	a,3
	ld	(LIVES),a
	ld	a,2
	ld	(0x3e5f),a
	ret

; состояние вывода игры — заново (очередь, DLIST, фон, отложенные тайлы, панель, надписи)
vec_reset:
	ld	hl,DLIST
	ld	(dl_ptr),hl
	ld	hl,POOL
	ld	(pool_ptr),hl
	ld	hl,QUEUE
	ld	(qptr),hl
	ld	hl,PEND
	ld	(pend_end),hl
	ld	a,MK_BUF & 0xff
	ld	(mk_end),a
	xor	a
	ld	(static_prepare.old+1),a
	ld	(s_st),a
	ld	(s_st+5),a
	ld	(p_st),a
	ld	(p_st+5),a
	ld	(t_ns),a
	ld	(lb_pend),a
	ld	(pl_dy),a
	ld	(band_n),a
	ld	hl,hud_last	; панель — построить заново
	ld	b,8
.h:	ld	(hl),0xff
	inc	hl
	dec	b
	jp	nz,.h
	ld	hl,HUD_REC	; коды знакомест тоже недействительны после титула
	ld	b,HUD_W
.hr:	ld	(hl),0xff
	inc	hl
	inc	hl
	inc	hl
	inc	hl
	dec	b
	jp	nz,.hr
	ld	a,16
	ld	(clip_base),a
	jp	msg_clear
