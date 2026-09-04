import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DASHBOARD_ERROR_CODES,
  classifyDashboardError,
  connectionStatusForReason,
  shouldOfferConnectionRetry,
} from '../controller/http/dashboard-errors.mjs';

test('dashboard proxy errors map to actionable connection reasons', () => {
  const proxyError = (code) => ({ code, type: 'modeldeck_dashboard_proxy_error' });
  const cases = [
    [401, proxyError(DASHBOARD_ERROR_CODES.sessionInvalid), 'session-rejected'],
    [503, proxyError(DASHBOARD_ERROR_CODES.sessionUninitialized), 'session-uninitialized'],
    [403, proxyError(DASHBOARD_ERROR_CODES.loopbackHostRequired), 'access-blocked'],
    [503, proxyError(DASHBOARD_ERROR_CODES.controllerTargetInvalid), 'configuration-error'],
    [502, proxyError(DASHBOARD_ERROR_CODES.controllerUnavailable), 'controller-unavailable'],
    [401, { type: 'authentication_error' }, 'internal-auth-error'],
    [404, {}, 'request-denied'],
    [500, {}, 'request-failed'],
  ];

  for (const [status, error, expected] of cases) {
    assert.equal(classifyDashboardError(status, error), expected);
  }
});

test('dashboard error codes require the expected proxy source and HTTP status', () => {
  const sessionCode = DASHBOARD_ERROR_CODES.sessionInvalid;
  const unavailableCode = DASHBOARD_ERROR_CODES.controllerUnavailable;

  assert.equal(classifyDashboardError(401, { code: sessionCode }), 'request-denied');
  assert.equal(classifyDashboardError(500, { code: sessionCode, type: 'modeldeck_dashboard_proxy_error' }), 'request-failed');
  assert.equal(classifyDashboardError(502, { code: unavailableCode, type: 'upstream_error' }), 'request-failed');
  assert.equal(classifyDashboardError(401, { code: sessionCode, type: 'authentication_error' }), 'internal-auth-error');
  assert.equal(classifyDashboardError(408, {}), 'request-failed');
  assert.equal(classifyDashboardError(425, {}), 'request-failed');
  assert.equal(classifyDashboardError(429, {}), 'request-failed');
});

test('connection reasons drive distinct status and retry behavior', () => {
  assert.equal(connectionStatusForReason('session-missing'), 'session-required');
  assert.equal(connectionStatusForReason('session-rejected'), 'session-required');
  assert.equal(connectionStatusForReason('controller-unavailable'), 'offline');
  assert.equal(connectionStatusForReason('dashboard-unreachable'), 'offline');
  assert.equal(connectionStatusForReason('request-timeout'), 'degraded');
  assert.equal(connectionStatusForReason('request-denied'), 'degraded');
  assert.equal(connectionStatusForReason('schema-mismatch'), 'degraded');
  assert.equal(connectionStatusForReason('none'), 'online');

  assert.equal(shouldOfferConnectionRetry('controller-unavailable'), true);
  assert.equal(shouldOfferConnectionRetry('dashboard-unreachable'), true);
  assert.equal(shouldOfferConnectionRetry('request-timeout'), true);
  assert.equal(shouldOfferConnectionRetry('request-failed'), true);
  assert.equal(shouldOfferConnectionRetry('session-missing'), false);
  assert.equal(shouldOfferConnectionRetry('session-rejected'), false);
  assert.equal(shouldOfferConnectionRetry('session-uninitialized'), false);
  assert.equal(shouldOfferConnectionRetry('access-blocked'), false);
  assert.equal(shouldOfferConnectionRetry('configuration-error'), false);
  assert.equal(shouldOfferConnectionRetry('internal-auth-error'), false);
  assert.equal(shouldOfferConnectionRetry('schema-mismatch'), false);
  assert.equal(shouldOfferConnectionRetry('request-denied'), false);
});
