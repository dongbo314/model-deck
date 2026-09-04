import { Readable } from 'node:stream';
import { resolveModel } from '../config/providers.mjs';

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const ALLOWED_RESPONSE_HEADERS = new Set(['content-type', 'x-request-id', 'openai-processing-ms']);

export async function readJsonBody(request, limit = MAX_BODY_BYTES) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > limit) {
      const error = new Error('Request body is too large.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

function prepareMessages(body, persona) {
  if (!persona) return body.messages;
  const messages = Array.isArray(body.messages) ? [...body.messages] : [];
  const first = messages[0];
  if (first?.role === 'system') {
    messages[0] = { ...first, content: `${persona.systemPrompt}\n\n${String(first.content || '')}`.trim() };
  } else {
    messages.unshift({ role: 'system', content: persona.systemPrompt });
  }
  return messages;
}

export async function proxyChat({ body, providersDocument, personasDocument, env = process.env, fetchImpl = fetch, signal }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    const error = new Error('Request body must be an object.');
    error.statusCode = 400;
    throw error;
  }
  const requestedModel = String(body.model || '').trim();
  const resolved = resolveModel(providersDocument, requestedModel);
  if (!resolved) {
    const error = new Error(`Unknown model: ${requestedModel || '(empty)'}`);
    error.statusCode = 404;
    throw error;
  }
  const personaId = String(body.persona_id || '').trim();
  const persona = personaId ? personasDocument.personas.find((entry) => entry.id === personaId) : null;
  if (personaId && !persona) {
    const error = new Error(`Unknown persona: ${personaId}`);
    error.statusCode = 404;
    throw error;
  }
  const apiKey = resolved.provider.apiKeyEnv ? env[resolved.provider.apiKeyEnv] : null;
  if (resolved.provider.apiKeyEnv && !apiKey) {
    const error = new Error(`Provider credential is missing. Set ${resolved.provider.apiKeyEnv}.`);
    error.statusCode = 503;
    throw error;
  }

  const upstreamBody = {
    ...body,
    model: resolved.model.upstreamId,
    messages: prepareMessages(body, persona),
  };
  delete upstreamBody.persona_id;

  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const timeoutSignal = AbortSignal.timeout(15 * 60_000);
  const response = await fetchImpl(`${resolved.provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(upstreamBody),
    signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
  });
  return { response, publicModelId: resolved.model.id };
}

export async function pipeUpstreamResponse(response, outgoing, publicModelId) {
  const headers = { 'Cache-Control': 'no-store' };
  for (const [key, value] of response.headers) {
    if (ALLOWED_RESPONSE_HEADERS.has(key.toLowerCase())) headers[key] = value;
  }
  headers['X-ModelDeck-Model'] = publicModelId;
  outgoing.writeHead(response.status, headers);
  if (!response.body) {
    outgoing.end();
    return;
  }
  await new Promise((resolvePromise, reject) => {
    const stream = Readable.fromWeb(response.body);
    stream.once('error', reject);
    outgoing.once('error', reject);
    outgoing.once('finish', resolvePromise);
    stream.pipe(outgoing);
  });
}
