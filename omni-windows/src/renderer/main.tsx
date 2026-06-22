import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import { providerAdapters, type ProviderWebview, type SendResult } from './providerAdapters';
import { getInitialProviderUrl, saveProviderUrl, type ProviderId } from './providerUrlStore';

type WebviewNavigationEvent = Event & {
  url?: string;
};

type TrackedProviderWebview = ProviderWebview & {
  getURL?: () => string;
  dataset: DOMStringMap & {
    omniTrackedProvider?: ProviderId;
  };
};

type BroadcastStatus = {
  state: 'idle' | 'pending' | 'sent' | 'failed';
  message: string;
};

type LayoutMode = 'tabs' | 'split';

const PROVIDERS: Array<{
  id: ProviderId;
  label: string;
  defaultUrl: string;
  partition: string;
}> = [
  {
    id: 'claude',
    label: 'Claude',
    defaultUrl: 'https://claude.ai',
    partition: window.omni?.claudePartition ?? 'persist:claude',
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    defaultUrl: 'https://chatgpt.com',
    partition: window.omni?.chatgptPartition ?? 'persist:chatgpt',
  },
];

function App() {
  const [activeProviderId, setActiveProviderId] = React.useState<ProviderId>('claude');
  const [layoutMode, setLayoutMode] = React.useState<LayoutMode>('tabs');
  const [broadcastText, setBroadcastText] = React.useState('');
  const [broadcastStatuses, setBroadcastStatuses] = React.useState<Record<ProviderId, BroadcastStatus>>({
    claude: { state: 'idle', message: 'Ready' },
    chatgpt: { state: 'idle', message: 'Ready' },
  });
  const webviewRefs = React.useRef<Partial<Record<ProviderId, ProviderWebview>>>({});
  const activeProvider = PROVIDERS.find((provider) => provider.id === activeProviderId) ?? PROVIDERS[0];
  const initialProviderUrls = React.useMemo(
    () =>
      Object.fromEntries(
        PROVIDERS.map((provider) => [
          provider.id,
          getInitialProviderUrl({ id: provider.id, defaultUrl: provider.defaultUrl }),
        ]),
      ) as Record<ProviderId, string>,
    [],
  );

  const attachNavigationTracker = React.useCallback(
    (providerId: ProviderId) => (webview: TrackedProviderWebview | null) => {
      if (!webview) {
        delete webviewRefs.current[providerId];
        return;
      }

      webviewRefs.current[providerId] = webview;

      if (webview.dataset.omniTrackedProvider === providerId) {
        return;
      }

      const saveCurrentUrl = (event: WebviewNavigationEvent) => {
        const navigatedUrl = event.url ?? webview.getURL?.();

        if (navigatedUrl) {
          saveProviderUrl(providerId, navigatedUrl);
        }
      };

      webview.addEventListener('did-navigate', saveCurrentUrl);
      webview.addEventListener('did-navigate-in-page', saveCurrentUrl);
      webview.dataset.omniTrackedProvider = providerId;
    },
    [],
  );

  const handleBroadcastSubmit = React.useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();

      if (!broadcastText.trim()) {
        return;
      }

      const messageText = broadcastText;

      setBroadcastStatuses({
        claude: { state: 'pending', message: 'Sending...' },
        chatgpt: { state: 'pending', message: 'Sending...' },
      });

      const settledResults = await Promise.allSettled(
        PROVIDERS.map(async (provider): Promise<SendResult> => {
          const webview = webviewRefs.current[provider.id];

          if (!webview) {
            console.warn('[Omni broadcast]', provider.label, 'webview ref missing');
            return {
              ok: false,
              providerId: provider.id,
              message: 'webview not ready',
            };
          }

          return providerAdapters[provider.id].sendMessage(webview, messageText);
        }),
      );

      const nextStatuses = { ...broadcastStatuses };

      settledResults.forEach((result, index) => {
        const provider = PROVIDERS[index];

        if (result.status === 'rejected') {
          const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
          console.error('[Omni broadcast]', provider.label, reason);
          nextStatuses[provider.id] = { state: 'failed', message: reason };
          return;
        }

        nextStatuses[provider.id] = {
          state: result.value.ok ? 'sent' : 'failed',
          message: result.value.message,
        };
      });

      setBroadcastStatuses(nextStatuses);
      setBroadcastText('');
    },
    [broadcastStatuses, broadcastText],
  );

  const handleBroadcastKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || event.shiftKey) {
        return;
      }

      event.preventDefault();
      void handleBroadcastSubmit();
    },
    [handleBroadcastSubmit],
  );

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Workspace sidebar">
        <div className="brand">Omni</div>
        <nav className="workspace-list" aria-label="Workspaces">
          {PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              className={`workspace-item ${provider.id === activeProviderId ? 'active' : ''}`}
              type="button"
              onClick={() => setActiveProviderId(provider.id)}
            >
              {provider.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-area">
        <header className="tabbar" aria-label="Provider tabs">
          {PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              className={`tab ${provider.id === activeProviderId ? 'active' : ''}`}
              type="button"
              onClick={() => setActiveProviderId(provider.id)}
            >
              <span>{provider.label}</span>
              <span className={`provider-status ${broadcastStatuses[provider.id].state}`}>
                {broadcastStatuses[provider.id].message}
              </span>
            </button>
          ))}
          <div className="layout-toggle" aria-label="Layout mode">
            <button
              className={`layout-toggle-button ${layoutMode === 'tabs' ? 'active' : ''}`}
              type="button"
              onClick={() => setLayoutMode('tabs')}
            >
              탭 보기
            </button>
            <button
              className={`layout-toggle-button ${layoutMode === 'split' ? 'active' : ''}`}
              type="button"
              onClick={() => setLayoutMode('split')}
            >
              나란히 보기
            </button>
          </div>
          <div className="session-hint">Persistent session: {activeProvider.partition}</div>
        </header>

        <section
          className={`webview-panel ${layoutMode === 'split' ? 'split-mode' : 'tab-mode'}`}
          aria-label={layoutMode === 'split' ? 'Claude and ChatGPT webviews' : `${activeProvider.label} webview`}
        >
          {PROVIDERS.map((provider) => (
            <div
              key={provider.id}
              className={`provider-pane ${provider.id === activeProviderId ? 'active' : ''}`}
            >
              <webview
                className="provider-webview"
                src={initialProviderUrls[provider.id]}
                partition={provider.partition}
                allowpopups={true}
                ref={attachNavigationTracker(provider.id)}
              />
            </div>
          ))}
        </section>

        <form className="broadcast-bar" aria-label="Broadcast prompt" onSubmit={handleBroadcastSubmit}>
          <textarea
            className="broadcast-input"
            value={broadcastText}
            rows={1}
            placeholder="Send the same message to Claude and ChatGPT"
            onChange={(event) => setBroadcastText(event.target.value)}
            onKeyDown={handleBroadcastKeyDown}
          />
          <button className="broadcast-button" type="submit" disabled={!broadcastText.trim()}>
            Send
          </button>
        </form>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
