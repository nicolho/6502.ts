/*
 *   This file is part of 6502.ts, an emulator for 6502 based systems built
 *   in Typescript.
 *
 *   Copyright (C) 2014 - 2018 Christian Speckner & contributors
 *
 *   This program is free software; you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation; either version 2 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License along
 *   with this program; if not, write to the Free Software Foundation, Inc.,
 *   51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 */

import { Mutex } from 'async-mutex';
import { EventInterface as Event, Event as EventImplementation } from 'microevent.ts';

import EmulationServiceInterface from '../../stella/service/EmulationServiceInterface';
import EmulationService from '../../stella/service/worker/EmulationService';
import DriverManager from '../../stella/service/DriverManager';

import VideoDriverInterface from '../../driver/VideoDriverInterface';
import CanvasVideo from '../../driver/SimpleCanvasVideo';
import WebglVideo from '../../driver/webgl/WebglVideo';

import AudioDriver from '../../stella/driver/WebAudio';
import KeyboardIO from '../../stella/driver/KeyboardIO';
import Paddle from '../../driver/MouseAsPaddle';
import Gamepad from '../../driver/Gamepad';
import FullscreenDriver from '../../driver/FullscreenVideo';

import CartridgeInfo from '../../../machine/stella/cartridge/CartridgeInfo';
import StellaConfig from '../../../machine/stella/Config';

import { decode as decodeBase64 } from '../../../tools/base64';

import ControlPanel from './ControlPanel';
import ControlPanelProxy from './ControlPanelProxy';

/**
 * The stellerator class and namespace. In a typical application, a single instance is
 * created and bound to a canvas element. This instance can than be used to run many
 * different ROMs during its lifetime.
 *
 * Notes on reading this documentation:
 * * All code examples are ES6
 * * The actual emulation runs on a web worker, and all methods that control emulation
 *   are asynchronous and return [ES6 Promises](http://exploringjs.com/es6/ch_promises.html)
 * * Check out the [microevent.ts](https://github.com/DirtyHairy/microevent) documentation
 *   for the event API
 *
 * Basic example:
 * ```typescript
 *     const stellerator = new Stellerator(
 *         document.getElementById('stellerator-canvas'),
 *         'js/stellerator_worker.js'
 *     );
 *
 *     stellerator.run(rom, Stellerator.TvMode.ntsc);
 * ```
 */
class Stellerator {
    /**
     * Creates an instance of Stellerator.
     * @param canvasElt The canvas element that is used to display the TIA image.
     * You can configure the canvas dimensions as you like; the TIA image will be
     * automatically positioned and scaled to fit while preserving
     * the 4:3 aspect ration.
     *
     * @param workerUrl The URL from which the web worker will be loaded.
     * In order to avoid cross domain issues, the worker should be hosted on the same
     * domain as the stellerator build, and this parameter should read e.g.
     * `js/stellerator_worker.js`
     *
     * @param config Optional configuration to
     * customize emulator behavior. See [[Config]] for a full explanation of the values
     * and their default.
     */
    constructor(canvasElt: HTMLCanvasElement, workerUrl: string, config: Partial<Stellerator.Config> = {}) {
        this._canvasElt = canvasElt;

        this._config = {
            smoothScaling: true,
            simulatePov: true,
            gamma: 1,
            audio: true,
            volume: 1,
            enableKeyboard: true,
            keyboardTarget: document,
            fullscreenViaKeyboard: true,
            paddleViaMouse: true,
            pauseViaKeyboard: true,
            enableGamepad: true,

            ...config
        };

        this._emulationService = new EmulationService(workerUrl);

        this.frequencyUpdate = this._emulationService.frequencyUpdate;

        const stateChange = new EventImplementation<Stellerator.State>();
        this._emulationService.stateChanged.addHandler(newState => stateChange.dispatch(this._mapState(newState)));
        this.stateChange = stateChange;

        this._createDrivers();

        this._driverManager.addDriver(this._controlPanel, context =>
            this._controlPanel.bind(context.getControlPanel())
        );
    }

    /**
     * Set the gamma correction factor. Will take effect **only** if WebGL is available.
     *
     * @param gamma
     */
    setGamma(gamma: number): this {
        if (this._webglVideo) {
            this._webglVideo.setGamma(gamma);
        }

        return this;
    }

