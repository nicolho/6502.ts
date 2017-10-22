/*
 *   This file is part of 6502.ts, an emulator for 6502 based systems built
 *   in Typescript.
 *
 *   Copyright (C) 2014 - 2017 Christian Speckner & contributors
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

interface Config {
    tvMode: Config.TvMode;
    enableAudio: boolean;
    randomSeed: number;
    emulatePaddles: boolean;
    frameStart: number;
    pcmAudio: false;
}

namespace Config {
    export const enum TvMode {
        ntsc,
        pal,
        secam
    }

    export function create(config: Partial<Config> = {}): Config {
        return {
            tvMode: TvMode.ntsc,
            enableAudio: true,
            randomSeed: -1,
            emulatePaddles: true,
            frameStart: -1,
            pcmAudio: false,

            ...config
        };
    }

    export function getClockMhz(config: Config): number {
        switch (config.tvMode) {
            case Config.TvMode.ntsc:
                return 262 * 228 * 60 / 1000000;

            case Config.TvMode.pal:
            case Config.TvMode.secam:
                return 312 * 228 * 50 / 1000000;
        }
    }
}

export default Config;
