import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import { SlotHeader } from './SlotHeader';
import { providerAdapters, type ProviderWebview, type SendResult } from './providerAdapters';
import { getInitialProviderUrl, saveProviderUrl, type ProviderId } from './providerUrlStore';
import { createMemo, loadMemos, saveMemos } from './features/memos/memoStore';
import type { Memo } from './features/memos/types';

type WebviewNavigationEvent = Event & {
  url?: string;
  errorCode?: number;
  isMainFrame?: boolean;
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

type NavigationState = {
  canGoBack: boolean;
  canGoForward: boolean;
  isDomReady: boolean;
};

const PROVIDERS: Array<{
  id: ProviderId;
  label: string;
  defaultUrl: string;
  partition: string;
}> = [
  {
    id: 'claude',
    label: providerAdapters.claude.label,
    defaultUrl: providerAdapters.claude.startUrl,
    partition: window.omni?.claudePartition ?? 'persist:claude',
  },
  {
    id: 'chatgpt',
    label: providerAdapters.chatgpt.label,
    defaultUrl: providerAdapters.chatgpt.startUrl,
    partition: window.omni?.chatgptPartition ?? 'persist:chatgpt',
  },
  {
    id: 'gemini',
    label: providerAdapters.gemini.label,
    defaultUrl: providerAdapters.gemini.startUrl,
    partition: window.omni?.geminiPartition ?? 'persist:gemini',
  },
];

const PROVIDER_LABELS: Record<ProviderId, string> = {
  claude: 'Claude',
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
};

const LOAD_FAILURE_MESSAGE = '삭제되었거나 접근할 수 없는 대화방입니다. 메모는 그대로 보관됩니다.';

function formatMemoDate(value: number): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getMemoProviderLabel(memo: Memo): string {
  if (memo.provider === 'gemini') {
    return 'Gemini';
  }

  return memo.provider ? PROVIDER_LABELS[memo.provider] : 'Private';
}

function getMemoDisplayTitle(memo: Memo): string {
  const title = memo.title.trim();

  if (title) {
    return title;
  }

  const contentTitle = memo.content.split(/\r?\n/).find(Boolean)?.trim().slice(0, 40);
  return contentTitle || '새 메모';
}

function isNavigableProvider(provider: Memo['provider']): provider is ProviderId {
  return provider === 'claude' || provider === 'chatgpt';
}

function getSourceHint(memo: Memo): string {
  if (memo.sourceTitle) {
    return memo.sourceTitle;
  }

  if (!memo.sourceUrl) {
    return '';
  }

  try {
    const url = new URL(memo.sourceUrl);
    return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    return memo.sourceUrl;
  }
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
  const [selectedMemoId, setSelectedMemoId] = React.useState<string | null>(null);
  const [navigationNotice, setNavigationNotice] = React.useState('');
  const [memos, setMemos] = React.useState<Memo[]>(() => loadMemos());
  const [webviewCapturePreloadUrl, setWebviewCapturePreloadUrl] = React.useState<string | null>(null);
  const [openProviderIds, setOpenProviderIds] = React.useState<ProviderId[]>(() => PROVIDERS.map((provider) => provider.id));
  const [collapsedProviders, setCollapsedProviders] = React.useState<Record<ProviderId, boolean>>({
    claude: false,
    chatgpt: false,
    gemini: false,
  });
  const [navigationStates, setNavigationStates] = React.useState<Partial<Record<ProviderId, NavigationState>>>({
    claude: { canGoBack: false, canGoForward: false, isDomReady: false },
    chatgpt: { canGoBack: false, canGoForward: false, isDomReady: false },
    gemini: { canGoBack: false, canGoForward: false, isDomReady: false },
  });
  const [broadcastCollapsed, setBroadcastCollapsed] = React.useState(false);
  const [broadcastText, setBroadcastText] = React.useState('');
  const [broadcastStatuses, setBroadcastStatuses] = React.useState<Record<ProviderId, BroadcastStatus>>({
    claude: { state: 'idle', message: 'Ready' },
    chatgpt: { state: 'idle', message: 'Ready' },
    gemini: { state: 'idle', message: 'Ready' },
  });
  const webviewRefs = React.useRef<Partial<Record<ProviderId, ProviderWebview>>>({});
  const webviewReadyRef = React.useRef<Partial<Record<ProviderId, boolean>>>({});
  const webviewRefCallbacks = React.useRef<Partial<Record<ProviderId, (webview: TrackedProviderWebview | null) => void>>>({});
  const openProviders = React.useMemo(
    () => openProviderIds.map((providerId) => PROVIDERS.find((provider) => provider.id === providerId)).filter(Boolean) as typeof PROVIDERS,
    [openProviderIds],
  );
  const broadcastProviders = React.useMemo(
    () => openProviders.filter((provider) => !collapsedProviders[provider.id]),
    [collapsedProviders, openProviders],
  );
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

  React.useEffect(() => {
    saveMemos(memos);
  }, [memos]);

  React.useEffect(() => {
    let isMounted = true;

    window.omni
      ?.getWebviewCapturePreloadUrl()
      .then((preloadUrl) => {
        if (isMounted) {
          setWebviewCapturePreloadUrl(preloadUrl);
        }
      })
      .catch((error: unknown) => {
        console.error('[Omni memos] Failed to resolve webview preload URL', error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

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
          getMemoProviderLabel(memo).toLowerCase().includes(searchText) ||
          getSourceHint(memo).toLowerCase().includes(searchText)
        );
      })
      .sort((left, right) => right.createdAt - left.createdAt);
  }, [memoSearch, memos]);

  const pinnedMemos = sortedMemos.filter((memo) => memo.pinned);
  const unpinnedMemos = sortedMemos.filter((memo) => !memo.pinned);
  const selectedMemo = selectedMemoId ? (memos.find((memo) => memo.id === selectedMemoId) ?? null) : null;

  const updateProviderNavigationState = React.useCallback((providerId: ProviderId) => {
    const webview = webviewRefs.current[providerId];

    if (!webview || !webview.isConnected || !webviewReadyRef.current[providerId]) {
      setNavigationStates((current) => ({
        ...current,
        [providerId]: {
          canGoBack: false,
          canGoForward: false,
          isDomReady: Boolean(webviewReadyRef.current[providerId]),
        },
      }));
      return;
    }

    try {
      const canGoBack = Boolean(webview.canGoBack?.());
      const canGoForward = Boolean(webview.canGoForward?.());

      setNavigationStates((current) => ({
        ...current,
        [providerId]: {
          canGoBack,
          canGoForward,
          isDomReady: true,
        },
      }));
    } catch (error) {
      console.warn('Failed to read webview navigation state', providerId, error);
      setNavigationStates((current) => ({
        ...current,
        [providerId]: {
          canGoBack: false,
          canGoForward: false,
          isDomReady: Boolean(webviewReadyRef.current[providerId]),
        },
      }));
    }
  }, []);

  const clearProviderNavigationState = React.useCallback((providerId: ProviderId) => {
    setNavigationStates((current) => {
      const next = { ...current };
      delete next[providerId];
      return next;
    });
  }, []);

  const attachNavigationTracker = React.useCallback(
    (providerId: ProviderId) => (webview: TrackedProviderWebview | null) => {
      if (!webview) {
        delete webviewRefs.current[providerId];
        delete webviewReadyRef.current[providerId];
        return;
      }

      webviewRefs.current[providerId] = webview;

      if (webview.dataset.omniTrackedProvider !== providerId) {
        webview.addEventListener('dom-ready', () => {
          webviewReadyRef.current[providerId] = true;
          updateProviderNavigationState(providerId);
        });

        const saveCurrentUrl = (event: WebviewNavigationEvent) => {
          const navigatedUrl = event.url ?? webview.getURL?.();

          if (navigatedUrl) {
            saveProviderUrl(providerId, navigatedUrl);
          }

          updateProviderNavigationState(providerId);
        };

        webview.addEventListener('did-navigate', saveCurrentUrl);
        webview.addEventListener('did-navigate-in-page', saveCurrentUrl);
        webview.addEventListener('did-finish-load', () => updateProviderNavigationState(providerId));
        webview.addEventListener('did-fail-load', (event: WebviewNavigationEvent) => {
          if (event.isMainFrame === false || event.errorCode === -3) {
            return;
          }

          updateProviderNavigationState(providerId);
          setNavigationNotice(LOAD_FAILURE_MESSAGE);
        });
        webview.dataset.omniTrackedProvider = providerId;
      }

      if (providerId !== 'gemini' && webview.dataset.omniMemoProvider !== providerId) {
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
        });
        webview.dataset.omniMemoProvider = providerId;
      }
    },
    [updateProviderNavigationState],
  );

  const getProviderWebviewRef = React.useCallback(
    (providerId: ProviderId) => {
      webviewRefCallbacks.current[providerId] ??= attachNavigationTracker(providerId);
      return webviewRefCallbacks.current[providerId];
    },
    [attachNavigationTracker],
  );

  const handleBroadcastSubmit = React.useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();

      if (!broadcastText.trim()) {
        return;
      }

      const messageText = broadcastText;

      setBroadcastStatuses((currentStatuses) => {
        const nextStatuses = { ...currentStatuses };
        broadcastProviders.forEach((provider) => {
          nextStatuses[provider.id] = { state: 'pending', message: 'Sending...' };
        });
        return nextStatuses;
      });

      const settledResults = await Promise.allSettled(
        broadcastProviders.map(async (provider): Promise<SendResult> => {
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
        const provider = broadcastProviders[index];

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
    [broadcastProviders, broadcastStatuses, broadcastText],
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
        title: '',
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
    setSelectedMemoId(memo.id);
    setEditingMemoId(memo.id);
    setEditingTitle(memo.title);
    setEditingContent(memo.content);
  }, []);

  const openMemoDetail = React.useCallback((memo: Memo) => {
    setSelectedMemoId(memo.id);
    setEditingMemoId(null);
    setEditingTitle(memo.title);
    setEditingContent(memo.content);
  }, []);

  const closeMemoDetail = React.useCallback(() => {
    setSelectedMemoId(null);
    setEditingMemoId(null);
    setEditingTitle('');
    setEditingContent('');
  }, []);

  const saveEditedMemo = React.useCallback(() => {
    if (!editingMemoId) {
      return;
    }

    const title = editingTitle.trim();
    const content = editingContent.trim();

    if (!content) {
      return;
    }

    updateMemo(editingMemoId, (memo) => ({
      ...memo,
      title,
      content,
      updatedAt: Date.now(),
    }));
    setEditingMemoId(null);
  }, [editingContent, editingMemoId, editingTitle, updateMemo]);

  const deleteMemo = React.useCallback((memoId: string) => {
    if (!window.confirm('이 메모를 삭제할까요?')) {
      return;
    }

    setMemos((currentMemos) => currentMemos.filter((memo) => memo.id !== memoId));
    setSelectedMemoId((currentMemoId) => (currentMemoId === memoId ? null : currentMemoId));
    setEditingMemoId((currentMemoId) => (currentMemoId === memoId ? null : currentMemoId));
  }, []);

  const copyMemo = React.useCallback(async (content: string) => {
    await navigator.clipboard.writeText(content);
  }, []);

  const navigateToMemoSource = React.useCallback((memo: Memo) => {
    if (!isNavigableProvider(memo.provider) || !memo.sourceUrl) {
      return;
    }

    const providerId = memo.provider;

    if (!openProviderIds.includes(providerId)) {
      return;
    }

    setActiveProviderId(providerId);
    setMemoPanelOpen(false);
    setNavigationNotice('');
    closeMemoDetail();
    setCollapsedProviders((current) => ({
      ...current,
      [providerId]: false,
    }));
    webviewRefs.current[providerId]?.loadURL?.(memo.sourceUrl);
  }, [closeMemoDetail, openProviderIds]);

  const duplicateMemo = React.useCallback((memo: Memo, titleValue = memo.title, contentValue = memo.content) => {
    const now = Date.now();
    const title = titleValue.trim() ? `${titleValue.trim()} 복사본` : '';

    setMemos((currentMemos) => [
      {
        ...memo,
        id: crypto.randomUUID(),
        title,
        content: contentValue.trim(),
        createdAt: now,
        updatedAt: now,
      },
      ...currentMemos,
    ]);
  }, []);

  const renderMemoCard = (memo: Memo) => {
    const sourceHint = getSourceHint(memo);

    return (
      <article
        key={memo.id}
        className={`memo-card provider-${memo.provider ?? 'manual'}`}
        tabIndex={0}
        onClick={() => openMemoDetail(memo)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openMemoDetail(memo);
          }
        }}
      >
        <div className="memo-card-meta">
          <span className={`memo-provider ${memo.provider ?? 'manual'}`}>{getMemoProviderLabel(memo)}</span>
        </div>

        <div className="memo-card-body">
          <h4>{getMemoDisplayTitle(memo)}</h4>
          <p className="memo-preview">{memo.content}</p>
        </div>
        <div className="memo-card-footer">
          {sourceHint && <span className="memo-source">{sourceHint}</span>}
          <span>{formatMemoDate(memo.createdAt)}</span>
        </div>

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
          <button className="memo-action-button danger" type="button" title="삭제" onClick={() => deleteMemo(memo.id)}>
            Delete
          </button>
        </div>
      </article>
    );
  };

  const goProviderBack = React.useCallback(
    (providerId: ProviderId) => {
      if (!navigationStates[providerId]?.canGoBack) {
        return;
      }

      webviewRefs.current[providerId]?.goBack?.();
      window.setTimeout(() => updateProviderNavigationState(providerId), 0);
    },
    [navigationStates, updateProviderNavigationState],
  );

  const goProviderForward = React.useCallback(
    (providerId: ProviderId) => {
      if (!navigationStates[providerId]?.canGoForward) {
        return;
      }

      webviewRefs.current[providerId]?.goForward?.();
      window.setTimeout(() => updateProviderNavigationState(providerId), 0);
    },
    [navigationStates, updateProviderNavigationState],
  );

  const reloadProvider = React.useCallback((providerId: ProviderId) => {
    webviewRefs.current[providerId]?.reload?.();
  }, []);

  const startProviderNewChat = React.useCallback((providerId: ProviderId) => {
    webviewRefs.current[providerId]?.loadURL?.(providerAdapters[providerId].newChatUrl);
  }, []);

  const closeProviderSlot = React.useCallback((providerId: ProviderId) => {
    delete webviewRefs.current[providerId];
    delete webviewReadyRef.current[providerId];
    delete webviewRefCallbacks.current[providerId];
    setOpenProviderIds((currentProviderIds) => {
      const nextProviderIds = currentProviderIds.filter((currentProviderId) => currentProviderId !== providerId);

      if (activeProviderId === providerId) {
        const nextActiveProviderId = nextProviderIds[0] ?? null;

        if (nextActiveProviderId) {
          setActiveProviderId(nextActiveProviderId);
        } else {
          setMemoPanelOpen(true);
        }
      }

      return nextProviderIds;
    });
    setCollapsedProviders((current) => ({
      ...current,
      [providerId]: false,
    }));
    clearProviderNavigationState(providerId);
  }, [activeProviderId, clearProviderNavigationState]);

  const toggleProviderCollapsed = React.useCallback((providerId: ProviderId) => {
    setCollapsedProviders((current) => {
      if (current[providerId]) {
        setActiveProviderId(providerId);
        return {
          ...current,
          [providerId]: false,
        };
      }

      const otherProviderId = openProviderIds.find((currentProviderId) => currentProviderId !== providerId);

      if (!otherProviderId || current[otherProviderId]) {
        return current;
      }

      setActiveProviderId(otherProviderId);
      return {
        ...current,
        [providerId]: true,
      };
    });
  }, [openProviderIds]);

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
          {openProviders.map((provider) => (
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
            onClick={() => setMemoPanelOpen(true)}
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
          <div className="topbar-tabs" role="tablist" aria-label="Workspace tabs">
            {openProviders.map((provider) => (
              <button
                key={provider.id}
                className={`topbar-tab ${!memoPanelOpen && provider.id === activeProviderId ? 'active' : ''}`}
                type="button"
                role="tab"
                aria-selected={!memoPanelOpen && provider.id === activeProviderId}
                onClick={() => handleWorkspaceSelect(provider.id)}
              >
                {provider.label}
              </button>
            ))}
            <button
              className={`topbar-tab ${memoPanelOpen ? 'active' : ''}`}
              type="button"
              role="tab"
              aria-selected={memoPanelOpen}
              onClick={() => setMemoPanelOpen(true)}
            >
              Memos
            </button>
          </div>
          <div className="session-hint">Persistent session: {activeProvider.partition}</div>
        </header>

        {navigationNotice && (
          <div className="memo-notice" role="status">
            <span>{navigationNotice}</span>
            <button type="button" onClick={() => setNavigationNotice('')}>
              닫기
            </button>
          </div>
        )}

        <section
          className={`webview-panel ${memoPanelOpen ? 'view-hidden' : ''}`}
          aria-label="Claude, ChatGPT, and Gemini webviews"
          aria-hidden={memoPanelOpen}
        >
          {webviewCapturePreloadUrl ? openProviders.map((provider) => {
            const isCollapsed = collapsedProviders[provider.id];
            const canCollapse =
              !isCollapsed && openProviders.some((other) => other.id !== provider.id && !collapsedProviders[other.id]);
            const navigationState = navigationStates[provider.id] ?? {
              canGoBack: false,
              canGoForward: false,
              isDomReady: false,
            };

            return (
              <div key={provider.id} className={`provider-pane ${isCollapsed ? 'collapsed' : 'expanded'}`}>
                <SlotHeader
                  providerId={provider.id}
                  label={provider.label}
                  isCollapsed={isCollapsed}
                  canCollapse={canCollapse}
                  canGoBack={navigationState.canGoBack}
                  canGoForward={navigationState.canGoForward}
                  onBack={() => goProviderBack(provider.id)}
                  onForward={() => goProviderForward(provider.id)}
                  onReload={() => reloadProvider(provider.id)}
                  onHome={() => startProviderNewChat(provider.id)}
                  onToggleCollapse={() => toggleProviderCollapsed(provider.id)}
                  onClose={() => closeProviderSlot(provider.id)}
                />
                <webview
                  className="provider-webview"
                  src={initialProviderUrls[provider.id]}
                  partition={provider.partition}
                  preload={webviewCapturePreloadUrl?.startsWith('file:') ? webviewCapturePreloadUrl : undefined}
                  allowpopups={'true' as unknown as boolean}
                  ref={getProviderWebviewRef(provider.id)}
                />
              </div>
            );
          }) : <div className="webview-loading">Preparing workspace...</div>}
        </section>

        <form
          className={`broadcast-bar ${broadcastCollapsed ? 'collapsed' : ''} ${memoPanelOpen ? 'view-hidden' : ''}`}
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
                placeholder="모든모델에게 메세지 보내기"
                onChange={(event) => setBroadcastText(event.target.value)}
                onKeyDown={handleBroadcastKeyDown}
              />
              <button className="broadcast-button" type="submit" disabled={!broadcastText.trim()}>
                Send
              </button>
            </>
          )}
        </form>

        <section className={`memos-page ${memoPanelOpen ? '' : 'view-hidden'}`} aria-label="Memos">
          <div className="memos-page-inner">
            <div className="memos-page-header">
              <div>
                <h1>Memos</h1>
                <p>채팅에서 저장한 메모와 직접 작성한 메모를 한곳에서 관리합니다.</p>
              </div>
              <input
                className="memo-search"
                value={memoSearch}
                placeholder="Search title, content, provider, source"
                onChange={(event) => setMemoSearch(event.target.value)}
              />
            </div>

            <div className="manual-memo-composer">
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
            </div>

            <div className="memo-section">
              <h3>고정됨</h3>
              {pinnedMemos.length > 0 ? (
                <div className="memo-grid">{pinnedMemos.map(renderMemoCard)}</div>
              ) : (
                <p className="memo-empty">고정된 메모가 없습니다.</p>
              )}
            </div>

            <div className="memo-section">
              <h3>메모</h3>
              {unpinnedMemos.length > 0 ? (
                <div className="memo-grid">{unpinnedMemos.map(renderMemoCard)}</div>
              ) : (
                <p className="memo-empty">저장된 메모가 없습니다.</p>
              )}
            </div>
          </div>
        </section>

        {selectedMemo && (
          <div className="memo-modal-backdrop" role="presentation" onMouseDown={closeMemoDetail}>
            <section
              className={`memo-modal provider-${selectedMemo.provider ?? 'manual'}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="memo-modal-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header className="memo-modal-header">
                <div className="memo-modal-title-group">
                  <span className={`memo-provider ${selectedMemo.provider ?? 'manual'}`}>{getMemoProviderLabel(selectedMemo)}</span>
                  {editingMemoId === selectedMemo.id ? (
                    <input
                      className="memo-title-input"
                      value={editingTitle}
                      placeholder="제목"
                      onChange={(event) => setEditingTitle(event.target.value)}
                    />
                  ) : (
                    <h2
                      id="memo-modal-title"
                      className="memo-editable-title"
                      tabIndex={0}
                      title="Click to edit"
                      onClick={() => startEditingMemo(selectedMemo)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          startEditingMemo(selectedMemo);
                        }
                      }}
                    >
                      {getMemoDisplayTitle(selectedMemo)}
                    </h2>
                  )}
                </div>
                <button className="memo-modal-close" type="button" aria-label="닫기" onClick={closeMemoDetail}>
                  x
                </button>
              </header>

              <div className="memo-modal-body">
                {editingMemoId === selectedMemo.id ? (
                  <textarea
                    className="memo-modal-content-input"
                    value={editingContent}
                    rows={12}
                    onChange={(event) => setEditingContent(event.target.value)}
                  />
                ) : (
                  <p
                    className="memo-modal-content memo-editable-content"
                    tabIndex={0}
                    title="Click to edit"
                    onClick={() => startEditingMemo(selectedMemo)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        startEditingMemo(selectedMemo);
                      }
                    }}
                  >
                    {selectedMemo.content}
                  </p>
                )}
                {getSourceHint(selectedMemo) && <div className="memo-modal-source">{getSourceHint(selectedMemo)}</div>}
              </div>

              <footer className="memo-modal-footer">
                <div className="memo-modal-dates">
                  <span>생성: {formatMemoDate(selectedMemo.createdAt)}</span>
                  <span>수정: {formatMemoDate(selectedMemo.updatedAt)}</span>
                </div>
                <div className="memo-modal-actions">
                  <button
                    className="memo-action-button"
                    type="button"
                    onClick={() =>
                      updateMemo(selectedMemo.id, (currentMemo) => ({
                        ...currentMemo,
                        pinned: !currentMemo.pinned,
                        updatedAt: Date.now(),
                      }))
                    }
                  >
                    {selectedMemo.pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button className="memo-action-button" type="button" onClick={() => void copyMemo(selectedMemo.content)}>
                    Copy
                  </button>
                  {editingMemoId === selectedMemo.id ? (
                    <>
                      <button className="memo-action-button primary" type="button" onClick={saveEditedMemo}>
                        저장
                      </button>
                      <button className="memo-action-button" type="button" onClick={() => setEditingMemoId(null)}>
                        취소
                      </button>
                    </>
                  ) : null}
                  <button
                    className="memo-action-button"
                    type="button"
                    onClick={() =>
                      duplicateMemo(
                        selectedMemo,
                        editingMemoId === selectedMemo.id ? editingTitle : selectedMemo.title,
                        editingMemoId === selectedMemo.id ? editingContent : selectedMemo.content,
                      )
                    }
                  >
                    다른 이름으로 저장
                  </button>
                  {isNavigableProvider(selectedMemo.provider) && selectedMemo.sourceUrl && (
                    <button className="memo-action-button primary" type="button" onClick={() => navigateToMemoSource(selectedMemo)}>
                      채팅방으로 이동
                    </button>
                  )}
                  <button className="memo-action-button danger" type="button" onClick={() => deleteMemo(selectedMemo.id)}>
                    Delete
                  </button>
                </div>
              </footer>
            </section>
          </div>
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
