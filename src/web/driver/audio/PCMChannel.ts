/*
 *   This file is part of 6502.ts, an emulator for 6502 based systems built
 *   in Typescript
 *
 *   Copyright (c) 2014 -- 2020 Christian Speckner and contributors
 *
 *   Permission is hereby granted, free of charge, to any person obtaining a copy
 *   of this software and associated documentation files (the "Software"), to deal
 *   in the Software without restriction, including without limitation the rights
 *   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *   copies of the Software, and to permit persons to whom the Software is
 *   furnished to do so, subject to the following conditions:
 *
 *   The above copyright notice and this permission notice shall be included in all
 *   copies or substantial portions of the Software.
 *
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 *   SOFTWARE.
 */

import ChannelInterface from './ChannelInterface';
import PCMAudioEndpointInterface from '../PCMAudioEndpointInterface';
import PoolMemberInterface from '../../../tools/pool/PoolMemberInterface';
import RingBuffer from '../../../tools/RingBuffer';
import ResamplerInterface from './ResamplerInterface';
import LinearReasmpler from './LinearResampler';

class PCMChannel implements ChannelInterface {
    constructor(private _hostFragmentSize = 1024) {}

    init(context: AudioContext, target: AudioNode) {
        this._outputSampleRate = context.sampleRate;

        this._gain = context.createGain();
        this._gain.gain.value = this._volume;
        this._gain.connect(target);

        this._processor = context.createScriptProcessor(this._hostFragmentSize, 1, 1);
        this._bufferSize = this._processor.bufferSize;

        this._processor.connect(this._gain);
        this._processor.onaudioprocess = e => this._processAudio(e);

        const buffer = context.createBuffer(1, 1, context.sampleRate);
        buffer.getChannelData(0).set([0]);
    }

    bind(audio: PCMAudioEndpointInterface): void {
        this.unbind();

        this._audio = audio;
        this._fragmentSize = audio.getFrameSize();
        this._inputSampleRate = audio.getSampleRate();
        this._fragmentIndex = 0;
        this._lastFragment = null;
        this._bufferUnderrun = true;
        this._fragmentRing = new RingBuffer<PoolMemberInterface<Float32Array>>(
            Math.ceil(((4 * this._bufferSize) / this._outputSampleRate / this._fragmentSize) * this._inputSampleRate)
        );
        this._fragmentRing.evict.addHandler(b => b.release());

        this._audio.newFrame.addHandler(PCMChannel._onNewFragment, this);

        this._resampler.reset(this._inputSampleRate, this._outputSampleRate);
    }

    unbind() {
        if (!this._audio) {
            return;
        }

        this._audio.newFrame.removeHandler(PCMChannel._onNewFragment, this);

        if (this._lastFragment) {
            this._lastFragment.release();
            this._lastFragment = null;
        }

        if (this._currentFragment) {
            this._currentFragment.release();
            this._currentFragment = null;
        }

        if (this._fragmentRing) {
            this._fragmentRing.forEach(b => b.release());
            this._fragmentRing.clear();
            this._fragmentRing = null;
        }
    }

    setMasterVolume(volume: number): void {
        this._volume = volume;
    }

    private static _onNewFragment(fragment: PoolMemberInterface<Float32Array>, self: PCMChannel): void {
        self._fragmentRing.push(fragment);

        if (!self._currentFragment) {
            self._currentFragment = self._fragmentRing.pop();
            self._fragmentIndex = 0;
        }
    }

    private _processAudio(e: AudioProcessingEvent): void {
        if (!this._audio) {
            return;
        }

        const outputBuffer = e.outputBuffer.getChannelData(0);
        let bufferIndex = 0;

        const fillBuffer = (until: number) => {
            const previousFragmentBuffer = this._lastFragment && this._lastFragment.get();

            while (bufferIndex < until) {
                if (this._resampler.needsData()) {
                    this._resampler.push(
                        (this._audio && this._audio.isPaused()) || !previousFragmentBuffer
                            ? 0
                            : previousFragmentBuffer[this._fragmentIndex++] * this._volume
                    );

                    if (this._fragmentIndex >= this._fragmentSize) {
                        this._fragmentIndex = 0;
                    }
                }

                outputBuffer[bufferIndex++] = this._resampler.get();
            }
        };

        // Give the emulation half a fragment of head start when recovering from an underrun
        if (this._currentFragment && this._bufferUnderrun) {
            fillBuffer(this._bufferSize >>> 1);
            this._bufferUnderrun = false;
        }

        let fragmentBuffer = this._currentFragment && this._currentFragment.get();

        while (bufferIndex < this._bufferSize && this._currentFragment) {
            if (this._resampler.needsData()) {
                this._resampler.push(fragmentBuffer[this._fragmentIndex++] * this._volume);

                if (this._fragmentIndex >= this._fragmentSize) {
                    this._fragmentIndex = 0;

                    if (this._lastFragment) {
                        this._lastFragment.release();
                    }

                    this._lastFragment = this._currentFragment;
                    this._currentFragment = this._fragmentRing.pop();

                    fragmentBuffer = this._currentFragment && this._currentFragment.get();
                }
            }

            outputBuffer[bufferIndex++] = this._resampler.get();
        }

        if (bufferIndex < this._bufferSize) {
            this._bufferUnderrun = true;
        }

        fillBuffer(this._bufferSize);
    }

    private _outputSampleRate = 0;
    private _bufferSize = 0;
    private _volume = 1;

    private _gain: GainNode = null;
    private _processor: ScriptProcessorNode = null;
    private _bufferUnderrun = false;

    private _fragmentRing: RingBuffer<PoolMemberInterface<Float32Array>> = null;

    private _fragmentSize = 0;
    private _inputSampleRate = 0;
    private _fragmentIndex = 0;
    private _currentFragment: PoolMemberInterface<Float32Array> = null;
    private _lastFragment: PoolMemberInterface<Float32Array> = null;

    private _audio: PCMAudioEndpointInterface;

    private _resampler: ResamplerInterface = new LinearReasmpler();
}

export { PCMChannel as default };
