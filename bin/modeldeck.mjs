#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { initializeCore } from '../controller/bootstrap.mjs';
import { resolveCoreFiles } from '../controller/config/paths.mjs';
import { runDoctor } from '../controller/doctor.mjs';
import { assertListenHost, controllerTargetHost, isContainerMode } from '../controller/network-policy.mjs';
import { sanitizedNextEnvironment } from '../scripts/run-next.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function printHelp() {
  console.log(`Model Deck Core Preview

Usage:
  modeldeck init
  modeldeck doctor [--json]
  modeldeck config-path [--json]
  modeldeck dev
  modeldeck start

Core Preview exposes services only on the host loopback interface. The supported
Docker Compose profile uses an isolated container-only wildcard listener.
Provider credentials are read from environment variables named by providers.json.`);
}

function childProcess(command, args, env) {
  return spawn(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
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

function assertLoopback(host) {
  assertListenHost(host, { env: {} });
}

function normalizedPort(value, name) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${name} must be an integer from 1 to 65535.`);
  return String(port);
}

export { assertLoopback, normalizedPort };

async function runStack(mode) {
  if (mode === 'start' && !existsSync(resolve(root, '.next', 'BUILD_ID'))) {
    throw new Error('Dashboard build is missing. Run npm run build first.');
  }
  await initializeCore();
  const managementToken = process.env.MODELDECK_MANAGEMENT_TOKEN || randomBytes(32).toString('base64url');
  const dashboardToken = process.env.MODELDECK_DASHBOARD_TOKEN || randomBytes(32).toString('base64url');
  const controllerEnv = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    MODELDECK_MANAGEMENT_TOKEN: managementToken,
    MODELDECK_HOST: process.env.MODELDECK_HOST || '127.0.0.1',
    MODELDECK_PORT: normalizedPort(process.env.MODELDECK_PORT || '8080', 'MODELDECK_PORT'),
    MODELDECK_DASHBOARD_HOST: process.env.MODELDECK_DASHBOARD_HOST || '127.0.0.1',
    MODELDECK_DASHBOARD_PORT: normalizedPort(process.env.MODELDECK_DASHBOARD_PORT || '3000', 'MODELDECK_DASHBOARD_PORT'),
  };
  delete controllerEnv.MODELDECK_DASHBOARD_TOKEN;
  assertListenHost(controllerEnv.MODELDECK_HOST, { env: controllerEnv });
  assertListenHost(controllerEnv.MODELDECK_DASHBOARD_HOST, { env: controllerEnv });
  const containerMode = isContainerMode(controllerEnv);
  const dashboardEnv = {
    ...sanitizedNextEnvironment(controllerEnv),
    MODELDECK_MANAGEMENT_TOKEN: managementToken,
    MODELDECK_DASHBOARD_TOKEN: dashboardToken,
    MODELDECK_HOST: controllerTargetHost(controllerEnv.MODELDECK_HOST, { env: controllerEnv }),
    MODELDECK_PORT: controllerEnv.MODELDECK_PORT,
    MODELDECK_DASHBOARD_HOST: controllerEnv.MODELDECK_DASHBOARD_HOST,
    MODELDECK_DASHBOARD_PORT: controllerEnv.MODELDECK_DASHBOARD_PORT,
  };
  const displayHost = containerMode ? '127.0.0.1' : dashboardEnv.MODELDECK_DASHBOARD_HOST;
  const dashboardDisplayHost = displayHost === '::1' ? '[::1]' : displayHost;
  console.log(`Model Deck Core dashboard: http://${dashboardDisplayHost}:${dashboardEnv.MODELDECK_DASHBOARD_PORT}/#token=${encodeURIComponent(dashboardToken)}`);
  const nextCli = require.resolve('next/dist/bin/next');
  const controller = childProcess(process.execPath, [resolve(root, 'controller', 'main.mjs')], controllerEnv);
  const dashboard = childProcess(process.execPath, [nextCli, mode === 'dev' ? 'dev' : 'start', '-H', dashboardEnv.MODELDECK_DASHBOARD_HOST, '-p', dashboardEnv.MODELDECK_DASHBOARD_PORT], dashboardEnv);
  const children = [controller, dashboard];
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    for (const child of children) if (child.exitCode === null) child.kill();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  let result;
  let failure;
  try {
    result = await Promise.race(children.map((child) => new Promise((resolvePromise, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolvePromise({ code, signal }));
    })));
  } catch (error) {
    failure = error;
  } finally {
    const unexpectedExit = !stopping;
    stop();
    const graceful = await Promise.all(children.map((child) => waitForExit(child, 10_000)));
    await Promise.all(children.map(async (child, index) => {
      if (!graceful[index] && child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await waitForExit(child, 2_000);
      }
    }));
    if (unexpectedExit && !failure) process.exitCode = result?.code && result.code !== 0 ? result.code : 1;
  }
  if (failure) throw failure;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const command = positionals[0] || 'help';
  if (values.help || command === 'help') return printHelp();

  if (command === 'init') {
    const state = await initializeCore();
    const result = { status: 'initialized', configPath: state.files.providersPath, dataPath: state.files.dataDir };
    console.log(values.json ? JSON.stringify(result) : `Initialized Model Deck Core.\nConfig: ${result.configPath}\nData: ${result.dataPath}`);
    return;
  }

  if (command === 'config-path') {
    const files = resolveCoreFiles();
    const result = { configPath: files.providersPath, dataPath: files.dataDir, statePath: files.stateDir };
    console.log(values.json ? JSON.stringify(result) : result.configPath);
    return;
  }

  if (command === 'doctor') {
    const result = await runDoctor();
    if (values.json) console.log(JSON.stringify(result));
    else {
      console.log(`Model Deck Core doctor: ${result.ok ? 'ready' : 'blocked'}`);
      for (const check of result.checks) console.log(`${check.level === 'ok' ? '✓' : check.level === 'warning' ? '!' : '✗'} ${check.message}`);
    }
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (command === 'dev' || command === 'start') return runStack(command);
  throw new Error(`Unknown command: ${command}`);
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]));
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
