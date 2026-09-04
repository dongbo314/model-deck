import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { resolveUserPaths } from '../controller/config/paths.mjs';

test('portable MODELDECK_HOME has deterministic subdirectories', () => {
  const result = resolveUserPaths({ env: { MODELDECK_HOME: 'C:\\Portable Root' }, platform: 'win32', home: 'ignored' });
  assert.equal(result.configDir, path.win32.resolve('C:\\Portable Root', 'config'));
  assert.equal(result.dataDir, path.win32.resolve('C:\\Portable Root', 'data'));
  assert.equal(result.stateDir, path.win32.resolve('C:\\Portable Root', 'state'));
  assert.equal(result.cacheDir, path.win32.resolve('C:\\Portable Root', 'cache'));
});

test('path overrides must be absolute', () => {
  const linuxHome = ['/home', 'tester'].join('/');
  assert.throws(() => resolveUserPaths({
    platform: 'linux',
    home: linuxHome,
    env: { MODELDECK_HOME: 'relative/core' },
  }), /MODELDECK_HOME must be an absolute path/);
  assert.throws(() => resolveUserPaths({
    platform: 'linux',
    home: linuxHome,
    env: { XDG_CONFIG_HOME: 'relative/config' },
  }), /XDG_CONFIG_HOME must be an absolute path/);
  assert.throws(() => resolveUserPaths({
    platform: 'win32',
    home: 'C:\\Profiles\\Tester',
    env: { MODELDECK_CONFIG_DIR: 'relative\\config' },
  }), /MODELDECK_CONFIG_DIR must be an absolute path/);
});

test('Linux follows XDG directory variables', () => {
  const result = resolveUserPaths({
    platform: 'linux',
    home: ['/home', 'tester'].join('/'),
    env: {
      XDG_CONFIG_HOME: '/tmp/config',
      XDG_DATA_HOME: '/tmp/data',
      XDG_STATE_HOME: '/tmp/state',
      XDG_CACHE_HOME: '/tmp/cache',
    },
  });
  assert.equal(result.configDir, path.posix.resolve('/tmp/config/modeldeck'));
  assert.equal(result.dataDir, path.posix.resolve('/tmp/data/modeldeck'));
  assert.equal(result.stateDir, path.posix.resolve('/tmp/state/modeldeck'));
  assert.equal(result.cacheDir, path.posix.resolve('/tmp/cache/modeldeck'));
});

test('Windows separates roaming configuration from local mutable data', () => {
  const result = resolveUserPaths({
    platform: 'win32',
    home: 'C:\\Profiles\\Tester',
    env: { APPDATA: 'C:\\Roaming', LOCALAPPDATA: 'C:\\Local' },
  });
  assert.match(result.configDir, /Roaming/);
  assert.match(result.dataDir, /Local/);
  assert.match(result.stateDir, /Local/);
});
