#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);
const filesystemOnly = process.argv.includes('--filesystem-only');
const excludedRoots = new Set(['.git', '.next', 'coverage', 'dist', 'node_modules', 'out', 'release']);
const allowedRoots = new Set([
  '.dockerignore', '.env.example', '.gitattributes', '.github', '.gitignore',
  'CHANGELOG.md', 'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md', 'LICENSE',
  'Dockerfile', 'MODEL_LICENSES.md', 'NOTICE', 'README.md', 'README.zh-CN.md', 'SECURITY.md',
  'THIRD_PARTY_NOTICES.md', 'app', 'bin', 'controller', 'docs',
  'compose.yaml', 'eslint.config.mjs', 'next-env.d.ts', 'next.config.ts', 'package-lock.json',
  'package.json', 'packaging', 'resources', 'scripts', 'test', 'tsconfig.json',
]);
const exactSourceFiles = new Set([
  '.dockerignore', '.env.example', '.gitattributes', '.github/dependabot.yml',
  '.github/workflows/ci.yml', '.github/workflows/release.yml', '.gitignore',
  'CHANGELOG.md', 'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md', 'Dockerfile', 'LICENSE',
  'MODEL_LICENSES.md', 'NOTICE', 'README.md', 'README.zh-CN.md', 'SECURITY.md',
  'THIRD_PARTY_NOTICES.md', 'eslint.config.mjs', 'next-env.d.ts',
  'compose.yaml', 'next.config.ts', 'package-lock.json', 'package.json',
  'packaging/docker/modeldeck.env.example',
  'packaging/windows/start-modeldeck.cmd', 'resources/personas.default.json',
  'resources/providers.example.json', 'tsconfig.json',
]);
const forbiddenSegments = new Set(['cache', 'data', 'outputs', 'runtime', 'state', 'work']);
const requiredFiles = [
  '.dockerignore', '.github/workflows/ci.yml', '.github/workflows/release.yml',
  'Dockerfile', 'LICENSE', 'MODEL_LICENSES.md', 'NOTICE', 'README.md',
  'README.zh-CN.md', 'SECURITY.md', 'compose.yaml',
  'THIRD_PARTY_NOTICES.md', 'package-lock.json', 'package.json',
  'packaging/docker/modeldeck.env.example',
  'packaging/windows/start-modeldeck.cmd', 'scripts/create-release-artifacts.mjs',
  'scripts/verify-release-artifacts.mjs', 'scripts/verify-release.mjs',
];
const forbiddenSuffixes = [
  '.7z', '.appimage', '.bin', '.ckpt', '.crt', '.db', '.deb', '.dll', '.dmg',
  '.dylib', '.exe', '.flac', '.gz', '.gguf', '.jpeg', '.jpg', '.key', '.m4a',
  '.mov', '.mp3', '.mp4', '.msi', '.node', '.ogg', '.onnx', '.p12', '.pem',
  '.pfx', '.pkg', '.png', '.pt', '.pth', '.rar', '.rpm',
  '.safetensors', '.so', '.sqlite', '.sqlite3', '.sqlite-shm', '.sqlite-wal',
  '.sqlite3-shm', '.sqlite3-wal', '.tar', '.tgz', '.wav', '.webm', '.webp',
  '.whl', '.zip',
];
const secretPatterns = [
  ['private key', new RegExp('-----BEGIN ' + '(?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----')],
  ['OpenAI-style token', /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/],
  ['Anthropic token', /\bsk-ant-[A-Za-z0-9_-]{16,}\b/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ['Slack token', /\b(?:xox[baprs]|xapp)-[A-Za-z0-9-]{10,}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{30,}\b/],
  ['Hugging Face token', /\bhf_[A-Za-z0-9]{20,}\b/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/],
  ['macOS user path', /\/Users\/[^/\s"'`]+/],
  ['Linux user path', /\/home\/[^/\s"'`]+/],
  ['Windows user path', /[A-Za-z]:\\Users\\[^\\\s"'`]+/],
  ['email address', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/],
  ['private-network URL', /https?:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/],
];

const problems = [];
const files = [];

function isAllowedSourcePath(path) {
  const normalized = path.split(sep).join('/');
  if (exactSourceFiles.has(normalized)) return true;
  if (!normalized.includes('/')) return false;
  const root = normalized.split('/')[0];
  const suffixes = {
    app: ['.css', '.ts', '.tsx'],
    bin: ['.mjs'],
    controller: ['.mjs'],
    docs: ['.md'],
    scripts: ['.mjs'],
    test: ['.mjs'],
  };
  return Boolean(suffixes[root]?.some((suffix) => normalized.endsWith(suffix)));
}

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    const path = relative(repositoryRoot, absolute).split(sep).join('/');
    const root = path.split('/')[0];
    if (entry.isFile() && entry.name.endsWith('.tsbuildinfo')) continue;
    if (excludedRoots.has(root)) continue;
    if (!allowedRoots.has(root)) {
      problems.push(`${path}: root path is not on the public allowlist`);
      continue;
    }
    const details = await lstat(absolute);
    if (details.isSymbolicLink()) {
      problems.push(`${path}: symbolic links are not allowed in releases`);
      continue;
    }
    if (entry.isDirectory()) {
      const segments = path.split('/').map((segment) => segment.toLowerCase());
      if (segments.some((segment) => forbiddenSegments.has(segment))) {
        problems.push(`${path}: mutable/runtime directory is forbidden`);
        continue;
      }
      await walk(absolute);
      continue;
    }
    if (entry.isFile()) files.push({ absolute, path, size: details.size });
  }
}

await walk(repositoryRoot);

const filePaths = new Set(files.map((file) => file.path));
for (const required of requiredFiles) {
  if (!filePaths.has(required)) problems.push(`${required}: required release file is missing`);
}

try {
  await lstat(resolve(repositoryRoot, '.git'));
  const [{ stdout: trackedOutput }, { stdout: untrackedOutput }] = await Promise.all([
    execFileAsync('git', ['ls-files', '-z'], { cwd: repositoryRoot, encoding: 'buffer' }),
    execFileAsync('git', ['ls-files', '-z', '--others', '--exclude-standard'], { cwd: repositoryRoot, encoding: 'buffer' }),
  ]);
  const tracked = new Set(trackedOutput.toString('utf8').split('\0').filter(Boolean));
  const untracked = untrackedOutput.toString('utf8').split('\0').filter(Boolean);
  for (const path of tracked) {
    const root = path.split('/')[0];
    if (excludedRoots.has(root) || path.endsWith('.tsbuildinfo')) {
      problems.push(`${path}: generated output is tracked by Git`);
    } else if (!allowedRoots.has(root)) {
      problems.push(`${path}: tracked root path is not on the public allowlist`);
    }
  }
  for (const required of requiredFiles) {
    if (!tracked.has(required)) problems.push(`${required}: required release file is not tracked by Git`);
  }
  for (const path of untracked) problems.push(`${path}: public source file is not tracked by Git`);
} catch (error) {
  if (error?.code === 'ENOENT' && !filesystemOnly) problems.push('Git metadata is missing; release verification requires a Git repository');
  else if (error?.code !== 'ENOENT') problems.push(`Git tracked-file verification failed: ${error.message}`);
}

let totalBytes = 0;
for (const file of files) {
  totalBytes += file.size;
  const lower = file.path.toLowerCase();
  const suffix = extname(lower);
  const basename = lower.split('/').at(-1) || lower;
  if (!isAllowedSourcePath(file.path)) {
    problems.push(`${file.path}: file type is not on the source allowlist`);
    continue;
  }
  if (basename === '.npmrc' || basename === '.netrc' || basename === '.pypirc' || (basename.startsWith('.env') && file.path !== '.env.example')) {
    problems.push(`${file.path}: environment or package-manager credential file is forbidden`);
    continue;
  }
  if (['providers.json', 'personas.json', 'instance.json'].includes(basename)) {
    problems.push(`${file.path}: generated user configuration or state file is forbidden`);
    continue;
  }
  if (forbiddenSuffixes.some((candidate) => lower.endsWith(candidate)) || suffix === '.log') {
    problems.push(`${file.path}: forbidden binary, state, credential, log, or media suffix`);
    continue;
  }
  if (file.size > 2 * 1024 * 1024) {
    problems.push(`${file.path}: exceeds the 2 MiB source-file limit`);
    continue;
  }
  const bytes = await readFile(file.absolute);
  if (bytes.includes(0)) {
    problems.push(`${file.path}: binary content is not allowed in the source release`);
    continue;
  }
  const text = bytes.toString('utf8');
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(text)) problems.push(`${file.path}: matched ${label}`);
  }
}

if (problems.length) {
  console.error('Release boundary verification failed:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  const scope = filesystemOnly ? 'Filesystem boundary' : 'Release boundary';
  console.log(`${scope} verified: ${files.length} source files, ${totalBytes} bytes, no blocked paths or high-confidence secrets.`);
}
