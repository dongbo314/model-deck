import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { initializeCore } from '../controller/bootstrap.mjs';
import { saveProviders } from '../controller/config/providers.mjs';
import { startController } from '../controller/main.mjs';

async function listen(server) {
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  return server.address().port;
}

test('Core Preview proxies chat, injects persona, and supports persona CRUD', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'Model Deck 测试-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  let received = null;
  const upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received = { authorization: request.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ id: 'chatcmpl_test', choices: [{ message: { role: 'assistant', content: 'Hello from the fixture.' } }] }));
  });
  const upstreamPort = await listen(upstream);
  context.after(() => new Promise((resolvePromise) => upstream.close(resolvePromise)));

  const env = { ...process.env, MODELDECK_HOME: root, MODELDECK_PROVIDER_TEST_KEY: 'fixture-key' };
  const initialized = await initializeCore({ env });
  await saveProviders(initialized.files.providersPath, {
    schemaVersion: 1,
    providers: [{
      id: 'fixture',
      name: 'Fixture',
      baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
      apiKeyEnv: 'MODELDECK_PROVIDER_TEST_KEY',
      models: [{ id: 'fixture-chat', upstreamId: 'upstream-model', name: 'Fixture Chat' }],
    }],
  });

  const controller = await startController({ env, port: 0 });
  context.after(() => controller.close());

  const health = await fetch(`${controller.url}/health`).then((response) => response.json());
  assert.equal(health.status, 'ok');
  assert.equal(health.edition, 'core');

  const managementHeaders = { 'X-ModelDeck-Management-Token': controller.managementToken };
  const state = await fetch(`${controller.url}/api/state`, { headers: managementHeaders }).then((response) => response.json());
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.capabilities.network.loopbackOnly, true);
  assert.equal(state.models[0].id, 'fixture-chat');
  assert.equal(state.providers[0].credentialConfigured, true);

  const disabledLocalApi = await fetch(`${controller.url}/v1/models`);
  assert.equal(disabledLocalApi.status, 503);

  const createdResponse = await fetch(`${controller.url}/api/personas`, {
    method: 'POST',
    headers: { ...managementHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Reviewer', description: 'Checks details', systemPrompt: 'Review carefully.' }),
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();

  const chatResponse = await fetch(`${controller.url}/api/chat/completions`, {
    method: 'POST',
    headers: { ...managementHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'fixture-chat',
      persona_id: created.persona.id,
      messages: [{ role: 'user', content: 'Hello' }],
      stream: false,
    }),
  });
  assert.equal(chatResponse.status, 200);
  const chat = await chatResponse.json();
  assert.equal(chat.choices[0].message.content, 'Hello from the fixture.');
  assert.equal(received.authorization, 'Bearer fixture-key');
  assert.equal(received.body.model, 'upstream-model');
  assert.deepEqual(received.body.messages[0], { role: 'system', content: 'Review carefully.' });
  assert.equal('persona_id' in received.body, false);

  const deleted = await fetch(`${controller.url}/api/personas/${created.persona.id}`, { method: 'DELETE', headers: managementHeaders });
  assert.equal(deleted.status, 204);
});

test('OpenAI routes enforce MODELDECK_API_KEY when configured', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'Model Deck key test-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const env = { ...process.env, MODELDECK_HOME: root, MODELDECK_API_KEY: 'a-secure-local-key-that-is-long-enough' };
  const controller = await startController({ env, port: 0 });
  context.after(() => controller.close());

  const denied = await fetch(`${controller.url}/v1/models`);
  assert.equal(denied.status, 401);
  const allowed = await fetch(`${controller.url}/v1/models`, { headers: { Authorization: `Bearer ${env.MODELDECK_API_KEY}` } });
  assert.equal(allowed.status, 200);
});

test('management routes enforce their private runtime token when configured', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'Model Deck management test-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const env = { ...process.env, MODELDECK_HOME: root, MODELDECK_MANAGEMENT_TOKEN: 'fixture-management-value' };
  const controller = await startController({ env, port: 0 });
  context.after(() => controller.close());

  const denied = await fetch(`${controller.url}/api/state`);
  assert.equal(denied.status, 401);
  const allowed = await fetch(`${controller.url}/api/state`, { headers: { 'X-ModelDeck-Management-Token': env.MODELDECK_MANAGEMENT_TOKEN } });
  assert.equal(allowed.status, 200);
});

test('non-loopback listeners are rejected', async () => {
  await assert.rejects(() => startController({ env: { ...process.env, MODELDECK_HOME: join(tmpdir(), 'modeldeck-invalid-host') }, host: '0.0.0.0', port: 0 }), /loopback-only/);
});