    /**
     * Query the current gamme correction factor.
     *
     * @returns {number}
     */
    getGamma(): number {
        return this._webglVideo ? this._webglVideo.getGamma() : 1;
    }

    /**
     * Enable / disable persistence of vision / phosphor simulation. POV is simulated
     * by blending several frames and will work **only** if WebGL is available.
     *
     * @param povEnabled
     * @returns {this}
     */
    enablePovSimulation(povEnabled: boolean): this {
        if (this._webglVideo) {
            this._webglVideo.enablePovEmulation(povEnabled);
        }

        return this;
    }

    /**
     * Query the state of persistence of vision / phosphor emulation.
     *
     * @returns {boolean}
     */
    isPovSimulationEnabled(): boolean {
        return this._webglVideo ? this._webglVideo.povEmulationEnabled() : false;
    }

    /**
     * Enable / disable smooth scaling of the TIA image.
     *
     * @param smoothScalingEnabled
     * @returns {this}
     */
    enableSmoothScaling(smoothScalingEnabled: boolean): this {
        this._videoDriver.enableInterpolation(smoothScalingEnabled);

        return this;
    }

    /**
     * Query whether smooth scaling of the TIA image is enabled.
     *
     * @returns {boolean}
     */
    smoothScalingEnabled(): boolean {
        return this._videoDriver.interpolationEnabled();
    }

    /**
     * Enable / disable fullscreen mode.
     *
     * @param fullscreen
     * @returns {this}
     */
    toggleFullscreen(fullscreen?: boolean): this {
        if (typeof fullscreen === 'undefined') {
            this._fullscreenVideo.toggle();
        } else {
            fullscreen ? this._fullscreenVideo.engage() : this._fullscreenVideo.disengage();
        }

        return this;
    }

    /**
     * Query if emulator is running fullscreen.
     *
     * @returns {boolean}
     */
    isFullscreen(): boolean {
        return this._fullscreenVideo.isEngaged();
    }

    /**
     * Change the master volume.
     *
     * @param volume Will be clipped to the range 0 .. 1
     * @returns {this}
     */
    setVolume(volume: number): this {
        if (this._audioDriver) {
            this._audioDriver.setMasterVolume(Math.max(Math.min(volume, 1), 0));
        }

        return this;
    }

    /**
     * Query whether audio has been enabled on this instance.
     *
     * @returns {boolean}
     */
    audioEnabled(): boolean {
        return !!this._audioDriver;
    }

    /**
     * Query the master volume.
     *
     * @returns {number}
     */
    getVolume(): number {
        return this._audioDriver ? this._audioDriver.getMasterVolume() : 0;
    }

    /**
     * Change the canvas size (if `width` and `height` are specified) or notifiy
     * the video driver of a canvas size change.
     *
     * Note that "canvas size" refers to
     * the `width` and `height` attributes of the element that define framebuffer size.
     * Changes to the actual client dimenstions of the element that are a triggered
     * by CSS are irrelevant to the video driver.
     *
     * @param width New canvas width. Will be ignored unless height is set, too.
     * @param height New canvas height. Will be ignored unless width is set, too.
     */
    resize(width?: number, height?: number): this {
        this._videoDriver.resize(width, height);

        return this;
    }

    /**
     * Query the current state of the emulation.
     *
     * @returns {Stellerator.State}
     */
    getState(): Stellerator.State {
        return this._state;
    }

    /**
     * Get the console control panel. This allows you to monitor and control
     * the console switches (select, reset, difficulty P1 / P2, color / BW).
     */
    getControlPanel(): ControlPanel {
        return this._controlPanel;
    }

