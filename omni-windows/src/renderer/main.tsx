import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import { providerAdapters, type ProviderWebview, type SendResult } from './providerAdapters';
import { getInitialProviderUrl, saveProviderUrl, type ProviderId } from './providerUrlStore';
import { createMemo, loadMemos, saveMemos } from './features/memos/memoStore';
import type { Memo } from './features/memos/types';

type WebviewNavigationEvent = Event & {
  url?: string;
};

type WebviewIpcMessageEvent = Event & {
  channel?: string;
  args?: Array<{
    text?: unknown;
    url?: unknown;
    title?: unknown;
  }>;
};

type TrackedProviderWebview = ProviderWebview & {
  getURL?: () => string;
  dataset: DOMStringMap & {
    omniTrackedProvider?: ProviderId;
    omniMemoProvider?: ProviderId;
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

const PROVIDER_LABELS: Record<ProviderId, string> = {
  claude: 'Claude',
  chatgpt: 'ChatGPT',
};

function formatMemoDate(value: number): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getMemoProviderLabel(memo: Memo): string {
  return memo.provider ? PROVIDER_LABELS[memo.provider] : '직접 메모';
}

function getSourceHint(memo: Memo): string {
  return memo.sourceTitle || memo.sourceUrl || '';
}

function App() {
  const [activeProviderId, setActiveProviderId] = React.useState<ProviderId>('claude');
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [memoPanelOpen, setMemoPanelOpen] = React.useState(false);
  const [memoSearch, setMemoSearch] = React.useState('');
  const [manualMemoText, setManualMemoText] = React.useState('');
  const [editingMemoId, setEditingMemoId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState('');
  const [editingContent, setEditingContent] = React.useState('');
  const [memos, setMemos] = React.useState<Memo[]>(() => loadMemos());
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
  const webviewCapturePreloadUrl = window.omni?.webviewCapturePreloadUrl;
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

  React.useEffect(() => {
    saveMemos(memos);
  }, [memos]);

  const sortedMemos = React.useMemo(() => {
    const searchText = memoSearch.trim().toLowerCase();

    return memos
      .filter((memo) => {
        if (!searchText) {
          return true;
        }

        return (
          memo.title.toLowerCase().includes(searchText) ||
          memo.content.toLowerCase().includes(searchText) ||
          getSourceHint(memo).toLowerCase().includes(searchText)
        );
      })
      .sort((left, right) => right.createdAt - left.createdAt);
  }, [memoSearch, memos]);

  const pinnedMemos = sortedMemos.filter((memo) => memo.pinned);
  const unpinnedMemos = sortedMemos.filter((memo) => !memo.pinned);

  const attachNavigationTracker = React.useCallback(
    (providerId: ProviderId) => (webview: TrackedProviderWebview | null) => {
      if (!webview) {
        delete webviewRefs.current[providerId];
        return;
      }

      webviewRefs.current[providerId] = webview;

      if (webview.dataset.omniTrackedProvider !== providerId) {
        const saveCurrentUrl = (event: WebviewNavigationEvent) => {
          const navigatedUrl = event.url ?? webview.getURL?.();

          if (navigatedUrl) {
            saveProviderUrl(providerId, navigatedUrl);
          }
        };

        webview.addEventListener('did-navigate', saveCurrentUrl);
        webview.addEventListener('did-navigate-in-page', saveCurrentUrl);
        webview.dataset.omniTrackedProvider = providerId;
      }

      if (webview.dataset.omniMemoProvider !== providerId) {
        webview.addEventListener('ipc-message', (event: WebviewIpcMessageEvent) => {
          if (event.channel !== 'omni-save-memo') {
            return;
          }

          const payload = event.args?.[0];
          const text = typeof payload?.text === 'string' ? payload.text.trim() : '';

          if (text.length < 3) {
            return;
          }

          const sourceUrl = typeof payload?.url === 'string' ? payload.url : null;
          const sourceTitle = typeof payload?.title === 'string' && payload.title.trim() ? payload.title.trim() : null;

          setMemos((currentMemos) => [
            createMemo({
              content: text,
              provider: providerId,
              sourceUrl,
              sourceTitle,
            }),
            ...currentMemos,
          ]);
          setMemoPanelOpen(true);
        });
        webview.dataset.omniMemoProvider = providerId;
      }
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
    setMemoPanelOpen(false);
    setCollapsedProviders((current) => ({
      ...current,
      [providerId]: false,
    }));
  }, []);

  const handleManualMemoSave = React.useCallback(() => {
    const content = manualMemoText.trim();

    if (!content) {
      return;
    }

    setMemos((currentMemos) => [
      createMemo({
        content,
        provider: null,
        sourceUrl: null,
        sourceTitle: null,
      }),
      ...currentMemos,
    ]);
    setManualMemoText('');
  }, [manualMemoText]);

  const updateMemo = React.useCallback((memoId: string, updater: (memo: Memo) => Memo) => {
    setMemos((currentMemos) => currentMemos.map((memo) => (memo.id === memoId ? updater(memo) : memo)));
  }, []);

  const startEditingMemo = React.useCallback((memo: Memo) => {
    setEditingMemoId(memo.id);
    setEditingTitle(memo.title);
    setEditingContent(memo.content);
  }, []);

  const saveEditedMemo = React.useCallback(() => {
    if (!editingMemoId) {
      return;
    }

    const title = editingTitle.trim();
    const content = editingContent.trim();

    if (!title || !content) {
      return;
    }

    updateMemo(editingMemoId, (memo) => ({
      ...memo,
      title,
      content,
      updatedAt: Date.now(),
    }));
    setEditingMemoId(null);
    setEditingTitle('');
    setEditingContent('');
  }, [editingContent, editingMemoId, editingTitle, updateMemo]);

  const deleteMemo = React.useCallback((memoId: string) => {
    if (!window.confirm('이 메모를 삭제할까요?')) {
      return;
    }

    setMemos((currentMemos) => currentMemos.filter((memo) => memo.id !== memoId));
  }, []);

  const copyMemo = React.useCallback(async (content: string) => {
    await navigator.clipboard.writeText(content);
  }, []);

  const navigateToMemoSource = React.useCallback((memo: Memo) => {
    if (!memo.provider || !memo.sourceUrl) {
      return;
    }

    setActiveProviderId(memo.provider);
    setCollapsedProviders((current) => ({
      ...current,
      [memo.provider as ProviderId]: false,
    }));
    webviewRefs.current[memo.provider]?.loadURL?.(memo.sourceUrl);
  }, []);

  const renderMemoCard = (memo: Memo) => {
    const isEditing = editingMemoId === memo.id;
    const sourceHint = getSourceHint(memo);

    return (
      <article
        key={memo.id}
        className={`memo-card ${memo.provider && memo.sourceUrl ? 'clickable' : ''}`}
        onClick={() => navigateToMemoSource(memo)}
      >
        <div className="memo-card-meta">
          <span className={`memo-provider ${memo.provider ?? 'manual'}`}>{getMemoProviderLabel(memo)}</span>
          <span>{formatMemoDate(memo.createdAt)}</span>
        </div>

        {isEditing ? (
          <div className="memo-edit-form" onClick={(event) => event.stopPropagation()}>
            <input
              className="memo-title-input"
              value={editingTitle}
              onChange={(event) => setEditingTitle(event.target.value)}
            />
            <textarea
              className="memo-content-input"
              value={editingContent}
              rows={5}
              onChange={(event) => setEditingContent(event.target.value)}
            />
            <div className="memo-edit-actions">
              <button className="memo-action-button primary" type="button" onClick={saveEditedMemo}>
                저장
              </button>
              <button className="memo-action-button" type="button" onClick={() => setEditingMemoId(null)}>
                취소
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              className="memo-title-button"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                startEditingMemo(memo);
              }}
            >
              {memo.title}
            </button>
            <p className="memo-preview">{memo.content}</p>
            {sourceHint && <div className="memo-source">{sourceHint}</div>}
          </>
        )}

        <div className="memo-actions" onClick={(event) => event.stopPropagation()}>
          <button
            className="memo-action-button"
            type="button"
            title={memo.pinned ? '고정해제' : '고정'}
            onClick={() =>
              updateMemo(memo.id, (currentMemo) => ({
                ...currentMemo,
                pinned: !currentMemo.pinned,
                updatedAt: Date.now(),
              }))
            }
          >
            {memo.pinned ? 'Unpin' : 'Pin'}
          </button>
          <button className="memo-action-button" type="button" title="복사" onClick={() => void copyMemo(memo.content)}>
            Copy
          </button>
          <button className="memo-action-button" type="button" title="편집" onClick={() => startEditingMemo(memo)}>
            Edit
          </button>
          <button className="memo-action-button danger" type="button" title="삭제" onClick={() => deleteMemo(memo.id)}>
            Delete
          </button>
        </div>
      </article>
    );
  };

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
              className={`workspace-item ${!memoPanelOpen && provider.id === activeProviderId ? 'active' : ''}`}
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
          <button
            className={`workspace-item ${memoPanelOpen ? 'active' : ''}`}
            type="button"
            title="메모"
            onClick={() => setMemoPanelOpen((isOpen) => !isOpen)}
          >
            <span className="workspace-icon" aria-hidden="true">
              M
            </span>
            <span className="workspace-label">메모</span>
          </button>
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
                  preload={webviewCapturePreloadUrl?.startsWith('file:') ? webviewCapturePreloadUrl : undefined}
                  allowpopups={'true' as unknown as boolean}
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

        {memoPanelOpen && (
          <aside className="memo-panel" aria-label="Memos">
            <div className="memo-panel-header">
              <h2>메모</h2>
              <button
                className="memo-close-button"
                type="button"
                aria-label="Close memos"
                onClick={() => setMemoPanelOpen(false)}
              >
                x
              </button>
            </div>
            <input
              className="memo-search"
              value={memoSearch}
              placeholder="제목 또는 내용 검색"
              onChange={(event) => setMemoSearch(event.target.value)}
            />
            <textarea
              className="manual-memo-input"
              value={manualMemoText}
              rows={4}
              placeholder="직접 메모 작성"
              onChange={(event) => setManualMemoText(event.target.value)}
            />
            <button
              className="manual-memo-save"
              type="button"
              disabled={!manualMemoText.trim()}
              onClick={handleManualMemoSave}
            >
              메모 저장하기
            </button>

            <div className="memo-section">
              <h3>고정됨</h3>
              {pinnedMemos.length > 0 ? (
                pinnedMemos.map(renderMemoCard)
              ) : (
                <p className="memo-empty">고정된 메모가 없습니다.</p>
              )}
            </div>

            <div className="memo-section">
              <h3>메모</h3>
              {unpinnedMemos.length > 0 ? (
                unpinnedMemos.map(renderMemoCard)
              ) : (
                <p className="memo-empty">저장된 메모가 없습니다.</p>
              )}
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
