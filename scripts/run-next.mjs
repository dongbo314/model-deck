#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function sanitizedNextEnvironment(source = process.env) {
  const allowed = new Set([
    'APPDATA', 'CI', 'COMSPEC', 'DYLD_LIBRARY_PATH', 'FORCE_COLOR', 'HOME',
    'LANG', 'LC_ALL', 'LD_LIBRARY_PATH', 'LOCALAPPDATA', 'NODE_ENV',
    'NODE_EXTRA_CA_CERTS', 'NODE_OPTIONS', 'NO_COLOR', 'PATH', 'PATHEXT',
    'Path', 'SSL_CERT_FILE', 'SYSTEMROOT', 'SystemRoot', 'TEMP', 'TERM',
    'TERM_PROGRAM', 'TMP', 'TMPDIR', 'TZ', 'USERPROFILE', 'WINDIR',
    'XDG_CACHE_HOME', 'XDG_CONFIG_HOME',
  ]);
  const environment = { NEXT_TELEMETRY_DISABLED: '1' };
  for (const [name, value] of Object.entries(source)) {
    if (allowed.has(name) && value !== undefined) environment[name] = value;
  }
  return environment;
}

function main() {
  const command = process.argv[2];
  if (!['build'].includes(command)) {
    console.error('Usage: node scripts/run-next.mjs build');
    process.exitCode = 1;
    return;
  }
  const require = createRequire(import.meta.url);
  const environment = sanitizedNextEnvironment();
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), command], {
    env: environment,
    stdio: 'inherit',
    windowsHide: true,
  });
  child.once('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.once('exit', (code) => {
    process.exitCode = typeof code === 'number' ? code : 1;
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
