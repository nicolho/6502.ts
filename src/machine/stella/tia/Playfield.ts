class Playfield {

    constructor() {
        this.reset();
    }

    reset() {
        this._pattern = 0;
        this._reflected = false;

        this._delay0 = 0;
        this._delay1 = 0;
        this._delay2 = 0;

        this._pf0 = 0;
        this._pf1 = 0;
        this._pf2 = 0;

        this._pending = false;
    }

    pf0(value: number) {
        this._pf0 = value;
        this._delay0 = 3;
        this._pending = true;
    }

    pf1(value: number) {
        this._pf1 = value;
        this._delay1 = 3;
        this._pending = true;
    }

    pf2(value: number) {
        this._pf2 = value;
        this._delay2 = 3;
        this._pending = true;
    }

    ctrlpf(value: number): void {
        this._reflected = (value & 1) > 0;
    }

    tick(): void {
        if (!this._pending) {
            return;
        }

        if (this._delay0 > 0 && --this._delay0 === 0) {
            this._applyPf0(this._pf0);
            this._pending = this._delay1 > 0 || this._delay2 > 0;
        }

        if (this._delay1 >= 0 && this._delay1-- === 0) {
            this._applyPf1(this._pf1);
            this._pending = this._delay0 > 0 || this._delay2 > 0;
        }

        if (this._delay2 >= 0 && this._delay2-- === 0) {
            this._applyPf2(this._pf2);
            this._pending = this._delay0 > 0 || this._delay1 > 0;
        }
    }

    renderPixel(x: number, y: number, colorIn: number): number {
        if (this._pattern === 0) {
            return colorIn;
        }

        if (x < 80) {
            return (this._pattern & (1 << (x >>> 2))) > 0 ? this.color : colorIn;
        } else if (this._reflected) {
            return (this._pattern & (1 << (39 - (x >>> 2)))) > 0 ? this.color : colorIn;
        }

        return (this._pattern & (1 << ((x >>> 2) - 20))) > 0 ? this.color : colorIn;
    }

    private _applyPf0(value: number): void {
        this._pattern = (this._pattern & 0x000FFFF0) | ((value & 0xF0) >>> 4);
    }

    private _applyPf1(value: number): void {
        this._pattern = (this._pattern & 0x000FF00F)
            | ((value & 0x80) >>> 3)
            | ((value & 0x40) >>> 1)
            | ((value & 0x20) <<  1)
            | ((value & 0x10) <<  3)
            | ((value & 0x08) <<  5)
            | ((value & 0x04) <<  7)
            | ((value & 0x02) <<  9)
            | ((value & 0x01) <<  11);
    }

    private _applyPf2(value: number): void {
        this._pattern = (this._pattern & 0x00000FFF) | ((value & 0xFF) << 12);
    }

    color = 0;

    private _pattern = 0;
    private _reflected = false;

    private _delay0 = -1;
    private _delay1 = -1;
    private _delay2 = -1;

    private _pf0 = 0;
    private _pf1 = 0;
    private _pf2 = 0;

    private _pending = false;
}

export default Playfield;