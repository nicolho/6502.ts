/// <reference path="../../typings/jquery/jquery.d.ts"/>
/// <reference path="../interface/jquery.terminal.d.ts"/>

'use strict';

import TestCLI = require("../cli/TestCLI");
import JqtermCLIRunner = require('../cli/JqtermCLIRunner');

export function run(
    terminalElt: JQuery,
    interruptButton: JQuery,
    clearButton: JQuery
) {
    var cli = new TestCLI(),
        runner = new JqtermCLIRunner(cli, terminalElt, {
            interruptButton: interruptButton,
            clearButton: clearButton
        });

    runner.startup();
}