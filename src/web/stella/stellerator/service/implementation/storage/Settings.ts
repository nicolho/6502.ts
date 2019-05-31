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

import SettingsModel from '../../../model/Settings';

export const UNIQUE_ID = 0;

export type indexType = number;

type AudioDriverString = 'pcm' | 'waveform';
type CpuAccuracyString = 'cycle' | 'instruction';

export interface SettingsSchema {
    id: number;
    smoothScaling: boolean;
    webGlRendering: boolean;
    povEmulation: boolean;
    gamma: number;
    useWorker: boolean;
    mergeFrames: boolean;
    volume: number;
    syncRendering: boolean;
    audioDriver: AudioDriverString;
    enableTouchControls: boolean;
    touchJoystickSensitivity: number;
    touchLeftHandedMode: boolean;
    cpuAccuracy: CpuAccuracyString;
}

function audioDriverToString(driver: SettingsModel.AudioDriver): AudioDriverString {
    switch (driver) {
        case SettingsModel.AudioDriver.pcm:
            return 'pcm';

        case SettingsModel.AudioDriver.waveform:
            return 'waveform';

        default:
            throw new Error(`invalid audio driver ${driver}`);
    }
}

function audioDriverFromString(driver: AudioDriverString): SettingsModel.AudioDriver {
    switch (driver) {
        case 'pcm':
            return SettingsModel.AudioDriver.pcm;

        case 'waveform':
            return SettingsModel.AudioDriver.waveform;

        default:
            throw new Error(`invalid audio driver string ${driver}`);
    }
}

function cpuAccuracyToString(cpuAccuracy: SettingsModel.CpuAccuracy): CpuAccuracyString {
    switch (cpuAccuracy) {
        case SettingsModel.CpuAccuracy.cycle:
            return 'cycle';

        case SettingsModel.CpuAccuracy.instruction:
            return 'instruction';

        default:
            throw new Error(`invalid cpu accuracy ${cpuAccuracy}`);
    }
}

function cpuAccuracyFromString(cpuAccuracyString: CpuAccuracyString): SettingsModel.CpuAccuracy {
    switch (cpuAccuracyString) {
        case 'cycle':
            return SettingsModel.CpuAccuracy.cycle;

        case 'instruction':
            return SettingsModel.CpuAccuracy.instruction;

        default:
            throw new Error(`invalid cpu accuracy string ${cpuAccuracyString}`);
    }
}

export function fromModel(model: SettingsModel): SettingsSchema {
    const { audioDriver, ...m } = model;

    return {
        ...m,
        id: UNIQUE_ID,
        audioDriver: audioDriverToString(audioDriver),
        cpuAccuracy: cpuAccuracyToString(model.cpuAccuracy)
    };
}

export function toModel(record?: SettingsSchema): SettingsModel {
    if (!record) {
        return SettingsModel.create();
    }

    const { id, audioDriver, cpuAccuracy, ...settings } = record;

    return {
        ...settings,
        audioDriver: audioDriverFromString(audioDriver),
        cpuAccuracy: cpuAccuracyFromString(cpuAccuracy)
    };
}