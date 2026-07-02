import React from 'react';
import type { MouseEventHandler, PointerEventHandler } from 'react';
import type { Favorite, FavoriteFolder } from './features/favorites/types';
import type { ProviderId } from './providerUrlStore';
import { ProviderIcon } from './ProviderIcon';

type SlotHeaderProps = {
  kind: 'ai' | 'web';
  providerId?: ProviderId;
  label: string;
  addressValue?: string;
  onAddressSubmit?: (url: string) => void;
  compact?: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  favorite?: Favorite;
  favoriteFolders: FavoriteFolder[];
  favorites: Favorite[];
  onSaveFavorite: (title: string, folderId: string | null) => void;
  onRemoveFavorite: () => void;
  onSelectFavorite: (favorite: Favorite) => void;
  onHome: () => void;
  isMaximized: boolean;
  onToggleMaximize: () => void;
  onClose: () => void;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onClickCapture?: MouseEventHandler<HTMLDivElement>;
};

function ReloadIcon() {
  return (
    <svg className="slot-button-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M15.6 6.2A6.2 6.2 0 1 0 16 10" />
      <path d="M15.6 2.8v3.4h-3.4" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg className="slot-button-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.5 9.2 10 3.8l6.5 5.4" />
      <path d="M5.5 8.4v7.1h9V8.4" />
      <path d="M8.2 15.5v-4.2h3.6v4.2" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg className="slot-button-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7.5 4.5h-3v3" />
      <path d="M4.5 4.5 8 8" />
      <path d="M12.5 4.5h3v3" />
      <path d="M15.5 4.5 12 8" />
      <path d="M7.5 15.5h-3v-3" />
      <path d="M4.5 15.5 8 12" />
      <path d="M12.5 15.5h3v-3" />
      <path d="M15.5 15.5 12 12" />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg className="slot-button-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M8 4.5v3H5" />
      <path d="M8 7.5 4.5 4" />
      <path d="M12 4.5v3h3" />
      <path d="M12 7.5 15.5 4" />
      <path d="M8 15.5v-3H5" />
      <path d="M8 12.5 4.5 16" />
      <path d="M12 15.5v-3h3" />
      <path d="M12 12.5 15.5 16" />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="slot-button-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="m10 2.8 2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7-3.4-3.3 4.7-.7L10 2.8Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
      />
    </svg>
  );
}

