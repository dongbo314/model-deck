import { access, readFile } from 'node:fs/promises';
import { resolveCoreFiles } from './config/paths.mjs';
import { ensurePrivateDirectory, writeJsonAtomic } from './storage/atomic-json.mjs';
import { loadProviders } from './config/providers.mjs';
import { loadPersonas } from './storage/personas.mjs';

async function resourceJson(name) {
  return JSON.parse(await readFile(new URL(`../resources/${name}`, import.meta.url), 'utf8'));
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function initializeCore({ env = process.env, platform = process.platform, home } = {}) {
  const files = resolveCoreFiles({ env, platform, home });
  await Promise.all([
    ensurePrivateDirectory(files.configDir),
    ensurePrivateDirectory(files.dataDir),
    ensurePrivateDirectory(files.stateDir),
    ensurePrivateDirectory(files.cacheDir),
  ]);

  const [providerDefaults, personaDefaults] = await Promise.all([
    resourceJson('providers.example.json'),
    resourceJson('personas.default.json'),
  ]);

  const [providersExist, personasExist] = await Promise.all([exists(files.providersPath), exists(files.personasPath)]);
  const providers = await loadProviders(files.providersPath);
  if (!providersExist) await writeJsonAtomic(files.providersPath, { schemaVersion: 1, providers: [] });
  const personas = await loadPersonas(files.personasPath, personaDefaults);
  if (!personasExist) await writeJsonAtomic(files.personasPath, personas);

  return {
    files,
    providers: providers.providers.length ? providers : { schemaVersion: 1, providers: [] },
    providerExample: providerDefaults,
    personas,
  };
}
