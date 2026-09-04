#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dashboardToken = 'stack-dashboard-fixture';
const managementToken = 'stack-management-fixture';
const execFileAsync = promisify(execFile);

async function freePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return port;
}

async function waitForDashboard(url, child, output) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Core exited before readiness.\n${output()}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.ok) return response;
    } catch {
      // The services are still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Timed out waiting for Core.\n${output()}`);
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolvePromise) => {
    const onExit = () => {
      clearTimeout(timer);
      resolvePromise(true);
    };
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolvePromise(false);
    }, timeoutMs);
    child.once('exit', onExit);
  });
}

async function terminateTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    await execFileAsync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }).catch(() => undefined);
  } else {
    child.kill('SIGTERM');
  }
  const graceful = await waitForExit(child, 5_000);
  if (!graceful && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await waitForExit(child, 2_000);
  }
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'Model Deck stack smoke-'));
const [controllerPort, dashboardPort] = await Promise.all([freePort(), freePort()]);
const dashboardOrigin = `http://127.0.0.1:${dashboardPort}`;
let logs = '';
const child = spawn(process.execPath, [join(repositoryRoot, 'bin', 'modeldeck.mjs'), 'start'], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    MODELDECK_HOME: temporaryRoot,
    MODELDECK_PORT: String(controllerPort),
    MODELDECK_DASHBOARD_PORT: String(dashboardPort),
    MODELDECK_DASHBOARD_TOKEN: dashboardToken,
    MODELDECK_MANAGEMENT_TOKEN: managementToken,
    NEXT_TELEMETRY_DISABLED: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
child.stdout.on('data', (chunk) => { logs = `${logs}${chunk}`.slice(-40_000); });
child.stderr.on('data', (chunk) => { logs = `${logs}${chunk}`.slice(-40_000); });

try {
  const htmlResponse = await waitForDashboard(`${dashboardOrigin}/`, child, () => logs);
  const html = await htmlResponse.text();
  assert.match(html, /Model Deck Core/);
  assert.equal(html.includes(managementToken), false);
  assert.equal(html.includes(dashboardToken), false);
  assert.match(logs, new RegExp(`#token=${dashboardToken}`));

  const healthResponse = await fetch(`${dashboardOrigin}/api/health`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), {
    status: 'ok',
    service: 'modeldeck-core-dashboard',
    controller: 'ok',
  });

  const direct = await fetch(`http://127.0.0.1:${controllerPort}/api/state`);
  assert.equal(direct.status, 401);
  const disabledApi = await fetch(`http://127.0.0.1:${controllerPort}/v1/models`);
  assert.equal(disabledApi.status, 503);

  const proxyUrl = `${dashboardOrigin}/api/controller/api/state`;
  assert.equal((await fetch(proxyUrl)).status, 401);
  assert.equal((await fetch(proxyUrl, { headers: { 'X-ModelDeck-Dashboard-Token': 'wrong-fixture' } })).status, 401);
  const dashboardHeaders = { 'X-ModelDeck-Dashboard-Token': dashboardToken };
  const stateResponse = await fetch(proxyUrl, { headers: dashboardHeaders });
  assert.equal(stateResponse.status, 200);
  const state = await stateResponse.json();
  assert.equal(state.api.baseUrl, `http://127.0.0.1:${controllerPort}`);

  const rejectedOrigin = await fetch(`${dashboardOrigin}/api/controller/api/personas`, {
    method: 'POST',
    headers: { ...dashboardHeaders, 'Content-Type': 'application/json', Origin: 'https://example.invalid' },
    body: JSON.stringify({ name: 'Rejected', systemPrompt: 'Must not be stored.' }),
  });
  assert.equal(rejectedOrigin.status, 403);

  const writeHeaders = { ...dashboardHeaders, 'Content-Type': 'application/json', Origin: dashboardOrigin };
  const createdResponse = await fetch(`${dashboardOrigin}/api/controller/api/personas`, {
    method: 'POST',
    headers: writeHeaders,
    body: JSON.stringify({ name: 'Stack smoke', description: 'Temporary fixture', systemPrompt: 'Test only.' }),
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  const deleted = await fetch(`${dashboardOrigin}/api/controller/api/personas/${created.persona.id}`, {
    method: 'DELETE',
    headers: { ...dashboardHeaders, Origin: dashboardOrigin },
  });
  assert.equal(deleted.status, 204);

  console.log(`Stack smoke passed on dashboard ${dashboardPort} and controller ${controllerPort}.`);
} finally {
  await terminateTree(child);
  await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
