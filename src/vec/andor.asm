; CPC writes the live core into one of its two background pages only.
; Reproduce that page phase on the single Vector screen, after sprite erasure
; and before new background/sprites. Outside a boss area: a short return.
andor_flush:
 ld (dl_ptr),hl
 ld a,(ANDOR_SAVED)
 or a
 ret z
 ld hl,G_ST
 ld b,8
.find:
 ld a,(hl)
 cp 0xfe
 jp z,.type
.next:
 inc l
 dec b
 jp nz,.find
 ret
.type:
 push hl
 ld de,G_TYPE-G_ST
 add hl,de
 ld a,(hl)
 cp 0x28
 pop hl
 jp nz,.next
 ld de,G_X-G_ST
 add hl,de
 ld a,(hl)
 rrca
 rrca
 and 0x3f
 add a,SCR_C+0x20
 ld d,a
 ld bc,G_Y-G_X
 add hl,bc
 ld a,(hl)
 cp 9
 ret c
 ld b,a
 ; A=00/FF selects OR mask / AND complemented mask, idempotently.
 ; This also handles a row just written by PEND and repeated emergency flushes.
 ld a,(BUF_FRONT)
 jp nz,.phase
 ld (.origin+1),a	; G_Y=9: FE80h попадает именно в эту страницу
.phase:
.origin: xor 0
 sub 1
 cpl
 ld (.inv+1),a
 and 0x10
 xor 0xb6
 ld (.mix),a
 ; Skip aperture rows above clip_base, including the deferred top line.
 ld a,(clip_base)
 sub 3
 sub b
 jp nc,.skip
 xor a
.skip:
 ld (.k+1),a
 ld c,a
 ld a,10
 sub c
 ld (.h1+1),a
 ld (.h2+1),a
 ld a,(CAM_Y)
 add a,b
 add a,c
 cpl
 sub 3
 ld l,a
 ld c,a
 ld h,d
 ld de,ANDOR_MASK
 call .advance
.h1: ld b,10
 call .col
 inc h
 ld l,c
 call .advance
.h2: ld b,10
 jp .col
.advance:
.k: ld a,0
 add a,e
 ld e,a
 jp nc,$+4
 inc d
 ret
.col:
 ld a,(de)
.inv: xor 0
.mix: or (hl)
 ld (hl),a
 inc de
 dec l
 dec b
 jp nz,.col
 ret
 include "../../build/gen/vec_andor.inc"
