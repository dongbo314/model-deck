#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDirectory = join(repositoryRoot, 'release');
const packageDocument = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'));
const version = packageDocument.version;
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
if (typeof version !== 'string' || version.length > 64 || !semverPattern.test(version)) {
  throw new Error('package.json version must be a safe SemVer value.');
}

const tag = `v${version}`;
const requestedTag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : null;
if (requestedTag && requestedTag !== tag) {
  throw new Error(`Release tag ${requestedTag} does not match package version ${tag}.`);
}

const baseName = `model-deck-core-v${version}`;
const artifactNames = [
  `${baseName}-manifest.json`,
  `${baseName}-source.tar.gz`,
  `${baseName}-source.zip`,
].sort();
const archiveEnvironment = { ...process.env, TZ: 'UTC' };

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validatePortablePath(path) {
  assert(typeof path === 'string' && path.length > 0, 'Release manifest contains an invalid path.');
  assert(!path.startsWith('/') && !path.includes('\\'), `Release path must be a relative POSIX path: ${path}`);
  const segments = path.split('/');
  assert(segments.every((segment) => segment && segment !== '.' && segment !== '..'), `Release path contains an unsafe segment: ${path}`);
  for (const segment of segments) {
    assert(!/[<>:"|?*\u0000-\u001f\u007f]/.test(segment), `Release path is not Windows portable: ${path}`);
    assert(!/[ .]$/.test(segment), `Release path has a Windows-unsafe suffix: ${path}`);
    const stem = segment.split('.')[0].toUpperCase();
    assert(!/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem), `Release path uses a Windows-reserved name: ${path}`);
  }
}

const { stdout: statusOutput } = await execFileAsync('git', ['status', '--porcelain', '--untracked-files=no'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
});
assert(!statusOutput.trim(), 'Tracked files must be clean before release artifacts are verified.');

const [{ stdout: commitOutput }, { stdout: fileOutput }] = await Promise.all([
  execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }),
  execFileAsync('git', ['ls-files', '-z'], {
    cwd: repositoryRoot,
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024,
  }),
]);
const commit = commitOutput.trim();
const gitPaths = fileOutput.toString('utf8').split('\0').filter(Boolean).sort();
const caseFoldedPaths = new Map();
for (const path of gitPaths) {
  validatePortablePath(path);
  const folded = path.toLowerCase();
  assert(!caseFoldedPaths.has(folded), `Release paths collide on case-insensitive filesystems: ${caseFoldedPaths.get(folded)} and ${path}`);
  caseFoldedPaths.set(folded, path);
}

const checksumText = await readFile(join(releaseDirectory, 'SHA256SUMS'), 'utf8');
const checksums = new Map();
for (const line of checksumText.trimEnd().split(/\r?\n/)) {
  const match = /^([0-9a-f]{64})  ([^/\\]+)$/.exec(line);
  assert(match, `Invalid SHA256SUMS line: ${line}`);
  assert(!checksums.has(match[2]), `Duplicate SHA256SUMS entry: ${match[2]}`);
  checksums.set(match[2], match[1]);
}
assert(JSON.stringify([...checksums.keys()].sort()) === JSON.stringify(artifactNames), 'SHA256SUMS does not list the exact release artifact set.');
for (const name of artifactNames) {
  const bytes = await readFile(join(releaseDirectory, name));
  assert(sha256(bytes) === checksums.get(name), `${name} does not match SHA256SUMS.`);
}

const manifest = JSON.parse(await readFile(join(releaseDirectory, `${baseName}-manifest.json`), 'utf8'));
assert(manifest.schemaVersion === 1, 'Unsupported release manifest schema.');
assert(manifest.product === 'Model Deck Core', 'Release manifest product is invalid.');
assert(manifest.maturity === 'preview', 'Release manifest maturity is invalid.');
assert(manifest.distribution === 'source', 'Release manifest distribution is invalid.');
assert(manifest.version === version, 'Release manifest version does not match package.json.');
assert(manifest.tag === tag, 'Release manifest tag does not match package.json.');
assert(manifest.commit === commit, 'Release manifest commit does not match HEAD.');
assert(Array.isArray(manifest.files) && manifest.files.length > 0, 'Release manifest has no files.');

const manifestPaths = manifest.files.map((file) => file.path);
assert(new Set(manifestPaths).size === manifestPaths.length, 'Release manifest contains duplicate paths.');
assert(JSON.stringify(manifestPaths) === JSON.stringify(gitPaths), 'Release manifest file list does not match the tagged Git tree.');
for (const file of manifest.files) {
  validatePortablePath(file.path);
  assert(Number.isSafeInteger(file.bytes) && file.bytes >= 0, `Release manifest contains an invalid byte count: ${file.path}`);
  assert(/^[0-9a-f]{64}$/.test(file.sha256), `Release manifest contains an invalid SHA-256: ${file.path}`);
  const { stdout: expectedBytes } = await execFileAsync('git', [
    'cat-file', '--filters', `--path=${file.path}`, `HEAD:${file.path}`,
  ], {
    cwd: repositoryRoot,
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024,
  });
  assert(expectedBytes.length === file.bytes, `${file.path} byte count is not derived from the tagged Git tree.`);
  assert(sha256(expectedBytes) === file.sha256, `${file.path} SHA-256 is not derived from the tagged Git tree.`);
}

const expectedDirectory = await mkdtemp(join(tmpdir(), 'model-deck-release-expected-'));
try {
  const expectedZipPath = join(expectedDirectory, `${baseName}-source.zip`);
  const expectedTarPath = join(expectedDirectory, `${baseName}-source.tar.gz`);
  await Promise.all([
    execFileAsync('git', ['archive', '--format=zip', `--prefix=${baseName}/`, '-o', expectedZipPath, 'HEAD'], {
      cwd: repositoryRoot,
      env: archiveEnvironment,
    }),
    execFileAsync('git', ['archive', '--format=tar.gz', `--prefix=${baseName}/`, '-o', expectedTarPath, 'HEAD'], {
      cwd: repositoryRoot,
      env: archiveEnvironment,
    }),
  ]);
  for (const expectedPath of [expectedTarPath, expectedZipPath]) {
    const name = expectedPath.endsWith('.zip') ? `${baseName}-source.zip` : `${baseName}-source.tar.gz`;
    const [actualBytes, expectedBytes] = await Promise.all([
      readFile(join(releaseDirectory, name)),
      readFile(expectedPath),
    ]);
    assert(actualBytes.equals(expectedBytes), `${name} is not the reproducible archive of the tagged Git tree.`);
  }
} finally {
  await rm(expectedDirectory, { recursive: true, force: true });
}

console.log(`Release artifacts verified: ${manifest.files.length} exported files and both archives are bound to ${commit}.`);
