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

import CpuInterface from '../../../../../src/machine/cpu/CpuInterface';
import StateMachineInterface from '../../../../../src/machine/cpu/statemachine/StateMachineInterface';
import { encode as toHex } from '../../../../../src/tools/hex';
import deepEqual from 'deep-equal';

export const incrementP = (s: CpuInterface.State) => ({ ...s, p: (s.p + 1) & 0xffff });
export const decrementS = (s: CpuInterface.State) => ({ ...s, s: (s.s - 1) & 0xffff });
export const incrementS = (s: CpuInterface.State) => ({ ...s, s: (s.s + 1) & 0xffff });

export class Builder {
    read(address: number, value: number): this {
        this._pushCurrentCycle();

        this._currentCycle = {
            result: {
                cycleType: StateMachineInterface.CycleType.read,
                address,
                value,
                pollInterrupts: false,
                nextStep: () => undefined,
            },
        };

        return this;
    }

    write(address: number, value: number): this {
        this._pushCurrentCycle();

        this._currentCycle = {
            result: {
                cycleType: StateMachineInterface.CycleType.write,
                address,
                value,
                pollInterrupts: false,
                nextStep: () => undefined,
            },
        };

        return this;
    }

    action(action: (s: CpuInterface.State) => CpuInterface.State): this {
        this._currentCycle.action = action;

        return this;
    }

    pollInterrupts(): this {
        this._currentCycle.result.pollInterrupts = true;

        return this;
    }

    run<OperandT extends number | undefined = undefined>(
        prepareState: (s: CpuInterface.State) => CpuInterface.State,
        createStateMachine: (
            state: CpuInterface.State,
            getResult: (result: number) => null
        ) => StateMachineInterface<OperandT>,
        operand: OperandT
    ): Runner<OperandT> {
        this._pushCurrentCycle();

        const runner = new Runner(this._cycles, prepareState(new CpuInterface.State()), createStateMachine);

        return runner.run(operand);
    }

    private _pushCurrentCycle(): void {
        if (this._currentCycle) {
            this._cycles.push(this._currentCycle);
        }
    }

    private _currentCycle: Runner.Cycle = null;
    private readonly _cycles = new Array<Runner.Cycle>();
}

class Runner<OperandT extends number | undefined = undefined> {
    constructor(
        private readonly _cycles: Array<Runner.Cycle>,
        private readonly _state: CpuInterface.State,
        createStateMachine: (
            state: CpuInterface.State,
            getResult: (result: number) => null
        ) => StateMachineInterface<OperandT>
    ) {
        this._stateMachine = createStateMachine(this._state, (result) => ((this._result = result), null));
    }

    run(operand: OperandT): this {
        this._step = 0;
        let resultActual = this._stateMachine.reset(operand);

        while (resultActual !== null) {
            const cycle = this._cycles[this._step];

            if (!cycle) {
                throw new Error(`expected state machine to complete in ${this._cycles.length} steps`);
            }

            const resultExpected = cycle.result;
            const stateExpected = cycle.action ? cycle.action(this._state) : { ...this._state };

            if (resultActual.cycleType !== resultExpected.cycleType) {
                throw new Error(
                    `cycle type mismatch: expected ${
                        resultExpected.cycleType === StateMachineInterface.CycleType.read ? 'read' : 'write'
                    }`
                );
            }

            if (resultActual.address !== resultExpected.address) {
                throw new Error(
                    `expected an access to ${toHex(resultExpected.address)}; got ${toHex(resultActual.address)} instead`
                );
            }

            if (
                resultExpected.cycleType === StateMachineInterface.CycleType.write &&
                resultExpected.value !== resultActual.value
            ) {
                throw new Error(
                    `expected a write of ${toHex(resultExpected.value)}, got ${toHex(resultActual.value)} instead`
                );
            }

            if (resultExpected.pollInterrupts && !resultActual.pollInterrupts) {
                throw new Error(`expected interrupts to be polled in step ${this._step}`);
            }

            if (!resultExpected.pollInterrupts && resultActual.pollInterrupts) {
                throw new Error(`expected interrupts not to be polled in step ${this._step}`);
            }

            resultActual.pollInterrupts = false;
            resultActual = resultActual.nextStep(resultExpected.value);
            this._step++;

            if (!deepEqual(stateExpected, this._state)) {
                throw new Error(
                    `state mismatch in step ${this._step}: expected ${JSON.stringify(
                        stateExpected,
                        undefined,
                        '  '
                    )}, got ${JSON.stringify(this._state, undefined, '  ')}`
                );
            }
        }

        if (this._cycles[this._step]) {
            throw new Error(`State machine completed in step ${this._step}, but expected ${this._cycles.length} steos`);
        }

        return this;
    }

    assert(assertion: (result: number) => void): void {
        assertion(this._result);
    }

    private _step = 0;
    private _result = 0;

    private readonly _stateMachine: StateMachineInterface<OperandT> = null;
}

namespace Runner {
    export const build = () => new Builder();

    export interface Cycle {
        result: StateMachineInterface.Result;
        action?: (s: CpuInterface.State) => CpuInterface.State;
    }
}

export default Runner;
