import { ProviderIcon } from '../../ProviderIcon';
import type { Memo } from './types';
import { getSourceHint, getMemoProviderLabel, getMemoDisplayTitle, formatMemoDate } from './memoUtils';

type MemoCardProps = {
  memo: Memo;
  onOpenDetail: (memo: Memo) => void;
  onUpdate: (memoId: string, updater: (memo: Memo) => Memo) => void;
  onCopy: (content: string) => void | Promise<void>;
  onDelete: (memoId: string) => void;
};

export function MemoCard({ memo, onOpenDetail, onUpdate, onCopy, onDelete }: MemoCardProps) {
  const sourceHint = getSourceHint(memo);
  const providerLabel = getMemoProviderLabel(memo);

  return (
    <article
      className={`memo-card provider-${memo.provider ?? 'manual'}`}
      tabIndex={0}
      onClick={() => onOpenDetail(memo)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenDetail(memo);
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
            onUpdate(memo.id, (currentMemo) => ({
              ...currentMemo,
              pinned: !currentMemo.pinned,
              updatedAt: Date.now(),
            }))
          }
        >
          {memo.pinned ? 'Unpin' : 'Pin'}
        </button>
        <button className="memo-action-button" type="button" title="복사" onClick={() => void onCopy(memo.content)}>
          Copy
        </button>
        <button className="memo-action-button danger" type="button" title="??젣" onClick={() => onDelete(memo.id)}>
          Delete
        </button>
      </div>
    </article>
  );
}
