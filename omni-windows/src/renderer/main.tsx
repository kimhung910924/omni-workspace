import React from 'react';
import { flushSync } from 'react-dom';
import ReactDOM from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import './styles.css';
import { ProviderIcon } from './ProviderIcon';
import { SlotHeader } from './SlotHeader';
import { providerAdapters, type ProviderWebview, type SendResult } from './providerAdapters';
import { getInitialProviderUrl, isRestorableUrl, saveProviderUrl, type ProviderId } from './providerUrlStore';
import { PROVIDER_LABELS } from './providerLabels';
import { createMemo } from './features/memos/memoStore';
import { MemoCard } from './features/memos/MemoCard';
import {
  formatMemoDate,
  getMemoProviderLabel,
  getMemoDisplayTitle,
  isNavigableProvider,
  getSourceHint,
} from './features/memos/memoUtils';
import { memoRepository } from './data/local/localMemoRepository';
import { favoriteRepository } from './data/local/localFavoriteRepository';
import { useEntitlement } from './entitlement/useEntitlement';
import { getCurrentLanguage, initI18n, saveLanguagePreference, type SupportedLanguage } from './i18n';
import { workspaceRepository } from './data/local/localWorkspaceRepository';
import type { Memo } from './features/memos/types';
import { BookmarkBar } from './features/favorites/BookmarkBar';
import { createFavorite, createFavoriteFolder } from './features/favorites/favoriteStore';
import { FavoriteCard } from './features/favorites/FavoriteCard';
import type { Favorite, FavoriteFolder } from './features/favorites/types';
import { isAiSlot, type Group, type ProviderSlot, type Slot, type WebSlot, type WorkspaceRecord } from './types';

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

type GroupTab = {
  id: string;
  title: string;
  kind: 'group';
  group: Group;
};

type WorkspaceTab = {
  id: string;
  title: string;
  kind: 'workspace';
  workspaceId: string;
  group: Group;
};

type Tab = GroupTab | WorkspaceTab;

type SidebarView = 'workspace-panel' | 'prompt-library' | 'favorites-panel' | null;
type DropPosition = { targetId: string | null; side: 'before' | 'after' | null };
type MemoProviderFilter = Memo['provider'];
type StagePointerDrag = {
  id: string;
  startX: number;
  startY: number;
  grabOffsetX: number;
  grabOffsetY: number;
  active: boolean;
};

const MAX_TABS_NOTICE = '상단탭이 꽉 찼습니다. 상단탭 자리 확보 후 다시 시도해주세요.';
const BOOKMARK_BAR_VISIBLE_KEY = 'omni-bookmark-bar-visible';
const DEFAULT_STARTUP_PROVIDER_IDS: ProviderId[] = ['claude', 'chatgpt', 'gemini'];
const MEMO_PROVIDER_FILTER_OPTIONS: Array<{ provider: MemoProviderFilter; label: string }> = [
  { provider: null, label: 'Private' },
  { provider: 'gemini', label: PROVIDER_LABELS.gemini },
  { provider: 'claude', label: PROVIDER_LABELS.claude },
  { provider: 'chatgpt', label: PROVIDER_LABELS.chatgpt },
  { provider: 'perplexity', label: PROVIDER_LABELS.perplexity },
  { provider: 'grok', label: PROVIDER_LABELS.grok },
];
const DEFAULT_MEMO_PROVIDER_FILTERS = MEMO_PROVIDER_FILTER_OPTIONS.map((option) => option.provider);

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
  {
    id: 'grok',
    label: providerAdapters.grok.label,
    defaultUrl: providerAdapters.grok.startUrl,
    partition: window.omni?.grokPartition ?? 'persist:grok',
  },
  {
    id: 'perplexity',
    label: providerAdapters.perplexity.label,
    defaultUrl: providerAdapters.perplexity.startUrl,
    partition: window.omni?.perplexityPartition ?? 'persist:perplexity',
  },
];
const WEB_SLOT_PARTITION = window.omni?.webSlotPartition ?? 'persist:webslot';

function getProviderConfig(providerId: ProviderId) {
  return PROVIDERS.find((provider) => provider.id === providerId) ?? PROVIDERS[0];
}

function createId(): string {
  return crypto.randomUUID();
}

function normalizeWebUrl(input: string): string | null {
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    return null;
  }

  const urlWithProtocol = /^https?:\/\//i.test(trimmedInput) ? trimmedInput : `https://${trimmedInput}`;

  try {
    const parsedUrl = new URL(urlWithProtocol);

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
}

function resolveWebSlotInput(input: string): string | null {
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmedInput)) {
    return normalizeWebUrl(trimmedInput);
  }

  if (/\s/.test(trimmedInput)) {
    return `https://www.google.com/search?q=${encodeURIComponent(trimmedInput)}`;
  }

  const normalizedUrl = normalizeWebUrl(trimmedInput);

  if (normalizedUrl) {
    try {
      if (new URL(normalizedUrl).hostname.includes('.')) {
        return normalizedUrl;
      }
    } catch {
      return `https://www.google.com/search?q=${encodeURIComponent(trimmedInput)}`;
    }
  }

  return `https://www.google.com/search?q=${encodeURIComponent(trimmedInput)}`;
}

function getWebSlotIconUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  } catch {
    return '';
  }
}

function isHttpOrHttpsUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

function createInitialSlot(providerId: ProviderId): ProviderSlot {
  const provider = getProviderConfig(providerId);

  return {
    id: createId(),
    kind: 'ai',
    providerId,
    currentUrl: getInitialProviderUrl({ id: provider.id, defaultUrl: provider.defaultUrl }),
    title: provider.label,
  };
}

function createNewSlot(providerId: ProviderId): ProviderSlot {
  const provider = getProviderConfig(providerId);

  return {
    id: createId(),
    kind: 'ai',
    providerId,
    currentUrl: provider.defaultUrl,
    title: provider.label,
  };
}

function createNewWebSlot(url: string): WebSlot | null {
  const normalizedUrl = normalizeWebUrl(url);

  if (!normalizedUrl) {
    return null;
  }

  return {
    id: createId(),
    kind: 'web',
    currentUrl: normalizedUrl,
    title: new URL(normalizedUrl).hostname,
  };
}

function createGroupTab(group: Group): Tab {
  return {
    id: createId(),
    title: '새그룹',
    kind: 'group',
    group,
  };
}

function createWorkspaceTab(workspace: WorkspaceRecord): Tab {
  return {
    id: createId(),
    title: workspace.name,
    kind: 'workspace',
    workspaceId: workspace.id,
    group: {
      id: createId(),
      slots: workspace.slots.map((slot) => ({ ...slot })),
      stageIds: [...workspace.stageIds],
      dockIds: [...workspace.dockIds],
      layoutMode: workspace.layoutMode,
      dockMinimized: workspace.dockMinimized,
    },
  };
}

function createInitialGroup(): Group {
  const slots = DEFAULT_STARTUP_PROVIDER_IDS.map((providerId) => createInitialSlot(providerId));

  return {
    id: createId(),
    slots,
    stageIds: slots.map((slot) => slot.id),
    dockIds: [],
    layoutMode: 'row',
    dockMinimized: false,
  };
}

function createBlankGroup(): Group {
  const slots = DEFAULT_STARTUP_PROVIDER_IDS.map((providerId) => createNewSlot(providerId));

  return {
    id: createId(),
    slots,
    stageIds: slots.map((slot) => slot.id),
    dockIds: [],
    layoutMode: 'row',
    dockMinimized: false,
  };
}

function createInitialNavigationStates(slots: Slot[]): Partial<Record<string, NavigationState>> {
  return Object.fromEntries(slots.map((slot) => [slot.id, { canGoBack: false, canGoForward: false, isDomReady: false }]));
}

function createInitialBroadcastStatuses(slots: Slot[]): Record<string, BroadcastStatus> {
  return Object.fromEntries(slots.map((slot) => [slot.id, { state: 'idle', message: 'Ready' }]));
}

const LOAD_FAILURE_MESSAGE = '삭제되었거나 접근할 수 없는 대화방입니다. 메모는 그대로 보관됩니다.';

const GEMINI_DEFAULT_TITLES = new Set(['gemini', 'google gemini']);

function isMeaningfulGeminiTitle(value: string): boolean {
  const title = value.trim();

  if (title.length < 2) {
    return false;
  }

  return !GEMINI_DEFAULT_TITLES.has(title.toLowerCase());
}

function createGeminiTitleScript(): string {
  return `
    (() => {
      const rejectPatterns = [
        /^(gemini|google gemini)$/i,
        /^(new chat|recent|settings|help|privacy|terms)$/i,
        /^(새 채팅|최근|설정|도움말|개인정보|약관)$/i,
      ];
      const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const isUsable = (value) => {
        const text = clean(value);
        return text.length >= 2 && text.length <= 80 && !rejectPatterns.some((pattern) => pattern.test(text));
      };
      const selectors = [
        '[data-test-id*="conversation-title"]',
        '[data-testid*="conversation-title"]',
        '[aria-current="page"]',
        'a[href*="/app/"][aria-current="page"]',
        '[href*="/app/"][aria-current="page"]',
        '.conversation-title',
        '.chat-title',
        'main h1',
        'header h1',
      ];

      for (const selector of selectors) {
        for (const element of document.querySelectorAll(selector)) {
          const candidates = [
            element.getAttribute('aria-label'),
            element.getAttribute('title'),
            element.textContent,
          ];
          const title = candidates.map(clean).find(isUsable);

          if (title) {
            return title;
          }
        }
      }

      return isUsable(document.title) ? clean(document.title) : null;
    })();
  `;
}

function getInitialActiveSlotId(group: Group): string {
  return group.stageIds[0] ?? group.slots[0]?.id ?? '';
}