    /**
     * Start emulation of a cartridge image. This method is **async** and returns
     * a promise for the resulting emulation state.
     *
     * **IMPORTANT:** The emulator will start up in [[State.paused]] mode. Use the `run` method
     * below in order to start and run the emulation immediatelly.
     *
     * @param cartridge The cartridge image. Can be either
     * an array / typed array of byte values or a base64 encoded string.
     *
     * @param tvMode The TV mode (NTSC / PAL / SECAM)
     *
     * @param config Optional configuration
     * values to customize emulation behavior. See [[CartridgeConfig]] for a full list of supported
     * settings and their defaults.
     *
     * @returns {Promise<Stellerator.State>}
     */
    start(
        cartridge: ArrayLike<number> | string,
        tvMode: Stellerator.TvMode,
        config: Partial<Stellerator.CartridgeConfig> = {}
    ): Promise<Stellerator.State> {
        return this._mutex.runExclusive(async () => {
            if (typeof cartridge === 'string') {
                cartridge = decodeBase64(cartridge);
            }

            const stellaConfig = StellaConfig.create({ tvMode: this._convertTvMode(tvMode) });

            if (typeof config.randomSeed !== 'undefined' && config.randomSeed > 0) {
                stellaConfig.randomSeed = config.randomSeed;
            }

            if (typeof config.emulatePaddles !== 'undefined') {
                stellaConfig.emulatePaddles = config.emulatePaddles;
            }

            if (typeof config.frameStart !== 'undefined') {
                stellaConfig.frameStart = config.frameStart;
            }

            return (this._state = this._mapState(
                await this._emulationService.start(cartridge, stellaConfig, config.cartridgeType)
            ));
        });
    }

    /**
     * Like [[start]], but run the emulator immediatelly instead of starting
     * in paused mode.
     *
     * Just like its counterpart, this method is **async** and returns a promise
     * for the resulting emualtion state.
     *
     * @param cartridge The cartridge image. Can be either
     * an array / typed array of byte values or a base64 encoded string.
     *
     * @param tvMode The TV mode (NTSC / PAL / SECAM)
     *
     * @param config Optional configuration
     * values to customize emulation behavior. See [[CartridgeConfig]] for a full list of supported
     * settings and their defaults.
     *
     * @returns {Promise<Stellerator.State>}
     */
    async run(
        cartridge: ArrayLike<number> | string,
        tvMode: Stellerator.TvMode,
        config: Partial<Stellerator.CartridgeConfig> = {}
    ): Promise<Stellerator.State> {
        if ((await this.start(cartridge, tvMode, config)) === Stellerator.State.paused) {
            return this.resume();
        }
    }

    /**
     * Pause a running emulation session. This method is **async** and returns a
     * promise for the resulting emulation state.
     *
     * @returns {Promise<Stellerator.State>}
     */
    pause(): Promise<Stellerator.State> {
        return this._mutex.runExclusive(
            async () => (this._state = this._mapState(await this._emulationService.pause()))
        );
    }

    /**
     * Resume a paused emulation session. This method is **async** and returns a
     * promise for the resulting emulation state.
     *
     * @returns {Promise<Stellerator.State>}
     */
    resume(): Promise<Stellerator.State> {
        return this._mutex.runExclusive(
            async () => (this._state = this._mapState(await this._emulationService.resume()))
        );
    }

    /**
     * Stop a running or paused emulation session. This method is **async** and returns a
     * promise for the resulting emulation state.
     *
     * @returns {Promise<Stellerator.State>}
     */
    stop(): Promise<Stellerator.State> {
        return this._mutex.runExclusive(
            async () => (this._state = this._mapState(await this._emulationService.stop()))
        );
    }

    /**
     * Retrieve the last emulation error.
     *
     * **IMPORTANT:** Don't use this to check whether an error occurred; use [[getState]]
     * and check for [[State.error]] instead.
     *
     * @returns {Error}
     */
    lastError(): Error {
        return this._emulationService.getLastError();
    }

    private _convertTvMode(tvMode: Stellerator.TvMode): StellaConfig.TvMode {
        switch (tvMode) {
            case Stellerator.TvMode.ntsc:
                return StellaConfig.TvMode.ntsc;

            case Stellerator.TvMode.pal:
                return StellaConfig.TvMode.pal;

            case Stellerator.TvMode.secam:
                return StellaConfig.TvMode.secam;

            default:
                throw new Error(`invalid TV mode '${tvMode}'`);
        }
    }

