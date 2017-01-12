	processor 6502
	INCLUDE ../vcs.h

	SEG.U VARS
	ORG $80

	SEG CODE
	org $F000

HRULE_COLOR = $78
VRULE_COLOR = $04

	IFNCONST OVERSCAN_LINES
OVERSCAN_LINES = 63
	EIF

	IFNCONST CLOCKS_TO_TEST
CLOCKS_TO_TEST = 66
	EIF

    MAC DRAW

.WAIT SET 0

    REPEAT CLOCKS_TO_TEST

	STY COLUBK

.CYCLES SET .WAIT

	IF .CYCLES & 1

	BIT VSYNC

.CYCLES SET .CYCLES - 3

	ENDIF

	REPEAT .CYCLES / 2
	NOP
	REPEND

	RESP_SPRITE
	LDY #$0
	STA WSYNC
	STY COLUBK
	STA WSYNC
	STY COLUBK
	LDY #HRULE_COLOR
	STA WSYNC

.WAIT SET .WAIT + 1

    REPEND

    ENDM

Start
	SEI
	CLD
	LDX #$FF
	TXS
	LDA #0
ClearMem
	STA 0,X
	DEX
	BNE ClearMem

	LDA #%10100000
	STA PF0
	LDA #%01010101
	STA PF1
	LDA #%10101010
	STA PF2

	LDA #VRULE_COLOR
	STA COLUPF

	SETUP

MainLoop

Vsync
	; line 1
	LDA #2
	STA VSYNC
    STA VBLANK
	STA WSYNC

	; line 2
	STA WSYNC

	; line 3
	STA WSYNC

Vblank
	LDA #56
	STA TIM64T
	LDA #0
	STA VSYNC
	LDY #HRULE_COLOR

BurnVblank
	LDA INTIM
	BNE BurnVblank

    LDA #0
    STA VBLANK

	STA WSYNC
	STA WSYNC

Kernal

	PRE_DRAW
    DRAW

	LDA 0
	LDA #2
	STA VBLANK
    LDX #OVERSCAN_LINES

BurnOverscan
	STA WSYNC
	DEX
	BNE BurnOverscan

	JMP  MainLoop

	org $FFFC
	.word Start
	.word Start