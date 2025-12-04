// fs-utils.test.ts
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';

import { accessReadable, listDirectories, listFiles } from '../../utils/file-utils.js';

// Répertoire temporaire pour les tests
const tmpRoot = path.join(os.tmpdir(), `file-utils-tests-${process.pid}`);

before(async () => {
// Création du répertoire temporaire
  await fs.rm(tmpRoot, { recursive: true, force: true });
  await fs.mkdir(tmpRoot, { recursive: true });
});

after(async () => {
  // Nettoyage du répertoire temporaire
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// ----------------------
// Tests pour accessReadable
// ----------------------

test('accessReadable retourne ok:true quand le fichier existe et est lisible', async () => {
  const dir = path.join(tmpRoot, 'access-ok');
  await fs.mkdir(dir, { recursive: true });

  const file = path.join(dir, 'file.txt');
  await fs.writeFile(file, 'hello world');

  const result = await accessReadable(file);

  assert.deepStrictEqual(result, { ok: true });
});

test('accessReadable retourne ok:false avec erreur "not_found" quand le fichier est absent', async () => {
  const dir = path.join(tmpRoot, 'access-enoent');
  await fs.mkdir(dir, { recursive: true });

  const file = path.join(dir, 'does-not-exist.txt');

  const result = await accessReadable(file);

  assert.strictEqual(result.ok, false);
  if (!result.ok) {
    assert.strictEqual(result.error, 'not_found');
  }
});

// ----------------------
// Tests pour listDirectories
// ----------------------

test('listDirectories retourne uniquement les dossiers immédiats', async () => {
  const base = path.join(tmpRoot, 'list-directories');
  await fs.rm(base, { recursive: true, force: true });
  await fs.mkdir(base, { recursive: true });

  // Création de deux dossiers
  await fs.mkdir(path.join(base, 'dir1'));
  await fs.mkdir(path.join(base, 'dir2'));

  // Et deux fichiers
  await fs.writeFile(path.join(base, 'file1.txt'), '');
  await fs.writeFile(path.join(base, 'file2.log'), '');

  const dirs = await listDirectories(base);

  // On ne teste pas l'ordre, on trie d'abord
  const sorted = dirs.sort();
  assert.deepStrictEqual(sorted, ['dir1', 'dir2']);
});

test('listDirectories retourne un tableau vide si aucun sous-dossier', async () => {
  const base = path.join(tmpRoot, 'list-directories-empty');
  await fs.rm(base, { recursive: true, force: true });
  await fs.mkdir(base, { recursive: true });

  const dirs = await listDirectories(base);

  assert.deepStrictEqual(dirs, []);
});

// ----------------------
// Tests pour listFiles
// ----------------------

test('listFiles retourne uniquement les fichiers immédiats', async () => {
  const base = path.join(tmpRoot, 'list-files');
  await fs.rm(base, { recursive: true, force: true });
  await fs.mkdir(base, { recursive: true });

  // Fichiers
  await fs.writeFile(path.join(base, 'a.txt'), '');
  await fs.writeFile(path.join(base, 'b.md'), '');

  // Dossiers
  await fs.mkdir(path.join(base, 'subdir1'));
  await fs.mkdir(path.join(base, 'subdir2'));

  const files = await listFiles(base);

  const sorted = files.sort();
  assert.deepStrictEqual(sorted, ['a.txt', 'b.md']);
});

test('listFiles retourne un tableau vide si aucun fichier', async () => {
  const base = path.join(tmpRoot, 'list-files-empty');
  await fs.rm(base, { recursive: true, force: true });
  await fs.mkdir(base, { recursive: true });

  const files = await listFiles(base);

  assert.deepStrictEqual(files, []);
});
