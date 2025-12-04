// createRaplPackages.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRaplPackages } from '../../utils/test-utils.js';

test('createRaplPackages crée les fichiers avec les valeurs par défaut (maxRange=0n → pas de fichier max_range)', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'rapl-test-default-'));
  const nodeName = 'intel-rapl:0';

  try {
    // On passe un objet vide pour utiliser les valeurs par défaut
    const { dir, files } = await createRaplPackages(baseDir, nodeName, {});

    // Le répertoire retourné doit être baseDir/nodeName
    assert.strictEqual(dir, join(baseDir, nodeName));

    // Fichier "name"
    const nameContent = await readFile(files.namePath, 'utf8');
    assert.strictEqual(nameContent, 'package-0');

    // Fichier "energy_uj"
    const energyContent = await readFile(files.energyPath, 'utf8');
    assert.strictEqual(energyContent, '0'); // String(0n)

    // Comme maxRange=0n, le fichier ne doit pas exister
    await assert.rejects(access(files.maxRangePath));
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});

test('createRaplPackages écrit les valeurs fournies et crée max_energy_range_uj si maxRange > 0n', async () => {
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
