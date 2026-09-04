import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const ROUTES = [
  ['GET', /^api\/(?:state|providers|personas)$/],
  ['POST', /^api\/(?:personas|chat\/completions)$/],
  ['PUT', /^api\/personas\/[a-z0-9._-]+$/],
  ['DELETE', /^api\/personas\/[a-z0-9._-]+$/],
] as const;

function isLoopbackHost(value: string | null) {
  try {
    const hostname = new URL(`http://${String(value || '').trim()}`).hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
  } catch {
    return false;
  }
}

function controllerOrigin() {
  const host = process.env.MODELDECK_HOST || '127.0.0.1';
  const port = Number(process.env.MODELDECK_PORT || '8080');
  if (!isLoopbackHost(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('The dashboard controller target must be a valid loopback address.');
  }
  return `http://${host === '::1' ? '[::1]' : host}:${port}`;
}

function errorResponse(status: number, message: string) {
  return Response.json({ error: { message, type: 'modeldeck_dashboard_proxy_error' } }, { status });
}

function hasDashboardToken(request: NextRequest) {
  const expected = String(process.env.MODELDECK_DASHBOARD_TOKEN || '').trim();
  const supplied = String(request.headers.get('x-modeldeck-dashboard-token') || '');
  if (!expected) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.host === request.headers.get('host');
  } catch {
    return false;
  }
}

async function relay(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (!isLoopbackHost(request.headers.get('host'))) return errorResponse(403, 'Dashboard requests must use a loopback Host header.');
  if (!process.env.MODELDECK_DASHBOARD_TOKEN) return errorResponse(503, 'Dashboard session protection is not initialized. Start Core with modeldeck.');
  if (!hasDashboardToken(request)) return errorResponse(401, 'Invalid dashboard session token.');
  if (!['GET', 'HEAD'].includes(request.method) && !isSameOrigin(request)) return errorResponse(403, 'Cross-origin dashboard writes are not allowed.');
  const { path } = await context.params;
  const targetPath = path.join('/');
  if (!ROUTES.some(([method, pattern]) => method === request.method && pattern.test(targetPath))) {
    return errorResponse(404, 'Dashboard proxy route not found.');
  }

  const headers = new Headers({ Accept: 'application/json, text/event-stream' });
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  const managementToken = String(process.env.MODELDECK_MANAGEMENT_TOKEN || '').trim();
  if (managementToken) headers.set('X-ModelDeck-Management-Token', managementToken);

  let body: ArrayBuffer | undefined;
  if (!['GET', 'HEAD'].includes(request.method)) {
    const declaredLength = Number(request.headers.get('content-length') || '0');
    if (declaredLength > MAX_BODY_BYTES) return errorResponse(413, 'Request body is too large.');
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) return errorResponse(413, 'Request body is too large.');
  }

  try {
    const upstream = await fetch(`${controllerOrigin()}/${targetPath}`, {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
      signal: request.signal,
    });
    const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });
    for (const name of ['content-type', 'x-modeldeck-model', 'x-request-id']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Controller request failed.';
    return errorResponse(502, message);
  }
}

export const GET = relay;
export const POST = relay;
export const PUT = relay;
export const DELETE = relay;
