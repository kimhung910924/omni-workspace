import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';

const CLAUDE_URL = 'https://claude.ai';
const CLAUDE_PARTITION = window.omni?.claudePartition ?? 'persist:claude';

function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Workspace sidebar">
        <div className="brand">Omni</div>
        <nav className="workspace-list" aria-label="Workspaces">
          <button className="workspace-item active" type="button">Claude</button>
          <button className="workspace-item" type="button" disabled>Prompts</button>
          <button className="workspace-item" type="button" disabled>Notes</button>
        </nav>
      </aside>

      <main className="main-area">
        <header className="tabbar" aria-label="Provider tabs">
          <button className="tab active" type="button">Claude</button>
          <div className="session-hint">Persistent session: {CLAUDE_PARTITION}</div>
        </header>

        <section className="webview-panel" aria-label="Claude webview">
          <webview
            className="provider-webview"
            src={CLAUDE_URL}
            partition={CLAUDE_PARTITION}
            allowpopups="true"
          />
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
