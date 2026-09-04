export const DASHBOARD_ERROR_CODES = Object.freeze({
  loopbackHostRequired: 'loopback_host_required',
  sessionUninitialized: 'dashboard_session_uninitialized',
  sessionInvalid: 'dashboard_session_invalid',
  crossOriginWriteDenied: 'cross_origin_write_denied',
  routeNotFound: 'proxy_route_not_found',
  requestBodyTooLarge: 'request_body_too_large',
  controllerTargetInvalid: 'controller_target_invalid',
  controllerUnavailable: 'controller_unavailable',
});

export function classifyDashboardError(status, error = {}) {
  const code = String(error?.code || '');
  const isDashboardProxyError = error?.type === 'modeldeck_dashboard_proxy_error';
  if (isDashboardProxyError && status === 401 && code === DASHBOARD_ERROR_CODES.sessionInvalid) return 'session-rejected';
  if (isDashboardProxyError && status === 503 && code === DASHBOARD_ERROR_CODES.sessionUninitialized) return 'session-uninitialized';
  if (isDashboardProxyError && status === 403 && code === DASHBOARD_ERROR_CODES.loopbackHostRequired) return 'access-blocked';
  if (isDashboardProxyError && status === 503 && code === DASHBOARD_ERROR_CODES.controllerTargetInvalid) return 'configuration-error';
  if (isDashboardProxyError && status === 502 && code === DASHBOARD_ERROR_CODES.controllerUnavailable) return 'controller-unavailable';
  if (status === 401 && error?.type === 'authentication_error') return 'internal-auth-error';
  if (Number.isInteger(status) && status >= 400 && status < 500 && ![408, 425, 429].includes(status)) return 'request-denied';
  return 'request-failed';
}

export function connectionStatusForReason(reason) {
  if (reason === 'none') return 'online';
  if (reason === 'session-missing' || reason === 'session-rejected') return 'session-required';
  if (reason === 'controller-unavailable' || reason === 'dashboard-unreachable') return 'offline';
  return 'degraded';
}

export function shouldOfferConnectionRetry(reason) {
  return reason === 'controller-unavailable'
    || reason === 'dashboard-unreachable'
    || reason === 'request-timeout'
    || reason === 'request-failed';
}
