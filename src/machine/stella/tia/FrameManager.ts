import VideoOutputInterface from '../../io/VideoOutputInterface';
import RGBASurfaceInterface from '../../../tools/surface/RGBASurfaceInterface';
import Event from '../../../tools/event/Event';
import Config from '../Config';

const enum Metrics {
    vblankNTSC                  = 40,
    vblankPAL                   = 48,
    kernelNTSC                  = 192,
    kernelPAL                   = 228,
    overscanNTSC                = 30,
    overscanPAL                 = 36,
    vsync                       = 3,
    visibleOverscan             = 20,
    maxUnderscan                = 10,
    maxFramesWithoutVsync       = 50
}

const enum State {
    waitForVsyncStart,
    waitForVsyncEnd,
    waitForFrameStart,
    frame,
    overscan,
}

export default class FrameManager {

    constructor(private _config: Config) {
        switch (this._config.tvMode) {
            case Config.TvMode.ntsc:
                this._vblankLines = Metrics.vblankNTSC;
                this._kernelLines = Metrics.kernelNTSC;
                this._overscanLines = Metrics.overscanNTSC;
                break;

            case Config.TvMode.pal:
            case Config.TvMode.secam:
                this._vblankLines = Metrics.vblankPAL;
                this._kernelLines = Metrics.kernelPAL;
                this._overscanLines = Metrics.overscanPAL;
                break;

            default:
                throw new Error(`invalid tv mode ${this._config.tvMode}`);
        }

        this._frameLines = this._vblankLines + this._kernelLines + this._overscanLines * Metrics.vsync;
        this._maxLinesWithoutVsync = this._frameLines * Metrics.maxFramesWithoutVsync;
        this._visibleOverscan = Metrics.visibleOverscan;
        this._maxUnderscan = Metrics.maxUnderscan;

        this.reset();
    }

    reset(): void {
        this.vblank = false;
        this.surfaceBuffer = null;
        this._waitForVsync = true;
        this._linesWithoutVsync = 0;
        this._state = State.waitForVsyncStart;
        this._vsync = false;
        this._lineInState = 0;
        this._surfaceFactory = null;
        this._surface = null;
    }

    nextLine(): void {
        if (!this._surfaceFactory) {
            return;
        }

        this._lineInState++;

        switch (this._state) {
            case State.waitForVsyncStart:
            case State.waitForVsyncEnd:
                if (this._linesWithoutVsync > this._maxLinesWithoutVsync) {
                    this._waitForVsync = false;
                    this._setState(State.waitForFrameStart);
                }
                break;

            case State.waitForFrameStart:
                if (this._waitForVsync) {
                    if (this._lineInState >=
                        (this.vblank ? this._vblankLines : this._vblankLines - this._maxUnderscan)
                    ) {
                        this._startFrame();
                    }
                } else {
                    if (!this.vblank) {
                        this._startFrame();
                    }
                }

                break;

            case State.frame:
                if (this._lineInState >= this._kernelLines + this._visibleOverscan) {
                    this._finalizeFrame();
                }
                break;

            case State.overscan:
                if (this._lineInState >= this._overscanLines - this._visibleOverscan) {
                    this._setState(this._waitForVsync ? State.waitForVsyncStart : State.waitForFrameStart);
                }
                break;
        }

        if (this._waitForVsync) {
            this._linesWithoutVsync++;
        }
    }

    isRendering(): boolean {
        return this._state === State.frame;
    }

    setVblank(vblank: boolean): void {
        if (this._surfaceFactory) {
            this.vblank = vblank;
        }
    }

    setVsync(vsync: boolean): void {
        if (!this._surfaceFactory || !this._waitForVsync || vsync === this._vsync) {
            return;
        }

        this._vsync = vsync;

        switch (this._state) {
            case State.waitForVsyncStart:
            case State.waitForFrameStart:
            case State.overscan:
                if (vsync) {
                    this._setState(State.waitForVsyncEnd);
                }
                break;

            case State.waitForVsyncEnd:
                if (!vsync) {
                    this._setState(State.waitForFrameStart);
                    this._linesWithoutVsync = 0;
                }
                break;

            case State.frame:
                if (vsync) {
                    // State is reset by finalizeFrame
                    this._finalizeFrame();
                }
                break;
        }
    }

    getHeight(): number {
        return this._kernelLines + this._visibleOverscan;
    }

    setSurfaceFactory(factory: VideoOutputInterface.SurfaceFactoryInterface): void {
        this._surfaceFactory = factory;
    }

    getCurrentLine(): number {
        return this._state === State.frame ? this._lineInState : 0;
    }

    getDebugState(): string {
        return `${this._getReadableState()}, line = ${this._lineInState}, vblank = ${this.vblank ? '1' : '0'}, ${this._waitForVsync ? '' : 'given up on vsync'}`;
    }

    private _getReadableState(): string {
        switch (this._state) {
            case State.waitForVsyncStart:
                return `wait for vsync start`;

            case State.waitForVsyncEnd:
                return `wait for vsync end`;

            case State.waitForFrameStart:
                return `wait for frame start`;

            case State.frame:
                return `frame`;

            case State.overscan:
                return `overscan`;
        }
    }

    private _startFrame(): void {
        this._setState(State.frame);
        this._surface = this._surfaceFactory();
        this.surfaceBuffer = this._surface.getBuffer();
    }

    private _finalizeFrame(): void {
        if (this._state !== State.frame) {
            throw new Error(`finalize frame in invalid state ${this._state}`);
        }

        this.newFrame.dispatch(this._surface);
        this._setState(State.overscan);
    }

    private _setState(newState: State) {
        this._state = newState;
        this._lineInState = 0;
    }

    newFrame = new Event<RGBASurfaceInterface>();

    vblank = false;
    surfaceBuffer: RGBASurfaceInterface.BufferInterface = null;

    private _vblankLines = 0;
    private _kernelLines = 0;
    private _overscanLines = 0;
    private _frameLines = 0;
    private _maxLinesWithoutVsync = 0;
    private _maxUnderscan = 0;
    private _visibleOverscan = 0;

    private _waitForVsync = true;
    private _linesWithoutVsync = 0;
    private _state = State.waitForVsyncStart;

    private _vsync = false;
    private _lineInState = 0;

    private _surfaceFactory: VideoOutputInterface.SurfaceFactoryInterface = null;
    private _surface: RGBASurfaceInterface = null;

}