import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const verifier = resolve('scripts/verify-container-index.mjs');

function indexFor(platforms) {
  return {
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.index.v1+json',
    manifests: platforms.flatMap((platform, index) => {
      const [os, architecture] = platform.split('/');
      return [
        {
          mediaType: 'application/vnd.oci.image.manifest.v1+json',
          digest: `sha256:${String(index + 1).repeat(64)}`,
          size: 1,
          platform: { os, architecture },
        },
        {
          mediaType: 'application/vnd.oci.image.manifest.v1+json',
          digest: `sha256:${String(index + 3).repeat(64)}`,
          size: 1,
          annotations: { 'vnd.docker.reference.type': 'attestation-manifest' },
          platform: { os: 'unknown', architecture: 'unknown' },
        },
      ];
    }),
  };
}

test('container index verifier accepts exactly the requested runtime platforms and attestations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'modeldeck-index-'));
  const path = join(directory, 'index.json');
  try {
    await writeFile(path, JSON.stringify(indexFor(['linux/amd64', 'linux/arm64'])));
    const { stdout } = await execFileAsync(process.execPath, [verifier, path, 'linux/amd64', 'linux/arm64']);
    assert.match(stdout, /Container index verified/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('container index verifier rejects a missing release platform', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'modeldeck-index-'));
  const path = join(directory, 'index.json');
  try {
    await writeFile(path, JSON.stringify(indexFor(['linux/amd64'])));
    await assert.rejects(
      execFileAsync(process.execPath, [verifier, path, 'linux/amd64', 'linux/arm64']),
      /runtime platforms do not match/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('container index verifier accepts a manifest from standard input', async () => {
  const document = JSON.stringify(indexFor(['linux/arm64']));
  const stdout = execFileSync(process.execPath, [verifier, '-', 'linux/arm64'], { encoding: 'utf8', input: document });
  assert.match(stdout, /verified for linux\/arm64/);
});
