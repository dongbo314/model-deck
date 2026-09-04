import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readJson } from '../controller/storage/atomic-json.mjs';

test('JSON reader accepts a UTF-8 BOM from Windows editors', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'Model Deck BOM-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'providers.json');
  await writeFile(path, '\uFEFF{"schemaVersion":1,"providers":[]}', 'utf8');
  assert.deepEqual(await readJson(path, null), { schemaVersion: 1, providers: [] });
});
