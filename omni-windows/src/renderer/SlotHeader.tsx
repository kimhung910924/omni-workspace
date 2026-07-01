import React from 'react';
import type { MouseEventHandler, PointerEventHandler } from 'react';
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
  onHome,
  isMaximized,
  onToggleMaximize,
  onClose,
  onPointerDown,
  onClickCapture,
}: SlotHeaderProps) {
  const [draft, setDraft] = React.useState(addressValue ?? '');

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
