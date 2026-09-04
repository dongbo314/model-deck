export const dynamic = 'force-dynamic';

function controllerOrigin() {
  const host = process.env.MODELDECK_HOST || '127.0.0.1';
  const port = Number(process.env.MODELDECK_PORT || '8080');
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('The dashboard health target must be a valid loopback address.');
  }
  return `http://${host === '::1' ? '[::1]' : host}:${port}`;
}

export async function GET() {
  try {
    const upstream = await fetch(`${controllerOrigin()}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2_000),
    });
    if (!upstream.ok) throw new Error(`Controller health returned ${upstream.status}.`);
    const health = await upstream.json();
    if (health?.status !== 'ok' || health?.service !== 'modeldeck-core-controller') {
      throw new Error('Controller health response is invalid.');
    }
    return Response.json(
      { status: 'ok', service: 'modeldeck-core-dashboard', controller: 'ok' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { status: 'unavailable', service: 'modeldeck-core-dashboard', controller: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
