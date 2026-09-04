'use client';

import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  classifyDashboardError,
  connectionStatusForReason,
  shouldOfferConnectionRetry,
} from '@/controller/http/dashboard-errors.mjs';
import { isLocale, translate, type Locale, type MessageKey } from './i18n';

type Capability = { state: 'available' | 'planned' | 'unavailable'; reason?: string };
type Provider = {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyEnv: string | null;
  credentialConfigured: boolean;
  models: Array<{ id: string; upstreamId: string; name: string }>;
};
type Persona = { id: string; name: string; description: string; systemPrompt: string };
type Model = { id: string; name: string; owned_by: string };
type State = {
  schemaVersion: 1;
  capabilities: {
    edition: string;
    maturity: string;
    platform: string;
    platformLabel: string;
    architecture: string;
    features: Record<string, Capability>;
    network: { loopbackOnly: boolean; lanControl: boolean; tls: boolean };
  };
  providers: Provider[];
  models: Model[];
  personas: Persona[];
  paths: { providers: string; data: string };
  api: { baseUrl: string; enabled: boolean };
};
type Message = { id: string; role: 'user' | 'assistant'; content: string };
type TabId = 'status' | 'chat' | 'providers' | 'personas' | 'api' | 'roadmap';
type ConnectionStatus = 'connecting' | 'online' | 'session-required' | 'degraded' | 'offline';
type ConnectionReason =
  | 'none'
  | 'session-missing'
  | 'session-rejected'
  | 'session-uninitialized'
  | 'access-blocked'
  | 'configuration-error'
  | 'internal-auth-error'
  | 'controller-unavailable'
  | 'dashboard-unreachable'
  | 'request-timeout'
  | 'request-denied'
  | 'schema-mismatch'
  | 'request-failed';
type ConnectionRequest = { id: number; promise: Promise<ConnectionReason> };

const tabs: Array<{ id: TabId; label: MessageKey; glyph: string }> = [
  { id: 'status', label: 'tabStatus', glyph: '◉' },
  { id: 'chat', label: 'tabChat', glyph: '◌' },
  { id: 'providers', label: 'tabProviders', glyph: '◇' },
  { id: 'personas', label: 'tabPersonas', glyph: '◎' },
  { id: 'api', label: 'tabApi', glyph: '⌁' },
  { id: 'roadmap', label: 'tabPacks', glyph: '＋' },
];

