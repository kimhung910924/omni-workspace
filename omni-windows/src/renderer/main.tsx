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
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [collapsedProviders, setCollapsedProviders] = React.useState<Record<ProviderId, boolean>>({
    claude: false,
    chatgpt: false,
  });
  const [broadcastCollapsed, setBroadcastCollapsed] = React.useState(false);
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

  const handleWorkspaceSelect = React.useCallback((providerId: ProviderId) => {
    setActiveProviderId(providerId);
    setCollapsedProviders((current) => ({
      ...current,
      [providerId]: false,
    }));
  }, []);

  const toggleProviderCollapsed = React.useCallback((providerId: ProviderId) => {
    setCollapsedProviders((current) => {
      if (current[providerId]) {
        setActiveProviderId(providerId);
        return {
          ...current,
          [providerId]: false,
        };
      }

      const otherProvider = PROVIDERS.find((provider) => provider.id !== providerId);

      if (!otherProvider || current[otherProvider.id]) {
        return current;
      }

      setActiveProviderId(otherProvider.id);
      return {
        ...current,
        [providerId]: true,
      };
    });
  }, []);

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar" aria-label="Workspace sidebar">
        <div className="sidebar-header">
          <button
            className="sidebar-toggle"
            type="button"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            {sidebarCollapsed ? '>' : '<'}
          </button>
          <div className="brand">Omni</div>
        </div>
        <nav className="workspace-list" aria-label="Workspaces">
          {PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              className={`workspace-item ${provider.id === activeProviderId ? 'active' : ''}`}
              type="button"
              title={provider.label}
              onClick={() => handleWorkspaceSelect(provider.id)}
            >
              <span className="workspace-icon" aria-hidden="true">
                {provider.label[0]}
              </span>
              <span className="workspace-label">{provider.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-area">
        <header className="topbar" aria-label="Workspace status">
          <div className="topbar-title">Omni Windows</div>
          <div className="session-hint">Persistent session: {activeProvider.partition}</div>
        </header>

        <section className="webview-panel" aria-label="Claude and ChatGPT webviews">
          {PROVIDERS.map((provider) => {
            const isCollapsed = collapsedProviders[provider.id];
            const canCollapse =
              !isCollapsed && PROVIDERS.some((other) => other.id !== provider.id && !collapsedProviders[other.id]);

            return (
              <div key={provider.id} className={`provider-pane ${isCollapsed ? 'collapsed' : 'expanded'}`}>
                <div className="provider-pane-header">
                  <span className="provider-pane-title">{provider.label}</span>
                  {!isCollapsed && (
                    <span className={`provider-status ${broadcastStatuses[provider.id].state}`}>
                      {broadcastStatuses[provider.id].message}
                    </span>
                  )}
                  <button
                    className="provider-collapse-button"
                    type="button"
                    disabled={!isCollapsed && !canCollapse}
                    title={isCollapsed ? `Expand ${provider.label}` : `Collapse ${provider.label}`}
                    aria-label={isCollapsed ? `Expand ${provider.label}` : `Collapse ${provider.label}`}
                    onClick={() => toggleProviderCollapsed(provider.id)}
                  >
                    {isCollapsed ? '>' : '<'}
                  </button>
                </div>
                <webview
                  className="provider-webview"
                  src={initialProviderUrls[provider.id]}
                  partition={provider.partition}
                  allowpopups={true}
                  ref={attachNavigationTracker(provider.id)}
                />
              </div>
            );
          })}
        </section>

        <form
          className={`broadcast-bar ${broadcastCollapsed ? 'collapsed' : ''}`}
          aria-label="Broadcast prompt"
          onSubmit={handleBroadcastSubmit}
        >
          <button
            className="broadcast-toggle"
            type="button"
            aria-label={broadcastCollapsed ? 'Expand broadcast bar' : 'Collapse broadcast bar'}
            onClick={() => setBroadcastCollapsed((collapsed) => !collapsed)}
          >
            {broadcastCollapsed ? '^' : 'v'}
          </button>
          {!broadcastCollapsed && (
            <>
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
            </>
          )}
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
