import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import { ProviderIcon } from './ProviderIcon';
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
    omniTrackedSlot?: string;
    omniMemoSlot?: string;
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

type Slot = {
  id: string;
  providerId: ProviderId;
  currentUrl: string;
  title: string;
};

type LayoutMode = 'row' | 'grid2x2';

const MAX_SLOTS = 8;
const MAX_STAGE_SLOTS = 4;

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

function getProviderConfig(providerId: ProviderId) {
  return PROVIDERS.find((provider) => provider.id === providerId) ?? PROVIDERS[0];
}

function createInitialSlot(providerId: ProviderId): Slot {
  const provider = getProviderConfig(providerId);

  return {
    id: providerId,
    providerId,
    currentUrl: getInitialProviderUrl({ id: provider.id, defaultUrl: provider.defaultUrl }),
    title: provider.label,
  };
}

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
  const [activeSlotId, setActiveSlotId] = React.useState<string>('claude');
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
  const [slots, setSlots] = React.useState<Slot[]>(() => PROVIDERS.map((provider) => createInitialSlot(provider.id)));
  const [stageIds, setStageIds] = React.useState<string[]>(() => PROVIDERS.map((provider) => provider.id));
  const [dockIds, setDockIds] = React.useState<string[]>([]);
  const [layoutMode, setLayoutMode] = React.useState<LayoutMode>('row');
  const [dockMinimized, setDockMinimized] = React.useState(false);
  const [navigationStates, setNavigationStates] = React.useState<Partial<Record<string, NavigationState>>>({
    claude: { canGoBack: false, canGoForward: false, isDomReady: false },
    chatgpt: { canGoBack: false, canGoForward: false, isDomReady: false },
    gemini: { canGoBack: false, canGoForward: false, isDomReady: false },
  });
  const [broadcastCollapsed, setBroadcastCollapsed] = React.useState(false);
  const [broadcastText, setBroadcastText] = React.useState('');
  const [broadcastStatuses, setBroadcastStatuses] = React.useState<Record<string, BroadcastStatus>>({
    claude: { state: 'idle', message: 'Ready' },
    chatgpt: { state: 'idle', message: 'Ready' },
    gemini: { state: 'idle', message: 'Ready' },
  });
  const webviewRefs = React.useRef<Partial<Record<string, ProviderWebview>>>({});
  const webviewReadyRef = React.useRef<Partial<Record<string, boolean>>>({});
  const webviewRefCallbacks = React.useRef<Partial<Record<string, (webview: TrackedProviderWebview | null) => void>>>({});
  const draggedIdRef = React.useRef<string | null>(null);
  const slotsById = React.useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots]);
  const stageSlots = React.useMemo(() => stageIds.map((slotId) => slotsById.get(slotId)).filter(Boolean) as Slot[], [slotsById, stageIds]);
  const dockSlots = React.useMemo(() => dockIds.map((slotId) => slotsById.get(slotId)).filter(Boolean) as Slot[], [dockIds, slotsById]);
  const activeSlot = slotsById.get(activeSlotId) ?? stageSlots[0] ?? slots[0] ?? null;
  const activeProvider = activeSlot ? getProviderConfig(activeSlot.providerId) : PROVIDERS[0];
  const isStageGrid = stageIds.length === MAX_STAGE_SLOTS && layoutMode === 'grid2x2';
  const stageGridStyle = React.useMemo<React.CSSProperties>(
    () => ({
      gridTemplateColumns: isStageGrid ? 'repeat(2, minmax(0, 1fr))' : `repeat(${Math.max(stageIds.length, 1)}, minmax(0, 1fr))`,
    }),
    [isStageGrid, stageIds.length],
  );

  React.useEffect(() => {
    saveMemos(memos);
  }, [memos]);

  React.useEffect(() => {
    if (stageIds.length > 0 || dockIds.length === 0) {
      return;
    }

    const [nextStageSlotId, ...remainingDockIds] = dockIds;
    setStageIds([nextStageSlotId]);
    setDockIds(remainingDockIds);
    setActiveSlotId(nextStageSlotId);
  }, [dockIds, stageIds.length]);

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

  const updateSlotNavigationState = React.useCallback((slotId: string) => {
    const webview = webviewRefs.current[slotId];

    if (!webview || !webview.isConnected || !webviewReadyRef.current[slotId]) {
      setNavigationStates((current) => ({
        ...current,
        [slotId]: {
          canGoBack: false,
          canGoForward: false,
          isDomReady: Boolean(webviewReadyRef.current[slotId]),
        },
      }));
      return;
    }

    try {
      const canGoBack = Boolean(webview.canGoBack?.());
      const canGoForward = Boolean(webview.canGoForward?.());

      setNavigationStates((current) => ({
        ...current,
        [slotId]: {
          canGoBack,
          canGoForward,
          isDomReady: true,
        },
      }));
    } catch (error) {
      console.warn('Failed to read webview navigation state', slotId, error);
      setNavigationStates((current) => ({
        ...current,
        [slotId]: {
          canGoBack: false,
          canGoForward: false,
          isDomReady: Boolean(webviewReadyRef.current[slotId]),
        },
      }));
    }
  }, []);

  const clearSlotNavigationState = React.useCallback((slotId: string) => {
    setNavigationStates((current) => {
      const next = { ...current };
      delete next[slotId];
      return next;
    });
  }, []);

  const attachNavigationTracker = React.useCallback(
    (slot: Slot) => (webview: TrackedProviderWebview | null) => {
      const { id: slotId, providerId } = slot;

      if (!webview) {
        delete webviewRefs.current[slotId];
        delete webviewReadyRef.current[slotId];
        return;
      }

      webviewRefs.current[slotId] = webview;

      if (webview.dataset.omniTrackedSlot !== slotId) {
        webview.addEventListener('dom-ready', () => {
          webviewReadyRef.current[slotId] = true;
          updateSlotNavigationState(slotId);
        });

        const saveCurrentUrl = (event: WebviewNavigationEvent) => {
          const navigatedUrl = event.url ?? webview.getURL?.();

          if (navigatedUrl) {
            saveProviderUrl(providerId, navigatedUrl);
            setSlots((currentSlots) =>
              currentSlots.map((currentSlot) => (currentSlot.id === slotId ? { ...currentSlot, currentUrl: navigatedUrl } : currentSlot)),
            );
          }

          updateSlotNavigationState(slotId);
        };

        webview.addEventListener('did-navigate', saveCurrentUrl);
        webview.addEventListener('did-navigate-in-page', saveCurrentUrl);
        webview.addEventListener('did-finish-load', () => updateSlotNavigationState(slotId));
        webview.addEventListener('page-title-updated', (event: Event & { title?: string }) => {
          const title = typeof event.title === 'string' && event.title.trim() ? event.title.trim() : getProviderConfig(providerId).label;
          setSlots((currentSlots) =>
            currentSlots.map((currentSlot) => (currentSlot.id === slotId ? { ...currentSlot, title } : currentSlot)),
          );
        });
        webview.addEventListener('did-fail-load', (event: WebviewNavigationEvent) => {
          if (event.isMainFrame === false || event.errorCode === -3) {
            return;
          }

          updateSlotNavigationState(slotId);
          setNavigationNotice(LOAD_FAILURE_MESSAGE);
        });
        webview.dataset.omniTrackedSlot = slotId;
      }

      if (webview.dataset.omniMemoSlot !== slotId) {
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
        webview.dataset.omniMemoSlot = slotId;
      }
    },
    [updateSlotNavigationState],
  );

  const getSlotWebviewRef = React.useCallback(
    (slot: Slot) => {
      webviewRefCallbacks.current[slot.id] ??= attachNavigationTracker(slot);
      return webviewRefCallbacks.current[slot.id];
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
        stageSlots.forEach((slot) => {
          nextStatuses[slot.id] = { state: 'pending', message: 'Sending...' };
        });
        return nextStatuses;
      });

      const settledResults = await Promise.allSettled(
        stageSlots.map(async (slot): Promise<SendResult> => {
          const provider = getProviderConfig(slot.providerId);
          const webview = webviewRefs.current[slot.id];

          if (!webview) {
            console.warn('[Omni broadcast]', provider.label, 'webview ref missing');
            return {
              ok: false,
              providerId: slot.providerId,
              message: 'webview not ready',
            };
          }

          return providerAdapters[slot.providerId].sendMessage(webview, messageText);
        }),
      );

      const nextStatuses = { ...broadcastStatuses };

      settledResults.forEach((result, index) => {
        const slot = stageSlots[index];
        const provider = getProviderConfig(slot.providerId);

        if (result.status === 'rejected') {
          const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
          console.error('[Omni broadcast]', provider.label, reason);
          nextStatuses[slot.id] = { state: 'failed', message: reason };
          return;
        }

        nextStatuses[slot.id] = {
          state: result.value.ok ? 'sent' : 'failed',
          message: result.value.message,
        };
      });

      setBroadcastStatuses(nextStatuses);
      setBroadcastText('');
    },
    [broadcastStatuses, broadcastText, stageSlots],
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

  const moveSlotToPosition = React.useCallback(
    (id: string, destArrName: 'stage' | 'dock', targetId: string | null, side: 'before' | 'after' | null) => {
      if (!slotsById.has(id)) {
        return;
      }

      if (targetId === id) {
        return;
      }

      const stageWithoutDragged = stageIds.filter((slotId) => slotId !== id);
      const dockWithoutDragged = dockIds.filter((slotId) => slotId !== id);
      const destArr = destArrName === 'stage' ? [...stageWithoutDragged] : [...dockWithoutDragged];
      const targetIndex = targetId ? destArr.indexOf(targetId) : -1;
      const insertIdx = targetIndex >= 0 ? targetIndex + (side === 'after' ? 1 : 0) : destArr.length;

      destArr.splice(insertIdx, 0, id);

      let nextStageIds = destArrName === 'stage' ? destArr : stageWithoutDragged;
      let nextDockIds = destArrName === 'dock' ? destArr : dockWithoutDragged;

      if (destArrName === 'stage' && nextStageIds.length > MAX_STAGE_SLOTS) {
        let evictionIndex = nextStageIds.length - 1;

        if (evictionIndex === insertIdx) {
          evictionIndex = nextStageIds.length - 2;
        }

        const [evictedSlotId] = nextStageIds.splice(evictionIndex, 1);

        if (evictedSlotId) {
          nextDockIds = [...nextDockIds, evictedSlotId];
        }
      }

      setStageIds(nextStageIds);
      setDockIds(nextDockIds);

      if (destArrName === 'stage') {
        setActiveSlotId(id);
        setMemoPanelOpen(false);
      } else if (activeSlotId === id) {
        setActiveSlotId(nextStageIds[0] ?? nextDockIds[0] ?? id);
      }
    },
    [activeSlotId, dockIds, slotsById, stageIds],
  );

  const getDropSide = React.useCallback((event: React.DragEvent<HTMLElement>): 'before' | 'after' => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
  }, []);

  const handleSlotDragStart = React.useCallback((slotId: string, event: React.DragEvent<HTMLElement>) => {
    draggedIdRef.current = slotId;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', slotId);
  }, []);

  const handleSlotDragEnd = React.useCallback(() => {
    draggedIdRef.current = null;
  }, []);

  const handleSlotDragOver = React.useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleSlotDrop = React.useCallback(
    (destArrName: 'stage' | 'dock', targetId: string, event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const draggedId = draggedIdRef.current || event.dataTransfer.getData('text/plain');

      if (!draggedId) {
        return;
      }

      moveSlotToPosition(draggedId, destArrName, targetId, getDropSide(event));
      draggedIdRef.current = null;
    },
    [getDropSide, moveSlotToPosition],
  );

  const handleContainerDragOver = React.useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleContainerDrop = React.useCallback(
    (destArrName: 'stage' | 'dock', event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const draggedId = draggedIdRef.current || event.dataTransfer.getData('text/plain');

      if (!draggedId) {
        return;
      }

      moveSlotToPosition(draggedId, destArrName, null, null);
      draggedIdRef.current = null;
    },
    [moveSlotToPosition],
  );

  const moveSlotToStage = React.useCallback((slotId: string) => {
    setMemoPanelOpen(false);
    setActiveSlotId(slotId);

    if (stageIds.includes(slotId)) {
      return;
    }

    moveSlotToPosition(slotId, 'stage', null, null);
  }, [moveSlotToPosition, stageIds]);

  const handleWorkspaceSelect = React.useCallback((slotId: string) => {
    if (dockIds.includes(slotId)) {
      moveSlotToStage(slotId);
      return;
    }

    setActiveSlotId(slotId);
    setMemoPanelOpen(false);
  }, [dockIds, moveSlotToStage]);

  const moveSlotToDock = React.useCallback((slotId: string) => {
    if (stageIds.length <= 1) {
      return;
    }

    moveSlotToPosition(slotId, 'dock', null, null);
    setActiveSlotId((currentActiveSlotId) => {
      if (currentActiveSlotId !== slotId) {
        return currentActiveSlotId;
      }

      const nextStageSlotId = stageIds.find((currentSlotId) => currentSlotId !== slotId);
      return nextStageSlotId ?? dockIds[0] ?? currentActiveSlotId;
    });
  }, [dockIds, moveSlotToPosition, stageIds]);

  const closeSlot = React.useCallback((slotId: string) => {
    delete webviewRefs.current[slotId];
    delete webviewReadyRef.current[slotId];
    delete webviewRefCallbacks.current[slotId];

    setSlots((currentSlots) => currentSlots.filter((slot) => slot.id !== slotId));
    setStageIds((currentStageIds) => currentStageIds.filter((currentSlotId) => currentSlotId !== slotId));
    setDockIds((currentDockIds) => currentDockIds.filter((currentSlotId) => currentSlotId !== slotId));
    setBroadcastStatuses((currentStatuses) => {
      const nextStatuses = { ...currentStatuses };
      delete nextStatuses[slotId];
      return nextStatuses;
    });
    clearSlotNavigationState(slotId);
    setActiveSlotId((currentActiveSlotId) => {
      if (currentActiveSlotId !== slotId) {
        return currentActiveSlotId;
      }

      const nextSlot = slots.find((slot) => slot.id !== slotId);
      return nextSlot?.id ?? '';
    });
  }, [clearSlotNavigationState, slots]);

  const handleAddSlot = React.useCallback(() => {
    // TODO: Open model selection modal and create a new slot.
    console.log('[Omni slots] add slot placeholder');
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

    const sourceSlot = slots.find((slot) => slot.providerId === memo.provider);

    if (!sourceSlot) {
      return;
    }

    if (dockIds.includes(sourceSlot.id)) {
      moveSlotToStage(sourceSlot.id);
    }

    setActiveSlotId(sourceSlot.id);
    setMemoPanelOpen(false);
    setNavigationNotice('');
    closeMemoDetail();
    webviewRefs.current[sourceSlot.id]?.loadURL?.(memo.sourceUrl);
  }, [closeMemoDetail, dockIds, moveSlotToStage, slots]);

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
    const providerLabel = getMemoProviderLabel(memo);

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
          <span className={`memo-provider ${memo.provider ?? 'manual'}`}>
            {memo.provider && <ProviderIcon providerId={memo.provider} label={providerLabel} className="memo-provider-icon" />}
            {providerLabel}
          </span>
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
          <button className="memo-action-button danger" type="button" title="??젣" onClick={() => deleteMemo(memo.id)}>
            Delete
          </button>
        </div>
      </article>
    );
  };

  const goSlotBack = React.useCallback(
    (slotId: string) => {
      if (!navigationStates[slotId]?.canGoBack) {
        return;
      }

      webviewRefs.current[slotId]?.goBack?.();
      window.setTimeout(() => updateSlotNavigationState(slotId), 0);
    },
    [navigationStates, updateSlotNavigationState],
  );

  const goSlotForward = React.useCallback(
    (slotId: string) => {
      if (!navigationStates[slotId]?.canGoForward) {
        return;
      }

      webviewRefs.current[slotId]?.goForward?.();
      window.setTimeout(() => updateSlotNavigationState(slotId), 0);
    },
    [navigationStates, updateSlotNavigationState],
  );

  const reloadSlot = React.useCallback((slotId: string) => {
    webviewRefs.current[slotId]?.reload?.();
  }, []);

  const startSlotNewChat = React.useCallback((slot: Slot) => {
    webviewRefs.current[slot.id]?.loadURL?.(providerAdapters[slot.providerId].newChatUrl);
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
          {slots.map((slot) => {
            const provider = getProviderConfig(slot.providerId);

            return (
            <button
              key={slot.id}
              className={`workspace-item ${!memoPanelOpen && slot.id === activeSlotId ? 'active' : ''}`}
              type="button"
              title={provider.label}
              onClick={() => handleWorkspaceSelect(slot.id)}
            >
              <ProviderIcon providerId={provider.id} label={provider.label} className="workspace-icon" />
              <span className="workspace-label">{provider.label}</span>
            </button>
            );
          })}
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
            {slots.map((slot) => {
              const provider = getProviderConfig(slot.providerId);

              return (
              <button
                key={slot.id}
                className={`topbar-tab ${!memoPanelOpen && slot.id === activeSlotId ? 'active' : ''}`}
                type="button"
                role="tab"
                aria-selected={!memoPanelOpen && slot.id === activeSlotId}
                onClick={() => handleWorkspaceSelect(slot.id)}
              >
                <ProviderIcon providerId={provider.id} label={provider.label} />
                {provider.label}
              </button>
              );
            })}
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
          {webviewCapturePreloadUrl ? (
            <>
              <div className="stage-header">
                <div className="stage-title">Stage</div>
                {stageIds.length === MAX_STAGE_SLOTS && (
                  <button
                    className="stage-layout-toggle"
                    type="button"
                    title={layoutMode === 'row' ? 'Switch to 2x2 grid' : 'Switch to row'}
                    aria-label={layoutMode === 'row' ? 'Switch to 2x2 grid' : 'Switch to row'}
                    onClick={() => setLayoutMode((currentMode) => (currentMode === 'row' ? 'grid2x2' : 'row'))}
                  >
                    {layoutMode === 'row' ? '▦' : '▤'}
                  </button>
                )}
              </div>
              <div
                className={`stage-grid ${isStageGrid ? 'grid2x2' : 'row'}`}
                style={stageGridStyle}
                onDragOver={handleContainerDragOver}
                onDrop={(event) => handleContainerDrop('stage', event)}
              >
                {stageIds.length === 0 && <div className="stage-empty">Open a docked slot to start.</div>}
                {slots.map((slot) => {
                  const provider = getProviderConfig(slot.providerId);
                  const stageIndex = stageIds.indexOf(slot.id);
                  const isInStage = stageIndex >= 0;
                  const navigationState = navigationStates[slot.id] ?? {
                    canGoBack: false,
                    canGoForward: false,
                    isDomReady: false,
                  };

                  return (
                    <div
                      key={slot.id}
                      className="provider-pane expanded"
                      draggable={isInStage}
                      onDragStart={(event) => handleSlotDragStart(slot.id, event)}
                      onDragEnd={handleSlotDragEnd}
                      onDragOver={handleSlotDragOver}
                      onDrop={(event) => handleSlotDrop('stage', slot.id, event)}
                      style={{ display: isInStage ? undefined : 'none', order: isInStage ? stageIndex : undefined }}
                    >
                      <SlotHeader
                        providerId={slot.providerId}
                        label={provider.label}
                        canDock={stageIds.length > 1}
                        canGoBack={navigationState.canGoBack}
                        canGoForward={navigationState.canGoForward}
                        onBack={() => goSlotBack(slot.id)}
                        onForward={() => goSlotForward(slot.id)}
                        onReload={() => reloadSlot(slot.id)}
                        onHome={() => startSlotNewChat(slot)}
                        onDock={() => moveSlotToDock(slot.id)}
                        onClose={() => closeSlot(slot.id)}
                      />
                      <webview
                        className="provider-webview"
                        src={slot.currentUrl}
                        partition={provider.partition}
                        preload={webviewCapturePreloadUrl?.startsWith('file:') ? webviewCapturePreloadUrl : undefined}
                        allowpopups={'true' as unknown as boolean}
                        ref={getSlotWebviewRef(slot)}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="webview-loading">Preparing workspace...</div>
          )}
        </section>

        <div className={`workspace-bottom ${memoPanelOpen ? 'view-hidden' : ''}`}>
          <div className="dock-row">
            {broadcastCollapsed && (
              <button
                className="broadcast-toggle dock-broadcast-toggle"
                type="button"
                aria-label="Expand broadcast bar"
                onClick={() => setBroadcastCollapsed(false)}
              >
                ^
              </button>
            )}
            <section
              className={`dock ${dockMinimized ? 'minimized' : ''}`}
              aria-label="Dock"
              onDragOver={handleContainerDragOver}
              onDrop={(event) => handleContainerDrop('dock', event)}
            >
            <div className="dock-header">
              <div className="dock-title-row">
                <button
                  className="dock-toggle"
                  type="button"
                  title={dockMinimized ? 'Expand dock' : 'Minimize dock'}
                  aria-label={dockMinimized ? 'Expand dock' : 'Minimize dock'}
                  onClick={() => setDockMinimized((minimized) => !minimized)}
                >
                  {dockMinimized ? '^' : 'v'}
                </button>
                <span className="dock-title">Dock</span>
                <span className="slot-counter">{slots.length}/{MAX_SLOTS}</span>
              </div>
            </div>
            <div className="dock-list">
              {dockSlots.map((slot) => {
                const provider = getProviderConfig(slot.providerId);

                return (
                  <div
                    key={slot.id}
                    className="dock-chip"
                    role="button"
                    tabIndex={0}
                    draggable
                    title={`${provider.label} - ${slot.title}`}
                    onDragStart={(event) => handleSlotDragStart(slot.id, event)}
                    onDragEnd={handleSlotDragEnd}
                    onDragOver={handleSlotDragOver}
                    onDrop={(event) => handleSlotDrop('dock', slot.id, event)}
                    onClick={() => moveSlotToStage(slot.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        moveSlotToStage(slot.id);
                      }
                    }}
                  >
                    <ProviderIcon providerId={slot.providerId} label={provider.label} />
                    {!dockMinimized && (
                      <span className="dock-chip-text">
                        <span className="dock-chip-provider">{provider.label}</span>
                        <span className="dock-chip-title">{slot.title}</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {slots.length < MAX_SLOTS && (
              <button className="dock-add-button dock-add-button-end" type="button" title="Add slot" aria-label="Add slot" onClick={handleAddSlot}>
                +
              </button>
            )}
            </section>
          </div>

          {!broadcastCollapsed && (
            <form
              className="broadcast-bar"
              aria-label="Broadcast prompt"
              onSubmit={handleBroadcastSubmit}
            >
              <button
                className="broadcast-toggle"
                type="button"
                aria-label="Collapse broadcast bar"
                onClick={() => setBroadcastCollapsed(true)}
              >
                v
              </button>
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
            </form>
          )}
        </div>

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
                  <span className={`memo-provider ${selectedMemo.provider ?? 'manual'}`}>
                    {selectedMemo.provider && (
                      <ProviderIcon
                        providerId={selectedMemo.provider}
                        label={getMemoProviderLabel(selectedMemo)}
                        className="memo-provider-icon"
                      />
                    )}
                    {getMemoProviderLabel(selectedMemo)}
                  </span>
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
