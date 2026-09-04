#!/usr/bin/env node

try {
  const response = await fetch('http://127.0.0.1:3000/api/health', {
    cache: 'no-store',
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error(`Dashboard health returned ${response.status}.`);
  const body = await response.json();
  if (body?.status !== 'ok' || body?.controller !== 'ok') throw new Error('Dashboard health response is invalid.');
  process.exitCode = 0;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Container health check failed.');
  process.exitCode = 1;
}