    private _createDrivers(): void {
        try {
            this._webglVideo = this._videoDriver = new WebglVideo(this._canvasElt, {
                povEmulation: this._config.simulatePov,
                gamma: this._config.gamma
            }).init();
        } catch (e) {
            this._webglVideo = null;
            this._videoDriver = new CanvasVideo(this._canvasElt).init();
        }

        this._videoDriver.enableInterpolation(this._config.smoothScaling);

        this._driverManager.addDriver(this._videoDriver, context => this._videoDriver.bind(context.getVideo()));

        this._fullscreenVideo = new FullscreenDriver(this._videoDriver);

        if (this._config.audio) {
            try {
                this._audioDriver = new AudioDriver();
                this._audioDriver.setMasterVolume(this._config.volume);

                this._driverManager.addDriver(this._audioDriver, context =>
                    this._audioDriver.bind(true, [context.getPCMChannel()])
                );
            } catch (e) {
                console.error(`failed to initialize audio: ${e && e.message}`);
            }
        }

        if (this._config.enableKeyboard) {
            this._keyboardIO = new KeyboardIO(this._config.keyboardTarget);

            this._driverManager.addDriver(this._keyboardIO, context =>
                this._keyboardIO.bind(context.getJoystick(0), context.getJoystick(1), context.getControlPanel())
            );

            if (this._config.fullscreenViaKeyboard) {
                this._keyboardIO.toggleFullscreen.addHandler(() => this._fullscreenVideo.toggle());
            }

            if (this._config.pauseViaKeyboard) {
                this._keyboardIO.togglePause.addHandler(() => {
                    switch (this._emulationService.getState()) {
                        case EmulationServiceInterface.State.paused:
                            this.resume();
                            break;

                        case EmulationServiceInterface.State.running:
                            this.pause();
                            break;
                    }
                });
            }
        }

        if (this._config.enableGamepad) {
            this._gamepad = new Gamepad();

            this._driverManager.addDriver(this._gamepad, context =>
                this._gamepad.bind({
                    joysticks: [context.getJoystick(0), context.getJoystick(1)],
                    start: context.getControlPanel().getResetButton(),
                    select: context.getControlPanel().getSelectSwitch()
                })
            );
        }

        if (this._config.paddleViaMouse) {
            this._paddle = new Paddle();

            this._driverManager.addDriver(this._paddle, context => this._paddle.bind(context.getPaddle(0)));
        }
    }

    private _mapState(state: EmulationServiceInterface.State): Stellerator.State {
        switch (state) {
            case EmulationServiceInterface.State.stopped:
                return Stellerator.State.stopped;

            case EmulationServiceInterface.State.running:
                return Stellerator.State.running;

            case EmulationServiceInterface.State.paused:
                return Stellerator.State.paused;

            case EmulationServiceInterface.State.error:
                return Stellerator.State.error;

            default:
                throw new Error('cannot happen');
        }
    }

    /**
     * Subscribe to this event to receive periodic updates on the frequency of the
     * emulated system. The unit is Hz. Check out the
     * [microevent.ts](https://github.com/DirtyHairy/microevent)
     * documentation on the event API.
     *
     * Example (using JQuery to display emulation speed):
     * ```typescript
     *     stellerator.frequencyUpdate.addHandler(
     *         frequency => $('emulation-speed').text(`System speed: ${(frequency / 1e6).toFixed(2)} MHz`)
     *     );
     * ```
     */
    frequencyUpdate: Event<number>;

    /**
     * This event is dispatched whenever emulation state changes. Check out the
     * [microevent.ts](https://github.com/DirtyHairy/microevent)
     * documentation on the event API.
     *
     * Example (using JQuery to display an error message):
     * ```typescript
     *     stellerator.stateChange.addHandler(
     *         state => {
     *             if (state === Stellerator.State.error) {
     *                  $('error-message').text(stellerator.lastError().message);
     *             }
     *         }
     *     );
     * ```
     */
    stateChange: Event<Stellerator.State>;

    private _canvasElt: HTMLCanvasElement;
    private _config: Stellerator.Config = null;
    private _emulationService: EmulationServiceInterface = null;

    private _videoDriver: VideoDriverInterface = null;
    private _webglVideo: WebglVideo = null;
    private _fullscreenVideo: FullscreenDriver = null;
    private _audioDriver: AudioDriver = null;
    private _keyboardIO: KeyboardIO = null;
    private _paddle: Paddle = null;
    private _gamepad: Gamepad = null;

    private _controlPanel = new ControlPanelProxy();

    private _state = Stellerator.State.stopped;

    private _driverManager = new DriverManager();

    private _mutex = new Mutex();
}

namespace Stellerator {
    /**
     * General emulator configuration. The configuration is set on construction of the
     * stellerator instance. Each setting is strictly optional and has a default
     * value.
     */
    export interface Config {
        /**
         * Perform smooth scaling of the output image.
         *
         * Default: true
         */
        smoothScaling: boolean;

