import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeProvidersDocument, resolveModel } from '../controller/config/providers.mjs';

const valid = {
  schemaVersion: 1,
  providers: [{
    id: 'local-test',
    name: 'Local Test',
    baseUrl: 'http://127.0.0.1:9123/v1/',
    apiKeyEnv: 'MODELDECK_PROVIDER_TEST_KEY',
    models: [{ id: 'test-chat', upstreamId: 'upstream/test', name: 'Test Chat' }],
  }],
};

test('provider normalization strips a trailing slash and resolves aliases', () => {
  const document = normalizeProvidersDocument(valid);
  assert.equal(document.providers[0].baseUrl, 'http://127.0.0.1:9123/v1');
  assert.equal(resolveModel(document, 'test-chat').model.upstreamId, 'upstream/test');
});

test('remote provider HTTP endpoints are rejected', () => {
  assert.throws(() => normalizeProvidersDocument({
    ...valid,
    providers: [{ ...valid.providers[0], baseUrl: 'http://api.example.com/v1' }],
  }), /must use HTTPS/);
});

test('provider credentials must use the dedicated environment namespace', () => {
  assert.throws(() => normalizeProvidersDocument({
    schemaVersion: 1,
    providers: [{
      id: 'unsafe',
      name: 'Unsafe',
      baseUrl: 'https://api.example.com/v1',
      apiKeyEnv: 'MODELDECK_MANAGEMENT_TOKEN',
      models: [],
    }],
  }), /MODELDECK_PROVIDER/);
});

test('duplicate public model aliases are rejected across providers', () => {
  assert.throws(() => normalizeProvidersDocument({
    schemaVersion: 1,
    providers: [valid.providers[0], { ...valid.providers[0], id: 'second' }],
  }), /Duplicate public model id/);
});
