import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function absoluteOverride(value, paths, name) {
  const candidate = nonEmpty(value);
  if (!candidate) return null;
  if (!paths.isAbsolute(candidate)) throw new Error(`${name} must be an absolute path.`);
  return candidate;
}

export function resolveUserPaths({ env = process.env, platform = process.platform, home = homedir(), pathApi } = {}) {
  const paths = pathApi || (platform === 'win32' ? win32 : posix);
  const { join, resolve } = paths;
  const portableRoot = absoluteOverride(env.MODELDECK_HOME, paths, 'MODELDECK_HOME');
  if (portableRoot) {
    const root = resolve(portableRoot);
    return {
      configDir: join(root, 'config'),
      dataDir: join(root, 'data'),
      stateDir: join(root, 'state'),
      cacheDir: join(root, 'cache'),
    };
  }

  if (platform === 'win32') {
    const roaming = resolve(absoluteOverride(env.APPDATA, paths, 'APPDATA') || join(home, 'AppData', 'Roaming'));
    const local = resolve(absoluteOverride(env.LOCALAPPDATA, paths, 'LOCALAPPDATA') || join(home, 'AppData', 'Local'));
    return {
      configDir: resolve(absoluteOverride(env.MODELDECK_CONFIG_DIR, paths, 'MODELDECK_CONFIG_DIR') || join(roaming, 'ModelDeck')),
      dataDir: resolve(absoluteOverride(env.MODELDECK_DATA_DIR, paths, 'MODELDECK_DATA_DIR') || join(local, 'ModelDeck', 'data')),
      stateDir: resolve(absoluteOverride(env.MODELDECK_STATE_DIR, paths, 'MODELDECK_STATE_DIR') || join(local, 'ModelDeck', 'state')),
      cacheDir: resolve(absoluteOverride(env.MODELDECK_CACHE_DIR, paths, 'MODELDECK_CACHE_DIR') || join(local, 'ModelDeck', 'cache')),
    };
  }

  if (platform === 'darwin') {
    const appSupport = join(home, 'Library', 'Application Support', 'ModelDeck');
    const caches = join(home, 'Library', 'Caches', 'ModelDeck');
    return {
      configDir: resolve(absoluteOverride(env.MODELDECK_CONFIG_DIR, paths, 'MODELDECK_CONFIG_DIR') || join(appSupport, 'config')),
      dataDir: resolve(absoluteOverride(env.MODELDECK_DATA_DIR, paths, 'MODELDECK_DATA_DIR') || join(appSupport, 'data')),
      stateDir: resolve(absoluteOverride(env.MODELDECK_STATE_DIR, paths, 'MODELDECK_STATE_DIR') || join(appSupport, 'state')),
      cacheDir: resolve(absoluteOverride(env.MODELDECK_CACHE_DIR, paths, 'MODELDECK_CACHE_DIR') || caches),
    };
  }

  return {
    configDir: resolve(absoluteOverride(env.MODELDECK_CONFIG_DIR, paths, 'MODELDECK_CONFIG_DIR') || join(absoluteOverride(env.XDG_CONFIG_HOME, paths, 'XDG_CONFIG_HOME') || join(home, '.config'), 'modeldeck')),
    dataDir: resolve(absoluteOverride(env.MODELDECK_DATA_DIR, paths, 'MODELDECK_DATA_DIR') || join(absoluteOverride(env.XDG_DATA_HOME, paths, 'XDG_DATA_HOME') || join(home, '.local', 'share'), 'modeldeck')),
    stateDir: resolve(absoluteOverride(env.MODELDECK_STATE_DIR, paths, 'MODELDECK_STATE_DIR') || join(absoluteOverride(env.XDG_STATE_HOME, paths, 'XDG_STATE_HOME') || join(home, '.local', 'state'), 'modeldeck')),
    cacheDir: resolve(absoluteOverride(env.MODELDECK_CACHE_DIR, paths, 'MODELDECK_CACHE_DIR') || join(absoluteOverride(env.XDG_CACHE_HOME, paths, 'XDG_CACHE_HOME') || join(home, '.cache'), 'modeldeck')),
  };
}

export function resolveCoreFiles(options = {}) {
  const paths = resolveUserPaths(options);
  const platform = options.platform || process.platform;
  const pathApi = options.pathApi || (platform === 'win32' ? win32 : posix);
  return {
    ...paths,
    providersPath: pathApi.join(paths.configDir, 'providers.json'),
    personasPath: pathApi.join(paths.dataDir, 'personas.json'),
    instancePath: pathApi.join(paths.stateDir, 'instance.json'),
  };
}
