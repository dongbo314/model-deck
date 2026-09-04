#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function readDocument(path) {
  if (path !== '-') return readFile(path, 'utf8');

  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

const [manifestPath, ...expectedPlatforms] = process.argv.slice(2);
assert(manifestPath, 'Usage: verify-container-index.mjs <manifest.json|-> <platform> [...]');
assert(expectedPlatforms.length > 0, 'At least one expected platform is required.');
assert(expectedPlatforms.every((platform) => /^linux\/(?:amd64|arm64)$/.test(platform)), 'Expected platforms must be supported Linux targets.');
assert(new Set(expectedPlatforms).size === expectedPlatforms.length, 'Expected platforms must be unique.');

const document = JSON.parse(await readDocument(manifestPath));
assert(document.schemaVersion === 2, 'Container index schema version is invalid.');
assert(Array.isArray(document.manifests), 'Container index has no manifests.');

const runtimePlatforms = document.manifests
  .filter((entry) => entry.annotations?.['vnd.docker.reference.type'] !== 'attestation-manifest')
  .map((entry) => `${entry.platform?.os}/${entry.platform?.architecture}`)
  .sort();
assert.deepEqual(runtimePlatforms, [...expectedPlatforms].sort(), 'Container index runtime platforms do not match the release targets.');

const attestations = document.manifests.filter((entry) => entry.annotations?.['vnd.docker.reference.type'] === 'attestation-manifest');
assert(attestations.length >= expectedPlatforms.length, 'Container index is missing provenance or SBOM attestations.');
assert(attestations.every((entry) => entry.platform?.os === 'unknown' && entry.platform?.architecture === 'unknown'), 'Container attestation descriptors must use unknown/unknown.');

console.log(`Container index verified for ${expectedPlatforms.join(', ')} with ${attestations.length} attestation descriptor(s).`);
