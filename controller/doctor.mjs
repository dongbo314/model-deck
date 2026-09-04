import { access, constants, readFile } from 'node:fs/promises';
import { initializeCore } from './bootstrap.mjs';
import { publicProviders } from './config/providers.mjs';

function versionTuple(value) {
  return String(value).replace(/^v/, '').split('.').map((part) => Number(part) || 0);
}

function atLeast(actual, required) {
  for (let index = 0; index < required.length; index += 1) {
    if ((actual[index] || 0) > required[index]) return true;
    if ((actual[index] || 0) < required[index]) return false;
  }
  return true;
}

export function supportedArchitecture(platform = process.platform, architecture = process.arch) {
  if (platform === 'darwin') return ['arm64', 'x64'].includes(architecture);
  if (platform === 'linux' || platform === 'win32') return architecture === 'x64';
  return false;
}

export async function runDoctor({ env = process.env, platform = process.platform, architecture = process.arch, home } = {}) {
  const checks = [];
  const nodeOk = atLeast(versionTuple(process.versions.node), [22, 13, 0]);
  checks.push({ id: 'node', ok: nodeOk, level: nodeOk ? 'ok' : 'error', message: `Node ${process.versions.node}; required >=22.13.0` });
  const platformOk = ['darwin', 'linux', 'win32'].includes(platform);
  checks.push({ id: 'platform', ok: platformOk, level: platformOk ? 'ok' : 'error', message: `Platform ${platform}` });
  const architectureOk = supportedArchitecture(platform, architecture);
  checks.push({
    id: 'architecture',
    ok: architectureOk,
    level: architectureOk ? 'ok' : 'error',
    message: `Architecture ${architecture}; supported targets are Windows x64, Linux x64, and macOS arm64/x64`,
  });

  let core;
  try {
    core = await initializeCore({ env, platform, home });
    for (const [id, path] of Object.entries({ config: core.files.configDir, data: core.files.dataDir, state: core.files.stateDir, cache: core.files.cacheDir })) {
      await access(path, constants.R_OK | constants.W_OK);
      checks.push({ id: `directory-${id}`, ok: true, level: 'ok', message: `${id} directory is writable` });
    }
    JSON.parse(await readFile(core.files.providersPath, 'utf8'));
    checks.push({ id: 'providers-config', ok: true, level: 'ok', message: 'providers.json is valid JSON' });
    const providers = publicProviders(core.providers, env);
    if (!providers.length) {
      checks.push({ id: 'provider', ok: false, level: 'warning', message: `No provider configured; edit ${core.files.providersPath}` });
    } else {
      for (const provider of providers) {
        checks.push({
          id: `provider-${provider.id}`,
          ok: provider.credentialConfigured,
          level: provider.credentialConfigured ? 'ok' : 'warning',
          message: provider.credentialConfigured ? `${provider.name} is configured` : `${provider.name} is missing ${provider.apiKeyEnv}`,
        });
      }
    }
  } catch (error) {
    checks.push({ id: 'configuration', ok: false, level: 'error', message: error.message });
  }

  return {
    ok: checks.every((check) => check.level !== 'error'),
    edition: 'core',
    maturity: 'preview',
    platform,
    architecture,
    paths: core?.files || null,
    checks,
  };
}
