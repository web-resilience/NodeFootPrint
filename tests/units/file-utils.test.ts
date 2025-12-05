// fs-utils.test.ts
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';

import { accessReadable, listDirectories, listFiles } from '../../utils/file-utils.js';

// Temporary directory for tests
const tmpRoot = path.join(os.tmpdir(), `file-utils-tests-${process.pid}`);

before(async () => {
// Create the temporary directory
  await fs.rm(tmpRoot, { recursive: true, force: true });
  await fs.mkdir(tmpRoot, { recursive: true });
});

after(async () => {
  // Clean up the temporary directory
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// ----------------------
// Tests for accessReadable
// ----------------------

test('accessReadable returns ok:true when the file exists and is readable', async () => {
  const dir = path.join(tmpRoot, 'access-ok');
  await fs.mkdir(dir, { recursive: true });

  const file = path.join(dir, 'file.txt');
  await fs.writeFile(file, 'hello world');

  const result = await accessReadable(file);

  assert.deepStrictEqual(result, { ok: true });
});

test('accessReadable returns ok:false with error "not_found" if the file does not exist', async () => {
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
// Tests for listDirectories
// ----------------------

test('listDirectories returns only immediate directories', async () => {
  const base = path.join(tmpRoot, 'list-directories');
  await fs.rm(base, { recursive: true, force: true });
  await fs.mkdir(base, { recursive: true });

  // Create two directories
  await fs.mkdir(path.join(base, 'dir1'));
  await fs.mkdir(path.join(base, 'dir2'));

  // And two files
  await fs.writeFile(path.join(base, 'file1.txt'), '');
  await fs.writeFile(path.join(base, 'file2.log'), '');

  const dirs = await listDirectories(base);

  // We do not test the order, we sort first
  const sorted = dirs.sort();
  assert.deepStrictEqual(sorted, ['dir1', 'dir2']);
});

test('listDirectories returns empty array if no subdirectories', async () => {
  const base = path.join(tmpRoot, 'list-directories-empty');
  await fs.rm(base, { recursive: true, force: true });
  await fs.mkdir(base, { recursive: true });

  const dirs = await listDirectories(base);

  assert.deepStrictEqual(dirs, []);
});

// ----------------------
// Tests for listFiles
// ----------------------

test('listFiles returns only immediate files', async () => {
  const base = path.join(tmpRoot, 'list-files');
  await fs.rm(base, { recursive: true, force: true });
  await fs.mkdir(base, { recursive: true });

  // Files
  await fs.writeFile(path.join(base, 'a.txt'), '');
  await fs.writeFile(path.join(base, 'b.md'), '');

  // Directories
  await fs.mkdir(path.join(base, 'subdir1'));
  await fs.mkdir(path.join(base, 'subdir2'));

  const files = await listFiles(base);

  const sorted = files.sort();
  assert.deepStrictEqual(sorted, ['a.txt', 'b.md']);
});

test('return empty array if no files', async () => {
  const base = path.join(tmpRoot, 'list-files-empty');
  await fs.rm(base, { recursive: true, force: true });
  await fs.mkdir(base, { recursive: true });

  const files = await listFiles(base);

  assert.deepStrictEqual(files, []);
});
