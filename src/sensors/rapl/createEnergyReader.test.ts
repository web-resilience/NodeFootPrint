import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createEnergyReader } from './energyReader.js';
import { raplProbe } from './rapl-probe.js';
import { createRaplPackages } from '../../../utils/test-utils.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';


test('createEnergyReader test suite', async (t) => {
    const tmpRoot = path.join(os.tmpdir(), `create-energy-test-${process.pid}`);
    let raplPackage: {
        dir: string;
        files: {
            namePath: string;
            energyPath: string;
            maxRangePath: string;
        };
    } | null = null;
    before(async () => {
        await fs.rm(tmpRoot, { recursive: true, force: true });
        await fs.mkdir(tmpRoot, { recursive: true });
        raplPackage = await createRaplPackages(tmpRoot, 'intel-rapl:0', {
            name: 'package-0',
            energy: 123456789n,
            maxRange: 987654321n
        });
    });

    after(async () => {
        // Nettoyage du répertoire temporaire
        await fs.rm(tmpRoot, { recursive: true, force: true });
    });
    await t.test('RAPL KO: should return empirical fallback if rapl not accessible', async () => {
        // Retirer les permissions de lecture sur le fichier energy_uj
        if (raplPackage) {
            await fs.chmod(raplPackage.files.energyPath, 0o000);
            const probe = await raplProbe(tmpRoot);
            const reader = createEnergyReader({ probe });
            // Rétablir les permissions pour le nettoyage
            assert.equal(reader.status, 'NOT_IMPLEMENTED_YET');
            await fs.chmod(raplPackage.files.energyPath, 0o644);
        }
    });
    await t.test('RAPL OK: Should instanciate RaplReader', async () => {
        if (raplPackage) {
            const probe = await raplProbe(tmpRoot);
            const reader = createEnergyReader({ probe });
            assert.equal(reader.status, 'OK');
            assert.equal(reader.isReady, true);
        }
    });
});
