import test from "node:test";
import assert from "node:assert/strict";
import { splitCommand } from "./splitCommand.js";


test('splitCommand', async () => {
    const c_one = splitCommand('--spawn "node script.js"');
    const c_two = splitCommand(`--spawn "node script.js --name 'hello world'"`)
    assert.deepStrictEqual(c_one,['--spawn','node script.js']);
    //assert.deepStrictEqual(c_two,['--spawn','"node', 'script.js','--name',"'hello", `world'"`]);
});