        /**
         * Simulate persistence of vision / phosphor by blending several frames. This will
         * take effect **only** if WebGL is available.
         *
         * Default: true
         */
        simulatePov: boolean;

        /**
         * Gamma correction. Will take effect **only** if WebGL is available.
         *
         * Default: true
         */
        gamma: number;

        /**
         * Enable audio.
         *
         * Default: true
         */
        audio: boolean;

        /**
         * Master volume.
         *
         * Default: true
         */
        volume: number;

        /**
         * Enable keyboard for joysticks and reset / resume.
         *
         * Default: true
         *
         */
        enableKeyboard: boolean;

        /**
         * Specify an HTML element on which the driver listens for keyboard
         * events.
         *
         * Default: document
         */
        keyboardTarget: HTMLElement | HTMLDocument;

        /**
         * Toggle fullscreen with "enter". Applicable **only** if `enableKeyboard`
         * is set.
         *
         * Default: true
         */
        fullscreenViaKeyboard: boolean;

        /**
         * Toggle pause with "p". Applicable **only** if `enableKeyboard` is set.
         *
         * Default: true
         */
        pauseViaKeyboard: boolean;

        /**
         * Emulate the first paddlewith the horizontal movement of the mouse.
         *
         * Default: true
         *
         */
        paddleViaMouse: boolean;

        /**
         * Enable gamepad support.
         *
         * Default: true
         */
        enableGamepad: boolean;
    }

    /**
     * TV mode constants
     */
    export enum TvMode {
        /**
         * NTSC
         */
        ntsc = 'ntsc',
        /**
         * PAL
         */
        pal = 'pal',
        /**
         * SECAM
         */
        secam = 'secam'
    }

    /**
     * Optional configuration for a specific cartridge. This configuration is passed to
     * the emulator together with a cartridge image for emulation. Each setting
     * is strictly optional and has a default value.
     */
    export interface CartridgeConfig {
        /**
         * Specify the cartridge type. The default is autodetection which should
         * work fine in almost all cases.
         *
         * Default: undefined [autodetect]
         */
        cartridgeType: CartridgeInfo.CartridgeType;

        /**
         * Random number generator seed. This is used to initialize the initial
         * hardware state. The default is automatic, which uses a random seed.
         *
         * Default: undefined [automatic]
         */
        randomSeed: number;

        /**
         * Emulate paddles.
         *
         * Default: true
         */
        emulatePaddles: boolean;

        /**
         * The first visible scanline of the frame. The default is autodetection, which
         * should work fine for most cases.
         *
         * Default: undefined [autodetect]
         */
        frameStart: number;
    }

    /**
     * The CartridgeType enum. Reexported from the `CartridgeInfo` module. Please check the
     * [source](https://github.com/6502ts/6502.ts/blob/master/src/machine/stella/cartridge/CartridgeInfo.ts)
     * for the various possible values if you really need this setting.
     *
     * Example:
     * ```typescript
     *     stellerator.run(cartridgeImage, Stellerator.TvMode.ntsc, {
     *         cartridgeType: Stellerator.CartridgeType.bankswitch_DPC
     *     });
     * ```
     */
    export const CartridgeType = CartridgeInfo.CartridgeType;

    /**
     * This function takes a cartridge type and returns a human readable
     * description suitable for building an UI. Reexported from the `CartridgeInfo` module.
     *
     * Example:
     * ```typescript
     *     const description = Stellerator.describeCartridgeType(
     *         Stellerator.CartridgeType.bankswitch_DPC
     *     );
     * ```
     */
    export const describeCartridgeType: (cartridgeType: CartridgeInfo.CartridgeType) => string =
        CartridgeInfo.describeCartridgeType;

    /**
     * This function returns an array of all possible cartridge types suitable for building an UI.
     * Reexported from the `CartridgeInfo` module.
     */
    export const allCartridgeTypes: () => Array<CartridgeInfo.CartridgeType> = CartridgeInfo.getAllTypes;

    /**
     * The different possible states of the emulation.
     */
    export enum State {
        running = 'running',
        /**
         * Emulation has been paused and can be stopped or continued.
         */
        paused = 'paused',
        /**
         * Emulation has been stopped regularily.
         */
        stopped = 'stopped',
        /**
         * Emulation has been stopped by an error.
         */
        error = 'error'
    }
}

export { Stellerator as default };