function App() {
  const { t, i18n } = useTranslation();
  const { maxTabs: MAX_TABS, maxSlots: MAX_SLOTS, maxStageSlots: MAX_STAGE_SLOTS } = useEntitlement();
  const [tabs, setTabs] = React.useState<Tab[]>(() => [createGroupTab(createBlankGroup())]);
  const [activeTabId, setActiveTabId] = React.useState<string>(() => tabs[0]?.id ?? '');
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]!;
  const activeWorkspaceId = activeTab.kind === 'workspace' ? activeTab.workspaceId : null;
  const group = activeTab.group;
  const { slots, stageIds, dockIds, layoutMode, dockMinimized } = group;
  const [activeSlotId, setActiveSlotId] = React.useState<string>(() => getInitialActiveSlotId(tabs[0]!.group));
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [sidebarView, setSidebarView] = React.useState<SidebarView>(null);
  const [settingsMenuOpen, setSettingsMenuOpen] = React.useState(false);
  const [addSlotModalOpen, setAddSlotModalOpen] = React.useState(false);
  const [addWebSlotUrl, setAddWebSlotUrl] = React.useState('');
  const [addWebSlotMode, setAddWebSlotMode] = React.useState<'favorite' | 'manual'>('favorite');
  const [newTabModalOpen, setNewTabModalOpen] = React.useState(false);
  const [newTabWorkspaceListOpen, setNewTabWorkspaceListOpen] = React.useState(false);
  const [workspacePromotionOpen, setWorkspacePromotionOpen] = React.useState(false);
  const [workspacePromotionName, setWorkspacePromotionName] = React.useState('');
  const [workspacePromotionError, setWorkspacePromotionError] = React.useState('');
  const [workspaceRecords, setWorkspaceRecords] = React.useState<WorkspaceRecord[]>(() => workspaceRepository.list());
  const [workspacePanelNotice, setWorkspacePanelNotice] = React.useState('');
  const [expandedWorkspaceId, setExpandedWorkspaceId] = React.useState<string | null>(null);
  const [workspaceCreateOpen, setWorkspaceCreateOpen] = React.useState(false);
  const [workspaceCreateName, setWorkspaceCreateName] = React.useState('');
  const [workspaceCreateError, setWorkspaceCreateError] = React.useState('');
  const [workspaceRenameTarget, setWorkspaceRenameTarget] = React.useState<WorkspaceRecord | null>(null);
  const [workspaceRenameName, setWorkspaceRenameName] = React.useState('');
  const [workspaceRenameError, setWorkspaceRenameError] = React.useState('');
  const [memoPanelOpen, setMemoPanelOpen] = React.useState(false);
  const [memoSearch, setMemoSearch] = React.useState('');
  const [selectedMemoProviders, setSelectedMemoProviders] = React.useState<MemoProviderFilter[]>(() => [
    ...DEFAULT_MEMO_PROVIDER_FILTERS,
  ]);
  const [memoResultsMinHeight, setMemoResultsMinHeight] = React.useState(0);
  const [manualMemoText, setManualMemoText] = React.useState('');
  const [editingMemoId, setEditingMemoId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState('');
  const [editingContent, setEditingContent] = React.useState('');
  const [selectedMemoId, setSelectedMemoId] = React.useState<string | null>(null);
  const [navigationNotice, setNavigationNotice] = React.useState('');
  const [memos, setMemos] = React.useState<Memo[]>(() => memoRepository.list());
  const [favorites, setFavorites] = React.useState<Favorite[]>(() => favoriteRepository.list());
  const [favoriteFolders, setFavoriteFolders] = React.useState<FavoriteFolder[]>(() => favoriteRepository.listFolders());
  const [bookmarkBarVisible, setBookmarkBarVisible] = React.useState<boolean>(() => {
    const stored = window.localStorage.getItem(BOOKMARK_BAR_VISIBLE_KEY);
    return stored === null ? true : stored === 'true';
  });
  const [favoriteFilter, setFavoriteFilter] = React.useState<'all' | 'uncategorized' | string>('all');
  const [favoriteFolderModal, setFavoriteFolderModal] = React.useState<{
    mode: 'create' | 'rename';
    folderId?: string;
    initialName: string;
  } | null>(null);
  const [favoriteFolderDraft, setFavoriteFolderDraft] = React.useState('');
  const [webviewCapturePreloadUrl, setWebviewCapturePreloadUrl] = React.useState<string | null>(null);
  const [navigationStates, setNavigationStates] = React.useState<Partial<Record<string, NavigationState>>>(() =>
    createInitialNavigationStates(slots),
  );
  const [broadcastCollapsed, setBroadcastCollapsed] = React.useState(false);
  const [broadcastText, setBroadcastText] = React.useState('');
  const [broadcastStatuses, setBroadcastStatuses] = React.useState<Record<string, BroadcastStatus>>(() =>
    createInitialBroadcastStatuses(slots),
  );
  const [maximizedSlotId, setMaximizedSlotId] = React.useState<string | null>(null);
  const webviewRefs = React.useRef<Partial<Record<string, ProviderWebview>>>({});
  const webviewReadyRef = React.useRef<Partial<Record<string, boolean>>>({});
  const webviewRefCallbacks = React.useRef<Partial<Record<string, (webview: TrackedProviderWebview | null) => void>>>({});
  const webviewRefCallbackOwnerTabIdsRef = React.useRef<Partial<Record<string, string>>>({});
  const initialWebviewSrcBySlotIdRef = React.useRef<Record<string, string>>({});
  const readRestorableLiveSlotUrl = React.useCallback((slot: Slot): string | null => {
    const webview = webviewRefs.current[slot.id] as TrackedProviderWebview | undefined;

    if (!webview || !webviewReadyRef.current[slot.id]) {
      return null;
    }

    try {
      const liveUrl = webview.getURL?.();

      if (liveUrl && isAiSlot(slot) && isRestorableUrl(slot.providerId, liveUrl)) {
        return liveUrl;
      }

      if (liveUrl && slot.kind === 'web' && isHttpOrHttpsUrl(liveUrl)) {
        return liveUrl;
      }
    } catch {
      return null;
    }

    return null;
  }, []);
  const createLiveGroupSnapshot = React.useCallback((group: Group): Group => {
    return {
      ...group,
      slots: group.slots.map((slot) => {
        const liveUrl = readRestorableLiveSlotUrl(slot);

        if (liveUrl) {
          return {
            ...slot,
            currentUrl: liveUrl,
          };
        }

        return { ...slot };
      }),
      stageIds: [...group.stageIds],
      dockIds: [...group.dockIds],
    };
  }, [readRestorableLiveSlotUrl]);
  const memoResultsRef = React.useRef<HTMLDivElement | null>(null);
  const draggedIdRef = React.useRef<string | null>(null);
  const htmlDragSourceRef = React.useRef<'stage' | 'dock' | null>(null);
  const lastDragPreviewRef = React.useRef<string | null>(null);
  const stagePointerDragRef = React.useRef<StagePointerDrag | null>(null);
  const suppressNextHeaderClickRef = React.useRef(false);
  const stageIdsRef = React.useRef(stageIds);
  const dockIdsRef = React.useRef(dockIds);
  const activeSlotIdRef = React.useRef(activeSlotId);
  const draggingSlotIdRef = React.useRef<string | null>(null);
  const workspaceCreateInputRef = React.useRef<HTMLInputElement | null>(null);
  const workspaceRenameInputRef = React.useRef<HTMLInputElement | null>(null);
  const [draggingSlotId, setDraggingSlotId] = React.useState<string | null>(null);
  const slotsById = React.useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots]);
  const stageSlots = React.useMemo(() => stageIds.map((slotId) => slotsById.get(slotId)).filter(Boolean) as Slot[], [slotsById, stageIds]);
  const dockSlots = React.useMemo(() => dockIds.map((slotId) => slotsById.get(slotId)).filter(Boolean) as Slot[], [dockIds, slotsById]);
  const activeSlot = slotsById.get(activeSlotId) ?? stageSlots[0] ?? slots[0] ?? null;
  const activeProvider = activeSlot && isAiSlot(activeSlot) ? getProviderConfig(activeSlot.providerId) : null;
  const isStageGrid = stageIds.length === MAX_STAGE_SLOTS && layoutMode === 'grid2x2';
  const stageGridStyle = React.useMemo<React.CSSProperties>(
    () => ({
      gridTemplateColumns: isStageGrid ? 'repeat(2, minmax(0, 1fr))' : `repeat(${Math.max(stageIds.length, 1)}, minmax(0, 1fr))`,
    }),
    [isStageGrid, stageIds.length],
  );
  const selectedLanguage = getCurrentLanguage();
  const handleLanguageChange = React.useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const nextLanguage = event.target.value as SupportedLanguage;
      saveLanguagePreference(nextLanguage);
      void i18n.changeLanguage(nextLanguage);
    },
    [i18n],
  );

  const setGroup = React.useCallback((updater: Group | ((currentGroup: Group) => Group)) => {
    setTabs((currentTabs) =>
      currentTabs.map((tab) => {
        if (tab.id !== activeTabId) {
          return tab;
        }

        const nextGroup = typeof updater === 'function' ? (updater as (currentGroup: Group) => Group)(tab.group) : updater;
        return { ...tab, group: nextGroup };
      }),
    );
  }, [activeTabId]);

  React.useEffect(() => {
    memoRepository.save(memos);
  }, [memos]);

  React.useEffect(() => {
    favoriteRepository.save(favorites);
  }, [favorites]);

  React.useEffect(() => {
    favoriteRepository.saveFolders(favoriteFolders);
  }, [favoriteFolders]);

  React.useEffect(() => {
    window.localStorage.setItem(BOOKMARK_BAR_VISIBLE_KEY, String(bookmarkBarVisible));
  }, [bookmarkBarVisible]);

  React.useEffect(() => {
    setFavoriteFolderDraft(favoriteFolderModal?.initialName ?? '');
  }, [favoriteFolderModal]);

  React.useEffect(() => {
    if (tabs.length < MAX_TABS && workspacePanelNotice) {
      setWorkspacePanelNotice('');
    }
  }, [tabs.length, workspacePanelNotice]);

  React.useEffect(() => {
    if (!workspaceCreateOpen) {
      return;
    }

    workspaceCreateInputRef.current?.focus();
    const focusTimer = window.setTimeout(() => {
      workspaceCreateInputRef.current?.focus();
    }, 50);

    return () => window.clearTimeout(focusTimer);
  }, [workspaceCreateOpen]);

  React.useEffect(() => {
    if (!workspaceRenameTarget) {
      return;
    }

    workspaceRenameInputRef.current?.focus();
    workspaceRenameInputRef.current?.select();
    const focusTimer = window.setTimeout(() => {
      workspaceRenameInputRef.current?.focus();
      workspaceRenameInputRef.current?.select();
    }, 50);

    return () => window.clearTimeout(focusTimer);
  }, [workspaceRenameTarget]);

  React.useEffect(() => {
    stageIdsRef.current = stageIds;
  }, [stageIds]);

  React.useEffect(() => {
    dockIdsRef.current = dockIds;
  }, [dockIds]);

  React.useEffect(() => {
    activeSlotIdRef.current = activeSlotId;
  }, [activeSlotId]);

  React.useEffect(() => {
    draggingSlotIdRef.current = draggingSlotId;
  }, [draggingSlotId]);

  React.useEffect(() => {
    if (stageIds.length > 0 || dockIds.length === 0) {
      return;
    }

    const [nextStageSlotId, ...remainingDockIds] = dockIds;
    setGroup((currentGroup) => ({
      ...currentGroup,
      stageIds: [nextStageSlotId],
      dockIds: remainingDockIds,
    }));
    setActiveSlotId(nextStageSlotId);
  }, [dockIds, stageIds.length]);

  React.useEffect(() => {
    if (!maximizedSlotId || stageIds.includes(maximizedSlotId)) {
      return;
    }

    setMaximizedSlotId(null);
  }, [maximizedSlotId, stageIds]);

  React.useEffect(() => {
    if (!memoPanelOpen && sidebarView === null) {
      return;
    }

    setMaximizedSlotId(null);
  }, [memoPanelOpen, sidebarView]);

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
  const filteredUnpinnedMemos = unpinnedMemos.filter((memo) => selectedMemoProviders.includes(memo.provider));
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

  const updateSlotTitle = React.useCallback((slotId: string, ownerTabId: string, title: string) => {
    setTabs((currentTabs) =>
      currentTabs.map((tab) => {
        if (tab.id !== ownerTabId) {
          return tab;
        }

        const currentSlot = tab.group.slots.find((slot) => slot.id === slotId);

        if (currentSlot?.title === title) {
          return tab;
        }

        return {
          ...tab,
          group: {
            ...tab.group,
            slots: tab.group.slots.map((currentSlot) => (currentSlot.id === slotId ? { ...currentSlot, title } : currentSlot)),
          },
        };
      }),
    );
  }, []);

  const refreshGeminiSlotTitle = React.useCallback(
    (slotId: string, ownerTabId: string, webview: TrackedProviderWebview) => {
      if (typeof webview.executeJavaScript !== 'function') {
        return;
      }

      const executeJavaScript = webview.executeJavaScript.bind(webview);

      window.setTimeout(() => {
        void executeJavaScript<unknown>(createGeminiTitleScript())
          .then((title) => {
            if (typeof title === 'string' && isMeaningfulGeminiTitle(title)) {
              updateSlotTitle(slotId, ownerTabId, title.trim());
            }
          })
          .catch((error: unknown) => {
            console.warn('Failed to read Gemini conversation title', error);
          });
      }, 500);
    },
    [updateSlotTitle],
  );

  const attachNavigationTracker = React.useCallback(
    (slot: Slot, ownerTabId: string) => (webview: TrackedProviderWebview | null) => {
      const slotId = slot.id;

      if (!webview) {
        delete webviewRefs.current[slotId];
        delete webviewReadyRef.current[slotId];
        delete initialWebviewSrcBySlotIdRef.current[slotId];
        return;
      }

      webviewRefs.current[slotId] = webview;

      if (webview.dataset.omniTrackedSlot !== slotId) {
        webview.addEventListener('dom-ready', () => {
          webviewReadyRef.current[slotId] = true;
          updateSlotNavigationState(slotId);
        });

        const saveCurrentUrl = (event: WebviewNavigationEvent) => {
          if (event.isMainFrame === false) {
            updateSlotNavigationState(slotId);
            return;
          }

          const navigatedUrl = event.url ?? webview.getURL?.();

          if (navigatedUrl && isAiSlot(slot)) {
            saveProviderUrl(slot.providerId, navigatedUrl);

            if (isRestorableUrl(slot.providerId, navigatedUrl)) {
              setTabs((currentTabs) =>
                currentTabs.map((tab) => {
                  if (tab.id !== ownerTabId) {
                    return tab;
                  }

                  const currentSlot = tab.group.slots.find((slot) => slot.id === slotId);

                  if (currentSlot?.currentUrl === navigatedUrl) {
                    return tab;
                  }

                  return {
                    ...tab,
                    group: {
                      ...tab.group,
                      slots: tab.group.slots.map((slot) =>
                        slot.id === slotId ? { ...slot, currentUrl: navigatedUrl } : slot,
                      ),
                    },
                  };
                }),
              );
            }
          }

          if (navigatedUrl && slot.kind === 'web' && isHttpOrHttpsUrl(navigatedUrl)) {
            setTabs((currentTabs) =>
              currentTabs.map((tab) => {
                if (tab.id !== ownerTabId) {
                  return tab;
                }

                const currentSlot = tab.group.slots.find((slot) => slot.id === slotId);

                if (currentSlot?.currentUrl === navigatedUrl) {
                  return tab;
                }

                return {
                  ...tab,
                  group: {
                    ...tab.group,
                    slots: tab.group.slots.map((slot) => (slot.id === slotId ? { ...slot, currentUrl: navigatedUrl } : slot)),
                  },
                };
              }),
            );
          }

          updateSlotNavigationState(slotId);

          if (isAiSlot(slot) && slot.providerId === 'gemini') {
            refreshGeminiSlotTitle(slotId, ownerTabId, webview);
          }
        };

        webview.addEventListener('did-navigate', saveCurrentUrl);
        webview.addEventListener('did-navigate-in-page', saveCurrentUrl);
        webview.addEventListener('did-finish-load', () => {
          updateSlotNavigationState(slotId);

          if (isAiSlot(slot) && slot.providerId === 'gemini') {
            refreshGeminiSlotTitle(slotId, ownerTabId, webview);
          }
        });
        webview.addEventListener('page-title-updated', (event: Event & { title?: string }) => {
          const fallbackTitle = isAiSlot(slot) ? getProviderConfig(slot.providerId).label : slot.title;
          const title = typeof event.title === 'string' && event.title.trim() ? event.title.trim() : fallbackTitle;

          if (isAiSlot(slot) && slot.providerId === 'gemini' && !isMeaningfulGeminiTitle(title)) {
            refreshGeminiSlotTitle(slotId, ownerTabId, webview);
            return;
          }

          updateSlotTitle(slotId, ownerTabId, title);
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

      if (isAiSlot(slot) && webview.dataset.omniMemoSlot !== slotId) {
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
              provider: slot.providerId,
              sourceUrl,
              sourceTitle,
            }),
            ...currentMemos,
          ]);
        });
        webview.dataset.omniMemoSlot = slotId;
      }
    },
    [refreshGeminiSlotTitle, updateSlotNavigationState, updateSlotTitle],
  );

  const getSlotWebviewRef = React.useCallback(
    (slot: Slot, ownerTabId: string) => {
      if (webviewRefCallbackOwnerTabIdsRef.current[slot.id] !== ownerTabId) {
        delete webviewRefCallbacks.current[slot.id];
        webviewRefCallbackOwnerTabIdsRef.current[slot.id] = ownerTabId;
      }

      webviewRefCallbacks.current[slot.id] ??= attachNavigationTracker(slot, ownerTabId);
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
      const targetSlots = stageSlots.filter(isAiSlot);

      setBroadcastStatuses((currentStatuses) => {
        const nextStatuses = { ...currentStatuses };
        targetSlots.forEach((slot) => {
          nextStatuses[slot.id] = { state: 'pending', message: 'Sending...' };
        });
        return nextStatuses;
      });

      const settledResults = await Promise.allSettled(
        targetSlots.map(async (slot): Promise<SendResult> => {
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
        const slot = targetSlots[index];
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

      const currentStageIds = stageIdsRef.current;
      const currentDockIds = dockIdsRef.current;
      const currentActiveSlotId = activeSlotIdRef.current;
      const stageWithoutDragged = currentStageIds.filter((slotId) => slotId !== id);
      const dockWithoutDragged = currentDockIds.filter((slotId) => slotId !== id);
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

      stageIdsRef.current = nextStageIds;
      dockIdsRef.current = nextDockIds;
      setGroup((currentGroup) => ({
        ...currentGroup,
        stageIds: nextStageIds,
        dockIds: nextDockIds,
      }));

      if (destArrName === 'stage') {
        activeSlotIdRef.current = id;
        setActiveSlotId(id);
        setMemoPanelOpen(false);
      } else if (currentActiveSlotId === id) {
        const nextActiveSlotId = nextStageIds[0] ?? nextDockIds[0] ?? id;
        activeSlotIdRef.current = nextActiveSlotId;
        setActiveSlotId(nextActiveSlotId);
      }
    },
    [setGroup, slotsById],
  );

  const getDropSide = React.useCallback((event: React.DragEvent<HTMLElement>): 'before' | 'after' => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
  }, []);

  const clearHtmlDragState = React.useCallback(() => {
    draggedIdRef.current = null;
    htmlDragSourceRef.current = null;
    lastDragPreviewRef.current = null;
    draggingSlotIdRef.current = null;
    flushSync(() => setDraggingSlotId(null));
    window.requestAnimationFrame(() => setDraggingSlotId(null));
  }, []);

  const clickSlotHeaderAfterDockDrop = React.useCallback((slotId: string) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`.provider-pane[data-slot-id="${slotId}"] .slot-header`)?.click();
      });
    });
  }, []);

  React.useEffect(() => {
    const handleWindowDragFinish = () => {
      if (!htmlDragSourceRef.current && !draggingSlotIdRef.current) {
        return;
      }

      clearHtmlDragState();
    };

    window.addEventListener('dragend', handleWindowDragFinish, true);
    window.addEventListener('drop', handleWindowDragFinish, true);
    window.addEventListener('mouseup', handleWindowDragFinish, true);
    window.addEventListener('pointerup', handleWindowDragFinish, true);
    window.addEventListener('blur', handleWindowDragFinish);

    return () => {
      window.removeEventListener('dragend', handleWindowDragFinish, true);
      window.removeEventListener('drop', handleWindowDragFinish, true);
      window.removeEventListener('mouseup', handleWindowDragFinish, true);
      window.removeEventListener('pointerup', handleWindowDragFinish, true);
      window.removeEventListener('blur', handleWindowDragFinish);
    };
  }, [clearHtmlDragState]);

  const getStageDropPositionFromPoint = React.useCallback((clientX: number, clientY: number): DropPosition => {
    const stageRoot = document.querySelector<HTMLElement>('.stage-grid');
    const draggedId = draggedIdRef.current;
    const remainingStageIds = stageIdsRef.current.filter((slotId) => slotId !== draggedId);
    const panes = stageIdsRef.current
      .filter((slotId) => slotId !== draggedId)
      .map((slotId) => stageRoot?.querySelector<HTMLElement>(`[data-slot-id="${slotId}"]`) ?? null)
      .filter((pane): pane is HTMLElement => Boolean(pane && pane.offsetParent !== null));

    if (panes.length === 0) {
      return { targetId: null, side: null };
    }

    if (stageRoot?.classList.contains('grid2x2')) {
      const stageRect = stageRoot.getBoundingClientRect();
      const column = clientX < stageRect.left + stageRect.width / 2 ? 0 : 1;
      const row = clientY < stageRect.top + stageRect.height / 2 ? 0 : 1;
      const insertIndex = row * 2 + column;
      const targetId = remainingStageIds[insertIndex] ?? remainingStageIds[remainingStageIds.length - 1] ?? null;

      if (!targetId) {
        return { targetId: null, side: null };
      }

      return {
        targetId,
        side: insertIndex < remainingStageIds.length ? 'before' : 'after',
      };
    }

    const orderedPanes = [...panes].sort((leftPane, rightPane) => {
      const leftRect = leftPane.getBoundingClientRect();
      const rightRect = rightPane.getBoundingClientRect();
      return leftRect.left - rightRect.left;
    });

    const targetPane =
      orderedPanes.find((pane) => {
        const rect = pane.getBoundingClientRect();
        return clientX < rect.left + rect.width / 2;
      }) ?? orderedPanes[orderedPanes.length - 1];
    const targetId = targetPane.dataset.slotId ?? null;

    if (!targetId) {
      return { targetId: null, side: null };
    }

    const targetRect = targetPane.getBoundingClientRect();
    return {
      targetId,
      side: clientX < targetRect.left + targetRect.width / 2 ? 'before' : 'after',
    };
  }, []);

  const getDockDropPositionFromPoint = React.useCallback((clientX: number, clientY: number): DropPosition | null => {
    const dock = document.querySelector<HTMLElement>('.dock');
    const dockMagnetMargin = 140;

    if (!dock) {
      return null;
    }

    const dockRect = dock.getBoundingClientRect();

    if (
      clientX < dockRect.left ||
      clientX > dockRect.right ||
      clientY < dockRect.top - dockMagnetMargin ||
      clientY > dockRect.bottom
    ) {
      return null;
    }

    const chips = dockIdsRef.current
      .map((slotId) => dock.querySelector<HTMLElement>(`[data-slot-id="${slotId}"]`))
      .filter((chip): chip is HTMLElement => Boolean(chip && chip.offsetParent !== null));

    if (chips.length === 0) {
      return { targetId: null, side: null };
    }

    const orderedChips = [...chips].sort((leftChip, rightChip) => {
      const leftRect = leftChip.getBoundingClientRect();
      const rightRect = rightChip.getBoundingClientRect();
      return leftRect.left - rightRect.left;
    });
    const targetChip =
      orderedChips.find((chip) => {
        const rect = chip.getBoundingClientRect();
        return clientX < rect.left + rect.width / 2;
      }) ?? orderedChips[orderedChips.length - 1];
    const targetId = targetChip.dataset.slotId ?? null;

    if (!targetId) {
      return { targetId: null, side: null };
    }

    const targetRect = targetChip.getBoundingClientRect();
    return {
      targetId,
      side: clientX < targetRect.left + targetRect.width / 2 ? 'before' : 'after',
    };
  }, []);

  const getStageDropPosition = React.useCallback(
    (event: React.DragEvent<HTMLElement>): DropPosition => {
      return getStageDropPositionFromPoint(event.clientX, event.clientY);
    },
    [getStageDropPositionFromPoint],
  );

  const animateSlotReflow = React.useCallback((draggedId: string, applyMove: () => void) => {
    const visibleElements = Array.from(document.querySelectorAll<HTMLElement>('.provider-pane[data-slot-id], .dock-chip[data-slot-id]')).filter(
      (element) => element.offsetParent !== null,
    );
    const firstRects = new Map<string, DOMRect>();

    visibleElements.forEach((element) => {
      const slotId = element.dataset.slotId;

      if (slotId && slotId !== draggedId) {
        firstRects.set(slotId, element.getBoundingClientRect());
      }
    });

    flushSync(applyMove);

    window.requestAnimationFrame(() => {
      Array.from(document.querySelectorAll<HTMLElement>('.provider-pane[data-slot-id], .dock-chip[data-slot-id]')).forEach((element) => {
        const slotId = element.dataset.slotId;

        if (!slotId || slotId === draggedId || element.offsetParent === null) {
          return;
        }

        const firstRect = firstRects.get(slotId);

        if (!firstRect) {
          return;
        }

        const lastRect = element.getBoundingClientRect();
        const deltaX = firstRect.left - lastRect.left;
        const deltaY = firstRect.top - lastRect.top;

        if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
          return;
        }

        element.animate(
          [
            { transform: `translate(${deltaX}px, ${deltaY}px)` },
            { transform: 'translate(0, 0)' },
          ],
          {
            duration: 190,
            easing: 'cubic-bezier(0.2, 0, 0, 1)',
          },
        );
      });
    });
  }, []);

  const previewSlotMove = React.useCallback(
    (id: string, destArrName: 'stage' | 'dock', targetId: string | null, side: 'before' | 'after' | null) => {
      const previewKey = `${id}:${destArrName}:${targetId ?? 'end'}:${side ?? 'end'}`;

      if (lastDragPreviewRef.current === previewKey) {
        return;
      }

      lastDragPreviewRef.current = previewKey;
      animateSlotReflow(id, () => moveSlotToPosition(id, destArrName, targetId, side));
    },
    [animateSlotReflow, moveSlotToPosition],
  );

  const handleStageHeaderClickCapture = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressNextHeaderClickRef.current) {
      return;
    }

    suppressNextHeaderClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleStageHeaderPointerDown = React.useCallback(
    (slotId: string, event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      const draggedElement = document.querySelector<HTMLElement>(`.provider-pane[data-slot-id="${slotId}"]`);
      const draggedRect = draggedElement?.getBoundingClientRect();

      stagePointerDragRef.current = {
        id: slotId,
        startX: event.clientX,
        startY: event.clientY,
        grabOffsetX: draggedRect ? event.clientX - draggedRect.left : 0,
        grabOffsetY: draggedRect ? event.clientY - draggedRect.top : 0,
        active: false,
      };

      const updateDraggedElementOffset = (pointerEvent: PointerEvent, dragState: StagePointerDrag) => {
        const draggedElement = document.querySelector<HTMLElement>(`.provider-pane[data-slot-id="${slotId}"]`);
        const stageGrid = draggedElement?.closest<HTMLElement>('.stage-grid');

        if (!draggedElement || !stageGrid) {
          return;
        }

        const stageGridRect = stageGrid.getBoundingClientRect();
        const layoutLeft = stageGridRect.left + draggedElement.offsetLeft;
        const layoutTop = stageGridRect.top + draggedElement.offsetTop;
        const nextX = pointerEvent.clientX - dragState.grabOffsetX - layoutLeft;
        const nextY = pointerEvent.clientY - dragState.grabOffsetY - layoutTop;

        draggedElement.style.setProperty('--drag-x', `${nextX}px`);
        draggedElement.style.setProperty('--drag-y', `${nextY}px`);
      };

      const clearDraggedElementOffset = () => {
        const draggedElement = document.querySelector<HTMLElement>(`.provider-pane[data-slot-id="${slotId}"]`);

        draggedElement?.style.removeProperty('--drag-x');
        draggedElement?.style.removeProperty('--drag-y');
      };

      const handlePointerMove = (pointerEvent: PointerEvent) => {
        const dragState = stagePointerDragRef.current;

        if (!dragState || dragState.id !== slotId) {
          return;
        }

        const deltaX = pointerEvent.clientX - dragState.startX;
        const deltaY = pointerEvent.clientY - dragState.startY;

        if (!dragState.active) {
          if (Math.hypot(deltaX, deltaY) < 6) {
            return;
          }

          dragState.active = true;
          draggedIdRef.current = slotId;
          lastDragPreviewRef.current = null;
          document.body.classList.add('stage-pointer-dragging');
          document.getSelection()?.removeAllRanges();
          setDraggingSlotId(slotId);
        }

        pointerEvent.preventDefault();
        document.getSelection()?.removeAllRanges();
        updateDraggedElementOffset(pointerEvent, dragState);

        const dockPosition = getDockDropPositionFromPoint(pointerEvent.clientX, pointerEvent.clientY);

        if (dockPosition) {
          previewSlotMove(slotId, 'dock', dockPosition.targetId, dockPosition.side);
          return;
        }

        const stagePosition = getStageDropPositionFromPoint(pointerEvent.clientX, pointerEvent.clientY);
        previewSlotMove(slotId, 'stage', stagePosition.targetId, stagePosition.side);
      };

      const handlePointerUp = (pointerEvent: PointerEvent) => {
        const dragState = stagePointerDragRef.current;
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);

        if (dragState?.active) {
          pointerEvent.preventDefault();
          suppressNextHeaderClickRef.current = true;
          window.setTimeout(() => {
            suppressNextHeaderClickRef.current = false;
          }, 0);
        }

        stagePointerDragRef.current = null;
        draggedIdRef.current = null;
        lastDragPreviewRef.current = null;
        document.body.classList.remove('stage-pointer-dragging');
        document.getSelection()?.removeAllRanges();
        clearDraggedElementOffset();
        setDraggingSlotId(null);
      };

      window.addEventListener('pointermove', handlePointerMove, { passive: false });
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    },
    [getDockDropPositionFromPoint, getStageDropPositionFromPoint, previewSlotMove],
  );

  const handleSlotDragStart = React.useCallback((slotId: string, event: React.DragEvent<HTMLElement>) => {
    draggedIdRef.current = slotId;
    htmlDragSourceRef.current = event.currentTarget.classList.contains('dock-chip') ? 'dock' : 'stage';
    draggingSlotIdRef.current = slotId;
    lastDragPreviewRef.current = null;
    setDraggingSlotId(slotId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', slotId);

    const dragImage = event.currentTarget.closest<HTMLElement>('.provider-pane') ?? event.currentTarget;
    const rect = dragImage.getBoundingClientRect();
    event.dataTransfer.setDragImage(dragImage, Math.min(event.clientX - rect.left, rect.width), Math.min(event.clientY - rect.top, rect.height));
  }, []);

  const handleSlotDragEnd = React.useCallback(() => {
    clearHtmlDragState();
  }, [clearHtmlDragState]);

  const handleSlotDragOver = React.useCallback(
    (destArrName: 'stage' | 'dock', targetId: string, event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';

      const draggedId = draggedIdRef.current || event.dataTransfer.getData('text/plain');

      if (!draggedId) {
        return;
      }

      if (destArrName === 'stage') {
        const { targetId: stageTargetId, side } = getStageDropPosition(event);
        previewSlotMove(draggedId, 'stage', stageTargetId, side);
        return;
      }

      if (draggedId === targetId) {
        return;
      }

      previewSlotMove(draggedId, destArrName, targetId, getDropSide(event));
    },
    [getDropSide, getStageDropPosition, previewSlotMove],
  );

  const handleSlotDrop = React.useCallback(
    (destArrName: 'stage' | 'dock', targetId: string, event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const draggedId = draggedIdRef.current || event.dataTransfer.getData('text/plain');

      if (!draggedId) {
        clearHtmlDragState();
        return;
      }

      if (destArrName === 'stage') {
        const { targetId: stageTargetId, side } = getStageDropPosition(event);
        moveSlotToPosition(draggedId, 'stage', stageTargetId, side);
        if (htmlDragSourceRef.current === 'dock') {
          clickSlotHeaderAfterDockDrop(draggedId);
        }
      } else {
        moveSlotToPosition(draggedId, destArrName, targetId, getDropSide(event));
      }

      clearHtmlDragState();
    },
    [clearHtmlDragState, clickSlotHeaderAfterDockDrop, getDropSide, getStageDropPosition, moveSlotToPosition],
  );

  const handleContainerDragOver = React.useCallback(
    (destArrName: 'stage' | 'dock', event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';

      const draggedId = draggedIdRef.current || event.dataTransfer.getData('text/plain');

      if (!draggedId) {
        return;
      }

      previewSlotMove(draggedId, destArrName, null, null);
    },
    [previewSlotMove],
  );

  const handleStageContainerDragOver = React.useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';

      const draggedId = draggedIdRef.current || event.dataTransfer.getData('text/plain');

      if (!draggedId) {
        return;
      }

      const { targetId, side } = getStageDropPosition(event);
      previewSlotMove(draggedId, 'stage', targetId, side);
    },
    [getStageDropPosition, previewSlotMove],
  );

  const handleContainerDrop = React.useCallback(
    (destArrName: 'stage' | 'dock', event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const draggedId = draggedIdRef.current || event.dataTransfer.getData('text/plain');

      if (!draggedId) {
        clearHtmlDragState();
        return;
      }

      moveSlotToPosition(draggedId, destArrName, null, null);
      if (destArrName === 'stage' && htmlDragSourceRef.current === 'dock') {
        clickSlotHeaderAfterDockDrop(draggedId);
      }
      clearHtmlDragState();
    },
    [clearHtmlDragState, clickSlotHeaderAfterDockDrop, moveSlotToPosition],
  );

  const handleStageContainerDrop = React.useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const draggedId = draggedIdRef.current || event.dataTransfer.getData('text/plain');

      if (!draggedId) {
        clearHtmlDragState();
        return;
      }

      const { targetId, side } = getStageDropPosition(event);

      if (targetId) {
        moveSlotToPosition(draggedId, 'stage', targetId, side);
      } else {
        moveSlotToPosition(draggedId, 'stage', null, null);
      }

      if (htmlDragSourceRef.current === 'dock') {
        clickSlotHeaderAfterDockDrop(draggedId);
      }
      clearHtmlDragState();
    },
    [clearHtmlDragState, clickSlotHeaderAfterDockDrop, getStageDropPosition, moveSlotToPosition],
  );

  const moveSlotToStage = React.useCallback((slotId: string) => {
    setMaximizedSlotId(null);
    setSidebarView(null);
    setMemoPanelOpen(false);
    setActiveSlotId(slotId);

    if (stageIds.includes(slotId)) {
      return;
    }

    moveSlotToPosition(slotId, 'stage', null, null);
  }, [moveSlotToPosition, stageIds]);

  const handleWorkspaceSelect = React.useCallback((slotId: string) => {
    setMaximizedSlotId(null);
    setSidebarView(null);

    if (dockIds.includes(slotId)) {
      moveSlotToStage(slotId);
      return;
    }

    setActiveSlotId(slotId);
    setMemoPanelOpen(false);
  }, [dockIds, moveSlotToStage]);

  const handleNewGroupClick = React.useCallback(() => {
    setSettingsMenuOpen(false);
    // TODO: Start a blank workspace with the configured default slot group.
  }, []);

  const handleSidebarViewSelect = React.useCallback((view: Exclude<SidebarView, null>) => {
    setMaximizedSlotId(null);
    setSidebarView(view);
    setMemoPanelOpen(false);
    setSettingsMenuOpen(false);

    if (view === 'workspace-panel') {
      setWorkspaceRecords(workspaceRepository.list());
      setWorkspacePanelNotice('');
      setExpandedWorkspaceId(null);
    }
  }, []);

  const handleMemoPanelSelect = React.useCallback(() => {
    setMaximizedSlotId(null);
    setSidebarView(null);
    setMemoPanelOpen(true);
    setSettingsMenuOpen(false);
  }, []);

  const activateTab = React.useCallback((tab: Tab) => {
    const nextActiveSlotId = getInitialActiveSlotId(tab.group);

    setActiveTabId(tab.id);
    setActiveSlotId(nextActiveSlotId);
    activeSlotIdRef.current = nextActiveSlotId;
    stageIdsRef.current = tab.group.stageIds;
    dockIdsRef.current = tab.group.dockIds;
    setMaximizedSlotId(null);
    setSidebarView(null);
    setMemoPanelOpen(false);
    setSettingsMenuOpen(false);
  }, []);

  const cleanupTabSlotState = React.useCallback((slotIds: string[]) => {
    slotIds.forEach((slotId) => {
      delete webviewRefs.current[slotId];
      delete webviewReadyRef.current[slotId];
      delete webviewRefCallbacks.current[slotId];
      delete webviewRefCallbackOwnerTabIdsRef.current[slotId];
      delete initialWebviewSrcBySlotIdRef.current[slotId];
    });

    setNavigationStates((current) => {
      const next = { ...current };
      slotIds.forEach((slotId) => {
        delete next[slotId];
      });
      return next;
    });
    setBroadcastStatuses((currentStatuses) => {
      const nextStatuses = { ...currentStatuses };
      slotIds.forEach((slotId) => {
        delete nextStatuses[slotId];
      });
      return nextStatuses;
    });
  }, []);

  const openNewTabModal = React.useCallback(() => {
    if (tabs.length >= MAX_TABS) {
      return;
    }

    setNewTabWorkspaceListOpen(false);
    setNewTabModalOpen(true);
  }, [tabs.length]);

  const closeNewTabModal = React.useCallback(() => {
    setNewTabModalOpen(false);
    setNewTabWorkspaceListOpen(false);
  }, []);

  const openWorkspacePromotion = React.useCallback(() => {
    if (activeTab.kind !== 'group') {
      return;
    }

    setWorkspacePromotionName('');
    setWorkspacePromotionError('');
    setWorkspacePromotionOpen(true);
  }, [activeTab.kind]);

  const closeWorkspacePromotion = React.useCallback(() => {
    setWorkspacePromotionOpen(false);
    setWorkspacePromotionName('');
    setWorkspacePromotionError('');
  }, []);

  const confirmWorkspacePromotion = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (activeTab.kind !== 'group') {
        closeWorkspacePromotion();
        return;
      }

      const name = workspacePromotionName.trim();

      if (!name) {
        setWorkspacePromotionError('Enter a workstation name.');
        return;
      }

      if (!workspaceRepository.canCreate()) {
        setWorkspacePromotionError('You can save up to 8 workstations.');
        return;
      }

      let workspace: ReturnType<typeof workspaceRepository.create>;

      try {
        const snapshotGroup = createLiveGroupSnapshot(activeTab.group);
        workspace = workspaceRepository.create(name, {
          slots: snapshotGroup.slots,
          stageIds: snapshotGroup.stageIds,
          dockIds: snapshotGroup.dockIds,
          layoutMode: snapshotGroup.layoutMode,
          dockMinimized: snapshotGroup.dockMinimized,
        });
      } catch {
        setWorkspacePromotionError('Could not save this workstation.');
        return;
      }

      setTabs((currentTabs) =>
        currentTabs.map((tab) => {
          if (tab.id !== activeTabId || tab.kind !== 'group') {
            return tab;
          }

          return {
            ...tab,
            kind: 'workspace',
            workspaceId: workspace.id,
            title: workspace.name,
          };
        }),
      );
      setWorkspaceRecords(workspaceRepository.list());
      closeWorkspacePromotion();
    },
    [activeTab, activeTabId, closeWorkspacePromotion, createLiveGroupSnapshot, workspacePromotionName],
  );

  const handleCreateGroupTab = React.useCallback(() => {
    if (tabs.length >= MAX_TABS) {
      setNavigationNotice(MAX_TABS_NOTICE);
      return;
    }

    const newGroup = createBlankGroup();
    const newTab = createGroupTab(newGroup);
    let wasAdded = false;

    flushSync(() => {
      setTabs((currentTabs) => {
        if (currentTabs.length >= MAX_TABS) {
          return currentTabs;
        }

        wasAdded = true;
        return [...currentTabs, newTab];
      });
    });

    if (!wasAdded) {
      setNavigationNotice(MAX_TABS_NOTICE);
      return;
    }

    setNavigationStates((current) => ({
      ...current,
      ...createInitialNavigationStates(newGroup.slots),
    }));
    setBroadcastStatuses((current) => ({
      ...current,
      ...createInitialBroadcastStatuses(newGroup.slots),
    }));
    activateTab(newTab);
    closeNewTabModal();
  }, [activateTab, closeNewTabModal, tabs.length]);

  const handleWorkspaceTabPlaceholder = React.useCallback(() => {
    setNewTabWorkspaceListOpen((isOpen) => !isOpen);
  }, []);

  const refreshWorkspaceRecords = React.useCallback(() => {
    setWorkspaceRecords(workspaceRepository.list());
  }, []);

  const closeTab = React.useCallback((tabId: string) => {
    setTabs((currentTabs) => {
      if (currentTabs.length <= 1) {
        return currentTabs;
      }

      const closingIndex = currentTabs.findIndex((tab) => tab.id === tabId);

      if (closingIndex < 0) {
        return currentTabs;
      }

      const closingTab = currentTabs[closingIndex];
      const nextTabs = currentTabs.filter((tab) => tab.id !== tabId);
      if (closingTab.kind === 'workspace' && closingTab.workspaceId) {
        const snapshotGroup = createLiveGroupSnapshot(closingTab.group);
        workspaceRepository.update(closingTab.workspaceId, {
          slots: snapshotGroup.slots,
          stageIds: snapshotGroup.stageIds,
          dockIds: snapshotGroup.dockIds,
          layoutMode: snapshotGroup.layoutMode,
          dockMinimized: snapshotGroup.dockMinimized,
        });
        refreshWorkspaceRecords();
      }
      cleanupTabSlotState(closingTab.group.slots.map((slot) => slot.id));

      setActiveTabId((currentActiveTabId) => {
        if (currentActiveTabId !== tabId) {
          return currentActiveTabId;
        }

        const nextTab = nextTabs[Math.min(closingIndex, nextTabs.length - 1)] ?? nextTabs[0];
        const nextActiveSlotId = nextTab ? getInitialActiveSlotId(nextTab.group) : '';
        setActiveSlotId(nextActiveSlotId);
        activeSlotIdRef.current = nextActiveSlotId;
        stageIdsRef.current = nextTab?.group.stageIds ?? [];
        dockIdsRef.current = nextTab?.group.dockIds ?? [];
        setMaximizedSlotId(null);

        return nextTab?.id ?? '';
      });

      return nextTabs;
    });
  }, [cleanupTabSlotState, createLiveGroupSnapshot, refreshWorkspaceRecords]);

  React.useEffect(() => {
    if (activeTab.kind !== 'workspace' || activeWorkspaceId === null) {
      return;
    }

    const snapshotGroup = createLiveGroupSnapshot(activeTab.group);
    workspaceRepository.update(activeWorkspaceId, {
      slots: snapshotGroup.slots,
      stageIds: snapshotGroup.stageIds,
      dockIds: snapshotGroup.dockIds,
      layoutMode: snapshotGroup.layoutMode,
      dockMinimized: snapshotGroup.dockMinimized,
    });
    refreshWorkspaceRecords();
  }, [activeTab.kind, activeTab.group, activeWorkspaceId, createLiveGroupSnapshot, refreshWorkspaceRecords]);

  const closeWorkspacePanel = React.useCallback(() => {
    setSidebarView(null);
    setMemoPanelOpen(false);
    setSettingsMenuOpen(false);
    setMaximizedSlotId(null);
  }, []);

  const openWorkspaceTab = React.useCallback(
    (workspace: WorkspaceRecord) => {
      const openTab = tabs.find((tab) => tab.kind === 'workspace' && tab.workspaceId === workspace.id);

      if (openTab) {
        setWorkspacePanelNotice('');
        activateTab(openTab);
        closeWorkspacePanel();
        return;
      }

      if (tabs.length >= MAX_TABS) {
        setWorkspacePanelNotice(MAX_TABS_NOTICE);
        return;
      }

      const latestWorkspace = workspaceRepository.get(workspace.id) ?? workspace;
      const newTab = createWorkspaceTab(latestWorkspace);
      let wasAdded = false;

      flushSync(() => {
        setTabs((currentTabs) => {
          if (currentTabs.length >= MAX_TABS) {
            return currentTabs;
          }

          wasAdded = true;
          return [...currentTabs, newTab];
        });
      });

      if (!wasAdded) {
        setWorkspacePanelNotice(MAX_TABS_NOTICE);
        return;
      }

      setNavigationStates((current) => ({
        ...current,
        ...createInitialNavigationStates(newTab.group.slots),
      }));
      setBroadcastStatuses((current) => ({
        ...current,
        ...createInitialBroadcastStatuses(newTab.group.slots),
      }));
      setWorkspacePanelNotice('');
      activateTab(newTab);
      closeWorkspacePanel();
    },
    [activateTab, closeWorkspacePanel, tabs],
  );

  const openWorkspaceCreate = React.useCallback(() => {
    if (tabs.length >= MAX_TABS) {
      setWorkspacePanelNotice(MAX_TABS_NOTICE);
      closeNewTabModal();
      return;
    }

    setWorkspaceCreateName('');
    setWorkspaceCreateError('');
    setWorkspaceCreateOpen(true);
  }, [closeNewTabModal, tabs.length]);

  const closeWorkspaceCreate = React.useCallback(() => {
    setWorkspaceCreateOpen(false);
    setWorkspaceCreateName('');
    setWorkspaceCreateError('');
  }, []);

  const confirmWorkspaceCreate = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const name = workspaceCreateName.trim();

      if (!name) {
        setWorkspaceCreateError('워크스테이션 이름을 입력하세요.');
        return;
      }

      if (!workspaceRepository.canCreate()) {
        setWorkspaceCreateError('워크스테이션은 최대 8개까지 저장할 수 있습니다.');
        return;
      }

      if (tabs.length >= MAX_TABS) {
        setWorkspaceCreateError(MAX_TABS_NOTICE);
        return;
      }

      const blankGroup = createBlankGroup();
      let workspace: WorkspaceRecord;

      try {
        workspace = workspaceRepository.create(name, {
          slots: blankGroup.slots,
          stageIds: blankGroup.stageIds,
          dockIds: blankGroup.dockIds,
          layoutMode: blankGroup.layoutMode,
          dockMinimized: blankGroup.dockMinimized,
        });
      } catch {
        setWorkspaceCreateError('워크스테이션을 만들 수 없습니다.');
        return;
      }

      const newTab = createWorkspaceTab(workspace);
      let wasAdded = false;

      flushSync(() => {
        setTabs((currentTabs) => {
          if (currentTabs.length >= MAX_TABS) {
            return currentTabs;
          }

          wasAdded = true;
          return [...currentTabs, newTab];
        });
      });

      if (!wasAdded) {
        setWorkspaceCreateError(MAX_TABS_NOTICE);
        return;
      }

      setNavigationStates((current) => ({
        ...current,
        ...createInitialNavigationStates(newTab.group.slots),
      }));
      setBroadcastStatuses((current) => ({
        ...current,
        ...createInitialBroadcastStatuses(newTab.group.slots),
      }));
      refreshWorkspaceRecords();
      activateTab(newTab);
      closeWorkspaceCreate();
      closeWorkspacePanel();
      closeNewTabModal();
    },
    [activateTab, closeNewTabModal, closeWorkspaceCreate, closeWorkspacePanel, refreshWorkspaceRecords, tabs.length, workspaceCreateName],
  );

  const openWorkspaceRename = React.useCallback((workspace: WorkspaceRecord) => {
    setWorkspaceRenameTarget(workspace);
    setWorkspaceRenameName(workspace.name);
    setWorkspaceRenameError('');
  }, []);

  const closeWorkspaceRename = React.useCallback(() => {
    setWorkspaceRenameTarget(null);
    setWorkspaceRenameName('');
    setWorkspaceRenameError('');
  }, []);

  const confirmWorkspaceRename = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!workspaceRenameTarget) {
        return;
      }

      const name = workspaceRenameName.trim();

      if (!name) {
        setWorkspaceRenameError('워크스테이션 이름을 입력하세요.');
        return;
      }

      const renamedWorkspace = workspaceRepository.rename(workspaceRenameTarget.id, name);

      if (!renamedWorkspace) {
        setWorkspaceRenameError('워크스테이션 이름을 바꿀 수 없습니다.');
        return;
      }

      setTabs((currentTabs) =>
        currentTabs.map((tab) =>
          tab.kind === 'workspace' && tab.workspaceId === renamedWorkspace.id ? { ...tab, title: renamedWorkspace.name } : tab,
        ),
      );
      refreshWorkspaceRecords();
      closeWorkspaceRename();
    },
    [closeWorkspaceRename, refreshWorkspaceRecords, workspaceRenameName, workspaceRenameTarget],
  );

  const handleWorkspaceDelete = React.useCallback(
    (workspace: WorkspaceRecord) => {
      const shouldDelete = window.confirm(`"${workspace.name}" 워크스테이션을 삭제할까요?`);

      if (!shouldDelete) {
        return;
      }

      workspaceRepository.remove(workspace.id);
      refreshWorkspaceRecords();

      const openTab = tabs.find((tab) => tab.kind === 'workspace' && tab.workspaceId === workspace.id);

      if (!openTab) {
        return;
      }

      if (tabs.length > 1) {
        closeTab(openTab.id);
        return;
      }

      cleanupTabSlotState(openTab.group.slots.map((slot) => slot.id));

      const blankGroup = createBlankGroup();
      const replacementTab = createGroupTab(blankGroup);

      setTabs([replacementTab]);
      setNavigationStates(createInitialNavigationStates(blankGroup.slots));
      setBroadcastStatuses(createInitialBroadcastStatuses(blankGroup.slots));
      activateTab(replacementTab);
    },
    [activateTab, cleanupTabSlotState, closeTab, refreshWorkspaceRecords, tabs],
  );

  const handleReturnToStage = React.useCallback(() => {
    setSidebarView(null);
    setMemoPanelOpen(false);
    setSettingsMenuOpen(false);
  }, []);

  const closeSlot = React.useCallback((slotId: string) => {
    delete webviewRefs.current[slotId];
    delete webviewReadyRef.current[slotId];
    delete webviewRefCallbacks.current[slotId];
    delete webviewRefCallbackOwnerTabIdsRef.current[slotId];
    delete initialWebviewSrcBySlotIdRef.current[slotId];

    setGroup((currentGroup) => ({
      ...currentGroup,
      slots: currentGroup.slots.filter((slot) => slot.id !== slotId),
      stageIds: currentGroup.stageIds.filter((currentSlotId) => currentSlotId !== slotId),
      dockIds: currentGroup.dockIds.filter((currentSlotId) => currentSlotId !== slotId),
    }));
    setBroadcastStatuses((currentStatuses) => {
      const nextStatuses = { ...currentStatuses };
      delete nextStatuses[slotId];
      return nextStatuses;
    });
    clearSlotNavigationState(slotId);
    setMaximizedSlotId((currentMaximizedSlotId) => (currentMaximizedSlotId === slotId ? null : currentMaximizedSlotId));
    setActiveSlotId((currentActiveSlotId) => {
      if (currentActiveSlotId !== slotId) {
        return currentActiveSlotId;
      }

      const nextSlot = slots.find((slot) => slot.id !== slotId);
      return nextSlot?.id ?? '';
    });
  }, [clearSlotNavigationState, setGroup, slots]);

  const handleAddSlot = React.useCallback(() => {
    setAddWebSlotUrl('');
    setAddWebSlotMode('favorite');
    setAddSlotModalOpen(true);
  }, []);

  const handleConfirmAddSlot = React.useCallback((providerId: ProviderId) => {
    if (group.slots.length >= MAX_SLOTS) {
      return;
    }

    const newSlot = createNewSlot(providerId);

    setGroup((currentGroup) => {
      const goesToStage = currentGroup.stageIds.length < MAX_STAGE_SLOTS;

      return {
        ...currentGroup,
        slots: [...currentGroup.slots, newSlot],
        stageIds: goesToStage ? [...currentGroup.stageIds, newSlot.id] : currentGroup.stageIds,
        dockIds: goesToStage ? currentGroup.dockIds : [...currentGroup.dockIds, newSlot.id],
      };
    });
    setNavigationStates((current) => ({
      ...current,
      [newSlot.id]: { canGoBack: false, canGoForward: false, isDomReady: false },
    }));
    setBroadcastStatuses((current) => ({
      ...current,
      [newSlot.id]: { state: 'idle', message: 'Ready' },
    }));
    setAddSlotModalOpen(false);
  }, [group.slots.length, setGroup]);

  const handleConfirmAddWebSlot = React.useCallback((url: string) => {
    if (group.slots.length >= MAX_SLOTS) {
      setNavigationNotice('슬롯이 꽉 찼습니다.');
      return;
    }

    const resolvedUrl = resolveWebSlotInput(url);

    if (!resolvedUrl) {
      setNavigationNotice('올바른 주소나 검색어를 입력하세요.');
      return;
    }

    const newSlot = createNewWebSlot(resolvedUrl);

    if (!newSlot) {
      setNavigationNotice('올바른 주소나 검색어를 입력하세요.');
      return;
    }

    setGroup((currentGroup) => {
      const goesToStage = currentGroup.stageIds.length < MAX_STAGE_SLOTS;

      return {
        ...currentGroup,
        slots: [...currentGroup.slots, newSlot],
        stageIds: goesToStage ? [...currentGroup.stageIds, newSlot.id] : currentGroup.stageIds,
        dockIds: goesToStage ? currentGroup.dockIds : [...currentGroup.dockIds, newSlot.id],
      };
    });
    setNavigationStates((current) => ({
      ...current,
      [newSlot.id]: { canGoBack: false, canGoForward: false, isDomReady: false },
    }));
    setBroadcastStatuses((current) => ({
      ...current,
      [newSlot.id]: { state: 'idle', message: 'Ready' },
    }));
    setAddSlotModalOpen(false);
  }, [group.slots.length, setGroup]);

  const findFavoriteByUrl = React.useCallback((url: string): Favorite | undefined => {
    const normalizedUrl = normalizeWebUrl(url);

    if (!normalizedUrl) {
      return undefined;
    }

    return favorites.find((favorite) => favorite.url === normalizedUrl);
  }, [favorites]);

  const handleSaveFavorite = React.useCallback((currentUrl: string, title: string, folderId: string | null, existingId: string | undefined) => {
    const normalizedUrl = normalizeWebUrl(currentUrl);

    if (!normalizedUrl) {
      return;
    }

    const favoriteTitle = title.trim() || new URL(normalizedUrl).hostname;

    setFavorites((currentFavorites) => {
      if (existingId) {
        return currentFavorites.map((favorite) =>
          favorite.id === existingId ? { ...favorite, title: favoriteTitle, folderId, updatedAt: Date.now() } : favorite,
        );
      }

      return [createFavorite(normalizedUrl, favoriteTitle, folderId), ...currentFavorites];
    });
  }, []);

  const handleNavigateSlotToFavorite = React.useCallback((slotId: string, favorite: Favorite) => {
    const normalizedUrl = normalizeWebUrl(favorite.url);

    if (!normalizedUrl) {
      return;
    }

    webviewRefs.current[slotId]?.loadURL?.(normalizedUrl);
    setGroup((currentGroup) => ({
      ...currentGroup,
      slots: currentGroup.slots.map((slot) => (slot.id === slotId ? { ...slot, title: favorite.title } : slot)),
    }));
  }, [setGroup]);

  const handleToggleBookmarkBar = React.useCallback(() => {
    setBookmarkBarVisible((current) => !current);
  }, []);

  const handleCreateFavoriteFolder = React.useCallback((name: string) => {
    const folderName = name.trim();

    if (!folderName) {
      return;
    }

    setFavoriteFolders((currentFolders) => [...currentFolders, createFavoriteFolder(folderName)]);
  }, []);

  const handleRenameFavoriteFolder = React.useCallback((id: string, name: string) => {
    const folderName = name.trim();

    if (!folderName) {
      return;
    }

    setFavoriteFolders((currentFolders) =>
      currentFolders.map((folder) => (folder.id === id ? { ...folder, name: folderName } : folder)),
    );
  }, []);

  const handleDeleteFavoriteFolder = React.useCallback((id: string) => {
    if (!window.confirm('이 폴더를 삭제할까요? 즐겨찾기는 미분류로 이동합니다.')) {
      return;
    }

    setFavoriteFolders((currentFolders) => currentFolders.filter((folder) => folder.id !== id));
    setFavorites((currentFavorites) =>
      currentFavorites.map((favorite) => (favorite.folderId === id ? { ...favorite, folderId: null, updatedAt: Date.now() } : favorite)),
    );
    setFavoriteFilter((currentFilter) => (currentFilter === id ? 'all' : currentFilter));
  }, []);

  const handleDeleteFavorite = React.useCallback((id: string) => {
    setFavorites((currentFavorites) => currentFavorites.filter((favorite) => favorite.id !== id));
  }, []);

  const handleMoveFavoriteToFolder = React.useCallback((favoriteId: string, folderId: string | null) => {
    setFavorites((currentFavorites) =>
      currentFavorites.map((favorite) =>
        favorite.id === favoriteId ? { ...favorite, folderId, updatedAt: Date.now() } : favorite,
      ),
    );
  }, []);

  const handleOpenFavorite = React.useCallback((favorite: Favorite) => {
    if (group.slots.length >= MAX_SLOTS) {
      setNavigationNotice('슬롯이 꽉 찼습니다.');
      return;
    }

    const webSlot = createNewWebSlot(favorite.url);

    if (!webSlot) {
      setNavigationNotice('즐겨찾기 URL을 열 수 없습니다.');
      return;
    }

    const newSlot: WebSlot = {
      ...webSlot,
      title: favorite.title,
    };

    setGroup((currentGroup) => {
      const goesToStage = currentGroup.stageIds.length < MAX_STAGE_SLOTS;

      return {
        ...currentGroup,
        slots: [...currentGroup.slots, newSlot],
        stageIds: goesToStage ? [...currentGroup.stageIds, newSlot.id] : currentGroup.stageIds,
        dockIds: goesToStage ? currentGroup.dockIds : [...currentGroup.dockIds, newSlot.id],
      };
    });
    setNavigationStates((current) => ({
      ...current,
      [newSlot.id]: { canGoBack: false, canGoForward: false, isDomReady: false },
    }));
    setBroadcastStatuses((current) => ({
      ...current,
      [newSlot.id]: { state: 'idle', message: 'Ready' },
    }));
    setSidebarView(null);
  }, [group.slots.length, setGroup]);

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

    const sourceSlot = slots.find((slot): slot is ProviderSlot => isAiSlot(slot) && slot.providerId === memo.provider);

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

  const selectAllMemoProviders = React.useCallback(() => {
    setMemoResultsMinHeight(0);
    setSelectedMemoProviders([...DEFAULT_MEMO_PROVIDER_FILTERS]);
  }, []);

  const clearAllMemoProviders = React.useCallback(() => {
    setMemoResultsMinHeight(memoResultsRef.current?.getBoundingClientRect().height ?? 0);
    setSelectedMemoProviders([]);
  }, []);

  const toggleMemoProvider = React.useCallback((provider: MemoProviderFilter) => {
    setMemoResultsMinHeight(0);
    setSelectedMemoProviders((currentProviders) =>
      currentProviders.includes(provider)
        ? currentProviders.filter((currentProvider) => currentProvider !== provider)
        : [...currentProviders, provider],
    );
  }, []);

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
    if (!isAiSlot(slot)) {
      reloadSlot(slot.id);
      return;
    }

    webviewRefs.current[slot.id]?.loadURL?.(providerAdapters[slot.providerId].newChatUrl);
  }, [reloadSlot]);

  const handleWebSlotAddressSubmit = React.useCallback((slotId: string, url: string) => {
    const resolvedUrl = resolveWebSlotInput(url);

    if (!resolvedUrl) {
      setNavigationNotice('올바른 주소나 검색어를 입력하세요.');
      return;
    }

    try {
      webviewRefs.current[slotId]?.loadURL?.(resolvedUrl);
      setNavigationNotice('');
    } catch {
      setNavigationNotice('웹슬롯 주소를 열 수 없습니다.');
    }
  }, []);

  const sidebarPlaceholderTitle =
    sidebarView === 'prompt-library'
        ? '프롬프트 라이브러리 - 준비 중'
        : '';
  const workspacePanelOpen = sidebarView === 'workspace-panel' && !memoPanelOpen;
  const sidebarPlaceholderOpen = sidebarView === 'prompt-library' && !memoPanelOpen;
  const favoritesPanelOpen = sidebarView === 'favorites-panel' && !memoPanelOpen;
  const sidebarPageOpen = workspacePanelOpen || sidebarPlaceholderOpen || favoritesPanelOpen;
  const openedWorkspaceIds = new Set(tabs.flatMap((tab) => (tab.kind === 'workspace' ? [tab.workspaceId] : [])));
  const uncategorizedFavoriteCount = favorites.filter((favorite) => favorite.folderId === null).length;
  const filteredFavorites =
    favoriteFilter === 'all'
      ? favorites
      : favoriteFilter === 'uncategorized'
        ? favorites.filter((favorite) => favorite.folderId === null)
        : favorites.filter((favorite) => favorite.folderId === favoriteFilter);

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar" aria-label="Workspace sidebar">
        <div className="sidebar-header">
          <div className="brand">OMNI</div>
          <button
            className="sidebar-toggle"
            type="button"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            <span className="sidebar-toggle-icon" aria-hidden="true" />
          </button>
        </div>
        <nav className="workspace-list" aria-label="Global navigation">
          <button
            className="workspace-item"
            type="button"
            title="새그룹"
            onClick={handleNewGroupClick}
          >
            <span className="workspace-icon global-nav-icon" aria-hidden="true">
              +
            </span>
            <span className="workspace-label">새그룹</span>
          </button>
          <button
            className={`workspace-item ${sidebarView === 'workspace-panel' && !memoPanelOpen ? 'active' : ''}`}
            type="button"
            title="워크스페이스"
            onClick={() => handleSidebarViewSelect('workspace-panel')}
          >
            <span className="workspace-icon global-nav-icon" aria-hidden="true">
              ▤
            </span>
            <span className="workspace-label">워크스페이스</span>
          </button>
          <button
            className={`workspace-item ${sidebarView === 'prompt-library' && !memoPanelOpen ? 'active' : ''}`}
            type="button"
            title="프롬프트 라이브러리"
            onClick={() => handleSidebarViewSelect('prompt-library')}
          >
            <span className="workspace-icon global-nav-icon" aria-hidden="true">
              ✎
            </span>
            <span className="workspace-label">프롬프트 라이브러리</span>
          </button>
          <button
            className={`workspace-item ${sidebarView === 'favorites-panel' && !memoPanelOpen ? 'active' : ''}`}
            type="button"
            title="즐겨찾기"
            onClick={() => handleSidebarViewSelect('favorites-panel')}
          >
            <span className="workspace-icon global-nav-icon" aria-hidden="true">
              *
            </span>
            <span className="workspace-label">즐겨찾기</span>
          </button>
          <button
            className={`workspace-item ${memoPanelOpen ? 'active' : ''}`}
            type="button"
            title="메모"
            onClick={handleMemoPanelSelect}
          >
            <span className="workspace-icon global-nav-icon" aria-hidden="true">
              M
            </span>
            <span className="workspace-label">메모</span>
          </button>
        </nav>
        <div className="sidebar-account">
          {settingsMenuOpen && (
            <div className="settings-popover" role="dialog" aria-label={t('settings.title')}>
              <h2 className="settings-popover-title">{t('settings.title')}</h2>
              <label className="settings-field" htmlFor="settings-language">
                <span className="settings-field-label">{t('settings.language')}</span>
                <select id="settings-language" className="settings-select" value={selectedLanguage} onChange={handleLanguageChange}>
                  <option value="ko">{t('settings.korean')}</option>
                  <option value="en">{t('settings.english')}</option>
                </select>
              </label>
              <p className="settings-hint">{t('settings.languageHint')}</p>
            </div>
          )}
          <button
            className="account-avatar"
            type="button"
            aria-label="설정 열기"
            title="설정"
            onClick={() => setSettingsMenuOpen((open) => !open)}
          >
            Y
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar" aria-label="Workspace status">
          <div className="topbar-tabs" role="tablist" aria-label="Workspace tabs">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`topbar-tab ${activeTabId === tab.id ? 'active' : ''}`}
                role="tab"
                tabIndex={0}
                aria-selected={activeTabId === tab.id}
                onClick={() => activateTab(tab)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    activateTab(tab);
                  }
                }}
              >
                <span className="topbar-tab-title">{tab.title}</span>
                {tabs.length > 1 && (
                  <button
                    className="topbar-tab-close"
                    type="button"
                    aria-label={`${tab.title} 닫기`}
                    title="닫기"
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(tab.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        closeTab(tab.id);
                      }
                    }}
                  >
                    x
                  </button>
                )}
              </div>
            ))}
            <button
              className="topbar-tab topbar-tab-add"
              type="button"
              aria-label="새 탭 추가"
              title="새 탭 추가"
              disabled={tabs.length >= MAX_TABS}
              onClick={openNewTabModal}
            >
              +
            </button>
          </div>
          <div className="session-hint">Persistent session: {activeProvider?.partition ?? WEB_SLOT_PARTITION}</div>
          {activeTab.kind === 'group' && (
            <button className="topbar-workspace-action" type="button" onClick={openWorkspacePromotion}>
              Save as workstation
            </button>
          )}
        </header>

        {navigationNotice && (
          <div className="memo-notice" role="status">
            <span>{navigationNotice}</span>
            <button type="button" onClick={() => setNavigationNotice('')}>
              닫기
            </button>
          </div>
        )}

        {workspacePanelOpen && (
          <section className="workspace-panel-page" aria-label="워크스테이션 목록">
            <div className="workspace-panel-header">
              <button className="page-back-button" type="button" aria-label="Stage로 돌아가기" title="Stage로 돌아가기" onClick={handleReturnToStage}>
                ←
              </button>
              <div>
                <h2>워크스테이션</h2>
                <p>{workspaceRecords.length}개 저장됨</p>
              </div>
            </div>

            {workspacePanelNotice && (
              <div className="workspace-panel-notice" role="status">
                <span>{workspacePanelNotice}</span>
                <button type="button" onClick={() => setWorkspacePanelNotice('')}>
                  닫기
                </button>
              </div>
            )}

            {workspaceRepository.canCreate() && (
              <button className="workspace-create-card" type="button" onClick={openWorkspaceCreate}>
                <span className="workspace-create-icon" aria-hidden="true">
                  +
                </span>
                <span>
                  <span className="workspace-create-title">새 워크스테이션 만들기</span>
                  <span className="workspace-create-description">기본 3개 슬롯으로 새 작업 공간을 시작합니다.</span>
                </span>
              </button>
            )}

            {workspaceRecords.length === 0 ? (
              <div className="workspace-empty">아직 저장된 워크스테이션이 없습니다.</div>
            ) : (
              <div className="workspace-record-list">
                {workspaceRecords.map((workspace) => {
                  const isOpen = openedWorkspaceIds.has(workspace.id);
                  const isActive = activeTab.kind === 'workspace' && activeTab.workspaceId === workspace.id;
                  const isExpanded = expandedWorkspaceId === workspace.id;
                  const workspaceSlotsById = new Map(workspace.slots.map((slot) => [slot.id, slot]));
                  const workspaceStageSlots = workspace.stageIds.map((slotId) => workspaceSlotsById.get(slotId)).filter(Boolean) as Slot[];
                  const workspaceDockSlots = workspace.dockIds.map((slotId) => workspaceSlotsById.get(slotId)).filter(Boolean) as Slot[];
                  const renderWorkspacePreviewSlots = (previewSlots: Slot[]) =>
                    previewSlots.length > 0 ? (
                      <div className="workspace-preview-chip-list">
                        {previewSlots.map((slot) => {
                          const label = isAiSlot(slot) ? getProviderConfig(slot.providerId).label : slot.title;
                          const webIconUrl = slot.kind === 'web' ? getWebSlotIconUrl(slot.currentUrl) : '';

                          return (
                            <span key={slot.id} className="workspace-preview-chip">
                              {isAiSlot(slot) ? (
                                <ProviderIcon providerId={slot.providerId} label={label} />
                              ) : (
                                <img src={webIconUrl} alt="" aria-hidden="true" />
                              )}
                              <span className="workspace-preview-chip-text">
                                <span className="workspace-preview-provider">{label}</span>
                                <span className="workspace-preview-title">{slot.title}</span>
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="workspace-preview-empty">비어 있음</div>
                    );

                  return (
                    <article key={workspace.id} className={`workspace-record-card ${isActive ? 'active' : ''} ${isExpanded ? 'expanded' : ''}`}>
                      <div
                        className="workspace-record-summary"
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onClick={() => setExpandedWorkspaceId((currentId) => (currentId === workspace.id ? null : workspace.id))}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setExpandedWorkspaceId((currentId) => (currentId === workspace.id ? null : workspace.id));
                          }
                        }}
                      >
                      <div className="workspace-record-primary">
                        <div className="workspace-record-main">
                          <span className="workspace-record-title-row">
                            <span className="workspace-record-name">{workspace.name}</span>
                            {isExpanded && (
                              <button
                                className="workspace-open-button"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openWorkspaceTab(workspace);
                                }}
                              >
                                이동
                              </button>
                            )}
                          </span>
                          <span className="workspace-record-meta">
                            {workspace.slots.length} slots · {isActive ? '현재 탭' : isOpen ? '열려 있음' : '저장됨'}
                          </span>
                        </div>
                      </div>
                      <div className="workspace-record-actions">
                        <button
                          className="workspace-record-action"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openWorkspaceRename(workspace);
                          }}
                        >
                          이름 수정
                        </button>
                        <button
                          className="workspace-record-action danger"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleWorkspaceDelete(workspace);
                          }}
                        >
                          삭제
                        </button>
                      </div>
                      </div>
                      {isExpanded && (
                        <div className="workspace-record-preview">
                          <div className="workspace-preview-toolbar">
                            <span className="workspace-preview-title-main">구성 미리보기</span>
                          </div>
                          <div className="workspace-preview-section">
                            <div className="workspace-preview-section-title">Stage</div>
                            {renderWorkspacePreviewSlots(workspaceStageSlots)}
                          </div>
                          <div className="workspace-preview-section">
                            <div className="workspace-preview-section-title">Dock</div>
                            {renderWorkspacePreviewSlots(workspaceDockSlots)}
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {sidebarPlaceholderOpen && (
          <section className="sidebar-placeholder-page" aria-label={sidebarPlaceholderTitle}>
            <div className="sidebar-placeholder-inner">
              <button className="page-back-button" type="button" aria-label="Stage로 돌아가기" title="Stage로 돌아가기" onClick={handleReturnToStage}>
                ←
              </button>
              <div className="sidebar-placeholder-title">{sidebarPlaceholderTitle}</div>
            </div>
          </section>
        )}

        <section
          className={`webview-panel ${memoPanelOpen || sidebarPageOpen ? 'view-hidden' : ''}`}
          aria-label="Claude, ChatGPT, and Gemini webviews"
          aria-hidden={memoPanelOpen || sidebarPageOpen}
          onDragOver={handleStageContainerDragOver}
          onDrop={handleStageContainerDrop}
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
                    onClick={() =>
                      setGroup((currentGroup) => ({
                        ...currentGroup,
                        layoutMode: currentGroup.layoutMode === 'row' ? 'grid2x2' : 'row',
                      }))
                    }
                  >
                    {layoutMode === 'row' ? '▦' : '▤'}
                  </button>
                )}
              </div>
              <div
                className={`stage-grid ${isStageGrid ? 'grid2x2' : 'row'}`}
                style={stageGridStyle}
                onDragOver={handleStageContainerDragOver}
                onDrop={handleStageContainerDrop}
              >
                {stageIds.length === 0 && <div className="stage-empty">Open a docked slot to start.</div>}
                {tabs.flatMap((ownerTab) =>
                  ownerTab.group.slots.map((slot) => {
                    const provider = isAiSlot(slot) ? getProviderConfig(slot.providerId) : null;
                    const slotLabel = provider?.label ?? slot.title;
                    const partition = provider?.partition ?? WEB_SLOT_PARTITION;
                    const preload = isAiSlot(slot) && webviewCapturePreloadUrl?.startsWith('file:') ? webviewCapturePreloadUrl : undefined;
                    const isOwnerActive = ownerTab.id === activeTabId;
                    const ownerStageIds = ownerTab.group.stageIds;
                    const stageIndex = ownerStageIds.indexOf(slot.id);
                    const isInStage = stageIndex >= 0;
                    const isVisible = isOwnerActive && isInStage;
                    const isMaximized = isOwnerActive && maximizedSlotId === slot.id;
                    const navigationState = navigationStates[slot.id] ?? {
                      canGoBack: false,
                      canGoForward: false,
                      isDomReady: false,
                    };
                    initialWebviewSrcBySlotIdRef.current[slot.id] ??= slot.currentUrl;
                    const initialWebviewSrc = initialWebviewSrcBySlotIdRef.current[slot.id];

                    return (
                      <div
                        key={`${ownerTab.id}:${slot.id}`}
                        className={`provider-pane expanded ${slot.kind === 'web' && bookmarkBarVisible ? 'has-bookmark-bar' : ''} ${draggingSlotId === slot.id ? 'dragging' : ''} ${isMaximized ? 'maximized' : ''}`}
                        data-slot-id={slot.id}
                        onDragOver={(event) => handleSlotDragOver('stage', slot.id, event)}
                        onDrop={(event) => handleSlotDrop('stage', slot.id, event)}
                        style={{ display: isVisible ? undefined : 'none', order: isVisible ? stageIndex : undefined }}
                      >
                        <SlotHeader
                          kind={slot.kind}
                          providerId={isAiSlot(slot) ? slot.providerId : undefined}
                          label={slotLabel}
                          addressValue={slot.currentUrl}
                          onAddressSubmit={(url) => handleWebSlotAddressSubmit(slot.id, url)}
                          compact={ownerStageIds.length === MAX_STAGE_SLOTS && !isStageGrid}
                          canGoBack={navigationState.canGoBack}
                          canGoForward={navigationState.canGoForward}
                          onPointerDown={(event) => {
                            if (isVisible && !isMaximized) {
                              handleStageHeaderPointerDown(slot.id, event);
                            }
                          }}
                          onClickCapture={handleStageHeaderClickCapture}
                          onBack={() => goSlotBack(slot.id)}
                          onForward={() => goSlotForward(slot.id)}
                          onReload={() => reloadSlot(slot.id)}
                          favorite={slot.kind === 'web' ? findFavoriteByUrl(slot.currentUrl) : undefined}
                          favoriteFolders={favoriteFolders}
                          favorites={favorites}
                          bookmarkBarVisible={bookmarkBarVisible}
                          onToggleBookmarkBar={handleToggleBookmarkBar}
                          onSaveFavorite={(title, folderId) =>
                            handleSaveFavorite(slot.currentUrl, title, folderId, findFavoriteByUrl(slot.currentUrl)?.id)
                          }
                          onRemoveFavorite={() => {
                            const favorite = findFavoriteByUrl(slot.currentUrl);

                            if (favorite) {
                              handleDeleteFavorite(favorite.id);
                            }
                          }}
                          onSelectFavorite={(favorite) => handleNavigateSlotToFavorite(slot.id, favorite)}
                          onHome={() => startSlotNewChat(slot)}
                          isMaximized={isMaximized}
                          onToggleMaximize={() => {
                            setSidebarView(null);
                            setMemoPanelOpen(false);
                            setActiveSlotId(slot.id);
                            setMaximizedSlotId((currentMaximizedSlotId) => (currentMaximizedSlotId === slot.id ? null : slot.id));
                          }}
                          onClose={() => closeSlot(slot.id)}
                        />
                        {slot.kind === 'web' && bookmarkBarVisible && (
                          <BookmarkBar
                            favorites={favorites}
                            favoriteFolders={favoriteFolders}
                            onSelect={(favorite) => handleNavigateSlotToFavorite(slot.id, favorite)}
                          />
                        )}
                        <webview
                          className="provider-webview"
                          src={initialWebviewSrc}
                          partition={partition}
                          preload={preload}
                          data-omni-slot-kind={slot.kind}
                          allowpopups={'true' as unknown as boolean}
                          ref={getSlotWebviewRef(slot, ownerTab.id)}
                        />
                      </div>
                    );
                  }),
                )}
                {draggingSlotId && (
                  <div
                    className="stage-drop-overlay"
                    aria-hidden="true"
                    onDragOver={handleStageContainerDragOver}
                    onDrop={handleStageContainerDrop}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="webview-loading">Preparing workspace...</div>
          )}
        </section>

        <div className={`workspace-bottom ${memoPanelOpen || sidebarPageOpen ? 'view-hidden' : ''}`}>
          <div className="dock-row">
            {broadcastCollapsed && (
              <button
                className="broadcast-toggle dock-broadcast-toggle"
                type="button"
                aria-label="Expand broadcast bar"
                onClick={() => setBroadcastCollapsed(false)}
              >
                v
              </button>
            )}
            <section
              className={`dock ${dockMinimized ? 'minimized' : ''}`}
              aria-label="Dock"
              onDragOver={(event) => handleContainerDragOver('dock', event)}
              onDrop={(event) => handleContainerDrop('dock', event)}
            >
            <div className="dock-header">
              <div className="dock-title-row">
                <button
                  className="dock-toggle"
                  type="button"
                  title={dockMinimized ? 'Expand dock' : 'Minimize dock'}
                  aria-label={dockMinimized ? 'Expand dock' : 'Minimize dock'}
                  onClick={() =>
                    setGroup((currentGroup) => ({
                      ...currentGroup,
                      dockMinimized: !currentGroup.dockMinimized,
                    }))
                  }
                >
                  {dockMinimized ? '^' : 'v'}
                </button>
                <span className="dock-title">Dock</span>
                <span className="slot-counter">{slots.length}/{MAX_SLOTS}</span>
              </div>
            </div>
            <div className="dock-list">
              {dockSlots.map((slot) => {
                const label = isAiSlot(slot) ? getProviderConfig(slot.providerId).label : slot.title;
                const webIconUrl = slot.kind === 'web' ? getWebSlotIconUrl(slot.currentUrl) : '';

                return (
                  <div
                    key={slot.id}
                    className={`dock-chip ${draggingSlotId === slot.id ? 'dragging' : ''}`}
                    data-slot-id={slot.id}
                    role="button"
                    tabIndex={0}
                    draggable
                    title={`${label} - ${slot.title}`}
                    onDragStart={(event) => handleSlotDragStart(slot.id, event)}
                    onDragEnd={handleSlotDragEnd}
                    onDragOver={(event) => handleSlotDragOver('dock', slot.id, event)}
                    onDrop={(event) => handleSlotDrop('dock', slot.id, event)}
                    onClick={() => moveSlotToStage(slot.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        moveSlotToStage(slot.id);
                      }
                    }}
                  >
                    {isAiSlot(slot) ? (
                      <ProviderIcon providerId={slot.providerId} label={label} />
                    ) : (
                      <img src={webIconUrl} alt="" aria-hidden="true" />
                    )}
                    {!dockMinimized && (
                      <span className="dock-chip-text">
                        <span className="dock-chip-provider">{label}</span>
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
                ^
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
              <div className="memos-page-title-row">
                <button className="page-back-button" type="button" aria-label="Stage로 돌아가기" title="Stage로 돌아가기" onClick={handleReturnToStage}>
                  ←
                </button>
                <div>
                  <h1>Memos</h1>
                <p>채팅에서 저장한 메모와 직접 작성한 메모를 한곳에서 관리합니다.</p>
                </div>
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
                <div className="memo-grid">
                  {pinnedMemos.map((memo) => (
                    <MemoCard
                      key={memo.id}
                      memo={memo}
                      onOpenDetail={openMemoDetail}
                      onUpdate={updateMemo}
                      onCopy={copyMemo}
                      onDelete={deleteMemo}
                    />
                  ))}
                </div>
              ) : (
                <p className="memo-empty">고정된 메모가 없습니다.</p>
              )}
            </div>

            <div className="memo-section">
              <h3>메모</h3>
              <div className="memo-provider-filter" aria-label="메모 출처 필터">
                <button className="memo-filter-command" type="button" onClick={selectAllMemoProviders}>
                  모두 선택
                </button>
                <button className="memo-filter-command" type="button" onClick={clearAllMemoProviders}>
                  모두해제
                </button>
                <div className="memo-provider-filter-options">
                  {MEMO_PROVIDER_FILTER_OPTIONS.map((option) => {
                    const isSelected = selectedMemoProviders.includes(option.provider);

                    return (
                      <button
                        key={option.provider ?? 'private'}
                        className={`memo-provider-filter-button ${isSelected ? 'active' : ''}`}
                        type="button"
                        aria-pressed={isSelected}
                        title={option.label}
                        onClick={() => toggleMemoProvider(option.provider)}
                      >
                        {option.provider ? (
                          <ProviderIcon providerId={option.provider} label={option.label} />
                        ) : (
                          <span className="memo-private-filter-icon" aria-hidden="true">
                            P
                          </span>
                        )}
                        <span>{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div
                ref={memoResultsRef}
                className="memo-results"
                style={{ minHeight: memoResultsMinHeight || undefined }}
              >
                {filteredUnpinnedMemos.length > 0 ? (
                  <div className="memo-grid">
                    {filteredUnpinnedMemos.map((memo) => (
                      <MemoCard
                        key={memo.id}
                        memo={memo}
                        onOpenDetail={openMemoDetail}
                        onUpdate={updateMemo}
                        onCopy={copyMemo}
                        onDelete={deleteMemo}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="memo-empty">저장된 메모가 없습니다.</p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className={`favorites-manager ${favoritesPanelOpen ? '' : 'view-hidden'}`} aria-label="즐겨찾기">
          <div className="favorites-manager-header">
            <button className="page-back-button" type="button" aria-label="Stage로 돌아가기" title="Stage로 돌아가기" onClick={handleReturnToStage}>
              ←
            </button>
            <div>
              <h1>즐겨찾기</h1>
              <p>웹슬롯 즐겨찾기를 정리합니다.</p>
            </div>
            <button
              className="manual-memo-save"
              type="button"
              onClick={() => setFavoriteFolderModal({ mode: 'create', initialName: '' })}
            >
              새 폴더
            </button>
          </div>
          <div className="favorites-manager-body">
            <nav className="favorites-folder-list" aria-label="즐겨찾기 폴더">
              <button
                className={`favorites-folder-item ${favoriteFilter === 'all' ? 'active' : ''}`}
                type="button"
                onClick={() => setFavoriteFilter('all')}
              >
                전체 ({favorites.length})
              </button>
              <button
                className={`favorites-folder-item ${favoriteFilter === 'uncategorized' ? 'active' : ''}`}
                type="button"
                onClick={() => setFavoriteFilter('uncategorized')}
              >
                미분류 ({uncategorizedFavoriteCount})
              </button>
              {favoriteFolders.map((folder) => {
                const folderFavoriteCount = favorites.filter((favorite) => favorite.folderId === folder.id).length;

                return (
                  <div key={folder.id} className="favorites-folder-item-row">
                    <button
                      className={`favorites-folder-item ${favoriteFilter === folder.id ? 'active' : ''}`}
                      type="button"
                      onClick={() => setFavoriteFilter(folder.id)}
                    >
                      {folder.name} ({folderFavoriteCount})
                    </button>
                    <button
                      className="memo-action-button"
                      type="button"
                      title="이름수정"
                      onClick={() => setFavoriteFolderModal({ mode: 'rename', folderId: folder.id, initialName: folder.name })}
                    >
                      Edit
                    </button>
                    <button
                      className="memo-action-button danger"
                      type="button"
                      title="삭제"
                      onClick={() => handleDeleteFavoriteFolder(folder.id)}
                    >
                      x
                    </button>
                  </div>
                );
              })}
            </nav>
            <div className="favorites-grid-area">
              {filteredFavorites.length > 0 ? (
                <div className="memo-grid">
                  {filteredFavorites.map((favorite) => (
                    <FavoriteCard
                      key={favorite.id}
                      favorite={favorite}
                      folders={favoriteFolders}
                      onMoveFolder={(folderId) => handleMoveFavoriteToFolder(favorite.id, folderId)}
                      onDelete={() => handleDeleteFavorite(favorite.id)}
                    />
                  ))}
                </div>
              ) : (
                <p className="memo-empty">즐겨찾기가 없습니다</p>
              )}
            </div>
          </div>
        </section>

        {favoriteFolderModal && (
          <div className="add-slot-modal-backdrop" role="presentation" onMouseDown={() => setFavoriteFolderModal(null)}>
            <section
              className="add-slot-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="favorite-folder-modal-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <form
                onSubmit={(event) => {
                  event.preventDefault();

                  if (favoriteFolderModal.mode === 'create') {
                    handleCreateFavoriteFolder(favoriteFolderDraft);
                  } else if (favoriteFolderModal.folderId) {
                    handleRenameFavoriteFolder(favoriteFolderModal.folderId, favoriteFolderDraft);
                  }

                  setFavoriteFolderModal(null);
                }}
              >
                <header className="add-slot-modal-header">
                  <h2 id="favorite-folder-modal-title">
                    {favoriteFolderModal.mode === 'create' ? '새 폴더' : '이름수정'}
                  </h2>
                  <button className="add-slot-modal-close" type="button" aria-label="닫기" onClick={() => setFavoriteFolderModal(null)}>
                    ×
                  </button>
                </header>
                <input
                  type="text"
                  value={favoriteFolderDraft}
                  autoFocus
                  onChange={(event) => setFavoriteFolderDraft(event.target.value)}
                />
                <footer>
                  <button type="button" onClick={() => setFavoriteFolderModal(null)}>
                    취소
                  </button>
                  <button type="submit">확인</button>
                </footer>
              </form>
            </section>
          </div>
        )}

        {addSlotModalOpen && (
          <div className="add-slot-modal-backdrop" role="presentation" onMouseDown={() => setAddSlotModalOpen(false)}>
            <section
              className="add-slot-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-slot-modal-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header className="add-slot-modal-header">
                <h2 id="add-slot-modal-title">슬롯 추가</h2>
                <button className="add-slot-modal-close" type="button" aria-label="닫기" onClick={() => setAddSlotModalOpen(false)}>
                  ×
                </button>
              </header>
              <section>
                <div className="add-slot-provider-list">
                  {PROVIDERS.map((provider) => (
                    <button
                      key={provider.id}
                      className="add-slot-provider-button"
                      type="button"
                      onClick={() => handleConfirmAddSlot(provider.id)}
                    >
                      <ProviderIcon providerId={provider.id} label={provider.label} />
                      <span>{provider.label}</span>
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <h3>웹슬롯 추가</h3>
                <div>
                  <button
                    type="button"
                    className={`memo-filter-command ${addWebSlotMode === 'favorite' ? 'active' : ''}`}
                    onClick={() => setAddWebSlotMode('favorite')}
                  >
                    즐겨찾기에서 선택
                  </button>
                  <button
                    type="button"
                    className={`memo-filter-command ${addWebSlotMode === 'manual' ? 'active' : ''}`}
                    onClick={() => setAddWebSlotMode('manual')}
                  >
                    직접 입력
                  </button>
                </div>
                {addWebSlotMode === 'favorite' ? (
                  favorites.length === 0 ? (
                    <p className="memo-empty">저장된 즐겨찾기가 없습니다</p>
                  ) : (
                    <div className="memo-grid">
                      {favorites.map((favorite) => {
                        const iconUrl = getWebSlotIconUrl(favorite.url);

                        return (
                          <button
                            key={favorite.id}
                            className="add-slot-provider-button"
                            type="button"
                            onClick={() => {
                              handleOpenFavorite(favorite);
                              setAddSlotModalOpen(false);
                            }}
                          >
                            {iconUrl && <img src={iconUrl} alt="" aria-hidden="true" />}
                            <span>{favorite.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleConfirmAddWebSlot(addWebSlotUrl);
                    }}
                  >
                    <input
                      type="text"
                      value={addWebSlotUrl}
                      placeholder="주소 또는 검색어 입력"
                      onChange={(event) => setAddWebSlotUrl(event.target.value)}
                    />
                    <button type="submit">추가</button>
                  </form>
                )}
              </section>
            </section>
          </div>
        )}

        {newTabModalOpen && (
          <div className="new-tab-modal-backdrop" role="presentation" onMouseDown={closeNewTabModal}>
            <section
              className="new-tab-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-tab-modal-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header className="new-tab-modal-header">
                <h2 id="new-tab-modal-title">새 탭 추가</h2>
                <button className="new-tab-modal-close" type="button" aria-label="닫기" onClick={closeNewTabModal}>
                  x
                </button>
              </header>
              <div className="new-tab-choice-list">
                <button className="new-tab-choice-button" type="button" onClick={handleCreateGroupTab}>
                  <span className="new-tab-choice-icon" aria-hidden="true">
                    +
                  </span>
                  <span>
                    <span className="new-tab-choice-title">새그룹</span>
                    <span className="new-tab-choice-description">기본 3개 슬롯으로 독립 그룹 탭을 추가합니다.</span>
                  </span>
                </button>
                <button className="new-tab-choice-button" type="button" onClick={handleWorkspaceTabPlaceholder}>
                  <span className="new-tab-choice-icon" aria-hidden="true">
                    W
                  </span>
                  <span>
                    <span className="new-tab-choice-title">워크스페이스</span>
                    <span className="new-tab-choice-description">저장된 워크스테이션을 탭으로 엽니다.</span>
                  </span>
                </button>
              </div>
              {newTabWorkspaceListOpen && (
                <div className="new-tab-workspace-list-panel">
                  {workspaceRepository.canCreate() && (
                    <button className="workspace-create-card new-tab-workspace-create-card" type="button" onClick={openWorkspaceCreate}>
                      <span className="workspace-create-icon" aria-hidden="true">
                        +
                      </span>
                      <span>
                        <span className="workspace-create-title">새 워크스테이션 만들기</span>
                        <span className="workspace-create-description">기본 슬롯으로 새 작업 공간을 시작합니다.</span>
                      </span>
                    </button>
                  )}

                  {workspaceRecords.length === 0 ? (
                    <div className="workspace-empty new-tab-workspace-empty">아직 저장된 워크스테이션이 없습니다</div>
                  ) : (
                    <div className="workspace-record-list new-tab-workspace-record-list">
                      {workspaceRecords.map((workspace) => {
                        const isOpen = openedWorkspaceIds.has(workspace.id);
                        const isActive = activeTab.kind === 'workspace' && activeTab.workspaceId === workspace.id;

                        return (
                          <button
                            key={workspace.id}
                            className={`workspace-record-card new-tab-workspace-record-card ${isActive ? 'active' : ''}`}
                            type="button"
                            onClick={() => {
                              openWorkspaceTab(workspace);
                              closeNewTabModal();
                            }}
                          >
                            <span className="workspace-record-name">{workspace.name}</span>
                            <span className="workspace-record-meta">
                              {workspace.slots.length} slots · {isActive ? '현재 탭' : isOpen ? '열려 있음' : '저장됨'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}

        {workspaceCreateOpen && (
          <div className="workspace-promotion-backdrop" role="presentation" onMouseDown={closeWorkspaceCreate}>
            <section
              className="workspace-promotion-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="workspace-create-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <form onSubmit={confirmWorkspaceCreate}>
                <header className="workspace-promotion-header">
                  <h2 id="workspace-create-title">새 워크스테이션</h2>
                  <button className="workspace-promotion-close" type="button" aria-label="Close" onClick={closeWorkspaceCreate}>
                    x
                  </button>
                </header>
                <div className="workspace-promotion-body">
                  <label className="workspace-promotion-label" htmlFor="workspace-create-name">
                    이름
                  </label>
                  <input
                    id="workspace-create-name"
                    ref={workspaceCreateInputRef}
                    type="text"
                    className="workspace-promotion-input"
                    value={workspaceCreateName}
                    autoFocus
                    onChange={(event) => {
                      setWorkspaceCreateName(event.target.value);
                      setWorkspaceCreateError('');
                    }}
                  />
                  {workspaceCreateError && (
                    <div className="workspace-promotion-error" role="alert">
                      {workspaceCreateError}
                    </div>
                  )}
                </div>
                <footer className="workspace-promotion-footer">
                  <button className="workspace-promotion-secondary" type="button" onClick={closeWorkspaceCreate}>
                    취소
                  </button>
                  <button className="workspace-promotion-primary" type="submit">
                    만들기
                  </button>
                </footer>
              </form>
            </section>
          </div>
        )}

        {workspaceRenameTarget && (
          <div className="workspace-promotion-backdrop" role="presentation" onMouseDown={closeWorkspaceRename}>
            <section
              className="workspace-promotion-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="workspace-rename-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <form onSubmit={confirmWorkspaceRename}>
                <header className="workspace-promotion-header">
                  <h2 id="workspace-rename-title">이름 수정</h2>
                  <button className="workspace-promotion-close" type="button" aria-label="Close" onClick={closeWorkspaceRename}>
                    x
                  </button>
                </header>
                <div className="workspace-promotion-body">
                  <label className="workspace-promotion-label" htmlFor="workspace-rename-name">
                    이름
                  </label>
                  <input
                    id="workspace-rename-name"
                    ref={workspaceRenameInputRef}
                    type="text"
                    className="workspace-promotion-input"
                    value={workspaceRenameName}
                    autoFocus
                    onChange={(event) => {
                      setWorkspaceRenameName(event.target.value);
                      setWorkspaceRenameError('');
                    }}
                  />
                  {workspaceRenameError && (
                    <div className="workspace-promotion-error" role="alert">
                      {workspaceRenameError}
                    </div>
                  )}
                </div>
                <footer className="workspace-promotion-footer">
                  <button className="workspace-promotion-secondary" type="button" onClick={closeWorkspaceRename}>
                    취소
                  </button>
                  <button className="workspace-promotion-primary" type="submit">
                    저장
                  </button>
                </footer>
              </form>
            </section>
          </div>
        )}

        {workspacePromotionOpen && (
          <div className="workspace-promotion-backdrop" role="presentation" onMouseDown={closeWorkspacePromotion}>
            <section
              className="workspace-promotion-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="workspace-promotion-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <form onSubmit={confirmWorkspacePromotion}>
                <header className="workspace-promotion-header">
                  <h2 id="workspace-promotion-title">Save as workstation</h2>
                  <button className="workspace-promotion-close" type="button" aria-label="Close" onClick={closeWorkspacePromotion}>
                    x
                  </button>
                </header>
                <div className="workspace-promotion-body">
                  <label className="workspace-promotion-label" htmlFor="workspace-promotion-name">
                    Name
                  </label>
                  <input
                    id="workspace-promotion-name"
                    className="workspace-promotion-input"
                    value={workspacePromotionName}
                    autoFocus
                    onChange={(event) => {
                      setWorkspacePromotionName(event.target.value);
                      setWorkspacePromotionError('');
                    }}
                  />
                  {workspacePromotionError && (
                    <div className="workspace-promotion-error" role="alert">
                      {workspacePromotionError}
                    </div>
                  )}
                </div>
                <footer className="workspace-promotion-footer">
                  <button className="workspace-promotion-secondary" type="button" onClick={closeWorkspacePromotion}>
                    Cancel
                  </button>
                  <button className="workspace-promotion-primary" type="submit">
                    Save
                  </button>
                </footer>
              </form>
            </section>
          </div>
        )}

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

initI18n().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
