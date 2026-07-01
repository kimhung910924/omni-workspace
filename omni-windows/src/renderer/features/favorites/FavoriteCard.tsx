import type { Favorite } from './types';

type FavoriteCardProps = {
  favorite: Favorite;
  onOpen: () => void;
  onDelete: () => void;
};

function getFavoriteIconUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  } catch {
    return '';
  }
}

export function FavoriteCard({ favorite, onOpen, onDelete }: FavoriteCardProps) {
  const iconUrl = getFavoriteIconUrl(favorite.url);

  return (
    <article
      className="memo-card"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="memo-card-meta">
        {iconUrl && <img src={iconUrl} alt="" aria-hidden="true" />}
        <span>{favorite.title}</span>
      </div>

      <div className="memo-card-body">
        <h4>{favorite.title}</h4>
        <p className="memo-preview">{favorite.url}</p>
      </div>

      <div className="memo-card-footer">
        <span>{favorite.url}</span>
      </div>

      <div className="memo-actions" onClick={(event) => event.stopPropagation()}>
        <button
          className="memo-action-button danger"
          type="button"
          title="삭제"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          Delete
        </button>
      </div>
    </article>
  );
}
