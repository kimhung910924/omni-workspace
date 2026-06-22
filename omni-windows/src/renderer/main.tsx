import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import { getInitialProviderUrl, saveProviderUrl, type ProviderId } from './providerUrlStore';

type WebviewNavigationEvent = Event & {
  url?: string;
};

type ProviderWebview = HTMLElement & {
  getURL?: () => string;
  dataset: DOMStringMap & {
    omniTrackedProvider?: ProviderId;
  };
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
    (providerId: ProviderId) => (webview: ProviderWebview | null) => {
      if (!webview) {
        return;
      }

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
              {provider.label}
            </button>
          ))}
          <div className="session-hint">Persistent session: {activeProvider.partition}</div>
        </header>

        <section className="webview-panel" aria-label={`${activeProvider.label} webview`}>
          {PROVIDERS.map((provider) => (
            <webview
              key={provider.id}
              className={`provider-webview ${provider.id === activeProviderId ? 'active' : ''}`}
              src={initialProviderUrls[provider.id]}
              partition={provider.partition}
              allowpopups={true}
              ref={attachNavigationTracker(provider.id)}
            />
          ))}
        </section>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
