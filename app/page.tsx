'use client';

import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';

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

const tabs: Array<{ id: TabId; label: string; glyph: string }> = [
  { id: 'status', label: 'Status', glyph: '◉' },
  { id: 'chat', label: 'Chat', glyph: '◌' },
  { id: 'providers', label: 'Providers', glyph: '◇' },
  { id: 'personas', label: 'Personas', glyph: '◎' },
  { id: 'api', label: 'API', glyph: '⌁' },
  { id: 'roadmap', label: 'Packs', glyph: '＋' },
];

const dashboardControllerPath = '/api/controller';
const tabRequirements: Record<TabId, string> = {
  status: 'dashboard',
  chat: 'remoteChat',
  providers: 'remoteChat',
  personas: 'personas',
  api: 'localApi',
  roadmap: 'dashboard',
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

function asErrorMessage(value: unknown) {
  if (value instanceof Error) return value.message;
  return String(value || 'Request failed.');
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
  const [activeTab, setActiveTab] = useState<TabId>('status');
  const [state, setState] = useState<State | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [connectionError, setConnectionError] = useState('');
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
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const keepChatAtBottomRef = useRef(true);
  const baseUrl = state?.api.baseUrl || 'http://127.0.0.1:8080';

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      if (!dashboardToken) throw new Error('Dashboard session token is missing. Open the secure URL printed by modeldeck.');
      const response = await fetch(`${dashboardControllerPath}/api/state`, {
        signal,
        cache: 'no-store',
        headers: { 'X-ModelDeck-Dashboard-Token': dashboardToken },
      });
      if (!response.ok) throw new Error(`Controller returned HTTP ${response.status}.`);
      const next: unknown = await response.json();
      if (!isState(next)) throw new Error('Controller/dashboard schema mismatch. Update both components together.');
      setState(next);
      setModelId((current) => current && next.models.some((model) => model.id === current) ? current : next.models[0]?.id || '');
      setPersonaId((current) => current && next.personas.some((persona) => persona.id === current) ? current : next.personas[0]?.id || '');
      setConnectionStatus('online');
      setConnectionError('');
    } catch (reason) {
      if ((reason as Error)?.name !== 'AbortError') {
        setConnectionStatus('offline');
        setConnectionError(asErrorMessage(reason));
      }
      throw reason;
    }
  }, [dashboardToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let token = '';
      try {
        const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
        token = fragmentToken || window.sessionStorage.getItem('modeldeck-dashboard-token') || '';
        if (fragmentToken) {
          window.sessionStorage.setItem('modeldeck-dashboard-token', fragmentToken);
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
        }
      } catch {
        token = '';
      }
      setDashboardToken(token);
      if (!token) {
        setConnectionStatus('offline');
        setConnectionError('Dashboard session token is missing. Open the secure URL printed by modeldeck.');
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!dashboardToken) return;
    const controller = new AbortController();
    const initialLoad = window.setTimeout(() => {
      refresh(controller.signal).catch(() => undefined);
    }, 0);
    const timer = window.setInterval(() => refresh().catch(() => undefined), 5000);
    return () => {
      controller.abort();
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
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
      if (!response.ok) throw new Error(body?.error?.message || `Chat failed with HTTP ${response.status}.`);
      const content = body?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new Error('Provider returned an empty reply.');
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content }]);
    } catch (reason) {
      if ((reason as Error)?.name !== 'AbortError') setOperationError(asErrorMessage(reason));
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
    try {
      const response = await fetch(`${dashboardControllerPath}/api/personas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-ModelDeck-Dashboard-Token': dashboardToken || '' },
        body: JSON.stringify(personaDraft),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || 'Unable to create persona.');
      setPersonaDraft({ name: '', description: '', systemPrompt: '' });
      await refresh();
      setPersonaId(body.persona.id);
    } catch (reason) {
      setOperationError(asErrorMessage(reason));
    } finally {
      setPersonaSaving(false);
    }
  }

  async function removePersona(id: string) {
    const persona = state?.personas.find((entry) => entry.id === id);
    if (!persona || id === 'default' || deletingPersonaId || connectionStatus !== 'online' || !featureAvailable('personas')) return;
    if (!window.confirm(`Delete persona “${persona.name}”? This cannot be undone.`)) return;
    setDeletingPersonaId(id);
    setOperationError('');
    try {
      const response = await fetch(`${dashboardControllerPath}/api/personas/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'X-ModelDeck-Dashboard-Token': dashboardToken || '' },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message || 'Unable to delete persona.');
      }
      await refresh();
    } catch (reason) {
      setOperationError(asErrorMessage(reason));
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
    ? 'Connecting'
    : connectionStatus === 'offline'
      ? 'Controller offline'
      : state?.capabilities.network.loopbackOnly ? 'Loopback connected' : 'Connected';
  const apiAuthorization = state?.api.enabled ? '-H "Authorization: Bearer $MODELDECK_API_KEY" ' : '';

  return (
    <main className="shell">
      <aside className="rail">
        <div className="brand" aria-label="Model Deck Core">MD</div>
        <nav aria-label="Primary" role="tablist">
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
              <span aria-hidden="true">{tab.glyph}</span>{tab.label}
            </button>
          ))}
        </nav>
        <p className="rail-note">CORE<br />PREVIEW</p>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div><p>LOCAL CONTROL PLANE</p><h1>Model Deck Core</h1></div>
          <span className={connectionStatus === 'offline' ? 'connection down' : 'connection'} role="status" aria-live="polite"><i />{connectionLabel}</span>
        </header>

        {connectionError && <div className="alert" role="alert"><span>{connectionError}</span><button type="button" onClick={() => { setConnectionStatus('connecting'); refresh().catch(() => undefined); }}>Retry</button></div>}
        {operationError && <div className="alert operation-alert" role="alert"><span>{operationError}</span><button type="button" onClick={() => setOperationError('')}>Dismiss</button></div>}

        <section className="panel" id="panel-status" role="tabpanel" aria-labelledby="tab-status" hidden={activeTab !== 'status'}>
          <SectionTitle eyebrow="RUNTIME" title="Core status"><span className="badge">{state?.capabilities.maturity || 'preview'}</span></SectionTitle>
          <div className="metric-grid">
            <article><span>Controller</span><strong>{connectionStatus === 'offline' ? 'Offline' : connectionStatus === 'connecting' ? 'Connecting' : 'Ready'}</strong><small>{baseUrl}</small></article>
            <article><span>Host</span><strong>{state ? `${state.capabilities.platformLabel} ${state.capabilities.architecture}` : '—'}</strong><small>Detected by the controller</small></article>
            <article><span>Providers</span><strong>{configuredProviders}/{state?.providers.length || 0}</strong><small>Credentials available</small></article>
            <article><span>Core features</span><strong>{availableFeatures}</strong><small>Optional packs stay isolated</small></article>
          </div>
          <div className="two-column">
            <article className="card">
              <SectionTitle eyebrow="SECURITY" title="Local by default" />
              <p>{state?.capabilities.network.loopbackOnly ? 'Core Preview listens on loopback only.' : 'Review the active network configuration before use.'} It does not download models or enable application telemetry.</p>
              <dl className="facts"><div><dt>LAN control</dt><dd>{state?.capabilities.network.lanControl ? 'Enabled' : 'Disabled'}</dd></div><div><dt>Secrets</dt><dd>Environment variables</dd></div><div><dt>User data</dt><dd>Outside the installation directory</dd></div></dl>
            </article>
            <article className="card">
              <SectionTitle eyebrow="NEXT STEP" title={state?.models.length ? 'Start a conversation' : 'Configure a provider'} />
              <p>{state?.models.length ? 'Choose Chat to use any configured OpenAI-compatible model.' : 'Run modeldeck config-path, add a provider and model alias, then restart the controller.'}</p>
              <button className="primary" type="button" disabled={!connected} onClick={() => selectTab(state?.models.length ? 'chat' : 'providers')}>{state?.models.length ? 'Open chat' : 'View setup'}</button>
            </article>
          </div>
        </section>

        <section className="panel chat-panel" id="panel-chat" role="tabpanel" aria-labelledby="tab-chat" hidden={activeTab !== 'chat'}>
          <SectionTitle eyebrow="OPENAI-COMPATIBLE" title="Chat">
            {sending && <button className="quiet" type="button" onClick={() => abortRef.current?.abort()}>Stop</button>}
          </SectionTitle>
          <div className="chat-controls">
            <label>Model<select value={modelId} onChange={(event) => setModelId(event.target.value)} disabled={!canUseChat || !state?.models.length}>{state?.models.length ? state.models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>) : <option value="">No model configured</option>}</select></label>
            <label>Persona<select value={personaId} onChange={(event) => setPersonaId(event.target.value)} disabled={!canUseChat}>{state?.personas.map((persona) => <option key={persona.id} value={persona.id}>{persona.name}</option>)}</select></label>
          </div>
          <div className="messages" ref={messagesRef} aria-live="off" onScroll={() => {
            const viewport = messagesRef.current;
            if (viewport) keepChatAtBottomRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 80;
          }}>
            {!messages.length && <Empty>Messages stay in this browser session. Configure a provider before sending the first prompt.</Empty>}
            {messages.map((message) => <article className={`message ${message.role}`} key={message.id}><span>{message.role === 'user' ? 'You' : 'Assistant'}</span><p>{message.content}</p></article>)}
            {sending && <article className="message assistant pending"><span>Assistant</span><p>Waiting for the provider…</p></article>}
            <div ref={messageEndRef} />
          </div>
          <p className="sr-only" role="status">{sending ? 'Waiting for the provider.' : messages.at(-1)?.role === 'assistant' ? 'Assistant response received.' : ''}</p>
          <form className="composer" onSubmit={sendMessage}>
            <label htmlFor="prompt">Message</label>
            <textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask the configured model…" rows={4} disabled={!canUseChat} />
            <button className="primary" type="submit" disabled={!canUseChat || !prompt.trim() || !modelId || sending}>{sending ? 'Sending…' : 'Send'}</button>
          </form>
        </section>

        <section className="panel" id="panel-providers" role="tabpanel" aria-labelledby="tab-providers" hidden={activeTab !== 'providers'}>
          <SectionTitle eyebrow="ROUTING" title="Providers"><span className="badge">{state?.providers.length || 0} configured</span></SectionTitle>
          {!state ? <Empty>Provider data is unavailable until the controller connects.</Empty> : !state.providers.length ? <Empty>No providers are configured yet.</Empty> : <div className="list">{state.providers.map((provider) => <article className="list-row" key={provider.id}><div><strong>{provider.name}</strong><span>{provider.baseUrl}</span></div><div><span className={provider.credentialConfigured ? 'state ok' : 'state warn'}>{provider.credentialConfigured ? 'Ready' : 'Missing key'}</span><small>{provider.models.length} model aliases</small></div></article>)}</div>}
          <article className="card setup-card">
            <h3>Configuration file</h3><code>{state?.paths.providers || 'Unavailable until the controller connects'}</code>
            <p>Provider files contain endpoint metadata and model aliases only. Put credentials in the environment variable named by <code>apiKeyEnv</code>.</p>
            <pre>{`{
  "schemaVersion": 1,
  "providers": [{
    "id": "team",
    "name": "Team gateway",
    "baseUrl": "https://api.example.com/v1",
    "apiKeyEnv": "MODELDECK_PROVIDER_TEAM_KEY",
    "models": [{
      "id": "team-chat",
      "upstreamId": "provider-model-id",
      "name": "Team Chat"
    }]
  }]
}`}</pre>
          </article>
        </section>

        <section className="panel" id="panel-personas" role="tabpanel" aria-labelledby="tab-personas" hidden={activeTab !== 'personas'}>
          <SectionTitle eyebrow="IDENTITY" title="Personas"><span className="badge">{state?.personas.length || 0}</span></SectionTitle>
          {!state ? <Empty>Persona data is unavailable until the controller connects.</Empty> : <div className="persona-grid">{state.personas.map((persona) => <article className="persona" key={persona.id}><div><strong>{persona.name}</strong><span>{persona.id}</span></div><p>{persona.description || 'No description.'}</p>{persona.id !== 'default' && <button className="danger" type="button" disabled={!canUsePersonas || Boolean(deletingPersonaId)} aria-label={`Delete persona ${persona.name}`} onClick={() => removePersona(persona.id)}>{deletingPersonaId === persona.id ? 'Deleting…' : 'Delete'}</button>}</article>)}</div>}
          <form className="card persona-form" onSubmit={createPersona}>
            <h3>Create persona</h3>
            <label>Name<input required maxLength={80} disabled={!canUsePersonas} value={personaDraft.name} onChange={(event) => setPersonaDraft({ ...personaDraft, name: event.target.value })} /></label>
            <label>Description<input maxLength={300} disabled={!canUsePersonas} value={personaDraft.description} onChange={(event) => setPersonaDraft({ ...personaDraft, description: event.target.value })} /></label>
            <label>System prompt<textarea required maxLength={20000} rows={6} disabled={!canUsePersonas} value={personaDraft.systemPrompt} onChange={(event) => setPersonaDraft({ ...personaDraft, systemPrompt: event.target.value })} /></label>
            <button className="primary" type="submit" disabled={!canUsePersonas || personaSaving}>{personaSaving ? 'Saving…' : 'Create persona'}</button>
          </form>
        </section>

        <section className="panel" id="panel-api" role="tabpanel" aria-labelledby="tab-api" hidden={activeTab !== 'api'}>
          <SectionTitle eyebrow="LOCAL API" title="OpenAI-compatible endpoints"><span className="badge">{state?.api.enabled ? 'enabled · authenticated' : 'disabled by default'}</span></SectionTitle>
          <div className="endpoint-list"><article><span>GET</span><code>{baseUrl}/v1/models</code></article><article><span>POST</span><code>{baseUrl}/v1/chat/completions</code></article></div>
          <article className="card code-card">
            <h3>Request example</h3>
            <pre>{`curl -H "Content-Type: application/json" ${apiAuthorization}-d '{"model":"${modelId || 'your-model-alias'}","messages":[{"role":"user","content":"Hello"}]}' ${baseUrl}/v1/chat/completions`}</pre>
          </article>
          <p className="hint">Set <code>MODELDECK_API_KEY</code> and restart Core to enable <code>/v1/*</code>; Bearer authentication is always required when it is enabled. Dashboard control uses separate ephemeral session protection.</p>
        </section>

        <section className="panel" id="panel-roadmap" role="tabpanel" aria-labelledby="tab-roadmap" hidden={activeTab !== 'roadmap'}>
          <SectionTitle eyebrow="CAPABILITY PACKS" title="Isolated platform roadmap" />
          <p className="lead">Core stays small and portable. Hardware-heavy features are added only when their runtime, license and operating-system lifecycle can be tested independently.</p>
          <div className="capability-grid">{state && Object.entries(state.capabilities.features).map(([name, feature]) => <article key={name}><span className={`state ${feature.state === 'available' ? 'ok' : feature.state === 'unavailable' ? 'off' : 'planned'}`}>{feature.state}</span><strong>{name}</strong><p>{feature.reason || 'Included in Core Preview.'}</p></article>)}</div>
        </section>
      </div>
    </main>
  );
}
