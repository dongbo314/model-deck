#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDirectory = join(repositoryRoot, 'release');
const packageDocument = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'));
const version = packageDocument.version;
const expectedTag = `v${version}`;
const requestedTag = process.env.GITHUB_REF_NAME;

if (requestedTag && requestedTag !== expectedTag) {
  throw new Error(`Release tag ${requestedTag} does not match package version ${expectedTag}.`);
}

const { stdout: status } = await execFileAsync('git', ['status', '--porcelain', '--untracked-files=no'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
});
if (status.trim()) throw new Error('Tracked files must be clean before release artifacts are created.');

const { stdout: commitOutput } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' });
const commit = commitOutput.trim();
const baseName = `model-deck-core-v${version}`;
const archivePrefix = `${baseName}/`;
const zipPath = join(releaseDirectory, `${baseName}-source.zip`);
const tarPath = join(releaseDirectory, `${baseName}-source.tar.gz`);
const manifestPath = join(releaseDirectory, `${baseName}-manifest.json`);

await rm(releaseDirectory, { recursive: true, force: true });
await mkdir(releaseDirectory, { recursive: true });

await Promise.all([
  execFileAsync('git', ['archive', '--format=zip', `--prefix=${archivePrefix}`, '-o', zipPath, 'HEAD'], { cwd: repositoryRoot }),
  execFileAsync('git', ['archive', '--format=tar.gz', `--prefix=${archivePrefix}`, '-o', tarPath, 'HEAD'], { cwd: repositoryRoot }),
]);

const { stdout: fileOutput } = await execFileAsync('git', ['ls-files', '-z'], {
  cwd: repositoryRoot,
  encoding: 'buffer',
  maxBuffer: 16 * 1024 * 1024,
});
const paths = fileOutput.toString('utf8').split('\0').filter(Boolean).sort();
const files = [];
for (const path of paths) {
  const { stdout } = await execFileAsync('git', ['show', `HEAD:${path}`], {
    cwd: repositoryRoot,
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024,
  });
  files.push({
    path,
    bytes: stdout.length,
    sha256: createHash('sha256').update(stdout).digest('hex'),
  });
}

await writeFile(manifestPath, `${JSON.stringify({
  schemaVersion: 1,
  product: 'Model Deck Core',
  maturity: 'preview',
  version,
  tag: expectedTag,
  commit,
  distribution: 'source',
  supportedTargets: ['Windows 11 x64', 'Ubuntu 24.04 x64', 'macOS 14 arm64/x64'],
  files,
}, null, 2)}\n`, 'utf8');

const artifactPaths = [manifestPath, tarPath, zipPath].sort();
const checksumLines = [];
for (const path of artifactPaths) {
  const bytes = await readFile(path);
  checksumLines.push(`${createHash('sha256').update(bytes).digest('hex')}  ${basename(path)}`);
}
await writeFile(join(releaseDirectory, 'SHA256SUMS'), `${checksumLines.join('\n')}\n`, 'utf8');

const sizes = await Promise.all(artifactPaths.map(async (path) => ({ name: basename(path), bytes: (await stat(path)).size })));
console.log(JSON.stringify({ version, commit, files: paths.length, artifacts: sizes }, null, 2));
