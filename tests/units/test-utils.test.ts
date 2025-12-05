// createRaplPackages.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRaplPackages } from '../../utils/test-utils.js';

test('createRaplPackages creates files with default values (maxRange=0n → no max_range file)', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'rapl-test-default-'));
  const nodeName = 'intel-rapl:0';

  try {
    // We pass an empty object to use default values
    const { dir, files } = await createRaplPackages(baseDir, nodeName, {});

    // The returned directory should be baseDir/nodeName
    assert.strictEqual(dir, join(baseDir, nodeName));

    // File "name"
    const nameContent = await readFile(files.namePath, 'utf8');
    assert.strictEqual(nameContent, 'package-0');

    // File "energy_uj"
    const energyContent = await readFile(files.energyPath, 'utf8');
    assert.strictEqual(energyContent, '0'); // String(0n)

    // As maxRange=0n, the file should not exist
    await assert.rejects(access(files.maxRangePath));
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});

test('createRaplPackages writes the provided values and creates max_energy_range_uj if maxRange > 0n', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'rapl-test-custom-'));
  const nodeName = 'intel-rapl:1';

  const energy = 12345n;
  const maxRange = 999999n;
  const name = 'package-1';

  try {
    const { dir, files } = await createRaplPackages(baseDir, nodeName, {
      name,
      energy,
      maxRange,
    });

    assert.strictEqual(dir, join(baseDir, nodeName));

    const nameContent = await readFile(files.namePath, 'utf8');
    assert.strictEqual(nameContent, name);

    const energyContent = await readFile(files.energyPath, 'utf8');
    assert.strictEqual(energyContent, String(energy));

    const maxRangeContent = await readFile(files.maxRangePath, 'utf8');
    assert.strictEqual(maxRangeContent, String(maxRange));
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});
