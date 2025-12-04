import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { raplProbe } from '../../../../src/sensors/rapl/rapl-probe.js';
import { createRaplPackages } from '../../../../utils/test-utils.js';


test('rapl-probe test-suite', async (t) => {

    const tmpRoot = path.join(os.tmpdir(), `rapl-probe-tests-${process.pid}`);

    before(async () => {
        // Création du répertoire temporaire
        await fs.rm(tmpRoot, { recursive: true, force: true });
        await fs.mkdir(tmpRoot, { recursive: true });
    });

    after(async () => {
        // Nettoyage du répertoire temporaire
        await fs.rm(tmpRoot, { recursive: true, force: true });
    });

    await t.test('should respond DEGRADED when RAPL is not available (no permission)', async () => {
        const probe = await raplProbe('/sys/class/powercap' );
        assert.strictEqual(probe.status, 'DEGRADED');
        assert.strictEqual(probe.packages.length, 1);
        assert.strictEqual(probe.packages[0].reason, 'permission_denied');
    });

    await t.test('should respond FAILED when : no RAPL packages found', async () => {
        const emptyDir = path.join(tmpRoot, 'empty-powercap');
        await fs.mkdir(emptyDir, { recursive: true });

        const probe = await raplProbe(emptyDir);
        assert.strictEqual(probe.status, 'FAILED');
        assert.strictEqual(probe.hint, `No RAPL packages (intel-rapl:N or amd-rapl:N) found in ${emptyDir}. VM without powercap ?`);
        //
    });

    await t.test('should respond OK when RAPL is available', async () => {
        const raplePackage = await createRaplPackages(tmpRoot, 'intel-rapl:0', {
            name: 'package-0',
            energy: 123456789n,
            maxRange: 987654321n
        });

        const resultOk = {
            status: 'OK',
            vendor: 'intel',
            packages: [
                {
                    vendor: 'intel',
                    node: 'intel-rapl:0',   
                    path: raplePackage.dir,
                    name: 'package-0',
                    energyPath: raplePackage.files.energyPath,
                    hasEnergyReadable: true,
                    reason: null,
                    maxEnergyUj: 987654321,
                    files: {
                        energyUj: raplePackage.files.energyPath,
                        maxEnergyUj: raplePackage.files.maxRangePath
                    }
                }
            ],
            hint: null  
        }

        const probe = await raplProbe(tmpRoot);
        assert.deepStrictEqual(probe, resultOk);
    }); 
});