#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDirectory = join(repositoryRoot, 'release');
const packageDocument = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'));
const version = packageDocument.version;
const tag = `v${version}`;
const baseName = `model-deck-core-v${version}`;
const archivePrefix = `${baseName}/`;
const artifactNames = [
  `${baseName}-manifest.json`,
  `${baseName}-source.tar.gz`,
  `${baseName}-source.zip`,
].sort();

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateArchiveEntries(output, label) {
  const entries = output.split(/\r?\n/).filter(Boolean);
  assert(entries.length > 0, `${label} has no entries.`);
  for (const entry of entries) {
    const normalized = entry.replaceAll('\\', '/');
    assert(normalized === archivePrefix || normalized.startsWith(archivePrefix), `${label} contains a path outside ${archivePrefix}: ${entry}`);
    const childPath = normalized.slice(archivePrefix.length);
    assert(!childPath.startsWith('/') && !childPath.split('/').includes('..'), `${label} contains an unsafe path: ${entry}`);
  }
}

async function listFiles(root, directory = root) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    const details = await lstat(absolute);
    assert(!details.isSymbolicLink(), `Extracted archive contains a symbolic link: ${relative(root, absolute)}`);
    if (entry.isDirectory()) paths.push(...await listFiles(root, absolute));
    else {
      assert(entry.isFile(), `Extracted archive contains a non-file entry: ${relative(root, absolute)}`);
      paths.push(relative(root, absolute).split(sep).join('/'));
    }
  }
  return paths.sort();
}

async function verifyExtractedArchive(root, manifestFiles, label) {
  const actualPaths = await listFiles(root);
  const expectedPaths = manifestFiles.map((file) => file.path);
  assert(JSON.stringify(actualPaths) === JSON.stringify(expectedPaths), `${label} file list does not match the release manifest.`);

  for (const file of manifestFiles) {
    const bytes = await readFile(join(root, ...file.path.split('/')));
    assert(bytes.length === file.bytes, `${label}:${file.path} byte count does not match the release manifest.`);
    assert(sha256(bytes) === file.sha256, `${label}:${file.path} SHA-256 does not match the release manifest.`);
  }
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
const { stdout: commitOutput } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' });
const commit = commitOutput.trim();
assert(manifest.schemaVersion === 1, 'Unsupported release manifest schema.');
assert(manifest.version === version, 'Release manifest version does not match package.json.');
assert(manifest.tag === tag, 'Release manifest tag does not match package.json.');
assert(manifest.commit === commit, 'Release manifest commit does not match HEAD.');
assert(Array.isArray(manifest.files) && manifest.files.length > 0, 'Release manifest has no files.');

const manifestPaths = manifest.files.map((file) => file.path);
assert(new Set(manifestPaths).size === manifestPaths.length, 'Release manifest contains duplicate paths.');
assert(JSON.stringify(manifestPaths) === JSON.stringify([...manifestPaths].sort()), 'Release manifest paths are not sorted.');
for (const file of manifest.files) {
  assert(typeof file.path === 'string' && file.path.length > 0, 'Release manifest contains an invalid path.');
  assert(!file.path.startsWith('/') && !file.path.split('/').includes('..'), `Release manifest contains an unsafe path: ${file.path}`);
  assert(Number.isSafeInteger(file.bytes) && file.bytes >= 0, `Release manifest contains an invalid byte count: ${file.path}`);
  assert(/^[0-9a-f]{64}$/.test(file.sha256), `Release manifest contains an invalid SHA-256: ${file.path}`);
}

const tarPath = join(releaseDirectory, `${baseName}-source.tar.gz`);
const zipPath = join(releaseDirectory, `${baseName}-source.zip`);
const [{ stdout: tarEntries }, { stdout: zipEntries }] = await Promise.all([
  execFileAsync('tar', ['-tzf', tarPath], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }),
  execFileAsync('unzip', ['-Z1', zipPath], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }),
]);
validateArchiveEntries(tarEntries, basename(tarPath));
validateArchiveEntries(zipEntries, basename(zipPath));

const extractionDirectory = await mkdtemp(join(tmpdir(), 'model-deck-release-verify-'));
try {
  const tarDirectory = join(extractionDirectory, 'tar');
  const zipDirectory = join(extractionDirectory, 'zip');
  await Promise.all([
    mkdir(tarDirectory),
    mkdir(zipDirectory),
  ]);
  await Promise.all([
    execFileAsync('tar', ['-xzf', tarPath, '-C', tarDirectory]),
    execFileAsync('unzip', ['-q', zipPath, '-d', zipDirectory]),
  ]);
  await verifyExtractedArchive(join(tarDirectory, baseName), manifest.files, 'tar.gz');
  await verifyExtractedArchive(join(zipDirectory, baseName), manifest.files, 'ZIP');
} finally {
  await rm(extractionDirectory, { recursive: true, force: true });
}

console.log(`Release artifacts verified: ${manifest.files.length} files match the manifest in ZIP and tar.gz.`);
