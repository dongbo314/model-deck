#!/usr/bin/env node

import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { DASHBOARD_ERROR_CODES } from '../controller/http/dashboard-errors.mjs';

const controllerOrigin = process.env.MODELDECK_SMOKE_CONTROLLER_ORIGIN || 'http://127.0.0.1:8080';
const dashboardOrigin = process.env.MODELDECK_SMOKE_DASHBOARD_ORIGIN || 'http://127.0.0.1:3000';
const managementToken = String(process.env.MODELDECK_MANAGEMENT_TOKEN || '');
const dashboardToken = String(process.env.MODELDECK_DASHBOARD_TOKEN || '');
const phase = process.argv[2] || 'create';
const personaName = 'Container persistence fixture';

assert(managementToken, 'MODELDECK_MANAGEMENT_TOKEN is required for the container smoke test.');
assert(dashboardToken, 'MODELDECK_DASHBOARD_TOKEN is required for the container smoke test.');
assert(['create', 'verify'].includes(phase), 'Container smoke phase must be create or verify.');

function requestWithHost(url, hostHeader, headers = {}) {
  const parsed = new URL(url);
  return new Promise((resolvePromise, reject) => {
    const request = httpRequest({
      hostname: parsed.hostname,
      port: parsed.port,
      path: `${parsed.pathname}${parsed.search}`,
      method: 'GET',
      headers: { ...headers, Host: hostHeader },
    }, (response) => {
      response.resume();
      response.once('end', () => resolvePromise(response.statusCode));
    });
    request.once('error', reject);
    request.end();
  });
}

const healthResponse = await fetch(`${dashboardOrigin}/api/health`);
assert.equal(healthResponse.status, 200);
assert.deepEqual(await healthResponse.json(), {
  status: 'ok',
  service: 'modeldeck-core-dashboard',
  controller: 'ok',
});

const htmlResponse = await fetch(`${dashboardOrigin}/`);
assert.equal(htmlResponse.status, 200);
const html = await htmlResponse.text();
assert.match(html, /Model Deck Core/);
assert.match(html, /简体中文/);
assert.match(html, /\/_next\/static\/chunks\/app\/page-[a-f0-9]{16}\.js/);

assert.equal((await fetch(`${controllerOrigin}/api/state`)).status, 401);
assert.equal((await fetch(`${controllerOrigin}/v1/models`)).status, 503);
assert.equal(await requestWithHost(`${controllerOrigin}/health`, 'example.invalid'), 400);
assert.equal(await requestWithHost(`${dashboardOrigin}/api/controller/api/state`, 'example.invalid', {
  'X-ModelDeck-Dashboard-Token': dashboardToken,
}), 403);

const dashboardHeaders = { 'X-ModelDeck-Dashboard-Token': dashboardToken };
const missingSession = await fetch(`${dashboardOrigin}/api/controller/api/state`);
assert.equal(missingSession.status, 401);
assert.equal((await missingSession.json()).error.code, DASHBOARD_ERROR_CODES.sessionInvalid);
const wrongSession = await fetch(`${dashboardOrigin}/api/controller/api/state`, {
  headers: { 'X-ModelDeck-Dashboard-Token': 'wrong-fixture' },
});
assert.equal(wrongSession.status, 401);
assert.equal((await wrongSession.json()).error.code, DASHBOARD_ERROR_CODES.sessionInvalid);
const stateResponse = await fetch(`${dashboardOrigin}/api/controller/api/state`, { headers: dashboardHeaders });
assert.equal(stateResponse.status, 200);
const state = await stateResponse.json();
assert.equal(state.paths.providers, '/var/lib/modeldeck/config/providers.json');
assert.equal(state.api.baseUrl, 'http://127.0.0.1:8080');

if (phase === 'create') {
  const createResponse = await fetch(`${controllerOrigin}/api/personas`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-ModelDeck-Management-Token': managementToken,
    },
    body: JSON.stringify({
      name: personaName,
      description: 'Created before a container restart.',
      systemPrompt: 'Container persistence test only.',
    }),
  });
  assert.equal(createResponse.status, 201);
} else {
  assert(state.personas.some((persona) => persona.name === personaName), 'Persona did not survive the container restart.');
}

console.log(`Container smoke ${phase} phase passed.`);
