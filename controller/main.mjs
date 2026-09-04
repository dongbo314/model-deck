import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeCore } from './bootstrap.mjs';
import { createCoreHttpServer } from './http/server.mjs';
import { assertListenHost } from './network-policy.mjs';

function parsePort(value, fallback) {
  const port = Number(value || fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid port: ${value}`);
  return port;
}

export async function startController({ env = process.env, host, port, fetchImpl = fetch, platform = process.platform, home } = {}) {
  const runtimeEnv = {
    ...env,
    MODELDECK_MANAGEMENT_TOKEN: String(env.MODELDECK_MANAGEMENT_TOKEN || '').trim() || randomBytes(32).toString('base64url'),
  };
  const listenHost = host || runtimeEnv.MODELDECK_HOST || '127.0.0.1';
  const listenPort = port ?? parsePort(runtimeEnv.MODELDECK_PORT, 8080);
  assertListenHost(listenHost, { env: runtimeEnv });
  const initialized = await initializeCore({ env: runtimeEnv, platform, home });
  const state = { ...initialized, instanceId: randomBytes(8).toString('hex') };
  const server = createCoreHttpServer({ state, env: runtimeEnv, fetchImpl, platform });
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(listenPort, listenHost, resolvePromise);
  });
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : listenPort;
  return {
    server,
    state,
    host: listenHost,
    port: actualPort,
    url: `http://${listenHost === '::1' ? '[::1]' : listenHost}:${actualPort}`,
    managementToken: runtimeEnv.MODELDECK_MANAGEMENT_TOKEN,
    close: () => new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise())),
  };
}

async function main() {
  const running = await startController();
  console.log(`Model Deck Core controller: ${running.url}`);
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await running.close().catch(() => undefined);
  };
  process.once('SIGINT', () => void close());
  process.once('SIGTERM', () => void close());
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
