import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { buildCapabilities } from '../capabilities.mjs';
import { loadProviders, publicProviders } from '../config/providers.mjs';
import { createPersona, deletePersona, loadPersonas, updatePersona } from '../storage/personas.mjs';
import { pipeUpstreamResponse, proxyChat, readJsonBody } from '../providers/openai-compatible.mjs';

function json(response, status, value, extraHeaders = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    ...extraHeaders,
  });
  response.end(JSON.stringify(value));
}

function errorJson(response, error, headers = {}) {
  const status = Number(error?.statusCode) || 500;
  const message = status >= 500 && !error?.statusCode ? 'Internal server error.' : String(error?.message || 'Request failed.');
  json(response, status, { error: { message, type: 'modeldeck_error' } }, headers);
}

function isLoopbackHost(value) {
  try {
    const host = new URL(`http://${String(value || '').trim()}`).hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
  } catch {
    return false;
  }
}

function allowedOrigin(origin) {
  if (!origin) return null;
  try {
    const parsed = new URL(origin);
    return ['http:', 'https:'].includes(parsed.protocol) && isLoopbackHost(parsed.hostname) ? origin : null;
  } catch {
    return null;
  }
}

function corsHeaders(request) {
  const origin = allowedOrigin(request.headers.origin);
  return origin ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    Vary: 'Origin',
  } : {};
}

function hasApiKey(request, expected) {
  if (!expected) return true;
  const supplied = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return hasToken(supplied, expected);
}

function hasToken(supplied, expected) {
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function modelList(document) {
  return document.providers.flatMap((provider) => provider.models.map((model) => ({
    id: model.id,
    object: 'model',
    created: 0,
    owned_by: provider.id,
    name: model.name,
  })));
}

export function createCoreHttpServer({ state, env = process.env, fetchImpl = fetch, platform = process.platform }) {
  const apiKey = String(env.MODELDECK_API_KEY || '').trim();
  const managementToken = String(env.MODELDECK_MANAGEMENT_TOKEN || '').trim();
  const server = createServer(async (request, response) => {
    const headers = corsHeaders(request);
    if (request.method === 'OPTIONS') {
      if (request.headers.origin && !allowedOrigin(request.headers.origin)) return json(response, 403, { error: { message: 'Origin is not allowed.' } });
      response.writeHead(204, headers);
      response.end();
      return;
    }

    let url;
    try {
      url = new URL(request.url || '/', 'http://127.0.0.1');
      const hostHeader = request.headers.host || '';
      if (!isLoopbackHost(hostHeader)) return json(response, 400, { error: { message: 'Invalid Host header.' } }, headers);
      if (request.headers.origin && !allowedOrigin(request.headers.origin)) return json(response, 403, { error: { message: 'Origin is not allowed.' } }, headers);

      if (request.method === 'GET' && url.pathname === '/health') {
        return json(response, 200, {
          status: 'ok',
          service: 'modeldeck-core-controller',
          version: 1,
          edition: 'core',
          instanceId: state.instanceId,
        }, headers);
      }

      const isOpenAiRoute = url.pathname.startsWith('/v1/');
      if (isOpenAiRoute && !apiKey) {
        return json(response, 503, { error: { message: 'Local API is disabled. Set MODELDECK_API_KEY and restart Core.', type: 'service_unavailable' } }, headers);
      }
      if (isOpenAiRoute && !hasApiKey(request, apiKey)) {
        return json(response, 401, { error: { message: 'Invalid API key.', type: 'authentication_error' } }, headers);
      }
      const isManagementRoute = url.pathname.startsWith('/api/');
      if (isManagementRoute && managementToken && !hasToken(String(request.headers['x-modeldeck-management-token'] || ''), managementToken)) {
        return json(response, 401, { error: { message: 'Invalid management token.', type: 'authentication_error' } }, headers);
      }

      if (request.method === 'GET' && url.pathname === '/api/state') {
        state.providers = await loadProviders(state.files.providersPath);
        state.personas = await loadPersonas(state.files.personasPath, state.personas);
        return json(response, 200, {
          schemaVersion: 1,
          capabilities: buildCapabilities(platform),
          providers: publicProviders(state.providers, env),
          models: modelList(state.providers),
          personas: state.personas.personas.map(({ systemPrompt, ...persona }) => ({ ...persona, systemPrompt })),
          paths: { providers: state.files.providersPath, data: state.files.dataDir },
          api: { baseUrl: `http://${hostHeader}`, enabled: Boolean(apiKey) },
        }, headers);
      }

      if (request.method === 'GET' && url.pathname === '/api/capabilities') {
        return json(response, 200, buildCapabilities(platform), headers);
      }

      if (request.method === 'GET' && url.pathname === '/api/providers') {
        state.providers = await loadProviders(state.files.providersPath);
        return json(response, 200, { providers: publicProviders(state.providers, env) }, headers);
      }

      if (request.method === 'GET' && url.pathname === '/api/personas') {
        state.personas = await loadPersonas(state.files.personasPath, state.personas);
        return json(response, 200, state.personas, headers);
      }

      if (request.method === 'POST' && url.pathname === '/api/personas') {
        const result = await createPersona(state.files.personasPath, state.personas, await readJsonBody(request));
        state.personas = result.document;
        return json(response, 201, { persona: result.persona }, headers);
      }

      const personaMatch = url.pathname.match(/^\/api\/personas\/([a-z0-9._-]+)$/);
      if (personaMatch && request.method === 'PUT') {
        const result = await updatePersona(state.files.personasPath, state.personas, personaMatch[1], await readJsonBody(request));
        if (!result) return json(response, 404, { error: { message: 'Persona not found.' } }, headers);
        state.personas = result.document;
        return json(response, 200, { persona: result.persona }, headers);
      }
      if (personaMatch && request.method === 'DELETE') {
        const result = await deletePersona(state.files.personasPath, state.personas, personaMatch[1]);
        if (!result) return json(response, 404, { error: { message: 'Persona not found.' } }, headers);
        state.personas = result;
        response.writeHead(204, headers);
        response.end();
        return;
      }

      if (request.method === 'GET' && url.pathname === '/v1/models') {
        return json(response, 200, { object: 'list', data: modelList(state.providers) }, headers);
      }

      if (request.method === 'POST' && ['/v1/chat/completions', '/api/chat/completions'].includes(url.pathname)) {
        const body = await readJsonBody(request);
        const upstreamController = new AbortController();
        const abortUpstream = () => upstreamController.abort();
        request.once('aborted', abortUpstream);
        response.once('close', abortUpstream);
        try {
          const { response: upstream, publicModelId } = await proxyChat({
            body,
            providersDocument: state.providers,
            personasDocument: state.personas,
            env,
            fetchImpl,
            signal: upstreamController.signal,
          });
          Object.entries(headers).forEach(([key, value]) => response.setHeader(key, value));
          await pipeUpstreamResponse(upstream, response, publicModelId);
          return;
        } finally {
          request.off('aborted', abortUpstream);
          response.off('close', abortUpstream);
        }
      }

      return json(response, 404, { error: { message: 'Route not found.' } }, headers);
    } catch (error) {
      if (!response.headersSent) errorJson(response, error, headers);
      else response.destroy(error);
    }
  });
  server.headersTimeout = 15_000;
  server.requestTimeout = 16 * 60_000;
  return server;
}
