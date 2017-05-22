import {Action, MiddlewareAPI, Middleware, Store} from 'redux';

import State from '../../state/State';
import Cartridge from '../../state/Cartridge';
import EmulationProviderInterface from '../EmulationProvider';
import {
    types as emulationActions,
    stateChange,
    updateFrequency,
    updateGamepadCount,
    StartAction,
    SetEnforceRateLimitAction
} from '../../actions/emulation';

import EmulationServiceInterface from '../../../service/EmulationServiceInterface';
import WorkerEmulationService from '../../../service/worker/EmulationService';
import VanillaEmulationService from '../../../service/vanilla/EmulationService';
import EmulationContextInterface from '../../../service/EmulationContextInterface';
import DriverManager from '../../../service/DriverManager';
import WebAudioDriver from '../../../driver/WebAudio';
import GamepadDriver from '../../../../driver/Gamepad';
import StellaConfig from '../../../../../machine/stella/Config';
import * as VideoProcessorConfig from '../../../../../video/processing/config';

class EmulationProvider implements EmulationProviderInterface {

    setStore(store: Store<State>): void {
        this._store = store;
    }

    async init(workerUrl?: string): Promise<void> {
        this._service = workerUrl ? new WorkerEmulationService(workerUrl) :  new VanillaEmulationService();

        await this._service.init();

        this._driverManager = new DriverManager();

        this._initAudio();
        this._initGamepad();

        this._driverManager.bind(this._service);

        this._startDispatch();
    }

    getService(): EmulationServiceInterface {
        return this._service;
    }

    getMiddleware(): Middleware {
        // TODO: remove cast once redux-thunk is gone
        return this._middleware as any;
    }

    private _initAudio(): void {
        const audioDriver = new WebAudioDriver();

        try {
            audioDriver.init();

            this._driverManager.addDriver(
                audioDriver,
                (context: EmulationContextInterface, driver: WebAudioDriver) => driver.bind(context.getAudio())
            );

            this._audioDriver = audioDriver;
        } catch (e) {
            console.log(`audio not available: ${e.message}`);
        }
    }

    private _initGamepad(): void {
        const gamepadDriver = new GamepadDriver();

        try {
            gamepadDriver.init();

            this._driverManager.addDriver(
                gamepadDriver,
                (context: EmulationContextInterface, driver: GamepadDriver) =>
                    driver.bind({
                        joysticks: [context.getJoystick(0), context.getJoystick(1)],
                        start: context.getControlPanel().getResetButton(),
                        select: context.getControlPanel().getSelectSwitch()
                    })
            );

            this._gamepadDriver = gamepadDriver;
        } catch (e) {
            console.log(`gamepad not available: ${e.message}`);
        }
    }

    private _startDispatch(): void {
        if (this._gamepadDriver) {
            this._gamepadDriver.gamepadCountChanged.addHandler(
                gamepadCount => this._store.dispatch(updateGamepadCount(gamepadCount))
            );
        }

        this._service.stateChanged.addHandler(
            newState => this._store.dispatch(stateChange(newState))
        );

        this._service.frequencyUpdate.addHandler(
            frequency => this._store.dispatch(updateFrequency(frequency))
        );
    }

    private _updateControlPanelState(state = this._store.getState().emulationState) {
        const context = this._service.getEmulationContext();

        if (!context) {
            return;
        }

        const controlPanel = context.getControlPanel();

        controlPanel.getDifficultySwitchP0().toggle(state.difficultyPlayer0);
        controlPanel.getDifficultySwitchP1().toggle(state.difficultyPlayer1);
        controlPanel.getColorSwitch().toggle(state.tvMode);
    }

    private async _startEmulation(action: StartAction, cartridge: Cartridge, state: State): Promise<void> {
        if (!cartridge) {
            return;
        }

        action.hash = cartridge.hash;

        const stellaConfig = new StellaConfig(
            cartridge.tvMode,
            cartridge.audioEnabled,
            cartridge.rngSeedAuto ? -1 : cartridge.rngSeed,
            cartridge.emulatePaddles
        );

        await this._service.start(
            cartridge.buffer,
            stellaConfig,
            cartridge.cartridgeType,
            state.settings.mergeFrames ? [{type: VideoProcessorConfig.Type.merge}] : undefined
        );

        this._updateControlPanelState(state.emulationState);
    }

    private _middleware =
        (api: MiddlewareAPI<State>) => (next: (a: Action) => any) => async (a: Action): Promise<any> =>
    {
        if (!a || !this._service) {
            return next(a);
        }

        const initialState = api.getState();

        switch (a.type) {
            case emulationActions.start:
                await this._startEmulation(a as StartAction, initialState.currentCartridge, initialState);
                return next(a);

            case emulationActions.pause:
            case emulationActions.userPause:
                await this._service.pause();
                return next(a);

            case emulationActions.resume:
                await this._service.resume();
                return next(a);

            case emulationActions.reset:
                await this._service.reset();
                return next(a);

            case emulationActions.changeDifficulty:
            case emulationActions.changeTvMode:
                await next(a);
                return this._updateControlPanelState(api.getState().emulationState);

            case emulationActions.setEnforceRateLimit:
                await this._service.setRateLimit((a as SetEnforceRateLimitAction).enforce);
                return next(a);

            default:
                return next(a);
        }
    }

    private _store: Store<State>;

    private _driverManager: DriverManager;
    private _service: EmulationServiceInterface;
    private _audioDriver: WebAudioDriver;
    private _gamepadDriver: GamepadDriver;

}

export default EmulationProvider;
