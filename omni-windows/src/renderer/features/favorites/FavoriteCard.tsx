import type { Favorite, FavoriteFolder } from './types';

type FavoriteCardProps = {
  favorite: Favorite;
  folders: FavoriteFolder[];
  onMoveFolder: (folderId: string | null) => void;
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

export function FavoriteCard({ favorite, folders, onMoveFolder, onDelete }: FavoriteCardProps) {
  const iconUrl = getFavoriteIconUrl(favorite.url);

  return (
    <article className="memo-card">
      <div className="memo-card-meta">
        {iconUrl && <img src={iconUrl} alt="" aria-hidden="true" />}
        <span>{favorite.title}</span>
      </div>

      <div className="memo-card-body">
        <h4>{favorite.title}</h4>
        <p className="memo-preview">{favorite.url}</p>
      </div>

      <div className="memo-card-footer">
        <select value={favorite.folderId ?? ''} onChange={(event) => onMoveFolder(event.target.value || null)}>
          <option value="">미분류</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
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
