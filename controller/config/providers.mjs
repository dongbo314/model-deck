import { readJson, writeJsonAtomic } from '../storage/atomic-json.mjs';

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const ENV_PATTERN = /^MODELDECK_PROVIDER_[A-Z0-9_]{1,96}_KEY$/;

function isLoopbackHost(hostname) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
}

function normalizeBaseUrl(value) {
  const url = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Provider URL must use HTTP or HTTPS.');
  if (url.protocol !== 'https:' && !isLoopbackHost(url.hostname)) {
    throw new Error('Remote providers must use HTTPS; HTTP is allowed only for loopback providers.');
  }
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function normalizeModel(value, providerId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Provider ${providerId} has an invalid model.`);
  const id = String(value.id || '').trim();
  const upstreamId = String(value.upstreamId || '').trim();
  if (!ID_PATTERN.test(id)) throw new Error(`Provider ${providerId} has an invalid model id.`);
  if (!upstreamId || upstreamId.length > 200) throw new Error(`Model ${id} has an invalid upstream id.`);
  return {
    id,
    upstreamId,
    name: String(value.name || id).trim().slice(0, 120) || id,
  };
}

export function normalizeProvidersDocument(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('providers.json must be an object.');
  if (value.schemaVersion !== 1 || !Array.isArray(value.providers)) throw new Error('providers.json must use schemaVersion 1 and contain providers.');
  const providerIds = new Set();
  const modelIds = new Set();
  const providers = value.providers.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Provider entries must be objects.');
    const id = String(raw.id || '').trim();
    if (!ID_PATTERN.test(id) || providerIds.has(id)) throw new Error(`Invalid or duplicate provider id: ${id || '(empty)'}`);
    providerIds.add(id);
    const apiKeyEnv = raw.apiKeyEnv == null || raw.apiKeyEnv === '' ? null : String(raw.apiKeyEnv).trim();
    if (apiKeyEnv && !ENV_PATTERN.test(apiKeyEnv)) {
      throw new Error(`Provider ${id} apiKeyEnv must match MODELDECK_PROVIDER_*_KEY.`);
    }
    const models = Array.isArray(raw.models) ? raw.models.map((model) => normalizeModel(model, id)) : [];
    for (const model of models) {
      if (modelIds.has(model.id)) throw new Error(`Duplicate public model id: ${model.id}`);
      modelIds.add(model.id);
    }
    return {
      id,
      name: String(raw.name || id).trim().slice(0, 120) || id,
      baseUrl: normalizeBaseUrl(raw.baseUrl),
      apiKeyEnv,
      models,
    };
  });
  return { schemaVersion: 1, providers };
}

export async function loadProviders(path) {
  const document = await readJson(path, { schemaVersion: 1, providers: [] });
  return normalizeProvidersDocument(document);
}

export async function saveProviders(path, value) {
  const document = normalizeProvidersDocument(value);
  await writeJsonAtomic(path, document);
  return document;
}

export function publicProviders(document, env = process.env) {
  return document.providers.map((provider) => ({
    ...provider,
    credentialConfigured: !provider.apiKeyEnv || Boolean(env[provider.apiKeyEnv]),
  }));
}

export function resolveModel(document, modelId) {
  for (const provider of document.providers) {
    const model = provider.models.find((entry) => entry.id === modelId);
    if (model) return { provider, model };
  }
  return null;
}