const dashboardControllerPath = '/api/controller';
const dashboardSessionKey = 'modeldeck-dashboard-token';
const localeStorageKey = 'modeldeck-locale';
const connectionTimeoutMs = 5000;
const tabRequirements: Record<TabId, string> = {
  status: 'dashboard',
  chat: 'remoteChat',
  providers: 'remoteChat',
  personas: 'personas',
  api: 'localApi',
  roadmap: 'dashboard',
};
const featureNameKeys: Record<string, MessageKey> = {
  dashboard: 'featureDashboard',
  remoteChat: 'featureRemoteChat',
  personas: 'featurePersonas',
  localApi: 'featureLocalApi',
  localInference: 'featureLocalInference',
  memory: 'featureMemory',
  channels: 'featureChannels',
  audio: 'featureAudio',
  song: 'featureSong',
  video: 'featureVideo',
  virtualMic: 'featureVirtualMic',
  mlx: 'featureMlx',
};
const featureReasonKeys: Record<string, MessageKey> = {
  localInference: 'reasonLocalInference',
  memory: 'reasonMemory',
  channels: 'reasonChannels',
  audio: 'reasonAudio',
  song: 'reasonSong',
  video: 'reasonVideo',
  virtualMic: 'reasonVirtualMic',
};
const featureStateKeys: Record<Capability['state'], MessageKey> = {
  available: 'stateAvailable',
  planned: 'statePlanned',
  unavailable: 'stateUnavailable',
};
const connectionIssueKeys: Record<Exclude<ConnectionReason, 'none'>, MessageKey> = {
  'session-missing': 'missingSession',
  'session-rejected': 'expiredSession',
  'session-uninitialized': 'sessionUninitialized',
  'access-blocked': 'accessBlocked',
  'configuration-error': 'configurationError',
  'internal-auth-error': 'internalAuthError',
  'controller-unavailable': 'controllerUnavailable',
  'dashboard-unreachable': 'dashboardUnreachable',
  'request-timeout': 'connectionTimedOut',
  'request-denied': 'connectionRequestDenied',
  'schema-mismatch': 'schemaMismatch',
  'request-failed': 'connectionRequestFailed',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isCapability(value: unknown): value is Capability {
  return isRecord(value)
    && ['available', 'planned', 'unavailable'].includes(String(value.state))
    && (value.reason === undefined || typeof value.reason === 'string');
}

function isState(value: unknown): value is State {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  const capabilities = value.capabilities;
  const paths = value.paths;
  const api = value.api;
  if (!isRecord(capabilities) || !isRecord(capabilities.features) || !isRecord(capabilities.network)) return false;
  if (!Object.values(capabilities.features).every(isCapability)) return false;
  if (!isRecord(paths) || typeof paths.providers !== 'string' || typeof paths.data !== 'string') return false;
  if (!isRecord(api) || typeof api.baseUrl !== 'string' || typeof api.enabled !== 'boolean') return false;
  if (!Array.isArray(value.providers) || !Array.isArray(value.models) || !Array.isArray(value.personas)) return false;
  return typeof capabilities.edition === 'string'
    && typeof capabilities.maturity === 'string'
    && typeof capabilities.platform === 'string'
    && typeof capabilities.platformLabel === 'string'
    && typeof capabilities.architecture === 'string'
    && typeof capabilities.network.loopbackOnly === 'boolean'
    && typeof capabilities.network.lanControl === 'boolean'
    && typeof capabilities.network.tls === 'boolean'
    && value.providers.every((provider) => isRecord(provider)
      && typeof provider.id === 'string'
      && typeof provider.name === 'string'
      && typeof provider.baseUrl === 'string'
      && typeof provider.credentialConfigured === 'boolean'
      && Array.isArray(provider.models))
    && value.models.every((model) => isRecord(model)
      && typeof model.id === 'string'
      && typeof model.name === 'string'
      && typeof model.owned_by === 'string')
    && value.personas.every((persona) => isRecord(persona)
      && typeof persona.id === 'string'
      && typeof persona.name === 'string'
      && typeof persona.description === 'string'
      && typeof persona.systemPrompt === 'string');
}

class LocalizedUiError extends Error {}

function errorMessage(value: unknown, fallback: string) {
  return value instanceof LocalizedUiError ? value.message : fallback;
}

function responseError(value: unknown) {
  if (!isRecord(value) || !isRecord(value.error)) return {};
  return value.error;
}

function SectionTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="section-title">
      <div><p>{eyebrow}</p><h2>{title}</h2></div>
      {children}
    </header>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

export default function Home() {
  const [locale, setLocale] = useState<Locale>('zh-CN');
  const [localeLoaded, setLocaleLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('status');
  const [state, setState] = useState<State | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [connectionReason, setConnectionReason] = useState<ConnectionReason>('none');
  const [connectionHttpStatus, setConnectionHttpStatus] = useState<number | null>(null);
  const [connectionCheckPending, setConnectionCheckPending] = useState(false);
  const [operationError, setOperationError] = useState('');
  const [dashboardToken, setDashboardToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState('');
  const [modelId, setModelId] = useState('');
  const [personaId, setPersonaId] = useState('default');
  const [sending, setSending] = useState(false);
  const [personaDraft, setPersonaDraft] = useState({ name: '', description: '', systemPrompt: '' });
  const [personaSaving, setPersonaSaving] = useState(false);
  const [deletingPersonaId, setDeletingPersonaId] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const connectionAbortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const keepChatAtBottomRef = useRef(true);
  const nextConnectionRequestRef = useRef(0);
  const connectionRequestRef = useRef<ConnectionRequest | null>(null);
  const baseUrl = state?.api.baseUrl || 'http://127.0.0.1:8080';
  const t = useCallback(
    (key: MessageKey, values: Record<string, string | number> = {}) => translate(locale, key, values),
    [locale],
  );

  const setConnectionFailure = useCallback((reason: ConnectionReason, status: number | null = null) => {
    setConnectionReason(reason);
    setConnectionHttpStatus(status);
    setConnectionStatus(connectionStatusForReason(reason) as ConnectionStatus);
  }, []);

  const refresh = useCallback((signal?: AbortSignal): Promise<ConnectionReason> => {
    if (!dashboardToken) {
      setConnectionFailure('session-missing');
      return Promise.resolve('session-missing');
    }
    if (connectionRequestRef.current) return connectionRequestRef.current.promise;

    const requestId = ++nextConnectionRequestRef.current;
    setConnectionCheckPending(true);
    const requestController = new AbortController();
    const abortFromLifecycle = () => requestController.abort();
    if (signal?.aborted) requestController.abort();
    else signal?.addEventListener('abort', abortFromLifecycle, { once: true });
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      requestController.abort();
    }, connectionTimeoutMs);
    const isCurrentRequest = () => connectionRequestRef.current?.id === requestId;

    const task = (async (): Promise<ConnectionReason> => {
      try {
        let response: Response;
        try {
          response = await fetch(`${dashboardControllerPath}/api/state`, {
            signal: requestController.signal,
            cache: 'no-store',
            headers: { 'X-ModelDeck-Dashboard-Token': dashboardToken },
          });
        } catch {
          const reason = timedOut ? 'request-timeout' : signal?.aborted ? 'request-failed' : 'dashboard-unreachable';
          if (isCurrentRequest() && !signal?.aborted) setConnectionFailure(reason);
          return reason;
        }

        const body: unknown = await response.json().catch(() => null);
        if (!isCurrentRequest()) return 'request-failed';
        if (requestController.signal.aborted) {
          const reason = timedOut ? 'request-timeout' : 'request-failed';
          if (!signal?.aborted) setConnectionFailure(reason);
          return reason;
        }
        if (!response.ok) {
          const error = responseError(body);
          const reason = classifyDashboardError(response.status, error) as ConnectionReason;
          if (reason === 'session-rejected') {
            try {
              window.sessionStorage.removeItem(dashboardSessionKey);
            } catch {
              // Storage can be disabled; the rejected token still stays out of future requests.
            }
            setDashboardToken(null);
          }
          setConnectionFailure(reason, response.status);
          return reason;
        }

        if (!isState(body)) {
          setConnectionFailure('schema-mismatch');
          return 'schema-mismatch';
        }

        setState(body);
        setModelId((current) => current && body.models.some((model) => model.id === current) ? current : body.models[0]?.id || '');
        setPersonaId((current) => current && body.personas.some((persona) => persona.id === current) ? current : body.personas[0]?.id || '');
        setConnectionStatus('online');
        setConnectionReason('none');
        setConnectionHttpStatus(null);
        return 'none';
      } finally {
        window.clearTimeout(timeout);
        signal?.removeEventListener('abort', abortFromLifecycle);
      }
    })();

    const trackedTask = task.finally(() => {
      if (connectionRequestRef.current?.id === requestId) {
        connectionRequestRef.current = null;
        setConnectionCheckPending(false);
      }
    });
    connectionRequestRef.current = { id: requestId, promise: trackedTask };
    return trackedTask;
  }, [dashboardToken, setConnectionFailure]);

  const refreshAfterCurrent = useCallback(async (signal?: AbortSignal) => {
    if (signal?.aborted) return 'request-failed';
    const current = connectionRequestRef.current?.promise;
    if (current) await current;
    if (signal?.aborted) return 'request-failed';
    return refresh(signal);
  }, [refresh]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedLocale = window.localStorage.getItem(localeStorageKey);
        if (isLocale(savedLocale)) setLocale(savedLocale);
      } catch {
        // A blocked localStorage falls back to Simplified Chinese for this session.
      } finally {
        setLocaleLoaded(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    if (!localeLoaded) return;
    try {
      window.localStorage.setItem(localeStorageKey, locale);
    } catch {
      // Language selection still works when persistence is unavailable.
    }
  }, [locale, localeLoaded]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let fragmentToken = '';
      try {
        fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
      } catch {
        fragmentToken = '';
      }

      let token = fragmentToken;
      if (fragmentToken) {
        try {
          window.sessionStorage.setItem(dashboardSessionKey, fragmentToken);
        } catch {
          // Keep this session in memory even when browser storage is disabled.
        }
        try {
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
        } catch {
          try {
            window.location.hash = '';
          } catch {
            // Authentication still uses the in-memory token if this restricted browser also blocks hash updates.
          }
        }
      } else {
        try {
          token = window.sessionStorage.getItem(dashboardSessionKey) || '';
        } catch {
          token = '';
        }
      }
      setDashboardToken(token || null);
      if (!token) setConnectionFailure('session-missing');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [setConnectionFailure]);

  useEffect(() => {
    if (!dashboardToken) return;
    const controller = new AbortController();
    connectionAbortRef.current = controller;
    let stopped = false;
    let timer = 0;
    const poll = async () => {
      const reason = await refresh(controller.signal);
      if (!stopped && (reason === 'none' || shouldOfferConnectionRetry(reason))) {
        timer = window.setTimeout(poll, 5000);
      }
    };
    timer = window.setTimeout(poll, 0);
    return () => {
      stopped = true;
      controller.abort();
      window.clearTimeout(timer);
      connectionRequestRef.current = null;
      nextConnectionRequestRef.current += 1;
      if (connectionAbortRef.current === controller) connectionAbortRef.current = null;
      abortRef.current?.abort();
    };
  }, [dashboardToken, refresh]);

  useEffect(() => {
    if (activeTab === 'chat' && keepChatAtBottomRef.current) {
      messageEndRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [activeTab, messages, sending]);

  function selectTab(tab: TabId) {
    if (!isTabEnabled(tab)) return;
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function featureAvailable(name: string) {
    return state?.capabilities.features[name]?.state === 'available';
  }

  function isTabEnabled(tab: TabId) {
    return tab === 'status' || featureAvailable(tabRequirements[tab]);
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: TabId) {
    const enabledTabs = tabs.filter((tab) => isTabEnabled(tab.id));
    const index = enabledTabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % enabledTabs.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + enabledTabs.length) % enabledTabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = enabledTabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    selectTab(enabledTabs[next].id);
    document.getElementById(`tab-${enabledTabs[next].id}`)?.focus();
  }

  function displayPersonaName(persona: Persona) {
    return persona.id === 'default' && persona.name === 'Default assistant' ? t('defaultPersonaName') : persona.name;
  }

  function displayPersonaDescription(persona: Persona) {
    return persona.id === 'default' && persona.description === 'A concise, helpful general-purpose assistant.'
      ? t('defaultPersonaDescription')
      : persona.description || t('noDescription');
  }

  function featureReason(name: string, feature: Capability) {
    if (!feature.reason) return t('includedCore');
    if (name === 'mlx') return t(state?.capabilities.platform === 'darwin' ? 'reasonMlxMac' : 'reasonMlxOther');
    const key = featureReasonKeys[name];
    return key ? t(key) : feature.reason;
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = prompt.trim();
    if (!text || !modelId || sending || connectionStatus !== 'online' || !featureAvailable('remoteChat')) return;
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: text };
    const requestMessages = [...messages, userMessage].map(({ role, content }) => ({ role, content }));
    setMessages((current) => [...current, userMessage]);
    setPrompt('');
    setSending(true);
    setOperationError('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(`${dashboardControllerPath}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-ModelDeck-Dashboard-Token': dashboardToken || '' },
        signal: controller.signal,
        body: JSON.stringify({ model: modelId, persona_id: personaId || undefined, messages: requestMessages, stream: false }),
      });
      const body = await response.json();
      if (!response.ok) throw new LocalizedUiError(t('chatFailed', { status: response.status }));
      const content = body?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new LocalizedUiError(t('emptyReply'));
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content }]);
    } catch (reason) {
      if ((reason as Error)?.name !== 'AbortError') setOperationError(errorMessage(reason, t('requestFailedGeneric')));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setSending(false);
    }
  }

  async function createPersona(event: FormEvent) {
    event.preventDefault();
    if (personaSaving || connectionStatus !== 'online' || !featureAvailable('personas')) return;
    setPersonaSaving(true);
    setOperationError('');
    const connectionSignal = connectionAbortRef.current?.signal;
    try {
      const response = await fetch(`${dashboardControllerPath}/api/personas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-ModelDeck-Dashboard-Token': dashboardToken || '' },
        signal: connectionSignal,
        body: JSON.stringify(personaDraft),
      });
      const body = await response.json();
      if (!response.ok) throw new LocalizedUiError(t('createPersonaFailed'));
      setPersonaDraft({ name: '', description: '', systemPrompt: '' });
      await refreshAfterCurrent(connectionSignal);
      setPersonaId(body.persona.id);
    } catch (reason) {
      if ((reason as Error)?.name !== 'AbortError') setOperationError(errorMessage(reason, t('createPersonaFailed')));
    } finally {
      setPersonaSaving(false);
    }
  }

  async function removePersona(id: string) {
    const persona = state?.personas.find((entry) => entry.id === id);
    if (!persona || id === 'default' || deletingPersonaId || connectionStatus !== 'online' || !featureAvailable('personas')) return;
    const name = displayPersonaName(persona);
    if (!window.confirm(t('deletePersonaConfirm', { name }))) return;
    setDeletingPersonaId(id);
    setOperationError('');
    const connectionSignal = connectionAbortRef.current?.signal;
    try {
      const response = await fetch(`${dashboardControllerPath}/api/personas/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'X-ModelDeck-Dashboard-Token': dashboardToken || '' },
        signal: connectionSignal,
      });
      if (!response.ok) {
        throw new LocalizedUiError(t('deletePersonaFailed'));
      }
      await refreshAfterCurrent(connectionSignal);
    } catch (reason) {
      if ((reason as Error)?.name !== 'AbortError') setOperationError(errorMessage(reason, t('deletePersonaFailed')));
    } finally {
      setDeletingPersonaId('');
    }
  }

  const availableFeatures = state ? Object.values(state.capabilities.features).filter((feature) => feature.state === 'available').length : 0;
  const configuredProviders = state?.providers.filter((provider) => provider.credentialConfigured).length || 0;
  const connected = connectionStatus === 'online';
  const canUseChat = connected && featureAvailable('remoteChat');
  const canUsePersonas = connected && featureAvailable('personas');
  const connectionLabel = connectionStatus === 'connecting'
    ? t('connectionConnecting')
    : connectionStatus === 'session-required'
      ? t('connectionSessionRequired')
      : connectionStatus === 'degraded'
        ? t('connectionProxyIssue')
        : connectionStatus === 'offline'
          ? t('connectionOffline')
          : state?.capabilities.network.loopbackOnly ? t('connectionLocal') : t('connectionConnected');
  const controllerLabel = connectionStatus === 'connecting'
    ? t('checking')
    : connectionStatus === 'online'
      ? t('ready')
      : connectionStatus === 'session-required'
        ? t('sessionRequired')
        : connectionStatus === 'degraded' ? t('attentionRequired') : t('offline');
  const connectionMessage = connectionReason === 'none'
    ? ''
    : (connectionReason === 'request-failed' || connectionReason === 'request-denied') && connectionHttpStatus
      ? t('proxyError', { status: connectionHttpStatus })
      : t(connectionIssueKeys[connectionReason]);
  const showConnectionRetry = shouldOfferConnectionRetry(connectionReason);
  const apiAuthorization = state?.api.enabled ? '-H "Authorization: Bearer $MODELDECK_API_KEY" ' : '';

  return (
    <main className="shell">
      <aside className="rail">
        <div className="brand" aria-label="Model Deck Core">MD</div>
        <nav aria-label={t('primaryNavigation')} role="tablist">
          {tabs.map((tab) => (
            <button
              className={activeTab === tab.id ? 'nav-item active' : 'nav-item'}
              id={`tab-${tab.id}`}
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-disabled={!isTabEnabled(tab.id)}
              aria-controls={`panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              disabled={!isTabEnabled(tab.id)}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
            >
              <span aria-hidden="true">{tab.glyph}</span>{t(tab.label)}
            </button>
          ))}
        </nav>
        <p className="rail-note">{t('corePreview')}</p>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div><p>{t('appEyebrow')}</p><h1>Model Deck Core</h1></div>
          <div className="topbar-actions">
            <label className="language-control">
              <span className="sr-only">{t('language')}</span>
              <select
                aria-label={t('language')}
                value={locale}
                onChange={(event) => {
                  if (isLocale(event.target.value)) {
                    setOperationError('');
                    setLocaleLoaded(true);
                    setLocale(event.target.value);
                  }
                }}
              >
                <option value="zh-CN">{t('simplifiedChinese')}</option>
                <option value="en">{t('english')}</option>
              </select>
            </label>
            <span className={`connection ${connectionStatus === 'offline' ? 'down' : connectionStatus === 'online' || connectionStatus === 'connecting' ? '' : 'attention'}`} role="status" aria-live="polite"><i />{connectionLabel}</span>
          </div>
        </header>

        {connectionMessage && <div className={`alert connection-alert ${connectionStatus === 'offline' ? '' : 'attention-alert'}`} role="alert"><span>{connectionMessage}</span>{showConnectionRetry && <button type="button" disabled={connectionCheckPending} onClick={() => { setConnectionStatus('connecting'); refresh(connectionAbortRef.current?.signal); }}>{t('retry')}</button>}</div>}
        {operationError && <div className="alert operation-alert" role="alert"><span>{operationError}</span><button type="button" onClick={() => setOperationError('')}>{t('dismiss')}</button></div>}

        <section className="panel" id="panel-status" role="tabpanel" aria-labelledby="tab-status" hidden={activeTab !== 'status'}>
          <SectionTitle eyebrow={t('runtime')} title={t('coreStatus')}><span className="badge">{state?.capabilities.maturity === 'preview' || !state ? t('preview') : state.capabilities.maturity}</span></SectionTitle>
          <div className="metric-grid">
            <article><span>{t('controller')}</span><strong>{controllerLabel}</strong><small>{baseUrl}</small></article>
            <article><span>{t('host')}</span><strong>{state ? `${state.capabilities.platformLabel} ${state.capabilities.architecture}` : '—'}</strong><small>{t('detectedByController')}</small></article>
            <article><span>{t('providers')}</span><strong>{configuredProviders}/{state?.providers.length || 0}</strong><small>{t('credentialsAvailable')}</small></article>
            <article><span>{t('coreFeatures')}</span><strong>{availableFeatures}</strong><small>{t('optionalPacksIsolated')}</small></article>
          </div>
          <div className="two-column">
            <article className="card">
              <SectionTitle eyebrow={t('security')} title={t('localByDefault')} />
              <p>{state?.capabilities.network.loopbackOnly ? t('loopbackSummary') : t('networkReview')} {t('noTelemetry')}</p>
              <dl className="facts"><div><dt>{t('lanControl')}</dt><dd>{state?.capabilities.network.lanControl ? t('enabled') : t('disabled')}</dd></div><div><dt>{t('secrets')}</dt><dd>{t('environmentVariables')}</dd></div><div><dt>{t('userData')}</dt><dd>{t('outsideInstall')}</dd></div></dl>
            </article>
            <article className="card">
              <SectionTitle eyebrow={t('nextStep')} title={state?.models.length ? t('startConversation') : t('configureProvider')} />
              <p>{state?.models.length ? t('chooseChat') : t('configureProviderHelp')}</p>
              <button className="primary" type="button" disabled={!connected} onClick={() => selectTab(state?.models.length ? 'chat' : 'providers')}>{state?.models.length ? t('openChat') : t('viewSetup')}</button>
            </article>
          </div>
        </section>

        <section className="panel chat-panel" id="panel-chat" role="tabpanel" aria-labelledby="tab-chat" hidden={activeTab !== 'chat'}>
          <SectionTitle eyebrow={t('openaiCompatible')} title={t('chat')}>
            {sending && <button className="quiet" type="button" onClick={() => abortRef.current?.abort()}>{t('stop')}</button>}
          </SectionTitle>
          <div className="chat-controls">
            <label>{t('model')}<select value={modelId} onChange={(event) => setModelId(event.target.value)} disabled={!canUseChat || !state?.models.length}>{state?.models.length ? state.models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>) : <option value="">{t('noModelConfigured')}</option>}</select></label>
            <label>{t('persona')}<select value={personaId} onChange={(event) => setPersonaId(event.target.value)} disabled={!canUseChat}>{state?.personas.map((persona) => <option key={persona.id} value={persona.id}>{displayPersonaName(persona)}</option>)}</select></label>
          </div>
          <div className="messages" ref={messagesRef} aria-live="off" onScroll={() => {
            const viewport = messagesRef.current;
            if (viewport) keepChatAtBottomRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 80;
          }}>
            {!messages.length && <Empty>{t('messagesStayLocal')}</Empty>}
            {messages.map((message) => <article className={`message ${message.role}`} key={message.id}><span>{message.role === 'user' ? t('you') : t('assistant')}</span><p>{message.content}</p></article>)}
            {sending && <article className="message assistant pending"><span>{t('assistant')}</span><p>{t('waitingProviderEllipsis')}</p></article>}
            <div ref={messageEndRef} />
          </div>
          <p className="sr-only" role="status">{sending ? t('waitingProvider') : messages.at(-1)?.role === 'assistant' ? t('assistantReceived') : ''}</p>
          <form className="composer" onSubmit={sendMessage}>
            <label htmlFor="prompt">{t('message')}</label>
            <textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={t('promptPlaceholder')} rows={4} disabled={!canUseChat} />
            <button className="primary" type="submit" disabled={!canUseChat || !prompt.trim() || !modelId || sending}>{sending ? t('sending') : t('send')}</button>
          </form>
        </section>

        <section className="panel" id="panel-providers" role="tabpanel" aria-labelledby="tab-providers" hidden={activeTab !== 'providers'}>
          <SectionTitle eyebrow={t('routing')} title={t('providers')}><span className="badge">{t('configuredCount', { count: state?.providers.length || 0 })}</span></SectionTitle>
          {!state ? <Empty>{t('providerUnavailable')}</Empty> : !state.providers.length ? <Empty>{t('noProviders')}</Empty> : <div className="list">{state.providers.map((provider) => <article className="list-row" key={provider.id}><div><strong>{provider.name}</strong><span>{provider.baseUrl}</span></div><div><span className={provider.credentialConfigured ? 'state ok' : 'state warn'}>{provider.credentialConfigured ? t('ready') : t('missingKey')}</span><small>{t('modelAliasCount', { count: provider.models.length })}</small></div></article>)}</div>}
          <article className="card setup-card">
            <h3>{t('configurationFile')}</h3><code>{state?.paths.providers || t('unavailableUntilConnected')}</code>
            <p>{t('providerFileHelp')}</p>
            <pre>{`{
  "schemaVersion": 1,
  "providers": [{
    "id": "team",
    "name": "${t('exampleTeamGateway')}",
    "baseUrl": "https://api.example.com/v1",
    "apiKeyEnv": "MODELDECK_PROVIDER_TEAM_KEY",
    "models": [{
      "id": "team-chat",
      "upstreamId": "provider-model-id",
      "name": "${t('exampleTeamChat')}"
    }]
  }]
}`}</pre>
          </article>
        </section>

        <section className="panel" id="panel-personas" role="tabpanel" aria-labelledby="tab-personas" hidden={activeTab !== 'personas'}>
          <SectionTitle eyebrow={t('identity')} title={t('tabPersonas')}><span className="badge">{state?.personas.length || 0}</span></SectionTitle>
          {!state ? <Empty>{t('personaUnavailable')}</Empty> : <div className="persona-grid">{state.personas.map((persona) => {
            const name = displayPersonaName(persona);
            return <article className="persona" key={persona.id}><div><strong>{name}</strong><span>{persona.id}</span></div><p>{displayPersonaDescription(persona)}</p>{persona.id !== 'default' && <button className="danger" type="button" disabled={!canUsePersonas || Boolean(deletingPersonaId)} aria-label={t('deletePersonaAria', { name })} onClick={() => removePersona(persona.id)}>{deletingPersonaId === persona.id ? t('deleting') : t('delete')}</button>}</article>;
          })}</div>}
          <form className="card persona-form" onSubmit={createPersona}>
            <h3>{t('createPersona')}</h3>
            <label>{t('name')}<input required maxLength={80} disabled={!canUsePersonas} value={personaDraft.name} onChange={(event) => setPersonaDraft({ ...personaDraft, name: event.target.value })} /></label>
            <label>{t('description')}<input maxLength={300} disabled={!canUsePersonas} value={personaDraft.description} onChange={(event) => setPersonaDraft({ ...personaDraft, description: event.target.value })} /></label>
            <label>{t('systemPrompt')}<textarea required maxLength={20000} rows={6} disabled={!canUsePersonas} value={personaDraft.systemPrompt} onChange={(event) => setPersonaDraft({ ...personaDraft, systemPrompt: event.target.value })} /></label>
            <button className="primary" type="submit" disabled={!canUsePersonas || personaSaving}>{personaSaving ? t('saving') : t('createPersona')}</button>
          </form>
        </section>

        <section className="panel" id="panel-api" role="tabpanel" aria-labelledby="tab-api" hidden={activeTab !== 'api'}>
          <SectionTitle eyebrow={t('localApi')} title={t('openaiEndpoints')}><span className="badge">{state?.api.enabled ? t('apiEnabled') : t('apiDisabled')}</span></SectionTitle>
          <div className="endpoint-list"><article><span>GET</span><code>{baseUrl}/v1/models</code></article><article><span>POST</span><code>{baseUrl}/v1/chat/completions</code></article></div>
          <article className="card code-card">
            <h3>{t('requestExample')}</h3>
            <pre>{`curl -H "Content-Type: application/json" ${apiAuthorization}-d '{"model":"${modelId || 'your-model-alias'}","messages":[{"role":"user","content":"${t('exampleHello')}"}]}' ${baseUrl}/v1/chat/completions`}</pre>
          </article>
          <p className="hint">{t('apiHintPrefix')} <code>MODELDECK_API_KEY</code> {t('apiHintSuffix')}</p>
        </section>

        <section className="panel" id="panel-roadmap" role="tabpanel" aria-labelledby="tab-roadmap" hidden={activeTab !== 'roadmap'}>
          <SectionTitle eyebrow={t('capabilityPacks')} title={t('isolatedRoadmap')} />
          <p className="lead">{t('roadmapLead')}</p>
          <div className="capability-grid">{state && Object.entries(state.capabilities.features).map(([name, feature]) => <article key={name}><span className={`state ${feature.state === 'available' ? 'ok' : feature.state === 'unavailable' ? 'off' : 'planned'}`}>{t(featureStateKeys[feature.state])}</span><strong>{featureNameKeys[name] ? t(featureNameKeys[name]) : name}</strong><p>{featureReason(name, feature)}</p></article>)}</div>
        </section>
      </div>
    </main>
  );
}
