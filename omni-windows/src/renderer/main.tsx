import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';

type ProviderId = 'claude' | 'chatgpt';

const PROVIDERS: Array<{
  id: ProviderId;
  label: string;
  url: string;
  partition: string;
}> = [
  {
    id: 'claude',
    label: 'Claude',
    url: 'https://claude.ai',
    partition: window.omni?.claudePartition ?? 'persist:claude',
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    url: 'https://chatgpt.com',
    partition: window.omni?.chatgptPartition ?? 'persist:chatgpt',
  },
];

function App() {
  const [activeProviderId, setActiveProviderId] = React.useState<ProviderId>('claude');
  const activeProvider = PROVIDERS.find((provider) => provider.id === activeProviderId) ?? PROVIDERS[0];

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
              src={provider.url}
              partition={provider.partition}
              allowpopups={true}
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
