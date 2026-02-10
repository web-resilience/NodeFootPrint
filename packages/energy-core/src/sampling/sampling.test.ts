import test from "node:test";
import assert from "node:assert/strict";
import { collectSamples } from "./sampling.js";

test("collectSamples: must collect sample without reader", async (t) => {
    const samples = await collectSamples({},0n);
    assert.strictEqual(samples.energy,null);
    assert.strictEqual(samples.cpu,null);
    assert.strictEqual(samples.processCpu,null);
});