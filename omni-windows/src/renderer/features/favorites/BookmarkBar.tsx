import React from 'react';
import { createPortal } from 'react-dom';
import type { Favorite, FavoriteFolder } from './types';

type BookmarkBarProps = {
  favorites: Favorite[];
  favoriteFolders: FavoriteFolder[];
  onSelect: (favorite: Favorite) => void;
};

type BookmarkBarEntry =
  | { type: 'favorite'; favorite: Favorite }
  | { type: 'folder'; folder: FavoriteFolder };

const MORE_BUTTON_RESERVED_WIDTH = 44;

function getWebSlotIconUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  } catch {
    return '';
  }
}

export function BookmarkBar({ favorites, favoriteFolders, onSelect }: BookmarkBarProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const itemRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const [visibleCount, setVisibleCount] = React.useState<number>(Infinity);
  const [openFolderId, setOpenFolderId] = React.useState<string | null>(null);
  const [moreDropdownOpen, setMoreDropdownOpen] = React.useState(false);
  const [folderDropdownPosition, setFolderDropdownPosition] = React.useState<React.CSSProperties>({});
  const [moreDropdownPosition, setMoreDropdownPosition] = React.useState<React.CSSProperties>({});

  const entries = React.useMemo<BookmarkBarEntry[]>(() => {
    const uncategorizedEntries = favorites
      .filter((favorite) => favorite.folderId === null)
      .map((favorite) => ({ type: 'favorite' as const, favorite }));
    const folderEntries = favoriteFolders.map((folder) => ({ type: 'folder' as const, folder }));

    return [...uncategorizedEntries, ...folderEntries];
  }, [favoriteFolders, favorites]);

  const favoritesByFolderId = React.useMemo(() => {
    return favoriteFolders.reduce<Record<string, Favorite[]>>((favoriteMap, folder) => {
      favoriteMap[folder.id] = favorites.filter((favorite) => favorite.folderId === folder.id);
      return favoriteMap;
    }, {});
  }, [favoriteFolders, favorites]);

  const measureVisibleItems = React.useCallback(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const availableWidth = Math.max(container.clientWidth - MORE_BUTTON_RESERVED_WIDTH, 0);
    let usedWidth = 0;
    let nextVisibleCount = Infinity;
    const restoredDisplays: Array<[HTMLDivElement, string]> = [];

    itemRefs.current.forEach((item) => {
      if (item && item.style.display === 'none') {
        restoredDisplays.push([item, item.style.display]);
        item.style.display = '';
      }
    });

    for (let index = 0; index < entries.length; index += 1) {
      const item = itemRefs.current[index];
      const itemWidth = item?.offsetWidth ?? 0;

      if (usedWidth + itemWidth > availableWidth) {
        nextVisibleCount = index;
        break;
      }

      usedWidth += itemWidth;
    }

    restoredDisplays.forEach(([item, display]) => {
      item.style.display = display;
    });
    setVisibleCount(nextVisibleCount);
  }, [entries]);

  React.useLayoutEffect(() => {
    measureVisibleItems();
    const container = containerRef.current;

    if (!container) {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(() => {
      measureVisibleItems();
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [measureVisibleItems]);

  React.useEffect(() => {
    const handleDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target;

      if (
        !(target instanceof Element) ||
        (!target.closest('.bookmark-bar') &&
          !target.closest('.bookmark-bar-dropdown') &&
          !target.closest('.bookmark-bar-more-dropdown'))
      ) {
        setOpenFolderId(null);
        setMoreDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentMouseDown);
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown);
  }, []);

  if (favorites.length === 0 && favoriteFolders.length === 0) {
    return null;
  }

  const hiddenEntries = visibleCount === Infinity ? [] : entries.slice(visibleCount);
  const hasHiddenEntries = visibleCount !== Infinity && visibleCount < entries.length;

  const handleFavoriteSelect = (favorite: Favorite) => {
    onSelect(favorite);
    setOpenFolderId(null);
    setMoreDropdownOpen(false);
  };

  return (
    <div className="bookmark-bar" ref={containerRef}>
      {entries.map((entry, index) => {
        const hidden = index >= visibleCount;

        if (entry.type === 'favorite') {
          const iconUrl = getWebSlotIconUrl(entry.favorite.url);

          return (
            <div
              key={entry.favorite.id}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              className="bookmark-bar-entry"
              style={{ display: hidden ? 'none' : undefined }}
            >
              <button className="bookmark-bar-item" type="button" onClick={() => handleFavoriteSelect(entry.favorite)}>
                {iconUrl && <img src={iconUrl} alt="" aria-hidden="true" />}
                <span>{entry.favorite.title}</span>
              </button>
            </div>
          );
        }

        const folderFavorites = favoritesByFolderId[entry.folder.id] ?? [];

        return (
          <div
            key={entry.folder.id}
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            className="bookmark-bar-entry bookmark-bar-folder"
            style={{ display: hidden ? 'none' : undefined }}
          >
            <button
              className={`bookmark-bar-item bookmark-bar-folder-button ${openFolderId === entry.folder.id ? 'active' : ''}`}
              type="button"
              onClick={(event) => {
                const buttonRect = event.currentTarget.getBoundingClientRect();

                setMoreDropdownOpen(false);
                setFolderDropdownPosition({
                  top: buttonRect.bottom + 4,
                  left: buttonRect.left,
                });
                setOpenFolderId((currentFolderId) => (currentFolderId === entry.folder.id ? null : entry.folder.id));
              }}
            >
              <span>{entry.folder.name}</span>
            </button>
            {openFolderId === entry.folder.id &&
              createPortal(
                <div className="bookmark-bar-dropdown" style={folderDropdownPosition}>
                  {folderFavorites.length === 0 ? (
                    <div className="bookmark-bar-dropdown-item empty">비어 있음</div>
                  ) : (
                    folderFavorites.map((favorite) => (
                      <button
                        key={favorite.id}
                        className="bookmark-bar-dropdown-item"
                        type="button"
                        onClick={() => handleFavoriteSelect(favorite)}
                      >
                        {favorite.title}
                      </button>
                    ))
                  )}
                </div>,
                document.body,
              )}
          </div>
        );
      })}

      {hasHiddenEntries && (
        <div className="bookmark-bar-more">
          <button
            type="button"
            title="즐겨찾기 더보기"
            aria-label="즐겨찾기 더보기"
            onClick={(event) => {
              const buttonRect = event.currentTarget.getBoundingClientRect();

              setOpenFolderId(null);
              setMoreDropdownPosition({
                top: buttonRect.bottom + 4,
                left: Math.max(buttonRect.right - 220, 6),
              });
              setMoreDropdownOpen((currentOpen) => !currentOpen);
            }}
          >
            »
          </button>
          {moreDropdownOpen &&
            createPortal(
              <div className="bookmark-bar-more-dropdown" style={moreDropdownPosition}>
                {hiddenEntries.map((entry) => {
                  if (entry.type === 'favorite') {
                    return (
                      <button
                        key={entry.favorite.id}
                        className="bookmark-bar-dropdown-item"
                        type="button"
                        onClick={() => handleFavoriteSelect(entry.favorite)}
                      >
                        {entry.favorite.title}
                      </button>
                    );
                  }

                  const folderFavorites = favoritesByFolderId[entry.folder.id] ?? [];

                  return (
                    <div key={entry.folder.id} className="bookmark-bar-more-folder">
                      <div className="bookmark-bar-dropdown-item folder-label">{entry.folder.name}</div>
                      {folderFavorites.length === 0 ? (
                        <div className="bookmark-bar-dropdown-item nested empty">비어 있음</div>
                      ) : (
                        folderFavorites.map((favorite) => (
                          <button
                            key={favorite.id}
                            className="bookmark-bar-dropdown-item nested"
                            type="button"
                            onClick={() => handleFavoriteSelect(favorite)}
                          >
                            {favorite.title}
                          </button>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>,
              document.body,
            )}
        </div>
      )}
    </div>
  );
}