export function SlotHeader({
  kind,
  providerId,
  label,
  addressValue,
  onAddressSubmit,
  compact = false,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onReload,
  favorite,
  favoriteFolders,
  favorites,
  onSaveFavorite,
  onRemoveFavorite,
  onSelectFavorite,
  onHome,
  isMaximized,
  onToggleMaximize,
  onClose,
  onPointerDown,
  onClickCapture,
}: SlotHeaderProps) {
  const [draft, setDraft] = React.useState(addressValue ?? '');
  const [starPopoverOpen, setStarPopoverOpen] = React.useState(false);
  const [favoriteTitleDraft, setFavoriteTitleDraft] = React.useState('');
  const [favoriteFolderDraft, setFavoriteFolderDraft] = React.useState<string | null>(null);
  const [kebabOpen, setKebabOpen] = React.useState(false);
  const [kebabView, setKebabView] = React.useState<'menu' | 'favorites'>('menu');

  React.useEffect(() => {
    setDraft(addressValue ?? '');
  }, [addressValue]);

  const submitAddress = React.useCallback(() => {
    onAddressSubmit?.(draft.trim());
  }, [draft, onAddressSubmit]);

  return (
    <div className={`slot-header ${compact ? 'compact' : ''}`} onPointerDown={onPointerDown} onClickCapture={onClickCapture}>
      <div className="slot-header-group slot-header-nav" aria-label={`${label} navigation`}>
        <button className="slot-icon-button" type="button" title="Back" aria-label={`${label} back`} disabled={!canGoBack} onClick={onBack}>
          {'<'}
        </button>
        <button
          className="slot-icon-button"
          type="button"
          title="Forward"
          aria-label={`${label} forward`}
          disabled={!canGoForward}
          onClick={onForward}
        >
          {'>'}
        </button>
        <button className="slot-icon-button" type="button" title="Reload" aria-label={`${label} reload`} onClick={onReload}>
          <ReloadIcon />
        </button>
      </div>

      <div className="slot-provider">
        {kind === 'web' ? (
          <input
            type="text"
            value={draft}
            aria-label={`${label} address`}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={submitAddress}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitAddress();
              }
            }}
          />
        ) : (
          <>
            {providerId && <ProviderIcon providerId={providerId} label={label} />}
            <span className="slot-provider-label">{label}</span>
          </>
        )}
      </div>

      <div className="slot-header-group slot-header-window" aria-label={`${label} slot actions`}>
        {kind === 'web' && (
          <>
            <div className="slot-favorite-container">
              <button
                className="slot-icon-button"
                type="button"
                title={favorite ? '즐겨찾기 수정' : '즐겨찾기에 추가'}
                aria-label={favorite ? `${label} 즐겨찾기 수정` : `${label} 즐겨찾기에 추가`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setStarPopoverOpen((currentOpen) => {
                    const nextOpen = !currentOpen;

                    if (nextOpen) {
                      setFavoriteTitleDraft(favorite?.title ?? label);
                      setFavoriteFolderDraft(favorite?.folderId ?? null);
                    }

                    return nextOpen;
                  });
                }}
              >
                <StarIcon filled={Boolean(favorite)} />
              </button>
              {starPopoverOpen && (
                <div className="slot-favorite-popover" onPointerDown={(event) => event.stopPropagation()}>
                  <div className="slot-favorite-popover-header">
                    <span>{favorite ? '즐겨찾기 수정' : '즐겨찾기 추가'}</span>
                    <button type="button" aria-label="닫기" onClick={() => setStarPopoverOpen(false)}>
                      ×
                    </button>
                  </div>
                  <input
                    type="text"
                    value={favoriteTitleDraft}
                    aria-label="즐겨찾기 제목"
                    onChange={(event) => setFavoriteTitleDraft(event.target.value)}
                  />
                  <select
                    value={favoriteFolderDraft ?? ''}
                    aria-label="즐겨찾기 폴더"
                    onChange={(event) => setFavoriteFolderDraft(event.target.value || null)}
                  >
                    <option value="">미분류</option>
                    {favoriteFolders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                  <div className="slot-favorite-popover-actions">
                    {favorite && (
                      <button
                        className="slot-favorite-delete"
                        type="button"
                        onClick={() => {
                          onRemoveFavorite();
                          setStarPopoverOpen(false);
                        }}
                      >
                        삭제
                      </button>
                    )}
                    <button
                      className="slot-favorite-done"
                      type="button"
                      onClick={() => {
                        onSaveFavorite(favoriteTitleDraft, favoriteFolderDraft);
                        setStarPopoverOpen(false);
                      }}
                    >
                      완료
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="slot-kebab-container">
              <button
                className="slot-icon-button"
                type="button"
                title="메뉴"
                aria-label={`${label} 메뉴`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setKebabOpen((currentOpen) => {
                    const nextOpen = !currentOpen;

                    if (nextOpen) {
                      setKebabView('menu');
                    }

                    return nextOpen;
                  });
                }}
              >
                ⋯
              </button>
              {kebabOpen && (
                <div className="slot-kebab-menu" onPointerDown={(event) => event.stopPropagation()}>
                  {kebabView === 'menu' ? (
                    <button className="slot-kebab-menu-item" type="button" onClick={() => setKebabView('favorites')}>
                      즐겨찾기에서 열기
                    </button>
                  ) : (
                    <div className="slot-kebab-favorites">
                      {favorites.length === 0 ? (
                        <div className="slot-kebab-empty">저장된 즐겨찾기가 없습니다</div>
                      ) : (
                        favorites.map((savedFavorite) => (
                          <button
                            key={savedFavorite.id}
                            className="slot-kebab-favorite-item"
                            type="button"
                            onClick={() => {
                              onSelectFavorite(savedFavorite);
                              setKebabOpen(false);
                            }}
                          >
                            {savedFavorite.title}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
        <button className="slot-icon-button" type="button" title="New chat" aria-label={`${label} new chat`} onClick={onHome}>
          <HomeIcon />
        </button>
        <button
          className="slot-icon-button"
          type="button"
          title={isMaximized ? '좁게 보기' : '넓게 보기'}
          aria-label={isMaximized ? `${label} 좁게 보기` : `${label} 넓게 보기`}
          onClick={onToggleMaximize}
        >
          {isMaximized ? <MinimizeIcon /> : <MaximizeIcon />}
        </button>
        <button className="slot-icon-button danger" type="button" title="Close" aria-label={`${label} close`} onClick={onClose}>
          x
        </button>
      </div>
    </div>
  );
}
