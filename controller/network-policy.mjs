import { existsSync } from 'node:fs';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const CONTAINER_MARKERS = ['/.dockerenv', '/run/.containerenv'];

export function isLoopbackListenHost(host) {
  return LOOPBACK_HOSTS.has(String(host || ''));
}

export function isContainerRuntime(markerExists = existsSync) {
  return CONTAINER_MARKERS.some((path) => markerExists(path));
}

export function isContainerMode(env = process.env, markerExists = existsSync) {
  return env.MODELDECK_CONTAINER_MODE === '1' && isContainerRuntime(markerExists);
}

export function assertListenHost(host, { env = process.env, markerExists = existsSync } = {}) {
  if (isLoopbackListenHost(host)) return;
  if (host === '0.0.0.0' && isContainerMode(env, markerExists)) return;
  throw new Error('Core Preview is loopback-only; 0.0.0.0 is allowed only inside the supported container runtime.');
}

export function controllerTargetHost(listenHost, { env = process.env, markerExists = existsSync } = {}) {
  if (listenHost === '0.0.0.0' && isContainerMode(env, markerExists)) return '127.0.0.1';
  return listenHost;
}
