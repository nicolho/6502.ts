import {connect} from 'react-redux';
import {push} from 'react-router-redux';

import State from '../state/State';
import GuiState from '../state/GuiState';

import {
    pause as pauseEmulation,
    resume as resumeEmulation,
    changeDifficulty,
    changeTvMode,
    enforceRateLimit
} from '../actions/emulation';

import EmulationComponent from '../components/Emulation';

function mapStateToProps(state: State): EmulationComponent.Props {
    return {
        enabled: state.guiState.mode === GuiState.GuiMode.run,
        emulationState: state.emulationState.emulationState,
        difficultyPlayer0: state.emulationState.difficultyPlayer0,
        difficultyPlayer1: state.emulationState.difficultyPlayer1,
        tvModeSwitch: state.emulationState.tvMode,
        enforceRateLimit: state.emulationState.enforceRateLimit,
        smoothScaling: state.settings.smoothScaling
    };
}

const EmulationContainer = connect(mapStateToProps, {
    navigateAway: () => push('/cartridge-manager'),
    pauseEmulation,
    resumeEmulation,

    onSwitchDifficultyPlayer0: (state: boolean) => changeDifficulty(0, state),
    onSwitchDifficultyPlayer1: (state: boolean) => changeDifficulty(1, state),
    onSwitchTvMode: (state: boolean) => changeTvMode(state),
    onEnforceRateLimitChange: (enforce: boolean) => enforceRateLimit(enforce)
})(EmulationComponent);

export default EmulationContainer;
