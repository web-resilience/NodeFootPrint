import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { RaplReader, clampDt, raplProbe } from "../../../../src";
import { createRaplPackages, nowNs } from '../../../../utils/test-utils.js';
import { chmod, rm, writeFile,mkdir}from 'node:fs/promises';
import os from 'node:os';




test('RaplReader - sample energy consumption', async (t) => {

    await t.test('PRIME: fist tick should return the prime values', async () => {
        const temp = path.join(os.tmpdir(), `rapl-reader-test-${process.pid}`);
        let raplReader: RaplReader;
        try {
            const pkg = await createRaplPackages(temp, `intel-rapl:0`, {
                name: 'package-0',
                energy: 5000000n,
                maxRange: 20000000n
            });

            const probe = await raplProbe(temp);
            raplReader = new RaplReader({ probe, log: 'debug' });

            const dt = nowNs(0);
            const sample = await raplReader.sample(dt);
            const expectedPrime = {
                ok: true,
                deltaUj: 0,
                //clamped between 0.2s and 5s
                deltaTimeTs: 0.2,
                deltaJ: 0,
                powerW: 0,
                packages: [],
                wraps: 0
            }
            assert.ok(sample);
            assert.deepStrictEqual(sample, expectedPrime);
        } finally {
            await rm(temp, { recursive: true, force: true });
        }
    });

    await t.test('SECOND TICK: second tick should return correct delta energy', async () => {
        const temp = path.join(os.tmpdir(), `rapl-reader-test-${process.pid}`);
        let raplReader: RaplReader;
        try {
            const pkg = await createRaplPackages(temp, `intel-rapl:0`, {
                name: 'package-0',
                energy: 5000000n,
                maxRange: 20000000n
            });

            const probe = await raplProbe(temp);
            raplReader = new RaplReader({ probe, log: 'silent' });

            //first sample to prime
            let dt = nowNs(0);
            await raplReader.sample(dt);

            //update energy value
            if (pkg.files.energyPath) {
                await chmod(pkg.files.energyPath, 0o644);
                await writeFile(pkg.files.energyPath, String(7000000n), 'utf8');
            }


            //second sample after 1s
            dt = nowNs(1.0);
            const sample = await raplReader.sample(dt);
            const expectedSecond = {
                ok: true,
                deltaUj: 2000000,
                deltaTimeTs: 1,
                deltaJ: 2000000e-6,
                powerW: 2,
                packages: [
                    {
                        node: 'intel-rapl:0',
                        path: pkg.dir,
                    }
                ],
                wraps: 0
            }
            assert.ok(sample);
            assert.deepStrictEqual(sample, expectedSecond);
        } finally {
            await rm(temp, { recursive: true, force: true });
        }
    });

    await t.test('WRAP CORRECTION: reading max energy and handling wraparound correctly', async () => {
        const temp = path.join(os.tmpdir(), `rapl-reader-test-${process.pid}`);
        let raplReader: RaplReader;
        try {
            const pkg = await createRaplPackages(temp, `intel-rapl:0`, {
                name: 'package-0',
                energy: 19000000n,
                maxRange: 20000000n
            });

            const probe = await raplProbe(temp);
            raplReader = new RaplReader({ probe, log: 'silent' });

            //first sample to prime
            let dt = nowNs(0);
            await raplReader.sample(dt);

            //update energy value to simulate wrap
            if (pkg.files.energyPath) {
                await chmod(pkg.files.energyPath, 0o644);
                await writeFile(pkg.files.energyPath, String(1000000n), 'utf8');
            }
            //second sample after 1s
            dt = nowNs(1.0);
            const sample = await raplReader.sample(dt);
            const expectedWrap = {
                ok: true,
                deltaUj: 2000000,
                deltaTimeTs: 1,
                deltaJ: 2000000e-6,
                powerW: 2,
                packages: [
                    {
                        node: 'intel-rapl:0',
                        path: pkg.dir,
                    }
                ],
                wraps: 1
            }
            assert.ok(sample);
            assert.deepStrictEqual(sample, expectedWrap);
        } finally {
            await rm(temp, { recursive: true, force: true });
        }
    });

    await t.test('MULTI-PACKAGE: reading from multiple RAPL packages', async () => {
        const temp = path.join(os.tmpdir(), `rapl-reader-test-${process.pid}`);
        let raplReader: RaplReader;
        try {
            const pkg0 = await createRaplPackages(temp, `intel-rapl:0`, {
                name: 'package-0',
                energy: 5000000n,
                maxRange: 20000000n
            });
            const pkg1 = await createRaplPackages(temp, `intel-rapl:1`, {
                name: 'package-1',
                energy: 8000000n,
                maxRange: 20000000n
            });

            const probe = await raplProbe(temp);
            raplReader = new RaplReader({ probe, log: 'silent' });

            //first sample to prime
            let dt = nowNs(0);
            await raplReader.sample(dt);

            //update energy values
            if (pkg0.files.energyPath) {
                await chmod(pkg0.files.energyPath, 0o644);
                await writeFile(pkg0.files.energyPath, String(7000000n), 'utf8');
            }
            if (pkg1.files.energyPath) {
                await chmod(pkg1.files.energyPath, 0o644);
                await writeFile(pkg1.files.energyPath, String(10000000n), 'utf8');
            }

            //second sample after 1s
            dt = nowNs(1.0);
            const sample = await raplReader.sample(dt);
            const expectedMulti = {
                ok: true,
                deltaUj: 4000000,
                deltaTimeTs: 1,
                deltaJ: 4000000e-6,
                powerW: 4,
                packages: [
                    {
                        node: 'intel-rapl:0',
                        path: pkg0.dir,
                    },
                    {
                        node: 'intel-rapl:1',
                        path: pkg1.dir,
                    }
                ],
                wraps: 0
            }
            assert.ok(sample);
            assert.deepStrictEqual(sample, expectedMulti);
        } finally {
            await rm(temp, { recursive: true, force: true });
        }
    });

    await t.test('NO READABLE PACKAGES: RaplReader should handle absence of readable packages gracefully', async () => {
        const temp = path.join(os.tmpdir(), `rapl-reader-test-${process.pid}`);
        let raplReader: RaplReader | undefined;
        try {
            //create a package without energy_uj file
            await mkdir(path.join(temp, `intel-rapl:0`), { recursive: true });
            await writeFile(path.join(temp, `intel-rapl:0`, 'name'), 'package-0', 'utf8');

            

            const probe = await raplProbe(temp);
            raplReader = new RaplReader({ probe, log: 'silent' });

            //RaplReader should not be initialized properly
            assert.strictEqual(raplReader.state, undefined);
        } finally {
            await rm(temp, { recursive: true, force: true });
        }
    });

    await t.test('UNREADABLE PACKAGE:ignred if at leat one package is unreadable', async () => {
        const temp = path.join(os.tmpdir(), `rapl-reader-test-${process.pid}`);
        let raplReader: RaplReader | undefined;
        try {
             const [p0, p1] = await Promise.all(
            [
                createRaplPackages(temp, 'intel-rapl:0', { name: 'package-0', energy: 1_000_000n }),
                createRaplPackages(temp, 'intel-rapl:1', { name: 'package-1', energy: 2_000_000n })
            ]
        );  
            //remove read permissions
            if (p1.files.energyPath) {
                await chmod(p1.files.energyPath, 0o000);
            }
            const probe = await raplProbe(temp);
            raplReader = new RaplReader({ probe, log: 'silent' });
            //first sample to prime
            let dt = nowNs(0);
            const sample = await raplReader.sample(dt);
            await writeFile(p0.files.energyPath, String(1_500_000n), 'utf8');           
            //second sample after 1s
            dt = nowNs(1.0);
            const sample2 = await raplReader.sample(dt);
            assert.ok(sample2);
            assert.strictEqual(sample2.deltaUj, 500000);
            assert.strictEqual(sample2.packages.length, 1);
            assert.strictEqual(sample2.packages[0].node, 'intel-rapl:0');

       } finally {
            await rm(temp, { recursive: true, force: true });
        }
    });
});

test('clampDt utility function', async (t) => { 

    await t.test('CLAMP DT: clamp delta time between min and max thresholds', async () => {
        assert.strictEqual(clampDt(-1), 0.2);
        assert.strictEqual(clampDt(0), 0.2);
        assert.strictEqual(clampDt(0.1), 0.2);
        assert.strictEqual(clampDt(0.2), 0.2);
        assert.strictEqual(clampDt(1), 1);
        assert.strictEqual(clampDt(5), 5);
        assert.strictEqual(clampDt(10), 5);
        assert.strictEqual(clampDt(Infinity), 0.2);
        assert.strictEqual(clampDt(NaN), 0.2);
    });
});