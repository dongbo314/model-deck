import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLoopback, normalizedPort } from '../bin/modeldeck.mjs';
import { sanitizedNextEnvironment } from '../scripts/run-next.mjs';

test('CLI accepts only loopback hosts and valid service ports', () => {
  assert.doesNotThrow(() => assertLoopback('127.0.0.1'));
  assert.doesNotThrow(() => assertLoopback('::1'));
  assert.throws(() => assertLoopback('0.0.0.0'), /loopback/);
  assert.equal(normalizedPort('8080', 'PORT'), '8080');
  assert.throws(() => normalizedPort('0', 'PORT'), /1 to 65535/);
  assert.throws(() => normalizedPort('not-a-port', 'PORT'), /1 to 65535/);
});

test('Next build environment disables telemetry and removes credential-shaped variables', () => {
  const result = sanitizedNextEnvironment({
    PATH: '/example/bin',
    MODELDECK_PROVIDER_TEAM_KEY: 'fixture-provider-value',
    MODELDECK_MANAGEMENT_TOKEN: 'fixture-management-value',
    MODELDECK_PORT: '8080',
  });
  assert.equal(result.NEXT_TELEMETRY_DISABLED, '1');
  assert.equal(result.PATH, '/example/bin');
  assert.equal('MODELDECK_PORT' in result, false);
  assert.equal('MODELDECK_PROVIDER_TEAM_KEY' in result, false);
  assert.equal('MODELDECK_MANAGEMENT_TOKEN' in result, false);
});
